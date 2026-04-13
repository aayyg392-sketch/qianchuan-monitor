const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const dayjs = require('dayjs');
const axios = require('axios');
const { sendRobotMessage } = require('../services/dingtalk');

const DINGTALK_APP_KEY = process.env.DINGTALK_APP_KEY;
const DINGTALK_APP_SECRET = process.env.DINGTALK_APP_SECRET;
const DINGTALK_AGENT_ID = process.env.DINGTALK_AGENT_ID;

// ============ 自动建表 ============
(async () => {
  try {
    // 主播列表表
    await db.query(`CREATE TABLE IF NOT EXISTS live_anchors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL COMMENT '主播名称',
      nickname VARCHAR(100) COMMENT '抖音昵称',
      phone VARCHAR(20) COMMENT '手机号',
      avatar VARCHAR(512) COMMENT '头像URL',
      dingtalk_id VARCHAR(100) COMMENT '钉钉用户ID',
      status ENUM('active','inactive','resigned') DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // 排班表
    await db.query(`CREATE TABLE IF NOT EXISTS live_anchor_schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      anchor_id INT NOT NULL COMMENT '关联主播',
      schedule_date DATE NOT NULL COMMENT '排班日期',
      start_time TIME NOT NULL COMMENT '开始时间',
      end_time TIME NOT NULL COMMENT '结束时间',
      room_id INT DEFAULT 1 COMMENT '关联直播间',
      status ENUM('scheduled','completed','cancelled','absent') DEFAULT 'scheduled',
      notify_status ENUM('pending','sent','failed') DEFAULT 'pending' COMMENT '钉钉通知状态',
      notes VARCHAR(255) COMMENT '备注',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_anchor (anchor_id),
      INDEX idx_date (schedule_date),
      INDEX idx_anchor_date (anchor_id, schedule_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    logger.info('[Anchor] 主播相关表初始化完成');
  } catch (err) {
    logger.error('[Anchor] 建表失败:', err.message);
  }
})();

// ============ 钉钉机器人单聊 ============

// 发送排班通知给单个主播
/**
 * 发送排班通知（合并同一主播当天所有时段为一条消息）
 * @param {Object} anchor - { id, name, dingtalk_userid }
 * @param {Array} schedules - [{ schedule_date, start_time, end_time }]
 */
async function sendDingtalkNotify(anchor, schedules) {
  const dtUserId = anchor.dingtalk_userid || anchor.dingtalk_id;
  if (!dtUserId) return { success: false, message: '未配置钉钉ID' };

  // 兼容旧调用（单个schedule）
  const scheduleList = Array.isArray(schedules) ? schedules : [schedules];
  const anchorId = anchor.id || anchor.aid || scheduleList[0].anchor_id;
  const scheduleDate = scheduleList[0].schedule_date;
  const date = dayjs(scheduleDate).format('M月D日');
  const weekDay = ['日','一','二','三','四','五','六'][dayjs(scheduleDate).day()];
  const title = `📋 排班通知 ${date}`;

  // 合并所有时段
  const timeSlotsText = scheduleList.map(s => {
    const start = String(s.start_time).slice(0,5);
    const end = String(s.end_time).slice(0,5);
    return `> ⏰ **${start} - ${end}**`;
  }).join('\n\n');

  // 查最近一场复盘的注意事项
  let tips = '';
  try {
    const [reviews] = await db.query(
      `SELECT comparison, high_convert_speeches FROM anchor_review_reports WHERE anchor_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
      [anchorId]);
    if (reviews.length) {
      const comp = reviews[0].comparison ? JSON.parse(reviews[0].comparison) : {};
      if (comp.improvements && comp.improvements.length) {
        tips += `\n### ⚠️ 上场直播注意事项\n\n`;
        comp.improvements.forEach(item => tips += `> 🔺 **${item}**\n\n`);
      }
      const speeches = reviews[0].high_convert_speeches ? JSON.parse(reviews[0].high_convert_speeches) : [];
      if (speeches.length) {
        const catMap = { selling_point:'卖点讲解', push_sale:'逼单促单', welfare:'福利发放', interact:'互动留人', product_intro:'产品介绍', other:'其他' };
        tips += `### 🎯 上场高转话术（可复用）\n\n`;
        speeches.slice(0, 3).forEach((s, i) => {
          const cat = catMap[s.category] || '其他';
          const txt = String(s.text || s.text_content || '').slice(0, 80);
          tips += `> **${i+1}. [${cat}]** ${txt}\n\n`;
        });
      }
    }
  } catch (e) { /* ignore */ }

  const text = `## 📋 排班通知\n\n` +
    `**${anchor.name}**，你好！\n\n` +
    `你 **${date}（周${weekDay}）** 的直播排班如下：\n\n` +
    timeSlotsText + `\n\n` +
    `共 **${scheduleList.length}** 场，请提前做好直播准备！\n\n` +
    tips +
    `---\n\n` +
    `📌 如有排班异议，请在 **2小时内** 联系排班负责人调整\n\n` +
    `> 查看排班详情 → [点击进入](https://business.snefe.com/anchor-schedule)`;

  await sendRobotMessage(dtUserId, title, text);
  logger.info(`[Anchor] 排班通知已发送: ${anchor.name} ${date} ${scheduleList.length}场`);
  return { success: true, message: '通知已发送' };
}

// 发送上播前提醒（含最近一次复盘注意事项）
async function sendPreLiveReminder(anchor, schedule) {
  const dtUserId = anchor.dingtalk_userid || anchor.dingtalk_id;
  if (!dtUserId) return;

  const start = String(schedule.start_time).slice(0,5);
  const end = String(schedule.end_time).slice(0,5);
  const title = `⏰ 上播提醒 ${start}`;

  // 查最近一次该主播的复盘改进建议
  let tips = '';
  try {
    const [reviews] = await db.query(
      `SELECT ai_analysis, comparison FROM anchor_review_reports WHERE anchor_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
      [anchor.id || schedule.anchor_id]);
    if (reviews.length) {
      const comp = reviews[0].comparison ? JSON.parse(reviews[0].comparison) : {};
      if (comp.improvements && comp.improvements.length) {
        tips = `\n### ⚠️ 上次复盘注意事项\n\n`;
        comp.improvements.forEach(item => tips += `> 🔺 **${item}**\n\n`);
      }
    }
  } catch (e) { logger.error('[Anchor] 查询复盘注意事项失败:', e.message); }

  const text = `## ⏰ 上播提醒\n\n` +
    `**${anchor.name}**，距离你的直播还有 **2小时**！\n\n` +
    `> ⏰ 时段：**${start} - ${end}**\n\n` +
    `### 📝 上播准备清单\n\n` +
    `> ✅ 检查直播间灯光、镜头、网络\n\n` +
    `> ✅ 准备好产品和话术\n\n` +
    `> ✅ 调整好状态，保持声音洪亮\n\n` +
    tips +
    `---\n\n` +
    `> 加油！祝直播顺利 💪`;

  await sendRobotMessage(dtUserId, title, text);
  logger.info(`[Anchor] 上播提醒已发送: ${anchor.name} ${start}-${end}`);
}

// ============ 主播管理 API ============

// 1. GET /anchors - 获取主播列表
router.get('/anchors', auth(), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM live_anchors WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    } else {
      // 默认不显示已离职主播
      sql += ' AND status != "resigned"';
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (err) {
    logger.error('[Anchor] 获取主播列表失败:', err.message);
    res.status(500).json({ code: -1, message: '获取主播列表失败' });
  }
});

// 2. POST /anchors - 新增主播
router.post('/anchors', auth(), async (req, res) => {
  try {
    const { name, nickname, phone, avatar, dingtalk_id } = req.body;
    if (!name) {
      return res.status(400).json({ code: -1, message: '主播名称不能为空' });
    }

    const [result] = await db.query(
      'INSERT INTO live_anchors (name, nickname, phone, avatar, dingtalk_id) VALUES (?, ?, ?, ?, ?)',
      [name, nickname || null, phone || null, avatar || null, dingtalk_id || null]
    );

    res.json({ code: 0, data: { id: result.insertId }, message: '新增主播成功' });
  } catch (err) {
    logger.error('[Anchor] 新增主播失败:', err.message);
    res.status(500).json({ code: -1, message: '新增主播失败' });
  }
});

// 3. PUT /anchors/:id - 编辑主播
router.put('/anchors/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nickname, phone, avatar, dingtalk_id, status } = req.body;

    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (nickname !== undefined) { fields.push('nickname = ?'); params.push(nickname); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (avatar !== undefined) { fields.push('avatar = ?'); params.push(avatar); }
    if (dingtalk_id !== undefined) { fields.push('dingtalk_id = ?'); params.push(dingtalk_id); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, message: '没有要更新的字段' });
    }

    params.push(id);
    await db.query(`UPDATE live_anchors SET ${fields.join(', ')} WHERE id = ?`, params);

    res.json({ code: 0, message: '更新主播成功' });
  } catch (err) {
    logger.error('[Anchor] 编辑主播失败:', err.message);
    res.status(500).json({ code: -1, message: '编辑主播失败' });
  }
});

// 4. DELETE /anchors/:id - 软删除主播
router.delete('/anchors/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE live_anchors SET status = "resigned" WHERE id = ?', [id]);
    res.json({ code: 0, message: '删除主播成功' });
  } catch (err) {
    logger.error('[Anchor] 删除主播失败:', err.message);
    res.status(500).json({ code: -1, message: '删除主播失败' });
  }
});

// ============ 排班管理 API ============

// 5. GET /schedules - 获取排班列表
router.get('/schedules', auth(), async (req, res) => {
  try {
    let { date_start, date_end, anchor_id } = req.query;

    // 默认返回未来3天的排班
    if (!date_start) {
      date_start = dayjs().format('YYYY-MM-DD');
    }
    if (!date_end) {
      date_end = dayjs().add(2, 'day').format('YYYY-MM-DD');
    }

    let sql = `
      SELECT s.*, a.name AS anchor_name, a.nickname AS anchor_nickname, a.avatar AS anchor_avatar
      FROM live_anchor_schedules s
      LEFT JOIN live_anchors a ON s.anchor_id = a.id
      WHERE s.schedule_date BETWEEN ? AND ?
    `;
    const params = [date_start, date_end];

    if (anchor_id) {
      sql += ' AND s.anchor_id = ?';
      params.push(anchor_id);
    }

    sql += ' ORDER BY s.schedule_date ASC, s.start_time ASC';

    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (err) {
    logger.error('[Anchor] 获取排班列表失败:', err.message);
    res.status(500).json({ code: -1, message: '获取排班列表失败' });
  }
});

// 6. POST /schedules - 新增排班（支持批量）
router.post('/schedules', auth(), async (req, res) => {
  try {
    const { anchor_id, dates, start_time, end_time, room_id, notes } = req.body;

    if (!anchor_id || !dates || !Array.isArray(dates) || dates.length === 0 || !start_time || !end_time) {
      return res.status(400).json({ code: -1, message: '参数不完整，需要anchor_id, dates数组, start_time, end_time' });
    }

    // 检查主播是否存在
    const [anchors] = await db.query('SELECT id FROM live_anchors WHERE id = ? AND status != "resigned"', [anchor_id]);
    if (anchors.length === 0) {
      return res.status(400).json({ code: -1, message: '主播不存在或已离职' });
    }

    const values = dates.map(date => [anchor_id, date, start_time, end_time, room_id || 1, notes || null]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const flatParams = values.flat();

    const [result] = await db.query(
      `INSERT INTO live_anchor_schedules (anchor_id, schedule_date, start_time, end_time, room_id, notes) VALUES ${placeholders}`,
      flatParams
    );

    res.json({ code: 0, data: { inserted: result.affectedRows }, message: '新增排班成功' });
  } catch (err) {
    logger.error('[Anchor] 新增排班失败:', err.message);
    res.status(500).json({ code: -1, message: '新增排班失败' });
  }
});

// 7. PUT /schedules/:id - 修改排班
router.put('/schedules/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { anchor_id, schedule_date, start_time, end_time, room_id, status, notes } = req.body;

    const fields = [];
    const params = [];

    if (anchor_id !== undefined) { fields.push('anchor_id = ?'); params.push(anchor_id); }
    if (schedule_date !== undefined) { fields.push('schedule_date = ?'); params.push(schedule_date); }
    if (start_time !== undefined) { fields.push('start_time = ?'); params.push(start_time); }
    if (end_time !== undefined) { fields.push('end_time = ?'); params.push(end_time); }
    if (room_id !== undefined) { fields.push('room_id = ?'); params.push(room_id); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (notes !== undefined) { fields.push('notes = ?'); params.push(notes); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, message: '没有要更新的字段' });
    }

    params.push(id);
    await db.query(`UPDATE live_anchor_schedules SET ${fields.join(', ')} WHERE id = ?`, params);

    res.json({ code: 0, message: '修改排班成功' });
  } catch (err) {
    logger.error('[Anchor] 修改排班失败:', err.message);
    res.status(500).json({ code: -1, message: '修改排班失败' });
  }
});

// 8. DELETE /schedules/:id - 删除排班
router.delete('/schedules/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM live_anchor_schedules WHERE id = ?', [id]);
    res.json({ code: 0, message: '删除排班成功' });
  } catch (err) {
    logger.error('[Anchor] 删除排班失败:', err.message);
    res.status(500).json({ code: -1, message: '删除排班失败' });
  }
});

// 9. POST /schedules/:id/notify - 发送单条排班通知（合并该主播当天所有时段）
router.post('/schedules/:id/notify', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, a.name, a.dingtalk_userid FROM live_anchor_schedules s
       LEFT JOIN live_anchors a ON s.anchor_id = a.id WHERE s.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ code: -1, message: '排班不存在' });
    const sch = rows[0];
    if (!sch.dingtalk_userid) return res.status(400).json({ code: -1, message: '该主播未配置钉钉ID' });

    // 查该主播当天所有排班合并推送
    const [allSlots] = await db.query(
      `SELECT schedule_date, start_time, end_time FROM live_anchor_schedules
       WHERE anchor_id=? AND schedule_date=? AND status != 'cancelled' ORDER BY start_time`,
      [sch.anchor_id, sch.schedule_date]);

    const result = await sendDingtalkNotify(
      { name: sch.name, dingtalk_userid: sch.dingtalk_userid, id: sch.anchor_id },
      allSlots.map(s => ({ anchor_id: sch.anchor_id, schedule_date: s.schedule_date, start_time: s.start_time, end_time: s.end_time }))
    );
    // 标记该主播当天所有排班为已通知
    await db.query('UPDATE live_anchor_schedules SET notify_status = ? WHERE anchor_id=? AND schedule_date=?',
      [result.success ? 'sent' : 'failed', sch.anchor_id, sch.schedule_date]);
    res.json({ code: 0, message: '通知已发送' });
  } catch (err) {
    logger.error('[Anchor] 发送通知失败:', err.message);
    res.status(500).json({ code: -1, message: '发送通知失败' });
  }
});

// 9b. POST /schedules/notify-all - 批量发送当天排班通知（按主播合并，一天一次）
router.post('/schedules/notify-all', auth(), async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ code: -1, message: '需要date参数' });

    const [rows] = await db.query(
      `SELECT s.*, a.name, a.dingtalk_userid, a.id as aid FROM live_anchor_schedules s
       LEFT JOIN live_anchors a ON s.anchor_id = a.id
       WHERE s.schedule_date = ? AND s.status != 'cancelled' ORDER BY s.start_time`, [date]);

    // 按主播分组
    const anchorMap = {};
    for (const sch of rows) {
      const key = sch.anchor_id;
      if (!anchorMap[key]) {
        anchorMap[key] = {
          anchor: { name: sch.name, dingtalk_userid: sch.dingtalk_userid, id: sch.anchor_id },
          schedules: [],
          scheduleIds: []
        };
      }
      anchorMap[key].schedules.push({
        anchor_id: sch.anchor_id, schedule_date: sch.schedule_date,
        start_time: sch.start_time, end_time: sch.end_time
      });
      anchorMap[key].scheduleIds.push(sch.id);
    }

    let sent = 0, skipped = 0;
    for (const key of Object.keys(anchorMap)) {
      const { anchor, schedules, scheduleIds } = anchorMap[key];
      if (!anchor.dingtalk_userid) { skipped++; continue; }
      try {
        await sendDingtalkNotify(anchor, schedules);
        for (const sid of scheduleIds) {
          await db.query('UPDATE live_anchor_schedules SET notify_status = "sent" WHERE id = ?', [sid]);
        }
        // 记录推送日志
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['schedule', date, anchor.dingtalk_userid, anchor.name, 'success']).catch(() => {});
        sent++;
      } catch (e) {
        logger.error(`[Anchor] 通知失败 ${anchor.name}: ${e.message}`);
        for (const sid of scheduleIds) {
          await db.query('UPDATE live_anchor_schedules SET notify_status = "failed" WHERE id = ?', [sid]);
        }
      }
    }
    // 读取推送配置，勾选了同步到群机器人才发送排班图片
    let groupMsg = '';
    try {
      const [cfgRows] = await db.query('SELECT config FROM push_configs WHERE id=1').catch(() => [[]]);
      if (cfgRows.length && cfgRows[0]?.config) {
        const cfg = typeof cfgRows[0].config === 'string' ? JSON.parse(cfgRows[0].config) : cfgRows[0].config;
        if (cfg.scheduleNotify?.sendToGroup) {
          const { sendScheduleImageToGroup } = require('../services/schedule-image');
          await sendScheduleImageToGroup(date);
          groupMsg = '，排班图片已同步到群';
        }
      }
    } catch (e) {
      logger.error('[Anchor] 排班图片群推送失败:', e.message);
    }

    res.json({ code: 0, message: `已发送 ${sent} 人，跳过 ${skipped} 人（未配置钉钉ID）${groupMsg}` });
  } catch (err) {
    logger.error('[Anchor] 批量通知失败:', err.message);
    res.status(500).json({ code: -1, message: '批量通知失败' });
  }
});

// ============ 主播数据统计 API ============

// 10. GET /stats - 获取主播数据统计
router.get('/stats', auth(), async (req, res) => {
  try {
    const { anchor_id, date_type = 'day', date } = req.query;
    if (!date) return res.status(400).json({ code: -1, message: '需要date参数' });

    const baseDate = dayjs(date);
    let dateStart, dateEnd;
    switch (date_type) {
      case 'week':
        dateStart = baseDate.startOf('week').add(1, 'day').format('YYYY-MM-DD');
        dateEnd = baseDate.endOf('week').add(1, 'day').format('YYYY-MM-DD');
        break;
      case 'month':
        dateStart = baseDate.startOf('month').format('YYYY-MM-DD');
        dateEnd = baseDate.endOf('month').format('YYYY-MM-DD');
        break;
      default:
        dateStart = baseDate.format('YYYY-MM-DD');
        dateEnd = baseDate.format('YYYY-MM-DD');
    }

    // 1. 查排班
    const anchorWhere = anchor_id ? 's.anchor_id = ? AND ' : '';
    const schParams = anchor_id ? [anchor_id, dateStart, dateEnd] : [dateStart, dateEnd];
    const [schedules] = await db.query(
      `SELECT s.id, s.anchor_id, a.name AS anchor_name, s.schedule_date, s.start_time, s.end_time, s.room_id
       FROM live_anchor_schedules s LEFT JOIN live_anchors a ON a.id = s.anchor_id
       WHERE ${anchorWhere}s.schedule_date BETWEEN ? AND ? AND s.status != 'cancelled'
       ORDER BY s.schedule_date ASC, s.start_time ASC`, schParams);

    const emptyResult = { anchors: [], schedules: [], trend: { dates: [], series: [] },
      summary: { total_gmv: 0, total_orders: 0, total_cost: 0, avg_roi: 0, peak_online: 0,
        total_hours: 0, conversion_rate: 0, avg_cvr: 0, total_product_click: 0, total_cart_count: 0 } };
    if (!schedules.length) return res.json({ code: 0, data: { date_type, date_start: dateStart, date_end: dateEnd, ...emptyResult } });

    // 2. 批量查询当天所有实时数据（一次查询代替36次）
    const now = dayjs();
    const [allRealtime] = await db.query(
      `SELECT recorded_at, gmv, order_count, qianchuan_cost, online_count,
              product_click, cart_count, total_viewers, interact_rate, avg_stay_seconds,
              comment_count, like_count, share_count
       FROM live_realtime_data WHERE room_id = 1 AND DATE(recorded_at) BETWEEN ? AND ?
       ORDER BY recorded_at ASC`,
      [dateStart, dateEnd]);

    // 构建时间索引便于快速查找
    const rtData = allRealtime.map(r => ({
      t: new Date(r.recorded_at).getTime(),
      gmv: parseFloat(r.gmv) || 0,
      orders: parseInt(r.order_count) || 0,
      cost: parseFloat(r.qianchuan_cost) || 0,
      online: parseInt(r.online_count) || 0,
      clicks: parseInt(r.product_click) || 0,
      carts: parseInt(r.cart_count) || 0,
      viewers: parseInt(r.total_viewers) || 0,
      interact: parseFloat(r.interact_rate) || 0,
      stay: parseInt(r.avg_stay_seconds) || 0
    }));

    function getSlotData(startDt, endDt) {
      const s = new Date(startDt).getTime();
      const e = new Date(endDt).getTime();
      const inRange = rtData.filter(r => r.t >= s && r.t <= e);
      if (!inRange.length) return { gmv: 0, orders: 0, cost: 0, peak: 0, clicks: 0, carts: 0, viewers: 0, avgInteract: 0, avgStay: 0 };
      const first = inRange[0];
      const last = inRange[inRange.length - 1];
      const avgInteract = inRange.reduce((s, r) => s + r.interact, 0) / inRange.length;
      const avgStay = inRange.reduce((s, r) => s + r.stay, 0) / inRange.length;
      return {
        gmv: Math.max(0, last.gmv - first.gmv),
        orders: Math.max(0, last.orders - first.orders),
        cost: Math.max(0, last.cost - first.cost),
        peak: Math.max(...inRange.map(r => r.online)),
        clicks: Math.max(0, last.clicks - first.clicks),
        carts: Math.max(0, last.carts - first.carts),
        viewers: Math.max(0, last.viewers - first.viewers),
        avgInteract: parseFloat(avgInteract.toFixed(2)),
        avgStay: Math.round(avgStay)
      };
    }

    const anchorMap = {};
    const enrichedSchedules = [];

    for (const sch of schedules) {
      const schDate = dayjs(sch.schedule_date).format('YYYY-MM-DD');
      const startDt = schDate + ' ' + sch.start_time;
      const endDt = schDate + ' ' + sch.end_time;
      const startMoment = dayjs(startDt);
      const endMoment = dayjs(endDt);

      let gmv = 0, orders = 0, cost = 0, peak = 0, roi = 0, clicks = 0, carts = 0, viewers = 0, avgInteract = 0, avgStay = 0;

      if (now.isAfter(startMoment)) {
        const actualEnd = now.isBefore(endMoment) ? now.format('YYYY-MM-DD HH:mm:ss') : endDt;
        const slot = getSlotData(startDt, actualEnd);
        gmv = slot.gmv; orders = slot.orders; cost = slot.cost; peak = slot.peak;
        clicks = slot.clicks; carts = slot.carts; viewers = slot.viewers;
        avgInteract = slot.avgInteract; avgStay = slot.avgStay;
        roi = cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0;
      }

      const [sh, sm] = sch.start_time.split(':').map(Number);
      const [eh, em] = sch.end_time.split(':').map(Number);
      const mins = eh * 60 + em - sh * 60 - sm;

      const aid = sch.anchor_id;
      if (!anchorMap[aid]) {
        anchorMap[aid] = { anchor_id: aid, name: sch.anchor_name || '', gmv: 0, orders: 0, cost: 0, peak_online: 0, minutes: 0,
          clicks: 0, carts: 0, viewers: 0, interactSum: 0, staySum: 0, slotCount: 0 };
      }
      anchorMap[aid].gmv += gmv;
      anchorMap[aid].orders += orders;
      anchorMap[aid].cost += cost;
      anchorMap[aid].clicks += clicks;
      anchorMap[aid].carts += carts;
      anchorMap[aid].viewers += viewers;
      anchorMap[aid].interactSum += avgInteract;
      anchorMap[aid].staySum += avgStay;
      anchorMap[aid].slotCount += 1;
      anchorMap[aid].minutes += mins;
      if (peak > anchorMap[aid].peak_online) anchorMap[aid].peak_online = peak;

      let status = 'scheduled', completion = 0;
      if (now.isAfter(endMoment)) { status = 'completed'; completion = 100; }
      else if (now.isAfter(startMoment)) {
        status = 'in_progress';
        completion = Math.round(now.diff(startMoment, 'minute') / endMoment.diff(startMoment, 'minute') * 100);
      }
      enrichedSchedules.push({
        anchor_id: aid, anchor_name: sch.anchor_name, date: schDate,
        start_time: sch.start_time, end_time: sch.end_time,
        gmv: parseFloat(gmv.toFixed(2)), orders, cost: parseFloat(cost.toFixed(2)), roi,
        status, completion
      });
    }

    // 3. 总览：按每天分别计算增量再求和（千川数据每天零点重置）
    const peakOnline = rtData.length ? Math.max(...rtData.map(r => r.online)) : 0;
    let totalGmv = 0, totalOrders = 0, totalCost = 0;
    if (rtData.length) {
      // 按日期分组
      const dayMap = {};
      for (const r of allRealtime) {
        const d = dayjs(r.recorded_at).format('YYYY-MM-DD');
        if (!dayMap[d]) dayMap[d] = [];
        dayMap[d].push({ gmv: parseFloat(r.gmv) || 0, orders: parseInt(r.order_count) || 0, cost: parseFloat(r.qianchuan_cost) || 0 });
      }
      for (const [, recs] of Object.entries(dayMap)) {
        if (recs.length < 2) continue;
        const first = recs[0], last = recs[recs.length - 1];
        totalGmv += Math.max(0, last.gmv - first.gmv);
        totalOrders += Math.max(0, last.orders - first.orders);
        totalCost += Math.max(0, last.cost - first.cost);
      }
    }

    // 3. 主播排行：用时段增量比例分配日总额（避免数据膨胀问题）
    const rawGmvSum = Object.values(anchorMap).reduce((s, a) => s + a.gmv, 0);
    const rawOrderSum = Object.values(anchorMap).reduce((s, a) => s + a.orders, 0);
    const rawCostSum = Object.values(anchorMap).reduce((s, a) => s + a.cost, 0);
    const anchorsList = Object.values(anchorMap).map(a => {
      // 按增量比例分配正确的日总额
      const gmvShare = rawGmvSum > 0 ? a.gmv / rawGmvSum : 0;
      const orderShare = rawOrderSum > 0 ? a.orders / rawOrderSum : 0;
      const costShare = rawCostSum > 0 ? a.cost / rawCostSum : 0;
      const gmv = parseFloat((totalGmv * gmvShare).toFixed(2));
      const orders = Math.round(totalOrders * orderShare);
      const cost = parseFloat((totalCost * costShare).toFixed(2));
      return {
        anchor_id: a.anchor_id, name: a.name,
        hours: parseFloat((a.minutes / 60).toFixed(1)),
        gmv, orders, cost,
        roi: cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0,
        peak_online: a.peak_online,
        cvr: a.clicks > 0 ? parseFloat((a.orders / a.clicks * 100).toFixed(2)) : 0,
        click_rate: a.viewers > 0 ? parseFloat((a.clicks / a.viewers * 100).toFixed(2)) : 0,
        interact_rate: a.slotCount > 0 ? parseFloat((a.interactSum / a.slotCount).toFixed(2)) : 0,
        avg_stay: a.slotCount > 0 ? Math.round(a.staySum / a.slotCount) : 0
      };
    });

    // 排班明细也按比例校准
    const rawSchGmvSum = enrichedSchedules.reduce((s, sc) => s + sc.gmv, 0);
    const rawSchOrderSum = enrichedSchedules.reduce((s, sc) => s + sc.orders, 0);
    const rawSchCostSum = enrichedSchedules.reduce((s, sc) => s + sc.cost, 0);
    for (const sc of enrichedSchedules) {
      const gs = rawSchGmvSum > 0 ? sc.gmv / rawSchGmvSum : 0;
      const os = rawSchOrderSum > 0 ? sc.orders / rawSchOrderSum : 0;
      const cs = rawSchCostSum > 0 ? sc.cost / rawSchCostSum : 0;
      sc.gmv = parseFloat((totalGmv * gs).toFixed(2));
      sc.orders = Math.round(totalOrders * os);
      sc.cost = parseFloat((totalCost * cs).toFixed(2));
      sc.roi = sc.cost > 0 ? parseFloat((sc.gmv / sc.cost).toFixed(2)) : 0;
    }

    const totalHours = anchorsList.reduce((s, a) => s + a.hours, 0);
    const avgRoi = totalCost > 0 ? parseFloat((totalGmv / totalCost).toFixed(2)) : 0;

    // 5. 计算上一周期对比（vs昨日/vs上周/vs上月）
    let prevGmv = 0, prevOrders = 0, prevCost = 0, prevHours = 0;
    try {
      let prevStart, prevEnd;
      const rangeDays = dayjs(dateEnd).diff(dayjs(dateStart), 'day') + 1;
      prevStart = dayjs(dateStart).subtract(rangeDays, 'day').format('YYYY-MM-DD');
      prevEnd = dayjs(dateEnd).subtract(rangeDays, 'day').format('YYYY-MM-DD');

      // 上一周期排班时长
      const [prevSchRows] = await db.query(
        `SELECT start_time, end_time FROM live_anchor_schedules WHERE schedule_date BETWEEN ? AND ? AND status != 'cancelled'`,
        [prevStart, prevEnd]);
      for (const ps of prevSchRows) {
        const [sh, sm] = ps.start_time.split(':').map(Number);
        const [eh, em] = ps.end_time.split(':').map(Number);
        prevHours += (eh * 60 + em - sh * 60 - sm) / 60;
      }

      // 上一周期GMV/订单/消耗
      const [prevRt] = await db.query(
        `SELECT DATE(recorded_at) as d, MIN(gmv) as min_gmv, MAX(gmv) as max_gmv,
                MIN(order_count) as min_orders, MAX(order_count) as max_orders,
                MIN(qianchuan_cost) as min_cost, MAX(qianchuan_cost) as max_cost
         FROM live_realtime_data WHERE room_id = 1 AND DATE(recorded_at) BETWEEN ? AND ?
         GROUP BY DATE(recorded_at)`, [prevStart, prevEnd]);
      for (const pr of prevRt) {
        prevGmv += Math.max(0, parseFloat(pr.max_gmv) - parseFloat(pr.min_gmv));
        prevOrders += Math.max(0, parseInt(pr.max_orders) - parseInt(pr.min_orders));
        prevCost += Math.max(0, parseFloat(pr.max_cost) - parseFloat(pr.min_cost));
      }
    } catch (e) { logger.error('[Anchor] 对比数据查询失败', e.message); }

    function calcChange(cur, prev) {
      if (!prev || prev === 0) return 0;
      return parseFloat(((cur - prev) / prev * 100).toFixed(1));
    }
    const prevRoi = prevCost > 0 ? prevGmv / prevCost : 0;

    res.json({
      code: 0,
      data: {
        anchor_id: anchor_id ? parseInt(anchor_id) : null,
        date_type, date_start: dateStart, date_end: dateEnd,
        schedules: enrichedSchedules,
        anchors: anchorsList,
        trend: { dates: [], series: [] },
        summary: (() => {
          const aa = Object.values(anchorMap);
          const tClicks = aa.reduce((s,a) => s + a.clicks, 0);
          const tViewers = aa.reduce((s,a) => s + a.viewers, 0);
          const tSlots = aa.reduce((s,a) => s + a.slotCount, 0);
          const sInteract = tSlots > 0 ? parseFloat((aa.reduce((s,a) => s + a.interactSum, 0) / tSlots).toFixed(2)) : 0;
          const sStay = tSlots > 0 ? Math.round(aa.reduce((s,a) => s + a.staySum, 0) / tSlots) : 0;
          const sCvr = tClicks > 0 ? parseFloat((totalOrders / tClicks * 100).toFixed(2)) : 0;
          const sCtr = tViewers > 0 ? parseFloat((tClicks / tViewers * 100).toFixed(2)) : 0;
          return {
            total_gmv: totalGmv, avg_roi: avgRoi,
            avg_cvr: sCvr, avg_ctr: sCtr, avg_interact: sInteract, avg_stay: sStay,
            total_hours: parseFloat(totalHours.toFixed(1)),
            gmv_change: calcChange(totalGmv, prevGmv),
            roi_change: calcChange(avgRoi, prevRoi),
            hours_change: calcChange(totalHours, prevHours),
            cvr_change: 0, ctr_change: 0, interact_change: 0, stay_change: 0
          };
        })()
      }
    });
  } catch (err) {
    logger.error('[Anchor] 获取主播统计失败:', err.message, err.stack);
    res.status(500).json({ code: -1, message: '获取主播统计失败' });
  }
});

// ========== 主播复盘报告 ==========

// GET /reviews - 列表查询
router.get('/reviews', auth(), async (req, res) => {
  try {
    const { anchor_id, date_start, date_end, page = 1, pageSize = 50 } = req.query;
    const where = ['1=1'];
    const params = [];
    if (anchor_id) { where.push('r.anchor_id = ?'); params.push(anchor_id); }
    if (date_start) { where.push('r.schedule_date >= ?'); params.push(date_start); }
    if (date_end) { where.push('r.schedule_date <= ?'); params.push(date_end); }

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [rows] = await db.query(
      `SELECT r.* FROM anchor_review_reports r WHERE ${where.join(' AND ')} ORDER BY r.schedule_date DESC, r.start_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]);
    const [countRes] = await db.query(
      `SELECT COUNT(*) as total FROM anchor_review_reports r WHERE ${where.join(' AND ')}`, params);

    const reviews = rows.map(r => ({
      ...r,
      high_convert_speeches: r.high_convert_speeches ? JSON.parse(r.high_convert_speeches) : [],
      comparison: r.comparison ? JSON.parse(r.comparison) : { highlights: [], improvements: [] },
      schedule_date: dayjs(r.schedule_date).format('YYYY-MM-DD')
    }));
    res.json({ code: 0, data: { reviews, total: countRes[0].total } });
  } catch (err) {
    logger.error('[Anchor] 获取复盘列表失败:', err.message);
    res.status(500).json({ code: -1, message: '获取复盘列表失败' });
  }
});

// GET /reviews/:scheduleId - 单条详情
router.get('/reviews/:scheduleId', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM anchor_review_reports WHERE schedule_id = ?', [req.params.scheduleId]);
    if (!rows.length) return res.status(404).json({ code: -1, message: '报告不存在' });
    const r = rows[0];
    r.high_convert_speeches = r.high_convert_speeches ? JSON.parse(r.high_convert_speeches) : [];
    r.schedule_date = dayjs(r.schedule_date).format('YYYY-MM-DD');
    res.json({ code: 0, data: r });
  } catch (err) {
    logger.error('[Anchor] 获取复盘详情失败:', err.message);
    res.status(500).json({ code: -1, message: '获取复盘详情失败' });
  }
});

// POST /reviews/:scheduleId/regenerate - 手动重新生成
router.post('/reviews/:scheduleId/regenerate', auth(), async (req, res) => {
  try {
    const scheduleId = req.params.scheduleId;
    const [schRows] = await db.query(
      `SELECT s.*, a.name AS anchor_name FROM live_anchor_schedules s LEFT JOIN live_anchors a ON a.id = s.anchor_id WHERE s.id = ?`,
      [scheduleId]);
    if (!schRows.length) return res.status(404).json({ code: -1, message: '排班不存在' });
    // 删除旧报告
    await db.query('DELETE FROM anchor_review_reports WHERE schedule_id = ?', [scheduleId]);
    // 异步生成
    const { generateReviewForSchedule } = require('../services/anchor-review');
    const sch = schRows[0];
    generateReviewForSchedule({
      id: sch.id, anchor_id: sch.anchor_id, anchor_name: sch.anchor_name,
      schedule_date: dayjs(sch.schedule_date).format('YYYY-MM-DD'),
      start_time: sch.start_time, end_time: sch.end_time, room_id: sch.room_id || 1
    }).catch(e => logger.error('[Anchor] 重新生成复盘失败:', e.message));
    res.json({ code: 0, message: '正在重新生成' });
  } catch (err) {
    logger.error('[Anchor] 重新生成复盘失败:', err.message);
    res.status(500).json({ code: -1, message: '重新生成失败' });
  }
});

// POST /reviews/:scheduleId/notify - 手动推送钉钉
router.post('/reviews/:scheduleId/notify', auth(), async (req, res) => {
  try {
    const { sendDingTalkForSchedule } = require('../services/anchor-review');
    await sendDingTalkForSchedule(req.params.scheduleId);
    res.json({ code: 0, message: '钉钉推送成功' });
  } catch (err) {
    logger.error('[Anchor] 钉钉推送失败:', err.message);
    res.status(500).json({ code: -1, message: err.message });
  }
});

// ============ 推送配置管理 ============

// 自动建表
db.query(`CREATE TABLE IF NOT EXISTS push_configs (
  id INT PRIMARY KEY DEFAULT 1,
  config JSON,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`).catch(() => {});

// GET /push-configs - 获取推送配置
router.get('/push-configs', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT config FROM push_configs WHERE id=1');
    if (rows.length > 0 && rows[0].config) {
      res.json({ code: 0, data: typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config });
    } else {
      res.json({ code: 0, data: null });
    }
  } catch (e) {
    res.json({ code: 0, data: null });
  }
});

// POST /push-configs - 保存推送配置
router.post('/push-configs', auth(), async (req, res) => {
  try {
    const configStr = JSON.stringify(req.body);
    logger.info('[PushConfig] 保存配置: ' + configStr.slice(0, 500));
    await db.query('INSERT INTO push_configs (id, config) VALUES (1, ?) ON DUPLICATE KEY UPDATE config=?, updated_at=NOW()', [configStr, configStr]);
    res.json({ code: 0, message: '保存成功' });
  } catch (e) {
    logger.error('[Anchor] 保存推送配置失败:', e.message);
    res.status(500).json({ code: -1, message: e.message });
  }
});

/**
 * 自动推送报表（供cron调用）
 * 检查最后一场直播结束后delay分钟，自动推送到配置的webhook和个人
 */
async function autoSendReport(targetDate, endStr) {
  try {
    const [rows] = await db.query('SELECT config FROM push_configs WHERE id=1');
    if (!rows.length || !rows[0].config) return;
    const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
    if (!cfg.liveReport || !cfg.liveReport.enabled) return;

    const { generateReportImage } = require('../services/report-image');
    const { sendWebhookMessage, sendRobotMessage } = require('../services/dingtalk');

    const date = targetDate || dayjs().format('YYYY-MM-DD');
    const imgPath = await generateReportImage(date);
    const fileName = require('path').basename(imgPath);
    const imgUrl = `https://business.snefe.com/report-images/${fileName}`;
    const displayDate = dayjs(date).format('M月D日');
    const slotTag = endStr ? ` ${endStr}` : '';
    const title = `📊 直播数据 ${displayDate}${slotTag}`;
    const text = `## 📊 直播投放数据 ${displayDate}${slotTag}\n\n![报表](${imgUrl})`;

    // 发送到webhook群
    const webhooks = (cfg.liveReport.webhooks || []).filter(w => w.enabled && w.url);
    for (const wh of webhooks) {
      try {
        await sendWebhookMessage(wh.url, title, text);
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['auto_report', date, `webhook_${wh.name||'群'}_${endStr||''}`, wh.name||'群机器人', 'success']).catch(() => {});
        logger.info(`[AutoPush] 报表已推送到群: ${wh.name} (${endStr||'手动'})`);
      } catch (e) {
        logger.error(`[AutoPush] 群${wh.name}推送失败:`, e.message);
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['auto_report', date, `webhook_${wh.name||'群'}_${endStr||''}`, wh.name||'群机器人', 'fail']).catch(() => {});
      }
    }

    // 发送到个人UserID
    const userIds = (cfg.liveReport.customUserIds || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const uid of userIds) {
      try {
        await sendRobotMessage(uid, title, text);
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['auto_report', date, `${uid}_${endStr||''}`, uid, 'success']).catch(() => {});
        logger.info(`[AutoPush] 报表已推送到个人: ${uid} (${endStr||'手动'})`);
      } catch (e) {
        logger.error(`[AutoPush] 个人${uid}推送失败:`, e.message);
        await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
          ['auto_report', date, `${uid}_${endStr||''}`, uid, 'fail']).catch(() => {});
      }
    }

    // 清理旧图
    const fs = require('fs');
    const STATIC_DIR = '/home/www/qianchuan-monitor/frontend/dist/report-images';
    try { const files=fs.readdirSync(STATIC_DIR); const cut=Date.now()-600000; files.forEach(f=>{const fp=require('path').join(STATIC_DIR,f);if(fs.statSync(fp).mtimeMs<cut)fs.unlinkSync(fp)}); } catch(e){}
  } catch (e) {
    logger.error('[AutoPush] 自动推送报表失败:', e.message);
  }
}

// 导出供cron使用
router.autoSendReport = autoSendReport;

// POST /report/send - 手动发送直播数据报表图片
router.post('/report/send', auth(), async (req, res) => {
  try {
    const { date, webhooks, userIds } = req.body;
    const { generateReportImage } = require('../services/report-image');
    const { sendWebhookMessage, sendRobotMessage } = require('../services/dingtalk');
    const targetDate = date || dayjs().format('YYYY-MM-DD');
    const results = [];

    // 生成报表图片（只生成一次）
    const imgPath = await generateReportImage(targetDate);
    const fileName = require('path').basename(imgPath);
    const imgUrl = `https://business.snefe.com/report-images/${fileName}`;
    const displayDate = dayjs(targetDate).format('M月D日');
    const title = `📊 直播数据 ${displayDate}`;
    const text = `## 📊 直播投放数据 ${displayDate}\n\n![报表](${imgUrl})`;

    // 1. 发送到群机器人Webhook（支持多个）
    if (webhooks && webhooks.length > 0) {
      for (const wh of webhooks) {
        const whName = wh.name || '未命名群';
        try {
          await sendWebhookMessage(wh.url, title, text);
          await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
            ['report', targetDate, 'webhook_' + whName, whName, 'success']).catch(() => {});
          results.push(whName);
        } catch (e) {
          logger.error(`[Anchor] 群机器人${whName}推送失败:`, e.message);
          await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
            ['report', targetDate, 'webhook_' + whName, whName, 'fail']).catch(() => {});
        }
      }
    }

    // 2. 发送到个人UserID（机器人单聊）
    if (userIds && userIds.length > 0) {
      for (const uid of userIds) {
        if (!uid.trim()) continue;
        try {
          await sendRobotMessage(uid.trim(), title, text);
          await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
            ['report', targetDate, uid.trim(), uid.trim(), 'success']).catch(() => {});
          results.push(uid.trim());
        } catch (e) {
          logger.error(`[Anchor] UserID ${uid} 推送失败:`, e.message);
          await db.query('INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at) VALUES (?,?,?,?,?,NOW())',
            ['report', targetDate, uid.trim(), uid.trim(), 'fail']).catch(() => {});
        }
      }
    }

    // 清理旧图
    const fs = require('fs');
    const STATIC_DIR = '/home/www/qianchuan-monitor/frontend/dist/report-images';
    try { const files=fs.readdirSync(STATIC_DIR); const cut=Date.now()-600000; files.forEach(f=>{const fp=require('path').join(STATIC_DIR,f);if(fs.statSync(fp).mtimeMs<cut)fs.unlinkSync(fp)}); } catch(e){}

    res.json({ code: 0, message: results.length > 0 ? `已推送: ${results.join(', ')}` : '无推送目标' });
  } catch (err) {
    logger.error('[Anchor] 报表发送失败:', err.message);
    res.status(500).json({ code: -1, message: err.message });
  }
});

// GET /push-logs - 推送记录
router.get('/push-logs', auth(), async (req, res) => {
  try {
    const { date, type, page = 1, pageSize = 50 } = req.query;
    const where = ['1=1'];
    const params = [];
    if (date) { where.push('DATE(created_at) = ?'); params.push(date); }
    if (type) { where.push('push_type = ?'); params.push(type); }
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [rows] = await db.query(
      `SELECT * FROM push_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]);
    const [cnt] = await db.query(`SELECT COUNT(*) as total FROM push_logs WHERE ${where.join(' AND ')}`, params);
    res.json({ code: 0, data: { logs: rows, total: cnt[0].total } });
  } catch (err) {
    res.json({ code: 0, data: { logs: [], total: 0 } });
  }
});

// 自动建push_logs表
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS push_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      push_type VARCHAR(30) NOT NULL COMMENT 'report/review/schedule',
      push_date DATE,
      receiver_id VARCHAR(50),
      receiver_name VARCHAR(50),
      status ENUM('success','failed') DEFAULT 'success',
      error_msg VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_date (push_date),
      INDEX idx_type (push_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) {}
})();

// ============ 主播分析 API ============

// GET /anchor-analysis/:anchorId - 主播近15日综合分析
router.get('/anchor-analysis/:anchorId', auth(), async (req, res) => {
  try {
    const { anchorId } = req.params;

    // 查主播信息
    const [anchorRows] = await db.query('SELECT * FROM live_anchors WHERE id = ?', [anchorId]);
    if (!anchorRows.length) return res.status(404).json({ code: -1, message: '主播不存在' });
    const anchor = anchorRows[0];

    // 近15天排班
    const dateEnd = dayjs().format('YYYY-MM-DD');
    const dateStart = dayjs().subtract(14, 'day').format('YYYY-MM-DD');

    const [schedules] = await db.query(
      `SELECT s.id, s.anchor_id, s.schedule_date, s.start_time, s.end_time, s.room_id
       FROM live_anchor_schedules s
       WHERE s.anchor_id = ? AND s.schedule_date BETWEEN ? AND ? AND s.status != 'cancelled'
       ORDER BY s.schedule_date ASC, s.start_time ASC`,
      [anchorId, dateStart, dateEnd]
    );

    if (!schedules.length) {
      return res.json({ code: 0, data: { dailyTrend: [], bestTimeSlots: [], aiAnalysis: null, message: '近15日无排班数据' } });
    }

    // 用SQL直接按排班时段聚合（避免加载全量数据）
    const slotResults = [];
    for (const sch of schedules) {
      const schDate = dayjs(sch.schedule_date).format('YYYY-MM-DD');
      const startDt = schDate + ' ' + sch.start_time;
      const endDt = schDate + ' ' + sch.end_time;
      const [rows] = await db.query(
        `SELECT MIN(gmv) as min_gmv, MAX(gmv) as max_gmv,
                MIN(order_count) as min_orders, MAX(order_count) as max_orders,
                MIN(qianchuan_cost) as min_cost, MAX(qianchuan_cost) as max_cost,
                MAX(online_count) as peak
         FROM live_realtime_data WHERE room_id = 1 AND recorded_at BETWEEN ? AND ?`,
        [startDt, endDt]);
      const r = rows[0] || {};
      slotResults.push({
        date: schDate, start_time: sch.start_time, end_time: sch.end_time,
        gmv: Math.max(0, (parseFloat(r.max_gmv)||0) - (parseFloat(r.min_gmv)||0)),
        orders: Math.max(0, (parseInt(r.max_orders)||0) - (parseInt(r.min_orders)||0)),
        cost: Math.max(0, (parseFloat(r.max_cost)||0) - (parseFloat(r.min_cost)||0)),
        peak: parseInt(r.peak) || 0
      });
    }

    // 按日期聚合
    const dailyMap = {};
    const timeSlotMap = {
      morning: { label: '上午 (6:00-12:00)', totalGmv: 0, totalOrders: 0, totalCost: 0, count: 0 },
      afternoon: { label: '下午 (12:00-18:00)', totalGmv: 0, totalOrders: 0, totalCost: 0, count: 0 },
      evening: { label: '晚上 (18:00-24:00)', totalGmv: 0, totalOrders: 0, totalCost: 0, count: 0 },
      night: { label: '凌晨 (0:00-6:00)', totalGmv: 0, totalOrders: 0, totalCost: 0, count: 0 }
    };

    for (const slot of slotResults) {
      if (!dailyMap[slot.date]) dailyMap[slot.date] = { date: slot.date, gmv: 0, orders: 0, cost: 0, peak_online: 0 };
      dailyMap[slot.date].gmv += slot.gmv;
      dailyMap[slot.date].orders += slot.orders;
      dailyMap[slot.date].cost += slot.cost;
      if (slot.peak > dailyMap[slot.date].peak_online) dailyMap[slot.date].peak_online = slot.peak;

      const startHour = parseInt(slot.start_time.split(':')[0]);
      let timeKey;
      if (startHour >= 6 && startHour < 12) timeKey = 'morning';
      else if (startHour >= 12 && startHour < 18) timeKey = 'afternoon';
      else if (startHour >= 18) timeKey = 'evening';
      else timeKey = 'night';

      timeSlotMap[timeKey].totalGmv += slot.gmv;
      timeSlotMap[timeKey].totalOrders += slot.orders;
      timeSlotMap[timeKey].totalCost += slot.cost;
      timeSlotMap[timeKey].count += 1;
    }

    const dailyTrend = Object.values(dailyMap).map(d => ({
      date: d.date,
      gmv: parseFloat(d.gmv.toFixed(2)),
      orders: d.orders,
      roi: d.cost > 0 ? parseFloat((d.gmv / d.cost).toFixed(2)) : 0
    }));

    const bestTimeSlots = Object.entries(timeSlotMap)
      .filter(([, v]) => v.count > 0)
      .map(([key, v]) => ({
        slot: key,
        label: v.label,
        avgGmv: parseFloat((v.totalGmv / v.count).toFixed(2)),
        avgRoi: v.totalCost > 0 ? parseFloat((v.totalGmv / v.totalCost).toFixed(2)) : 0,
        sessions: v.count
      }))
      .sort((a, b) => b.avgGmv - a.avgGmv);

    // 汇总统计供AI使用
    const totalGmv = dailyTrend.reduce((s, d) => s + d.gmv, 0);
    const totalOrders = dailyTrend.reduce((s, d) => s + d.orders, 0);
    const avgRoi = dailyTrend.filter(d => d.roi > 0).length > 0
      ? (dailyTrend.reduce((s, d) => s + d.roi, 0) / dailyTrend.filter(d => d.roi > 0).length).toFixed(2)
      : 0;
    const totalDays = dailyTrend.length;

    // 基于纯数据生成评分（不依赖AI，秒级响应）
    const avgDailyGmv = totalDays > 0 ? totalGmv / totalDays : 0;
    const avgDailyOrders = totalDays > 0 ? totalOrders / totalDays : 0;
    const avgRoiNum = parseFloat(avgRoi) || 0;

    // 按数据维度打分（基于行业基准）
    // 评分维度：转化率、点击率、互动、停留率、销售
    const scores = {
      cvr: Math.min(10, Math.max(1, Math.round(avgRoiNum * 2.5))),           // 转化率
      ctr: Math.min(10, Math.max(1, Math.round(avgRoiNum * 2))),             // 点击率
      interaction: Math.min(10, Math.max(1, Math.round(avgDailyOrders / 40))), // 互动
      retention: Math.min(10, Math.max(1, totalDays >= 10 ? 8 : Math.round(totalDays * 0.8))), // 停留率
      sales: Math.min(10, Math.max(1, Math.round(avgDailyGmv / 5000)))       // 销售
    };

    // 生成基于数据的洞察
    const strengths = [];
    const weaknesses = [];
    if (avgRoiNum >= 2) strengths.push(`ROI表现优秀(${avgRoiNum})，投产比高于行业均值`);
    else weaknesses.push(`ROI偏低(${avgRoiNum})，需优化转化话术或流量精准度`);
    if (avgDailyGmv >= 30000) strengths.push(`日均GMV ¥${(avgDailyGmv/10000).toFixed(1)}w，产出稳定`);
    else weaknesses.push(`日均GMV ¥${avgDailyGmv.toFixed(0)}，需提升客单价或成交密度`);
    if (totalDays >= 10) strengths.push(`出勤率高(${totalDays}/15天)，排班稳定`);
    else weaknesses.push(`出勤率偏低(${totalDays}/15天)，影响数据连续性`);
    if (bestTimeSlots.length > 0 && bestTimeSlots[0].avgRoi > 2) {
      strengths.push(`${bestTimeSlots[0].label}时段表现最佳，建议优先安排`);
    }
    if (weaknesses.length === 0) weaknesses.push('整体表现良好，保持当前状态');
    if (strengths.length === 0) strengths.push('数据积累中，建议增加排班场次');

    const aiAnalysis = { strengths, weaknesses, scores };

    res.json({
      code: 0,
      data: { dailyTrend, bestTimeSlots, aiAnalysis }
    });
  } catch (err) {
    logger.error('[Anchor] 主播分析失败:', err.message, err.stack);
    res.status(500).json({ code: -1, message: '主播分析失败' });
  }
});

router.sendPreLiveReminder = sendPreLiveReminder;
module.exports = router;
