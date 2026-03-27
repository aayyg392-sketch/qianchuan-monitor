<template>
  <div class="ops-stats">
    <!-- Header -->
    <div class="page-header">
      <h2 class="page-title">数据统计</h2>
    </div>

    <!-- Section 1: Date Range Picker -->
    <div class="date-bar">
      <div class="date-presets">
        <a-button
          v-for="preset in datePresets"
          :key="preset.key"
          :type="activeDatePreset === preset.key ? 'primary' : 'default'"
          size="small"
          @click="selectPreset(preset)"
        >{{ preset.label }}</a-button>
      </div>
      <a-range-picker
        v-model:value="dateRange"
        :placeholder="['开始日期', '结束日期']"
        @change="onDateChange"
        size="small"
      />
    </div>

    <a-spin :spinning="loading">
      <!-- Section 2: KPI Summary -->
      <div class="kpi-grid">
        <div
          v-for="kpi in kpiCards"
          :key="kpi.key"
          class="kpi-card"
          :style="{ borderLeft: `4px solid ${kpi.color}` }"
        >
          <div class="kpi-card__icon" :style="{ background: kpi.bgColor }">
            <component :is="kpi.icon" :style="{ fontSize: '20px', color: kpi.color }" />
          </div>
          <div class="kpi-card__data">
            <div class="kpi-card__label">{{ kpi.label }}</div>
            <div class="kpi-card__value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
          </div>
        </div>
      </div>

      <!-- Section 3: 趋势分析 (ECharts Line) -->
      <div class="chart-section">
        <div class="chart-section__header">
          <span class="chart-section__title">趋势分析</span>
          <div class="chart-section__legend">
            <span class="legend-item"><span class="legend-dot" style="background:#1677ff"></span>评论数</span>
            <span class="legend-item"><span class="legend-dot" style="background:#52c41a"></span>回复数</span>
            <span class="legend-item"><span class="legend-dot" style="background:#faad14"></span>成功率</span>
          </div>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
        <a-empty
          v-if="!trendData.length"
          description="暂无趋势数据"
          :image-style="{ height: '60px' }"
          class="chart-empty"
        />
      </div>

      <!-- Section 4: 评论分类占比 (ECharts Pie) -->
      <div class="chart-section">
        <div class="chart-section__header">
          <span class="chart-section__title">评论分类占比</span>
        </div>
        <div ref="pieChartRef" class="chart-container chart-container--pie"></div>
        <a-empty
          v-if="!categoryData.length"
          description="暂无分类数据"
          :image-style="{ height: '60px' }"
          class="chart-empty"
        />
      </div>

      <!-- Section 5: 账号维度 -->
      <div class="data-section">
        <div class="data-section__header">
          <span class="data-section__title">账号维度</span>
        </div>

        <!-- Mobile: Cards -->
        <div v-if="isMobile" class="dimension-cards">
          <div v-for="row in accountStats" :key="row.account_id" class="dimension-card">
            <div class="dimension-card__header">
              <span class="dimension-card__name">{{ row.account_name }}</span>
              <a-tag :color="row.status === 'active' ? 'green' : 'default'" size="small">
                {{ row.status === 'active' ? '正常' : '停用' }}
              </a-tag>
            </div>
            <div class="dimension-card__grid">
              <div class="dimension-card__item">
                <span class="dim-label">发出评论</span>
                <span class="dim-value">{{ row.comments_sent }}</span>
              </div>
              <div class="dimension-card__item">
                <span class="dim-label">发出回复</span>
                <span class="dim-value">{{ row.replies_sent }}</span>
              </div>
              <div class="dimension-card__item">
                <span class="dim-label">成功率</span>
                <span
                  class="dim-value"
                  :style="{ color: rateColor(row.success_rate) }"
                >{{ row.success_rate }}%</span>
              </div>
            </div>
          </div>
          <a-empty v-if="!accountStats.length" description="暂无数据" />
        </div>

        <!-- Desktop: Table -->
        <a-table
          v-else
          :columns="accountColumns"
          :data-source="accountStats"
          row-key="account_id"
          size="small"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="record.status === 'active' ? 'green' : 'default'" size="small">
                {{ record.status === 'active' ? '正常' : '停用' }}
              </a-tag>
            </template>
            <template v-if="column.key === 'success_rate'">
              <span :style="{ color: rateColor(record.success_rate) }">
                {{ record.success_rate }}%
              </span>
            </template>
          </template>
        </a-table>
      </div>

      <!-- Section 6: 视频维度 -->
      <div class="data-section">
        <div class="data-section__header">
          <span class="data-section__title">视频维度</span>
        </div>

        <!-- Mobile: Cards -->
        <div v-if="isMobile" class="dimension-cards">
          <div v-for="row in videoStats" :key="row.video_id" class="dimension-card">
            <div class="dimension-card__header">
              <span class="dimension-card__name text-ellipsis">{{ row.video_title }}</span>
            </div>
            <div class="dimension-card__grid">
              <div class="dimension-card__item">
                <span class="dim-label">收到评论</span>
                <span class="dim-value">{{ row.comments_received }}</span>
              </div>
              <div class="dimension-card__item">
                <span class="dim-label">已回复</span>
                <span class="dim-value">{{ row.replies_sent }}</span>
              </div>
              <div class="dimension-card__item">
                <span class="dim-label">互动率</span>
                <span class="dim-value" style="color:#1677ff">{{ row.engagement_rate }}%</span>
              </div>
            </div>
          </div>
          <a-empty v-if="!videoStats.length" description="暂无数据" />
        </div>

        <!-- Desktop: Table -->
        <a-table
          v-else
          :columns="videoColumns"
          :data-source="videoStats"
          row-key="video_id"
          size="small"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'video_title'">
              <span class="text-ellipsis-table">{{ record.video_title }}</span>
            </template>
            <template v-if="column.key === 'engagement_rate'">
              <span style="color:#1677ff">{{ record.engagement_rate }}%</span>
            </template>
          </template>
        </a-table>
      </div>
    </a-spin>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import {
  MessageOutlined,
  CommentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import request from '@/utils/request'

// ---------- Responsive ----------
const isMobile = ref(window.innerWidth < 768)
const onResize = () => {
  isMobile.value = window.innerWidth < 768
  trendChart?.resize()
  pieChart?.resize()
}

// ---------- State ----------
const loading = ref(false)
const dateRange = ref(null)
const activeDatePreset = ref('7d')
const trendData = ref([])
const categoryData = ref([])
const accountStats = ref([])
const videoStats = ref([])

// ---------- Chart Refs ----------
const trendChartRef = ref(null)
const pieChartRef = ref(null)
let trendChart = null
let pieChart = null

// ---------- Date Presets ----------
const datePresets = [
  { key: 'today', label: '今日', days: 0 },
  { key: 'yesterday', label: '昨日', days: 1 },
  { key: '7d', label: '近7天', days: 7 },
  { key: '30d', label: '近30天', days: 30 },
]

function selectPreset(preset) {
  activeDatePreset.value = preset.key
  const end = dayjs()
  let start
  if (preset.key === 'today') {
    start = dayjs().startOf('day')
  } else if (preset.key === 'yesterday') {
    start = dayjs().subtract(1, 'day').startOf('day')
  } else {
    start = dayjs().subtract(preset.days, 'day').startOf('day')
  }
  dateRange.value = [start, end]
  loadAll()
}

function onDateChange() {
  activeDatePreset.value = ''
  loadAll()
}

// ---------- KPI Cards ----------
const kpiCards = reactive([
  { key: 'totalComments', label: '总评论数', value: '--', icon: MessageOutlined, color: '#1677ff', bgColor: '#e6f4ff' },
  { key: 'totalReplies', label: '总回复数', value: '--', icon: CommentOutlined, color: '#52c41a', bgColor: '#f6ffed' },
  { key: 'successRate', label: '成功率', value: '--', icon: CheckCircleOutlined, color: '#faad14', bgColor: '#fffbe6' },
  { key: 'avgResponseTime', label: '平均响应时间', value: '--', icon: ClockCircleOutlined, color: '#722ed1', bgColor: '#f9f0ff' },
])

// ---------- Table Columns ----------
const accountColumns = [
  { title: '账号名称', dataIndex: 'account_name', key: 'account_name', width: 160 },
  { title: '发出评论', dataIndex: 'comments_sent', key: 'comments_sent', width: 100 },
  { title: '发出回复', dataIndex: 'replies_sent', key: 'replies_sent', width: 100 },
  { title: '成功率', key: 'success_rate', width: 100 },
  { title: '状态', key: 'status', width: 80 },
]

const videoColumns = [
  { title: '视频标题', key: 'video_title', ellipsis: true },
  { title: '收到评论', dataIndex: 'comments_received', key: 'comments_received', width: 100 },
  { title: '已回复', dataIndex: 'replies_sent', key: 'replies_sent', width: 100 },
  { title: '互动率', key: 'engagement_rate', width: 100 },
]

// ---------- Lifecycle ----------
onMounted(() => {
  window.addEventListener('resize', onResize)
  initCharts()
  selectPreset(datePresets[2]) // Default: 近7天
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  trendChart?.dispose()
  pieChart?.dispose()
  trendChart = null
  pieChart = null
})

// ---------- Chart Init ----------
function initCharts() {
  nextTick(() => {
    if (trendChartRef.value) {
      trendChart = echarts.init(trendChartRef.value)
    }
    if (pieChartRef.value) {
      pieChart = echarts.init(pieChartRef.value)
    }
  })
}

// ---------- Data Loading ----------
function getDateParams() {
  if (dateRange.value && dateRange.value.length === 2) {
    return {
      start_date: dateRange.value[0].format('YYYY-MM-DD'),
      end_date: dateRange.value[1].format('YYYY-MM-DD'),
    }
  }
  return {}
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([
      loadDailyStats(),
      loadCategoryStats(),
      loadAccountStats(),
      loadVideoStats(),
    ])
  } finally {
    loading.value = false
  }
}

async function loadDailyStats() {
  try {
    const res = await request.get('/operations/stats/daily', { params: getDateParams() })
    const d = res.data || {}

    // Update KPI cards
    kpiCards[0].value = d.total_comments ?? 0
    kpiCards[1].value = d.total_replies ?? 0
    kpiCards[2].value = d.success_rate != null ? `${d.success_rate}%` : '0%'
    kpiCards[3].value = d.avg_response_time != null ? `${d.avg_response_time}s` : '-'

    // Trend data for chart
    const daily = d.daily || d.trend || []
    trendData.value = daily
    updateTrendChart(daily)
  } catch (e) {
    console.error('Failed to load daily stats:', e)
  }
}

async function loadCategoryStats() {
  try {
    const res = await request.get('/operations/logs', {
      params: { ...getDateParams(), group_by: 'ai_category' },
    })
    const raw = res.data || []
    categoryData.value = raw
    updatePieChart(raw)
  } catch (e) {
    console.error('Failed to load category stats:', e)
  }
}

async function loadAccountStats() {
  try {
    const res = await request.get('/operations/stats/by-account', { params: getDateParams() })
    accountStats.value = res.data || []
  } catch (e) {
    console.error('Failed to load account stats:', e)
  }
}

async function loadVideoStats() {
  try {
    const res = await request.get('/operations/stats/by-video', { params: getDateParams() })
    videoStats.value = res.data || []
  } catch (e) {
    console.error('Failed to load video stats:', e)
  }
}

// ---------- Chart Updates ----------
function updateTrendChart(daily) {
  if (!trendChart || !daily.length) return

  const dates = daily.map((d) => d.date)
  const comments = daily.map((d) => d.comments ?? 0)
  const replies = daily.map((d) => d.replies ?? 0)
  const rates = daily.map((d) => d.success_rate ?? 0)

  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#1a1a1a', fontSize: 13 },
    },
    grid: {
      left: 12,
      right: 12,
      top: 40,
      bottom: 12,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisLabel: { color: '#8c8c8c', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '数量',
        nameTextStyle: { color: '#8c8c8c', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f5f5f5' } },
      },
      {
        type: 'value',
        name: '成功率(%)',
        nameTextStyle: { color: '#8c8c8c', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 11, formatter: '{value}%' },
        splitLine: { show: false },
        min: 0,
        max: 100,
      },
    ],
    series: [
      {
        name: '评论数',
        type: 'line',
        data: comments,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#1677ff' },
        itemStyle: { color: '#1677ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(22,119,255,0.15)' },
            { offset: 1, color: 'rgba(22,119,255,0.01)' },
          ]),
        },
      },
      {
        name: '回复数',
        type: 'line',
        data: replies,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#52c41a' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82,196,26,0.15)' },
            { offset: 1, color: 'rgba(82,196,26,0.01)' },
          ]),
        },
      },
      {
        name: '成功率',
        type: 'line',
        yAxisIndex: 1,
        data: rates,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#faad14', type: 'dashed' },
        itemStyle: { color: '#faad14' },
      },
    ],
  })
}

function updatePieChart(raw) {
  if (!pieChart || !raw.length) return

  const colorMap = {
    '好评': '#52c41a',
    '咨询': '#1677ff',
    '差评': '#ff4d4f',
    '疑问': '#faad14',
    '其他': '#8c8c8c',
  }

  const pieData = raw.map((item) => ({
    name: item.ai_category || item.category || '其他',
    value: item.count ?? item.total ?? 0,
  }))

  pieChart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#1a1a1a', fontSize: 13 },
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: isMobile.value ? 'horizontal' : 'vertical',
      right: isMobile.value ? 'center' : 24,
      top: isMobile.value ? 'bottom' : 'middle',
      textStyle: { color: '#595959', fontSize: 13 },
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: isMobile.value ? ['50%', '45%'] : ['40%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: !isMobile.value,
          formatter: '{b}\n{d}%',
          fontSize: 12,
          color: '#595959',
        },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' },
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.15)' },
        },
        data: pieData.map((d) => ({
          ...d,
          itemStyle: { color: colorMap[d.name] || '#8c8c8c' },
        })),
      },
    ],
  })
}

// ---------- Helpers ----------
function rateColor(rate) {
  if (rate >= 80) return '#52c41a'
  if (rate >= 50) return '#faad14'
  return '#ff4d4f'
}
</script>

<style scoped>
.ops-stats {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
  background: #f5f5f5;
  min-height: 100vh;
}

/* Header */
.page-header {
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}

/* Date Bar */
.date-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.date-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* KPI Grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.kpi-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 14px;
}
.kpi-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kpi-card__data {
  flex: 1;
  min-width: 0;
}
.kpi-card__label {
  font-size: 13px;
  color: #8c8c8c;
  margin-bottom: 4px;
}
.kpi-card__value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

/* Chart Section */
.chart-section {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 24px;
  overflow: hidden;
  position: relative;
}
.chart-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #f5f5f5;
  flex-wrap: wrap;
  gap: 8px;
}
.chart-section__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}
.chart-section__legend {
  display: flex;
  gap: 16px;
}
.legend-item {
  font-size: 12px;
  color: #8c8c8c;
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.chart-container {
  width: 100%;
  height: 300px;
  padding: 8px;
}
.chart-container--pie {
  height: 320px;
}
.chart-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin-top: 24px;
}

/* Data Sections */
.data-section {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 24px;
  overflow: hidden;
}
.data-section__header {
  padding: 16px;
  border-bottom: 1px solid #f5f5f5;
}
.data-section__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}
.data-section :deep(.ant-table-wrapper) {
  padding: 0 8px 8px;
}

/* Dimension Cards (Mobile) */
.dimension-cards {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dimension-card {
  background: #fafafa;
  border-radius: 10px;
  padding: 14px;
}
.dimension-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.dimension-card__name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}
.dimension-card__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.dimension-card__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dim-label {
  font-size: 12px;
  color: #8c8c8c;
}
.dim-value {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.text-ellipsis-table {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Desktop Breakpoint */
@media (min-width: 768px) {
  .ops-stats {
    padding: 24px;
  }
  .date-bar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .kpi-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .chart-container {
    height: 360px;
    padding: 16px;
  }
  .chart-container--pie {
    height: 380px;
  }
}
</style>
