<template>
  <div class="wx-compass">
    <!-- 经营概览 -->
    <section class="compass-section">
      <div class="section-head">
        <h2 class="section-title">经营概览</h2>
        <div class="date-range">
          <span v-for="t in rangeTabs" :key="t.value" :class="['range-tab', { active: range === t.value }]" @click="changeRange(t.value)">{{ t.label }}</span>
          <span class="range-date">{{ rangeLabel }}</span>
        </div>
      </div>
      <div class="kpi-row">
        <div class="kpi-card" v-for="k in kpiList" :key="k.key">
          <div class="kpi-card__label">{{ k.label }}</div>
          <div class="kpi-card__value">{{ k.prefix || '' }}{{ formatNum(overview[k.key]) }}</div>
          <div class="kpi-card__change" v-if="overview[k.key + '_change'] !== undefined">
            <span :class="changeClass(overview[k.key + '_change'])">较上周期 {{ formatChange(overview[k.key + '_change']) }}</span>
          </div>
        </div>
      </div>
      <div class="chart-box"><div ref="trendChartRef" class="chart-canvas"></div></div>
    </section>

    <!-- 自营直播转化 -->
    <section class="compass-section">
      <div class="section-head"><h2 class="section-title">自营直播转化</h2></div>
      <template v-if="overview.is_today">
        <div class="t1-tip">数据T+1，次日更新</div>
      </template>
      <template v-else>
        <div class="kpi-row kpi-row--small">
          <div class="kpi-card kpi-card--sm">
            <div class="kpi-card__label">成交金额</div>
            <div class="kpi-card__value">¥{{ formatNum(liveData.total_gmv) }}</div>
          </div>
        </div>
        <div class="chart-box chart-box--sm"><div ref="liveChartRef" class="chart-canvas"></div></div>
      </template>
    </section>

    <!-- 自营短视频转化 -->
    <section class="compass-section">
      <div class="section-head"><h2 class="section-title">自营短视频转化</h2></div>
      <template v-if="overview.is_today">
        <div class="t1-tip">数据T+1，次日更新</div>
      </template>
      <template v-else>
        <div class="kpi-row kpi-row--small">
          <div class="kpi-card kpi-card--sm">
            <div class="kpi-card__label">成交金额</div>
            <div class="kpi-card__value">¥{{ formatNum(videoData.total_gmv) }}</div>
          </div>
        </div>
        <div class="chart-box chart-box--sm"><div ref="videoChartRef" class="chart-canvas"></div></div>
      </template>
    </section>

    <!-- 合作达人 -->
    <section class="compass-section">
      <div class="section-head"><h2 class="section-title">合作达人</h2></div>
      <template v-if="overview.is_today">
        <div class="t1-tip">数据T+1，次日更新</div>
      </template>
      <template v-else>
        <div class="kpi-row kpi-row--small">
          <div class="kpi-card kpi-card--sm">
            <div class="kpi-card__label">成交金额</div>
            <div class="kpi-card__value" style="color:#fa8c16">¥{{ formatNum(finderData.total_gmv) }}</div>
          </div>
          <div class="kpi-card kpi-card--sm">
            <div class="kpi-card__label">动销达人数</div>
            <div class="kpi-card__value">{{ finderData.total_finders || 0 }}</div>
          </div>
        </div>
        <div class="finder-layout">
          <div class="finder-layout__chart">
            <div class="chart-box chart-box--sm"><div ref="finderChartRef" class="chart-canvas"></div></div>
          </div>
          <div class="finder-layout__rank">
            <div class="finder-rank__head"><span class="finder-rank__title">成交金额</span></div>
            <div v-for="(f, idx) in (finderData.finders || []).slice(0, 5)" :key="f.finder_id" class="finder-rank__item">
              <span :class="['rank-num', { 'rank-top': idx < 3 }]">{{ idx + 1 }}</span>
              <div class="rank-avatar">{{ f.nickname ? f.nickname.charAt(0) : '达' }}</div>
              <div class="rank-info">
                <div class="rank-name">{{ f.nickname }}</div>
                <div class="rank-gmv">¥{{ formatNum(f.pay_gmv) }}</div>
              </div>
            </div>
            <div v-if="!finderData.finders || !finderData.finders.length" class="empty-tip">暂无数据</div>
          </div>
        </div>
      </template>
    </section>

    <!-- 买家人群特征 -->
    <section class="compass-section">
      <div class="section-head"><h2 class="section-title">买家人群特征</h2></div>
      <div class="profile-grid">
        <div class="profile-item">
          <div class="profile-item__label">性别</div>
          <div class="profile-item__value">女性为主</div>
          <div class="profile-item__sub">占比 76.63%</div>
        </div>
        <div class="profile-item">
          <div class="profile-item__label">年龄</div>
          <div class="profile-item__value">40-49岁</div>
          <div class="profile-item__sub">占比 36.20%</div>
        </div>
        <div class="profile-item">
          <div class="profile-item__label">地域</div>
          <div class="profile-item__value">广东省居多</div>
          <div class="profile-item__sub">占比 43.40%</div>
        </div>
        <div class="profile-item">
          <div class="profile-item__label">人群属性</div>
          <div class="profile-item__value">小镇中老年</div>
          <div class="profile-item__sub">占比 27.60%</div>
        </div>
        <div class="profile-item">
          <div class="profile-item__label">消费力区间</div>
          <div class="profile-item__value">¥0-100</div>
          <div class="profile-item__sub">占比 92.43%</div>
        </div>
      </div>
    </section>

    <div v-if="loading" class="loading-mask"><a-spin /></div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import request from '@/utils/request';
import * as echarts from 'echarts';

const loading = ref(false);
const range = ref('today');
const rangeTabs = [
  { label: '今天', value: 'today' },
  { label: '昨天', value: 'yesterday' },
  { label: '近7天', value: '7' },
  { label: '近30天', value: '30' },
];
const rangeLabel = ref('');
const overview = ref({});
const liveData = ref({ total_gmv: '0', trend: [] });
const videoData = ref({ total_gmv: '0', trend: [] });
const finderData = ref({ finders: [], total_gmv: '0', total_finders: 0 });
const trendChartRef = ref(null);
const liveChartRef = ref(null);
const videoChartRef = ref(null);
const finderChartRef = ref(null);
let trendChart = null, liveChart = null, videoChart = null, finderChart = null;

const kpiList = [
  { key: 'pay_gmv', label: '成交金额', prefix: '¥' },
  { key: 'pay_uv', label: '成交人数' },
  { key: 'pay_order_cnt', label: '成交订单数' },
  { key: 'product_click_uv', label: '商品点击人数' },
  { key: 'pay_refund_gmv', label: '成交退款金额', prefix: '¥' },
];

function formatNum(val) {
  const n = parseFloat(val || 0);
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
function formatChange(val) {
  const n = parseFloat(val || 0);
  return (n >= 0 ? '+' : '') + n + '%';
}
function changeClass(val) {
  const n = parseFloat(val || 0);
  return n > 0 ? 'change-up' : n < 0 ? 'change-down' : '';
}
function changeRange(v) { range.value = v; loadAll(); }

function renderTrendChart(trend) {
  if (!trendChartRef.value) return;
  if (trendChart) trendChart.dispose();
  trendChart = echarts.init(trendChartRef.value);
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 50, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: trend.map(t => t.date), axisLine: { lineStyle: { color: '#e8e8e8' } }, axisLabel: { color: '#8c8c8c', fontSize: 11 } },
    yAxis: [
      { type: 'value', axisLabel: { color: '#8c8c8c', fontSize: 11, formatter: v => '¥' + (v >= 10000 ? (v/10000).toFixed(0) + 'w' : v.toLocaleString()) }, splitLine: { lineStyle: { color: '#f0f0f0' } } },
      { type: 'value', axisLabel: { color: '#8c8c8c', fontSize: 11 }, splitLine: { show: false } },
    ],
    series: [
      { name: '成交金额', type: 'line', data: trend.map(t => parseFloat(t.pay_gmv)), smooth: true, lineStyle: { color: '#36cfc9', width: 2 }, itemStyle: { color: '#36cfc9' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(54,207,201,0.15)' }, { offset: 1, color: 'rgba(54,207,201,0)' }]) }, yAxisIndex: 0 },
      { name: '成交订单数', type: 'line', data: trend.map(t => t.pay_order_cnt), smooth: true, lineStyle: { color: '#597ef7', width: 2 }, itemStyle: { color: '#597ef7' }, yAxisIndex: 1 },
    ],
  });
}

function renderSmallChart(chartRef, chartInstance, trend, color) {
  if (!chartRef.value) return null;
  if (chartInstance) chartInstance.dispose();
  const chart = echarts.init(chartRef.value);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 10, bottom: 25 },
    xAxis: { type: 'category', data: trend.map(t => t.date), axisLine: { lineStyle: { color: '#e8e8e8' } }, axisLabel: { color: '#8c8c8c', fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { color: '#8c8c8c', fontSize: 10, formatter: v => '¥' + (v >= 10000 ? (v/10000).toFixed(0) + 'w' : v) }, splitLine: { lineStyle: { color: '#f5f5f5' } } },
    series: [{ type: 'line', data: trend.map(t => parseFloat(t.pay_gmv)), smooth: true, lineStyle: { color, width: 2 }, itemStyle: { color }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: color + '22' }, { offset: 1, color: color + '00' }]) } }],
  });
  return chart;
}

async function loadAll() {
  loading.value = true;
  try {
    const r = range.value;
    const [ovRes, finderRes] = await Promise.all([
      request.get('/wx-compass/overview', { params: { range: r } }),
      request.get('/wx-compass/finders', { params: { range: r } }),
    ]);
    if (ovRes?.code === 0) {
      const d = ovRes.data;
      overview.value = d;
      rangeLabel.value = d.date_range || '';
      liveData.value = { total_gmv: d.live_total_gmv || '0', trend: d.live_trend || [] };
      videoData.value = { total_gmv: d.video_total_gmv || '0', trend: d.video_trend || [] };
    }
    if (finderRes?.code === 0) finderData.value = finderRes.data;
    await nextTick();
    renderTrendChart(overview.value.trend || []);
    liveChart = renderSmallChart(liveChartRef, liveChart, liveData.value.trend || [], '#36cfc9');
    videoChart = renderSmallChart(videoChartRef, videoChart, videoData.value.trend || [], '#36cfc9');
    finderChart = renderSmallChart(finderChartRef, finderChart, finderData.value.trend || [], '#fa8c16');
  } catch (e) { console.error('加载失败', e); } finally { loading.value = false; }
}

onMounted(() => {
  loadAll();
  window.addEventListener('resize', () => { trendChart?.resize(); liveChart?.resize(); videoChart?.resize(); finderChart?.resize(); });
});
</script>

<style scoped>
.wx-compass { padding: 12px; max-width: 1200px; margin: 0 auto; background: #f7f8fa; min-height: 100vh; }
.compass-section { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.section-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.section-title { font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 0; }
.date-range { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.range-tab { padding: 4px 10px; font-size: 12px; color: #8c8c8c; border: 1px solid #e8e8e8; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.range-tab.active { color: #1a1a1a; border-color: #1a1a1a; font-weight: 500; }
.range-date { font-size: 12px; color: #8c8c8c; margin-left: 4px; }
.section-sub { font-size: 12px; color: #fa8c16; }
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }
.kpi-row--small { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.kpi-card { background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 8px; padding: 12px; }
.kpi-card--sm { padding: 10px; }
.kpi-card__label { font-size: 12px; color: #8c8c8c; margin-bottom: 4px; }
.kpi-card__value { font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.2; }
.kpi-card--sm .kpi-card__value { font-size: 18px; }
.kpi-card__change { font-size: 11px; margin-top: 4px; }
.change-up { color: #f5222d; }
.change-down { color: #52c41a; }
.chart-box { height: 220px; }
.chart-box--sm { height: 160px; }
.chart-canvas { width: 100%; height: 100%; }
.finder-layout { display: flex; gap: 16px; margin-top: 8px; }
.finder-layout__chart { flex: 1; min-width: 0; }
.finder-layout__rank { width: 240px; flex-shrink: 0; }
.finder-rank { margin-top: 0; }
.finder-rank__head { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.finder-rank__title { font-size: 13px; font-weight: 500; color: #1a1a1a; }
.finder-rank__item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #fafafa; }
.rank-num { width: 20px; text-align: center; font-size: 14px; font-weight: 700; color: #8c8c8c; }
.rank-num.rank-top { color: #fa8c16; }
.rank-avatar { width: 36px; height: 36px; border-radius: 50%; background: #e6f4ff; color: #1677ff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; flex-shrink: 0; }
.rank-info { flex: 1; min-width: 0; }
.rank-name { font-size: 13px; color: #1a1a1a; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-gmv { font-size: 15px; font-weight: 700; color: #1a1a1a; }
.profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; }
.profile-item__label { font-size: 11px; color: #8c8c8c; margin-bottom: 4px; }
.profile-item__value { font-size: 16px; font-weight: 700; color: #1a1a1a; }
.profile-item__sub { font-size: 11px; color: #8c8c8c; margin-top: 2px; }
.loading-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.empty-tip { text-align: center; color: #bbb; padding: 20px; font-size: 13px; }
.t1-tip { text-align: center; color: #8c8c8c; padding: 24px 0; font-size: 13px; background: #fafafa; border-radius: 6px; }
@media (max-width: 768px) {
  .wx-compass { padding: 8px; }
  .compass-section { padding: 12px; border-radius: 8px; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .kpi-card__value { font-size: 18px; }
  .profile-grid { grid-template-columns: repeat(3, 1fr); }
  .section-title { font-size: 14px; }
  .chart-box { height: 180px; }
  .chart-box--sm { height: 140px; }
  .finder-layout { flex-direction: column; }
  .finder-layout__rank { width: 100%; }
}
@media (max-width: 480px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .profile-grid { grid-template-columns: repeat(2, 1fr); }
  .date-range { gap: 2px; }
  .range-tab { padding: 3px 6px; font-size: 11px; }
}
</style>
