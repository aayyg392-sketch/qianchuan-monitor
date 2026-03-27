const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { syncAll } = require('../services/sync');
const logger = require('../logger');

// 获取所有设置
router.get('/', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value, description FROM system_settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = { value: r.setting_value, description: r.description }; });
    res.json({ code: 0, data: settings });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 保存设置
router.post('/', auth(), async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') return res.json({ code: 400, msg: '参数错误' });
  try {
    for (const [key, value] of Object.entries(settings)) {
      await db.query('INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?', [key, value, value]);
    }
    res.json({ code: 0, msg: '设置保存成功' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 手动同步
router.post('/sync-now', auth(), async (req, res) => {
  syncAll().catch(e => logger.error('手动全量同步失败', { error: e.message }));
  res.json({ code: 0, msg: '同步任务已启动' });
});

// 获取巨量营销配置
router.get('/marketing', auth(), async (req, res) => {
  try {
    const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('marketing_app_id','marketing_app_secret')");
    const config = {};
    settings.forEach(r => { config[r.setting_key] = r.setting_value; });

    const [accounts] = await db.query('SELECT advertiser_id, advertiser_name, token_expires_at, status, updated_at FROM marketing_accounts ORDER BY id');

    res.json({ code: 0, data: { config, accounts } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 保存巨量营销配置
router.post('/marketing', auth(), async (req, res) => {
  try {
    const { marketing_app_id, marketing_app_secret } = req.body;
    if (marketing_app_id) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('marketing_app_id',?,'巨量营销 APP ID') ON DUPLICATE KEY UPDATE setting_value=?", [marketing_app_id, marketing_app_id]);
    }
    if (marketing_app_secret) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('marketing_app_secret',?,'巨量营销 APP Secret') ON DUPLICATE KEY UPDATE setting_value=?", [marketing_app_secret, marketing_app_secret]);
    }
    res.json({ code: 0, msg: '巨量营销配置已保存' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 手动刷新巨量营销Token
router.post('/marketing/refresh-token', auth(), async (req, res) => {
  try {
    const commentSync = require('../services/comment-sync');
    const [accounts] = await db.query('SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM marketing_accounts WHERE status=1');
    if (!accounts.length) return res.json({ code: 400, msg: '无可用营销账户' });
    for (const account of accounts) {
      await commentSync.refreshMarketingToken(account);
    }
    const [updated] = await db.query('SELECT advertiser_id, advertiser_name, token_expires_at, status FROM marketing_accounts WHERE status=1');
    res.json({ code: 0, data: updated, msg: 'Token刷新成功' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 获取千川配置
router.get('/qianchuan', auth(), async (req, res) => {
  try {
    const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('qianchuan_app_id','qianchuan_app_secret')");
    const config = {};
    settings.forEach(r => { config[r.setting_key] = r.setting_value; });

    const [accounts] = await db.query('SELECT advertiser_id, advertiser_name, token_expires_at, status FROM qc_accounts WHERE status=1 ORDER BY advertiser_id');

    res.json({ code: 0, data: { config, accounts } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

module.exports = router;
