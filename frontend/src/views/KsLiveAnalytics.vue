<template>
  <div class="ks-live-analytics">
    <!-- Hero Section -->
    <div class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">直播电商联动分析</h1>
        <p class="hero-subtitle">快手直播与短视频渠道数据联动，优化直播排期与讲品策略</p>
      </div>
      <div class="hero-controls">
        <select v-model="shopId" class="shop-selector" @change="fetchAll">
          <option value="">请选择店铺</option>
          <option v-for="a in accounts" :key="a.shop_id" :value="a.shop_id">{{ a.shop_name }}</option>
        </select>
        <div class="day-range-selector">
          <button
            v-for="d in [7, 15, 30]"
            :key="d"
            :class="['day-btn', { active: days === d }]"
            @click="days = d; fetchAll()"
          >{{ d }}天</button>
        </div>
        <button class="refresh-btn" @click="fetchAll" :disabled="loading">
          <span v-if="loading" class="spin">&#8635;</span>
          <span v-else>&#8635;</span>
          刷新
        </button>
      </div>
    </div>

    <!-- Detail View -->
    <template v-if="selectedSession">
      <div class="detail-view">
        <button class="back-btn" @click="selectedSession = null">&larr; 返回场次列表</button>
        <h2 class="detail-title">场次详情</h2>

        <div class="stat-grid four-col">
          <div class="stat-card">
            <div class="stat-label">GMV</div>
            <div class="stat-value money">{{ formatMoney(selectedSession.gmv) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">订单</div>
            <div class="stat-value">{{ selectedSession.orders }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">观看</div>
            <div class="stat-value">{{ selectedSession.viewers }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">时长</div>
            <div class="stat-value">{{ formatDuration(selectedSession.duration_min) }}</div>
          </div>
        </div>

        <!-- 时段订单分布 -->
        <div class="dt-card">
          <h3 class="card-title">时段订单分布</h3>
          <div class="timeslot-chart" v-if="selectedSession.timeSlots?.length">
            <div
              v-for="(slot, i) in selectedSession.timeSlots"
              :key="i"
              class="timeslot-bar-wrap"
            >
              <div class="timeslot-label">{{ slot.label }}</div>
              <div class="timeslot-bar-bg">
                <div
                  class="timeslot-bar"
                  :style="{ width: timeslotPct(slot.orders) + '%' }"
                ></div>
              </div>
              <div class="timeslot-val">{{ slot.orders }}</div>
            </div>
          </div>
          <div v-else class="empty-hint">暂无时段数据</div>
        </div>

        <!-- 商品讲解记录 -->
        <div class="dt-card">
          <h3 class="card-title">商品讲解记录</h3>
          <div class="product-explain-list" v-if="selectedSession.products?.length">
            <div class="product-explain-item" v-for="(p, i) in selectedSession.products" :key="i">
              <img :src="p.item_pic" class="product-pic" alt="" />
              <div class="product-explain-info">
                <div class="product-explain-name">{{ p.item_title }}</div>
                <div class="product-explain-meta">
                  <span>讲解 {{ Math.round(p.explain_duration_sec / 60) }}分{{ p.explain_duration_sec % 60 }}秒</span>
                  <span>GMV ¥{{ formatMoney(p.gmv) }}</span>
                  <span>订单 {{ p.order_count }}</span>
                  <span>转化率 {{ (p.conversion_rate * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">暂无商品讲解数据</div>
        </div>
      </div>
    </template>

    <!-- Main Tabs -->
    <template v-else>
      <div class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </div>

      <div v-if="loading" class="loading-mask">加载中...</div>

      <div v-show="!loading">
        <!-- 综合概览 -->
        <div v-if="activeTab === 'overview'" class="tab-panel">
          <div class="stat-grid four-col">
            <div class="stat-card">
              <div class="stat-label">直播场次</div>
              <div class="stat-value">{{ stats.total_sessions ?? '-' }}</div>
              <div class="stat-change" :class="changeClass(changes.total_sessions)">
                {{ formatChange(changes.total_sessions) }}
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">直播GMV</div>
              <div class="stat-value money">{{ formatMoney(stats.total_gmv) }}</div>
              <div class="stat-change" :class="changeClass(changes.total_gmv)">
                {{ formatChange(changes.total_gmv) }}
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">直播订单</div>
              <div class="stat-value">{{ stats.total_orders ?? '-' }}</div>
              <div class="stat-change" :class="changeClass(changes.total_orders)">
                {{ formatChange(changes.total_orders) }}
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">场均观看</div>
              <div class="stat-value">{{ stats.avg_viewers ?? '-' }}</div>
              <div class="stat-change" :class="changeClass(changes.avg_viewers)">
                {{ formatChange(changes.avg_viewers) }}
              </div>
            </div>
          </div>

          <!-- 渠道对比 -->
          <div class="dt-card">
            <h3 class="card-title">渠道对比</h3>
            <div class="channel-comparison" v-if="channel">
              <div class="channel-row">
                <span class="channel-label">直播</span>
                <div class="channel-bar-bg">
                  <div class="channel-bar live" :style="{ width: channel.live?.pct + '%' }"></div>
                </div>
                <span class="channel-pct">{{ channel.live?.pct }}%</span>
                <span class="channel-detail">GMV ¥{{ formatMoney(channel.live?.gmv) }} / {{ channel.live?.orders }}单</span>
              </div>
              <div class="channel-row">
                <span class="channel-label">短视频</span>
                <div class="channel-bar-bg">
                  <div class="channel-bar video" :style="{ width: channel.video?.pct + '%' }"></div>
                </div>
                <span class="channel-pct">{{ channel.video?.pct }}%</span>
                <span class="channel-detail">GMV ¥{{ formatMoney(channel.video?.gmv) }} / {{ channel.video?.orders }}单</span>
              </div>
            </div>
          </div>

          <!-- 近期直播场次 -->
          <div class="dt-card">
            <h3 class="card-title">近期直播场次</h3>
            <div class="session-list" v-if="sessions.length">
              <div
                v-for="s in sessions"
                :key="s.id"
                class="session-item"
                @click="loadSessionDetail(s.id)"
              >
                <div class="session-main">
                  <span class="session-time">{{ formatTime(s.start_time) }}</span>
                  <span class="session-anchor">{{ s.anchor_name }}</span>
                </div>
                <div class="session-stats">
                  <span>GMV ¥{{ formatMoney(s.gmv) }}</span>
                  <span>{{ s.orders }}单</span>
                  <span>{{ s.viewers }}观看</span>
                </div>
                <span class="session-arrow">&rsaquo;</span>
              </div>
            </div>
            <div v-else class="empty-hint">暂无直播场次</div>
          </div>
        </div>

        <!-- 时段热力 -->
        <div v-if="activeTab === 'heatmap'" class="tab-panel">
          <div class="dt-card">
            <h3 class="card-title">时段热力图</h3>
            <p class="card-tip">颜色越深表示下单越集中，可优化直播排期</p>
            <div class="heatmap-wrapper">
              <div class="heatmap-grid">
                <div class="heatmap-corner"></div>
                <div v-for="h in 24" :key="'h-' + h" class="heatmap-col-header">{{ h - 1 }}</div>
                <template v-for="(dayLabel, di) in dowLabels" :key="'row-' + di">
                  <div class="heatmap-row-header">{{ dayLabel }}</div>
                  <div
                    v-for="h in 24"
                    :key="'cell-' + di + '-' + h"
                    class="heatmap-cell"
                    :style="{ backgroundColor: heatmapColor(di, h - 1) }"
                    :title="`${dayLabel} ${h - 1}时 - 订单: ${heatmapVal(di, h - 1, 'orders')}, GMV: ¥${formatMoney(heatmapVal(di, h - 1, 'gmv'))}`"
                  ></div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 主播绩效 -->
        <div v-if="activeTab === 'anchor'" class="tab-panel">
          <div class="dt-card">
            <h3 class="card-title">主播绩效排行</h3>
            <div class="anchor-list" v-if="anchors.length">
              <div class="anchor-header">
                <span class="anchor-rank">#</span>
                <span class="anchor-name">主播</span>
                <span class="anchor-col">场次</span>
                <span class="anchor-col">时长(分)</span>
                <span class="anchor-col">场均观看</span>
                <span class="anchor-col">总GMV</span>
                <span class="anchor-col">总订单</span>
                <span class="anchor-col">GMV/分钟</span>
              </div>
              <div v-for="(a, i) in anchors" :key="a.anchor_id" class="anchor-row">
                <span class="anchor-rank">{{ i + 1 }}</span>
                <span class="anchor-name">{{ a.anchor_name }}</span>
                <span class="anchor-col">{{ a.sessions }}</span>
                <span class="anchor-col">{{ a.minutes }}</span>
                <span class="anchor-col">{{ a.avg_viewers }}</span>
                <span class="anchor-col money">¥{{ formatMoney(a.total_gmv) }}</span>
                <span class="anchor-col">{{ a.total_orders }}</span>
                <span class="anchor-col money">¥{{ formatMoney(a.gmv_per_min) }}</span>
              </div>
            </div>
            <div v-else class="empty-hint">暂无主播数据</div>
          </div>
        </div>

        <!-- 讲品节奏 -->
        <div v-if="activeTab === 'product'" class="tab-panel">
          <div class="dt-card">
            <h3 class="card-title">讲品节奏分析</h3>
            <div class="product-rhythm-list" v-if="products.length">
              <div v-for="p in products" :key="p.item_id" class="product-rhythm-item">
                <img :src="p.item_pic" class="product-pic" alt="" />
                <div class="product-rhythm-info">
                  <div class="product-rhythm-name">{{ p.item_title }}</div>
                  <div class="product-rhythm-stats">
                    <span>{{ p.sessions }}场</span>
                    <span>GMV ¥{{ formatMoney(p.total_gmv) }}</span>
                    <span>{{ p.total_orders }}单</span>
                  </div>
                  <div class="product-rhythm-best" v-if="p.best_minute != null">
                    最佳时机: 开播第{{ p.best_minute }}分钟 (GMV ¥{{ formatMoney(p.best_gmv) }})
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="empty-hint">暂无讲品数据</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import request from '../utils/request'
import { message } from 'ant-design-vue'

const tabs = [
  { key: 'overview', label: '综合概览' },
  { key: 'heatmap', label: '时段热力' },
  { key: 'anchor', label: '主播绩效' },
  { key: 'product', label: '讲品节奏' },
]

const dowLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// Reactive state
const loading = ref(false)
const accounts = ref([])
const shopId = ref('')
const days = ref(30)
const activeTab = ref('overview')

const stats = ref({})
const changes = ref({})
const channel = ref(null)
const sessions = ref([])
const heatmap = ref([])
const anchors = ref([])
const products = ref([])
const selectedSession = ref(null)

// Helpers
function formatMoney(val) {
  if (val == null || isNaN(val)) return '-'
  return Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDuration(min) {
  if (min == null) return '-'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0) return `${h}时${m}分`
  return `${m}分`
}

function formatTime(str) {
  if (!str) return '-'
  return str.slice(5, 16).replace('T', ' ')
}

function formatChange(val) {
  if (val == null) return ''
  const pct = (val * 100).toFixed(1)
  return val >= 0 ? `+${pct}%` : `${pct}%`
}

function changeClass(val) {
  if (val == null) return ''
  return val >= 0 ? 'up' : 'down'
}

function heatmapVal(dow, hour, field) {
  const cell = heatmap.value.find(h => h.dow === dow && h.hour === hour)
  return cell ? cell[field] || 0 : 0
}

function heatmapColor(dow, hour) {
  const orders = heatmapVal(dow, hour, 'orders')
  if (!orders) return 'var(--c-bg-muted, #f5f5f5)'
  const maxOrders = Math.max(...heatmap.value.map(h => h.orders || 0), 1)
  const intensity = Math.min(orders / maxOrders, 1)
  const alpha = 0.15 + intensity * 0.85
  return `rgba(114, 46, 209, ${alpha.toFixed(2)})`
}

function timeslotPct(orders) {
  if (!selectedSession.value?.timeSlots?.length) return 0
  const max = Math.max(...selectedSession.value.timeSlots.map(s => s.orders || 0), 1)
  return (orders / max) * 100
}

// Data fetching
async function fetchAccounts() {
  try {
    const res = await request.get('/ks/accounts')
    accounts.value = res || []
    if (accounts.value.length && !shopId.value) {
      shopId.value = accounts.value[0].shop_id
    }
  } catch (e) {
    message.error('获取店铺列表失败')
  }
}

async function fetchAll() {
  if (!shopId.value) return
  loading.value = true
  try {
    await Promise.all([
      fetchSummary(),
      fetchChannel(),
      fetchSessions(),
      fetchHeatmap(),
      fetchAnchors(),
      fetchProducts(),
    ])
  } catch (e) {
    message.error('数据加载失败，请重试')
  } finally {
    loading.value = false
  }
}

async function fetchSummary() {
  const res = await request.get('/ks-live/summary', { params: { shop_id: shopId.value, days: days.value } })
  stats.value = res?.stats || {}
  changes.value = res?.changes || {}
}

async function fetchChannel() {
  const res = await request.get('/ks-live/channel-comparison', { params: { shop_id: shopId.value, days: days.value } })
  channel.value = res || null
}

async function fetchSessions() {
  const res = await request.get('/ks-live/sessions', { params: { shop_id: shopId.value, pageSize: 10 } })
  sessions.value = res?.list || []
}

async function fetchHeatmap() {
  const res = await request.get('/ks-live/heatmap', { params: { shop_id: shopId.value, days: days.value } })
  heatmap.value = res?.heatmap || []
}

async function fetchAnchors() {
  const res = await request.get('/ks-live/anchor-performance', { params: { shop_id: shopId.value, days: days.value } })
  anchors.value = res?.anchors || []
}

async function fetchProducts() {
  const res = await request.get('/ks-live/product-rhythm', { params: { shop_id: shopId.value } })
  products.value = res?.products || []
}

async function loadSessionDetail(id) {
  loading.value = true
  try {
    const res = await request.get(`/ks-live/session/${id}`)
    selectedSession.value = res || null
  } catch (e) {
    message.error('加载场次详情失败')
  } finally {
    loading.value = false
  }
}

// Init
onMounted(async () => {
  await fetchAccounts()
  if (shopId.value) {
    fetchAll()
  }
})
</script>

<style scoped>
.ks-live-analytics {
  --c-primary: #ff4906;
  --c-purple: #722ed1;
  --c-success: #52c41a;
  --c-warning: #faad14;
  --c-danger: #f5222d;
  --c-bg-muted: #f5f5f5;
  --c-border: #e8e8e8;
  --c-text: #333;
  --c-text-secondary: #888;
  --radius: 10px;
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--c-text);
}

/* Hero */
.hero-section {
  background: linear-gradient(135deg, var(--c-primary), var(--c-purple));
  border-radius: var(--radius);
  padding: 28px 24px;
  margin-bottom: 20px;
  color: #fff;
}

.hero-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
}

.hero-subtitle {
  font-size: 13px;
  opacity: 0.85;
  margin: 0 0 18px;
}

.hero-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.shop-selector {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 13px;
  outline: none;
  min-width: 160px;
}

.shop-selector option {
  color: #333;
  background: #fff;
}

.day-range-selector {
  display: flex;
  gap: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.day-btn {
  padding: 6px 14px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.day-btn.active {
  background: rgba(255, 255, 255, 0.35);
  font-weight: 600;
}

.refresh-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Tabs */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 18px;
  border-bottom: 2px solid var(--c-border);
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 14px;
  color: var(--c-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s, border-color 0.2s;
}

.tab-btn.active {
  color: var(--c-primary);
  border-bottom-color: var(--c-primary);
  font-weight: 600;
}

/* Loading */
.loading-mask {
  text-align: center;
  padding: 60px 0;
  color: var(--c-text-secondary);
  font-size: 15px;
}

/* Stat Grid */
.stat-grid {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}

.stat-grid.four-col {
  grid-template-columns: repeat(4, 1fr);
}

.stat-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 18px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  text-align: center;
}

.stat-label {
  font-size: 12px;
  color: var(--c-text-secondary);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
}

.stat-value.money {
  color: var(--c-primary);
}

.stat-change {
  font-size: 12px;
  margin-top: 4px;
}

.stat-change.up {
  color: var(--c-success);
}

.stat-change.down {
  color: var(--c-danger);
}

/* Cards */
.dt-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 18px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 14px;
}

.card-tip {
  font-size: 12px;
  color: var(--c-text-secondary);
  margin: -8px 0 14px;
}

.empty-hint {
  text-align: center;
  color: var(--c-text-secondary);
  padding: 32px 0;
  font-size: 13px;
}

/* Channel Comparison */
.channel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.channel-label {
  font-size: 13px;
  width: 50px;
  flex-shrink: 0;
}

.channel-bar-bg {
  flex: 1;
  height: 20px;
  background: var(--c-bg-muted);
  border-radius: 4px;
  overflow: hidden;
}

.channel-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.channel-bar.live {
  background: var(--c-primary);
}

.channel-bar.video {
  background: var(--c-purple);
}

.channel-pct {
  font-size: 13px;
  font-weight: 600;
  width: 48px;
  text-align: right;
}

.channel-detail {
  font-size: 12px;
  color: var(--c-text-secondary);
  min-width: 160px;
}

/* Session List */
.session-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--c-border);
  cursor: pointer;
  transition: background 0.15s;
}

.session-item:hover {
  background: var(--c-bg-muted);
  margin: 0 -20px;
  padding: 12px 20px;
}

.session-item:last-child {
  border-bottom: none;
}

.session-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-time {
  font-size: 13px;
  font-weight: 500;
}

.session-anchor {
  font-size: 12px;
  color: var(--c-text-secondary);
}

.session-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--c-text-secondary);
}

.session-arrow {
  font-size: 20px;
  color: #ccc;
  margin-left: 8px;
}

/* Heatmap */
.heatmap-wrapper {
  overflow-x: auto;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: 48px repeat(24, 1fr);
  gap: 2px;
  min-width: 600px;
}

.heatmap-corner {
  /* empty top-left corner */
}

.heatmap-col-header,
.heatmap-row-header {
  font-size: 11px;
  color: var(--c-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
}

.heatmap-row-header {
  justify-content: flex-end;
  padding-right: 6px;
}

.heatmap-cell {
  aspect-ratio: 1;
  border-radius: 3px;
  min-height: 22px;
  cursor: default;
  transition: transform 0.1s;
}

.heatmap-cell:hover {
  transform: scale(1.2);
  z-index: 1;
}

/* Anchor Performance */
.anchor-header,
.anchor-row {
  display: grid;
  grid-template-columns: 32px 1fr repeat(6, 80px);
  gap: 4px;
  padding: 8px 0;
  font-size: 13px;
  align-items: center;
}

.anchor-header {
  border-bottom: 1px solid var(--c-border);
  font-weight: 600;
  font-size: 12px;
  color: var(--c-text-secondary);
}

.anchor-row {
  border-bottom: 1px solid var(--c-bg-muted);
}

.anchor-row:last-child {
  border-bottom: none;
}

.anchor-rank {
  text-align: center;
  font-weight: 600;
  color: var(--c-purple);
}

.anchor-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anchor-col {
  text-align: right;
}

.anchor-col.money {
  color: var(--c-primary);
  font-weight: 500;
}

/* Product Rhythm */
.product-rhythm-item,
.product-explain-item {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--c-bg-muted);
}

.product-rhythm-item:last-child,
.product-explain-item:last-child {
  border-bottom: none;
}

.product-pic {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--c-bg-muted);
  flex-shrink: 0;
}

.product-rhythm-info,
.product-explain-info {
  flex: 1;
  min-width: 0;
}

.product-rhythm-name,
.product-explain-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-rhythm-stats,
.product-explain-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--c-text-secondary);
}

.product-rhythm-best {
  margin-top: 6px;
  font-size: 12px;
  color: var(--c-purple);
  font-weight: 500;
}

/* Detail View */
.detail-view {
  margin-bottom: 18px;
}

.back-btn {
  background: none;
  border: none;
  color: var(--c-primary);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 12px;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px;
}

/* Timeslot Chart */
.timeslot-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.timeslot-label {
  font-size: 12px;
  color: var(--c-text-secondary);
  width: 60px;
  text-align: right;
  flex-shrink: 0;
}

.timeslot-bar-bg {
  flex: 1;
  height: 18px;
  background: var(--c-bg-muted);
  border-radius: 4px;
  overflow: hidden;
}

.timeslot-bar {
  height: 100%;
  background: var(--c-primary);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.timeslot-val {
  font-size: 12px;
  width: 36px;
  text-align: right;
  color: var(--c-text-secondary);
}

/* Responsive */
@media (max-width: 768px) {
  .stat-grid.four-col {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .channel-row {
    flex-wrap: wrap;
  }

  .channel-detail {
    width: 100%;
    min-width: auto;
  }

  .anchor-header,
  .anchor-row {
    grid-template-columns: 28px 1fr repeat(3, 64px);
    font-size: 12px;
  }

  .anchor-header > :nth-child(n+5),
  .anchor-row > :nth-child(n+5) {
    display: none;
  }

  .tab-btn {
    padding: 8px 12px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .ks-live-analytics {
    padding: 10px;
  }

  .hero-section {
    padding: 20px 16px;
  }

  .hero-title {
    font-size: 18px;
  }

  .stat-value {
    font-size: 18px;
  }

  .dt-card {
    padding: 14px;
  }

  .session-stats {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
