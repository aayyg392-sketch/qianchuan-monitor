/**
 * 快手运营工作台 API
 */
const db = require('../db');
const logger = require('../logger');
const router = require('express').Router();

// ========== 工具函数 ==========
function pctChange(cur, prev) {
  if (!prev || prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

// ========== 0. GET /overview-all — 全店铺汇总 + 各店完整数据（一次返回，无需二次请求） ==========
router.get('/overview-all', async (req, res) => {
  try {
    const [accounts] = await db.query(
      'SELECT shop_id, shop_name, last_sync_at FROM ks_accounts WHERE status = 1 ORDER BY id'
    );
    if (!accounts.length) return res.json({ code: 0, data: { total: null, shops: [] } });

    const shopIds = accounts.map(a => a.shop_id);
    const ph = shopIds.map(() => '?').join(',');

    // 并行查询：今日、昨日、本月、待办
    const [todayRows, yestRows, monthRows, pendingShipRows, pendingRefundRows, adTodayRows, adYestRows] = await Promise.all([
      db.query(`
        SELECT shop_id,
          SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) AS orders,
          COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv,
          COALESCE(SUM(CASE WHEN refund_status > 0 THEN pay_amount ELSE 0 END), 0) AS refund_amt
        FROM ks_orders WHERE shop_id IN (${ph}) AND DATE(create_time) = CURDATE()
        GROUP BY shop_id
      `, shopIds).then(r => r[0]),

      db.query(`
        SELECT shop_id,
          SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) AS orders,
          COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv,
          COALESCE(SUM(CASE WHEN refund_status > 0 THEN pay_amount ELSE 0 END), 0) AS refund_amt
        FROM ks_orders WHERE shop_id IN (${ph}) AND DATE(create_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        GROUP BY shop_id
      `, shopIds).then(r => r[0]),

      db.query(`
        SELECT shop_id,
          COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv,
          SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) AS orders
        FROM ks_orders WHERE shop_id IN (${ph}) AND DATE(create_time) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        GROUP BY shop_id
      `, shopIds).then(r => r[0]),

      db.query(`
        SELECT shop_id, COUNT(*) AS cnt,
          SUM(CASE WHEN TIMESTAMPDIFF(HOUR, create_time, NOW()) > 42 THEN 1 ELSE 0 END) AS urgent
        FROM ks_orders WHERE shop_id IN (${ph}) AND pay_time IS NOT NULL AND shipping_time IS NULL AND refund_status = 0
        GROUP BY shop_id
      `, shopIds).then(r => r[0]),

      db.query(`
        SELECT shop_id, COUNT(*) AS cnt
        FROM ks_orders WHERE shop_id IN (${ph}) AND refund_status > 0 AND finish_time IS NULL
        GROUP BY shop_id
      `, shopIds).then(r => r[0]),

      // 磁力广告数据 - 今日（按店铺汇总）
      db.query(`
        SELECT a.shop_id,
          COALESCE(SUM(r.cost), 0) AS ad_cost,
          COALESCE(SUM(r.gmv), 0) AS ad_gmv
        FROM ks_ad_daily_report r
        JOIN ks_ad_accounts a ON r.advertiser_id = a.advertiser_id AND a.status = 1 AND a.shop_id IS NOT NULL
        WHERE r.report_date = CURDATE()
        GROUP BY a.shop_id
      `).then(r => r[0]),

      // 磁力广告数据 - 昨日（按店铺汇总）
      db.query(`
        SELECT a.shop_id,
          COALESCE(SUM(r.cost), 0) AS ad_cost,
          COALESCE(SUM(r.gmv), 0) AS ad_gmv
        FROM ks_ad_daily_report r
        JOIN ks_ad_accounts a ON r.advertiser_id = a.advertiser_id AND a.status = 1 AND a.shop_id IS NOT NULL
        WHERE r.report_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        GROUP BY a.shop_id
      `).then(r => r[0])
    ]);

    const toMap = rows => Object.fromEntries(rows.map(r => [r.shop_id, r]));
    const todayMap = toMap(todayRows);
    const yestMap = toMap(yestRows);
    const monthMap = toMap(monthRows);
    const shipMap = toMap(pendingShipRows);
    const refundMap = toMap(pendingRefundRows);
    const adTodayMap = toMap(adTodayRows);
    const adYestMap = toMap(adYestRows);
    const syncMap = Object.fromEntries(accounts.map(a => [a.shop_id, a.last_sync_at]));

    let totalToday = { gmv: 0, orders: 0, refund_amt: 0, ad_cost: 0, paid_sales: 0 };
    let totalYest = { gmv: 0, orders: 0, refund_amt: 0, ad_cost: 0, paid_sales: 0 };
    let totalMonth = 0;

    const shops = accounts.map(acc => {
      const t = todayMap[acc.shop_id] || { gmv: 0, orders: 0, refund_amt: 0 };
      const y = yestMap[acc.shop_id] || { gmv: 0, orders: 0, refund_amt: 0 };
      const m = monthMap[acc.shop_id] || { gmv: 0, orders: 0 };
      const ship = shipMap[acc.shop_id] || { cnt: 0, urgent: 0 };
      const refund = refundMap[acc.shop_id] || { cnt: 0 };

      const tGmv = parseFloat(t.gmv), yGmv = parseFloat(y.gmv);
      const tOrders = parseInt(t.orders || 0), yOrders = parseInt(y.orders || 0);
      const tRefAmt = parseFloat(t.refund_amt || 0), yRefAmt = parseFloat(y.refund_amt || 0);
      const tAvg = tOrders > 0 ? Math.round(tGmv / tOrders * 100) / 100 : 0;
      const yAvg = yOrders > 0 ? Math.round(yGmv / yOrders * 100) / 100 : 0;
      const mGmv = parseFloat(m.gmv);

      // 磁力广告数据
      const adT = adTodayMap[acc.shop_id] || { ad_cost: 0, ad_gmv: 0 };
      const adY = adYestMap[acc.shop_id] || { ad_cost: 0, ad_gmv: 0 };
      const tAdCost = parseFloat(adT.ad_cost || 0), yAdCost = parseFloat(adY.ad_cost || 0);
      const tPaidSales = parseFloat(adT.ad_gmv || 0), yPaidSales = parseFloat(adY.ad_gmv || 0);

      totalToday.gmv += tGmv; totalToday.orders += tOrders; totalToday.refund_amt += tRefAmt;
      totalToday.ad_cost += tAdCost; totalToday.paid_sales += tPaidSales;
      totalYest.gmv += yGmv; totalYest.orders += yOrders; totalYest.refund_amt += yRefAmt;
      totalYest.ad_cost += yAdCost; totalYest.paid_sales += yPaidSales;
      totalMonth += mGmv;

      return {
        shop_id: acc.shop_id,
        shop_name: acc.shop_name,
        last_sync_at: syncMap[acc.shop_id],
        today: { gmv: tGmv, orders: tOrders, refund_amt: tRefAmt, avg: tAvg, visitors: 0, cvr: 0, paid_sales: tPaidSales, ad_cost: tAdCost },
        yesterday: { gmv: yGmv, orders: yOrders, refund_amt: yRefAmt, avg: yAvg, visitors: 0, cvr: 0, paid_sales: yPaidSales, ad_cost: yAdCost },
        changes: {
          gmv: pctChange(tGmv, yGmv),
          orders: pctChange(tOrders, yOrders),
          refund_amt: pctChange(tRefAmt, yRefAmt),
          avg: pctChange(tAvg, yAvg),
          paid_sales: pctChange(tPaidSales, yPaidSales),
          ad_cost: pctChange(tAdCost, yAdCost)
        },
        month: { gmv: mGmv, orders: parseInt(m.orders || 0) },
        pending: {
          ship: parseInt(ship.cnt || 0),
          ship_urgent: parseInt(ship.urgent || 0),
          refund: parseInt(refund.cnt || 0)
        }
      };
    });

    // 全局月目标
    let monthlyTarget = 500000;
    try {
      const [[cfgRow]] = await db.query(
        "SELECT config_value FROM ks_config WHERE config_key = 'monthly_target_all' LIMIT 1"
      );
      if (cfgRow) monthlyTarget = parseFloat(cfgRow.config_value) || 500000;
    } catch (e) { /* ignore */ }

    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = Math.max(0, lastDay.getDate() - now.getDate());
    const gap = Math.max(0, monthlyTarget - totalMonth);
    const totalAvgToday = totalToday.orders > 0 ? Math.round(totalToday.gmv / totalToday.orders * 100) / 100 : 0;
    const totalAvgYest = totalYest.orders > 0 ? Math.round(totalYest.gmv / totalYest.orders * 100) / 100 : 0;

    res.json({
      code: 0,
      data: {
        total: {
          today: { ...totalToday, avg: totalAvgToday },
          yesterday: { ...totalYest, avg: totalAvgYest },
          changes: {
            gmv: pctChange(totalToday.gmv, totalYest.gmv),
            orders: pctChange(totalToday.orders, totalYest.orders),
            refund_amt: pctChange(totalToday.refund_amt, totalYest.refund_amt),
            avg: pctChange(totalAvgToday, totalAvgYest),
            paid_sales: pctChange(totalToday.paid_sales, totalYest.paid_sales),
            ad_cost: pctChange(totalToday.ad_cost, totalYest.ad_cost)
          },
          month: {
            target: monthlyTarget, current: totalMonth,
            pct: monthlyTarget > 0 ? Math.round(totalMonth / monthlyTarget * 1000) / 10 : 0,
            days_remaining: daysRemaining,
            daily_needed: daysRemaining > 0 ? Math.round(gap / daysRemaining) : gap
          }
        },
        shops
      }
    });
  } catch (e) {
    logger.error('[KS-Workbench] overview-all异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 1. GET /workbench ==========
router.get('/workbench', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    // 今日数据
    const [[todayRow]] = await db.query(`
      SELECT
        COUNT(*) AS order_cnt,
        SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) AS pay_order_cnt,
        COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv,
        SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) AS refund_cnt,
        COALESCE(SUM(CASE WHEN refund_status > 0 THEN pay_amount ELSE 0 END), 0) AS refund_amount
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) = CURDATE()
    `, [shop_id]);

    // 昨日数据
    const [[yestRow]] = await db.query(`
      SELECT
        COUNT(*) AS order_cnt,
        SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) AS pay_order_cnt,
        COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv,
        SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) AS refund_cnt,
        COALESCE(SUM(CASE WHEN refund_status > 0 THEN pay_amount ELSE 0 END), 0) AS refund_amount
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    `, [shop_id]);

    const t = todayRow || {};
    const y = yestRow || {};
    const tGmv = parseFloat(t.gmv || 0);
    const yGmv = parseFloat(y.gmv || 0);
    const tOrders = parseInt(t.pay_order_cnt || 0);
    const yOrders = parseInt(y.pay_order_cnt || 0);
    const tRefunds = parseInt(t.refund_cnt || 0);
    const yRefunds = parseInt(y.refund_cnt || 0);
    const tAvg = tOrders > 0 ? Math.round(tGmv / tOrders * 100) / 100 : 0;
    const yAvg = yOrders > 0 ? Math.round(yGmv / yOrders * 100) / 100 : 0;

    // 本月进度
    const [[monthRow]] = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
    `, [shop_id]);

    // 月目标配置
    let monthlyTarget = 500000;
    try {
      const [[cfgRow]] = await db.query(
        "SELECT config_value FROM ks_config WHERE shop_id = ? AND config_key = 'monthly_target'", [shop_id]
      );
      if (cfgRow) monthlyTarget = parseFloat(cfgRow.config_value) || 500000;
    } catch (e) { /* ks_config表可能还不存在 */ }

    const monthGmv = parseFloat(monthRow?.gmv || 0);
    const daysRemaining = (() => {
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return Math.max(0, last.getDate() - now.getDate());
    })();
    const gap = Math.max(0, monthlyTarget - monthGmv);
    const dailyNeeded = daysRemaining > 0 ? Math.round(gap / daysRemaining) : gap;

    // ===== 待办事项 =====
    const todos = [];

    // 待发货 (有付款时间但无发货时间)
    const [[shipRow]] = await db.query(`
      SELECT COUNT(*) AS cnt,
        SUM(CASE WHEN TIMESTAMPDIFF(HOUR, create_time, NOW()) > 42 THEN 1 ELSE 0 END) AS urgent_cnt
      FROM ks_orders WHERE shop_id = ? AND pay_time IS NOT NULL AND shipping_time IS NULL AND refund_status = 0
    `, [shop_id]);
    if (shipRow && shipRow.cnt > 0) {
      todos.push({
        type: 'pending_ship', level: shipRow.urgent_cnt > 0 ? 'red' : 'orange',
        desc: `${shipRow.cnt}单待发货`, sub: shipRow.urgent_cnt > 0 ? `${shipRow.urgent_cnt}单即将超时` : '',
        count: parseInt(shipRow.cnt)
      });
    }

    // 待处理退款
    const [[refundRow]] = await db.query(`
      SELECT COUNT(*) AS cnt FROM ks_orders
      WHERE shop_id = ? AND refund_status > 0 AND finish_time IS NULL
    `, [shop_id]);
    if (refundRow && refundRow.cnt > 0) {
      todos.push({
        type: 'pending_refund', level: 'orange',
        desc: `${refundRow.cnt}单退款待处理`, sub: '', count: parseInt(refundRow.cnt)
      });
    }

    // 库存预警 (库存 / 日均销量 < 3天)
    const [lowStockRows] = await db.query(`
      SELECT i.item_id, i.item_title, i.stock,
        COALESCE(s.cnt, 0) AS last7d_sales,
        CASE WHEN COALESCE(s.cnt, 0) > 0 THEN ROUND(i.stock / (s.cnt / 7), 1) ELSE 999 END AS stock_days
      FROM ks_items i
      LEFT JOIN (
        SELECT item_id, COUNT(*) AS cnt FROM ks_orders
        WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND pay_time IS NOT NULL
        GROUP BY item_id
      ) s ON i.item_id = s.item_id
      WHERE i.shop_id = ? AND i.item_status = 1
      HAVING stock_days < 3 AND last7d_sales > 0
      ORDER BY stock_days ASC
    `, [shop_id, shop_id]);
    if (lowStockRows.length > 0) {
      todos.push({
        type: 'low_stock', level: 'red',
        desc: `${lowStockRows.length}个商品库存不足3天`,
        sub: lowStockRows[0] ? `${lowStockRows[0].item_title} 仅剩${lowStockRows[0].stock}件` : '',
        count: lowStockRows.length, items: lowStockRows.slice(0, 5)
      });
    }

    // 退款率异常商品
    const [[avgRefRow]] = await db.query(`
      SELECT CASE WHEN COUNT(*) > 0 THEN COUNT(CASE WHEN refund_status > 0 THEN 1 END) / COUNT(*) * 100 ELSE 0 END AS avg_rate
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND pay_time IS NOT NULL
    `, [shop_id]);
    const shopAvgRate = parseFloat(avgRefRow?.avg_rate || 0);

    const [highRefundRows] = await db.query(`
      SELECT item_id, item_title, COUNT(*) AS total,
        COUNT(CASE WHEN refund_status > 0 THEN 1 END) AS refund_cnt,
        ROUND(COUNT(CASE WHEN refund_status > 0 THEN 1 END) / COUNT(*) * 100, 1) AS refund_rate
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND pay_time IS NOT NULL
      GROUP BY item_id, item_title HAVING total >= 5 AND refund_rate > ?
      ORDER BY refund_rate DESC
    `, [shop_id, shopAvgRate * 1.5]);
    if (highRefundRows.length > 0) {
      todos.push({
        type: 'high_refund', level: 'orange',
        desc: `${highRefundRows.length}个商品退款率异常`,
        sub: highRefundRows[0] ? `${highRefundRows[0].item_title} 退款率${highRefundRows[0].refund_rate}%` : '',
        count: highRefundRows.length, items: highRefundRows.slice(0, 5)
      });
    }

    res.json({
      code: 0,
      data: {
        today: { gmv: tGmv, orders: tOrders, refunds: tRefunds, avg_order_amount: tAvg },
        yesterday: { gmv: yGmv, orders: yOrders, refunds: yRefunds, avg_order_amount: yAvg },
        changes: {
          gmv: pctChange(tGmv, yGmv), orders: pctChange(tOrders, yOrders),
          refunds: pctChange(tRefunds, yRefunds), avg_order_amount: pctChange(tAvg, yAvg)
        },
        monthProgress: {
          target: monthlyTarget, current: monthGmv,
          completion_pct: monthlyTarget > 0 ? Math.round(monthGmv / monthlyTarget * 1000) / 10 : 0,
          days_remaining: daysRemaining, daily_needed: dailyNeeded
        },
        todos,
        shop_avg_refund_rate: shopAvgRate
      }
    });
  } catch (e) {
    logger.error('[KS-Workbench] workbench异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 2. GET /product-diagnosis ==========
router.get('/product-diagnosis', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    // 店铺平均退款率
    const [[avgRow]] = await db.query(`
      SELECT CASE WHEN COUNT(*) > 0 THEN COUNT(CASE WHEN refund_status > 0 THEN 1 END) / COUNT(*) * 100 ELSE 0 END AS avg_rate
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND pay_time IS NOT NULL
    `, [shop_id]);
    const shopAvgRate = parseFloat(avgRow?.avg_rate || 0);

    // 商品 + 近7天/前7天销量 + 退款数
    const [products] = await db.query(`
      SELECT i.item_id, i.item_title, i.item_pic, i.item_price, i.stock, i.item_status,
        COALESCE(c7.cnt, 0) AS last7d_sales,
        COALESCE(p7.cnt, 0) AS prev7d_sales,
        COALESCE(c7.refund_cnt, 0) AS last7d_refund_cnt,
        COALESCE(c7.revenue, 0) AS last7d_revenue
      FROM ks_items i
      LEFT JOIN (
        SELECT item_id, COUNT(*) AS cnt, SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) AS refund_cnt,
          COALESCE(SUM(pay_amount), 0) AS revenue
        FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND pay_time IS NOT NULL
        GROUP BY item_id
      ) c7 ON i.item_id = c7.item_id
      LEFT JOIN (
        SELECT item_id, COUNT(*) AS cnt
        FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND DATE(create_time) < DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND pay_time IS NOT NULL
        GROUP BY item_id
      ) p7 ON i.item_id = p7.item_id
      WHERE i.shop_id = ?
      ORDER BY COALESCE(c7.cnt, 0) DESC
    `, [shop_id, shop_id, shop_id]);

    const statusMap = { urgent_stock: 0, refund_alert: 1, rising: 2, normal: 3, slow: 4 };
    const result = products.map(p => {
      const avg = p.last7d_sales / 7;
      const stockDays = avg > 0 ? Math.round(p.stock / avg * 10) / 10 : 999;
      const trendPct = pctChange(p.last7d_sales, p.prev7d_sales);
      const refundRate = p.last7d_sales > 0 ? Math.round(p.last7d_refund_cnt / p.last7d_sales * 1000) / 10 : 0;

      let status = 'normal', action = '正常运营';
      if (avg > 0 && stockDays < 3) {
        status = 'urgent_stock'; action = '立即补货';
      } else if (refundRate > shopAvgRate * 1.5 && p.last7d_sales >= 5) {
        status = 'refund_alert'; action = '查看退款详情';
      } else if (trendPct > 20 && p.last7d_sales >= 3) {
        status = 'rising'; action = '可加大推广';
      } else if (trendPct < -30 && p.prev7d_sales >= 3) {
        status = 'slow'; action = '建议促销';
      }

      return {
        item_id: p.item_id, item_title: p.item_title, item_pic: p.item_pic,
        item_price: parseFloat(p.item_price), stock: p.stock,
        last7d_sales: p.last7d_sales, prev7d_sales: p.prev7d_sales,
        trend_pct: trendPct, refund_rate: refundRate,
        avg_daily_sales: Math.round(avg * 10) / 10,
        stock_days: stockDays, status, action,
        _p: statusMap[status] || 3
      };
    });

    result.sort((a, b) => a._p - b._p || b.last7d_sales - a.last7d_sales);
    result.forEach(r => delete r._p);

    res.json({
      code: 0,
      data: {
        products, shop_avg_refund_rate: shopAvgRate,
        summary: {
          urgent_stock: result.filter(r => r.status === 'urgent_stock').length,
          refund_alert: result.filter(r => r.status === 'refund_alert').length,
          rising: result.filter(r => r.status === 'rising').length,
          slow: result.filter(r => r.status === 'slow').length,
          normal: result.filter(r => r.status === 'normal').length,
        }
      }
    });
  } catch (e) {
    logger.error('[KS-Workbench] product-diagnosis异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 3. GET /order-center ==========
router.get('/order-center', async (req, res) => {
  try {
    const { shop_id, tab = 'pending_ship', page = 1, page_size = 20 } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const limit = Math.min(parseInt(page_size) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    // 各状态计数
    const [[counts]] = await db.query(`
      SELECT
        SUM(CASE WHEN pay_time IS NOT NULL AND shipping_time IS NULL AND refund_status = 0 THEN 1 ELSE 0 END) AS pending_ship,
        SUM(CASE WHEN refund_status > 0 AND finish_time IS NULL THEN 1 ELSE 0 END) AS pending_refund,
        SUM(CASE WHEN shipping_time IS NOT NULL AND finish_time IS NULL AND DATEDIFF(NOW(), shipping_time) > 7 THEN 1 ELSE 0 END) AS abnormal,
        COUNT(*) AS total
      FROM ks_orders WHERE shop_id = ?
    `, [shop_id]);

    let where = 'WHERE shop_id = ?';
    const params = [shop_id];

    if (tab === 'pending_ship') {
      where += ' AND pay_time IS NOT NULL AND shipping_time IS NULL AND refund_status = 0';
    } else if (tab === 'pending_refund') {
      where += ' AND refund_status > 0 AND finish_time IS NULL';
    } else if (tab === 'abnormal') {
      where += ' AND shipping_time IS NOT NULL AND finish_time IS NULL AND DATEDIFF(NOW(), shipping_time) > 7';
    }

    const [[{ cnt }]] = await db.query(`SELECT COUNT(*) AS cnt FROM ks_orders ${where}`, params);
    const [rows] = await db.query(
      `SELECT oid, buyer_nick, item_title, num, pay_amount, order_status, order_status_desc,
        refund_status, create_time, pay_time, shipping_time, finish_time,
        TIMESTAMPDIFF(HOUR, create_time, NOW()) AS hours_since_create
      FROM ks_orders ${where} ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      code: 0,
      data: {
        counts: {
          pending_ship: parseInt(counts?.pending_ship || 0),
          pending_refund: parseInt(counts?.pending_refund || 0),
          abnormal: parseInt(counts?.abnormal || 0),
          total: parseInt(counts?.total || 0)
        },
        list: rows, total: parseInt(cnt), page: parseInt(page), page_size: limit
      }
    });
  } catch (e) {
    logger.error('[KS-Workbench] order-center异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 4. GET /weekly-report ==========
router.get('/weekly-report', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    // 本周一 ~ 本周日
    const getWeekRange = (offset = 0) => {
      const now = new Date();
      const day = now.getDay() || 7;
      const mon = new Date(now);
      mon.setDate(now.getDate() - day + 1 + offset * 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
    };

    const [thisStart, thisEnd] = getWeekRange(0);
    const [lastStart, lastEnd] = getWeekRange(-1);

    const weekStats = async (start, end) => {
      const [[row]] = await db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) AS gmv,
          SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) AS orders,
          SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) AS refunds
        FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= ? AND DATE(create_time) <= ?
      `, [shop_id, start, end]);
      const r = row || {};
      const gmv = parseFloat(r.gmv || 0);
      const orders = parseInt(r.orders || 0);
      const refunds = parseInt(r.refunds || 0);
      const avg = orders > 0 ? Math.round(gmv / orders * 100) / 100 : 0;
      const refundRate = orders > 0 ? Math.round(refunds / orders * 1000) / 10 : 0;
      return { gmv, orders, refunds, avg_order_amount: avg, refund_rate: refundRate };
    };

    const tw = await weekStats(thisStart, thisEnd);
    const lw = await weekStats(lastStart, lastEnd);

    // TOP5商品
    const [topProducts] = await db.query(`
      SELECT item_id, item_title, COUNT(*) AS sales,
        COALESCE(SUM(pay_amount), 0) AS revenue
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= ? AND DATE(create_time) <= ? AND pay_time IS NOT NULL
      GROUP BY item_id, item_title ORDER BY sales DESC LIMIT 5
    `, [shop_id, thisStart, thisEnd]);

    // 问题商品 (退款率>8%)
    const [problemProducts] = await db.query(`
      SELECT item_id, item_title, COUNT(*) AS total,
        SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) AS refund_cnt,
        ROUND(SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS refund_rate
      FROM ks_orders WHERE shop_id = ? AND DATE(create_time) >= ? AND DATE(create_time) <= ? AND pay_time IS NOT NULL
      GROUP BY item_id, item_title HAVING total >= 3 AND refund_rate > 8
      ORDER BY refund_rate DESC
    `, [shop_id, thisStart, thisEnd]);

    // 库存预警
    const [stockAlerts] = await db.query(`
      SELECT i.item_id, i.item_title, i.stock,
        COALESCE(s.cnt, 0) AS last7d_sales,
        CASE WHEN COALESCE(s.cnt, 0) > 0 THEN ROUND(i.stock / (s.cnt / 7), 1) ELSE 999 END AS stock_days
      FROM ks_items i LEFT JOIN (
        SELECT item_id, COUNT(*) AS cnt FROM ks_orders
        WHERE shop_id = ? AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND pay_time IS NOT NULL
        GROUP BY item_id
      ) s ON i.item_id = s.item_id
      WHERE i.shop_id = ? AND i.item_status = 1
      HAVING stock_days < 5 AND last7d_sales > 0 ORDER BY stock_days ASC
    `, [shop_id, shop_id]);

    // 自动生成建议
    const summary = [];
    const gmvChange = pctChange(tw.gmv, lw.gmv);
    if (gmvChange > 0) summary.push(`本周GMV较上周增长${gmvChange}%，保持良好势头`);
    else if (gmvChange < 0) summary.push(`本周GMV较上周下降${Math.abs(gmvChange)}%，建议加大推广力度`);
    if (tw.refund_rate > 5) summary.push(`本周退款率${tw.refund_rate}%，偏高，请重点关注退款原因`);
    if (problemProducts.length > 0) summary.push(`${problemProducts.length}款商品退款率超8%，建议排查商品质量`);
    if (stockAlerts.length > 0) summary.push(`${stockAlerts.length}款商品库存不足5天，请尽快安排补货`);
    if (topProducts.length > 0) summary.push(`本周销量冠军：${topProducts[0].item_title}，共${topProducts[0].sales}单`);
    if (!summary.length) summary.push('本周运营正常，继续保持');

    res.json({
      code: 0,
      data: {
        period: { start: thisStart, end: thisEnd },
        thisWeek: tw, lastWeek: lw,
        changes: {
          gmv: gmvChange, orders: pctChange(tw.orders, lw.orders),
          refunds: pctChange(tw.refunds, lw.refunds),
          avg_order_amount: pctChange(tw.avg_order_amount, lw.avg_order_amount),
          refund_rate: pctChange(tw.refund_rate, lw.refund_rate)
        },
        topProducts, problemProducts, stockAlerts, summary
      }
    });
  } catch (e) {
    logger.error('[KS-Workbench] weekly-report异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 5. POST /monthly-target ==========
router.post('/monthly-target', async (req, res) => {
  try {
    const { shop_id, target } = req.body;
    if (!shop_id || !target) return res.json({ code: -1, msg: '参数不完整' });

    // 确保ks_config表存在
    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_config (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(30) NOT NULL,
        config_key VARCHAR(50) NOT NULL,
        config_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_shop_key (shop_id, config_key)
      )
    `);

    await db.query(`
      INSERT INTO ks_config (shop_id, config_key, config_value) VALUES (?, 'monthly_target', ?)
      ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
    `, [shop_id, String(target)]);

    res.json({ code: 0, msg: '月度目标已保存' });
  } catch (e) {
    logger.error('[KS-Workbench] monthly-target异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
