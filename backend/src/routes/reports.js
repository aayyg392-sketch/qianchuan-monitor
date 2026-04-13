const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');

// 每日明细 + 推广目标分组
router.get('/daily-detail', auth(), async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.json({ code: 400, msg: 'startDate 和 endDate 必填' });
  }

  try {
    const aw = req.accWhere || '';
    const ap = req.accParams || [];
    // 花费/转化从 qc_daily_stats campaign 级聚合
    const [costRows] = await db.query(
      `SELECT DATE_FORMAT(d.stat_date, '%Y-%m-%d') AS stat_date,
        SUM(d.cost) AS cost,
        SUM(d.convert_cnt) AS convert_cnt
       FROM qc_daily_stats d
       WHERE d.stat_date BETWEEN ? AND ? AND d.entity_type = 'campaign'${aw}
       GROUP BY d.stat_date
       ORDER BY d.stat_date`,
      [startDate, endDate, ...ap]
    );

    // 展示/点击从 qc_material_stats 聚合
    const [matRows] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS stat_date,
        SUM(show_cnt) AS show_cnt,
        SUM(click_cnt) AS click_cnt
       FROM qc_material_stats
       WHERE stat_date BETWEEN ? AND ?${aw}
       GROUP BY stat_date`,
      [startDate, endDate, ...ap]
    );

    // 合并两个数据源
    const matMap = {};
    for (const m of matRows) {
      matMap[m.stat_date] = m;
    }
    const daily = costRows.map(r => ({
      stat_date: r.stat_date,
      cost: r.cost,
      show_cnt: matMap[r.stat_date]?.show_cnt || '0',
      click_cnt: matMap[r.stat_date]?.click_cnt || '0',
      convert_cnt: r.convert_cnt,
    }));

    // 按 account_type 分组统计（video / live）
    const [goalRows] = await db.query(
      `SELECT COALESCE(a.account_type, 'video') AS goal,
        SUM(d.cost) AS cost,
        SUM(d.convert_cnt) AS conv,
        CASE WHEN SUM(m.click_cnt) > 0 THEN SUM(d.convert_cnt) / SUM(m.click_cnt) ELSE 0 END AS cvr
       FROM qc_daily_stats d
       JOIN qc_accounts a ON d.advertiser_id = a.advertiser_id
       LEFT JOIN (
         SELECT advertiser_id, stat_date, SUM(click_cnt) AS click_cnt
         FROM qc_material_stats
         WHERE stat_date BETWEEN ? AND ?${aw}
         GROUP BY advertiser_id, stat_date
       ) m ON d.advertiser_id = m.advertiser_id AND d.stat_date = m.stat_date
       WHERE d.stat_date BETWEEN ? AND ? AND d.entity_type = 'campaign'${aw.replace(/advertiser_id/g, 'd.advertiser_id')}
       GROUP BY a.account_type`,
      [startDate, endDate, ...ap, startDate, endDate, ...ap]
    );

    const goals = {};
    for (const r of goalRows) {
      const key = r.goal === 'live' ? 'live' : 'video';
      goals[`${key}_cost`] = parseFloat(r.cost) || 0;
      goals[`${key}_conv`] = parseInt(r.conv) || 0;
      goals[`${key}_cvr`] = parseFloat(r.cvr) || 0;
    }

    res.json({ code: 0, data: { daily, goals } });
  } catch (e) {
    logger.error('[Reports] daily-detail 查询失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
