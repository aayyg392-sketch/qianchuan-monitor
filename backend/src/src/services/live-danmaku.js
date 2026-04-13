/**
 * 抖音直播间实时弹幕采集（Puppeteer方案）
 * 通过无头浏览器打开直播间页面，监听DOM中的弹幕消息
 */
const puppeteer = require('puppeteer-core');
const db = require('../db');
const logger = require('../logger');

let browser = null;
let page = null;
let isCollecting = false;

async function startDanmakuCollection() {
  if (isCollecting) return;

  try {
    // 获取活跃直播间
    const [rooms] = await db.query("SELECT * FROM live_rooms WHERE status = 'active' AND is_living = 1 AND web_rid IS NOT NULL");
    if (!rooms.length) {
      logger.info('[LiveDanmaku] 没有正在直播的直播间');
      return;
    }

    const room = rooms[0];
    const url = `https://live.douyin.com/${room.web_rid}`;
    logger.info('[LiveDanmaku] 开始采集弹幕', { room: room.nickname, url });

    isCollecting = true;

    // 启动浏览器
    if (!browser) {
      browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium-browser',
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
               '--disable-gpu', '--no-first-run', '--disable-extensions',
               '--single-process', '--disable-software-rasterizer'],
        timeout: 30000,
      });
      logger.info('[LiveDanmaku] 浏览器启动成功');
    }

    if (!page || page.isClosed()) {
      page = await browser.newPage();
      await page.setViewport({ width: 375, height: 812 });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    }

    // 打开直播间
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 提取弹幕消息 - 从DOM中获取聊天消息
    const messages = await page.evaluate(() => {
      const msgs = [];
      // 抖音直播间弹幕消息选择器（多种可能的选择器）
      const selectors = [
        '[class*="ChatMessage"]',
        '[class*="chatMessage"]',
        '[class*="chat-message"]',
        '[class*="danmaku"]',
        '[class*="comment-item"]',
        '[class*="webcast-chatroom"]',
        '[data-e2e="chat-message"]',
      ];

      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 1 && text.length < 200) {
              // 尝试分离用户名和内容
              const parts = text.split(/[：:]/);
              msgs.push({
                user: parts.length > 1 ? parts[0].trim() : '',
                text: parts.length > 1 ? parts.slice(1).join(':').trim() : text,
                raw: text,
              });
            }
          });
          break;
        }
      }

      // 如果上面没找到，尝试更通用的方式
      if (msgs.length === 0) {
        const allText = document.body.innerText;
        // 返回页面中能找到的聊天相关内容
        return { found: false, bodyLength: allText.length, title: document.title };
      }

      return { found: true, messages: msgs };
    });

    if (messages.found && messages.messages?.length > 0) {
      const roomId = room.id;
      let inserted = 0;
      for (const msg of messages.messages) {
        try {
          // 检查是否已存在（避免重复）
          const [existing] = await db.query(
            'SELECT id FROM live_danmaku WHERE room_id = ? AND content = ? AND user_name = ? LIMIT 1',
            [roomId, msg.text, msg.user]
          );
          if (!existing.length) {
            await db.query(
              'INSERT INTO live_danmaku (room_id, user_name, content, msg_type, created_at) VALUES (?, ?, ?, ?, NOW())',
              [roomId, msg.user || '观众', msg.text, 'danmaku']
            );
            inserted++;
          }
        } catch(e) { /* ignore */ }
      }
      logger.info('[LiveDanmaku] 弹幕采集完成', { total: messages.messages.length, inserted });
    } else {
      logger.info('[LiveDanmaku] 未找到弹幕元素', { info: JSON.stringify(messages).substring(0, 200) });
    }

  } catch(e) {
    logger.error('[LiveDanmaku] 采集失败', { error: e.message });
    // 清理浏览器
    try {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      page = null;
    } catch(e2) {}
  } finally {
    isCollecting = false;
  }
}

// 关闭浏览器（进程退出时调用）
async function cleanup() {
  try {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  } catch(e) {}
  page = null;
  browser = null;
}

module.exports = { startDanmakuCollection, cleanup };
