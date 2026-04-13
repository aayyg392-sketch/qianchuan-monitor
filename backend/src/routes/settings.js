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

// 保存千川配置
router.post('/qianchuan', auth(), async (req, res) => {
  try {
    const { qianchuan_app_id, qianchuan_app_secret } = req.body;
    if (qianchuan_app_id) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('qianchuan_app_id',?,'千川 APP ID') ON DUPLICATE KEY UPDATE setting_value=?", [qianchuan_app_id, qianchuan_app_id]);
    }
    if (qianchuan_app_secret) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('qianchuan_app_secret',?,'千川 APP Secret') ON DUPLICATE KEY UPDATE setting_value=?", [qianchuan_app_secret, qianchuan_app_secret]);
    }
    res.json({ code: 0, msg: '千川配置已保存' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ============ 视频号配置 ============
router.get('/wechat-channels', auth(), async (req, res) => {
  try {
    const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('wx_channels_app_id','wx_channels_app_secret','wx_shop_app_id','wx_shop_app_secret')");
    const config = {};
    settings.forEach(r => { config[r.setting_key] = r.setting_value; });
    res.json({ code: 0, data: config });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

router.post('/wechat-channels', auth(), async (req, res) => {
  try {
    const { wx_channels_app_id, wx_channels_app_secret, wx_shop_app_id, wx_shop_app_secret } = req.body;
    if (wx_channels_app_id) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('wx_channels_app_id',?,'视频号橱窗ID') ON DUPLICATE KEY UPDATE setting_value=?", [wx_channels_app_id, wx_channels_app_id]);
    }
    if (wx_channels_app_secret) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('wx_channels_app_secret',?,'视频号橱窗密钥') ON DUPLICATE KEY UPDATE setting_value=?", [wx_channels_app_secret, wx_channels_app_secret]);
    }
    if (wx_shop_app_id) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('wx_shop_app_id',?,'微信小店AppID') ON DUPLICATE KEY UPDATE setting_value=?", [wx_shop_app_id, wx_shop_app_id]);
    }
    if (wx_shop_app_secret) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('wx_shop_app_secret',?,'微信小店AppSecret') ON DUPLICATE KEY UPDATE setting_value=?", [wx_shop_app_secret, wx_shop_app_secret]);
    }
    res.json({ code: 0, msg: '视频号配置已保存' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 视频号配置 - 读取
router.get('/wx-channels', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('wx_channels_app_id','wx_channels_app_secret','wx_finder_app_id','wx_finder_app_secret','wx_shop_app_id','wx_shop_app_secret')"
    );
    const cfg = {};
    rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
    res.json({ code: 0, data: cfg });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 视频号配置 - 保存
router.post('/wx-channels', auth(), async (req, res) => {
  try {
    const keys = ['wx_finder_app_id', 'wx_finder_app_secret', 'wx_shop_app_id', 'wx_shop_app_secret'];
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        await db.query(
          "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
          [key, req.body[key]]
        );
      }
    }
    res.json({ code: 0, msg: '保存成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ============ 快手小店配置 ============
router.get("/kuaishou", auth(), async (req, res) => {
  try {
    const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('ks_app_key','ks_app_secret')");
    const config = {};
    settings.forEach(r => { config[r.setting_key] = r.setting_value; });
    let accounts = [];
    try { const [rows] = await db.query("SELECT shop_id, shop_name, status, token_expires_at FROM ks_accounts WHERE status=1 ORDER BY id"); accounts = rows; } catch(e) {}
    res.json({ code: 0, data: { config, accounts } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.post("/kuaishou", auth(), async (req, res) => {
  try {
    const { ks_app_key, ks_app_secret } = req.body;
    if (ks_app_key) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('ks_app_key',?,'快手小店 App Key') ON DUPLICATE KEY UPDATE setting_value=?", [ks_app_key, ks_app_key]);
    }
    if (ks_app_secret) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('ks_app_secret',?,'快手小店 App Secret') ON DUPLICATE KEY UPDATE setting_value=?", [ks_app_secret, ks_app_secret]);
    }
    res.json({ code: 0, msg: "快手小店配置已保存" });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ============ 快手磁力配置 ============
router.get("/ks-ad", auth(), async (req, res) => {
  try {
    const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('ks_ad_app_id','ks_ad_app_secret')");
    const config = {};
    settings.forEach(r => { config[r.setting_key] = r.setting_value; });
    let accounts = [];
    try { const [rows] = await db.query("SELECT advertiser_id, advertiser_name, status, token_expires_at, created_at FROM ks_ad_accounts ORDER BY id"); accounts = rows; } catch(e) {}
    res.json({ code: 0, data: { config, accounts } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.post("/ks-ad", auth(), async (req, res) => {
  try {
    const { ks_ad_app_id, ks_ad_app_secret } = req.body;
    if (ks_ad_app_id) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('ks_ad_app_id',?,'快手磁力 APP ID') ON DUPLICATE KEY UPDATE setting_value=?", [ks_ad_app_id, ks_ad_app_id]);
    }
    if (ks_ad_app_secret) {
      await db.query("INSERT INTO system_settings (setting_key,setting_value,description) VALUES ('ks_ad_app_secret',?,'快手磁力 APP Secret') ON DUPLICATE KEY UPDATE setting_value=?", [ks_ad_app_secret, ks_ad_app_secret]);
    }
    res.json({ code: 0, msg: "快手磁力配置已保存" });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

module.exports = router;

