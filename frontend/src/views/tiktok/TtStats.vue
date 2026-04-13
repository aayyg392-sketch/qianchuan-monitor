<template>
  <div class="tt-page">
    <div class="tt-page__header">
      <h2 class="tt-page__title">素材消耗</h2>
      <div class="tt-page__actions">
        <a-range-picker v-model:value="dateRange" :presets="presets" size="small" style="max-width:240px" @change="loadData" />
        <a-button size="small" @click="doSync" :loading="syncing">同步数据</a-button>
      </div>
    </div>

    <!-- KPI -->
    <div class="tt-kpi-grid">
      <div class="tt-kpi-card">
        <div class="tt-kpi-card__label">总消耗</div>
        <div class="tt-kpi-card__value">${{ fmtNum(overview.current?.total_spend) }}</div>
      </div>
      <div class="tt-kpi-card">
        <div class="tt-kpi-card__label">总转化</div>
        <div class="tt-kpi-card__value">{{ fmtNum(overview.current?.total_conversions) }}</div>
      </div>
      <div class="tt-kpi-card">
        <div class="tt-kpi-card__label">平均CPA</div>
        <div class="tt-kpi-card__value">${{ fmtNum(overview.current?.avg_cpa, 2) }}</div>
      </div>
      <div class="tt-kpi-card">
        <div class="tt-kpi-card__label">平均ROAS</div>
        <div class="tt-kpi-card__value">{{ fmtNum(overview.current?.avg_roas, 2) }}</div>
      </div>
    </div>

    <!-- 排序和筛选 -->
    <div class="tt-filter-bar">
      <a-select v-model:value="sortField" size="small" style="width:100px" @change="loadMaterials">
        <a-select-option value="spend">按消耗</a-select-option>
        <a-select-option value="conversions">按转化</a-select-option>
        <a-select-option value="roas">按ROAS</a-select-option>
        <a-select-option value="cpa">按CPA</a-select-option>
        <a-select-option value="ctr">按CTR</a-select-option>
      </a-select>
      <a-select v-model:value="sortOrder" size="small" style="width:70px" @change="loadMaterials">
        <a-select-option value="DESC">降序</a-select-option>
        <a-select-option value="ASC">升序</a-select-option>
      </a-select>
    </div>

    <!-- 素材消耗列表 -->
    <div class="tt-card">
      <div class="tt-stats-list">
        <div class="tt-stats-item" v-for="(item, i) in matList" :key="item.id" @click="$router.push('/tt-materials/' + item.id)">
          <div class="tt-stats-item__rank">{{ i + 1 }}</div>
          <div class="tt-stats-item__info">
            <div class="tt-stats-item__title">{{ item.title || '未命名' }}</div>
            <div class="tt-stats-item__tags">
              <span v-if="item.market" class="tt-tag tt-tag--market">{{ item.market }}</span>
            </div>
          </div>
          <div class="tt-stats-item__metrics">
            <div class="tt-stats-metric">
              <span class="tt-stats-metric__value">${{ fmtNum(item.spend) }}</span>
              <span class="tt-stats-metric__label">消耗</span>
            </div>
            <div class="tt-stats-metric">
              <span class="tt-stats-metric__value">{{ item.conversions || 0 }}</span>
              <span class="tt-stats-metric__label">转化</span>
            </div>
            <div class="tt-stats-metric">
              <span class="tt-stats-metric__value">{{ fmtNum(item.roas, 2) }}</span>
              <span class="tt-stats-metric__label">ROAS</span>
            </div>
          </div>
        </div>
        <a-empty v-if="!matList.length && !loading" description="暂无消耗数据" />
      </div>
    </div>

    <!-- 市场维度 -->
    <div class="tt-card" style="margin-top:12px">
      <div class="tt-card__header"><span class="tt-card__title">市场维度</span></div>
      <div class="tt-market-list">
        <div class="tt-market-item" v-for="m in marketData" :key="m.market">
          <div class="tt-market-item__name">{{ m.market }}</div>
          <div class="tt-market-item__bar-wrap">
            <div class="tt-market-item__bar" :style="{ width: marketBarWidth(m.spend) + '%' }"></div>
          </div>
          <div class="tt-market-item__stats">
            <span>${{ fmtNum(m.spend) }}</span>
            <span>{{ m.material_count }}个素材</span>
          </div>
        </div>
        <a-empty v-if="!marketData.length" description="暂无数据" :image="null" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../../utils/request'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'

const loading = ref(false)
const syncing = ref(false)
const overview = ref({})
const matList = ref([])
const marketData = ref([])
const sortField = ref('spend')
const sortOrder = ref('DESC')

const dateRange = ref([dayjs().subtract(7, 'day'), dayjs()])
const presets = [
  { label: '近7天', value: [dayjs().subtract(7, 'day'), dayjs()] },
  { label: '近14天', value: [dayjs().subtract(14, 'day'), dayjs()] },
  { label: '近30天', value: [dayjs().subtract(30, 'day'), dayjs()] },
]

function fmtNum(n, d = 0) { return n ? Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '0' }
function marketBarWidth(spend) {
  const max = Math.max(...marketData.value.map(m => Number(m.spend) || 0), 1)
  return ((Number(spend) || 0) / max * 100).toFixed(0)
}

function getDateParams() {
  return { start_date: dateRange.value[0]?.format('YYYY-MM-DD'), end_date: dateRange.value[1]?.format('YYYY-MM-DD') }
}

async function loadData() {
  loading.value = true
  const dp = getDateParams()
  try {
    const [ovRes, mRes, mkRes] = await Promise.all([
      request.get('/tt-stats/overview', { params: dp }),
      request.get('/tt-stats/materials', { params: { ...dp, sort: sortField.value, order: sortOrder.value, pageSize: 50 } }),
      request.get('/tt-stats/market', { params: dp }),
    ])
    overview.value = ovRes.data || {}
    matList.value = mRes.data?.list || []
    marketData.value = mkRes.data || []
  } catch (e) { console.error(e) }
  loading.value = false
}

async function loadMaterials() {
  const dp = getDateParams()
  try {
    const res = await request.get('/tt-stats/materials', { params: { ...dp, sort: sortField.value, order: sortOrder.value, pageSize: 50 } })
    matList.value = res.data?.list || []
  } catch (e) { console.error(e) }
}

async function doSync() {
  syncing.value = true
  try {
    const res = await request.post('/tt-stats/sync')
    message.success(res.msg || '同步中')
  } catch (e) { message.error('同步失败') }
  syncing.value = false
}

onMounted(loadData)
</script>

<style scoped>
.tt-page { padding: 12px; max-width: 1200px; margin: 0 auto; }
.tt-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.tt-page__title { font-size: 18px; font-weight: 600; color: #1f2329; margin: 0; }
.tt-page__actions { display: flex; gap: 8px; align-items: center; }
.tt-filter-bar { display: flex; gap: 8px; margin-bottom: 12px; }

.tt-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
@media (min-width: 768px) { .tt-kpi-grid { grid-template-columns: repeat(4, 1fr); gap: 12px; } }
.tt-kpi-card { background: #fff; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-kpi-card__label { font-size: 12px; color: #8f959e; margin-bottom: 4px; }
.tt-kpi-card__value { font-size: 22px; font-weight: 700; color: #1f2329; }

.tt-card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-card__title { font-size: 15px; font-weight: 600; color: #1f2329; }

.tt-stats-list { }
.tt-stats-item { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #f5f5f5; cursor: pointer; }
.tt-stats-item:last-child { border-bottom: none; }
.tt-stats-item:active { background: #f7f8fa; }
.tt-stats-item__rank { width: 24px; font-size: 14px; font-weight: 600; color: #8f959e; text-align: center; flex-shrink: 0; }
.tt-stats-item__info { flex: 1; min-width: 0; margin: 0 10px; }
.tt-stats-item__title { font-size: 14px; color: #1f2329; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-stats-item__tags { margin-top: 2px; }
.tt-stats-item__metrics { display: flex; gap: 12px; flex-shrink: 0; }
.tt-stats-metric { text-align: right; }
.tt-stats-metric__value { display: block; font-size: 13px; font-weight: 600; color: #1f2329; }
.tt-stats-metric__label { display: block; font-size: 10px; color: #c0c4cc; }

.tt-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.tt-tag--market { background: #e6f7ff; color: #1890ff; }

.tt-market-list { }
.tt-market-item { display: flex; align-items: center; padding: 8px 0; gap: 10px; }
.tt-market-item__name { width: 50px; font-size: 13px; font-weight: 500; color: #1f2329; flex-shrink: 0; }
.tt-market-item__bar-wrap { flex: 1; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
.tt-market-item__bar { height: 100%; background: linear-gradient(90deg, #1677ff, #69b1ff); border-radius: 4px; transition: width .3s; }
.tt-market-item__stats { font-size: 11px; color: #8f959e; display: flex; gap: 8px; flex-shrink: 0; }
</style>
