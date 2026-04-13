const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');

// ===================== Auto-create table =====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_premium_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_id VARCHAR(50) NOT NULL,
        advertiser_id VARCHAR(50),
        title VARCHAR(500),
        cover_url VARCHAR(1000),
        video_url VARCHAR(1000),
        start_date DATE,
        target_cost DECIMAL(12,2) DEFAULT 70000,
        status ENUM('screening','incubating','success','failed','adjusting') DEFAULT 'screening',
        quality_score INT DEFAULT 0,
        quality_tags JSON,
        plan_content LONGTEXT,
        daily_data JSON,
        total_cost DECIMAL(12,2) DEFAULT 0,
        current_roi DECIMAL(8,4) DEFAULT 0,
        current_ctr DECIMAL(8,4) DEFAULT 0,
        current_cvr DECIMAL(8,4) DEFAULT 0,
        result_summary LONGTEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_material (material_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[Premium] table ready');
  } catch (e) {
    logger.error('[Premium] create table failed', { error: e.message });
  }
})();

// ===================== Scoring =====================
function calcQualityScore(m) {
  let score = 0;
  const finishRate = parseFloat(m.avg_finish_rate || 0);
  const ctr = parseFloat(m.avg_ctr || 0);
  const cvr = parseFloat(m.avg_cvr || 0);
  const roi = parseFloat(m.roi || 0);
  const plays = parseInt(m.total_plays || 0);
  const cost = parseFloat(m.total_cost || 0);

  // 完播率 25分
  if (finishRate >= 15) score += 25; else if (finishRate >= 10) score += 20; else if (finishRate >= 6) score += 14; else if (finishRate >= 3) score += 8;
  // CTR 20分
  if (ctr >= 3) score += 20; else if (ctr >= 2) score += 15; else if (ctr >= 1.5) score += 10; else if (ctr >= 1) score += 5;
  // CVR 20分
  if (cvr >= 12) score += 20; else if (cvr >= 8) score += 15; else if (cvr >= 5) score += 10; else if (cvr >= 3) score += 5;
  // ROI 20分
  if (roi >= 3) score += 20; else if (roi >= 2) score += 15; else if (roi >= 1.5) score += 10; else if (roi >= 1) score += 5;
  // 播放量 10分
  if (plays >= 50000) score += 10; else if (plays >= 20000) score += 7; else if (plays >= 5000) score += 4;
  // 消耗规模 5分
  if (cost >= 5000) score += 5; else if (cost >= 2000) score += 3; else if (cost >= 500) score += 1;

  return Math.min(100, score);
}

function calcQualityTags(m, score) {
  const tags = [];
  if (score >= 70) tags.push('\u4f18\u8d28\u7d20\u6750');
  if (parseFloat(m.avg_finish_rate || 0) >= 10) tags.push('\u9ad8\u5b8c\u64ad');
  if (parseFloat(m.avg_ctr || 0) >= 3) tags.push('\u9ad8\u70b9\u51fb');
  if (parseFloat(m.avg_cvr || 0) >= 10) tags.push('\u9ad8\u8f6c\u5316');
  if (parseInt(m.total_plays || 0) >= 20000) tags.push('\u9ad8\u64ad\u653e');
  if (parseFloat(m.roi || 0) >= 2.5) tags.push('ROI\u4f18\u79c0');
  if (parseFloat(m.total_cost || 0) >= 3000) tags.push('\u6d88\u8017\u7a33\u5b9a');
  return tags;
}

// ===================== GET /candidates =====================
router.get('/candidates', auth(), async (req, res) => {
  try {
    const weekStart = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const recent3 = dayjs().subtract(3, 'day').format('YYYY-MM-DD');

    const [candidates] = await db.query(`
      SELECT m.material_id, m.title,
        SUM(m.cost) AS total_cost,
        SUM(m.pay_order_count) AS orders,
        SUM(m.pay_order_amount) AS gmv,
        CASE WHEN SUM(m.cost)>0 THEN ROUND(SUM(m.pay_order_amount)/SUM(m.cost), 2) ELSE 0 END AS roi,
        ROUND(AVG(CASE WHEN m.cost>=50 THEN m.product_ctr END), 2) AS avg_ctr,
        ROUND(AVG(CASE WHEN m.cost>=50 THEN m.convert_rate END), 2) AS avg_cvr,
        ROUND(AVG(CASE WHEN m.cost>=50 THEN m.play_duration_3s_rate END), 2) AS avg_3s_rate,
        ROUND(AVG(CASE WHEN m.cost>=50 THEN m.video_finish_rate END), 2) AS avg_finish_rate,
        MAX(m.video_url) AS video_url,
        MAX(m.cover_url) AS cover_url,
        MAX(m.advertiser_id) AS advertiser_id,
        COUNT(DISTINCT m.stat_date) AS active_days,
        
        SUM(m.show_cnt) AS total_shows,
        SUM(m.video_play_count) AS total_plays,
        0 AS interact_rate
      FROM qc_material_stats m
      WHERE m.stat_date >= ? AND m.cost > 0
      GROUP BY m.material_id, m.title
      HAVING SUM(m.cost) BETWEEN 500 AND 15000
        AND COUNT(DISTINCT CASE WHEN m.stat_date >= ? THEN m.stat_date END) >= 1
        AND (
          (SUM(m.cost)>0 AND SUM(m.pay_order_amount)/SUM(m.cost) >= 1.2)
          OR AVG(CASE WHEN m.cost>=50 THEN m.product_ctr END) >= 1.5
          OR AVG(CASE WHEN m.cost>=50 THEN m.convert_rate END) >= 5
          OR AVG(CASE WHEN m.cost>=50 THEN m.play_duration_3s_rate END) >= 30
        )
      ORDER BY SUM(m.cost) DESC
      LIMIT 50
    `, [weekStart, recent3]);

    const scored = candidates.map(m => {
      const quality_score = calcQualityScore({ ...m, cost_trend: 0 });
      const quality_tags = calcQualityTags({ ...m, cost_trend: 0 }, quality_score);
      return { ...m, quality_score, quality_tags };
    });
    scored.sort((a, b) => b.quality_score - a.quality_score);

    res.json({ code: 0, data: { list: scored.slice(0, 30), total: scored.length } });
  } catch (e) {
    logger.error('[Premium] candidates error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== POST /start-incubation =====================
router.post('/start-incubation', auth(), async (req, res) => {
  try {
    const { material_id } = req.body;
    if (!material_id) return res.json({ code: 400, msg: 'missing material_id' });

    const today = dayjs().format('YYYY-MM-DD');
    const weekStart = dayjs().subtract(7, 'day').format('YYYY-MM-DD');

    const [rows] = await db.query(`
      SELECT material_id, MAX(title) AS title, MAX(cover_url) AS cover_url, MAX(video_url) AS video_url,
        MAX(advertiser_id) AS advertiser_id,
        SUM(cost) AS total_cost, SUM(pay_order_count) AS orders, SUM(pay_order_amount) AS gmv,
        CASE WHEN SUM(cost)>0 THEN ROUND(SUM(pay_order_amount)/SUM(cost),2) ELSE 0 END AS roi,
        ROUND(AVG(CASE WHEN cost>=50 THEN product_ctr END),2) AS avg_ctr,
        ROUND(AVG(CASE WHEN cost>=50 THEN convert_rate END),2) AS avg_cvr,
        ROUND(AVG(CASE WHEN cost>=50 THEN play_duration_3s_rate END),2) AS avg_3s_rate
      FROM qc_material_stats WHERE stat_date >= ? AND material_id = ? AND cost > 0
      GROUP BY material_id
    `, [weekStart, material_id]);

    if (!rows.length) return res.json({ code: 404, msg: 'material not found' });
    const m = rows[0];

    const [existing] = await db.query(
      "SELECT id FROM qc_premium_tracking WHERE material_id = ? AND status IN ('incubating','adjusting')", [material_id]
    );
    if (existing.length) return res.json({ code: 400, msg: '\u8be5\u7d20\u6750\u5df2\u5728\u5b75\u5316\u4e2d' });

    const score = calcQualityScore({ ...m, interact_rate: 0, cost_trend: 0 });
    const tags = calcQualityTags({ ...m, interact_rate: 0, cost_trend: 0 }, score);
    const dailyData = [{ day: 0, date: today, cost: parseFloat(m.total_cost), roi: parseFloat(m.roi), ctr: parseFloat(m.avg_ctr || 0), cvr: parseFloat(m.avg_cvr || 0), note: '\u57fa\u51c6\u6570\u636e(\u8fd17\u5929\u7d2f\u8ba1)' }];

    const [result] = await db.query(`
      INSERT INTO qc_premium_tracking (material_id, advertiser_id, title, cover_url, video_url, start_date, status, quality_score, quality_tags, daily_data, total_cost, current_roi, current_ctr, current_cvr)
      VALUES (?, ?, ?, ?, ?, ?, 'incubating', ?, ?, ?, ?, ?, ?, ?)
    `, [material_id, m.advertiser_id, m.title, m.cover_url, m.video_url, today, score, JSON.stringify(tags), JSON.stringify(dailyData), parseFloat(m.total_cost) || 0, parseFloat(m.roi) || 0, parseFloat(m.avg_ctr) || 0, parseFloat(m.avg_cvr) || 0]);

    const trackId = result.insertId;
    generatePlan(trackId, m).catch(e => logger.error('[Premium] plan gen failed', { error: e.message }));

    res.json({ code: 0, msg: '\u5b75\u5316\u5df2\u542f\u52a8\uff0cAI\u65b9\u6848\u751f\u6210\u4e2d...' });
  } catch (e) {
    logger.error('[Premium] start error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /tracking =====================
router.get('/tracking', auth(), async (req, res) => {
  try {
    const { status } = req.query;
    let where = '1=1';
    const params = [];
    if (status) {
      const statuses = status.split(',');
      where += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    const [list] = await db.query(
      `SELECT * FROM qc_premium_tracking WHERE ${where} ORDER BY FIELD(status,'incubating','adjusting','screening','success','failed'), updated_at DESC LIMIT 50`, params
    );

    const enriched = list.map(r => {
      const days = r.start_date ? dayjs().diff(dayjs(r.start_date), 'day') : 0;
      const progress = r.target_cost > 0 ? Math.min(100, (parseFloat(r.total_cost) / parseFloat(r.target_cost) * 100)).toFixed(1) : 0;
      let dailyData = []; try { dailyData = typeof r.daily_data === 'string' ? JSON.parse(r.daily_data) : (r.daily_data || []); } catch(e) {}
      let qualityTags = []; try { qualityTags = typeof r.quality_tags === 'string' ? JSON.parse(r.quality_tags) : (r.quality_tags || []); } catch(e) {}
      return { ...r, days_elapsed: days, days_remaining: Math.max(0, 7 - days), progress_pct: parseFloat(progress), daily_data: dailyData, quality_tags: qualityTags };
    });

    res.json({ code: 0, data: { list: enriched } });
  } catch (e) {
    logger.error('[Premium] tracking list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /tracking/:id =====================
router.get('/tracking/:id', auth(), async (req, res) => {
  try {
    const [[record]] = await db.query('SELECT * FROM qc_premium_tracking WHERE id = ?', [req.params.id]);
    if (!record) return res.json({ code: 404, msg: 'not found' });
    try { record.daily_data = typeof record.daily_data === 'string' ? JSON.parse(record.daily_data) : (record.daily_data || []); } catch(e) { record.daily_data = []; }
    try { record.quality_tags = typeof record.quality_tags === 'string' ? JSON.parse(record.quality_tags) : (record.quality_tags || []); } catch(e) { record.quality_tags = []; }
    res.json({ code: 0, data: record });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===================== POST /tracking/:id/suggest =====================
router.post('/tracking/:id/suggest', auth(), async (req, res) => {
  try {
    const [[record]] = await db.query('SELECT * FROM qc_premium_tracking WHERE id = ?', [req.params.id]);
    if (!record) return res.json({ code: 404, msg: 'not found' });

    let dailyData = []; try { dailyData = typeof record.daily_data === 'string' ? JSON.parse(record.daily_data) : (record.daily_data || []); } catch(e) {}
    const days = record.start_date ? dayjs().diff(dayjs(record.start_date), 'day') : 0;
    const trendText = dailyData.map(d => `Day${d.day}: cost=${parseFloat(d.cost||0).toFixed(0)} ROI:${d.roi} CTR:${d.ctr}% CVR:${d.cvr}%`).join('\n');
    const suggestion = await callAISuggest(record, days, trendText);

    if (dailyData.length) {
      dailyData[dailyData.length - 1].suggestion = suggestion;
      await db.query('UPDATE qc_premium_tracking SET daily_data = ? WHERE id = ?', [JSON.stringify(dailyData), record.id]);
    }
    res.json({ code: 0, data: { suggestion } });
  } catch (e) {
    logger.error('[Premium] suggest error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== POST /tracking/:id/status =====================
router.post('/tracking/:id/status', auth(), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['screening','incubating','success','failed','adjusting'].includes(status)) return res.json({ code: 400, msg: 'invalid status' });
    await db.query('UPDATE qc_premium_tracking SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ code: 0, msg: 'updated' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===================== Daily auto-update =====================
async function updatePremiumTracking() {
  const [records] = await db.query("SELECT * FROM qc_premium_tracking WHERE status IN ('incubating','adjusting')");
  if (!records.length) { logger.info('[Premium] no active incubations'); return; }

  const today = dayjs().format('YYYY-MM-DD');

  for (const r of records) {
    try {
      let dailyData = []; try { dailyData = typeof r.daily_data === 'string' ? JSON.parse(r.daily_data) : (r.daily_data || []); } catch(e) {}
      if (dailyData.some(d => d.date === today)) continue;

      const days = r.start_date ? dayjs().diff(dayjs(r.start_date), 'day') : 0;
      // 查当日数据
      const [[todayStats]] = await db.query(`
        SELECT SUM(cost) AS cost, SUM(pay_order_amount) AS gmv, SUM(pay_order_count) AS orders,
          CASE WHEN SUM(cost)>0 THEN ROUND(SUM(pay_order_amount)/SUM(cost),2) ELSE 0 END AS roi,
          ROUND(AVG(CASE WHEN cost>=50 THEN product_ctr END),2) AS ctr,
          ROUND(AVG(CASE WHEN cost>=50 THEN convert_rate END),2) AS cvr
        FROM qc_material_stats WHERE material_id = ? AND stat_date = ?
      `, [r.material_id, today]);
      // 查孵化期间累计
      const [[periodStats]] = await db.query(`
        SELECT SUM(cost) AS cost
        FROM qc_material_stats WHERE material_id = ? AND stat_date BETWEEN ? AND ?
      `, [r.material_id, r.start_date, today]);

      const dayCost = parseFloat(todayStats.cost || 0);
      const dayRoi = parseFloat(todayStats.roi || 0);
      const dayCtr = parseFloat(todayStats.ctr || 0);
      const dayCvr = parseFloat(todayStats.cvr || 0);
      const totalCost = parseFloat(periodStats.cost || 0);
      const totalRoi = dayRoi;
      const totalCtr = dayCtr;
      const totalCvr = dayCvr;

      dailyData.push({ day: days, date: today, cost: dayCost, roi: dayRoi, ctr: dayCtr, cvr: dayCvr, note: '' });

      let newStatus = r.status;
      let summary = null;

      // 成功标准: 最近1天消耗≥10000 或 近3天日均≥10000
      const recentDays = dailyData.slice(-3).filter(d => d.day > 0);
      const recentAvgCost = recentDays.length ? recentDays.reduce((s, d) => s + (d.cost || 0), 0) / recentDays.length : 0;
      if (dayCost >= 10000 || (recentDays.length >= 3 && recentAvgCost >= 10000)) {
        newStatus = 'success';
        summary = `\u5b75\u5316\u6210\u529f! \u7b2c${days}\u5929\u65e5\u6d88\u8017\u8fbe\u00a5${dayCost.toFixed(0)}\uff0cROI ${dayRoi}\u3002\u5efa\u8bae\u7ee7\u7eed\u653e\u91cf\u3002`;
      } else if (days >= 7) {
        newStatus = 'failed';
        const avgDailyCost = days > 0 ? totalCost / days : 0;
        summary = `7\u5929\u5b75\u5316\u7ed3\u675f\u3002\u65e5\u5747\u6d88\u8017\u00a5${avgDailyCost.toFixed(0)}(\u76ee\u6807\u00a510000)\uff0c\u7d2f\u8ba1\u00a5${totalCost.toFixed(0)}\u3002${avgDailyCost >= 5000 ? '\u63a5\u8fd1\u76ee\u6807\uff0c\u5efa\u8bae\u5ef6\u957f\u5b75\u5316' : totalRoi >= 1.5 ? '\u63d0\u9ad8\u9884\u7b97\u7ee7\u7eed\u5b75\u5316' : 'ROI\u504f\u4f4e\uff0c\u5efa\u8bae\u4f18\u5316\u7d20\u6750'}\u3002`;
      }

      const updateParams = [JSON.stringify(dailyData), totalCost, totalRoi, totalCtr, totalCvr, newStatus];
      if (summary) {
        updateParams.push(summary, r.id);
        await db.query('UPDATE qc_premium_tracking SET daily_data=?, total_cost=?, current_roi=?, current_ctr=?, current_cvr=?, status=?, result_summary=? WHERE id=?', updateParams);
      } else {
        updateParams.push(r.id);
        await db.query('UPDATE qc_premium_tracking SET daily_data=?, total_cost=?, current_roi=?, current_ctr=?, current_cvr=?, status=? WHERE id=?', updateParams);
      }

      logger.info(`[Premium] updated ${r.title}: Day${days} cost=${totalCost.toFixed(0)} status=${newStatus}`);
    } catch (e) {
      logger.error(`[Premium] update failed id=${r.id}`, { error: e.message });
    }
  }
}

// ===================== AI Plan Generation =====================
async function generatePlan(trackId, m) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  const prompt = `你是雪玲妃品牌的千川全域推广专家。为以下素材制定7天孵化方案，目标：日消耗码1万。

素材：「${m.title}」
近7天数据：消耗¥${parseFloat(m.total_cost).toFixed(0)} | ${m.orders}单 | ROI:${m.roi} | CTR:${m.avg_ctr}% | CVR:${m.avg_cvr}%

❕重要：千川全域推广的规则约束，方案必须严格遵守：
- 全域推广不支持“不限/广泛”定向，不支持兴趣定向，不支持店铺人群包，不支持手动出价
- 全域只能用：系统智能推荐 + 搜索词包 + DMP相似人群(1-10%) + 重定向人群
- 全域的出价方式只有：成本稳投、控成本投放、放量投放
- 创意素材必须多条对比：原片 + 快剪A(前3秒痛点+到手价) + 快剪B(对比证据)，每条计划必须挂不同素材
- 搜索词包建议：绿泥/清洁面膜/洗面奶/黑头/控油 等品类词
- 承接页聚焦“油皮控油+深清”主题，配合限时券/凑单包邮

请输出可直接执行的孵化方案(markdown格式，800字内)：

## 素材诊断
分析当前数据表现，判断阶段(起量期/稳定期/衰退期)

## 创意素材准备(必须3条以上)
列出每条素材的具体差异：原片vs快剪A(前3秒痛点+到手价)vs快剪B(对比证据)

## 7天孵化步骤

### Day1 冷启动测试
- 新建计划数量、每条挂什么素材
- 出价方式(成本稳投/控成本)
- 定向：系统智能 + 搜索词包(具体词)
- 日预算金额
- 承接页设置建议

### Day2 数据判断
- 3小时无转化的处理办法
- 哪些指标决定保留/暂停
- 新增重定向人群(1-3天加购/点击)

### Day3-4 优化放量
- 搜索加词：黑头/出油/毛孔粗大 等长尾词
- 相似人群扩至5-10%
- 平行计划×2(不同封面/首句)
- 日预算提升节奏

### Day5-6 规模化放量
- 优胜计划复制策略
- 是否需要混剪衍生版本
- 限时券/凑单包邮策略

### Day7 评估总结
- 成功/失败的判断标准
- 后续策略建议

## 风险预警
- 具体的止损线(ROI、消耗无转化时长)
- 计划暂停/调整的触发条件

要求：每一步写明具体操作和数字，不写“根据情况调整”这类空话。`;

  let content;
  try {
    if (!apiKey) throw new Error('no key');
    const r = await axios.post(`${baseUrl}/chat/completions`, {
      model, messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 90000 });
    content = r.data.choices?.[0]?.message?.content;
  } catch (e) {
    logger.warn('[Premium] AI failed, using rule-based plan', { error: e.message });
  }

  if (!content) {
    content = generateRulePlan(m);
  }

  await db.query('UPDATE qc_premium_tracking SET plan_content = ? WHERE id = ?', [content, trackId]);
  logger.info(`[Premium] plan generated for id=${trackId}`);
}

function generateRulePlan(m) {
  const cost = parseFloat(m.total_cost || 0);
  const roi = parseFloat(m.roi || 0);
  const dailyBudget = Math.max(800, Math.round(cost / 7 * 2));
  const isGreenMud = (m.title || '').includes('绿泥');
  const product = isGreenMud ? '绿泥控油洁面乳' : '百合保湿洁面乳';
  const searchWords = isGreenMud ? '绿泥/清洁面膜/控油洗面奶/黑头粉刺' : '洗面奶/保湿洁面/百合洗面奶';

  return `## 素材诊断
「${m.title}」近7天消耗¥${cost.toFixed(0)}，ROI ${roi}，${roi >= 2 ? '数据优秀，具备放量潜力' : roi >= 1.5 ? '数据达标，可尝试孵化' : 'ROI偏低，需谨慎投放'}

## 创意素材准备(必须3条)
1. **原片**: 直接使用「${m.title}」原片投放
2. **快剪A**: 前3秒替换为痛点开屏(“满脸油光黑头多?”) + 到手价弹窗
3. **快剪B**: 前3秒替换为对比证据(使用前后对比/同品对比) + 产品特写

## 7天孵化步骤

### Day1 冷启动测试
- 新建3条全域推广计划，分别挂原片/快剪A/快剪B
- 出价：成本稳投，每条日预算¥${dailyBudget}
- 定向：系统智能推荐 + 搜索词包(${searchWords})
- 承接页：聚焦“油皮控油+深清”主题，配限时券

### Day2 数据判断
- 3小时无转化 → 检查承接页是否匹配，考虑替换素材
- 保留标准：CTR≥1.5% 且 CVR≥5% 的计划
- 新增重定向人群：1-3天加购/点击用户
- 搜索加词：黑头/出油/毛孔粗大

### Day3-4 优化放量
- DMP相似人群扩至5-10%
- 为每条优胜素材建平行计划×2(不同封面/不同首句)
- 日预算提至¥${Math.round(dailyBudget * 1.8)}/条
- 承接页加凑单包邮机制

### Day5-6 规模化放量
- 优胜计划复制3-5条，切换控成本投放
- 日预算提至¥${Math.round(dailyBudget * 3)}
- 准备1-2个混剪衍生版本(保留爆点片段，重新剪辑前3秒)
- 开启限时券推广

### Day7 评估总结
- 日消耗≥¥10000 → 成功，继续放量
- 日消耗¥5000-10000且ROI≥1.5 → 延长3天，加预算
- 日消耗<¥5000或ROI<1.0 → 暂停，优化素材后重试

## 风险预警
- 单日消耗超¥2000但无转化 → 立即暂停该计划
- 连续2天ROI<0.8 → 全部暂停，检查素材和承接页
- CTR骤降50%以上 → 检查是否被限流，考虑替换素材

---
> ⚙️ 规则生成方案，基于千川全域推广规则。配置AI后将获得更精准的个性化分析。`;
}

async function callAISuggest(record, days, trendText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  const totalCost = parseFloat(record.total_cost || 0);
  const target = parseFloat(record.target_cost || 10000);
  const progress = (totalCost / target * 100).toFixed(0);

  const prompt = `\u4f60\u662f\u5343\u5ddd\u6295\u653e\u4f18\u5316\u5e08\u3002\u7d20\u6750\u300c${record.title}\u300d\u6b63\u5728\u5b75\u5316\u7b2c${days}\u5929(\u51717\u5929)\uff0c\u76ee\u6807\u6d88\u8017\u00a5${target.toFixed(0)}\u3002

\u5f53\u524d\u8fdb\u5ea6\uff1a\u00a5${totalCost.toFixed(0)} (${progress}%)
\u6bcf\u65e5\u6570\u636e\uff1a
${trendText}

\u8bf7\u7ed9\u51fa\u4eca\u65e5\u5177\u4f53\u64cd\u4f5c\u5efa\u8bae(100\u5b57\u5185)\uff1a\u9884\u7b97\u8c03\u6574\u3001\u51fa\u4ef7\u7b56\u7565\u3001\u662f\u5426\u9700\u8981\u8c03\u6574\u3002`;

  try {
    if (!apiKey) throw new Error('no key');
    const r = await axios.post(`${baseUrl}/chat/completions`, {
      model, messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 });
    return r.data.choices?.[0]?.message?.content || '\u6682\u65e0AI\u5efa\u8bae\uff0c\u8bf7\u6839\u636e\u6570\u636e\u8d8b\u52bf\u624b\u52a8\u5224\u65ad\u3002';
  } catch (e) {
    return `Day${days}\u5efa\u8bae\uff1a${totalCost < target * 0.3 ? '\u6d88\u8017\u8fdb\u5ea6\u504f\u6162\uff0c\u5efa\u8bae\u63d0\u9ad8\u65e5\u9884\u7b9750%\u5e76\u590d\u5236\u4f18\u80dc\u8ba1\u5212' : totalCost >= target * 0.7 ? '\u8fdb\u5ea6\u826f\u597d\uff0c\u4fdd\u6301\u5f53\u524d\u7b56\u7565' : '\u9002\u5f53\u63d0\u5347\u9884\u7b97\uff0c\u5173\u6ce8ROI\u53d8\u5316'}`;
  }
}

module.exports = router;
module.exports.updatePremiumTracking = updatePremiumTracking;
