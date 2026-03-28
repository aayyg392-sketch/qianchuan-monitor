<template>
  <div class="ops-wb">
    <!-- [A] Hero 渐变顶栏 -->
    <div class="ops-hero">
      <div class="ops-hero__top">
        <h2 class="ops-hero__title">运营中心</h2>
        <button class="ops-hero__icon-btn" @click="refreshAll" :disabled="refreshing">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        </button>
      </div>
      <div class="ops-hero__controls">
        <div class="ops-hero__switch">
          <a-switch v-model:checked="aiReplyEnabled" :loading="aiSwitchLoading" @change="handleAiToggle" size="small" />
          <span class="ops-hero__switch-text">
            AI自动回复
            <span class="ops-hero__dot" :class="aiReplyEnabled ? 'ops-hero__dot--on' : ''"></span>
            <span>{{ aiReplyEnabled ? '运行中' : '已关闭' }}</span>
          </span>
        </div>
        <button class="ops-hero__pull-btn" :disabled="pullLoading" @click="handlePullComments">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ pullLoading ? '拉取中...' : '拉取评论' }}
        </button>
      </div>
    </div>

    <!-- [B] KPI 指标网格 -->
    <div class="ops-content">
      <div class="stat-grid ops-kpi-overlap">
        <div v-for="card in metricCards" :key="card.key" class="stat-card">
          <div class="stat-card__top">
            <span class="stat-card__label">{{ card.label }}</span>
            <span class="stat-card__badge" :style="{ background: card.color + '18', color: card.color }">
              <span v-html="card.icon"></span>
            </span>
          </div>
          <div class="stat-card__value" :style="{ color: card.color }">{{ card.value }}</div>
          <div class="stat-card__bottom">
            <span class="stat-card__prev">回复率 {{ successRate }}%</span>
          </div>
        </div>
      </div>

      <!-- [C] 评论分类标签 -->
      <div v-if="categoryList.length" class="ops-cats">
        <span v-for="cat in categoryList" :key="cat.key" class="ops-cat-pill"
              :style="{ background: cat.bg, color: cat.color }">
          {{ cat.label }} {{ cat.count }}
        </span>
      </div>

      <!-- [D] 待处理事项 -->
      <div v-if="alerts.length" class="dt-card">
        <div class="dt-card__head">
          <span class="dt-card__title">待处理</span>
          <span class="dt-card__badge dt-card__badge--orange">{{ alerts.length }}项</span>
        </div>
        <div class="dt-card__body--list">
          <div v-for="alert in alerts" :key="alert.id" class="ops-alert-row" @click="handleAlertAction(alert)">
            <span class="ops-alert-row__icon" :class="`ops-alert-row__icon--${alert.level}`">
              <svg v-if="alert.level==='error'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
            </span>
            <div class="ops-alert-row__body">
              <div class="ops-alert-row__title">{{ alert.title }}</div>
              <div class="ops-alert-row__desc">{{ alert.description }}</div>
            </div>
            <svg class="ops-alert-row__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bfbfbf" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      <!-- [E] 最新评论回复 -->
      <div class="dt-card">
        <div class="dt-card__head">
          <span class="dt-card__title">最新评论回复</span>
          <span class="dt-card__badge dt-card__badge--blue">{{ filteredActivity.length }}条</span>
        </div>
        <div class="dt-card__body--list">
          <div v-for="(item, idx) in filteredActivity" :key="idx" class="ops-reply-item">
            <div class="ops-reply-item__user">
              <span class="ops-reply-item__name">{{ item.douyin_nickname || '用户' }}</span>
              <span v-if="item.douyin_id" class="ops-reply-item__id">{{ item.douyin_id }}</span>
              <a-tag v-if="item.ai_category" :color="catColorMap[item.ai_category]" size="small">{{ catLabelMap[item.ai_category] || item.ai_category }}</a-tag>
              <span class="ops-reply-item__time">{{ formatTime(item.created_at || item.timestamp) }}</span>
            </div>
            <div class="ops-reply-item__comment">{{ item.original_comment || item.description }}</div>
            <div v-if="item.reply_content" class="ops-reply-item__reply">
              <span class="ops-reply-item__ai-tag">AI回复</span>
              {{ item.reply_content }}
            </div>
          </div>
          <div v-if="!filteredActivity.length" class="ops-empty-tip">暂无评论回复记录</div>
        </div>
      </div>

      <!-- [F] 抖音号统计 -->
      <div v-if="accountStats.length" class="dt-card">
        <div class="dt-card__head">
          <span class="dt-card__title">发布账号统计</span>
          <span class="dt-card__badge dt-card__badge--blue">{{ accountStats.length }}个</span>
        </div>
        <div class="dt-card__body--list">
          <div v-for="acc in accountStats" :key="acc.aweme_id" class="ops-acc-row">
            <div class="ops-acc-row__left">
              <div class="ops-acc-row__avatar">{{ (acc.aweme_name || '?')[0] }}</div>
              <div class="ops-acc-row__info">
                <div class="ops-acc-row__name">{{ acc.aweme_name || acc.aweme_id }}</div>
                <div class="ops-acc-row__id" v-if="acc.aweme_id">抖音号: {{ acc.aweme_id }}</div>
              </div>
            </div>
            <div class="ops-acc-row__stats">
              <span class="ops-acc-row__num"><em style="color:var(--c-primary)">{{ acc.total_comments }}</em> 评论</span>
              <span class="ops-acc-row__num"><em style="color:var(--c-success)">{{ acc.replied_count }}</em> 回复</span>
              <span class="ops-acc-row__num"><em style="color:var(--c-danger)">{{ acc.hidden_count }}</em> 屏蔽</span>
              <span class="ops-acc-row__num"><em style="color:var(--c-purple)">{{ acc.pending_count }}</em> 待处理</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ops-safe-bottom"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import request from '@/utils/request'

const router = useRouter()

const refreshing = ref(false)
const aiReplyEnabled = ref(false)
const aiSwitchLoading = ref(false)
const pullLoading = ref(false)
const activeAccounts = ref(0)
const activityList = ref([])
const alerts = ref([])
const accountStats = ref([])
const accountStatsLoading = ref(false)
const successRate = ref(0)
const categoryList = ref([])
const isMobile = ref(window.innerWidth < 768)

const metricCards = reactive([
  { key: 'pulled', label: '拉取评论', value: '--', color: 'var(--c-primary)', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
  { key: 'replies', label: 'AI回复', value: '--', color: 'var(--c-success)', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' },
  { key: 'hidden', label: '已屏蔽', value: '--', color: 'var(--c-danger)', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' },
  { key: 'pending', label: '待处理', value: '--', color: 'var(--c-purple)', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
])

const catColorMap = { positive: 'green', inquiry: 'blue', negative: 'red', question: 'orange', other: 'default' }
const catLabelMap = { positive: '好评', inquiry: '咨询', negative: '差评', question: '疑问', other: '其他' }

const filteredActivity = computed(() => {
  return activityList.value.filter(i => i.reply_content).slice(0, isMobile.value ? 10 : 20)
})

let refreshTimer = null
function onResize() { isMobile.value = window.innerWidth < 768 }

onMounted(() => {
  loadAll()
  refreshTimer = setInterval(loadAll, 60000)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  window.removeEventListener('resize', onResize)
})

async function loadAll() {
  try { await Promise.all([loadOverview(), loadAiConfig(), loadActivityLogs(), loadAlerts(), loadAccountStats()]) } catch {}
}
async function refreshAll() {
  refreshing.value = true
  try { await loadAll(); message.success('刷新成功') } finally { refreshing.value = false }
}

async function loadOverview() {
  try {
    const res = await request.get('/operations/overview')
    const d = res.data || {}
    metricCards[0].value = d.today_comments ?? 0
    metricCards[1].value = d.today_replies ?? 0
    metricCards[2].value = d.hidden_comments ?? 0
    metricCards[3].value = d.pending_comments ?? 0
    activeAccounts.value = d.active_accounts ?? 0
    successRate.value = d.success_rate ?? 0
    const cats = d.categories || {}
    categoryList.value = [
      { key: 'positive', label: '好评', count: cats.positive || 0, color: 'var(--c-success)', bg: 'var(--c-success-bg)' },
      { key: 'inquiry', label: '咨询', count: cats.inquiry || 0, color: 'var(--c-primary)', bg: 'var(--c-primary-bg)' },
      { key: 'negative', label: '差评', count: cats.negative || 0, color: 'var(--c-danger)', bg: 'var(--c-danger-bg)' },
      { key: 'question', label: '疑问', count: cats.question || 0, color: 'var(--c-warning)', bg: 'var(--c-warning-bg)' },
      { key: 'other', label: '其他', count: cats.other || 0, color: 'var(--text-hint)', bg: 'var(--bg-secondary)' },
    ].filter(c => c.count > 0)
  } catch {}
}
async function loadAiConfig() {
  try { const res = await request.get('/operations/ai-reply/config'); aiReplyEnabled.value = !!(res.data || {}).enabled } catch {}
}
async function loadActivityLogs() {
  try { const res = await request.get('/operations/ai-reply/logs', { params: { limit: 20 } }); activityList.value = res.data || [] } catch {}
}
async function loadAlerts() {
  try {
    const res = await request.get('/operations/pending-alerts')
    const d = res.data || {}; const list = []
    if (d.expiredAccounts?.length) d.expiredAccounts.forEach(a => list.push({ id: `exp-${a.id}`, level: 'error', title: 'Token即将过期', description: `${a.account_name} 的Token将在24小时内过期`, route: '/settings' }))
    if (d.riskAccounts?.length) d.riskAccounts.forEach(a => list.push({ id: `risk-${a.id}`, level: 'warning', title: '接近频率限制', description: `${a.account_name} 今日已发${a.daily_comment_count}条` }))
    if (d.pendingReplies > 10) list.push({ id: 'pending', level: 'info', title: '评论积压', description: `${d.pendingReplies}条评论待处理`, route: '/ops-comments' })
    alerts.value = list
  } catch {}
}
async function loadAccountStats() {
  accountStatsLoading.value = true
  try { const res = await request.get('/operations/account-stats'); accountStats.value = res.data || [] } catch {} finally { accountStatsLoading.value = false }
}

async function handleAiToggle(val) {
  aiSwitchLoading.value = true
  try { await request.put('/operations/ai-reply/config', { enabled: val ? 1 : 0 }); message.success(val ? 'AI自动回复已开启' : 'AI自动回复已关闭') } catch { aiReplyEnabled.value = !val } finally { aiSwitchLoading.value = false }
}
async function handlePullComments() {
  pullLoading.value = true
  try { const res = await request.post('/operations/comments/pull'); message.success(res.data?.msg || `拉取完成`); await loadAll() } catch { message.error('拉取失败') } finally { pullLoading.value = false }
}
function handleAlertAction(alert) { if (alert.route) router.push(alert.route) }

function getActivityColor(item) {
  if (item.status === 'success') return 'var(--c-success)'
  if (item.status === 'failed') return 'var(--c-danger)'
  return 'var(--c-primary)'
}
function getActivityBg(item) {
  if (item.status === 'success') return 'var(--c-success-bg)'
  if (item.status === 'failed') return 'var(--c-danger-bg)'
  return 'var(--c-primary-bg)'
}
function formatTime(t) {
  if (!t) return ''
  const d = new Date(t), now = new Date(), diff = (now - d) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.ops-hero {
  background: linear-gradient(135deg, var(--c-primary) 0%, #4E8EFF 100%);
  padding: 16px 16px 40px; border-radius: 0 0 var(--radius-xl) var(--radius-xl); color: #fff;
}
.ops-hero__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.ops-hero__title { font-size: 18px; font-weight: 700; color: #fff; margin: 0; }
.ops-hero__icon-btn {
  background: rgba(255,255,255,0.15); border: none; color: #fff; width: 32px; height: 32px;
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.ops-hero__icon-btn:active { background: rgba(255,255,255,0.3); }
.ops-hero__controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ops-hero__switch { display: flex; align-items: center; gap: 8px; }
.ops-hero__switch-text { font-size: 13px; color: rgba(255,255,255,0.9); display: flex; align-items: center; gap: 4px; }
.ops-hero__dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.4); display: inline-block; }
.ops-hero__dot--on { background: #52ff8a; box-shadow: 0 0 6px #52ff8a; }
.ops-hero__pull-btn {
  background: rgba(255,255,255,0.18); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.35); color: #fff; border-radius: var(--radius-sm);
  padding: 6px 14px; font-size: 13px; font-weight: 500; cursor: pointer;
  display: flex; align-items: center; gap: 5px; white-space: nowrap;
}
.ops-hero__pull-btn:active { background: rgba(255,255,255,0.35); }
.ops-hero__pull-btn:disabled { opacity: 0.6; }

.ops-content { padding: 0 14px; }
.ops-kpi-overlap { margin-top: -24px; position: relative; z-index: 1; }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.stat-card {
  background: #fff; border-radius: var(--radius-md); padding: 14px 14px 10px;
  box-shadow: var(--shadow-xs); border: 1px solid var(--border); transition: all 0.2s;
}
.stat-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.stat-card__label { font-size: 11px; color: var(--text-hint); font-weight: 500; }
.stat-card__badge { width: 26px; height: 26px; border-radius: var(--radius-xs); display: flex; align-items: center; justify-content: center; }
.stat-card__value { font-size: 22px; font-weight: 700; line-height: 1.1; margin-bottom: 8px; }
.stat-card__bottom { display: flex; align-items: center; }
.stat-card__prev { font-size: 10px; color: var(--text-hint); }

.ops-cats { display: flex; gap: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 14px; padding: 2px 0; }
.ops-cats::-webkit-scrollbar { display: none; }
.ops-cat-pill { padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }

.dt-card { background: #fff; border-radius: var(--radius-md); box-shadow: var(--shadow-xs); border: 1px solid var(--border); margin-bottom: 12px; overflow: hidden; }
.dt-card__head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px 11px; border-bottom: 1px solid var(--divider); }
.dt-card__title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.dt-card__badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 100px; }
.dt-card__badge--blue { background: var(--c-primary-bg); color: var(--c-primary); }
.dt-card__badge--orange { background: var(--c-warning-bg); color: var(--c-warning); }
.dt-card__body--list { padding: 0; }
.seg-tabs { display: flex; background: var(--bg-secondary); border-radius: var(--radius-xs); padding: 2px; gap: 1px; }
.seg-tab { padding: 3px 10px; border: none; background: none; border-radius: 4px; font-size: 11px; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.seg-tab.active { background: #fff; color: var(--c-primary); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

.ops-alert-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--divider); cursor: pointer; }
.ops-alert-row:last-child { border-bottom: none; }
.ops-alert-row:active { background: var(--bg-secondary); }
.ops-alert-row__icon { width: 32px; height: 32px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ops-alert-row__icon--error { background: var(--c-danger-bg); color: var(--c-danger); }
.ops-alert-row__icon--warning { background: var(--c-warning-bg); color: var(--c-warning); }
.ops-alert-row__icon--info { background: var(--c-primary-bg); color: var(--c-primary); }
.ops-alert-row__body { flex: 1; min-width: 0; }
.ops-alert-row__title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.ops-alert-row__desc { font-size: 12px; color: var(--text-hint); margin-top: 2px; }
.ops-alert-row__arrow { flex-shrink: 0; }

.ops-reply-item { padding: 12px 16px; border-bottom: 1px solid var(--divider); }
.ops-reply-item:last-child { border-bottom: none; }
.ops-reply-item__user { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.ops-reply-item__name { font-size: 13px; font-weight: 600; color: var(--c-primary); }
.ops-reply-item__id { font-size: 11px; color: var(--text-hint); }
.ops-reply-item__time { font-size: 11px; color: var(--text-hint); margin-left: auto; }
.ops-reply-item__comment { font-size: 13px; color: var(--text-primary); line-height: 1.5; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ops-reply-item__reply { font-size: 12px; color: var(--c-success); background: var(--c-success-bg); padding: 8px 12px; border-radius: var(--radius-sm); line-height: 1.5; border-left: 3px solid var(--c-success); }
.ops-reply-item__ai-tag { display: inline-block; font-size: 10px; font-weight: 700; background: var(--c-success); color: #fff; padding: 1px 5px; border-radius: 3px; margin-right: 5px; vertical-align: middle; }
.ops-empty-tip { padding: 32px 16px; text-align: center; font-size: 13px; color: var(--text-hint); }

.ops-acc-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--divider); gap: 12px; flex-wrap: wrap; }
.ops-acc-row:last-child { border-bottom: none; }
.ops-acc-row__left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ops-acc-row__avatar { width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--c-primary-bg); color: var(--c-primary); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
.ops-acc-row__info { min-width: 0; }
.ops-acc-row__name { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
.ops-acc-row__id { font-size: 11px; color: var(--text-hint); }
.ops-acc-row__stats { display: flex; gap: 10px; flex-shrink: 0; }
.ops-acc-row__num { font-size: 11px; color: var(--text-hint); white-space: nowrap; }
.ops-acc-row__num em { font-style: normal; font-weight: 700; font-size: 15px; }
.ops-safe-bottom { height: calc(var(--tabnav-h) + var(--safe-b) + 16px); }

@media (min-width: 768px) {
  .ops-hero { padding: 20px 24px 44px; }
  .ops-content { padding: 0 24px; max-width: 960px; margin: 0 auto; }
  .stat-grid { grid-template-columns: repeat(4, 1fr); }
  .stat-card { padding: 18px; }
  .stat-card__value { font-size: 26px; }
  .stat-card:hover { border-color: var(--c-primary); box-shadow: var(--shadow-sm); }
  .ops-cats { flex-wrap: wrap; overflow: visible; }
  .ops-feed-item__comment { -webkit-line-clamp: 3; }
  .ops-acc-row { flex-wrap: nowrap; }
  .ops-acc-row__name { max-width: 300px; }
  .ops-alert-row:hover { background: var(--bg-secondary); }
  .ops-safe-bottom { height: 24px; }
}
</style>
