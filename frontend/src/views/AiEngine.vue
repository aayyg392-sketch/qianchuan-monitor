<template>
  <div class="cmd-center" ref="cmdCenter">
    <!-- 扫描线 + 网格背景 -->
    <div class="bg-grid"></div>
    <div class="scan-line"></div>
    <div class="particles" ref="particlesEl"></div>

    <!-- ===== 顶部指挥栏 ===== -->
    <header class="cmd-header">
      <div class="hdr-left">
        <div class="hdr-logo">
          <div class="logo-ring" :class="{ spinning: engineRunning }">
            <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" /></svg>
          </div>
          <div class="logo-core" :class="{ active: engineRunning }"></div>
        </div>
        <div class="hdr-titles">
          <h1>AI<span class="accent">自动化</span>腾讯ADQ指挥大屏</h1>
          <div class="hdr-sub">INTELLIGENT ADQ COMMAND CENTER</div>
        </div>
      </div>
      <div class="hdr-right">
        <div class="hdr-time">{{ currentTime }}</div>
        <button class="engine-btn" :class="{ on: engineRunning }" @click="toggleEngine">
          <span class="ebtn-dot"></span>
          {{ engineRunning ? 'ENGINE ON' : 'ENGINE OFF' }}
        </button>
      </div>
    </header>

    <!-- ===== 核心指标条 ===== -->
    <div class="metrics-bar">
      <div class="metric-box" v-for="m in coreMetrics" :key="m.key">
        <div class="mbox-glow" :style="{ background: m.color }"></div>
        <div class="mbox-val" :style="{ color: m.color }">{{ m.value }}</div>
        <div class="mbox-label">{{ m.label }}</div>
        <div class="mbox-corner tl"></div><div class="mbox-corner tr"></div>
        <div class="mbox-corner bl"></div><div class="mbox-corner br"></div>
      </div>
    </div>

    <!-- ===== 主指挥区域 ===== -->
    <div class="cmd-body">
      <!-- 左面板 -->
      <div class="panel panel-left">
        <!-- ADQ账户接管 -->
        <div class="hud-card">
          <div class="hud-title"><span class="ht-dot"></span>ADQ账户AI接管</div>
          <div class="account-list" v-if="adqAccounts.length">
            <div class="acc-row" v-for="acc in adqAccounts" :key="acc.id" @click="toggleAiTakeover(acc)">
              <div class="acc-info">
                <div class="acc-name">{{ acc.account_name || acc.app_id || '账户' + acc.id }}</div>
                <div class="acc-id">ID: {{ acc.account_id || acc.id }}</div>
              </div>
              <div class="acc-switch" :class="{ 'sw-active': acc.aiEnabled }">
                <div class="sw-track"><div class="sw-thumb"></div></div>
                <span>{{ acc.aiEnabled ? 'AI接管中' : '手动' }}</span>
              </div>
            </div>
          </div>
          <div class="empty-state" v-else>暂无ADQ账户</div>
        </div>

        <!-- 异常告警 -->
        <div class="hud-card">
          <div class="hud-title"><span class="ht-dot alert"></span>异常预警</div>
          <div v-if="!recentAnomalies.length" class="empty-state">系统正常运行</div>
          <div v-for="(a, i) in recentAnomalies.slice(0, 5)" :key="i" class="alert-row" :class="'severity-' + getSeverity(a)">
            <div class="alert-indicator">
              <div class="alert-pulse"></div>
            </div>
            <div class="alert-content">
              <div class="alert-msg">{{ getAlertMsg(a) }}</div>
              <div class="alert-time">{{ fmtTime(a.created_at) }}</div>
            </div>
            <div class="alert-level">{{ getSeverity(a) === 'critical' ? 'CRITICAL' : 'WARN' }}</div>
          </div>
        </div>
      </div>

      <!-- 中央雷达区 -->
      <div class="panel panel-center">
        <div class="radar-container">
          <div class="radar-outer">
            <svg viewBox="0 0 300 300" class="radar-svg">
              <!-- 同心圆 -->
              <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(0,229,255,0.08)" stroke-width="1"/>
              <circle cx="150" cy="150" r="105" fill="none" stroke="rgba(0,229,255,0.06)" stroke-width="1"/>
              <circle cx="150" cy="150" r="70" fill="none" stroke="rgba(0,229,255,0.04)" stroke-width="1"/>
              <circle cx="150" cy="150" r="35" fill="none" stroke="rgba(0,229,255,0.03)" stroke-width="1"/>
              <!-- 十字线 -->
              <line x1="150" y1="10" x2="150" y2="290" stroke="rgba(0,229,255,0.06)" stroke-width="0.5"/>
              <line x1="10" y1="150" x2="290" y2="150" stroke="rgba(0,229,255,0.06)" stroke-width="0.5"/>
              <line x1="50" y1="50" x2="250" y2="250" stroke="rgba(0,229,255,0.03)" stroke-width="0.5"/>
              <line x1="250" y1="50" x2="50" y2="250" stroke="rgba(0,229,255,0.03)" stroke-width="0.5"/>
              <!-- 扫描扇区 -->
              <path v-if="engineRunning" class="radar-sweep" d="M150,150 L150,10 A140,140 0 0,1 248,52 Z" fill="url(#sweepGrad)"/>
              <defs>
                <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="rgba(0,229,255,0)" />
                  <stop offset="100%" stop-color="rgba(0,229,255,0.15)" />
                </linearGradient>
              </defs>
              <!-- 数据点 -->
              <circle v-for="(dot, i) in radarDots" :key="i" :cx="dot.x" :cy="dot.y" :r="dot.r" :fill="dot.color" class="radar-dot" :style="{ animationDelay: dot.delay }"/>
            </svg>
          </div>
          <!-- 中心状态 -->
          <div class="radar-core">
            <div class="core-ring" :class="{ active: engineRunning }"></div>
            <div class="core-text">
              <div class="core-status" :class="engineRunning ? 'status-on' : 'status-off'">
                {{ engineRunning ? 'SCANNING' : 'STANDBY' }}
              </div>
              <div class="core-num">{{ engineStatus.total_decisions || 0 }}</div>
              <div class="core-label">DECISIONS</div>
            </div>
          </div>
        </div>

        <!-- 雷达下方 - 引擎状态 -->
        <div class="engine-stats">
          <div class="estat" v-for="s in engineStatsList" :key="s.label">
            <div class="estat-bar">
              <div class="estat-fill" :style="{ width: s.pct + '%', background: s.color }"></div>
            </div>
            <div class="estat-info">
              <span class="estat-label">{{ s.label }}</span>
              <span class="estat-val" :style="{ color: s.color }">{{ s.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右面板 -->
      <div class="panel panel-right">
        <!-- 实时决策流 -->
        <div class="hud-card">
          <div class="hud-title"><span class="ht-dot"></span>实时决策流</div>
          <div v-if="!recentDecisions.length" class="empty-state">等待AI决策...</div>
          <div v-for="d in recentDecisions.slice(0, 8)" :key="d.id" class="decision-row">
            <div class="drow-type" :class="'dtype-' + d.decision_type">
              {{ typeIcon(d.decision_type) }}
            </div>
            <div class="drow-body">
              <div class="drow-msg">{{ summarizeDecision(d) }}</div>
              <div class="drow-time">{{ fmtTime(d.created_at) }}</div>
            </div>
            <div class="drow-status" :class="d.executed ? 'exec-ok' : 'exec-wait'">
              {{ d.executed ? 'DONE' : 'WAIT' }}
            </div>
          </div>
        </div>

        <!-- 出价调整 -->
        <div class="hud-card">
          <div class="hud-title"><span class="ht-dot bid"></span>出价调整</div>
          <div v-if="!recentBids.length" class="empty-state">暂无调价</div>
          <div v-for="(b, i) in recentBids.slice(0, 5)" :key="i" class="bid-row">
            <div class="bid-arrow" :class="getBidDirection(b) > 0 ? 'arrow-up' : 'arrow-down'">
              {{ getBidDirection(b) > 0 ? '&#9650;' : '&#9660;' }}
            </div>
            <div class="bid-info">
              <div class="bid-change">{{ getBidFrom(b) }} <span class="bid-to">&rarr;</span> {{ getBidTo(b) }}</div>
              <div class="bid-time">{{ fmtTime(b.created_at) }}</div>
            </div>
            <div class="bid-pct" :class="getBidDirection(b) > 0 ? 'pct-up' : 'pct-dn'">
              {{ getBidDirection(b) > 0 ? '+' : '' }}{{ (getBidDirection(b) * 100).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 底部Tab区域（策略/模拟/记录）===== -->
    <div class="bottom-section">
      <div class="btab-bar">
        <div class="btab" :class="{ active: activeTab === 'rules' }" @click="activeTab = 'rules'">
          <span class="btab-icon">&#9881;</span>策略规则
        </div>
        <div class="btab" :class="{ active: activeTab === 'decisions' }" @click="activeTab = 'decisions'">
          <span class="btab-icon">&#9783;</span>决策记录
        </div>
        <div class="btab" :class="{ active: activeTab === 'simulator' }" @click="activeTab = 'simulator'">
          <span class="btab-icon">&#9881;</span>模拟测试
        </div>
      </div>

      <!-- 策略规则 -->
      <div v-show="activeTab === 'rules'" class="btab-content">
        <div class="rules-toolbar">
          <button class="neon-btn" @click="showTemplates = true">+ 从模板创建</button>
        </div>
        <div v-if="!rules.length" class="empty-state">暂无策略，点击上方按钮创建</div>
        <div class="rules-grid">
          <div v-for="r in rules" :key="r.id" class="rule-item">
            <div class="ri-head">
              <span class="ri-name">{{ r.rule_name }}</span>
              <span class="ri-toggle" :class="r.is_active ? 'tog-on' : 'tog-off'" @click="toggleRule(r)">
                {{ r.is_active ? 'ON' : 'OFF' }}
              </span>
            </div>
            <div class="ri-type">{{ typeLabel(r.rule_type) }}</div>
            <div class="ri-del" @click="deleteRule(r.id)">DELETE</div>
          </div>
        </div>
      </div>

      <!-- 决策记录 -->
      <div v-show="activeTab === 'decisions'" class="btab-content">
        <div class="filter-bar">
          <select v-model="decisionFilter.type" class="hud-select" @change="loadDecisions">
            <option value="">全部类型</option>
            <option value="bid_adjust">出价调整</option>
            <option value="creative_rotate">素材轮换</option>
            <option value="budget_pace">预算控制</option>
            <option value="anomaly_alert">异常告警</option>
            <option value="cold_start">冷启动</option>
          </select>
        </div>
        <div v-if="!decisions.length" class="empty-state">暂无决策记录</div>
        <div class="decision-table">
          <div v-for="d in decisions" :key="d.id" class="dtable-row">
            <span class="dt-type" :class="'dtype-' + d.decision_type">{{ typeLabel(d.decision_type) }}</span>
            <span class="dt-detail">{{ summarizeDecision(d) }}</span>
            <span class="dt-time">{{ fmtTime(d.created_at) }}</span>
            <span class="dt-exec" :class="d.executed ? 'exec-ok' : 'exec-wait'">{{ d.executed ? 'DONE' : 'WAIT' }}</span>
          </div>
        </div>
        <div class="load-more" v-if="decisions.length && decisionTotal > decisions.length" @click="loadMoreDecisions">LOAD MORE</div>
      </div>

      <!-- 模拟测试 -->
      <div v-show="activeTab === 'simulator'" class="btab-content">
        <div class="sim-mode-bar">
          <span :class="{ active: simMode === 'bid' }" @click="simMode = 'bid'">PID调价</span>
          <span :class="{ active: simMode === 'coldstart' }" @click="simMode = 'coldstart'">冷启动</span>
          <span :class="{ active: simMode === 'budget' }" @click="simMode = 'budget'">预算匀速</span>
        </div>

        <div v-if="simMode === 'bid'" class="sim-form">
          <div class="sf-row">
            <label>当前出价</label>
            <input v-model.number="simBid.currentBid" type="number" class="hud-input" placeholder="5.0">
          </div>
          <div class="sf-row">
            <label>目标ROI</label>
            <input v-model.number="simBid.targetROI" type="number" class="hud-input" placeholder="2.0">
          </div>
          <div class="sf-row">
            <label>实际ROI</label>
            <input v-model.number="simBid.actualROI" type="number" class="hud-input" placeholder="1.2">
          </div>
          <button class="neon-btn primary" @click="runBidSim" :disabled="simLoading">RUN SIMULATION</button>
          <div v-if="simBidResult" class="sim-output">
            <div class="so-title">PID OUTPUT</div>
            <div class="so-row"><span>建议出价</span><strong :class="simBidResult.adjustment > 0 ? 'val-up' : 'val-dn'">{{ simBidResult.newBid }}</strong></div>
            <div class="so-row"><span>调整幅度</span><strong>{{ (simBidResult.adjustment * 100).toFixed(1) }}%</strong></div>
            <div class="so-row"><span>P/I/D</span><strong>{{ simBidResult.detail?.proportional }} / {{ simBidResult.detail?.integral }} / {{ simBidResult.detail?.derivative }}</strong></div>
          </div>
        </div>

        <div v-if="simMode === 'coldstart'" class="sim-form">
          <div class="sf-row">
            <label>创建时间</label>
            <input v-model="simCold.createTime" type="datetime-local" class="hud-input">
          </div>
          <div class="sf-row">
            <label>累计转化</label>
            <input v-model.number="simCold.totalConversions" type="number" class="hud-input" placeholder="8">
          </div>
          <div class="sf-row">
            <label>当前出价</label>
            <input v-model.number="simCold.currentBid" type="number" class="hud-input" placeholder="5.0">
          </div>
          <button class="neon-btn primary" @click="runColdSim" :disabled="simLoading">RUN SIMULATION</button>
          <div v-if="simColdResult" class="sim-output">
            <div class="so-title">COLD START ANALYSIS</div>
            <div class="so-row"><span>阶段</span><strong class="phase-tag" :class="'phase-' + simColdResult.phase">{{ phaseLabel(simColdResult.phase) }}</strong></div>
            <div class="so-row"><span>转化进度</span><strong>{{ (simColdResult.progress * 100).toFixed(0) }}%</strong></div>
            <div class="so-row"><span>剩余时间</span><strong>{{ simColdResult.hoursRemaining }}h</strong></div>
            <div v-if="simColdResult.strategy" class="so-advice">
              <div v-for="(act, i) in simColdResult.strategy.actions" :key="i" class="so-advice-item">{{ act }}</div>
            </div>
          </div>
        </div>

        <div v-if="simMode === 'budget'" class="sim-form">
          <div class="sf-row">
            <label>日预算</label>
            <input v-model.number="simBudget.dailyBudget" type="number" class="hud-input" placeholder="1000">
          </div>
          <div class="sf-row">
            <label>已花费</label>
            <input v-model.number="simBudget.spentToday" type="number" class="hud-input" placeholder="350">
          </div>
          <div class="sf-row">
            <label>当前小时</label>
            <input v-model.number="simBudget.currentHour" type="number" class="hud-input" min="0" max="23">
          </div>
          <button class="neon-btn primary" @click="runBudgetSim" :disabled="simLoading">RUN SIMULATION</button>
          <div v-if="simBudgetResult" class="sim-output">
            <div class="so-title">BUDGET PACING</div>
            <div class="so-row"><span>状态</span><strong class="pace-tag" :class="'pace-' + simBudgetResult.status">{{ paceLabel(simBudgetResult.status) }}</strong></div>
            <div class="so-row"><span>理想消耗</span><strong>{{ simBudgetResult.idealSpent }}</strong></div>
            <div class="so-row"><span>偏差</span><strong>{{ (simBudgetResult.deviation * 100).toFixed(1) }}%</strong></div>
            <div v-if="simBudgetResult.action" class="so-advice">
              <div class="so-advice-item">{{ simBudgetResult.action.message }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板弹窗 -->
    <div class="modal-overlay" v-if="showTemplates" @click.self="showTemplates = false">
      <div class="modal-hud">
        <div class="modal-hud-title">RULE TEMPLATES</div>
        <div v-for="(t, i) in ruleTemplates" :key="i" class="tpl-row" @click="createFromTemplate(t)">
          <div class="tpl-name">{{ t.name }}</div>
          <div class="tpl-desc">{{ t.description }}</div>
        </div>
        <button class="neon-btn" @click="showTemplates = false" style="width:100%;margin-top:16px">CLOSE</button>
      </div>
    </div>

    <!-- 返回按钮 -->
    <router-link to="/dashboard" class="back-btn">&#9664; 返回系统</router-link>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import dayjs from 'dayjs'

// ---- 状态 ----
const cmdCenter = ref(null)
const particlesEl = ref(null)
const activeTab = ref('rules')
const engineRunning = ref(false)
const engineStatus = ref({})
const todayAnomalies = ref(0)
const adqAccounts = ref([])
const recentAnomalies = ref([])
const recentBids = ref([])
const recentDecisions = ref([])
const fatigueAlerts = ref([])
const currentTime = ref('')
let timeTimer = null

// 决策记录
const decisions = ref([])
const decisionTotal = ref(0)
const decisionPage = ref(1)
const decisionFilter = reactive({ platform: 'adq', type: '' })

// 规则
const rules = ref([])
const ruleTemplates = ref([])
const showTemplates = ref(false)

// 模拟器
const simMode = ref('bid')
const simLoading = ref(false)
const simBid = reactive({ platform: 'adq', currentBid: 5, targetROI: 2.0, actualROI: 1.2 })
const simBidResult = ref(null)
const simCold = reactive({ platform: 'adq', createTime: '', totalConversions: 8, currentBid: 5 })
const simColdResult = ref(null)
const simBudget = reactive({ platform: 'adq', dailyBudget: 1000, spentToday: 350, currentHour: new Date().getHours() })
const simBudgetResult = ref(null)

// ---- 计算属性 ----
const coreMetrics = computed(() => [
  { key: 'decisions', label: 'AI决策总数', value: engineStatus.value.total_decisions || 0, color: '#00E5FF' },
  { key: 'anomalies', label: '异常告警', value: todayAnomalies.value, color: '#FF4D4F' },
  { key: 'duration', label: '巡检耗时', value: fmtDuration(engineStatus.value.last_run_duration_ms), color: '#00FF88' },
  { key: 'accounts', label: 'AI接管账户', value: adqAccounts.value.filter(a => a.aiEnabled).length, color: '#A78BFA' },
])

const engineStatsList = computed(() => {
  const total = engineStatus.value.total_decisions || 0
  const anomalies = todayAnomalies.value
  const bids = recentBids.value.length
  const fatigue = fatigueAlerts.value.length
  const max = Math.max(total, 1)
  return [
    { label: 'AI DECISIONS', value: total, pct: Math.min(100, (total / Math.max(max, 20)) * 100), color: '#00E5FF' },
    { label: 'ANOMALIES', value: anomalies, pct: Math.min(100, (anomalies / Math.max(total, 1)) * 100), color: '#FF4D4F' },
    { label: 'BID ADJUSTS', value: bids, pct: Math.min(100, (bids / Math.max(total, 1)) * 100), color: '#00FF88' },
    { label: 'FATIGUE ALERTS', value: fatigue, pct: Math.min(100, (fatigue / Math.max(total, 1)) * 100), color: '#FFB800' },
  ]
})

const radarDots = computed(() => {
  const dots = []
  const items = [...recentBids.value.slice(0, 5), ...recentAnomalies.value.slice(0, 5)]
  items.forEach((_, i) => {
    const angle = (i / Math.max(items.length, 1)) * Math.PI * 2 + Math.random() * 0.5
    const dist = 40 + Math.random() * 90
    dots.push({
      x: 150 + Math.cos(angle) * dist,
      y: 150 + Math.sin(angle) * dist,
      r: 2 + Math.random() * 3,
      color: i < recentBids.value.length ? '#00E5FF' : '#FF4D4F',
      delay: (i * 0.3) + 's',
    })
  })
  return dots
})

// ---- 工具函数 ----
function fmtTime(t) {
  if (!t) return ''
  return dayjs(t).format('MM-DD HH:mm')
}

function fmtDuration(ms) {
  if (!ms) return '--'
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'
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
    return d?.anomalies?.[0]?.message || d?.adName || '异常检测'
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
    return (d?.currentBid || 0).toFixed(2)
  } catch { return '--' }
}
function getBidTo(b) {
  try {
    const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data
    return (d?.newBid || 0).toFixed(2)
  } catch { return '--' }
}

function typeLabel(t) {
  const m = { bid_adjust: '出价调整', bid: '出价规则', creative_rotate: '素材轮换', creative: '素材规则', budget_pace: '预算控制', budget: '预算规则', anomaly_alert: '异常告警', alert: '告警规则', cold_start: '冷启动', ai_takeover: 'AI接管' }
  return m[t] || t
}

function typeIcon(t) {
  const m = { bid_adjust: '$', creative_rotate: '~', budget_pace: '%', anomaly_alert: '!', cold_start: '*' }
  return m[t] || '>'
}

function phaseLabel(p) {
  const m = { exploring: '探索期', accelerating: '加速期', graduated: '已毕业', failed: '失败' }
  return m[p] || p
}

function paceLabel(s) {
  const m = { normal: '正常', overspend: '超速', underspend: '偏慢' }
  return m[s] || s
}

function summarizeDecision(d) {
  try {
    const data = typeof d.decision_data === 'string' ? JSON.parse(d.decision_data) : d.decision_data
    if (d.decision_type === 'bid_adjust') return `${data.adName || ''} 出价 ${data.currentBid} -> ${data.newBid}`
    if (d.decision_type === 'creative_rotate') return data.suggestion || `疲劳度${data.score}`
    if (d.decision_type === 'budget_pace') return data.action?.message || `偏差${((data.deviation || 0) * 100).toFixed(1)}%`
    if (d.decision_type === 'anomaly_alert') return data.anomalies?.[0]?.message || data.adName || '异常'
    return JSON.stringify(data).slice(0, 60)
  } catch { return '' }
}

function updateTime() {
  currentTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}

// ---- API ----
async function loadStatus() {
  try {
    const res = await request.get('/ai-engine/dashboard/status')
    engineStatus.value = res.data.engine || {}
    engineRunning.value = !!engineStatus.value.is_running
    todayAnomalies.value = res.data.todayAnomalies || 0
  } catch {}
}

async function loadOverview() {
  try {
    const res = await request.get('/ai-engine/dashboard/overview')
    recentAnomalies.value = res.data.recentAnomalies || []
    recentBids.value = res.data.recentBids || []
    fatigueAlerts.value = res.data.fatigueAlerts || []
  } catch {}
}

async function loadRecentDecisions() {
  try {
    const res = await request.get('/ai-engine/dashboard/decisions', { params: { platform: 'adq', page: 1, page_size: 10 } })
    recentDecisions.value = res.data.list || []
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

async function loadAdqAccounts() {
  try {
    const res = await request.get('/adq/accounts')
    const accounts = res.data || []
    // 查询哪些账户已开启AI接管
    const rulesRes = await request.get('/ai-engine/rules/list')
    const aiRules = (rulesRes.data || []).filter(r => r.rule_type === 'ai_takeover' && r.is_active)
    const aiAccountIds = new Set(aiRules.map(r => {
      const cfg = typeof r.rule_config === 'string' ? JSON.parse(r.rule_config) : r.rule_config
      return String(cfg?.accountDbId || '')
    }))
    adqAccounts.value = accounts.map(a => ({
      ...a,
      aiEnabled: aiAccountIds.has(String(a.id)),
    }))
  } catch {}
}

async function toggleAiTakeover(acc) {
  try {
    if (acc.aiEnabled) {
      // 关闭：找到对应规则并删除
      const rulesRes = await request.get('/ai-engine/rules/list')
      const rule = (rulesRes.data || []).find(r => {
        if (r.rule_type !== 'ai_takeover') return false
        const cfg = typeof r.rule_config === 'string' ? JSON.parse(r.rule_config) : r.rule_config
        return String(cfg?.accountDbId) === String(acc.id)
      })
      if (rule) await request.delete(`/ai-engine/rules/${rule.id}`)
      acc.aiEnabled = false
      message.success('已关闭AI接管')
    } else {
      // 开启：创建ai_takeover规则
      await request.post('/ai-engine/rules/create', {
        platform: 'adq',
        rule_name: `AI接管-${acc.account_name || acc.id}`,
        rule_type: 'ai_takeover',
        rule_config: {
          accountDbId: acc.id,
          accountId: acc.account_id,
          enableBidAdjust: true,
          enableMaterialRotate: true,
          enableBudgetPace: true,
          enableAnomalyAlert: true,
          targetCPA: 50,
        },
      })
      acc.aiEnabled = true
      message.success('AI接管已开启')
    }
  } catch (e) {
    message.error('操作失败')
  }
}

async function createFromTemplate(tpl) {
  try {
    await request.post('/ai-engine/rules/create', {
      platform: tpl.config?.platform || 'adq',
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
      platform: 'adq',
      adgroup: { createTime: simCold.createTime || new Date(Date.now() - 48 * 3600000).toISOString(), totalConversions: simCold.totalConversions, totalImpressions: 10000, totalCost: 500, currentBid: simCold.currentBid, dailyBudget: 300 },
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

// ---- 生命周期 ----
onMounted(() => {
  updateTime()
  timeTimer = setInterval(updateTime, 1000)
  loadStatus()
  loadOverview()
  loadRecentDecisions()
  loadDecisions()
  loadRules()
  loadTemplates()
  loadAdqAccounts()
  // 每30秒刷新
  const refreshTimer = setInterval(() => {
    loadStatus()
    loadOverview()
    loadRecentDecisions()
  }, 30000)
  onUnmounted(() => {
    clearInterval(timeTimer)
    clearInterval(refreshTimer)
  })
})
</script>

<style scoped>
/* ============================================ */
/*  AI ADQ COMMAND CENTER - SCI-FI HUD THEME    */
/* ============================================ */

@keyframes scanMove {
  0% { top: -2px; }
  100% { top: 100%; }
}
@keyframes radarSweep {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px currentColor; }
  50% { box-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dotPulse {
  0%, 100% { opacity: 0.3; r: 2; }
  50% { opacity: 1; r: 4; }
}
@keyframes ringPulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.5); opacity: 0; }
}
@keyframes logoSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.cmd-center {
  min-height: 100vh;
  background: #050a12;
  color: #c8d6e5;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
  position: relative;
  overflow-x: hidden;
}

/* 网格背景 */
.bg-grid {
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  z-index: 0;
}

/* 扫描线 */
.scan-line {
  position: fixed;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(0,229,255,0.4), transparent);
  animation: scanMove 4s linear infinite;
  z-index: 1;
  pointer-events: none;
}

.particles {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

/* ===== 顶部指挥栏 ===== */
.cmd-header {
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(180deg, rgba(5,10,18,0.95) 0%, rgba(5,10,18,0.7) 100%);
  border-bottom: 1px solid rgba(0,229,255,0.15);
}

.hdr-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hdr-logo {
  position: relative;
  width: 36px;
  height: 36px;
}
.logo-ring {
  position: absolute;
  inset: 0;
  color: #00E5FF;
}
.logo-ring.spinning {
  animation: logoSpin 8s linear infinite;
}
.logo-ring svg {
  width: 100%;
  height: 100%;
}
.logo-core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #1a2940;
  border: 1px solid #00E5FF;
}
.logo-core.active {
  background: #00E5FF;
  box-shadow: 0 0 10px #00E5FF, 0 0 20px rgba(0,229,255,0.3);
}

.hdr-titles h1 {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: 1px;
}
.hdr-titles .accent {
  color: #00E5FF;
}
.hdr-sub {
  font-size: 8px;
  color: rgba(0,229,255,0.4);
  letter-spacing: 2px;
  margin-top: 1px;
}

.hdr-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hdr-time {
  font-size: 10px;
  color: rgba(0,229,255,0.5);
  display: none;
}

.engine-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
  border: 1px solid rgba(255,77,79,0.5);
  background: rgba(255,77,79,0.1);
  color: #FF4D4F;
}
.engine-btn.on {
  border-color: rgba(0,229,255,0.5);
  background: rgba(0,229,255,0.1);
  color: #00E5FF;
}
.ebtn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #FF4D4F;
}
.engine-btn.on .ebtn-dot {
  background: #00E5FF;
  box-shadow: 0 0 8px #00E5FF;
  animation: pulse 2s infinite;
}

/* ===== 核心指标条 ===== */
.metrics-bar {
  position: relative;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 10px 16px;
}

.metric-box {
  position: relative;
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  padding: 10px 8px;
  text-align: center;
}

.mbox-glow {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40%;
  height: 1px;
  filter: blur(4px);
  opacity: 0.8;
}

.mbox-val {
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.mbox-label {
  font-size: 9px;
  color: rgba(200,214,229,0.4);
  margin-top: 2px;
  letter-spacing: 0.5px;
}

/* HUD角标 */
.mbox-corner {
  position: absolute;
  width: 6px;
  height: 6px;
  border-color: rgba(0,229,255,0.3);
  border-style: solid;
  border-width: 0;
}
.mbox-corner.tl { top: -1px; left: -1px; border-top-width: 1px; border-left-width: 1px; }
.mbox-corner.tr { top: -1px; right: -1px; border-top-width: 1px; border-right-width: 1px; }
.mbox-corner.bl { bottom: -1px; left: -1px; border-bottom-width: 1px; border-left-width: 1px; }
.mbox-corner.br { bottom: -1px; right: -1px; border-bottom-width: 1px; border-right-width: 1px; }

/* ===== 主体三栏 ===== */
.cmd-body {
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 16px;
}

.panel { width: 100%; }

/* ===== HUD卡片 ===== */
.hud-card {
  background: rgba(5,15,30,0.8);
  border: 1px solid rgba(0,229,255,0.1);
  padding: 12px;
  margin-bottom: 10px;
  position: relative;
  animation: fadeInUp 0.4s ease;
}
.hud-card::before,
.hud-card::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: rgba(0,229,255,0.25);
  border-style: solid;
  border-width: 0;
}
.hud-card::before {
  top: -1px;
  left: -1px;
  border-top-width: 1px;
  border-left-width: 1px;
}
.hud-card::after {
  bottom: -1px;
  right: -1px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

.hud-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #00E5FF;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0,229,255,0.08);
}

.ht-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00E5FF;
  box-shadow: 0 0 6px #00E5FF;
  animation: pulse 3s infinite;
}
.ht-dot.alert {
  background: #FF4D4F;
  box-shadow: 0 0 6px #FF4D4F;
}
.ht-dot.bid {
  background: #00FF88;
  box-shadow: 0 0 6px #00FF88;
}

.empty-state {
  text-align: center;
  color: rgba(200,214,229,0.2);
  font-size: 11px;
  padding: 20px 0;
  letter-spacing: 1px;
}

/* ===== 账户列表 ===== */
.account-list {
  max-height: 200px;
  overflow-y: auto;
}
.acc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer;
  transition: background 0.2s;
}
.acc-row:hover {
  background: rgba(0,229,255,0.03);
}
.acc-name {
  font-size: 12px;
  color: #fff;
}
.acc-id {
  font-size: 10px;
  color: rgba(200,214,229,0.3);
  margin-top: 2px;
}
.acc-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: rgba(200,214,229,0.4);
}
.acc-switch.sw-active {
  color: #00E5FF;
}
.sw-track {
  width: 28px;
  height: 14px;
  border-radius: 7px;
  background: rgba(255,255,255,0.1);
  position: relative;
  transition: all 0.3s;
}
.sw-active .sw-track {
  background: rgba(0,229,255,0.3);
}
.sw-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(200,214,229,0.5);
  position: absolute;
  top: 2px;
  left: 2px;
  transition: all 0.3s;
}
.sw-active .sw-thumb {
  left: 16px;
  background: #00E5FF;
  box-shadow: 0 0 6px #00E5FF;
}

/* ===== 异常行 ===== */
.alert-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.alert-indicator {
  position: relative;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}
.alert-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #FF4D4F;
}
.severity-critical .alert-pulse {
  animation: pulse 1s infinite;
  box-shadow: 0 0 8px #FF4D4F;
}
.severity-warning .alert-pulse {
  background: #FFB800;
}
.alert-content { flex: 1; min-width: 0; }
.alert-msg {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alert-time { font-size: 9px; color: rgba(200,214,229,0.25); margin-top: 1px; }
.alert-level {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 5px;
  flex-shrink: 0;
}
.severity-critical .alert-level {
  color: #FF4D4F;
  background: rgba(255,77,79,0.1);
  border: 1px solid rgba(255,77,79,0.2);
}
.severity-warning .alert-level {
  color: #FFB800;
  background: rgba(255,184,0,0.1);
  border: 1px solid rgba(255,184,0,0.2);
}

/* ===== 雷达 ===== */
.radar-container {
  position: relative;
  width: 100%;
  max-width: 280px;
  margin: 0 auto;
  aspect-ratio: 1;
}
.radar-outer {
  width: 100%;
  height: 100%;
}
.radar-svg {
  width: 100%;
  height: 100%;
}
.radar-sweep {
  transform-origin: 150px 150px;
  animation: radarSweep 4s linear infinite;
}
.radar-dot {
  animation: dotPulse 2s ease infinite;
}
.radar-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.core-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60px;
  height: 60px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.2);
}
.core-ring.active::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.15);
  animation: ringPulse 2s ease infinite;
}
.core-text {
  position: relative;
  z-index: 2;
}
.core-status {
  font-size: 8px;
  letter-spacing: 2px;
  font-weight: 700;
}
.status-on { color: #00E5FF; }
.status-off { color: #FF4D4F; }
.core-num {
  font-size: 24px;
  font-weight: 900;
  color: #fff;
  line-height: 1;
  margin: 2px 0;
}
.core-label {
  font-size: 7px;
  color: rgba(200,214,229,0.3);
  letter-spacing: 2px;
}

/* 引擎状态条 */
.engine-stats {
  margin-top: 12px;
}
.estat {
  margin-bottom: 8px;
}
.estat-bar {
  height: 3px;
  background: rgba(255,255,255,0.05);
  border-radius: 2px;
  overflow: hidden;
}
.estat-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease;
  box-shadow: 0 0 6px currentColor;
}
.estat-info {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
}
.estat-label {
  font-size: 9px;
  color: rgba(200,214,229,0.3);
  letter-spacing: 0.5px;
}
.estat-val {
  font-size: 10px;
  font-weight: 700;
}

/* ===== 决策流 ===== */
.decision-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  animation: fadeInUp 0.3s ease;
}
.drow-type {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 900;
  flex-shrink: 0;
  border: 1px solid;
}
.dtype-bid_adjust { color: #00E5FF; border-color: rgba(0,229,255,0.3); background: rgba(0,229,255,0.05); }
.dtype-creative_rotate { color: #A78BFA; border-color: rgba(167,139,250,0.3); background: rgba(167,139,250,0.05); }
.dtype-budget_pace { color: #00FF88; border-color: rgba(0,255,136,0.3); background: rgba(0,255,136,0.05); }
.dtype-anomaly_alert { color: #FF4D4F; border-color: rgba(255,77,79,0.3); background: rgba(255,77,79,0.05); }
.dtype-cold_start { color: #FFB800; border-color: rgba(255,184,0,0.3); background: rgba(255,184,0,0.05); }

.drow-body { flex: 1; min-width: 0; }
.drow-msg {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.drow-time { font-size: 9px; color: rgba(200,214,229,0.25); margin-top: 1px; }
.drow-status {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 5px;
  flex-shrink: 0;
}
.exec-ok { color: #00FF88; border: 1px solid rgba(0,255,136,0.2); background: rgba(0,255,136,0.05); }
.exec-wait { color: rgba(200,214,229,0.3); border: 1px solid rgba(200,214,229,0.1); }

/* ===== 出价行 ===== */
.bid-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.bid-arrow {
  font-size: 10px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}
.arrow-up { color: #00E5FF; }
.arrow-down { color: #00FF88; }
.bid-info { flex: 1; }
.bid-change { font-size: 11px; color: rgba(255,255,255,0.7); }
.bid-to { color: rgba(0,229,255,0.5); }
.bid-time { font-size: 9px; color: rgba(200,214,229,0.25); margin-top: 1px; }
.bid-pct { font-size: 11px; font-weight: 700; flex-shrink: 0; }
.pct-up { color: #00E5FF; }
.pct-dn { color: #00FF88; }

/* ===== 底部Tab ===== */
.bottom-section {
  position: relative;
  z-index: 5;
  margin: 10px 16px 40px;
  border: 1px solid rgba(0,229,255,0.1);
  background: rgba(5,15,30,0.8);
}

.btab-bar {
  display: flex;
  border-bottom: 1px solid rgba(0,229,255,0.08);
}
.btab {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  font-size: 11px;
  color: rgba(200,214,229,0.3);
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: all 0.3s;
  border-bottom: 2px solid transparent;
}
.btab.active {
  color: #00E5FF;
  border-bottom-color: #00E5FF;
  background: rgba(0,229,255,0.03);
}
.btab-icon {
  margin-right: 4px;
}

.btab-content {
  padding: 12px;
}

/* 规则网格 */
.rules-toolbar {
  margin-bottom: 10px;
}
.rules-grid {
  display: grid;
  gap: 8px;
}
.rule-item {
  background: rgba(0,229,255,0.02);
  border: 1px solid rgba(0,229,255,0.08);
  padding: 10px;
}
.ri-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ri-name { font-size: 12px; color: #fff; font-weight: 600; }
.ri-toggle {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 8px;
  cursor: pointer;
  letter-spacing: 0.5px;
}
.tog-on { color: #00E5FF; border: 1px solid rgba(0,229,255,0.3); background: rgba(0,229,255,0.05); }
.tog-off { color: rgba(200,214,229,0.3); border: 1px solid rgba(200,214,229,0.1); }
.ri-type { font-size: 10px; color: rgba(200,214,229,0.3); margin-top: 4px; }
.ri-del { font-size: 10px; color: #FF4D4F; cursor: pointer; margin-top: 6px; letter-spacing: 0.5px; }

/* 决策表格 */
.filter-bar { margin-bottom: 10px; }
.hud-select {
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.15);
  color: #c8d6e5;
  padding: 6px 10px;
  font-size: 11px;
  font-family: inherit;
  -webkit-appearance: none;
}
.hud-select option { background: #0a1628; }

.decision-table { }
.dtable-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  font-size: 11px;
}
.dt-type {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  flex-shrink: 0;
  border: 1px solid;
}
.dt-detail {
  flex: 1;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt-time { font-size: 9px; color: rgba(200,214,229,0.25); flex-shrink: 0; }
.dt-exec { font-size: 8px; font-weight: 700; padding: 2px 5px; flex-shrink: 0; }

.load-more {
  text-align: center;
  color: #00E5FF;
  font-size: 10px;
  padding: 10px;
  cursor: pointer;
  letter-spacing: 1px;
}

/* 模拟器 */
.sim-mode-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.sim-mode-bar span {
  padding: 5px 12px;
  font-size: 11px;
  cursor: pointer;
  color: rgba(200,214,229,0.3);
  border: 1px solid rgba(200,214,229,0.1);
  transition: all 0.2s;
}
.sim-mode-bar span.active {
  color: #00E5FF;
  border-color: rgba(0,229,255,0.3);
  background: rgba(0,229,255,0.05);
}

.sim-form {
  max-width: 400px;
}
.sf-row {
  margin-bottom: 10px;
}
.sf-row label {
  display: block;
  font-size: 10px;
  color: rgba(200,214,229,0.4);
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}
.hud-input {
  width: 100%;
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.15);
  color: #c8d6e5;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
  -webkit-appearance: none;
}
.hud-input:focus {
  border-color: #00E5FF;
  outline: none;
  box-shadow: 0 0 0 1px rgba(0,229,255,0.1);
}

.neon-btn {
  background: rgba(0,229,255,0.05);
  border: 1px solid rgba(0,229,255,0.3);
  color: #00E5FF;
  padding: 7px 14px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.neon-btn:hover {
  background: rgba(0,229,255,0.1);
  box-shadow: 0 0 10px rgba(0,229,255,0.2);
}
.neon-btn.primary {
  background: linear-gradient(135deg, rgba(0,229,255,0.2), rgba(0,180,216,0.2));
  width: 100%;
  padding: 10px;
  margin-top: 10px;
}
.neon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.sim-output {
  margin-top: 12px;
  border: 1px solid rgba(0,229,255,0.1);
  padding: 10px;
  background: rgba(0,229,255,0.02);
}
.so-title {
  font-size: 10px;
  font-weight: 700;
  color: #00E5FF;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.so-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.so-row span { color: rgba(200,214,229,0.4); }
.so-row strong { color: #fff; }
.val-up { color: #00E5FF !important; }
.val-dn { color: #00FF88 !important; }

.phase-tag { padding: 1px 6px; font-size: 10px; }
.phase-exploring { background: rgba(255,184,0,0.1); color: #FFB800; }
.phase-accelerating { background: rgba(0,229,255,0.1); color: #00E5FF; }
.phase-graduated { background: rgba(0,255,136,0.1); color: #00FF88; }
.phase-failed { background: rgba(255,77,79,0.1); color: #FF4D4F; }

.pace-tag { padding: 1px 6px; font-size: 10px; }
.pace-normal { background: rgba(0,255,136,0.1); color: #00FF88; }
.pace-overspend { background: rgba(255,77,79,0.1); color: #FF4D4F; }
.pace-underspend { background: rgba(255,184,0,0.1); color: #FFB800; }

.so-advice {
  margin-top: 8px;
  padding: 8px;
  background: rgba(255,255,255,0.02);
}
.so-advice-item {
  font-size: 11px;
  color: rgba(200,214,229,0.6);
  line-height: 1.8;
  padding-left: 10px;
  position: relative;
}
.so-advice-item::before {
  content: '>';
  position: absolute;
  left: 0;
  color: #00E5FF;
}

/* 模板弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal-hud {
  background: #0a1628;
  border: 1px solid rgba(0,229,255,0.2);
  padding: 20px;
  width: 100%;
  max-width: 420px;
  max-height: 70vh;
  overflow-y: auto;
}
.modal-hud-title {
  font-size: 12px;
  font-weight: 700;
  color: #00E5FF;
  letter-spacing: 1px;
  margin-bottom: 14px;
  text-align: center;
}
.tpl-row {
  padding: 10px;
  border: 1px solid rgba(0,229,255,0.08);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.tpl-row:hover {
  border-color: rgba(0,229,255,0.3);
  background: rgba(0,229,255,0.03);
}
.tpl-name { font-size: 12px; color: #fff; font-weight: 600; }
.tpl-desc { font-size: 10px; color: rgba(200,214,229,0.4); margin-top: 4px; line-height: 1.5; }

/* 返回按钮 */
.back-btn {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 50;
  color: rgba(0,229,255,0.5);
  font-size: 11px;
  text-decoration: none;
  padding: 5px 10px;
  border: 1px solid rgba(0,229,255,0.15);
  background: rgba(5,15,30,0.9);
  font-family: inherit;
  letter-spacing: 0.5px;
}
.back-btn:hover {
  color: #00E5FF;
  border-color: rgba(0,229,255,0.4);
}

/* ===== 桌面端 ===== */
@media (min-width: 1024px) {
  .cmd-header {
    padding: 14px 32px;
  }
  .hdr-titles h1 {
    font-size: 18px;
  }
  .hdr-sub {
    font-size: 9px;
  }
  .hdr-time {
    display: block;
  }
  .metrics-bar {
    padding: 12px 32px;
    gap: 12px;
  }
  .mbox-val {
    font-size: 28px;
  }
  .cmd-body {
    flex-direction: row;
    padding: 10px 32px;
    gap: 16px;
  }
  .panel-left,
  .panel-right {
    width: 30%;
    flex-shrink: 0;
  }
  .panel-center {
    flex: 1;
  }
  .radar-container {
    max-width: 320px;
  }
  .bottom-section {
    margin: 16px 32px 60px;
  }
  .btab-content {
    padding: 16px;
  }
  .rules-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .sim-form {
    max-width: 500px;
  }
  .decision-table {
    max-height: 400px;
    overflow-y: auto;
  }
}

@media (min-width: 1440px) {
  .cmd-header { padding: 16px 48px; }
  .metrics-bar { padding: 14px 48px; }
  .cmd-body { padding: 12px 48px; }
  .bottom-section { margin: 20px 48px 60px; }
  .radar-container { max-width: 360px; }
  .rules-grid { grid-template-columns: repeat(3, 1fr); }
}

/* 手机端优化 */
@media (max-width: 480px) {
  .metrics-bar {
    grid-template-columns: repeat(2, 1fr);
  }
  .hdr-titles h1 {
    font-size: 12px;
  }
  .radar-container {
    max-width: 220px;
  }
}
</style>
