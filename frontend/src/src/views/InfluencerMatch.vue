<template>
  <div class="dd-page">
    <!-- ====== 顶部导航栏（钉钉标准44px） ====== -->
    <header class="dd-nav">
      <div class="dd-nav__inner">
        <h1 class="dd-nav__title">达人合作筛选</h1>
        <div class="dd-nav__right">
          <button class="dd-nav__btn" :class="{ 'is-spin': syncLoading }" @click="syncPromotion" :disabled="syncLoading" aria-label="同步推广数据">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          </button>
          <button class="dd-nav__btn" @click="showUpload = true" aria-label="导入数据">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </button>
        </div>
      </div>
    </header>

    <!-- ====== 搜索 + 筛选条 ====== -->
    <div class="dd-toolbar">
      <!-- 搜索行 -->
      <div class="dd-toolbar__search">
        <div class="dd-searchbox">
          <svg class="dd-searchbox__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BFC3CC" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="keyword" type="search" placeholder="搜索达人昵称/行业" class="dd-searchbox__input" @keyup.enter="doSearch" enterkeyhint="search">
        </div>
        <button class="dd-toolbar__filter-btn" :class="{ active: showFilterPanel }" @click="showFilterPanel = !showFilterPanel">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          <span>筛选</span>
        </button>
      </div>

      <!-- 快捷排序横滑 -->
      <div class="dd-toolbar__sorts">
        <div class="dd-sorts-scroll">
          <button v-for="s in sortOptions" :key="s.value" class="dd-sort-chip" :class="{ active: sortBy === s.value }" @click="sortBy = s.value; doSearch()">{{ s.label }}</button>
        </div>
      </div>

      <!-- 展开筛选面板 -->
      <transition name="dd-slide">
        <div v-if="showFilterPanel" class="dd-toolbar__panel">
          <div class="dd-panel-row">
            <label class="dd-panel-label">最低分</label>
            <div class="dd-panel-chips">
              <button v-for="s in [0, 50, 60, 70, 80]" :key="s" class="dd-chip" :class="{ active: minScore === s }" @click="minScore = s; doSearch()">{{ s === 0 ? '不限' : '≥' + s }}</button>
            </div>
          </div>
          <div class="dd-panel-row" v-if="batches.length">
            <label class="dd-panel-label">批次</label>
            <select v-model="currentBatchId" @change="onBatchChange" class="dd-panel-select">
              <option value="">全部批次</option>
              <option v-for="b in batches" :key="b.batch_id" :value="b.batch_id">{{ b.batch_id }} ({{ b.total }}人)</option>
            </select>
          </div>
        </div>
      </transition>

      <!-- 计数 -->
      <div class="dd-toolbar__meta">
        共 <b>{{ totalCount }}</b> 位达人
      </div>
    </div>

    <!-- ====== 主内容区 ====== -->
    <main class="dd-body">
      <!-- 加载骨架 -->
      <div v-if="loading" class="dd-loading">
        <div class="dd-spinner"></div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="list.length === 0" class="dd-empty">
        <div class="dd-empty__icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D9DBE0" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="0.5" fill="#D9DBE0"/><circle cx="15" cy="9" r="0.5" fill="#D9DBE0"/></svg>
        </div>
        <p class="dd-empty__text">暂无达人数据</p>
        <button class="dd-empty__action" @click="showUpload = true">导入Excel</button>
      </div>

      <!-- 达人卡片列表 -->
      <div v-else class="dd-cards">
        <div v-for="item in list" :key="item.id" class="card">
          <!-- 评分角标 -->
          <div class="card__score" :class="scoreLevel(item.score_total)">{{ item.score_total ?? 0 }}</div>

          <!-- 头部：头像 + 基本信息 -->
          <div class="card__head">
            <div class="card__avatar" :style="avatarBg(item.nickname)">{{ (item.nickname || '达').charAt(0) }}</div>
            <div class="card__info">
              <div class="card__name">
                <a v-if="item.profile_url" :href="item.profile_url" target="_blank" rel="noopener">{{ item.nickname }}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
                <span v-else>{{ item.nickname }}</span>
              </div>
              <div class="card__id" v-if="item.douyin_id">抖音ID: {{ item.douyin_id }}</div>
            </div>
          </div>

          <!-- 标签条 -->
          <div class="card__badges" v-if="item.industry || item.mcn || item.fans_count">
            <span class="badge badge--blue" v-if="item.industry">{{ item.industry }}</span>
            <span class="badge badge--purple" v-if="item.mcn">MCN: {{ item.mcn }}</span>
            <span class="badge badge--green" v-if="item.fans_count">{{ formatFans(item.fans_count) }}粉丝</span>
          </div>

          <!-- 五维评分条 -->
          <div class="card__dims">
            <div class="dim" v-for="d in dimensions" :key="d.key">
              <span class="dim__icon">{{ d.icon }}</span>
              <span class="dim__name">{{ d.name }}</span>
              <div class="dim__track"><div class="dim__fill" :style="{ width: ((item[d.key] || 0) / 20 * 100) + '%', background: d.color }"></div></div>
              <span class="dim__val">{{ Number(item[d.key] || 0).toFixed(1) }}</span>
            </div>
          </div>

          <!-- 推广数据面板 -->
          <div class="card__promo" v-if="item.promo_cost > 0">
            <div class="card__promo-hd">
              <span>千川推广数据</span>
              <span class="card__promo-period">近30天</span>
            </div>
            <div class="promo-metrics">
              <div class="pm">
                <span class="pm__val">{{ formatMoney(item.promo_cost) }}</span>
                <span class="pm__lbl">消耗</span>
              </div>
              <div class="pm">
                <span class="pm__val pm--green">{{ formatMoney(item.promo_pay_amount) }}</span>
                <span class="pm__lbl">销售额</span>
              </div>
              <div class="pm">
                <span class="pm__val">{{ formatNum(item.promo_convert_count) }}</span>
                <span class="pm__lbl">转化数</span>
              </div>
              <div class="pm">
                <span class="pm__val">{{ formatMoney(item.promo_convert_cost) }}</span>
                <span class="pm__lbl">转化成本</span>
              </div>
              <div class="pm">
                <span class="pm__val">{{ formatNum(item.promo_show_count) }}</span>
                <span class="pm__lbl">曝光</span>
              </div>
              <div class="pm">
                <span class="pm__val">{{ formatNum(item.promo_click_count) }}</span>
                <span class="pm__lbl">点击</span>
              </div>
              <div class="pm">
                <span class="pm__val" :class="{ 'pm--green': item.promo_ctr > 3 }">{{ item.promo_ctr }}%</span>
                <span class="pm__lbl">CTR</span>
              </div>
              <div class="pm">
                <span class="pm__val" :class="roiColor(item.promo_roi)">{{ item.promo_roi }}</span>
                <span class="pm__lbl">ROI</span>
              </div>
            </div>
          </div>
          <div class="card__promo card__promo--empty" v-else>
            <span>暂无推广数据</span>
          </div>

          <!-- 标签详情（可折叠） -->
          <div class="card__detail" v-if="item.video_tags || item.live_tags || item.sales_range || item.conversion_rate">
            <div class="detail-row" v-if="item.video_tags">
              <span class="detail-label">视频标签</span>
              <div class="detail-tags"><span class="dtag" v-for="t in parseTags(item.video_tags)" :key="t">{{ t }}</span></div>
            </div>
            <div class="detail-row" v-if="item.live_tags">
              <span class="detail-label">直播标签</span>
              <div class="detail-tags"><span class="dtag" v-for="t in parseTags(item.live_tags)" :key="t">{{ t }}</span></div>
            </div>
            <div class="detail-row" v-if="item.sales_range">
              <span class="detail-label">销售额</span>
              <span class="detail-val">{{ item.sales_range }}</span>
            </div>
            <div class="detail-row" v-if="item.conversion_rate">
              <span class="detail-label">转化率</span>
              <span class="detail-val">{{ item.conversion_rate }}%</span>
            </div>
          </div>

          <!-- 简介 -->
          <div class="card__bio" v-if="item.intro" @click="toggleExpand(item.id)">
            <p :class="{ 'is-expanded': expandedIds.has(item.id) }">{{ item.intro }}</p>
            <span class="card__bio-more" v-if="item.intro?.length > 50">{{ expandedIds.has(item.id) ? '收起' : '展开' }}</span>
          </div>

          <!-- 底部操作栏 -->
          <div class="card__foot">
            <button class="card__action" @click="findSimilar(item)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              找相似达人
            </button>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="totalCount > pageSize" class="dd-pager">
        <button class="dd-pager__btn" :disabled="page <= 1" @click="goPage(page - 1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="dd-pager__info">{{ page }} / {{ totalPages }}</span>
        <button class="dd-pager__btn" :disabled="page >= totalPages" @click="goPage(page + 1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- 底部安全区 -->
      <div class="dd-safe-bottom"></div>
    </main>

    <!-- ====== Toast 提示 ====== -->
    <transition name="dd-toast">
      <div v-if="toast.show" class="dd-toast" :class="'dd-toast--' + toast.type">
        <svg v-if="toast.type === 'success'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <span>{{ toast.msg }}</span>
      </div>
    </transition>

    <!-- ====== 导入弹窗 ====== -->
    <teleport to="body">
      <transition name="dd-overlay">
        <div v-if="showUpload" class="dd-mask" @click.self="showUpload = false">
          <transition name="dd-sheet">
            <div class="dd-sheet" v-if="showUpload">
              <div class="dd-sheet__handle"></div>
              <div class="dd-sheet__hd">
                <span>导入达人数据</span>
                <button class="dd-sheet__x" @click="closeUpload">&times;</button>
              </div>
              <div class="dd-sheet__bd">
                <div v-if="uploadState === 'idle'" class="upload-zone" @click="triggerFileInput"
                  :class="{ dragging: isDragging }" @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @drop.prevent="handleDrop">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <p>点击选择 .xls / .xlsx 文件</p>
                  <input ref="fileInputRef" type="file" accept=".xls,.xlsx" @change="handleFileSelect" style="display:none">
                </div>
                <div v-else-if="uploadState === 'uploading'" class="upload-progress">
                  <div class="upload-track"><div class="upload-fill" :style="{ width: uploadProgress + '%' }"></div></div>
                  <p>{{ uploadFileName }} · {{ uploadProgress }}%</p>
                </div>
                <div v-else-if="uploadState === 'done'" class="upload-result">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#52C41A" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p>导入 <b>{{ uploadResult.total }}</b> 人，合格 <b class="hl">{{ uploadResult.qualified }}</b> 人</p>
                  <button class="dd-btn" @click="closeUpload">完成</button>
                </div>
                <div v-else-if="uploadState === 'error'" class="upload-result">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FF4D4F" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  <p class="err">{{ uploadError }}</p>
                  <button class="dd-btn" @click="uploadState = 'idle'">重试</button>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </transition>
    </teleport>

    <!-- ====== 相似达人弹窗 ====== -->
    <teleport to="body">
      <transition name="dd-overlay">
        <div v-if="showSimilar" class="dd-mask" @click.self="closeSimilar">
          <transition name="dd-sheet">
            <div class="dd-sheet dd-sheet--lg" v-if="showSimilar">
              <div class="dd-sheet__handle"></div>
              <div class="dd-sheet__hd">
                <span>与「{{ similarTarget?.nickname }}」相似</span>
                <button class="dd-sheet__x" @click="closeSimilar">&times;</button>
              </div>
              <div class="dd-sheet__bd">
                <!-- 目标达人摘要 -->
                <div class="sim-target" v-if="similarTarget">
                  <div class="card__avatar card__avatar--sm" :style="avatarBg(similarTarget.nickname)">{{ (similarTarget.nickname || '').charAt(0) }}</div>
                  <div class="sim-target__info">
                    <span class="sim-target__name">{{ similarTarget.nickname }}</span>
                    <div class="sim-target__scores">
                      <span v-for="d in dimensions" :key="d.key" class="sim-score-dot" :style="{ background: d.color }">{{ d.icon }}{{ similarTarget[d.key] || 0 }}</span>
                    </div>
                  </div>
                  <div class="card__score card__score--sm" :class="scoreLevel(similarTarget.score_total)">{{ similarTarget.score_total }}</div>
                </div>

                <div v-if="similarLoading" class="dd-loading" style="padding:32px 0"><div class="dd-spinner"></div></div>
                <div v-else-if="similarList.length === 0" class="dd-empty" style="padding:32px 0"><p class="dd-empty__text">暂无相似达人</p></div>
                <div v-else class="sim-list">
                  <div v-for="(s, idx) in similarList" :key="s.id" class="sim-card">
                    <div class="sim-card__rank">{{ idx + 1 }}</div>
                    <div class="sim-card__main">
                      <div class="sim-card__top">
                        <div class="card__avatar card__avatar--sm" :style="avatarBg(s.nickname)">{{ (s.nickname || '').charAt(0) }}</div>
                        <div class="sim-card__info">
                          <div class="sim-card__name">{{ s.nickname }}</div>
                          <div class="sim-card__tags">
                            <span class="dtag" v-if="s.industry">{{ s.industry }}</span>
                            <span class="dtag" v-if="s.fans_count">{{ formatFans(s.fans_count) }}粉</span>
                          </div>
                        </div>
                        <div class="sim-card__match">
                          <span class="sim-pct">{{ s.similarity }}%</span>
                          <span class="sim-label">相似</span>
                        </div>
                      </div>
                      <div class="sim-card__bottom" v-if="s.promo_cost > 0">
                        <span class="sim-metric">消耗 {{ formatMoney(s.promo_cost) }}</span>
                        <span class="sim-metric">ROI {{ s.promo_roi }}</span>
                        <span class="sim-metric">评分 {{ s.score_total }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import request from '../utils/request'

// ---- 配置 ----
const dimensions = [
  { key: 'score_audience', name: '人群匹配', icon: '🎯', color: '#1677FF' },
  { key: 'score_influence', name: '影响力', icon: '📢', color: '#722ED1' },
  { key: 'score_commerce', name: '带货能力', icon: '🛒', color: '#52C41A' },
  { key: 'score_content', name: '内容质量', icon: '📹', color: '#FA8C16' },
  { key: 'score_cost', name: '性价比', icon: '💰', color: '#EB2F96' },
]
const sortOptions = [
  { label: '评分', value: 'score_total' },
  { label: '粉丝', value: 'fans_count' },
  { label: '指数', value: 'daren_index' },
  { label: '消耗', value: 'promo_cost' },
  { label: 'ROI', value: 'promo_roi' },
  { label: '销售额', value: 'promo_pay_amount' },
]

// ---- 状态 ----
const loading = ref(false)
const list = ref([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = 30
const sortBy = ref('score_total')
const minScore = ref(70)
const keyword = ref('')
const currentBatchId = ref('')
const batches = ref([])
const showFilterPanel = ref(false)
const expandedIds = reactive(new Set())
const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// 上传
const showUpload = ref(false)
const uploadState = ref('idle')
const uploadProgress = ref(0)
const uploadFileName = ref('')
const uploadResult = reactive({ total: 0, qualified: 0 })
const uploadError = ref('')
const isDragging = ref(false)
const fileInputRef = ref(null)

// 同步
const syncLoading = ref(false)

// 相似达人
const showSimilar = ref(false)
const similarLoading = ref(false)
const similarTarget = ref(null)
const similarList = ref([])

// Toast
const toast = reactive({ show: false, msg: '', type: 'success' })
let toastTimer = null
function showToast(msg, type = 'success', duration = 2500) {
  clearTimeout(toastTimer)
  toast.msg = msg; toast.type = type; toast.show = true
  toastTimer = setTimeout(() => { toast.show = false }, duration)
}

// ---- 工具函数 ----
const avatarColors = [
  'linear-gradient(135deg,#1677FF,#69B1FF)', 'linear-gradient(135deg,#52C41A,#95DE64)',
  'linear-gradient(135deg,#FA8C16,#FFC069)', 'linear-gradient(135deg,#722ED1,#B37FEB)',
  'linear-gradient(135deg,#EB2F96,#FF85C0)', 'linear-gradient(135deg,#13C2C2,#5CDBD3)',
]
function avatarBg(name) { return { background: avatarColors[(name || '').charCodeAt(0) % avatarColors.length] } }
function scoreLevel(s) { return s >= 80 ? 'lv-a' : s >= 70 ? 'lv-b' : s >= 60 ? 'lv-c' : 'lv-d' }
function formatFans(n) { if (!n) return '0'; n = Number(n); return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n.toLocaleString() }
function parseTags(str) { if (!str) return []; return (Array.isArray(str) ? str : str.split(/[,，、|]/)).map(s => s.trim()).filter(Boolean).slice(0, 5) }
function toggleExpand(id) { expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id) }
function roiColor(roi) { return roi >= 2 ? 'pm--green' : roi >= 1 ? 'pm--orange' : 'pm--red' }
function formatMoney(n) {
  if (!n || n === 0) return '-'
  n = Number(n)
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1) return n.toFixed(0)
  return n.toFixed(2)
}
function formatNum(n) {
  if (!n || n === 0) return '-'
  n = Number(n)
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

// ---- 接口 ----
async function loadBatches() { try { const r = await request.get('/influencer/batches'); batches.value = r.data || [] } catch {} }

function doSearch() { page.value = 1; search() }

async function search() {
  loading.value = true
  try {
    const params = { page: page.value, page_size: pageSize, min_score: minScore.value, sort_by: sortBy.value }
    if (currentBatchId.value) params.batch_id = currentBatchId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    const res = await request.get('/influencer/list', { params })
    list.value = res.data?.list || []
    totalCount.value = res.data?.total || 0
  } catch {} finally { loading.value = false }
}

function goPage(p) { page.value = p; search(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
function onBatchChange() { page.value = 1; search() }

// 上传
function triggerFileInput() { fileInputRef.value?.click() }
function handleFileSelect(e) { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }
function handleDrop(e) { isDragging.value = false; const f = e.dataTransfer?.files?.[0]; if (f) uploadFile(f) }

async function uploadFile(file) {
  uploadState.value = 'uploading'; uploadProgress.value = 0; uploadFileName.value = file.name
  const fd = new FormData(); fd.append('file', file)
  try {
    const res = await request.post('/influencer/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => { if (e.total) uploadProgress.value = Math.round(e.loaded / e.total * 100) },
    })
    uploadResult.total = res.data?.total || 0; uploadResult.qualified = res.data?.qualified || 0
    uploadState.value = 'done'; loadBatches()
    if (res.data?.batch_id) currentBatchId.value = res.data.batch_id
    page.value = 1; search()
  } catch (e) { uploadState.value = 'error'; uploadError.value = e.message || '上传失败' }
}

function closeUpload() { showUpload.value = false; uploadState.value = 'idle'; uploadProgress.value = 0 }

// 同步
async function syncPromotion() {
  if (syncLoading.value) return
  syncLoading.value = true
  try {
    const res = await request.post('/influencer/sync-promotion')
    showToast(`同步完成，${res.data?.total || 0} 条数据`, 'success')
    search()
  } catch (e) {
    showToast('同步失败: ' + (e.message || '未知错误'), 'error')
  } finally { syncLoading.value = false }
}

// 找相似
async function findSimilar(item) {
  showSimilar.value = true; similarLoading.value = true
  similarTarget.value = item; similarList.value = []
  try {
    const res = await request.get('/influencer/similar', { params: { influencer_id: item.id } })
    similarList.value = res.data?.similar || []
  } catch {} finally { similarLoading.value = false }
}
function closeSimilar() { showSimilar.value = false; similarTarget.value = null; similarList.value = [] }

onMounted(() => { loadBatches(); search() })
</script>

<style scoped>
/* ============================================================
   钉钉设计规范 · 移动端优先
   Primary: #1677FF  Background: #F5F6FA
   Font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif
   ============================================================ */
*,*::before,*::after{box-sizing:border-box}
.dd-page {
  min-height: 100vh; background: #F5F6FA;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  color: #1F2329; -webkit-overflow-scrolling: touch;
  -webkit-tap-highlight-color: transparent;
}

/* ==================== 导航栏 ==================== */
.dd-nav {
  position: sticky; top: 0; z-index: 50;
  background: #fff;
  border-bottom: 0.5px solid rgba(0,0,0,0.06);
}
.dd-nav__inner {
  height: 44px; padding: 0 16px;
  display: flex; align-items: center; justify-content: space-between;
  max-width: 1200px; margin: 0 auto;
}
.dd-nav__title { font-size: 17px; font-weight: 600; margin: 0; }
.dd-nav__right { display: flex; gap: 2px; }
.dd-nav__btn {
  width: 40px; height: 40px; border: none; background: transparent;
  display: flex; align-items: center; justify-content: center;
  color: #646A73; cursor: pointer; border-radius: 10px;
  transition: background 0.15s;
}
.dd-nav__btn:active { background: #F0F1F5; }
.dd-nav__btn:disabled { opacity: 0.4; }
.dd-nav__btn.is-spin svg { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ==================== 工具栏/筛选 ==================== */
.dd-toolbar {
  background: #fff; padding: 0 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.06);
  max-width: 1200px; margin: 0 auto;
}
.dd-toolbar__search {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 0;
}
.dd-searchbox {
  flex: 1; position: relative; height: 36px;
}
.dd-searchbox__icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.dd-searchbox__input {
  width: 100%; height: 100%; border: none; border-radius: 8px;
  background: #F5F6FA; padding: 0 12px 0 34px;
  font-size: 14px; color: #1F2329; outline: none;
  -webkit-appearance: none; appearance: none;
}
.dd-searchbox__input:focus { background: #EBF0FF; box-shadow: 0 0 0 1.5px #1677FF33; }
.dd-searchbox__input::placeholder { color: #BFC3CC; }

.dd-toolbar__filter-btn {
  height: 36px; padding: 0 14px; flex-shrink: 0;
  border: 1px solid #E5E6EB; border-radius: 8px;
  background: #fff; font-size: 13px; color: #646A73;
  display: flex; align-items: center; gap: 4px; cursor: pointer;
}
.dd-toolbar__filter-btn.active { border-color: #1677FF; color: #1677FF; background: #F0F5FF; }

/* 快捷排序横滑 */
.dd-toolbar__sorts { padding: 4px 0 8px; margin: 0 -16px; }
.dd-sorts-scroll {
  display: flex; gap: 8px; overflow-x: auto; padding: 0 16px;
  scrollbar-width: none; -ms-overflow-style: none;
}
.dd-sorts-scroll::-webkit-scrollbar { display: none; }
.dd-sort-chip {
  height: 30px; padding: 0 14px; flex-shrink: 0;
  border: 1px solid #E5E6EB; border-radius: 15px;
  background: #fff; font-size: 13px; color: #646A73;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.dd-sort-chip.active { background: #1677FF; color: #fff; border-color: #1677FF; }
.dd-sort-chip:active:not(.active) { background: #F5F6FA; }

/* 展开面板 */
.dd-toolbar__panel { padding: 4px 0 8px; border-top: 0.5px solid #F0F0F3; }
.dd-panel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dd-panel-label { font-size: 12px; color: #8F959E; width: 48px; flex-shrink: 0; }
.dd-panel-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.dd-chip {
  height: 28px; padding: 0 14px; border: 1px solid #E5E6EB; border-radius: 14px;
  background: #fff; font-size: 12px; color: #646A73; cursor: pointer;
  transition: all 0.12s;
}
.dd-chip.active { background: #1677FF; color: #fff; border-color: #1677FF; }
.dd-panel-select {
  height: 30px; border: 1px solid #E5E6EB; border-radius: 6px;
  padding: 0 10px; font-size: 13px; color: #1F2329; background: #fff; outline: none;
  max-width: 200px;
}
.dd-toolbar__meta { padding: 6px 0 10px; font-size: 12px; color: #8F959E; }
.dd-toolbar__meta b { color: #1677FF; font-weight: 600; }

/* 面板过渡 */
.dd-slide-enter-active,.dd-slide-leave-active { transition: all 0.2s ease; overflow: hidden; }
.dd-slide-enter-from,.dd-slide-leave-to { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }
.dd-slide-enter-to,.dd-slide-leave-from { max-height: 120px; opacity: 1; }

/* ==================== 主内容 ==================== */
.dd-body { padding: 10px 0; max-width: 1200px; margin: 0 auto; }
.dd-loading { display: flex; justify-content: center; padding: 60px 0; }
.dd-spinner {
  width: 24px; height: 24px; border: 2.5px solid #E5E6EB; border-top-color: #1677FF;
  border-radius: 50%; animation: spin 0.7s linear infinite;
}
.dd-empty { display: flex; flex-direction: column; align-items: center; padding: 80px 20px; }
.dd-empty__icon { margin-bottom: 12px; }
.dd-empty__text { margin: 0; font-size: 14px; color: #8F959E; }
.dd-empty__action {
  margin-top: 16px; height: 40px; padding: 0 28px;
  border: none; border-radius: 20px; background: #1677FF; color: #fff;
  font-size: 14px; font-weight: 500; cursor: pointer;
}

/* ==================== 卡片列表 ==================== */
.dd-cards { padding: 0 12px; display: flex; flex-direction: column; gap: 10px; }

.card {
  background: #fff; border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  position: relative; overflow: hidden;
}

/* 评分角标 */
.card__score {
  position: absolute; top: 14px; right: 14px;
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: #fff; z-index: 2;
}
.card__score--sm { position: static; width: 34px; height: 34px; font-size: 13px; flex-shrink: 0; }
.lv-a { background: linear-gradient(135deg, #52C41A, #73D13D); }
.lv-b { background: linear-gradient(135deg, #1677FF, #4096FF); }
.lv-c { background: linear-gradient(135deg, #FA8C16, #FFC53D); }
.lv-d { background: linear-gradient(135deg, #BFBFBF, #D9D9D9); }

/* 头部 */
.card__head { display: flex; align-items: center; gap: 10px; padding-right: 52px; margin-bottom: 10px; }
.card__avatar {
  width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
  color: #fff; font-size: 18px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.card__avatar--sm { width: 34px; height: 34px; font-size: 14px; }
.card__info { flex: 1; min-width: 0; overflow: hidden; }
.card__name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card__name a {
  color: inherit; text-decoration: none;
  display: inline-flex; align-items: center; gap: 4px;
}
.card__name a svg { opacity: 0.3; transition: opacity 0.15s; }
.card__name a:active svg { opacity: 1; color: #1677FF; }
.card__id { font-size: 11px; color: #8F959E; margin-top: 2px; }

/* 标签 */
.card__badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.badge { padding: 2px 10px; border-radius: 12px; font-size: 11px; line-height: 18px; font-weight: 500; }
.badge--blue { background: #EBF3FF; color: #1677FF; }
.badge--purple { background: #F3EDFF; color: #722ED1; }
.badge--green { background: #EDFFF3; color: #389E0D; }

/* 五维评分 */
.card__dims { margin-bottom: 12px; }
.dim { display: flex; align-items: center; gap: 6px; height: 22px; }
.dim__icon { font-size: 11px; width: 14px; text-align: center; }
.dim__name { font-size: 11px; color: #646A73; width: 48px; flex-shrink: 0; }
.dim__track { flex: 1; height: 6px; background: #F0F1F5; border-radius: 3px; overflow: hidden; }
.dim__fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
.dim__val { width: 28px; font-size: 11px; color: #8F959E; text-align: right; flex-shrink: 0; }

/* 推广数据 */
.card__promo {
  background: linear-gradient(135deg, #F8F9FC 0%, #F0F3FA 100%);
  border-radius: 10px; padding: 12px; margin-bottom: 10px;
}
.card__promo-hd {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.card__promo-hd span:first-child { font-size: 12px; font-weight: 600; color: #1F2329; }
.card__promo-period { font-size: 10px; color: #8F959E; background: #fff; padding: 2px 8px; border-radius: 10px; }
.promo-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 6px; }
.pm { display: flex; flex-direction: column; align-items: center; text-align: center; }
.pm__val { font-size: 14px; font-weight: 700; color: #1F2329; line-height: 1.2; }
.pm__lbl { font-size: 10px; color: #8F959E; margin-top: 3px; }
.pm--green { color: #389E0D; }
.pm--orange { color: #D48806; }
.pm--red { color: #CF1322; }
.card__promo--empty {
  display: flex; align-items: center; justify-content: center;
  color: #C0C4CC; font-size: 12px; padding: 16px; background: #FAFBFC;
}

/* 标签详情 */
.card__detail { margin-bottom: 8px; }
.detail-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.detail-label { color: #8F959E; flex-shrink: 0; width: 56px; }
.detail-val { color: #1F2329; }
.detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.dtag { padding: 1px 8px; background: #F5F6FA; border-radius: 4px; font-size: 11px; color: #646A73; }

/* 简介 */
.card__bio { padding-top: 8px; border-top: 0.5px solid #F0F1F5; cursor: pointer; }
.card__bio p {
  font-size: 12px; color: #8F959E; line-height: 1.6; margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card__bio p.is-expanded { -webkit-line-clamp: unset; display: block; }
.card__bio-more { font-size: 11px; color: #1677FF; margin-top: 4px; display: inline-block; }

/* 底部操作 */
.card__foot { padding-top: 10px; display: flex; justify-content: flex-end; }
.card__action {
  height: 32px; padding: 0 16px; border: none; border-radius: 16px;
  background: #F0F5FF; color: #1677FF; font-size: 12px; font-weight: 500;
  cursor: pointer; display: flex; align-items: center; gap: 5px;
  transition: background 0.15s;
}
.card__action:active { background: #D6E4FF; }

/* ==================== 分页 ==================== */
.dd-pager {
  display: flex; align-items: center; justify-content: center; gap: 20px;
  padding: 16px 12px;
}
.dd-pager__btn {
  width: 36px; height: 36px; border: 1px solid #E5E6EB; border-radius: 50%;
  background: #fff; display: flex; align-items: center; justify-content: center;
  color: #646A73; cursor: pointer;
}
.dd-pager__btn:active { background: #F5F6FA; }
.dd-pager__btn:disabled { opacity: 0.3; cursor: not-allowed; }
.dd-pager__info { font-size: 13px; color: #8F959E; }
.dd-safe-bottom { height: calc(16px + env(safe-area-inset-bottom, 0px)); }

/* ==================== Toast ==================== */
.dd-toast {
  position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
  z-index: 9999; padding: 10px 20px; border-radius: 20px;
  background: rgba(0,0,0,0.75); color: #fff; font-size: 13px;
  display: flex; align-items: center; gap: 6px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.dd-toast--error { background: rgba(207,19,34,0.85); }
.dd-toast-enter-active { transition: all 0.25s ease-out; }
.dd-toast-leave-active { transition: all 0.2s ease-in; }
.dd-toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
.dd-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

/* ==================== 遮罩 + 底部弹窗 ==================== */
.dd-mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: flex-end; justify-content: center;
}
.dd-sheet {
  background: #fff; border-radius: 16px 16px 0 0; width: 100%; max-width: 480px;
  max-height: 75vh; display: flex; flex-direction: column;
}
.dd-sheet--lg { max-height: 85vh; }
.dd-sheet__handle { width: 36px; height: 4px; border-radius: 2px; background: #E5E6EB; margin: 8px auto 0; }
.dd-sheet__hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; font-size: 16px; font-weight: 600; flex-shrink: 0;
}
.dd-sheet__x {
  width: 30px; height: 30px; border: none; background: #F5F6FA; border-radius: 50%;
  font-size: 18px; color: #8F959E; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.dd-sheet__bd { padding: 0 20px 28px; flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }

/* 过渡 */
.dd-overlay-enter-active { transition: opacity 0.2s ease; }
.dd-overlay-leave-active { transition: opacity 0.15s ease; }
.dd-overlay-enter-from,.dd-overlay-leave-to { opacity: 0; }
.dd-sheet-enter-active { transition: transform 0.25s cubic-bezier(0.32,0.72,0,1); }
.dd-sheet-leave-active { transition: transform 0.2s ease-in; }
.dd-sheet-enter-from { transform: translateY(100%); }
.dd-sheet-leave-to { transform: translateY(100%); }

/* 上传区 */
.upload-zone {
  border: 1.5px dashed #D9DBE0; border-radius: 12px;
  padding: 44px 20px; text-align: center; cursor: pointer;
  transition: all 0.15s;
}
.upload-zone:active,.upload-zone.dragging { border-color: #1677FF; background: #F0F5FF; }
.upload-zone p { font-size: 14px; color: #646A73; margin: 12px 0 0; }
.upload-progress { text-align: center; padding: 36px 0; }
.upload-track { height: 5px; background: #F0F1F5; border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
.upload-fill { height: 100%; background: linear-gradient(90deg, #1677FF, #69B1FF); border-radius: 3px; transition: width 0.3s; }
.upload-progress p { font-size: 13px; color: #646A73; margin: 0; }
.upload-result { text-align: center; padding: 24px 0; }
.upload-result p { font-size: 14px; color: #1F2329; margin: 14px 0; }
.upload-result p.err { color: #FF4D4F; }
.upload-result .hl { color: #1677FF; }
.dd-btn {
  height: 44px; padding: 0 36px; border: none; border-radius: 22px;
  background: #1677FF; color: #fff; font-size: 15px; font-weight: 500; cursor: pointer;
}

/* ==================== 相似达人 ==================== */
.sim-target {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; background: #F0F5FF; border-radius: 10px; margin-bottom: 14px;
}
.sim-target__info { flex: 1; min-width: 0; }
.sim-target__name { font-size: 14px; font-weight: 600; }
.sim-target__scores { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.sim-score-dot { font-size: 10px; padding: 1px 6px; border-radius: 8px; color: #fff; }

.sim-list { display: flex; flex-direction: column; gap: 8px; }
.sim-card {
  display: flex; align-items: stretch; gap: 0;
  background: #FAFBFC; border-radius: 10px; overflow: hidden;
}
.sim-card__rank {
  width: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #BFC3CC; background: #F5F6FA;
}
.sim-card:nth-child(1) .sim-card__rank { color: #FA541C; }
.sim-card:nth-child(2) .sim-card__rank { color: #FA8C16; }
.sim-card:nth-child(3) .sim-card__rank { color: #FAAD14; }

.sim-card__main { flex: 1; padding: 10px 12px; }
.sim-card__top { display: flex; align-items: center; gap: 10px; }
.sim-card__info { flex: 1; min-width: 0; }
.sim-card__name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sim-card__tags { display: flex; gap: 4px; margin-top: 3px; }
.sim-card__match { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.sim-pct { font-size: 16px; font-weight: 700; color: #1677FF; line-height: 1; }
.sim-label { font-size: 9px; color: #8F959E; margin-top: 2px; }
.sim-card__bottom {
  display: flex; gap: 12px; margin-top: 6px; padding-top: 6px; border-top: 0.5px solid #ECEDF0;
}
.sim-metric { font-size: 11px; color: #646A73; }

/* ==================== 桌面端适配 ==================== */
@media (min-width: 768px) {
  .dd-nav__inner { height: 52px; }
  .dd-toolbar { padding: 0 24px; }
  .dd-body { padding: 14px 0; }
  .dd-cards { padding: 0 24px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .dd-pager { padding: 20px 24px; }
  .dd-mask { align-items: center; }
  .dd-sheet { border-radius: 16px; max-height: 65vh; }
  .dd-sheet--lg { max-height: 75vh; max-width: 540px; }
  .card__name a:hover { color: #1677FF; }
  .card__name a:hover svg { opacity: 1; }
}
@media (min-width: 1200px) {
  .dd-cards { grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .promo-metrics { gap: 10px 10px; }
}
@media (min-width: 1600px) {
  .dd-cards { grid-template-columns: repeat(4, 1fr); }
}
</style>
