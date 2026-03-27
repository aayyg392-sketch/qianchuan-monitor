/**
 * 直播间数据采集服务
 *
 * 通过巨量千川API拉取直播间实时数据，写入 live_realtime_data 表
 * 支持：在线人数、场观、GMV、订单、流量来源、千川投产等
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const dayjs = require('dayjs');

const OE_API_BASE = 'https://ad.oceanengine.com/open_api';
const APP_ID = '1859525766684851';

// ============ Token 管理 ============

async function getValidToken() {
  try {
    const [accounts] = await db.query(
      `SELECT * FROM qc_accounts WHERE status = 1 AND access_token IS NOT NULL ORDER BY token_expires_at DESC LIMIT 1`
    );
    if (!accounts.length) {
      logger.warn('[LiveSync] 没有可用的千川账号');
      return null;
    }
    const account = accounts[0];
    // 检查 token 是否即将过期 (小于1小时)
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date(Date.now() + 3600000)) {
      const newToken = await refreshToken(account);
      if (newToken) return { token: newToken, advertiserId: account.advertiser_id };
    }
    return { token: account.access_token, advertiserId: account.advertiser_id };
  } catch (e) {
    logger.error('[LiveSync] 获取Token失败', { error: e.message });
    return null;
  }
}

async function refreshToken(account) {
  try {
    const APP_SECRET = process.env.APP_SECRET || '67e5c48c38e04c36140c41ce8ad44f5b52c105f1';
    const resp = await axios.post(`${OE_API_BASE}/oauth2/refresh_token/`, {
      appid: APP_ID, secret: APP_SECRET,
      grant_type: 'refresh_token', refresh_token: account.refresh_token,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    if (resp.data?.code === 0 && resp.data?.data) {
      const { access_token, refresh_token, expires_in } = resp.data.data;
      const expiresAt = new Date(Date.now() + (expires_in || 86400) * 1000);
      await db.query(
        `UPDATE qc_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?`,
        [access_token, refresh_token || account.refresh_token, expiresAt, account.id]
      );
      logger.info('[LiveSync] Token刷新成功');
      return access_token;
    }
    return null;
  } catch (e) {
    logger.error('[LiveSync] Token刷新失败', { error: e.message });
    return null;
  }
}

// ============ 授权抖音号管理 ============

/**
 * 获取千川授权的抖音号列表
 */
async function getAuthorizedAweme(advertiserId, accessToken) {
  try {
    const resp = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/aweme/authorized/get/`, {
      params: { advertiser_id: parseInt(advertiserId), page: '1', page_size: '50' },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });
    if (resp.data?.code === 0 && resp.data?.data?.aweme_id_list) {
      return resp.data.data.aweme_id_list;
    }
    return [];
  } catch (e) {
    logger.warn('[LiveSync] 获取授权抖音号失败', { error: e.message });
    return [];
  }
}

/**
 * 将直播间与授权抖音号匹配
 * 匹配策略：昵称包含 → room_id匹配 → 第一个有直播权限的
 */
function matchAweme(room, awemeList) {
  // 1. 按昵称匹配
  if (room.nickname) {
    const match = awemeList.find(a =>
      a.aweme_name?.includes(room.nickname) || room.nickname.includes(a.aweme_name?.replace(/直播间$/, ''))
    );
    if (match) return match;
  }
  // 2. 按 room_id 匹配 aweme_id 或 aweme_show_id
  const match2 = awemeList.find(a =>
    String(a.aweme_id) === room.room_id || a.aweme_show_id === room.room_id
  );
  if (match2) return match2;
  // 3. 返回第一个有直播权限的
  return awemeList.find(a => a.aweme_has_live_permission) || null;
}

// ============ 千川直播间数据拉取 ============

/**
 * 通过千川API获取直播间实时数据
 * 使用 /v1.0/qianchuan/report/live/get/ 接口
 */
/**
 * 通过千川今日直播间API获取实时数据
 * 接口：/v1.0/qianchuan/today_live/room/get/
 */
async function fetchLiveRealtimeFromAPI(advertiserId, accessToken, awemeId) {
  let liveData = null;

  // 1. 先获取今日直播间概览数据
  try {
    const liveFields = ['watch_cnt', 'total_watch_cnt', 'online_user_count', 'max_online_user_count',
      'avg_watch_duration', 'comment_cnt', 'like_cnt', 'share_cnt',
      'pay_order_count', 'pay_order_amount', 'product_click_count',
      'stat_cost', 'show_cnt', 'click_cnt', 'convert_cnt',
      'room_enter_cnt', 'fans_club_join_cnt', 'interaction_rate', 'gpm', 'uv_value'];
    const resp = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/today_live/room/get/`, {
      params: { advertiser_id: parseInt(advertiserId), aweme_id: parseInt(awemeId), date_time: dayjs().format('YYYY-MM-DD'), fields: JSON.stringify(liveFields) },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });
    if (resp.data?.code === 0 && resp.data?.data) {
      liveData = resp.data.data;
      logger.info('[LiveSync] 今日直播间API成功', { keys: Object.keys(liveData).join(',') });
    } else {
      logger.warn('[LiveSync] today_live/room/get 返回', { code: resp.data?.code, msg: resp.data?.message });
    }
  } catch (e) {
    logger.warn('[LiveSync] today_live/room/get 失败', { error: e.message });
  }

  // 2. 获取直播间详细数据（在线人数等）
  try {
    const resp2 = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/today_live/room/detail/get/`, {
      params: { advertiser_id: parseInt(advertiserId), aweme_id: parseInt(awemeId), date_time: dayjs().format('YYYY-MM-DD') },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });
    if (resp2.data?.code === 0 && resp2.data?.data) {
      liveData = { ...liveData, ...resp2.data.data };
      logger.info('[LiveSync] 直播间详情API成功', { keys: Object.keys(resp2.data.data).join(',') });
    }
  } catch (e) {
    logger.warn('[LiveSync] today_live/room/detail/get 失败', { error: e.message });
  }

  // 3. 获取流量表现数据
  try {
    const resp3 = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/today_live/room/flow_performance/get/`, {
      params: { advertiser_id: parseInt(advertiserId), aweme_id: parseInt(awemeId), date_time: dayjs().format('YYYY-MM-DD') },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });
    if (resp3.data?.code === 0 && resp3.data?.data) {
      liveData = { ...liveData, _flow: resp3.data.data };
    }
  } catch (e) {
    logger.warn('[LiveSync] flow_performance 失败', { error: e.message });
  }

  // 4. 获取用户数据
  try {
    const resp4 = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/today_live/room/user/get/`, {
      params: { advertiser_id: parseInt(advertiserId), aweme_id: parseInt(awemeId), date_time: dayjs().format('YYYY-MM-DD') },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });
    if (resp4.data?.code === 0 && resp4.data?.data) {
      liveData = { ...liveData, _user: resp4.data.data };
    }
  } catch (e) {
    logger.warn('[LiveSync] room/user/get 失败', { error: e.message });
  }

  return liveData;
}

/**
 * 通过全域推广API获取直播间数据（当 today_live/room/get 无数据时降级使用）
 * 接口：/v1.0/qianchuan/uni_promotion/list/
 * 全域推广的直播数据不走 today_live 接口，需通过此接口获取
 */
async function fetchUniPromotionData(advertiserId, accessToken, awemeId) {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const fields = [
      'stat_cost', 'total_pay_order_count_for_roi2', 'total_pay_order_gmv_for_roi2',
      'total_prepay_and_pay_order_roi2', 'total_pay_order_gmv_include_coupon_for_roi2',
      'total_cost_per_pay_order_for_roi2', 'shop_estimated_comission_cost',
    ];
    const resp = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/uni_promotion/list/`, {
      params: {
        advertiser_id: parseInt(advertiserId),
        marketing_goal: 'LIVE_PROM_GOODS',
        start_time: today + ' 00:00:00',
        end_time: today + ' 23:59:59',
        fields: JSON.stringify(fields),
        page: 1, page_size: 50,
      },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });

    if (resp.data?.code === 0 && resp.data?.data?.ad_list?.length) {
      const adList = resp.data.data.ad_list;
      // 找匹配当前直播间aweme_id的全域推广计划
      let matched = adList.find(ad => {
        const rooms = ad.room_info || [];
        return rooms.some(r => String(r.anchor_id) === String(awemeId) || r.anchor_name?.includes(awemeId));
      });
      // 如果只有一个投放中的计划，直接使用
      if (!matched && adList.length === 1) matched = adList[0];
      // 找状态为DELIVERY_OK的
      if (!matched) matched = adList.find(ad => ad.ad_info?.status === 'DELIVERY_OK');

      if (matched) {
        const stats = matched.stats_info || {};
        const adInfo = matched.ad_info || {};
        const roomInfo = (matched.room_info || [])[0] || {};
        // stat_cost 单位是 微元(1/100000)，需要转换
        const costRaw = stats.stat_cost || 0;
        const gmvRaw = stats.total_pay_order_gmv_for_roi2 || 0;
        const orders = stats.total_pay_order_count_for_roi2 || 0;
        const roi = stats.total_prepay_and_pay_order_roi2 || 0;

        logger.info('[LiveSync] 全域推广数据获取成功', {
          promo_id: adInfo.id, name: adInfo.name, status: adInfo.status,
          cost: costRaw / 100000, gmv: gmvRaw / 100000, orders, roi,
          anchor: roomInfo.anchor_name,
        });

        return {
          _source: 'uni_promotion',
          _is_living: adInfo.status === 'DELIVERY_OK',
          stat_cost: costRaw / 100000,        // 转换为元
          pay_order_count: orders,
          pay_order_amount: gmvRaw / 100000,   // 转换为元
          roi: roi,
          roi_goal: adInfo.roi2_goal || 0,
          promo_name: adInfo.name,
          promo_status: adInfo.status,
          anchor_name: roomInfo.anchor_name,
        };
      }
    }
    return null;
  } catch (e) {
    logger.warn('[LiveSync] 全域推广数据获取失败', { error: e.message });
    return null;
  }
}

/**
 * 通过千川API获取直播间投产数据
 * 使用 /v1.0/qianchuan/report/custom/get/ 接口
 */
async function fetchLiveAdData(advertiserId, accessToken) {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const resp = await axios.post(`${OE_API_BASE}/v1.0/qianchuan/report/custom/get/`, {
      advertiser_id: parseInt(advertiserId),
      start_date: today,
      end_date: today,
      fields: ['stat_cost', 'pay_order_count', 'pay_order_amount', 'show_cnt', 'click_cnt', 'convert_cnt'],
    }, {
      headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    if (resp.data?.code === 0 && resp.data?.data?.list) {
      return resp.data.data.list;
    }
    return null;
  } catch (e) {
    logger.warn('[LiveSync] 千川投产数据拉取失败', { error: e.message });
    return null;
  }
}

/**
 * 获取今日千川消耗汇总（从已有的 qc_daily_stats 表）
 * 汇总所有活跃账号的数据，不限于单个账号
 */
async function getTodayAdStats() {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const [rows] = await db.query(
      `SELECT SUM(cost) as total_cost, SUM(cpm) as total_gmv, SUM(convert_cnt) as total_orders,
       SUM(show_cnt) as total_show, SUM(click_cnt) as total_click
       FROM qc_daily_stats WHERE stat_date = ?`,
      [today]
    );
    return rows[0] || null;
  } catch (e) {
    return null;
  }
}

// ============ 核心同步逻辑 ============

/**
 * 同步所有活跃直播间的实时数据
 */
async function syncLiveRooms() {
  logger.info('[LiveSync] 开始同步直播间数据...');

  try {
    // 1. 获取所有活跃的直播间
    const [rooms] = await db.query(
      `SELECT * FROM live_rooms WHERE status = 'active'`
    );

    if (!rooms.length) {
      logger.info('[LiveSync] 没有需要监控的直播间');
      return;
    }

    // 2. 获取有效的千川Token
    const auth = await getValidToken();
    if (!auth) {
      logger.warn('[LiveSync] 无法获取有效Token，使用本地数据源');
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // 3. 遍历所有活跃账号获取授权抖音号
    const [allAccounts] = await db.query(
      `SELECT * FROM qc_accounts WHERE status = 1 AND access_token IS NOT NULL ORDER BY account_type = 'live' DESC`
    );

    for (const room of rooms) {
      try {
        let data = null;

        // 3. 用各个账号的token获取授权抖音号并匹配
        let matchedAwemeId = null;
        let matchedAcc = null;
        for (const acc of allAccounts) {
          const awemeList = await getAuthorizedAweme(acc.advertiser_id, acc.access_token);
          const matched = matchAweme(room, awemeList);
          if (matched) {
            matchedAwemeId = matched.aweme_id;
            matchedAcc = acc;
            // 先尝试 today_live 接口
            data = await fetchLiveRealtimeFromAPI(acc.advertiser_id, acc.access_token, matched.aweme_id);
            if (data && data.room_list?.length > 0) break;
            // today_live 返回空（全域推广场景），尝试 uni_promotion/list
            if (!data || !data.online_user_count) {
              logger.info('[LiveSync] today_live无数据，尝试全域推广接口', { room: room.nickname, aweme: matched.aweme_name });
              const uniData = await fetchUniPromotionData(acc.advertiser_id, acc.access_token, matched.aweme_show_id || matched.aweme_name);
              if (uniData) {
                data = uniData;
                break;
              }
            }
            if (data) break;
          }
        }

        // 4. 从 qc_daily_stats 汇总所有账号的千川投产数据
        const adStats = await getTodayAdStats();

        // 5. 获取上一条记录用于计算趋势
        const [lastRecord] = await db.query(
          `SELECT * FROM live_realtime_data WHERE room_id = ? ORDER BY recorded_at DESC LIMIT 1`,
          [room.id]
        );
        const prev = lastRecord[0] || null;

        // 6. 构建数据记录
        const record = buildRealtimeRecord(room, data, adStats, prev);

        // 7. 写入 live_realtime_data
        await db.query(
          `INSERT INTO live_realtime_data (room_id, recorded_at, online_count, enter_count, leave_count,
           total_viewers, peak_count, avg_stay_seconds, interact_rate, comment_count, like_count, share_count,
           product_click, cart_count, order_count, gmv, uv_value, gpm,
           source_organic, source_paid, source_video, source_search, source_follow,
           qianchuan_cost, qianchuan_roi, paid_uv, paid_gmv)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [room.id, now, record.online_count, record.enter_count, record.leave_count,
           record.total_viewers, record.peak_count, record.avg_stay_seconds, record.interact_rate,
           record.comment_count, record.like_count, record.share_count,
           record.product_click, record.cart_count, record.order_count, record.gmv,
           record.uv_value, record.gpm,
           record.source_organic, record.source_paid, record.source_video, record.source_search, record.source_follow,
           record.qianchuan_cost, record.qianchuan_roi, record.paid_uv, record.paid_gmv]
        );

        // 8. 更新直播间状态（全域推广投放中 or 在线人数>0 均视为直播中）
        const isLiving = record.online_count > 0 || (data?._source === 'uni_promotion' && data?._is_living);
        await db.query(
          `UPDATE live_rooms SET is_living = ?, last_check_at = ? WHERE id = ?`,
          [isLiving ? 1 : 0, now, room.id]
        );

        // 9. 异常检测
        if (prev) {
          await checkAlerts(room, record, prev);
        }

        logger.info(`[LiveSync] ${room.nickname || room.room_id} 数据已更新`, {
          online: record.online_count, gmv: record.gmv, cost: record.qianchuan_cost
        });

      } catch (e) {
        logger.error(`[LiveSync] 同步直播间 ${room.room_id} 失败`, { error: e.message });
      }
    }

    logger.info('[LiveSync] 直播间数据同步完成');
  } catch (e) {
    logger.error('[LiveSync] 同步流程异常', { error: e.message });
  }
}

/**
 * 构建实时数据记录
 * 优先使用API数据，其次使用本地千川统计数据
 */
function buildRealtimeRecord(room, apiData, adStats, prev) {
  // 全域推广数据（来自 uni_promotion/list）
  if (apiData && apiData._source === 'uni_promotion') {
    // 优先使用全域推广数据，回退到qc_daily_stats汇总
    const uniCost = apiData.stat_cost || 0;
    const uniGmv = apiData.pay_order_amount || 0;
    const uniOrders = apiData.pay_order_count || 0;
    // 汇总所有账号的千川数据
    const totalCost = adStats?.total_cost || uniCost || 0;
    const totalGmv = adStats?.total_gmv || uniGmv || 0;
    const totalOrders = adStats?.total_orders || uniOrders || 0;
    const totalConverts = adStats?.total_orders || uniOrders || 0;
    const totalShow = adStats?.total_show || 0;
    const totalClick = adStats?.total_click || 0;
    const roi = apiData.roi || (totalCost > 0 ? totalGmv / totalCost : 0);
    // 从千川消耗推算付费UV（千川均价约50-80元/千次曝光，按60估算）
    const estimatedPaidUV = totalCost > 0 ? Math.round(totalCost / 0.06) : 0;
    // 从订单推算商品点击和加购（行业平均：点击→加购30%，加购→成交40%）
    const estimatedProductClick = Math.round(totalOrders / 0.12);
    const estimatedCart = Math.round(totalOrders / 0.4);
    const uvValue = estimatedPaidUV > 0 ? (totalGmv / estimatedPaidUV) : 0;
    const gpm = estimatedPaidUV > 0 ? (totalGmv / estimatedPaidUV * 1000) : 0;
    return {
      online_count: apiData._is_living ? Math.max(prev?.online_count || 1, 1) : 0,
      enter_count: estimatedPaidUV,
      leave_count: 0,
      total_viewers: estimatedPaidUV,
      peak_count: Math.max(prev?.peak_count || 0, prev?.online_count || 0),
      avg_stay_seconds: 0,
      interact_rate: totalConverts > 0 && estimatedPaidUV > 0 ? (totalConverts / estimatedPaidUV * 100) : 0,
      comment_count: 0,
      like_count: 0,
      share_count: 0,
      product_click: estimatedProductClick,
      cart_count: estimatedCart,
      order_count: totalOrders,
      gmv: totalGmv,
      uv_value: uvValue,
      gpm: gpm,
      source_organic: 0,
      source_paid: estimatedPaidUV,
      source_video: 0,
      source_search: 0,
      source_follow: 0,
      qianchuan_cost: totalCost,
      qianchuan_roi: roi,
      paid_uv: estimatedPaidUV,
      paid_gmv: totalGmv,
    };
  }

  // 如果有API直播数据（today_live接口）
  if (apiData) {
    const flow = apiData._flow || {};
    const user = apiData._user || {};
    const online = apiData.online_user_count || apiData.watch_cnt || apiData.online_count || user.online_user_count || 0;
    return {
      online_count: online,
      enter_count: apiData.watch_cnt || apiData.room_enter_cnt || user.watch_cnt || 0,
      leave_count: 0,
      total_viewers: apiData.total_watch_cnt || apiData.cumulative_watch_cnt || apiData.total_user || user.total_watch_cnt || 0,
      peak_count: Math.max(online, prev?.peak_count || 0, apiData.max_online_user_count || 0),
      avg_stay_seconds: apiData.avg_watch_duration || apiData.avg_online_duration || user.avg_watch_duration || 0,
      interact_rate: apiData.interact_rate || apiData.interaction_rate || 0,
      comment_count: apiData.comment_cnt || apiData.comment_count || 0,
      like_count: apiData.like_cnt || apiData.like_count || 0,
      share_count: apiData.share_cnt || apiData.share_count || 0,
      product_click: apiData.product_click_count || apiData.product_click_cnt || 0,
      cart_count: apiData.cart_count || apiData.cart_cnt || 0,
      order_count: apiData.pay_order_count || apiData.pay_cnt || adStats?.total_orders || 0,
      gmv: apiData.pay_order_amount || apiData.pay_amount || apiData.gmv || adStats?.total_gmv || 0,
      uv_value: apiData.uv_value || 0,
      gpm: apiData.gpm || 0,
      source_organic: flow.organic_watch_cnt || apiData.natural_watch_cnt || 0,
      source_paid: flow.paid_watch_cnt || apiData.paid_watch_cnt || 0,
      source_video: flow.short_video_watch_cnt || apiData.video_watch_cnt || 0,
      source_search: flow.search_watch_cnt || apiData.search_watch_cnt || 0,
      source_follow: flow.follow_watch_cnt || apiData.follow_watch_cnt || 0,
      qianchuan_cost: adStats?.total_cost || apiData.stat_cost || 0,
      qianchuan_roi: (adStats?.total_cost || apiData.stat_cost) > 0 ? ((adStats?.total_gmv || apiData.pay_order_amount || 0) / (adStats?.total_cost || apiData.stat_cost)) : 0,
      paid_uv: flow.paid_watch_cnt || apiData.paid_watch_cnt || 0,
      paid_gmv: apiData.paid_pay_amount || 0,
    };
  }

  // 无API数据时使用千川投产数据
  const cost = adStats?.total_cost || 0;
  const gmv = adStats?.total_gmv || 0;
  const orders = adStats?.total_orders || 0;

  return {
    online_count: 0,
    enter_count: 0,
    leave_count: 0,
    total_viewers: prev?.total_viewers || 0,
    peak_count: prev?.peak_count || 0,
    avg_stay_seconds: 0,
    interact_rate: 0,
    comment_count: 0,
    like_count: 0,
    share_count: 0,
    product_click: 0,
    cart_count: 0,
    order_count: orders,
    gmv: gmv,
    uv_value: 0,
    gpm: 0,
    source_organic: 0,
    source_paid: 0,
    source_video: 0,
    source_search: 0,
    source_follow: 0,
    qianchuan_cost: cost,
    qianchuan_roi: cost > 0 ? (gmv / cost) : 0,
    paid_uv: 0,
    paid_gmv: 0,
  };
}

// ============ 异常预警检测 ============

async function checkAlerts(room, current, prev) {
  try {
    const alerts = [];
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // 获取预警配置
    const [configs] = await db.query(`SELECT * FROM live_alert_configs WHERE enabled = 1`);
    const configMap = {};
    configs.forEach(c => { configMap[c.alert_type] = JSON.parse(c.threshold_json || '{}'); });

    // 在线人数突降
    if (prev.online_count > 50 && current.online_count > 0) {
      const dropPct = ((prev.online_count - current.online_count) / prev.online_count) * 100;
      const threshold = configMap.online?.突降阈值 || 30;
      if (dropPct >= threshold) {
        alerts.push({
          alert_type: 'online_drop', alert_level: dropPct >= 60 ? 'critical' : 'warning',
          title: '在线人数大幅下降',
          description: `在线人数从 ${prev.online_count} 降至 ${current.online_count}，降幅 ${dropPct.toFixed(1)}%`,
          cause: '可能原因：千川投流到期/被限流/直播内容吸引力下降',
          metric_before: prev.online_count, metric_after: current.online_count, change_pct: -dropPct,
        });
      }
    }

    // 在线人数突增
    if (prev.online_count > 10 && current.online_count > 0) {
      const surgePct = ((current.online_count - prev.online_count) / prev.online_count) * 100;
      const threshold = configMap.online?.突增阈值 || 50;
      if (surgePct >= threshold) {
        alerts.push({
          alert_type: 'online_surge', alert_level: 'info',
          title: '在线人数突增',
          description: `在线人数从 ${prev.online_count} 增至 ${current.online_count}，涨幅 ${surgePct.toFixed(1)}%`,
          cause: '可能原因：千川投流起量/爆款话术命中/推荐流量倾斜',
          metric_before: prev.online_count, metric_after: current.online_count, change_pct: surgePct,
        });
      }
    }

    // ROI异常
    if (current.qianchuan_cost > 100 && prev.qianchuan_cost > 100) {
      const roiThreshold = configMap.roi?.最低ROI || 1.5;
      if (current.qianchuan_roi < roiThreshold && prev.qianchuan_roi >= roiThreshold) {
        alerts.push({
          alert_type: 'roi_drop', alert_level: 'critical',
          title: 'ROI跌破预警线',
          description: `千川ROI从 ${prev.qianchuan_roi.toFixed(2)} 降至 ${current.qianchuan_roi.toFixed(2)}，低于阈值 ${roiThreshold}`,
          cause: '可能原因：转化率下降/竞价成本上升/素材疲劳',
          metric_before: prev.qianchuan_roi, metric_after: current.qianchuan_roi, change_pct: 0,
        });
      }
    }

    // 写入预警
    for (const alert of alerts) {
      await db.query(
        `INSERT INTO live_alerts (room_id, alert_type, alert_level, title, description, cause, metric_before, metric_after, change_pct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [room.id, alert.alert_type, alert.alert_level, alert.title, alert.description, alert.cause,
         alert.metric_before, alert.metric_after, alert.change_pct]
      );
      logger.warn(`[LiveSync] 预警: ${alert.title}`, { room: room.nickname, level: alert.alert_level });

      // WebSocket 推送预警
      if (typeof global.wsBroadcast === 'function') {
        global.wsBroadcast({ type: 'live_alert', data: { ...alert, room_name: room.nickname } });
      }
    }
  } catch (e) {
    logger.error('[LiveSync] 异常检测失败', { error: e.message });
  }
}

module.exports = { syncLiveRooms };
