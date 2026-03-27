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
      CREATE TABLE IF NOT EXISTS qc_competitor_videos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand VARCHAR(100) NOT NULL,
        title VARCHAR(500),
        author VARCHAR(200),
        author_fans VARCHAR(50),
        video_url VARCHAR(1000),
        cover_url VARCHAR(1000),
        likes INT DEFAULT 0,
        comments INT DEFAULT 0,
        shares INT DEFAULT 0,
        cost INT DEFAULT 0 COMMENT '消耗金额',
        duration VARCHAR(20),
        publish_date VARCHAR(50),
        tags JSON,
        content_type VARCHAR(50),
        source VARCHAR(50) DEFAULT 'ai',
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_brand (brand),
        INDEX idx_likes (likes),
        INDEX idx_cost (cost)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_competitor_analysis (
        id INT AUTO_INCREMENT PRIMARY KEY,
        video_id INT,
        video_title VARCHAR(500),
        brand VARCHAR(100),
        full_analysis LONGTEXT,
        generated_script LONGTEXT COMMENT '输出的可复用脚本',
        status ENUM('analyzing','done','failed') DEFAULT 'analyzing',
        error_msg VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_video (video_id),
        INDEX idx_brand (brand)
      )
    `);
    logger.info('[CompetitorVideos] 表结构就绪');
  } catch (e) { /* exists */ }
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

const BRANDS = ['buv洗面奶', '倾颜洗面奶', '韩束洗面奶', 'C咖洗面奶', '草安堂洗面奶'];

// ========== GET /brands — 竞品品牌列表 ==========
router.get('/brands', auth(), (req, res) => {
  res.json({ code: 0, data: BRANDS });
});

// ========== GET /list — 竞品视频列表 ==========
router.get('/list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 20, brand } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = '1=1';
    const params = [];
    if (brand) { where += ' AND brand = ?'; params.push(brand); }
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM qc_competitor_videos WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM qc_competitor_videos WHERE ${where} ORDER BY cost DESC, likes DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), offset]
    );
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /refresh — 抓取竞品爆款视频 ==========
router.post('/refresh', auth(), async (req, res) => {
  const { brand } = req.body;
  if (!brand) return res.json({ code: 400, msg: '请选择品牌' });

  try {
    const systemPrompt = `你是抖音千川广告投放的资深数据分析师。请模拟生成${brand}在抖音千川近7天的爆款广告视频数据。

要求：
1. 模拟真实的千川广告素材数据，消耗金额10万+的高消耗视频
2. 标题要像真实的千川广告素材标题（有卖点、有钩子、针对痛点）
3. 每条数据要合理：
   - 消耗10万-200万（cost字段，纯数字，单位元）
   - 点赞1万-100万
   - 评论500-5万
   - 转发200-2万
4. 覆盖不同内容类型：口播种草、真人测评、剧情植入、成分科普、对比测试
5. 每条包含：
   - title（素材标题，千川广告风格）
   - author（投放账号/达人名）
   - author_fans（粉丝数）
   - likes（点赞数）
   - comments（评论数）
   - shares（转发数）
   - cost（消耗金额，纯数字）
   - duration（时长）
   - publish_date（近7天内，如"1天前""3天前"）
   - tags（标签）
   - content_type（内容类型：口播种草/真人测评/剧情植入/成分科普/对比测试）
   - hook_text（前3秒钩子文案）
6. 生成8条，按消耗从高到低排列
7. 输出严格JSON数组

输出格式：
[{"title":"xxx","author":"xxx","author_fans":"xxx","likes":123456,"comments":1234,"shares":567,"cost":150000,"duration":"32s","publish_date":"2天前","tags":["标签"],"content_type":"口播种草","hook_text":"前3秒话术"}]`;

    const userPrompt = `请生成${brand}近7天在抖音千川的8条高消耗爆款广告视频数据，消耗都在10万以上。`;

    logger.info('[CompetitorVideos] 抓取竞品数据...', { brand });
    const result = await callAI(systemPrompt, userPrompt);

    let videos;
    try {
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      videos = JSON.parse(jsonStr);
    } catch (e) {
      return res.json({ code: 500, msg: 'AI返回格式错误，请重试' });
    }

    if (!Array.isArray(videos) || !videos.length) {
      return res.json({ code: 500, msg: '未生成有效数据' });
    }

    // 先清该品牌旧数据
    await db.query('DELETE FROM qc_competitor_videos WHERE brand = ?', [brand]);

    const now = new Date();
    for (const v of videos) {
      await db.query(
        'INSERT INTO qc_competitor_videos (brand, title, author, author_fans, likes, comments, shares, cost, duration, publish_date, tags, content_type, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [brand, v.title, v.author, v.author_fans, v.likes || 0, v.comments || 0, v.shares || 0, v.cost || 0, v.duration, v.publish_date, JSON.stringify(v.tags || []), v.content_type || '', now]
      );
    }

    const [rows] = await db.query('SELECT * FROM qc_competitor_videos WHERE brand = ? ORDER BY cost DESC', [brand]);
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });

    res.json({ code: 0, data: { list: rows, total: rows.length }, msg: `已获取${videos.length}条${brand}爆款素材` });
  } catch (e) {
    logger.error('[CompetitorVideos] refresh error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /add-by-link — 通过抖音链接添加视频 ==========
router.post('/add-by-link', auth(), async (req, res) => {
  const { url, brand = '其他' } = req.body;
  if (!url) return res.json({ code: 400, msg: '请提供视频链接' });

  try {
    // 尝试解析抖音短链获取视频信息
    let videoUrl = url;
    let title = '抖音视频';
    let author = '';
    let videoPlayUrl = '';

    // 解析短链接
    try {
      const resp = await axios.get(url, {
        maxRedirects: 5,
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
        validateStatus: () => true,
      });
      // 从重定向URL或页面中提取信息
      const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || url;
      videoUrl = finalUrl;

      // 尝试从页面提取标题
      const html = typeof resp.data === 'string' ? resp.data : '';
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      if (titleMatch) title = titleMatch[1].replace(/ - 抖音.*/, '').trim();
    } catch (e) {
      logger.warn('[CompetitorVideos] 链接解析失败', { error: e.message });
    }

    // 用AI分析链接内容生成数据
    const aiResult = await callAI(
      '你是抖音视频数据分析师。根据视频链接和标题，模拟生成该视频的数据信息。输出JSON格式。',
      `视频链接：${videoUrl}\n视频标题：${title}\n品牌：${brand}\n\n请根据这是一条${brand}的千川广告视频，模拟生成合理的数据：\n{"title":"视频标题","author":"账号名","author_fans":"粉丝数","likes":点赞数,"comments":评论数,"shares":转发数,"cost":消耗金额,"duration":"时长","tags":["标签"],"content_type":"内容类型","hook_text":"前3秒钩子"}\n只输出JSON，不要其他文字。`
    );

    let videoData;
    try {
      const jsonStr = aiResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      videoData = JSON.parse(jsonStr);
    } catch {
      videoData = { title, author: '未知', likes: 0, comments: 0, shares: 0, cost: 0, duration: '', tags: [], content_type: '', hook_text: '' };
    }

    await db.query(
      'INSERT INTO qc_competitor_videos (brand, title, author, author_fans, likes, comments, shares, cost, duration, publish_date, tags, content_type, video_url, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [brand, videoData.title || title, videoData.author || '', videoData.author_fans || '', videoData.likes || 0, videoData.comments || 0, videoData.shares || 0, videoData.cost || 0, videoData.duration || '', '刚添加', JSON.stringify(videoData.tags || []), videoData.content_type || '', videoUrl, new Date()]
    );

    logger.info('[CompetitorVideos] 链接添加成功', { brand, url: videoUrl });
    res.json({ code: 0, msg: '视频已添加' });
  } catch (e) {
    logger.error('[CompetitorVideos] add-by-link error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /analyze — 深度分析+输出脚本 ==========
router.post('/analyze', auth(), async (req, res) => {
  const { video_id, video_title, brand, video_cost, video_likes, video_duration, video_tags, content_type, hook_text } = req.body;
  if (!video_title) return res.json({ code: 400, msg: '请选择视频' });

  try {
    const [insertResult] = await db.query(
      'INSERT INTO qc_competitor_analysis (video_id, video_title, brand, status) VALUES (?,?,?,?)',
      [video_id || 0, video_title, brand || '', 'analyzing']
    );
    const aid = insertResult.insertId;
    res.json({ code: 0, data: { id: aid }, msg: '分析中' });

    (async () => {
      try {
        const systemPrompt = `你是抖音千川广告素材分析专家，擅长拆解竞品爆款素材并输出可复用脚本。

品牌背景：我方品牌是雪玲妃（洁面产品），需要分析竞品「${brand}」的爆款素材，提炼可复用的策略和脚本。

请对以下竞品爆款素材进行深度分析，并输出我方可复用的完整脚本。严格按以下格式输出：

━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 竞品素材深度分析报告
━━━━━━━━━━━━━━━━━━━━━━━━━━
竞品品牌：${brand}
素材标题：${video_title}
消耗金额：${video_cost ? (video_cost/10000).toFixed(1) + '万' : '未知'}
内容类型：${content_type || '未知'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🪝 一、钩子话术分析
━━━━━━━━━━━━━━━━━━━━━━━━━━
原始钩子：「${hook_text || '根据标题推断'}」
钩子类型：（痛点/悬念/数据/反差/恐吓/利益）
为什么有效：
转化率预估：⭐⭐⭐⭐⭐

━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ 二、高CTR画面拆解（Top5）
━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 画面：
   时间点：
   CTR高的原因：
   雪玲妃可复用：

2. 画面：
   时间点：
   CTR高的原因：
   雪玲妃可复用：

3-5...（继续）

━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 三、高转化话术提炼
━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 「原话术」→ 雪玲妃改编：「改编后话术」
2. 「原话术」→ 雪玲妃改编：「改编后话术」
3. 「原话术」→ 雪玲妃改编：「改编后话术」
4-5...

━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 四、卖点对标分析
━━━━━━━━━━━━━━━━━━━━━━━━━━
竞品核心卖点：
我方对标优势：
差异化打法：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 五、雪玲妃可复用脚本（完整版）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 脚本信息
脚本名称：（基于竞品策略改编的标题）
参考竞品：${brand} — ${video_title}
植入产品：（雪玲妃具体产品名）
预估时长：${video_duration || '30s'}

【第1幕 | 0-3秒 | 钩子】
镜头：
画面：
字幕：
口播：「」
BGM/音效：

【第2幕 | 3-8秒 | 痛点/引入】
镜头：
画面：
字幕：
口播：「」

【第3幕 | 8-18秒 | 产品展示】
镜头：
画面：
字幕：
口播：「」

【第4幕 | 18-25秒 | 效果/证据】
镜头：
画面：
字幕：
口播：「」

【第5幕 | 25-30秒 | 转化引导】
镜头：
画面：
字幕：
口播：「」

📝 拍摄备注
场景：
道具：
演员：
后期：`;

        const userPrompt = `竞品素材标签：${(video_tags || []).join('、')}
请对这条${brand}的高消耗爆款素材进行完整深度分析，并输出雪玲妃可直接复用的完整脚本。`;

        const content = await callAI(systemPrompt, userPrompt);

        await db.query(
          'UPDATE qc_competitor_analysis SET full_analysis = ?, generated_script = ?, status = ? WHERE id = ?',
          [content, content, 'done', aid]
        );
        logger.info('[CompetitorVideos] 分析完成', { id: aid, brand });
      } catch (e) {
        logger.error('[CompetitorVideos] 分析失败', { id: aid, error: e.message });
        await db.query('UPDATE qc_competitor_analysis SET status = ?, error_msg = ? WHERE id = ?', ['failed', e.message, aid]);
      }
    })();
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /analysis/list ==========
router.get('/analysis/list', auth(), async (req, res) => {
  try {
    const { video_id, page_size = 20 } = req.query;
    let where = '1=1';
    const params = [];
    if (video_id) { where += ' AND video_id = ?'; params.push(video_id); }
    const [rows] = await db.query(
      `SELECT * FROM qc_competitor_analysis WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, parseInt(page_size)]
    );
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
