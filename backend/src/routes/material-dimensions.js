const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');
const logger = require('../logger');

/**
 * 素材命名规则解析
 * 格式：(人群)(视角)-(类型)-日期词-产品-拍摄+剪辑
 * 例：3.1用户-混功效-60323习惯-百合-夏佳金
 */
const CROWD_MAP = {
  '3.1': '痛点前置', '3.2': '直切产品', '3.3': '场景带入',
  '3.4': '对比测评', '3.5': '知识科普', '3.99': '价格机制',
};
const PERSPECTIVE_MAP = { '商家': '商家', '专家': '专家', '用户': '用户', '达人': '达人' };
const TYPE_MAP = { '促': '促销', '功效': '功效', '明星': '明星', '图文': '图文', 'KOC': 'KOC', '混': '混合', '仿': '仿拍' };
const PRODUCT_MAP = { '百合': '百合洗面奶', '绿泥': '绿泥洗面奶', '慕斯': '慕斯洗面奶', '小黑管': '小黑管', 'VC': 'VC精华' };
const SHOOTER_MAP = { '佳': '江佳丽', '夏': '夏林铎', '林': '林XX' };
const EDITOR_MAP = { '亮': '吴文亮', '余': '余家骏', '金': '石晓金' };

function parseMaterialName(name) {
  if (!name) return {};
  const result = {};

  // 人群: 以数字.数字开头
  const crowdMatch = name.match(/^(\d+\.\d+)/);
  if (crowdMatch) {
    const code = crowdMatch[1];
    result.crowd = CROWD_MAP[code] || code;
  }

  // 视角
  for (const [key, val] of Object.entries(PERSPECTIVE_MAP)) {
    if (name.includes(key)) { result.perspective = val; break; }
  }

  // 类型（取"-"分割后第2段匹配）
  const parts = name.split('-');
  if (parts.length >= 2) {
    const typePart = parts[1] || '';
    for (const [key, val] of Object.entries(TYPE_MAP)) {
      if (typePart.includes(key)) { result.content_type = val; break; }
    }
  }

  // 产品
  for (const [key, val] of Object.entries(PRODUCT_MAP)) {
    if (name.includes(key)) { result.product = val; break; }
  }

  // 拍摄+剪辑（最后一段，如 "夏佳金" → 拍摄=夏林铎, 剪辑=石晓金）
  const lastPart = parts[parts.length - 1] || '';
  for (const [key, val] of Object.entries(SHOOTER_MAP)) {
    if (lastPart.includes(key)) { result.shooter = val; break; }
  }
  for (const [key, val] of Object.entries(EDITOR_MAP)) {
    if (lastPart.includes(key)) { result.editor = val; break; }
  }

  return result;
}

// 分析接口
router.get('/analysis', auth(), async (req, res) => {
  const { period = '7d', dimension = 'content_type' } = req.query;

  // 计算日期范围
  let startDate, endDate = dayjs().format('YYYY-MM-DD');
  if (period === 'today') startDate = endDate;
  else if (period === 'yesterday') { startDate = endDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD'); }
  else if (period === '7d') startDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  else if (period === '30d') startDate = dayjs().subtract(29, 'day').format('YYYY-MM-DD');
  else startDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  try {
    // 直接从素材统计表获取数据（title已在表中）
    const aw = req.accWhere || '';
    const ap = req.accParams || [];
    const [rows] = await db.query(
      `SELECT title,
        SUM(cost) AS cost,
        SUM(pay_order_amount) AS gmv,
        SUM(pay_order_count) AS orders,
        SUM(show_cnt) AS show_cnt,
        SUM(click_cnt) AS click_cnt,
        SUM(play_cnt) AS play_cnt
       FROM qc_material_stats
       WHERE stat_date BETWEEN ? AND ?${aw}
       GROUP BY material_id, title
       HAVING SUM(cost) > 0`,
      [startDate, endDate, ...ap]
    );

    // 解析命名并按维度分组
    const dimMap = {};
    rows.forEach(row => {
      const parsed = parseMaterialName(row.title);
      const dimVal = parsed[dimension] || '未分类';

      if (!dimMap[dimVal]) {
        dimMap[dimVal] = { dimension_key: dimVal, cost: 0, gmv: 0, orders: 0, shows: 0, clicks: 0, material_count: 0, plays: 0 };
      }
      const g = dimMap[dimVal];
      g.cost += parseFloat(row.cost || 0);
      g.gmv += parseFloat(row.gmv || 0);
      g.orders += parseInt(row.orders || 0);
      g.shows += parseInt(row.show_cnt || 0);
      g.clicks += parseInt(row.click_cnt || 0);
      g.plays += parseInt(row.play_cnt || row.show_cnt || 0);
      g.material_count += 1;
    });

    // 计算衍生指标并排序
    const list = Object.values(dimMap).map(g => ({
      ...g,
      cost: parseFloat(g.cost.toFixed(2)),
      gmv: parseFloat(g.gmv.toFixed(2)),
      roi: g.cost > 0 ? parseFloat((g.gmv / g.cost).toFixed(2)) : 0,
      ctr: g.shows > 0 ? parseFloat((g.clicks / g.shows * 100).toFixed(2)) : 0,
      cvr: g.clicks > 0 ? parseFloat((g.orders / g.clicks * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.cost - a.cost);

    // 汇总
    const summary = {
      cost: parseFloat(list.reduce((s, r) => s + r.cost, 0).toFixed(2)),
      gmv: parseFloat(list.reduce((s, r) => s + r.gmv, 0).toFixed(2)),
      orders: list.reduce((s, r) => s + r.orders, 0),
      material_count: list.reduce((s, r) => s + r.material_count, 0),
      roi: 0,
    };
    summary.roi = summary.cost > 0 ? parseFloat((summary.gmv / summary.cost).toFixed(2)) : 0;

    // 生成建议
    const insights = [];
    if (list.length > 0) {
      const top = list[0];
      insights.push(`${dimension === 'content_type' ? '类型' : dimension === 'product' ? '产品' : dimension === 'crowd' ? '人群' : dimension === 'perspective' ? '视角' : dimension === 'shooter' ? '拍摄' : '剪辑'}「${top.dimension_key}」消耗最高，占比${(top.cost / (summary.cost || 1) * 100).toFixed(0)}%`);
      const bestRoi = [...list].filter(r => r.cost > 100).sort((a, b) => b.roi - a.roi)[0];
      if (bestRoi && bestRoi.dimension_key !== top.dimension_key) {
        insights.push(`「${bestRoi.dimension_key}」ROI最高达${bestRoi.roi}，建议加大投放`);
      }
      const lowRoi = list.filter(r => r.cost > 500 && r.roi < 1.5);
      if (lowRoi.length > 0) {
        insights.push(`${lowRoi.map(r => `「${r.dimension_key}」`).join('、')}ROI低于1.5，建议优化或降低预算`);
      }
    }

    res.json({ code: 0, data: { list, summary, insights } });
  } catch (e) {
    logger.error('[MaterialDimensions] 分析失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
