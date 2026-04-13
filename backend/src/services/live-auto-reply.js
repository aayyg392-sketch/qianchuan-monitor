/**
 * 抖音直播间弹幕自动回复服务
 * 用puppeteer监听直播间弹幕，AI分析后自动回复
 */
const puppeteer = require('puppeteer-core');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const logger = require('../logger');

// ============ 配置 ============
const CONFIG = {
  LIVE_URL: 'https://live.douyin.com/snefe66',
  CHROMIUM_PATH: '/usr/bin/chromium-browser',
  USER_DATA_DIR: path.join(__dirname, '../../.chromium-live-reply'),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-Ek0axGWeCQzL5RAFqUtEzLywGZmkFtwMMdfTf1QSBZtHDStv',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5',
  MIN_REPLY_DELAY: 10000,   // 最短回复延迟 10秒
  MAX_REPLY_DELAY: 30000,   // 最长回复延迟 30秒
  MAX_REPLIES_PER_MIN: 2,   // 每分钟最多回复2条
  RECONNECT_INTERVAL: 30000, // 断线重连间隔30秒
  SCREENSHOT_PATH: path.join(__dirname, '../../.chromium-live-reply/screenshot.png'),
};

// ============ 状态 ============
let browser = null;
let page = null;
let isRunning = false;
let autoReplyEnabled = true;
let lastError = null;
let stats = {
  startedAt: null,
  totalDanmaku: 0,
  totalReplied: 0,
  repliedThisMinute: 0,
  lastReplyAt: null,
  lastDanmakuAt: null,
};
// 已回复用户集合（防止重复回复同一用户）
const repliedUsers = new Set();
// 回复队列
const replyQueue = [];
let isProcessingQueue = false;
// 每分钟重置回复计数
setInterval(() => { stats.repliedThisMinute = 0; }, 60000);
// 每小时清理已回复用户集合（允许1小时后再次回复）
setInterval(() => { repliedUsers.clear(); }, 3600000);

// ============ 自动建表（追加 auto_reply 相关字段） ============
async function ensureTable() {
  try {
    // 确保 live_danmaku 表存在基础结构（已由 live.js 创建）
    // 追加自动回复相关列（如果不存在）
    const columnsToAdd = [
      { name: 'category', sql: "ALTER TABLE live_danmaku ADD COLUMN category VARCHAR(30) DEFAULT NULL AFTER is_question" },
      { name: 'auto_reply', sql: "ALTER TABLE live_danmaku ADD COLUMN auto_reply TEXT DEFAULT NULL AFTER category" },
      { name: 'replied_at', sql: "ALTER TABLE live_danmaku ADD COLUMN replied_at DATETIME DEFAULT NULL AFTER auto_reply" },
      { name: 'reply_status', sql: "ALTER TABLE live_danmaku ADD COLUMN reply_status ENUM('pending','sent','failed','skipped') DEFAULT NULL AFTER replied_at" },
    ];
    for (const col of columnsToAdd) {
      try {
        await db.query(col.sql);
        logger.info(`[LiveAutoReply] 添加列 ${col.name} 成功`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message.includes('Duplicate column')) {
          // 列已存在，忽略
        } else {
          logger.warn(`[LiveAutoReply] 添加列 ${col.name} 失败: ${e.message}`);
        }
      }
    }
  } catch (e) {
    logger.error('[LiveAutoReply] 建表失败', { error: e.message });
  }
}

// ============ 启动浏览器 ============
async function launchBrowser() {
  // 确保user-data-dir存在
  if (!fs.existsSync(CONFIG.USER_DATA_DIR)) {
    fs.mkdirSync(CONFIG.USER_DATA_DIR, { recursive: true });
  }

  browser = await puppeteer.launch({
    executablePath: CONFIG.CHROMIUM_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=${CONFIG.USER_DATA_DIR}`,
      '--window-size=1280,800',
    ],
    timeout: 30000,
  });

  browser.on('disconnected', () => {
    logger.warn('[LiveAutoReply] 浏览器断开连接');
    browser = null;
    page = null;
    if (isRunning) {
      setTimeout(() => reconnect(), CONFIG.RECONNECT_INTERVAL);
    }
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 伪装UA和webdriver属性
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    window.chrome = { runtime: {} };
  });

  logger.info('[LiveAutoReply] 浏览器启动成功');
}

// ============ 打开直播间并监听弹幕 ============
async function openLiveRoom() {
  if (!page || page.isClosed()) {
    throw new Error('页面未初始化');
  }

  logger.info('[LiveAutoReply] 打开直播间...', { url: CONFIG.LIVE_URL });
  await page.goto(CONFIG.LIVE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 截图保存用于调试
  await takeScreenshot();

  // 检查是否需要登录
  const needLogin = await page.evaluate(() => {
    const loginBtn = document.querySelector('[class*="login"]') || document.querySelector('[class*="Login"]');
    const pageText = document.body.innerText || '';
    return pageText.includes('登录') && pageText.length < 500;
  });

  if (needLogin) {
    logger.warn('[LiveAutoReply] 需要登录！请通过 GET /api/live/auto-reply/screenshot 获取截图并扫码登录');
  }

  // 设置弹幕监听（通过MutationObserver）
  await setupDanmakuObserver();
  logger.info('[LiveAutoReply] 弹幕监听已启动');
}

// ============ 设置MutationObserver监听弹幕 ============
async function setupDanmakuObserver() {
  // 在页面中注入MutationObserver，将新弹幕推送到全局数组
  await page.evaluate(() => {
    window.__danmakuQueue = window.__danmakuQueue || [];
    window.__processedTexts = window.__processedTexts || new Set();

    // 查找弹幕容器的多个可能选择器
    const containerSelectors = [
      '[class*="webcast-chatroom___list"]',
      '[class*="ChatMessage"]',
      '[class*="chatroom"]',
      '[class*="chat-room"]',
      '[data-e2e="chat-message"]',
      '[class*="danmaku"]',
      '[class*="chat_list"]',
      '[class*="comment-list"]',
    ];

    function findContainer() {
      for (const sel of containerSelectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      // 兜底：查找包含聊天消息的滚动容器
      const allDivs = document.querySelectorAll('div[class]');
      for (const div of allDivs) {
        const cls = div.className || '';
        if ((cls.includes('chat') || cls.includes('Chat') || cls.includes('message') || cls.includes('Message')) 
            && div.children.length > 3) {
          return div;
        }
      }
      return null;
    }

    function extractDanmaku(node) {
      if (!node || !node.textContent) return null;
      const text = node.textContent.trim();
      if (!text || text.length < 2 || text.length > 300) return null;

      // 过滤系统消息
      if (text.includes('欢迎来到直播间') || text.includes('进入直播间') || 
          text.includes('关注了主播') || text.includes('送出了') ||
          text.includes('分享了直播') || text.includes('加入了粉丝团')) {
        return null;
      }

      // 去重
      const key = text.substring(0, 100);
      if (window.__processedTexts.has(key)) return null;
      window.__processedTexts.add(key);
      // 防止集合无限增大
      if (window.__processedTexts.size > 5000) {
        const arr = Array.from(window.__processedTexts);
        window.__processedTexts = new Set(arr.slice(-2000));
      }

      // 尝试分离用户名和内容
      // 抖音弹幕格式通常是: "用户名：内容" 或者DOM结构中分开
      let username = '';
      let content = text;

      // 尝试从子元素中提取
      if (node.querySelector) {
        const nameEl = node.querySelector('[class*="name"]') || node.querySelector('[class*="Name"]') || node.querySelector('[class*="nick"]');
        const contentEl = node.querySelector('[class*="content"]') || node.querySelector('[class*="Content"]') || node.querySelector('[class*="text"]');
        if (nameEl && contentEl) {
          username = nameEl.textContent.trim();
          content = contentEl.textContent.trim();
        }
      }

      // 兜底：用冒号分割
      if (!username && (text.includes('：') || text.includes(':'))) {
        const parts = text.split(/[：:]/);
        if (parts.length >= 2) {
          username = parts[0].trim();
          content = parts.slice(1).join(':').trim();
        }
      }

      return { username, content, raw: text, timestamp: Date.now() };
    }

    const container = findContainer();
    if (!container) {
      console.log('[LiveAutoReply] 未找到弹幕容器，将使用轮询模式');
      return;
    }

    console.log('[LiveAutoReply] 找到弹幕容器:', container.className);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const danmaku = extractDanmaku(node);
          if (danmaku) {
            window.__danmakuQueue.push(danmaku);
          }
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });
    window.__danmakuObserver = observer;
  });
}

// ============ 轮询获取新弹幕 ============
async function pollDanmaku() {
  if (!page || page.isClosed()) return [];

  try {
    const danmakuList = await page.evaluate(() => {
      const queue = window.__danmakuQueue || [];
      window.__danmakuQueue = [];
      return queue;
    });
    return danmakuList;
  } catch (e) {
    logger.error('[LiveAutoReply] 轮询弹幕失败', { error: e.message });
    return [];
  }
}

// ============ AI分析弹幕 ============
async function analyzeDanmaku(username, content) {
  const systemPrompt = `你是雪玲妃品牌直播间的AI助手。你的任务是分析观众弹幕并生成合适的回复。

品牌信息：
- 品牌名：雪玲妃（snefe）
- 主营：护肤品、美妆产品
- 特点：国货品牌，性价比高，成分安全

分析规则：
1. 对每条弹幕进行分类：
   - purchase_intent（购买意向）：想买、多少钱、怎么购买、下单、链接等
   - product_inquiry（产品咨询）：成分、功效、适合什么肤质、保质期等
   - after_sale（售后问题）：退款、过敏、质量问题、物流等
   - positive_feedback（正面反馈）：好用、回购、推荐等
   - chitchat（闲聊）：无关内容
   - no_reply（无需回复）：表情、单字、无意义内容

2. 仅对 purchase_intent、product_inquiry、after_sale 类型生成回复
3. 回复要求：
   - 亲切友好，使用口语化表达
   - 简短精炼，不超过30字
   - 每次回复措辞不同，避免重复
   - 引导用户点击购物车下单
   - 不要使用emoji
   - 不要说"亲"，用"宝子""姐妹"等称呼

返回JSON格式：
{"category":"分类","reply":"回复内容（无需回复则为空字符串）","reason":"分类理由"}`;

  try {
    const response = await axios.post(
      `${CONFIG.OPENAI_BASE_URL}/chat/completions`,
      {
        model: CONFIG.OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `用户"${username}"说：${content}` },
        ],
        temperature: 0.9,
        max_tokens: 200,
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const text = response.data.choices?.[0]?.message?.content || '';
    // 提取JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { category: 'no_reply', reply: '', reason: 'AI返回格式异常' };
  } catch (e) {
    logger.error('[LiveAutoReply] AI分析失败', { error: e.message });
    return { category: 'no_reply', reply: '', reason: `AI错误: ${e.message}` };
  }
}

// ============ 在直播间发送回复 ============
async function sendReply(replyText) {
  if (!page || page.isClosed()) return false;

  try {
    // 查找评论输入框（多种可能的选择器）
    const inputSelectors = [
      'textarea[class*="chat"]',
      'textarea[class*="Chat"]',
      'textarea[placeholder*="说点什么"]',
      'textarea[placeholder*="聊天"]',
      'div[contenteditable="true"][class*="chat"]',
      'div[contenteditable="true"][class*="Chat"]',
      'div[contenteditable="true"][class*="input"]',
      'input[class*="chat"]',
      '[data-e2e="chat-input"]',
      'textarea',
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = await page.$(sel);
      if (inputEl) break;
    }

    if (!inputEl) {
      logger.warn('[LiveAutoReply] 未找到评论输入框');
      return false;
    }

    // 点击输入框获得焦点
    await inputEl.click();
    await new Promise(r => setTimeout(r, 500));

    // 清空并输入内容
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 100));

    // 逐字输入模拟真实打字
    for (const char of replyText) {
      await page.keyboard.type(char, { delay: Math.random() * 100 + 50 });
    }

    await new Promise(r => setTimeout(r, 500));

    // 按回车发送
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 1000));

    logger.info('[LiveAutoReply] 回复已发送', { text: replyText });
    return true;
  } catch (e) {
    logger.error('[LiveAutoReply] 发送回复失败', { error: e.message });
    return false;
  }
}

// ============ 处理回复队列 ============
async function processReplyQueue() {
  if (isProcessingQueue || replyQueue.length === 0) return;
  isProcessingQueue = true;

  try {
    while (replyQueue.length > 0 && autoReplyEnabled) {
      // 检查每分钟回复限制
      if (stats.repliedThisMinute >= CONFIG.MAX_REPLIES_PER_MIN) {
        logger.info('[LiveAutoReply] 达到每分钟回复上限，等待...');
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }

      const item = replyQueue.shift();
      if (!item) break;

      // 随机延迟
      const delay = CONFIG.MIN_REPLY_DELAY + Math.random() * (CONFIG.MAX_REPLY_DELAY - CONFIG.MIN_REPLY_DELAY);
      logger.info(`[LiveAutoReply] 等待 ${(delay / 1000).toFixed(1)}s 后回复...`);
      await new Promise(r => setTimeout(r, delay));

      // 发送回复
      const sent = await sendReply(item.reply);

      // 更新数据库
      const replyStatus = sent ? 'sent' : 'failed';
      try {
        await db.query(
          'UPDATE live_danmaku SET auto_reply=?, replied_at=NOW(), reply_status=? WHERE id=?',
          [item.reply, replyStatus, item.danmakuId]
        );
      } catch (e) {
        logger.error('[LiveAutoReply] 更新回复状态失败', { error: e.message });
      }

      if (sent) {
        stats.totalReplied++;
        stats.repliedThisMinute++;
        stats.lastReplyAt = new Date().toISOString();
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

// ============ 处理单条弹幕 ============
async function handleDanmaku(danmaku) {
  const { username, content } = danmaku;

  stats.totalDanmaku++;
  stats.lastDanmakuAt = new Date().toISOString();

  // 跳过已回复用户
  if (username && repliedUsers.has(username)) {
    logger.debug('[LiveAutoReply] 跳过已回复用户', { username });
    // 仍然记录到数据库
    await saveDanmaku(danmaku, 'no_reply', null, 'skipped');
    return;
  }

  // AI分析
  const analysis = await analyzeDanmaku(username, content);
  const shouldReply = ['purchase_intent', 'product_inquiry', 'after_sale'].includes(analysis.category);

  // 保存弹幕到数据库
  const danmakuId = await saveDanmaku(danmaku, analysis.category, analysis.reply, shouldReply ? 'pending' : 'skipped');

  if (shouldReply && analysis.reply && autoReplyEnabled && danmakuId) {
    // 标记用户已回复
    if (username) repliedUsers.add(username);
    // 加入回复队列
    replyQueue.push({ danmakuId, reply: analysis.reply, username });
    logger.info('[LiveAutoReply] 弹幕加入回复队列', { username, content, category: analysis.category, reply: analysis.reply });
  }
}

// ============ 保存弹幕到数据库 ============
async function saveDanmaku(danmaku, category, autoReply, replyStatus) {
  try {
    const sentiment = category === 'positive_feedback' ? 'positive'
      : category === 'after_sale' ? 'negative'
      : 'neutral';
    const isQuestion = ['product_inquiry', 'purchase_intent', 'after_sale'].includes(category) ? 1 : 0;

    const [result] = await db.query(
      `INSERT INTO live_danmaku (room_id, user_nickname, content, sentiment, is_question, category, auto_reply, reply_status, recorded_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [0, danmaku.username || '', danmaku.content, sentiment, isQuestion, category || null, autoReply || null, replyStatus || null]
    );
    return result.insertId;
  } catch (e) {
    logger.error('[LiveAutoReply] 保存弹幕失败', { error: e.message });
    return null;
  }
}

// ============ 截图 ============
async function takeScreenshot() {
  if (!page || page.isClosed()) return null;
  try {
    const dir = path.dirname(CONFIG.SCREENSHOT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: CONFIG.SCREENSHOT_PATH, fullPage: false });
    return CONFIG.SCREENSHOT_PATH;
  } catch (e) {
    logger.error('[LiveAutoReply] 截图失败', { error: e.message });
    return null;
  }
}

// ============ 重连 ============
async function reconnect() {
  if (!isRunning) return;
  logger.info('[LiveAutoReply] 尝试重连...');
  try {
    await cleanup();
    await launchBrowser();
    await openLiveRoom();
    logger.info('[LiveAutoReply] 重连成功');
  } catch (e) {
    lastError = e.message;
    logger.error('[LiveAutoReply] 重连失败', { error: e.message });
    setTimeout(() => reconnect(), CONFIG.RECONNECT_INTERVAL);
  }
}

// ============ 清理 ============
async function cleanup() {
  try {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  } catch (e) { /* ignore */ }
  page = null;
  browser = null;
}

// ============ 主循环 ============
async function mainLoop() {
  while (isRunning) {
    try {
      // 轮询获取新弹幕
      const danmakuList = await pollDanmaku();

      for (const danmaku of danmakuList) {
        if (!danmaku.content || danmaku.content.length < 2) continue;
        await handleDanmaku(danmaku);
      }

      // 处理回复队列
      if (replyQueue.length > 0 && autoReplyEnabled) {
        processReplyQueue().catch(e => logger.error('[LiveAutoReply] 队列处理异常', { error: e.message }));
      }
    } catch (e) {
      lastError = e.message;
      logger.error('[LiveAutoReply] 主循环异常', { error: e.message });
    }

    // 每3秒轮询一次
    await new Promise(r => setTimeout(r, 3000));
  }
}

// ============ 启动服务 ============
async function startAutoReply() {
  if (isRunning) {
    logger.warn('[LiveAutoReply] 服务已在运行');
    return;
  }

  logger.info('[LiveAutoReply] 启动直播间自动回复服务...');
  isRunning = true;
  stats.startedAt = new Date().toISOString();
  lastError = null;

  try {
    await ensureTable();
    await launchBrowser();
    await openLiveRoom();
    // 启动主循环
    mainLoop().catch(e => {
      logger.error('[LiveAutoReply] 主循环退出', { error: e.message });
      lastError = e.message;
    });
    logger.info('[LiveAutoReply] 服务启动成功');
  } catch (e) {
    lastError = e.message;
    logger.error('[LiveAutoReply] 服务启动失败', { error: e.message });
    // 30秒后重试
    setTimeout(() => {
      if (isRunning) reconnect();
    }, CONFIG.RECONNECT_INTERVAL);
  }
}

// ============ 停止服务 ============
async function stopAutoReply() {
  logger.info('[LiveAutoReply] 停止服务...');
  isRunning = false;
  autoReplyEnabled = false;
  await cleanup();
  logger.info('[LiveAutoReply] 服务已停止');
}

// ============ 获取状态 ============
function getStatus() {
  return {
    isRunning,
    autoReplyEnabled,
    browserConnected: !!browser && !!page && !page?.isClosed(),
    lastError,
    stats: { ...stats },
    queueLength: replyQueue.length,
    repliedUsersCount: repliedUsers.size,
  };
}

// ============ 开关自动回复 ============
function toggleAutoReply(enabled) {
  autoReplyEnabled = !!enabled;
  logger.info(`[LiveAutoReply] 自动回复已${autoReplyEnabled ? '开启' : '关闭'}`);
  return autoReplyEnabled;
}

// ============ 获取截图buffer ============
async function getScreenshotBuffer() {
  await takeScreenshot();
  if (fs.existsSync(CONFIG.SCREENSHOT_PATH)) {
    return fs.readFileSync(CONFIG.SCREENSHOT_PATH);
  }
  return null;
}

module.exports = {
  startAutoReply,
  stopAutoReply,
  getStatus,
  toggleAutoReply,
  getScreenshotBuffer,
  takeScreenshot,
};
