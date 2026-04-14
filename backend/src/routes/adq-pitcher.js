/**
 * 腾讯广告 ADQ 自动建计划路由
 * 素材上传 + 广告组创建 + 动态创意搭建
 */
const router = require('express').Router();
const db = require('../db');
const logger = require('../logger');
const adq = require('../services/adq-sync');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// 建计划模板表
async function ensureTemplateTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS adq_plan_templates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      account_db_id BIGINT NOT NULL,
      template_name VARCHAR(200) NOT NULL,
      config JSON NOT NULL COMMENT '模板配置: 定向/出价/预算/版位等',
      is_active TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_account (account_db_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS adq_plan_tasks (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      account_db_id BIGINT NOT NULL,
      template_id BIGINT DEFAULT NULL,
      task_name VARCHAR(200) DEFAULT '',
      total_count INT DEFAULT 0 COMMENT '计划创建总数',
      success_count INT DEFAULT 0,
      fail_count INT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/running/done/failed',
      detail JSON COMMENT '任务详情和日志',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_account (account_db_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
let templatesReady = false;
router.use(async (req, res, next) => {
  if (!templatesReady) { try { await ensureTemplateTable(); templatesReady = true; } catch (e) {} }
  next();
});

// ============ 素材上传 ============

/**
 * POST /api/adq-pitcher/upload-image — 上传图片素材
 */
router.post('/upload-image', upload.single('file'), async (req, res) => {
  try {
    const { account_db_id } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.uploadImage(token, rows[0].account_id, req.file.buffer, req.file.originalname);
    res.json({ code: 0, data, msg: '上传成功' });
  } catch (e) {
    logger.error('ADQ图片上传失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-pitcher/upload-video — 上传视频素材
 */
router.post('/upload-video', upload.single('file'), async (req, res) => {
  try {
    const { account_db_id } = req.body;
    const [rows] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!rows.length) return res.json({ code: -1, msg: '账户不存在' });

    const token = await adq.getValidToken(account_db_id);
    const data = await adq.uploadVideo(token, rows[0].account_id, req.file.buffer, req.file.originalname);
    res.json({ code: 0, data, msg: '上传成功' });
  } catch (e) {
    logger.error('ADQ视频上传失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

// ============ 模板管理 ============

/**
 * GET /api/adq-pitcher/templates — 模板列表
 */
router.get('/templates', async (req, res) => {
  try {
    const { account_db_id } = req.query;
    const [rows] = await db.query(
      'SELECT * FROM adq_plan_templates WHERE account_db_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [account_db_id]
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * POST /api/adq-pitcher/templates — 创建模板
 * body.config 示例:
 * {
 *   marketing_goal: "MARKETING_GOAL_PRODUCT_SALES",
 *   site_set: ["SITE_SET_WECHAT"],
 *   bid_mode: "BID_MODE_OCPM",
 *   optimization_goal: "OPTIMIZATIONGOAL_ECOMMERCE_ORDER",
 *   bid_amount: 5000, // 分
 *   daily_budget: 30000, // 分, 最低50元=5000分
 *   targeting: { age: [...], geo_location: {...} },
 * }
 */
router.post('/templates', async (req, res) => {
  try {
    const { account_db_id, template_name, config } = req.body;
    if (!template_name || !config) return res.json({ code: -1, msg: '模板名称和配置不能为空' });
    await db.query(
      'INSERT INTO adq_plan_templates (account_db_id, template_name, config) VALUES (?, ?, ?)',
      [account_db_id, template_name, JSON.stringify(config)]
    );
    res.json({ code: 0, msg: '模板创建成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * DELETE /api/adq-pitcher/templates/:id — 删除模板
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    await db.query('UPDATE adq_plan_templates SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ============ 批量建计划 ============

/**
 * POST /api/adq-pitcher/batch-create — 批量创建广告计划
 * body: {
 *   account_db_id, template_id,
 *   materials: [{ type: 'image'|'video', id: 'xxx' }],
 *   ad_names: ['计划A', '计划B'], // 可选，不传则自动生成
 *   count: 10 // 需要创建的计划数量
 * }
 */
router.post('/batch-create', async (req, res) => {
  try {
    const { account_db_id, template_id, materials, ad_names, count } = req.body;

    const [accounts] = await db.query('SELECT * FROM adq_accounts WHERE id = ? AND status = 1', [account_db_id]);
    if (!accounts.length) return res.json({ code: -1, msg: '账户不存在' });

    const [templates] = await db.query('SELECT * FROM adq_plan_templates WHERE id = ? AND is_active = 1', [template_id]);
    if (!templates.length) return res.json({ code: -1, msg: '模板不存在' });

    const config = typeof templates[0].config === 'string' ? JSON.parse(templates[0].config) : templates[0].config;
    const totalCount = count || materials?.length || 1;

    // 创建任务记录
    const [taskResult] = await db.query(
      'INSERT INTO adq_plan_tasks (account_db_id, template_id, task_name, total_count, status) VALUES (?, ?, ?, ?, ?)',
      [account_db_id, template_id, `批量建计划-${new Date().toLocaleString('zh-CN')}`, totalCount, 'running']
    );
    const taskId = taskResult.insertId;

    // 异步执行批量创建
    (async () => {
      const token = await adq.getValidToken(account_db_id);
      const adAccountId = accounts[0].account_id;
      let successCount = 0;
      let failCount = 0;
      const logs = [];

      for (let i = 0; i < totalCount; i++) {
        try {
          const adName = ad_names?.[i] || `${config.marketing_goal || 'ADQ'}_${Date.now()}_${i + 1}`;

          // 创建广告组
          const adgroupData = {
            account_id: adAccountId,
            adgroup_name: adName,
            marketing_goal: config.marketing_goal,
            site_set: config.site_set,
            bid_mode: config.bid_mode,
            optimization_goal: config.optimization_goal,
            bid_amount: config.bid_amount,
            daily_budget: config.daily_budget,
            begin_date: new Date().toISOString().slice(0, 10),
            configured_status: 'AD_STATUS_NORMAL',
            ...(config.targeting ? { targeting: config.targeting } : {}),
          };

          const adResult = await adq.createAdgroup(token, adAccountId, adgroupData);

          // 如果有素材，创建动态创意
          if (materials?.length && adResult.adgroup_id) {
            const material = materials[i % materials.length];
            const creativeData = {
              account_id: adAccountId,
              adgroup_id: adResult.adgroup_id,
              dynamic_creative_elements: [{
                ...(material.type === 'image' ? { image_id: material.id } : { video_id: material.id }),
              }],
            };
            await adq.createDynamicCreative(token, adAccountId, creativeData);
          }

          successCount++;
          logs.push({ index: i + 1, status: 'success', adgroup_id: adResult.adgroup_id });
        } catch (err) {
          failCount++;
          logs.push({ index: i + 1, status: 'fail', error: err.message });
          logger.error(`批量建计划失败 #${i + 1}`, { error: err.message });
        }
      }

      await db.query(
        'UPDATE adq_plan_tasks SET success_count = ?, fail_count = ?, status = ?, detail = ? WHERE id = ?',
        [successCount, failCount, 'done', JSON.stringify(logs), taskId]
      );
    })();

    res.json({ code: 0, data: { task_id: taskId }, msg: `已开始创建${totalCount}条计划` });
  } catch (e) {
    logger.error('批量建计划启动失败', { error: e.message });
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * GET /api/adq-pitcher/tasks — 查询建计划任务状态
 */
router.get('/tasks', async (req, res) => {
  try {
    const { account_db_id } = req.query;
    const [rows] = await db.query(
      'SELECT * FROM adq_plan_tasks WHERE account_db_id = ? ORDER BY created_at DESC LIMIT 50',
      [account_db_id]
    );
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
