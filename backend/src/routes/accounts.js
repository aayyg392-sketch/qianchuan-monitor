const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');
const logger = require('../logger');
const axios = require('axios');

// 账户列表（带今日数据）
router.get('/', auth(), async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  try {
    let accFilter = '';
    const accP = [today];
    if (req.accountFilter) {
      accFilter = ' AND a.advertiser_id IN (' + req.accountFilter.map(() => '?').join(',') + ')';
      accP.push(...req.accountFilter);
    }
    const [rows] = await db.query(
      `SELECT a.advertiser_id, a.advertiser_name, a.status, a.account_type, a.last_sync_at,
        COALESCE(s.cost,0) AS today_cost,
        COALESCE(s.cpm,0) AS today_gmv,
        COALESCE(s.convert_cnt,0) AS today_orders,
        COALESCE(s.convert_rate,0) AS today_roi,
        COALESCE(s.show_cnt,0) AS today_show,
        COALESCE(s.click_cnt,0) AS today_click,
        COALESCE(s.ctr,0) AS today_ctr
       FROM qc_accounts a
       LEFT JOIN qc_daily_stats s ON a.advertiser_id=s.entity_id
         AND s.stat_date=? AND s.entity_type='account'
       WHERE 1=1${accFilter}
       ORDER BY COALESCE(s.cost,0) DESC`,
      accP
    );
    res.json({ code: 0, data: { list: rows } });
  } catch (e) {
    logger.error('[Accounts] 列表查询失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 账户7天趋势
router.get('/:advertiser_id/trend', auth(), async (req, res) => {
  const { advertiser_id } = req.params;
  if (req.accountFilter && !req.accountFilter.includes(advertiser_id)) {
    return res.json({ code: 403, msg: '无权访问该账户' });
  }
  const endDate = dayjs().format('YYYY-MM-DD');
  const startDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  try {
    const [rows] = await db.query(
      `SELECT stat_date,
        COALESCE(cost,0) AS cost,
        COALESCE(cpm,0) AS gmv,
        COALESCE(convert_cnt,0) AS orders,
        COALESCE(convert_rate,0) AS roi,
        COALESCE(show_cnt,0) AS show_cnt,
        COALESCE(click_cnt,0) AS click_cnt
       FROM qc_daily_stats
       WHERE entity_id=? AND entity_type='account' AND stat_date BETWEEN ? AND ?
       ORDER BY stat_date ASC`,
      [advertiser_id, startDate, endDate]
    );

    // 填充缺失日期
    const dateMap = {};
    rows.forEach(r => { dateMap[dayjs(r.stat_date).format('MM-DD')] = r; });

    // 从material_stats获取真实的曝光/点击数据
    const [matRows] = await db.query(
      `SELECT DATE_FORMAT(stat_date, '%m-%d') AS d, SUM(show_cnt) AS show_cnt, SUM(click_cnt) AS click_cnt
       FROM qc_material_stats WHERE advertiser_id=? AND stat_date BETWEEN ? AND ?
       GROUP BY stat_date`,
      [advertiser_id, startDate, endDate]
    );
    const matMap = {};
    matRows.forEach(r => { matMap[r.d] = r; });

    const dates = [], cost = [], gmv = [], orders = [], roi = [], show = [], click = [];
    for (let i = 0; i < 7; i++) {
      const d = dayjs().subtract(6 - i, 'day');
      const key = d.format('MM-DD');
      const r = dateMap[key] || {};
      const m = matMap[key] || {};
      dates.push(key);
      cost.push(parseFloat(r.cost || 0));
      gmv.push(parseFloat(r.gmv || 0));
      orders.push(parseInt(r.orders || 0));
      roi.push(parseFloat(r.roi || 0));
      show.push(parseInt(m.show_cnt || r.show_cnt || 0));
      click.push(parseInt(m.click_cnt || r.click_cnt || 0));
    }

    res.json({ code: 0, data: { dates, cost, gmv, orders, roi, show, click } });
  } catch (e) {
    logger.error('[Accounts] 趋势查询失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 账户今日vs昨日详情
router.get('/:advertiser_id/detail', auth(), async (req, res) => {
  const { advertiser_id } = req.params;
  if (req.accountFilter && !req.accountFilter.includes(advertiser_id)) {
    return res.json({ code: 403, msg: '无权访问该账户' });
  }
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  try {
    // 今日数据 (campaign级汇总)
    const [[todayData]] = await db.query(
      `SELECT COALESCE(SUM(cost),0) AS cost, COALESCE(SUM(cpm),0) AS gmv,
        COALESCE(SUM(convert_cnt),0) AS orders
       FROM qc_daily_stats WHERE advertiser_id=? AND stat_date=? AND entity_type='campaign'`,
      [advertiser_id, today]
    );
    // 今日素材级
    const [[todayMat]] = await db.query(
      `SELECT COALESCE(SUM(show_cnt),0) AS show_cnt, COALESCE(SUM(click_cnt),0) AS click_cnt
       FROM qc_material_stats WHERE advertiser_id=? AND stat_date=?`,
      [advertiser_id, today]
    );
    // 昨日数据
    const [[ydData]] = await db.query(
      `SELECT COALESCE(SUM(cost),0) AS cost, COALESCE(SUM(cpm),0) AS gmv,
        COALESCE(SUM(convert_cnt),0) AS orders
       FROM qc_daily_stats WHERE advertiser_id=? AND stat_date=? AND entity_type='campaign'`,
      [advertiser_id, yesterday]
    );
    const [[ydMat]] = await db.query(
      `SELECT COALESCE(SUM(show_cnt),0) AS show_cnt, COALESCE(SUM(click_cnt),0) AS click_cnt
       FROM qc_material_stats WHERE advertiser_id=? AND stat_date=?`,
      [advertiser_id, yesterday]
    );
    
    const fmt = (d, m) => {
      const cost = parseFloat(d?.cost||0), gmv = parseFloat(d?.gmv||0);
      const orders = parseInt(d?.orders||0);
      const show = parseInt(m?.show_cnt||0), click = parseInt(m?.click_cnt||0);
      return {
        cost, gmv, orders, show_cnt: show, click_cnt: click,
        roi: cost > 0 ? parseFloat((gmv/cost).toFixed(2)) : 0,
        ctr: show > 0 ? parseFloat(((click/show)*100).toFixed(2)) : 0,
        cvr: click > 0 ? parseFloat(((orders/click)*100).toFixed(2)) : 0,
        avg_cost: orders > 0 ? parseFloat((cost/orders).toFixed(2)) : 0
      };
    };
    
    res.json({ code: 0, data: { today: fmt(todayData, todayMat), yesterday: fmt(ydData, ydMat) } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// AI优化建议
router.post('/analyze', auth(), async (req, res) => {
  const { advertiser_name, today_cost, today_gmv, today_roi, today_orders, today_show, today_click, today_ctr, trend } = req.body;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const systemPrompt = `你是一位资深的巨量千川广告投放优化专家。请根据账户数据给出专业、具体、可执行的优化建议。
要求：
1. 先用1-2句话总结当前账户投放状态（健康/需关注/需优化）
2. 分析核心指标趋势（消耗、ROI、转化、流量）
3. 给出3-5条具体优化建议，每条包含：问题诊断→优化方向→具体操作
4. 优化方向可包括：出价策略、定向人群、素材优化、投放时段、预算分配
5. 语言简洁专业，使用markdown格式，适当用emoji标注重点`;

    const userPrompt = `账户：${advertiser_name}

今日核心数据：
- 消耗：¥${parseFloat(today_cost || 0).toFixed(2)}
- GMV：¥${parseFloat(today_gmv || 0).toFixed(2)}
- ROI：${parseFloat(today_roi || 0).toFixed(2)}
- 订单：${today_orders || 0}
- 展示：${today_show || 0}
- 点击：${today_click || 0}
- CTR：${parseFloat(today_ctr || 0).toFixed(2)}%
- 转化率：${today_click > 0 ? (today_orders / today_click * 100).toFixed(2) : '0'}%
- 客单价：${today_orders > 0 ? (today_gmv / today_orders).toFixed(2) : '0'}

${trend ? `近7天趋势：
- 消耗趋势：${trend.cost?.join(' → ')}
- ROI趋势：${trend.roi?.join(' → ')}
- 订单趋势：${trend.orders?.join(' → ')}` : ''}

请给出专业优化建议。`;

    const resp = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.7,
      max_tokens: 2000
    }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 });

    const content = resp.data.choices[0].message.content;
    res.json({ code: 0, data: { analysis: content } });
  } catch (e) {
    logger.error('[Accounts] AI分析失败', { error: e.message });
    res.json({ code: 500, msg: 'AI分析失败: ' + e.message });
  }
});

// 挂载OAuth授权路由
require("./oauth")(router);

module.exports = router;
