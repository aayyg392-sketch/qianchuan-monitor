<template>
<div class="ap">
  <h2>ADQ自动建计划</h2>

  <!-- 账户选择 -->
  <div class="ap-bar">
    <label>选择账户：</label>
    <select v-model="selectedAccount" @change="onAccountChange">
      <option value="">请选择账户</option>
      <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.account_name || a.account_id }}</option>
    </select>
  </div>

  <div v-if="selectedAccount" class="ap-body">
    <!-- 自动建计划配置 -->
    <div class="ap-section">
      <div class="ap-section-hd">
        <h3>自动建计划配置</h3>
        <div class="ap-switch-wrap">
          <label class="ap-switch" :class="{ on: config.enabled }">
            <input type="checkbox" v-model="config.enabled" />
            <span class="ap-switch-slider"></span>
          </label>
          <span>{{ config.enabled ? '已开启' : '已关闭' }}</span>
        </div>
      </div>
      <div class="ap-form">
        <div class="ap-form-row">
          <div class="ap-field">
            <label>最低ROI</label>
            <input type="number" v-model.number="config.min_roi" step="0.1" min="0" />
          </div>
          <div class="ap-field">
            <label>最低转化率</label>
            <input type="number" v-model.number="config.min_cvr" step="0.01" min="0" />
          </div>
          <div class="ap-field">
            <label>回溯天数</label>
            <input type="number" v-model.number="config.lookback_days" min="1" max="30" />
          </div>
          <div class="ap-field">
            <label>每次最大建计划数</label>
            <input type="number" v-model.number="config.max_plans_per_run" min="1" max="50" />
          </div>
        </div>
        <div class="ap-form-row">
          <div class="ap-field">
            <label>日预算(分)</label>
            <input type="number" v-model.number="config.daily_budget" min="5000" step="1000" />
            <span class="ap-hint">{{ (config.daily_budget / 100).toFixed(0) }}元</span>
          </div>
          <div class="ap-field">
            <label>出价(分)</label>
            <input type="number" v-model.number="config.bid_amount" min="100" step="100" />
            <span class="ap-hint">{{ (config.bid_amount / 100).toFixed(2) }}元</span>
          </div>
          <div class="ap-field">
            <label>营销目标</label>
            <select v-model="config.marketing_goal">
              <option value="MARKETING_GOAL_PRODUCT_SALES">商品销售</option>
              <option value="MARKETING_GOAL_LEAD_GENERATION">线索收集</option>
              <option value="MARKETING_GOAL_BRAND_AWARENESS">品牌认知</option>
            </select>
          </div>
          <div class="ap-field">
            <label>优化目标</label>
            <select v-model="config.optimization_goal">
              <option value="OPTIMIZATIONGOAL_ECOMMERCE_ORDER">电商下单</option>
              <option value="OPTIMIZATIONGOAL_ECOMMERCE_CART">加购</option>
              <option value="OPTIMIZATIONGOAL_APP_ACTIVATE">应用激活</option>
            </select>
          </div>
        </div>
        <div class="ap-form-row">
          <div class="ap-field wide">
            <label>执行时间（小时）</label>
            <div class="ap-hours">
              <label v-for="h in 24" :key="h-1" class="ap-hour-check">
                <input type="checkbox" :value="h-1" v-model="config.schedule_hours" />
                {{ h - 1 }}
              </label>
            </div>
          </div>
        </div>
        <div class="ap-form-actions">
          <button class="ap-btn primary" @click="saveConfig" :disabled="saving">{{ saving ? '保存中...' : '保存配置' }}</button>
          <button class="ap-btn warning" @click="manualRun" :disabled="running">{{ running ? '执行中...' : '立即执行' }}</button>
        </div>
      </div>
    </div>

    <!-- 高表现素材分析 -->
    <div class="ap-section">
      <div class="ap-section-hd">
        <h3>高表现素材分析（近{{ config.lookback_days || 7 }}天）</h3>
        <button class="ap-btn" @click="loadTopMaterials" :disabled="loadingMaterials">{{ loadingMaterials ? '分析中...' : '刷新分析' }}</button>
      </div>
      <table class="ap-tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>广告组</th>
            <th>消耗</th>
            <th>曝光</th>
            <th>点击</th>
            <th>转化数</th>
            <th>转化率</th>
            <th>转化成本</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(m, i) in topMaterials" :key="m.adgroup_id">
            <td>{{ i + 1 }}</td>
            <td>{{ m.adgroup_name || m.adgroup_id }}</td>
            <td>{{ fmtMoney(m.cost) }}</td>
            <td>{{ fmtNum(m.impression) }}</td>
            <td>{{ fmtNum(m.click) }}</td>
            <td>{{ m.conversion || 0 }}</td>
            <td class="ap-highlight">{{ (parseFloat(m.conversion_rate || 0) * 100).toFixed(2) }}%</td>
            <td>{{ fmtMoney(m.conversion_cost) }}</td>
          </tr>
          <tr v-if="!topMaterials.length">
            <td colspan="8" style="text-align:center;color:#999;padding:20px">{{ loadingMaterials ? '加载中...' : '点击"刷新分析"查看数据' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 任务历史 -->
    <div class="ap-section">
      <div class="ap-section-hd">
        <h3>建计划任务记录</h3>
        <button class="ap-btn" @click="loadTasks">刷新</button>
      </div>
      <table class="ap-tbl">
        <thead>
          <tr><th>任务名称</th><th>状态</th><th>总数</th><th>成功</th><th>失败</th><th>创建时间</th><th>详情</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in tasks" :key="t.id">
            <td>{{ t.task_name }}</td>
            <td>
              <span class="ap-tag" :class="t.status">{{ statusMap[t.status] || t.status }}</span>
            </td>
            <td>{{ t.total_count }}</td>
            <td class="ap-success">{{ t.success_count }}</td>
            <td class="ap-fail">{{ t.fail_count }}</td>
            <td>{{ formatTime(t.created_at) }}</td>
            <td><button v-if="t.detail" class="ap-link" @click="showDetail = t.detail">查看</button></td>
          </tr>
          <tr v-if="!tasks.length"><td colspan="7" style="text-align:center;color:#999;padding:20px">暂无任务记录</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 详情弹窗 -->
  <div v-if="showDetail" class="ap-mask" @click.self="showDetail=null">
    <div class="ap-modal">
      <div class="ap-modal-hd"><span>任务详情</span><button class="ap-close" @click="showDetail=null">&times;</button></div>
      <pre>{{ typeof showDetail === 'string' ? showDetail : JSON.stringify(showDetail, null, 2) }}</pre>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import request from '../utils/request'

const accounts = ref([])
const selectedAccount = ref('')
const config = reactive({
  enabled: false, min_roi: 1.5, min_cvr: 0.03, lookback_days: 7,
  daily_budget: 30000, bid_amount: 5000, max_plans_per_run: 5,
  schedule_hours: [9, 14],
  marketing_goal: 'MARKETING_GOAL_PRODUCT_SALES',
  site_set: ['SITE_SET_WECHAT'],
  bid_mode: 'BID_MODE_OCPM',
  optimization_goal: 'OPTIMIZATIONGOAL_ECOMMERCE_ORDER',
})
const topMaterials = ref([])
const tasks = ref([])
const saving = ref(false)
const running = ref(false)
const loading = ref(false)
const loadingMaterials = ref(false)
const showDetail = ref(null)

const statusMap = { pending: '等待中', running: '执行中', done: '已完成', failed: '失败' }

function fmtMoney(v) { const n = parseFloat(v || 0) / 100; return n >= 10000 ? (n / 10000).toFixed(2) + '万' : n.toFixed(2) }
function fmtNum(v) { const n = parseInt(v || 0); return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString() }
function formatTime(t) { return t ? t.replace('T', ' ').slice(0, 19) : '' }

async function loadAccounts() {
  try {
    const res = await request.get('/adq/accounts')
    accounts.value = res?.data || res || []
  } catch (e) { console.error(e) }
}

async function onAccountChange() {
  if (!selectedAccount.value) return
  await Promise.all([loadConfig(), loadTasks()])
}

async function loadConfig() {
  try {
    const res = await request.get('/adq-pitcher/auto-config', { params: { account_db_id: selectedAccount.value } })
    const data = res?.data || res || {}
    Object.keys(data).forEach(k => { if (k in config) config[k] = data[k] })
  } catch (e) { console.error(e) }
}

async function saveConfig() {
  saving.value = true
  try {
    await request.post('/adq-pitcher/auto-config', { account_db_id: selectedAccount.value, config: { ...config } })
    alert('配置已保存')
  } catch (e) { alert('保存失败: ' + e.message) }
  saving.value = false
}

async function loadTopMaterials() {
  if (!selectedAccount.value) return
  loadingMaterials.value = true
  try {
    const res = await request.get('/adq-dash/top-materials', {
      params: { account_db_id: selectedAccount.value, days: config.lookback_days, sort_by: 'conversion_rate', limit: 20 }
    })
    topMaterials.value = res?.data || res || []
  } catch (e) { console.error(e) }
  loadingMaterials.value = false
}

async function loadTasks() {
  if (!selectedAccount.value) return
  try {
    const res = await request.get('/adq-pitcher/tasks', { params: { account_db_id: selectedAccount.value } })
    tasks.value = (res?.data || res || []).map(t => {
      if (typeof t.detail === 'string') { try { t.detail = JSON.parse(t.detail) } catch (e) {} }
      return t
    })
  } catch (e) { console.error(e) }
}

async function manualRun() {
  if (!confirm('确定立即执行自动建计划？将根据配置筛选高表现素材并创建新计划。')) return
  running.value = true
  try {
    const res = await request.post('/adq-pitcher/auto-run', { account_db_id: selectedAccount.value })
    const msg = res?.msg || res?.data?.msg || '已开始执行'
    alert(msg)
    setTimeout(() => loadTasks(), 2000)
  } catch (e) { alert('执行失败: ' + e.message) }
  running.value = false
}

onMounted(loadAccounts)
</script>

<style scoped>
.ap { padding: 20px; max-width: 1400px; margin: 0 auto }
.ap h2 { margin: 0 0 16px; font-size: 20px }

.ap-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 20px }
.ap-bar select { padding: 6px 12px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; min-width: 200px }

.ap-body { display: flex; flex-direction: column; gap: 20px }

.ap-section { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06) }
.ap-section-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px }
.ap-section-hd h3 { margin: 0; font-size: 16px }

.ap-form-row { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap }
.ap-field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1 }
.ap-field.wide { min-width: 100%; flex-basis: 100% }
.ap-field label { font-size: 13px; color: #595959; font-weight: 500 }
.ap-field input, .ap-field select { padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px }
.ap-hint { font-size: 12px; color: #8c8c8c }

.ap-hours { display: flex; flex-wrap: wrap; gap: 4px }
.ap-hour-check { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border: 1px solid #e8e8e8; border-radius: 4px; font-size: 12px; cursor: pointer; user-select: none }
.ap-hour-check:has(input:checked) { background: #e6f4ff; border-color: #91caff }
.ap-hour-check input { width: 12px; height: 12px }

.ap-form-actions { display: flex; gap: 12px; margin-top: 8px; padding-top: 12px; border-top: 1px solid #f0f0f0 }

.ap-btn { padding: 6px 16px; border: 1px solid #d9d9d9; border-radius: 6px; cursor: pointer; font-size: 14px; background: #fff }
.ap-btn.primary { background: #1677ff; color: #fff; border-color: #1677ff }
.ap-btn.warning { background: #fa8c16; color: #fff; border-color: #fa8c16 }
.ap-btn:disabled { opacity: .5; cursor: default }

.ap-switch-wrap { display: flex; align-items: center; gap: 8px; font-size: 13px }
.ap-switch { position: relative; display: inline-block; width: 40px; height: 22px }
.ap-switch input { display: none }
.ap-switch-slider { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #ccc; border-radius: 22px; cursor: pointer; transition: .2s }
.ap-switch-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px; background: #fff; border-radius: 50%; transition: .2s }
.ap-switch.on .ap-switch-slider { background: #52c41a }
.ap-switch.on .ap-switch-slider::before { transform: translateX(18px) }

.ap-tbl { width: 100%; border-collapse: collapse }
.ap-tbl th, .ap-tbl td { padding: 10px 8px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px }
.ap-tbl th { background: #fafafa; font-weight: 600 }
.ap-highlight { color: #1677ff; font-weight: 600 }

.ap-tag { padding: 2px 8px; border-radius: 4px; font-size: 12px }
.ap-tag.done { background: #f6ffed; color: #52c41a }
.ap-tag.running { background: #e6f4ff; color: #1677ff }
.ap-tag.pending { background: #fff7e6; color: #fa8c16 }
.ap-tag.failed { background: #fff2f0; color: #ff4d4f }

.ap-success { color: #52c41a }
.ap-fail { color: #ff4d4f }
.ap-link { background: none; border: none; color: #1677ff; cursor: pointer; font-size: 13px }

.ap-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.45); z-index: 1000; display: flex; align-items: center; justify-content: center }
.ap-modal { background: #fff; border-radius: 8px; width: 560px; max-height: 70vh; overflow: auto }
.ap-modal-hd { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; font-weight: 600 }
.ap-modal pre { padding: 16px; font-size: 13px; white-space: pre-wrap; word-break: break-all }
.ap-close { background: none; border: none; font-size: 22px; cursor: pointer; color: #999 }
</style>
