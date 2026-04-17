/**
 * AI引擎 - ADQ连接器
 * 桥接AI算法 ↔ 腾讯广告Marketing API v3.0
 * 读取实时数据 → 算法决策 → 执行调价/预算/素材轮换
 */
const db = require('../../db');
const logger = require('../../logger');
const adqSync = require('../../services/adq-sync');
const { ADQ_RULES } = require('../config');
const PIDController = require('../pid-controller');
const FatigueDetector = require('../fatigue-detector');
const AnomalyDetector = require('../anomaly-detector');
const BudgetPacer = require('../budget-pacer');
const dayjs = require('dayjs');

const pidControllers = {};
const fatigueDetector = new FatigueDetector();
const anomalyDetector = new AnomalyDetector();
const budgetPacer = new BudgetPacer();

/**
 * 主入口：对一个ADQ账户执行完整AI决策循环
 */
async function runForAccount(accountDbId) {
  const startTime = Date.now();

  // 1. 获取账户信息和Token
  const [[account]] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [accountDbId]);
  if (!account) return { skipped: true, reason: '账户不存在或已禁用' };

  let token;
  try {
    token = await adqSync.getValidToken(accountDbId);
  } catch (e) {
    logger.error(`[AI-ADQ] Token获取失败 ${account.account_name}`, { error: e.message });
    return { skipped: true, reason: 'Token不可用: ' + e.message };
  }

  const adAccountId = account.account_id;
  logger.info(`[AI-ADQ] 开始处理 ${account.account_name} (${adAccountId})`);

  // 2. 获取AI配置
  const [[aiRule]] = await db.query(
    "SELECT * FROM ai_rules WHERE platform = 'adq' AND rule_type = 'ai_takeover' AND is_active = 1 AND JSON_EXTRACT(rule_config, '$.accountDbId') = ?",
    [accountDbId]
  );
  const config = aiRule ? (typeof aiRule.rule_config === 'string' ? JSON.parse(aiRule.rule_config) : aiRule.rule_config) : {};
  const targetCPA = config.targetCPA || 50;       // 目标转化成本（元）
  const targetROI = config.targetROI || 2.0;       // 目标ROI
  const enableBid = config.enableBid !== false;
  const enableCreative = config.enableCreative !== false;
  const enableBudget = config.enableBudget !== false;
  const enableAlert = config.enableAlert !== false;

  const results = { bidAdjusts: 0, anomalies: 0, fatigueAlerts: 0, budgetAlerts: 0, totalAds: 0, actions: [] };

  // 3. 拉取广告组列表
  let adgroups = [];
  try {
    let page = 1;
    while (true) {
      const data = await adqSync.getAdgroups(token, adAccountId, {
        page, page_size: 50,
        fields: ['adgroup_id', 'adgroup_name', 'configured_status', 'daily_budget', 'bid_amount', 'optimization_goal', 'bid_strategy', 'begin_date', 'end_date'],
      });
      adgroups = adgroups.concat(data?.list || []);
      if (!data?.page_info || page * 50 >= (data.page_info.total_number || 0)) break;
      page++;
    }
  } catch (e) {
    logger.error(`[AI-ADQ] 拉取广告组失败`, { error: e.message });
    return { skipped: true, reason: '拉取广告组失败' };
  }

  results.totalAds = adgroups.length;
  const activeAdgroups = adgroups.filter(ag => ag.configured_status === 'AD_STATUS_NORMAL');
  logger.info(`[AI-ADQ] ${account.account_name} 共${adgroups.length}个广告组, ${activeAdgroups.length}个投放中`);

  // 4. 拉取今日报表数据（广告组维度）
  const today = dayjs().format('YYYY-MM-DD');
  let todayReport = [];
  try {
    const data = await adqSync.getDailyReports(token, adAccountId, {
      level: 'REPORT_LEVEL_ADGROUP',
      date_range: { start_date: today, end_date: today },
      group_by: ['adgroup_id'],
      fields: ['adgroup_id', 'adgroup_name', 'cost', 'view_count', 'valid_click_count', 'ctr', 'cpc', 'conversions_count', 'conversions_cost', 'thousand_display_price'],
    });
    todayReport = data?.list || [];
  } catch (e) {
    logger.warn(`[AI-ADQ] 今日报表获取失败`, { error: e.message });
  }

  // 索引今日数据
  const todayByAdgroup = {};
  for (const r of todayReport) {
    todayByAdgroup[String(r.adgroup_id)] = r;
  }

  // 5. 拉取历史7天报表（用于异常检测和趋势分析）
  let historyReport = [];
  try {
    const data = await adqSync.getDailyReports(token, adAccountId, {
      level: 'REPORT_LEVEL_ADGROUP',
      date_range: { start_date: dayjs().subtract(7, 'day').format('YYYY-MM-DD'), end_date: dayjs().subtract(1, 'day').format('YYYY-MM-DD') },
      group_by: ['adgroup_id', 'date'],
      fields: ['date', 'adgroup_id', 'cost', 'view_count', 'valid_click_count', 'conversions_count', 'conversions_cost'],
      page_size: 200,
    });
    historyReport = data?.list || [];
  } catch (e) {
    logger.warn(`[AI-ADQ] 历史报表获取失败`, { error: e.message });
  }

  // 按广告组分组历史
  const historyByAdgroup = {};
  for (const r of historyReport) {
    const id = String(r.adgroup_id);
    if (!historyByAdgroup[id]) historyByAdgroup[id] = [];
    historyByAdgroup[id].push({
      date: r.date, cost: +r.cost / 100, impressions: +r.view_count, clicks: +r.valid_click_count,
      conversions: +r.conversions_count, revenue: 0,
    });
  }

  // 6. 检查今日已调价次数
  const [[bidCountRow]] = await db.query(
    "SELECT COUNT(*) as cnt FROM ai_decisions WHERE platform = 'adq' AND account_id = ? AND decision_type = 'bid_adjust' AND DATE(created_at) = CURDATE() AND executed = 1",
    [adAccountId]
  );
  const todayBidCount = bidCountRow?.cnt || 0;
  const maxBids = ADQ_RULES.bidding.ocpm.maxChangesPerDay;

  // 7. 逐广告组决策
  for (const ag of activeAdgroups) {
    const agId = String(ag.adgroup_id);
    const agName = ag.adgroup_name || agId;
    const bidAmount = +ag.bid_amount || 0;     // 分
    const dailyBudget = +ag.daily_budget || 0; // 分
    const todayData = todayByAdgroup[agId];
    const history = historyByAdgroup[agId] || [];

    const todayCost = todayData ? +todayData.cost / 100 : 0;        // 元
    const todayConv = todayData ? +todayData.conversions_count : 0;
    const todayCPC = todayData ? +todayData.cpc / 100 : 0;
    const todayCTR = todayData ? +todayData.ctr : 0;
    const todayImpressions = todayData ? +todayData.view_count : 0;
    const todayCPA = todayConv > 0 ? todayCost / todayConv : 0;

    // ---- 7a. 关停规则：单日成本超目标2倍 ----
    if (todayCost > 0 && todayConv === 0 && todayCost > targetCPA * 3) {
      await saveDecision('adq', adAccountId, agId, null, 'anomaly_alert', {
        adgroupName: agName, severity: 'critical',
        message: `花费¥${todayCost.toFixed(0)}但0转化，超过目标CPA的3倍`,
        suggestion: '建议暂停此广告组',
        cost: todayCost, conversions: 0, targetCPA,
      });
      results.anomalies++;
      results.actions.push(`⚠️ ${agName}: 花费¥${todayCost.toFixed(0)}无转化`);
      continue;
    }

    if (todayCPA > 0 && todayCPA > targetCPA * ADQ_RULES.bidding.killThreshold) {
      await saveDecision('adq', adAccountId, agId, null, 'anomaly_alert', {
        adgroupName: agName, severity: 'critical',
        message: `CPA ¥${todayCPA.toFixed(0)} 超过目标 ¥${targetCPA} 的${ADQ_RULES.bidding.killThreshold}倍`,
        suggestion: '建议暂停此广告组',
        cost: todayCost, cpa: todayCPA, conversions: todayConv, targetCPA,
      });
      results.anomalies++;
      continue;
    }

    // ---- 7b. 异常检测 ----
    if (enableAlert && history.length >= 5) {
      const anomalyResult = anomalyDetector.detect(history, {
        cost: todayCost, impressions: todayImpressions, clicks: todayData?.valid_click_count || 0, conversions: todayConv,
      });
      if (anomalyResult.hasAnomaly) {
        results.anomalies++;
        await saveDecision('adq', adAccountId, agId, null, 'anomaly_alert', {
          adgroupName: agName, anomalies: anomalyResult.anomalies,
          cost: todayCost, cpa: todayCPA, conversions: todayConv,
        });
      }
    }

    // ---- 7c. 冷启动检查 ----
    const totalConv = history.reduce((s, h) => s + h.conversions, 0) + todayConv;
    const createDate = ag.begin_date || dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const daysActive = dayjs().diff(dayjs(createDate), 'day');
    const inLearning = daysActive <= ADQ_RULES.coldStart.learningDays && totalConv < ADQ_RULES.coldStart.passConversions;

    if (inLearning && daysActive < ADQ_RULES.coldStart.firstObserveHours / 24) {
      // 前24小时不做任何调整
      results.actions.push(`🔬 ${agName}: 冷启动观察期(${daysActive}天, ${totalConv}转化)`);
      continue;
    }

    // ---- 7d. PID出价调整 ----
    if (enableBid && todayCost >= 30 && bidAmount > 0 && todayBidCount < maxBids) {
      // 冷启动期限制调整频率
      if (inLearning) {
        const [[learningAdj]] = await db.query(
          "SELECT COUNT(*) as cnt FROM ai_decisions WHERE adgroup_id = ? AND decision_type = 'bid_adjust' AND DATE(created_at) = CURDATE() AND executed = 1",
          [agId]
        );
        if ((learningAdj?.cnt || 0) >= ADQ_RULES.coldStart.maxAdjustPerDay) continue;
      }

      // 检查冷却时间
      const [[lastAdj]] = await db.query(
        "SELECT created_at FROM ai_decisions WHERE adgroup_id = ? AND decision_type = 'bid_adjust' AND executed = 1 ORDER BY created_at DESC LIMIT 1",
        [agId]
      );
      const elapsedMin = lastAdj ? (Date.now() - new Date(lastAdj.created_at).getTime()) / 60000 : 9999;
      if (elapsedMin < ADQ_RULES.bidding.ocpm.cooldownMinutes) continue;

      // 计算调价方向和幅度
      let newBid = bidAmount;
      let adjustReason = '';

      if (todayConv > 0 && todayCPA < targetCPA * 0.8) {
        // ROI很好 → 可以适当提价抢量
        const range = ADQ_RULES.bidding.ocpm.stable;
        const ratio = Math.min(range.max, (1 - todayCPA / targetCPA) * 0.2);
        newBid = Math.round(bidAmount * (1 + ratio));
        adjustReason = `CPA ¥${todayCPA.toFixed(0)} 远低于目标 ¥${targetCPA}，提价抢量`;
      } else if (todayCPA > targetCPA * ADQ_RULES.bidding.costAlertThreshold) {
        // 成本偏高 → 降价（但不根据小时成本做决策，需要看趋势）
        const histCPA = history.filter(h => h.conversions > 0).map(h => h.cost / h.conversions);
        const avgHistCPA = histCPA.length ? histCPA.reduce((a, b) => a + b, 0) / histCPA.length : 0;
        if (avgHistCPA > 0 && todayCPA > avgHistCPA * 1.3) {
          // 连续偏高趋势才调整
          const ratio = Math.min(ADQ_RULES.bidding.ocpm.stable.max, (todayCPA / targetCPA - 1) * 0.15);
          newBid = Math.max(ADQ_RULES.bidding.minBidCents, Math.round(bidAmount * (1 - ratio)));
          adjustReason = `CPA ¥${todayCPA.toFixed(0)} 超过目标且历史趋势偏高，降价控成本`;
        }
      } else if (todayImpressions < 100 && daysActive >= 1) {
        // 无量 → 提价
        const range = ADQ_RULES.bidding.ocpm.noImpression4h;
        newBid = Math.round(bidAmount * (1 + range.min));
        adjustReason = `曝光仅${todayImpressions}，提价起量`;
      }

      if (newBid !== bidAmount) {
        let execResult = '';
        try {
          await adqSync.updateAdgroup(token, adAccountId, {
            account_id: parseInt(adAccountId),
            adgroup_id: parseInt(agId),
            bid_amount: newBid,
          });
          execResult = '成功';
        } catch (e) {
          execResult = '失败: ' + e.message;
        }

        await saveDecision('adq', adAccountId, agId, null, 'bid_adjust', {
          adgroupName: agName,
          currentBid: bidAmount / 100, newBid: newBid / 100,
          adjustment: +((newBid - bidAmount) / bidAmount).toFixed(4),
          targetCPA, actualCPA: +todayCPA.toFixed(2),
          cost: todayCost, conversions: todayConv,
          reason: adjustReason,
        }, 1, execResult);

        results.bidAdjusts++;
        results.actions.push(`💰 ${agName}: 出价 ¥${(bidAmount/100).toFixed(2)}→¥${(newBid/100).toFixed(2)} (${adjustReason})`);
      }
    }

    // ---- 7e. 预算匀速 ----
    if (enableBudget && dailyBudget > 0) {
      const hour = new Date().getHours();
      const paceResult = budgetPacer.evaluate('adq', dailyBudget / 100, todayCost, hour);
      if (paceResult.status !== 'normal') {
        results.budgetAlerts++;
        await saveDecision('adq', adAccountId, agId, null, 'budget_pace', {
          adgroupName: agName, ...paceResult, dailyBudget: dailyBudget / 100, todayCost,
        });
      }
    }
  }

  // 8. 素材疲劳检测（创意维度报表）
  if (enableCreative) {
    try {
      const creativeReport = await adqSync.getDailyReports(token, adAccountId, {
        level: 'REPORT_LEVEL_DYNAMIC_CREATIVE',
        date_range: { start_date: dayjs().subtract(14, 'day').format('YYYY-MM-DD'), end_date: today },
        group_by: ['dynamic_creative_id', 'date'],
        fields: ['date', 'dynamic_creative_id', 'cost', 'view_count', 'valid_click_count', 'conversions_count'],
        page_size: 200,
      });

      const byCreative = {};
      for (const r of (creativeReport?.list || [])) {
        const cid = String(r.dynamic_creative_id);
        if (!byCreative[cid]) byCreative[cid] = [];
        byCreative[cid].push({
          date: r.date, cost: +r.cost / 100, impressions: +r.view_count,
          clicks: +r.valid_click_count, conversions: +r.conversions_count,
        });
      }

      for (const [creativeId, days] of Object.entries(byCreative)) {
        if (days.length < 3) continue;
        days.sort((a, b) => a.date.localeCompare(b.date));
        const result = fatigueDetector.detect('adq', days, days[0].date);
        if (result.fatigued) {
          results.fatigueAlerts++;
          await saveDecision('adq', adAccountId, null, creativeId, 'creative_rotate', {
            creativeId, score: result.score, signals: result.signals, suggestion: result.suggestion,
          });
        }
      }
    } catch (e) {
      logger.warn(`[AI-ADQ] 素材疲劳检测失败`, { error: e.message });
    }
  }

  // 9. 记录快照
  const totalCost = todayReport.reduce((s, r) => s + +r.cost / 100, 0);
  const totalConvAll = todayReport.reduce((s, r) => s + +r.conversions_count, 0);
  await db.query(
    "INSERT INTO ai_metrics (platform, account_id, metric_type, metric_data) VALUES ('adq', ?, 'snapshot', ?)",
    [adAccountId, JSON.stringify({
      cost: +totalCost.toFixed(2), conversions: totalConvAll,
      cpa: totalConvAll > 0 ? +(totalCost / totalConvAll).toFixed(2) : 0,
      adCount: adgroups.length, activeAds: activeAdgroups.length,
      bidAdjusts: results.bidAdjusts, anomalies: results.anomalies, fatigueAlerts: results.fatigueAlerts,
    })]
  );

  const duration = Date.now() - startTime;
  logger.info(`[AI-ADQ] ${account.account_name} 完成: 调价${results.bidAdjusts} 异常${results.anomalies} 疲劳${results.fatigueAlerts} 耗时${duration}ms`);

  return results;
}

async function saveDecision(platform, accountId, adgroupId, creativeId, type, data, executed = 0, execResult = '') {
  await db.query(
    'INSERT INTO ai_decisions (platform, account_id, adgroup_id, creative_id, decision_type, decision_data, executed, execute_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [platform, accountId, adgroupId, creativeId, type, JSON.stringify(data), executed, execResult]
  );
  await db.query('UPDATE ai_engine_status SET total_decisions = total_decisions + 1 WHERE id = 1').catch(() => {});
}

module.exports = { runForAccount };
