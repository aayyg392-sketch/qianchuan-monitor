const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/rules', auth(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alert_rules ORDER BY id DESC');
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.post('/rules', auth(['admin', 'operator']), async (req, res) => {
  const { name, entity_type, metric, operator, threshold, notify_type, notify_webhook, time_range } = req.body;
  if (!name || !metric || !operator || threshold == null) return res.json({ code: 400, msg: '必填项缺失' });
  try {
    const [result] = await db.query(
      'INSERT INTO alert_rules (name,entity_type,metric,operator,threshold,notify_type,notify_webhook,time_range,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [name, entity_type || 'account', metric, operator, threshold, notify_type || 'dingtalk', notify_webhook || '', time_range || 1440, req.user.id]
    );
    res.json({ code: 0, msg: '告警规则创建成功', data: { id: result.insertId } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.put('/rules/:id', auth(['admin', 'operator']), async (req, res) => {
  const { name, entity_type, metric, operator, threshold, notify_type, notify_webhook, enabled, time_range } = req.body;
  try {
    await db.query(
      'UPDATE alert_rules SET name=?,entity_type=?,metric=?,operator=?,threshold=?,notify_type=?,notify_webhook=?,enabled=?,time_range=? WHERE id=?',
      [name, entity_type, metric, operator, threshold, notify_type, notify_webhook, enabled ?? 1, time_range, req.params.id]
    );
    res.json({ code: 0, msg: '更新成功' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.delete('/rules/:id', auth(['admin']), async (req, res) => {
  try {
    await db.query('DELETE FROM alert_rules WHERE id=?', [req.params.id]);
    res.json({ code: 0, msg: '删除成功' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.get('/history', auth(), async (req, res) => {
  const { page = 1, pageSize = 20, ruleId } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  try {
    let where = '1=1';
    const params = [];
    if (ruleId) { where += ' AND h.rule_id=?'; params.push(ruleId); }
    const [total] = await db.query(`SELECT COUNT(*) AS cnt FROM alert_history h WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT h.*, r.name AS rule_name FROM alert_history h
       LEFT JOIN alert_rules r ON h.rule_id=r.id
       WHERE ${where} ORDER BY h.triggered_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 0, data: { list: rows, total: total[0].cnt } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});



// === 每日简报 ===
router.get('/briefings', auth(), async (req, res) => {
  try {
    const { getBriefingHistory } = require('../services/briefing');
    const { page = 1, pageSize = 10 } = req.query;
    const data = await getBriefingHistory(parseInt(page), parseInt(pageSize));
    res.json({ code: 0, data });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.post('/briefings/trigger', auth(['admin', 'operator']), async (req, res) => {
  try {
    const { generateDailyBriefing } = require('../services/briefing');
    const result = await generateDailyBriefing();
    res.json({ code: 0, msg: '简报已生成并发送', data: result });
  } catch (e) { res.json({ code: 500, msg: '生成简报失败: ' + e.message }); }
});

module.exports = router;
