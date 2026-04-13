/**
 * 快手磁力引擎 OAuth 授权路由
 * 支持多店铺、多账号独立授权，每个广告账户独立token
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');

const KS_AD_AUTH_URL = 'https://developers.e.kuaishou.com/tools/authorize';
const KS_AD_TOKEN_URL = 'https://ad.e.kuaishou.com/rest/openapi/oauth2/authorize/access_token';
const KS_AD_REFRESH_URL = 'https://ad.e.kuaishou.com/rest/openapi/oauth2/authorize/refresh_token';
const KS_AD_APPROVAL_LIST_URL = 'https://ad.e.kuaishou.com/rest/openapi/oauth2/authorize/approval/list';

const router = require('express').Router();

// 从 system_settings 读取配置
async function getConfig() {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('ks_ad_app_id', 'ks_ad_app_secret')"
  );
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  return cfg;
}

// 自动建表 + 加字段
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ks_ad_accounts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      advertiser_id VARCHAR(50) NOT NULL UNIQUE,
      advertiser_name VARCHAR(200) DEFAULT '',
      shop_id VARCHAR(64) DEFAULT '',
      shop_name VARCHAR(200) DEFAULT '',
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME DEFAULT NULL,
      refresh_expires_at DATETIME DEFAULT NULL,
      status TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_shop (shop_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 兼容旧表：添加 shop_id, shop_name 字段
  try { await db.query('ALTER TABLE ks_ad_accounts ADD COLUMN shop_id VARCHAR(64) DEFAULT "" AFTER advertiser_name'); } catch (e) {}
  try { await db.query('ALTER TABLE ks_ad_accounts ADD COLUMN shop_name VARCHAR(200) DEFAULT "" AFTER shop_id'); } catch (e) {}
  try { await db.query('ALTER TABLE ks_ad_accounts ADD INDEX idx_shop (shop_id)'); } catch (e) {}
}
let tableReady = false;
router.use(async (req, res, next) => {
  if (!tableReady) { try { await ensureTable(); tableReady = true; } catch (e) { console.error('ks_ad_accounts init:', e.message); } }
  next();
});

/**
 * 获取所有已授权的广告主ID列表
 */
async function fetchApprovalList(accessToken, appId, appSecret) {
  const allIds = [];
  let pageNo = 1;
  const pageSize = 200;
  let isEnd = false;

  while (!isEnd) {
    try {
      const resp = await axios.post(KS_AD_APPROVAL_LIST_URL, {
        app_id: Number(appId),
        secret: appSecret,
        access_token: accessToken,
        page_no: pageNo,
        page_size: pageSize,
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

      const result = resp.data;
      logger.info(`[KS-AD] approval/list page=${pageNo} code=${result.code} count=${result.data?.details?.length || 0}`);

      if ((result.code === 0 || result.code === 1 || result.result === 1) && result.data?.details) {
        const ids = result.data.details.map(id => String(id));
        allIds.push(...ids);
        isEnd = result.data.isEnd !== false || ids.length < pageSize;
      } else {
        logger.warn('[KS-AD] approval/list异常: ' + JSON.stringify(result));
        isEnd = true;
      }
      pageNo++;
    } catch (e) {
      logger.error('[KS-AD] approval/list请求失败: ' + e.message);
      isEnd = true;
    }
  }

  return allIds;
}

/**
 * GET /api/ks-ad/oauth-url?shop_id=xxx
 * 支持传入 shop_id，授权时关联到指定店铺
 */
router.get('/oauth-url', async (req, res) => {
  try {
    const cfg = await getConfig();
    if (!cfg.ks_ad_app_id || !cfg.ks_ad_app_secret) {
      return res.json({ code: -1, msg: '请先配置快手磁力 APP ID 和 APP Secret' });
    }
    const shopId = req.query.shop_id || '';
    const scope = ['esp_ad_query', 'esp_ad_manage', 'esp_report_service', 'esp_account_service', 'esp_fund_service', 'public_dmp_service', 'public_agent_service', 'public_account_service'];
    const state = 'ksad_' + (shopId || 'none') + '_' + Date.now();
    const redirectUri = 'https://business.snefe.com/api/ks-ad/oauth-callback';
    const url = `${KS_AD_AUTH_URL}?app_id=${cfg.ks_ad_app_id}&scope=${encodeURIComponent(JSON.stringify(scope))}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&oauth_type=advertiser`;
    res.json({ code: 0, data: { url, state } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ks-ad/oauth-callback
 * state 中包含 shop_id 信息: ksad_{shop_id}_{timestamp}
 */
router.get('/oauth-callback', async (req, res) => {
  const { auth_code, state } = req.query;
  if (!auth_code) {
    return res.send('<h2>授权失败</h2><pre>缺少授权码(auth_code)</pre>');
  }

  // 从 state 中解析 shop_id
  let shopId = '';
  let shopName = '';
  if (state) {
    const parts = state.split('_');
    if (parts.length >= 3 && parts[1] !== 'none') {
      shopId = parts[1];
    }
  }

  try {
    // 查询店铺名称
    if (shopId) {
      const [shops] = await db.query('SELECT shop_name FROM ks_accounts WHERE shop_id = ? LIMIT 1', [shopId]);
      if (shops.length) shopName = shops[0].shop_name;
    }

    const cfg = await getConfig();
    // 1. 用 auth_code 换取 access_token
    const tokenRes = await axios.post(KS_AD_TOKEN_URL, {
      app_id: Number(cfg.ks_ad_app_id),
      secret: cfg.ks_ad_app_secret,
      auth_code: auth_code
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    const result = tokenRes.data;
    logger.info('[KS-AD-OAuth] Token响应 code=' + result.code + ' user_id=' + result.data?.user_id);

    if (result.code !== 0 || !result.data?.access_token) {
      return res.send(`<h2>授权失败</h2><pre>${JSON.stringify(result, null, 2)}</pre>`);
    }

    const d = result.data;
    const accessToken = d.access_token;
    const refreshToken = d.refresh_token;
    const tokenExpires = new Date(d.access_token_expires_time || Date.now() + (d.access_token_expires_in || 86400) * 1000);
    const refreshExpires = new Date(d.refresh_token_expires_time || Date.now() + (d.refresh_token_expires_in || 2592000) * 1000);

    // 2. 通过 approval/list 获取已授权的广告主ID列表
    const advertiserIds = await fetchApprovalList(accessToken, cfg.ks_ad_app_id, cfg.ks_ad_app_secret);
    logger.info(`[KS-AD-OAuth] 获取到 ${advertiserIds.length} 个已授权广告主, shop_id=${shopId}`);

    if (advertiserIds.length === 0) {
      return res.send(`<!DOCTYPE html><html><body style="text-align:center;padding:60px;font-family:sans-serif;background:#f0f2f5">
        <div style="background:#fff;max-width:500px;margin:0 auto;padding:40px;border-radius:12px">
          <h2 style="color:#fa8c16">授权成功但未获取到广告主列表</h2>
          <p>Token已获取，但 approval/list 返回空列表</p>
          <p>请检查开发者平台是否正确配置了广告主授权</p>
        </div></body></html>`);
    }

    // 3. 批量保存所有广告主账户（每个账户独立保存token + 关联shop_id）
    let savedCount = 0;
    for (const advId of advertiserIds) {
      try {
        await db.query(`
          INSERT INTO ks_ad_accounts (advertiser_id, advertiser_name, shop_id, shop_name, access_token, refresh_token, token_expires_at, refresh_expires_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE
            shop_id = VALUES(shop_id),
            shop_name = VALUES(shop_name),
            access_token = VALUES(access_token),
            refresh_token = VALUES(refresh_token),
            token_expires_at = VALUES(token_expires_at),
            refresh_expires_at = VALUES(refresh_expires_at),
            status = 1
        `, [advId, advId, shopId, shopName, accessToken, refreshToken, tokenExpires, refreshExpires]);
        savedCount++;
      } catch (e) {
        logger.error(`[KS-AD-OAuth] 保存 ${advId} 失败: ${e.message}`);
      }
    }

    logger.info(`[KS-AD-OAuth] 共保存 ${savedCount}/${advertiserIds.length} 个广告账户, shop=${shopName || shopId}`);

    // 4. 尝试获取广告主名称
    updateAdvertiserNames(accessToken, advertiserIds).catch(e => {
      logger.warn('[KS-AD-OAuth] 更新广告主名称失败: ' + e.message);
    });

    const shopLabel = shopName || shopId || '未关联店铺';
    res.send(`<!DOCTYPE html><html><body style="text-align:center;padding:60px;font-family:sans-serif;background:#f0f2f5">
      <div style="background:#fff;max-width:500px;margin:0 auto;padding:40px;border-radius:12px">
        <h2 style="color:#52c41a">快手磁力授权成功!</h2>
        <p style="font-size:14px;color:#666;margin:8px 0">关联店铺: <b>${shopLabel}</b></p>
        <p style="font-size:18px;margin:16px 0">已同步 <b style="color:#1890ff;font-size:24px">${savedCount}</b> 个广告账户</p>
        <p style="color:#888">Token有效期至: ${tokenExpires.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
        <p style="margin-top:20px;color:#888">此窗口可关闭，返回系统查看账户列表</p>
      </div></body></html>`);
  } catch (e) {
    logger.error('[KS-AD-OAuth] 回调异常: ' + e.message);
    res.send(`<h2>授权出错</h2><pre>${e.message}</pre>`);
  }
});

/**
 * 异步更新广告主名称
 */
async function updateAdvertiserNames(accessToken, advertiserIds) {
  for (const advId of advertiserIds.slice(0, 50)) {
    try {
      const resp = await axios.get('https://ad.e.kuaishou.com/rest/openapi/v1/advertiser/info', {
        params: { advertiser_id: advId },
        headers: { 'Access-Token': accessToken },
        timeout: 10000,
      });
      if (resp.data?.code === 0 && resp.data?.data?.advertiser_name) {
        await db.query('UPDATE ks_ad_accounts SET advertiser_name=? WHERE advertiser_id=?',
          [resp.data.data.advertiser_name, advId]);
      }
    } catch (e) { /* skip */ }
  }
}

/**
 * POST /api/ks-ad/refresh-token
 * 按独立token分组刷新（不同授权的token不同）
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const cfg = await getConfig();
    // 按 refresh_token 分组，每组刷新一次
    const [accounts] = await db.query('SELECT id, advertiser_id, refresh_token, token_expires_at FROM ks_ad_accounts WHERE status = 1');
    if (!accounts.length) return res.json({ code: -1, msg: '没有已授权的账户' });

    const tokenGroups = {};
    accounts.forEach(a => {
      if (!tokenGroups[a.refresh_token]) tokenGroups[a.refresh_token] = [];
      tokenGroups[a.refresh_token].push(a.advertiser_id);
    });

    let refreshed = 0;
    for (const [rt, advIds] of Object.entries(tokenGroups)) {
      try {
        const r = await axios.post(KS_AD_REFRESH_URL, {
          app_id: Number(cfg.ks_ad_app_id),
          secret: cfg.ks_ad_app_secret,
          refresh_token: rt
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

        if (r.data?.code === 0 && r.data?.data?.access_token) {
          const d = r.data.data;
          const tokenExpires = new Date(d.access_token_expires_time || Date.now() + (d.access_token_expires_in || 86400) * 1000);
          const refreshExpires = new Date(d.refresh_token_expires_time || Date.now() + (d.refresh_token_expires_in || 2592000) * 1000);
          const ph = advIds.map(() => '?').join(',');
          await db.query(
            `UPDATE ks_ad_accounts SET access_token=?, refresh_token=?, token_expires_at=?, refresh_expires_at=? WHERE advertiser_id IN (${ph})`,
            [d.access_token, d.refresh_token, tokenExpires, refreshExpires, ...advIds]
          );
          refreshed += advIds.length;
        }
      } catch (e) {
        logger.error(`[KS-AD] Token刷新失败(${advIds.length}个账户): ${e.message}`);
      }
    }

    res.json({ code: 0, msg: `已刷新 ${refreshed} 个账户` });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ks-ad/accounts?shop_id=xxx
 * 支持按店铺筛选
 */
router.get('/accounts', async (req, res) => {
  try {
    const shopId = req.query.shop_id;
    let sql = 'SELECT advertiser_id, advertiser_name, shop_id, shop_name, status, token_expires_at, created_at FROM ks_ad_accounts ORDER BY shop_id, id';
    let params = [];
    if (shopId) {
      sql = 'SELECT advertiser_id, advertiser_name, shop_id, shop_name, status, token_expires_at, created_at FROM ks_ad_accounts WHERE shop_id = ? ORDER BY id';
      params = [shopId];
    }
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad/bind-shop
 * 手动绑定广告账户到店铺
 */
router.post('/bind-shop', async (req, res) => {
  try {
    const { advertiser_id, shop_id } = req.body;
    if (!advertiser_id || !shop_id) return res.json({ code: -1, msg: '参数缺失' });
    let shopName = '';
    const [shops] = await db.query('SELECT shop_name FROM ks_accounts WHERE shop_id = ? LIMIT 1', [shop_id]);
    if (shops.length) shopName = shops[0].shop_name;
    await db.query('UPDATE ks_ad_accounts SET shop_id=?, shop_name=? WHERE advertiser_id=?', [shop_id, shopName, String(advertiser_id)]);
    res.json({ code: 0, msg: '已绑定' });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

/**
 * POST /api/ks-ad/sync-advertisers
 */
router.post('/sync-advertisers', async (req, res) => {
  try {
    const cfg = await getConfig();
    // 按独立token分组拉取
    const [accounts] = await db.query('SELECT access_token, refresh_token, token_expires_at, refresh_expires_at, shop_id, shop_name FROM ks_ad_accounts WHERE status=1');
    if (!accounts.length) return res.json({ code: -1, msg: '没有已授权的账户' });

    const tokenGroups = {};
    accounts.forEach(a => {
      if (!tokenGroups[a.access_token]) tokenGroups[a.access_token] = a;
    });

    let totalSaved = 0;
    for (const acc of Object.values(tokenGroups)) {
      const advertiserIds = await fetchApprovalList(acc.access_token, cfg.ks_ad_app_id, cfg.ks_ad_app_secret);
      for (const advId of advertiserIds) {
        try {
          await db.query(`
            INSERT INTO ks_ad_accounts (advertiser_id, advertiser_name, shop_id, shop_name, access_token, refresh_token, token_expires_at, refresh_expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE access_token=VALUES(access_token), refresh_token=VALUES(refresh_token), status=1
          `, [advId, advId, acc.shop_id || '', acc.shop_name || '', acc.access_token, acc.refresh_token, acc.token_expires_at, acc.refresh_expires_at]);
          totalSaved++;
        } catch (e) { /* skip */ }
      }
    }

    res.json({ code: 0, msg: `已同步 ${totalSaved} 个广告主`, data: { count: totalSaved } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad/rename
 */
router.post("/rename", async (req, res) => {
  try {
    const { advertiser_id, name } = req.body;
    if (!advertiser_id || !name) return res.json({ code: -1, msg: "参数缺失" });
    await db.query("UPDATE ks_ad_accounts SET advertiser_name=? WHERE advertiser_id=?", [name.trim(), String(advertiser_id)]);
    res.json({ code: 0, msg: "已更新" });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});
module.exports = router;
