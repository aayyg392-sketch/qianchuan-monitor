/**
 * AI投放引擎 - 平台规则配置
 * 千川 / 快手磁力 / 腾讯ADQ 三平台差异化参数
 */

const PLATFORMS = {
  qianchuan: {
    name: '巨量千川',
    code: 'qianchuan',
    // ECPM = 出价 × eCTR × eCVR × GPM
    ecpmFormula: 'bid * eCTR * eCVR * GPM',
    coldStart: {
      windowHours: 96,        // 4天
      minConversions: 20,     // 最少20个转化才算过冷启动
      boostBidRatio: 1.2,     // 冷启动期出价上浮20%
      audienceExpand: true,   // 冷启动期放宽人群包
    },
    creativeLifespan: {
      avgDays: 3,             // 80%素材3天衰退
      decaySignalCtrDrop: 0.3,  // CTR下降30%视为衰退
      decaySignalCvrDrop: 0.4,  // CVR下降40%视为衰退
      maxDaysBeforeForceRotate: 7,
    },
    bidding: {
      maxChangesPerDay: 2,
      maxChangeRatio: 0.2,    // 每次最多调20%
      minBid: 0.1,
      cooldownMinutes: 120,   // 两次调价至少间隔2小时
    },
    budget: {
      minDailyBudget: 100,
      maxIncreaseRatio: 0.5,  // 每次最多加50%预算
    },
    // 时段权重（基于行业数据）
    hourlyWeights: {
      0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.2,
      6: 0.5, 7: 0.7, 8: 0.9, 9: 1.0, 10: 1.0, 11: 0.9,
      12: 0.8, 13: 0.7, 14: 0.8, 15: 0.9, 16: 1.0, 17: 1.0,
      18: 1.1, 19: 1.2, 20: 1.3, 21: 1.2, 22: 1.0, 23: 0.6,
    },
  },

  kuaishou: {
    name: '快手磁力',
    code: 'kuaishou',
    // ECPM = 出价 × eCTR × eCVR × 智能因子
    ecpmFormula: 'bid * eCTR * eCVR * smartFactor',
    coldStart: {
      windowHours: 72,        // 3天
      minConversions: 10,
      boostBidRatio: 1.15,
      audienceExpand: true,
    },
    creativeLifespan: {
      avgDays: 5,             // 广告4-5天，素材7天
      decaySignalCtrDrop: 0.25,
      decaySignalCvrDrop: 0.35,
      maxDaysBeforeForceRotate: 10,
    },
    bidding: {
      maxChangesPerDay: 3,
      maxChangeRatio: 0.15,
      minBid: 0.1,
      cooldownMinutes: 90,
    },
    budget: {
      minDailyBudget: 100,
      maxIncreaseRatio: 0.5,
    },
    hourlyWeights: {
      0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.2,
      6: 0.4, 7: 0.6, 8: 0.8, 9: 0.9, 10: 1.0, 11: 0.9,
      12: 0.8, 13: 0.7, 14: 0.8, 15: 0.9, 16: 1.0, 17: 1.0,
      18: 1.1, 19: 1.2, 20: 1.3, 21: 1.2, 22: 1.0, 23: 0.5,
    },
  },

  adq: {
    name: '腾讯ADQ',
    code: 'adq',
    // ECPM = 出价 × pCTR × pCVR × 智能因子
    ecpmFormula: 'bid * pCTR * pCVR * smartFactor',
    coldStart: {
      windowHours: 120,       // ~5天
      minConversions: 50,     // ADQ冷启动门槛最高
      boostBidRatio: 1.25,
      audienceExpand: true,
    },
    creativeLifespan: {
      avgDays: 12,            // 10-14天
      decaySignalCtrDrop: 0.2,
      decaySignalCvrDrop: 0.3,
      maxDaysBeforeForceRotate: 21,
    },
    bidding: {
      maxChangesPerDay: 2,
      maxChangeRatio: 0.1,    // ADQ最严：每次最多调10%
      minBid: 0.1,
      cooldownMinutes: 180,   // 3小时冷却
    },
    budget: {
      minDailyBudget: 50,
      maxIncreaseRatio: 0.3,
    },
    hourlyWeights: {
      0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.2,
      6: 0.4, 7: 0.6, 8: 0.8, 9: 1.0, 10: 1.0, 11: 0.9,
      12: 0.8, 13: 0.7, 14: 0.8, 15: 0.9, 16: 1.0, 17: 1.0,
      18: 1.0, 19: 1.1, 20: 1.2, 21: 1.1, 22: 0.9, 23: 0.5,
    },
  },
};

// PID控制器默认参数
const PID_DEFAULTS = {
  Kp: 0.3,    // 比例增益
  Ki: 0.05,   // 积分增益
  Kd: 0.1,    // 微分增益
  integralMax: 5,   // 积分饱和上限
  integralMin: -5,
};

// Thompson Sampling 默认参数
const THOMPSON_DEFAULTS = {
  priorAlpha: 1,    // Beta分布先验 α
  priorBeta: 1,     // Beta分布先验 β
  minSamples: 50,   // 最少曝光次数才开始利用
  explorationBonus: 0.1,  // 探索奖励
};

// 异常检测参数
const ANOMALY_DEFAULTS = {
  zScoreThreshold: 2.5,     // Z-score阈值
  minDataPoints: 10,        // 最少数据点
  costSpikeRatio: 2.0,      // 花费突增倍数
  conversionDropRatio: 0.5, // 转化骤降比例
};

// 调度器配置
const SCHEDULER_CONFIG = {
  mainIntervalMinutes: 15,    // 主循环15分钟
  bidAdjustIntervalMinutes: 60, // 出价调整1小时
  creativeCheckIntervalMinutes: 30, // 素材检查30分钟
  reportSyncIntervalMinutes: 60,    // 报表同步1小时
};

module.exports = {
  PLATFORMS,
  PID_DEFAULTS,
  THOMPSON_DEFAULTS,
  ANOMALY_DEFAULTS,
  SCHEDULER_CONFIG,
};
