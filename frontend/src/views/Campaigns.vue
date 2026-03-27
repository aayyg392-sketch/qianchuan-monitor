<template>
  <div class="cp-page">
    <!-- ===== 数据概览 ===== -->
    <div class="cp-overview">
      <div class="cp-overview__header">
        <h3 class="cp-overview__title">数据概览</h3>
      </div>
      <div class="cp-overview__grid">
        <div class="cp-card" v-for="card in overviewCards" :key="card.key">
          <div class="cp-card__top">
            <span class="cp-card__label">{{ card.label }}</span>
            <svg v-if="card.trend && card.trend.length > 1" class="cp-card__spark" viewBox="0 0 80 28" preserveAspectRatio="none">
              <polyline :points="sparkPoints(card.trend)" fill="none" :stroke="card.change >= 0 ? '#00B96B' : '#FF4D4F'" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="cp-card__value">
            <span>{{ card.prefix || '' }}{{ formatCardValue(card) }}</span>
            <span v-if="card.suffix">{{ card.suffix }}</span>
          </div>
          <div class="cp-card__change" :class="card.change >= 0 ? 'up' : 'down'">
            {{ card.change >= 0 ? '+' : '' }}{{ card.change.toFixed(2) }}%
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 视图A：账户列表 ===== -->
    <template v-if="currentView === 'accounts'">
      <div class="cp-toolbar">
        <div class="cp-tabs">
          <span class="cp-section-title">账户列表</span>
        </div>
      </div>

      <div class="cp-table-wrap" v-if="!loading && accountList.length > 0">
        <div class="cp-table-scroll">
          <table class="cp-table">
            <thead>
              <tr>
                <th class="col-name sticky-col">账户信息</th>
                <th class="col-num">计划数</th>
                <th class="col-num">整体消耗</th>
                <th class="col-num">整体成交订单数</th>
                <th class="col-num">整体成交金额</th>
                <th class="col-num">整体支付ROI</th>
                <th class="col-num">成交订单成本</th>
                <th class="col-num">平台补贴金额</th>
                <th class="col-num">净成交ROI</th>
                <th class="col-num">净成交金额</th>
                <th class="col-num">结算率</th>
                <th class="col-action">操作</th>
              </tr>
            </thead>
            <tbody>
              <!-- 汇总行 -->
              <tr class="summary-row" v-if="accountSummary">
                <td class="sticky-col">
                  <span class="summary-label">共{{ accountList.length }}个账户</span>
                </td>
                <td class="col-num">{{ accountSummary.plan_count }}<br><small class="yest-compare" :class="cmpCls(accountSummary.plan_count, accountSummary.yest_plan_count)">{{ cmpText(accountSummary.plan_count, accountSummary.yest_plan_count) }}</small></td>
                <td class="col-num primary-val">¥{{ fmtNum(accountSummary.cost) }}<br><small class="yest-compare" :class="cmpCls(accountSummary.cost, accountSummary.yest_cost)">{{ cmpText(accountSummary.cost, accountSummary.yest_cost) }}</small></td>
                <td class="col-num">{{ accountSummary.orders }}<br><small class="yest-compare" :class="cmpCls(accountSummary.orders, accountSummary.yest_orders)">{{ cmpText(accountSummary.orders, accountSummary.yest_orders) }}</small></td>
                <td class="col-num success-val">¥{{ fmtNum(accountSummary.gmv) }}<br><small class="yest-compare" :class="cmpCls(accountSummary.gmv, accountSummary.yest_gmv)">{{ cmpText(accountSummary.gmv, accountSummary.yest_gmv) }}</small></td>
                <td class="col-num" :class="roiClass(accountSummary.cost > 0 ? accountSummary.gmv / accountSummary.cost : 0)">
                  {{ accountSummary.cost > 0 ? (accountSummary.gmv / accountSummary.cost).toFixed(2) : '0.00' }}<br><small class="yest-compare" :class="cmpCls(accountSummary.cost > 0 ? accountSummary.gmv/accountSummary.cost : 0, accountSummary.yest_cost > 0 ? accountSummary.yest_gmv/accountSummary.yest_cost : 0)">{{ cmpText(accountSummary.cost > 0 ? accountSummary.gmv/accountSummary.cost : 0, accountSummary.yest_cost > 0 ? accountSummary.yest_gmv/accountSummary.yest_cost : 0) }}</small>
                </td>
                <td class="col-num">{{ accountSummary.orders > 0 ? '¥' + fmtNum(accountSummary.cost / accountSummary.orders) : '-' }}</td>
                <td class="col-num">¥{{ fmtNum(accountSummary.gmv - accountSummary.gmv_no_coupon) }}</td>
                <td class="col-num" :class="roiClass(accountSummary.cost > 0 ? accountSummary.gmv_no_coupon / accountSummary.cost : 0)">
                  {{ accountSummary.cost > 0 ? (accountSummary.gmv_no_coupon / accountSummary.cost).toFixed(2) : '0.00' }}<br><small class="yest-compare" :class="cmpCls(accountSummary.cost > 0 ? accountSummary.gmv_no_coupon/accountSummary.cost : 0, accountSummary.yest_cost > 0 ? accountSummary.yest_gmv_no_coupon/accountSummary.yest_cost : 0)">{{ cmpText(accountSummary.cost > 0 ? accountSummary.gmv_no_coupon/accountSummary.cost : 0, accountSummary.yest_cost > 0 ? accountSummary.yest_gmv_no_coupon/accountSummary.yest_cost : 0) }}</small>
                </td>
                <td class="col-num">¥{{ fmtNum(accountSummary.gmv_no_coupon) }}<br><small class="yest-compare" :class="cmpCls(accountSummary.gmv_no_coupon, accountSummary.yest_gmv_no_coupon)">{{ cmpText(accountSummary.gmv_no_coupon, accountSummary.yest_gmv_no_coupon) }}</small></td>
                <td class="col-num">{{ accountSummary.gmv > 0 ? (accountSummary.gmv_no_coupon / accountSummary.gmv * 100).toFixed(2) + '%' : '-' }}</td>
                <td class="col-action"></td>
              </tr>
              <!-- 账户行 -->
              <tr v-for="acc in accountList" :key="acc.advertiser_id"
                  class="account-row" @dblclick="drillDown(acc)">
                <td class="sticky-col">
                  <div class="campaign-info">
                    <div class="campaign-name" :title="acc.advertiser_name">
                      {{ acc.advertiser_name }}
                    </div>
                    <div class="campaign-meta">
                      <span class="campaign-id">ID: {{ acc.advertiser_id }}</span>
                    </div>
                  </div>
                </td>
                <td class="col-num">{{ acc.plan_count }}<br><small class="yest-compare" :class="cmpCls(acc.plan_count, acc.yest_plan_count)">{{ cmpText(acc.plan_count, acc.yest_plan_count) }}</small></td>
                <td class="col-num primary-val">¥{{ fmtNum(acc.cost) }}<br><small class="yest-compare" :class="cmpCls(acc.cost, acc.yest_cost)">{{ cmpText(acc.cost, acc.yest_cost) }}</small></td>
                <td class="col-num">{{ acc.orders || 0 }}<br><small class="yest-compare" :class="cmpCls(acc.orders, acc.yest_orders)">{{ cmpText(acc.orders, acc.yest_orders) }}</small></td>
                <td class="col-num success-val">¥{{ fmtNum(acc.gmv) }}<br><small class="yest-compare" :class="cmpCls(acc.gmv, acc.yest_gmv)">{{ cmpText(acc.gmv, acc.yest_gmv) }}</small></td>
                <td class="col-num" :class="roiClass(acc.cost > 0 ? acc.gmv / acc.cost : 0)">
                  {{ acc.cost > 0 ? (parseFloat(acc.gmv) / parseFloat(acc.cost)).toFixed(2) : '0.00' }}<br><small class="yest-compare" :class="cmpCls(acc.cost > 0 ? acc.gmv/acc.cost : 0, acc.yest_cost > 0 ? acc.yest_gmv/acc.yest_cost : 0)">{{ cmpText(acc.cost > 0 ? acc.gmv/acc.cost : 0, acc.yest_cost > 0 ? acc.yest_gmv/acc.yest_cost : 0) }}</small>
                </td>
                <td class="col-num">{{ acc.orders > 0 ? '¥' + fmtNum(acc.cost / acc.orders) : '-' }}</td>
                <td class="col-num">¥{{ fmtNum(parseFloat(acc.gmv || 0) - parseFloat(acc.gmv_no_coupon || 0)) }}</td>
                <td class="col-num" :class="roiClass(acc.cost > 0 ? acc.gmv_no_coupon / acc.cost : 0)">
                  {{ acc.cost > 0 ? (parseFloat(acc.gmv_no_coupon || 0) / parseFloat(acc.cost)).toFixed(2) : '0.00' }}<br><small class="yest-compare" :class="cmpCls(acc.cost > 0 ? acc.gmv_no_coupon/acc.cost : 0, acc.yest_cost > 0 ? acc.yest_gmv_no_coupon/acc.yest_cost : 0)">{{ cmpText(acc.cost > 0 ? acc.gmv_no_coupon/acc.cost : 0, acc.yest_cost > 0 ? acc.yest_gmv_no_coupon/acc.yest_cost : 0) }}</small>
                </td>
                <td class="col-num">¥{{ fmtNum(acc.gmv_no_coupon) }}<br><small class="yest-compare" :class="cmpCls(acc.gmv_no_coupon, acc.yest_gmv_no_coupon)">{{ cmpText(acc.gmv_no_coupon, acc.yest_gmv_no_coupon) }}</small></td>
                <td class="col-num">{{ parseFloat(acc.gmv) > 0 ? (parseFloat(acc.gmv_no_coupon || 0) / parseFloat(acc.gmv) * 100).toFixed(2) + '%' : '-' }}</td>
                <td class="col-action" @click.stop>
                  <div class="action-btns">
                    <button class="push-btn" @click="handlePush(acc)" :disabled="pushingId === acc.advertiser_id">
                      {{ pushingId === acc.advertiser_id ? '推送中...' : '推送' }}
                    </button>
                    <button class="config-btn" @click="openConfig(acc)" title="推送设置">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="cp-hint">双击账户行查看该账户下的计划列表</div>
      </div>

      <div class="cp-empty" v-if="!loading && accountList.length === 0">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
        <p>暂无账户数据</p>
      </div>
      <div class="cp-loading" v-if="loading"><a-spin size="large" /></div>
    </template>

    <!-- ===== 视图B：账户子计划列表 ===== -->
    <template v-if="currentView === 'campaigns'">
      <!-- 面包屑 -->
      <div class="cp-breadcrumb">
        <button class="cp-back-btn" @click="goBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          返回账户列表
        </button>
        <span class="cp-breadcrumb-sep">/</span>
        <span class="cp-breadcrumb-current">{{ selectedAccount?.advertiser_name }}</span>
        <span class="cp-breadcrumb-id">ID: {{ selectedAccount?.advertiser_id }}</span>
      </div>

      <!-- 筛选工具栏 -->
      <div class="cp-toolbar">
        <div class="cp-tabs">
          <button class="cp-tab" :class="{ active: activeTab === '' }" @click="activeTab=''; loadCampaigns()">全部</button>
          <button class="cp-tab" :class="{ active: activeTab === 'product' }" @click="activeTab='product'; loadCampaigns()">商品推广</button>
          <button class="cp-tab" :class="{ active: activeTab === 'live' }" @click="activeTab='live'; loadCampaigns()">直播推广</button>
        </div>
        <div class="cp-filters">
          <div class="cp-search">
            <svg class="cp-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="keyword" class="cp-search__input" placeholder="搜索计划名称、ID" @keyup.enter="loadCampaigns" />
          </div>
          <button class="cp-filter-btn" @click="loadCampaigns">搜索</button>
        </div>
      </div>

      <!-- 计划表格 -->
      <div class="cp-table-wrap" v-if="!loadingCampaigns && campaigns.length > 0">
        <div class="cp-table-scroll">
          <table class="cp-table">
            <thead>
              <tr>
                <th class="col-name sticky-col">计划信息</th>
                <th class="col-num sortable" @click="toggleSort('cost')">
                  整体消耗
                  <span class="sort-arrow" :class="{ active: sortBy.startsWith('cost') }">{{ sortBy === 'cost_asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="col-num sortable" @click="toggleSort('gmv')">
                  成交金额
                  <span class="sort-arrow" :class="{ active: sortBy.startsWith('gmv') }">{{ sortBy === 'gmv_asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="col-num sortable" @click="toggleSort('orders')">
                  成交订单数
                  <span class="sort-arrow" :class="{ active: sortBy.startsWith('orders') }">{{ sortBy === 'orders_asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="col-num sortable" @click="toggleSort('roi')">
                  ROI
                  <span class="sort-arrow" :class="{ active: sortBy.startsWith('roi') }">{{ sortBy === 'roi_asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="col-num">转化成本</th>
                <th class="col-num sortable" @click="toggleSort('ctr')">
                  点击率
                  <span class="sort-arrow" :class="{ active: sortBy.startsWith('ctr') }">{{ sortBy === 'ctr_asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="col-num">展示量</th>
                <th class="col-num">点击量</th>
              </tr>
            </thead>
            <tbody>
              <!-- 汇总行 -->
              <tr class="summary-row" v-if="campaignSummary">
                <td class="sticky-col">
                  <span class="summary-label">共{{ campaignTotal }}条计划</span>
                </td>
                <td class="col-num primary-val">¥{{ fmtNum(campaignSummary.cost) }}</td>
                <td class="col-num success-val">¥{{ fmtNum(campaignSummary.gmv) }}</td>
                <td class="col-num">{{ campaignSummary.orders }}</td>
                <td class="col-num" :class="roiClass(campaignSummary.cost > 0 ? campaignSummary.gmv / campaignSummary.cost : 0)">
                  {{ campaignSummary.cost > 0 ? (campaignSummary.gmv / campaignSummary.cost).toFixed(2) : '0.00' }}
                </td>
                <td class="col-num">-</td>
                <td class="col-num">{{ campaignSummary.shows > 0 ? (campaignSummary.clicks / campaignSummary.shows * 100).toFixed(2) + '%' : '-' }}</td>
                <td class="col-num">{{ fmtInt(campaignSummary.shows) }}</td>
                <td class="col-num">{{ fmtInt(campaignSummary.clicks) }}</td>
              </tr>
              <!-- 数据行 -->
              <tr v-for="item in campaigns" :key="item.campaign_id">
                <td class="sticky-col">
                  <div class="campaign-info">
                    <div class="campaign-name" :title="item.campaign_name || item.campaign_id">
                      {{ item.campaign_name || item.campaign_id }}
                    </div>
                    <div class="campaign-meta">
                      <span class="campaign-id">ID: {{ item.campaign_id }}</span>
                    </div>
                  </div>
                </td>
                <td class="col-num primary-val">¥{{ fmtNum(item.stat_cost) }}</td>
                <td class="col-num success-val">¥{{ fmtNum(item.gmv) }}</td>
                <td class="col-num">{{ item.orders || 0 }}</td>
                <td class="col-num" :class="roiClass(item.roi)">{{ fmtRoi(item.roi) }}</td>
                <td class="col-num">{{ item.cpo > 0 ? '¥' + fmtNum(item.cpo) : '-' }}</td>
                <td class="col-num">{{ item.ctr > 0 ? (parseFloat(item.ctr) * 100).toFixed(2) + '%' : '-' }}</td>
                <td class="col-num">{{ fmtInt(item.show_cnt) }}</td>
                <td class="col-num">{{ fmtInt(item.click_cnt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div class="cp-pagination" v-if="campaignTotal > pageSize">
          <button class="cp-page-btn" :disabled="page <= 1" @click="page--; loadCampaigns()">上一页</button>
          <span class="cp-page-info">{{ page }} / {{ Math.ceil(campaignTotal / pageSize) }}</span>
          <button class="cp-page-btn" :disabled="page >= Math.ceil(campaignTotal / pageSize)" @click="page++; loadCampaigns()">下一页</button>
        </div>
      </div>

      <div class="cp-empty" v-if="!loadingCampaigns && campaigns.length === 0">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
        <p>该账户暂无广告计划数据</p>
      </div>
      <div class="cp-loading" v-if="loadingCampaigns"><a-spin size="large" /></div>
    </template>

    <!-- ===== 推送配置弹窗 ===== -->
    <div class="modal-overlay" v-if="showConfigModal" @click="showConfigModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>推送配置 - {{ configAccount?.advertiser_name }}</h3>
          <button class="modal-close" @click="showConfigModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>钉钉 Webhook URL</label>
            <input v-model="configForm.webhook_url" class="form-input" placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
          </div>
          <div class="form-group">
            <label>推送字段</label>
            <div class="field-switches">
              <label class="switch-item" v-for="f in fieldOptions" :key="f.key">
                <input type="checkbox" v-model="configForm.push_fields[f.key]" />
                <span class="switch-label">{{ f.label }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel" @click="showConfigModal = false">取消</button>
          <button class="modal-btn save" @click="saveConfig" :disabled="savingConfig">
            {{ savingConfig ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'

// 公共状态
const loading = ref(false)
const overviewCards = ref([])
const currentView = ref('accounts')

// 账户列表状态
const accountList = ref([])
const accountSummary = ref(null)

// 计划列表状态
const selectedAccount = ref(null)
const campaigns = ref([])
const campaignSummary = ref(null)
const campaignTotal = ref(0)
const loadingCampaigns = ref(false)
const page = ref(1)
const pageSize = ref(50)
const keyword = ref('')
const activeTab = ref('')
const sortBy = ref('cost_desc')

// ===== 工具函数 =====
function sparkPoints(data) {
  if (!data || data.length < 2) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  return data.map((v, i) => {
    const x = (i / (data.length - 1)) * 80
    const y = 26 - ((v - min) / range) * 24
    return `${x},${y}`
  }).join(' ')
}

function formatCardValue(card) {
  const v = card.value
  if (card.suffix === '%') return v.toFixed(2)
  if (v >= 10000) return (v / 10000).toFixed(2) + '万'
  if (typeof v === 'number' && v % 1 !== 0) return v.toFixed(2)
  return v
}

function fmtNum(v) {
  if (!v) return '0.00'
  return parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function fmtInt(v) {
  if (!v) return '0'
  return parseInt(v).toLocaleString()
}
function fmtRoi(v) {
  return v ? parseFloat(v).toFixed(2) : '0.00'
}
function roiClass(v) {
  const n = parseFloat(v)
  if (n >= 3) return 'good-val'
  if (n >= 1) return 'ok-val'
  return 'poor-val'
}

function cmpText(cur, prev) {
  const c = parseFloat(cur || 0), p = parseFloat(prev || 0)
  if (p === 0 && c === 0) return '持平'
  if (p === 0) return '↑新增'
  const pct = ((c - p) / p * 100).toFixed(1)
  return pct > 0 ? `↑${pct}%` : pct < 0 ? `↓${Math.abs(pct)}%` : '持平'
}

function cmpCls(cur, prev) {
  const c = parseFloat(cur || 0), p = parseFloat(prev || 0)
  if (c > p) return 'cmp-up'
  if (c < p) return 'cmp-down'
  return 'cmp-flat'
}

function toggleSort(field) {
  const desc = field + '_desc'
  const asc = field + '_asc'
  sortBy.value = sortBy.value === desc ? asc : desc
  loadCampaigns()
}

// ===== 数据加载 =====
async function loadOverview() {
  try {
    const res = await request.get('/campaigns/overview')
    overviewCards.value = res.data?.cards || []
  } catch { overviewCards.value = [] }
}

async function loadAccounts() {
  loading.value = true
  try {
    const res = await request.get('/campaigns/accounts-list')
    accountList.value = res.data?.list || []
    accountSummary.value = res.data?.summary || null
  } catch {
    accountList.value = []
  } finally {
    loading.value = false
  }
}

async function loadCampaigns() {
  if (!selectedAccount.value) return
  loadingCampaigns.value = true
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
      sort_by: sortBy.value,
      advertiser_id: selectedAccount.value.advertiser_id,
    }
    if (keyword.value) params.keyword = keyword.value
    if (activeTab.value) params.account_type = activeTab.value

    const res = await request.get('/campaigns', { params })
    campaigns.value = res.data?.list || []
    campaignTotal.value = res.data?.total || 0
    campaignSummary.value = res.data?.summary || null
  } catch {
    campaigns.value = []
  } finally {
    loadingCampaigns.value = false
  }
}

// ===== 推送相关 =====
const pushingId = ref(null)
const showConfigModal = ref(false)
const configAccount = ref(null)
const savingConfig = ref(false)
const configForm = reactive({
  webhook_url: '',
  push_fields: { cost: true, gmv: true, orders: true, roi: true, convert_cost: true, plan_count: true, top_plans: true }
})

const fieldOptions = [
  { key: 'cost', label: '整体消耗' },
  { key: 'gmv', label: '成交金额' },
  { key: 'orders', label: '成交订单数' },
  { key: 'roi', label: 'ROI' },
  { key: 'convert_cost', label: '转化成本' },
  { key: 'plan_count', label: '投放计划数' },
  { key: 'top_plans', label: 'TOP5计划' },
]

async function openConfig(acc) {
  configAccount.value = acc
  try {
    const res = await request.get(`/campaigns/push-config/${acc.advertiser_id}`)
    const data = res.data || {}
    configForm.webhook_url = data.webhook_url || ''
    configForm.push_fields = data.push_fields || { cost: true, gmv: true, orders: true, roi: true, convert_cost: true, plan_count: true, top_plans: true }
  } catch {
    configForm.webhook_url = ''
    configForm.push_fields = { cost: true, gmv: true, orders: true, roi: true, convert_cost: true, plan_count: true, top_plans: true }
  }
  showConfigModal.value = true
}

async function saveConfig() {
  if (!configForm.webhook_url) { message.warning('请输入 Webhook URL'); return }
  savingConfig.value = true
  try {
    await request.post(`/campaigns/push-config/${configAccount.value.advertiser_id}`, {
      webhook_url: configForm.webhook_url,
      push_fields: configForm.push_fields
    })
    message.success('配置保存成功')
    showConfigModal.value = false
  } catch { message.error('保存失败') }
  savingConfig.value = false
}

async function handlePush(acc) {
  pushingId.value = acc.advertiser_id
  try {
    const res = await request.post(`/campaigns/push-report/${acc.advertiser_id}`)
    if (res.code === 0) {
      message.success('推送成功')
    } else {
      message.error(res.msg || '推送失败')
    }
  } catch { message.error('推送失败') }
  pushingId.value = null
}

// ===== 视图切换 =====
function drillDown(acc) {
  selectedAccount.value = acc
  currentView.value = 'campaigns'
  page.value = 1
  keyword.value = ''
  activeTab.value = ''
  sortBy.value = 'cost_desc'
  loadCampaigns()
}

function goBack() {
  currentView.value = 'accounts'
  selectedAccount.value = null
  campaigns.value = []
}

onMounted(() => {
  loadOverview()
  loadAccounts()
})
</script>

<style scoped>
.cp-page {
  padding-bottom: calc(var(--tabnav-h) + var(--safe-b) + 16px);
  min-height: 100vh;
  background: var(--bg-page);
}

/* ===== 数据概览 ===== */
.cp-overview {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 16px;
}
.cp-overview__header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.cp-overview__title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.cp-overview__grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }

.cp-card {
  background: #F7F8FA; border-radius: 8px; padding: 12px;
  transition: box-shadow 0.15s;
}
.cp-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.cp-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.cp-card__label { font-size: 12px; color: var(--text-hint); }
.cp-card__spark { width: 60px; height: 22px; }
.cp-card__value {
  font-size: 18px; font-weight: 700; color: var(--text-primary);
  margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cp-card__change { font-size: 12px; font-weight: 500; }
.cp-card__change.up { color: #FF4D4F; }
.cp-card__change.down { color: #00B96B; }

/* ===== 面包屑 ===== */
.cp-breadcrumb {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; background: var(--bg-card);
  border-bottom: 1px solid var(--border);
}
.cp-back-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-card); font-size: 13px; color: var(--c-primary);
  cursor: pointer; transition: all 0.15s;
}
.cp-back-btn:hover { background: var(--c-primary-bg); border-color: var(--c-primary); }
.cp-breadcrumb-sep { color: var(--text-hint); font-size: 13px; }
.cp-breadcrumb-current { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.cp-breadcrumb-id { font-size: 12px; color: var(--text-hint); background: #F5F6F8; padding: 2px 6px; border-radius: 3px; }

/* ===== 工具栏 ===== */
.cp-toolbar {
  background: var(--bg-card); border-bottom: 1px solid var(--border);
  padding: 10px 16px; display: flex; align-items: center;
  justify-content: space-between; flex-wrap: wrap; gap: 10px;
}
.cp-section-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.cp-tabs { display: flex; gap: 4px; align-items: center; }
.cp-tab {
  padding: 6px 16px; border: 1px solid var(--border); background: var(--bg-card);
  border-radius: 6px; font-size: 13px; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.cp-tab:hover { color: var(--c-primary); border-color: var(--c-primary); }
.cp-tab.active { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }

.cp-filters { display: flex; align-items: center; gap: 8px; }
.cp-search {
  display: flex; align-items: center; gap: 6px;
  background: #F5F6F8; border-radius: 6px; padding: 6px 12px;
  border: 1px solid var(--border);
}
.cp-search__icon { flex-shrink: 0; }
.cp-search__input {
  border: none; background: transparent; outline: none;
  font-size: 13px; width: 180px; color: var(--text-primary);
}
.cp-search__input::placeholder { color: var(--text-hint); }
.cp-filter-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 14px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-card); font-size: 13px; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.cp-filter-btn:hover { color: var(--c-primary); border-color: var(--c-primary); }

/* ===== 表格 ===== */
.cp-table-wrap { background: var(--bg-card); margin-top: 8px; }
.cp-table-scroll { overflow-x: auto; }
.cp-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 800px; }
.cp-table th {
  position: sticky; top: 0; background: #FAFAFA; padding: 12px 14px;
  text-align: left; font-weight: 500; color: var(--text-hint);
  border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 13px;
}
.cp-table th.sortable { cursor: pointer; user-select: none; }
.cp-table th.sortable:hover { color: var(--c-primary); }
.sort-arrow { font-size: 11px; margin-left: 2px; opacity: 0.3; }
.sort-arrow.active { opacity: 1; color: var(--c-primary); }

.cp-table td {
  padding: 12px; border-bottom: 1px solid var(--divider); color: var(--text-primary);
}
.col-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.col-name { min-width: 200px; }
.sticky-col { position: sticky; left: 0; background: inherit; z-index: 2; }
tr:hover .sticky-col { background: #F5F7FA; }
.cp-table tbody tr:hover { background: #F5F7FA; }

.account-row { cursor: pointer; }
.account-row:hover { background: #EFF4FF !important; }
.account-row:hover .sticky-col { background: #EFF4FF !important; }

.summary-row { background: #F0F5FF !important; font-weight: 600; }
.summary-row .sticky-col { background: #F0F5FF; }
.summary-label { font-size: 13px; color: var(--text-secondary); }

.campaign-info { display: flex; flex-direction: column; gap: 3px; }
.campaign-name {
  font-weight: 500; color: var(--text-primary);
  max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.campaign-meta { display: flex; gap: 8px; font-size: 11px; color: var(--text-hint); }
.campaign-id { background: #F5F6F8; padding: 1px 5px; border-radius: 3px; }

.primary-val { color: var(--c-primary) !important; font-weight: 600; }
.success-val { color: var(--c-success) !important; }
.yest-compare { font-size: 11px; font-weight: 500; white-space: nowrap; }
.cmp-up { color: var(--c-success); }
.cmp-down { color: var(--c-danger); }
.cmp-flat { color: var(--text-hint); }
.good-val { color: var(--c-success) !important; font-weight: 600; }
.ok-val { color: #FA8C16 !important; }
.poor-val { color: var(--c-danger) !important; }

.cp-hint {
  padding: 10px 16px; font-size: 12px; color: var(--text-hint);
  text-align: center; border-top: 1px solid var(--divider);
}

/* ===== 分页 ===== */
.cp-pagination {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; padding: 14px 16px; border-top: 1px solid var(--divider);
}
.cp-page-btn {
  padding: 6px 16px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-card); font-size: 13px; color: var(--text-secondary); cursor: pointer;
}
.cp-page-btn:hover:not(:disabled) { color: var(--c-primary); border-color: var(--c-primary); }
.cp-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cp-page-info { font-size: 13px; color: var(--text-hint); }

/* ===== 空 / 加载 ===== */
.cp-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; color: var(--text-hint); gap: 12px; }
.cp-loading { display: flex; justify-content: center; padding: 60px 20px; }

/* ===== 操作列 ===== */
.col-action { text-align: center; white-space: nowrap; min-width: 120px; }
.action-btns { display: flex; align-items: center; justify-content: center; gap: 6px; }
.push-btn {
  padding: 4px 12px; border: 1px solid var(--c-primary); border-radius: 4px;
  background: var(--c-primary-bg); color: var(--c-primary); font-size: 12px;
  cursor: pointer; transition: all 0.15s; font-weight: 500;
}
.push-btn:hover:not(:disabled) { background: var(--c-primary); color: #fff; }
.push-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.config-btn {
  width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 4px;
  background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text-hint); transition: all 0.15s;
}
.config-btn:hover { color: var(--c-primary); border-color: var(--c-primary); }

/* ===== 弹窗 ===== */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: #fff; border-radius: 12px; width: 480px; max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
}
.modal-header h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; }
.modal-close {
  width: 28px; height: 28px; border: none; background: none; font-size: 20px;
  color: var(--text-hint); cursor: pointer; border-radius: 4px;
}
.modal-close:hover { background: #F5F5F5; color: var(--text-primary); }
.modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.form-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;
  font-size: 13px; color: var(--text-primary); outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: var(--c-primary); box-shadow: 0 0 0 2px rgba(22,119,255,0.1); }
.field-switches { display: flex; flex-wrap: wrap; gap: 10px; }
.switch-item {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px;
  font-size: 13px; color: var(--text-secondary); transition: all 0.15s;
}
.switch-item:has(input:checked) { border-color: var(--c-primary); background: var(--c-primary-bg); color: var(--c-primary); }
.switch-item input { accent-color: var(--c-primary); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--border);
}
.modal-btn {
  padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;
}
.modal-btn.cancel { border: 1px solid var(--border); background: #fff; color: var(--text-secondary); }
.modal-btn.save { border: none; background: var(--c-primary); color: #fff; }
.modal-btn.save:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-btn.save:hover:not(:disabled) { opacity: 0.9; }

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .cp-overview__grid { grid-template-columns: repeat(2, 1fr); }
  .cp-card__value { font-size: 15px; }
  .cp-toolbar { flex-direction: column; align-items: stretch; }
  .cp-tabs { overflow-x: auto; }
  .cp-search__input { width: 120px; }
  .cp-breadcrumb { flex-wrap: wrap; }
}
@media (min-width: 768px) {
  .cp-page { padding-bottom: 24px; }
}
</style>
