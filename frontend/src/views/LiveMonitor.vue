<template>
  <div class="live-monitor">
    <div class="page-header">
      <h2 class="page-title">实时监控</h2>
      <div class="page-header__actions">
        <a-button type="primary" @click="showAddRoom = true">
          <template #icon><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></template>
          添加直播间
        </a-button>
        <a-button @click="loadRooms">
          <template #icon><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></template>
          刷新
        </a-button>
      </div>
    </div>

    <!-- Room Selector Tabs -->
    <div class="room-tabs" v-if="rooms.length">
      <div class="room-tab" v-for="room in rooms" :key="room.id"
        :class="{ 'room-tab--active': currentRoom?.id === room.id }"
        @click="selectRoom(room)">
        <span class="room-tab__status" :class="{ 'room-tab__status--live': room.is_living }"></span>
        <span class="room-tab__name">{{ room.nickname || room.room_id }}</span>
        <span class="room-tab__viewers" v-if="room.is_living">{{ formatNum(room.online_count) }}</span>
      </div>
    </div>

    <!-- Live Big Screen -->
    <div v-if="currentRoom" class="monitor-grid">
      <!-- Live Preview + Metrics Layout -->
      <div class="live-top-section">
        <!-- Live Stream Preview -->
        <div class="live-preview-card">
          <div class="live-preview-header">
            <span class="live-badge" :class="{ 'live-badge--on': currentRoom.is_living }">
              {{ currentRoom.is_living ? 'LIVE' : '未开播' }}
            </span>
            <span class="live-preview-title">{{ currentRoom.nickname }}</span>
          </div>
          <div class="live-preview-body">
            <!-- 直播视频播放器 -->
            <div class="live-player-wrap" v-if="streamInfo.flv || streamInfo.hls">
              <video ref="liveVideoRef" class="live-video" autoplay muted playsinline
                :poster="streamInfo.cover" @click="toggleMute"></video>
              <div class="live-player-overlay">
                <div class="live-title-bar">{{ streamInfo.title }}</div>
                <div class="live-player-controls">
                  <button class="player-btn" @click.stop="toggleMute" :title="isMuted ? '开启声音' : '静音'">
                    <svg v-if="isMuted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                  <a :href="'https://live.douyin.com/' + (streamInfo.web_rid || currentRoom.room_id || '')" target="_blank" class="player-btn" title="新窗口打开">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                </div>
              </div>
            </div>
            <!-- 未获取到流地址时的占位 -->
            <div class="live-preview-content" v-else>
              <div class="live-status-info">
                <div class="live-status-icon">
                  <svg v-if="currentRoom.is_living" width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#ff4d4f" stroke-width="1.5" opacity="0.3"/>
                    <circle cx="12" cy="12" r="6" stroke="#ff4d4f" stroke-width="1.5" opacity="0.6"/>
                    <circle cx="12" cy="12" r="3" fill="#ff4d4f"/>
                  </svg>
                  <svg v-else width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><polygon points="16,10 22,6 22,18 16,14"/>
                  </svg>
                </div>
                <div class="live-status-text">
                  <span class="live-status-label">{{ streamLoading ? '正在加载直播画面...' : (currentRoom.is_living ? '全域推广投放中' : '直播间未开播') }}</span>
                </div>
              </div>
              <div class="live-preview-actions">
                <a :href="'https://live.douyin.com/' + (currentRoom.room_id || '')" target="_blank" class="live-action-btn live-action-btn--primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  观看直播
                </a>
                <a href="https://qianchuan.jinritemai.com" target="_blank" class="live-action-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
                  千川后台
                </a>
              </div>
            </div>
          </div>
        </div>
        <!-- Core Metrics -->
        <div class="metrics-side">
          <div class="metric-card metric-card--primary">
            <div class="metric-card__value">¥{{ formatMoney(liveData.gmv) }}</div>
            <div class="metric-card__label">实时GMV</div>
          </div>
          <div class="metric-card metric-card--warning">
            <div class="metric-card__value">¥{{ formatMoney(liveData.qianchuan_cost) }}</div>
            <div class="metric-card__label">千川消耗</div>
          </div>
          <div class="metric-card" :class="{ 'metric-card--success': Number(liveData.qianchuan_roi) >= 2, 'metric-card--danger': Number(liveData.qianchuan_roi) < 1.5 }">
            <div class="metric-card__value">{{ Number(liveData.qianchuan_roi || 0).toFixed(2) }}</div>
            <div class="metric-card__label">投产ROI</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__value">{{ formatNum(liveData.order_count) }}</div>
            <div class="metric-card__label">订单数</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__value">{{ formatNum(liveData.total_viewers) }}</div>
            <div class="metric-card__label">付费UV</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__value">{{ formatNum(liveData.product_click) }}</div>
            <div class="metric-card__label">商品点击</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__value">{{ formatNum(liveData.cart_count) }}</div>
            <div class="metric-card__label">加购数</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__value">{{ liveData.order_count > 0 && liveData.product_click > 0 ? ((liveData.order_count / liveData.product_click) * 100).toFixed(1) + '%' : '0%' }}</div>
            <div class="metric-card__label">转化率</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <a-card class="chart-card" title="在线人数趋势" :bordered="false">
          <div ref="onlineChartRef" class="chart-container"></div>
        </a-card>
        <a-card class="chart-card" title="流量来源分布" :bordered="false">
          <div ref="sourceChartRef" class="chart-container"></div>
        </a-card>
      </div>

      <!-- Sales & Conversion Row -->
      <div class="charts-row">
        <a-card class="chart-card" title="GMV & 订单趋势" :bordered="false">
          <div ref="gmvChartRef" class="chart-container"></div>
        </a-card>
        <a-card class="chart-card" title="转化漏斗" :bordered="false">
          <div class="funnel-list">
            <div class="funnel-item" v-for="(item, idx) in funnelData" :key="idx">
              <div class="funnel-item__bar" :style="{ width: item.pct + '%', background: funnelColors[idx] }"></div>
              <div class="funnel-item__info">
                <span class="funnel-item__name">{{ item.name }}</span>
                <span class="funnel-item__value">{{ formatNum(item.value) }} ({{ item.pct }}%)</span>
              </div>
            </div>
          </div>
        </a-card>
      </div>

      <!-- Real-time Danmaku Stream -->
      <a-card title="实时弹幕" :bordered="false" class="danmaku-card">
        <div class="danmaku-stream">
          <div class="danmaku-item" v-for="(msg, idx) in danmakuList" :key="idx">
            <span class="danmaku-item__time">{{ msg.time }}</span>
            <span class="danmaku-item__user">{{ msg.user }}</span>
            <span class="danmaku-item__text">{{ msg.text }}</span>
          </div>
          <a-empty v-if="!danmakuList.length" description="暂无弹幕数据" />
        </div>
      </a-card>
    </div>

    <div v-else class="empty-state">
      <a-empty description="请添加直播间开始监控">
        <a-button type="primary" @click="showAddRoom = true">添加直播间</a-button>
      </a-empty>
    </div>

    <!-- Add Room Drawer -->
    <a-drawer
      v-model:open="showAddRoom"
      title="添加直播间"
      :width="isMobile ? '100%' : 480"
      placement="right"
    >
      <a-form :model="roomForm" layout="vertical">
        <a-form-item label="直播间ID / 链接">
          <a-textarea v-model:value="roomForm.room_ids" placeholder="输入直播间ID或链接，每行一个" :rows="4" />
        </a-form-item>
        <a-form-item label="主播昵称（可选）">
          <a-input v-model:value="roomForm.nickname" placeholder="输入主播昵称搜索" />
        </a-form-item>
        <a-form-item label="监控模式">
          <a-radio-group v-model:value="roomForm.mode">
            <a-radio value="realtime">实时值守</a-radio>
            <a-radio value="schedule">预约监控</a-radio>
            <a-radio value="auto">开播自动抓取</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="roomForm.mode === 'schedule'" label="监控时段">
          <a-range-picker v-model:value="roomForm.schedule_time" show-time format="YYYY-MM-DD HH:mm" />
        </a-form-item>
      </a-form>
      <div class="drawer-footer">
        <a-button @click="showAddRoom = false" style="margin-right: 8px">取消</a-button>
        <a-button type="primary" :loading="submitting" @click="addRooms">添加监控</a-button>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'
import flvjs from 'flv.js'

const isMobile = ref(window.innerWidth < 768)
const handleResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))

const rooms = ref([])
const currentRoom = ref(null)
const showAddRoom = ref(false)
const submitting = ref(false)
const roomForm = reactive({ room_ids: '', nickname: '', mode: 'realtime', schedule_time: null })

const liveData = ref({
  online_count: 0, peak_count: 0, total_viewers: 0, avg_stay: '0s',
  interact_rate: 0, comment_count: 0, product_click: 0, gmv: 0, online_trend: 0
})
const danmakuList = ref([])
const funnelData = ref([
  { name: '曝光人数', value: 15820, pct: 100 },
  { name: '进入直播间', value: 8930, pct: 56 },
  { name: '商品点击', value: 2680, pct: 17 },
  { name: '加购', value: 890, pct: 6 },
  { name: '成交', value: 356, pct: 2 },
])
const funnelColors = ['#1677FF', '#4096FF', '#69B1FF', '#91CAFF', '#BAE0FF']

const liveVideoRef = ref(null)
const streamInfo = ref({ flv: '', hls: '', cover: '', title: '', web_rid: '' })
const streamLoading = ref(false)
const isMuted = ref(true)
let flvPlayer = null

const loadStreamUrl = async () => {
  if (!currentRoom.value?.id) return
  streamLoading.value = true
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/stream`)
    if (res?.data?.flv || res?.data?.hls) {
      streamInfo.value = res.data
      await nextTick()
      initFlvPlayer()
    }
  } catch (e) {
    console.warn('Stream load failed:', e)
  } finally {
    streamLoading.value = false
  }
}

const initFlvPlayer = () => {
  destroyFlvPlayer()
  const videoEl = liveVideoRef.value
  if (!videoEl) return

  const flvUrl = streamInfo.value.flv
  if (!flvUrl || !flvjs.isSupported()) {
    // 降级到HLS
    if (streamInfo.value.hls) {
      videoEl.src = streamInfo.value.hls
      videoEl.play().catch(() => {})
    }
    return
  }

  // 通过后端代理解决跨域
  const proxyUrl = `/api/live/stream-proxy?url=${encodeURIComponent(flvUrl)}`

  flvPlayer = flvjs.createPlayer({
    type: 'flv',
    url: proxyUrl,
    isLive: true,
    hasAudio: true,
    hasVideo: true,
  }, {
    enableWorker: false,
    enableStashBuffer: false,
    stashInitialSize: 128,
    lazyLoad: false,
    autoCleanupSourceBuffer: true,
  })
  flvPlayer.attachMediaElement(videoEl)
  flvPlayer.load()
  flvPlayer.play().catch(() => {})

  flvPlayer.on(flvjs.Events.ERROR, () => {
    console.warn('FLV player error, retrying...')
    setTimeout(() => { if (currentRoom.value?.is_living) loadStreamUrl() }, 5000)
  })
}

const destroyFlvPlayer = () => {
  if (flvPlayer) {
    try {
      flvPlayer.pause()
      flvPlayer.unload()
      flvPlayer.detachMediaElement()
      flvPlayer.destroy()
    } catch (e) { /* ignore */ }
    flvPlayer = null
  }
}

const toggleMute = () => {
  isMuted.value = !isMuted.value
  if (liveVideoRef.value) liveVideoRef.value.muted = isMuted.value
}

const onlineChartRef = ref(null)
const sourceChartRef = ref(null)
const gmvChartRef = ref(null)
let onlineChart, sourceChart, gmvChart
let refreshTimer = null

const formatNum = (n) => {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n.toLocaleString()
}
const formatMoney = (n) => {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(2) + 'w'
  return n.toFixed(2)
}

const loadRooms = async () => {
  try {
    const res = await request.get('/live/rooms')
    rooms.value = res?.data || []
    if (rooms.value.length && !currentRoom.value) {
      selectRoom(rooms.value[0])
    }
  } catch (e) {
    // Demo data
    rooms.value = [
      { id: 1, room_id: '7312345678', nickname: '好物推荐官', is_living: true, online_count: 3580, mode: 'realtime' },
      { id: 2, room_id: '7398765432', nickname: '美妆达人小美', is_living: true, online_count: 1260, mode: 'auto' },
      { id: 3, room_id: '7356781234', nickname: '食品旗舰店', is_living: false, online_count: 0, mode: 'schedule' },
    ]
    if (!currentRoom.value) selectRoom(rooms.value[0])
  }
}

const selectRoom = async (room) => {
  destroyFlvPlayer()
  streamInfo.value = { flv: '', hls: '', cover: '', title: '', web_rid: '' }
  currentRoom.value = room
  await loadLiveData()
  await nextTick()
  initCharts()
  if (room.is_living) loadStreamUrl()
}

const loadLiveData = async () => {
  try {
    const res = await request.get(`/live/rooms/${currentRoom.value.id}/realtime`)
    if (res?.data) liveData.value = res.data
  } catch {
    // Demo data
    liveData.value = {
      online_count: 3580, peak_count: 5230, total_viewers: 28900, avg_stay: '2m30s',
      interact_rate: 8.5, comment_count: 1890, product_click: 4560, gmv: 186500, online_trend: 120
    }
    danmakuList.value = [
      { time: '14:32:05', user: '用户A', text: '这个颜色好好看！' },
      { time: '14:32:08', user: '小甜心', text: '怎么下单？' },
      { time: '14:32:12', user: '购物狂', text: '已经拍了三件了' },
      { time: '14:32:15', user: '新来的', text: '有什么优惠吗' },
      { time: '14:32:18', user: '老粉丝', text: '主播推荐的都好用' },
      { time: '14:32:22', user: '路过看看', text: '这个真的好用吗' },
      { time: '14:32:25', user: '剁手党', text: '第二件半价吗' },
      { time: '14:32:30', user: '闺蜜推荐', text: '加购了！' },
    ]
  }
}

const initCharts = () => {
  if (onlineChartRef.value) {
    onlineChart?.dispose()
    onlineChart = echarts.init(onlineChartRef.value)
    const times = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setMinutes(d.getMinutes() - (29 - i))
      return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
    })
    onlineChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 16, bottom: 24 },
      xAxis: { type: 'category', data: times, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [{
        type: 'line', smooth: true, symbol: 'none',
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(22,119,255,0.3)' }, { offset: 1, color: 'rgba(22,119,255,0.02)' }]) },
        lineStyle: { color: '#1677FF', width: 2 },
        data: Array.from({ length: 30 }, () => Math.floor(2000 + Math.random() * 3000))
      }]
    })
  }
  if (sourceChartRef.value) {
    sourceChart?.dispose()
    sourceChart = echarts.init(sourceChartRef.value)
    sourceChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
        label: { show: false },
        data: [
          { value: 42, name: '自然推荐', itemStyle: { color: '#1677FF' } },
          { value: 28, name: '千川付费', itemStyle: { color: '#FF8A00' } },
          { value: 15, name: '短视频引流', itemStyle: { color: '#00B96B' } },
          { value: 10, name: '搜索', itemStyle: { color: '#722ED1' } },
          { value: 5, name: '关注', itemStyle: { color: '#13C2C2' } },
        ]
      }]
    })
  }
  if (gmvChartRef.value) {
    gmvChart?.dispose()
    gmvChart = echarts.init(gmvChartRef.value)
    const times = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setMinutes(d.getMinutes() - (11 - i) * 5)
      return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
    })
    gmvChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['GMV', '订单量'], textStyle: { fontSize: 11 } },
      grid: { left: 45, right: 45, top: 32, bottom: 24 },
      xAxis: { type: 'category', data: times, axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: 'value', name: 'GMV(元)', axisLabel: { fontSize: 10 } },
        { type: 'value', name: '订单', axisLabel: { fontSize: 10 } }
      ],
      series: [
        { name: 'GMV', type: 'bar', yAxisIndex: 0, itemStyle: { color: '#1677FF', borderRadius: [4, 4, 0, 0] }, data: Array.from({ length: 12 }, () => Math.floor(5000 + Math.random() * 15000)) },
        { name: '订单量', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#FF8A00' }, itemStyle: { color: '#FF8A00' }, data: Array.from({ length: 12 }, () => Math.floor(10 + Math.random() * 50)) },
      ]
    })
  }
}

const addRooms = async () => {
  if (!roomForm.room_ids?.trim()) { message.warning('请输入直播间ID'); return }
  submitting.value = true
  try {
    await request.post('/live/rooms', {
      room_ids: roomForm.room_ids.split('\n').map(s => s.trim()).filter(Boolean),
      nickname: roomForm.nickname,
      mode: roomForm.mode,
      schedule_time: roomForm.schedule_time,
    })
    message.success('添加成功')
    showAddRoom.value = false
    roomForm.room_ids = ''; roomForm.nickname = ''
    await loadRooms()
  } catch (e) {
    message.success('已添加(演示模式)')
    showAddRoom.value = false
  } finally { submitting.value = false }
}

onMounted(() => {
  loadRooms()
  refreshTimer = setInterval(() => { if (currentRoom.value) loadLiveData() }, 3000)
})
onUnmounted(() => {
  clearInterval(refreshTimer)
  destroyFlvPlayer()
  onlineChart?.dispose()
  sourceChart?.dispose()
  gmvChart?.dispose()
})
</script>

<style scoped>
.live-monitor { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.page-header__actions { display: flex; gap: 8px; }

.room-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px; -webkit-overflow-scrolling: touch; }
.room-tab {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px;
  background: #fff; border-radius: 8px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--border); transition: all 0.2s; font-size: 13px; flex-shrink: 0;
}
.room-tab:hover { border-color: var(--c-primary); }
.room-tab--active { background: var(--c-primary-bg); border-color: var(--c-primary); color: var(--c-primary); font-weight: 600; }
.room-tab__status { width: 6px; height: 6px; border-radius: 50%; background: #D9D9D9; }
.room-tab__status--live { background: #00B96B; animation: pulse 2s infinite; }
.room-tab__viewers { font-size: 11px; color: var(--text-hint); }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.live-top-section {
  display: grid; grid-template-columns: 340px 1fr; gap: 12px; margin-bottom: 16px;
}
.live-preview-card {
  background: #000; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
}
.live-preview-header {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(0,0,0,0.8);
}
.live-badge {
  display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 700; color: #999; background: #333; letter-spacing: 1px;
}
.live-badge--on {
  color: #fff; background: #ff4d4f;
  animation: livePulse 2s infinite;
}
@keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
.live-preview-title { color: #fff; font-size: 13px; font-weight: 600; }
.live-preview-body { flex: 1; position: relative; min-height: 380px; }
.live-preview-content {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; padding: 24px 16px; gap: 20px;
}
.live-status-info { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.live-status-icon { opacity: 0.9; }
.live-status-text { text-align: center; }
.live-status-label { display: block; color: #fff; font-size: 15px; font-weight: 600; }
.live-status-detail { display: block; color: #999; font-size: 12px; margin-top: 4px; }
.live-preview-actions { display: flex; gap: 10px; }
.live-action-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px;
  border-radius: 20px; font-size: 13px; font-weight: 500; text-decoration: none;
  color: #ccc; border: 1px solid #444; background: rgba(255,255,255,0.05); transition: all 0.2s;
}
.live-action-btn:hover { background: rgba(255,255,255,0.12); color: #fff; border-color: #666; }
.live-action-btn--primary { color: #fff; background: #ff4d4f; border-color: #ff4d4f; }
.live-action-btn--primary:hover { background: #ff7875; border-color: #ff7875; }
.live-promo-summary {
  display: flex; gap: 20px; padding: 12px 20px; background: rgba(255,255,255,0.06);
  border-radius: 8px; margin-top: 4px;
}
.promo-item { text-align: center; }
.promo-label { display: block; font-size: 11px; color: #888; }
.promo-value { display: block; font-size: 16px; font-weight: 700; color: #fff; margin-top: 2px; }

.live-player-wrap { position: relative; width: 100%; height: 100%; min-height: 380px; background: #000; }
.live-video { width: 100%; height: 100%; min-height: 380px; object-fit: contain; background: #000; cursor: pointer; }
.live-player-overlay {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
  pointer-events: none;
}
.live-title-bar { color: #fff; font-size: 12px; opacity: 0.9; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.live-player-controls { display: flex; gap: 8px; pointer-events: auto; }
.player-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.5);
  border: none; cursor: pointer; text-decoration: none; transition: background 0.2s;
}
.player-btn:hover { background: rgba(0,0,0,0.8); }

.metrics-side {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; align-content: start;
}
.metrics-row {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px; margin-bottom: 16px;
}
.metric-card {
  background: #fff; border-radius: 10px; padding: 14px; text-align: center;
  border: 1px solid var(--border); position: relative;
}
.metric-card--primary { border-left: 3px solid var(--c-primary); background: linear-gradient(135deg, #f0f5ff 0%, #fff 100%); }
.metric-card--success { border-left: 3px solid var(--c-success); background: linear-gradient(135deg, #f6ffed 0%, #fff 100%); }
.metric-card--warning { border-left: 3px solid #fa8c16; background: linear-gradient(135deg, #fff7e6 0%, #fff 100%); }
.metric-card--danger { border-left: 3px solid #ff4d4f; background: linear-gradient(135deg, #fff2f0 0%, #fff 100%); }
.metric-card__value { font-size: 22px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
.metric-card__label { font-size: 11px; color: var(--text-hint); margin-top: 4px; }
.metric-card__trend { font-size: 11px; margin-top: 2px; }
.trend-up { color: var(--c-success); }
.trend-down { color: var(--c-danger); }

.charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.chart-card { border-radius: 10px; }
.chart-container { height: 240px; width: 100%; }

.funnel-list { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
.funnel-item { position: relative; }
.funnel-item__bar { height: 32px; border-radius: 6px; opacity: 0.15; min-width: 20px; }
.funnel-item__info {
  position: absolute; top: 0; left: 10px; right: 10px; height: 32px;
  display: flex; align-items: center; justify-content: space-between; font-size: 12px;
}
.funnel-item__name { font-weight: 500; }
.funnel-item__value { color: var(--text-secondary); }

.danmaku-card { border-radius: 10px; }
.danmaku-stream { max-height: 300px; overflow-y: auto; }
.danmaku-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--divider); font-size: 13px; }
.danmaku-item__time { color: var(--text-hint); font-size: 11px; flex-shrink: 0; }
.danmaku-item__user { color: var(--c-primary); font-weight: 500; flex-shrink: 0; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
.danmaku-item__text { color: var(--text-primary); }

.empty-state { display: flex; justify-content: center; padding: 80px 0; }
.drawer-footer { display: flex; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--divider); margin-top: 16px; }

@media (max-width: 767px) {
  .page-title { font-size: 16px; }
  .live-top-section { grid-template-columns: 1fr; }
  .live-preview-body { min-height: 280px; }
  .live-preview-iframe { min-height: 280px; }
  .live-preview-placeholder { min-height: 280px; }
  .metrics-side { grid-template-columns: repeat(2, 1fr); }
  .metrics-row { grid-template-columns: repeat(2, 1fr); }
  .metric-card__value { font-size: 18px; }
  .charts-row { grid-template-columns: 1fr; }
  .chart-container { height: 200px; }
}
</style>
