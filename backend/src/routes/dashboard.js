const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');
const logger = require('../logger');

// 数据概览
router.get('/overview', auth(), async (req, res) => {
  const period = req.query.period || 'today';

  // 根据 period 计算当期和对比期日期范围
  let curStart, curEnd, prevStart, prevEnd;
  if (period === 'yesterday') {
    curStart = curEnd = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    prevStart = prevEnd = dayjs().subtract(2, 'day').format('YYYY-MM-DD');
  } else if (period === '7d') {
    curStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
    curEnd = dayjs().format('YYYY-MM-DD');
    prevStart = dayjs().subtract(13, 'day').format('YYYY-MM-DD');
    prevEnd = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  } else {
    // today
    curStart = curEnd = dayjs().format('YYYY-MM-DD');
    prevStart = prevEnd = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  }

  const trendStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const trendEnd = dayjs().format('YYYY-MM-DD');

  try {
    // 聚合函数：查指定日期范围的汇总
    const queryStats = async (start, end) => {
      const [[stats]] = await db.query(
        `SELECT SUM(cost) AS cost, SUM(convert_cnt) AS convert_cnt, SUM(cpm) AS gmv
         FROM qc_daily_stats WHERE stat_date BETWEEN ? AND ? AND entity_type = 'campaign'`, [start, end]
      );
      const [[mat]] = await db.query(
        `SELECT SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt, SUM(cost) AS material_cost
         FROM qc_material_stats WHERE stat_date BETWEEN ? AND ?`, [start, end]
      );
      const cost = parseFloat(stats.cost) || 0;
      const gmv = parseFloat(stats.gmv) || 0;
      const show = parseInt(mat.show_cnt) || 0;
      const click = parseInt(mat.click_cnt) || 0;
      const convert = parseInt(stats.convert_cnt) || 0;
      const material_cost = parseFloat(mat.material_cost) || 0;
      return {
        cost, gmv, show_cnt: show, click_cnt: click, convert_cnt: convert,
        material_cost,
        roi: cost > 0 ? gmv / cost : 0,
        ctr: show > 0 ? click / show : 0,
        avg_cvr: click > 0 ? convert / click : 0,
        avg_convert_cost: convert > 0 ? cost / convert : 0
      };
    };

    const curData = await queryStats(curStart, curEnd);
    const prevData = await queryStats(prevStart, prevEnd);

    // 7天消耗趋势（始终显示近7天）
    const [trendRows] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS stat_date, SUM(cost) AS cost
       FROM qc_daily_stats
       WHERE stat_date BETWEEN ? AND ? AND entity_type = 'campaign'
       GROUP BY stat_date ORDER BY stat_date`, [trendStart, trendEnd]
    );

    // 账户表现（当期范围）
    const [accountRows] = await db.query(
      `SELECT a.advertiser_id, a.advertiser_name,
        COALESCE(d.cost, 0) AS today_cost,
        COALESCE(d.convert_cnt, 0) AS today_convert,
        COALESCE(d.gmv, 0) AS today_gmv,
        CASE WHEN COALESCE(d.cost, 0) > 0 THEN COALESCE(d.gmv, 0) / d.cost ELSE 0 END AS today_roi,
        COALESCE(m.show_cnt, 0) AS today_show,
        COALESCE(m.click_cnt, 0) AS today_click
       FROM qc_accounts a
       LEFT JOIN (
         SELECT advertiser_id, SUM(cost) AS cost, SUM(convert_cnt) AS convert_cnt, SUM(cpm) AS gmv
         FROM qc_daily_stats WHERE stat_date BETWEEN ? AND ? AND entity_type = 'campaign'
         GROUP BY advertiser_id
       ) d ON a.advertiser_id = d.advertiser_id
       LEFT JOIN (
         SELECT advertiser_id, SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt
         FROM qc_material_stats WHERE stat_date BETWEEN ? AND ?
         GROUP BY advertiser_id
       ) m ON a.advertiser_id = m.advertiser_id
       WHERE a.status = 1
       ORDER BY COALESCE(d.cost, 0) DESC`, [curStart, curEnd, curStart, curEnd]
    );

    res.json({
      code: 0,
      data: {
        today: curData,
        yesterday: prevData,
        trend: trendRows,
        accounts: accountRows
      }
    });
  } catch (e) {
    logger.error('[Dashboard] overview 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 实时数据 - TOP 素材（含排名变化）
router.get('/realtime', auth(), async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  try {
    // 今日 TOP 10
    const [rows] = await db.query(
      `SELECT material_id AS entity_id, title AS entity_name,
        cost, ctr / 100 AS ctr, pay_order_count AS convert_cnt
       FROM qc_material_stats
       WHERE stat_date = ? AND cost > 0
       ORDER BY cost DESC LIMIT 10`, [today]
    );

    // 昨日所有素材按消耗排名
    const [yesterdayRows] = await db.query(
      `SELECT material_id, @rank := @rank + 1 AS rank_pos
       FROM qc_material_stats, (SELECT @rank := 0) r
       WHERE stat_date = ? AND cost > 0
       ORDER BY cost DESC`, [yesterday]
    );
    const yesterdayRankMap = {};
    yesterdayRows.forEach(r => { yesterdayRankMap[String(r.material_id)] = parseInt(r.rank_pos); });

    // 计算排名变化
    const enriched = rows.map((row, idx) => {
      const todayRank = idx + 1;
      const yesterdayRank = yesterdayRankMap[String(row.entity_id)];
      // rank_change > 0 表示上升, < 0 表示下降, null 表示新上榜
      const rank_change = yesterdayRank != null ? yesterdayRank - todayRank : null;
      return { ...row, rank_change };
    });

    res.json({ code: 0, data: { top_creatives: enriched } });
  } catch (e) {
    logger.error('[Dashboard] realtime 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 素材趋势（兼容旧版前端）
router.get('/material-trend', auth(), async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  try {
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date,
        SUM(cost) AS cost, SUM(pay_order_count) AS orders, SUM(pay_order_amount) AS gmv,
        CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_amount) / SUM(cost) ELSE 0 END AS roi
       FROM qc_material_stats
       WHERE stat_date BETWEEN ? AND ? AND cost > 0
       GROUP BY stat_date ORDER BY stat_date`, [weekStart, today]
    );
    res.json({ code: 0, data: { trend: rows } });
  } catch (e) {
    logger.error('[Dashboard] material-trend 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 潜力素材（兼容旧版前端）
router.get('/potential-materials', auth(), async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  try {
    const [rows] = await db.query(
      `SELECT material_id, MAX(title) AS title, SUM(cost) AS cost,
        CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_amount) / SUM(cost) ELSE 0 END AS roi,
        SUM(pay_order_count) AS orders
       FROM qc_material_stats
       WHERE stat_date BETWEEN ? AND ? AND cost > 0
       GROUP BY material_id
       HAVING roi >= 2 AND cost < 500
       ORDER BY roi DESC LIMIT 10`, [weekStart, today]
    );
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    logger.error('[Dashboard] potential-materials 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 产品CTR/转化率趋势
router.get('/product-trend', auth(), async (req, res) => {
  const { entityType = 'campaign', topN = 5 } = req.query;
  const endDate = dayjs().format('YYYY-MM-DD');
  const startDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  try {
    if (entityType === 'creative') {
      // 按素材维度：从 qc_material_stats
      // 先找 TOP N 素材（按总消耗）
      const [topEntities] = await db.query(
        `SELECT material_id AS entity_id, MAX(title) AS entity_name, SUM(cost) AS total_cost
         FROM qc_material_stats
         WHERE stat_date BETWEEN ? AND ? AND cost > 0
         GROUP BY material_id ORDER BY total_cost DESC LIMIT ?`,
        [startDate, endDate, parseInt(topN)]
      );

      if (!topEntities.length) {
        return res.json({ code: 0, data: { dates: [], entities: [] } });
      }

      const ids = topEntities.map(e => e.entity_id);
      const [details] = await db.query(
        `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS stat_date, material_id AS entity_id,
          CASE WHEN SUM(show_cnt) > 0 THEN SUM(click_cnt)/SUM(show_cnt)*100 ELSE 0 END AS ctr,
          CASE WHEN SUM(click_cnt) > 0 THEN SUM(pay_order_count)/SUM(click_cnt)*100 ELSE 0 END AS cvr
         FROM qc_material_stats
         WHERE stat_date BETWEEN ? AND ? AND material_id IN (?)
         GROUP BY stat_date, material_id ORDER BY stat_date`,
        [startDate, endDate, ids]
      );

      // 生成日期列表
      const dates = [];
      for (let d = dayjs(startDate); !d.isAfter(endDate); d = d.add(1, 'day')) {
        dates.push(d.format('YYYY-MM-DD'));
      }

      const entities = topEntities.map(e => {
        const rows = details.filter(r => String(r.entity_id) === String(e.entity_id));
        const rowMap = {};
        rows.forEach(r => { rowMap[r.stat_date] = r; });
        const ctr_series = dates.map(d => rowMap[d] ? parseFloat(rowMap[d].ctr) : null);
        const cvr_series = dates.map(d => rowMap[d] ? parseFloat(rowMap[d].cvr) : null);
        const validCtrs = ctr_series.filter(v => v !== null);
        const validCvrs = cvr_series.filter(v => v !== null);
        return {
          entity_id: e.entity_id,
          entity_name: e.entity_name || String(e.entity_id),
          total_cost: parseFloat(e.total_cost) || 0,
          avg_ctr: validCtrs.length ? validCtrs.reduce((a, b) => a + b, 0) / validCtrs.length : 0,
          avg_cvr: validCvrs.length ? validCvrs.reduce((a, b) => a + b, 0) / validCvrs.length : 0,
          ctr_series,
          cvr_series
        };
      });

      return res.json({ code: 0, data: { dates, entities } });
    }

    // 按计划维度：从 qc_daily_stats (entity_type=campaign)
    const [topEntities] = await db.query(
      `SELECT entity_id, MAX(entity_name) AS entity_name, SUM(cost) AS total_cost
       FROM qc_daily_stats
       WHERE stat_date BETWEEN ? AND ? AND entity_type = 'campaign' AND cost > 0
       GROUP BY entity_id ORDER BY total_cost DESC LIMIT ?`,
      [startDate, endDate, parseInt(topN)]
    );

    if (!topEntities.length) {
      return res.json({ code: 0, data: { dates: [], entities: [] } });
    }

    const ids = topEntities.map(e => e.entity_id);
    const [details] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS stat_date, entity_id,
        CASE WHEN show_cnt > 0 THEN click_cnt/show_cnt*100 ELSE 0 END AS ctr,
        CASE WHEN click_cnt > 0 THEN convert_cnt/click_cnt*100 ELSE 0 END AS cvr
       FROM qc_daily_stats
       WHERE stat_date BETWEEN ? AND ? AND entity_type = 'campaign' AND entity_id IN (?)
       ORDER BY stat_date`,
      [startDate, endDate, ids]
    );

    // campaign 级 show/click 为0（千川全域推广不返回），用账户级 material_stats 补充
    // 先按 advertiser+date 聚合素材数据，再关联 campaign
    const allZero = details.every(r => parseFloat(r.ctr) === 0);

    let finalDetails = details;
    if (allZero) {
      const [matDetails] = await db.query(
        `SELECT DATE_FORMAT(d.stat_date, '%Y-%m-%d') AS stat_date, d.entity_id,
          CASE WHEN mat.show_cnt > 0 THEN mat.click_cnt / mat.show_cnt * 100 ELSE 0 END AS ctr,
          CASE WHEN mat.click_cnt > 0 THEN d.convert_cnt / mat.click_cnt * 100 ELSE 0 END AS cvr
         FROM qc_daily_stats d
         JOIN (
           SELECT advertiser_id, stat_date, SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt
           FROM qc_material_stats WHERE stat_date BETWEEN ? AND ?
           GROUP BY advertiser_id, stat_date
         ) mat ON d.advertiser_id = mat.advertiser_id AND d.stat_date = mat.stat_date
         WHERE d.stat_date BETWEEN ? AND ? AND d.entity_type = 'campaign' AND d.entity_id IN (?)
         ORDER BY d.stat_date`,
        [startDate, endDate, startDate, endDate, ids]
      );
      if (matDetails.length) finalDetails = matDetails;
    }

    const dates = [];
    for (let d = dayjs(startDate); !d.isAfter(endDate); d = d.add(1, 'day')) {
      dates.push(d.format('YYYY-MM-DD'));
    }

    const entities = topEntities.map(e => {
      const rows = finalDetails.filter(r => String(r.entity_id) === String(e.entity_id));
      const rowMap = {};
      rows.forEach(r => { rowMap[r.stat_date] = r; });
      const ctr_series = dates.map(d => rowMap[d] ? parseFloat(rowMap[d].ctr) : null);
      const cvr_series = dates.map(d => rowMap[d] ? parseFloat(rowMap[d].cvr) : null);
      const validCtrs = ctr_series.filter(v => v !== null);
      const validCvrs = cvr_series.filter(v => v !== null);
      return {
        entity_id: e.entity_id,
        entity_name: e.entity_name || String(e.entity_id),
        total_cost: parseFloat(e.total_cost) || 0,
        avg_ctr: validCtrs.length ? validCtrs.reduce((a, b) => a + b, 0) / validCtrs.length : 0,
        avg_cvr: validCvrs.length ? validCvrs.reduce((a, b) => a + b, 0) / validCvrs.length : 0,
        ctr_series,
        cvr_series
      };
    });

    res.json({ code: 0, data: { dates, entities } });
  } catch (e) {
    logger.error('[Dashboard] product-trend 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 素材详情+7天趋势
router.get('/material-detail/:material_id', auth(), async (req, res) => {
  const { material_id } = req.params;
  const endDate = dayjs().format('YYYY-MM-DD');
  const startDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  try {
    // 今日汇总
    const [[todayRow]] = await db.query(
      `SELECT SUM(cost) AS cost, SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt,
        SUM(pay_order_count) AS convert_cnt, SUM(pay_order_amount) AS gmv,
        CASE WHEN SUM(show_cnt)>0 THEN SUM(click_cnt)/SUM(show_cnt) ELSE 0 END AS ctr,
        CASE WHEN SUM(cost)>0 THEN SUM(pay_order_amount)/SUM(cost) ELSE 0 END AS roi
       FROM qc_material_stats WHERE material_id=? AND stat_date=?`, [material_id, endDate]
    );

    // 7天趋势
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%m-%d') AS date,
        COALESCE(cost,0) AS cost, COALESCE(show_cnt,0) AS show_cnt, COALESCE(click_cnt,0) AS click_cnt,
        COALESCE(pay_order_count,0) AS orders, COALESCE(pay_order_amount,0) AS gmv,
        CASE WHEN cost>0 THEN pay_order_amount/cost ELSE 0 END AS roi
       FROM qc_material_stats WHERE material_id=? AND stat_date BETWEEN ? AND ?
       ORDER BY stat_date`, [material_id, startDate, endDate]
    );

    // 填充缺失日期
    const rowMap = {};
    rows.forEach(r => { rowMap[r.date] = r; });
    const dates = [], cost = [], orders = [], roi = [], show = [], click = [];
    for (let i = 0; i < 7; i++) {
      const d = dayjs().subtract(6 - i, 'day').format('MM-DD');
      const r = rowMap[d] || {};
      dates.push(d);
      cost.push(parseFloat(r.cost || 0));
      orders.push(parseInt(r.orders || 0));
      roi.push(parseFloat(parseFloat(r.roi || 0).toFixed(2)));
      show.push(parseInt(r.show_cnt || 0));
      click.push(parseInt(r.click_cnt || 0));
    }

    res.json({
      code: 0,
      data: {
        today: todayRow || {},
        trend: { dates, cost, orders, roi, show, click }
      }
    });
  } catch (e) {
    logger.error('[Dashboard] material-detail 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 指标分析 - 返回7天趋势 + 驱动因子 + 账户对比（无AI）
router.post('/analyze-metric', auth(), async (req, res) => {
  const { metric_key, period = 'today' } = req.body;
  const endDate = dayjs().format('YYYY-MM-DD');
  const startDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  try {
    // 1. 7天趋势数据
    const [trendRows] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%m-%d') AS date,
        SUM(cost) AS cost, SUM(cpm) AS gmv, SUM(convert_cnt) AS convert_cnt,
        SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt
       FROM qc_daily_stats
       WHERE stat_date BETWEEN ? AND ? AND entity_type = 'campaign'
       GROUP BY stat_date ORDER BY stat_date`, [startDate, endDate]
    );

    // 素材维度补充 show/click
    const [matTrend] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%m-%d') AS date,
        SUM(show_cnt) AS m_show, SUM(click_cnt) AS m_click, SUM(pay_order_count) AS m_orders,
        SUM(pay_order_amount) AS m_gmv
       FROM qc_material_stats
       WHERE stat_date BETWEEN ? AND ?
       GROUP BY stat_date ORDER BY stat_date`, [startDate, endDate]
    );
    const matMap = {};
    matTrend.forEach(r => { matMap[r.date] = r; });

    const trend = trendRows.map(r => {
      const m = matMap[r.date] || {};
      const cost = parseFloat(r.cost || 0);
      const gmv = parseFloat(r.gmv || 0);
      const show = parseInt(m.m_show || r.show_cnt || 0);
      const click = parseInt(m.m_click || r.click_cnt || 0);
      const convert = parseInt(r.convert_cnt || 0);
      return {
        date: r.date, cost, gmv, convert_cnt: convert,
        show_cnt: show, click_cnt: click,
        roi: cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0,
        ctr: show > 0 ? parseFloat((click / show).toFixed(4)) : 0,
        cvr: click > 0 ? parseFloat((convert / click).toFixed(4)) : 0,
        avg_convert_cost: convert > 0 ? parseFloat((cost / convert).toFixed(2)) : 0,
      };
    });

    // 根据 metric_key 提取对应值
    const metricMap = {
      cost: r => r.cost,
      roi: r => r.roi,
      ctr: r => r.ctr,
      cvr: r => r.cvr,
      visitor_count: r => r.show_cnt,
      avg_convert_cost: r => r.avg_convert_cost,
    };
    const getter = metricMap[metric_key] || metricMap.cost;
    const trendData = { date: trend.map(r => r.date), value: trend.map(r => getter(r)) };

    // 2. 驱动因子（今日 vs 昨日核心指标）
    const todayIdx = trend.length - 1;
    const yesterdayIdx = trend.length >= 2 ? trend.length - 2 : 0;
    const tToday = trend[todayIdx] || {};
    const tYesterday = trend[yesterdayIdx] || {};
    const drivers = {
      labels: ['消耗', '展示量', '点击量', '转化数', 'GMV'],
      today: [tToday.cost, tToday.show_cnt, tToday.click_cnt, tToday.convert_cnt, tToday.gmv],
      yesterday: [tYesterday.cost, tYesterday.show_cnt, tYesterday.click_cnt, tYesterday.convert_cnt, tYesterday.gmv],
    };

    // 3. 各账户该指标对比
    const [accRows] = await db.query(
      `SELECT a.advertiser_name AS name,
        COALESCE(SUM(d.cost), 0) AS cost, COALESCE(SUM(d.cpm), 0) AS gmv,
        COALESCE(SUM(d.convert_cnt), 0) AS convert_cnt
       FROM qc_accounts a
       LEFT JOIN qc_daily_stats d ON a.advertiser_id = d.advertiser_id
         AND d.stat_date = ? AND d.entity_type = 'campaign'
       WHERE a.status = 1
       GROUP BY a.advertiser_id, a.advertiser_name
       ORDER BY COALESCE(SUM(d.cost), 0) DESC`, [endDate]
    );

    const breakdown = accRows.filter(r => parseFloat(r.cost) > 0).map(r => {
      const cost = parseFloat(r.cost);
      const gmv = parseFloat(r.gmv);
      const convert = parseInt(r.convert_cnt);
      let val = cost;
      if (metric_key === 'roi') val = cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0;
      else if (metric_key === 'avg_convert_cost') val = convert > 0 ? parseFloat((cost / convert).toFixed(2)) : 0;
      else if (metric_key === 'visitor_count') val = parseInt(r.convert_cnt); // fallback
      return { name: r.name, value: val };
    });

    res.json({
      code: 0,
      data: {
        analysis: '', // 无AI分析
        chart_data: { trend: trendData, drivers, breakdown },
        roi_detail: null
      }
    });
  } catch (e) {
    logger.error('[Dashboard] analyze-metric 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
