<template>
  <div class="live-replay">
    <div class="page-header">
      <h2 class="page-title">直播复盘</h2>
      <div class="page-header__actions">
        <a-select v-model:value="selectedRoom" style="width: 180px" placeholder="选择直播间">
          <a-select-option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.nickname }}</a-select-option>
        </a-select>
        <a-date-picker v-model:value="selectedDate" @change="loadReplay" />
        <a-button type="primary" @click="exportReport">导出报告</a-button>
      </div>
    </div>

    <!-- Replay Summary -->
    <div class="replay-summary">
      <div class="summary-metric" v-for="item in summaryMetrics" :key="item.label">
        <div class="summary-metric__value" :style="{ color: item.color }">{{ item.value }}</div>
        <div class="summary-metric__label">{{ item.label }}</div>
        <div class="summary-metric__change" :class="item.changeType">{{ item.change }}</div>
      </div>
    </div>

    <a-tabs v-model:activeKey="replayTab">
      <!-- Tab: 综合复盘 -->
      <a-tab-pane key="overview" tab="综合复盘">
        <a-card title="AI 复盘总结" :bordered="false">
          <div class="ai-summary">
            <div class="ai-summary__section" v-for="section in aiSummary" :key="section.title">
              <h4 class="ai-summary__title">{{ section.icon }} {{ section.title }}</h4>
              <ul class="ai-summary__list">
                <li v-for="(point, idx) in section.points" :key="idx">{{ point }}</li>
              </ul>
            </div>
          </div>
        </a-card>
        <a-card title="全场数据曲线" :bordered="false" style="margin-top: 12px">
          <div ref="overviewChartRef" class="chart-box"></div>
        </a-card>
      </a-tab-pane>

      <!-- Tab: 时段回放 -->
      <a-tab-pane key="timeline" tab="时段回放">
        <div class="timeline-controls">
          <a-slider v-model:value="currentTimeIdx" :min="0" :max="timelineSlots.length - 1" :tip-formatter="(v) => timelineSlots[v]" style="flex: 1" />
          <span class="timeline-time">{{ timelineSlots[currentTimeIdx] || '' }}</span>
        </div>
        <div class="timeline-detail">
          <div class="timeline-metrics">
            <div class="tl-metric" v-for="m in currentTimeMetrics" :key="m.label">
              <span class="tl-metric__label">{{ m.label }}</span>
              <span class="tl-metric__value">{{ m.value }}</span>
            </div>
          </div>
          <div class="timeline-speech" v-if="currentTimeSpeech.length">
            <h4>该时段话术</h4>
            <div class="tl-speech-item" v-for="(s, idx) in currentTimeSpeech" :key="idx">
              <a-tag :color="s.tag_color" size="small">{{ s.tag }}</a-tag>
              <span class="tl-speech-text">{{ s.text }}</span>
            </div>
          </div>
        </div>
      </a-tab-pane>

      <!-- Tab: 数据对比 -->
      <a-tab-pane key="compare" tab="数据对比">
        <div class="compare-controls">
          <a-select v-model:value="compareType" style="width: 160px">
            <a-select-option value="history">历史直播对比</a-select-option>
            <a-select-option value="competitor">竞品直播对比</a-select-option>
          </a-select>
          <a-date-picker v-if="compareType === 'history'" v-model:value="compareDate" placeholder="对比日期" />
          <a-select v-else v-model:value="compareRoom" style="width: 160px" placeholder="选择竞品">
            <a-select-option value="comp1">竞品A直播间</a-select-option>
            <a-select-option value="comp2">竞品B直播间</a-select-option>
          </a-select>
        </div>
        <a-card :bordered="false" style="margin-top: 12px">
          <a-table :dataSource="compareData" :columns="compareColumns" :pagination="false" size="small" />
        </a-card>
        <a-card title="对比趋势" :bordered="false" style="margin-top: 12px">
          <div ref="compareChartRef" class="chart-box"></div>
        </a-card>
      </a-tab-pane>

      <!-- Tab: 导出报表 -->
      <a-tab-pane key="export" tab="导出报表">
        <div class="export-options">
          <div class="export-option" v-for="opt in exportOptions" :key="opt.key" @click="doExport(opt.key)">
            <div class="export-option__icon">{{ opt.icon }}</div>
            <div class="export-option__info">
              <div class="export-option__name">{{ opt.name }}</div>
              <div class="export-option__desc">{{ opt.desc }}</div>
            </div>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'
import dayjs from 'dayjs'

const selectedRoom = ref(1)
const selectedDate = ref(dayjs())
const replayTab = ref('overview')
const rooms = ref([
  { id: 1, nickname: '好物推荐官' },
  { id: 2, nickname: '美妆达人小美' },
])

const summaryMetrics = ref([])
const realtimeData = ref(null)

const loadSummaryFromAPI = async () => {
  try {
    const res = await request.get('/api/live/rooms/1/realtime')
    if (res && res.data) {
      realtimeData.value = res.data
      const d = res.data
      summaryMetrics.value = [
        { label: '直播时长', value: d.duration || '--', color: '#1677FF', change: d.duration_change || '', changeType: d.duration_change_type || '' },
        { label: '累计场观', value: d.total_viewers != null ? d.total_viewers.toLocaleString() : '--', color: '#722ED1', change: d.viewers_change || '', changeType: d.viewers_change_type || '' },
        { label: '在线峰值', value: d.peak_online != null ? d.peak_online.toLocaleString() : '--', color: '#13C2C2', change: d.peak_change || '', changeType: d.peak_change_type || '' },
        { label: '总GMV', value: d.total_gmv != null ? '¥' + d.total_gmv.toLocaleString() : '--', color: '#FF8A00', change: d.gmv_change || '', changeType: d.gmv_change_type || '' },
        { label: '订单数', value: d.total_orders != null ? d.total_orders.toLocaleString() : '--', color: '#00B96B', change: d.orders_change || '', changeType: d.orders_change_type || '' },
        { label: '整体ROI', value: d.roi != null ? d.roi.toFixed(2) : '--', color: '#FF4D4F', change: d.roi_change || '', changeType: d.roi_change_type || '' },
      ]
    }
  } catch (e) {
    summaryMetrics.value = []
  }
}

const aiSummary = ref([
  { icon: '📊', title: '流量分析', points: [
    '本场直播总场观28,900人，较上场增长12.3%，自然推荐流量占比58%',
    '14:00-15:00为流量高峰，在线峰值5,230人，建议在该时段重点投放千川',
    '平均停留时长2m30s，较上场提升5.2%，互动留人话术效果显著',
  ]},
  { icon: '💰', title: '销售转化', points: [
    '总GMV ¥186,500，订单2,356单，客单价¥79.2，GPM ¥1,280',
    '爆款"美白精华液"贡献GMV 40%，转化率13.3%，是全场最高转化商品',
    '14:30的逼单话术转化率达12.3%，建议重点复用该话术模板',
  ]},
  { icon: '📢', title: '投产效率', points: [
    '千川投放消耗¥45,200，付费ROI 2.18，较上场提升0.3',
    '14:00-15:00投产比最高达2.8，建议增加该时段预算',
    '16:00后ROI跌破1.5，建议降低该时段投放力度或更换素材',
  ]},
  { icon: '🎯', title: '优化建议', points: [
    '建议增加"美白精华液"的讲解时长，该产品转化率最高',
    '互动留人话术效果好，建议每30分钟穿插一次福利环节',
    '16:00后观众疲劳明显，建议安排新品上架或大额福利刺激',
  ]},
])

// Timeline
const timelineSlots = Array.from({ length: 55 }, (_, i) => {
  const h = Math.floor(i * 5 / 60) + 10
  const m = (i * 5) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})
const currentTimeIdx = ref(30)
const timeSlotData = ref({})

const loadTimeSlotData = async (idx) => {
  const time = timelineSlots[idx]
  if (!time) return
  try {
    const res = await request.get('/api/live/rooms/1/realtime', { params: { time_slot: time } })
    if (res && res.data) {
      timeSlotData.value = res.data
    }
  } catch (e) {
    timeSlotData.value = {}
  }
}

const currentTimeMetrics = computed(() => {
  const d = timeSlotData.value
  if (!d || Object.keys(d).length === 0) {
    return [
      { label: '在线人数', value: '--' },
      { label: '进房人数', value: '--' },
      { label: 'GMV', value: '--' },
      { label: '订单量', value: '--' },
      { label: '转化率', value: '--' },
      { label: '千川消耗', value: '--' },
    ]
  }
  return [
    { label: '在线人数', value: d.online != null ? d.online.toLocaleString() : '--' },
    { label: '进房人数', value: d.enter_count != null ? d.enter_count.toLocaleString() : '--' },
    { label: 'GMV', value: d.gmv != null ? '¥' + d.gmv.toLocaleString() : '--' },
    { label: '订单量', value: d.orders != null ? d.orders.toString() : '--' },
    { label: '转化率', value: d.cvr != null ? d.cvr.toFixed(1) + '%' : '--' },
    { label: '千川消耗', value: d.cost != null ? '¥' + d.cost.toLocaleString() : '--' },
  ]
})
const currentTimeSpeech = computed(() => [
  { tag: '卖点讲解', tag_color: 'blue', text: '这款精华液用的是专利成分，渗透力是普通产品的3倍' },
  { tag: '逼单促单', tag_color: 'red', text: '最后200单，拍完恢复原价！' },
])

// Compare
const compareType = ref('history')
const compareDate = ref(null)
const compareRoom = ref(null)
const compareData = ref([
  { key: 1, metric: '场观', current: '28,900', compare: '25,600', diff: '+12.9%' },
  { key: 2, metric: '在线峰值', current: '5,230', compare: '4,800', diff: '+9.0%' },
  { key: 3, metric: 'GMV', current: '¥186,500', compare: '¥152,300', diff: '+22.5%' },
  { key: 4, metric: '订单数', current: '2,356', compare: '1,980', diff: '+19.0%' },
  { key: 5, metric: 'ROI', current: '2.18', compare: '1.88', diff: '+16.0%' },
  { key: 6, metric: '平均停留', current: '2m30s', compare: '2m10s', diff: '+15.4%' },
])
const compareColumns = [
  { title: '指标', dataIndex: 'metric', key: 'metric' },
  { title: '本场', dataIndex: 'current', key: 'current' },
  { title: '对比场', dataIndex: 'compare', key: 'compare' },
  { title: '差异', dataIndex: 'diff', key: 'diff' },
]

// Export
const exportOptions = ref([
  { key: 'full', icon: '📋', name: '完整复盘报告', desc: '包含流量、销售、投产、话术全维度数据' },
  { key: 'timeslot', icon: '📊', name: '分时段报表(Excel)', desc: '按5分钟/15分钟/30分钟/小时导出分时段数据' },
  { key: 'speech', icon: '📝', name: '话术文档', desc: '导出全场话术记录及高转化话术标注' },
  { key: 'summary', icon: '🤖', name: 'AI总结报告', desc: '自动生成的AI分析复盘报告' },
])

const exportReport = () => { message.success('报告导出中...') }
const doExport = (key) => { message.success(`正在导出: ${key}`) }
const loadReplay = async () => {
  await loadSummaryFromAPI()
  await loadOverviewChart()
  initCharts()
  message.success('数据已刷新')
}

const overviewChartRef = ref(null)
const compareChartRef = ref(null)
let charts = {}

const overviewChartData = ref(null)

const loadOverviewChart = async () => {
  try {
    const res = await request.get('/api/live/rooms/1/realtime', { params: { type: 'chart' } })
    if (res && res.data) {
      overviewChartData.value = res.data
    }
  } catch (e) {
    overviewChartData.value = null
  }
}

const initCharts = async () => {
  await nextTick()
  if (overviewChartRef.value) {
    charts.overview?.dispose()
    charts.overview = echarts.init(overviewChartRef.value)
    const cd = overviewChartData.value
    if (!cd || !cd.times || !cd.times.length) {
      charts.overview.setOption({
        title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14, fontWeight: 'normal' } },
        xAxis: { show: false }, yAxis: { show: false }, series: []
      })
      return
    }
    charts.overview.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['在线人数', 'GMV', '千川消耗'] },
      grid: { left: 50, right: 50, top: 36, bottom: 24 },
      xAxis: { type: 'category', data: cd.times, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: [{ type: 'value', name: '人数' }, { type: 'value', name: '元' }],
      series: [
        { name: '在线人数', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, lineStyle: { color: '#1677FF' }, itemStyle: { color: '#1677FF' }, data: cd.online || [] },
        { name: 'GMV', type: 'bar', yAxisIndex: 1, itemStyle: { color: '#00B96B', borderRadius: [3, 3, 0, 0] }, data: cd.gmv || [] },
        { name: '千川消耗', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#FF4D4F', type: 'dashed' }, itemStyle: { color: '#FF4D4F' }, data: cd.cost || [] },
      ]
    })
  }
}

watch(replayTab, async (v) => {
  if (v === 'overview') initCharts()
  if (v === 'compare') {
    await nextTick()
    if (compareChartRef.value) {
      charts.compare?.dispose()
      charts.compare = echarts.init(compareChartRef.value)
      const metrics = ['场观', '峰值', 'GMV', '订单', 'ROI', '停留']
      charts.compare.setOption({
        tooltip: {},
        legend: { data: ['本场', '对比场'] },
        radar: {
          indicator: metrics.map(m => ({ name: m, max: 100 })),
        },
        series: [{
          type: 'radar',
          data: [
            { value: [85, 78, 92, 80, 75, 82], name: '本场', lineStyle: { color: '#1677FF' }, areaStyle: { color: 'rgba(22,119,255,0.15)' } },
            { value: [72, 68, 76, 65, 62, 70], name: '对比场', lineStyle: { color: '#FF8A00' }, areaStyle: { color: 'rgba(255,138,0,0.1)' } },
          ]
        }]
      })
    }
  }
})

watch(currentTimeIdx, (idx) => { loadTimeSlotData(idx) })

onMounted(async () => {
  await loadSummaryFromAPI()
  await loadOverviewChart()
  initCharts()
  loadTimeSlotData(currentTimeIdx.value)
})
onUnmounted(() => { Object.values(charts).forEach(c => c?.dispose()) })
</script>

<style scoped>
.live-replay { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; margin: 0; }
.page-header__actions { display: flex; gap: 8px; flex-wrap: wrap; }

.replay-summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
.summary-metric { background: #fff; border-radius: 10px; padding: 14px; text-align: center; border: 1px solid var(--border); }
.summary-metric__value { font-size: 20px; font-weight: 700; line-height: 1.2; }
.summary-metric__label { font-size: 11px; color: var(--text-hint); margin-top: 4px; }
.summary-metric__change { font-size: 11px; margin-top: 2px; }
.summary-metric__change.up { color: var(--c-success); }
.summary-metric__change.down { color: var(--c-danger); }

.ai-summary { display: flex; flex-direction: column; gap: 16px; }
.ai-summary__title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.ai-summary__list { margin: 0; padding-left: 20px; }
.ai-summary__list li { font-size: 13px; line-height: 1.8; color: var(--text-secondary); }

.chart-box { height: 300px; }

.timeline-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: #fff; border-radius: 10px; }
.timeline-time { font-size: 14px; font-weight: 600; color: var(--c-primary); white-space: nowrap; }
.timeline-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.timeline-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tl-metric { background: #fff; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid var(--border); }
.tl-metric__label { font-size: 11px; color: var(--text-hint); }
.tl-metric__value { font-size: 16px; font-weight: 700; margin-top: 4px; }
.timeline-speech { background: #fff; border-radius: 10px; padding: 14px; border: 1px solid var(--border); }
.timeline-speech h4 { font-size: 13px; margin: 0 0 8px; }
.tl-speech-item { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 8px; font-size: 13px; }
.tl-speech-text { line-height: 1.5; }

.compare-controls { display: flex; gap: 8px; flex-wrap: wrap; }

.export-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.export-option { display: flex; gap: 12px; padding: 16px; background: #fff; border-radius: 10px; border: 1px solid var(--border); cursor: pointer; transition: all 0.2s; }
.export-option:hover { border-color: var(--c-primary); box-shadow: var(--shadow-sm); }
.export-option__icon { font-size: 28px; }
.export-option__name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.export-option__desc { font-size: 12px; color: var(--text-hint); }

@media (max-width: 767px) {
  .replay-summary { grid-template-columns: repeat(2, 1fr); }
  .timeline-detail { grid-template-columns: 1fr; }
  .timeline-metrics { grid-template-columns: repeat(2, 1fr); }
  .export-options { grid-template-columns: 1fr; }
}
</style>
