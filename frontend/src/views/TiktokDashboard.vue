<template>
  <div class="page">
    <div class="header-bar">
      <h3 style="margin:0">TikTok 账户管理</h3>
      <div>
        <button class="sync-btn" @click="syncData" :disabled="syncing">
          {{ syncing ? '同步中...' : '同步数据' }}
        </button>
      </div>
    </div>

    <!-- 概览卡片 -->
    <div v-if="overview" class="cards">
      <div class="card">
        <div class="card-label">今日消耗</div>
        <div class="card-val blue">{{ currency(overview.today_cost) }}</div>
      </div>
      <div class="card">
        <div class="card-label">今日展示</div>
        <div class="card-val">{{ numFmt(overview.today_show) }}</div>
      </div>
      <div class="card">
        <div class="card-label">今日点击</div>
        <div class="card-val green">{{ numFmt(overview.today_click) }}</div>
      </div>
      <div class="card">
        <div class="card-label">今日转化</div>
        <div class="card-val orange">{{ numFmt(overview.today_convert) }}</div>
      </div>
      <div class="card">
        <div class="card-label">CTR</div>
        <div class="card-val">{{ overview.today_ctr }}%</div>
      </div>
      <div class="card">
        <div class="card-label">CPA</div>
        <div class="card-val">{{ currency(overview.today_cpa) }}</div>
      </div>
    </div>

    <!-- 账户列表 -->
    <div class="table-wrap">
      <div v-if="loading" class="loading">加载中...</div>
      <table v-else-if="accounts.length">
        <thead>
          <tr>
            <th class="col-name">账户信息</th>
            <th>消耗</th>
            <th>展示</th>
            <th>点击</th>
            <th>转化</th>
            <th>CTR</th>
            <th>CPA</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="acc in accounts" :key="acc.advertiser_id">
            <td class="col-name">
              <div class="acc-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
              <div class="acc-id">ID: {{ acc.advertiser_id }}</div>
            </td>
            <td class="blue">{{ currency(acc.today_cost) }}</td>
            <td>{{ numFmt(acc.today_show) }}</td>
            <td class="green">{{ numFmt(acc.today_click) }}</td>
            <td class="orange">{{ numFmt(acc.today_convert) }}</td>
            <td>{{ acc.today_ctr }}%</td>
            <td>{{ currency(acc.today_cpa) }}</td>
            <td>
              <span class="badge" :class="acc.status === 1 ? 'on' : 'off'">
                {{ acc.status === 1 ? '正常' : '停用' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂无TikTok广告账户，请先在系统设置中配置TikTok API并完成授权</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const loading = ref(false)
const syncing = ref(false)
const accounts = ref([])
const overview = ref(null)

async function loadData() {
  loading.value = true
  try {
    const res = await request.get('/tiktok-dash/overview')
    if (res?.data) {
      accounts.value = res.data.list || []
      overview.value = res.data.summary || null
    }
  } catch (e) { /* ignore */ }
  finally { loading.value = false }
}

async function syncData() {
  syncing.value = true
  try {
    await request.post('/tiktok-dash/sync')
    await loadData()
  } catch (e) { /* ignore */ }
  finally { syncing.value = false }
}

function currency(v) {
  const n = Number(v) || 0
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function numFmt(v) {
  const n = Number(v) || 0
  return n.toLocaleString()
}

onMounted(loadData)
</script>

<style scoped>
.page { padding: 0; }
.header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sync-btn { padding: 6px 16px; background: #1890ff; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.sync-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
.card { background: #fff; border-radius: 10px; padding: 16px; }
.card-label { font-size: 12px; color: #8c8c8c; margin-bottom: 6px; }
.card-val { font-size: 20px; font-weight: 600; }
.blue { color: #1890ff; }
.green { color: #52c41a; }
.orange { color: #fa8c16; }
.table-wrap { background: #fff; border-radius: 10px; overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
th { background: #fafafa; padding: 10px 12px; text-align: left; font-size: 13px; color: #666; font-weight: 500; }
td { padding: 12px; border-top: 1px solid #f0f0f0; font-size: 13px; }
.col-name { min-width: 180px; }
.acc-name { font-weight: 500; }
.acc-id { font-size: 11px; color: #999; margin-top: 2px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.badge.on { background: #f6ffed; color: #52c41a; }
.badge.off { background: #fff1f0; color: #ff4d4f; }
.loading, .empty { padding: 60px; text-align: center; color: #999; }
</style>
