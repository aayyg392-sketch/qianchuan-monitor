const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const logger = require('../logger');

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: 400, msg: '用户名和密码不能为空' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username=? AND status=1', [username]);
    if (!rows.length) return res.json({ code: 401, msg: '用户名或密码错误' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ code: 401, msg: '用户名或密码错误' });
    await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);
    const token = jwt.sign(
      { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    logger.info(`用户登录: ${username}`);
    res.json({ code: 0, msg: 'ok', data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role, email: user.email } } });
  } catch (e) {
    logger.error('登录失败', { error: e.message });
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// 获取当前用户信息
router.get('/me', require('../middleware/auth')(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id,username,nickname,email,role,last_login,created_at FROM users WHERE id=?', [req.user.id]);
    res.json({ code: 0, data: rows[0] });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 修改密码
router.put('/password', require('../middleware/auth')(), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.json({ code: 400, msg: '新密码不能少于6位' });
  }
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    const valid = await bcrypt.compare(oldPassword, rows[0].password);
    if (!valid) return res.json({ code: 400, msg: '原密码错误' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ code: 0, msg: '密码修改成功' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 用户管理（管理员）
router.get('/users', require('../middleware/auth')(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id,username,nickname,email,role,status,last_login,created_at FROM users ORDER BY id');
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

router.post('/users', require('../middleware/auth')(['admin']), async (req, res) => {
  const { username, password, nickname, email, role } = req.body;
  if (!username || !password) return res.json({ code: 400, msg: '用户名和密码必填' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (username,password,nickname,email,role) VALUES (?,?,?,?,?)',
      [username, hash, nickname || username, email || '', role || 'viewer']);
    res.json({ code: 0, msg: '用户创建成功' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ code: 400, msg: '用户名已存在' });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
