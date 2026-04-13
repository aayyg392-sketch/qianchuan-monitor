<template>
  <div class="dash">

    <!-- ===== 日期筛选行 ===== -->
    <div class="dash-filter">
      <div class="dash-filter__date">
        <span class="dash-filter__sync-main">数据截至 {{ overviewSyncTime || today }}</span>
      </div>
      <div class="dash-filter__right">
        <button class="dash-filter__btn" :class="{ active: periodTab === 'today' }" @click="periodTab='today'; loadData()">今日</button>
        <button class="dash-filter__btn" :class="{ active: periodTab === 'yesterday' }" @click="periodTab='yesterday'; loadData()">昨日</button>
        <button class="dash-filter__btn" :class="{ active: periodTab === '7d' }" @click="periodTab='7d'; loadData()">近7天</button>
      </div>
    </div>

    <!-- ===== 核心指标卡片 ===== -->
    <div class="stat-grid">
      <div v-for="card in statCards" :key="card.key" class="stat-card" @click="openAnalysis(card)">
        <div class="stat-card__top">
          <span class="stat-card__label">{{ card.title }}</span>
          <span class="stat-card__badge" :style="{ background: card.color + '18', color: card.color }">
            <span v-html="card.icon"></span>
          </span>
        </div>
        <div class="stat-card__value" :style="{ color: card.color }">{{ card.displayValue }}</div>
        <div class="stat-card__bottom">
          <span class="stat-card__prev">{{ periodTab === '7d' ? '上周期' : (compareType === 'same_hour' ? '昨日同时段' : '昨日') }} {{ card.yesterday }}</span>
          <span class="stat-card__trend" :class="card.growth >= 0 ? 'trend-up' : 'trend-down'">
            {{ card.growth >= 0 ? '↑' : '↓' }}{{ Math.abs(card.growth).toFixed(1) }}%
          </span>
        </div>
        <div class="stat-card__tap">点击分析</div>
      </div>
    </div>

    <!-- ===== 7日消耗趋势 ===== -->
    <div class="dt-card">
      <div class="dt-card__head">
        <span class="dt-card__title">消耗趋势</span>
        <span class="dt-card__badge dt-card__badge--blue">近7天</span>
      </div>
      <div class="dt-card__body">
        <div ref="costChartRef" class="chart-box" :style="{ height: isMobile ? '160px' : '220px' }"></div>
      </div>
    </div>

    <!-- ===== 账户今日表现 ===== -->
    <div class="dt-card">
      <div class="dt-card__head">
        <span class="dt-card__title">账户表现</span>
        <span class="dt-card__badge dt-card__badge--gray">今日</span>
      </div>
      <div class="dt-card__body dt-card__body--list">
        <div v-for="acc in accounts" :key="acc.advertiser_id" class="account-item" @click="openAccountAnalysis(acc)">
          <div class="account-item__avatar">{{ (acc.advertiser_name || '账').charAt(0) }}</div>
          <div class="account-item__info">
            <div class="account-item__name">{{ acc.advertiser_name }}</div>
            <div class="account-item__metrics">
              <span class="metric-tag">CTR {{ acc.today_show > 0 ? ((acc.today_click / acc.today_show) * 100).toFixed(2) : '0.00' }}%</span>
              <span class="metric-tag" style="color: var(--c-warning); font-weight: 700; font-size: 13px;">ROI {{ parseFloat(acc.today_roi || 0).toFixed(2) }}</span>
              <span class="metric-tag">转 {{ acc.today_convert || 0 }}</span>
              <span class="metric-tag" style="color: #00B96B; font-weight: 600;">GMV ¥{{ parseFloat(acc.today_gmv || 0) >= 10000 ? (parseFloat(acc.today_gmv || 0)/10000).toFixed(1)+'w' : parseFloat(acc.today_gmv || 0).toFixed(0) }}</span>
              <span class="metric-tag" style="color: #722ED1;">智 ¥{{ parseFloat(acc.today_coupon || 0).toFixed(0) }}</span>
            </div>
          </div>
          <div class="account-item__cost">
            <span class="account-item__cost-val">¥{{ parseFloat(acc.today_cost || 0).toFixed(0) }}</span>
            <span class="account-item__cost-label">消耗</span>
          </div>
        </div>
        <div v-if="!accounts.length && !loading" class="empty-tip">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
          <p>暂无账户数据</p>
        </div>
      </div>
    </div>

    <!-- ===== TOP 素材榜 ===== -->
    <div class="dt-card">
      <div class="dt-card__head">
        <span class="dt-card__title">素材消耗榜</span>
        <span class="dt-card__badge dt-card__badge--orange">TOP 10</span>
        <span v-if="lastSyncTime" class="dt-card__sync-time">截至 {{ lastSyncTime }}</span>
      </div>
      <div class="dt-card__body dt-card__body--list">
        <div v-for="(item, idx) in topCreatives" :key="item.entity_id" class="rank-item" @click="openMaterialAnalysis(item)">
          <div class="rank-item__num" :class="['rank-0','rank-1','rank-2'][idx] || 'rank-other'">
            {{ idx + 1 }}
          </div>
          <div class="rank-item__info">
            <div class="rank-item__name">{{ (item.entity_name || item.entity_id || '--').slice(0, isMobile ? 16 : 30) }}</div>
            <div class="rank-item__metrics">
              <span class="metric-pill metric-pill--blue">CTR {{ fmtPct(item.ctr) }}</span>
              <span class="metric-pill metric-pill--green">转化 {{ item.convert_cnt || 0 }}</span>
            </div>
          </div>
          <div class="rank-item__right">
            <div class="rank-item__cost">¥{{ parseFloat(item.cost || 0).toFixed(0) }}</div>
            <div class="rank-item__yesterday" v-if="item.yesterday_cost > 0">昨日 ¥{{ parseFloat(item.yesterday_cost).toFixed(0) }}</div>
            <div class="rank-change" v-if="item.rank_change != null" :class="item.rank_change > 0 ? 'rank-up' : item.rank_change < 0 ? 'rank-down' : 'rank-same'">
              {{ item.rank_change > 0 ? '↑' + item.rank_change : item.rank_change < 0 ? '↓' + Math.abs(item.rank_change) : '-' }}
            </div>
            <div class="rank-change rank-new" v-else-if="item.is_new">NEW</div>
          </div>
        </div>
        <div v-if="!topCreatives.length && !loading" class="empty-tip">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <p>暂无素材数据，请先同步</p>
        </div>
      </div>
    </div>

    <!-- 底部刷新 -->
    <div class="dash-refresh">
      <button class="dash-refresh__btn" @click="loadAll" :disabled="loading">
        <svg :class="{ spinning: loading }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        {{ loading ? '加载中...' : '刷新数据' }}
      </button>
    </div>

    <!-- ===== 分析面板：桌面端右侧抽屉 / 移动端底部弹出 ===== -->
    <Teleport to="body">
      <Transition :name="isMobile ? 'slide-up' : 'slide-right'">
        <div v-if="analysisPanelOpen" class="analysis-overlay" @click.self="closeAnalysis">
          <div :class="['analysis-panel', isMobile ? 'analysis-panel--bottom' : 'analysis-panel--right']">
            <!-- 头部 -->
            <div class="analysis-panel__header">
              <div class="analysis-panel__title-row">
                <span class="analysis-panel__icon" :style="{ background: analysisCard?.color + '18', color: analysisCard?.color }" v-html="analysisCard?.icon"></span>
                <span class="analysis-panel__title">{{ analysisCard?.title }} 分析</span>
              </div>
              <button class="analysis-panel__close" @click="closeAnalysis">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <!-- 滚动区域 -->
            <div class="analysis-panel__body">
              <!-- 指标概要 + ROI口径 -->
              <div class="analysis-panel__summary">
                <div class="ap-summary__left">
                  <div class="ap-summary__value" :style="{ color: analysisCard?.color }">{{ analysisCard?.displayValue }}</div>
                  <div class="ap-summary__sub">
                    <span class="ap-summary__prev">{{ periodTab === '7d' ? '上周期' : '昨日' }} {{ analysisCard?.yesterday }}</span>
                    <span class="ap-summary__trend" :class="(analysisCard?.growth || 0) >= 0 ? 'trend-up' : 'trend-down'">
                      {{ (analysisCard?.growth || 0) >= 0 ? '↑' : '↓' }}{{ Math.abs(analysisCard?.growth || 0).toFixed(1) }}%
                    </span>
                  </div>
                </div>
                <div class="ap-roi-box" v-if="metricSummaryCards.length">
                  <div class="ap-roi-item" v-for="sc in metricSummaryCards" :key="sc.label">
                    <span class="ap-roi-label">{{ sc.label }}</span>
                    <span class="ap-roi-val" :style="{ color: sc.color }">{{ sc.val }}</span>
                  </div>
                </div>
              </div>

              <div v-if="analysisLoading" class="analysis-panel__loading">
                <div class="spinner"></div>
                <p>数据加载中...</p>
              </div>

              <template v-else-if="chartData">
                <!-- 图表1: 7天趋势 -->
                <div class="ap-section">
                  <div class="ap-section__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                    {{ analysisCard?.title }} 近7天趋势
                  </div>
                  <div ref="apTrendRef" class="ap-chart" style="height:160px"></div>
                </div>

                <!-- 图表2: 驱动因子归因 / Top10素材CTR趋势 -->
                <div class="ap-section" v-if="chartData.drivers?.labels?.length || chartData.drivers?.type === 'top_materials_ctr'">
                  <div class="ap-section__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FA8C16" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    {{ chartData.drivers?.type === 'top_materials_ctr' ? '消耗Top10素材CTR趋势' : analysisCard?.title + ' 驱动因子归因' }}
                  </div>
                  <div ref="apCompareRef" class="ap-chart" :style="{ height: chartData.drivers?.type === 'top_materials_ctr' ? '280px' : '200px' }"></div>
                </div>

                <!-- 图表3: 各账户该指标对比 -->
                <div class="ap-section" v-if="chartData.breakdown?.length">
                  <div class="ap-section__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#722ED1" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                    各账户 {{ analysisCard?.title }} 对比
                  </div>
                  <div ref="apBreakdownRef" class="ap-chart" style="height:180px"></div>
                </div>
              </template>

              <div v-else class="analysis-panel__empty">暂无分析数据</div>
            </div>

            <!-- 底部操作 -->
            <div class="analysis-panel__footer">
              <button class="analysis-panel__btn" @click="fetchAnalysis" :disabled="analysisLoading">
                {{ analysisLoading ? '加载中...' : '刷新数据' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ===== 素材分析面板 ===== -->
    <Teleport to="body">
      <Transition :name="isMobile ? 'slide-up' : 'slide-right'">
        <div v-if="matPanelOpen" class="analysis-overlay" @click.self="closeMaterialAnalysis">
          <div :class="['analysis-panel', isMobile ? 'analysis-panel--bottom' : 'analysis-panel--right']">
            <div class="analysis-panel__header">
              <div class="analysis-panel__title-row">
                <span class="analysis-panel__icon" style="background:#FA8C1618;color:#FA8C16">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </span>
                <span class="analysis-panel__title">素材分析</span>
              </div>
              <button class="analysis-panel__close" @click="closeMaterialAnalysis">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="analysis-panel__body">
              <!-- 素材名称卡片 -->
              <div class="mat-name-card">
                <div class="mat-name-text">{{ matDetail?.entity_name || matDetail?.entity_id }}</div>
              </div>
              <!-- 核心指标 2x2 -->
              <div class="mat-kpi-grid" v-if="matDetail">
                <div class="mat-kpi c1">
                  <div class="mat-kpi-l">消耗</div>
                  <div class="mat-kpi-v">¥{{ parseFloat(matDetail.cost || 0).toFixed(0) }}</div>
                </div>
                <div class="mat-kpi c2">
                  <div class="mat-kpi-l">ROI</div>
                  <div class="mat-kpi-v">{{ matDetail.roi ? parseFloat(matDetail.roi).toFixed(2) : '--' }}</div>
                </div>
                <div class="mat-kpi c3">
                  <div class="mat-kpi-l">转化</div>
                  <div class="mat-kpi-v">{{ matDetail.convert_cnt || 0 }}</div>
                </div>
                <div class="mat-kpi c4">
                  <div class="mat-kpi-l">CTR</div>
                  <div class="mat-kpi-v">{{ fmtPct(matDetail.ctr) }}</div>
                </div>
              </div>
              <!-- 趋势图 -->
              <div v-if="matTrendLoading" class="analysis-panel__loading">
                <div class="spinner"></div>
                <p>加载趋势数据...</p>
              </div>
              <template v-else-if="matTrendData">
                <div class="ap-section">
                  <div class="ap-section__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                    消耗趋势
                  </div>
                  <div ref="matCostChartRef" class="ap-chart" style="height:160px"></div>
                </div>
                <div class="ap-section">
                  <div class="ap-section__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00B96B" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                    转化 & ROI 趋势
                  </div>
                  <div ref="matConvertChartRef" class="ap-chart" style="height:160px"></div>
                </div>
                <div class="ap-section">
                  <div class="ap-section__title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#722ED1" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    展示 & 点击趋势
                  </div>
                  <div ref="matTrafficChartRef" class="ap-chart" style="height:160px"></div>
                </div>
              </template>
              <div v-else class="analysis-panel__empty">暂无趋势数据</div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  
    <!-- ===== 账户分析弹窗 ===== -->
    <Teleport to="body">
      <div v-if="accPanelOpen" class="analysis-overlay" @click.self="closeAccountAnalysis">
        <div class="analysis-panel analysis-panel--right acc-panel">
          <div class="analysis-panel__header">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="account-item__avatar" style="width:36px;height:36px;font-size:16px">{{ (accDetail?.advertiser_name||'账').charAt(0) }}</div>
              <div>
                <div style="font-weight:600;font-size:14px">{{ accDetail?.advertiser_name }}</div>
                <div style="font-size:11px;color:#8c8c8c">ID: {{ accDetail?.advertiser_id }}</div>
              </div>
            </div>
            <button class="analysis-panel__close" @click="closeAccountAnalysis">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="analysis-panel__body" style="padding:16px">
            <div class="mat-kpi-grid" v-if="accKpi">
              <div class="mat-kpi c1"><div class="mat-kpi-v">¥{{ parseFloat(accKpi.today?.cost||0).toFixed(0) }}</div><div class="mat-kpi-l">今日消耗</div><div class="acc-kpi-yd">昨日 ¥{{ parseFloat(accKpi.yesterday?.cost||0).toFixed(0) }}</div></div>
              <div class="mat-kpi c2"><div class="mat-kpi-v">¥{{ parseFloat(accKpi.today?.gmv||0).toFixed(0) }}</div><div class="mat-kpi-l">GMV</div><div class="acc-kpi-yd">昨日 ¥{{ parseFloat(accKpi.yesterday?.gmv||0).toFixed(0) }}</div></div>
              <div class="mat-kpi c3"><div class="mat-kpi-v">{{ accKpi.today?.roi || 0 }}</div><div class="mat-kpi-l">ROI</div><div class="acc-kpi-yd">昨日 {{ accKpi.yesterday?.roi || 0 }}</div></div>
              <div class="mat-kpi c4"><div class="mat-kpi-v">{{ accKpi.today?.orders || 0 }}</div><div class="mat-kpi-l">转化数</div><div class="acc-kpi-yd">昨日 {{ accKpi.yesterday?.orders || 0 }}</div></div>
              <div class="mat-kpi c1"><div class="mat-kpi-v">{{ accKpi.today?.ctr || 0 }}%</div><div class="mat-kpi-l">CTR</div><div class="acc-kpi-yd">昨日 {{ accKpi.yesterday?.ctr || 0 }}%</div></div>
              <div class="mat-kpi c2"><div class="mat-kpi-v">¥{{ parseFloat(accKpi.today?.avg_cost||0).toFixed(0) }}</div><div class="mat-kpi-l">成交成本</div><div class="acc-kpi-yd">昨日 ¥{{ parseFloat(accKpi.yesterday?.avg_cost||0).toFixed(0) }}</div></div>
            </div>
            <div v-if="accTrendLoading" style="text-align:center;padding:30px"><a-spin /></div>
            <div v-if="!accTrendLoading && accTrendData">
              <div class="acc-chart-title">消耗 & GMV 趋势</div>
              <div ref="accCostChartRef" style="height:180px"></div>
              <div class="acc-chart-title">转化 & ROI 趋势</div>
              <div ref="accConvertChartRef" style="height:180px"></div>
              <div class="acc-chart-title">流量趋势</div>
              <div ref="accTrafficChartRef" style="height:180px"></div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import request from '../utils/request'
import { fmtNum, fmtPct } from '../utils/format'

const isMobile = ref(window.innerWidth < 768)
const loading = ref(false)
const trendLoading = ref(false)
const periodTab = ref('today')
const productTrendTab = ref('campaign')

const accounts = ref([])
const topCreatives = ref([])
const lastSyncTime = ref('')
const overviewSyncTime = ref('')
const compareType = ref('full_day')
const trendEntities = ref([])
const trendDates = ref([])

const costChartRef = ref()
const trendChartRef = ref()
let costChart = null
let trendChart = null

// 分析面板状态
const analysisPanelOpen = ref(false)
const analysisCard = ref(null)
const analysisLoading = ref(false)
const analysisContent = ref('')
const chartData = ref(null)
const roiDetail = ref(null)
const apTrendRef = ref()
const apCompareRef = ref()
const apBreakdownRef = ref()
let apTrendChart = null
let apCompareChart = null
let apBreakdownChart = null

const today = computed(() => dayjs().format('YYYY年MM月DD日'))

const COLORS = ['#1677FF', '#00B96B', '#FA8C16', '#FF4D4F', '#722ED1']

const costIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
const visitorIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
const roiIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
const ctrIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const cvrIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
const avgCostIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`

const statCards = ref([
  { key: 'cost', title: '消耗', value: 0, color: '#1677FF', icon: costIcon, yesterday: '--', growth: 0, displayValue: '0.00' },
  { key: 'visitor_count', title: '商品曝光量', value: 0, color: '#13C2C2', icon: visitorIcon, yesterday: '--', growth: 0, displayValue: '0' },
  { key: 'roi', title: 'ROI', value: 0, color: '#00B96B', icon: roiIcon, yesterday: '--', growth: 0, displayValue: '0.00' },
  { key: 'ctr', title: 'CTR', value: 0, color: '#722ED1', icon: ctrIcon, yesterday: '--', growth: 0, displayValue: '0.00%' },
  { key: 'cvr', title: '转化率', value: 0, color: '#FA8C16', icon: cvrIcon, yesterday: '--', growth: 0, displayValue: '0.00%' },
  { key: 'avg_convert_cost', title: '平均成交成本', value: 0, color: '#FF4D4F', icon: avgCostIcon, yesterday: '--', growth: 0, displayValue: '¥0.00' },
])

const formatCardValue = (card) => {
  if (card.key === 'cost' || card.key === 'avg_convert_cost') return '¥' + parseFloat(card.value || 0).toFixed(2)
  if (card.key === 'visitor_count') {
    const n = parseInt(card.value || 0)
    return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n.toLocaleString()
  }
  if (card.key === 'roi') return parseFloat(card.value || 0).toFixed(2)
  if (card.key === 'ctr' || card.key === 'cvr') return (parseFloat(card.value || 0) * 100).toFixed(2) + '%'
  const n = parseInt(card.value || 0)
  return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n.toLocaleString()
}

// ===== 分析面板 =====
const openAnalysis = (card) => {
  analysisCard.value = { ...card }
  analysisContent.value = ''
  analysisPanelOpen.value = true
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  fetchAnalysis()
}

const fetchAnalysis = async () => {
  if (!analysisCard.value) return
  analysisLoading.value = true
  chartData.value = null
  roiDetail.value = null
  analysisContent.value = ''
  try {
    const card = analysisCard.value
    const res = await request.post('/dashboard/analyze-metric', {
      metric_key: card.key,
      current_value: card.displayValue,
      previous_value: card.yesterday,
      growth: card.growth,
      period: periodTab.value,
    })
    const d = res.data || {}
    analysisContent.value = d.analysis || ''
    chartData.value = d.chart_data || null
    roiDetail.value = d.roi_detail || null
  } catch (e) {
    analysisContent.value = '网络异常，请重试'
  } finally {
    // 先关闭loading让DOM渲染图表容器，再渲染图表
    analysisLoading.value = false
    await nextTick()
    await nextTick()
    renderApCharts()
  }
}

// 根据当前指标生成对应的概要卡片（用 drivers 数据）
const metricSummaryCards = computed(() => {
  const cd = chartData.value
  const rd = roiDetail.value
  const key = analysisCard.value?.key
  if (!cd?.drivers) return []
  const dr = cd.drivers
  if (dr.type === 'top_materials_ctr') return [] // CTR用独立图表展示
  const t = dr.today || []
  const y = dr.yesterday || []
  const labels = dr.labels || []
  // 取前3个最重要的驱动因子展示
  const cards = []
  const fmtV = (v, label) => {
    if (typeof v !== 'number') return v
    const l = label.toLowerCase()
    if (l.includes('率') || l.includes('ctr') || l.includes('cvr') || l.includes('roi')) return v.toFixed(2) + (l.includes('roi') ? '' : '%')
    if (l.includes('消耗') || l.includes('gmv') || l.includes('cpm') || l.includes('成本') || l.includes('客单') || l.includes('cpa') || l.includes('cpc')) return '¥' + (v >= 10000 ? (v/10000).toFixed(1)+'w' : v.toFixed(0))
    return v >= 10000 ? (v/10000).toFixed(1)+'w' : v.toLocaleString()
  }
  const pctC = (a, b) => b > 0 ? (((a-b)/b)*100).toFixed(1) : '0'
  const CARD_COLORS = ['#1677FF', '#00B96B', '#FA8C16']
  for (let i = 0; i < Math.min(3, labels.length); i++) {
    const change = pctC(t[i], y[i])
    cards.push({
      label: labels[i],
      val: fmtV(t[i], labels[i]),
      color: parseFloat(change) >= 0 ? CARD_COLORS[i % 3] : '#FF4D4F',
      sub: (parseFloat(change)>=0?'↑':'↓') + Math.abs(parseFloat(change)).toFixed(1) + '%'
    })
  }
  // 如果是ROI，额外加含券/不含券
  if (key === 'roi' && rd) {
    return [
      { label: 'ROI含券', val: rd.with_coupon, color: '#00B96B' },
      { label: 'ROI不含券', val: rd.without_coupon, color: '#FA8C16' },
      { label: '券差', val: rd.coupon_diff, color: '#FF4D4F' },
    ]
  }
  return cards
})

const AP_COLORS = ['#1677FF', '#00B96B', '#FA8C16', '#FF4D4F', '#722ED1', '#13C2C2']

const renderApCharts = () => {
  if (!chartData.value) return
  const cd = chartData.value
  const metricKey = analysisCard.value?.key
  const metricColor = analysisCard.value?.color || '#1677FF'
  const metricTitle = analysisCard.value?.title || ''
  const isRate = ['ctr', 'cvr'].includes(metricKey)
  const isMoney = ['cost', 'avg_convert_cost'].includes(metricKey)
  const isRoi = metricKey === 'roi'
  const fmtVal = v => isRate ? v.toFixed(2)+'%' : isMoney ? '¥'+v.toFixed(2) : isRoi ? v.toFixed(2) : v.toLocaleString()
  const fmtAxis = v => isRate ? v.toFixed(1)+'%' : isMoney ? (v>=1000?(v/1000).toFixed(1)+'k':'¥'+v.toFixed(0)) : isRoi ? v.toFixed(1) : (v>=10000?(v/10000).toFixed(1)+'w':v.toFixed(0))

  // --- 图1: 7天趋势折线图 ---
  const trendObj = cd.trend
  if (apTrendRef.value && trendObj?.date?.length) {
    if (apTrendChart) apTrendChart.dispose()
    apTrendChart = echarts.init(apTrendRef.value)
    apTrendChart.setOption({
      grid: { left: 50, right: 16, top: 24, bottom: 28 },
      xAxis: { type: 'category', data: trendObj.date, boundaryGap: false, axisLabel: { fontSize: 10, color: '#8C8C8C' }, axisLine: { lineStyle: { color: '#F0F1F3' } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#8C8C8C', formatter: fmtAxis } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,26,46,.92)', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 12 }, formatter: p => `<b>${p[0].axisValue}</b><br/>${metricTitle}: ${fmtVal(p[0].value)}` },
      series: [{
        type: 'line', data: trendObj.value, smooth: 0.4, symbol: 'circle', symbolSize: 6,
        lineStyle: { color: metricColor, width: 2.5 },
        itemStyle: { color: metricColor, borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: metricColor + '30' }, { offset: 1, color: metricColor + '05' }] } },
        markPoint: { data: [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }], symbolSize: 36, label: { fontSize: 9 } },
        markLine: { data: [{ type: 'average', name: '均值' }], lineStyle: { color: '#FF4D4F', type: 'dashed' }, label: { fontSize: 10 } }
      }]
    })
  }

  // --- 图2: 驱动因子归因 / Top10素材CTR趋势 ---
  if (apCompareRef.value && cd.drivers?.type === 'top_materials_ctr' && cd.drivers.materials?.length) {
    // CTR专用：消耗Top10素材CTR趋势（多条折线）
    if (apCompareChart) apCompareChart.dispose()
    apCompareChart = echarts.init(apCompareRef.value)
    const mats = cd.drivers.materials
    const allDates = [...new Set(mats.flatMap(m => m.trend.map(t => t.date)))].sort()
    const matColors = ['#1677FF', '#52C41A', '#FA8C16', '#722ED1', '#EB2F96', '#13C2C2', '#F5222D', '#2F54EB', '#A0D911', '#FF85C0']
    const series = mats.map((m, i) => ({
      name: m.name || m.material_id,
      type: 'line',
      data: allDates.map(d => { const pt = m.trend.find(t => t.date === d); return pt ? pt.ctr : null }),
      smooth: true,
      connectNulls: true,
      lineStyle: { width: 2 },
      itemStyle: { color: matColors[i % matColors.length] },
      symbol: 'circle',
      symbolSize: 4,
    }))
    apCompareChart.setOption({
      grid: { left: 40, right: 15, top: 30, bottom: 50 },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 9 }, itemWidth: 10, itemHeight: 8, formatter: n => n.length > 12 ? n.slice(0, 12) + '..' : n },
      xAxis: { type: 'category', data: allDates, axisLabel: { fontSize: 10, color: '#888' } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#888', formatter: v => v + '%' }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,26,46,.92)', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 11 } },
      series,
    })
  } else if (apCompareRef.value && cd.drivers?.labels?.length) {
    // 通用驱动因子归因
    if (apCompareChart) apCompareChart.dispose()
    apCompareChart = echarts.init(apCompareRef.value)
    const dr = cd.drivers
    const changeRates = dr.labels.map((_, i) => {
      const t = dr.today[i], y = dr.yesterday[i]
      return y > 0 ? parseFloat(((t - y) / y * 100).toFixed(1)) : 0
    })
    apCompareChart.setOption({
      grid: { left: 70, right: 50, top: 8, bottom: 28 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#8C8C8C', formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } } },
      yAxis: { type: 'category', data: dr.labels, axisLabel: { fontSize: 11, color: '#333' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#F0F1F3' } } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,26,46,.92)', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 11 }, formatter: p => { const i = p[0].dataIndex; return `<b>${dr.labels[i]}</b><br/>今日: ${dr.today[i].toLocaleString()}<br/>昨日: ${dr.yesterday[i].toLocaleString()}<br/>变化: ${changeRates[i]>0?'+':''}${changeRates[i]}%` } },
      series: [{
        type: 'bar', data: changeRates.map((v, i) => ({
          value: v,
          itemStyle: { color: v >= 0 ? '#00B96B' : '#FF4D4F', borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] }
        })),
        barWidth: '50%',
        label: { show: true, position: 'right', fontSize: 10, formatter: p => (p.value > 0 ? '+' : '') + p.value + '%' }
      }]
    })
  }

  // --- 图3: 各账户该指标对比(横向柱状图) ---
  if (apBreakdownRef.value && cd.breakdown?.length) {
    if (apBreakdownChart) apBreakdownChart.dispose()
    apBreakdownChart = echarts.init(apBreakdownRef.value)
    const bd = cd.breakdown
    const names = bd.map(b => b.name.length > 8 ? b.name.slice(0, 8) + '..' : b.name)
    const values = bd.map(b => b.value)
    apBreakdownChart.setOption({
      grid: { left: 80, right: 50, top: 8, bottom: 28 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#8C8C8C', formatter: v => fmtAxis(v) }, splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } } },
      yAxis: { type: 'category', data: names.reverse(), axisLabel: { fontSize: 11, color: '#333' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#F0F1F3' } } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,26,46,.92)', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 11 }, formatter: p => { const item = bd[bd.length - 1 - p[0].dataIndex]; return `<b>${item.name}</b><br/>${metricTitle}: ${fmtVal(item.value)}` } },
      series: [{
        type: 'bar', data: [...values].reverse().map((v, i) => ({ value: v, itemStyle: { color: AP_COLORS[(bd.length - 1 - i) % AP_COLORS.length], borderRadius: [0, 4, 4, 0] } })),
        barWidth: '55%',
        label: { show: true, position: 'right', fontSize: 10, formatter: p => fmtVal(p.value) }
      }]
    })
  }
}

const closeAnalysis = () => {
  analysisPanelOpen.value = false
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  apTrendChart?.dispose(); apTrendChart = null
  apCompareChart?.dispose(); apCompareChart = null
  apBreakdownChart?.dispose(); apBreakdownChart = null
}

// ===== 素材分析面板 =====
const matPanelOpen = ref(false)
const matDetail = ref(null)
const matTrendLoading = ref(false)
const matTrendData = ref(null)
const matCostChartRef = ref()
const matConvertChartRef = ref()
const matTrafficChartRef = ref()
let matCostChart = null, matConvertChart = null, matTrafficChart = null

const openMaterialAnalysis = async (item) => {
  matDetail.value = { ...item }
  matPanelOpen.value = true
  matTrendData.value = null
  matTrendLoading.value = true
  document.body.style.overflow = 'hidden'
  try {
    const res = await request.get(`/dashboard/material-detail/${item.entity_id}`)
    if (res.code === 0 && res.data) {
      matDetail.value = { ...matDetail.value, ...res.data.today }
      matTrendData.value = res.data.trend
    }
  } catch (e) { console.error(e) }
  finally {
    matTrendLoading.value = false
    await nextTick()
    await nextTick()
    renderMatCharts()
  }
}


// ===== 账户分析弹窗 =====
const accPanelOpen = ref(false)
const accDetail = ref(null)
const accKpi = ref(null)
const accTrendLoading = ref(false)
const accTrendData = ref(null)
const accCostChartRef = ref()
const accConvertChartRef = ref()
const accTrafficChartRef = ref()
let accCostChart = null, accConvertChart = null, accTrafficChart = null

const openAccountAnalysis = async (acc) => {
  accDetail.value = { ...acc }
  accPanelOpen.value = true
  accKpi.value = null
  accTrendData.value = null
  accTrendLoading.value = true
  document.body.style.overflow = 'hidden'
  try {
    const [detailRes, trendRes] = await Promise.all([
      request.get('/accounts/' + acc.advertiser_id + '/detail'),
      request.get('/accounts/' + acc.advertiser_id + '/trend')
    ])
    if (detailRes.code === 0) accKpi.value = detailRes.data
    if (trendRes.code === 0) accTrendData.value = trendRes.data
  } catch (e) { console.error(e) }
  finally {
    accTrendLoading.value = false
    await nextTick()
    await nextTick()
    renderAccCharts()
  }
}

const closeAccountAnalysis = () => {
  accPanelOpen.value = false
  document.body.style.overflow = ''
  accCostChart?.dispose(); accCostChart = null
  accConvertChart?.dispose(); accConvertChart = null
  accTrafficChart?.dispose(); accTrafficChart = null
}

const renderAccCharts = () => {
  const td = accTrendData.value
  if (!td?.dates?.length) return
  const mkOpt = (colors, names, datasets) => ({
    grid: { left: 50, right: 50, top: 28, bottom: 28 },
    legend: { top: 0, right: 0, textStyle: { fontSize: 10, color: '#8C8C8C' } },
    xAxis: { type: 'category', data: td.dates, boundaryGap: false, axisLabel: { fontSize: 10, color: '#8C8C8C' }, axisLine: { lineStyle: { color: '#F0F1F3' } }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#8C8C8C' } },
      { type: 'value', splitLine: { show: false }, axisLabel: { fontSize: 10, color: '#8C8C8C' } }
    ],
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,26,46,.92)', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 11 } },
    series: names.map((n, i) => ({
      name: n, type: 'line', data: datasets[i], smooth: 0.4, symbol: 'circle', symbolSize: 5,
      yAxisIndex: i >= 1 ? 1 : 0,
      lineStyle: { color: colors[i], width: 2 }, itemStyle: { color: colors[i] },
      areaStyle: i === 0 ? { color: { type: 'linear', x:0,y:0,x2:0,y2:1, colorStops: [{offset:0,color:colors[i]+'25'},{offset:1,color:colors[i]+'05'}] } } : undefined
    }))
  })
  if (accCostChartRef.value) {
    accCostChart?.dispose()
    accCostChart = echarts.init(accCostChartRef.value)
    accCostChart.setOption(mkOpt(['#1677FF','#FA8C16'], ['消耗','GMV'], [td.cost, td.gmv]))
  }
  if (accConvertChartRef.value) {
    accConvertChart?.dispose()
    accConvertChart = echarts.init(accConvertChartRef.value)
    accConvertChart.setOption(mkOpt(['#00B96B','#722ED1'], ['转化','ROI'], [td.orders, td.roi]))
  }
  if (accTrafficChartRef.value) {
    accTrafficChart?.dispose()
    accTrafficChart = echarts.init(accTrafficChartRef.value)
    accTrafficChart.setOption(mkOpt(['#1677FF','#00B96B'], ['曝光','点击'], [td.show, td.click]))
  }
}

const closeMaterialAnalysis = () => {
  matPanelOpen.value = false
  document.body.style.overflow = ''
  matCostChart?.dispose(); matCostChart = null
  matConvertChart?.dispose(); matConvertChart = null
  matTrafficChart?.dispose(); matTrafficChart = null
}

const renderMatCharts = () => {
  const td = matTrendData.value
  if (!td?.dates?.length) return
  const chartOpt = (color, name, data, unit) => ({
    grid: { left: 50, right: 16, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: td.dates, boundaryGap: false, axisLabel: { fontSize: 10, color: '#8C8C8C' }, axisLine: { lineStyle: { color: '#F0F1F3' } }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#8C8C8C' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,26,46,.92)', borderColor: 'transparent', textStyle: { color: '#fff', fontSize: 12 } },
    series: Array.isArray(name) ? name.map((n, i) => ({
      name: n, type: 'line', data: data[i], smooth: 0.4, symbol: 'circle', symbolSize: 5,
      lineStyle: { color: color[i], width: 2 }, itemStyle: { color: color[i] },
      areaStyle: { color: { type: 'linear', x:0, y:0, x2:0, y2:1, colorStops: [{ offset:0, color: color[i]+'25' }, { offset:1, color: color[i]+'05' }] } }
    })) : [{
      name, type: 'line', data, smooth: 0.4, symbol: 'circle', symbolSize: 6,
      lineStyle: { color, width: 2.5 }, itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
      areaStyle: { color: { type: 'linear', x:0, y:0, x2:0, y2:1, colorStops: [{ offset:0, color: color+'30' }, { offset:1, color: color+'05' }] } },
      markPoint: { data: [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }], symbolSize: 36, label: { fontSize: 9 } },
      markLine: { data: [{ type: 'average', name: '均值' }], lineStyle: { color: '#FF4D4F', type: 'dashed' }, label: { fontSize: 10 } }
    }],
    legend: Array.isArray(name) ? { top: 0, right: 0, textStyle: { fontSize: 10, color: '#8C8C8C' } } : undefined
  })

  if (matCostChartRef.value) {
    matCostChart?.dispose()
    matCostChart = echarts.init(matCostChartRef.value)
    matCostChart.setOption(chartOpt('#1677FF', '消耗', td.cost))
  }
  if (matConvertChartRef.value) {
    matConvertChart?.dispose()
    matConvertChart = echarts.init(matConvertChartRef.value)
    matConvertChart.setOption(chartOpt(['#00B96B', '#FA8C16'], ['转化', 'ROI'], [td.orders, td.roi]))
  }
  if (matTrafficChartRef.value) {
    matTrafficChart?.dispose()
    matTrafficChart = echarts.init(matTrafficChartRef.value)
    matTrafficChart.setOption(chartOpt(['#722ED1', '#13C2C2'], ['展示', '点击'], [td.show, td.click]))
  }
}

const renderMd = (text) => {
  if (!text) return ''
  return text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}

const loadData = async () => {
  loading.value = true
  try {
    const [overviewRes, realtimeRes] = await Promise.allSettled([
      request.get('/dashboard/overview', { params: { period: periodTab.value } }),
      request.get('/dashboard/realtime')
    ])

    if (overviewRes.status === 'fulfilled') {
      const d = overviewRes.value.data
      const t = d.today || {}
      const y = d.yesterday || {}
      const pct = (cur, prev) => prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : 0

      // 消耗
      statCards.value[0].value = t.cost || 0
      statCards.value[0].yesterday = '¥' + parseFloat(y.cost || 0).toFixed(0)
      statCards.value[0].growth = pct(t.cost || 0, y.cost || 0)

      // 访客总数
      statCards.value[1].value = t.visitor_count || t.show_cnt || 0
      statCards.value[1].yesterday = fmtNum(y.visitor_count || y.show_cnt || 0)
      statCards.value[1].growth = pct(t.visitor_count || t.show_cnt || 0, y.visitor_count || y.show_cnt || 0)

      // ROI
      statCards.value[2].value = t.roi || 0
      statCards.value[2].yesterday = parseFloat(y.roi || 0).toFixed(2)
      statCards.value[2].growth = pct(t.roi || 0, y.roi || 0)

      // CTR
      statCards.value[3].value = t.ctr || 0
      statCards.value[3].yesterday = (parseFloat(y.ctr || 0) * 100).toFixed(2) + '%'
      statCards.value[3].growth = pct(t.ctr || 0, y.ctr || 0)

      // 转化率
      statCards.value[4].value = t.avg_cvr || 0
      statCards.value[4].yesterday = (parseFloat(y.avg_cvr || 0) * 100).toFixed(2) + '%'
      statCards.value[4].growth = pct(t.avg_cvr || 0, y.avg_cvr || 0)

      // 平均成交成本
      statCards.value[5].value = t.avg_convert_cost || 0
      statCards.value[5].yesterday = '¥' + parseFloat(y.avg_convert_cost || 0).toFixed(2)
      statCards.value[5].growth = pct(t.avg_convert_cost || 0, y.avg_convert_cost || 0)

      statCards.value.forEach(c => { c.displayValue = formatCardValue(c) })
      overviewSyncTime.value = overviewRes.value.data?.last_sync || ''
      compareType.value = overviewRes.value.data?.compare_type || 'full_day'
      accounts.value = d.accounts || []
      renderCostChart(d.trend || [])
    } else {
      console.error('overview failed', overviewRes.reason)
    }

    if (realtimeRes.status === 'fulfilled') {
      topCreatives.value = realtimeRes.value.data?.top_creatives || []
      lastSyncTime.value = realtimeRes.value.data?.last_sync || ''
    } else {
      console.error('realtime failed', realtimeRes.reason)
    }
  } catch (e) {
    console.error('loadData error', e)
  } finally {
    loading.value = false
  }
}

const loadProductTrend = async () => {
  trendLoading.value = true
  try {
    const res = await request.get('/dashboard/product-trend', { params: { entityType: productTrendTab.value, topN: 5 } })
    if (res.code === 0) {
      trendDates.value = res.data.dates || []
      trendEntities.value = res.data.entities || []
      await nextTick()
      renderTrendChart()
    }
  } catch (e) { console.error(e) } finally { trendLoading.value = false }
}

const loadAll = () => { loadData(); loadProductTrend() }

const renderCostChart = (trend) => {
  if (!costChart || !trend.length) return
  const labels = trend.map(t => t.stat_date ? t.stat_date.slice(5) : '')
  const values = trend.map(t => parseFloat(t.cost || 0))
  costChart.setOption({
    grid: { left: 48, right: 12, top: 16, bottom: 32 },
    xAxis: {
      type: 'category', data: labels, boundaryGap: false,
      axisLabel: { fontSize: 10, color: '#8C8C8C' },
      axisLine: { lineStyle: { color: '#F0F1F3' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } },
      axisLabel: { fontSize: 10, color: '#8C8C8C', formatter: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26,26,46,0.9)',
      borderColor: 'transparent',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: p => p[0].axisValue + '<br/>消耗 ¥' + parseFloat(p[0].value).toFixed(2)
    },
    series: [{
      type: 'line', data: values, smooth: 0.5,
      symbol: 'circle', symbolSize: 5,
      lineStyle: { color: '#1677FF', width: 2.5 },
      itemStyle: { color: '#1677FF', borderColor: '#fff', borderWidth: 2 },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(22,119,255,0.18)' }, { offset: 1, color: 'rgba(22,119,255,0.01)' }] }
      }
    }]
  }, true)
}

const renderTrendChart = () => {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)
  const entities = trendEntities.value
  const dates = trendDates.value.map(d => d.slice(5))

  trendChart.setOption({
    grid: { left: 44, right: 44, top: 28, bottom: 44 },
    legend: {
      bottom: 0, type: 'scroll', padding: [0, 0, 0, 0],
      textStyle: { fontSize: 10, color: '#595959' },
      itemWidth: 12, itemHeight: 8
    },
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLabel: { fontSize: 10, color: '#8C8C8C' },
      axisLine: { lineStyle: { color: '#F0F1F3' } },
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value', name: 'CTR%', nameTextStyle: { fontSize: 9, color: '#8C8C8C', padding: [0, 0, 0, -20] },
        axisLabel: { formatter: v => v.toFixed(1) + '%', fontSize: 9, color: '#8C8C8C' },
        splitLine: { lineStyle: { color: '#F5F6F8', type: 'dashed' } }
      },
      {
        type: 'value', name: 'CVR%', nameTextStyle: { fontSize: 9, color: '#8C8C8C', padding: [0, -20, 0, 0] },
        axisLabel: { formatter: v => v.toFixed(1) + '%', fontSize: 9, color: '#8C8C8C' },
        splitLine: { show: false }
      }
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26,26,46,0.9)',
      borderColor: 'transparent',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: params => {
        let s = '<b>' + params[0].axisValue + '</b><br/>'
        params.forEach(p => {
          if (p.value != null) s += p.marker + p.seriesName + ': ' + parseFloat(p.value || 0).toFixed(2) + '%<br/>'
        })
        return s
      }
    },
    series: [
      ...entities.map((e, i) => ({
        name: (e.entity_name || e.entity_id).slice(0, 10),
        type: 'line', yAxisIndex: 0,
        data: e.ctr_series, smooth: 0.4, connectNulls: true,
        lineStyle: { color: COLORS[i % COLORS.length], width: 2 },
        itemStyle: { color: COLORS[i % COLORS.length], borderColor: '#fff', borderWidth: 1.5 },
        symbol: 'circle', symbolSize: 4,
      })),
      ...entities.map((e, i) => ({
        name: (e.entity_name || e.entity_id).slice(0, 10) + '(转化)',
        type: 'line', yAxisIndex: 1,
        data: e.cvr_series, smooth: 0.4, connectNulls: true,
        lineStyle: { color: COLORS[i % COLORS.length], width: 1.5, type: 'dashed' },
        itemStyle: { color: COLORS[i % COLORS.length] },
        symbol: 'triangle', symbolSize: 4,
      }))
    ]
  }, true)
}

const onResize = () => {
  isMobile.value = window.innerWidth < 768
  costChart?.resize()
  trendChart?.resize()
  apTrendChart?.resize()
  apCompareChart?.resize()
  apBreakdownChart?.resize()
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  await nextTick()
  if (costChartRef.value) costChart = echarts.init(costChartRef.value)
  await loadAll()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})
</script>

<style scoped>
.dash { padding-bottom: 8px; }

/* ===== 日期筛选行 ===== */
.dash-filter {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px; padding: 0 2px;
}
.dash-filter__label { font-size: 11px; color: var(--text-hint); margin-right: 4px; }
.dash-filter__sync-main { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.dash-filter__value { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.dash-filter__right { display: flex; gap: 4px; }
.dash-filter__btn {
  padding: 4px 10px; border: 1px solid var(--border); border-radius: 100px;
  background: #fff; font-size: 11px; color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
}
.dash-filter__btn.active { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }

/* ===== 核心指标网格 ===== */
.stat-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;
}
.stat-card {
  background: #fff; border-radius: var(--radius-md); padding: 14px 14px 10px;
  box-shadow: var(--shadow-xs); border: 1px solid var(--border);
  cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;
}
.stat-card:active { transform: scale(0.97); }
.stat-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.stat-card__label { font-size: 11px; color: var(--text-hint); font-weight: 500; }
.stat-card__badge {
  width: 26px; height: 26px; border-radius: var(--radius-xs);
  display: flex; align-items: center; justify-content: center;
}
.stat-card__value { font-size: 22px; font-weight: 700; line-height: 1.1; margin-bottom: 8px; }
.stat-card__bottom { display: flex; align-items: center; justify-content: space-between; }
.stat-card__prev { font-size: 10px; color: var(--text-hint); }
.stat-card__trend { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 100px; }
.trend-up { background: #E8FFF3; color: #00B96B; }
.trend-down { background: #FFF1F0; color: #FF4D4F; }

.stat-card__tap {
  position: absolute; bottom: 0; left: 0; right: 0;
  text-align: center; font-size: 9px; color: var(--text-hint);
  padding: 2px 0; background: var(--bg-secondary); opacity: 0.7;
}

/* ===== 通用卡片 ===== */
.dt-card {
  background: #fff; border-radius: var(--radius-md); box-shadow: var(--shadow-xs);
  border: 1px solid var(--border); margin-bottom: 12px; overflow: hidden;
}
.dt-card__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--divider);
}
.dt-card__title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.dt-card__badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 100px; }
.dt-card__badge--blue { background: var(--c-primary-bg); color: var(--c-primary); }
.dt-card__badge--gray { background: var(--bg-secondary); color: var(--text-hint); }
.dt-card__badge--orange { background: var(--c-warning-bg); color: var(--c-warning); }
.dt-card__body { padding: 14px; }
.dt-card__body--list { padding: 0; }

.chart-box { width: 100%; }

.seg-tabs { display: flex; background: var(--bg-secondary); border-radius: var(--radius-xs); padding: 2px; gap: 1px; }
.seg-tab {
  padding: 3px 10px; border: none; background: none; border-radius: 4px;
  font-size: 11px; color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
}
.seg-tab.active { background: #fff; color: var(--c-primary); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

/* ===== 趋势表格 ===== */
.trend-table { margin-top: 12px; border-top: 1px solid var(--divider); }
.trend-table__row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--divider); }
.trend-table__row:last-child { border-bottom: none; }
.trend-table__row--header { padding: 6px 0; }
.trend-table__row--header span { font-size: 10px; color: var(--text-hint); font-weight: 600; }
.trend-table__row--alt { background: var(--bg-secondary); margin: 0 -14px; padding: 8px 14px; }
.trend-table__name {
  flex: 1; font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 6px;
}
.trend-table__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.trend-table__metric { width: 68px; text-align: center; font-size: 12px; flex-shrink: 0; font-weight: 600; }
.trend-table__cost { width: 60px; text-align: right; font-size: 12px; color: var(--c-primary); font-weight: 700; flex-shrink: 0; }

/* ===== 账户条目 ===== */
.account-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--divider); }
.account-item:last-child { border-bottom: none; }
.account-item__avatar {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, #1677FF, #4096FF); color: #fff; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.account-item__info { flex: 1; min-width: 0; }
.account-item__name { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.account-item__metrics { display: flex; gap: 6px; flex-wrap: wrap; }
.account-item__cost { text-align: right; flex-shrink: 0; }
.account-item__cost-val { display: block; font-size: 16px; font-weight: 700; color: var(--c-primary); }
.account-item__cost-label { font-size: 10px; color: var(--text-hint); }

.metric-tag { font-size: 10px; color: var(--text-secondary); }
.metric-pill { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 100px; }
.metric-pill--blue { background: var(--c-primary-bg); color: var(--c-primary); }
.metric-pill--green { background: var(--c-success-bg); color: var(--c-success); }

/* ===== 排行条目 ===== */
.rank-item { display: flex; align-items: center; gap: 12px; padding: 11px 16px; border-bottom: 1px solid var(--divider); transition: background 0.15s; cursor: pointer; }
.rank-item:last-child { border-bottom: none; }
.rank-item:hover { background: var(--bg-secondary); }
.rank-item:active { background: var(--bg-secondary); }

/* 素材分析面板 */
.mat-name-card { background: #F7F8FA; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.mat-name-text { font-size: 13px; font-weight: 500; color: #4E5969; line-height: 1.6; word-break: break-all; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mat-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
.mat-kpi { border-radius: 10px; padding: 14px; }
.mat-kpi.c1 { background: linear-gradient(135deg, #E8F4FF, #D4EAFF); }
.mat-kpi.c2 { background: linear-gradient(135deg, #E8FFF3, #C6F7DC); }
.mat-kpi.c3 { background: linear-gradient(135deg, #FFF7E8, #FFECC6); }
.mat-kpi.c4 { background: linear-gradient(135deg, #F3E8FF, #E0CFFF); }
.mat-kpi-l { font-size: 11px; color: #86909C; margin-bottom: 4px; }
.mat-kpi-v { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: #1D2129; }
.mat-kpi.c1 .mat-kpi-v { color: #1677FF; }
.mat-kpi.c2 .mat-kpi-v { color: #00B42A; }
.mat-kpi.c3 .mat-kpi-v { color: #FA8C16; }
.mat-kpi.c4 .mat-kpi-v { color: #722ED1; }
.rank-item__num {
  width: 22px; height: 22px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0; background: var(--bg-secondary); color: var(--text-hint);
}
.rank-0 { background: #FFF7E6; color: #FF8A00; }
.rank-1 { background: #F0F5FF; color: #1677FF; }
.rank-2 { background: #F6FFED; color: #00B96B; }
.rank-item__info { flex: 1; min-width: 0; }
.rank-item__name { font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-item__metrics { display: flex; gap: 6px; }
.rank-item__right { text-align: right; flex-shrink: 0; }
.rank-item__cost { font-size: 14px; font-weight: 700; color: var(--c-primary); }
.rank-change { font-size: 10px; font-weight: 600; margin-top: 2px; }
.rank-up { color: #00B96B; }
.rank-down { color: #FF4D4F; }
.rank-same { color: #8C8C8C; }
.rank-new { color: #FA8C16; }

/* ===== 空状态 ===== */
.empty-tip { padding: 28px 16px; text-align: center; color: var(--text-hint); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.empty-tip p { font-size: 12px; margin: 0; }

/* ===== 刷新按钮 ===== */
.dash-refresh { padding: 4px 0 8px; text-align: center; }
.dash-refresh__btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 20px;
  border: 1px solid var(--border); border-radius: 100px; background: #fff;
  font-size: 13px; color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
}
.dash-refresh__btn:hover:not(:disabled) { border-color: var(--c-primary); color: var(--c-primary); }
.dash-refresh__btn:disabled { opacity: 0.5; cursor: not-allowed; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; }

/* ===== 分析面板 - 遮罩 ===== */
.analysis-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.35); backdrop-filter: blur(2px);
}

/* ===== 分析面板 - 右侧抽屉(桌面端) ===== */
.analysis-panel--right {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 420px; max-width: 90vw;
  background: #fff; display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,0.12);
}

/* ===== 分析面板 - 底部弹出(移动端) ===== */
.analysis-panel--bottom {
  position: absolute; left: 0; right: 0; bottom: 0;
  max-height: 75vh; min-height: 40vh;
  background: #fff; display: flex; flex-direction: column;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
}

/* ===== 分析面板内部 ===== */
.analysis-panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 10px; border-bottom: 1px solid var(--divider); flex-shrink: 0;
}
.analysis-panel__title-row { display: flex; align-items: center; gap: 10px; }
.analysis-panel__icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.analysis-panel__title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.analysis-panel__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: var(--bg-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: var(--text-secondary);
}
.analysis-panel__close:hover { background: #eee; }

.analysis-panel__body { flex: 1; overflow-y: auto; padding: 0; -webkit-overflow-scrolling: touch; }

/* 概要区 */
.analysis-panel__summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; background: var(--bg-secondary); gap: 12px; flex-wrap: wrap;
}
.ap-summary__value { font-size: 28px; font-weight: 800; line-height: 1.2; }
.ap-summary__sub { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.ap-summary__prev { font-size: 11px; color: var(--text-hint); }
.ap-summary__trend { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 100px; }

/* ROI口径对比 */
.ap-roi-box { display: flex; gap: 8px; }
.ap-roi-item { text-align: center; background: #fff; border-radius: 8px; padding: 6px 10px; min-width: 62px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.ap-roi-label { display: block; font-size: 9px; color: var(--text-hint); margin-bottom: 2px; }
.ap-roi-val { display: block; font-size: 16px; font-weight: 800; }

/* 图表区块 */
.ap-section { padding: 14px 18px; border-bottom: 1px solid var(--divider); }
.ap-section:last-child { border-bottom: none; }
.ap-section__title {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px;
}
.ap-chart { width: 100%; }

/* AI指导区块 */
.ap-section--ai { background: linear-gradient(135deg, #F0F5FF 0%, #E8FFF3 100%); border-radius: 0; }
.ap-ai-content { font-size: 13px; line-height: 1.75; color: var(--text-primary); }
.ap-ai-content :deep(strong) { color: #1677FF; font-weight: 700; }
.ap-ai-content :deep(li) { margin: 3px 0; padding-left: 2px; position: relative; }
.ap-ai-content :deep(h2), .ap-ai-content :deep(h3), .ap-ai-content :deep(h4) { font-size: 13px; font-weight: 700; color: var(--c-primary); margin: 10px 0 4px; }
.ap-ai-content :deep(p) { margin: 4px 0; }
.ap-ai-content :deep(br) { line-height: 1.2; }

.analysis-panel__loading { text-align: center; padding: 60px 0; color: var(--text-hint); }
.analysis-panel__loading .spinner {
  display: inline-block; width: 28px; height: 28px;
  border: 3px solid var(--c-primary); border-top-color: transparent;
  border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 12px;
}
.analysis-panel__loading p { font-size: 13px; margin: 0; }

.analysis-panel__empty { text-align: center; padding: 60px 0; color: var(--text-hint); font-size: 13px; }

.analysis-panel__footer {
  padding: 12px 20px; border-top: 1px solid var(--divider); flex-shrink: 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
.analysis-panel__btn {
  width: 100%; padding: 10px; border: none; border-radius: 8px;
  background: var(--c-primary); color: #fff; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.analysis-panel__btn:hover:not(:disabled) { opacity: 0.9; }
.analysis-panel__btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== 动画：右侧滑入 ===== */
.slide-right-enter-active, .slide-right-leave-active { transition: all 0.3s ease; }
.slide-right-enter-active .analysis-panel--right,
.slide-right-leave-active .analysis-panel--right { transition: transform 0.3s ease; }
.slide-right-enter-from { opacity: 0; }
.slide-right-enter-from .analysis-panel--right { transform: translateX(100%); }
.slide-right-leave-to { opacity: 0; }
.slide-right-leave-to .analysis-panel--right { transform: translateX(100%); }

/* ===== 动画：底部弹出 ===== */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-active .analysis-panel--bottom,
.slide-up-leave-active .analysis-panel--bottom { transition: transform 0.3s ease; }
.slide-up-enter-from { opacity: 0; }
.slide-up-enter-from .analysis-panel--bottom { transform: translateY(100%); }
.slide-up-leave-to { opacity: 0; }
.slide-up-leave-to .analysis-panel--bottom { transform: translateY(100%); }

/* ===== 桌面端增强 ===== */
@media (min-width: 768px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }
  .stat-card { padding: 18px; }
  .stat-card__value { font-size: 26px; }
  .stat-card__label { font-size: 13px; }
  .stat-card:hover { border-color: var(--c-primary); box-shadow: var(--shadow-sm); }
  .dt-card__body { padding: 16px; }
  .trend-table__metric { width: 90px; }
  .trend-table__cost { width: 80px; }
  .rank-item { padding: 12px 20px; }
  .account-item { padding: 14px 20px; }
}
@media (min-width: 1024px) {
  .stat-grid { grid-template-columns: repeat(6, 1fr); }
}

.dt-card__sync-time { font-size: 11px; color: #8c8c8c; margin-left: auto; font-weight: 400; }
.rank-item__yesterday { font-size: 10px; color: #8c8c8c; text-align: right; margin-top: 2px; }
.rank-new { background: #ff4d4f !important; color: #fff !important; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }

.dash-filter__sync { font-size: 11px; color: #8c8c8c; margin-left: 12px; font-weight: 400; background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }

.acc-kpi-yd { font-size: 10px; color: #8c8c8c; margin-top: 4px; }
.acc-chart-title { font-size: 12px; font-weight: 600; color: #333; margin: 16px 0 8px; padding-left: 8px; border-left: 3px solid #1677FF; }
.account-item { cursor: pointer; transition: background 0.15s; }
.account-item:hover { background: var(--bg-secondary); }

/* 账户分析弹窗 - 移动端从下方弹出 */
@media (max-width: 768px) {
  .acc-panel {
    position: fixed !important;
    top: auto !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 85vh !important;
    max-height: 85vh !important;
    border-radius: 16px 16px 0 0 !important;
    animation: slideUpAcc 0.3s ease-out !important;
  }
  .acc-panel .analysis-panel__body {
    max-height: calc(85vh - 60px) !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  .acc-panel .analysis-panel__header {
    border-radius: 16px 16px 0 0;
    position: relative;
  }
  .acc-panel .analysis-panel__header::before {
    content: ;
    display: block;
    width: 36px;
    height: 4px;
    background: #d9d9d9;
    border-radius: 2px;
    margin: 0 auto 8px;
  }
}
@keyframes slideUpAcc {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
</style>
