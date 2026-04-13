<template>
<div class="ctr-page">
  <div class="ctr-header">
    <h2>CTR素材分析 <span class="header-note">仅统计曝光量&gt;100的有效素材</span></h2>
    <a-range-picker v-model:value="dateRange" size="small" :presets="presets" :style="{width:'280px'}" @change="loadAll" />
  </div>

  <!-- 概览卡片 -->
  <div class="ctr-cards">
    <div class="ctr-card">
      <div class="cc-label">平均CTR</div>
      <div class="cc-val blue">{{ overview.avg_ctr }}%</div>
      <div class="cc-sub" :class="overview.avg_ctr > overview.yd_ctr ? 'up' : 'down'">
        {{ overview.yd_label || '昨日' }} {{ overview.yd_ctr }}%
        <span v-if="overview.yd_ctr > 0">{{ pctChg(overview.avg_ctr, overview.yd_ctr) }}</span>
      </div>
    </div>
    <div class="ctr-card">
      <div class="cc-label">总曝光量</div>
      <div class="cc-val">{{ fmtNum(overview.total_show) }}</div>
      <div class="cc-sub" v-if="overview.yd_show">{{ overview.yd_label }} {{ fmtNum(overview.yd_show) }} <span :class="overview.total_show >= overview.yd_show ? 'up' : 'down'">{{ pctChg(overview.total_show, overview.yd_show) }}</span></div>
    </div>
    <div class="ctr-card">
      <div class="cc-label">总点击量</div>
      <div class="cc-val">{{ fmtNum(overview.total_click) }}</div>
      <div class="cc-sub" v-if="overview.yd_click">{{ overview.yd_label }} {{ fmtNum(overview.yd_click) }} <span :class="overview.total_click >= overview.yd_click ? 'up' : 'down'">{{ pctChg(overview.total_click, overview.yd_click) }}</span></div>
    </div>
    <div class="ctr-card">
      <div class="cc-label">素材数量</div>
      <div class="cc-val">{{ overview.mat_count }}</div>
    </div>
    <div class="ctr-card">
      <div class="cc-label">CTR达标率(≥2%)</div>
      <div class="cc-val" :class="overview.pass_rate >= 50 ? 'green' : 'red'">{{ overview.pass_rate }}%</div>
      <div class="cc-sub">{{ overview.pass_count }}/{{ overview.total_qualified }}个素材</div>
    </div>
  </div>

  <!-- 趋势 + 分布 -->
  <div class="ctr-row">
    <div class="ctr-section" style="flex:2">
      <div class="cs-title">CTR趋势（近7天）</div>
      <div ref="trendRef" class="ctr-chart" style="height:260px"></div>
    </div>
    <div class="ctr-section" style="flex:1">
      <div class="cs-title">CTR分布</div>
      <div ref="distRef" class="ctr-chart" style="height:240px"></div>
    </div>
  </div>

  <!-- 排行榜 -->
  <div class="ctr-row">
    <div class="ctr-section">
      <div class="cs-title green-dot">CTR最高 Top10</div>
      <div class="rank-list">
        <div v-for="(m, i) in ranking.top" :key="'t'+i" class="rank-item">
          <span class="rank-no" :class="i < 3 ? 'gold' : ''">{{ i + 1 }}</span>
          <div class="rank-info">
            <div class="rank-name">{{ m.title?.slice(0, 25) || m.material_id }}</div>
            <div class="rank-metrics">
              <span>曝光 {{ fmtNum(m.show_cnt) }}</span>
              <span>消耗 ¥{{ m.cost.toLocaleString() }}</span>
              <span>ROI {{ m.roi.toFixed(2) }}</span>
            </div>
          </div>
          <div class="rank-ctr green">{{ m.ctr }}%</div>
        </div>
        <a-empty v-if="!ranking.top?.length" :image="null" description="暂无数据" />
      </div>
    </div>
    <div class="ctr-section">
      <div class="cs-title red-dot">CTR最低 Top10</div>
      <div class="rank-list">
        <div v-for="(m, i) in ranking.bottom" :key="'b'+i" class="rank-item">
          <span class="rank-no red-bg">{{ i + 1 }}</span>
          <div class="rank-info">
            <div class="rank-name">{{ m.title?.slice(0, 25) || m.material_id }}</div>
            <div class="rank-metrics">
              <span>曝光 {{ fmtNum(m.show_cnt) }}</span>
              <span>消耗 ¥{{ m.cost.toLocaleString() }}</span>
              <span>ROI {{ m.roi.toFixed(2) }}</span>
            </div>
          </div>
          <div class="rank-ctr red">{{ m.ctr }}%</div>
        </div>
        <a-empty v-if="!ranking.bottom?.length" :image="null" description="暂无数据" />
      </div>
    </div>
  </div>

  <!-- 消耗Top10素材CTR趋势 -->
  <div class="ctr-section">
    <div class="cs-title">消耗Top10素材CTR趋势</div>
    <div ref="topCostRef" class="ctr-chart" style="height:300px"></div>
  </div>

  <!-- 各账户CTR对比 -->
  <div class="ctr-section">
    <div class="cs-title">各账户 CTR 对比</div>
    <div ref="accCompareRef" class="ctr-chart" style="height:360px"></div>
  </div>

  <!-- 新素材上新看板 -->
  <div class="ctr-section">
    <div class="cs-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      新素材CTR追踪（近14天）
      <span class="cs-sub">按素材首次投放日统计</span>
    </div>
    <div class="new-mat-summary" v-if="newMatData.summary">
      <div class="nms-item"><span class="nms-label">累计上新</span><span class="nms-val">{{ newMatData.summary.total_new }}个</span></div>
      <div class="nms-item"><span class="nms-label">累计曝光</span><span class="nms-val">{{ fmtNum(newMatData.summary.total_show) }}</span></div>
      <div class="nms-item"><span class="nms-label">新素材平均CTR</span><span class="nms-val blue">{{ newMatData.summary.avg_ctr }}%</span></div>
    </div>
    <div ref="newMatRef" class="ctr-chart" style="height:240px"></div>
  </div>

  <!-- 高曝光低CTR预警 -->
  <div class="ctr-section" v-if="alerts.alerts?.length">
    <div class="cs-title red-dot">高曝光低CTR预警 <span class="cs-sub">日均CTR {{ alerts.avg_ctr }}%</span></div>
    <div class="alert-list">
      <div v-for="(a, i) in alerts.alerts" :key="'a'+i" class="alert-item">
        <span class="alert-no">{{ i + 1 }}</span>
        <div class="alert-info">
          <div class="alert-name">{{ a.title?.slice(0, 30) || a.material_id }}</div>
          <div class="alert-metrics">
            <span>曝光 <b>{{ fmtNum(a.show_cnt) }}</b></span>
            <span>点击 <b>{{ fmtNum(a.click_cnt) }}</b></span>
            <span>消耗 <b>¥{{ a.cost.toLocaleString() }}</b></span>
          </div>
        </div>
        <div class="alert-ctr">
          <div class="alert-ctr-val">{{ a.ctr }}%</div>
          <div class="alert-gap">低于均值 {{ a.gap }}%</div>
        </div>
        <div v-if="a.actions?.length" class="alert-actions">
          <div v-for="(act, j) in a.actions" :key="'act'+j" class="alert-action">
            <a-tag :color="act.type === 'urgent' ? 'red' : act.type === 'key' ? 'orange' : act.type === 'warn' ? 'gold' : 'blue'" size="small">{{ act.tag }}</a-tag>
            <span class="action-text">{{ act.action }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import request from '../utils/request'

const dateRange = ref([dayjs(), dayjs()])
const presets = [
  { label: '今天', value: [dayjs(), dayjs()] },
  { label: '昨天', value: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
  { label: '近3天', value: [dayjs().subtract(2, 'day'), dayjs()] },
  { label: '近7天', value: [dayjs().subtract(6, 'day'), dayjs()] },
  { label: '近15天', value: [dayjs().subtract(14, 'day'), dayjs()] },
  { label: '近30天', value: [dayjs().subtract(29, 'day'), dayjs()] },
  { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
  { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
]
const overview = ref({})
const ranking = ref({ top: [], bottom: [] })
const alerts = ref({ alerts: [], suggestions: [] })
const trendRef = ref()
const newMatRef = ref()
const newMatData = ref({})
const distRef = ref()
const topCostRef = ref()
const accCompareRef = ref()
let trendChart = null, distChart = null, newMatChart = null, topCostChart = null, accCompareChart = null

const fmtNum = v => (parseInt(v) || 0).toLocaleString()
const pctChg = (cur, prev) => {
  const c = parseFloat(cur) || 0, p = parseFloat(prev) || 0
  if (p === 0) return c > 0 ? '+∞' : '-'
  const v = ((c - p) / p * 100).toFixed(1)
  return v > 0 ? '+' + v + '%' : v + '%'
}

async function loadAll() {
  const startDate = dateRange.value[0]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD')
  const endDate = dateRange.value[1]?.format('YYYY-MM-DD') || startDate
  const date = endDate
  const range = 'custom'
  const [r1, r2, r3, r4, r5, r6] = await Promise.all([
    request.get('/material-analysis/ctr-overview', { params: { start_date: startDate, end_date: endDate } }),
    request.get('/material-analysis/ctr-ranking', { params: { start_date: startDate, end_date: endDate } }),
    request.get('/material-analysis/ctr-trend', { params: { date } }),
    request.get('/material-analysis/ctr-distribution', { params: { start_date: startDate, end_date: endDate } }),
    request.get('/material-analysis/ctr-alerts', { params: { start_date: startDate, end_date: endDate } }),
    request.get('/material-analysis/new-material-trend', { params: { date } }),
  ])
  if (r1.code === 0) overview.value = r1.data
  if (r2.code === 0) ranking.value = r2.data
  if (r5.code === 0) alerts.value = r5.data
  if (r6?.code === 0) {
    newMatData.value = r6.data
    await nextTick()
    if (newMatRef.value && r6.data.trend?.length) {
      if (newMatChart) newMatChart.dispose()
      newMatChart = echarts.init(newMatRef.value)
      const t = r6.data.trend
      const fmtS = v => v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(v)
      newMatChart.setOption({
        grid: { left: 45, right: 45, top: 30, bottom: 30 },
        legend: { top: 0, right: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
        xAxis: { type: 'category', data: t.map(d => d.date), axisLabel: { fontSize: 10, color: '#888' } },
        yAxis: [
          { type: 'value', show: false },
          { type: 'value', name: 'CTR%', nameTextStyle: { fontSize: 10 }, position: 'right', axisLabel: { fontSize: 10, color: '#FA8C16', formatter: v => v + '%' }, splitLine: { show: false } },
        ],
        tooltip: { trigger: 'axis', formatter: p => {
          const idx = p[0]?.dataIndex; if (idx === undefined) return '';
          const d = t[idx];
          return '<b>' + d.date + '</b><br/>' +
            '<span style="color:#FA8C16">●</span> 曝光量: ' + fmtS(d.show_cnt) + '<br/>' +
            '<span style="color:#1677FF">●</span> 上新数: ' + d.new_count + '个<br/>' +
            '<span style="color:#52C41A">●</span> 新素材CTR: ' + d.ctr + '%'
        }},
        series: [
          { name: '曝光量', type: 'bar', stack: 'mat', yAxisIndex: 0, data: t.map(d => d.show_cnt), itemStyle: { color: '#FA8C16', borderRadius: [0, 0, 3, 3] }, label: { show: true, position: 'inside', fontSize: 9, color: '#fff', formatter: p => fmtS(p.value) } },
          { name: '上新数', type: 'bar', stack: 'mat', yAxisIndex: 0, data: t.map(d => d.new_count), barWidth: '45%', itemStyle: { color: '#1677FF', borderRadius: [3, 3, 0, 0] }, label: { show: true, position: 'top', fontSize: 9, color: '#1677FF', formatter: p => p.value + '个' } },
          { name: '新素材CTR', type: 'line', yAxisIndex: 1, data: t.map(d => d.ctr), smooth: true, lineStyle: { width: 2.5, color: '#52C41A' }, itemStyle: { color: '#52C41A' }, symbol: 'circle', symbolSize: 5, label: { show: true, fontSize: 9, color: '#52C41A', formatter: p => p.value + '%' } },
        ]
      })
    }
  }

  await nextTick()
  // 趋势图
  if (r3.code === 0 && trendRef.value) {
    if (trendChart) trendChart.dispose()
    trendChart = echarts.init(trendRef.value)
    const t = r3.data.trend || []
    const colors = ['#1677FF', '#52C41A', '#FA8C16', '#722ED1', '#EB2F96', '#13C2C2', '#F5222D', '#2F54EB']
    const series = [{ name: '整体CTR', type: 'line', data: t.map(d => d.ctr), smooth: true, lineStyle: { width: 3 }, itemStyle: { color: '#1677FF' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(22,119,255,0.15)' }, { offset: 1, color: 'rgba(22,119,255,0)' }] } } }]
    // 按账户
    const accs = r3.data.accounts || []
    accs.forEach((a, i) => {
      const parts = a.name.replace(/\(.*?\)/g, '').split('-').filter(Boolean)
      const last = parts[parts.length - 1] || a.name
      const name = (last.length > 6 ? last.slice(0, 6) : last) + (a.id ? '-' + String(a.id).slice(-4) : '')
      series.push({ name, type: 'line', data: a.data.map(d => d.ctr), smooth: true, lineStyle: { width: 1.5, type: 'dashed' }, symbol: 'none', itemStyle: { color: colors[(i + 1) % colors.length] } })
    })
    trendChart.setOption({
      grid: { left: 40, right: 15, top: 30, bottom: 50 },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
      xAxis: { type: 'category', data: t.map(d => d.date), axisLabel: { fontSize: 10, color: '#888' } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#888', formatter: v => v + '%' }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
      tooltip: { trigger: 'axis' },
      series
    })
  }

  // 分布图
  if (r4.code === 0 && distRef.value) {
    if (distChart) distChart.dispose()
    distChart = echarts.init(distRef.value)
    const d = r4.data
    const barColors = ['#FF4D4F', '#FA8C16', '#FADB14', '#52C41A', '#1677FF', '#722ED1']
    const fmtShow = v => v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v)
    distChart.setOption({
      grid: { left: 50, right: 15, top: 25, bottom: 30 },
      legend: { top: 0, right: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
      xAxis: { type: 'category', data: d.labels, axisLabel: { fontSize: 10, color: '#888' } },
      yAxis: { type: 'value', show: false },
      tooltip: { trigger: 'axis', formatter: p => {
        const idx = p[0]?.dataIndex
        if (idx === undefined) return ''
        return '<b>' + d.labels[idx] + '</b><br/>' +
          '<span style="color:#1677FF">●</span> 曝光量: ' + fmtShow(d.shows?.[idx] || 0) + '<br/>' +
          '<span style="color:#FA8C16">●</span> 素材数: ' + d.values[idx] + '个'
      }},
      series: [
        { name: '曝光量', type: 'bar', stack: 'total', data: (d.shows || []).map(v => ({ value: v })), barWidth: '50%', itemStyle: { color: '#1677FF', borderRadius: [0, 0, 4, 4] }, label: { show: true, position: 'inside', fontSize: 9, color: '#fff', formatter: p => fmtShow(p.value) } },
        { name: '素材数', type: 'bar', stack: 'total', data: d.values.map(v => ({ value: v })), barWidth: '50%', itemStyle: { color: '#FA8C16', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#FA8C16', fontWeight: 'bold', formatter: p => p.value + '个' } },
      ]
    })
  }

  // 消耗Top10素材CTR趋势（从ranking top数据绘制）
  if (r2.code === 0 && topCostRef.value && ranking.value.top?.length) {
    if (topCostChart) topCostChart.dispose()
    topCostChart = echarts.init(topCostRef.value)
    const topMats = ranking.value.top.slice(0, 10)
    const colors = ['#1677FF', '#52C41A', '#FA8C16', '#722ED1', '#EB2F96', '#13C2C2', '#F5222D', '#2F54EB', '#A0D911', '#FF85C0']
    topCostChart.setOption({
      grid: { left: 50, right: 20, top: 30, bottom: 50 },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8, formatter: n => n.length > 10 ? n.slice(0, 10) + '..' : n },
      xAxis: { type: 'category', data: topMats.map((m, i) => (i + 1) + ''), axisLabel: { fontSize: 10, color: '#888' } },
      yAxis: [
        { type: 'value', name: 'CTR%', axisLabel: { fontSize: 10, color: '#888', formatter: v => v + '%' }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
        { type: 'value', name: '消耗¥', position: 'right', axisLabel: { fontSize: 10, color: '#FA8C16', formatter: v => v >= 10000 ? (v / 10000).toFixed(0) + 'w' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }, splitLine: { show: false } },
      ],
      tooltip: { trigger: 'axis', formatter: p => {
        const idx = p[0]?.dataIndex
        if (idx === undefined) return ''
        const m = topMats[idx]
        return '<b>' + (m.title?.slice(0, 20) || m.material_id) + '</b><br/>' +
          'CTR: <b>' + m.ctr + '%</b><br/>' +
          '消耗: ¥' + m.cost.toLocaleString() + '<br/>' +
          '曝光: ' + (parseInt(m.show_cnt) || 0).toLocaleString()
      }},
      series: [
        { name: 'CTR', type: 'bar', data: topMats.map((m, i) => ({ value: m.ctr, itemStyle: { color: colors[i % colors.length], borderRadius: [4, 4, 0, 0] } })), barWidth: '40%', label: { show: true, position: 'top', fontSize: 10, formatter: p => p.value + '%' } },
        { name: '消耗', type: 'line', yAxisIndex: 1, data: topMats.map(m => m.cost), smooth: true, lineStyle: { width: 2, color: '#FA8C16' }, itemStyle: { color: '#FA8C16' }, symbol: 'circle', symbolSize: 6 },
      ]
    })
  }

  // 各账户CTR对比（横向柱图）
  if (r3.code === 0 && accCompareRef.value) {
    if (accCompareChart) accCompareChart.dispose()
    accCompareChart = echarts.init(accCompareRef.value)
    const accs = r3.data.accounts || []
    const accData = accs.map(a => {
      const parts = a.name.replace(/\(.*?\)/g, '').split('-').filter(Boolean)
      const last = parts[parts.length - 1] || a.name
      const label = (last.length > 6 ? last.slice(0, 6) : last) + '-' + String(a.id).slice(-4)
      const latestCtr = a.data?.length ? a.data[a.data.length - 1].ctr : 0
      return { name: label, ctr: latestCtr }
    }).sort((a, b) => a.ctr - b.ctr)
    const barColors = ['#FF4D4F', '#FA8C16', '#FADB14', '#52C41A', '#1677FF', '#722ED1', '#EB2F96', '#13C2C2', '#2F54EB', '#A0D911']
    const chartH = Math.max(300, accData.length * 36 + 60)
    accCompareRef.value.style.height = chartH + 'px'
    accCompareChart.resize()
    accCompareChart.setOption({
      grid: { left: 120, right: 60, top: 10, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#888', formatter: v => v + '%' }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
      yAxis: { type: 'category', data: accData.map(a => a.name), axisLabel: { fontSize: 11, color: '#333', width: 110, overflow: 'truncate' } },
      tooltip: { trigger: 'axis', formatter: p => p[0] ? p[0].name + ': <b>' + p[0].value + '%</b>' : '' },
      series: [{
        type: 'bar',
        data: accData.map((a, i) => ({ value: a.ctr, itemStyle: { color: barColors[i % barColors.length], borderRadius: [0, 4, 4, 0] } })),
        barWidth: '55%',
        label: { show: true, position: 'right', fontSize: 11, fontWeight: 'bold', formatter: p => p.value + '%' }
      }]
    })
  }
}

onMounted(loadAll)
</script>

<style scoped>
.ctr-page { padding: 20px; max-width: 1400px; margin: 0 auto; }
.ctr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.ctr-header h2 { margin: 0; font-size: 20px; display: flex; align-items: baseline; gap: 10px; }
.header-note { font-size: 12px; color: #999; font-weight: 400; }
.ctr-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 20px; }
.ctr-card { background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #f0f0f0; }
.cc-label { font-size: 12px; color: #888; margin-bottom: 4px; }
.cc-val { font-size: 24px; font-weight: 700; color: #333; }
.cc-val.blue { color: #1677FF; }
.cc-val.green { color: #52C41A; }
.cc-val.red { color: #FF4D4F; }
.cc-sub { font-size: 11px; color: #999; margin-top: 4px; }
.cc-sub.up { color: #52C41A; }
.cc-sub.down { color: #FF4D4F; }
.ctr-row { display: flex; gap: 16px; margin-bottom: 16px; }
.ctr-section { background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #f0f0f0; flex: 1; margin-bottom: 16px; }
.cs-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cs-sub { font-size: 11px; color: #888; font-weight: 400; }
.green-dot::before { content: ''; width: 8px; height: 8px; background: #52C41A; border-radius: 50%; display: inline-block; }
.red-dot::before { content: ''; width: 8px; height: 8px; background: #FF4D4F; border-radius: 50%; display: inline-block; }
.ctr-chart { width: 100%; }
.dist-note { font-size: 11px; color: #999; font-weight: 400; margin-left: auto; }
.rank-list { display: flex; flex-direction: column; gap: 6px; }
.rank-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #fafafa; border-radius: 6px; }
.rank-no { width: 22px; height: 22px; border-radius: 50%; background: #e8e8e8; color: #666; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rank-no.gold { background: #FFD700; color: #fff; }
.rank-no.red-bg { background: #FF4D4F; color: #fff; }
.rank-info { flex: 1; min-width: 0; }
.rank-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-metrics { font-size: 11px; color: #999; margin-top: 2px; display: flex; gap: 10px; }
.rank-ctr { font-size: 16px; font-weight: 700; flex-shrink: 0; }
.rank-ctr.green { color: #52C41A; }
.rank-ctr.red { color: #FF4D4F; }
.alert-list { display: flex; flex-direction: column; gap: 6px; }
.alert-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #FFF2F0; border-radius: 8px; border-left: 3px solid #FF4D4F; flex-wrap: wrap; }
.alert-no { width: 22px; height: 22px; border-radius: 50%; background: #FF4D4F; color: #fff; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.alert-info { flex: 1; min-width: 0; }
.alert-name { font-size: 13px; font-weight: 500; }
.alert-metrics { font-size: 11px; color: #888; margin-top: 2px; display: flex; gap: 12px; }
.alert-metrics b { color: #555; }
.alert-ctr { text-align: right; flex-shrink: 0; }
.alert-ctr-val { font-size: 16px; font-weight: 700; color: #FF4D4F; }
.alert-gap { font-size: 11px; color: #FF7875; }
.alert-actions { width: 100%; padding: 4px 0 0 32px; display: flex; flex-direction: column; gap: 4px; }
.alert-action { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; }
.action-text { color: #555; line-height: 1.5; }
.suggestion-list { display: flex; flex-direction: column; gap: 6px; }
.suggestion-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #F6FFED; border-radius: 6px; font-size: 13px; }
.suggestion-name { font-weight: 500; flex-shrink: 0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.suggestion-msg { color: #666; }
.new-mat-summary { display: flex; gap: 24px; margin-bottom: 12px; }
.nms-item { display: flex; flex-direction: column; }
.nms-label { font-size: 11px; color: #999; }
.nms-val { font-size: 18px; font-weight: 700; color: #333; }
.nms-val.blue { color: #1677FF; }
@media (max-width: 768px) {
  .ctr-cards { grid-template-columns: repeat(2, 1fr); }
  .ctr-row { flex-direction: column; }
}
</style>
