const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');
const logger = require('../logger');

// 素材列表
router.get('/', auth(), async (req, res) => {
  const {
    start_date = dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
    end_date = dayjs().format('YYYY-MM-DD'),
    sort_by = 'cost_desc',
    keyword,
    page_size = 30
  } = req.query;

  const sortMap = {
    cost_desc: 'total_cost DESC',
    cost_asc: 'total_cost ASC',
    roi_desc: 'roi DESC',
    ctr_desc: 'product_ctr DESC',
    convert_desc: 'pay_order_count DESC',
  };
  const orderClause = sortMap[sort_by] || 'total_cost DESC';

  try {
    let where = 'stat_date BETWEEN ? AND ?';
    const params = [start_date, end_date];

    if (keyword) {
      where += ' AND (title LIKE ? OR material_id LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [rows] = await db.query(
      `SELECT material_id, MAX(title) AS title, MAX(cover_url) AS cover_url, MAX(video_url) AS video_url,
        MAX(video_duration) AS video_duration, MAX(advertiser_id) AS advertiser_id,
        SUM(cost) AS cost, SUM(cost) AS total_cost,
        SUM(pay_order_count) AS pay_order_count,
        SUM(pay_order_amount) AS pay_order_amount,
        CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_amount) / SUM(cost) ELSE 0 END AS roi,
        CASE WHEN SUM(pay_order_count) > 0 THEN SUM(pay_order_amount) / SUM(pay_order_count) ELSE 0 END AS avg_order_value,
        CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_count) * 1000 / SUM(cost) ELSE 0 END AS orders_per_1k_cost,
        SUM(product_show_count) AS product_show_count,
        SUM(product_click_count) AS product_click_count,
        CASE WHEN SUM(product_show_count) > 0 THEN SUM(product_click_count) / SUM(product_show_count) * 100 ELSE 0 END AS product_ctr,
        CASE WHEN SUM(product_click_count) > 0 THEN SUM(pay_order_count) / SUM(product_click_count) * 100 ELSE 0 END AS product_convert_rate,
        SUM(video_play_count) AS video_play_count,
        AVG(NULLIF(video_finish_rate, 0)) AS video_finish_rate,
        MAX(ai_score) AS ai_score
       FROM qc_material_stats
       WHERE ${where}
       GROUP BY material_id
       HAVING total_cost > 0
       ORDER BY ${orderClause}
       LIMIT ?`,
      [...params, parseInt(page_size)]
    );

    // 汇总
    const [[sum]] = await db.query(
      `SELECT SUM(cost) AS total_cost, SUM(pay_order_amount) AS total_gmv,
        CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_amount) / SUM(cost) ELSE 0 END AS avg_roi,
        CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_count) * 1000 / SUM(cost) ELSE 0 END AS orders_per_1k_cost
       FROM qc_material_stats WHERE ${where}`,
      params
    );

    res.json({ code: 0, data: { list: rows, summary: sum } });
  } catch (e) {
    logger.error('[Materials] 列表查询失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 汇总统计（头部卡片：今日数据 + 近7天数据 + 环比）
router.get('/summary-stats', auth(), async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const weekEnd = today;
  const prevWeekStart = dayjs().subtract(13, 'day').format('YYYY-MM-DD');
  const prevWeekEnd = dayjs().subtract(7, 'day').format('YYYY-MM-DD');

  try {
    // 通用聚合
    const queryPeriod = async (start, end) => {
      const [[r]] = await db.query(
        `SELECT SUM(cost) AS cost, SUM(pay_order_count) AS orders, SUM(pay_order_amount) AS gmv,
          CASE WHEN SUM(cost) > 0 THEN SUM(pay_order_amount) / SUM(cost) ELSE 0 END AS roi,
          CASE WHEN SUM(product_show_count) > 0 THEN SUM(product_click_count) / SUM(product_show_count) ELSE 0 END AS ctr,
          COUNT(DISTINCT material_id) AS material_count
         FROM qc_material_stats WHERE stat_date BETWEEN ? AND ? AND cost > 0`, [start, end]
      );
      return {
        cost: parseFloat(r.cost) || 0,
        orders: parseInt(r.orders) || 0,
        gmv: parseFloat(r.gmv) || 0,
        roi: parseFloat(r.roi) || 0,
        ctr: parseFloat(r.ctr) || 0,
        material_count: parseInt(r.material_count) || 0
      };
    };

    // 新素材统计（首次出现在该日期范围内的素材）
    const queryNew = async (start, end) => {
      const [[r]] = await db.query(
        `SELECT COUNT(DISTINCT m.material_id) AS new_materials, COALESCE(SUM(m.cost), 0) AS new_cost
         FROM qc_material_stats m
         WHERE m.stat_date BETWEEN ? AND ? AND m.cost > 0
           AND NOT EXISTS (SELECT 1 FROM qc_material_stats p WHERE p.material_id = m.material_id AND p.stat_date < ? AND p.cost > 0)`,
        [start, end, start]
      );
      return { new_materials: parseInt(r.new_materials) || 0, new_cost: parseFloat(r.new_cost) || 0 };
    };

    const pct = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100) : 0;

    const [todayData, yesterdayData, weekData, prevWeekData, todayNew, weekNew] = await Promise.all([
      queryPeriod(today, today),
      queryPeriod(yesterday, yesterday),
      queryPeriod(weekStart, weekEnd),
      queryPeriod(prevWeekStart, prevWeekEnd),
      queryNew(today, today),
      queryNew(weekStart, weekEnd)
    ]);

    res.json({
      code: 0,
      data: {
        today: {
          cost: todayData.cost,
          cost_change: pct(todayData.cost, yesterdayData.cost),
          roi: todayData.roi,
          roi_change: pct(todayData.roi, yesterdayData.roi),
          ctr: todayData.ctr,
          orders: todayData.orders,
          today_new_cost: todayNew.new_cost,
          new_materials: todayNew.new_materials
        },
        week: {
          cost: weekData.cost,
          cost_change: pct(weekData.cost, prevWeekData.cost),
          roi: weekData.roi,
          roi_change: pct(weekData.roi, prevWeekData.roi),
          new_cost: weekNew.new_cost,
          new_materials: weekNew.new_materials,
          orders: weekData.orders,
          orders_change: pct(weekData.orders, prevWeekData.orders),
          gmv: weekData.gmv,
          gmv_change: pct(weekData.gmv, prevWeekData.gmv)
        }
      }
    });
  } catch (e) {
    logger.error('[Materials] summary-stats 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 封面同步
router.post('/sync-covers', auth(), async (req, res) => {
  // 暂时返回成功，实际需要调用千川API同步
  res.json({ code: 0, msg: '封面同步完成' });
});

module.exports = router;
