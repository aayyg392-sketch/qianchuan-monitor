const cron = require('node-cron');
const { syncAll, syncLiveDailyStats } = require('../services/sync');
const db = require('../db');
const logger = require('../logger');

function startCron() {
  // 每30分钟同步一次当天数据
  cron.schedule('*/30 * * * *', async () => {
    logger.info('[Cron] 开始定时数据同步');
    try {
      await syncAll();
      // 保存当前时刻快照（同时段对比用）
      const dayjs = require('dayjs');
      const hour = dayjs().hour();
      await db.query(`INSERT INTO qc_stats_snapshots (stat_date, snap_hour, cost, gmv, show_cnt, click_cnt, convert_cnt)
        SELECT CURDATE(), ?,
          COALESCE(SUM(d.cost),0), COALESCE(SUM(d.cpm),0),
          COALESCE((SELECT SUM(show_cnt) FROM qc_material_stats WHERE stat_date=CURDATE()),0),
          COALESCE((SELECT SUM(click_cnt) FROM qc_material_stats WHERE stat_date=CURDATE()),0),
          COALESCE(SUM(d.convert_cnt),0)
        FROM qc_daily_stats d WHERE d.stat_date=CURDATE() AND d.entity_type='campaign'
        ON DUPLICATE KEY UPDATE cost=VALUES(cost), gmv=VALUES(gmv), show_cnt=VALUES(show_cnt), click_cnt=VALUES(click_cnt), convert_cnt=VALUES(convert_cnt)`, [hour]).catch(() => {});
    } catch (e) { logger.error('[Cron] 同步失败', { error: e.message }); }
  });
  // 每天早上8点同步昨天完整数据（千川数据回补完毕）
  cron.schedule('0 8 * * *', async () => {
    logger.info('[Cron] 开始同步昨日完整数据');
    const dayjs = require('dayjs');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const { getActiveAccounts, syncDailyStats } = require('../services/sync');
    try {
      const accounts = await getActiveAccounts();
      for (const acc of accounts) { await syncDailyStats(acc, yesterday); }
    } catch (e) { logger.error('[Cron] 昨日数据同步失败', { error: e.message }); }
  });

  // 每天早上9点发送每日简报（带防重复）
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Cron] 开始生成每日简报');
    try {
      // 防重复：检查今天是否已发送
      const dayjs = require('dayjs');
      const today = dayjs().format('YYYY-MM-DD');
      const [sent] = await db.query("SELECT id FROM qc_briefing_log WHERE DATE(sent_at)=? LIMIT 1", [today]).catch(() => [[]]);
      if (sent && sent.length > 0) {
        logger.info('[Cron] 今日简报已发送过，跳过');
        return;
      }
      const { generateDailyBriefing } = require('../services/briefing');
      await generateDailyBriefing();
      // 记录发送时间
      await db.query("INSERT INTO qc_briefing_log (sent_at, type) VALUES (NOW(), 'daily')").catch(() => {});
      logger.info('[Cron] 每日简报发送成功');
    } catch (e) {
      logger.error('[Cron] 每日简报失败', { error: e.message });
    }
  });
  // 每周一早8点生成爆款素材总结
  cron.schedule('0 8 * * 1', async () => {
    logger.info('[Cron] 开始生成爆款素材总结');
    try {
      const { generateHotSummary } = require('../routes/material-summary');
      await generateHotSummary();
      logger.info('[Cron] 爆款素材总结生成成功');
    } catch (e) {
      logger.error('[Cron] 爆款素材总结失败', { error: e.message });
    }
  });

  // 每日早7点自动素材审核（8点前完成）
  cron.schedule('0 7 * * *', async () => {
    logger.info('[Cron] 开始每日素材审核');
    try {
      const { runDailyAudit } = require('../routes/material-audit');
      await runDailyAudit();
      logger.info('[Cron] 每日素材审核完成');
    } catch (e) {
      logger.error('[Cron] 素材审核失败', { error: e.message });
    }
  });

  // 每天凌晨2点同步达人推广数据
  cron.schedule('0 2 * * *', async () => {
    logger.info('[Cron] 开始同步达人推广数据');
    try {
      const { syncInfluencerPromotion } = require('../services/influencer-sync');
      const dayjs = require('dayjs');
      const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      await syncInfluencerPromotion(yesterday);
      logger.info('[Cron] 达人推广数据同步完成');
    } catch (e) {
      logger.error('[Cron] 达人推广数据同步失败', { error: e.message });
    }
  });

  // Marketing token auto-refresh - every hour
  cron.schedule('17 * * * *', async () => {
    try {
      const dayjs = require('dayjs');
      const db = require('../db');
      const commentSync = require('../services/comment-sync');
      const [accounts] = await db.query('SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM marketing_accounts WHERE status=1');
      for (const account of (accounts || [])) {
        if (account.token_expires_at && dayjs(account.token_expires_at).subtract(6, 'hour').isBefore(dayjs())) {
          await commentSync.refreshMarketingToken(account);
        }
      }
      logger.info('[Cron] 巨量营销Token检查完成');
    } catch (e) {
      logger.error('[Cron] marketing token refresh error', { error: e.message });
    }
  });

  // Comment auto-reply - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const commentSync = require('../services/comment-sync');
      await commentSync.runAutoReply();
    } catch (e) {
      logger.error('[Cron] comment auto-reply error', { error: e.message });
    }
  });

  // 每15分钟自动隐藏差评
  cron.schedule('3,18,33,48 * * * *', async () => {
    try {
      const commentSync = require('../services/comment-sync');
      await commentSync.autoHideNegative();
    } catch (e) {
      logger.error('[Cron] auto-hide negative error', { error: e.message });
    }
  });

  // 每30分钟检查超8小时未回复评论并自动AI回复
  cron.schedule('8,38 * * * *', async () => {
    try {
      const commentSync = require('../services/comment-sync');
      await commentSync.autoReplyOverdue();
    } catch (e) {
      logger.error('[Cron] auto-reply overdue error', { error: e.message });
    }
  });

  // 每分钟同步直播间实时数据
  cron.schedule('* * * * *', async () => {
    try {
      const { syncLiveRooms } = require('../services/live-sync');
      await syncLiveRooms();
    } catch (e) {
      logger.error('[Cron] 直播间数据同步失败', { error: e.message });
    }
  });

  // 每10分钟单独同步直播账户千川数据（提高分时数据更新频率）
  cron.schedule('*/10 * * * *', async () => {
    try {
      const LIVE_ACCOUNT_ID = '1713421159436366';
      const [accounts] = await db.query(
        'SELECT * FROM qc_accounts WHERE advertiser_id=? AND status=1', [LIVE_ACCOUNT_ID]);
      if (accounts.length > 0) {
        logger.info('[Cron] 直播账户10分钟快速同步');
        await syncLiveDailyStats(accounts[0]);
      }
    } catch (e) {
      logger.error('[Cron] 直播账户快速同步失败', { error: e.message });
    }
  });


  // 每小时检查千川token（使用sync.js统一的ensureFreshToken，不自己刷新，避免竞争）
  cron.schedule('23 * * * *', async () => {
    try {
      const [accounts] = await db.query('SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM qc_accounts WHERE status=1 LIMIT 1');
      if (!accounts || accounts.length === 0) return;
      const acc = accounts[0];
      const expiresAt = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
      const hoursLeft = expiresAt ? (expiresAt.getTime() - Date.now()) / 3600000 : 0;
      logger.info('[Cron] 千川token剩余 ' + hoursLeft.toFixed(1) + ' 小时');
      if (hoursLeft <= 8) {
        // 委托给sync.js的统一刷新函数（内部有互斥锁，不会重复刷新）
        const { ensureFreshToken } = require('../services/sync');
        await ensureFreshToken(acc);
        logger.info('[Cron] 千川token检查完成（已委托统一刷新）');
      } else {
        logger.info('[Cron] 千川token有效期充足，无需刷新');
      }
    } catch (e) {
      logger.error('[Cron] 千川token检查异常', { error: e.message });
    }
  });

  // 启动直播话术ASR采集服务
  try {
    const { startSpeechASR } = require('../services/speech-asr');
    startSpeechASR();
    logger.info('[Cron] 直播话术ASR采集服务已启动');
  } catch (e) {
    logger.error('[Cron] 直播话术ASR采集服务启动失败', { error: e.message });
  }

  // 启动直播间自动回复服务
  try {
    const { startAutoReply } = require("../services/live-auto-reply");
    startAutoReply();
    logger.info("[Cron] 直播间自动回复服务已启动");
  } catch (e) {
    logger.error("[Cron] 自动回复服务启动失败", { error: e.message });
  }
  // 每天凌晨3点同步视频号达人数据
  cron.schedule('0 3 * * *', async () => {
    logger.info('[Cron] 开始同步视频号达人数据');
    try {
      const { syncAllFinders } = require('../services/wechat-channels-sync');
      await syncAllFinders();
      logger.info('[Cron] 视频号达人数据同步完成');
    } catch (e) {
      logger.error('[Cron] 视频号达人数据同步失败', { error: e.message });
    }
  });

  // 每10分钟同步今日订单数据（旧罗盘口径，保留做小时趋势图）
  cron.schedule('*/10 * * * *', async () => {
    try {
      const { syncTodayOrders } = require('../routes/wx-compass');
      await syncTodayOrders();
    } catch (e) {
      logger.error('[Cron] 今日订单同步失败', { error: e.message });
    }
  });

  // 每10分钟同步视频号小店订单明细（增量，update_time近70分钟）
  cron.schedule('3,13,23,33,43,53 * * * *', async () => {
    try {
      const { syncRecentUpdates } = require('../services/wx-shop-order-sync');
      await syncRecentUpdates(70);
    } catch (e) {
      logger.error('[Cron] 视频号订单明细增量同步失败', { error: e.message });
    }
  });

  // 每日凌晨2点回补近3天订单明细（捕捉延迟状态变更）
  cron.schedule('0 2 * * *', async () => {
    try {
      const { backfillDays } = require('../services/wx-shop-order-sync');
      await backfillDays(3);
      logger.info('[Cron] 视频号订单明细回补完成');
    } catch (e) {
      logger.error('[Cron] 视频号订单明细回补失败', { error: e.message });
    }
  });

  // 每2小时同步视频号罗盘数据到数据库
  cron.schedule('13 */2 * * *', async () => {
    logger.info('[Cron] 开始同步视频号罗盘数据');
    try {
      const { syncCompassData } = require('../routes/wx-compass');
      await syncCompassData(3);
      logger.info('[Cron] 视频号罗盘数据同步完成');
    } catch (e) {
      logger.error('[Cron] 视频号罗盘数据同步失败', { error: e.message });
    }
  });

  // 快手小店数据同步 - 每30分钟
  cron.schedule('5,35 */1 * * *', async () => {
    logger.info('[Cron] 开始快手小店数据同步');
    try {
      const { runKsSync } = require('../services/ks-sync');
      await runKsSync();
    } catch (e) { logger.error('[Cron] 快手同步失败', { error: e.message }); }
  });

  // AI金牌投手 - 每5分钟检查
  cron.schedule('*/5 * * * *', async () => {
    try {
      const pitcher = require('../services/pitcher-engine');
      await pitcher.checkAll();
    } catch (e) { logger.error('[Cron] AI投手检查失败', { error: e.message }); }
  });

  // 每分钟检查是否有主播N小时后要上播，发送提醒
  cron.schedule('* * * * *', async () => {
    try {
      const dayjs = require('dayjs');
      const now = dayjs();
      const today = now.format('YYYY-MM-DD');

      // 读取配置中的提醒时间
      let remindBefore = 2;
      try {
        const [cfgRows] = await db.query('SELECT config FROM push_configs WHERE id=1');
        if (cfgRows.length && cfgRows[0]?.config) {
          const cfg = typeof cfgRows[0].config === 'string' ? JSON.parse(cfgRows[0].config) : cfgRows[0].config;
          if (!cfg.preLiveNotify?.enabled) return; // 未启用则跳过
          remindBefore = cfg.preLiveNotify?.remindBefore || 2;
        }
      } catch(e) {}

      // 查找N小时后开始的排班（误差1分钟窗口）
      const targetStart = now.add(remindBefore, 'hour').format('HH:mm');
      const targetEnd = now.add(remindBefore, 'hour').add(1, 'minute').format('HH:mm');

      const [rows] = await db.query(
        `SELECT s.*, a.name, a.dingtalk_userid, a.id as aid FROM live_anchor_schedules s
         JOIN live_anchors a ON a.id = s.anchor_id
         WHERE s.schedule_date = ? AND s.status != 'cancelled'
         AND TIME_FORMAT(s.start_time, '%H:%i') >= ? AND TIME_FORMAT(s.start_time, '%H:%i') < ?
         AND (s.notify_status != 'reminded' OR s.notify_status IS NULL)`,
        [today, targetStart, targetEnd]);

      for (const sch of rows) {
        if (!sch.dingtalk_userid) continue;
        try {
          const { sendPreLiveReminder } = require('../routes/anchor');
          await sendPreLiveReminder(
            { id: sch.aid, name: sch.name, dingtalk_userid: sch.dingtalk_userid },
            { anchor_id: sch.anchor_id, schedule_date: sch.schedule_date, start_time: sch.start_time, end_time: sch.end_time }
          );
          await db.query('UPDATE live_anchor_schedules SET notify_status = "reminded" WHERE id = ?', [sch.id]);
        } catch (e) { logger.error('[Cron] 上播提醒失败 ' + sch.name + ': ' + e.message); }
      }
    } catch (e) { logger.error('[Cron] 上播提醒检查失败', { error: e.message }); }
  });

  // 每分钟检查是否有主播时段结束10分钟，自动生成复盘报告
  cron.schedule('* * * * *', async () => {
    try {
      const { checkAndGenerateReviews } = require('../services/anchor-review');
      await checkAndGenerateReviews();
    } catch (e) {
      logger.error('[Cron] 主播自动复盘检查失败', { error: e.message });
    }
  });

  // 每分钟检查：每场主播下播后delay分钟，自动推送报表
  cron.schedule('* * * * *', async () => {
    try {
      const dayjs = require('dayjs');
      const db = require('../db');
      const today = dayjs().format('YYYY-MM-DD');
      const now = dayjs();
      const nowTime = now.format('HH:mm:ss');

      // 读取推送配置
      const [cfgRows] = await db.query('SELECT config FROM push_configs WHERE id=1').catch(() => [[]]);
      if (!cfgRows.length || !cfgRows[0]?.config) return;
      const cfg = typeof cfgRows[0].config === 'string' ? JSON.parse(cfgRows[0].config) : cfgRows[0].config;
      if (!cfg.liveReport?.enabled) return;
      const delay = cfg.liveReport.delay || 5;

      // 查今天所有排班的不同结束时间，找出 end_time + delay 刚好在当前1分钟窗口内的
      const [schedules] = await db.query(
        `SELECT DISTINCT end_time FROM live_anchor_schedules
         WHERE schedule_date=? AND status != 'cancelled'
         ORDER BY end_time`, [today]);
      if (!schedules.length) return;

      for (const sch of schedules) {
        const endStr = String(sch.end_time).slice(0, 5);
        const endMoment = dayjs(`${today} ${sch.end_time}`);
        const triggerMoment = endMoment.add(delay, 'minute');

        // 当前时间在触发窗口内（1分钟）
        if (now.isBefore(triggerMoment) || now.isAfter(triggerMoment.add(1, 'minute'))) continue;

        // 防重复：检查这个时段结束后是否已推送过
        const [sent] = await db.query(
          "SELECT id FROM push_logs WHERE push_type='auto_report' AND push_date=? AND receiver_id LIKE ? LIMIT 1",
          [today, `%_${endStr}%`]).catch(() => [[]]);
        if (sent && sent.length > 0) continue;

        logger.info(`[Cron] 排班${endStr}结束${delay}分钟，自动推送报表`);
        const { autoSendReport } = require('../routes/anchor');
        await autoSendReport(today, endStr);
        return;
      }
    } catch (e) {
      logger.error('[Cron] 自动推送报表检查失败', { error: e.message });
    }
  });

  // 快手磁力广告评论 - 每15分钟自动同步并AI回复
  cron.schedule('2,17,32,47 * * * *', async () => {
    try {
      const ksAdComments = require('../routes/ks-ad-comments');
      const [settings] = await db.query('SELECT * FROM ks_ad_comment_settings WHERE ai_reply_enabled = 1');
      if (!settings.length) return;
      for (const s of settings) {
        try {
          await ksAdComments.runAutoReply(s.shop_id);
        } catch (e) { logger.warn(`[Cron] 磁力评论回复 shop=${s.shop_id}: ${e.message}`); }
      }
      logger.info(`[Cron] 磁力评论自动同步/回复完成: ${settings.length}个店铺`);
    } catch (e) { logger.error('[Cron] 磁力评论定时任务失败', { error: e.message }); }
  });

  // ===== ADQ(腾讯广告)数据定时同步 - 每10分钟 =====
  cron.schedule('*/10 * * * *', async () => {
    try {
      const adq = require('../services/adq-sync');
      const [accounts] = await db.query('SELECT id, account_id FROM adq_accounts WHERE status=1 AND access_token IS NOT NULL');
      if (!accounts.length) return;

      const token = await adq.getValidToken(accounts[0].id);
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const hour = now.getHours();
      const fields = ['date', 'cost', 'view_count', 'valid_click_count', 'ctr', 'cpc', 'conversions_count', 'conversions_cost', 'order_amount', 'order_roi'];

      let synced = 0;
      const BATCH = 10;
      for (let i = 0; i < accounts.length; i += BATCH) {
        const batch = accounts.slice(i, i + BATCH);
        await Promise.all(batch.map(async (acct) => {
          try {
            const data = await adq.getDailyReports(token, acct.account_id, {
              level: 'REPORT_LEVEL_ADVERTISER',
              date_range: { start_date: today, end_date: today },
              fields,
            });
            const row = data?.list?.[0];
            if (row) {
              await db.query(
                `INSERT INTO adq_stats_snapshots (account_id, stat_date, snap_hour, cost, view_count, valid_click_count, conversions_count, conversions_cost, order_amount, order_roi, ctr, cpc)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE cost=VALUES(cost), view_count=VALUES(view_count), valid_click_count=VALUES(valid_click_count),
                   conversions_count=VALUES(conversions_count), conversions_cost=VALUES(conversions_cost), order_amount=VALUES(order_amount),
                   order_roi=VALUES(order_roi), ctr=VALUES(ctr), cpc=VALUES(cpc)`,
                [acct.account_id, today, hour, row.cost||0, row.view_count||0, row.valid_click_count||0,
                 row.conversions_count||0, row.conversions_cost||0, row.order_amount||0, row.order_roi||0, row.ctr||0, row.cpc||0]
              );
              synced++;
            }
          } catch (e) { /* skip failed */ }
        }));
      }
      if (synced > 0) logger.info(`[Cron] ADQ数据同步完成: ${synced}/${accounts.length}个账户`);
    } catch (e) {
      logger.error('[Cron] ADQ数据同步失败', { error: e.message });
    }
  });

  // ===== ADQ(腾讯广告)组织Token自动刷新 - 每6小时 =====
  cron.schedule('27 */6 * * *', async () => {
    try {
      const adq = require('../services/adq-sync');
      // 按唯一refresh_token分组，避免重复刷新（组织token共享）
      const [tokens] = await db.query(
        `SELECT MIN(id) as id, refresh_token, MIN(token_expires_at) as expires_at
         FROM adq_accounts WHERE status=1 AND refresh_token IS NOT NULL AND refresh_token != ''
         GROUP BY refresh_token`
      );
      let refreshed = 0;
      for (const t of (tokens || [])) {
        // 提前24小时刷新
        if (t.expires_at && new Date(t.expires_at) <= new Date(Date.now() + 24 * 3600 * 1000)) {
          try {
            await adq.refreshToken(t.id);
            refreshed++;
          } catch (e) {
            logger.error(`[Cron] ADQ Token刷新失败 id=${t.id}: ${e.message}`);
          }
        }
      }
      logger.info(`[Cron] ADQ Token检查完成, 刷新${refreshed}组`);
    } catch (e) {
      logger.error('[Cron] ADQ Token自动刷新失败', { error: e.message });
    }
  });

  // ===== 跨境TikTok模块定时任务（独立区块）=====
  // 每30分钟同步TikTok消耗数据
  cron.schedule('12,42 * * * *', async () => {
    try {
      const { syncTikTokStats } = require('../services/tt-sync');
      await syncTikTokStats();
    } catch (e) { logger.error('[Cron] TikTok消耗同步失败', { error: e.message }); }
  });
  // 每天早8点同步TikTok昨日完整数据
  cron.schedule('5 8 * * *', async () => {
    try {
      const dayjs = require('dayjs');
      const { syncTikTokStats } = require('../services/tt-sync');
      await syncTikTokStats(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
    } catch (e) { logger.error('[Cron] TikTok昨日数据同步失败', { error: e.message }); }
  });
  // 每小时检查TikTok Token
  cron.schedule('37 * * * *', async () => {
    try {
      const { checkTikTokTokens } = require('../services/tt-sync');
      await checkTikTokTokens();
    } catch (e) { logger.error('[Cron] TikTok Token检查失败', { error: e.message }); }
  });

  // ===== 数据推送管理（千川/快手/视频号报表按 pushHours 触发）=====
  // 每小时第2分钟检查 push_configs 并按钟点推送
  cron.schedule('2 * * * *', async () => {
    try {
      const { checkAndPush } = require('../services/data-push');
      await checkAndPush();
    } catch (e) { logger.error('[Cron] 数据推送检查失败', { error: e.message }); }
  });

  // 启动时立即执行一次 catch-up：若服务重启正好错过整点的 cron 触发窗口，
  // 靠 push_logs 表防重复，不会造成重复推送
  setTimeout(async () => {
    try {
      const { checkAndPush } = require('../services/data-push');
      await checkAndPush();
      logger.info('[Cron] 启动时数据推送 catch-up 完成');
    } catch (e) { logger.error('[Cron] 启动时数据推送 catch-up 失败', { error: e.message }); }
  }, 15000);

  // ===== ADQ素材定时清理 - 每分钟检查（按规则的 schedule_time 触发）=====
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const [rules] = await db.query('SELECT * FROM adq_cleanup_rules WHERE enabled=1 AND schedule_time=?', [hhmm]);
      if (!rules.length) return;
      const pitcher = require('../routes/adq-pitcher');
      for (const rule of rules) {
        try {
          const today = now.toISOString().slice(0, 10);
          const [recent] = await db.query(
            "SELECT id FROM adq_cleanup_logs WHERE rule_id=? AND DATE(executed_at)=? AND exec_type='auto' LIMIT 1",
            [rule.id, today]
          );
          if (recent.length) {
            logger.info(`[Cron] ADQ清理规则[${rule.name}]今日已执行过，跳过`);
            continue;
          }
          logger.info(`[Cron] 开始执行ADQ清理规则[${rule.name}]`);
          const result = await pitcher.executeCleanup(rule, 'auto', 'cron');
          logger.info(`[Cron] ADQ清理规则[${rule.name}]完成: 清理${result.cleaned}个, 失败${result.failed}个`);
        } catch (e) {
          logger.error(`[Cron] ADQ清理规则[${rule.name}]失败: ${e.message}`);
        }
      }
    } catch (e) { logger.error('[Cron] ADQ素材清理检查失败', { error: e.message }); }
  });

  // ===== ADQ 自动投放 - 每分钟检查（按规则的 schedule_time 触发）=====
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const [rules] = await db.query('SELECT * FROM adq_autodeliver_rules WHERE enabled=1 AND schedule_time=?', [hhmm]);
      if (!rules.length) return;
      const pitcher = require('../routes/adq-pitcher');
      for (const rule of rules) {
        try {
          const today = now.toISOString().slice(0, 10);
          const [recent] = await db.query(
            "SELECT id FROM adq_autodeliver_logs WHERE rule_id=? AND DATE(executed_at)=? AND exec_type='scheduled' LIMIT 1",
            [rule.id, today]
          );
          if (recent.length) {
            logger.info(`[Cron] ADQ投放规则[${rule.name}]今日已执行过，跳过`);
            continue;
          }
          logger.info(`[Cron] 开始执行ADQ投放规则[${rule.name}]`);
          const result = await pitcher.executeAutoDeliver(rule, 'scheduled', 'cron');
          logger.info(`[Cron] ADQ投放规则[${rule.name}]完成: 新增${result.added}, 跳过${result.skipped}, 失败${result.failed}`);
        } catch (e) {
          logger.error(`[Cron] ADQ投放规则[${rule.name}]失败: ${e.message}`);
        }
      }
    } catch (e) { logger.error('[Cron] ADQ自动投放检查失败', { error: e.message }); }
  });

  logger.info('[Cron] 定时任务启动成功');
}

module.exports = { startCron };
