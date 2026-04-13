const jwt = require('jsonwebtoken');

const auth = (roles = []) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ code: 401, msg: '未授权，请登录' });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ code: 403, msg: '权限不足' });
      }
      next();
    } catch (e) {
      return res.status(401).json({ code: 401, msg: 'Token已过期，请重新登录' });
    }
  };
};

module.exports = auth;
