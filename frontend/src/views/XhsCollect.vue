<template>
  <div class="xhs-collect">
    <div class="page-header"><h2>小红书中心 · 竞品笔记收集</h2></div>
    <div class="plugin-bar">
      <span class="pb-title">🧩 竞品采集插件</span>
      <a class="pb-btn dl" href="/ai-images/snefe-collector.zip" download="snefe-collector.zip">下载插件包</a>
      <a class="pb-btn" @click="helpOpen = true">安装说明</a>
      <div class="pb-product-sel">
        <span class="pb-sel-label">采集归属产品：</span>
        <a-select
          v-model:value="collectProductId"
          :options="collectProductOpts"
          style="width:140px"
          size="small"
          @change="saveCollectProduct"
        />
        <span v-if="collectProductId" class="pb-sel-tip">插件采集的笔记将自动归入此产品</span>
        <span v-else class="pb-sel-tip" style="color:#bbb">未选择则归入「全部」</span>
      </div>
    </div>
    <a-alert type="info" show-icon style="margin-bottom:16px"
      message="用 Chrome 插件在已登录的小红书页面一键采集（或按下方渠道人工录入）。采集仅获取封面/标题/作者/点赞，完整正文和多图点笔记后「查看原文」。" />

    <div class="guide-grid">
      <div class="guide-card">
        <div class="g-title">① 小红书搜索 <a href="https://www.xiaohongshu.com/explore" target="_blank">前往 ↗</a></div>
        <div class="g-body">关键词：类目词（洗面奶）/ 品牌词（适乐肤·C咖·溪木源·HBN）/ 功效词（卸妆·去黑头·去黄·美白）<br/>排序：最多点赞 或 最多评论　｜　类型：图文 / 视频</div>
      </div>
      <div class="guide-card">
        <div class="g-title">② 聚光后台 <a href="https://ad.xiaohongshu.com" target="_blank">前往 ↗</a></div>
        <div class="g-body">路径：创意 → 内容广场 → 电商热门<br/>排序：笔记支付金额　｜　时间：30/15/7 天　｜　类目：洁面　｜　类型：图文/短视频</div>
      </div>
      <div class="guide-card">
        <div class="g-title">③ 合作伙伴平台 <a href="https://partner.xiaohongshu.com" target="_blank">前往 ↗</a></div>
        <div class="g-body">路径：竞价行业大盘 → 优质案例 → 小红书热门<br/>排序：笔记曝光量　｜　类型：图文　｜　类目：护肤</div>
      </div>
    </div>

    <XhsProductTabs v-model="productId" :products="products" @change="load" />

    <div class="collect-bar">
      <a-button type="primary" @click="openAdd">+ 录入收集到的笔记</a-button>
      <a-select v-model:value="filterSource" :options="platformOpts" placeholder="按渠道筛选" style="width:140px" allow-clear @change="load" />
      <a-select v-model:value="timeFilter" :options="timeOpts" style="width:130px" @change="load" />
      <span class="cnt">共 {{ list.length }} 条</span>
    </div>

    <a-spin :spinning="loading">
      <div class="xhs-feed" v-if="list.length">
        <div v-for="c in list" :key="c.id" class="xhs-note" @click="openDetail(c)">
          <div class="note-cover">
            <img v-if="c.image_url" :src="c.image_url" referrerpolicy="no-referrer" :alt="c.title" />
            <div v-else class="no-cover">无封面</div>
            <span v-if="c.note_type==='video'" class="play-badge">▶ 视频</span>
          </div>
          <div class="note-body">
            <div class="note-title">{{ c.title || '(无标题)' }}</div>
            <div class="note-foot">
              <span class="note-author">
                <img v-if="c.avatar" :src="c.avatar" class="avatar" referrerpolicy="no-referrer" @error="(e) => e.target.style.display = 'none'" />
                {{ c.author || c.source || '' }}
              </span>
              <span class="note-likes" v-if="likeOf(c)">♥ {{ likeOf(c) }}</span>
            </div>
            <div class="note-time">采集 {{ (c.created_at || '').replace('T', ' ').slice(5, 16) }}</div>
            <!-- 产品归属标签 -->
            <div class="note-product-row" @click.stop>
              <a-select
                :value="c.product_id || 0"
                :options="productOpts"
                size="small"
                class="prod-tag-select"
                @change="(v) => assignProduct(c, v)"
              />
            </div>
          </div>
          <!-- 删除：hover 显示，右上角 × -->
          <span class="note-del-btn" @click.stop="del(c)">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="1" y1="1" x2="9" y2="9" stroke="white" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>
          </span>
        </div>
      </div>
      <a-empty v-else description="还没有收集的笔记，用插件采集或点「录入」" :image-style="{height:'60px'}" />
    </a-spin>

    <!-- 录入 -->
    <a-modal v-model:open="addOpen" title="录入竞品笔记" okText="保存" cancelText="取消" @ok="save" :width="560">
      <div class="add-form">
        <label>来源渠道</label>
        <a-select v-model:value="form.platform" :options="platformOpts" style="width:100%" />
        <label>所属产品</label>
        <a-select v-model:value="form.product_id" :options="productOpts" style="width:100%" />
        <label>标题</label><a-input v-model:value="form.title" placeholder="竞品笔记标题" />
        <label>正文</label><a-textarea v-model:value="form.body" :rows="6" placeholder="复制竞品笔记正文" />
        <label>品牌/博主</label><a-input v-model:value="form.brand" placeholder="如 适乐肤 / 某博主" />
        <label>标签（逗号分隔）</label><a-input v-model:value="form.tags" placeholder="如 卸妆,氨基酸,测评" />
        <label>配图 URL（可选）</label><a-input v-model:value="form.image_url" placeholder="图片地址" />
      </div>
    </a-modal>

    <!-- 小红书详情样式查看 -->
    <a-modal v-model:open="detailOpen" :footer="null" :width="900" :body-style="{ padding: 0 }" centered destroyOnClose>
      <div class="xhs-detail" v-if="detail">
        <div class="detail-left">
          <template v-if="detailImages.length">
            <img :src="detailImages[curIdx]" referrerpolicy="no-referrer" :alt="detail.title" class="detail-img" />
            <span v-if="detailImages.length > 1" class="img-count">{{ curIdx + 1 }} / {{ detailImages.length }}</span>
            <a v-if="detailImages.length > 1" class="nav prev" @click.stop="prevImg">‹</a>
            <a v-if="detailImages.length > 1" class="nav next" @click.stop="nextImg">›</a>
          </template>
          <div v-else class="no-cover" style="color:#888">无封面图</div>
        </div>
        <div class="detail-right">
          <div class="detail-author">
            <img v-if="detail.avatar" :src="detail.avatar" class="d-avatar" referrerpolicy="no-referrer" @error="(e) => e.target.style.display = 'none'" />
            <span class="d-name">{{ detail.author || detail.source || '竞品笔记' }}</span>
            <a v-if="detail.source_url" :href="detail.source_url" target="_blank" class="d-follow" style="background:#f0f0f0;color:#555">查看原文 ↗</a>
            <a class="d-follow" @click="!imitateLoading && doImitate()" :style="imitateLoading ? 'opacity:.6;cursor:not-allowed' : ''">{{ imitateLoading ? '生成中…' : '分析并模仿生成' }}</a>
          </div>
          <div class="detail-body">
            <div class="d-title">{{ detail.title || '(无标题)' }}</div>
            <div class="d-text" v-if="detail.body && detail.body !== ('点赞：' + likeOf(detail))">{{ detail.body }}</div>
            <div class="d-tip">完整正文与多图（如 1/8）在笔记详情页，点上方「查看原文」到小红书查看。采集仅获取封面/标题/作者/点赞。</div>
            <div class="d-meta" v-if="detail.note_id || detail.publish_date">
              <span v-if="detail.note_id">笔记ID：{{ detail.note_id }}</span>
              <span v-if="detail.publish_date">　发布：{{ detail.publish_date }}</span>
            </div>
          </div>
          <div class="detail-foot">
            <span class="like" v-if="likeOf(detail)">♥ {{ likeOf(detail) }}</span>
            <span>{{ detail.source }}</span>
            <span style="margin-left:auto;color:#bbb;font-size:12px">采集 {{ (detail.created_at || '').replace('T',' ').slice(5,16) }}</span>
          </div>
        </div>
      </div>
    </a-modal>

    <a-modal v-model:open="helpOpen" title="竞品采集插件 · 安装与使用说明" :footer="null" :width="620">
      <div class="help-content">
        <h4>一、安装（首次，约 1 分钟）</h4>
        <ol>
          <li>点上方「下载插件包」，得到 snefe-collector.zip，<b>解压</b>到一个文件夹</li>
          <li>Chrome 地址栏输入 <code>chrome://extensions/</code> 回车</li>
          <li>打开右上角「<b>开发者模式</b>」开关</li>
          <li>点「<b>加载已解压的扩展程序</b>」，选择解压出的 snefe-collector 文件夹</li>
          <li>出现「雪玲妃·竞品采集」即安装成功</li>
        </ol>
        <h4>二、小红书笔记采集</h4>
        <ol>
          <li>浏览器登录小红书，搜索或浏览笔记</li>
          <li><b>点开</b>想采集的笔记（插件自动抓多图 + 正文全文）</li>
          <li>页面右下角红色「采集到系统 (N)」— 点击即入库</li>
        </ol>
        <h4>三、淘宝 / 天猫 / 京东图片采集</h4>
        <ol>
          <li>在浏览器打开任意淘宝/天猫/京东商品详情页（已登录更好）</li>
          <li>页面右下角出现橙色「🛒 采集图片 (N)」按钮</li>
          <li>点击 → 弹出图片预览面板 → 勾选所需图片 → 选择归属产品 → 「保存到图库」</li>
          <li>图片保存到「小红书图片管理 → 爆款图」分类下</li>
        </ol>
        <h4>四、注意</h4>
        <ul>
          <li>插件更新后需重新加载：chrome://extensions → 点插件的刷新图标 ⟳</li>
          <li>走已登录的浏览器采集，合规、不碰账号密码</li>
        </ul>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import request from '../utils/request'
import XhsProductTabs from '../components/XhsProductTabs.vue'

const platformOpts = [
  { value: '小红书搜索', label: '小红书搜索' },
  { value: '聚光后台', label: '聚光后台' },
  { value: '合作伙伴平台', label: '合作伙伴平台' },
]

const products = ref([])
const productId = ref(0)
const productOpts = computed(() => [{ value: 0, label: '全部产品' }, ...products.value.map(p => ({ value: p.id, label: p.name }))])
const collectProductOpts = computed(() => [{ value: 0, label: '不指定' }, ...products.value.map(p => ({ value: p.id, label: p.name }))])
const collectProductId = ref(0)
async function loadProducts() {
  try { const r = await request.get('/xhs/products'); if (r.code === 0) products.value = r.data || [] } catch (e) {}
}
async function loadCollectSetting() {
  try { const r = await request.get('/xhs/collect-setting'); if (r.code === 0) collectProductId.value = r.data?.product_id || 0 } catch (e) {}
}
async function saveCollectProduct(val) {
  try { await request.post('/xhs/collect-setting', { product_id: val || 0 }); message.success(val ? '已设置，插件采集将自动归入该产品' : '已取消产品归属') } catch (e) {}
}

const loading = ref(false)
const helpOpen = ref(false)
const list = ref([])
const filterSource = ref(undefined)
const timeFilter = ref('all')
const timeOpts = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '3d', label: '近 3 天' },
  { value: '7d', label: '近 7 天' },
]
function likeOf(c) { const m = ((c && c.body) || '').match(/点赞[:：]\s*([\d.wW万]+)/); return m ? m[1] : '' }

const detailOpen = ref(false)
const detail = ref(null)
const curIdx = ref(0)
function openDetail(c) { detail.value = c; curIdx.value = 0; detailOpen.value = true }
function prevImg() { const n = detailImages.value.length; curIdx.value = (curIdx.value - 1 + n) % n }
function nextImg() { const n = detailImages.value.length; curIdx.value = (curIdx.value + 1) % n }

// 分析并模仿生成（直接生成，AI 自动选角度，产品图用默认配置）
const imitateLoading = ref(false)
async function doImitate() {
  if (!detail.value) return
  imitateLoading.value = true
  try {
    const refNote = [detail.value.title, detail.value.body].filter(Boolean).join('\n')
    const res = await request.post('/xhs/generate', { angle: 'auto', imageStyle: 'auto', refNote, productImageUrl: '', refImageUrl: (detail.value && detail.value.image_url) || '', product_id: productId.value || 0 }, { timeout: 150000 })
    if (res.code === 0) { message.success('文案已生成，配图后台生成中（约1分钟），去「运营工作台」查看'); detailOpen.value = false }
    else message.error(res.msg || '生成失败')
  } catch (e) { message.error('生成失败：' + (e.message || '')) }
  finally { imitateLoading.value = false }
}
const detailImages = computed(() => {
  if (!detail.value) return []
  try { const a = JSON.parse(detail.value.images || '[]'); if (Array.isArray(a) && a.length) return a } catch (e) {}
  return detail.value.image_url ? [detail.value.image_url] : []
})

async function load() {
  loading.value = true
  try {
    const res = await request.get('/xhs/competitor', { params: productId.value ? { product_id: productId.value } : {} })
    if (res.code === 0) {
      let d = res.data || []
      if (filterSource.value) d = d.filter(x => (x.source || '').startsWith(filterSource.value))
      if (timeFilter.value !== 'all') {
        const now = Date.now()
        const span = timeFilter.value === 'today' ? 86400000 : (timeFilter.value === '3d' ? 3 * 86400000 : 7 * 86400000)
        d = d.filter(x => { const t = new Date(String(x.created_at || '').replace(' ', 'T')).getTime(); return t && (now - t) <= span })
      }
      list.value = d
    }
  } catch (e) {} finally { loading.value = false }
}

const addOpen = ref(false)
const form = reactive({ platform: '小红书搜索', title: '', body: '', brand: '', tags: '', image_url: '', product_id: 0 })
function openAdd() { Object.assign(form, { platform: '小红书搜索', title: '', body: '', brand: '', tags: '', image_url: '', product_id: 0 }); addOpen.value = true }
async function save() {
  if (!form.title.trim() && !form.body.trim()) { message.warning('标题或正文至少填一个'); return }
  const source = form.platform + (form.brand ? ('-' + form.brand) : '')
  try {
    const res = await request.post('/xhs/competitor', { title: form.title, body: form.body, image_url: form.image_url, source, tags: form.tags, product_id: form.product_id || 0 })
    if (res.code === 0) { message.success('已入库'); addOpen.value = false; load() } else message.error(res.msg || '失败')
  } catch (e) { message.error('保存失败') }
}
async function assignProduct(c, pid) {
  try {
    const r = await request.put(`/xhs/competitor/${c.id}`, { product_id: pid || 0 })
    if (r.code === 0) { c.product_id = pid || 0; message.success('已归属') }
    else message.error(r.msg || '失败')
  } catch (e) { message.error('操作失败') }
}

function del(c) {
  Modal.confirm({
    title: '删除这条笔记？', okText: '删除', okType: 'danger', cancelText: '取消',
    onOk: async () => { try { await request.delete(`/xhs/competitor/${c.id}`); message.success('已删除'); load() } catch (e) { message.error('删除失败') } }
  })
}
onMounted(() => { load(); loadProducts(); loadCollectSetting() })
</script>

<style scoped>
.xhs-collect { padding: 24px; }
.page-header h2 { margin: 0 0 12px; font-size: 20px; color: #1f2329; }
.plugin-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: #f0f7ff; border: 1px solid #d6e8ff; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; }
.pb-title { font-size: 14px; font-weight: 600; color: #1677ff; }
.pb-btn { font-size: 13px; padding: 5px 14px; border-radius: 16px; cursor: pointer; }
.pb-btn.dl { background: #1677ff; color: #fff; }
.pb-btn:not(.dl) { border: 1px solid #1677ff; color: #1677ff; }
.pb-product-sel { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.7); border: 1px solid #b8d4ff; border-radius: 8px; padding: 5px 12px; }
.pb-sel-label { font-size: 13px; color: #1677ff; font-weight: 600; white-space: nowrap; }
.pb-sel-tip { font-size: 12px; color: #52a8ff; }
.help-content { font-size: 14px; color: #333; line-height: 1.8; }
.help-content h4 { margin: 14px 0 6px; font-size: 14px; color: #1f2329; }
.help-content ol, .help-content ul { padding-left: 20px; margin: 0; }
.help-content code { background: #f0f0f0; padding: 1px 6px; border-radius: 4px; }
.guide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 16px; }
.guide-card { background: #fff; border: 1px solid #eceef0; border-radius: 10px; padding: 14px; }
.g-title { font-size: 14px; font-weight: 600; color: #1f2329; margin-bottom: 8px; }
.g-title a { font-size: 12px; color: #1677ff; font-weight: 400; margin-left: 8px; }
.g-body { font-size: 12px; color: #646a73; line-height: 1.9; }
.collect-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.cnt { font-size: 13px; color: #8f959e; }

.xhs-feed { column-count: 5; column-gap: 14px; }
@media (max-width: 1500px) { .xhs-feed { column-count: 4; } }
@media (max-width: 1150px) { .xhs-feed { column-count: 3; } }
@media (max-width: 760px) { .xhs-feed { column-count: 2; } }
.xhs-note { break-inside: avoid; margin-bottom: 14px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,.06); position: relative; cursor: pointer; }
.note-cover { background: #f5f6f8; min-height: 40px; }
.note-cover img { width: 100%; display: block; }
.no-cover { height: 160px; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 12px; }
.note-body { padding: 8px 10px 10px; }
.note-title { font-size: 13px; color: #333; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.note-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.note-author { font-size: 12px; color: #8f959e; max-width: 64%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 5px; }
.avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.note-likes { font-size: 12px; color: #ff2442; }
.note-time { font-size: 11px; color: #bbb; margin-top: 4px; }
.play-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.45); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.note-product-row { margin-top: 8px; }
:deep(.prod-tag-select .ant-select-selector) {
  background: #f3f0fd !important;
  border: none !important;
  border-radius: 20px !important;
  padding: 0 10px !important;
  height: 22px !important;
  min-width: 80px !important;
  cursor: pointer !important;
}
:deep(.prod-tag-select .ant-select-selection-item) {
  font-size: 11.5px !important;
  color: #5b47d9 !important;
  line-height: 22px !important;
  padding-right: 16px !important;
}
:deep(.prod-tag-select .ant-select-arrow) { color: #c0b8f0 !important; right: 8px !important; }
.note-del-btn {
  position: absolute; top: 7px; right: 7px;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,.38); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity .15s;
}
.xhs-note:hover .note-del-btn { opacity: 1; }
.note-del-btn:hover { background: rgba(245,34,45,.75); }

.add-form label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }

/* 小红书详情样式 */
.xhs-detail { display: flex; height: 560px; }
.detail-left { flex: 0 0 50%; background: #000; display: flex; align-items: center; justify-content: center; position: relative; }
.detail-img { max-width: 100%; max-height: 560px; object-fit: contain; }
.img-count { position: absolute; top: 10px; right: 12px; background: rgba(0,0,0,.5); color: #fff; font-size: 12px; padding: 2px 10px; border-radius: 11px; z-index: 3; }
.detail-left .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; line-height: 33px; text-align: center; background: rgba(0,0,0,.4); color: #fff; font-size: 24px; border-radius: 50%; cursor: pointer; z-index: 3; user-select: none; }
.detail-left .nav:hover { background: rgba(0,0,0,.65); }
.detail-left .nav.prev { left: 10px; }
.detail-left .nav.next { right: 10px; }
.detail-right { flex: 1; padding: 20px 22px; display: flex; flex-direction: column; min-width: 0; }
.detail-author { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid #f0f0f0; }
.d-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: #eee; }
.d-name { font-size: 15px; font-weight: 600; color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-follow { background: #ff2442; color: #fff; padding: 6px 16px; border-radius: 16px; font-size: 13px; white-space: nowrap; }
.detail-body { flex: 1; overflow-y: auto; padding: 16px 0; }
.d-title { font-size: 18px; font-weight: 700; color: #1f2329; margin-bottom: 12px; line-height: 1.4; }
.d-text { font-size: 14px; color: #333; line-height: 1.75; white-space: pre-wrap; margin-bottom: 12px; }
.d-tip { font-size: 12px; color: #8f959e; background: #f7f8fa; padding: 10px 12px; border-radius: 8px; line-height: 1.6; }
.d-meta { margin-top: 12px; font-size: 12px; color: #999; }
.detail-foot { display: flex; align-items: center; gap: 16px; padding-top: 14px; border-top: 1px solid #f0f0f0; color: #666; font-size: 14px; }
.detail-foot .like { color: #ff2442; font-weight: 600; }
</style>
