/**
 * AI引擎调度器
 * 定时执行：出价调整、素材检测、异常监控、预算控制
 */
const { SCHEDULER_CONFIG, PLATFORMS } = require('./config');
const PIDController = require('./pid-controller');
const ThompsonSampling = require('./thompson-sampling');
const FatigueDetector = require('./fatigue-detector');
const AnomalyDetector = require('./anomaly-detector');
const ColdStartAccelerator = require('./cold-start');
const BudgetPacer = require('./budget-pacer');

class AIScheduler {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.pidControllers = new Map();  // adgroupId -> PIDController
    this.thompsonSamplers = new Map(); // accountId -> ThompsonSampling
    this.fatigueDetector = new FatigueDetector();
    this.anomalyDetector = new AnomalyDetector();
    this.coldStart = new ColdStartAccelerator();
    this.budgetPacer = new BudgetPacer();
    this.running = false;
    this.timers = [];
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.logger.info('AI引擎调度器启动');

    await this._ensureTables();

    // 主循环：每15分钟
    this.timers.push(setInterval(() => this._mainLoop(), SCHEDULER_CONFIG.mainIntervalMinutes * 60000));

    // 立即执行一次
    setTimeout(() => this._mainLoop(), 5000);
  }

  stop() {
    this.running = false;
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    this.logger.info('AI引擎调度器已停止');
  }

  async _ensureTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS ai_decisions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        account_id VARCHAR(50),
        adgroup_id VARCHAR(50),
        creative_id VARCHAR(50),
        decision_type VARCHAR(30) NOT NULL COMMENT 'bid_adjust|creative_rotate|budget_pace|anomaly_alert|cold_start',
        decision_data JSON,
        executed TINYINT DEFAULT 0,
        execute_result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_platform_type (platform, decision_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS ai_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        account_id VARCHAR(50),
        metric_type VARCHAR(30) NOT NULL,
        metric_data JSON,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_platform_metric (platform, metric_type),
        INDEX idx_recorded (recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS ai_rules (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(20) NOT NULL DEFAULT 'all',
        rule_name VARCHAR(100) NOT NULL,
        rule_type VARCHAR(30) NOT NULL COMMENT 'bid|budget|creative|alert',
        rule_config JSON NOT NULL,
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_platform_type (platform, rule_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS ai_engine_status (
        id INT PRIMARY KEY DEFAULT 1,
        is_running TINYINT DEFAULT 0,
        last_run_at DATETIME,
        last_run_duration_ms INT,
        total_decisions INT DEFAULT 0,
        total_anomalies INT DEFAULT 0,
        error_count INT DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ];

    for (const sql of queries) {
      try { await this.db.query(sql); } catch (e) { /* table may exist */ }
    }

    // 初始化状态行
    try {
      await this.db.query('INSERT IGNORE INTO ai_engine_status (id, is_running) VALUES (1, 1)');
    } catch (e) { /* ignore */ }
  }

  async _mainLoop() {
    if (!this.running) return;
    const startTime = Date.now();
    this.logger.info('AI引擎主循环开始');

    try {
      await this.db.query('UPDATE ai_engine_status SET is_running = 1, last_run_at = NOW() WHERE id = 1');

      // 依次执行各模块（不并行，避免数据库压力）
      await this._runAnomalyCheck();
      await this._runColdStartCheck();
      await this._runFatigueCheck();
      await this._runBudgetPacing();
      await this._runBidOptimization();

      const duration = Date.now() - startTime;
      await this.db.query(
        'UPDATE ai_engine_status SET last_run_duration_ms = ?, is_running = 0 WHERE id = 1',
        [duration]
      );
      this.logger.info(`AI引擎主循环完成，耗时${duration}ms`);
    } catch (e) {
      this.logger.error('AI引擎主循环异常', { error: e.message });
      await this.db.query('UPDATE ai_engine_status SET error_count = error_count + 1, is_running = 0 WHERE id = 1').catch(() => {});
    }
  }

  // ---- 异常检测 ----
  async _runAnomalyCheck() {
    try {
      // 获取启用了AI的广告账户（通过ai_rules判断）
      const [rules] = await this.db.query("SELECT * FROM ai_rules WHERE rule_type = 'alert' AND is_active = 1");
      if (!rules.length) return;

      // 检查各平台今日数据（简化：从已有的report表取）
      for (const platform of ['qianchuan', 'kuaishou', 'adq']) {
        const tableMap = { qianchuan: 'campaigns', kuaishou: 'ks_campaigns', adq: 'adq_accounts' };
        const table = tableMap[platform];
        if (!table) continue;

        try {
          const [todayData] = await this.db.query(
            `SELECT * FROM ai_metrics WHERE platform = ? AND metric_type = 'daily_snapshot' AND DATE(recorded_at) = CURDATE() ORDER BY recorded_at DESC LIMIT 1`,
            [platform]
          );
          // 如果有快照数据，执行异常检测
          if (todayData.length && todayData[0].metric_data) {
            const data = typeof todayData[0].metric_data === 'string'
              ? JSON.parse(todayData[0].metric_data) : todayData[0].metric_data;
            // 每个adgroup的异常检测会在具体平台同步模块中调用
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) {
      this.logger.error('异常检测模块出错', { error: e.message });
    }
  }

  // ---- 冷启动检查 ----
  async _runColdStartCheck() {
    try {
      const [adgroups] = await this.db.query(`
        SELECT d.*, d.decision_data FROM ai_decisions d
        WHERE d.decision_type = 'cold_start' AND d.executed = 0
        ORDER BY d.created_at DESC LIMIT 50
      `);
      // 冷启动状态由各平台API同步时写入，这里只检查是否需要动作
      for (const ag of adgroups) {
        const data = typeof ag.decision_data === 'string' ? JSON.parse(ag.decision_data) : ag.decision_data;
        if (data?.phase === 'failed') {
          this.logger.warn(`冷启动失败: ${data.adgroupName || ag.adgroup_id}`);
        }
      }
    } catch (e) {
      this.logger.error('冷启动检查出错', { error: e.message });
    }
  }

  // ---- 素材疲劳检测 ----
  async _runFatigueCheck() {
    try {
      // 从ai_metrics获取素材历史数据执行检测
      const [metrics] = await this.db.query(`
        SELECT * FROM ai_metrics
        WHERE metric_type = 'creative_daily' AND recorded_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        ORDER BY recorded_at
      `);
      // 按创意ID分组检测
      const byCreative = {};
      for (const m of metrics) {
        const data = typeof m.metric_data === 'string' ? JSON.parse(m.metric_data) : m.metric_data;
        if (!data?.creativeId) continue;
        if (!byCreative[data.creativeId]) {
          byCreative[data.creativeId] = { platform: m.platform, creativeId: data.creativeId, dailyStats: [] };
        }
        byCreative[data.creativeId].dailyStats.push(data);
      }

      for (const [creativeId, info] of Object.entries(byCreative)) {
        if (info.dailyStats.length < 3) continue;
        const result = this.fatigueDetector.detect(info.platform, info.dailyStats, info.dailyStats[0].date);
        if (result.fatigued) {
          await this._saveDecision(info.platform, null, null, creativeId, 'creative_rotate', {
            score: result.score,
            signals: result.signals,
            suggestion: result.suggestion,
          });
        }
      }
    } catch (e) {
      this.logger.error('素材疲劳检测出错', { error: e.message });
    }
  }

  // ---- 预算匀速 ----
  async _runBudgetPacing() {
    try {
      const currentHour = new Date().getHours();
      const [rules] = await this.db.query("SELECT * FROM ai_rules WHERE rule_type = 'budget' AND is_active = 1");

      for (const rule of rules) {
        const config = typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config;
        if (!config?.dailyBudget || !config?.platform) continue;

        const pace = this.budgetPacer.evaluate(config.platform, config.dailyBudget, config.spentToday || 0, currentHour);
        if (pace.status !== 'normal') {
          await this._saveDecision(config.platform, config.accountId, config.adgroupId, null, 'budget_pace', pace);
        }
      }
    } catch (e) {
      this.logger.error('预算匀速控制出错', { error: e.message });
    }
  }

  // ---- 出价优化 ----
  async _runBidOptimization() {
    try {
      const [rules] = await this.db.query("SELECT * FROM ai_rules WHERE rule_type = 'bid' AND is_active = 1");

      for (const rule of rules) {
        const config = typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config;
        if (!config?.platform || !config?.adgroupId) continue;

        const platformConfig = PLATFORMS[config.platform];
        if (!platformConfig) continue;

        // 检查今日调价次数
        const [counts] = await this.db.query(
          "SELECT COUNT(*) as cnt FROM ai_decisions WHERE adgroup_id = ? AND decision_type = 'bid_adjust' AND DATE(created_at) = CURDATE() AND executed = 1",
          [config.adgroupId]
        );
        if (counts[0].cnt >= platformConfig.bidding.maxChangesPerDay) continue;

        // 检查冷却时间
        const [lastAdj] = await this.db.query(
          "SELECT created_at FROM ai_decisions WHERE adgroup_id = ? AND decision_type = 'bid_adjust' AND executed = 1 ORDER BY created_at DESC LIMIT 1",
          [config.adgroupId]
        );
        if (lastAdj.length) {
          const elapsed = (Date.now() - new Date(lastAdj[0].created_at).getTime()) / 60000;
          if (elapsed < platformConfig.bidding.cooldownMinutes) continue;
        }

        // 获取或创建PID控制器
        let pid = this.pidControllers.get(config.adgroupId);
        if (!pid) {
          pid = new PIDController(config.pidParams);
          this.pidControllers.set(config.adgroupId, pid);
        }

        const targetROI = config.targetROI || 2.0;
        const actualROI = config.actualROI || 0;
        const currentBid = config.currentBid || 1;

        const result = pid.compute(currentBid, targetROI, actualROI, platformConfig.bidding);

        if (Math.abs(result.adjustment) > 0.01) {
          await this._saveDecision(config.platform, config.accountId, config.adgroupId, null, 'bid_adjust', {
            currentBid,
            newBid: result.newBid,
            adjustment: result.adjustment,
            targetROI,
            actualROI,
            detail: result.detail,
          });
        }
      }
    } catch (e) {
      this.logger.error('出价优化出错', { error: e.message });
    }
  }

  async _saveDecision(platform, accountId, adgroupId, creativeId, type, data) {
    try {
      await this.db.query(
        'INSERT INTO ai_decisions (platform, account_id, adgroup_id, creative_id, decision_type, decision_data) VALUES (?, ?, ?, ?, ?, ?)',
        [platform, accountId, adgroupId, creativeId, type, JSON.stringify(data)]
      );
      await this.db.query('UPDATE ai_engine_status SET total_decisions = total_decisions + 1 WHERE id = 1');
    } catch (e) {
      this.logger.error('保存决策记录失败', { error: e.message });
    }
  }
}

module.exports = AIScheduler;
