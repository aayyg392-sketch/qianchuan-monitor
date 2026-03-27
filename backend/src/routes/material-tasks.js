const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const axios = require('axios');
const dayjs = require('dayjs');

// ===================== GET / — 任务列表 =====================
router.get('/', auth(), async (req, res) => {
  try {
    const { status, page = 1, page_size = 50 } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM qc_material_tasks WHERE ${where}`, params);
    const offset = (Number(page) - 1) * Number(page_size);
    const [items] = await db.query(
      `SELECT * FROM qc_material_tasks WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(page_size), offset]
    );

    // 解析JSON字段
    for (const item of items) {
      try { if (typeof item.scenes === 'string') item.scenes = JSON.parse(item.scenes); } catch {}
      try { if (typeof item.source_data === 'string') item.source_data = JSON.parse(item.source_data); } catch {}
    }

    res.json({ code: 0, data: { items, total } });
  } catch (e) {
    logger.error('[MaterialTasks] 列表错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== PUT /:id/status — 更新状态 =====================
router.put('/:id/status', auth(), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'producing', 'reviewing', 'approved', 'rejected'];
    if (!allowed.includes(status)) return res.json({ code: 400, msg: '无效状态' });
    await db.query(`UPDATE qc_material_tasks SET status = ? WHERE id = ?`, [status, req.params.id]);
    res.json({ code: 0, msg: '状态已更新' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== POST /generate — AI生成素材脚本 =====================
router.post('/generate', auth(), async (req, res) => {
  try {
    // ===== 1. 收集5大条件数据 =====
    const conditions = {};
    const endDate = dayjs().format('YYYY-MM-DD');
    const startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD');

    // 条件1: 高消耗素材
    try {
      const [rows] = await db.query(`
        SELECT title, SUM(cost) AS total_cost, SUM(pay_order_count) AS orders,
          SUM(pay_order_amount) AS gmv, AVG(click_rate) AS avg_ctr
        FROM qc_material_stats
        WHERE stat_date BETWEEN ? AND ? AND cost > 0
        GROUP BY title ORDER BY total_cost DESC LIMIT 10
      `, [startDate, endDate]);
      conditions.high_cost_materials = rows.map(r => ({
        title: r.title,
        cost: Number(r.total_cost).toFixed(0),
        orders: Number(r.orders),
        gmv: Number(r.gmv).toFixed(0),
        ctr: (Number(r.avg_ctr) * 100).toFixed(2) + '%',
      }));
    } catch (e) { conditions.high_cost_materials = []; }

    // 条件2: 高CTR素材片段
    try {
      const [rows] = await db.query(`
        SELECT title, AVG(click_rate) AS avg_ctr, SUM(cost) AS total_cost,
          SUM(show_count) AS shows, SUM(click_count) AS clicks
        FROM qc_material_stats
        WHERE stat_date BETWEEN ? AND ? AND show_count > 1000
        GROUP BY title ORDER BY avg_ctr DESC LIMIT 10
      `, [startDate, endDate]);
      conditions.high_ctr_clips = rows.map(r => ({
        title: r.title,
        ctr: (Number(r.avg_ctr) * 100).toFixed(2) + '%',
        shows: Number(r.shows),
        clicks: Number(r.clicks),
      }));
    } catch (e) { conditions.high_ctr_clips = []; }

    // 条件3: 产品人群画像
    try {
      const [cached] = await db.query(`
        SELECT dimension, dimension_key, SUM(pay_order_count) AS cnt
        FROM qc_audience_stats WHERE stat_date BETWEEN ? AND ?
        GROUP BY dimension, dimension_key
      `, [startDate, endDate]);

      const grouped = {};
      for (const r of cached) {
        if (!grouped[r.dimension]) grouped[r.dimension] = [];
        grouped[r.dimension].push({ key: r.dimension_key, count: Number(r.cnt) });
      }
      // 计算占比
      const calcPct = (items) => {
        const total = items.reduce((s, v) => s + v.count, 0) || 1;
        return items.map(d => `${d.key}(${(d.count / total * 100).toFixed(1)}%)`).sort((a, b) => b.count - a.count);
      };

      conditions.audience_profile = {
        gender: calcPct(grouped.gender || []).join('、'),
        age: calcPct(grouped.age || []).slice(0, 5).join('、'),
        region: calcPct(grouped.region || []).slice(0, 5).join('、'),
        order_value: calcPct(grouped.order_value || []).join('、'),
        repurchase: calcPct(grouped.repurchase || []).join('、'),
      };
    } catch (e) { conditions.audience_profile = {}; }

    // 条件4: 洁面行业爆款脚本模板（内置知识库）
    conditions.industry_templates = [
      { type: '痛点开场型', structure: 'Hook痛点→产品展示→成分解析→使用效果→促销引导', example: '你脸上的黑头到底怎么来的？90%的人洗脸方式都错了...' },
      { type: '对比测评型', structure: 'Hook对比→竞品PK→产品优势→实测效果→限时优惠', example: '50块和200块的洗面奶到底差在哪？今天用pH试纸测给你看...' },
      { type: 'KOC种草型', structure: 'Hook使用场景→个人体验→前后对比→成分背书→购买理由', example: '用了一个月我的闭口全没了！这个洗面奶真的太绝了...' },
      { type: '促销逼单型', structure: 'Hook价格锚点→产品价值→限时机制→使用方法→立即下单', example: '原价99今天只要29.9！还送同款面膜！手慢无...' },
      { type: '成分科普型', structure: 'Hook成分知识→皮肤原理→产品匹配→使用教程→转化引导', example: '氨基酸洗面奶真的比皂基温和吗？皮肤科医生告诉你真相...' },
      { type: '场景化故事型', structure: 'Hook场景痛点→产品解决→使用过程→效果展示→情感共鸣', example: '约会前一天爆痘怎么办？闺蜜推荐的这个急救方法太管用了...' },
    ];

    // 条件5: 爆款素材架构（内置知识库）
    conditions.viral_structures = [
      { name: '3秒钩子法', desc: '前3秒必须有强烈的视觉/语言钩子，留存率提升40%', tips: '数字开头、疑问句、反常识、展示结果' },
      { name: '痛点-方案-证据', desc: '经典三段式，先戳痛点，再给方案，最后用数据/效果证明', tips: '痛点要具体到场景，证据要可视化' },
      { name: '前后对比法', desc: '使用前后强烈对比，转化率最高的素材结构之一', tips: '对比要在同一画面，时间要真实' },
      { name: 'FABE法则', desc: 'Feature特征→Advantage优势→Benefit利益→Evidence证据', tips: '每个步骤5-8秒，总时长30-45秒最优' },
      { name: '价格锚定法', desc: '先说高价参照物，再亮出低价，制造超值感', tips: '锚定价要真实可查，折扣要有时限感' },
    ];

    // ===== 2. 随机选3项条件 =====
    const conditionKeys = ['high_cost_materials', 'high_ctr_clips', 'audience_profile', 'industry_templates', 'viral_structures'];
    const conditionLabels = {
      high_cost_materials: '高消耗素材数据',
      high_ctr_clips: '高CTR片段数据',
      audience_profile: '产品人群画像',
      industry_templates: '洁面行业爆款脚本模板',
      viral_structures: '爆款素材架构',
    };

    // 随机打乱并取前3个
    const shuffled = conditionKeys.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    logger.info(`[MaterialTasks] 本次生成选用条件: ${selected.join(', ')}`);

    // ===== 3. 构建AI Prompt =====
    let conditionText = '';
    for (const key of selected) {
      conditionText += `\n### ${conditionLabels[key]}\n`;
      const data = conditions[key];
      if (Array.isArray(data)) {
        conditionText += JSON.stringify(data, null, 2) + '\n';
      } else if (typeof data === 'object') {
        conditionText += Object.entries(data).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
      }
    }

    const prompt = `你是雪玲妃品牌的抖音短视频脚本创作专家，擅长根据数据驱动创作高转化率的洁面/护肤类带货脚本。

## 本次创作参考条件（随机抽取3项）
${conditionText}

## 创作要求
请根据以上${selected.length}项参考条件，生成**10条**短视频带货脚本。

每条脚本需包含：
1. **标题**：15字以内，概括脚本核心卖点
2. **类型**：KOC口播/混剪/测评对比/促销逼单/成分科普/场景故事 中选一
3. **Hook（黄金3秒）**：开头钩子文案，必须在3秒内抓住注意力
4. **分镜脚本**：3-5个分镜，每个包含时间段、画面内容、口播/旁白
5. **CTA（转化引导）**：结尾促单话术

## 输出格式
请严格按以下JSON数组格式输出，不要输出其他内容：
\`\`\`json
[
  {
    "title": "脚本标题",
    "type": "KOC口播",
    "hot_topic": "关联的热点/卖点",
    "hook": "黄金3秒钩子文案",
    "scenes": [
      {"time": "0-3s", "content": "画面内容描述", "narration": "口播/旁白文案"},
      {"time": "3-10s", "content": "画面内容描述", "narration": "口播/旁白文案"},
      {"time": "10-20s", "content": "画面内容描述", "narration": "口播/旁白文案"},
      {"time": "20-30s", "content": "画面内容描述", "narration": "口播/旁白文案"}
    ],
    "cta": "转化引导话术"
  }
]
\`\`\`

注意：
- 脚本要贴合雪玲妃品牌调性（高性价比、氨基酸洁面、温和不刺激）
- 结合参考条件中的实际数据，脚本要有针对性
- 10条脚本的类型要多样化，不要重复
- Hook要吸引人、有冲击力
- 时长控制在20-45秒`;

    // ===== 4. 调用AI =====
    const scripts = await callAIGenerate(prompt, selected);

    if (!scripts || scripts.length === 0) {
      return res.json({ code: 500, msg: 'AI生成失败，请重试' });
    }

    // ===== 5. 写入数据库 =====
    let inserted = 0;
    for (const script of scripts) {
      try {
        await db.query(`
          INSERT INTO qc_material_tasks (title, hot_topic, hook, scenes, cta, status, source_data)
          VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `, [
          script.title || '未命名脚本',
          script.hot_topic || '',
          script.hook || '',
          JSON.stringify(script.scenes || []),
          script.cta || '',
          JSON.stringify({ type: script.type || '', conditions: selected.map(k => conditionLabels[k]) }),
        ]);
        inserted++;
      } catch (e) {
        logger.warn('[MaterialTasks] 插入脚本失败', { error: e.message, title: script.title });
      }
    }

    res.json({ code: 0, msg: `已生成 ${inserted} 条素材脚本（参考: ${selected.map(k => conditionLabels[k]).join('、')}）` });
  } catch (e) {
    logger.error('[MaterialTasks] /generate 错误', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: '生成失败: ' + e.message });
  }
});

// ===================== AI调用 =====================
async function callAIGenerate(prompt, selectedConditions) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  if (!apiKey) {
    logger.warn('[MaterialTasks] 无OPENAI_API_KEY，使用规则生成');
    return generateFallbackScripts(selectedConditions);
  }

  try {
    const res = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.85,
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 120000,
    });

    const content = res.data.choices?.[0]?.message?.content || '';
    logger.info('[MaterialTasks] AI返回长度: ' + content.length);

    // 解析JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const scripts = JSON.parse(jsonMatch[0]);
      if (Array.isArray(scripts) && scripts.length > 0) {
        return scripts.slice(0, 10);
      }
    }

    // 尝试直接解析
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed.slice(0, 10);
    } catch {}

    logger.warn('[MaterialTasks] AI返回格式异常，降级规则生成');
    return generateFallbackScripts(selectedConditions);
  } catch (e) {
    logger.error('[MaterialTasks] AI调用失败', { error: e.message });
    return generateFallbackScripts(selectedConditions);
  }
}

// ===================== 规则降级生成 =====================
function generateFallbackScripts(selectedConditions) {
  const templates = [
    { title: '氨基酸洁面的秘密', type: '成分科普', hot_topic: '氨基酸温和清洁', hook: '你知道你每天用的洗面奶可能在伤害皮肤吗？', cta: '点击下方链接，限时特价体验氨基酸洁面！' },
    { title: '闭口痘痘救星来了', type: 'KOC口播', hot_topic: '闭口急救', hook: '用了一周，闭口全没了！这个洗面奶也太猛了吧', cta: '姐妹们冲！链接在下方，今天买一送一！' },
    { title: '50元VS200元洁面对比', type: '测评对比', hot_topic: '性价比测评', hook: '50块和200块的洗面奶到底差在哪？', cta: '好用不贵才是王道，点击链接立即下单！' },
    { title: '直播间最后100单', type: '促销逼单', hot_topic: '限时促销', hook: '原价89今天只要29.9！库存只剩100单！', cta: '3、2、1上链接！手慢无！' },
    { title: '约会前急救洗脸法', type: '场景故事', hot_topic: '约会急救', hook: '约会前2小时脸油到能煎蛋？别慌！', cta: '急救神器就在下方链接，赶紧囤起来！' },
    { title: '医生推荐的洗脸方式', type: '成分科普', hot_topic: '科学洁面', hook: '90%的人洗脸方式都是错的！皮肤科医生说...', cta: '科学洁面从选对洗面奶开始，链接在下方！' },
    { title: '干皮油皮都能用', type: 'KOC口播', hot_topic: '全肤质适用', hook: '终于找到一款干皮油皮都说好的洗面奶！', cta: '不踩雷的选择，点击链接感受一下！' },
    { title: '网红洁面大翻车', type: '测评对比', hot_topic: '避雷测评', hook: '这5款网红洗面奶，3款都是智商税！', cta: '真正好用的只有它！链接在下方！' },
    { title: '百合精华洁面新品', type: '混剪', hot_topic: '新品首发', hook: '雪玲妃百合系列新品来了！成分表太能打', cta: '新品尝鲜价限时3天，点击链接抢先体验！' },
    { title: '敏感肌的福音', type: 'KOC口播', hot_topic: '敏感肌护理', hook: '换季烂脸？敏感肌的姐妹看过来！', cta: '温和到哭的洁面，链接给你们放好了！' },
  ];

  return templates.map(t => ({
    ...t,
    scenes: [
      { time: '0-3s', content: '达人对镜头说出Hook', narration: t.hook },
      { time: '3-10s', content: '展示产品外观和质地', narration: '看这个质地，绵密的泡沫，上脸超级温和' },
      { time: '10-20s', content: '使用过程特写', narration: '轻轻打圈按摩，黑头白头都能带走，洗完不紧绷' },
      { time: '20-30s', content: '展示使用后效果+促销信息', narration: t.cta },
    ],
  }));
}

// ===================== 视频匹配生成（MinIO S3 SDK，预签名URL） =====================
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MINIO_CONFIG = {
  endpoint: 'http://117.178.232.222:9000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'myminioadmin', secretAccessKey: 'zs215217' },
  forcePathStyle: true,
};
const BUCKET = 'sucaiwang';
const PREFIX = 'sucaiwang/92/8777/';
const HEX = '0123456789abcdef'.split('');

const s3 = new S3Client(MINIO_CONFIG);

// 视频列表缓存（10分钟）
let videoListCache = null;
let videoListCacheTime = 0;

async function getVideoList() {
  const now = Date.now();
  if (videoListCache && videoListCache.length > 0 && now - videoListCacheTime < 600000) return videoListCache;

  try {
    // 随机采样4个hex前缀，每个取200个文件 → ~400-600个有效文件，耗时约5秒
    const picked = HEX.sort(() => Math.random() - 0.5).slice(0, 4);
    const files = [];
    for (const p of picked) {
      const resp = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET, Prefix: PREFIX + p, MaxKeys: 200,
      }));
      const items = (resp.Contents || [])
        .filter(obj => obj.Key.endsWith('.mp4') && !obj.Key.includes('_h265') && obj.Size > 100000)
        .map(obj => ({ name: obj.Key.split('/').pop(), key: obj.Key, size: obj.Size }));
      files.push(...items);
    }

    videoListCache = files;
    videoListCacheTime = now;
    logger.info(`[VideoGen] MinIO采样 ${files.length} 个视频 (前缀:${picked.join(',')})`);
    return files;
  } catch (e) {
    logger.error('[VideoGen] S3获取视频列表失败', { error: e.message });
    return videoListCache || [];
  }
}

// 生成预签名URL（7天有效）
async function getPresignedUrl(key) {
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(s3, cmd, { expiresIn: 7 * 24 * 3600 });
  } catch (e) {
    logger.warn('[VideoGen] 预签名URL失败', { key, error: e.message });
    return null;
  }
}

// AI分析脚本内容，为每个分镜匹配最合适的视频片段
async function aiMatchClips(scenes, videoList) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  // 按文件大小分类（大文件=长视频=完整素材，小文件=短片段=特写镜头）
  const largeVideos = videoList.filter(v => v.size > 5 * 1024 * 1024); // >5MB 长视频
  const mediumVideos = videoList.filter(v => v.size > 1 * 1024 * 1024 && v.size <= 5 * 1024 * 1024); // 1-5MB
  const smallVideos = videoList.filter(v => v.size <= 1 * 1024 * 1024); // <1MB 短片段

  const scenesDesc = scenes.map((s, i) => `分镜${i+1}[${s.time}]: 画面:${s.content} 口播:${s.narration}`).join('\n');

  const prompt = `你是视频混剪专家。以下是一个百合洗面奶带货视频的分镜脚本，请为每个分镜推荐最合适的素材片段类型。

## 分镜脚本
${scenesDesc}

## 可用素材分类
- large: 完整产品展示、使用全过程、达人口播（适合开头Hook、完整使用过程、总结收尾）
- medium: 产品特写、泡沫质地、使用中镜头（适合产品展示、成分讲解、效果展示）
- small: 产品Logo、促销文字、转场片段（适合品牌展示、价格信息、CTA结尾）

请为每个分镜选择最合适的素材类型，输出JSON数组，每项包含sceneIndex和clipType(large/medium/small)：
\`\`\`json
[{"sceneIndex":0,"clipType":"large","reason":"开头需要达人口播抓住注意力"}]
\`\`\``;

  if (!apiKey) {
    // 无AI时用规则匹配
    return scenes.map((s, i) => {
      const content = (s.content || '') + (s.narration || '');
      if (content.includes('Hook') || content.includes('开头') || content.includes('达人')) return { sceneIndex: i, clipType: 'large' };
      if (content.includes('产品') || content.includes('质地') || content.includes('泡沫') || content.includes('效果')) return { sceneIndex: i, clipType: 'medium' };
      if (content.includes('促销') || content.includes('下单') || content.includes('链接') || content.includes('CTA')) return { sceneIndex: i, clipType: 'small' };
      return { sceneIndex: i, clipType: i === 0 ? 'large' : i === scenes.length - 1 ? 'small' : 'medium' };
    });
  }

  try {
    const res = await axios.post(`${baseUrl}/chat/completions`, {
      model, messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000, temperature: 0.3,
    }, { headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 30000 });

    const content = res.data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    logger.warn('[VideoGen] AI匹配失败，降级规则匹配', { error: e.message });
  }

  // 降级：规则匹配
  return scenes.map((s, i) => {
    const content = (s.content || '') + (s.narration || '');
    if (content.includes('Hook') || content.includes('开头') || content.includes('达人')) return { sceneIndex: i, clipType: 'large' };
    if (content.includes('产品') || content.includes('质地') || content.includes('泡沫') || content.includes('效果')) return { sceneIndex: i, clipType: 'medium' };
    return { sceneIndex: i, clipType: i === 0 ? 'large' : i === scenes.length - 1 ? 'small' : 'medium' };
  });
}

router.post('/:id/generate-video', auth(), async (req, res) => {
  try {
    const taskId = req.params.id;
    const [[task]] = await db.query(`SELECT * FROM qc_material_tasks WHERE id = ?`, [taskId]);
    if (!task) return res.json({ code: 404, msg: '脚本不存在' });

    let scenes = task.scenes;
    if (typeof scenes === 'string') scenes = JSON.parse(scenes);
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.json({ code: 400, msg: '脚本无分镜信息' });
    }

    // 获取视频列表
    const videoList = await getVideoList();
    if (videoList.length === 0) {
      return res.json({ code: 500, msg: '素材库暂无视频，请检查MinIO连接' });
    }

    // AI匹配每个分镜的最佳片段类型
    const matchResults = await aiMatchClips(scenes, videoList);

    // 按类型分组
    const largeVideos = videoList.filter(v => v.size > 5 * 1024 * 1024);
    const mediumVideos = videoList.filter(v => v.size > 1 * 1024 * 1024 && v.size <= 5 * 1024 * 1024);
    const smallVideos = videoList.filter(v => v.size <= 1 * 1024 * 1024 && v.size > 100000);

    const typeMap = { large: largeVideos, medium: mediumVideos, small: smallVideos };

    // 为每个分镜选择片段并生成预签名URL
    const clipResults = [];
    const usedFiles = new Set();

    for (const match of matchResults) {
      const pool = typeMap[match.clipType] || mediumVideos;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      let selected = null;

      for (const video of shuffled.slice(0, 20)) {
        if (!usedFiles.has(video.name)) {
          const url = await getPresignedUrl(video.key);
          if (url) {
            selected = { file: video.name, url, size: video.size, type: match.clipType, reason: match.reason || '' };
            usedFiles.add(video.name);
            break;
          }
        }
      }

      if (!selected && shuffled.length > 0) {
        const fallback = shuffled[0];
        const url = await getPresignedUrl(fallback.key);
        selected = { file: fallback.name, url, size: fallback.size, type: match.clipType, reason: '降级选择' };
      }

      clipResults.push({
        sceneIndex: match.sceneIndex,
        scene: scenes[match.sceneIndex],
        clip: selected,
      });
    }

    // 更新数据库
    const videoData = {
      clips: clipResults.map(c => ({
        scene_time: c.scene?.time,
        scene_content: c.scene?.content,
        clip_file: c.clip?.file,
        clip_url: c.clip?.url,
        clip_type: c.clip?.type,
        match_reason: c.clip?.reason,
      })),
      generated_at: new Date().toISOString(),
      total_clips: clipResults.filter(c => c.clip?.url).length,
    };

    await db.query(
      `UPDATE qc_material_tasks SET source_data = JSON_SET(COALESCE(source_data, '{}'), '$.video_clips', CAST(? AS JSON), '$.video_generated_at', ?, '$.video_status', 'done') WHERE id = ?`,
      [JSON.stringify(videoData.clips), videoData.generated_at, taskId]
    );

    logger.info(`[VideoGen] 脚本${taskId} 视频匹配完成，${videoData.total_clips}个片段`);

    res.json({
      code: 0,
      msg: `已匹配 ${videoData.total_clips} 个视频片段`,
      data: videoData,
    });
  } catch (e) {
    logger.error('[VideoGen] /generate-video 错误', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: '视频匹配失败: ' + e.message });
  }
});

// ===================== POST /:id/compose-video — 合成视频（含TTS口播） =====================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const VIDEO_DIR = '/home/www/qianchuan-monitor/generated-videos';
const CLIP_DIR = '/home/www/qianchuan-monitor/video-clips';
try { fs.mkdirSync(VIDEO_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(CLIP_DIR, { recursive: true }); } catch {}

// 口播风格配置 —— 根据人群画像（女性为主、18-35岁、护肤品类）
// XiaoyiNeural: 温柔知性女声，适合种草安利
// 不同分镜场景用不同语气节奏
const TTS_STYLES = {
  hook: {    // 开头Hook：语速快、音调高、有感染力
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+20%', pitch: '+10%', volume: '+15%',
  },
  demo: {    // 产品演示：温柔自然、娓娓道来
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+5%', pitch: '+3%', volume: '+5%',
  },
  effect: {  // 效果展示：惊喜感、稍快
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+12%', pitch: '+8%', volume: '+10%',
  },
  cta: {     // 促销转化：紧迫感、有力度
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+18%', pitch: '+6%', volume: '+15%',
  },
  default: { // 默认：闺蜜种草风
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+10%', pitch: '+5%', volume: '+8%',
  },
};

// 根据分镜内容智能匹配口播风格
function detectTTSStyle(sceneContent, narration, sceneIndex, totalScenes) {
  const text = (sceneContent || '') + (narration || '');
  if (sceneIndex === 0 || text.includes('Hook') || text.includes('不泛油') || text.includes('换了')) return 'hook';
  if (sceneIndex === totalScenes - 1 || text.includes('链接') || text.includes('下单') || text.includes('优惠') || text.includes('拍') || text.includes('囤')) return 'cta';
  if (text.includes('泡沫') || text.includes('质地') || text.includes('使用') || text.includes('洁面') || text.includes('氨基酸')) return 'demo';
  if (text.includes('效果') || text.includes('对比') || text.includes('减少') || text.includes('服帖') || text.includes('清爽')) return 'effect';
  return 'default';
}

// TTS生成口播音频（带情感风格）
async function generateTTS(text, outputDir, styleKey) {
  try {
    const style = TTS_STYLES[styleKey] || TTS_STYLES.default;
    const tts = new MsEdgeTTS();
    await tts.setMetadata(style.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const result = await tts.toFile(outputDir, text, {
      rate: style.rate,
      pitch: style.pitch,
      volume: style.volume,
    });
    return result.audioFilePath;
  } catch (e) {
    logger.warn('[TTS] 生成失败', { text: text.substring(0, 30), style: styleKey, error: e.message });
    return null;
  }
}

// 获取音频时长
function getAudioDuration(filePath) {
  try {
    return parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`, { timeout: 10000 }).toString().trim()) || 0;
  } catch { return 0; }
}

router.post('/:id/compose-video', auth(), async (req, res) => {
  const taskId = req.params.id;
  try {
    const [[task]] = await db.query(`SELECT * FROM qc_material_tasks WHERE id = ?`, [taskId]);
    if (!task) return res.json({ code: 404, msg: '脚本不存在' });

    let sourceData = task.source_data;
    if (typeof sourceData === 'string') sourceData = JSON.parse(sourceData);
    const clips = sourceData?.video_clips;
    if (!clips || clips.length === 0) {
      return res.json({ code: 400, msg: '请先匹配视频片段' });
    }

    let scenes = task.scenes;
    if (typeof scenes === 'string') scenes = JSON.parse(scenes);

    res.json({ code: 0, msg: '视频合成已启动（含口播语音），约1-2分钟完成' });

    // 异步合成
    (async () => {
      const tempFiles = []; // 统一清理
      try {
        await db.query(`UPDATE qc_material_tasks SET source_data = JSON_SET(COALESCE(source_data, '{}'), '$.compose_status', 'processing') WHERE id = ?`, [taskId]);

        const trimmedPaths = [];

        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          if (!clip.clip_url) continue;

          // 解析分镜时长
          const timeMatch = clip.scene_time?.match(/(\d+)-(\d+)/);
          const targetDuration = timeMatch ? Number(timeMatch[2]) - Number(timeMatch[1]) : 5;

          // 获取口播文案（从scenes中取narration）
          const scene = scenes[i] || {};
          const narration = scene.narration || '';

          // Step 1: 生成TTS口播音频（带情感风格）
          let ttsPath = null;
          let ttsDuration = 0;
          if (narration.trim()) {
            const styleKey = detectTTSStyle(scene.content, narration, i, clips.length);
            const ttsDir = path.join(CLIP_DIR, `task${taskId}_tts${i}`);
            try { fs.mkdirSync(ttsDir, { recursive: true }); } catch {}
            ttsPath = await generateTTS(narration, ttsDir, styleKey);
            if (ttsPath) {
              ttsDuration = getAudioDuration(ttsPath);
              tempFiles.push(ttsPath, ttsDir);
              logger.info(`[Compose] 分镜${i} TTS[${styleKey}] ${ttsDuration.toFixed(1)}s: ${narration.substring(0, 20)}...`);
            }
          }

          // 精确计算片段时长：有口播以口播时长为准(+0.3s缓冲)，无口播严格按分镜时长
          const exactDuration = ttsDuration > 0 ? (ttsDuration + 0.3) : targetDuration;

          // Step 2: 下载视频片段
          const clipPath = path.join(CLIP_DIR, `task${taskId}_clip${i}.mp4`);
          tempFiles.push(clipPath);
          try {
            execSync(`curl -sL --max-time 30 -o "${clipPath}" "${clip.clip_url}"`, { timeout: 35000 });
          } catch (e) {
            logger.warn(`[Compose] 下载片段${i}失败`, { error: e.message });
            continue;
          }

          // 获取源视频时长
          let srcDuration = 0;
          try {
            srcDuration = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${clipPath}"`, { timeout: 10000 }).toString().trim()) || 0;
          } catch {}
          if (srcDuration < 1) continue;

          // Step 3: 裁剪视频 + 叠加口播音频，严格控制时长
          const trimmedPath = path.join(CLIP_DIR, `task${taskId}_trim${i}.mp4`);
          tempFiles.push(trimmedPath);
          const dur = Math.min(exactDuration, srcDuration);
          const startSec = srcDuration > dur ? Math.floor(Math.random() * (srcDuration - dur)) : 0;

          try {
            const vf = `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black`;
            if (ttsPath && fs.existsSync(ttsPath)) {
              // 有口播：视频（静音）+ TTS，用-t精确限制总时长=口播时长+0.3s
              execSync(`ffmpeg -y -ss ${startSec} -i "${clipPath}" -i "${ttsPath}" -t ${dur.toFixed(2)} -vf "${vf}" -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -r 30 -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "${trimmedPath}"`, { timeout: 60000 });
            } else {
              // 无口播：严格按分镜时长裁剪+静音
              execSync(`ffmpeg -y -ss ${startSec} -i "${clipPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -t ${dur.toFixed(2)} -vf "${vf}" -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -r 30 -c:a aac -b:a 128k -movflags +faststart "${trimmedPath}"`, { timeout: 60000 });
            }
            trimmedPaths.push(trimmedPath);
            logger.info(`[Compose] 分镜${i} 裁剪完成 ${dur.toFixed(1)}s (脚本${targetDuration}s, 口播${ttsDuration.toFixed(1)}s)`);
          } catch (e) {
            logger.warn(`[Compose] 裁剪片段${i}失败`, { error: e.message });
          }
        }

        if (trimmedPaths.length === 0) {
          logger.error(`[Compose] 脚本${taskId} 无法合成任何片段`);
          await db.query(`UPDATE qc_material_tasks SET source_data = JSON_SET(COALESCE(source_data, '{}'), '$.compose_status', 'failed', '$.compose_error', '所有片段处理失败') WHERE id = ?`, [taskId]);
          return;
        }

        // Step 4: 拼接所有片段
        const outputFilename = `video_${taskId}_${Date.now()}.mp4`;
        const outputPath = path.join(VIDEO_DIR, outputFilename);
        const listFile = path.join(CLIP_DIR, `task${taskId}_concat.txt`);
        tempFiles.push(listFile);
        fs.writeFileSync(listFile, trimmedPaths.map(p => `file '${p}'`).join('\n'));

        try {
          execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy -movflags +faststart "${outputPath}"`, { timeout: 120000 });
        } catch (e) {
          logger.error(`[Compose] 拼接失败`, { error: e.message });
          await db.query(`UPDATE qc_material_tasks SET source_data = JSON_SET(COALESCE(source_data, '{}'), '$.compose_status', 'failed', '$.compose_error', '视频拼接失败') WHERE id = ?`, [taskId]);
          return;
        }

        let fileSize = 0;
        try { fileSize = fs.statSync(outputPath).size; } catch {}

        const videoUrl = `/generated-videos/${outputFilename}`;
        await db.query(
          `UPDATE qc_material_tasks SET source_data = JSON_SET(COALESCE(source_data, '{}'), '$.video_url', ?, '$.compose_status', 'done', '$.compose_at', ?, '$.video_size', ?) WHERE id = ?`,
          [videoUrl, new Date().toISOString(), fileSize, taskId]
        );

        logger.info(`[Compose] 脚本${taskId} 视频合成成功(含口播): ${outputFilename}, ${trimmedPaths.length}个片段, ${(fileSize/1024/1024).toFixed(1)}MB`);
      } catch (e) {
        logger.error(`[Compose] 异步合成失败`, { taskId, error: e.message, stack: e.stack });
        await db.query(`UPDATE qc_material_tasks SET source_data = JSON_SET(COALESCE(source_data, '{}'), '$.compose_status', 'failed', '$.compose_error', ?) WHERE id = ?`, [e.message, taskId]);
      } finally {
        // 统一清理临时文件
        for (const f of tempFiles) {
          try {
            const stat = fs.statSync(f);
            if (stat.isDirectory()) fs.rmSync(f, { recursive: true, force: true });
            else fs.unlinkSync(f);
          } catch {}
        }
      }
    })();
  } catch (e) {
    logger.error('[Compose] /compose-video 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /:id/video-status — 查询视频/合成状态 =====================
router.get('/:id/video-status', auth(), async (req, res) => {
  try {
    const [[task]] = await db.query(`SELECT source_data FROM qc_material_tasks WHERE id = ?`, [req.params.id]);
    if (!task) return res.json({ code: 404, msg: '脚本不存在' });

    let sourceData = task.source_data;
    if (typeof sourceData === 'string') sourceData = JSON.parse(sourceData);

    res.json({
      code: 0,
      data: {
        clips: sourceData?.video_clips || [],
        video_url: sourceData?.video_url || null,
        compose_status: sourceData?.compose_status || null,
        compose_at: sourceData?.compose_at || null,
        compose_error: sourceData?.compose_error || null,
        video_size: sourceData?.video_size || 0,
        generated_at: sourceData?.video_generated_at || null,
      }
    });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
