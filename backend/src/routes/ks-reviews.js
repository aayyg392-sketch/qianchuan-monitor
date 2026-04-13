/**
 * 快手评价管理 API
 * - 评价同步（从快手拉取）
 * - 自动回复（模板匹配 + AI生成 + 定时自动）
 * - 手动回复
 * - 回复日志
 * - 最新评论滚动
 */
const db = require('../db');
const logger = require('../logger');
const axios = require('axios');
const router = require('express').Router();

// ========== 定时器管理 ==========
let autoReplyTimers = {}; // { shopId: intervalId }

// ========== 自动建表 ==========
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_reviews (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(64) NOT NULL,
        comment_id VARCHAR(64) NOT NULL,
        order_id VARCHAR(64) DEFAULT '',
        item_id VARCHAR(64) DEFAULT '',
        item_title VARCHAR(255) DEFAULT '',
        buyer_nick VARCHAR(100) DEFAULT '',
        star INT DEFAULT 5,
        content TEXT,
        images JSON,
        quality_score INT DEFAULT 5,
        service_score INT DEFAULT 5,
        logistics_score INT DEFAULT 5,
        seller_reply TEXT,
        replied TINYINT(1) DEFAULT 0,
        reply_status ENUM('pending','replied','failed') DEFAULT 'pending',
        reply_time DATETIME,
        anonymous TINYINT(1) DEFAULT 0,
        comment_time DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_comment (shop_id, comment_id),
        INDEX idx_shop_status (shop_id, reply_status),
        INDEX idx_shop_time (shop_id, comment_time)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_review_settings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(64) NOT NULL,
        auto_reply_enabled TINYINT(1) DEFAULT 0,
        auto_reply_stars JSON COMMENT '自动回复的星级 如[5,4,3]',
        ai_reply_enabled TINYINT(1) DEFAULT 0 COMMENT 'AI回复开关',
        auto_reply_interval INT DEFAULT 30 COMMENT '定时回复间隔(分钟)',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_shop (shop_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_review_templates (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(64) NOT NULL,
        name VARCHAR(100) NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        star_min INT DEFAULT 1,
        star_max INT DEFAULT 5,
        is_default TINYINT(1) DEFAULT 0,
        use_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_shop (shop_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_review_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(64) NOT NULL,
        comment_id VARCHAR(64) NOT NULL,
        order_id VARCHAR(64) DEFAULT '',
        buyer_nick VARCHAR(100) DEFAULT '',
        item_title VARCHAR(255) DEFAULT '',
        star INT DEFAULT 0,
        comment_content TEXT,
        reply_content TEXT NOT NULL,
        template_id BIGINT DEFAULT NULL,
        reply_type ENUM('auto','manual','ai') DEFAULT 'auto',
        reply_status ENUM('success','fail') DEFAULT 'success',
        fail_reason VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shop_time (shop_id, created_at),
        INDEX idx_type_status (reply_type, reply_status)
      )
    `);

    // 确保新列存在
    try { await db.query(`ALTER TABLE ks_review_settings ADD COLUMN ai_reply_enabled TINYINT(1) DEFAULT 0 COMMENT 'AI回复开关' AFTER auto_reply_stars`); } catch (e) {}
    try { await db.query(`ALTER TABLE ks_review_settings ADD COLUMN auto_reply_interval INT DEFAULT 30 COMMENT '定时回复间隔(分钟)' AFTER ai_reply_enabled`); } catch (e) {}
    try { await db.query(`ALTER TABLE ks_review_logs MODIFY COLUMN reply_type ENUM('auto','manual','ai') DEFAULT 'auto'`); } catch (e) {}

    logger.info('[KS-Reviews] 表结构就绪');

    // 启动时恢复定时任务
    setTimeout(() => initAutoReplyTimers(), 5000);
  } catch (e) {
    logger.error('[KS-Reviews] 建表失败', e.message);
  }
})();

// ========== AI回复生成 ==========
async function aiGenerateReply(reviewContent, starScore) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = 'claude-haiku-4-5-20251001'; // 快速且稳定

  if (!apiKey) throw new Error('未配置OPENAI_API_KEY');

  const starDesc = starScore >= 4 ? '好评' : starScore === 3 ? '中评' : '差评';

  const resp = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      {
        role: 'system',
        content: `你是"雪玲妃护肤旗舰店"的客服专员，负责回复快手小店的商品评价。快手用户90%是东北客户，回复要带东北味儿。

回复要求：
1. 语气热情、实在、接地气，带东北口吻（可以用"老铁"、"姐"、"妹子"、"贼好"、"杠杠的"、"整挺好"、"必须的"等东北词汇）
2. 站在品牌旗舰店角度，让客户感受到真诚和热乎劲儿
3. 根据用户评价内容针对性回复，不要千篇一律
4. 如果是好评/中评，实在地感谢，鼓励回购（比如"下次还来啊"、"用完再来整"）
5. 如果是差评，先真诚道歉表达理解，再给解决方案（联系客服），态度要诚恳
6. 回复控制在30-80字，简洁有力，别啰嗦
7. 不要使用emoji表情
8. 不要太正式太官方，要像跟朋友唠嗑一样自然`
      },
      {
        role: 'user',
        content: `这是一条${starDesc}（${starScore}星）：\n${reviewContent}\n\n请生成一条回复：`
      }
    ],
    temperature: 0.7,
    max_tokens: 200,
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const reply = (resp.data?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('AI返回空内容');
  return reply;
}

// ========== 获取商品标题映射 ==========
async function getItemTitleMap(shopId) {
  try {
    const [rows] = await db.query('SELECT item_id, item_title FROM ks_items WHERE shop_id = ?', [shopId]);
    const map = {};
    rows.forEach(r => { map[String(r.item_id)] = r.item_title; });
    return map;
  } catch (e) { return {}; }
}

// ========== 定时自动回复引擎 ==========
async function initAutoReplyTimers() {
  try {
    const [settings] = await db.query('SELECT * FROM ks_review_settings WHERE ai_reply_enabled = 1');
    for (const s of settings) {
      startAutoReplyTimer(s.shop_id, s.auto_reply_interval || 30);
    }
    logger.info(`[KS-Reviews] 定时自动回复已恢复 ${settings.length} 个店铺`);
  } catch (e) {
    logger.error('[KS-Reviews] 恢复定时任务失败', e.message);
  }
}

function startAutoReplyTimer(shopId, intervalMin) {
  // 先停掉旧的
  if (autoReplyTimers[shopId]) {
    clearInterval(autoReplyTimers[shopId]);
    delete autoReplyTimers[shopId];
  }
  const ms = Math.max(intervalMin, 5) * 60 * 1000; // 最少5分钟
  logger.info(`[KS-Reviews] 启动定时自动回复 shop=${shopId} 间隔=${intervalMin}分钟`);

  // 立即执行一次
  runAutoReply(shopId).catch(e => logger.error(`[KS-Reviews] 自动回复执行失败 shop=${shopId}`, e.message));

  autoReplyTimers[shopId] = setInterval(() => {
    runAutoReply(shopId).catch(e => logger.error(`[KS-Reviews] 自动回复执行失败 shop=${shopId}`, e.message));
  }, ms);
}

function stopAutoReplyTimer(shopId) {
  if (autoReplyTimers[shopId]) {
    clearInterval(autoReplyTimers[shopId]);
    delete autoReplyTimers[shopId];
    logger.info(`[KS-Reviews] 停止定时自动回复 shop=${shopId}`);
  }
}

async function runAutoReply(shopId) {
  logger.info(`[KS-Reviews] 开始自动回复 shop=${shopId}`);

  // 1. 先拉取最近24小时新评价
  try {
    const [[account]] = await db.query('SELECT access_token FROM ks_accounts WHERE shop_id = ? AND status = 1', [shopId]);
    if (!account) { logger.warn(`[KS-Reviews] 自动回复：店铺未授权 shop=${shopId}`); return; }

    const { ksApiPost } = require('../services/ks-sync');
    const itemTitleMap = await getItemTitleMap(shopId);
    const oneDayAgo = Date.now() - 24 * 3600000;
    let cursorTime = Date.now();
    let newCount = 0;

    for (let batch = 0; batch < 20; batch++) {
      const apiRes = await ksApiPost(account.access_token, 'open.comment.list.get', {
        pageNum: 1, pageSize: 100,
        createTimeFrom: oneDayAgo, createTimeTo: cursorTime,
      });
      if (apiRes.result !== 1 || !apiRes.data) break;
      const list = apiRes.data.rootComment || [];
      if (!list.length) break;

      for (const c of list) {
        const commentId = String(c.commentId || '');
        if (!commentId) continue;
        const itemId = String(c.itemId || '');
        try {
          const [result] = await db.query(`
            INSERT INTO ks_reviews (shop_id, comment_id, order_id, item_id, item_title, buyer_nick, star, content, images,
              quality_score, service_score, logistics_score, seller_reply, replied, reply_status, anonymous, comment_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              content = VALUES(content), quality_score = VALUES(quality_score),
              service_score = VALUES(service_score), logistics_score = VALUES(logistics_score),
              replied = VALUES(replied),
              reply_status = CASE WHEN VALUES(replied) = 1 THEN 'replied' ELSE reply_status END
          `, [
            shopId, commentId, String(c.orderId || ''), itemId,
            itemTitleMap[itemId] || '', c.anonymous ? '匿名用户' : '',
            c.qualityScore || 5, c.content || '', JSON.stringify(c.imageUrl || []),
            c.qualityScore || 5, c.serviceScore || 5, c.logisticsScore || 5,
            null, c.replied ? 1 : 0, c.replied ? 'replied' : 'pending',
            c.anonymous ? 1 : 0, c.createTime ? new Date(c.createTime) : new Date(),
          ]);
          if (result.affectedRows === 1) newCount++;
        } catch (e) {}
      }

      const lastTime = list[list.length - 1]?.createTime;
      if (!lastTime || lastTime <= oneDayAgo || list.length < 100) break;
      cursorTime = lastTime - 1;
      await new Promise(r => setTimeout(r, 200));
    }
    if (newCount > 0) logger.info(`[KS-Reviews] 自动拉取新评价 ${newCount} 条`);

    // 2. AI回复未回复评价
    const [pending] = await db.query(
      "SELECT * FROM ks_reviews WHERE shop_id = ? AND reply_status = 'pending' AND replied = 0 AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容' ORDER BY comment_time DESC LIMIT 30",
      [shopId]
    );
    if (!pending.length) { logger.info(`[KS-Reviews] 自动回复：无待回复评价`); return; }

    let success = 0, fail = 0;
    for (const review of pending) {
      let aiReply;
      try {
        aiReply = await aiGenerateReply(review.content, review.quality_score || review.star || 5);
      } catch (aiErr) {
        fail++;
        await db.query(`INSERT INTO ks_review_logs (shop_id, comment_id, order_id, buyer_nick, item_title, star, comment_content, reply_content, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [shopId, review.comment_id, review.order_id, review.buyer_nick, review.item_title, review.quality_score, review.content, '', 'ai', 'fail', 'AI生成失败: ' + aiErr.message]);
        continue;
      }

      let replyStatus = 'success', failReason = '';
      try {
        const apiRes = await ksApiPost(account.access_token, 'open.comment.add', {
          replyToCommentId: parseInt(review.comment_id), content: aiReply, sourceType: 7,
        });
        if (apiRes.result !== 1) { replyStatus = 'fail'; failReason = apiRes.error_msg || apiRes.sub_msg || ''; }
      } catch (apiErr) { replyStatus = 'fail'; failReason = apiErr.message; }

      // 无论发送成功还是失败，都保存AI生成的回复内容（方便手动复制）
      const newStatus = replyStatus === 'success' ? 'replied' : 'failed';
      await db.query('UPDATE ks_reviews SET reply_status=?, seller_reply=?, replied=CASE WHEN ?="success" THEN 1 ELSE replied END, reply_time=CASE WHEN ?="success" THEN NOW() ELSE reply_time END WHERE id=?',
        [newStatus, aiReply, replyStatus, replyStatus, review.id]);

      await db.query(`INSERT INTO ks_review_logs (shop_id, comment_id, order_id, buyer_nick, item_title, star, comment_content, reply_content, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [shopId, review.comment_id, review.order_id, review.buyer_nick, review.item_title, review.quality_score, review.content, aiReply, 'ai', replyStatus, failReason]);

      if (replyStatus === 'success') success++; else fail++;
      await new Promise(r => setTimeout(r, 800));
    }
    logger.info(`[KS-Reviews] 自动回复完成 成功=${success} 失败=${fail}`);
  } catch (e) {
    logger.error(`[KS-Reviews] 自动回复异常 shop=${shopId}`, e.message);
  }
}

// ========== 1. GET /overview — 增强统计 ==========
router.get('/overview', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN reply_status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN reply_status='replied' THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN reply_status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN quality_score >= 4 THEN 1 ELSE 0 END) AS positive,
        SUM(CASE WHEN quality_score = 3 THEN 1 ELSE 0 END) AS neutral,
        SUM(CASE WHEN quality_score <= 2 THEN 1 ELSE 0 END) AS negative,
        ROUND(AVG(quality_score), 1) AS avg_star
      FROM ks_reviews WHERE shop_id = ? AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容'
    `, [shop_id]);

    // 今日统计
    const [[todayComments]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM ks_reviews WHERE shop_id = ? AND DATE(comment_time) = CURDATE() AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容'", [shop_id]
    );
    const [[todayReplies]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM ks_review_logs WHERE shop_id = ? AND DATE(created_at) = CURDATE() AND reply_status = "success"', [shop_id]
    );
    // 昨日统计
    const [[yesterdayComments]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM ks_reviews WHERE shop_id = ? AND DATE(comment_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容'", [shop_id]
    );
    const [[yesterdayReplies]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM ks_review_logs WHERE shop_id = ? AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND reply_status = "success"', [shop_id]
    );

    const [[settings]] = await db.query(
      'SELECT auto_reply_enabled, ai_reply_enabled, auto_reply_interval FROM ks_review_settings WHERE shop_id = ?', [shop_id]
    );

    res.json({
      code: 0,
      data: {
        total: parseInt(stats?.total || 0),
        pending: parseInt(stats?.pending || 0),
        replied: parseInt(stats?.replied || 0),
        failed: parseInt(stats?.failed || 0),
        positive: parseInt(stats?.positive || 0),
        neutral: parseInt(stats?.neutral || 0),
        negative: parseInt(stats?.negative || 0),
        avg_star: parseFloat(stats?.avg_star || 0),
        today_comments: parseInt(todayComments?.cnt || 0),
        today_replies: parseInt(todayReplies?.cnt || 0),
        yesterday_comments: parseInt(yesterdayComments?.cnt || 0),
        yesterday_replies: parseInt(yesterdayReplies?.cnt || 0),
        auto_reply_enabled: settings ? !!settings.auto_reply_enabled : false,
        ai_reply_enabled: settings ? !!settings.ai_reply_enabled : false,
        auto_reply_interval: settings?.auto_reply_interval || 30,
        timer_running: !!autoReplyTimers[shop_id],
      }
    });
  } catch (e) {
    logger.error('[KS-Reviews] overview异常', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 2. GET /latest — 最新评论（滚动用） ==========
router.get('/latest', async (req, res) => {
  try {
    const { shop_id, limit = 20 } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });
    const [rows] = await db.query(
      "SELECT comment_id, buyer_nick, item_title, content, quality_score, comment_time, reply_status FROM ks_reviews WHERE shop_id = ? AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容' ORDER BY comment_time DESC LIMIT ?",
      [shop_id, Math.min(parseInt(limit) || 20, 50)]
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 3. POST /pull — 拉取评价 ==========
router.post('/pull', async (req, res) => {
  try {
    const { shop_id } = req.body;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const [[account]] = await db.query(
      'SELECT access_token FROM ks_accounts WHERE shop_id = ? AND status = 1', [shop_id]
    );
    if (!account) return res.json({ code: -1, msg: '店铺未授权' });

    const { ksApiPost } = require('../services/ks-sync');
    const itemTitleMap = await getItemTitleMap(shop_id);

    let totalPulled = 0;
    let totalNew = 0;
    const maxBatches = 300;
    const twoMonthsAgo = Date.now() - 60 * 86400000;
    let cursorTime = Date.now();
    let batchNum = 0;

    while (batchNum < maxBatches) {
      batchNum++;
      let apiRes;
      try {
        apiRes = await ksApiPost(account.access_token, 'open.comment.list.get', {
          pageNum: 1, pageSize: 100,
          createTimeFrom: twoMonthsAgo, createTimeTo: cursorTime,
        });
      } catch (apiErr) {
        logger.warn('[KS-Reviews] 评价API调用失败', apiErr.message);
        break;
      }

      if (apiRes.result !== 1 || !apiRes.data) break;
      const list = apiRes.data.rootComment || [];
      if (!list.length) break;

      for (const c of list) {
        const commentId = String(c.commentId || '');
        if (!commentId) continue;
        const itemId = String(c.itemId || '');
        const itemTitle = itemTitleMap[itemId] || '';
        const hasReply = !!(c.replied);

        try {
          const [result] = await db.query(`
            INSERT INTO ks_reviews (shop_id, comment_id, order_id, item_id, item_title, buyer_nick, star, content, images,
              quality_score, service_score, logistics_score, seller_reply, replied, reply_status, anonymous, comment_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              content = VALUES(content), quality_score = VALUES(quality_score),
              service_score = VALUES(service_score), logistics_score = VALUES(logistics_score),
              replied = VALUES(replied),
              reply_status = CASE WHEN VALUES(replied) = 1 THEN 'replied' ELSE reply_status END
          `, [
            shop_id, commentId, String(c.orderId || ''), itemId, itemTitle,
            c.anonymous ? '匿名用户' : '', c.qualityScore || 5,
            c.content || '', JSON.stringify(c.imageUrl || []),
            c.qualityScore || 5, c.serviceScore || 5, c.logisticsScore || 5,
            null, hasReply ? 1 : 0, hasReply ? 'replied' : 'pending',
            c.anonymous ? 1 : 0, c.createTime ? new Date(c.createTime) : new Date(),
          ]);
          totalPulled++;
          if (result.affectedRows === 1) totalNew++;
        } catch (dbErr) {}
      }

      const lastTime = list[list.length - 1]?.createTime;
      if (!lastTime || lastTime <= twoMonthsAgo) break;
      cursorTime = lastTime - 1;
      if (batchNum % 10 === 0) logger.info(`[KS-Reviews] 已拉取${batchNum}批，新增${totalNew}条`);
      if (list.length < 100) break;
      await new Promise(r => setTimeout(r, 200));
    }

    logger.info(`[KS-Reviews] 评价拉取完成，处理${totalPulled}条，新增${totalNew}条`);
    res.json({ code: 0, msg: `已拉取 ${totalNew} 条新评价（共处理${totalPulled}条）`, data: { pulled: totalPulled, new: totalNew } });
  } catch (e) {
    logger.error('[KS-Reviews] 拉取评价失败', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 4. GET /list ==========
router.get('/list', async (req, res) => {
  try {
    const { shop_id, page = 1, page_size = 20, status, star, keyword } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const limit = Math.min(parseInt(page_size) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    let where = "WHERE shop_id = ? AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容'";
    const params = [shop_id];

    if (status) { where += ' AND reply_status = ?'; params.push(status); }
    if (star) { where += ' AND quality_score = ?'; params.push(parseInt(star)); }
    if (keyword) { where += ' AND (content LIKE ? OR item_title LIKE ?)'; const kw = `%${keyword}%`; params.push(kw, kw); }

    const [[{ cnt }]] = await db.query(`SELECT COUNT(*) AS cnt FROM ks_reviews ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM ks_reviews ${where} ORDER BY comment_time DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ code: 0, data: { list: rows, total: parseInt(cnt), page: parseInt(page), page_size: limit } });
  } catch (e) {
    logger.error('[KS-Reviews] 获取评价列表失败', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 5. POST /reply ==========
router.post('/reply', async (req, res) => {
  try {
    const { shop_id, comment_id, content, template_id, reply_type } = req.body;
    if (!shop_id || !comment_id || !content) return res.json({ code: -1, msg: '参数不完整' });

    const [[account]] = await db.query('SELECT access_token FROM ks_accounts WHERE shop_id = ? AND status = 1', [shop_id]);
    if (!account) return res.json({ code: -1, msg: '店铺未授权' });

    const [[review]] = await db.query('SELECT * FROM ks_reviews WHERE shop_id = ? AND comment_id = ?', [shop_id, comment_id]);

    const { ksApiPost } = require('../services/ks-sync');
    let replyStatus = 'success', failReason = '';

    try {
      const apiRes = await ksApiPost(account.access_token, 'open.comment.add', {
        replyToCommentId: parseInt(comment_id), content, sourceType: 7,
      });
      if (apiRes.result !== 1) { replyStatus = 'fail'; failReason = apiRes.error_msg || apiRes.sub_msg || JSON.stringify(apiRes).slice(0, 200); }
    } catch (apiErr) { replyStatus = 'fail'; failReason = apiErr.message; }

    if (replyStatus === 'success') {
      await db.query('UPDATE ks_reviews SET reply_status=?, seller_reply=?, replied=1, reply_time=NOW() WHERE shop_id=? AND comment_id=?',
        ['replied', content, shop_id, comment_id]);
    }
    if (template_id) await db.query('UPDATE ks_review_templates SET use_count = use_count + 1 WHERE id = ?', [template_id]);

    await db.query(`INSERT INTO ks_review_logs (shop_id, comment_id, order_id, buyer_nick, item_title, star, comment_content, reply_content, template_id, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [shop_id, comment_id, review?.order_id || '', review?.buyer_nick || '', review?.item_title || '',
       review?.quality_score || 0, review?.content || '', content, template_id || null, reply_type || 'manual', replyStatus, failReason]);

    res.json(replyStatus === 'success' ? { code: 0, msg: '回复成功' } : { code: -1, msg: '回复失败: ' + failReason });
  } catch (e) {
    logger.error('[KS-Reviews] 回复评价失败', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 6. POST /ai-generate ==========
router.post('/ai-generate', async (req, res) => {
  try {
    const { content, star } = req.body;
    if (!content) return res.json({ code: -1, msg: '评价内容不能为空' });
    const reply = await aiGenerateReply(content, star || 5);
    res.json({ code: 0, data: { reply } });
  } catch (e) {
    logger.error('[KS-Reviews] AI生成失败', e.message);
    res.json({ code: -1, msg: 'AI生成失败: ' + e.message });
  }
});

// ========== 7. POST /ai-batch-reply ==========
router.post('/ai-batch-reply', async (req, res) => {
  try {
    const { shop_id } = req.body;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const [pending] = await db.query(
      "SELECT * FROM ks_reviews WHERE shop_id = ? AND reply_status = 'pending' AND replied = 0 AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容' ORDER BY comment_time DESC LIMIT 50",
      [shop_id]
    );
    if (!pending.length) return res.json({ code: 0, msg: '没有待回复的评价', data: { success: 0, fail: 0, total: 0 } });

    const [[account]] = await db.query('SELECT access_token FROM ks_accounts WHERE shop_id = ? AND status = 1', [shop_id]);
    if (!account) return res.json({ code: -1, msg: '店铺未授权' });

    const { ksApiPost } = require('../services/ks-sync');
    let successCount = 0, failCount = 0, aiFailCount = 0;

    for (const review of pending) {
      let aiReply;
      try {
        aiReply = await aiGenerateReply(review.content, review.quality_score || review.star || 5);
      } catch (aiErr) {
        aiFailCount++;
        await db.query(`INSERT INTO ks_review_logs (shop_id, comment_id, order_id, buyer_nick, item_title, star, comment_content, reply_content, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [shop_id, review.comment_id, review.order_id, review.buyer_nick, review.item_title, review.quality_score, review.content, '', 'ai', 'fail', 'AI生成失败: ' + aiErr.message]);
        continue;
      }

      let replyStatus = 'success', failReason = '';
      try {
        const apiRes = await ksApiPost(account.access_token, 'open.comment.add', {
          replyToCommentId: parseInt(review.comment_id), content: aiReply, sourceType: 7,
        });
        if (apiRes.result !== 1) { replyStatus = 'fail'; failReason = apiRes.error_msg || apiRes.sub_msg || ''; }
      } catch (apiErr) { replyStatus = 'fail'; failReason = apiErr.message; }

      // 无论成功失败都保存AI回复内容
      await db.query('UPDATE ks_reviews SET reply_status=?, seller_reply=?, replied=CASE WHEN ?="success" THEN 1 ELSE replied END, reply_time=CASE WHEN ?="success" THEN NOW() ELSE reply_time END WHERE id=?',
        [replyStatus === 'success' ? 'replied' : 'failed', aiReply, replyStatus, replyStatus, review.id]);

      await db.query(`INSERT INTO ks_review_logs (shop_id, comment_id, order_id, buyer_nick, item_title, star, comment_content, reply_content, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [shop_id, review.comment_id, review.order_id, review.buyer_nick, review.item_title, review.quality_score, review.content, aiReply, 'ai', replyStatus, failReason]);

      if (replyStatus === 'success') successCount++; else failCount++;
      await new Promise(r => setTimeout(r, 800));
    }

    res.json({
      code: 0,
      msg: `AI批量回复完成：成功 ${successCount}，发送失败 ${failCount}，AI生成失败 ${aiFailCount}`,
      data: { success: successCount, fail: failCount, ai_fail: aiFailCount, total: pending.length }
    });
  } catch (e) {
    logger.error('[KS-Reviews] AI批量回复失败', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 8. GET /settings ==========
router.get('/settings', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });
    const [[row]] = await db.query('SELECT * FROM ks_review_settings WHERE shop_id = ?', [shop_id]);
    res.json({
      code: 0,
      data: {
        auto_reply_enabled: row ? !!row.auto_reply_enabled : false,
        auto_reply_stars: row?.auto_reply_stars ? (typeof row.auto_reply_stars === 'string' ? JSON.parse(row.auto_reply_stars) : row.auto_reply_stars) : [5, 4],
        ai_reply_enabled: row ? !!row.ai_reply_enabled : false,
        auto_reply_interval: row?.auto_reply_interval || 30,
        timer_running: !!autoReplyTimers[shop_id],
      }
    });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 9. POST /settings ==========
router.post('/settings', async (req, res) => {
  try {
    const { shop_id, auto_reply_enabled, auto_reply_stars, ai_reply_enabled, auto_reply_interval } = req.body;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });
    const interval = Math.max(parseInt(auto_reply_interval) || 30, 5);
    await db.query(`
      INSERT INTO ks_review_settings (shop_id, auto_reply_enabled, auto_reply_stars, ai_reply_enabled, auto_reply_interval)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE auto_reply_enabled = VALUES(auto_reply_enabled), auto_reply_stars = VALUES(auto_reply_stars), ai_reply_enabled = VALUES(ai_reply_enabled), auto_reply_interval = VALUES(auto_reply_interval)
    `, [shop_id, auto_reply_enabled ? 1 : 0, JSON.stringify(auto_reply_stars || [5, 4]), ai_reply_enabled ? 1 : 0, interval]);

    // 管理定时器
    if (ai_reply_enabled) {
      startAutoReplyTimer(shop_id, interval);
    } else {
      stopAutoReplyTimer(shop_id);
    }

    res.json({ code: 0, msg: '设置已保存', data: { timer_running: !!autoReplyTimers[shop_id] } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 10. CRUD /templates ==========
router.get('/templates', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });
    const [rows] = await db.query('SELECT * FROM ks_review_templates WHERE shop_id = ? ORDER BY is_default DESC, use_count DESC, id ASC', [shop_id]);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

router.post('/templates', async (req, res) => {
  try {
    const { id, shop_id, name, content, star_min, star_max, is_default } = req.body;
    if (!shop_id || !content) return res.json({ code: -1, msg: '参数不完整' });
    if (id) {
      await db.query('UPDATE ks_review_templates SET name=?, content=?, star_min=?, star_max=?, is_default=? WHERE id=? AND shop_id=?',
        [name || '', content, star_min || 1, star_max || 5, is_default ? 1 : 0, id, shop_id]);
    } else {
      await db.query('INSERT INTO ks_review_templates (shop_id, name, content, star_min, star_max, is_default) VALUES (?,?,?,?,?,?)',
        [shop_id, name || '', content, star_min || 1, star_max || 5, is_default ? 1 : 0]);
    }
    res.json({ code: 0, msg: '模板已保存' });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM ks_review_templates WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

// ========== 11. GET /logs ==========
router.get('/logs', async (req, res) => {
  try {
    const { shop_id, page = 1, page_size = 20, reply_type, reply_status } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const limit = Math.min(parseInt(page_size) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    let where = 'WHERE shop_id = ?';
    const params = [shop_id];
    if (reply_type) { where += ' AND reply_type = ?'; params.push(reply_type); }
    if (reply_status) { where += ' AND reply_status = ?'; params.push(reply_status); }

    const [[{ cnt }]] = await db.query(`SELECT COUNT(*) AS cnt FROM ks_review_logs ${where}`, params);
    const [rows] = await db.query(`SELECT * FROM ks_review_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

    const [[stats]] = await db.query(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN reply_type='auto' THEN 1 ELSE 0 END) AS auto_cnt,
        SUM(CASE WHEN reply_type='manual' THEN 1 ELSE 0 END) AS manual_cnt,
        SUM(CASE WHEN reply_type='ai' THEN 1 ELSE 0 END) AS ai_cnt,
        SUM(CASE WHEN reply_status='success' THEN 1 ELSE 0 END) AS success_cnt,
        SUM(CASE WHEN reply_status='fail' THEN 1 ELSE 0 END) AS fail_cnt
      FROM ks_review_logs WHERE shop_id = ?
    `, [shop_id]);

    res.json({
      code: 0,
      data: {
        list: rows, total: parseInt(cnt), page: parseInt(page), page_size: limit,
        stats: {
          total: parseInt(stats?.total || 0), auto: parseInt(stats?.auto_cnt || 0),
          manual: parseInt(stats?.manual_cnt || 0), ai: parseInt(stats?.ai_cnt || 0),
          success: parseInt(stats?.success_cnt || 0), fail: parseInt(stats?.fail_cnt || 0),
        }
      }
    });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

// ========== 12. POST /batch-reply ==========
router.post('/batch-reply', async (req, res) => {
  try {
    const { shop_id } = req.body;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    const [templates] = await db.query('SELECT * FROM ks_review_templates WHERE shop_id = ? ORDER BY is_default DESC', [shop_id]);
    if (!templates.length) return res.json({ code: -1, msg: '请先添加回复模板' });

    const [pending] = await db.query(
      "SELECT * FROM ks_reviews WHERE shop_id = ? AND reply_status = 'pending' AND replied = 0 AND content != '' AND content NOT LIKE '%没有填写评价%' AND content != '此用户未填写评价内容' ORDER BY comment_time DESC LIMIT 50",
      [shop_id]
    );
    if (!pending.length) return res.json({ code: 0, msg: '没有待回复的评价', data: { success: 0, fail: 0 } });

    const [[account]] = await db.query('SELECT access_token FROM ks_accounts WHERE shop_id = ? AND status = 1', [shop_id]);
    if (!account) return res.json({ code: -1, msg: '店铺未授权' });

    const { ksApiPost } = require('../services/ks-sync');
    let successCount = 0, failCount = 0;

    for (const review of pending) {
      const matchedTpl = templates.find(t => review.quality_score >= t.star_min && review.quality_score <= t.star_max) || templates[0];
      let replyStatus = 'success', failReason = '';
      try {
        const apiRes = await ksApiPost(account.access_token, 'open.comment.add', {
          replyToCommentId: parseInt(review.comment_id), content: matchedTpl.content, sourceType: 7,
        });
        if (apiRes.result !== 1) { replyStatus = 'fail'; failReason = apiRes.error_msg || apiRes.sub_msg || ''; }
      } catch (apiErr) { replyStatus = 'fail'; failReason = apiErr.message; }

      await db.query('UPDATE ks_reviews SET reply_status=?, seller_reply=?, replied=CASE WHEN ?="success" THEN 1 ELSE replied END, reply_time=CASE WHEN ?="success" THEN NOW() ELSE reply_time END WHERE id=?',
        [replyStatus === 'success' ? 'replied' : 'failed', replyStatus === 'success' ? matchedTpl.content : review.seller_reply, replyStatus, replyStatus, review.id]);
      await db.query('UPDATE ks_review_templates SET use_count = use_count + 1 WHERE id = ?', [matchedTpl.id]);
      await db.query(`INSERT INTO ks_review_logs (shop_id, comment_id, order_id, buyer_nick, item_title, star, comment_content, reply_content, template_id, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [shop_id, review.comment_id, review.order_id, review.buyer_nick, review.item_title, review.quality_score, review.content, matchedTpl.content, matchedTpl.id, 'auto', replyStatus, failReason]);

      if (replyStatus === 'success') successCount++; else failCount++;
      await new Promise(r => setTimeout(r, 500));
    }

    res.json({ code: 0, msg: `批量回复完成：成功 ${successCount}，失败 ${failCount}`, data: { success: successCount, fail: failCount } });
  } catch (e) {
    logger.error('[KS-Reviews] 批量回复失败', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
