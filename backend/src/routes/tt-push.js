const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth');
const { TikTokAPI, ensureFreshToken } = require('../services/tiktok-api');
const logger = require('../logger');

// 推送素材到 TikTok
router.post('/push', auth(), async (req, res) => {
  const { material_ids, advertiser_ids } = req.body;
  if (!material_ids?.length || !advertiser_ids?.length) {
    return res.json({ code: 400, msg: '请选择素材和广告账户' });
  }

  try {
    const results = [];
    for (const advId of advertiser_ids) {
      // 获取账户 token
      const [accounts] = await db.query('SELECT * FROM tt_accounts WHERE advertiser_id=? AND status=1', [advId]);
      if (!accounts.length) { results.push({ advertiser_id: advId, error: '账户不存在或已禁用' }); continue; }
      const account = accounts[0];
      const token = await ensureFreshToken(account);
      const api = new TikTokAPI(token);

      for (const matId of material_ids) {
        const [mats] = await db.query('SELECT * FROM tt_materials WHERE id=?', [matId]);
        if (!mats.length) { results.push({ material_id: matId, advertiser_id: advId, error: '素材不存在' }); continue; }
        const mat = mats[0];

        // 创建推送记录
        const [pushResult] = await db.query(
          'INSERT INTO tt_material_pushes (material_id, advertiser_id, push_status, pushed_by) VALUES (?, ?, "uploading", ?)',
          [matId, advId, req.user.id]);
        const pushId = pushResult.insertId;

        // 异步上传
        (async () => {
          try {
            let uploadRes;
            if (mat.type === 'video') {
              uploadRes = await api.uploadVideo(advId, mat.file_path);
            } else {
              uploadRes = await api.uploadImage(advId, mat.file_path);
            }

            if (uploadRes.code === 0 && uploadRes.data) {
              const ttVideoId = uploadRes.data.video_id || uploadRes.data.image_id || '';
              await db.query('UPDATE tt_material_pushes SET push_status="success", tt_video_id=? WHERE id=?', [ttVideoId, pushId]);
              await db.query('UPDATE tt_materials SET status="pushed", material_id=COALESCE(material_id, ?) WHERE id=?', [ttVideoId, matId]);
              logger.info('[TikTok Push] 推送成功', { material_id: matId, advertiser_id: advId, tt_video_id: ttVideoId });
            } else {
              const errMsg = uploadRes.message || JSON.stringify(uploadRes);
              await db.query('UPDATE tt_material_pushes SET push_status="failed", error_msg=? WHERE id=?', [errMsg, pushId]);
              logger.error('[TikTok Push] 推送失败', { material_id: matId, error: errMsg });
            }
          } catch (e) {
            await db.query('UPDATE tt_material_pushes SET push_status="failed", error_msg=? WHERE id=?', [e.message, pushId]);
            logger.error('[TikTok Push] 推送异常', { material_id: matId, error: e.message });
          }
        })();

        results.push({ material_id: matId, advertiser_id: advId, push_id: pushId, status: 'uploading' });
      }
    }
    res.json({ code: 0, data: results, msg: `已提交 ${results.length} 个推送任务` });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 推送记录
router.get('/logs', auth(), async (req, res) => {
  const { page = 1, pageSize = 20, material_id, advertiser_id, push_status } = req.query;
  const offset = (page - 1) * pageSize;
  let where = '1=1';
  const params = [];
  if (material_id) { where += ' AND p.material_id=?'; params.push(material_id); }
  if (advertiser_id) { where += ' AND p.advertiser_id=?'; params.push(advertiser_id); }
  if (push_status) { where += ' AND p.push_status=?'; params.push(push_status); }

  try {
    const [countRows] = await db.query(`SELECT COUNT(*) as total FROM tt_material_pushes p WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT p.*, m.title as material_title, m.type as material_type, a.advertiser_name, u.username as pushed_by_name
       FROM tt_material_pushes p
       LEFT JOIN tt_materials m ON m.id = p.material_id
       LEFT JOIN tt_accounts a ON a.advertiser_id = p.advertiser_id
       LEFT JOIN users u ON u.id = p.pushed_by
       WHERE ${where} ORDER BY p.pushed_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]);
    res.json({ code: 0, data: { list: rows, total: countRows[0].total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 重试失败推送
router.post('/retry/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tt_material_pushes WHERE id=? AND push_status="failed"', [req.params.id]);
    if (!rows.length) return res.json({ code: 404, msg: '记录不存在或非失败状态' });
    const push = rows[0];
    // 重新推送
    const [accounts] = await db.query('SELECT * FROM tt_accounts WHERE advertiser_id=? AND status=1', [push.advertiser_id]);
    if (!accounts.length) return res.json({ code: 400, msg: '账户已禁用' });
    const [mats] = await db.query('SELECT * FROM tt_materials WHERE id=?', [push.material_id]);
    if (!mats.length) return res.json({ code: 400, msg: '素材不存在' });

    await db.query('UPDATE tt_material_pushes SET push_status="uploading", error_msg=NULL WHERE id=?', [req.params.id]);

    const token = await ensureFreshToken(accounts[0]);
    const api = new TikTokAPI(token);
    const mat = mats[0];

    (async () => {
      try {
        const uploadRes = mat.type === 'video'
          ? await api.uploadVideo(push.advertiser_id, mat.file_path)
          : await api.uploadImage(push.advertiser_id, mat.file_path);
        if (uploadRes.code === 0 && uploadRes.data) {
          const ttId = uploadRes.data.video_id || uploadRes.data.image_id || '';
          await db.query('UPDATE tt_material_pushes SET push_status="success", tt_video_id=? WHERE id=?', [ttId, req.params.id]);
          await db.query('UPDATE tt_materials SET status="pushed", material_id=COALESCE(material_id, ?) WHERE id=?', [ttId, push.material_id]);
        } else {
          await db.query('UPDATE tt_material_pushes SET push_status="failed", error_msg=? WHERE id=?', [uploadRes.message || 'unknown', req.params.id]);
        }
      } catch (e) {
        await db.query('UPDATE tt_material_pushes SET push_status="failed", error_msg=? WHERE id=?', [e.message, req.params.id]);
      }
    })();

    res.json({ code: 0, msg: '重试中' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
