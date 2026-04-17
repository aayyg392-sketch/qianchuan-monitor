/**
 * 腾讯广告 Marketing API v3.0 请求封装
 * 自动管理 Token 获取/刷新、签名、频控
 */
const axios = require('axios');
const crypto = require('crypto');
const db = require('../db');
const logger = require('../logger');

const ADQ_API_BASE = 'https://api.e.qq.com/v3.0';
const ADQ_TOKEN_URL = 'https://api.e.qq.com/oauth/token';

// ============ Token 管理 ============

async function getAdqConfig() {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('adq_app_id', 'adq_app_secret', 'adq_redirect_uri', 'adq_client_id', 'adq_client_secret')"
  );
  const raw = {};
  rows.forEach(r => { raw[r.setting_key] = r.setting_value; });
  // 兼容两种key名
  return {
    adq_client_id: raw.adq_client_id || raw.adq_app_id || '',
    adq_client_secret: raw.adq_client_secret || raw.adq_app_secret || '',
    adq_redirect_uri: raw.adq_redirect_uri || (process.env.FRONTEND_URL || 'https://business.snefe.com') + '/api/adq/oauth-callback',
  };
}

async function refreshToken(accountId) {
  const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ?', [accountId]);
  if (!rows.length) throw new Error('ADQ账户不存在');
  const account = rows[0];
  if (!account.refresh_token) throw new Error('该账户无refresh_token，请重新授权');
  const cfg = await getAdqConfig();

  const resp = await axios.get(ADQ_TOKEN_URL, {
    params: {
      client_id: cfg.adq_client_id,
      client_secret: cfg.adq_client_secret,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    },
  });

  const data = resp.data;
  if (data.code !== 0) throw new Error(`刷新Token失败: ${data.message}`);

  const tokenData = data.data;
  const expiresAt = new Date(Date.now() + tokenData.access_token_expires_in * 1000);
  const refreshExpiresAt = new Date(Date.now() + tokenData.refresh_token_expires_in * 1000);

  // 组织token共享：刷新时同步更新所有使用相同refresh_token的账户
  const oldRefreshToken = account.refresh_token;
  const [updated] = await db.query(
    'UPDATE adq_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ?, refresh_expires_at = ? WHERE refresh_token = ?',
    [tokenData.access_token, tokenData.refresh_token, expiresAt, refreshExpiresAt, oldRefreshToken]
  );
  const updatedCount = updated.affectedRows || 1;
  if (updatedCount > 1) {
    logger.info(`ADQ 组织Token刷新成功, 同步更新${updatedCount}个账户`);
  } else {
    logger.info(`ADQ Token刷新成功: account_id=${account.account_id}`);
  }
  return tokenData.access_token;
}

async function getValidToken(accountId) {
  const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ?', [accountId]);
  if (!rows.length) throw new Error('ADQ账户不存在');
  const account = rows[0];
  if (!account.access_token) throw new Error('该账户未绑定Token，请先授权');
  // 提前5分钟刷新
  if (account.token_expires_at && new Date(account.token_expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
    return refreshToken(accountId);
  }
  return account.access_token;
}

// ============ 实名认证令牌 user_token ============
let _utCache = { token: null, expires: 0, ts: 0 };

async function getUserToken() {
  if (_utCache.token && _utCache.expires * 1000 > Date.now() && Date.now() - _utCache.ts < 60000) return _utCache.token;
  try {
    const [rows] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('adq_user_token','adq_user_token_expires')");
    const m = {}; rows.forEach(r => { m[r.setting_key] = r.setting_value; });
    if (m.adq_user_token && parseInt(m.adq_user_token_expires || 0) * 1000 > Date.now()) {
      _utCache = { token: m.adq_user_token, expires: parseInt(m.adq_user_token_expires), ts: Date.now() };
      return m.adq_user_token;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ============ 通用请求封装 ============

async function adqApiCall(accessToken, endpoint, method = 'GET', data = {}, adAccountId = null) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  const commonParams = {
    access_token: accessToken,
    timestamp,
    nonce,
  };
  if (adAccountId) commonParams.account_id = adAccountId;

  // 写操作自动带实名认证令牌
  if (method !== 'GET') {
    const ut = await getUserToken();
    if (ut) commonParams.user_token = ut;
  }

  try {
    let resp;
    if (method === 'GET') {
      resp = await axios.get(`${ADQ_API_BASE}/${endpoint}`, {
        params: { ...data, ...commonParams },
        timeout: 30000,
      });
    } else {
      resp = await axios.post(`${ADQ_API_BASE}/${endpoint}`, data, {
        params: commonParams,
        timeout: 30000,
      });
    }

    const result = resp.data;
    if (result.code !== 0) {
      logger.error(`ADQ API错误 [${endpoint}]`, { code: result.code, message: result.message });
      throw new Error(`ADQ API错误: code=${result.code}, ${result.message}`);
    }
    return result.data;
  } catch (err) {
    if (err.response) {
      logger.error(`ADQ HTTP错误 [${endpoint}]`, { status: err.response.status, data: err.response.data });
    }
    throw err;
  }
}

// ============ 报表接口 ============

async function getDailyReports(accessToken, adAccountId, params) {
  const level = params.level || 'REPORT_LEVEL_ADGROUP';
  // group_by 是必填参数，根据level自动设置默认值
  const defaultGroupBy = {
    'REPORT_LEVEL_ADVERTISER': ['date'],
    'REPORT_LEVEL_CAMPAIGN': ['campaign_id'],
    'REPORT_LEVEL_ADGROUP': ['adgroup_id'],
    'REPORT_LEVEL_DYNAMIC_CREATIVE': ['dynamic_creative_id'],
    'REPORT_LEVEL_PROJECT': ['project_id'],
  };
  const groupBy = params.group_by || defaultGroupBy[level] || ['date'];

  return adqApiCall(accessToken, 'daily_reports/get', 'GET', {
    account_id: adAccountId,
    level,
    date_range: JSON.stringify(params.date_range),
    group_by: JSON.stringify(groupBy),
    fields: JSON.stringify(params.fields || [
      'date', 'campaign_id', 'campaign_name', 'adgroup_id', 'adgroup_name',
      'cost', 'view_count', 'valid_click_count', 'ctr', 'cpc', 'thousand_display_price',
      'conversions_count', 'conversions_cost', 'deep_conversions_count',
    ]),
    page: params.page || 1,
    page_size: params.page_size || 100,
  }, adAccountId);
}

async function getHourlyReports(accessToken, adAccountId, params) {
  const level = params.level || 'REPORT_LEVEL_ADGROUP';
  return adqApiCall(accessToken, 'hourly_reports/get', 'GET', {
    account_id: adAccountId,
    level,
    date_range: JSON.stringify(params.date_range),
    group_by: JSON.stringify(params.group_by || ['hour']),
    fields: JSON.stringify(params.fields || [
      'hour', 'adgroup_id', 'adgroup_name', 'cost', 'view_count', 'valid_click_count', 'conversions_count',
    ]),
    page: params.page || 1,
    page_size: params.page_size || 100,
  }, adAccountId);
}

// ============ 广告管理 ============

async function getAdgroups(accessToken, adAccountId, params = {}) {
  return adqApiCall(accessToken, 'adgroups/get', 'GET', {
    account_id: adAccountId,
    page: params.page || 1,
    page_size: params.page_size || 50,
    ...(params.filtering ? { filtering: JSON.stringify(params.filtering) } : {}),
    fields: JSON.stringify(params.fields || [
      'adgroup_id', 'adgroup_name', 'configured_status', 'daily_budget',
      'bid_amount', 'optimization_goal', 'begin_date', 'end_date',
    ]),
  }, adAccountId);
}

async function createAdgroup(accessToken, adAccountId, adgroupData) {
  return adqApiCall(accessToken, 'adgroups/add', 'POST', adgroupData, adAccountId);
}

async function updateAdgroup(accessToken, adAccountId, adgroupData) {
  return adqApiCall(accessToken, 'adgroups/update', 'POST', adgroupData, adAccountId);
}

// ============ 创意管理 ============

async function createDynamicCreative(accessToken, adAccountId, creativeData) {
  return adqApiCall(accessToken, 'dynamic_creatives/add', 'POST', creativeData, adAccountId);
}

// ============ 素材管理 ============

async function uploadImage(accessToken, adAccountId, fileBuffer, filename) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fileBuffer, filename);

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  const resp = await axios.post(`${ADQ_API_BASE}/images/add`, form, {
    params: { access_token: accessToken, timestamp, nonce, account_id: adAccountId },
    headers: form.getHeaders(),
    timeout: 60000,
  });
  if (resp.data.code !== 0) throw new Error(`上传图片失败: ${resp.data.message}`);
  return resp.data.data;
}

async function uploadVideo(accessToken, adAccountId, fileBuffer, filename) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fileBuffer, filename);

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  const resp = await axios.post(`${ADQ_API_BASE}/videos/add`, form, {
    params: { access_token: accessToken, timestamp, nonce, account_id: adAccountId },
    headers: form.getHeaders(),
    timeout: 120000,
  });
  if (resp.data.code !== 0) throw new Error(`上传视频失败: ${resp.data.message}`);
  return resp.data.data;
}

// ============ 评论管理 ============

async function getComments(accessToken, adAccountId, params = {}) {
  return adqApiCall(accessToken, 'comment_list/get', 'GET', {
    account_id: adAccountId,
    page: params.page || 1,
    page_size: params.page_size || 20,
    ...(params.finder_ad_object_id ? { finder_ad_object_id: params.finder_ad_object_id } : {}),
    ...(params.keyword ? { keyword: params.keyword } : {}),
  }, adAccountId);
}

async function replyComment(accessToken, adAccountId, finderAdObjectId, commentId, content) {
  return adqApiCall(accessToken, 'channels_comment/add', 'POST', {
    account_id: adAccountId,
    finder_ad_object_id: finderAdObjectId,
    reply_comment_id: commentId,
    content,
  }, adAccountId);
}

async function deleteComment(accessToken, adAccountId, finderAdObjectId, commentId) {
  return adqApiCall(accessToken, 'channels_comment/delete', 'POST', {
    account_id: adAccountId,
    finder_ad_object_id: finderAdObjectId,
    comment_id: commentId,
  }, adAccountId);
}

async function toggleFeaturedComment(accessToken, adAccountId, finderAdObjectId, commentId, opType) {
  return adqApiCall(accessToken, 'object_comment_flag/update', 'POST', {
    account_id: adAccountId,
    finder_ad_object_id: finderAdObjectId,
    comment_id: commentId,
    op_type: opType, // 'ADD' or 'DELETE'
  }, adAccountId);
}

// ============ 动态创意 ============

async function getDynamicCreatives(accessToken, adAccountId, params = {}) {
  return adqApiCall(accessToken, 'dynamic_creatives/get', 'GET', {
    account_id: adAccountId,
    page: params.page || 1,
    page_size: Math.min(params.page_size || 100, 100),
    ...(params.filtering ? { filtering: JSON.stringify(params.filtering) } : {}),
    fields: JSON.stringify(params.fields || [
      'dynamic_creative_id', 'adgroup_id', 'campaign_id', 'creative_name',
      'creative_elements', 'created_time', 'last_modified_time',
    ]),
  }, adAccountId);
}

// ============ 商品库 ============

async function getProductCatalogs(accessToken, adAccountId) {
  return adqApiCall(accessToken, 'product_catalogs/get', 'GET', {
    account_id: adAccountId,
  }, adAccountId);
}

async function getProductItems(accessToken, adAccountId, catalogId, params = {}) {
  return adqApiCall(accessToken, 'product_items/get', 'GET', {
    account_id: adAccountId,
    product_catalog_id: catalogId,
    page: params.page || 1,
    page_size: params.page_size || 50,
  }, adAccountId);
}

// ============ 转化回传 ============

async function reportUserActions(accessToken, adAccountId, actionSetId, actions) {
  return adqApiCall(accessToken, 'user_actions/add', 'POST', {
    account_id: adAccountId,
    user_action_set_id: actionSetId,
    actions,
  }, adAccountId);
}

module.exports = {
  getAdqConfig,
  refreshToken,
  getValidToken,
  getUserToken,
  adqApiCall,
  getDailyReports,
  getHourlyReports,
  getAdgroups,
  createAdgroup,
  updateAdgroup,
  createDynamicCreative,
  uploadImage,
  uploadVideo,
  getComments,
  replyComment,
  deleteComment,
  toggleFeaturedComment,
  getDynamicCreatives,
  getProductCatalogs,
  getProductItems,
  reportUserActions,
};
