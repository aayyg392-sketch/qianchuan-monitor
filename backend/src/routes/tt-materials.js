const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth');
const logger = require('../logger');
const path = require('path');
const fs = require('fs');

// 文件上传配置
const multer = require('multer');
const UPLOAD_DIR = '/home/www/qianchuan-monitor/tt-materials';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

// 素材列表（分页 + 多维筛选）
router.get('/', auth(), async (req, res) => {
  const { page = 1, pageSize = 20, status, type, market, language, keyword, tag, sort = 'created_at', order = 'DESC', creator_id } = req.query;
  const offset = (page - 1) * pageSize;
  let where = '1=1';
  const params = [];

  if (status) { where += ' AND m.status=?'; params.push(status); }
  if (type) { where += ' AND m.type=?'; params.push(type); }
  if (market) { where += ' AND m.market=?'; params.push(market); }
  if (language) { where += ' AND m.language=?'; params.push(language); }
  if (creator_id) { where += ' AND m.creator_id=?'; params.push(creator_id); }
  if (keyword) { where += ' AND (m.title LIKE ? OR m.product_spu LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (tag) { where += ' AND JSON_CONTAINS(m.tags, ?)'; params.push(JSON.stringify(tag)); }

  const allowedSort = ['created_at', 'updated_at', 'file_size', 'duration', 'title'];
  const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

  try {
    const [countRows] = await db.query(`SELECT COUNT(*) as total FROM tt_materials m WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT m.*, u.username as creator_name
       FROM tt_materials m LEFT JOIN users u ON u.id = m.creator_id
       WHERE ${where} ORDER BY m.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]);

    // 附加每个素材的消耗汇总
    for (const row of rows) {
      const [stats] = await db.query(
        'SELECT COALESCE(SUM(spend),0) as total_spend, COALESCE(SUM(impressions),0) as total_impressions, COALESCE(SUM(clicks),0) as total_clicks, COALESCE(SUM(conversions),0) as total_conversions FROM tt_material_stats WHERE material_id=?',
        [row.id]);
      row.stats = stats[0] || {};
    }

    res.json({ code: 0, data: { list: rows, total: countRows[0].total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 上传素材
router.post('/upload', auth(), upload.array('files', 20), async (req, res) => {
  const { title, type = 'video', language, market, product_spu, tags } = req.body;
  if (!req.files || !req.files.length) return res.json({ code: 400, msg: '请选择文件' });

  try {
    const results = [];
    for (const file of req.files) {
      const fileTitle = title || path.basename(file.originalname, path.extname(file.originalname));
      let duration = null, width = null, height = null;
      // 尝试获取视频信息
      if (type === 'video') {
        try {
          const ffprobe = require('fluent-ffmpeg');
          await new Promise((resolve, reject) => {
            ffprobe.ffprobe(file.path, (err, data) => {
              if (!err && data?.streams?.[0]) {
                const s = data.streams[0];
                duration = data.format?.duration || null;
                width = s.width; height = s.height;
              }
              resolve();
            });
          });
        } catch (e) { /* ignore */ }
      }
      const [result] = await db.query(
        `INSERT INTO tt_materials (title, type, file_path, file_size, duration, width, height, language, market, product_spu, tags, creator_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [fileTitle, type, file.path, file.size, duration, width, height, language || null, market || null, product_spu || null, tags ? JSON.stringify(JSON.parse(tags)) : '[]', req.user.id]);
      results.push({ id: result.insertId, title: fileTitle, file_path: file.path });
    }
    res.json({ code: 0, data: results, msg: `成功上传 ${results.length} 个素材` });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 素材详情
router.get('/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, u.username as creator_name, r.username as reviewer_name
       FROM tt_materials m
       LEFT JOIN users u ON u.id = m.creator_id
       LEFT JOIN users r ON r.id = m.reviewer_id
       WHERE m.id=?`, [req.params.id]);
    if (!rows.length) return res.json({ code: 404, msg: '素材不存在' });

    // 推送记录
    const [pushes] = await db.query(
      `SELECT p.*, a.advertiser_name FROM tt_material_pushes p
       LEFT JOIN tt_accounts a ON a.advertiser_id = p.advertiser_id
       WHERE p.material_id=? ORDER BY p.pushed_at DESC`, [req.params.id]);

    // 消耗数据（最近30天）
    const [stats] = await db.query(
      'SELECT * FROM tt_material_stats WHERE material_id=? AND stat_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY stat_date',
      [req.params.id]);

    res.json({ code: 0, data: { ...rows[0], pushes, stats } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 编辑素材
router.put('/:id', auth(), async (req, res) => {
  const { title, language, market, product_spu, tags } = req.body;
  try {
    await db.query('UPDATE tt_materials SET title=COALESCE(?,title), language=COALESCE(?,language), market=COALESCE(?,market), product_spu=COALESCE(?,product_spu), tags=COALESCE(?,tags) WHERE id=?',
      [title, language, market, product_spu, tags ? JSON.stringify(tags) : null, req.params.id]);
    res.json({ code: 0, msg: '更新成功' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 删除素材
router.delete('/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT file_path FROM tt_materials WHERE id=?', [req.params.id]);
    if (rows.length && rows[0].file_path) {
      try { fs.unlinkSync(rows[0].file_path); } catch (e) { /* ignore */ }
    }
    await db.query('DELETE FROM tt_materials WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 审核素材
router.post('/:id/review', auth(), async (req, res) => {
  const { action, note } = req.body; // action: approved / rejected
  if (!['approved', 'rejected'].includes(action)) return res.json({ code: 400, msg: '无效操作' });
  try {
    await db.query('UPDATE tt_materials SET status=?, reviewer_id=?, review_note=?, reviewed_at=NOW() WHERE id=?',
      [action, req.user.id, note || null, req.params.id]);
    res.json({ code: 0, msg: action === 'approved' ? '已通过' : '已拒绝' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 批量更新状态
router.post('/batch-status', auth(), async (req, res) => {
  const { ids, status } = req.body;
  if (!ids?.length) return res.json({ code: 400, msg: '请选择素材' });
  try {
    await db.query(`UPDATE tt_materials SET status=? WHERE id IN (${ids.map(() => '?').join(',')})`, [status, ...ids]);
    res.json({ code: 0, msg: `已更新 ${ids.length} 个素材` });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 标签列表
router.get('/tags/list', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tt_material_tags ORDER BY category, name');
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 创建标签
router.post('/tags', auth(), async (req, res) => {
  const { name, type = 'public', category, color } = req.body;
  if (!name) return res.json({ code: 400, msg: '标签名不能为空' });
  try {
    const [result] = await db.query('INSERT INTO tt_material_tags (name, type, category, color, created_by) VALUES (?, ?, ?, ?, ?)',
      [name, type, category || null, color || '#1890ff', req.user.id]);
    res.json({ code: 0, data: { id: result.insertId }, msg: '创建成功' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ code: 400, msg: '标签已存在' });
    res.json({ code: 500, msg: e.message });
  }
});

// 删除标签
router.delete('/tags/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM tt_material_tags WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 静态文件服务（素材预览）
router.use('/file', express.static(UPLOAD_DIR));

module.exports = router;
