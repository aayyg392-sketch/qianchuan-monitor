const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');
const logger = require('../logger');
const axios = require('axios');
const commentSync = require('../services/comment-sync');

// ============ 风控常量 ============
const RISK_LIMITS = {
  perMinute: 5,
  perHour: 80,
  perDay: 200,
  intervalMin: 10,  // seconds
  intervalMax: 60,  // seconds
};

// ============ 自动建表 ============
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS ops_douyin_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_name VARCHAR(100) NOT NULL,
      douyin_uid VARCHAR(50),
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      account_group VARCHAR(50) DEFAULT 'default',
      status ENUM('active','inactive','banned','expired') DEFAULT 'active',
      daily_comment_count INT DEFAULT 0,
      hourly_comment_count INT DEFAULT 0,
      last_comment_at DATETIME,
      last_check_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS ops_comment_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_name VARCHAR(200) NOT NULL,
      task_type ENUM('batch_comment','ai_reply') DEFAULT 'batch_comment',
      video_ids JSON,
      account_ids JSON,
      script_group_id INT,
      interval_min INT DEFAULT 10,
      interval_max INT DEFAULT 60,
      max_comments_per_video INT DEFAULT 50,
      status ENUM('pending','running','paused','completed','failed') DEFAULT 'pending',
      progress_current INT DEFAULT 0,
      progress_total INT DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS ops_comment_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT,
      account_id INT,
      video_id VARCHAR(50),
      video_title VARCHAR(500),
      comment_type ENUM('batch','ai_reply','manual') DEFAULT 'batch',
      original_comment TEXT,
      original_comment_id VARCHAR(50),
      douyin_nickname VARCHAR(200),
      douyin_id VARCHAR(100),
      reply_content TEXT,
      ai_category ENUM('positive','inquiry','negative','question','other') DEFAULT 'other',
      status ENUM('pending','success','failed','filtered') DEFAULT 'pending',
      fail_reason VARCHAR(500),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_task (task_id),
      INDEX idx_account (account_id),
      INDEX idx_created (created_at),
      INDEX idx_type_status (comment_type, status)
    )`);

    // Add new columns if not exist
    await db.query(`ALTER TABLE ops_comment_logs ADD COLUMN douyin_nickname VARCHAR(200) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE ops_comment_logs ADD COLUMN douyin_id VARCHAR(100) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE ops_comment_logs ADD COLUMN publisher_id VARCHAR(50) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE ops_comment_logs ADD COLUMN publisher_name VARCHAR(200) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE ops_comment_logs ADD COLUMN publisher_douyin_id VARCHAR(100) DEFAULT NULL`).catch(() => {});

    await db.query(`CREATE TABLE IF NOT EXISTS ops_scripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(100) NOT NULL,
      script_type ENUM('comment','reply_positive','reply_inquiry','reply_negative','reply_question') DEFAULT 'comment',
      content TEXT NOT NULL,
      variables JSON,
      weight INT DEFAULT 1,
      enabled TINYINT DEFAULT 1,
      use_count INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_group_type (group_name, script_type)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS ops_blocked_words (
      id INT AUTO_INCREMENT PRIMARY KEY,
      word VARCHAR(100) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS ops_ai_reply_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      enabled TINYINT DEFAULT 0,
      pull_interval_minutes INT DEFAULT 5,
      auto_reply_categories JSON,
      reply_style VARCHAR(50) DEFAULT 'friendly',
      max_reply_length INT DEFAULT 100,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS ops_product_knowledge (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brand_name VARCHAR(200) DEFAULT '',
      brand_slogan VARCHAR(500) DEFAULT '',
      target_audience TEXT,
      audience_pain_points TEXT,
      audience_preferences TEXT,
      products JSON,
      reply_personality TEXT,
      reply_rules TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    logger.info('[Operations] 表结构就绪');
  } catch (e) {
    logger.error('[Operations] 建表失败', { error: e.message });
  }
})();

// ============ Dashboard / Overview ============

// 今日概览
router.get('/overview', auth(), async (req, res) => {
  try {
    // 总拉取评论数
    const [[totalRow]] = await db.query(`SELECT COUNT(*) AS total FROM ops_comment_logs`);

    // 已回复数
    const [[replyRow]] = await db.query(`SELECT COUNT(*) AS total FROM ops_comment_logs WHERE status='success'`);

    // 待处理数
    const [[pendingRow]] = await db.query(`SELECT COUNT(*) AS total FROM ops_comment_logs WHERE status='pending'`);

    // 成功率
    const total = parseInt(totalRow.total) || 0;
    const successCount = parseInt(replyRow.total) || 0;
    const successRate = total > 0 ? Math.round((successCount / total) * 10000) / 100 : 0;

    // 已隐藏差评数
    const [[hiddenRow]] = await db.query(`SELECT COUNT(*) AS total FROM ops_comment_logs WHERE status='filtered'`);

    // 活跃营销账号数
    const [[activeRow]] = await db.query(`SELECT COUNT(*) AS total FROM marketing_accounts WHERE status=1`);

    // AI分类统计
    const [catStats] = await db.query(`SELECT ai_category, COUNT(*) as cnt FROM ops_comment_logs GROUP BY ai_category`);
    const categories = {};
    (catStats || []).forEach(r => { categories[r.ai_category] = parseInt(r.cnt); });

    res.json({
      code: 0,
      data: {
        today_comments: total,
        today_replies: successCount,
        success_rate: successRate,
        pending_comments: parseInt(pendingRow.total) || 0,
        hidden_comments: parseInt(hiddenRow.total) || 0,
        active_accounts: parseInt(activeRow.total) || 0,
        categories,
      },
    });
  } catch (e) {
    logger.error('[Operations] overview error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 待处理告警
router.get('/pending-alerts', auth(), async (req, res) => {
  try {
    // 过期/即将过期账号
    const [expiredAccounts] = await db.query(
      `SELECT id, account_name, token_expires_at, status FROM ops_douyin_accounts
       WHERE status='active' AND token_expires_at IS NOT NULL AND token_expires_at < DATE_ADD(NOW(), INTERVAL 1 DAY)
       ORDER BY token_expires_at ASC`
    );

    // 风控预警账号
    const [riskAccounts] = await db.query(
      `SELECT id, account_name, daily_comment_count, hourly_comment_count FROM ops_douyin_accounts
       WHERE status='active' AND (daily_comment_count >= ? OR hourly_comment_count >= ?)`,
      [Math.floor(RISK_LIMITS.perDay * 0.8), Math.floor(RISK_LIMITS.perHour * 0.8)]
    );

    // 待回复数量
    const [[pendingRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM ops_comment_logs WHERE status='pending' AND comment_type='ai_reply'`
    );

    res.json({
      code: 0,
      data: {
        expiredAccounts,
        riskAccounts,
        pendingReplies: parseInt(pendingRow.total) || 0,
      },
    });
  } catch (e) {
    logger.error('[Operations] pending-alerts error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Account Management ============

// 账号列表
router.get('/accounts', auth(), async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const [rows] = await db.query(
      `SELECT a.*,
         (SELECT COUNT(*) FROM ops_comment_logs l
          WHERE l.account_id = a.id AND l.created_at >= ? AND l.status='success') AS today_success_count
       FROM ops_douyin_accounts a ORDER BY a.created_at DESC`,
      [`${today} 00:00:00`]
    );
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    logger.error('[Operations] accounts list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 添加账号
router.post('/accounts', auth(), async (req, res) => {
  try {
    const { account_name, douyin_uid, access_token, refresh_token, token_expires_at, account_group } = req.body;
    if (!account_name) return res.json({ code: 400, msg: 'account_name is required' });

    const [result] = await db.query(
      `INSERT INTO ops_douyin_accounts (account_name, douyin_uid, access_token, refresh_token, token_expires_at, account_group)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [account_name, douyin_uid || null, access_token || null, refresh_token || null, token_expires_at || null, account_group || 'default']
    );
    res.json({ code: 0, data: { id: result.insertId } });
  } catch (e) {
    logger.error('[Operations] add account error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 更新账号
router.put('/accounts/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { account_name, douyin_uid, access_token, refresh_token, token_expires_at, account_group, avatar_url } = req.body;

    const fields = [];
    const values = [];
    if (account_name !== undefined) { fields.push('account_name=?'); values.push(account_name); }
    if (douyin_uid !== undefined) { fields.push('douyin_uid=?'); values.push(douyin_uid); }
    if (access_token !== undefined) { fields.push('access_token=?'); values.push(access_token); }
    if (refresh_token !== undefined) { fields.push('refresh_token=?'); values.push(refresh_token); }
    if (token_expires_at !== undefined) { fields.push('token_expires_at=?'); values.push(token_expires_at); }
    if (account_group !== undefined) { fields.push('account_group=?'); values.push(account_group); }
    if (avatar_url !== undefined) { fields.push('avatar_url=?'); values.push(avatar_url); }

    if (fields.length === 0) return res.json({ code: 400, msg: 'No fields to update' });

    values.push(id);
    await db.query(`UPDATE ops_douyin_accounts SET ${fields.join(', ')} WHERE id=?`, values);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) {
    logger.error('[Operations] update account error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 切换账号状态
router.put('/accounts/:id/status', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['active', 'inactive', 'banned', 'expired'];
    if (!allowed.includes(status)) return res.json({ code: 400, msg: `status must be one of: ${allowed.join(', ')}` });

    await db.query(`UPDATE ops_douyin_accounts SET status=? WHERE id=?`, [status, id]);
    res.json({ code: 0, data: { id: Number(id), status } });
  } catch (e) {
    logger.error('[Operations] toggle account status error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 删除账号
router.delete('/accounts/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM ops_douyin_accounts WHERE id=?`, [id]);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) {
    logger.error('[Operations] delete account error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Comment Tasks ============

// 任务列表
router.get('/tasks', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (req.query.status) {
      conditions.push('status=?');
      params.push(req.query.status);
    }
    if (req.query.task_type) {
      conditions.push('task_type=?');
      params.push(req.query.task_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ops_comment_tasks ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT * FROM ops_comment_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ code: 0, data: { list: rows, total, page, pageSize } });
  } catch (e) {
    logger.error('[Operations] tasks list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 创建任务
router.post('/tasks', auth(), async (req, res) => {
  try {
    const {
      task_name, task_type, video_ids, account_ids, script_group_id,
      interval_min, interval_max, max_comments_per_video,
    } = req.body;

    if (!task_name) return res.json({ code: 400, msg: 'task_name is required' });

    // 风控校验
    const minInterval = interval_min || RISK_LIMITS.intervalMin;
    const maxInterval = interval_max || RISK_LIMITS.intervalMax;
    if (minInterval < RISK_LIMITS.intervalMin) {
      return res.json({ code: 400, msg: `interval_min cannot be less than ${RISK_LIMITS.intervalMin}s` });
    }
    if (maxInterval < minInterval) {
      return res.json({ code: 400, msg: 'interval_max must be >= interval_min' });
    }

    const videoArr = Array.isArray(video_ids) ? video_ids : [];
    const accountArr = Array.isArray(account_ids) ? account_ids : [];
    const maxPerVideo = max_comments_per_video || 50;
    const progressTotal = videoArr.length * maxPerVideo;

    const [result] = await db.query(
      `INSERT INTO ops_comment_tasks
       (task_name, task_type, video_ids, account_ids, script_group_id, interval_min, interval_max, max_comments_per_video, progress_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task_name,
        task_type || 'batch_comment',
        JSON.stringify(videoArr),
        JSON.stringify(accountArr),
        script_group_id || null,
        minInterval,
        maxInterval,
        maxPerVideo,
        progressTotal,
      ]
    );

    res.json({ code: 0, data: { id: result.insertId } });
  } catch (e) {
    logger.error('[Operations] create task error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 更新任务状态
router.put('/tasks/:id/status', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending', 'running', 'paused', 'completed', 'failed'];
    if (!allowed.includes(status)) return res.json({ code: 400, msg: `status must be one of: ${allowed.join(', ')}` });

    const extras = {};
    if (status === 'running') extras.started_at = dayjs().format('YYYY-MM-DD HH:mm:ss');
    if (status === 'completed' || status === 'failed') extras.completed_at = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const setClauses = ['status=?'];
    const values = [status];
    for (const [k, v] of Object.entries(extras)) {
      setClauses.push(`${k}=?`);
      values.push(v);
    }
    values.push(id);

    await db.query(`UPDATE ops_comment_tasks SET ${setClauses.join(', ')} WHERE id=?`, values);
    res.json({ code: 0, data: { id: Number(id), status } });
  } catch (e) {
    logger.error('[Operations] update task status error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 任务详情
router.get('/tasks/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const [[task]] = await db.query(`SELECT * FROM ops_comment_tasks WHERE id=?`, [id]);
    if (!task) return res.json({ code: 404, msg: 'Task not found' });

    const [recentLogs] = await db.query(
      `SELECT l.*, a.account_name
       FROM ops_comment_logs l
       LEFT JOIN ops_douyin_accounts a ON a.id = l.account_id
       WHERE l.task_id=? ORDER BY l.created_at DESC LIMIT 50`,
      [id]
    );

    res.json({ code: 0, data: { task, recentLogs } });
  } catch (e) {
    logger.error('[Operations] task detail error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 删除任务
router.delete('/tasks/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const [[task]] = await db.query(`SELECT status FROM ops_comment_tasks WHERE id=?`, [id]);
    if (!task) return res.json({ code: 404, msg: 'Task not found' });
    if (task.status === 'running') return res.json({ code: 400, msg: 'Cannot delete a running task' });

    await db.query(`DELETE FROM ops_comment_logs WHERE task_id=?`, [id]);
    await db.query(`DELETE FROM ops_comment_tasks WHERE id=?`, [id]);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) {
    logger.error('[Operations] delete task error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ AI Reply ============

// 获取AI回复配置
router.get('/ai-reply/config', auth(), async (req, res) => {
  try {
    let [[config]] = await db.query(`SELECT * FROM ops_ai_reply_config ORDER BY id LIMIT 1`);
    if (!config) {
      await db.query(`INSERT INTO ops_ai_reply_config (enabled, auto_reply_categories) VALUES (0, '["positive","inquiry","question"]')`);
      [[config]] = await db.query(`SELECT * FROM ops_ai_reply_config ORDER BY id LIMIT 1`);
    }
    // Get last pull time from most recent comment log
    const [[lastPull]] = await db.query(`SELECT created_at FROM ops_comment_logs ORDER BY created_at DESC LIMIT 1`);
    config.last_pull_at = lastPull ? lastPull.created_at : null;
    res.json({ code: 0, data: config });
  } catch (e) {
    logger.error('[Operations] ai-reply config get error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 更新AI回复配置
router.put('/ai-reply/config', auth(), async (req, res) => {
  try {
    const { enabled, pull_interval_minutes, auto_reply_categories, reply_style, max_reply_length } = req.body;

    let [[config]] = await db.query(`SELECT id FROM ops_ai_reply_config ORDER BY id LIMIT 1`);
    if (!config) {
      await db.query(`INSERT INTO ops_ai_reply_config (enabled, auto_reply_categories) VALUES (0, '["positive","inquiry","question"]')`);
      [[config]] = await db.query(`SELECT id FROM ops_ai_reply_config ORDER BY id LIMIT 1`);
    }

    const fields = [];
    const values = [];
    if (enabled !== undefined) { fields.push('enabled=?'); values.push(enabled ? 1 : 0); }
    if (pull_interval_minutes !== undefined) { fields.push('pull_interval_minutes=?'); values.push(pull_interval_minutes); }
    if (auto_reply_categories !== undefined) { fields.push('auto_reply_categories=?'); values.push(JSON.stringify(auto_reply_categories)); }
    if (reply_style !== undefined) { fields.push('reply_style=?'); values.push(reply_style); }
    if (max_reply_length !== undefined) { fields.push('max_reply_length=?'); values.push(max_reply_length); }

    if (fields.length > 0) {
      values.push(config.id);
      await db.query(`UPDATE ops_ai_reply_config SET ${fields.join(', ')} WHERE id=?`, values);
    }

    const [[updated]] = await db.query(`SELECT * FROM ops_ai_reply_config WHERE id=?`, [config.id]);
    res.json({ code: 0, data: updated });
  } catch (e) {
    logger.error('[Operations] ai-reply config update error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// AI回复日志
router.get('/ai-reply/logs', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = ["comment_type='ai_reply'"];
    const params = [];

    if (req.query.ai_category) {
      conditions.push('ai_category=?');
      params.push(req.query.ai_category);
    }
    if (req.query.status) {
      conditions.push('status=?');
      params.push(req.query.status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ops_comment_logs ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT l.*, a.account_name
       FROM ops_comment_logs l
       LEFT JOIN ops_douyin_accounts a ON a.id = l.account_id
       ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ code: 0, data: { list: rows, total, page, pageSize } });
  } catch (e) {
    logger.error('[Operations] ai-reply logs error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Comment Logs ============

router.get('/logs', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size || req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (req.query.comment_type) {
      conditions.push('l.comment_type=?');
      params.push(req.query.comment_type);
    }
    if (req.query.status) {
      conditions.push('l.status=?');
      params.push(req.query.status);
    }
    if (req.query.ai_category) {
      conditions.push('l.ai_category=?');
      params.push(req.query.ai_category);
    }
    if (req.query.keyword) {
      conditions.push('(l.original_comment LIKE ? OR l.video_title LIKE ?)');
      const kw = `%${req.query.keyword}%`;
      params.push(kw, kw);
    }
    if (req.query.account_id) {
      conditions.push('l.account_id=?');
      params.push(req.query.account_id);
    }
    if (req.query.start_date) {
      conditions.push('l.created_at >= ?');
      params.push(`${req.query.start_date} 00:00:00`);
    }
    if (req.query.end_date) {
      conditions.push('l.created_at <= ?');
      params.push(`${req.query.end_date} 23:59:59`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ops_comment_logs l ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT l.*, a.account_name
       FROM ops_comment_logs l
       LEFT JOIN ops_douyin_accounts a ON a.id = l.account_id
       ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ code: 0, data: { list: rows, total, page, pageSize } });
  } catch (e) {
    logger.error('[Operations] logs error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Scripts / 话术库 ============

// 话术列表
router.get('/scripts', auth(), async (req, res) => {
  try {
    const conditions = [];
    const params = [];

    if (req.query.group_name) {
      conditions.push('group_name=?');
      params.push(req.query.group_name);
    }
    if (req.query.script_type) {
      conditions.push('script_type=?');
      params.push(req.query.script_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT * FROM ops_scripts ${where} ORDER BY group_name, script_type, weight DESC, id DESC`,
      params
    );

    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    logger.error('[Operations] scripts list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 话术分组列表
router.get('/scripts/groups', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT group_name, COUNT(*) AS script_count
       FROM ops_scripts GROUP BY group_name ORDER BY group_name`
    );
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    logger.error('[Operations] scripts groups error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 创建话术
router.post('/scripts', auth(), async (req, res) => {
  try {
    const { group_name, script_type, content, variables, weight, enabled } = req.body;
    if (!group_name || !content) return res.json({ code: 400, msg: 'group_name and content are required' });

    const [result] = await db.query(
      `INSERT INTO ops_scripts (group_name, script_type, content, variables, weight, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        group_name,
        script_type || 'comment',
        content,
        variables ? JSON.stringify(variables) : null,
        weight || 1,
        enabled !== undefined ? (enabled ? 1 : 0) : 1,
      ]
    );

    res.json({ code: 0, data: { id: result.insertId } });
  } catch (e) {
    logger.error('[Operations] create script error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 更新话术
router.put('/scripts/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { group_name, script_type, content, variables, weight, enabled } = req.body;

    const fields = [];
    const values = [];
    if (group_name !== undefined) { fields.push('group_name=?'); values.push(group_name); }
    if (script_type !== undefined) { fields.push('script_type=?'); values.push(script_type); }
    if (content !== undefined) { fields.push('content=?'); values.push(content); }
    if (variables !== undefined) { fields.push('variables=?'); values.push(JSON.stringify(variables)); }
    if (weight !== undefined) { fields.push('weight=?'); values.push(weight); }
    if (enabled !== undefined) { fields.push('enabled=?'); values.push(enabled ? 1 : 0); }

    if (fields.length === 0) return res.json({ code: 400, msg: 'No fields to update' });

    values.push(id);
    await db.query(`UPDATE ops_scripts SET ${fields.join(', ')} WHERE id=?`, values);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) {
    logger.error('[Operations] update script error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 删除话术
router.delete('/scripts/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM ops_scripts WHERE id=?`, [id]);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) {
    logger.error('[Operations] delete script error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 屏蔽词列表
router.get('/blocked-words', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM ops_blocked_words ORDER BY created_at DESC`);
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    logger.error('[Operations] blocked-words list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 添加屏蔽词
router.post('/blocked-words', auth(), async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || !word.trim()) return res.json({ code: 400, msg: 'word is required' });

    const [result] = await db.query(
      `INSERT IGNORE INTO ops_blocked_words (word) VALUES (?)`,
      [word.trim()]
    );
    res.json({ code: 0, data: { id: result.insertId } });
  } catch (e) {
    logger.error('[Operations] add blocked-word error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 删除屏蔽词
router.delete('/blocked-words/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM ops_blocked_words WHERE id=?`, [id]);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) {
    logger.error('[Operations] delete blocked-word error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Statistics ============

// 每日统计
router.get('/stats/daily', auth(), async (req, res) => {
  try {
    const startDate = req.query.start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDate = req.query.end_date || dayjs().format('YYYY-MM-DD');

    const [rows] = await db.query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS total,
         SUM(CASE WHEN comment_type='batch' THEN 1 ELSE 0 END) AS batch_count,
         SUM(CASE WHEN comment_type IN ('ai_reply','manual') THEN 1 ELSE 0 END) AS reply_count,
         SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN status='filtered' THEN 1 ELSE 0 END) AS filtered_count
       FROM ops_comment_logs
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    );

    const list = rows.map(r => ({
      ...r,
      total: parseInt(r.total) || 0,
      batch_count: parseInt(r.batch_count) || 0,
      reply_count: parseInt(r.reply_count) || 0,
      success_count: parseInt(r.success_count) || 0,
      failed_count: parseInt(r.failed_count) || 0,
      filtered_count: parseInt(r.filtered_count) || 0,
      success_rate: r.total > 0 ? Math.round((parseInt(r.success_count) / parseInt(r.total)) * 10000) / 100 : 0,
    }));

    res.json({ code: 0, data: { list } });
  } catch (e) {
    logger.error('[Operations] stats/daily error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 按账号统计
router.get('/stats/by-account', auth(), async (req, res) => {
  try {
    const startDate = req.query.start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDate = req.query.end_date || dayjs().format('YYYY-MM-DD');

    const [rows] = await db.query(
      `SELECT
         l.account_id,
         a.account_name,
         COUNT(*) AS total,
         SUM(CASE WHEN l.status='success' THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN l.status='failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN l.comment_type='batch' THEN 1 ELSE 0 END) AS batch_count,
         SUM(CASE WHEN l.comment_type IN ('ai_reply','manual') THEN 1 ELSE 0 END) AS reply_count
       FROM ops_comment_logs l
       LEFT JOIN ops_douyin_accounts a ON a.id = l.account_id
       WHERE l.created_at >= ? AND l.created_at <= ?
       GROUP BY l.account_id
       ORDER BY total DESC`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    );

    const list = rows.map(r => ({
      ...r,
      total: parseInt(r.total) || 0,
      success_count: parseInt(r.success_count) || 0,
      failed_count: parseInt(r.failed_count) || 0,
      batch_count: parseInt(r.batch_count) || 0,
      reply_count: parseInt(r.reply_count) || 0,
      success_rate: r.total > 0 ? Math.round((parseInt(r.success_count) / parseInt(r.total)) * 10000) / 100 : 0,
    }));

    res.json({ code: 0, data: { list } });
  } catch (e) {
    logger.error('[Operations] stats/by-account error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 按视频统计
router.get('/stats/by-video', auth(), async (req, res) => {
  try {
    const startDate = req.query.start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDate = req.query.end_date || dayjs().format('YYYY-MM-DD');

    const [rows] = await db.query(
      `SELECT
         l.video_id,
         MAX(l.video_title) AS video_title,
         COUNT(*) AS total,
         SUM(CASE WHEN l.status='success' THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN l.status='failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN l.comment_type='batch' THEN 1 ELSE 0 END) AS batch_count,
         SUM(CASE WHEN l.comment_type IN ('ai_reply','manual') THEN 1 ELSE 0 END) AS reply_count
       FROM ops_comment_logs l
       WHERE l.created_at >= ? AND l.created_at <= ?
       GROUP BY l.video_id
       ORDER BY total DESC`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    );

    const list = rows.map(r => ({
      ...r,
      total: parseInt(r.total) || 0,
      success_count: parseInt(r.success_count) || 0,
      failed_count: parseInt(r.failed_count) || 0,
      batch_count: parseInt(r.batch_count) || 0,
      reply_count: parseInt(r.reply_count) || 0,
      success_rate: r.total > 0 ? Math.round((parseInt(r.success_count) / parseInt(r.total)) * 10000) / 100 : 0,
    }));

    res.json({ code: 0, data: { list } });
  } catch (e) {
    logger.error('[Operations] stats/by-video error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Account-level Stats (by publisher/advertiser) ============
router.get('/account-stats', auth(), async (req, res) => {
  try {
    // 按发布抖音号维度统计（publisher_douyin_id 如 snefe66）
    const [rows] = await db.query(`
      SELECT
        COALESCE(NULLIF(l.publisher_douyin_id,''), l.publisher_id) AS aweme_id,
        COALESCE(NULLIF(l.publisher_name,''), l.publisher_id) AS aweme_name,
        COUNT(*) AS total_comments,
        SUM(CASE WHEN l.status='success' THEN 1 ELSE 0 END) AS replied_count,
        SUM(CASE WHEN l.status='filtered' THEN 1 ELSE 0 END) AS hidden_count,
        SUM(CASE WHEN l.status='pending' THEN 1 ELSE 0 END) AS pending_count
      FROM ops_comment_logs l
      WHERE l.publisher_id IS NOT NULL AND l.publisher_id != ''
      GROUP BY aweme_id, aweme_name
      ORDER BY total_comments DESC
      LIMIT 20
    `);
    res.json({ code: 0, data: rows || [] });
  } catch (e) {
    logger.error('[Operations] account-stats error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Route Aliases (frontend compatibility) ============

// Frontend uses /comment-tasks — duplicate handler logic from /tasks
router.get('/comment-tasks', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const conditions = []; const params = [];
    if (req.query.status) { conditions.push('status=?'); params.push(req.query.status); }
    if (req.query.task_type) { conditions.push('task_type=?'); params.push(req.query.task_type); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM ops_comment_tasks ${where}`, params);
    const [rows] = await db.query(`SELECT * FROM ops_comment_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    res.json({ code: 0, data: { list: rows, total, page, pageSize } });
  } catch (e) { logger.error('[Operations] comment-tasks list error', { error: e.message }); res.json({ code: 500, msg: e.message }); }
});
router.post('/comment-tasks', auth(), async (req, res) => {
  try {
    const { task_name, task_type, video_ids, account_ids, script_group_id, interval_min, interval_max, max_comments_per_video } = req.body;
    if (!task_name) return res.json({ code: 400, msg: 'task_name is required' });
    const minInterval = interval_min || RISK_LIMITS.intervalMin;
    const maxInterval = interval_max || RISK_LIMITS.intervalMax;
    if (minInterval < RISK_LIMITS.intervalMin) return res.json({ code: 400, msg: `interval_min cannot be less than ${RISK_LIMITS.intervalMin}s` });
    if (maxInterval < minInterval) return res.json({ code: 400, msg: 'interval_max must be >= interval_min' });
    const videoArr = Array.isArray(video_ids) ? video_ids : [];
    const accountArr = Array.isArray(account_ids) ? account_ids : [];
    const maxPerVideo = max_comments_per_video || 50;
    const progressTotal = videoArr.length * maxPerVideo;
    const [result] = await db.query(
      `INSERT INTO ops_comment_tasks (task_name, task_type, video_ids, account_ids, script_group_id, interval_min, interval_max, max_comments_per_video, progress_total) VALUES (?,?,?,?,?,?,?,?,?)`,
      [task_name, task_type || 'batch_comment', JSON.stringify(videoArr), JSON.stringify(accountArr), script_group_id || null, minInterval, maxInterval, maxPerVideo, progressTotal]
    );
    res.json({ code: 0, data: { id: result.insertId } });
  } catch (e) { logger.error('[Operations] comment-tasks create error', { error: e.message }); res.json({ code: 500, msg: e.message }); }
});
router.post('/comment-tasks/:id/start', auth(), async (req, res) => {
  req.body = { status: 'running' };
  try {
    const { id } = req.params;
    const extras = { started_at: dayjs().format('YYYY-MM-DD HH:mm:ss') };
    await db.query(`UPDATE ops_comment_tasks SET status='running', started_at=? WHERE id=?`, [extras.started_at, id]);
    res.json({ code: 0, data: { id: Number(id), status: 'running' } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.post('/comment-tasks/:id/stop', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`UPDATE ops_comment_tasks SET status='paused' WHERE id=?`, [id]);
    res.json({ code: 0, data: { id: Number(id), status: 'paused' } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.delete('/comment-tasks/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const [[task]] = await db.query(`SELECT status FROM ops_comment_tasks WHERE id=?`, [id]);
    if (!task) return res.json({ code: 404, msg: 'Task not found' });
    if (task.status === 'running') return res.json({ code: 400, msg: 'Cannot delete a running task' });
    await db.query(`DELETE FROM ops_comment_logs WHERE task_id=?`, [id]);
    await db.query(`DELETE FROM ops_comment_tasks WHERE id=?`, [id]);
    res.json({ code: 0, data: { id: Number(id) } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// Account groups endpoint
router.get('/accounts/groups', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT DISTINCT account_group FROM ops_douyin_accounts WHERE account_group IS NOT NULL ORDER BY account_group`);
    res.json({ code: 0, data: { list: rows.map(r => r.account_group) } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ============ Comment Sync Integration ============

// 手动触发评论拉取
router.post('/comments/pull', auth(), async (req, res) => {
  try {
    // 遍历所有营销子账号拉取评论
    const [allAccounts] = await db.query('SELECT advertiser_id, access_token FROM marketing_accounts WHERE status=1');
    if (!allAccounts || allAccounts.length === 0) {
      return res.json({ code: 400, msg: '未找到有效的营销账户Token，请先在设置中配置巨量营销' });
    }
    let totalCount = 0;
    for (const acc of allAccounts) {
      try {
        const count = await commentSync.pullComments(acc.advertiser_id, acc.access_token);
        totalCount += count;
      } catch (e) { logger.warn(`[Operations] 子账号${acc.advertiser_id}拉取失败`, { error: e.message }); }
    }
    res.json({ code: 0, data: { new_comments: totalCount, accounts: allAccounts.length }, msg: `${allAccounts.length}个账号共拉取 ${totalCount} 条新评论` });
  } catch (e) {
    logger.error('[Operations] manual pull error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 手动触发AI自动回复
router.post('/ai-reply/run', auth(), async (req, res) => {
  try {
    await commentSync.runAutoReply();
    res.json({ code: 0, msg: 'AI自动回复执行完成' });
  } catch (e) {
    logger.error('[Operations] manual ai-reply error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 评论操作（置顶/隐藏）
router.post('/comments/:commentId/operate', auth(), async (req, res) => {
  try {
    const { commentId } = req.params;
    let { action } = req.body;
    // 兼容前端传入的小写action
    const actionMap = { pin: 'TOP', hide: 'HIDE', top: 'TOP', cancel_pin: 'CANCEL_TOP', cancel_hide: 'CANCEL_HIDE' };
    action = actionMap[action] || action?.toUpperCase();
    if (!['TOP', 'HIDE', 'CANCEL_TOP', 'CANCEL_HIDE'].includes(action)) {
      return res.json({ code: 400, msg: '无效操作类型' });
    }
    // 查找真实评论ID
    let realCommentId = commentId;
    const [[log]] = await db.query('SELECT original_comment_id FROM ops_comment_logs WHERE id=? OR original_comment_id=?', [commentId, commentId]);
    if (log) realCommentId = log.original_comment_id;

    const tokenInfo = await commentSync.getAccessToken();
    if (!tokenInfo?.accessToken) return res.json({ code: 400, msg: '未找到有效Token' });
    const result = await commentSync.operateComment(tokenInfo.advertiserId, tokenInfo.accessToken, realCommentId, action);
    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('[Operations] comment operate error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 手动回复评论
router.post('/comments/:commentId/reply', auth(), async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content, reply_content, ai } = req.body;

    // AI生成模式：根据评论内容生成回复但不发送
    if (ai) {
      const [[log]] = await db.query('SELECT original_comment, ai_category FROM ops_comment_logs WHERE id=? OR original_comment_id=?', [commentId, commentId]);
      if (!log) return res.json({ code: 404, msg: '评论未找到' });
      const category = log.ai_category || 'other';
      const reply = await commentSync.generateReply(log.original_comment, category, 'friendly');
      return res.json({ code: 0, data: { reply_content: reply } });
    }

    const replyContent = content || reply_content;
    if (!replyContent) return res.json({ code: 400, msg: '回复内容不能为空' });

    // Check banned words
    const banned = await commentSync.checkBannedWords(replyContent);
    if (banned.hasBanned) return res.json({ code: 400, msg: `包含屏蔽词: ${banned.words.join(', ')}` });

    // 查找真实的original_comment_id
    let realCommentId = commentId;
    const [[log]] = await db.query('SELECT original_comment_id FROM ops_comment_logs WHERE id=? OR original_comment_id=?', [commentId, commentId]);
    if (log) realCommentId = log.original_comment_id;

    const tokenInfo = await commentSync.getAccessToken();
    if (!tokenInfo?.accessToken) return res.json({ code: 400, msg: '未找到有效Token' });

    const result = await commentSync.replyToComment(tokenInfo.advertiserId, tokenInfo.accessToken, realCommentId, replyContent);

    // Update existing log
    await db.query(
      `UPDATE ops_comment_logs SET reply_content=?, status='success', comment_type='manual' WHERE id=? OR original_comment_id=?`,
      [replyContent, commentId, commentId]
    );

    res.json({ code: 0, data: result, msg: '回复成功' });
  } catch (e) {
    logger.error('[Operations] manual reply error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ============ Product Knowledge Base ============
router.get('/product-knowledge', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ops_product_knowledge ORDER BY id LIMIT 1');
    if (rows && rows.length > 0) {
      const data = rows[0];
      if (typeof data.products === 'string') {
        try { data.products = JSON.parse(data.products); } catch { data.products = []; }
      }
      res.json({ code: 0, data });
    } else {
      res.json({ code: 0, data: null });
    }
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

router.post('/product-knowledge', auth, async (req, res) => {
  try {
    const { brand_name, brand_slogan, target_audience, audience_pain_points, audience_preferences, products, reply_personality, reply_rules } = req.body;
    const productsJson = JSON.stringify(products || []);

    const [existing] = await db.query('SELECT id FROM ops_product_knowledge LIMIT 1');
    if (existing && existing.length > 0) {
      await db.query(
        `UPDATE ops_product_knowledge SET brand_name=?, brand_slogan=?, target_audience=?, audience_pain_points=?, audience_preferences=?, products=?, reply_personality=?, reply_rules=?, updated_at=NOW() WHERE id=?`,
        [brand_name || '', brand_slogan || '', target_audience || '', audience_pain_points || '', audience_preferences || '', productsJson, reply_personality || '', reply_rules || '', existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO ops_product_knowledge (brand_name, brand_slogan, target_audience, audience_pain_points, audience_preferences, products, reply_personality, reply_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [brand_name || '', brand_slogan || '', target_audience || '', audience_pain_points || '', audience_preferences || '', productsJson, reply_personality || '', reply_rules || '']
      );
    }
    res.json({ code: 0, msg: '保存成功' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
