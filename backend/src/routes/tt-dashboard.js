const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth');

// 汇总数据
router.get('/summary', auth(), async (req, res) => {
  try {
    const dayjs = require('dayjs');
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    // 今日数据
    const [todayRows] = await db.query(
      `SELECT COALESCE(SUM(spend),0) as spend, COALESCE(SUM(impressions),0) as impressions,
        COALESCE(SUM(conversions),0) as conversions, COUNT(DISTINCT material_id) as active_materials,
        CASE WHEN SUM(spend)>0 THEN SUM(spend*roas)/SUM(spend) ELSE 0 END as roas
      FROM tt_material_stats WHERE stat_date=?`, [today]);

    // 昨日数据（对比）
    const [yesterdayRows] = await db.query(
      `SELECT COALESCE(SUM(spend),0) as spend, COALESCE(SUM(conversions),0) as conversions,
        CASE WHEN SUM(spend)>0 THEN SUM(spend*roas)/SUM(spend) ELSE 0 END as roas
      FROM tt_material_stats WHERE stat_date=?`, [yesterday]);

    // 素材总量
    const [matCount] = await db.query('SELECT COUNT(*) as total, SUM(status="pushed") as pushed, SUM(status="approved") as approved, SUM(status="draft") as draft FROM tt_materials');

    // 账户数
    const [accCount] = await db.query('SELECT COUNT(*) as total FROM tt_accounts WHERE status=1');

    res.json({ code: 0, data: {
      today: todayRows[0], yesterday: yesterdayRows[0],
      materials: matCount[0], accounts: accCount[0].total
    }});
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 趋势图数据
router.get('/trend', auth(), async (req, res) => {
  const { days = 14, metric = 'spend' } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT stat_date, SUM(spend) as spend, SUM(impressions) as impressions, SUM(clicks) as clicks,
        SUM(conversions) as conversions, SUM(video_views) as video_views,
        CASE WHEN SUM(spend)>0 THEN SUM(spend*roas)/SUM(spend) ELSE 0 END as roas,
        COUNT(DISTINCT material_id) as active_materials
      FROM tt_material_stats
      WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY stat_date ORDER BY stat_date`, [parseInt(days)]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// TOP 素材排行
router.get('/top', auth(), async (req, res) => {
  const { days = 7, limit = 10, metric = 'spend' } = req.query;
  const allowedMetrics = ['spend', 'conversions', 'roas', 'impressions'];
  const m = allowedMetrics.includes(metric) ? metric : 'spend';
  const orderExpr = m === 'roas'
    ? 'CASE WHEN SUM(s.spend)>0 THEN SUM(s.spend*s.roas)/SUM(s.spend) ELSE 0 END'
    : `SUM(s.${m})`;

  try {
    const [rows] = await db.query(
      `SELECT m.id, m.title, m.type, m.thumbnail_url, m.market, m.status,
        SUM(s.spend) as spend, SUM(s.impressions) as impressions, SUM(s.conversions) as conversions,
        CASE WHEN SUM(s.spend)>0 THEN SUM(s.spend*s.roas)/SUM(s.spend) ELSE 0 END as roas,
        CASE WHEN SUM(s.impressions)>0 THEN SUM(s.clicks)/SUM(s.impressions)*100 ELSE 0 END as ctr
      FROM tt_material_stats s
      LEFT JOIN tt_materials m ON m.id = s.material_id
      WHERE s.stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY s.material_id
      ORDER BY ${orderExpr} DESC
      LIMIT ?`, [parseInt(days), parseInt(limit)]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 市场分布
router.get('/market-dist', auth(), async (req, res) => {
  const { days = 30 } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT COALESCE(m.market, '未设置') as market, COUNT(DISTINCT m.id) as count,
        SUM(s.spend) as spend, SUM(s.conversions) as conversions
      FROM tt_materials m
      LEFT JOIN tt_material_stats s ON s.material_id = m.id AND s.stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY m.market ORDER BY spend DESC`, [parseInt(days)]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
