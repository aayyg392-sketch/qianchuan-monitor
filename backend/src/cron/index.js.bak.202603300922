const cron = require('node-cron');
const { syncAll } = require('../services/sync');
const logger = require('../logger');

function startCron() {
  // 每30分钟同步一次当天数据
  cron.schedule('*/30 * * * *', async () => {
    logger.info('[Cron] 开始定时数据同步');
    try { await syncAll(); } catch (e) { logger.error('[Cron] 同步失败', { error: e.message }); }
  });
  // 每天凌晨1点同步昨天完整数据
  cron.schedule('0 1 * * *', async () => {
    logger.info('[Cron] 开始同步昨日完整数据');
    const dayjs = require('dayjs');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const { getActiveAccounts, syncDailyStats } = require('../services/sync');
    try {
      const accounts = await getActiveAccounts();
      for (const acc of accounts) { await syncDailyStats(acc, yesterday); }
    } catch (e) { logger.error('[Cron] 昨日数据同步失败', { error: e.message }); }
  });

  // 每天早上9点发送每日简报
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Cron] 开始生成每日简报');
    try {
      const { generateDailyBriefing } = require('../services/briefing');
      await generateDailyBriefing();
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

  logger.info('[Cron] 定时任务启动成功');
}

module.exports = { startCron };
