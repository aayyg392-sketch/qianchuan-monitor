/**
 * RBAC权限服务
 * 使用 roles / role_menus / role_ad_accounts / role_live_rooms 表
 */
const db = require('../db');

async function getUserPermissions(userId) {
  // 1. 查用户角色
  const [userRoles] = await db.query(`
    SELECT r.* FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ? AND r.status = 1
  `, [userId]);

  // 查用户信息
  const [[user]] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);

  // 超级管理员
  const isSuperAdmin = user?.role === 'admin' || userRoles.some(r => r.name === 'super_admin');

  if (isSuperAdmin) {
    return { is_super_admin: true, menus: ['*'], ad_accounts: {}, live_rooms: [] };
  }

  if (!userRoles.length) {
    return { is_super_admin: false, menus: [], ad_accounts: {}, live_rooms: [] };
  }

  const roleIds = userRoles.map(r => r.id);
  const ph = roleIds.map(() => '?').join(',');

  // 2. 菜单权限
  const [menuRows] = await db.query(`SELECT DISTINCT menu_code FROM role_menus WHERE role_id IN (${ph})`, roleIds);
  const menus = menuRows.map(r => r.menu_code);

  // 3. 广告账户权限
  const [accRows] = await db.query(`SELECT DISTINCT platform, account_id FROM role_ad_accounts WHERE role_id IN (${ph})`, roleIds);
  const ad_accounts = {};
  for (const a of accRows) {
    if (!ad_accounts[a.platform]) ad_accounts[a.platform] = [];
    ad_accounts[a.platform].push(a.account_id);
  }

  // 4. 直播间/抖音号权限
  const [roomRows] = await db.query(`SELECT DISTINCT room_id FROM role_live_rooms WHERE role_id IN (${ph})`, roleIds);
  const live_rooms = roomRows.map(r => r.room_id);

  return { is_super_admin: false, menus, ad_accounts, live_rooms };
}

module.exports = { getUserPermissions };
