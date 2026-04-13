const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const douyin = require('../services/douyin');

// ========== 自动建表 ==========
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_industry_hotspots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        heat_score BIGINT DEFAULT 0,
        category VARCHAR(100) DEFAULT 'all',
        source VARCHAR(50) DEFAULT 'douyin',
        tags JSON,
        label INT DEFAULT 0 COMMENT '0普通 1新 2热 3推荐',
        sentence_id VARCHAR(100),
        target_audience VARCHAR(200),
        hook_angle VARCHAR(500),
        recommend_score INT DEFAULT 0,
        recommend_reason VARCHAR(500),
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
    // 兼容旧表
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN target_audience VARCHAR(200) AFTER tags').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN hook_angle VARCHAR(500) AFTER target_audience').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN recommend_score INT DEFAULT 0 AFTER hook_angle').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN recommend_reason VARCHAR(500) AFTER recommend_score').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN sentence_id VARCHAR(100) AFTER tags').catch(() => {});
    await db.query('ALTER TABLE qc_industry_hotspots ADD COLUMN label INT DEFAULT 0 AFTER heat_score').catch(() => {});
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
    max_tokens: 4000,
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 120000 });
  return resp.data.choices[0].message.content;
}

// ========== GET /hotspots — 热点列表（优先返回缓存，超过2小时自动刷新） ==========
router.get('/hotspots', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    // 检查最新数据时间
    const [[latest]] = await db.query('SELECT MAX(fetched_at) as last_fetch FROM qc_industry_hotspots WHERE source="douyin"');
    const lastFetch = latest?.last_fetch ? new Date(latest.last_fetch) : null;
    const isStale = !lastFetch || (Date.now() - lastFetch.getTime() > 2 * 3600000);

    // 如果数据超过2小时，后台异步刷新
    if (isStale) {
      refreshHotspotsFromDouyin().catch(e => logger.error('[Industry] 后台刷新热搜失败', { error: e.message }));
    }

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM qc_industry_hotspots');
    const [rows] = await db.query(
      'SELECT * FROM qc_industry_hotspots ORDER BY fetched_at DESC, heat_score DESC LIMIT ? OFFSET ?',
      [parseInt(page_size), offset]
    );
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });
    res.json({ code: 0, data: { list: rows, total, last_fetch: lastFetch, is_realtime: !isStale } });
  } catch (e) {
    logger.error('[Industry] hotspots list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== 从抖音真实API获取热搜 ==========
async function refreshHotspotsFromDouyin() {
  logger.info('[Industry] 开始从抖音获取真实热搜...');
  const hotList = await douyin.getHotSearchList();
  if (!hotList || hotList.length === 0) {
    logger.warn('[Industry] 抖音热搜API返回空');
    return [];
  }

  // 清除旧数据，写入新数据
  await db.query('DELETE FROM qc_industry_hotspots WHERE source="douyin"');
  const now = new Date();
  for (const item of hotList) {
    await db.query(
      'INSERT INTO qc_industry_hotspots (title, heat_score, label, category, source, sentence_id, fetched_at) VALUES (?,?,?,?,?,?,?)',
      [item.title, item.hotValue || 0, item.label || 0, 'all', 'douyin', item.sentence_id || '', now]
    );
  }
  logger.info('[Industry] 抖音真实热搜已更新', { count: hotList.length });
  return hotList;
}

// ========== POST /hotspots/refresh — 手动刷新（真实数据 + AI分析蹭热点角度） ==========
router.post('/hotspots/refresh', auth(), async (req, res) => {
  try {
    // Step 1: 获取真实热搜
    const hotList = await refreshHotspotsFromDouyin();
    if (!hotList || hotList.length === 0) {
      return res.json({ code: 500, msg: '抖音热搜API暂时无法访问，请稍后重试' });
    }

    // Step 2: AI分析TOP20热搜的美妆蹭热点角度（异步，不阻塞返回）
    const top20 = hotList.slice(0, 20);
    (async () => {
      try {
        const topicsStr = top20.map((h, i) => `${i + 1}. ${h.title} (热度:${h.hotValue})`).join('\n');
        const aiResult = await callAI(
          `你是美妆护肤品牌的内容策划专家。品牌：雪玲妃，主打控油洁面。
请分析以下抖音真实热搜话题，给出美妆护肤品牌可以蹭热点的角度。
对每个话题输出JSON数组：[{"index":1,"hook_angle":"蹭热点角度","target_audience":"目标人群","recommend_score":1-5,"recommend_reason":"推荐理由"}]
recommend_score标准：5=强关联可直接植入，4=中关联可巧妙结合，3=弱关联需创意切入，2=勉强关联，1=不相关
只输出JSON数组，不要其他文字。`,
          topicsStr
        );

        let analysis;
        try {
          const jsonStr = aiResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          analysis = JSON.parse(jsonStr);
        } catch { analysis = []; }

        // 更新数据库
        const [rows] = await db.query('SELECT id, title FROM qc_industry_hotspots WHERE source="douyin" ORDER BY heat_score DESC LIMIT 20');
        for (const a of analysis) {
          const row = rows[a.index - 1];
          if (row) {
            await db.query(
              'UPDATE qc_industry_hotspots SET hook_angle=?, target_audience=?, recommend_score=?, recommend_reason=? WHERE id=?',
              [a.hook_angle || '', a.target_audience || '', a.recommend_score || 0, a.recommend_reason || '', row.id]
            );
          }
        }
        logger.info('[Industry] AI蹭热点分析完成');
      } catch (e) {
        logger.error('[Industry] AI分析失败', { error: e.message });
      }
    })();

    // 立即返回真实热搜数据
    const [rows] = await db.query('SELECT * FROM qc_industry_hotspots WHERE source="douyin" ORDER BY heat_score DESC LIMIT 50');
    rows.forEach(r => {
      try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; }
    });
    res.json({ code: 0, data: { list: rows, total: rows.length }, msg: `已获取${hotList.length}条真实热搜，AI分析角度生成中...` });
  } catch (e) {
    logger.error('[Industry] refresh error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /scripts/generate — 生成脚本（保留AI功能） ==========
router.post('/scripts/generate', auth(), async (req, res) => {
  const { hotspot_id, topic_title, topic_description, target_audience, hook_angle, script_type = 'short_video', custom_prompt = '' } = req.body;
  if (!topic_title) return res.json({ code: 400, msg: '请选择热点话题' });

  try {
    const [insertResult] = await db.query(
      'INSERT INTO qc_industry_scripts (hotspot_id, topic_title, user_prompt, script_type, status) VALUES (?,?,?,?,?)',
      [hotspot_id || 0, topic_title, custom_prompt, script_type, 'generating']
    );
    const scriptId = insertResult.insertId;
    res.json({ code: 0, data: { id: scriptId }, msg: '脚本生成中' });

    // 异步生成
    (async () => {
      try {
        const typeLabels = { short_video: '30秒短视频脚本', live_intro: '直播开场话术', product_review: '产品测评脚本' };
        const content = await callAI(
          `你是抖音美妆领域的顶级编导。品牌：雪玲妃，主打绿泥控油洁面膏、氨基酸洗面奶。
请根据热点话题生成一份完整的${typeLabels[script_type] || '短视频脚本'}，包含分镜、口播、字幕。`,
          `热点话题：${topic_title}\n${topic_description ? '描述：' + topic_description : ''}\n${target_audience ? '目标人群：' + target_audience : ''}\n${hook_angle ? '蹭热点角度：' + hook_angle : ''}\n${custom_prompt ? '额外要求：' + custom_prompt : ''}`
        );
        await db.query('UPDATE qc_industry_scripts SET script_content=?, status=? WHERE id=?', [content, 'done', scriptId]);
        logger.info('[Industry] 脚本生成完成', { id: scriptId });
      } catch (e) {
        logger.error('[Industry] 脚本生成失败', { id: scriptId, error: e.message });
        await db.query('UPDATE qc_industry_scripts SET status=?, error_msg=? WHERE id=?', ['failed', e.message, scriptId]);
      }
    })();
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /scripts/list ==========
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

// ========== GET /scripts/:id ==========
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
