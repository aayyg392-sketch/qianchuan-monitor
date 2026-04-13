/**
 * 快手磁力 - 素材评论管理 API
 * 独立于商品评价(ks-reviews)，专门管理磁力广告视频下的用户评论
 *
 * 磁力API Base: https://ad.e.kuaishou.com/rest/openapi
 * - /v1/comment/list    评论列表
 * - /v1/comment/reply   回复评论
 * - /v1/comment/tree    评论树
 * - /v1/comment/shield  屏蔽评论
 */
const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const auth = require('../middleware/auth');

const router = require('express').Router();
const BASE = 'https://ad.e.kuaishou.com/rest/openapi';

// ========== 自动建表 ==========
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_ad_comments (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(50) NOT NULL,
        shop_id VARCHAR(64) DEFAULT '',
        comment_id VARCHAR(64) NOT NULL,
        photo_id VARCHAR(64) DEFAULT '',
        photo_title VARCHAR(255) DEFAULT '',
        nickname VARCHAR(100) DEFAULT '',
        content TEXT,
        post_time DATETIME,
        fav_num INT DEFAULT 0,
        comment_level INT DEFAULT 1,
        shield_status INT DEFAULT 1,
        reply_content TEXT,
        replied TINYINT(1) DEFAULT 0,
        reply_time DATETIME,
        reply_type ENUM('auto','manual','ai') DEFAULT 'manual',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_adv_comment (advertiser_id, comment_id),
        INDEX idx_shop (shop_id),
        INDEX idx_replied (replied),
        INDEX idx_post_time (post_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_ad_comment_settings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(64) NOT NULL,
        auto_reply_enabled TINYINT(1) DEFAULT 0,
        ai_reply_enabled TINYINT(1) DEFAULT 0,
        auto_reply_interval INT DEFAULT 30 COMMENT '自动回复间隔(分钟)',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_shop (shop_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ks_ad_comment_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(50) NOT NULL,
        shop_id VARCHAR(64) DEFAULT '',
        comment_id VARCHAR(64) NOT NULL,
        photo_id VARCHAR(64) DEFAULT '',
        nickname VARCHAR(100) DEFAULT '',
        comment_content TEXT,
        reply_content TEXT NOT NULL,
        reply_type ENUM('auto','manual','ai') DEFAULT 'manual',
        reply_status ENUM('success','fail') DEFAULT 'success',
        fail_reason VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shop_time (shop_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    logger.info('[KS-AD-Comments] 表结构就绪');
  } catch (e) {
    logger.error('[KS-AD-Comments] 建表失败: ' + e.message);
  }
})();

// ========== 工具函数 ==========
async function getAdAccountsByShop(shopId) {
  if (shopId) {
    const [rows] = await db.query('SELECT * FROM ks_ad_accounts WHERE status = 1 AND shop_id = ?', [shopId]);
    return rows;
  }
  const [rows] = await db.query('SELECT * FROM ks_ad_accounts WHERE status = 1 AND shop_id != ""');
  return rows;
}

async function ksAdApi(path, token, data) {
  try {
    const res = await axios.post(`${BASE}${path}`, data, {
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return res.data;
  } catch (e) {
    logger.error(`[KS-AD-Comments] API ${path} 失败: ` + e.message);
    return { code: -1, message: e.message };
  }
}

// ========== AI回复生成 ==========
async function aiGenerateReply(commentContent) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = 'claude-haiku-4-5-20251001';
  if (!apiKey) throw new Error('未配置OPENAI_API_KEY');

  const resp = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      {
        role: 'system',
        content: `你是"雪玲妃"品牌的广告互动专员，负责回复快手广告视频下的用户评论。

回复要求：
1. 语气热情、亲切、接地气，带点东北味儿（"老铁"、"姐"、"妹子"等）
2. 针对评论内容回复，不千篇一律
3. 如果是正面评论/询问，热情回应，引导下单
4. 如果是负面评论，真诚回应，引导私信客服
5. 如果是询价/咨询，简短引导点击购买链接
6. 回复控制在20-60字，简洁有力
7. 不要使用emoji表情
8. 像朋友聊天一样自然`
      },
      {
        role: 'user',
        content: `广告视频评论：${commentContent}\n\n请生成回复：`
      }
    ],
    temperature: 0.7,
    max_tokens: 150,
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const reply = (resp.data?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('AI返回空内容');
  return reply;
}

// ========== 路由 ==========
router.use(auth());

/**
 * GET /api/ks-ad-comments/list
 * 查询磁力评论列表（从本地DB）
 */
router.get('/list', async (req, res) => {
  try {
    const { shop_id, replied, page = 1, page_size = 20 } = req.query;
    const limit = Math.min(parseInt(page_size) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    if (shop_id) { where += ' AND c.shop_id = ?'; params.push(shop_id); }
    if (replied === '0') { where += ' AND c.replied = 0'; }
    else if (replied === '1') { where += ' AND c.replied = 1'; }

    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM ks_ad_comments c ${where}`, params);
    const [rows] = await db.query(`
      SELECT c.*, a.advertiser_name
      FROM ks_ad_comments c
      LEFT JOIN ks_ad_accounts a ON c.advertiser_id = a.advertiser_id
      ${where}
      ORDER BY c.post_time DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // 统计
    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN replied = 0 THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN replied = 1 THEN 1 ELSE 0 END) as replied_count
      FROM ks_ad_comments c ${shop_id ? 'WHERE shop_id = ?' : ''}
    `, shop_id ? [shop_id] : []);

    res.json({ code: 0, data: { list: rows, total, stats, page: parseInt(page), page_size: limit } });
  } catch (e) {
    logger.error('[KS-AD-Comments] list: ' + e.message);
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad-comments/sync
 * 从磁力API拉取最新评论
 */
router.post('/sync', async (req, res) => {
  try {
    const { shop_id } = req.body;
    const accounts = await getAdAccountsByShop(shop_id);
    if (!accounts.length) return res.json({ code: -1, msg: '暂无已关联店铺的磁力账户' });

    let totalSynced = 0;
    const now = Date.now();
    const threeDaysAgo = now - 3 * 86400000;

    for (const acc of accounts) {
      try {
        await new Promise(r => setTimeout(r, 300));
        const r = await ksAdApi('/v1/comment/list', acc.access_token, {
          advertiser_id: Number(acc.advertiser_id),
          post_time_start: threeDaysAgo,
          post_time_end: now,
          reply_status: 0, // 所有状态
          page: 1,
          page_size: 100,
        });

        if (r.code === 0 && r.data?.details?.length) {
          for (const c of r.data.details) {
            const postTime = c.post_time ? new Date(c.post_time) : new Date();
            await db.query(`
              INSERT INTO ks_ad_comments (advertiser_id, shop_id, comment_id, photo_id, photo_title,
                nickname, content, post_time, fav_num, comment_level, shield_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                content=VALUES(content), fav_num=VALUES(fav_num),
                shield_status=VALUES(shield_status), photo_title=VALUES(photo_title)
            `, [
              acc.advertiser_id, acc.shop_id || '',
              String(c.comment_id), String(c.photo_id || ''), c.photo_title || '',
              c.nickname || '', c.comment_content || '',
              postTime, c.fav_num || 0, c.comment_level || 1, c.shield_status || 1
            ]);
            totalSynced++;
          }
          logger.info(`[KS-AD-Comments] ${acc.advertiser_id} 同步 ${r.data.details.length} 条评论`);
        } else if (r.code !== 0) {
          logger.warn(`[KS-AD-Comments] ${acc.advertiser_id} 拉取失败: code=${r.code} msg=${r.message}`);
        }
      } catch (e) {
        logger.warn(`[KS-AD-Comments] ${acc.advertiser_id} 同步异常: ${e.message}`);
      }
    }

    res.json({ code: 0, msg: `已同步 ${totalSynced} 条评论` });
  } catch (e) {
    logger.error('[KS-AD-Comments] sync: ' + e.message);
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad-comments/reply
 * 回复评论（手动 / AI）
 */
router.post('/reply', async (req, res) => {
  try {
    const { comment_id, reply_content, use_ai } = req.body;
    if (!comment_id) return res.json({ code: -1, msg: '缺少comment_id' });

    // 查评论
    const [[comment]] = await db.query('SELECT * FROM ks_ad_comments WHERE comment_id = ?', [comment_id]);
    if (!comment) return res.json({ code: -1, msg: '评论不存在' });

    // 获取token
    const [accs] = await db.query('SELECT * FROM ks_ad_accounts WHERE advertiser_id = ? AND status = 1', [comment.advertiser_id]);
    if (!accs.length) return res.json({ code: -1, msg: '对应广告账户未授权' });
    const acc = accs[0];

    // 生成回复内容
    let finalReply = reply_content;
    let replyType = 'manual';
    if (use_ai || !reply_content) {
      finalReply = await aiGenerateReply(comment.content);
      replyType = 'ai';
    }

    // 调磁力API回复
    // 需要 photo_author_id（视频作者），从评论树获取
    let photoAuthorId = 0;
    try {
      const treeRes = await ksAdApi('/v1/comment/tree', acc.access_token, {
        advertiser_id: Number(acc.advertiser_id),
        comment_id: Number(comment.comment_id),
      });
      if (treeRes.code === 0 && treeRes.data?.root_comment_detail) {
        photoAuthorId = treeRes.data.root_comment_detail.photo_author_id || 0;
      }
    } catch (e) { /* ignore */ }

    const apiRes = await ksAdApi('/v1/comment/reply', acc.access_token, {
      advertiser_id: Number(acc.advertiser_id),
      reply_list: [{
        reply_to_comment_id: Number(comment.comment_id),
        photo_id: Number(comment.photo_id),
        photo_author_id: photoAuthorId,
        reply_to_user_id: 0,
        reply_content: finalReply,
      }]
    });

    const success = apiRes.code === 0;
    const failReason = success ? '' : (apiRes.message || 'API调用失败');

    // 更新评论状态
    if (success) {
      await db.query('UPDATE ks_ad_comments SET replied=1, reply_content=?, reply_time=NOW(), reply_type=? WHERE comment_id=?',
        [finalReply, replyType, comment_id]);
    }

    // 写日志
    await db.query(`
      INSERT INTO ks_ad_comment_logs (advertiser_id, shop_id, comment_id, photo_id, nickname, comment_content, reply_content, reply_type, reply_status, fail_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [comment.advertiser_id, comment.shop_id, comment_id, comment.photo_id, comment.nickname, comment.content, finalReply, replyType, success ? 'success' : 'fail', failReason]);

    res.json({ code: success ? 0 : -1, msg: success ? '回复成功' : failReason, data: { reply_content: finalReply } });
  } catch (e) {
    logger.error('[KS-AD-Comments] reply: ' + e.message);
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad-comments/batch-reply
 * 批量AI回复未回复评论
 */
router.post('/batch-reply', async (req, res) => {
  try {
    const { shop_id, limit = 20 } = req.body;
    let where = 'WHERE replied = 0 AND shield_status = 1';
    const params = [];
    if (shop_id) { where += ' AND shop_id = ?'; params.push(shop_id); }

    const [comments] = await db.query(`SELECT * FROM ks_ad_comments ${where} ORDER BY post_time DESC LIMIT ?`, [...params, Math.min(parseInt(limit) || 20, 50)]);
    if (!comments.length) return res.json({ code: 0, msg: '没有待回复评论', data: { success: 0, fail: 0 } });

    let success = 0, fail = 0;
    for (const comment of comments) {
      try {
        await new Promise(r => setTimeout(r, 1000)); // 限速

        const [accs] = await db.query('SELECT * FROM ks_ad_accounts WHERE advertiser_id = ? AND status = 1', [comment.advertiser_id]);
        if (!accs.length) { fail++; continue; }
        const acc = accs[0];

        const finalReply = await aiGenerateReply(comment.content);

        let photoAuthorId = 0;
        try {
          const treeRes = await ksAdApi('/v1/comment/tree', acc.access_token, {
            advertiser_id: Number(acc.advertiser_id),
            comment_id: Number(comment.comment_id),
          });
          if (treeRes.code === 0 && treeRes.data?.root_comment_detail) {
            photoAuthorId = treeRes.data.root_comment_detail.photo_author_id || 0;
          }
        } catch (e) { /* ignore */ }

        const apiRes = await ksAdApi('/v1/comment/reply', acc.access_token, {
          advertiser_id: Number(acc.advertiser_id),
          reply_list: [{
            reply_to_comment_id: Number(comment.comment_id),
            photo_id: Number(comment.photo_id),
            photo_author_id: photoAuthorId,
            reply_to_user_id: 0,
            reply_content: finalReply,
          }]
        });

        const ok = apiRes.code === 0;
        if (ok) {
          await db.query('UPDATE ks_ad_comments SET replied=1, reply_content=?, reply_time=NOW(), reply_type="ai" WHERE comment_id=?', [finalReply, comment.comment_id]);
          success++;
        } else { fail++; }

        await db.query(`INSERT INTO ks_ad_comment_logs (advertiser_id, shop_id, comment_id, photo_id, nickname, comment_content, reply_content, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [comment.advertiser_id, comment.shop_id, comment.comment_id, comment.photo_id, comment.nickname, comment.content, finalReply, 'ai', ok ? 'success' : 'fail', ok ? '' : (apiRes.message || '')]);
      } catch (e) {
        fail++;
        logger.warn(`[KS-AD-Comments] batch-reply ${comment.comment_id}: ${e.message}`);
      }
    }

    res.json({ code: 0, msg: `回复完成：成功${success}条，失败${fail}条`, data: { success, fail } });
  } catch (e) {
    logger.error('[KS-AD-Comments] batch-reply: ' + e.message);
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ks-ad-comments/shield
 * 屏蔽评论
 */
router.post('/shield', async (req, res) => {
  try {
    const { comment_id } = req.body;
    if (!comment_id) return res.json({ code: -1, msg: '缺少comment_id' });

    const [[comment]] = await db.query('SELECT * FROM ks_ad_comments WHERE comment_id = ?', [comment_id]);
    if (!comment) return res.json({ code: -1, msg: '评论不存在' });

    const [accs] = await db.query('SELECT * FROM ks_ad_accounts WHERE advertiser_id = ? AND status = 1', [comment.advertiser_id]);
    if (!accs.length) return res.json({ code: -1, msg: '账户未授权' });

    const apiRes = await ksAdApi('/v1/comment/shield', accs[0].access_token, {
      advertiser_id: Number(comment.advertiser_id),
      shield_list: [{ comment_id: Number(comment_id), photo_id: Number(comment.photo_id) }],
    });

    if (apiRes.code === 0) {
      await db.query('UPDATE ks_ad_comments SET shield_status = 2 WHERE comment_id = ?', [comment_id]);
    }

    res.json({ code: apiRes.code === 0 ? 0 : -1, msg: apiRes.code === 0 ? '已屏蔽' : (apiRes.message || '屏蔽失败') });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ks-ad-comments/logs
 * 回复日志
 */
router.get('/logs', async (req, res) => {
  try {
    const { shop_id, page = 1, page_size = 20 } = req.query;
    const limit = Math.min(parseInt(page_size) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    let where = '';
    const params = [];
    if (shop_id) { where = 'WHERE shop_id = ?'; params.push(shop_id); }

    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM ks_ad_comment_logs ${where}`, params);
    const [rows] = await db.query(`SELECT * FROM ks_ad_comment_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

    res.json({ code: 0, data: { list: rows, total, page: parseInt(page), page_size: limit } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ks-ad-comments/settings
 * POST /api/ks-ad-comments/settings
 */
router.get('/settings', async (req, res) => {
  try {
    const { shop_id } = req.query;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });
    const [[row]] = await db.query('SELECT * FROM ks_ad_comment_settings WHERE shop_id = ?', [shop_id]);
    res.json({ code: 0, data: row || { shop_id, auto_reply_enabled: 0, ai_reply_enabled: 0, auto_reply_interval: 30 } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { shop_id, auto_reply_enabled, ai_reply_enabled, auto_reply_interval } = req.body;
    if (!shop_id) return res.json({ code: -1, msg: 'shop_id必填' });

    await db.query(`
      INSERT INTO ks_ad_comment_settings (shop_id, auto_reply_enabled, ai_reply_enabled, auto_reply_interval)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE auto_reply_enabled=VALUES(auto_reply_enabled), ai_reply_enabled=VALUES(ai_reply_enabled), auto_reply_interval=VALUES(auto_reply_interval)
    `, [shop_id, auto_reply_enabled ? 1 : 0, ai_reply_enabled ? 1 : 0, auto_reply_interval || 30]);

    // 管理定时任务
    if (ai_reply_enabled) {
      startAutoReplyTimer(shop_id, auto_reply_interval || 30);
    } else {
      stopAutoReplyTimer(shop_id);
    }

    res.json({ code: 0, msg: '设置已保存' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ========== 定时自动回复引擎 ==========
let adCommentTimers = {};

function startAutoReplyTimer(shopId, intervalMin) {
  if (adCommentTimers[shopId]) {
    clearInterval(adCommentTimers[shopId]);
    delete adCommentTimers[shopId];
  }
  const ms = Math.max(intervalMin, 5) * 60 * 1000;
  logger.info(`[KS-AD-Comments] 启动自动回复 shop=${shopId} 间隔=${intervalMin}分钟`);

  // 立即执行一次
  runAutoReply(shopId).catch(e => logger.error(`[KS-AD-Comments] 自动回复失败 shop=${shopId}: ${e.message}`));

  adCommentTimers[shopId] = setInterval(() => {
    runAutoReply(shopId).catch(e => logger.error(`[KS-AD-Comments] 自动回复失败 shop=${shopId}: ${e.message}`));
  }, ms);
}

function stopAutoReplyTimer(shopId) {
  if (adCommentTimers[shopId]) {
    clearInterval(adCommentTimers[shopId]);
    delete adCommentTimers[shopId];
    logger.info(`[KS-AD-Comments] 停止自动回复 shop=${shopId}`);
  }
}

async function runAutoReply(shopId) {
  // 先同步最新评论
  const accounts = await getAdAccountsByShop(shopId);
  const now = Date.now();
  const oneDayAgo = now - 86400000;

  for (const acc of accounts) {
    try {
      await new Promise(r => setTimeout(r, 300));
      const r = await ksAdApi('/v1/comment/list', acc.access_token, {
        advertiser_id: Number(acc.advertiser_id),
        post_time_start: oneDayAgo,
        post_time_end: now,
        reply_status: 1, // 未回复
        page: 1, page_size: 50,
      });

      if (r.code === 0 && r.data?.details?.length) {
        for (const c of r.data.details) {
          const postTime = c.post_time ? new Date(c.post_time) : new Date();
          await db.query(`
            INSERT INTO ks_ad_comments (advertiser_id, shop_id, comment_id, photo_id, photo_title, nickname, content, post_time, fav_num, comment_level, shield_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE content=VALUES(content), fav_num=VALUES(fav_num), shield_status=VALUES(shield_status)
          `, [acc.advertiser_id, shopId, String(c.comment_id), String(c.photo_id || ''), c.photo_title || '', c.nickname || '', c.comment_content || '', postTime, c.fav_num || 0, c.comment_level || 1, c.shield_status || 1]);
        }
      }
    } catch (e) { /* ignore */ }
  }

  // AI回复未回复评论
  const [pending] = await db.query('SELECT * FROM ks_ad_comments WHERE shop_id = ? AND replied = 0 AND shield_status = 1 ORDER BY post_time DESC LIMIT 20', [shopId]);

  let replied = 0;
  for (const comment of pending) {
    try {
      await new Promise(r => setTimeout(r, 1500));
      const [accs] = await db.query('SELECT * FROM ks_ad_accounts WHERE advertiser_id = ? AND status = 1', [comment.advertiser_id]);
      if (!accs.length) continue;
      const acc = accs[0];

      const finalReply = await aiGenerateReply(comment.content);

      let photoAuthorId = 0;
      try {
        const treeRes = await ksAdApi('/v1/comment/tree', acc.access_token, { advertiser_id: Number(acc.advertiser_id), comment_id: Number(comment.comment_id) });
        if (treeRes.code === 0 && treeRes.data?.root_comment_detail) photoAuthorId = treeRes.data.root_comment_detail.photo_author_id || 0;
      } catch (e) { /* ignore */ }

      const apiRes = await ksAdApi('/v1/comment/reply', acc.access_token, {
        advertiser_id: Number(acc.advertiser_id),
        reply_list: [{ reply_to_comment_id: Number(comment.comment_id), photo_id: Number(comment.photo_id), photo_author_id: photoAuthorId, reply_to_user_id: 0, reply_content: finalReply }]
      });

      const ok = apiRes.code === 0;
      if (ok) {
        await db.query('UPDATE ks_ad_comments SET replied=1, reply_content=?, reply_time=NOW(), reply_type="ai" WHERE comment_id=?', [finalReply, comment.comment_id]);
        replied++;
      }

      await db.query(`INSERT INTO ks_ad_comment_logs (advertiser_id, shop_id, comment_id, photo_id, nickname, comment_content, reply_content, reply_type, reply_status, fail_reason) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [comment.advertiser_id, shopId, comment.comment_id, comment.photo_id, comment.nickname, comment.content, finalReply, 'ai', ok ? 'success' : 'fail', ok ? '' : (apiRes.message || '')]);
    } catch (e) {
      logger.warn(`[KS-AD-Comments] auto-reply ${comment.comment_id}: ${e.message}`);
    }
  }

  if (replied > 0) logger.info(`[KS-AD-Comments] 自动回复 shop=${shopId} 完成${replied}条`);
}

// 启动时恢复定时任务
setTimeout(async () => {
  try {
    const [settings] = await db.query('SELECT * FROM ks_ad_comment_settings WHERE ai_reply_enabled = 1');
    for (const s of settings) {
      startAutoReplyTimer(s.shop_id, s.auto_reply_interval || 30);
    }
    if (settings.length) logger.info(`[KS-AD-Comments] 恢复 ${settings.length} 个店铺自动回复`);
  } catch (e) { /* ignore first run */ }
}, 8000);

module.exports = router;
