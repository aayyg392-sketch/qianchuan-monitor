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
        aweme_id VARCHAR(50),
        likes INT DEFAULT 0,
        comments INT DEFAULT 0,
        shares INT DEFAULT 0,
        cost INT DEFAULT 0 COMMENT '预估消耗',
        duration VARCHAR(20),
        publish_date VARCHAR(50),
        tags JSON,
        content_type VARCHAR(50),
        hook_text VARCHAR(500),
        source VARCHAR(50) DEFAULT 'manual',
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_brand (brand),
        INDEX idx_likes (likes),
        INDEX idx_cost (cost)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_competitor_brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand_name VARCHAR(100) NOT NULL UNIQUE,
        brand_type VARCHAR(50) DEFAULT 'competitor' COMMENT 'competitor/benchmark',
        keywords VARCHAR(500) COMMENT '搜索关键词',
        notes VARCHAR(500),
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_competitor_analysis (
        id INT AUTO_INCREMENT PRIMARY KEY,
        video_id INT,
        video_title VARCHAR(500),
        brand VARCHAR(100),
        full_analysis LONGTEXT,
        generated_script LONGTEXT,
        status ENUM('analyzing','done','failed') DEFAULT 'analyzing',
        error_msg VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_video (video_id),
        INDEX idx_brand (brand)
      )
    `);
    await db.query('ALTER TABLE qc_competitor_videos ADD COLUMN aweme_id VARCHAR(50) AFTER cover_url').catch(() => {});
    await db.query('ALTER TABLE qc_competitor_videos ADD COLUMN hook_text VARCHAR(500) AFTER content_type').catch(() => {});
    
    // 初始化默认竞品品牌
    const defaultBrands = [
      { name: 'buv洗面奶', type: 'competitor', keywords: 'buv,buv洁面' },
      { name: '倾颜洗面奶', type: 'competitor', keywords: '倾颜,倾颜洁面' },
      { name: '韩束洗面奶', type: 'competitor', keywords: '韩束,韩束洁面' },
      { name: 'C咖洗面奶', type: 'competitor', keywords: 'C咖,C咖洁面' },
      { name: '草安堂洗面奶', type: 'competitor', keywords: '草安堂,草安堂洁面' },
    ];
    for (const b of defaultBrands) {
      await db.query('INSERT IGNORE INTO qc_competitor_brands (brand_name, brand_type, keywords) VALUES (?,?,?)',
        [b.name, b.type, b.keywords]);
    }
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

// ========== GET /brands — 竞品品牌列表 ==========
router.get('/brands', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM qc_competitor_brands WHERE status=1 ORDER BY id');
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /brands — 添加竞品品牌 ==========
router.post('/brands', auth(), async (req, res) => {
  const { brand_name, brand_type = 'competitor', keywords = '', notes = '' } = req.body;
  if (!brand_name) return res.json({ code: 400, msg: '请填写品牌名称' });
  try {
    await db.query('INSERT INTO qc_competitor_brands (brand_name, brand_type, keywords, notes) VALUES (?,?,?,?)',
      [brand_name, brand_type, keywords, notes]);
    res.json({ code: 0, msg: '品牌已添加' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ code: 400, msg: '品牌已存在' });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== DELETE /brands/:id — 删除品牌 ==========
router.delete('/brands/:id', auth(), async (req, res) => {
  try {
    await db.query('UPDATE qc_competitor_brands SET status=0 WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /list — 竞品视频列表 ==========
router.get('/list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 30, brand, sort = 'cost' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = '1=1';
    const params = [];
    if (brand) { where += ' AND brand = ?'; params.push(brand); }
    const sortField = { cost: 'cost', likes: 'likes', comments: 'comments', time: 'fetched_at' }[sort] || 'cost';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM qc_competitor_videos WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM qc_competitor_videos WHERE ${where} ORDER BY ${sortField} DESC, fetched_at DESC LIMIT ? OFFSET ?`,
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

// ========== POST /add — 手动添加竞品视频 ==========
router.post('/add', auth(), async (req, res) => {
  const { brand, url, title, author, author_fans, likes, comments, shares, cost, duration, tags, content_type, hook_text } = req.body;
  if (!brand) return res.json({ code: 400, msg: '请选择品牌' });
  if (!title && !url) return res.json({ code: 400, msg: '请填写标题或链接' });

  try {
    let awemeId = '';
    let videoTitle = title || '';

    if (url) {
      try {
        const idMatch = url.match(/video\/(\d+)/);
        if (idMatch) awemeId = idMatch[1];
        if (!awemeId) {
          const resp = await axios.get(url, {
            maxRedirects: 5, timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
            validateStatus: () => true,
          });
          const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || url;
          const m = finalUrl.match(/video\/(\d+)/);
          if (m) awemeId = m[1];
        }
        if (!videoTitle) videoTitle = brand + ' 视频 ' + awemeId;
      } catch (e) {
        logger.warn('[CompetitorVideos] 链接解析失败', { error: e.message });
        if (!videoTitle) videoTitle = brand + ' 视频';
      }
    }

    await db.query(
      'INSERT INTO qc_competitor_videos (brand, title, author, author_fans, likes, comments, shares, cost, duration, tags, content_type, hook_text, aweme_id, video_url, source, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
      [brand, videoTitle, author || '', author_fans || '', likes || 0, comments || 0, shares || 0, cost || 0, duration || '', JSON.stringify(tags || []), content_type || '', hook_text || '', awemeId, url || '', 'manual']
    );

    res.json({ code: 0, msg: '视频已添加' });
  } catch (e) {
    logger.error('[CompetitorVideos] add error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== DELETE /remove/:id — 删除视频 ==========
router.delete('/remove/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM qc_competitor_videos WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /refresh — 从抖音搜索真实竞品视频数据 ==========
router.post('/refresh', auth(), async (req, res) => {
  const { brand } = req.body;
  if (!brand) return res.json({ code: 400, msg: '请选择品牌' });

  try {
    // 获取品牌关键词
    const [[brandInfo]] = await db.query('SELECT keywords FROM qc_competitor_brands WHERE brand_name = ?', [brand]);
    const kwList = brandInfo?.keywords ? brandInfo.keywords.split(',').map(s => s.trim()) : [brand.replace('洗面奶','')];
    
    let allVideos = [];

    for (const kw of kwList) {
      try {
        // 使用抖音网页搜索API
        const searchResp = await axios.get('https://www.douyin.com/aweme/v1/web/general/search/single/', {
          params: {
            keyword: kw + ' 洗面奶',
            search_channel: 'aweme_general',
            sort_type: 0,
            publish_time: 30, // 近30天
            count: 15,
            offset: 0,
            search_source: 'tab_search',
            query_correct_type: 1,
            is_filter_search: 0,
            cookie_enabled: true,
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/search/' + encodeURIComponent(kw),
          },
          timeout: 15000,
        }).catch(() => null);

        if (searchResp && searchResp.data?.data) {
          const items = searchResp.data.data || [];
          for (const item of items) {
            const info = item.aweme_info;
            if (!info) continue;
            const likes = info.statistics?.digg_count || 0;
            allVideos.push({
              title: info.desc || '',
              author: info.author?.nickname || '',
              author_fans: String(info.author?.follower_count || 0),
              likes: likes,
              comments: info.statistics?.comment_count || 0,
              shares: info.statistics?.share_count || 0,
              cost: Math.round(likes * 0.3), // 估算千川消耗 = 点赞 * 0.3
              duration: info.duration ? Math.floor(info.duration / 1000) + 's' : '',
              cover_url: info.video?.cover?.url_list?.[0] || '',
              aweme_id: info.aweme_id || '',
              video_url: 'https://www.douyin.com/video/' + (info.aweme_id || ''),
              tags: [kw],
              content_type: '',
              hook_text: (info.desc || '').substring(0, 30),
              publish_date: info.create_time ? new Date(info.create_time * 1000).toISOString().slice(0,10) : '',
            });
          }
        }
      } catch (e) {
        logger.warn('[CompetitorVideos] search ' + kw + ' failed: ' + e.message);
      }
    }

    // 如果抖音搜索被限制，提示用户
    if (allVideos.length === 0) {
      // 检查数据库中是否已有该品牌数据
      const [[existing]] = await db.query('SELECT COUNT(*) as c FROM qc_competitor_videos WHERE brand = ?', [brand]);
      if (existing.c > 0) {
        return res.json({ code: 0, msg: '数据已是最新，抖音搜索API暂时受限' });
      }
      return res.json({ code: 500, msg: '抖音搜索API暂时不可用，请手动添加视频链接' });
    }

    // 去重
    const seen = new Set();
    const unique = allVideos.filter(v => {
      if (!v.aweme_id || seen.has(v.aweme_id)) return false;
      seen.add(v.aweme_id);
      return true;
    });

    // 按点赞排序取前10
    unique.sort((a, b) => b.likes - a.likes);
    const top = unique.slice(0, 10);

    // 清该品牌的搜索数据，保留手动添加的
    await db.query('DELETE FROM qc_competitor_videos WHERE brand = ? AND source IN ("ai", "douyin_search")', [brand]);

    for (const v of top) {
      await db.query(
        'INSERT INTO qc_competitor_videos (brand, title, author, author_fans, likes, comments, shares, cost, duration, tags, content_type, hook_text, aweme_id, video_url, cover_url, source, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
        [brand, v.title, v.author, v.author_fans, v.likes, v.comments, v.shares, v.cost, v.duration, JSON.stringify(v.tags), v.content_type, v.hook_text, v.aweme_id, v.video_url, v.cover_url || '', 'douyin_search']
      );
    }

    const [rows] = await db.query('SELECT * FROM qc_competitor_videos WHERE brand = ? ORDER BY cost DESC, likes DESC', [brand]);
    rows.forEach(r => { try { r.tags = JSON.parse(r.tags); } catch { r.tags = []; } });

    res.json({ code: 0, data: { list: rows, total: rows.length }, msg: '已从抖音搜索获取' + top.length + '条' + brand + '真实视频数据' });
  } catch (e) {
    logger.error('[CompetitorVideos] refresh error', { error: e.message });
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
        const content = await callAI(
          `你是千川广告素材分析专家。我方品牌：雪玲妃（洁面产品）。分析竞品「${brand}」的爆款素材，输出：
1. 钩子话术分析 2. 高CTR画面拆解 3. 高转化话术提炼 4. 卖点对标分析 5. 雪玲妃可复用的30秒翻拍脚本（含分镜、口播、字幕）`,
          `素材：${video_title}\n品牌：${brand}\n消耗：${video_cost ? video_cost + '元' : '未知'}\n钩子：${hook_text || '根据标题推断'}\n标签：${(video_tags || []).join('、')}`
        );
        await db.query('UPDATE qc_competitor_analysis SET full_analysis=?, generated_script=?, status=? WHERE id=?', [content, content, 'done', aid]);
      } catch (e) {
        await db.query('UPDATE qc_competitor_analysis SET status=?, error_msg=? WHERE id=?', ['failed', e.message, aid]);
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
    const [rows] = await db.query(`SELECT * FROM qc_competitor_analysis WHERE ${where} ORDER BY created_at DESC LIMIT ?`, [...params, parseInt(page_size)]);
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
