<template>
  <div class="dd-page">
    <!-- 移动端分析面板返回 -->
    <div v-if="isMobile && showAnalysis" class="dd-navbar">
      <button class="dd-navbar__back" @click="showAnalysis = false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        <span>返回列表</span>
      </button>
      <span class="dd-navbar__title">内容拆解</span>
      <span style="width:60px"></span>
    </div>

    <div class="dd-split" :class="{ 'dd-split--detail': isMobile && showAnalysis }">
      <!-- 列表面板 -->
      <div class="dd-list-panel" v-show="!isMobile || !showAnalysis">
        <div class="dd-list-head">
          <div class="dd-list-head__title">洁面内容榜单</div>
          <button class="dd-btn dd-btn--primary dd-btn--sm" @click="refreshVideos" :disabled="refreshing">
            <svg v-if="!refreshing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {{ refreshing ? '抓取中...' : '刷新数据' }}
          </button>
        </div>

        <div class="dd-hint-bar">Top 20 热门洁面内容</div>

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
                <span class="dd-card__author">{{ v.author }}</span>
                <span class="dd-card__fans">{{ v.author_fans }}粉</span>
                <span class="dd-card__meta-right">{{ v.duration }}</span>
              </div>
              <div class="dd-card__title">{{ v.title }}</div>
              <div class="dd-card__row dd-card__row--bottom">
                <div class="dd-stats">
                  <span>{{ formatNum(v.likes) }} 赞</span>
                  <span>{{ formatNum(v.comments) }} 评</span>
                  <span>{{ formatNum(v.shares) }} 转</span>
                </div>
                <div class="dd-card__tags">
                  <span v-for="tag in (v.tags || []).slice(0, 2)" :key="tag" class="dd-tag dd-tag--blue dd-tag--sm">{{ tag }}</span>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="dd-empty">
            <div class="dd-empty__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <p class="dd-empty__text">暂无内容榜单数据</p>
            <button class="dd-btn dd-btn--primary dd-btn--sm" style="margin-top:12px" @click="refreshVideos" :disabled="refreshing">
              {{ refreshing ? '抓取中...' : '获取榜单' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 分析面板 -->
      <div class="dd-detail-panel" v-show="!isMobile || showAnalysis">
        <div v-if="!selectedVideo" class="dd-welcome">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="1.2" opacity="0.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3 class="dd-welcome__title">内容榜单拆解</h3>
          <p class="dd-welcome__desc">选择视频，AI为你分析拆解爆款秘诀</p>
        </div>

        <template v-else>
          <div class="dd-detail-head">
            <div class="dd-detail-head__title">{{ selectedVideo.title }}</div>
            <div class="dd-detail-head__info">
              <span>{{ selectedVideo.author }} · {{ selectedVideo.author_fans }}粉</span>
              <span>{{ formatNum(selectedVideo.likes) }} 赞 · {{ formatNum(selectedVideo.comments) }} 评</span>
            </div>
          </div>

          <div class="dd-analysis-scroll" ref="analysisArea">
            <div v-for="a in analyses" :key="a.id" class="dd-analysis-item">
              <div v-if="a.status === 'done'" class="dd-analysis-card" v-html="formatAnalysis(a.full_analysis)"></div>
              <div v-else-if="a.status === 'analyzing'" class="dd-analysis-loading">
                <div class="dd-dots"><i></i><i></i><i></i></div>
                <span>AI正在深度分析拆解中...</span>
              </div>
              <div v-else class="dd-analysis-error">分析失败{{ a.error_msg ? '：' + a.error_msg : '' }}</div>
            </div>
          </div>

          <div class="dd-action-bar">
            <button class="dd-btn dd-btn--primary dd-btn--lg dd-btn--block" @click="analyzeVideo" :disabled="analyzing">
              {{ analyzing ? '分析中...' : 'AI深度拆解' }}
            </button>
            <button v-if="analyses.length && analyses[0]?.status === 'done'"
              class="dd-btn dd-btn--ghost dd-btn--lg" @click="copyAnalysis">
              复制
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import request from '../utils/request'

const videos = ref([])
const analyses = ref([])
const selectedVideo = ref(null)
const loading = ref(false)
const refreshing = ref(false)
const analyzing = ref(false)
const showAnalysis = ref(false)
const isMobile = ref(false)
const analysisArea = ref(null)
let pollTimer = null

function checkMobile() { isMobile.value = window.innerWidth < 768 }
function formatNum(n) { if (!n) return '0'; if (n >= 10000) return (n / 10000).toFixed(1) + 'w'; return n.toLocaleString() }

function formatAnalysis(text) {
  if (!text) return ''
  return text.replace(/\n/g, '<br>')
    .replace(/━+/g, '<hr class="dd-divider">')
    .replace(/([\u{1F4CA}\u{1FA9D}\u{1F3AC}\u2B50\u{1F48E}\u{1F4DD}\u{1F3B5}\u{1F527}\u{1F3AF}])([^<\n]+)/gu, '<div class="dd-section-title">$1 $2</div>')
    .replace(/【(.*?)】/g, '<span class="dd-mark--blue">【$1】</span>')
    .replace(/「(.*?)」/g, '<span class="dd-mark--red">「$1」</span>')
}

async function loadVideos() {
  loading.value = true
  try {
    const r = await request.get('/industry-videos/list', { params: { page: 1, page_size: 30 } })
    if (r?.code === 0) videos.value = r.data?.list || []
  } catch {} finally { loading.value = false }
}

async function refreshVideos() {
  refreshing.value = true
  try {
    const r = await request.post('/industry-videos/refresh')
    if (r?.code === 0) videos.value = r.data?.list || []
    else alert(r?.msg || '刷新失败')
  } catch (e) { alert('请求失败: ' + e.message) } finally { refreshing.value = false }
}

async function selectVideo(v) {
  selectedVideo.value = v
  if (isMobile.value) showAnalysis.value = true
  await loadAnalyses(v.id)
}

async function loadAnalyses(videoId) {
  try {
    const r = await request.get('/industry-videos/analysis/list', { params: { video_id: videoId, page_size: 20 } })
    if (r?.code === 0) analyses.value = (r.data?.list || []).reverse()
    scrollBottom()
  } catch {}
}

async function analyzeVideo() {
  if (!selectedVideo.value || analyzing.value) return
  analyzing.value = true
  try {
    const v = selectedVideo.value
    const r = await request.post('/industry-videos/analyze', {
      video_id: v.id, video_title: v.title, video_author: v.author,
      video_likes: v.likes, video_duration: v.duration, video_tags: v.tags || [],
    })
    if (r?.code === 0) {
      analyses.value.push({ id: r.data.id, video_title: v.title, status: 'analyzing' })
      scrollBottom()
    } else { alert(r?.msg || '分析失败') }
  } catch (e) { alert('请求失败: ' + e.message) } finally { analyzing.value = false }
}

async function copyAnalysis() {
  const latest = analyses.value.find(a => a.status === 'done')
  if (!latest?.full_analysis) return
  try { await navigator.clipboard.writeText(latest.full_analysis); alert('已复制') } catch { alert('复制失败') }
}

function scrollBottom() { nextTick(() => { if (analysisArea.value) analysisArea.value.scrollTop = analysisArea.value.scrollHeight }) }

function pollAnalyses() {
  if (analyses.value.some(a => a.status === 'analyzing') && selectedVideo.value) {
    loadAnalyses(selectedVideo.value.id)
  }
}

onMounted(() => {
  checkMobile(); window.addEventListener('resize', checkMobile)
  loadVideos()
  pollTimer = setInterval(pollAnalyses, 5000)
})
onUnmounted(() => { window.removeEventListener('resize', checkMobile); if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
/* ===== Page Shell ===== */
.dd-page {
  display: flex; flex-direction: column;
  height: calc(100vh - var(--header-h) - var(--tabnav-h) - var(--safe-b));
  margin: -16px; background: var(--bg-page);
}
@media (min-width: 768px) {
  .dd-page { height: calc(100vh - var(--header-h)); margin: -20px -24px; }
}

.dd-navbar {
  display: flex; align-items: center; justify-content: space-between;
  height: 44px; padding: 0 12px;
  background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.dd-navbar__back {
  display: flex; align-items: center; gap: 2px;
  background: none; border: none; color: var(--c-primary);
  font-size: 14px; cursor: pointer; padding: 0;
}
.dd-navbar__title { font-size: 15px; font-weight: 600; color: var(--text-primary); }

.dd-split { display: flex; flex: 1; overflow: hidden; }
@media (max-width: 767px) {
  .dd-split { flex-direction: column; position: relative; }
  .dd-split--detail .dd-detail-panel { display: flex !important; }
}

.dd-list-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--bg-card); }
@media (min-width: 768px) { .dd-list-panel { width: 380px; flex-shrink: 0; border-right: 1px solid var(--border); } }

.dd-list-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px; flex-shrink: 0;
}
.dd-list-head__title { font-size: 16px; font-weight: 600; color: var(--text-primary); }

.dd-hint-bar { padding: 0 16px 8px; font-size: 12px; color: var(--text-hint); flex-shrink: 0; }

.dd-scroll-list { flex: 1; overflow-y: auto; padding: 0 8px 8px; -webkit-overflow-scrolling: touch; }

/* Cards */
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
.dd-card__author { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.dd-card__fans { font-size: 11px; color: var(--text-hint); }
.dd-card__title {
  font-size: 14px; font-weight: 500; color: var(--text-primary);
  line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.dd-card__tags { display: flex; gap: 4px; }

.dd-rank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: var(--bg-secondary); color: var(--text-hint);
}
.dd-rank--top { background: linear-gradient(135deg, #FF6B35, #FF3D00); color: #fff; }

.dd-stats { display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); }

.dd-tag {
  display: inline-flex; align-items: center; padding: 2px 8px;
  border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap;
}
.dd-tag--sm { font-size: 10px; padding: 1px 6px; }
.dd-tag--blue { color: var(--c-primary); background: var(--c-primary-bg); }

/* Detail */
.dd-detail-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-page); }
@media (max-width: 767px) { .dd-detail-panel { position: absolute; inset: 0; top: 44px; z-index: 5; display: none; } }

.dd-welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; }
.dd-welcome__title { font-size: 18px; color: var(--text-primary); margin: 16px 0 6px; }
.dd-welcome__desc { font-size: 13px; color: var(--text-hint); }

.dd-detail-head { padding: 14px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.dd-detail-head__title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.dd-detail-head__info { display: flex; gap: 12px; font-size: 12px; color: var(--text-hint); }

.dd-analysis-scroll { flex: 1; overflow-y: auto; padding: 12px; -webkit-overflow-scrolling: touch; }
.dd-analysis-item { margin-bottom: 12px; }
.dd-analysis-card {
  background: var(--bg-card); border-radius: var(--radius-md);
  padding: 16px; box-shadow: var(--shadow-xs);
  font-size: 14px; line-height: 1.8; color: var(--text-primary);
}
.dd-analysis-card :deep(.dd-divider) { border: none; border-top: 1px solid var(--divider); margin: 10px 0; }
.dd-analysis-card :deep(.dd-section-title) { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 14px 0 6px; }
.dd-analysis-card :deep(.dd-mark--blue) { color: var(--c-primary); font-weight: 600; }
.dd-analysis-card :deep(.dd-mark--red) { color: var(--c-danger); }
.dd-analysis-loading {
  display: flex; align-items: center; gap: 8px; justify-content: center;
  padding: 24px 16px; background: var(--bg-card); border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-hint);
}
.dd-analysis-error {
  padding: 16px; background: var(--c-danger-bg); border-radius: var(--radius-md);
  color: var(--c-danger); font-size: 13px; text-align: center;
}

.dd-action-bar {
  display: flex; gap: 10px; padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--bg-card); border-top: 1px solid var(--border); flex-shrink: 0;
}
@media (min-width: 768px) { .dd-action-bar { padding-bottom: 12px; } }

.dd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s; white-space: nowrap; -webkit-tap-highlight-color: transparent;
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

.dd-dots { display: flex; gap: 4px; }
.dd-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-hint); animation: dd-bounce 1.4s infinite; font-style: normal; }
.dd-dots i:nth-child(2) { animation-delay: 0.16s; }
.dd-dots i:nth-child(3) { animation-delay: 0.32s; }
@keyframes dd-bounce { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }

.dd-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 48px 16px; color: var(--text-hint); font-size: 13px; }
.dd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 48px 20px; }
.dd-empty__icon { margin-bottom: 12px; opacity: 0.4; }
.dd-empty__text { font-size: 13px; color: var(--text-hint); margin: 0; }
</style>
