/**
 * Thompson Sampling 素材智能选择
 * 每个素材维护 Beta(α, β) 分布
 * α = conversions + prior, β = impressions - conversions + prior
 * 每轮采样选择期望最高的素材投放
 */
const { THOMPSON_DEFAULTS } = require('./config');

class ThompsonSampling {
  constructor(opts = {}) {
    this.priorAlpha = opts.priorAlpha ?? THOMPSON_DEFAULTS.priorAlpha;
    this.priorBeta = opts.priorBeta ?? THOMPSON_DEFAULTS.priorBeta;
    this.minSamples = opts.minSamples ?? THOMPSON_DEFAULTS.minSamples;
    this.explorationBonus = opts.explorationBonus ?? THOMPSON_DEFAULTS.explorationBonus;
    this.arms = new Map(); // creativeId -> { alpha, beta, impressions, conversions, cost, revenue }
  }

  /**
   * 注册/更新一个素材臂
   */
  updateArm(creativeId, stats) {
    const existing = this.arms.get(creativeId) || {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
      impressions: 0,
      conversions: 0,
      cost: 0,
      revenue: 0,
    };

    existing.impressions = stats.impressions ?? existing.impressions;
    existing.conversions = stats.conversions ?? existing.conversions;
    existing.cost = stats.cost ?? existing.cost;
    existing.revenue = stats.revenue ?? existing.revenue;
    existing.alpha = existing.conversions + this.priorAlpha;
    existing.beta = Math.max(1, existing.impressions - existing.conversions + this.priorBeta);

    this.arms.set(creativeId, existing);
  }

  /**
   * Beta分布采样（Box-Muller近似 + Gamma函数采样）
   */
  _sampleBeta(alpha, beta) {
    const x = this._sampleGamma(alpha);
    const y = this._sampleGamma(beta);
    return x / (x + y);
  }

  _sampleGamma(shape) {
    if (shape < 1) {
      return this._sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x, v;
      do {
        x = this._sampleNormal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  _sampleNormal() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 选择下一个投放的素材
   * @param {number} topK 返回前K个素材
   * @returns {Array<{ creativeId, sample, stats }>}
   */
  select(topK = 1) {
    if (this.arms.size === 0) return [];

    const samples = [];
    for (const [creativeId, arm] of this.arms) {
      let sample = this._sampleBeta(arm.alpha, arm.beta);

      // 探索奖励：曝光不足的素材额外加分
      if (arm.impressions < this.minSamples) {
        const explorationFactor = 1 - arm.impressions / this.minSamples;
        sample += this.explorationBonus * explorationFactor;
      }

      samples.push({
        creativeId,
        sample: +sample.toFixed(6),
        stats: { ...arm },
      });
    }

    samples.sort((a, b) => b.sample - a.sample);
    return samples.slice(0, topK);
  }

  /**
   * 获取所有素材的期望排名
   */
  getRanking() {
    const ranking = [];
    for (const [creativeId, arm] of this.arms) {
      const expectedCvr = arm.alpha / (arm.alpha + arm.beta);
      const roi = arm.cost > 0 ? arm.revenue / arm.cost : 0;
      ranking.push({
        creativeId,
        expectedCvr: +expectedCvr.toFixed(6),
        roi: +roi.toFixed(4),
        impressions: arm.impressions,
        conversions: arm.conversions,
      });
    }
    ranking.sort((a, b) => b.expectedCvr - a.expectedCvr);
    return ranking;
  }

  removeArm(creativeId) {
    this.arms.delete(creativeId);
  }

  clear() {
    this.arms.clear();
  }
}

module.exports = ThompsonSampling;
