/**
 * 腾讯广告 ADQ AI金牌投手路由
 * 智能扫描优秀素材 + 素材组合搭建计划
 */
const router = require('express').Router();
const db = require('../db');
const logger = require('../logger');
const auth = require('../middleware/auth');
const adq = require('../services/adq-sync');

// ============ AI金牌投手 - 智能扫描 + 自动搭建 ============

/**
 * POST /api/adq-pitcher/smart-scan — 扫描优秀素材（真实视频素材维度）
 * 阶段1: REPORT_LEVEL_MATERIAL_VIDEO 拉取所有账户的视频素材报表
 * 阶段2: videos/get 跨账户解析视频名称和封面
 * body: { conditions, lookback_days, account_id? }
 */
router.post('/smart-scan', auth(), async (req, res) => {
  try {
    const { conditions = [], lookback_days = 3, account_id } = req.body;
    if (!conditions.length) return res.json({ code: -1, msg: '请至少设置一个筛选条件' });

    // 获取账户列表
    let accountsList;
    if (account_id) {
      const [rows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1 AND access_token IS NOT NULL', [account_id]);
      accountsList = rows;
    } else {
      const [rows] = await db.query('SELECT * FROM adq_accounts WHERE status = 1 AND access_token IS NOT NULL');
      accountsList = rows;
    }
    if (!accountsList.length) return res.json({ code: -1, msg: '没有可用的ADQ账户' });

    // 全部账户（跨账户查找视频名称）
    const [allAccounts] = await db.query('SELECT * FROM adq_accounts WHERE status = 1 AND access_token IS NOT NULL');

    let sharedToken;
    try { sharedToken = await adq.getValidToken(accountsList[0].id); }
    catch (e) { return res.json({ code: -1, msg: '获取Token失败: ' + e.message }); }

    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - lookback_days * 86400000).toISOString().slice(0, 10);

    // ===== 阶段1：拉取视频素材报表 =====
    const allResults = [];
    const CONCURRENCY = 5;

    const reportTasks = accountsList.map(acct => async () => {
      try {
        const report = await adq.adqApiCall(sharedToken, 'daily_reports/get', 'GET', {
          account_id: acct.account_id,
          level: 'REPORT_LEVEL_MATERIAL_VIDEO',
          date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
          group_by: JSON.stringify(['video_id']),
          fields: JSON.stringify([
            'video_id', 'cost', 'view_count', 'valid_click_count',
            'conversions_count', 'conversions_cost', 'order_amount', 'order_roi', 'cpc', 'ctr',
          ]),
          page: 1,
          page_size: 200,
        }, acct.account_id);
        (report?.list || []).filter(i => parseFloat(i.cost || 0) > 0).forEach(item => {
          allResults.push({ ...item, account_id: acct.account_id, account_name: acct.account_name });
        });
      } catch (e) { /* skip */ }
    });
    for (let i = 0; i < reportTasks.length; i += CONCURRENCY) {
      await Promise.all(reportTasks.slice(i, i + CONCURRENCY).map(fn => fn()));
    }

    // ===== 阶段2：先过滤，再只查筛选结果的视频名称（高效） =====
    // 提取 latest 条件（按上线时间取前N条，需要后置处理）
    const latestCond = conditions.find(c => c.key === 'latest');
    const latestN = latestCond ? Math.max(1, parseInt(latestCond.value || 30)) : 0;

    const filtered = allResults.filter(item => {
      return conditions.every(cond => {
        if (cond.key === 'latest') return true; // 后置处理
        let val;
        switch (cond.key) {
          case 'roi': val = parseFloat(item.order_roi || 0); break;
          case 'cost': val = parseFloat(item.cost || 0) / 100; break;
          case 'cpc': val = parseFloat(item.cpc || 0) / 100; break;
          case 'cvr':
            const clicks = parseInt(item.valid_click_count || 0);
            val = clicks > 0 ? (parseInt(item.conversions_count || 0) / clicks * 100) : 0;
            break;
          case 'impression': val = parseInt(item.view_count || 0); break;
          default: return true;
        }
        if (cond.op === '>=') return val >= parseFloat(cond.value);
        if (cond.op === '<=') return val <= parseFloat(cond.value);
        return true;
      });
    });

    // 🛡️ 过审过滤：排除账户内被驳回过的视频，防止重搭再被驳回
    const deniedPerAcct = {};
    const deniedTasks = accountsList.map(a => async () => {
      deniedPerAcct[a.account_id] = await getDeniedVideoIds(sharedToken, a.account_id);
    });
    for (let i = 0; i < deniedTasks.length; i += 5) {
      await Promise.all(deniedTasks.slice(i, i + 5).map(fn => fn()));
    }
    const beforeDenied = filtered.length;
    const filteredSafe = filtered.filter(item => {
      const dset = deniedPerAcct[item.account_id];
      return !(dset && dset.has(String(item.video_id)));
    });
    const deniedSkipped = beforeDenied - filteredSafe.length;
    if (deniedSkipped > 0) {
      logger.info(`[SmartScan] 过审过滤: 跳过${deniedSkipped}条审核不通过的视频`);
    }
    // 使用过滤后结果继续
    filtered.length = 0;
    filtered.push(...filteredSafe);

    filtered.sort((a, b) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0));

    // 对筛选结果精确查找视频名称
    // 按 account_id 分组，优先从报表来源账户查找
    const videoMap = {};
    const vidByAccount = {};  // account_id -> [video_id]
    filtered.forEach(item => {
      const vid = String(item.video_id);
      if (!vidByAccount[item.account_id]) vidByAccount[item.account_id] = new Set();
      vidByAccount[item.account_id].add(vid);
    });

    // system_status: MEDIA_STATUS_VALID=有效 / MEDIA_STATUS_PENDING=审核中
    // status: ADSTATUS_NORMAL=启用 / ADSTATUS_DELETED=已删除
    const VIDEO_FIELDS = JSON.stringify(['video_id','media_id','signature','description','key_frame_image_url','created_time','system_status','status']);

    // 先从对应账户查找
    for (const [acctId, vidSet] of Object.entries(vidByAccount)) {
      for (const vid of vidSet) {
        if (videoMap[vid]) continue;
        try {
          const vd = await adq.adqApiCall(sharedToken, 'videos/get', 'GET', {
            account_id: acctId,
            filtering: JSON.stringify([{ field: 'media_id', operator: 'EQUALS', values: [vid] }]),
            fields: VIDEO_FIELDS,
            page: 1,
            page_size: 1,
          }, acctId);
          if (vd?.list?.[0]) videoMap[vd.list[0].video_id] = vd.list[0];
        } catch (e) { /* skip */ }
      }
    }

    // 仍未找到的，跨全部账户查找
    const allVids = [...new Set(filtered.map(i => String(i.video_id)))];
    const stillMissing = allVids.filter(v => !videoMap[v]);
    for (const vid of stillMissing) {
      for (const acct of allAccounts) {
        try {
          const vd = await adq.adqApiCall(sharedToken, 'videos/get', 'GET', {
            account_id: acct.account_id,
            filtering: JSON.stringify([{ field: 'media_id', operator: 'EQUALS', values: [vid] }]),
            fields: VIDEO_FIELDS,
            page: 1,
            page_size: 1,
          }, acct.account_id);
          if (vd?.list?.[0]) { videoMap[vd.list[0].video_id] = vd.list[0]; break; }
        } catch (e) { /* skip */ }
      }
    }

    // 合并名称 + 🛡️ 素材状态过滤（排除审核中/已删除，避免搭建失败）
    let statusSkipped = 0;
    let result = filtered.map(item => {
      const v = videoMap[item.video_id] || {};
      return {
        material_id: String(item.video_id),
        signature: v.signature || '',          // 视频文件哈希，跨账户唯一标识
        material_type: 'video',
        material_name: v.description || '',
        thumb_url: v.key_frame_image_url || '',
        created_time: v.created_time || '',    // 素材上线时间（用于"最新素材"排序）
        system_status: v.system_status || '',  // MEDIA_STATUS_VALID / MEDIA_STATUS_PENDING
        ad_status: v.status || '',             // ADSTATUS_NORMAL / ADSTATUS_DELETED
        cost: item.cost,
        view_count: item.view_count,
        valid_click_count: item.valid_click_count,
        conversions_count: item.conversions_count,
        conversions_cost: item.conversions_cost,
        order_amount: item.order_amount,
        order_roi: item.order_roi,
        cpc: item.cpc,
        ctr: item.ctr,
        account_id: item.account_id,
        account_name: item.account_name,
      };
    }).filter(r => {
      // 只保留"有效且启用"的素材；查不到状态的保留（可能是跨账户素材）
      if (r.system_status && r.system_status !== 'MEDIA_STATUS_VALID') { statusSkipped++; return false; }
      if (r.ad_status && r.ad_status !== 'ADSTATUS_NORMAL') { statusSkipped++; return false; }
      return true;
    });
    if (statusSkipped > 0) {
      logger.info(`[SmartScan] 素材状态过滤: 跳过${statusSkipped}条（审核中/已删除）`);
    }

    // 应用"最新素材"后置处理：按 created_time 降序取前N条
    if (latestN > 0) {
      result.sort((a, b) => {
        const ta = a.created_time ? new Date(a.created_time).getTime() : 0;
        const tb = b.created_time ? new Date(b.created_time).getTime() : 0;
        return tb - ta;
      });
      result = result.slice(0, latestN);
    }

    const namedCount = result.filter(i => i.material_name).length;
    logger.info(`AI智投素材扫描完成: 总计${allResults.length}条素材, 符合${result.length}条, 有名称${namedCount}条${latestN ? `, 取最新${latestN}条` : ''}`);
    res.json({ code: 0, data: result, total_scanned: allResults.length, denied_skipped: deniedSkipped, status_skipped: statusSkipped });
  } catch (e) {
    logger.error('AI智投素材扫描失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-pitcher/adgroups — 拉取账户广告组列表（用于选择目标广告组）
 * query: { account_id, status? }
 */
router.get('/adgroups', auth(), async (req, res) => {
  try {
    const { account_id, status, lookback_days = 1 } = req.query;
    if (!account_id) return res.json({ code: -1, msg: '缺少account_id' });

    const [acctRows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1', [account_id]);
    if (!acctRows.length) return res.json({ code: -1, msg: '账户不存在' });

    let token;
    try { token = await adq.getValidToken(acctRows[0].id); }
    catch (e) { return res.json({ code: -1, msg: 'Token失效: ' + e.message }); }

    const acctIdInt = parseInt(account_id);
    const list = [];
    let page = 1;
    while (page <= 10) {
      const params = {
        account_id: acctIdInt, page, page_size: 100,
        fields: JSON.stringify(['adgroup_id','adgroup_name','campaign_id','configured_status','daily_budget','bid_amount','optimization_goal','begin_date','end_date']),
      };
      if (status) params.filtering = JSON.stringify([{ field: 'configured_status', operator: 'EQUALS', values: [status] }]);
      const r = await adq.adqApiCall(token, 'adgroups/get', 'GET', params, acctIdInt);
      if (r?.list?.length) list.push(...r.list);
      if (!r?.list || r.list.length < 100) break;
      page++;
    }

    // 拉取广告组报表合并核心数据（近 lookback_days 天聚合）
    const lbDays = Math.max(1, Math.min(30, parseInt(lookback_days)));
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - (lbDays - 1) * 86400000).toISOString().slice(0, 10);
    const statsMap = {};
    try {
      let rp = 1;
      while (rp <= 10) {
        const report = await adq.adqApiCall(token, 'daily_reports/get', 'GET', {
          account_id: acctIdInt,
          level: 'REPORT_LEVEL_ADGROUP',
          date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
          group_by: JSON.stringify(['adgroup_id']),
          fields: JSON.stringify(['adgroup_id','cost','view_count','valid_click_count','conversions_count','conversions_cost','order_amount','order_roi','cpc','ctr']),
          page: rp, page_size: 200,
        }, acctIdInt);
        (report?.list || []).forEach(it => {
          const id = String(it.adgroup_id);
          if (!statsMap[id]) statsMap[id] = { cost: 0, view_count: 0, valid_click_count: 0, conversions_count: 0, order_amount: 0 };
          statsMap[id].cost += parseFloat(it.cost || 0);
          statsMap[id].view_count += parseInt(it.view_count || 0);
          statsMap[id].valid_click_count += parseInt(it.valid_click_count || 0);
          statsMap[id].conversions_count += parseInt(it.conversions_count || 0);
          statsMap[id].order_amount += parseFloat(it.order_amount || 0);
        });
        if (!report?.list || report.list.length < 200) break;
        rp++;
      }
    } catch (e) { logger.warn('拉取广告组报表失败: ' + e.message); }

    // 合并并计算衍生指标
    const merged = list.map(ag => {
      const s = statsMap[String(ag.adgroup_id)] || {};
      const cost = parseFloat(s.cost || 0);
      const clicks = parseInt(s.valid_click_count || 0);
      const conv = parseInt(s.conversions_count || 0);
      const order = parseFloat(s.order_amount || 0);
      return {
        ...ag,
        stats: {
          cost,
          view_count: parseInt(s.view_count || 0),
          valid_click_count: clicks,
          conversions_count: conv,
          order_amount: order,
          cpc: clicks > 0 ? cost / clicks : 0,
          cvr: clicks > 0 ? (conv / clicks) * 100 : 0,
          roi: cost > 0 ? order / cost : 0,
        },
      };
    });
    // 按消耗降序
    merged.sort((a, b) => (b.stats?.cost || 0) - (a.stats?.cost || 0));
    res.json({ code: 0, data: merged, lookback_days: lbDays });
  } catch (e) {
    logger.error('获取广告组列表失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-pitcher/smart-build — 向已有广告组添加素材创意
 * 优势: 复用已调优的定向、不触发去重、无需缩减人群
 * body: { combo_plans: [[{material_id, material_type, material_name},...], ...], account_id, target_adgroup_ids: [...] }
 */
router.post('/smart-build', auth(), async (req, res) => {
  try {
    const { combo_plans = [], account_id, target_adgroup_ids = [] } = req.body;
    if (!combo_plans.length) return res.json({ code: -1, msg: '请先组合计划' });
    if (!account_id) return res.json({ code: -1, msg: '缺少account_id' });
    if (!target_adgroup_ids.length) return res.json({ code: -1, msg: '请选择至少一个目标广告组' });

    const [acctRows] = await db.query('SELECT * FROM adq_accounts WHERE account_id = ? AND status = 1', [account_id]);
    if (!acctRows.length) return res.json({ code: -1, msg: '账户不存在' });

    let token;
    try { token = await adq.getValidToken(acctRows[0].id); }
    catch (e) { return res.json({ code: -1, msg: 'Token失效: ' + e.message }); }

    const acctIdInt = parseInt(account_id);
    let successCount = 0, failCount = 0;
    const logs = [];
    const now = new Date();
    const timeTag = String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');

    // 按 signature(media_signature) 解析目标账户可用的 video_id（解决跨账户 authorization expired）
    const sigToVideoCache = {};
    async function resolveVideoIdBySignature(signature) {
      if (!signature) return null;
      if (sigToVideoCache[signature] !== undefined) return sigToVideoCache[signature];
      try {
        const r = await adq.adqApiCall(token, 'videos/get', 'GET', {
          account_id: acctIdInt,
          filtering: JSON.stringify([{ field: 'media_signature', operator: 'EQUALS', values: [String(signature)] }]),
          page: 1, page_size: 1,
        }, acctIdInt);
        const first = r?.list?.[0];
        const vid = first?.video_id && first?.system_status === 'MEDIA_STATUS_VALID' ? String(first.video_id) : null;
        sigToVideoCache[signature] = vid;
        return vid;
      } catch (e) {
        sigToVideoCache[signature] = null;
        return null;
      }
    }

    // 按广告组去重 (adgroup_id, video_id)，防止同组重复加同视频（1800441 duplicated）
    const seenAdgroupVideo = new Set();  // key: `${adgroupId}:${videoId}`
    const adgroupCreativeCount = {};     // adgroup_id -> 已有创意数（用于 1800387 超限提示）
    // 预加载各目标广告组现有的 video_id 和创意数
    for (const agId of target_adgroup_ids) {
      adgroupCreativeCount[agId] = 0;
      try {
        let p = 1;
        while (p <= 5) {
          const r = await adq.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
            account_id: acctIdInt,
            filtering: JSON.stringify([{ field: 'adgroup_id', operator: 'EQUALS', values: [String(agId)] }]),
            page: p, page_size: 100,
            fields: JSON.stringify(['dynamic_creative_id','creative_components']),
          }, acctIdInt);
          const list = r?.list || [];
          adgroupCreativeCount[agId] += list.length;
          list.forEach(c => {
            const videos = c?.creative_components?.video || [];
            videos.forEach(v => {
              const vid = v?.value?.video_id;
              if (vid) seenAdgroupVideo.add(`${agId}:${vid}`);
            });
          });
          if (list.length < 100) break;
          p++;
        }
      } catch (e) { /* skip */ }
    }

    // 获取创意模板（组件化创意：复用视频号/按钮/跳转/悬浮区等组件，只替换视频和标题）
    const templateCache = {};
    const TEMPLATE_FIELDS = ['dynamic_creative_id','delivery_mode','smart_delivery_spec','creative_components'];
    async function getTemplate(adgroupId) {
      if (templateCache[adgroupId]) return templateCache[adgroupId];
      // 先在目标广告组找（带上 smart_delivery_spec 以复用 marketing_asset_id）
      try {
        const r = await adq.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
          account_id: acctIdInt,
          filtering: JSON.stringify([{ field: 'adgroup_id', operator: 'EQUALS', values: [String(adgroupId)] }]),
          page: 1, page_size: 1,
          fields: JSON.stringify(TEMPLATE_FIELDS),
        }, acctIdInt);
        if (r?.list?.[0]?.creative_components) { templateCache[adgroupId] = r.list[0]; return r.list[0]; }
      } catch (e) { /* skip */ }
      // 退回到账户内任意一条创意作为模板
      try {
        const r2 = await adq.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
          account_id: acctIdInt, page: 1, page_size: 1,
          fields: JSON.stringify(TEMPLATE_FIELDS),
        }, acctIdInt);
        if (r2?.list?.[0]?.creative_components) { templateCache[adgroupId] = r2.list[0]; return r2.list[0]; }
      } catch (e) { /* skip */ }
      return null;
    }

    // 基于模板构造新组件：其他组件传 component_id 复用，video/title 新建
    function buildComponents(template, material) {
      const src = template.creative_components || {};
      const out = {};
      for (const key of Object.keys(src)) {
        if (key === 'video' || key === 'image' || key === 'title') continue;
        const arr = (src[key] || []).filter(c => !c.is_deleted && c.component_id);
        if (arr.length) out[key] = arr.map(c => ({ component_id: c.component_id }));
      }
      if (material.material_type === 'video' && material.material_id) {
        out.video = [{ value: { video_id: String(material.material_id) } }];
      } else if (material.material_type === 'image' && material.material_id) {
        out.image = [{ value: { image_id: String(material.material_id) } }];
      }
      if (material.material_name) {
        // ADQ API 标题最大14字符
        out.title = [{ value: { content: String(material.material_name).slice(0, 14) } }];
      } else if (src.title?.length) {
        const t = src.title.filter(c => !c.is_deleted && c.component_id);
        if (t.length) out.title = t.slice(0, 1).map(c => ({ component_id: c.component_id }));
      }
      return out;
    }

    for (let pi = 0; pi < combo_plans.length; pi++) {
      const materials = combo_plans[pi];
      const matNames = materials.map(m => m.material_name || `素材${m.material_id}`).join('+');
      // 轮询分配到目标广告组
      const targetAdgroupId = target_adgroup_ids[pi % target_adgroup_ids.length];

      const template = await getTemplate(targetAdgroupId);
      if (!template) {
        failCount++;
        logs.push({ plan: pi + 1, status: 'fail', adgroup_id: targetAdgroupId, materials: matNames, error: '该账户无现有创意，无法获取组件模板' });
        continue;
      }

      let comboOk = 0, comboFail = 0;
      const errors = [];

      for (let mi = 0; mi < materials.length; mi++) {
        const mat = materials[mi];
        try {
          // 跨账户解析：素材若来自别账户，用 signature 在目标账户换取本地可用 video_id
          let effectiveVideoId = String(mat.material_id);
          if (mat.material_type === 'video' && mat.account_id && String(mat.account_id) !== String(acctIdInt)) {
            if (!mat.signature) {
              throw new Error(`视频${mat.material_id}来自账户${mat.account_id}，缺少 signature 无法跨账户定位（请重新扫描素材）`);
            }
            const localVid = await resolveVideoIdBySignature(mat.signature);
            if (!localVid) {
              throw new Error(`视频在目标账户${acctIdInt}未上传或状态异常，请先在本账户上传该素材`);
            }
            effectiveVideoId = localVid;
          }

          // 同一广告组已含该 video_id 的创意，跳过（避免 1800441 duplicated）
          const dedupeKey = `${targetAdgroupId}:${effectiveVideoId}`;
          if (seenAdgroupVideo.has(dedupeKey)) {
            throw new Error(`广告组${targetAdgroupId}已存在相同视频的创意，跳过重复添加`);
          }

          const creativeName = `ai-${timeTag}-${pi+1}-${mi+1}-${String(effectiveVideoId).slice(-6)}`;
          const matForBuild = { ...mat, material_id: effectiveVideoId };
          const reqData = {
            account_id: acctIdInt,
            adgroup_id: targetAdgroupId,
            dynamic_creative_name: creativeName,
            dynamic_creative_type: 'DYNAMIC_CREATIVE_TYPE_PROGRAM',
            delivery_mode: template.delivery_mode || 'DELIVERY_MODE_COMPONENT',
            creative_components: buildComponents(template, matForBuild),
          };
          // 复用模板的 smart_delivery_spec（避免 31045 marketing_asset_id=0）
          if (template.smart_delivery_spec && template.smart_delivery_spec.marketing_asset_id) {
            reqData.smart_delivery_spec = template.smart_delivery_spec;
          }
          await adq.createDynamicCreative(token, acctIdInt, reqData);
          seenAdgroupVideo.add(dedupeKey);
          comboOk++;
        } catch (creErr) {
          comboFail++;
          const rawMsg = creErr.message || '创意添加失败';
          let msg = rawMsg;
          let isDenied = false;
          if (msg.includes('1800387') || msg.includes('exceed limit')) {
            msg = `广告组${targetAdgroupId}创意数已达ADQ单组上限（当前${adgroupCreativeCount[targetAdgroupId]||0}条），请删除旧创意或换到其它广告组`;
          } else if (msg.includes('1800441') || msg.includes('duplicated')) {
            msg = `广告组${targetAdgroupId}已存在相同创意，已跳过`;
          } else if (msg.includes('1800357') || msg.includes('authorization has expired')) {
            msg = `视频在目标账户未授权，请重新扫描或先在本账户上传该素材`;
          } else if (msg.includes('1800267') || msg.includes('too many characters')) {
            msg = `标题超长（ADQ限14字符）`;
          } else if (msg.includes('31045') || msg.includes('marketing_asset_id')) {
            msg = `广告组${targetAdgroupId}缺少营销资产配置，请在ADQ后台为广告组绑定资产后重试`;
          } else if (isAuditDeniedError(rawMsg)) {
            msg = `❌审核驳回: ${rawMsg.slice(0,80)}`;
            isDenied = true;
          }
          // 🛡️ 驳回类错误 → 加入黑名单
          if (isDenied) {
            addToDeniedBlacklist({
              videoId: mat && (mat.material_id),
              accountId: acctIdInt,
              errorCode: (rawMsg.match(/1800\d{3}|31\d{3}/) || [''])[0],
              reason: rawMsg.slice(0, 200),
            });
            logger.warn(`[SmartBuild] 🛡️ 素材${mat.material_id}加入黑名单: ${rawMsg.slice(0,100)}`);
          }
          errors.push(msg);
          logger.warn(`创意添加失败[广告组${targetAdgroupId}]: ${rawMsg}`);
        }
      }

      if (comboOk > 0) {
        successCount++;
        logs.push({ plan: pi + 1, status: 'success', adgroup_id: targetAdgroupId, materials: matNames, note: `添加${comboOk}个创意${comboFail > 0 ? `，失败${comboFail}个` : ''}` });
      } else {
        failCount++;
        logs.push({ plan: pi + 1, status: 'fail', adgroup_id: targetAdgroupId, materials: matNames, error: errors[0] || '全部创意添加失败' });
      }
    }

    logger.info(`素材创意添加完成: ${combo_plans.length}条组合, 成功${successCount}, 失败${failCount}`);
    res.json({ code: 0, data: { total: combo_plans.length, success: successCount, fail: failCount, logs }, msg: `完成: 成功${successCount}, 失败${failCount}` });
  } catch (e) {
    logger.error('素材创意添加失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

// ============ 素材定时清理 ============

/**
 * 扫描待清理素材（按视频素材维度聚合）
 * @returns Array<{account_id, account_name, video_id, video_name, thumb_url, cost, roi, conversions_count, order_amount, affected_creatives: [{dynamic_creative_id, adgroup_id, creative_name}]}>
 */
async function scanBadVideos({ accountsList, token, startDate, endDate, minCost, maxRoi }) {
  const previewList = [];
  const CONCURRENCY = 5;
  const tasks = accountsList.map(acct => async () => {
    try {
      // 1. 拉取视频素材级报表（按 video_id 聚合）
      const report = await adq.adqApiCall(token, 'daily_reports/get', 'GET', {
        account_id: acct.account_id,
        level: 'REPORT_LEVEL_MATERIAL_VIDEO',
        date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
        group_by: JSON.stringify(['video_id']),
        fields: JSON.stringify(['video_id', 'cost', 'conversions_count', 'order_amount', 'order_roi']),
        page: 1,
        page_size: 200,
      }, acct.account_id);
      const list = (report?.list || []).filter(i => parseFloat(i.cost || 0) > 0);

      // 2. 筛选: 消耗≥minCost 且 ROI≤maxRoi
      const badVideos = list.filter(r => {
        const cost = parseFloat(r.cost || 0) / 100;
        const roi = parseFloat(r.order_roi || 0);
        return cost >= minCost && roi <= maxRoi;
      });
      if (!badVideos.length) return;

      // 3. 拉取该账户所有 dynamic_creatives，建立 video_id → creatives 映射
      const videoToCreatives = {};
      let page = 1;
      while (page <= 10) {
        const r = await adq.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
          account_id: acct.account_id,
          page, page_size: 100,
          fields: JSON.stringify(['dynamic_creative_id', 'adgroup_id', 'creative_name', 'creative_components']),
        }, acct.account_id);
        const creatives = r?.list || [];
        creatives.forEach(c => {
          const videos = c?.creative_components?.video || [];
          videos.forEach(v => {
            const vid = v?.value?.video_id;
            if (!vid) return;
            if (!videoToCreatives[vid]) videoToCreatives[vid] = [];
            videoToCreatives[vid].push({
              dynamic_creative_id: c.dynamic_creative_id,
              adgroup_id: c.adgroup_id,
              creative_name: c.creative_name || '',
            });
          });
        });
        if (creatives.length < 100) break;
        page++;
      }

      // 4. 拉取视频名称和封面（按 video_id 批量）
      const videoIds = badVideos.map(v => String(v.video_id));
      const videoMap = {};
      for (const vid of videoIds) {
        try {
          const vd = await adq.adqApiCall(token, 'videos/get', 'GET', {
            account_id: acct.account_id,
            filtering: JSON.stringify([{ field: 'media_id', operator: 'EQUALS', values: [vid] }]),
            fields: JSON.stringify(['video_id', 'description', 'key_frame_image_url', 'created_time']),
            page: 1, page_size: 1,
          }, acct.account_id);
          if (vd?.list?.[0]) videoMap[vid] = vd.list[0];
        } catch (e) { /* skip */ }
      }

      // 5. 合并输出
      badVideos.forEach(item => {
        const v = videoMap[item.video_id] || {};
        const affected = videoToCreatives[item.video_id] || [];
        if (!affected.length) return; // 没有引用的创意，跳过（视频已无投放）
        previewList.push({
          account_id: acct.account_id,
          account_name: acct.account_name,
          video_id: item.video_id,
          video_name: v.description || '',
          thumb_url: v.key_frame_image_url || '',
          cost: (parseFloat(item.cost || 0) / 100).toFixed(2),
          roi: parseFloat(item.order_roi || 0).toFixed(2),
          conversions_count: parseInt(item.conversions_count || 0),
          order_amount: (parseFloat(item.order_amount || 0) / 100).toFixed(2),
          affected_creatives: affected,
          affected_count: affected.length,
        });
      });
    } catch (e) { /* skip */ }
  });
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY).map(fn => fn()));
  }
  previewList.sort((a, b) => parseFloat(b.cost) - parseFloat(a.cost));
  return previewList;
}

/**
 * 核心清理执行函数 - cron 和 manual 共用（按视频素材维度）
 */
async function executeCleanup(rule, execType = 'manual', operator = 'system') {
  const details = [];
  let cleanedCount = 0;  // 清理的视频素材数
  let failedCount = 0;
  let deletedCreatives = 0;

  try {
    // 获取目标账户
    let accountsList;
    if (rule.scope === 'specific' && rule.account_ids) {
      const ids = JSON.parse(rule.account_ids || '[]');
      if (!ids.length) return { cleaned: 0, failed: 0, details: [] };
      const ph = ids.map(() => '?').join(',');
      const [rows] = await db.query(`SELECT * FROM adq_accounts WHERE account_id IN (${ph}) AND status=1 AND access_token IS NOT NULL`, ids);
      accountsList = rows;
    } else {
      const [rows] = await db.query('SELECT * FROM adq_accounts WHERE status=1 AND access_token IS NOT NULL');
      accountsList = rows;
    }
    if (!accountsList.length) return { cleaned: 0, failed: 0, details: [] };

    const token = await adq.getValidToken(accountsList[0].id);
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - (rule.lookback_days || 3) * 86400000).toISOString().slice(0, 10);
    const minCost = parseFloat(rule.min_cost) || 30;
    const maxRoi = parseFloat(rule.max_roi) || 1.0;

    const badList = await scanBadVideos({ accountsList, token, startDate, endDate, minCost, maxRoi });

    // 对每个差视频，删除所有引用它的创意
    for (const item of badList) {
      const creativeResults = [];
      let videoHasFailure = false;
      for (const cr of item.affected_creatives) {
        try {
          await adq.adqApiCall(token, 'dynamic_creatives/delete', 'POST', {
            account_id: parseInt(item.account_id),
            dynamic_creative_id: parseInt(cr.dynamic_creative_id),
          }, item.account_id);
          deletedCreatives++;
          creativeResults.push({ ...cr, status: 'deleted' });
        } catch (e) {
          videoHasFailure = true;
          creativeResults.push({ ...cr, status: 'failed', error: e.message.slice(0, 100) });
        }
      }
      if (videoHasFailure) failedCount++;
      else cleanedCount++;
      details.push({
        account_id: item.account_id,
        account_name: item.account_name,
        video_id: item.video_id,
        video_name: item.video_name,
        cost: item.cost,
        roi: item.roi,
        creatives: creativeResults,
      });
    }
  } catch (e) {
    logger.error('[Cleanup] 执行失败', { error: e.message });
  }

  try {
    await db.query(
      'INSERT INTO adq_cleanup_logs (rule_id, rule_name, exec_type, cleaned_count, failed_count, details, operator) VALUES (?,?,?,?,?,?,?)',
      [rule.id || null, rule.name || '', execType, cleanedCount, failedCount, JSON.stringify({ videos: cleanedCount, creatives_deleted: deletedCreatives, list: details }), operator]
    );
  } catch (e) { /* ignore */ }

  return { cleaned: cleanedCount, failed: failedCount, creatives_deleted: deletedCreatives, details };
}

/**
 * GET /api/adq-pitcher/cleanup-rules — 获取所有清理规则
 */
router.get('/cleanup-rules', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM adq_cleanup_rules ORDER BY id DESC');
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-pitcher/cleanup-rule — 新建/更新规则
 */
router.post('/cleanup-rule', auth(), async (req, res) => {
  try {
    const { id, name, enabled, scope, account_ids, min_cost, max_roi, lookback_days, schedule_time } = req.body;
    const nameV = (name || '默认清理规则').slice(0, 100);
    const enabledV = enabled ? 1 : 0;
    const scopeV = scope === 'specific' ? 'specific' : 'all';
    const accIdsV = scopeV === 'specific' ? JSON.stringify(account_ids || []) : null;
    const minCostV = parseFloat(min_cost) || 100;
    const maxRoiV = parseFloat(max_roi) || 0.5;
    const lookbackV = parseInt(lookback_days) || 3;
    const schedV = /^\d{2}:\d{2}$/.test(schedule_time) ? schedule_time : '09:00';

    if (id) {
      await db.query(
        'UPDATE adq_cleanup_rules SET name=?, enabled=?, scope=?, account_ids=?, min_cost=?, max_roi=?, lookback_days=?, schedule_time=? WHERE id=?',
        [nameV, enabledV, scopeV, accIdsV, minCostV, maxRoiV, lookbackV, schedV, id]
      );
      res.json({ code: 0, msg: '规则已更新', id });
    } else {
      const [r] = await db.query(
        'INSERT INTO adq_cleanup_rules (name, enabled, scope, account_ids, min_cost, max_roi, lookback_days, schedule_time) VALUES (?,?,?,?,?,?,?,?)',
        [nameV, enabledV, scopeV, accIdsV, minCostV, maxRoiV, lookbackV, schedV]
      );
      res.json({ code: 0, msg: '规则已创建', id: r.insertId });
    }
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * DELETE /api/adq-pitcher/cleanup-rule/:id
 */
router.delete('/cleanup-rule/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM adq_cleanup_rules WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '规则已删除' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-pitcher/cleanup-preview — 预览待清理素材（按视频素材维度）
 */
router.post('/cleanup-preview', auth(), async (req, res) => {
  try {
    const { scope = 'all', account_ids = [], min_cost = 30, max_roi = 1.0, lookback_days = 3 } = req.body;

    let accountsList;
    if (scope === 'specific') {
      if (!account_ids.length) return res.json({ code: -1, msg: '请至少选一个账户' });
      const ph = account_ids.map(() => '?').join(',');
      const [rows] = await db.query(`SELECT * FROM adq_accounts WHERE account_id IN (${ph}) AND status=1 AND access_token IS NOT NULL`, account_ids);
      accountsList = rows;
    } else {
      const [rows] = await db.query('SELECT * FROM adq_accounts WHERE status=1 AND access_token IS NOT NULL');
      accountsList = rows;
    }
    if (!accountsList.length) return res.json({ code: -1, msg: '没有可用的账户' });

    const token = await adq.getValidToken(accountsList[0].id);
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - lookback_days * 86400000).toISOString().slice(0, 10);

    const previewList = await scanBadVideos({
      accountsList, token, startDate, endDate,
      minCost: parseFloat(min_cost), maxRoi: parseFloat(max_roi),
    });
    res.json({ code: 0, data: previewList, total: previewList.length });
  } catch (e) {
    logger.error('素材清理预览失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-pitcher/cleanup-execute — 手动执行清理
 * body: { rule_id?, scope, account_ids, min_cost, max_roi, lookback_days }
 * 若传 rule_id 则使用已保存的规则；否则使用body中的参数临时执行
 */
router.post('/cleanup-execute', auth(), async (req, res) => {
  try {
    const { rule_id, scope = 'all', account_ids = [], min_cost = 30, max_roi = 1.0, lookback_days = 3, name } = req.body;
    let rule;
    if (rule_id) {
      const [rows] = await db.query('SELECT * FROM adq_cleanup_rules WHERE id=?', [rule_id]);
      if (!rows.length) return res.json({ code: -1, msg: '规则不存在' });
      rule = rows[0];
    } else {
      rule = { id: null, name: name || '临时清理', scope, account_ids: JSON.stringify(account_ids), min_cost, max_roi, lookback_days };
    }
    const operator = req.user?.username || 'admin';
    const result = await executeCleanup(rule, 'manual', operator);
    res.json({ code: 0, msg: `清理完成: 成功${result.cleaned}个, 失败${result.failed}个`, data: result });
  } catch (e) {
    logger.error('素材清理执行失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-pitcher/cleanup-logs — 查看执行记录
 */
router.get('/cleanup-logs', auth(), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const [rows] = await db.query('SELECT id, rule_id, rule_name, executed_at, exec_type, cleaned_count, failed_count, operator FROM adq_cleanup_logs ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-pitcher/cleanup-log/:id — 查看单次执行详情
 */
router.get('/cleanup-log/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM adq_cleanup_logs WHERE id=?', [req.params.id]);
    if (!rows.length) return res.json({ code: -1, msg: '记录不存在' });
    res.json({ code: 0, data: rows[0] });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ============================================================
// ================== AI 自动投放系统 (auto-deliver) ==================
// 超越人工专家：4因子素材评分 + 智能目标组筛选 + 三轴限流 + 跨账户迁移
// ============================================================

/**
 * 从数据库黑名单读取被驳回的视频ID集合
 * 黑名单由创建失败时自动入库（主动学习机制）
 * @param accountId - 若传则只取该账户的黑名单，null=全局
 */
async function getDeniedVideoIds(token, accountId) {
  const denied = new Set();
  try {
    let rows;
    if (accountId) {
      [rows] = await db.query('SELECT video_id FROM adq_denied_videos WHERE account_id=?', [String(accountId)]);
    } else {
      [rows] = await db.query('SELECT video_id FROM adq_denied_videos');
    }
    rows.forEach(r => denied.add(String(r.video_id)));
  } catch (e) { /* 表不存在时忽略 */ }
  return denied;
}

/**
 * 把审核失败的素材加入黑名单
 * 调用场景：创建创意返回1800xxx驳回相关错误时
 */
async function addToDeniedBlacklist({ videoId, accountId, errorCode, reason }) {
  if (!videoId || !accountId) return;
  try {
    await db.query(
      `INSERT INTO adq_denied_videos (video_id, account_id, error_code, reason, denied_count)
       VALUES (?,?,?,?,1)
       ON DUPLICATE KEY UPDATE denied_count=denied_count+1, reason=VALUES(reason), error_code=VALUES(error_code), denied_at=CURRENT_TIMESTAMP`,
      [String(videoId), String(accountId), String(errorCode || '').slice(0, 20), String(reason || '').slice(0, 255)]
    );
  } catch (e) { /* ignore */ }
}

/**
 * 检测错误消息是否为审核驳回类错误
 * ADQ 错误码参考:
 *   1800267 (标题过长), 1800357 (视频未授权), 1800387 (创意数超限),
 *   1800441 (重复创意), 1800xxx 类 review/content 驳回
 *   31045 (marketing_asset_id 缺失)
 */
function isAuditDeniedError(errMsg) {
  if (!errMsg) return false;
  const msg = String(errMsg).toLowerCase();
  // 内容审核驳回关键词
  const denyKeywords = ['审核', 'deny', 'denied', 'reject', 'violat', 'forbid', 'illegal', 'not allowed', 'not compliant', 'content check fail'];
  if (denyKeywords.some(k => msg.includes(k))) return true;
  // 部分错误码（需要补充）
  if (/18003(8[9-9]|9[0-9]|4[0-9])/.test(errMsg)) return true;  // 1800389-1800449 范围常见
  return false;
}

/**
 * 扫描优质素材（按视频素材维度，带多因子评分）
 * 筛选: cost>=minCost AND roi>=minRoi AND conversions>=minConv AND (ctr>=minCtr)?
 * 过审过滤: 自动排除账户内被驳回过的视频（防止重搭再被驳回）
 * 评分: ROI权重40% + 稳定性20%(暂以转化数代理) + 规模30% + CTR 10%
 */
async function scanGoodVideos({ accountsList, token, startDate, endDate, rule }) {
  const minCost = parseFloat(rule.min_cost) || 200;
  const minRoi = parseFloat(rule.min_roi) || 2.0;
  const minConv = parseInt(rule.min_conversions) || 5;
  const minCtr = rule.min_ctr ? parseFloat(rule.min_ctr) : null;
  const ageMaxDays = rule.material_age_max_days ? parseInt(rule.material_age_max_days) : null;

  const goodList = [];
  let deniedSkipped = 0;
  const CONCURRENCY = 5;
  const tasks = accountsList.map(acct => async () => {
    try {
      // 0. 先拉该账户"被驳回"的视频ID集合（过审过滤用）
      const deniedSet = await getDeniedVideoIds(token, acct.account_id);

      // 1. 拉取视频素材级报表（视频ID维度聚合）
      const report = await adq.adqApiCall(token, 'daily_reports/get', 'GET', {
        account_id: acct.account_id,
        level: 'REPORT_LEVEL_MATERIAL_VIDEO',
        date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
        group_by: JSON.stringify(['video_id']),
        fields: JSON.stringify(['video_id', 'cost', 'view_count', 'valid_click_count', 'conversions_count', 'order_amount', 'order_roi', 'ctr']),
        page: 1, page_size: 200,
      }, acct.account_id);
      const list = (report?.list || []).filter(i => parseFloat(i.cost || 0) > 0);

      // 2. 筛选优质（同时排除被驳回过的视频）
      const good = list.filter(r => {
        const cost = parseFloat(r.cost || 0) / 100;
        const roi = parseFloat(r.order_roi || 0);
        const conv = parseInt(r.conversions_count || 0);
        const ctr = parseFloat(r.ctr || 0);
        if (cost < minCost) return false;
        if (roi < minRoi) return false;
        if (conv < minConv) return false;
        if (minCtr && ctr < minCtr) return false;
        // 🛡️ 过审过滤: 跳过审核不通过的视频
        if (deniedSet.has(String(r.video_id))) { deniedSkipped++; return false; }
        return true;
      });
      if (!good.length) return;

      // 3. 解析视频元信息（signature 用于跨账户定位，created_time 用于年龄过滤）
      for (const item of good) {
        try {
          const vd = await adq.adqApiCall(token, 'videos/get', 'GET', {
            account_id: acct.account_id,
            filtering: JSON.stringify([{ field: 'media_id', operator: 'EQUALS', values: [String(item.video_id)] }]),
            fields: JSON.stringify(['video_id', 'signature', 'description', 'key_frame_image_url', 'created_time', 'system_status', 'status']),
            page: 1, page_size: 1,
          }, acct.account_id);
          const v = vd?.list?.[0] || {};
          // 年龄过滤
          if (ageMaxDays && v.created_time) {
            const ageDays = (Date.now() - new Date(v.created_time).getTime()) / 86400000;
            if (ageDays > ageMaxDays) continue;
          }
          // 🛡️ 素材状态过滤：审核中/已删除都跳过（下次扫描再说）
          if (v.system_status && v.system_status !== 'MEDIA_STATUS_VALID') { deniedSkipped++; continue; }
          if (v.status && v.status !== 'ADSTATUS_NORMAL') { deniedSkipped++; continue; }

          const cost = parseFloat(item.cost || 0) / 100;
          const roi = parseFloat(item.order_roi || 0);
          const conv = parseInt(item.conversions_count || 0);
          const ctr = parseFloat(item.ctr || 0);

          // 综合分（0-100）：ROI 权重40% + 规模30% + 转化数20% + CTR 10%
          const roiScore = Math.min(roi / Math.max(minRoi, 0.01), 2.0) * 20;     // ROI 达标1倍=20分，2倍=40分
          const scaleScore = Math.min(cost / Math.max(minCost, 1), 3.0) * 10;    // cost 达标1倍=10分，3倍=30分
          const convScore = Math.min(conv / Math.max(minConv, 1), 3.0) * 6.67;   // conv 达标1倍≈6.67分，3倍=20分
          const ctrScore = Math.min(ctr / 2.0, 1.0) * 10;                        // ctr=2%得满分10分
          const totalScore = (roiScore + scaleScore + convScore + ctrScore).toFixed(2);

          goodList.push({
            account_id: acct.account_id,
            account_name: acct.account_name,
            video_id: String(item.video_id),
            signature: v.signature || '',
            video_name: v.description || '',
            thumb_url: v.key_frame_image_url || '',
            created_time: v.created_time || '',
            cost: cost.toFixed(2),
            roi: roi.toFixed(2),
            conversions_count: conv,
            order_amount: (parseFloat(item.order_amount || 0) / 100).toFixed(2),
            ctr: ctr.toFixed(2),
            score: parseFloat(totalScore),
          });
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* skip */ }
  });
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY).map(fn => fn()));
  }
  if (deniedSkipped > 0) {
    logger.info(`[AutoDeliver] 过审过滤: 跳过${deniedSkipped}条审核不通过的视频`);
  }
  // 按综合分降序
  goodList.sort((a, b) => b.score - a.score);
  goodList._deniedSkipped = deniedSkipped;  // 暴露给上层记录到日志
  return goodList;
}

/**
 * 智能筛选目标广告组
 * smart 模式: 投放中 AND 组ROI>=阈值 AND 组消耗>=阈值 AND 组创意数<上限
 * all_active: 所有投放中组
 * specific: 指定组
 */
async function selectTargetAdgroups({ accountsList, token, rule }) {
  const mode = rule.target_mode || 'smart';
  const minRoi = parseFloat(rule.target_min_adgroup_roi) || 1.0;
  const minCost = parseFloat(rule.target_min_adgroup_cost) || 50;
  const maxCreatives = parseInt(rule.target_max_creatives) || 15;
  const lookback = parseInt(rule.lookback_days) || 3;
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - lookback * 86400000).toISOString().slice(0, 10);

  // 指定模式：直接使用 target_adgroup_ids
  if (mode === 'specific') {
    const ids = typeof rule.target_adgroup_ids === 'string' ? JSON.parse(rule.target_adgroup_ids || '[]') : (rule.target_adgroup_ids || []);
    // 需要归属到具体账户（按 account_id 分桶），但 specific 模式下 adgroup_id 是全局唯一的，保留为扁平数组
    return ids.map(agId => ({ adgroup_id: String(agId), account_id: null, current_creatives: 0, cost: 0, roi: 0 }));
  }

  const targets = [];
  const CONCURRENCY = 5;
  const tasks = accountsList.map(acct => async () => {
    try {
      // 1. 拉取广告组列表（只取投放中）
      const ags = [];
      let p = 1;
      while (p <= 10) {
        const r = await adq.adqApiCall(token, 'adgroups/get', 'GET', {
          account_id: acct.account_id, page: p, page_size: 100,
          filtering: JSON.stringify([{ field: 'configured_status', operator: 'EQUALS', values: ['AD_STATUS_NORMAL'] }]),
          fields: JSON.stringify(['adgroup_id', 'adgroup_name', 'campaign_id']),
        }, acct.account_id);
        const list = r?.list || [];
        list.forEach(a => ags.push({ ...a, account_id: acct.account_id, account_name: acct.account_name }));
        if (list.length < 100) break;
        p++;
      }
      if (!ags.length) return;

      // 2. 拉取广告组报表
      const statsMap = {};
      try {
        let rp = 1;
        while (rp <= 10) {
          const report = await adq.adqApiCall(token, 'daily_reports/get', 'GET', {
            account_id: acct.account_id,
            level: 'REPORT_LEVEL_ADGROUP',
            date_range: JSON.stringify({ start_date: startDate, end_date: endDate }),
            group_by: JSON.stringify(['adgroup_id']),
            fields: JSON.stringify(['adgroup_id', 'cost', 'order_amount', 'order_roi']),
            page: rp, page_size: 200,
          }, acct.account_id);
          (report?.list || []).forEach(it => {
            const id = String(it.adgroup_id);
            if (!statsMap[id]) statsMap[id] = { cost: 0, order_amount: 0 };
            statsMap[id].cost += parseFloat(it.cost || 0) / 100;
            statsMap[id].order_amount += parseFloat(it.order_amount || 0) / 100;
          });
          if (!report?.list || report.list.length < 200) break;
          rp++;
        }
      } catch (e) { /* skip */ }

      // 3. 拉取创意数（每组现有创意数量，用于避免超限）
      const creativeCountMap = {};
      try {
        let cp = 1;
        while (cp <= 20) {
          const r = await adq.adqApiCall(token, 'dynamic_creatives/get', 'GET', {
            account_id: acct.account_id, page: cp, page_size: 100,
            fields: JSON.stringify(['dynamic_creative_id', 'adgroup_id']),
          }, acct.account_id);
          const list = r?.list || [];
          list.forEach(c => {
            const agId = String(c.adgroup_id);
            creativeCountMap[agId] = (creativeCountMap[agId] || 0) + 1;
          });
          if (list.length < 100) break;
          cp++;
        }
      } catch (e) { /* skip */ }

      // 4. 过滤并计算匹配分
      ags.forEach(a => {
        const id = String(a.adgroup_id);
        const stat = statsMap[id] || { cost: 0, order_amount: 0 };
        const roi = stat.cost > 0 ? stat.order_amount / stat.cost : 0;
        const currentCreatives = creativeCountMap[id] || 0;
        // smart 模式过滤
        if (mode === 'smart') {
          if (stat.cost < minCost) return;          // 组消耗不足
          if (roi < minRoi) return;                  // 组 ROI 不达标
          if (currentCreatives >= maxCreatives) return; // 创意数已满
        }
        // all_active: 所有投放中，仅排除创意数满的
        if (mode === 'all_active') {
          if (currentCreatives >= maxCreatives) return;
        }
        // 匹配分：ROI 越高 + 创意数越少 = 越适合投
        const creativeSlotRatio = 1 - (currentCreatives / Math.max(maxCreatives, 1));
        const matchScore = roi * 10 + creativeSlotRatio * 20;
        targets.push({
          account_id: acct.account_id,
          account_name: acct.account_name,
          adgroup_id: id,
          adgroup_name: a.adgroup_name,
          campaign_id: a.campaign_id,
          cost: stat.cost.toFixed(2),
          roi: roi.toFixed(2),
          current_creatives: currentCreatives,
          slot_available: maxCreatives - currentCreatives,
          match_score: parseFloat(matchScore.toFixed(2)),
        });
      });
    } catch (e) { /* skip */ }
  });
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY).map(fn => fn()));
  }
  // 按匹配分降序
  targets.sort((a, b) => b.match_score - a.match_score);
  return targets;
}

/**
 * 分配算法：素材 → 广告组（贪心，遵守三轴限流）
 * 输入: goodVideos(按score降序), targets(按match_score降序), rule
 * 输出: [{video, target, reason}]
 */
function matchVideosToAdgroups({ goodVideos, targets, rule }) {
  const maxTotal = parseInt(rule.max_adds_per_run) || 50;
  const maxPerAdgroup = parseInt(rule.max_per_adgroup) || 2;
  const maxPerVideo = parseInt(rule.max_per_video) || 5;
  const crossAccount = rule.cross_account ? 1 : 0;

  const plan = [];
  const adgroupUsed = {};  // adgroup_id -> 本次已添加数
  const videoUsed = {};    // video_id -> 本次已投组数

  // 遍历素材（按综合分）
  for (const video of goodVideos) {
    if (plan.length >= maxTotal) break;
    if ((videoUsed[video.video_id] || 0) >= maxPerVideo) continue;

    // 对该素材，找匹配的广告组
    for (const target of targets) {
      if (plan.length >= maxTotal) break;
      if ((videoUsed[video.video_id] || 0) >= maxPerVideo) break;
      if ((adgroupUsed[target.adgroup_id] || 0) >= maxPerAdgroup) continue;
      // 跨账户控制
      if (!crossAccount && target.account_id && String(target.account_id) !== String(video.account_id)) continue;

      plan.push({
        video_id: video.video_id,
        video_name: video.video_name,
        signature: video.signature,
        source_account_id: video.account_id,
        video_score: video.score,
        target_account_id: target.account_id,
        target_adgroup_id: target.adgroup_id,
        target_adgroup_name: target.adgroup_name,
        target_match_score: target.match_score,
        reason: `素材${video.score}分 × 组${target.match_score}分 (组ROI${target.roi}, 剩${target.slot_available}位)`,
      });
      adgroupUsed[target.adgroup_id] = (adgroupUsed[target.adgroup_id] || 0) + 1;
      videoUsed[video.video_id] = (videoUsed[video.video_id] || 0) + 1;
    }
  }
  return plan;
}

/**
 * 核心自动投放执行函数 - cron 和 manual 共用
 */
async function executeAutoDeliver(rule, execType = 'manual', operator = 'system') {
  let addedCount = 0, skippedCount = 0, failedCount = 0;
  const details = [];
  let goodMaterialCount = 0, targetAdgroupCount = 0;

  try {
    // 规范化参数（来自 DB 可能是 JSON 字符串）
    const matScope = rule.material_scope || 'all';
    const matAcctIds = typeof rule.material_account_ids === 'string' ? JSON.parse(rule.material_account_ids || '[]') : (rule.material_account_ids || []);
    let accountsList;
    if (matScope === 'specific' && matAcctIds.length) {
      const ph = matAcctIds.map(() => '?').join(',');
      const [rows] = await db.query(`SELECT * FROM adq_accounts WHERE account_id IN (${ph}) AND status=1 AND access_token IS NOT NULL`, matAcctIds);
      accountsList = rows;
    } else {
      const [rows] = await db.query('SELECT * FROM adq_accounts WHERE status=1 AND access_token IS NOT NULL');
      accountsList = rows;
    }
    if (!accountsList.length) {
      return { added: 0, skipped: 0, failed: 0, details: [], good_material_count: 0, target_adgroup_count: 0 };
    }

    const token = await adq.getValidToken(accountsList[0].id);
    const endDate = new Date().toISOString().slice(0, 10);
    const lookback = parseInt(rule.lookback_days) || 3;
    const startDate = new Date(Date.now() - lookback * 86400000).toISOString().slice(0, 10);

    // 1. 扫描优质素材
    const goodVideos = await scanGoodVideos({ accountsList, token, startDate, endDate, rule });
    goodMaterialCount = goodVideos.length;
    if (!goodVideos.length) {
      await db.query(
        'INSERT INTO adq_autodeliver_logs (rule_id, rule_name, exec_type, good_material_count, target_adgroup_count, added_count, skipped_count, failed_count, details, operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [rule.id || null, rule.name || '', execType, 0, 0, 0, 0, 0, JSON.stringify({ reason: '没有符合条件的优质素材' }), operator]
      );
      return { added: 0, skipped: 0, failed: 0, details: [], good_material_count: 0, target_adgroup_count: 0 };
    }

    // 2. 筛选目标广告组（smart 模式下，若指定，用 all_accounts 拉取）
    const targets = await selectTargetAdgroups({ accountsList: rule.cross_account ? accountsList : accountsList, token, rule });
    targetAdgroupCount = targets.length;
    if (!targets.length) {
      await db.query(
        'INSERT INTO adq_autodeliver_logs (rule_id, rule_name, exec_type, good_material_count, target_adgroup_count, added_count, skipped_count, failed_count, details, operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [rule.id || null, rule.name || '', execType, goodMaterialCount, 0, 0, 0, 0, JSON.stringify({ reason: '没有符合条件的目标广告组', good_videos: goodVideos.slice(0, 5) }), operator]
      );
      return { added: 0, skipped: 0, failed: 0, details: [], good_material_count: goodMaterialCount, target_adgroup_count: 0 };
    }

    // 3. 分配算法
    const plan = matchVideosToAdgroups({ goodVideos, targets, rule });
    if (!plan.length) {
      await db.query(
        'INSERT INTO adq_autodeliver_logs (rule_id, rule_name, exec_type, good_material_count, target_adgroup_count, added_count, skipped_count, failed_count, details, operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [rule.id || null, rule.name || '', execType, goodMaterialCount, targetAdgroupCount, 0, 0, 0, JSON.stringify({ reason: '分配算法未生成任何投放计划' }), operator]
      );
      return { added: 0, skipped: 0, failed: 0, details: [], good_material_count: goodMaterialCount, target_adgroup_count: targetAdgroupCount };
    }

    // 4. 试运行模式：不真正调用 API
    if (rule.dry_run) {
      await db.query(
        'INSERT INTO adq_autodeliver_logs (rule_id, rule_name, exec_type, good_material_count, target_adgroup_count, added_count, skipped_count, failed_count, details, operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [rule.id || null, rule.name || '', 'preview', goodMaterialCount, targetAdgroupCount, 0, plan.length, 0, JSON.stringify({ dry_run: true, plan }), operator]
      );
      return { added: 0, skipped: plan.length, failed: 0, details: plan, dry_run: true, good_material_count: goodMaterialCount, target_adgroup_count: targetAdgroupCount };
    }

    // 5. 按目标账户分桶执行（复用 smart-build 的模板机制）
    // 按 target_account_id 分组
    const byAccount = {};
    for (const p of plan) {
      // specific 模式下 target.account_id 为 null，需要推断到素材所在账户
      const acctId = p.target_account_id || p.source_account_id;
      if (!byAccount[acctId]) byAccount[acctId] = [];
      byAccount[acctId].push({ ...p, _resolved_account_id: acctId });
    }

    // 每个目标账户单独调 smart-build 内联逻辑
    for (const [tgtAcctId, planItems] of Object.entries(byAccount)) {
      let acctToken;
      try {
        const [acctRows] = await db.query('SELECT * FROM adq_accounts WHERE account_id=? AND status=1', [tgtAcctId]);
        if (!acctRows.length) {
          planItems.forEach(p => {
            failedCount++;
            details.push({ ...p, status: 'failed', error: `目标账户${tgtAcctId}不存在` });
          });
          continue;
        }
        acctToken = await adq.getValidToken(acctRows[0].id);
      } catch (e) {
        planItems.forEach(p => {
          failedCount++;
          details.push({ ...p, status: 'failed', error: `获取账户${tgtAcctId} token失败: ${e.message}` });
        });
        continue;
      }
      const acctIdInt = parseInt(tgtAcctId);

      // 为每个 adgroup 拉模板和已有 video_id（防重）
      const templateCache = {};
      const adgroupVideoSet = {};
      const TEMPLATE_FIELDS = ['dynamic_creative_id', 'delivery_mode', 'smart_delivery_spec', 'creative_components'];
      async function getTemplate(adgroupId) {
        if (templateCache[adgroupId]) return templateCache[adgroupId];
        try {
          const r = await adq.adqApiCall(acctToken, 'dynamic_creatives/get', 'GET', {
            account_id: acctIdInt,
            filtering: JSON.stringify([{ field: 'adgroup_id', operator: 'EQUALS', values: [String(adgroupId)] }]),
            page: 1, page_size: 1,
            fields: JSON.stringify(TEMPLATE_FIELDS),
          }, acctIdInt);
          if (r?.list?.[0]?.creative_components) { templateCache[adgroupId] = r.list[0]; return r.list[0]; }
        } catch (e) { /* skip */ }
        try {
          const r2 = await adq.adqApiCall(acctToken, 'dynamic_creatives/get', 'GET', {
            account_id: acctIdInt, page: 1, page_size: 1,
            fields: JSON.stringify(TEMPLATE_FIELDS),
          }, acctIdInt);
          if (r2?.list?.[0]?.creative_components) { templateCache[adgroupId] = r2.list[0]; return r2.list[0]; }
        } catch (e) { /* skip */ }
        return null;
      }
      async function loadAdgroupVideos(adgroupId) {
        if (adgroupVideoSet[adgroupId]) return adgroupVideoSet[adgroupId];
        const set = new Set();
        try {
          let p = 1;
          while (p <= 5) {
            const r = await adq.adqApiCall(acctToken, 'dynamic_creatives/get', 'GET', {
              account_id: acctIdInt,
              filtering: JSON.stringify([{ field: 'adgroup_id', operator: 'EQUALS', values: [String(adgroupId)] }]),
              page: p, page_size: 100,
              fields: JSON.stringify(['dynamic_creative_id', 'creative_components']),
            }, acctIdInt);
            const list = r?.list || [];
            list.forEach(c => {
              const vs = c?.creative_components?.video || [];
              vs.forEach(v => { if (v?.value?.video_id) set.add(String(v.value.video_id)); });
            });
            if (list.length < 100) break;
            p++;
          }
        } catch (e) { /* skip */ }
        adgroupVideoSet[adgroupId] = set;
        return set;
      }
      // 跨账户 signature 解析缓存
      const sigCache = {};
      async function resolveVideo(item) {
        if (String(item.source_account_id) === String(acctIdInt)) return item.video_id;
        if (!item.signature) return null;
        if (sigCache[item.signature] !== undefined) return sigCache[item.signature];
        try {
          const r = await adq.adqApiCall(acctToken, 'videos/get', 'GET', {
            account_id: acctIdInt,
            filtering: JSON.stringify([{ field: 'media_signature', operator: 'EQUALS', values: [String(item.signature)] }]),
            page: 1, page_size: 1,
          }, acctIdInt);
          const first = r?.list?.[0];
          const vid = first?.video_id && first?.system_status === 'MEDIA_STATUS_VALID' ? String(first.video_id) : null;
          sigCache[item.signature] = vid;
          return vid;
        } catch (e) {
          sigCache[item.signature] = null;
          return null;
        }
      }
      function buildComponents(template, videoId, title) {
        const src = template.creative_components || {};
        const out = {};
        for (const key of Object.keys(src)) {
          if (key === 'video' || key === 'image' || key === 'title') continue;
          const arr = (src[key] || []).filter(c => !c.is_deleted && c.component_id);
          if (arr.length) out[key] = arr.map(c => ({ component_id: c.component_id }));
        }
        out.video = [{ value: { video_id: String(videoId) } }];
        if (title) out.title = [{ value: { content: String(title).slice(0, 14) } }];
        else if (src.title?.length) {
          const t = src.title.filter(c => !c.is_deleted && c.component_id);
          if (t.length) out.title = t.slice(0, 1).map(c => ({ component_id: c.component_id }));
        }
        return out;
      }

      const now = new Date();
      const timeTag = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

      for (let i = 0; i < planItems.length; i++) {
        const item = planItems[i];
        try {
          // 1. 解析 video_id（跨账户用 signature 转换）
          const videoId = await resolveVideo(item);
          if (!videoId) {
            failedCount++;
            details.push({ ...item, status: 'failed', error: '视频在目标账户未上传或无效' });
            continue;
          }

          // 2. 去重：组内已有该 video_id
          const existSet = await loadAdgroupVideos(item.target_adgroup_id);
          if (existSet.has(videoId)) {
            skippedCount++;
            details.push({ ...item, status: 'skipped', error: '目标组已有相同素材' });
            continue;
          }

          // 3. 模板
          const template = await getTemplate(item.target_adgroup_id);
          if (!template) {
            failedCount++;
            details.push({ ...item, status: 'failed', error: '目标组无模板可复用' });
            continue;
          }

          // 4. 创建创意
          const creativeName = `ai-auto-${timeTag}-${i + 1}-${String(videoId).slice(-6)}`;
          const reqData = {
            account_id: acctIdInt,
            adgroup_id: parseInt(item.target_adgroup_id),
            dynamic_creative_name: creativeName,
            dynamic_creative_type: 'DYNAMIC_CREATIVE_TYPE_PROGRAM',
            delivery_mode: template.delivery_mode || 'DELIVERY_MODE_COMPONENT',
            creative_components: buildComponents(template, videoId, item.video_name),
          };
          if (template.smart_delivery_spec && template.smart_delivery_spec.marketing_asset_id) {
            reqData.smart_delivery_spec = template.smart_delivery_spec;
          }
          await adq.createDynamicCreative(acctToken, acctIdInt, reqData);
          existSet.add(videoId);
          addedCount++;
          details.push({ ...item, status: 'added', creative_name: creativeName });
        } catch (e) {
          const rawMsg = e.message || '创建失败';
          let msg = rawMsg;
          let isDenied = false;
          if (msg.includes('1800387') || msg.includes('exceed limit')) msg = '组创意数达上限';
          else if (msg.includes('1800441') || msg.includes('duplicated')) msg = '组内已存在该素材';
          else if (msg.includes('1800357')) msg = '视频在目标账户未授权';
          else if (isAuditDeniedError(rawMsg)) { msg = '❌审核驳回: ' + rawMsg.slice(0, 80); isDenied = true; }
          // 🛡️ 驳回类错误 → 自动加入黑名单（下次扫描自动跳过）
          if (isDenied) {
            const videoId = item.video_id || await resolveVideo(item);
            await addToDeniedBlacklist({
              videoId, accountId: acctIdInt,
              errorCode: (rawMsg.match(/1800\d{3}|31\d{3}/) || [''])[0],
              reason: rawMsg.slice(0, 200),
            });
            logger.warn(`[AutoDeliver] 🛡️ video_id=${videoId} 加入黑名单: ${rawMsg.slice(0,100)}`);
          }
          failedCount++;
          details.push({ ...item, status: 'failed', error: msg, auto_blacklisted: isDenied });
          logger.warn(`[AutoDeliver] 添加失败: ${rawMsg}`);
        }
      }
    }
  } catch (e) {
    logger.error('[AutoDeliver] 执行失败', { error: e.message });
  }

  try {
    await db.query(
      'INSERT INTO adq_autodeliver_logs (rule_id, rule_name, exec_type, good_material_count, target_adgroup_count, added_count, skipped_count, failed_count, details, operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [rule.id || null, rule.name || '', execType, goodMaterialCount, targetAdgroupCount, addedCount, skippedCount, failedCount, JSON.stringify({ list: details }), operator]
    );
  } catch (e) { /* ignore */ }

  return { added: addedCount, skipped: skippedCount, failed: failedCount, details, good_material_count: goodMaterialCount, target_adgroup_count: targetAdgroupCount };
}

// ========== 自动投放路由 ==========

router.get('/autodeliver-rules', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM adq_autodeliver_rules ORDER BY id DESC');
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

router.post('/autodeliver-rule', auth(), async (req, res) => {
  try {
    const b = req.body;
    const nameV = (b.name || '默认投放规则').slice(0, 100);
    const enabledV = b.enabled ? 1 : 0;
    const matScope = b.material_scope === 'specific' ? 'specific' : 'all';
    const matAcctIdsV = matScope === 'specific' ? JSON.stringify(b.material_account_ids || []) : null;
    const minCostV = parseFloat(b.min_cost) || 200;
    const minRoiV = parseFloat(b.min_roi) || 2.0;
    const minConvV = parseInt(b.min_conversions) || 5;
    const minCtrV = b.min_ctr ? parseFloat(b.min_ctr) : null;
    const lookbackV = parseInt(b.lookback_days) || 3;
    const ageMaxV = b.material_age_max_days ? parseInt(b.material_age_max_days) : null;
    const tgtMode = ['all_active', 'specific', 'smart'].includes(b.target_mode) ? b.target_mode : 'smart';
    const tgtAgIdsV = tgtMode === 'specific' ? JSON.stringify(b.target_adgroup_ids || []) : null;
    const tgtMinRoiV = parseFloat(b.target_min_adgroup_roi) || 1.0;
    const tgtMinCostV = parseFloat(b.target_min_adgroup_cost) || 50;
    const tgtMaxCrV = parseInt(b.target_max_creatives) || 15;
    const maxRunV = parseInt(b.max_adds_per_run) || 50;
    const maxAgV = parseInt(b.max_per_adgroup) || 2;
    const maxVdV = parseInt(b.max_per_video) || 5;
    const crossV = b.cross_account ? 1 : 0;
    const schedV = /^\d{2}:\d{2}$/.test(b.schedule_time) ? b.schedule_time : '09:00';
    const dryV = b.dry_run ? 1 : 0;

    if (b.id) {
      await db.query(
        `UPDATE adq_autodeliver_rules SET name=?, enabled=?, material_scope=?, material_account_ids=?, min_cost=?, min_roi=?, min_conversions=?, min_ctr=?, lookback_days=?, material_age_max_days=?, target_mode=?, target_adgroup_ids=?, target_min_adgroup_roi=?, target_min_adgroup_cost=?, target_max_creatives=?, max_adds_per_run=?, max_per_adgroup=?, max_per_video=?, cross_account=?, schedule_time=?, dry_run=? WHERE id=?`,
        [nameV, enabledV, matScope, matAcctIdsV, minCostV, minRoiV, minConvV, minCtrV, lookbackV, ageMaxV, tgtMode, tgtAgIdsV, tgtMinRoiV, tgtMinCostV, tgtMaxCrV, maxRunV, maxAgV, maxVdV, crossV, schedV, dryV, b.id]
      );
      res.json({ code: 0, msg: '规则已更新', id: b.id });
    } else {
      const [r] = await db.query(
        `INSERT INTO adq_autodeliver_rules (name, enabled, material_scope, material_account_ids, min_cost, min_roi, min_conversions, min_ctr, lookback_days, material_age_max_days, target_mode, target_adgroup_ids, target_min_adgroup_roi, target_min_adgroup_cost, target_max_creatives, max_adds_per_run, max_per_adgroup, max_per_video, cross_account, schedule_time, dry_run) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nameV, enabledV, matScope, matAcctIdsV, minCostV, minRoiV, minConvV, minCtrV, lookbackV, ageMaxV, tgtMode, tgtAgIdsV, tgtMinRoiV, tgtMinCostV, tgtMaxCrV, maxRunV, maxAgV, maxVdV, crossV, schedV, dryV]
      );
      res.json({ code: 0, msg: '规则已创建', id: r.insertId });
    }
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

router.delete('/autodeliver-rule/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM adq_autodeliver_rules WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '规则已删除' });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

// 预览: 扫描优质素材 + 匹配目标组 + 返回执行计划（不调用创建API）
router.post('/autodeliver-preview', auth(), async (req, res) => {
  try {
    const ruleInput = { ...req.body, dry_run: 1 };
    const result = await executeAutoDeliver(ruleInput, 'preview', req.user?.username || 'admin');
    res.json({ code: 0, data: result });
  } catch (e) {
    logger.error('自动投放预览失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

// 手动执行
router.post('/autodeliver-execute', auth(), async (req, res) => {
  try {
    const { rule_id } = req.body;
    let rule;
    if (rule_id) {
      const [rows] = await db.query('SELECT * FROM adq_autodeliver_rules WHERE id=?', [rule_id]);
      if (!rows.length) return res.json({ code: -1, msg: '规则不存在' });
      rule = rows[0];
    } else {
      rule = req.body;
    }
    const operator = req.user?.username || 'admin';
    const result = await executeAutoDeliver(rule, 'manual', operator);
    res.json({ code: 0, msg: `完成: 新增${result.added}, 跳过${result.skipped}, 失败${result.failed}`, data: result });
  } catch (e) {
    logger.error('自动投放执行失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

router.get('/autodeliver-logs', auth(), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const [rows] = await db.query('SELECT id, rule_id, rule_name, executed_at, exec_type, good_material_count, target_adgroup_count, added_count, skipped_count, failed_count, operator FROM adq_autodeliver_logs ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

// 查询黑名单
router.get('/denied-videos', auth(), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const [rows] = await db.query(
      'SELECT video_id, account_id, error_code, reason, denied_count, denied_at FROM adq_denied_videos ORDER BY denied_at DESC LIMIT ?',
      [limit]
    );
    res.json({ code: 0, data: rows, total: rows.length });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

// 手动从黑名单移除（误伤时救回）
router.delete('/denied-videos/:videoId', auth(), async (req, res) => {
  try {
    const { accountId } = req.query;
    if (accountId) {
      await db.query('DELETE FROM adq_denied_videos WHERE video_id=? AND account_id=?', [req.params.videoId, accountId]);
    } else {
      await db.query('DELETE FROM adq_denied_videos WHERE video_id=?', [req.params.videoId]);
    }
    res.json({ code: 0, msg: '已从黑名单移除' });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

router.get('/autodeliver-log/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM adq_autodeliver_logs WHERE id=?', [req.params.id]);
    if (!rows.length) return res.json({ code: -1, msg: '记录不存在' });
    res.json({ code: 0, data: rows[0] });
  } catch (e) { res.json({ code: -1, msg: e.message }); }
});

module.exports = router;
module.exports.executeCleanup = executeCleanup;
module.exports.executeAutoDeliver = executeAutoDeliver;
