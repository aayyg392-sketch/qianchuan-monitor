const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const dayjs = require('dayjs');

const OE_API_BASE = 'https://ad.oceanengine.com/open_api';

const RISK_LIMITS = {
  replyPerMinute: 5,
  replyPerHour: 80,
  replyPerDay: 200,
  intervalMin: 10,
  intervalMax: 60,
};

/**
 * 随机延迟（风控用）
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInterval() {
  const min = RISK_LIMITS.intervalMin * 1000;
  const max = RISK_LIMITS.intervalMax * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 获取巨量营销配置
 */
async function getMarketingConfig() {
  const [rows] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('marketing_app_id','marketing_app_secret')");
  const config = {};
  rows.forEach(r => { config[r.setting_key] = r.setting_value; });
  return { appId: config.marketing_app_id, appSecret: config.marketing_app_secret };
}

/**
 * 获取活跃账户的access_token，过期自动刷新
 */
async function getAccessToken() {
  try {
    const [accounts] = await db.query('SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM marketing_accounts WHERE status = 1 ORDER BY updated_at DESC LIMIT 1');
    if (!accounts || accounts.length === 0) {
      // Fallback to qc_accounts if no marketing account
      const [qcAccounts] = await db.query('SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM qc_accounts WHERE status = 1 LIMIT 1');
      if (!qcAccounts || qcAccounts.length === 0) { logger.warn('[CommentSync] 无可用账户'); return null; }
      return { advertiserId: qcAccounts[0].advertiser_id, accessToken: qcAccounts[0].access_token };
    }
    const account = accounts[0];
    let accessToken = account.access_token;
    // Check expiration - refresh if expires within 2 hours
    if (account.token_expires_at && dayjs(account.token_expires_at).subtract(2, 'hour').isBefore(dayjs())) {
      logger.info('[CommentSync] 巨量营销Token即将过期，自动刷新');
      accessToken = await refreshMarketingToken(account);
    }
    return { advertiserId: account.advertiser_id, accessToken };
  } catch (e) {
    logger.error('[CommentSync] 获取Token失败', { error: e.message });
    return null;
  }
}

/**
 * 刷新巨量营销Token
 */
async function refreshMarketingToken(account) {
  try {
    const { appId, appSecret } = await getMarketingConfig();
    if (!appId || !appSecret) { logger.error('[CommentSync] 巨量营销配置缺失'); return account.access_token; }
    const resp = await axios.post(`${OE_API_BASE}/oauth2/refresh_token/`, {
      appid: appId, secret: appSecret,
      grant_type: 'refresh_token', refresh_token: account.refresh_token,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (resp.data?.code === 0 && resp.data?.data) {
      const newToken = resp.data.data.access_token;
      const newRefresh = resp.data.data.refresh_token || account.refresh_token;
      const expiresAt = new Date(Date.now() + (resp.data.data.expires_in || 86400) * 1000);
      await db.query('UPDATE marketing_accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE advertiser_id=?', [newToken, newRefresh, expiresAt, account.advertiser_id]);
      logger.info('[CommentSync] 巨量营销Token刷新成功', { advertiserId: account.advertiser_id, expiresAt });
      return newToken;
    }
    logger.warn('[CommentSync] 巨量营销Token刷新失败', { code: resp.data?.code, message: resp.data?.message });
    return account.access_token;
  } catch (e) {
    logger.error('[CommentSync] 巨量营销Token刷新异常', { error: e.message });
    return account.access_token;
  }
}

/**
 * 拉取评论列表并存储新评论
 */
async function pullComments(advertiserId, accessToken) {
  try {
    // 拉取最近24小时的评论
    const now = dayjs();
    const startTime = now.subtract(7, 'day').format('YYYY-MM-DD');
    const endTime = now.format('YYYY-MM-DD');

    const resp = await axios.get(`${OE_API_BASE}/v3.0/tools/comment/get/`, {
      params: {
        advertiser_id: parseInt(advertiserId),
        start_time: startTime,
        end_time: endTime,
        order_by: 'create_time',
        order_type: 'DESC',
        page: 1,
        page_size: 50,
      },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
      // 保持原始JSON，将大数字段转为字符串避免精度丢失
      transformResponse: [data => {
        try {
          const fixed = data.replace(/"(comment_id|item_id|material_id|promotion_id|user_id)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
          return JSON.parse(fixed);
        } catch { return JSON.parse(data); }
      }],
    });

    if (resp.data?.code !== 0) {
      const errMsg = resp.data?.message || '未知错误';
      if (errMsg.includes('permission') || errMsg.includes('权限') || resp.data?.code === 40100) {
        logger.warn('[CommentSync] 评论管理权限未开通，请在巨量引擎开放平台申请「评论管理」权限', { code: resp.data?.code });
      } else {
        logger.warn('[CommentSync] 拉取评论响应异常', { code: resp.data?.code, message: errMsg });
      }
      return 0;
    }

    const comments = resp.data?.data?.comment_list || [];
    if (comments.length === 0) {
      logger.info(`[CommentSync] 账号${advertiserId}无新评论`);
      return 0;
    }

    let newCount = 0;
    for (const comment of comments) {
      // 只保留一级评论（用户评论），过滤掉自己的回复和二级评论
      if (comment.level_type && comment.level_type !== 'LEVEL_ONE') {
        continue;
      }
      // 过滤掉广告主自己发的回复（reply_to 为空表示是原始评论）
      if (comment.is_owner || comment.reply_comment_id) {
        continue;
      }

      const commentId = String(comment.comment_id);
      const commentText = comment.text || '';

      // 检查是否已存储
      const [existing] = await db.query(
        `SELECT id FROM ops_comment_logs WHERE original_comment_id = ?`,
        [commentId]
      );
      if (existing && existing.length > 0) continue;

      // AI分类（纯表情或空内容跳过分类）
      let category = 'other';
      if (commentText && commentText.replace(/\[.*?\]/g, '').trim().length > 0) {
        try {
          category = await classifyComment(commentText);
        } catch (e) {
          logger.warn('[CommentSync] AI分类失败，默认other', { error: e.message });
        }
      }

      await db.query(
        `INSERT INTO ops_comment_logs (original_comment_id, original_comment, video_id, video_title, comment_type, ai_category, status, created_at, douyin_nickname, douyin_id)
         VALUES (?, ?, ?, ?, 'ai_reply', ?, 'pending', ?, ?, ?)`,
        [
          commentId,
          commentText,
          String(comment.item_id || ''),
          comment.item_title || '',
          category,
          comment.create_time || dayjs().format('YYYY-MM-DD HH:mm:ss'),
          comment.aweme_name || '',
          comment.aweme_id || '',
        ]
      );
      newCount++;
    }

    logger.info(`[CommentSync] 拉取评论完成, 新增${newCount}条`);
    return newCount;
  } catch (e) {
    logger.error('[CommentSync] 拉取评论失败', { error: e.message });
    return 0;
  }
}

/**
 * AI分类评论
 */
async function classifyComment(commentText) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const resp = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [
        {
          role: 'system',
          content: '你是一个评论分类助手。将以下抖音视频评论分类为以下类别之一：positive(好评/赞美), inquiry(咨询/购买意向), negative(差评/投诉), question(疑问/使用问题), other(无关/灌水)。只返回类别英文名，不要其他内容。',
        },
        { role: 'user', content: commentText },
      ],
      temperature: 0,
      max_tokens: 20,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const category = (resp.data?.choices?.[0]?.message?.content || 'other').trim().toLowerCase();
    const validCategories = ['positive', 'inquiry', 'negative', 'question', 'other'];
    return validCategories.includes(category) ? category : 'other';
  } catch (e) {
    logger.error('[CommentSync] AI分类失败', { error: e.message });
    return 'other';
  }
}

/**
 * AI生成回复
 */
async function generateReply(commentText, category, replyStyle) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const systemPrompt = `你是一个品牌运营助手，需要回复抖音视频下的用户评论。要求：1.自然亲切不生硬 2.不超过50字 3.不包含联系方式/导流信息 4.不使用emoji 5.针对${category}类评论回复。回复风格：${replyStyle}。只返回回复内容，不要其他。`;

    const resp = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: commentText },
      ],
      temperature: 0.8,
      max_tokens: 100,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const reply = (resp.data?.choices?.[0]?.message?.content || '').trim();
    return reply;
  } catch (e) {
    logger.error('[CommentSync] AI生成回复失败', { error: e.message });
    return '';
  }
}

/**
 * 构建BigInt安全的JSON（comment_id等大数字段不丢失精度）
 */
function buildBigIntJson(obj, bigIntFields = ['comment_ids']) {
  let json = JSON.stringify(obj);
  // BigInt字段需要传数字而非字符串，但JSON.stringify会丢失精度
  // 所以手动替换: "comment_ids":["123456"] -> "comment_ids":[123456]
  for (const field of bigIntFields) {
    json = json.replace(new RegExp(`"${field}":\\[([^\\]]+)\\]`), (match, inner) => {
      const fixed = inner.replace(/"(\d+)"/g, '$1');
      return `"${field}":[${fixed}]`;
    });
  }
  return json;
}

/**
 * 获取千川Token（用于回复/隐藏操作，这些API需要千川广告主Token）
 */
async function getQianchuanToken() {
  try {
    const [rows] = await db.query('SELECT advertiser_id, access_token FROM qc_accounts WHERE status=1 LIMIT 1');
    if (!rows || rows.length === 0) return null;
    return { advertiserId: rows[0].advertiser_id, accessToken: rows[0].access_token };
  } catch (e) {
    logger.error('[CommentSync] 获取千川Token失败', { error: e.message });
    return null;
  }
}

/**
 * 回复评论（使用千川Token + /v3.0/tools/comment/reply/）
 */
async function replyToComment(advertiserId, accessToken, commentId, replyContent) {
  try {
    // 回复API需要千川广告主Token
    const qcToken = await getQianchuanToken();
    const token = qcToken?.accessToken || accessToken;
    const advId = qcToken?.advertiserId || advertiserId;

    const body = buildBigIntJson({
      advertiser_id: parseInt(advId),
      comment_ids: [String(commentId)],
      reply_text: replyContent,
    });

    logger.info(`[CommentSync] 回复请求body: ${body}`);

    const resp = await axios.post(`${OE_API_BASE}/v3.0/tools/comment/reply/`, body, {
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      timeout: 15000,
      // 保持原始响应，记录完整返回
      transformResponse: [data => {
        try { return JSON.parse(data); } catch { return data; }
      }],
    });

    logger.info(`[CommentSync] 回复响应完整数据: ${JSON.stringify(resp.data)}`);

    if (resp.data?.code === 0) {
      logger.info(`[CommentSync] 回复评论成功, comment_id=${commentId}, advId=${advId}`);
      return true;
    }
    logger.warn('[CommentSync] 回复评论响应异常', { code: resp.data?.code, message: resp.data?.message, data: resp.data?.data });
    return false;
  } catch (e) {
    logger.error('[CommentSync] 回复评论失败', { error: e.message, commentId });
    return false;
  }
}

/**
 * 评论操作（隐藏，使用千川Token + /v3.0/tools/comment/hide/）
 */
async function operateComment(advertiserId, accessToken, commentId, action) {
  try {
    const qcToken = await getQianchuanToken();
    const token = qcToken?.accessToken || accessToken;
    const advId = qcToken?.advertiserId || advertiserId;

    let url, body;
    if (action === 'HIDE') {
      url = `${OE_API_BASE}/v3.0/tools/comment/hide/`;
      body = buildBigIntJson({ advertiser_id: parseInt(advId), comment_ids: [String(commentId)] });
    } else {
      // TOP and other operations - try generic endpoint
      url = `${OE_API_BASE}/v3.0/tools/comment/reply/`;
      body = JSON.stringify({ advertiser_id: parseInt(advId), comment_id: commentId, action });
    }

    const resp = await axios.post(url, body, {
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    if (resp.data?.code === 0) {
      logger.info(`[CommentSync] 评论操作成功, action=${action}, comment_id=${commentId}`);
      return true;
    }
    logger.warn('[CommentSync] 评论操作响应异常', { code: resp.data?.code, message: resp.data?.message, action });
    return false;
  } catch (e) {
    logger.error('[CommentSync] 评论操作失败', { error: e.message, commentId, action });
    return false;
  }
}

/**
 * 检查违禁词
 */
async function checkBannedWords(text) {
  try {
    const [rows] = await db.query(`SELECT word FROM ops_blocked_words`);
    if (!rows || rows.length === 0) {
      return { hasBanned: false, words: [] };
    }

    const matched = [];
    for (const row of rows) {
      if (row.word && text.includes(row.word)) {
        matched.push(row.word);
      }
    }

    return { hasBanned: matched.length > 0, words: matched };
  } catch (e) {
    logger.error('[CommentSync] 违禁词检查失败', { error: e.message });
    return { hasBanned: false, words: [] };
  }
}

/**
 * 检查频率限制
 */
async function checkRateLimit(accountLabel) {
  try {
    const now = dayjs();
    const oneMinuteAgo = now.subtract(1, 'minute').format('YYYY-MM-DD HH:mm:ss');
    const oneHourAgo = now.subtract(1, 'hour').format('YYYY-MM-DD HH:mm:ss');
    const todayStart = now.startOf('day').format('YYYY-MM-DD HH:mm:ss');

    const [minRows] = await db.query(
      `SELECT COUNT(*) as cnt FROM ops_comment_logs WHERE status = 'success' AND created_at >= ?`,
      [oneMinuteAgo]
    );
    const [hourRows] = await db.query(
      `SELECT COUNT(*) as cnt FROM ops_comment_logs WHERE status = 'success' AND created_at >= ?`,
      [oneHourAgo]
    );
    const [dayRows] = await db.query(
      `SELECT COUNT(*) as cnt FROM ops_comment_logs WHERE status = 'success' AND created_at >= ?`,
      [todayStart]
    );

    const perMin = minRows[0]?.cnt || 0;
    const perHour = hourRows[0]?.cnt || 0;
    const perDay = dayRows[0]?.cnt || 0;

    if (perMin >= RISK_LIMITS.replyPerMinute) {
      logger.warn(`[CommentSync] 频率限制: 每分钟已达${perMin}条, 账户=${accountLabel}`);
      return false;
    }
    if (perHour >= RISK_LIMITS.replyPerHour) {
      logger.warn(`[CommentSync] 频率限制: 每小时已达${perHour}条, 账户=${accountLabel}`);
      return false;
    }
    if (perDay >= RISK_LIMITS.replyPerDay) {
      logger.warn(`[CommentSync] 频率限制: 每天已达${perDay}条, 账户=${accountLabel}`);
      return false;
    }

    return true;
  } catch (e) {
    logger.error('[CommentSync] 频率检查失败', { error: e.message });
    return false;
  }
}

/**
 * 自动回复主循环
 */
async function runAutoReply() {
  try {
    // 检查是否启用AI自动回复
    const [configRows] = await db.query(
      `SELECT enabled, pull_interval_minutes, auto_reply_categories, reply_style FROM ops_ai_reply_config ORDER BY id LIMIT 1`
    );
    if (!configRows || configRows.length === 0 || configRows[0].enabled !== 1) {
      logger.info('[CommentSync] AI自动回复未启用');
      return { replied: 0, pulled: 0 };
    }

    const config = configRows[0];
    let autoReplyCategories;
    try {
      autoReplyCategories = typeof config.auto_reply_categories === 'string'
        ? JSON.parse(config.auto_reply_categories)
        : config.auto_reply_categories || ['positive', 'inquiry', 'question'];
    } catch { autoReplyCategories = ['positive', 'inquiry', 'question']; }
    const replyStyle = config.reply_style || 'friendly';

    // 获取Token（用于回复）
    const tokenInfo = await getAccessToken();
    if (!tokenInfo) {
      logger.error('[CommentSync] 无法获取Token，终止自动回复');
      return { replied: 0, pulled: 0, error: 'Token获取失败' };
    }
    const { advertiserId, accessToken } = tokenInfo;

    // 遍历所有营销子账号拉取评论
    let totalPulled = 0;
    const [allAccounts] = await db.query('SELECT advertiser_id, access_token FROM marketing_accounts WHERE status=1');
    for (const acc of (allAccounts || [])) {
      try {
        const count = await pullComments(acc.advertiser_id, acc.access_token);
        totalPulled += count;
      } catch (e) {
        logger.warn(`[CommentSync] 子账号${acc.advertiser_id}拉取失败`, { error: e.message });
      }
    }
    logger.info(`[CommentSync] 共拉取${totalPulled}条新评论(${allAccounts?.length || 0}个账号)`);

    // 获取待处理评论
    const [pendingComments] = await db.query(
      `SELECT id, original_comment, original_comment_id FROM ops_comment_logs WHERE comment_type = 'ai_reply' AND status = 'pending' ORDER BY created_at ASC`
    );

    if (!pendingComments || pendingComments.length === 0) {
      logger.info('[CommentSync] 无待处理评论');
      return { replied: 0, pulled: totalPulled };
    }

    let repliedCount = 0;

    for (const comment of pendingComments) {
      // 频率检查
      const withinLimit = await checkRateLimit(advertiserId);
      if (!withinLimit) {
        logger.warn('[CommentSync] 已达频率上限，暂停回复');
        break;
      }

      // 分类
      const category = await classifyComment(comment.original_comment);
      await db.query(
        `UPDATE ops_comment_logs SET ai_category = ? WHERE id = ?`,
        [category, comment.id]
      );
      logger.info(`[CommentSync] 评论 ${comment.id} 分类为: ${category}`);

      // 判断是否在自动回复类别中
      if (!autoReplyCategories.includes(category)) {
        await db.query(
          `UPDATE ops_comment_logs SET status = 'filtered' WHERE id = ?`,
          [comment.id]
        );
        logger.info(`[CommentSync] 评论 ${comment.id} 类别 ${category} 不在自动回复范围内, 跳过`);
        continue;
      }

      // 生成回复
      const reply = await generateReply(comment.original_comment, category, replyStyle);
      if (!reply) {
        logger.warn(`[CommentSync] 评论 ${comment.id} 生成回复失败`);
        continue;
      }

      // 违禁词检查
      const bannedCheck = await checkBannedWords(reply);
      if (bannedCheck.hasBanned) {
        logger.warn(`[CommentSync] 评论 ${comment.id} 回复包含违禁词: ${bannedCheck.words.join(', ')}`);
        await db.query(
          `UPDATE ops_comment_logs SET reply_content = ?, status = 'filtered', ai_category = ? WHERE id = ?`,
          [reply, category, comment.id]
        );
        continue;
      }

      // 发送回复
      const success = await replyToComment(advertiserId, accessToken, comment.original_comment_id, reply);
      if (success) {
        await db.query(
          `UPDATE ops_comment_logs SET reply_content = ?, status = 'success', ai_category = ? WHERE id = ?`,
          [reply, category, comment.id]
        );
        repliedCount++;
        logger.info(`[CommentSync] 评论 ${comment.id} 回复成功: ${reply}`);
      } else {
        await db.query(
          `UPDATE ops_comment_logs SET reply_content = ?, status = 'failed', ai_category = ? WHERE id = ?`,
          [reply, category, comment.id]
        );
        logger.warn(`[CommentSync] 评论 ${comment.id} 回复发送失败`);
      }

      // 风控间隔：随机10-60秒
      const interval = randomInterval();
      logger.info(`[CommentSync] 风控延迟 ${Math.round(interval / 1000)}s`);
      await sleep(interval);
    }

    logger.info(`[CommentSync] 自动回复完成, 拉取${totalPulled}条, 回复${repliedCount}条`);
    return { replied: repliedCount, pulled: totalPulled };
  } catch (e) {
    logger.error('[CommentSync] 自动回复异常', { error: e.message });
    return { replied: 0, pulled: 0, error: e.message };
  }
}

/**
 * 自动隐藏差评（每15分钟执行）
 */
async function autoHideNegative() {
  try {
    // 查找未隐藏的差评
    const [negatives] = await db.query(
      `SELECT id, original_comment_id FROM ops_comment_logs WHERE ai_category = 'negative' AND status = 'pending'`
    );
    if (!negatives || negatives.length === 0) {
      logger.info('[CommentSync] 无待隐藏差评');
      return { hidden: 0 };
    }

    const tokenInfo = await getAccessToken();
    if (!tokenInfo?.accessToken) {
      logger.error('[CommentSync] 无法获取Token，终止差评隐藏');
      return { hidden: 0 };
    }

    let hiddenCount = 0;
    for (const neg of negatives) {
      try {
        await operateComment(tokenInfo.advertiserId, tokenInfo.accessToken, neg.original_comment_id, 'HIDE');
        await db.query(`UPDATE ops_comment_logs SET status = 'filtered', fail_reason = '差评自动隐藏' WHERE id = ?`, [neg.id]);
        hiddenCount++;
        // 间隔避免风控
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        logger.warn(`[CommentSync] 隐藏差评失败 #${neg.id}`, { error: e.message });
      }
    }

    logger.info(`[CommentSync] 差评自动隐藏完成, 共${hiddenCount}条`);
    return { hidden: hiddenCount };
  } catch (e) {
    logger.error('[CommentSync] 差评自动隐藏异常', { error: e.message });
    return { hidden: 0, error: e.message };
  }
}

/**
 * 超8小时未回复评论自动AI回复
 */
async function autoReplyOverdue() {
  try {
    const eightHoursAgo = dayjs().subtract(8, 'hour').format('YYYY-MM-DD HH:mm:ss');

    // 查找超8小时未回复的非差评评论（差评已隐藏不需要回复）
    const [overdue] = await db.query(
      `SELECT id, original_comment, original_comment_id, ai_category
       FROM ops_comment_logs
       WHERE status = 'pending' AND ai_category != 'negative' AND created_at <= ?
       ORDER BY created_at ASC`,
      [eightHoursAgo]
    );

    if (!overdue || overdue.length === 0) {
      logger.info('[CommentSync] 无超时未回复评论');
      return { replied: 0 };
    }

    logger.info(`[CommentSync] 发现${overdue.length}条超8小时未回复评论，开始自动回复`);

    const tokenInfo = await getAccessToken();
    if (!tokenInfo?.accessToken) {
      logger.error('[CommentSync] 无法获取Token，终止超时回复');
      return { replied: 0 };
    }

    // 获取回复风格配置
    const [configRows] = await db.query(`SELECT reply_style FROM ops_ai_reply_config ORDER BY id LIMIT 1`);
    const replyStyle = configRows?.[0]?.reply_style || 'friendly';

    let repliedCount = 0;
    for (const comment of overdue) {
      // 频率检查
      const withinLimit = await checkRateLimit(tokenInfo.advertiserId);
      if (!withinLimit) {
        logger.warn('[CommentSync] 已达频率上限，暂停超时回复');
        break;
      }

      try {
        // AI生成回复
        const reply = await generateReply(comment.original_comment, comment.ai_category || 'other', replyStyle);
        if (!reply) continue;

        // 检查违禁词
        const banned = await checkBannedWords(reply);
        if (banned.hasBanned) {
          await db.query(`UPDATE ops_comment_logs SET status = 'filtered', fail_reason = '回复包含屏蔽词' WHERE id = ?`, [comment.id]);
          continue;
        }

        // 发送回复
        await replyToComment(tokenInfo.advertiserId, tokenInfo.accessToken, comment.original_comment_id, reply);
        await db.query(
          `UPDATE ops_comment_logs SET reply_content = ?, status = 'success', comment_type = 'ai_reply' WHERE id = ?`,
          [reply, comment.id]
        );
        repliedCount++;
        logger.info(`[CommentSync] 超时自动回复 #${comment.id}: ${reply.substring(0, 30)}...`);

        // 风控间隔 10-60秒
        const interval = Math.floor(Math.random() * (RISK_LIMITS.intervalMax - RISK_LIMITS.intervalMin) * 1000) + RISK_LIMITS.intervalMin * 1000;
        await new Promise(r => setTimeout(r, interval));
      } catch (e) {
        logger.warn(`[CommentSync] 超时回复失败 #${comment.id}`, { error: e.message });
        await db.query(`UPDATE ops_comment_logs SET status = 'failed', fail_reason = ? WHERE id = ?`, [e.message, comment.id]);
      }
    }

    logger.info(`[CommentSync] 超时自动回复完成, 共${repliedCount}/${overdue.length}条`);
    return { replied: repliedCount, total: overdue.length };
  } catch (e) {
    logger.error('[CommentSync] 超时自动回复异常', { error: e.message });
    return { replied: 0, error: e.message };
  }
}

module.exports = { getAccessToken, getMarketingConfig, refreshMarketingToken, pullComments, classifyComment, generateReply, replyToComment, operateComment, checkBannedWords, runAutoReply, autoHideNegative, autoReplyOverdue };
