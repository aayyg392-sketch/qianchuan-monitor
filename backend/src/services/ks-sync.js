/**
 * 快手小店数据同步服务
 * 定时同步订单、商品、统计数据
 */
const axios = require('axios');
const crypto = require('crypto');
const db = require('../db');
const logger = require('../logger');

const KS_APP_KEY = process.env.KS_APP_KEY || 'ks650488674676453513';
const KS_APP_SECRET = process.env.KS_APP_SECRET || 'MZQOOF3KXqnewfJ6xKZ2Sg';
const KS_SIGN_SECRET = process.env.KS_SIGN_SECRET || '5e2256815bc4bb176234e1a10c284581';
const KS_API_BASE = 'https://openapi.kwaixiaodian.com';
const KS_TOKEN_URL = 'https://openapi.kwaixiaodian.com/oauth2/access_token';
const KS_REFRESH_TOKEN_URL = 'https://openapi.kwaixiaodian.com/oauth2/refresh_token';

// ============ 签名计算 ============

function generateSign(params) {
  const sortedKeys = Object.keys(params).sort();
  let paramStr = '';
  for (const key of sortedKeys) {
    if (params[key] !== null && params[key] !== undefined) {
      paramStr += key + '=' + params[key] + '&';
    }
  }
  paramStr += 'signSecret=' + KS_SIGN_SECRET;
  return crypto.createHash('md5').update(paramStr).digest('hex');
}

// ============ 通用请求封装 ============

/**
 * 调用快手开放API (统一签名方式)
 */
// 配额限制标记 — 遇到802006后本次同步周期内跳过所有API调用
let quotaExceeded = false;

class QuotaExceededError extends Error {
  constructor(msg) { super(msg); this.name = 'QuotaExceededError'; }
}

async function ksApiCall(accessToken, method, businessParams = {}) {
  // 如果已触发配额限制，直接跳过
  if (quotaExceeded) {
    throw new QuotaExceededError('配额已耗尽，跳过API调用');
  }

  try {
    const paramJson = JSON.stringify(businessParams);
    const systemParams = {
      method,
      appkey: KS_APP_KEY,
      access_token: accessToken,
      timestamp: String(Date.now()),
      version: '1',
      signMethod: 'MD5',
      param: paramJson,
    };
    systemParams.sign = generateSign(systemParams);

    // URL路径: method的.替换为/ (官方文档格式)
    const urlPath = '/' + method.replace(/\./g, '/');
    // 官方要求: 系统参数放URL query string, param放POST body
    const qs = require('querystring');
    const queryParams = {
      appkey: systemParams.appkey,
      method: systemParams.method,
      version: systemParams.version,
      access_token: systemParams.access_token,
      timestamp: systemParams.timestamp,
      signMethod: systemParams.signMethod,
      sign: systemParams.sign,
    };
    const url = KS_API_BASE + urlPath + '?' + qs.stringify(queryParams);
    const res = await axios.post(url, qs.stringify({ param: paramJson }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json;charset=UTF-8'
      },
      timeout: 15000
    });

    // 检测802006配额限制
    if (res.data && (res.data.sub_code === '802006' || res.data.code === '802006')) {
      quotaExceeded = true;
      logger.error(`[KS-Sync] ⚠️ APP日配额已耗尽! 本次同步周期内将跳过所有API调用. ${res.data.sub_msg || ''}`);
      throw new QuotaExceededError(res.data.sub_msg || 'APP已达到当天调用额度限制');
    }

    return res.data;
  } catch (e) {
    if (e instanceof QuotaExceededError) throw e;
    logger.error(`[KS-Sync] API调用失败: ${method}`, e.message);
    throw e;
  }
}

// ksApiPost 统一使用 ksApiCall
async function ksApiPost(accessToken, method, data = {}) {
  return ksApiCall(accessToken, method, data);
}

// ============ Token自动刷新 ============

async function refreshTokenIfNeeded(account) {
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);
  // 提前1小时刷新
  if (expiresAt.getTime() - now.getTime() > 3600000) {
    return account.access_token;
  }

  logger.info(`[KS-Sync] Token即将过期，刷新: ${account.shop_name}`);
  try {
    const tokenRes = await axios.get(KS_REFRESH_TOKEN_URL, {
      params: {
        app_id: KS_APP_KEY,
        app_secret: KS_APP_SECRET,
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token
      },
      timeout: 15000
    });

    const result = tokenRes.data;
    if (result.result === 1 && result.access_token) {
      const newExpiresAt = new Date(Date.now() + (result.expires_in || 86400) * 1000);
      await db.query(
        'UPDATE ks_accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE shop_id=?',
        [result.access_token, result.refresh_token || account.refresh_token, newExpiresAt, account.shop_id]
      );
      logger.info(`[KS-Sync] Token刷新成功: ${account.shop_name}, 新过期时间: ${newExpiresAt.toISOString()}`);
      return result.access_token;
    } else {
      logger.error(`[KS-Sync] Token刷新失败: ${account.shop_name}`, result);
      return account.access_token;
    }
  } catch (e) {
    logger.error(`[KS-Sync] Token刷新异常: ${e.message}`);
    return account.access_token;
  }
}

// ============ 订单同步 ============

async function syncOrders(account, accessToken) {
  const shopId = account.shop_id;
  logger.info(`[KS-Sync] 开始同步订单: ${account.shop_name}`);

  try {
    // 同步今天和昨天的订单（用dayjs避免toISOString的UTC时区偏移bug）
    const dayjs = require('dayjs');
    const todayStr = dayjs().format('YYYY-MM-DD');
    const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    for (const dateStr of [yesterdayStr, todayStr]) {
      const beginTime = dayjs(dateStr).startOf('day').valueOf(); // 毫秒，北京时间00:00
      const endTime = dayjs(dateStr).endOf('day').valueOf(); // 毫秒，北京时间23:59:59
      let pageCursor = '';
      let totalSynced = 0;
      let maxPages = 100; // 安全上限，防止死循环

      do {
        const params = {
          type: 1,
          orderViewStatus: 1,
          beginTime: beginTime,
          endTime: endTime,
          pageSize: 50,
          sort: 1,
        };
        // KS API用cursor（不是pcursor）做翻页参数
        if (pageCursor) params.cursor = pageCursor;

        const res = await ksApiPost(accessToken, 'open.order.cursor.list', params);

        if (!res || res.result !== 1) {
          // 配额错误已在ksApiCall中处理，这里只处理其他异常
          logger.warn(`[KS-Sync] 订单列表返回异常: ${JSON.stringify(res)}`);
          break;
        }

        const orders = res.data?.orderList || [];
        pageCursor = res.data?.cursor || '';

        for (const order of orders) {
          const base = order.orderBaseInfo || {};
          const itemInfo = order.orderItemInfo || {};
          const refundList = order.orderRefundList || [];
          const createTime = base.createTime ? new Date(base.createTime) : null;
          const payTime = base.payTime ? new Date(base.payTime) : null;
          const shippingTime = base.sendTime ? new Date(base.sendTime) : null;
          const finishTime = base.recvTime ? new Date(base.recvTime) : null;
          const payAmount = (base.totalFee || 0) - (base.discountFee || 0);
          const refundStatus = refundList.length > 0 ? 1 : 0;
          const firstItem = {}; // compat

          await db.query(`
            INSERT INTO ks_orders (shop_id, oid, order_status, order_status_desc, buyer_nick,
              item_id, item_title, item_pic, item_price, num,
              total_amount, pay_amount, coupon_amount, freight_amount,
              pay_time, create_time, shipping_time, finish_time, refund_status, express_no)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              order_status = VALUES(order_status),
              order_status_desc = VALUES(order_status_desc),
              pay_amount = VALUES(pay_amount),
              pay_time = VALUES(pay_time),
              shipping_time = VALUES(shipping_time),
              finish_time = VALUES(finish_time),
              refund_status = VALUES(refund_status),
              express_no = VALUES(express_no)
          `, [
            shopId,
            String(base.oid || ''),
            base.status || 0,
            '',
            base.buyerNick || '',
            String(itemInfo.itemId || ''),
            itemInfo.itemTitle || '',
            itemInfo.itemPicUrl || '',
            (itemInfo.originalPrice || 0) / 100,
            itemInfo.num || 1,
            (base.totalFee || 0) / 100,
            payAmount / 100,
            (base.discountFee || 0) / 100,
            (base.expressFee || 0) / 100,
            payTime,
            createTime,
            shippingTime,
            finishTime,
            refundStatus,
            base.expressCode || ''
          ]);
          totalSynced++;
        }

        // 没有更多数据
        if (!orders.length || !pageCursor) break;
        if (--maxPages <= 0) { logger.warn('[KS-Sync] 达到最大翻页上限，停止'); break; }

        // 防止请求过快
        await sleep(300);
      } while (pageCursor);

      logger.info(`[KS-Sync] ${dateStr} 同步订单: ${totalSynced}条`);
    }
  } catch (e) {
    if (e instanceof QuotaExceededError) throw e;  // 配额错误向上抛出
    logger.error(`[KS-Sync] 订单同步异常: ${account.shop_name}`, e.message);
  }
}

// ============ 商品同步 ============

// 每个店铺的商品同步断点（内存缓存，重启后从第1页开始）
const itemSyncPageCache = {};
// 每次同步最多翻页数（10页=500个商品，约3秒，不阻塞其他店铺）
const MAX_ITEM_PAGES_PER_CYCLE = 10;

async function syncItems(account, accessToken) {
  const shopId = account.shop_id;
  // 从断点恢复翻页位置
  let page = itemSyncPageCache[shopId] || 1;
  const startPage = page;
  logger.info(`[KS-Sync] 开始同步商品: ${account.shop_name} (从第${page}页开始, 本次最多${MAX_ITEM_PAGES_PER_CYCLE}页)`);

  try {
    let totalSynced = 0;
    let pagesThisCycle = 0;

    while (pagesThisCycle < MAX_ITEM_PAGES_PER_CYCLE) {
      const res = await ksApiPost(accessToken, 'open.item.list.get', {
        pageNum: page,
        pageSize: 50
      });

      if (!res || res.result !== 1) {
        logger.warn(`[KS-Sync] 商品列表返回异常: ${JSON.stringify(res)}`);
        break;
      }

      const items = res.data?.items || [];
      if (!items.length) {
        // 已到末尾，下次从第1页重新开始
        itemSyncPageCache[shopId] = 1;
        logger.info(`[KS-Sync] 商品同步到末尾，下次从第1页开始`);
        break;
      }

      for (const item of items) {
        await db.query(`
          INSERT INTO ks_items (shop_id, item_id, item_title, item_pic, item_price, item_status, category_name, sales_volume, stock)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            item_title = VALUES(item_title),
            item_pic = VALUES(item_pic),
            item_price = VALUES(item_price),
            item_status = VALUES(item_status),
            sales_volume = GREATEST(sales_volume, VALUES(sales_volume)),
            stock = VALUES(stock)
        `, [
          shopId,
          String(item.kwaiItemId || ''),
          item.title || '',
          item.mainImageUrl || '',
          (item.price || 0) / 100,
          item.itemStatus || 1,
          item.categoryName || '',
          item.volume || 0,
          0
        ]);
        totalSynced++;
      }

      page++;
      pagesThisCycle++;

      if (items.length < 50) {
        // 最后一页，下次从第1页重新开始
        itemSyncPageCache[shopId] = 1;
        break;
      }

      // 保存断点：下次从这里继续
      itemSyncPageCache[shopId] = page;
      await sleep(300);
    }

    logger.info(`[KS-Sync] 商品同步: ${account.shop_name} 本次第${startPage}-${page-1}页, ${totalSynced}个, 下次从第${itemSyncPageCache[shopId] || page}页继续`);
  } catch (e) {
    if (e instanceof QuotaExceededError) throw e;
    logger.error(`[KS-Sync] 商品同步异常: ${account.shop_name}`, e.message);
  }
}

// ============ 日统计汇总 ============

async function syncDailyStats(account) {
  const shopId = account.shop_id;
  logger.info(`[KS-Sync] 开始汇总日统计: ${account.shop_name}`);

  try {
    // 汇总今天和昨天（用dayjs避免UTC时区偏移）
    const dayjs = require('dayjs');
    const dates = [dayjs().format('YYYY-MM-DD'), dayjs().subtract(1, 'day').format('YYYY-MM-DD')];

    for (const statDate of dates) {
      // 从订单表汇总
      const [orderStats] = await db.query(`
        SELECT
          COUNT(*) as order_cnt,
          SUM(CASE WHEN pay_time IS NOT NULL THEN 1 ELSE 0 END) as pay_order_cnt,
          COALESCE(SUM(CASE WHEN pay_time IS NOT NULL THEN pay_amount ELSE 0 END), 0) as pay_amount,
          SUM(CASE WHEN refund_status > 0 THEN 1 ELSE 0 END) as refund_cnt,
          COALESCE(SUM(CASE WHEN refund_status > 0 THEN pay_amount ELSE 0 END), 0) as refund_amount
        FROM ks_orders
        WHERE shop_id = ? AND DATE(create_time) = ?
      `, [shopId, statDate]);

      const stats = orderStats[0] || {};
      const gmv = parseFloat(stats.pay_amount || 0);
      const payOrderCnt = parseInt(stats.pay_order_cnt || 0);
      const avgOrderAmount = payOrderCnt > 0 ? (gmv / payOrderCnt).toFixed(2) : 0;

      // 在售商品数
      const [[{ itemCnt }]] = await db.query(
        'SELECT COUNT(*) as itemCnt FROM ks_items WHERE shop_id = ? AND item_status = 1', [shopId]
      );

      await db.query(`
        INSERT INTO ks_daily_stats (shop_id, stat_date, order_cnt, pay_order_cnt, pay_amount, refund_cnt, refund_amount, gmv, avg_order_amount, item_cnt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          order_cnt = VALUES(order_cnt),
          pay_order_cnt = VALUES(pay_order_cnt),
          pay_amount = VALUES(pay_amount),
          refund_cnt = VALUES(refund_cnt),
          refund_amount = VALUES(refund_amount),
          gmv = VALUES(gmv),
          avg_order_amount = VALUES(avg_order_amount),
          item_cnt = VALUES(item_cnt)
      `, [
        shopId, statDate,
        stats.order_cnt || 0,
        payOrderCnt,
        stats.pay_amount || 0,
        stats.refund_cnt || 0,
        stats.refund_amount || 0,
        gmv,
        avgOrderAmount,
        itemCnt || 0
      ]);
    }

    logger.info(`[KS-Sync] 日统计汇总完成: ${account.shop_name}`);
  } catch (e) {
    logger.error(`[KS-Sync] 日统计汇总异常: ${account.shop_name}`, e.message);
  }
}

// ============ 主同步任务 ============

async function runKsSync() {
  if (!KS_APP_SECRET) {
    logger.warn('[KS-Sync] 快手AppSecret未配置，跳过同步');
    return;
  }

  // 重置配额标记（每次同步周期开始时重置）
  quotaExceeded = false;

  logger.info('[KS-Sync] ========== 快手数据同步开始 ==========');
  const startTime = Date.now();

  try {
    const [accounts] = await db.query('SELECT * FROM ks_accounts WHERE status = 1');

    if (!accounts.length) {
      logger.info('[KS-Sync] 无启用的快手店铺，跳过');
      return;
    }

    // === 阶段1: 所有店铺先同步订单（优先级最高，确保每个店铺都有数据） ===
    logger.info(`[KS-Sync] 阶段1: 同步所有店铺订单 (共${accounts.length}个店铺)`);
    const tokenCache = {}; // 缓存token避免重复刷新

    for (const account of accounts) {
      if (quotaExceeded) {
        logger.warn(`[KS-Sync] 配额已耗尽，跳过 ${account.shop_name} 订单同步`);
        continue;
      }
      try {
        const accessToken = await refreshTokenIfNeeded(account);
        if (!accessToken) {
          logger.warn(`[KS-Sync] ${account.shop_name} 无有效Token，跳过`);
          continue;
        }
        tokenCache[account.shop_id] = accessToken;
        await syncOrders(account, accessToken);
        logger.info(`[KS-Sync] ✅ ${account.shop_name} 订单同步完成`);
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          logger.warn(`[KS-Sync] ${account.shop_name} 因配额限制停止`);
        } else {
          logger.error(`[KS-Sync] ${account.shop_name} 订单同步失败: ${e.message}`);
        }
      }
      await sleep(500);
    }

    // === 阶段2: 所有店铺汇总日统计（本地操作，不消耗API配额） ===
    logger.info(`[KS-Sync] 阶段2: 汇总所有店铺日统计`);
    for (const account of accounts) {
      try {
        await syncDailyStats(account);
        // 更新最后同步时间
        await db.query('UPDATE ks_accounts SET last_sync_at = NOW() WHERE shop_id = ?', [account.shop_id]);
        logger.info(`[KS-Sync] ✅ ${account.shop_name} 日统计汇总完成`);
      } catch (e) {
        logger.error(`[KS-Sync] ${account.shop_name} 日统计汇总失败: ${e.message}`);
      }
    }

    // === 阶段3: 商品同步暂时跳过（当前业务不需要） ===
    // 如需开启，取消下方注释即可
    // for (const account of accounts) {
    //   if (quotaExceeded) break;
    //   const accessToken = tokenCache[account.shop_id];
    //   if (!accessToken) continue;
    //   await syncItems(account, accessToken);
    //   await sleep(500);
    // }
  } catch (e) {
    logger.error('[KS-Sync] 同步任务异常: ' + e.message);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (quotaExceeded) {
    logger.warn(`[KS-Sync] ========== 快手数据同步完成 (${elapsed}s) [配额受限] ==========`);
  } else {
    logger.info(`[KS-Sync] ========== 快手数据同步完成 (${elapsed}s) ==========`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runKsSync, ksApiPost };
