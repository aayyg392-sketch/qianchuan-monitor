const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');

// ===================== 建表 =====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_audience_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(30) NOT NULL,
        stat_date DATE NOT NULL,
        dimension VARCHAR(30) NOT NULL COMMENT 'gender|age|region|interest|active_time',
        dimension_key VARCHAR(100) NOT NULL,
        pay_order_count INT DEFAULT 0,
        pay_order_amount DECIMAL(14,2) DEFAULT 0,
        cost DECIMAL(14,2) DEFAULT 0,
        show_count BIGINT DEFAULT 0,
        click_count BIGINT DEFAULT 0,
        convert_count INT DEFAULT 0,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_adv_date_dim (advertiser_id, stat_date, dimension, dimension_key),
        KEY idx_adv_date (advertiser_id, stat_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[Audience] 表结构就绪');
  } catch (e) {
    logger.error('[Audience] 建表失败', { error: e.message });
  }
})();

// ===================== 巨量引擎受众分析API =====================
const OE_API_BASE = 'https://ad.oceanengine.com/open_api';

/**
 * 方案1：巨量引擎 Marketing API v2 受众分析报表
 * GET /2/report/audience/gender/   — 性别分布
 * GET /2/report/audience/age/      — 年龄分布
 * GET /2/report/audience/province/ — 省级地域分布
 * GET /2/report/audience/city/     — 市级地域分布
 * GET /2/report/audience/interest_action/ — 兴趣行为分布
 *
 * 需要在开放平台为APP开通「数据报表→受众分析」权限
 */
async function fetchAudienceFromMarketingAPI(advertiserId, accessToken, startDate, endDate) {
  const results = {};
  const endpoints = [
    { key: 'gender', path: '/2/report/audience/gender/' },
    { key: 'age', path: '/2/report/audience/age/' },
    { key: 'province', path: '/2/report/audience/province/' },
    { key: 'city', path: '/2/report/audience/city/' },
    { key: 'interest_action', path: '/2/report/audience/interest_action/' },
  ];

  for (const ep of endpoints) {
    try {
      const resp = await axios.get(`${OE_API_BASE}${ep.path}`, {
        params: {
          advertiser_id: advertiserId,
          start_date: startDate,
          end_date: endDate,
        },
        headers: { 'Access-Token': accessToken },
        timeout: 15000,
      });

      if (resp.data?.code === 0 && resp.data?.data?.list?.length > 0) {
        results[ep.key] = resp.data.data.list;
        logger.info(`[Audience] Marketing API ${ep.key} 成功, ${resp.data.data.list.length}条`);
      } else if (resp.data?.code === 40002) {
        logger.warn(`[Audience] Marketing API ${ep.key} 权限不足`, { msg: resp.data?.message });
        results._permissionError = true;
      } else if (resp.data?.code === 40105) {
        logger.warn(`[Audience] Marketing API ${ep.key} Token过期`);
        results._tokenExpired = true;
        break; // Token过期无需继续
      } else {
        logger.warn(`[Audience] Marketing API ${ep.key} 无数据`, { code: resp.data?.code, msg: resp.data?.message });
      }
    } catch (e) {
      logger.warn(`[Audience] Marketing API ${ep.key} 请求失败`, { error: e.message });
    }
  }

  return results;
}

/**
 * 方案1.5：千川版受众分析报表（千川专用端点）
 * GET /v1.0/qianchuan/report/audience/{dimension}/
 */
async function fetchAudienceFromQianchuanReport(advertiserId, accessToken, startDate, endDate) {
  const results = {};
  const endpoints = [
    { key: 'gender', path: '/v1.0/qianchuan/report/audience/gender/' },
    { key: 'age', path: '/v1.0/qianchuan/report/audience/age/' },
    { key: 'province', path: '/v1.0/qianchuan/report/audience/province/' },
    { key: 'city', path: '/v1.0/qianchuan/report/audience/city/' },
  ];

  for (const ep of endpoints) {
    try {
      const resp = await axios.get(`${OE_API_BASE}${ep.path}`, {
        params: {
          advertiser_id: advertiserId,
          start_date: startDate,
          end_date: endDate,
        },
        headers: { 'Access-Token': accessToken },
        timeout: 15000,
      });

      if (resp.data?.code === 0 && resp.data?.data?.list?.length > 0) {
        results[ep.key] = resp.data.data.list;
        logger.info(`[Audience] 千川受众API ${ep.key} 成功, ${resp.data.data.list.length}条`);
      } else if (resp.data?.code === 40002) {
        logger.warn(`[Audience] 千川受众API ${ep.key} 权限不足`);
        results._permissionError = true;
      } else if (resp.data?.code === 40105) {
        results._tokenExpired = true;
        break;
      } else {
        logger.warn(`[Audience] 千川受众API ${ep.key}`, { code: resp.data?.code, msg: resp.data?.message });
      }
    } catch (e) {
      logger.warn(`[Audience] 千川受众API ${ep.key} 失败`, { error: e.message });
    }
  }

  return results;
}

/**
 * 方案2：千川自定义报表API（备用方案）
 */
async function fetchAudienceFromQianchuan(advertiserId, accessToken, startDate, endDate) {
  const results = {};
  const dimensions = ['gender', 'age', 'city'];

  for (const dim of dimensions) {
    try {
      const resp = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/report/custom/get/`, {
        params: {
          advertiser_id: advertiserId,
          start_date: startDate,
          end_date: endDate,
          data_topic: 'ECP_BASIC_DATA',
          dimensions: JSON.stringify([dim]),
          metrics: JSON.stringify(['pay_order_count', 'pay_order_amount', 'stat_cost', 'show_cnt', 'click_cnt', 'convert_cnt']),
          filters: JSON.stringify([]),
          order_by: JSON.stringify([{ field: 'stat_cost', type: 0 }]),
          page: '1',
          page_size: '100',
        },
        headers: { 'Access-Token': accessToken },
        timeout: 10000,
      });

      if (resp.data?.code === 0 && resp.data?.data?.list?.length > 0) {
        results[dim] = resp.data.data.list;
        logger.info(`[Audience] 千川API ${dim} 成功, ${resp.data.data.list.length}条`);
      } else {
        logger.warn(`[Audience] 千川API ${dim} 无数据`, { code: resp.data?.code, msg: resp.data?.message });
      }
    } catch (e) {
      logger.warn(`[Audience] 千川API ${dim} 请求失败`, { error: e.message });
    }
  }

  return results;
}

// ===================== 从本地素材数据聚合 =====================
async function aggregateFromLocalData(advertiserId, startDate, endDate) {
  const result = {};

  result.gender = [];
  result.age = [];
  result.region = [];

  // 购买偏好 — 从素材标题和成交数据聚合产品线
  try {
    const query = advertiserId
      ? `SELECT title, SUM(pay_order_count) AS orders, SUM(pay_order_amount) AS gmv
         FROM qc_material_stats WHERE advertiser_id = ? AND stat_date BETWEEN ? AND ? AND pay_order_count > 0
         GROUP BY title ORDER BY orders DESC LIMIT 50`
      : `SELECT title, SUM(pay_order_count) AS orders, SUM(pay_order_amount) AS gmv
         FROM qc_material_stats WHERE stat_date BETWEEN ? AND ? AND pay_order_count > 0
         GROUP BY title ORDER BY orders DESC LIMIT 50`;
    const params = advertiserId ? [advertiserId, startDate, endDate] : [startDate, endDate];
    const [rows] = await db.query(query, params);

    const tagMap = {};
    const keywords = {
      // 雪玲妃产品线
      '百合': '百合系列', '绿泥': '绿泥面膜', '雪落': '雪落系列',
      '初薇': '初薇系列', '初晟': '初晟系列', '脆弱': '脆弱肌系列',
      // 品类词
      '洁面': '洁面产品', '清洁': '洁面产品', '洗面': '洁面产品',
      '面膜': '面膜产品', '贴片': '面膜产品', '涂抹': '涂抹面膜',
      '精华': '精华产品', '原液': '精华产品',
      '水乳': '水乳套装', '爽肤水': '水乳套装', '乳液': '水乳套装',
      '防晒': '防晒产品', '卸妆': '卸妆产品',
      '面霜': '面霜产品', '眼霜': '眼部护理',
    };

    for (const row of rows) {
      if (!row.title) continue;
      let matched = false;
      for (const [kw, tag] of Object.entries(keywords)) {
        if (row.title.includes(kw)) {
          if (!tagMap[tag]) tagMap[tag] = { count: 0, gmv: 0 };
          tagMap[tag].count += Number(row.orders);
          tagMap[tag].gmv += Number(row.gmv);
          matched = true;
        }
      }
      if (!matched) {
        if (!tagMap['其他产品']) tagMap['其他产品'] = { count: 0, gmv: 0 };
        tagMap['其他产品'].count += Number(row.orders);
        tagMap['其他产品'].gmv += Number(row.gmv);
      }
    }

    const totalOrders = Object.values(tagMap).reduce((s, v) => s + v.count, 0) || 1;
    result.interest = Object.entries(tagMap)
      .map(([key, v]) => ({ key, pay_order_count: v.count, pay_order_amount: v.gmv, pct: +(v.count / totalOrders * 100).toFixed(1) }))
      .sort((a, b) => b.pay_order_count - a.pay_order_count)
      .slice(0, 10);
  } catch (e) {
    logger.warn('[Audience] 购买偏好聚合失败', { error: e.message });
    result.interest = [];
  }

  // 活跃时段 — 基于小时粒度消耗（如有）或模拟
  try {
    // 先尝试从 qc_hourly_stats 获取真实小时粒度数据
    const hourlyQuery = advertiserId
      ? `SELECT stat_hour AS hour_key, SUM(cost) AS total_cost, SUM(pay_order_count) AS total_orders
         FROM qc_hourly_stats WHERE advertiser_id = ? AND stat_date BETWEEN ? AND ? GROUP BY stat_hour ORDER BY stat_hour`
      : `SELECT stat_hour AS hour_key, SUM(cost) AS total_cost, SUM(pay_order_count) AS total_orders
         FROM qc_hourly_stats WHERE stat_date BETWEEN ? AND ? GROUP BY stat_hour ORDER BY stat_hour`;
    const hourlyParams = advertiserId ? [advertiserId, startDate, endDate] : [startDate, endDate];
    const [hourlyRows] = await db.query(hourlyQuery, hourlyParams);

    if (hourlyRows && hourlyRows.length > 0) {
      const totalCost = hourlyRows.reduce((s, r) => s + Number(r.total_cost), 0) || 1;
      result.active_time = [];
      // 填充所有24小时
      for (let h = 0; h < 24; h++) {
        const row = hourlyRows.find(r => Number(r.hour_key) === h);
        const cost = row ? Number(row.total_cost) : 0;
        const orders = row ? Number(row.total_orders) : 0;
        result.active_time.push({
          key: String(h),
          pay_order_count: orders,
          cost: cost,
          pct: +(cost / totalCost * 100).toFixed(1),
        });
      }
    } else {
      // 无小时数据，使用日数据 + 典型电商时段权重
      const dailyQuery = advertiserId
        ? `SELECT SUM(pay_order_count) AS total_orders, SUM(cost) AS total_cost FROM qc_material_stats WHERE advertiser_id = ? AND stat_date BETWEEN ? AND ? AND cost > 0`
        : `SELECT SUM(pay_order_count) AS total_orders, SUM(cost) AS total_cost FROM qc_material_stats WHERE stat_date BETWEEN ? AND ? AND cost > 0`;
      const dailyParams = advertiserId ? [advertiserId, startDate, endDate] : [startDate, endDate];
      const [dailyRows] = await db.query(dailyQuery, dailyParams);

      const totalOrders = dailyRows[0]?.total_orders ? Number(dailyRows[0].total_orders) : 0;
      const days = dayjs(endDate).diff(dayjs(startDate), 'day') + 1;
      const avgDailyOrders = days > 0 ? totalOrders / days : 0;

      // 电商典型时段分布权重
      const hourWeights = [
        0.5, 0.3, 0.2, 0.1, 0.1, 0.2, 0.5, 1.0,
        2.0, 3.5, 5.0, 5.5, 4.0, 3.5, 4.5, 5.0,
        4.0, 3.5, 5.0, 8.0, 10.0, 9.0, 7.0, 3.0,
      ];
      const totalWeight = hourWeights.reduce((s, w) => s + w, 0);

      result.active_time = hourWeights.map((w, i) => ({
        key: String(i),
        pay_order_count: Math.round(avgDailyOrders * w / totalWeight),
        pct: +(w / totalWeight * 100).toFixed(1),
      }));
    }
  } catch (e) {
    logger.warn('[Audience] 活跃时段聚合失败', { error: e.message });
    result.active_time = [];
  }

  return result;
}

// ===================== GET /profile =====================
router.get('/profile', auth(), async (req, res) => {
  try {
    const startDate = req.query.start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDate = req.query.end_date || dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    // 查询所有账户的聚合数据（品牌级画像）
    const [cached] = await db.query(`
      SELECT dimension, dimension_key,
        SUM(pay_order_count) AS pay_order_count, SUM(pay_order_amount) AS pay_order_amount,
        SUM(cost) AS cost, SUM(show_count) AS show_count, SUM(click_count) AS click_count,
        SUM(convert_count) AS convert_count,
        MAX(fetched_at) AS last_fetched
      FROM qc_audience_stats
      WHERE stat_date BETWEEN ? AND ?
      GROUP BY dimension, dimension_key
    `, [startDate, endDate]);

    let data;
    if (cached.length > 0) {
      data = formatCachedData(cached);
      data._source = 'manual';
    } else {
      data = { gender: [], age: [], region: [], interest: [], active_time: [],
        order_value: [], order_freq: [], watch_days: [], repurchase: [],
        industry_pref: [], competitor: [], marketing_tool: [] };
      data._source = 'local';
    }

    // 补充购买偏好（从素材数据聚合）
    const localData = await aggregateFromLocalData(null, startDate, endDate);
    if (!data.interest || data.interest.length === 0) data.interest = localData.interest;
    if (!data.active_time || data.active_time.length === 0) data.active_time = localData.active_time;

    res.json({ code: 0, data });
  } catch (e) {
    logger.error('[Audience] /profile 错误', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: '获取人群画像失败: ' + e.message });
  }
});

// ===================== POST /sync — 手动同步 =====================
router.post('/sync', auth(), async (req, res) => {
  try {
    const { advertiser_id, start_date, end_date } = req.body;
    if (!advertiser_id) return res.json({ code: 400, msg: '缺少advertiser_id' });

    const startDate = start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDate = end_date || dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    // 先清除旧缓存
    await db.query(`
      DELETE FROM qc_audience_stats WHERE advertiser_id = ? AND stat_date BETWEEN ? AND ?
    `, [advertiser_id, startDate, endDate]);

    const [[account]] = await db.query(
      `SELECT access_token FROM qc_accounts WHERE advertiser_id = ? AND status = 1 AND access_token IS NOT NULL LIMIT 1`,
      [advertiser_id]
    );

    if (!account?.access_token) return res.json({ code: 400, msg: '该账户无有效Token，请先到「账户管理」重新授权' });

    const messages = [];

    let hasPermErr = false;
    let hasTokenErr = false;

    // 方案1：巨量引擎受众分析API
    let apiData = await fetchAudienceFromMarketingAPI(advertiser_id, account.access_token, startDate, endDate);
    if (apiData && !apiData._permissionError && !apiData._tokenExpired && hasValidData(apiData)) {
      await saveToCache(advertiser_id, startDate, endDate, apiData, 'marketing_api');
      const dims = Object.keys(apiData).filter(k => !k.startsWith('_') && Array.isArray(apiData[k]) && apiData[k].length > 0);
      messages.push(`巨量引擎受众API同步成功(${dims.join(',')})`);
    } else {
      if (apiData?._tokenExpired) {
        hasTokenErr = true;
        messages.push('⚠️ Token已过期，请到「账户管理」重新授权');
      } else if (apiData?._permissionError) {
        hasPermErr = true;
        messages.push('⚠️ 巨量引擎受众API权限不足');
      }

      // 方案2：千川受众分析端点
      if (!hasTokenErr) {
        const qcData = await fetchAudienceFromQianchuanReport(advertiser_id, account.access_token, startDate, endDate);
        if (qcData && !qcData._permissionError && !qcData._tokenExpired && hasValidData(qcData)) {
          await saveToCache(advertiser_id, startDate, endDate, qcData, 'qianchuan_audience');
          const dims = Object.keys(qcData).filter(k => !k.startsWith('_') && Array.isArray(qcData[k]) && qcData[k].length > 0);
          messages.push(`千川受众API同步成功(${dims.join(',')})`);
        } else {
          if (qcData?._tokenExpired) hasTokenErr = true;
          if (qcData?._permissionError) hasPermErr = true;

          // 方案3：千川自定义报表
          const customData = await fetchAudienceFromQianchuan(advertiser_id, account.access_token, startDate, endDate);
          if (customData && hasValidData(customData)) {
            await saveToCache(advertiser_id, startDate, endDate, customData, 'qianchuan_custom');
            const dims = Object.keys(customData).filter(k => Array.isArray(customData[k]) && customData[k].length > 0);
            messages.push(`千川报表API同步成功(${dims.join(',')})`);
          } else {
            messages.push('所有API均未返回受众数据');
          }
        }
      }

      if (hasPermErr) {
        messages.push('请在开放平台(open.oceanengine.com)为应用开通「数据报表→受众分析」权限');
      }
    }

    res.json({
      code: 0,
      msg: messages.join('\n'),
      needPermission: hasPermErr,
      needReAuth: hasTokenErr,
    });
  } catch (e) {
    logger.error('[Audience] /sync 错误', { error: e.message });
    res.json({ code: 500, msg: '同步失败: ' + e.message });
  }
});

// ===================== POST /manual — 手动录入数据 =====================
router.post('/manual', auth(), async (req, res) => {
  try {
    const { dimension, data, advertiser_id } = req.body;
    if (!dimension || !Array.isArray(data)) {
      return res.json({ code: 400, msg: '参数不完整' });
    }

    const statDate = dayjs().format('YYYY-MM-DD');

    // 如果指定了advertiser_id就用，否则写入所有活跃账户
    let accountIds = [];
    if (advertiser_id) {
      accountIds = [advertiser_id];
    } else {
      const [accounts] = await db.query(`SELECT advertiser_id FROM qc_accounts WHERE status = 1`);
      accountIds = accounts.map(a => a.advertiser_id);
      if (accountIds.length === 0) accountIds = ['brand_all'];
    }

    const values = [];
    for (const aid of accountIds) {
      for (const d of data) {
        if (!d.key) continue;
        values.push([
          aid, statDate, dimension, d.key,
          d.pay_order_count || 0, d.pay_order_amount || 0, d.cost || 0,
          d.show_count || 0, d.click_count || 0, d.convert_count || 0
        ]);
      }
    }

    if (values.length === 0) return res.json({ code: 400, msg: '无数据' });

    await db.query(`
      INSERT INTO qc_audience_stats
        (advertiser_id, stat_date, dimension, dimension_key, pay_order_count, pay_order_amount, cost, show_count, click_count, convert_count, fetched_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        pay_order_count = VALUES(pay_order_count),
        pay_order_amount = VALUES(pay_order_amount),
        cost = VALUES(cost),
        show_count = VALUES(show_count),
        click_count = VALUES(click_count),
        convert_count = VALUES(convert_count),
        fetched_at = NOW()
    `, [values]);

    res.json({ code: 0, msg: `手动录入 ${dimension} ${values.length} 条` });
  } catch (e) {
    logger.error('[Audience] /manual 错误', { error: e.message });
    res.json({ code: 500, msg: '录入失败: ' + e.message });
  }
});

// ===================== GET /accounts — 获取账户列表 =====================
router.get('/accounts', auth(), async (req, res) => {
  try {
    const [accounts] = await db.query(`
      SELECT advertiser_id, advertiser_name FROM qc_accounts WHERE status = 1 ORDER BY advertiser_id
    `);
    res.json({ code: 0, data: accounts });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /check-permission — 检查API权限 =====================
router.get('/check-permission', auth(), async (req, res) => {
  try {
    const { advertiser_id } = req.query;
    if (!advertiser_id) return res.json({ code: 400, msg: '缺少advertiser_id' });

    const [[account]] = await db.query(
      `SELECT access_token, token_expires_at FROM qc_accounts WHERE advertiser_id = ? AND status = 1 LIMIT 1`,
      [advertiser_id]
    );

    if (!account?.access_token) {
      return res.json({ code: 0, data: { tokenValid: false, audiencePermission: false, msg: '无有效Token' } });
    }

    // 检查token是否过期
    const tokenExpired = account.token_expires_at && dayjs().isAfter(dayjs(account.token_expires_at));

    // 尝试调用受众API检查权限
    let audiencePermission = false;
    let permissionMsg = '';
    if (!tokenExpired) {
      try {
        const resp = await axios.get(`${OE_API_BASE}/2/report/audience/gender/`, {
          params: { advertiser_id: advertiser_id, start_date: dayjs().subtract(7, 'day').format('YYYY-MM-DD'), end_date: dayjs().subtract(1, 'day').format('YYYY-MM-DD') },
          headers: { 'Access-Token': account.access_token },
          timeout: 10000,
        });
        if (resp.data?.code === 0) {
          audiencePermission = true;
          permissionMsg = '受众分析API权限正常';
        } else if (resp.data?.code === 40002) {
          permissionMsg = '缺少受众分析权限，请在开放平台开通「数据报表→受众分析」';
        } else if (resp.data?.code === 40105) {
          permissionMsg = 'Token已过期，请重新授权';
        } else {
          permissionMsg = resp.data?.message || '未知状态';
        }
      } catch (e) {
        permissionMsg = '检测失败: ' + e.message;
      }
    } else {
      permissionMsg = 'Token已过期，请重新授权';
    }

    res.json({
      code: 0,
      data: {
        tokenValid: !tokenExpired,
        tokenExpiresAt: account.token_expires_at,
        audiencePermission,
        msg: permissionMsg,
      }
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 辅助函数 =====================

function hasValidData(apiData) {
  return Object.keys(apiData).some(k => !k.startsWith('_') && Array.isArray(apiData[k]) && apiData[k].length > 0);
}

function formatCachedData(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.dimension]) grouped[row.dimension] = [];
    grouped[row.dimension].push({
      key: row.dimension_key,
      pay_order_count: Number(row.pay_order_count),
      pay_order_amount: Number(row.pay_order_amount),
      cost: Number(row.cost || 0),
      show_count: Number(row.show_count || 0),
    });
  }

  // 计算百分比
  for (const dim of Object.keys(grouped)) {
    const total = grouped[dim].reduce((s, v) => s + v.pay_order_count, 0) || 1;
    grouped[dim] = grouped[dim]
      .map(d => ({ ...d, pct: +(d.pay_order_count / total * 100).toFixed(1) }))
      .sort((a, b) => b.pay_order_count - a.pay_order_count);
  }

  // region优先使用province数据，如果没有则用city数据
  const regionData = grouped.region || grouped.city || [];

  return {
    gender: grouped.gender || [],
    age: grouped.age || [],
    region: regionData,
    interest: grouped.interest || [],
    active_time: grouped.active_time || [],
    order_value: grouped.order_value || [],
    order_freq: grouped.order_freq || [],
    watch_days: grouped.watch_days || [],
    repurchase: grouped.repurchase || [],
    industry_pref: grouped.industry_pref || [],
    competitor: grouped.competitor || [],
    marketing_tool: grouped.marketing_tool || [],
  };
}

async function saveToCache(advertiserId, startDate, endDate, apiData, source) {
  // apiData 格式:
  // Marketing API: { gender: [{gender: "FEMALE", cost: 123, ...}], age: [{age: "AGE_18_23", ...}], city: [{city_name: "...", ...}] }
  // 千川API: { gender: [{gender: "女", ...}], age: [{age: "18-23", ...}], city: [{city: "广州", ...}] }

  const dimensionHandlers = {
    gender: {
      dbDim: 'gender',
      extractKey: (item) => {
        // Marketing API: FEMALE/MALE/NONE → 女/男/未知
        const genderMap = { 'FEMALE': '女', 'MALE': '男', 'NONE': '未知', '女': '女', '男': '男' };
        return genderMap[item.gender] || item.key || item.gender || '未知';
      },
    },
    age: {
      dbDim: 'age',
      extractKey: (item) => {
        // Marketing API: AGE_18_23 → 18-23
        const ageStr = item.age || item.key || '';
        return ageStr.replace(/^AGE_/, '').replace(/_/g, '-');
      },
    },
    province: {
      dbDim: 'region',
      extractKey: (item) => item.province_name || item.province || item.key || '未知',
    },
    city: {
      dbDim: 'city',
      extractKey: (item) => item.city_name || item.city || item.key || '未知',
    },
    interest_action: {
      dbDim: 'interest',
      extractKey: (item) => item.interest_action_name || item.key || '未知',
    },
  };

  for (const [apiDim, handler] of Object.entries(dimensionHandlers)) {
    const list = apiData[apiDim];
    if (!Array.isArray(list) || list.length === 0) continue;

    const values = list.map(item => [
      advertiserId, startDate, handler.dbDim,
      handler.extractKey(item),
      item.pay_order_count || item.convert_cnt || 0,
      item.pay_order_amount || 0,
      item.stat_cost || item.cost || 0,
      item.show_cnt || item.show_count || 0,
      item.click_cnt || item.click_count || 0,
      item.convert_cnt || item.convert_count || 0,
    ]);

    try {
      await db.query(`
        INSERT INTO qc_audience_stats
          (advertiser_id, stat_date, dimension, dimension_key, pay_order_count, pay_order_amount, cost, show_count, click_count, convert_count, fetched_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          pay_order_count = VALUES(pay_order_count),
          pay_order_amount = VALUES(pay_order_amount),
          cost = VALUES(cost),
          show_count = VALUES(show_count),
          click_count = VALUES(click_count),
          convert_count = VALUES(convert_count),
          fetched_at = NOW()
      `, [values]);
      logger.info(`[Audience] 缓存 ${handler.dbDim} ${values.length}条 (${source})`);
    } catch (e) {
      logger.warn(`[Audience] 缓存 ${handler.dbDim} 维度失败`, { error: e.message });
    }
  }
}

module.exports = router;
