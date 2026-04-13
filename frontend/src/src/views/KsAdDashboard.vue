<template>
  <div class="page">
    <!-- 数据概览 -->
    <div v-if="overviewCards.length" class="overview-bar">
      <div class="ov-item" v-for="card in overviewCards" :key="card.key">
        <div class="ov-item__label">{{ card.label }}</div>
        <div class="ov-item__value">{{ formatOverviewValue(card) }}</div>
      </div>
    </div>

    <!-- 账户列表 -->
    <div class="acc-section">
      <div class="acc-table-header">
        <span class="col-info">
          账户信息
          <button class="sync-btn" @click="syncData" :disabled="syncing" style="margin-left:12px">
            <svg :class="{ spinning: syncing }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {{ syncing ? '同步中' : '同步' }}
          </button>
        </span>
        <span class="col-val">花费</span>
        <span class="col-val">直接ROI</span>
        <span class="col-val">行为数</span>
        <span class="col-val">GMV</span>
        <span class="col-val">素材点击率</span>
        <span class="col-val">曝光数</span>
        <span class="col-val col-hide-m">余额</span>
        <span class="col-status">状态</span>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="empty-state">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>

      <!-- 账户行 -->
      <template v-else-if="sortedList.length">
        <div
          v-for="item in sortedList"
          :key="item.advertiser_id"
          class="acc-table-row"
          @click="openDetail(item)"
        >
          <div class="col-info">
            <div class="acc-avatar" :style="{ background: avatarColor(item.advertiser_id) }">
              {{ (item.advertiser_name || '账').charAt(0) }}
            </div>
            <div class="acc-text">
              <div class="acc-name" :title="item.advertiser_name">
                {{ item.advertiser_name || '未命名' }}
                <span class="edit-name-btn" @click.stop="openRename(item)" title="修改名称">✎</span>
              </div>
              <div class="acc-sub">ID: {{ item.advertiser_id }}</div>
            </div>
          </div>
          <span class="col-val blue">¥{{ formatMoney(item.today_cost) }}</span>
          <span :class="['col-val', roiColor(item.today_roi)]">{{ formatDecimal(item.today_roi) }}</span>
          <span class="col-val green">{{ formatCount(item.today_click) }}</span>
          <span class="col-val purple">¥{{ formatMoney(item.today_gmv) }}</span>
          <span class="col-val">{{ formatDecimal(item.today_photo_click_rate) }}%</span>
          <span class="col-val">{{ formatCount(item.today_show) }}</span>
          <span class="col-val col-hide-m orange">{{ item.balance > 0 ? '¥' + formatMoney(item.balance) : '--' }}</span>
          <div class="col-status">
            <span class="badge on"><i class="dot"></i>投放中</span>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else class="empty-state">暂无账户数据，请先在设置中授权快手磁力账户</div>
    </div>

    <!-- 重命名弹窗 -->
    <div v-if="renameVisible" class="drawer-mask" @click.self="renameVisible = false">
      <div class="rename-modal">
        <div class="rename-title">修改账户名称</div>
        <div class="rename-id">ID: {{ renameTarget?.advertiser_id }}</div>
        <input v-model="renameName" class="rename-input" placeholder="请输入账户名称" @keyup.enter="submitRename" />
        <div class="rename-actions">
          <button class="rename-cancel" @click="renameVisible = false">取消</button>
          <button class="rename-ok" @click="submitRename" :disabled="!renameName.trim()">确定</button>
        </div>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <div v-if="drawerVisible" class="drawer-mask" @click.self="drawerVisible = false">
      <div class="drawer">
        <div class="drawer-head">
          <div class="dh-left">
            <div class="dh-avatar" :style="{ background: avatarColor(currentItem.advertiser_id) }">
              {{ (currentItem.advertiser_name || '账').charAt(0) }}
            </div>
            <div>
              <div class="dh-name">{{ currentItem.advertiser_name }}</div>
              <div class="dh-id">ID: {{ currentItem.advertiser_id }}</div>
            </div>
          </div>
          <span class="dh-close" @click="drawerVisible = false">×</span>
        </div>

        <div v-if="currentItem" class="drawer-body">
          <!-- 核心指标 -->
          <div class="hero-row">
            <div class="hero-card c1">
              <div class="hero-label">今日消耗</div>
              <div class="hero-val">¥{{ formatMoney(currentItem.today_cost) }}</div>
            </div>
            <div class="hero-card c2">
              <div class="hero-label">今日GMV</div>
              <div class="hero-val">¥{{ formatMoney(currentItem.today_gmv) }}</div>
            </div>
          </div>

          <!-- 趋势图 -->
          <div class="trend-section">
            <div class="trend-tabs">
              <span
                v-for="tab in trendTabs"
                :key="tab.key"
                :class="['trend-tab', { active: activeTab === tab.key }]"
                @click="activeTab = tab.key; renderChart()"
              >{{ tab.label }}</span>
            </div>
            <div ref="chartRef" class="trend-chart"></div>
          </div>

          <!-- 详细数据 -->
          <div class="sec-label">详细数据</div>
          <div class="data-grid">
            <div class="dg-item">
              <span class="dg-l">直接ROI</span>
              <span :class="['dg-v', roiColor(currentItem.today_roi)]">{{ formatDecimal(currentItem.today_roi) }}</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">行为数</span>
              <span class="dg-v">{{ formatCount(currentItem.today_click) }}</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">素材点击率</span>
              <span class="dg-v">{{ formatDecimal(currentItem.today_photo_click_rate) }}%</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">转化</span>
              <span class="dg-v">{{ currentItem.today_orders || 0 }}</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">曝光数</span>
              <span class="dg-v">{{ formatCount(currentItem.today_show) }}</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">余额</span>
              <span class="dg-v orange">{{ currentItem.balance > 0 ? '¥' + formatMoney(currentItem.balance) : '需开通权限' }}</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">转化率</span>
              <span class="dg-v">{{ currentItem.today_click > 0 ? formatDecimal(currentItem.today_orders / currentItem.today_click * 100) : '0.00' }}%</span>
            </div>
            <div class="dg-item">
              <span class="dg-l">千元出单</span>
              <span class="dg-v">{{ currentItem.today_cost > 0 ? formatDecimal(currentItem.today_orders / currentItem.today_cost * 1000) : '0.00' }}</span>
            </div>
          </div>

          <!-- AI 优化建议 -->
          <div class="sec-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="2" style="vertical-align: -2px; margin-right: 4px">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
              <line x1="9" y1="21" x2="15" y2="21" />
            </svg>
            AI 优化建议
          </div>
          <div class="ai-card">
            <div v-if="aiLoading" class="ai-loading">
              <div class="loading-dots"><span></span><span></span><span></span></div>
              <div style="margin-top: 8px; font-size: 13px; color: #86909C">AI 正在分析账户数据...</div>
            </div>
            <div v-else-if="aiResult" class="ai-content" v-html="renderMarkdown(aiResult)"></div>
            <div v-else class="ai-empty">
              <button class="ai-btn" @click="analyzeAccount">生成优化建议</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import request from '../utils/request'

// 状态
const accountList = ref([])
const loading = ref(false)
const syncing = ref(false)
const drawerVisible = ref(false)
const currentItem = ref(null)
const overviewCards = ref([])
const trendData = ref(null)
const activeTab = ref('cost_gmv')
const chartRef = ref(null)
const aiLoading = ref(false)
const aiResult = ref('')
const renameVisible = ref(false)
const renameTarget = ref(null)
const renameName = ref('')

let chartInstance = null

const trendTabs = [
  { key: 'cost_gmv', label: '消耗/GMV' },
  { key: 'roi', label: 'ROI' },
  { key: 'orders', label: '转化' },
  { key: 'traffic', label: '流量' }
]

// 排序：按今日消耗降序
const sortedList = computed(() =>
  [...accountList.value].sort((a, b) => parseFloat(b.today_cost || 0) - parseFloat(a.today_cost || 0))
)

// 迷你折线图坐标
function sparkline(data) {
  if (!data || data.length < 2) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  return data.map((v, i) => `${(i / (data.length - 1)) * 80},${26 - ((v - min) / range) * 24}`).join(' ')
}

// 格式化概览数值（简洁数字，带千位分隔符）
function formatOverviewValue(card) {
  const val = card.value
  if (val === 0 || val === null || val === undefined) return '0'
  if (card.suffix === '%') return val.toFixed(2)
  if (typeof val === 'number' && val % 1 !== 0) return val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parseInt(val).toLocaleString()
}

// 格式化概览卡片数值
function formatCardValue(card) {
  const val = card.value
  if (card.suffix === '%') return val.toFixed(2)
  if (val >= 10000) return (val / 10000).toFixed(2) + '万'
  if (typeof val === 'number' && val % 1 !== 0) return val.toFixed(2)
  return val
}

// 金额格式化
const formatMoney = (v) => {
  const n = parseFloat(v || 0)
  if (n >= 10000) return (n / 10000).toFixed(2) + '万'
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 整数格式化
const formatCount = (v) => {
  const n = parseInt(v || 0)
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

// 小数格式化
const formatDecimal = (v) => parseFloat(v || 0).toFixed(2)

// ROI 颜色
const roiColor = (v) => {
  const n = parseFloat(v)
  if (n >= 2) return 'green'
  if (n >= 1.5) return 'orange'
  return 'red'
}

// 头像颜色
const avatarColor = (id) =>
  ['#1677FF', '#722ED1', '#F5222D', '#FA8C16', '#52C41A', '#13C2C2'][parseInt(id) % 6]

// Markdown 渲染
function renderMarkdown(text) {
  return text
    .replace(/### (.*)/g, '<h4 style="margin:12px 0 6px;font-size:14px;color:#1D2129">$1</h4>')
    .replace(/## (.*)/g, '<h3 style="margin:14px 0 8px;font-size:15px;color:#1D2129">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/- (.*)/g, '<div style="padding:3px 0 3px 12px;position:relative"><span style="position:absolute;left:0">·</span>$1</div>')
    .replace(/\n/g, '<br>')
}

// 渲染图表
function renderChart() {
  if (!chartRef.value || !trendData.value) return
  if (chartInstance) chartInstance.dispose()
  chartInstance = echarts.init(chartRef.value)

  const data = trendData.value
  const colors = ['#1677FF', '#00B96B', '#FF8A00', '#722ED1']
  let series = []
  let yAxisName = ''

  if (activeTab.value === 'cost_gmv') {
    yAxisName = '金额(元)'
    series = [
      {
        name: '消耗', data: data.cost, type: 'line', smooth: 0.4,
        symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.5 }, itemStyle: { color: colors[0] },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(22,119,255,0.15)' },
            { offset: 1, color: 'rgba(22,119,255,0)' }
          ])
        }
      },
      {
        name: 'GMV', data: data.gmv, type: 'line', smooth: 0.4,
        symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.5 }, itemStyle: { color: colors[1] },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0,185,107,0.15)' },
            { offset: 1, color: 'rgba(0,185,107,0)' }
          ])
        }
      }
    ]
  } else if (activeTab.value === 'roi') {
    yAxisName = 'ROI'
    series = [
      {
        name: 'ROI', data: data.roi, type: 'line', smooth: 0.4,
        symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.5 }, itemStyle: { color: colors[2] },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255,138,0,0.15)' },
            { offset: 1, color: 'rgba(255,138,0,0)' }
          ])
        },
        markLine: {
          data: [{ type: 'average', label: { formatter: '均值 {c}' } }],
          lineStyle: { type: 'dashed', color: '#FF8A00' }
        }
      }
    ]
  } else if (activeTab.value === 'orders') {
    yAxisName = '转化数'
    series = [
      {
        name: '转化', data: data.orders, type: 'bar', barWidth: 20,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#722ED1' },
            { offset: 1, color: '#B37FEB' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      }
    ]
  } else {
    yAxisName = '次数'
    series = [
      {
        name: '展示', data: data.show, type: 'line', smooth: 0.4,
        symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.5 }, itemStyle: { color: colors[0] }
      },
      {
        name: '点击', data: data.click, type: 'line', smooth: 0.4,
        symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.5 }, itemStyle: { color: colors[1] }
      }
    ]
  }

  chartInstance.setOption({
    grid: { left: 12, right: 12, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1D2129',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: {
      top: 4, right: 0,
      textStyle: { fontSize: 11, color: '#86909C' },
      itemWidth: 16, itemHeight: 2
    },
    xAxis: {
      type: 'category', data: data.dates,
      axisLine: { lineStyle: { color: '#E5E6EB' } },
      axisLabel: { fontSize: 11, color: '#86909C' },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', name: yAxisName,
      nameTextStyle: { fontSize: 11, color: '#C0C4CC', padding: [0, 0, 0, -20] },
      splitLine: { lineStyle: { color: '#F2F3F5' } },
      axisLabel: { fontSize: 11, color: '#86909C' }
    },
    series
  })
}

// 获取概览数据
async function fetchOverview() {
  loading.value = true
  try {
    const res = await request.get('/ks-ad-dash/overview')
    if (res.data) {
      overviewCards.value = res.data.cards || []
      accountList.value = res.data.list || []
    }
  } catch (e) {
    // ignore
  } finally {
    loading.value = false
  }
}

// 同步数据
async function syncData() {
  syncing.value = true
  try {
    await request.post('/ks-ad-dash/sync')
    await fetchOverview()
  } catch (e) {
    // ignore
  } finally {
    syncing.value = false
  }
}

// 打开详情
async function openDetail(item) {
  currentItem.value = { ...item }
  drawerVisible.value = true
  aiResult.value = ''
  trendData.value = null
  activeTab.value = 'cost_gmv'
  try {
    const res = await request.get(`/ks-ad-dash/trend?advertiser_id=${item.advertiser_id}`)
    trendData.value = res.data
    await nextTick()
    renderChart()
  } catch (e) {
    // ignore
  }
}

// AI 分析
async function analyzeAccount() {
  if (!currentItem.value) return
  aiLoading.value = true
  try {
    const res = await request.post('/ks-ad-dash/analyze', {
      advertiser_name: currentItem.value.advertiser_name,
      today_cost: currentItem.value.today_cost,
      today_gmv: currentItem.value.today_gmv,
      today_roi: currentItem.value.today_roi,
      today_orders: currentItem.value.today_orders,
      today_show: currentItem.value.today_show,
      today_click: currentItem.value.today_click,
      today_photo_click_rate: currentItem.value.today_photo_click_rate,
      trend: trendData.value
    })
    aiResult.value = res.data?.analysis || '暂无建议'
  } catch (e) {
    aiResult.value = '分析请求失败，请稍后重试'
  } finally {
    aiLoading.value = false
  }
}

// 重命名
function openRename(item) {
  renameTarget.value = item
  renameName.value = item.advertiser_name || ''
  renameVisible.value = true
}

async function submitRename() {
  if (!renameName.value.trim() || !renameTarget.value) return
  try {
    await request.post('/ks-ad/rename', {
      advertiser_id: renameTarget.value.advertiser_id,
      name: renameName.value.trim()
    })
    const found = accountList.value.find(a => a.advertiser_id === renameTarget.value.advertiser_id)
    if (found) found.advertiser_name = renameName.value.trim()
    renameVisible.value = false
  } catch (e) {
    // ignore
  }
}

// 抽屉关闭时销毁图表
watch(drawerVisible, (val) => {
  if (!val && chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})

onMounted(() => {
  fetchOverview()
})
</script>

<style scoped>
.page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* 概览横条 */
.overview-bar {
  display: flex;
  align-items: stretch;
  background: #fff;
  border: 1px solid #F2F3F5;
  border-radius: 10px;
  padding: 20px 0;
  margin-bottom: 20px;
}
.ov-item {
  flex: 1;
  text-align: left;
  padding: 0 24px;
  border-right: 1px solid #F2F3F5;
}
.ov-item:last-child {
  border-right: none;
}
.ov-item__label {
  font-size: 13px;
  color: #86909C;
  margin-bottom: 8px;
  border-bottom: 1px dashed #E5E6EB;
  display: inline-block;
  padding-bottom: 2px;
}
.ov-item__value {
  font-size: 22px;
  font-weight: 700;
  color: #1D2129;
}
.overview-title {
  font-size: 16px;
  font-weight: 600;
  color: #1D2129;
  margin: 0;
}
.sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #E5E6EB;
  border-radius: 6px;
  background: #fff;
  color: #4E5969;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.sync-btn:hover {
  color: #1677FF;
  border-color: #1677FF;
}
.sync-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* old ov-card styles removed */

/* 账户列表 */
.acc-section {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #F2F3F5;
  overflow: hidden;
}
.acc-table-header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: #FAFAFA;
  border-bottom: 1px solid #F2F3F5;
  font-size: 12px;
  color: #86909C;
  font-weight: 500;
}
.col-info {
  flex: 2;
  min-width: 180px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.col-val {
  flex: 1;
  text-align: right;
  font-size: 13px;
  min-width: 80px;
}
.col-status {
  width: 80px;
  text-align: center;
}
.acc-table-row {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #F7F8FA;
  cursor: pointer;
  transition: background 0.15s;
}
.acc-table-row:hover {
  background: #F7F8FA;
}
.acc-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
}
.acc-text {
  min-width: 0;
}
.acc-name {
  font-size: 14px;
  font-weight: 500;
  color: #1D2129;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.edit-name-btn {
  cursor: pointer;
  font-size: 13px;
  color: #C9CDD4;
  margin-left: 4px;
  transition: color 0.2s;
}
.edit-name-btn:hover {
  color: #1677FF;
}
.acc-sub {
  font-size: 12px;
  color: #C9CDD4;
  margin-top: 2px;
}
.blue { color: #1677FF; }
.green { color: #00B96B; }
.purple { color: #722ED1; }
.orange { color: #FA8C16; }
.red { color: #FF4D4F; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}
.badge.on {
  background: #F0FFF0;
  color: #00B96B;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00B96B;
  display: inline-block;
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #C9CDD4;
  font-size: 14px;
}

/* loading dots */
.loading-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.loading-dots span {
  width: 8px;
  height: 8px;
  background: #C9CDD4;
  border-radius: 50%;
  animation: dotBounce 1.4s infinite ease-in-out both;
}
.loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.loading-dots span:nth-child(2) { animation-delay: -0.16s; }
@keyframes dotBounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* 抽屉遮罩 */
.drawer-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.25);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

/* 重命名弹窗 */
.rename-modal {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 380px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.12);
}
.rename-title {
  font-size: 16px;
  font-weight: 600;
  color: #1D2129;
  margin-bottom: 8px;
}
.rename-id {
  font-size: 12px;
  color: #C9CDD4;
  margin-bottom: 16px;
}
.rename-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #E5E6EB;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.rename-input:focus {
  border-color: #1677FF;
}
.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.rename-cancel,
.rename-ok {
  padding: 6px 18px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: none;
}
.rename-cancel {
  background: #F2F3F5;
  color: #4E5969;
}
.rename-ok {
  background: #1677FF;
  color: #fff;
}
.rename-ok:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 详情抽屉 */
.drawer {
  width: 520px;
  max-width: 90vw;
  background: #fff;
  height: 100%;
  overflow-y: auto;
  box-shadow: -4px 0 24px rgba(0,0,0,0.08);
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #F2F3F5;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}
.dh-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dh-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
}
.dh-name {
  font-size: 16px;
  font-weight: 600;
  color: #1D2129;
}
.dh-id {
  font-size: 12px;
  color: #C9CDD4;
  margin-top: 2px;
}
.dh-close {
  font-size: 22px;
  color: #C9CDD4;
  cursor: pointer;
  line-height: 1;
  padding: 4px;
}
.dh-close:hover {
  color: #4E5969;
}

.drawer-body {
  padding: 20px 24px;
}

/* Hero 卡片 */
.hero-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}
.hero-card {
  border-radius: 10px;
  padding: 16px;
}
.hero-card.c1 {
  background: linear-gradient(135deg, #E8F4FF, #F0F7FF);
}
.hero-card.c2 {
  background: linear-gradient(135deg, #E8FFF3, #F0FFF7);
}
.hero-label {
  font-size: 13px;
  color: #86909C;
  margin-bottom: 6px;
}
.hero-val {
  font-size: 22px;
  font-weight: 700;
  color: #1D2129;
}

/* 趋势 */
.trend-section {
  margin-bottom: 20px;
}
.trend-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.trend-tab {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #86909C;
  cursor: pointer;
  transition: all 0.2s;
}
.trend-tab:hover {
  color: #1677FF;
}
.trend-tab.active {
  background: #1677FF;
  color: #fff;
}
.trend-chart {
  height: 260px;
}

/* 详细数据 */
.sec-label {
  font-size: 14px;
  font-weight: 600;
  color: #1D2129;
  margin: 20px 0 12px;
}
.data-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.dg-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #FAFBFC;
  border-radius: 8px;
}
.dg-l {
  font-size: 13px;
  color: #86909C;
}
.dg-v {
  font-size: 14px;
  font-weight: 600;
  color: #1D2129;
}

/* AI 建议 */
.ai-card {
  background: #FAFBFC;
  border-radius: 10px;
  padding: 16px;
  min-height: 80px;
}
.ai-loading {
  text-align: center;
  padding: 20px 0;
}
.ai-content {
  font-size: 13px;
  line-height: 1.7;
  color: #4E5969;
}
.ai-empty {
  text-align: center;
  padding: 12px 0;
}
.ai-btn {
  padding: 8px 24px;
  background: linear-gradient(135deg, #1677FF, #4C9AFF);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.ai-btn:hover {
  opacity: 0.85;
}

/* 响应式隐藏 */
@media (max-width: 768px) {
  .col-hide-m {
    display: none;
  }
}
</style>
