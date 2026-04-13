const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');

// ===================== 建表 =====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS incubation_plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_id VARCHAR(50) NOT NULL,
        title VARCHAR(500),
        current_cost DECIMAL(12,2) DEFAULT 0,
        current_roi DECIMAL(8,2) DEFAULT 0,
        current_ctr DECIMAL(8,4) DEFAULT 0,
        current_cvr DECIMAL(8,4) DEFAULT 0,
        potential_score INT DEFAULT 0 COMMENT '潜力评分0-100',
        plan_content LONGTEXT COMMENT 'AI生成的孵化计划',
        status ENUM('pending','executing','completed','abandoned') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[Incubation] 表结构就绪');
  } catch (e) {
    logger.error('[Incubation] 建表失败', { error: e.message });
  }
})();

// ===================== 获取潜力素材列表（候选孵化对象）=====================
router.get('/candidates', auth(), async (req, res) => {
  try {
    const periodStart = dayjs().subtract(15, 'day').format('YYYY-MM-DD');

    // 潜力素材：消耗1000-10000，且ROI>=1.5或CTR较高
    const [candidates] = await db.query(`
      SELECT material_id, title,
        SUM(cost) AS total_cost,
        SUM(pay_order_count) AS orders,
        SUM(pay_order_amount) AS gmv,
        CASE WHEN SUM(cost)>0 THEN ROUND(SUM(pay_order_amount)/SUM(cost), 2) ELSE 0 END AS roi,
        ROUND(AVG(CASE WHEN cost >= 50 THEN product_ctr END), 2) AS avg_ctr,
        ROUND(AVG(CASE WHEN cost >= 50 THEN convert_rate END), 2) AS avg_cvr,
        ROUND(AVG(CASE WHEN cost >= 50 THEN play_duration_3s_rate END), 2) AS avg_3s_rate,
        ROUND(AVG(CASE WHEN cost >= 50 THEN play_over_rate END), 2) AS avg_finish_rate,
        MAX(video_url) AS video_url,
        MAX(cover_url) AS cover_url,
        MAX(video_duration) AS duration,
        COUNT(DISTINCT stat_date) AS active_days
      FROM qc_material_stats
      WHERE stat_date >= ? AND cost > 0
      GROUP BY material_id, title
      HAVING SUM(cost) BETWEEN 1000 AND 10000
        AND (
          (SUM(cost)>0 AND SUM(pay_order_amount)/SUM(cost) >= 1.5)
          OR AVG(CASE WHEN cost >= 50 THEN product_ctr END) >= 1.5
          OR AVG(CASE WHEN cost >= 50 THEN convert_rate END) >= 8
        )
      ORDER BY
        CASE WHEN SUM(cost)>0 THEN SUM(pay_order_amount)/SUM(cost) ELSE 0 END DESC,
        SUM(cost) DESC
      LIMIT 30
    `, [periodStart]);

    // 给每个素材计算潜力评分
    const scored = candidates.map(m => {
      let score = 0;
      const roi = parseFloat(m.roi || 0);
      const ctr = parseFloat(m.avg_ctr || 0);
      const cvr = parseFloat(m.avg_cvr || 0);
      const cost = parseFloat(m.total_cost || 0);

      // ROI评分（最高40分）
      if (roi >= 3) score += 40;
      else if (roi >= 2.5) score += 35;
      else if (roi >= 2) score += 30;
      else if (roi >= 1.5) score += 20;

      // CTR评分（最高25分）
      if (ctr >= 2.5) score += 25;
      else if (ctr >= 2.0) score += 20;
      else if (ctr >= 1.5) score += 15;
      else if (ctr >= 1.0) score += 10;

      // 转化率评分（最高25分）
      if (cvr >= 15) score += 25;
      else if (cvr >= 10) score += 20;
      else if (cvr >= 8) score += 15;
      else if (cvr >= 5) score += 10;

      // 消耗规模评分（最高10分）：消耗越高说明已经过一定验证
      if (cost >= 5000) score += 10;
      else if (cost >= 3000) score += 7;
      else if (cost >= 1000) score += 4;

      return { ...m, potential_score: Math.min(100, score) };
    });

    // 按潜力评分排序
    scored.sort((a, b) => b.potential_score - a.potential_score);

    res.json({ code: 0, data: { list: scored, total: scored.length } });
  } catch (e) {
    logger.error('[Incubation] candidates error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 为指定素材生成孵化计划 =====================
router.post('/generate', auth(), async (req, res) => {
  try {
    const { material_id } = req.body;
    if (!material_id) return res.json({ code: 400, msg: '请选择素材' });

    res.json({ code: 0, msg: '孵化计划生成中...' });

    generateIncubationPlan(material_id).catch(e => {
      logger.error('[Incubation] 生成失败', { error: e.message, material_id });
    });
  } catch (e) {
    logger.error('[Incubation] generate error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 批量生成（自动选TOP10潜力素材）=====================
router.post('/generate-batch', auth(), async (req, res) => {
  try {
    res.json({ code: 0, msg: '批量孵化计划生成中...' });

    generateBatchPlans().catch(e => {
      logger.error('[Incubation] 批量生成失败', { error: e.message });
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 已生成的孵化计划列表 =====================
router.get('/plans', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, parseInt(req.query.pageSize) || 20);
    const status = req.query.status || '';
    const offset = (page - 1) * pageSize;

    let where = '1=1';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM incubation_plans WHERE ${where}`, params
    );
    const [list] = await db.query(
      `SELECT * FROM incubation_plans WHERE ${where} ORDER BY potential_score DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ code: 0, data: { list, total, page, pageSize } });
  } catch (e) {
    logger.error('[Incubation] plans list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 更新孵化计划状态 =====================
router.put('/plans/:id/status', auth(), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'executing', 'completed', 'abandoned'].includes(status)) {
      return res.json({ code: 400, msg: '无效状态' });
    }
    await db.query('UPDATE incubation_plans SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ code: 0, msg: '状态已更新' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 核心：生成单个孵化计划 =====================
async function generateIncubationPlan(materialId) {
  const periodStart = dayjs().subtract(15, 'day').format('YYYY-MM-DD');

  // 查素材详细数据
  const [rows] = await db.query(`
    SELECT material_id, title,
      SUM(cost) AS total_cost, SUM(pay_order_count) AS orders, SUM(pay_order_amount) AS gmv,
      CASE WHEN SUM(cost)>0 THEN ROUND(SUM(pay_order_amount)/SUM(cost), 2) ELSE 0 END AS roi,
      ROUND(AVG(CASE WHEN cost>=50 THEN product_ctr END), 2) AS avg_ctr,
      ROUND(AVG(CASE WHEN cost>=50 THEN convert_rate END), 2) AS avg_cvr,
      ROUND(AVG(CASE WHEN cost>=50 THEN play_duration_3s_rate END), 2) AS avg_3s_rate,
      ROUND(AVG(CASE WHEN cost>=50 THEN play_over_rate END), 2) AS avg_finish_rate,
      MAX(video_duration) AS duration,
      COUNT(DISTINCT stat_date) AS active_days
    FROM qc_material_stats
    WHERE stat_date >= ? AND material_id = ? AND cost > 0
    GROUP BY material_id, title
  `, [periodStart, materialId]);

  if (!rows.length) { logger.warn('[Incubation] 素材不存在', { materialId }); return; }

  const m = rows[0];

  // 查每日趋势（判断素材是上升期还是衰退期）
  const [dailyTrend] = await db.query(`
    SELECT stat_date, cost, pay_order_count AS orders,
      CASE WHEN cost>0 THEN ROUND(pay_order_amount/cost, 2) ELSE 0 END AS roi,
      product_ctr AS ctr, convert_rate AS cvr
    FROM qc_material_stats
    WHERE stat_date >= ? AND material_id = ? AND cost > 0
    ORDER BY stat_date ASC
  `, [periodStart, materialId]);

  const trendText = dailyTrend.map(d =>
    `${d.stat_date}: 消耗¥${parseFloat(d.cost).toFixed(0)} ${d.orders}单 ROI:${d.roi} CTR:${d.ctr}% CVR:${d.cvr}%`
  ).join('\n');

  // 查同类爆款作参考
  const [hotRef] = await db.query(`
    SELECT title, SUM(cost) AS cost,
      CASE WHEN SUM(cost)>0 THEN ROUND(SUM(pay_order_amount)/SUM(cost),2) ELSE 0 END AS roi
    FROM qc_material_stats
    WHERE stat_date >= ? AND cost > 0
    GROUP BY material_id, title HAVING SUM(cost) >= 10000
    ORDER BY SUM(cost) DESC LIMIT 5
  `, [periodStart]);

  const hotRefText = hotRef.map((h, i) => `${i + 1}. 「${h.title}」消耗¥${parseFloat(h.cost).toFixed(0)} ROI:${h.roi}`).join('\n');

  // 调用AI
  const planContent = await callAIIncubation(m, trendText, hotRefText);

  // 存入数据库（去重：同素材更新）
  const [existing] = await db.query(
    'SELECT id FROM incubation_plans WHERE material_id = ? AND status IN ("pending","executing")', [materialId]
  );

  if (existing.length) {
    await db.query(
      `UPDATE incubation_plans SET title=?, current_cost=?, current_roi=?, current_ctr=?, current_cvr=?,
       potential_score=?, plan_content=?, updated_at=NOW() WHERE id=?`,
      [m.title, m.total_cost, m.roi, m.avg_ctr, m.avg_cvr,
       calculateScore(m), planContent, existing[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO incubation_plans (material_id, title, current_cost, current_roi, current_ctr, current_cvr, potential_score, plan_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [materialId, m.title, m.total_cost, m.roi, m.avg_ctr, m.avg_cvr, calculateScore(m), planContent]
    );
  }

  logger.info(`[Incubation] 孵化计划生成完成: ${m.title}`);
}

// ===================== 批量生成 =====================
async function generateBatchPlans() {
  const periodStart = dayjs().subtract(15, 'day').format('YYYY-MM-DD');

  const [candidates] = await db.query(`
    SELECT material_id FROM qc_material_stats
    WHERE stat_date >= ? AND cost > 0
    GROUP BY material_id
    HAVING SUM(cost) BETWEEN 1000 AND 10000
      AND (SUM(pay_order_amount)/SUM(cost) >= 1.5 OR AVG(CASE WHEN cost>=50 THEN product_ctr END) >= 1.5)
    ORDER BY CASE WHEN SUM(cost)>0 THEN SUM(pay_order_amount)/SUM(cost) ELSE 0 END DESC
    LIMIT 10
  `, [periodStart]);

  logger.info(`[Incubation] 批量生成: ${candidates.length}个潜力素材`);

  for (const c of candidates) {
    try {
      await generateIncubationPlan(c.material_id);
      await new Promise(r => setTimeout(r, 2000)); // 间隔2s避免API限流
    } catch (e) {
      logger.error(`[Incubation] 单个生成失败 ${c.material_id}`, { error: e.message });
    }
  }

  logger.info('[Incubation] 批量生成完成');
}

function calculateScore(m) {
  let score = 0;
  const roi = parseFloat(m.roi || 0);
  const ctr = parseFloat(m.avg_ctr || 0);
  const cvr = parseFloat(m.avg_cvr || 0);
  const cost = parseFloat(m.total_cost || 0);

  if (roi >= 3) score += 40; else if (roi >= 2.5) score += 35;
  else if (roi >= 2) score += 30; else if (roi >= 1.5) score += 20;

  if (ctr >= 2.5) score += 25; else if (ctr >= 2.0) score += 20;
  else if (ctr >= 1.5) score += 15; else if (ctr >= 1.0) score += 10;

  if (cvr >= 15) score += 25; else if (cvr >= 10) score += 20;
  else if (cvr >= 8) score += 15; else if (cvr >= 5) score += 10;

  if (cost >= 5000) score += 10; else if (cost >= 3000) score += 7;
  else if (cost >= 1000) score += 4;

  return Math.min(100, score);
}

async function callAIIncubation(material, trendText, hotRefText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  if (!apiKey) return generateRulePlan(material, trendText);

  const m = material;
  const prompt = `你是雪玲妃品牌的资深千川投放优化师。现在有一个潜力素材需要你制定详细的孵化计划，让推广同事按步骤执行。

## 待孵化素材
- 标题：「${m.title}」
- 近15天消耗：¥${parseFloat(m.total_cost).toFixed(0)}
- 成交：${m.orders}单 | ROI：${m.roi}
- CTR：${m.avg_ctr}% | 转化率：${m.avg_cvr}%
- 3s留存：${m.avg_3s_rate || 0}% | 完播率：${m.avg_finish_rate || 0}%
- 时长：${m.duration ? Math.round(parseFloat(m.duration)) + 's' : '未知'}
- 投放天数：${m.active_days}天

## 每日消耗趋势
${trendText}

## 当前爆款素材参考
${hotRefText}

请输出一份推广同事可直接执行的孵化计划（markdown格式）：

## 📋 素材诊断
分析该素材当前数据表现，判断处于什么阶段（起量期/稳定期/衰退期），核心优势和不足各是什么

## 🎯 孵化目标
设定具体数字目标：7天内目标消耗、目标ROI、目标出单数

## 📅 7天孵化步骤（每天具体操作）

### Day 1-2：测试放量期
- 具体的预算设置（写明金额）
- 出价策略（写明出价范围）
- 投放时段建议
- 定向人群建议

### Day 3-4：数据优化期
- 根据前2天数据的优化动作
- 计划复制策略（写明复制几条、如何差异化出价）
- 人群包调整建议

### Day 5-6：加速放量期
- 预算提升节奏（写明具体金额）
- 新建计划策略
- 素材组合建议（是否需要翻拍/混剪衍生版本）

### Day 7：效果评估
- 评估达标标准
- 后续策略（继续放量/优化/暂停）

## ⚠️ 风险预警
- 什么情况下应该暂停孵化
- ROI跌破多少要止损
- 消耗异常的处理方式

## 💡 素材优化建议
- 基于当前素材的翻拍/混剪建议
- 标题和封面的优化方向
- 与爆款素材的差距分析

要求：每一步都要写明具体数字和操作，让推广同事不需要思考就能执行。控制在800字以内。`;

  try {
    const res = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.7,
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 90000,
    });

    return res.data.choices?.[0]?.message?.content || generateRulePlan(material, trendText);
  } catch (e) {
    logger.error('[Incubation] AI失败，使用规则生成', { error: e.message });
    return generateRulePlan(material, trendText);
  }
}

function generateRulePlan(m, trendText) {
  const cost = parseFloat(m.total_cost || 0);
  const roi = parseFloat(m.roi || 0);
  const baseBudget = Math.max(300, Math.round(cost / parseInt(m.active_days || 7) * 1.5));

  return `## 📋 素材诊断
- 素材：「${m.title}」
- 近15天消耗 ¥${cost.toFixed(0)}，ROI ${roi}，CTR ${m.avg_ctr}%
- 评估：${roi >= 2 ? 'ROI优秀，值得重点孵化' : roi >= 1.5 ? 'ROI良好，有提升空间' : 'ROI一般，需谨慎投放'}

## 🎯 孵化目标
- 7天目标消耗：¥${(baseBudget * 7).toFixed(0)}
- 目标ROI：${Math.max(roi, 2.0).toFixed(1)}
- 目标出单：${Math.round(baseBudget * 7 * roi / 50)}单

## 📅 7天孵化步骤

### Day 1-2：测试放量
- 日预算：¥${baseBudget}
- 新建3条计划，出价区间：¥${Math.round(cost / Math.max(1, m.orders) * 0.8)}-${Math.round(cost / Math.max(1, m.orders) * 1.2)}
- 投放时段：6:00-24:00
- 定向：自动+DMP相似人群

### Day 3-4：数据优化
- 保留ROI>1.5的计划，暂停低效计划
- 优胜计划复制3条，出价+/-10%
- 日预算提至：¥${Math.round(baseBudget * 1.5)}

### Day 5-6：加速放量
- 优胜计划日预算提至：¥${Math.round(baseBudget * 2)}
- 新建放量计划2条（极速推广模式）
- 考虑混剪衍生版本增加素材多样性

### Day 7：效果评估
- 7天整体ROI ≥ ${Math.max(roi, 1.8).toFixed(1)} → 继续放量
- ROI 1.0-${Math.max(roi, 1.8).toFixed(1)} → 优化后再观察
- ROI < 1.0 → 暂停孵化

## ⚠️ 风险预警
- 单日ROI < 1.0 连续2天 → 立即暂停
- 单日消耗超预算200%但无转化 → 暂停
- CTR骤降50%以上 → 检查素材是否被限流

## 💡 素材优化建议
- 基于此素材混剪2-3个衍生版本（换开头/换BGM/换字幕风格）
- 截取高光片段（前3秒）作为新素材的开头参考

---
> ⚙️ 此为规则生成方案，配置AI后将获得更精准的个性化分析`;
}

module.exports = router;
module.exports.generateBatchPlans = generateBatchPlans;
