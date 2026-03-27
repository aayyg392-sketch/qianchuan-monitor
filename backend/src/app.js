require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { startCron } = require('./cron');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// 中间件
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60000, max: 300, message: { code: 429, msg: '请求过于频繁' } }));

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/material-tasks', require('./routes/material-tasks'));
app.use('/api/video-production', require('./routes/video-production'));
app.use('/api/material-summary', require('./routes/material-summary'));
app.use('/api/incubation', require('./routes/incubation'));
app.use('/api/audience', require('./routes/audience'));
app.use('/api/influencer', require('./routes/influencer'));
app.use('/api/material-audit', require('./routes/material-audit'));
app.use('/api/super5s', require('./routes/super5s'));
app.use('/api/runway', require('./routes/runway'));
app.use('/api/operations', require('./routes/operations'));
app.use('/api/live', require('./routes/live'));
app.get('/api/health', (req, res) => res.json({ code: 0, status: 'ok', time: new Date().toISOString() }));

// 生成视频静态文件
app.use('/generated-videos', express.static('/home/www/qianchuan-monitor/generated-videos'));

// WebSocket - 实时推送
const wsClients = new Set();
wss.on('connection', (ws, req) => {
  const token = new URLSearchParams(req.url.split('?')[1]).get('token');
  if (!token) { ws.close(1008, 'Unauthorized'); return; }
  try {
    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET);
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: 'connected', msg: '实时连接成功' }));
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
  } catch (e) { ws.close(1008, 'Invalid token'); }
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}
global.wsBroadcast = broadcast;

// 404
app.use((req, res) => res.status(404).json({ code: 404, msg: '接口不存在' }));
app.use((err, req, res, next) => {
  logger.error('未捕获异常', { error: err.message, stack: err.stack });
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
});

const PORT = parseInt(process.env.PORT) || 8001;
server.listen(PORT, '127.0.0.1', async () => {
  logger.info(`✅ 千川监控后端启动 http://127.0.0.1:${PORT}`);
  try {
    await db.query('SELECT 1');
    logger.info('✅ 数据库连接成功');
  } catch (e) { logger.error('❌ 数据库连接失败', { error: e.message }); }
  startCron();
});

module.exports = { app, broadcast };
