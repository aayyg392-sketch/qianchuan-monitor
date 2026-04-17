const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// 当前用户权限
router.get('/my-permissions', auth(), async (req, res) => {
  try {
    const { getUserPermissions } = require('../services/permission');
    const perms = await getUserPermissions(req.user.id);
    res.json({ code: 0, data: perms });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 角色列表
router.get('/roles', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count,
        (SELECT COUNT(*) FROM role_menus rm WHERE rm.role_id = r.id) AS menu_count,
        (SELECT COUNT(*) FROM role_ad_accounts ra WHERE ra.role_id = r.id) AS account_count
      FROM roles r ORDER BY r.is_system DESC, r.id ASC
    `);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 角色详情
router.get('/roles/:id', auth(), async (req, res) => {
  try {
    const [[role]] = await db.query('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!role) return res.json({ code: 404, msg: '角色不存在' });

    const [menuRows] = await db.query('SELECT menu_code FROM role_menus WHERE role_id = ?', [req.params.id]);
    const [accRows] = await db.query('SELECT platform, account_id FROM role_ad_accounts WHERE role_id = ?', [req.params.id]);
    const [roomRows] = await db.query('SELECT room_id FROM role_live_rooms WHERE role_id = ?', [req.params.id]);

    role.menus = menuRows.map(r => r.menu_code);
    role.ad_accounts = accRows.map(r => ({ platform: r.platform, account_id: r.account_id }));
    role.live_rooms = roomRows.map(r => r.room_id);
    res.json({ code: 0, data: role });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 创建角色
router.post('/roles', auth(), async (req, res) => {
  const { name, display_name, description, menu_codes, ad_accounts, live_rooms } = req.body;
  if (!name) return res.json({ code: 400, msg: '角色名必填' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO roles (name, display_name, description) VALUES (?, ?, ?)', [name, display_name || '', description || '']);
    const roleId = result.insertId;

    if (menu_codes?.length) {
      const vals = menu_codes.map(c => [roleId, c]);
      await conn.query('INSERT INTO role_menus (role_id, menu_code) VALUES ?', [vals]);
    }
    if (ad_accounts?.length) {
      const vals = ad_accounts.map(a => [roleId, a.platform || 'qianchuan', a.account_id]);
      await conn.query('INSERT INTO role_ad_accounts (role_id, platform, account_id) VALUES ?', [vals]);
    }
    if (live_rooms?.length) {
      const vals = live_rooms.map(id => [roleId, id]);
      await conn.query('INSERT INTO role_live_rooms (role_id, room_id) VALUES ?', [vals]);
    }
    await conn.commit();
    res.json({ code: 0, data: { id: roleId } });
  } catch (e) {
    await conn.rollback();
    res.json({ code: 500, msg: e.message });
  } finally {
    conn.release();
  }
});

// 更新角色基本信息
router.put('/roles/:id', auth(), async (req, res) => {
  const { display_name, description } = req.body;
  try {
    await db.query('UPDATE roles SET display_name = ?, description = ? WHERE id = ?', [display_name || '', description || '', req.params.id]);
    res.json({ code: 0, msg: '已更新' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 更新角色菜单权限
router.put('/roles/:id/menus', auth(), async (req, res) => {
  const { menu_codes } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM role_menus WHERE role_id = ?', [req.params.id]);
    if (menu_codes?.length) {
      const vals = menu_codes.map(c => [req.params.id, c]);
      await conn.query('INSERT INTO role_menus (role_id, menu_code) VALUES ?', [vals]);
    }
    await conn.commit();
    res.json({ code: 0, msg: '菜单权限已更新' });
  } catch (e) {
    await conn.rollback();
    res.json({ code: 500, msg: e.message });
  } finally {
    conn.release();
  }
});

// 更新角色账户权限
router.put('/roles/:id/accounts', auth(), async (req, res) => {
  const { accounts } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM role_ad_accounts WHERE role_id = ?', [req.params.id]);
    if (accounts?.length) {
      const vals = accounts.map(a => [req.params.id, a.platform || 'qianchuan', a.account_id]);
      await conn.query('INSERT INTO role_ad_accounts (role_id, platform, account_id) VALUES ?', [vals]);
    }
    await conn.commit();
    res.json({ code: 0, msg: '账户权限已更新' });
  } catch (e) {
    await conn.rollback();
    res.json({ code: 500, msg: e.message });
  } finally {
    conn.release();
  }
});

// 更新角色直播间权限
router.put('/roles/:id/live-rooms', auth(), async (req, res) => {
  const { room_ids } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM role_live_rooms WHERE role_id = ?', [req.params.id]);
    if (room_ids?.length) {
      const vals = room_ids.map(id => [req.params.id, id]);
      await conn.query('INSERT INTO role_live_rooms (role_id, room_id) VALUES ?', [vals]);
    }
    await conn.commit();
    res.json({ code: 0, msg: '直播间权限已更新' });
  } catch (e) {
    await conn.rollback();
    res.json({ code: 500, msg: e.message });
  } finally {
    conn.release();
  }
});

// 删除角色
router.delete('/roles/:id', auth(), async (req, res) => {
  try {
    const [[role]] = await db.query('SELECT is_system FROM roles WHERE id = ?', [req.params.id]);
    if (!role) return res.json({ code: 404, msg: '角色不存在' });
    if (role.is_system) return res.json({ code: 403, msg: '系统角色不可删除' });

    const conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.query('DELETE FROM role_menus WHERE role_id = ?', [req.params.id]);
    await conn.query('DELETE FROM role_ad_accounts WHERE role_id = ?', [req.params.id]);
    await conn.query('DELETE FROM role_live_rooms WHERE role_id = ?', [req.params.id]);
    await conn.query('DELETE FROM user_roles WHERE role_id = ?', [req.params.id]);
    await conn.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
    await conn.commit();
    conn.release();
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 用户角色分配
router.put('/users/:id/roles', auth(), async (req, res) => {
  const { role_ids } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM user_roles WHERE user_id = ?', [req.params.id]);
    if (role_ids?.length) {
      const vals = role_ids.map(rid => [req.params.id, rid]);
      await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [vals]);
    }
    await conn.commit();
    res.json({ code: 0, msg: '角色已更新' });
  } catch (e) {
    await conn.rollback();
    res.json({ code: 500, msg: e.message });
  } finally {
    conn.release();
  }
});

// 菜单树 — code与前端路由path一致
router.get('/menus', auth(), async (req, res) => {
  const menus = [
    { code: '/dashboard', name: '数据概览' },
    { code: '/live', name: '直播中心', children: [
      { code: '/live-monitor', name: '实时监控' },
      { code: '/live-analytics', name: '分时数据' },
      { code: '/live-speech', name: '话术抓取' },
      { code: '/live-replay', name: '主播复盘' },
      { code: '/anchor-schedule', name: '主播排班' },
      { code: '/anchor-stats', name: '主播数据' },
    ]},
    { code: '/materials', name: '素材管理', children: [
      { code: '/materials', name: '素材列表' },
      { code: '/material-tasks', name: '素材任务' },
      { code: '/video-production', name: '爆款视频改造' },
      { code: '/material-audit', name: '素材审核' },
      { code: '/super5s', name: '超级5秒镜头' },
      { code: '/ai-text2video', name: 'AI文生视频' },
      { code: '/material-dimensions', name: '内容人员' },
      { code: '/ctr-analysis', name: 'CTR素材分析' },
    ]},
    { code: '/campaigns', name: '账户管理', children: [
      { code: '/campaigns', name: '账户列表' },
      { code: '/ai-trader', name: 'AI金牌投手' },
      { code: '/premium-materials', name: '优质素材' },
    ]},
    { code: '/audience', name: '达人管理', children: [
      { code: '/audience-profile', name: '产品人群画像' },
      { code: '/influencer-match', name: '达人合作筛选' },
    ]},
    { code: '/industry', name: '行业管理', children: [
      { code: '/industry-hotspot', name: '行业热点' },
      { code: '/industry-videos', name: '内容榜单' },
      { code: '/competitor-videos', name: '竞品爆款视频' },
    ]},
    { code: '/operations', name: '运营中心', children: [
      { code: '/ops-workbench', name: '运营工作台' },
      { code: '/ops-comments', name: '评论管理' },
      { code: '/push-manager', name: '数据推送管理' },
    ]},
    { code: '/wx-ops', name: '视频号运营中心', children: [
      { code: '/wx-ops-workbench', name: '运营工作台' },
      { code: '/wx-finder-list', name: '达人管理' },
    ]},
    { code: '/ks-ops', name: '快手运营中心', children: [
      { code: '/ks-workbench', name: '运营工作台' },
      { code: '/ks-live-analytics', name: '直播电商联动' },
      { code: '/ks-ad-dashboard', name: '账户管理' },
      { code: '/ks-ad-pitcher', name: 'AI金牌投手' },
      { code: '/ks-reviews', name: '评价管理' },
      { code: '/ks-ad-comments', name: '磁力短视频评论' },
    ]},
    { code: '/reports', name: '数据分析' },
    { code: '/alerts', name: '告警中心' },
    { code: '/system', name: '系统管理', children: [
      { code: '/accounts', name: '用户管理' },
      { code: '/role-manage', name: '角色管理' },
      { code: '/operation-logs', name: '操作日志' },
      { code: '/settings', name: '系统设置' },
    ]},
  ];
  res.json({ code: 0, data: menus });
});

// 抖音号（直播间）列表
router.get('/live-rooms', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nickname, aweme_name, advertiser_id FROM live_rooms WHERE status = 'active' ORDER BY nickname"
    );
    // 关联千川账户名作为所属店铺
    const [qcRows] = await db.query("SELECT advertiser_id, advertiser_name FROM qc_accounts");
    const qcMap = {};
    for (const r of qcRows) qcMap[String(r.advertiser_id)] = r.advertiser_name;
    const data = rows.map(r => ({
      id: r.id,
      nickname: r.nickname || r.aweme_name || String(r.id),
      advertiser_id: r.advertiser_id,
      advertiser_name: qcMap[String(r.advertiser_id)] || ''
    }));
    res.json({ code: 0, data });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 广告账户列表
router.get('/ad-accounts', auth(), async (req, res) => {
  try {
    const [qcRows] = await db.query("SELECT advertiser_id, advertiser_name FROM qc_accounts WHERE status = 1 ORDER BY advertiser_name");
    const [ksRows] = await db.query("SELECT advertiser_id, advertiser_name FROM ks_ad_accounts WHERE status = 1 ORDER BY advertiser_name");
    const [adqRows] = await db.query("SELECT account_id, account_name FROM adq_accounts WHERE status = 1 ORDER BY account_name");
    const [roomRows] = await db.query("SELECT id, nickname, aweme_name, advertiser_id FROM live_rooms WHERE status = 'active' ORDER BY nickname");

    // 按主体（account_name）分组 ADQ 账户
    const adqSubjectMap = {};
    for (const r of adqRows) {
      const name = r.account_name || '未命名主体';
      if (!adqSubjectMap[name]) adqSubjectMap[name] = { subject_name: name, account_ids: [] };
      adqSubjectMap[name].account_ids.push(String(r.account_id));
    }

    res.json({
      code: 0,
      data: {
        qianchuan: qcRows.map(r => ({ advertiser_id: String(r.advertiser_id), advertiser_name: r.advertiser_name || r.advertiser_id })),
        kuaishou: ksRows.map(r => ({ advertiser_id: String(r.advertiser_id), advertiser_name: r.advertiser_name || r.advertiser_id })),
        adq: adqRows.map(r => ({ advertiser_id: String(r.account_id), advertiser_name: r.account_name || r.account_id })),
        adq_subjects: Object.values(adqSubjectMap),
        live_rooms: roomRows.map(r => ({ id: r.id, nickname: r.nickname || r.aweme_name || String(r.id), advertiser_id: r.advertiser_id })),
      }
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
