const axios = require('axios');
const db = require('../db');
const logger = require('../logger');
const dayjs = require('dayjs');

const OE_API_BASE = 'https://ad.oceanengine.com/open_api';
const APP_ID = '1859525766684851';

/**
 * 刷新千川Token
 */
async function refreshAccountToken(account) {
  try {
    const APP_SECRET = process.env.APP_SECRET || '67e5c48c38e04c36140c41ce8ad44f5b52c105f1';
    const resp = await axios.post(`${OE_API_BASE}/oauth2/refresh_token/`, {
      appid: APP_ID, secret: APP_SECRET,
      grant_type: 'refresh_token', refresh_token: account.refresh_token,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    if (resp.data?.code === 0 && resp.data?.data) {
      const newToken = resp.data.data.access_token;
      const newRefresh = resp.data.data.refresh_token || account.refresh_token;
      const expiresAt = new Date(Date.now() + (resp.data.data.expires_in || 86400) * 1000);
      await db.query(
        `UPDATE qc_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE status = 1`,
        [newToken, newRefresh, expiresAt]
      );
      logger.info(`[InfluencerSync] Token刷新成功`);
      return newToken;
    }
    logger.warn('[InfluencerSync] Token刷新响应异常', { code: resp.data?.code });
    return null;
  } catch (e) {
    logger.error('[InfluencerSync] Token刷新失败', { error: e.message });
    return null;
  }
}

/**
 * 获取授权抖音号列表
 */
async function getAuthorizedAweme(advertiserId, accessToken) {
  try {
    const resp = await axios.get(`${OE_API_BASE}/v1.0/qianchuan/aweme/authorized/get/`, {
      params: { advertiser_id: parseInt(advertiserId), page: '1', page_size: '50' },
      headers: { 'Access-Token': accessToken },
      timeout: 15000,
    });
    if (resp.data?.code === 0 && resp.data?.data?.aweme_id_list) {
      return resp.data.data.aweme_id_list;
    }
    return [];
  } catch (e) {
    logger.warn('[InfluencerSync] 获取授权达人号异常', { error: e.message });
    return [];
  }
}

/**
 * 同步达人推广数据
 *
 * 思路：千川自定义报表不支持按达人号(aweme_id)维度查询，
 * 但 qc_daily_stats 已有每个账户的消耗数据，而每个账户有对应的授权达人号列表。
 *
 * 流程：
 * 1. 刷新Token
 * 2. 遍历账户，获取每个账户的授权达人号列表
 * 3. 从 qc_daily_stats 获取每个账户的campaign级别数据
 * 4. 将数据按达人号分配写入 qc_influencer_promotion_stats
 *    - 如果账户只有1个达人号：全部数据归属该达人
 *    - 如果有多个达人号：按campaign数量均分（后续可优化）
 */
async function syncInfluencerPromotion(targetDate) {
  const date = targetDate || dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  logger.info(`[InfluencerSync] 开始同步达人推广数据, 日期: ${date}`);

  // 获取活跃账户
  const [accounts] = await db.query(
    `SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM qc_accounts WHERE status = 1 AND access_token IS NOT NULL`
  );
  if (!accounts || accounts.length === 0) {
    logger.warn('[InfluencerSync] 无活跃账户');
    return { total: 0, accounts: 0, awemes: 0 };
  }

  // 检查Token是否过期
  let token = accounts[0].access_token;
  if (accounts[0].token_expires_at && dayjs(accounts[0].token_expires_at).isBefore(dayjs())) {
    logger.info('[InfluencerSync] Token已过期，尝试刷新...');
    const newToken = await refreshAccountToken(accounts[0]);
    if (!newToken) return { total: 0, accounts: 0, awemes: 0, error: 'Token刷新失败' };
    token = newToken;
  }

  let totalInserted = 0;
  let totalAwemes = 0;

  for (const acc of accounts) {
    // 1. 获取该账户的授权达人号
    const awemeList = await getAuthorizedAweme(acc.advertiser_id, token);
    if (awemeList.length === 0) continue;
    logger.info(`[InfluencerSync] 账户 ${acc.advertiser_id} 有 ${awemeList.length} 个授权达人号`);

    // 2. 从 qc_daily_stats 获取该账户当天的account级别汇总数据
    const [statsRows] = await db.query(
      `SELECT SUM(cost) as total_cost, SUM(show_cnt) as total_show, SUM(click_cnt) as total_click,
              SUM(convert_cnt) as total_convert, SUM(gmv_no_coupon) as total_gmv
       FROM qc_daily_stats
       WHERE advertiser_id = ? AND stat_date = ? AND entity_type = 'account'`,
      [acc.advertiser_id, date]
    );

    const stats = statsRows[0];
    if (!stats || !stats.total_cost || Number(stats.total_cost) === 0) {
      logger.info(`[InfluencerSync] 账户 ${acc.advertiser_id} 日期 ${date} 无消耗数据`);
      continue;
    }

    const totalCost = Number(stats.total_cost) || 0;
    const totalShow = Number(stats.total_show) || 0;
    const totalClick = Number(stats.total_click) || 0;
    const totalConvert = Number(stats.total_convert) || 0;
    const totalGmv = Number(stats.total_gmv) || 0;

    // 3. 按达人号分配数据
    // 过滤掉旗舰店/官方直播间（bind_type为SELF的），只保留达人合作号
    const darenAwemes = awemeList.filter(a => {
      const bindTypes = a.bind_type || [];
      // SELF = 自己的号, 其他如 KOL/AGENCY 是合作达人
      return true; // 暂时全部保留，不过滤
    });

    const awemeCount = darenAwemes.length;
    if (awemeCount === 0) continue;

    // 均分数据（简单策略，后续可按campaign的ad名称匹配达人号优化）
    const perCost = +(totalCost / awemeCount).toFixed(2);
    const perShow = Math.round(totalShow / awemeCount);
    const perClick = Math.round(totalClick / awemeCount);
    const perConvert = Math.round(totalConvert / awemeCount);
    const perGmv = +(totalGmv / awemeCount).toFixed(2);
    const perConvertCost = perConvert > 0 ? +(perCost / perConvert).toFixed(2) : 0;
    const perCtr = perShow > 0 ? +(perClick / perShow * 100).toFixed(2) : 0;
    const perRoi = perCost > 0 ? +(perGmv / perCost).toFixed(2) : 0;

    for (const aweme of darenAwemes) {
      const awemeId = String(aweme.aweme_id || aweme);
      const awemeName = aweme.aweme_name || '';

      try {
        await db.query(
          `INSERT INTO qc_influencer_promotion_stats
           (advertiser_id, aweme_id, aweme_name, stat_date, cost, pay_amount, convert_count, convert_cost, show_count, click_count, ctr, roi)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           aweme_name = VALUES(aweme_name), cost = VALUES(cost), pay_amount = VALUES(pay_amount),
           convert_count = VALUES(convert_count), convert_cost = VALUES(convert_cost),
           show_count = VALUES(show_count), click_count = VALUES(click_count),
           ctr = VALUES(ctr), roi = VALUES(roi), fetched_at = NOW()`,
          [acc.advertiser_id, awemeId, awemeName, date,
            perCost, perGmv, perConvert, perConvertCost,
            perShow, perClick, perCtr, perRoi]
        );
        totalInserted++;
      } catch (e) {
        logger.warn('[InfluencerSync] 写入失败', { error: e.message, aweme_id: awemeId });
      }
    }

    totalAwemes += awemeCount;
    logger.info(`[InfluencerSync] 账户 ${acc.advertiser_id}: 消耗${totalCost}元 分配给${awemeCount}个达人号`);
  }

  // 自动关联达人ID
  await linkInfluencerIds();

  logger.info(`[InfluencerSync] 同步完成, ${totalAwemes} 个达人号, 写入 ${totalInserted} 条数据`);
  return { total: totalInserted, accounts: accounts.length, awemes: totalAwemes };
}

/**
 * 将 qc_influencers 与推广数据的 aweme_id 做匹配关联
 */
async function linkInfluencerIds() {
  try {
    // 策略1：douyin_id 直接匹配 aweme_id
    const [updated1] = await db.query(
      `UPDATE qc_influencers i
       INNER JOIN (SELECT DISTINCT aweme_id FROM qc_influencer_promotion_stats) p
       ON i.douyin_id = p.aweme_id
       SET i.aweme_id_link = p.aweme_id
       WHERE i.aweme_id_link IS NULL OR i.aweme_id_link = ''`
    );
    const linkedById = updated1?.affectedRows || 0;

    // 策略2：通过昵称匹配
    const [updated2] = await db.query(
      `UPDATE qc_influencers i
       INNER JOIN (
         SELECT aweme_id, aweme_name FROM qc_influencer_promotion_stats
         WHERE aweme_name IS NOT NULL AND aweme_name != ''
         GROUP BY aweme_id, aweme_name
       ) p ON i.nickname = p.aweme_name
       SET i.aweme_id_link = p.aweme_id
       WHERE (i.aweme_id_link IS NULL OR i.aweme_id_link = '')`
    );
    const linkedByName = updated2?.affectedRows || 0;

    if (linkedById + linkedByName > 0) {
      logger.info(`[InfluencerSync] ID关联完成: ID匹配${linkedById}条, 昵称匹配${linkedByName}条`);
    }
  } catch (e) {
    logger.warn('[InfluencerSync] ID关联失败', { error: e.message });
  }
}

module.exports = { syncInfluencerPromotion, linkInfluencerIds, refreshAccountToken, getAuthorizedAweme };
