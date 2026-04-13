const db = require('../db');
const logger = require('../logger');
const { TikTokAPI, ensureFreshToken } = require('./tiktok-api');
const dayjs = require('dayjs');

/**
 * 同步 TikTok 广告消耗数据到 tt_material_stats
 * 遍历所有活跃 TikTok 账户，拉取报表数据，按素材维度入库
 */
async function syncTikTokStats(dateStr) {
  const targetDate = dateStr || dayjs().format('YYYY-MM-DD');
  logger.info('[TikTok Sync] 开始同步消耗数据', { date: targetDate });

  const [accounts] = await db.query('SELECT * FROM tt_accounts WHERE status=1');
  if (!accounts.length) { logger.info('[TikTok Sync] 无活跃账户'); return; }

  for (const account of accounts) {
    try {
      const token = await ensureFreshToken(account);
      const api = new TikTokAPI(token);

      const reportRes = await api.getReport(account.advertiser_id, {
        startDate: targetDate,
        endDate: targetDate,
        dimensions: ['ad_id', 'stat_time_day'],
        metrics: [
          'spend', 'impressions', 'clicks', 'ctr', 'conversions', 'conversion_rate',
          'cpa', 'video_play_actions', 'video_views_p25', 'video_views_p50',
          'video_views_p75', 'video_views_p100', 'likes', 'comments', 'shares',
          'complete_payment_roas'
        ],
        pageSize: 500
      });

      if (reportRes.code !== 0 || !reportRes.data?.list) {
        logger.warn('[TikTok Sync] 报表获取失败', { advertiser_id: account.advertiser_id, response: reportRes });
        continue;
      }

      let synced = 0;
      for (const row of reportRes.data.list) {
        const metrics = row.metrics || {};
        const dims = row.dimensions || {};

        // 通过 ad_id 关联本地素材（如果有推送记录）
        const [pushRows] = await db.query(
          'SELECT material_id FROM tt_material_pushes WHERE advertiser_id=? AND push_status="success" LIMIT 1',
          [account.advertiser_id]);
        const materialId = pushRows.length ? pushRows[0].material_id : 0;
        if (!materialId) continue;

        await db.query(
          `INSERT INTO tt_material_stats (stat_date, material_id, advertiser_id, spend, impressions, clicks, ctr, conversions, cvr, cpa, roas, video_views, video_play_25, video_play_50, video_play_75, video_play_100, likes, comments, shares)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE spend=VALUES(spend), impressions=VALUES(impressions), clicks=VALUES(clicks),
           ctr=VALUES(ctr), conversions=VALUES(conversions), cvr=VALUES(cvr), cpa=VALUES(cpa), roas=VALUES(roas),
           video_views=VALUES(video_views), video_play_25=VALUES(video_play_25), video_play_50=VALUES(video_play_50),
           video_play_75=VALUES(video_play_75), video_play_100=VALUES(video_play_100),
           likes=VALUES(likes), comments=VALUES(comments), shares=VALUES(shares)`,
          [
            targetDate, materialId, account.advertiser_id,
            parseFloat(metrics.spend) || 0,
            parseInt(metrics.impressions) || 0,
            parseInt(metrics.clicks) || 0,
            parseFloat(metrics.ctr) || 0,
            parseInt(metrics.conversions) || 0,
            parseFloat(metrics.conversion_rate) || 0,
            parseFloat(metrics.cpa) || 0,
            parseFloat(metrics.complete_payment_roas) || 0,
            parseInt(metrics.video_play_actions) || 0,
            parseInt(metrics.video_views_p25) || 0,
            parseInt(metrics.video_views_p50) || 0,
            parseInt(metrics.video_views_p75) || 0,
            parseInt(metrics.video_views_p100) || 0,
            parseInt(metrics.likes) || 0,
            parseInt(metrics.comments) || 0,
            parseInt(metrics.shares) || 0
          ]);
        synced++;
      }
      logger.info('[TikTok Sync] 账户同步完成', { advertiser_id: account.advertiser_id, synced });
    } catch (e) {
      logger.error('[TikTok Sync] 账户同步失败', { advertiser_id: account.advertiser_id, error: e.message });
    }
  }
  logger.info('[TikTok Sync] 消耗数据同步完成');
}

/**
 * Token 定期刷新检查
 */
async function checkTikTokTokens() {
  const [accounts] = await db.query('SELECT * FROM tt_accounts WHERE status=1');
  for (const account of accounts) {
    try {
      await ensureFreshToken(account);
    } catch (e) {
      logger.error('[TikTok Token] 刷新失败', { advertiser_id: account.advertiser_id, error: e.message });
    }
  }
}

module.exports = { syncTikTokStats, checkTikTokTokens };
