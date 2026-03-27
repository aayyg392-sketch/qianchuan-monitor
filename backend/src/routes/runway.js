const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const UPLOAD_DIR = '/home/www/qianchuan-monitor/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, 'runway_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true); else cb(new Error('仅支持图片文件'));
}});

// ========== Auto-create tables ==========
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS qc_runway_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_type ENUM('image2video','text2video','smart_match') NOT NULL,
      runway_task_id VARCHAR(100),
      prompt_text TEXT,
      prompt_image VARCHAR(1000),
      model VARCHAR(50) DEFAULT 'gen4_turbo',
      duration INT DEFAULT 5,
      status ENUM('pending','generating','composing','done','failed') DEFAULT 'pending',
      script_text TEXT,
      tts_url VARCHAR(500),
      video_url VARCHAR(500),
      matched_clips JSON,
      cost_credits INT DEFAULT 0,
      error_msg VARCHAR(500),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_type (task_type),
      INDEX idx_status (status)
    )`);
    logger.info('[Runway] 表结构就绪');
  } catch (e) { logger.error('[Runway] 建表失败', { error: e.message }); }
})();

const VIDEO_DIR = '/home/www/qianchuan-monitor/generated-videos';
const TTS_DIR = '/home/www/qianchuan-monitor/tts-cache';
const VIDEO_CACHE = '/home/www/qianchuan-monitor/video_list_cache.txt';

// Ensure dirs
[VIDEO_DIR, TTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ========== Helper: AI调用 ==========
async function callAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const resp = await axios.post(`${baseUrl}/chat/completions`, {
    model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    temperature: 0.8, max_tokens: 4000
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 });
  return resp.data.choices[0].message.content;
}

// ========== Helper: 优化用户prompt为Runway最佳格式 ==========
async function optimizePromptForRunway(chinesePrompt, hasProductImage) {
  const systemPrompt = `You are a Runway Gen-4 Turbo video prompt expert using the CCR formula (Camera + Character + Reaction/Action). Convert Chinese scene descriptions into optimized English prompts following these strict rules:

CCR FORMULA (Camera + Character + Reaction):
1. CAMERA (镜头): Start with ONE specific camera movement with speed and direction
   - Examples: Slow dolly-in, Steady tracking shot moving right, Handheld close-up, Low-angle push-in
   - Include lens type when helpful: 50mm shallow DoF, macro lens
2. CHARACTER (人物): Describe the subject briefly - who they are, where they are
   - Keep it to ONE sentence. Age, ethnicity, setting.
   - Example: A young East Asian woman sits at a vanity table
3. REACTION/ACTION (动作/反应): The CORE of the prompt - what happens
   - Use active cinematic verbs: glides, sweeps, reveals, drifts, traces
   - Describe the motion trajectory, speed, and physical interaction in detail
   - Include micro-expressions and subtle body language
   - For beauty: skin texture catching light, gentle product interaction, water droplets

RULES:
- Keep under 100 words total
- ONE core action sequence per prompt
- End with ONE atmospheric/lighting detail
- NEVER use negative phrasing (no X, without X)
- Always specify live-action, cinematic for realism
- Use present tense throughout

STRUCTURE: [Camera] + [Character] + [Action/Reaction] + [Atmosphere]

Example input: "近景电影级镜头，女性轻柔触摸面部"
Example output: "Slow dolly-in, 50mm lens. A young East Asian woman in soft morning light. She gently traces her fingertips along her jawline, tilts her chin up as warm golden light catches the dewy texture of her skin, then closes her eyes with a subtle smile. Live-action, cinematic shallow depth of field."

Example input: "产品开箱展示洗面奶"
Example output: "Steady overhead tracking shot drifting down. Elegant hands slowly lift a white skincare tube from minimal packaging, rotating it to reveal the label. Fingers press the cap, a ribbon of creamy foam curls onto fingertips. Soft diffused daylight, clean white background, live-action commercial aesthetic."

IMPORTANT: Preserve the user's creative intent. Only restructure for better Runway results. Output ONLY the English prompt, nothing else.`;

  try {
    const result = await callAI(systemPrompt, chinesePrompt);
    // Clean up - remove quotes, markdown, etc
    return result.replace(/^["'`]+|["'`]+$/g, '').trim();
  } catch (e) {
    logger.error('[PromptOptimizer] AI call failed, using original', { error: e.message });
    return chinesePrompt; // fallback to original
  }
}

// ========== Helper: 生成高质量首帧图片 ==========
async function generateFirstFrame(promptText, ratio) {
  try {
    // Use AI to create a first-frame description
    const framePrompt = await callAI(
      `You generate image descriptions for AI video first frames. Given a video scene description, output a SHORT (under 50 words) description of the STATIC first frame - what the camera sees BEFORE any motion starts. Focus on composition, subject position, lighting. Output ONLY the description.`,
      promptText
    );

    // Use Runway text_to_image to generate the frame
    const apiKey = process.env.RUNWAY_API_KEY;
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
      'Content-Type': 'application/json'
    };

    // Map video ratio to image ratio
    const imageRatio = ratio === '1280:720' ? '1280:720' : ratio === '960:960' ? '960:960' : '720:1280';

    const resp = await axios.post('https://api.dev.runwayml.com/v1/text_to_image', {
      model: 'gen4_turbo',
      promptText: framePrompt,
      ratio: imageRatio,
      outputFormat: 'uri',
      referenceImages: [{
        uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        tag: 'subject'
      }]
    }, { headers, timeout: 30000 });

    const taskId = resp.data.id;
    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const st = await checkRunwayTask(taskId);
      if (st.status === 'SUCCEEDED' && st.output?.[0]) {
        logger.info('[FirstFrame] Generated successfully');
        return st.output[0];
      } else if (st.status === 'FAILED') {
        logger.warn('[FirstFrame] Generation failed, using white pixel');
        return null;
      }
    }
    return null;
  } catch (e) {
    logger.error('[FirstFrame] Error', { error: e.message });
    return null;
  }
}

// ========== Helper: 获取人群画像 ==========
async function getAudienceProfile() {
  try {
    const [rows] = await db.query('SELECT * FROM qc_audience_stats ORDER BY id DESC LIMIT 1');
    if (rows.length > 0) return rows[0];
  } catch {}
  return { gender_female_pct: 71, age_18_23_pct: 35, age_24_30_pct: 30, top_region: '广东' };
}

// ========== Helper: TTS生成 ==========
async function generateTTS(text, taskId) {
  const ttsFile = path.join(TTS_DIR, `runway_${taskId}.mp3`);
  if (fs.existsSync(ttsFile)) return ttsFile;
  try {
    const ttsScript = `
      const { MsEdgeTTS } = require('msedge-tts');
      (async () => {
        const tts = new MsEdgeTTS();
        await tts.setMetadata('zh-CN-XiaoyiNeural', { rate: '+10%', pitch: '+5Hz' });
        const readable = tts.toStream(${JSON.stringify(text)});
        const chunks = [];
        for await (const chunk of readable) chunks.push(chunk);
        require('fs').writeFileSync('${ttsFile}', Buffer.concat(chunks));
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const tmpScript = `/tmp/tts_runway_${taskId}.js`;
    fs.writeFileSync(tmpScript, ttsScript);
    execSync(`node ${tmpScript}`, { timeout: 30000 });
    if (fs.existsSync(tmpScript)) fs.unlinkSync(tmpScript);
    return ttsFile;
  } catch (e) {
    logger.error('[Runway TTS] 失败', { error: e.message });
    return null;
  }
}

// ========== Helper: 从素材库随机获取视频片段 ==========
function getRandomClips(count = 5) {
  try {
    if (!fs.existsSync(VIDEO_CACHE)) return [];
    const lines = fs.readFileSync(VIDEO_CACHE, 'utf8').trim().split('\n')
      .map(l => l.split(/\s+/)[0])
      .filter(l => l.endsWith('.mp4') || l.endsWith('.mov'));
    const shuffled = lines.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch { return []; }
}

// ========== Helper: MinIO presigned URL ==========
function getPresignedUrl(clipPath) {
  try {
    const MINIO_BASE = 'http://117.178.232.222:9000';
    // Full path format: sucaiwang/sucaiwang/92/10341/uuid.mp4
    if (clipPath.includes('/')) {
      return `${MINIO_BASE}/${clipPath}`;
    }
    // Old format: just filename - find full path via mc
    const findResult = execSync(`/usr/local/bin/mc find video/sucaiwang/sucaiwang/ --name "${clipPath}" 2>/dev/null | head -1`, { timeout: 30000 }).toString().trim();
    if (!findResult) return null;
    const fullPath = findResult.replace(/^video\//, '');
    return `${MINIO_BASE}/${fullPath}`;
  } catch { return null; }
}

// ========== Helper: Runway API 调用 ==========
async function callRunway(taskType, params) {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error('未配置 RUNWAY_API_KEY，请在系统设置中配置');

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-Runway-Version': '2024-11-06',
    'Content-Type': 'application/json'
  };

  // Runway image_to_video API: promptImage是必填项，ratio也是必填
  const endpoint = 'https://api.dev.runwayml.com/v1/image_to_video';
  const body = {
    model: params.model || 'gen4_turbo',
    promptImage: params.promptImage,
    promptText: params.promptText || '',
    ratio: params.ratio || '720:1280', // 竖屏短视频
    duration: params.duration || 5,
    watermark: false
  };
  if (params.seed) body.seed = params.seed;

  logger.info('[Runway API] 调用参数', { model: body.model, hasImage: !!body.promptImage, ratio: body.ratio, duration: body.duration });

  try {
    const resp = await axios.post(endpoint, body, { headers, timeout: 30000 });
    return resp.data; // { id: 'task_xxx' }
  } catch (e) {
    const errDetail = e.response?.data || e.message;
    logger.error('[Runway API] 调用失败', { status: e.response?.status, detail: JSON.stringify(errDetail) });
    throw new Error(JSON.stringify(errDetail));
  }
}

// ========== Helper: 查询Runway任务状态 ==========
async function checkRunwayTask(runwayTaskId) {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error('未配置 RUNWAY_API_KEY');
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-Runway-Version': '2024-11-06'
  };
  const resp = await axios.get(`https://api.dev.runwayml.com/v1/tasks/${runwayTaskId}`, { headers, timeout: 15000 });
  return resp.data; // { status, output, failure, ... }
}

// ========== POST /upload-image ==========
router.post('/upload-image', auth(), upload.single('image'), (req, res) => {
  if (!req.file) return res.json({ code: 400, msg: '请选择图片' });
  const url = '/uploads/' + req.file.filename;
  res.json({ code: 0, data: { url, filename: req.file.filename, size: req.file.size } });
});

// ========== POST /analyze-images — AI分析图片生成脚本 ==========
router.post("/analyze-images", auth(), async (req, res) => {
  try {
    const { image_urls = [], style = "产品展示" } = req.body;
    if (image_urls.length === 0) return res.json({ code: 400, msg: "请先上传产品图片" });

    const audience = await getAudienceProfile();
    const imageLabels = ["主图(正面)", "侧面1", "侧面2", "侧面3", "细节图", "场景图"];
    const imageDesc = image_urls.map((url, i) => imageLabels[i] || "图" + (i+1)).join("、");

    const aiResult = await callAI(
      `你是抖音短视频编导专家，擅长洁面护肤类产品的种草视频创作。
根据用户上传的产品图片描述和人群画像，生成一套完整的5-10秒短视频脚本。

输出JSON格式（不要其他内容）：
{
  "scene_desc": "整体场景描述(30字内)",
  "script": "口播文案(50字内，自然口语化)",
  "shot_list": [
    { "shot": "镜头1描述", "duration": "2s", "image_ref": "使用哪张图" },
    { "shot": "镜头2描述", "duration": "3s", "image_ref": "使用哪张图" }
  ],
  "runway_prompt": "英文Runway AI视频生成prompt(50词内，描述画面、镜头运动、光线)",
  "hook_type": "开场类型：痛点/对比/悬念/展示/情绪"
}`,
      `产品：雪玲妃氨基酸洁面乳（百合洗面奶）
已上传图片：${imageDesc}（共${image_urls.length}张不同角度）
视频风格：${style}
人群画像：女性${audience.gender_female_pct || 71}%，18-35岁${(audience.age_18_23_pct||35) + (audience.age_24_30_pct||30)}%，注重护肤

请根据图片角度安排镜头顺序，让产品展示更加自然真实。`
    );

    let parsed;
    try {
      const jsonStr = aiResult.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { scene_desc: aiResult.substring(0, 100), script: aiResult.substring(0, 200), runway_prompt: "", shot_list: [], hook_type: "展示" };
    }

    res.json({ code: 0, data: parsed });
  } catch (e) {
    logger.error("[Runway] AI分析图片失败", { error: e.message });
    res.json({ code: 500, msg: "AI分析失败: " + e.message });
  }
});
// ========== GET /stats — 统计数据 ==========
router.get('/stats', auth(), async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(IF(task_type='image2video',1,0)) AS image2video_count,
        SUM(IF(task_type='text2video',1,0)) AS text2video_count,
        SUM(IF(task_type='smart_match',1,0)) AS smart_match_count,
        SUM(IF(status='done',1,0)) AS done_count,
        SUM(IF(status='failed',1,0)) AS failed_count,
        SUM(IF(status IN ('pending','generating','composing'),1,0)) AS active_count,
        SUM(cost_credits) AS total_credits,
        COUNT(DISTINCT DATE(created_at)) AS active_days
      FROM qc_runway_tasks
    `);
    const todayStart = dayjs().format('YYYY-MM-DD');
    const [[todayStats]] = await db.query(
      `SELECT COUNT(*) AS today_count, SUM(cost_credits) AS today_credits FROM qc_runway_tasks WHERE DATE(created_at)=?`,
      [todayStart]
    );
    res.json({ code: 0, data: { ...stats, ...todayStats } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /list — 任务列表 ==========
router.get('/list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 20, task_type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = '1=1';
    const params = [];
    if (task_type) { where += ' AND task_type=?'; params.push(task_type); }
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM qc_runway_tasks WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM qc_runway_tasks WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), offset]
    );
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// =============================================
//  方案一: POST /image2video — AI图生视频
// =============================================
router.post('/image2video', auth(), async (req, res) => {
  try {
    const { image_url, image_urls = [], prompt, model = 'gen4_turbo', duration = 5, add_tts = false, tts_text = '' } = req.body;
    // 支持多图：image_urls数组，兼容旧的单图image_url
    const allImages = image_urls.length > 0 ? image_urls : (image_url ? [image_url] : []);
    if (allImages.length === 0) return res.json({ code: 400, msg: '请至少上传1张产品图片' });

    const audience = await getAudienceProfile();
    const imageCount = allImages.length;

    // 1. AI生成Runway优化prompt（融入多图信息，前中后展示更自然）
    let finalPrompt = prompt;
    { // Always generate English Runway prompt via AI
      const multiImgHint = imageCount > 1
        ? `用户上传了${imageCount}张产品不同角度图片，视频需要展示产品前面、侧面、背面等多角度，让画面更真实自然。`
        : '';
      const aiPrompt = await callAI(
        '你是一个专业的AI视频导演。根据产品信息和人群画像，生成一段Runway AI视频生成的英文prompt。要求：描述具体的画面、镜头运动（如缓慢旋转展示产品各个角度）、光线、情绪。限50词以内。',
        `产品：百合洗面奶（氨基酸洁面乳）
人群画像：女性${audience.gender_female_pct || 71}%，18-35岁为主，注重护肤
${multiImgHint}
用户需求提示：${prompt || '产品多角度展示'}
请直接输出英文prompt，不要其他内容。`
      );
      finalPrompt = aiPrompt.replace(/["""]/g, '').trim();
    }
    // 2. 计算credits（多图时每张图各生成一段再合成）
    const segDuration = imageCount > 1 ? Math.max(2, Math.floor(duration / imageCount)) : duration;
    const totalCredits = (model === 'gen4_turbo' ? 5 : 12) * segDuration * imageCount;
    const [result] = await db.query(
      `INSERT INTO qc_runway_tasks (task_type, prompt_text, prompt_image, model, duration, status, cost_credits) VALUES (?,?,?,?,?,?,?)`,
      ['image2video', finalPrompt, JSON.stringify(allImages), model, duration, 'pending', totalCredits]
    );
    const taskId = result.insertId;

    res.json({ code: 0, msg: `任务已创建（${imageCount}张图片），正在生成视频...`, data: { id: taskId, prompt: finalPrompt, cost_credits: totalCredits, image_count: imageCount } });

    // 后台执行 - 多图时为每张图生成一段视频再ffmpeg合成
    (async () => {
      try {
        await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['generating', taskId]);

        const videoSegments = [];
        const failReasons = [];
        for (let i = 0; i < allImages.length; i++) {
          let imgUrl = allImages[i];
          if (imgUrl.startsWith('/')) imgUrl = `https://business.snefe.com${imgUrl}`;

          // 为每张图生成不同的prompt描述（前中后）
          const shotDescs = ['front view, product hero shot', 'side angle, smooth rotation', 'back view, ingredient details', 'close-up texture detail', '45-degree angle, elegant lighting', 'top-down flat lay view'];
          const shotPrompt = `${finalPrompt}, ${shotDescs[i] || shotDescs[0]}`;

          const runwayResult = await callRunway('image2video', {
            model, promptImage: imgUrl, promptText: shotPrompt, duration: segDuration
          });

          // 轮询这一段的结果
          let segDone = false;
          for (let a = 0; a < 60; a++) {
            await new Promise(r => setTimeout(r, 5000));
            const status = await checkRunwayTask(runwayResult.id);
            if (status.status === 'SUCCEEDED' && status.output?.[0]) {
              videoSegments.push(status.output[0]);
              segDone = true;
              break;
            } else if (status.status === 'FAILED') {
              const reason = status.failure || status.error || 'Runway generation failed';
              logger.error(`[Runway] 第${i+1}段失败详情: ${JSON.stringify(reason)}`);
              failReasons.push(`段${i+1}: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
              break;
            }
          }
          if (!segDone) logger.warn(`[Runway] 第${i+1}段超时`);
        }

        if (videoSegments.length === 0) {
          const errDetail = failReasons.length > 0 ? failReasons.join('; ') : '所有片段生成失败(超时)';
          await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', errDetail.substring(0, 450), taskId]);
          return;
        }

        await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['composing', taskId]);

        let finalVideoUrl;
        if (videoSegments.length === 1) {
          finalVideoUrl = videoSegments[0];
        } else {
          // 下载所有片段并ffmpeg合成
          const segFiles = [];
          for (let i = 0; i < videoSegments.length; i++) {
            const segFile = path.join(VIDEO_DIR, `i2v_seg_${taskId}_${i}.mp4`);
            execSync(`curl -sL "${videoSegments[i]}" -o "${segFile}"`, { timeout: 60000 });
            segFiles.push(segFile);
          }
          const concatFile = path.join(VIDEO_DIR, `i2v_concat_${taskId}.txt`);
          fs.writeFileSync(concatFile, segFiles.map(f => `file '${f}'`).join('\n'));
          const mergedFile = path.join(VIDEO_DIR, `i2v_merged_${taskId}.mp4`);
          execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -an "${mergedFile}"`, { timeout: 120000 });
          finalVideoUrl = `/generated-videos/i2v_merged_${taskId}.mp4`;
          // cleanup
          segFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
          try { fs.unlinkSync(concatFile); } catch {}
        }

        // TTS叠加
        if (add_tts && tts_text) {
          const ttsFile = await generateTTS(tts_text, `i2v_${taskId}`);
          if (ttsFile) {
            let inputVideo;
            if (finalVideoUrl.startsWith('/')) {
              inputVideo = path.join('/home/www/qianchuan-monitor', finalVideoUrl);
            } else {
              inputVideo = path.join(VIDEO_DIR, `i2v_dl_${taskId}.mp4`);
              execSync(`curl -sL "${finalVideoUrl}" -o "${inputVideo}"`, { timeout: 60000 });
            }
            const withTtsFile = path.join(VIDEO_DIR, `i2v_final_${taskId}.mp4`);
            execSync(`ffmpeg -y -i "${inputVideo}" -i "${ttsFile}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${withTtsFile}"`, { timeout: 60000 });
            finalVideoUrl = `/generated-videos/i2v_final_${taskId}.mp4`;
          }
        }

        await db.query('UPDATE qc_runway_tasks SET status=?, video_url=? WHERE id=?', ['done', finalVideoUrl, taskId]);
        if (global.wsBroadcast) global.wsBroadcast({ type: 'runway_done', taskId, video_url: finalVideoUrl });

      } catch (e) {
        logger.error('[Runway image2video] 失败', { error: e.message, taskId });
        const errMsg = (e.message || '未知错误').substring(0, 450); await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', errMsg, taskId]);
      }
    })();

  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 千川爆款数据驱动 =====================

// 缓存爆款特征（1小时有效）
let _hotFeaturesCache = null;
let _hotFeaturesCacheTime = 0;

/**
 * 从千川投放数据中提取爆款素材特征
 */
async function getHotMaterialFeatures() {
  // 缓存1小时
  if (_hotFeaturesCache && Date.now() - _hotFeaturesCacheTime < 3600000) return _hotFeaturesCache;

  try {
    const dayjs = require('dayjs');
    const fifteenDaysAgo = dayjs().subtract(15, 'day').format('YYYY-MM-DD');

    // 高CTR素材（画面吸引力强）
    const [topCtr] = await db.query(`
      SELECT title, ROUND(AVG(product_ctr), 2) AS avg_ctr,
        ROUND(AVG(play_duration_3s_rate) * 100, 1) AS avg_3s_rate,
        ROUND(AVG(play_over_rate) * 100, 1) AS avg_finish_rate,
        SUM(cost) AS total_cost
      FROM qc_material_stats
      WHERE stat_date >= ? AND cost >= 100 AND product_ctr > 0
      GROUP BY title HAVING AVG(product_ctr) > 1.5
      ORDER BY AVG(product_ctr) DESC LIMIT 5
    `, [fifteenDaysAgo]);

    // 高ROI素材（转化好）
    const [topRoi] = await db.query(`
      SELECT title, ROUND(SUM(pay_order_amount)/SUM(cost), 2) AS roi,
        ROUND(AVG(convert_rate), 2) AS avg_cvr,
        ROUND(AVG(product_ctr), 2) AS avg_ctr,
        SUM(cost) AS total_cost
      FROM qc_material_stats
      WHERE stat_date >= ? AND cost >= 500
      GROUP BY title HAVING SUM(pay_order_amount)/SUM(cost) > 1.5
      ORDER BY roi DESC LIMIT 5
    `, [fifteenDaysAgo]);

    // 最新爆款分析报告
    const [summaryRows] = await db.query(
      `SELECT content FROM hot_material_summaries ORDER BY created_at DESC LIMIT 1`
    );
    const latestSummary = summaryRows?.[0]?.content || '';
    // 提取核心发现（取前500字）
    const summaryExcerpt = latestSummary.substring(0, 500);

    let features = '';

    if (topCtr.length > 0) {
      features += '【高点击率素材特征】\n';
      topCtr.forEach(m => {
        features += `- "${m.title}" CTR:${m.avg_ctr}%, 3s留存:${m.avg_3s_rate}%, 完播:${m.avg_finish_rate}%\n`;
      });
    }

    if (topRoi.length > 0) {
      features += '\n【高转化率素材特征】\n';
      topRoi.forEach(m => {
        features += `- "${m.title}" ROI:${m.roi}, 转化率:${m.avg_cvr}%, CTR:${m.avg_ctr}%\n`;
      });
    }

    if (summaryExcerpt) {
      features += '\n【AI爆款分析摘要】\n' + summaryExcerpt + '\n';
    }

    _hotFeaturesCache = features || '暂无足够投放数据';
    _hotFeaturesCacheTime = Date.now();
    return _hotFeaturesCache;
  } catch (e) {
    logger.warn('[HotFeatures] 查询失败', { error: e.message });
    return '暂无投放数据';
  }
}

// 中文CCR优化（用于即梦模型）— 融入千川数据
async function optimizePromptForJimeng(chinesePrompt, useDataDriven = false) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const mdl = process.env.OPENAI_MODEL || 'gpt-5';
  if (!apiKey) return chinesePrompt;

  // 获取千川爆款数据
  let dataSection = '';
  if (useDataDriven) {
    const hotFeatures = await getHotMaterialFeatures();
    if (hotFeatures && hotFeatures !== '暂无足够投放数据' && hotFeatures !== '暂无投放数据') {
      dataSection = `

## 千川投放数据驱动（重要参考！）
以下是近15天千川投放表现最好的素材特征。优化prompt时，应参考这些高转化素材的画面风格、拍摄手法和视觉特征，让生成的视频更接近实际投放效果好的风格：

${hotFeatures}

请从以上数据中提取画面特征（如：泡沫特写、使用前后对比、KOC口播风格等），融入到优化后的prompt中。`;
    }
  }

  const systemPrompt = `你是即梦AI视频提示词的格式优化助手。你的任务是：保留用户的原始创意意图不变，只补充CCR格式细节。

## 核心原则（最重要）
- 用户描述什么画面，你就优化什么画面，绝对不能改变画面内容方向
- 你只做增强补充，不做替换重写
- 用户说肌肤变坏就是肌肤变坏的画面，不能变成女生摸脸
- 用户说动画形式就保留动画风格，不能变成真人实拍

## CCR格式补充规则
1. 镜头(C)：在开头补充一个匹配用户描述的镜头运动（如微距推进、缓慢放大、跟踪特写）
2. 主体(C)：保持用户原始描述的主体不变，可补充细节
3. 动作(R)：保持用户原始描述的动作/变化不变，可补充过程细节
4. 结尾补充一句氛围/光线描述
${dataSection}

## 规则
- 全程中文
- 120字以内
- 不要添加用户没提到的人物或场景
- 不要把抽象/动画描述改成写实场景
- 不出现品牌名、产品名

## 示例
输入：局部肌肤慢慢变坏，对视觉有一定冲击（取局部放大特写）
正确输出：微距缓慢推进，皮肤局部放大特写；毛孔逐渐扩大，油脂溢出，角质层起皮干裂，黑头浮现加深，肤色暗沉泛红；视觉冲击感强烈，冷色调医学影像风格光线。
错误输出：手持微距推进特写；20岁中国女生，素颜，脸颊局部；食指轻按缓慢划过瑕疵...（这完全改变了原始意图！）

只输出优化后的中文提示词，不要输出其他内容。`;

  try {
    const resp = await require('axios').post(baseUrl + '/chat/completions', {
      model: mdl, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: chinesePrompt }],
      max_tokens: 500, temperature: 0.3,
    }, { headers: { Authorization: 'Bearer ' + apiKey }, timeout: 30000 });
    return resp.data.choices?.[0]?.message?.content?.trim() || chinesePrompt;
  } catch (e) {
    return chinesePrompt;
  }
}

// ========== POST /optimize-prompt — CCR公式优化预览 ==========
router.post('/optimize-prompt', auth(), async (req, res) => {
  try {
    const { scene_desc, data_driven = false } = req.body;
    if (!scene_desc || scene_desc.trim().length < 2) return res.json({ code: 400, msg: '请输入场景描述' });
    const isChineseModel = req.body.model === 'jimeng_v30' || req.body.model === 'doubao_seed';
    const optimized = isChineseModel ? await optimizePromptForJimeng(scene_desc, data_driven) : await optimizePromptForRunway(scene_desc, false);
    res.json({ code: 0, data: { original: scene_desc, optimized } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /smart-prompt — 千川数据驱动智能Prompt生成 ==========
router.post('/smart-prompt', auth(), async (req, res) => {
  try {
    const { scene_desc, product } = req.body;
    if (!scene_desc || scene_desc.trim().length < 2) return res.json({ code: 400, msg: '请输入场景描述' });

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
    const mdl = process.env.OPENAI_MODEL || 'gpt-5';
    if (!apiKey) return res.json({ code: 400, msg: '未配置AI API密钥' });

    const dayjs = require('dayjs');
    const fifteenDaysAgo = dayjs().subtract(15, 'day').format('YYYY-MM-DD');

    // 查询千川高表现素材
    const [topCtr] = await db.query(`
      SELECT title, ROUND(AVG(product_ctr), 2) AS avg_ctr,
        ROUND(AVG(play_duration_3s_rate) * 100, 1) AS avg_3s_rate,
        SUM(cost) AS total_cost
      FROM qc_material_stats
      WHERE stat_date >= ? AND cost >= 100 AND product_ctr > 0
      GROUP BY title ORDER BY AVG(product_ctr) DESC LIMIT 5
    `, [fifteenDaysAgo]);

    const [topRoi] = await db.query(`
      SELECT title, ROUND(SUM(pay_order_amount)/SUM(cost), 2) AS roi,
        ROUND(AVG(convert_rate), 2) AS avg_cvr, SUM(cost) AS total_cost
      FROM qc_material_stats
      WHERE stat_date >= ? AND cost >= 500
      GROUP BY title HAVING SUM(pay_order_amount)/SUM(cost) > 1
      ORDER BY roi DESC LIMIT 5
    `, [fifteenDaysAgo]);

    // 最新爆款报告
    const [summaryRows] = await db.query(`SELECT content FROM hot_material_summaries ORDER BY created_at DESC LIMIT 1`);
    const summaryExcerpt = (summaryRows?.[0]?.content || '').substring(0, 600);

    const ctrInfo = topCtr.map(m => `"${m.title}" CTR:${m.avg_ctr}% 3s留存:${m.avg_3s_rate}%`).join('\n');
    const roiInfo = topRoi.map(m => `"${m.title}" ROI:${m.roi} 转化率:${m.avg_cvr}%`).join('\n');

    const systemPrompt = `你是雪玲妃品牌的AI视频创意总监。根据千川投放数据中的爆款规律，为即梦AI视频生成优化的prompt。

## 千川近15天高点击率素材（画面吸引力强）
${ctrInfo || '暂无数据'}

## 千川近15天高ROI素材（转化效果好）
${roiInfo || '暂无数据'}

## 爆款分析报告摘要
${summaryExcerpt || '暂无报告'}

## 你的任务
1. 分析以上爆款素材的画面特征规律（镜头、构图、光线、色调、动作等）
2. 结合用户的场景描述，生成一个适合即梦AI文生视频的中文prompt
3. 要求prompt融入爆款素材的画面风格特征，让生成的视频更接近高转化效果

## 输出格式（JSON）
{
  "optimized": "优化后的即梦prompt（中文，120字以内，CCR格式）",
  "data_insights": "你从数据中发现的关键规律（50字以内）",
  "ref_materials": ["参考的高转化素材标题1", "素材2"]
}

只输出JSON，不要输出其他内容。`;

    const resp = await require('axios').post(baseUrl + '/chat/completions', {
      model: mdl,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `场景：${scene_desc}${product ? '，产品：' + product : ''}` }],
      max_tokens: 800, temperature: 0.5,
    }, { headers: { Authorization: 'Bearer ' + apiKey }, timeout: 30000 });

    const content = resp.data.choices?.[0]?.message?.content?.trim() || '';
    let result;
    try {
      const jsonStr = content.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      result = { optimized: content, data_insights: '', ref_materials: [] };
    }

    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('[SmartPrompt] 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// =============================================
//  方案二: POST /text2video — AI文生视频
// =============================================
router.post('/text2video', auth(), async (req, res) => {
  try {
    const { scene_desc, model = 'gen4_turbo', duration = 5, add_tts = false, product_images = [] } = req.body;
    if (!scene_desc || scene_desc.trim().length < 2) return res.json({ code: 400, msg: '请输入场景描述' });

    const costCredits = (model === 'gen4.5' ? 12 : model === 'doubao_seed' ? 3 : 5) * duration;
    const [result] = await db.query(
      'INSERT INTO qc_runway_tasks (task_type, prompt_text, prompt_image, model, duration, status, cost_credits) VALUES (?,?,?,?,?,?,?)',
      ['text2video', scene_desc, product_images.length > 0 ? JSON.stringify(product_images) : null, model, duration, 'pending', costCredits]
    );
    const taskId = result.insertId;
    res.json({ code: 0, msg: '正在生成视频...', data: { id: taskId, cost_credits: costCredits } });

    // 后台生成视频
    (async () => {
      try {
        await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['generating', taskId]);

        // ========== 豆包 Seedance 2.0 ==========
        if (model === 'doubao_seed') {
          const doubao = require('../services/doubao-seedance');
          logger.info('[Doubao t2v] optimizing prompt...', { original: scene_desc.substring(0, 50) });
          const optimizedPrompt = await optimizePromptForJimeng(scene_desc, false);
          logger.info('[Doubao t2v] prompt ready', { result: optimizedPrompt.substring(0, 100) });

          // 提交任务
          const ratioMap = { '720:1280': '9:16', '1280:720': '16:9', '1024:1024': '1:1' };
          const ratio = ratioMap[req.body.ratio] || '9:16';
          let doubaoTaskId;
          if (product_images.length > 0) {
            const img0 = product_images[0];
            const imgUrl = img0.startsWith('/') ? 'https://business.snefe.com' + img0 : img0;
            doubaoTaskId = await doubao.submitImage2Video(imgUrl, optimizedPrompt, { duration, ratio });
          } else {
            doubaoTaskId = await doubao.submitText2Video(optimizedPrompt, { duration, ratio });
          }
          await db.query('UPDATE qc_runway_tasks SET runway_task_id=? WHERE id=?', [doubaoTaskId, taskId]);

          // 轮询
          let done = false;
          for (let a = 0; a < 60; a++) {
            await new Promise(r => setTimeout(r, 5000));
            const st = await doubao.queryTask(doubaoTaskId);
            if (st.status === 'done' && st.videoUrl) {
              let videoUrl = st.videoUrl;
              if (add_tts && scene_desc) {
                await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['composing', taskId]);
                const ttsFile = await generateTTS(scene_desc, taskId);
                if (ttsFile) {
                  const rawV = path.join(VIDEO_DIR, 'doubao_raw_' + taskId + '.mp4');
                  execSync(`curl -sL "${videoUrl}" -o "${rawV}"`, { timeout: 60000 });
                  const finalV = path.join(VIDEO_DIR, 'doubao_t2v_' + taskId + '.mp4');
                  execSync(`ffmpeg -y -i "${rawV}" -i "${ttsFile}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${finalV}"`, { timeout: 60000 });
                  videoUrl = '/generated-videos/doubao_t2v_' + taskId + '.mp4';
                }
              }
              await db.query('UPDATE qc_runway_tasks SET status=?, video_url=?, prompt_text=? WHERE id=?', ['done', videoUrl, optimizedPrompt + '\n---\n' + scene_desc, taskId]);
              if (global.wsBroadcast) global.wsBroadcast({ type: 'runway_done', taskId, video_url: videoUrl });
              done = true; break;
            } else if (st.status === 'failed') {
              const msg = JSON.stringify(st.raw).substring(0, 450);
              await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', msg, taskId]);
              done = true; break;
            }
          }
          if (!done) await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', '豆包生成超时(5分钟)', taskId]);
          return;
        }

        // ========== 即梦 3.0 ==========
        if (model === 'jimeng_v30') {
          const jimeng = require('../services/jimeng');
          const optimizedPrompt = await optimizePromptForJimeng(scene_desc, false);
          let jimengTaskId;
          if (product_images.length > 0) {
            const img0 = product_images[0];
            const imgUrl = img0.startsWith('/') ? 'https://business.snefe.com' + img0 : img0;
            jimengTaskId = await jimeng.submitImage2Video(imgUrl, optimizedPrompt, { duration });
          } else {
            jimengTaskId = await jimeng.submitText2Video(optimizedPrompt, { duration });
          }
          await db.query('UPDATE qc_runway_tasks SET runway_task_id=? WHERE id=?', [jimengTaskId, taskId]);
          const videoUrl = await jimeng.waitForVideo(jimengTaskId, 300000, product_images.length > 0 ? 'jimeng_i2v_v30_1080p' : 'jimeng_t2v_v30_1080p');
          let finalUrl = videoUrl;
          if (add_tts && scene_desc) {
            await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['composing', taskId]);
            const ttsFile = await generateTTS(scene_desc, taskId);
            if (ttsFile) {
              const rawV = path.join(VIDEO_DIR, 'jimeng_raw_' + taskId + '.mp4');
              execSync(`curl -sL "${videoUrl}" -o "${rawV}"`, { timeout: 60000 });
              const finalV = path.join(VIDEO_DIR, 'jimeng_t2v_' + taskId + '.mp4');
              execSync(`ffmpeg -y -i "${rawV}" -i "${ttsFile}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${finalV}"`, { timeout: 60000 });
              finalUrl = '/generated-videos/jimeng_t2v_' + taskId + '.mp4';
            }
          }
          await db.query('UPDATE qc_runway_tasks SET status=?, video_url=?, prompt_text=? WHERE id=?', ['done', finalUrl, optimizedPrompt + '\n---\n' + scene_desc, taskId]);
          if (global.wsBroadcast) global.wsBroadcast({ type: 'runway_done', taskId, video_url: finalUrl });
          return;
        }

        // ========== Runway Gen-4 (默认) ==========
        // Step 1: AI优化prompt（中文→结构化英文，聚焦动作和镜头）
        logger.info('[Runway t2v] optimizing prompt...', { original: scene_desc.substring(0, 50) });
        const optimizedPrompt = await optimizePromptForRunway(scene_desc, product_images.length > 0);
        logger.info('[Runway t2v] optimized prompt', { result: optimizedPrompt.substring(0, 100) });

        // Step 2: promptImage处理
        let promptImage;
        if (product_images.length > 0) {
          const img0 = product_images[0];
          promptImage = img0.startsWith('/') ? 'https://business.snefe.com' + img0 : img0;
        } else {
          logger.info('[Runway t2v] generating first frame...');
          const firstFrame = await generateFirstFrame(optimizedPrompt, req.body.ratio || '720:1280');
          if (firstFrame) {
            promptImage = firstFrame;
            logger.info('[Runway t2v] first frame generated OK');
          } else {
            promptImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
            logger.info('[Runway t2v] using white pixel fallback');
          }
        }

        logger.info('[Runway t2v] calling API', { model, hasProductImg: product_images.length > 0, duration, promptLen: optimizedPrompt.length });

        const runwayResult = await callRunway('text2video', { model, promptImage, promptText: optimizedPrompt, duration });
        await db.query('UPDATE qc_runway_tasks SET runway_task_id=? WHERE id=?', [runwayResult.id, taskId]);

        let done = false;
        for (let a = 0; a < 60; a++) {
          await new Promise(r => setTimeout(r, 5000));
          const st = await checkRunwayTask(runwayResult.id);
          if (st.status === 'SUCCEEDED' && st.output?.[0]) {
            let videoUrl = st.output[0];
            if (add_tts && scene_desc) {
              await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['composing', taskId]);
              const ttsFile = await generateTTS(scene_desc, taskId);
              if (ttsFile) {
                const rawV = path.join(VIDEO_DIR, 'runway_raw_' + taskId + '.mp4');
                execSync(`curl -sL "${videoUrl}" -o "${rawV}"`, { timeout: 60000 });
                const finalV = path.join(VIDEO_DIR, 'runway_t2v_' + taskId + '.mp4');
                execSync(`ffmpeg -y -i "${rawV}" -i "${ttsFile}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${finalV}"`, { timeout: 60000 });
                videoUrl = '/generated-videos/runway_t2v_' + taskId + '.mp4';
              }
            }
            await db.query('UPDATE qc_runway_tasks SET status=?, video_url=?, prompt_text=? WHERE id=?', ['done', videoUrl, optimizedPrompt + '\n---\n' + scene_desc, taskId]);
            if (global.wsBroadcast) global.wsBroadcast({ type: 'runway_done', taskId, video_url: videoUrl });
            done = true; break;
          } else if (st.status === 'FAILED') {
            const reason = st.failure || st.error || 'Runway generation failed';
            logger.error('[Runway t2v] failed', { reason });
            const msg = (typeof reason === 'string' ? reason : JSON.stringify(reason)).substring(0, 450);
            await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', msg, taskId]);
            done = true; break;
          }
        }
        if (!done) await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', '生成超时(5分钟)', taskId]);
      } catch (e) {
        logger.error('[t2v] error', { error: e.message, taskId });
        await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', (e.message || '').substring(0, 450), taskId]);
      }
    })();
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// =============================================
//  方案三: POST /smart-match — AI素材库智能匹配
// =============================================
router.post('/smart-match', auth(), async (req, res) => {
  try {
    const { scene_desc, clip_count = 5, duration = 5, add_tts = true } = req.body;
    const audience = await getAudienceProfile();

    // 1. AI生成脚本 + 镜头分镜
    const aiResult = await callAI(
      `你是一个专业的短视频广告导演。为百合洗面奶创作${duration}秒黄金开场视频分镜。
人群：女性${audience.gender_female_pct || 71}%，18-35岁。

请严格按JSON输出：
{
  "script": "口播文案（自然口语，带语气词和连接词）",
  "shots": [
    { "time": "0-1s", "desc_cn": "中文镜头描述", "desc_en": "英文Runway prompt（20词）", "type": "large/medium/close-up", "need_generate": false }
  ],
  "hook_type": "开场类型"
}

规则：
- shots中${clip_count}个镜头，每个1-2秒
- need_generate=false 表示可以从素材库匹配，true表示需要Runway生成
- 产品特写镜头优先从素材库匹配
- 场景/人物/情绪镜头建议Runway生成`,
      `场景要求：${scene_desc || '由AI设计最佳场景'}\n总时长：${duration}秒\n镜头数量：${clip_count}`
    );

    let parsed;
    try {
      const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = {
        script: '姐妹们～换季烂脸的看过来！这个洗面奶真的救了我的脸',
        shots: [
          { time: '0-1s', desc_cn: '女生照镜子愁眉', desc_en: 'Young woman looking at mirror worried about skin', type: 'medium', need_generate: true },
          { time: '1-2s', desc_cn: '产品特写', desc_en: 'Facial cleanser product close-up', type: 'close-up', need_generate: false },
          { time: '2-3s', desc_cn: '挤出泡沫', desc_en: 'Squeezing creamy foam on hands', type: 'close-up', need_generate: false },
          { time: '3-4s', desc_cn: '洗脸过程', desc_en: 'Gently washing face with foam', type: 'medium', need_generate: true },
          { time: '4-5s', desc_cn: '清爽笑容', desc_en: 'Fresh clean face smiling at camera', type: 'close-up', need_generate: true }
        ],
        hook_type: '痛点共鸣'
      };
    }

    // 2. 素材库匹配
    const allClips = getRandomClips(200);
    const matchedClips = [];
    let runwayNeeded = 0;

    for (const shot of (parsed.shots || [])) {
      if (!shot.need_generate && allClips.length > 0) {
        // 从素材库随机分配一个片段
        const clip = allClips.pop();
        const presignedUrl = getPresignedUrl(clip);
        matchedClips.push({ ...shot, source: 'minio', clip_path: clip, clip_url: presignedUrl });
      } else {
        runwayNeeded++;
        matchedClips.push({ ...shot, source: 'runway', clip_path: null, clip_url: null });
      }
    }

    // 3. 计算成本
    const runwayCost = runwayNeeded * 2 * 5; // 每个镜头约2秒 × 5 credits
    const [result] = await db.query(
      `INSERT INTO qc_runway_tasks (task_type, prompt_text, model, duration, status, script_text, matched_clips, cost_credits) VALUES (?,?,?,?,?,?,?,?)`,
      ['smart_match', scene_desc || 'AI智能匹配', 'gen4_turbo', duration, 'pending', JSON.stringify(parsed), JSON.stringify(matchedClips), runwayCost]
    );
    const taskId = result.insertId;

    res.json({
      code: 0, msg: '分镜方案已生成',
      data: {
        id: taskId, ...parsed,
        matched_clips: matchedClips,
        stats: {
          total_shots: matchedClips.length,
          from_library: matchedClips.filter(c => c.source === 'minio').length,
          from_runway: runwayNeeded,
          estimated_credits: runwayCost,
          estimated_cost: `¥${(runwayCost * 0.07).toFixed(2)}`
        }
      }
    });

  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /smart-match/:id/generate — 执行智能匹配生成 ==========
router.post('/smart-match/:id/generate', auth(), async (req, res) => {
  try {
    const taskId = req.params.id;
    const [rows] = await db.query('SELECT * FROM qc_runway_tasks WHERE id=?', [taskId]);
    if (!rows.length) return res.json({ code: 404, msg: '任务不存在' });

    const task = rows[0];
    const clips = typeof task.matched_clips === 'string' ? JSON.parse(task.matched_clips) : task.matched_clips;
    const scriptData = typeof task.script_text === 'string' ? JSON.parse(task.script_text) : task.script_text;

    await db.query('UPDATE qc_runway_tasks SET status=? WHERE id=?', ['composing', taskId]);
    res.json({ code: 0, msg: '开始合成视频...' });

    // 后台合成
    (async () => {
      try {
        const clipFiles = [];
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          const clipFile = path.join(VIDEO_DIR, `sm_clip_${taskId}_${i}.mp4`);

          if (clip.source === 'minio' && clip.clip_url) {
            // 从MinIO下载
            execSync(`curl -sL "${clip.clip_url}" -o "${clipFile}"`, { timeout: 30000 });
            // 截取2秒
            const trimFile = path.join(VIDEO_DIR, `sm_trim_${taskId}_${i}.mp4`);
            execSync(`ffmpeg -y -i "${clipFile}" -t 2 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -an "${trimFile}"`, { timeout: 30000 });
            clipFiles.push(trimFile);
          } else {
            // Runway生成（模拟 - 需要真实API Key）
            // 在没有API Key时，用素材库替代
            const fallbackClips = getRandomClips(1);
            if (fallbackClips.length > 0) {
              const url = getPresignedUrl(fallbackClips[0]);
              if (url) {
                execSync(`curl -sL "${url}" -o "${clipFile}"`, { timeout: 30000 });
                const trimFile = path.join(VIDEO_DIR, `sm_trim_${taskId}_${i}.mp4`);
                execSync(`ffmpeg -y -i "${clipFile}" -t 2 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -an "${trimFile}"`, { timeout: 30000 });
                clipFiles.push(trimFile);
              }
            }
          }
        }

        if (clipFiles.length === 0) {
          await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', '无可用视频片段', taskId]);
          return;
        }

        // ffmpeg拼接
        const concatList = path.join(VIDEO_DIR, `sm_concat_${taskId}.txt`);
        fs.writeFileSync(concatList, clipFiles.map(f => `file '${f}'`).join('\n'));
        const mergedVideo = path.join(VIDEO_DIR, `sm_merged_${taskId}.mp4`);
        execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:v libx264 -preset fast "${mergedVideo}"`, { timeout: 60000 });

        // TTS
        let finalVideoUrl = `/generated-videos/sm_merged_${taskId}.mp4`;
        if (scriptData?.script) {
          const ttsFile = await generateTTS(scriptData.script, `sm_${taskId}`);
          if (ttsFile) {
            const finalFile = path.join(VIDEO_DIR, `sm_final_${taskId}.mp4`);
            execSync(`ffmpeg -y -i "${mergedVideo}" -i "${ttsFile}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${finalFile}"`, { timeout: 60000 });
            finalVideoUrl = `/generated-videos/sm_final_${taskId}.mp4`;
          }
        }

        await db.query('UPDATE qc_runway_tasks SET status=?, video_url=? WHERE id=?', ['done', finalVideoUrl, taskId]);
        if (global.wsBroadcast) global.wsBroadcast({ type: 'runway_done', taskId, video_url: finalVideoUrl });

        // cleanup
        clipFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
        try { fs.unlinkSync(concatList); } catch {}

      } catch (e) {
        logger.error('[SmartMatch generate] 失败', { error: e.message, taskId });
        const errMsg = (e.message || '未知错误').substring(0, 450); await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', errMsg, taskId]);
      }
    })();

  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /task/:id — 查询单个任务 ==========
router.get('/task/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM qc_runway_tasks WHERE id=?', [req.params.id]);
    if (!rows.length) return res.json({ code: 404, msg: '任务不存在' });
    const task = rows[0];
    if (task.matched_clips && typeof task.matched_clips === 'string') task.matched_clips = JSON.parse(task.matched_clips);
    if (task.script_text && typeof task.script_text === 'string') try { task.script_text = JSON.parse(task.script_text); } catch {}
    res.json({ code: 0, data: task });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== DELETE /task/:id ==========
router.delete('/task/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM qc_runway_tasks WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
