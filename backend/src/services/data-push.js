/**
 * 数据推送服务 — 按pushHours定时推送巨量千川/快手/视频号数据报表
 * 通过puppeteer截图生成报表图片，发送到配置的webhook群
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const dayjs = require('dayjs');
const axios = require('axios');
const logger = require('../logger');

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const STATIC_DIR = '/home/www/qianchuan-monitor/frontend/dist/report-images';
const IMG_BASE_URL = 'https://business.snefe.com/report-images';
if (!fs.existsSync(STATIC_DIR)) fs.mkdirSync(STATIC_DIR, { recursive: true });

// ===== 工具函数 =====
function fmtMoney(v) { const n = parseFloat(v) || 0; return '¥' + (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtYuan(v) { const n = parseFloat(v) || 0; return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtNum(v) { return (parseInt(v) || 0).toLocaleString(); }
function pctChange(cur, prev) {
  const c = parseFloat(cur) || 0, p = parseFloat(prev) || 0;
  if (p === 0) return c > 0 ? '+∞' : '-';
  const pct = ((c - p) / p * 100).toFixed(1);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// ===== HTML报表模板（单店铺/单维度） =====
function buildHtml(title, subtitle, color1, color2, headerCols, sections, dateStr) {
  // sections: [{ name, rows: [[label, val, ydVal, change], ...] }]
  const sectionHtml = sections.map((sec, si) => {
    const nameRow = sec.name ? `<tr style="background:rgba(255,255,255,0.1)"><td colspan="4" style="padding:12px 18px;color:${sec.nameColor || '#a78bfa'};font-weight:bold;font-size:17px">${sec.name}</td></tr>` : '';
    const rows = sec.rows.map((m, i) => `
      <tr style="background:${i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'transparent'}">
        <td style="padding:12px 18px;color:rgba(255,255,255,0.85);font-size:16px">${m[0]}</td>
        <td style="padding:12px 18px;color:#fff;font-weight:bold;font-size:18px">${m[1]}</td>
        <td style="padding:12px 18px;color:rgba(255,255,255,0.85);font-size:16px">${m[2]}</td>
        <td style="padding:12px 18px;font-size:15px;font-weight:500;color:${String(m[3]).startsWith('+') ? '#4ade80' : String(m[3]).startsWith('-') ? '#fb7185' : 'rgba(255,255,255,0.5)'}">${m[3]}</td>
      </tr>`).join('');
    return nameRow + rows;
  }).join('');

  // 概览卡片（如果有headerCols）
  let headerHtml = '';
  if (headerCols && headerCols.length) {
    const cols = headerCols.map(c => `
      <div style="flex:1;text-align:center">
        <div style="font-size:13px;color:rgba(255,255,255,0.7)">${c.label}</div>
        <div style="font-size:22px;font-weight:bold;color:#fff;margin-top:2px">${c.value}</div>
        ${c.change ? `<div style="font-size:13px;color:${String(c.change).startsWith('+') ? '#4ade80' : String(c.change).startsWith('-') ? '#fb7185' : 'rgba(255,255,255,0.5)'}">${c.change}</div>` : ''}
      </div>`).join('');
    headerHtml = `<div style="display:flex;background:rgba(255,255,255,0.12);border-radius:10px;padding:14px 8px;margin-bottom:16px">${cols}</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:720px;font-family:-apple-system,sans-serif;background:linear-gradient(135deg,${color1},${color2});padding:24px}
    .title{font-size:26px;font-weight:700;color:#fff}
    .date{font-size:15px;color:rgba(255,255,255,0.7);margin-top:4px}
    .card{background:rgba(255,255,255,0.12);border-radius:12px;overflow:hidden}
    table{width:100%;border-collapse:collapse}
    th{padding:12px 18px;text-align:left;font-size:14px;color:rgba(255,255,255,0.6);font-weight:500;background:rgba(255,255,255,0.08)}
    .ft{text-align:center;padding:12px;font-size:11px;color:rgba(255,255,255,0.35)}
  </style></head><body>
    <div style="margin-bottom:16px">
      <div class="title">${title}</div>
      <div class="date">${dateStr}${subtitle ? ' · ' + subtitle : ''}</div>
    </div>
    ${headerHtml}
    <div class="card">
      <table>
        <thead><tr><th>指标</th><th>今日截至${dayjs().format('H')}点</th><th>昨日同时段</th><th>对比</th></tr></thead>
        <tbody>${sectionHtml}</tbody>
      </table>
    </div>
    <div class="ft">千川监控 · 数据推送</div>
  </body></html>`;
}

// ===== Puppeteer截图 =====
async function htmlToImage(html, fileName) {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: 'new',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 100 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const body = await page.$('body');
    const filePath = path.join(STATIC_DIR, fileName);
    await body.screenshot({ path: filePath, type: 'png' });
    return `${IMG_BASE_URL}/${fileName}`;
  } finally {
    await browser.close();
  }
}

// ===== 发送webhook =====
async function sendWebhook(url, title, imgUrl) {
  await axios.post(url, {
    msgtype: 'markdown',
    markdown: { title, text: `## ${title}\n\n![报表](${imgUrl})` }
  }, { timeout: 10000 });
}

// ===== 视频号推送 =====
async function pushWxChannels(cfg, hour) {
  const dateStr = dayjs().format('YYYY年MM月DD日 HH:mm');
  const today = dayjs().format('YYYYMMDD');
  const yd = dayjs().subtract(1, 'day').format('YYYYMMDD');
  const [wxT] = await db.query('SELECT * FROM wx_compass_daily WHERE ds=?', [today]);
  const [wxY] = await db.query('SELECT * FROM wx_compass_daily WHERE ds=?', [yd]);
  const t = wxT[0] || {}, y = wxY[0] || {};

  const sections = [{
    rows: [
      ['支付GMV', fmtMoney(t.pay_gmv), fmtMoney(y.pay_gmv), pctChange(t.pay_gmv, y.pay_gmv)],
      ['支付订单', fmtNum(t.pay_order_cnt), fmtNum(y.pay_order_cnt), pctChange(t.pay_order_cnt, y.pay_order_cnt)],
      ['支付人数', fmtNum(t.pay_uv), fmtNum(y.pay_uv), pctChange(t.pay_uv, y.pay_uv)],
      ['直播GMV', fmtMoney(t.live_pay_gmv), fmtMoney(y.live_pay_gmv), pctChange(t.live_pay_gmv, y.live_pay_gmv)],
      ['短视频GMV', fmtMoney(t.feed_pay_gmv), fmtMoney(y.feed_pay_gmv), pctChange(t.feed_pay_gmv, y.feed_pay_gmv)],
    ]
  }];

  // ADQ广告数据
  if (cfg.wxChannels?.pushAdqData) {
    try {
      const todayDate = dayjs().format('YYYY-MM-DD');
      const ydDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      const currentHour = dayjs().hour();
      const selectedOrgs = cfg.wxChannels?.selectedAdqOrgs || [];

      // 按主体名解析出account_id列表
      let allowedAccountIds = null;
      if (selectedOrgs.length) {
        const placeholders = selectedOrgs.map(() => '?').join(',');
        const [orgAccounts] = await db.query(`SELECT account_id FROM adq_accounts WHERE status=1 AND account_name IN (${placeholders})`, selectedOrgs);
        allowedAccountIds = orgAccounts.map(a => a.account_id);
      }

      // 今日最新快照
      let todayQuery = `SELECT s.* FROM adq_stats_snapshots s
        INNER JOIN (SELECT account_id, MAX(snap_hour) as max_hour FROM adq_stats_snapshots WHERE stat_date = ? GROUP BY account_id) m
        ON s.account_id = m.account_id AND s.snap_hour = m.max_hour AND s.stat_date = ?`;
      const [todaySnaps] = await db.query(todayQuery, [todayDate, todayDate]);

      // 昨日同时段
      const [ydSnaps] = await db.query('SELECT * FROM adq_stats_snapshots WHERE stat_date = ? AND snap_hour = ?', [ydDate, currentHour]);

      // 按主体过滤
      const filterSnaps = (snaps) => {
        if (!allowedAccountIds) return snaps || [];
        return (snaps || []).filter(s => allowedAccountIds.includes(s.account_id));
      };

      const tSnaps = filterSnaps(todaySnaps);
      const ySnaps = filterSnaps(ydSnaps);

      const adqCost = tSnaps.reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0) / 100;
      const adqSales = tSnaps.reduce((sum, s) => sum + (parseFloat(s.order_amount) || 0), 0) / 100;
      const adqRoi = adqCost > 0 ? (adqSales / adqCost).toFixed(2) : '-';

      const ydCost = ySnaps.reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0) / 100;
      const ydSales = ySnaps.reduce((sum, s) => sum + (parseFloat(s.order_amount) || 0), 0) / 100;
      const ydRoi = ydCost > 0 ? (ydSales / ydCost).toFixed(2) : '-';

      sections.push({
        name: 'ADQ广告数据',
        nameColor: '#38bdf8',
        rows: [
          ['ADQ消耗', fmtYuan(adqCost), fmtYuan(ydCost), pctChange(adqCost, ydCost)],
          ['ADQ销售额', fmtYuan(adqSales), fmtYuan(ydSales), pctChange(adqSales, ydSales)],
          ['ADQ ROI', adqRoi, ydRoi, adqRoi !== '-' && ydRoi !== '-' ? pctChange(parseFloat(adqRoi), parseFloat(ydRoi)) : '-'],
        ]
      });
    } catch (e) {
      logger.error('[Cron] 视频号推送-ADQ数据获取失败:', e.message);
    }
  }

  const html = buildHtml('视频号数据报表', '昨日同时段', '#667eea', '#764ba2', null, sections, dateStr);
  const imgUrl = await htmlToImage(html, `wx-report-${Date.now()}.png`);

  const webhooks = (cfg.wxChannels?.webhooks || []).filter(w => w.enabled && w.url);
  for (const wh of webhooks) {
    try {
      await sendWebhook(wh.url, '视频号数据报表', imgUrl);
      logger.info(`[Cron] 视频号报表推送到 ${wh.name} 成功 (${hour}点)`);
    } catch (e) {
      logger.error(`[Cron] 视频号报表推送到 ${wh.name} 失败: ${e.message}`);
    }
  }
}

// ===== 快手推送 =====
async function pushKsData(cfg, hour) {
  const dateStr = dayjs().format('YYYY年MM月DD日 HH:mm');
  const todayD = dayjs().format('YYYY-MM-DD');
  const ydD = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  const [allShops] = await db.query("SELECT DISTINCT shop_id, shop_name FROM ks_accounts WHERE status=1 AND shop_name != ''");
  const shopMap = {}; allShops.forEach(s => { shopMap[s.shop_id] = s.shop_name; });
  const selectedShops = cfg.ksData?.selectedShops?.length ? cfg.ksData.selectedShops : allShops.map(s => s.shop_id);
  const ksWebhooks = (cfg.ksData?.webhooks || []).filter(w => w.enabled && w.url);

  // 建立 shop_id -> [advertiser_id] 映射（基于 ks_ad_accounts），用户勾选的广告账户优先
  const selectedAdAccountIds = cfg.ksData?.selectedAdAccounts || [];
  let adAcctQuery = "SELECT advertiser_id, shop_id FROM ks_ad_accounts WHERE status=1 AND shop_id IS NOT NULL";
  const adAcctParams = [];
  if (selectedAdAccountIds.length) {
    adAcctQuery += ` AND advertiser_id IN (${selectedAdAccountIds.map(() => '?').join(',')})`;
    adAcctParams.push(...selectedAdAccountIds);
  }
  const [adAcctRows] = await db.query(adAcctQuery, adAcctParams);
  const shopToAdvIds = {};
  adAcctRows.forEach(r => {
    if (!shopToAdvIds[r.shop_id]) shopToAdvIds[r.shop_id] = [];
    shopToAdvIds[r.shop_id].push(r.advertiser_id);
  });

  // 总览
  let totalGmv = 0, totalOrders = 0, totalYdGmv = 0, totalAdCost = 0, totalYdAdCost = 0;
  const shopSections = [];

  for (const shopId of selectedShops) {
    const shopName = shopMap[shopId] || shopId;
    const [ksT] = await db.query('SELECT SUM(order_cnt) as order_cnt, SUM(pay_amount) as pay_amt, SUM(refund_amount) as refund_amt, SUM(gmv) as gmv FROM ks_daily_stats WHERE shop_id=? AND stat_date=?', [shopId, todayD]);
    const [ksY] = await db.query('SELECT SUM(order_cnt) as order_cnt, SUM(pay_amount) as pay_amt, SUM(refund_amount) as refund_amt, SUM(gmv) as gmv FROM ks_daily_stats WHERE shop_id=? AND stat_date=?', [shopId, ydD]);
    const kt = ksT[0] || {}, ky = ksY[0] || {};

    // 磁力消耗：ks_ad_daily_report 按 advertiser_id 查（表/字段已修正）
    let adCost = 0, adCostYd = 0;
    const advIds = shopToAdvIds[shopId] || [];
    if (advIds.length) {
      const ph = advIds.map(() => '?').join(',');
      const [adT] = await db.query(`SELECT SUM(cost) as cost FROM ks_ad_daily_report WHERE advertiser_id IN (${ph}) AND report_date=?`, [...advIds, todayD]).catch(() => [[{}]]);
      const [adY] = await db.query(`SELECT SUM(cost) as cost FROM ks_ad_daily_report WHERE advertiser_id IN (${ph}) AND report_date=?`, [...advIds, ydD]).catch(() => [[{}]]);
      adCost = parseFloat(adT[0]?.cost) || 0;
      adCostYd = parseFloat(adY[0]?.cost) || 0;
    }

    totalGmv += parseFloat(kt.gmv) || 0;
    totalOrders += parseInt(kt.order_cnt) || 0;
    totalYdGmv += parseFloat(ky.gmv) || 0;
    totalAdCost += adCost;
    totalYdAdCost += adCostYd;

    const rows = [
      ['GMV', fmtYuan(kt.gmv), fmtYuan(ky.gmv), pctChange(kt.gmv, ky.gmv)],
      ['下单数', fmtNum(kt.order_cnt), fmtNum(ky.order_cnt), pctChange(kt.order_cnt, ky.order_cnt)],
      ['退款', fmtYuan(kt.refund_amt), fmtYuan(ky.refund_amt), pctChange(kt.refund_amt, ky.refund_amt)],
    ];
    if (cfg.ksData?.showAdCost !== false) {
      rows.push(['磁力消耗', fmtYuan(adCost), fmtYuan(adCostYd), pctChange(adCost, adCostYd)]);
    }
    shopSections.push({ name: shopName, nameColor: '#fb923c', rows });
  }

  const headerCols = [
    { label: '总GMV', value: fmtYuan(totalGmv), change: pctChange(totalGmv, totalYdGmv) },
    { label: '总订单', value: fmtNum(totalOrders) },
    { label: '昨日同时段总GMV', value: fmtYuan(totalYdGmv) },
    { label: '磁力总消耗', value: fmtYuan(totalAdCost), change: pctChange(totalAdCost, totalYdAdCost) },
    { label: '磁力总ROI', value: totalAdCost > 0 ? (totalGmv / totalAdCost).toFixed(2) : '-' },
  ];

  const html = buildHtml('快手数据报表', `${selectedShops.length}个店铺`, '#701a75', '#be123c', headerCols, shopSections, dateStr);
  const imgUrl = await htmlToImage(html, `ks-report-${Date.now()}.png`);

  for (const wh of ksWebhooks) {
    try {
      await sendWebhook(wh.url, '快手数据报表', imgUrl);
      logger.info(`[Cron] 快手报表推送到 ${wh.name} 成功 (${hour}点)`);
    } catch (e) {
      logger.error(`[Cron] 快手报表推送到 ${wh.name} 失败: ${e.message}`);
    }
  }
}

// ===== 千川推送 =====
async function pushQianchuan(cfg, hour) {
  const dateStr = dayjs().format('YYYY年MM月DD日 HH:mm');
  const todayD = dayjs().format('YYYY-MM-DD');
  const ydD = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  // 选中的账户
  const selectedAccounts = cfg.qianchuan?.selectedAccounts || [];
  let accounts;
  if (selectedAccounts.length) {
    const placeholders = selectedAccounts.map(() => '?').join(',');
    [accounts] = await db.query(`SELECT advertiser_id, advertiser_name FROM qc_accounts WHERE advertiser_id IN (${placeholders})`, selectedAccounts);
  } else {
    [accounts] = await db.query('SELECT advertiser_id, advertiser_name FROM qc_accounts WHERE status=1');
  }

  let totalCost = 0, totalGmv = 0, totalConvert = 0;
  let totalYdCost = 0, totalYdGmv = 0, totalYdConvert = 0;
  const accSections = [];

  for (const acc of accounts) {
    const aid = acc.advertiser_id;
    const [tRow] = await db.query("SELECT SUM(cost) as cost, SUM(gmv_no_coupon) as gmv, SUM(convert_cnt) as converts FROM qc_daily_stats WHERE advertiser_id=? AND stat_date=? AND entity_type='campaign'", [aid, todayD]);
    const [yRow] = await db.query("SELECT SUM(cost) as cost, SUM(gmv_no_coupon) as gmv, SUM(convert_cnt) as converts FROM qc_daily_stats WHERE advertiser_id=? AND stat_date=? AND entity_type='campaign'", [aid, ydD]);
    const t = tRow[0] || {}, y = yRow[0] || {};

    const cost = parseFloat(t.cost) || 0;
    const gmv = parseFloat(t.gmv) || 0;
    const converts = parseInt(t.converts) || 0;
    const ydCost = parseFloat(y.cost) || 0;
    const ydGmv = parseFloat(y.gmv) || 0;
    const ydConverts = parseInt(y.converts) || 0;

    totalCost += cost; totalGmv += gmv; totalConvert += converts;
    totalYdCost += ydCost; totalYdGmv += ydGmv; totalYdConvert += ydConverts;

    // 账户名简化
    const parts = (acc.advertiser_name || '').replace(/\(.*?\)/g, '').split('-').filter(Boolean);
    const shortName = parts.length > 2 ? parts.slice(-2).join('-') : acc.advertiser_name;

    accSections.push({
      name: shortName,
      nameColor: '#a78bfa',
      rows: [
        ['消耗', fmtYuan(cost), fmtYuan(ydCost), pctChange(cost, ydCost)],
        ['GMV', fmtYuan(gmv), fmtYuan(ydGmv), pctChange(gmv, ydGmv)],
        ['ROI', cost > 0 ? (gmv / cost).toFixed(2) : '-', ydCost > 0 ? (ydGmv / ydCost).toFixed(2) : '-', cost > 0 && ydCost > 0 ? pctChange(gmv / cost, ydGmv / ydCost) : '-'],
        ['转化', fmtNum(converts), fmtNum(ydConverts), pctChange(converts, ydConverts)],
      ]
    });
  }

  const totalRoi = totalCost > 0 ? (totalGmv / totalCost).toFixed(2) : '-';
  const headerCols = [
    { label: '总消耗', value: fmtYuan(totalCost), change: pctChange(totalCost, totalYdCost) },
    { label: '总GMV', value: fmtYuan(totalGmv), change: pctChange(totalGmv, totalYdGmv) },
    { label: '总ROI', value: totalRoi },
    { label: '总转化', value: fmtNum(totalConvert) },
  ];

  const html = buildHtml('巨量千川数据报表', `${accounts.length}个账户`, '#1e3a8a', '#0369a1', headerCols, accSections, dateStr);
  const imgUrl = await htmlToImage(html, `qc-report-${Date.now()}.png`);

  const webhooks = (cfg.qianchuan?.webhooks || []).filter(w => w.enabled && w.url);
  for (const wh of webhooks) {
    try {
      await sendWebhook(wh.url, '巨量千川数据报表', imgUrl);
      logger.info(`[Cron] 千川报表推送到 ${wh.name} 成功 (${hour}点)`);
    } catch (e) {
      logger.error(`[Cron] 千川报表推送到 ${wh.name} 失败: ${e.message}`);
    }
  }
}

// ===== 主调度：检查pushHours并触发推送 =====
async function checkAndPush() {
  try {
    const [cfgRows] = await db.query('SELECT config FROM push_configs WHERE id=1');
    if (!cfgRows.length || !cfgRows[0]?.config) return;
    const cfg = typeof cfgRows[0].config === 'string' ? JSON.parse(cfgRows[0].config) : cfgRows[0].config;

    const now = dayjs();
    const hour = now.hour();
    const today = now.format('YYYY-MM-DD');

    // ===== 推送前先同步数据（防止推送时数据为0） =====
    const needWx = cfg.wxChannels?.enabled && (cfg.wxChannels?.pushHours || []).includes(hour);
    const needKs = cfg.ksData?.enabled && (cfg.ksData?.pushHours || []).includes(hour);
    const needQc = cfg.qianchuan?.enabled && (cfg.qianchuan?.pushHours || []).includes(hour);

    if (needWx || needKs || needQc) {
      logger.info(`[DataPush] ${hour}点推送前同步数据...`);
      const syncTasks = [];
      if (needWx) {
        syncTasks.push(
          Promise.resolve().then(async () => {
            try { const { syncTodayOrders } = require('../routes/wx-compass'); await syncTodayOrders(); } catch (e) { logger.warn('[DataPush] 视频号预同步失败', { error: e.message }); }
          })
        );
      }
      if (needKs) {
        syncTasks.push(
          Promise.resolve().then(async () => {
            try { const { runKsSync } = require('./ks-sync'); await runKsSync(); } catch (e) { logger.warn('[DataPush] 快手预同步失败', { error: e.message }); }
          })
        );
      }
      if (needQc) {
        syncTasks.push(
          Promise.resolve().then(async () => {
            try { const { syncAll } = require('./sync'); await syncAll(); } catch (e) { logger.warn('[DataPush] 千川预同步失败', { error: e.message }); }
          })
        );
      }
      await Promise.allSettled(syncTasks);
      logger.info(`[DataPush] 预同步完成，开始推送`);
    }

    // 视频号
    if (needWx) {
      const [sent] = await db.query("SELECT id FROM push_logs WHERE push_type='wx_channels_auto' AND push_date=? AND receiver_id=? LIMIT 1", [today, `hour_${hour}`]);
      if (!sent.length) {
        try {
          await pushWxChannels(cfg, hour);
          await db.query("INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status) VALUES ('wx_channels_auto',?,?,?,?)", [today, `hour_${hour}`, `视频号_${hour}点`, 'success']);
        } catch (e) { logger.error(`[Cron] 视频号报表推送失败(${hour}点): ${e.message}`); }
      }
    }

    // 快手
    if (needKs) {
      const [sent] = await db.query("SELECT id FROM push_logs WHERE push_type='ks_data_auto' AND push_date=? AND receiver_id=? LIMIT 1", [today, `hour_${hour}`]);
      if (!sent.length) {
        try {
          await pushKsData(cfg, hour);
          await db.query("INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status) VALUES ('ks_data_auto',?,?,?,?)", [today, `hour_${hour}`, `快手_${hour}点`, 'success']);
        } catch (e) { logger.error(`[Cron] 快手报表推送失败(${hour}点): ${e.message}`); }
      }
    }

    // 千川
    if (needQc) {
      const [sent] = await db.query("SELECT id FROM push_logs WHERE push_type='qc_data_auto' AND push_date=? AND receiver_id=? LIMIT 1", [today, `hour_${hour}`]);
      if (!sent.length) {
        try {
          await pushQianchuan(cfg, hour);
          await db.query("INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status) VALUES ('qc_data_auto',?,?,?,?)", [today, `hour_${hour}`, `千川_${hour}点`, 'success']);
        } catch (e) { logger.error(`[Cron] 千川报表推送失败(${hour}点): ${e.message}`); }
      }
    }
  } catch (e) {
    logger.error('[DataPush] checkAndPush异常: ' + e.message);
  }
}

module.exports = { checkAndPush, pushWxChannels, pushKsData, pushQianchuan };
