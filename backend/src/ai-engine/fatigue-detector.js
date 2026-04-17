/**
 * 素材疲劳度检测器
 * 基于CTR/CVR下降趋势 + 投放天数 判断素材是否衰退
 */
const { ADQ_RULES } = require('./config');

class FatigueDetector {
  /**
   * 检测素材是否疲劳
   * @param {string} platform 平台代码（保留参数兼容性，实际使用ADQ规则）
   * @param {Array} dailyStats 按天的数据 [{ date, impressions, clicks, conversions, cost }]
   * @param {string} createDate 素材创建日期 YYYY-MM-DD
   * @returns {{ fatigued, score, signals, suggestion }}
   */
  detect(platform, dailyStats, createDate) {
    const config = ADQ_RULES.creative;
    if (!config || dailyStats.length < 3) {
      return { fatigued: false, score: 0, signals: [], suggestion: '数据不足' };
    }

    const signals = [];
    let score = 0;

    // 1. 投放天数评估
    const daysSinceCreate = this._daysBetween(createDate, new Date().toISOString().slice(0, 10));
    const avgDays = config.medianLifeDays;
    const ageRatio = daysSinceCreate / avgDays;
    if (ageRatio >= 1) {
      score += 30;
      signals.push(`投放${daysSinceCreate}天，超过平台均值${avgDays}天`);
    } else if (ageRatio >= 0.7) {
      score += 15;
      signals.push(`投放${daysSinceCreate}天，接近平台均值`);
    }

    // 2. CTR下降趋势
    const ctrDropThreshold = config.decaySignals.ctrDropThreshold;
    const ctrTrend = this._computeTrend(dailyStats.map(d =>
      d.impressions > 0 ? d.clicks / d.impressions : 0
    ));
    if (ctrTrend.dropRatio >= ctrDropThreshold) {
      score += 35;
      signals.push(`CTR下降${(ctrTrend.dropRatio * 100).toFixed(1)}%（阈值${ctrDropThreshold * 100}%）`);
    } else if (ctrTrend.dropRatio > 0) {
      score += Math.round(ctrTrend.dropRatio / ctrDropThreshold * 15);
      signals.push(`CTR轻微下降${(ctrTrend.dropRatio * 100).toFixed(1)}%`);
    }

    // 3. CVR下降趋势
    const cvrDropThreshold = config.decaySignals.cvrDropThreshold;
    const cvrTrend = this._computeTrend(dailyStats.map(d =>
      d.clicks > 0 ? d.conversions / d.clicks : 0
    ));
    if (cvrTrend.dropRatio >= cvrDropThreshold) {
      score += 35;
      signals.push(`CVR下降${(cvrTrend.dropRatio * 100).toFixed(1)}%（阈值${cvrDropThreshold * 100}%）`);
    } else if (cvrTrend.dropRatio > 0) {
      score += Math.round(cvrTrend.dropRatio / cvrDropThreshold * 15);
      signals.push(`CVR轻微下降${(cvrTrend.dropRatio * 100).toFixed(1)}%`);
    }

    // 4. 曝光量下降（平台降权信号）
    const impTrend = this._computeTrend(dailyStats.map(d => d.impressions));
    if (impTrend.dropRatio >= 0.4) {
      score += 20;
      signals.push(`曝光量下降${(impTrend.dropRatio * 100).toFixed(1)}%，疑似平台降权`);
    }

    // 强制轮换检查
    if (daysSinceCreate >= config.maxDaysBeforeForceRotate) {
      score = 100;
      signals.push(`超过最大投放天数${config.maxDaysBeforeForceRotate}天，强制轮换`);
    }

    score = Math.min(100, score);
    const fatigued = score >= 60;

    let suggestion = '素材状态良好';
    if (score >= 80) suggestion = '建议立即替换素材';
    else if (score >= 60) suggestion = '建议准备替换素材，逐步降低投放比例';
    else if (score >= 40) suggestion = '素材开始衰退，关注后续数据';

    return { fatigued, score, signals, suggestion };
  }

  /**
   * 批量检测
   */
  batchDetect(platform, creativesData) {
    return creativesData.map(c => ({
      creativeId: c.creativeId,
      creativeName: c.creativeName,
      ...this.detect(platform, c.dailyStats, c.createDate),
    }));
  }

  _computeTrend(values) {
    if (values.length < 3) return { dropRatio: 0, trend: 'stable' };

    // 取前半段均值 vs 后半段均值
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (avgFirst <= 0) return { dropRatio: 0, trend: 'stable' };

    const dropRatio = (avgFirst - avgSecond) / avgFirst;
    const trend = dropRatio > 0.1 ? 'declining' : dropRatio < -0.1 ? 'rising' : 'stable';

    return { dropRatio: Math.max(0, dropRatio), trend };
  }

  _daysBetween(d1, d2) {
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    return Math.floor(Math.abs(t2 - t1) / 86400000);
  }
}

module.exports = FatigueDetector;
