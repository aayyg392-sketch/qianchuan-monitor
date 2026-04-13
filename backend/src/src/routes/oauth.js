const axios = require('axios');
const db = require('../db');
const logger = require('../logger');

const APP_ID = '1859525766684851';
const APP_SECRET = process.env.APP_SECRET || '67e5c48c38e04c36140c41ce8ad44f5b52c105f1';
const BASE_URL = 'https://ad.oceanengine.com/open_api';
const CALLBACK_URL = 'https://business.snefe.com/api/accounts/oauth-callback';

module.exports = function(router) {
  router.get('/oauth-url', (req, res) => {
    const state = 'qc_' + Date.now();
    const url = `https://open.oceanengine.com/audit/oauth.html?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=${state}`;
    res.json({ code: 0, data: { url, state } });
  });

  router.get('/oauth-callback', async (req, res) => {
    const { auth_code, state } = req.query;
    if (!auth_code) return res.send('<h2>授权失败</h2><pre>缺少auth_code</pre>');
    try {
      // Step 1: Exchange auth_code for access_token
      const tokenRes = await axios.post(BASE_URL + '/oauth2/access_token/', {
        appid: APP_ID, secret: APP_SECRET,
        grant_type: 'auth_code', auth_code
      }, { headers: { 'Content-Type': 'application/json' } });

      const data = tokenRes.data?.data;
      if (!data || !data.access_token) {
        logger.error('[OAuth] token exchange failed', tokenRes.data);
        return res.send('<h2>换取Token失败</h2><pre>' + JSON.stringify(tokenRes.data, null, 2) + '</pre>');
      }

      const expiresAt = new Date(Date.now() + (data.expires_in || 86400) * 1000);
      logger.info('[OAuth] Token obtained, expires: ' + expiresAt.toISOString());

      // Step 2: Get authorized advertiser list using the new token
      let advertiserIds = [];
      try {
        const advRes = await axios.get(BASE_URL + '/oauth2/advertiser/get/', {
          params: { access_token: data.access_token, app_id: APP_ID },
          headers: { 'Content-Type': 'application/json' }
        });
        const advData = advRes.data?.data;
        if (advData && advData.list) {
          advertiserIds = advData.list.map(a => String(a.advertiser_id));
          logger.info('[OAuth] Found ' + advertiserIds.length + ' authorized advertisers');
        }
      } catch (e) {
        logger.warn('[OAuth] Failed to get advertiser list: ' + e.message);
      }

      // Step 3: Update all matching accounts
      const [accs] = await db.query('SELECT id, advertiser_id, advertiser_name FROM qc_accounts WHERE status=1');
      let updated = 0;

      // 主账户授权：Token对所有子账户通用，统一更新全部账户
      for (const acc of accs) {
        await db.query('UPDATE qc_accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE id=?', [
          data.access_token, data.refresh_token || '', expiresAt, acc.id
        ]);
        updated++;
        logger.info('[OAuth] Updated: ' + acc.advertiser_name);
      }
      logger.info('[OAuth] 主账户授权，已统一更新全部 ' + updated + ' 个账户Token');

      logger.info('[OAuth] Total updated: ' + updated + ' accounts, expires: ' + expiresAt.toISOString());
      res.send('<!DOCTYPE html><html><body style="text-align:center;padding:60px;font-family:sans-serif;background:#f0f2f5"><div style="background:#fff;max-width:400px;margin:0 auto;padding:40px;border-radius:12px"><h2 style="color:#52c41a">授权成功!</h2><p>已更新 ' + updated + ' 个账号的Token</p><p>有效期至: ' + expiresAt.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) + '</p></div></body></html>');
    } catch (e) {
      logger.error('[OAuth] callback error', { error: e.message });
      res.send('<h2>授权出错</h2><pre>' + e.message + '</pre>');
    }
  });
};
