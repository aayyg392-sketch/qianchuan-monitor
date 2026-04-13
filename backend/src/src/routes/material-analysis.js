const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
let PRODUCT_LIB = {};
try { PRODUCT_LIB = require('../config/product-visual-library.json'); } catch(e) { logger.warn('[MaterialAnalysis] 产品知识库加载失败'); }
const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TAG = '[MaterialAnalysis]';
const AI_KEY = process.env.OPENAI_API_KEY;
const AI_BASE = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const VISION_MODEL = process.env.AUDIT_VISION_MODEL || AI_MODEL;

// ===================== 建表（首次启动自动执行）=====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_material_analysis (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_id BIGINT NOT NULL,
        advertiser_id BIGINT DEFAULT 0,
        analysis_json LONGTEXT COMMENT '完整分析结果JSON',
        highlights_json LONGTEXT COMMENT '高光画面JSON',
        script_variations_json LONGTEXT COMMENT '脚本裂变JSON',
        status ENUM('analyzing','done','failed') DEFAULT 'analyzing',
        error_msg VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_material (material_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info(`${TAG} 表结构就绪`);
  } catch (e) {
    logger.error(`${TAG} 建表失败`, { error: e.message });
  }
})();

// ===================== AI调用 =====================
async function callAI(systemPrompt, userPrompt) {
  const resp = await axios.post(`${AI_BASE}/chat/completions`, {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 12000,
  }, { headers: { Authorization: `Bearer ${AI_KEY}` }, timeout: 180000 });
  return resp.data.choices[0].message.content;
}

// 视觉分析 — 带图片的AI调用
async function callVisionAI(systemPrompt, userPrompt, imageUrls) {
  const content = [{ type: 'text', text: userPrompt }];
  for (const url of imageUrls) {
    content.push({ type: 'image_url', image_url: { url } });
  }
  const resp = await axios.post(`${AI_BASE}/chat/completions`, {
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content }
    ],
    temperature: 0.7,
    max_tokens: 12000,
  }, { headers: { Authorization: `Bearer ${AI_KEY}` }, timeout: 180000 });
  return resp.data.choices[0].message.content;
}

// ===================== 视频截帧 =====================
// 持久化帧图片目录
const FRAMES_DIR = '/home/www/qianchuan-monitor/generated-videos/analysis-frames';
try { execSync('mkdir -p ' + FRAMES_DIR); } catch(e) {}

async function extractFrames(videoUrl, materialId) {
  const tmpDir = `/tmp/analysis_frames_${materialId}`;
  const persistDir = `${FRAMES_DIR}/${materialId}`;
  try {
    execSync(`mkdir -p ${tmpDir} ${persistDir}`);
    const videoFile = `${tmpDir}/video.mp4`;
    execSync(`curl -sL -H "Referer: https://qianchuan.jinritemai.com/" -o ${videoFile} "${videoUrl}"`, { timeout: 60000 });
    const stat = fs.statSync(videoFile);
    if (stat.size < 10000) throw new Error('视频文件太小');

    let duration = 10;
    try {
      const dur = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoFile}"`, { timeout: 5000 }).toString().trim();
      duration = Math.max(parseFloat(dur) || 10, 2);
    } catch (e) { /* 默认10秒 */ }

    // 截取8帧（增加密度以更好捕捉高光）
    const count = 8;
    const frames = [];
    for (let i = 0; i < count; i++) {
      const t = Math.min(Math.max(duration * (i / (count - 1)), 0.3), duration - 0.3);
      const framePath = `${tmpDir}/frame_${i}.jpg`;
      const persistPath = `${persistDir}/frame_${i}_${t.toFixed(1)}s.jpg`;
      try {
        execSync(`ffmpeg -y -ss ${t.toFixed(1)} -i "${videoFile}" -vframes 1 -q:v 3 -vf "scale=720:-1" "${framePath}"`, { timeout: 10000 });
        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 500) {
          // 复制到持久目录（供前端展示和图生视频使用）
          fs.copyFileSync(framePath, persistPath);
          const b64 = fs.readFileSync(framePath).toString('base64');
          frames.push({
            time: t.toFixed(1),
            base64: b64,
            url: `/generated-videos/analysis-frames/${materialId}/frame_${i}_${t.toFixed(1)}s.jpg`
          });
        }
      } catch (e) { /* 跳过失败帧 */ }
    }
    return { frames, duration };
  } catch (e) {
    logger.warn(`${TAG} 截帧失败 material_id=${materialId}`, { error: e.message });
    return { frames: [], duration: 0 };
  } finally {
    try { execSync(`rm -rf ${tmpDir}`); } catch (e) { /* ignore */ }
  }
}

// ===================== POST /analyze — 素材内容深度分析 =====================
router.post('/analyze', auth(), async (req, res) => {
  const { material_id, advertiser_id } = req.body;
  if (!material_id) return res.json({ code: 400, msg: '请提供素材ID' });

  try {
    // 从 qc_material_stats 获取素材数据
    const [rows] = await db.query(`
      SELECT title, video_url, cover_url, cost, 
             product_ctr AS ctr, 
             CASE WHEN cost > 0 THEN ROUND(pay_order_amount / cost, 2) ELSE 0 END AS roi,
             product_show_count AS show_cnt, 
             product_click_count AS click_cnt,
             play_duration_3s_rate, play_over_rate
      FROM qc_material_stats
      WHERE material_id = ?
      ORDER BY stat_date DESC LIMIT 1
    `, [material_id]);

    if (!rows.length) return res.json({ code: 404, msg: '未找到该素材数据' });
    const mat = rows[0];

    // 插入分析记录
    const [insertResult] = await db.query(
      'INSERT INTO qc_material_analysis (material_id, advertiser_id, status) VALUES (?,?,?)',
      [material_id, advertiser_id || 0, 'analyzing']
    );
    const analysisId = insertResult.insertId;

    res.json({ code: 0, data: { id: analysisId, status: 'analyzing' }, msg: '分析任务已启动' });

    // 异步执行分析
    (async () => {
      try {
        // 实时获取新鲜视频URL（千川视频URL有有效期）
        let videoUrl = mat.video_url;
        try {
          const { getActiveAccounts } = require('../services/sync');
          const accounts = await getActiveAccounts();
          const QianChuanAPI = require('../services/qianchuan');
          // 遍历账户尝试获取视频
          for (const acc of accounts) {
            try {
              const api = new QianChuanAPI(acc.access_token);
              const axios = require('axios');
              const res = await axios.get('https://ad.oceanengine.com/open_api/v1.0/qianchuan/video/get/', {
                params: { advertiser_id: parseInt(acc.advertiser_id), page: 1, page_size: 20 },
                headers: { 'Access-Token': acc.access_token },
                transformResponse: [data => data],
                timeout: 15000
              });
              const parsed = JSON.parse(res.data);
              if (parsed.code === 0 && parsed.data?.list) {
                // 用文件名匹配
                const match = parsed.data.list.find(v => 
                  (v.filename && mat.title && v.filename.includes(mat.title.replace('.mp4','').slice(0,10)))
                );
                if (match && match.url) {
                  videoUrl = match.url;
                  logger.info(`${TAG} 获取到新鲜视频URL from ${acc.advertiser_id}`);
                  // 同时更新数据库
                  await db.query('UPDATE qc_material_stats SET video_url=?, cover_url=? WHERE material_id=?', 
                    [match.url, match.poster_url || '', material_id]);
                  break;
                }
              }
            } catch(e) { /* 继续下一个账户 */ }
            await new Promise(r => setTimeout(r, 500));
          }
        } catch(e) { logger.warn(`${TAG} 获取新鲜URL失败`, { error: e.message }); }

        // 截取视频帧
        let frameData = { frames: [], duration: 0 };
        if (videoUrl) {
          frameData = await extractFrames(videoUrl, material_id);
        }

        // 根据素材标题匹配产品知识
        const titleLower = (mat.title || '').toLowerCase();
        let productContext = '';
        if (PRODUCT_LIB.products) {
          for (const [name, info] of Object.entries(PRODUCT_LIB.products)) {
            if (titleLower.includes(name.replace('洗面奶','')) || titleLower.includes(name)) {
              productContext = `
【产品视觉参考 - ${info.full_name}】
- 外观：${info.appearance}
- 质地：${info.texture}
- 配色：${info.color_scheme}
- 尺寸参考：${info.size_reference || '500g大容量'}
- 关键视觉元素：${info.key_visual}
${info.ingredients_visual ? '- 可见成分特征：' + info.ingredients_visual : ''}

生成jimeng_prompt时，必须严格使用以上产品描述来还原产品外观，不得编造产品样式。`;
              break;
            }
          }
        }
        // 注入场景模板和镜头术语
        const cameraTerms = PRODUCT_LIB.camera_terms ? Object.entries(PRODUCT_LIB.camera_terms).map(([k,v]) => k + '=' + v).join('；') : '';
        const lightTerms = PRODUCT_LIB.lighting_terms ? Object.entries(PRODUCT_LIB.lighting_terms).map(([k,v]) => k + '=' + v).join('；') : '';

        const systemPrompt = `你是一位顶级千川素材分析师，拥有10年以上短视频广告投放经验，专精于巨量千川信息流素材的深度分析与优化。

你的分析必须极其专业、详细、可落地。你要从一个资深投手和编导的双重视角来分析素材。

${productContext}

【专业镜头术语参考】${cameraTerms}
【专业灯光术语参考】${lightTerms}

【即梦提示词关键要求】
1. 必须用中文描述，200-400字
2. 必须明确指定：镜头类型(特写/中景/全景)、镜头运动(推/拉/摇/固定/跟随)、光线(自然柔光/环形灯/逆光)
3. 必须描述人物：性别、年龄、肤色、表情、服装、头发、动作细节
4. 产品描述必须精确到：品牌名、瓶身颜色、瓶型、膏体颜色、质地特征
5. 背景环境必须具体：场景类型、色调、道具摆设
6. 画面构图：主体位置、景深关系、画面比例
7. 动态描述：动作起止、速度节奏、转场方式

请严格按以下JSON格式输出分析结果（不要输出任何其他内容，只输出纯JSON）：

{
  "script_breakdown": [
    {
      "timestamp": "00:00-00:03",
      "scene": "场景描述",
      "voiceover": "口播文案/配音内容",
      "visual": "画面详细描述（镜头角度、运动方式、光线、人物动作）",
      "purpose": "这个镜头的营销目的（钩子/痛点/产品展示/信任背书/促单等）",
      "technique": "使用的拍摄/剪辑技巧"
    }
  ],
  "highlight_frames": [
    {
      "timestamp": "00:02-00:04",
      "description": "画面详细描述：包含场景、人物表情、产品位置、文字弹幕等所有视觉元素",
      "jimeng_prompt": "即梦AI视频生成提示词（极其关键，决定生成质量）。必须包含以下全部要素，缺一不可——镜头类型（特写/中景/全景）、镜头角度（俯拍/平拍/仰拍）、光线条件（自然光/柔光/逆光）、人物描述（年龄/性别/表情/动作/服装）、产品展示方式（手持/桌面/使用中）、背景环境（浴室/卧室/直播间）、色调风格（暖调/冷调/高对比）、画面构图（居中/三分法/对角线）、文字覆盖内容。示例：'特写镜头，25岁亚洲女性，素颜，柔和自然光从左侧45度照射，双手捧起泡沫丰富的洁面乳靠近面部，背景为白色简约浴室，暖色调，画面中央构图，底部有\"氨基酸温和不刺激\"黄色字幕条'",
      "ctr_impact": "high/medium/low",
      "why_effective": "为什么这个画面能吸引用户停留/点击的分析"
    }
  ],
  "creative_elements": {
    "scene_type": "拍摄场景（如：浴室实拍、直播间切片、口播+产品特写、情景剧、街头采访等）",
    "format_type": "呈现形式（如：真人口播、图文快切、产品测评、before-after对比、剧情演绎等）",
    "selling_points": ["核心卖点1", "核心卖点2", "辅助卖点"],
    "target_audience": "适用人群画像（年龄、性别、肤质、消费水平、关注点）",
    "pain_points": ["用户痛点1（具体描述场景化痛点）", "用户痛点2"],
    "use_scenarios": ["使用场景1", "使用场景2"],
    "hook_type": "钩子类型（悬念/痛点/反差/利益/恐吓/共鸣/争议）",
    "trust_elements": ["信任要素1（如：成分展示/专家背书/真人实测/数据对比）"]
  },
  "script_variations": [
    {
      "target": "品类潜在人群（痛点前置型）",
      "description": "针对还不了解产品品类、但有相关痛点的人群。脚本策略：先放大痛点场景引发共鸣，再自然引出产品作为解决方案",
      "script": [
        {"timestamp": "00:00-00:03", "content": "钩子：痛点场景化呈现", "visual": "画面描述"},
        {"timestamp": "00:03-00:08", "content": "痛点放大+共鸣", "visual": "画面描述"},
        {"timestamp": "00:08-00:15", "content": "产品引入+核心卖点", "visual": "画面描述"},
        {"timestamp": "00:15-00:20", "content": "使用效果+促单", "visual": "画面描述"}
      ],
      "estimated_duration": "20秒"
    },
    {
      "target": "产品潜在人群（直切产品型）",
      "description": "针对已了解品类、在对比选择的人群。脚本策略：直接展示产品差异化优势，用对比法建立认知",
      "script": [
        {"timestamp": "00:00-00:03", "content": "钩子：产品差异化展示", "visual": "画面描述"},
        {"timestamp": "00:03-00:10", "content": "产品优势对比", "visual": "画面描述"},
        {"timestamp": "00:10-00:18", "content": "使用体验+效果", "visual": "画面描述"},
        {"timestamp": "00:18-00:22", "content": "口碑+限时优惠", "visual": "画面描述"}
      ],
      "estimated_duration": "22秒"
    },
    {
      "target": "精准刚需人群（价格机制型）",
      "description": "针对已认可产品、等待合适价格下单的人群。脚本策略：直击价格优势和购买紧迫感",
      "script": [
        {"timestamp": "00:00-00:03", "content": "钩子：价格冲击/限时信息", "visual": "画面描述"},
        {"timestamp": "00:03-00:08", "content": "产品快速介绍+好评", "visual": "画面描述"},
        {"timestamp": "00:08-00:13", "content": "价格机制（买赠/满减/限量）", "visual": "画面描述"},
        {"timestamp": "00:13-00:16", "content": "紧迫感+行动引导", "visual": "画面描述"}
      ],
      "estimated_duration": "16秒"
    }
  ],
  "interaction_peaks": [
    {
      "timestamp": "00:02",
      "type": "attention_peak",
      "description": "注意力峰值原因分析",
      "estimated_retention": "85%"
    },
    {
      "timestamp": "00:08",
      "type": "engagement_peak",
      "description": "互动峰值原因分析",
      "estimated_retention": "60%"
    }
  ],
  "overall_assessment": {
    "score": 8,
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["不足1"],
    "optimization_suggestions": ["优化建议1", "优化建议2"]
  }
}`;

        const statsInfo = `素材标题：${mat.title || '未知'}
消耗：${mat.cost || 0}元
CTR：${mat.ctr || 0}%
ROI：${mat.roi || 0}
展示量：${mat.show_cnt || 0}
点击量：${mat.click_cnt || 0}
3秒完播率：${mat.play_duration_3s_rate || 0}%
完播率：${mat.play_over_rate || 0}%
视频时长：约${frameData.duration || '未知'}秒`;

        let analysisContent;

        if (frameData.frames.length > 0) {
          // 有视频帧 → 用视觉模型
          const imageUrls = frameData.frames.map(f => `data:image/jpeg;base64,${f.base64}`);
          const frameTimestamps = frameData.frames.map(f => f.time + 's').join('、');
          const userPrompt = `请对以下千川投放素材进行深度分析。

${statsInfo}

我提供了视频在 ${frameTimestamps} 处的截帧画面，请结合画面内容进行分析。

请严格按照JSON格式输出，不要输出任何其他文字。`;

          analysisContent = await callVisionAI(systemPrompt, userPrompt, imageUrls);
        } else if (mat.cover_url) {
          // 只有封面 → 用封面分析
          const userPrompt = `请对以下千川投放素材进行深度分析。

${statsInfo}

我提供了素材的封面图，请结合封面内容进行分析。由于无法看到完整视频，请基于封面和数据指标进行合理推断。

请严格按照JSON格式输出，不要输出任何其他文字。`;

          analysisContent = await callVisionAI(systemPrompt, userPrompt, [mat.cover_url]);
        } else {
          // 无图片 → 纯文本分析
          const userPrompt = `请对以下千川投放素材进行深度分析。

${statsInfo}

请严格按照JSON格式输出，不要输出任何其他文字。`;

          analysisContent = await callAI(systemPrompt, userPrompt);
        }

        // 解析AI返回的JSON
        let parsed;
        try {
          // 去除可能的markdown代码块标记
          let cleaned = analysisContent.trim();
          if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
          if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
          if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
          parsed = JSON.parse(cleaned.trim());
        } catch (e) {
          // JSON解析失败则存原文
          parsed = { raw_text: analysisContent };
          logger.warn(`${TAG} AI返回非JSON`, { id: analysisId });
        }

        const analysisJson = JSON.stringify(parsed);
        // 为高光帧匹配截帧图片URL
        const highlights = (parsed.highlight_frames || []).map((h, idx) => {
          const ts = parseFloat((h.timestamp || '').replace(/^0+:/, '').split('-')[0] || '0');
          let bestFrame = frameData.frames[0] || {};
          let minDiff = 999;
          for (const f of frameData.frames) {
            const diff = Math.abs(parseFloat(f.time || 0) - ts);
            if (diff < minDiff) { minDiff = diff; bestFrame = f; }
          }
          return { ...h, frame_url: bestFrame.url || null };
        });
        const highlightsJson = JSON.stringify(highlights);
        // 也更新 parsed 中的 highlight_frames
        parsed.highlight_frames = highlights;
        const scriptVariationsJson = JSON.stringify(parsed.script_variations || []);

        await db.query(
          `UPDATE qc_material_analysis 
           SET analysis_json = ?, highlights_json = ?, script_variations_json = ?, status = 'done'
           WHERE id = ?`,
          [analysisJson, highlightsJson, scriptVariationsJson, analysisId]
        );
        logger.info(`${TAG} 分析完成`, { id: analysisId, material_id });

      } catch (e) {
        logger.error(`${TAG} 分析失败`, { id: analysisId, error: e.message });
        await db.query(
          'UPDATE qc_material_analysis SET status = ?, error_msg = ? WHERE id = ?',
          ['failed', e.message.slice(0, 500), analysisId]
        );
      }
    })();

  } catch (e) {
    logger.error(`${TAG} analyze error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== POST /generate-from-highlight — 从高光画面生成视频 =====================
router.post('/generate-from-highlight', auth(), async (req, res) => {
  const { highlights, model = 'jimeng' } = req.body;
  if (!highlights || !Array.isArray(highlights) || !highlights.length) {
    return res.json({ code: 400, msg: '请提供高光画面数据' });
  }

  try {
    const results = [];

    for (const hl of highlights) {
      const { jimeng_prompt, duration = 5 } = hl;
      if (!jimeng_prompt) {
        results.push({ error: '缺少jimeng_prompt', status: 'skipped' });
        continue;
      }

      try {
        let taskId, provider;

        if (model === 'doubao') {
          const doubao = require('../services/doubao-seedance');
          taskId = await doubao.submitText2Video(jimeng_prompt, { duration, ratio: '9:16' });
          provider = 'doubao';
        } else {
          const jimeng = require('../services/jimeng');
          taskId = await jimeng.submitText2Video(jimeng_prompt, { duration, width: 720, height: 1280 });
          provider = 'jimeng';
        }

        results.push({ task_id: taskId, provider, prompt: jimeng_prompt.slice(0, 80), status: 'submitted' });
        logger.info(`${TAG} 高光视频生成已提交`, { taskId, provider });

      } catch (e) {
        logger.error(`${TAG} 高光视频提交失败`, { error: e.message });
        results.push({ error: e.message, prompt: jimeng_prompt.slice(0, 80), status: 'failed' });
      }
    }

    res.json({ code: 0, data: { tasks: results }, msg: `已提交${results.filter(r => r.status === 'submitted').length}个视频生成任务` });

  } catch (e) {
    logger.error(`${TAG} generate-from-highlight error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /analysis/:material_id — 获取已有分析结果 =====================
router.get('/analysis/:material_id', auth(), async (req, res) => {
  try {
    const { material_id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM qc_material_analysis WHERE material_id = ? ORDER BY created_at DESC LIMIT 1',
      [material_id]
    );

    if (!rows.length) return res.json({ code: 404, msg: '暂无分析结果' });

    const row = rows[0];
    // 解析JSON字段
    for (const field of ['analysis_json', 'highlights_json', 'script_variations_json']) {
      if (typeof row[field] === 'string') {
        try { row[field] = JSON.parse(row[field]); } catch (_) { /* keep as-is */ }
      }
    }

    res.json({ code: 0, data: row });
  } catch (e) {
    logger.error(`${TAG} get analysis error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /analysis-list — 分析记录列表 =====================
router.get('/analysis-list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND a.status = ?'; params.push(status); }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM qc_material_analysis a WHERE ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT a.*, s.title, s.video_url, s.cover_url, s.cost, s.product_ctr, s.play_duration_3s_rate
       FROM qc_material_analysis a
       LEFT JOIN qc_material_stats s ON a.material_id = s.material_id
       WHERE ${where}
       GROUP BY a.id
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), offset]
    );

    for (const row of rows) {
      for (const field of ['analysis_json', 'highlights_json', 'script_variations_json']) {
        if (typeof row[field] === 'string') {
          try { row[field] = JSON.parse(row[field]); } catch (_) { /* keep */ }
        }
      }
    }

    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    logger.error(`${TAG} analysis-list error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});


// GET /material-detail/:material_id
router.get('/material-detail/:material_id', auth(), async (req, res) => {
  try {
    const mid = req.params.material_id;
    const aid = req.query.advertiser_id;
    let where = 'material_id = ?';
    let params = [mid];
    if (aid) { where += ' AND advertiser_id = ?'; params.push(aid); }
    const [[row]] = await db.query(
      'SELECT material_id, advertiser_id, title, cost, pay_order_count, pay_order_amount, roi, show_cnt, click_cnt, ctr, convert_rate as product_convert_rate, video_play_count, video_finish_rate, cover_url, video_url FROM qc_material_stats WHERE ' + where + ' ORDER BY stat_date DESC LIMIT 1', params
    );
    if (!row) return res.json({ code: 404, msg: '素材不存在' });
    res.json({ code: 0, data: row });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});



// ===================== POST /image2video — 高光帧图生视频 =====================
router.post('/image2video', auth(), async (req, res) => {
  const { material_id, frame_url, prompt, model = 'jimeng', duration = 5 } = req.body;
  if (!frame_url) return res.json({ code: 400, msg: '请提供帧图片' });

  try {
    let taskId, provider;
    // 构建完整图片URL
    const fullImageUrl = frame_url.startsWith('http') ? frame_url : ('https://business.snefe.com' + frame_url);
    const imagePrompt = prompt || '根据图片生成相似的短视频画面，保持相同的构图、光线和色调';

    if (model === 'jimeng') {
      const jimeng = require('../services/jimeng');
      taskId = await jimeng.submitImage2Video(fullImageUrl, imagePrompt, { duration });
      provider = 'jimeng';
    } else if (model === 'doubao') {
      const doubao = require('../services/doubao-seedance');
      taskId = await doubao.submitImage2Video(fullImageUrl, imagePrompt, { duration, ratio: '9:16' });
      provider = 'doubao';
    } else {
      return res.json({ code: 400, msg: '图生视频暂仅支持即梦和豆包' });
    }

    // 保存到数据库
    await db.query(
      'INSERT INTO qc_runway_tasks (task_type, prompt_text, product_images, model, duration, status) VALUES (?,?,?,?,?,?)',
      ['image2video', imagePrompt, JSON.stringify([frame_url]), model === 'jimeng' ? 'jimeng_v30' : 'doubao_seed', duration, 'pending']
    );
    const [[row]] = await db.query('SELECT LAST_INSERT_ID() as id');

    // 后台轮询
    (async () => {
      const maxMs = 180000;
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          let result;
          if (provider === 'jimeng') {
            const jimeng = require('../services/jimeng');
            result = await jimeng.queryTask(taskId, model === 'jimeng' ? 'jimeng_i2v_v30_1080p' : undefined);
          } else {
            const doubao = require('../services/doubao-seedance');
            result = await doubao.queryTask(taskId);
          }
          if (result.status === 'done' && result.videoUrl) {
            await db.query('UPDATE qc_runway_tasks SET status=?, video_url=? WHERE id=?', ['done', result.videoUrl, row.id]);
            logger.info(`${TAG} 图生视频完成 id=${row.id}`, { videoUrl: result.videoUrl });
            return;
          }
          if (result.status === 'failed') {
            await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', JSON.stringify(result.raw).slice(0, 500), row.id]);
            return;
          }
        } catch (e) {
          logger.warn(`${TAG} 图生视频轮询异常`, { error: e.message });
        }
      }
      await db.query('UPDATE qc_runway_tasks SET status=?, error_msg=? WHERE id=?', ['failed', '超时', row.id]);
    })();

    logger.info(`${TAG} 图生视频任务提交 model=${model} taskId=${taskId}`);
    res.json({ code: 0, data: { task_id: row.id, provider_task_id: taskId, provider }, msg: '图生视频任务已提交' });
  } catch (e) {
    logger.error(`${TAG} 图生视频失败`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /image2video/status/:id — 查询图生视频状态 =====================
router.get('/image2video/status/:id', auth(), async (req, res) => {
  try {
    const [[task]] = await db.query('SELECT id, status, video_url, error_msg FROM qc_runway_tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.json({ code: 404, msg: '任务不存在' });
    res.json({ code: 0, data: task });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
