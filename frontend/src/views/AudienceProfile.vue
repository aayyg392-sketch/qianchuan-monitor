<template>
  <div class="audience-page">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="page-label">产品人群画像</div>
      <div class="preset-tabs">
        <button
          v-for="p in presets"
          :key="p.key"
          class="preset-tab"
          :class="{ active: activePreset === p.key }"
          @click="applyPreset(p)"
        >{{ p.label }}</button>
      </div>
      <button class="action-btn" @click="openEntry" title="录入数据">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>

    <!-- 数据来源提示 -->
    <div v-if="dataSource" class="source-tip">
      <span v-if="dataSource === 'manual'">数据来源：手动录入/导入</span>
      <span v-else-if="dataSource === 'local'">数据来源：本地聚合</span>
      <span v-else>数据来源：{{ dataSource }}</span>
    </div>

    <!-- 首次引导提示 -->
    <div v-if="showGuide && !loading" class="guide-card">
      <div class="guide-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="1.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </div>
      <p class="guide-title">录入人群画像数据</p>
      <p class="guide-desc">从千川后台「数据中心→受众分析」或抖店后台「数据→用户画像」获取数据，点击上方编辑按钮录入</p>
      <button class="guide-btn" @click="openEntry">开始录入</button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>正在加载人群画像...</p>
    </div>

    <!-- 图表区域 -->
    <div v-else class="profile-grid">
      <!-- ====== 基础画像 ====== -->
      <div class="section-title full-width" v-if="profileData.gender?.length || profileData.age?.length">基础画像</div>

      <!-- 性别分布 -->
      <div class="chart-card" v-if="profileData.gender?.length">
        <div class="chart-header">
          <div class="chart-title">性别分布</div>
          <button class="edit-icon-btn" @click="openEntry('gender')" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        <div ref="genderChartRef" class="chart-box"></div>
        <div class="chart-legend">
          <div v-for="g in profileData.gender" :key="g.key" class="legend-item">
            <span class="legend-dot" :style="{ background: g.key === '女' ? '#FF6B9D' : '#1677FF' }"></span>
            <span class="legend-label">{{ g.key }}</span>
            <span class="legend-value">{{ g.pct }}%</span>
            <span class="legend-count">{{ formatNum(g.pay_order_count) }}单</span>
          </div>
        </div>
      </div>

      <!-- 年龄分布 -->
      <div class="chart-card" v-if="profileData.age?.length">
        <div class="chart-header">
          <div class="chart-title">年龄分布</div>
          <button class="edit-icon-btn" @click="openEntry('age')" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        <div ref="ageChartRef" class="chart-box"></div>
      </div>

      <!-- 地域分布 -->
      <div class="chart-card full-width" v-if="profileData.region?.length">
        <div class="chart-header">
          <div class="chart-title">常驻省份 <span class="chart-sub">Top 10</span></div>
          <button class="edit-icon-btn" @click="openEntry('region')" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        <div ref="regionChartRef" class="chart-box chart-box-tall"></div>
      </div>

      <!-- ====== 消费行为 ====== -->
      <div class="section-title full-width" v-if="profileData.order_value?.length || profileData.order_freq?.length || profileData.repurchase?.length">消费行为</div>

      <!-- 下单价值 -->
      <div class="chart-card" v-if="profileData.order_value?.length">
        <div class="chart-header">
          <div class="chart-title">下单价值</div>
        </div>
        <div ref="orderValueChartRef" class="chart-box"></div>
        <div class="chart-legend">
          <div v-for="(d, i) in profileData.order_value" :key="d.key" class="legend-item">
            <span class="legend-dot" :style="{ background: orderValueColors[i] || '#999' }"></span>
            <span class="legend-label">{{ d.key }}</span>
            <span class="legend-value">{{ d.pct }}%</span>
          </div>
        </div>
      </div>

      <!-- 首复购分布 -->
      <div class="chart-card" v-if="profileData.repurchase?.length">
        <div class="chart-header">
          <div class="chart-title">首复购分布</div>
        </div>
        <div ref="repurchaseChartRef" class="chart-box"></div>
        <div class="chart-legend">
          <div v-for="(d, i) in profileData.repurchase" :key="d.key" class="legend-item">
            <span class="legend-dot" :style="{ background: repurchaseColors[i] || '#999' }"></span>
            <span class="legend-label">{{ d.key }}</span>
            <span class="legend-value">{{ d.pct }}%</span>
          </div>
        </div>
      </div>

      <!-- 下单频次 -->
      <div class="chart-card" v-if="profileData.order_freq?.length">
        <div class="chart-header">
          <div class="chart-title">下单频次</div>
        </div>
        <div ref="orderFreqChartRef" class="chart-box chart-box-sm"></div>
      </div>

      <!-- 看播天数 -->
      <div class="chart-card" v-if="profileData.watch_days?.length">
        <div class="chart-header">
          <div class="chart-title">看播天数</div>
        </div>
        <div ref="watchDaysChartRef" class="chart-box chart-box-sm"></div>
      </div>

      <!-- ====== 兴趣偏好 ====== -->
      <div class="section-title full-width" v-if="profileData.industry_pref?.length || profileData.interest?.length">兴趣偏好</div>

      <!-- 行业偏好 -->
      <div class="chart-card full-width" v-if="profileData.industry_pref?.length">
        <div class="chart-header">
          <div class="chart-title">行业偏好 <span class="chart-sub">偏好指数 / TGI</span></div>
        </div>
        <div ref="industryPrefChartRef" class="chart-box chart-box-tall"></div>
      </div>

      <!-- 同行业商家偏好(竞品分析) -->
      <div class="chart-card full-width" v-if="profileData.competitor?.length">
        <div class="chart-header">
          <div class="chart-title">同行业商家偏好 <span class="chart-sub">偏好指数</span></div>
        </div>
        <div ref="competitorChartRef" class="chart-box chart-box-tall"></div>
      </div>

      <!-- 购买偏好(本地聚合) -->
      <div class="chart-card full-width" v-if="profileData.interest?.length">
        <div class="chart-header">
          <div class="chart-title">购买偏好 <span class="chart-sub">素材成交</span></div>
        </div>
        <div ref="interestChartRef" class="chart-box"></div>
      </div>

      <!-- ====== 营销工具 ====== -->
      <div class="section-title full-width" v-if="profileData.marketing_tool?.length">营销工具偏好</div>

      <div class="chart-card full-width" v-if="profileData.marketing_tool?.length">
        <div class="chart-header">
          <div class="chart-title">营销工具偏好</div>
        </div>
        <div ref="marketingToolChartRef" class="chart-box chart-box-sm"></div>
      </div>

      <!-- ====== 活跃时段 ====== -->
      <div class="chart-card full-width" v-if="profileData.active_time?.length">
        <div class="chart-header">
          <div class="chart-title">活跃时段分布</div>
        </div>
        <div ref="activeTimeChartRef" class="chart-box"></div>
      </div>
    </div>

    <!-- ==================== 录入弹窗 ==================== -->
    <div v-if="entryVisible" class="entry-overlay" @click.self="entryVisible = false">
      <div class="entry-panel">
        <div class="entry-header">
          <span class="entry-title">录入人群画像</span>
          <button class="entry-close" @click="entryVisible = false">&times;</button>
        </div>

        <!-- 维度Tab -->
        <div class="entry-tabs">
          <button v-for="t in entryTabs" :key="t.key" class="entry-tab"
            :class="{ active: activeEntryTab === t.key }" @click="activeEntryTab = t.key">
            {{ t.label }}
          </button>
        </div>

        <div class="entry-body">
          <!-- 性别录入 -->
          <div v-if="activeEntryTab === 'gender'" class="entry-section">
            <p class="entry-hint">输入成交单数（按比例自动计算百分比）</p>
            <div class="entry-form">
              <div v-for="(row, i) in entryForm.gender" :key="i" class="entry-row">
                <span class="entry-label" :style="{ color: row.key === '女' ? '#FF6B9D' : '#1677FF' }">{{ row.key }}</span>
                <input v-model.number="row.pay_order_count" type="number" class="entry-input" placeholder="成交单数">
                <span class="entry-unit">单</span>
              </div>
            </div>
          </div>

          <!-- 年龄录入 -->
          <div v-if="activeEntryTab === 'age'" class="entry-section">
            <p class="entry-hint">输入各年龄段的成交单数</p>
            <div class="entry-form">
              <div v-for="(row, i) in entryForm.age" :key="i" class="entry-row">
                <span class="entry-label">{{ row.key }}</span>
                <input v-model.number="row.pay_order_count" type="number" class="entry-input" placeholder="成交单数">
                <span class="entry-unit">单</span>
              </div>
            </div>
          </div>

          <!-- 地域录入 -->
          <div v-if="activeEntryTab === 'region'" class="entry-section">
            <p class="entry-hint">输入Top省份和成交单数，可增减行</p>
            <div class="entry-form">
              <div v-for="(row, i) in entryForm.region" :key="i" class="entry-row">
                <input v-model="row.key" type="text" class="entry-input entry-input-name" placeholder="省份">
                <input v-model.number="row.pay_order_count" type="number" class="entry-input" placeholder="成交单数">
                <button class="entry-row-del" @click="entryForm.region.splice(i, 1)" v-if="entryForm.region.length > 1">&times;</button>
              </div>
              <button class="entry-add-btn" @click="entryForm.region.push({ key: '', pay_order_count: 0 })">+ 添加省份</button>
            </div>
          </div>
        </div>

        <div class="entry-footer">
          <button class="entry-cancel" @click="entryVisible = false">取消</button>
          <button class="entry-save" @click="saveEntry" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import request from '../utils/request'

// ==================== 状态 ====================
const loading = ref(false)
const dataSource = ref('')
const profileData = ref({
  gender: [], age: [], region: [], interest: [], active_time: [],
  order_value: [], order_freq: [], watch_days: [], repurchase: [],
  industry_pref: [], competitor: [], marketing_tool: [],
})

const presets = [
  { key: '7d', label: '近7天', days: 7 },
  { key: '30d', label: '近30天', days: 30 },
  { key: '90d', label: '近90天', days: 90 },
]
const activePreset = ref('30d')

// 图表refs
const genderChartRef = ref(null)
const ageChartRef = ref(null)
const regionChartRef = ref(null)
const interestChartRef = ref(null)
const activeTimeChartRef = ref(null)
const orderValueChartRef = ref(null)
const orderFreqChartRef = ref(null)
const watchDaysChartRef = ref(null)
const repurchaseChartRef = ref(null)
const industryPrefChartRef = ref(null)
const competitorChartRef = ref(null)
const marketingToolChartRef = ref(null)

// 图表实例
let charts = {}

// 颜色常量
const orderValueColors = ['#52C41A', '#1677FF', '#FF8A00']
const repurchaseColors = ['#1677FF', '#FF6B9D']

// ==================== 录入弹窗 ====================
const entryVisible = ref(false)
const activeEntryTab = ref('gender')
const saving = ref(false)
const entryTabs = [
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'region', label: '地域' },
]
const entryForm = ref({
  gender: [
    { key: '女', pay_order_count: 0 },
    { key: '男', pay_order_count: 0 },
  ],
  age: [
    { key: '18-24岁', pay_order_count: 0 },
    { key: '25-30岁', pay_order_count: 0 },
    { key: '31-35岁', pay_order_count: 0 },
    { key: '36-40岁', pay_order_count: 0 },
    { key: '41-45岁', pay_order_count: 0 },
    { key: '46-50岁', pay_order_count: 0 },
    { key: '50岁以上', pay_order_count: 0 },
  ],
  region: [
    { key: '广东', pay_order_count: 0 },
    { key: '江西', pay_order_count: 0 },
    { key: '河南', pay_order_count: 0 },
    { key: '云南', pay_order_count: 0 },
    { key: '贵州', pay_order_count: 0 },
    { key: '浙江', pay_order_count: 0 },
    { key: '四川', pay_order_count: 0 },
    { key: '河北', pay_order_count: 0 },
    { key: '江苏', pay_order_count: 0 },
    { key: '广西', pay_order_count: 0 },
  ],
})

const showGuide = computed(() => {
  const d = profileData.value
  return !d.gender?.length && !d.age?.length && !d.order_value?.length && !loading.value
})

function openEntry(tab) {
  const d = profileData.value
  if (d.gender?.length) {
    entryForm.value.gender = d.gender.map(g => ({ key: g.key, pay_order_count: g.pay_order_count || 0 }))
    if (!entryForm.value.gender.find(g => g.key === '女')) entryForm.value.gender.unshift({ key: '女', pay_order_count: 0 })
    if (!entryForm.value.gender.find(g => g.key === '男')) entryForm.value.gender.push({ key: '男', pay_order_count: 0 })
  }
  if (d.age?.length) {
    entryForm.value.age = d.age.map(a => ({ key: a.key, pay_order_count: a.pay_order_count || 0 }))
  }
  if (d.region?.length) {
    entryForm.value.region = d.region.slice(0, 15).map(r => ({ key: r.key, pay_order_count: r.pay_order_count || 0 }))
  }
  activeEntryTab.value = (typeof tab === 'string') ? tab : 'gender'
  entryVisible.value = true
}

async function saveEntry() {
  if (saving.value) return
  saving.value = true
  try {
    for (const dim of ['gender', 'age', 'region']) {
      const data = entryForm.value[dim].filter(d => d.key && d.pay_order_count > 0)
      if (data.length === 0) continue
      await request.post('/audience/manual', {
        dimension: dim,
        data,
      })
    }
    entryVisible.value = false
    await loadProfile()
  } catch (e) {
    console.error('保存失败', e)
    alert('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// ==================== 日期计算 ====================
function getDateRange() {
  const preset = presets.find(p => p.key === activePreset.value)
  const end = dayjs().format('YYYY-MM-DD')
  const start = dayjs().subtract(preset?.days || 30, 'day').format('YYYY-MM-DD')
  return { start_date: start, end_date: end }
}

function applyPreset(p) {
  activePreset.value = p.key
  loadProfile()
}

// ==================== 数据加载 ====================
async function loadProfile() {
  loading.value = true
  dataSource.value = ''
  try {
    const { start_date, end_date } = getDateRange()
    const res = await request.get('/audience/profile', {
      params: { start_date, end_date }
    })
    if (res.code === 0 && res.data) {
      profileData.value = res.data
      dataSource.value = res.data._source || ''
      loading.value = false
      await nextTick()
      renderAllCharts()
    }
  } catch (e) {
    console.error('加载画像失败', e)
  } finally {
    loading.value = false
  }
}

// ==================== 图表渲染 ====================
function initChart(domRef, key) {
  if (!domRef) return null
  if (charts[key]) charts[key].dispose()
  charts[key] = echarts.init(domRef, null, { renderer: 'svg' })
  return charts[key]
}

function renderAllCharts() {
  const d = profileData.value
  if (d.gender?.length) renderGenderChart(d.gender)
  if (d.age?.length) renderAgeChart(d.age)
  if (d.region?.length) renderRegionChart(d.region)
  if (d.order_value?.length) renderPieChart(orderValueChartRef.value, 'orderValue', d.order_value, orderValueColors)
  if (d.repurchase?.length) renderPieChart(repurchaseChartRef.value, 'repurchase', d.repurchase, repurchaseColors)
  if (d.order_freq?.length) renderHBarChart(orderFreqChartRef.value, 'orderFreq', d.order_freq, '#1677FF', '#69B1FF')
  if (d.watch_days?.length) renderHBarChart(watchDaysChartRef.value, 'watchDays', d.watch_days, '#722ED1', '#B37FEB')
  if (d.industry_pref?.length) renderIndustryChart(d.industry_pref)
  if (d.competitor?.length) renderCompetitorChart(d.competitor)
  if (d.interest?.length) renderInterestChart(d.interest)
  if (d.marketing_tool?.length) renderMarketingToolChart(d.marketing_tool)
  if (d.active_time?.length) renderActiveTimeChart(d.active_time)
}

function renderGenderChart(data) {
  const chart = initChart(genderChartRef.value, 'gender')
  if (!chart) return
  const total = data.reduce((s, d) => s + d.pay_order_count, 0)
  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: {
        show: true, position: 'center',
        formatter: () => `${formatNum(total)}\n总成交`,
        fontSize: 16, fontWeight: 'bold', color: '#333', lineHeight: 22,
      },
      emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold', formatter: '{b}\n{d}%' } },
      data: data.map(d => ({
        value: d.pay_order_count, name: d.key,
        itemStyle: { color: d.key === '女' ? '#FF6B9D' : d.key === '男' ? '#1677FF' : '#C0C4CC' },
      })),
    }],
  })
}

function renderAgeChart(data) {
  const chart = initChart(ageChartRef.value, 'age')
  if (!chart) return
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 70, right: 50, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', data: data.map(d => d.key).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
    },
    series: [{
      type: 'bar', data: data.map(d => d.pay_order_count).reverse(), barWidth: 18,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#1677FF' }, { offset: 1, color: '#69B1FF' },
        ]),
      },
      label: {
        show: true, position: 'right',
        formatter: (p) => { const item = data[data.length - 1 - p.dataIndex]; return item ? `${item.pct}%` : '' },
        color: '#666', fontSize: 11,
      },
    }],
  })
}

function renderRegionChart(data) {
  const chart = initChart(regionChartRef.value, 'region')
  if (!chart) return
  const top10 = data.slice(0, 10)
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 50, right: 55, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', data: top10.map(d => d.key).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
    },
    series: [{
      type: 'bar', data: top10.map(d => d.pay_order_count).reverse(), barWidth: 16,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: (params) => {
          const colors = ['#FF4D4F','#FF7A45','#FFA940','#1677FF','#1677FF','#409EFF','#409EFF','#69B1FF','#69B1FF','#A5D8FF']
          return colors[top10.length - 1 - params.dataIndex] || '#1677FF'
        },
      },
      label: {
        show: true, position: 'right',
        formatter: (p) => { const item = top10[top10.length - 1 - p.dataIndex]; return item ? `${item.pct}%` : '' },
        color: '#666', fontSize: 11,
      },
    }],
  })
}

// 通用环形图（下单价值、首复购）
function renderPieChart(domRef, key, data, colors) {
  const chart = initChart(domRef, key)
  if (!chart) return
  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold', formatter: '{b}\n{d}%' } },
      data: data.map((d, i) => ({
        value: d.pay_order_count, name: d.key,
        itemStyle: { color: colors[i] || '#999' },
      })),
    }],
  })
}

// 通用横向条形图（下单频次、看播天数）
function renderHBarChart(domRef, key, data, color1, color2) {
  const chart = initChart(domRef, key)
  if (!chart) return
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 55, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', data: data.map(d => d.key).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
    },
    series: [{
      type: 'bar', data: data.map(d => d.pay_order_count).reverse(), barWidth: 18,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: color1 }, { offset: 1, color: color2 },
        ]),
      },
      label: {
        show: true, position: 'right',
        formatter: (p) => { const item = data[data.length - 1 - p.dataIndex]; return item ? `${item.pct}%` : '' },
        color: '#666', fontSize: 11,
      },
    }],
  })
}

// 行业偏好 — 带TGI标注
function renderIndustryChart(data) {
  const chart = initChart(industryPrefChartRef.value, 'industryPref')
  if (!chart) return
  const top10 = data.slice(0, 10)
  chart.setOption({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (p) => {
        const item = top10[top10.length - 1 - p[0].dataIndex]
        return item ? `${item.key}<br/>偏好指数: ${item.pay_order_count}<br/>TGI: ${item.pay_order_amount}` : ''
      },
    },
    grid: { left: 70, right: 80, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', data: top10.map(d => d.key).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
    },
    series: [{
      type: 'bar', data: top10.map(d => d.pay_order_count).reverse(), barWidth: 16,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: (params) => {
          const idx = top10.length - 1 - params.dataIndex
          if (idx <= 0) return '#FF4D4F'
          if (idx <= 1) return '#FF7A45'
          if (idx <= 2) return '#FFA940'
          return '#1677FF'
        },
      },
      label: {
        show: true, position: 'right',
        formatter: (p) => {
          const item = top10[top10.length - 1 - p.dataIndex]
          return item ? `${item.pay_order_count} | ${item.pay_order_amount}` : ''
        },
        color: '#666', fontSize: 10,
      },
    }],
  })
}

// 竞品商家偏好
function renderCompetitorChart(data) {
  const chart = initChart(competitorChartRef.value, 'competitor')
  if (!chart) return
  const top10 = data.slice(0, 10)
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 120, right: 55, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: top10.map(d => d.key.length > 8 ? d.key.slice(0, 8) + '...' : d.key).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 11 },
    },
    series: [{
      type: 'bar', data: top10.map(d => d.pay_order_count).reverse(), barWidth: 16,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: (params) => {
          const idx = top10.length - 1 - params.dataIndex
          if (idx <= 0) return '#FF4D4F'
          if (idx <= 2) return '#FF7A45'
          return '#1677FF'
        },
      },
      label: {
        show: true, position: 'right',
        formatter: '{c}',
        color: '#666', fontSize: 11,
      },
    }],
  })
}

function renderInterestChart(data) {
  const chart = initChart(interestChartRef.value, 'interest')
  if (!chart) return
  const top8 = data.slice(0, 8)
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 70, right: 50, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', data: top8.map(d => d.key).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
    },
    series: [{
      type: 'bar', data: top8.map(d => d.pay_order_count).reverse(), barWidth: 18,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#FF8A00' }, { offset: 1, color: '#FFB740' },
        ]),
      },
      label: {
        show: true, position: 'right',
        formatter: (p) => { const item = top8[top8.length - 1 - p.dataIndex]; return item ? `${item.pct}%` : '' },
        color: '#666', fontSize: 11,
      },
    }],
  })
}

function renderMarketingToolChart(data) {
  const chart = initChart(marketingToolChartRef.value, 'marketingTool')
  if (!chart) return
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}: ${data[p[0].dataIndex]?.pct || 0}%` },
    grid: { left: 10, right: 10, top: 10, bottom: 30 },
    xAxis: {
      type: 'category', data: data.map(d => d.key),
      axisLabel: { color: '#666', fontSize: 12 },
      axisLine: { lineStyle: { color: '#E8E8E8' } }, axisTick: { show: false },
    },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'bar', data: data.map(d => d.pay_order_count), barWidth: '40%',
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#1677FF' }, { offset: 1, color: '#69B1FF' },
        ]),
      },
      label: {
        show: true, position: 'top',
        formatter: (p) => `${data[p.dataIndex]?.pct || 0}%`,
        color: '#666', fontSize: 11,
      },
    }],
  })
}

function renderActiveTimeChart(data) {
  const chart = initChart(activeTimeChartRef.value, 'activeTime')
  if (!chart) return
  const hourMap = {}
  for (const d of data) hourMap[d.key] = d.pay_order_count
  const hours = Array.from({ length: 24 }, (_, i) => String(i))
  const values = hours.map(h => hourMap[h] || 0)
  const maxVal = Math.max(...values, 1)
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}:00 — ${p[0].value}次` },
    grid: { left: 35, right: 10, top: 10, bottom: 30 },
    xAxis: {
      type: 'category', data: hours.map(h => h + ':00'),
      axisLabel: { color: '#999', fontSize: 10, interval: 3 },
      axisLine: { lineStyle: { color: '#E8E8E8' } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', axisLabel: { color: '#999', fontSize: 10 },
      splitLine: { lineStyle: { color: '#F0F0F0' } }, axisLine: { show: false },
    },
    series: [{
      type: 'bar', data: values, barWidth: '60%',
      itemStyle: {
        borderRadius: [3, 3, 0, 0],
        color: (params) => {
          const ratio = params.value / maxVal
          return ratio > 0.8 ? '#FF4D4F' : ratio > 0.5 ? '#FF8A00' : '#1677FF'
        },
      },
    }],
  })
}

// ==================== 工具函数 ====================
function formatNum(n) {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n.toLocaleString()
}

// ==================== Resize ====================
function handleResize() {
  Object.values(charts).forEach(c => c?.resize())
}

onMounted(async () => {
  await loadProfile()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  Object.values(charts).forEach(c => c?.dispose())
  charts = {}
})
</script>

<style scoped>
.audience-page { min-height: 100vh; background: var(--bg-page, #F5F6F8); }

/* ==================== 筛选栏 ==================== */
.filter-bar {
  position: sticky; top: 0; z-index: 10; background: #fff;
  padding: 10px 12px; border-bottom: 1px solid #F0F0F0;
  display: flex; align-items: center; gap: 10px;
}
.page-label { font-size: 15px; font-weight: 600; color: #333; white-space: nowrap; }

.action-btn {
  width: 36px; height: 36px; border: 1px solid #E8E8E8; border-radius: var(--radius-sm, 8px);
  background: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--c-primary, #1677FF); flex-shrink: 0;
}
.action-btn:active { background: #F5F5F5; }

.preset-tabs {
  display: inline-flex; align-items: center; gap: 0; background: #F5F5F5;
  border-radius: var(--radius-sm, 8px); padding: 3px; margin-left: auto;
}
.preset-tab {
  padding: 0 14px; height: 30px; border: none; border-radius: 6px;
  background: transparent; font-size: 13px; color: #666; cursor: pointer;
  transition: all 0.2s; white-space: nowrap; line-height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
}
.preset-tab.active {
  background: #fff; color: var(--c-primary, #1677FF);
  font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

/* ==================== 提示 ==================== */
.source-tip { padding: 6px 12px; font-size: 11px; color: #999; text-align: center; }

/* ==================== 引导卡片 ==================== */
.guide-card {
  margin: 24px 16px; padding: 32px 20px; background: #fff;
  border-radius: var(--radius-md, 12px); text-align: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.guide-icon { margin-bottom: 16px; }
.guide-title { font-size: 16px; font-weight: 600; color: #333; margin: 0 0 8px; }
.guide-desc { font-size: 13px; color: #999; margin: 0 0 20px; line-height: 1.6; }
.guide-btn {
  display: inline-flex; align-items: center; height: 40px; padding: 0 28px;
  background: var(--c-primary, #1677FF); color: #fff; border: none;
  border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
}
.guide-btn:active { opacity: 0.85; }

/* ==================== 加载 ==================== */
.loading-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 80px 20px; color: #999;
}
.loading-spinner {
  width: 32px; height: 32px; border: 3px solid #E8E8E8;
  border-top-color: var(--c-primary, #1677FF); border-radius: 50%;
  animation: spin 0.8s linear infinite; margin-bottom: 12px;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ==================== 图表 ==================== */
.profile-grid {
  display: grid; grid-template-columns: 1fr; gap: 12px; padding: 12px;
  padding-bottom: calc(var(--tabnav-h, 56px) + var(--safe-b, 0px) + 24px);
}
.section-title {
  font-size: 15px; font-weight: 700; color: #333; padding: 8px 4px 0;
  border-left: 3px solid var(--c-primary, #1677FF); padding-left: 8px;
  margin-top: 4px;
}
.chart-card {
  background: #fff; border-radius: var(--radius-md, 12px);
  padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.chart-title { font-size: 15px; font-weight: 600; color: #333; }
.chart-sub { font-size: 12px; font-weight: 400; color: #999; margin-left: 6px; }
.edit-icon-btn {
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: #F5F5F5; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #999; transition: all 0.2s;
}
.edit-icon-btn:active { background: #E8E8E8; color: var(--c-primary, #1677FF); }
.chart-box { height: 200px; width: 100%; }
.chart-box-sm { height: 160px; }
.chart-box-tall { height: 280px; }

.chart-legend { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #F5F5F5; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-label { color: #666; min-width: 20px; }
.legend-value { color: #333; font-weight: 600; }
.legend-count { color: #999; margin-left: auto; }

/* ==================== 录入弹窗 ==================== */
.entry-overlay {
  position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.5);
  display: flex; align-items: flex-end; justify-content: center;
}
.entry-panel {
  background: #fff; border-radius: 16px 16px 0 0; width: 100%; max-width: 500px;
  max-height: 85vh; display: flex; flex-direction: column;
  animation: slideUp 0.25s ease-out;
}
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

.entry-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 16px 12px; border-bottom: 1px solid #F0F0F0;
}
.entry-title { font-size: 16px; font-weight: 600; color: #333; }
.entry-close {
  width: 28px; height: 28px; border: none; background: #F5F5F5;
  border-radius: 50%; font-size: 18px; color: #999; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

.entry-tabs {
  display: flex; padding: 8px 16px 0; gap: 0; background: #FAFAFA;
}
.entry-tab {
  flex: 1; height: 36px; border: none; background: transparent;
  font-size: 14px; color: #999; cursor: pointer; position: relative;
  transition: color 0.2s;
}
.entry-tab.active {
  color: var(--c-primary, #1677FF); font-weight: 600;
}
.entry-tab.active::after {
  content: ''; position: absolute; bottom: 0; left: 20%; right: 20%;
  height: 2px; background: var(--c-primary, #1677FF); border-radius: 1px;
}

.entry-body { flex: 1; overflow-y: auto; padding: 16px; }
.entry-hint { font-size: 12px; color: #999; margin: 0 0 12px; line-height: 1.5; }

.entry-form { display: flex; flex-direction: column; gap: 10px; }
.entry-row { display: flex; align-items: center; gap: 8px; }
.entry-label { width: 60px; font-size: 14px; color: #333; font-weight: 500; flex-shrink: 0; }
.entry-input {
  flex: 1; height: 38px; border: 1px solid #E8E8E8; border-radius: 8px;
  padding: 0 12px; font-size: 14px; color: #333; outline: none;
  background: #FAFAFA; min-width: 0;
}
.entry-input:focus { border-color: var(--c-primary, #1677FF); background: #fff; }
.entry-input-name { max-width: 100px; }
.entry-unit { font-size: 12px; color: #999; flex-shrink: 0; width: 20px; }
.entry-row-del {
  width: 28px; height: 28px; border: none; background: #FFF2F0;
  border-radius: 6px; color: #FF4D4F; font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.entry-add-btn {
  height: 36px; border: 1px dashed #D9D9D9; border-radius: 8px;
  background: transparent; color: #999; font-size: 13px; cursor: pointer;
}
.entry-add-btn:active { border-color: var(--c-primary, #1677FF); color: var(--c-primary, #1677FF); }

.entry-footer {
  display: flex; gap: 10px; padding: 12px 16px;
  border-top: 1px solid #F0F0F0;
  padding-bottom: calc(12px + var(--safe-b, 0px));
}
.entry-cancel {
  flex: 1; height: 42px; border: 1px solid #D9D9D9; border-radius: 8px;
  background: #fff; font-size: 14px; color: #666; cursor: pointer;
}
.entry-save {
  flex: 2; height: 42px; border: none; border-radius: 8px;
  background: var(--c-primary, #1677FF); color: #fff;
  font-size: 14px; font-weight: 500; cursor: pointer;
}
.entry-save:active { opacity: 0.85; }
.entry-save:disabled { opacity: 0.5; cursor: not-allowed; }

/* ==================== 桌面端 ==================== */
@media (min-width: 768px) {
  .filter-bar { padding: 12px 24px; }
  .profile-grid { grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 24px; padding-bottom: 24px; }
  .full-width { grid-column: 1 / -1; }
  .chart-box { height: 260px; }
  .chart-box-sm { height: 180px; }
  .chart-box-tall { height: 320px; }
  .entry-overlay { align-items: center; }
  .entry-panel { border-radius: 16px; max-height: 70vh; }
}
</style>
