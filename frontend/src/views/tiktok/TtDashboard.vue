<template>
  <div class="tt-page">
    <div class="tt-page__header">
      <h2 class="tt-page__title">跨境驾驶舱</h2>
      <div class="tt-page__actions">
        <a-range-picker v-model:value="dateRange" :presets="presets" size="small" style="max-width:240px" @change="loadData" />
      </div>
    </div>

    <!-- KPI 卡片 -->
    <div class="tt-kpi-grid">
      <div class="tt-kpi-card" v-for="kpi in kpiList" :key="kpi.key">
        <div class="tt-kpi-card__label">{{ kpi.label }}</div>
        <div class="tt-kpi-card__value">{{ kpi.value }}</div>
        <div class="tt-kpi-card__trend" :class="kpi.trendClass">
          <span v-if="kpi.trend !== null">{{ kpi.trend > 0 ? '+' : '' }}{{ kpi.trend }}%</span>
          <span v-else class="tt-kpi-card__trend--na">--</span>
          <span class="tt-kpi-card__vs">vs 昨日</span>
        </div>
      </div>
    </div>

    <!-- 趋势图 -->
    <div class="tt-card">
      <div class="tt-card__header">
        <span class="tt-card__title">消耗趋势</span>
        <a-radio-group v-model:value="trendMetric" size="small" button-style="solid" @change="loadTrend">
          <a-radio-button value="spend">消耗</a-radio-button>
          <a-radio-button value="conversions">转化</a-radio-button>
          <a-radio-button value="roas">ROAS</a-radio-button>
        </a-radio-group>
      </div>
      <div ref="trendChart" class="tt-chart"></div>
    </div>

    <!-- TOP 素材 -->
    <div class="tt-card">
      <div class="tt-card__header">
        <span class="tt-card__title">TOP 素材</span>
        <a-select v-model:value="topMetric" size="small" style="width:100px" @change="loadTop">
          <a-select-option value="spend">消耗</a-select-option>
          <a-select-option value="conversions">转化</a-select-option>
          <a-select-option value="roas">ROAS</a-select-option>
        </a-select>
      </div>
      <div class="tt-top-list">
        <div class="tt-top-item" v-for="(item, i) in topList" :key="item.id" @click="$router.push('/tt-materials/' + item.id)">
          <div class="tt-top-item__rank" :class="'tt-top-item__rank--' + (i < 3 ? i+1 : 'n')">{{ i + 1 }}</div>
          <div class="tt-top-item__info">
            <div class="tt-top-item__title">{{ item.title || '未命名素材' }}</div>
            <div class="tt-top-item__meta">
              <span v-if="item.market" class="tt-tag tt-tag--market">{{ item.market }}</span>
              <span class="tt-top-item__stat">消耗 ${{ fmtNum(item.spend) }}</span>
              <span class="tt-top-item__stat">转化 {{ item.conversions || 0 }}</span>
              <span class="tt-top-item__stat">ROAS {{ fmtNum(item.roas, 2) }}</span>
            </div>
          </div>
          <div class="tt-top-item__arrow">›</div>
        </div>
        <a-empty v-if="!topList.length && !loading" description="暂无数据" />
      </div>
    </div>

    <!-- 素材概览 -->
    <div class="tt-card">
      <div class="tt-card__header">
        <span class="tt-card__title">素材概览</span>
      </div>
      <div class="tt-stat-row">
        <div class="tt-stat-cell">
          <div class="tt-stat-cell__num">{{ summary.materials?.total || 0 }}</div>
          <div class="tt-stat-cell__label">素材总数</div>
        </div>
        <div class="tt-stat-cell">
          <div class="tt-stat-cell__num tt-stat-cell__num--green">{{ summary.materials?.pushed || 0 }}</div>
          <div class="tt-stat-cell__label">已投放</div>
        </div>
        <div class="tt-stat-cell">
          <div class="tt-stat-cell__num tt-stat-cell__num--blue">{{ summary.materials?.approved || 0 }}</div>
          <div class="tt-stat-cell__label">待投放</div>
        </div>
        <div class="tt-stat-cell">
          <div class="tt-stat-cell__num">{{ summary.accounts || 0 }}</div>
          <div class="tt-stat-cell__label">广告账户</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import request from '../../utils/request'
import dayjs from 'dayjs'
import * as echarts from 'echarts'

const loading = ref(false)
const summary = ref({})
const trendData = ref([])
const topList = ref([])
const trendMetric = ref('spend')
const topMetric = ref('spend')
const trendChart = ref(null)
let chartInstance = null

const dateRange = ref([dayjs().subtract(7, 'day'), dayjs()])
const presets = [
  { label: '近7天', value: [dayjs().subtract(7, 'day'), dayjs()] },
  { label: '近14天', value: [dayjs().subtract(14, 'day'), dayjs()] },
  { label: '近30天', value: [dayjs().subtract(30, 'day'), dayjs()] },
]

const kpiList = computed(() => {
  const t = summary.value.today || {}
  const y = summary.value.yesterday || {}
  const trend = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100).toFixed(1) : null
  return [
    { key: 'spend', label: '今日消耗', value: '$' + fmtNum(t.spend), trend: trend(t.spend, y.spend), trendClass: t.spend > y.spend ? 'tt-kpi-card__trend--up' : 'tt-kpi-card__trend--down' },
    { key: 'conversions', label: '今日转化', value: t.conversions || 0, trend: trend(t.conversions, y.conversions), trendClass: t.conversions > y.conversions ? 'tt-kpi-card__trend--up' : 'tt-kpi-card__trend--down' },
    { key: 'roas', label: 'ROAS', value: fmtNum(t.roas, 2), trend: trend(t.roas, y.roas), trendClass: t.roas > y.roas ? 'tt-kpi-card__trend--up' : 'tt-kpi-card__trend--down' },
    { key: 'active', label: '活跃素材', value: t.active_materials || 0, trend: null, trendClass: '' },
  ]
})

function fmtNum(n, d = 0) {
  if (!n && n !== 0) return '0'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

async function loadData() {
  loading.value = true
  try {
    const [sumRes, trendRes, topRes] = await Promise.all([
      request.get('/tt-dashboard/summary'),
      request.get('/tt-dashboard/trend', { params: { days: 14 } }),
      request.get('/tt-dashboard/top', { params: { days: 7, metric: topMetric.value } }),
    ])
    summary.value = sumRes.data || {}
    trendData.value = trendRes.data || []
    topList.value = topRes.data || []
    await nextTick()
    renderChart()
  } catch (e) { console.error(e) }
  loading.value = false
}

async function loadTrend() {
  try {
    const res = await request.get('/tt-dashboard/trend', { params: { days: 14 } })
    trendData.value = res.data || []
    renderChart()
  } catch (e) { console.error(e) }
}

async function loadTop() {
  try {
    const res = await request.get('/tt-dashboard/top', { params: { days: 7, metric: topMetric.value } })
    topList.value = res.data || []
  } catch (e) { console.error(e) }
}

function renderChart() {
  if (!trendChart.value) return
  if (!chartInstance) chartInstance = echarts.init(trendChart.value)
  const m = trendMetric.value
  const labels = { spend: '消耗($)', conversions: '转化数', roas: 'ROAS' }
  chartInstance.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 16, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: trendData.value.map(r => r.stat_date?.slice(5)), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', name: labels[m], axisLabel: { fontSize: 11 } },
    series: [{ type: 'line', smooth: true, data: trendData.value.map(r => Number(r[m]) || 0), areaStyle: { opacity: 0.15 }, itemStyle: { color: '#1677ff' } }]
  }, true)
}

onMounted(() => { loadData(); window.addEventListener('resize', () => chartInstance?.resize()) })
</script>

<style scoped>
/* ===== 钉钉风格通用样式 ===== */
.tt-page { padding: 12px; max-width: 1200px; margin: 0 auto; }
.tt-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.tt-page__title { font-size: 18px; font-weight: 600; color: #1f2329; margin: 0; }
.tt-page__actions { display: flex; gap: 8px; align-items: center; }

/* KPI 卡片网格 */
.tt-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
@media (min-width: 768px) { .tt-kpi-grid { grid-template-columns: repeat(4, 1fr); gap: 12px; } }
.tt-kpi-card { background: #fff; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-kpi-card__label { font-size: 12px; color: #8f959e; margin-bottom: 4px; }
.tt-kpi-card__value { font-size: 22px; font-weight: 700; color: #1f2329; line-height: 1.2; }
.tt-kpi-card__trend { font-size: 11px; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
.tt-kpi-card__trend--up { color: #f5222d; }
.tt-kpi-card__trend--down { color: #52c41a; }
.tt-kpi-card__trend--na { color: #c0c4cc; }
.tt-kpi-card__vs { color: #c0c4cc; }

/* 卡片 */
.tt-card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-card__title { font-size: 15px; font-weight: 600; color: #1f2329; }

/* 图表 */
.tt-chart { height: 220px; }
@media (min-width: 768px) { .tt-chart { height: 300px; } }

/* TOP 列表 */
.tt-top-list { }
.tt-top-item { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.tt-top-item:last-child { border-bottom: none; }
.tt-top-item:active { background: #f7f8fa; }
.tt-top-item__rank { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #8f959e; background: #f0f0f0; margin-right: 10px; flex-shrink: 0; }
.tt-top-item__rank--1 { background: #ff4d4f; color: #fff; }
.tt-top-item__rank--2 { background: #ff7a45; color: #fff; }
.tt-top-item__rank--3 { background: #ffa940; color: #fff; }
.tt-top-item__info { flex: 1; min-width: 0; }
.tt-top-item__title { font-size: 14px; color: #1f2329; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-top-item__meta { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; align-items: center; }
.tt-top-item__stat { font-size: 11px; color: #8f959e; }
.tt-top-item__arrow { color: #c0c4cc; font-size: 18px; margin-left: 4px; }

/* 标签 */
.tt-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.tt-tag--market { background: #e6f7ff; color: #1890ff; }

/* 统计行 */
.tt-stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; text-align: center; }
.tt-stat-cell__num { font-size: 20px; font-weight: 700; color: #1f2329; }
.tt-stat-cell__num--green { color: #52c41a; }
.tt-stat-cell__num--blue { color: #1677ff; }
.tt-stat-cell__label { font-size: 11px; color: #8f959e; margin-top: 2px; }
</style>
