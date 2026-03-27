const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');

// ===================== 建表（首次启动自动执行）=====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS hot_material_summaries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        hot_count INT DEFAULT 0,
        total_cost DECIMAL(12,2) DEFAULT 0,
        content LONGTEXT,
        materials_data JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[MaterialSummary] 表结构就绪');
  } catch (e) {
    logger.error('[MaterialSummary] 建表失败', { error: e.message });
  }
})();

// ===================== 获取历史总结列表 =====================
router.get('/list', auth(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, parseInt(req.query.pageSize) || 10);
    const offset = (page - 1) * pageSize;

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM hot_material_summaries'
    );
    const [list] = await db.query(
      `SELECT id, period_start, period_end, hot_count, total_cost, content, created_at
       FROM hot_material_summaries ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    res.json({ code: 0, data: { list, total, page, pageSize } });
  } catch (e) {
    logger.error('[MaterialSummary] list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 查看单条总结详情 =====================
router.get('/detail/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM hot_material_summaries WHERE id = ?', [req.params.id]
    );
    if (!rows.length) return res.json({ code: 404, msg: '总结不存在' });

    const row = rows[0];
    if (typeof row.materials_data === 'string') {
      try { row.materials_data = JSON.parse(row.materials_data); } catch(e) { row.materials_data = []; }
    }
    res.json({ code: 0, data: row });
  } catch (e) {
    logger.error('[MaterialSummary] detail error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 手动/定时生成总结 =====================
router.post('/generate', auth(), async (req, res) => {
  try {
    res.json({ code: 0, msg: '总结生成中，请稍候...' });
    // 异步执行，不阻塞请求
    generateHotSummary().catch(e => {
      logger.error('[MaterialSummary] 异步生成失败', { error: e.message });
    });
  } catch (e) {
    logger.error('[MaterialSummary] generate error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

/**
 * 核心：生成爆款素材总结
 * 可被路由调用，也可被cron调用
 */
async function generateHotSummary() {
  const periodEnd = dayjs().format('YYYY-MM-DD');
  const periodStart = dayjs().subtract(15, 'day').format('YYYY-MM-DD');

  logger.info(`[MaterialSummary] 开始生成爆款总结 ${periodStart} ~ ${periodEnd}`);

  // 1. 查询爆款素材（15天总消耗破万，单天消耗>=100才计入指标均值，避免低消耗噪声）
  const [hotMaterials] = await db.query(`
    SELECT material_id, title,
      SUM(cost) AS total_cost,
      SUM(pay_order_count) AS orders,
      SUM(pay_order_amount) AS gmv,
      CASE WHEN SUM(cost)>0 THEN ROUND(SUM(pay_order_amount)/SUM(cost), 2) ELSE 0 END AS roi,
      ROUND(AVG(CASE WHEN cost >= 100 THEN product_ctr END), 2) AS avg_ctr,
      ROUND(AVG(CASE WHEN cost >= 100 THEN convert_rate END), 2) AS avg_cvr,
      ROUND(AVG(CASE WHEN cost >= 100 THEN play_duration_3s_rate END), 2) AS avg_3s_rate,
      ROUND(AVG(CASE WHEN cost >= 100 THEN play_over_rate END), 2) AS avg_finish_rate,
      MAX(video_url) AS video_url,
      MAX(cover_url) AS cover_url,
      MAX(video_duration) AS duration
    FROM qc_material_stats
    WHERE stat_date >= ? AND cost > 0
    GROUP BY material_id, title
    HAVING SUM(cost) >= 10000
    ORDER BY SUM(cost) DESC
    LIMIT 20
  `, [periodStart]);

  // 2. 查询普通素材（消耗1000-5000）作为对照组
  const [normalMaterials] = await db.query(`
    SELECT
      COUNT(*) AS count,
      ROUND(AVG(avg_ctr), 4) AS avg_ctr,
      ROUND(AVG(avg_cvr), 4) AS avg_cvr,
      ROUND(AVG(avg_3s_rate), 4) AS avg_3s_rate,
      ROUND(AVG(avg_finish), 4) AS avg_finish_rate,
      ROUND(AVG(roi), 2) AS avg_roi
    FROM (
      SELECT material_id,
        AVG(CASE WHEN cost >= 100 THEN product_ctr END) AS avg_ctr,
        AVG(CASE WHEN cost >= 100 THEN convert_rate END) AS avg_cvr,
        AVG(CASE WHEN cost >= 100 THEN play_duration_3s_rate END) AS avg_3s_rate,
        AVG(CASE WHEN cost >= 100 THEN play_over_rate END) AS avg_finish,
        CASE WHEN SUM(cost)>0 THEN SUM(pay_order_amount)/SUM(cost) ELSE 0 END AS roi
      FROM qc_material_stats
      WHERE stat_date >= ? AND cost > 0
      GROUP BY material_id
      HAVING SUM(cost) BETWEEN 1000 AND 5000
    ) sub
  `, [periodStart]);

  if (hotMaterials.length === 0) {
    logger.info('[MaterialSummary] 近15天无消耗破万素材，跳过生成');
    // 仍然保存一条记录标记"无爆款"
    await db.query(
      `INSERT INTO hot_material_summaries (period_start, period_end, hot_count, total_cost, content, materials_data)
       VALUES (?, ?, 0, 0, ?, ?)`,
      [periodStart, periodEnd, '## 本周期无消耗破万的爆款素材\n\n近15天内所有素材消耗均未达到1万元门槛。建议关注消耗趋势，优化投放策略。', '[]']
    );
    return;
  }

  // 3. 构建数据文本
  const totalCost = hotMaterials.reduce((s, m) => s + parseFloat(m.total_cost || 0), 0);
  const normal = normalMaterials[0] || {};

  // 注意：数据库中 product_ctr/convert_rate 等已经是百分比格式（1.82表示1.82%），不需要再乘100
  const hotText = hotMaterials.map((m, i) => {
    const cost = parseFloat(m.total_cost || 0).toFixed(0);
    const ctr = parseFloat(m.avg_ctr || 0).toFixed(2);
    const cvr = parseFloat(m.avg_cvr || 0).toFixed(2);
    const rate3s = parseFloat(m.avg_3s_rate || 0).toFixed(2);
    const finish = parseFloat(m.avg_finish_rate || 0).toFixed(2);
    const dur = m.duration ? Math.round(parseFloat(m.duration)) + 's' : '未知';
    return `${i + 1}. 「${m.title}」\n   消耗:¥${cost} | 成交:${m.orders}单 | ROI:${m.roi} | CTR:${ctr}% | 转化率:${cvr}% | 3s留存:${rate3s}% | 完播:${finish}% | 时长:${dur}`;
  }).join('\n');

  const normalText = normal.count > 0
    ? `普通素材(${normal.count}个): CTR:${parseFloat(normal.avg_ctr||0).toFixed(2)}% | 转化率:${parseFloat(normal.avg_cvr||0).toFixed(2)}% | 3s留存:${parseFloat(normal.avg_3s_rate||0).toFixed(2)}% | 完播:${parseFloat(normal.avg_finish_rate||0).toFixed(2)}% | ROI:${normal.avg_roi}`
    : '无对照数据';

  // 4. 调用AI分析
  const content = await callAIAnalysis(hotText, normalText, hotMaterials.length, totalCost, periodStart, periodEnd);

  // 5. 存入数据库
  await db.query(
    `INSERT INTO hot_material_summaries (period_start, period_end, hot_count, total_cost, content, materials_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [periodStart, periodEnd, hotMaterials.length, totalCost, content, JSON.stringify(hotMaterials)]
  );

  logger.info(`[MaterialSummary] 爆款总结生成完成，${hotMaterials.length}个爆款，总消耗¥${totalCost.toFixed(0)}`);
}

/**
 * 调用AI生成分析报告
 */
async function callAIAnalysis(hotText, normalText, hotCount, totalCost, start, end) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  if (!apiKey) {
    logger.warn('[MaterialSummary] 无OPENAI_API_KEY，使用规则生成');
    return generateRuleSummary(hotText, normalText, hotCount, totalCost, start, end);
  }

  const prompt = `你是雪玲妃品牌的抖音电商数据分析师，擅长从素材投放数据中发现创作规律。
请分析以下近15天（${start} ~ ${end}）消耗破万的爆款素材数据，为内容团队提供实操性强的创作方向。

## 爆款素材数据（${hotCount}个，总消耗¥${totalCost.toFixed(0)}）
${hotText}

## 普通素材对照组（消耗1000-5000）
${normalText}

请按以下结构输出分析报告（使用markdown格式）：

## 📊 爆款规律总结
列出3-5条核心发现。从素材标题分析出素材类型（如KOC口播、混剪、明星翻拍、促销型等），哪种类型占比最高？时长特征？消耗与ROI的关系？

## 🎯 高点击素材特征（CTR分析）
CTR最高的2-3个素材有什么共同点？分析其标题推测：开头钩子类型、画面风格、是否用了对比/悬念等技巧

## 💰 高转化话术提炼（转化率分析）
转化率最高的素材，提炼出关键卖点话术和CTA用语。给出3-5条可直接复用的话术模板

## ⭐ 高光片段识别
哪些素材的3s留存率/完播率特别突出？推测其高光片段类型（如开头冲击、产品特写、使用前后对比、价格锚点等）

## 📝 内容创作建议
给内容团队5条具体可执行的创作建议，包括：推荐的素材类型、时长范围、脚本结构、拍摄要点、标题关键词

## ⚠️ 避坑提醒
哪些素材消耗高但ROI低？分析可能的原因（如目标人群不精准、转化链路问题等），给出优化方向

要求：语言简洁有力，多用数据对比，每条建议要具体到可执行层面。整体800字以内。`;

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

    const aiContent = res.data.choices?.[0]?.message?.content;
    if (aiContent) return aiContent;

    logger.warn('[MaterialSummary] AI返回空，降级规则生成');
    return generateRuleSummary(hotText, normalText, hotCount, totalCost, start, end);
  } catch (e) {
    logger.error('[MaterialSummary] AI分析失败，降级规则生成', { error: e.message });
    return generateRuleSummary(hotText, normalText, hotCount, totalCost, start, end);
  }
}

/**
 * 规则生成（AI备用方案）
 */
function generateRuleSummary(hotText, normalText, hotCount, totalCost, start, end) {
  return `## 📊 爆款素材数据总览

**分析周期**: ${start} ~ ${end}
**爆款素材数**: ${hotCount}个（消耗≥1万）
**爆款总消耗**: ¥${totalCost.toFixed(0)}

---

## 爆款素材明细

${hotText}

---

## 普通素材对照

${normalText}

---

> 💡 提示：AI分析暂不可用，以上为原始数据展示。请配置 OPENAI_API_KEY 以获取智能分析报告。`;
}

module.exports = router;
module.exports.generateHotSummary = generateHotSummary;
