const axios = require('axios');
const logger = require('../logger');
const db = require('../db');

const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';
const PROXY_URL = process.env.TIKTOK_PROXY || '';

function createProxyAgent() {
  if (!PROXY_URL) return undefined;
  try {
    if (PROXY_URL.startsWith('socks')) {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      return new SocksProxyAgent(PROXY_URL);
    }
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(PROXY_URL);
  } catch (e) {
    logger.warn('[TikTok] 代理配置失败，将直连', { error: e.message });
    return undefined;
  }
}

const proxyAgent = createProxyAgent();

class TikTokAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    const cfg = {
      baseURL: BASE_URL,
      timeout: 60000,
      headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' }
    };
    if (proxyAgent) cfg.httpsAgent = proxyAgent;
    this.client = axios.create(cfg);
    this.client.interceptors.response.use(
      res => res.data,
      err => { logger.error('[TikTok API] 请求失败', { url: err.config?.url, msg: err.message }); throw err; }
    );
  }

  // 获取广告主信息
  async getAdvertiserInfo(advertiserIds) {
    return this.client.get('/advertiser/info/', { params: { advertiser_ids: JSON.stringify(advertiserIds) } });
  }

  // 上传视频素材
  async uploadVideo(advertiserId, filePath) {
    const fs = require('fs');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('advertiser_id', advertiserId);
    form.append('upload_type', 'UPLOAD_BY_FILE');
    form.append('video_file', fs.createReadStream(filePath));
    const cfg = {
      baseURL: BASE_URL,
      timeout: 300000,
      headers: { 'Access-Token': this.accessToken, ...form.getHeaders() },
      maxContentLength: Infinity, maxBodyLength: Infinity
    };
    if (proxyAgent) cfg.httpsAgent = proxyAgent;
    const res = await axios.post(`${BASE_URL}/file/video/ad/upload/`, form, cfg);
    return res.data;
  }

  // 上传图片素材
  async uploadImage(advertiserId, filePath) {
    const fs = require('fs');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('advertiser_id', advertiserId);
    form.append('upload_type', 'UPLOAD_BY_FILE');
    form.append('image_file', fs.createReadStream(filePath));
    const cfg = {
      baseURL: BASE_URL,
      timeout: 120000,
      headers: { 'Access-Token': this.accessToken, ...form.getHeaders() },
      maxContentLength: Infinity, maxBodyLength: Infinity
    };
    if (proxyAgent) cfg.httpsAgent = proxyAgent;
    const res = await axios.post(`${BASE_URL}/file/image/ad/upload/`, form, cfg);
    return res.data;
  }

  // 获取素材列表
  async getVideos(advertiserId, page = 1, pageSize = 20) {
    return this.client.get('/file/video/ad/get/', {
      params: { advertiser_id: advertiserId, page, page_size: pageSize }
    });
  }

  // 广告报表（素材维度）
  async getReport(advertiserId, { startDate, endDate, metrics, dimensions, filters, page = 1, pageSize = 100 }) {
    return this.client.get('/report/integrated/get/', {
      params: {
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        dimensions: JSON.stringify(dimensions || ['ad_id', 'stat_time_day']),
        metrics: JSON.stringify(metrics || [
          'spend', 'impressions', 'clicks', 'ctr', 'conversions', 'conversion_rate',
          'cpa', 'video_play_actions', 'video_watched_2s', 'video_watched_6s',
          'video_views_p25', 'video_views_p50', 'video_views_p75', 'video_views_p100',
          'likes', 'comments', 'shares', 'complete_payment_roas'
        ]),
        start_date: startDate,
        end_date: endDate,
        page, page_size: pageSize,
        filtering: filters ? JSON.stringify(filters) : undefined
      }
    });
  }
}

// OAuth 工具函数
async function getAccessToken(authCode) {
  const cfg = { timeout: 30000 };
  if (proxyAgent) cfg.httpsAgent = proxyAgent;
  const res = await axios.post(`${BASE_URL}/oauth2/access_token/`, {
    app_id: process.env.TIKTOK_APP_ID,
    secret: process.env.TIKTOK_APP_SECRET,
    auth_code: authCode,
    grant_type: 'authorization_code'
  }, cfg);
  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const cfg = { timeout: 30000 };
  if (proxyAgent) cfg.httpsAgent = proxyAgent;
  const res = await axios.post(`${BASE_URL}/oauth2/refresh_token/`, {
    app_id: process.env.TIKTOK_APP_ID,
    secret: process.env.TIKTOK_APP_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }, cfg);
  return res.data;
}

function getAuthUrl(state = '') {
  const appId = process.env.TIKTOK_APP_ID;
  const redirectUri = encodeURIComponent(`${process.env.FRONTEND_URL}/api/tiktok/callback`);
  return `https://business-api.tiktok.com/portal/auth?app_id=${appId}&state=${state}&redirect_uri=${redirectUri}`;
}

// Token 自动刷新
async function ensureFreshToken(account) {
  const dayjs = require('dayjs');
  const expiresAt = account.token_expires_at ? dayjs(account.token_expires_at) : null;
  if (expiresAt && expiresAt.subtract(6, 'hour').isAfter(dayjs())) {
    return account.access_token;
  }
  logger.info('[TikTok] 刷新Token', { advertiser_id: account.advertiser_id });
  const res = await refreshAccessToken(account.refresh_token);
  if (res.code === 0 && res.data) {
    const newToken = res.data.access_token;
    const newRefresh = res.data.refresh_token;
    const newExpires = dayjs().add(res.data.access_token_expires_in || 86400, 'second').format('YYYY-MM-DD HH:mm:ss');
    await db.query('UPDATE tt_accounts SET access_token=?, refresh_token=?, token_expires_at=?, updated_at=NOW() WHERE advertiser_id=?',
      [newToken, newRefresh, newExpires, account.advertiser_id]);
    return newToken;
  }
  throw new Error('TikTok Token刷新失败: ' + JSON.stringify(res));
}

// 建表
async function ensureTables() {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS tt_accounts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      advertiser_id VARCHAR(64) NOT NULL,
      advertiser_name VARCHAR(128),
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      timezone VARCHAR(32) DEFAULT 'UTC',
      currency VARCHAR(16) DEFAULT 'USD',
      market VARCHAR(32) COMMENT '目标市场',
      status TINYINT DEFAULT 1,
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_adv(advertiser_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS tt_materials (
      id INT PRIMARY KEY AUTO_INCREMENT,
      material_id VARCHAR(64) COMMENT 'TikTok素材ID',
      title VARCHAR(256),
      type ENUM('video','image') DEFAULT 'video',
      file_path VARCHAR(512) NOT NULL,
      file_url VARCHAR(512),
      thumbnail_url VARCHAR(512),
      duration DECIMAL(10,2),
      file_size BIGINT,
      width INT,
      height INT,
      language VARCHAR(16),
      market VARCHAR(32),
      product_spu VARCHAR(128),
      status ENUM('draft','pending','approved','rejected','pushed','archived') DEFAULT 'draft',
      creator_id INT,
      reviewer_id INT,
      review_note TEXT,
      reviewed_at DATETIME,
      tags JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status(status),
      INDEX idx_market(market),
      INDEX idx_creator(creator_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS tt_material_pushes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      material_id INT NOT NULL,
      advertiser_id VARCHAR(64) NOT NULL,
      tt_video_id VARCHAR(128),
      push_status ENUM('pending','uploading','success','failed') DEFAULT 'pending',
      error_msg TEXT,
      pushed_by INT,
      pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_material(material_id),
      INDEX idx_adv(advertiser_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS tt_material_stats (
      id INT PRIMARY KEY AUTO_INCREMENT,
      stat_date DATE NOT NULL,
      material_id INT NOT NULL,
      advertiser_id VARCHAR(64) NOT NULL,
      spend DECIMAL(12,2) DEFAULT 0,
      impressions BIGINT DEFAULT 0,
      clicks BIGINT DEFAULT 0,
      ctr DECIMAL(8,4) DEFAULT 0,
      conversions INT DEFAULT 0,
      cvr DECIMAL(8,4) DEFAULT 0,
      cpa DECIMAL(10,2) DEFAULT 0,
      roas DECIMAL(8,2) DEFAULT 0,
      video_views BIGINT DEFAULT 0,
      video_play_25 BIGINT DEFAULT 0,
      video_play_50 BIGINT DEFAULT 0,
      video_play_75 BIGINT DEFAULT 0,
      video_play_100 BIGINT DEFAULT 0,
      likes INT DEFAULT 0,
      comments INT DEFAULT 0,
      shares INT DEFAULT 0,
      country VARCHAR(8),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_daily(stat_date, material_id, advertiser_id, country),
      INDEX idx_date(stat_date),
      INDEX idx_material(material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS tt_material_tags (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(64) NOT NULL,
      type ENUM('public','personal') DEFAULT 'public',
      category VARCHAR(32),
      color VARCHAR(16),
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_name_type(name, type, created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];
  for (const sql of sqls) {
    await db.query(sql).catch(e => logger.warn('[TikTok] 建表跳过', { error: e.message }));
  }
  logger.info('[TikTok] 数据表检查完成');
}

module.exports = { TikTokAPI, getAccessToken, refreshAccessToken, getAuthUrl, ensureFreshToken, ensureTables };
