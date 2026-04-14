/**
 * 腾讯广告 ADQ OAuth 授权 & 账户管理路由
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const { getAdqConfig } = require('../services/adq-sync');

const ADQ_AUTH_URL = 'https://developers.e.qq.com/oauth/authorize';
const ADQ_TOKEN_URL = 'https://api.e.qq.com/oauth/token';

const router = require('express').Router();

// 自动建表
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS adq_accounts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(50) NOT NULL UNIQUE COMMENT '腾讯广告账户ID',
      account_name VARCHAR(200) DEFAULT '' COMMENT '账户名称',
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME DEFAULT NULL,
      refresh_expires_at DATETIME DEFAULT NULL,
      status TINYINT DEFAULT 1 COMMENT '1=启用 0=停用',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
let tableReady = false;
router.use(async (req, res, next) => {
  if (!tableReady) { try { await ensureTable(); tableReady = true; } catch (e) { logger.error('adq_accounts init:', e.message); } }
  next();
});

/**
 * GET /api/adq/auth-url — 获取授权链接
 */
router.get('/auth-url', async (req, res) => {
  try {
    const cfg = await getAdqConfig();
    const url = `${ADQ_AUTH_URL}?client_id=${cfg.adq_client_id}&redirect_uri=${encodeURIComponent(cfg.adq_redirect_uri)}&response_type=code&scope=ads_management,ads_insight`;
    res.json({ code: 0, data: { url } });
  } catch (e) {
    logger.error('获取ADQ授权链接失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq/oauth-callback — OAuth 回调
 */
router.get('/oauth-callback', async (req, res) => {
  const { authorization_code } = req.query;
  if (!authorization_code) return res.json({ code: -1, msg: '缺少authorization_code' });

  try {
    const cfg = await getAdqConfig();
    const resp = await axios.get(ADQ_TOKEN_URL, {
      params: {
        client_id: cfg.adq_client_id,
        client_secret: cfg.adq_client_secret,
        grant_type: 'authorization_code',
        authorization_code,
        redirect_uri: cfg.adq_redirect_uri,
      },
    });

    const data = resp.data;
    if (data.code !== 0) return res.json({ code: -1, msg: `授权失败: ${data.message}` });

    const tokenData = data.data;
    const expiresAt = new Date(Date.now() + tokenData.access_token_expires_in * 1000);
    const refreshExpiresAt = new Date(Date.now() + tokenData.refresh_token_expires_in * 1000);

    // 获取授权的广告账户列表
    const accountResp = await axios.get('https://api.e.qq.com/v3.0/advertiser/get', {
      params: {
        access_token: tokenData.access_token,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: Math.random().toString(36).slice(2),
      },
    });

    const accounts = accountResp.data?.data?.list || [];
    for (const acct of accounts) {
      await db.query(
        `INSERT INTO adq_accounts (account_id, account_name, access_token, refresh_token, token_expires_at, refresh_expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           account_name = VALUES(account_name),
           access_token = VALUES(access_token),
           refresh_token = VALUES(refresh_token),
           token_expires_at = VALUES(token_expires_at),
           refresh_expires_at = VALUES(refresh_expires_at),
           status = 1`,
        [acct.account_id, acct.corporation_name || '', tokenData.access_token, tokenData.refresh_token, expiresAt, refreshExpiresAt]
      );
    }

    logger.info(`ADQ OAuth授权成功, 关联${accounts.length}个账户`);
    res.redirect(`${process.env.FRONTEND_URL || ''}/adq/accounts?msg=授权成功`);
  } catch (e) {
    logger.error('ADQ OAuth回调失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq/accounts — 账户列表
 */
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, account_id, account_name, status, token_expires_at, refresh_expires_at, created_at FROM adq_accounts ORDER BY created_at DESC'
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * PUT /api/adq/accounts/:id/status — 启用/停用账户
 */
router.put('/accounts/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await db.query('UPDATE adq_accounts SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ code: 0, msg: '操作成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
