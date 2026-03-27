<template>
  <div class="live-speech">
    <div class="page-header">
      <h2 class="page-title">话术抓取</h2>
      <div class="page-header__actions">
        <a-select v-model:value="selectedRoom" style="width: 180px" placeholder="选择直播间">
          <a-select-option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.nickname }}</a-select-option>
        </a-select>
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
              <a-tag :color="categoryTagColor(segment.category)" size="small">{{ segment.category }}</a-tag>
            </div>
            <div class="speech-segment__text">{{ segment.text }}</div>
            <div class="speech-segment__metrics" v-if="segment.metrics">
              <span class="metric-tag">转化率 {{ segment.metrics.cvr }}</span>
              <span class="metric-tag">GMV {{ segment.metrics.gmv }}</span>
              <span class="metric-tag">订单 {{ segment.metrics.orders }}</span>
            </div>
          </div>
          <a-empty v-if="!realtimeScripts.length" description="暂无话术数据" />
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
              <a-tag :color="categoryTagColor(script.category)" size="small">{{ script.category }}</a-tag>
              <div class="script-card__stats">
                <span class="stat-mini">转化率 <b>{{ script.cvr }}</b></span>
                <span class="stat-mini">使用 <b>{{ script.use_count }}次</b></span>
              </div>
            </div>
            <div class="script-card__text">{{ script.text }}</div>
            <div class="script-card__footer">
              <span class="script-card__source">{{ script.source }} · {{ script.date }}</span>
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
        <a-card :bordered="false">
          <div ref="wordcloudChartRef" class="chart-box"></div>
        </a-card>
        <a-card title="高频关键词" :bordered="false" style="margin-top: 12px">
          <div class="keyword-grid">
            <div v-for="(kw, idx) in topKeywords" :key="idx" class="keyword-item">
              <span class="keyword-item__rank" :class="{ 'top3': idx < 3 }">{{ idx + 1 }}</span>
              <span class="keyword-item__word">{{ kw.word }}</span>
              <a-progress :percent="kw.pct" size="small" :show-info="false" style="flex: 1" />
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
const isRecording = ref(true)
const recordDuration = ref('01:23:45')
const exporting = ref(false)
const scriptCategory = ref('全部')
const searchKeyword = ref('')
const rooms = ref([
  { id: 1, nickname: '好物推荐官' },
  { id: 2, nickname: '美妆达人小美' },
])

const realtimeScripts = ref([
  { time: '14:32:05', category: '逼单促单', text: '家人们，这个价格真的只有今天！库存只剩最后200单了，拍到就是赚到，犹豫就没了！', is_high_convert: true, metrics: { cvr: '8.5%', gmv: '¥12,800', orders: 160 } },
  { time: '14:28:30', category: '卖点讲解', text: '这款精华液用的是专利成分，渗透力是普通产品的3倍，上脸就能感觉到水润感，不是那种假滑的感觉。', is_high_convert: true, metrics: { cvr: '6.2%', gmv: '¥8,500', orders: 106 } },
  { time: '14:25:10', category: '福利发放', text: '来，给直播间的家人们上一波福利！前50名下单的送一支价值89块的面膜，快去拍！', is_high_convert: false, metrics: null },
  { time: '14:22:00', category: '互动留人', text: '新来的家人们点个关注不迷路，今天直播间还有更多优惠，千万不要走开！', is_high_convert: false, metrics: null },
  { time: '14:18:45', category: '产品介绍', text: '我手上这款是我们家的明星产品，月销10万+，好评率99.2%，你去看看评价区，全是回购的老客户。', is_high_convert: true, metrics: { cvr: '5.8%', gmv: '¥6,200', orders: 78 } },
  { time: '14:15:20', category: '逼单促单', text: '3、2、1上链接！大家快去拍，这波优惠力度全年最大的！', is_high_convert: true, metrics: { cvr: '12.3%', gmv: '¥18,900', orders: 236 } },
])

const scriptLibrary = ref([
  { id: 1, category: '逼单促单', text: '家人们抓紧时间，这个价格今天过后恢复原价，库存不等人！3、2、1上链接！', cvr: '12.3%', use_count: 58, source: '好物推荐官', date: '03-27' },
  { id: 2, category: '卖点讲解', text: '这款产品用的是医美级成分，和大牌同源工厂，但价格只有大牌的1/5，性价比超高！', cvr: '8.5%', use_count: 42, source: '美妆达人', date: '03-27' },
  { id: 3, category: '福利发放', text: '感谢家人们的支持！现在直播间专属福利，买一送一，只限100单！', cvr: '9.1%', use_count: 35, source: '好物推荐官', date: '03-26' },
  { id: 4, category: '互动留人', text: '新来的朋友们扣个1，让我看看有多少人想要今天的福利！', cvr: '3.2%', use_count: 80, source: '好物推荐官', date: '03-26' },
  { id: 5, category: '产品介绍', text: '看我手上这个质地，水润不油腻，吸收特别快，干皮油皮都能用！', cvr: '6.8%', use_count: 28, source: '美妆达人', date: '03-25' },
])

const filteredScripts = computed(() => {
  let list = scriptLibrary.value
  if (scriptCategory.value !== '全部') list = list.filter(s => s.category === scriptCategory.value)
  if (searchKeyword.value) list = list.filter(s => s.text.includes(searchKeyword.value))
  return list
})

const topKeywords = ref([
  { word: '优惠', count: 256, pct: 100 },
  { word: '质量好', count: 198, pct: 77 },
  { word: '性价比', count: 167, pct: 65 },
  { word: '回购', count: 145, pct: 57 },
  { word: '好用', count: 132, pct: 52 },
  { word: '推荐', count: 120, pct: 47 },
  { word: '包装精美', count: 98, pct: 38 },
  { word: '发货快', count: 87, pct: 34 },
])

const hotTopics = ref([
  { text: '产品成分/功效', count: 156 },
  { text: '价格优惠力度', count: 134 },
  { text: '使用方法', count: 98 },
  { text: '适合肤质', count: 76 },
  { text: '发货时间', count: 65 },
])
const userQuestions = ref([
  { text: '敏感肌可以用吗？', count: 45 },
  { text: '保质期多久？', count: 38 },
  { text: '能和其他产品叠加使用吗？', count: 32 },
  { text: '有没有色差？', count: 28 },
  { text: '退换货方便吗？', count: 22 },
])

const categoryTagColor = (c) => ({ '卖点讲解': 'blue', '逼单促单': 'red', '福利发放': 'gold', '互动留人': 'green', '产品介绍': 'purple' }[c] || 'default')
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
  if (v === 'wordcloud' && wordcloudChartRef.value) {
    charts.wordcloud?.dispose()
    charts.wordcloud = echarts.init(wordcloudChartRef.value)
    // Simulated word cloud using scatter
    const words = topKeywords.value
    charts.wordcloud.setOption({
      tooltip: {},
      xAxis: { show: false, min: 0, max: 100 },
      yAxis: { show: false, min: 0, max: 100 },
      series: [{
        type: 'scatter', symbolSize: (val) => val[2] * 3,
        label: { show: true, formatter: (p) => p.data[3], fontSize: (p) => Math.max(12, p.data[2] * 1.5), color: '#1677FF' },
        itemStyle: { color: 'rgba(22,119,255,0.1)' },
        data: words.map((w, i) => [10 + (i % 4) * 25 + Math.random() * 10, 80 - Math.floor(i / 4) * 25 + Math.random() * 10, w.pct / 5, w.word])
      }]
    })
  }
  if (v === 'danmaku' && sentimentChartRef.value) {
    charts.sentiment?.dispose()
    charts.sentiment = echarts.init(sentimentChartRef.value)
    charts.sentiment.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'],
        data: [
          { value: 62, name: '正面', itemStyle: { color: '#00B96B' } },
          { value: 28, name: '中性', itemStyle: { color: '#1677FF' } },
          { value: 10, name: '负面', itemStyle: { color: '#FF4D4F' } },
        ]
      }]
    })
  }
})

onMounted(() => {})
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
