<template>
  <div class="live-comments">
    <div class="page-header">
      <h2 class="page-title">智能评论</h2>
      <div class="page-header__actions">
        <a-segmented v-model:value="activeTab" :options="['批量评论', 'AI自动回复', '评论统计']" />
      </div>
    </div>

    <!-- Tab: 批量评论 -->
    <template v-if="activeTab === '批量评论'">
      <div class="section-toolbar">
        <a-button type="primary" @click="showCreateTask = true">新建任务</a-button>
        <a-button @click="loadTasks">刷新</a-button>
      </div>
      <a-spin :spinning="loading">
        <div v-if="tasks.length" class="task-grid">
          <div v-for="task in tasks" :key="task.id" class="task-card">
            <div class="task-card__header">
              <span class="task-card__name">{{ task.name }}</span>
              <a-tag :color="statusColor(task.status)">{{ statusText(task.status) }}</a-tag>
            </div>
            <div class="task-card__meta">
              <span>{{ task.account_count }} 账号</span>
              <span class="dot">·</span>
              <span>{{ task.video_count }} 视频</span>
              <span class="dot">·</span>
              <span>{{ task.script_group || '默认话术' }}</span>
            </div>
            <a-progress :percent="task.progress || 0" :status="task.status === 'failed' ? 'exception' : task.status === 'completed' ? 'success' : 'active'" size="small" />
            <div class="task-card__stats">
              <div class="stat-item"><span class="stat-num stat-num--success">{{ task.success_count || 0 }}</span><span class="stat-label">成功</span></div>
              <div class="stat-item"><span class="stat-num stat-num--danger">{{ task.fail_count || 0 }}</span><span class="stat-label">失败</span></div>
              <div class="stat-item"><span class="stat-num">{{ task.filtered_count || 0 }}</span><span class="stat-label">过滤</span></div>
            </div>
            <div class="task-card__footer">
              <span class="task-card__time">{{ task.created_at }}</span>
              <div class="task-card__actions">
                <a-button v-if="task.status === 'pending'" type="link" size="small" @click="startTask(task.id)">启动</a-button>
                <a-button v-if="task.status === 'running'" type="link" size="small" danger @click="pauseTask(task.id)">暂停</a-button>
                <a-button type="link" size="small" @click="viewTaskDetail(task)">详情</a-button>
                <a-button type="link" size="small" danger @click="deleteTask(task.id)">删除</a-button>
              </div>
            </div>
          </div>
        </div>
        <a-empty v-else description="暂无评论任务，点击新建开始" />
      </a-spin>

      <!-- Create Task Drawer -->
      <a-drawer v-model:open="showCreateTask" title="新建批量评论任务" :width="isMobile ? '100%' : 520" placement="right">
        <a-form :model="taskForm" layout="vertical">
          <a-form-item label="任务名称" required>
            <a-input v-model:value="taskForm.name" placeholder="输入任务名称" />
          </a-form-item>
          <a-form-item label="视频ID列表">
            <a-textarea v-model:value="taskForm.video_ids" placeholder="每行一个视频ID或链接&#10;支持批量粘贴" :rows="4" />
          </a-form-item>
          <a-form-item label="选择账号">
            <div class="account-select-grid">
              <div v-for="acc in accounts" :key="acc.id" class="account-option" :class="{ 'account-option--selected': taskForm.account_ids.includes(acc.id) }" @click="toggleAccount(acc.id)">
                <div class="account-option__avatar">{{ acc.name?.charAt(0) || 'A' }}</div>
                <div class="account-option__info">
                  <div class="account-option__name">{{ acc.name }}</div>
                  <div class="account-option__uid">{{ acc.uid }}</div>
                </div>
                <div class="account-option__check" v-if="taskForm.account_ids.includes(acc.id)">✓</div>
              </div>
            </div>
          </a-form-item>
          <a-form-item label="话术分组">
            <a-select v-model:value="taskForm.script_group" placeholder="选择话术分组" allow-clear>
              <a-select-option v-for="g in scriptGroups" :key="g" :value="g">{{ g }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="评论间隔(秒)">
            <div class="interval-display">{{ taskForm.interval[0] }}s ~ {{ taskForm.interval[1] }}s (随机)</div>
            <a-slider v-model:value="taskForm.interval" :min="5" :max="120" range :marks="{ 5: '5s', 30: '30s', 60: '60s', 120: '2m' }" />
          </a-form-item>
          <a-form-item label="单视频最大评论数">
            <a-input-number v-model:value="taskForm.max_comments" :min="1" :max="999" style="width: 100%" />
          </a-form-item>
          <a-form-item label="风控设置">
            <a-checkbox v-model:checked="taskForm.risk_control">启用智能风控（自动调节频率、IP轮换、设备指纹随机化）</a-checkbox>
          </a-form-item>
        </a-form>
        <div class="drawer-footer">
          <a-button @click="showCreateTask = false" style="margin-right: 8px">取消</a-button>
          <a-button type="primary" :loading="submitting" @click="submitTask">创建任务</a-button>
        </div>
      </a-drawer>
    </template>

    <!-- Tab: AI自动回复 -->
    <template v-if="activeTab === 'AI自动回复'">
      <div class="ai-reply-section">
        <a-card :bordered="false" class="config-card">
          <div class="config-card__header">
            <div>
              <h3 class="config-card__title">AI 智能自动回复</h3>
              <p class="config-card__desc">自动检测评论意图，智能生成回复内容，维护口碑、促进转化</p>
            </div>
            <a-switch v-model:checked="aiConfig.enabled" checked-children="开启" un-checked-children="关闭" @change="saveAiConfig" />
          </div>
          <a-divider style="margin: 12px 0" />
          <div class="config-grid">
            <div class="config-item">
              <span class="config-item__label">检测间隔</span>
              <a-select v-model:value="aiConfig.pull_interval" style="width: 120px" @change="saveAiConfig">
                <a-select-option :value="30">30秒</a-select-option>
                <a-select-option :value="60">1分钟</a-select-option>
                <a-select-option :value="120">2分钟</a-select-option>
                <a-select-option :value="300">5分钟</a-select-option>
              </a-select>
            </div>
            <div class="config-item">
              <span class="config-item__label">回复速度</span>
              <a-select v-model:value="aiConfig.reply_speed" style="width: 120px" @change="saveAiConfig">
                <a-select-option value="fast">快速(5-15s)</a-select-option>
                <a-select-option value="normal">正常(15-45s)</a-select-option>
                <a-select-option value="slow">慢速(45-120s)</a-select-option>
              </a-select>
            </div>
            <div class="config-item">
              <span class="config-item__label">日回复上限</span>
              <a-input-number v-model:value="aiConfig.daily_limit" :min="10" :max="500" @change="saveAiConfig" />
            </div>
          </div>
        </a-card>

        <a-card title="回复类别策略" :bordered="false" style="margin-top: 12px">
          <div class="reply-strategy-grid">
            <div v-for="strategy in replyStrategies" :key="strategy.key" class="strategy-card">
              <div class="strategy-card__header">
                <span class="strategy-card__icon" :style="{ background: strategy.color + '20', color: strategy.color }">{{ strategy.icon }}</span>
                <span class="strategy-card__name">{{ strategy.name }}</span>
                <a-switch v-model:checked="strategy.enabled" size="small" />
              </div>
              <p class="strategy-card__desc">{{ strategy.desc }}</p>
              <div class="strategy-card__sample">
                <span class="sample-label">示例回复：</span>
                <span class="sample-text">{{ strategy.sample }}</span>
              </div>
            </div>
          </div>
        </a-card>

        <a-card title="近期回复记录" :bordered="false" style="margin-top: 12px">
          <div class="reply-log-list">
            <div v-for="log in replyLogs" :key="log.id" class="reply-log-item">
              <div class="reply-log-item__header">
                <a-tag :color="categoryColor(log.category)" size="small">{{ categoryText(log.category) }}</a-tag>
                <span class="reply-log-item__time">{{ log.time }}</span>
              </div>
              <div class="reply-log-item__original">
                <span class="reply-log-item__user">{{ log.user }}：</span>{{ log.comment }}
              </div>
              <div class="reply-log-item__reply">
                <span class="reply-prefix">→ AI回复：</span>{{ log.reply }}
              </div>
            </div>
            <a-empty v-if="!replyLogs.length" description="暂无回复记录" />
          </div>
        </a-card>
      </div>
    </template>

    <!-- Tab: 评论统计 -->
    <template v-if="activeTab === '评论统计'">
      <div class="stats-section">
        <div class="stats-cards">
          <div class="stats-card">
            <div class="stats-card__value">{{ commentStats.total_today }}</div>
            <div class="stats-card__label">今日评论</div>
          </div>
          <div class="stats-card">
            <div class="stats-card__value">{{ commentStats.ai_replies }}</div>
            <div class="stats-card__label">AI回复</div>
          </div>
          <div class="stats-card">
            <div class="stats-card__value">{{ commentStats.success_rate }}%</div>
            <div class="stats-card__label">成功率</div>
          </div>
          <div class="stats-card">
            <div class="stats-card__value">{{ commentStats.avg_response }}</div>
            <div class="stats-card__label">平均响应</div>
          </div>
        </div>
        <a-card title="评论趋势" :bordered="false" style="margin-top: 12px">
          <div ref="statsChartRef" style="height: 280px"></div>
        </a-card>
        <a-card title="账号评论分布" :bordered="false" style="margin-top: 12px">
          <a-table :dataSource="accountStats" :columns="accountStatsColumns" :pagination="false" size="small" />
        </a-card>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'

const isMobile = ref(window.innerWidth < 768)
const handleResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))

const activeTab = ref('批量评论')
const loading = ref(false)
const submitting = ref(false)
const showCreateTask = ref(false)
const tasks = ref([])
const accounts = ref([])
const scriptGroups = ref(['正面引导', '产品卖点', '优惠福利', '问题解答', '互动话术'])

const taskForm = reactive({
  name: '', video_ids: '', account_ids: [], script_group: null,
  interval: [15, 45], max_comments: 50, risk_control: true,
})

const aiConfig = reactive({
  enabled: false, pull_interval: 60, reply_speed: 'normal', daily_limit: 200,
})

const replyStrategies = ref([
  { key: 'positive', name: '正面评论', icon: '👍', color: '#00B96B', enabled: true, desc: '对正面评论表达感谢，增强用户好感', sample: '感谢您的认可～我们会继续努力！' },
  { key: 'inquiry', name: '咨询询问', icon: '❓', color: '#1677FF', enabled: true, desc: '针对产品咨询给出详细解答，促进转化', sample: '这款有S/M/L三个尺码哦，详情页有尺码表～' },
  { key: 'negative', name: '负面评论', icon: '⚠️', color: '#FF4D4F', enabled: true, desc: '安抚不满情绪，引导私信沟通', sample: '非常抱歉给您带来不好的体验，已安排专人跟进处理～' },
  { key: 'question', name: '售后问题', icon: '🔧', color: '#FF8A00', enabled: true, desc: '快速回应售后问题，降低差评率', sample: '亲，您的问题我们已经记录，会尽快为您处理～' },
])

const replyLogs = ref([])
const replyLogsLoading = ref(false)

const commentStats = ref({ total_today: 0, ai_replies: 0, success_rate: '0', avg_response: '-' })
const accountStats = ref([])
const trendData = ref([])
const accountStatsColumns = [
  { title: '账号', dataIndex: 'account', key: 'account' },
  { title: '今日评论', dataIndex: 'today', key: 'today' },
  { title: 'AI回复', dataIndex: 'ai', key: 'ai' },
  { title: '成功率', dataIndex: 'success', key: 'success' },
  { title: '风控状态', dataIndex: 'risk', key: 'risk' },
]

const statusColor = (s) => ({ pending: 'default', running: 'processing', completed: 'success', failed: 'error', paused: 'warning' }[s] || 'default')
const statusText = (s) => ({ pending: '待执行', running: '执行中', completed: '已完成', failed: '失败', paused: '已暂停' }[s] || s)
const categoryColor = (c) => ({ positive: 'green', inquiry: 'blue', negative: 'red', question: 'orange' }[c] || 'default')
const categoryText = (c) => ({ positive: '正面', inquiry: '咨询', negative: '负面', question: '售后' }[c] || c)

const toggleAccount = (id) => {
  const idx = taskForm.account_ids.indexOf(id)
  if (idx >= 0) taskForm.account_ids.splice(idx, 1)
  else taskForm.account_ids.push(id)
}

const loadTasks = async () => {
  loading.value = true
  try {
    const res = await request.get('/live/comment-tasks')
    tasks.value = res?.data || []
  } catch (e) {
    console.warn('loadTasks failed:', e)
    tasks.value = []
  } finally { loading.value = false }
}

const loadAccounts = async () => {
  try {
    const res = await request.get('/live/accounts')
    accounts.value = res?.data || []
  } catch (e) {
    console.warn('loadAccounts failed:', e)
    accounts.value = []
  }
}

const startTask = async (id) => { try { await request.post(`/live/comment-tasks/${id}/start`); message.success('任务已启动'); loadTasks() } catch (e) { message.error('启动失败: ' + (e.message || '请重试')) } }
const pauseTask = async (id) => { try { await request.post(`/live/comment-tasks/${id}/pause`); message.success('任务已暂停'); loadTasks() } catch (e) { message.error('暂停失败: ' + (e.message || '请重试')) } }
const deleteTask = async (id) => { try { await request.delete(`/live/comment-tasks/${id}`); message.success('已删除'); loadTasks() } catch (e) { message.error('删除失败: ' + (e.message || '请重试')) } }
const viewTaskDetail = (task) => { message.info(`查看任务详情: ${task.name}`) }
const saveAiConfig = () => { message.success('配置已保存') }

const submitTask = async () => {
  if (!taskForm.name) { message.warning('请输入任务名称'); return }
  submitting.value = true
  try {
    await request.post('/live/comment-tasks', taskForm)
    message.success('任务创建成功')
    showCreateTask.value = false
    loadTasks()
  } catch (e) { message.error('创建失败: ' + (e.message || '请重试')) }
  finally { submitting.value = false }
}

const statsChartRef = ref(null)
let statsChart

// 加载评论日志（来自 ops_comment_logs）
const loadReplyLogs = async () => {
  replyLogsLoading.value = true
  try {
    const res = await request.get('/live/comment-logs', { params: { pageSize: 20 } })
    const list = res?.data?.list || []
    replyLogs.value = list.map(item => ({
      id: item.id,
      category: mapCategory(item.ai_category),
      time: item.created_at ? item.created_at.substring(11, 16) : '',
      user: item.douyin_nickname || '用户',
      comment: item.original_comment || '',
      reply: item.reply_content || '',
    }))
  } catch (e) {
    console.warn('loadReplyLogs failed:', e)
    replyLogs.value = []
  } finally {
    replyLogsLoading.value = false
  }
}

// 映射 ai_category 到前端类别
const mapCategory = (cat) => {
  const map = { positive: 'positive', inquiry: 'inquiry', negative: 'negative', question: 'question', 'after-sales': 'question' }
  return map[cat] || 'inquiry'
}

// 加载评论统计
const loadCommentStats = async () => {
  try {
    const res = await request.get('/live/comment-stats')
    const data = res?.data || {}
    commentStats.value = {
      total_today: data.total_today || 0,
      ai_replies: data.ai_replies || 0,
      success_rate: data.success_rate || '0',
      avg_response: '-',
    }
    accountStats.value = data.publishers || []
    trendData.value = data.trend || []
  } catch (e) {
    console.warn('loadCommentStats failed:', e)
  }
}

const renderStatsChart = () => {
  if (!statsChartRef.value || !trendData.value.length) return
  statsChart?.dispose()
  statsChart = echarts.init(statsChartRef.value)
  const days = trendData.value.map(r => r.day)
  statsChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['总评论', 'AI回复', '成功率'] },
    grid: { left: 40, right: 40, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: days },
    yAxis: [{ type: 'value', name: '数量' }, { type: 'value', name: '%', max: 100 }],
    series: [
      { name: '总评论', type: 'bar', data: trendData.value.map(r => r.total || 0), itemStyle: { color: '#1677FF', borderRadius: [4, 4, 0, 0] } },
      { name: 'AI回复', type: 'bar', data: trendData.value.map(r => r.ai_replies || 0), itemStyle: { color: '#00B96B', borderRadius: [4, 4, 0, 0] } },
      { name: '成功率', type: 'line', yAxisIndex: 1, smooth: true, lineStyle: { color: '#FF8A00' }, itemStyle: { color: '#FF8A00' }, data: trendData.value.map(r => r.success_rate || 0) },
    ]
  })
}

watch(activeTab, async (v) => {
  if (v === 'AI自动回复') {
    loadReplyLogs()
  }
  if (v === '评论统计') {
    await loadCommentStats()
    await nextTick()
    renderStatsChart()
  }
})

onMounted(() => { loadTasks(); loadAccounts() })
onUnmounted(() => { statsChart?.dispose() })
</script>

<style scoped>
.live-comments { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; margin: 0; }
.section-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }

.task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.task-card { background: #fff; border-radius: 10px; padding: 16px; border: 1px solid var(--border); }
.task-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.task-card__name { font-weight: 600; font-size: 14px; }
.task-card__meta { display: flex; gap: 4px; font-size: 12px; color: var(--text-hint); margin-bottom: 10px; }
.dot { color: var(--text-hint); }
.task-card__stats { display: flex; gap: 16px; margin: 10px 0 8px; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-num { font-size: 16px; font-weight: 700; }
.stat-num--success { color: var(--c-success); }
.stat-num--danger { color: var(--c-danger); }
.stat-label { font-size: 11px; color: var(--text-hint); }
.task-card__footer { display: flex; justify-content: space-between; align-items: center; }
.task-card__time { font-size: 11px; color: var(--text-hint); }
.task-card__actions { display: flex; }

.account-select-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.account-option {
  display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 8px;
  border: 1px solid var(--border); cursor: pointer; transition: all 0.2s;
}
.account-option:hover { border-color: var(--c-primary); }
.account-option--selected { border-color: var(--c-primary); background: var(--c-primary-bg); }
.account-option__avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
.account-option__name { font-size: 13px; font-weight: 500; }
.account-option__uid { font-size: 11px; color: var(--text-hint); }
.account-option__check { color: var(--c-primary); font-weight: 700; margin-left: auto; }
.interval-display { font-size: 13px; color: var(--c-primary); font-weight: 500; margin-bottom: 4px; }
.drawer-footer { display: flex; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--divider); margin-top: 16px; }

/* AI Reply Section */
.config-card { border-radius: 10px; }
.config-card__header { display: flex; justify-content: space-between; align-items: flex-start; }
.config-card__title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
.config-card__desc { font-size: 12px; color: var(--text-hint); margin: 0; }
.config-grid { display: flex; gap: 20px; flex-wrap: wrap; }
.config-item { display: flex; align-items: center; gap: 8px; }
.config-item__label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }

.reply-strategy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.strategy-card { padding: 14px; border: 1px solid var(--border); border-radius: 10px; }
.strategy-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.strategy-card__icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.strategy-card__name { font-weight: 600; font-size: 13px; flex: 1; }
.strategy-card__desc { font-size: 12px; color: var(--text-hint); margin: 0 0 8px; }
.strategy-card__sample { font-size: 12px; background: var(--bg-secondary); padding: 8px; border-radius: 6px; }
.sample-label { color: var(--text-hint); }
.sample-text { color: var(--text-secondary); }

.reply-log-list { display: flex; flex-direction: column; gap: 12px; }
.reply-log-item { padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
.reply-log-item__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.reply-log-item__time { font-size: 11px; color: var(--text-hint); }
.reply-log-item__original { font-size: 13px; margin-bottom: 6px; }
.reply-log-item__user { font-weight: 500; color: var(--c-primary); }
.reply-log-item__reply { font-size: 13px; color: var(--c-success); padding-left: 12px; border-left: 2px solid var(--c-success); }
.reply-prefix { font-weight: 500; }

/* Stats */
.stats-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.stats-card { background: #fff; border-radius: 10px; padding: 16px; text-align: center; border: 1px solid var(--border); }
.stats-card__value { font-size: 24px; font-weight: 700; color: var(--c-primary); }
.stats-card__label { font-size: 12px; color: var(--text-hint); margin-top: 4px; }

@media (max-width: 767px) {
  .task-grid { grid-template-columns: 1fr; }
  .account-select-grid { grid-template-columns: 1fr; }
  .reply-strategy-grid { grid-template-columns: 1fr; }
  .stats-cards { grid-template-columns: repeat(2, 1fr); }
  .config-grid { flex-direction: column; gap: 12px; }
}
</style>
