/**
 * 快手磁力 - 账户管理 API
 * 字段映射(与磁力后台对齐):
 *   花费 = charge
 *   曝光数 = show
 *   行为数 = bclick (磁力后台的"行为数")
 *   素材点击率 = photo_click_ratio * 100 (磁力后台的"素材点击率")
 *   素材点击数 = photo_click
 *   直接ROI = event_order_amount_roi (磁力后台的"直接ROI")
 *   转化数 = conversion_num
 *   GMV = event_order_paid_purchase_amount
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const auth = require('../middleware/auth');

const router = require('express').Router();
const BASE = 'https://ad.e.kuaishou.com/rest/openapi';
const KS_AD_REFRESH_URL = 'https://ad.e.kuaishou.com/rest/openapi/oauth2/authorize/refresh_token';

async function getAdConfig() {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('ks_ad_app_id', 'ks_ad_app_secret')"
  );
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  return cfg;
}

async function refreshAdTokenIfNeeded() {
  try {
    const [accounts] = await db.query('SELECT * FROM ks_ad_accounts WHERE status = 1');
    if (!accounts.length) return;

    const cfg = await getAdConfig();
    if (!cfg.ks_ad_app_id || !cfg.ks_ad_app_secret) return;

    // 按 refresh_token 分组刷新（同一次授权的账户共享token）
    const tokenGroups = {};
    accounts.forEach(a => {
      if (!tokenGroups[a.refresh_token]) tokenGroups[a.refresh_token] = { acc: a, ids: [] };
      tokenGroups[a.refresh_token].ids.push(a.advertiser_id);
    });

    const now = new Date();
    for (const group of Object.values(tokenGroups)) {
      const expiresAt = new Date(group.acc.token_expires_at);
      if (expiresAt.getTime() - now.getTime() > 7200000) continue;

      logger.info(`[KS-AD] Token即将过期，刷新${group.ids.length}个账户...`);
      try {
        const r = await axios.post(KS_AD_REFRESH_URL, {
          app_id: Number(cfg.ks_ad_app_id),
          secret: cfg.ks_ad_app_secret,
          refresh_token: group.acc.refresh_token
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

        if (r.data?.code === 0 && r.data?.data?.access_token) {
          const d = r.data.data;
          const tokenExpires = new Date(d.access_token_expires_time || Date.now() + (d.access_token_expires_in || 86400) * 1000);
          const refreshExpires = new Date(d.refresh_token_expires_time || Date.now() + (d.refresh_token_expires_in || 2592000) * 1000);
          const ph = group.ids.map(() => '?').join(',');
          await db.query(
            `UPDATE ks_ad_accounts SET access_token=?, refresh_token=?, token_expires_at=?, refresh_expires_at=? WHERE advertiser_id IN (${ph})`,
            [d.access_token, d.refresh_token, tokenExpires, refreshExpires, ...group.ids]
          );
          logger.info(`[KS-AD] Token刷新成功(${group.ids.length}个账户)`);
        }
      } catch (e) {
        logger.error('[KS-AD] Token刷新异常: ' + e.message);
      }
    }
  } catch (e) {
    logger.error('[KS-AD] Token自动刷新异常: ' + e.message);
  }
}

async function getAdAccounts(shopId) {
  if (shopId) {
    const [rows] = await db.query('SELECT * FROM ks_ad_accounts WHERE status = 1 AND shop_id = ?', [shopId]);
    return rows;
  }
  const [rows] = await db.query('SELECT * FROM ks_ad_accounts WHERE status = 1');
  return rows;
}

async function ksAdApi(path, token, data) {
  try {
    const res = await axios.post(`${BASE}${path}`, data, {
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return res.data;
  } catch (e) {
    logger.error(`[KS-AD-API] ${path} 失败: ` + e.message);
    return { code: -1, msg: e.message, data: {} };
  }
}

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ks_ad_daily_report (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      advertiser_id VARCHAR(50) NOT NULL,
      report_date DATE NOT NULL,
      cost DECIMAL(12,2) DEFAULT 0,
      show_cnt BIGINT DEFAULT 0,
      click_cnt BIGINT DEFAULT 0,
      convert_cnt INT DEFAULT 0,
      gmv DECIMAL(12,2) DEFAULT 0,
      roi DECIMAL(8,4) DEFAULT 0,
      ctr DECIMAL(8,4) DEFAULT 0,
      cvr DECIMAL(8,4) DEFAULT 0,
      cpa DECIMAL(10,2) DEFAULT 0,
      cpm DECIMAL(10,2) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_adv_date (advertiser_id, report_date),
      INDEX idx_date (report_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 添加余额字段
  try { await db.query(`ALTER TABLE ks_ad_accounts ADD COLUMN balance DECIMAL(12,2) DEFAULT 0`); } catch (e) {}
  // 添加素材点击相关字段
  try { await db.query(`ALTER TABLE ks_ad_daily_report ADD COLUMN photo_click_cnt BIGINT DEFAULT 0`); } catch (e) {}
  try { await db.query(`ALTER TABLE ks_ad_daily_report ADD COLUMN photo_click_rate DECIMAL(8,4) DEFAULT 0`); } catch (e) {}
}
let tableReady = false;
router.use(auth(), async (req, res, next) => {
  if (!tableReady) { try { await ensureTables(); tableReady = true; } catch (e) { logger.error('ks_ad tables init: ' + e.message); } }
  next();
});

/**
 * GET /api/ks-ad-dash/overview
 */
router.get('/overview', async (req, res) => {
  try {
    const shopId = req.query.shop_id;
    const accounts = await getAdAccounts(shopId);
    const advIds = accounts.map(a => a.advertiser_id);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // 按广告账户ID过滤报表数据
    let advFilter = '';
    let advParams = [];
    if (advIds.length) {
      const ph = advIds.map(() => '?').join(',');
      advFilter = ` AND advertiser_id IN (${ph})`;
      advParams = advIds;
    }

    const [todayRows] = await db.query('SELECT * FROM ks_ad_daily_report WHERE report_date = ?' + advFilter, [today, ...advParams]);
    const [yesterdayRows] = await db.query('SELECT * FROM ks_ad_daily_report WHERE report_date = ?' + advFilter, [yesterday, ...advParams]);

    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [weekRows] = await db.query(
      `SELECT report_date, SUM(cost) as cost, SUM(gmv) as gmv, SUM(convert_cnt) as orders,
              SUM(show_cnt) as show_cnt, SUM(click_cnt) as click_cnt,
              SUM(photo_click_cnt) as photo_click_cnt
       FROM ks_ad_daily_report WHERE report_date >= ?${advFilter} GROUP BY report_date ORDER BY report_date`, [startDate, ...advParams]
    );

    const sumRows = (rows) => {
      const s = { cost: 0, show_cnt: 0, click_cnt: 0, convert_cnt: 0, gmv: 0, photo_click_cnt: 0 };
      rows.forEach(r => {
        s.cost += Number(r.cost) || 0;
        s.show_cnt += Number(r.show_cnt) || 0;
        s.click_cnt += Number(r.click_cnt) || 0;
        s.convert_cnt += Number(r.convert_cnt) || 0;
        s.gmv += Number(r.gmv) || 0;
        s.photo_click_cnt += Number(r.photo_click_cnt) || 0;
      });
      // 素材点击率 = photo_click / show * 100
      s.photo_click_rate = s.show_cnt > 0 ? (s.photo_click_cnt / s.show_cnt) * 100 : 0;
      return s;
    };

    const todaySum = sumRows(todayRows);
    const yesterdaySum = sumRows(yesterdayRows);
    const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);

    const totalBalance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

    // 概览卡片: 花费、成交金额、成交订单数、ROI、曝光次数、点击次数
    const todayRoi = todaySum.cost > 0 ? +(todaySum.gmv / todaySum.cost).toFixed(2) : 0;
    const yesterdayRoi = yesterdaySum.cost > 0 ? +(yesterdaySum.gmv / yesterdaySum.cost).toFixed(2) : 0;
    const cards = [
      { key: 'cost', label: '花费', value: +todaySum.cost.toFixed(2), change: +pctChange(todaySum.cost, yesterdaySum.cost).toFixed(2), trend: weekRows.map(r => +Number(r.cost)) },
      { key: 'gmv', label: '成交金额', value: +todaySum.gmv.toFixed(2), change: +pctChange(todaySum.gmv, yesterdaySum.gmv).toFixed(2), trend: weekRows.map(r => +Number(r.gmv)) },
      { key: 'orders', label: '成交订单数', value: todaySum.convert_cnt, change: +pctChange(todaySum.convert_cnt, yesterdaySum.convert_cnt).toFixed(2), trend: weekRows.map(r => +Number(r.orders)) },
      { key: 'roi', label: '直接ROI', value: todayRoi, change: +pctChange(todayRoi, yesterdayRoi).toFixed(2), trend: weekRows.map(r => { const c = +Number(r.cost)||1; return +((+Number(r.gmv)||0)/c).toFixed(2); }) },
      { key: 'show', label: '曝光次数', value: todaySum.show_cnt, change: +pctChange(todaySum.show_cnt, yesterdaySum.show_cnt).toFixed(2), trend: weekRows.map(r => +Number(r.show_cnt)) },
      { key: 'click', label: '点击次数', value: todaySum.click_cnt, change: +pctChange(todaySum.click_cnt, yesterdaySum.click_cnt).toFixed(2), trend: weekRows.map(r => +Number(r.click_cnt)) },
    ];

    const list = accounts.map(acc => {
      const td = todayRows.find(r => r.advertiser_id === acc.advertiser_id) || {};
      const cost = Number(td.cost) || 0;
      const gmv = Number(td.gmv) || 0;
      // 使用API返回的直接ROI (event_order_amount_roi)
      const roi = Number(td.roi) || 0;
      const showCnt = Number(td.show_cnt) || 0;
      const photoClickRate = Number(td.photo_click_rate) || 0;
      return {
        advertiser_id: acc.advertiser_id,
        advertiser_name: acc.advertiser_name || acc.advertiser_id,
        shop_id: acc.shop_id || '',
        shop_name: acc.shop_name || '',
        today_cost: cost,
        today_gmv: gmv,
        today_roi: roi,
        today_orders: Number(td.convert_cnt) || 0,
        today_show: showCnt,
        today_click: Number(td.click_cnt) || 0,
        today_photo_click_rate: photoClickRate,
        balance: Number(acc.balance) || 0,
        status: acc.status,
        token_expires_at: acc.token_expires_at,
      };
    });

    res.json({ code: 0, data: { cards, list } });
  } catch (e) {
    logger.error('[KS-AD-Dash] overview: ' + e.message);
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ks-ad-dash/trend?advertiser_id=xxx
 */
router.get('/trend', async (req, res) => {
  try {
    const advId = req.query.advertiser_id;
    const days = 7;
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    let rows;
    if (advId) {
      [rows] = await db.query(
        `SELECT report_date, cost, gmv, convert_cnt, show_cnt, click_cnt, roi, ctr, photo_click_cnt, photo_click_rate
         FROM ks_ad_daily_report WHERE advertiser_id = ? AND report_date >= ? ORDER BY report_date`, [advId, startDate]
      );
    } else {
      [rows] = await db.query(
        `SELECT report_date, SUM(cost) as cost, SUM(gmv) as gmv, SUM(convert_cnt) as convert_cnt,
                SUM(show_cnt) as show_cnt, SUM(click_cnt) as click_cnt, SUM(photo_click_cnt) as photo_click_cnt
         FROM ks_ad_daily_report WHERE report_date >= ? GROUP BY report_date ORDER BY report_date`, [startDate]
      );
    }

    const data = {
      dates: rows.map(r => { const d = new Date(r.report_date); return (d.getMonth()+1).toString().padStart(2,'0') + '-' + d.getDate().toString().padStart(2,'0'); }),
      cost: rows.map(r => +Number(r.cost).toFixed(2)),
      gmv: rows.map(r => +Number(r.gmv).toFixed(2)),
      roi: rows.map(r => Number(r.roi) || (Number(r.cost) > 0 ? +(Number(r.gmv) / Number(r.cost)).toFixed(2) : 0)),
      orders: rows.map(r => Number(r.convert_cnt)),
      show: rows.map(r => Number(r.show_cnt)),
      click: rows.map(r => Number(r.click_cnt)),
    };
    res.json({ code: 0, data });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad-dash/sync
 */
router.post('/sync', async (req, res) => {
  try {
    await refreshAdTokenIfNeeded();
    const accounts = await getAdAccounts();
    if (!accounts.length) return res.json({ code: -1, msg: '暂无授权的磁力账户' });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let synced = 0;

    for (const acc of accounts) {
      // 同步报表数据
      for (const date of [today, yesterday]) {
        try {
          await new Promise(r => setTimeout(r, 500));
          const r = await ksAdApi('/v1/report/account_report', acc.access_token, {
            advertiser_id: Number(acc.advertiser_id),
            start_date: date, end_date: date,
            temporal_granularity: "DAILY",
            page: 1, page_size: 20,
          });

          if (r.code === 0 && r.data?.details?.length) {
            const d = r.data.details[0];
            const cost = d.charge || 0;
            const showCnt = d.show || 0;
            const clickCnt = d.bclick || 0;              // 行为数 = bclick
            const convertCnt = d.conversion_num || 0;
            const gmv = d.event_order_paid_purchase_amount || 0;
            // 直接ROI = API返回值
            const roi = d.event_order_amount_roi || (cost > 0 ? +(gmv / cost).toFixed(4) : 0);
            // 素材点击数和素材点击率
            const photoClickCnt = d.photo_click || 0;
            const photoClickRate = d.photo_click_ratio ? +(d.photo_click_ratio * 100).toFixed(2) : (showCnt > 0 ? +(photoClickCnt / showCnt * 100).toFixed(2) : 0);
            const ctr = showCnt > 0 ? +(clickCnt / showCnt * 100).toFixed(2) : 0;
            const cvr = clickCnt > 0 ? +(convertCnt / clickCnt * 100).toFixed(2) : 0;
            const cpa = convertCnt > 0 ? +(cost / convertCnt).toFixed(2) : 0;
            const cpm = showCnt > 0 ? +(cost / showCnt * 1000).toFixed(2) : 0;

            logger.info(`[KS-AD-Sync] ${acc.advertiser_id} ${date}: 花费=${cost}, 曝光=${showCnt}, 行为数=${clickCnt}, 素材点击=${photoClickCnt}, 素材点击率=${photoClickRate}%, ROI=${roi}, GMV=${gmv}`);

            await db.query(`
              INSERT INTO ks_ad_daily_report (advertiser_id, report_date, cost, show_cnt, click_cnt, convert_cnt, gmv, roi, ctr, cvr, cpa, cpm, photo_click_cnt, photo_click_rate)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                cost=VALUES(cost), show_cnt=VALUES(show_cnt), click_cnt=VALUES(click_cnt),
                convert_cnt=VALUES(convert_cnt), gmv=VALUES(gmv), roi=VALUES(roi),
                ctr=VALUES(ctr), cvr=VALUES(cvr), cpa=VALUES(cpa), cpm=VALUES(cpm),
                photo_click_cnt=VALUES(photo_click_cnt), photo_click_rate=VALUES(photo_click_rate)
            `, [acc.advertiser_id, date, cost, showCnt, clickCnt, convertCnt, gmv, +Number(roi).toFixed(4), ctr, cvr, cpa, cpm, photoClickCnt, photoClickRate]);
            synced++;
          }
        } catch (e) {
          logger.warn(`[KS-AD-Sync] ${acc.advertiser_id} ${date}: ${e.message}`);
        }
      }

      // 同步账户余额
      try {
        await new Promise(r => setTimeout(r, 300));
        const fundRes = await ksAdApi('/v1/advertiser/fund/get', acc.access_token, {
          advertiser_id: Number(acc.advertiser_id),
        });
        if (fundRes.code === 0 && fundRes.data) {
          const balance = Number(fundRes.data.balance) || Number(fundRes.data.valid_balance) || Number(fundRes.data.total_balance_yuan) || 0;
          if (balance > 0) {
            await db.query('UPDATE ks_ad_accounts SET balance=? WHERE advertiser_id=?', [balance, acc.advertiser_id]);
            logger.info(`[KS-AD-Sync] 余额更新: ${acc.advertiser_id} = ¥${balance}`);
          }
        } else if (fundRes.code !== 0) {
          logger.warn(`[KS-AD-Sync] 余额接口: ${acc.advertiser_id} code=${fundRes.code} msg=${fundRes.message || fundRes.msg}`);
        }
      } catch (e) {
        logger.warn(`[KS-AD-Sync] 余额获取失败 ${acc.advertiser_id}: ${e.message}`);
      }
    }

    res.json({ code: 0, msg: `已同步 ${synced} 条数据` });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad-dash/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { advertiser_name, today_cost, today_gmv, today_roi, today_orders, today_show, today_click, today_photo_click_rate, trend } = req.body;

    const suggestions = [];
    if (today_roi >= 2) suggestions.push(`ROI ${Number(today_roi).toFixed(2)} 表现优秀，可适当扩量`);
    else if (today_roi >= 1.5) suggestions.push(`ROI ${Number(today_roi).toFixed(2)} 表现尚可，建议优化素材提升转化`);
    else if (today_cost > 0) suggestions.push(`ROI ${Number(today_roi).toFixed(2)} 偏低，建议控制预算、优化定向和素材`);

    if (today_photo_click_rate < 1 && today_show > 0) suggestions.push('素材点击率偏低，建议优化广告创意和标题');
    if (today_orders === 0 && today_cost > 100) suggestions.push('消耗较高但无转化，建议检查落地页和商品');

    if (!suggestions.length) suggestions.push('数据正常，继续保持当前投放策略');

    res.json({ code: 0, data: { analysis: `### ${advertiser_name || '账户'}分析\n\n${suggestions.map(s => `- ${s}`).join('\n')}` } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});


// ========== 自动定时同步快手数据（每30分钟） ==========
async function autoSync() {
  try {
    await refreshAdTokenIfNeeded();
    const accounts = await getAdAccounts();
    if (!accounts.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let synced = 0;
    for (const acc of accounts) {
      for (const date of [today, yesterday]) {
        try {
          await new Promise(r => setTimeout(r, 500));
          const r = await ksAdApi('/v1/report/account_report', acc.access_token, {
            advertiser_id: Number(acc.advertiser_id),
            start_date: date, end_date: date,
            temporal_granularity: 'DAILY', page: 1, page_size: 20,
          });
          if (r.code === 0 && r.data?.details?.length) {
            const d = r.data.details[0];
            const cost = d.charge || 0, showCnt = d.show || 0, clickCnt = d.bclick || 0;
            const convertCnt = d.conversion_num || 0, gmv = d.event_order_paid_purchase_amount || 0;
            const roi = d.event_order_amount_roi || (cost > 0 ? +(gmv / cost).toFixed(4) : 0);
            const photoClickCnt = d.photo_click || 0;
            const photoClickRate = d.photo_click_ratio ? +(d.photo_click_ratio * 100).toFixed(2) : (showCnt > 0 ? +(photoClickCnt / showCnt * 100).toFixed(2) : 0);
            const ctr = showCnt > 0 ? +(clickCnt / showCnt * 100).toFixed(2) : 0;
            const cvr = clickCnt > 0 ? +(convertCnt / clickCnt * 100).toFixed(2) : 0;
            const cpa = convertCnt > 0 ? +(cost / convertCnt).toFixed(2) : 0;
            const cpm = showCnt > 0 ? +(cost / showCnt * 1000).toFixed(2) : 0;
            await db.query(`INSERT INTO ks_ad_daily_report (advertiser_id, report_date, cost, show_cnt, click_cnt, convert_cnt, gmv, roi, ctr, cvr, cpa, cpm, photo_click_cnt, photo_click_rate)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
              cost=VALUES(cost), show_cnt=VALUES(show_cnt), click_cnt=VALUES(click_cnt), convert_cnt=VALUES(convert_cnt),
              gmv=VALUES(gmv), roi=VALUES(roi), ctr=VALUES(ctr), cvr=VALUES(cvr), cpa=VALUES(cpa), cpm=VALUES(cpm),
              photo_click_cnt=VALUES(photo_click_cnt), photo_click_rate=VALUES(photo_click_rate)`,
              [acc.advertiser_id, date, cost, showCnt, clickCnt, convertCnt, gmv, +Number(roi).toFixed(4), ctr, cvr, cpa, cpm, photoClickCnt, photoClickRate]);
            synced++;
          }
        } catch (e) { logger.warn('[KS-AutoSync] ' + acc.advertiser_id + ' ' + date + ': ' + e.message); }
      }
      try {
        await new Promise(r => setTimeout(r, 300));
        const fundRes = await ksAdApi('/v1/advertiser/fund/get', acc.access_token, { advertiser_id: Number(acc.advertiser_id) });
        if (fundRes.code === 0 && fundRes.data) {
          const balance = Number(fundRes.data.balance) || Number(fundRes.data.valid_balance) || 0;
          if (balance > 0) await db.query('UPDATE ks_ad_accounts SET balance=? WHERE advertiser_id=?', [balance, acc.advertiser_id]);
        }
      } catch (e) { logger.warn('[KS-AutoSync] balance fail ' + acc.advertiser_id); }
    }
    if (synced > 0) logger.info('[KS-AutoSync] done, updated ' + synced);
  } catch (e) { logger.error('[KS-AutoSync] fail: ' + e.message); }
}

setTimeout(autoSync, 5000);
setInterval(autoSync, 30 * 60 * 1000);

module.exports = router;
