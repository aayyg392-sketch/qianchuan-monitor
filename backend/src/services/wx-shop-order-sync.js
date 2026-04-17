/**
 * 视频号小店订单明细同步服务
 *
 * 口径与小店后台对齐：
 * - 销售额 = SUM(order_price) where status>=20 && status!=200
 * - order_price = 实付金额（含运费、扣优惠）
 * - pay_time 作为交易时间
 *
 * 同步策略：
 * - syncRecentUpdates(): 按 update_time_range 拉最近 1 小时变更订单（每 10-15 分钟跑一次）
 * - syncDayByCreate(ds): 按 create_time_range 拉某日全量订单（每日凌晨回补）
 */

const axios = require('axios');
const dayjs = require('dayjs');
const db = require('../db');
const logger = require('../logger');

const WX_API_BASE = 'https://api.weixin.qq.com';

// Token 缓存
let cachedToken = null;
let cachedTokenExpiry = 0;

function invalidateToken() { cachedToken = null; cachedTokenExpiry = 0; }

async function getShopToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 300000) {
    return cachedToken;
  }
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('wx_shop_app_id','wx_shop_app_secret')"
  );
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  if (!cfg.wx_shop_app_id || !cfg.wx_shop_app_secret) {
    throw new Error('wx_shop_app_id/secret 未配置');
  }
  const res = await axios.get(
    `${WX_API_BASE}/cgi-bin/token`,
    { params: { grant_type: 'client_credential', appid: cfg.wx_shop_app_id, secret: cfg.wx_shop_app_secret }, timeout: 10000 }
  );
  if (!res.data?.access_token) {
    throw new Error(`获取token失败: ${JSON.stringify(res.data)}`);
  }
  cachedToken = res.data.access_token;
  cachedTokenExpiry = Date.now() + (res.data.expires_in || 7200) * 1000;
  return cachedToken;
}

/**
 * 拉取订单ID列表（分页）
 * @param {number} startTs 秒级时间戳
 * @param {number} endTs 秒级时间戳
 * @param {'create'|'update'} mode
 * @returns {Promise<string[]>}
 */
async function listOrderIds(startTs, endTs, mode = 'create') {
  let token = await getShopToken();
  const ids = [];
  let nextKey = '';
  let hasMore = true;
  let pages = 0;
  const body = mode === 'update'
    ? { update_time_range: { start_time: startTs, end_time: endTs }, page_size: 100 }
    : { create_time_range: { start_time: startTs, end_time: endTs }, page_size: 100 };

  while (hasMore && pages < 100) {
    try {
      const r = await axios.post(
        `${WX_API_BASE}/channels/ec/order/list/get?access_token=${token}`,
        { ...body, next_key: nextKey || undefined },
        { timeout: 15000 }
      );
      if (r.data?.errcode && r.data.errcode !== 0) {
        if (r.data.errcode === 40001 || r.data.errcode === 42001) {
          invalidateToken();
          token = await getShopToken();
          continue; // 用新 token 重试本页
        }
        logger.warn('[WxShopOrder] order/list/get 返回错误', { errcode: r.data.errcode, errmsg: r.data.errmsg });
        break;
      }
      ids.push(...(r.data.order_id_list || []));
      nextKey = r.data.next_key || '';
      hasMore = !!r.data.has_more;
      pages++;
      if (hasMore) await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      logger.warn('[WxShopOrder] 列表页拉取异常', { error: e.message });
      break;
    }
  }
  return ids;
}

/**
 * 拉取订单详情
 */
async function getOrderDetail(orderId) {
  let token = await getShopToken();
  for (let retry = 0; retry < 2; retry++) {
    try {
      const r = await axios.post(
        `${WX_API_BASE}/channels/ec/order/get?access_token=${token}`,
        { order_id: orderId },
        { timeout: 8000 }
      );
      if (r.data?.errcode === 40001 || r.data?.errcode === 42001) {
        invalidateToken();
        token = await getShopToken();
        continue;
      }
      if (r.data?.errcode && r.data.errcode !== 0) return null;
      return r.data.order || null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

function tsToDt(ts) {
  if (!ts) return null;
  return dayjs.unix(ts).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 把订单对象写入库（upsert）
 */
async function upsertOrder(order) {
  if (!order || !order.order_id) return;
  const detail = order.order_detail || {};
  const price = detail.price_info || {};
  const ext = detail.ext_info || {};
  const pay = detail.pay_info || {};
  const source = detail.source_infos?.[0] || {};
  const aftersale = detail.aftersale_detail || {};

  // order_price = 订单实付（含运费、扣优惠），单位分
  const orderPrice = parseInt(price.order_price || 0);
  const productPrice = parseInt(price.product_price || 0);
  const freight = parseInt(price.freight || 0);
  const discounted = parseInt(price.discounted_price || 0);
  const refundAmount = parseInt(aftersale.total_refund_amount || 0);

  const productList = detail.product_infos || [];

  await db.query(
    `INSERT INTO wx_shop_orders
     (order_id, openid, status, product_price, order_price, freight, discounted_price,
      refund_amount, order_scene, finder_id, finder_nickname, product_count,
      create_time, pay_time, update_time, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status=VALUES(status),
       product_price=VALUES(product_price),
       order_price=VALUES(order_price),
       freight=VALUES(freight),
       discounted_price=VALUES(discounted_price),
       refund_amount=VALUES(refund_amount),
       order_scene=VALUES(order_scene),
       finder_id=VALUES(finder_id),
       finder_nickname=VALUES(finder_nickname),
       product_count=VALUES(product_count),
       pay_time=VALUES(pay_time),
       update_time=VALUES(update_time),
       raw_json=VALUES(raw_json)`,
    [
      order.order_id,
      order.openid || null,
      parseInt(order.status) || 0,
      productPrice,
      orderPrice,
      freight,
      discounted,
      refundAmount,
      parseInt(ext.order_scene) || 0,
      ext.finder_id || null,
      source.account_nickname || null,
      productList.length,
      tsToDt(order.create_time),
      tsToDt(pay.pay_time),
      tsToDt(order.update_time),
      JSON.stringify(order).slice(0, 65000)  // 防过长
    ]
  );
}

/**
 * 按 ID 列表批量 upsert（串行拉详情，避免风控）
 */
async function fetchAndUpsertOrders(ids) {
  let ok = 0, fail = 0;
  for (const oid of ids) {
    const od = await getOrderDetail(oid);
    if (!od) { fail++; continue; }
    try {
      await upsertOrder(od);
      ok++;
    } catch (e) {
      fail++;
      logger.warn('[WxShopOrder] upsert 失败', { orderId: oid, error: e.message });
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return { ok, fail };
}

/**
 * 同步最近 N 分钟内 update 的订单（默认 70 分钟，覆盖 cron 间隔）
 * 适用于 cron 每 10-15 分钟执行
 */
async function syncRecentUpdates(minutes = 70) {
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - minutes * 60;
  try {
    const ids = await listOrderIds(startTs, endTs, 'update');
    if (!ids.length) {
      logger.info(`[WxShopOrder] 近${minutes}分钟无订单更新`);
      return { synced: 0 };
    }
    const { ok, fail } = await fetchAndUpsertOrders(ids);
    logger.info(`[WxShopOrder] 增量同步完成 近${minutes}分钟 共${ids.length}单 成功${ok} 失败${fail}`);
    return { synced: ok, fail };
  } catch (e) {
    logger.error('[WxShopOrder] syncRecentUpdates 失败', { error: e.message });
    return { synced: 0, error: e.message };
  }
}

/**
 * 按日期全量同步（create_time 在该日内）
 * @param {string} ds YYYY-MM-DD
 */
async function syncDayByCreate(ds) {
  const start = Math.floor(dayjs(ds).startOf('day').valueOf() / 1000);
  const end = Math.floor(dayjs(ds).endOf('day').valueOf() / 1000);
  try {
    const ids = await listOrderIds(start, end, 'create');
    if (!ids.length) {
      logger.info(`[WxShopOrder] ${ds} 无订单`);
      return { synced: 0 };
    }
    const { ok, fail } = await fetchAndUpsertOrders(ids);
    logger.info(`[WxShopOrder] ${ds} 全量同步完成 共${ids.length}单 成功${ok} 失败${fail}`);
    return { synced: ok, fail, total: ids.length };
  } catch (e) {
    logger.error(`[WxShopOrder] syncDayByCreate ${ds} 失败`, { error: e.message });
    return { synced: 0, error: e.message };
  }
}

/**
 * 回补最近 N 天（包含今天）
 */
async function backfillDays(days = 3) {
  const results = [];
  for (let i = 0; i < days; i++) {
    const ds = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    const r = await syncDayByCreate(ds);
    results.push({ ds, ...r });
  }
  return results;
}

module.exports = {
  getShopToken,
  listOrderIds,
  getOrderDetail,
  upsertOrder,
  syncRecentUpdates,
  syncDayByCreate,
  backfillDays,
};
