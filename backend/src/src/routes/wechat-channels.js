const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');

// ============ 自动创建数据表 ============
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS wx_finder_influencers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      finder_id VARCHAR(100) NOT NULL COMMENT '达人视频号ID',
      finder_nickname VARCHAR(200) COMMENT '达人昵称',
      head_img_url TEXT COMMENT '头像',
      fans_count BIGINT DEFAULT 0 COMMENT '粉丝数',
      live_count INT DEFAULT 0 COMMENT '直播次数',
      video_count INT DEFAULT 0 COMMENT '视频数量',
      gmv_range VARCHAR(50) COMMENT 'GMV区间',
      avg_sales DECIMAL(14,2) DEFAULT 0 COMMENT '场均销售额',
      category VARCHAR(200) COMMENT '达人类目',
      cooperation_status VARCHAR(20) DEFAULT 'pending' COMMENT '对接状态',
      tags JSON COMMENT '自定义标签',
      audience_age JSON COMMENT '粉丝年龄分布',
      audience_gender JSON COMMENT '粉丝性别分布',
      audience_province JSON COMMENT '粉丝地域分布',
      score_total INT DEFAULT 0 COMMENT '匹配总分',
      remark TEXT COMMENT '备注',
      last_synced_at DATETIME COMMENT '最后同步时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_finder_id (finder_id),
      INDEX idx_status (cooperation_status),
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await db.query(`CREATE TABLE IF NOT EXISTS wx_finder_contact_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      finder_id VARCHAR(100) NOT NULL COMMENT '达人视频号ID',
      action VARCHAR(50) NOT NULL COMMENT '操作类型',
      old_value VARCHAR(200) COMMENT '旧值',
      new_value VARCHAR(200) COMMENT '新值',
      content TEXT COMMENT '沟通记录内容',
      operator VARCHAR(100) COMMENT '操作人',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_finder (finder_id),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    logger.info('[WxChannels] 数据表初始化完成');
  } catch (e) {
    logger.error('[WxChannels] 数据表创建失败', { error: e.message });
  }
})();

// ============ 达人统计 ============
router.get('/finder/stats', auth(), async (req, res) => {
  try {
    const [[totalRow]] = await db.query('SELECT COUNT(*) as total FROM wx_finder_influencers');
    const [statusRows] = await db.query('SELECT cooperation_status, COUNT(*) as cnt FROM wx_finder_influencers GROUP BY cooperation_status');
    const [categoryRows] = await db.query('SELECT category, COUNT(*) as cnt FROM wx_finder_influencers GROUP BY category ORDER BY cnt DESC LIMIT 10');
    const [[lastSync]] = await db.query('SELECT MAX(last_synced_at) as last_sync FROM wx_finder_influencers');

    const statusMap = {};
    (statusRows || []).forEach(r => { statusMap[r.cooperation_status] = parseInt(r.cnt); });

    res.json({
      code: 0,
      data: {
        total: parseInt(totalRow.total) || 0,
        pending: statusMap.pending || 0,
        contacting: statusMap.contacting || 0,
        negotiating: statusMap.negotiating || 0,
        cooperating: statusMap.cooperating || 0,
        rejected: statusMap.rejected || 0,
        categories: categoryRows || [],
        lastSyncAt: lastSync?.last_sync || null,
      },
    });
  } catch (e) {
    logger.error('[WxChannels] finder stats error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 达人列表（带筛选分页） ============
router.get('/finder/list', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = ['1=1'];
    const params = [];

    if (req.query.status) {
      conditions.push('cooperation_status=?');
      params.push(req.query.status);
    }
    if (req.query.keyword) {
      conditions.push('(finder_nickname LIKE ? OR finder_id LIKE ?)');
      params.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`);
    }
    if (req.query.category) {
      conditions.push('category LIKE ?');
      params.push(`%${req.query.category}%`);
    }
    if (req.query.minFans) {
      conditions.push('fans_count >= ?');
      params.push(parseInt(req.query.minFans));
    }
    if (req.query.maxFans) {
      conditions.push('fans_count <= ?');
      params.push(parseInt(req.query.maxFans));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sortBy = req.query.sortBy || 'fans_count';
    const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts = ['fans_count', 'avg_sales', 'score_total', 'created_at', 'updated_at'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'fans_count';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM wx_finder_influencers ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM wx_finder_influencers ${where} ORDER BY ${safeSort} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // 解析JSON字段
    for (const row of rows) {
      try { if (row.tags && typeof row.tags === 'string') row.tags = JSON.parse(row.tags); } catch { row.tags = []; }
      try { if (row.audience_age && typeof row.audience_age === 'string') row.audience_age = JSON.parse(row.audience_age); } catch { row.audience_age = null; }
      try { if (row.audience_gender && typeof row.audience_gender === 'string') row.audience_gender = JSON.parse(row.audience_gender); } catch { row.audience_gender = null; }
      try { if (row.audience_province && typeof row.audience_province === 'string') row.audience_province = JSON.parse(row.audience_province); } catch { row.audience_province = null; }
    }

    res.json({ code: 0, data: { list: rows, total, page, pageSize } });
  } catch (e) {
    logger.error('[WxChannels] finder list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 手动触发同步 ============
router.post('/finder/sync', auth(), async (req, res) => {
  try {
    const wxSync = require('../services/wechat-channels-sync');
    const result = await wxSync.syncAllFinders();
    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('[WxChannels] finder sync error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 达人详情 ============
router.get('/finder/:finderId', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM wx_finder_influencers WHERE finder_id=?', [req.params.finderId]);
    if (!row) return res.json({ code: 404, msg: '达人不存在' });

    // 解析JSON
    try { if (row.tags && typeof row.tags === 'string') row.tags = JSON.parse(row.tags); } catch { row.tags = []; }
    try { if (row.audience_age && typeof row.audience_age === 'string') row.audience_age = JSON.parse(row.audience_age); } catch {}
    try { if (row.audience_gender && typeof row.audience_gender === 'string') row.audience_gender = JSON.parse(row.audience_gender); } catch {}
    try { if (row.audience_province && typeof row.audience_province === 'string') row.audience_province = JSON.parse(row.audience_province); } catch {}

    res.json({ code: 0, data: row });
  } catch (e) {
    logger.error('[WxChannels] finder detail error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 达人商品列表（实时从API获取） ============
router.get('/finder/:finderId/products', auth(), async (req, res) => {
  try {
    const wxSync = require('../services/wechat-channels-sync');
    const token = await wxSync.getAccessToken();
    if (!token) return res.json({ code: 500, msg: 'Token获取失败' });

    const dayjs = require('dayjs');
    const ds = dayjs().subtract(1, 'day').format('YYYYMMDD');

    const products = await wxSync.fetchFinderProducts(token, ds);
    res.json({ code: 0, data: { list: products } });
  } catch (e) {
    logger.error('[WxChannels] finder products error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 批量更新状态 ============
router.post('/finder/batch-status', auth(), async (req, res) => {
  try {
    const { finderIds, status } = req.body;
    if (!finderIds?.length || !status) return res.json({ code: 400, msg: '参数缺失' });

    const validStatuses = ['pending', 'contacting', 'negotiating', 'cooperating', 'rejected', 'paused'];
    if (!validStatuses.includes(status)) return res.json({ code: 400, msg: '无效状态' });

    const placeholders = finderIds.map(() => '?').join(',');
    await db.query(`UPDATE wx_finder_influencers SET cooperation_status=? WHERE finder_id IN (${placeholders})`, [status, ...finderIds]);

    // 记录日志
    for (const fid of finderIds) {
      await db.query('INSERT INTO wx_finder_contact_logs (finder_id, action, new_value) VALUES (?, ?, ?)', [fid, 'status_change', status]);
    }

    res.json({ code: 0, data: { updated: finderIds.length } });
  } catch (e) {
    logger.error('[WxChannels] batch status error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 批量打标 ============
router.post('/finder/batch-tag', auth(), async (req, res) => {
  try {
    const { finderIds, addTags, removeTags } = req.body;
    if (!finderIds?.length) return res.json({ code: 400, msg: '参数缺失' });

    for (const fid of finderIds) {
      const [[row]] = await db.query('SELECT tags FROM wx_finder_influencers WHERE finder_id=?', [fid]);
      if (!row) continue;

      let tags = [];
      try { tags = row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : []; } catch { tags = []; }

      if (addTags?.length) {
        for (const t of addTags) { if (!tags.includes(t)) tags.push(t); }
      }
      if (removeTags?.length) {
        tags = tags.filter(t => !removeTags.includes(t));
      }

      await db.query('UPDATE wx_finder_influencers SET tags=? WHERE finder_id=?', [JSON.stringify(tags), fid]);
    }

    res.json({ code: 0, data: { updated: finderIds.length } });
  } catch (e) {
    logger.error('[WxChannels] batch tag error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 单个达人操作 ============
router.put('/finder/:finderId/status', auth(), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'contacting', 'negotiating', 'cooperating', 'rejected', 'paused'];
    if (!validStatuses.includes(status)) return res.json({ code: 400, msg: '无效状态' });

    const [[old]] = await db.query('SELECT cooperation_status FROM wx_finder_influencers WHERE finder_id=?', [req.params.finderId]);
    await db.query('UPDATE wx_finder_influencers SET cooperation_status=? WHERE finder_id=?', [status, req.params.finderId]);

    await db.query('INSERT INTO wx_finder_contact_logs (finder_id, action, old_value, new_value) VALUES (?, ?, ?, ?)',
      [req.params.finderId, 'status_change', old?.cooperation_status || '', status]);

    res.json({ code: 0 });
  } catch (e) {
    logger.error('[WxChannels] update status error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

router.put('/finder/:finderId/remark', auth(), async (req, res) => {
  try {
    await db.query('UPDATE wx_finder_influencers SET remark=? WHERE finder_id=?', [req.body.remark || '', req.params.finderId]);
    res.json({ code: 0 });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

router.put('/finder/:finderId/tags', auth(), async (req, res) => {
  try {
    await db.query('UPDATE wx_finder_influencers SET tags=? WHERE finder_id=?', [JSON.stringify(req.body.tags || []), req.params.finderId]);
    res.json({ code: 0 });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ============ 沟通记录 ============
router.get('/finder/:finderId/logs', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM wx_finder_contact_logs WHERE finder_id=?', [req.params.finderId]);
    const [rows] = await db.query(
      'SELECT * FROM wx_finder_contact_logs WHERE finder_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.params.finderId, pageSize, offset]
    );

    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

router.post('/finder/:finderId/log', auth(), async (req, res) => {
  try {
    const { action, content } = req.body;
    await db.query('INSERT INTO wx_finder_contact_logs (finder_id, action, content) VALUES (?, ?, ?)',
      [req.params.finderId, action || 'note', content || '']);
    res.json({ code: 0 });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
