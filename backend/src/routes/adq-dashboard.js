/**
 * 腾讯广告 ADQ 数据看板路由
 * 报表数据拉取、广告组管理、自动调价
 */
const router = require('express').Router();
const db = require('../db');
const logger = require('../logger');
const adq = require('../services/adq-sync');

/**
 * GET /api/adq-dash/daily — 日报表
 */
router.get('/daily', async (req, res) => {
  try {
    const { account_db_id, start_date, end_date, level } = req.query;
    if (!account_db_id) return res.json({ code: -1, msg: '缺少account_db_id' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在或已停用' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.getDailyReports(token, rows[0].account_id, {
      level: level || 'REPORT_LEVEL_ADGROUP',
      date_range: {
        start_date: start_date || new Date().toISOString().slice(0, 10),
        end_date: end_date || new Date().toISOString().slice(0, 10),
      },
    });
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ日报查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-dash/hourly — 小时报表
 */
router.get('/hourly', async (req, res) => {
  try {
    const { account_db_id, date } = req.query;
    if (!account_db_id) return res.json({ code: -1, msg: '缺少account_db_id' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在或已停用' });

    const token = await adq.getValidToken(account_db_id);
    const today = date || new Date().toISOString().slice(0, 10);
    const data = await adq.getHourlyReports(token, rows[0].account_id, {
      date_range: { start_date: today, end_date: today },
    });
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ小时报查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-dash/adgroups — 广告组列表
 */
router.get('/adgroups', async (req, res) => {
  try {
    const { account_db_id, page, page_size, status } = req.query;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const params = { page: +page || 1, page_size: +page_size || 50 };
    if (status) params.filtering = { configured_status: status };
    const data = await adq.getAdgroups(token, rows[0].account_id, params);
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ广告组查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-dash/adgroups/update — 更新广告组（调价/调预算/暂停/启动）
 */
router.post('/adgroups/update', async (req, res) => {
  try {
    const { account_db_id, adgroup_id, ...updateFields } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.updateAdgroup(token, rows[0].account_id, {
      account_id: rows[0].account_id,
      adgroup_id,
      ...updateFields,
    });
    res.json({ code: 0, data, msg: '更新成功' });
  } catch (e) {
    logger.error('ADQ广告组更新失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
