<template>
  <div class="ai-engine">
    <!-- 深空蓝顶部Hero -->
    <div class="hero">
      <div class="hero-glow"></div>
      <div class="hero-top">
        <div class="hero-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="2"><path d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z"/><path d="M16 14H8a6 6 0 00-6 6v0h20a6 6 0 00-6-6z"/><circle cx="12" cy="6" r="1" fill="#00E5FF"/></svg>
          <span>AI投放引擎</span>
        </div>
        <div class="hero-badge" :class="engineRunning ? 'badge-on' : 'badge-off'" @click="toggleEngine">
          <span class="badge-dot"></span>{{ engineRunning ? '运行中' : '已停止' }}
        </div>
      </div>
      <!-- 引擎核心指标 -->
      <div class="hero-metrics">
        <div class="hm-item">
          <div class="hm-val">{{ engineStatus.total_decisions || 0 }}</div>
          <div class="hm-label">今日决策</div>
        </div>
        <div class="hm-divider"></div>
        <div class="hm-item">
          <div class="hm-val anomaly">{{ todayAnomalies }}</div>
          <div class="hm-label">异常告警</div>
        </div>
        <div class="hm-divider"></div>
        <div class="hm-item">
          <div class="hm-val">{{ lastRunDuration }}</div>
          <div class="hm-label">巡检耗时</div>
        </div>
        <div class="hm-divider"></div>
        <div class="hm-item">
          <div class="hm-val platform-count">3</div>
          <div class="hm-label">接入平台</div>
        </div>
      </div>
      <div class="hero-time" v-if="engineStatus.last_run_at">最近巡检 {{ fmtTime(engineStatus.last_run_at) }}</div>
    </div>

    <!-- Tab切换 -->
    <div class="tab-bar">
      <div class="tab-item" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">总览</div>
      <div class="tab-item" :class="{ active: activeTab === 'decisions' }" @click="activeTab = 'decisions'">决策记录</div>
      <div class="tab-item" :class="{ active: activeTab === 'rules' }" @click="activeTab = 'rules'">策略规则</div>
      <div class="tab-item" :class="{ active: activeTab === 'simulator' }" @click="activeTab = 'simulator'">模拟测试</div>
    </div>

    <!-- ===== Tab: 总览 ===== -->
    <div v-show="activeTab === 'overview'" class="tab-content">
      <!-- 三平台状态卡片 -->
      <div class="platform-cards">
        <div class="pf-card" v-for="pf in platforms" :key="pf.code" @click="selectedPlatform = pf.code">
          <div class="pf-card-head">
            <span class="pf-name">{{ pf.name }}</span>
            <span class="pf-code">{{ pf.code }}</span>
          </div>
          <div class="pf-card-stats">
            <div class="pf-stat">
              <span class="pf-stat-val">{{ getPlatformStat(pf.code, 'bid_adjust') }}</span>
              <span class="pf-stat-label">调价</span>
            </div>
            <div class="pf-stat">
              <span class="pf-stat-val warn">{{ getPlatformStat(pf.code, 'anomaly_alert') }}</span>
              <span class="pf-stat-label">异常</span>
            </div>
            <div class="pf-stat">
              <span class="pf-stat-val accent">{{ getPlatformStat(pf.code, 'creative_rotate') }}</span>
              <span class="pf-stat-label">换素材</span>
            </div>
          </div>
          <div class="pf-glow-bar" :class="'glow-' + pf.code"></div>
        </div>
      </div>

      <!-- 最近异常 -->
      <div class="section">
        <div class="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          异常告警
        </div>
        <div v-if="!recentAnomalies.length" class="empty-hint">暂无异常</div>
        <div v-for="(a, i) in recentAnomalies" :key="i" class="alert-item" :class="'alert-' + getSeverity(a)">
          <div class="alert-badge">{{ getSeverity(a) === 'critical' ? '严重' : '警告' }}</div>
          <div class="alert-body">
            <div class="alert-msg">{{ getAlertMsg(a) }}</div>
            <div class="alert-meta">{{ getPlatformName(a.platform) }} · {{ fmtTime(a.created_at) }}</div>
          </div>
        </div>
      </div>

      <!-- 最近出价调整 -->
      <div class="section">
        <div class="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
          出价调整
        </div>
        <div v-if="!recentBids.length" class="empty-hint">暂无调价记录</div>
        <div v-for="(b, i) in recentBids" :key="i" class="bid-item">
          <div class="bid-direction" :class="getBidDirection(b) > 0 ? 'bid-up' : 'bid-down'">
            {{ getBidDirection(b) > 0 ? '↑' : '↓' }}
          </div>
          <div class="bid-body">
            <div class="bid-change">{{ getBidFrom(b) }} → {{ getBidTo(b) }}</div>
            <div class="bid-meta">{{ getPlatformName(b.platform) }} · {{ fmtTime(b.created_at) }}</div>
          </div>
          <div class="bid-pct" :class="getBidDirection(b) > 0 ? 'pct-up' : 'pct-down'">
            {{ getBidDirection(b) > 0 ? '+' : '' }}{{ (getBidDirection(b) * 100).toFixed(1) }}%
          </div>
        </div>
      </div>

      <!-- 素材疲劳预警 -->
      <div class="section">
        <div class="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          素材疲劳
        </div>
        <div v-if="!fatigueAlerts.length" class="empty-hint">暂无疲劳素材</div>
        <div v-for="(f, i) in fatigueAlerts" :key="i" class="fatigue-item">
          <div class="fatigue-score" :class="getFatigueLevel(f)">{{ getFatigueScore(f) }}</div>
          <div class="fatigue-body">
            <div class="fatigue-msg">{{ getFatigueSuggestion(f) }}</div>
            <div class="fatigue-meta">{{ getPlatformName(f.platform) }} · {{ fmtTime(f.created_at) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Tab: 决策记录 ===== -->
    <div v-show="activeTab === 'decisions'" class="tab-content">
      <div class="filter-row">
        <select v-model="decisionFilter.platform" class="ds-select" @change="loadDecisions">
          <option value="">全平台</option>
          <option v-for="p in platforms" :key="p.code" :value="p.code">{{ p.name }}</option>
        </select>
        <select v-model="decisionFilter.type" class="ds-select" @change="loadDecisions">
          <option value="">全类型</option>
          <option value="bid_adjust">出价调整</option>
          <option value="creative_rotate">素材轮换</option>
          <option value="budget_pace">预算控制</option>
          <option value="anomaly_alert">异常告警</option>
          <option value="cold_start">冷启动</option>
        </select>
      </div>
      <div v-if="!decisions.length" class="empty-hint">暂无决策记录</div>
      <div v-for="d in decisions" :key="d.id" class="decision-card">
        <div class="dc-head">
          <span class="dc-type" :class="'dc-' + d.decision_type">{{ typeLabel(d.decision_type) }}</span>
          <span class="dc-time">{{ fmtTime(d.created_at) }}</span>
        </div>
        <div class="dc-platform">{{ getPlatformName(d.platform) }}</div>
        <div class="dc-detail" v-if="d.decision_data">{{ summarizeDecision(d) }}</div>
        <div class="dc-exec" :class="d.executed ? 'exec-done' : 'exec-pending'">
          {{ d.executed ? '已执行' : '待执行' }}
        </div>
      </div>
      <div class="load-more" v-if="decisions.length && decisionTotal > decisions.length" @click="loadMoreDecisions">加载更多</div>
    </div>

    <!-- ===== Tab: 策略规则 ===== -->
    <div v-show="activeTab === 'rules'" class="tab-content">
      <div class="rules-head">
        <div class="section-title" style="margin:0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          策略规则
        </div>
        <button class="ds-btn" @click="showTemplates = true">+ 从模板创建</button>
      </div>

      <div v-if="!rules.length" class="empty-hint">暂无规则，点击上方按钮创建</div>
      <div v-for="r in rules" :key="r.id" class="rule-card">
        <div class="rule-head">
          <span class="rule-name">{{ r.rule_name }}</span>
          <span class="rule-switch" :class="r.is_active ? 'sw-on' : 'sw-off'" @click="toggleRule(r)">
            {{ r.is_active ? 'ON' : 'OFF' }}
          </span>
        </div>
        <div class="rule-type">{{ typeLabel(r.rule_type) }} · {{ getPlatformName(r.platform) }}</div>
        <div class="rule-actions">
          <span class="rule-del" @click="deleteRule(r.id)">删除</span>
        </div>
      </div>

      <!-- 模板弹窗 -->
      <div class="modal-mask" v-if="showTemplates" @click.self="showTemplates = false">
        <div class="modal-body">
          <div class="modal-title">规则模板</div>
          <div v-for="(t, i) in ruleTemplates" :key="i" class="tpl-card" @click="createFromTemplate(t)">
            <div class="tpl-name">{{ t.name }}</div>
            <div class="tpl-desc">{{ t.description }}</div>
            <div class="tpl-type">{{ typeLabel(t.type) }}</div>
          </div>
          <button class="ds-btn modal-close" @click="showTemplates = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- ===== Tab: 模拟测试 ===== -->
    <div v-show="activeTab === 'simulator'" class="tab-content">
      <div class="sim-tabs">
        <span :class="{ active: simMode === 'bid' }" @click="simMode = 'bid'">PID调价</span>
        <span :class="{ active: simMode === 'coldstart' }" @click="simMode = 'coldstart'">冷启动</span>
        <span :class="{ active: simMode === 'budget' }" @click="simMode = 'budget'">预算匀速</span>
      </div>

      <!-- PID调价模拟 -->
      <div v-if="simMode === 'bid'" class="sim-panel">
        <div class="sim-field">
          <label>平台</label>
          <select v-model="simBid.platform" class="ds-select">
            <option v-for="p in platforms" :key="p.code" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div class="sim-field">
          <label>当前出价</label>
          <input v-model.number="simBid.currentBid" type="number" class="ds-input" placeholder="如 5.0">
        </div>
        <div class="sim-field">
          <label>目标ROI</label>
          <input v-model.number="simBid.targetROI" type="number" class="ds-input" placeholder="如 2.0">
        </div>
        <div class="sim-field">
          <label>实际ROI</label>
          <input v-model.number="simBid.actualROI" type="number" class="ds-input" placeholder="如 1.2">
        </div>
        <button class="ds-btn primary" @click="runBidSim" :disabled="simLoading">运行模拟</button>
        <div v-if="simBidResult" class="sim-result">
          <div class="sim-result-title">PID计算结果</div>
          <div class="sim-kv"><span>建议出价</span><strong :class="simBidResult.adjustment > 0 ? 'val-up' : 'val-down'">¥{{ simBidResult.newBid }}</strong></div>
          <div class="sim-kv"><span>调整幅度</span><strong>{{ (simBidResult.adjustment * 100).toFixed(1) }}%</strong></div>
          <div class="sim-kv"><span>误差值</span><strong>{{ simBidResult.error }}</strong></div>
          <div class="sim-kv"><span>P/I/D分量</span><strong>{{ simBidResult.detail?.proportional }} / {{ simBidResult.detail?.integral }} / {{ simBidResult.detail?.derivative }}</strong></div>
        </div>
      </div>

      <!-- 冷启动模拟 -->
      <div v-if="simMode === 'coldstart'" class="sim-panel">
        <div class="sim-field">
          <label>平台</label>
          <select v-model="simCold.platform" class="ds-select">
            <option v-for="p in platforms" :key="p.code" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div class="sim-field">
          <label>创建时间</label>
          <input v-model="simCold.createTime" type="datetime-local" class="ds-input">
        </div>
        <div class="sim-field">
          <label>累计转化数</label>
          <input v-model.number="simCold.totalConversions" type="number" class="ds-input" placeholder="如 8">
        </div>
        <div class="sim-field">
          <label>当前出价</label>
          <input v-model.number="simCold.currentBid" type="number" class="ds-input" placeholder="如 5.0">
        </div>
        <button class="ds-btn primary" @click="runColdSim" :disabled="simLoading">运行模拟</button>
        <div v-if="simColdResult" class="sim-result">
          <div class="sim-result-title">冷启动评估</div>
          <div class="sim-kv"><span>阶段</span><strong class="phase-tag" :class="'phase-' + simColdResult.phase">{{ phaseLabel(simColdResult.phase) }}</strong></div>
          <div class="sim-kv"><span>转化进度</span><strong>{{ (simColdResult.progress * 100).toFixed(0) }}%</strong></div>
          <div class="sim-kv"><span>剩余时间</span><strong>{{ simColdResult.hoursRemaining }}h</strong></div>
          <div class="sim-kv"><span>还需转化</span><strong>{{ simColdResult.conversionsNeeded }}个</strong></div>
          <div class="sim-advice" v-if="simColdResult.strategy">
            <div class="sim-advice-title">策略建议</div>
            <div v-for="(act, i) in simColdResult.strategy.actions" :key="i" class="sim-advice-item">{{ act }}</div>
          </div>
        </div>
      </div>

      <!-- 预算匀速模拟 -->
      <div v-if="simMode === 'budget'" class="sim-panel">
        <div class="sim-field">
          <label>平台</label>
          <select v-model="simBudget.platform" class="ds-select">
            <option v-for="p in platforms" :key="p.code" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div class="sim-field">
          <label>日预算</label>
          <input v-model.number="simBudget.dailyBudget" type="number" class="ds-input" placeholder="如 1000">
        </div>
        <div class="sim-field">
          <label>今日已花费</label>
          <input v-model.number="simBudget.spentToday" type="number" class="ds-input" placeholder="如 350">
        </div>
        <div class="sim-field">
          <label>当前小时</label>
          <input v-model.number="simBudget.currentHour" type="number" class="ds-input" min="0" max="23" :placeholder="'当前' + new Date().getHours() + '时'">
        </div>
        <button class="ds-btn primary" @click="runBudgetSim" :disabled="simLoading">运行模拟</button>
        <div v-if="simBudgetResult" class="sim-result">
          <div class="sim-result-title">预算消耗评估</div>
          <div class="sim-kv"><span>状态</span><strong class="pace-tag" :class="'pace-' + simBudgetResult.status">{{ paceLabel(simBudgetResult.status) }}</strong></div>
          <div class="sim-kv"><span>理想消耗</span><strong>¥{{ simBudgetResult.idealSpent }}</strong></div>
          <div class="sim-kv"><span>实际消耗</span><strong>¥{{ simBudgetResult.actualSpent }}</strong></div>
          <div class="sim-kv"><span>偏差</span><strong>{{ (simBudgetResult.deviation * 100).toFixed(1) }}%</strong></div>
          <div class="sim-kv"><span>剩余预算</span><strong>¥{{ simBudgetResult.remainingBudget }}</strong></div>
          <div class="sim-advice" v-if="simBudgetResult.action">
            <div class="sim-advice-title">建议操作</div>
            <div class="sim-advice-item">{{ simBudgetResult.action.message }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const activeTab = ref('overview')
const engineRunning = ref(false)
const engineStatus = ref({})
const todayAnomalies = ref(0)
const platforms = ref([
  { code: 'qianchuan', name: '巨量千川' },
  { code: 'kuaishou', name: '快手磁力' },
  { code: 'adq', name: '腾讯ADQ' },
])
const selectedPlatform = ref('')
const platformStats = ref([])
const recentAnomalies = ref([])
const recentBids = ref([])
const fatigueAlerts = ref([])

// 决策记录
const decisions = ref([])
const decisionTotal = ref(0)
const decisionPage = ref(1)
const decisionFilter = reactive({ platform: '', type: '' })

// 规则
const rules = ref([])
const ruleTemplates = ref([])
const showTemplates = ref(false)

// 模拟器
const simMode = ref('bid')
const simLoading = ref(false)
const simBid = reactive({ platform: 'qianchuan', currentBid: 5, targetROI: 2.0, actualROI: 1.2 })
const simBidResult = ref(null)
const simCold = reactive({ platform: 'qianchuan', createTime: '', totalConversions: 8, currentBid: 5 })
const simColdResult = ref(null)
const simBudget = reactive({ platform: 'qianchuan', dailyBudget: 1000, spentToday: 350, currentHour: new Date().getHours() })
const simBudgetResult = ref(null)

const lastRunDuration = computed(() => {
  const ms = engineStatus.value.last_run_duration_ms
  if (!ms) return '--'
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'
})

function fmtTime(t) {
  if (!t) return ''
  return dayjs(t).format('MM-DD HH:mm')
}

function getPlatformName(code) {
  const map = { qianchuan: '千川', kuaishou: '快手', adq: 'ADQ', all: '全平台' }
  return map[code] || code
}

function getPlatformStat(code, type) {
  const s = platformStats.value.find(p => p.platform === code && p.decision_type === type)
  return s?.total || 0
}

function getSeverity(a) {
  try {
    const d = typeof a.decision_data === 'string' ? JSON.parse(a.decision_data) : a.decision_data
    return d?.anomalies?.[0]?.severity || d?.severity || 'warning'
  } catch { return 'warning' }
}

function getAlertMsg(a) {
  try {
    const d = typeof a.decision_data === 'string' ? JSON.parse(a.decision_data) : a.decision_data
    return d?.anomalies?.[0]?.message || d?.message || '异常'
  } catch { return '异常' }
}

function getBidDirection(b) {
  try {
    const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data
    return d?.adjustment || 0
  } catch { return 0 }
}
function getBidFrom(b) {
  try {
    const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data
    return '¥' + (d?.currentBid || 0)
  } catch { return '--' }
}
function getBidTo(b) {
  try {
    const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data
    return '¥' + (d?.newBid || 0)
  } catch { return '--' }
}

function getFatigueScore(f) {
  try {
    const d = typeof f.decision_data === 'string' ? JSON.parse(f.decision_data) : f.decision_data
    return d?.score || 0
  } catch { return 0 }
}
function getFatigueLevel(f) {
  const s = getFatigueScore(f)
  return s >= 80 ? 'fatigue-critical' : s >= 60 ? 'fatigue-warn' : 'fatigue-ok'
}
function getFatigueSuggestion(f) {
  try {
    const d = typeof f.decision_data === 'string' ? JSON.parse(f.decision_data) : f.decision_data
    return d?.suggestion || '素材需关注'
  } catch { return '素材需关注' }
}

function typeLabel(t) {
  const m = { bid_adjust: '出价调整', bid: '出价规则', creative_rotate: '素材轮换', creative: '素材规则', budget_pace: '预算控制', budget: '预算规则', anomaly_alert: '异常告警', alert: '告警规则', cold_start: '冷启动' }
  return m[t] || t
}

function phaseLabel(p) {
  const m = { exploring: '探索期', accelerating: '加速期', graduated: '已毕业', failed: '失败' }
  return m[p] || p
}

function paceLabel(s) {
  const m = { normal: '正常', overspend: '消耗过快', underspend: '消耗过慢', unknown: '未知' }
  return m[s] || s
}

function summarizeDecision(d) {
  try {
    const data = typeof d.decision_data === 'string' ? JSON.parse(d.decision_data) : d.decision_data
    if (d.decision_type === 'bid_adjust') return `出价 ${data.currentBid} → ${data.newBid}，ROI目标${data.targetROI}`
    if (d.decision_type === 'creative_rotate') return data.suggestion || `疲劳度${data.score}分`
    if (d.decision_type === 'budget_pace') return data.action?.message || `偏差${(data.deviation * 100).toFixed(1)}%`
    if (d.decision_type === 'anomaly_alert') return data.anomalies?.[0]?.message || '异常'
    return JSON.stringify(data).slice(0, 80)
  } catch { return '' }
}

// ---- API ----
async function loadStatus() {
  try {
    const res = await request.get('/ai-engine/dashboard/status')
    engineStatus.value = res.data.engine || {}
    engineRunning.value = !!engineStatus.value.is_running
    todayAnomalies.value = res.data.todayAnomalies || 0
    if (res.data.todayDecisions) platformStats.value = res.data.todayDecisions
  } catch {}
}

async function loadOverview() {
  try {
    const res = await request.get('/ai-engine/dashboard/overview')
    if (res.data.platformStats) platformStats.value = res.data.platformStats
    recentAnomalies.value = res.data.recentAnomalies || []
    recentBids.value = res.data.recentBids || []
    fatigueAlerts.value = res.data.fatigueAlerts || []
  } catch {}
}

async function loadDecisions() {
  try {
    decisionPage.value = 1
    const res = await request.get('/ai-engine/dashboard/decisions', { params: { ...decisionFilter, page: 1, page_size: 20 } })
    decisions.value = res.data.list || []
    decisionTotal.value = res.data.total || 0
  } catch {}
}

async function loadMoreDecisions() {
  try {
    decisionPage.value++
    const res = await request.get('/ai-engine/dashboard/decisions', { params: { ...decisionFilter, page: decisionPage.value, page_size: 20 } })
    decisions.value.push(...(res.data.list || []))
  } catch {}
}

async function loadRules() {
  try {
    const res = await request.get('/ai-engine/rules/list')
    rules.value = res.data || []
  } catch {}
}

async function loadTemplates() {
  try {
    const res = await request.get('/ai-engine/rules/templates')
    ruleTemplates.value = res.data || []
  } catch {}
}

async function createFromTemplate(tpl) {
  try {
    await request.post('/ai-engine/rules/create', {
      platform: tpl.config.platform || 'all',
      rule_name: tpl.name,
      rule_type: tpl.type,
      rule_config: tpl.config,
    })
    message.success('规则创建成功')
    showTemplates.value = false
    loadRules()
  } catch {}
}

async function toggleRule(r) {
  try {
    await request.post(`/ai-engine/rules/toggle/${r.id}`)
    r.is_active = r.is_active ? 0 : 1
  } catch {}
}

async function deleteRule(id) {
  try {
    await request.delete(`/ai-engine/rules/${id}`)
    rules.value = rules.value.filter(r => r.id !== id)
    message.success('已删除')
  } catch {}
}

async function toggleEngine() {
  try {
    const action = engineRunning.value ? 'stop' : 'start'
    await request.post(`/ai-engine/${action}`)
    engineRunning.value = !engineRunning.value
    message.success(engineRunning.value ? '引擎已启动' : '引擎已停止')
  } catch {}
}

// 模拟器
async function runBidSim() {
  simLoading.value = true
  try {
    const res = await request.post('/ai-engine/dashboard/simulate-bid', simBid)
    simBidResult.value = res.data
  } catch {} finally { simLoading.value = false }
}

async function runColdSim() {
  simLoading.value = true
  try {
    const res = await request.post('/ai-engine/dashboard/simulate-coldstart', {
      platform: simCold.platform,
      adgroup: {
        createTime: simCold.createTime || new Date(Date.now() - 48 * 3600000).toISOString(),
        totalConversions: simCold.totalConversions,
        totalImpressions: 10000,
        totalCost: 500,
        currentBid: simCold.currentBid,
        dailyBudget: 300,
      },
    })
    simColdResult.value = res.data
  } catch {} finally { simLoading.value = false }
}

async function runBudgetSim() {
  simLoading.value = true
  try {
    const res = await request.post('/ai-engine/dashboard/simulate-budget', simBudget)
    simBudgetResult.value = res.data
  } catch {} finally { simLoading.value = false }
}

onMounted(() => {
  loadStatus()
  loadOverview()
  loadDecisions()
  loadRules()
  loadTemplates()
})
</script>

<style scoped>
/* ===== 深空蓝主题 ===== */
.ai-engine {
  min-height: 100vh;
  background: #0F1923;
  color: #E0E6ED;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'PingFang SC', sans-serif;
  padding-bottom: 40px;
}

/* Hero */
.hero {
  position: relative;
  background: linear-gradient(135deg, #0D1B2A 0%, #1B2838 100%);
  padding: 20px 16px 16px;
  overflow: hidden;
}
.hero-glow {
  position: absolute;
  top: -40px; right: -40px;
  width: 160px; height: 160px;
  background: radial-gradient(circle, rgba(0,229,255,0.15) 0%, transparent 70%);
  pointer-events: none;
}
.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.hero-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}
.hero-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}
.badge-on {
  background: rgba(0,229,255,0.15);
  color: #00E5FF;
  border: 1px solid rgba(0,229,255,0.3);
}
.badge-off {
  background: rgba(255,107,53,0.15);
  color: #FF6B35;
  border: 1px solid rgba(255,107,53,0.3);
}
.badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.badge-on .badge-dot {
  background: #00E5FF;
  box-shadow: 0 0 6px #00E5FF;
  animation: pulse 2s infinite;
}
.badge-off .badge-dot { background: #FF6B35; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.hero-metrics {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 14px 8px;
}
.hm-item {
  flex: 1;
  text-align: center;
}
.hm-val {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.hm-val.anomaly { color: #FF6B35; }
.hm-val.platform-count { color: #00E5FF; }
.hm-label {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  margin-top: 2px;
}
.hm-divider {
  width: 1px;
  height: 28px;
  background: rgba(255,255,255,0.08);
}
.hero-time {
  text-align: center;
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  margin-top: 10px;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  background: #0D1B2A;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  position: sticky;
  top: 0;
  z-index: 10;
}
.tab-item {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 13px;
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  position: relative;
  transition: color 0.3s;
}
.tab-item.active {
  color: #00E5FF;
  font-weight: 600;
}
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 2px;
  background: #00E5FF;
  border-radius: 1px;
  box-shadow: 0 0 8px rgba(0,229,255,0.5);
}

.tab-content {
  padding: 12px 16px;
}

/* Platform Cards */
.platform-cards {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.pf-card {
  min-width: 140px;
  flex: 1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}
.pf-card:active { transform: scale(0.97); }
.pf-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.pf-name { font-size: 13px; font-weight: 600; color: #fff; }
.pf-code { font-size: 10px; color: rgba(255,255,255,0.25); }
.pf-card-stats {
  display: flex;
  gap: 8px;
}
.pf-stat { text-align: center; flex: 1; }
.pf-stat-val { font-size: 16px; font-weight: 700; color: #fff; display: block; }
.pf-stat-val.warn { color: #FF6B35; }
.pf-stat-val.accent { color: #A78BFA; }
.pf-stat-label { font-size: 10px; color: rgba(255,255,255,0.35); }
.pf-glow-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
}
.glow-qianchuan { background: linear-gradient(90deg, #1A6CFF, #00E5FF); box-shadow: 0 0 10px rgba(26,108,255,0.5); }
.glow-kuaishou { background: linear-gradient(90deg, #FF6B35, #FFB800); box-shadow: 0 0 10px rgba(255,107,53,0.5); }
.glow-adq { background: linear-gradient(90deg, #00E5FF, #00B96B); box-shadow: 0 0 10px rgba(0,229,255,0.5); }

/* Section */
.section { margin-top: 16px; }
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  margin-bottom: 10px;
}
.empty-hint {
  text-align: center;
  color: rgba(255,255,255,0.2);
  font-size: 13px;
  padding: 24px 0;
}

/* Alert Items */
.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
  margin-bottom: 8px;
  border-left: 3px solid transparent;
}
.alert-critical { border-left-color: #FF4D4F; }
.alert-warning { border-left-color: #FF8A00; }
.alert-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
  margin-top: 2px;
}
.alert-critical .alert-badge { background: rgba(255,77,79,0.15); color: #FF4D4F; }
.alert-warning .alert-badge { background: rgba(255,138,0,0.15); color: #FF8A00; }
.alert-msg { font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5; }
.alert-meta { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 4px; }

/* Bid Items */
.bid-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
  margin-bottom: 8px;
}
.bid-direction {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.bid-up { background: rgba(0,229,255,0.12); color: #00E5FF; }
.bid-down { background: rgba(0,185,107,0.12); color: #00B96B; }
.bid-body { flex: 1; }
.bid-change { font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 500; }
.bid-meta { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px; }
.bid-pct { font-size: 13px; font-weight: 700; }
.pct-up { color: #00E5FF; }
.pct-down { color: #00B96B; }

/* Fatigue Items */
.fatigue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
  margin-bottom: 8px;
}
.fatigue-score {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}
.fatigue-critical { background: rgba(255,77,79,0.15); color: #FF4D4F; }
.fatigue-warn { background: rgba(255,138,0,0.15); color: #FF8A00; }
.fatigue-ok { background: rgba(0,229,255,0.1); color: #00E5FF; }
.fatigue-body { flex: 1; }
.fatigue-msg { font-size: 13px; color: rgba(255,255,255,0.8); }
.fatigue-meta { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px; }

/* Decisions */
.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.ds-select {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: #E0E6ED;
  padding: 8px 10px;
  font-size: 13px;
  -webkit-appearance: none;
}
.ds-select option { background: #1B2838; color: #E0E6ED; }

.decision-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
}
.dc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.dc-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.dc-bid_adjust { background: rgba(0,229,255,0.12); color: #00E5FF; }
.dc-creative_rotate { background: rgba(167,139,250,0.15); color: #A78BFA; }
.dc-budget_pace { background: rgba(0,185,107,0.12); color: #00B96B; }
.dc-anomaly_alert { background: rgba(255,77,79,0.12); color: #FF4D4F; }
.dc-cold_start { background: rgba(255,184,0,0.12); color: #FFB800; }
.dc-time { font-size: 11px; color: rgba(255,255,255,0.3); }
.dc-platform { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 4px; }
.dc-detail { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.5; }
.dc-exec {
  font-size: 11px;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
}
.exec-done { background: rgba(0,185,107,0.1); color: #00B96B; }
.exec-pending { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); }

.load-more {
  text-align: center;
  color: #00E5FF;
  font-size: 13px;
  padding: 12px;
  cursor: pointer;
}

/* Rules */
.rules-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.ds-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: #00E5FF;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.ds-btn:active { transform: scale(0.96); }
.ds-btn.primary {
  background: linear-gradient(135deg, #1A6CFF, #00B4D8);
  border: none;
  color: #fff;
  font-weight: 600;
  width: 100%;
  padding: 12px;
  margin-top: 12px;
}
.ds-btn.primary:disabled { opacity: 0.5; }

.rule-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
}
.rule-head { display: flex; justify-content: space-between; align-items: center; }
.rule-name { font-size: 14px; font-weight: 600; color: #fff; }
.rule-switch {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.sw-on { background: rgba(0,229,255,0.15); color: #00E5FF; }
.sw-off { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }
.rule-type { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }
.rule-actions { margin-top: 8px; }
.rule-del { font-size: 12px; color: #FF4D4F; cursor: pointer; }

/* Modal */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.modal-body {
  background: #1B2838;
  border-radius: 16px 16px 0 0;
  padding: 20px 16px 32px;
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  overflow-y: auto;
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16px;
  text-align: center;
}
.modal-close { width: 100%; margin-top: 16px; }

.tpl-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}
.tpl-card:active { border-color: #00E5FF; }
.tpl-name { font-size: 14px; font-weight: 600; color: #fff; }
.tpl-desc { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px; line-height: 1.5; }
.tpl-type { font-size: 11px; color: #00E5FF; margin-top: 6px; }

/* Simulator */
.sim-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.sim-tabs span {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.2s;
}
.sim-tabs span.active {
  background: rgba(0,229,255,0.12);
  color: #00E5FF;
}

.sim-panel { /* card style */ }
.sim-field {
  margin-bottom: 12px;
}
.sim-field label {
  display: block;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 4px;
}
.ds-input {
  width: 100%;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: #E0E6ED;
  padding: 10px 12px;
  font-size: 14px;
  box-sizing: border-box;
  -webkit-appearance: none;
}
.ds-input:focus { border-color: #00E5FF; outline: none; box-shadow: 0 0 0 2px rgba(0,229,255,0.1); }

.sim-result {
  margin-top: 16px;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.12);
  border-radius: 12px;
  padding: 14px;
}
.sim-result-title {
  font-size: 13px;
  font-weight: 600;
  color: #00E5FF;
  margin-bottom: 10px;
}
.sim-kv {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.sim-kv span { color: rgba(255,255,255,0.5); }
.sim-kv strong { color: #fff; font-weight: 600; }
.val-up { color: #00E5FF !important; }
.val-down { color: #00B96B !important; }

.phase-tag {
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.phase-exploring { background: rgba(255,184,0,0.15); color: #FFB800; }
.phase-accelerating { background: rgba(0,229,255,0.12); color: #00E5FF; }
.phase-graduated { background: rgba(0,185,107,0.12); color: #00B96B; }
.phase-failed { background: rgba(255,77,79,0.12); color: #FF4D4F; }

.pace-tag {
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.pace-normal { background: rgba(0,185,107,0.12); color: #00B96B; }
.pace-overspend { background: rgba(255,77,79,0.12); color: #FF4D4F; }
.pace-underspend { background: rgba(255,184,0,0.15); color: #FFB800; }

.sim-advice {
  margin-top: 10px;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
  padding: 10px 12px;
}
.sim-advice-title {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 6px;
}
.sim-advice-item {
  font-size: 13px;
  color: rgba(255,255,255,0.75);
  line-height: 1.8;
  padding-left: 12px;
  position: relative;
}
.sim-advice-item::before {
  content: '›';
  position: absolute;
  left: 0;
  color: #00E5FF;
}

/* ===== 桌面端适配 ===== */
@media (min-width: 768px) {
  .ai-engine {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px 40px;
  }
  .hero {
    border-radius: 0 0 16px 16px;
    padding: 28px 24px 20px;
  }
  .hero-metrics { padding: 18px 24px; }
  .hm-val { font-size: 28px; }
  .tab-bar {
    border-radius: 12px;
    margin-top: 12px;
    background: rgba(13,27,42,0.95);
  }
  .tab-content { padding: 16px 0; }
  .platform-cards { gap: 14px; }
  .pf-card { min-width: 180px; padding: 16px; }
  .modal-mask { align-items: center; }
  .modal-body {
    border-radius: 16px;
    max-width: 520px;
    max-height: 80vh;
  }
  .filter-row { max-width: 400px; }
  .sim-panel { max-width: 480px; }
}
</style>
