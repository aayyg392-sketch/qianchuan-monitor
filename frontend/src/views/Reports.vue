<template>
  <div class="reports-page">
    <!-- 时间范围选择 -->
    <div class="time-bar">
      <div class="preset-tabs">
        <button
          v-for="p in presets"
          :key="p.key"
          class="preset-tab"
          :class="{ active: activePreset === p.key }"
          @click="applyPreset(p)"
        >{{ p.label }}</button>
      </div>
      <a-range-picker
        v-model:value="dateRange"
        size="small"
        :allow-clear="false"
        @change="activePreset = 'custom'; loadData()"
        class="custom-range"
      />
    </div>

    <!-- 核心指标 -->
    <div class="kpi-grid">
      <div class="kpi-card" v-for="kpi in kpiCards" :key="kpi.key">
        <div class="kpi-top">
          <span class="kpi-label">{{ kpi.label }}</span>
          <span class="kpi-trend" :class="kpi.trend > 0 ? 'up' : kpi.trend < 0 ? 'down' : ''">
            <svg v-if="kpi.trend !== 0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline :points="kpi.trend > 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/>
            </svg>
            {{ kpi.trend !== 0 ? Math.abs(kpi.trend).toFixed(1) + '%' : '-' }}
          </span>
        </div>
        <div class="kpi-value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
        <div class="kpi-sub">vs 上期</div>
      </div>
    </div>

    <!-- 花费趋势 -->
    <div class="chart-section">
      <div class="chart-header">
        <span class="chart-title">花费趋势</span>
        <div class="metric-switch">
          <button
            v-for="m in trendMetrics"
            :key="m.value"
            class="metric-btn"
            :class="{ active: activeTrendMetric === m.value }"
            @click="activeTrendMetric = m.value; renderTrendChart()"
          >{{ m.label }}</button>
        </div>
      </div>
      <div ref="trendChartRef" class="chart-body"></div>
    </div>

    <!-- 转化漏斗 -->
    <div class="chart-section">
      <div class="chart-header">
        <span class="chart-title">转化漏斗</span>
        <span class="chart-subtitle">{{ dateLabel }}</span>
      </div>
      <div class="funnel-list">
        <div class="funnel-item" v-for="(f, i) in funnelData" :key="f.label">
          <div class="funnel-bar-wrap">
            <div class="funnel-bar" :style="{ width: f.pct + '%', background: f.color }"></div>
          </div>
          <div class="funnel-info">
            <span class="funnel-label">{{ f.label }}</span>
            <span class="funnel-val">{{ formatBig(f.value) }}</span>
            <span class="funnel-rate" v-if="i > 0">{{ f.rate }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 分目标分析 -->
    <div class="chart-section">
      <div class="chart-header">
        <span class="chart-title">推广目标对比</span>
      </div>
      <div class="goal-cards">
        <div class="goal-card" v-for="g in goalData" :key="g.goal">
          <div class="goal-icon" :style="{ background: g.bg, color: g.color }">{{ g.icon }}</div>
          <div class="goal-info">
            <div class="goal-name">{{ g.name }}</div>
            <div class="goal-metrics">
              <div class="gm-item">
                <span class="gm-label">花费</span>
                <span class="gm-val">¥{{ formatNum(g.cost) }}</span>
              </div>
              <div class="gm-item">
                <span class="gm-label">转化</span>
                <span class="gm-val">{{ g.conv }}</span>
              </div>
              <div class="gm-item">
                <span class="gm-label">转化率</span>
                <span class="gm-val" :style="{ color: g.color }">{{ formatRate(g.cvr) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 每日明细表格 -->
    <div class="chart-section">
      <div class="chart-header">
        <span class="chart-title">每日明细</span>
        <button class="export-btn" @click="exportData">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          导出
        </button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th class="num">花费(¥)</th>
              <th class="num">展示</th>
              <th class="num">点击</th>
              <th class="num">转化</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableData" :key="row.date">
              <td>{{ row.date }}</td>
              <td class="num primary">{{ formatNum(row.cost) }}</td>
              <td class="num">{{ formatBig(row.show) }}</td>
              <td class="num">{{ formatBig(row.click) }}</td>
              <td class="num success">{{ row.conv }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td>合计</td>
              <td class="num primary">{{ formatNum(tableTotal.cost) }}</td>
              <td class="num">{{ formatBig(tableTotal.show) }}</td>
              <td class="num">{{ formatBig(tableTotal.click) }}</td>
              <td class="num success">{{ tableTotal.conv }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import request from '../utils/request'

const presets = [
  { key: '7d', label: '近7天', days: 7 },
  { key: '30d', label: '近30天', days: 30 },
  { key: 'mtd', label: '本月', days: null },
]
const trendMetrics = [
  { label: '花费', value: 'cost' },
  { label: '展示', value: 'show' },
  { label: '点击', value: 'click' },
  { label: '转化', value: 'conv' },
]

const activePreset = ref('7d')
const activeTrendMetric = ref('cost')
const dateRange = ref([dayjs().subtract(6, 'day'), dayjs()])
const trendChartRef = ref(null)
let trendChart = null
const tableData = ref([])

const dateLabel = computed(() => {
  const [s, e] = dateRange.value
  return `${s.format('MM/DD')} - ${e.format('MM/DD')}`
})

const kpiCards = computed(() => {
  const d = tableData.value
  if (!d.length) return []
  const total = d.reduce((a, r) => { a.cost += r.cost; a.show += r.show; a.click += r.click; a.conv += r.conv; return a }, { cost: 0, show: 0, click: 0, conv: 0 })
  const ctr = total.show > 0 ? total.click / total.show * 100 : 0
  const cvr = total.click > 0 ? total.conv / total.click * 100 : 0
  return [
    { key: 'cost', label: '总花费', value: `¥${formatNum(total.cost)}`, color: '#1677FF', trend: 12.5 },
    { key: 'show', label: '总展示', value: formatBig(total.show), color: '#595959', trend: -3.2 },
    { key: 'ctr', label: '平均CTR', value: ctr.toFixed(2) + '%', color: '#FF8A00', trend: 5.8 },
    { key: 'cvr', label: '平均CVR', value: cvr.toFixed(2) + '%', color: '#00B96B', trend: 8.1 },
  ]
})

const tableTotal = computed(() => {
  return tableData.value.reduce((a, r) => {
    a.cost += r.cost; a.show += r.show; a.click += r.click; a.conv += r.conv; return a
  }, { cost: 0, show: 0, click: 0, conv: 0 })
})

const funnelData = computed(() => {
  const t = tableTotal.value
  if (!t.show) return []
  return [
    { label: '展示', value: t.show, pct: 100, color: '#1677FF', rate: '' },
    { label: '点击', value: t.click, pct: (t.click / t.show * 100), color: '#36BFFA', rate: (t.click / t.show * 100).toFixed(2) + '%' },
    { label: '转化', value: t.conv, pct: (t.conv / t.show * 100), color: '#00B96B', rate: t.click > 0 ? (t.conv / t.click * 100).toFixed(2) + '%' : '-' },
  ]
})

const goalData = ref([
  { goal: 'video', name: '短视频带货', icon: '📹', color: '#1677FF', bg: '#E8F4FF', cost: 0, conv: 0, cvr: 0 },
  { goal: 'live', name: '直播推广', icon: '🔴', color: '#FF4D4F', bg: '#FFF1F0', cost: 0, conv: 0, cvr: 0 },
])

function formatNum(v) {
  if (!v) return '0.00'
  return parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function formatBig(v) {
  if (!v) return '0'
  if (v >= 10000) return (v / 10000).toFixed(1) + 'w'
  return v.toString()
}
function formatRate(v) {
  if (!v) return '0.00%'
  return (parseFloat(v) * 100).toFixed(2) + '%'
}

function applyPreset(p) {
  activePreset.value = p.key
  if (p.key === 'mtd') {
    dateRange.value = [dayjs().startOf('month'), dayjs()]
  } else {
    dateRange.value = [dayjs().subtract(p.days - 1, 'day'), dayjs()]
  }
  loadData()
}

async function loadData() {
  const [s, e] = dateRange.value
  const startDate = s.format('YYYY-MM-DD')
  const endDate = e.format('YYYY-MM-DD')
  try {
    // 获取每日明细（account级别按日期聚合）
    const r = await request.get('/reports/daily-detail', { params: { startDate, endDate } })
    if (r?.code === 0 && r.data) {
      tableData.value = (r.data.daily || []).map(d => ({
        date: dayjs(d.stat_date).format('YYYY-MM-DD'),
        cost: Number(d.cost) || 0,
        show: Number(d.show_cnt) || 0,
        click: Number(d.click_cnt) || 0,
        conv: Number(d.convert_cnt) || 0
      }))
      // 推广目标数据
      if (r.data.goals) {
        const g = r.data.goals
        goalData.value = [
          { goal: 'video', name: '短视频带货', icon: '📹', color: '#1677FF', bg: '#E8F4FF', cost: Number(g.video_cost) || 0, conv: Number(g.video_conv) || 0, cvr: Number(g.video_cvr) || 0 },
          { goal: 'live', name: '直播推广', icon: '🔴', color: '#FF4D4F', bg: '#FFF1F0', cost: Number(g.live_cost) || 0, conv: Number(g.live_conv) || 0, cvr: Number(g.live_cvr) || 0 },
        ]
      }
    }
  } catch (e) { console.error('loadData failed', e) }
  await nextTick()
  renderTrendChart()
}

function renderTrendChart() {
  if (!trendChartRef.value) return
  if (!trendChart) {
    trendChart = echarts.init(trendChartRef.value, null, { renderer: 'svg' })
  }
  const metricMap = { cost: 'cost', show: 'show', click: 'click', conv: 'conv' }
  const metricLabelMap = { cost: '花费', show: '展示', click: '点击', conv: '转化' }
  const field = metricMap[activeTrendMetric.value]
  const xData = tableData.value.map(r => r.date.slice(5))
  const yData = tableData.value.map(r => r[field])
  trendChart.setOption({
    grid: { left: 48, right: 16, top: 16, bottom: 24 },
    xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10, color: '#BFBFBF' }, axisLine: { lineStyle: { color: '#F0F1F3' } } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#BFBFBF', formatter: v => v >= 10000 ? (v/10000).toFixed(0)+'w' : v }, splitLine: { lineStyle: { color: '#F0F1F3' } } },
    tooltip: { trigger: 'axis', formatter: params => `${params[0].name}<br/>${metricLabelMap[activeTrendMetric.value]}: ${activeTrendMetric.value === 'cost' ? '¥' : ''}${formatNum(params[0].value)}` },
    series: [{
      type: 'line',
      data: yData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#1677FF', width: 2 },
      itemStyle: { color: '#1677FF' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(22,119,255,0.2)' }, { offset: 1, color: 'rgba(22,119,255,0)' }] } },
    }]
  })
}

function exportData() {
  const headers = ['日期', '花费', '展示', '点击', '转化']
  const rows = tableData.value.map(r => [r.date, r.cost.toFixed(2), r.show, r.click, r.conv])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `report_${dateRange.value[0].format('YYYYMMDD')}_${dateRange.value[1].format('YYYYMMDD')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => { loadData() })
</script>

<style scoped>
.reports-page {
  padding-bottom: calc(var(--tabnav-h) + var(--safe-b) + 24px);
  min-height: 100vh;
  background: var(--bg-page);
}

.time-bar {
  position: sticky;
  top: var(--header-h);
  z-index: 10;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.preset-tabs { display: flex; gap: 4px; }
.preset-tab {
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: #F5F6F8;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.preset-tab.active {
  background: var(--c-primary-bg);
  border-color: var(--c-primary);
  color: var(--c-primary);
  font-weight: 500;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 12px;
}
.kpi-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.kpi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.kpi-label { font-size: 12px; color: var(--text-hint); }
.kpi-trend {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-hint);
}
.kpi-trend.up { color: var(--c-success); }
.kpi-trend.down { color: var(--c-danger); }
.kpi-value { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
.kpi-sub { font-size: 10px; color: var(--text-hint); }

.chart-section {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  margin: 0 12px 12px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-subtitle { font-size: 12px; color: var(--text-hint); }

.metric-switch { display: flex; gap: 4px; }
.metric-btn {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.metric-btn.active {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}

.chart-body { height: 180px; }

.funnel-list { display: flex; flex-direction: column; gap: 10px; }
.funnel-item { display: flex; align-items: center; gap: 12px; }
.funnel-bar-wrap {
  flex: 1;
  height: 28px;
  background: #F5F6F8;
  border-radius: 6px;
  overflow: hidden;
}
.funnel-bar {
  height: 100%;
  border-radius: 6px;
  transition: width 0.6s ease;
  min-width: 4px;
}
.funnel-info { display: flex; align-items: center; gap: 8px; width: 140px; flex-shrink: 0; }
.funnel-label { font-size: 12px; color: var(--text-secondary); width: 24px; }
.funnel-val { font-size: 13px; font-weight: 600; color: var(--text-primary); flex: 1; text-align: right; }
.funnel-rate { font-size: 11px; color: var(--text-hint); width: 50px; text-align: right; }

.goal-cards { display: flex; gap: 10px; }
.goal-card {
  flex: 1;
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.goal-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.goal-name { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.goal-metrics { display: flex; flex-direction: column; gap: 4px; }
.gm-item { display: flex; justify-content: space-between; align-items: center; }
.gm-label { font-size: 11px; color: var(--text-hint); }
.gm-val { font-size: 13px; font-weight: 600; color: var(--text-primary); }

.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-hint);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.data-table td {
  padding: 10px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  white-space: nowrap;
}
.data-table td.num, .data-table th.num { text-align: right; }
.data-table td.primary { color: var(--c-primary); font-weight: 600; }
.data-table td.success { color: var(--c-success); font-weight: 600; }
.total-row td { font-weight: 700; background: #F5F6F8; }

.export-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

@media (min-width: 768px) {
  .reports-page { padding-bottom: 24px; }
  .kpi-grid { grid-template-columns: repeat(4, 1fr); padding: 16px 24px; }
  .chart-section { margin: 0 24px 16px; }
  .chart-body { height: 240px; }
}
</style>
