/**
 * AI引擎 - 智能诊断API
 * 广告组健康诊断、优化建议、投放问题分析
 */
const router = require('express').Router();
const db = require('../../db');
const logger = require('../../logger');
const auth = require('../../middleware/auth');
const { PLATFORMS } = require('../config');
const AnomalyDetector = require('../anomaly-detector');
const FatigueDetector = require('../fatigue-detector');
const ColdStartAccelerator = require('../cold-start');
const BudgetPacer = require('../budget-pacer');

const anomalyDetector = new AnomalyDetector();
const fatigueDetector = new FatigueDetector();
const coldStart = new ColdStartAccelerator();
const budgetPacer = new BudgetPacer();

/**
 * POST /api/ai-engine/diagnosis/adgroup — 广告组综合诊断
 * body: { platform, adgroupId, adgroupName, createTime, currentBid, dailyBudget,
 *         totalConversions, totalImpressions, totalCost, todayCost, todayConversions,
 *         historyDays: [{ date, cost, impressions, clicks, conversions, revenue }],
 *         creativeDays: [{ date, impressions, clicks, conversions }] }
 */
router.post('/adgroup', auth(), async (req, res) => {
  try {
    const data = req.body;
    const platform = data.platform;
    const platformConfig = PLATFORMS[platform];
    if (!platformConfig) return res.json({ code: -1, msg: '不支持的平台' });

    const diagnosis = { platform: platformConfig.name, adgroupId: data.adgroupId, issues: [], suggestions: [], score: 100 };

    // 1. 冷启动状态
    const csResult = coldStart.evaluate(platform, {
      createTime: data.createTime,
      totalConversions: data.totalConversions || 0,
      totalImpressions: data.totalImpressions || 0,
      totalCost: data.totalCost || 0,
      currentBid: data.currentBid || 1,
      dailyBudget: data.dailyBudget || 100,
    });
    diagnosis.coldStart = csResult;
    if (csResult.phase === 'failed') {
      diagnosis.issues.push({ severity: 'critical', message: '冷启动失败' });
      diagnosis.score -= 40;
    } else if (csResult.phase === 'exploring') {
      diagnosis.issues.push({ severity: 'info', message: `冷启动中，进度${(csResult.progress * 100).toFixed(0)}%` });
      diagnosis.score -= 10;
    }

    // 2. 异常检测
    if (data.historyDays?.length >= 5) {
      const today = {
        cost: data.todayCost || 0,
        impressions: data.todayImpressions || 0,
        clicks: data.todayClicks || 0,
        conversions: data.todayConversions || 0,
      };
      const anomalyResult = anomalyDetector.detect(data.historyDays, today);
      diagnosis.anomalies = anomalyResult;
      if (anomalyResult.hasCritical) {
        diagnosis.score -= 30;
      } else if (anomalyResult.hasAnomaly) {
        diagnosis.score -= 15;
      }
      anomalyResult.anomalies.forEach(a => {
        diagnosis.issues.push({ severity: a.severity, message: a.message });
      });
    }

    // 3. 素材疲劳
    if (data.creativeDays?.length >= 3) {
      const fatigueResult = fatigueDetector.detect(platform, data.creativeDays, data.createTime);
      diagnosis.fatigue = fatigueResult;
      if (fatigueResult.fatigued) {
        diagnosis.score -= 20;
        diagnosis.issues.push({ severity: 'warning', message: fatigueResult.suggestion });
      }
    }

    // 4. 预算消耗
    if (data.dailyBudget && data.todayCost !== undefined) {
      const currentHour = new Date().getHours();
      const paceResult = budgetPacer.evaluate(platform, data.dailyBudget, data.todayCost, currentHour);
      diagnosis.budgetPace = paceResult;
      if (paceResult.status === 'overspend') {
        diagnosis.score -= 10;
        diagnosis.issues.push({ severity: 'warning', message: paceResult.action.message });
      } else if (paceResult.status === 'underspend') {
        diagnosis.score -= 5;
        diagnosis.issues.push({ severity: 'info', message: paceResult.action.message });
      }
    }

    // 5. ROI评估
    const totalRevenue = data.historyDays?.reduce((s, d) => s + (d.revenue || 0), 0) || 0;
    const totalCost = data.historyDays?.reduce((s, d) => s + (d.cost || 0), 0) || 0;
    if (totalCost > 0) {
      const roi = totalRevenue / totalCost;
      diagnosis.roi = +roi.toFixed(4);
      if (roi < 1) {
        diagnosis.score -= 20;
        diagnosis.issues.push({ severity: 'critical', message: `ROI仅${roi.toFixed(2)}，投产比不达标` });
        diagnosis.suggestions.push('考虑降低出价或暂停此广告组');
      } else if (roi < 1.5) {
        diagnosis.score -= 10;
        diagnosis.issues.push({ severity: 'warning', message: `ROI ${roi.toFixed(2)}，偏低` });
      }
    }

    // 综合建议
    diagnosis.score = Math.max(0, diagnosis.score);
    if (diagnosis.score >= 80) {
      diagnosis.overallStatus = 'healthy';
      diagnosis.suggestions.unshift('广告组整体健康，保持当前策略');
    } else if (diagnosis.score >= 50) {
      diagnosis.overallStatus = 'attention';
      diagnosis.suggestions.unshift('广告组需要关注，建议根据以上问题调整');
    } else {
      diagnosis.overallStatus = 'critical';
      diagnosis.suggestions.unshift('广告组状况较差，建议立即处理关键问题');
    }

    // 加入平台特有建议
    if (csResult.strategy?.actions) {
      diagnosis.suggestions.push(...csResult.strategy.actions);
    }

    res.json({ code: 0, data: diagnosis });
  } catch (e) {
    logger.error('广告组诊断失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/diagnosis/batch — 批量诊断
 * body: { platform, adgroups: [同上结构] }
 */
router.post('/batch', auth(), async (req, res) => {
  try {
    const { platform, adgroups } = req.body;
    if (!adgroups?.length) return res.json({ code: -1, msg: '无广告组数据' });

    const results = [];
    for (const ag of adgroups.slice(0, 50)) {
      try {
        const csResult = coldStart.evaluate(platform, {
          createTime: ag.createTime,
          totalConversions: ag.totalConversions || 0,
          totalImpressions: ag.totalImpressions || 0,
          totalCost: ag.totalCost || 0,
          currentBid: ag.currentBid || 1,
          dailyBudget: ag.dailyBudget || 100,
        });

        let score = 100;
        const issues = [];

        if (csResult.phase === 'failed') { score -= 40; issues.push('冷启动失败'); }
        if (ag.todayCost > 0 && ag.todayConversions === 0) { score -= 30; issues.push('有花费无转化'); }

        const totalCost = ag.totalCost || 0;
        const totalRevenue = ag.totalRevenue || 0;
        const roi = totalCost > 0 ? totalRevenue / totalCost : 0;
        if (roi > 0 && roi < 1) { score -= 20; issues.push(`ROI=${roi.toFixed(2)}`); }

        results.push({
          adgroupId: ag.adgroupId,
          adgroupName: ag.adgroupName,
          score: Math.max(0, score),
          coldStartPhase: csResult.phase,
          roi: +roi.toFixed(4),
          issues,
        });
      } catch (e) {
        results.push({ adgroupId: ag.adgroupId, error: e.message });
      }
    }

    results.sort((a, b) => (a.score || 0) - (b.score || 0));
    res.json({ code: 0, data: results });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ai-engine/diagnosis/platform-rules/:platform — 获取平台规则参数
 */
router.get('/platform-rules/:platform', auth(), async (req, res) => {
  const config = PLATFORMS[req.params.platform];
  if (!config) return res.json({ code: -1, msg: '不支持的平台' });
  res.json({ code: 0, data: config });
});

module.exports = router;
