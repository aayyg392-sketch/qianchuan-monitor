/**
 * AI引擎 - 仪表盘API
 * 引擎状态、决策记录、指标概览
 */
const router = require('express').Router();
const db = require('../../db');
const logger = require('../../logger');
const auth = require('../../middleware/auth');
const { ADQ_RULES } = require('../config');
const PIDController = require('../pid-controller');
const FatigueDetector = require('../fatigue-detector');
const AnomalyDetector = require('../anomaly-detector');
const ColdStartAccelerator = require('../cold-start');
const BudgetPacer = require('../budget-pacer');

/**
 * GET /api/ai-engine/dashboard/status — 引擎运行状态
 */
router.get('/status', auth(), async (req, res) => {
  try {
    const [status] = await db.query('SELECT * FROM ai_engine_status WHERE id = 1');
    const [todayDecisions] = await db.query(
      "SELECT decision_type, COUNT(*) as cnt FROM ai_decisions WHERE DATE(created_at) = CURDATE() GROUP BY decision_type"
    );
    const [todayAnomalies] = await db.query(
      "SELECT COUNT(*) as cnt FROM ai_decisions WHERE decision_type = 'anomaly_alert' AND DATE(created_at) = CURDATE()"
    );

    res.json({
      code: 0,
      data: {
        engine: status[0] || { is_running: 0 },
        todayDecisions,
        todayAnomalies: todayAnomalies[0]?.cnt || 0,
        platforms: [{ code: ADQ_RULES.platform, name: ADQ_RULES.name }],
      },
    });
  } catch (e) {
    logger.error('获取AI引擎状态失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ai-engine/dashboard/decisions — 决策记录列表
 */
router.get('/decisions', auth(), async (req, res) => {
  try {
    const { platform, type, page = 1, page_size = 20 } = req.query;
    let sql = 'SELECT * FROM ai_decisions WHERE 1=1';
    const params = [];

    if (platform) { sql += ' AND platform = ?'; params.push(platform); }
    if (type) { sql += ' AND decision_type = ?'; params.push(type); }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(+page_size, (+page - 1) * +page_size);

    const [rows] = await db.query(sql, params);
    const [countResult] = await db.query(
      sql.replace(/SELECT \*/, 'SELECT COUNT(*) as total').replace(/ ORDER BY.*/, ''),
      params.slice(0, -2)
    );

    res.json({
      code: 0,
      data: { list: rows, total: countResult[0]?.total || 0, page: +page, page_size: +page_size },
    });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ai-engine/dashboard/overview — 各平台AI投放概览
 */
router.get('/overview', auth(), async (req, res) => {
  try {
    // 各平台今日决策统计
    const [platformStats] = await db.query(`
      SELECT platform, decision_type,
        COUNT(*) as total,
        SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) as executed,
        SUM(CASE WHEN executed = 0 THEN 1 ELSE 0 END) as pending
      FROM ai_decisions
      WHERE DATE(created_at) = CURDATE()
      GROUP BY platform, decision_type
    `);

    // 最近24小时异常
    const [recentAnomalies] = await db.query(`
      SELECT * FROM ai_decisions
      WHERE decision_type = 'anomaly_alert' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY created_at DESC LIMIT 20
    `);

    // 最近出价调整
    const [recentBids] = await db.query(`
      SELECT * FROM ai_decisions
      WHERE decision_type = 'bid_adjust' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY created_at DESC LIMIT 20
    `);

    // 素材疲劳预警
    const [fatigueAlerts] = await db.query(`
      SELECT * FROM ai_decisions
      WHERE decision_type = 'creative_rotate' AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
      ORDER BY created_at DESC LIMIT 10
    `);

    res.json({
      code: 0,
      data: { platformStats, recentAnomalies, recentBids, fatigueAlerts },
    });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/dashboard/simulate-bid — 模拟PID调价（不执行）
 */
router.post('/simulate-bid', auth(), async (req, res) => {
  try {
    const { currentBid, targetROI, actualROI } = req.body;

    const pid = new PIDController();
    const result = pid.compute(currentBid, targetROI, actualROI, ADQ_RULES.bidding);

    res.json({ code: 0, data: { ...result, platform: ADQ_RULES.name, constraints: ADQ_RULES.bidding } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/dashboard/simulate-fatigue — 模拟素材疲劳检测
 */
router.post('/simulate-fatigue', auth(), async (req, res) => {
  try {
    const { platform, dailyStats, createDate } = req.body;
    const detector = new FatigueDetector();
    const result = detector.detect(platform, dailyStats, createDate);
    res.json({ code: 0, data: result });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/dashboard/simulate-coldstart — 模拟冷启动评估
 */
router.post('/simulate-coldstart', auth(), async (req, res) => {
  try {
    const { platform, adgroup } = req.body;
    const accelerator = new ColdStartAccelerator();
    const result = accelerator.evaluate(platform, adgroup);
    res.json({ code: 0, data: result });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/dashboard/simulate-budget — 模拟预算匀速
 */
router.post('/simulate-budget', auth(), async (req, res) => {
  try {
    const { platform, dailyBudget, spentToday, currentHour } = req.body;
    const pacer = new BudgetPacer();
    const result = pacer.evaluate(platform, dailyBudget, spentToday, currentHour ?? new Date().getHours());
    res.json({ code: 0, data: result });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ai-engine/dashboard/metrics — 引擎指标时序数据
 */
router.get('/metrics', auth(), async (req, res) => {
  try {
    const { platform, metric_type, days = 7 } = req.query;
    let sql = 'SELECT * FROM ai_metrics WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
    const params = [+days];

    if (platform) { sql += ' AND platform = ?'; params.push(platform); }
    if (metric_type) { sql += ' AND metric_type = ?'; params.push(metric_type); }
    sql += ' ORDER BY recorded_at DESC LIMIT 500';

    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
