<template>
  <div class="page">
    <!-- Overview Cards -->
    <div class="overview-grid" v-if="overview">
      <div class="ov-card" v-for="card in overviewCards" :key="card.label">
        <div class="ov-header">
          <span class="ov-label">{{ card.label }}</span>
          <span class="ov-change" :class="card.changeDir">{{ card.changeText }}</span>
        </div>
        <div class="ov-value">{{ card.value }}</div>
        <svg class="ov-spark" viewBox="0 0 80 24" preserveAspectRatio="none">
          <polyline :points="card.spark" fill="none" stroke="var(--c-primary)" stroke-width="1.5" />
        </svg>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <span class="toolbar-title">账户列表</span>
      <button class="icon-btn" @click="showPushModal = true" title="推送配置">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </button>
      <button class="icon-btn" @click="fetchData" title="刷新">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </button>
    </div>

    <!-- Table -->
    <a-spin :spinning="loading">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-info">账户信息</th>
              <th>消耗</th>
              <th>ROI</th>
              <th>订单</th>
              <th>GMV</th>
              <th>转化成本</th>
              <th>展示</th>
              <th>点击</th>
              <th>AI投手</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <!-- Account Rows -->
            <tr v-for="acc in accounts" :key="acc.advertiser_id" class="acc-row" @click="openDrawer(acc)">
              <td class="col-info">
                <div class="acc-name">{{ acc.advertiser_name }}</div>
                <div class="acc-id">ID: {{ acc.advertiser_id }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtMoney(acc.cost) }}</div>
                <div class="cell-cmp" :class="cmpDir(acc.cost, acc.yest_cost)">{{ cmpText(acc.cost, acc.yest_cost) }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtNum(acc.roi, 2) }}</div>
                <div class="cell-cmp" :class="cmpDir(acc.roi, acc.yest_roi)">{{ cmpText(acc.roi, acc.yest_roi) }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtNum(acc.orders) }}</div>
                <div class="cell-cmp" :class="cmpDir(acc.orders, acc.yest_orders)">{{ cmpText(acc.orders, acc.yest_orders) }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtMoney(acc.gmv) }}</div>
                <div class="cell-cmp" :class="cmpDir(acc.gmv, acc.yest_gmv)">{{ cmpText(acc.gmv, acc.yest_gmv) }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtMoney(acc.convert_cost) }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtNum(acc.show_cnt) }}</div>
                <div class="cell-cmp" :class="cmpDir(acc.show_cnt, acc.yest_show_cnt)">{{ cmpText(acc.show_cnt, acc.yest_show_cnt) }}</div>
              </td>
              <td>
                <div class="cell-val">{{ fmtNum(acc.click_cnt) }}</div>
                <div class="cell-cmp" :class="cmpDir(acc.click_cnt, acc.yest_click_cnt)">{{ cmpText(acc.click_cnt, acc.yest_click_cnt) }}</div>
              </td>
              <td>
                <div class="pitcher-tags">
                  <span v-for="tag in getPitcherTags(acc.advertiser_id)" :key="tag" class="p-tag" :class="{ 'p-tag-off': tag === '未启用' }">{{ tag }}</span>
                </div>
              </td>
              <td>
                <span class="status-badge" :class="{ active: acc.status === 1 }">
                  <i class="status-dot"></i>{{ acc.status === 1 ? '投放中' : '已暂停' }}
                </span>
              </td>
            </tr>
            <!-- Summary Row (底部) -->
            <tr class="summary-row" v-if="summary">
              <td class="col-info"><strong>汇总 ({{ accounts.length }}个账户)</strong></td>
              <td><div class="cell-val">{{ fmtMoney(summary.cost) }}</div></td>
              <td><div class="cell-val">{{ fmtNum(summary.roi, 2) }}</div></td>
              <td><div class="cell-val">{{ fmtNum(summary.orders) }}</div></td>
              <td><div class="cell-val">{{ fmtMoney(summary.gmv) }}</div></td>
              <td><div class="cell-val">{{ summary.orders > 0 ? fmtMoney(summary.cost / summary.orders) : '-' }}</div></td>
              <td><div class="cell-val">{{ fmtNum(summary.show_cnt) }}</div></td>
              <td><div class="cell-val">{{ fmtNum(summary.click_cnt) }}</div></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && accounts.length === 0" class="empty">暂无数据</div>
      </div>

      <!-- 移动端卡片列表 -->
      <div class="mobile-cards">
        <div class="m-card" v-for="acc in accounts" :key="'m'+acc.advertiser_id" @click="openDrawer(acc)">
          <div class="m-card-head">
            <div>
              <div class="m-card-name">{{ acc.advertiser_name }}</div>
              <div class="m-card-id">ID: {{ acc.advertiser_id }}</div>
            </div>
            <div class="m-card-right">
              <div class="pitcher-tags">
                <span v-for="tag in getPitcherTags(acc.advertiser_id)" :key="tag" class="p-tag" :class="{ 'p-tag-off': tag === '未启用' }">{{ tag }}</span>
              </div>
              <span class="status-badge" :class="{ active: acc.status === 1 }">
                <i class="status-dot"></i>{{ acc.status === 1 ? '投放中' : '已暂停' }}
              </span>
            </div>
          </div>
          <div class="m-card-grid">
            <div class="m-metric">
              <div class="m-metric-label">消耗</div>
              <div class="m-metric-val">{{ fmtMoney(acc.cost) }}</div>
              <div class="cell-cmp" :class="cmpDir(acc.cost, acc.yest_cost)">{{ cmpText(acc.cost, acc.yest_cost) }}</div>
            </div>
            <div class="m-metric">
              <div class="m-metric-label">ROI</div>
              <div class="m-metric-val">{{ fmtNum(acc.roi, 2) }}</div>
              <div class="cell-cmp" :class="cmpDir(acc.roi, acc.yest_roi)">{{ cmpText(acc.roi, acc.yest_roi) }}</div>
            </div>
            <div class="m-metric">
              <div class="m-metric-label">订单</div>
              <div class="m-metric-val">{{ fmtNum(acc.orders) }}</div>
              <div class="cell-cmp" :class="cmpDir(acc.orders, acc.yest_orders)">{{ cmpText(acc.orders, acc.yest_orders) }}</div>
            </div>
            <div class="m-metric">
              <div class="m-metric-label">GMV</div>
              <div class="m-metric-val">{{ fmtMoney(acc.gmv) }}</div>
              <div class="cell-cmp" :class="cmpDir(acc.gmv, acc.yest_gmv)">{{ cmpText(acc.gmv, acc.yest_gmv) }}</div>
            </div>
            <div class="m-metric">
              <div class="m-metric-label">转化成本</div>
              <div class="m-metric-val">{{ fmtMoney(acc.convert_cost) }}</div>
            </div>
            <div class="m-metric">
              <div class="m-metric-label">展示/点击</div>
              <div class="m-metric-val">{{ fmtNum(acc.show_cnt) }} / {{ fmtNum(acc.click_cnt) }}</div>
            </div>
          </div>
        </div>
        <!-- 移动端汇总 -->
        <div class="m-card m-card-summary" v-if="summary">
          <div class="m-card-head"><strong>汇总 ({{ accounts.length }}个账户)</strong></div>
          <div class="m-card-grid">
            <div class="m-metric"><div class="m-metric-label">消耗</div><div class="m-metric-val">{{ fmtMoney(summary.cost) }}</div></div>
            <div class="m-metric"><div class="m-metric-label">ROI</div><div class="m-metric-val">{{ fmtNum(summary.roi, 2) }}</div></div>
            <div class="m-metric"><div class="m-metric-label">订单</div><div class="m-metric-val">{{ fmtNum(summary.orders) }}</div></div>
            <div class="m-metric"><div class="m-metric-label">GMV</div><div class="m-metric-val">{{ fmtMoney(summary.gmv) }}</div></div>
          </div>
        </div>
        <div v-if="!loading && accounts.length === 0" class="empty">暂无数据</div>
      </div>
    </a-spin>

    <!-- Drawer -->
    <teleport to="body">
      <div class="drawer-mask" :class="{ open: drawerVisible }" @click="closeDrawer"></div>
      <div class="drawer" :class="{ open: drawerVisible }">
        <div class="drawer-header">
          <div>
            <div class="drawer-title">{{ currentAcc?.advertiser_name }}</div>
            <div class="drawer-sub">ID: {{ currentAcc?.advertiser_id }}</div>
          </div>
          <button class="icon-btn" @click="closeDrawer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Drawer Tabs -->
        <div class="drawer-tabs">
          <button class="dtab" :class="{ active: drawerTab === 'data' }" @click="drawerTab = 'data'">数据详情</button>
          <button class="dtab" :class="{ active: drawerTab === 'pitcher' }" @click="drawerTab = 'pitcher'">AI金牌投手</button>
        </div>

        <div class="drawer-body">
          <!-- Tab 1: Data Detail -->
          <div v-if="drawerTab === 'data'" class="tab-data">
            <!-- Hero Cards -->
            <div class="hero-row">
              <div class="hero-card hero-blue">
                <div class="hero-label">今日消耗</div>
                <div class="hero-val">{{ fmtMoney(currentAcc?.cost) }}</div>
              </div>
              <div class="hero-card hero-green">
                <div class="hero-label">今日GMV</div>
                <div class="hero-val">{{ fmtMoney(currentAcc?.gmv) }}</div>
              </div>
            </div>

            <!-- Trend Chart -->
            <div class="section-block">
              <div class="trend-tabs">
                <button v-for="t in trendTabList" :key="t.key" class="ttab" :class="{ active: trendTab === t.key }" @click="trendTab = t.key">{{ t.label }}</button>
              </div>
              <div ref="chartRef" class="chart-box"></div>
            </div>

            <!-- Data Grid -->
            <div class="detail-grid">
              <div class="dg-item" v-for="item in detailGridItems" :key="item.label">
                <div class="dg-label">{{ item.label }}</div>
                <div class="dg-val">{{ item.value }}</div>
              </div>
            </div>

            <!-- AI Analysis -->
            <div class="section-block">
              <button class="ai-btn" @click="generateAnalysis" :disabled="analyzing">
                {{ analyzing ? '分析中...' : '生成优化建议' }}
              </button>
              <div v-if="analysisResult" class="ai-result" v-html="analysisResult"></div>
            </div>
          </div>

          <!-- Tab 2: AI Pitcher (完整功能嵌入) -->
          <div v-if="drawerTab === 'pitcher'" class="tab-pitcher">
            <AiPitcherPanel :embedded="true" :embeddedAccount="currentAcc" />
          </div>
        </div>
      </div>
    </teleport>

    <!-- Push Config Modal -->
    <teleport to="body">
      <div class="modal-mask" :class="{ open: showPushModal }" @click="showPushModal = false"></div>
      <div class="modal" :class="{ open: showPushModal }">
        <div class="modal-header">
          <span>推送配置</span>
          <button class="icon-btn" @click="showPushModal = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <label class="field-label">Webhook URL</label>
          <input v-model="pushConfig.webhook_url" class="field-input" placeholder="https://..." />
          <div class="push-switches">
            <label class="sw-row" v-for="sw in pushSwitches" :key="sw.key">
              <input type="checkbox" v-model="pushConfig[sw.key]" />
              <span>{{ sw.label }}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showPushModal = false">取消</button>
          <button class="btn-primary" @click="savePushConfig">保存</button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'
import AiPitcherPanel from './AiPitcher.vue'

/* ============ State ============ */
const loading = ref(false)
const accounts = ref([])
const summary = ref(null)
const overview = ref(null)
const pitcherStatusMap = ref({})

const drawerVisible = ref(false)
const drawerTab = ref('data')
const currentAcc = ref(null)
const trendTab = ref('cost_gmv')
const trendData = ref(null)
const chartRef = ref(null)
let chartInstance = null

const analyzing = ref(false)
const analysisResult = ref('')

const showPushModal = ref(false)
const pushConfig = ref({
  webhook_url: '',
  notify_cost: true,
  notify_roi: true,
  notify_orders: true,
  notify_status: true,
})

/* ============ Constants ============ */
const trendTabList = [
  { key: 'cost_gmv', label: '消耗/GMV' },
  { key: 'roi', label: 'ROI' },
  { key: 'orders', label: '订单' },
  { key: 'traffic', label: '流量' },
]

const pushSwitches = [
  { key: 'notify_cost', label: '消耗异常通知' },
  { key: 'notify_roi', label: 'ROI波动通知' },
  { key: 'notify_orders', label: '订单变化通知' },
  { key: 'notify_status', label: '状态变更通知' },
]

/* ============ Formatting ============ */
function fmtNum(val, decimals = 0) {
  if (val == null || isNaN(val)) return '-'
  const n = Number(val)
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万'
  return decimals > 0 ? n.toFixed(decimals) : n.toLocaleString()
}

function fmtMoney(val) {
  if (val == null || isNaN(val)) return '¥0'
  const n = Number(val)
  if (Math.abs(n) >= 10000) return '¥' + (n / 10000).toFixed(2) + '万'
  return '¥' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ============ Comparison ============ */
function cmpText(today, yesterday) {
  const t = Number(today) || 0
  const y = Number(yesterday) || 0
  if (t === 0 && y === 0) return '持平'
  if (y === 0 && t > 0) return '↑新增'
  if (t === 0 && y > 0) return '↓100%'
  const pct = ((t - y) / Math.abs(y) * 100).toFixed(1)
  return Number(pct) >= 0 ? `↑${pct}%` : `↓${Math.abs(Number(pct))}%`
}

function cmpDir(today, yesterday) {
  const t = Number(today) || 0
  const y = Number(yesterday) || 0
  if (t === 0 && y === 0) return 'flat'
  if (t >= y) return 'up'
  return 'down'
}

/* ============ Overview Cards ============ */
const overviewCards = computed(() => {
  if (!overview.value || !overview.value.cards) return []
  return overview.value.cards.map(c => ({
    label: c.label,
    value: (c.prefix || '') + (typeof c.value === 'number' ? (Math.abs(c.value) >= 10000 ? (c.value/10000).toFixed(2)+'万' : c.value.toFixed(2)) : c.value) + (c.suffix || ''),
    changeText: (c.change >= 0 ? '+' : '') + c.change.toFixed(1) + '%',
    changeDir: c.change >= 0 ? 'up' : 'down',
    spark: buildSparkPoints(c.trend),
  }))
})

function buildSparkPoints(arr) {
  if (!arr || arr.length === 0) return '0,12 80,12'
  const max = Math.max(...arr, 1)
  return arr.map((v, i) => {
    const x = (i / Math.max(arr.length - 1, 1)) * 80
    const y = 22 - (v / max) * 20
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

/* ============ Pitcher Tags ============ */
function getPitcherTags(advertiserId) {
  const s = pitcherStatusMap.value[advertiserId]
  if (!s) return ['未启用']
  const tags = []
  if (s.enabled) tags.push('计划')
  if (s.material_auto_clean_enabled) tags.push('清理')
  if (s.boost_enabled) tags.push('调速')
  if (s.mat_boost_enabled) tags.push('追投')
  return tags.length > 0 ? tags : ['未启用']
}

/* ============ Pitcher Status for Drawer ============ */
/* ============ Detail Grid ============ */
const detailGridItems = computed(() => {
  const a = currentAcc.value
  if (!a) return []
  const cost = Number(a.cost) || 0
  const gmv = Number(a.gmv) || 0
  const orders = Number(a.orders) || 0
  const show = Number(a.show_cnt) || 0
  const click = Number(a.click_cnt) || 0
  const roi = cost > 0 ? (gmv / cost).toFixed(2) : '-'
  const avgPrice = orders > 0 ? (gmv / orders).toFixed(2) : '-'
  const costPer1k = orders > 0 ? ((orders / cost) * 1000).toFixed(1) : '-'
  const ctr = show > 0 ? ((click / show) * 100).toFixed(2) + '%' : '-'
  const cvr = click > 0 ? ((orders / click) * 100).toFixed(2) + '%' : '-'
  return [
    { label: 'ROI', value: roi },
    { label: '订单', value: fmtNum(orders) },
    { label: '客单价', value: avgPrice !== '-' ? '¥' + avgPrice : '-' },
    { label: '千元出单', value: costPer1k !== '-' ? costPer1k + '单' : '-' },
    { label: '展示', value: fmtNum(show) },
    { label: '点击', value: fmtNum(click) },
    { label: 'CTR', value: ctr },
    { label: '转化率', value: cvr },
  ]
})

/* ============ Data Fetching ============ */
async function fetchData() {
  loading.value = true
  try {
    const accRes = await request.get('/campaigns/accounts-list')
    accounts.value = accRes.data?.list || []
    summary.value = accRes.data?.summary || null
    accounts.value.forEach(a => {
      const c = Number(a.cost) || 0
      const g = Number(a.gmv) || 0
      a.roi = c > 0 ? g / c : 0
      const yc = Number(a.yest_cost) || 0
      const yg = Number(a.yest_gmv) || 0
      a.yest_roi = yc > 0 ? yg / yc : 0
    })
    if (summary.value) {
      const sc = Number(summary.value.cost) || 0
      const sg = Number(summary.value.gmv) || 0
      summary.value.roi = sc > 0 ? sg / sc : 0
      summary.value.yest_roi = Number(summary.value.yest_cost) > 0 ? Number(summary.value.yest_gmv) / Number(summary.value.yest_cost) : 0
    }
  } catch { /* silent */ }
  finally { loading.value = false }
  // 非关键数据单独加载，不阻塞主表
  try {
    const ovRes = await request.get('/campaigns/overview')
    overview.value = ovRes.data || null
  } catch { /* silent */ }
  try {
    const pitcherRes = await request.get('/ai-pitcher/status')
    const map = {}
    const pitcherList = pitcherRes.data || []
    if (Array.isArray(pitcherList)) {
      pitcherList.forEach(item => { map[item.advertiser_id] = item })
    }
    pitcherStatusMap.value = map
  } catch { /* silent */ }
}

async function fetchTrend(advertiserId) {
  try {
    const res = await request.get(`/accounts/${advertiserId}/trend`)
    trendData.value = res.data
    await nextTick()
    renderChart()
  } catch {
    message.error('加载趋势数据失败')
  }
}

/* ============ Chart ============ */
function renderChart() {
  if (!chartRef.value || !trendData.value) return
  if (chartInstance) chartInstance.dispose()
  chartInstance = echarts.init(chartRef.value)
  const d = trendData.value
  const dates = d.dates || []

  const baseGrid = { left: 48, right: 16, top: 32, bottom: 28 }
  const baseXAxis = { type: 'category', data: dates, axisLabel: { fontSize: 11 }, boundaryGap: false }
  const baseTooltip = { trigger: 'axis', textStyle: { fontSize: 12 } }
  let option = {}

  if (trendTab.value === 'cost_gmv') {
    option = {
      tooltip: baseTooltip,
      grid: baseGrid,
      legend: { data: ['消耗', 'GMV'], top: 4, textStyle: { fontSize: 11 } },
      xAxis: baseXAxis,
      yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
      series: [
        { name: '消耗', type: 'line', data: d.cost, smooth: true, symbol: 'none', lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
        { name: 'GMV', type: 'line', data: d.gmv, smooth: true, symbol: 'none', lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
      ],
    }
  } else if (trendTab.value === 'roi') {
    option = {
      tooltip: baseTooltip,
      grid: baseGrid,
      xAxis: baseXAxis,
      yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
      series: [
        { name: 'ROI', type: 'line', data: d.roi, smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#10b981' }, areaStyle: { opacity: 0.08, color: '#10b981' } },
      ],
    }
  } else if (trendTab.value === 'orders') {
    option = {
      tooltip: baseTooltip,
      grid: baseGrid,
      xAxis: { ...baseXAxis, boundaryGap: true },
      yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
      series: [
        { name: '订单', type: 'bar', data: d.orders, barMaxWidth: 20, itemStyle: { borderRadius: [3, 3, 0, 0], color: '#6366f1' } },
      ],
    }
  } else {
    option = {
      tooltip: baseTooltip,
      grid: baseGrid,
      legend: { data: ['展示', '点击'], top: 4, textStyle: { fontSize: 11 } },
      xAxis: baseXAxis,
      yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
      series: [
        { name: '展示', type: 'line', data: d.show, smooth: true, symbol: 'none', lineStyle: { width: 2 } },
        { name: '点击', type: 'line', data: d.click, smooth: true, symbol: 'none', lineStyle: { width: 2 } },
      ],
    }
  }

  chartInstance.setOption(option)
}

watch(trendTab, () => renderChart())

/* ============ Drawer ============ */
function openDrawer(acc) {
  currentAcc.value = acc
  drawerTab.value = 'data'
  trendTab.value = 'cost_gmv'
  analysisResult.value = ''
  drawerVisible.value = true
  fetchTrend(acc.advertiser_id)
}

function closeDrawer() {
  drawerVisible.value = false
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
}

/* ============ AI Analysis ============ */
async function generateAnalysis() {
  if (!currentAcc.value) return
  analyzing.value = true
  analysisResult.value = ''
  try {
    const a = currentAcc.value
    const res = await request.post('/accounts/analyze', {
      advertiser_id: a.advertiser_id,
      today_cost: a.cost,
      today_gmv: a.gmv,
      today_orders: a.orders,
      today_show: a.show_cnt,
      today_click: a.click_cnt,
      trend: trendData.value,
    })
    analysisResult.value = res.data?.analysis || '暂无建议'
  } catch {
    message.error('AI分析失败')
  } finally {
    analyzing.value = false
  }
}

/* ============ Push Config ============ */
async function savePushConfig() {
  try {
    await request.post('/campaigns/push-config', pushConfig.value)
    message.success('推送配置已保存')
    showPushModal.value = false
  } catch {
    message.error('保存失败')
  }
}

async function loadPushConfig() {
  try {
    const res = await request.get('/campaigns/push-config')
    if (res) Object.assign(pushConfig.value, res)
  } catch { /* silent */ }
}

/* ============ Init ============ */
onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.page {
  padding: 16px;
  min-height: 100vh;
  background: #FFFFFF;
}
/* ---- Overview Grid ---- */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.ov-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  position: relative;
  overflow: hidden;
}
.ov-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.ov-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.ov-change {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
}
.ov-change.up { color: var(--c-danger); background: rgba(239,68,68,0.08); }
.ov-change.down { color: var(--c-success); background: rgba(16,185,129,0.08); }
.ov-change.flat { color: var(--text-hint); }
.ov-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.ov-spark {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 80px;
  height: 24px;
  opacity: 0.4;
}

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.2s;
}
.icon-btn:hover {
  background: var(--c-primary-bg);
  color: var(--c-primary);
}

/* ---- Table ---- */
.table-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th {
  text-align: left;
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-hint);
  border-bottom: 1px solid var(--divider);
  white-space: nowrap;
}
.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--divider);
  white-space: nowrap;
}
.summary-row td {
  background: var(--c-primary-bg);
  font-weight: 600;
}
.acc-row {
  cursor: pointer;
  transition: background 0.15s;
}
.acc-row:hover {
  background: var(--c-primary-bg);
}
.col-info {
  min-width: 140px;
}
.acc-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 13px;
}
.acc-id {
  font-size: 11px;
  color: var(--text-hint);
  margin-top: 2px;
}
.cell-val {
  font-weight: 500;
  color: var(--text-primary);
}
.cell-cmp {
  font-size: 11px;
  margin-top: 2px;
}
.cell-cmp.up { color: var(--c-danger); }
.cell-cmp.down { color: var(--c-success); }
.cell-cmp.flat { color: var(--text-hint); }

/* Pitcher Tags */
.pitcher-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.p-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--c-primary-bg);
  color: var(--c-primary);
  font-weight: 500;
}
.p-tag-off {
  background: var(--divider);
  color: var(--text-hint);
}

/* Status Badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-hint);
}
.status-badge.active {
  color: var(--c-success);
}
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-hint);
}
.status-badge.active .status-dot {
  background: var(--c-success);
}

.empty {
  text-align: center;
  padding: 40px;
  color: var(--text-hint);
  font-size: 13px;
}

/* ---- Drawer ---- */
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.drawer-mask.open {
  opacity: 1;
  pointer-events: auto;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 520px;
  height: 100vh;
  background: var(--bg-page);
  z-index: 1001;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
}
.drawer.open {
  transform: translateX(0);
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--divider);
}
.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.drawer-sub {
  font-size: 11px;
  color: var(--text-hint);
  margin-top: 2px;
}
.drawer-tabs {
  display: flex;
  border-bottom: 1px solid var(--divider);
  padding: 0 20px;
}
.dtab {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.dtab.active {
  color: var(--c-primary);
  border-bottom-color: var(--c-primary);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  padding-bottom: calc(16px + var(--safe-b, 0px));
}

/* Hero Cards */
.hero-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.hero-card {
  border-radius: 10px;
  padding: 16px;
  color: #fff;
}
.hero-blue {
  background: linear-gradient(135deg, #6366f1, #818cf8);
}
.hero-green {
  background: linear-gradient(135deg, #10b981, #34d399);
}
.hero-label {
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 6px;
}
.hero-val {
  font-size: 22px;
  font-weight: 700;
}

/* Trend */
.section-block {
  margin-bottom: 16px;
}
.trend-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}
.ttab {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.ttab.active {
  background: var(--c-primary);
  color: #fff;
  border-color: var(--c-primary);
}
.chart-box {
  width: 100%;
  height: 220px;
}

/* Detail Grid */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--divider);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
}
.dg-item {
  background: var(--bg-card);
  padding: 12px 14px;
}
.dg-label {
  font-size: 11px;
  color: var(--text-hint);
  margin-bottom: 4px;
}
.dg-val {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

/* AI Analysis */
.ai-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--c-primary);
  background: var(--c-primary-bg);
  color: var(--c-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.ai-btn:hover {
  background: var(--c-primary);
  color: #fff;
}
.ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-result {
  margin-top: 12px;
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

/* Tab 2: Pitcher */
.tab-pitcher {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pitcher-status-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}
.ps-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ps-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.ps-val {
  font-size: 14px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 10px;
}
.ps-val.on {
  color: var(--c-success);
  background: rgba(16, 185, 129, 0.1);
}
.ps-val.off {
  color: var(--text-hint);
  background: var(--divider);
}
.pitcher-info-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pi-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}
.pi-label {
  font-size: 11px;
  color: var(--text-hint);
  margin-bottom: 4px;
}
.pi-val {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}
.feature-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.feat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--divider);
}
.feat-item:last-child {
  border-bottom: none;
}
.feat-label {
  font-size: 13px;
  color: var(--text-primary);
}
.feat-sw {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}
.feat-sw.on {
  color: var(--c-success);
  background: rgba(16, 185, 129, 0.1);
}
.feat-sw.off {
  color: var(--text-hint);
  background: var(--divider);
}
.open-pitcher-btn {
  display: block;
  text-align: center;
  padding: 12px;
  border-radius: 10px;
  background: var(--c-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.2s;
}
.open-pitcher-btn:hover {
  opacity: 0.9;
}

/* ---- Modal ---- */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.modal-mask.open {
  opacity: 1;
  pointer-events: auto;
}
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.95);
  width: 420px;
  max-width: 90vw;
  background: var(--bg-card);
  border-radius: 12px;
  z-index: 2001;
  opacity: 0;
  pointer-events: none;
  transition: all 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.modal.open {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--divider);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.modal-body {
  padding: 16px 20px;
}
.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-page);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.field-input:focus {
  border-color: var(--c-primary);
}
.push-switches {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--divider);
}
.btn-cancel {
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.btn-primary {
  padding: 7px 16px;
  border-radius: 8px;
  border: none;
  background: var(--c-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary:hover {
  opacity: 0.9;
}

/* ---- Mobile Cards (默认隐藏) ---- */
.mobile-cards { display: none; }

/* ---- Mobile ---- */
@media (max-width: 768px) {
  .page { padding: 10px 0; }
  .toolbar { padding: 0 10px; }
  .overview-grid { grid-template-columns: repeat(2, 1fr); padding: 0 10px; }
  .table-wrap { display: none; }
  .mobile-cards { display: block; padding: 0 10px; }

  .m-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: box-shadow 0.15s;
  }
  .m-card:active { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .m-card-summary {
    background: var(--c-primary-bg);
    border-color: var(--c-primary);
    cursor: default;
  }
  .m-card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .m-card-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-card-id {
    font-size: 11px;
    color: var(--text-hint);
    margin-top: 2px;
  }
  .m-card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .m-card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .m-metric {
    background: var(--bg-page);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .m-metric-label {
    font-size: 10px;
    color: var(--text-hint);
    margin-bottom: 3px;
  }
  .m-metric-val {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .m-metric .cell-cmp {
    font-size: 10px;
    margin-top: 1px;
  }

  .drawer {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 88vh;
    border-radius: 16px 16px 0 0;
    transform: translateY(100%);
  }
  .drawer.open { transform: translateY(0); }
  .drawer-header { padding: 12px 16px; }
  .drawer-body { padding: 12px 16px; }
}
</style>
