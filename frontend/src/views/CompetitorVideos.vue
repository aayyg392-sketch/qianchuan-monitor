<template>
  <div class="dd-page">
    <!-- 列表区域 -->
    <div class="dd-list-head">
      <div class="dd-list-head__title">竞品爆款视频</div>
      <div class="dd-list-head__actions">
        <button class="dd-btn dd-btn--ghost dd-btn--sm" @click="showAddLink = !showAddLink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          添加
        </button>
        <button class="dd-btn dd-btn--primary dd-btn--sm" @click="refreshVideos" :disabled="refreshing">
          <svg v-if="!refreshing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          {{ refreshing ? '抓取中...' : 'AI抓取' }}
        </button>
      </div>
    </div>

    <!-- 品牌标签 -->
    <div class="dd-tabs-bar">
      <div class="dd-tabs-scroll">
        <button v-for="b in brands" :key="b"
          class="dd-tab-item" :class="{ 'dd-tab-item--active': selectedBrand === b }"
          @click="switchBrand(b)">
          {{ b.replace('洗面奶', '') }}
        </button>
      </div>
    </div>

    <!-- 添加链接 -->
    <div v-if="showAddLink" class="dd-link-bar">
      <input v-model="newVideoUrl" placeholder="粘贴抖音视频链接..." class="dd-input" />
      <button class="dd-btn dd-btn--primary dd-btn--sm" @click="addVideoByLink" :disabled="addingLink">
        {{ addingLink ? '解析...' : '添加' }}
      </button>
    </div>

    <div class="dd-hint-bar">近7天 · 消耗10万+素材</div>

    <!-- 视频列表 -->
    <div class="dd-scroll-list">
      <div v-if="loading" class="dd-loading">
        <div class="dd-dots"><i></i><i></i><i></i></div>
        <span>加载中</span>
      </div>

      <template v-else-if="videos.length">
        <div v-for="(v, idx) in videos" :key="v.id"
          class="dd-card dd-card--tap"
          :class="{ 'dd-card--selected': selectedVideo?.id === v.id }"
          @click="selectVideo(v)">
          <div class="dd-card__row">
            <span class="dd-rank" :class="{ 'dd-rank--top': idx < 3 }">{{ idx + 1 }}</span>
            <span class="dd-tag dd-tag--danger">{{ (v.cost/10000).toFixed(1) }}万</span>
            <span class="dd-tag dd-tag--blue">{{ v.content_type }}</span>
            <span class="dd-card__meta-right">{{ v.duration }}</span>
          </div>
          <div class="dd-card__title">{{ v.title }}</div>
          <div v-if="v.hook_text" class="dd-card__hook">{{ v.hook_text }}</div>
          <div class="dd-card__row dd-card__row--bottom">
            <div class="dd-stats">
              <span>{{ formatNum(v.likes) }} 赞</span>
              <span>{{ formatNum(v.comments) }} 评</span>
              <span>{{ formatNum(v.shares) }} 转</span>
            </div>
            <span class="dd-card__sub">{{ v.author }} · {{ v.publish_date }}</span>
          </div>
        </div>
      </template>

      <div v-else class="dd-empty">
        <div class="dd-empty__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <p class="dd-empty__text">选择品牌后自动获取数据</p>
      </div>
    </div>

    <!-- ===== 右侧抽屉 (遮罩 + 面板) ===== -->
    <Teleport to="body">
      <Transition name="dd-drawer-fade">
        <div v-if="drawerOpen" class="dd-drawer-mask" @click="closeDrawer"></div>
      </Transition>
      <Transition name="dd-drawer-slide">
        <div v-if="drawerOpen" class="dd-drawer" :class="{ 'dd-drawer--mobile': isMobile }">
          <!-- 抽屉头部 -->
          <div class="dd-drawer__header">
            <div class="dd-drawer__header-left">
              <span class="dd-tag dd-tag--blue">{{ selectedVideo?.brand }}</span>
              <span class="dd-drawer__header-type">{{ selectedVideo?.content_type }}</span>
            </div>
            <button class="dd-drawer__close" @click="closeDrawer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- 抽屉滚动内容 -->
          <div class="dd-drawer__body" ref="analysisArea">
            <!-- 有视频源时显示播放器 -->
            <div v-if="selectedVideo?.video_url" class="dd-video-preview">
              <video :src="selectedVideo.video_url" controls playsinline preload="metadata"
                :poster="selectedVideo.cover_url || ''" class="dd-video-el"></video>
            </div>
            <!-- 有封面图时显示封面 -->
            <div v-else-if="selectedVideo?.cover_url" class="dd-video-preview dd-video-preview--cover">
              <img :src="selectedVideo.cover_url" alt="" />
            </div>

            <!-- 视频标题信息 -->
            <div class="dd-video-info">
              <h3 class="dd-video-info__title">{{ selectedVideo?.title }}</h3>
              <div class="dd-video-info__meta">
                <span>{{ selectedVideo?.author }}</span>
                <span>{{ selectedVideo?.publish_date }}</span>
                <span>{{ selectedVideo?.duration }}</span>
              </div>
            </div>

            <!-- 核心数据卡片 -->
            <div class="dd-metrics">
              <div class="dd-metric-item">
                <div class="dd-metric-item__val dd-metric-item__val--cost">{{ formatCost(selectedVideo?.cost) }}</div>
                <div class="dd-metric-item__label">消耗</div>
              </div>
              <div class="dd-metric-item">
                <div class="dd-metric-item__val">{{ formatNum(selectedVideo?.likes) }}</div>
                <div class="dd-metric-item__label">点赞</div>
              </div>
              <div class="dd-metric-item">
                <div class="dd-metric-item__val">{{ formatNum(selectedVideo?.comments) }}</div>
                <div class="dd-metric-item__label">评论</div>
              </div>
              <div class="dd-metric-item">
                <div class="dd-metric-item__val">{{ formatNum(selectedVideo?.shares) }}</div>
                <div class="dd-metric-item__label">转发</div>
              </div>
            </div>

            <!-- Hook文案 -->
            <div v-if="selectedVideo?.hook_text" class="dd-section">
              <div class="dd-section__title">Hook文案</div>
              <div class="dd-hook-card">{{ selectedVideo.hook_text }}</div>
            </div>

            <!-- 标签 -->
            <div v-if="selectedVideo?.tags?.length" class="dd-section">
              <div class="dd-section__title">内容标签</div>
              <div class="dd-tag-list">
                <span v-for="tag in selectedVideo.tags" :key="tag" class="dd-tag dd-tag--blue">{{ tag }}</span>
              </div>
            </div>

            <!-- 分析结果 -->
            <div v-if="analyses.length" class="dd-section">
              <div class="dd-section__title">分析报告</div>
              <div v-for="a in analyses" :key="a.id" class="dd-analysis-item">
                <div v-if="a.status === 'done'" class="dd-analysis-card" v-html="formatAnalysis(a.full_analysis)"></div>
                <div v-else-if="a.status === 'analyzing'" class="dd-analysis-loading">
                  <div class="dd-dots"><i></i><i></i><i></i></div>
                  <span>AI深度分析中，正在拆解高CTR画面和话术...</span>
                </div>
                <div v-else class="dd-analysis-error">分析失败{{ a.error_msg ? '：' + a.error_msg : '' }}</div>
              </div>
            </div>
          </div>

          <!-- 抽屉底部操作栏 -->
          <div class="dd-drawer__footer">
            <button class="dd-btn dd-btn--primary dd-btn--lg dd-btn--block" @click="analyzeVideo" :disabled="analyzing">
              <svg v-if="!analyzing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              {{ analyzing ? '分析中...' : '深度分析 + 输出脚本' }}
            </button>
            <button v-if="analyses.length && analyses.some(a => a.status === 'done')"
              class="dd-btn dd-btn--ghost dd-btn--lg" @click="copyReport">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              复制
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import request from '../utils/request'

const brands = ref(['buv洗面奶', '倾颜洗面奶', '韩束洗面奶', 'C咖洗面奶', '草安堂洗面奶'])
const selectedBrand = ref('buv洗面奶')
const videos = ref([])
const analyses = ref([])
const selectedVideo = ref(null)
const drawerOpen = ref(false)
const loading = ref(false)
const refreshing = ref(false)
const analyzing = ref(false)
const showAddLink = ref(false)
const newVideoUrl = ref('')
const addingLink = ref(false)
const isMobile = ref(false)
const analysisArea = ref(null)
let pollTimer = null

function checkMobile() { isMobile.value = window.innerWidth < 768 }

function formatNum(n) {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n.toLocaleString()
}

function formatCost(n) {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function formatAnalysis(text) {
  if (!text) return ''
  return text.replace(/\n/g, '<br>')
    .replace(/━+/g, '<hr class="dd-divider">')
    .replace(/([\u{1F4CA}\u{1FA9D}\u2B50\u{1F4DD}\u{1F48E}\u{1F3AC}\u{1F4CB}])([^<\n]+)/gu, '<div class="dd-section-title-inner">$1 $2</div>')
    .replace(/【(.*?)】/g, '<span class="dd-mark--blue">【$1】</span>')
    .replace(/「(.*?)」/g, '<span class="dd-mark--red">「$1」</span>')
}

function switchBrand(b) {
  selectedBrand.value = b
  closeDrawer()
  loadVideos()
}

function closeDrawer() {
  drawerOpen.value = false
  selectedVideo.value = null
  analyses.value = []
  // 解除 body 滚动锁定
  document.body.style.overflow = ''
}

async function loadVideos(autoFetch = true) {
  loading.value = true
  try {
    const r = await request.get('/competitor-videos/list', { params: { brand: selectedBrand.value, page_size: 30 } })
    if (r?.code === 0) {
      videos.value = r.data?.list || []
      if (videos.value.length === 0 && autoFetch && !refreshing.value) {
        refreshVideos()
      }
    }
  } catch {} finally { loading.value = false }
}

async function addVideoByLink() {
  if (!newVideoUrl.value.trim()) return alert('请粘贴抖音视频链接')
  addingLink.value = true
  try {
    const r = await request.post('/competitor-videos/add-by-link', {
      url: newVideoUrl.value.trim(),
      brand: selectedBrand.value,
    })
    if (r?.code === 0) {
      newVideoUrl.value = ''
      showAddLink.value = false
      loadVideos()
    } else { alert(r?.msg || '添加失败') }
  } catch (e) { alert('请求失败: ' + e.message) } finally { addingLink.value = false }
}

async function refreshVideos() {
  refreshing.value = true
  try {
    const r = await request.post('/competitor-videos/refresh', { brand: selectedBrand.value })
    if (r?.code === 0) videos.value = r.data?.list || []
    else alert(r?.msg || '抓取失败')
  } catch (e) { alert('请求失败: ' + e.message) } finally { refreshing.value = false }
}

async function selectVideo(v) {
  selectedVideo.value = v
  drawerOpen.value = true
  // 锁定 body 滚动
  document.body.style.overflow = 'hidden'
  try {
    const r = await request.get('/competitor-videos/analysis/list', { params: { video_id: v.id } })
    if (r?.code === 0) analyses.value = (r.data?.list || []).reverse()
    scrollBottom()
  } catch {}
}

async function analyzeVideo() {
  if (!selectedVideo.value || analyzing.value) return
  analyzing.value = true
  try {
    const v = selectedVideo.value
    const r = await request.post('/competitor-videos/analyze', {
      video_id: v.id, video_title: v.title, brand: v.brand,
      video_cost: v.cost, video_likes: v.likes, video_duration: v.duration,
      video_tags: v.tags, content_type: v.content_type, hook_text: v.hook_text,
    })
    if (r?.code === 0) {
      analyses.value.push({ id: r.data.id, status: 'analyzing' })
      scrollBottom()
    } else { alert(r?.msg || '失败') }
  } catch (e) { alert(e.message) } finally { analyzing.value = false }
}

async function copyReport() {
  const a = analyses.value.find(x => x.status === 'done')
  if (!a?.full_analysis) return
  try { await navigator.clipboard.writeText(a.full_analysis); alert('已复制') } catch { alert('复制失败') }
}

function scrollBottom() {
  nextTick(() => { if (analysisArea.value) analysisArea.value.scrollTop = analysisArea.value.scrollHeight })
}

function poll() {
  if (analyses.value.some(a => a.status === 'analyzing') && selectedVideo.value) {
    request.get('/competitor-videos/analysis/list', { params: { video_id: selectedVideo.value.id } })
      .then(r => { if (r?.code === 0) { analyses.value = (r.data?.list || []).reverse(); scrollBottom() } })
  }
}

onMounted(() => {
  checkMobile(); window.addEventListener('resize', checkMobile)
  loadVideos()
  pollTimer = setInterval(poll, 5000)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  if (pollTimer) clearInterval(pollTimer)
  document.body.style.overflow = ''
})
</script>

<style scoped>
/* ===== Page ===== */
.dd-page {
  display: flex; flex-direction: column;
  height: calc(100vh - var(--header-h) - var(--tabnav-h) - var(--safe-b));
  margin: -16px; background: var(--bg-card);
}
@media (min-width: 768px) {
  .dd-page { height: calc(100vh - var(--header-h)); margin: -20px -24px; }
}

/* ===== List Head ===== */
.dd-list-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px; flex-shrink: 0;
}
.dd-list-head__title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.dd-list-head__actions { display: flex; gap: 8px; }

/* ===== Tabs ===== */
.dd-tabs-bar { padding: 0 16px 10px; flex-shrink: 0; }
.dd-tabs-scroll {
  display: flex; gap: 8px; overflow-x: auto;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.dd-tabs-scroll::-webkit-scrollbar { display: none; }
.dd-tab-item {
  padding: 6px 16px; border-radius: 18px; font-size: 13px; font-weight: 500;
  color: var(--text-secondary); background: var(--bg-secondary);
  border: 1px solid transparent; cursor: pointer;
  white-space: nowrap; flex-shrink: 0; transition: all 0.2s;
}
.dd-tab-item:active { transform: scale(0.96); }
.dd-tab-item--active { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }

/* ===== Link / Hint ===== */
.dd-link-bar { display: flex; gap: 8px; padding: 0 16px 10px; flex-shrink: 0; }
.dd-hint-bar { padding: 0 16px 8px; font-size: 12px; color: var(--text-hint); flex-shrink: 0; }

/* ===== Scroll List ===== */
.dd-scroll-list {
  flex: 1; overflow-y: auto; padding: 0 8px 8px;
  -webkit-overflow-scrolling: touch;
}

/* ===== Card ===== */
.dd-card {
  background: var(--bg-card); border-radius: var(--radius-sm);
  padding: 12px; margin-bottom: 8px;
  border: 1.5px solid transparent; transition: all 0.15s;
}
.dd-card--tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.dd-card--tap:active { background: var(--bg-secondary); transform: scale(0.99); }
.dd-card--selected { border-color: var(--c-primary); background: var(--c-primary-bg); }
.dd-card__row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.dd-card__row--bottom { margin-bottom: 0; margin-top: 8px; flex-wrap: wrap; justify-content: space-between; }
.dd-card__meta-right { margin-left: auto; font-size: 11px; color: var(--text-hint); }
.dd-card__title {
  font-size: 14px; font-weight: 500; color: var(--text-primary);
  line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.dd-card__hook {
  margin-top: 4px; padding: 4px 8px; border-radius: var(--radius-xs);
  font-size: 12px; color: var(--c-warning); background: var(--c-warning-bg);
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
}
.dd-card__sub { font-size: 11px; color: var(--text-hint); }

/* ===== Rank ===== */
.dd-rank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: var(--bg-secondary); color: var(--text-hint);
}
.dd-rank--top { background: linear-gradient(135deg, #FF6B35, #FF3D00); color: #fff; }

/* ===== Stats ===== */
.dd-stats { display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); }

/* ===== Tags ===== */
.dd-tag {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500; white-space: nowrap;
}
.dd-tag--sm { font-size: 10px; padding: 1px 6px; }
.dd-tag--danger { color: var(--c-danger); background: var(--c-danger-bg); }
.dd-tag--blue { color: var(--c-primary); background: var(--c-primary-bg); }

/* ============================================
   右侧抽屉
   ============================================ */

/* 遮罩 */
.dd-drawer-mask {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(2px);
}

/* 抽屉面板 */
.dd-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 480px; max-width: 100vw; z-index: 1001;
  display: flex; flex-direction: column;
  background: var(--bg-page);
  box-shadow: -8px 0 32px rgba(0,0,0,0.12);
}
.dd-drawer--mobile { width: 100vw; }

/* 抽屉头部 */
.dd-drawer__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; background: var(--bg-card);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.dd-drawer__header-left { display: flex; align-items: center; gap: 8px; }
.dd-drawer__header-type { font-size: 12px; color: var(--text-hint); }
.dd-drawer__close {
  width: 36px; height: 36px; border: none; background: none;
  border-radius: var(--radius-sm); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-hint); transition: all 0.15s;
}
.dd-drawer__close:hover { background: var(--bg-secondary); color: var(--text-primary); }
.dd-drawer__close:active { transform: scale(0.92); }

/* 抽屉滚动内容 */
.dd-drawer__body {
  flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
}

/* 视频预览区 - 仅有视频/封面时显示 */
.dd-video-preview {
  background: #000; width: 100%;
  aspect-ratio: 9 / 12; max-height: 360px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.dd-video-preview--cover { aspect-ratio: 16 / 9; max-height: 240px; }
.dd-video-preview--cover img { width: 100%; height: 100%; object-fit: cover; }
.dd-video-el { width: 100%; height: 100%; object-fit: contain; background: #000; }

/* 视频信息 */
.dd-video-info { padding: 14px 16px 10px; background: var(--bg-card); }
.dd-video-info__title {
  font-size: 15px; font-weight: 600; color: var(--text-primary);
  line-height: 1.5; margin: 0 0 6px;
}
.dd-video-info__meta {
  display: flex; gap: 12px; font-size: 12px; color: var(--text-hint);
}

/* 核心指标网格 */
.dd-metrics {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 1px; background: var(--border); margin: 8px 0;
}
.dd-metric-item {
  background: var(--bg-card); padding: 14px 8px;
  text-align: center;
}
.dd-metric-item__val {
  font-size: 18px; font-weight: 700; color: var(--text-primary);
  line-height: 1.2; margin-bottom: 4px;
}
.dd-metric-item__val--cost { color: var(--c-danger); }
.dd-metric-item__label {
  font-size: 11px; color: var(--text-hint); font-weight: 500;
}

/* 内容区块 */
.dd-section { padding: 12px 16px; background: var(--bg-card); margin-bottom: 8px; }
.dd-section__title {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 8px;
}
.dd-hook-card {
  padding: 10px 12px; border-radius: var(--radius-sm);
  background: var(--c-warning-bg); color: var(--c-warning);
  font-size: 13px; line-height: 1.5;
}
.dd-tag-list { display: flex; gap: 6px; flex-wrap: wrap; }

/* 分析结果 */
.dd-analysis-item { margin-bottom: 12px; }
.dd-analysis-card {
  background: var(--bg-secondary); border-radius: var(--radius-md);
  padding: 16px; font-size: 14px; line-height: 1.8; color: var(--text-primary);
}
.dd-analysis-card :deep(.dd-divider) { border: none; border-top: 1px solid var(--divider); margin: 10px 0; }
.dd-analysis-card :deep(.dd-section-title-inner) { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 14px 0 6px; }
.dd-analysis-card :deep(.dd-mark--blue) { color: var(--c-primary); font-weight: 600; }
.dd-analysis-card :deep(.dd-mark--red) { color: var(--c-danger); }
.dd-analysis-loading {
  display: flex; align-items: center; gap: 8px; justify-content: center;
  padding: 24px 16px; background: var(--bg-secondary); border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-hint);
}
.dd-analysis-error {
  padding: 16px; background: var(--c-danger-bg); border-radius: var(--radius-md);
  color: var(--c-danger); font-size: 13px; text-align: center;
}

/* 抽屉底部操作栏 */
.dd-drawer__footer {
  display: flex; gap: 10px; padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--bg-card); border-top: 1px solid var(--border);
  flex-shrink: 0;
}

/* ===== Buttons ===== */
.dd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}
.dd-btn:active { transform: scale(0.97); }
.dd-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.dd-btn--sm { padding: 5px 12px; font-size: 12px; }
.dd-btn--lg { padding: 12px 20px; font-size: 15px; font-weight: 600; border-radius: var(--radius-md); }
.dd-btn--block { flex: 1; }
.dd-btn--primary { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }
.dd-btn--primary:active:not(:disabled) { background: #1060DD; }
.dd-btn--ghost { background: var(--bg-card); color: var(--text-secondary); border-color: var(--border); }
.dd-btn--ghost:active:not(:disabled) { background: var(--bg-secondary); }

/* ===== Input ===== */
.dd-input {
  flex: 1; padding: 8px 12px; border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 14px; outline: none;
  background: var(--bg-card); color: var(--text-primary); transition: border-color 0.15s;
}
.dd-input:focus { border-color: var(--c-primary); }
.dd-input::placeholder { color: var(--text-hint); }

/* ===== Loading / Empty ===== */
.dd-dots { display: flex; gap: 4px; }
.dd-dots i {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--text-hint); animation: dd-bounce 1.4s infinite; font-style: normal;
}
.dd-dots i:nth-child(2) { animation-delay: 0.16s; }
.dd-dots i:nth-child(3) { animation-delay: 0.32s; }
@keyframes dd-bounce { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }

.dd-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 48px 16px; color: var(--text-hint); font-size: 13px;
}
.dd-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; flex: 1; padding: 48px 20px;
}
.dd-empty__icon { margin-bottom: 12px; opacity: 0.4; }
.dd-empty__text { font-size: 13px; color: var(--text-hint); margin: 0; }

/* ===== Drawer Transitions ===== */
.dd-drawer-fade-enter-active, .dd-drawer-fade-leave-active {
  transition: opacity 0.25s ease;
}
.dd-drawer-fade-enter-from, .dd-drawer-fade-leave-to { opacity: 0; }

.dd-drawer-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}
.dd-drawer-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.55, 0, 1, 0.45);
}
.dd-drawer-slide-enter-from, .dd-drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
