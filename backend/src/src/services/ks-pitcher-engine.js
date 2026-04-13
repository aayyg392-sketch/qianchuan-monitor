/**
 * 快手磁力 AI金牌投手 - 核心引擎
 * 基于快手磁力广告API，自动分析账户/计划数据，放大盈利、止损亏损
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');

const BASE = 'https://ad.e.kuaishou.com/rest/openapi';
const lastRunMap = {};

async function ksApi(path, token, data, method = 'POST') {
  try {
    const opts = { headers: { 'Access-Token': token, 'Content-Type': 'application/json' }, timeout: 15000 };
    const res = method === 'GET'
      ? await axios.get(`${BASE}${path}`, { ...opts, params: data })
      : await axios.post(`${BASE}${path}`, data, opts);
    return res.data;
  } catch (e) {
    return { code: -1, message: e.message, data: {} };
  }
}

/**
 * 对单个快手广告账户执行一次AI投手逻辑
 */
async function runOnce(advertiserId) {
  const [[config]] = await db.query('SELECT * FROM ks_pitcher_configs WHERE advertiser_id=?', [advertiserId]);
  if (!config) return { skipped: true, reason: '无配置' };

  const [[account]] = await db.query('SELECT access_token FROM ks_ad_accounts WHERE advertiser_id=? AND status=1', [advertiserId]);
  if (!account?.access_token) return { skipped: true, reason: 'token不可用' };

  const token = account.access_token;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 获取今日账户报表
  const reportRes = await ksApi('/v1/report/account_report', token, {
    advertiser_id: Number(advertiserId),
    start_date: today, end_date: today,
    temporal_granularity: 'DAILY', page: 1, page_size: 10,
  });

  // 获取昨日对比数据
  const ydRes = await ksApi('/v1/report/account_report', token, {
    advertiser_id: Number(advertiserId),
    start_date: yesterday, end_date: yesterday,
    temporal_granularity: 'DAILY', page: 1, page_size: 10,
  });

  const todayData = reportRes.code === 0 ? (reportRes.data?.details?.[0] || {}) : {};
  const ydData = ydRes.code === 0 ? (ydRes.data?.details?.[0] || {}) : {};

  const cost = todayData.charge || 0;
  const gmv = todayData.event_order_paid_purchase_amount || 0;
  const roi = todayData.event_order_amount_roi || (cost > 0 ? gmv / cost : 0);
  const orders = todayData.conversion_num || 0;
  const showCnt = todayData.show || 0;
  const clickCnt = todayData.bclick || 0;
  const cvr = clickCnt > 0 ? (orders / clickCnt * 100) : 0;

  const ydCost = ydData.charge || 0;
  const ydRoi = ydData.event_order_amount_roi || 0;
  const ydOrders = ydData.conversion_num || 0;

  // 尝试获取广告计划列表
  let campaigns = [];
  let campaignError = '';
  try {
    await new Promise(r => setTimeout(r, 500));
    const campRes = await ksApi('/v1/campaign/list', token, {
      advertiser_id: Number(advertiserId), page: 1, page_size: 50,
    });
    if (campRes.code === 0 && campRes.data?.details) {
      campaigns = campRes.data.details;
    } else {
      campaignError = campRes.message || '无法获取计划列表';
    }
  } catch (e) { campaignError = e.message; }

  const results = [];
  let scaleUpCount = 0, scaleDownCount = 0, holdCount = 0;

  if (campaigns.length > 0) {
    // 有计划数据，逐计划分析
    for (const camp of campaigns) {
      const campId = camp.campaign_id;
      const campName = camp.campaign_name || String(campId);
      const campBudget = camp.day_budget || 0;
      const campStatus = camp.put_status;

      // 获取计划级别报表
      let campCost = 0, campGmv = 0, campRoi = 0, campOrders = 0;
      try {
        await new Promise(r => setTimeout(r, 300));
        const crRes = await ksApi('/v1/report/campaign_report', token, {
          advertiser_id: Number(advertiserId),
          start_date: today, end_date: today,
          temporal_granularity: 'DAILY',
          campaign_ids: [campId],
          page: 1, page_size: 10,
        });
        if (crRes.code === 0 && crRes.data?.details?.length) {
          const d = crRes.data.details[0];
          campCost = d.charge || 0;
          campGmv = d.event_order_paid_purchase_amount || 0;
          campRoi = d.event_order_amount_roi || (campCost > 0 ? campGmv / campCost : 0);
          campOrders = d.conversion_num || 0;
        }
      } catch (e) { /* skip */ }

      if (campCost < config.min_cost) continue;

      let action = 'hold', actionDetail = '';
      if (campRoi >= config.min_roi && campOrders > 0) {
        action = 'scale_up'; scaleUpCount++;
        actionDetail = `放大: ROI=${(+campRoi).toFixed(2)}≥${config.min_roi}, ${campOrders}单, 消耗¥${campCost.toFixed(0)}, 建议提高预算${config.budget_multiply}倍`;
      } else if ((campRoi < config.stop_roi && campRoi > 0) || (campCost >= config.min_cost * 3 && campOrders === 0)) {
        action = 'scale_down'; scaleDownCount++;
        actionDetail = `止损: ROI=${(+campRoi).toFixed(2)}<${config.stop_roi}, ${campOrders}单, 消耗¥${campCost.toFixed(0)}, 建议降低预算或暂停`;
      } else {
        action = 'hold'; holdCount++;
        actionDetail = `观察: ROI=${(+campRoi).toFixed(2)}, ${campOrders}单, 消耗¥${campCost.toFixed(0)}`;
      }

      await db.query(
        `INSERT INTO ks_pitcher_logs (advertiser_id, ad_id, ad_name, cost, roi, cvr, gmv, orders, show_cnt, click_cnt, action, action_detail, old_budget, new_budget)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [advertiserId, String(campId), campName, campCost, +Number(campRoi).toFixed(2), 0, campGmv, campOrders, 0, 0, action, actionDetail, campBudget, campBudget]
      ).catch(() => {});

      results.push({ adId: campId, adName: campName, cost: campCost, roi: +Number(campRoi).toFixed(2), orders: campOrders, action, actionDetail });
    }
  } else {
    // 无计划数据，基于账户整体数据分析
    let action = 'hold', actionDetail = '';
    
    if (cost < 10) {
      action = 'hold';
      actionDetail = `账户今日消耗¥${cost.toFixed(2)}，数据量不足暂不分析`;
    } else if (roi >= config.min_roi && orders > 0) {
      action = 'scale_up'; scaleUpCount++;
      const costChange = ydCost > 0 ? ((cost - ydCost) / ydCost * 100).toFixed(0) : 0;
      actionDetail = `账户整体表现优秀: ROI=${(+roi).toFixed(2)}≥${config.min_roi}, ${orders}单, 消耗¥${cost.toFixed(0)}(较昨日${costChange}%), 建议适当扩量`;
    } else if ((roi < config.stop_roi && roi > 0) || (cost >= config.min_cost * 3 && orders === 0)) {
      action = 'scale_down'; scaleDownCount++;
      actionDetail = `账户需要优化: ROI=${(+roi).toFixed(2)}<${config.stop_roi}, ${orders}单, 消耗¥${cost.toFixed(0)}, 建议检查素材和定向`;
    } else {
      action = 'hold'; holdCount++;
      actionDetail = `账户运行正常: ROI=${(+roi).toFixed(2)}, ${orders}单, 消耗¥${cost.toFixed(0)}, GMV=¥${gmv.toFixed(0)}`;
    }

    if (campaignError) actionDetail += ` (计划接口: ${campaignError})`;

    await db.query(
      `INSERT INTO ks_pitcher_logs (advertiser_id, ad_id, ad_name, cost, roi, cvr, gmv, orders, show_cnt, click_cnt, action, action_detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [advertiserId, '', '账户整体', cost, +Number(roi).toFixed(2), +cvr.toFixed(2), gmv, orders, showCnt, clickCnt, action, actionDetail]
    ).catch(() => {});

    results.push({ adId: '', adName: '账户整体', cost, roi: +Number(roi).toFixed(2), orders, action, actionDetail });
  }

  logger.info(`[KsPitcher] 账户${advertiserId} 执行完成: 放大${scaleUpCount} 止损${scaleDownCount} 观察${holdCount}`);

  return {
    advertiser_id: advertiserId,
    total_ads: campaigns.length || 1,
    processed: results.length,
    scale_up: scaleUpCount,
    scale_down: scaleDownCount,
    hold: holdCount,
    details: results,
  };
}

async function checkAll() {
  try {
    const [configs] = await db.query('SELECT advertiser_id, poll_interval FROM ks_pitcher_configs WHERE enabled=1');
    if (!configs.length) return;
    const now = Date.now();
    for (const cfg of configs) {
      const key = cfg.advertiser_id;
      const interval = (cfg.poll_interval || 10) * 60 * 1000;
      if (now - (lastRunMap[key] || 0) >= interval) {
        lastRunMap[key] = now;
        try { await runOnce(key); } catch (e) { logger.error(`[KsPitcher] ${key} 失败`, e.message); }
      }
    }
  } catch (e) { logger.error('[KsPitcher] checkAll failed', e.message); }
}

module.exports = { runOnce, checkAll };
