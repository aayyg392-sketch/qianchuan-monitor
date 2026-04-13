/**
 * AI金牌投手 - 核心引擎
 * 自动监控千川全域推广计划，放大盈利素材、止损亏损素材
 *
 * 全域推广特点：
 * - 数据结构嵌套：ad_info.*, stats_info.*
 * - 出价方式：roi2_goal（目标ROI），非CPA出价
 * - 预算通常设999999（不限），实际由系统控制
 * - stat_cost单位：微元（÷100000=元）
 */
const db = require('../db');
const logger = require('../logger');
const dayjs = require('dayjs');
const QianChuanAPI = require('./qianchuan');

// 内存中记录上次执行时间
const lastRunMap = {};
// 内存中记录素材自动清理的上次执行日期，防止每轮巡检都执行
const lastAutoCleanDateMap = {};
// 内存中记录每个计划的调速状态
const boostActiveMap = {};
// 内存中记录调速上次执行时间（独立于计划巡检）
const lastBoostRunMap = {};
// 内存中记录素材追投上次执行时间
const lastMatBoostRunMap = {};
// 内存中记录已追投的素材（避免重复），key: advertiserId_materialId_adId
const matBoostActiveMap = {};

/**
 * 对单个账户执行一次AI投手逻辑
 */
async function runOnce(advertiserId) {
  // 1. 读取配置（不要求enabled=1，手动执行时也能用）
  const [[config]] = await db.query('SELECT * FROM qc_pitcher_configs WHERE advertiser_id=?', [advertiserId]);
  if (!config) return { skipped: true, reason: '无配置' };
  if (!config.enabled) return { skipped: true, reason: '未启用' };

  // 2. 获取token
  const [[account]] = await db.query('SELECT access_token, account_type FROM qc_accounts WHERE advertiser_id=? AND status=1', [advertiserId]);
  if (!account || !account.access_token) return { skipped: true, reason: 'token不可用' };

  const api = new QianChuanAPI(account.access_token);

  // 解析启用的规则
  const enabledRulesStr = config.enabled_rules || 'min_roi,stop_roi,min_cost,no_convert,budget_multiply,max_budget_multiply,bid_up_pct,bid_down_pct';
  const rules = enabledRulesStr.split(',');
  const ruleOn = (key) => rules.includes(key);

  // 3. 获取计划列表+实时数据（尝试两种营销目标）
  let adList = [];
  const goals = ['VIDEO_PROM_GOODS', 'LIVE_PROM_GOODS'];
  for (const goal of goals) {
    let page = 1;
    while (true) {
      const res = await api.getUniPromotionAdList({ advertiserId, marketingGoal: goal, page, pageSize: 100 });
      const list = res.data?.ad_list || [];
      adList = adList.concat(list);
      const total = res.data?.page_info?.total_num || res.data?.page_info?.total_number || 0;
      if (page * 100 >= total) break;
      page++;
    }
  }

  logger.info(`[Pitcher] 账户${advertiserId} 获取到${adList.length}个全域推广计划`);

  const results = [];
  let scaleUpCount = 0, scaleDownCount = 0, holdCount = 0;

  // 调速独立巡检间隔判断
  const boostInterval = (config.boost_poll_interval || 60) * 60 * 1000;
  const lastBoostRun = lastBoostRunMap[advertiserId] || 0;
  const _boostTimeOk = (Date.now() - lastBoostRun) >= boostInterval;
  if (_boostTimeOk && config.boost_enabled) {
    lastBoostRunMap[advertiserId] = Date.now();
  }

  for (const ad of adList) {
    // === 解析嵌套数据结构 ===
    const adInfo = ad.ad_info || {};
    const statsInfo = ad.stats_info || {};
    const productInfo = (ad.product_info || [])[0] || {};

    const adId = adInfo.id;
    const adName = adInfo.name || String(adId);
    const status = adInfo.status;
    const budget = parseFloat(adInfo.budget || 0); // 元
    const roiGoal = parseFloat(adInfo.roi2_goal || 0); // 目标ROI
    const smartBidType = adInfo.smart_bid_type; // SMART_BID_CUSTOM = 目标ROI

    // 实时统计数据（微元→元）
    const cost = parseFloat(statsInfo.stat_cost || 0) / 100000;
    const orders = parseInt(statsInfo.total_pay_order_count_for_roi2 || 0);
    const gmv = parseFloat(statsInfo.total_pay_order_gmv_for_roi2 || 0) / 100000;
    const apiRoi = parseFloat(statsInfo.total_prepay_and_pay_order_roi2 || 0); // API直接返回ROI

    // 计算ROI（优先用API返回值，API返回0时自行计算）
    const roi = apiRoi > 0 ? apiRoi : (cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0);
    // 全域推广无click_cnt，用订单/消耗估算CVR
    const cvr = cost > 0 ? parseFloat(((orders / (cost / 10)) * 100).toFixed(2)) : 0; // 每10元消耗的转化率

    // 4. 过滤条件
    if (status !== 'DELIVERY_OK' && status !== 'AD_STATUS_DELIVERY_OK') {
      logger.debug(`[Pitcher] 跳过 ${adName}: status=${status} (非投放中)`);
      continue;
    }
    if (ruleOn('min_cost') && cost < config.min_cost) {
      logger.debug(`[Pitcher] 跳过 ${adName}: cost=${cost.toFixed(2)} < ${config.min_cost} (消耗不足)`);
      continue;
    }

    let action = 'hold';
    let actionDetail = '';
    let newBudget = budget;
    let newRoiGoal = roiGoal;

    // 5. 判定逻辑（根据启用的规则）
    const needScaleUp = ruleOn('min_roi') && roi >= config.min_roi && orders > 0;
    const needScaleDown = ruleOn('stop_roi') && (roi < config.stop_roi && roi > 0 || (cost >= config.min_cost * 3 && orders === 0));

    if (needScaleDown) {
      // === 止损：提高目标ROI → 系统更保守出价 → 减少消耗 ===
      action = 'scale_down';
      scaleDownCount++;

      if (ruleOn('bid_down_pct') && roiGoal > 0) {
        // 提高目标ROI（相当于降低出价激进度）
        newRoiGoal = parseFloat((roiGoal * (1 + config.bid_down_pct / 100)).toFixed(2));
        actionDetail = `止损: 实际ROI=${roi}<止损线${config.stop_roi}, 目标ROI ${roiGoal}→${newRoiGoal} (提高${config.bid_down_pct}%要求)`;

        try {
          const updateRes = await api.updateUniPromotionRoiGoal(advertiserId, adId, newRoiGoal);
          if (updateRes.code !== 0) {
            actionDetail += ` [API: ${updateRes.msg || updateRes.code}]`;
          }
        } catch (e) {
          actionDetail += ` [API失败:${e.message}]`;
        }
      } else {
        actionDetail = `止损观察: ROI=${roi}<${config.stop_roi}`;
        if (!ruleOn('bid_down_pct')) actionDetail += ', 刹车规则未启用';
        else actionDetail += ', 无目标ROI信息不操作';
      }

      // 降低预算（如果不是不限预算）
      if (ruleOn('budget_multiply') && budget > 0 && budget < 999990) {
        newBudget = Math.max(parseFloat((budget * 0.7).toFixed(2)), 100);
        actionDetail += `, 预算${budget}→${newBudget}`;
        try {
          await api.updateAdBudget(advertiserId, adId, newBudget);
        } catch (e) {
          actionDetail += ` [预算API失败]`;
        }
      }

    } else if (needScaleUp) {
      // === 放大：降低目标ROI → 系统更激进出价 → 增加消耗 ===
      action = 'scale_up';
      scaleUpCount++;

      // 降低目标ROI（允许系统出更高价获取更多流量）
      if (ruleOn('bid_up_pct') && roiGoal > 0) {
        const minAllowedRoi = config.stop_roi * 1.2; // 不能低于止损线的1.2倍
        newRoiGoal = Math.max(parseFloat((roiGoal * (1 - config.bid_up_pct / 100)).toFixed(2)), minAllowedRoi);
        actionDetail = `放大: ROI=${roi}≥${config.min_roi}, ${orders}单, 目标ROI ${roiGoal}→${newRoiGoal} (降低${config.bid_up_pct}%门槛)`;

        if (newRoiGoal < roiGoal) {
          try {
            const updateRes = await api.updateUniPromotionRoiGoal(advertiserId, adId, newRoiGoal);
            if (updateRes.code !== 0) {
              actionDetail += ` [API: ${updateRes.msg || updateRes.code}]`;
            }
          } catch (e) {
            actionDetail += ` [API失败:${e.message}]`;
          }
        } else {
          actionDetail += ' (已到安全下限不再调整)';
        }
      } else {
        actionDetail = `放大: ROI=${roi}≥${config.min_roi}, ${orders}单`;
        if (!ruleOn('bid_up_pct')) actionDetail += ', 加速规则未启用';
      }

      // 提高预算（如果不是不限预算，且未超过上限）
      if (ruleOn('budget_multiply') && budget > 0 && budget < 999990) {
        const maxBudget = ruleOn('max_budget_multiply') ? budget * config.max_budget_multiply : budget * 10;
        newBudget = Math.min(parseFloat((budget * config.budget_multiply).toFixed(2)), maxBudget);
        if (newBudget > budget) {
          actionDetail += `, 预算${budget}→${newBudget}`;
          try {
            await api.updateAdBudget(advertiserId, adId, newBudget);
          } catch (e) {
            actionDetail += ` [预算API失败]`;
          }
        }
      }

    } else {
      // === 观察 ===
      action = 'hold';
      holdCount++;
      actionDetail = `观察中: ROI=${roi}, ${orders}单, 消耗¥${cost.toFixed(0)}, 目标ROI=${roiGoal}`;
    }

    // 5.5 自动调速：独立巡检间隔，ROI达到保底线自动开启，低于保底线自动关闭
    if (config.boost_enabled && config.boost_min_roi > 0 && config.boost_budget > 0 && _boostTimeOk) {
      const boostKey = `${advertiserId}_${adId}`;
      const isBoostActive = boostActiveMap[boostKey];
      if (roi >= config.boost_min_roi && orders > 0 && !isBoostActive) {
        // ROI达标，开启调速
        try {
          const boostRes = await api.createSmartControl(advertiserId, adId, config.boost_budget, config.boost_duration || 6);
          if (boostRes.code === 0) {
            boostActiveMap[boostKey] = true;
            actionDetail += ` | 自动调速已开启(预算${config.boost_budget}元,${config.boost_duration || 6}小时)`;
            await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, ad_id, ad_name, action, action_detail) VALUES (?,?,?,?,?)',
              [advertiserId, String(adId), adName, 'boost_on', `ROI=${roi}≥保底${config.boost_min_roi}, 自动开启调速 预算${config.boost_budget}元 时长${config.boost_duration || 6}小时`]
            ).catch(() => {});
          } else {
            actionDetail += ` | 调速开启失败:${boostRes.msg}`;
          }
        } catch (e) {
          actionDetail += ` | 调速异常:${e.message}`;
        }
      } else if (roi < config.boost_min_roi && roi > 0 && isBoostActive) {
        // ROI不达标，关闭调速
        try {
          const stopRes = await api.disableSmartControl(advertiserId, adId);
          if (stopRes.code === 0) {
            boostActiveMap[boostKey] = false;
            actionDetail += ` | 自动调速已关闭(ROI不达标)`;
            await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, ad_id, ad_name, action, action_detail) VALUES (?,?,?,?,?)',
              [advertiserId, String(adId), adName, 'boost_off', `ROI=${roi}<保底${config.boost_min_roi}, 自动关闭调速`]
            ).catch(() => {});
          }
        } catch (e) {
          actionDetail += ` | 关闭调速异常:${e.message}`;
        }
      }
    }

    // 6. 写日志
    await db.query(
      `INSERT INTO qc_pitcher_logs (advertiser_id, ad_id, ad_name, material_title, cost, roi, cvr, gmv, orders, show_cnt, click_cnt, action, action_detail, old_budget, new_budget, old_bid, new_bid)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [advertiserId, String(adId), adName, productInfo.product_name || '', cost, roi, cvr, gmv, orders, 0, 0, action, actionDetail, budget, newBudget, roiGoal, newRoiGoal]
    ).catch(e => logger.error('[Pitcher] 写日志失败', { error: e.message }));

    results.push({ adId, adName, cost, roi, cvr, orders, action, actionDetail });
  }

  logger.info(`[Pitcher] 账户${advertiserId} 执行完成: 放大${scaleUpCount} 止损${scaleDownCount} 观察${holdCount} (共${adList.length}个计划, ${results.length}个达标)`);

  return {
    advertiser_id: advertiserId,
    total_ads: adList.length,
    processed: results.length,
    scale_up: scaleUpCount,
    scale_down: scaleDownCount,
    hold: holdCount,
    details: results
  };
}

/**
 * 独立调速：当计划管理未启动但调速已开启时，单独执行调速逻辑
 */
async function runBoostOnly(advertiserId) {
  const [[config]] = await db.query('SELECT * FROM qc_pitcher_configs WHERE advertiser_id=?', [advertiserId]);
  if (!config || !config.boost_enabled) return;

  const [[account]] = await db.query('SELECT access_token FROM qc_accounts WHERE advertiser_id=? AND status=1', [advertiserId]);
  if (!account || !account.access_token) return;

  const api = new QianChuanAPI(account.access_token);

  // 获取在投计划（带marketing_goal标记）
  let adList = [];
  for (const goal of ['VIDEO_PROM_GOODS', 'LIVE_PROM_GOODS']) {
    let page = 1;
    while (true) {
      const res = await api.getUniPromotionAdList({ advertiserId, marketingGoal: goal, page, pageSize: 100 });
      const list = res.data?.ad_list || [];
      // 给每个计划打上goal标记
      for (const ad of list) ad._marketing_goal = goal;
      adList = adList.concat(list);
      const total = res.data?.page_info?.total_num || res.data?.page_info?.total_number || 0;
      if (page * 100 >= total) break;
      page++;
    }
  }

  logger.info(`[Boost] 账户${advertiserId} 独立调速巡检: 获取到${adList.length}个计划, 保底ROI=${config.boost_min_roi}`);

  for (const ad of adList) {
    const adInfo = ad.ad_info || {};
    const statsInfo = ad.stats_info || {};
    const adId = adInfo.id;
    const adName = adInfo.name || String(adId);
    const status = adInfo.status;
    const goal = ad._marketing_goal;

    if (status !== 'DELIVERY_OK' && status !== 'AD_STATUS_DELIVERY_OK') continue;

    const cost = parseFloat(statsInfo.stat_cost || 0) / 100000;
    const orders = parseInt(statsInfo.total_pay_order_count_for_roi2 || 0);
    const gmv = parseFloat(statsInfo.total_pay_order_gmv_for_roi2 || 0) / 100000;
    const apiRoi = parseFloat(statsInfo.total_prepay_and_pay_order_roi2 || 0);
    const roi = apiRoi > 0 ? apiRoi : (cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0);

    const boostKey = `${advertiserId}_${adId}`;
    const isBoostActive = boostActiveMap[boostKey];

    if (roi >= config.boost_min_roi && orders > 0 && !isBoostActive) {
      try {
        const isLive = goal === 'LIVE_PROM_GOODS';
        // 统一使用 control_task/create（商品全域+直播全域通用）
        const boostRes = await api.createBoostTask(advertiserId, adId, config.boost_budget, config.boost_duration || 6, `自动起量-${adName}`);
        if (boostRes.code === 0) {
          boostActiveMap[boostKey] = { active: true, goal, taskId: boostRes.data?.id };
          const method = isLive ? '起量(直播)' : '起量(商品)';
          await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, ad_id, ad_name, action, action_detail) VALUES (?,?,?,?,?)',
            [advertiserId, String(adId), adName, 'boost_on', `ROI=${roi}≥保底${config.boost_min_roi}, 自动开启${method} 预算${config.boost_budget}元 时长${config.boost_duration || 6}h 任务ID=${boostRes.data?.id}`]
          ).catch(() => {});
          logger.info(`[Boost] ${adName} 开启${method} ROI=${roi} taskId=${boostRes.data?.id}`);
        } else {
          logger.warn(`[Boost] ${adName} 起量失败: ${boostRes.msg}`, { goal, roi });
        }
      } catch (e) {
        logger.error(`[Boost] ${adName} 开启起量失败`, { error: e.message });
      }
    } else if (roi < config.boost_min_roi && roi > 0 && isBoostActive) {
      try {
        const taskId = isBoostActive.taskId;
        if (taskId) {
          const stopRes = await api.stopBoostTask(advertiserId, taskId);
          if (stopRes.code === 0) {
            boostActiveMap[boostKey] = false;
            await db.query('INSERT INTO qc_pitcher_logs (advertiser_id, ad_id, ad_name, action, action_detail) VALUES (?,?,?,?,?)',
              [advertiserId, String(adId), adName, 'boost_off', `ROI=${roi}<保底${config.boost_min_roi}, 自动停止起量 任务ID=${taskId}`]
            ).catch(() => {});
            logger.info(`[Boost] ${adName} 停止起量 ROI=${roi} taskId=${taskId}`);
          }
        } else {
          boostActiveMap[boostKey] = false;
          logger.info(`[Boost] ${adName} 标记停止(无taskId) ROI=${roi}`);
        }
      } catch (e) {
        logger.error(`[Boost] ${adName} 关闭起量失败`, { error: e.message });
      }
    }
  }
}

/**
 * 差素材自动清理：基于素材维度报表，删除在投计划中表现差的素材
 * 规则：
 *   A: 消耗 >= clean_min_cost 且 ROI > 0 且 ROI < clean_bad_roi -- 花了钱但亏钱
 *   B: 消耗 >= clean_min_cost 且 成交=0 -- 花了钱零转化
 *   C: 曝光 >= clean_min_show 且 点击率 < clean_min_ctr -- 大量曝光无人点击
 * @param {string} advertiserId - 广告主ID
 */
async function runMaterialAutoClean(advertiserId) {
  const today = dayjs().format('YYYY-MM-DD');

  // 1. 读配置
  const [[config]] = await db.query('SELECT * FROM qc_pitcher_configs WHERE advertiser_id=?', [advertiserId]);
  if (!config) return { skipped: true, reason: '无配置' };

  const autoCleanEnabled = parseInt(config.material_auto_clean_enabled || 0);
  if (autoCleanEnabled !== 1) return { skipped: true, reason: '差素材自动清理未启用' };

  // 检查今天是否已执行过（内存级去重，手动触发时会绕过此检查）
  const lastCleanDate = lastAutoCleanDateMap[advertiserId];
  if (lastCleanDate === today) {
    return { skipped: true, reason: '今日已执行过自动清理' };
  }

  const cleanMinCost = parseFloat(config.material_clean_min_cost ?? 50);
  const cleanBadRoi = parseFloat(config.material_clean_bad_roi ?? 0.5);
  const cleanMinShow = parseInt(config.material_clean_min_show ?? 5000);
  const cleanDays = parseInt(config.material_clean_days ?? 3);
  const cleanMinOrders = parseInt(config.material_clean_min_orders ?? 0);
  const cleanMinCtr = parseFloat(config.material_clean_min_ctr ?? 0.5);
  // 解析启用的清理规则
  const cleanEnabledRules = (config.clean_enabled_rules || 'min_cost,bad_roi,low_order,min_show,low_ctr').split(',');
  const cleanRuleOn = (key) => cleanEnabledRules.includes(key);

  // 2. 获取token
  const [[account]] = await db.query('SELECT access_token FROM qc_accounts WHERE advertiser_id=? AND status=1', [advertiserId]);
  if (!account || !account.access_token) return { skipped: true, reason: 'token不可用' };

  const api = new QianChuanAPI(account.access_token);

  // 3. 拉取素材维度报表（前N天：即N天前及更早，不含最近N天，保护新素材）
  // 例: cleanDays=3, 今天4/7 → 查4/1~4/4（4/5、4/6、4/7的新素材不会被清理）
  const endDate = dayjs().subtract(cleanDays, 'day').format('YYYY-MM-DD');
  const startDate = dayjs().subtract(cleanDays + 29, 'day').format('YYYY-MM-DD');

  let materialReport;
  try {
    materialReport = await api.getVideoMaterialReport({ advertiserId, startDate, endDate });
  } catch (e) {
    logger.error(`[MaterialAutoClean] 拉取素材报表失败 ${advertiserId}`, { error: e.message });
    return { skipped: true, reason: '拉取素材报表失败: ' + e.message };
  }

  const materialList = materialReport.data?.rows || materialReport.rows || materialReport.data?.list || materialReport.list || [];
  logger.info(`[MaterialAutoClean] 账户${advertiserId} 获取到${materialList.length}条素材数据(近${cleanDays}天)`);

  // 4. 解析素材报表，识别差素材
  const v = (obj) => obj && typeof obj === 'object' ? (obj.Value !== undefined ? obj.Value : obj.ValueStr || '') : (obj || '');

  const badMaterialMap = {}; // material_id -> { reason, cost, roi, orders, video_name }

  for (const item of materialList) {
    const dims = item.dimensions || {};
    const mets = item.metrics || {};

    const matId = String(v(dims.material_id) || '');
    if (!matId) continue;

    const videoName = String(v(dims.roi2_material_video_name) || '');
    // Cost in material reports is already in 元 (NOT 微元)
    const cost = parseFloat(parseFloat(v(mets.stat_cost_for_roi2) || 0).toFixed(2));
    const orders = parseInt(v(mets.total_pay_order_count_for_roi2) || 0);
    const roi = parseFloat(parseFloat(v(mets.total_prepay_and_pay_order_roi2) || 0).toFixed(2));
    const showCount = parseInt(v(mets.product_show_count_for_roi2) || 0);
    const clickCount = parseInt(v(mets.product_click_count_for_roi2) || 0);
    const ctr = showCount > 0 ? (clickCount / showCount) * 100 : 0; // 百分比

    // 独立规则判定（满足任一启用规则即为差素材）
    const reasons = [];
    if (cleanRuleOn('min_cost') && cost < cleanMinCost) {
      reasons.push(`消耗¥${cost.toFixed(0)}<¥${cleanMinCost}`);
    }
    if (cleanRuleOn('bad_roi') && roi > 0 && roi < cleanBadRoi) {
      reasons.push(`ROI=${roi.toFixed(2)}<${cleanBadRoi}`);
    }
    if (cleanRuleOn('low_order') && orders <= cleanMinOrders) {
      reasons.push(`成交${orders}单≤${cleanMinOrders}单`);
    }
    if (cleanRuleOn('min_show') && showCount < cleanMinShow) {
      reasons.push(`曝光${showCount}<${cleanMinShow}`);
    }
    if (cleanRuleOn('low_ctr') && ctr < cleanMinCtr) {
      reasons.push(`点击率${ctr.toFixed(2)}%<${cleanMinCtr}%`);
    }

    if (reasons.length) {
      badMaterialMap[matId] = { reason: `近${cleanDays}天: ${reasons.join(', ')}`, cost, roi, orders, video_name: videoName };
    }
  }

  const badMaterialIds = Object.keys(badMaterialMap);
  if (badMaterialIds.length === 0) {
    lastAutoCleanDateMap[advertiserId] = today;
    logger.info(`[MaterialAutoClean] 账户${advertiserId} 无符合条件的差素材`);
    return { advertiser_id: advertiserId, active_ads: 0, clean_count: 0, details: [] };
  }

  logger.info(`[MaterialAutoClean] 账户${advertiserId} 发现${badMaterialIds.length}个差素材，开始从计划中清理`);

  // 5. 获取所有在投计划
  let adList = [];
  const goals = ['VIDEO_PROM_GOODS', 'LIVE_PROM_GOODS'];
  for (const goal of goals) {
    let page = 1;
    while (true) {
      const res = await api.getUniPromotionAdList({ advertiserId, marketingGoal: goal, page, pageSize: 100 });
      const list = res.data?.ad_list || [];
      adList = adList.concat(list);
      const total = res.data?.page_info?.total_num || res.data?.page_info?.total_number || 0;
      if (page * 100 >= total) break;
      page++;
    }
  }

  const activeAds = adList.filter(ad => {
    const status = (ad.ad_info || {}).status;
    return status === 'DELIVERY_OK' || status === 'AD_STATUS_DELIVERY_OK';
  });

  if (activeAds.length === 0) {
    lastAutoCleanDateMap[advertiserId] = today;
    return { advertiser_id: advertiserId, active_ads: 0, clean_count: 0, details: [] };
  }

  const results = [];
  let totalCleanCount = 0;

  // 6. 对每个在投计划，检查其素材是否在差素材列表中
  for (const ad of activeAds) {
    const adInfo = ad.ad_info || {};
    const adId = String(adInfo.id);
    const adName = adInfo.name || adId;

    let materials = [];
    try {
      materials = await api.getMaterialsInPlan(advertiserId, adId);
    } catch (e) {
      logger.warn(`[MaterialAutoClean] 获取计划${adId}素材失败`, { error: e.message });
      continue;
    }

    if (materials.length === 0) continue;

    // 找出该计划中属于差素材的
    const toDelete = [];
    for (const m of materials) {
      const mId = String(m.material_id || '');
      if (badMaterialMap[mId]) {
        toDelete.push({ ...m, ...badMaterialMap[mId], material_id: mId });
      }
    }

    if (toDelete.length === 0) continue;

    // 安全边界：不删除超过50%的素材（避免清空计划）
    const maxDelete = Math.floor(materials.length * 0.5);
    let finalDelete = toDelete;
    if (toDelete.length > maxDelete && maxDelete > 0) {
      logger.warn(`[MaterialAutoClean] 计划${adId}差素材占比过高(${toDelete.length}/${materials.length})，限制删除${maxDelete}个`);
      // 按消耗从高到低排序，优先删消耗高的差素材
      finalDelete = toDelete.sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, maxDelete);
    } else if (maxDelete === 0 && materials.length > 0) {
      logger.warn(`[MaterialAutoClean] 计划${adId}只有${materials.length}个素材，跳过清理避免清空`);
      continue;
    }

    // 批量删除
    const deleteIds = finalDelete.map(m => m.material_id).filter(Boolean);
    if (deleteIds.length === 0) continue;

    try {
      const apiRes = await api.deleteMaterialFromPlan(advertiserId, adId, deleteIds);
      const result = apiRes.code === 0 ? 'success' : 'fail';

      // 逐条记录日志
      for (const m of finalDelete) {
        await db.query(
          `INSERT INTO qc_material_clean_logs (advertiser_id, ad_id, ad_name, material_id, video_name, cost, roi, orders, reason)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [advertiserId, adId, adName, m.material_id, m.video_name || '', m.cost || 0, m.roi || 0, m.orders || 0, m.reason]
        ).catch(e => logger.error('[MaterialAutoClean] 写日志失败', { error: e.message }));

        results.push({
          ad_id: adId, ad_name: adName,
          material_id: m.material_id,
          video_name: m.video_name || '',
          cost: m.cost, roi: m.roi, orders: m.orders,
          reason: m.reason,
          result
        });
      }

      if (result === 'success') totalCleanCount += deleteIds.length;

      logger.info(`[MaterialAutoClean] 计划${adName}: 清理${deleteIds.length}个差素材 ${result}`);
    } catch (e) {
      logger.error(`[MaterialAutoClean] 删除计划${adId}素材失败`, { error: e.message });
      for (const m of finalDelete) {
        await db.query(
          `INSERT INTO qc_material_clean_logs (advertiser_id, ad_id, ad_name, material_id, video_name, cost, roi, orders, reason)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [advertiserId, adId, adName, m.material_id, m.video_name || '', m.cost || 0, m.roi || 0, m.orders || 0, `${m.reason} [删除失败:${e.message}]`]
        ).catch(() => {});
      }
    }

    // 限流
    await new Promise(r => setTimeout(r, 300));
  }

  lastAutoCleanDateMap[advertiserId] = today;
  logger.info(`[MaterialAutoClean] 账户${advertiserId} 清理完成: 共清理${totalCleanCount}个差素材`);

  return {
    advertiser_id: advertiserId,
    active_ads: activeAds.length,
    clean_count: totalCleanCount,
    details: results
  };
}

/**
 * 素材追投：基于素材报表筛选爆款素材，自动创建追投任务
 * 规则可配置：ROI、转化数、CTR、曝光数等，支持组合
 */
async function runMaterialBoost(advertiserId) {
  const [[config]] = await db.query('SELECT * FROM qc_pitcher_configs WHERE advertiser_id=?', [advertiserId]);
  if (!config) return { skipped: true, reason: '无配置' };
  if (!parseInt(config.mat_boost_enabled)) return { skipped: true, reason: '素材追投未启用' };

  const [[account]] = await db.query('SELECT access_token FROM qc_accounts WHERE advertiser_id=? AND status=1', [advertiserId]);
  if (!account || !account.access_token) return { skipped: true, reason: 'token不可用' };

  const api = new QianChuanAPI(account.access_token);
  const today = dayjs().format('YYYY-MM-DD');

  // 解析规则
  let rules = [];
  try {
    rules = typeof config.mat_boost_rules === 'string' ? JSON.parse(config.mat_boost_rules || '[]') : (config.mat_boost_rules || []);
  } catch (e) { rules = []; }
  if (!rules.length) return { skipped: true, reason: '未配置追投规则' };

  const budget = parseFloat(config.mat_boost_budget || 200);
  const duration = parseFloat(config.mat_boost_duration || 6);

  // 获取素材报表
  let allRows = [];
  let page = 1;
  while (true) {
    const report = await api.getVideoMaterialReport({ advertiserId, startDate: today, endDate: today, page, pageSize: 100 });
    const rows = report.data?.rows || [];
    allRows = allRows.concat(rows);
    const totalNum = report.data?.page_info?.total_number || 0;
    if (page * 100 >= totalNum || rows.length === 0) break;
    page++;
  }

  logger.info(`[MatBoost] 账户${advertiserId} 获取到${allRows.length}条素材数据`);
  if (!allRows.length) return { skipped: true, reason: '无素材数据' };

  const v = (obj) => obj && typeof obj === 'object' ? (obj.Value !== undefined ? obj.Value : obj.ValueStr || '') : (obj || '');

  // 筛选符合条件的素材
  const qualified = [];
  for (const item of allRows) {
    const dims = item.dimensions || {};
    const mets = item.metrics || {};
    const matId = String(v(dims.material_id) || '');
    if (!matId) continue;

    const videoName = String(v(dims.roi2_material_video_name) || '');
    const cost = parseFloat(v(mets.stat_cost_for_roi2) || 0);
    const roi = parseFloat(v(mets.total_prepay_and_pay_order_roi2) || 0);
    const orders = parseInt(v(mets.total_pay_order_count_for_roi2) || 0);
    const showCount = parseInt(v(mets.product_show_count_for_roi2) || 0);
    const clickCount = parseInt(v(mets.product_click_count_for_roi2) || 0);
    const ctr = showCount > 0 ? parseFloat(((clickCount / showCount) * 100).toFixed(2)) : 0;
    const gmv = parseFloat(v(mets.total_pay_order_gmv_for_roi2) || 0);
    const gpm = showCount > 0 ? parseFloat(((gmv / showCount) * 1000).toFixed(0)) : 0;

    // 检查所有启用的规则是否都满足（AND逻辑）
    let allPass = true;
    const matchDetails = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      let pass = true;
      switch (rule.key) {
        case 'min_roi':
          pass = roi >= parseFloat(rule.value || 0);
          if (pass) matchDetails.push(`ROI=${roi}≥${rule.value}`);
          break;
        case 'min_orders':
          pass = orders >= parseInt(rule.value || 0);
          if (pass) matchDetails.push(`成交${orders}≥${rule.value}`);
          break;
        case 'min_cost':
          pass = cost >= parseFloat(rule.value || 0);
          if (pass) matchDetails.push(`消耗¥${cost.toFixed(0)}≥¥${rule.value}`);
          break;
        case 'min_ctr':
          pass = ctr >= parseFloat(rule.value || 0);
          if (pass) matchDetails.push(`CTR=${ctr.toFixed(2)}%≥${rule.value}%`);
          break;
        case 'min_show':
          pass = showCount >= parseInt(rule.value || 0);
          if (pass) matchDetails.push(`曝光${showCount}≥${rule.value}`);
          break;
        case 'min_gpm':
          pass = gpm >= parseFloat(rule.value || 0);
          if (pass) matchDetails.push(`GPM=${gpm}≥${rule.value}`);
          break;
        default:
          break;
      }
      if (!pass) { allPass = false; break; }
    }
    if (!allPass) continue;
    qualified.push({ matId, videoName, cost, roi, orders, ctr, showCount, gpm, matchDetails });
  }

  logger.info(`[MatBoost] 账户${advertiserId} 符合追投条件的素材: ${qualified.length}个`);
  if (!qualified.length) {
    // 写一条执行记录，显示每条规则的通过情况
    const ruleNames = rules.filter(r => r.enabled).map(r => {
      const cnt = allRows.filter(item => {
        const mets = item.metrics || {};
        const val = parseFloat(v(mets[{min_roi:'total_prepay_and_pay_order_roi2',min_orders:'total_pay_order_count_for_roi2',min_cost:'stat_cost_for_roi2',min_ctr:'product_click_count_for_roi2',min_show:'product_show_count_for_roi2',min_gpm:'total_pay_order_gmv_for_roi2'}[r.key]] || '') || 0);
        if (r.key === 'min_roi') return val >= parseFloat(r.value);
        if (r.key === 'min_orders') return val >= parseInt(r.value);
        if (r.key === 'min_cost') return val >= parseFloat(r.value);
        return true;
      }).length;
      return `${r.key}≥${r.value}:${cnt}个通过`;
    }).join('，');

    // 0个达标时，也要巡检已追投素材并关闭不达标的
    let stopCount = 0;
    const stopDetails = [];
    try {
      const [boostLogs] = await db.query(
        `SELECT DISTINCT task_id, material_id, ad_id, ad_name, video_name
         FROM qc_material_boost_logs
         WHERE advertiser_id=? AND task_id!='' AND created_at>=CURDATE()
           AND reason NOT LIKE '%已关闭%' AND reason NOT LIKE '%不达标关闭%'`,
        [advertiserId]
      );
      if (boostLogs.length) {
        // 构建素材报表数据map
        const matMetricsMap = {};
        for (const item of allRows) {
          const dims = item.dimensions || {};
          const mets = item.metrics || {};
          const matId = String(v(dims.material_id) || '');
          if (!matId) continue;
          const costVal = parseFloat(v(mets.stat_cost_for_roi2) || 0);
          const roiVal = parseFloat(v(mets.total_prepay_and_pay_order_roi2) || 0);
          const ordersVal = parseInt(v(mets.total_pay_order_count_for_roi2) || 0);
          const showVal = parseInt(v(mets.product_show_count_for_roi2) || 0);
          const clickVal = parseInt(v(mets.product_click_count_for_roi2) || 0);
          const ctrVal = showVal > 0 ? parseFloat(((clickVal / showVal) * 100).toFixed(2)) : 0;
          const gmvVal = parseFloat(v(mets.total_pay_order_gmv_for_roi2) || 0);
          const gpmVal = showVal > 0 ? parseFloat(((gmvVal / showVal) * 1000).toFixed(0)) : 0;
          matMetricsMap[matId] = { cost: costVal, roi: roiVal, orders: ordersVal, showCount: showVal, ctr: ctrVal, gpm: gpmVal };
        }
        for (const log of boostLogs) {
          const matId = String(log.material_id);
          const metrics = matMetricsMap[matId];
          const failReasons = [];
          if (metrics) {
            for (const rule of rules) {
              if (!rule.enabled) continue;
              switch (rule.key) {
                case 'min_roi': if (metrics.roi < parseFloat(rule.value || 0)) failReasons.push(`ROI=${metrics.roi}<${rule.value}`); break;
                case 'min_orders': if (metrics.orders < parseInt(rule.value || 0)) failReasons.push(`成交${metrics.orders}<${rule.value}`); break;
                case 'min_cost': if (metrics.cost < parseFloat(rule.value || 0)) failReasons.push(`消耗¥${metrics.cost.toFixed(0)}<¥${rule.value}`); break;
                case 'min_ctr': if (metrics.ctr < parseFloat(rule.value || 0)) failReasons.push(`CTR=${metrics.ctr.toFixed(2)}%<${rule.value}%`); break;
                case 'min_show': if (metrics.showCount < parseInt(rule.value || 0)) failReasons.push(`曝光${metrics.showCount}<${rule.value}`); break;
                case 'min_gpm': if (metrics.gpm < parseFloat(rule.value || 0)) failReasons.push(`GPM=${metrics.gpm}<${rule.value}`); break;
              }
            }
          } else {
            failReasons.push('素材无报表数据');
          }
          if (!failReasons.length) continue; // 虽然0个同时达标，但单条无具体失败原因则跳过
          try {
            const stopRes = await api.stopBoostTask(advertiserId, log.task_id);
            if (stopRes.code === 0) {
              stopCount++;
              const reason = `不达标关闭: ${failReasons.join(', ')}`;
              await db.query(
                `INSERT INTO qc_material_boost_logs (advertiser_id, ad_id, ad_name, material_id, video_name, cost, roi, orders, ctr, show_cnt, budget, task_id, reason)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [advertiserId, log.ad_id, log.ad_name, matId, log.video_name,
                 metrics?.cost || 0, metrics?.roi || 0, metrics?.orders || 0, metrics?.ctr || 0, metrics?.showCount || 0,
                 0, log.task_id, reason]
              ).catch(() => {});
              stopDetails.push(`${log.video_name?.substring(0, 15)}(${failReasons.join(',')})`);
              logger.info(`[MatBoost] 关闭追投 ${log.video_name} taskId=${log.task_id} 原因: ${reason}`);
            }
          } catch (e) {
            logger.error(`[MatBoost] 关闭追投异常 taskId=${log.task_id}`, { error: e.message });
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (e) {
      logger.error(`[MatBoost] 0达标巡检关闭异常`, { error: e.message });
    }

    let summaryMsg = `检查${allRows.length}个素材，0个同时达标。${ruleNames}`;
    if (stopCount > 0) {
      summaryMsg += `｜关闭不达标追投${stopCount}个: ${stopDetails.join('；')}`;
    }
    await db.query(
      'INSERT INTO qc_material_boost_logs (advertiser_id, ad_id, ad_name, material_id, video_name, reason) VALUES (?,?,?,?,?,?)',
      [advertiserId, '', '执行汇总', '', '', summaryMsg]
    ).catch(() => {});
    return { advertiser_id: advertiserId, boost_count: 0, stop_count: stopCount, qualified: 0, reason: '无符合条件的素材' };
  }

  // 获取在投计划列表（用于给素材找到所属计划）
  let adList = [];
  for (const goal of ['VIDEO_PROM_GOODS', 'LIVE_PROM_GOODS']) {
    let pg = 1;
    while (true) {
      const res = await api.getUniPromotionAdList({ advertiserId, marketingGoal: goal, page: pg, pageSize: 100 });
      const list = res.data?.ad_list || [];
      adList = adList.concat(list);
      const total = res.data?.page_info?.total_num || res.data?.page_info?.total_number || 0;
      if (pg * 100 >= total) break;
      pg++;
    }
  }

  const activeAds = adList.filter(ad => {
    const s = ad.ad_info?.status;
    return s === 'DELIVERY_OK' || s === 'AD_STATUS_DELIVERY_OK';
  });

  if (!activeAds.length) {
    await db.query(
      'INSERT INTO qc_material_boost_logs (advertiser_id, ad_id, ad_name, material_id, video_name, reason) VALUES (?,?,?,?,?,?)',
      [advertiserId, '', '手动执行', '', '', `${qualified.length}个达标素材，但无在投计划可追投`]
    ).catch(() => {});
    return { advertiser_id: advertiserId, boost_count: 0, reason: '无在投计划' };
  }

  // 对每个在投计划的每个达标素材创建追投任务
  const results = [];
  let boostCount = 0;
  const todayKey = today;
  const planSummary = []; // 每个计划的追投结果

  for (const ad of activeAds) {
    const adInfo = ad.ad_info || {};
    const adId = String(adInfo.id);
    const adName = adInfo.name || adId;
    let planSuccess = 0, planSkip = 0, planFail = 0;

    for (const mat of qualified) {
      const boostKey = `${advertiserId}_${mat.matId}_${adId}_${todayKey}`;
      if (matBoostActiveMap[boostKey]) { planSkip++; continue; }

      try {
        const bodyStr = JSON.stringify({
          advertiser_id: parseInt(advertiserId),
          ad_id: parseInt(adId),
          scene: 'MATERIAL_ADD_BUDGET',
          name: `追投-${mat.videoName.substring(0, 15)}`,
          budget,
          duration,
          material_ids: [mat.matId]
        }).replace(`"${mat.matId}"`, mat.matId);

        const axios = require('axios');
        const res = await axios.post('https://ad.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/ad/control_task/create/', bodyStr, {
          headers: { 'Access-Token': account.access_token, 'Content-Type': 'application/json' },
          timeout: 30000
        });
        const data = res.data;

        if (data.code === 0) {
          matBoostActiveMap[boostKey] = true;
          boostCount++;
          planSuccess++;
          const reason = mat.matchDetails.join(', ');
          await db.query(
            `INSERT INTO qc_material_boost_logs (advertiser_id, ad_id, ad_name, material_id, video_name, cost, roi, orders, ctr, show_cnt, budget, task_id, reason)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [advertiserId, adId, adName, mat.matId, mat.videoName, mat.cost, mat.roi, mat.orders, mat.ctr, mat.showCount, budget, String(data.data?.id || ''), reason]
          ).catch(e => logger.error('[MatBoost] 写日志失败', { error: e.message }));
          logger.info(`[MatBoost] ${adName} 追投素材 ${mat.videoName.substring(0, 20)} 预算¥${budget} taskId=${data.data?.id}`);
          results.push({ ad_id: adId, ad_name: adName, material_id: mat.matId, video_name: mat.videoName, task_id: data.data?.id });
        } else {
          planFail++;
          if (!data.message?.includes('请勿重复') && !data.message?.includes('素材校验不通过')) {
            logger.warn(`[MatBoost] ${adName} 追投失败: ${data.message}`, { matId: mat.matId });
          }
        }
      } catch (e) {
        planFail++;
        logger.error(`[MatBoost] 追投失败 ${adName}`, { error: e.message });
      }
      await new Promise(r => setTimeout(r, 300));
    }
    planSummary.push(`${adName}:成功${planSuccess}/不匹配${planFail}/已追${planSkip}`);
    logger.info(`[MatBoost] 计划[${adName}] 成功${planSuccess} 不匹配${planFail} 已追投${planSkip}`);
  }

  // ===== 巡检已追投素材：不符合条件的关闭追投任务 =====
  let stopCount = 0;
  const stopDetails = [];
  try {
    // 查询今天所有有task_id的追投记录（排除汇总记录和已关闭的）
    const [boostLogs] = await db.query(
      `SELECT DISTINCT task_id, material_id, ad_id, ad_name, video_name
       FROM qc_material_boost_logs
       WHERE advertiser_id=? AND task_id!='' AND created_at>=CURDATE()
         AND reason NOT LIKE '%已关闭%' AND reason NOT LIKE '%不达标关闭%'`,
      [advertiserId]
    );

    if (boostLogs.length) {
      // 构建素材报表数据的快速查找map: material_id -> metrics
      const matMetricsMap = {};
      for (const item of allRows) {
        const dims = item.dimensions || {};
        const mets = item.metrics || {};
        const matId = String(v(dims.material_id) || '');
        if (!matId) continue;
        const cost = parseFloat(v(mets.stat_cost_for_roi2) || 0);
        const roi = parseFloat(v(mets.total_prepay_and_pay_order_roi2) || 0);
        const orders = parseInt(v(mets.total_pay_order_count_for_roi2) || 0);
        const showCount = parseInt(v(mets.product_show_count_for_roi2) || 0);
        const clickCount = parseInt(v(mets.product_click_count_for_roi2) || 0);
        const ctr = showCount > 0 ? parseFloat(((clickCount / showCount) * 100).toFixed(2)) : 0;
        const gmv = parseFloat(v(mets.total_pay_order_gmv_for_roi2) || 0);
        const gpm = showCount > 0 ? parseFloat(((gmv / showCount) * 1000).toFixed(0)) : 0;
        matMetricsMap[matId] = { cost, roi, orders, showCount, clickCount, ctr, gmv, gpm };
      }

      // 已经通过qualified筛选的素材ID集合（这些不需要关闭）
      const qualifiedMatIds = new Set(qualified.map(q => q.matId));

      for (const log of boostLogs) {
        const matId = String(log.material_id);
        // 如果素材仍然达标，跳过
        if (qualifiedMatIds.has(matId)) continue;

        // 该素材不在达标列表中，检查具体原因
        const metrics = matMetricsMap[matId];
        const failReasons = [];
        if (metrics) {
          for (const rule of rules) {
            if (!rule.enabled) continue;
            let pass = true;
            switch (rule.key) {
              case 'min_roi': pass = metrics.roi >= parseFloat(rule.value || 0); if (!pass) failReasons.push(`ROI=${metrics.roi}<${rule.value}`); break;
              case 'min_orders': pass = metrics.orders >= parseInt(rule.value || 0); if (!pass) failReasons.push(`成交${metrics.orders}<${rule.value}`); break;
              case 'min_cost': pass = metrics.cost >= parseFloat(rule.value || 0); if (!pass) failReasons.push(`消耗¥${metrics.cost.toFixed(0)}<¥${rule.value}`); break;
              case 'min_ctr': pass = metrics.ctr >= parseFloat(rule.value || 0); if (!pass) failReasons.push(`CTR=${metrics.ctr.toFixed(2)}%<${rule.value}%`); break;
              case 'min_show': pass = metrics.showCount >= parseInt(rule.value || 0); if (!pass) failReasons.push(`曝光${metrics.showCount}<${rule.value}`); break;
              case 'min_gpm': pass = metrics.gpm >= parseFloat(rule.value || 0); if (!pass) failReasons.push(`GPM=${metrics.gpm}<${rule.value}`); break;
            }
          }
        } else {
          failReasons.push('素材无报表数据');
        }

        // 调API关闭追投任务
        try {
          const stopRes = await api.stopBoostTask(advertiserId, log.task_id);
          if (stopRes.code === 0) {
            stopCount++;
            const reason = `不达标关闭: ${failReasons.join(', ') || '不满足规则'}`;
            await db.query(
              `INSERT INTO qc_material_boost_logs (advertiser_id, ad_id, ad_name, material_id, video_name, cost, roi, orders, ctr, show_cnt, budget, task_id, reason)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [advertiserId, log.ad_id, log.ad_name, matId, log.video_name,
               metrics?.cost || 0, metrics?.roi || 0, metrics?.orders || 0, metrics?.ctr || 0, metrics?.showCount || 0,
               0, log.task_id, reason]
            ).catch(() => {});
            stopDetails.push(`${log.video_name?.substring(0, 15)}(${failReasons.join(',')})`);
            logger.info(`[MatBoost] 关闭追投 ${log.video_name} taskId=${log.task_id} 原因: ${reason}`);
          } else {
            logger.warn(`[MatBoost] 关闭追投失败 taskId=${log.task_id}: ${stopRes.msg}`);
          }
        } catch (e) {
          logger.error(`[MatBoost] 关闭追投异常 taskId=${log.task_id}`, { error: e.message });
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }
  } catch (e) {
    logger.error(`[MatBoost] 巡检关闭逻辑异常`, { error: e.message });
  }

  // 写一条汇总记录到日志表
  let summaryText = `检查${allRows.length}个素材→${qualified.length}个达标，${activeAds.length}个计划尝试追投，成功${boostCount}个。${planSummary.join('；')}`;
  if (stopCount > 0) {
    summaryText += `｜关闭不达标追投${stopCount}个: ${stopDetails.join('；')}`;
  }
  await db.query(
    'INSERT INTO qc_material_boost_logs (advertiser_id, ad_id, ad_name, material_id, video_name, reason) VALUES (?,?,?,?,?,?)',
    [advertiserId, '', '执行汇总', '', '', summaryText]
  ).catch(() => {});

  logger.info(`[MatBoost] 账户${advertiserId} 追投完成: 成功${boostCount}个, 关闭${stopCount}个`);
  return { advertiser_id: advertiserId, qualified: qualified.length, boost_count: boostCount, stop_count: stopCount, details: results };
}

/**
 * 定时任务入口：检查所有启用的账户
 */
async function checkAll() {
  try {
    // 查询所有开启了任一功能的账户
    const [configs] = await db.query('SELECT advertiser_id, poll_interval, enabled, material_auto_clean_enabled, boost_enabled, boost_poll_interval, mat_boost_enabled, mat_boost_poll_interval FROM qc_pitcher_configs WHERE enabled=1 OR material_auto_clean_enabled=1 OR boost_enabled=1 OR mat_boost_enabled=1');
    if (!configs.length) return;

    const now = Date.now();
    for (const cfg of configs) {
      const key = cfg.advertiser_id;

      // 计划管理：按计划巡检间隔执行
      if (cfg.enabled) {
        const interval = (cfg.poll_interval || 60) * 60 * 1000;
        const lastRun = lastRunMap[key] || 0;
        if (now - lastRun >= interval) {
          lastRunMap[key] = now;
          try {
            await runOnce(cfg.advertiser_id);
          } catch (e) {
            logger.error(`[Pitcher] 账户${key}执行失败`, { error: e.message, stack: e.stack });
          }
        }
      }

      // 一键调速：独立巡检间隔，不依赖计划管理启动
      if (cfg.boost_enabled && !cfg.enabled) {
        // 计划管理未启动时，调速需要独立触发
        const boostInterval = (cfg.boost_poll_interval || 60) * 60 * 1000;
        const lastBoost = lastBoostRunMap[key] || 0;
        if (now - lastBoost >= boostInterval) {
          lastBoostRunMap[key] = now;
          try {
            await runBoostOnly(cfg.advertiser_id);
          } catch (e) {
            logger.error(`[Boost] 账户${key}独立调速失败`, { error: e.message });
          }
        }
      }

      // 差素材清理：独立执行，不依赖计划管理启动
      if (cfg.material_auto_clean_enabled) {
        try {
          await runMaterialAutoClean(cfg.advertiser_id);
        } catch (e) {
          logger.error(`[MaterialAutoClean] 账户${key}执行失败`, { error: e.message, stack: e.stack });
        }
      }

      // 素材追投：独立执行
      if (cfg.mat_boost_enabled) {
        const matBoostInterval = (cfg.mat_boost_poll_interval || 60) * 60 * 1000;
        const lastMatBoost = lastMatBoostRunMap[key] || 0;
        if (now - lastMatBoost >= matBoostInterval) {
          lastMatBoostRunMap[key] = now;
          try {
            await runMaterialBoost(cfg.advertiser_id);
          } catch (e) {
            logger.error(`[MatBoost] 账户${key}执行失败`, { error: e.message, stack: e.stack });
          }
        }
      }
    }
  } catch (e) {
    logger.error('[Pitcher] checkAll failed', { error: e.message });
  }
}

module.exports = { runOnce, checkAll, runMaterialAutoClean, runBoostOnly, runMaterialBoost };
