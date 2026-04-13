/**
 * 快手直播电商联动分析 API
 */
const db = require('../db');
const router = require('express').Router();

// ── helpers ──────────────────────────────────────────────────────────
function ok(res, data) { res.json({ code: 0, data }); }
function fail(res, msg) { res.json({ code: -1, msg }); }

// ── auto-create tables ──────────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ks_live_sessions (
      id          BIGINT AUTO_INCREMENT PRIMARY KEY,
      shop_id     VARCHAR(30) NOT NULL,
      room_id     VARCHAR(50) DEFAULT '',
      anchor_name VARCHAR(100) DEFAULT '',
      title       VARCHAR(500) DEFAULT '',
      start_time  DATETIME NOT NULL,
      end_time    DATETIME DEFAULT NULL,
      duration_min INT DEFAULT 0,
      total_viewers INT DEFAULT 0,
      peak_viewers  INT DEFAULT 0,
      new_followers INT DEFAULT 0,
      gmv         DECIMAL(14,2) DEFAULT 0,
      order_count INT DEFAULT 0,
      avg_stay_sec INT DEFAULT 0,
      status      VARCHAR(20) DEFAULT 'ended',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shop (shop_id),
      INDEX idx_time (start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS ks_live_products (
      id          BIGINT AUTO_INCREMENT PRIMARY KEY,
      session_id  BIGINT NOT NULL,
      shop_id     VARCHAR(30) NOT NULL,
      item_id     VARCHAR(50) NOT NULL,
      item_title  VARCHAR(500) DEFAULT '',
      item_pic    VARCHAR(500) DEFAULT '',
      explain_start DATETIME DEFAULT NULL,
      explain_end   DATETIME DEFAULT NULL,
      explain_duration_sec INT DEFAULT 0,
      order_count INT DEFAULT 0,
      gmv         DECIMAL(14,2) DEFAULT 0,
      click_count INT DEFAULT 0,
      conversion_rate DECIMAL(6,2) DEFAULT 0,
      sort_order  INT DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_session (session_id),
      INDEX idx_shop (shop_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
let tablesReady = false;

router.use(async (req, res, next) => {
  if (!tablesReady) { try { await ensureTables(); tablesReady = true; } catch (e) { console.error('ks_live tables init:', e.message); } }
  next();
});

// ══════════════════════════════════════════════════════════════════════
// GET /sessions  — 直播场次列表 + 关联订单统计
// ══════════════════════════════════════════════════════════════════════
router.get('/sessions', async (req, res) => {
  try {
    const { shop_id, page = 1, pageSize = 20 } = req.query;
    if (!shop_id) return fail(res, 'shop_id required');

    const offset = (Math.max(1, +page) - 1) * +pageSize;
    const [rows] = await db.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM ks_orders o
         WHERE o.shop_id = s.shop_id
           AND o.create_time >= s.start_time
           AND o.create_time <= IFNULL(s.end_time, NOW())
        ) AS linked_orders,
        (SELECT IFNULL(SUM(o.pay_amount),0) FROM ks_orders o
         WHERE o.shop_id = s.shop_id
           AND o.create_time >= s.start_time
           AND o.create_time <= IFNULL(s.end_time, NOW())
        ) AS linked_gmv
      FROM ks_live_sessions s
      WHERE s.shop_id = ?
      ORDER BY s.start_time DESC
      LIMIT ? OFFSET ?
    `, [shop_id, +pageSize, offset]);

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM ks_live_sessions WHERE shop_id = ?', [shop_id]
    );

    ok(res, { list: rows, total, page: +page, pageSize: +pageSize });
  } catch (e) { console.error('ks-live sessions:', e); fail(res, e.message); }
});

// ══════════════════════════════════════════════════════════════════════
// GET /session/:id  — 单场详情 + 时段分布
// ══════════════════════════════════════════════════════════════════════
router.get('/session/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ks_live_sessions WHERE id = ?', [req.params.id]);
    if (!rows.length) return fail(res, '场次不存在');
    const session = rows[0];

    // 时段订单分布 (按30分钟)
    const [slots] = await db.query(`
      SELECT
        DATE_FORMAT(o.create_time, '%H:%i') AS slot,
        COUNT(*) AS orders,
        IFNULL(SUM(o.pay_amount), 0) AS gmv
      FROM ks_orders o
      WHERE o.shop_id = ? AND o.create_time >= ? AND o.create_time <= IFNULL(?, NOW())
      GROUP BY FLOOR(TIMESTAMPDIFF(MINUTE, ?, o.create_time) / 30)
      ORDER BY o.create_time
    `, [session.shop_id, session.start_time, session.end_time, session.start_time]);

    // 商品讲解数据
    const [products] = await db.query(`
      SELECT * FROM ks_live_products WHERE session_id = ? ORDER BY sort_order
    `, [session.id]);

    ok(res, { session, timeSlots: slots, products });
  } catch (e) { console.error('ks-live session detail:', e); fail(res, e.message); }
});

// ══════════════════════════════════════════════════════════════════════
// GET /heatmap  — 时段热力图(跨场次聚合)
// ══════════════════════════════════════════════════════════════════════
router.get('/heatmap', async (req, res) => {
  try {
    const { shop_id, days = 30 } = req.query;
    if (!shop_id) return fail(res, 'shop_id required');

    const [rows] = await db.query(`
      SELECT
        DAYOFWEEK(o.create_time) AS dow,
        HOUR(o.create_time) AS hour,
        COUNT(*) AS orders,
        IFNULL(SUM(o.pay_amount), 0) AS gmv
      FROM ks_orders o
      INNER JOIN ks_live_sessions s
        ON o.shop_id = s.shop_id
        AND o.create_time >= s.start_time
        AND o.create_time <= IFNULL(s.end_time, NOW())
      WHERE o.shop_id = ? AND o.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DAYOFWEEK(o.create_time), HOUR(o.create_time)
      ORDER BY dow, hour
    `, [shop_id, +days]);

    ok(res, { heatmap: rows, days: +days });
  } catch (e) { console.error('ks-live heatmap:', e); fail(res, e.message); }
});

// ══════════════════════════════════════════════════════════════════════
// GET /anchor-performance  — 主播绩效看板
// ══════════════════════════════════════════════════════════════════════
router.get('/anchor-performance', async (req, res) => {
  try {
    const { shop_id, days = 30 } = req.query;
    if (!shop_id) return fail(res, 'shop_id required');

    const [rows] = await db.query(`
      SELECT
        s.anchor_name,
        COUNT(*) AS sessions,
        SUM(s.duration_min) AS total_minutes,
        SUM(s.gmv) AS total_gmv,
        SUM(s.order_count) AS total_orders,
        ROUND(AVG(s.total_viewers)) AS avg_viewers,
        ROUND(AVG(s.peak_viewers)) AS avg_peak_viewers,
        SUM(s.new_followers) AS total_new_followers,
        ROUND(SUM(s.gmv) / NULLIF(SUM(s.duration_min), 0), 2) AS gmv_per_min,
        ROUND(SUM(s.order_count) / NULLIF(COUNT(*), 0), 1) AS orders_per_session
      FROM ks_live_sessions s
      WHERE s.shop_id = ? AND s.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY s.anchor_name
      ORDER BY total_gmv DESC
    `, [shop_id, +days]);

    ok(res, { anchors: rows, days: +days });
  } catch (e) { console.error('ks-live anchor:', e); fail(res, e.message); }
});

// ══════════════════════════════════════════════════════════════════════
// GET /channel-comparison  — 直播 vs 短视频 渠道对比
// ══════════════════════════════════════════════════════════════════════
router.get('/channel-comparison', async (req, res) => {
  try {
    const { shop_id, days = 30 } = req.query;
    if (!shop_id) return fail(res, 'shop_id required');

    // 直播期间订单
    const [[liveData]] = await db.query(`
      SELECT
        COUNT(*) AS orders,
        IFNULL(SUM(o.pay_amount), 0) AS gmv,
        ROUND(AVG(o.pay_amount), 2) AS avg_amount
      FROM ks_orders o
      INNER JOIN ks_live_sessions s
        ON o.shop_id = s.shop_id
        AND o.create_time >= s.start_time
        AND o.create_time <= IFNULL(s.end_time, NOW())
      WHERE o.shop_id = ? AND o.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [shop_id, +days]);

    // 全部订单
    const [[allData]] = await db.query(`
      SELECT
        COUNT(*) AS orders,
        IFNULL(SUM(pay_amount), 0) AS gmv,
        ROUND(AVG(pay_amount), 2) AS avg_amount
      FROM ks_orders
      WHERE shop_id = ? AND create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [shop_id, +days]);

    const videoOrders = (allData.orders || 0) - (liveData.orders || 0);
    const videoGmv = (allData.gmv || 0) - (liveData.gmv || 0);

    ok(res, {
      live: {
        orders: liveData.orders || 0,
        gmv: liveData.gmv || 0,
        avg_amount: liveData.avg_amount || 0,
        pct: allData.gmv > 0 ? Math.round((liveData.gmv / allData.gmv) * 100) : 0
      },
      video: {
        orders: videoOrders,
        gmv: videoGmv,
        avg_amount: videoOrders > 0 ? Math.round((videoGmv / videoOrders) * 100) / 100 : 0,
        pct: allData.gmv > 0 ? Math.round((videoGmv / allData.gmv) * 100) : 0
      },
      total: allData,
      days: +days
    });
  } catch (e) { console.error('ks-live channel:', e); fail(res, e.message); }
});

// ══════════════════════════════════════════════════════════════════════
// GET /product-rhythm  — 商品上架节奏分析
// ══════════════════════════════════════════════════════════════════════
router.get('/product-rhythm', async (req, res) => {
  try {
    const { shop_id, session_id } = req.query;
    if (!shop_id) return fail(res, 'shop_id required');

    let where = 'lp.shop_id = ?';
    const params = [shop_id];

    if (session_id) {
      where += ' AND lp.session_id = ?';
      params.push(+session_id);
    }

    const [rows] = await db.query(`
      SELECT
        lp.*,
        s.anchor_name,
        s.start_time AS session_start,
        TIMESTAMPDIFF(MINUTE, s.start_time, lp.explain_start) AS offset_min
      FROM ks_live_products lp
      INNER JOIN ks_live_sessions s ON lp.session_id = s.id
      WHERE ${where}
      ORDER BY lp.session_id DESC, lp.sort_order
    `, params);

    const itemMap = {};
    rows.forEach(r => {
      if (!itemMap[r.item_id]) {
        itemMap[r.item_id] = { item_id: r.item_id, item_title: r.item_title, item_pic: r.item_pic, sessions: 0, total_gmv: 0, total_orders: 0, best_offset_min: 0, best_gmv: 0, entries: [] };
      }
      const m = itemMap[r.item_id];
      m.sessions++;
      m.total_gmv += +r.gmv;
      m.total_orders += r.order_count;
      m.entries.push({ session_id: r.session_id, anchor: r.anchor_name, offset_min: r.offset_min, gmv: +r.gmv, orders: r.order_count, conversion_rate: +r.conversion_rate, duration_sec: r.explain_duration_sec });
      if (+r.gmv > m.best_gmv) { m.best_gmv = +r.gmv; m.best_offset_min = r.offset_min; }
    });

    const products = Object.values(itemMap).sort((a, b) => b.total_gmv - a.total_gmv);

    ok(res, { products, total: products.length });
  } catch (e) { console.error('ks-live rhythm:', e); fail(res, e.message); }
});

// ══════════════════════════════════════════════════════════════════════
// GET /summary  — 综合概览数据
// ══════════════════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const { shop_id, days = 30 } = req.query;
    if (!shop_id) return fail(res, 'shop_id required');

    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS total_sessions,
        SUM(duration_min) AS total_minutes,
        IFNULL(SUM(gmv), 0) AS total_gmv,
        SUM(order_count) AS total_orders,
        ROUND(AVG(gmv), 2) AS avg_gmv_per_session,
        ROUND(AVG(total_viewers)) AS avg_viewers,
        ROUND(AVG(peak_viewers)) AS avg_peak_viewers,
        SUM(new_followers) AS total_new_followers,
        COUNT(DISTINCT anchor_name) AS anchor_count
      FROM ks_live_sessions
      WHERE shop_id = ? AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [shop_id, +days]);

    const [[prevStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_sessions,
        IFNULL(SUM(gmv), 0) AS total_gmv,
        SUM(order_count) AS total_orders,
        ROUND(AVG(total_viewers)) AS avg_viewers
      FROM ks_live_sessions
      WHERE shop_id = ? AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY) AND start_time < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [shop_id, +days * 2, +days]);

    const changes = {};
    ['total_gmv', 'total_orders', 'total_sessions', 'avg_viewers'].forEach(k => {
      const cur = +(stats[k] || 0), prev = +(prevStats[k] || 0);
      changes[k] = prev > 0 ? Math.round((cur - prev) / prev * 100) : 0;
    });

    const [trend] = await db.query(`
      SELECT DATE(start_time) AS dt, anchor_name, gmv, order_count, total_viewers, duration_min
      FROM ks_live_sessions
      WHERE shop_id = ? AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY start_time DESC LIMIT 10
    `, [shop_id, +days]);

    ok(res, { stats, prevStats, changes, trend, days: +days });
  } catch (e) { console.error('ks-live summary:', e); fail(res, e.message); }
});

module.exports = router;
