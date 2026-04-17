/**
 * 预算匀速消耗控制器
 * 根据时段权重分配预算，防止预算过早花完或花不出去
 */
const { PLATFORMS } = require('./config');

class BudgetPacer {
  /**
   * 计算当前时刻的预算消耗进度是否正常
   * @param {string} platform 平台
   * @param {number} dailyBudget 日预算
   * @param {number} spentToday 今日已花费
   * @param {number} currentHour 当前小时 0-23
   * @returns {{ status, idealSpent, deviation, action }}
   */
  evaluate(platform, dailyBudget, spentToday, currentHour) {
    const weights = PLATFORMS[platform]?.hourlyWeights;
    if (!weights || dailyBudget <= 0) {
      return { status: 'unknown', idealSpent: 0, deviation: 0, action: null };
    }

    // 计算到当前时刻的理想消耗比例
    let totalWeight = 0;
    let currentWeight = 0;
    for (let h = 0; h < 24; h++) {
      totalWeight += weights[h] || 0.5;
      if (h <= currentHour) currentWeight += weights[h] || 0.5;
    }

    const idealRatio = currentWeight / totalWeight;
    const idealSpent = dailyBudget * idealRatio;
    const deviation = idealSpent > 0 ? (spentToday - idealSpent) / idealSpent : 0;

    let status, action;

    if (deviation > 0.3) {
      status = 'overspend';
      action = {
        type: 'reduce_bid',
        ratio: Math.min(0.15, deviation * 0.3),
        message: `消耗过快（偏差+${(deviation * 100).toFixed(0)}%），建议降低出价${(Math.min(15, deviation * 30)).toFixed(0)}%`,
      };
    } else if (deviation < -0.3) {
      status = 'underspend';
      // 判断剩余时段是否高峰
      let remainingWeight = 0;
      for (let h = currentHour + 1; h < 24; h++) {
        remainingWeight += weights[h] || 0.5;
      }
      const isHighPeakComing = remainingWeight / (totalWeight - currentWeight || 1) > 1.1;

      if (isHighPeakComing) {
        action = {
          type: 'hold',
          ratio: 0,
          message: '消耗偏慢，但后续为高峰时段，暂时观望',
        };
      } else {
        action = {
          type: 'increase_bid',
          ratio: Math.min(0.1, Math.abs(deviation) * 0.2),
          message: `消耗过慢（偏差${(deviation * 100).toFixed(0)}%），建议提升出价${(Math.min(10, Math.abs(deviation) * 20)).toFixed(0)}%`,
        };
      }
    } else {
      status = 'normal';
      action = { type: 'hold', ratio: 0, message: '消耗节奏正常' };
    }

    return {
      status,
      idealSpent: +idealSpent.toFixed(2),
      actualSpent: +spentToday.toFixed(2),
      deviation: +deviation.toFixed(4),
      idealRatio: +idealRatio.toFixed(4),
      actualRatio: +(spentToday / dailyBudget).toFixed(4),
      remainingBudget: +(dailyBudget - spentToday).toFixed(2),
      action,
    };
  }

  /**
   * 计算剩余时段的建议出价调整
   */
  suggestBidForRemaining(platform, dailyBudget, spentToday, currentHour, currentBid) {
    const pace = this.evaluate(platform, dailyBudget, spentToday, currentHour);
    if (!pace.action || pace.action.type === 'hold') {
      return { adjustedBid: currentBid, reason: pace.action?.message || '无需调整' };
    }

    const direction = pace.action.type === 'reduce_bid' ? -1 : 1;
    const adjustedBid = +(currentBid * (1 + direction * pace.action.ratio)).toFixed(2);

    return {
      adjustedBid: Math.max(0.1, adjustedBid),
      reason: pace.action.message,
    };
  }
}

module.exports = BudgetPacer;
