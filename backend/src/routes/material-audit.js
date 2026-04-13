const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');

const TAG = '[MaterialAudit]';
const AI_KEY = process.env.OPENAI_API_KEY;
const AI_BASE = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';

// ===================== 建表（首次启动自动执行）=====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_material_audits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_id BIGINT NOT NULL,
        stat_date DATE NOT NULL,
        title VARCHAR(500),
        score INT DEFAULT 0,
        score_detail JSON,
        issues JSON,
        summary TEXT,
        suggestion TEXT,
        material_data JSON,
        similar_materials JSON,
        audit_batch VARCHAR(20),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_material_date (material_id, stat_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_audit_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_date DATE NOT NULL UNIQUE,
        total_audited INT DEFAULT 0,
        avg_score DECIMAL(5,2) DEFAULT 0,
        issue_count INT DEFAULT 0,
        report_content LONGTEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info(`${TAG} 表结构就绪`);
  } catch (e) {
    logger.error(`${TAG} 建表失败`, { error: e.message });
  }
})();

// ===================== 获取审核列表 =====================
router.get('/list', auth(), async (req, res) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');

    const aw = req.accWhere ? req.accWhere.replace(/advertiser_id/g, 's.advertiser_id') : '';
    const ap = req.accParams || [];
    const [list] = await db.query(`
      SELECT
        a.id,
        a.material_id,
        a.stat_date,
        a.title,
        a.score,
        a.score_detail,
        a.issues,
        a.summary,
        a.suggestion,
        a.similar_materials,
        a.audit_batch,
        a.created_at,
        s.cost,
        s.pay_order_count,
        s.pay_order_amount,
        s.product_ctr,
        s.convert_rate,
        s.product_show_count,
        s.product_click_count,
        s.play_duration_3s_rate,
        s.play_over_rate,
        s.video_url,
        s.cover_url,
        s.video_duration
      FROM qc_material_audits a
      LEFT JOIN qc_material_stats s
        ON a.material_id = s.material_id AND a.stat_date = s.stat_date
      WHERE a.stat_date = ?${aw}
      ORDER BY a.score ASC
    `, [date, ...ap]);

    // 解析JSON字段 + 组装material_data
    for (const row of list) {
      for (const field of ['score_detail', 'issues', 'similar_materials', 'material_data']) {
        if (typeof row[field] === 'string') {
          try { row[field] = JSON.parse(row[field]); } catch (_) { /* keep as-is */ }
        }
      }
      // 用join的指标补充material_data
      if (!row.material_data) row.material_data = {};
      if (row.cost != null) row.material_data.cost = row.cost;
      if (row.product_ctr != null) row.material_data.product_ctr = row.product_ctr;
      if (row.convert_rate != null) row.material_data.convert_rate = row.convert_rate;
      if (row.play_duration_3s_rate != null) row.material_data.play_duration_3s_rate = row.play_duration_3s_rate;
      if (row.play_over_rate != null) row.material_data.play_over_rate = row.play_over_rate;
      if (row.pay_order_amount != null && row.cost > 0) row.material_data.roi = (row.pay_order_amount / row.cost).toFixed(2);
      if (row.video_url) row.material_data.video_url = row.video_url;
    }

    res.json({ code: 0, data: list });
  } catch (e) {
    logger.error(`${TAG} list error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 获取日报 =====================
router.get('/report', auth(), async (req, res) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const [rows] = await db.query(
      'SELECT * FROM qc_audit_reports WHERE report_date = ?',
      [date]
    );
    if (!rows.length) {
      return res.json({ code: 0, data: null, msg: '暂无该日报告' });
    }
    const row = rows[0];
    if (typeof row.report_content === 'string') {
      try { row.report_content = JSON.parse(row.report_content); } catch (_) { /* keep as text */ }
    }
    res.json({ code: 0, data: row });
  } catch (e) {
    logger.error(`${TAG} report error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 手动触发审核 =====================
router.post('/run', auth(), async (req, res) => {
  try {
    const date = req.body.date || dayjs().format('YYYY-MM-DD');
    res.json({ code: 0, msg: '素材审核任务已启动，请稍候...' });
    runDailyAudit(date).catch(e => {
      logger.error(`${TAG} 异步审核失败`, { error: e.message });
    });
  } catch (e) {
    logger.error(`${TAG} run error`, { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 核心：每日素材审核 =====================
async function runDailyAudit(targetDate) {
  const dateStr = dayjs(targetDate).format('YYYY-MM-DD');
  const batchId = dayjs().format('YYYYMMDDHHmmss');
  logger.info(`${TAG} 开始审核 date=${dateStr} batch=${batchId}`);

  // 1. 获取当日有消耗的素材
  const [allMaterials] = await db.query(`
    SELECT material_id, advertiser_id, title, cost, pay_order_count, pay_order_amount,
           product_ctr, convert_rate, product_show_count, product_click_count,
           play_duration_3s_rate, play_over_rate, video_url, cover_url, video_duration
    FROM qc_material_stats
    WHERE stat_date = ? AND cost > 0
    ORDER BY cost DESC
  `, [dateStr]);

  if (!allMaterials.length) {
    logger.info(`${TAG} ${dateStr} 无有效素材，跳过`);
    return { total: 0, audited: 0 };
  }

  // 2. 随机抽样30%（min 5, max 50）
  const sampleSize = Math.min(50, Math.max(5, Math.ceil(allMaterials.length * 0.3)));
  const sampled = sampleMaterials(allMaterials, sampleSize);
  logger.info(`${TAG} 总素材${allMaterials.length}，抽样${sampled.length}条`);

  // 3. 计算行业均值
  const [avgRows] = await db.query(`
    SELECT
      AVG(product_ctr) AS avgCTR,
      AVG(play_duration_3s_rate) AS avg3s,
      AVG(convert_rate) AS avgConvert
    FROM qc_material_stats
    WHERE stat_date = ? AND cost > 0
  `, [dateStr]);
  const avgCTR = Number((avgRows[0]?.avgCTR || 0)).toFixed(2);
  const avg3s = Number((avgRows[0]?.avg3s || 0)).toFixed(2);
  const avgConvert = Number((avgRows[0]?.avgConvert || 0)).toFixed(2);

  // 4. 为每条素材查找同类历史数据
  const materialsWithHistory = [];
  for (const m of sampled) {
    const titlePrefix = (m.title || '').substring(0, 4).replace(/[%_]/g, '');
    let similar = [];
    if (titlePrefix.length >= 2) {
      const [rows] = await db.query(`
        SELECT material_id, title, cost, product_ctr, convert_rate,
               play_duration_3s_rate, play_over_rate, pay_order_amount
        FROM qc_material_stats
        WHERE stat_date BETWEEN DATE_SUB(?, INTERVAL 30 DAY) AND ?
          AND title LIKE CONCAT(?, '%')
          AND material_id != ?
          AND cost > 0
        ORDER BY cost DESC
        LIMIT 20
      `, [dateStr, dateStr, titlePrefix, m.material_id]);
      similar = rows;
    }

    // 计算同类均值
    const categoryAvg = similar.length > 0 ? {
      avgCost: avg(similar, 'cost'),
      avgCTR: avg(similar, 'product_ctr'),
      avgConvert: avg(similar, 'convert_rate'),
      avg3sRate: avg(similar, 'play_duration_3s_rate'),
      avgROI: similar.reduce((s, r) => s + (r.pay_order_amount || 0), 0) /
              Math.max(similar.reduce((s, r) => s + (r.cost || 0), 0), 1),
      count: similar.length
    } : null;

    materialsWithHistory.push({
      ...m,
      similar,
      categoryAvg
    });
  }

  // 5. 分批调用AI审核（每批10条）
  const allResults = [];
  const batches = chunk(materialsWithHistory, 10);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.info(`${TAG} 审核批次 ${i + 1}/${batches.length}，共${batch.length}条`);

    const batchForAI = batch.map(m => ({
      material_id: m.material_id,
      title: m.title,
      cost: m.cost,
      product_ctr: m.product_ctr,
      convert_rate: m.convert_rate,
      play_duration_3s_rate: m.play_duration_3s_rate,
      play_over_rate: m.play_over_rate,
      product_show_count: m.product_show_count,
      product_click_count: m.product_click_count,
      pay_order_count: m.pay_order_count,
      pay_order_amount: m.pay_order_amount,
      video_duration: m.video_duration,
      categoryAvg: m.categoryAvg
    }));

    const historicalAvg = batch
      .filter(m => m.categoryAvg)
      .map(m => ({
        material_title_prefix: (m.title || '').substring(0, 4),
        ...m.categoryAvg
      }));

    let results;
    try {
      results = await callAIAudit(batchForAI, historicalAvg, avgCTR, avg3s, avgConvert);
    } catch (e) {
      logger.error(`${TAG} AI审核失败，使用规则兜底`, { error: e.message });
      results = batch.map(m => ruleBasedAudit(m, avgCTR, avg3s, avgConvert));
    }

    // 6. 写入数据库
    for (const result of results) {
      const material = batch.find(m => m.material_id === result.material_id) || {};
      try {
        await db.query(`
          INSERT INTO qc_material_audits
            (material_id, stat_date, title, score, score_detail, issues, summary, suggestion,
             material_data, similar_materials, audit_batch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            score = VALUES(score),
            score_detail = VALUES(score_detail),
            issues = VALUES(issues),
            summary = VALUES(summary),
            suggestion = VALUES(suggestion),
            material_data = VALUES(material_data),
            similar_materials = VALUES(similar_materials),
            audit_batch = VALUES(audit_batch)
        `, [
          result.material_id,
          dateStr,
          material.title || '',
          result.score || 0,
          JSON.stringify(result.scores || {}),
          JSON.stringify(result.issues || []),
          result.summary || '',
          result.suggestion || '',
          JSON.stringify(material),
          JSON.stringify((material.similar || []).slice(0, 5)),
          batchId
        ]);
      } catch (e) {
        logger.error(`${TAG} 保存审核结果失败 material_id=${result.material_id}`, { error: e.message });
      }
    }

    allResults.push(...results);
  }

  // 7. 生成日报
  await generateDailyReport(dateStr, allResults, allMaterials.length);

  logger.info(`${TAG} 审核完成 date=${dateStr} audited=${allResults.length}`);
  return { total: allMaterials.length, audited: allResults.length };
}

// ===================== AI 调用 =====================
async function callAIAudit(materials, historicalAvg, avgCTR, avg3s, avgConvert) {
  const prompt = `你是短视频广告素材审核专家，专注于洁面护肤品类（雪玲妃品牌）。
目标人群：女性为主(68%)，18-35岁，关注控油/氨基酸/温和清洁。

请对以下素材进行审核打分（每项0-20分，满分100分）：
1. 创意新颖度(creativity) — 与同期素材对比，是否有新颖的表达方式、拍摄角度
2. 画面吸引力(quality) — 基于3秒留存率和CTR判断画面是否抓眼球
3. 人群匹配度(audience_fit) — 内容是否贴合目标受众需求和痛点
4. 差异化程度(differentiation) — 与历史同类素材的区别度，是否存在同质化
5. 消耗潜力(potential) — 参考同类型历史消耗，预判该素材的跑量能力

待审核素材：
${JSON.stringify(materials)}

同类型历史参考（近30天均值）：
${JSON.stringify(historicalAvg)}

行业均值参考：CTR均值${avgCTR}%, 3s留存均值${avg3s}%, 转化率均值${avgConvert}%

输出严格JSON数组，每条：
{"material_id":123, "score":75, "scores":{"creativity":15,"quality":16,"audience_fit":18,"differentiation":12,"potential":14}, "issues":["画面与素材XXX高度相似","CTR低于行业均值"], "summary":"该素材采用常规口播形式...", "suggestion":"建议增加产品使用前后对比..."}`;

  const response = await axios.post(`${AI_BASE}/chat/completions`, {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: '你是专业的短视频广告素材审核分析师，请严格按要求输出JSON格式。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 4000
  }, {
    headers: {
      'Authorization': `Bearer ${AI_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  });

  const content = response.data?.choices?.[0]?.message?.content || '';
  return parseAIResponse(content);
}

// ===================== 解析AI响应 =====================
function parseAIResponse(content) {
  // 尝试提取 JSON 数组
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('AI响应中未找到JSON数组');
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error('AI响应解析结果不是数组');
  }
  // 校验并修正每条数据
  return parsed.map(item => ({
    material_id: item.material_id,
    score: Math.min(100, Math.max(0, Number(item.score) || 0)),
    scores: {
      creativity: clamp(item.scores?.creativity),
      quality: clamp(item.scores?.quality),
      audience_fit: clamp(item.scores?.audience_fit),
      differentiation: clamp(item.scores?.differentiation),
      potential: clamp(item.scores?.potential)
    },
    issues: Array.isArray(item.issues) ? item.issues : [],
    summary: item.summary || '',
    suggestion: item.suggestion || ''
  }));
}

// ===================== 规则兜底评分 =====================
function ruleBasedAudit(material, avgCTR, avg3s, avgConvert) {
  const m = material;
  const ctr = Number(m.product_ctr) || 0;
  const rate3s = Number(m.play_duration_3s_rate) || 0;
  const convert = Number(m.convert_rate) || 0;
  const playOver = Number(m.play_over_rate) || 0;
  const cost = Number(m.cost) || 0;
  const catAvg = m.categoryAvg || {};

  const issues = [];

  // creativity: 基于与同类数量判断（同类越多越可能同质化）
  let creativity = 14;
  if (catAvg.count > 10) { creativity = 8; issues.push('同类素材数量较多，创意同质化风险高'); }
  else if (catAvg.count > 5) { creativity = 11; }

  // quality: 基于3s留存和CTR
  let quality = 14;
  if (rate3s > Number(avg3s) * 1.2) quality = 18;
  else if (rate3s < Number(avg3s) * 0.8) { quality = 8; issues.push('3秒留存率低于行业均值'); }
  if (ctr < Number(avgCTR) * 0.8) { quality = Math.max(quality - 4, 4); issues.push('CTR低于行业均值'); }

  // audience_fit: 基于转化率
  let audience_fit = 14;
  if (convert > Number(avgConvert) * 1.3) audience_fit = 18;
  else if (convert < Number(avgConvert) * 0.7) { audience_fit = 9; issues.push('转化率偏低，人群匹配度待提升'); }

  // differentiation: 基于同类数量和自身表现
  let differentiation = 14;
  if (catAvg.count > 8 && ctr < (catAvg.avgCTR || 0)) {
    differentiation = 8;
    issues.push('与同类素材差异度不足');
  }

  // potential: 基于消耗和ROI
  let potential = 14;
  if (cost > (catAvg.avgCost || cost) * 1.5 && convert > Number(avgConvert)) {
    potential = 18;
  } else if (cost < (catAvg.avgCost || cost) * 0.3) {
    potential = 8;
    issues.push('消耗远低于同类均值，跑量能力待观察');
  }

  const score = creativity + quality + audience_fit + differentiation + potential;

  return {
    material_id: m.material_id,
    score,
    scores: { creativity, quality, audience_fit, differentiation, potential },
    issues,
    summary: `该素材消耗${cost.toFixed(0)}元，CTR ${ctr}%，3s留存${rate3s}%，转化率${convert}%。${issues.length ? '存在' + issues.length + '个问题。' : '整体表现良好。'}`,
    suggestion: generateRuleSuggestion(issues)
  };
}

function generateRuleSuggestion(issues) {
  if (!issues.length) return '素材整体数据表现良好，可继续投放观察。';
  const suggestions = [];
  if (issues.some(i => i.includes('CTR'))) suggestions.push('优化封面和前3秒内容，增强视觉冲击力');
  if (issues.some(i => i.includes('3秒留存'))) suggestions.push('前3秒加入强钩子（如产品特写、用户痛点）');
  if (issues.some(i => i.includes('转化率'))) suggestions.push('强化卖点呈现和促销信息，提升转化引导');
  if (issues.some(i => i.includes('同质化') || i.includes('差异度'))) suggestions.push('尝试新拍摄角度或脚本结构，增加差异化');
  if (issues.some(i => i.includes('跑量'))) suggestions.push('检查定向和出价设置，适当放宽人群包');
  return suggestions.join('；') || '建议持续优化素材质量。';
}

// ===================== 生成日报 =====================
async function generateDailyReport(dateStr, auditResults, totalMaterials) {
  try {
    const totalAudited = auditResults.length;
    const avgScore = totalAudited > 0
      ? Number((auditResults.reduce((s, r) => s + (r.score || 0), 0) / totalAudited).toFixed(2))
      : 0;
    const allIssues = auditResults.flatMap(r => r.issues || []);
    const issueCount = allIssues.length;

    // 统计问题分布
    const issueMap = {};
    for (const issue of allIssues) {
      const key = issue.substring(0, 10);
      issueMap[key] = (issueMap[key] || 0) + 1;
    }

    // 分数段分布
    const scoreDistribution = {
      excellent: auditResults.filter(r => r.score >= 80).length,
      good: auditResults.filter(r => r.score >= 60 && r.score < 80).length,
      medium: auditResults.filter(r => r.score >= 40 && r.score < 60).length,
      poor: auditResults.filter(r => r.score < 40).length
    };

    let reportContent;
    try {
      reportContent = await callAIReport(dateStr, {
        totalMaterials,
        totalAudited,
        avgScore,
        issueCount,
        scoreDistribution,
        topIssues: Object.entries(issueMap).sort((a, b) => b[1] - a[1]).slice(0, 10),
        bestMaterials: auditResults.sort((a, b) => b.score - a.score).slice(0, 5),
        worstMaterials: auditResults.sort((a, b) => a.score - b.score).slice(0, 5)
      });
    } catch (e) {
      logger.error(`${TAG} AI日报生成失败，使用默认模板`, { error: e.message });
      reportContent = JSON.stringify({
        summary: `${dateStr}共审核${totalAudited}条素材，平均得分${avgScore}分，发现${issueCount}个问题。`,
        scoreDistribution,
        topIssues: Object.entries(issueMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      });
    }

    await db.query(`
      INSERT INTO qc_audit_reports (report_date, total_audited, avg_score, issue_count, report_content)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_audited = VALUES(total_audited),
        avg_score = VALUES(avg_score),
        issue_count = VALUES(issue_count),
        report_content = VALUES(report_content)
    `, [dateStr, totalAudited, avgScore, issueCount, reportContent]);

    logger.info(`${TAG} 日报已生成 date=${dateStr}`);
  } catch (e) {
    logger.error(`${TAG} 生成日报失败`, { error: e.message });
  }
}

async function callAIReport(dateStr, stats) {
  const prompt = `你是短视频广告运营分析师（雪玲妃品牌），请根据以下今日素材审核数据，生成简洁的每日审核报告。

日期：${dateStr}
审核数据：
${JSON.stringify(stats, null, 2)}

请输出JSON格式报告：
{
  "summary": "一段话总结今日素材质量情况",
  "highlights": ["亮点1", "亮点2"],
  "risks": ["风险1", "风险2"],
  "suggestions": ["建议1", "建议2"],
  "score_analysis": "得分分布分析",
  "trend_note": "趋势备注"
}`;

  const response = await axios.post(`${AI_BASE}/chat/completions`, {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: '你是专业的广告素材运营分析师，输出简洁的JSON格式报告。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 2000
  }, {
    headers: {
      'Authorization': `Bearer ${AI_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  const content = response.data?.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return content;
}

// ===================== 工具函数 =====================
function sampleMaterials(arr, size) {
  if (arr.length <= size) return [...arr];
  // Fisher-Yates shuffle then take first `size`
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function avg(arr, field) {
  if (!arr.length) return 0;
  return Number((arr.reduce((s, r) => s + (Number(r[field]) || 0), 0) / arr.length).toFixed(4));
}

function clamp(val, min = 0, max = 20) {
  return Math.min(max, Math.max(min, Number(val) || 0));
}

// ===================== 导出 =====================
module.exports = router;
module.exports.runDailyAudit = runDailyAudit;
