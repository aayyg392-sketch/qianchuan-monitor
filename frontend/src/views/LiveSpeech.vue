<template>
  <div class="live-speech">
    <div class="page-header">
      <h2 class="page-title">话术抓取</h2>
      <div class="page-header__actions">
        <a-select v-model:value="selectedRoom" style="width: 260px" placeholder="选择直播间" showSearch optionFilterProp="label"
          :options="rooms.map(r => ({ value: r.id, label: r.nickname + (r.advertiser_name ? ' (' + r.advertiser_name.replace(/.*-/, '') + ')' : '') }))" />
        <a-button type="primary" @click="exportScripts" :loading="exporting">
          导出话术
        </a-button>
      </div>
    </div>

    <!-- Real-time Status -->
    <div class="status-bar" v-if="isRecording">
      <span class="status-bar__dot"></span>
      <span class="status-bar__text">正在录制话术...</span>
      <span class="status-bar__duration">已录制 {{ recordDuration }}</span>
      <a-button size="small" danger @click="stopRecording">停止</a-button>
    </div>

    <a-tabs v-model:activeKey="activeTab">
      <!-- Tab: 实时话术 -->
      <a-tab-pane key="realtime" tab="实时话术">
        <div class="speech-stream">
          <div v-for="(segment, idx) in realtimeScripts" :key="idx" class="speech-segment" :class="{ 'speech-segment--highlight': segment.is_high_convert }">
            <div class="speech-segment__header">
              <span class="speech-segment__time">{{ segment.time }}</span>
              <a-tag v-if="segment.is_high_convert" color="gold" size="small">高转化</a-tag>
              <a-tag :color="categoryTagColor(segment.category)" size="small">{{ categoryLabel(segment.category) }}</a-tag>
            </div>
            <div class="speech-segment__text">{{ segment.text }}</div>
            <div class="speech-segment__metrics" v-if="segment.orders > 0 || segment.gmv > 0 || segment.cvr > 0">
              <span class="metric-tag" v-if="segment.cvr > 0">转化率 {{ segment.cvr }}%</span>
              <span class="metric-tag" v-if="segment.gmv > 0">GMV ¥{{ segment.gmv >= 10000 ? (segment.gmv/10000).toFixed(1)+'万' : segment.gmv.toFixed(0) }}</span>
              <span class="metric-tag" v-if="segment.orders > 0">成交 {{ segment.orders }}单</span>
            </div>
          </div>
          <a-empty v-if="!realtimeScripts.length" description="暂无话术数据，开播后自动抓取" />
        </div>
      </a-tab-pane>

      <!-- Tab: 高转化话术库 -->
      <a-tab-pane key="library" tab="高转化话术库">
        <div class="filter-bar">
          <a-segmented v-model:value="scriptCategory" :options="['全部', '卖点讲解', '逼单促单', '福利发放', '互动留人', '产品介绍']" />
          <a-input-search v-model:value="searchKeyword" placeholder="搜索话术关键词" style="width: 200px" @search="filterScripts" />
        </div>
        <div class="script-library">
          <div v-for="script in filteredScripts" :key="script.id" class="script-card">
            <div class="script-card__header">
              <a-tag :color="categoryTagColor(script.category)" size="small">{{ categoryLabel(script.category) }}</a-tag>
              <a-tag v-if="script.is_high_convert" color="gold" size="small">🔥 高转化时段</a-tag>
            </div>
            <div class="script-card__text">{{ script.text }}</div>
            <div class="script-card__footer">
              <span class="script-card__source">{{ script.time }}</span>
              <div class="script-card__actions">
                <a-button type="link" size="small" @click="copyScript(script.text)">复制</a-button>
                <a-button type="link" size="small" @click="favoriteScript(script)">收藏</a-button>
              </div>
            </div>
          </div>
        </div>
      </a-tab-pane>

      <!-- Tab: 话术词云 -->
      <a-tab-pane key="wordcloud" tab="话术词云">
        <a-card title="主播高频用词" :bordered="false">
          <a-empty v-if="!topKeywords.length" description="暂无话术数据，无法生成词云" />
          <div v-else class="tagcloud-box">
            <span v-for="(kw, idx) in topKeywords" :key="idx" class="tagcloud-word"
              :style="{ fontSize: Math.max(14, Math.min(42, 14 + kw.pct * 0.3)) + 'px',
                color: ['#1677FF','#722ED1','#13C2C2','#FF4D4F','#FF8A00','#52c41a','#2F54EB','#EB2F96','#FAAD14','#36CFC9'][idx % 10],
                fontWeight: idx < 3 ? '700' : '500',
                opacity: Math.max(0.6, 1 - idx * 0.03) }">
              {{ kw.text || kw.word }}
            </span>
          </div>
        </a-card>
        <a-card title="高频关键词排行" :bordered="false" style="margin-top: 12px">
          <div class="keyword-grid">
            <div v-for="(kw, idx) in topKeywords" :key="idx" class="keyword-item">
              <span class="keyword-item__rank" :class="{ 'top3': idx < 3 }">{{ idx + 1 }}</span>
              <span class="keyword-item__word">{{ kw.text || kw.word }}</span>
              <a-progress :percent="kw.pct" size="small" :show-info="false" style="flex: 1" :stroke-color="idx < 3 ? '#FF4D4F' : '#1677FF'" />
              <span class="keyword-item__count">{{ kw.count }}次</span>
            </div>
          </div>
        </a-card>
      </a-tab-pane>

      <!-- Tab: 弹幕分析 -->
      <a-tab-pane key="danmaku" tab="弹幕分析">
        <div class="danmaku-analysis">
          <div class="analysis-cards">
            <a-card :bordered="false" title="用户关注热点">
              <div class="hot-topic" v-for="(topic, idx) in hotTopics" :key="idx">
                <span class="hot-topic__rank">{{ idx + 1 }}</span>
                <span class="hot-topic__text">{{ topic.text }}</span>
                <span class="hot-topic__count">{{ topic.count }}条</span>
              </div>
            </a-card>
            <a-card :bordered="false" title="用户疑问点">
              <div class="question-item" v-for="(q, idx) in userQuestions" :key="idx">
                <span class="question-item__icon">❓</span>
                <span class="question-item__text">{{ q.text }}</span>
                <span class="question-item__count">{{ q.count }}人问</span>
              </div>
            </a-card>
          </div>
          <a-card :bordered="false" title="弹幕情感分布" style="margin-top: 12px">
            <div ref="sentimentChartRef" class="chart-box-sm"></div>
          </a-card>
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

const selectedRoom = ref(1)
const activeTab = ref('realtime')
const isRecording = ref(false)
const recordDuration = ref('--:--:--')
const exporting = ref(false)
const scriptCategory = ref('全部')
const searchKeyword = ref('')
const rooms = ref([])

const loadRooms = async () => {
  try {
    const res = await request.get('/live/rooms')
    if (res?.data?.length) {
      rooms.value = res.data.map(r => ({ id: r.id, nickname: r.nickname }))
      if (!rooms.value.find(r => r.id === selectedRoom.value) && rooms.value.length) {
        selectedRoom.value = rooms.value[0].id
      }
    }
  } catch (e) { console.warn('loadRooms failed', e) }
}

const realtimeScripts = ref([])
const scriptLibrary = ref([])
const topKeywords = ref([])
const hotTopics = ref([])
const userQuestions = ref([])
const danmakuSentiment = ref([])

const filteredScripts = computed(() => {
  let list = scriptLibrary.value
  if (scriptCategory.value !== '全部') {
    const filterKey = categoryReverseMap[scriptCategory.value] || scriptCategory.value
    list = list.filter(s => s.category === filterKey || s.category === scriptCategory.value)
  }
  if (searchKeyword.value) list = list.filter(s => s.text.includes(searchKeyword.value))
  return list
})

const loadSpeechData = async () => {
  try {
    const res = await request.get(`/live/rooms/${selectedRoom.value}/speech`)
    if (res && res.data) {
      const data = res.data
      realtimeScripts.value = data.realtime || []
      scriptLibrary.value = data.library || []
      isRecording.value = !!data.is_recording
      recordDuration.value = data.record_duration || '--:--:--'
      // Extract keywords from speech data if provided
      if (data.keywords && data.keywords.length) {
        const maxCount = data.keywords[0].count || 1
        topKeywords.value = data.keywords.map(k => ({
          ...k,
          pct: Math.round((k.count / maxCount) * 100)
        }))
      } else {
        topKeywords.value = []
      }
    }
  } catch (e) {
    realtimeScripts.value = []
    scriptLibrary.value = []
    topKeywords.value = []
  }
}

const loadDanmakuData = async () => {
  try {
    const res = await request.get(`/live/rooms/${selectedRoom.value}/danmaku`)
    if (res && res.data) {
      const data = res.data
      hotTopics.value = data.hot_topics || []
      userQuestions.value = data.questions || []
      danmakuSentiment.value = data.sentiment || []
    }
  } catch (e) {
    hotTopics.value = []
    userQuestions.value = []
    danmakuSentiment.value = []
  }
}

const categoryLabelMap = { selling_point: '卖点讲解', push_sale: '逼单促单', welfare: '福利发放', interact: '互动留人', product_intro: '产品介绍', other: '其他' }
const categoryLabel = (c) => categoryLabelMap[c] || c
const categoryTagColor = (c) => ({ selling_point: 'blue', push_sale: 'red', welfare: 'gold', interact: 'green', product_intro: 'purple', '卖点讲解': 'blue', '逼单促单': 'red', '福利发放': 'gold', '互动留人': 'green', '产品介绍': 'purple' }[c] || 'default')
const categoryReverseMap = { '卖点讲解': 'selling_point', '逼单促单': 'push_sale', '福利发放': 'welfare', '互动留人': 'interact', '产品介绍': 'product_intro' }
const stopRecording = () => { isRecording.value = false; message.info('已停止录制') }
const copyScript = (text) => { navigator.clipboard?.writeText(text); message.success('已复制') }
const favoriteScript = () => { message.success('已收藏') }
const filterScripts = () => {}
const exportScripts = async () => {
  exporting.value = true
  setTimeout(() => { exporting.value = false; message.success('话术已导出') }, 1000)
}

const wordcloudChartRef = ref(null)
const sentimentChartRef = ref(null)
let charts = {}

watch(activeTab, async (v) => {
  await nextTick()
  if (v === 'wordcloud' && wordcloudChartRef.value && topKeywords.value.length) {
    charts.wordcloud?.dispose()
    charts.wordcloud = echarts.init(wordcloudChartRef.value)
    const words = topKeywords.value
    charts.wordcloud.setOption({
      tooltip: {},
      xAxis: { show: false, min: 0, max: 100 },
      yAxis: { show: false, min: 0, max: 100 },
      series: [{
        type: 'scatter', symbolSize: (val) => val[2] * 3,
        label: { show: true, formatter: (p) => p.data[3], fontSize: (p) => Math.max(12, p.data[2] * 1.5), color: '#1677FF' },
        itemStyle: { color: 'rgba(22,119,255,0.1)' },
        data: words.map((w, i) => [10 + (i % 4) * 25 + (i * 7 % 10), 80 - Math.floor(i / 4) * 25 + (i * 3 % 10), w.pct / 5, w.word])
      }]
    })
  }
  if (v === 'danmaku') {
    await loadDanmakuData()
    await nextTick()
    if (sentimentChartRef.value && danmakuSentiment.value.length) {
      charts.sentiment?.dispose()
      charts.sentiment = echarts.init(sentimentChartRef.value)
      charts.sentiment.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{
          type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'],
          data: danmakuSentiment.value
        }]
      })
    }
  }
})

watch(selectedRoom, () => { loadSpeechData() })

onMounted(() => { loadRooms(); loadSpeechData() })
onUnmounted(() => { Object.values(charts).forEach(c => c?.dispose()) })
</script>

<style scoped>
.live-speech { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; margin: 0; }
.page-header__actions { display: flex; gap: 8px; }

.status-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #FFF7E6; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
.status-bar__dot { width: 8px; height: 8px; border-radius: 50%; background: #FF4D4F; animation: pulse 1.5s infinite; }
.status-bar__text { font-weight: 500; }
.status-bar__duration { color: var(--text-hint); margin-left: auto; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.speech-stream { display: flex; flex-direction: column; gap: 10px; }
.speech-segment { padding: 14px; background: #fff; border-radius: 10px; border: 1px solid var(--border); }
.speech-segment--highlight { border-left: 3px solid #FF8A00; background: #FFFBE6; }
.speech-segment__header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.speech-segment__time { font-size: 11px; color: var(--text-hint); }
.speech-segment__text { font-size: 14px; line-height: 1.6; color: var(--text-primary); }
.speech-segment__metrics { display: flex; gap: 8px; margin-top: 8px; }
.metric-tag { font-size: 11px; padding: 2px 8px; background: var(--bg-secondary); border-radius: 4px; color: var(--text-secondary); }

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.script-library { display: flex; flex-direction: column; gap: 10px; }
.script-card { padding: 14px; background: #fff; border-radius: 10px; border: 1px solid var(--border); }
.script-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.script-card__stats { display: flex; gap: 12px; }
.stat-mini { font-size: 11px; color: var(--text-hint); }
.stat-mini b { color: var(--c-primary); }
.script-card__text { font-size: 13px; line-height: 1.6; color: var(--text-primary); margin-bottom: 8px; }
.script-card__footer { display: flex; justify-content: space-between; align-items: center; }
.script-card__source { font-size: 11px; color: var(--text-hint); }

.chart-box { height: 300px; }
.chart-box-sm { height: 240px; }

/* 词云标签 */
.tagcloud-box { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; justify-content: center; padding: 20px 10px; min-height: 120px; }
.tagcloud-word { display: inline-block; cursor: default; transition: transform 0.2s; line-height: 1.4; }
.tagcloud-word:hover { transform: scale(1.15); }

.keyword-grid { display: flex; flex-direction: column; gap: 8px; }
.keyword-item { display: flex; align-items: center; gap: 8px; }
.keyword-item__rank { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: var(--text-hint); flex-shrink: 0; }
.keyword-item__rank.top3 { background: var(--c-primary); color: #fff; }
.keyword-item__word { font-size: 13px; font-weight: 500; width: 60px; flex-shrink: 0; }
.keyword-item__count { font-size: 11px; color: var(--text-hint); white-space: nowrap; }

.analysis-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hot-topic, .question-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--divider); font-size: 13px; }
.hot-topic__rank { width: 20px; height: 20px; border-radius: 4px; background: var(--c-primary-bg); color: var(--c-primary); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.hot-topic__text, .question-item__text { flex: 1; }
.hot-topic__count, .question-item__count { font-size: 11px; color: var(--text-hint); white-space: nowrap; }
.question-item__icon { font-size: 14px; }

@media (max-width: 767px) {
  .analysis-cards { grid-template-columns: 1fr; }
  .filter-bar { flex-direction: column; align-items: stretch; }
}
</style>
