/**
 * 直播间自动回复 API 路由
 * GET  /api/live/auto-reply/status     - 查看服务状态
 * POST /api/live/auto-reply/toggle     - 开启/关闭自动回复
 * GET  /api/live/auto-reply/screenshot - 获取浏览器截图
 */
const router = require('express').Router();
const logger = require('../logger');

let autoReplyService = null;
try {
  autoReplyService = require('../services/live-auto-reply');
} catch (e) {
  logger.error('[LiveAutoReplyRoute] 加载服务失败', { error: e.message });
}

// 查看服务状态
router.get('/auto-reply/status', (req, res) => {
  try {
    if (!autoReplyService) {
      return res.json({ code: -1, msg: '服务未加载' });
    }
    const status = autoReplyService.getStatus();
    res.json({ code: 0, data: status });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 开启/关闭自动回复
router.post('/auto-reply/toggle', (req, res) => {
  try {
    if (!autoReplyService) {
      return res.json({ code: -1, msg: '服务未加载' });
    }
    const { enabled } = req.body;
    const result = autoReplyService.toggleAutoReply(enabled !== false);
    res.json({ code: 0, data: { autoReplyEnabled: result } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 获取浏览器截图
router.get('/auto-reply/screenshot', async (req, res) => {
  try {
    if (!autoReplyService) {
      return res.json({ code: -1, msg: '服务未加载' });
    }
    const buffer = await autoReplyService.getScreenshotBuffer();
    if (!buffer) {
      return res.json({ code: -1, msg: '截图不可用，浏览器可能未启动' });
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(buffer);
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
