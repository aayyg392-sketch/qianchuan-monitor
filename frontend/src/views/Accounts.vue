<template>
  <div class="page">
    <!-- ===== 数据概览 ===== -->
    <div class="overview" v-if="overviewCards.length">
      <div class="overview-header"><h3 class="overview-title">数据概览</h3></div>
      <div class="overview-grid">
        <div class="ov-card" v-for="card in overviewCards" :key="card.key">
          <div class="ov-card__top">
            <span class="ov-card__label">{{ card.label }}</span>
            <svg v-if="card.trend && card.trend.length > 1" class="ov-card__spark" viewBox="0 0 80 28" preserveAspectRatio="none">
              <polyline :points="sparkPoints(card.trend)" fill="none" :stroke="card.change >= 0 ? '#00B96B' : '#FF4D4F'" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="ov-card__value">{{ card.prefix || '' }}{{ formatCardValue(card) }}{{ card.suffix || '' }}</div>
          <div class="ov-card__change" :class="card.change >= 0 ? 'up' : 'down'">
            {{ card.change >= 0 ? '+' : '' }}{{ card.change.toFixed(2) }}%
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 账户列表 ===== -->
    <div class="acc-section">
      <div class="acc-table-header">
        <span class="col-info">账户信息</span>
        <span class="col-val">消耗</span>
        <span class="col-val">ROI</span>
        <span class="col-val">订单</span>
        <span class="col-val">GMV</span>
        <span class="col-val col-hide-m">展示</span>
        <span class="col-val col-hide-m">点击</span>
        <span class="col-status">状态</span>
      </div>

      <div v-if="loading" class="empty-state">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>
      <template v-else>
        <div v-for="acc in sortedAccounts" :key="acc.id"
             class="acc-table-row" :class="{ disabled: acc.status !== 1 }" @click="openDetail(acc)">
          <div class="col-info">
            <div class="acc-avatar" :style="{ background: avatarColor(acc.advertiser_id) }">{{ (acc.advertiser_name || '账').charAt(0) }}</div>
            <div class="acc-text">
              <div class="acc-name" :title="acc.advertiser_name">{{ acc.advertiser_name || '未命名' }}</div>
              <div class="acc-sub">ID: {{ acc.advertiser_id }} · {{ acc.account_type === 'live' ? '直播' : '商品' }}</div>
            </div>
          </div>
          <span class="col-val blue">¥{{ fmtNum(acc.today_cost) }}</span>
          <span class="col-val" :class="roiCls(acc.today_roi)">{{ n2(acc.today_roi) }}</span>
          <span class="col-val green">{{ acc.today_orders || 0 }}</span>
          <span class="col-val purple">¥{{ fmtNum(acc.today_gmv) }}</span>
          <span class="col-val col-hide-m">{{ fmtBig(acc.today_show) }}</span>
          <span class="col-val col-hide-m">{{ fmtBig(acc.today_click) }}</span>
          <div class="col-status">
            <span class="badge" :class="acc.status === 1 ? 'on' : 'off'">
              <i class="dot"></i>{{ acc.status === 1 ? '投放中' : '已停用' }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- ===== Drawer ===== -->
    <div v-if="showDrawer" class="drawer-mask" @click.self="showDrawer = false">
      <div class="drawer">
        <div class="drawer-head">
          <div class="dh-left">
            <div class="dh-avatar" :style="{ background: avatarColor(detail.advertiser_id) }">{{ (detail.advertiser_name || '账').charAt(0) }}</div>
            <div><div class="dh-name">{{ detail.advertiser_name }}</div><div class="dh-id">ID: {{ detail.advertiser_id }}</div></div>
          </div>
          <span class="dh-close" @click="showDrawer = false">&times;</span>
        </div>
        <div class="drawer-body" v-if="detail">
          <!-- Hero -->
          <div class="hero-row">
            <div class="hero-card c1"><div class="hero-label">今日消耗</div><div class="hero-val">¥{{ fmtNum(detail.today_cost) }}</div></div>
            <div class="hero-card c2"><div class="hero-label">今日GMV</div><div class="hero-val">¥{{ fmtNum(detail.today_gmv) }}</div></div>
          </div>

          <!-- 趋势图 -->
          <div class="trend-section">
            <div class="trend-tabs">
              <span v-for="t in trendTabs" :key="t.key" class="trend-tab" :class="{ active: activeTrend === t.key }" @click="activeTrend = t.key; renderChart()">{{ t.label }}</span>
            </div>
            <div ref="chartRef" class="trend-chart"></div>
          </div>

          <!-- 详细数据 -->
          <div class="sec-label">详细数据</div>
          <div class="data-grid">
            <div class="dg-item"><span class="dg-l">ROI</span><span class="dg-v" :class="roiCls(detail.today_roi)">{{ n2(detail.today_roi) }}</span></div>
            <div class="dg-item"><span class="dg-l">订单</span><span class="dg-v">{{ detail.today_orders || 0 }}</span></div>
            <div class="dg-item"><span class="dg-l">客单价</span><span class="dg-v">¥{{ detail.today_orders > 0 ? n2(detail.today_gmv / detail.today_orders) : '0.00' }}</span></div>
            <div class="dg-item"><span class="dg-l">千元出单</span><span class="dg-v">{{ detail.today_cost > 0 ? n2(detail.today_orders / detail.today_cost * 1000) : '0.00' }}</span></div>
            <div class="dg-item"><span class="dg-l">展示</span><span class="dg-v">{{ fmtBig(detail.today_show) }}</span></div>
            <div class="dg-item"><span class="dg-l">点击</span><span class="dg-v">{{ fmtBig(detail.today_click) }}</span></div>
            <div class="dg-item"><span class="dg-l">CTR</span><span class="dg-v">{{ n2(detail.today_ctr) }}%</span></div>
            <div class="dg-item"><span class="dg-l">转化率</span><span class="dg-v">{{ detail.today_click > 0 ? n2(detail.today_orders / detail.today_click * 100) : '0.00' }}%</span></div>
          </div>

          <!-- AI优化建议 -->
          <div class="sec-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
            AI 优化建议
          </div>
          <div class="ai-card">
            <div v-if="aiLoading" class="ai-loading">
              <div class="loading-dots"><span></span><span></span><span></span></div>
              <div style="margin-top:8px;font-size:13px;color:#86909C">AI 正在分析账户数据...</div>
            </div>
            <div v-else-if="aiResult" class="ai-content" v-html="renderMd(aiResult)"></div>
            <div v-else class="ai-empty">
              <button class="ai-btn" @click="fetchAnalysis">生成优化建议</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import request from '../utils/request'

const accounts = ref([])
const loading = ref(false)
const showDrawer = ref(false)
const detail = ref(null)
const overviewCards = ref([])
const trendData = ref(null)
const activeTrend = ref('cost_gmv')
const chartRef = ref(null)
const aiLoading = ref(false)
const aiResult = ref('')
let chartInstance = null

const trendTabs = [
  { key: 'cost_gmv', label: '消耗/GMV' },
  { key: 'roi', label: 'ROI' },
  { key: 'orders', label: '订单' },
  { key: 'traffic', label: '流量' },
]

const sortedAccounts = computed(() =>
  [...accounts.value].sort((a, b) => parseFloat(b.today_cost || 0) - parseFloat(a.today_cost || 0))
)

// ===== 工具 =====
function sparkPoints(data) {
  if (!data || data.length < 2) return ''
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  return data.map((v, i) => `${(i / (data.length - 1)) * 80},${26 - ((v - min) / range) * 24}`).join(' ')
}
function formatCardValue(card) {
  const v = card.value
  if (card.suffix === '%') return v.toFixed(2)
  if (v >= 10000) return (v / 10000).toFixed(2) + '万'
  if (typeof v === 'number' && v % 1 !== 0) return v.toFixed(2)
  return v
}
const fmtNum = (v) => {
  const n = parseFloat(v || 0)
  return n >= 10000 ? (n / 10000).toFixed(2) + '万' : n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
const fmtBig = (v) => { const n = parseInt(v || 0); return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString() }
const n2 = (v) => parseFloat(v || 0).toFixed(2)
const roiCls = (v) => { const n = parseFloat(v); return n >= 2 ? 'green' : n >= 1.5 ? 'orange' : 'red' }
const avatarColor = (id) => ['#1677FF','#722ED1','#F5222D','#FA8C16','#52C41A','#13C2C2'][parseInt(id) % 6]

function renderMd(text) {
  return text
    .replace(/### (.*)/g, '<h4 style="margin:12px 0 6px;font-size:14px;color:#1D2129">$1</h4>')
    .replace(/## (.*)/g, '<h3 style="margin:14px 0 8px;font-size:15px;color:#1D2129">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/- (.*)/g, '<div style="padding:3px 0 3px 12px;position:relative"><span style="position:absolute;left:0">•</span>$1</div>')
    .replace(/\n/g, '<br>')
}

// ===== 趋势图 =====
function renderChart() {
  if (!chartRef.value || !trendData.value) return
  if (chartInstance) chartInstance.dispose()
  chartInstance = echarts.init(chartRef.value)

  const td = trendData.value
  const colors = ['#1677FF', '#00B96B', '#FF8A00', '#722ED1']
  let series = [], yName = ''

  if (activeTrend.value === 'cost_gmv') {
    yName = '金额(元)'
    series = [
      { name: '消耗', data: td.cost, type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5 }, itemStyle: { color: colors[0] }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(22,119,255,0.15)'},{offset:1,color:'rgba(22,119,255,0)'}]) } },
      { name: 'GMV', data: td.gmv, type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5 }, itemStyle: { color: colors[1] }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(0,185,107,0.15)'},{offset:1,color:'rgba(0,185,107,0)'}]) } },
    ]
  } else if (activeTrend.value === 'roi') {
    yName = 'ROI'
    series = [{ name: 'ROI', data: td.roi, type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5 }, itemStyle: { color: colors[2] }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(255,138,0,0.15)'},{offset:1,color:'rgba(255,138,0,0)'}]) }, markLine: { data: [{ type: 'average', label: { formatter: '均值 {c}' } }], lineStyle: { type: 'dashed', color: '#FF8A00' } } }]
  } else if (activeTrend.value === 'orders') {
    yName = '订单数'
    series = [{ name: '订单', data: td.orders, type: 'bar', barWidth: 20, itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#722ED1'},{offset:1,color:'#B37FEB'}]), borderRadius: [4,4,0,0] } }]
  } else {
    yName = '次数'
    series = [
      { name: '展示', data: td.show, type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5 }, itemStyle: { color: colors[0] } },
      { name: '点击', data: td.click, type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5 }, itemStyle: { color: colors[1] } },
    ]
  }

  chartInstance.setOption({
    grid: { left: 12, right: 12, top: 36, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: '#1D2129', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 } },
    legend: { top: 4, right: 0, textStyle: { fontSize: 11, color: '#86909C' }, itemWidth: 16, itemHeight: 2 },
    xAxis: { type: 'category', data: td.dates, axisLine: { lineStyle: { color: '#E5E6EB' } }, axisLabel: { fontSize: 11, color: '#86909C' }, axisTick: { show: false } },
    yAxis: { type: 'value', name: yName, nameTextStyle: { fontSize: 11, color: '#C0C4CC', padding: [0,0,0,-20] }, splitLine: { lineStyle: { color: '#F2F3F5' } }, axisLabel: { fontSize: 11, color: '#86909C' } },
    series
  })
}

// ===== 数据加载 =====
async function loadOverview() {
  try { const res = await request.get('/campaigns/overview'); overviewCards.value = res.data?.cards || [] } catch {}
}
async function loadAccounts() {
  loading.value = true
  try { const res = await request.get('/accounts'); accounts.value = res.data?.list || res.data || [] }
  catch { accounts.value = [] }
  finally { loading.value = false }
}

async function openDetail(acc) {
  detail.value = { ...acc }
  showDrawer.value = true
  aiResult.value = ''
  trendData.value = null
  activeTrend.value = 'cost_gmv'
  // 加载趋势
  try {
    const res = await request.get(`/accounts/${acc.advertiser_id}/trend`)
    trendData.value = res.data
    await nextTick()
    renderChart()
  } catch {}
}

async function fetchAnalysis() {
  if (!detail.value) return
  aiLoading.value = true
  try {
    const res = await request.post('/accounts/analyze', {
      advertiser_name: detail.value.advertiser_name,
      today_cost: detail.value.today_cost,
      today_gmv: detail.value.today_gmv,
      today_roi: detail.value.today_roi,
      today_orders: detail.value.today_orders,
      today_show: detail.value.today_show,
      today_click: detail.value.today_click,
      today_ctr: detail.value.today_ctr,
      trend: trendData.value
    })
    aiResult.value = res.data?.analysis || '暂无建议'
  } catch { aiResult.value = '分析请求失败，请稍后重试' }
  finally { aiLoading.value = false }
}

watch(showDrawer, (v) => { if (!v && chartInstance) { chartInstance.dispose(); chartInstance = null } })

onMounted(() => { loadOverview(); loadAccounts() })
</script>

<style scoped>
.page { background: var(--bg-page, #F5F6FA); min-height: 100vh; }

/* ===== 数据概览 ===== */
.overview { background: #fff; border-bottom: 1px solid #F0F1F3; padding: 16px; }
.overview-header { margin-bottom: 12px; }
.overview-title { font-size: 15px; font-weight: 600; color: #1D2129; margin: 0; }
.overview-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.ov-card { background: #F7F8FA; border-radius: 8px; padding: 12px; }
.ov-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.ov-card__label { font-size: 12px; color: #86909C; }
.ov-card__spark { width: 60px; height: 22px; }
.ov-card__value { font-size: 20px; font-weight: 700; color: #1D2129; margin-bottom: 4px; white-space: nowrap; }
.ov-card__change { font-size: 12px; font-weight: 500; }
.ov-card__change.up { color: #FF4D4F; }
.ov-card__change.down { color: #00B96B; }

/* ===== 账户列表（表格式） ===== */
.acc-section { background: #fff; margin-top: 8px; }

.acc-table-header, .acc-table-row {
  display: grid;
  grid-template-columns: minmax(240px, 1.5fr) repeat(4, 1fr) 80px 80px 90px;
  align-items: center;
  padding: 0 20px;
}
.acc-table-header {
  background: #FAFAFA; border-bottom: 1px solid #F0F1F3;
  padding-top: 10px; padding-bottom: 10px;
  font-size: 12px; color: #86909C; font-weight: 500;
}
.acc-table-row {
  padding-top: 14px; padding-bottom: 14px;
  border-bottom: 1px solid #F2F3F5; cursor: pointer;
  transition: background 0.12s;
}
.acc-table-row:hover { background: #F5F7FA; }
.acc-table-row:last-child { border-bottom: none; }

.col-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
.col-val { text-align: right; font-size: 14px; font-weight: 600; color: #1D2129; font-variant-numeric: tabular-nums; white-space: nowrap; padding-right: 8px; }
.col-status { text-align: center; }

.col-val.blue { color: #1677FF; }
.col-val.green { color: #00B42A; }
.col-val.orange { color: #FF7D00; }
.col-val.red { color: #F53F3F; }
.col-val.purple { color: #722ED1; }

.acc-avatar { width: 36px; height: 36px; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.acc-text { min-width: 0; }
.acc-name { font-size: 14px; font-weight: 600; color: #1D2129; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acc-sub { font-size: 11px; color: #C0C4CC; margin-top: 2px; white-space: nowrap; }

.badge { font-size: 11px; padding: 2px 8px; border-radius: 100px; display: inline-flex; align-items: center; gap: 4px; }
.badge.on { background: #E8FFF3; color: #00B96B; }
.badge.off { background: #F7F8FA; color: #C9CDD4; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }

.acc-table-row.disabled { background: #FAFBFC; }
.acc-table-row.disabled .acc-name { color: #C0C4CC; }
.acc-table-row.disabled .col-val { color: #D0D3D8 !important; }
.acc-table-row.disabled .acc-avatar { filter: grayscale(0.8); opacity: 0.6; }

/* ===== Drawer ===== */
.drawer-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; display: flex; justify-content: flex-end; }
.drawer { width: 440px; max-width: 100%; background: #F5F6FA; height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; box-shadow: -4px 0 24px rgba(0,0,0,0.08); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; background: #fff; border-bottom: 1px solid #F0F1F3; position: sticky; top: 0; z-index: 1; }
.dh-left { display: flex; align-items: center; gap: 10px; }
.dh-avatar { width: 34px; height: 34px; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.dh-name { font-size: 15px; font-weight: 600; color: #1D2129; }
.dh-id { font-size: 11px; color: #86909C; margin-top: 1px; }
.dh-close { font-size: 22px; color: #86909C; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #F0F1F5; }
.dh-close:hover { background: #E5E6EB; }
.drawer-body { padding: 14px; }

.hero-row { display: flex; gap: 10px; margin-bottom: 14px; }
.hero-card { flex: 1; border-radius: 12px; padding: 16px 14px; }
.hero-card.c1 { background: linear-gradient(135deg, #E8F4FF, #D4EAFF); }
.hero-card.c2 { background: linear-gradient(135deg, #E8FFF3, #C6F7DC); }
.hero-label { font-size: 12px; color: #595959; margin-bottom: 4px; }
.hero-val { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hero-card.c1 .hero-val { color: #1677FF; }
.hero-card.c2 .hero-val { color: #00B96B; }

/* 趋势图 */
.trend-section { background: #fff; border-radius: 12px; border: 1px solid #F0F1F3; margin-bottom: 14px; overflow: hidden; }
.trend-tabs { display: flex; gap: 0; border-bottom: 1px solid #F0F1F3; }
.trend-tab { flex: 1; text-align: center; padding: 10px 0; font-size: 13px; color: #86909C; cursor: pointer; transition: all 0.15s; border-bottom: 2px solid transparent; }
.trend-tab:hover { color: #1677FF; }
.trend-tab.active { color: #1677FF; font-weight: 600; border-bottom-color: #1677FF; }
.trend-chart { height: 220px; padding: 8px; }

/* 详细数据 */
.sec-label { font-size: 12px; font-weight: 600; color: #BFBFBF; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 2px; }
.data-grid { display: grid; grid-template-columns: repeat(2, 1fr); background: #fff; border: 1px solid #F0F1F3; border-radius: 12px; overflow: hidden; margin-bottom: 14px; }
.dg-item { padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F2F3F5; }
.dg-item:nth-child(odd) { border-right: 1px solid #F2F3F5; }
.dg-item:nth-last-child(-n+2) { border-bottom: none; }
.dg-l { font-size: 13px; color: #86909C; }
.dg-v { font-size: 14px; font-weight: 600; color: #1D2129; font-variant-numeric: tabular-nums; }
.dg-v.green { color: #00B42A; }
.dg-v.orange { color: #FF7D00; }
.dg-v.red { color: #F53F3F; }

/* AI建议 */
.ai-card { background: #fff; border: 1px solid #E8F4FF; border-radius: 12px; padding: 16px; margin-bottom: 14px; min-height: 80px; }
.ai-loading { text-align: center; padding: 20px 0; }
.ai-content { font-size: 13px; line-height: 1.8; color: #4E5969; }
.ai-content :deep(h3) { color: #1D2129; }
.ai-content :deep(h4) { color: #1D2129; }
.ai-content :deep(strong) { color: #1D2129; }
.ai-empty { text-align: center; padding: 16px 0; }
.ai-btn { padding: 8px 24px; background: linear-gradient(135deg, #1677FF, #4096FF); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
.ai-btn:hover { opacity: 0.85; }

/* Loading */
.empty-state { text-align: center; padding: 60px 20px; color: #C9CDD4; }
.loading-dots { display: flex; gap: 6px; justify-content: center; }
.loading-dots span { width: 8px; height: 8px; border-radius: 50%; background: #1677FF; animation: bounce 1.4s infinite ease-in-out both; }
.loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.loading-dots span:nth-child(2) { animation-delay: -0.16s; }
@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

/* ===== 响应式 ===== */
@media (max-width: 767px) {
  .overview-grid { grid-template-columns: repeat(2, 1fr); }
  .acc-table-header { display: none; }
  .acc-table-row { grid-template-columns: 1fr; gap: 8px; padding: 14px; }
  .col-info { grid-column: 1; }
  .col-val { text-align: left; padding: 0; font-size: 13px; }
  .col-val::before { content: attr(data-label); font-size: 11px; color: #C0C4CC; margin-right: 4px; font-weight: 400; }
  .col-status { text-align: left; }
  .col-hide-m { display: none; }
  .drawer { width: 100%; height: 90vh; border-radius: 16px 16px 0 0; }
  .drawer-mask { align-items: flex-end; }
}
@media (min-width: 768px) and (max-width: 1199px) {
  .overview-grid { grid-template-columns: repeat(3, 1fr); }
  .col-hide-m { display: none; }
  .acc-table-header, .acc-table-row { grid-template-columns: minmax(200px, 1.5fr) repeat(4, 1fr) 90px; }
}
@media (min-width: 1200px) {
  .overview { padding: 16px 20px; }
  .acc-table-header, .acc-table-row { padding-left: 20px; padding-right: 20px; }
}
</style>
