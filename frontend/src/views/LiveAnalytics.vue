<template>
  <div class="live-analytics">
    <div class="page-header">
      <h2 class="page-title">分时数据</h2>
      <div class="page-header__actions">
        <a-select v-model:value="selectedRoom" style="width: 200px" placeholder="选择直播间" @change="loadData">
          <a-select-option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.nickname }}</a-select-option>
        </a-select>
        <a-date-picker v-model:value="selectedDate" @change="loadData" />
      </div>
    </div>

    <!-- Time Granularity Selector -->
    <div class="granularity-bar">
      <a-segmented v-model:value="granularity" :options="['5分钟', '15分钟', '30分钟', '1小时']" @change="loadData" />
    </div>

    <!-- Tab Categories -->
    <a-tabs v-model:activeKey="dataTab" class="data-tabs">
      <!-- 流量数据 -->
      <a-tab-pane key="traffic" tab="流量数据">
        <div class="kpi-row">
          <div class="kpi-card" v-for="kpi in trafficKpis" :key="kpi.label">
            <div class="kpi-card__value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
            <div class="kpi-card__label">{{ kpi.label }}</div>
          </div>
        </div>
        <a-card title="GMV & 订单趋势" :bordered="false" style="margin-top: 12px">
          <div ref="trafficChartRef" class="chart-box"></div>
        </a-card>
        <a-card title="分时段明细" :bordered="false" style="margin-top: 12px">
          <a-table :dataSource="trafficTable" :columns="trafficColumns" :pagination="{ pageSize: 20 }" size="small" :scroll="{ x: 800 }" />
        </a-card>
      </a-tab-pane>

      <!-- 销售转化 -->
      <a-tab-pane key="sales" tab="销售转化">
        <div class="kpi-row">
          <div class="kpi-card" v-for="kpi in salesKpis" :key="kpi.label">
            <div class="kpi-card__value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
            <div class="kpi-card__label">{{ kpi.label }}</div>
          </div>
        </div>
        <a-card title="GMV & 转化趋势" :bordered="false" style="margin-top: 12px">
          <div ref="salesChartRef" class="chart-box"></div>
        </a-card>
        <a-card title="分时段销售明细" :bordered="false" style="margin-top: 12px">
          <a-table :dataSource="salesTable" :columns="salesColumns" :pagination="{ pageSize: 20 }" size="small" :scroll="{ x: 900 }" />
        </a-card>
      </a-tab-pane>

      <!-- 投产数据 -->
      <a-tab-pane key="roi" tab="投产数据">
        <div class="kpi-row">
          <div class="kpi-card" v-for="kpi in roiKpis" :key="kpi.label">
            <div class="kpi-card__value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
            <div class="kpi-card__label">{{ kpi.label }}</div>
          </div>
        </div>
        <a-card title="千川投产趋势" :bordered="false" style="margin-top: 12px">
          <div ref="roiChartRef" class="chart-box"></div>
        </a-card>
        <a-card title="分时段投产明细" :bordered="false" style="margin-top: 12px">
          <a-table :dataSource="roiTable" :columns="roiColumns" :pagination="{ pageSize: 20 }" size="small" :scroll="{ x: 900 }" />
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import request from '../utils/request'
import * as echarts from 'echarts'
import dayjs from 'dayjs'

const selectedRoom = ref(null)
const selectedDate = ref(dayjs())
const granularity = ref('5分钟')
const dataTab = ref('traffic')
const rooms = ref([])

// KPIs
const trafficKpis = ref([])
const salesKpis = ref([])
const roiKpis = ref([])

// Tables
const trafficTable = ref([])
const trafficColumns = [
  { title: '时段', dataIndex: 'period', key: 'period', width: 80, fixed: 'left' },
  { title: '新增订单', dataIndex: 'orders', key: 'orders' },
  { title: '新增GMV', dataIndex: 'gmv', key: 'gmv' },
  { title: '千川消耗', dataIndex: 'cost', key: 'cost' },
  { title: 'ROI', dataIndex: 'roi', key: 'roi' },
  { title: '商品点击', dataIndex: 'product_click', key: 'product_click' },
  { title: '加购数', dataIndex: 'cart', key: 'cart' },
]

const salesTable = ref([])
const salesColumns = [
  { title: '时段', dataIndex: 'period', key: 'period', width: 80, fixed: 'left' },
  { title: '新增GMV', dataIndex: 'gmv', key: 'gmv' },
  { title: '新增订单', dataIndex: 'orders', key: 'orders' },
  { title: '客单价', dataIndex: 'aov', key: 'aov' },
  { title: '累计GMV', dataIndex: 'total_gmv', key: 'total_gmv' },
  { title: '累计订单', dataIndex: 'total_orders', key: 'total_orders' },
]

const roiTable = ref([])
const roiColumns = [
  { title: '时段', dataIndex: 'period', key: 'period', width: 80, fixed: 'left' },
  { title: '千川消耗', dataIndex: 'cost', key: 'cost' },
  { title: '新增GMV', dataIndex: 'gmv', key: 'gmv' },
  { title: 'ROI', dataIndex: 'roi', key: 'roi' },
  { title: '累计消耗', dataIndex: 'total_cost', key: 'total_cost' },
  { title: '累计ROI', dataIndex: 'total_roi', key: 'total_roi' },
]

// Chart refs
const trafficChartRef = ref(null)
const salesChartRef = ref(null)
const roiChartRef = ref(null)
let charts = {}

const formatNum = (n) => {
  if (!n) return '0'
  n = Number(n)
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n.toLocaleString()
}
const formatMoney = (n) => {
  n = Number(n || 0)
  if (n >= 10000) return '¥' + (n / 10000).toFixed(2) + 'w'
  return '¥' + n.toFixed(2)
}

// 加载直播间列表
const loadRooms = async () => {
  try {
    const res = await request.get('/live/rooms')
    rooms.value = res?.data || []
    if (rooms.value.length) {
      selectedRoom.value = rooms.value[0].id
      loadData()
    }
  } catch (e) {
    console.warn('loadRooms failed:', e)
  }
}

// 按时间粒度聚合数据（累计值 → 平滑增量值）
const aggregateByGranularity = (rawData) => {
  const minsMap = { '5分钟': 5, '15分钟': 15, '30分钟': 30, '1小时': 60 }
  const mins = minsMap[granularity.value] || 5

  // Step 1: 按时段分桶，每个桶取最后一条的累计值
  const buckets = {}
  for (const row of rawData) {
    const t = dayjs(row.recorded_at)
    const bucket = Math.floor(t.minute() / mins) * mins
    const key = t.format('HH') + ':' + String(bucket).padStart(2, '0')
    buckets[key] = {
      period: key,
      orders: Number(row.order_count || 0),
      gmv: Number(row.gmv || 0),
      cost: Number(row.qianchuan_cost || 0),
      paid_uv: Number(row.paid_uv || 0),
      product_click: Number(row.product_click || 0),
      cart: Number(row.cart_count || 0),
      paid_gmv: Number(row.paid_gmv || 0),
      online: Number(row.online_count || 0),
      uv_value: Number(row.uv_value || 0),
      gpm: Number(row.gpm || 0),
      roi_raw: Number(row.qianchuan_roi || 0),
    }
  }

  const sorted = Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period))
  const firstIdx = sorted.findIndex(s => s.orders > 0 || s.gmv > 0 || s.cost > 0)
  if (firstIdx < 0) return []

  // Step 2: 找出累计值有变化的"锚点"，将增量平滑分摊到中间的空槽
  const fields = ['orders', 'gmv', 'cost', 'paid_uv', 'product_click', 'cart', 'paid_gmv']
  const deltas = sorted.map(() => ({}))

  for (const field of fields) {
    let lastChangeIdx = firstIdx
    let lastVal = sorted[firstIdx][field]
    // 第一个时段的值作为初始增量
    deltas[firstIdx][field] = 0

    for (let i = firstIdx + 1; i < sorted.length; i++) {
      const curVal = sorted[i][field]
      const diff = curVal - lastVal
      if (diff > 0) {
        // 有变化：平均分摊到 lastChangeIdx+1 ~ i 的所有时段
        const slots = i - lastChangeIdx
        const perSlot = diff / slots
        for (let j = lastChangeIdx + 1; j <= i; j++) {
          deltas[j][field] = Math.round(perSlot * 100) / 100
        }
        lastChangeIdx = i
        lastVal = curVal
      } else {
        deltas[i][field] = 0
      }
    }
  }

  // Step 3: 构建结果，跳过首个时段之前的空数据
  const result = []
  for (let i = firstIdx; i < sorted.length; i++) {
    const cur = sorted[i]
    const d = deltas[i]
    const dGmv = d.gmv || 0
    const dCost = d.cost || 0
    const dOrders = Math.round(d.orders || 0)
    result.push({
      ...cur,
      delta_orders: dOrders,
      delta_gmv: dGmv,
      delta_cost: dCost,
      delta_paid_uv: Math.round(d.paid_uv || 0),
      delta_click: Math.round(d.product_click || 0),
      delta_cart: Math.round(d.cart || 0),
      delta_paid_gmv: d.paid_gmv || 0,
      roi: dCost > 0 ? (dGmv / dCost).toFixed(2) : (cur.cost > 0 ? cur.roi_raw.toFixed(2) : '-'),
    })
  }
  return result
}

const loadData = async () => {
  if (!selectedRoom.value) return
  try {
    const date = selectedDate.value.format('YYYY-MM-DD')
    const res = await request.get(`/live/rooms/${selectedRoom.value}/timeslot`, { params: { date } })
    const rawData = res?.data || []

    if (!rawData.length) {
      trafficTable.value = []; salesTable.value = []; roiTable.value = []
      trafficKpis.value = []; salesKpis.value = []; roiKpis.value = []
      return
    }

    const aggregated = aggregateByGranularity(rawData)
    const latest = rawData[rawData.length - 1]
    const totalGmv = Number(latest.gmv || 0)
    const totalCost = Number(latest.qianchuan_cost || 0)
    const totalOrders = Number(latest.order_count || 0)
    const totalPaidUv = Number(latest.paid_uv || 0)

    // 更新KPIs - 使用有实际数据的指标
    trafficKpis.value = [
      { label: '累计GMV', value: formatMoney(totalGmv), color: '#1677FF' },
      { label: '累计订单', value: formatNum(totalOrders), color: '#722ED1' },
      { label: '千川消耗', value: formatMoney(totalCost), color: '#FF4D4F' },
      { label: 'ROI', value: Number(latest.qianchuan_roi || 0).toFixed(2), color: '#00B96B' },
      { label: '客单价', value: '¥' + (totalOrders > 0 ? (totalGmv / totalOrders).toFixed(0) : '0'), color: '#FF8A00' },
    ]
    salesKpis.value = [
      { label: '实时GMV', value: formatMoney(totalGmv), color: '#FF8A00' },
      { label: '订单量', value: formatNum(totalOrders), color: '#1677FF' },
      { label: '客单价', value: '¥' + (totalOrders > 0 ? (totalGmv / totalOrders).toFixed(0) : '0'), color: '#722ED1' },
      { label: 'UV价值', value: '¥' + Number(latest.uv_value || 0).toFixed(2), color: '#00B96B' },
      { label: 'GPM', value: Number(latest.gpm || 0).toFixed(0), color: '#13C2C2' },
    ]
    roiKpis.value = [
      { label: '千川消耗', value: formatMoney(totalCost), color: '#FF4D4F' },
      { label: '付费UV', value: formatNum(totalPaidUv), color: '#1677FF' },
      { label: '付费GMV', value: formatMoney(Number(latest.paid_gmv || 0)), color: '#00B96B' },
      { label: 'ROI', value: Number(latest.qianchuan_roi || 0).toFixed(2), color: '#FF8A00' },
      { label: '投产比', value: '1:' + Number(latest.qianchuan_roi || 0).toFixed(2), color: '#722ED1' },
    ]

    // 更新表格 - 用增量值填充
    trafficTable.value = aggregated.map((r, i) => ({
      key: i, period: r.period,
      orders: r.delta_orders,
      gmv: formatMoney(r.delta_gmv),
      cost: formatMoney(r.delta_cost),
      roi: r.roi,
      product_click: r.delta_click > 0 ? formatNum(r.delta_click) : '-',
      cart: r.delta_cart > 0 ? formatNum(r.delta_cart) : '-',
    }))
    salesTable.value = aggregated.map((r, i) => ({
      key: i, period: r.period,
      gmv: formatMoney(r.delta_gmv),
      orders: r.delta_orders,
      aov: r.delta_orders > 0 ? '¥' + (r.delta_gmv / r.delta_orders).toFixed(0) : '-',
      total_gmv: formatMoney(r.gmv),
      total_orders: formatNum(r.orders),
    }))
    roiTable.value = aggregated.map((r, i) => ({
      key: i, period: r.period,
      cost: formatMoney(r.delta_cost),
      gmv: formatMoney(r.delta_gmv),
      roi: r.roi,
      total_cost: formatMoney(r.cost),
      total_roi: r.cost > 0 ? (r.gmv / r.cost).toFixed(2) : '-',
    }))

    // 更新图表
    await nextTick()
    renderCharts(aggregated)
  } catch (e) {
    console.warn('loadData failed:', e)
  }
}

const renderCharts = (aggregated) => {
  Object.values(charts).forEach(c => c?.dispose())
  charts = {}
  const labels = aggregated.map(r => r.period)
  const gmvData = aggregated.map(r => r.delta_gmv.toFixed(0))
  const orderData = aggregated.map(r => r.delta_orders)
  const costData = aggregated.map(r => r.delta_cost.toFixed(0))
  const paidUvData = aggregated.map(r => r.delta_paid_uv)

  if (trafficChartRef.value) {
    charts.traffic = echarts.init(trafficChartRef.value)
    charts.traffic.setOption({
      tooltip: { trigger: 'axis' }, legend: { data: ['新增GMV', '新增订单'] },
      grid: { left: 60, right: 40, top: 32, bottom: 24 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, rotate: labels.length > 20 ? 45 : 0 } },
      yAxis: [{ type: 'value', name: '元' }, { type: 'value', name: '单' }],
      series: [
        { name: '新增GMV', type: 'bar', itemStyle: { color: '#1677FF', borderRadius: [3, 3, 0, 0] }, data: gmvData },
        { name: '新增订单', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#FF8A00' }, itemStyle: { color: '#FF8A00' }, data: orderData },
      ]
    })
  }
  if (salesChartRef.value) {
    charts.sales = echarts.init(salesChartRef.value)
    charts.sales.setOption({
      tooltip: { trigger: 'axis' }, legend: { data: ['GMV', '订单量'] },
      grid: { left: 50, right: 40, top: 32, bottom: 24 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      yAxis: [{ type: 'value', name: '元' }, { type: 'value', name: '单' }],
      series: [
        { name: 'GMV', type: 'bar', itemStyle: { color: '#1677FF', borderRadius: [3, 3, 0, 0] }, data: gmvData },
        { name: '订单量', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#FF8A00' }, itemStyle: { color: '#FF8A00' }, data: orderData },
      ]
    })
  }
  if (roiChartRef.value) {
    charts.roi = echarts.init(roiChartRef.value)
    charts.roi.setOption({
      tooltip: { trigger: 'axis' }, legend: { data: ['千川消耗', 'ROI'] },
      grid: { left: 50, right: 40, top: 32, bottom: 24 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      yAxis: [{ type: 'value', name: '元' }, { type: 'value', name: 'ROI' }],
      series: [
        { name: '千川消耗', type: 'bar', itemStyle: { color: '#FF4D4F', borderRadius: [3, 3, 0, 0] }, data: costData },
        { name: 'ROI', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#00B96B' }, itemStyle: { color: '#00B96B' }, data: aggregated.map(r => r.roi === '-' ? null : Number(r.roi)) },
      ]
    })
  }
}

watch(dataTab, async () => {
  await nextTick()
  // 切换tab后图表需要重新渲染（因为隐藏的tab中echarts尺寸为0）
  if (dataTab.value === 'sales' && salesChartRef.value && !charts.sales) loadData()
  if (dataTab.value === 'roi' && roiChartRef.value && !charts.roi) loadData()
})

onMounted(() => { loadRooms() })
onUnmounted(() => { Object.values(charts).forEach(c => c?.dispose()) })
</script>

<style scoped>
.live-analytics { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; margin: 0; }
.page-header__actions { display: flex; gap: 8px; }
.granularity-bar { margin-bottom: 12px; }

.kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.kpi-card { background: #fff; border-radius: 10px; padding: 14px; text-align: center; border: 1px solid var(--border); }
.kpi-card__value { font-size: 20px; font-weight: 700; line-height: 1.2; }
.kpi-card__label { font-size: 11px; color: var(--text-hint); margin-top: 4px; }

.chart-box { height: 280px; width: 100%; }
.data-tabs { margin-top: 4px; }

@media (max-width: 767px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .kpi-card__value { font-size: 16px; }
  .chart-box { height: 220px; }
  .page-header__actions { flex-wrap: wrap; }
}
</style>
