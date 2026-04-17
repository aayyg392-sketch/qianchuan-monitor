/**
 * 腾讯广告 ADQ 数据看板路由
 * 报表数据拉取、广告组管理、同时段环比
 */
const router = require('express').Router();
const db = require('../db');
const logger = require('../logger');
const auth = require('../middleware/auth');
const adq = require('../services/adq-sync');

// 自动建快照表
async function ensureStatsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS adq_stats_snapshots (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(50) NOT NULL,
      stat_date DATE NOT NULL,
      snap_hour TINYINT NOT NULL COMMENT '快照小时 0-23',
      cost BIGINT DEFAULT 0,
      view_count BIGINT DEFAULT 0,
      valid_click_count BIGINT DEFAULT 0,
      conversions_count INT DEFAULT 0,
      conversions_cost BIGINT DEFAULT 0,
      order_amount BIGINT DEFAULT 0,
      order_roi DECIMAL(10,4) DEFAULT 0,
      ctr DECIMAL(10,4) DEFAULT 0,
      cpc BIGINT DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_acct_date_hour (account_id, stat_date, snap_hour),
      INDEX idx_date (stat_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
let statsTableReady = false;

const REPORT_FIELDS = ['date', 'cost', 'view_count', 'valid_click_count', 'ctr', 'cpc', 'thousand_display_price', 'conversions_count', 'conversions_cost', 'deep_conversions_count', 'order_amount', 'order_roi'];

// 保存快照到DB
async function saveSnapshot(accountId, statDate, hour, data) {
  if (!data) return;
  await db.query(
    `INSERT INTO adq_stats_snapshots (account_id, stat_date, snap_hour, cost, view_count, valid_click_count, conversions_count, conversions_cost, order_amount, order_roi, ctr, cpc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE cost=VALUES(cost), view_count=VALUES(view_count), valid_click_count=VALUES(valid_click_count),
       conversions_count=VALUES(conversions_count), conversions_cost=VALUES(conversions_cost), order_amount=VALUES(order_amount),
       order_roi=VALUES(order_roi), ctr=VALUES(ctr), cpc=VALUES(cpc)`,
    [accountId, statDate, hour,
     data.cost || 0, data.view_count || 0, data.valid_click_count || 0,
     data.conversions_count || 0, data.conversions_cost || 0, data.order_amount || 0,
     data.order_roi || 0, data.ctr || 0, data.cpc || 0]
  );
}

// 概览内存缓存
let overviewCache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

// 从DB快照构建overview（秒开）
async function buildFromDB() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const currentHour = now.getHours();

  const [accountsFull] = await db.query('SELECT id, account_id, account_name, status, token_expires_at, access_token IS NOT NULL AS has_token FROM adq_accounts ORDER BY created_at DESC');

  // 今日最新快照（取最大snap_hour的记录）
  const [todaySnaps] = await db.query(
    `SELECT s.* FROM adq_stats_snapshots s
     INNER JOIN (SELECT account_id, MAX(snap_hour) as max_hour FROM adq_stats_snapshots WHERE stat_date = ? GROUP BY account_id) m
     ON s.account_id = m.account_id AND s.snap_hour = m.max_hour AND s.stat_date = ?`,
    [today, today]
  );
  const todayMap = {};
  (todaySnaps || []).forEach(s => { todayMap[s.account_id] = s; });

  // 昨日同时段快照
  const [yestSnaps] = await db.query('SELECT * FROM adq_stats_snapshots WHERE stat_date = ? AND snap_hour = ?', [yesterday, currentHour]);
  const yestMap = {};
  (yestSnaps || []).forEach(s => { yestMap[s.account_id] = s; });

  function snapToRow(s) {
    if (!s) return null;
    return { cost: s.cost, view_count: s.view_count, valid_click_count: s.valid_click_count, conversions_count: s.conversions_count, conversions_cost: s.conversions_cost, order_amount: s.order_amount, order_roi: parseFloat(s.order_roi), ctr: parseFloat(s.ctr), cpc: s.cpc };
  }

  return accountsFull.map(acct => ({
    id: acct.id, account_id: acct.account_id, account_name: acct.account_name,
    status: acct.status, token_expires_at: acct.token_expires_at, has_token: !!acct.has_token,
    today: snapToRow(todayMap[acct.account_id]),
    yesterday: snapToRow(yestMap[acct.account_id]),
  }));
}

// ============ 实名认证 user_token ============

// 获取认证链接
router.get('/user-token-auth-url', auth(), (req, res) => {
  const cbUrl = encodeURIComponent('https://business.snefe.com/api/adq-dash/user-token-callback');
  res.json({ code: 0, url: `https://ad.qq.com/account-center/single/user-authorize?redirect_uri=${cbUrl}&state=snefe` });
});

// 认证回调（无需auth，腾讯服务器302跳转过来）
router.get('/user-token-callback', async (req, res) => {
  try {
    const { user_token, user_status, expire_time } = req.query;
    if (String(user_status) === '2' && user_token) {
      const decoded = decodeURIComponent(user_token);
      await db.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('adq_user_token', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [decoded, decoded]);
      await db.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('adq_user_token_expires', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [expire_time, expire_time]);
      logger.info('ADQ实名认证成功, user_token已存储, 过期时间: ' + new Date(parseInt(expire_time) * 1000).toISOString());
      return res.redirect('/adq-dashboard?auth=ok');
    }
    logger.warn('ADQ实名认证失败, user_status=' + user_status);
    res.redirect('/adq-dashboard?auth=fail');
  } catch (e) {
    logger.error('ADQ实名认证回调失败', { error: e.message });
    res.redirect('/adq-dashboard?auth=error');
  }
});

// 查询认证状态
router.get('/user-token-status', auth(), async (req, res) => {
  try {
    const ut = await adq.getUserToken();
    if (ut) {
      const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='adq_user_token_expires'");
      const exp = rows?.[0]?.setting_value;
      res.json({ code: 0, valid: true, expires: exp ? new Date(parseInt(exp) * 1000).toISOString() : '' });
    } else {
      res.json({ code: 0, valid: false });
    }
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

/**
 * GET /api/adq-dash/date-overview — 自定义日期范围概览（基于DB快照）
 */
router.get('/date-overview', auth(), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.json({ code: -1, msg: '缺少日期参数' });

    const [accounts] = await db.query('SELECT id, account_id, account_name, status, token_expires_at, access_token IS NOT NULL AS has_token FROM adq_accounts ORDER BY created_at DESC');

    // 选中日期范围：取每天最大snap_hour的记录，按账户汇总
    const [rangeData] = await db.query(`
      SELECT s.account_id, SUM(s.cost) as cost, SUM(s.view_count) as view_count,
        SUM(s.valid_click_count) as valid_click_count, SUM(s.conversions_count) as conversions_count,
        SUM(s.conversions_cost) as conversions_cost, SUM(s.order_amount) as order_amount
      FROM adq_stats_snapshots s
      INNER JOIN (SELECT account_id, stat_date, MAX(snap_hour) as mh FROM adq_stats_snapshots WHERE stat_date BETWEEN ? AND ? GROUP BY account_id, stat_date) m
      ON s.account_id=m.account_id AND s.stat_date=m.stat_date AND s.snap_hour=m.mh
      GROUP BY s.account_id`, [start_date, end_date]);

    // 对比期：相同天数的前一周期
    const days = Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
    const prevEnd = new Date(new Date(start_date).getTime() - 86400000).toISOString().slice(0, 10);
    const prevStart = new Date(new Date(start_date).getTime() - days * 86400000).toISOString().slice(0, 10);

    const [prevData] = await db.query(`
      SELECT s.account_id, SUM(s.cost) as cost, SUM(s.view_count) as view_count,
        SUM(s.valid_click_count) as valid_click_count, SUM(s.conversions_count) as conversions_count,
        SUM(s.conversions_cost) as conversions_cost, SUM(s.order_amount) as order_amount
      FROM adq_stats_snapshots s
      INNER JOIN (SELECT account_id, stat_date, MAX(snap_hour) as mh FROM adq_stats_snapshots WHERE stat_date BETWEEN ? AND ? GROUP BY account_id, stat_date) m
      ON s.account_id=m.account_id AND s.stat_date=m.stat_date AND s.snap_hour=m.mh
      GROUP BY s.account_id`, [prevStart, prevEnd]);

    const rangeMap = {}, prevMap = {};
    rangeData.forEach(r => { rangeMap[r.account_id] = r; });
    prevData.forEach(r => { prevMap[r.account_id] = r; });

    function toRow(d) {
      if (!d) return null;
      const cost = parseFloat(d.cost || 0), views = parseInt(d.view_count || 0), clicks = parseInt(d.valid_click_count || 0);
      const convs = parseInt(d.conversions_count || 0), convCost = parseFloat(d.conversions_cost || 0), orderAmt = parseFloat(d.order_amount || 0);
      return { cost, view_count: views, valid_click_count: clicks, conversions_count: convs, conversions_cost: convCost, order_amount: orderAmt,
        order_roi: cost > 0 ? orderAmt / cost : 0, ctr: views > 0 ? clicks / views : 0, cpc: clicks > 0 ? cost / clicks : 0 };
    }

    const result = accounts.map(a => ({
      id: a.id, account_id: a.account_id, account_name: a.account_name, status: a.status,
      token_expires_at: a.token_expires_at, has_token: !!a.has_token,
      today: toRow(rangeMap[a.account_id]), yesterday: toRow(prevMap[a.account_id]),
    }));

    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('ADQ日期范围查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

router.get('/overview', auth(), async (req, res) => {
  try {
    if (!statsTableReady) { try { await ensureStatsTable(); statsTableReady = true; } catch (e) { logger.error('adq_stats_snapshots init:', e.message); } }

    const forceRefresh = req.query.refresh === '1';

    // 非强制刷新：优先内存缓存 → DB快照（秒开）
    if (!forceRefresh) {
      if (overviewCache.data && Date.now() - overviewCache.ts < CACHE_TTL) {
        return res.json({ code: 0, data: overviewCache.data, cached: true });
      }
      // 尝试从DB读
      try {
        const dbData = await buildFromDB();
        if (dbData.some(a => a.today)) {
          overviewCache = { data: dbData, ts: Date.now() };
          return res.json({ code: 0, data: dbData, cached: true });
        }
      } catch (e) { /* fallthrough to API */ }
    }

    // 强制刷新或无DB数据：从API拉取
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const currentHour = now.getHours();

    const [accountsFull] = await db.query('SELECT id, account_id, account_name, status, token_expires_at, access_token IS NOT NULL AS has_token FROM adq_accounts ORDER BY created_at DESC');

    const activeAccounts = accountsFull.filter(a => a.status === 1 && a.has_token);
    let sharedToken = null;
    if (activeAccounts.length > 0) {
      try { sharedToken = await adq.getValidToken(activeAccounts[0].id); } catch (e) { logger.warn('ADQ获取token失败: ' + e.message); }
    }

    const [yestSnapshots] = await db.query('SELECT * FROM adq_stats_snapshots WHERE stat_date = ? AND snap_hour = ?', [yesterday, currentHour]);
    const yestMap = {};
    (yestSnapshots || []).forEach(s => { yestMap[s.account_id] = s; });

    const results = accountsFull.map(acct => ({
      id: acct.id, account_id: acct.account_id, account_name: acct.account_name,
      status: acct.status, token_expires_at: acct.token_expires_at, has_token: !!acct.has_token,
      today: null, yesterday: null,
    }));

    if (sharedToken) {
      const CONCURRENCY = 10;
      const tasks = activeAccounts.map(acct => async () => {
        const ri = results.findIndex(r => r.id === acct.id);
        try {
          const todayData = await adq.getDailyReports(sharedToken, acct.account_id, {
            level: 'REPORT_LEVEL_ADVERTISER', date_range: { start_date: today, end_date: today }, fields: REPORT_FIELDS,
          });
          const todayRow = todayData?.list?.[0] || null;
          results[ri].today = todayRow;

          const ys = yestMap[acct.account_id];
          if (ys) {
            results[ri].yesterday = { cost: ys.cost, view_count: ys.view_count, valid_click_count: ys.valid_click_count, conversions_count: ys.conversions_count, conversions_cost: ys.conversions_cost, order_amount: ys.order_amount, order_roi: parseFloat(ys.order_roi), ctr: parseFloat(ys.ctr), cpc: ys.cpc };
          }

          if (todayRow) saveSnapshot(acct.account_id, today, currentHour, todayRow).catch(() => {});
        } catch (e) {
          results[ri].error = e.message;
        }
      });
      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        await Promise.all(tasks.slice(i, i + CONCURRENCY).map(fn => fn()));
      }
    }

    overviewCache = { data: results, ts: Date.now() };
    res.json({ code: 0, data: results });
  } catch (e) {
    logger.error('ADQ概览查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-dash/top-materials — 高ROI/CVR素材排行
 */
router.get('/top-materials', auth(), async (req, res) => {
  try {
    const { account_db_id, days = 7, sort_by = 'conversions_count', limit = 20 } = req.query;
    if (!account_db_id) return res.json({ code: -1, msg: '缺少account_db_id' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在或已停用' });

    const token = await adq.getValidToken(account_db_id);
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const data = await adq.getDailyReports(token, rows[0].account_id, {
      level: 'REPORT_LEVEL_ADGROUP',
      date_range: { start_date: startDate, end_date: endDate },
      fields: [
        'adgroup_id', 'adgroup_name', 'cost', 'view_count', 'valid_click_count',
        'ctr', 'cpc', 'conversions_count', 'conversions_cost', 'deep_conversions_count', 'order_amount', 'order_roi',
      ],
      group_by: ['adgroup_id'],
      page_size: 100,
    });

    let list = data?.list || [];
    list.sort((a, b) => (parseFloat(b[sort_by] || 0) - parseFloat(a[sort_by] || 0)));
    list = list.slice(0, parseInt(limit));

    res.json({ code: 0, data: list });
  } catch (e) {
    logger.error('ADQ素材排行查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-dash/account-detail — 单账户广告组明细
 */
router.get('/account-detail', auth(), async (req, res) => {
  try {
    const { account_id, date } = req.query;
    if (!account_id) return res.json({ code: -1, msg: '缺少account_id' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1', [account_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(rows[0].id);
    const today = date || new Date().toISOString().slice(0, 10);
    const fields = ['adgroup_id', 'adgroup_name', 'cost', 'view_count', 'valid_click_count', 'ctr', 'cpc', 'conversions_count', 'conversions_cost', 'order_amount', 'order_roi'];

    // 并发拉报表 + 广告组出价
    const [reportData, adgroupData] = await Promise.all([
      adq.getDailyReports(token, account_id, {
        level: 'REPORT_LEVEL_ADGROUP',
        date_range: { start_date: today, end_date: today },
        fields,
        group_by: ['adgroup_id'],
        page_size: 100,
      }),
      adq.getAdgroups(token, account_id, {
        page_size: 100,
        fields: ['adgroup_id', 'adgroup_name', 'configured_status', 'bid_amount', 'bid_strategy', 'optimization_goal', 'daily_budget'],
      }).catch(() => ({ list: [] })),
    ]);

    // 合并出价信息到报表
    const bidMap = {};
    (adgroupData?.list || []).forEach(ag => { bidMap[ag.adgroup_id] = ag; });

    const list = (reportData?.list || []).map(r => {
      const bid = bidMap[r.adgroup_id] || {};
      return { ...r, bid_amount: bid.bid_amount || 0, bid_strategy: bid.bid_strategy || '', configured_status: bid.configured_status || '', daily_budget: bid.daily_budget || 0 };
    }).sort((a, b) => (b.cost || 0) - (a.cost || 0));

    res.json({ code: 0, data: list });
  } catch (e) {
    logger.error('ADQ账户明细查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

router.get('/daily', auth(), async (req, res) => {
  try {
    const { account_db_id, start_date, end_date, level } = req.query;
    if (!account_db_id) return res.json({ code: -1, msg: '缺少account_db_id' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在或已停用' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.getDailyReports(token, rows[0].account_id, {
      level: level || 'REPORT_LEVEL_ADGROUP',
      date_range: {
        start_date: start_date || new Date().toISOString().slice(0, 10),
        end_date: end_date || new Date().toISOString().slice(0, 10),
      },
    });
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ日报查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

router.get('/hourly', auth(), async (req, res) => {
  try {
    const { account_db_id, date } = req.query;
    if (!account_db_id) return res.json({ code: -1, msg: '缺少account_db_id' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在或已停用' });

    const token = await adq.getValidToken(account_db_id);
    const today = date || new Date().toISOString().slice(0, 10);
    const data = await adq.getHourlyReports(token, rows[0].account_id, {
      date_range: { start_date: today, end_date: today },
    });
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ小时报查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

router.get('/adgroups', auth(), async (req, res) => {
  try {
    const { account_db_id, page, page_size, status } = req.query;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const params = { page: +page || 1, page_size: +page_size || 50 };
    if (status) params.filtering = { configured_status: status };
    const data = await adq.getAdgroups(token, rows[0].account_id, params);
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ广告组查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

router.post('/adgroups/update', auth(), async (req, res) => {
  try {
    const { account_db_id, adgroup_id, ...updateFields } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.updateAdgroup(token, rows[0].account_id, {
      account_id: rows[0].account_id,
      adgroup_id,
      ...updateFields,
    });
    res.json({ code: 0, data, msg: '更新成功' });
  } catch (e) {
    logger.error('ADQ广告组更新失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-dash/adgroup/update-bid — 修改广告出价
 */
router.post('/adgroup/update-bid', auth(), async (req, res) => {
  try {
    const { account_id, adgroup_id, bid_amount } = req.body;
    if (!account_id || !adgroup_id || !bid_amount) return res.json({ code: -1, msg: '参数不完整' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1', [account_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(rows[0].id);
    await adq.updateAdgroup(token, account_id, {
      account_id: parseInt(account_id),
      adgroup_id: parseInt(adgroup_id),
      bid_amount: parseInt(bid_amount),
    });
    res.json({ code: 0, msg: '出价修改成功' });
  } catch (e) {
    logger.error('ADQ修改出价失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-dash/material/delete — 删除素材（动态创意）
 */
router.post('/material/delete', auth(), async (req, res) => {
  try {
    const { account_id, dynamic_creative_id } = req.body;
    if (!account_id || !dynamic_creative_id) return res.json({ code: -1, msg: '参数不完整' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1', [account_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(rows[0].id);
    await adq.adqApiCall(token, 'dynamic_creatives/delete', 'POST', {
      account_id: parseInt(account_id),
      dynamic_creative_id: parseInt(dynamic_creative_id),
    }, account_id);
    res.json({ code: 0, msg: '素材删除成功' });
  } catch (e) {
    logger.error('ADQ删除素材失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-dash/adgroup-materials — 广告下素材消耗/转化/ROI明细
 */
router.get('/adgroup-materials', auth(), async (req, res) => {
  try {
    const { account_id, adgroup_id } = req.query;
    if (!account_id || !adgroup_id) return res.json({ code: -1, msg: '参数不完整' });

    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1', [account_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(rows[0].id);
    const today = new Date().toISOString().slice(0, 10);

    // 1. 获取该账户所有动态创意，筛选出属于该广告组的
    const creatives = await adq.getDynamicCreatives(token, account_id, {
      page_size: 100,
      fields: ['dynamic_creative_id', 'adgroup_id', 'creative_name', 'creative_elements'],
    });
    const creativeList = creatives?.list || [];
    const targetIds = new Set();
    const nameMap = {};
    creativeList.forEach(c => {
      nameMap[c.dynamic_creative_id] = c.creative_name || '';
      if (String(c.adgroup_id) === String(adgroup_id)) {
        targetIds.add(String(c.dynamic_creative_id));
      }
    });

    if (!targetIds.size) return res.json({ code: 0, data: [] });

    // 2. 获取创意级别今日报表
    const reportData = await adq.getDailyReports(token, account_id, {
      level: 'REPORT_LEVEL_DYNAMIC_CREATIVE',
      date_range: { start_date: today, end_date: today },
      fields: ['dynamic_creative_id', 'cost', 'view_count', 'valid_click_count', 'conversions_count', 'conversions_cost', 'order_amount', 'order_roi'],
      group_by: ['dynamic_creative_id'],
      page_size: 200,
    });

    // 3. 过滤并合并名称
    const list = (reportData?.list || [])
      .filter(r => targetIds.has(String(r.dynamic_creative_id)))
      .map(r => ({ ...r, creative_name: nameMap[r.dynamic_creative_id] || '' }))
      .sort((a, b) => (parseFloat(b.cost) || 0) - (parseFloat(a.cost) || 0));

    res.json({ code: 0, data: list });
  } catch (e) {
    logger.error('ADQ广告素材查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
