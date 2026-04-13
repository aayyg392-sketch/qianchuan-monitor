/**
 * 直播数据报表图片生成
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const dayjs = require('dayjs');
const logger = require('../logger');
const { sendRobotMessage } = require('./dingtalk');

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const STATIC_DIR = '/home/www/qianchuan-monitor/frontend/dist/report-images';
const IMG_BASE_URL = 'https://business.snefe.com/report-images';

function fmtM(v) { const n = parseFloat(v)||0; return n.toLocaleString('zh-CN',{maximumFractionDigits:0}); }
function fmtPct(v) { const n = parseFloat(v)||0; return n.toFixed(2)+'%'; }
function fmtStay(v) { const n = parseInt(v)||0; return n >= 60 ? Math.floor(n/60)+'m'+Math.round(n%60)+'s' : n+'s'; }

async function generateReportImage(dateStr) {
  const date = dateStr || dayjs().format('YYYY-MM-DD');
  const displayDate = dayjs(date).format('YYYY/M/D');
  const weekDay = ['日','一','二','三','四','五','六'][dayjs(date).day()];
  const yesterday = dayjs(date).subtract(1,'day').format('YYYY-MM-DD');

  // 当天排班+复盘
  const [schedules] = await db.query(`
    SELECT s.anchor_id, a.name, s.start_time, s.end_time,
           r.gmv, r.orders, r.cost, r.roi, r.cvr, r.click_rate, r.interact_rate, r.avg_stay, r.avg_db, r.peak_online
    FROM live_anchor_schedules s
    JOIN live_anchors a ON a.id = s.anchor_id
    LEFT JOIN anchor_review_reports r ON r.schedule_id = s.id
    WHERE s.schedule_date = ? AND s.status != 'cancelled'
    ORDER BY s.start_time ASC`, [date]);

  // 昨日汇总 — 只用直播账户 1713421159436366
  const LIVE_ACCOUNT_ID = '1713421159436366';
  const [ydAcct] = await db.query(`SELECT SUM(cost) as cost, SUM(cpm) as gmv, SUM(convert_cnt) as orders, SUM(gmv_no_coupon) as gmv_no_coupon
    FROM qc_daily_stats WHERE stat_date=? AND entity_type='account' AND entity_id=?`, [yesterday, LIVE_ACCOUNT_ID]);
  const ydGmv = parseFloat(ydAcct[0]?.gmv)||0;
  const ydOrders = parseInt(ydAcct[0]?.orders)||0;
  const ydCost = parseFloat(ydAcct[0]?.cost)||0;
  const ydRoi = ydCost > 0 ? (ydGmv/ydCost).toFixed(2) : '-';
  const ydGmvNoCoupon = parseFloat(ydAcct[0]?.gmv_no_coupon)||0;
  const ydCoupon = ydGmv - ydGmvNoCoupon;
  const ydConvertCost = ydOrders > 0 ? parseFloat((ydCost / ydOrders).toFixed(2)) : 0;

  // 昨日同时段数据：从realtime查增量，按直播账户占比校准
  const [ydRtAll] = await db.query(`SELECT MAX(gmv)-MIN(gmv) as gmv, MAX(qianchuan_cost)-MIN(qianchuan_cost) as cost
    FROM live_realtime_data WHERE room_id=1 AND DATE(recorded_at)=?`, [yesterday]);
  const ydRtGmv = parseFloat(ydRtAll[0]?.gmv)||0;
  const ydScale = ydRtGmv > 0 ? ydGmv / ydRtGmv : 1; // 校准比例

  async function getYdSlot(startTime, endTime) {
    const s = `${yesterday} ${startTime}`, e = `${yesterday} ${endTime}`;
    const [rows] = await db.query(`SELECT
      IFNULL(MAX(gmv),0)-IFNULL(MIN(gmv),0) as gmv,
      IFNULL(MAX(qianchuan_cost),0)-IFNULL(MIN(qianchuan_cost),0) as cost
      FROM live_realtime_data WHERE room_id=1 AND recorded_at BETWEEN ? AND ?`, [s, e]);
    const r = rows[0]||{};
    // 按直播账户比例校准
    const gmv = Math.round((parseFloat(r.gmv)||0) * ydScale);
    const cost = Math.round((parseFloat(r.cost)||0) * ydScale);
    return { gmv, cost, roi: cost>0 ? parseFloat((gmv/cost).toFixed(2)) : 0 };
  }

  // 今日千川直播账户实际数据（用于校准）
  const [todayAcct] = await db.query(`SELECT SUM(cost) as cost, SUM(cpm) as gmv, SUM(convert_cnt) as orders, SUM(gmv_no_coupon) as gmv_no_coupon
    FROM qc_daily_stats WHERE stat_date=? AND entity_type='account' AND entity_id=?`, [date, LIVE_ACCOUNT_ID]);
  const todayRealGmv = parseFloat(todayAcct[0]?.gmv)||0;
  const todayRealCost = parseFloat(todayAcct[0]?.cost)||0;
  const todayRealOrders = parseInt(todayAcct[0]?.orders)||0;
  const todayGmvNoCoupon = parseFloat(todayAcct[0]?.gmv_no_coupon)||0;
  const todayCoupon = todayRealGmv - todayGmvNoCoupon; // 全天优惠券总额
  const todayConvertCost = todayRealOrders > 0 ? parseFloat((todayRealCost / todayRealOrders).toFixed(2)) : 0;

  // 今日realtime总量（用于算校准比例）
  const [todayRtAll] = await db.query(`SELECT MAX(gmv)-MIN(gmv) as gmv, MAX(qianchuan_cost)-MIN(qianchuan_cost) as cost,
    MAX(order_count)-MIN(order_count) as orders FROM live_realtime_data WHERE room_id=1 AND DATE(recorded_at)=?`, [date]);
  const todayRtGmv = parseFloat(todayRtAll[0]?.gmv)||0;
  const todayScale = todayRtGmv > 0 ? todayRealGmv / todayRtGmv : 1;
  const todayCostScale = parseFloat(todayRtAll[0]?.cost)||0 > 0 ? todayRealCost / (parseFloat(todayRtAll[0]?.cost)||1) : 1;
  const todayOrderScale = parseInt(todayRtAll[0]?.orders)||0 > 0 ? todayRealOrders / (parseInt(todayRtAll[0]?.orders)||1) : 1;

  // 构建行（用校准后的数据）
  let tGmv=0, tOrders=0, tCost=0, tCoupon=0;
  const rows = [];
  for (const s of schedules) {
    if (!s.gmv || parseFloat(s.gmv)<=0) continue;
    const rawGmv=parseFloat(s.gmv)||0, rawCost=parseFloat(s.cost)||0, rawOrders=parseInt(s.orders)||0;
    const gmv = Math.round(rawGmv * todayScale);
    const cost = Math.round(rawCost * todayCostScale);
    const orders = Math.round(rawOrders * todayOrderScale);
    const roi = cost > 0 ? parseFloat((gmv/cost).toFixed(2)) : 0;
    tGmv+=gmv; tOrders+=orders; tCost+=cost;
    const yd = await getYdSlot(s.start_time, s.end_time);
    const convertCost = orders > 0 ? parseFloat((cost/orders).toFixed(2)) : 0;
    // 优惠券按GMV占比分配
    const couponRatio = todayRealGmv > 0 ? gmv / todayRealGmv : 0;
    const coupon = Math.round(todayCoupon * couponRatio);
    tCoupon += coupon;
    rows.push({
      name: s.name, time: `${String(s.start_time).slice(0,5)}-${String(s.end_time).slice(0,5)}`,
      gmv, orders, roi, cost, convertCost, coupon,
      cvr: parseFloat(s.cvr)||0, ctr: parseFloat(s.click_rate)||0,
      interact: parseFloat(s.interact_rate)||0, stay: parseInt(s.avg_stay)||0,
      peak: parseInt(s.peak_online)||0, db: parseFloat(s.avg_db)||0,
      ydGmv: yd.gmv, ydRoi: yd.roi
    });
  }
  const tRoi = tCost>0 ? (tGmv/tCost).toFixed(2) : '-';
  const tConvertCost = tOrders > 0 ? (tCost/tOrders).toFixed(2) : '-';

  function pctTag(cur, prev) {
    if (!prev || prev===0) return '';
    const p = ((cur-prev)/prev*100).toFixed(0);
    return parseInt(p)>=0 ? `<b class="up">↑${p}%</b>` : `<b class="dn">↓${Math.abs(parseInt(p))}%</b>`;
  }

  const rowsHtml = rows.map(r => {
    const roiCls = r.roi>=2?'g':r.roi<1.5?'r':'';
    const dbCls = r.db>0&&r.db<60?'r':r.db>=80?'g':'';
    return `<tr>
<td class="l">${r.name}</td><td>${r.time}</td>
<td class="yd">${r.ydGmv>0?fmtM(r.ydGmv):'-'}</td><td class="yd">${r.ydRoi>0?r.ydRoi.toFixed(2):'-'}</td>
<td class="b">${fmtM(r.gmv)}</td><td>${r.orders}</td><td class="${roiCls}">${r.roi.toFixed(2)}</td><td>${fmtM(r.cost)}</td>
<td>${fmtPct(r.cvr)}</td><td>${fmtPct(r.ctr)}</td><td>${fmtPct(r.interact)}</td><td>${fmtStay(r.stay)}</td>
<td class="${dbCls}">${r.db>0?r.db.toFixed(0)+'dB':'-'}</td>
<td>${r.convertCost||'-'}</td><td>${fmtM(r.coupon)}</td>
</tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#fff;padding:6px 8px 4px}
.hd{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:4px;border-bottom:2px solid #4472C4;padding-bottom:4px}
.hd h2{font-size:13px;color:#1A1A1A}.hd .s{font-size:9px;color:#999;margin-top:1px}
.hd .dt{font-size:12px;font-weight:700;color:#4472C4;text-align:right}.hd .wk{font-size:9px;color:#999}
table{width:100%;border-collapse:collapse;font-size:9px}
th{background:#4472C4;color:#fff;padding:3px 2px;font-weight:600;text-align:center;white-space:nowrap;font-size:8px}
th.yd{background:#8DB4E2}
td{padding:3px 2px;border-bottom:1px solid #E0E0E0;text-align:center;color:#333;white-space:nowrap;font-size:9px;font-family:'Helvetica Neue',monospace}
td.l{font-weight:600;text-align:left;padding-left:4px;font-family:'PingFang SC',sans-serif}
td.b{font-weight:700}
td.g{color:#00B578;font-weight:700}
td.r{color:#FF3141;font-weight:700}
td.yd{color:#666;background:#FAFBFC}
tr:nth-child(even){background:#F8FAFC}
.tt td{background:#E8EDF5;font-weight:700;color:#1A1A1A;border-top:2px solid #4472C4;font-size:9px}
.cp td{background:#FFFBE6;font-size:8px;color:#999;border-bottom:none}
.up{color:#FF3141;font-size:8px}.dn{color:#00B578;font-size:8px}
.ft{text-align:right;font-size:7px;color:#CCC;margin-top:2px}
</style></head><body>
<div class="hd"><div><h2>雪玲妃官方旗舰店</h2><div class="s">直播投放数据</div></div><div><div class="dt">${displayDate}</div><div class="wk">周${weekDay}</div></div></div>
<table><thead><tr>
<th style="width:40px">主播</th><th style="width:62px">时段</th>
<th class="yd" style="width:44px">昨日GMV</th><th class="yd" style="width:32px">昨日ROI</th>
<th style="width:44px">GMV</th><th style="width:30px">订单</th><th style="width:30px">ROI</th><th style="width:40px">消耗</th>
<th style="width:36px">转化率</th><th style="width:34px">点击率</th><th style="width:34px">互动率</th><th style="width:32px">停留</th>
<th style="width:30px">分贝</th>
<th style="width:36px">转化成本</th><th style="width:36px">优惠券</th>
</tr></thead><tbody>
${rowsHtml}
<tr class="tt"><td colspan="2">全天合计</td>
<td class="yd">${fmtM(ydGmv)}</td><td class="yd">${ydRoi}</td>
<td>${fmtM(tGmv)}</td><td>${tOrders}</td><td>${tRoi}</td><td>${fmtM(tCost)}</td>
<td colspan="3"></td><td></td><td></td>
<td>${tConvertCost}</td><td>${fmtM(tCoupon)}</td></tr>
<tr class="cp"><td colspan="2">vs昨日</td>
<td colspan="2"></td>
<td>${pctTag(tGmv,ydGmv)}</td><td>${pctTag(tOrders,ydOrders)}</td><td></td><td>${pctTag(tCost,ydCost)}</td>
<td colspan="3"></td><td></td><td></td>
<td>${pctTag(todayConvertCost,ydConvertCost)}</td><td>${pctTag(tCoupon,ydCoupon)}</td></tr>
</tbody></table>
<div class="ft">business.snefe.com</div>
</body></html>`;

  const imgPath = path.join(STATIC_DIR, `report-${date}-${Date.now()}.png`);
  if (!fs.existsSync(STATIC_DIR)) fs.mkdirSync(STATIC_DIR, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 880, height: 400, deviceScaleFactor: 3 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const el = await page.$('body');
    const box = await el.boundingBox();
    await page.setViewport({ width: Math.ceil(box.width)+16, height: Math.ceil(box.height)+8, deviceScaleFactor: 3 });
    await page.screenshot({ path: imgPath, fullPage: true, type: 'png' });
    await el.dispose();
    logger.info(`[ReportImage] 图片生成: ${imgPath}`);
  } finally { if (browser) await browser.close(); }
  return imgPath;
}

async function sendReportToDingTalk(dateStr, userIds) {
  try {
    const imgPath = await generateReportImage(dateStr);
    const date = dateStr || dayjs().format('YYYY-MM-DD');
    const fileName = path.basename(imgPath);
    const imgUrl = `${IMG_BASE_URL}/${fileName}`;

    const displayDate = dayjs(date).format('M月D日');
    const title = `📊 直播数据 ${displayDate}`;
    const text = `## 📊 直播投放数据 ${displayDate}\n\n![报表](${imgUrl})`;

    for (const userId of userIds) {
      try { await sendRobotMessage(userId, title, text); logger.info(`[ReportImage] 已发送: ${userId}`); }
      catch (e) { logger.error(`[ReportImage] 失败 ${userId}: ${e.message}`); }
    }
    // 清理旧图
    try { const files=fs.readdirSync(STATIC_DIR); const cut=Date.now()-600000; files.forEach(f=>{const fp=path.join(STATIC_DIR,f);if(fs.statSync(fp).mtimeMs<cut)fs.unlinkSync(fp)}); } catch(e){}
  } catch (err) { logger.error('[ReportImage] 失败:', err.message); throw err; }
}

module.exports = { generateReportImage, sendReportToDingTalk };
