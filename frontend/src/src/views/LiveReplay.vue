<template>
  <div class="ar-page">
    <!-- 1. Sticky header -->
    <div class="ar-header">
      <a-date-picker
        v-model:value="selectedDate"
        :allowClear="false"
        format="M月D日"
        style="width: 110px"
        @change="fetchReviews"
      />
      <a-select
        v-model:value="selectedAnchor"
        placeholder="全部主播"
        allowClear
        style="flex: 1; min-width: 80px"
        @change="fetchReviews"
      >
        <a-select-option v-for="a in anchors" :key="a.id" :value="a.id">{{ a.name }}</a-select-option>
      </a-select>
    </div>

    <!-- 2. Today summary banner (only when no anchor filter) -->
    <div class="ar-summary" v-if="!loading && reviews.length && !selectedAnchor">
      <div class="ar-summary__title">已复盘 {{ reviews.length }} 场</div>
      <div class="ar-summary__strip">
        <div class="ar-summary__item">
          <span class="ar-summary__val">&yen;{{ fmtW(sumGmv) }}</span>
          <span class="ar-summary__label">GMV</span>
        </div>
        <div class="ar-summary__item">
          <span class="ar-summary__val">{{ sumRoi }}</span>
          <span class="ar-summary__label">ROI</span>
        </div>
        <div class="ar-summary__item">
          <span class="ar-summary__val">{{ fmtPct(sumCvr) }}</span>
          <span class="ar-summary__label">转化率</span>
        </div>
        <div class="ar-summary__item">
          <span class="ar-summary__val">{{ fmtPct(sumCtr) }}</span>
          <span class="ar-summary__label">点击率</span>
        </div>
        <div class="ar-summary__item">
          <span class="ar-summary__val">{{ fmtPct(sumInteract) }}</span>
          <span class="ar-summary__label">互动率</span>
        </div>
        <div class="ar-summary__item">
          <span class="ar-summary__val">{{ fmtStay(sumStay) }}</span>
          <span class="ar-summary__label">停留</span>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="ar-loading"><a-spin size="large" /></div>

    <!-- 4. Empty state -->
    <div v-else-if="!reviews.length" class="ar-empty">
      <div class="ar-empty__icon">📋</div>
      <div class="ar-empty__title">暂无复盘报告</div>
      <div class="ar-empty__desc">主播下播10分钟后自动生成</div>
    </div>

    <!-- 3. Review cards list -->
    <div v-else class="ar-list">
      <div v-for="r in reviews" :key="r.id" class="ar-card">
        <!-- Card header -->
        <div class="ar-card__head">
          <div class="ar-card__anchor">
            <div class="ar-card__avatar" :style="{ background: avatarBg(r.anchor_name) }">
              {{ r.anchor_name?.charAt(0) }}
            </div>
            <div class="ar-card__info">
              <div class="ar-card__name">{{ r.anchor_name }}</div>
              <div class="ar-card__time">{{ fmtTime(r.start_time) }}-{{ fmtTime(r.end_time) }}</div>
            </div>
          </div>
          <div class="ar-card__grade" :class="'ar-grade--' + getGrade(r).level">
            {{ getGrade(r).letter }}
          </div>
        </div>

        <!-- 8-metric grid: 4列×2行 -->
        <div class="ar-card__metrics">
          <div class="ar-metric-grid">
            <div class="ar-metric">
              <div class="ar-metric__val">¥{{ fmtW(r.gmv) }}</div>
              <div class="ar-metric__label">GMV</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val" :class="metricCls(r.roi, r.day_avg_roi)">{{ fmtRoi(r.roi) }}{{ metricArrow(r.roi, r.day_avg_roi) }}</div>
              <div class="ar-metric__label">ROI</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val">{{ fmtN(r.orders) }}</div>
              <div class="ar-metric__label">订单</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val" :class="metricCls(r.cvr, r.day_avg_cvr)">{{ fmtPct(r.cvr) }}{{ metricArrow(r.cvr, r.day_avg_cvr) }}</div>
              <div class="ar-metric__label">转化率</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val" :class="metricCls(r.click_rate, r.day_avg_ctr)">{{ fmtPct(r.click_rate) }}{{ metricArrow(r.click_rate, r.day_avg_ctr) }}</div>
              <div class="ar-metric__label">点击率</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val" :class="metricCls(r.interact_rate, r.day_avg_interact)">{{ fmtPct(r.interact_rate) }}{{ metricArrow(r.interact_rate, r.day_avg_interact) }}</div>
              <div class="ar-metric__label">互动率</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val" :class="metricCls(r.avg_stay, r.day_avg_stay)">{{ fmtStay(r.avg_stay) }}{{ metricArrow(r.avg_stay, r.day_avg_stay) }}</div>
              <div class="ar-metric__label">停留</div>
            </div>
            <div class="ar-metric">
              <div class="ar-metric__val" :class="dbClass(r.avg_db)">{{ fmtDb(r.avg_db) }}</div>
              <div class="ar-metric__label">🔊 分贝</div>
            </div>
          </div>
        </div>

        <!-- Completed report sections -->
        <template v-if="r.status === 'completed'">
          <!-- 🎯 高转话术 -->
          <div class="ar-section" v-if="getSpeeches(r).length">
            <div class="ar-section__head" @click="toggle(r.id, 'sp')">
              <span class="ar-section__icon">🎯</span>
              <span class="ar-section__title">高转话术</span>
              <span class="ar-section__badge">{{ getSpeeches(r).length }}</span>
              <span class="ar-section__arrow" :class="{ open: isOpen(r.id, 'sp') }">›</span>
            </div>
            <div class="ar-section__body" v-if="isOpen(r.id, 'sp')">
              <div v-for="(sp, i) in getSpeeches(r).slice(0, 5)" :key="i" class="ar-speech">
                <div class="ar-speech__head">
                  <span class="ar-speech__tag" :style="{ background: catColor(sp.category) }">{{ catLabel(sp.category) }}</span>
                  <span class="ar-speech__meta" v-if="sp.related_gmv">&yen;{{ fmtW(sp.related_gmv) }}</span>
                </div>
                <div class="ar-speech__text">{{ sp.text }}</div>
              </div>
              <div v-if="getSpeeches(r).length > 5" class="ar-speech__more" @click="toggle(r.id, 'sp-all')">
                {{ isOpen(r.id, 'sp-all') ? '收起' : `查看全部 ${getSpeeches(r).length} 条` }}
              </div>
              <template v-if="isOpen(r.id, 'sp-all')">
                <div v-for="(sp, i) in getSpeeches(r).slice(5)" :key="'more' + i" class="ar-speech">
                  <div class="ar-speech__head">
                    <span class="ar-speech__tag" :style="{ background: catColor(sp.category) }">{{ catLabel(sp.category) }}</span>
                    <span class="ar-speech__meta" v-if="sp.related_gmv">&yen;{{ fmtW(sp.related_gmv) }}</span>
                  </div>
                  <div class="ar-speech__text">{{ sp.text }}</div>
                </div>
              </template>
            </div>
          </div>

          <!-- 🤖 AI复盘分析 -->
          <div class="ar-section" v-if="r.ai_analysis">
            <div class="ar-section__head" @click="toggle(r.id, 'ai')">
              <span class="ar-section__icon">🤖</span>
              <span class="ar-section__title">AI复盘分析</span>
              <span class="ar-section__arrow" :class="{ open: isOpen(r.id, 'ai') }">›</span>
            </div>
            <div class="ar-section__body" v-if="isOpen(r.id, 'ai')">
              <div class="ar-ai" v-html="renderMd(r.ai_analysis)"></div>
            </div>
          </div>

          <!-- 📊 对比分析 -->
          <div class="ar-section" v-if="getComparison(r)">
            <div class="ar-section__head" @click="toggle(r.id, 'cmp')">
              <span class="ar-section__icon">📊</span>
              <span class="ar-section__title">对比分析</span>
              <span class="ar-section__arrow" :class="{ open: isOpen(r.id, 'cmp') }">›</span>
            </div>
            <div class="ar-section__body" v-if="isOpen(r.id, 'cmp')">
              <div v-if="getComparison(r).highlights?.length" class="ar-cmp__group">
                <div class="ar-cmp__label ar-cmp__label--good">表扬</div>
                <div v-for="(item, i) in getComparison(r).highlights" :key="'h' + i" class="ar-cmp__item ar-cmp__item--good">
                  {{ item }}
                </div>
              </div>
              <div v-if="getComparison(r).improvements?.length" class="ar-cmp__group">
                <div class="ar-cmp__label ar-cmp__label--bad">待改进</div>
                <div v-for="(item, i) in getComparison(r).improvements" :key="'imp' + i" class="ar-cmp__item ar-cmp__item--bad">
                  {{ item }}
                </div>
              </div>
            </div>
          </div>

          <!-- Card footer -->
          <div class="ar-card__foot">
            <span class="ar-card__footdate">{{ r.schedule_date }}</span>
            <div class="ar-card__actions">
              <span class="ar-card__regen" @click="regen(r)">
                <template v-if="regenSet.has(r.schedule_id)">生成中...</template>
                <template v-else>重新生成</template>
              </span>
              <span class="ar-card__divider">|</span>
              <span
                class="ar-card__notify"
                :class="{ 'ar-card__notify--sent': r.dingtalk_sent }"
                @click="!r.dingtalk_sent && notify(r)"
              >
                <template v-if="notifySet.has(r.schedule_id)">推送中...</template>
                <template v-else-if="r.dingtalk_sent">已推送钉钉</template>
                <template v-else>推送钉钉</template>
              </span>
            </div>
          </div>
        </template>

        <!-- Generating -->
        <div v-else-if="r.status === 'generating'" class="ar-card__status ar-card__status--gen">
          <a-spin size="small" /> <span>复盘报告生成中...</span>
        </div>

        <!-- Failed -->
        <div v-else class="ar-card__status ar-card__status--fail">
          <span>生成失败</span>
          <a-button type="primary" danger size="small" @click="regen(r)">重试</a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const reviews = ref([])
const anchors = ref([])
const selectedAnchor = ref(undefined)
const selectedDate = ref(dayjs())
const sections = reactive({})
const regenSet = reactive(new Set())
const notifySet = reactive(new Set())

// --- Summary computeds (only when no anchor filter) ---
const sumGmv = computed(() => reviews.value.reduce((s, r) => s + (parseFloat(r.gmv) || 0), 0))
const sumRoi = computed(() => {
  const cost = reviews.value.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0)
  return cost > 0 ? (sumGmv.value / cost).toFixed(2) : '--'
})
const sumCvr = computed(() => avg(reviews.value, 'cvr'))
const sumCtr = computed(() => avg(reviews.value, 'click_rate'))
const sumInteract = computed(() => avg(reviews.value, 'interact_rate'))
const sumStay = computed(() => avg(reviews.value, 'avg_stay'))

function avg(list, field) {
  const vals = list.map(r => parseFloat(r[field])).filter(v => !isNaN(v))
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

// --- Formatting ---
function fmtW(v) {
  const n = parseFloat(v) || 0
  return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
function fmtN(v) {
  const n = parseInt(v)
  return isNaN(n) ? '--' : n.toLocaleString()
}
function fmtRoi(v) {
  const n = parseFloat(v)
  return isNaN(n) ? '--' : n.toFixed(2)
}
function fmtPct(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return '--'
  return n.toFixed(1) + '%'
}
function fmtStay(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return '--'
  if (n >= 60) return Math.floor(n / 60) + 'm' + Math.round(n % 60) + 's'
  return Math.round(n) + 's'
}
function fmtTime(t) {
  return t ? String(t).slice(0, 5) : '--'
}
function fmtDb(v) {
  const n = parseFloat(v)
  return isNaN(n) || n <= 0 ? '--' : n.toFixed(0) + 'dB'
}
function dbClass(v) {
  const n = parseFloat(v) || 0
  if (n >= 80) return 'ar-val--good'  // 声音洪亮
  if (n >= 60) return ''               // 正常
  if (n > 0) return 'ar-val--bad'      // 声音偏小
  return ''
}

// --- Metric comparison ---
function metricCls(val, dayAvg) {
  const v = parseFloat(val)
  const a = parseFloat(dayAvg)
  if (isNaN(v) || isNaN(a) || a === 0) return ''
  const ratio = (v - a) / Math.abs(a)
  if (ratio > 0.2) return 'ar-val--good'
  if (ratio < -0.2) return 'ar-val--bad'
  return ''
}
function metricArrow(val, dayAvg) {
  const v = parseFloat(val)
  const a = parseFloat(dayAvg)
  if (isNaN(v) || isNaN(a) || a === 0) return ''
  const ratio = (v - a) / Math.abs(a)
  if (ratio > 0.2) return ' ↑'
  if (ratio < -0.2) return ' ↓'
  return ''
}

// --- Grade ---
function getGrade(r) {
  const roi = parseFloat(r.roi) || 0
  const gmv = parseFloat(r.gmv) || 0
  const score = roi * 30 + (gmv / 1000) * 2
  if (score >= 100) return { letter: 'S', level: 's' }
  if (score >= 70) return { letter: 'A', level: 'a' }
  if (score >= 40) return { letter: 'B', level: 'b' }
  if (score >= 20) return { letter: 'C', level: 'c' }
  return { letter: 'D', level: 'd' }
}

// --- Avatar ---
const COLORS = ['#1677FF', '#00B578', '#FF8F1F', '#722ED1', '#FF3141', '#13C2C2', '#EB2F96']
function avatarBg(n) {
  if (!n) return '#999'
  let h = 0
  for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

// --- Speech categories ---
const CAT = {
  selling_point: { l: '卖点讲解', c: '#1677FF' },
  push_sale: { l: '逼单促单', c: '#FF3141' },
  welfare: { l: '福利发放', c: '#00B578' },
  interact: { l: '互动留人', c: '#FF8F1F' },
  product_intro: { l: '产品介绍', c: '#722ED1' },
  other: { l: '其他', c: '#999' }
}
const catColor = (c) => CAT[c]?.c || '#999'
const catLabel = (c) => CAT[c]?.l || '其他'

// --- Parse speeches ---
function getSpeeches(r) {
  if (!r.high_convert_speeches) return []
  try {
    return Array.isArray(r.high_convert_speeches)
      ? r.high_convert_speeches
      : JSON.parse(r.high_convert_speeches)
  } catch {
    return []
  }
}

// --- Parse comparison ---
function getComparison(r) {
  if (!r.comparison) return null
  try {
    return typeof r.comparison === 'string' ? JSON.parse(r.comparison) : r.comparison
  } catch {
    return null
  }
}

// --- Markdown render ---
function renderMd(md) {
  if (!md) return ''
  return md
    .replace(/^## (.+)$/gm, '<h3 class="ar-ai__h">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 class="ar-ai__h4">$1</h4>')
    .replace(/^\- (.+)$/gm, '<div class="ar-ai__li">\u2022 $1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '<br/>')
    .replace(/\n/g, '<br/>')
}

// --- Toggle sections ---
function toggle(id, key) {
  const k = id + '_' + key
  sections[k] = !sections[k]
}
function isOpen(id, key) {
  return !!sections[id + '_' + key]
}

// --- API ---
async function fetchAnchors() {
  try {
    const res = await request.get('/anchor/anchors')
    anchors.value = res.data || []
  } catch {
    // silent
  }
}

async function fetchReviews() {
  loading.value = true
  try {
    const d = dayjs(selectedDate.value).format('YYYY-MM-DD')
    const params = { date_start: d, date_end: d }
    if (selectedAnchor.value) params.anchor_id = selectedAnchor.value
    const res = await request.get('/anchor/reviews', { params })
    const list = res.data?.reviews || []
    list.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''))
    reviews.value = list
  } catch {
    reviews.value = []
  } finally {
    loading.value = false
  }
}

async function regen(r) {
  if (regenSet.has(r.schedule_id)) return
  regenSet.add(r.schedule_id)
  try {
    await request.post(`/anchor/reviews/${r.schedule_id}/regenerate`)
    message.success('已提交重新生成')
    r.status = 'generating'
  } catch {
    message.error('操作失败')
  } finally {
    regenSet.delete(r.schedule_id)
  }
}

async function notify(r) {
  if (r.dingtalk_sent || notifySet.has(r.schedule_id)) return
  notifySet.add(r.schedule_id)
  try {
    await request.post(`/anchor/reviews/${r.schedule_id}/notify`)
    message.success('已推送钉钉')
    r.dingtalk_sent = 1
  } catch {
    message.error('推送失败')
  } finally {
    notifySet.delete(r.schedule_id)
  }
}

onMounted(async () => {
  await fetchAnchors()
  await fetchReviews()
})
</script>

<style scoped>
.ar-page {
  min-height: 100vh;
  background: #F5F6FA;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}

/* ===== 1. Sticky header ===== */
.ar-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-bottom: 1px solid #EBEDF0;
}

/* ===== 2. Summary banner ===== */
.ar-summary {
  background: #fff;
  margin-top: 1px;
}
.ar-summary__title {
  font-size: 11px;
  color: #999;
  padding: 8px 16px 0;
}
.ar-summary__strip {
  display: flex;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 10px 12px;
  gap: 16px;
}
.ar-summary__strip::-webkit-scrollbar {
  display: none;
}
.ar-summary__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  min-width: 56px;
}
.ar-summary__val {
  font-size: 14px;
  font-weight: 700;
  color: #1A1A1A;
  white-space: nowrap;
}
.ar-summary__label {
  font-size: 10px;
  color: #999;
  margin-top: 1px;
  white-space: nowrap;
}

/* ===== Loading / Empty ===== */
.ar-loading {
  display: flex;
  justify-content: center;
  padding: 120px 0;
}
.ar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 24px;
}
.ar-empty__icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.ar-empty__title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}
.ar-empty__desc {
  font-size: 13px;
  color: #999;
}

/* ===== 3. Card list ===== */
.ar-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== Card ===== */
.ar-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* Card header */
.ar-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px;
}
.ar-card__anchor {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ar-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}
.ar-card__info {
  min-width: 0;
}
.ar-card__name {
  font-size: 15px;
  font-weight: 600;
  color: #1A1A1A;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar-card__time {
  font-size: 12px;
  color: #999;
}

/* Grade badge */
.ar-card__grade {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  flex-shrink: 0;
}
.ar-grade--s { background: linear-gradient(135deg, #FFD700, #FFA500); color: #fff; }
.ar-grade--a { background: #00B578; color: #fff; }
.ar-grade--b { background: #1677FF; color: #fff; }
.ar-grade--c { background: #FF8F1F; color: #fff; }
.ar-grade--d { background: #C8CDD4; color: #fff; }

/* ===== 7-metric grid ===== */
.ar-card__metrics {
  margin: 0 12px 12px;
  background: #F7F8FA;
  border-radius: 8px;
  overflow: hidden;
}
.ar-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #EBEDF0;
}
.ar-metric {
  padding: 10px 4px;
  text-align: center;
  background: #F7F8FA;
}
.ar-metric__val {
  font-size: 14px;
  font-weight: 700;
  color: #1A1A1A;
  white-space: nowrap;
}
.ar-metric__label {
  font-size: 10px;
  color: #999;
  margin-top: 1px;
}
.ar-val--good { color: #00B578; }
.ar-val--bad { color: #FF3141; }

/* ===== Expandable sections ===== */
.ar-section {
  border-top: 1px solid #F0F1F5;
}
.ar-section__head {
  display: flex;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}
.ar-section__head:active {
  background: #FAFBFC;
}
.ar-section__icon {
  margin-right: 6px;
  font-size: 14px;
}
.ar-section__title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1A1A;
  flex: 1;
}
.ar-section__badge {
  font-size: 11px;
  color: #fff;
  background: #1677FF;
  padding: 0 7px;
  border-radius: 10px;
  margin-right: 8px;
  line-height: 18px;
}
.ar-section__arrow {
  font-size: 18px;
  color: #C8CDD4;
  transition: transform 0.2s;
  display: inline-block;
}
.ar-section__arrow.open {
  transform: rotate(90deg);
}
.ar-section__body {
  padding: 0 12px 14px;
}

/* ===== Speech items ===== */
.ar-speech {
  padding: 10px 12px;
  background: #F7F8FA;
  border-radius: 8px;
  margin-bottom: 6px;
  border-left: 3px solid #1677FF;
}
.ar-speech__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.ar-speech__tag {
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  line-height: 18px;
}
.ar-speech__meta {
  font-size: 11px;
  color: #999;
}
.ar-speech__text {
  font-size: 13px;
  color: #333;
  line-height: 1.6;
}
.ar-speech__more {
  text-align: center;
  font-size: 12px;
  color: #1677FF;
  padding: 8px 0;
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== AI analysis ===== */
.ar-ai {
  font-size: 13px;
  line-height: 1.8;
  color: #333;
}
.ar-ai :deep(.ar-ai__h) {
  font-size: 14px;
  font-weight: 600;
  color: #1A1A1A;
  margin: 12px 0 6px;
  padding-left: 8px;
  border-left: 3px solid #1677FF;
}
.ar-ai :deep(.ar-ai__h4) {
  font-size: 13px;
  font-weight: 600;
  color: #1A1A1A;
  margin: 8px 0 4px;
}
.ar-ai :deep(.ar-ai__li) {
  padding-left: 12px;
  margin: 2px 0;
}
.ar-ai :deep(strong) {
  color: #1677FF;
}

/* ===== Comparison section ===== */
.ar-cmp__group {
  margin-bottom: 10px;
}
.ar-cmp__group:last-child {
  margin-bottom: 0;
}
.ar-cmp__label {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  padding-left: 2px;
}
.ar-cmp__label--good { color: #00B578; }
.ar-cmp__label--bad { color: #FF3141; }
.ar-cmp__item {
  font-size: 13px;
  line-height: 1.6;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
}
.ar-cmp__item--good {
  background: rgba(0, 181, 120, 0.08);
  color: #00865A;
  border-left: 3px solid #00B578;
}
.ar-cmp__item--bad {
  background: rgba(255, 49, 65, 0.06);
  color: #CC1A28;
  border-left: 3px solid #FF3141;
}

/* ===== Card footer ===== */
.ar-card__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid #F0F1F5;
  min-height: 44px;
}
.ar-card__footdate {
  font-size: 11px;
  color: #C8CDD4;
}
.ar-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ar-card__regen {
  font-size: 12px;
  color: #1677FF;
  cursor: pointer;
}
.ar-card__divider {
  color: #E8ECF0;
  font-size: 12px;
}
.ar-card__notify {
  font-size: 12px;
  color: #1677FF;
  cursor: pointer;
}
.ar-card__notify--sent {
  color: #999;
  cursor: default;
}

/* ===== Status states ===== */
.ar-card__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 12px;
}
.ar-card__status--gen {
  color: #1677FF;
  font-size: 13px;
}
.ar-card__status--fail {
  flex-direction: column;
  gap: 10px;
  color: #FF3141;
  font-size: 13px;
}

/* ===== Tablet+ ===== */
@media (min-width: 768px) {
  .ar-header {
    padding: 12px 16px;
  }
  .ar-list {
    padding: 16px;
  }
  .ar-card__head {
    padding: 14px 16px;
  }
  .ar-card__metrics {
    margin: 0 16px 14px;
  }
  .ar-section__head {
    padding: 12px 16px;
  }
  .ar-section__body {
    padding: 0 16px 14px;
  }
  .ar-card__foot {
    padding: 10px 16px;
  }
  .ar-summary__strip {
    padding: 10px 16px;
  }
}
</style>
