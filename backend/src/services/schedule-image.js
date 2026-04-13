/**
 * 排班表图片生成 — Puppeteer截图
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const dayjs = require('dayjs');
const logger = require('../logger');

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const STATIC_DIR = '/home/www/qianchuan-monitor/frontend/dist/report-images';
const IMG_BASE_URL = 'https://business.snefe.com/report-images';

async function generateScheduleImage(dateStr) {
  const date = dateStr || dayjs().format('YYYY-MM-DD');
  const displayDate = dayjs(date).format('YYYY/M/D');
  const weekDay = ['日','一','二','三','四','五','六'][dayjs(date).day()];

  // 查当天排班
  const [schedules] = await db.query(`
    SELECT s.anchor_id, a.name, s.start_time, s.end_time
    FROM live_anchor_schedules s
    JOIN live_anchors a ON a.id = s.anchor_id
    WHERE s.schedule_date = ? AND s.status != 'cancelled'
    ORDER BY s.start_time ASC`, [date]);

  if (!schedules.length) {
    logger.info('[ScheduleImage] 当天无排班数据');
    return null;
  }

  // 检测双搭时段（同一时间有多个主播）
  function getOverlap(startA, endA, startB, endB) {
    const toMin = t => { const [h,m] = String(t).split(':').map(Number); return h * 60 + (m||0); };
    const sA = toMin(startA), eA = toMin(endA) || 1440;
    const sB = toMin(startB), eB = toMin(endB) || 1440;
    const overlapStart = Math.max(sA, sB);
    const overlapEnd = Math.min(eA, eB);
    if (overlapStart < overlapEnd) {
      const fmtMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      return `${fmtMin(overlapStart)}-${fmtMin(overlapEnd)}`;
    }
    return '';
  }

  // 构建行数据
  const rows = schedules.map((s, i) => {
    const start = String(s.start_time).slice(0,5);
    const end = String(s.end_time).slice(0,5) === '00:00' ? '24:00' : String(s.end_time).slice(0,5);
    const toMin = t => { const [h,m] = t.split(':').map(Number); return h * 60 + m; };
    const duration = ((toMin(end) || 1440) - toMin(start)) / 60;

    // 查找双搭
    let overlap = '';
    let overlapPartner = '';
    for (let j = 0; j < schedules.length; j++) {
      if (j === i) continue;
      const ov = getOverlap(s.start_time, s.end_time, schedules[j].start_time, schedules[j].end_time);
      if (ov) {
        overlap = ov;
        overlapPartner = schedules[j].name;
        break;
      }
    }

    // 默认职责：12:00-14:00、18:00-21:00 时段的主播负责倒垃圾、倒水
    let duty = '-';
    const startMin = toMin(start), endMin = toMin(end) || 1440;
    const inLunch = startMin < 840 && endMin > 720;   // 与12:00-14:00有交集
    const inDinner = startMin < 1260 && endMin > 1080; // 与18:00-21:00有交集
    if (inLunch || inDinner) duty = '倒垃圾，倒水';

    // 双搭+倒垃圾倒水同时显示
    let overlapText = '-';
    if (overlap && duty !== '-') {
      overlapText = `${overlap}，倒垃圾，倒水`;
    } else if (overlap) {
      overlapText = overlap;
    } else {
      overlapText = duty;
    }

    return {
      name: s.name,
      time: `${start}-${end}`,
      duration: duration.toFixed(1).replace('.0',''),
      overlap: overlapText,
      overlapPartner
    };
  });

  // 休息主播（查数据库所有主播，排除今天有排班的）
  const [allAnchors] = await db.query('SELECT name FROM live_anchors WHERE status != "resigned"');
  const scheduledNames = new Set(schedules.map(s => s.name));
  const restAnchors = allAnchors.filter(a => !scheduledNames.has(a.name)).map(a => a.name);

  const rowsHtml = rows.map(r => {
    const overlapCls = r.overlapPartner ? ' class="hl"' : '';
    return `<tr>
<td>${r.name}</td>
<td>${r.time}</td>
<td>${r.duration}</td>
<td${overlapCls}>${r.overlap}</td>
</tr>`;
  }).join('');

  const restHtml = restAnchors.length > 0
    ? `<tr class="rest"><td colspan="2"></td><td></td><td>休息</td></tr>
       <tr class="rest-names"><td colspan="4">${restAnchors.join('、')}</td></tr>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#fff;padding:8px 10px 6px}
.hd{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px;border-bottom:2px solid #7BAE4E;padding-bottom:4px}
.hd h2{font-size:14px;color:#333}.hd .sub{font-size:10px;color:#999;margin-top:1px}
.hd .dt{font-size:13px;font-weight:700;color:#7BAE4E;text-align:right}.hd .wk{font-size:9px;color:#999}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#7BAE4E;color:#fff;padding:5px 6px;font-weight:600;text-align:center;font-size:10px;border:1px solid #6a9e3f}
td{padding:5px 6px;border:1px solid #d4e8c4;text-align:center;color:#333;font-size:11px}
tr:nth-child(even){background:#f5faf0}
td.hl{background:#FFFBE6;color:#D4380D;font-weight:600}
tr.rest td{color:#999;font-size:10px;border-bottom:none}
tr.rest-names td{color:#D4380D;font-weight:600;font-size:11px;text-align:center;border-top:none}
.ft{text-align:right;font-size:7px;color:#CCC;margin-top:3px}
</style></head><body>
<div class="hd">
  <div><h2>雪玲妃官方旗舰店（百合洗面奶）</h2><div class="sub">直播排班表</div></div>
  <div><div class="dt">${displayDate}</div><div class="wk">周${weekDay}</div></div>
</div>
<table>
<thead><tr>
<th style="width:60px">主播</th>
<th style="width:100px">上播时间</th>
<th style="width:40px">时长</th>
<th style="width:100px">双搭时间</th>
</tr></thead>
<tbody>
${rowsHtml}
${restHtml}
</tbody></table>
<div class="ft">business.snefe.com</div>
</body></html>`;

  const imgPath = path.join(STATIC_DIR, `schedule-${date}-${Date.now()}.png`);
  if (!fs.existsSync(STATIC_DIR)) fs.mkdirSync(STATIC_DIR, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 480, height: 400, deviceScaleFactor: 3 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const el = await page.$('body');
    const box = await el.boundingBox();
    await page.setViewport({ width: Math.ceil(box.width)+16, height: Math.ceil(box.height)+8, deviceScaleFactor: 3 });
    await page.screenshot({ path: imgPath, fullPage: true, type: 'png' });
    await el.dispose();
    logger.info(`[ScheduleImage] 排班图片生成: ${imgPath}`);
  } finally { if (browser) await browser.close(); }

  return imgPath;
}

/**
 * 发送排班图片到钉钉群Webhook
 */
async function sendScheduleImageToGroup(dateStr) {
  try {
    const imgPath = await generateScheduleImage(dateStr);
    if (!imgPath) return;

    const date = dateStr || dayjs().format('YYYY-MM-DD');
    const fileName = path.basename(imgPath);
    const imgUrl = `${IMG_BASE_URL}/${fileName}`;
    const displayDate = dayjs(date).format('M月D日');

    // 读取推送配置
    const [cfgRows] = await db.query('SELECT config FROM push_configs WHERE id=1').catch(() => [[]]);
    let webhooks = [];
    if (cfgRows.length && cfgRows[0]?.config) {
      const cfg = typeof cfgRows[0].config === 'string' ? JSON.parse(cfgRows[0].config) : cfgRows[0].config;
      // 排班通知专用webhook
      if (cfg.scheduleNotify?.sendToGroup && cfg.scheduleNotify?.webhookUrl) {
        webhooks.push({ name: '排班群', url: cfg.scheduleNotify.webhookUrl });
      }
      // 如果没有专用的，使用报表群的webhook
      if (!webhooks.length && cfg.liveReport?.webhooks) {
        webhooks = cfg.liveReport.webhooks.filter(w => w.enabled && w.url);
      }
    }

    if (!webhooks.length) {
      // 兜底：使用默认群
      webhooks = [{ name: '默认群', url: 'https://oapi.dingtalk.com/robot/send?access_token=a5a3943bb6dbfee17663b47594453db8e7037aca6b65808330548e22533b6013' }];
    }

    const { sendWebhookMessage } = require('./dingtalk');
    const title = `📋 排班表 ${displayDate}`;
    const text = `## 📋 直播排班表 ${displayDate}\n\n![排班](${imgUrl})`;

    for (const wh of webhooks) {
      try {
        await sendWebhookMessage(wh.url, title, text);
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['schedule', date, 'webhook_' + (wh.name||'群'), wh.name||'群机器人', 'success']).catch(() => {});
        logger.info(`[ScheduleImage] 排班图片已推送到群: ${wh.name}`);
      } catch (e) {
        logger.error(`[ScheduleImage] 群${wh.name}推送失败:`, e.message);
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['schedule', date, 'webhook_' + (wh.name||'群'), wh.name||'群机器人', 'fail']).catch(() => {});
      }
    }

    // 清理旧图
    try { const files=fs.readdirSync(STATIC_DIR); const cut=Date.now()-600000; files.forEach(f=>{if(f.startsWith('schedule-')){const fp=path.join(STATIC_DIR,f);if(fs.statSync(fp).mtimeMs<cut)fs.unlinkSync(fp)}}); } catch(e){}
  } catch (err) {
    logger.error('[ScheduleImage] 排班图片推送失败:', err.message);
    throw err;
  }
}

module.exports = { generateScheduleImage, sendScheduleImageToGroup };
