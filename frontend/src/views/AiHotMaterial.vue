<template>
  <div class="hot-material-page">
    <!-- 顶部统计 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ dashboard.total_batches || 0 }}</div>
        <div class="stat-label">总批次</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">{{ dashboard.success_count || 0 }}</div>
        <div class="stat-label">生成成功</div>
      </div>
      <div class="stat-card">
        <div class="stat-value blue">{{ dashboard.pushed_count || 0 }}</div>
        <div class="stat-label">已推送千川</div>
      </div>
      <div class="stat-card">
        <div class="stat-value orange">{{ dashboard.tracking_count || 0 }}</div>
        <div class="stat-label">跟踪中</div>
      </div>
      <div class="stat-card highlight">
        <div class="stat-value red">{{ dashboard.hot_count || 0 }}</div>
        <div class="stat-label">爆款素材(10万+)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">¥{{ formatNum(dashboard.total_cost) }}</div>
        <div class="stat-label">总消耗</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">{{ dashboard.avg_roi || 0 }}</div>
        <div class="stat-label">平均ROI</div>
      </div>
    </div>

    <!-- 操作栏 -->
    <div class="action-bar">
      <div class="action-left">
        <h2>AI爆款素材</h2>
        <span class="desc">分析爆款共性 → AI生成脚本 → 即梦生成视频 → 推送千川 → 投放跟踪</span>
      </div>
      <div class="action-right">
        <select v-model="filterStatus" @change="loadList" class="status-filter">
          <option value="">全部状态</option>
          <option value="analyzing">分析中</option>
          <option value="scripting">脚本生成</option>
          <option value="generating">视频生成中</option>
          <option value="ready">待推送</option>
          <option value="pushed">已推送</option>
          <option value="tracking">跟踪中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
        <button class="btn-generate" @click="handleGenerate" :disabled="generating">
          {{ generating ? '流水线运行中...' : '一键生成爆款素材' }}
        </button>
      </div>
    </div>

    <!-- 生成进度 -->
    <div v-if="generating && currentBatchId" class="pipeline-progress">
      <div class="pipeline-title">批次: {{ currentBatchId }}</div>
      <div class="pipeline-steps">
        <div v-for="(step, idx) in pipelineSteps" :key="idx" class="step" :class="step.status">
          <div class="step-dot"></div>
          <div class="step-label">{{ step.label }}</div>
        </div>
      </div>
      <div class="pipeline-items" v-if="batchStatus.length">
        <div v-for="item in batchStatus" :key="item.id" class="pipeline-item">
          <span class="idx">#{{ item.script_index }}</span>
          <span class="title">{{ item.script_title }}</span>
          <span class="status-tag" :class="item.pipeline_status">{{ statusText(item.pipeline_status) }}</span>
        </div>
      </div>
    </div>

    <!-- 素材列表 -->
    <div v-if="loading" class="loading-box">加载中...</div>
    <div v-else-if="!list.length" class="empty-box">
      <p>暂无AI爆款素材</p>
      <p class="hint">点击「一键生成爆款素材」开始</p>
    </div>
    <div v-else class="material-list">
      <div v-for="item in list" :key="item.id" class="material-card" :class="{ hot: item.is_hot }">
        <div class="card-header">
          <div class="card-tags">
            <span class="type-tag" :class="item.script_type">{{ typeText(item.script_type) }}</span>
            <span class="status-tag" :class="item.pipeline_status">{{ statusText(item.pipeline_status) }}</span>
            <span v-if="item.is_hot" class="hot-badge">爆款</span>
          </div>
          <span class="card-time">{{ formatTime(item.created_at) }}</span>
        </div>

        <div class="card-body">
          <div class="card-left">
            <h3 class="card-title">{{ item.script_title }}</h3>
            <div class="card-metrics">
              <span v-if="item.audit_score">评分: <b :class="item.audit_score >= 70 ? 'green' : 'red'">{{ item.audit_score }}</b></span>
              <span v-if="item.total_cost > 0">消耗: <b>¥{{ formatNum(item.total_cost) }}</b></span>
              <span v-if="item.total_orders > 0">成交: <b>{{ item.total_orders }}单</b></span>
              <span v-if="item.avg_roi > 0">ROI: <b class="green">{{ item.avg_roi }}</b></span>
            </div>
          </div>
          <div class="card-right" v-if="item.video_url">
            <video :src="item.video_url" controls preload="metadata" class="preview-video"></video>
          </div>
        </div>

        <div class="card-actions">
          <button v-if="item.pipeline_status === 'ready'" class="btn btn-push" @click="handlePush(item.id)">
            推送到千川
          </button>
          <button v-if="item.pipeline_status === 'failed'" class="btn btn-retry" @click="handleRetry(item.id)">
            重试
          </button>
          <button class="btn btn-detail" @click="showDetail(item.id)">
            查看详情
          </button>
          <button v-if="['tracking','pushed','completed'].includes(item.pipeline_status)" class="btn btn-track" @click="showTracking(item.id)">
            投放数据
          </button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination" v-if="total > pageSize">
      <button @click="changePage(page - 1)" :disabled="page <= 1">上一页</button>
      <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button @click="changePage(page + 1)" :disabled="page >= Math.ceil(total / pageSize)">下一页</button>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detailVisible" class="modal-overlay" @click.self="detailVisible = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>素材详情 #{{ detail.id }}</h3>
          <button class="modal-close" @click="detailVisible = false">&times;</button>
        </div>
        <div class="modal-body" v-if="detail">
          <div class="detail-section">
            <h4>脚本信息</h4>
            <div class="detail-row"><label>类型:</label> <span class="type-tag" :class="detail.script_type">{{ typeText(detail.script_type) }}</span></div>
            <div class="detail-row"><label>标题:</label> {{ detail.script_title }}</div>
            <div v-if="detail.script_content" class="script-detail">
              <div class="hook-box" v-if="detail.script_content.hook">
                <strong>前3秒钩子:</strong> {{ detail.script_content.hook }}
              </div>
              <div v-if="detail.script_content.scenes" class="scenes-list">
                <div v-for="(scene, idx) in detail.script_content.scenes" :key="idx" class="scene-item">
                  <span class="scene-time">{{ scene.time }}</span>
                  <div class="scene-desc">{{ scene.description }}</div>
                  <div class="scene-voice" v-if="scene.voiceover">{{ scene.voiceover }}</div>
                </div>
              </div>
              <div v-if="detail.script_content.ccr_prompt" class="ccr-box">
                <strong>CCR Prompt:</strong> {{ detail.script_content.ccr_prompt }}
              </div>
              <div v-if="detail.script_content.cta" class="cta-box">
                <strong>CTA:</strong> {{ detail.script_content.cta }}
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="detail.video_url">
            <h4>生成视频</h4>
            <video :src="detail.video_url" controls class="detail-video"></video>
          </div>

          <div class="detail-section" v-if="detail.pushed_accounts && detail.pushed_accounts.length">
            <h4>推送记录</h4>
            <div v-for="acc in detail.pushed_accounts" :key="acc.advertiser_id" class="push-record">
              <span>{{ acc.name || acc.advertiser_id }}</span>
              <span :class="acc.error ? 'red' : 'green'">{{ acc.error || '成功' }}</span>
            </div>
          </div>

          <div class="detail-section" v-if="detail.daily_stats && detail.daily_stats.length">
            <h4>投放跟踪</h4>
            <table class="track-table">
              <thead><tr><th>日期</th><th>消耗</th><th>成交</th><th>GMV</th><th>ROI</th><th>CTR</th></tr></thead>
              <tbody>
                <tr v-for="s in detail.daily_stats" :key="s.stat_date">
                  <td>{{ s.stat_date }}</td>
                  <td>¥{{ parseFloat(s.cost||0).toFixed(0) }}</td>
                  <td>{{ s.pay_order_count }}</td>
                  <td>¥{{ parseFloat(s.pay_order_amount||0).toFixed(0) }}</td>
                  <td>{{ s.roi }}</td>
                  <td>{{ parseFloat(s.ctr||0).toFixed(2) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const API = '/api/ai-hot-material'
const token = () => localStorage.getItem('qc_token')
const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' })

const dashboard = ref({})
const list = ref([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filterStatus = ref('')
const generating = ref(false)
const currentBatchId = ref('')
const batchStatus = ref([])
const detailVisible = ref(false)
const detail = ref(null)
let pollTimer = null

const pipelineSteps = ref([
  { label: '数据分析', status: 'pending' },
  { label: '脚本生成', status: 'pending' },
  { label: '视频生成', status: 'pending' },
  { label: '完成', status: 'pending' },
])

async function fetchJson(url, opts = {}) {
  const resp = await fetch(url, { headers: headers(), ...opts })
  return resp.json()
}

async function loadDashboard() {
  const res = await fetchJson(`${API}/dashboard`)
  if (res.code === 0) dashboard.value = res.data
}

async function loadList() {
  loading.value = true
  const params = new URLSearchParams({ page: page.value, pageSize: pageSize.value })
  if (filterStatus.value) params.append('status', filterStatus.value)
  const res = await fetchJson(`${API}/list?${params}`)
  if (res.code === 0) {
    list.value = res.data.list
    total.value = res.data.total
  }
  loading.value = false
}

async function handleGenerate() {
  generating.value = true
  pipelineSteps.value.forEach(s => s.status = 'pending')
  pipelineSteps.value[0].status = 'active'

  const res = await fetchJson(`${API}/generate`, { method: 'POST' })
  if (res.code === 0) {
    currentBatchId.value = res.data.batchId
    pipelineSteps.value[0].status = 'done'
    pipelineSteps.value[1].status = 'active'
    // 开始轮询
    pollTimer = setInterval(pollBatchStatus, 5000)
  } else {
    generating.value = false
    alert('启动失败: ' + res.msg)
  }
}

async function pollBatchStatus() {
  if (!currentBatchId.value) return
  const res = await fetchJson(`${API}/status/${currentBatchId.value}`)
  if (res.code === 0) {
    batchStatus.value = res.data.items
    // 更新进度
    const items = res.data.items
    if (items.some(i => i.pipeline_status === 'generating')) {
      pipelineSteps.value[1].status = 'done'
      pipelineSteps.value[2].status = 'active'
    }
    if (res.data.completed) {
      pipelineSteps.value.forEach(s => s.status = 'done')
      clearInterval(pollTimer)
      generating.value = false
      loadList()
      loadDashboard()
    }
  }
}

async function handlePush(id) {
  if (!confirm('确认推送到所有千川账户？')) return
  const res = await fetchJson(`${API}/push/${id}`, { method: 'POST' })
  alert(res.msg || '操作完成')
  setTimeout(loadList, 2000)
}

async function handleRetry(id) {
  const res = await fetchJson(`${API}/retry/${id}`, { method: 'POST' })
  alert(res.msg || '重试中')
  setTimeout(loadList, 3000)
}

async function showDetail(id) {
  const res = await fetchJson(`${API}/detail/${id}`)
  if (res.code === 0) {
    detail.value = res.data
    detailVisible.value = true
  }
}

async function showTracking(id) {
  await showDetail(id)
}

function changePage(p) {
  if (p < 1 || p > Math.ceil(total.value / pageSize.value)) return
  page.value = p
  loadList()
}

function formatNum(n) {
  const v = parseFloat(n || 0)
  return v >= 10000 ? (v / 10000).toFixed(1) + '万' : v.toFixed(0)
}
function formatTime(t) { return t ? t.replace('T', ' ').slice(0, 16) : '' }
function statusText(s) {
  const map = { analyzing: '分析中', scripting: '脚本生成', generating: '视频生成中', auditing: '审核中', ready: '待推送', pushed: '已推送', tracking: '跟踪中', completed: '已完成', failed: '失败' }
  return map[s] || s
}
function typeText(t) {
  const map = { high_convert: '高转化', ctr_boost: '高CTR', pain_point: '痛点共鸣' }
  return map[t] || t
}

onMounted(() => { loadDashboard(); loadList() })
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.hot-material-page { padding: 20px; max-width: 1400px; margin: 0 auto; }
.stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
.stat-card { flex: 1; min-width: 120px; background: #fff; border-radius: 12px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.stat-card.highlight { background: linear-gradient(135deg, #fff5f5, #ffe0e0); }
.stat-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
.stat-value.green { color: #10b981; }
.stat-value.blue { color: #3b82f6; }
.stat-value.orange { color: #f59e0b; }
.stat-value.red { color: #ef4444; }
.stat-label { font-size: 12px; color: #888; margin-top: 4px; }

.action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.action-left h2 { margin: 0; font-size: 20px; }
.desc { font-size: 12px; color: #888; }
.action-right { display: flex; gap: 10px; align-items: center; }
.status-filter { padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd; font-size: 13px; }
.btn-generate { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; border: none; padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }

.pipeline-progress { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.pipeline-title { font-size: 13px; color: #888; margin-bottom: 12px; }
.pipeline-steps { display: flex; gap: 0; margin-bottom: 16px; }
.step { flex: 1; text-align: center; position: relative; }
.step-dot { width: 12px; height: 12px; border-radius: 50%; background: #ddd; margin: 0 auto 6px; }
.step.active .step-dot { background: #667eea; box-shadow: 0 0 8px rgba(102,126,234,0.5); }
.step.done .step-dot { background: #10b981; }
.step-label { font-size: 12px; color: #666; }
.pipeline-items { display: flex; flex-direction: column; gap: 8px; }
.pipeline-item { display: flex; gap: 12px; align-items: center; padding: 8px; background: #f8f9fa; border-radius: 8px; }
.pipeline-item .idx { font-weight: 700; color: #667eea; }
.pipeline-item .title { flex: 1; }

.material-list { display: flex; flex-direction: column; gap: 16px; }
.material-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 4px solid #ddd; }
.material-card.hot { border-left-color: #ef4444; background: linear-gradient(135deg, #fff, #fff5f5); }
.card-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
.card-tags { display: flex; gap: 8px; align-items: center; }
.type-tag { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
.type-tag.high_convert { background: #dcfce7; color: #166534; }
.type-tag.ctr_boost { background: #dbeafe; color: #1e40af; }
.type-tag.pain_point { background: #fef3c7; color: #92400e; }
.status-tag { padding: 2px 10px; border-radius: 12px; font-size: 12px; }
.status-tag.ready { background: #e0f2fe; color: #0369a1; }
.status-tag.pushed { background: #dcfce7; color: #166534; }
.status-tag.tracking { background: #fef3c7; color: #92400e; }
.status-tag.completed { background: #d1fae5; color: #065f46; }
.status-tag.failed { background: #fee2e2; color: #991b1b; }
.status-tag.generating { background: #ede9fe; color: #5b21b6; }
.hot-badge { background: #ef4444; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.card-time { font-size: 12px; color: #999; }

.card-body { display: flex; gap: 20px; margin-bottom: 12px; }
.card-left { flex: 1; }
.card-title { margin: 0 0 8px; font-size: 16px; }
.card-metrics { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: #666; }
.card-metrics b { font-weight: 600; }
.card-metrics b.green { color: #10b981; }
.card-metrics b.red { color: #ef4444; }
.preview-video { width: 120px; height: 213px; object-fit: cover; border-radius: 8px; background: #000; }

.card-actions { display: flex; gap: 10px; }
.btn { padding: 6px 16px; border-radius: 8px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 13px; }
.btn-push { background: #667eea; color: #fff; border-color: #667eea; }
.btn-retry { background: #f59e0b; color: #fff; border-color: #f59e0b; }
.btn-track { background: #10b981; color: #fff; border-color: #10b981; }

.loading-box, .empty-box { text-align: center; padding: 60px; color: #888; }
.empty-box .hint { font-size: 13px; color: #aaa; }

.pagination { display: flex; justify-content: center; gap: 12px; align-items: center; margin-top: 20px; }
.pagination button { padding: 6px 16px; border-radius: 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
.pagination button:disabled { opacity: 0.5; cursor: not-allowed; }

/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center; }
.modal-content { background: #fff; border-radius: 16px; width: 90%; max-width: 700px; max-height: 85vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; }
.modal-close { background: none; border: none; font-size: 24px; cursor: pointer; }
.modal-body { padding: 20px; }
.detail-section { margin-bottom: 24px; }
.detail-section h4 { margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
.detail-row { margin-bottom: 8px; }
.detail-row label { font-weight: 600; margin-right: 8px; }

.hook-box { background: #fef3c7; padding: 10px; border-radius: 8px; margin-bottom: 10px; }
.scenes-list { display: flex; flex-direction: column; gap: 8px; }
.scene-item { background: #f8f9fa; padding: 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px; }
.scene-time { font-size: 12px; color: #667eea; font-weight: 600; }
.scene-desc { font-size: 13px; }
.scene-voice { font-size: 12px; color: #888; font-style: italic; }
.ccr-box { background: #ede9fe; padding: 10px; border-radius: 8px; margin-top: 10px; font-size: 13px; }
.cta-box { margin-top: 8px; font-size: 13px; }
.detail-video { width: 100%; max-width: 300px; border-radius: 8px; }
.push-record { display: flex; justify-content: space-between; padding: 8px; background: #f8f9fa; border-radius: 6px; margin-bottom: 4px; }
.track-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.track-table th, .track-table td { padding: 8px; text-align: center; border-bottom: 1px solid #f0f0f0; }
.track-table th { background: #f8f9fa; font-weight: 600; }
.green { color: #10b981; }
.red { color: #ef4444; }
</style>
