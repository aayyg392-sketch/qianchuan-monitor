const db = require('../db');
const axios = require('axios');
const dayjs = require('dayjs');
const logger = require('../logger');

const DINGTALK_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=a5a3943bb6dbfee17663b47594453db8e7037aca6b65808330548e22533b6013';

/**
 * 生成每日简报并发送钉钉
 */
async function generateDailyBriefing() {
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const twoWeeksAgo = dayjs().subtract(14, 'day').format('YYYY-MM-DD');

  logger.info('[Briefing] 开始生成每日简报', { date: yesterday });

  try {
    // 1. 获取昨日各账户消耗汇总
    const [yesterdayStats] = await db.query(`
      SELECT a.advertiser_id, a.account_type,
        SUM(d.cost) AS cost, SUM(d.show_cnt) AS show_cnt, SUM(d.click_cnt) AS click_cnt,
        SUM(d.convert_cnt) AS convert_cnt,
        CASE WHEN SUM(d.show_cnt)>0 THEN SUM(d.click_cnt)/SUM(d.show_cnt)*100 ELSE 0 END AS ctr,
        CASE WHEN SUM(d.click_cnt)>0 THEN SUM(d.convert_cnt)/SUM(d.click_cnt)*100 ELSE 0 END AS cvr,
        CASE WHEN SUM(d.convert_cnt)>0 THEN SUM(d.cost)/SUM(d.convert_cnt) ELSE 0 END AS convert_cost
      FROM qc_daily_stats d
      JOIN qc_accounts a ON d.advertiser_id = a.advertiser_id
      WHERE d.stat_date = ? AND d.entity_type = 'account'
      GROUP BY a.advertiser_id, a.account_type
    `, [yesterday]);

    // 2. 获取近7天趋势数据
    const [weeklyTrend] = await db.query(`
      SELECT d.stat_date,
        SUM(d.cost) AS cost, SUM(d.show_cnt) AS show_cnt, SUM(d.click_cnt) AS click_cnt,
        SUM(d.convert_cnt) AS convert_cnt
      FROM qc_daily_stats d
      WHERE d.stat_date BETWEEN ? AND ? AND d.entity_type = 'account'
      GROUP BY d.stat_date ORDER BY d.stat_date
    `, [weekAgo, yesterday]);

    // 3. 获取上周同期数据用于环比
    const prevWeekDay = dayjs().subtract(8, 'day').format('YYYY-MM-DD');
    const [prevDayStats] = await db.query(`
      SELECT SUM(cost) AS cost, SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt,
        SUM(convert_cnt) AS convert_cnt
      FROM qc_daily_stats
      WHERE stat_date = ? AND entity_type = 'account'
    `, [prevWeekDay]);

    // 4. 获取直播账户的GMV数据（cpm列存储GMV，convert_rate列存储ROI）
    const [liveStats] = await db.query(`
      SELECT SUM(d.cost) AS cost, SUM(d.cpm) AS gmv,
        CASE WHEN SUM(d.cost)>0 THEN SUM(d.cpm)/SUM(d.cost) ELSE 0 END AS roi,
        SUM(d.convert_cnt) AS orders
      FROM qc_daily_stats d
      JOIN qc_accounts a ON d.advertiser_id = a.advertiser_id
      WHERE d.stat_date = ? AND d.entity_type = 'account' AND a.account_type = 'live'
    `, [yesterday]);

    // 5. 获取昨日转化TOP素材（按成交单数排序）
    const [topConvertMaterials] = await db.query(`
      SELECT title, cost, pay_order_count, pay_order_amount, roi,
        convert_cnt, convert_cost, ctr, convert_rate,
        play_duration_3s_rate, play_over_rate, video_duration
      FROM qc_material_stats
      WHERE stat_date = ? AND cost > 0
      ORDER BY pay_order_count DESC, roi DESC
      LIMIT 5
    `, [yesterday]);

    // 6. 获取昨日ROI最高素材（消耗>100过滤噪声）
    const [topRoiMaterials] = await db.query(`
      SELECT title, cost, pay_order_count, pay_order_amount, roi,
        ctr, convert_rate, play_duration_3s_rate, play_over_rate
      FROM qc_material_stats
      WHERE stat_date = ? AND cost >= 100 AND roi > 0
      ORDER BY roi DESC
      LIMIT 3
    `, [yesterday]);

    // 汇总数据
    const totalYesterday = {
      cost: yesterdayStats.reduce((s, r) => s + parseFloat(r.cost || 0), 0),
      show: yesterdayStats.reduce((s, r) => s + parseInt(r.show_cnt || 0), 0),
      click: yesterdayStats.reduce((s, r) => s + parseInt(r.click_cnt || 0), 0),
      convert: yesterdayStats.reduce((s, r) => s + parseInt(r.convert_cnt || 0), 0),
    };
    totalYesterday.ctr = totalYesterday.show > 0 ? (totalYesterday.click / totalYesterday.show * 100) : 0;
    totalYesterday.cvr = totalYesterday.click > 0 ? (totalYesterday.convert / totalYesterday.click * 100) : 0;
    totalYesterday.convertCost = totalYesterday.convert > 0 ? (totalYesterday.cost / totalYesterday.convert) : 0;

    const prevDay = prevDayStats[0] || {};
    const prevCost = parseFloat(prevDay.cost || 0);
    const costChange = prevCost > 0 ? ((totalYesterday.cost - prevCost) / prevCost * 100) : 0;

    // 7天消耗趋势 - 汇总走势描述
    const costs = weeklyTrend.map(r => parseFloat(r.cost));
    const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
    const maxCost = Math.max(...costs, 0);
    const minCost = Math.min(...costs, 0);
    const last3 = costs.slice(-3);
    let trendDirection = '平稳';
    if (last3.length >= 3) {
      if (last3[2] > last3[1] && last3[1] > last3[0]) trendDirection = '连续上升';
      else if (last3[2] < last3[1] && last3[1] < last3[0]) trendDirection = '连续下降';
      else if (last3[2] > last3[0]) trendDirection = '整体回升';
      else if (last3[2] < last3[0]) trendDirection = '整体回落';
    }
    const trendSummary = `近7天日均消耗¥${(avgCost).toFixed(0)}，最高¥${maxCost.toFixed(0)}，最低¥${minCost.toFixed(0)}，近3日${trendDirection}`;

    // 各账户异常检测
    const accountAlerts = [];
    for (const acc of yesterdayStats) {
      const accCost = parseFloat(acc.cost || 0);
      const accConvert = parseInt(acc.convert_cnt || 0);
      const accConvertCost = parseFloat(acc.convert_cost || 0);
      const accType = acc.account_type === 'live' ? '直播' : '商品';
      const accId = acc.advertiser_id.slice(-4);
      // 消耗异常低（低于均值50%以下）
      if (accCost > 0 && accCost < avgCost / yesterdayStats.length * 0.3) {
        accountAlerts.push({ id: accId, type: accType, level: 'warning', msg: `消耗异常偏低(¥${accCost.toFixed(0)})，可能存在预算耗尽、计划暂停或审核不通过` });
      }
      // 转化成本过高
      if (accConvertCost > 30) {
        accountAlerts.push({ id: accId, type: accType, level: 'warning', msg: `转化成本¥${accConvertCost.toFixed(2)}偏高，建议检查出价和定向` });
      }
      // 有消耗无转化
      if (accCost > 500 && accConvert === 0) {
        accountAlerts.push({ id: accId, type: accType, level: 'critical', msg: `消耗¥${accCost.toFixed(0)}但0转化，疑似转化追踪异常或素材效果极差` });
      }
    }
    // 直播ROI检测
    if (liveStats[0]) {
      const liveRoi = parseFloat(liveStats[0].roi || 0);
      if (liveRoi > 0 && liveRoi < 1.5) {
        accountAlerts.push({ id: '6366', type: '直播', level: 'critical', msg: `ROI仅${liveRoi.toFixed(2)}，低于安全线1.5，建议立即收缩投放或优化直播间` });
      } else if (liveRoi >= 1.5 && liveRoi < 2.0) {
        accountAlerts.push({ id: '6366', type: '直播', level: 'warning', msg: `ROI ${liveRoi.toFixed(2)}，略低于目标线2.0，关注直播间转化效率` });
      }
    }
    // 消耗波动检测
    if (Math.abs(parseFloat(costChange)) > 30) {
      accountAlerts.push({ id: '全局', type: '总体', level: 'warning', msg: `总消耗较上周同期变化${costChange.toFixed(1)}%，波动较大需关注` });
    }

    // 构建数据摘要给AI
    const dataSummary = {
      date: yesterday,
      total: totalYesterday,
      costChangeVsLastWeek: costChange.toFixed(1) + '%',
      accounts: yesterdayStats.map(r => ({
        id: r.advertiser_id,
        type: r.account_type,
        cost: parseFloat(r.cost).toFixed(2),
        ctr: parseFloat(r.ctr).toFixed(2) + '%',
        cvr: parseFloat(r.cvr).toFixed(2) + '%',
        convertCost: parseFloat(r.convert_cost).toFixed(2),
      })),
      live: liveStats[0] ? {
        cost: parseFloat(liveStats[0].cost || 0).toFixed(2),
        gmv: parseFloat(liveStats[0].gmv || 0).toFixed(2),
        roi: parseFloat(liveStats[0].roi || 0).toFixed(2),
        orders: parseInt(liveStats[0].orders || 0),
      } : null,
      trendSummary,
      accountAlerts,
      topConvertMaterials: topConvertMaterials.map(m => ({
        title: (m.title || '').slice(0, 30),
        cost: parseFloat(m.cost).toFixed(0),
        orders: parseInt(m.pay_order_count || 0),
        gmv: parseFloat(m.pay_order_amount || 0).toFixed(0),
        roi: parseFloat(m.roi || 0).toFixed(2),
        ctr: (parseFloat(m.ctr || 0) * 100).toFixed(2),
        cvr: (parseFloat(m.convert_rate || 0) * 100).toFixed(2),
        play3s: (parseFloat(m.play_duration_3s_rate || 0) * 100).toFixed(1),
        playOver: (parseFloat(m.play_over_rate || 0) * 100).toFixed(1),
        duration: parseFloat(m.video_duration || 0).toFixed(0),
      })),
      topRoiMaterials: topRoiMaterials.map(m => ({
        title: (m.title || '').slice(0, 30),
        cost: parseFloat(m.cost).toFixed(0),
        orders: parseInt(m.pay_order_count || 0),
        roi: parseFloat(m.roi || 0).toFixed(2),
        play3s: (parseFloat(m.play_duration_3s_rate || 0) * 100).toFixed(1),
        playOver: (parseFloat(m.play_over_rate || 0) * 100).toFixed(1),
      })),
    };

    // 调用AI生成简报
    let briefingContent = await generateAIBriefing(dataSummary);

    // 如果AI失败，使用规则生成
    if (!briefingContent) {
      briefingContent = generateRuleBriefing(dataSummary);
    }

    // 发送钉钉
    await sendBriefingToDingTalk(briefingContent, yesterday);

    // 保存到数据库
    await saveBriefing(yesterday, dataSummary, briefingContent);

    logger.info('[Briefing] 每日简报已发送', { date: yesterday });
    return { success: true, date: yesterday, content: briefingContent };
  } catch (e) {
    logger.error('[Briefing] 生成简报失败', { error: e.message, stack: e.stack });
    throw e;
  }
}

/**
 * AI生成简报
 */
async function generateAIBriefing(data) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  if (!apiKey) return null;

  const alertsText = data.accountAlerts.length > 0
    ? data.accountAlerts.map(a => `- [${a.level === 'critical' ? '严重' : '注意'}] ${a.type}(${a.id}): ${a.msg}`).join('\n')
    : '- 未发现明显异常';

  const prompt = `你是一位资深的电商广告投放分析师，专注抖音美妆赛道。请根据以下巨量千川广告投放数据，生成一份简洁专业的每日简报。

## 品牌：雪玲妃（主营洁面/护肤），数据日期：${data.date}

**总消耗**: ¥${data.total.cost.toFixed(2)}（较上周同期${data.costChangeVsLastWeek}）
**转化**: ${data.total.convert}单 | **转化成本**: ¥${data.total.convertCost.toFixed(2)}

**各账户表现**:
${data.accounts.map(a => `- ${a.type === 'live' ? '直播' : '商品'}账户(${a.id.slice(-4)}): 消耗¥${a.cost} 转化成本:¥${a.convertCost}`).join('\n')}

${data.live ? `**直播间数据**: 消耗¥${data.live.cost} GMV:¥${data.live.gmv} ROI:${data.live.roi} 成交:${data.live.orders}单` : ''}

**消耗趋势**: ${data.trendSummary}

**系统检测异常**:
${alertsText}

**昨日转化TOP素材**:
${data.topConvertMaterials.map((m, i) => `${i + 1}. 「${m.title}」${m.duration}s | 消耗¥${m.cost} 成交${m.orders}单 ROI:${m.roi} | 3s留存${m.play3s}% 完播${m.playOver}%`).join('\n')}

**昨日ROI最优素材**:
${data.topRoiMaterials.map((m, i) => `${i + 1}. 「${m.title}」消耗¥${m.cost} ${m.orders}单 ROI:${m.roi} | 3s留存${m.play3s}% 完播${m.playOver}%`).join('\n')}

请输出以下内容（使用markdown格式，简洁精练）：

## 1. 昨日数据摘要
3-4行核心指标总结，包含消耗、转化、直播ROI

## 2. 消耗走势
用1-2句话概括近7天走势方向和原因判断

## 3. 各账户诊断
每个账户只用1-2句话点出关键问题和核心建议，无异常的标注"正常"即可

## 4. 素材快报
分析昨日高转化素材的共同特征（时长、画面风格、开头钩子、卖点呈现方式），总结什么类型的素材跑得好。给内容团队2-3条具体的素材制作建议（包括脚本结构、画面要求、时长建议）

## 5. 今日TOP3操作建议
只列最重要的3条，每条一句话

要求：整体控制在400字以内，挑重点。不要输出每日具体消耗数据。`;

  try {
    const res = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 60000,
    });
    return res.data.choices?.[0]?.message?.content || null;
  } catch (e) {
    logger.error('[Briefing] AI生成失败，使用规则生成', { error: e.message });
    return null;
  }
}

/**
 * 规则生成简报（AI备用）
 */
function generateRuleBriefing(data) {
  const { total, costChangeVsLastWeek, accounts, live, trendSummary, accountAlerts } = data;
  const changeDir = parseFloat(costChangeVsLastWeek) >= 0 ? '上升' : '下降';
  const changeAbs = Math.abs(parseFloat(costChangeVsLastWeek)).toFixed(1);

  let md = `## 1. 昨日数据摘要\n\n`;
  md += `- 总消耗 **¥${total.cost.toFixed(0)}**，较上周同期${changeDir} ${changeAbs}%\n`;
  md += `- 转化 ${total.convert}单 | 转化成本 ¥${total.convertCost.toFixed(2)}\n`;
  if (live) {
    md += `- 直播间: 消耗¥${live.cost} GMV:¥${live.gmv} ROI:${live.roi} 成交${live.orders}单\n`;
  }

  md += `\n## 2. 消耗走势\n\n${trendSummary}\n`;

  md += `\n## 3. 各账户诊断\n\n`;
  for (const a of accounts) {
    const accType = a.type === 'live' ? '直播' : '商品';
    const accWarns = accountAlerts.filter(w => w.id === a.id.slice(-4));
    const status = accWarns.length > 0 ? accWarns[0].msg.split('，')[0] : '正常';
    md += `- ${accType}(${a.id.slice(-4)}): ¥${a.cost} CPA¥${a.convertCost} | ${status}\n`;
  }

  md += `\n## 4. 素材快报\n\n`;
  const { topConvertMaterials, topRoiMaterials } = data;
  if (topConvertMaterials && topConvertMaterials.length > 0) {
    md += `**转化TOP素材**:\n`;
    topConvertMaterials.slice(0, 3).forEach((m, i) => {
      md += `${i + 1}. 「${m.title}」${m.duration}s | ¥${m.cost} ${m.orders}单 ROI:${m.roi} 3s留存${m.play3s}%\n`;
    });
    const avgDur = topConvertMaterials.reduce((s, m) => s + parseInt(m.duration), 0) / topConvertMaterials.length;
    md += `\n**素材特征**: 高转化素材平均时长${avgDur.toFixed(0)}s\n`;
  }
  md += `\n**内容建议**: 前3秒强痛点开场→功效对比→限时利益点收尾，时长控制15-25s\n`;

  md += `\n## 5. 今日TOP3\n\n`;
  if (accountAlerts.some(a => a.level === 'critical')) md += `1. 处理异常账户问题\n`;
  else md += `1. 持续放量优质计划\n`;
  if (live && parseFloat(live.roi) < 2) md += `2. 直播ROI提升至2.0以上\n`;
  else md += `2. 维持直播ROI稳定\n`;
  md += `3. 新增3-5条素材测试\n`;

  return md;
}

/**
 * 发送钉钉简报
 */
async function sendBriefingToDingTalk(content, date) {
  const title = `千川日报 ${date}`;
  const text = `# ${title}\n\n${content}\n\n---\n*自动生成于 ${dayjs().format('YYYY-MM-DD HH:mm')}*`;

  try {
    await axios.post(DINGTALK_WEBHOOK, {
      msgtype: 'markdown',
      markdown: { title, text }
    }, { timeout: 10000 });
    logger.info('[Briefing] 钉钉简报发送成功');
  } catch (e) {
    logger.error('[Briefing] 钉钉简报发送失败', { error: e.message });
    throw e;
  }
}

/**
 * 保存简报到数据库
 */
async function saveBriefing(date, dataSummary, content) {
  try {
    await db.query(
      `INSERT INTO daily_briefings (brief_date, total_cost, total_show, total_click, total_convert, content, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE total_cost=VALUES(total_cost), total_show=VALUES(total_show),
         total_click=VALUES(total_click), total_convert=VALUES(total_convert),
         content=VALUES(content), sent_at=NOW()`,
      [date, dataSummary.total.cost, dataSummary.total.show, dataSummary.total.click, dataSummary.total.convert, content]
    );
  } catch (e) {
    logger.error('[Briefing] 保存简报失败', { error: e.message });
  }
}

/**
 * 获取简报历史
 */
async function getBriefingHistory(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;
  const [total] = await db.query('SELECT COUNT(*) AS cnt FROM daily_briefings');
  const [rows] = await db.query(
    'SELECT * FROM daily_briefings ORDER BY brief_date DESC LIMIT ? OFFSET ?',
    [pageSize, offset]
  );
  return { list: rows, total: total[0].cnt };
}

module.exports = { generateDailyBriefing, getBriefingHistory };
