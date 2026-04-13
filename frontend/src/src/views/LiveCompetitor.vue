<template>
  <div class="live-competitor">
    <div class="page-header">
      <h2 class="page-title">竞品监控</h2>
      <div class="page-header__actions">
        <a-button type="primary" @click="showAddCompetitor = true">添加竞品</a-button>
        <a-button @click="loadCompetitors">刷新</a-button>
      </div>
    </div>

    <!-- Competitor List -->
    <div class="competitor-grid">
      <div v-for="comp in competitors" :key="comp.id" class="competitor-card" :class="{ 'competitor-card--live': comp.is_living }">
        <div class="competitor-card__header">
          <div class="competitor-card__avatar">{{ comp.nickname?.charAt(0) || 'C' }}</div>
          <div class="competitor-card__info">
            <div class="competitor-card__name">{{ comp.nickname }}</div>
            <div class="competitor-card__id">ID: {{ comp.room_id }}</div>
          </div>
          <a-tag :color="comp.is_living ? 'red' : 'default'" size="small">{{ comp.is_living ? '直播中' : '未开播' }}</a-tag>
        </div>

        <div v-if="comp.is_living" class="competitor-card__live-data">
          <div class="comp-metric">
            <span class="comp-metric__label">在线</span>
            <span class="comp-metric__value">{{ formatNum(comp.online_count) }}</span>
          </div>
          <div class="comp-metric">
            <span class="comp-metric__label">场观</span>
            <span class="comp-metric__value">{{ formatNum(comp.total_viewers) }}</span>
          </div>
          <div class="comp-metric">
            <span class="comp-metric__label">GMV</span>
            <span class="comp-metric__value">¥{{ formatNum(comp.gmv) }}</span>
          </div>
          <div class="comp-metric">
            <span class="comp-metric__label">千川</span>
            <span class="comp-metric__value">{{ comp.paid_ratio }}%</span>
          </div>
        </div>

        <div class="competitor-card__tags" v-if="comp.hot_products?.length">
          <span class="comp-tag">爆款:</span>
          <a-tag v-for="(p, idx) in comp.hot_products" :key="idx" size="small">{{ p }}</a-tag>
        </div>

        <div class="competitor-card__footer">
          <a-button type="link" size="small" @click="viewDetail(comp)">详情分析</a-button>
          <a-button type="link" size="small" @click="compareSelf(comp)">对标分析</a-button>
          <a-button type="link" size="small" danger @click="removeCompetitor(comp.id)">移除</a-button>
        </div>
      </div>
    </div>

    <!-- Detail Section -->
    <template v-if="selectedComp">
      <a-divider />
      <div class="detail-header">
        <h3>{{ selectedComp.nickname }} - 详细分析</h3>
        <a-segmented v-model:value="detailTab" :options="['实时数据', '话术分析', '货品策略', '投放节奏']" />
      </div>

      <template v-if="detailTab === '实时数据'">
        <a-card :bordered="false" style="margin-top: 12px">
          <div ref="compChartRef" class="chart-box"></div>
        </a-card>
      </template>

      <template v-if="detailTab === '话术分析'">
        <a-card title="竞品高转化话术" :bordered="false" style="margin-top: 12px">
          <div class="comp-speech-list">
            <div v-for="(speech, idx) in compSpeechList" :key="idx" class="comp-speech-item">
              <div class="comp-speech-item__header">
                <a-tag :color="speech.tag_color" size="small">{{ speech.category }}</a-tag>
                <span class="comp-speech-item__time">{{ speech.time }}</span>
              </div>
              <div class="comp-speech-item__text">{{ speech.text }}</div>
              <div class="comp-speech-item__action">
                <a-button type="link" size="small" @click="copyScript(speech.text)">复制借鉴</a-button>
              </div>
            </div>
          </div>
        </a-card>
      </template>

      <template v-if="detailTab === '货品策略'">
        <a-card title="竞品商品销售排行" :bordered="false" style="margin-top: 12px">
          <a-table :dataSource="compProducts" :columns="productColumns" :pagination="false" size="small" />
        </a-card>
      </template>

      <template v-if="detailTab === '投放节奏'">
        <a-card title="千川投放节奏" :bordered="false" style="margin-top: 12px">
          <div ref="adChartRef" class="chart-box"></div>
        </a-card>
        <a-card title="投放策略洞察" :bordered="false" style="margin-top: 12px">
          <div class="insight-list">
            <div class="insight-item" v-for="(ins, idx) in adInsights" :key="idx">
              <span class="insight-item__icon">{{ ins.icon }}</span>
              <span class="insight-item__text">{{ ins.text }}</span>
            </div>
          </div>
        </a-card>
      </template>
    </template>

    <!-- Benchmark Compare -->
    <a-card title="对标分析" :bordered="false" style="margin-top: 16px" v-if="benchmarkData.length">
      <a-table :dataSource="benchmarkData" :columns="benchmarkColumns" :pagination="false" size="small" />
    </a-card>

    <!-- Add Competitor Drawer -->
    <a-drawer v-model:open="showAddCompetitor" title="添加竞品直播间" :width="isMobile ? '100%' : 480" placement="right">
      <a-form layout="vertical">
        <a-form-item label="直播间ID / 链接 / 昵称">
          <a-textarea v-model:value="addForm.input" placeholder="输入直播间ID、链接或主播昵称，每行一个" :rows="4" />
        </a-form-item>
        <a-form-item label="监控模式">
          <a-checkbox-group v-model:value="addForm.monitors">
            <a-checkbox value="traffic">流量数据</a-checkbox>
            <a-checkbox value="sales">销售数据</a-checkbox>
            <a-checkbox value="speech">话术抓取</a-checkbox>
            <a-checkbox value="product">货品策略</a-checkbox>
            <a-checkbox value="ad">投放节奏</a-checkbox>
          </a-checkbox-group>
        </a-form-item>
      </a-form>
      <div class="drawer-footer">
        <a-button @click="showAddCompetitor = false" style="margin-right: 8px">取消</a-button>
        <a-button type="primary" @click="addCompetitor">添加监控</a-button>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'

const isMobile = ref(window.innerWidth < 768)
const showAddCompetitor = ref(false)
const selectedComp = ref(null)
const detailTab = ref('实时数据')
const addForm = reactive({ input: '', monitors: ['traffic', 'sales', 'speech'] })

const formatNum = (n) => { if (!n) return '0'; if (n >= 10000) return (n / 10000).toFixed(1) + 'w'; return n.toLocaleString() }

const competitors = ref([
  { id: 1, room_id: '73123456', nickname: '同行品牌A', is_living: true, online_count: 4200, total_viewers: 32000, gmv: 210000, paid_ratio: 45, hot_products: ['美白精华', '补水面膜'] },
  { id: 2, room_id: '73234567', nickname: '同行品牌B', is_living: true, online_count: 2800, total_viewers: 18000, gmv: 95000, paid_ratio: 38, hot_products: ['防晒霜', '洁面乳'] },
  { id: 3, room_id: '73345678', nickname: '头部竞品C', is_living: false, online_count: 0, total_viewers: 0, gmv: 0, paid_ratio: 0, hot_products: ['精华套装'] },
])

const compSpeechList = ref([
  { category: '逼单促单', tag_color: 'red', time: '14:32', text: '家人们倒数3秒，3、2、1！链接马上要下了！库存只有最后50单！' },
  { category: '卖点讲解', tag_color: 'blue', time: '14:28', text: '我们这个成分是和国际大牌同一个实验室出来的，效果一样，价格只要1/10！' },
  { category: '福利发放', tag_color: 'gold', time: '14:20', text: '新来的粉丝加关注，今天直播间粉丝专属价，比日常价便宜50块！' },
])

const compProducts = ref([
  { key: 1, name: '美白精华液50ml', price: '¥89', sales: 1560, revenue: '¥138,840', rank: 1 },
  { key: 2, name: '补水面膜10片装', price: '¥49', sales: 980, revenue: '¥48,020', rank: 2 },
  { key: 3, name: '抗衰精华30ml', price: '¥129', sales: 450, revenue: '¥58,050', rank: 3 },
])
const productColumns = [
  { title: '排名', dataIndex: 'rank', key: 'rank', width: 60 },
  { title: '商品', dataIndex: 'name', key: 'name' },
  { title: '价格', dataIndex: 'price', key: 'price' },
  { title: '销量', dataIndex: 'sales', key: 'sales' },
  { title: '销售额', dataIndex: 'revenue', key: 'revenue' },
]

const adInsights = ref([
  { icon: '📊', text: '竞品在14:00-15:00集中投放，千川消耗占全天58%，推荐错峰投放' },
  { icon: '🎯', text: '竞品主投"产品对比类"素材，点击率约4.2%，高于行业均值' },
  { icon: '💡', text: '竞品千川ROI在2.5左右，使用"限时折扣+赠品"的投放策略' },
  { icon: '⏰', text: '竞品每30分钟调整一次出价，建议设置自动跟价策略' },
])

const benchmarkData = ref([])
const benchmarkColumns = [
  { title: '指标', dataIndex: 'metric', key: 'metric' },
  { title: '我方', dataIndex: 'self', key: 'self' },
  { title: '竞品', dataIndex: 'comp', key: 'comp' },
  { title: '差距', dataIndex: 'gap', key: 'gap' },
  { title: '建议', dataIndex: 'suggestion', key: 'suggestion' },
]

const viewDetail = (comp) => {
  selectedComp.value = comp
  detailTab.value = '实时数据'
  nextTick(() => initDetailChart())
}
const compareSelf = (comp) => {
  benchmarkData.value = [
    { key: 1, metric: '场观', self: '28,900', comp: formatNum(comp.total_viewers), gap: comp.total_viewers > 28900 ? '落后' : '领先', suggestion: '增加千川投放预算' },
    { key: 2, metric: 'GMV', self: '¥186,500', comp: '¥' + formatNum(comp.gmv), gap: comp.gmv > 186500 ? '落后' : '领先', suggestion: '优化话术+增加SKU' },
    { key: 3, metric: '在线峰值', self: '5,230', comp: formatNum(comp.online_count), gap: comp.online_count > 5230 ? '落后' : '领先', suggestion: '加大互动环节频率' },
    { key: 4, metric: '付费占比', self: '41.8%', comp: comp.paid_ratio + '%', gap: '-', suggestion: '平衡自然与付费流量' },
  ]
  message.success(`已生成与${comp.nickname}的对标分析`)
}
const removeCompetitor = (id) => { competitors.value = competitors.value.filter(c => c.id !== id); message.success('已移除') }
const loadCompetitors = () => { message.success('已刷新') }
const addCompetitor = () => { showAddCompetitor.value = false; message.success('已添加(演示)') }
const copyScript = (text) => { navigator.clipboard?.writeText(text); message.success('已复制') }

const compChartRef = ref(null)
const adChartRef = ref(null)
let charts = {}

const initDetailChart = async () => {
  await nextTick()
  if (compChartRef.value) {
    charts.comp?.dispose()
    charts.comp = echarts.init(compChartRef.value)
    const times = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(); d.setMinutes(d.getMinutes() - (19 - i) * 5)
      return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
    })
    charts.comp.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['在线人数', 'GMV'] },
      grid: { left: 50, right: 40, top: 32, bottom: 24 },
      xAxis: { type: 'category', data: times },
      yAxis: [{ type: 'value', name: '人数' }, { type: 'value', name: '元' }],
      series: [
        { name: '在线人数', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, lineStyle: { color: '#1677FF' }, itemStyle: { color: '#1677FF' }, data: times.map(() => Math.floor(2000 + Math.random() * 3000)) },
        { name: 'GMV', type: 'bar', yAxisIndex: 1, itemStyle: { color: '#FF8A00', borderRadius: [3, 3, 0, 0] }, data: times.map(() => Math.floor(5000 + Math.random() * 20000)) },
      ]
    })
  }
}

watch(detailTab, async (v) => {
  if (v === '实时数据') initDetailChart()
  if (v === '投放节奏') {
    await nextTick()
    if (adChartRef.value) {
      charts.ad?.dispose()
      charts.ad = echarts.init(adChartRef.value)
      const hours = Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)
      charts.ad.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['千川消耗', '付费流量', 'ROI'] },
        grid: { left: 50, right: 50, top: 32, bottom: 24 },
        xAxis: { type: 'category', data: hours },
        yAxis: [{ type: 'value', name: '元/人' }, { type: 'value', name: 'ROI' }],
        series: [
          { name: '千川消耗', type: 'bar', itemStyle: { color: '#FF4D4F', borderRadius: [3, 3, 0, 0] }, data: hours.map(() => Math.floor(1000 + Math.random() * 5000)) },
          { name: '付费流量', type: 'bar', itemStyle: { color: '#1677FF', borderRadius: [3, 3, 0, 0] }, data: hours.map(() => Math.floor(200 + Math.random() * 800)) },
          { name: 'ROI', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#00B96B' }, itemStyle: { color: '#00B96B' }, data: hours.map(() => (1 + Math.random() * 3).toFixed(2)) },
        ]
      })
    }
  }
})

onMounted(() => {})
onUnmounted(() => { Object.values(charts).forEach(c => c?.dispose()) })
</script>

<style scoped>
.live-competitor { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; margin: 0; }
.page-header__actions { display: flex; gap: 8px; }

.competitor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.competitor-card { background: #fff; border-radius: 10px; padding: 16px; border: 1px solid var(--border); }
.competitor-card--live { border-left: 3px solid #FF4D4F; }
.competitor-card__header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.competitor-card__avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; }
.competitor-card__name { font-weight: 600; font-size: 14px; }
.competitor-card__id { font-size: 11px; color: var(--text-hint); }
.competitor-card__live-data { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.comp-metric { text-align: center; padding: 8px 4px; background: var(--bg-secondary); border-radius: 6px; }
.comp-metric__label { font-size: 10px; color: var(--text-hint); display: block; }
.comp-metric__value { font-size: 14px; font-weight: 700; display: block; margin-top: 2px; }
.competitor-card__tags { display: flex; align-items: center; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
.comp-tag { font-size: 11px; color: var(--text-hint); }
.competitor-card__footer { display: flex; justify-content: flex-end; }

.detail-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.detail-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.chart-box { height: 280px; }

.comp-speech-list { display: flex; flex-direction: column; gap: 10px; }
.comp-speech-item { padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
.comp-speech-item__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.comp-speech-item__time { font-size: 11px; color: var(--text-hint); }
.comp-speech-item__text { font-size: 13px; line-height: 1.6; }
.comp-speech-item__action { text-align: right; margin-top: 4px; }

.insight-list { display: flex; flex-direction: column; gap: 10px; }
.insight-item { display: flex; align-items: flex-start; gap: 8px; padding: 10px; background: var(--bg-secondary); border-radius: 8px; }
.insight-item__icon { font-size: 18px; flex-shrink: 0; }
.insight-item__text { font-size: 13px; line-height: 1.6; }

.drawer-footer { display: flex; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--divider); margin-top: 16px; }

@media (max-width: 767px) {
  .competitor-grid { grid-template-columns: 1fr; }
  .competitor-card__live-data { grid-template-columns: repeat(2, 1fr); }
}
</style>
