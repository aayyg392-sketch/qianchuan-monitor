<template>
  <div class="incubation-page">
    <!-- 顶部 -->
    <div class="page-header">
      <div class="header-left">
        <h2>🚀 爆款孵化计划</h2>
        <span class="header-desc">识别潜力素材，AI制定7天孵化步骤，推广同事按步执行</span>
      </div>
      <div class="header-right">
        <button class="btn-batch" @click="handleBatchGenerate" :disabled="batchGenerating">
          {{ batchGenerating ? '批量生成中...' : '⚡ 一键生成TOP10孵化计划' }}
        </button>
      </div>
    </div>

    <!-- Tab切换 -->
    <div class="tab-bar">
      <button :class="{ active: tab === 'candidates' }" @click="switchTab('candidates')">🔍 潜力素材池</button>
      <button :class="{ active: tab === 'plans' }" @click="switchTab('plans')">📋 孵化计划列表</button>
    </div>

    <!-- 潜力素材池 -->
    <div v-if="tab === 'candidates'">
      <div v-if="loadingCandidates" class="loading-box"><div class="spinner"></div><p>扫描潜力素材中...</p></div>
      <div v-else-if="!candidates.length" class="empty-box"><p>暂无符合条件的潜力素材</p></div>
      <div v-else class="candidates-grid">
        <div v-for="(m, idx) in candidates" :key="m.material_id" class="candidate-card">
          <div class="card-top">
            <span class="rank">#{{ idx + 1 }}</span>
            <span class="score" :class="scoreClass(m.potential_score)">{{ m.potential_score }}分</span>
          </div>
          <div class="card-title" :title="m.title">{{ truncate(m.title, 30) }}</div>
          <div class="card-metrics">
            <div class="metric"><span class="label">消耗</span><span class="val cost">¥{{ fmtNum(m.total_cost) }}</span></div>
            <div class="metric"><span class="label">成交</span><span class="val">{{ m.orders }}单</span></div>
            <div class="metric"><span class="label">ROI</span><span class="val" :class="roiCls(m.roi)">{{ m.roi }}</span></div>
            <div class="metric"><span class="label">CTR</span><span class="val">{{ m.avg_ctr || 0 }}%</span></div>
            <div class="metric"><span class="label">转化率</span><span class="val">{{ m.avg_cvr || 0 }}%</span></div>
            <div class="metric"><span class="label">投放天数</span><span class="val">{{ m.active_days }}天</span></div>
          </div>
          <button class="btn-incubate" @click="handleGenerate(m)" :disabled="generatingId === m.material_id">
            {{ generatingId === m.material_id ? '生成中...' : '🧪 生成孵化计划' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 孵化计划列表 -->
    <div v-if="tab === 'plans'">
      <!-- 状态筛选 -->
      <div class="filter-bar">
        <button v-for="s in statusOptions" :key="s.value" :class="{ active: statusFilter === s.value }" @click="filterStatus(s.value)">
          {{ s.label }}
        </button>
      </div>

      <div v-if="loadingPlans" class="loading-box"><div class="spinner"></div></div>
      <div v-else-if="!plans.length" class="empty-box"><p>暂无孵化计划</p></div>
      <div v-else class="plans-list">
        <div v-for="plan in plans" :key="plan.id" class="plan-card" :class="{ expanded: expandedPlan === plan.id }">
          <div class="plan-header" @click="togglePlan(plan.id)">
            <div class="plan-info">
              <span class="plan-score" :class="scoreClass(plan.potential_score)">{{ plan.potential_score }}分</span>
              <span class="plan-title">{{ truncate(plan.title, 35) }}</span>
              <span class="plan-cost">消耗¥{{ fmtNum(plan.current_cost) }}</span>
              <span class="plan-roi" :class="roiCls(plan.current_roi)">ROI:{{ plan.current_roi }}</span>
            </div>
            <div class="plan-actions">
              <select class="status-select" :class="plan.status" :value="plan.status" @click.stop @change="updateStatus(plan.id, $event.target.value)">
                <option value="pending">⏳ 待执行</option>
                <option value="executing">🔄 执行中</option>
                <option value="completed">✅ 已完成</option>
                <option value="abandoned">❌ 已放弃</option>
              </select>
              <span class="expand-icon">{{ expandedPlan === plan.id ? '▲' : '▼' }}</span>
            </div>
          </div>
          <div class="plan-body" v-if="expandedPlan === plan.id">
            <div class="ai-content" v-html="renderMd(plan.plan_content)"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const tab = ref('candidates')
const candidates = ref([])
const plans = ref([])
const loadingCandidates = ref(false)
const loadingPlans = ref(false)
const generatingId = ref(null)
const batchGenerating = ref(false)
const expandedPlan = ref(null)
const statusFilter = ref('')

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'pending', label: '⏳ 待执行' },
  { value: 'executing', label: '🔄 执行中' },
  { value: 'completed', label: '✅ 已完成' },
  { value: 'abandoned', label: '❌ 已放弃' },
]

onMounted(() => { fetchCandidates() })

function switchTab(t) {
  tab.value = t
  if (t === 'candidates' && !candidates.value.length) fetchCandidates()
  if (t === 'plans') fetchPlans()
}

async function fetchCandidates() {
  loadingCandidates.value = true
  try {
    const res = await request.get('/incubation/candidates')
    candidates.value = res.data?.list || []
  } catch (e) { console.error(e) }
  loadingCandidates.value = false
}

async function fetchPlans() {
  loadingPlans.value = true
  try {
    const res = await request.get('/incubation/plans', { params: { status: statusFilter.value, pageSize: 50 } })
    plans.value = res.data?.list || []
    if (plans.value.length && !expandedPlan.value) expandedPlan.value = plans.value[0].id
  } catch (e) { console.error(e) }
  loadingPlans.value = false
}

async function handleGenerate(m) {
  generatingId.value = m.material_id
  try {
    await request.post('/incubation/generate', { material_id: m.material_id })
    setTimeout(() => { generatingId.value = null; switchTab('plans') }, 12000)
  } catch (e) { generatingId.value = null }
}

async function handleBatchGenerate() {
  batchGenerating.value = true
  try {
    await request.post('/incubation/generate-batch')
    setTimeout(() => { batchGenerating.value = false; switchTab('plans') }, 30000)
  } catch (e) { batchGenerating.value = false }
}

async function updateStatus(id, status) {
  try {
    await request.put(`/incubation/plans/${id}/status`, { status })
    const plan = plans.value.find(p => p.id === id)
    if (plan) plan.status = status
  } catch (e) { console.error(e) }
}

function filterStatus(s) { statusFilter.value = s; fetchPlans() }
function togglePlan(id) { expandedPlan.value = expandedPlan.value === id ? null : id }

function fmtNum(v) { const n = parseFloat(v || 0); return n >= 10000 ? (n/10000).toFixed(2)+'万' : n.toFixed(0) }
function truncate(s, len) { return s && s.length > len ? s.slice(0, len) + '...' : (s || '') }
function scoreClass(s) { return s >= 70 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low' }
function roiCls(v) { const n = parseFloat(v||0); return n >= 3 ? 'roi-high' : n >= 2 ? 'roi-mid' : 'roi-low' }

function renderMd(text) {
  if (!text) return ''
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}
</script>

<style scoped>
.incubation-page { padding: 24px; max-width: 1200px; }

.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px; padding: 20px 24px;
  background: linear-gradient(135deg, #f0f4ff 0%, #e8f4f0 100%);
  border-radius: 12px; border: 1px solid #d0e0f0;
}
.header-left h2 { margin: 0 0 4px; font-size: 20px; }
.header-desc { font-size: 13px; color: #888; }
.btn-batch {
  padding: 10px 20px; background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-batch:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102,126,234,0.4); }
.btn-batch:disabled { opacity: 0.6; cursor: not-allowed; }

.tab-bar { display: flex; gap: 8px; margin-bottom: 20px; }
.tab-bar button {
  padding: 8px 20px; border: 1px solid #ddd; border-radius: 20px;
  background: #fff; font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.tab-bar button.active { background: #4a6cf7; color: #fff; border-color: #4a6cf7; }

.loading-box { text-align: center; padding: 60px 0; color: #999; }
.empty-box { text-align: center; padding: 60px 0; color: #bbb; font-size: 15px; }

.candidates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.candidate-card {
  background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #eee;
  transition: all 0.3s;
}
.candidate-card:hover { border-color: #4a6cf7; box-shadow: 0 4px 16px rgba(74,108,247,0.1); }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.rank { font-size: 14px; font-weight: 700; color: #999; }
.score { padding: 2px 10px; border-radius: 10px; font-size: 13px; font-weight: 700; }
.score-high { background: #f0fff4; color: #52c41a; }
.score-mid { background: #fffbe6; color: #faad14; }
.score-low { background: #fff1f0; color: #ff4d4f; }
.card-title { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 12px; line-height: 1.4; }
.card-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
.metric { text-align: center; }
.metric .label { display: block; font-size: 11px; color: #aaa; }
.metric .val { font-size: 14px; font-weight: 600; color: #333; }
.metric .val.cost { color: #ff6b35; }
.roi-high { color: #52c41a !important; }
.roi-mid { color: #faad14 !important; }
.roi-low { color: #ff4d4f !important; }

.btn-incubate {
  width: 100%; padding: 8px; border: 1px solid #4a6cf7; border-radius: 6px;
  background: #f5f7ff; color: #4a6cf7; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-incubate:hover:not(:disabled) { background: #4a6cf7; color: #fff; }
.btn-incubate:disabled { opacity: 0.5; cursor: not-allowed; }

.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; }
.filter-bar button {
  padding: 6px 14px; border: 1px solid #eee; border-radius: 16px;
  background: #fff; font-size: 13px; cursor: pointer;
}
.filter-bar button.active { background: #333; color: #fff; border-color: #333; }

.plan-card { background: #fff; border-radius: 12px; margin-bottom: 12px; border: 1px solid #eee; overflow: hidden; }
.plan-card.expanded { border-color: #4a6cf7; }
.plan-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px; cursor: pointer;
}
.plan-header:hover { background: #fafafa; }
.plan-info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.plan-score { padding: 2px 8px; border-radius: 8px; font-size: 12px; font-weight: 700; }
.plan-title { font-size: 14px; font-weight: 500; color: #333; }
.plan-cost { font-size: 13px; color: #888; }
.plan-roi { font-size: 13px; font-weight: 600; }
.plan-actions { display: flex; align-items: center; gap: 10px; }
.status-select {
  padding: 4px 8px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 12px; cursor: pointer; background: #fff;
}
.status-select.executing { border-color: #4a6cf7; color: #4a6cf7; }
.status-select.completed { border-color: #52c41a; color: #52c41a; }
.status-select.abandoned { border-color: #ff4d4f; color: #ff4d4f; }
.expand-icon { font-size: 11px; color: #ccc; }

.plan-body { padding: 0 18px 18px; border-top: 1px solid #f0f0f0; }
.ai-content { padding: 16px 0; font-size: 14px; line-height: 1.8; color: #333; }
.ai-content :deep(h2) { font-size: 16px; margin: 18px 0 8px; color: #333; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px; }
.ai-content :deep(h3) { font-size: 15px; margin: 14px 0 6px; color: #4a6cf7; }
.ai-content :deep(strong) { color: #ff6b35; }
.ai-content :deep(li) { margin: 3px 0; }
.ai-content :deep(blockquote) { border-left: 3px solid #4a6cf7; padding: 8px 12px; background: #f5f7ff; margin: 12px 0; }
.ai-content :deep(hr) { border: none; border-top: 1px solid #eee; margin: 16px 0; }
.ai-content :deep(code) { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; color: #e83e8c; }

.spinner {
  display: inline-block; width: 28px; height: 28px;
  border: 3px solid #4a6cf7; border-top-color: transparent;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
