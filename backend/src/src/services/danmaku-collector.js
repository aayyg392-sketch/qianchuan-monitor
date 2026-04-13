/**
 * 抖音直播间弹幕实时采集服务
 *
 * 采集策略：
 * 1. 尝试WebSocket连接 wss://webcast5-ws-web-lf.douyin.com
 * 2. WebSocket失败后切换HTTP轮询 im/fetch/
 * 3. 定期从直播间页面抓取弹幕数据
 *
 * 数据写入 live_danmaku 表
 */
const WebSocket = require('ws');
const axios = require('axios');
const zlib = require('zlib');
const db = require('../db');
const logger = require('../logger');

const WEB_RID = 'snefe66';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let wsConnection = null;
let reconnectTimer = null;
let refreshTimer = null;
let pollTimer = null;
let heartbeatTimer = null;
let isRunning = false;
let dbRoomId = null;
let currentCookies = null;
let currentDouyinRoomId = null;
let wsAttempts = 0;
const MAX_WS_ATTEMPTS = 3;

// ============ 建表 ============
async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS live_danmaku (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    user_nickname VARCHAR(100),
    user_id VARCHAR(50),
    content TEXT NOT NULL,
    msg_type VARCHAR(30) DEFAULT 'danmaku',
    sentiment ENUM('positive','neutral','negative') DEFAULT 'neutral',
    is_question TINYINT(1) DEFAULT 0,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_time (room_id, recorded_at),
    INDEX idx_sentiment (sentiment)
  )`);
  try { await db.query(`ALTER TABLE live_danmaku ADD COLUMN msg_type VARCHAR(30) DEFAULT 'danmaku' AFTER content`); } catch(e) {}
  try { await db.query(`ALTER TABLE live_danmaku ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER recorded_at`); } catch(e) {}
}

// ============ 获取 ttwid cookie ============
async function getTtwid() {
  const r = await axios.get('https://live.douyin.com/', {
    headers: { 'User-Agent': UA },
    timeout: 15000,
    maxRedirects: 5,
  });
  const cookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  return cookies;
}

// ============ 获取直播间 room_id ============
async function getRoomId(cookies) {
  const r = await axios.get('https://live.douyin.com/webcast/room/web/enter/', {
    params: {
      aid: 6383, app_name: 'douyin_web', live_id: 1, device_platform: 'web',
      language: 'zh-CN', browser_language: 'zh-CN', browser_platform: 'Win32',
      browser_name: 'Chrome', browser_version: '120.0.0.0', web_rid: WEB_RID,
    },
    headers: {
      'User-Agent': UA,
      'Referer': 'https://live.douyin.com/' + WEB_RID,
      'Cookie': cookies,
    },
    timeout: 15000,
  });
  const roomData = r.data?.data?.data?.[0] || r.data?.data?.room;
  if (!roomData) throw new Error('无法获取直播间数据');
  return {
    roomId: roomData.id_str || String(roomData.id || ''),
    title: roomData.title || '',
    status: roomData.status,
    userCount: roomData.user_count_str || '0',
    stats: roomData.stats || {},
  };
}

// ============ 确保数据库记录 ============
async function ensureDbRoom() {
  const [rows] = await db.query("SELECT id FROM live_rooms WHERE web_rid = ? AND status = 'active'", [WEB_RID]);
  if (rows.length) { dbRoomId = rows[0].id; return; }
  const [rows2] = await db.query("SELECT id FROM live_rooms WHERE room_id = ? AND status = 'active'", [WEB_RID]);
  if (rows2.length) {
    dbRoomId = rows2[0].id;
    try { await db.query("UPDATE live_rooms SET web_rid = ? WHERE id = ?", [WEB_RID, dbRoomId]); } catch(e) {}
    return;
  }
  const [result] = await db.query(
    "INSERT INTO live_rooms (room_id, web_rid, nickname, monitor_mode, status) VALUES (?, ?, ?, 'realtime', 'active')",
    [WEB_RID, WEB_RID, WEB_RID]
  );
  dbRoomId = result.insertId;
}

// ============ 从二进制中提取中文文本 ============
function extractChineseTexts(buf) {
  const results = [];
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
  let i = 0;
  while (i < buf.length) {
    if ((buf[i] & 0x07) === 2) {
      let j = i + 1;
      let len = 0;
      let shift = 0;
      while (j < buf.length && (buf[j] & 0x80) !== 0) {
        len |= (buf[j] & 0x7f) << shift;
        shift += 7;
        j++;
      }
      if (j < buf.length) {
        len |= (buf[j] & 0x7f) << shift;
        j++;
        if (len > 0 && len < 500 && j + len <= buf.length) {
          try {
            const str = buf.slice(j, j + len).toString('utf8');
            if (chineseRegex.test(str) && !str.includes('\ufffd') && str.length >= 2 && str.length <= 200) {
              const cleaned = str.replace(/[\x00-\x1f]/g, '').trim();
              if (cleaned.length >= 2) results.push(cleaned);
            }
          } catch(e) {}
        }
      }
    }
    i++;
  }
  return results;
}

// ============ 解析弹幕 ============
function parseDanmakuFromTexts(texts) {
  const danmakus = [];
  const seen = new Set();
  const ignorePatterns = [
    /^webcast/i, /^push/i, /^im_/, /^method/i, /^\d+$/,
    /^[a-f0-9]{20,}$/i, /douyin\.com/, /^https?:/, /^wss?:/,
    /^v[12]$/, /^web$/, /^audience/, /^protobuf/i,
    /internal_ext/, /cursor/, /fetch_interval/,
    /^[\w_-]+$/, /^\d[\d.]+$/,
  ];

  for (const t of texts) {
    if (t.length > 150 || t.length < 2) continue;
    let skip = false;
    for (const p of ignorePatterns) { if (p.test(t)) { skip = true; break; } }
    if (skip) continue;
    if (!/[\u4e00-\u9fff]/.test(t)) continue;
    const match = t.match(/^(.{1,20})[：:](.+)$/);
    const key = match ? `${match[1]}:${match[2]}` : t;
    if (seen.has(key)) continue;
    seen.add(key);
    if (match) {
      danmakus.push({ nickname: match[1].trim(), content: match[2].trim() });
    } else {
      danmakus.push({ nickname: '', content: t });
    }
  }
  return danmakus;
}

// ============ 保存弹幕 ============
async function saveDanmaku(nickname, content, msgType = 'danmaku') {
  if (!dbRoomId || !content) return false;
  try {
    const [dup] = await db.query(
      `SELECT id FROM live_danmaku WHERE room_id = ? AND content = ? AND recorded_at > DATE_SUB(NOW(), INTERVAL 30 SECOND) LIMIT 1`,
      [dbRoomId, content]
    );
    if (dup.length) return false;
    await db.query(
      `INSERT INTO live_danmaku (room_id, user_nickname, content, msg_type, recorded_at, created_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [dbRoomId, nickname || '观众', content, msgType]
    );
    return true;
  } catch(e) {
    return false;
  }
}

// ============ 方案1: WebSocket连接 ============
async function connectWebSocket() {
  cleanupWs();

  try {
    logger.info('[DanmakuWS] 连接尝试#' + (wsAttempts + 1));

    const cookies = await getTtwid();
    currentCookies = cookies;
    const info = await getRoomId(cookies);
    currentDouyinRoomId = info.roomId;

    if (!info.roomId) { scheduleReconnect(30000); return; }

    await ensureDbRoom();
    const isLiving = info.status === 2 ? 1 : 0;
    await db.query("UPDATE live_rooms SET is_living = ?, last_check_at = NOW() WHERE id = ?", [isLiving, dbRoomId]);

    if (!isLiving) {
      logger.info('[DanmakuWS] 未开播，60秒后重试');
      scheduleReconnect(60000);
      return;
    }

    logger.info('[DanmakuWS] 直播间在线', { roomId: info.roomId, title: info.title, viewers: info.userCount });

    const wsHosts = [
      'webcast5-ws-web-lf.douyin.com',
      'webcast5-ws-web-hl.douyin.com',
      'webcast3-ws-web-lf.douyin.com',
    ];
    const wsHost = wsHosts[wsAttempts % wsHosts.length];

    const wsUrl = `wss://${wsHost}/webcast/im/push/v2/?app_name=douyin_web&version_code=180800&webcast_sdk_version=1.0.14-beta.0&update_version_code=1.0.14-beta.0&compress=gzip&device_platform=web&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0&browser_online=true&tz_name=Asia/Shanghai&cursor=&internal_ext=&host=https://live.douyin.com&aid=6383&live_id=1&did_rule=3&endpoint=live_pc&support_wrds=1&user_unique_id=&im_path=/webcast/im/fetch/&identity=audience&need_hierarchical=1&room_id=${info.roomId}&heartbeatDuration=0`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': UA,
        'Cookie': cookies,
        'Origin': 'https://live.douyin.com',
        'Referer': 'https://live.douyin.com/' + WEB_RID,
        'Host': wsHost,
      },
      handshakeTimeout: 10000,
    });

    ws.on('open', () => {
      logger.info('[DanmakuWS] WebSocket已连接!', { host: wsHost });
      wsConnection = ws;
      wsAttempts = 0;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) { try { ws.ping(); } catch(e) {} }
      }, 10000);
    });

    ws.on('message', async (data) => {
      try {
        let buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        try { buf = zlib.gunzipSync(buf); } catch(e) {}
        const texts = extractChineseTexts(buf);
        if (!texts.length) return;
        const danmakus = parseDanmakuFromTexts(texts);
        let saved = 0;
        for (const d of danmakus) {
          if (await saveDanmaku(d.nickname, d.content)) saved++;
        }
        if (saved > 0) {
          logger.info('[DanmakuWS] 保存弹幕x' + saved);
        }
      } catch(e) {}
    });

    ws.on('close', (code) => {
      logger.warn('[DanmakuWS] WS断开', { code });
      wsConnection = null;
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      wsAttempts++;
      if (wsAttempts >= MAX_WS_ATTEMPTS) {
        logger.info('[DanmakuWS] WS失败' + MAX_WS_ATTEMPTS + '次，切换轮询');
        startPolling();
      } else {
        scheduleReconnect(5000);
      }
    });

    ws.on('error', (err) => {
      logger.error('[DanmakuWS] WS错误', { error: err.message });
      try { ws.close(); } catch(e) {}
    });

  } catch(e) {
    logger.error('[DanmakuWS] 连接失败', { error: e.message });
    wsAttempts++;
    if (wsAttempts >= MAX_WS_ATTEMPTS) { startPolling(); } else { scheduleReconnect(10000); }
  }
}

// ============ 方案2: HTTP轮询（页面数据 + im/fetch） ============
async function startPolling() {
  if (pollTimer) return;
  logger.info('[DanmakuWS] 启动轮询模式（每30秒检查直播间数据）');

  // 确保有cookies和roomId
  if (!currentCookies || !currentDouyinRoomId) {
    try {
      currentCookies = await getTtwid();
      const info = await getRoomId(currentCookies);
      currentDouyinRoomId = info.roomId;
      if (info.status !== 2) {
        logger.info('[DanmakuWS] 未开播，60秒后重试');
        scheduleReconnect(60000);
        return;
      }
    } catch(e) {
      scheduleReconnect(30000);
      return;
    }
  }

  // 每30秒轮询获取直播间状态和尝试获取弹幕
  pollTimer = setInterval(async () => {
    await doPoll();
  }, 30000);

  await doPoll();
}

async function doPoll() {
  if (!isRunning) return;
  try {
    // 刷新cookie
    currentCookies = await getTtwid();
    const info = await getRoomId(currentCookies);
    currentDouyinRoomId = info.roomId;

    // 更新直播状态
    const isLiving = info.status === 2 ? 1 : 0;
    if (dbRoomId) {
      await db.query("UPDATE live_rooms SET is_living = ?, last_check_at = NOW() WHERE id = ?", [isLiving, dbRoomId]);
    }

    if (!isLiving) {
      logger.info('[DanmakuWS] 轮询: 直播间未开播');
      return;
    }

    logger.info('[DanmakuWS] 轮询: 在线' + info.userCount + '人, ' + info.title?.substring(0, 30));

    // 尝试 im/fetch（即使返回空也要尝试）
    try {
      const r = await axios.get('https://live.douyin.com/webcast/im/fetch/', {
        params: {
          aid: 6383, app_name: 'douyin_web', live_id: 1, device_platform: 'web',
          browser_language: 'zh-CN', browser_name: 'Chrome', browser_version: '120.0.0.0',
          room_id: currentDouyinRoomId, resp_content_type: 'protobuf',
          identity: 'audience', cursor: '0', internal_ext: '',
        },
        headers: {
          'User-Agent': UA,
          'Referer': 'https://live.douyin.com/' + WEB_RID,
          'Cookie': currentCookies,
        },
        timeout: 10000,
        responseType: 'arraybuffer',
      });

      const buf = Buffer.from(r.data);
      if (buf.length > 0) {
        let decoded = buf;
        try { decoded = zlib.gunzipSync(buf); } catch(e) {}
        const texts = extractChineseTexts(decoded);
        if (texts.length > 0) {
          const danmakus = parseDanmakuFromTexts(texts);
          let saved = 0;
          for (const d of danmakus) {
            if (await saveDanmaku(d.nickname, d.content)) saved++;
          }
          if (saved > 0) logger.info('[DanmakuWS] 轮询保存弹幕x' + saved);
        }
      }
    } catch(e) {
      // im/fetch 可能需要签名，忽略错误
    }

    // 尝试从直播间页面抓取弹幕
    try {
      const pageResp = await axios.get('https://live.douyin.com/' + WEB_RID, {
        headers: { 'User-Agent': UA, 'Cookie': currentCookies },
        timeout: 15000,
      });
      const html = pageResp.data || '';
      // 从RENDER_DATA提取数据
      const renderMatch = html.match(/<script\s+id="RENDER_DATA"[^>]*>([^<]+)<\/script>/);
      if (renderMatch) {
        try {
          const decoded = decodeURIComponent(renderMatch[1]);
          // 从中提取包含中文的有意义文本
          const texts = extractChineseTexts(Buffer.from(decoded, 'utf8'));
          // 这些文本可能包含直播间标题、描述等，不一定是弹幕
          // 但如果有chatMessage类的数据就提取
          if (decoded.includes('chatMessage') || decoded.includes('message_list')) {
            const danmakus = parseDanmakuFromTexts(texts);
            let saved = 0;
            for (const d of danmakus) {
              if (await saveDanmaku(d.nickname, d.content, 'page_scrape')) saved++;
            }
            if (saved > 0) logger.info('[DanmakuWS] 页面弹幕x' + saved);
          }
        } catch(e) {}
      }
    } catch(e) {}

  } catch(e) {
    logger.warn('[DanmakuWS] 轮询异常', { error: e.message });
  }
}

// ============ 连接管理 ============
function cleanupWs() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (wsConnection) {
    try { wsConnection.close(); } catch(e) {}
    wsConnection = null;
  }
}

function scheduleReconnect(delay = 5000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (!isRunning) return;
  reconnectTimer = setTimeout(() => {
    if (isRunning) connectWebSocket();
  }, delay);
}

// ============ 启动 ============
async function startDanmakuCollector() {
  if (isRunning) return;

  logger.info('[DanmakuWS] ======= 启动弹幕采集服务 =======');
  isRunning = true;
  wsAttempts = 0;

  await ensureTable();
  await ensureDbRoom();
  await connectWebSocket();

  // 每5分钟刷新连接
  refreshTimer = setInterval(() => {
    logger.info('[DanmakuWS] 定时刷新');
    wsAttempts = 0;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    connectWebSocket();
  }, 5 * 60 * 1000);
}

// ============ 停止 ============
function stopDanmakuCollector() {
  logger.info('[DanmakuWS] 停止采集');
  isRunning = false;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  cleanupWs();
}

module.exports = { startDanmakuCollector, stopDanmakuCollector };
