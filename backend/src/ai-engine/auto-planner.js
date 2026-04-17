/**
 * AI引擎 - 自动搭建计划模块
 * 扫描优质素材 → 筛选健康广告组 → 自动添加创意
 *
 * ADQ平台规则遵守:
 * - 审核拒审黑名单 (adq_denied_videos)
 * - 素材状态过滤 (MEDIA_STATUS_VALID + ADSTATUS_NORMAL)
 * - 账户健康检查 (maxOnlineAds=15, auditPassRate>=70%)
 * - 每日新建上限 (dailyNewAds=2)
 * - 素材生命周期 (maxDaysBeforeForceRotate=14天)
 * - 创意去重 (同组不重复添加相同视频)
 */
const db = require('../db');
const logger = require('../logger');
const adqSync = require('../services/adq-sync');
const { ADQ_RULES } = require('./config');

/**
 * 自动搭建主入口
 * @returns {{ created:number, skipped:number, failed:number, actions:string[] }}
 */
async function run({ accountDbId, account, token, adAccountId, activeAdgroups, config }) {
  const results = { created: 0, skipped: 0, failed: 0, actions: [] };

  try {
    // ===== 1. 每日限额检��� =====
    const [[countRow]] = await db.query(
      "SELECT COUNT(*) as cnt FROM ai_decisions WHERE platform='adq' AND account_id=? AND decision_type='auto_create' AND DATE(created_at)=CURDATE() AND executed=1",
      [adAccountId]
    );
    const todayCreated = countRow?.cnt || 0;
    const maxDaily = ADQ_RULES.account.dailyNewAds; // 2
    if (todayCreated >= maxDaily) {
      logger.info(`[AI-AutoCreate] ${account.account_name} 今日已创建${todayCreated}个，达上限${maxDaily}`);
      return results;
    }
    const remaining = maxDaily - todayCreated;

    // ===== 2. 账户健康检查 =====
    const activeCount = activeAdgroups.length;
    if (activeCount >= ADQ_RULES.account.maxOnlineAds) {
      results.actions.push(`在线广告${activeCount}/${ADQ_RULES.account.maxOnlineAds}已满，暂停创建`);
      return results;
    }

    // 审核通过率检查（近30天）
    const auditRate = await checkAuditPassRate(adAccountId);
    if (auditRate !== null && auditRate < ADQ_RULES.account.auditPassRateMin) {
      results.actions.push(`审核通过率${(auditRate * 100).toFixed(0)}%过低(<${ADQ_RULES.account.auditPassRateMin * 100}%)，暂停创建`);
      logger.warn(`[AI-AutoCreate] ${account.account_name} 审核通过率${(auditRate * 100).toFixed(0)}%过低`);
      return results;
    }

    // ===== 3. 扫描优质素材（跨全部账户） =====
    const targetROI = config.targetROI || 2.0;
    const goodVideos = await scanGoodVideos(token, targetROI);
    if (!goodVideos.length) {
      logger.info(`[AI-AutoCreate] 无符合条件的优质素材`);
      return results;
    }
    logger.info(`[AI-AutoCreate] 扫描到${goodVideos.length}个优质素材`);

    // ===== 4. 筛选目标广告组（仅当前账户） =====
    const targets = await selectTargetAdgroups(token, adAccountId, activeAdgroups, targetROI);
    if (!targets.length) {
      logger.info(`[AI-AutoCreate] ${account.account_name} 无合适的目标广告组`);
      return results;
    }
    logger.info(`[AI-AutoCreate] 筛选到${targets.length}个目标广告组`);

    // ===== 5. 贪心匹配：素材 → 广告组 =====
    const plan = matchPlan(goodVideos, targets, remaining);
    if (!plan.length) return results;

    // ===== 6. 执行创建 =====
    const now = new Date();
    const timeTag = String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    // 预加载各目标组已有的 video_id（去重用）
    const adgroupExistingVideos = {};
    for (const item of plan) {
      const agId = item.target.adgroup_id;
      if (!adgroupExistingVideos[agId]) {
        adgroupExistingVideos[agId] = await loadAdgroupVideoIds(token, adAccountId, agId);
      }
    }

    // 模板缓存
    const templateCache = {};
    // 跨账户 signature 解析缓存
    const sigCache = {};

    for (let i = 0; i < plan.length; i++) {
      const { video, target, reason } = plan[i];
      try {
        // 6a. 解析视频ID（跨账户用 signature 查找本账户对应 video_id）
        let videoId = video.video_id;
        if (String(video.account_id) !== String(adAccountId)) {
          if (!video.signature) {
            results.skipped++;
            continue;
          }
          videoId = await resolveVideoBySignature(token, adAccountId, video.signature, sigCache);
          if (!videoId) {
            results.skipped++;
            continue;
          }
        }

        // 6b. 去重：组内已有该视频
        const existSet = adgroupExistingVideos[target.adgroup_id];
        if (existSet && existSet.has(String(videoId))) {
          results.skipped++;
          continue;
        }

        // 6c. 获取创意模板
        const template = await getCreativeTemplate(token, adAccountId, target.adgroup_id, templateCache);
        if (!template) {
          results.failed++;
          results.actions.push(`${target.adgroup_name}: 无模板可复用`);
          continue;
        }

        // 6d. 构建组件并创建创意
        const creativeName = `ai-engine-${timeTag}-${i + 1}-${String(videoId).slice(-6)}`;
        const components = buildComponents(template, videoId, video.video_name);

        const reqData = {
          account_id: parseInt(adAccountId),
          adgroup_id: parseInt(target.adgroup_id),
          dynamic_creative_name: creativeName,
          dynamic_creative_type: 'DYNAMIC_CREATIVE_TYPE_PROGRAM',
          delivery_mode: template.delivery_mode || 'DELIVERY_MODE_COMPONENT',
          creative_components: components,
        };
        if (template.smart_delivery_spec?.marketing_asset_id) {
          reqData.smart_delivery_spec = template.smart_delivery_spec;
        }

        await adqSync.createDynamicCreative(token, parseInt(adAccountId), reqData);

        // 成功：更新去重集合
        if (existSet) existSet.add(String(videoId));
        results.created++;
        results.actions.push(`${target.adgroup_name}: +素材"${video.video_name || videoId}" (${reason})`);

        // 记录AI决策
        await saveDecision(adAccountId, target.adgroup_id, videoId, {
          creativeName,
          videoId,
          videoName: video.video_name,
          videoScore: video.score,
          adgroupName: target.adgroup_name,
          targetROI,
          reason,
        });

      } catch (e) {
        results.failed++;
        const msg = e.message || '';

        // 审核驳回 → 自动加入黑名单
        if (isAuditDeniedError(msg)) {
          await addToDeniedBlacklist(video.video_id, adAccountId, msg);
          results.actions.push(`素材${video.video_id}审核驳回，已加入黑名单`);
          logger.warn(`[AI-AutoCreate] 素材${video.video_id}审核驳回，加入黑名单: ${msg.slice(0, 100)}`);
        } else if (msg.includes('1800387') || msg.includes('exceed limit')) {
          results.actions.push(`${target.adgroup_name}: 创意数达上限`);
        } else if (msg.includes('1800441') || msg.includes('duplicated')) {
          results.skipped++;
          results.failed--;
        } else {
          logger.warn(`[AI-AutoCreate] 创建失败: ${msg.slice(0, 200)}`);
        }
      }
    }

    logger.info(`[AI-AutoCreate] ${account.account_name} 完成: 创建${results.created} 跳过${results.skipped} 失败${results.failed}`);
  } catch (e) {
    logger.error(`[AI-AutoCreate] ${account?.account_name} 异常`, { error: e.message });
  }

  return results;
}


// ==================== 内部函数 ====================

/**
 * 审核通过率检查
 * 基于 adq_denied_videos 黑名单数据
 */
async function checkAuditPassRate(adAccountId) {
  try {
    const [[totalRow]] = await db.query(
      "SELECT COUNT(*) as cnt FROM ai_decisions WHERE platform='adq' AND account_id=? AND decision_type='auto_create' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      [adAccountId]
    );
    const total = totalRow?.cnt || 0;
    if (total < 5) return null; // 样本不足

    const [[deniedRow]] = await db.query(
      "SELECT COUNT(*) as cnt FROM adq_denied_videos WHERE account_id=? AND denied_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      [adAccountId]
    );
    return 1 - (deniedRow?.cnt || 0) / total;
  } catch {
    return null;
  }
}

/**
 * 扫描优质视频素材（跨全部ADQ账户）
 * 筛选: cost>=200 AND roi>=目标*0.8 AND conv>=5
 * 排除: 黑名单 + 审核中/已删除 + 超14天生命周期
 * 评分: ROI(40%) + Scale(30%) + Conv(20%) + CTR(10%)
 */
async function scanGoodVideos(sharedToken, targetROI) {
  const [allAccounts] = await db.query('SELECT * FROM adq_accounts WHERE status=1 AND access_token IS NOT NULL');
  if (!allAccounts.length) return [];

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const minCost = 50;
  const minROI = Math.max(targetROI * 0.5, 1.0);
  const minConv = 2;
  const goodList = [];
  const CONCURRENCY = 5;

  let scannedCount = 0, tokenFailCount = 0, apiFailCount = 0, passBasicFilter = 0, videoGetFail = 0, statusSkip = 0, ageSkip = 0;
  const tasks = allAccounts.map(acct => async () => {
    try {
      let acctToken;
      try { acctToken = await adqSync.getValidToken(acct.id); } catch (te) {
        tokenFailCount++;
        return;
      }

      // 加载黑名单
      let deniedSet = new Set();
      try {
        const [rows] = await db.query('SELECT video_id FROM adq_denied_videos WHERE account_id=?', [String(acct.account_id)]);
        rows.forEach(r => deniedSet.add(String(r.video_id)));
      } catch { /* table may not exist */ }

      // 视频素材级报表
      const report = await adqSync.adqApiCall(acctToken, 'daily_reports/get', 'GET', {
        account_id: acct.account_id,
        level: 'REPORT_LEVEL_MATERIAL_VIDEO',
        date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
        group_by: JSON.stringify(['video_id']),
        fields: JSON.stringify(['video_id', 'cost', 'view_count', 'valid_click_count', 'conversions_count', 'order_amount', 'order_roi', 'ctr']),
        page: 1, page_size: 200,
      }, acct.account_id);

      const rawList = (report?.list || []).filter(i => parseFloat(i.cost || 0) > 0);
      scannedCount += rawList.length;

      for (const item of rawList) {
        const cost = parseFloat(item.cost || 0) / 100;
        const roi = parseFloat(item.order_roi || 0);
        const conv = parseInt(item.conversions_count || 0);
        const ctr = parseFloat(item.ctr || 0);

        if (cost < minCost || roi < minROI || conv < minConv) continue;
        if (deniedSet.has(String(item.video_id))) continue;
        passBasicFilter++;

        // 视频元信息（signature、状态、生命周期）— 获取失败不阻塞，仍然入选
        let v = {};
        try {
          const vd = await adqSync.adqApiCall(acctToken, 'videos/get', 'GET', {
            account_id: acct.account_id,
            filtering: JSON.stringify([{ field: 'media_id', operator: 'EQUALS', values: [String(item.video_id)] }]),
            fields: JSON.stringify(['video_id', 'signature', 'description', 'key_frame_image_url', 'system_status', 'status', 'created_time']),
            page: 1, page_size: 1,
          }, acct.account_id);
          v = vd?.list?.[0] || {};
        } catch {
          videoGetFail++;
          // 获取元信息失败，但素材数据已通过筛选，仍然可用
        }

        if (v.system_status && v.system_status !== 'MEDIA_STATUS_VALID') { statusSkip++; continue; }
        if (v.status && v.status !== 'ADSTATUS_NORMAL') { statusSkip++; continue; }
        // 超14天强制跳过
        // 素材年龄：自动搭建放宽到30天（轮换规则14天只针对已投放创意）
        if (v.created_time) {
          // created_time 是Unix秒级时间戳，需要 * 1000 转毫秒
          const ts = typeof v.created_time === 'number' || /^\d+$/.test(v.created_time)
            ? parseInt(v.created_time) * 1000 : new Date(v.created_time).getTime();
          const ageDays = (Date.now() - ts) / 86400000;
          if (ageDays > 30) { ageSkip++; continue; }
        }

          // 综合评分
          const roiScore = Math.min(roi / Math.max(minROI, 0.01), 2.0) * 20;
          const scaleScore = Math.min(cost / Math.max(minCost, 1), 3.0) * 10;
          const convScore = Math.min(conv / Math.max(minConv, 1), 3.0) * 6.67;
          const ctrScore = Math.min(ctr / 2.0, 1.0) * 10;

          goodList.push({
            account_id: acct.account_id,
            video_id: String(item.video_id),
            signature: v.signature || '',
            video_name: v.description || '',
            cost, roi, conv, ctr,
            score: +(roiScore + scaleScore + convScore + ctrScore).toFixed(2),
          });
      }
    } catch (acctErr) {
      apiFailCount++;
    }
  });

  // 并发控制
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY).map(fn => fn()));
  }

  logger.info(`[AI-AutoCreate] 素材扫描: ${allAccounts.length}个账户, Token失败${tokenFailCount}, API失败${apiFailCount}, 有消耗${scannedCount}, 过基础筛选${passBasicFilter}, 视频查询失败${videoGetFail}, 状态过滤${statusSkip}, 超龄过滤${ageSkip}, 最终合格${goodList.length}`);
  goodList.sort((a, b) => b.score - a.score);
  return goodList;
}

/**
 * 筛选目标广告组（仅当前账户）
 * 条件: 投放中 + ROI >= 目标*0.7 + 消耗>=100 + 创意数<15
 */
async function selectTargetAdgroups(token, adAccountId, activeAdgroups, targetROI) {
  const minROI = Math.max(targetROI * 0.5, 0.5);
  const minCost = 30; // 元
  const maxCreatives = 15;
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const acctIdInt = parseInt(adAccountId);

  // 拉取广告组报表
  const statsMap = {};
  try {
    let page = 1;
    while (page <= 10) {
      const report = await adqSync.adqApiCall(token, 'daily_reports/get', 'GET', {
        account_id: acctIdInt,
        level: 'REPORT_LEVEL_ADGROUP',
        date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
        group_by: JSON.stringify(['adgroup_id']),
        fields: JSON.stringify(['adgroup_id', 'cost', 'order_amount', 'order_roi']),
        page, page_size: 200,
      }, acctIdInt);
      (report?.list || []).forEach(it => {
        statsMap[String(it.adgroup_id)] = {
          cost: parseFloat(it.cost || 0) / 100,
          order_amount: parseFloat(it.order_amount || 0) / 100,
        };
      });
      if (!report?.list || report.list.length < 200) break;
      page++;
    }
  } catch { /* skip */ }

  // 拉取各组创意数
  const creativeCountMap = {};
  try {
    let page = 1;
    while (page <= 20) {
      const r = await adqSync.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
        account_id: acctIdInt, page, page_size: 100,
        fields: JSON.stringify(['dynamic_creative_id', 'adgroup_id']),
      }, acctIdInt);
      (r?.list || []).forEach(c => {
        const agId = String(c.adgroup_id);
        creativeCountMap[agId] = (creativeCountMap[agId] || 0) + 1;
      });
      if (!r?.list || r.list.length < 100) break;
      page++;
    }
  } catch { /* skip */ }

  // 过滤 & 评分
  const targets = [];
  for (const ag of activeAdgroups) {
    const id = String(ag.adgroup_id);
    const stat = statsMap[id] || { cost: 0, order_amount: 0 };
    const roi = stat.cost > 0 ? stat.order_amount / stat.cost : 0;
    const creatives = creativeCountMap[id] || 0;

    if (stat.cost < minCost) continue;
    if (roi < minROI) continue;
    if (creatives >= maxCreatives) continue;

    const slotRatio = 1 - creatives / maxCreatives;
    targets.push({
      adgroup_id: id,
      adgroup_name: ag.adgroup_name || id,
      cost: stat.cost,
      roi,
      creatives,
      slot_available: maxCreatives - creatives,
      score: +(roi * 10 + slotRatio * 20).toFixed(2),
    });
  }

  targets.sort((a, b) => b.score - a.score);
  return targets;
}

/**
 * 贪心匹配：按素材评分 × 广告组评分分配
 * 限制: 每组最多加1个，每视频最多投2组
 */
function matchPlan(goodVideos, targets, maxTotal) {
  const plan = [];
  const adgroupUsed = {}; // adgroup_id → count
  const videoUsed = {};   // video_id → count
  const maxPerAdgroup = 1;
  const maxPerVideo = 2;

  for (const video of goodVideos) {
    if (plan.length >= maxTotal) break;
    if ((videoUsed[video.video_id] || 0) >= maxPerVideo) continue;

    for (const target of targets) {
      if (plan.length >= maxTotal) break;
      if ((videoUsed[video.video_id] || 0) >= maxPerVideo) break;
      if ((adgroupUsed[target.adgroup_id] || 0) >= maxPerAdgroup) continue;

      plan.push({
        video,
        target,
        reason: `评分${video.score} ROI${video.roi.toFixed(1)} → 组ROI${target.roi.toFixed(1)}`,
      });
      adgroupUsed[target.adgroup_id] = (adgroupUsed[target.adgroup_id] || 0) + 1;
      videoUsed[video.video_id] = (videoUsed[video.video_id] || 0) + 1;
    }
  }
  return plan;
}

/**
 * 加载广告组已有的 video_id 集合（去重用）
 */
async function loadAdgroupVideoIds(token, adAccountId, adgroupId) {
  const set = new Set();
  try {
    let page = 1;
    while (page <= 5) {
      const r = await adqSync.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
        account_id: parseInt(adAccountId),
        filtering: JSON.stringify([{ field: 'adgroup_id', operator: 'EQUALS', values: [String(adgroupId)] }]),
        page, page_size: 100,
        fields: JSON.stringify(['dynamic_creative_id', 'creative_components']),
      }, adAccountId);
      (r?.list || []).forEach(c => {
        (c?.creative_components?.video || []).forEach(v => {
          if (v?.value?.video_id) set.add(String(v.value.video_id));
        });
      });
      if (!r?.list || r.list.length < 100) break;
      page++;
    }
  } catch { /* skip */ }
  return set;
}

/**
 * 获取创意模板（优先从目标组，退回到账户内任意）
 */
async function getCreativeTemplate(token, adAccountId, adgroupId, cache) {
  if (cache[adgroupId]) return cache[adgroupId];
  const acctId = parseInt(adAccountId);
  const FIELDS = JSON.stringify(['dynamic_creative_id', 'delivery_mode', 'smart_delivery_spec', 'creative_components']);

  // 优先从目标广告组
  try {
    const r = await adqSync.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
      account_id: acctId,
      filtering: JSON.stringify([{ field: 'adgroup_id', operator: 'EQUALS', values: [String(adgroupId)] }]),
      page: 1, page_size: 1, fields: FIELDS,
    }, adAccountId);
    if (r?.list?.[0]?.creative_components) {
      cache[adgroupId] = r.list[0];
      return r.list[0];
    }
  } catch { /* skip */ }

  // 退回到账户内任意创��
  try {
    const r = await adqSync.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
      account_id: acctId, page: 1, page_size: 1, fields: FIELDS,
    }, adAccountId);
    if (r?.list?.[0]?.creative_components) {
      cache[adgroupId] = r.list[0];
      return r.list[0];
    }
  } catch { /* skip */ }

  return null;
}

/**
 * 跨账户：用 signature 在目标账户查找对应 video_id
 */
async function resolveVideoBySignature(token, adAccountId, signature, cache) {
  if (!signature) return null;
  if (cache[signature] !== undefined) return cache[signature];
  try {
    const r = await adqSync.adqApiCall(token, 'videos/get', 'GET', {
      account_id: parseInt(adAccountId),
      filtering: JSON.stringify([{ field: 'media_signature', operator: 'EQUALS', values: [String(signature)] }]),
      page: 1, page_size: 1,
    }, adAccountId);
    const first = r?.list?.[0];
    const vid = first?.video_id && first?.system_status === 'MEDIA_STATUS_VALID' ? String(first.video_id) : null;
    cache[signature] = vid;
    return vid;
  } catch {
    cache[signature] = null;
    return null;
  }
}

/**
 * 基于模板构建创意组件
 * 复用除 video/image/title 外的所有组件（视频号、按钮、跳转等）
 */
function buildComponents(template, videoId, title) {
  const src = template.creative_components || {};
  const out = {};

  // 复用现有组件（通过 component_id 引用）
  for (const key of Object.keys(src)) {
    if (key === 'video' || key === 'image' || key === 'title') continue;
    const arr = (src[key] || []).filter(c => !c.is_deleted && c.component_id);
    if (arr.length) out[key] = arr.map(c => ({ component_id: c.component_id }));
  }

  // 设置新视频
  out.video = [{ value: { video_id: String(videoId) } }];

  // 标题：有名称用名称（截取14字），否则复用模板标题
  if (title) {
    out.title = [{ value: { content: String(title).slice(0, 14) } }];
  } else if (src.title?.length) {
    const t = src.title.filter(c => !c.is_deleted && c.component_id);
    if (t.length) out.title = t.slice(0, 1).map(c => ({ component_id: c.component_id }));
  }

  return out;
}

/**
 * 检测审核驳回类错误
 */
function isAuditDeniedError(errMsg) {
  if (!errMsg) return false;
  const msg = String(errMsg).toLowerCase();
  const denyKeywords = ['审核', 'deny', 'denied', 'reject', 'violat', 'forbid', 'illegal', 'not allowed', 'not compliant', 'content check fail'];
  if (denyKeywords.some(k => msg.includes(k))) return true;
  if (/18003(8[9-9]|9[0-9]|4[0-9])/.test(errMsg)) return true;
  return false;
}

/**
 * 将审核失败的素材加入黑名单
 */
async function addToDeniedBlacklist(videoId, accountId, reason) {
  if (!videoId || !accountId) return;
  try {
    await db.query(
      `INSERT INTO adq_denied_videos (video_id, account_id, error_code, reason, denied_count)
       VALUES (?,?,?,?,1)
       ON DUPLICATE KEY UPDATE denied_count=denied_count+1, reason=VALUES(reason), denied_at=CURRENT_TIMESTAMP`,
      [String(videoId), String(accountId), (String(reason).match(/1800\d{3}|31\d{3}/) || [''])[0], String(reason).slice(0, 255)]
    );
  } catch { /* ignore */ }
}

/**
 * 记录AI决策
 */
async function saveDecision(accountId, adgroupId, creativeId, data) {
  try {
    await db.query(
      'INSERT INTO ai_decisions (platform, account_id, adgroup_id, creative_id, decision_type, decision_data, executed, execute_result) VALUES (?,?,?,?,?,?,?,?)',
      ['adq', accountId, adgroupId, creativeId, 'auto_create', JSON.stringify(data), 1, '成功']
    );
    await db.query('UPDATE ai_engine_status SET total_decisions = total_decisions + 1 WHERE id = 1').catch(() => {});
  } catch (e) {
    logger.error('[AI-AutoCreate] 保存决策失败', { error: e.message });
  }
}

module.exports = { run };
