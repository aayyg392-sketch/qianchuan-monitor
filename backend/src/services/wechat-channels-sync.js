const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const dayjs = require('dayjs');

const WX_API_BASE = 'https://api.weixin.qq.com';

// 内存缓存token
let cachedToken = null;
let cachedTokenExpiry = 0;

/**
 * 获取视频号配置
 */
async function getWxChannelsConfig() {
  const [rows] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('wx_channels_app_id','wx_channels_app_secret')");
  const config = {};
  rows.forEach(r => { config[r.setting_key] = r.setting_value; });
  return { appId: config.wx_channels_app_id, appSecret: config.wx_channels_app_secret };
}

/**
 * 获取access_token（带内存缓存）
 */
async function getAccessToken() {
  // 检查缓存是否有效（提前5分钟刷新）
  if (cachedToken && Date.now() < cachedTokenExpiry - 300000) {
    return cachedToken;
  }

  // 优先用小店AppID（有罗盘商家版权限），fallback到橱窗AppID
  let appId, appSecret;
  const [rows] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('wx_shop_app_id','wx_shop_app_secret','wx_channels_app_id','wx_channels_app_secret')");
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  appId = cfg.wx_shop_app_id || cfg.wx_channels_app_id;
  appSecret = cfg.wx_shop_app_secret || cfg.wx_channels_app_secret;

  if (!appId || !appSecret) {
    logger.error('[WxChannels] 视频号配置缺失，请在设置中配置AppID和AppSecret');
    return null;
  }

  try {
    const resp = await axios.get(`${WX_API_BASE}/cgi-bin/token`, {
      params: { grant_type: 'client_credential', appid: appId, secret: appSecret },
      timeout: 10000,
    });

    if (resp.data?.access_token) {
      cachedToken = resp.data.access_token;
      cachedTokenExpiry = Date.now() + (resp.data.expires_in || 7200) * 1000;
      logger.info('[WxChannels] Token获取成功', { expiresIn: resp.data.expires_in });
      return cachedToken;
    }

    logger.error('[WxChannels] Token获取失败', { errcode: resp.data?.errcode, errmsg: resp.data?.errmsg });
    return null;
  } catch (e) {
    logger.error('[WxChannels] Token请求异常', { error: e.message });
    return null;
  }
}

/**
 * 获取电商概览数据（罗盘达人版，参数ds格式YYYYMMDD）
 */
async function fetchFinderOverall(accessToken, ds) {
  try {
    const resp = await axios.post(
      `${WX_API_BASE}/channels/ec/compass/finder/overall/get?access_token=${accessToken}`,
      { ds },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    if (resp.data?.errcode && resp.data.errcode !== 0) {
      logger.warn('[WxChannels] 获取电商概览异常', { errcode: resp.data.errcode, errmsg: resp.data.errmsg });
      return null;
    }
    return resp.data?.data || resp.data;
  } catch (e) {
    logger.warn('[WxChannels] 获取电商概览失败', { error: e.message });
    return null;
  }
}

/**
 * 获取带货商品列表（罗盘达人版，参数ds格式YYYYMMDD）
 * 用商品列表反推达人信息
 */
async function fetchFinderProducts(accessToken, ds) {
  const allProducts = [];
  try {
    const resp = await axios.post(
      `${WX_API_BASE}/channels/ec/compass/finder/product/list/get?access_token=${accessToken}`,
      { ds },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    if (resp.data?.errcode && resp.data.errcode !== 0) {
      logger.warn('[WxChannels] 获取带货商品列表异常', { errcode: resp.data.errcode, errmsg: resp.data.errmsg });
      return [];
    }
    return resp.data?.product_list || [];
  } catch (e) {
    logger.warn('[WxChannels] 获取带货商品列表失败', { error: e.message });
    return [];
  }
}

/**
 * 获取橱窗商品列表
 */
async function fetchWindowProducts(accessToken) {
  const allProducts = [];
  let pageIndex = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const resp = await axios.post(
        `${WX_API_BASE}/channels/ec/window/product/list/get?access_token=${accessToken}`,
        { page_index: pageIndex, page_size: 30 },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      if (resp.data?.errcode && resp.data.errcode !== 0) {
        logger.warn('[WxChannels] 获取橱窗商品列表异常', { errcode: resp.data.errcode });
        break;
      }

      const list = resp.data?.products || [];
      allProducts.push(...list);
      hasMore = list.length >= 30;
      pageIndex++;

      logger.info(`[WxChannels] 橱窗商品 第${pageIndex-1}页 ${list.length}条, 累计${allProducts.length}条`);
      if (hasMore) await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) {
    logger.error('[WxChannels] 获取橱窗商品列表失败', { error: e.message });
  }

  return allProducts;
}

/**
 * 获取单个橱窗商品详情
 */
async function fetchWindowProductDetail(accessToken, productId, appid) {
  try {
    const resp = await axios.post(
      `${WX_API_BASE}/channels/ec/window/product/get?access_token=${accessToken}`,
      { product_id: parseInt(productId), appid: appid || '' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    if (resp.data?.errcode === 0 && resp.data?.product) {
      return resp.data.product;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 获取人群画像数据（罗盘达人版）
 */
async function fetchSaleProfile(accessToken, ds) {
  try {
    const resp = await axios.post(
      `${WX_API_BASE}/channels/ec/compass/finder/sale/profile/data/get?access_token=${accessToken}`,
      { ds },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    if (resp.data?.errcode && resp.data.errcode !== 0) {
      return null;
    }
    return resp.data;
  } catch (e) {
    logger.warn('[WxChannels] 获取人群画像异常', { error: e.message });
    return null;
  }
}

/**
 * 同步所有达人数据到本地数据库
 */
async function syncAllFinders() {
  const token = await getAccessToken();
  if (!token) {
    logger.error('[WxChannels] 无法获取Token，终止达人同步');
    return { synced: 0, error: 'Token获取失败' };
  }

  const ds = dayjs().subtract(1, 'day').format('YYYYMMDD');
  logger.info(`[WxChannels] 开始同步达人数据 ds=${ds}`);

  // 调用罗盘商家版-达人列表API
  let finderList = [];
  let hasMore = true;
  let lastBuffer = '';

  while (hasMore) {
    try {
      const body = { ds };
      if (lastBuffer) body.last_buffer = lastBuffer;

      const resp = await axios.post(
        `${WX_API_BASE}/channels/ec/compass/shop/finder/list/get?access_token=${token}`,
        body,
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      if (resp.data?.errcode && resp.data.errcode !== 0) {
        logger.warn('[WxChannels] 获取达人列表异常', { errcode: resp.data.errcode, errmsg: resp.data.errmsg });
        break;
      }

      const list = resp.data?.finder_list || [];
      finderList.push(...list);
      hasMore = !!resp.data?.has_more;
      lastBuffer = resp.data?.last_buffer || '';

      logger.info(`[WxChannels] 拉取达人 ${list.length}条, 累计${finderList.length}, hasMore=${hasMore}`);
      if (hasMore) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      logger.error('[WxChannels] 获取达人列表失败', { error: e.message });
      break;
    }
  }

  // 转换为统一格式，保留所有业务数据
  const finders = finderList.map(f => {
    const d = f.data || {};
    const gmv = parseFloat(d.pay_gmv || 0) / 100;
    const uv = parseInt(d.pay_uv || 0);
    const productCnt = parseInt(d.pay_product_id_cnt || 0);
    const refundGmv = parseFloat(d.refund_gmv || 0) / 100;
    return {
      finder_id: f.finder_id || '',
      finder_nickname: f.finder_nickname || '',
      head_img_url: f.head_img_url || '',
      fans_count: uv,           // 用付款UV代替粉丝数
      avg_sales: gmv,           // 存GMV
      video_count: productCnt,  // 用商品数代替视频数
      gmv_range: gmv > 0 ? `¥${gmv.toFixed(0)}` : '',
      category: productCnt > 0 ? `${productCnt}款商品` : '',
      // 完整业务数据存JSON
      audience_age: JSON.stringify({
        pay_gmv: d.pay_gmv || '0',
        pay_uv: d.pay_uv || '0',
        pay_product_id_cnt: d.pay_product_id_cnt || '0',
        refund_gmv: d.refund_gmv || '0',
        pay_refund_gmv: d.pay_refund_gmv || '0',
      }),
    };
  });

  if (!finders.length) {
    logger.info('[WxChannels] 无达人数据');
    return { synced: 0 };
  }

  let newCount = 0;
  let updateCount = 0;

  for (const f of finders) {
    const finderId = f.finder_id;
    if (!finderId) continue;

    try {
      const [existing] = await db.query('SELECT id, cooperation_status, last_synced_at FROM wx_finder_influencers WHERE finder_id=?', [finderId]);
      const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
      const todayGmv = f.avg_sales || 0; // 昨日销售

      if (existing && existing.length > 0) {
        // 更新：昨日销售覆盖，总GMV累加（同一天不重复累加）
        const lastSync = existing[0].last_synced_at ? dayjs(existing[0].last_synced_at).format('YYYY-MM-DD') : '';
        const today = dayjs().format('YYYY-MM-DD');
        const shouldAccumulate = lastSync !== today; // 每天只累加一次

        if (shouldAccumulate) {
          await db.query(
            `UPDATE wx_finder_influencers SET finder_nickname=?, fans_count=?, video_count=?, avg_sales=?, total_gmv=total_gmv+?, category=?, audience_age=?, last_synced_at=? WHERE finder_id=?`,
            [f.finder_nickname, f.fans_count, f.video_count, todayGmv, todayGmv, f.category, f.audience_age, now, finderId]
          );
        } else {
          await db.query(
            `UPDATE wx_finder_influencers SET finder_nickname=?, fans_count=?, video_count=?, avg_sales=?, category=?, audience_age=?, last_synced_at=? WHERE finder_id=?`,
            [f.finder_nickname, f.fans_count, f.video_count, todayGmv, f.category, f.audience_age, now, finderId]
          );
        }
        updateCount++;
      } else {
        // 新增：total_gmv初始值=昨日销售
        await db.query(
          `INSERT INTO wx_finder_influencers (finder_id, finder_nickname, fans_count, video_count, avg_sales, total_gmv, category, audience_age, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [finderId, f.finder_nickname, f.fans_count, f.video_count, todayGmv, todayGmv, f.category, f.audience_age, now]
        );
        newCount++;
      }
    } catch (e) {
      logger.warn(`[WxChannels] 保存达人失败 ${finderId}`, { error: e.message });
    }

    // 防风控
    await new Promise(r => setTimeout(r, 100));
  }

  logger.info(`[WxChannels] 达人同步完成, 新增${newCount}, 更新${updateCount}, 共${finders.length}条`);
  return { synced: finders.length, newCount, updateCount };
}

module.exports = {
  getWxChannelsConfig,
  getAccessToken,
  fetchFinderOverall,
  fetchFinderProducts,
  fetchWindowProducts,
  fetchSaleProfile,
  syncAllFinders,
};
