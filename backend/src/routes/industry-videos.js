const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');

// ========== 自动建表 ==========
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_industry_videos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500),
        author VARCHAR(200),
        author_fans VARCHAR(50),
        video_url VARCHAR(1000),
        cover_url VARCHAR(1000),
        likes INT DEFAULT 0,
        comments INT DEFAULT 0,
        shares INT DEFAULT 0,
        duration VARCHAR(20),
        publish_date VARCHAR(50),
        category VARCHAR(100) DEFAULT 'cleanser',
        tags JSON,
        source VARCHAR(50) DEFAULT 'ai',
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_likes (likes),
        INDEX idx_fetched (fetched_at)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_video_analysis (
        id INT AUTO_INCREMENT PRIMARY KEY,
        video_id INT,
        video_title VARCHAR(500),
        analysis_type VARCHAR(50) DEFAULT 'full',
        hook_analysis TEXT COMMENT '开头钩子分析',
        scene_breakdown TEXT COMMENT '分镜拆解',
        highlight_scenes TEXT COMMENT '高CTR画面',
        selling_points TEXT COMMENT '卖点提炼',
        script_structure TEXT COMMENT '脚本结构',
        copywriting TEXT COMMENT '文案话术',
        music_emotion TEXT COMMENT '音乐情绪',
        improvement TEXT COMMENT '可优化点',
        overall_score INT DEFAULT 0,
        full_analysis LONGTEXT COMMENT '完整分析报告',
        status ENUM('analyzing','done','failed') DEFAULT 'analyzing',
        error_msg VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_video (video_id),
        INDEX idx_status (status)
      )
    `);
    logger.info('[IndustryVideos] 表结构就绪');
  } catch (e) { /* tables exist */ }
})();

// ========== callAI ==========
async function callAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const resp = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    temperature: 0.7,
    max_tokens: 8000,
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 120000 });
  return resp.data.choices[0].message.content;
}

// ========== GET /list — 爆款视频列表 ==========
router.get('/list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 20, category = 'cleanser' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM qc_industry_videos WHERE category = ?', [category]
    );
    const [rows] = await db.query(
      'SELECT * FROM qc_industry_videos WHERE category = ? ORDER BY likes DESC, fetched_at DESC LIMIT ? OFFSET ?',
      [category, parseInt(page_size), offset]
    );
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /refresh — AI生成爆款视频数据 ==========
router.post('/refresh', auth(), async (req, res) => {
  try {
    const systemPrompt = `你是抖音洁面品类的资深数据分析师。请根据抖音平台当前洁面品类的爆款视频趋势，模拟生成10条真实的抖音洁面爆款视频数据。

要求：
1. 模拟真实的抖音爆款视频风格，标题要像真实爆款视频标题（有钩子、有悬念）
2. 数据要真实合理：点赞10万-500万，评论1000-10万，转发500-5万
3. 作者要像真实的抖音美妆博主（有粉丝量级）
4. 每条包含：
   - title（视频标题，模仿真实爆款标题风格）
   - author（博主名称）
   - author_fans（粉丝数，如"328.5万"）
   - likes（点赞数，纯数字）
   - comments（评论数，纯数字）
   - shares（转发数，纯数字）
   - duration（时长，如"28s""1:15"）
   - publish_date（发布时间，如"3天前""1周前"）
   - tags（2-3个标签，如"洁面""控油""氨基酸"）
   - content_type（内容类型：测评/教程/种草/对比/剧情）
5. 输出严格JSON数组格式

输出格式：
[{"title":"xxx","author":"xxx","author_fans":"xxx","likes":123456,"comments":1234,"shares":567,"duration":"28s","publish_date":"3天前","tags":["洁面","控油"],"content_type":"测评"}]`;

    const userPrompt = '请生成10条当前抖音洁面品类最火的爆款视频数据，要有真实感，覆盖不同内容类型。';

    logger.info('[IndustryVideos] 开始刷新爆款视频...');
    const result = await callAI(systemPrompt, userPrompt);

    let videos;
    try {
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      videos = JSON.parse(jsonStr);
    } catch (e) {
      logger.error('[IndustryVideos] JSON解析失败', { raw: result.slice(0, 500) });
      return res.json({ code: 500, msg: 'AI返回格式错误，请重试' });
    }

    if (!Array.isArray(videos) || videos.length === 0) {
      return res.json({ code: 500, msg: '未生成有效数据' });
    }

    const now = new Date();
    for (const v of videos) {
      await db.query(
        'INSERT INTO qc_industry_videos (title, author, author_fans, likes, comments, shares, duration, publish_date, category, tags, source, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [v.title, v.author, v.author_fans, v.likes || 0, v.comments || 0, v.shares || 0, v.duration || '', v.publish_date || '', 'cleanser', JSON.stringify(v.tags || []), 'ai', now]
      );
    }

    const [rows] = await db.query(
      'SELECT * FROM qc_industry_videos WHERE category = ? ORDER BY fetched_at DESC, likes DESC LIMIT 20',
      ['cleanser']
    );
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });

    logger.info('[IndustryVideos] 爆款视频刷新完成', { count: videos.length });
    res.json({ code: 0, data: { list: rows, total: rows.length }, msg: `已生成${videos.length}条爆款视频` });
  } catch (e) {
    logger.error('[IndustryVideos] refresh error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /analyze — AI分析拆解视频 ==========
router.post('/analyze', auth(), async (req, res) => {
  const { video_id, video_title, video_author, video_likes, video_duration, video_tags } = req.body;
  if (!video_title) return res.json({ code: 400, msg: '请选择视频' });

  try {
    const [insertResult] = await db.query(
      'INSERT INTO qc_video_analysis (video_id, video_title, status) VALUES (?,?,?)',
      [video_id || 0, video_title, 'analyzing']
    );
    const analysisId = insertResult.insertId;

    res.json({ code: 0, data: { id: analysisId }, msg: '分析中' });

    // 异步分析
    (async () => {
      try {
        const systemPrompt = `你是抖音短视频领域的顶级内容分析师，专注洁面护肤品类。你要对爆款视频进行专业级拆解分析。

分析维度和输出格式（严格按以下格式输出）：

━━━━━━━━━━━━━━━━━━━━━━
📊 爆款视频分析报告
━━━━━━━━━━━━━━━━━━━━━━
视频标题：${video_title}
作者：${video_author || '未知'}
数据：${video_likes ? video_likes + '赞' : ''} | 时长：${video_duration || '未知'}

━━━━━━━━━━━━━━━━━━━━━━
🎯 综合评分：X/10
━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━
🪝 一、开头钩子分析（前3秒）
━━━━━━━━━━━━━━━━━━━━━━
钩子类型：（悬念/痛点/反差/数据/争议/共鸣 等）
钩子内容：（具体描述前3秒画面和文案）
吸引力评分：X/10
为什么有效：
可复用话术：「（可以直接抄的开头话术）」

━━━━━━━━━━━━━━━━━━━━━━
🎬 二、分镜拆解
━━━━━━━━━━━━━━━━━━━━━━
【第1幕 | 0-3秒】
画面：
文案/口播：「」
镜头技巧：
作用：（钩子/铺垫/产品植入/效果展示等）

【第2幕 | 3-8秒】
画面：
文案/口播：「」
镜头技巧：
作用：

【第3幕 | 8-15秒】
画面：
文案/口播：「」
镜头技巧：
作用：

（继续拆解所有关键分镜...）

━━━━━━━━━━━━━━━━━━━━━━
⭐ 三、高CTR画面分析
━━━━━━━━━━━━━━━━━━━━━━
（列出3-5个最容易引起用户停留/互动的高转化画面）
1. 画面描述：
   为什么CTR高：
   可复用建议：

2. 画面描述：
   为什么CTR高：
   可复用建议：

━━━━━━━━━━━━━━━━━━━━━━
💎 四、卖点提炼
━━━━━━━━━━━━━━━━━━━━━━
核心卖点：
辅助卖点：
情感价值：
信任背书：（成分/数据/权威/真人实测等）

━━━━━━━━━━━━━━━━━━━━━━
📝 五、文案话术拆解
━━━━━━━━━━━━━━━━━━━━━━
金句摘录：（列出3-5句可直接复用的话术）
1. 「」
2. 「」
3. 「」
话术技巧：（使用了什么说服技巧）

━━━━━━━━━━━━━━━━━━━━━━
🎵 六、音乐/节奏分析
━━━━━━━━━━━━━━━━━━━━━━
BGM风格：
节奏特点：
情绪曲线：

━━━━━━━━━━━━━━━━━━━━━━
🔧 七、雪玲妃可复用建议
━━━━━━━━━━━━━━━━━━━━━━
1. 可直接复用的元素：
2. 需要调整的部分：
3. 推荐搭配产品：（雪玲妃具体产品）
4. 建议拍摄方案：（简述）`;

        const userPrompt = `请对以上抖音洁面爆款视频进行完整的专业分析拆解。标签：${(video_tags || []).join('、')}`;

        const content = await callAI(systemPrompt, userPrompt);

        await db.query(
          'UPDATE qc_video_analysis SET full_analysis = ?, overall_score = ?, status = ? WHERE id = ?',
          [content, 8, 'done', analysisId]
        );
        logger.info('[IndustryVideos] 视频分析完成', { id: analysisId });
      } catch (e) {
        logger.error('[IndustryVideos] 分析失败', { id: analysisId, error: e.message });
        await db.query(
          'UPDATE qc_video_analysis SET status = ?, error_msg = ? WHERE id = ?',
          ['failed', e.message, analysisId]
        );
      }
    })();
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /analysis/list — 分析记录 ==========
router.get('/analysis/list', auth(), async (req, res) => {
  try {
    const { video_id, page = 1, page_size = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = '1=1';
    const params = [];
    if (video_id) { where += ' AND video_id = ?'; params.push(video_id); }
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM qc_video_analysis WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM qc_video_analysis WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), offset]
    );
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /analysis/:id ==========
router.get('/analysis/:id', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM qc_video_analysis WHERE id = ?', [req.params.id]);
    if (!row) return res.json({ code: 404, msg: '不存在' });
    res.json({ code: 0, data: row });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
