const router = require('express').Router();
const axios = require('axios');
const db = require('../db');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');
const logger = require('../logger');

// ============ 自动建表 ============
(async () => {
  try {
    // 直播间监控表
    await db.query(`CREATE TABLE IF NOT EXISTS live_rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(50) NOT NULL,
      nickname VARCHAR(100),
      platform ENUM('douyin','kuaishou') DEFAULT 'douyin',
      monitor_mode ENUM('realtime','schedule','auto') DEFAULT 'realtime',
      is_living TINYINT(1) DEFAULT 0,
      schedule_start DATETIME,
      schedule_end DATETIME,
      last_check_at DATETIME,
      status ENUM('active','paused','removed') DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_room_id (room_id)
    )`);

    // 直播实时数据表（分时段记录）
    await db.query(`CREATE TABLE IF NOT EXISTS live_realtime_data (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      recorded_at DATETIME NOT NULL,
      online_count INT DEFAULT 0,
      enter_count INT DEFAULT 0,
      leave_count INT DEFAULT 0,
      total_viewers INT DEFAULT 0,
      peak_count INT DEFAULT 0,
      avg_stay_seconds INT DEFAULT 0,
      interact_rate DECIMAL(5,2) DEFAULT 0,
      comment_count INT DEFAULT 0,
      like_count INT DEFAULT 0,
      share_count INT DEFAULT 0,
      product_click INT DEFAULT 0,
      cart_count INT DEFAULT 0,
      order_count INT DEFAULT 0,
      gmv DECIMAL(12,2) DEFAULT 0,
      uv_value DECIMAL(8,2) DEFAULT 0,
      gpm DECIMAL(8,2) DEFAULT 0,
      source_organic INT DEFAULT 0,
      source_paid INT DEFAULT 0,
      source_video INT DEFAULT 0,
      source_search INT DEFAULT 0,
      source_follow INT DEFAULT 0,
      qianchuan_cost DECIMAL(12,2) DEFAULT 0,
      qianchuan_roi DECIMAL(6,2) DEFAULT 0,
      paid_uv INT DEFAULT 0,
      paid_gmv DECIMAL(12,2) DEFAULT 0,
      INDEX idx_room_time (room_id, recorded_at),
      INDEX idx_recorded (recorded_at)
    )`);

    // 直播话术记录表
    await db.query(`CREATE TABLE IF NOT EXISTS live_speech_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      live_session_id INT,
      recorded_at DATETIME NOT NULL,
      text_content TEXT NOT NULL,
      category ENUM('selling_point','push_sale','welfare','interact','product_intro','other') DEFAULT 'other',
      is_high_convert TINYINT(1) DEFAULT 0,
      cvr DECIMAL(5,2) DEFAULT 0,
      related_gmv DECIMAL(12,2) DEFAULT 0,
      related_orders INT DEFAULT 0,
      INDEX idx_room_time (room_id, recorded_at),
      INDEX idx_category (category),
      INDEX idx_high_convert (is_high_convert)
    )`);

    // 直播弹幕记录表
    await db.query(`CREATE TABLE IF NOT EXISTS live_danmaku (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      user_nickname VARCHAR(100),
      user_id VARCHAR(50),
      content TEXT NOT NULL,
      sentiment ENUM('positive','neutral','negative') DEFAULT 'neutral',
      is_question TINYINT(1) DEFAULT 0,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_room_time (room_id, recorded_at),
      INDEX idx_sentiment (sentiment)
    )`);

    // 异常预警记录表
    await db.query(`CREATE TABLE IF NOT EXISTS live_alerts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      alert_type ENUM('online_surge','online_drop','traffic_drop','cvr_drop','roi_drop','stay_drop') NOT NULL,
      alert_level ENUM('critical','warning','info') DEFAULT 'warning',
      title VARCHAR(200) NOT NULL,
      description TEXT,
      cause VARCHAR(500),
      metric_before DECIMAL(12,2),
      metric_after DECIMAL(12,2),
      change_pct DECIMAL(6,2),
      status ENUM('active','resolved','ignored') DEFAULT 'active',
      resolved_by VARCHAR(100),
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_room (room_id),
      INDEX idx_status (status),
      INDEX idx_created (created_at)
    )`);

    // 预警配置表
    await db.query(`CREATE TABLE IF NOT EXISTS live_alert_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      alert_type VARCHAR(50) NOT NULL,
      enabled TINYINT(1) DEFAULT 1,
      threshold_json JSON,
      notify_popup TINYINT(1) DEFAULT 1,
      notify_sound TINYINT(1) DEFAULT 1,
      notify_message TINYINT(1) DEFAULT 1,
      notify_dingtalk TINYINT(1) DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_type (alert_type)
    )`);

    // 竞品直播间表
    await db.query(`CREATE TABLE IF NOT EXISTS live_competitors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(50) NOT NULL,
      nickname VARCHAR(100),
      monitor_flags JSON,
      is_living TINYINT(1) DEFAULT 0,
      online_count INT DEFAULT 0,
      total_viewers INT DEFAULT 0,
      gmv DECIMAL(12,2) DEFAULT 0,
      paid_ratio DECIMAL(5,2) DEFAULT 0,
      hot_products JSON,
      last_check_at DATETIME,
      status ENUM('active','paused','removed') DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_room_id (room_id)
    )`);

    // 直播场次表（用于复盘）
    await db.query(`CREATE TABLE IF NOT EXISTS live_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_seconds INT DEFAULT 0,
      total_viewers INT DEFAULT 0,
      peak_online INT DEFAULT 0,
      total_gmv DECIMAL(12,2) DEFAULT 0,
      total_orders INT DEFAULT 0,
      avg_stay_seconds INT DEFAULT 0,
      total_qianchuan_cost DECIMAL(12,2) DEFAULT 0,
      overall_roi DECIMAL(6,2) DEFAULT 0,
      ai_summary TEXT,
      status ENUM('living','ended','archived') DEFAULT 'living',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_room (room_id),
      INDEX idx_start (start_time)
    )`);

    // 智能评论任务表
    await db.query(`CREATE TABLE IF NOT EXISTS live_comment_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_name VARCHAR(200) NOT NULL,
      task_type ENUM('batch_comment','ai_reply') DEFAULT 'batch_comment',
      video_ids JSON,
      account_ids JSON,
      script_group VARCHAR(100),
      interval_min INT DEFAULT 15,
      interval_max INT DEFAULT 45,
      max_comments_per_video INT DEFAULT 50,
      risk_control TINYINT(1) DEFAULT 1,
      status ENUM('pending','running','paused','completed','failed') DEFAULT 'pending',
      progress_current INT DEFAULT 0,
      progress_total INT DEFAULT 0,
      success_count INT DEFAULT 0,
      fail_count INT DEFAULT 0,
      filtered_count INT DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // 智能评论日志表
    await db.query(`CREATE TABLE IF NOT EXISTS live_comment_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      task_id INT,
      account_id INT,
      video_id VARCHAR(50),
      comment_type ENUM('batch','ai_reply') DEFAULT 'batch',
      original_comment TEXT,
      reply_content TEXT,
      ai_category ENUM('positive','inquiry','negative','question','other') DEFAULT 'other',
      status ENUM('pending','success','failed','filtered') DEFAULT 'pending',
      fail_reason VARCHAR(500),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_task (task_id),
      INDEX idx_created (created_at)
    )`);

    // 直播间商品表
    await db.query(`CREATE TABLE IF NOT EXISTS live_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      product_name VARCHAR(255),
      product_img VARCHAR(512),
      price DECIMAL(10,2) DEFAULT 0,
      click_count INT DEFAULT 0,
      order_count INT DEFAULT 0,
      pay_amount DECIMAL(12,2) DEFAULT 0,
      click_cvr VARCHAR(20) DEFAULT '0%',
      pay_cvr VARCHAR(20) DEFAULT '0%',
      status TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    logger.info('✅ 直播中心数据表初始化完成');
  } catch (e) {
    logger.error('直播中心建表失败', { error: e.message });
  }
})();

// ============ 直播间管理 ============

// 获取直播间列表
router.get('/rooms', auth(), async (req, res) => {
  try {
    let accFilter = '';
    const accP = [];
    if (req.accountFilter) {
      // 包含已关联账户的直播间 + 未关联账户的直播间（兼容老数据）
      accFilter = ' AND (advertiser_id IN (' + req.accountFilter.map(() => '?').join(',') + ') OR advertiser_id IS NULL)';
      accP.push(...req.accountFilter);
    }
    const [rows] = await db.query(
      `SELECT r.*, a.advertiser_name FROM live_rooms r LEFT JOIN qc_accounts a ON r.advertiser_id = a.advertiser_id WHERE r.status = 'active'${accFilter} ORDER BY r.is_living DESC, r.created_at DESC`,
      accP
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    logger.error('获取直播间列表失败', { error: e.message });
    res.json({ code: 500, msg: '获取失败' });
  }
});

// 自动发现千川授权直播间
router.post('/rooms/discover', auth(), async (req, res) => {
  try {
    const OE_API_BASE = 'https://ad.oceanengine.com/open_api';
    const [accounts] = await db.query("SELECT advertiser_id, advertiser_name, access_token FROM qc_accounts WHERE status=1 AND access_token IS NOT NULL AND account_type='live'");
    if (!accounts.length) return res.json({ code: 400, msg: '无直播全域推广账户' });

    let added = 0, total = 0;
    for (const acc of accounts) {
      try {
        const resp = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/aweme/authorized/get/`, {
          params: { advertiser_id: parseInt(acc.advertiser_id), page: '1', page_size: '50' },
          headers: { 'Access-Token': acc.access_token },
          timeout: 15000,
        });
        const awemeList = resp.data?.data?.aweme_id_list || [];
        for (const aweme of awemeList) {
          total++;
          const awemeId = String(aweme.aweme_id);
          const awemeName = aweme.aweme_name || '';
          const showId = aweme.aweme_show_id || '';
          // 检查是否已存在
          const [existing] = await db.query(
            'SELECT id FROM live_rooms WHERE room_id=? AND advertiser_id=?',
            [awemeId, acc.advertiser_id]
          );
          if (existing.length) continue;
          // 也检查show_id
          if (showId) {
            const [existShow] = await db.query(
              'SELECT id FROM live_rooms WHERE room_id=? AND advertiser_id=?',
              [showId, acc.advertiser_id]
            );
            if (existShow.length) continue;
          }
          await db.query(
            `INSERT INTO live_rooms (room_id, advertiser_id, aweme_name, nickname, monitor_mode, status)
             VALUES (?, ?, ?, ?, 'realtime', 'active')`,
            [awemeId, acc.advertiser_id, awemeName, awemeName || acc.advertiser_name]
          );
          added++;
        }
      } catch (e) {
        logger.warn(`[LiveDiscover] 账户${acc.advertiser_id}发现失败`, { error: e.message });
      }
    }
    res.json({ code: 0, msg: `扫描${accounts.length}个账户，发现${total}个抖音号，新增${added}个直播间`, data: { total, added } });
  } catch (e) {
    logger.error('[LiveDiscover] 自动发现失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 添加直播间
router.post('/rooms', auth(), async (req, res) => {
  try {
    const { room_ids, nickname, mode, schedule_time } = req.body;
    const ids = Array.isArray(room_ids) ? room_ids : [room_ids];
    for (const rid of ids) {
      if (!rid) continue;
      const cleanId = rid.replace(/[^0-9a-zA-Z]/g, '');
      await db.query(
        `INSERT IGNORE INTO live_rooms (room_id, nickname, monitor_mode, schedule_start, schedule_end) VALUES (?, ?, ?, ?, ?)`,
        [cleanId, nickname || null, mode || 'realtime', schedule_time?.[0] || null, schedule_time?.[1] || null]
      );
    }
    res.json({ code: 0, msg: '添加成功' });
  } catch (e) {
    logger.error('添加直播间失败', { error: e.message });
    res.json({ code: 500, msg: '添加失败' });
  }
});

// 删除直播间
router.delete('/rooms/:id', auth(), async (req, res) => {
  try {
    await db.query(`UPDATE live_rooms SET status = 'removed' WHERE id = ?`, [req.params.id]);
    res.json({ code: 0, msg: '已移除' });
  } catch (e) {
    res.json({ code: 500, msg: '操作失败' });
  }
});

// 获取直播间实时数据
router.get('/rooms/:id/realtime', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM live_realtime_data WHERE room_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.json({ code: 0, data: null });
    }
    const d = rows[0];
    // 获取上一条记录计算趋势
    const [prevRows] = await db.query(
      `SELECT online_count FROM live_realtime_data WHERE room_id = ? AND id < ? ORDER BY recorded_at DESC LIMIT 1`,
      [req.params.id, d.id]
    );
    const prevOnline = prevRows[0]?.online_count || 0;
    // 格式化停留时长
    const secs = d.avg_stay_seconds || 0;
    const avgStay = secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`;

    res.json({ code: 0, data: {
      ...d,
      avg_stay: avgStay,
      online_trend: d.online_count - prevOnline,
    }});
  } catch (e) {
    res.json({ code: 500, msg: '获取失败' });
  }
});

// 获取分时段数据
router.get('/rooms/:id/timeslot', auth(), async (req, res) => {
  try {
    const { granularity = 5, date } = req.query;
    const targetDate = date || dayjs().format('YYYY-MM-DD');
    const [rows] = await db.query(
      `SELECT *, DATE_FORMAT(recorded_at, '%H:%i') as time_slot
       FROM live_realtime_data
       WHERE room_id = ? AND DATE(recorded_at) = ?
       ORDER BY recorded_at`,
      [req.params.id, targetDate]
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: '获取失败' });
  }
});

// ============ 话术管理 ============

// 获取话术记录
router.get('/rooms/:id/speech', auth(), async (req, res) => {
  try {
    const { category, high_convert, keyword, page = 1, pageSize = 50 } = req.query;
    const roomId = req.params.id;
    // 实时话术（最近30条）
    const [realtimeRows] = await db.query('SELECT * FROM live_speech_records WHERE room_id = ? ORDER BY recorded_at DESC LIMIT 30', [roomId]);
    const realtime = realtimeRows.map(r => ({
      time: r.recorded_at ? new Date(r.recorded_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '',
      text: r.text_content || '',
      category: r.category || 'other',
      is_high_convert: !!r.is_high_convert,
      cvr: parseFloat(r.cvr || 0),
      gmv: parseFloat(r.related_gmv || 0),
      orders: r.related_orders || 0,
    }));
    // 话术库
    let libSql = 'SELECT * FROM live_speech_records WHERE room_id = ?';
    const libParams = [roomId];
    if (category && category !== 'all') { libSql += ' AND category = ?'; libParams.push(category); }
    if (high_convert === '1') { libSql += ' AND is_high_convert = 1'; }
    if (keyword) { libSql += ' AND text_content LIKE ?'; libParams.push('%' + keyword + '%'); }
    libSql += ' ORDER BY recorded_at DESC LIMIT ? OFFSET ?';
    libParams.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
    const [libRows] = await db.query(libSql, libParams);
    const library = libRows.map(r => ({
      time: r.recorded_at ? new Date(r.recorded_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '',
      text: r.text_content || '',
      category: r.category || 'other',
      is_high_convert: !!r.is_high_convert,
      cvr: parseFloat(r.cvr) || 0,
      orders: r.related_orders || 0,
      gmv: parseFloat(r.related_gmv) || 0,
    }));
    // 关键词提取（行业词库 + 滑动窗口）
    const allText = realtimeRows.map(r => r.text_content || '').join(' ').replace(/[\u{1F300}-\u{1FFFF}]/gu, '');
    const wordMap = {};
    const industryWords = ['洗面奶','洁面乳','氨基酸','控油','保湿','补水','卸妆','清洁','黑头','闭口','粉刺','毛孔','美白','祛痘','护肤','眼影','腮红','眼线','口红','唇釉','BB霜','防晒','隔离','面膜','精华','乳液','套装','单品','大容量','旗舰店','正装','试用','发货','包邮','运费险','划算','福利','优惠','活动','链接','现货','限量','出油','干燥','温和','敏感肌','油皮','干皮','去角质','洗面','洗脸','洗澡','卸妆油','新品','升级','一号链接','回购','好用','省钱'];
    industryWords.forEach(w => {
      const regex = new RegExp(w, 'g');
      const matches = allText.match(regex);
      if (matches) wordMap[w] = matches.length;
    });
    allText.split(/[\s,.\u3002\uff0c\uff01\uff1f\u3001]+/).filter(w => w.length >= 2 && w.length <= 6).forEach(w => {
      if (!industryWords.includes(w)) wordMap[w] = (wordMap[w] || 0) + 1;
    });
    const keywords = Object.entries(wordMap).filter(([,c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([text, count]) => ({ text, count }));
    const [countRow] = await db.query('SELECT COUNT(*) as total FROM live_speech_records WHERE room_id = ?', [roomId]);
    res.json({ code: 0, data: {
      realtime, library, keywords,
      is_recording: realtimeRows.length > 0,
      record_duration: realtimeRows.length > 0 ? (realtimeRows.length * 30) + 's' : '--:--:--',
      total: countRow[0]?.total || 0,
    }});
  } catch (e) {
    logger.error('[Live] speech error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

router.get('/rooms/:id/products', auth(), async (req, res) => {
  try {
    // 优先从 live_products 表读取
    const [products] = await db.query(
      `SELECT * FROM live_products WHERE room_id = ? AND status = 1 ORDER BY pay_amount DESC`,
      [req.params.id]
    );
    if (products.length > 0) {
      return res.json({ code: 0, data: products });
    }

    // live_products 为空时，从 qc_daily_stats 聚合素材数据作为替代展示
    const today = dayjs().format('YYYY-MM-DD');
    const [statsRows] = await db.query(
      `SELECT entity_name as product_name, '' as product_img,
              ROUND(SUM(cpm) / GREATEST(SUM(convert_cnt), 1), 2) as price,
              SUM(click_cnt) as click_count, SUM(convert_cnt) as order_count,
              CAST(SUM(cpm) AS DECIMAL(12,2)) as pay_amount,
              CASE WHEN SUM(show_cnt) > 0 THEN CONCAT(ROUND(SUM(click_cnt)/SUM(show_cnt)*100, 1), '%') ELSE '0%' END as click_cvr,
              CASE WHEN SUM(click_cnt) > 0 THEN CONCAT(ROUND(SUM(convert_cnt)/SUM(click_cnt)*100, 1), '%') ELSE '0%' END as pay_cvr,
              1 as status
       FROM qc_daily_stats
       WHERE stat_date = ? AND entity_name IS NOT NULL AND entity_name != ''
       GROUP BY entity_name
       HAVING SUM(convert_cnt) > 0
       ORDER BY SUM(cpm) DESC LIMIT 20`,
      [today]
    );
    res.json({ code: 0, data: statsRows || [] });
  } catch (e) {
    logger.error('获取商品列表失败', { error: e.message });
    res.json({ code: 0, data: [] });
  }
});

// ============ 弹幕管理 ============

router.get('/rooms/:id/danmaku', auth(), async (req, res) => {
  try {
    const roomId = req.params.id;
    // 从话术记录中分析生成弹幕分析数据
    const [speeches] = await db.query(
      'SELECT text_content, category, recorded_at FROM live_speech_records WHERE room_id = ? ORDER BY recorded_at DESC LIMIT 50',
      [roomId]
    );

    // 热门话题：从话术分类统计
    const categoryMap = {};
    const categoryLabel = { selling_point: '卖点讲解', push_sale: '逼单促单', welfare: '福利发放', interact: '互动留人', product_intro: '产品介绍', other: '其他' };
    speeches.forEach(s => {
      const label = categoryLabel[s.category] || '其他';
      categoryMap[label] = (categoryMap[label] || 0) + 1;
    });
    const hot_topics = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([text, count]) => ({ text, count, heat: count * 20 }));

    // 用户关注点：从话术文本提取高频词
    const allText = speeches.map(s => s.text_content || '').join(' ');
    const wordMap = {};
    allText.split(/[\s,.\u3002\uff0c\uff01\uff1f\u3001]+/).filter(w => w.length >= 2 && w.length <= 6).forEach(w => {
      wordMap[w] = (wordMap[w] || 0) + 1;
    });
    const questions = Object.entries(wordMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count }));

    // 情感分析：基于话术分类推算
    const positive = speeches.filter(s => ['selling_point', 'product_intro', 'welfare'].includes(s.category)).length;
    const neutral = speeches.filter(s => ['interact', 'other'].includes(s.category)).length;
    const negative = speeches.filter(s => s.category === 'push_sale').length;
    const total = positive + neutral + negative || 1;
    const sentiment = [
      { name: '正面', value: Math.round(positive / total * 100), color: '#52c41a' },
      { name: '中性', value: Math.round(neutral / total * 100), color: '#1890ff' },
      { name: '负面', value: Math.round(negative / total * 100), color: '#ff4d4f' },
    ];

    // 弹幕列表（从ops_comment_logs补充）
    let danmakuList = [];
    try {
      const [comments] = await db.query(
        'SELECT douyin_nickname, original_comment, created_at FROM ops_comment_logs WHERE original_comment IS NOT NULL AND original_comment != "" ORDER BY created_at DESC LIMIT 50'
      );
      danmakuList = comments.map(c => ({
        user: c.douyin_nickname || '观众',
        text: c.original_comment,
        time: c.created_at,
      }));
    } catch (e) {}

    res.json({ code: 0, data: { hot_topics, questions, sentiment, list: danmakuList, total: speeches.length } });
  } catch (e) {
    logger.error('[Live] danmaku analysis error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

router.get('/alerts', auth(), async (req, res) => {
  try {
    const { status, level, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT la.*, lr.nickname as room_name FROM live_alerts la LEFT JOIN live_rooms lr ON la.room_id = lr.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND la.status = ?`; params.push(status); }
    if (level) { sql += ` AND la.alert_level = ?`; params.push(level); }
    sql += ` ORDER BY la.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: '获取失败' });
  }
});

// 处理预警
router.post('/alerts/:id/resolve', auth(), async (req, res) => {
  try {
    await db.query(
      `UPDATE live_alerts SET status = 'resolved', resolved_by = ?, resolved_at = NOW() WHERE id = ?`,
      [req.user?.username || 'system', req.params.id]
    );
    res.json({ code: 0, msg: '已处理' });
  } catch (e) {
    res.json({ code: 500, msg: '操作失败' });
  }
});

// 获取/保存预警配置
router.get('/alert-configs', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM live_alert_configs`);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: '获取失败' });
  }
});

router.post('/alert-configs', auth(), async (req, res) => {
  try {
    const configs = req.body.configs || [];
    for (const cfg of configs) {
      await db.query(
        `INSERT INTO live_alert_configs (alert_type, enabled, threshold_json, notify_popup, notify_sound, notify_message, notify_dingtalk)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), threshold_json=VALUES(threshold_json),
         notify_popup=VALUES(notify_popup), notify_sound=VALUES(notify_sound),
         notify_message=VALUES(notify_message), notify_dingtalk=VALUES(notify_dingtalk)`,
        [cfg.alert_type, cfg.enabled ? 1 : 0, JSON.stringify(cfg.thresholds),
         cfg.notify_popup ? 1 : 0, cfg.notify_sound ? 1 : 0, cfg.notify_message ? 1 : 0, cfg.notify_dingtalk ? 1 : 0]
      );
    }
    res.json({ code: 0, msg: '配置已保存' });
  } catch (e) {
    res.json({ code: 500, msg: '保存失败' });
  }
});

// ============ 智能评论 ============

// 获取评论任务列表
router.get('/comment-tasks', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT *, JSON_LENGTH(account_ids) as account_count, JSON_LENGTH(video_ids) as video_count,
       ROUND(progress_current / GREATEST(progress_total, 1) * 100) as progress
       FROM live_comment_tasks ORDER BY created_at DESC`
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: '获取失败' });
  }
});

// 创建评论任务
router.post('/comment-tasks', auth(), async (req, res) => {
  try {
    const { name, video_ids, account_ids, script_group, interval, max_comments, risk_control } = req.body;
    const videoList = typeof video_ids === 'string' ? video_ids.split('\n').map(s => s.trim()).filter(Boolean) : video_ids;
    const [result] = await db.query(
      `INSERT INTO live_comment_tasks (task_name, video_ids, account_ids, script_group, interval_min, interval_max, max_comments_per_video, risk_control, progress_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, JSON.stringify(videoList), JSON.stringify(account_ids || []),
       script_group || null, interval?.[0] || 15, interval?.[1] || 45,
       max_comments || 50, risk_control ? 1 : 0, (videoList?.length || 0) * (max_comments || 50)]
    );
    res.json({ code: 0, data: { id: result.insertId }, msg: '任务创建成功' });
  } catch (e) {
    logger.error('创建评论任务失败', { error: e.message });
    res.json({ code: 500, msg: '创建失败' });
  }
});

// 启动/暂停/删除评论任务
router.post('/comment-tasks/:id/start', auth(), async (req, res) => {
  try {
    await db.query(`UPDATE live_comment_tasks SET status = 'running', started_at = NOW() WHERE id = ?`, [req.params.id]);
    res.json({ code: 0, msg: '任务已启动' });
  } catch (e) { res.json({ code: 500, msg: '操作失败' }); }
});

router.post('/comment-tasks/:id/pause', auth(), async (req, res) => {
  try {
    await db.query(`UPDATE live_comment_tasks SET status = 'paused' WHERE id = ?`, [req.params.id]);
    res.json({ code: 0, msg: '任务已暂停' });
  } catch (e) { res.json({ code: 500, msg: '操作失败' }); }
});

router.delete('/comment-tasks/:id', auth(), async (req, res) => {
  try {
    await db.query(`DELETE FROM live_comment_tasks WHERE id = ?`, [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: 500, msg: '操作失败' }); }
});

// ============ 竞品监控 ============

router.get('/competitors', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM live_competitors WHERE status = 'active' ORDER BY is_living DESC, created_at DESC`);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: '获取失败' });
  }
});

router.post('/competitors', auth(), async (req, res) => {
  try {
    const { input, monitors } = req.body;
    const ids = input.split('\n').map(s => s.trim()).filter(Boolean);
    for (const rid of ids) {
      await db.query(
        `INSERT IGNORE INTO live_competitors (room_id, monitor_flags) VALUES (?, ?)`,
        [rid, JSON.stringify(monitors || ['traffic', 'sales'])]
      );
    }
    res.json({ code: 0, msg: '添加成功' });
  } catch (e) {
    res.json({ code: 500, msg: '添加失败' });
  }
});

router.delete('/competitors/:id', auth(), async (req, res) => {
  try {
    await db.query(`UPDATE live_competitors SET status = 'removed' WHERE id = ?`, [req.params.id]);
    res.json({ code: 0, msg: '已移除' });
  } catch (e) {
    res.json({ code: 500, msg: '操作失败' });
  }
});

// ============ 直播复盘 ============

router.get('/sessions', auth(), async (req, res) => {
  try {
    const { room_id, date } = req.query;
    const roomFilter = room_id || 1;

    // 如果指定了日期，先查session表，没有则从realtime自动汇总
    if (date) {
      const [existing] = await db.query(
        'SELECT ls.*, lr.nickname as room_name FROM live_sessions ls LEFT JOIN live_rooms lr ON ls.room_id = lr.id WHERE ls.room_id = ? AND DATE(ls.start_time) = ?',
        [roomFilter, date]
      );
      if (existing.length) return res.json({ code: 0, data: existing });

      // 从realtime自动汇总
      const [summary] = await db.query(
        `SELECT MIN(recorded_at) as start_time, MAX(recorded_at) as end_time,
         TIMESTAMPDIFF(SECOND, MIN(recorded_at), MAX(recorded_at)) as duration_seconds,
         MAX(total_viewers) as total_viewers, MAX(peak_count) as peak_online,
         MAX(CAST(gmv AS DECIMAL(12,2))) as total_gmv, MAX(order_count) as total_orders,
         AVG(avg_stay_seconds) as avg_stay_seconds,
         MAX(CAST(qianchuan_cost AS DECIMAL(12,2))) as total_qianchuan_cost,
         MAX(CAST(qianchuan_roi AS DECIMAL(5,2))) as overall_roi,
         COUNT(*) as data_points
         FROM live_realtime_data WHERE room_id = ? AND DATE(recorded_at) = ?`,
        [roomFilter, date]
      );
      if (summary[0] && summary[0].data_points > 0) {
        const s = summary[0];
        const [room] = await db.query('SELECT nickname FROM live_rooms WHERE id = ?', [roomFilter]);
        return res.json({ code: 0, data: [{
          id: 0, room_id: parseInt(roomFilter), start_time: s.start_time, end_time: s.end_time,
          duration_seconds: s.duration_seconds || 0, total_viewers: s.total_viewers || 0,
          peak_online: s.peak_online || 0, total_gmv: s.total_gmv || 0,
          total_orders: s.total_orders || 0, avg_stay_seconds: Math.round(s.avg_stay_seconds || 0),
          total_qianchuan_cost: s.total_qianchuan_cost || 0, overall_roi: s.overall_roi || 0,
          ai_summary: `直播时长${Math.round((s.duration_seconds || 0) / 3600)}小时, 成交${s.total_orders || 0}单, GMV ¥${((s.total_gmv || 0) / 10000).toFixed(1)}万`,
          status: 'ended', room_name: room[0]?.nickname || '',
        }]});
      }
      return res.json({ code: 0, data: [] });
    }

    // 不指定日期：返回所有有数据的天（从realtime汇总）
    const [days] = await db.query(
      `SELECT DATE(recorded_at) as day,
       MIN(recorded_at) as start_time, MAX(recorded_at) as end_time,
       TIMESTAMPDIFF(SECOND, MIN(recorded_at), MAX(recorded_at)) as duration_seconds,
       MAX(total_viewers) as total_viewers, MAX(peak_count) as peak_online,
       MAX(CAST(gmv AS DECIMAL(12,2))) as total_gmv, MAX(order_count) as total_orders,
       AVG(avg_stay_seconds) as avg_stay_seconds,
       MAX(CAST(qianchuan_cost AS DECIMAL(12,2))) as total_qianchuan_cost,
       MAX(CAST(qianchuan_roi AS DECIMAL(5,2))) as overall_roi
       FROM live_realtime_data WHERE room_id = ?
       GROUP BY DATE(recorded_at) ORDER BY day DESC LIMIT 30`,
      [roomFilter]
    );
    const [room] = await db.query('SELECT nickname FROM live_rooms WHERE id = ?', [roomFilter]);
    const result = days.map((d, i) => ({
      id: i + 1, room_id: parseInt(roomFilter), start_time: d.start_time, end_time: d.end_time,
      duration_seconds: d.duration_seconds || 0, total_viewers: d.total_viewers || 0,
      peak_online: d.peak_online || 0, total_gmv: d.total_gmv || 0,
      total_orders: d.total_orders || 0, avg_stay_seconds: Math.round(d.avg_stay_seconds || 0),
      total_qianchuan_cost: d.total_qianchuan_cost || 0, overall_roi: d.overall_roi || 0,
      ai_summary: `直播时长${Math.round((d.duration_seconds || 0) / 3600)}小时, 成交${d.total_orders || 0}单, GMV ¥${((d.total_gmv || 0) / 10000).toFixed(1)}万, ROI ${d.overall_roi || '--'}`,
      status: 'ended', room_name: room[0]?.nickname || '',
    }));
    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('[Live] sessions error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

router.get('/accounts', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM ops_douyin_accounts WHERE status = 'active'`);
    res.json({ code: 0, data: rows });
  } catch (e) {
    // 降级到空列表
    res.json({ code: 0, data: [] });
  }
});

// ============ 巨量营销OAuth回调（获取直播间数据权限）============

const MARKETING_APP_ID = '1859991868170400';
const MARKETING_APP_SECRET = '17cdd2d8896a9cbd9a784431810e2f313c87c29c';
const MARKETING_CALLBACK = 'https://business.snefe.com/api/live/marketing-oauth-callback';

router.get('/marketing-oauth-url', auth(), (req, res) => {
  const url = `https://open.oceanengine.com/audit/oauth.html?app_id=${MARKETING_APP_ID}&redirect_uri=${encodeURIComponent(MARKETING_CALLBACK)}&state=live_marketing`;
  res.json({ code: 0, data: { url } });
});

router.get('/marketing-oauth-callback', async (req, res) => {
  const { auth_code } = req.query;
  if (!auth_code) return res.send('<h2>授权失败：缺少auth_code</h2>');
  try {
    const tokenRes = await axios.post('https://ad.oceanengine.com/open_api/oauth2/access_token/', {
      appid: MARKETING_APP_ID, secret: MARKETING_APP_SECRET,
      grant_type: 'auth_code', auth_code,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    const data = tokenRes.data?.data;
    if (!data?.access_token) {
      return res.send('<h2>Token获取失败</h2><pre>' + JSON.stringify(tokenRes.data, null, 2) + '</pre>');
    }
    const expiresAt = new Date(Date.now() + (data.expires_in || 86400) * 1000);
    logger.info('[LiveOAuth] 巨量营销Token获取成功', { expiresAt });

    // 更新 marketing_accounts 所有活跃账号
    const [accs] = await db.query('SELECT id, advertiser_id, advertiser_name FROM marketing_accounts WHERE status=1');
    for (const acc of accs) {
      await db.query('UPDATE marketing_accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE id=?',
        [data.access_token, data.refresh_token || '', expiresAt, acc.id]);
    }
    logger.info('[LiveOAuth] 已更新 ' + accs.length + ' 个营销账号Token');

    res.send('<!DOCTYPE html><html><body style="text-align:center;padding:60px;font-family:sans-serif;background:#f0f2f5"><div style="background:#fff;max-width:400px;margin:0 auto;padding:40px;border-radius:12px"><h2 style="color:#52c41a">巨量营销授权成功!</h2><p>已更新 ' + accs.length + ' 个账号</p><p>有效期至: ' + expiresAt.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) + '</p><p>直播间数据即将开始采集</p></div></body></html>');
  } catch (e) {
    logger.error('[LiveOAuth] 回调错误', { error: e.message });
    res.send('<h2>授权出错</h2><pre>' + e.message + '</pre>');
  }
});

// ============ 直播间流地址获取（用于实时画面预览）============

// 缓存ttwid和流地址，避免频繁请求
let cachedTtwid = null;
let cachedTtwidAt = 0;
let streamCache = {};  // { webRid: { url, cover, title, expiry } }

async function getTtwid() {
  if (cachedTtwid && Date.now() - cachedTtwidAt < 3600000) return cachedTtwid;
  try {
    const r = await axios.get('https://live.douyin.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 10000,
    });
    const cookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    cachedTtwid = cookies;
    cachedTtwidAt = Date.now();
    return cookies;
  } catch (e) {
    return cachedTtwid || '';
  }
}

router.get('/rooms/:id/stream', auth(), async (req, res) => {
  try {
    const [rooms] = await db.query('SELECT * FROM live_rooms WHERE id = ?', [req.params.id]);
    if (!rooms.length) return res.json({ code: 404, msg: '直播间不存在' });
    const room = rooms[0];

    // 从live_rooms表获取web_rid（抖音号），优先用nickname匹配
    // 查authorized aweme list获取aweme_show_id
    const [qcAccs] = await db.query('SELECT * FROM qc_accounts WHERE status = 1 AND account_type = "live" LIMIT 1');
    let webRid = room.web_rid || '';

    if (!webRid && qcAccs.length) {
      try {
        const awemeResp = await axios.get('https://ad.oceanengine.com/open_api/v1.0/qianchuan/aweme/authorized/get/', {
          params: { advertiser_id: parseInt(qcAccs[0].advertiser_id), page: 1, page_size: 50 },
          headers: { 'Access-Token': qcAccs[0].access_token },
          timeout: 10000,
        });
        const awemeList = awemeResp.data?.data?.aweme_id_list || [];
        const matched = awemeList.find(a => a.aweme_name?.includes(room.nickname) || room.nickname?.includes(a.aweme_name));
        if (matched) {
          webRid = matched.aweme_show_id || '';
          // 缓存到数据库
          if (webRid) {
            await db.query('UPDATE live_rooms SET web_rid = ? WHERE id = ?', [webRid, room.id]).catch(() => {});
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (!webRid) return res.json({ code: 404, msg: '未找到直播间抖音号' });

    // 检查缓存（5分钟有效）
    const cached = streamCache[webRid];
    if (cached && cached.expiry > Date.now()) {
      return res.json({ code: 0, data: cached });
    }

    // 获取ttwid
    const cookies = await getTtwid();

    // 调用webcast API
    const r = await axios.get('https://live.douyin.com/webcast/room/web/enter/', {
      params: {
        aid: 6383, app_name: 'douyin_web', live_id: 1, device_platform: 'web',
        language: 'zh-CN', browser_language: 'zh-CN', browser_platform: 'Win32',
        browser_name: 'Chrome', browser_version: '120.0.0.0', web_rid: webRid,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://live.douyin.com/' + webRid,
        'Cookie': cookies,
      },
      timeout: 10000,
    });

    const roomData = r.data?.data?.data?.[0] || r.data?.data?.room;
    if (!roomData) return res.json({ code: 404, msg: '直播间数据获取失败' });

    const streamUrl = roomData.stream_url || {};
    const flvUrls = streamUrl.flv_pull_url || {};
    const hlsUrls = streamUrl.hls_pull_url_map || {};
    const coverUrl = roomData.cover?.url_list?.[0] || '';

    const result = {
      status: roomData.status,  // 2=直播中, 4=已结束
      title: roomData.title || '',
      cover: coverUrl,
      room_id: roomData.id_str || '',
      flv: flvUrls.HD1 || flvUrls.FULL_HD1 || flvUrls.SD1 || Object.values(flvUrls)[0] || '',
      hls: hlsUrls.HD1 || hlsUrls.FULL_HD1 || hlsUrls.SD1 || Object.values(hlsUrls)[0] || '',
      expiry: Date.now() + 300000,  // 5分钟缓存
    };

    streamCache[webRid] = result;
    logger.info('[LiveStream] 流地址获取成功', { webRid, status: result.status, hasFlv: !!result.flv });
    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('[LiveStream] 流地址获取失败', { error: e.message });
    res.json({ code: 500, msg: '获取失败: ' + e.message });
  }
});

// 流地址代理（解决跨域）
router.get('/stream-proxy', auth(), async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const r = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://live.douyin.com/',
      },
      timeout: 30000,
    });
    res.set({
      'Content-Type': r.headers['content-type'] || 'video/x-flv',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    r.data.pipe(res);
  } catch (e) {
    res.status(502).send('Stream proxy error');
  }
});

router.get('/comment-logs', auth(), async (req, res) => {
  try {
    const { category, page = 1, pageSize = 50 } = req.query;
    let sql = `SELECT * FROM ops_comment_logs WHERE 1=1`;
    const params = [];
    if (category) {
      sql += ` AND ai_category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
    const [rows] = await db.query(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM ops_comment_logs WHERE 1=1`;
    const countParams = [];
    if (category) {
      countSql += ` AND ai_category = ?`;
      countParams.push(category);
    }
    const [countRows] = await db.query(countSql, countParams);

    res.json({ code: 0, data: { list: rows, total: countRows[0]?.total || 0 } });
  } catch (e) {
    logger.error('获取评论日志失败', { error: e.message });
    res.json({ code: 500, msg: '获取失败' });
  }
});

// 获取评论统计数据
router.get('/comment-stats', auth(), async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    const [totalRows] = await db.query(
      `SELECT COUNT(*) as total FROM ops_comment_logs WHERE DATE(created_at) = ?`, [today]
    );
    const [aiRows] = await db.query(
      `SELECT COUNT(*) as total FROM ops_comment_logs WHERE DATE(created_at) = ? AND reply_content IS NOT NULL AND reply_content != ''`, [today]
    );
    const [successRows] = await db.query(
      `SELECT COUNT(*) as total FROM ops_comment_logs WHERE DATE(created_at) = ? AND status = 'success'`, [today]
    );
    const [categoryRows] = await db.query(
      `SELECT ai_category, COUNT(*) as cnt FROM ops_comment_logs WHERE DATE(created_at) = ? GROUP BY ai_category`, [today]
    );
    const [publisherRows] = await db.query(
      `SELECT publisher_name, COUNT(*) as today_count,
       SUM(CASE WHEN reply_content IS NOT NULL AND reply_content != '' THEN 1 ELSE 0 END) as ai_count,
       ROUND(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as success_rate
       FROM ops_comment_logs WHERE DATE(created_at) = ?
       GROUP BY publisher_name, publisher_id
       ORDER BY today_count DESC`, [today]
    );
    const [trendRows] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%m-%d') as day,
       COUNT(*) as total,
       SUM(CASE WHEN reply_content IS NOT NULL AND reply_content != '' THEN 1 ELSE 0 END) as ai_replies,
       ROUND(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as success_rate
       FROM ops_comment_logs
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE_FORMAT(created_at, '%m-%d')
       ORDER BY day`
    );

    const totalToday = totalRows[0]?.total || 0;
    const aiReplies = aiRows[0]?.total || 0;
    const successCount = successRows[0]?.total || 0;
    const successRate = totalToday > 0 ? (successCount / totalToday * 100).toFixed(1) : '0';

    res.json({
      code: 0,
      data: {
        total_today: totalToday,
        ai_replies: aiReplies,
        success_rate: successRate,
        categories: categoryRows,
        publishers: publisherRows.map((r, i) => ({
          key: i + 1,
          account: r.publisher_name || '未知',
          today: r.today_count,
          ai: r.ai_count,
          success: r.success_rate + '%',
        })),
        trend: trendRows,
      }
    });
  } catch (e) {
    logger.error('获取评论统计失败', { error: e.message });
    res.json({ code: 500, msg: '获取失败' });
  }
});

module.exports = router;
