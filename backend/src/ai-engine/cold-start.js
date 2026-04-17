/**
 * 冷启动加速器
 * 根据平台规则判断冷启动状态，提供加速策略
 */
const { PLATFORMS } = require('./config');

class ColdStartAccelerator {
  /**
   * 判断广告组冷启动状态
   * @param {string} platform 平台
   * @param {object} adgroup 广告组信息
   *   { createTime, totalConversions, totalImpressions, totalCost, currentBid, dailyBudget }
   * @returns {{ phase, progress, strategy }}
   */
  evaluate(platform, adgroup) {
    const config = PLATFORMS[platform]?.coldStart;
    if (!config) return { phase: 'unknown', progress: 0, strategy: null };

    const hoursActive = (Date.now() - new Date(adgroup.createTime).getTime()) / 3600000;
    const convProgress = Math.min(1, adgroup.totalConversions / config.minConversions);
    const timeProgress = Math.min(1, hoursActive / config.windowHours);

    // 判断阶段
    let phase;
    if (adgroup.totalConversions >= config.minConversions) {
      phase = 'graduated'; // 已毕业
    } else if (hoursActive > config.windowHours) {
      phase = 'failed'; // 冷启动失败
    } else if (convProgress >= 0.5) {
      phase = 'accelerating'; // 加速期
    } else {
      phase = 'exploring'; // 探索期
    }

    // 生成策略建议
    const strategy = this._buildStrategy(platform, phase, adgroup, config, convProgress);

    return {
      phase,
      progress: +convProgress.toFixed(2),
      timeProgress: +timeProgress.toFixed(2),
      hoursActive: Math.round(hoursActive),
      hoursRemaining: Math.max(0, Math.round(config.windowHours - hoursActive)),
      conversionsNeeded: Math.max(0, config.minConversions - adgroup.totalConversions),
      strategy,
    };
  }

  _buildStrategy(platform, phase, adgroup, config, convProgress) {
    switch (phase) {
      case 'exploring':
        return {
          bidMultiplier: config.boostBidRatio,
          suggestedBid: +(adgroup.currentBid * config.boostBidRatio).toFixed(2),
          budgetSuggestion: '保持预算，不要频繁调整',
          audienceSuggestion: config.audienceExpand ? '适当放宽人群定向' : '保持现有定向',
          actions: [
            `出价上浮至${(config.boostBidRatio * 100 - 100).toFixed(0)}%以争夺流量`,
            '避免修改广告创意和定向',
            '确保预算充足，建议日预算≥出价×20',
            '保持至少24小时不做调整',
          ],
        };

      case 'accelerating':
        return {
          bidMultiplier: 1 + (config.boostBidRatio - 1) * 0.5,
          suggestedBid: +(adgroup.currentBid * (1 + (config.boostBidRatio - 1) * 0.5)).toFixed(2),
          budgetSuggestion: '可适当增加预算，加速转化积累',
          audienceSuggestion: '维持当前定向',
          actions: [
            '数据向好，保持当前策略',
            `还需${config.minConversions - adgroup.totalConversions}个转化完成冷启动`,
            '可小幅增加预算加速积累',
          ],
        };

      case 'graduated':
        return {
          bidMultiplier: 1.0,
          suggestedBid: adgroup.currentBid,
          budgetSuggestion: '根据ROI情况调整预算',
          audienceSuggestion: '可以开始精细化定向',
          actions: [
            '冷启动已完成，进入正常优化阶段',
            '可启用PID出价控制器自动调价',
            '开始关注素材疲劳度',
          ],
        };

      case 'failed':
        return {
          bidMultiplier: 1.0,
          suggestedBid: adgroup.currentBid,
          budgetSuggestion: '降低预算或暂停',
          audienceSuggestion: '重新审视定向策略',
          actions: [
            '冷启动失败，建议暂停此广告组',
            '检查素材质量和定向人群是否匹配',
            '建议新建广告组重新起量',
            '分析同平台成功案例的出价和定向',
          ],
        };

      default:
        return null;
    }
  }

  /**
   * 批量评估
   */
  batchEvaluate(platform, adgroups) {
    return adgroups.map(ag => ({
      adgroupId: ag.adgroupId,
      adgroupName: ag.adgroupName,
      ...this.evaluate(platform, ag),
    }));
  }
}

module.exports = ColdStartAccelerator;
