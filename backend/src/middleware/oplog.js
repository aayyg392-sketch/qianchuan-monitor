/**
 * 操作日志中间件 + 工具函数
 */
const db = require('../db');

// 确保表存在
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS operation_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      action VARCHAR(100),
      target VARCHAR(200),
      detail TEXT,
      ip VARCHAR(45),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_created (created_at)
    )`);
  } catch (e) { /* ignore */ }
})();

/**
 * 记录操作日志
 * @param {number} userId
 * @param {string} action - 操作类型：login/create_role/update_role/delete_role/update_user_role/save_settings/save_push_config 等
 * @param {string} target - 操作对象
 * @param {string} detail - 详情
 * @param {string} ip
 */
async function log(userId, action, target, detail, ip) {
  try {
    await db.query(
      'INSERT INTO operation_logs (user_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)',
      [userId, action, target || '', typeof detail === 'object' ? JSON.stringify(detail) : (detail || ''), ip || '']
    );
  } catch (e) { /* 日志写入失败不影响业务 */ }
}

/**
 * Express中间件：自动记录写操作（POST/PUT/DELETE）
 * 挂载到需要记录日志的路由上
 */
function autoLog(actionPrefix) {
  return (req, res, next) => {
    // 只记录写操作
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // 只在操作成功时记录
      if (body && (body.code === 0 || body.code === undefined)) {
        const userId = req.user?.id || req.user?.userId || 0;
        const ip = req.headers['x-forwarded-for'] || req.ip || '';
        const action = `${actionPrefix || req.baseUrl.replace('/api/', '')}:${req.method.toLowerCase()}`;
        const target = req.originalUrl.replace(/\?.*/, '');
        const detail = req.method === 'DELETE' ? req.params : req.body;
        log(userId, action, target, detail, ip).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { log, autoLog };
