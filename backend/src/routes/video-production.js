const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const dayjs = require('dayjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 指定下载素材的千川账号（雪玲妃官方旗舰店），其他账号素材有水印
const OFFICIAL_ADVERTISER_ID = '1713421159436366';

// 素材视频上传目录
const UPLOAD_DIR = path.join(__dirname, '../../tmp/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const safeName = 'upload_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('不支持的视频格式: ' + ext));
  }
});

// 获取生产方案列表
router.get('/', auth(), async (req, res) => {
  const { status, page = 1, page_size = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(page_size);
  try {
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM qc_video_production WHERE ' + where, params);
    const [rows] = await db.query(
      'SELECT * FROM qc_video_production WHERE ' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [...params, parseInt(page_size), offset]
    );

    rows.forEach(r => {
      try { r.ref_materials = typeof r.ref_materials === 'string' ? JSON.parse(r.ref_materials) : r.ref_materials; } catch(e) { r.ref_materials = []; }
      try { r.timeline = typeof r.timeline === 'string' ? JSON.parse(r.timeline) : r.timeline; } catch(e) { r.timeline = []; }
    });

    res.json({ code: 0, data: { items: rows, total } });
  } catch (e) {
    logger.error('[VideoProduction] list error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// AI生成视频生产方案
router.post('/generate', auth(), async (req, res) => {
  try {
    const { custom_script } = req.body;
    const today = dayjs().format('YYYY-MM-DD');
    const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');

    // 1. 近7天消耗TOP10（跑量最好的素材）
    const [topCost] = await db.query(
      `SELECT material_id, title, SUM(cost) AS cost, SUM(pay_order_count) AS orders,
        CASE WHEN SUM(cost)>0 THEN SUM(pay_order_amount)/SUM(cost) ELSE 0 END AS roi,
        AVG(product_ctr) AS avg_ctr, AVG(convert_rate) AS avg_convert_rate,
        AVG(play_over_rate) AS avg_finish_rate, AVG(play_duration_3s_rate) AS avg_3s_rate,
        video_duration
      FROM qc_material_stats
      WHERE stat_date BETWEEN ? AND ? AND cost > 0 AND advertiser_id = ?
      GROUP BY material_id, title
      ORDER BY SUM(cost) DESC LIMIT 10`,
      [weekAgo, today, OFFICIAL_ADVERTISER_ID]
    );

    // 2. 近7天CTR最高（点击率高=画面吸引力强）
    const [topCtr] = await db.query(
      `SELECT material_id, title, SUM(cost) AS cost,
        AVG(product_ctr) AS avg_ctr, AVG(convert_rate) AS avg_convert_rate,
        AVG(play_over_rate) AS avg_finish_rate, AVG(play_duration_3s_rate) AS avg_3s_rate,
        SUM(pay_order_count) AS orders, video_duration
      FROM qc_material_stats
      WHERE stat_date BETWEEN ? AND ? AND cost > 100 AND product_ctr > 0 AND advertiser_id = ?
      GROUP BY material_id, title
      ORDER BY AVG(product_ctr) DESC LIMIT 10`,
      [weekAgo, today, OFFICIAL_ADVERTISER_ID]
    );

    // 3. 近7天转化率最高（转化率高=说服力强、CTA有效）
    const [topConvert] = await db.query(
      `SELECT material_id, title, SUM(cost) AS cost,
        AVG(product_ctr) AS avg_ctr, AVG(convert_rate) AS avg_convert_rate,
        AVG(play_over_rate) AS avg_finish_rate,
        SUM(pay_order_count) AS orders,
        CASE WHEN SUM(cost)>0 THEN SUM(pay_order_amount)/SUM(cost) ELSE 0 END AS roi,
        video_duration
      FROM qc_material_stats
      WHERE stat_date BETWEEN ? AND ? AND cost > 100 AND convert_rate > 0 AND advertiser_id = ?
      GROUP BY material_id, title
      ORDER BY AVG(convert_rate) DESC LIMIT 10`,
      [weekAgo, today, OFFICIAL_ADVERTISER_ID]
    );

    // 4. 已有素材脚本
    const [scripts] = await db.query(
      `SELECT id, title, hot_topic, hook, scenes, cta FROM qc_material_tasks
      WHERE status IN ('approved', 'pending')
      ORDER BY FIELD(status, 'approved', 'pending'), created_at DESC LIMIT 6`
    );
    scripts.forEach(s => {
      try { s.scenes = typeof s.scenes === 'string' ? JSON.parse(s.scenes) : s.scenes; } catch(e) { s.scenes = []; }
    });

    // 5. 千川平台可用素材（去重后的素材名，含投放数据的 + 本地已有的）
    const [allMaterials] = await db.query(
      `SELECT material_id, title, MAX(video_duration) AS video_duration,
        SUM(cost) AS total_cost, SUM(pay_order_count) AS orders
      FROM qc_material_stats
      WHERE stat_date >= ? AND title IS NOT NULL AND title != '' AND advertiser_id = ?
      GROUP BY material_id, title
      ORDER BY SUM(cost) DESC LIMIT 50`,
      [weekAgo, OFFICIAL_ADVERTISER_ID]
    );
    const [uploads] = await db.query(
      'SELECT id, title, duration FROM qc_video_uploads ORDER BY created_at DESC LIMIT 30'
    );

    // 合并：千川素材 + 本地上传素材（去重）
    const seenTitles = new Set();
    const sourcePool = [];
    // 优先千川高消耗素材
    for (const m of allMaterials) {
      if (!seenTitles.has(m.title)) {
        seenTitles.add(m.title);
        const cost = parseFloat(m.total_cost || 0);
        sourcePool.push(`  - [${m.title}] ${m.video_duration ? Math.round(parseFloat(m.video_duration)) + 's' : '未知时长'}${cost > 0 ? ' 消耗:' + cost.toFixed(0) + '元' : ''}`);
      }
    }
    // 补充本地已有但不在千川数据中的
    for (const u of uploads) {
      if (!seenTitles.has(u.title)) {
        seenTitles.add(u.title);
        sourcePool.push(`  - [${u.title}] ${u.duration ? Math.round(u.duration) + 's' : '未知时长'} (本地)`);
      }
    }

    // 6. 构建AI数据
    const costInfo = topCost.slice(0, 8).map(m => {
      const ctr = m.avg_ctr ? parseFloat(m.avg_ctr).toFixed(2) : '0';
      const cvr = m.avg_convert_rate ? parseFloat(m.avg_convert_rate).toFixed(2) : '0';
      const fr = m.avg_finish_rate ? (parseFloat(m.avg_finish_rate) * 100).toFixed(1) : '0';
      const r3s = m.avg_3s_rate ? (parseFloat(m.avg_3s_rate) * 100).toFixed(1) : '0';
      return `  - [${m.title || 'unnamed'}] 消耗:${parseFloat(m.cost).toFixed(0)}元, ROI:${parseFloat(m.roi).toFixed(2)}, CTR:${ctr}%, 转化率:${cvr}%, 完播:${fr}%, 3s留存:${r3s}%, 时长:${m.video_duration || '?'}s`;
    }).join('\n');

    const ctrInfo = topCtr.slice(0, 8).map(m => {
      const ctr = m.avg_ctr ? parseFloat(m.avg_ctr).toFixed(2) : '0';
      const cvr = m.avg_convert_rate ? parseFloat(m.avg_convert_rate).toFixed(2) : '0';
      const fr = m.avg_finish_rate ? (parseFloat(m.avg_finish_rate) * 100).toFixed(1) : '0';
      return `  - [${m.title || 'unnamed'}] CTR:${ctr}%, 转化率:${cvr}%, 消耗:${parseFloat(m.cost).toFixed(0)}元, 完播:${fr}%`;
    }).join('\n');

    const convertInfo = topConvert.slice(0, 8).map(m => {
      const ctr = m.avg_ctr ? parseFloat(m.avg_ctr).toFixed(2) : '0';
      const cvr = m.avg_convert_rate ? parseFloat(m.avg_convert_rate).toFixed(2) : '0';
      const roi = m.roi ? parseFloat(m.roi).toFixed(2) : '0';
      return `  - [${m.title || 'unnamed'}] 转化率:${cvr}%, CTR:${ctr}%, ROI:${roi}, 成交:${m.orders || 0}单, 消耗:${parseFloat(m.cost).toFixed(0)}元`;
    }).join('\n');

    const scriptInfo = scripts.slice(0, 3).map((s, i) =>
      `  脚本${i+1} [${s.title}] Hook: ${s.hook}; 场景: ${(s.scenes||[]).map(sc => sc.content).join(' → ')}; CTA: ${s.cta}`
    ).join('\n');

    const sourcePoolInfo = sourcePool.length
      ? sourcePool.slice(0, 40).join('\n')
      : '  暂无素材';

    const prompt = `你是雪玲妃品牌的短视频广告制作总监，精通千川/抖音广告投放，擅长分析行业爆款素材结构并输出高停留、高转化的脚本。

品牌：雪玲妃（洁面、护肤品类，主打氨基酸洁面/绿泥洁面）

═══ 投放数据分析 ═══

【消耗TOP素材】（跑量最好，算法认可、受众广）：
${costInfo || '  暂无数据'}

【CTR最高素材】（点击率高=画面吸引力强，开头hook有效）：
${ctrInfo || '  暂无数据'}

【转化率最高素材】（转化率高=文案说服力强、CTA有效）：
${convertInfo || '  暂无数据'}

═══ 可用素材库（共${sourcePool.length}个，source字段必须从这里选） ═══

【千川平台素材】（系统会自动下载，直接引用即可）：
${sourcePoolInfo}

【已有脚本参考】：
${scriptInfo || '  暂无脚本'}
${custom_script ? `
═══ 用户自定义脚本（最高优先级！必须严格按此脚本生成方案） ═══

${custom_script}

⚠️ 必须以上面的自定义脚本为核心内容，将其拆分为timeline片段，匹配合适的千川素材。只需生成1条方案即可。
` : ''}
═══ 行业爆款规律（必须遵守） ═══

1. **黄金3秒法则**：前3秒是hook，必须让用户停下来看（痛点提问/视觉冲击/悬念）
2. **停留节奏**：不是越快越好！关键画面要给足时间让用户看清楚：
   - 产品使用过程、泡沫/效果特写：5-8秒（让用户沉浸体验）
   - 效果对比/前后变化：4-6秒（给足对比冲击力）
   - 达人/明星口播片段：5-10秒（保留完整原声，真实感染力最强）
   - 开头hook：2-4秒（快速抓注意力）
   - CTA促销结尾：3-5秒（留足决策时间）
3. **画面不要频繁切换**：3秒一切的视频像PPT，用户看都看不清就划走了。核心卖点画面要停留够长
4. **善用达人/明星原声**：素材中如果有达人口碑推荐、明星推荐、KOC真实分享的片段，这些原声比TTS更有感染力和可信度！要标记为保留原声
5. **爆款素材结构**：强hook → 达人推荐/产品亮相 → 使用体验（最长段落）→ 效果展示 → 促销CTA

═══ 生成要求 ═══

请生成3条完整的视频脚本，严格要求：

1. **片段时长分配（极其重要）**：
   - 总时长30-40秒，分5-7个片段（不是10-12个！）
   - 每个片段至少4秒，核心展示片段6-8秒
   - 禁止出现连续的3秒短片段！只有开头hook可以是3秒
   - 参考时长分配：3s(hook) + 6s(产品亮相) + 8s(使用体验/达人口播) + 6s(效果展示) + 5s(促销CTA)

2. **音频模式（极其重要）**：
   - **保留原声（keep_original_audio: true）**：当素材中有达人口碑推荐、明星口播、KOC真实分享等强内容片段时，必须设置此标记。原声更真实、更有感染力，比TTS好很多！每条脚本建议有1-3个保留原声的片段
   - **TTS配音（keep_original_audio: false或不设置）**：产品展示、效果对比、促销等需要统一口播的片段用TTS
   - narration字段都要填写：保留原声时narration作为字幕显示，TTS时作为朗读内容

3. **口播文案（narration）**：
   - 口语化、有感染力、像真人种草推荐
   - 每段narration长度要匹配片段时长（6秒≈30-40字，4秒≈20字）
   - 前3秒必须是强hook

4. **画面营销文案（marketing_text）**：叠加在画面上的标签，4-10个字

5. **source字段（极其重要！必须精确匹配）**：
   - source的值**必须与可用素材库列表中的素材名完全一致**，一字不差！
   - 不要自己编造或修改素材名，直接复制粘贴素材库中的名称
   - 优先选择消耗高、数据好的素材（说明算法认可、用户喜欢）
   - 不同片段可以引用不同素材，混剪出新的组合
   - keep_original_audio=true的片段：优先选含"达人""koc""口播"关键词的素材
   - 产品展示/效果对比片段：优先选含"产品""功效""绿泥""慕斯""百合"关键词的素材

6. **画面动效（visual_effect）— 让画面有运动感，不要静止不动**：
   - zoom_in：推入效果（适合hook开头、产品亮相，画面从远推近）
   - zoom_out：拉远效果（适合CTA结尾，画面从近拉远）
   - slow_zoom：缓慢推入（适合产品展示、使用过程，高级感）
   - pan_lr：左右微移（适合效果对比、测评画面）
   - static：静止不动（仅用于达人口播keep_original_audio片段）
   - 规则：达人口播片段必须用static，其他片段不要用static！

7. **节奏控制（pace）— 模仿抖音卡点节奏**：
   - fast：微加速1.05x（hook开头、CTA催促）
   - normal：正常速度（达人口播、一般画面）
   - slow：微减速0.93x（产品特写、效果对比，给足观看时间）
   - 规则：keep_original_audio=true的片段必须用normal

8. **3条方案差异化**：
   - 方案1「高转化混剪」：组合高消耗+高转化素材的优势片段，多用达人原声
   - 方案2「CTR爆款」：模仿高CTR素材的画面节奏，强视觉冲击
   - 方案3「痛点种草」：从用户痛点切入，达人真实口碑+效果对比
${custom_script ? `9. **用户自定义脚本参考**：用户提供了自定义脚本，请在3条方案中融入用户脚本的核心内容和卖点，但仍然保持3条方案的差异化风格` : ''}

JSON格式：
[
  {
    "title": "方案标题（15字以内）",
    "strategy": "高转化混剪/CTR爆款/痛点种草",
    "ref_materials": [
      {"title": "参考素材标题", "reason": "复用了什么优势"}
    ],
    "ref_script_title": "关联脚本标题（如有）",
    "timeline": [
      {
        "time": "0-3s",
        "source": "必须与素材视频库中的素材名完全一致，直接复制",
        "content": "画面描述（镜头、动作、效果）",
        "narration": "口播文案（保留原声时作字幕，TTS时朗读）",
        "marketing_text": "营销标签（4-10字）",
        "edit_note": "剪辑提示",
        "keep_original_audio": false,
        "visual_effect": "zoom_in/zoom_out/slow_zoom/pan_lr/static",
        "pace": "fast/normal/slow"
      }
    ],
    "production_notes": "制作要点"
  }
]
⚠️ 最重要的规则：
1. keep_original_audio为true表示该片段保留素材原始声音（达人/明星口播），false表示用TTS配音
2. source字段必须与【可用素材库】列表中的素材名**完全一模一样**！直接复制粘贴，不精确匹配会导致素材下载失败！
3. 只返回JSON，不要其他内容。`;

    let plans = [];
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const axios = require('axios');
        const openaiBase = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const aiRes = await axios.post(openaiBase + '/chat/completions', {
          model: process.env.OPENAI_MODEL || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.75,
          max_tokens: 8000
        }, {
          headers: { 'Authorization': 'Bearer ' + openaiKey, 'Content-Type': 'application/json' },
          timeout: 180000
        });
        const content = aiRes.data.choices[0].message.content;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          let jsonStr = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          plans = JSON.parse(jsonStr);
        }
      } catch (aiErr) {
        logger.warn('[VideoProduction] AI generate failed', { error: aiErr.message });
      }
    }

    // Fallback：基于实际数据生成模板方案
    if (!plans.length) {
      const refCost1 = topCost[0] ? topCost[0].title : '高消耗素材';
      const refCtr1 = topCtr[0] ? topCtr[0].title : '高CTR素材';
      const refCvr1 = topConvert[0] ? topConvert[0].title : '高转化素材';
      const scriptTitle = scripts[0] ? scripts[0].title : '';
      // 优先用千川高消耗素材，其次用本地素材
      const pool = allMaterials.length ? allMaterials : uploads;
      const srcName = pool[0] ? pool[0].title : '素材A';
      const srcName2 = pool[1] ? pool[1].title : (pool[0] ? pool[0].title : '素材B');
      const srcName3 = pool[2] ? pool[2].title : (pool[0] ? pool[0].title : '素材C');
      plans = [
        {
          title: '高转化混剪：控油洁面实力派',
          strategy: '高转化混剪',
          ref_materials: [
            { title: refCost1, reason: '近7天消耗最高，算法验证受众广' },
            { title: refCvr1, reason: '转化率最高，CTA话术值得复用' }
          ],
          ref_script_title: scriptTitle,
          timeline: [
            { time: '0-3s', source: srcName, content: '脸部出油特写，油光反射镜头', narration: '脸出油到能反光？姐妹你的洁面该换了！', marketing_text: '油皮救星', edit_note: '快切+缩放hook', keep_original_audio: false, visual_effect: 'zoom_in', pace: 'fast' },
            { time: '3-9s', source: srcName2, content: '达人手持产品推荐，展示质地和打泡', narration: '这个雪玲妃绿泥洁面膏，挤出来就是满满矿物质精华，泡沫超绵密', marketing_text: '矿物绿泥配方', edit_note: '保留达人真实推荐声音', keep_original_audio: true, visual_effect: 'static', pace: 'normal' },
            { time: '9-17s', source: srcName, content: '上脸清洗完整过程：打圈按摩→鼻翼细节→冲水→展示洗后肤质', narration: '上脸超温和，打圈按摩一点都不刺激，鼻翼敏感的地方也完全OK，冲完水脸滑滑的不紧绷，真的好舒服', marketing_text: '温和不刺激 洗后水润', edit_note: '完整使用过程连贯拍摄8秒', keep_original_audio: true, visual_effect: 'static', pace: 'normal' },
            { time: '17-23s', source: srcName3, content: '洗前洗后对比：T区控油效果、毛孔细腻变化', narration: '控油效果真的绝了！洗之前T区全是油，洗完清清爽爽的，毛孔都干净了好多，这效果谁不心动', marketing_text: '持久控油 毛孔细腻', edit_note: '分屏对比，停留够久看清效果', keep_original_audio: false, visual_effect: 'pan_lr', pace: 'slow' },
            { time: '23-29s', source: srcName2, content: '产品全景展示+成分表特写+价格信息', narration: '氨基酸加绿泥成分，温和又有效。500g大瓶装超划算，限时优惠比平时省好几十', marketing_text: '限时特惠 立省30元', edit_note: '成分标注+价格贴片', keep_original_audio: false, visual_effect: 'slow_zoom', pace: 'normal' },
            { time: '29-34s', source: srcName, content: '手持产品面对镜头，指向下方引导', narration: '换季控油就靠它，点击下方链接立即抢购，手慢就没了姐妹们！', marketing_text: '点击下方立即购买', edit_note: '箭头动效+催促结尾', keep_original_audio: false, visual_effect: 'zoom_out', pace: 'fast' }
          ],
          production_notes: '前3秒快hook→达人原声推荐+使用体验(保留原声更真实)→TTS做效果对比和促销。达人口播片段不加TTS。'
        },
        {
          title: 'CTR爆款：闺蜜种草洁面好物',
          strategy: 'CTR爆款',
          ref_materials: [
            { title: refCtr1, reason: 'CTR最高，开头hook方式和真人推荐感值得复用' }
          ],
          ref_script_title: scriptTitle,
          timeline: [
            { time: '0-4s', source: srcName, content: '达人举起产品对镜头，表情惊喜', narration: '天呐姐妹们！这个洁面我已经回购第三瓶了，真的太好用了！', marketing_text: '回购3次 好用到哭', edit_note: '达人真实口播开头，保留原声', keep_original_audio: true, visual_effect: 'static', pace: 'normal' },
            { time: '4-10s', source: srcName2, content: '开箱展示产品全貌，挤膏体展示绿泥质地', narration: '500g大瓶装够用好几个月，你看膏体是绿色的矿物泥，质地特别细腻，闻起来还有淡淡清香', marketing_text: '500g大容量 天然矿物泥', edit_note: '自然光拍摄，手持展示', keep_original_audio: true, visual_effect: 'static', pace: 'normal' },
            { time: '10-18s', source: srcName3, content: '完整洗脸过程：打泡→上脸→按摩→冲水→展示肤质', narration: '一点点就打出好多泡沫，上脸按摩真的好舒服，软软泡沫像做SPA。冲完水皮肤嫩滑，比没洗前光滑太多了', marketing_text: '绵密泡沫 洗后嫩滑', edit_note: '完整使用过程8秒，达人原声沉浸体验', keep_original_audio: true, visual_effect: 'static', pace: 'normal' },
            { time: '18-24s', source: srcName, content: '黑头鼻翼对比+肤质提亮效果', narration: '坚持用一周，黑头少了好多，毛孔变细腻了，洗完不紧绷不假滑，真的干净又舒服', marketing_text: '告别黑头 毛孔细腻', edit_note: '近距离特写对比', keep_original_audio: false, visual_effect: 'pan_lr', pace: 'slow' },
            { time: '24-30s', source: srcName2, content: '手持产品推荐+价格优惠', narration: '真的谁用谁知道！今天下单立减还送旅行装，点击下方赶紧冲，这个价格随时恢复原价！', marketing_text: '限时立减 赠旅行装', edit_note: '价格贴片+箭头引导', keep_original_audio: false, visual_effect: 'zoom_out', pace: 'fast' }
          ],
          production_notes: '前3段全部保留达人原声，真人推荐感最强。后2段TTS做效果对比和促销。语气自然不做作。'
        },
        {
          title: '痛点种草：换季敏感肌洁面攻略',
          strategy: '痛点种草',
          ref_materials: [
            { title: refCost1, reason: '产品使用展示效果好' },
            { title: refCvr1, reason: '文案说服力强，转化率最高' }
          ],
          ref_script_title: scriptTitle,
          timeline: [
            { time: '0-3s', source: srcName, content: '脸部泛红、起皮、刺痛画面特写', narration: '换季脸又刺痛泛红了？你可能用错洁面了！', marketing_text: '换季敏感警告', edit_note: '痛点画面，快速引发共鸣', keep_original_audio: false, visual_effect: 'zoom_in', pace: 'fast' },
            { time: '3-8s', source: srcName2, content: '对比皂基和氨基酸洁面的泡沫差异', narration: '皂基洁面看着洗得干净，其实越洗越薄越敏感。换成氨基酸洁面，温和度完全不一样', marketing_text: '氨基酸才是正解', edit_note: '对比展示科普感', keep_original_audio: false, visual_effect: 'pan_lr', pace: 'normal' },
            { time: '8-16s', source: srcName3, content: '达人亲自使用：挤膏体→打泡→上脸→按摩→冲水', narration: '你看泡沫软软的像奶油，上脸一点不紧绷，敏感时用也不刺痛。冲完水是那种舒服的润，不假滑', marketing_text: '奶油泡沫 温和零刺激', edit_note: '达人真实使用过程8秒，保留原声', keep_original_audio: true, visual_effect: 'static', pace: 'normal' },
            { time: '16-23s', source: srcName, content: '敏感肌一周前后对比+成分表', narration: '敏感期坚持用一周，泛红退了好多，屏障慢慢修复了。氨基酸表活加神经酰胺，修护清洁同时做到', marketing_text: '修护屏障 敏感肌实测', edit_note: '效果对比+成分标注', keep_original_audio: false, visual_effect: 'slow_zoom', pace: 'slow' },
            { time: '23-29s', source: srcName2, content: '产品全景+促销+下方引导', narration: '换季必备安心洁面，今天拍一发二还送修护面膜！点击下方链接带走，皮肤不再闹脾气', marketing_text: '拍1发2 再送面膜', edit_note: '促销高亮+CTA引导', keep_original_audio: false, visual_effect: 'zoom_out', pace: 'fast' }
          ],
          production_notes: '紧扣换季痛点。达人使用过程保留原声(8s)最真实。开头TTS做痛点+科普，结尾TTS做促销。'
        }
      ];
    }

    // 5. 存入数据库
    const insertedIds = [];
    for (const plan of plans) {
      let refScriptId = null;
      if (plan.ref_script_title && scripts.length) {
        const matched = scripts.find(s => s.title === plan.ref_script_title);
        if (matched) refScriptId = matched.id;
      }

      const [result] = await db.query(
        'INSERT INTO qc_video_production (title, ref_materials, ref_script_id, ref_script_title, timeline, production_notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          plan.title,
          JSON.stringify(plan.ref_materials || []),
          refScriptId,
          plan.ref_script_title || '',
          JSON.stringify(plan.timeline || []),
          plan.production_notes || '',
          'pending'
        ]
      );
      insertedIds.push(result.insertId);
      plan.id = result.insertId;
      plan.status = 'pending';
      plan.created_at = new Date().toISOString();
    }

    logger.info('[VideoProduction] generated', { count: plans.length, ids: insertedIds });
    res.json({ code: 0, data: plans, msg: '成功生成' + plans.length + '条视频生产方案' });
  } catch (e) {
    logger.error('[VideoProduction] generate failed', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: e.message });
  }
});

// 更新状态
router.put('/:id/status', auth(), async (req, res) => {
  const { id } = req.params;
  const { status, assignee } = req.body;
  const validStatus = ['pending', 'producing', 'completed'];
  if (!validStatus.includes(status)) {
    return res.json({ code: 400, msg: 'invalid status' });
  }
  try {
    const updates = ['status = ?'];
    const params = [status];
    if (assignee !== undefined) { updates.push('assignee = ?'); params.push(assignee); }
    params.push(id);
    await db.query('UPDATE qc_video_production SET ' + updates.join(', ') + ' WHERE id = ?', params);
    res.json({ code: 0, msg: '状态已更新' });
  } catch (e) {
    logger.error('[VideoProduction] update status failed', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ==================== 千川素材导入 ====================

// 从千川API获取素材列表（带搜索和分页）
router.get('/qc-materials', auth(), async (req, res) => {
  const { keyword = '', page = 1, page_size = 20 } = req.query;
  try {
    // 获取有效token
    const [[account]] = await db.query(
      `SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM qc_accounts WHERE advertiser_id = '${OFFICIAL_ADVERTISER_ID}' AND status=1 AND access_token IS NOT NULL LIMIT 1`
    );
    if (!account) return res.json({ code: 400, msg: '无可用千川账号，请先授权' });

    let token = account.access_token;

    // 检查token是否过期，自动刷新
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
      try {
        const QianChuanAPI = require('../services/qianchuan');
        const APP_SECRET = process.env.APP_SECRET || '67e5c48c38e04c36140c41ce8ad44f5b52c105f1';
        const refreshRes = await QianChuanAPI.refreshToken('1859525766684851', APP_SECRET, account.refresh_token);
        if (refreshRes.code === 0 && refreshRes.data) {
          token = refreshRes.data.access_token;
          const expiresAt = new Date(Date.now() + (refreshRes.data.expires_in || 86400) * 1000);
          await db.query('UPDATE qc_accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE status=1',
            [token, refreshRes.data.refresh_token || account.refresh_token, expiresAt]);
          logger.info('[QC-Import] Token自动刷新成功');
        }
      } catch (e) {
        logger.warn('[QC-Import] Token刷新失败', { error: e.message });
        return res.json({ code: 401, msg: 'Token已过期，请重新授权' });
      }
    }

    // 调用千川视频列表API
    const axios = require('axios');
    const apiRes = await axios.get('https://ad.oceanengine.com/open_api/v1.0/qianchuan/video/get/', {
      params: {
        advertiser_id: String(account.advertiser_id),
        page: parseInt(page),
        page_size: Math.min(parseInt(page_size), 20),
        ...(keyword ? { filtering: JSON.stringify({ keyword }) } : {})
      },
      headers: { 'Access-Token': token },
      timeout: 30000
    });

    const data = apiRes.data;
    if (data.code !== 0) {
      return res.json({ code: data.code, msg: data.message || '千川API错误' });
    }

    const list = (data.data?.list || []).map(v => ({
      material_id: String(v.material_id),
      title: v.filename || '',
      duration: v.duration || 0,
      width: v.width || 0,
      height: v.height || 0,
      size: v.size || 0,
      poster_url: v.poster_url || '',
      url: v.url || '',
      create_time: v.create_time || ''
    }));

    // 标记已导入的
    if (list.length) {
      const [imported] = await db.query(
        'SELECT title FROM qc_video_uploads WHERE title IN (?)',
        [list.map(v => v.title)]
      );
      const importedSet = new Set(imported.map(r => r.title));
      list.forEach(v => { v.imported = importedSet.has(v.title); });
    }

    res.json({
      code: 0,
      data: {
        list,
        page_info: data.data?.page_info || { page: parseInt(page), total_number: 0 }
      }
    });
  } catch (e) {
    logger.error('[QC-Import] 获取素材列表失败', { error: e.message });
    res.json({ code: 500, msg: '获取千川素材失败: ' + e.message });
  }
});

// 批量导入千川素材（下载视频到本地）
router.post('/import-materials', auth(), async (req, res) => {
  const { materials } = req.body; // [{material_id, title, url, duration, width, height, size}]
  if (!materials || !materials.length) return res.json({ code: 400, msg: '请选择要导入的素材' });
  if (materials.length > 10) return res.json({ code: 400, msg: '单次最多导入10个素材' });

  // 过滤掉已导入的
  const titles = materials.map(m => m.title);
  const [existing] = await db.query('SELECT title FROM qc_video_uploads WHERE title IN (?)', [titles]);
  const existingSet = new Set(existing.map(r => r.title));
  const toImport = materials.filter(m => !existingSet.has(m.title) && m.url);

  if (!toImport.length) return res.json({ code: 0, msg: '所选素材已全部导入', data: { imported: 0 } });

  // 立即返回，后台下载
  res.json({ code: 0, msg: `开始导入${toImport.length}个素材，后台下载中...`, data: { importing: toImport.length } });

  // 异步下载（使用yt-dlp处理千川CDN的302重定向）
  (async () => {
    const { execFile } = require('child_process');
    let success = 0, failed = 0;
    for (const m of toImport) {
      try {
        const safeName = 'qc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.mp4';
        const filePath = path.join(UPLOAD_DIR, safeName);

        // 用yt-dlp下载视频
        await new Promise((resolve, reject) => {
          execFile('yt-dlp', ['--no-check-certificate', '-o', filePath, '--no-part', '--socket-timeout', '30', m.url],
            { timeout: 180000 }, (err, stdout, stderr) => {
              if (err) reject(new Error(stderr || err.message));
              else resolve();
            });
        });
        // yt-dlp可能用了不同扩展名
        if (!fs.existsSync(filePath)) {
          const baseName = safeName.replace('.mp4', '');
          const allFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.startsWith(baseName));
          if (allFiles.length) fs.renameSync(path.join(UPLOAD_DIR, allFiles[0]), filePath);
        }

        if (!fs.existsSync(filePath)) { failed++; continue; }
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        if (fileSize < 10000) {
          fs.unlinkSync(filePath);
          failed++;
          logger.warn('[QC-Import] 文件太小跳过: ' + m.title + ' (' + fileSize + 'bytes)');
          continue;
        }

        // 获取视频信息
        let duration = m.duration || 0, width = m.width || 0, height = m.height || 0;
        try {
          const { getVideoInfo } = require('../services/video-merger');
          const info = await getVideoInfo(filePath);
          duration = info.duration || duration;
          width = info.width || width;
          height = info.height || height;
        } catch (e) {}

        // 写入数据库
        await db.query(
          'INSERT INTO qc_video_uploads (title, filename, file_path, file_size, duration, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [m.title, safeName, filePath, fileSize, duration, width, height]
        );

        success++;
        logger.info('[QC-Import] 导入成功: ' + m.title + ' (' + (fileSize / 1024 / 1024).toFixed(1) + 'MB)');
      } catch (e) {
        failed++;
        logger.error('[QC-Import] 导入失败: ' + m.title, { error: e.message });
      }
    }
    logger.info(`[QC-Import] 批量导入完成: 成功${success}, 失败${failed}`);
  })();
});

// ==================== 素材视频上传管理 ====================

// 上传素材视频
router.post('/upload-video', auth(), upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.json({ code: 400, msg: '请选择视频文件' });
    const title = req.body.title || req.file.originalname.replace(/\.[^.]+$/, '');
    const filePath = req.file.path;
    const fileSize = req.file.size;

    // 获取视频信息
    let duration = 0, width = 0, height = 0;
    try {
      const { getVideoInfo } = require('../services/video-merger');
      const info = await getVideoInfo(filePath);
      duration = info.duration || 0;
      width = info.width || 0;
      height = info.height || 0;
    } catch (e) {
      logger.warn('[VideoUpload] 获取视频信息失败', { error: e.message });
    }

    const [result] = await db.query(
      'INSERT INTO qc_video_uploads (title, filename, file_path, file_size, duration, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, req.file.filename, filePath, fileSize, duration, width, height]
    );

    logger.info('[VideoUpload] 上传成功: ' + title + ' (' + (fileSize / 1024 / 1024).toFixed(1) + 'MB)');
    res.json({
      code: 0,
      msg: '上传成功',
      data: {
        id: result.insertId,
        title,
        filename: req.file.filename,
        file_size: fileSize,
        duration,
        width,
        height
      }
    });
  } catch (e) {
    logger.error('[VideoUpload] 上传失败', { error: e.message });
    res.json({ code: 500, msg: '上传失败: ' + e.message });
  }
});

// 获取已上传的素材视频列表
router.get('/uploaded-videos', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, title, filename, file_size, duration, width, height, created_at FROM qc_video_uploads ORDER BY created_at DESC'
    );
    // 检查文件是否存在
    rows.forEach(r => {
      const fp = path.join(UPLOAD_DIR, r.filename);
      r.exists = fs.existsSync(fp);
      r.preview_url = '/api/video-production/uploaded/' + r.filename;
    });
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 提供已上传视频的静态访问
router.get('/uploaded/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('视频不存在');
  res.sendFile(filePath);
});

// 删除已上传的视频
router.delete('/uploaded-video/:id', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT filename FROM qc_video_uploads WHERE id = ?', [req.params.id]);
    if (row) {
      const fp = path.join(UPLOAD_DIR, row.filename);
      try { fs.unlinkSync(fp); } catch (e) {}
      await db.query('DELETE FROM qc_video_uploads WHERE id = ?', [req.params.id]);
    }
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ==================== FFmpeg混剪 ====================

// 获取可用BGM列表
router.get('/bgm/list', auth(), async (req, res) => {
  try {
    const { getAvailableBGMs } = require('../services/video-merger');
    const bgms = getAvailableBGMs();
    res.json({
      code: 0,
      data: bgms.map(b => ({ filename: b.filename, style: b.style })),
      styles: [
        { key: 'rhythm', label: '🎵 节奏动感', desc: '适合产品展示' },
        { key: 'gentle', label: '🎶 舒缓清新', desc: '适合护肤种草' },
        { key: 'energy', label: '🔥 活力激昂', desc: '适合促销卖货' },
        { key: 'none', label: '🔇 无BGM', desc: '' }
      ]
    });
  } catch(e) {
    res.json({ code: 500, msg: e.message });
  }
});

// FFmpeg混剪 - 自动从千川下载素材 + 本地素材混合使用
router.post('/:id/merge', auth(), async (req, res) => {
  const { id } = req.params;
  const bgmStyle = req.body.bgm_style || 'rhythm';
  try {
    const [[plan]] = await db.query('SELECT * FROM qc_video_production WHERE id = ?', [id]);
    if (!plan) return res.json({ code: 404, msg: '方案不存在' });
    if (plan.merge_status === 'merging') return res.json({ code: 400, msg: '正在混剪中，请稍候' });

    let timeline = plan.timeline;
    try { timeline = typeof timeline === 'string' ? JSON.parse(timeline) : timeline; } catch(e) { timeline = []; }
    if (!timeline || !timeline.length) return res.json({ code: 400, msg: '方案时间轴为空' });

    // 立即返回，后台执行
    await db.query('UPDATE qc_video_production SET merge_status = ?, merge_log = ? WHERE id = ?', ['merging', '开始混剪...', id]);
    res.json({ code: 0, msg: '混剪任务已启动，正在准备素材...', data: { merge_status: 'merging' } });

    // 异步执行
    (async () => {
      const downloadedFiles = []; // 记录本次下载的临时文件（混剪后清理）
      try {
        const { mergePlanLocal } = require('../services/video-merger');
        const axios = require('axios');

        const updateLog = (log) => {
          db.query('UPDATE qc_video_production SET merge_log = ? WHERE id = ?', [log, id]).catch(() => {});
        };

        // 1. 收集timeline中所有需要的source
        const neededSources = [...new Set(timeline.map(t => (t.source || '').trim()).filter(Boolean))];
        updateLog('分析方案中的素材引用... 共' + neededSources.length + '个素材');

        // 2. 先检查本地已有素材
        const [localUploads] = await db.query(
          'SELECT id, title, filename, file_path, duration FROM qc_video_uploads ORDER BY created_at DESC'
        );
        const localMap = {}; // title -> file_path
        for (const u of localUploads) {
          const fp = u.file_path || path.join(UPLOAD_DIR, u.filename);
          if (fs.existsSync(fp)) localMap[u.title] = fp;
        }

        // 3. 找出本地缺失的素材
        const missingSources = neededSources.filter(s => !localMap[s]);
        logger.info('[Merge] 本地已有:' + (neededSources.length - missingSources.length) + '个, 需下载:' + missingSources.length + '个');

        // 4. 从千川API下载缺失素材
        if (missingSources.length > 0) {
          updateLog(`从千川平台下载${missingSources.length}个素材中...`);

          // 获取有效token
          const [[account]] = await db.query(
            `SELECT advertiser_id, access_token, refresh_token, token_expires_at FROM qc_accounts WHERE advertiser_id = '${OFFICIAL_ADVERTISER_ID}' AND status=1 AND access_token IS NOT NULL LIMIT 1`
          );

          if (account) {
            let token = account.access_token;
            // 检查token是否过期
            if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
              try {
                const QianChuanAPI = require('../services/qianchuan');
                const APP_SECRET = process.env.APP_SECRET || '67e5c48c38e04c36140c41ce8ad44f5b52c105f1';
                const refreshRes = await QianChuanAPI.refreshToken('1859525766684851', APP_SECRET, account.refresh_token);
                if (refreshRes.code === 0 && refreshRes.data) {
                  token = refreshRes.data.access_token;
                  const expiresAt = new Date(Date.now() + (refreshRes.data.expires_in || 86400) * 1000);
                  await db.query('UPDATE qc_accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE status=1',
                    [token, refreshRes.data.refresh_token || account.refresh_token, expiresAt]);
                }
              } catch (e) {
                logger.warn('[Merge] Token刷新失败', { error: e.message });
              }
            }

            // 遍历千川视频列表找到匹配的素材
            let downloaded = 0;
            const remainingMissing = new Set(missingSources);

            // 辅助函数：用yt-dlp下载单个视频（千川CDN需要yt-dlp处理302重定向）
            const { execFile } = require('child_process');
            async function downloadOneVideo(video, overrideTitle) {
              const title = overrideTitle || video.filename || '';
              try {
                const safeName = 'qc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.mp4';
                const filePath = path.join(UPLOAD_DIR, safeName);
                // 使用yt-dlp下载（能正确处理cc.oceanengine.com的302重定向+CDN鉴权）
                await new Promise((resolve, reject) => {
                  execFile('yt-dlp', [
                    '--no-check-certificate',
                    '-o', filePath,
                    '--no-part',        // 不使用.part临时文件
                    '--socket-timeout', '30',
                    video.url
                  ], { timeout: 180000 }, (err, stdout, stderr) => {
                    if (err) reject(new Error(stderr || err.message));
                    else resolve();
                  });
                });
                if (!fs.existsSync(filePath)) {
                  // yt-dlp可能用了不同扩展名
                  const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.startsWith(safeName.replace('.mp4', '')));
                  if (files.length) {
                    const actual = path.join(UPLOAD_DIR, files[0]);
                    if (actual !== filePath) fs.renameSync(actual, filePath);
                  }
                }
                // 检查是否有unknown_video扩展名的文件
                const baseName = safeName.replace('.mp4', '');
                const allFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.startsWith(baseName));
                if (allFiles.length && !fs.existsSync(filePath)) {
                  fs.renameSync(path.join(UPLOAD_DIR, allFiles[0]), filePath);
                }
                if (!fs.existsSync(filePath)) return false;
                const stat = fs.statSync(filePath);
                if (stat.size < 10000) { fs.unlinkSync(filePath); return false; }
                localMap[title] = filePath;
                remainingMissing.delete(title);
                downloaded++;
                downloadedFiles.push({ filePath, safeName, title });
                logger.info('[Merge] 下载成功: ' + title + ' (' + (stat.size / 1024 / 1024).toFixed(1) + 'MB)');
                return true;
              } catch (dlErr) {
                logger.warn('[Merge] 下载失败: ' + title, { error: dlErr.message });
                return false;
              }
            }

            // 辅助: 千川API搜索
            async function searchQC(keyword, page = 1, pageSize = 20) {
              const apiRes = await axios.get('https://ad.oceanengine.com/open_api/v1.0/qianchuan/video/get/', {
                params: {
                  advertiser_id: String(account.advertiser_id),
                  page, page_size: pageSize,
                  ...(keyword ? { filtering: JSON.stringify({ keyword }) } : {})
                },
                headers: { 'Access-Token': token },
                timeout: 30000
              });
              if (apiRes.data.code !== 0) return [];
              return apiRes.data.data?.list || [];
            }

            // 策略1: 精确搜索每个缺失素材
            for (const missingTitle of [...remainingMissing]) {
              const keyword = missingTitle.replace(/[-_\s.mp4]/g, '').slice(0, 10);
              try {
                updateLog(`搜索素材: ${missingTitle} (已下载${downloaded}/${missingSources.length})`);
                const list = await searchQC(keyword);
                for (const video of list) {
                  if ((video.filename || '') === missingTitle && video.url) {
                    await downloadOneVideo(video);
                    break;
                  }
                }
                await new Promise(r => setTimeout(r, 200));
              } catch (e) {
                logger.warn('[Merge] 搜索失败: ' + keyword, { error: e.message });
              }
            }

            // 策略2: 逐页扫描（精确匹配兜底）
            if (remainingMissing.size > 0) {
              for (let page = 1; page <= 50 && remainingMissing.size > 0; page++) {
                try {
                  updateLog(`逐页扫描... (第${page}页, 剩余${remainingMissing.size}个)`);
                  const list = await searchQC('', page);
                  if (!list.length) break;
                  for (const video of list) {
                    const title = video.filename || '';
                    if (remainingMissing.has(title) && video.url) {
                      await downloadOneVideo(video);
                    }
                  }
                  await new Promise(r => setTimeout(r, 200));
                } catch (e) { break; }
              }
            }

            // 策略3: 仍有缺失时，用模糊匹配从千川随机下载替代素材
            // 确保每个timeline片段都有可用素材（即使不是精确匹配的）
            if (remainingMissing.size > 0) {
              logger.warn('[Merge] 精确匹配未找到: ' + [...remainingMissing].join(', ') + '，启用模糊替代');
              updateLog(`${remainingMissing.size}个素材未精确匹配，正在从千川下载替代素材...`);

              // 从千川下载一批可用素材作为替代（按最新排序，取前几页）
              const substituteVideos = [];
              for (let page = 1; page <= 5; page++) {
                try {
                  const list = await searchQC('', page);
                  if (!list.length) break;
                  for (const v of list) {
                    if (v.url && v.duration >= 5) substituteVideos.push(v);
                  }
                  await new Promise(r => setTimeout(r, 200));
                } catch (e) { break; }
              }

              // 为每个缺失素材分配一个替代视频并下载（用yt-dlp）
              let subIdx = 0;
              for (const missingTitle of [...remainingMissing]) {
                if (subIdx >= substituteVideos.length) break;
                const video = substituteVideos[subIdx++];
                const origTitle = video.filename || '';
                try {
                  updateLog(`下载替代素材: ${origTitle} → 替代 [${missingTitle}]`);
                  // 复用downloadOneVideo，用overrideTitle把localMap key设为missingTitle
                  await downloadOneVideo(video, missingTitle);
                  await new Promise(r => setTimeout(r, 200));
                } catch (e) {
                  logger.warn('[Merge] 替代下载失败', { error: e.message });
                }
              }
            }

            if (remainingMissing.size > 0) {
              logger.warn('[Merge] 最终仍缺失: ' + [...remainingMissing].join(', '));
            }
            updateLog(`素材准备完成: 下载了${downloaded}个, 本地${Object.keys(localMap).length}个可用`);
          } else {
            updateLog('警告: 无千川账号token，使用本地素材混剪');
          }
        }

        // 5. 构建最终素材列表
        const materials = Object.entries(localMap).map(([title, filePath]) => ({
          title,
          video_url: filePath,
          material_id: title,
          is_local: true
        }));

        if (!materials.length) {
          throw new Error('没有可用的素材视频，请确保千川账号已授权');
        }

        updateLog('开始FFmpeg混剪... 共' + materials.length + '个素材');

        const outputPath = await mergePlanLocal({ ...plan, timeline, bgm_style: bgmStyle }, materials, updateLog);

        const fileName = path.basename(outputPath);
        const publicUrl = '/api/video-production/video/' + fileName;

        await db.query(
          'UPDATE qc_video_production SET merge_status = ?, output_video = ?, merge_log = ? WHERE id = ?',
          ['done', publicUrl, '混剪完成', id]
        );
        logger.info('[VideoProduction] 混剪完成 #' + id + ': ' + publicUrl);
      } catch (e) {
        await db.query(
          'UPDATE qc_video_production SET merge_status = ?, merge_log = ? WHERE id = ?',
          ['failed', '混剪失败: ' + e.message, id]
        );
        logger.error('[VideoProduction] 混剪失败 #' + id, { error: e.message });
      } finally {
        // 清理本次下载的千川临时素材文件，释放磁盘空间
        if (downloadedFiles.length > 0) {
          let cleaned = 0, freedMB = 0;
          for (const df of downloadedFiles) {
            try {
              if (fs.existsSync(df.filePath)) {
                const stat = fs.statSync(df.filePath);
                freedMB += stat.size / 1024 / 1024;
                fs.unlinkSync(df.filePath);
                cleaned++;
              }
            } catch (cleanErr) {
              logger.warn('[Merge] 清理临时文件失败: ' + df.filePath, { error: cleanErr.message });
            }
          }
          if (cleaned > 0) {
            logger.info(`[Merge] 清理完成: 删除${cleaned}个临时素材文件, 释放${freedMB.toFixed(1)}MB`);
          }
        }
      }
    })();
  } catch (e) {
    logger.error('[VideoProduction] merge error', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// 查询混剪状态
router.get('/:id/merge-status', auth(), async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT merge_status, output_video, merge_log FROM qc_video_production WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.json({ code: 404, msg: '方案不存在' });
    res.json({ code: 0, data: row });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 提供混剪后视频的静态文件访问
router.get('/video/:filename', (req, res) => {
  const { OUTPUT_DIR } = require('../services/video-merger');
  const filePath = require('path').join(OUTPUT_DIR, req.params.filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).send('视频不存在');
  res.sendFile(filePath);
});

// 删除方案
router.delete('/:id', auth(), async (req, res) => {
  try {
    // 同时删除混剪视频文件
    const [[plan]] = await db.query('SELECT output_video FROM qc_video_production WHERE id = ?', [req.params.id]);
    if (plan && plan.output_video) {
      const { OUTPUT_DIR } = require('../services/video-merger');
      const filePath = require('path').join(OUTPUT_DIR, require('path').basename(plan.output_video));
      try { require('fs').unlinkSync(filePath); } catch(e) {}
    }
    await db.query('DELETE FROM qc_video_production WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== 脚本规范存储 =====================
const SPEC_FILE = path.join(__dirname, '../../data/script-spec.txt');

router.get('/get-spec', auth(), async (req, res) => {
  try {
    if (fs.existsSync(SPEC_FILE)) {
      const spec = fs.readFileSync(SPEC_FILE, 'utf-8');
      res.json({ code: 0, data: { spec } });
    } else {
      res.json({ code: 0, data: { spec: null } });
    }
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.post('/save-spec', auth(), async (req, res) => {
  try {
    const { spec } = req.body;
    if (!spec) return res.json({ code: 400, msg: '规范内容不能为空' });
    const dir = path.dirname(SPEC_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SPEC_FILE, spec, 'utf-8');
    res.json({ code: 0, msg: '保存成功' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===================== 生成详细脚本拍摄流程 =====================
router.post('/generate-script-flow', auth(), async (req, res) => {
  try {
    const { timeline, title, strategy, production_notes } = req.body;
    if (!timeline || !timeline.length) return res.json({ code: 400, msg: '缺少时间轴数据' });

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.aiclaude.xyz/v1';
    const mdl = process.env.OPENAI_MODEL || 'gpt-5';
    if (!apiKey) return res.json({ code: 400, msg: '未配置AI API密钥' });

    // 读取脚本规范
    let scriptSpec = '';
    try {
      if (fs.existsSync(SPEC_FILE)) scriptSpec = fs.readFileSync(SPEC_FILE, 'utf-8');
    } catch {}

    const timelineText = timeline.map((t, i) => {
      return `片段${i+1} [${t.time}] 素材:${t.source}\n  画面:${t.content}\n  口播:${t.narration}\n  营销标签:${t.marketing_text || '无'}\n  保留原声:${t.keep_original_audio ? '是' : '否'}\n  动效:${t.visual_effect || 'static'} 节奏:${t.pace || 'normal'}`;
    }).join('\n\n');

    const prompt = `你是雪玲妃品牌的短视频拍摄导演。请根据以下视频生产方案，输出一份**详细的脚本拍摄流程**，让拍摄团队可以直接照着执行。

${scriptSpec ? '═══ 脚本规范要求（必须遵守）═══\n' + scriptSpec + '\n\n' : ''}
═══ 视频方案信息 ═══
方案名称：${title}
策略：${strategy || ''}
制作要点：${production_notes || '无'}

═══ 时间轴 ═══
${timelineText}

═══ 请输出以下内容 ═══

按照脚本规范要求，对以上时间轴进行完整的拆解和改编：

1. **结构拆解**：分析每个片段的Hook类型、情绪曲线、信息密度、转折机制、信任锚点、转化话术、完播率设计
2. **骨架提取**：提取可复用的骨架公式和时间分配
3. **详细拍摄脚本**：每个片段的：
   - 场景布置（灯光、背景、道具）
   - 机位设置（景别、角度、运动方式）
   - 演员动作指导（表情、手势、走位）
   - 口播文案（逐字稿，标注语气和节奏）
   - 字幕/营销标签位置
   - 转场方式
4. **变体建议**：提供2-3个变体方向

用Markdown格式输出，简洁专业。`;

    const axios = require('axios');
    const resp = await axios.post(baseUrl + '/chat/completions', {
      model: mdl,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.6,
    }, { headers: { Authorization: 'Bearer ' + apiKey }, timeout: 60000 });

    const scriptFlow = resp.data?.choices?.[0]?.message?.content?.trim() || '';
    res.json({ code: 0, data: { script_flow: scriptFlow } });
  } catch (e) {
    logger.error('[VideoProduction] generate-script-flow 失败', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

module.exports = router;
