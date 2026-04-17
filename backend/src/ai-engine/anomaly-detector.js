/**
 * 异常检测器
 * 基于Z-score统计 + 规则引擎 检测投放异常
 */
const { ANOMALY_DEFAULTS } = require('./config');

class AnomalyDetector {
  constructor(opts = {}) {
    this.zScoreThreshold = opts.zScoreThreshold ?? ANOMALY_DEFAULTS.zScoreThreshold;
    this.minDataPoints = opts.minDataPoints ?? ANOMALY_DEFAULTS.minDataPoints;
    this.costSpikeRatio = opts.costSpikeRatio ?? ANOMALY_DEFAULTS.costSpikeRatio;
    this.conversionDropRatio = opts.conversionDropRatio ?? ANOMALY_DEFAULTS.conversionDropRatio;
  }

  /**
   * 检测单个广告组的异常
   * @param {Array} history 历史数据 [{ date, cost, impressions, clicks, conversions, revenue }]
   * @param {object} current 当前数据
   * @returns {{ anomalies: Array<{ type, severity, message, value, baseline }> }}
   */
  detect(history, current) {
    const anomalies = [];

    if (history.length < this.minDataPoints) {
      return { anomalies, hasAnomaly: false };
    }

    // 1. 花费突增检测
    const costStats = this._stats(history.map(h => h.cost));
    if (current.cost > 0 && costStats.mean > 0) {
      const costZScore = (current.cost - costStats.mean) / (costStats.std || 1);
      if (costZScore > this.zScoreThreshold || current.cost > costStats.mean * this.costSpikeRatio) {
        anomalies.push({
          type: 'cost_spike',
          severity: costZScore > 4 ? 'critical' : 'warning',
          message: `花费异常突增，当前${current.cost.toFixed(2)}元，均值${costStats.mean.toFixed(2)}元`,
          value: current.cost,
          baseline: costStats.mean,
          zScore: +costZScore.toFixed(2),
        });
      }
    }

    // 2. 转化骤降检测
    const convStats = this._stats(history.map(h => h.conversions));
    if (convStats.mean > 2 && current.conversions < convStats.mean * this.conversionDropRatio) {
      const convZScore = (convStats.mean - current.conversions) / (convStats.std || 1);
      anomalies.push({
        type: 'conversion_drop',
        severity: current.conversions === 0 ? 'critical' : 'warning',
        message: `转化骤降，当前${current.conversions}个，均值${convStats.mean.toFixed(1)}个`,
        value: current.conversions,
        baseline: convStats.mean,
        zScore: +convZScore.toFixed(2),
      });
    }

    // 3. CTR异常（过低 = 素材问题，过高 = 可能刷量）
    const ctrHistory = history.map(h => h.impressions > 0 ? h.clicks / h.impressions : 0);
    const ctrStats = this._stats(ctrHistory);
    const currentCtr = current.impressions > 0 ? current.clicks / current.impressions : 0;
    if (ctrStats.mean > 0 && current.impressions > 100) {
      const ctrZScore = Math.abs(currentCtr - ctrStats.mean) / (ctrStats.std || 0.001);
      if (ctrZScore > this.zScoreThreshold) {
        const direction = currentCtr > ctrStats.mean ? '异常偏高（疑似异常流量）' : '异常偏低（素材可能有问题）';
        anomalies.push({
          type: currentCtr > ctrStats.mean ? 'ctr_spike' : 'ctr_drop',
          severity: 'warning',
          message: `CTR${direction}，当前${(currentCtr * 100).toFixed(2)}%，均值${(ctrStats.mean * 100).toFixed(2)}%`,
          value: currentCtr,
          baseline: ctrStats.mean,
          zScore: +ctrZScore.toFixed(2),
        });
      }
    }

    // 4. 花费无转化检测
    if (current.cost > costStats.mean * 0.5 && current.conversions === 0 && convStats.mean > 1) {
      anomalies.push({
        type: 'spend_no_conversion',
        severity: 'critical',
        message: `已花费${current.cost.toFixed(2)}元但无转化`,
        value: current.cost,
        baseline: 0,
      });
    }

    // 5. CPA突增
    const cpaHistory = history.filter(h => h.conversions > 0).map(h => h.cost / h.conversions);
    if (cpaHistory.length >= this.minDataPoints && current.conversions > 0) {
      const cpaStats = this._stats(cpaHistory);
      const currentCpa = current.cost / current.conversions;
      const cpaZScore = (currentCpa - cpaStats.mean) / (cpaStats.std || 1);
      if (cpaZScore > this.zScoreThreshold) {
        anomalies.push({
          type: 'cpa_spike',
          severity: 'warning',
          message: `CPA突增，当前${currentCpa.toFixed(2)}元，均值${cpaStats.mean.toFixed(2)}元`,
          value: currentCpa,
          baseline: cpaStats.mean,
          zScore: +cpaZScore.toFixed(2),
        });
      }
    }

    return {
      anomalies,
      hasAnomaly: anomalies.length > 0,
      hasCritical: anomalies.some(a => a.severity === 'critical'),
    };
  }

  _stats(arr) {
    if (!arr.length) return { mean: 0, std: 0, min: 0, max: 0 };
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    return {
      mean,
      std: Math.sqrt(variance),
      min: Math.min(...arr),
      max: Math.max(...arr),
    };
  }
}

module.exports = AnomalyDetector;
