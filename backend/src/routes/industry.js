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
      CREATE TABLE IF NOT EXISTS qc_industry_hotspots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        heat_score INT DEFAULT 0,
        category VARCHAR(100) DEFAULT 'beauty',
        source VARCHAR(50) DEFAULT 'ai',
        tags JSON,
        target_audience VARCHAR(200),
        hook_angle VARCHAR(500),
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_heat (heat_score),
        INDEX idx_fetched (fetched_at)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_industry_scripts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hotspot_id INT,
        topic_title VARCHAR(500),
        user_prompt TEXT,
        script_type VARCHAR(50) DEFAULT 'short_video',
        script_content LONGTEXT,
        status ENUM('generating','done','failed') DEFAULT 'generating',
        error_msg VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_hotspot (hotspot_id),
        INDEX idx_status (status)
      )
    `);
    // 补充新字段（已有表兼容）
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN target_audience VARCHAR(200) AFTER tags').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN hook_angle VARCHAR(500) AFTER target_audience').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN recommend_score INT DEFAULT 0 AFTER hook_angle').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN recommend_reason VARCHAR(500) AFTER recommend_score').catch(() => {});
    logger.info('[Industry] 表结构就绪');
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
    temperature: 0.8,
    max_tokens: 8000,
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 120000 });
  return resp.data.choices[0].message.content;
}

// ========== GET /hotspots — 热点列表 ==========
router.get('/hotspots', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 20, category = 'beauty' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM qc_industry_hotspots WHERE category = ?', [category]
    );
    const [rows] = await db.query(
      'SELECT * FROM qc_industry_hotspots WHERE category = ? ORDER BY fetched_at DESC, heat_score DESC LIMIT ? OFFSET ?',
      [category, parseInt(page_size), offset]
    );
    // 解析tags JSON
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    logger.error('[Industry] hotspots list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /hotspots/refresh — AI生成热点 ==========
router.post('/hotspots/refresh', auth(), async (req, res) => {
  try {
    const systemPrompt = `你是抖音平台的资深热点分析师。请根据当前抖音全站热门趋势，生成10条抖音热搜话题。

要求：
1. 必须是抖音全站热点，不限于美妆，涵盖：社会热点、娱乐八卦、影视综艺、搞笑段子、生活方式、情感话题、职场、健康养生、美食、运动等各领域
2. 话题要模仿真实的抖音热搜榜风格，标题简短、有话题性
3. 每条包含：
   - title（标题，模仿真实抖音热搜格式，如"xxx引发热议""xxx也太绝了"）
   - description（2-3句话描述热点内容）
   - heat_score（热度，模拟真实抖音热搜量级：500万-5000万）
   - tags（2-3个标签）
   - target_audience（对这个热点感兴趣的人群画像）
   - hook_angle（美妆护肤品牌如何蹭这个热点做内容，给出具体角度）
   - recommend_score（推荐指数1-5星，评判标准：与美妆护肤的关联度、蹭热点难度、预期转化效果、时效性）
   - recommend_reason（一句话说明推荐理由，如"与控油话题高度关联，可直接植入洁面产品"）
4. 输出严格JSON数组格式，不要有其他文字
5. 按recommend_score从高到低排列

关键：话题本身是全站热点，hook_angle是教品牌方如何把这个热点和美妆护肤产品结合起来做内容。recommend_score越高表示越适合我们品牌蹭。

输出格式：
[{"title":"xxx","description":"xxx","heat_score":12345678,"tags":["标签1","标签2"],"target_audience":"人群描述","hook_angle":"蹭热点角度","recommend_score":5,"recommend_reason":"推荐理由"}]`;

    const userPrompt = '请生成10条当前抖音全站最火的热搜话题（不限品类），并给出每条热点美妆护肤品牌可以蹭的内容角度和目标人群画像。';

    logger.info('[Industry] 开始刷新热点...');
    const result = await callAI(systemPrompt, userPrompt);

    // 解析JSON
    let topics;
    try {
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      topics = JSON.parse(jsonStr);
    } catch (e) {
      logger.error('[Industry] JSON解析失败', { raw: result.slice(0, 500) });
      return res.json({ code: 500, msg: 'AI返回格式错误，请重试' });
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      return res.json({ code: 500, msg: '未生成有效热点' });
    }

    // 写入数据库
    const now = new Date();
    for (const t of topics) {
      await db.query(
        'INSERT INTO qc_industry_hotspots (title, description, heat_score, category, source, tags, target_audience, hook_angle, recommend_score, recommend_reason, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [t.title, t.description, t.heat_score || 0, 'beauty', 'ai', JSON.stringify(t.tags || []), t.target_audience || '', t.hook_angle || '', t.recommend_score || 0, t.recommend_reason || '', now]
      );
    }

    // 返回最新数据
    const [rows] = await db.query(
      'SELECT * FROM qc_industry_hotspots WHERE category = ? ORDER BY fetched_at DESC, heat_score DESC LIMIT 20',
      ['beauty']
    );
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });

    logger.info('[Industry] 热点刷新完成', { count: topics.length });
    res.json({ code: 0, data: { list: rows, total: rows.length }, msg: `已生成${topics.length}条热点` });
  } catch (e) {
    logger.error('[Industry] refresh error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /scripts/generate — 生成脚本 ==========
router.post('/scripts/generate', auth(), async (req, res) => {
  const { hotspot_id, topic_title, topic_description, target_audience, hook_angle, script_type = 'short_video', custom_prompt = '' } = req.body;
  if (!topic_title) return res.json({ code: 400, msg: '请选择热点话题' });

  try {
    // 先插入数据库
    const [insertResult] = await db.query(
      'INSERT INTO qc_industry_scripts (hotspot_id, topic_title, user_prompt, script_type, status) VALUES (?,?,?,?,?)',
      [hotspot_id || 0, topic_title, custom_prompt, script_type, 'generating']
    );
    const scriptId = insertResult.insertId;

    res.json({ code: 0, data: { id: scriptId }, msg: '脚本生成中' });

    // 异步生成
    (async () => {
      try {
        const typeLabels = {
          short_video: '30秒短视频脚本',
          live_intro: '直播开场话术（1-2分钟）',
          product_review: '产品测评脚本（1-3分钟）',
        };
        const typeLabel = typeLabels[script_type] || '短视频脚本';

        const scriptFormats = {
          short_video: `请严格按以下标准短视频脚本格式输出（30秒）：

━━━━━━━━━━━━━━━━━━━━━━
📋 脚本基本信息
━━━━━━━━━━━━━━━━━━━━━━
脚本名称：（根据热点起一个吸引人的标题）
视频时长：30秒
视频比例：9:16竖屏
📌蹭热点策略：（一句话说明如何借势热点）
👥目标人群：（人群画像）
🧴植入产品：（雪玲妃具体产品名）

━━━━━━━━━━━━━━━━━━━━━━
🎬 分镜脚本
━━━━━━━━━━━━━━━━━━━━━━

【第1幕 | 0-3秒 | 钩子】
镜头：（镜头描述：景别、运镜、画面内容）
画面：（画面具体内容描述）
字幕：（屏幕上显示的文字）
口播：「（演员/博主说的台词）」
BGM/音效：（背景音乐或音效描述）

【第2幕 | 3-8秒 | 痛点引入】
镜头：
画面：
字幕：
口播：「」
BGM/音效：

【第3幕 | 8-18秒 | 产品展示+使用过程】
镜头：
画面：
字幕：
口播：「」
BGM/音效：

【第4幕 | 18-25秒 | 效果展示】
镜头：
画面：
字幕：
口播：「」
BGM/音效：

【第5幕 | 25-30秒 | 引导转化】
镜头：
画面：
字幕：
口播：「」
BGM/音效：

━━━━━━━━━━━━━━━━━━━━━━
📝 拍摄备注
━━━━━━━━━━━━━━━━━━━━━━
场景要求：
道具清单：
演员要求：
后期要求：（剪辑节奏、特效、转场等）`,

          live_intro: `请严格按以下标准直播开场脚本格式输出（1-2分钟）：

━━━━━━━━━━━━━━━━━━━━━━
📋 脚本基本信息
━━━━━━━━━━━━━━━━━━━━━━
直播主题：（根据热点起主题）
预计时长：1-2分钟
📌蹭热点策略：
👥目标人群：
🧴植入产品：

━━━━━━━━━━━━━━━━━━━━━━
🎙️ 直播开场话术
━━━━━━━━━━━━━━━━━━━━━━

【开场 | 0-15秒 | 热点引入+留人】
主播话术：「（具体台词，要有感染力，用热点话题引入）」
互动引导：（引导观众扣1、点赞等）
画面动作：（主播做什么动作/展示什么）

【过渡 | 15-30秒 | 痛点共鸣】
主播话术：「」
互动引导：
画面动作：

【产品引入 | 30-60秒 | 展示产品】
主播话术：「」
产品展示：（怎么展示产品、试用演示）
互动引导：

【促单 | 60-90秒 | 引导下单】
主播话术：「」
促销信息：（价格、优惠、限时等）
互动引导：

━━━━━━━━━━━━━━━━━━━━━━
📝 直播备注
━━━━━━━━━━━━━━━━━━━━━━
场景布置：
道具准备：
话术技巧提示：`,

          product_review: `请严格按以下标准产品测评脚本格式输出（1-3分钟）：

━━━━━━━━━━━━━━━━━━━━━━
📋 脚本基本信息
━━━━━━━━━━━━━━━━━━━━━━
测评标题：（根据热点起标题）
视频时长：1-3分钟
视频比例：9:16竖屏
📌蹭热点策略：
👥目标人群：
🧴测评产品：

━━━━━━━━━━━━━━━━━━━━━━
🎬 分镜脚本
━━━━━━━━━━━━━━━━━━━━━━

【开场 | 0-5秒 | 钩子+热点切入】
镜头：
画面：
字幕：
口播：「」

【问题引入 | 5-15秒 | 用户痛点】
镜头：
画面：
字幕：
口播：「」

【产品介绍 | 15-40秒 | 成分/卖点讲解】
镜头：
画面：
字幕：
口播：「」
产品特写：（展示包装、质地、成分表等）

【实测环节 | 40-90秒 | 上手试用】
镜头：
画面：
字幕：
口播：「」
测试方法：（具体测试步骤）

【效果对比 | 90-120秒 | 使用前后】
镜头：
画面：
字幕：
口播：「」

【总结推荐 | 120-150秒 | 引导转化】
镜头：
画面：
字幕：
口播：「」
引导动作：

━━━━━━━━━━━━━━━━━━━━━━
📝 拍摄备注
━━━━━━━━━━━━━━━━━━━━━━
场景要求：
道具清单：
演员要求：
后期要求：`
        };

        const systemPrompt = `你是抖音美妆领域的顶级编导和内容策划师，擅长蹭热点做高转化内容。

品牌信息：
- 品牌名：雪玲妃
- 主打产品：绿泥控油洁面膏、氨基酸洗面奶、卸妆水、控油散粉、面膜
- 核心卖点：控油清洁、温和不刺激、高性价比、学生党友好
- 目标用户：18-30岁年轻女性，油皮/混油皮为主

人群分层策略（根据目标人群类型调整内容策略）：
- 品类潜在（痛点前置）：用户还没意识到需要这类产品，脚本要先放大痛点（如出油、黑头、毛孔粗大），用热点话题引出痛点场景，再自然引出产品作为解决方案。重点：痛点共鸣→场景代入→产品救赎
- 产品潜在（直切产品）：用户已有品类需求但还没选定品牌，脚本要直接展示产品优势、对比竞品、突出差异化卖点。重点：产品开箱→成分/功效讲解→使用效果→品牌信任背书
- 精准刚需（价格机制）：用户已经想买，需要临门一脚，脚本要强调限时优惠、买赠活动、性价比计算、库存紧张。重点：价格锚点→优惠力度→限时紧迫感→立即下单引导

要求：
1. 必须植入雪玲妃具体产品（写明产品全名），场景化软植入
2. 内容要口语化、接地气，符合抖音用户习惯
3. 每个分镜的镜头描述要具体（景别、运镜方式、画面内容）
4. 口播台词要自然流畅，像真人说话
5. 字幕要有吸引力，适合竖屏观看
6. 严格按照目标人群类型的策略来调整脚本内容方向和话术风格
7. 严格按照下方的脚本格式模板填写，每个字段都要填完整，不要省略

${scriptFormats[script_type] || scriptFormats.short_video}`;

        const userPrompt = `热点话题：${topic_title}
话题描述：${topic_description || ''}
${target_audience ? '目标人群：' + target_audience : ''}
${hook_angle ? '蹭热点角度：' + hook_angle : ''}
${custom_prompt ? '额外要求：' + custom_prompt : ''}

请严格按照上面的脚本格式模板，生成一份完整的${typeLabel}，每个字段都要填写，不要省略任何部分：`;

        const content = await callAI(systemPrompt, userPrompt);

        await db.query(
          'UPDATE qc_industry_scripts SET script_content = ?, status = ? WHERE id = ?',
          [content, 'done', scriptId]
        );
        logger.info('[Industry] 脚本生成完成', { id: scriptId });
      } catch (e) {
        logger.error('[Industry] 脚本生成失败', { id: scriptId, error: e.message });
        await db.query(
          'UPDATE qc_industry_scripts SET status = ?, error_msg = ? WHERE id = ?',
          ['failed', e.message, scriptId]
        );
      }
    })();
  } catch (e) {
    logger.error('[Industry] scripts/generate error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /scripts/list — 脚本列表 ==========
router.get('/scripts/list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 50, hotspot_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = '1=1';
    const params = [];
    if (hotspot_id) { where += ' AND hotspot_id = ?'; params.push(hotspot_id); }
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM qc_industry_scripts WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM qc_industry_scripts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), offset]
    );
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /scripts/:id — 脚本详情 ==========
router.get('/scripts/:id', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM qc_industry_scripts WHERE id = ?', [req.params.id]);
    if (!row) return res.json({ code: 404, msg: '脚本不存在' });
    res.json({ code: 0, data: row });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
