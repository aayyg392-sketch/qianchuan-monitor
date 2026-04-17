const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// 构造"素材上架"过滤子查询：筛选首次投放日期(MIN(stat_date))在范围内的素材
// 返回 { clause, params }
// - date_type='upload': 按 material_id 首次出现日期过滤，stat_date 不再限定范围
// - date_type='consume'(默认): 按 stat_date 过滤
function buildDateFilter(date_type, start_date, end_date, aw, ap) {
  if (date_type === 'upload') {
    // 首次上架日在 [start,end]；数据仍需全量累计该素材所有消耗
    return {
      whereClause: `show_cnt > 100${aw} AND material_id IN (
        SELECT material_id FROM qc_material_stats
        WHERE show_cnt > 100${aw}
        GROUP BY material_id
        HAVING MIN(stat_date) BETWEEN ? AND ?
      )`,
      params: [...ap, ...ap, start_date, end_date]
    };
  }
  // 默认：按消耗时间过滤
  return {
    whereClause: `stat_date BETWEEN ? AND ? AND show_cnt > 100${aw}`,
    params: [start_date, end_date, ...ap]
  };
}

// ===================== GET /ctr-overview =====================
router.get('/ctr-overview', auth(), async (req, res) => {
  try {
    const { start_date, end_date, date_type = 'consume' } = req.query;
    if (!start_date || !end_date) return res.json({ code: 400, msg: '缺少日期参数' });

    const aw = req.accWhere || '';
    const ap = req.accParams || [];

    const { whereClause, params } = buildDateFilter(date_type, start_date, end_date, aw, ap);

    // 当期统计（仅 show_cnt > 100 的有效素材）
    // avg_ctr 用加权：SUM(click)/SUM(show)，避免脏数据(ctr=100%)拉高算术均值
    const [[cur]] = await db.query(
      `SELECT
         SUM(click_cnt)/NULLIF(SUM(show_cnt),0)*100 AS avg_ctr,
         SUM(show_cnt) AS total_show,
         SUM(click_cnt) AS total_click,
         COUNT(DISTINCT material_id) AS mat_count
       FROM qc_material_stats
       WHERE ${whereClause}`,
      params
    );

    // 计算前一个同长度周期
    const d0 = new Date(start_date);
    const d1 = new Date(end_date);
    const span = Math.round((d1 - d0) / 86400000) + 1;
    const prevEnd = new Date(d0);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - span + 1);
    const pStart = prevStart.toISOString().slice(0, 10);
    const pEnd = prevEnd.toISOString().slice(0, 10);

    const prevF = buildDateFilter(date_type, pStart, pEnd, aw, ap);
    const [[prev]] = await db.query(
      `SELECT
         SUM(click_cnt)/NULLIF(SUM(show_cnt),0)*100 AS avg_ctr,
         SUM(show_cnt) AS total_show,
         SUM(click_cnt) AS total_click
       FROM qc_material_stats
       WHERE ${prevF.whereClause}`,
      prevF.params
    );

    // CTR 达标率：按 material_id 聚合后 CTR>=2% 的素材占比
    const [[qual]] = await db.query(
      `SELECT
         COUNT(*) AS total_qualified,
         SUM(CASE WHEN ctr >= 2 THEN 1 ELSE 0 END) AS pass_count
       FROM (
         SELECT material_id,
                SUM(click_cnt)/NULLIF(SUM(show_cnt),0)*100 AS ctr
         FROM qc_material_stats
         WHERE ${whereClause}
         GROUP BY material_id
         HAVING SUM(show_cnt) > 100
       ) t`,
      params
    );
    const totalQualified = parseInt(qual.total_qualified) || 0;
    const passCount = parseInt(qual.pass_count) || 0;
    const passRate = totalQualified > 0 ? parseFloat((passCount / totalQualified * 100).toFixed(1)) : 0;

    res.json({
      code: 0,
      data: {
        avg_ctr: parseFloat(Number(cur.avg_ctr || 0).toFixed(2)),
        total_show: parseInt(cur.total_show) || 0,
        total_click: parseInt(cur.total_click) || 0,
        mat_count: parseInt(cur.mat_count) || 0,
        total_qualified: totalQualified,
        pass_count: passCount,
        pass_rate: passRate,
        yd_ctr: parseFloat(Number(prev.avg_ctr || 0).toFixed(2)),
        yd_show: parseInt(prev.total_show) || 0,
        yd_click: parseInt(prev.total_click) || 0,
        yd_label: '昨日'
      }
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /ctr-ranking =====================
router.get('/ctr-ranking', auth(), async (req, res) => {
  try {
    const { start_date, end_date, date_type = 'consume' } = req.query;
    if (!start_date || !end_date) return res.json({ code: 400, msg: '缺少日期参数' });

    const aw = req.accWhere || '';
    const ap = req.accParams || [];

    // upload模式：素材首次投放日在范围内，累计该素材全部消耗
    // consume模式：仅统计 stat_date 在范围内的数据
    let mWhere, mParams;
    if (date_type === 'upload') {
      mWhere = `m.show_cnt > 100${aw} AND m.material_id IN (
        SELECT material_id FROM qc_material_stats
        WHERE show_cnt > 100${aw}
        GROUP BY material_id
        HAVING MIN(stat_date) BETWEEN ? AND ?
      )`;
      mParams = [...ap, ...ap, start_date, end_date];
    } else {
      mWhere = `m.stat_date BETWEEN ? AND ? AND m.show_cnt > 100${aw}`;
      mParams = [start_date, end_date, ...ap];
    }

    const baseSQL = `
      SELECT m.material_id, m.title, m.cover_url,
             SUM(m.show_cnt) AS show_cnt, SUM(m.click_cnt) AS click_cnt,
             SUM(m.click_cnt) / SUM(m.show_cnt) * 100 AS ctr,
             SUM(m.cost) AS cost,
             a.advertiser_name
      FROM qc_material_stats m
      LEFT JOIN qc_accounts a ON m.advertiser_id = a.advertiser_id
      WHERE ${mWhere}
      GROUP BY m.material_id
      HAVING SUM(m.show_cnt) > 100`;

    const [top] = await db.query(
      `${baseSQL} ORDER BY ctr DESC LIMIT 20`,
      mParams
    );
    const [bottom] = await db.query(
      `${baseSQL} ORDER BY ctr ASC LIMIT 20`,
      mParams
    );

    const fmt = rows => rows.map(r => ({
      material_id: r.material_id,
      title: r.title,
      cover_url: r.cover_url,
      show_cnt: parseInt(r.show_cnt) || 0,
      click_cnt: parseInt(r.click_cnt) || 0,
      ctr: parseFloat(Number(r.ctr || 0).toFixed(2)),
      cost: parseFloat(Number(r.cost || 0).toFixed(2)),
      advertiser_name: r.advertiser_name || ''
    }));

    res.json({ code: 0, data: { top: fmt(top), bottom: fmt(bottom) } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /ctr-trend =====================
router.get('/ctr-trend', auth(), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.json({ code: 400, msg: '缺少日期参数' });

    const aw = req.accWhere || '';
    const ap = req.accParams || [];

    const endDate = date;
    const d = new Date(date);
    d.setDate(d.getDate() - 6);
    const startDate = d.toISOString().slice(0, 10);

    // 整体每日趋势
    const [overall] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date,
              SUM(click_cnt) / SUM(show_cnt) * 100 AS ctr
       FROM qc_material_stats
       WHERE stat_date BETWEEN ? AND ? AND show_cnt > 100${aw}
       GROUP BY stat_date ORDER BY stat_date`,
      [startDate, endDate, ...ap]
    );

    // 各账户每日趋势
    const [accRows] = await db.query(
      `SELECT m.advertiser_id AS id, a.advertiser_name AS name,
              DATE_FORMAT(m.stat_date, '%Y-%m-%d') AS date,
              SUM(m.click_cnt) / SUM(m.show_cnt) * 100 AS ctr
       FROM qc_material_stats m
       LEFT JOIN qc_accounts a ON m.advertiser_id = a.advertiser_id
       WHERE m.stat_date BETWEEN ? AND ? AND m.show_cnt > 100${aw}
       GROUP BY m.advertiser_id, m.stat_date
       ORDER BY m.advertiser_id, m.stat_date`,
      [startDate, endDate, ...ap]
    );

    // 按账户分组
    const accMap = {};
    for (const r of accRows) {
      if (!accMap[r.id]) accMap[r.id] = { id: r.id, name: r.name || String(r.id), data: [] };
      accMap[r.id].data.push({ date: r.date, ctr: parseFloat(Number(r.ctr || 0).toFixed(2)) });
    }

    res.json({
      code: 0,
      data: {
        trend: overall.map(r => ({ date: r.date, ctr: parseFloat(Number(r.ctr || 0).toFixed(2)) })),
        accounts: Object.values(accMap)
      }
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /ctr-distribution =====================
router.get('/ctr-distribution', auth(), async (req, res) => {
  try {
    const { start_date, end_date, date_type = 'consume' } = req.query;
    if (!start_date || !end_date) return res.json({ code: 400, msg: '缺少日期参数' });

    const aw = req.accWhere || '';
    const ap = req.accParams || [];

    const { whereClause, params } = buildDateFilter(date_type, start_date, end_date, aw, ap);

    // 逐桶查询
    const buckets = [
      { label: '0-1%', min: 0, max: 0.01 },
      { label: '1-2%', min: 0.01, max: 0.02 },
      { label: '2-3%', min: 0.02, max: 0.03 },
      { label: '3-5%', min: 0.03, max: 0.05 },
      { label: '5-8%', min: 0.05, max: 0.08 },
      { label: '8%+', min: 0.08, max: 999 }
    ];

    const labels = [];
    const values = [];
    const shows = [];

    for (const b of buckets) {
      const [[r]] = await db.query(
        `SELECT COUNT(*) AS cnt, SUM(show_sum) AS show_sum FROM (
           SELECT material_id, SUM(show_cnt) AS show_sum, SUM(click_cnt) / SUM(show_cnt) AS agg_ctr
           FROM qc_material_stats
           WHERE ${whereClause}
           GROUP BY material_id
           HAVING SUM(show_cnt) > 100 AND agg_ctr >= ? AND agg_ctr < ?
         ) t`,
        [...params, b.min, b.max]
      );
      labels.push(b.label);
      values.push(parseInt(r.cnt) || 0);
      shows.push(parseInt(r.show_sum) || 0);
    }

    res.json({ code: 0, data: { labels, values, shows } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /ctr-alerts =====================
router.get('/ctr-alerts', auth(), async (req, res) => {
  try {
    const { start_date, end_date, date_type = 'consume' } = req.query;
    if (!start_date || !end_date) return res.json({ code: 400, msg: '缺少日期参数' });

    const aw = req.accWhere || '';
    const ap = req.accParams || [];

    const { whereClause, params } = buildDateFilter(date_type, start_date, end_date, aw, ap);

    // 低CTR: ctr < 1% 且 show_cnt > 1000
    const [lowCtr] = await db.query(
      `SELECT material_id, title, cover_url,
              SUM(click_cnt) / SUM(show_cnt) * 100 AS ctr,
              SUM(show_cnt) AS show_cnt, SUM(cost) AS cost
       FROM qc_material_stats
       WHERE ${whereClause}
       GROUP BY material_id
       HAVING SUM(show_cnt) > 1000 AND SUM(click_cnt) / SUM(show_cnt) < 0.01`,
      params
    );

    // 高消耗低CTR: cost > 500 且 ctr < 2%
    const [highCostLowCtr] = await db.query(
      `SELECT material_id, title, cover_url,
              SUM(click_cnt) / SUM(show_cnt) * 100 AS ctr,
              SUM(show_cnt) AS show_cnt, SUM(cost) AS cost
       FROM qc_material_stats
       WHERE ${whereClause}
       GROUP BY material_id
       HAVING SUM(cost) > 500 AND SUM(click_cnt) / SUM(show_cnt) < 0.02`,
      params
    );

    const seen = new Set();
    const alerts = [];

    const fmt = (rows, alertType) => {
      for (const r of rows) {
        const key = `${r.material_id}_${alertType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        alerts.push({
          material_id: r.material_id,
          title: r.title,
          cover_url: r.cover_url,
          ctr: parseFloat(Number(r.ctr || 0).toFixed(2)),
          show_cnt: parseInt(r.show_cnt) || 0,
          cost: parseFloat(Number(r.cost || 0).toFixed(2)),
          alert_type: alertType
        });
      }
    };

    fmt(lowCtr, 'low_ctr');
    fmt(highCostLowCtr, 'high_cost_low_ctr');

    res.json({ code: 0, data: alerts });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /new-material-trend =====================
router.get('/new-material-trend', auth(), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.json({ code: 400, msg: '缺少日期参数' });

    const aw = req.accWhere || '';
    const ap = req.accParams || [];

    const endDate = date;
    const d = new Date(date);
    d.setDate(d.getDate() - 6);
    const startDate = d.toISOString().slice(0, 10);

    // 首次出现日期在范围内的素材按日汇总
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(first_date, '%Y-%m-%d') AS date,
              COUNT(*) AS new_count,
              SUM(show_cnt) AS show_cnt,
              SUM(click_cnt) / SUM(show_cnt) * 100 AS ctr
       FROM (
         SELECT material_id,
                MIN(stat_date) AS first_date,
                SUM(show_cnt) AS show_cnt,
                SUM(click_cnt) AS click_cnt
         FROM qc_material_stats
         WHERE show_cnt > 100${aw}
         GROUP BY material_id
         HAVING MIN(stat_date) BETWEEN ? AND ?
       ) t
       GROUP BY first_date
       ORDER BY first_date`,
      [...ap, startDate, endDate]
    );

    res.json({
      code: 0,
      data: {
        trend: rows.map(r => ({
          date: r.date,
          new_count: parseInt(r.new_count) || 0,
          show_cnt: parseInt(r.show_cnt) || 0,
          ctr: parseFloat(Number(r.ctr || 0).toFixed(2))
        }))
      }
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
