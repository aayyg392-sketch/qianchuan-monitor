<template>
<div class="at">
  <div class="at-hd">
    <h2>AI金牌投手</h2>
    <div class="at-hd-right">
      <select v-model="selectedAccount" class="at-select" @change="onAccountChange">
        <option value="">选择账户</option>
        <option v-for="a in accounts" :key="a.advertiser_id" :value="a.advertiser_id">
          {{ a.advertiser_name || a.advertiser_id }}
        </option>
      </select>
      <span class="at-status" :class="statusClass">{{ statusText }}</span>
      <button v-if="!status.running" class="at-btn at-btn-p" :disabled="!selectedAccount || saving" @click="handleStart">启动</button>
      <button v-else class="at-btn at-btn-d" @click="handleStop">停止</button>
    </div>
  </div>

  <div v-if="selectedAccount" class="at-body">
    <div class="at-rules">
      <h3>规则配置</h3>
      <div class="at-form">
        <div class="at-row">
          <div class="at-field">
            <label>保本ROI</label>
            <input type="number" v-model.number="rules.break_even_roi" step="0.1" min="0" />
            <span class="at-hint">ROI≥此值触发放大</span>
          </div>
          <div class="at-field">
            <label>止损ROI</label>
            <input type="number" v-model.number="rules.stop_loss_roi" step="0.1" min="0" />
            <span class="at-hint">ROI&lt;此值触发止损</span>
          </div>
          <div class="at-field">
            <label>最小消耗(元)</label>
            <input type="number" v-model.number="rules.min_cost" step="10" min="0" />
            <span class="at-hint">消耗低于此值不操作</span>
          </div>
          <div class="at-field">
            <label>最低CVR</label>
            <input type="number" v-model.number="rules.min_cvr" step="0.001" min="0" />
            <span class="at-hint">转化率门槛</span>
          </div>
        </div>
        <div class="at-row">
          <div class="at-field">
            <label>轮询间隔(分)</label>
            <input type="number" v-model.number="rules.poll_interval" step="1" min="1" max="60" />
          </div>
          <div class="at-field">
            <label>放大倍数</label>
            <input type="number" v-model.number="rules.scale_factor" step="0.1" min="1" max="5" />
            <span class="at-hint">预算放大系数</span>
          </div>
          <div class="at-field">
            <label>出价上调幅度</label>
            <input type="number" v-model.number="rules.bid_up_pct" step="0.01" min="0" max="0.3" />
            <span class="at-hint">如0.08表示+8%</span>
          </div>
          <div class="at-field">
            <label>出价下调幅度</label>
            <input type="number" v-model.number="rules.bid_down_pct" step="0.01" min="0" max="0.3" />
            <span class="at-hint">止损时降出价幅度</span>
          </div>
        </div>
        <div class="at-row">
          <div class="at-field">
            <label>预算上限倍数</label>
            <input type="number" v-model.number="rules.budget_cap_factor" step="0.5" min="1" max="10" />
            <span class="at-hint">原预算×此值为上限</span>
          </div>
          <div class="at-field">
            <label>出价上调上限</label>
            <input type="number" v-model.number="rules.bid_up_cap" step="0.01" min="0" max="0.5" />
            <span class="at-hint">如0.15表示最高+15%</span>
          </div>
          <div class="at-field">
            <label>最低曝光</label>
            <input type="number" v-model.number="rules.min_show" step="50" min="0" />
            <span class="at-hint">曝光低于此值不操作</span>
          </div>
          <div class="at-field at-field-btn">
            <button class="at-btn at-btn-p" :disabled="saving" @click="saveRules">{{ saving ? '保存中...' : '保存规则' }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="at-logs">
      <div class="at-logs-hd">
        <h3>操作日志</h3>
        <div class="at-logs-filter">
          <select v-model="logFilter" @change="loadLogs">
            <option value="">全部</option>
            <option value="scale_up">放大</option>
            <option value="stop_loss">止损</option>
            <option value="observe">观察</option>
            <option value="skip">跳过</option>
          </select>
          <button class="at-btn" @click="loadLogs">刷新</button>
        </div>
      </div>
      <table class="at-tbl">
        <thead>
          <tr>
            <th>时间</th>
            <th>计划</th>
            <th>消耗</th>
            <th>ROI</th>
            <th>CVR</th>
            <th>曝光</th>
            <th>转化</th>
            <th>动作</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in logs" :key="l.id" :class="'at-row-' + l.action">
            <td>{{ fmtTime(l.created_at) }}</td>
            <td class="at-td-name" :title="l.ad_name">{{ l.ad_name || l.ad_id || '-' }}</td>
            <td>{{ fmtNum(l.cost) }}</td>
            <td :class="roiClass(l.roi)">{{ l.roi ? Number(l.roi).toFixed(2) : '-' }}</td>
            <td>{{ l.cvr ? (Number(l.cvr)*100).toFixed(2) + '%' : '-' }}</td>
            <td>{{ l.show_count || '-' }}</td>
            <td>{{ l.convert_count || '-' }}</td>
            <td><span class="at-action" :class="'at-act-' + l.action">{{ actionMap[l.action] || l.action }}</span></td>
            <td class="at-td-detail" :title="l.detail">{{ l.detail || '-' }}</td>
          </tr>
          <tr v-if="!logs.length"><td colspan="9" style="text-align:center;color:#999;padding:20px">暂无日志</td></tr>
        </tbody>
      </table>
      <div v-if="logTotal > logPageSize" class="at-pager">
        <button :disabled="logPage<=1" @click="logPage--;loadLogs()">上一页</button>
        <span>{{ logPage }} / {{ Math.ceil(logTotal/logPageSize) }}</span>
        <button :disabled="logPage*logPageSize>=logTotal" @click="logPage++;loadLogs()">下一页</button>
      </div>
    </div>
  </div>
  <div v-else class="at-empty">请选择账户开始使用AI金牌投手</div>
</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import request from '../utils/request'

const accounts = ref([])
const selectedAccount = ref('')
const rules = ref({
  break_even_roi: 2, stop_loss_roi: 1, min_cost: 50, min_cvr: 0.01,
  poll_interval: 5, scale_factor: 1.5, bid_up_pct: 0.08, bid_down_pct: 0.08,
  budget_cap_factor: 3, bid_up_cap: 0.15, min_show: 100
})
const status = ref({ enabled: 0, running: false })
const logs = ref([])
const logPage = ref(1)
const logPageSize = 20
const logTotal = ref(0)
const logFilter = ref('')
const saving = ref(false)
let pollTimer = null

const actionMap = { scale_up: '放大', stop_loss: '止损', observe: '观察', skip: '跳过' }

const statusClass = computed(() => ({
  'at-status-on': status.value.running,
  'at-status-off': !status.value.running
}))
const statusText = computed(() => status.value.running ? '运行中' : '未启动')

function fmtTime(t) { return t ? t.replace('T', ' ').slice(0, 19) : '' }
function fmtNum(n) { return n ? Number(n).toFixed(2) : '0' }
function roiClass(roi) {
  if (!roi) return ''
  const v = Number(roi)
  if (v >= rules.value.break_even_roi) return 'at-roi-good'
  if (v < rules.value.stop_loss_roi) return 'at-roi-bad'
  return 'at-roi-mid'
}

async function loadAccounts() {
  try {
    const res = await request.get('/accounts/list')
    accounts.value = res.data || res || []
  } catch { accounts.value = [] }
}

async function onAccountChange() {
  if (!selectedAccount.value) return
  await Promise.all([loadRules(), loadStatus(), loadLogs()])
}

async function loadRules() {
  try {
    const res = await request.get('/ai-trader/rules/' + selectedAccount.value)
    if (res.code === 0 && res.data) {
      rules.value = { ...rules.value, ...res.data }
    }
  } catch {}
}

async function loadStatus() {
  try {
    const res = await request.get('/ai-trader/status', { params: { advertiser_id: selectedAccount.value } })
    if (res.code === 0) status.value = res.data || { enabled: 0, running: false }
  } catch {}
}

async function loadLogs() {
  try {
    const params = { advertiser_id: selectedAccount.value, page: logPage.value, page_size: logPageSize }
    if (logFilter.value) params.action = logFilter.value
    const res = await request.get('/ai-trader/logs', { params })
    if (res.code === 0) {
      logs.value = res.data.list || []
      logTotal.value = res.data.total || 0
    }
  } catch {}
}

async function saveRules() {
  saving.value = true
  try {
    const res = await request.post('/ai-trader/rules', { advertiser_id: selectedAccount.value, ...rules.value })
    if (res.code === 0) alert('保存成功')
    else alert(res.msg || '保存失败')
  } catch (e) { alert(e.message) }
  saving.value = false
}

async function handleStart() {
  // 先保存规则
  await saveRules()
  try {
    const res = await request.post('/ai-trader/start', { advertiser_id: selectedAccount.value })
    if (res.code === 0) {
      await loadStatus()
      await loadLogs()
    } else {
      alert(res.msg || '启动失败')
    }
  } catch (e) { alert(e.message) }
}

async function handleStop() {
  try {
    const res = await request.post('/ai-trader/stop', { advertiser_id: selectedAccount.value })
    if (res.code === 0) await loadStatus()
    else alert(res.msg || '停止失败')
  } catch (e) { alert(e.message) }
}

onMounted(async () => {
  await loadAccounts()
  // 自动刷新日志
  pollTimer = setInterval(() => {
    if (selectedAccount.value && status.value.running) {
      loadLogs()
      loadStatus()
    }
  }, 30000)
})

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.at{padding:20px;max-width:1400px;margin:0 auto}
.at-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px}
.at-hd h2{margin:0;font-size:20px}
.at-hd-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.at-select{padding:6px 12px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;min-width:200px}
.at-status{padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600}
.at-status-on{background:#f6ffed;color:#52c41a;border:1px solid #b7eb8f}
.at-status-off{background:#f5f5f5;color:#999;border:1px solid #d9d9d9}
.at-btn{padding:6px 16px;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer;background:#fff;font-size:14px}
.at-btn-p{background:#1677ff;color:#fff;border-color:#1677ff}
.at-btn-p:hover{background:#4096ff}
.at-btn-p:disabled{background:#d9d9d9;border-color:#d9d9d9;cursor:not-allowed}
.at-btn-d{background:#ff4d4f;color:#fff;border-color:#ff4d4f}
.at-btn-d:hover{background:#ff7875}
.at-rules{background:#fff;border:1px solid #f0f0f0;border-radius:8px;padding:16px 20px;margin-bottom:16px}
.at-rules h3{margin:0 0 12px;font-size:16px}
.at-form .at-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}
.at-field{display:flex;flex-direction:column}
.at-field label{font-size:13px;color:#666;margin-bottom:4px}
.at-field input{padding:6px 10px;border:1px solid #d9d9d9;border-radius:4px;font-size:14px}
.at-hint{font-size:11px;color:#999;margin-top:2px}
.at-field-btn{justify-content:flex-end}
.at-logs{background:#fff;border:1px solid #f0f0f0;border-radius:8px;padding:16px 20px}
.at-logs-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.at-logs-hd h3{margin:0;font-size:16px}
.at-logs-filter{display:flex;gap:8px}
.at-logs-filter select{padding:4px 10px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px}
.at-tbl{width:100%;border-collapse:collapse}
.at-tbl th,.at-tbl td{padding:8px 10px;text-align:left;border-bottom:1px solid #f0f0f0;font-size:13px}
.at-tbl th{background:#fafafa;font-weight:600;white-space:nowrap}
.at-td-name{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.at-td-detail{max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.at-action{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500}
.at-act-scale_up{background:#f6ffed;color:#52c41a}
.at-act-stop_loss{background:#fff2e8;color:#fa541c}
.at-act-observe{background:#e6f4ff;color:#1677ff}
.at-act-skip{background:#f5f5f5;color:#999}
.at-row-scale_up{background:#fafff5}
.at-row-stop_loss{background:#fffaf5}
.at-roi-good{color:#52c41a;font-weight:600}
.at-roi-bad{color:#ff4d4f;font-weight:600}
.at-roi-mid{color:#faad14}
.at-pager{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}
.at-pager button{padding:4px 12px;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;background:#fff}
.at-pager button:disabled{opacity:.5;cursor:default}
.at-empty{text-align:center;padding:60px 20px;color:#999;font-size:16px}
@media(max-width:768px){
  .at-form .at-row{grid-template-columns:repeat(2,1fr)}
  .at-hd{flex-direction:column;align-items:flex-start}
}
</style>
