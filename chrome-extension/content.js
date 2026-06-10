// 雪玲妃·竞品采集插件 v2 — content.js
// 支持：小红书（笔记）/ 淘宝 / 天猫 / 京东（商品图片）

const API_BASE = 'https://business.snefe.com/api/xhs';
const SECRET   = 'xhs-collect-2026';

const PLATFORM = (() => {
  const h = location.hostname;
  if (h.includes('xiaohongshu.com')) return 'xhs';
  if (h.includes('taobao.com'))      return 'taobao';
  if (h.includes('tmall.com'))       return 'tmall';
  if (h.includes('jd.com'))          return 'jd';
  return null;
})();

if (!PLATFORM) { /* 不在目标页 */ } else if (PLATFORM === 'xhs') {
  initXhs();
} else {
  // 等 DOM 稳定再提取
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShop);
  } else {
    setTimeout(initShop, 1500);
  }
}

/* ══════════════════════════════════════════════
   小红书 笔记采集
══════════════════════════════════════════════ */
function initXhs() {
  const queue = {}; // noteId → noteObj

  // 接收 inject-loader.js 拦截的 API 数据
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== '__SNEFE_XHS_DATA__') return;
    parseXhsData(e.data.data, queue);
    updateXhsBtn();
  });

  // 浮动按钮
  const btn = document.createElement('div');
  btn.id = '__snefe_xhs_btn__';
  btn.style.cssText = btnStyle('#ff2442');
  btn.textContent = '采集到系统 (0)';
  btn.addEventListener('click', submitXhs);
  document.body.appendChild(btn);

  function updateXhsBtn() {
    const n = Object.keys(queue).length;
    btn.textContent = `采集到系统 (${n})`;
    btn.style.display = n > 0 ? 'block' : 'none';
  }

  async function submitXhs() {
    const notes = Object.values(queue);
    if (!notes.length) return;
    btn.textContent = '提交中…';
    try {
      const r = await apiFetch('/plugin-collect', { secret: SECRET, notes });
      if (r.code === 0) {
        Object.keys(queue).forEach(k => delete queue[k]);
        updateXhsBtn();
        toast(`✓ 已入库 ${r.data?.inserted || notes.length} 条笔记`);
      } else {
        toast('提交失败：' + (r.msg || ''), true);
      }
    } catch (ex) {
      toast('网络错误：' + ex.message, true);
    }
    updateXhsBtn();
  }
}

function parseXhsData(data, queue) {
  // 从各种 API 响应结构中提取笔记
  const items = [];
  // /feed 返回 data.items[]
  if (data?.data?.items) items.push(...data.data.items);
  // /note 详情返回 data.data
  if (data?.data?.note_list) items.push(...data.data.note_list);
  if (data?.data?.id) items.push(data.data);

  for (const item of items) {
    const note = item.note_card || item;
    if (!note) continue;
    const noteId = note.id || note.note_id || item.id;
    if (!noteId) continue;

    const imgs = [];
    const imageList = note.image_list || note.images || [];
    for (const img of imageList) {
      const url = img.url || img.url_default || (img.info_list?.[0]?.url) || '';
      if (url) imgs.push(url.replace(/\?imageView.*$/, ''));
    }

    const desc = note.desc || note.title || '';
    const title = (note.title || desc || '').slice(0, 250);
    const body = desc.slice(0, 2000);
    const author = note.user?.nickname || note.author?.nickname || '';
    const avatar = note.user?.avatar || note.author?.avatar || '';
    const likes = note.interact_info?.liked_count || 0;

    queue[noteId] = {
      noteId,
      title,
      body: body || (likes ? `点赞：${likes}` : ''),
      image: imgs[0] || '',
      images: imgs,
      author,
      avatar,
      source: '插件采集-小红书',
      link: `https://www.xiaohongshu.com/explore/${noteId}`,
      noteType: (imgs.length > 0 && !note.video) ? 'image' : (note.video ? 'video' : ''),
    };
  }
}

/* ══════════════════════════════════════════════
   淘宝 / 天猫 / 京东 商品图片采集
══════════════════════════════════════════════ */
let shopImages    = [];
let shopProducts  = [];
let shopProductId = 0;
let shopPanel     = null;

async function initShop() {
  shopImages = extractShopImages();
  if (!shopImages.length) return; // 不像商品页，不显示按钮

  shopProducts = await fetchProducts();

  // 悬浮按钮
  const btn = document.createElement('div');
  btn.id = '__snefe_shop_btn__';
  btn.style.cssText = btnStyle('#ff6900');
  btn.textContent = `🛒 采集图片 (${shopImages.length})`;
  btn.addEventListener('click', () => {
    if (shopPanel) { shopPanel.remove(); shopPanel = null; return; }
    openShopPanel();
  });
  document.body.appendChild(btn);
}

function extractShopImages() {
  const imgs = new Set();

  if (PLATFORM === 'jd') {
    // JD：从 script 中提取
    document.querySelectorAll('script').forEach(s => {
      (s.textContent.match(/\/\/img\d*\.360buyimg\.com\/[^"'\s,\)]+\.(?:jpg|png|jpeg)/g) || [])
        .forEach(u => {
          const clean = 'https:' + u.replace(/\/s\d+x\d+_/, '/n1/').split('!')[0];
          imgs.add(clean);
        });
    });
    // DOM 备用
    document.querySelectorAll('#spec-n1 img, .imgboxbig img, .spec-list img').forEach(el => {
      const src = (el.src || el.dataset.src || '').split('!')[0].split('?')[0];
      if (src.includes('360buyimg')) imgs.add(src.replace(/\/s\d+x\d+_/, '/n1/'));
    });
  } else {
    // 淘宝/天猫：从 script JSON 中提取
    document.querySelectorAll('script').forEach(s => {
      const txt = s.textContent;
      // 抓 alicdn 图片 URL
      (txt.match(/\/\/img\.alicdn\.com\/(?:imgextra|bao\/uploaded)\/[^"'\s,\)]+\.(?:jpg|png|jpeg)/g) || [])
        .forEach(u => {
          const clean = 'https:' + u.split('?')[0].replace(/_\d+x\d+\.(jpg|png)/g, '.$1');
          if (!clean.includes('_50x50') && !clean.includes('icon')) imgs.add(clean);
        });
    });
    // DOM 缩略图（上传后的全尺寸）
    document.querySelectorAll('#J_UlThumb img, .J_Thumb img, .img-list img').forEach(el => {
      let src = (el.src || el.dataset.src || '').split('?')[0];
      if (src.includes('alicdn')) {
        src = src.replace(/_\d+x\d+\.(jpg|png)/g, '.$1');
        if (!src.includes('_50x50')) imgs.add(src);
      }
    });
  }

  // 过滤 gif / logo / icon / 小于合理的图
  return [...imgs].filter(u =>
    !u.includes('.gif') && !u.includes('logo') && !u.includes('icon') &&
    !u.includes('avatar') && !u.includes('blank.') && !u.includes('_50x50')
  ).slice(0, 40);
}

function openShopPanel() {
  shopImages = extractShopImages(); // 重新提取（可能页面有懒加载）

  const panel = document.createElement('div');
  panel.id = '__snefe_shop_panel__';
  panel.style.cssText = `
    position:fixed;right:0;top:0;bottom:0;width:400px;background:#fff;
    box-shadow:-4px 0 24px rgba(0,0,0,.18);z-index:2147483646;
    display:flex;flex-direction:column;font-family:system-ui,sans-serif;
  `;

  const platformName = { taobao: '淘宝', tmall: '天猫', jd: '京东' }[PLATFORM] || PLATFORM;

  panel.innerHTML = `
    <div style="padding:14px 16px;background:#ff6900;color:#fff;display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <span style="font-size:15px;font-weight:700;flex:1;">🛒 ${platformName}图片采集</span>
      <span id="__snefe_close__" style="cursor:pointer;font-size:20px;line-height:1;">×</span>
    </div>
    <div style="padding:10px 14px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <span style="font-size:13px;color:#555;white-space:nowrap;">归属产品：</span>
      <select id="__snefe_prod__" style="flex:1;height:30px;border:1px solid #ddd;border-radius:6px;padding:0 8px;font-size:13px;">
        <option value="0">不指定</option>
        ${shopProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>
    </div>
    <div style="padding:8px 10px;background:#fff8f2;border-bottom:1px solid #ffe4cc;display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:12px;color:#888;">
      <span id="__snefe_sel_cnt__">已选 0 / ${shopImages.length} 张</span>
      <a id="__snefe_sel_all__" style="color:#ff6900;cursor:pointer;text-decoration:underline;">全选</a>
      <a id="__snefe_sel_none__" style="color:#999;cursor:pointer;text-decoration:underline;">清空</a>
    </div>
    <div id="__snefe_grid__" style="flex:1;overflow-y:auto;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;"></div>
    <div style="padding:12px 14px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;">
      <button id="__snefe_save__" style="background:#ff6900;color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:14px;font-weight:600;cursor:pointer;">💾 保存选中图片</button>
    </div>
  `;

  // 渲染图片格
  const grid = panel.querySelector('#__snefe_grid__');
  const selected = new Set(shopImages.map((_, i) => i)); // 默认全选

  function renderGrid() {
    grid.innerHTML = shopImages.map((url, i) => `
      <div data-i="${i}" style="
        aspect-ratio:1;border-radius:6px;overflow:hidden;cursor:pointer;position:relative;
        border:2.5px solid ${selected.has(i) ? '#ff6900' : 'transparent'};
        background:#f5f5f5;
      ">
        <img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.opacity='.3'">
        ${selected.has(i) ? '<span style="position:absolute;top:3px;right:3px;width:18px;height:18px;background:#ff6900;border-radius:50%;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;">✓</span>' : ''}
      </div>
    `).join('');
    panel.querySelector('#__snefe_sel_cnt__').textContent = `已选 ${selected.size} / ${shopImages.length} 张`;
  }
  renderGrid();

  grid.addEventListener('click', e => {
    const item = e.target.closest('[data-i]');
    if (!item) return;
    const i = parseInt(item.dataset.i);
    selected.has(i) ? selected.delete(i) : selected.add(i);
    renderGrid();
  });

  panel.querySelector('#__snefe_sel_all__').addEventListener('click', () => {
    shopImages.forEach((_, i) => selected.add(i)); renderGrid();
  });
  panel.querySelector('#__snefe_sel_none__').addEventListener('click', () => {
    selected.clear(); renderGrid();
  });
  panel.querySelector('#__snefe_close__').addEventListener('click', () => {
    panel.remove(); shopPanel = null;
  });

  const saveBtn = panel.querySelector('#__snefe_save__');
  saveBtn.addEventListener('click', async () => {
    const urls = [...selected].map(i => shopImages[i]).filter(Boolean);
    if (!urls.length) { toast('请先选择图片', true); return; }
    const pid = parseInt(panel.querySelector('#__snefe_prod__').value) || 0;
    saveBtn.textContent = '保存中…'; saveBtn.disabled = true;
    try {
      const r = await apiFetch('/plugin-shop-images', {
        secret: SECRET, images: urls, product_id: pid,
        source: { taobao: '淘宝', tmall: '天猫', jd: '京东' }[PLATFORM] || PLATFORM,
      });
      if (r.code === 0) {
        toast(`✓ 已保存 ${r.data?.saved || urls.length} 张到图库`);
        panel.remove(); shopPanel = null;
      } else {
        toast('保存失败：' + (r.msg || ''), true);
        saveBtn.textContent = '💾 保存选中图片'; saveBtn.disabled = false;
      }
    } catch (ex) {
      toast('网络错误：' + ex.message, true);
      saveBtn.textContent = '💾 保存选中图片'; saveBtn.disabled = false;
    }
  });

  document.body.appendChild(panel);
  shopPanel = panel;
}

/* ══════════════════════════════════════════════
   公共工具
══════════════════════════════════════════════ */
async function apiFetch(path, body) {
  const r = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function fetchProducts() {
  try {
    const r = await fetch(`${API_BASE}/plugin-products?secret=${SECRET}`);
    const j = await r.json();
    return j.code === 0 ? (j.data || []) : [];
  } catch (e) { return []; }
}

function btnStyle(color) {
  return `
    position:fixed;bottom:80px;right:20px;z-index:2147483645;
    background:${color};color:#fff;padding:10px 18px;border-radius:24px;
    cursor:pointer;font-size:14px;font-weight:700;
    box-shadow:0 4px 16px ${color}80;
    font-family:system-ui,sans-serif;line-height:1.4;
    display:none;
  `.replace(/\n\s*/g, '');
}

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:140px;right:20px;z-index:2147483647;
    background:${isErr ? '#ff4d4f' : '#52c41a'};color:#fff;
    padding:10px 18px;border-radius:8px;font-size:13px;
    font-family:system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.2);
  `.replace(/\n\s*/g, '');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
