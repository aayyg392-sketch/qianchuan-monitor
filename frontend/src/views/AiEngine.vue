<template>
  <div class="bigscreen">
    <!-- 全局背景效果 -->
    <div class="bg-stars"></div>
    <div class="bg-grid"></div>
    <div class="bg-vignette"></div>
    <canvas ref="particleCanvas" class="particle-canvas"></canvas>

    <!-- ========== 顶部标题栏 ========== -->
    <div class="title-bar">
      <div class="title-wing left">
        <div class="wing-line"></div>
        <div class="wing-dot"></div>
      </div>
      <div class="title-center">
        <div class="title-deco top-left"></div>
        <div class="title-deco top-right"></div>
        <div class="title-sub-top">INTELLIGENT AUTOMATION PLATFORM</div>
        <h1 class="title-main">
          <span class="title-icon">
            <svg viewBox="0 0 32 32" width="28" height="28"><circle cx="16" cy="16" r="14" fill="none" stroke="#00f0ff" stroke-width="1.5" stroke-dasharray="6 4"/><circle cx="16" cy="16" r="8" fill="none" stroke="#00f0ff" stroke-width="1"/><circle cx="16" cy="16" r="3" fill="#00f0ff" opacity="0.8"/></svg>
          </span>
          AI自动化腾讯ADQ指挥大屏
        </h1>
        <div class="title-sub-bottom">TENCENT ADQ AI COMMAND CENTER</div>
        <div class="title-deco bottom-left"></div>
        <div class="title-deco bottom-right"></div>
      </div>
      <div class="title-wing right">
        <div class="wing-dot"></div>
        <div class="wing-line"></div>
      </div>
    </div>

    <!-- 时间 + 引擎状态 -->
    <div class="status-bar">
      <div class="sb-left">
        <span class="sb-label">SYSTEM TIME</span>
        <span class="sb-time">{{ currentTime }}</span>
      </div>
      <div class="sb-center">
        <button class="engine-toggle" :class="{ on: engineRunning }" @click="toggleEngine">
          <div class="et-ring"><div class="et-core"></div></div>
          <span>{{ engineRunning ? 'AI ENGINE ONLINE' : 'AI ENGINE OFFLINE' }}</span>
        </button>
      </div>
      <div class="sb-right">
        <span class="sb-label">LAST SCAN</span>
        <span class="sb-time">{{ engineStatus.last_run_at ? fmtTime(engineStatus.last_run_at) : '--' }}</span>
      </div>
    </div>

    <!-- ========== 指标卡片 ========== -->
    <div class="kpi-row">
      <div class="kpi-card" v-for="k in kpiList" :key="k.key">
        <div class="kpi-border"></div>
        <div class="kpi-icon" :style="{ color: k.color }">
          <svg viewBox="0 0 24 24" width="20" height="20" v-html="k.icon"></svg>
        </div>
        <div class="kpi-data">
          <div class="kpi-val" :style="{ color: k.color }">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
        </div>
        <div class="kpi-ring" :style="{ borderColor: k.color + '30' }">
          <svg viewBox="0 0 44 44" class="kpi-progress">
            <circle cx="22" cy="22" r="19" fill="none" :stroke="k.color" stroke-width="2" stroke-dasharray="120" :stroke-dashoffset="120 - k.pct * 1.2" stroke-linecap="round" transform="rotate(-90 22 22)"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- ========== 三栏主体 ========== -->
    <div class="main-grid">
      <!-- ===== 左栏 ===== -->
      <div class="col col-left">
        <!-- ADQ账户AI接管 -->
        <div class="panel">
          <div class="panel-header">
            <div class="ph-dot cyan"></div>
            <span>ADQ账户AI接管</span>
            <div class="ph-line"></div>
          </div>
          <div class="panel-body">
            <div class="account-scroll" v-if="adqAccounts.length">
              <div class="acc-item" v-for="acc in adqAccounts" :key="acc.id" @click="toggleAiTakeover(acc)">
                <div class="acc-left">
                  <div class="acc-status-dot" :class="{ active: acc.aiEnabled }"></div>
                  <div>
                    <div class="acc-name">{{ acc.account_name || acc.app_id || '账户' + acc.id }}</div>
                    <div class="acc-id">{{ acc.account_id || acc.id }}</div>
                  </div>
                </div>
                <div class="acc-toggle" :class="{ on: acc.aiEnabled }">
                  <div class="acc-toggle-track"><div class="acc-toggle-thumb"></div></div>
                  <span>{{ acc.aiEnabled ? 'AI' : 'OFF' }}</span>
                </div>
              </div>
            </div>
            <div class="empty-msg" v-else>暂无ADQ账户</div>
          </div>
        </div>

        <!-- 异常预警 -->
        <div class="panel">
          <div class="panel-header">
            <div class="ph-dot red"></div>
            <span>异常预警中心</span>
            <div class="ph-line"></div>
          </div>
          <div class="panel-body">
            <div v-if="!recentAnomalies.length" class="empty-msg">
              <div class="safe-icon">&#10003;</div>
              系统正常运行
            </div>
            <div v-for="(a, i) in recentAnomalies.slice(0, 6)" :key="i" class="alert-item" :class="'sev-' + getSeverity(a)">
              <div class="alert-dot-wrap"><div class="alert-dot"></div></div>
              <div class="alert-text">
                <div class="alert-msg">{{ getAlertMsg(a) }}</div>
                <div class="alert-time">{{ fmtTime(a.created_at) }}</div>
              </div>
              <div class="alert-tag">{{ getSeverity(a) === 'critical' ? 'CRIT' : 'WARN' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 中央 ===== -->
      <div class="col col-center">
        <!-- 核心雷达 -->
        <div class="radar-wrap">
          <div class="radar-bg">
            <svg viewBox="0 0 400 400" class="radar-svg">
              <!-- 光晕 -->
              <defs>
                <radialGradient id="rg1"><stop offset="0%" stop-color="rgba(0,240,255,0.08)"/><stop offset="100%" stop-color="transparent"/></radialGradient>
                <linearGradient id="sweepG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(0,240,255,0)"/><stop offset="100%" stop-color="rgba(0,240,255,0.18)"/></linearGradient>
              </defs>
              <circle cx="200" cy="200" r="190" fill="url(#rg1)"/>
              <!-- 同心圆 -->
              <circle v-for="r in [180,140,100,60]" :key="r" cx="200" cy="200" :r="r" fill="none" stroke="rgba(0,240,255,0.08)" stroke-width="0.8"/>
              <!-- 十字 + 斜线 -->
              <line x1="200" y1="10" x2="200" y2="390" stroke="rgba(0,240,255,0.06)" stroke-width="0.5"/>
              <line x1="10" y1="200" x2="390" y2="200" stroke="rgba(0,240,255,0.06)" stroke-width="0.5"/>
              <line x1="60" y1="60" x2="340" y2="340" stroke="rgba(0,240,255,0.03)" stroke-width="0.5"/>
              <line x1="340" y1="60" x2="60" y2="340" stroke="rgba(0,240,255,0.03)" stroke-width="0.5"/>
              <!-- 刻度线 -->
              <line v-for="deg in 12" :key="'tick'+deg" x1="200" y1="20" x2="200" y2="30" stroke="rgba(0,240,255,0.15)" stroke-width="0.8" :transform="`rotate(${deg*30} 200 200)`"/>
              <!-- 扫描扇区 -->
              <g v-if="engineRunning" class="radar-sweep-group">
                <path d="M200,200 L200,20 A180,180 0 0,1 327,73 Z" fill="url(#sweepG)"/>
              </g>
              <!-- 数据点 -->
              <g v-for="(dot, i) in radarDots" :key="'rd'+i">
                <circle :cx="dot.x" :cy="dot.y" :r="dot.r + 4" :fill="dot.color" opacity="0.15" class="dot-halo"/>
                <circle :cx="dot.x" :cy="dot.y" :r="dot.r" :fill="dot.color" class="dot-core"/>
              </g>
              <!-- 外圈装饰弧 -->
              <circle cx="200" cy="200" r="192" fill="none" stroke="rgba(0,240,255,0.12)" stroke-width="1" stroke-dasharray="8 6" class="outer-ring"/>
              <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(0,240,255,0.06)" stroke-width="0.5" stroke-dasharray="3 8"/>
            </svg>
          </div>
          <!-- 中心信息 -->
          <div class="radar-center-info">
            <div class="rci-status" :class="engineRunning ? 'on' : 'off'">
              {{ engineRunning ? 'SCANNING' : 'STANDBY' }}
            </div>
            <div class="rci-big">{{ engineStatus.total_decisions || 0 }}</div>
            <div class="rci-sub">TOTAL DECISIONS</div>
            <div class="rci-ring-anim" v-if="engineRunning"></div>
          </div>
          <!-- 雷达四角标注 -->
          <div class="radar-label rl-tl">出价优化<br/><span>{{ recentBids.length }}</span></div>
          <div class="radar-label rl-tr">异常检测<br/><span>{{ todayAnomalies }}</span></div>
          <div class="radar-label rl-bl">素材监控<br/><span>{{ fatigueAlerts.length }}</span></div>
          <div class="radar-label rl-br">预算控制<br/><span>{{ recentDecisions.filter(d => d.decision_type === 'budget_pace').length }}</span></div>
        </div>

        <!-- 引擎数据条 -->
        <div class="engine-bars">
          <div class="ebar" v-for="eb in engineBars" :key="eb.label">
            <div class="ebar-label">{{ eb.label }}</div>
            <div class="ebar-track">
              <div class="ebar-fill" :style="{ width: eb.pct + '%', background: `linear-gradient(90deg, ${eb.color}00, ${eb.color})` }"></div>
              <div class="ebar-glow" :style="{ left: eb.pct + '%', background: eb.color }"></div>
            </div>
            <div class="ebar-val" :style="{ color: eb.color }">{{ eb.value }}</div>
          </div>
        </div>
      </div>

      <!-- ===== 右栏 ===== -->
      <div class="col col-right">
        <!-- 实时决策流 -->
        <div class="panel">
          <div class="panel-header">
            <div class="ph-dot green"></div>
            <span>实时决策流</span>
            <div class="ph-line"></div>
          </div>
          <div class="panel-body">
            <div v-if="!recentDecisions.length" class="empty-msg">等待AI决策...</div>
            <div v-for="d in recentDecisions.slice(0, 8)" :key="d.id" class="feed-item">
              <div class="feed-icon" :class="'fi-' + d.decision_type">{{ typeIcon(d.decision_type) }}</div>
              <div class="feed-body">
                <div class="feed-msg">{{ summarizeDecision(d) }}</div>
                <div class="feed-time">{{ fmtTime(d.created_at) }}</div>
              </div>
              <div class="feed-status" :class="d.executed ? 'fs-done' : 'fs-wait'">{{ d.executed ? 'OK' : '...' }}</div>
            </div>
          </div>
        </div>

        <!-- 出价变动 -->
        <div class="panel">
          <div class="panel-header">
            <div class="ph-dot yellow"></div>
            <span>出价变动</span>
            <div class="ph-line"></div>
          </div>
          <div class="panel-body">
            <div v-if="!recentBids.length" class="empty-msg">暂无调价记录</div>
            <div v-for="(b, i) in recentBids.slice(0, 6)" :key="i" class="bid-item">
              <div class="bid-dir" :class="getBidDirection(b) > 0 ? 'dir-up' : 'dir-down'">
                <svg viewBox="0 0 16 16" width="14" height="14"><path :d="getBidDirection(b) > 0 ? 'M8 3l5 8H3z' : 'M8 13l5-8H3z'" :fill="getBidDirection(b) > 0 ? '#00f0ff' : '#00ff88'"/></svg>
              </div>
              <div class="bid-detail">
                <div class="bid-vals">{{ getBidFrom(b) }} <span>&rarr;</span> {{ getBidTo(b) }}</div>
                <div class="bid-time">{{ fmtTime(b.created_at) }}</div>
              </div>
              <div class="bid-pct" :class="getBidDirection(b) > 0 ? 'bp-up' : 'bp-dn'">
                {{ getBidDirection(b) > 0 ? '+' : '' }}{{ (getBidDirection(b) * 100).toFixed(1) }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 底部操作区 ========== -->
    <div class="bottom-area">
      <div class="bottom-tabs">
        <div class="bt-item" :class="{ active: activeTab === 'rules' }" @click="activeTab = 'rules'">
          <svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 1l2 5h5l-4 3.5 1.5 5L8 11.5 3.5 14.5 5 9.5 1 6h5z" fill="currentColor"/></svg>
          策略规则
        </div>
        <div class="bt-item" :class="{ active: activeTab === 'decisions' }" @click="activeTab = 'decisions'">
          <svg viewBox="0 0 16 16" width="12" height="12"><rect x="1" y="1" width="14" height="3" rx="0.5" fill="currentColor"/><rect x="1" y="6" width="14" height="3" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="1" y="11" width="14" height="3" rx="0.5" fill="currentColor" opacity="0.4"/></svg>
          决策记录
        </div>
        <div class="bt-item" :class="{ active: activeTab === 'simulator' }" @click="activeTab = 'simulator'">
          <svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4v4l3 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          模拟测试
        </div>
      </div>

      <!-- 策略规则 -->
      <div v-show="activeTab === 'rules'" class="bt-content">
        <div class="bt-toolbar"><button class="glow-btn" @click="showTemplates = true">+ 从模板创建规则</button></div>
        <div v-if="!rules.length" class="empty-msg">暂无策略规则</div>
        <div class="rule-grid">
          <div v-for="r in rules" :key="r.id" class="rule-card">
            <div class="rc-top">
              <span class="rc-name">{{ r.rule_name }}</span>
              <span class="rc-switch" :class="r.is_active ? 'rs-on' : 'rs-off'" @click.stop="toggleRule(r)">{{ r.is_active ? 'ON' : 'OFF' }}</span>
            </div>
            <div class="rc-type">{{ typeLabel(r.rule_type) }}</div>
            <div class="rc-del" @click.stop="deleteRule(r.id)">DELETE</div>
          </div>
        </div>
      </div>

      <!-- 决策记录 -->
      <div v-show="activeTab === 'decisions'" class="bt-content">
        <div class="bt-toolbar">
          <select v-model="decisionFilter.type" class="hud-sel" @change="loadDecisions">
            <option value="">全部类型</option>
            <option value="bid_adjust">出价调整</option>
            <option value="creative_rotate">素材轮换</option>
            <option value="budget_pace">预算控制</option>
            <option value="anomaly_alert">异常告警</option>
            <option value="cold_start">冷启动</option>
          </select>
        </div>
        <div v-if="!decisions.length" class="empty-msg">暂无决策记录</div>
        <div class="dec-list">
          <div v-for="d in decisions" :key="d.id" class="dec-row">
            <span class="dec-type" :class="'dt-' + d.decision_type">{{ typeLabel(d.decision_type) }}</span>
            <span class="dec-detail">{{ summarizeDecision(d) }}</span>
            <span class="dec-time">{{ fmtTime(d.created_at) }}</span>
            <span class="dec-exec" :class="d.executed ? 'de-ok' : 'de-wait'">{{ d.executed ? 'DONE' : 'WAIT' }}</span>
          </div>
        </div>
        <div class="load-more" v-if="decisions.length && decisionTotal > decisions.length" @click="loadMoreDecisions">LOAD MORE &darr;</div>
      </div>

      <!-- 模拟测试 -->
      <div v-show="activeTab === 'simulator'" class="bt-content">
        <div class="sim-tabs">
          <span :class="{ active: simMode === 'bid' }" @click="simMode = 'bid'">PID调价</span>
          <span :class="{ active: simMode === 'coldstart' }" @click="simMode = 'coldstart'">冷启动</span>
          <span :class="{ active: simMode === 'budget' }" @click="simMode = 'budget'">预算匀速</span>
        </div>
        <div class="sim-form" v-if="simMode === 'bid'">
          <div class="sf-row"><label>当前出价</label><input v-model.number="simBid.currentBid" type="number" class="hud-inp"></div>
          <div class="sf-row"><label>目标ROI</label><input v-model.number="simBid.targetROI" type="number" class="hud-inp"></div>
          <div class="sf-row"><label>实际ROI</label><input v-model.number="simBid.actualROI" type="number" class="hud-inp"></div>
          <button class="glow-btn full" @click="runBidSim" :disabled="simLoading">RUN SIMULATION</button>
          <div v-if="simBidResult" class="sim-out">
            <div class="sim-out-title">PID OUTPUT</div>
            <div class="sim-kv"><span>建议出价</span><b :class="simBidResult.adjustment > 0 ? 'v-up' : 'v-dn'">{{ simBidResult.newBid }}</b></div>
            <div class="sim-kv"><span>调整幅度</span><b>{{ (simBidResult.adjustment * 100).toFixed(1) }}%</b></div>
            <div class="sim-kv"><span>P/I/D</span><b>{{ simBidResult.detail?.proportional }} / {{ simBidResult.detail?.integral }} / {{ simBidResult.detail?.derivative }}</b></div>
          </div>
        </div>
        <div class="sim-form" v-if="simMode === 'coldstart'">
          <div class="sf-row"><label>创建时间</label><input v-model="simCold.createTime" type="datetime-local" class="hud-inp"></div>
          <div class="sf-row"><label>累计转化</label><input v-model.number="simCold.totalConversions" type="number" class="hud-inp"></div>
          <div class="sf-row"><label>当前出价</label><input v-model.number="simCold.currentBid" type="number" class="hud-inp"></div>
          <button class="glow-btn full" @click="runColdSim" :disabled="simLoading">RUN SIMULATION</button>
          <div v-if="simColdResult" class="sim-out">
            <div class="sim-out-title">COLD START</div>
            <div class="sim-kv"><span>阶段</span><b class="phase" :class="'ph-' + simColdResult.phase">{{ phaseLabel(simColdResult.phase) }}</b></div>
            <div class="sim-kv"><span>转化进度</span><b>{{ (simColdResult.progress * 100).toFixed(0) }}%</b></div>
            <div class="sim-kv"><span>剩余时间</span><b>{{ simColdResult.hoursRemaining }}h</b></div>
          </div>
        </div>
        <div class="sim-form" v-if="simMode === 'budget'">
          <div class="sf-row"><label>日预算</label><input v-model.number="simBudget.dailyBudget" type="number" class="hud-inp"></div>
          <div class="sf-row"><label>已花费</label><input v-model.number="simBudget.spentToday" type="number" class="hud-inp"></div>
          <div class="sf-row"><label>当前小时</label><input v-model.number="simBudget.currentHour" type="number" class="hud-inp" min="0" max="23"></div>
          <button class="glow-btn full" @click="runBudgetSim" :disabled="simLoading">RUN SIMULATION</button>
          <div v-if="simBudgetResult" class="sim-out">
            <div class="sim-out-title">BUDGET PACING</div>
            <div class="sim-kv"><span>状态</span><b class="pace" :class="'pc-' + simBudgetResult.status">{{ paceLabel(simBudgetResult.status) }}</b></div>
            <div class="sim-kv"><span>偏差</span><b>{{ (simBudgetResult.deviation * 100).toFixed(1) }}%</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板弹窗 -->
    <Teleport to="body">
      <div class="modal-mask" v-if="showTemplates" @click.self="showTemplates = false">
        <div class="modal-box">
          <div class="modal-title">RULE TEMPLATES</div>
          <div v-for="(t, i) in ruleTemplates" :key="i" class="tpl-item" @click="createFromTemplate(t)">
            <div class="tpl-name">{{ t.name }}</div>
            <div class="tpl-desc">{{ t.description }}</div>
          </div>
          <button class="glow-btn full" @click="showTemplates = false" style="margin-top:14px">CLOSE</button>
        </div>
      </div>
    </Teleport>

    <!-- 返回 -->
    <router-link to="/dashboard" class="back-link">&laquo; 返回系统</router-link>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const particleCanvas = ref(null)
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
let timeTimer = null, refreshTimer = null, animFrame = null

const decisions = ref([])
const decisionTotal = ref(0)
const decisionPage = ref(1)
const decisionFilter = reactive({ platform: 'adq', type: '' })
const rules = ref([])
const ruleTemplates = ref([])
const showTemplates = ref(false)

const simMode = ref('bid')
const simLoading = ref(false)
const simBid = reactive({ platform: 'adq', currentBid: 5, targetROI: 2.0, actualROI: 1.2 })
const simBidResult = ref(null)
const simCold = reactive({ platform: 'adq', createTime: '', totalConversions: 8, currentBid: 5 })
const simColdResult = ref(null)
const simBudget = reactive({ platform: 'adq', dailyBudget: 1000, spentToday: 350, currentHour: new Date().getHours() })
const simBudgetResult = ref(null)

const kpiList = computed(() => {
  const total = engineStatus.value.total_decisions || 0
  return [
    { key: 'decisions', label: 'AI决策总数', value: total, color: '#00f0ff', pct: Math.min(100, total * 2), icon: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
    { key: 'anomalies', label: '异常告警', value: todayAnomalies.value, color: '#ff4d6a', pct: Math.min(100, todayAnomalies.value * 10), icon: '<path d="M12 2L2 22h20L12 2zm0 7v6m0 2v1" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
    { key: 'duration', label: '巡检耗时', value: fmtDuration(engineStatus.value.last_run_duration_ms), color: '#00ff88', pct: Math.min(100, (engineStatus.value.last_run_duration_ms || 0) / 100), icon: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
    { key: 'accounts', label: 'AI接管', value: adqAccounts.value.filter(a => a.aiEnabled).length, color: '#a78bfa', pct: adqAccounts.value.length ? (adqAccounts.value.filter(a => a.aiEnabled).length / adqAccounts.value.length) * 100 : 0, icon: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
  ]
})

const engineBars = computed(() => {
  const total = Math.max(engineStatus.value.total_decisions || 1, 1)
  const bids = recentBids.value.length
  const anomalies = todayAnomalies.value
  const fatigue = fatigueAlerts.value.length
  return [
    { label: 'BID OPTIMIZE', value: bids, pct: Math.min(100, (bids / total) * 100 + 5), color: '#00f0ff' },
    { label: 'ANOMALY DETECT', value: anomalies, pct: Math.min(100, (anomalies / total) * 100 + 3), color: '#ff4d6a' },
    { label: 'CREATIVE SCAN', value: fatigue, pct: Math.min(100, (fatigue / total) * 100 + 3), color: '#a78bfa' },
    { label: 'BUDGET PACE', value: recentDecisions.value.filter(d => d.decision_type === 'budget_pace').length, pct: 8, color: '#00ff88' },
  ]
})

const radarDots = computed(() => {
  const dots = []
  const items = [...recentBids.value.slice(0, 6), ...recentAnomalies.value.slice(0, 4)]
  items.forEach((_, i) => {
    const angle = (i / Math.max(items.length, 1)) * Math.PI * 2 + i * 0.7
    const dist = 50 + Math.random() * 120
    dots.push({ x: 200 + Math.cos(angle) * dist, y: 200 + Math.sin(angle) * dist, r: 2.5 + Math.random() * 2, color: i < recentBids.value.length ? '#00f0ff' : '#ff4d6a' })
  })
  return dots
})

function fmtTime(t) { return t ? dayjs(t).format('MM-DD HH:mm') : '' }
function fmtDuration(ms) { if (!ms) return '--'; return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's' }
function updateTime() { currentTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss') }

function getSeverity(a) { try { const d = typeof a.decision_data === 'string' ? JSON.parse(a.decision_data) : a.decision_data; return d?.anomalies?.[0]?.severity || 'warning' } catch { return 'warning' } }
function getAlertMsg(a) { try { const d = typeof a.decision_data === 'string' ? JSON.parse(a.decision_data) : a.decision_data; return d?.anomalies?.[0]?.message || d?.adName || '异常' } catch { return '异常' } }
function getBidDirection(b) { try { const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data; return d?.adjustment || 0 } catch { return 0 } }
function getBidFrom(b) { try { const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data; return (d?.currentBid || 0).toFixed(2) } catch { return '--' } }
function getBidTo(b) { try { const d = typeof b.decision_data === 'string' ? JSON.parse(b.decision_data) : b.decision_data; return (d?.newBid || 0).toFixed(2) } catch { return '--' } }
function typeLabel(t) { return { bid_adjust:'出价调整', bid:'出价规则', creative_rotate:'素材轮换', creative:'素材规则', budget_pace:'预算控制', budget:'预算规则', anomaly_alert:'异常告警', alert:'告警规则', cold_start:'冷启动', ai_takeover:'AI接管' }[t] || t }
function typeIcon(t) { return { bid_adjust:'$', creative_rotate:'~', budget_pace:'%', anomaly_alert:'!', cold_start:'*' }[t] || '>' }
function phaseLabel(p) { return { exploring:'探索期', accelerating:'加速期', graduated:'已毕业', failed:'失败' }[p] || p }
function paceLabel(s) { return { normal:'正常', overspend:'超速', underspend:'偏慢' }[s] || s }
function summarizeDecision(d) {
  try {
    const data = typeof d.decision_data === 'string' ? JSON.parse(d.decision_data) : d.decision_data
    if (d.decision_type === 'bid_adjust') return `${data.adName || ''} ${data.currentBid} -> ${data.newBid}`
    if (d.decision_type === 'creative_rotate') return data.suggestion || `疲劳${data.score}`
    if (d.decision_type === 'budget_pace') return data.action?.message || `偏差${((data.deviation||0)*100).toFixed(1)}%`
    if (d.decision_type === 'anomaly_alert') return data.anomalies?.[0]?.message || data.adName || '异常'
    return JSON.stringify(data).slice(0, 50)
  } catch { return '' }
}

// Particle animation
function initParticles() {
  const canvas = particleCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  let w, h
  const particles = []
  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
  resize()
  window.addEventListener('resize', resize)
  for (let i = 0; i < 60; i++) {
    particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.4 + 0.1 })
  }
  function draw() {
    ctx.clearRect(0, 0, w, h)
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0; if (p.y < 0) p.y = h; if (p.y > h) p.y = 0
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0, 240, 255, ${p.a})`; ctx.fill()
    }
    // 连线
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.06 * (1 - dist / 120)})`; ctx.stroke()
        }
      }
    }
    animFrame = requestAnimationFrame(draw)
  }
  draw()
}

// API
async function loadStatus() { try { const r = await request.get('/ai-engine/dashboard/status'); engineStatus.value = r.data.engine || {}; engineRunning.value = !!engineStatus.value.is_running; todayAnomalies.value = r.data.todayAnomalies || 0 } catch {} }
async function loadOverview() { try { const r = await request.get('/ai-engine/dashboard/overview'); recentAnomalies.value = r.data.recentAnomalies || []; recentBids.value = r.data.recentBids || []; fatigueAlerts.value = r.data.fatigueAlerts || [] } catch {} }
async function loadRecentDecisions() { try { const r = await request.get('/ai-engine/dashboard/decisions', { params: { platform: 'adq', page: 1, page_size: 10 } }); recentDecisions.value = r.data.list || [] } catch {} }
async function loadDecisions() { try { decisionPage.value = 1; const r = await request.get('/ai-engine/dashboard/decisions', { params: { ...decisionFilter, page: 1, page_size: 20 } }); decisions.value = r.data.list || []; decisionTotal.value = r.data.total || 0 } catch {} }
async function loadMoreDecisions() { try { decisionPage.value++; const r = await request.get('/ai-engine/dashboard/decisions', { params: { ...decisionFilter, page: decisionPage.value, page_size: 20 } }); decisions.value.push(...(r.data.list || [])) } catch {} }
async function loadRules() { try { const r = await request.get('/ai-engine/rules/list'); rules.value = r.data || [] } catch {} }
async function loadTemplates() { try { const r = await request.get('/ai-engine/rules/templates'); ruleTemplates.value = r.data || [] } catch {} }
async function loadAdqAccounts() {
  try {
    const res = await request.get('/adq/accounts')
    const accounts = res.data || []
    const rulesRes = await request.get('/ai-engine/rules/list')
    const aiRules = (rulesRes.data || []).filter(r => r.rule_type === 'ai_takeover' && r.is_active)
    const aiIds = new Set(aiRules.map(r => { const c = typeof r.rule_config === 'string' ? JSON.parse(r.rule_config) : r.rule_config; return String(c?.accountDbId || '') }))
    adqAccounts.value = accounts.map(a => ({ ...a, aiEnabled: aiIds.has(String(a.id)) }))
  } catch {}
}
async function toggleAiTakeover(acc) {
  try {
    if (acc.aiEnabled) {
      const rulesRes = await request.get('/ai-engine/rules/list')
      const rule = (rulesRes.data || []).find(r => { if (r.rule_type !== 'ai_takeover') return false; const c = typeof r.rule_config === 'string' ? JSON.parse(r.rule_config) : r.rule_config; return String(c?.accountDbId) === String(acc.id) })
      if (rule) await request.delete(`/ai-engine/rules/${rule.id}`)
      acc.aiEnabled = false; message.success('已关闭AI接管')
    } else {
      await request.post('/ai-engine/rules/create', { platform: 'adq', rule_name: `AI接管-${acc.account_name || acc.id}`, rule_type: 'ai_takeover', rule_config: { accountDbId: acc.id, accountId: acc.account_id, enableBidAdjust: true, enableMaterialRotate: true, enableBudgetPace: true, enableAnomalyAlert: true, targetCPA: 50 } })
      acc.aiEnabled = true; message.success('AI接管已开启')
    }
  } catch { message.error('操作失败') }
}
async function createFromTemplate(tpl) { try { await request.post('/ai-engine/rules/create', { platform: tpl.config?.platform || 'adq', rule_name: tpl.name, rule_type: tpl.type, rule_config: tpl.config }); message.success('创建成功'); showTemplates.value = false; loadRules() } catch {} }
async function toggleRule(r) { try { await request.post(`/ai-engine/rules/toggle/${r.id}`); r.is_active = r.is_active ? 0 : 1 } catch {} }
async function deleteRule(id) { try { await request.delete(`/ai-engine/rules/${id}`); rules.value = rules.value.filter(r => r.id !== id) } catch {} }
async function toggleEngine() { try { const a = engineRunning.value ? 'stop' : 'start'; await request.post(`/ai-engine/${a}`); engineRunning.value = !engineRunning.value; message.success(engineRunning.value ? '引擎已启动' : '引擎已停止') } catch {} }
async function runBidSim() { simLoading.value = true; try { const r = await request.post('/ai-engine/dashboard/simulate-bid', simBid); simBidResult.value = r.data } catch {} finally { simLoading.value = false } }
async function runColdSim() { simLoading.value = true; try { const r = await request.post('/ai-engine/dashboard/simulate-coldstart', { platform:'adq', adgroup:{ createTime: simCold.createTime || new Date(Date.now()-48*3600000).toISOString(), totalConversions: simCold.totalConversions, totalImpressions:10000, totalCost:500, currentBid: simCold.currentBid, dailyBudget:300 } }); simColdResult.value = r.data } catch {} finally { simLoading.value = false } }
async function runBudgetSim() { simLoading.value = true; try { const r = await request.post('/ai-engine/dashboard/simulate-budget', simBudget); simBudgetResult.value = r.data } catch {} finally { simLoading.value = false } }

onMounted(() => {
  updateTime(); timeTimer = setInterval(updateTime, 1000)
  initParticles()
  loadStatus(); loadOverview(); loadRecentDecisions(); loadDecisions(); loadRules(); loadTemplates(); loadAdqAccounts()
  refreshTimer = setInterval(() => { loadStatus(); loadOverview(); loadRecentDecisions() }, 30000)
})
onUnmounted(() => {
  clearInterval(timeTimer); clearInterval(refreshTimer)
  if (animFrame) cancelAnimationFrame(animFrame)
})
</script>

<style scoped>
/* =========================================================
   AI ADQ 指挥大屏 - 金融风控预警指挥大屏风格
   ========================================================= */

/* === 动画 === */
@keyframes scanDown { 0% { top: -2px } 100% { top: 100% } }
@keyframes radarSpin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
@keyframes dotBlink { 0%,100% { opacity:0.4; transform:scale(1) } 50% { opacity:1; transform:scale(1.6) } }
@keyframes ringExpand { 0% { transform:translate(-50%,-50%) scale(0.8); opacity:0.6 } 100% { transform:translate(-50%,-50%) scale(2); opacity:0 } }
@keyframes borderFlow { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
@keyframes floatUp { 0% { opacity:0; transform:translateY(8px) } 100% { opacity:1; transform:translateY(0) } }
@keyframes outerRingSpin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
@keyframes starTwinkle { 0%,100% { opacity:0.2 } 50% { opacity:0.8 } }

/* === 根容器 === */
.bigscreen {
  width: 100vw; min-height: 100vh;
  background: #020810;
  color: #c0d0e0;
  font-family: 'SF Mono','Menlo','Consolas','PingFang SC',monospace;
  position: relative; overflow-x: hidden;
}

/* === 背景层 === */
.bg-stars {
  position: fixed; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(1px 1px at 20% 30%, rgba(0,240,255,0.3), transparent),
    radial-gradient(1px 1px at 40% 70%, rgba(0,240,255,0.2), transparent),
    radial-gradient(1px 1px at 60% 20%, rgba(0,240,255,0.15), transparent),
    radial-gradient(1px 1px at 80% 60%, rgba(0,240,255,0.25), transparent),
    radial-gradient(1.5px 1.5px at 10% 80%, rgba(0,240,255,0.2), transparent),
    radial-gradient(1px 1px at 90% 40%, rgba(0,240,255,0.15), transparent),
    radial-gradient(1px 1px at 50% 50%, rgba(255,77,106,0.15), transparent),
    radial-gradient(1px 1px at 70% 90%, rgba(167,139,250,0.15), transparent);
}
.bg-grid {
  position: fixed; inset:0; z-index:0; pointer-events:none;
  background-image: linear-gradient(rgba(0,240,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.025) 1px, transparent 1px);
  background-size: 50px 50px;
}
.bg-vignette {
  position: fixed; inset:0; z-index:0; pointer-events:none;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(2,8,16,0.7) 100%);
}
.particle-canvas {
  position: fixed; inset:0; z-index:1; pointer-events:none;
}

/* === 标题栏 === */
.title-bar {
  position: relative; z-index:10;
  display: flex; align-items:center; justify-content:center;
  padding: 16px 20px 8px;
  gap: 0;
}
.title-wing {
  flex:1; display:flex; align-items:center; gap:6px;
  max-width: 300px;
}
.title-wing.left { flex-direction:row-reverse }
.wing-line {
  flex:1; height:1px;
  background: linear-gradient(90deg, transparent, rgba(0,240,255,0.4), rgba(0,240,255,0.1));
}
.title-wing.left .wing-line {
  background: linear-gradient(90deg, rgba(0,240,255,0.1), rgba(0,240,255,0.4), transparent);
}
.wing-dot {
  width:6px; height:6px; border-radius:50%;
  background:#00f0ff; box-shadow:0 0 8px #00f0ff;
}
.title-center {
  position:relative; text-align:center; padding:6px 30px;
  border:1px solid rgba(0,240,255,0.15);
  background: linear-gradient(180deg, rgba(0,240,255,0.03), transparent);
  clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px);
}
.title-deco {
  position:absolute; width:12px; height:12px;
  border-color:rgba(0,240,255,0.4); border-style:solid; border-width:0;
}
.title-deco.top-left { top:-1px; left:-1px; border-top-width:2px; border-left-width:2px }
.title-deco.top-right { top:-1px; right:-1px; border-top-width:2px; border-right-width:2px }
.title-deco.bottom-left { bottom:-1px; left:-1px; border-bottom-width:2px; border-left-width:2px }
.title-deco.bottom-right { bottom:-1px; right:-1px; border-bottom-width:2px; border-right-width:2px }
.title-sub-top {
  font-size:8px; letter-spacing:3px; color:rgba(0,240,255,0.4);
  margin-bottom:2px;
}
.title-main {
  margin:0; font-size:20px; font-weight:800; letter-spacing:3px;
  background: linear-gradient(90deg, #00f0ff, #fff, #00f0ff);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  display:flex; align-items:center; justify-content:center; gap:8px;
}
.title-icon { display:flex; flex-shrink:0 }
.title-sub-bottom {
  font-size:8px; letter-spacing:4px; color:rgba(0,240,255,0.3);
  margin-top:2px;
}

/* === 状态栏 === */
.status-bar {
  position:relative; z-index:10;
  display:flex; justify-content:space-between; align-items:center;
  padding:6px 24px; margin:4px 20px 0;
  border-top:1px solid rgba(0,240,255,0.08);
}
.sb-label { font-size:8px; color:rgba(0,240,255,0.3); letter-spacing:1px; display:block }
.sb-time { font-size:11px; color:rgba(0,240,255,0.7); font-weight:600 }
.sb-left, .sb-right { min-width:120px }
.sb-right { text-align:right }
.sb-center { display:flex; justify-content:center }

.engine-toggle {
  display:flex; align-items:center; gap:8px;
  padding:4px 16px; border:1px solid rgba(255,77,106,0.4);
  background:rgba(255,77,106,0.06); color:#ff4d6a;
  font-size:10px; font-weight:700; letter-spacing:1.5px;
  cursor:pointer; font-family:inherit; transition:all 0.3s;
}
.engine-toggle.on {
  border-color:rgba(0,240,255,0.4); background:rgba(0,240,255,0.06); color:#00f0ff;
}
.et-ring {
  width:14px; height:14px; border-radius:50%;
  border:1.5px solid currentColor; display:flex; align-items:center; justify-content:center;
}
.et-core {
  width:6px; height:6px; border-radius:50%; background:#ff4d6a;
}
.engine-toggle.on .et-core {
  background:#00f0ff; box-shadow:0 0 8px #00f0ff; animation: pulse 2s infinite;
}

/* === KPI === */
.kpi-row {
  position:relative; z-index:10;
  display:grid; grid-template-columns:repeat(4,1fr); gap:10px;
  padding:10px 20px;
}
.kpi-card {
  position:relative; display:flex; align-items:center; gap:10px;
  padding:10px 12px;
  background:rgba(0,240,255,0.02);
  border:1px solid rgba(0,240,255,0.08);
  clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px);
}
.kpi-border {
  position:absolute; top:0; left:0; right:0; height:1px;
  background: linear-gradient(90deg, transparent, rgba(0,240,255,0.3), transparent);
}
.kpi-icon { flex-shrink:0; opacity:0.7 }
.kpi-data { flex:1 }
.kpi-val { font-size:22px; font-weight:900; line-height:1 }
.kpi-label { font-size:9px; color:rgba(200,210,220,0.4); margin-top:2px; letter-spacing:0.5px }
.kpi-ring {
  position:absolute; right:8px; top:50%; transform:translateY(-50%);
  width:44px; height:44px; border-radius:50%;
  border:1px solid; opacity:0.5;
}
.kpi-progress { position:absolute; inset:0; width:100%; height:100% }

/* === 三栏主体 === */
.main-grid {
  position:relative; z-index:10;
  display:flex; flex-direction:column; gap:10px;
  padding:10px 20px;
}

/* === 面板 === */
.panel {
  background: linear-gradient(180deg, rgba(0,16,32,0.85), rgba(0,8,20,0.9));
  border:1px solid rgba(0,240,255,0.1);
  margin-bottom:10px;
  position:relative;
  animation: floatUp 0.5s ease;
}
.panel::before, .panel::after {
  content:''; position:absolute; width:16px; height:16px;
  border-color:rgba(0,240,255,0.25); border-style:solid; border-width:0;
}
.panel::before { top:-1px; left:-1px; border-top-width:2px; border-left-width:2px }
.panel::after { bottom:-1px; right:-1px; border-bottom-width:2px; border-right-width:2px }

.panel-header {
  display:flex; align-items:center; gap:8px;
  padding:10px 14px 8px;
  font-size:12px; font-weight:700; color:#00f0ff;
  letter-spacing:1px;
  border-bottom:1px solid rgba(0,240,255,0.06);
}
.ph-dot {
  width:7px; height:7px; border-radius:50%;
  box-shadow:0 0 6px currentColor;
  animation: pulse 3s infinite;
}
.ph-dot.cyan { background:#00f0ff; color:#00f0ff }
.ph-dot.red { background:#ff4d6a; color:#ff4d6a }
.ph-dot.green { background:#00ff88; color:#00ff88 }
.ph-dot.yellow { background:#ffb800; color:#ffb800 }
.ph-line { flex:1; height:1px; background:linear-gradient(90deg, rgba(0,240,255,0.15), transparent) }

.panel-body { padding:8px 14px 12px; }

.empty-msg {
  text-align:center; color:rgba(200,210,220,0.2);
  font-size:11px; padding:16px 0; letter-spacing:1px;
}
.safe-icon {
  font-size:20px; color:#00ff88; margin-bottom:4px;
}

/* 账户列表 */
.account-scroll { max-height:220px; overflow-y:auto }
.acc-item {
  display:flex; justify-content:space-between; align-items:center;
  padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.03);
  cursor:pointer; transition:background 0.2s;
}
.acc-item:hover { background:rgba(0,240,255,0.03) }
.acc-left { display:flex; align-items:center; gap:8px }
.acc-status-dot {
  width:6px; height:6px; border-radius:50%;
  background:rgba(200,210,220,0.2); flex-shrink:0;
}
.acc-status-dot.active { background:#00f0ff; box-shadow:0 0 6px #00f0ff }
.acc-name { font-size:12px; color:rgba(255,255,255,0.8) }
.acc-id { font-size:9px; color:rgba(200,210,220,0.25); margin-top:1px }
.acc-toggle { display:flex; align-items:center; gap:5px; font-size:9px; font-weight:700; color:rgba(200,210,220,0.3) }
.acc-toggle.on { color:#00f0ff }
.acc-toggle-track {
  width:26px; height:13px; border-radius:7px;
  background:rgba(255,255,255,0.08); position:relative; transition:all 0.3s;
}
.acc-toggle.on .acc-toggle-track { background:rgba(0,240,255,0.2) }
.acc-toggle-thumb {
  width:9px; height:9px; border-radius:50%;
  background:rgba(200,210,220,0.4);
  position:absolute; top:2px; left:2px; transition:all 0.3s;
}
.acc-toggle.on .acc-toggle-thumb { left:15px; background:#00f0ff; box-shadow:0 0 6px #00f0ff }

/* 异常 */
.alert-item {
  display:flex; align-items:center; gap:8px;
  padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.02);
}
.alert-dot-wrap { width:10px; flex-shrink:0; display:flex; justify-content:center }
.alert-dot { width:6px; height:6px; border-radius:50% }
.sev-critical .alert-dot { background:#ff4d6a; box-shadow:0 0 8px #ff4d6a; animation:pulse 1.2s infinite }
.sev-warning .alert-dot { background:#ffb800 }
.alert-text { flex:1; min-width:0 }
.alert-msg { font-size:11px; color:rgba(255,255,255,0.65); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.alert-time { font-size:8px; color:rgba(200,210,220,0.2); margin-top:1px }
.alert-tag { font-size:8px; font-weight:700; padding:1px 5px; flex-shrink:0; letter-spacing:0.5px }
.sev-critical .alert-tag { color:#ff4d6a; border:1px solid rgba(255,77,106,0.2); background:rgba(255,77,106,0.06) }
.sev-warning .alert-tag { color:#ffb800; border:1px solid rgba(255,184,0,0.2); background:rgba(255,184,0,0.06) }

/* === 雷达 === */
.radar-wrap {
  position:relative; width:100%; max-width:380px; margin:0 auto;
  aspect-ratio:1;
}
.radar-bg { width:100%; height:100% }
.radar-svg { width:100%; height:100% }
.radar-sweep-group { transform-origin:200px 200px; animation:radarSpin 4s linear infinite }
.dot-halo { animation: dotBlink 3s ease infinite }
.dot-core { filter: drop-shadow(0 0 3px currentColor) }
.outer-ring { transform-origin: 200px 200px; animation: outerRingSpin 30s linear infinite }

.radar-center-info {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  text-align:center; z-index:2;
}
.rci-status { font-size:9px; font-weight:700; letter-spacing:3px }
.rci-status.on { color:#00f0ff }
.rci-status.off { color:#ff4d6a }
.rci-big { font-size:36px; font-weight:900; color:#fff; line-height:1; margin:2px 0 }
.rci-sub { font-size:7px; color:rgba(200,210,220,0.3); letter-spacing:2px }
.rci-ring-anim {
  position:absolute; top:50%; left:50%; width:70px; height:70px;
  border-radius:50%; border:1px solid rgba(0,240,255,0.2);
  animation: ringExpand 2.5s ease-out infinite;
}

.radar-label {
  position:absolute; font-size:9px; color:rgba(0,240,255,0.4);
  letter-spacing:0.5px; line-height:1.4; text-align:center;
}
.radar-label span { color:#00f0ff; font-size:14px; font-weight:800; display:block }
.rl-tl { top:8%; left:8% }
.rl-tr { top:8%; right:8% }
.rl-bl { bottom:8%; left:8% }
.rl-br { bottom:8%; right:8% }

/* 引擎数据条 */
.engine-bars { margin-top:10px }
.ebar { margin-bottom:6px; display:flex; align-items:center; gap:8px }
.ebar-label { font-size:8px; color:rgba(200,210,220,0.3); letter-spacing:0.5px; width:90px; flex-shrink:0; text-align:right }
.ebar-track { flex:1; height:4px; background:rgba(255,255,255,0.04); position:relative; border-radius:2px; overflow:visible }
.ebar-fill { height:100%; border-radius:2px; transition:width 0.8s ease }
.ebar-glow { position:absolute; top:-2px; width:4px; height:8px; border-radius:2px; filter:blur(3px); transition:left 0.8s ease }
.ebar-val { font-size:10px; font-weight:700; width:30px }

/* 决策流 */
.feed-item {
  display:flex; align-items:center; gap:7px;
  padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.02);
  animation: floatUp 0.3s ease;
}
.feed-icon {
  width:20px; height:20px; display:flex; align-items:center; justify-content:center;
  font-size:9px; font-weight:900; flex-shrink:0; border:1px solid;
}
.fi-bid_adjust { color:#00f0ff; border-color:rgba(0,240,255,0.2) }
.fi-creative_rotate { color:#a78bfa; border-color:rgba(167,139,250,0.2) }
.fi-budget_pace { color:#00ff88; border-color:rgba(0,255,136,0.2) }
.fi-anomaly_alert { color:#ff4d6a; border-color:rgba(255,77,106,0.2) }
.fi-cold_start { color:#ffb800; border-color:rgba(255,184,0,0.2) }
.feed-body { flex:1; min-width:0 }
.feed-msg { font-size:10px; color:rgba(255,255,255,0.6); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.feed-time { font-size:8px; color:rgba(200,210,220,0.2) }
.feed-status { font-size:8px; font-weight:700; padding:1px 5px; flex-shrink:0 }
.fs-done { color:#00ff88; border:1px solid rgba(0,255,136,0.15) }
.fs-wait { color:rgba(200,210,220,0.25); border:1px solid rgba(200,210,220,0.08) }

/* 出价 */
.bid-item { display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.02) }
.bid-dir { flex-shrink:0 }
.bid-detail { flex:1 }
.bid-vals { font-size:11px; color:rgba(255,255,255,0.65) }
.bid-vals span { color:rgba(0,240,255,0.4) }
.bid-time { font-size:8px; color:rgba(200,210,220,0.2) }
.bid-pct { font-size:11px; font-weight:700; flex-shrink:0 }
.bp-up { color:#00f0ff }
.bp-dn { color:#00ff88 }

/* === 底部区 === */
.bottom-area {
  position:relative; z-index:10;
  margin:10px 20px 40px;
  border:1px solid rgba(0,240,255,0.1);
  background:rgba(0,12,24,0.8);
}
.bottom-area::before, .bottom-area::after {
  content:''; position:absolute; width:20px; height:20px;
  border-color:rgba(0,240,255,0.25); border-style:solid; border-width:0;
}
.bottom-area::before { top:-1px; left:-1px; border-top-width:2px; border-left-width:2px }
.bottom-area::after { bottom:-1px; right:-1px; border-bottom-width:2px; border-right-width:2px }

.bottom-tabs {
  display:flex; border-bottom:1px solid rgba(0,240,255,0.06);
}
.bt-item {
  flex:1; text-align:center; padding:10px 0;
  font-size:11px; color:rgba(200,210,220,0.3);
  cursor:pointer; letter-spacing:0.5px; transition:all 0.3s;
  border-bottom:2px solid transparent;
  display:flex; align-items:center; justify-content:center; gap:5px;
}
.bt-item.active { color:#00f0ff; border-bottom-color:#00f0ff; background:rgba(0,240,255,0.02) }
.bt-item svg { opacity:0.5 }
.bt-item.active svg { opacity:1 }

.bt-content { padding:12px 14px }
.bt-toolbar { margin-bottom:10px }

.glow-btn {
  background:rgba(0,240,255,0.04); border:1px solid rgba(0,240,255,0.25);
  color:#00f0ff; padding:6px 14px; font-size:10px; font-weight:700;
  letter-spacing:1px; cursor:pointer; font-family:inherit; transition:all 0.2s;
}
.glow-btn:hover { background:rgba(0,240,255,0.08); box-shadow:0 0 12px rgba(0,240,255,0.15) }
.glow-btn.full { width:100%; padding:10px; margin-top:8px }
.glow-btn:disabled { opacity:0.3; cursor:not-allowed }

.rule-grid { display:grid; gap:8px }
.rule-card {
  padding:10px; border:1px solid rgba(0,240,255,0.06);
  background:rgba(0,240,255,0.015);
}
.rc-top { display:flex; justify-content:space-between; align-items:center }
.rc-name { font-size:12px; color:#fff; font-weight:600 }
.rc-switch { font-size:9px; font-weight:700; padding:2px 8px; cursor:pointer; letter-spacing:0.5px }
.rs-on { color:#00f0ff; border:1px solid rgba(0,240,255,0.3); background:rgba(0,240,255,0.04) }
.rs-off { color:rgba(200,210,220,0.25); border:1px solid rgba(200,210,220,0.08) }
.rc-type { font-size:9px; color:rgba(200,210,220,0.3); margin-top:3px }
.rc-del { font-size:9px; color:#ff4d6a; cursor:pointer; margin-top:5px; letter-spacing:0.5px }

.hud-sel {
  background:rgba(0,240,255,0.03); border:1px solid rgba(0,240,255,0.12);
  color:#c0d0e0; padding:6px 10px; font-size:11px; font-family:inherit; -webkit-appearance:none;
}
.hud-sel option { background:#0a1628 }

.dec-list { max-height:300px; overflow-y:auto }
.dec-row {
  display:flex; align-items:center; gap:8px;
  padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.02); font-size:11px;
}
.dec-type { font-size:9px; font-weight:700; padding:2px 6px; flex-shrink:0; border:1px solid }
.dt-bid_adjust { color:#00f0ff; border-color:rgba(0,240,255,0.2) }
.dt-creative_rotate { color:#a78bfa; border-color:rgba(167,139,250,0.2) }
.dt-budget_pace { color:#00ff88; border-color:rgba(0,255,136,0.2) }
.dt-anomaly_alert { color:#ff4d6a; border-color:rgba(255,77,106,0.2) }
.dt-cold_start { color:#ffb800; border-color:rgba(255,184,0,0.2) }
.dec-detail { flex:1; color:rgba(255,255,255,0.5); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dec-time { font-size:9px; color:rgba(200,210,220,0.2); flex-shrink:0 }
.dec-exec { font-size:8px; font-weight:700; padding:2px 5px; flex-shrink:0 }
.de-ok { color:#00ff88; border:1px solid rgba(0,255,136,0.15) }
.de-wait { color:rgba(200,210,220,0.2); border:1px solid rgba(200,210,220,0.06) }

.load-more { text-align:center; color:#00f0ff; font-size:10px; padding:10px; cursor:pointer; letter-spacing:1px }

/* 模拟 */
.sim-tabs { display:flex; gap:8px; margin-bottom:10px }
.sim-tabs span {
  padding:5px 12px; font-size:10px; cursor:pointer;
  color:rgba(200,210,220,0.3); border:1px solid rgba(200,210,220,0.08); transition:all 0.2s;
}
.sim-tabs span.active { color:#00f0ff; border-color:rgba(0,240,255,0.25); background:rgba(0,240,255,0.03) }
.sim-form { max-width:400px }
.sf-row { margin-bottom:8px }
.sf-row label { display:block; font-size:9px; color:rgba(200,210,220,0.35); margin-bottom:3px; letter-spacing:0.5px }
.hud-inp {
  width:100%; background:rgba(0,240,255,0.02); border:1px solid rgba(0,240,255,0.12);
  color:#c0d0e0; padding:7px 10px; font-size:12px; font-family:inherit; box-sizing:border-box; -webkit-appearance:none;
}
.hud-inp:focus { border-color:#00f0ff; outline:none; box-shadow:0 0 0 1px rgba(0,240,255,0.08) }

.sim-out {
  margin-top:10px; border:1px solid rgba(0,240,255,0.08);
  padding:10px; background:rgba(0,240,255,0.015);
}
.sim-out-title { font-size:10px; font-weight:700; color:#00f0ff; letter-spacing:1px; margin-bottom:6px }
.sim-kv { display:flex; justify-content:space-between; padding:3px 0; font-size:11px; border-bottom:1px solid rgba(255,255,255,0.02) }
.sim-kv span { color:rgba(200,210,220,0.35) }
.sim-kv b { color:#fff }
.v-up { color:#00f0ff !important }
.v-dn { color:#00ff88 !important }
.phase { padding:1px 5px; font-size:9px }
.ph-exploring { background:rgba(255,184,0,0.08); color:#ffb800 }
.ph-accelerating { background:rgba(0,240,255,0.08); color:#00f0ff }
.ph-graduated { background:rgba(0,255,136,0.08); color:#00ff88 }
.ph-failed { background:rgba(255,77,106,0.08); color:#ff4d6a }
.pace { padding:1px 5px; font-size:9px }
.pc-normal { color:#00ff88 }
.pc-overspend { color:#ff4d6a }
.pc-underspend { color:#ffb800 }

/* 弹窗 */
.modal-mask { position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px }
.modal-box {
  background:#060e1a; border:1px solid rgba(0,240,255,0.2); padding:20px;
  width:100%; max-width:420px; max-height:70vh; overflow-y:auto;
}
.modal-title { font-size:12px; font-weight:700; color:#00f0ff; letter-spacing:1.5px; text-align:center; margin-bottom:12px }
.tpl-item { padding:10px; border:1px solid rgba(0,240,255,0.06); margin-bottom:6px; cursor:pointer; transition:all 0.2s }
.tpl-item:hover { border-color:rgba(0,240,255,0.25); background:rgba(0,240,255,0.02) }
.tpl-name { font-size:12px; color:#fff; font-weight:600 }
.tpl-desc { font-size:10px; color:rgba(200,210,220,0.35); margin-top:3px; line-height:1.5 }

/* 返回 */
.back-link {
  position:fixed; bottom:14px; left:20px; z-index:50;
  color:rgba(0,240,255,0.4); font-size:10px; text-decoration:none;
  padding:4px 10px; border:1px solid rgba(0,240,255,0.1);
  background:rgba(2,8,16,0.9); font-family:inherit;
}
.back-link:hover { color:#00f0ff; border-color:rgba(0,240,255,0.3) }

/* === 桌面端 === */
@media (min-width:1024px) {
  .title-main { font-size:26px; letter-spacing:5px }
  .title-wing { max-width:400px }
  .kpi-row { padding:10px 32px; gap:14px }
  .kpi-val { font-size:28px }
  .main-grid { flex-direction:row; padding:10px 32px; gap:14px }
  .col-left, .col-right { width:28%; flex-shrink:0 }
  .col-center { flex:1 }
  .radar-wrap { max-width:380px }
  .bottom-area { margin:14px 32px 50px }
  .rule-grid { grid-template-columns:repeat(2,1fr) }
  .status-bar { margin:4px 32px 0 }
}
@media (min-width:1440px) {
  .title-main { font-size:30px }
  .kpi-row { padding:12px 48px }
  .main-grid { padding:12px 48px }
  .bottom-area { margin:16px 48px 50px }
  .status-bar { margin:4px 48px 0 }
  .rule-grid { grid-template-columns:repeat(3,1fr) }
}
@media (max-width:480px) {
  .kpi-row { grid-template-columns:repeat(2,1fr) }
  .title-main { font-size:14px; letter-spacing:1px }
  .title-wing { display:none }
  .radar-wrap { max-width:260px }
  .title-center { padding:6px 16px }
}
</style>
