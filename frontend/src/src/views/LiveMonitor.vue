<template>
  <div class="lb-screen" :class="{ 'lb-screen--empty': !currentRoom }">
    <!-- 未选择直播间 -->
    <div v-if="!currentRoom" class="lb-empty">
      <a-empty description="请添加直播间开始监控">
        <a-button type="primary" @click="showAddRoom = true">添加直播间</a-button>
      </a-empty>
    </div>

    <template v-else>
      <!-- ===== 顶部信息栏 ===== -->
      <div class="lb-header">
        <div class="lb-header__left">
          <img src="" alt="" class="lb-header__avatar" />
          <span class="lb-header__name">{{ currentRoom.nickname }}</span>
          <span class="lb-tag lb-tag--live" v-if="currentRoom.is_living">直播中</span>
          <span class="lb-tag" v-else>未开播</span>
          <span class="lb-header__meta">开播端：抖音</span>
          <span class="lb-header__meta">直播时长：{{ liveDuration }}</span>
        </div>
        <div class="lb-header__right">
          <a-segmented v-model:value="viewMode" :options="[{label:'基础版',value:'basic'},{label:'专业版',value:'pro'}]" size="small" class="lb-mode-switch" />
          <a-select v-model:value="selectedRoomId" size="small" style="width:160px" @change="onRoomChange">
            <a-select-option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.nickname }}</a-select-option>
          </a-select>
          <a-button size="small" @click="showAddRoom = true">+ 添加</a-button>
          <a-button size="small" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
            <svg v-if="!isFullscreen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"/></svg>
          </a-button>
        </div>
      </div>

      <!-- ===== 专业版 ===== -->
      <LiveMonitorPro v-if="viewMode === 'pro'" :d="d" :trendHistory="trendHistory"
        :danmakuList="danmakuList" :products="products" :streamInfo="streamInfo"
        :currentRoom="currentRoom" :formatNum="formatNum" :formatMoney="formatMoney" :formatBigMoney="formatBigMoney" />

      <!-- ===== 基础版三栏主体 ===== -->
      <div v-else class="lb-body">
        <!-- 左栏 -->
        <div class="lb-col lb-col--left">
          <div class="lb-panel">
            <div class="lb-panel__title">成交趋势</div>
            <div class="lb-panel__legend">
              <span class="lb-legend-dot" style="background:#5B8FF9"></span>成交订单数
              <span class="lb-legend-dot" style="background:#5AD8A6;margin-left:12px"></span>成交人数
            </div>
            <div ref="trendChartRef" class="lb-chart" style="height:160px"></div>
          </div>
          <div class="lb-panel">
            <div class="lb-panel__title">流量分析 <span class="lb-badge">全域投放</span></div>
            <div ref="trafficChartRef" class="lb-chart" style="height:180px"></div>
          </div>
          <div class="lb-panel">
            <div class="lb-panel__title">千川投产</div>
            <div class="lb-roi-grid">
              <div class="lb-roi-item"><span class="lb-roi-val lb-c-red">¥{{ formatMoney(d.qianchuan_cost) }}</span><span class="lb-roi-label">千川消耗</span></div>
              <div class="lb-roi-item"><span class="lb-roi-val lb-c-green">{{ Number(d.qianchuan_roi||0).toFixed(2) }}</span><span class="lb-roi-label">ROI</span></div>
              <div class="lb-roi-item"><span class="lb-roi-val">{{ formatNum(d.paid_uv) }}</span><span class="lb-roi-label">付费UV</span></div>
              <div class="lb-roi-item"><span class="lb-roi-val">¥{{ formatMoney(d.paid_gmv) }}</span><span class="lb-roi-label">付费GMV</span></div>
            </div>
          </div>
        </div>

        <!-- 中栏 -->
        <div class="lb-col lb-col--center">
          <!-- 紫色GMV大卡 -->
          <div class="lb-gmv-card">
            <div class="lb-gmv-card__row">
              <div class="lb-gmv-card__main">
                <div class="lb-gmv-card__label">直播间用户支付金额</div>
                <div class="lb-gmv-card__amount">¥{{ formatBigMoney(d.gmv) }}</div>
              </div>
            </div>
            <div class="lb-gmv-card__stats">
              <div class="lb-stat"><span class="lb-stat__val">{{ formatNum(d.order_count) }}</span><span class="lb-stat__label">成交件数</span></div>
              <div class="lb-stat"><span class="lb-stat__val">{{ formatNum(d.cart_count) }}</span><span class="lb-stat__label">加购人数</span></div>
              <div class="lb-stat"><span class="lb-stat__val">{{ d.product_click > 0 ? ((d.order_count / d.product_click) * 100).toFixed(2) + '%' : '0%' }}</span><span class="lb-stat__label">点击-成交转化率</span></div>
              <div class="lb-stat"><span class="lb-stat__val">¥{{ formatMoney(d.gpm) }}</span><span class="lb-stat__label">千次观看支付金额</span></div>
            </div>
            <div class="lb-gmv-card__stats">
              <div class="lb-stat"><span class="lb-stat__val">{{ formatNum(d.online_count) }}</span><span class="lb-stat__label">实时在线人数</span></div>
              <div class="lb-stat"><span class="lb-stat__val">{{ formatNum(d.total_viewers) }}</span><span class="lb-stat__label">累计观看人数</span></div>
              <div class="lb-stat"><span class="lb-stat__val">{{ formatNum(d.product_click) }}</span><span class="lb-stat__label">商品点击量</span></div>
              <div class="lb-stat"><span class="lb-stat__val">{{ d.avg_stay || '0s' }}</span><span class="lb-stat__label">人均观看时长</span></div>
            </div>
          </div>

          <!-- 商品列表 -->
          <div class="lb-panel lb-panel--table">
            <div class="lb-panel__title">当前购物车商品</div>
            <div class="lb-product-table">
              <table>
                <thead>
                  <tr><th>商品</th><th>到手价</th><th>点击转化率</th><th>成交转化率</th><th>累计支付金额</th><th>成交订单数</th></tr>
                </thead>
                <tbody>
                  <tr v-if="!products.length"><td colspan="6" style="text-align:center;padding:24px;color:#666">暂无商品数据</td></tr>
                  <tr v-for="(p, idx) in products" :key="idx">
                    <td><div class="lb-product-name">{{ p.product_name || p.name }}</div></td>
                    <td>¥{{ Number(p.price || 0).toFixed(2) }}</td>
                    <td>{{ p.click_cvr || '0%' }}</td>
                    <td>{{ p.pay_cvr || '0%' }}</td>
                    <td>¥{{ formatMoney(p.pay_amount) }}</td>
                    <td>{{ p.order_count || p.pay_count || 0 }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 右栏 -->
        <div class="lb-col lb-col--right">
          <!-- 转化漏斗 -->
          <div class="lb-panel">
            <div class="lb-panel__title">转化漏斗</div>
            <div class="lb-funnel">
              <div class="lb-funnel-item" style="--w:100%;--c:#5B8FF9">
                <span class="lb-funnel-val">{{ formatNum(d.total_viewers || d.paid_uv) }}</span>
                <span class="lb-funnel-label">曝光人数</span>
              </div>
              <div class="lb-funnel-item" style="--w:80%;--c:#36CFC9">
                <span class="lb-funnel-val">{{ formatNum(d.enter_count || d.paid_uv) }}</span>
                <span class="lb-funnel-label">进入直播间</span>
              </div>
              <div class="lb-funnel-item" style="--w:60%;--c:#F6BD16">
                <span class="lb-funnel-val">{{ formatNum(d.product_click) }}</span>
                <span class="lb-funnel-label">商品点击</span>
              </div>
              <div class="lb-funnel-item" style="--w:40%;--c:#FF8A00">
                <span class="lb-funnel-val">{{ formatNum(d.cart_count) }}</span>
                <span class="lb-funnel-label">加购</span>
              </div>
              <div class="lb-funnel-item" style="--w:25%;--c:#FF4D4F">
                <span class="lb-funnel-val">{{ formatNum(d.order_count) }}</span>
                <span class="lb-funnel-label">成交</span>
              </div>
            </div>
          </div>

          <!-- 直播画面 + 实时评论 -->
          <div class="lb-panel lb-panel--live">
            <div class="lb-panel__title">实时评论</div>
            <div class="lb-live-preview">
              <video ref="liveVideoRef" class="lb-live-video" autoplay muted playsinline
                :poster="streamInfo.cover" @click="toggleMute"></video>
              <div class="lb-live-badge" v-if="currentRoom.is_living">LIVE</div>
            </div>
            <div class="lb-danmaku-stream">
              <div v-for="(msg, idx) in danmakuList" :key="idx" class="lb-danmaku-item">
                <span class="lb-danmaku-user">{{ msg.user }}</span>
                <span class="lb-danmaku-text">{{ msg.text }}</span>
              </div>
              <div v-if="!danmakuList.length" class="lb-danmaku-empty">暂无评论</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 添加直播间 -->
    <a-drawer v-model:open="showAddRoom" title="添加直播间" :width="isMobile ? '100%' : 420" placement="right">
      <a-form :model="roomForm" layout="vertical">
        <a-form-item label="直播间ID / 链接"><a-textarea v-model:value="roomForm.room_ids" placeholder="输入直播间ID或链接，每行一个" :rows="3" /></a-form-item>
        <a-form-item label="主播昵称"><a-input v-model:value="roomForm.nickname" placeholder="输入主播昵称" /></a-form-item>
        <a-form-item label="监控模式">
          <a-radio-group v-model:value="roomForm.mode">
            <a-radio value="realtime">实时值守</a-radio><a-radio value="auto">开播自动</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <a-button @click="showAddRoom = false">取消</a-button>
        <a-button type="primary" :loading="submitting" @click="addRooms">添加</a-button>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'
import flvjs from 'flv.js'
import LiveMonitorPro from './LiveMonitorPro.vue'

const viewMode = ref('basic')

const isMobile = ref(window.innerWidth < 768)
const _onResize = () => { isMobile.value = window.innerWidth < 768 }

// ===== State =====
const rooms = ref([])
const currentRoom = ref(null)
const selectedRoomId = ref(null)
const showAddRoom = ref(false)
const submitting = ref(false)
const roomForm = reactive({ room_ids: '', nickname: '', mode: 'realtime' })
const d = ref({ online_count: 0, peak_count: 0, total_viewers: 0, avg_stay: '0s', interact_rate: 0,
  comment_count: 0, like_count: 0, share_count: 0, product_click: 0, cart_count: 0,
  order_count: 0, gmv: 0, uv_value: 0, gpm: 0, online_trend: 0,
  qianchuan_cost: 0, qianchuan_roi: 0, paid_uv: 0, paid_gmv: 0, enter_count: 0 })
const danmakuList = ref([])
const products = ref([])
const streamInfo = ref({ flv: '', hls: '', cover: '', title: '' })
const liveVideoRef = ref(null)
const isFullscreen = ref(false)
let flvPlayer = null
let refreshTimer = null

const toggleFullscreen = () => {
  const el = document.querySelector('.lb-screen')
  if (!document.fullscreenElement) {
    el?.requestFullscreen?.().then(() => { isFullscreen.value = true })
  } else {
    document.exitFullscreen?.().then(() => { isFullscreen.value = false })
  }
}
const _onFsChange = () => { isFullscreen.value = !!document.fullscreenElement }

// ===== Charts =====
const trendChartRef = ref(null)
const trafficChartRef = ref(null)
let trendChart, trafficChart

// ===== Computed =====
const liveDuration = computed(() => {
  if (!currentRoom.value?.last_check_at) return '-'
  const start = new Date(currentRoom.value.created_at)
  const now = new Date()
  const diff = Math.floor((now - start) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
})

// ===== Formatters =====
const formatNum = (n) => { n = Number(n || 0); if (n >= 10000) return (n / 10000).toFixed(1) + '万'; return n.toLocaleString() }
const formatMoney = (n) => { n = Number(n || 0); if (n >= 10000) return (n / 10000).toFixed(2) + '万'; return n.toFixed(2) }
const formatBigMoney = (n) => { n = Number(n || 0); return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }

// ===== Trend History =====
const trendHistory = ref([])

const loadTrendHistory = async () => {
  if (!currentRoom.value?.id) return
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/timeslot`, { params: { date: new Date().toISOString().split('T')[0] } })
    trendHistory.value = res?.data || []
  } catch (e) { /* empty */ }
}

// ===== Data Loading =====
const loadRooms = async () => {
  try {
    const res = await request.get('/live/rooms')
    rooms.value = res?.data || []
    if (rooms.value.length && !currentRoom.value) {
      selectedRoomId.value = rooms.value[0].id
      selectRoom(rooms.value[0])
    }
  } catch (e) { console.warn(e) }
}

const selectRoom = async (room) => {
  destroyFlvPlayer()
  currentRoom.value = room
  await loadLiveData()
  await loadTrendHistory()
  await nextTick()
  initCharts()
  if (room.is_living) loadStreamUrl()
  loadDanmaku()
  loadProducts()
}

const onRoomChange = (id) => {
  const room = rooms.value.find(r => r.id === id)
  if (room) selectRoom(room)
}

const loadLiveData = async () => {
  if (!currentRoom.value?.id) return
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/realtime`)
    if (res?.data) d.value = res.data
  } catch (e) { /* keep current data */ }
}

const loadDanmaku = async () => {
  if (!currentRoom.value?.id) return
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/danmaku`, { params: { limit: 30 } })
    if (res?.data?.length) {
      danmakuList.value = res.data.map(m => ({
        user: m.user || '观众', text: m.text || '',
        time: m.time ? new Date(m.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
      }))
    }
  } catch (e) { /* empty */ }
}

const loadProducts = async () => {
  if (!currentRoom.value?.id) return
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/products`)
    if (res?.data?.length) products.value = res.data
  } catch (e) { /* empty */ }
}

const loadStreamUrl = async () => {
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/stream`)
    if (res?.data?.flv || res?.data?.hls) {
      streamInfo.value = res.data
      await nextTick()
      initFlvPlayer()
    }
  } catch (e) { /* no stream */ }
}

// ===== FLV Player =====
const initFlvPlayer = () => {
  destroyFlvPlayer()
  const el = liveVideoRef.value
  if (!el || !streamInfo.value.flv) return
  if (!flvjs.isSupported()) { if (streamInfo.value.hls) { el.src = streamInfo.value.hls; el.play().catch(() => {}) }; return }
  const proxyUrl = `/api/live/stream-proxy?url=${encodeURIComponent(streamInfo.value.flv)}`
  flvPlayer = flvjs.createPlayer({ type: 'flv', url: proxyUrl, isLive: true, hasAudio: true, hasVideo: true },
    { enableWorker: false, enableStashBuffer: false, stashInitialSize: 128, autoCleanupSourceBuffer: true })
  flvPlayer.attachMediaElement(el); flvPlayer.load(); flvPlayer.play().catch(() => {})
  flvPlayer.on(flvjs.Events.ERROR, () => { setTimeout(() => { if (currentRoom.value?.is_living) loadStreamUrl() }, 5000) })
}
const destroyFlvPlayer = () => {
  if (flvPlayer) { try { flvPlayer.pause(); flvPlayer.unload(); flvPlayer.detachMediaElement(); flvPlayer.destroy() } catch(e) {} flvPlayer = null }
}
const toggleMute = () => { if (liveVideoRef.value) liveVideoRef.value.muted = !liveVideoRef.value.muted }

// ===== Charts =====
const initCharts = () => {
  // 成交趋势 - 用真实历史数据
  if (trendChartRef.value) {
    trendChart?.dispose()
    trendChart = echarts.init(trendChartRef.value)
    // 从历史数据计算每5分钟增量
    const raw = trendHistory.value
    const buckets = {}
    for (const row of raw) {
      const t = new Date(row.recorded_at)
      const mins = Math.floor(t.getMinutes() / 5) * 5
      const key = String(t.getHours()).padStart(2, '0') + ':' + String(mins).padStart(2, '0')
      buckets[key] = { orders: Number(row.order_count || 0), gmv: Number(row.gmv || 0) }
    }
    const sorted = Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]))
    const times = sorted.map(s => s[0])
    const orderDeltas = sorted.map((s, i) => i === 0 ? s[1].orders : Math.max(0, s[1].orders - sorted[i - 1][1].orders))
    const gmvDeltas = sorted.map((s, i) => i === 0 ? Math.round(s[1].gmv) : Math.max(0, Math.round(s[1].gmv - sorted[i - 1][1].gmv)))

    trendChart.setOption({
      tooltip: { trigger: 'axis' }, grid: { left: 40, right: 35, top: 10, bottom: 20 },
      xAxis: { type: 'category', data: times, axisLabel: { color: '#8B9DC3', fontSize: 10, rotate: times.length > 30 ? 45 : 0 }, axisLine: { lineStyle: { color: '#2A3F5F' } } },
      yAxis: [
        { type: 'value', name: 'GMV', axisLabel: { color: '#8B9DC3', fontSize: 10 }, splitLine: { lineStyle: { color: '#1E2D4A' } } },
        { type: 'value', name: '订单', axisLabel: { color: '#8B9DC3', fontSize: 10 }, splitLine: { show: false } }
      ],
      series: [
        { name: 'GMV', type: 'bar', itemStyle: { color: '#5B8FF9', borderRadius: [3, 3, 0, 0] }, data: gmvDeltas },
        { name: '订单量', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#FF8A00', width: 2 }, itemStyle: { color: '#FF8A00' }, data: orderDeltas },
      ]
    })
  }
  // 流量分析饼图
  if (trafficChartRef.value) {
    trafficChart?.dispose()
    trafficChart = echarts.init(trafficChartRef.value)
    const paidUv = Number(d.value.paid_uv || 0)
    const totalUv = Number(d.value.total_viewers || paidUv || 1)
    const organicUv = Math.max(0, totalUv - paidUv)
    trafficChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { color: '#8B9DC3', fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['35%', '50%'], label: { show: false },
        data: [
          { value: Math.round(organicUv * 0.5), name: '直播推荐', itemStyle: { color: '#5B8FF9' } },
          { value: Math.round(organicUv * 0.25), name: '短视频引流', itemStyle: { color: '#5AD8A6' } },
          { value: paidUv, name: '千川付费', itemStyle: { color: '#F6BD16' } },
          { value: Math.round(organicUv * 0.15), name: '关注', itemStyle: { color: '#6DC8EC' } },
          { value: Math.round(organicUv * 0.1), name: '其他', itemStyle: { color: '#945FB9' } },
        ]
      }]
    })
  }
}

// ===== Add Room =====
const addRooms = async () => {
  if (!roomForm.room_ids?.trim()) { message.warning('请输入直播间ID'); return }
  submitting.value = true
  try {
    await request.post('/live/rooms', { room_ids: roomForm.room_ids.split('\n').map(s => s.trim()).filter(Boolean), nickname: roomForm.nickname, mode: roomForm.mode })
    message.success('添加成功'); showAddRoom.value = false; roomForm.room_ids = ''; roomForm.nickname = ''; await loadRooms()
  } catch (e) { message.error('添加失败') }
  finally { submitting.value = false }
}

// ===== Lifecycle =====
onMounted(() => { window.addEventListener("resize", _onResize); document.addEventListener("fullscreenchange", _onFsChange);
  loadRooms()
  refreshTimer = setInterval(async () => {
    if (currentRoom.value) {
      await loadLiveData(); loadDanmaku()
      // 每30秒更新一次趋势图
      if (Date.now() % 30000 < 5000) { await loadTrendHistory(); await nextTick(); initCharts() }
    }
  }, 5000)
})
onUnmounted(() => { window.removeEventListener("resize", _onResize); document.removeEventListener("fullscreenchange", _onFsChange); clearInterval(refreshTimer); destroyFlvPlayer(); trendChart?.dispose(); trafficChart?.dispose() })
</script>

<style scoped>
.lb-screen { background: #0D1B2A; min-height: 100vh; color: #E0E6ED; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
.lb-screen--empty { display: flex; align-items: center; justify-content: center; }
.lb-empty { text-align: center; padding: 80px; }

/* Header */
.lb-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #111D2E; border-bottom: 1px solid #1E2D4A; }
.lb-header__left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lb-header__avatar { width: 28px; height: 28px; border-radius: 50%; background: #2A3F5F; }
.lb-header__name { font-size: 15px; font-weight: 600; color: #fff; }
.lb-header__meta { font-size: 12px; color: #6B7D99; }
.lb-header__right { display: flex; gap: 8px; align-items: center; }
.lb-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #2A3F5F; color: #6B7D99; }
.lb-tag--live { background: #FF4D4F; color: #fff; animation: livePulse 2s infinite; }
@keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }

/* Body - 3 columns */
.lb-body { display: grid; grid-template-columns: 260px 1fr 280px; gap: 12px; padding: 12px; min-height: calc(100vh - 52px); }

/* Panels */
.lb-panel { background: #111D2E; border-radius: 8px; padding: 14px; margin-bottom: 12px; border: 1px solid #1E2D4A; }
.lb-panel__title { font-size: 13px; font-weight: 600; color: #C8D6E5; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.lb-panel--table { padding: 14px 0; }
.lb-panel--table .lb-panel__title { padding: 0 14px; }
.lb-panel--live { padding: 14px 0 0; display: flex; flex-direction: column; flex: 1; }
.lb-panel--live .lb-panel__title { padding: 0 14px 10px; }
.lb-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: rgba(91,143,249,0.15); color: #5B8FF9; font-weight: 500; }
.lb-chart { width: 100%; }
.lb-panel__legend { font-size: 11px; color: #6B7D99; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
.lb-legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

/* GMV Card */
.lb-gmv-card { background: linear-gradient(135deg, #3A1C71 0%, #6B3FA0 50%, #3A1C71 100%); border-radius: 10px; padding: 20px; margin-bottom: 12px; }
.lb-gmv-card__label { font-size: 13px; color: rgba(255,255,255,0.7); }
.lb-gmv-card__amount { font-size: 36px; font-weight: 700; color: #fff; margin: 4px 0 16px; letter-spacing: 1px; }
.lb-gmv-card__stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; }
.lb-gmv-card__stats:first-of-type { border-top: none; margin-top: 0; }
.lb-stat { text-align: center; }
.lb-stat__val { display: block; font-size: 18px; font-weight: 700; color: #fff; }
.lb-stat__label { display: block; font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; }

/* ROI Grid */
.lb-roi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lb-roi-item { text-align: center; padding: 8px; background: #0D1B2A; border-radius: 6px; }
.lb-roi-val { display: block; font-size: 16px; font-weight: 700; color: #E0E6ED; }
.lb-roi-label { display: block; font-size: 10px; color: #6B7D99; margin-top: 2px; }
.lb-c-red { color: #FF6B6B; }
.lb-c-green { color: #5AD8A6; }

/* Funnel */
.lb-funnel { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.lb-funnel-item { width: var(--w); background: var(--c); border-radius: 4px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; transition: width 0.3s; }
.lb-funnel-val { font-size: 16px; font-weight: 700; color: #fff; }
.lb-funnel-label { font-size: 11px; color: rgba(255,255,255,0.85); }

/* Product Table */
.lb-product-table { overflow-x: auto; }
.lb-product-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
.lb-product-table th { padding: 8px 12px; text-align: left; color: #6B7D99; font-weight: 500; border-bottom: 1px solid #1E2D4A; white-space: nowrap; }
.lb-product-table td { padding: 10px 12px; border-bottom: 1px solid #1E2D4A; color: #C8D6E5; }
.lb-product-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Live Preview */
.lb-live-preview { position: relative; background: #000; margin: 0 0 0; }
.lb-live-video { width: 100%; height: 200px; object-fit: contain; background: #000; cursor: pointer; }
.lb-live-badge { position: absolute; top: 8px; left: 8px; background: #FF4D4F; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 3px; letter-spacing: 1px; }

/* Danmaku Stream */
.lb-danmaku-stream { flex: 1; max-height: 300px; overflow-y: auto; padding: 8px 14px; }
.lb-danmaku-item { padding: 4px 0; font-size: 12px; line-height: 1.5; }
.lb-danmaku-user { color: #5B8FF9; font-weight: 500; margin-right: 6px; }
.lb-danmaku-text { color: #C8D6E5; }
.lb-danmaku-empty { text-align: center; color: #4A5568; padding: 20px; font-size: 12px; }

/* Columns */
.lb-col--left { display: flex; flex-direction: column; }
.lb-col--center { display: flex; flex-direction: column; }
.lb-col--right { display: flex; flex-direction: column; }

/* Mobile */
@media (max-width: 1024px) {
  .lb-body { grid-template-columns: 1fr; }
  .lb-gmv-card__stats { grid-template-columns: repeat(2, 1fr); }
  .lb-gmv-card__amount { font-size: 28px; }
  .lb-header { flex-direction: column; gap: 8px; }
  .lb-header__left { justify-content: center; }
}

/* Ant Design dark overrides */
:deep(.ant-select-selector) { background: #1E2D4A !important; border-color: #2A3F5F !important; color: #C8D6E5 !important; }
:deep(.ant-select-arrow) { color: #6B7D99 !important; }
:deep(.ant-select-dropdown) { background: #1E2D4A; }
:deep(.ant-select-item) { color: #C8D6E5; }
:deep(.ant-select-item-option-active) { background: #2A3F5F; }
:deep(.ant-btn-default) { background: #1E2D4A; border-color: #2A3F5F; color: #C8D6E5; }
:deep(.ant-drawer-content) { background: #111D2E; }
:deep(.ant-drawer-header) { background: #111D2E; border-color: #1E2D4A; }
:deep(.ant-drawer-title) { color: #E0E6ED; }
:deep(.ant-drawer-close) { color: #6B7D99; }
:deep(.ant-form-item-label > label) { color: #C8D6E5; }
:deep(.ant-input), :deep(.ant-input-affix-wrapper), :deep(textarea.ant-input) { background: #1E2D4A; border-color: #2A3F5F; color: #E0E6ED; }
:deep(.ant-radio-wrapper) { color: #C8D6E5; }
.lb-mode-switch { margin-right: 8px; }
:deep(.lb-mode-switch .ant-segmented) { background: #1E2D4A; }
:deep(.lb-mode-switch .ant-segmented-item) { color: #8B9DC3; }
:deep(.lb-mode-switch .ant-segmented-item-selected) { background: #5B8FF9; color: #fff; }
</style>
