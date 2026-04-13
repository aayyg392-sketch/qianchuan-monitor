const express = require('express');
const router = express.Router();
const axios = require('axios');
const dayjs = require('dayjs');
const db = require('../db');
const logger = require('../logger');

// 获取微信小店access_token
async function getShopToken() {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('wx_shop_app_id','wx_shop_app_secret')"
  );
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  if (!cfg.wx_shop_app_id || !cfg.wx_shop_app_secret) throw new Error('微信小店AppID/Secret未配置');
  const res = await axios.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${cfg.wx_shop_app_id}&secret=${cfg.wx_shop_app_secret}`, { timeout: 10000 });
  if (!res.data.access_token) throw new Error('获取token失败');
  return res.data.access_token;
}

function fen2yuan(val) { return (parseFloat(val || 0) / 100).toFixed(2); }

// ========== 同步函数：拉取微信API写入数据库 ==========
async function syncCompassData(daysBack = 7) {
  const token = await getShopToken();
  let synced = 0;
  for (let i = 1; i <= daysBack; i++) {
    const ds = dayjs().subtract(i, 'day').format('YYYYMMDD');
    try {
      // 检查是否已有数据（历史数据不重复拉）
      const [existing] = await db.query('SELECT id FROM wx_compass_daily WHERE ds=?', [ds]);
      if (existing && existing.length > 0 && i > 1) continue; // 昨天每次更新，其余跳过

      const res = await axios.post(
        `https://api.weixin.qq.com/channels/ec/compass/shop/overall/get?access_token=${token}`,
        { ds }, { timeout: 10000 }
      );
      if (res.data.errcode !== 0 || !res.data.data || !res.data.data.pay_gmv) continue;
      const d = res.data.data;

      // 拉达人数据
      let finderData = '[]';
      try {
        const fRes = await axios.post(
          `https://api.weixin.qq.com/channels/ec/compass/shop/finder/list/get?access_token=${token}`,
          { ds }, { timeout: 10000 }
        );
        if (fRes.data.errcode === 0 && fRes.data.finder_list) {
          finderData = JSON.stringify(fRes.data.finder_list);
        }
      } catch (e) { /* ignore */ }

      await db.query(
        `INSERT INTO wx_compass_daily (ds, pay_gmv, pay_uv, pay_order_cnt, product_click_uv, pay_refund_gmv, live_pay_gmv, feed_pay_gmv, finder_data, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE pay_gmv=VALUES(pay_gmv), pay_uv=VALUES(pay_uv), pay_order_cnt=VALUES(pay_order_cnt),
           product_click_uv=VALUES(product_click_uv), pay_refund_gmv=VALUES(pay_refund_gmv),
           live_pay_gmv=VALUES(live_pay_gmv), feed_pay_gmv=VALUES(feed_pay_gmv),
           finder_data=VALUES(finder_data), synced_at=NOW()`,
        [ds, d.pay_gmv || 0, d.pay_uv || 0, d.pay_order_cnt || 0, d.product_click_uv || 0,
         d.pay_refund_gmv || 0, d.live_pay_gmv || 0, d.feed_pay_gmv || 0, finderData]
      );
      synced++;
    } catch (e) {
      logger.warn(`[WxCompass] 同步 ${ds} 失败: ${e.message}`);
    }
  }
  logger.info(`[WxCompass] 同步完成, ${synced}天数据已更新`);
  return synced;
}

// ========== 同步当天订单数据到数据库 ==========
async function syncTodayOrders() {
  try {
    const token = await getShopToken();
    const now = Math.floor(Date.now() / 1000);
    const todayDs = dayjs().format('YYYYMMDD');
    const todayStart = Math.floor(new Date(dayjs().format('YYYY-MM-DD')).getTime() / 1000);

    // 拉取所有今日订单ID
    let allIds = [], nextKey = '', hasMore = true;
    while (hasMore) {
      const r = await axios.post(`https://api.weixin.qq.com/channels/ec/order/list/get?access_token=${token}`,
        { create_time_range: { start_time: todayStart, end_time: now }, page_size: 100, next_key: nextKey },
        { timeout: 10000 });
      allIds = allIds.concat(r.data.order_id_list || []);
      nextKey = r.data.next_key || '';
      hasMore = r.data.has_more || false;
      if (allIds.length > 2000) break;
    }

    // 批量获取订单详情汇总（按渠道+小时区分）
    let totalGmv = 0, totalOrders = 0, totalRefund = 0;
    let liveGmv = 0, feedGmv = 0;
    const buyerSet = new Set();
    const finderMap = {}; // 达人维度
    const hourlyMap = {}; // 按小时汇总

    for (const orderId of allIds) {
      try {
        const r = await axios.post(`https://api.weixin.qq.com/channels/ec/order/get?access_token=${token}`,
          { order_id: orderId }, { timeout: 5000 });
        const order = r.data.order;
        if (!order) continue;
        const price = order.order_detail?.price_info || {};
        const ext = order.order_detail?.ext_info || {};
        const status = order.status;
        const orderPrice = parseInt(price.product_price || price.order_price || 0); // 用商品原价，与小店罗盘口径一致
        const scene = ext.order_scene; // 1=橱窗/短视频, 3=直播

        if (status >= 20 && status !== 200) { // 已付款（含已发货、已完成、已退款），排除已取消(200)
          totalGmv += orderPrice;
          totalOrders++;
          if (order.openid) buyerSet.add(order.openid);

          // 按小时汇总（含渠道）
          const payTime = order.order_detail?.pay_info?.pay_time;
          const hour = payTime ? dayjs.unix(payTime).format('HH') : dayjs.unix(order.create_time).format('HH');
          if (!hourlyMap[hour]) hourlyMap[hour] = { gmv: 0, orders: 0, live: 0, feed: 0, finder: 0 };
          hourlyMap[hour].gmv += orderPrice;
          hourlyMap[hour].orders++;
          if (scene === 3) hourlyMap[hour].live += orderPrice;
          else if (scene === 1) hourlyMap[hour].feed += orderPrice;
          if (ext.finder_id) hourlyMap[hour].finder += orderPrice;

          // 渠道区分: 1=橱窗/短视频, 2=达人带货, 3=直播
          if (scene === 3) {
            liveGmv += orderPrice;
          } else if (scene === 1) {
            feedGmv += orderPrice;
          }
          // scene=2(达人带货)不归入直播也不归入短视频，单独在达人维度统计

          // 达人维度（所有有finder_id的订单，含直播/短视频/达人带货）
          const finderId = ext.finder_id || '';
          const source = order.order_detail?.source_infos?.[0];
          const finderName = source?.account_nickname || finderId;
          if (finderId) {
            if (!finderMap[finderId]) finderMap[finderId] = { nickname: finderName, gmv: 0, orders: 0 };
            finderMap[finderId].gmv += orderPrice;
            finderMap[finderId].orders++;
          }
        }
        if (status === 250) totalRefund += orderPrice;
      } catch (e) { /* skip */ }
    }

    // 达人数据JSON
    const finderList = Object.entries(finderMap).map(([id, d]) => ({
      finder_id: id, finder_nickname: d.nickname, data: { pay_gmv: String(d.gmv), pay_uv: String(d.orders), pay_product_id_cnt: '0' }
    }));

    // 写入数据库（含小时数据）
    const hourlyJson = JSON.stringify(hourlyMap);
    await db.query(
      `INSERT INTO wx_compass_daily (ds, pay_gmv, pay_uv, pay_order_cnt, product_click_uv, pay_refund_gmv, live_pay_gmv, feed_pay_gmv, finder_data, hourly_data, synced_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE pay_gmv=VALUES(pay_gmv), pay_uv=VALUES(pay_uv), pay_order_cnt=VALUES(pay_order_cnt),
         pay_refund_gmv=VALUES(pay_refund_gmv), live_pay_gmv=VALUES(live_pay_gmv), feed_pay_gmv=VALUES(feed_pay_gmv),
         finder_data=VALUES(finder_data), hourly_data=VALUES(hourly_data), synced_at=NOW()`,
      [todayDs, totalGmv, buyerSet.size, totalOrders, totalRefund, liveGmv, feedGmv, JSON.stringify(finderList), hourlyJson]
    );

    logger.info(`[WxCompass] 今日订单同步完成: ${totalOrders}单, GMV=¥${(totalGmv/100).toFixed(2)}, 直播=¥${(liveGmv/100).toFixed(2)}, 短视频=¥${(feedGmv/100).toFixed(2)}, 达人${finderList.length}个`);
    return { pay_gmv: totalGmv, pay_uv: buyerSet.size, pay_order_cnt: totalOrders, pay_refund_gmv: totalRefund, live_pay_gmv: liveGmv, feed_pay_gmv: feedGmv };
  } catch (e) {
    logger.error('[WxCompass] syncTodayOrders error: ' + e.message);
    return null;
  }
}

// ========== 同步指定日期订单小时数据 ==========
async function syncOrdersByDate(ds) {
  try {
    const token = await getShopToken();
    const dayStart = Math.floor(dayjs(ds, 'YYYYMMDD').startOf('day').valueOf() / 1000);
    const dayEnd = Math.floor(dayjs(ds, 'YYYYMMDD').endOf('day').valueOf() / 1000);

    let allIds = [], nextKey = '', hasMore = true;
    while (hasMore) {
      const r = await axios.post(`https://api.weixin.qq.com/channels/ec/order/list/get?access_token=${token}`,
        { create_time_range: { start_time: dayStart, end_time: dayEnd }, page_size: 100, next_key: nextKey },
        { timeout: 10000 });
      allIds = allIds.concat(r.data.order_id_list || []);
      nextKey = r.data.next_key || '';
      hasMore = r.data.has_more || false;
      if (allIds.length > 2000) break;
    }

    const hourlyMap = {};
    for (const orderId of allIds) {
      try {
        const r = await axios.post(`https://api.weixin.qq.com/channels/ec/order/get?access_token=${token}`,
          { order_id: orderId }, { timeout: 5000 });
        const order = r.data.order;
        if (!order) continue;
        const price = order.order_detail?.price_info || {};
        const ext = order.order_detail?.ext_info || {};
        const status = order.status;
        const orderPrice = parseInt(price.product_price || price.order_price || 0);
        if (status >= 20 && status !== 200) {
          const payTime = order.order_detail?.pay_info?.pay_time;
          const hour = payTime ? dayjs.unix(payTime).format('HH') : dayjs.unix(order.create_time).format('HH');
          if (!hourlyMap[hour]) hourlyMap[hour] = { gmv: 0, orders: 0, live: 0, feed: 0, finder: 0 };
          hourlyMap[hour].gmv += orderPrice;
          hourlyMap[hour].orders++;
          if (ext.order_scene === 3) hourlyMap[hour].live += orderPrice;
          else if (ext.order_scene === 1) hourlyMap[hour].feed += orderPrice;
          if (ext.finder_id) hourlyMap[hour].finder += orderPrice;
        }
      } catch (e) { /* skip */ }
    }

    await db.query('UPDATE wx_compass_daily SET hourly_data=? WHERE ds=?', [JSON.stringify(hourlyMap), ds]);
    logger.info(`[WxCompass] ${ds} 小时数据同步完成: ${allIds.length}单`);
  } catch (e) {
    logger.error(`[WxCompass] syncOrdersByDate ${ds} error: ${e.message}`);
  }
}

// ========== API: 经营概览 ==========
router.get('/overview', async (req, res) => {
  try {
    const { range = '7' } = req.query;
    let days = parseInt(range) || 7;
    const isToday = range === '1' || range === 'today';
    const isYesterday = range === '1d' || range === 'yesterday';

    // 今天/昨天 = 单日
    if (isToday || isYesterday) days = 1;

    // 查询日期范围
    let startDs, endDs, dateLabel;
    if (isToday) {
      const todayDs = dayjs().format('YYYYMMDD');
      // 先从DB读缓存
      const [cached] = await db.query('SELECT * FROM wx_compass_daily WHERE ds=?', [todayDs]);
      let todayRow = cached?.[0];

      // 没有缓存或缓存超过10分钟，后台触发同步（不阻塞响应）
      if (!todayRow || !todayRow.pay_gmv || dayjs().diff(dayjs(todayRow.synced_at), 'minute') > 10) {
        if (!todayRow || !todayRow.pay_gmv) {
          // 首次没数据，同步等待
          await syncTodayOrders();
          const [fresh] = await db.query('SELECT * FROM wx_compass_daily WHERE ds=?', [todayDs]);
          todayRow = fresh?.[0];
        } else {
          // 有旧缓存，后台异步刷新
          syncTodayOrders().catch(() => {});
        }
      }

      if (todayRow && todayRow.pay_gmv) {
        const updateTime = todayRow.synced_at ? dayjs(todayRow.synced_at).format('HH:mm') : '';
        // 按小时生成趋势（含各渠道）
        let hourlyData = {};
        try { hourlyData = todayRow.hourly_data ? (typeof todayRow.hourly_data === 'string' ? JSON.parse(todayRow.hourly_data) : todayRow.hourly_data) : {}; } catch { hourlyData = {}; }
        const currentHour = parseInt(dayjs().format('HH'));
        // 找第一个有数据的小时
        let startHour = currentHour;
        for (let h = 0; h <= currentHour; h++) {
          const hKey = String(h).padStart(2, '0');
          if (hourlyData[hKey] && hourlyData[hKey].gmv > 0) { startHour = h; break; }
        }
        const hourlyTrend = [], liveTrend = [], videoTrend = [], finderTrend = [];
        for (let h = startHour; h <= currentHour; h++) {
          const hKey = String(h).padStart(2, '0');
          const hData = hourlyData[hKey] || { gmv: 0, orders: 0, live: 0, feed: 0, finder: 0 };
          const label = `${hKey}:00`;
          hourlyTrend.push({ date: label, pay_gmv: fen2yuan(hData.gmv), pay_order_cnt: hData.orders });
          liveTrend.push({ date: label, pay_gmv: fen2yuan(hData.live || 0) });
          videoTrend.push({ date: label, pay_gmv: fen2yuan(hData.feed || 0) });
          finderTrend.push({ date: label, pay_gmv: fen2yuan(hData.finder || 0) });
        }

        return res.json({
          code: 0,
          data: {
            date_label: `今日（更新于${updateTime}）`,
            date_range: dayjs().format('YYYY/MM/DD'),
            pay_gmv: fen2yuan(todayRow.pay_gmv), pay_uv: parseInt(todayRow.pay_uv || 0),
            pay_order_cnt: parseInt(todayRow.pay_order_cnt || 0), product_click_uv: 0,
            pay_refund_gmv: fen2yuan(todayRow.pay_refund_gmv),
            pay_gmv_change: 0, pay_uv_change: 0, pay_order_cnt_change: 0,
            product_click_uv_change: 0, pay_refund_gmv_change: 0,
            trend: hourlyTrend,
            live_trend: liveTrend,
            live_total_gmv: fen2yuan(todayRow.live_pay_gmv),
            video_trend: videoTrend,
            video_total_gmv: fen2yuan(todayRow.feed_pay_gmv),
            finder_trend: finderTrend,
          },
        });
      }
      // 回退昨天
      endDs = dayjs().subtract(1, 'day').format('YYYYMMDD');
      startDs = endDs;
      dateLabel = '今日（数据同步中，显示昨日）';
    } else if (isYesterday) {
      // 昨天也按小时展示
      const yesterdayDs = dayjs().subtract(1, 'day').format('YYYYMMDD');
      const [ydRows] = await db.query('SELECT * FROM wx_compass_daily WHERE ds=?', [yesterdayDs]);
      const ydRow = ydRows?.[0];

      if (ydRow) {
        // 如果没有小时数据，触发昨日订单同步
        if (!ydRow.hourly_data) {
          await syncOrdersByDate(yesterdayDs);
          const [fresh] = await db.query('SELECT * FROM wx_compass_daily WHERE ds=?', [yesterdayDs]);
          if (fresh?.[0]?.hourly_data) Object.assign(ydRow, fresh[0]);
        }

        let hourlyData = {};
        try { hourlyData = ydRow.hourly_data ? (typeof ydRow.hourly_data === 'string' ? JSON.parse(ydRow.hourly_data) : ydRow.hourly_data) : {}; } catch { hourlyData = {}; }

        const hourlyTrend = [], liveTrend = [], videoTrend = [], finderTrend = [];
        let sH = 23;
        for (let h = 0; h <= 23; h++) { const k = String(h).padStart(2,'0'); if (hourlyData[k] && hourlyData[k].gmv > 0) { sH = h; break; } }
        for (let h = sH; h <= 23; h++) {
          const hKey = String(h).padStart(2, '0');
          const hData = hourlyData[hKey] || { gmv: 0, orders: 0, live: 0, feed: 0, finder: 0 };
          const label = `${hKey}:00`;
          hourlyTrend.push({ date: label, pay_gmv: fen2yuan(hData.gmv), pay_order_cnt: hData.orders || 0 });
          liveTrend.push({ date: label, pay_gmv: fen2yuan(hData.live || 0) });
          videoTrend.push({ date: label, pay_gmv: fen2yuan(hData.feed || 0) });
          finderTrend.push({ date: label, pay_gmv: fen2yuan(hData.finder || 0) });
        }

        return res.json({
          code: 0,
          data: {
            date_label: '昨日',
            date_range: dayjs().subtract(1, 'day').format('YYYY/MM/DD'),
            pay_gmv: fen2yuan(ydRow.pay_gmv), pay_uv: parseInt(ydRow.pay_uv || 0),
            pay_order_cnt: parseInt(ydRow.pay_order_cnt || 0),
            product_click_uv: parseInt(ydRow.product_click_uv || 0),
            pay_refund_gmv: fen2yuan(ydRow.pay_refund_gmv),
            pay_gmv_change: 0, pay_uv_change: 0, pay_order_cnt_change: 0,
            product_click_uv_change: 0, pay_refund_gmv_change: 0,
            trend: hourlyTrend,
            live_trend: liveTrend, live_total_gmv: fen2yuan(ydRow.live_pay_gmv),
            video_trend: videoTrend, video_total_gmv: fen2yuan(ydRow.feed_pay_gmv),
            finder_trend: finderTrend,
          },
        });
      }
      // 回退到通用逻辑
      endDs = yesterdayDs;
      startDs = endDs;
      dateLabel = '昨日';
    } else {
      endDs = dayjs().subtract(1, 'day').format('YYYYMMDD');
      startDs = dayjs().subtract(days, 'day').format('YYYYMMDD');
      dateLabel = `近${days}天`;
    }

    // 从数据库读取
    const [rows] = await db.query(
      'SELECT * FROM wx_compass_daily WHERE ds >= ? AND ds <= ? ORDER BY ds ASC',
      [startDs, endDs]
    );

    // 如果数据库无数据，触发一次同步
    if (!rows || rows.length === 0) {
      await syncCompassData(Math.max(days + 1, 7));
      const [rows2] = await db.query(
        'SELECT * FROM wx_compass_daily WHERE ds >= ? AND ds <= ? ORDER BY ds ASC',
        [startDs, endDs]
      );
      rows.length = 0;
      if (rows2) rows2.forEach(r => rows.push(r));
    }

    // 汇总
    let sumGmv = 0, sumUv = 0, sumOrders = 0, sumClickUv = 0, sumRefund = 0, sumLive = 0, sumVideo = 0;
    const trend = [], liveTrend = [], videoTrend = [];

    for (const r of rows) {
      sumGmv += parseInt(r.pay_gmv || 0);
      sumUv += parseInt(r.pay_uv || 0);
      sumOrders += parseInt(r.pay_order_cnt || 0);
      sumClickUv += parseInt(r.product_click_uv || 0);
      sumRefund += parseInt(r.pay_refund_gmv || 0);
      sumLive += parseInt(r.live_pay_gmv || 0);
      sumVideo += parseInt(r.feed_pay_gmv || 0);

      const dateLabel2 = dayjs(r.ds, 'YYYYMMDD').format('MM/DD');
      trend.push({ date: dateLabel2, ds: r.ds, pay_gmv: fen2yuan(r.pay_gmv), pay_order_cnt: parseInt(r.pay_order_cnt), pay_uv: parseInt(r.pay_uv), product_click_uv: parseInt(r.product_click_uv), pay_refund_gmv: fen2yuan(r.pay_refund_gmv) });
      liveTrend.push({ date: dateLabel2, pay_gmv: fen2yuan(r.live_pay_gmv) });
      videoTrend.push({ date: dateLabel2, pay_gmv: fen2yuan(r.feed_pay_gmv) });
    }

    // 上一周期环比
    const prevEndDs = dayjs(startDs, 'YYYYMMDD').subtract(1, 'day').format('YYYYMMDD');
    const prevStartDs = dayjs(prevEndDs, 'YYYYMMDD').subtract(days - 1, 'day').format('YYYYMMDD');
    const [prevRows] = await db.query(
      'SELECT SUM(pay_gmv) as gmv, SUM(pay_uv) as uv, SUM(pay_order_cnt) as orders, SUM(product_click_uv) as click, SUM(pay_refund_gmv) as refund FROM wx_compass_daily WHERE ds >= ? AND ds <= ?',
      [prevStartDs, prevEndDs]
    );
    const prev = prevRows?.[0] || {};

    function calcChange(cur, prev) {
      const p = parseFloat(prev || 0);
      if (p === 0) return 0;
      return ((cur - p) / p * 100).toFixed(2);
    }

    res.json({
      code: 0,
      data: {
        date_label: dateLabel,
        date_range: startDs.replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3') + ' 至 ' + endDs.replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3'),
        pay_gmv: fen2yuan(sumGmv), pay_uv: sumUv, pay_order_cnt: sumOrders,
        product_click_uv: sumClickUv, pay_refund_gmv: fen2yuan(sumRefund),
        pay_gmv_change: calcChange(sumGmv, prev.gmv),
        pay_uv_change: calcChange(sumUv, prev.uv),
        pay_order_cnt_change: calcChange(sumOrders, prev.orders),
        product_click_uv_change: calcChange(sumClickUv, prev.click),
        pay_refund_gmv_change: calcChange(sumRefund, prev.refund),
        trend, live_trend: liveTrend, live_total_gmv: fen2yuan(sumLive),
        video_trend: videoTrend, video_total_gmv: fen2yuan(sumVideo),
      },
    });
  } catch (e) {
    logger.error('[WxCompass] overview error', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

// ========== API: 合作达人 ==========
router.get('/finders', async (req, res) => {
  try {
    const rangeParam = req.query.range || '7';
    const isToday = rangeParam === 'today' || rangeParam === '1';
    const isYesterday = rangeParam === 'yesterday' || rangeParam === '1d';
    let days = parseInt(rangeParam) || 7;
    if (isToday || isYesterday) days = 1;

    const endDs = isToday ? dayjs().format('YYYYMMDD') : dayjs().subtract(1, 'day').format('YYYYMMDD');
    const startDs = isToday ? endDs : dayjs().subtract(days, 'day').format('YYYYMMDD');

    const [rows] = await db.query(
      'SELECT ds, finder_data, hourly_data FROM wx_compass_daily WHERE ds >= ? AND ds <= ? ORDER BY ds ASC',
      [startDs, endDs]
    );

    const finderMap = {};
    const trendData = [];

    for (const row of (rows || [])) {
      // 达人汇总
      if (row.finder_data) {
        let finderList = [];
        try { finderList = typeof row.finder_data === 'string' ? JSON.parse(row.finder_data) : row.finder_data; } catch { finderList = []; }
        let dayTotal = 0;
        for (const f of (finderList || [])) {
          const gmv = parseInt(f.data?.pay_gmv || 0);
          dayTotal += gmv;
          if (!finderMap[f.finder_id]) {
            finderMap[f.finder_id] = { finder_id: f.finder_id, nickname: f.finder_nickname, total_gmv: 0, pay_uv: 0, product_cnt: 0 };
          }
          finderMap[f.finder_id].total_gmv += gmv;
          finderMap[f.finder_id].pay_uv += parseInt(f.data?.pay_uv || 0);
          finderMap[f.finder_id].product_cnt = Math.max(finderMap[f.finder_id].product_cnt, parseInt(f.data?.pay_product_id_cnt || 0));
        }

        // 今天/昨天按小时趋势，其他按天
        if ((isToday || isYesterday) && row.hourly_data) {
          let hd = {};
          try { hd = typeof row.hourly_data === 'string' ? JSON.parse(row.hourly_data) : row.hourly_data; } catch { hd = {}; }
          const maxHour = isToday ? parseInt(dayjs().format('HH')) : 23;
          let sH = maxHour;
          for (let h = 0; h <= maxHour; h++) { const k = String(h).padStart(2,'0'); if (hd[k] && (hd[k].finder || hd[k].gmv) > 0) { sH = h; break; } }
          for (let h = sH; h <= maxHour; h++) {
            const hKey = String(h).padStart(2, '0');
            const hData = hd[hKey] || {};
            trendData.push({ date: `${hKey}:00`, pay_gmv: fen2yuan(hData.finder || 0) });
          }
        } else {
          trendData.push({ date: dayjs(row.ds, 'YYYYMMDD').format('MM/DD'), pay_gmv: fen2yuan(dayTotal) });
        }
      }
    }

    const finders = Object.values(finderMap).map(f => ({ ...f, pay_gmv: fen2yuan(f.total_gmv) }));
    finders.sort((a, b) => b.total_gmv - a.total_gmv);
    const total_gmv = finders.reduce((s, f) => s + f.total_gmv, 0);

    res.json({ code: 0, data: { finders, total_gmv: fen2yuan(total_gmv), total_finders: finders.length, trend: trendData } });
  } catch (e) {
    logger.error('[WxCompass] finders error', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

// ========== API: 手动同步 ==========
router.post('/sync', async (req, res) => {
  try {
    const days = parseInt(req.body.days || 30);
    const synced = await syncCompassData(days);
    res.json({ code: 0, data: { synced } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 导出同步函数给cron用
router.syncCompassData = syncCompassData;
router.syncTodayOrders = syncTodayOrders;
router.syncOrdersByDate = syncOrdersByDate;

module.exports = router;
