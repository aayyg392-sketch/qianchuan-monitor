const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { getAuthUrl, getAccessToken, ensureFreshToken, ensureTables } = require('../services/tiktok-api');
const logger = require('../logger');

// 启动时建表
ensureTables().catch(e => logger.error('[TikTok] 建表失败', { error: e.message }));

// 获取授权链接
router.get('/auth-url', auth(), (req, res) => {
  const url = getAuthUrl(req.user?.id || '');
  res.json({ code: 0, data: { url } });
});

// OAuth 回调
router.get('/callback', async (req, res) => {
  const { auth_code, state } = req.query;
  if (!auth_code) return res.redirect(process.env.FRONTEND_URL + '/tt-accounts?error=no_code');
  try {
    const result = await getAccessToken(auth_code);
    if (result.code !== 0 || !result.data) {
      logger.error('[TikTok] 授权失败', { result });
      return res.redirect(process.env.FRONTEND_URL + '/tt-accounts?error=auth_failed');
    }
    const d = result.data;
    const dayjs = require('dayjs');
    const expiresAt = dayjs().add(d.access_token_expires_in || 86400, 'second').format('YYYY-MM-DD HH:mm:ss');
    // 可能返回多个 advertiser_id
    const advIds = d.advertiser_ids || [d.advertiser_id];
    for (const advId of advIds) {
      await db.query(`INSERT INTO tt_accounts (advertiser_id, access_token, refresh_token, token_expires_at, created_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE access_token=VALUES(access_token), refresh_token=VALUES(refresh_token),
        token_expires_at=VALUES(token_expires_at), status=1, updated_at=NOW()`,
        [advId, d.access_token, d.refresh_token, expiresAt, state || null]);
    }
    // 获取广告主名称
    try {
      const { TikTokAPI } = require('../services/tiktok-api');
      const api = new TikTokAPI(d.access_token);
      const info = await api.getAdvertiserInfo(advIds);
      if (info.code === 0 && info.data?.list) {
        for (const adv of info.data.list) {
          await db.query('UPDATE tt_accounts SET advertiser_name=? WHERE advertiser_id=?', [adv.advertiser_name, adv.advertiser_id]);
        }
      }
    } catch (e) { logger.warn('[TikTok] 获取广告主名称失败', { error: e.message }); }
    res.redirect(process.env.FRONTEND_URL + '/tt-accounts?success=1');
  } catch (e) {
    logger.error('[TikTok] 回调处理失败', { error: e.message });
    res.redirect(process.env.FRONTEND_URL + '/tt-accounts?error=server_error');
  }
});

// 账户列表
router.get('/accounts', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, advertiser_id, advertiser_name, market, timezone, currency, status, token_expires_at, created_at FROM tt_accounts ORDER BY created_at DESC');
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 更新账户信息
router.put('/accounts/:id', auth(), async (req, res) => {
  const { market, timezone, currency, advertiser_name } = req.body;
  try {
    await db.query('UPDATE tt_accounts SET market=COALESCE(?,market), timezone=COALESCE(?,timezone), currency=COALESCE(?,currency), advertiser_name=COALESCE(?,advertiser_name) WHERE id=?',
      [market, timezone, currency, advertiser_name, req.params.id]);
    res.json({ code: 0, msg: '更新成功' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 解绑账户
router.delete('/accounts/:id', auth(), async (req, res) => {
  try {
    await db.query('UPDATE tt_accounts SET status=0 WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '已解绑' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// Token 刷新
router.post('/accounts/:id/refresh', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tt_accounts WHERE id=? AND status=1', [req.params.id]);
    if (!rows.length) return res.json({ code: 404, msg: '账户不存在' });
    await ensureFreshToken(rows[0]);
    res.json({ code: 0, msg: 'Token已刷新' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
