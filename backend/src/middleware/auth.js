const jwt = require('jsonwebtoken');

const auth = (roles = []) => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ code: 401, msg: '未授权，请登录' });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ code: 403, msg: '权限不足' });
      }
      // 注入RBAC账户权限
      try {
        const perm = require('../services/permission');
        const userPerms = await perm.getUserPermissions(decoded.id);
        req.rbac = userPerms;
        if (userPerms.is_super_admin) {
          req.accountFilter = null;
          req.accWhere = '';
          req.accParams = [];
        } else {
          const qcAccounts = userPerms.ad_accounts?.qianchuan || [];
          if (!qcAccounts.includes('*') && qcAccounts.length > 0) {
            req.accountFilter = qcAccounts;
            req.accWhere = ' AND advertiser_id IN (' + qcAccounts.map(() => '?').join(',') + ')';
            req.accParams = [...qcAccounts];
          } else {
            req.accountFilter = null;
            req.accWhere = '';
            req.accParams = [];
          }
        }
      } catch (e) {
        req.accountFilter = null;
        req.accWhere = '';
        req.accParams = [];
      }
      next();
    } catch (e) {
      return res.status(401).json({ code: 401, msg: 'Token已过期，请重新登录' });
    }
  };
};

module.exports = auth;
