// 小红书中心 - 内容生产（DeepSeek 仿写 + gpt-image-2 图生图）+ 笔记库
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const publisher = require('../services/xhs-publisher');

const AI_IMAGES_DIR = '/home/www/qianchuan-monitor/ai-images';
const PRODUCT_IMG = path.join(__dirname, '../../assets/xhs-product-white.jpg');

const multer = require('multer');
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => { try { fs.mkdirSync(AI_IMAGES_DIR, { recursive: true }); } catch (e) {} cb(null, AI_IMAGES_DIR); },
  filename: (req, file, cb) => { const ext = path.extname(file.originalname || '') || '.png'; cb(null, `xhsimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`); },
});
const uploadImg = multer({ storage: imgStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// 建表（笔记库）
(async function ensureTable() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS xhs_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) DEFAULT '',
      body TEXT,
      content TEXT,
      image_url VARCHAR(500) DEFAULT '',
      angle VARCHAR(30) DEFAULT '',
      image_style VARCHAR(30) DEFAULT '',
      account VARCHAR(100) DEFAULT '',
      status VARCHAR(20) DEFAULT 'draft',
      xhs_note_id VARCHAR(100) DEFAULT '',
      remark VARCHAR(500) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS xhs_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE,
      logged_in TINYINT DEFAULT 0,
      last_login_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS xhs_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(20) DEFAULT 'product',
      url VARCHAR(500) DEFAULT '',
      name VARCHAR(200) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS xhs_competitor_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) DEFAULT '',
      body TEXT,
      image_url VARCHAR(500) DEFAULT '',
      source VARCHAR(100) DEFAULT '',
      tags VARCHAR(255) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN source_url VARCHAR(300) DEFAULT ''"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN author VARCHAR(100) DEFAULT ''"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN note_id VARCHAR(100) DEFAULT ''"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN publish_date VARCHAR(50) DEFAULT ''"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN avatar VARCHAR(300) DEFAULT ''"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN note_type VARCHAR(20) DEFAULT ''"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN images TEXT"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_notes ADD COLUMN images TEXT"); } catch (e) {}
    // 多产品支持：新建产品表，现有表加 product_id
    await db.query(`CREATE TABLE IF NOT EXISTS xhs_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      brand VARCHAR(100) DEFAULT '',
      description TEXT,
      selling_points TEXT,
      hashtags VARCHAR(500) DEFAULT '',
      default_images TEXT,
      status TINYINT DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await db.query("ALTER TABLE xhs_notes ADD COLUMN product_id INT DEFAULT 0"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_images ADD COLUMN product_id INT DEFAULT 0"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_competitor_notes ADD COLUMN product_id INT DEFAULT 0"); } catch (e) {}
    try { await db.query("ALTER TABLE xhs_images ADD COLUMN source VARCHAR(30) DEFAULT ''"); } catch (e) {}
  } catch (e) { console.error('[xhs] ensureTable:', e.message); }
})();

async function getAiConfig() {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'deepseek_%' OR setting_key LIKE 'gpt55img_%'"
  );
  const c = {};
  rows.forEach(r => { c[r.setting_key] = r.setting_value; });
  return c;
}

const ANGLES = {
  pain: '从用户痛点切入，描述使用前的困扰和使用后的转变，情绪共鸣，突出产品解决的核心问题',
  ingredient: '面向成分党，突出产品核心成分和功效，专业但口语化，转化成真实使用感受描述',
  review: '真实测评口吻，像闺蜜推荐，对比试过多款后的真实感受，突出产品优势和性价比',
  auto: '请根据上面竞品爆款笔记的实际切入角度、人群和卖点，自行判断并采用最契合、最可能爆的角度来写',
};
const STYLES = {
  marble: '把产品放在柔光大理石台面上，背景米白，点缀少量绿叶和水珠，清爽护肤氛围',
  minimal: '产品居中略带倒影，背景为米白到浅金渐变纯色，大量留白，极简ins风',
  life: '把产品放在明亮浴室洗手台上，旁边有折叠毛巾和小绿植，晨间自然光，真实生活感',
};

function parseTitleBody(content) {
  if (!content) return { title: '', body: '' };
  let title = '';
  let body = content.trim();
  const tMatch = content.match(/【?\**\s*标题\s*\**】?\s*[:：]?\s*(.+)/);
  if (tMatch) title = tMatch[1].replace(/[*#]+/g, '').trim();
  const bMatch = content.match(/【?\**\s*正文\s*\**】?\s*[:：]?\s*([\s\S]+)/);
  if (bMatch) body = bMatch[1].trim();
  else if (tMatch) body = content.replace(tMatch[0], '').trim();
  if (!title) {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    title = (lines[0] || '').replace(/[*#【】]/g, '').replace(/^标题[:：]?/, '').trim().slice(0, 40);
  }
  return { title, body };
}

async function genCopy(cfg, angle, refNote, product = {}) {
  const key = cfg.deepseek_api_key;
  const base = (cfg.deepseek_endpoint || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = cfg.deepseek_model || 'deepseek-chat';
  const pName = product.name || '雪玲妃小黑管洗面奶';
  const pPoints = product.selling_points || '黑金氨基酸卸妆洗面奶，洗卸养三合一';
  const pTags = product.hashtags || '#雪玲妃 #雪玲妃洗面奶 #洗面奶 #洁面乳 #雪玲妃小黑管洗面奶';
  const brief = ANGLES[angle] || ANGLES.pain;
  let userPrompt = `写一篇推广【${pName}】的小红书爆款笔记。
角度：${brief}
产品卖点：${pPoints}
要求：小红书真实种草口吻、适当emoji、标题有钩子(20字内)、正文180字内、结尾带话题 ${pTags}。严格按"标题：xxx"换行"正文：xxx"格式输出。`;
  if (refNote && refNote.trim()) {
    userPrompt = `下面是一篇竞品爆款笔记。请先在心里分析它为什么能爆（标题钩子、开头抓人方式、内容结构、卖点呈现角度、情绪/痛点触发），再据此仿写一篇推广【${pName}】的小红书笔记——学它的爆点结构和节奏，但原创不照抄、产品替换成${pName}。\n【竞品爆款笔记】\n${refNote.trim()}\n\n【仿写要求】\n` + userPrompt;
  }
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是资深小红书美妆内容写手，擅长写真实、高互动的爆款种草笔记。' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 1.1
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// 调 gpt-image-2 图生图（含重试）；imgs: [{field, path, name}]，统一设 image/jpeg 类型
async function callEditApi(cfg, prompt, imgs, size) {
  const base = (cfg.gpt55img_endpoint || '').replace(/\/$/, '');
  const model = cfg.gpt55img_model || 'gpt-image-2';
  for (let i = 0; i < 2; i++) {
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      imgs.forEach(im => form.append(im.field, new Blob([fs.readFileSync(im.path)], { type: 'image/jpeg' }), im.name));
      form.append('size', size);
      const res = await fetch(base + '/v1/images/edits', { method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.gpt55img_api_key }, body: form });
      const data = await res.json().catch(() => null);
      const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
      if (b64) return b64;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}
async function genImageB64(cfg, imageStyle, productUrls, refImageUrl, product = {}) {
  const brief = STYLES[imageStyle] || STYLES.marble;
  const pName = product.name || '雪玲妃小黑管洗面奶';
  // 支持多张产品图（正面/背面/质地等），兜底内置图
  const urlArr = Array.isArray(productUrls) ? productUrls : (productUrls ? [productUrls] : []);
  const productPaths = urlArr.map(u => path.join(AI_IMAGES_DIR, path.basename(u))).filter(p => fs.existsSync(p));
  if (!productPaths.length) productPaths.push(PRODUCT_IMG);
  let refPath = '';
  if (refImageUrl) { const rp = path.join(AI_IMAGES_DIR, path.basename(refImageUrl)); if (fs.existsSync(rp)) refPath = rp; }
  // 雪玲妃小黑管核心卖点（图片文字用这些，不能用竞品文案）
  const BRAND_POINTS = product.selling_points
    ? product.selling_points.split(/[\n，,]/).filter(Boolean).slice(0, 4).join(' · ')
    : '洗卸养三合一 · 黑金氨基酸 · 卸妆不残留 · 洗后水润不紧绷';
  // 1. 有竞品参考图 → 多图模仿（学构图/配色/光影，但文字换成品牌卖点）
  if (refPath) {
    const pDesc = productPaths.length > 1 ? `后续 ${productPaths.length} 张是${pName}产品图（含正面、背面、质地等多角度）` : `第二张是${pName}产品图`;
    const mp = `第一张是竞品爆款笔记配图，${pDesc}。
要求：
1. 学习第一张图的构图、布局、配色、光影、拍摄风格和整体氛围；
2. 图片上出现的所有文字标语和卖点，必须全部替换为${pName}的核心卖点：「${BRAND_POINTS}」，禁止保留或参考竞品的任何文案；
3. 产品主体替换成${pName}（完整保留产品外观和包装上的所有文字）；
4. 不得出现竞品产品；
5. 生成小红书风格竖版配图，质感高级。`;
    const refImgs = [{ field: 'image[]', path: refPath, name: 'ref.jpg' }, ...productPaths.map((p, i) => ({ field: 'image[]', path: p, name: `product_${i + 1}.jpg` }))];
    let b64 = await callEditApi(cfg, mp, refImgs, '1024x1536');
    if (b64) return b64;
    b64 = await callEditApi(cfg, mp, refImgs, '1024x1024');
    if (b64) return b64;
  }
  // 2. 兜底：用第一张产品图生成封面
  const sp = `这是${pName}产品图。生成小红书风格竖版封面：完整保留产品外观和包装上所有文字不变；图片标语使用品牌核心卖点「${BRAND_POINTS}」；${brief}，光线柔和、质感高级，竖版构图，顶部留出标题空间。`;
  return await callEditApi(cfg, sp, [{ field: 'image', path: productPaths[0], name: 'product.jpg' }], '1024x1536');
}

// 一键生成：文案 + 配图 → 入库
router.post('/generate', auth(), async (req, res) => {
  try {
    const { angle = 'pain', imageStyle = 'marble', refNote = '', account = '', productImageUrl = '', refImageUrl = '', product_id = 0 } = req.body || {};
    const cfg = await getAiConfig();
    if (!cfg.deepseek_api_key || !cfg.gpt55img_api_key) {
      return res.json({ code: 400, msg: '请先在 系统设置→AI配置 填写 DeepSeek 与 GPT 图像 的 Key' });
    }
    // 加载产品配置
    let product = {};
    if (product_id) {
      try { const [pr] = await db.query("SELECT * FROM xhs_products WHERE id=? AND status=1 LIMIT 1", [product_id]); if (pr.length) product = pr[0]; } catch (e) {}
    }
    // 产品图：传参 > 产品默认图 > 系统默认图
    let usedProductUrls = productImageUrl ? [productImageUrl] : [];
    if (!usedProductUrls.length && product.default_images) {
      try { const imgs = JSON.parse(product.default_images); if (Array.isArray(imgs) && imgs.length) usedProductUrls = imgs; } catch (e) {}
    }
    if (!usedProductUrls.length) {
      try {
        const [defRows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='xhs_default_product' LIMIT 1");
        if (defRows.length && defRows[0].setting_value) {
          try { usedProductUrls = JSON.parse(defRows[0].setting_value); if (!Array.isArray(usedProductUrls)) usedProductUrls = [usedProductUrls]; } catch (e) { usedProductUrls = [defRows[0].setting_value]; }
        }
      } catch (e) {}
    }
    // 文案同步生成（快），先写笔记并立即返回，避免前端等配图超时；配图改后台异步生成
    const content = await genCopy(cfg, angle, refNote, product);
    const { title, body } = parseTitleBody(content);
    const [r] = await db.query(
      "INSERT INTO xhs_notes (title, body, content, image_url, images, angle, image_style, account, status, product_id) VALUES (?,?,?,?,?,?,?,?,'draft',?)",
      [title, body, content, '', '[]', angle, imageStyle, account, product_id || 0]
    );
    const noteId = r.insertId;
    res.json({ code: 0, data: { id: noteId, title, body, content, image: '', angle, imageStyle, status: 'draft', product_id: product_id || 0 } });
    // 配图后台异步生成（GPT图像较慢），完成后回写笔记，不阻塞响应
    (async () => {
      try {
        const b64 = await genImageB64(cfg, imageStyle, usedProductUrls, refImageUrl, product);
        if (!b64) return;
        if (!fs.existsSync(AI_IMAGES_DIR)) fs.mkdirSync(AI_IMAGES_DIR, { recursive: true });
        const fname = `xhs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        fs.writeFileSync(path.join(AI_IMAGES_DIR, fname), Buffer.from(b64, 'base64'));
        const imageUrl = '/ai-images/' + fname;
        try { await db.query("INSERT INTO xhs_images (type, url, name, product_id) VALUES ('generated', ?, ?, ?)", [imageUrl, '模仿生成-' + String(title || '').slice(0, 20), product_id || 0]); } catch (e) {}
        await db.query("UPDATE xhs_notes SET image_url=?, images=? WHERE id=?", [imageUrl, JSON.stringify([imageUrl]), noteId]);
      } catch (e) { /* 配图失败不影响文案 */ }
    })();
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  }
});

// 笔记列表
router.get('/notes', auth(), async (req, res) => {
  try {
    const { status, product_id } = req.query;
    let sql = "SELECT id,title,body,image_url,images,angle,image_style,account,status,xhs_note_id,remark,product_id,created_at FROM xhs_notes";
    const params = [], conds = [];
    if (status) { conds.push('status=?'); params.push(status); }
    if (product_id) { conds.push('product_id=?'); params.push(product_id); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += " ORDER BY id DESC LIMIT 100";
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 笔记详情
router.get('/notes/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM xhs_notes WHERE id=?", [req.params.id]);
    res.json({ code: 0, data: rows[0] || null });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 编辑 / 审核（改标题正文、状态流转 draft/approved/published/failed）
router.put('/notes/:id', auth(), async (req, res) => {
  try {
    const { title, body, status, remark, account, xhs_note_id, images } = req.body || {};
    const sets = [], params = [];
    if (title !== undefined) { sets.push('title=?'); params.push(title); }
    if (body !== undefined) { sets.push('body=?'); params.push(body); }
    if (status !== undefined) { sets.push('status=?'); params.push(status); }
    if (remark !== undefined) { sets.push('remark=?'); params.push(remark); }
    if (account !== undefined) { sets.push('account=?'); params.push(account); }
    if (xhs_note_id !== undefined) { sets.push('xhs_note_id=?'); params.push(xhs_note_id); }
    if (images !== undefined) { sets.push('images=?'); params.push(typeof images === 'string' ? images : JSON.stringify(images)); }
    if (images !== undefined && Array.isArray(images) && images.length) { sets.push('image_url=?'); params.push(images[0]); }
    if (!sets.length) return res.json({ code: 400, msg: '无更新字段' });
    params.push(req.params.id);
    await db.query(`UPDATE xhs_notes SET ${sets.join(',')} WHERE id=?`, params);
    res.json({ code: 0, msg: '已保存' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 删除
router.delete('/notes/:id', auth(), async (req, res) => {
  try {
    await db.query("DELETE FROM xhs_notes WHERE id=?", [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===== 竞品图文 =====
router.get('/competitor', auth(), async (req, res) => {
  try {
    const { product_id } = req.query;
    let csql = "SELECT id,title,body,image_url,images,source,tags,source_url,author,note_id,publish_date,avatar,note_type,product_id,created_at FROM xhs_competitor_notes";
    const cpar = [];
    if (product_id) { csql += " WHERE product_id=?"; cpar.push(product_id); }
    csql += " ORDER BY id DESC LIMIT 200";
    const [rows] = await db.query(csql, cpar);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.post('/competitor', auth(), async (req, res) => {
  try {
    const { title = '', body = '', image_url = '', source = '', tags = '', product_id = 0 } = req.body || {};
    if (!title.trim() && !body.trim()) return res.json({ code: 400, msg: '标题或正文至少填一个' });
    const [r] = await db.query("INSERT INTO xhs_competitor_notes (title,body,image_url,source,tags,product_id) VALUES (?,?,?,?,?,?)", [title, body, image_url, source, tags, product_id || 0]);
    res.json({ code: 0, data: { id: r.insertId } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.delete('/competitor/:id', auth(), async (req, res) => {
  try { await db.query("DELETE FROM xhs_competitor_notes WHERE id=?", [req.params.id]); res.json({ code: 0, msg: '已删除' }); }
  catch (e) { res.json({ code: 500, msg: e.message }); }
});
// 更新竞品笔记（未传字段保持原值）
router.put('/competitor/:id', auth(), async (req, res) => {
  try {
    const [[old]] = await db.query("SELECT * FROM xhs_competitor_notes WHERE id=?", [req.params.id]);
    if (!old) return res.json({ code: 404, msg: '笔记不存在' });
    const b = req.body || {};
    const v = (k) => (b[k] !== undefined ? b[k] : old[k]);
    await db.query("UPDATE xhs_competitor_notes SET title=?,body=?,image_url=?,source=?,tags=?,product_id=? WHERE id=?",
      [v('title'), v('body'), v('image_url'), v('source'), v('tags'), v('product_id') || 0, req.params.id]);
    res.json({ code: 0, msg: '已更新' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
// 采集设置：插件采集的竞品笔记自动归入的产品（存 system_settings）
router.get('/collect-setting', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='xhs_collect_product_id' LIMIT 1");
    const product_id = rows.length ? (parseInt(rows[0].setting_value) || 0) : 0;
    res.json({ code: 0, data: { product_id } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.post('/collect-setting', auth(), async (req, res) => {
  try {
    const pid = String(parseInt((req.body && req.body.product_id) || 0) || 0);
    await db.query("INSERT INTO system_settings(setting_key,setting_value) VALUES('xhs_collect_product_id',?) ON DUPLICATE KEY UPDATE setting_value=?", [pid, pid]);
    res.json({ code: 0, msg: 'ok' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===== 浏览器插件采集（插件在用户已登录浏览器抓数据后发来，密钥验证、不走登录态）=====
function pluginCors(res) { res.set('Access-Control-Allow-Origin', '*').set('Access-Control-Allow-Headers', 'content-type').set('Access-Control-Allow-Methods', 'POST,OPTIONS'); }
router.options('/plugin-collect', (req, res) => { pluginCors(res); res.sendStatus(204); });
// 下载小红书图片到本地（带 referer 绕防盗链 + http转https + 持久化，避免混合内容/过期）
async function downloadXhsImg(url) {
  try {
    if (!url) return '';
    const httpsUrl = String(url).replace(/^http:/, 'https:');
    const r = await fetch(httpsUrl, { headers: { 'referer': 'https://www.xiaohongshu.com/', 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (!fs.existsSync(AI_IMAGES_DIR)) fs.mkdirSync(AI_IMAGES_DIR, { recursive: true });
    const fname = `xhscomp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    fs.writeFileSync(path.join(AI_IMAGES_DIR, fname), buf);
    return '/ai-images/' + fname;
  } catch (e) { return ''; }
}
router.post('/plugin-collect', async (req, res) => {
  pluginCors(res);
  try {
    const { secret, notes = [] } = req.body || {};
    if (secret !== 'xhs-collect-2026') return res.json({ code: 403, msg: '密钥错误' });
    let n = 0;
    for (const note of notes) {
      if (!note || (!note.title && !note.body)) continue;
      const srcImages = (Array.isArray(note.images) && note.images.length) ? note.images : (note.image ? [note.image] : []);
      const localImages = [];
      for (const u of srcImages.slice(0, 9)) { const li = await downloadXhsImg(u); if (li) localImages.push(li); }
      const cover = localImages[0] || '';
      const imagesJson = JSON.stringify(localImages);
      const avatarUrl = String(note.avatar || '').replace(/^http:/, 'https:').slice(0, 290);
      const noteId = String(note.noteId || '');
      // 详情数据(多图>1 或 有正文)更全，覆盖之前列表采的封面版
      const isDetail = localImages.length > 1 || (note.body && note.body.length > 20 && !/^点赞/.test(note.body));
      try {
        let existed = false;
        if (noteId) {
          const [ex] = await db.query("SELECT id FROM xhs_competitor_notes WHERE note_id=? LIMIT 1", [noteId]);
          if (ex.length) {
            existed = true;
            if (isDetail) {
              await db.query("UPDATE xhs_competitor_notes SET title=?,body=?,image_url=?,images=?,avatar=?,note_type=? WHERE id=?",
                [String(note.title || '').slice(0, 250), String(note.body || '').slice(0, 2000), cover, imagesJson, avatarUrl, String(note.noteType || '').slice(0, 20), ex[0].id]);
              n++;
            }
          }
        }
        if (!existed) {
          await db.query("INSERT INTO xhs_competitor_notes (title,body,image_url,images,source,tags,source_url,author,note_id,publish_date,avatar,note_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [String(note.title || '').slice(0, 250), String(note.body || '').slice(0, 2000), cover, imagesJson, String(note.source || '插件采集').slice(0, 90), String(note.tags || '').slice(0, 250), String(note.link || '').slice(0, 290), String(note.author || '').slice(0, 90), noteId.slice(0, 90), String(note.publishDate || '').slice(0, 40), avatarUrl, String(note.noteType || '').slice(0, 20)]);
          n++;
        }
      } catch (e) {}
    }
    res.json({ code: 0, data: { inserted: n } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 插件：图片采集（爆款图入库）
router.options('/plugin-images', (req, res) => { pluginCors(res); res.sendStatus(204); });
router.post('/plugin-images', async (req, res) => {
  pluginCors(res);
  try {
    const { secret, images = [], product_id = 0 } = req.body || {};
    if (secret !== 'xhs-collect-2026') return res.json({ code: 403, msg: '密钥错误' });
    if (!Array.isArray(images) || !images.length) return res.json({ code: 400, msg: '未收到图片' });
    console.log('[plugin-images] 收到 ' + images.length + ' 张, product_id=' + product_id + ', sample:', String(images[0] || '').slice(0, 120));
    let n = 0, fails = [];
    for (const url of images.slice(0, 30)) {
      const localUrl = await downloadXhsImg(url);
      if (!localUrl) { fails.push(String(url).slice(0, 80)); continue; }
      try {
        await db.query("INSERT INTO xhs_images (type, url, name, product_id) VALUES ('hot', ?, ?, ?)",
          [localUrl, '爆款图-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), Number(product_id) || 0]);
        n++;
      } catch (e) { fails.push(String(url).slice(0, 80) + ' DB:' + e.message); }
    }
    if (fails.length) console.warn('[plugin-images] 失败 ' + fails.length + ' 个, 前2:', fails.slice(0, 2));
    res.json({ code: 0, data: { saved: n, inserted: n, total: images.length, failed: fails.length }, saved: n });
  } catch (e) {
    console.error('[plugin-images] err:', e.message);
    res.json({ code: 500, msg: e.message });
  }
});

// 插件：拉产品列表（供插件下拉选择"采集归属产品"）
router.options('/plugin-products', (req, res) => { pluginCors(res); res.sendStatus(204); });
router.get('/plugin-products', async (req, res) => {
  pluginCors(res);
  try {
    if (req.query.secret !== 'xhs-collect-2026') return res.json({ code: 403, msg: '密钥错误' });
    const [rows] = await db.query("SELECT id, name FROM xhs_products WHERE status IS NULL OR status=1 ORDER BY sort_order ASC, id ASC");
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===== 图片管理 =====
router.post('/images/upload', auth(), uploadImg.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.json({ code: 400, msg: '未收到文件' });
    const { type = 'product', product_id = 0 } = req.body || {};
    const url = '/ai-images/' + req.file.filename;
    const [r] = await db.query("INSERT INTO xhs_images (type, url, name, product_id) VALUES (?,?,?,?)", [type, url, req.file.originalname || '', product_id || 0]);
    res.json({ code: 0, data: { id: r.insertId, url, type } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.get('/images', auth(), async (req, res) => {
  try {
    const { type, product_id } = req.query;
    let sql = "SELECT id,type,url,name,product_id,created_at FROM xhs_images";
    const params = [], iconds = [];
    if (type) { iconds.push('type=?'); params.push(type); }
    if (product_id) { iconds.push('product_id=?'); params.push(product_id); }
    if (iconds.length) sql += ' WHERE ' + iconds.join(' AND ');
    sql += " ORDER BY id DESC LIMIT 200";
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.delete('/images/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT url FROM xhs_images WHERE id=?", [req.params.id]);
    await db.query("DELETE FROM xhs_images WHERE id=?", [req.params.id]);
    if (rows[0] && rows[0].url) { try { fs.unlinkSync(path.join(AI_IMAGES_DIR, path.basename(rows[0].url))); } catch (e) {} }
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 设置/读取默认产品图（多张，toggle 模式）
router.post('/images/set-default', auth(), async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.json({ code: 400, msg: '缺少 url' });
    const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='xhs_default_product' LIMIT 1");
    let list = [];
    if (rows.length && rows[0].setting_value) { try { list = JSON.parse(rows[0].setting_value); if (!Array.isArray(list)) list = [list]; } catch (e) { list = [rows[0].setting_value]; } }
    const idx = list.indexOf(url);
    const action = idx >= 0 ? (list.splice(idx, 1), 'removed') : (list.push(url), 'added');
    const val = JSON.stringify(list);
    await db.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('xhs_default_product',?) ON DUPLICATE KEY UPDATE setting_value=?", [val, val]);
    res.json({ code: 0, data: list, msg: action === 'added' ? '已加入默认产品图' : '已取消默认' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.get('/images/default', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='xhs_default_product' LIMIT 1");
    let list = [];
    if (rows.length && rows[0].setting_value) { try { list = JSON.parse(rows[0].setting_value); if (!Array.isArray(list)) list = [list]; } catch (e) { list = [rows[0].setting_value]; } }
    res.json({ code: 0, data: list });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// AI 图片生成（勾选图 + 尺寸 + 模式[模仿/组产品] → gpt-image-2 多图）
router.post('/images/ai-generate', auth(), async (req, res) => {
  try {
    const { imageUrls = [], size = '1024x1024', mode = 'imitate', prompt = '', productUrl = '' } = req.body || {};
    if (!imageUrls.length) return res.json({ code: 400, msg: '请至少勾选一张图片' });
    const cfg = await getAiConfig();
    if (!cfg.gpt55img_api_key) return res.json({ code: 400, msg: '请先在 系统设置→AI配置 填写 GPT 图像 Key' });
    const base = (cfg.gpt55img_endpoint || '').replace(/\/$/, '');
    const model = cfg.gpt55img_model || 'gpt-image-2';
    let bp = mode === 'compose'
      ? '把这些产品图组合成一张精美的小红书电商产品图，构图协调、光线柔和、质感高级，完整保留产品外观和包装文字'
      : '参考提供图片中爆款图的风格、构图、配色和排版，生成一张同风格的小红书图片；产品必须用提供的产品图（雪玲妃黑金洗面奶），完整保留产品外观和包装上的文字，不要凭空编造产品';
    if (prompt && prompt.trim()) bp += '。额外要求：' + prompt.trim();
    const allUrls = [...imageUrls];
    if (mode === 'imitate' && productUrl) allUrls.push(productUrl);
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', bp);
    form.append('size', size);
    let cnt = 0;
    for (const url of allUrls) {
      const p = path.join(AI_IMAGES_DIR, path.basename(url));
      if (fs.existsSync(p)) {
        const ext = (path.extname(p).slice(1) || 'png').toLowerCase();
        form.append('image[]', new Blob([fs.readFileSync(p)], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }), path.basename(p));
        cnt++;
      }
    }
    if (!cnt) return res.json({ code: 400, msg: '勾选的图片文件不存在' });
    const r = await fetch(base + '/v1/images/edits', { method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.gpt55img_api_key }, body: form });
    const data = await r.json();
    const b64 = data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) return res.json({ code: 500, msg: '生成失败：' + ((data.error && data.error.message) || JSON.stringify(data).slice(0, 150)) });
    const fname = `xhsgen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    fs.writeFileSync(path.join(AI_IMAGES_DIR, fname), Buffer.from(b64, 'base64'));
    const imageUrl = '/ai-images/' + fname;
    await db.query("INSERT INTO xhs_images (type, url, name) VALUES ('generated', ?, ?)", [imageUrl, mode === 'compose' ? '组产品生成' : '模仿生成']);
    res.json({ code: 0, data: { url: imageUrl } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===== 产品管理 =====
router.get('/products', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id,name,brand,description,selling_points,hashtags,default_images,status,sort_order,created_at FROM xhs_products ORDER BY sort_order ASC, id ASC");
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.post('/products', auth(), async (req, res) => {
  try {
    const { name, brand = '', description = '', selling_points = '', hashtags = '', default_images = '[]', sort_order = 0 } = req.body || {};
    if (!name || !name.trim()) return res.json({ code: 400, msg: '产品名称必填' });
    const [r] = await db.query("INSERT INTO xhs_products (name,brand,description,selling_points,hashtags,default_images,sort_order) VALUES (?,?,?,?,?,?,?)", [name.trim(), brand, description, selling_points, hashtags, typeof default_images === 'string' ? default_images : JSON.stringify(default_images), sort_order]);
    res.json({ code: 0, data: { id: r.insertId } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.put('/products/:id', auth(), async (req, res) => {
  try {
    const { name, brand, description, selling_points, hashtags, default_images, status, sort_order } = req.body || {};
    const sets = [], params = [];
    if (name !== undefined) { sets.push('name=?'); params.push(name); }
    if (brand !== undefined) { sets.push('brand=?'); params.push(brand); }
    if (description !== undefined) { sets.push('description=?'); params.push(description); }
    if (selling_points !== undefined) { sets.push('selling_points=?'); params.push(selling_points); }
    if (hashtags !== undefined) { sets.push('hashtags=?'); params.push(hashtags); }
    if (default_images !== undefined) { sets.push('default_images=?'); params.push(typeof default_images === 'string' ? default_images : JSON.stringify(default_images)); }
    if (status !== undefined) { sets.push('status=?'); params.push(status); }
    if (sort_order !== undefined) { sets.push('sort_order=?'); params.push(sort_order); }
    if (!sets.length) return res.json({ code: 400, msg: '无更新字段' });
    params.push(req.params.id);
    await db.query(`UPDATE xhs_products SET ${sets.join(',')} WHERE id=?`, params);
    res.json({ code: 0, msg: '已保存' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.delete('/products/:id', auth(), async (req, res) => {
  try {
    await db.query("DELETE FROM xhs_products WHERE id=?", [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===== 账号管理 =====
router.get('/accounts', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id,name,logged_in,last_login_at,created_at FROM xhs_accounts ORDER BY id DESC");
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.post('/accounts', auth(), async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.json({ code: 400, msg: '账号名必填' });
  try {
    const [r] = await db.query("INSERT INTO xhs_accounts (name) VALUES (?)", [name.trim()]);
    res.json({ code: 0, data: { id: r.insertId } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ code: 400, msg: '账号已存在' });
    res.json({ code: 500, msg: e.message });
  }
});
router.delete('/accounts/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT name FROM xhs_accounts WHERE id=?", [req.params.id]);
    await db.query("DELETE FROM xhs_accounts WHERE id=?", [req.params.id]);
    if (rows[0]) { try { fs.rmSync(publisher.profilePath(rows[0].name), { recursive: true, force: true }); } catch (e) {} }
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ===== 扫码登录 =====
router.post('/login/start', auth(), async (req, res) => {
  try {
    const { account = 'default' } = req.body || {};
    const r = await publisher.startLogin(account);
    res.json({ code: 0, data: r });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});
router.get('/login/status', auth(), async (req, res) => {
  const { account = 'default' } = req.query;
  const st = publisher.getStatus(account);
  if (st.status === 'success') { try { await db.query("UPDATE xhs_accounts SET logged_in=1,last_login_at=NOW() WHERE name=?", [account]); } catch (e) {} }
  res.json({ code: 0, data: st });
});
router.get('/login/check', auth(), async (req, res) => {
  try {
    const { account = 'default' } = req.query;
    const ok = await publisher.checkLoggedIn(account);
    res.json({ code: 0, data: { loggedIn: ok } });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ─── 插件：商城图片保存（淘宝/天猫/京东，插件直接传 CDN URL 过来）────────────
router.options('/plugin-shop-images', (req, res) => { pluginCors(res); res.sendStatus(204); });
router.post('/plugin-shop-images', async (req, res) => {
  pluginCors(res);
  try {
    const { secret, images = [], product_id = 0, source = '电商平台' } = req.body || {};
    if (secret !== 'xhs-collect-2026') return res.json({ code: 403, msg: '密钥错误' });
    if (!images.length) return res.json({ code: 400, msg: '没有图片' });
    try { fs.mkdirSync(AI_IMAGES_DIR, { recursive: true }); } catch (e) {}
    let saved = 0, failed = 0;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Referer': source === '京东' ? 'https://www.jd.com/' : 'https://www.taobao.com/',
    };
    for (const cdnUrl of images.slice(0, 30)) {
      try {
        const resp = await axios.get(cdnUrl, { responseType: 'arraybuffer', timeout: 15000, headers });
        const ext = (cdnUrl.match(/\.(jpg|png|jpeg|webp)$/i) || ['', 'jpg'])[1].toLowerCase();
        const filename = `shopimg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        fs.writeFileSync(path.join(AI_IMAGES_DIR, filename), Buffer.from(resp.data));
        await db.query(
          "INSERT INTO xhs_images (type, url, name, product_id, source) VALUES ('hot', ?, ?, ?, ?)",
          ['/ai-images/' + filename, source + '-' + filename.slice(0, 18), product_id || 0, source]
        );
        saved++;
      } catch (e) { failed++; }
    }
    res.json({ code: 0, data: { saved, failed }, msg: `已保存 ${saved} 张` });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// ─── 天猫/淘宝/京东图片采集 ─────────────────────────────────────────────────

// 通用图片URL提取
function extractShopImgs(html, platform) {
  const imgs = new Set();

  if (platform === 'jd') {
    // 京东：图片主要在 colorImages / mainImgUrl 字段
    (html.match(/\/\/img\d*\.360buyimg\.com\/n[0-9]+\/[^"'\s,]+\.(?:jpg|png|jpeg)/g) || [])
      .forEach(u => imgs.add('https:' + u.split('!')[0].split('?')[0]));
    (html.match(/"mainImgUrl"\s*:\s*"([^"]+)"/g) || [])
      .forEach(m => { const u = m.match(/:"([^"]+)"/)[1]; if (u.startsWith('//')) imgs.add('https:' + u.split('?')[0]); });
  } else {
    // 淘宝/天猫: img.alicdn.com
    (html.match(/\/\/img\.alicdn\.com\/imgextra\/[^"'\s,]+\.(?:jpg|png|jpeg)/g) || [])
      .forEach(u => imgs.add('https:' + u.split('?')[0]));
    (html.match(/\/\/img\.alicdn\.com\/bao\/uploaded\/[^"'\s,]+\.(?:jpg|png|jpeg)/g) || [])
      .forEach(u => imgs.add('https:' + u.split('?')[0]));
    (html.match(/"(?:img|pic_path|picsPath)"\s*:\s*"(\/\/[^"]+\.(?:jpg|png|jpeg))"/g) || [])
      .forEach(m => { const u = m.match(/:"([^"]+)"/)[1]; imgs.add('https:' + u.split('?')[0]); });
  }

  // 过滤缩略图和icon
  const exclude = ['_50x50', '_100x100', '_160x160', '_200x200', 'gif', 'icon', 'logo', 'avatar', 'banner'];
  return [...imgs].filter(u => !exclude.some(k => u.includes(k))).slice(0, 40);
}

router.post('/scrape-taobao', auth(), async (req, res) => {
  let { url } = req.body;
  if (!url) return res.json({ code: 400, msg: '请输入商品链接' });

  // 识别平台
  let platform = 'taobao';
  if (/tmall\.com/.test(url)) platform = 'tmall';
  else if (/jd\.com/.test(url)) platform = 'jd';
  else if (!/(taobao|tmall|jd)\.com/.test(url)) return res.json({ code: 400, msg: '仅支持淘宝/天猫/京东链接' });

  try {
    const resp = await axios.get(url, {
      timeout: 18000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': platform === 'jd' ? 'https://www.jd.com/' : 'https://www.taobao.com/',
        'Cache-Control': 'no-cache',
      },
    });
    const imgs = extractShopImgs(resp.data, platform);
    if (!imgs.length) return res.json({ code: 0, data: [], msg: '未找到图片，该平台可能需要登录或链接不是商品页' });
    res.json({ code: 0, data: imgs, platform });
  } catch (e) {
    res.json({ code: 500, msg: '采集失败：' + (e.response ? `HTTP ${e.response.status}` : e.message) });
  }
});

// 下载并保存选中图片到 xhs_images
router.post('/save-taobao-images', auth(), async (req, res) => {
  const { urls = [], product_id = 0, source = '淘宝/天猫' } = req.body;
  if (!urls.length) return res.json({ code: 400, msg: '没有图片' });
  try { fs.mkdirSync(AI_IMAGES_DIR, { recursive: true }); } catch (e) {}

  const saved = [], failed = [];
  for (const cdnUrl of urls.slice(0, 20)) {
    try {
      const resp2 = await axios.get(cdnUrl, {
        responseType: 'arraybuffer', timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.taobao.com/' },
      });
      const ext = (cdnUrl.match(/\.(jpg|png|jpeg|webp)$/i) || [, 'jpg'])[1].toLowerCase();
      const filename = `tbimg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      fs.writeFileSync(path.join(AI_IMAGES_DIR, filename), Buffer.from(resp2.data));
      const localUrl = '/ai-images/' + filename;
      const name = source + '-' + filename.slice(0, 20);
      const [r] = await db.query(
        "INSERT INTO xhs_images (type, url, name, product_id, source) VALUES ('taobao', ?, ?, ?, ?)",
        [localUrl, name, product_id || 0, source]
      );
      saved.push({ id: r.insertId, url: localUrl });
    } catch (e) { failed.push(cdnUrl); }
  }
  res.json({ code: 0, data: { saved, failed_count: failed.length }, msg: `成功保存 ${saved.length} 张` });
});

module.exports = router;
