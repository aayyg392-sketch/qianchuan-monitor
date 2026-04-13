const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const dayjs = require('dayjs');

// ========== 自动建表 ==========
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_pitcher_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(30) NOT NULL,
        enabled TINYINT DEFAULT 0,
        min_roi DECIMAL(6,2) DEFAULT 1.5,
        stop_roi DECIMAL(6,2) DEFAULT 0.8,
        min_cost DECIMAL(10,2) DEFAULT 100,
        min_cvr DECIMAL(6,2) DEFAULT 1.0,
        poll_interval INT DEFAULT 60,
        budget_multiply DECIMAL(4,2) DEFAULT 1.5,
        bid_up_pct DECIMAL(4,2) DEFAULT 5.0,
        bid_down_pct DECIMAL(4,2) DEFAULT 5.0,
        max_budget_multiply DECIMAL(4,2) DEFAULT 3.0,
        no_convert_minutes INT DEFAULT 30,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_adv (advertiser_id)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_pitcher_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(30),
        ad_id VARCHAR(30),
        ad_name VARCHAR(200),
        material_title VARCHAR(300),
        cost DECIMAL(12,2) DEFAULT 0,
        roi DECIMAL(6,2) DEFAULT 0,
        cvr DECIMAL(6,2) DEFAULT 0,
        gmv DECIMAL(12,2) DEFAULT 0,
        orders INT DEFAULT 0,
        show_cnt INT DEFAULT 0,
        click_cnt INT DEFAULT 0,
        action ENUM('scale_up','hold','scale_down','stop_scale') DEFAULT 'hold',
        action_detail VARCHAR(500),
        old_budget DECIMAL(12,2),
        new_budget DECIMAL(12,2),
        old_bid DECIMAL(10,2),
        new_bid DECIMAL(10,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_adv_time (advertiser_id, created_at),
        INDEX idx_action (action)
      )
    `);

    // ===== 差素材自动清理 配置字段 =====
    // ===== enabled_rules 字段 =====
    try {
      await db.query("ALTER TABLE qc_pitcher_configs ADD COLUMN enabled_rules TEXT DEFAULT 'min_roi,stop_roi,min_cost,no_convert,budget_multiply,max_budget_multiply,bid_up_pct,bid_down_pct'");
    } catch (e) { /* 字段已存在 */ }

    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_auto_clean_enabled TINYINT DEFAULT 0');
    } catch (e) { /* 字段已存在 */ }
    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_clean_min_cost DECIMAL(10,2) DEFAULT 50');
    } catch (e) { /* 字段已存在 */ }
    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_clean_bad_roi DECIMAL(6,2) DEFAULT 0.5');
    } catch (e) { /* 字段已存在 */ }
    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_clean_min_show INT DEFAULT 5000');
    } catch (e) { /* 字段已存在 */ }
    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_clean_days INT DEFAULT 3');
    } catch (e) { /* 字段已存在 */ }
    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_clean_min_orders INT DEFAULT 0');
    } catch (e) { /* 字段已存在 */ }
    try {
      await db.query('ALTER TABLE qc_pitcher_configs ADD COLUMN material_clean_min_ctr DECIMAL(6,2) DEFAULT 0.5');
    } catch (e) { /* 字段已存在 */ }

    // 差素材自动清理日志表
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_material_clean_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(30) NOT NULL,
        ad_id VARCHAR(30) NOT NULL,
        ad_name VARCHAR(200) DEFAULT '',
        material_id VARCHAR(50) NOT NULL,
        video_name VARCHAR(300) DEFAULT '',
        cost DECIMAL(12,2) DEFAULT 0,
        roi DECIMAL(6,2) DEFAULT 0,
        orders INT DEFAULT 0,
        reason VARCHAR(500) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_adv_date (advertiser_id, created_at),
        INDEX idx_material (material_id, created_at)
      )
    `);

    logger.info('[AiPitcher] 表结构就绪');
  } catch (e) { /* exists */ }
})();

// ========== GET /config/:advertiser_id ==========
router.get('/config/:advertiser_id', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM qc_pitcher_configs WHERE advertiser_id=?', [req.params.advertiser_id]);
    res.json({ code: 0, data: row || null });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== POST /config/:advertiser_id — 保存配置并自动启动 ==========
router.post('/config/:advertiser_id', auth(), async (req, res) => {
  const aid = req.params.advertiser_id;
  const {
    min_roi, stop_roi, min_cost, min_cvr, poll_interval, budget_multiply,
    bid_up_pct, bid_down_pct, max_budget_multiply, no_convert_minutes, auto_start, enabled_rules,
    material_auto_clean_enabled, material_clean_min_cost, material_clean_bad_roi, material_clean_min_show,
    material_clean_days, material_clean_min_orders, material_clean_min_ctr
  } = req.body;
  try {
    // 默认保存时自动启用（auto_start !== false 时自动启用）
    const shouldEnable = auto_start !== false ? 1 : 0;
    const rulesStr = enabled_rules || 'min_roi,stop_roi,min_cost,no_convert,budget_multiply,max_budget_multiply,bid_up_pct,bid_down_pct';
    await db.query(`INSERT INTO qc_pitcher_configs (advertiser_id, enabled, min_roi, stop_roi, min_cost, min_cvr, poll_interval, budget_multiply, bid_up_pct, bid_down_pct, max_budget_multiply, no_convert_minutes, enabled_rules, material_auto_clean_enabled, material_clean_min_cost, material_clean_bad_roi, material_clean_min_show, material_clean_days, material_clean_min_orders, material_clean_min_ctr)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), min_roi=VALUES(min_roi), stop_roi=VALUES(stop_roi), min_cost=VALUES(min_cost), min_cvr=VALUES(min_cvr),
        poll_interval=VALUES(poll_interval), budget_multiply=VALUES(budget_multiply), bid_up_pct=VALUES(bid_up_pct), bid_down_pct=VALUES(bid_down_pct),
        max_budget_multiply=VALUES(max_budget_multiply), no_convert_minutes=VALUES(no_convert_minutes), enabled_rules=VALUES(enabled_rules),
        material_auto_clean_enabled=VALUES(material_auto_clean_enabled), material_clean_min_cost=VALUES(material_clean_min_cost),
        material_clean_bad_roi=VALUES(material_clean_bad_roi), material_clean_min_show=VALUES(material_clean_min_show),
        material_clean_days=VALUES(material_clean_days), material_clean_min_orders=VALUES(material_clean_min_orders),
        material_clean_min_ctr=VALUES(material_clean_min_ctr)`,
      [aid, shouldEnable, min_roi||1.5, stop_roi||0.8, min_cost||100, min_cvr||1.0, poll_interval||60, budget_multiply||1.5, bid_up_pct||5, bid_down_pct||5, max_budget_multiply||3, no_convert_minutes||30, rulesStr,
       material_auto_clean_enabled||0, material_clean_min_cost||50, material_clean_bad_roi||0.5, material_clean_min_show||5000,
       material_clean_days||3, material_clean_min_orders||0, material_clean_min_ctr||0.5]
    );
    // 写启动日志
    if (shouldEnable) {
      await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, action, action_detail) VALUES (?,?,?)',
        [aid, 'hold', '配置已保存，AI投手自动启动']).catch(() => {});
    }
    res.json({ code: 0, msg: shouldEnable ? '配置已保存并启动AI投手' : '配置已保存', enabled: shouldEnable });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== POST /start/:advertiser_id ==========
router.post('/start/:advertiser_id', auth(), async (req, res) => {
  try {
    const [result] = await db.query('UPDATE qc_pitcher_configs SET enabled=1 WHERE advertiser_id=?', [req.params.advertiser_id]);
    if (result.affectedRows === 0) {
      return res.json({ code: 400, msg: '请先保存配置' });
    }
    await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, action, action_detail) VALUES (?,?,?)',
      [req.params.advertiser_id, 'hold', 'AI金牌投手已启动']);
    res.json({ code: 0, msg: 'AI投手已启动' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== POST /stop/:advertiser_id ==========
router.post('/stop/:advertiser_id', auth(), async (req, res) => {
  try {
    await db.query('UPDATE qc_pitcher_configs SET enabled=0 WHERE advertiser_id=?', [req.params.advertiser_id]);
    await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, action, action_detail) VALUES (?,?,?)',
      [req.params.advertiser_id, 'hold', 'AI金牌投手已停止']);
    res.json({ code: 0, msg: 'AI投手已停止' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== GET /status ==========
router.get('/status', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.advertiser_id, a.advertiser_name, c.enabled, c.min_roi, c.stop_roi, c.poll_interval, c.updated_at,
        c.material_auto_clean_enabled,
        (SELECT COUNT(DISTINCT l.ad_id) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='scale_up' AND l.created_at>=CURDATE()) AS today_scale_up,
        (SELECT COUNT(DISTINCT l.ad_id) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='scale_down' AND l.created_at>=CURDATE()) AS today_scale_down,
        (SELECT COUNT(DISTINCT l.ad_id) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='hold' AND l.created_at>=CURDATE()) AS today_hold,
        (SELECT COUNT(*) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='scale_up' AND l.created_at>=CURDATE()) AS today_scale_up_times,
        (SELECT COUNT(*) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='scale_down' AND l.created_at>=CURDATE()) AS today_scale_down_times,
        (SELECT COALESCE(SUM(l.cost),0) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.created_at>=CURDATE() AND l.action IN ('scale_up','scale_down','hold') AND l.id IN (SELECT MAX(l2.id) FROM qc_pitcher_logs l2 WHERE l2.advertiser_id=c.advertiser_id AND l2.created_at>=CURDATE() GROUP BY l2.ad_id)) AS today_cost,
        (SELECT COALESCE(SUM(l.gmv),0) FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.created_at>=CURDATE() AND l.action IN ('scale_up','scale_down','hold') AND l.id IN (SELECT MAX(l2.id) FROM qc_pitcher_logs l2 WHERE l2.advertiser_id=c.advertiser_id AND l2.created_at>=CURDATE() GROUP BY l2.ad_id)) AS today_gmv,
        (SELECT created_at FROM qc_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id ORDER BY l.id DESC LIMIT 1) AS last_run,
        (SELECT COUNT(*) FROM qc_material_clean_logs cl WHERE cl.advertiser_id=c.advertiser_id AND cl.created_at>=CURDATE()) AS today_auto_clean_count
      FROM qc_pitcher_configs c
      LEFT JOIN qc_accounts a ON c.advertiser_id=a.advertiser_id
    `);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== GET /logs/:advertiser_id ==========
router.get('/logs/:advertiser_id', auth(), async (req, res) => {
  const { page = 1, page_size = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(page_size);
  try {
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM qc_pitcher_logs WHERE advertiser_id=?', [req.params.advertiser_id]);
    const [rows] = await db.query(
      'SELECT * FROM qc_pitcher_logs WHERE advertiser_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
      [req.params.advertiser_id, parseInt(page_size), offset]
    );
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== POST /run-once/:advertiser_id — 手动执行一次 ==========
router.post('/run-once/:advertiser_id', auth(), async (req, res) => {
  try {
    const pitcherEngine = require('../services/pitcher-engine');
    const result = await pitcherEngine.runOnce(req.params.advertiser_id);
    res.json({ code: 0, data: result, msg: result.skipped ? result.reason : '执行完成' });
  } catch (e) {
    logger.error('[AiPitcher] run-once error', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: e.message });
  }
});

// ========== GET /material-clean-logs/:advertiser_id — 查询素材自动清理日志 ==========
router.get('/material-clean-logs/:advertiser_id', auth(), async (req, res) => {
  const { page = 1, page_size = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(page_size);
  try {
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM qc_material_clean_logs WHERE advertiser_id=?', [req.params.advertiser_id]);
    const [rows] = await db.query(
      'SELECT * FROM qc_material_clean_logs WHERE advertiser_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
      [req.params.advertiser_id, parseInt(page_size), offset]
    );
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ========== POST /material-auto-clean/:advertiser_id — 手动触发一次差素材自动清理 ==========
router.post('/material-auto-clean/:advertiser_id', auth(), async (req, res) => {
  const advertiserId = req.params.advertiser_id;
  try {
    const pitcherEngine = require('../services/pitcher-engine');
    const result = await pitcherEngine.runMaterialAutoClean(advertiserId);
    res.json({ code: 0, data: result, msg: result.skipped ? result.reason : '差素材自动清理执行完成' });
  } catch (e) {
    logger.error('[AiPitcher] material-auto-clean error', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
