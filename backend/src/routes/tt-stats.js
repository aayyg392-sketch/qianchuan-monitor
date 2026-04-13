const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth');

// 消耗概览（KPI 卡片）
router.get('/overview', auth(), async (req, res) => {
  const { start_date, end_date, advertiser_id } = req.query;
  const dayjs = require('dayjs');
  const sd = start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const ed = end_date || dayjs().format('YYYY-MM-DD');

  let where = 'stat_date BETWEEN ? AND ?';
  const params = [sd, ed];
  if (advertiser_id) { where += ' AND advertiser_id=?'; params.push(advertiser_id); }

  try {
    const [rows] = await db.query(
      `SELECT
        COALESCE(SUM(spend),0) as total_spend,
        COALESCE(SUM(impressions),0) as total_impressions,
        COALESCE(SUM(clicks),0) as total_clicks,
        COALESCE(SUM(conversions),0) as total_conversions,
        COALESCE(SUM(video_views),0) as total_views,
        COALESCE(SUM(likes),0) as total_likes,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)/SUM(impressions)*100 ELSE 0 END as avg_ctr,
        CASE WHEN SUM(clicks)>0 THEN SUM(conversions)/SUM(clicks)*100 ELSE 0 END as avg_cvr,
        CASE WHEN SUM(conversions)>0 THEN SUM(spend)/SUM(conversions) ELSE 0 END as avg_cpa,
        CASE WHEN SUM(spend)>0 THEN SUM(spend*roas)/SUM(spend) ELSE 0 END as avg_roas,
        COUNT(DISTINCT material_id) as active_materials
      FROM tt_material_stats WHERE ${where}`, params);

    // 对比上一周期
    const days = dayjs(ed).diff(dayjs(sd), 'day') + 1;
    const prevSd = dayjs(sd).subtract(days, 'day').format('YYYY-MM-DD');
    const prevEd = dayjs(sd).subtract(1, 'day').format('YYYY-MM-DD');
    const prevParams = [prevSd, prevEd];
    if (advertiser_id) prevParams.push(advertiser_id);
    const [prevRows] = await db.query(
      `SELECT COALESCE(SUM(spend),0) as total_spend, COALESCE(SUM(conversions),0) as total_conversions,
        CASE WHEN SUM(spend)>0 THEN SUM(spend*roas)/SUM(spend) ELSE 0 END as avg_roas
      FROM tt_material_stats WHERE ${where}`, prevParams);

    res.json({ code: 0, data: { current: rows[0], previous: prevRows[0], dateRange: { start: sd, end: ed } } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 素材消耗排行
router.get('/materials', auth(), async (req, res) => {
  const { start_date, end_date, sort = 'spend', order = 'DESC', page = 1, pageSize = 20, advertiser_id } = req.query;
  const dayjs = require('dayjs');
  const sd = start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const ed = end_date || dayjs().format('YYYY-MM-DD');
  const offset = (page - 1) * pageSize;

  let where = 's.stat_date BETWEEN ? AND ?';
  const params = [sd, ed];
  if (advertiser_id) { where += ' AND s.advertiser_id=?'; params.push(advertiser_id); }

  const allowedSort = ['spend', 'impressions', 'clicks', 'conversions', 'roas', 'ctr', 'cpa'];
  const sortCol = allowedSort.includes(sort) ? sort : 'spend';

  try {
    const [rows] = await db.query(
      `SELECT m.id, m.title, m.type, m.thumbnail_url, m.market, m.language, m.status,
        SUM(s.spend) as spend, SUM(s.impressions) as impressions, SUM(s.clicks) as clicks,
        SUM(s.conversions) as conversions, SUM(s.video_views) as video_views,
        CASE WHEN SUM(s.impressions)>0 THEN SUM(s.clicks)/SUM(s.impressions)*100 ELSE 0 END as ctr,
        CASE WHEN SUM(s.conversions)>0 THEN SUM(s.spend)/SUM(s.conversions) ELSE 0 END as cpa,
        CASE WHEN SUM(s.spend)>0 THEN SUM(s.spend*s.roas)/SUM(s.spend) ELSE 0 END as roas
      FROM tt_material_stats s
      LEFT JOIN tt_materials m ON m.id = s.material_id
      WHERE ${where}
      GROUP BY s.material_id
      ORDER BY ${sortCol} ${order === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT ? OFFSET ?`, [...params, parseInt(pageSize), offset]);

    const [countRows] = await db.query(
      `SELECT COUNT(DISTINCT material_id) as total FROM tt_material_stats s WHERE ${where}`, params);

    res.json({ code: 0, data: { list: rows, total: countRows[0].total } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 单素材消耗趋势
router.get('/material/:id', auth(), async (req, res) => {
  const { days = 30 } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT stat_date, SUM(spend) as spend, SUM(impressions) as impressions, SUM(clicks) as clicks,
        SUM(conversions) as conversions, SUM(video_views) as video_views,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)/SUM(impressions)*100 ELSE 0 END as ctr,
        CASE WHEN SUM(spend)>0 THEN SUM(spend*roas)/SUM(spend) ELSE 0 END as roas
      FROM tt_material_stats WHERE material_id=? AND stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY stat_date ORDER BY stat_date`, [req.params.id, parseInt(days)]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 按市场维度统计
router.get('/market', auth(), async (req, res) => {
  const { start_date, end_date } = req.query;
  const dayjs = require('dayjs');
  const sd = start_date || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const ed = end_date || dayjs().format('YYYY-MM-DD');
  try {
    const [rows] = await db.query(
      `SELECT m.market, COUNT(DISTINCT s.material_id) as material_count,
        SUM(s.spend) as spend, SUM(s.impressions) as impressions, SUM(s.conversions) as conversions,
        CASE WHEN SUM(s.spend)>0 THEN SUM(s.spend*s.roas)/SUM(s.spend) ELSE 0 END as roas
      FROM tt_material_stats s
      LEFT JOIN tt_materials m ON m.id = s.material_id
      WHERE s.stat_date BETWEEN ? AND ?
      GROUP BY m.market ORDER BY spend DESC`, [sd, ed]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 手动触发数据同步
router.post('/sync', auth(), async (req, res) => {
  try {
    const { syncTikTokStats } = require('../services/tt-sync');
    syncTikTokStats().catch(e => require('../logger').error('[TikTok] 手动同步失败', { error: e.message }));
    res.json({ code: 0, msg: '同步任务已提交' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
