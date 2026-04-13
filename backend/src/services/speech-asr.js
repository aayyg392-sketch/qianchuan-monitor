/**
 * 直播话术ASR抓取服务
 *
 * 功能流程：
 * 1. 从抖音直播间获取FLV流地址（webcast API）
 * 2. 用ffmpeg从FLV流中每30秒提取一段音频（WAV，16kHz单声道）
 * 3. 调用ASR API进行语音转文字（支持多个后端：SiliconFlow SenseVoice / OpenAI Whisper）
 * 4. 对转写结果用Chat API分类（卖点讲解/逼单促单/福利发放/互动留人/产品介绍/其他）
 * 5. 将结果写入 live_speech_records 表
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');
const db = require('../db');
const logger = require('../logger');

// ============ 配置 ============
const WEB_RID = 'snefe66';
const DB_ROOM_ID = 1; // live_rooms 中 room_id=1 "雪玲妃官方旗舰店"
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SEGMENT_DURATION = 30; // 每段音频秒数
const FFMPEG_PATH = '/usr/bin/ffmpeg';
const TMP_DIR = path.join(os.tmpdir(), 'speech-asr');

// 自动添加分贝字段
(async () => {
  try {
    await db.query('ALTER TABLE live_speech_records ADD COLUMN mean_db DECIMAL(5,1) DEFAULT 0');
    await db.query('ALTER TABLE live_speech_records ADD COLUMN max_db DECIMAL(5,1) DEFAULT 0');
    logger.info('[SpeechASR] 分贝字段添加成功');
  } catch (e) { /* 已存在则忽略 */ }
})();

// API配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || '';
const ASR_PROVIDER = process.env.ASR_PROVIDER || 'auto'; // auto / siliconflow / openai_whisper

// 分类映射
const CATEGORY_MAP = {
  '卖点讲解': 'selling_point',
  '逼单促单': 'push_sale',
  '福利发放': 'welfare',
  '互动留人': 'interact',
  '产品介绍': 'product_intro',
  '其他': 'other',
};

// ============ 状态管理 ============
let isRunning = false;
let currentProcess = null;
let loopTimer = null;
let cachedTtwid = null;
let cachedTtwidAt = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;
let asrProviderStatus = { siliconflow: null, openai_whisper: null }; // null=未测试, true=可用, false=不可用

// ============ 工具函数 ============

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) { /* ignore */ }
}

function cleanupAllTmpFiles() {
  try {
    if (fs.existsSync(TMP_DIR)) {
      const files = fs.readdirSync(TMP_DIR);
      for (const f of files) {
        cleanupFile(path.join(TMP_DIR, f));
      }
    }
  } catch (e) { /* ignore */ }
}

// ============ 获取ttwid cookie ============
async function getTtwid() {
  if (cachedTtwid && Date.now() - cachedTtwidAt < 3600000) return cachedTtwid;
  try {
    const r = await axios.get('https://live.douyin.com/', {
      headers: { 'User-Agent': UA },
      timeout: 15000,
      maxRedirects: 5,
    });
    const cookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    cachedTtwid = cookies;
    cachedTtwidAt = Date.now();
    return cookies;
  } catch (e) {
    logger.warn('[SpeechASR] 获取ttwid失败', { error: e.message });
    return cachedTtwid || '';
  }
}

// ============ 获取FLV流地址 ============
async function getFlvStreamUrl() {
  const cookies = await getTtwid();
  const r = await axios.get('https://live.douyin.com/webcast/room/web/enter/', {
    params: {
      aid: 6383, app_name: 'douyin_web', live_id: 1, device_platform: 'web',
      language: 'zh-CN', browser_language: 'zh-CN', browser_platform: 'Win32',
      browser_name: 'Chrome', browser_version: '120.0.0.0', web_rid: WEB_RID,
    },
    headers: {
      'User-Agent': UA,
      'Referer': 'https://live.douyin.com/' + WEB_RID,
      'Cookie': cookies,
    },
    timeout: 15000,
  });

  const roomData = r.data?.data?.data?.[0] || r.data?.data?.room;
  if (!roomData) throw new Error('无法获取直播间数据');

  const isLiving = roomData.status === 2;
  if (!isLiving) {
    return { isLiving: false, flvUrl: null, title: roomData.title || '' };
  }

  const streamUrl = roomData.stream_url || {};
  const flvUrls = streamUrl.flv_pull_url || {};
  // 优先用低画质（SD1），减少带宽和处理开销
  const flvUrl = flvUrls.SD1 || flvUrls.HD1 || flvUrls.FULL_HD1 || Object.values(flvUrls)[0] || '';

  if (!flvUrl) throw new Error('直播中但未获取到FLV流地址');

  return { isLiving: true, flvUrl, title: roomData.title || '' };
}

// ============ ffmpeg提取音频段 ============
function extractAudioSegment(flvUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', flvUrl,
      '-t', String(SEGMENT_DURATION),
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      outputPath,
    ];

    const proc = spawn(FFMPEG_PATH, args, {
      timeout: (SEGMENT_DURATION + 30) * 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    currentProcess = proc;
    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      currentProcess = null;
      if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size < 5000) {
          reject(new Error('音频文件太小(' + stat.size + 'B)'));
        } else {
          resolve(outputPath);
        }
      } else {
        reject(new Error('ffmpeg退出码: ' + code + ', ' + stderr.slice(-200)));
      }
    });

    proc.on('error', (err) => {
      currentProcess = null;
      reject(new Error('ffmpeg启动失败: ' + err.message));
    });
  });
}

// ============ 音频分贝分析 ============
function analyzeVolume(audioPath) {
  return new Promise((resolve) => {
    const args = ['-i', audioPath, '-af', 'volumedetect', '-f', 'null', '-'];
    const proc = spawn(FFMPEG_PATH, args, { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', () => {
      // 提取 mean_volume 和 max_volume
      const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
      const mean = meanMatch ? parseFloat(meanMatch[1]) : null;
      const max = maxMatch ? parseFloat(maxMatch[1]) : null;
      // 转换为正数分贝（0dB基准 = 绝对最大，正常语音约 -20~-10dB）
      // 展示为0-100的分贝值更直观：dB+100 → 约70-90
      resolve({
        mean_db: mean !== null ? parseFloat((mean + 100).toFixed(1)) : 0,
        max_db: max !== null ? parseFloat((max + 100).toFixed(1)) : 0,
        raw_mean: mean || 0,
        raw_max: max || 0
      });
    });
    proc.on('error', () => resolve({ mean_db: 0, max_db: 0, raw_mean: 0, raw_max: 0 }));
  });
}

// ============ ASR方案1: SiliconFlow SenseVoice (推荐，中文效果最佳) ============
async function transcribeWithSiliconFlow(audioPath) {
  if (!SILICONFLOW_API_KEY) throw new Error('SILICONFLOW_API_KEY未配置');

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), {
    filename: 'audio.wav',
    contentType: 'audio/wav',
  });
  form.append('model', 'FunAudioLLM/SenseVoiceSmall');

  const resp = await axios.post(
    'https://api.siliconflow.cn/v1/audio/transcriptions',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer ' + SILICONFLOW_API_KEY,
      },
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
    }
  );
  return (typeof resp.data === 'string' ? resp.data : resp.data?.text || '').trim();
}

// ============ ASR方案2: OpenAI Whisper API ============
async function transcribeWithWhisper(audioPath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), {
    filename: 'audio.wav',
    contentType: 'audio/wav',
  });
  form.append('model', 'whisper-1');
  form.append('language', 'zh');
  form.append('response_format', 'text');

  const resp = await axios.post(
    OPENAI_BASE_URL.replace(/\/+$/, '') + '/audio/transcriptions',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
      },
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
    }
  );
  return (typeof resp.data === 'string' ? resp.data : resp.data?.text || '').trim();
}

// ============ ASR统一入口（自动选择可用后端） ============
async function transcribeAudio(audioPath) {
  const providers = [];

  if (ASR_PROVIDER === 'siliconflow') {
    providers.push({ name: 'siliconflow', fn: () => transcribeWithSiliconFlow(audioPath) });
  } else if (ASR_PROVIDER === 'openai_whisper') {
    providers.push({ name: 'openai_whisper', fn: () => transcribeWithWhisper(audioPath) });
  } else {
    // auto模式：根据配置和可用性自动选择
    if (SILICONFLOW_API_KEY && asrProviderStatus.siliconflow !== false) {
      providers.push({ name: 'siliconflow', fn: () => transcribeWithSiliconFlow(audioPath) });
    }
    if (OPENAI_API_KEY && asrProviderStatus.openai_whisper !== false) {
      providers.push({ name: 'openai_whisper', fn: () => transcribeWithWhisper(audioPath) });
    }
  }

  if (providers.length === 0) {
    throw new Error('无可用ASR后端。请配置 SILICONFLOW_API_KEY（推荐，免费中文ASR）或确保 OPENAI Whisper API 可用。详见 .env 配置');
  }

  let lastError = null;
  for (const provider of providers) {
    try {
      logger.info('[SpeechASR] 使用ASR后端: ' + provider.name);
      const text = await provider.fn();
      asrProviderStatus[provider.name] = true; // 标记可用
      return text;
    } catch (e) {
      lastError = e;
      logger.warn('[SpeechASR] ASR后端 ' + provider.name + ' 失败', {
        error: e.message,
        status: e.response?.status,
      });
      // 如果是认证/找不到等永久性错误，标记为不可用
      if (e.response?.status === 401 || e.response?.status === 403 || e.response?.status === 404) {
        asrProviderStatus[provider.name] = false;
        logger.warn('[SpeechASR] 已禁用ASR后端: ' + provider.name + ' (HTTP ' + e.response.status + ')');
      }
    }
  }
  throw lastError || new Error('所有ASR后端均失败');
}

// ============ 话术分类 (OpenAI Chat API) ============
async function classifySpeech(text) {
  if (!text || text.length < 5) return 'other';

  try {
    const resp = await axios.post(
      OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions',
      {
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一个直播话术分类专家。请将以下直播话术分类为以下类别之一，只回复类别名称，不要回复其他内容：
- 卖点讲解：介绍产品独特功能、优势、效果
- 逼单促单：催促下单、制造紧迫感、限时限量
- 福利发放：抽奖、优惠券、赠品、粉丝福利
- 互动留人：引导点赞关注、回答问题、聊天互动
- 产品介绍：产品基本信息、成分、规格、使用方法
- 其他：不属于以上任何类别`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 20,
      },
      {
        headers: {
          'Authorization': 'Bearer ' + OPENAI_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const reply = (resp.data?.choices?.[0]?.message?.content || '').trim();
    for (const [zhName, enName] of Object.entries(CATEGORY_MAP)) {
      if (reply.includes(zhName)) return enName;
    }
    return 'other';
  } catch (e) {
    logger.warn('[SpeechASR] 分类API调用失败', { error: e.message });
    return 'other';
  }
}

// ============ 保存到数据库 ============
async function saveRecord(text, category, volume = {}) {
  try {
    // 判断当前是否处于高转化时段：对比最近30分钟的订单增速
    const [recent] = await db.query(
      `SELECT a.order_count as cur, b.order_count as prev,
              a.order_count - b.order_count as delta_orders
       FROM live_realtime_data a
       JOIN live_realtime_data b ON b.room_id = a.room_id
         AND b.recorded_at <= DATE_SUB(a.recorded_at, INTERVAL 30 MINUTE)
       WHERE a.room_id = ?
       ORDER BY a.id DESC, b.id DESC LIMIT 1`,
      [DB_ROOM_ID]
    );

    // 对比前一个30分钟的增速判断是否高转化
    const [prevPeriod] = await db.query(
      `SELECT a.order_count - b.order_count as delta_orders
       FROM live_realtime_data a
       JOIN live_realtime_data b ON b.room_id = a.room_id
         AND b.recorded_at <= DATE_SUB(a.recorded_at, INTERVAL 30 MINUTE)
       WHERE a.room_id = ? AND a.recorded_at <= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
       ORDER BY a.id DESC, b.id DESC LIMIT 1`,
      [DB_ROOM_ID]
    );

    let isHighConvert = 0;
    if (recent.length && recent[0].delta_orders > 0) {
      const curSpeed = recent[0].delta_orders;
      const prevSpeed = prevPeriod.length ? prevPeriod[0].delta_orders : curSpeed;
      // 高转化：当前时段订单增速 > 前一时段的1.2倍，或每30分钟成交>50单
      isHighConvert = (curSpeed > prevSpeed * 1.2 || curSpeed >= 50) ? 1 : 0;
    }

    await db.query(
      `INSERT INTO live_speech_records (room_id, recorded_at, text_content, category, is_high_convert, mean_db, max_db) VALUES (?, NOW(), ?, ?, ?, ?, ?)`,
      [DB_ROOM_ID, text, category, isHighConvert, volume.mean_db || 0, volume.max_db || 0]
    );
    logger.info('[SpeechASR] 话术已保存', {
      category, high: isHighConvert ? '🔥高转化时段' : '-',
      preview: text.substring(0, 40),
    });
    return true;
  } catch (e) {
    logger.error('[SpeechASR] 保存失败', { error: e.message });
    return false;
  }
}

// ============ 单次采集循环 ============
async function processOneSegment() {
  const timestamp = Date.now();
  const audioPath = path.join(TMP_DIR, `asr_${timestamp}.wav`);

  try {
    // 1. 获取FLV流地址
    const { isLiving, flvUrl, title } = await getFlvStreamUrl();

    if (!isLiving) {
      logger.info('[SpeechASR] 直播间未开播，等待');
      consecutiveErrors = 0;
      return 'not_live';
    }

    logger.info('[SpeechASR] 直播中: ' + (title || '').substring(0, 30) + ', 录制' + SEGMENT_DURATION + '秒');

    // 2. ffmpeg提取音频
    await extractAudioSegment(flvUrl, audioPath);
    const stat = fs.statSync(audioPath);
    logger.info('[SpeechASR] 音频提取完成 ' + (stat.size / 1024).toFixed(0) + 'KB');

    // 3. 分析声音分贝
    const volume = await analyzeVolume(audioPath);
    logger.info('[SpeechASR] 音量: 均值' + volume.mean_db + 'dB 峰值' + volume.max_db + 'dB');

    // 4. ASR转写
    const text = await transcribeAudio(audioPath);

    if (!text || text.length < 3) {
      logger.info('[SpeechASR] 转写结果为空，跳过');
      return 'live_ok';
    }

    logger.info('[SpeechASR] 转写: ' + text.substring(0, 80));

    // 5. 分类
    const category = await classifySpeech(text);
    logger.info('[SpeechASR] 分类: ' + category);

    // 6. 保存（含分贝数据）
    await saveRecord(text, category, volume);

    consecutiveErrors = 0;
    return 'live_ok';
  } catch (e) {
    consecutiveErrors++;
    logger.error('[SpeechASR] 处理失败(' + consecutiveErrors + '/' + MAX_CONSECUTIVE_ERRORS + ')', {
      error: e.message,
    });

    // 如果所有ASR都不可用，给出明确提示
    if (e.message.includes('无可用ASR后端')) {
      logger.error('[SpeechASR] ========================================');
      logger.error('[SpeechASR] 所有ASR后端不可用！请配置以下任一ASR：');
      logger.error('[SpeechASR] 1. SiliconFlow（推荐）: 在 .env 中添加 SILICONFLOW_API_KEY=sk-xxx');
      logger.error('[SpeechASR]    注册地址: https://siliconflow.cn （有免费额度，SenseVoice中文ASR效果极佳）');
      logger.error('[SpeechASR] 2. OpenAI Whisper: 确保 OPENAI_BASE_URL 支持 /audio/transcriptions 端点');
      logger.error('[SpeechASR] ========================================');
    }

    return 'error';
  } finally {
    cleanupFile(audioPath);
  }
}

// ============ 主循环 ============
async function runLoop() {
  if (!isRunning) return;

  try {
    const result = await processOneSegment();

    if (!isRunning) return;

    switch (result) {
      case 'not_live':
        // 未开播，60秒后重试
        loopTimer = setTimeout(runLoop, 60000);
        break;
      case 'live_ok':
        // 成功或转写为空，短暂等待后继续（ffmpeg录制本身耗时30秒）
        loopTimer = setTimeout(runLoop, 2000);
        break;
      case 'error':
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error('[SpeechASR] 连续错误' + MAX_CONSECUTIVE_ERRORS + '次，180秒后重试');
          consecutiveErrors = 0;
          // 重置ASR状态让它重新探测
          asrProviderStatus = { siliconflow: null, openai_whisper: null };
          loopTimer = setTimeout(runLoop, 180000);
        } else {
          const wait = Math.min(consecutiveErrors * 10000, 60000);
          loopTimer = setTimeout(runLoop, wait);
        }
        break;
    }
  } catch (e) {
    logger.error('[SpeechASR] 主循环异常', { error: e.message });
    if (isRunning) {
      loopTimer = setTimeout(runLoop, 30000);
    }
  }
}

// ============ 启动 ============
async function startSpeechASR() {
  if (isRunning) {
    logger.warn('[SpeechASR] 服务已在运行');
    return;
  }

  logger.info('[SpeechASR] ======= 启动直播话术ASR采集服务 =======');
  isRunning = true;
  consecutiveErrors = 0;

  ensureTmpDir();
  cleanupAllTmpFiles();

  // 检查API配置
  if (SILICONFLOW_API_KEY) {
    logger.info('[SpeechASR] ASR后端: SiliconFlow SenseVoice (已配置)');
  } else {
    logger.warn('[SpeechASR] SILICONFLOW_API_KEY 未配置，SiliconFlow不可用');
  }
  if (OPENAI_API_KEY) {
    logger.info('[SpeechASR] ASR后端: OpenAI Whisper (尝试中...)');
  }
  if (!SILICONFLOW_API_KEY && !OPENAI_API_KEY) {
    logger.error('[SpeechASR] 警告: 无ASR API Key配置！服务将尝试启动但转写会失败');
    logger.error('[SpeechASR] 推荐配置 SILICONFLOW_API_KEY (免费注册: https://siliconflow.cn)');
  }

  runLoop();
}

// ============ 停止 ============
function stopSpeechASR() {
  logger.info('[SpeechASR] ======= 停止直播话术ASR采集服务 =======');
  isRunning = false;

  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }

  if (currentProcess) {
    try { currentProcess.kill('SIGTERM'); } catch (e) { /* ignore */ }
    currentProcess = null;
  }

  cleanupAllTmpFiles();
}

module.exports = { startSpeechASR, stopSpeechASR };
