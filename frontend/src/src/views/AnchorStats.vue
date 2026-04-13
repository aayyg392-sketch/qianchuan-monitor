<template>
  <div class="dt-anchor-stats">
    <!-- ===== 顶部筛选栏 (Sticky) ===== -->
    <div class="dt-filter-bar">
      <div class="dt-filter-bar__row">
        <div class="dt-filter-bar__anchor">
          <div class="dt-anchor-select-wrapper">
            <svg class="dt-icon-user" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
            <a-select
              v-model:value="selectedAnchor"
              class="dt-anchor-select"
              placeholder="选择主播"
              @change="loadData"
              :bordered="false"
            >
              <a-select-option :value="0">全部主播</a-select-option>
              <a-select-option v-for="a in anchorList" :key="a.id" :value="a.id">
                {{ a.name }}
              </a-select-option>
            </a-select>
          </div>
        </div>
        <div class="dt-filter-bar__date">
          <div class="dt-segmented-pills">
            <button
              v-for="opt in dateTypeOptions"
              :key="opt.value"
              class="dt-pill"
              :class="{ 'dt-pill--active': dateType === opt.value }"
              @click="dateType = opt.value; loadData()"
            >
              {{ opt.label }}
            </button>
          </div>
          <a-date-picker
            v-model:value="selectedDate"
            :picker="dateType === 'day' ? 'date' : dateType === 'week' ? 'week' : 'month'"
            class="dt-date-picker"
            :bordered="false"
            size="small"
            @change="loadData"
          />
        </div>
      </div>
    </div>

    <!-- ===== 数据总览 ===== -->
    <div class="dt-overview">
      <div class="dt-overview__grid">
        <div v-for="m in overviewMetrics" :key="m.key" class="dt-ov-item">
          <div class="dt-ov-item__label">{{ m.label }}</div>
          <div class="dt-ov-item__val">{{ m.display }}</div>
          <div class="dt-ov-item__change" :class="m.changeVal > 0 ? 'dt-ch--up' : m.changeVal !== 0 ? 'dt-ch--down' : ''">
            <span v-if="m.changeVal !== 0">{{ m.changeVal > 0 ? '↑' : '↓' }} {{ Math.abs(m.changeVal) }}%</span>
            <span v-else>-</span>
            <span class="dt-ch-label">vs {{ vsLabel }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 主播排行榜 ===== -->
    <div class="dt-card">
      <div class="dt-card__header">
        <span class="dt-card__title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#1677FF" style="vertical-align: -3px; margin-right: 6px;">
            <path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
          </svg>
          主播排行榜
        </span>
        <div class="dt-legend">
          <span class="dt-legend__item"><span class="dt-legend__dot dt-legend__dot--green"></span>高于均值20%</span>
          <span class="dt-legend__item"><span class="dt-legend__dot dt-legend__dot--red"></span>低于均值20%</span>
        </div>
      </div>
      <div class="dt-ranking-list" v-if="!loading && rankedAnchors.length">
        <div v-for="(record, index) in rankedAnchors" :key="record.anchor_id" class="dt-rank-item" @click="openAnalysis(record)">
          <!-- 主播信息行 -->
          <div class="dt-rank-item__main">
            <div class="dt-rank-item__left">
              <div class="dt-rank-medal" :class="'dt-rank-medal--' + (index + 1)">
                <template v-if="index < 3">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <circle cx="12" cy="10" r="8" :fill="medalColors[index]" opacity="0.15"/>
                    <text x="12" y="14" text-anchor="middle" :fill="medalColors[index]" font-size="12" font-weight="700">{{ index + 1 }}</text>
                  </svg>
                </template>
                <span v-else class="dt-rank-medal__num">{{ index + 1 }}</span>
              </div>
              <div class="dt-rank-avatar">{{ record.name?.charAt(0) }}</div>
              <span class="dt-rank-item__name">{{ record.name }}</span>
              <span class="dt-rank-item__hours">{{ record.hours }}h</span>
            </div>
            <div class="dt-rank-item__right">
              <div class="dt-rank-item__metric">
                <span class="dt-rank-item__metric-value">¥{{ formatNum(record.gmv) }}</span>
                <span class="dt-rank-item__metric-label">GMV</span>
              </div>
              <div class="dt-rank-item__metric">
                <span class="dt-rank-item__metric-value" :class="cmpClass(record.roi, avgMetrics.roi)">{{ record.roi?.toFixed(2) }}</span>
                <span class="dt-rank-item__metric-label">ROI</span>
              </div>
              <div class="dt-rank-item__metric">
                <span class="dt-rank-item__metric-value" :class="cmpClass(record.cvr, avgMetrics.cvr)">{{ record.cvr }}%</span>
                <span class="dt-rank-item__metric-label">转化率</span>
              </div>
              <div class="dt-rank-item__metric">
                <span class="dt-rank-item__metric-value" :class="cmpClass(record.click_rate, avgMetrics.ctr)">{{ record.click_rate }}%</span>
                <span class="dt-rank-item__metric-label">点击率</span>
              </div>
              <div class="dt-rank-item__metric">
                <span class="dt-rank-item__metric-value" :class="cmpClass(record.interact_rate, avgMetrics.interact)">{{ record.interact_rate }}%</span>
                <span class="dt-rank-item__metric-label">互动率</span>
              </div>
              <div class="dt-rank-item__metric">
                <span class="dt-rank-item__metric-value" :class="cmpClass(record.avg_stay, avgMetrics.stay)">{{ fmtStay(record.avg_stay) }}</span>
                <span class="dt-rank-item__metric-label">停留</span>
              </div>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#C8C9CC"><path d="M9.29 6.71a1 1 0 0 0 0 1.41L13.17 12l-3.88 3.88a1 1 0 1 0 1.41 1.41l4.59-4.59a1 1 0 0 0 0-1.41L10.7 6.71a1 1 0 0 0-1.41 0z"/></svg>
            </div>
          </div>
          <!-- 排班时段（直接显示） -->
          <div class="dt-rank-slots" v-if="getAnchorSlots(record.anchor_id).length">
            <div v-for="(slot, i) in getAnchorSlots(record.anchor_id)" :key="i" class="dt-rank-slot" :class="'dt-rank-slot--' + slot.status">
              <span class="dt-rank-slot__time">{{ slot.start_time.slice(0,5) }}-{{ slot.end_time.slice(0,5) }}：</span>
              <template v-if="slot.status === 'completed'">
                <span class="dt-rank-slot__data">¥{{ slot.gmv.toLocaleString() }}</span>
                <span class="dt-rank-slot__roi" v-if="slot.roi > 0" :class="slot.roi >= 2 ? 'dt-val--success' : slot.roi < 1 ? 'dt-val--danger' : ''">ROI {{ slot.roi }}</span>
              </template>
              <template v-else-if="slot.status === 'in_progress'">
                <span class="dt-rank-slot__status dt-slot--in_progress">直播中</span>
                <span class="dt-rank-slot__data" v-if="slot.gmv > 0">¥{{ slot.gmv.toLocaleString() }}</span>
              </template>
              <template v-else>
                <span class="dt-rank-slot__status dt-slot--scheduled">待上播</span>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="loading" class="dt-loading-placeholder">
        <a-spin />
      </div>
      <div v-else class="dt-empty-state">
        <p>当日暂无主播数据</p>
        <span>主播排班后将自动统计直播数据</span>
      </div>
    </div>

    <!-- ===== 主播分析 Drawer ===== -->
    <a-drawer
      v-model:open="analysisDrawerVisible"
      :placement="isMobile ? 'bottom' : 'right'"
      :width="isMobile ? '100%' : 420"
      :height="isMobile ? '85vh' : undefined"
      :closable="true"
      :destroyOnClose="true"
      class="dt-analysis-drawer"
    >
      <template #title>
        <div class="dt-analysis-header">
          <div class="dt-analysis-header__avatar">{{ analysisAnchor?.name?.charAt(0) }}</div>
          <div class="dt-analysis-header__info">
            <div class="dt-analysis-header__name">{{ analysisAnchor?.name }}</div>
            <div class="dt-analysis-header__sub">近15日分析</div>
          </div>
        </div>
      </template>

      <div v-if="analysisLoading" class="dt-analysis-loading">
        <a-spin tip="正在分析数据..." />
      </div>

      <div v-else-if="analysisData" class="dt-analysis-body">
        <!-- 1. 能力评分 -->
        <div class="dt-analysis-section">
          <div class="dt-analysis-section__title">能力评分</div>
          <div class="dt-score-bars">
            <div v-for="item in scoreItems" :key="item.key" class="dt-score-bar-row">
              <span class="dt-score-bar-label">{{ item.label }}</span>
              <div class="dt-score-bar-track">
                <div
                  class="dt-score-bar-fill"
                  :style="{ width: (item.score / 10 * 100) + '%', background: item.score >= 7 ? '#00B578' : item.score >= 4 ? '#FF8F1F' : '#FF3141' }"
                ></div>
              </div>
              <span class="dt-score-bar-value" :style="{ color: item.score >= 7 ? '#00B578' : item.score >= 4 ? '#FF8F1F' : '#FF3141' }">{{ item.score }}</span>
            </div>
          </div>
        </div>

        <!-- 2. 日趋势图/表 -->
        <div class="dt-analysis-section" v-if="analysisData.dailyTrend?.length">
          <div class="dt-analysis-section__title">每日趋势</div>
          <div v-if="analysisData.dailyTrend.length >= 3" ref="trendChartRef" class="dt-analysis-chart"></div>
          <div v-else class="dt-trend-table">
            <div v-for="d in analysisData.dailyTrend" :key="d.date" class="dt-trend-row">
              <span class="dt-trend-date">{{ d.date.slice(5) }}</span>
              <span class="dt-trend-gmv">¥{{ formatNum(d.gmv) }}</span>
              <span class="dt-trend-orders">{{ d.orders }}单</span>
              <span class="dt-trend-roi" :style="{color: roiColor(d.roi)}">ROI {{ d.roi }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 最佳时段 -->
        <div class="dt-analysis-section" v-if="analysisData.bestTimeSlots?.length">
          <div class="dt-analysis-section__title">最佳时段</div>
          <div class="dt-timeslot-cards">
            <div v-for="(ts, i) in analysisData.bestTimeSlots" :key="i" class="dt-timeslot-card" :class="{ 'dt-timeslot-card--best': i === 0 }">
              <div class="dt-timeslot-card__rank">{{ i === 0 ? '最佳' : '#' + (i + 1) }}</div>
              <div class="dt-timeslot-card__label">{{ ts.label }}</div>
              <div class="dt-timeslot-card__metrics">
                <span>平均GMV <strong>¥{{ formatNum(ts.avgGmv) }}</strong></span>
                <span>ROI <strong>{{ ts.avgRoi }}</strong></span>
                <span>{{ ts.sessions }}场</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. AI洞察 -->
        <div class="dt-analysis-section" v-if="analysisData.aiAnalysis">
          <div class="dt-analysis-section__title">AI 洞察</div>
          <div class="dt-insight-block dt-insight-block--strength">
            <div class="dt-insight-block__header">
              <span class="dt-insight-dot dt-insight-dot--green"></span>
              优势
            </div>
            <ul class="dt-insight-list">
              <li v-for="(s, i) in analysisData.aiAnalysis.strengths" :key="i">{{ s }}</li>
            </ul>
          </div>
          <div class="dt-insight-block dt-insight-block--weakness">
            <div class="dt-insight-block__header">
              <span class="dt-insight-dot dt-insight-dot--red"></span>
              待改进
            </div>
            <ul class="dt-insight-list">
              <li v-for="(w, i) in analysisData.aiAnalysis.weaknesses" :key="i">{{ w }}</li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else class="dt-analysis-empty">
        <p>暂无分析数据</p>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { DownloadOutlined } from '@ant-design/icons-vue'
import request from '../utils/request'
import dayjs from 'dayjs'
import * as echarts from 'echarts'

// ---- 筛选状态 ----
const selectedAnchor = ref(0)
const dateType = ref('day')
const selectedDate = ref(dayjs())
const dateTypeOptions = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' }
]

// ---- 数据状态 ----
const loading = ref(false)
const anchorList = ref([])
const summary = ref({})
const anchors = ref([])
const trend = ref({ dates: [], series: [] })
const scheduleList = ref([])
const expandedId = ref(null)

// ---- 排行榜奖牌颜色 ----
const medalColors = ['#FF8F1F', '#999999', '#CD7F32']

// ---- 图表 ----

// ---- 计算属性 ----
const vsLabel = computed(() => dateType.value === 'week' ? '上周' : dateType.value === 'month' ? '上月' : '昨日')

const overviewMetrics = computed(() => {
  const s = summary.value || {}
  return [
    { key: 'gmv', label: 'GMV', display: '¥' + formatNum(s.total_gmv || 0), changeVal: s.gmv_change || 0 },
    { key: 'roi', label: 'ROI', display: (s.avg_roi || 0).toFixed(2), changeVal: s.roi_change || 0 },
    { key: 'cvr', label: '转化率', display: (s.avg_cvr || 0).toFixed(2) + '%', changeVal: s.cvr_change || 0 },
    { key: 'ctr', label: '点击率', display: (s.avg_ctr || 0).toFixed(2) + '%', changeVal: s.ctr_change || 0 },
    { key: 'interact', label: '互动率', display: (s.avg_interact || 0).toFixed(2) + '%', changeVal: s.interact_change || 0 },
    { key: 'stay', label: '停留', display: fmtStay(s.avg_stay || 0), changeVal: s.stay_change || 0 }
  ]
})

// 主播均值（用于颜色对比）
const avgMetrics = computed(() => {
  const s = summary.value || {}
  return {
    roi: s.avg_roi || 0,
    cvr: s.avg_cvr || 0,
    ctr: s.avg_ctr || 0,
    interact: s.avg_interact || 0,
    stay: s.avg_stay || 0
  }
})

// 高于均值20%→绿色，低于均值20%→红色
function cmpClass(val, avg) {
  if (!avg || avg === 0) return ''
  const v = parseFloat(val) || 0
  if (v >= avg * 1.2) return 'dt-val--high'
  if (v <= avg * 0.8) return 'dt-val--low'
  return ''
}

const rankedAnchors = computed(() => {
  return [...anchors.value].sort((a, b) => (b.gmv || 0) - (a.gmv || 0))
})

// ---- 工具函数 ----
function formatNum(v) {
  const n = parseFloat(v || 0)
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n >= 1000 ? n.toLocaleString() : n.toFixed(0)
}

function fmtStay(secs) {
  const n = parseInt(secs) || 0
  if (n >= 60) return Math.floor(n / 60) + 'm' + (n % 60 > 0 ? (n % 60) + 's' : '')
  return n + 's'
}

function roiColor(roi) {
  const n = parseFloat(roi) || 0
  if (n >= 2) return '#00B578'
  if (n >= 1) return '#333'
  return '#FF3141'
}

function getBarWidth(gmv) {
  const max = rankedAnchors.value.length ? (rankedAnchors.value[0]?.gmv || 1) : 1
  return Math.round(((gmv || 0) / max) * 100)
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function getAnchorSlots(anchorId) {
  const sch = scheduleList.value.find(s => s.anchor_id === anchorId)
  return sch ? sch.slots : []
}

function scheduleStatusColor(status) {
  const map = { completed: 'green', absent: 'red', cancelled: 'default' }
  return map[status] || 'default'
}

function scheduleStatusText(status) {
  const map = { completed: '已完成', absent: '缺席', cancelled: '取消' }
  return map[status] || status
}

// ---- 数据加载 ----
async function loadAnchors() {
  try {
    const res = await request.get('/anchor/anchors')
    if (res.code === 0) {
      anchorList.value = res.data || []
    }
  } catch (e) {
    console.error('加载主播列表失败', e)
  }
}

async function loadData() {
  loading.value = true
  try {
    const dateStr = selectedDate.value.format('YYYY-MM-DD')
    const params = { date_type: dateType.value, date: dateStr }
    if (selectedAnchor.value) params.anchor_id = selectedAnchor.value

    const res = await request.get('/anchor/stats', { params })
    if (res.code === 0) {
      const d = res.data || {}
      summary.value = d.summary || {}
      anchors.value = d.anchors || []
      trend.value = d.trend || { dates: [], series: [] }
      // 用stats接口的排班数据（带状态），按主播汇总
      const rawSchedules = d.schedules || []
      const schMap = {}
      for (const sc of rawSchedules) {
        const aid = sc.anchor_id
        if (!schMap[aid]) {
          schMap[aid] = { anchor_id: aid, anchor_name: sc.anchor_name, slots: [], totalMinutes: 0, completedMinutes: 0 }
        }
        const [sh, sm] = sc.start_time.split(':').map(Number)
        const [eh, em] = sc.end_time.split(':').map(Number)
        const mins = eh * 60 + em - sh * 60 - sm
        schMap[aid].totalMinutes += mins
        if (sc.status === 'completed') schMap[aid].completedMinutes += mins
        else if (sc.status === 'in_progress') schMap[aid].completedMinutes += Math.round(mins * sc.completion / 100)
        schMap[aid].slots.push(sc)
      }
      scheduleList.value = Object.values(schMap).map(a => ({
        anchor_id: a.anchor_id,
        anchor_name: a.anchor_name,
        slots: a.slots,
        totalHours: (a.totalMinutes / 60).toFixed(1),
        totalGmv: parseFloat(a.slots.reduce((s, sl) => s + (sl.gmv || 0), 0).toFixed(2)),
        totalRoi: (() => { const c = a.slots.reduce((s, sl) => s + (sl.cost || 0), 0); const g = a.slots.reduce((s, sl) => s + (sl.gmv || 0), 0); return c > 0 ? parseFloat((g / c).toFixed(2)) : 0; })(),
        completion: a.totalMinutes > 0 ? Math.round(a.completedMinutes / a.totalMinutes * 100) : 0,
        status: a.completedMinutes >= a.totalMinutes ? 'completed' : a.completedMinutes > 0 ? 'in_progress' : 'scheduled'
      }))
    }
  } catch (e) {
    console.error('加载统计数据失败', e)
  } finally {
    loading.value = false
  }
}

async function loadSchedules() {
  try {
    const start = selectedDate.value.startOf(dateType.value === 'day' ? 'week' : dateType.value).format('YYYY-MM-DD')
    const end = selectedDate.value.endOf(dateType.value === 'day' ? 'week' : dateType.value).format('YYYY-MM-DD')
    const res = await request.get('/anchor/schedules', { params: { date_start: start, date_end: end } })
    if (res.code === 0) {
      scheduleList.value = res.data || []
    }
  } catch (e) {
    console.error('加载排班数据失败', e)
  }
}

// ---- 导出Excel ----
function exportExcel() {
  const header = ['排名', '主播', '时长(h)', 'GMV', '订单', '消耗', 'ROI', '转化率(%)', '互动率(%)']
  const rows = rankedAnchors.value.map((r, i) => [
    i + 1, r.name, r.hours, r.gmv, r.orders, r.cost,
    r.roi?.toFixed(2), r.cvr?.toFixed(2), r.interact_rate?.toFixed(2)
  ])
  const csv = '\uFEFF' + [header, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `主播排行_${selectedDate.value.format('YYYYMMDD')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- 主播分析 ----
const analysisDrawerVisible = ref(false)
const analysisLoading = ref(false)
const analysisAnchor = ref(null)
const analysisData = ref(null)
const trendChartRef = ref(null)
const isMobile = ref(window.innerWidth < 768)
let trendChartInstance = null

const scoreItems = computed(() => {
  const scores = analysisData.value?.aiAnalysis?.scores || {}
  return [
    { key: 'cvr', label: '转化率', score: scores.cvr || 0 },
    { key: 'ctr', label: '点击率', score: scores.ctr || 0 },
    { key: 'interaction', label: '互动', score: scores.interaction || 0 },
    { key: 'retention', label: '停留率', score: scores.retention || 0 },
    { key: 'sales', label: '销售', score: scores.sales || 0 }
  ]
})

async function openAnalysis(record) {
  analysisAnchor.value = record
  analysisDrawerVisible.value = true
  analysisLoading.value = true
  analysisData.value = null

  try {
    const res = await request.get(`/anchor/anchor-analysis/${record.anchor_id}`)
    if (res.code === 0) {
      analysisData.value = res.data
      await nextTick()
      // 延迟渲染确保Drawer DOM就绪
      setTimeout(() => renderTrendChart(), 300)
    }
  } catch (e) {
    console.error('加载分析数据失败', e)
  } finally {
    analysisLoading.value = false
  }
}

function renderTrendChart() {
  if (!trendChartRef.value || !analysisData.value?.dailyTrend?.length) return
  if (trendChartInstance) {
    trendChartInstance.dispose()
  }
  trendChartInstance = echarts.init(trendChartRef.value)
  const trend = analysisData.value.dailyTrend
  const dates = trend.map(d => d.date.slice(5))
  const gmvData = trend.map(d => d.gmv)
  const roiData = trend.map(d => d.roi)

  trendChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#fff',
      borderColor: '#E8ECF0',
      textStyle: { color: '#333', fontSize: 12 }
    },
    grid: { left: 50, right: 50, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10, color: '#999' },
      axisLine: { lineStyle: { color: '#E8ECF0' } }
    },
    yAxis: [
      {
        type: 'value',
        name: 'GMV',
        nameTextStyle: { fontSize: 10, color: '#999' },
        axisLabel: { fontSize: 10, color: '#999', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v },
        splitLine: { lineStyle: { color: '#F0F0F0' } }
      },
      {
        type: 'value',
        name: 'ROI',
        nameTextStyle: { fontSize: 10, color: '#999' },
        axisLabel: { fontSize: 10, color: '#999' },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'GMV',
        type: 'bar',
        yAxisIndex: 0,
        data: gmvData,
        barWidth: '40%',
        itemStyle: { color: '#1677FF', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: 'ROI',
        type: 'line',
        yAxisIndex: 1,
        data: roiData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#FF8F1F', width: 2 },
        itemStyle: { color: '#FF8F1F' }
      }
    ]
  })
}

// 监听窗口尺寸
window.addEventListener('resize', () => {
  isMobile.value = window.innerWidth < 768
  if (trendChartInstance) trendChartInstance.resize()
})

// ---- 生命周期 ----
onMounted(async () => {
  await loadAnchors()
  await loadData()
})

watch(selectedDate, () => loadData())
</script>

<style scoped>
/* ===== DingTalk Design Tokens ===== */
:root {
  --dt-primary: #1677FF;
  --dt-success: #00B578;
  --dt-warning: #FF8F1F;
  --dt-danger: #FF3141;
  --dt-text-primary: #333333;
  --dt-text-secondary: #999999;
  --dt-text-hint: #C8C9CC;
  --dt-bg: #F5F6FA;
  --dt-card-bg: #FFFFFF;
  --dt-card-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  --dt-card-radius: 12px;
  --dt-font: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

/* ===== Page Container ===== */
.dt-anchor-stats {
  padding: 0 0 24px;
  background: var(--dt-bg);
  min-height: auto;
  font-family: var(--dt-font);
  -webkit-font-smoothing: antialiased;
}

/* ===== Sticky Filter Bar ===== */
.dt-filter-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--dt-card-bg);
  padding: 10px 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.dt-filter-bar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dt-filter-bar__anchor {
  flex-shrink: 0;
}

.dt-anchor-select-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #F5F6FA;
  border-radius: 8px;
  padding: 2px 4px 2px 10px;
}

.dt-icon-user {
  color: var(--dt-primary);
  flex-shrink: 0;
}

.dt-anchor-select {
  min-width: 100px;
}

:deep(.dt-anchor-select .ant-select-selector) {
  padding-left: 4px !important;
  font-size: 13px !important;
  background: transparent !important;
}

.dt-filter-bar__date {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.dt-date-picker {
  width: 120px;
}

:deep(.dt-date-picker .ant-picker-input > input) {
  font-size: 13px;
}

/* ===== DingTalk Pill Segmented Control ===== */
.dt-segmented-pills {
  display: inline-flex;
  background: #F5F6FA;
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.dt-pill {
  border: none;
  background: transparent;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dt-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--dt-font);
  white-space: nowrap;
  line-height: 1.4;
}

.dt-pill:active {
  transform: scale(0.96);
}

.dt-pill--active {
  background: var(--dt-card-bg);
  color: var(--dt-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dt-pill--sm {
  padding: 3px 10px;
  font-size: 12px;
}

/* ===== 数据总览 ===== */
.dt-overview { padding: 12px 16px; }
.dt-overview__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #E8ECF0; border-radius: 10px; overflow: hidden; }
.dt-ov-item { background: #fff; padding: 14px 12px; text-align: center; }
.dt-ov-item__label { font-size: 11px; color: #999; margin-bottom: 4px; }
.dt-ov-item__val { font-size: 20px; font-weight: 700; color: #1A1A1A; line-height: 1.3; }
.dt-ov-item__change { font-size: 11px; margin-top: 4px; color: #999; }
.dt-ch--up { color: #FF3141; }
.dt-ch--down { color: #00B578; }
.dt-ch-label { font-size: 10px; color: #C8CDD4; margin-left: 4px; }

/* ===== 颜色说明 ===== */
.dt-legend { display: flex; gap: 12px; align-items: center; }
.dt-legend__item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #999; white-space: nowrap; }
.dt-legend__dot { width: 8px; height: 8px; border-radius: 2px; }
.dt-legend__dot--green { background: #00B578; }
.dt-legend__dot--red { background: #FF3141; }

/* 高低于均值颜色 */
.dt-val--high { color: #00B578 !important; font-weight: 700; }
.dt-val--low { color: #FF3141 !important; font-weight: 700; }

.dt-change--up {
  color: #FF3141;
}

.dt-change--down {
  color: var(--dt-success);
}

.dt-change--flat {
  color: var(--dt-text-hint);
}

/* ===== Empty State ===== */
.dt-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--dt-text-hint);
}

.dt-empty-state p {
  font-size: 14px;
  color: var(--dt-text-secondary);
  margin: 0 0 4px;
}

.dt-empty-state span {
  font-size: 12px;
}

.dt-empty-state--chart {
  padding: 60px 16px;
}

/* ===== Card Base ===== */
.dt-card {
  background: #FFFFFF;
  border-radius: 10px;
  border: 1px solid #E8ECF0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  margin: 0 16px 12px;
  overflow: hidden;
}

.dt-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #F0F0F0;
}

.dt-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dt-text-primary);
  display: flex;
  align-items: center;
}

.dt-card__body {
  padding: 0;
}

.dt-text-btn {
  display: inline-flex;
  align-items: center;
  border: none;
  background: none;
  color: var(--dt-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: var(--dt-font);
  transition: background 0.2s;
}

.dt-text-btn:active {
  background: rgba(22, 119, 255, 0.08);
}

/* ===== Ranking List ===== */
.dt-ranking-list {
  padding: 0;
}

.dt-rank-item {
  border-bottom: 1px solid #F5F5F5;
  cursor: pointer;
  transition: background 0.15s;
}

.dt-rank-item:last-child {
  border-bottom: none;
}

.dt-rank-item:hover {
  background: #FAFBFC;
}
.dt-rank-item:active {
  background: #F5F6FA;
}
.dt-rank-item__arrow {
  flex-shrink: 0;
  margin-left: 4px;
}

.dt-rank-item__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 12px;
}

.dt-rank-item__left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.dt-rank-medal {
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dt-rank-medal__num {
  font-size: 13px;
  font-weight: 600;
  color: var(--dt-text-hint);
}

.dt-rank-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1677FF, #4D9AFF);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.dt-rank-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dt-rank-item__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--dt-text-primary);
  line-height: 1.3;
}

.dt-rank-item__hours {
  font-size: 11px;
  color: var(--dt-text-secondary);
}

.dt-rank-item__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  min-width: 0;
}

.dt-rank-item__metric {
  text-align: right;
  flex-shrink: 0;
}

.dt-rank-item__metric-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--dt-primary);
  display: block;
  line-height: 1.3;
}

.dt-rank-item__metric-label {
  font-size: 10px;
  color: var(--dt-text-secondary);
}

.dt-rank-item__bar-wrap {
  width: 80px;
  flex-shrink: 0;
}

.dt-rank-item__bar {
  height: 6px;
  background: #F0F0F0;
  border-radius: 3px;
  overflow: hidden;
}

.dt-rank-item__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #1677FF, #4D9AFF);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.dt-rank-item__arrow {
  flex-shrink: 0;
  transition: transform 0.25s ease;
}

.dt-rank-item__arrow--open {
  transform: rotate(180deg);
}

/* ===== Expanded Detail ===== */
.dt-rank-item__detail {
  padding: 0 16px 14px;
  background: #FAFBFD;
}

.dt-detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.dt-detail-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: var(--dt-card-bg);
  border-radius: 8px;
}

.dt-detail-cell__val {
  font-size: 14px;
  font-weight: 600;
  color: var(--dt-text-primary);
}

.dt-detail-cell__label {
  font-size: 11px;
  color: var(--dt-text-secondary);
}

.dt-val--success {
  color: var(--dt-success) !important;
}

.dt-val--danger {
  color: var(--dt-danger) !important;
}

.dt-loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

/* Slide transition */
.dt-slide-enter-active,
.dt-slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.dt-slide-enter-from,
.dt-slide-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.dt-slide-enter-to,
.dt-slide-leave-from {
  max-height: 200px;
  opacity: 1;
}

/* ===== Trend Chart ===== */
.dt-compare-select {
  padding: 12px 16px 0;
}

.dt-compare-input {
  width: 100%;
}

:deep(.dt-compare-input .ant-select-selector) {
  background: #F5F6FA !important;
  border-radius: 8px !important;
  border: none !important;
  padding: 2px 8px !important;
}

.dt-chart-box {
  width: 100%;
  height: 280px;
  padding: 8px 8px 8px 0;
}

/* ===== Schedule Timeline ===== */
.dt-schedule-timeline {
  padding: 8px 16px 4px;
}

.dt-schedule-row {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #F5F5F5;
  position: relative;
}

.dt-schedule-row:last-child {
  border-bottom: none;
}

/* Timeline dot and line */
.dt-schedule-row__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
  position: relative;
}

.dt-schedule-row__dot::after {
  content: '';
  position: absolute;
  top: 12px;
  left: 4px;
  width: 2px;
  height: calc(100% + 14px);
  background: #F0F0F0;
}

.dt-schedule-row:last-child .dt-schedule-row__dot::after {
  display: none;
}

.dt-schedule-row__dot--completed {
  background: var(--dt-success);
  box-shadow: 0 0 0 3px rgba(0, 181, 120, 0.15);
}

.dt-schedule-row__dot--absent {
  background: var(--dt-danger);
  box-shadow: 0 0 0 3px rgba(255, 49, 65, 0.15);
}

.dt-schedule-row__dot--cancelled {
  background: var(--dt-text-hint);
  box-shadow: 0 0 0 3px rgba(200, 201, 204, 0.15);
}

.dt-schedule-row__content {
  flex: 1;
  min-width: 0;
}

.dt-schedule-row__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.dt-schedule-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--dt-text-primary);
}

.dt-schedule-row__tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}

.dt-tag--completed {
  background: rgba(0, 181, 120, 0.1);
  color: var(--dt-success);
}

.dt-tag--absent {
  background: rgba(255, 49, 65, 0.1);
  color: var(--dt-danger);
}

.dt-tag--cancelled {
  background: rgba(200, 201, 204, 0.15);
  color: var(--dt-text-secondary);
}

.dt-schedule-row__slots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.dt-slot-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #F5F6FA;
  color: var(--dt-text-secondary);
}

.dt-slot--completed {
  background: rgba(0, 181, 120, 0.1);
  color: var(--dt-success);
}

.dt-slot--in_progress {
  background: rgba(255, 49, 65, 0.1);
  color: var(--dt-danger);
  font-weight: 600;
  animation: dt-pulse 2s infinite;
}

.dt-slot--scheduled {
  background: rgba(255, 143, 31, 0.1);
  color: var(--dt-warning);
}

@keyframes dt-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.dt-schedule-row__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dt-schedule-row__date {
  font-size: 12px;
  color: var(--dt-text-secondary);
}

.dt-schedule-row__roi {
  font-size: 12px;
  color: var(--dt-text-primary);
  font-weight: 500;
}

.dt-schedule-row__roi span {
  margin-left: 6px;
  font-size: 11px;
}

/* ===== Inline Slots ===== */
.dt-rank-slots {
  padding: 0 16px 10px 60px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dt-rank-slot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 6px;
  background: #F5F6FA;
  font-size: 12px;
}

.dt-rank-slot__time {
  font-weight: 500;
  color: var(--dt-text-primary);
}

.dt-rank-slot__status {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}

.dt-rank-slot__data {
  color: var(--dt-text-primary);
  font-weight: 500;
}

.dt-rank-slot__roi {
  font-size: 11px;
  font-weight: 600;
}

.dt-text-hint {
  color: var(--dt-text-hint) !important;
}

.dt-schedule-row__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 160px;
}

.dt-progress-track {
  flex: 1;
  height: 6px;
  background: #F0F0F0;
  border-radius: 3px;
  overflow: hidden;
}

.dt-progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.dt-progress-fill--completed {
  background: linear-gradient(90deg, #00B578, #33CC99);
}

.dt-progress-fill--absent {
  background: linear-gradient(90deg, #FF3141, #FF6B6B);
}

.dt-progress-fill--cancelled {
  background: #C8C9CC;
}

.dt-progress-label {
  font-size: 11px;
  color: var(--dt-text-secondary);
  min-width: 32px;
  text-align: right;
}

/* ===== Mobile Responsive (<768px) ===== */
@media (max-width: 768px) {
  .dt-anchor-stats {
    padding: 0 0 16px;
  }

  .dt-filter-bar {
    padding: 8px 12px;
  }

  .dt-filter-bar__row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .dt-filter-bar__date {
    justify-content: space-between;
  }

  .dt-summary-scroll {
    padding: 10px 12px;
  }

  .dt-summary-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .dt-summary-card__content {
    padding: 10px 12px;
  }

  .dt-summary-card__value {
    font-size: 20px;
  }

  .dt-card {
    margin: 0 12px 10px;
    border-radius: 10px;
  }

  .dt-card__header {
    padding: 12px 14px 10px;
  }

  /* Simplify ranking on mobile: hide bar chart */
  .dt-rank-item__bar-wrap {
    display: none;
  }

  .dt-rank-item__main {
    padding: 10px 14px;
  }

  .dt-rank-avatar {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }

  .dt-rank-item__metric-value {
    font-size: 16px;
  }

  .dt-detail-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .dt-detail-cell {
    padding: 6px 4px;
  }

  .dt-detail-cell__val {
    font-size: 13px;
  }

  .dt-chart-box {
    height: 220px;
  }

  .dt-compare-select {
    padding: 10px 14px 0;
  }

  .dt-schedule-timeline {
    padding: 6px 14px 4px;
  }

  .dt-schedule-row__progress {
    max-width: 120px;
  }
}

/* ===== Very small mobile (<375px) ===== */
@media (max-width: 375px) {
  .dt-summary-card {
    flex: 0 0 110px;
    padding: 10px;
  }

  .dt-summary-card__value {
    font-size: 18px;
  }

  .dt-summary-card__icon-wrap {
    width: 28px;
    height: 28px;
  }

  .dt-pill {
    padding: 4px 10px;
    font-size: 12px;
  }

  .dt-chart-box {
    height: 180px;
  }

  .dt-detail-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ===== Desktop enhancements (>768px) ===== */
@media (min-width: 769px) {
  .dt-anchor-stats {
    padding: 0 0 32px;
  }

  .dt-filter-bar {
    padding: 12px 20px;
    border-radius: 0 0 16px 16px;
  }

  .dt-summary-scroll {
    padding: 16px 20px;
  }

  .dt-summary-card {
    flex: 0 0 148px;
  }

  .dt-card {
    margin: 0 20px 16px;
  }

  .dt-rank-item:hover {
    background: #FAFBFD;
  }

  .dt-chart-box {
    height: 320px;
  }
}

/* ===== Ant Design overrides for DingTalk feel ===== */
:deep(.ant-select-dropdown) {
  border-radius: 10px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
}

:deep(.ant-select-item-option-selected) {
  background: rgba(22, 119, 255, 0.08) !important;
  color: #1677FF !important;
  font-weight: 500 !important;
}

:deep(.ant-picker) {
  border-radius: 8px !important;
}

:deep(.ant-picker-focused) {
  border-color: #1677FF !important;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1) !important;
}

:deep(.ant-spin-dot-item) {
  background-color: #1677FF !important;
}

:deep(.ant-empty-description) {
  color: var(--dt-text-secondary) !important;
  font-size: 13px !important;
}

:deep(.ant-select-selection-placeholder) {
  color: var(--dt-text-hint) !important;
}

/* ===== Analysis Button ===== */
.dt-analysis-btn {
  border: none;
  background: none;
  color: var(--dt-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  font-family: var(--dt-font);
  transition: background 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.dt-analysis-btn:hover {
  background: rgba(22, 119, 255, 0.08);
}

.dt-analysis-btn:active {
  background: rgba(22, 119, 255, 0.15);
}


</style>

<style>
/* Drawer样式需要非scoped（Drawer teleport到body） */
.dt-analysis-drawer .ant-drawer-header { border-bottom: 1px solid #F0F0F0; padding: 16px 20px; }
.dt-analysis-drawer .ant-drawer-body { padding: 20px; background: #FAFBFD; }
.dt-analysis-header { display: flex; align-items: center; gap: 12px; }
.dt-analysis-header__avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #1677FF, #4D9AFF); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; flex-shrink: 0; }
.dt-analysis-header__name { font-size: 16px; font-weight: 600; color: #333; line-height: 1.3; }
.dt-analysis-header__sub { font-size: 12px; color: #999; }
.dt-analysis-loading { display: flex; align-items: center; justify-content: center; padding: 80px 0; }
.dt-analysis-body { padding: 0; }
.dt-analysis-empty { display: flex; align-items: center; justify-content: center; padding: 60px 0; color: #C8C9CC; }
.dt-analysis-section { margin-bottom: 24px; }
.dt-analysis-section__title { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 12px; padding-left: 8px; border-left: 3px solid #1677FF; }
.dt-score-bars { display: flex; flex-direction: column; gap: 12px; }
.dt-score-bar-row { display: flex; align-items: center; gap: 10px; }
.dt-score-bar-label { width: 60px; font-size: 12px; color: #999; flex-shrink: 0; text-align: right; }
.dt-score-bar-track { flex: 1; height: 10px; background: #F0F0F0; border-radius: 5px; overflow: hidden; }
.dt-score-bar-fill { height: 100%; border-radius: 5px; transition: width 0.6s ease; min-width: 4px; }
.dt-score-bar-value { width: 28px; font-size: 14px; font-weight: 700; text-align: center; flex-shrink: 0; }
.dt-analysis-chart { width: 100%; height: 240px; }
.dt-timeslot-cards { display: flex; flex-direction: column; gap: 8px; }
.dt-timeslot-card { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F9FAFB; border-radius: 8px; border: 1px solid #F0F0F0; }
.dt-timeslot-card--best { background: rgba(22, 119, 255, 0.04); border-color: rgba(22, 119, 255, 0.2); }
.dt-timeslot-card__rank { font-size: 11px; font-weight: 600; color: #1677FF; background: rgba(22, 119, 255, 0.1); padding: 2px 8px; border-radius: 4px; flex-shrink: 0; }
.dt-timeslot-card__label { font-size: 13px; font-weight: 500; color: #333; flex-shrink: 0; }
.dt-timeslot-card__metrics { display: flex; gap: 12px; font-size: 11px; color: #999; flex-wrap: wrap; }
.dt-timeslot-card__metrics strong { color: #333; font-weight: 600; }
.dt-insight-block { padding: 12px 14px; border-radius: 8px; margin-bottom: 10px; }
.dt-insight-block--strength { background: rgba(0, 181, 120, 0.05); border: 1px solid rgba(0, 181, 120, 0.15); }
.dt-insight-block--weakness { background: rgba(255, 49, 65, 0.05); border: 1px solid rgba(255, 49, 65, 0.15); }
.dt-insight-block__header { font-size: 13px; font-weight: 600; color: #333; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.dt-insight-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dt-insight-dot--green { background: #00B578; }
.dt-insight-dot--red { background: #FF3141; }
.dt-insight-list { list-style: none; padding: 0; margin: 0; }
.dt-insight-list li { font-size: 12px; color: #333; line-height: 1.6; padding-left: 14px; position: relative; }
.dt-insight-list li::before { content: ''; position: absolute; left: 0; top: 8px; width: 4px; height: 4px; border-radius: 50%; background: #C8C9CC; }
.dt-trend-table { display: flex; flex-direction: column; gap: 8px; }
.dt-trend-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #F9FAFB; border-radius: 8px; font-size: 13px; }
.dt-trend-date { font-weight: 600; color: #333; min-width: 40px; }
.dt-trend-gmv { font-weight: 700; color: #1A1A1A; }
.dt-trend-orders { color: #666; }
.dt-trend-roi { font-weight: 600; margin-left: auto; }
@media (max-width: 768px) {
  .dt-analysis-chart { height: 200px; }
  .dt-timeslot-card { flex-direction: column; align-items: flex-start; gap: 6px; }
}
</style>
