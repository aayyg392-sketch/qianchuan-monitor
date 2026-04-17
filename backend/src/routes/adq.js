/**
 * 腾讯广告 ADQ 授权 & 账户管理路由
 * 支持两种添加方式：
 *   1. 组织Token模式：输入组织ID的token，自动发现并添加所有子账户
 *   2. 账户Token模式：直接输入账户ID + token
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');

const ADQ_API_BASE = 'https://api.e.qq.com/v3.0';

const auth = require('../middleware/auth');
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

// 通用API请求
function adqGet(endpoint, accessToken, params = {}) {
  return axios.get(`${ADQ_API_BASE}/${endpoint}`, {
    params: {
      access_token: accessToken,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Math.random().toString(36).slice(2),
      ...params,
    },
    timeout: 30000,
  });
}

/**
 * POST /api/adq/add-token — 添加账户（支持组织token自动发现子账户）
 * body: { access_token, refresh_token, account_id? }
 *   - 不传account_id：尝试用organization_account_relation/get自动发现子账户
 *   - 传account_id：直接添加指定账户（支持逗号分隔多个）
 */
router.post('/add-token', auth(), async (req, res) => {
  const { access_token, refresh_token, account_id } = req.body;
  if (!access_token) return res.json({ code: -1, msg: '请输入access_token' });

  try {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000);
    const refreshExpiresAt = new Date(Date.now() + 90 * 86400 * 1000);

    let accountList = []; // [{ account_id, account_name }]

    if (!account_id || !account_id.trim()) {
      // ===== 模式1：自动发现子账户 =====
      // 先尝试 organization_account_relation/get（组织token）
      try {
        const orgResp = await adqGet('organization_account_relation/get', access_token, {
          pagination_mode: 'PAGINATION_MODE_CURSOR',
          page_size: 100,
          page: 1,
        });
        if (orgResp.data?.code === 0) {
          const list = orgResp.data.data?.list || [];
          accountList = list.map(item => ({
            account_id: String(item.account_id),
            account_name: item.corporation_name || '',
          }));
          // 如果有更多页，继续拉取
          let hasMore = orgResp.data.data?.cursor_page_info?.has_more;
          let cursor = orgResp.data.data?.cursor_page_info?.cursor;
          while (hasMore && cursor) {
            const nextResp = await adqGet('organization_account_relation/get', access_token, {
              pagination_mode: 'PAGINATION_MODE_CURSOR',
              page_size: 100,
              cursor,
            });
            if (nextResp.data?.code === 0) {
              const nextList = nextResp.data.data?.list || [];
              accountList.push(...nextList.map(item => ({
                account_id: String(item.account_id),
                account_name: item.corporation_name || '',
              })));
              hasMore = nextResp.data.data?.cursor_page_info?.has_more;
              cursor = nextResp.data.data?.cursor_page_info?.cursor;
            } else {
              break;
            }
          }
          logger.info(`ADQ组织Token，发现${accountList.length}个子账户`);
        } else {
          logger.warn('organization_account_relation/get返回:', JSON.stringify(orgResp.data));
        }
      } catch (e) {
        logger.warn('organization_account_relation请求失败:', e.response?.data?.message_cn || e.message);
      }

      // 如果组织接口没拿到账户，尝试 advertiser/get（可能是代理商）
      if (!accountList.length) {
        try {
          const advResp = await adqGet('advertiser/get', access_token, {
            fields: JSON.stringify(['account_id', 'system_status', 'corporation_name']),
            page_size: 100,
            page: 1,
            pagination_mode: 'PAGINATION_MODE_CURSOR',
          });
          if (advResp.data?.code === 0) {
            const list = advResp.data.data?.list || [];
            accountList = list.map(item => ({
              account_id: String(item.account_id),
              account_name: item.corporation_name || '',
            }));
            logger.info(`ADQ advertiser/get发现${accountList.length}个账户`);
          }
        } catch (e) {
          logger.warn('advertiser/get失败:', e.response?.data?.message_cn || e.message);
        }
      }

      if (!accountList.length) {
        return res.json({ code: -1, msg: '未能自动发现账户。请确认Token来自组织身份（客户工作台），或手动填写广告主账户ID' });
      }
    } else {
      // ===== 模式2：手动指定account_id =====
      const ids = account_id.split(/[,，\s\n]+/).map(s => s.trim()).filter(Boolean);
      if (!ids.length) return res.json({ code: -1, msg: '请输入有效的广告主账户ID' });

      for (const acctId of ids) {
        let accountName = '';
        try {
          const resp = await adqGet('advertiser/get', access_token, {
            account_id: acctId,
            fields: JSON.stringify(['account_id', 'system_status', 'corporation_name']),
            page_size: 10, page: 1, pagination_mode: 'PAGINATION_MODE_CURSOR',
          });
          if (resp.data?.code === 0) {
            accountName = resp.data.data?.list?.[0]?.corporation_name || '';
          }
        } catch (e) { /* ignore */ }
        accountList.push({ account_id: acctId, account_name: accountName });
      }
    }

    // ===== 批量入库 =====
    let addedCount = 0;
    for (const acct of accountList) {
      await db.query(
        `INSERT INTO adq_accounts (account_id, account_name, access_token, refresh_token, token_expires_at, refresh_expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           account_name = COALESCE(NULLIF(VALUES(account_name), ''), account_name),
           access_token = VALUES(access_token),
           refresh_token = VALUES(refresh_token),
           token_expires_at = VALUES(token_expires_at),
           refresh_expires_at = VALUES(refresh_expires_at),
           status = 1`,
        [acct.account_id, acct.account_name, access_token, refresh_token || '', expiresAt, refreshExpiresAt]
      );
      addedCount++;
    }

    logger.info(`ADQ添加Token成功, ${addedCount}个账户`);
    res.json({ code: 0, msg: `添加成功，已关联${addedCount}个账户`, data: { count: addedCount, accounts: accountList } });
  } catch (e) {
    logger.error('ADQ添加Token失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq/discover-accounts — 仅发现账户（不入库），用于前端预览
 */
router.post('/discover-accounts', auth(), async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.json({ code: -1, msg: '请输入access_token' });

  try {
    let accounts = [];
    let source = '';

    // 尝试组织接口
    try {
      const orgResp = await adqGet('organization_account_relation/get', access_token, {
        pagination_mode: 'PAGINATION_MODE_CURSOR', page_size: 100, page: 1,
      });
      if (orgResp.data?.code === 0) {
        accounts = (orgResp.data.data?.list || []).map(item => ({
          account_id: String(item.account_id),
          account_name: item.corporation_name || '',
          is_bid: item.is_bid,
          is_mp: item.is_mp,
        }));
        source = 'organization';
      }
    } catch (e) { /* not org token */ }

    // 尝试advertiser/get
    if (!accounts.length) {
      try {
        const advResp = await adqGet('advertiser/get', access_token, {
          fields: JSON.stringify(['account_id', 'system_status', 'corporation_name']),
          page_size: 100, page: 1, pagination_mode: 'PAGINATION_MODE_CURSOR',
        });
        if (advResp.data?.code === 0) {
          accounts = (advResp.data.data?.list || []).map(item => ({
            account_id: String(item.account_id),
            account_name: item.corporation_name || '',
            system_status: item.system_status,
          }));
          source = 'advertiser';
        }
      } catch (e) { /* ignore */ }
    }

    res.json({ code: 0, data: { accounts, source } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq/accounts — 账户列表
 */
router.get('/accounts', auth(), async (req, res) => {
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
router.put('/accounts/:id/status', auth(), async (req, res) => {
  try {
    const { status } = req.body;
    await db.query('UPDATE adq_accounts SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ code: 0, msg: '操作成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * DELETE /api/adq/accounts/:id — 删除账户
 */
router.delete('/accounts/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM adq_accounts WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq/oauth-url — 生成OAuth授权链接（用户点击后跳转腾讯广告授权页）
 */
router.get('/oauth-url', auth(), async (req, res) => {
  try {
    const { getAdqConfig } = require('../services/adq-sync');
    const cfg = await getAdqConfig();
    if (!cfg.adq_client_id) return res.json({ code: -1, msg: '请先配置ADQ APP ID' });

    const redirectUri = cfg.adq_redirect_uri || 'https://business.snefe.com/api/adq/oauth-callback';
    const state = Math.random().toString(36).slice(2, 10);
    const authorizeUrl = `https://developers.e.qq.com/oauth/authorize?client_id=${cfg.adq_client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=ads_management,account_management,ads_insights`;

    res.json({ code: 0, data: { url: authorizeUrl, state } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq/oauth-callback — OAuth回调，用authorization_code换token
 */
router.get('/oauth-callback', async (req, res) => {
  const { authorization_code, state } = req.query;
  if (!authorization_code) return res.send('<h2>授权失败：未收到authorization_code</h2><script>setTimeout(()=>window.close(),3000)</script>');

  try {
    const { getAdqConfig } = require('../services/adq-sync');
    const cfg = await getAdqConfig();
    const redirectUri = cfg.adq_redirect_uri || 'https://business.snefe.com/api/adq/oauth-callback';

    // 换取token
    const tokenResp = await axios.get('https://api.e.qq.com/oauth/token', {
      params: {
        client_id: cfg.adq_client_id,
        client_secret: cfg.adq_client_secret,
        grant_type: 'authorization_code',
        authorization_code,
        redirect_uri: redirectUri,
      },
    });

    const data = tokenResp.data;
    if (data.code !== 0) {
      logger.error('ADQ OAuth换Token失败', data);
      return res.send(`<h2>授权失败：${data.message_cn || data.message}</h2><script>setTimeout(()=>window.close(),5000)</script>`);
    }

    const tokenData = data.data;
    const accountId = tokenData.authorizer_info?.account_id;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresAt = new Date(Date.now() + (tokenData.access_token_expires_in || 2592000) * 1000);
    const refreshExpiresAt = new Date(Date.now() + (tokenData.refresh_token_expires_in || 2592000) * 1000);

    if (!accountId) {
      logger.error('ADQ OAuth未返回account_id', tokenData);
      return res.send('<h2>授权成功但未获取到账户ID</h2><script>setTimeout(()=>window.close(),3000)</script>');
    }

    // 获取账户名称
    let accountName = '';
    try {
      const advResp = await axios.get('https://api.e.qq.com/v3.0/advertiser/get', {
        params: {
          access_token: accessToken,
          timestamp: Math.floor(Date.now() / 1000),
          nonce: Math.random().toString(36).slice(2),
          account_id: accountId,
          fields: JSON.stringify(['account_id', 'corporation_name']),
          page_size: 10, page: 1, pagination_mode: 'PAGINATION_MODE_CURSOR',
        },
      });
      if (advResp.data?.code === 0) {
        accountName = advResp.data.data?.list?.[0]?.corporation_name || '';
      }
    } catch (e) { /* ignore */ }

    // 入库
    await db.query(
      `INSERT INTO adq_accounts (account_id, account_name, access_token, refresh_token, token_expires_at, refresh_expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         account_name = COALESCE(NULLIF(VALUES(account_name), ''), account_name),
         access_token = VALUES(access_token),
         refresh_token = VALUES(refresh_token),
         token_expires_at = VALUES(token_expires_at),
         refresh_expires_at = VALUES(refresh_expires_at),
         status = 1`,
      [String(accountId), accountName, accessToken, refreshToken || '', expiresAt, refreshExpiresAt]
    );

    logger.info(`ADQ OAuth授权成功: account_id=${accountId}, name=${accountName}`);
    res.send(`<html><body style="text-align:center;padding:60px;font-family:sans-serif">
      <h2 style="color:#52c41a">✓ 授权成功</h2>
      <p>账户ID: ${accountId}</p>
      <p>名称: ${accountName || '-'}</p>
      <p style="color:#8c8c8c">3秒后自动关闭，请刷新设置页查看</p>
      <script>setTimeout(()=>{window.opener&&window.opener.postMessage('adq-oauth-done','*');window.close()},3000)</script>
    </body></html>`);
  } catch (e) {
    logger.error('ADQ OAuth回调处理失败', { error: e.message });
    res.send(`<h2>授权失败：${e.message}</h2><script>setTimeout(()=>window.close(),5000)</script>`);
  }
});

module.exports = router;
