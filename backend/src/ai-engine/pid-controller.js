/**
 * PID 自动出价控制器
 * bid(t) = bid(t-1) × (1 + Kp×error + Ki×Σerror + Kd×Δerror)
 * error = (targetROI - actualROI) / targetROI
 */
const { PID_DEFAULTS } = require('./config');

class PIDController {
  constructor(opts = {}) {
    this.Kp = opts.Kp ?? PID_DEFAULTS.Kp;
    this.Ki = opts.Ki ?? PID_DEFAULTS.Ki;
    this.Kd = opts.Kd ?? PID_DEFAULTS.Kd;
    this.integralMax = opts.integralMax ?? PID_DEFAULTS.integralMax;
    this.integralMin = opts.integralMin ?? PID_DEFAULTS.integralMin;
    this.integral = 0;
    this.prevError = 0;
    this.history = [];
  }

  /**
   * 计算下一步出价
   * @param {number} currentBid   当前出价
   * @param {number} targetROI    目标ROI
   * @param {number} actualROI    实际ROI
   * @param {object} constraints  平台约束 { maxChangeRatio, minBid }
   * @returns {{ newBid, error, adjustment, detail }}
   */
  compute(currentBid, targetROI, actualROI, constraints = {}) {
    const maxChangeRatio = constraints.maxChangeRatio || 0.2;
    const minBid = constraints.minBid || 0.1;

    // 归一化误差：正值=ROI不达标需提价，负值=ROI超标可降价
    const error = targetROI > 0 ? (targetROI - actualROI) / targetROI : 0;

    // 积分项（带抗饱和）
    this.integral += error;
    this.integral = Math.max(this.integralMin, Math.min(this.integralMax, this.integral));

    // 微分项
    const derivative = error - this.prevError;
    this.prevError = error;

    // PID输出
    const output = this.Kp * error + this.Ki * this.integral + this.Kd * derivative;

    // 限幅：单次调整不超过 maxChangeRatio
    const clampedOutput = Math.max(-maxChangeRatio, Math.min(maxChangeRatio, output));

    // 新出价
    let newBid = currentBid * (1 + clampedOutput);
    newBid = Math.max(minBid, Math.round(newBid * 100) / 100);

    const detail = {
      error: +error.toFixed(4),
      proportional: +(this.Kp * error).toFixed(4),
      integral: +(this.Ki * this.integral).toFixed(4),
      derivative: +(this.Kd * derivative).toFixed(4),
      rawOutput: +output.toFixed(4),
      clampedOutput: +clampedOutput.toFixed(4),
    };

    this.history.push({ ts: Date.now(), currentBid, newBid, ...detail });
    if (this.history.length > 100) this.history.shift();

    return { newBid, error: detail.error, adjustment: clampedOutput, detail };
  }

  reset() {
    this.integral = 0;
    this.prevError = 0;
    this.history = [];
  }

  getHistory() {
    return this.history;
  }
}

module.exports = PIDController;
