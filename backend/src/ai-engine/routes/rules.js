/**
 * AI引擎 - 策略规则管理API
 * 出价规则、预算规则、素材规则、告警规则的CRUD
 */
const router = require('express').Router();
const db = require('../../db');
const logger = require('../../logger');
const auth = require('../../middleware/auth');
const { ADQ_RULES } = require('../config');

/**
 * GET /api/ai-engine/rules/list — 规则列表
 */
router.get('/list', auth(), async (req, res) => {
  try {
    const { platform, rule_type, is_active } = req.query;
    let sql = 'SELECT * FROM ai_rules WHERE 1=1';
    const params = [];

    if (platform) { sql += ' AND (platform = ? OR platform = "all")'; params.push(platform); }
    if (rule_type) { sql += ' AND rule_type = ?'; params.push(rule_type); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(+is_active); }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/rules/create — 创建规则
 */
router.post('/create', auth(), async (req, res) => {
  try {
    const { platform = 'all', rule_name, rule_type, rule_config } = req.body;
    if (!rule_name || !rule_type || !rule_config) {
      return res.json({ code: -1, msg: '缺少必填字段' });
    }

    const validTypes = ['bid', 'budget', 'creative', 'alert', 'ai_takeover'];
    if (!validTypes.includes(rule_type)) {
      return res.json({ code: -1, msg: `rule_type 必须是: ${validTypes.join(', ')}` });
    }

    // 验证平台
    if (platform !== 'all' && platform !== 'adq') {
      return res.json({ code: -1, msg: '不支持的平台，仅支持adq' });
    }

    await db.query(
      'INSERT INTO ai_rules (platform, rule_name, rule_type, rule_config) VALUES (?, ?, ?, ?)',
      [platform, rule_name, rule_type, JSON.stringify(rule_config)]
    );

    res.json({ code: 0, msg: '规则创建成功' });
  } catch (e) {
    logger.error('创建AI规则失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * PUT /api/ai-engine/rules/:id — 更新规则
 */
router.put('/:id', auth(), async (req, res) => {
  try {
    const { rule_name, rule_config, is_active } = req.body;
    const updates = [];
    const params = [];

    if (rule_name !== undefined) { updates.push('rule_name = ?'); params.push(rule_name); }
    if (rule_config !== undefined) { updates.push('rule_config = ?'); params.push(JSON.stringify(rule_config)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(+is_active); }

    if (!updates.length) return res.json({ code: -1, msg: '无更新内容' });

    params.push(req.params.id);
    await db.query(`UPDATE ai_rules SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ code: 0, msg: '规则更新成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * DELETE /api/ai-engine/rules/:id — 删除规则
 */
router.delete('/:id', auth(), async (req, res) => {
  try {
    await db.query('DELETE FROM ai_rules WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '规则删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/ai-engine/rules/toggle/:id — 启用/禁用规则
 */
router.post('/toggle/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT is_active FROM ai_rules WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.json({ code: -1, msg: '规则不存在' });

    const newStatus = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE ai_rules SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ code: 0, msg: newStatus ? '已启用' : '已禁用' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/ai-engine/rules/templates — 规则模板（快速创建）
 */
router.get('/templates', auth(), async (req, res) => {
  const templates = [
    {
      name: 'ROI自动调价',
      type: 'bid',
      description: '当ROI低于目标时自动提高出价，高于目标时降低出价',
      config: {
        platform: 'all',
        targetROI: 2.0,
        pidParams: { Kp: 0.3, Ki: 0.05, Kd: 0.1 },
      },
    },
    {
      name: '预算匀速消耗',
      type: 'budget',
      description: '根据时段权重分配预算，避免过早花完或花不出去',
      config: {
        platform: 'all',
        overspendThreshold: 0.3,
        underspendThreshold: 0.3,
      },
    },
    {
      name: '素材疲劳预警',
      type: 'creative',
      description: '自动检测CTR/CVR下降趋势，提醒更换素材',
      config: {
        platform: 'all',
        checkIntervalHours: 6,
        fatigueScoreThreshold: 60,
      },
    },
    {
      name: '花费异常告警',
      type: 'alert',
      description: '花费突增或转化骤降时立即告警',
      config: {
        platform: 'all',
        costSpikeRatio: 2.0,
        conversionDropRatio: 0.5,
        zScoreThreshold: 2.5,
      },
    },
    {
      name: 'ADQ保守调价',
      type: 'bid',
      description: 'ADQ每次调价不超过10%，每天最多2次',
      config: {
        platform: 'adq',
        targetROI: 1.5,
        pidParams: { Kp: 0.2, Ki: 0.03, Kd: 0.08 },
        maxChangeRatio: 0.1,
        maxChangesPerDay: 2,
      },
    },
  ];

  res.json({ code: 0, data: templates });
});

module.exports = router;
