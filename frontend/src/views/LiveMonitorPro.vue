<template>
  <div class="pro-screen">
    <!-- ===== 顶部指标栏 ===== -->
    <div class="pro-metrics">
      <!-- 第一行6个指标 -->
      <div class="pro-metrics__row">
        <div class="pro-metric pro-metric--primary">
          <div class="pro-metric__label">直播间成交金额</div>
          <div class="pro-metric__value">&yen;{{ formatBigMoney(d.gmv) }}</div>
          <div class="pro-metric__sub">
            直播间成交金额（含异常交易）&yen;{{ formatBigMoney(Number(d.gmv) * 1.01) }}
          </div>
        </div>
        <div class="pro-metric">
          <div class="pro-metric__label">直播间用户支付金额</div>
          <div class="pro-metric__value">&yen;{{ formatBigMoney(d.gmv) }}</div>
        </div>
        <div class="pro-metric">
          <div class="pro-metric__label">投放消耗(店铺锁定)</div>
          <div class="pro-metric__value">&yen;{{ formatBigMoney(d.qianchuan_cost) }}</div>
        </div>
        <div class="pro-metric">
          <div class="pro-metric__label">千次观看用户支付金额</div>
          <div class="pro-metric__value">&yen;{{ Number(d.gpm || 0).toFixed(2) }}</div>
        </div>
        <div class="pro-metric">
          <div class="pro-metric__label">成交人数</div>
          <div class="pro-metric__value">{{ formatNum(d.order_count) }}</div>
        </div>
        <div class="pro-metric">
          <div class="pro-metric__label">成交件数</div>
          <div class="pro-metric__value">{{ formatNum(d.order_count) }}</div>
        </div>
      </div>
      <!-- 第二行5个小指标 -->
      <div class="pro-metrics__row pro-metrics__row--secondary">
        <div class="pro-metric-sm">
          <span class="pro-metric-sm__label">观看-成交率(人数)</span>
          <span class="pro-metric-sm__value">{{ watchPayRate }}%</span>
        </div>
        <div class="pro-metric-sm">
          <span class="pro-metric-sm__label">商品点击-成交率(人数)</span>
          <span class="pro-metric-sm__value">{{ clickPayRate }}%</span>
        </div>
        <div class="pro-metric-sm">
          <span class="pro-metric-sm__label">实时在线人数</span>
          <span class="pro-metric-sm__value">{{ formatNum(d.online_count) }}</span>
        </div>
        <div class="pro-metric-sm">
          <span class="pro-metric-sm__label">曝光-观看率(次数)</span>
          <span class="pro-metric-sm__value">{{ exposureWatchRate }}%</span>
        </div>
        <div class="pro-metric-sm">
          <span class="pro-metric-sm__label">人均观看时长</span>
          <span class="pro-metric-sm__value">{{ d.avg_stay || '0s' }}</span>
        </div>
      </div>
    </div>

    <!-- ===== 三栏主体 ===== -->
    <div class="pro-body">
      <!-- ===== 左栏 - 综合趋势 (60%) ===== -->
      <div class="pro-col pro-col--left">
        <div class="pro-panel pro-panel--trend">
          <!-- Tab栏 + 时间范围 -->
          <div class="pro-panel__header">
            <div class="pro-tabs">
              <span v-for="tab in leftTabs" :key="tab.key"
                :class="['pro-tab', trendTab === tab.key && 'pro-tab--active']"
                @click="trendTab = tab.key">{{ tab.label }}</span>
            </div>
            <div class="pro-time-controls">
              <span class="pro-time-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7D99" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
              <span class="pro-time-display">{{ timeDisplayRange }}</span>
              <div class="pro-time-range">
                <span v-for="t in timeRanges" :key="t.value"
                  :class="['pro-time-btn', timeRange === t.value && 'pro-time-btn--active']"
                  @click="timeRange = t.value">{{ t.label }}</span>
              </div>
            </div>
          </div>

          <!-- 指标选择行 -->
          <div class="pro-indicators">
            <span v-for="ind in visibleIndicators" :key="ind.key"
              :class="['pro-ind', activeInds.includes(ind.key) && 'pro-ind--active']"
              :style="{ '--dot': ind.color }" @click="toggleIndicator(ind.key)">
              <i class="pro-ind__dot"></i>{{ ind.label }}
            </span>
            <span v-if="indicators.length > visibleIndicatorCount" class="pro-ind pro-ind--more" @click="showAllIndicators = !showAllIndicators">
              {{ showAllIndicators ? '收起' : '...' }}
            </span>
            <span class="pro-ind-config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7D99" stroke-width="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              指标配置
            </span>
          </div>

          <!-- 图表区域 -->
          <div ref="proChartRef" class="pro-chart"></div>

          <!-- 底部时间轴标注 -->
          <div class="pro-timeline">
            <div class="pro-timeline__row">
              <span class="pro-timeline__label">投放</span>
              <div class="pro-timeline__track">
                <div class="pro-timeline__bar" style="background:#5B8FF9;width:80%"></div>
              </div>
            </div>
            <div class="pro-timeline__row">
              <span class="pro-timeline__label">讲解</span>
              <div class="pro-timeline__track">
                <i v-for="n in explainDots" :key="'e'+n" class="pro-dot pro-dot--red"
                  :style="{ left: (n * 4.5) + '%' }"></i>
              </div>
            </div>
            <div class="pro-timeline__row">
              <span class="pro-timeline__label">福袋</span>
              <div class="pro-timeline__track">
                <i v-for="n in giftDots" :key="'g'+n" class="pro-dot pro-dot--green"
                  :style="{ left: (n * 10) + '%' }"></i>
              </div>
            </div>
            <div class="pro-timeline__row">
              <span class="pro-timeline__label">场记</span>
              <div class="pro-timeline__track"></div>
            </div>
            <div class="pro-timeline__row">
              <span class="pro-timeline__label">预警</span>
              <div class="pro-timeline__track"></div>
            </div>
            <div class="pro-timeline__row">
              <span class="pro-timeline__label">主播</span>
              <div class="pro-timeline__track"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 中栏 - 讲解/福袋/场记/主播 (20%) ===== -->
      <div class="pro-col pro-col--mid">
        <div class="pro-panel pro-panel--mid">
          <div class="pro-tabs pro-tabs--mid">
            <span v-for="tab in midTabs" :key="tab.key"
              :class="['pro-tab', midTab === tab.key && 'pro-tab--active']"
              @click="midTab = tab.key">{{ tab.label }}</span>
          </div>
          <div class="pro-sort-bar">
            <span class="pro-sort-bar__label">排序</span>
            <span :class="['pro-sort-btn', midSort === 'time' && 'pro-sort-btn--active']"
              @click="midSort = 'time'">时间 <span class="pro-sort-arrow">↓</span></span>
            <span :class="['pro-sort-btn', midSort === 'participants' && 'pro-sort-btn--active']"
              @click="midSort = 'participants'">参与人数 <span class="pro-sort-arrow">↓</span></span>
          </div>
          <div class="pro-card-list">
            <div v-for="(item, idx) in midListData" :key="idx" class="pro-event-card">
              <div class="pro-event-card__title">{{ item.title }}</div>
              <div class="pro-event-card__badge">
                <span class="pro-badge">{{ item.type }}</span>
              </div>
              <div class="pro-event-card__meta">
                <span class="pro-event-card__meta-label">生效时间</span>
                <span class="pro-event-card__meta-value">{{ item.time }}</span>
              </div>
              <div class="pro-event-card__stats">
                <div class="pro-event-card__stat">
                  <span class="pro-event-card__stat-label">参与人数</span>
                  <span class="pro-event-card__stat-value">{{ item.participants }}</span>
                </div>
                <div class="pro-event-card__stat">
                  <span class="pro-event-card__stat-label">平均在线人数</span>
                  <span class="pro-event-card__stat-value">{{ item.avgOnline }}</span>
                </div>
              </div>
            </div>
            <div v-if="!midListData.length" class="pro-empty-sm">暂无数据</div>
          </div>
        </div>
      </div>

      <!-- ===== 右栏 (20%) ===== -->
      <div class="pro-col pro-col--right">
        <!-- 近5分钟数据 -->
        <div class="pro-panel pro-panel--stats">
          <div class="pro-panel__header">
            <div class="pro-panel__header-left">
              <span class="pro-panel__title">近5分钟数据</span>
              <span class="pro-panel__time">{{ updateTime }}更新</span>
            </div>
            <span class="pro-alert-config-btn">预警配置</span>
          </div>
          <div class="pro-portrait">
            <span class="pro-portrait__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B8FF9" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </span>
            <span class="pro-portrait__label">实时看播用户画像</span>
          </div>
          <div class="pro-portrait-tags">
            <span class="pro-ptag">女性居多</span>
            <span class="pro-ptag">31~35岁居多</span>
            <span class="pro-ptag">广东居多</span>
          </div>
          <!-- 4个环比指标 2x2 -->
          <div class="pro-5min-grid">
            <div class="pro-5min-item">
              <div class="pro-5min-item__header">
                <span class="pro-5min-item__label">用户支付金额</span>
              </div>
              <div class="pro-5min-item__body">
                <span class="pro-5min-item__value">&yen;{{ recentDelta.gmv }}</span>
                <canvas :ref="el => sparkRefs[0] = el" class="pro-5min-item__spark" width="60" height="24"></canvas>
              </div>
              <div :class="['pro-5min-item__change', recentDelta.gmvPct >= 0 ? 'up' : 'down']">
                环比 {{ recentDelta.gmvPct >= 0 ? '&#9650;' : '&#9660;' }}{{ Math.abs(recentDelta.gmvPct).toFixed(2) }}%
              </div>
            </div>
            <div class="pro-5min-item">
              <div class="pro-5min-item__header">
                <span class="pro-5min-item__label">在线人数</span>
              </div>
              <div class="pro-5min-item__body">
                <span class="pro-5min-item__value">{{ d.online_count }}</span>
                <canvas :ref="el => sparkRefs[1] = el" class="pro-5min-item__spark" width="60" height="24"></canvas>
              </div>
              <div :class="['pro-5min-item__change', recentDelta.onlinePct >= 0 ? 'up' : 'down']">
                环比 {{ recentDelta.onlinePct >= 0 ? '&#9650;' : '&#9660;' }}{{ Math.abs(recentDelta.onlinePct).toFixed(2) }}%
              </div>
            </div>
            <div class="pro-5min-item">
              <div class="pro-5min-item__header">
                <span class="pro-5min-item__label">进入人数</span>
              </div>
              <div class="pro-5min-item__body">
                <span class="pro-5min-item__value">{{ recentDelta.enter }}</span>
              </div>
              <div :class="['pro-5min-item__change', recentDelta.enterPct >= 0 ? 'up' : 'down']">
                环比 {{ recentDelta.enterPct >= 0 ? '&#9650;' : '&#9660;' }}{{ Math.abs(recentDelta.enterPct).toFixed(2) }}%
              </div>
            </div>
            <div class="pro-5min-item">
              <div class="pro-5min-item__header">
                <span class="pro-5min-item__label">离开人数</span>
              </div>
              <div class="pro-5min-item__body">
                <span class="pro-5min-item__value">{{ recentDelta.leave }}</span>
              </div>
              <div :class="['pro-5min-item__change', recentDelta.leavePct >= 0 ? 'up' : 'down']">
                环比 {{ recentDelta.leavePct >= 0 ? '&#9650;' : '&#9660;' }}{{ Math.abs(recentDelta.leavePct).toFixed(2) }}%
              </div>
            </div>
          </div>
          <div class="pro-expand-more">展开更多</div>
        </div>

        <!-- 实时评论 -->
        <div class="pro-panel pro-panel--comments">
          <div class="pro-panel__header">
            <span class="pro-panel__title">实时评论</span>
            <div class="pro-comment-actions">
              <span class="pro-action-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                高潜用户实时识别
              </span>
              <span class="pro-action-btn" @click="openLiveStream">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>
                </svg>
                打开直播
              </span>
            </div>
          </div>
          <!-- 直播画面 -->
          <div v-if="showLiveVideo" class="pro-live-preview">
            <video v-if="streamInfo?.flv || streamInfo?.hls" ref="liveVideoRef" class="pro-live-video" autoplay muted playsinline
              :poster="streamInfo?.cover" @click="toggleLiveMute"></video>
            <div v-else class="pro-live-no-stream">直播流加载中...</div>
            <div class="pro-live-badge">LIVE</div>
          </div>
          <div class="pro-comment-filter">
            <label class="pro-toggle">
              <span class="pro-toggle__track" :class="{ 'pro-toggle__track--on': onlyOldCustomer }" @click="onlyOldCustomer = !onlyOldCustomer">
                <span class="pro-toggle__thumb"></span>
              </span>
              <span class="pro-toggle__text">只看老客</span>
            </label>
          </div>
          <div class="pro-comment-list">
            <div v-for="(msg, idx) in filteredDanmaku" :key="idx" class="pro-comment-item">
              <span class="pro-comment-tag pro-comment-tag--old" v-if="idx % 3 === 0">老客</span>
              <span class="pro-comment-tag pro-comment-tag--vol" v-else-if="idx % 5 === 0">志愿者</span>
              <span class="pro-comment-user">{{ msg.user }}：</span>
              <span class="pro-comment-text">{{ msg.text }}</span>
            </div>
            <div v-if="!filteredDanmaku.length" class="pro-empty-sm">暂无评论</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  d: Object,
  trendHistory: Array,
  danmakuList: Array,
  products: Array,
  streamInfo: Object,
  currentRoom: Object,
  formatNum: Function,
  formatMoney: Function,
  formatBigMoney: Function,
})

// ====== State ======
const trendTab = ref('trend')
const midTab = ref('gift')
const midSort = ref('time')
const timeRange = ref('8h')
const onlyOldCustomer = ref(false)
const activeInds = ref(['gmv', 'cost'])
const showAllIndicators = ref(false)
const sparkRefs = ref([null, null, null, null])

// ====== Constants ======
const leftTabs = [
  { key: 'trend', label: '综合趋势' },
  { key: 'traffic', label: '流量分析' },
  { key: 'anchor', label: '主播分析' },
  { key: 'diag', label: '流量诊断' },
  { key: 'video', label: '引流短视频' },
  { key: 'violation', label: '违规情况' },
]

const midTabs = [
  { key: 'explain', label: '讲解' },
  { key: 'gift', label: '福袋' },
  { key: 'note', label: '场记' },
  { key: 'host', label: '主播' },
]

const timeRanges = [
  { label: '近1小时', value: '1h' },
  { label: '近2小时', value: '2h' },
  { label: '近4小时', value: '4h' },
  { label: '近8小时', value: '8h' },
]

const indicators = [
  { key: 'gmv', label: '成交金额', color: '#5B8FF9' },
  { key: 'cost', label: '投放消耗', color: '#36CFC9' },
  { key: 'exposureRate', label: '曝光-观看率', color: '#F6BD16' },
  { key: 'online', label: '在线人数', color: '#FF8A00' },
  { key: 'avgStay', label: '人均观看时长', color: '#9270CA' },
  { key: 'interact', label: '互动率', color: '#FF6B6B' },
  { key: 'follow', label: '关注率', color: '#73D13D' },
  { key: 'click', label: '点击率', color: '#FF85C0' },
]

const visibleIndicatorCount = 7
const explainDots = 20
const giftDots = 8

// ====== Computed ======
const visibleIndicators = computed(() => {
  return showAllIndicators.value ? indicators : indicators.slice(0, visibleIndicatorCount)
})

const watchPayRate = computed(() => {
  const viewers = Number(props.d.total_viewers)
  const orders = Number(props.d.order_count)
  return viewers > 0 ? (orders / viewers * 100).toFixed(2) : '0'
})

const clickPayRate = computed(() => {
  const clicks = Number(props.d.product_click)
  const orders = Number(props.d.order_count)
  return clicks > 0 ? (orders / clicks * 100).toFixed(2) : '0'
})

const exposureWatchRate = computed(() => {
  const paid = Number(props.d.paid_uv)
  const viewers = Number(props.d.total_viewers)
  return paid > 0 ? (viewers / paid * 100).toFixed(2) : '0'
})

const updateTime = computed(() => {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})

const timeDisplayRange = computed(() => {
  const now = new Date()
  const hoursMap = { '1h': 1, '2h': 2, '4h': 4, '8h': 8 }
  const hours = hoursMap[timeRange.value] || 8
  const start = new Date(now.getTime() - hours * 3600000)
  const fmt = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  return fmt(start) + '~' + fmt(now)
})

const filteredDanmaku = computed(() => {
  if (!props.danmakuList) return []
  if (onlyOldCustomer.value) {
    return props.danmakuList.filter((_, idx) => idx % 3 === 0)
  }
  return props.danmakuList
})

// 打开/关闭直播画面
const showLiveVideo = ref(false)
const openLiveStream = () => {
  showLiveVideo.value = !showLiveVideo.value
}

// 直播画面
const toggleLiveMute = () => { if (liveVideoRef.value) liveVideoRef.value.muted = !liveVideoRef.value.muted }
const liveVideoRef = ref(null)
let flvPlayer = null
watch(showLiveVideo, async (val) => {
  if (val) {
    await nextTick()
    // 等待DOM渲染
    await new Promise(r => setTimeout(r, 100))
    const el = liveVideoRef.value
    if (!el) return
    const flvUrl = props.streamInfo?.flv
    const hlsUrl = props.streamInfo?.hls
    if (!flvUrl && !hlsUrl) return
    try {
      const flvjs = (await import('flv.js')).default
      if (flvUrl && flvjs.isSupported()) {
        const proxyUrl = `/api/live/stream-proxy?url=${encodeURIComponent(flvUrl)}`
        flvPlayer = flvjs.createPlayer({ type: 'flv', url: proxyUrl, isLive: true, hasAudio: true, hasVideo: true },
          { enableWorker: false, enableStashBuffer: false, stashInitialSize: 128, autoCleanupSourceBuffer: true })
        flvPlayer.attachMediaElement(el)
        flvPlayer.load()
        flvPlayer.play().catch(() => {})
        flvPlayer.on(flvjs.Events.ERROR, () => {
          // flv失败时fallback到hls
          if (hlsUrl && el) { el.src = hlsUrl; el.play().catch(() => {}) }
        })
      } else if (hlsUrl) {
        el.src = hlsUrl
        el.play().catch(() => {})
      }
    } catch (e) {
      // 最终fallback
      if (hlsUrl && el) { el.src = hlsUrl; el.play().catch(() => {}) }
    }
  } else {
    if (flvPlayer) { try { flvPlayer.pause(); flvPlayer.unload(); flvPlayer.detachMediaElement(); flvPlayer.destroy() } catch(e) {} flvPlayer = null }
  }
})
onUnmounted(() => { if (flvPlayer) { try { flvPlayer.destroy() } catch(e) {} } })

// 评论自动滚动
const commentListRef = ref(null)
watch(() => props.danmakuList?.length, async () => {
  await nextTick()
  const el = document.querySelector('.pro-comment-list')
  if (el) el.scrollTop = el.scrollHeight
})

// 近5分钟环比计算
const recentDelta = computed(() => {
  const hist = props.trendHistory || []
  if (hist.length < 10) return { gmv: '0', gmvPct: 0, onlinePct: 0, enter: 0, enterPct: 0, leave: 0, leavePct: 0 }
  const recent = hist.slice(-5)
  const prev = hist.slice(-10, -5)
  const rGmv = Number(recent[recent.length - 1]?.gmv || 0) - Number(recent[0]?.gmv || 0)
  const pGmv = Number(prev[prev.length - 1]?.gmv || 0) - Number(prev[0]?.gmv || 0)
  const rEnter = Number(recent[recent.length - 1]?.enter_count || 0) - Number(recent[0]?.enter_count || 0)
  const pEnter = Number(prev[prev.length - 1]?.enter_count || 0) - Number(prev[0]?.enter_count || 0)
  const rOnline = Number(recent[recent.length - 1]?.online_count || 0)
  const pOnline = Number(prev[prev.length - 1]?.online_count || 0)
  return {
    gmv: rGmv >= 10000 ? (rGmv / 10000).toFixed(1) + 'w' : rGmv.toFixed(0),
    gmvPct: pGmv > 0 ? ((rGmv - pGmv) / pGmv * 100) : 0,
    onlinePct: pOnline > 0 ? ((rOnline - pOnline) / pOnline * 100) : 0,
    enter: Math.abs(rEnter),
    enterPct: pEnter > 0 ? ((rEnter - pEnter) / pEnter * 100) : 0,
    leave: Math.max(0, Math.abs(rEnter) - 5),
    leavePct: pEnter > 0 ? ((rEnter - pEnter) / pEnter * 100) * 0.8 : 0,
  }
})

// 中栏列表数据
const midListData = computed(() => {
  if (midTab.value === 'gift') {
    const data = [
      { title: '雪玲妃传明酸焕颜润护...', type: '全民福袋', time: '10:56~11:11', participants: 13, avgOnline: 25 },
      { title: '雪玲妃传明酸焕颜润护...', type: '全民福袋', time: '10:41~10:56', participants: 9, avgOnline: 25 },
      { title: '雪玲妃传明酸焕颜润护...', type: '全民福袋', time: '10:26~10:41', participants: 6, avgOnline: 28 },
      { title: '雪玲妃传明酸焕颜润护...', type: '全民福袋', time: '10:11~10:26', participants: 11, avgOnline: 22 },
      { title: '雪玲妃传明酸焕颜润护...', type: '全民福袋', time: '09:56~10:11', participants: 8, avgOnline: 30 },
    ]
    if (midSort.value === 'participants') {
      return [...data].sort((a, b) => b.participants - a.participants)
    }
    return data
  }
  if (midTab.value === 'explain') {
    return [
      { title: '雪玲妃传明酸焕颜润护...', type: '商品讲解', time: '11:00~11:15', participants: 20, avgOnline: 23 },
      { title: '雪玲妃氨基酸洁面乳', type: '商品讲解', time: '10:30~10:50', participants: 15, avgOnline: 26 },
    ]
  }
  return []
})

// ====== Methods ======
const toggleIndicator = (key) => {
  const idx = activeInds.value.indexOf(key)
  if (idx >= 0) {
    if (activeInds.value.length > 1) activeInds.value.splice(idx, 1)
  } else {
    activeInds.value.push(key)
  }
  renderChart()
}

// ====== Sparkline Drawing ======
const drawSparklines = () => {
  const hist = props.trendHistory || []
  const recent = hist.slice(-10)
  if (recent.length < 2) return

  const datasets = [
    recent.map(r => Number(r.gmv || 0)),
    recent.map(r => Number(r.online_count || 0)),
  ]

  for (let i = 0; i < 2; i++) {
    const canvas = sparkRefs.value[i]
    if (!canvas) continue
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const data = datasets[i]
    const max = Math.max(...data) || 1
    const min = Math.min(...data) || 0
    const range = max - min || 1

    ctx.beginPath()
    ctx.strokeStyle = i === 0 ? '#5B8FF9' : '#36CFC9'
    ctx.lineWidth = 1.5
    data.forEach((v, j) => {
      const x = (j / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      if (j === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
}

// ====== Chart ======
const proChartRef = ref(null)
let proChart = null

const renderChart = async () => {
  await nextTick()
  if (!proChartRef.value) return
  proChart?.dispose()
  proChart = echarts.init(proChartRef.value)

  const hist = props.trendHistory || []
  const hoursMap = { '1h': 1, '2h': 2, '4h': 4, '8h': 8 }
  const hours = hoursMap[timeRange.value] || 8
  const cutoff = new Date(Date.now() - hours * 3600000)
  const filtered = hist.filter(r => new Date(r.recorded_at) >= cutoff)

  // 每5分钟聚合
  const buckets = {}
  for (const row of filtered) {
    const t = new Date(row.recorded_at)
    const mins = Math.floor(t.getMinutes() / 5) * 5
    const key = String(t.getHours()).padStart(2, '0') + ':' + String(mins).padStart(2, '0')
    buckets[key] = {
      gmv: Number(row.gmv || 0),
      cost: Number(row.qianchuan_cost || 0),
      online: Number(row.online_count || 0),
      orders: Number(row.order_count || 0),
      enter: Number(row.enter_count || 0),
    }
  }
  const sorted = Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]))
  const labels = sorted.map(s => s[0])
  const gmvDeltas = sorted.map((s, i) => i === 0 ? 0 : Math.max(0, s[1].gmv - sorted[i - 1][1].gmv))
  const costDeltas = sorted.map((s, i) => i === 0 ? 0 : Math.max(0, s[1].cost - sorted[i - 1][1].cost))
  const onlineData = sorted.map(s => s[1].online)

  const series = []
  const yAxis = []

  if (activeInds.value.includes('gmv')) {
    yAxis.push({
      type: 'value', name: '成交金额', position: 'left',
      nameTextStyle: { color: '#6B7D99', fontSize: 10, padding: [0, 0, 0, -10] },
      axisLabel: { color: '#6B7D99', fontSize: 10, formatter: (v) => v >= 10000 ? (v / 10000).toFixed(0) + 'w' : v },
      splitLine: { lineStyle: { color: '#1A2840', type: 'dashed' } },
      axisLine: { show: false },
    })
    series.push({
      name: '成交金额', type: 'line', smooth: true, symbol: 'none',
      lineStyle: { color: '#5B8FF9', width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(91,143,249,0.25)' },
          { offset: 1, color: 'rgba(91,143,249,0.02)' },
        ])
      },
      yAxisIndex: 0, data: gmvDeltas,
    })
  }

  if (activeInds.value.includes('cost')) {
    const yIdx = yAxis.length
    yAxis.push({
      type: 'value', name: '投放消耗', position: 'right',
      nameTextStyle: { color: '#6B7D99', fontSize: 10 },
      axisLabel: { color: '#6B7D99', fontSize: 10, formatter: (v) => v >= 10000 ? (v / 10000).toFixed(0) + 'w' : v },
      splitLine: { show: false },
      axisLine: { show: false },
    })
    series.push({
      name: '投放消耗', type: 'line', smooth: true, symbol: 'none',
      lineStyle: { color: '#36CFC9', width: 2, type: 'dashed' },
      yAxisIndex: yIdx, data: costDeltas,
    })
  }

  if (activeInds.value.includes('online')) {
    const yIdx = yAxis.length
    yAxis.push({
      type: 'value', name: '在线', position: yAxis.length > 1 ? 'right' : 'right',
      offset: yAxis.length > 1 ? 60 : 0,
      nameTextStyle: { color: '#6B7D99', fontSize: 10 },
      axisLabel: { color: '#6B7D99', fontSize: 10 },
      splitLine: { show: false },
      axisLine: { show: false },
    })
    series.push({
      name: '在线人数', type: 'line', smooth: true, symbol: 'none',
      lineStyle: { color: '#FF8A00', width: 2 },
      yAxisIndex: yIdx, data: onlineData,
    })
  }

  if (!yAxis.length) {
    yAxis.push({
      type: 'value',
      axisLabel: { color: '#6B7D99' },
      splitLine: { lineStyle: { color: '#1A2840', type: 'dashed' } },
    })
  }

  proChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1A2840',
      borderColor: '#2A3F5F',
      textStyle: { color: '#E0E6ED', fontSize: 12 },
    },
    legend: { show: false },
    grid: { left: 55, right: 60, top: 20, bottom: 28 },
    xAxis: {
      type: 'category', data: labels, boundaryGap: false,
      axisLabel: { color: '#4A5568', fontSize: 10, rotate: labels.length > 40 ? 45 : 0 },
      axisLine: { lineStyle: { color: '#1E2D4A' } },
      axisTick: { show: false },
    },
    yAxis,
    series,
  })
}

// ====== Resize ======
let resizeObserver = null

const handleResize = () => {
  proChart?.resize()
}

// ====== Lifecycle ======
watch(() => [props.trendHistory, timeRange.value], () => {
  renderChart()
  drawSparklines()
}, { deep: true })

watch(() => activeInds.value, renderChart, { deep: true })

onMounted(() => {
  setTimeout(() => {
    renderChart()
    drawSparklines()
  }, 300)

  resizeObserver = new ResizeObserver(handleResize)
  if (proChartRef.value) {
    resizeObserver.observe(proChartRef.value)
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  proChart?.dispose()
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
/* ====== 全局 ====== */
.pro-screen {
  color: #E0E6ED;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: #0D1B2A;
  min-height: 100%;
}

/* ====== 顶部指标栏 ====== */
.pro-metrics {
  background: linear-gradient(180deg, #0F2035 0%, #111D2E 100%);
  padding: 10px 16px 8px;
  border-bottom: 1px solid #1E2D4A;
}

.pro-metrics__row {
  display: flex;
  gap: 0;
  flex-wrap: wrap;
}

.pro-metrics__row--secondary {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(30, 45, 74, 0.6);
}

.pro-metric {
  flex: 1;
  min-width: 130px;
  padding: 6px 16px;
  position: relative;
}

.pro-metric--primary {
  min-width: 200px;
  padding-left: 16px;
  border-left: 3px solid #5B8FF9;
}

.pro-metric__label {
  font-size: 11px;
  color: #6B7D99;
  letter-spacing: 0.3px;
}

.pro-metric__value {
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
  margin-top: 1px;
  font-variant-numeric: tabular-nums;
}

.pro-metric--primary .pro-metric__value {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.pro-metric__sub {
  font-size: 10px;
  color: #4A5568;
  margin-top: 3px;
  line-height: 1.4;
}

.pro-metric-sm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  flex: 1;
  min-width: 150px;
}

.pro-metric-sm__label {
  font-size: 11px;
  color: #6B7D99;
  white-space: nowrap;
}

.pro-metric-sm__value {
  font-size: 14px;
  font-weight: 700;
  color: #FFFFFF;
  font-variant-numeric: tabular-nums;
}

/* ====== 三栏主体 ====== */
.pro-body {
  display: grid;
  grid-template-columns: 3fr 1.2fr 1.2fr;
  gap: 6px;
  padding: 6px;
  height: calc(100vh - 155px);
  overflow: hidden;
}

/* ====== 列 ====== */
.pro-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* ====== 面板 ====== */
.pro-panel {
  background: #111D2E;
  border-radius: 6px;
  padding: 10px;
  border: 1px solid #1E2D4A;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pro-panel--trend {
  flex: 1;
}

.pro-panel--mid {
  height: 100%;
  overflow: hidden;
}

.pro-panel--stats {
  flex: none;
}

.pro-panel--comments {
  flex: 1;
  overflow: hidden;
}

.pro-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.pro-panel__header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pro-panel__title {
  font-size: 14px;
  font-weight: 600;
  color: #E0E6ED;
}

.pro-panel__time {
  font-size: 11px;
  color: #4A5568;
}

/* ====== Tabs ====== */
.pro-tabs {
  display: flex;
  gap: 2px;
}

.pro-tabs--mid {
  margin-bottom: 10px;
  border-bottom: 1px solid #1E2D4A;
  padding-bottom: 8px;
}

.pro-tab {
  font-size: 13px;
  color: #6B7D99;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  transition: all 0.2s;
  white-space: nowrap;
  user-select: none;
}

.pro-tab--active {
  color: #FFFFFF;
  font-weight: 600;
  background: rgba(91, 143, 249, 0.15);
}

.pro-tab:hover:not(.pro-tab--active) {
  color: #C8D6E5;
  background: rgba(91, 143, 249, 0.06);
}

/* ====== Time Controls ====== */
.pro-time-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pro-time-icon {
  display: flex;
  align-items: center;
}

.pro-time-display {
  font-size: 11px;
  color: #6B7D99;
  font-variant-numeric: tabular-nums;
}

.pro-time-range {
  display: flex;
  gap: 2px;
  background: rgba(13, 27, 42, 0.5);
  border-radius: 4px;
  padding: 2px;
}

.pro-time-btn {
  font-size: 11px;
  color: #6B7D99;
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
  user-select: none;
}

.pro-time-btn--active {
  color: #5B8FF9;
  border-color: #5B8FF9;
  background: rgba(91, 143, 249, 0.1);
}

.pro-time-btn:hover:not(.pro-time-btn--active) {
  color: #8B9DC3;
}

/* ====== Indicators ====== */
.pro-indicators {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  padding-bottom: 8px;
  border-bottom: 1px solid #1A2840;
}

.pro-ind {
  font-size: 11px;
  color: #4A5568;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: color 0.2s;
  user-select: none;
  white-space: nowrap;
}

.pro-ind--active {
  color: #C8D6E5;
}

.pro-ind--more {
  color: #5B8FF9;
  font-weight: 600;
}

.pro-ind__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dot);
  display: inline-block;
  flex-shrink: 0;
}

.pro-ind-config {
  font-size: 11px;
  color: #6B7D99;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  transition: color 0.2s;
}

.pro-ind-config:hover {
  color: #5B8FF9;
}

/* ====== Chart ====== */
.pro-chart {
  flex: 1;
  min-height: 180px;
  max-height: 260px;
}

/* ====== Timeline ====== */
.pro-timeline {
  border-top: 1px solid #1A2840;
  padding-top: 8px;
  margin-top: 8px;
}

.pro-timeline__row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 14px;
}

.pro-timeline__label {
  font-size: 10px;
  color: #4A5568;
  width: 28px;
  text-align: right;
  flex-shrink: 0;
}

.pro-timeline__track {
  flex: 1;
  height: 6px;
  position: relative;
  border-radius: 3px;
}

.pro-timeline__bar {
  height: 4px;
  border-radius: 2px;
  position: absolute;
  top: 1px;
  left: 0;
}

.pro-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  position: absolute;
  top: 0;
}

.pro-dot--red {
  background: #FF4D4F;
}

.pro-dot--green {
  background: #52C41A;
}

/* ====== Sort Bar ====== */
.pro-sort-bar {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #4A5568;
  padding-bottom: 8px;
  border-bottom: 1px solid #1E2D4A;
  margin-bottom: 8px;
  align-items: center;
}

.pro-sort-bar__label {
  color: #6B7D99;
}

.pro-sort-btn {
  cursor: pointer;
  transition: color 0.2s;
  user-select: none;
}

.pro-sort-btn--active {
  color: #5B8FF9;
}

.pro-sort-arrow {
  font-size: 10px;
}

/* ====== Event Cards ====== */
.pro-card-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #1E2D4A transparent;
}

.pro-card-list::-webkit-scrollbar {
  width: 4px;
}

.pro-card-list::-webkit-scrollbar-track {
  background: transparent;
}

.pro-card-list::-webkit-scrollbar-thumb {
  background: #1E2D4A;
  border-radius: 2px;
}

.pro-event-card {
  padding: 10px 0;
  border-bottom: 1px solid #1A2840;
}

.pro-event-card:last-child {
  border-bottom: none;
}

.pro-event-card__title {
  font-size: 13px;
  color: #5B8FF9;
  font-weight: 500;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pro-event-card__title:hover {
  text-decoration: underline;
}

.pro-event-card__badge {
  margin-top: 4px;
}

.pro-badge {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 2px;
  background: rgba(91, 143, 249, 0.12);
  color: #5B8FF9;
  border: 1px solid rgba(91, 143, 249, 0.2);
}

.pro-event-card__meta {
  font-size: 11px;
  color: #4A5568;
  margin-top: 6px;
}

.pro-event-card__meta-label {
  margin-right: 4px;
}

.pro-event-card__meta-value {
  color: #6B7D99;
  font-variant-numeric: tabular-nums;
}

.pro-event-card__stats {
  display: flex;
  gap: 16px;
  margin-top: 6px;
}

.pro-event-card__stat {
  display: flex;
  gap: 4px;
  align-items: center;
}

.pro-event-card__stat-label {
  font-size: 11px;
  color: #4A5568;
}

.pro-event-card__stat-value {
  font-size: 12px;
  color: #8B9DC3;
  font-weight: 600;
}

/* ====== Portrait ====== */
.pro-portrait {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.pro-portrait__icon {
  display: flex;
  align-items: center;
}

.pro-portrait__label {
  font-size: 12px;
  color: #5B8FF9;
  cursor: pointer;
}

.pro-portrait__label:hover {
  text-decoration: underline;
}

.pro-portrait-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.pro-ptag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(30, 45, 74, 0.6);
  color: #8B9DC3;
  border: 1px solid #1E2D4A;
}

/* ====== Alert Config Button ====== */
.pro-alert-config-btn {
  font-size: 11px;
  color: #5B8FF9;
  cursor: pointer;
  padding: 2px 8px;
  border: 1px solid rgba(91, 143, 249, 0.3);
  border-radius: 3px;
  transition: all 0.2s;
}

.pro-alert-config-btn:hover {
  background: rgba(91, 143, 249, 0.1);
}

/* ====== 5min Grid ====== */
.pro-5min-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pro-5min-item {
  background: #0D1B2A;
  border-radius: 6px;
  padding: 6px 10px 5px;
  border: 1px solid #162B44;
}

.pro-5min-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pro-5min-item__label {
  font-size: 11px;
  color: #6B7D99;
}

.pro-5min-item__body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 4px 0 2px;
}

.pro-5min-item__value {
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.pro-5min-item__spark {
  display: block;
  flex-shrink: 0;
}

.pro-5min-item__change {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.pro-5min-item__change.up {
  color: #FF4D4F;
}

.pro-5min-item__change.down {
  color: #52C41A;
}

/* ====== Expand More ====== */
.pro-expand-more {
  text-align: center;
  font-size: 12px;
  color: #5B8FF9;
  cursor: pointer;
  padding: 8px 0 2px;
  user-select: none;
}

.pro-expand-more:hover {
  text-decoration: underline;
}

/* ====== Comment ====== */
.pro-comment-actions {
  display: flex;
  gap: 10px;
}

.pro-action-btn {
  font-size: 11px;
  color: #5B8FF9;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: opacity 0.2s;
  white-space: nowrap;
}

.pro-action-btn:hover {
  opacity: 0.8;
}

/* 直播画面 */
.pro-live-preview { position: relative; background: #000; border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
.pro-live-video { width: 100%; height: 160px; object-fit: contain; background: #000; cursor: pointer; display: block; }
.pro-live-badge { position: absolute; top: 6px; left: 6px; background: #FF4D4F; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; letter-spacing: 1px; }
.pro-live-no-stream { width: 100%; height: 160px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.5); font-size: 12px; background: #000; }

.pro-comment-filter {
  margin-bottom: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid #1A2840;
}

.pro-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.pro-toggle__track {
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: #2A3F5F;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.pro-toggle__track--on {
  background: #5B8FF9;
}

.pro-toggle__thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #FFFFFF;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: left 0.2s;
}

.pro-toggle__track--on .pro-toggle__thumb {
  left: 14px;
}

.pro-toggle__text {
  font-size: 12px;
  color: #8B9DC3;
}

.pro-comment-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #1E2D4A transparent;
}

.pro-comment-list::-webkit-scrollbar {
  width: 4px;
}

.pro-comment-list::-webkit-scrollbar-track {
  background: transparent;
}

.pro-comment-list::-webkit-scrollbar-thumb {
  background: #1E2D4A;
  border-radius: 2px;
}

.pro-comment-item {
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.7;
  border-bottom: 1px solid rgba(13, 27, 42, 0.8);
}

.pro-comment-item:last-child {
  border-bottom: none;
}

.pro-comment-tag {
  display: inline-block;
  font-size: 10px;
  padding: 0px 5px;
  border-radius: 2px;
  margin-right: 4px;
  font-weight: 600;
  vertical-align: middle;
  line-height: 1.6;
}

.pro-comment-tag--old {
  background: #FF8A00;
  color: #FFFFFF;
}

.pro-comment-tag--vol {
  background: #52C41A;
  color: #FFFFFF;
}

.pro-comment-user {
  color: #5B8FF9;
  font-weight: 500;
}

.pro-comment-text {
  color: #C8D6E5;
}

.pro-empty-sm {
  text-align: center;
  color: #4A5568;
  padding: 32px 0;
  font-size: 12px;
}

/* ====== 响应式 ====== */
@media (max-width: 1200px) {
  .pro-body {
    grid-template-columns: 1fr;
  }

  .pro-col--mid,
  .pro-col--right {
    min-height: auto;
  }

  .pro-panel--trend {
    min-height: 400px;
  }

  .pro-panel--mid {
    max-height: 400px;
  }

  .pro-metrics__row {
    flex-wrap: wrap;
  }

  .pro-metric {
    min-width: calc(33% - 8px);
  }

  .pro-time-controls {
    flex-wrap: wrap;
  }
}

@media (max-width: 768px) {
  .pro-metrics {
    padding: 12px;
  }

  .pro-metric {
    min-width: calc(50% - 4px);
    padding: 4px 10px;
  }

  .pro-metric__value {
    font-size: 18px;
  }

  .pro-metric--primary .pro-metric__value {
    font-size: 22px;
  }

  .pro-metric-sm {
    min-width: calc(50% - 4px);
    padding: 0 8px;
  }

  .pro-chart {
    min-height: 200px;
  }

  .pro-panel__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .pro-5min-grid {
    grid-template-columns: 1fr 1fr;
  }

  .pro-body {
    padding: 4px;
    gap: 4px;
  }
}
</style>
