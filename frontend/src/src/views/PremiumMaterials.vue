<template>
  <div class="page">
    <!-- Tab 切换 -->
    <div class="filter-bar">
      <div class="seg-ctrl">
        <span :class="['seg', { on: tab === 'candidates' }]" @click="tab='candidates'; loadCandidates()">筛选</span>
        <span :class="['seg', { on: tab === 'tracking' }]" @click="tab='tracking'; loadTracking()">
          孵化中<i v-if="trackingCount" class="badge">{{ trackingCount }}</i>
        </span>
        <span :class="['seg', { on: tab === 'completed' }]" @click="tab='completed'; loadCompleted()">已完成</span>
      </div>
    </div>

    <!-- 筛选Tab -->
    <div v-if="tab === 'candidates'" class="body">
      <div v-if="loadingC" class="empty">加载中...</div>
      <div v-else-if="!candidates.length" class="empty">暂无候选素材</div>
      <div v-else class="card-grid">
        <div v-for="m in candidates" :key="m.material_id" class="card">
          <div class="card-top">
            <span :class="['score', scoreC(m.quality_score)]">{{ m.quality_score }}</span>
            <span class="name">{{ m.title || '--' }}</span>
          </div>
          <div v-if="m.quality_tags?.length" class="tag-row">
            <span v-for="t in m.quality_tags" :key="t" class="chip">{{ t }}</span>
          </div>
          <div class="card-kpis">
            <div class="kpi"><div class="kpi-v blue">¥{{ fmt(m.total_cost) }}</div><div class="kpi-l">消耗</div></div>
            <div class="kpi"><div class="kpi-v" :class="roiC(m.roi)">{{ n2(m.roi) }}</div><div class="kpi-l">ROI</div></div>
            <div class="kpi"><div class="kpi-v">{{ n2(m.avg_ctr) }}%</div><div class="kpi-l">CTR</div></div>
            <div class="kpi"><div class="kpi-v">{{ n2(m.avg_3s_rate) }}%</div><div class="kpi-l">3秒留存</div></div>
          </div>
          <div class="card-act">
            <button class="btn primary" @click.stop="startIncubation(m)" :disabled="incId === m.material_id">
              {{ incId === m.material_id ? '启动中...' : '开始孵化' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 孵化中Tab -->
    <div v-if="tab === 'tracking'" class="body">
      <div v-if="loadingT" class="empty">加载中...</div>
      <div v-else-if="!trackList.length" class="empty">暂无进行中的孵化</div>
      <div v-else class="card-grid">
        <div v-for="r in trackList" :key="r.id" class="card">
          <div class="card-top">
            <span :class="['score sm', scoreC(r.quality_score)]">{{ r.quality_score }}</span>
            <span class="name">{{ r.title || '--' }}</span>
            <span :class="['status', 'st-' + r.status]">{{ stLabel(r.status) }}</span>
          </div>
          <!-- 进度点 -->
          <div class="progress">
            <div class="dots">
              <span v-for="d in 7" :key="d" :class="['dot', { filled: d <= r.days_elapsed, now: d === r.days_elapsed }]">{{ d }}</span>
            </div>
            <div class="bar"><div class="fill" :style="{ width: Math.min(100, dayCost(r) / 100) + '%' }"></div></div>
            <div class="bar-text">日消耗 <b>¥{{ fmt(dayCost(r)) }}</b></div>
          </div>
          <div class="card-kpis">
            <div class="kpi"><div class="kpi-v blue">¥{{ fmt(r.total_cost) }}</div><div class="kpi-l">累计</div></div>
            <div class="kpi"><div class="kpi-v" :class="roiC(r.current_roi)">{{ n2(r.current_roi) }}</div><div class="kpi-l">ROI</div></div>
            <div class="kpi"><div class="kpi-v">{{ n2(r.current_ctr) }}%</div><div class="kpi-l">CTR</div></div>
          </div>
          <div class="card-acts">
            <button class="btn ghost" @click="r._exp = !r._exp">{{ r._exp ? '收起' : '方案' }}</button>
            <button class="btn primary sm" @click="suggest(r)" :disabled="r._loading">{{ r._loading ? '...' : 'AI建议' }}</button>
          </div>
          <div v-if="r._exp && r.plan_content" class="plan" v-html="md(r.plan_content)"></div>
          <div v-if="r._tip" class="ai-tip">{{ r._tip }}</div>
        </div>
      </div>
    </div>

    <!-- 已完成Tab -->
    <div v-if="tab === 'completed'" class="body">
      <div v-if="loadingD" class="empty">加载中...</div>
      <div v-else-if="!doneList.length" class="empty">暂无记录</div>
      <div v-else class="card-grid">
        <div v-for="r in doneList" :key="r.id" :class="['card', 'r-' + r.status]">
          <div class="card-top">
            <span :class="['result-icon', r.status]">{{ r.status === 'success' ? '✓' : '!' }}</span>
            <span class="name">{{ r.title || '--' }}</span>
            <span :class="['status', 'st-' + r.status]">{{ r.status === 'success' ? '成功' : '未达标' }}</span>
          </div>
          <div class="card-kpis">
            <div class="kpi"><div class="kpi-v blue">¥{{ fmt(r.total_cost) }}</div><div class="kpi-l">累计</div></div>
            <div class="kpi"><div class="kpi-v" :class="roiC(r.current_roi)">{{ n2(r.current_roi) }}</div><div class="kpi-l">ROI</div></div>
            <div class="kpi"><div class="kpi-v">{{ r.days_elapsed }}天</div><div class="kpi-l">用时</div></div>
          </div>
          <div v-if="r.result_summary" class="summary">{{ r.result_summary }}</div>
        </div>
      </div>
    </div>

    <div style="height: calc(16px + env(safe-area-inset-bottom, 0))"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const tab = ref('candidates')
const candidates = ref([])
const trackList = ref([])
const doneList = ref([])
const loadingC = ref(false)
const loadingT = ref(false)
const loadingD = ref(false)
const incId = ref(null)
const trackingCount = ref(0)

const fmt = (v) => { const n = parseFloat(v || 0); return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0) }
const n2 = (v) => parseFloat(v || 0).toFixed(2)
const scoreC = (s) => s >= 70 ? 'sc-h' : s >= 50 ? 'sc-m' : 'sc-l'
const roiC = (v) => parseFloat(v) >= 2 ? 'green' : parseFloat(v) >= 1.5 ? 'orange' : 'gray'
const stLabel = (s) => ({ incubating: '孵化中', adjusting: '调整中', success: '成功', failed: '未达标' }[s] || s)
const dayCost = (r) => { const d = (r.daily_data || []).filter(x => x.day > 0); return d.length ? parseFloat(d[d.length - 1].cost || 0) : parseFloat(r.total_cost || 0) }
const md = (t) => t ? t.replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\n/g, '<br>') : ''

const loadCandidates = async () => {
  loadingC.value = true
  try { const r = await request.get('/premium-materials/candidates'); candidates.value = r.data?.list || [] }
  catch {} finally { loadingC.value = false }
}
const loadTracking = async () => {
  loadingT.value = true
  try { const r = await request.get('/premium-materials/tracking', { params: { status: 'incubating,adjusting' } }); trackList.value = (r.data?.list || []).map(x => ({ ...x, _exp: false, _loading: false, _tip: '' })); trackingCount.value = trackList.value.length }
  catch {} finally { loadingT.value = false }
}
const loadCompleted = async () => {
  loadingD.value = true
  try { const r = await request.get('/premium-materials/tracking', { params: { status: 'success,failed' } }); doneList.value = r.data?.list || [] }
  catch {} finally { loadingD.value = false }
}
const startIncubation = async (m) => {
  incId.value = m.material_id
  try { await request.post('/premium-materials/start-incubation', { material_id: m.material_id }); tab.value = 'tracking'; loadTracking() }
  catch {} finally { incId.value = null }
}
const suggest = async (r) => {
  r._loading = true
  try { const res = await request.post(`/premium-materials/tracking/${r.id}/suggest`); r._tip = res.data?.suggestion || '暂无建议' }
  catch { r._tip = '获取失败' } finally { r._loading = false }
}

onMounted(() => { loadCandidates(); loadTracking() })
</script>

<style scoped>
.page { background: #F5F6FA; min-height: 100vh; }
.body { padding: 8px 16px; }

/* 筛选 */
.filter-bar { background: #fff; padding: 12px 16px; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #F0F1F5; }
.seg-ctrl { display: flex; background: #F0F1F5; border-radius: 8px; padding: 2px; }
.seg { flex: 1; text-align: center; padding: 7px 0; font-size: 13px; color: #86909C; border-radius: 6px; cursor: pointer; font-weight: 500; position: relative; }
.seg.on { background: #fff; color: #1D2129; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.badge { position: absolute; top: 0; right: 12px; min-width: 16px; height: 16px; background: #F53F3F; color: #fff; font-size: 9px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-style: normal; padding: 0 3px; }

/* 通用卡片 */
.card-grid { display: flex; flex-direction: column; gap: 8px; }
.card { background: #fff; border-radius: 10px; overflow: hidden; }
.card-top { display: flex; align-items: center; padding: 12px 14px; gap: 8px; }
.name { flex: 1; font-size: 14px; font-weight: 600; color: #1D2129; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* KPI */
.card-kpis { display: flex; padding: 0 14px 12px; }
.kpi { flex: 1; text-align: center; }
.kpi-v { font-size: 15px; font-weight: 700; color: #1D2129; }
.kpi-v.blue { color: #1677FF; }
.kpi-v.green { color: #00B42A; }
.kpi-v.orange { color: #FF7D00; }
.kpi-v.gray { color: #C9CDD4; }
.kpi-l { font-size: 11px; color: #86909C; margin-top: 1px; }

/* 分数 */
.score { min-width: 28px; height: 22px; border-radius: 6px; font-size: 12px; font-weight: 700; color: #fff; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0 5px; }
.score.sm { min-width: 24px; height: 20px; font-size: 11px; }
.sc-h { background: #00B42A; }
.sc-m { background: #FF7D00; }
.sc-l { background: #C9CDD4; }

/* 状态 */
.status { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500; flex-shrink: 0; }
.st-incubating { background: #E8F3FF; color: #1677FF; }
.st-adjusting { background: #FFF7E8; color: #FF7D00; }
.st-success { background: #E8FFEA; color: #00B42A; }
.st-failed { background: #FFECE8; color: #F53F3F; }

/* 按钮 */
.card-act { padding: 0 14px 14px; }
.card-acts { display: flex; gap: 8px; padding: 0 14px 14px; }
.btn { padding: 8px 0; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%; }
.btn.primary { background: #1677FF; color: #fff; }
.btn.primary:disabled { opacity: .4; }
.btn.primary.sm { width: auto; padding: 6px 16px; }
.btn.ghost { background: #F0F1F5; color: #4E5969; }

/* 进度 */
.progress { padding: 4px 14px 8px; }
.dots { display: flex; gap: 4px; margin-bottom: 6px; }
.dot { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid #E5E6EB; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #C9CDD4; }
.dot.filled { background: #1677FF; border-color: #1677FF; color: #fff; }
.dot.now { box-shadow: 0 0 0 3px rgba(22,119,255,.15); }
.bar { height: 4px; background: #F0F1F5; border-radius: 2px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #1677FF, #36CFC9); border-radius: 2px; }
.bar-text { font-size: 12px; color: #86909C; margin-top: 3px; }
.bar-text b { color: #1D2129; }

/* 结果 */
.result-icon { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; }
.result-icon.success { background: #00B42A; }
.result-icon.failed { background: #FF7D00; }
.r-success { border-left: 3px solid #00B42A; }
.r-failed { border-left: 3px solid #FF7D00; }

/* AI内容 */
.plan { padding: 10px 14px; margin: 0 14px 14px; background: #F7F8FA; border-radius: 8px; font-size: 13px; line-height: 1.6; color: #4E5969; }
.ai-tip { margin: 0 14px 14px; padding: 10px; background: #E8F3FF; border-radius: 8px; font-size: 13px; color: #1677FF; line-height: 1.5; }
.summary { margin: 0 14px 14px; padding: 10px; background: #F7F8FA; border-radius: 8px; font-size: 13px; color: #86909C; line-height: 1.5; }

/* 标签 */
.tag-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 14px 8px; }
.chip { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #E8F3FF; color: #1677FF; font-weight: 500; }

.empty { text-align: center; padding: 60px 20px; color: #C9CDD4; font-size: 14px; }

/* 桌面 */
@media (min-width: 768px) {
  .page { padding: 16px 24px; }
  .filter-bar { border-radius: 10px; border: none; margin-bottom: 4px; }
  .body { padding: 8px 0; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
  .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
}
</style>
