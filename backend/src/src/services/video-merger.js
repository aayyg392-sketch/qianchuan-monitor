/**
 * 视频混剪服务 v6 — 对标抖音爆款短视频
 *
 * v6 升级：
 * 1. 🎵 BGM背景音乐系统：支持多风格BGM + 智能音量控制
 * 2. 🎬 画面动效：缩放推入/拉远/左右微移（scale+crop表达式）
 * 3. ⚡ 节奏变速：hook加速、产品展示减速、CTA催促
 * 4. ✨ 字幕动画：逐行淡入、CTA放大变色、标签闪入
 * 5. 🎨 色彩增强：饱和度/对比度/亮度按片段类型调整
 * 6. 🔊 最终混音：loudnorm标准化 + BGM淡入淡出
 *
 * 保留 v5 核心：
 * - 三种音频模式（原声/TTS/静音）
 * - 智能转场时长
 * - 精确素材匹配 + 匹配质量检测
 */
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync, spawn } = require('child_process');
const logger = require('../logger');

const WORK_DIR = path.join(__dirname, '../../tmp/videos');
const OUTPUT_DIR = path.join(__dirname, '../../tmp/output');
const TTS_DIR = path.join(__dirname, '../../tmp/tts');
const BGM_DIR = path.join(__dirname, '../../tmp/bgm');

// 中文字体路径
const FONT_PATH = '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc';
const FONT_REGULAR = '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Medium.ttc';

// 确保目录存在
[WORK_DIR, OUTPUT_DIR, TTS_DIR, BGM_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ===================== BGM 系统 =====================

/**
 * BGM风格配置
 * 用户可上传BGM到 tmp/bgm/ 目录，按风格命名
 */
const BGM_STYLES = {
  rhythm: { name: '节奏动感', pattern: /rhythm|节奏|动感|beat/i, volume: 0.13 },
  gentle: { name: '舒缓清新', pattern: /gentle|舒缓|清新|soft/i, volume: 0.11 },
  energy: { name: '活力激昂', pattern: /energy|活力|激昂|hype/i, volume: 0.15 },
};

/**
 * 获取可用BGM文件列表
 */
function getAvailableBGMs() {
  try {
    const files = fs.readdirSync(BGM_DIR);
    return files
      .filter(f => /\.(mp3|aac|wav|m4a)$/i.test(f))
      .map(f => ({
        filename: f,
        path: path.join(BGM_DIR, f),
        style: detectBGMStyle(f)
      }));
  } catch(e) { return []; }
}

function detectBGMStyle(filename) {
  const lower = filename.toLowerCase();
  for (const [key, cfg] of Object.entries(BGM_STYLES)) {
    if (cfg.pattern.test(lower)) return key;
  }
  return 'rhythm'; // 默认节奏型
}

/**
 * 选择匹配风格的BGM
 */
function pickBGM(style) {
  const bgms = getAvailableBGMs();
  if (!bgms.length) return null;

  // 优先匹配指定风格
  if (style && style !== 'none') {
    const matched = bgms.find(b => b.style === style);
    if (matched) return matched;
  }

  // 默认返回第一个
  return bgms[0];
}

// ===================== TTS 配音模块 =====================

let ttsInstance = null;

async function getTTS() {
  if (ttsInstance) return ttsInstance;
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('zh-CN-XiaoxiaoNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    ttsInstance = tts;
    return tts;
  } catch (e) {
    logger.warn('[VideoMerger] TTS初始化失败: ' + e.message);
    return null;
  }
}

async function generateTTS(text, outputPath) {
  if (!text || !text.trim()) return null;
  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    if (stat.size > 1000) return outputPath;
  }
  try {
    const tts = await getTTS();
    if (!tts) return null;
    const tmpDir = outputPath + '_dir';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    await tts.toFile(tmpDir, text.trim());
    const audioFile = path.join(tmpDir, 'audio.mp3');
    if (fs.existsSync(audioFile)) {
      fs.renameSync(audioFile, outputPath);
      try { fs.rmdirSync(tmpDir); } catch(e) {}
      logger.info('[VideoMerger] TTS生成: "' + text.trim().slice(0, 20) + '..." → ' + path.basename(outputPath));
      return outputPath;
    }
    return null;
  } catch (e) {
    logger.warn('[VideoMerger] TTS生成失败: ' + e.message);
    return null;
  }
}

function getAudioDuration(filePath) {
  try {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, { timeout: 5000 });
    return parseFloat(result.toString().trim()) || 0;
  } catch(e) { return 0; }
}

// ===================== 基础工具函数 =====================

async function downloadVideo(url, filename) {
  const filePath = path.join(WORK_DIR, filename);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.size > 10000) return filePath;
  }
  try {
    const res = await axios.get(url, {
      responseType: 'stream', timeout: 120000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);
    await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
    logger.info('[VideoMerger] 下载完成: ' + filename);
    return filePath;
  } catch (e) {
    logger.error('[VideoMerger] 下载失败: ' + filename, { error: e.message });
    throw new Error('下载素材失败: ' + e.message);
  }
}

function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find(s => s.codec_type === 'video');
      const audio = metadata.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: parseFloat(metadata.format.duration) || 0,
        width: video ? video.width : 1080,
        height: video ? video.height : 1920,
        fps: video ? eval(video.r_frame_rate) : 30,
        hasAudio: !!audio
      });
    });
  });
}

// ===================== 文本处理 =====================

function escapeDrawText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\u2019")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;')
    .replace(/%/g, '%%');
}

function splitTextLines(text, maxCharsPerLine) {
  if (!text) return [];
  const max = maxCharsPerLine || 14;
  const lines = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= max) { lines.push(remaining); break; }
    let breakPos = -1;
    for (let i = Math.min(max, remaining.length) - 1; i >= max - 4 && i >= 0; i--) {
      if (/[，。！？、；：,.]/.test(remaining[i])) { breakPos = i + 1; break; }
    }
    if (breakPos <= 0) breakPos = max;
    lines.push(remaining.slice(0, breakPos));
    remaining = remaining.slice(breakPos);
  }
  return lines;
}

// ===================== v6新增：水印去除（裁剪法） =====================

/**
 * 去水印滤镜 — 裁剪掉上下边缘 + 左右微裁
 *
 * 千川/抖音素材水印特征：
 * - "xxxx原创 盗用必究" 文字水印，位置不固定
 * - 通常出现在画面顶部、底部、角落区域
 * - 抖音logo在右下角
 *
 * 策略：裁掉上5%、下9%、左右各2%的画面边缘
 * 然后缩放回目标分辨率，视觉上几乎无差异
 * 这样不管水印在上下左右哪个边缘都能去掉
 */
function getWatermarkCropFilter(w, h) {
  // 裁剪比例（可调）
  const cropTop = 0.08;    // 顶部裁8%（"达人口碑"等平台标识）
  const cropBottom = 0.05;  // 底部裁5%（底部小水印/logo，大面积字幕用遮罩覆盖）
  const cropLeft = 0.01;    // 左侧裁1%
  const cropRight = 0.01;   // 右侧裁1%

  const cropW = Math.round(w * (1 - cropLeft - cropRight));
  const cropH = Math.round(h * (1 - cropTop - cropBottom));
  const cropX = Math.round(w * cropLeft);
  const cropY = Math.round(h * cropTop);

  // crop裁掉边缘 → scale缩放回目标尺寸（会有极轻微拉伸，肉眼不可见）
  return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${w}:${h}`;
}

// ===================== v6新增：画面动效系统 =====================

/**
 * 根据片段类型决定画面动效
 * 返回需要插入vFilters链最前面的滤镜（在scale/pad之前先做crop动画）
 *
 * 原理：先放大画面10-15%，再用crop+表达式做动态裁剪 = 模拟推拉效果
 */
function getVisualEffect(segment, isFirst, isLast, w, h, duration) {
  const editNote = (segment.edit_note || '').toLowerCase();
  const content = (segment.content || '').toLowerCase();
  const visualEffect = (segment.visual_effect || '').toLowerCase();
  const keepAudio = !!segment.keep_original_audio;

  // 达人口播保持静止（避免影响原声内容的观看体验）
  if (keepAudio) return { preFilters: [], type: 'static' };

  let type = 'static';

  // 优先使用AI指定的动效
  if (visualEffect) {
    type = visualEffect;
  } else {
    // 自动推断动效类型
    if (isFirst || /hook|开头|吸引|冲击/.test(editNote)) {
      type = 'zoom_in';
    } else if (isLast || /cta|促销|结尾|引导|购买/.test(editNote)) {
      type = 'zoom_out';
    } else if (/产品|展示|亮相|质地|膏体/.test(editNote + content)) {
      type = 'slow_zoom';
    } else if (/对比|测试|效果|前后/.test(editNote + content)) {
      type = 'pan_lr';
    } else if (/使用|过程|上脸|按摩|冲水/.test(editNote + content)) {
      type = 'slow_zoom';
    } else {
      // 非特殊片段也加微动，避免完全静止
      type = 'micro_move';
    }
  }

  const preFilters = [];

  // FFmpeg 3.4 兼容方案：crop的w/h保持固定，只用x/y做位移动画（Ken Burns平移）
  // 原理：先scale放大 → 用固定w×h的crop窗口 → 平移crop位置 = 视觉上的推拉效果
  // 这样避免了crop动态改变w/h导致的 "Error reinitializing filters" 错误

  switch (type) {
    case 'zoom_in': {
      // 推入效果：从边缘平移到中心（观感=画面逐渐聚焦）
      const z = 1.12;
      const sW = Math.round(w * z);
      const sH = Math.round(h * z);
      const extraW = sW - w;
      const extraH = sH - h;
      // t=0时从左上角开始，t=duration时到中心
      const rxW = (extraW / 2 / duration).toFixed(2);
      const rxH = (extraH / 2 / duration).toFixed(2);
      preFilters.push(`scale=${sW}:${sH}`);
      preFilters.push(`crop=${w}:${h}:x=${rxW}*t:y=${rxH}*t`);
      break;
    }
    case 'zoom_out': {
      // 拉远效果：从中心平移到边缘（观感=画面逐渐展开）
      const z = 1.10;
      const sW = Math.round(w * z);
      const sH = Math.round(h * z);
      const extraW = sW - w;
      const extraH = sH - h;
      const halfW = Math.round(extraW / 2);
      const halfH = Math.round(extraH / 2);
      const rxW = (halfW / duration).toFixed(2);
      const rxH = (halfH / duration).toFixed(2);
      preFilters.push(`scale=${sW}:${sH}`);
      preFilters.push(`crop=${w}:${h}:x=${halfW}-${rxW}*t:y=${halfH}-${rxH}*t`);
      break;
    }
    case 'slow_zoom': {
      // 缓慢推入：轻微平移（观感=缓缓靠近）
      const z = 1.08;
      const sW = Math.round(w * z);
      const sH = Math.round(h * z);
      const extraW = sW - w;
      const extraH = sH - h;
      const rxW = (extraW / 2 / duration).toFixed(2);
      const rxH = (extraH / 2 / duration).toFixed(2);
      preFilters.push(`scale=${sW}:${sH}`);
      preFilters.push(`crop=${w}:${h}:x=${rxW}*t:y=${rxH}*t`);
      break;
    }
    case 'pan_lr': {
      // 左右摇摆
      const z = 1.06;
      const sW = Math.round(w * z);
      const sH = Math.round(h * z);
      const halfExW = Math.round((sW - w) / 2);
      const halfExH = Math.round((sH - h) / 2);
      preFilters.push(`scale=${sW}:${sH}`);
      preFilters.push(`crop=${w}:${h}:x=${halfExW}+sin(t*0.8)*${halfExW}:y=${halfExH}`);
      break;
    }
    case 'micro_move': {
      // 微移：极轻微平移避免完全静止
      const z = 1.04;
      const sW = Math.round(w * z);
      const sH = Math.round(h * z);
      const extraW = sW - w;
      const extraH = sH - h;
      const rxW = (extraW / 2 / duration).toFixed(2);
      const rxH = (extraH / 2 / duration).toFixed(2);
      preFilters.push(`scale=${sW}:${sH}`);
      preFilters.push(`crop=${w}:${h}:x=${rxW}*t:y=${rxH}*t`);
      break;
    }
    default:
      break;
  }

  return { preFilters, type };
}

// ===================== v6新增：智能变速 =====================

/**
 * 根据片段类型返回变速因子
 * 保留原声片段不变速（保持音视频同步）
 */
function getSpeedFactor(segment, isFirst, isLast) {
  if (segment.keep_original_audio) return 1.0; // 原声不变速

  const editNote = (segment.edit_note || '').toLowerCase();
  const content = (segment.content || '').toLowerCase();
  const pace = (segment.pace || '').toLowerCase();

  // AI指定的节奏优先
  if (pace === 'fast') return 1.05;
  if (pace === 'slow') return 0.93;

  // 自动推断
  if (isFirst || /hook|快切|吸引/.test(editNote)) return 1.05;
  if (/cta|促销|催促|立即/.test(editNote + content)) return 1.03;
  if (/产品.*展示|质地|膏体|亮相/.test(editNote + content)) return 0.96;
  if (/对比|效果|前后|测评/.test(editNote + content)) return 0.93;
  if (/使用.*过程|上脸|按摩/.test(editNote + content)) return 0.97;

  return 1.0;
}

// ===================== v6新增：色彩增强 =====================

/**
 * 根据片段类型返回色彩增强滤镜
 */
function getColorFilter(segment, isFirst, isLast) {
  if (segment.keep_original_audio) return ''; // 达人口播保持原色

  const editNote = (segment.edit_note || '').toLowerCase();
  const content = (segment.content || '').toLowerCase();
  const combined = editNote + ' ' + content;

  if (isFirst || /hook/.test(editNote)) {
    return 'eq=contrast=1.08:saturation=1.1'; // 开头高对比
  }
  if (isLast || /cta|促销/.test(editNote)) {
    return 'eq=contrast=1.06:saturation=1.08'; // 结尾微增强
  }
  if (/产品|展示|质地|膏体|泡沫/.test(combined)) {
    return 'eq=saturation=1.15:contrast=1.05:brightness=0.02'; // 产品展示饱和+提亮
  }
  if (/对比|效果|前后|测评/.test(combined)) {
    return 'eq=brightness=0.03:saturation=1.1:contrast=1.05'; // 效果对比提亮
  }
  if (/使用|过程|上脸|按摩/.test(combined)) {
    return 'eq=saturation=1.08:brightness=0.01'; // 使用过程微调
  }

  return 'eq=saturation=1.05'; // 默认微提饱和
}

// ===================== 核心裁剪函数（v6 - 爆款级） =====================

/**
 * 裁剪视频片段 — 三种音频模式 + 画面动效 + 字幕动画 + 色彩增强 + 变速
 */
function clipVideo(inputPath, startSec, durationSec, outputPath, opts = {}) {
  const w = opts.width || 1080;
  const h = opts.height || 1920;
  const isFirst = opts.isFirst || false;
  const isLast = opts.isLast || false;
  const speed = opts.speedFactor || 1.0;
  const narration = opts.narration || '';
  const editNote = opts.editNote || '';
  const content = opts.content || '';
  const ttsAudioPath = opts.ttsAudioPath || null;
  const keepOriginalAudio = opts.keepOriginalAudio || false;
  const segment = opts.segment || {};
  const fps = 30;

  // 智能转场时长
  let fadeInDur, fadeOutDur;
  if (isFirst) { fadeInDur = 0; }
  else if (durationSec >= 6) { fadeInDur = 0.4; }
  else if (durationSec >= 4) { fadeInDur = 0.3; }
  else { fadeInDur = 0.15; }

  if (isLast) { fadeOutDur = Math.min(1.0, durationSec * 0.15); }
  else if (durationSec >= 6) { fadeOutDur = 0.35; }
  else if (durationSec >= 4) { fadeOutDur = 0.25; }
  else { fadeOutDur = 0.15; }

  const actualDuration = durationSec / speed;

  // ========== v6: 画面动效（在scale/pad之前） ==========
  const { preFilters, type: effectType } = getVisualEffect(segment, isFirst, isLast, w, h, durationSec);

  // ========== 视频滤镜链 ==========
  const vFilters = [];

  // 0. 去水印（裁剪法：裁掉上下左右边缘的水印区域，再缩放回目标尺寸）
  // 先scale到目标尺寸 → crop裁边缘 → scale回目标尺寸
  vFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
  vFilters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`);
  vFilters.push(getWatermarkCropFilter(w, h));

  // 1. 画面动效（放大+动态裁剪模拟推拉）
  if (preFilters.length > 0) {
    vFilters.push(...preFilters);
    // 动效会改变尺寸，需要重新scale回目标分辨率
    vFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    vFilters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`);
  }

  // 2. 确保画面参数正确
  vFilters.push('setsar=1');

  // 3. v6: 色彩增强
  const colorFilter = getColorFilter(segment, isFirst, isLast);
  if (colorFilter) {
    vFilters.push(colorFilter);
  }

  // 4. 变速
  if (Math.abs(speed - 1.0) > 0.005) {
    vFilters.push(`setpts=${(1/speed).toFixed(4)}*PTS`);
  }

  // 4.5 遮罩覆盖：顶部平台标识 + 底部原始烧录字幕
  // 顶部纯黑遮罩覆盖"达人口碑"等平台UI（裁剪后残留的部分）
  const topMaskH = Math.round(h * 0.04);
  vFilters.push(`drawbox=x=0:y=0:w=iw:h=${topMaskH}:color=black:t=9999`);
  // 底部渐变遮罩覆盖原始烧录字幕（3层模拟渐变：透明→半透明→深色）
  const gradStart = Math.round(h * 0.70);
  const gradMid = Math.round(h * 0.75);
  const gradEnd = Math.round(h * 0.80);
  vFilters.push(`drawbox=x=0:y=${gradStart}:w=iw:h=${gradMid - gradStart}:color=black@0.25:t=9999`);
  vFilters.push(`drawbox=x=0:y=${gradMid}:w=iw:h=${gradEnd - gradMid}:color=black@0.5:t=9999`);
  vFilters.push(`drawbox=x=0:y=${gradEnd}:w=iw:h=${h - gradEnd}:color=black@0.75:t=9999`);

  // 5. v6: 字幕动画升级 — 逐行延迟淡入
  if (narration && narration.trim()) {
    // CTA片段用更大字号和金色
    const isCTA = isLast || /cta|促销|购买|下单/.test((editNote + content).toLowerCase());
    const fontSize = isCTA ? Math.round(w * 0.05) : Math.round(w * 0.042);
    const fontColor = isCTA ? '#FFD700' : 'white';
    const lineHeight = Math.round(fontSize * 1.5);
    const lines = splitTextLines(narration.trim(), isCTA ? 12 : 14);
    const totalTextH = lines.length * lineHeight;
    const baseY = Math.round(h * 0.78) - Math.round(totalTextH / 2);

    lines.forEach((line, idx) => {
      const escaped = escapeDrawText(line);
      const yPos = baseY + idx * lineHeight;
      const enableEnd = durationSec - 0.1;
      // v6: 逐行延迟出现（每行间隔0.25s）
      const baseDelay = keepOriginalAudio ? 0.5 : 0.2;
      const enableStart = baseDelay + idx * 0.25;

      // 主字幕（带黑色描边+阴影）
      vFilters.push(
        `drawtext=fontfile='${FONT_PATH}':text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=${isCTA ? 3 : 2}:bordercolor=black@0.85:shadowx=1:shadowy=1:shadowcolor=black@0.6:x=(w-text_w)/2:y=${yPos}:enable='between(t,${enableStart.toFixed(2)},${enableEnd.toFixed(2)})'`
      );
    });
  }

  // 6. 营销标签已移除（用户反馈不需要顶部标签）

  // 7. 画面淡入淡出
  if (fadeInDur > 0) {
    vFilters.push(`fade=t=in:st=0:d=${fadeInDur.toFixed(2)}`);
  }
  if (fadeOutDur > 0) {
    const fadeOutStart = Math.max(0, durationSec - fadeOutDur);
    vFilters.push(`fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur.toFixed(2)}`);
  }

  const audioMode = keepOriginalAudio ? '🔊原声' : (ttsAudioPath ? '🎤TTS' : '🔇无TTS');
  logger.info('[VideoMerger] clip ' + path.basename(outputPath) +
    ' ' + audioMode + ' 🧹去水印 🎬' + effectType +
    ' speed=' + speed.toFixed(2) +
    ' dur=' + durationSec.toFixed(1) + 's' +
    ' narr="' + (narration || '').slice(0, 15) + '"');

  // ========== 模式1：保留原声 ==========
  if (keepOriginalAudio) {
    const aFilters = [];
    aFilters.push('volume=1.3');
    const audioFadeIn = isFirst ? 0 : Math.min(fadeInDur, 0.3);
    const audioFadeOut = Math.min(fadeOutDur, 0.4);
    if (audioFadeIn > 0) aFilters.push(`afade=t=in:st=0:d=${audioFadeIn.toFixed(2)}`);
    if (audioFadeOut > 0) aFilters.push(`afade=t=out:st=${Math.max(0, durationSec - audioFadeOut).toFixed(2)}:d=${audioFadeOut.toFixed(2)}`);

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputPath)
        .setStartTime(startSec)
        .setDuration(actualDuration);
      if (vFilters.length) cmd = cmd.videoFilters(vFilters);
      if (aFilters.length) cmd = cmd.audioFilters(aFilters);
      cmd.outputOptions([
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
          '-r', String(fps), '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart', '-t', String(durationSec)
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => { logger.error('[VideoMerger] FFmpeg keep-audio error: ' + err.message); reject(err); })
        .run();
    });
  }

  // ========== 模式2：TTS配音 + 原声降为背景 ==========
  if (ttsAudioPath && fs.existsSync(ttsAudioPath)) {
    const vf = vFilters.join(',');
    const trimEnd = (durationSec - 0.05).toFixed(2);
    const complexFilter = [
      '[0:a]volume=0.10,afade=t=in:st=0:d=0.05,afade=t=out:st=' + Math.max(0, durationSec - 0.05).toFixed(2) + ':d=0.05[bg]',
      '[1:a]atrim=0:' + trimEnd + ',asetpts=PTS-STARTPTS,adelay=200|200,volume=1.2,afade=t=in:st=0:d=0.1,afade=t=out:st=' + Math.max(0, durationSec - 0.4).toFixed(2) + ':d=0.3[voice]',
      '[bg][voice]amix=inputs=2:duration=first:dropout_transition=0.5[aout]'
    ].join(';');

    return new Promise((resolve, reject) => {
      const args = [
        '-ss', String(startSec),
        '-t', String(actualDuration),
        '-i', inputPath,
        '-i', ttsAudioPath,
        '-filter_complex', complexFilter,
        '-vf', vf,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-r', String(fps), '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-t', String(durationSec),
        '-y', outputPath
      ];
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0) resolve(outputPath);
        else {
          logger.error('[VideoMerger] FFmpeg TTS mix error (code ' + code + '): ' + stderr.slice(-300));
          reject(new Error('ffmpeg TTS mix failed: ' + stderr.slice(-200)));
        }
      });
      proc.on('error', reject);
    });
  }

  // ========== 模式3：无TTS，保留原始音频 + 微淡 ==========
  const aFilters = [];
  if (Math.abs(speed - 1.0) > 0.005) {
    aFilters.push(`atempo=${speed.toFixed(4)}`);
  }
  const microFade = 0.08;
  if (!isFirst) aFilters.push(`afade=t=in:st=0:d=${microFade}`);
  aFilters.push(`afade=t=out:st=${Math.max(0, durationSec - microFade).toFixed(2)}:d=${microFade}`);

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .setStartTime(startSec)
      .setDuration(actualDuration);
    if (vFilters.length) cmd = cmd.videoFilters(vFilters);
    if (aFilters.length) cmd = cmd.audioFilters(aFilters);
    cmd.outputOptions([
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-r', String(fps), '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-t', String(durationSec)
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => { logger.error('[VideoMerger] FFmpeg error: ' + err.message); reject(err); })
      .run();
  });
}

// ===================== 营销标签提炼 =====================

function extractMarketingTag(narration, editNote, content, isFirst, isLast) {
  const nar = (narration || '').trim();
  const note = (editNote || '').trim();
  const cont = (content || '').trim();
  const combined = nar + ' ' + note + ' ' + cont;

  if (isLast) return '#限时优惠 点击下方立即购买';
  if (/下单|立减|送|礼品|福利|优惠/.test(nar)) return '#超值福利 限时特惠';

  if (isFirst) {
    if (/？/.test(nar)) {
      const hookText = nar.split('？')[0].replace(/[！。，]/g, '');
      if (hookText.length >= 4 && hookText.length <= 16) return '#' + hookText;
    }
    if (/换季|敏感/.test(combined)) return '#换季护肤 敏感肌必看';
    if (/洁面|洗面|氨基酸/.test(combined)) return '#洁面选对 护肤事半功倍';
    return '#好物实测 真实分享';
  }

  if (/皂基|错误示范/.test(combined)) return '#你还在用皂基洁面吗';
  if (/氨基酸/.test(combined) && /泡沫|柔|软|云朵/.test(combined)) return '#氨基酸泡沫 温和清洁';
  if (/弱酸|pH/.test(combined)) return '#弱酸配方 亲肤不刺激';
  if (/水润|不紧绷|不拔干/.test(combined)) return '#洗后水润不紧绷';
  if (/控油|黑头|毛孔/.test(combined)) return '#深层清洁 控油不拔干';
  if (/早[起高]|出门|清爽|早晨/.test(combined)) return '#晨间清洁 清爽出门';
  if (/运动|健身|汗/.test(combined)) return '#运动后 温和洁面';
  if (/加班|夜[间晚]|晚上/.test(combined)) return '#夜间护肤 安心入睡';
  if (/对比|测试|数[值据]|仪器|上升/.test(combined)) return '#真实测评 效果看得见';
  if (/总结|推荐|收益|三场景/.test(combined)) return '#真实体验 良心推荐';

  return '';
}

// ===================== 拼接 =====================

function concatVideos(clipPaths, outputPath) {
  const listFile = path.join(WORK_DIR, 'concat_' + Date.now() + '.txt');
  const content = clipPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(listFile, content);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .output(outputPath)
      .on('end', () => { try { fs.unlinkSync(listFile); } catch(e) {} resolve(outputPath); })
      .on('error', () => {
        logger.warn('[VideoMerger] concat copy failed, fallback to re-encode');
        ffmpeg()
          .input(listFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'])
          .output(outputPath)
          .on('end', () => { try { fs.unlinkSync(listFile); } catch(e) {} resolve(outputPath); })
          .on('error', (err2) => { try { fs.unlinkSync(listFile); } catch(e) {} reject(err2); })
          .run();
      })
      .run();
  });
}

// ===================== v6新增：BGM混音 =====================

/**
 * 最终阶段：将BGM与混剪视频混合
 * - 音量标准化（loudnorm）
 * - BGM淡入1.5s + 淡出2s
 * - 视频流直接copy不重编码
 */
function mixBGM(videoPath, bgmPath, outputPath, bgmVolume = 0.13) {
  return new Promise((resolve, reject) => {
    // 先获取视频时长
    getVideoInfo(videoPath).then(info => {
      const duration = info.duration;
      const fadeOutStart = Math.max(0, duration - 2).toFixed(2);

      const complexFilter = [
        // 主音轨标准化
        '[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[norm]',
        // BGM：音量调整 + 循环裁剪 + 淡入淡出
        `[1:a]volume=${bgmVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2,atrim=0:${duration.toFixed(2)},asetpts=PTS-STARTPTS[bgm]`,
        // 混合
        '[norm][bgm]amix=inputs=2:duration=first:dropout_transition=0.5[aout]'
      ].join(';');

      const args = [
        '-i', videoPath,
        '-stream_loop', '-1', // 循环BGM直到视频结束
        '-i', bgmPath,
        '-filter_complex', complexFilter,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy', // 视频不重编码
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-movflags', '+faststart',
        '-shortest',
        '-y', outputPath
      ];

      logger.info('[VideoMerger] 🎵 混入BGM: ' + path.basename(bgmPath) + ' volume=' + bgmVolume);

      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          logger.error('[VideoMerger] BGM混音失败 (code ' + code + '): ' + stderr.slice(-300));
          // 失败不是致命的，返回原视频
          resolve(videoPath);
        }
      });
      proc.on('error', () => resolve(videoPath)); // 失败回退
    }).catch(() => resolve(videoPath));
  });
}

// ===================== 智能选材 =====================

function getSmartClipStart(srcDuration, segDuration, segIndex, totalSegs) {
  if (srcDuration <= segDuration) return 0;
  const maxStart = srcDuration - segDuration - 0.1;
  const position = totalSegs > 1 ? segIndex / (totalSegs - 1) : 0.5;

  let baseStart;
  if (position < 0.25) {
    baseStart = Math.random() * Math.max(0, srcDuration * 0.33 - segDuration);
  } else if (position > 0.75) {
    baseStart = srcDuration * 0.67 + Math.random() * Math.max(0, srcDuration * 0.33 - segDuration);
  } else {
    const midPoint = srcDuration * (0.25 + Math.random() * 0.5);
    baseStart = midPoint - segDuration / 2;
  }
  baseStart += (Math.random() - 0.5) * 0.6;
  // 修复：确保返回固定小数格式，避免科学计数法(如8.3e-17)导致FFmpeg报错
  const result = Math.max(0, Math.min(baseStart, maxStart));
  return parseFloat(result.toFixed(3));
}

/**
 * 智能选材 — 返回 { file, matchQuality }
 */
function pickSourceFile(segment, materialMap, availableFiles, lastUsedFile, segIndex) {
  const src = (segment.source || '').trim();
  const content = (segment.content || '').toLowerCase();

  if (src && materialMap[src]) {
    return { file: materialMap[src], matchQuality: 'exact' };
  }

  if (src && src.length > 2) {
    const fuzzyKey = Object.keys(materialMap).find(k =>
      k.includes(src) || src.includes(k) ||
      (k.length > 4 && src.length > 4 && k.slice(0, 6) === src.slice(0, 6))
    );
    if (fuzzyKey) {
      logger.info('[VideoMerger] 模糊匹配素材: "' + src + '" → "' + fuzzyKey + '"');
      return { file: materialMap[fuzzyKey], matchQuality: 'fuzzy' };
    }
  }

  const titleKeys = Object.keys(materialMap);
  for (const keyword of ['泡沫', '产品', '洁面', '洗面', '口播', '功效', 'KOC', '达人', '明星', '绿泥']) {
    if (content.includes(keyword.toLowerCase())) {
      const match = titleKeys.find(k => k.toLowerCase().includes(keyword.toLowerCase()));
      if (match && materialMap[match] !== lastUsedFile) {
        logger.info('[VideoMerger] 关键词匹配素材: keyword="' + keyword + '" → "' + match + '" (请求: "' + src + '")');
        return { file: materialMap[match], matchQuality: 'keyword' };
      }
    }
  }

  const candidates = availableFiles.filter(f => f !== lastUsedFile);
  const fallbackFile = candidates.length > 0
    ? candidates[(segIndex + Math.floor(Math.random() * 3)) % candidates.length]
    : availableFiles[segIndex % availableFiles.length];
  logger.warn('[VideoMerger] ⚠️ 素材匹配失败，使用兜底: "' + src + '" → ' + path.basename(fallbackFile));
  return { file: fallbackFile, matchQuality: 'fallback' };
}

// ===================== 主混剪函数 =====================

async function mergePlan(plan, materialVideos) {
  const planId = plan.id;
  const timeline = plan.timeline || [];
  if (!timeline.length) throw new Error('方案时间轴为空');
  if (!materialVideos.length) throw new Error('没有可用的视频素材');

  logger.info('[VideoMerger] 开始混剪方案 #' + planId);

  const materialMap = {};
  materialVideos.forEach(m => { materialMap[m.title] = m; });

  const downloadedFiles = {};
  const neededSources = new Set();
  for (const seg of timeline) {
    const src = seg.source || '';
    if (src && src !== '原创拍摄' && src !== '新拍摄') neededSources.add(src);
  }

  for (const srcTitle of neededSources) {
    let matched = materialMap[srcTitle];
    if (!matched) {
      const key = Object.keys(materialMap).find(k => k.includes(srcTitle) || srcTitle.includes(k) || k.slice(0, 10) === srcTitle.slice(0, 10));
      if (key) matched = materialMap[key];
    }
    if (matched && matched.video_url) {
      try {
        const safeName = 'src_' + (matched.material_id || srcTitle.slice(0, 10).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')) + '.mp4';
        downloadedFiles[srcTitle] = await downloadVideo(matched.video_url, safeName);
      } catch (e) { logger.warn('[VideoMerger] 跳过素材: ' + srcTitle); }
    }
  }

  if (Object.keys(downloadedFiles).length === 0) {
    for (let i = 0; i < Math.min(3, materialVideos.length); i++) {
      const m = materialVideos[i];
      if (m.video_url) {
        try { downloadedFiles[m.title] = await downloadVideo(m.video_url, 'src_' + (m.material_id || i) + '.mp4'); } catch(e) {}
      }
    }
  }

  const availableFiles = Object.values(downloadedFiles);
  if (!availableFiles.length) throw new Error('没有可用的视频文件');

  const videoInfo = await getVideoInfo(availableFiles[0]);
  const targetW = videoInfo.width > videoInfo.height ? 1280 : 1080;
  const targetH = videoInfo.width > videoInfo.height ? 720 : 1920;

  const ttsFiles = {};
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].keep_original_audio) continue;
    const nar = timeline[i].narration;
    if (nar && nar.trim()) {
      const ttsPath = path.join(TTS_DIR, `tts_${planId}_${i}.mp3`);
      ttsFiles[i] = await generateTTS(nar, ttsPath);
    }
  }

  const clipFiles = [];
  let lastUsedFile = null;

  for (let i = 0; i < timeline.length; i++) {
    const segment = timeline[i];
    const timeMatch = (segment.time || '').match(/(\d+\.?\d*)\s*[-~到]\s*(\d+\.?\d*)/);
    if (!timeMatch) continue;

    const segDuration = parseFloat(timeMatch[2]) - parseFloat(timeMatch[1]);
    if (segDuration <= 0) continue;

    const { file: srcFile, matchQuality } = pickSourceFile(segment, downloadedFiles, availableFiles, lastUsedFile, i);
    const srcInfo = await getVideoInfo(srcFile);
    const clipStart = getSmartClipStart(srcInfo.duration, segDuration, i, timeline.length);

    let isKeepAudio = !!segment.keep_original_audio;
    if (isKeepAudio && matchQuality !== 'exact') {
      logger.warn('[VideoMerger] 片段' + (i+1) + ' 素材匹配非精确(' + matchQuality + ')，强制关闭keep_original_audio → 改用TTS');
      isKeepAudio = false;
      if (!ttsFiles[i] && segment.narration && segment.narration.trim()) {
        const ttsPath = path.join(TTS_DIR, `tts_${planId}_${i}.mp3`);
        ttsFiles[i] = await generateTTS(segment.narration, ttsPath);
      }
    }

    const isFirst = i === 0;
    const isLast = i === timeline.length - 1;
    const speedFactor = getSpeedFactor(segment, isFirst, isLast);

    const clipPath = path.join(WORK_DIR, `clip_${planId}_${i}.mp4`);
    try {
      await clipVideo(srcFile, clipStart, segDuration, clipPath, {
        width: targetW, height: targetH,
        isFirst, isLast,
        speedFactor,
        narration: segment.narration || '', editNote: segment.edit_note || '', content: segment.content || '',
        marketingText: segment.marketing_text || '',
        keepOriginalAudio: isKeepAudio,
        ttsAudioPath: isKeepAudio ? null : (ttsFiles[i] || null),
        segment
      });
      clipFiles.push(clipPath);
      lastUsedFile = srcFile;
    } catch (e) {
      logger.warn('[VideoMerger] 片段裁剪失败: ' + segment.time, { error: e.message });
    }
  }

  if (!clipFiles.length) throw new Error('所有片段裁剪失败');

  const mergedFile = path.join(OUTPUT_DIR, `merged_${planId}_${Date.now()}.mp4`);
  await concatVideos(clipFiles, mergedFile);

  // v6: BGM混音
  let outputFile = mergedFile;
  const bgmStyle = plan.bgm_style || 'rhythm';
  if (bgmStyle !== 'none') {
    const bgm = pickBGM(bgmStyle);
    if (bgm) {
      const finalFile = mergedFile.replace('.mp4', '_bgm.mp4');
      outputFile = await mixBGM(mergedFile, bgm.path, finalFile, BGM_STYLES[bgm.style]?.volume || 0.13);
      if (outputFile !== mergedFile) {
        try { fs.unlinkSync(mergedFile); } catch(e) {}
      }
    }
  }

  // 清理
  for (const f of clipFiles) { try { fs.unlinkSync(f); } catch(e) {} }
  for (const f of Object.values(ttsFiles)) { if (f) try { fs.unlinkSync(f); } catch(e) {} }

  const outputInfo = await getVideoInfo(outputFile);
  logger.info('[VideoMerger] 混剪完成 #' + planId + ' 时长: ' + outputInfo.duration.toFixed(1) + 's');
  return outputFile;
}

/**
 * 本地素材混剪 v6 — 爆款级效果
 */
async function mergePlanLocal(plan, localVideos, onProgress) {
  const planId = plan.id;
  const timeline = plan.timeline || [];

  if (!timeline.length) throw new Error('方案时间轴为空');
  if (!localVideos.length) throw new Error('没有可用的本地素材视频');

  const log = (msg) => {
    logger.info('[VideoMerger] ' + msg);
    if (onProgress) onProgress(msg);
  };

  log('🎬 开始本地混剪方案 #' + planId + ': ' + plan.title);

  // 构建素材映射
  const materialMap = {};
  const availableFiles = [];
  const videoInfoCache = {};

  for (const m of localVideos) {
    const localPath = m.video_url;
    if (fs.existsSync(localPath)) {
      materialMap[m.title] = localPath;
      availableFiles.push(localPath);
    }
  }

  if (!availableFiles.length) throw new Error('没有可用的本地视频文件');
  log('共' + availableFiles.length + '个本地素材可用');

  for (const fp of availableFiles) {
    try { videoInfoCache[fp] = await getVideoInfo(fp); } catch(e) {}
  }

  const firstInfo = videoInfoCache[availableFiles[0]] || { width: 1080, height: 1920 };
  const targetW = firstInfo.width > firstInfo.height ? 1280 : 1080;
  const targetH = firstInfo.width > firstInfo.height ? 720 : 1920;

  log('目标分辨率: ' + targetW + 'x' + targetH);

  // ============ 第一步：批量生成TTS配音 ============
  log('🎤 生成TTS配音...');
  const ttsFiles = {};
  let ttsCount = 0;
  let keepAudioCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    if (seg.keep_original_audio) {
      keepAudioCount++;
      log(`片段 ${i+1}: 🔊 保留原声（${(seg.narration || '').slice(0, 15)}...）`);
      continue;
    }
    const nar = seg.narration;
    if (nar && nar.trim()) {
      const ttsPath = path.join(TTS_DIR, `tts_${planId}_${i}.mp3`);
      const result = await generateTTS(nar, ttsPath);
      if (result) { ttsFiles[i] = result; ttsCount++; }
    }
  }
  log('音频模式: TTS ' + ttsCount + '段 | 保留原声 ' + keepAudioCount + '段 | 共' + timeline.length + '段');

  // ============ 第二步：裁剪片段（v6全效果） ============
  const clipFiles = [];
  let lastUsedFile = null;
  const totalSegs = timeline.length;

  for (let i = 0; i < totalSegs; i++) {
    const segment = timeline[i];
    const timeRange = segment.time || '';
    const timeMatch = timeRange.match(/(\d+\.?\d*)\s*[-~到]\s*(\d+\.?\d*)/);
    if (!timeMatch) continue;

    const segStart = parseFloat(timeMatch[1]);
    const segEnd = parseFloat(timeMatch[2]);
    const segDuration = segEnd - segStart;
    if (segDuration <= 0) continue;

    const { file: srcFile, matchQuality } = pickSourceFile(segment, materialMap, availableFiles, lastUsedFile, i);
    const srcInfo = videoInfoCache[srcFile] || await getVideoInfo(srcFile);
    const clipStart = getSmartClipStart(srcInfo.duration, segDuration, i, totalSegs);

    const isFirst = (clipFiles.length === 0);
    const isLast = (i === totalSegs - 1);

    // 非精确匹配时禁止保留原声
    let isKeepAudio = !!segment.keep_original_audio;
    if (isKeepAudio && matchQuality !== 'exact') {
      log(`⚠️ 片段${i+1} 素材匹配非精确(${matchQuality})，"${segment.source}" → 强制改用TTS`);
      isKeepAudio = false;
      if (!ttsFiles[i] && segment.narration && segment.narration.trim()) {
        const ttsPath = path.join(TTS_DIR, `tts_${planId}_${i}.mp3`);
        const result = await generateTTS(segment.narration, ttsPath);
        if (result) { ttsFiles[i] = result; ttsCount++; }
      }
    }

    // v6: 智能变速
    const speedFactor = getSpeedFactor(segment, isFirst, isLast);

    const clipPath = path.join(WORK_DIR, `clip_${planId}_${i}.mp4`);
    try {
      const audioIcon = isKeepAudio ? '🔊原声' : (ttsFiles[i] ? '🎤TTS' : '🔇');
      const matchIcon = matchQuality === 'exact' ? '✅' : (matchQuality === 'fuzzy' ? '🔶' : '⚠️');
      const speedStr = Math.abs(speedFactor - 1.0) > 0.005 ? ` ⚡${speedFactor.toFixed(2)}x` : '';
      log(`裁剪片段 ${i+1}/${totalSegs} ${audioIcon}${matchIcon}${speedStr}: ${timeRange} [${segDuration}s] "${(segment.narration || '').slice(0, 12)}..."`);

      await clipVideo(srcFile, clipStart, segDuration, clipPath, {
        width: targetW,
        height: targetH,
        isFirst,
        isLast,
        speedFactor,
        narration: segment.narration || '',
        editNote: segment.edit_note || '',
        content: segment.content || '',
        marketingText: segment.marketing_text || '',
        keepOriginalAudio: isKeepAudio,
        ttsAudioPath: isKeepAudio ? null : (ttsFiles[i] || null),
        segment // v6: 传递完整segment给clipVideo
      });
      clipFiles.push(clipPath);
      lastUsedFile = srcFile;
    } catch (e) {
      logger.warn('[VideoMerger] 片段裁剪失败: ' + timeRange, { error: e.message });
    }
  }

  if (!clipFiles.length) throw new Error('所有片段裁剪失败');

  // ============ 第三步：拼接 ============
  log('📎 拼接' + clipFiles.length + '个片段...');
  const mergedFile = path.join(OUTPUT_DIR, `merged_${planId}_${Date.now()}.mp4`);
  await concatVideos(clipFiles, mergedFile);

  // ============ v6 第四步：BGM混音 ============
  let outputFile = mergedFile;
  const bgmStyle = plan.bgm_style || 'rhythm';
  if (bgmStyle !== 'none') {
    const bgm = pickBGM(bgmStyle);
    if (bgm) {
      log('🎵 混入BGM: ' + bgm.filename + ' (' + BGM_STYLES[bgm.style]?.name + ')');
      const finalFile = mergedFile.replace('.mp4', '_final.mp4');
      outputFile = await mixBGM(mergedFile, bgm.path, finalFile, BGM_STYLES[bgm.style]?.volume || 0.13);
      if (outputFile !== mergedFile) {
        try { fs.unlinkSync(mergedFile); } catch(e) {}
      }
    } else {
      log('⚠️ 未找到BGM文件，跳过BGM混音（可上传BGM到 tmp/bgm/ 目录）');
    }
  } else {
    log('🔇 用户选择无BGM');
  }

  // 清理临时文件
  for (const f of clipFiles) { try { fs.unlinkSync(f); } catch(e) {} }
  for (const f of Object.values(ttsFiles)) { if (f) try { fs.unlinkSync(f); } catch(e) {} }

  const outputInfo = await getVideoInfo(outputFile);
  log('✅ 混剪完成! 时长: ' + outputInfo.duration.toFixed(1) + 's | 片段: ' + clipFiles.length + ' | TTS: ' + ttsCount + '段 | BGM: ' + (bgmStyle !== 'none' ? '有' : '无') + ' | 分辨率: ' + targetW + 'x' + targetH);

  return outputFile;
}

function cleanupOldFiles() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  [WORK_DIR, TTS_DIR].forEach(dir => {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.startsWith('clip_') || file.startsWith('concat_') || file.startsWith('tts_')) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > maxAge) fs.unlinkSync(filePath);
        }
      }
    } catch(e) {}
  });
}

module.exports = {
  mergePlan, mergePlanLocal, downloadVideo, getVideoInfo,
  cleanupOldFiles, getAvailableBGMs,
  OUTPUT_DIR, BGM_DIR
};
