/**
 * AI投放引擎 - ADQ专用配置
 * 基于腾讯广告 Marketing API v3.0 深层规则
 */

const ADQ_RULES = {
  name: '腾讯ADQ',
  platform: 'adq',

  // ===== ECPM竞价公式 =====
  // eCPM = pCTR × pCVR × Bid × 1000
  // GSP第二价格机制：实际CPA通常低于出价
  ecpmFormula: 'pCTR * pCVR * bid * 1000',

  // ===== 冷启动规则 =====
  coldStart: {
    learningDays: 4,              // 学习期4天
    passConversions: 20,          // >=20转化算通过
    hardStartThreshold: 6,        // <6转化标记"难起量"
    deepOptThreshold: 6,          // 6个深层转化后切换深层目标
    maxAdjustPerDay: 2,           // 学习期每天最多调2次
    minAdjustIntervalHours: 12,   // 学习期调整间隔>=12小时
    firstObserveHours: 24,        // 前24小时不做调整
    minDailyBudget: 300,          // 冷启动最低日预算300元
    minAudienceSize: 1000000,     // 定向覆盖人群百万级以上
    boostBidRatio: 1.15,          // 冷启动出价上浮15%
  },

  // ===== 素材生命周期 =====
  creative: {
    medianLifeDays: 3,            // 50%计划生命周期不超过3天
    goodLifeDays: 7,              // 优质素材7天
    peakLifeDays: 15,             // 爆款二创可达15天
    decayCheckDays: 3,            // 每3天检查一次衰退
    rotateCount: 2,               // 每次淘汰末位2条+补充2条新素材
    decaySignals: {
      ctrDropDays: 2,             // CTR连续下降2天=进入衰退
      ctrDropThreshold: 0.15,     // CTR下降15%
      cvrDropThreshold: 0.2,      // CVR下降20%
      costRiseThreshold: 0.3,     // 转化成本上升30%
    },
    maxDaysBeforeForceRotate: 14, // 最长14天强制轮换
  },

  // ===== 出价规则 =====
  bidding: {
    // oCPM模式
    ocpm: {
      maxChangesPerDay: 2,        // 每天最多调价2次（赔付保障要求）
      cooldownMinutes: 180,       // 调价冷却3小时
      // 不同场景调价幅度
      noImpression4h: { min: 0.10, max: 0.20 },  // 无量4小时→提价10-20%
      dropping3h: { min: 0.10, max: 0.20 },       // 连续3小时掉量→提价10-20%
      stable: { min: 0.05, max: 0.10 },           // 稳定投放→微调5-10%
    },
    // CPC模式
    cpc: {
      maxChangesPerDay: 4,
      cooldownMinutes: 120,       // 至少间隔2小时
    },
    // 共通规则
    minBidCents: 10,              // 最低出价（分）
    killThreshold: 2.0,           // 单日成本超目标2倍→关停
    costAlertThreshold: 1.2,      // 成本超目标120%→预警
    costConfirmDays: 2,           // 连续2-3天超成本才大幅调整
    // 重要：不根据小时级成本做调价决策
    hourlyDecisionForbidden: true,
  },

  // ===== 预算规则 =====
  budget: {
    maxConversionFormula: 'activeAds * bid * 10',   // 最大转化量预算公式
    stableCostFormula: 'activeAds * bid * 6',       // 稳定成本预算公式
    minDailyBudget: 300,           // 最低日预算300
    balancePerAdMin: 1000,         // 余额/在投广告数 > 1000
    balancePerActiveMin: 5000,     // 余额/有量广告数 > 5000
    maxIncreaseRatio: 0.3,         // 单次预算增加不超30%
  },

  // ===== 账户健康 =====
  account: {
    maxOnlineAds: 15,              // 每账户最多15条在线广告
    dailyNewAds: 2,                // 每天建议上新2条
    consumeStabilityThreshold: 0.5, // 日消耗波动>50%影响权重
    auditPassRateMin: 0.7,         // 审核通过率低于70%暂停提交
  },

  // ===== 赔付保护 =====
  costProtection: {
    triggerRatio: 1.2,             // 实际成本>目标120%触发
    minDailyConversions: 6,        // 日均>=6转化才有赔付
    maxDailyAdjustments: 2,        // 保障期内每天不超2次调整
    refundFormula: 'totalCost - (targetBid * totalConversions)',
  },

  // ===== 时段权重（基于ADQ流量特征）=====
  hourlyWeights: {
    0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.2,
    6: 0.4, 7: 0.6, 8: 0.8, 9: 1.0, 10: 1.0, 11: 0.9,
    12: 0.8, 13: 0.7, 14: 0.8, 15: 0.9, 16: 1.0, 17: 1.0,
    18: 1.0, 19: 1.1, 20: 1.2, 21: 1.1, 22: 0.9, 23: 0.5,
  },

  // ===== 归因窗口 =====
  attribution: {
    clickWindow: 7,                // 点击归因7天
    viewWindow: 1,                 // 曝光归因24小时
  },
};

// PID控制器参数（ADQ调优）
const PID_DEFAULTS = {
  Kp: 0.2,     // 比例增益（ADQ更保守）
  Ki: 0.03,    // 积分增益
  Kd: 0.08,    // 微分增益
  integralMax: 3,
  integralMin: -3,
};

// 异常检测参数
const ANOMALY_DEFAULTS = {
  zScoreThreshold: 2.5,
  minDataPoints: 5,
  costSpikeRatio: 2.0,
  conversionDropRatio: 0.5,
};

// 调度器配置
const SCHEDULER_CONFIG = {
  mainIntervalMinutes: 15,
};

module.exports = { ADQ_RULES, PID_DEFAULTS, ANOMALY_DEFAULTS, SCHEDULER_CONFIG };
