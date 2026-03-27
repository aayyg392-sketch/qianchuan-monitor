<template>
  <div class="materials-page">
    <!-- 核心数据汇总头部 -->
    <div class="stats-header" v-if="headerStats">
      <div class="stats-section">
        <div class="stats-section-title">
          <span class="section-dot today"></span>今日数据
        </div>
        <div class="stats-grid today-grid">
          <div class="stat-card">
            <div class="stat-label">素材消耗</div>
            <div class="stat-value primary">¥{{ formatNum(headerStats.today?.cost) }}</div>
            <div class="stat-change" :class="getChangeClass(headerStats.today?.cost_change)">
              {{ formatChange(headerStats.today?.cost_change) }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">素材ROI</div>
            <div class="stat-value green">{{ formatRoi(headerStats.today?.roi) }}</div>
            <div class="stat-change" :class="getChangeClass(headerStats.today?.roi_change)">
              {{ formatChange(headerStats.today?.roi_change) }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">点击率CTR</div>
            <div class="stat-value purple">{{ formatPercent(headerStats.today?.ctr) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">今日新素材消耗</div>
            <div class="stat-value orange">¥{{ formatNum(headerStats.today?.today_new_cost) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">今日上新</div>
            <div class="stat-value new-tag">{{ formatInt(headerStats.today?.new_materials) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">新素材CTR</div>
            <div class="stat-value purple">{{ formatCtr(headerStats.today?.new_ctr) }}</div>
            <div class="stat-change" :class="getCtrChangeClass(headerStats.today?.new_ctr, headerStats.today?.yesterday_new_ctr)">
              {{ formatCtrChange(headerStats.today?.new_ctr, headerStats.today?.yesterday_new_ctr) }}
            </div>
          </div>
        </div>
      </div>
      <div class="stats-section">
        <div class="stats-section-title">
          <span class="section-dot week"></span>近7天数据
        </div>
        <div class="stats-grid week-grid">
          <div class="stat-card">
            <div class="stat-label">总消耗</div>
            <div class="stat-value primary">¥{{ formatNum(headerStats.week?.cost) }}</div>
            <div class="stat-change" :class="getChangeClass(headerStats.week?.cost_change)">
              {{ formatChange(headerStats.week?.cost_change) }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">平均ROI</div>
            <div class="stat-value green">{{ formatRoi(headerStats.week?.roi) }}</div>
            <div class="stat-change" :class="getChangeClass(headerStats.week?.roi_change)">
              {{ formatChange(headerStats.week?.roi_change) }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">新素材消耗</div>
            <div class="stat-value orange">¥{{ formatNum(headerStats.week?.new_cost) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">新素材数</div>
            <div class="stat-value purple">{{ formatInt(headerStats.week?.new_materials) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">总GMV</div>
            <div class="stat-value green">¥{{ formatNum(headerStats.week?.gmv) }}</div>
            <div class="stat-change" :class="getChangeClass(headerStats.week?.gmv_change)">
              {{ formatChange(headerStats.week?.gmv_change) }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">新素材CTR</div>
            <div class="stat-value purple">{{ formatCtr(headerStats.week?.new_ctr) }}</div>
            <div class="stat-change" :class="getCtrChangeClass(headerStats.week?.new_ctr, headerStats.week?.prev_new_ctr)">
              {{ formatCtrChange(headerStats.week?.new_ctr, headerStats.week?.prev_new_ctr) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-scroll">
        <input v-model="searchText" class="search-input" placeholder="搜索视频名称" @input="debounceLoad" />
      </div>
      <div class="filter-actions">
        <a-range-picker v-model:value="dateRange" :allow-clear="false" size="small" class="date-picker" @change="loadData" />
        <button class="sort-btn" @click="showSortDrawer = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/>
          </svg>
          排序
        </button>
      </div>
    </div>

    <!-- 当前筛选汇总 -->
    <div class="summary-row" v-if="!headerStats">
      <div class="summary-item" v-for="s in summaryStats" :key="s.key">
        <div class="summary-label">{{ s.label }}</div>
        <div class="summary-value" :style="{ color: s.color }">{{ s.value }}</div>
      </div>
    </div>

    <!-- 同步封面提示 -->
    <div class="cover-tip" v-if="!loading && materials.length > 0 && !hasCover">
      <span>部分视频封面未同步</span>
      <button class="sync-btn" @click="syncCovers" :disabled="syncing">{{ syncing ? '同步中...' : '同步封面' }}</button>
    </div>

    <!-- 素材卡片网格 -->
    <div class="material-grid" v-if="!loading && materials.length > 0">
      <div class="material-card" v-for="(item, idx) in materials" :key="item.material_id" @click="openDetail(item)">
        <div class="card-cover" :style="getCoverStyle(idx)">
          <img v-if="item.cover_url" :src="item.cover_url" :alt="item.title" class="cover-img" />
          <div v-else class="cover-placeholder">
            <div class="cover-title-text">{{ (item.title || '').substring(0, 12) }}</div>
            <div class="cover-play-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)" stroke="none">
                <polygon points="6 3 20 12 6 21 6 3"/>
              </svg>
            </div>
          </div>
          <span class="rank-tag" :class="getRankClass(idx)">{{ idx + 1 }}</span>
          <span v-if="parseFloat(item.ai_score)" class="ai-tag" :class="getScoreClass(parseFloat(item.ai_score))">AI {{ parseFloat(item.ai_score).toFixed(0) }}分</span>
        </div>
        <div class="card-title">{{ getVideoName(item.title) }}</div>
        <div class="card-metrics">
          <div class="metric-cell">
            <span class="m-label">消耗</span>
            <span class="m-value primary">&yen;{{ formatNum(item.cost) }}</span>
          </div>
          <div class="metric-cell">
            <span class="m-label">ROI</span>
            <span class="m-value" :class="getRoiClass(item.roi)">{{ formatRoi(item.roi) }}</span>
          </div>
          <div class="metric-cell">
            <span class="m-label">CTR</span>
            <span class="m-value highlight">{{ formatPercent(item.product_ctr) }}</span>
          </div>
          <div class="metric-cell">
            <span class="m-label">完播率</span>
            <span class="m-value">{{ formatPercent(item.video_finish_rate) }}</span>
          </div>
          <div class="metric-cell">
            <span class="m-label">播放数</span>
            <span class="m-value">{{ formatBig(item.video_play_count || item.show_cnt) }}</span>
          </div>
          <div class="metric-cell">
            <span class="m-label">点击数</span>
            <span class="m-value">{{ formatBig(item.product_click_count) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!loading && materials.length === 0">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <p>暂无素材数据</p>
      <p class="empty-hint">请先触发数据同步</p>
    </div>

    <div class="loading-state" v-if="loading"><a-spin size="large" /></div>

    <!-- 素材详情右侧抽屉 -->
    <a-drawer
      v-model:open="showDetail"
      placement="right"
      :width="440"
      :closable="false"
      :headerStyle="{ display: 'none' }"
      :bodyStyle="{ padding: '0', background: '#F7F8FA' }"
      class="detail-drawer"
    >
      <div class="dp" v-if="detailItem">
        <!-- 顶部关闭栏 -->
        <div class="dp-topbar">
          <span class="dp-title">素材详情</span>
          <button class="dp-close" @click="showDetail = false">✕</button>
        </div>
        <!-- 视频/封面区域 -->
        <div class="dp-media">
          <div class="dp-video-wrap">
            <video
              :src="`/api/materials/${detailItem.material_id}/video-proxy`"
              :poster="detailItem.cover_url"
              controls
              playsinline
              preload="auto"
              class="dp-video"
              @error="detailItem._videoErr = true"
            ></video>
            <div v-if="detailItem._videoErr" class="dp-video-err">
              <span>视频加载失败（可能未在千川近期视频中）</span>
              <a class="dp-qc-link-sm" :href="getQCLink(detailItem)" target="_blank">在千川查看 ↗</a>
            </div>
          </div>
        </div>
        <!-- 素材名 + 千川链接 -->
        <div class="dp-info-card">
          <div class="dp-name">{{ getVideoName(detailItem.title) }}</div>
          <a class="dp-qc-link" :href="getQCLink(detailItem)" target="_blank" @click.stop>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            在千川查看
          </a>
        </div>
        <!-- 核心指标卡片 -->
        <div class="dp-kpi-grid">
          <div class="dp-kpi" v-for="s in detailStats.slice(0, 4)" :key="s.label">
            <div class="dp-kpi-val">{{ s.value }}</div>
            <div class="dp-kpi-label">{{ s.label }}</div>
          </div>
        </div>
        <!-- 详细指标列表 -->
        <div class="dp-metrics-card">
          <div class="dp-metric-row" v-for="s in detailStats.slice(4)" :key="s.label">
            <span class="dp-metric-label">{{ s.label }}</span>
            <span class="dp-metric-val">{{ s.value }}</span>
          </div>
        </div>
        <!-- 操作按钮 -->
        <div class="dp-actions">
          <button class="dp-act-btn dp-act-remix" @click.stop="goRemix(detailItem)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            AI 翻剪推荐
          </button>
          <button class="dp-act-btn dp-act-analysis" @click.stop="goAnalysis(detailItem)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            内容分析
          </button>
        </div>
      </div>
    </a-drawer>

    <a-drawer v-model:open="showSortDrawer" title="排序方式" placement="bottom" height="280" :closable="true">
      <div class="sort-options">
        <div class="sort-option" v-for="opt in sortOptions" :key="opt.value" :class="{ active: sortBy === opt.value }" @click="applySort(opt.value)">
          <span>{{ opt.label }}</span>
          <svg v-if="sortBy === opt.value" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import request from '../utils/request'

const router = useRouter()
const dimLabels = { roi_performance: 'ROI表现', order_volume: '出单能力', cost_efficiency: '成本效率', gmv_contribution: 'GMV贡献' }

const sortOptions = [
  { label: '消耗从高到低', value: 'cost_desc' },
  { label: '消耗从低到高', value: 'cost_asc' },
  { label: 'GMV从高到低', value: 'gmv_desc' },

  { label: 'ROI从高到低', value: 'roi_desc' },
  { label: '千元出单从高到低', value: 'orders_per_1k_desc' },
  { label: 'AI评分从高到低', value: 'ai_score_desc' },
]

const searchText = ref('')
const dateRange = ref([dayjs().subtract(6, 'day'), dayjs()])
const sortBy = ref('cost_desc')
const loading = ref(false)
const materials = ref([])
const summary = ref({})
const showSortDrawer = ref(false)
const showDetail = ref(false)
const detailItem = ref(null)
const syncing = ref(false)
const headerStats = ref(null)
let debounceTimer = null


const hasCover = computed(() => materials.value.some(m => m.cover_url))

const summaryStats = computed(() => {
  const s = summary.value
  return [
    { key: 'cost', label: '总消耗', value: '\u00A5' + formatNum(s.total_cost), color: '#1677FF' },
    { key: 'gmv', label: '总GMV', value: '\u00A5' + formatNum(s.total_gmv), color: '#00B96B' },
    { key: 'roi', label: '平均ROI', value: formatRoi(s.avg_roi), color: '#FA8C16' },
    { key: 'orders_per_1k', label: '千元出单', value: formatRoi(s.orders_per_1k_cost), color: '#722ED1' },
  ]
})

const detailStats = computed(() => {
  if (!detailItem.value) return []
  const m = detailItem.value
  return [
    { label: '消耗', value: '\u00A5' + formatNum(m.cost) },

    { label: '成交GMV', value: '\u00A5' + formatNum(m.pay_order_amount) },
    { label: 'ROI', value: formatRoi(m.roi) },
    { label: '客单价', value: '\u00A5' + formatNum(m.avg_order_value) },
    { label: '千元出单', value: formatRoi(m.orders_per_1k_cost) },
    { label: '展示次数', value: formatInt(m.product_show_count) },
    { label: '点击率CTR', value: formatPercent(m.product_ctr) },
    { label: '转化率', value: formatPercent(m.product_convert_rate) },
    { label: '播放数', value: formatInt(m.video_play_count || m.show_cnt) },
    { label: '完播率', value: formatPercent(m.video_finish_rate) },
    { label: '点击数', value: formatInt(m.product_click_count) },
  ]
})

function formatNum(v) { if (!v) return '0.00'; return parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
function formatInt(v) { if (!v) return '0'; return parseInt(v).toLocaleString() }
function formatBig(v) { if (!v) return '0'; const n = parseInt(v); if (n >= 10000) return (n / 10000).toFixed(1) + 'w'; return n.toLocaleString() }
function formatRoi(v) { if (!v) return '0.00'; return parseFloat(v).toFixed(2) }
function formatPercent(v) { if (!v) return '0.00%'; const n = parseFloat(v); return n > 1 ? n.toFixed(2) + '%' : (n * 100).toFixed(2) + '%' }
function getRankClass(idx) { if (idx === 0) return 'gold'; if (idx === 1) return 'silver'; if (idx === 2) return 'bronze'; return '' }
function getRoiClass(v) { const n = parseFloat(v); if (n >= 3) return 'good'; if (n >= 1) return 'normal'; return 'poor' }
function getScoreClass(score) { if (score >= 80) return 'score-good'; if (score >= 60) return 'score-ok'; if (score >= 40) return 'score-mid'; return 'score-bad' }
function debounceLoad() { clearTimeout(debounceTimer); debounceTimer = setTimeout(loadData, 400) }
function getChangeClass(v) { const n = parseFloat(v); if (!n || isNaN(n)) return 'flat'; return n > 0 ? 'up' : 'down' }
function formatCtr(v) { if (!v) return '0.00%'; return parseFloat(v).toFixed(2) + '%' }
function getCtrChangeClass(cur, prev) { const c = parseFloat(cur) || 0; const p = parseFloat(prev) || 0; if (!p) return 'flat'; return c > p ? 'up' : c < p ? 'down' : 'flat' }
function formatCtrChange(cur, prev) { const c = parseFloat(cur) || 0; const p = parseFloat(prev) || 0; if (!p) return '暂无对比'; const diff = c - p; const sign = diff > 0 ? '\u2191' : '\u2193'; return sign + Math.abs(diff).toFixed(2) + '%' }
function formatChange(v) { const n = parseFloat(v); if (!n || isNaN(n)) return '持平'; const sign = n > 0 ? '↑' : '↓'; return sign + Math.abs(n).toFixed(1) + '%' }

// 提取视频名称（去掉.mp4后缀和日期前缀）
function getVideoName(title) {
  if (!title) return '未命名视频'
  return title.replace(/\.mp4$/i, '').replace(/\.mov$/i, '')
}

// 千川后台素材链接
function getQCLink(item) {
  if (item.material_id) {
    return `https://qianchuan.jinritemai.com/creative/material/video?material_id=${item.material_id}`
  }
  return `https://qianchuan.jinritemai.com/advertiser/${item.advertiser_id || ''}/material/video`
}

const coverGradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
]

function getCoverStyle(idx) {
  return { background: coverGradients[idx % coverGradients.length] }
}

function openDetail(item) {
  // 直接打开，视频通过 video-proxy 实时获取播放
  detailItem.value = { ...item, _videoLoading: false, _hasProxy: true }
  showDetail.value = true
}

async function refreshVideoUrl(item) {
  if (!item) return
  item._videoLoading = true
  try {
    const res = await request.get(`/materials/${item.material_id}/fresh-video`)
    if (res.data?.video_url) {
      item.video_url = res.data.video_url
      if (res.data.cover_url) item.cover_url = res.data.cover_url
      message.success('视频URL已更新')
    } else {
      message.warning('未找到该素材的视频')
    }
  } catch (e) { message.error('获取失败') }
  finally { item._videoLoading = false }
}

async function loadData() {
  loading.value = true
  try {
    const [start, end] = dateRange.value
    const res = await request.get('/materials', {
      params: { start_date: start.format('YYYY-MM-DD'), end_date: end.format('YYYY-MM-DD'), sort_by: sortBy.value, keyword: searchText.value || undefined, page_size: 30 }
    })
    materials.value = (res.data?.list || []).map(m => ({ ...m, _aiResult: null, _aiLoading: false }))
    summary.value = res.data?.summary || {}
  } catch (e) { materials.value = []; summary.value = {} }
  finally { loading.value = false }
}

async function syncCovers() {
  syncing.value = true
  try {
    const res = await request.post('/materials/sync-covers')
    if (res.code === 0) {
      message.success(res.msg || '封面同步完成')
      loadData()
    } else {
      message.warning(res.msg || '同步失败，请检查千川授权')
    }
  } catch (e) {
    message.error('封面同步失败：需要在千川开放平台授权「素材管理-读」权限')
  } finally { syncing.value = false }
}

function goRemix(item) {
  showDetail.value = false
  router.push('/materials/' + item.material_id + '/remix')
}

function goAnalysis(item) {
  showDetail.value = false
  router.push('/material-analysis/' + item.material_id + '?advertiser_id=' + (item.advertiser_id || ''))
}

async function loadSummaryStats() {
  try {
    const res = await request.get('/materials/summary-stats')
    if (res.data) headerStats.value = res.data
  } catch (e) { console.error('加载汇总数据失败', e) }
}

function applySort(val) { sortBy.value = val; showSortDrawer.value = false; loadData() }
onMounted(() => { loadData(); loadSummaryStats() })
</script>

<style scoped>
.materials-page { padding-bottom: calc(var(--tabnav-h, 0px) + var(--safe-b, 0px) + 16px); min-height: 100vh; background: var(--bg-page); }
.filter-bar { position: sticky; top: var(--header-h, 0); z-index: 10; background: var(--bg-card); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; padding: 10px 16px; }
.filter-scroll { flex: 1; overflow: hidden; }
.search-input { width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: #F5F6F8; font-size: 13px; color: var(--text-primary); outline: none; }
.search-input::placeholder { color: var(--text-hint); }
.filter-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.sort-btn { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; }

/* 核心数据汇总头部 */
.stats-header {
  background: var(--bg-card);
  margin-bottom: 2px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--border);
}
.stats-section { margin-bottom: 10px; }
.stats-section:last-child { margin-bottom: 0; }
.stats-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.section-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.section-dot.today { background: #1677FF; }
.section-dot.week { background: #722ED1; }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 10px;
}
.stat-card {
  background: var(--bg-page, #F5F6F8);
  border-radius: 8px;
  padding: 8px 10px;
  min-height: 54px;
}
.stat-label {
  font-size: 10px;
  color: var(--text-hint);
  margin-bottom: 3px;
}
.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.stat-value.primary { color: #1677FF; }
.stat-value.green { color: #00B96B; }
.stat-value.orange { color: #FA8C16; }
.stat-value.purple { color: #722ED1; }
.stat-value.new-tag { color: #EB2F96; }
.stat-change {
  font-size: 10px;
  margin-top: 2px;
  font-weight: 500;
}
.stat-change.up { color: #52C41A; }
.stat-change.down { color: #FF4D4F; }
.stat-change.flat { color: var(--text-hint); }

.summary-row { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--bg-card); border-bottom: 1px solid var(--border); margin-bottom: 8px; }
.summary-item { padding: 12px 8px; text-align: center; border-right: 1px solid var(--border); }
.summary-item:last-child { border-right: none; }
.summary-label { font-size: 11px; color: var(--text-hint); margin-bottom: 4px; }
.summary-value { font-size: 15px; font-weight: 600; }

.cover-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  margin: 0 12px 8px;
  background: #FFF7E6;
  border: 1px solid #FFD591;
  border-radius: 8px;
  font-size: 11px;
  color: #D46B08;
}
.sync-btn {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid #FA8C16;
  background: #FA8C16;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}
.sync-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* 卡片网格布局 */
.material-grid { padding: 0 12px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

.material-card {
  background: var(--bg-card);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08));
  cursor: pointer;
  transition: transform 0.15s;
}
.material-card:active { transform: scale(0.98); }

.card-cover {
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 16:9 */
  background: #1a1a2e;
  overflow: hidden;
}
.cover-img {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  object-fit: cover;
}
.cover-placeholder {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.cover-title-text {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  text-align: center;
  padding: 0 8px;
  line-height: 1.3;
  max-height: 30px;
  overflow: hidden;
}
.cover-play-icon {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 2px;
}

.rank-tag {
  position: absolute;
  top: 6px; left: 6px;
  width: 22px; height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  background: rgba(0,0,0,0.5);
  color: #fff;
}
.rank-tag.gold { background: #FFD700; color: #333; }
.rank-tag.silver { background: #C0C0C0; color: #333; }
.rank-tag.bronze { background: #CD7F32; color: #fff; }

.ai-tag {
  position: absolute;
  top: 6px; right: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}
.ai-tag.score-good { background: rgba(82, 196, 26, 0.9); color: #fff; }
.ai-tag.score-ok { background: rgba(22, 119, 255, 0.9); color: #fff; }
.ai-tag.score-mid { background: rgba(250, 140, 22, 0.9); color: #fff; }
.ai-tag.score-bad { background: rgba(255, 77, 79, 0.9); color: #fff; }

.card-title {
  padding: 8px 8px 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-metrics {
  padding: 4px 8px 10px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px 6px;
}
.metric-cell { display: flex; flex-direction: column; gap: 1px; }
.m-label { font-size: 10px; color: var(--text-hint); }
.m-value { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.m-value.primary { color: var(--c-primary, #1677FF); }
.m-value.good { color: #00B96B; }
.m-value.normal { color: #595959; }
.m-value.poor { color: #FF4D4F; }
.m-value.highlight { color: #722ED1; }

/* 详情面板 - 重新设计 */
.dp { display: flex; flex-direction: column; height: 100vh; overflow-y: auto; }
.dp-topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fff; border-bottom: 1px solid #EBEDF0; position: sticky; top: 0; z-index: 10; }
.dp-title { font-size: 15px; font-weight: 600; color: #1D2129; }
.dp-close { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: #F2F3F5; border-radius: 50%; cursor: pointer; color: #86909C; font-size: 14px; transition: all 0.2s; }
.dp-close:hover { background: #E5E6EB; color: #1D2129; }

.dp-media { background: #000; }
.dp-video { width: 100%; max-height: 280px; display: block; object-fit: contain; }
.dp-cover { width: 100%; max-height: 280px; display: block; object-fit: contain; }
.dp-video-wrap { background: #000; border-radius: 8px; overflow: hidden; }
.dp-video-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; gap: 8px; color: #86909C; font-size: 13px; background: #F7F8FA; }
.dp-spinner { width: 28px; height: 28px; border: 3px solid #E5E6EB; border-top-color: #1677FF; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.dp-video-placeholder { min-height: 180px; display: flex; align-items: center; justify-content: center; color: #C9CDD4; font-size: 13px; background: #F7F8FA; }
.dp-refresh-btn { display: block; width: 100%; margin: 8px 0; padding: 8px; background: #F7F8FA; border: 1px dashed #D9D9D9; border-radius: 6px; color: #4E5969; font-size: 12px; cursor: pointer; text-align: center; }
.dp-refresh-btn:hover { background: #E8F3FF; border-color: #1677FF; color: #1677FF; }
.dp-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dp-no-video { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; gap: 8px; color: #C9CDD4; font-size: 13px; }

.dp-info-card { padding: 12px 16px; background: #fff; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dp-name { font-size: 14px; font-weight: 600; color: #1D2129; line-height: 1.5; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dp-qc-link { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 4px; background: #F2F3F5; color: #4E5969; font-size: 12px; text-decoration: none; white-space: nowrap; flex-shrink: 0; transition: all 0.15s; }
.dp-qc-link:hover { background: #E8F3FF; color: #1677FF; }

.dp-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #EBEDF0; margin: 0; }
.dp-kpi { background: #fff; padding: 14px 8px; text-align: center; }
.dp-kpi-val { font-size: 16px; font-weight: 700; color: #1D2129; margin-bottom: 4px; }
.dp-kpi-label { font-size: 11px; color: #86909C; }

.dp-metrics-card { margin: 8px 12px; background: #fff; border-radius: 8px; overflow: hidden; }
.dp-metric-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid #F2F3F5; }
.dp-metric-row:last-child { border-bottom: none; }
.dp-metric-label { font-size: 13px; color: #86909C; }
.dp-metric-val { font-size: 13px; font-weight: 600; color: #1D2129; }

.dp-actions { display: flex; gap: 10px; padding: 12px 16px; margin-top: auto; position: sticky; bottom: 0; background: #F7F8FA; border-top: 1px solid #EBEDF0; }
.dp-act-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
.dp-act-remix { background: #F2F3F5; color: #4E5969; }
.dp-act-remix:hover { background: #E5E6EB; }
.dp-act-analysis { background: linear-gradient(135deg, #1677FF, #4096FF); color: #fff; box-shadow: 0 2px 8px rgba(22,119,255,0.25); }
.dp-act-analysis:hover { box-shadow: 0 4px 12px rgba(22,119,255,0.4); }
.ai-loading { font-size: 13px; color: #722ED1; display: flex; align-items: center; gap: 8px; padding: 12px 0; }

.ai-score-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.ai-score-badge { display: inline-flex; align-items: center; justify-content: center; padding: 3px 12px; border-radius: 12px; font-size: 14px; font-weight: 700; }
.score-good { background: #F6FFED; color: #52C41A; border: 1px solid #B7EB8F; }
.score-ok { background: #E6F7FF; color: #1677FF; border: 1px solid #91CAFF; }
.score-mid { background: #FFF7E6; color: #FA8C16; border: 1px solid #FFD591; }
.score-bad { background: #FFF2F0; color: #FF4D4F; border: 1px solid #FFCCC7; }
.ai-level { font-size: 13px; color: var(--text-secondary); font-weight: 500; }

/* 翻剪推荐样式 */
.remix-section { margin-bottom: 14px; }
.remix-section-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dashed var(--border); }
.remix-list { display: flex; flex-direction: column; gap: 4px; padding-left: 4px; }
.remix-list-item { font-size: 12px; line-height: 1.6; padding: 2px 0 2px 12px; position: relative; }
.remix-list-item::before { content: ''; position: absolute; left: 0; top: 10px; width: 5px; height: 5px; border-radius: 50%; }
.remix-list.green .remix-list-item { color: #389E0D; }
.remix-list.green .remix-list-item::before { background: #52c41a; }
.remix-list.orange .remix-list-item { color: #D46B08; }
.remix-list.orange .remix-list-item::before { background: #fa8c16; }

.hot-topic-tag { display: inline-block; padding: 4px 12px; border-radius: 14px; background: linear-gradient(135deg, #FFF0F6, #FFD6E7); color: #C41D7F; font-size: 13px; font-weight: 500; }

.script-section { margin-top: 2px; }
.script-card { background: linear-gradient(135deg, #F9F0FF 0%, #F0F5FF 100%); border-radius: 10px; padding: 12px; border: 1px solid #D3ADF7; }
.script-title { font-size: 14px; font-weight: 700; color: #531DAB; margin-bottom: 10px; }
.script-hook { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: #C41D7F; background: #FFF0F6; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; line-height: 1.5; }
.hook-label { font-weight: 600; white-space: nowrap; }
.script-scenes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.scene-item { display: flex; gap: 8px; }
.scene-time { flex-shrink: 0; width: 48px; padding: 4px 0; font-size: 11px; font-weight: 700; color: #722ED1; text-align: center; background: #F0E6FF; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.scene-body { flex: 1; font-size: 12px; line-height: 1.6; }
.scene-content { color: #333; margin-bottom: 2px; }
.scene-narration { color: #1677FF; font-style: italic; }
.script-cta { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: #D48806; background: #FFFBE6; border-radius: 8px; padding: 8px 10px; line-height: 1.5; }
.cta-label { font-weight: 600; white-space: nowrap; }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-hint); gap: 8px; }
.empty-hint { font-size: 12px; }
.loading-state { display: flex; justify-content: center; padding: 60px 20px; }
.sort-options { display: flex; flex-direction: column; gap: 4px; }
.sort-option { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-radius: 8px; cursor: pointer; font-size: 15px; color: var(--text-primary); transition: background 0.15s; }
.sort-option:active, .sort-option.active { background: var(--c-primary-bg, #E6F4FF); color: var(--c-primary, #1677FF); }
:deep(.date-picker) { font-size: 12px; }
:deep(.ant-picker-input > input) { font-size: 12px; }

@media (min-width: 768px) {
  .materials-page { padding-bottom: 24px; }
  .material-grid { grid-template-columns: repeat(3, 1fr); padding: 0 24px; }
}

/* reserved */
</style>
