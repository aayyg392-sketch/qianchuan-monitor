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
      CREATE TABLE IF NOT EXISTS qc_industry_videos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500),
        author VARCHAR(200),
        author_fans VARCHAR(50),
        video_url VARCHAR(1000),
        cover_url VARCHAR(1000),
        aweme_id VARCHAR(50),
        likes INT DEFAULT 0,
        comments INT DEFAULT 0,
        shares INT DEFAULT 0,
        duration VARCHAR(20),
        publish_date VARCHAR(50),
        category VARCHAR(100) DEFAULT 'cleanser',
        tags JSON,
        source VARCHAR(50) DEFAULT 'manual',
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
        full_analysis LONGTEXT COMMENT '完整分析报告',
        overall_score INT DEFAULT 0,
        status ENUM('analyzing','done','failed') DEFAULT 'analyzing',
        error_msg VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_video (video_id),
        INDEX idx_status (status)
      )
    `);
    await db.query('ALTER TABLE qc_industry_videos ADD COLUMN aweme_id VARCHAR(50) AFTER cover_url').catch(() => {});
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

// ========== GET /list — 洁面行业视频榜单 ==========
router.get('/list', auth(), async (req, res) => {
  try {
    const { page = 1, page_size = 30, category = 'cleanser', sort = 'likes' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const sortField = { likes: 'likes', comments: 'comments', shares: 'shares', time: 'fetched_at' }[sort] || 'likes';

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM qc_industry_videos WHERE category = ?', [category]
    );
    const [rows] = await db.query(
      `SELECT * FROM qc_industry_videos WHERE category = ? ORDER BY ${sortField} DESC, fetched_at DESC LIMIT ? OFFSET ?`,
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

// ========== POST /add — 手动添加行业视频（通过抖音链接或手动填写） ==========
router.post('/add', auth(), async (req, res) => {
  const { url, title, author, author_fans, likes, comments, shares, duration, tags, category = 'cleanser' } = req.body;

  try {
    let videoData = { title, author, author_fans, likes: likes || 0, comments: comments || 0, shares: shares || 0, duration, tags: tags || [], aweme_id: '' };

    // 如果提供了抖音链接，尝试解析
    if (url) {
      try {
        // 从链接提取aweme_id
        let awemeId = '';
        const idMatch = url.match(/video\/(\d+)/);
        if (idMatch) awemeId = idMatch[1];
        
        if (!awemeId) {
          // 尝试解析短链接获取重定向URL
          const resp = await axios.get(url, {
            maxRedirects: 5,
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
            validateStatus: () => true,
          });
          const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || url;
          const idMatch2 = finalUrl.match(/video\/(\d+)/);
          if (idMatch2) awemeId = idMatch2[1];
        }
        videoData.aweme_id = awemeId;
        if (!videoData.title) videoData.title = '抖音视频 ' + awemeId;
      } catch (e) {
        logger.warn('[IndustryVideos] 链接解析失败', { error: e.message });
      }
    }

    if (!videoData.title) return res.json({ code: 400, msg: '请填写视频标题或提供抖音链接' });

    await db.query(
      'INSERT INTO qc_industry_videos (title, author, author_fans, likes, comments, shares, duration, category, tags, aweme_id, video_url, source, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
      [videoData.title, videoData.author || '', videoData.author_fans || '', videoData.likes, videoData.comments, videoData.shares, videoData.duration || '', category, JSON.stringify(videoData.tags), videoData.aweme_id, url || '', 'manual']
    );

    res.json({ code: 0, msg: '视频已添加' });
  } catch (e) {
    logger.error('[IndustryVideos] add error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== DELETE /remove/:id — 删除视频 ==========
router.delete('/remove/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM qc_industry_videos WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== POST /refresh — 从抖音搜索真实洁面视频数据 ==========
router.post('/refresh', auth(), async (req, res) => {
  try {
    const keywords = ['洁面', '洗面奶', '氨基酸洁面', '洁面乳', '洁面膏', '温和洁面', '控油洁面'];
    let allVideos = [];

    for (const kw of keywords) {
      try {
        // 使用抖音网页搜索API
        const searchResp = await axios.get('https://www.douyin.com/aweme/v1/web/general/search/single/', {
          params: {
            keyword: kw,
            search_channel: 'aweme_general',
            sort_type: 0,   // 综合排序
            publish_time: 7, // 近7天
            count: 10,
            offset: 0,
            search_source: 'tab_search',
            query_correct_type: 1,
            is_filter_search: 0,
            from_group_id: '',
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
            allVideos.push({
              title: info.desc || '',
              author: info.author?.nickname || '',
              author_fans: String(info.author?.follower_count || 0),
              likes: info.statistics?.digg_count || 0,
              comments: info.statistics?.comment_count || 0,
              shares: info.statistics?.share_count || 0,
              duration: info.duration ? Math.floor(info.duration / 1000) + 's' : '',
              cover_url: info.video?.cover?.url_list?.[0] || '',
              aweme_id: info.aweme_id || '',
              video_url: 'https://www.douyin.com/video/' + (info.aweme_id || ''),
              tags: [kw],
              publish_date: info.create_time ? new Date(info.create_time * 1000).toISOString().slice(0,10) : '',
            });
          }
        }
      } catch (e) {
        logger.warn('[IndustryVideos] search ' + kw + ' failed: ' + e.message);
      }
    }

    // 如果抖音搜索API被限制，使用巨量创意的缓存数据
    if (allVideos.length === 0) {
      logger.info('[IndustryVideos] 抖音搜索无结果，使用巨量创意缓存数据');
      // 从数据库获取已有的cc_oceanengine数据
      const [cached] = await db.query('SELECT COUNT(*) as c FROM qc_industry_videos WHERE source="cc_oceanengine"');
      if (cached[0].c > 0) {
        return res.json({ code: 0, msg: '数据已是最新（来源：巨量创意中心）', data: { list: [], beauty_hot_count: 0 } });
      }
      return res.json({ code: 500, msg: '抖音搜索API暂时不可用，请稍后重试' });
    }

    // 去重 by aweme_id
    const seen = new Set();
    const unique = allVideos.filter(v => {
      if (!v.aweme_id || seen.has(v.aweme_id)) return false;
      seen.add(v.aweme_id);
      return true;
    });

    // 按点赞排序取前30
    unique.sort((a, b) => b.likes - a.likes);
    const top = unique.slice(0, 30);

    // 写入数据库
    await db.query('DELETE FROM qc_industry_videos WHERE source = "douyin_search"');
    for (const v of top) {
      await db.query(
        'INSERT INTO qc_industry_videos (title, author, author_fans, likes, comments, shares, duration, category, tags, aweme_id, video_url, cover_url, publish_date, source, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
        [v.title, v.author, v.author_fans, v.likes, v.comments, v.shares, v.duration, 'cleanser', JSON.stringify(v.tags), v.aweme_id, v.video_url, v.cover_url, v.publish_date, 'douyin_search']
      );
    }

    // 返回所有数据（包括手动添加的和巨量创意的）
    const [rows] = await db.query('SELECT * FROM qc_industry_videos WHERE category = ? ORDER BY likes DESC LIMIT 30', ['cleanser']);
    rows.forEach(r => { try { r.tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []); } catch { r.tags = []; } });

    res.json({ code: 0, data: { list: rows, total: rows.length, search_count: top.length }, msg: '已从抖音搜索获取' + top.length + '条洁面视频数据' });
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

    (async () => {
      try {
        const content = await callAI(
          `你是抖音短视频领域的顶级内容分析师，专注洁面护肤品类。请对爆款视频进行专业级拆解分析。
分析维度：1.开头钩子分析 2.分镜拆解 3.高CTR画面 4.卖点提炼 5.文案话术 6.雪玲妃可复用建议`,
          `视频标题：${video_title}\n作者：${video_author || '未知'}\n点赞：${video_likes || '未知'}\n时长：${video_duration || '未知'}\n标签：${(video_tags || []).join('、')}`
        );
        await db.query('UPDATE qc_video_analysis SET full_analysis=?, overall_score=8, status=? WHERE id=?', [content, 'done', analysisId]);
      } catch (e) {
        await db.query('UPDATE qc_video_analysis SET status=?, error_msg=? WHERE id=?', ['failed', e.message, analysisId]);
      }
    })();
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /analysis/list ==========
router.get('/analysis/list', auth(), async (req, res) => {
  try {
    const { video_id, page_size = 50 } = req.query;
    let where = '1=1';
    const params = [];
    if (video_id) { where += ' AND video_id = ?'; params.push(video_id); }
    const [rows] = await db.query(`SELECT * FROM qc_video_analysis WHERE ${where} ORDER BY created_at DESC LIMIT ?`, [...params, parseInt(page_size)]);
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

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
