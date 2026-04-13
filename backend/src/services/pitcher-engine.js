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

  const cleanMinCost = parseFloat(config.material_clean_min_cost || 50);
  const cleanBadRoi = parseFloat(config.material_clean_bad_roi || 0.5);
  const cleanMinShow = parseInt(config.material_clean_min_show || 5000);
  const cleanDays = parseInt(config.material_clean_days || 3);
  const cleanMinOrders = parseInt(config.material_clean_min_orders || 0);
  const cleanMinCtr = parseFloat(config.material_clean_min_ctr || 0.5);

  // 2. 获取token
  const [[account]] = await db.query('SELECT access_token FROM qc_accounts WHERE advertiser_id=? AND status=1', [advertiserId]);
  if (!account || !account.access_token) return { skipped: true, reason: 'token不可用' };

  const api = new QianChuanAPI(account.access_token);

  // 3. 拉取素材维度报表（过去N天）
  const startDate = dayjs().subtract(cleanDays - 1, 'day').format('YYYY-MM-DD');
  const endDate = today;

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

    let reason = '';

    // 规则A: 消耗达标且ROI低于阈值（花了钱但亏钱）
    if (cost >= cleanMinCost && roi > 0 && roi < cleanBadRoi) {
      reason = `规则A: 近${cleanDays}天消耗¥${cost.toFixed(0)}>=¥${cleanMinCost}, ROI=${roi.toFixed(2)}<${cleanBadRoi}(花钱亏钱)`;
    }
    // 规则B: 消耗达标且零成交（花了钱零转化）
    else if (cost >= cleanMinCost && orders <= cleanMinOrders) {
      reason = `规则B: 近${cleanDays}天消耗¥${cost.toFixed(0)}>=¥${cleanMinCost}, 成交${orders}单<=${cleanMinOrders}单(低转化)`;
    }
    // 规则C: 曝光达标且点击率过低（大量曝光无人点击）
    else if (showCount >= cleanMinShow && ctr < cleanMinCtr) {
      reason = `规则C: 近${cleanDays}天曝光${showCount}>=${cleanMinShow}, 点击率${ctr.toFixed(2)}%<${cleanMinCtr}%(无人点击)`;
    }

    if (reason) {
      badMaterialMap[matId] = { reason, cost, roi, orders, video_name: videoName };
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
 * 定时任务入口：检查所有启用的账户
 */
async function checkAll() {
  try {
    const [configs] = await db.query('SELECT advertiser_id, poll_interval FROM qc_pitcher_configs WHERE enabled=1');
    if (!configs.length) return;

    const now = Date.now();
    for (const cfg of configs) {
      const key = cfg.advertiser_id;
      const interval = (cfg.poll_interval || 60) * 60 * 1000;
      const lastRun = lastRunMap[key] || 0;

      if (now - lastRun >= interval) {
        lastRunMap[key] = now;
        try {
          await runOnce(cfg.advertiser_id);
        } catch (e) {
          logger.error(`[Pitcher] 账户${key}执行失败`, { error: e.message, stack: e.stack });
        }

        // 执行差素材自动清理
        try {
          await runMaterialAutoClean(cfg.advertiser_id);
        } catch (e) {
          logger.error(`[MaterialAutoClean] 账户${key}执行失败`, { error: e.message, stack: e.stack });
        }
      }
    }
  } catch (e) {
    logger.error('[Pitcher] checkAll failed', { error: e.message });
  }
}

module.exports = { runOnce, checkAll, runMaterialAutoClean };
