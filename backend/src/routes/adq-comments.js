/**
 * 腾讯广告 ADQ 视频号广告评论管理路由
 * 评论列表、自动回复、删除、精选
 */
const router = require('express').Router();
const db = require('../db');
const logger = require('../logger');
const auth = require('../middleware/auth');
const adq = require('../services/adq-sync');

// 自动回复规则表
async function ensureReplyRulesTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS adq_comment_reply_rules (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      account_db_id BIGINT NOT NULL,
      keyword VARCHAR(200) DEFAULT '' COMMENT '关键词匹配（空=全部匹配）',
      sentiment VARCHAR(20) DEFAULT '' COMMENT '情感倾向筛选: positive/negative/neutral',
      reply_content TEXT NOT NULL COMMENT '回复内容',
      is_active TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_account (account_db_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
let rulesTableReady = false;

router.use(async (req, res, next) => {
  if (!rulesTableReady) { try { await ensureReplyRulesTable(); rulesTableReady = true; } catch (e) {} }
  next();
});

/**
 * GET /api/adq-comments/list — 拉取评论列表
 */
router.get('/list', auth(), async (req, res) => {
  try {
    const { account_db_id, finder_ad_object_id, keyword, page, page_size } = req.query;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.getComments(token, rows[0].account_id, {
      finder_ad_object_id,
      keyword,
      page: +page || 1,
      page_size: +page_size || 20,
    });
    res.json({ code: 0, data });
  } catch (e) {
    logger.error('ADQ评论查询失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-comments/reply — 回复评论
 */
router.post('/reply', auth(), async (req, res) => {
  try {
    const { account_db_id, finder_ad_object_id, comment_id, content } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.replyComment(token, rows[0].account_id, finder_ad_object_id, comment_id, content);
    res.json({ code: 0, data, msg: '回复成功' });
  } catch (e) {
    logger.error('ADQ评论回复失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-comments/delete — 删除评论
 */
router.post('/delete', auth(), async (req, res) => {
  try {
    const { account_db_id, finder_ad_object_id, comment_id } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.deleteComment(token, rows[0].account_id, finder_ad_object_id, comment_id);
    res.json({ code: 0, data, msg: '删除成功' });
  } catch (e) {
    logger.error('ADQ评论删除失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-comments/featured — 精选/取消精选评论
 */
router.post('/featured', auth(), async (req, res) => {
  try {
    const { account_db_id, finder_ad_object_id, comment_id, op_type } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.toggleFeaturedComment(token, rows[0].account_id, finder_ad_object_id, comment_id, op_type);
    res.json({ code: 0, data, msg: op_type === 'ADD' ? '已精选' : '已取消精选' });
  } catch (e) {
    logger.error('ADQ精选评论操作失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-comments/recent — 拉取AI接管账户的最新评论（大屏用）
 */
router.get('/recent', auth(), async (req, res) => {
  try {
    // 找出所有AI接管的账户
    const [rules] = await db.query(
      "SELECT rule_config FROM ai_rules WHERE rule_type='ai_takeover' AND is_active=1"
    );
    if (!rules.length) return res.json({ code: 0, data: [] });

    const accountDbIds = new Set();
    for (const r of rules) {
      try {
        const cfg = typeof r.rule_config === 'string' ? JSON.parse(r.rule_config) : r.rule_config;
        if (cfg.accountDbId) accountDbIds.add(cfg.accountDbId);
      } catch {}
    }
    if (!accountDbIds.size) return res.json({ code: 0, data: [] });

    const allComments = [];
    for (const dbId of accountDbIds) {
      try {
        const [accs] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [dbId]);
        if (!accs.length) continue;
        const token = await adq.getValidToken(dbId);

        // 先拉广告动态列表
        const objRes = await adq.adqApiCall(token, 'finder_ad_object_list/get', 'GET', {
          account_id: accs[0].account_id,
          page: 1,
          page_size: 10,
        }, accs[0].account_id);

        const objects = objRes?.list || objRes?.data?.list || [];
        if (!objects.length) continue;

        // 每个动态拉最新评论
        for (const obj of objects.slice(0, 5)) {
          try {
            const cmtRes = await adq.getComments(token, accs[0].account_id, {
              finder_ad_object_id: obj.finder_ad_object_id,
              page: 1,
              page_size: 10,
            });
            const cmts = cmtRes?.list || cmtRes?.data?.list || [];
            cmts.forEach(c => {
              allComments.push({
                nick: c.nick_name || c.author_name || '用户',
                content: c.content || '',
                time: c.created_time || 0,
                reply: c.author_replys?.length ? c.author_replys[0].content : '',
                account_id: accs[0].account_id,
                comment_id: c.comment_id,
              });
            });
          } catch {}
        }
      } catch (e) {
        logger.warn('拉取账户评论失败', { dbId, error: e.message });
      }
    }

    // 按时间倒序
    allComments.sort((a, b) => b.time - a.time);
    res.json({ code: 0, data: allComments.slice(0, 30) });
  } catch (e) {
    logger.error('拉取最新评论失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

// ============ 自动回复规则管理 ============

/**
 * GET /api/adq-comments/rules — 获取自动回复规则
 */
router.get('/rules', auth(), async (req, res) => {
  try {
    const { account_db_id } = req.query;
    const [rows] = await db.query(
      'SELECT * FROM adq_comment_reply_rules WHERE account_db_id = ? ORDER BY created_at DESC',
      [account_db_id]
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-comments/rules — 添加自动回复规则
 */
router.post('/rules', auth(), async (req, res) => {
  try {
    const { account_db_id, keyword, sentiment, reply_content } = req.body;
    if (!reply_content) return res.json({ code: -1, msg: '回复内容不能为空' });
    await db.query(
      'INSERT INTO adq_comment_reply_rules (account_db_id, keyword, sentiment, reply_content) VALUES (?, ?, ?, ?)',
      [account_db_id, keyword || '', sentiment || '', reply_content]
    );
    res.json({ code: 0, msg: '规则添加成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * DELETE /api/adq-comments/rules/:id — 删除规则
 */
router.delete('/rules/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM adq_comment_reply_rules WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '规则删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
