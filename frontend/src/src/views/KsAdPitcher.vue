<template>
  <div class="page">
    <!-- Overview Section -->
    <div class="overview">
      <div class="overview-header">
        <h3 class="overview-title">🤖 快手AI金牌投手</h3>
        <p class="overview-desc">实时监控快手磁力广告计划，自动放大盈利素材、止损亏损素材</p>
      </div>
      <div class="overview-grid">
        <div class="ov-card">
          <div class="ov-card__label">运行账户</div>
          <div class="ov-card__value">{{ runningCount }}</div>
          <div class="ov-card__hint green">共 {{ accountList.length }} 个账户</div>
        </div>
        <div class="ov-card">
          <div class="ov-card__label">今日放大</div>
          <div class="ov-card__value green">{{ totalScaleUp }}</div>
          <div class="ov-card__hint">盈利素材扩量</div>
        </div>
        <div class="ov-card">
          <div class="ov-card__label">今日止损</div>
          <div class="ov-card__value red">{{ totalScaleDown }}</div>
          <div class="ov-card__hint">亏损素材控量</div>
        </div>
        <div class="ov-card">
          <div class="ov-card__label">今日观察</div>
          <div class="ov-card__value orange">{{ totalHold }}</div>
          <div class="ov-card__hint">持续监控中</div>
        </div>
        <div class="ov-card">
          <div class="ov-card__label">最近执行</div>
          <div class="ov-card__value" style="font-size:16px">{{ latestRun || '--' }}</div>
          <div class="ov-card__hint">自动轮询中</div>
        </div>
      </div>
    </div>

    <!-- Account Table Section -->
    <div class="acc-section">
      <div class="acc-table-header">
        <span class="col-info">账户信息</span>
        <span class="col-val">保本ROI</span>
        <span class="col-val">止损ROI</span>
        <span class="col-val">放大</span>
        <span class="col-val">止损</span>
        <span class="col-val col-hide-m">轮询</span>
        <span class="col-status">状态</span>
      </div>
      <div v-if="loading" class="empty-state">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>
      <template v-else>
        <div
          v-for="acc in accountList"
          :key="acc.advertiser_id"
          class="acc-table-row"
          @click="openDrawer(acc)"
        >
          <div class="col-info">
            <div class="acc-avatar" :style="{ background: avatarColor(acc.advertiser_id) }">
              {{ (acc.advertiser_name || acc.advertiser_id || '账').charAt(0) }}
            </div>
            <div class="acc-text">
              <div class="acc-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
              <div class="acc-sub">ID: {{ acc.advertiser_id }}</div>
            </div>
          </div>
          <span class="col-val blue">{{ getStatus(acc.advertiser_id)?.min_roi || '--' }}</span>
          <span class="col-val orange">{{ getStatus(acc.advertiser_id)?.stop_roi || '--' }}</span>
          <span class="col-val green">{{ getStatus(acc.advertiser_id)?.today_scale_up || 0 }}</span>
          <span class="col-val red">{{ getStatus(acc.advertiser_id)?.today_scale_down || 0 }}</span>
          <span class="col-val col-hide-m">{{ getStatus(acc.advertiser_id)?.poll_interval || '--' }}分钟</span>
          <div class="col-status">
            <span class="badge" :class="getStatus(acc.advertiser_id)?.enabled ? 'on' : 'off'">
              <i class="dot"></i>
              {{ getStatus(acc.advertiser_id)?.enabled ? '运行中' : '未启动' }}
            </span>
          </div>
        </div>
        <div v-if="!accountList.length" class="empty-state">暂无账户，请先在账户管理中授权快手广告账户</div>
      </template>
    </div>

    <!-- Drawer -->
    <div v-if="drawerVisible" class="drawer-mask" @click.self="drawerVisible = false">
      <div class="drawer">
        <div class="drawer-head">
          <div class="dh-left">
            <div class="dh-avatar" :style="{ background: avatarColor(currentAcc.advertiser_id) }">
              {{ (currentAcc.advertiser_name || currentAcc.advertiser_id || '账').charAt(0) }}
            </div>
            <div>
              <div class="dh-name">{{ currentAcc.advertiser_name || currentAcc.advertiser_id }}</div>
              <div class="dh-id">ID: {{ currentAcc.advertiser_id }}</div>
            </div>
          </div>
          <span class="dh-close" @click="drawerVisible = false">&times;</span>
        </div>
        <div class="drawer-body">
          <!-- Hero Row -->
          <div class="hero-row">
            <div class="hero-card" :class="config.enabled ? 'c-on' : 'c-off'">
              <div class="hero-label">投手状态</div>
              <div class="hero-val">{{ config.enabled ? '🟢 运行中' : '⚪ 已停止' }}</div>
            </div>
            <div class="hero-card c-action">
              <button v-if="!config.enabled" class="btn-primary" @click="startPitcher" :disabled="saving">🚀 启动投手</button>
              <button v-else class="btn-danger" @click="stopPitcher" :disabled="saving">⏹ 停止投手</button>
              <button class="btn-run" @click="runOnce" :disabled="running || !config.enabled">
                {{ running ? '执行中...' : '▶ 手动执行' }}
              </button>
            </div>
          </div>

          <!-- Config Section -->
          <div class="sec-label">
            ⚙️ 规则配置
            <button class="btn-save" @click="saveConfig" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button>
          </div>
          <div class="config-grid">
            <div class="cfg-item">
              <span class="cfg-l">保本 ROI</span>
              <input type="number" v-model.number="config.min_roi" step="0.1" min="0">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">止损 ROI</span>
              <input type="number" v-model.number="config.stop_roi" step="0.1" min="0">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">最小消耗(元)</span>
              <input type="number" v-model.number="config.min_cost" step="10" min="0">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">最低转化率(%)</span>
              <input type="number" v-model.number="config.min_cvr" step="0.5" min="0">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">轮询间隔</span>
              <select v-model.number="config.poll_interval">
                <option :value="5">5分钟</option>
                <option :value="10">10分钟</option>
                <option :value="15">15分钟</option>
                <option :value="30">30分钟</option>
              </select>
            </div>
            <div class="cfg-item">
              <span class="cfg-l">预算放大倍数</span>
              <input type="number" v-model.number="config.budget_multiply" step="0.1" min="1" max="5">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">出价上调(%)</span>
              <input type="number" v-model.number="config.bid_up_pct" step="1" min="0" max="30">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">出价下调(%)</span>
              <input type="number" v-model.number="config.bid_down_pct" step="1" min="0" max="30">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">最大放大倍数</span>
              <input type="number" v-model.number="config.max_budget_multiply" step="0.5" min="1" max="10">
            </div>
            <div class="cfg-item">
              <span class="cfg-l">转化断流(分钟)</span>
              <input type="number" v-model.number="config.no_convert_minutes" step="5" min="10">
            </div>
          </div>

          <!-- Logs Section -->
          <div class="sec-label">
            📋 执行日志
            <button class="btn-text" @click="loadLogs">刷新</button>
          </div>
          <div class="log-card">
            <div v-for="log in logs" :key="log.id" class="log-item" :class="'log-' + log.action">
              <div class="log-item__head">
                <span class="log-action-tag" :class="'action-' + log.action">{{ actionLabel(log.action) }}</span>
                <span class="log-time">{{ fmtTime(log.created_at) }}</span>
              </div>
              <div class="log-ad">{{ log.ad_name || log.ad_id || '账户整体' }}</div>
              <div class="log-metrics" v-if="log.cost > 0">
                <span>消耗 ¥{{ parseFloat(log.cost).toFixed(0) }}</span>
                <span>ROI {{ log.roi }}</span>
                <span v-if="log.cvr > 0">CVR {{ log.cvr }}%</span>
                <span v-if="log.orders > 0">转化 {{ log.orders }}</span>
                <span v-if="log.gmv > 0">GMV ¥{{ parseFloat(log.gmv).toFixed(0) }}</span>
              </div>
              <div class="log-detail">{{ log.action_detail }}</div>
            </div>
            <div v-if="!logs.length" class="empty-tip">暂无日志，启动AI投手后会自动记录</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import request from '../utils/request'

const accountList = ref([])
const statusList = ref([])
const loading = ref(false)
const drawerVisible = ref(false)
const currentAcc = ref({})
const config = ref({
  min_roi: 1.5,
  stop_roi: 0.8,
  min_cost: 100,
  min_cvr: 1,
  poll_interval: 10,
  budget_multiply: 1.5,
  bid_up_pct: 5,
  bid_down_pct: 5,
  max_budget_multiply: 3,
  no_convert_minutes: 30,
  enabled: 0
})
const logs = ref([])
const saving = ref(false)
const running = ref(false)

// Computed aggregates
const runningCount = computed(() => statusList.value.filter(s => s.enabled).length)
const totalScaleUp = computed(() => statusList.value.reduce((a, s) => a + (s.today_scale_up || 0), 0))
const totalScaleDown = computed(() => statusList.value.reduce((a, s) => a + (s.today_scale_down || 0), 0))
const totalHold = computed(() => statusList.value.reduce((a, s) => a + (s.today_hold || 0), 0))
const latestRun = computed(() => {
  const times = statusList.value.filter(s => s.last_run).map(s => new Date(s.last_run).getTime())
  return times.length ? fmtTime(new Date(Math.max(...times))) : ''
})

// Helpers
const getStatus = (aid) => statusList.value.find(s => s.advertiser_id === String(aid))
const avatarColor = (id) => ['#FF6600', '#FF8833', '#E65C00', '#CC5200', '#FF9944', '#FFB366'][parseInt(id) % 6]
const actionLabel = (action) => ({
  scale_up: '🔥 放大',
  scale_down: '🛑 止损',
  stop_scale: '⚠️ 冻结',
  hold: '👀 观察'
})[action] || action
const fmtTime = (t) => t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

// Data loading
onMounted(async () => {
  loading.value = true
  try {
    const r = await request.get('/ks-ad/accounts')
    accountList.value = r.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
  loadStatus()
})

const loadStatus = async () => {
  try {
    const r = await request.get('/ks-pitcher/status')
    statusList.value = r.data || []
  } catch (e) {}
}

const openDrawer = async (acc) => {
  currentAcc.value = acc
  drawerVisible.value = true
  config.value = {
    min_roi: 1.5, stop_roi: 0.8, min_cost: 100, min_cvr: 1,
    poll_interval: 10, budget_multiply: 1.5, bid_up_pct: 5,
    bid_down_pct: 5, max_budget_multiply: 3, no_convert_minutes: 30, enabled: 0
  }
  logs.value = []
  try {
    const r = await request.get('/ks-pitcher/config/' + acc.advertiser_id)
    if (r.data) config.value = { ...config.value, ...r.data }
  } catch (e) {}
  loadLogs()
}

const saveConfig = async () => {
  saving.value = true
  try {
    await request.post('/ks-pitcher/config/' + currentAcc.value.advertiser_id, config.value)
    alert('配置已保存')
  } catch (e) {
    alert('保存失败: ' + e.message)
  } finally {
    saving.value = false
    loadStatus()
  }
}

const startPitcher = async () => {
  if (!confirm('确认启动快手AI金牌投手？')) return
  saving.value = true
  try {
    await request.post('/ks-pitcher/start/' + currentAcc.value.advertiser_id)
    config.value.enabled = 1
    loadStatus()
    loadLogs()
  } catch (e) {
    alert('启动失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

const stopPitcher = async () => {
  saving.value = true
  try {
    await request.post('/ks-pitcher/stop/' + currentAcc.value.advertiser_id)
    config.value.enabled = 0
    loadStatus()
    loadLogs()
  } catch (e) {
    alert('停止失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

const loadLogs = async () => {
  if (!currentAcc.value?.advertiser_id) return
  try {
    const r = await request.get('/ks-pitcher/logs/' + currentAcc.value.advertiser_id)
    logs.value = r.data?.list || []
  } catch (e) {}
}

const runOnce = async () => {
  running.value = true
  try {
    const r = await request.post('/ks-pitcher/run-once/' + currentAcc.value.advertiser_id)
    alert(`执行完成：处理${r.data?.processed || 0}个计划，放大${r.data?.scale_up || 0}，止损${r.data?.scale_down || 0}`)
    loadLogs()
    loadStatus()
  } catch (e) {
    alert('执行失败: ' + e.message)
  } finally {
    running.value = false
  }
}
</script>

<style scoped>
.page { padding: 0; }

/* ===== Overview ===== */
.overview {
  background: linear-gradient(135deg, #1a56db 0%, #3b82f6 50%, #60a5fa 100%);
  color: #fff; padding: 20px 16px; border-radius: 0 0 16px 16px;
}
.overview-header { margin-bottom: 16px; }
.overview-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
.overview-desc { font-size: 12px; opacity: 0.8; margin: 0; }
.overview-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;
}
.ov-card {
  background: rgba(255,255,255,0.12); backdrop-filter: blur(8px);
  border-radius: 10px; padding: 12px 10px; text-align: center;
}
.ov-card__label { font-size: 11px; opacity: 0.75; margin-bottom: 4px; }
.ov-card__value { font-size: 24px; font-weight: 700; line-height: 1.3; }
.ov-card__value.green { color: #86efac; }
.ov-card__value.red { color: #fca5a5; }
.ov-card__value.orange { color: #fdba74; }
.ov-card__value.blue { color: #93c5fd; }
.ov-card__hint { font-size: 10px; opacity: 0.6; margin-top: 2px; }
.ov-card__hint.green { color: #86efac; opacity: 0.9; }

/* ===== Account Table ===== */
.acc-section {
  background: #fff; margin: 12px; border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden;
}
.acc-table-header {
  display: flex; align-items: center; padding: 10px 14px;
  background: #fafbfc; border-bottom: 1px solid #f0f0f0;
  font-size: 11px; color: #999; font-weight: 500;
}
.acc-table-row {
  display: flex; align-items: center; padding: 12px 14px;
  border-bottom: 1px solid #f5f5f5; cursor: pointer; transition: background 0.15s;
}
.acc-table-row:hover { background: #fafbfc; }
.acc-table-row:last-child { border-bottom: none; }
.col-info { flex: 2.5; display: flex; align-items: center; gap: 10px; min-width: 0; }
.col-val { flex: 1; text-align: center; font-size: 13px; font-weight: 600; }
.col-val.blue { color: #1677ff; }
.col-val.orange { color: #fa8c16; }
.col-val.green { color: #52c41a; }
.col-val.red { color: #ff4d4f; }
.col-status { flex: 1; display: flex; justify-content: center; }
.acc-avatar {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700;
}
.acc-text { min-width: 0; }
.acc-name { font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acc-sub { font-size: 11px; color: #999; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 10px;
}
.badge.on { background: #f0fdf4; color: #16a34a; }
.badge.off { background: #f3f4f6; color: #9ca3af; }
.dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block;
}
.badge.on .dot { background: #16a34a; box-shadow: 0 0 4px #16a34a; }
.badge.off .dot { background: #d1d5db; }
.empty-state { text-align: center; padding: 32px 16px; color: #999; font-size: 13px; }
.loading-dots { display: flex; gap: 6px; justify-content: center; }
.loading-dots span {
  width: 8px; height: 8px; border-radius: 50%; background: #1677ff;
  animation: dotPulse 1.2s infinite ease-in-out;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

/* ===== Drawer ===== */
.drawer-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  z-index: 1000; display: flex; justify-content: flex-end;
}
.drawer {
  width: 90%; max-width: 520px; height: 100%; background: #f5f6fa;
  display: flex; flex-direction: column; animation: slideIn 0.25s ease;
}
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px; background: #fff; border-bottom: 1px solid #f0f0f0;
}
.dh-left { display: flex; align-items: center; gap: 10px; }
.dh-avatar {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700;
}
.dh-name { font-size: 15px; font-weight: 600; color: #1f2937; }
.dh-id { font-size: 11px; color: #999; }
.dh-close { font-size: 24px; color: #999; cursor: pointer; padding: 4px 8px; line-height: 1; }
.dh-close:hover { color: #333; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; -webkit-overflow-scrolling: touch; }

/* ===== Hero Row ===== */
.hero-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.hero-card {
  background: #fff; border-radius: 10px; padding: 12px 10px; text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.hero-label { font-size: 11px; color: #999; margin-bottom: 4px; }
.hero-val { font-size: 16px; font-weight: 700; color: #1f2937; }
.c-on { border-top: 3px solid #52c41a; }
.c-on .hero-val { color: #16a34a; }
.c-off { border-top: 3px solid #d1d5db; }
.c-off .hero-val { color: #9ca3af; }
.c-action {
  display: flex; flex-direction: column; gap: 6px; justify-content: center;
  padding: 8px;
}

/* ===== Buttons ===== */
.btn-primary {
  padding: 7px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
  background: #1677ff; color: #fff; cursor: pointer; transition: 0.2s;
}
.btn-primary:hover { background: #0958d9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
  padding: 7px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
  background: #ff4d4f; color: #fff; cursor: pointer; transition: 0.2s;
}
.btn-danger:hover { background: #d9363e; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-run {
  padding: 6px 12px; border: 1px solid #52c41a; border-radius: 6px; font-size: 11px;
  background: #f6ffed; color: #52c41a; cursor: pointer; font-weight: 500; transition: 0.2s;
}
.btn-run:hover { background: #52c41a; color: #fff; }
.btn-run:disabled { opacity: 0.5; cursor: not-allowed; border-color: #d9d9d9; color: #999; background: #fafafa; }
.btn-save {
  padding: 4px 12px; border: 1px solid #1677ff; border-radius: 4px; font-size: 11px;
  background: #fff; color: #1677ff; cursor: pointer; font-weight: 500;
}
.btn-save:hover { background: #1677ff; color: #fff; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-text {
  border: none; background: none; color: #1677ff; font-size: 12px; cursor: pointer; font-weight: 500;
}

/* ===== Section Label ===== */
.sec-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 10px;
  padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;
}

/* ===== Config Grid ===== */
.config-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-bottom: 20px;
}
.cfg-item {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-radius: 8px; padding: 10px 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.cfg-l { font-size: 12px; color: #555; flex-shrink: 0; }
.cfg-item input, .cfg-item select {
  width: 80px; padding: 5px 8px; border: 1px solid #e5e7eb; border-radius: 6px;
  font-size: 13px; text-align: right; background: #fafbfc; box-sizing: border-box;
}
.cfg-item input:focus, .cfg-item select:focus {
  border-color: #1677ff; outline: none; background: #fff;
  box-shadow: 0 0 0 2px rgba(22,119,255,0.1);
}

/* ===== Log Card ===== */
.log-card {
  background: #fff; border-radius: 10px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  max-height: 500px; overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.log-item {
  padding: 10px 14px; border-bottom: 1px solid #f9fafb;
  border-left: 3px solid transparent; transition: background 0.15s;
}
.log-item:hover { background: #fafbfc; }
.log-item:last-child { border-bottom: none; }
.log-scale_up { border-left-color: #52c41a; }
.log-scale_down { border-left-color: #ff4d4f; }
.log-stop_scale { border-left-color: #faad14; }
.log-hold { border-left-color: #d9d9d9; }
.log-item__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.log-action-tag {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
}
.action-scale_up { background: #f0fdf4; color: #16a34a; }
.action-scale_down { background: #fef2f2; color: #dc2626; }
.action-stop_scale { background: #fffbeb; color: #d97706; }
.action-hold { background: #f3f4f6; color: #6b7280; }
.log-time { font-size: 11px; color: #9ca3af; }
.log-ad { font-size: 13px; font-weight: 500; color: #1f2937; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.log-metrics { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #6b7280; margin-bottom: 3px; }
.log-detail { font-size: 11px; color: #3b82f6; word-break: break-all; }
.empty-tip { text-align: center; padding: 32px 16px; color: #9ca3af; font-size: 13px; }

/* ===== Responsive ===== */
@media (max-width: 640px) {
  .overview-grid { grid-template-columns: repeat(3, 1fr); }
  .col-hide-m { display: none; }
  .hero-row { grid-template-columns: 1fr 1fr; }
  .config-grid { grid-template-columns: 1fr; }
  .acc-table-header { display: none; }
  .acc-table-row { flex-wrap: wrap; gap: 4px; }
  .col-info { flex: 100%; }
  .col-val { flex: none; font-size: 12px; }
  .col-status { flex: none; }
}
@media (min-width: 641px) {
  .overview { border-radius: 12px; margin: 0; }
  .overview-grid { grid-template-columns: repeat(5, 1fr); }
}
@media (min-width: 768px) {
  .page { padding: 0; }
  .drawer { max-width: 560px; }
}
</style>
