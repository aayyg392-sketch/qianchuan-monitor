/**
 * 主播排班复盘自动生成服务
 *
 * 功能：
 * 1. 主播排班时段结束后，自动拉取该时段的直播数据和话术记录
 * 2. 调用AI生成复盘分析报告
 * 3. 写入 anchor_review_reports 表
 */
const db = require('../db');
const axios = require('axios');
const dayjs = require('dayjs');
const logger = require('../logger');

// ============ AI 配置 ============
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';

// 话术分类映射
const CATEGORY_MAP = {
  selling_point: '卖点讲解',
  push_sale: '逼单促单',
  welfare: '福利发放',
  interact: '互动留人',
  product_intro: '产品介绍',
  other: '其他',
};

// ============ 自动建表 ============
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS anchor_review_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_id INT NOT NULL,
      anchor_id INT NOT NULL,
      anchor_name VARCHAR(50),
      schedule_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      room_id INT DEFAULT 1,
      gmv DECIMAL(12,2) DEFAULT 0,
      orders INT DEFAULT 0,
      cost DECIMAL(12,2) DEFAULT 0,
      roi DECIMAL(6,2) DEFAULT 0,
      peak_online INT DEFAULT 0,
      avg_online DECIMAL(8,1) DEFAULT 0,
      high_convert_speeches TEXT,
      all_speech_count INT DEFAULT 0,
      ai_analysis TEXT,
      status ENUM('generating','completed','failed') DEFAULT 'generating',
      error_message VARCHAR(512),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_schedule (schedule_id),
      INDEX idx_anchor_date (anchor_id, schedule_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    logger.info('[AnchorReview] anchor_review_reports 表初始化完成');
    // 新增字段（忽略已存在的错误）
    const newCols = [
      'cvr DECIMAL(8,2) DEFAULT 0', 'click_rate DECIMAL(8,2) DEFAULT 0',
      'interact_rate DECIMAL(8,2) DEFAULT 0', 'avg_stay INT DEFAULT 0',
      'day_avg_roi DECIMAL(6,2) DEFAULT 0', 'day_avg_cvr DECIMAL(8,2) DEFAULT 0',
      'day_avg_ctr DECIMAL(8,2) DEFAULT 0', 'day_avg_interact DECIMAL(8,2) DEFAULT 0',
      'day_avg_stay INT DEFAULT 0', 'avg_db DECIMAL(5,1) DEFAULT 0',
      'comparison TEXT', 'dingtalk_sent TINYINT DEFAULT 0'
    ];
    for (const col of newCols) {
      const name = col.split(' ')[0];
      try { await db.query(`ALTER TABLE anchor_review_reports ADD COLUMN ${col}`); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    logger.error('[AnchorReview] 建表失败:', err.message);
  }
})();

// ============ 查询时段数据 ============

/**
 * 从 live_realtime_data 查询指定时段的核心指标
 */
async function queryMetrics(roomId, scheduleDate, startTime, endTime) {
  const startDt = `${scheduleDate} ${startTime}`;
  const endDt = `${scheduleDate} ${endTime}`;

  const [rows] = await db.query(`
    SELECT
      IFNULL(MAX(gmv), 0) - IFNULL(MIN(gmv), 0) AS gmv,
      IFNULL(MAX(order_count), 0) - IFNULL(MIN(order_count), 0) AS orders,
      IFNULL(MAX(qianchuan_cost), 0) - IFNULL(MIN(qianchuan_cost), 0) AS cost,
      IFNULL(MAX(product_click), 0) - IFNULL(MIN(product_click), 0) AS clicks,
      IFNULL(MAX(total_viewers), 0) - IFNULL(MIN(total_viewers), 0) AS viewers,
      IFNULL(MAX(online_count), 0) AS peak_online,
      IFNULL(AVG(online_count), 0) AS avg_online,
      IFNULL(AVG(interact_rate), 0) AS interact_rate,
      IFNULL(AVG(avg_stay_seconds), 0) AS avg_stay
    FROM live_realtime_data
    WHERE room_id = ?
      AND recorded_at BETWEEN ? AND ?
  `, [roomId, startDt, endDt]);

  const m = rows[0] || {};
  const gmv = parseFloat(m.gmv) || 0;
  const cost = parseFloat(m.cost) || 0;
  const orders = parseInt(m.orders) || 0;
  const clicks = parseInt(m.clicks) || 0;
  const viewers = parseInt(m.viewers) || 0;

  return {
    gmv, orders, cost,
    roi: cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0,
    peak_online: parseInt(m.peak_online) || 0,
    avg_online: parseFloat(parseFloat(m.avg_online).toFixed(1)) || 0,
    cvr: clicks > 0 ? parseFloat((orders / clicks * 100).toFixed(2)) : 0,
    click_rate: viewers > 0 ? parseFloat((clicks / viewers * 100).toFixed(2)) : 0,
    interact_rate: parseFloat(parseFloat(m.interact_rate).toFixed(2)) || 0,
    avg_stay: Math.round(parseFloat(m.avg_stay) || 0),
  };
}

// 查询当天全部数据的均值（用于对比）
async function queryDayAvg(roomId, scheduleDate) {
  const [rows] = await db.query(`
    SELECT
      IFNULL(MAX(gmv), 0) - IFNULL(MIN(gmv), 0) AS gmv,
      IFNULL(MAX(order_count), 0) - IFNULL(MIN(order_count), 0) AS orders,
      IFNULL(MAX(qianchuan_cost), 0) - IFNULL(MIN(qianchuan_cost), 0) AS cost,
      IFNULL(MAX(product_click), 0) - IFNULL(MIN(product_click), 0) AS clicks,
      IFNULL(MAX(total_viewers), 0) - IFNULL(MIN(total_viewers), 0) AS viewers,
      IFNULL(AVG(interact_rate), 0) AS interact_rate,
      IFNULL(AVG(avg_stay_seconds), 0) AS avg_stay
    FROM live_realtime_data
    WHERE room_id = ? AND DATE(recorded_at) = ?
  `, [roomId, scheduleDate]);
  const m = rows[0] || {};
  const gmv = parseFloat(m.gmv) || 0;
  const cost = parseFloat(m.cost) || 0;
  const orders = parseInt(m.orders) || 0;
  const clicks = parseInt(m.clicks) || 0;
  const viewers = parseInt(m.viewers) || 0;
  return {
    roi: cost > 0 ? parseFloat((gmv / cost).toFixed(2)) : 0,
    cvr: clicks > 0 ? parseFloat((orders / clicks * 100).toFixed(2)) : 0,
    ctr: viewers > 0 ? parseFloat((clicks / viewers * 100).toFixed(2)) : 0,
    interact: parseFloat(parseFloat(m.interact_rate).toFixed(2)) || 0,
    stay: Math.round(parseFloat(m.avg_stay) || 0),
  };
}

/**
 * 从 live_speech_records 查询指定时段的话术
 */
async function querySpeeches(roomId, scheduleDate, startTime, endTime) {
  const startDt = `${scheduleDate} ${startTime}`;
  const endDt = `${scheduleDate} ${endTime}`;

  // 高转化话术
  const [highConvert] = await db.query(`
    SELECT text_content, category, cvr, related_gmv, related_orders, recorded_at
    FROM live_speech_records
    WHERE room_id = ?
      AND recorded_at BETWEEN ? AND ?
      AND is_high_convert = 1
    ORDER BY related_gmv DESC
  `, [roomId, startDt, endDt]);

  // 全部话术数量
  const [countRows] = await db.query(`
    SELECT COUNT(*) AS total
    FROM live_speech_records
    WHERE room_id = ?
      AND recorded_at BETWEEN ? AND ?
  `, [roomId, startDt, endDt]);

  // 最近50条话术
  const [allSpeeches] = await db.query(`
    SELECT text_content, category, cvr, related_gmv, recorded_at
    FROM live_speech_records
    WHERE room_id = ?
      AND recorded_at BETWEEN ? AND ?
    ORDER BY recorded_at DESC
    LIMIT 50
  `, [roomId, startDt, endDt]);

  return {
    highConvert,
    allSpeechCount: parseInt(countRows[0]?.total) || 0,
    allSpeeches,
  };
}

// ============ AI 分析 ============

function formatSpeechLine(speech) {
  const cat = CATEGORY_MAP[speech.category] || '其他';
  const time = dayjs(speech.recorded_at).format('HH:mm:ss');
  return `[${time}][${cat}] ${speech.text_content}`;
}

function buildPrompt(schedule, metrics, speeches) {
  const highConvertLines = speeches.highConvert.length > 0
    ? speeches.highConvert.map(s => {
        const cat = CATEGORY_MAP[s.category] || '其他';
        const time = dayjs(s.recorded_at).format('HH:mm:ss');
        return `[${time}][${cat}] CVR:${s.cvr}% GMV:¥${s.related_gmv} ${s.text_content}`;
      }).join('\n')
    : '（本时段暂无高转化话术）';

  const allSpeechLines = speeches.allSpeeches.length > 0
    ? speeches.allSpeeches.map(formatSpeechLine).join('\n')
    : '（本时段暂无话术记录）';

  return `你是资深直播运营分析师，专注抖音美妆直播间复盘。请根据以下数据生成复盘分析。

## 主播: ${schedule.anchor_name}  时段: ${schedule.schedule_date} ${schedule.start_time}-${schedule.end_time}

### 核心数据
GMV: ¥${metrics.gmv} | 订单: ${metrics.orders} | 消耗: ¥${metrics.cost} | ROI: ${metrics.roi} | 在线峰值: ${metrics.peak_online} | 平均在线: ${metrics.avg_online}

### 高转化话术 (${speeches.highConvert.length}条)
${highConvertLines}

### 全部话术 (共${speeches.allSpeechCount}条，取最近50条)
${allSpeechLines}

请输出（markdown格式，控制500字内）：
## 话术亮点
## 话术短板
## 数据诊断
## 改进建议（3条可执行）`;
}

async function callAI(prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 未配置');
  }

  const response = await axios.post(
    `${OPENAI_BASE_URL}/chat/completions`,
    {
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 返回内容为空');
  }
  return content;
}

// ============ 核心逻辑 ============

/**
 * 为指定排班生成复盘报告
 * @param {Object} schedule - { id, anchor_id, anchor_name, schedule_date, start_time, end_time, room_id }
 */
async function generateReviewForSchedule(schedule) {
  const tag = `[AnchorReview][${schedule.anchor_name}][${schedule.schedule_date} ${schedule.start_time}-${schedule.end_time}]`;
  logger.info(`${tag} 开始生成复盘报告`);

  // 插入一条 generating 状态的记录
  let reportId;
  try {
    const [result] = await db.query(
      `INSERT INTO anchor_review_reports
        (schedule_id, anchor_id, anchor_name, schedule_date, start_time, end_time, room_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'generating')`,
      [schedule.id, schedule.anchor_id, schedule.anchor_name, schedule.schedule_date, schedule.start_time, schedule.end_time, schedule.room_id || 1]
    );
    reportId = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      logger.info(`${tag} 报告已存在，跳过`);
      return;
    }
    throw err;
  }

  try {
    // 1. 查询数据
    const roomId = schedule.room_id || 1;
    const dateStr = dayjs(schedule.schedule_date).format('YYYY-MM-DD');

    const metrics = await queryMetrics(roomId, dateStr, schedule.start_time, schedule.end_time);
    const dayAvg = await queryDayAvg(roomId, dateStr);
    const speeches = await querySpeeches(roomId, dateStr, schedule.start_time, schedule.end_time);

    // 查询该时段话术的平均分贝
    const [dbRows] = await db.query(
      `SELECT AVG(mean_db) as avg_db FROM live_speech_records WHERE room_id = ? AND recorded_at BETWEEN ? AND ? AND mean_db > 0`,
      [roomId, `${dateStr} ${schedule.start_time}`, `${dateStr} ${schedule.end_time}`]);
    const avgDb = parseFloat(dbRows[0]?.avg_db) || 0;

    logger.info(`${tag} 数据查询完成 - GMV:${metrics.gmv} 订单:${metrics.orders} ROI:${metrics.roi} 分贝:${avgDb.toFixed(1)} 话术:${speeches.allSpeechCount}条`);

    // 没有实际直播数据则跳过（未开播或无数据）
    if (metrics.gmv <= 0 && metrics.orders <= 0) {
      logger.info(`${tag} 无直播数据，跳过复盘生成`);
      await db.query('DELETE FROM anchor_review_reports WHERE id = ?', [reportId]);
      return;
    }

    // 2. 对比分析（高于/低于当日均值20%）
    const comparison = { highlights: [], improvements: [] };
    function cmpMetric(label, val, avg, unit) {
      if (!avg || avg === 0) return;
      const ratio = val / avg;
      if (ratio >= 1.2) comparison.highlights.push(`${label} ${val}${unit} 高于均值${Math.round((ratio-1)*100)}% ✅`);
      else if (ratio <= 0.8) comparison.improvements.push(`${label} ${val}${unit} 低于均值${Math.round((1-ratio)*100)}%，需改进 ⚠️`);
    }
    cmpMetric('ROI', metrics.roi, dayAvg.roi, '');
    cmpMetric('转化率', metrics.cvr, dayAvg.cvr, '%');
    cmpMetric('点击率', metrics.click_rate, dayAvg.ctr, '%');
    cmpMetric('互动率', metrics.interact_rate, dayAvg.interact, '%');
    cmpMetric('停留时长', metrics.avg_stay, dayAvg.stay, 's');

    // 声音分贝检测
    if (avgDb > 0 && avgDb < 60) {
      comparison.improvements.push(`声音分贝 ${avgDb.toFixed(0)}dB 过低，需提高音量，保持激情 🔊`);
    } else if (avgDb >= 80) {
      comparison.highlights.push(`声音分贝 ${avgDb.toFixed(0)}dB 洪亮有感染力 🔊`);
    }

    // 3. 调用 AI 分析
    const prompt = buildPrompt(schedule, metrics, speeches);
    let aiAnalysis = '';
    try {
      aiAnalysis = await callAI(prompt);
      logger.info(`${tag} AI分析完成，字数: ${aiAnalysis.length}`);
    } catch (aiErr) {
      logger.error(`${tag} AI分析失败，使用对比数据替代: ${aiErr.message}`);
      aiAnalysis = `## 数据诊断\nGMV ¥${metrics.gmv.toFixed(0)} | ROI ${metrics.roi} | 转化率 ${metrics.cvr}%\n\n## 改进建议\n${comparison.improvements.length ? comparison.improvements.join('\n') : '整体表现良好'}`;
    }

    // 4. 更新报告
    const highConvertJson = JSON.stringify(speeches.highConvert.map(s => ({
      text: s.text_content, category: s.category, cvr: s.cvr,
      gmv: s.related_gmv, orders: s.related_orders,
      time: dayjs(s.recorded_at).format('HH:mm:ss'),
    })));

    await db.query(
      `UPDATE anchor_review_reports SET
        gmv = ?, orders = ?, cost = ?, roi = ?,
        peak_online = ?, avg_online = ?,
        cvr = ?, click_rate = ?, interact_rate = ?, avg_stay = ?, avg_db = ?,
        day_avg_roi = ?, day_avg_cvr = ?, day_avg_ctr = ?, day_avg_interact = ?, day_avg_stay = ?,
        high_convert_speeches = ?, all_speech_count = ?,
        ai_analysis = ?, comparison = ?, status = 'completed'
       WHERE id = ?`,
      [
        metrics.gmv, metrics.orders, metrics.cost, metrics.roi,
        metrics.peak_online, metrics.avg_online,
        metrics.cvr, metrics.click_rate, metrics.interact_rate, metrics.avg_stay, avgDb,
        dayAvg.roi, dayAvg.cvr, dayAvg.ctr, dayAvg.interact, dayAvg.stay,
        highConvertJson, speeches.allSpeechCount,
        aiAnalysis, JSON.stringify(comparison), reportId,
      ]
    );

    logger.info(`${tag} 复盘报告生成完成，ID: ${reportId}`);

    // 5. 自动发送钉钉复盘消息
    metrics.avg_db = avgDb;
    await sendDingTalkReview(schedule, metrics, dayAvg, comparison, speeches);
  } catch (err) {
    logger.error(`${tag} 复盘报告生成失败:`, err.message);

    // 标记为失败
    try {
      await db.query(
        `UPDATE anchor_review_reports SET status = 'failed', error_message = ? WHERE id = ?`,
        [String(err.message).slice(0, 500), reportId]
      );
    } catch (updateErr) {
      logger.error(`${tag} 更新失败状态异常:`, updateErr.message);
    }
  }
}

/**
 * 检查并生成复盘报告
 * 查找结束时间在10-11分钟前的排班，且尚未生成报告的
 */
async function checkAndGenerateReviews() {
  logger.info('[AnchorReview] 检查待生成的复盘报告...');

  try {
    const now = dayjs();
    const today = now.format('YYYY-MM-DD');
    const tenMinAgo = now.subtract(10, 'minute').format('YYYY-MM-DD HH:mm:ss');

    // 查找今天已结束超过10分钟、且尚未生成复盘报告的排班
    // 注意：凌晨排班（00:00-06:00）的end_time小于start_time或小于06:00也要包含
    const [schedules] = await db.query(`
      SELECT s.id, s.anchor_id, a.name AS anchor_name, s.schedule_date, s.start_time, s.end_time, s.room_id
      FROM live_anchor_schedules s
      JOIN live_anchors a ON a.id = s.anchor_id
      WHERE s.schedule_date = ?
        AND CONCAT(s.schedule_date, ' ', s.end_time) <= ?
        AND s.status != 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM anchor_review_reports r WHERE r.schedule_id = s.id
        )
    `, [today, tenMinAgo]);

    if (schedules.length === 0) {
      logger.info('[AnchorReview] 暂无待生成的复盘报告');
      return;
    }

    logger.info(`[AnchorReview] 发现 ${schedules.length} 个待复盘排班`);

    for (const schedule of schedules) {
      try {
        await generateReviewForSchedule(schedule);
      } catch (err) {
        logger.error(`[AnchorReview] 处理排班 ${schedule.id} 失败:`, err.message);
      }
    }
  } catch (err) {
    logger.error('[AnchorReview] checkAndGenerateReviews 异常:', err.message);
  }
}

// ============ 钉钉推送（机器人单聊模式） ============
const { sendRobotMessage } = require('./dingtalk');

// 构建复盘消息内容
function buildReviewMsg(schedule, metrics, comparison, speeches) {
  const fmtW = v => v >= 10000 ? (v/10000).toFixed(1)+'w' : v.toFixed(0);
  const fmtStay = v => v >= 60 ? Math.floor(v/60)+'m'+Math.round(v%60)+'s' : v+'s';
  const time = `${String(schedule.start_time).slice(0,5)}-${String(schedule.end_time).slice(0,5)}`;
  const title = `${schedule.anchor_name} 复盘 ${time}`;

  let body = `## 🎬 ${schedule.anchor_name} 本场复盘\n`;
  body += `#### ⏰ ${time}\n\n`;
  body += `---\n\n`;

  // 核心数据
  function statusIcon(val, avg) {
    if (!avg || avg === 0) return '';
    const ratio = val / avg;
    if (ratio >= 1.2) return ' 🟢↑' + Math.round((ratio-1)*100) + '%';
    if (ratio <= 0.8) return ' 🔴↓' + Math.round((1-ratio)*100) + '%';
    return '';
  }

  body += `### 📊 本场数据\n\n`;
  body += `> GMV **¥${fmtW(metrics.gmv)}**\n\n`;
  body += `> 订单 **${metrics.orders}单**　　ROI **${metrics.roi}**\n\n`;
  body += `> 转化率 **${metrics.cvr}%**${statusIcon(metrics.cvr, comparison._dayAvg?.cvr)}\n\n`;
  body += `> 点击率 **${metrics.click_rate}%**${statusIcon(metrics.click_rate, comparison._dayAvg?.ctr)}\n\n`;
  body += `> 互动率 **${metrics.interact_rate}%**${statusIcon(metrics.interact_rate, comparison._dayAvg?.interact)}\n\n`;
  body += `> 停留 **${fmtStay(metrics.avg_stay)}**${statusIcon(metrics.avg_stay, comparison._dayAvg?.stay)}\n\n`;

  // 声音分贝
  const db = metrics.avg_db || 0;
  if (db > 0) {
    let dbIcon = '';
    if (db >= 80) dbIcon = ' 🟢 洪亮';
    else if (db >= 70) dbIcon = '';
    else if (db >= 60) dbIcon = ' 🟡 偏低';
    else dbIcon = ' 🔴 **过低，需提高音量！**';
    body += `> 🔊 声音分贝 **${db.toFixed(0)}dB**${dbIcon}\n\n`;
  }

  // 表现优秀 - 醒目展示
  if (comparison.highlights && comparison.highlights.length) {
    body += `### ✅ 本场亮点\n\n`;
    comparison.highlights.forEach(h => body += `> 🌟 **${h}**\n\n`);
  }

  // 需要改进 - 醒目展示
  if (comparison.improvements && comparison.improvements.length) {
    body += `### ⚠️ 需要调整\n\n`;
    comparison.improvements.forEach(h => body += `> 🔺 **${h}**\n\n`);
  }

  // 高转话术
  if (speeches.highConvert && speeches.highConvert.length > 0) {
    body += `### 🎯 高转话术 TOP3\n\n`;
    speeches.highConvert.slice(0, 3).forEach((s, i) => {
      const cat = CATEGORY_MAP[s.category] || '其他';
      const txt = String(s.text_content || s.text || '').slice(0, 80);
      body += `**${i+1}. [${cat}]** ${txt}\n\n`;
    });
  }

  body += `---\n\n`;
  body += `> 📋 [查看完整复盘报告](https://business.snefe.com/live-replay)`;
  return { title, body };
}

async function sendDingTalkReview(schedule, metrics, dayAvg, comparison, speeches) {
  try {
    comparison._dayAvg = dayAvg;
    const { title, body } = buildReviewMsg(schedule, metrics, comparison, speeches);

    // 查主播钉钉ID，用机器人单聊发送
    const [anchorRows] = await db.query('SELECT dingtalk_userid FROM live_anchors WHERE id = ?', [schedule.anchor_id]);
    const dtUserId = anchorRows[0]?.dingtalk_userid;
    if (dtUserId) {
      await sendRobotMessage(dtUserId, title, body);
      logger.info(`[AnchorReview] 机器人单聊已发送: ${schedule.anchor_name} (${dtUserId})`);
      // 写入推送记录
      try {
        await db.query(`INSERT INTO push_logs (push_type, push_date, receiver_id, receiver_name, status, created_at)
          VALUES ('review', ?, ?, ?, 'success', NOW())`,
          [schedule.schedule_date || dayjs().format('YYYY-MM-DD'), dtUserId, schedule.anchor_name]);
      } catch(e) { logger.warn(`[AnchorReview] push_logs写入失败: ${e.message}`); }
    } else {
      logger.warn(`[AnchorReview] ${schedule.anchor_name} 未配置钉钉ID，跳过`);
    }

    await db.query('UPDATE anchor_review_reports SET dingtalk_sent = 1 WHERE schedule_id = ?', [schedule.id]);
  } catch (err) {
    logger.error(`[AnchorReview] 钉钉发送失败: ${err.message}`);
  }
}

// 手动推送钉钉（供API调用）
async function sendDingTalkForSchedule(scheduleId) {
  const [rows] = await db.query(
    `SELECT r.*, s.start_time as s_start, s.end_time as s_end FROM anchor_review_reports r
     JOIN live_anchor_schedules s ON s.id = r.schedule_id WHERE r.schedule_id = ?`, [scheduleId]);
  if (!rows.length) throw new Error('报告不存在');
  const r = rows[0];
  const metrics = { gmv: parseFloat(r.gmv), orders: r.orders, cost: parseFloat(r.cost), roi: parseFloat(r.roi),
    cvr: parseFloat(r.cvr)||0, click_rate: parseFloat(r.click_rate)||0, interact_rate: parseFloat(r.interact_rate)||0, avg_stay: r.avg_stay||0,
    avg_db: parseFloat(r.avg_db)||0 };
  const dayAvg = { roi: parseFloat(r.day_avg_roi)||0, cvr: parseFloat(r.day_avg_cvr)||0, ctr: parseFloat(r.day_avg_ctr)||0,
    interact: parseFloat(r.day_avg_interact)||0, stay: r.day_avg_stay||0 };
  const comparison = r.comparison ? JSON.parse(r.comparison) : { highlights: [], improvements: [] };
  const speeches = { highConvert: r.high_convert_speeches ? JSON.parse(r.high_convert_speeches) : [], allSpeechCount: r.all_speech_count };
  const schedule = { id: r.schedule_id, anchor_id: r.anchor_id, anchor_name: r.anchor_name,
    start_time: r.s_start || r.start_time, end_time: r.s_end || r.end_time };
  await sendDingTalkReview(schedule, metrics, dayAvg, comparison, speeches);
}

module.exports = { generateReviewForSchedule, checkAndGenerateReviews, sendDingTalkForSchedule };
