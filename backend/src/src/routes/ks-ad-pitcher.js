/**
 * 快手磁力 AI金牌投手 路由
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');

// 自动建表
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_pitcher_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(50) NOT NULL,
        enabled TINYINT DEFAULT 0,
        min_roi DECIMAL(6,2) DEFAULT 1.5,
        stop_roi DECIMAL(6,2) DEFAULT 0.8,
        min_cost DECIMAL(10,2) DEFAULT 100,
        min_cvr DECIMAL(6,2) DEFAULT 1.0,
        poll_interval INT DEFAULT 10,
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
      CREATE TABLE IF NOT EXISTS ks_pitcher_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(50),
        ad_id VARCHAR(50) DEFAULT '',
        ad_name VARCHAR(200) DEFAULT '',
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
    logger.info('[KsPitcher] 表结构就绪');
  } catch (e) { /* exists */ }
})();

// GET /config/:advertiser_id
router.get('/config/:advertiser_id', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM ks_pitcher_configs WHERE advertiser_id=?', [req.params.advertiser_id]);
    res.json({ code: 0, data: row || null });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// POST /config/:advertiser_id
router.post('/config/:advertiser_id', auth(), async (req, res) => {
  const aid = req.params.advertiser_id;
  const { min_roi, stop_roi, min_cost, min_cvr, poll_interval, budget_multiply, bid_up_pct, bid_down_pct, max_budget_multiply, no_convert_minutes, auto_start } = req.body;
  try {
    const shouldEnable = auto_start !== false ? 1 : 0;
    await db.query(`INSERT INTO ks_pitcher_configs (advertiser_id, enabled, min_roi, stop_roi, min_cost, min_cvr, poll_interval, budget_multiply, bid_up_pct, bid_down_pct, max_budget_multiply, no_convert_minutes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), min_roi=VALUES(min_roi), stop_roi=VALUES(stop_roi), min_cost=VALUES(min_cost), min_cvr=VALUES(min_cvr),
        poll_interval=VALUES(poll_interval), budget_multiply=VALUES(budget_multiply), bid_up_pct=VALUES(bid_up_pct), bid_down_pct=VALUES(bid_down_pct),
        max_budget_multiply=VALUES(max_budget_multiply), no_convert_minutes=VALUES(no_convert_minutes)`,
      [aid, shouldEnable, min_roi||1.5, stop_roi||0.8, min_cost||100, min_cvr||1.0, poll_interval||10, budget_multiply||1.5, bid_up_pct||5, bid_down_pct||5, max_budget_multiply||3, no_convert_minutes||30]
    );
    if (shouldEnable) {
      await db.query('INSERT INTO ks_pitcher_logs (advertiser_id, action, action_detail) VALUES (?,?,?)', [aid, 'hold', '配置已保存，AI投手自动启动']).catch(() => {});
    }
    res.json({ code: 0, msg: shouldEnable ? '配置已保存并启动' : '配置已保存', enabled: shouldEnable });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// POST /start/:advertiser_id
router.post('/start/:advertiser_id', auth(), async (req, res) => {
  try {
    const [result] = await db.query('UPDATE ks_pitcher_configs SET enabled=1 WHERE advertiser_id=?', [req.params.advertiser_id]);
    if (result.affectedRows === 0) return res.json({ code: 400, msg: '请先保存配置' });
    await db.query('INSERT INTO ks_pitcher_logs (advertiser_id, action, action_detail) VALUES (?,?,?)', [req.params.advertiser_id, 'hold', 'AI金牌投手已启动']);
    res.json({ code: 0, msg: 'AI投手已启动' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// POST /stop/:advertiser_id
router.post('/stop/:advertiser_id', auth(), async (req, res) => {
  try {
    await db.query('UPDATE ks_pitcher_configs SET enabled=0 WHERE advertiser_id=?', [req.params.advertiser_id]);
    await db.query('INSERT INTO ks_pitcher_logs (advertiser_id, action, action_detail) VALUES (?,?,?)', [req.params.advertiser_id, 'hold', 'AI金牌投手已停止']);
    res.json({ code: 0, msg: 'AI投手已停止' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// GET /status
router.get('/status', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.advertiser_id, a.advertiser_name, c.enabled, c.min_roi, c.stop_roi, c.poll_interval, c.updated_at,
        (SELECT COUNT(*) FROM ks_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='scale_up' AND l.created_at>=CURDATE()) AS today_scale_up,
        (SELECT COUNT(*) FROM ks_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='scale_down' AND l.created_at>=CURDATE()) AS today_scale_down,
        (SELECT COUNT(*) FROM ks_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id AND l.action='hold' AND l.created_at>=CURDATE()) AS today_hold,
        (SELECT created_at FROM ks_pitcher_logs l WHERE l.advertiser_id=c.advertiser_id ORDER BY l.id DESC LIMIT 1) AS last_run
      FROM ks_pitcher_configs c
      LEFT JOIN ks_ad_accounts a ON c.advertiser_id=a.advertiser_id
    `);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// GET /logs/:advertiser_id
router.get('/logs/:advertiser_id', auth(), async (req, res) => {
  const { page = 1, page_size = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(page_size);
  try {
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM ks_pitcher_logs WHERE advertiser_id=?', [req.params.advertiser_id]);
    const [rows] = await db.query('SELECT * FROM ks_pitcher_logs WHERE advertiser_id=? ORDER BY id DESC LIMIT ? OFFSET ?', [req.params.advertiser_id, parseInt(page_size), offset]);
    res.json({ code: 0, data: { list: rows, total } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// POST /run-once/:advertiser_id — 手动执行一次
router.post('/run-once/:advertiser_id', auth(), async (req, res) => {
  try {
    const ksPitcherEngine = require('../services/ks-pitcher-engine');
    const result = await ksPitcherEngine.runOnce(req.params.advertiser_id);
    res.json({ code: 0, data: result, msg: result.skipped ? result.reason : '执行完成' });
  } catch (e) {
    logger.error('[KsPitcher] run-once error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
