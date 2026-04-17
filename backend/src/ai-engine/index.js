/**
 * AI投放引擎 - 入口文件
 * 聚合所有子路由，启动调度器
 */
const router = require('express').Router();
const db = require('../db');
const logger = require('../logger');
const AIScheduler = require('./scheduler');

// 子路由
router.use('/dashboard', require('./routes/dashboard'));
router.use('/rules', require('./routes/rules'));
router.use('/diagnosis', require('./routes/diagnosis'));

// 引擎实例（全局单例）
let scheduler = null;

// 自动启动：有活跃的AI接管规则时自动启动调度器
(async () => {
  try {
    const [rows] = await db.query("SELECT COUNT(*) as cnt FROM ai_rules WHERE rule_type='ai_takeover' AND is_active=1");
    if (rows[0]?.cnt > 0) {
      scheduler = new AIScheduler(db, logger);
      await scheduler.start();
      logger.info(`[AI引擎] 检测到${rows[0].cnt}个活跃接管规则，调度器自动启动`);
    }
  } catch (e) {
    logger.warn('[AI引擎] 自动启动检查失败（表可能尚未创建）', { error: e.message });
  }
})();

/**
 * POST /api/ai-engine/start — 启动引擎
 */
router.post('/start', async (req, res) => {
  try {
    if (scheduler?.running) return res.json({ code: 0, msg: '引擎已在运行中' });
    scheduler = new AIScheduler(db, logger);
    await scheduler.start();
    res.json({ code: 0, msg: 'AI引擎已启动' });
  } catch (e) {
    logger.error('AI引擎启动失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/stop — 停止引擎
 */
router.post('/stop', async (req, res) => {
  try {
    if (!scheduler?.running) return res.json({ code: 0, msg: '引擎未在运行' });
    scheduler.stop();
    res.json({ code: 0, msg: 'AI引擎已停止' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ai-engine/health — 引擎健康检查
 */
router.get('/health', (req, res) => {
  res.json({
    code: 0,
    data: {
      running: !!scheduler?.running,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      time: new Date().toISOString(),
    },
  });
});

// 供其他模块调用的启动函数
router.ensureSchedulerRunning = async () => {
  if (scheduler?.running) return;
  try {
    scheduler = new AIScheduler(db, logger);
    await scheduler.start();
    logger.info('[AI引擎] 调度器已启动');
  } catch (e) {
    logger.error('[AI引擎] 调度器启动失败', { error: e.message });
  }
};

module.exports = router;
