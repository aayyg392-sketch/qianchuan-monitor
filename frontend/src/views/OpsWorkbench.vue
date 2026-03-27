<template>
  <div class="ops-workbench">
    <a-spin :spinning="loading">
      <!-- Header -->
      <div class="page-header">
        <div class="page-header__left">
          <h2 class="page-title">运营中心</h2>
          <span class="page-subtitle">实时看板</span>
        </div>
        <a-button size="small" @click="refreshAll" :loading="refreshing">
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>
      </div>

      <!-- Section 1: 运营状态 -->
      <div class="status-bar">
        <div class="status-bar__left">
          <div class="status-bar__switch">
            <span class="status-bar__label">AI自动回复</span>
            <a-switch
              v-model:checked="aiReplyEnabled"
              :loading="aiSwitchLoading"
              @change="handleAiToggle"
            />
          </div>
          <span class="status-bar__text" :class="aiReplyEnabled ? 'status-bar__text--active' : ''">
            {{ aiReplyEnabled ? '运行中·每5分钟拉取' : '已关闭' }}
          </span>
        </div>
        <div class="status-bar__right">
          <a-badge :count="activeAccounts" :overflow-count="999" class="status-bar__badge">
            <span class="status-bar__badge-label">活跃账户</span>
          </a-badge>
          <a-button
            type="primary"
            size="small"
            :loading="pullLoading"
            @click="handlePullComments"
          >
            <template #icon><CloudDownloadOutlined /></template>
            一键拉取评论
          </a-button>
        </div>
      </div>

      <!-- Section 2: 今日数据 -->
      <div class="section">
        <div class="section-title">今日数据</div>
        <div class="metrics-scroll">
          <div class="metrics-grid">
            <div
              v-for="item in metricCards"
              :key="item.key"
              class="metric-card"
              :style="{ borderTop: `3px solid ${item.color}` }"
            >
              <div class="metric-card__label">{{ item.label }}</div>
              <div class="metric-card__value">
                <span :style="{ color: item.color }">{{ item.value }}</span>
                <span
                  v-if="item.trend !== undefined && item.trend !== null"
                  class="metric-card__trend"
                  :class="item.trend >= 0 ? 'trend-up' : 'trend-down'"
                >
                  <ArrowUpOutlined v-if="item.trend >= 0" />
                  <ArrowDownOutlined v-else />
                  {{ Math.abs(item.trend).toFixed(1) }}%
                </span>
              </div>
              <div class="metric-card__sub">较昨日</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: 最新动态 -->
      <div class="section">
        <div class="section-title">
          最新动态
          <a-badge :count="activityList.length" :number-style="{ backgroundColor: '#1677ff' }" />
        </div>
        <div v-if="activityList.length" class="activity-feed">
          <div
            v-for="(item, idx) in activityList"
            :key="idx"
            class="activity-item"
          >
            <div class="activity-item__dot" :style="{ background: getActivityColor(item) }"></div>
            <div class="activity-item__body">
              <div class="activity-item__content">
                <component :is="getActivityIcon(item)" class="activity-item__icon" />
                <span class="activity-item__text">{{ item.description }}</span>
                <a-tag
                  v-if="item.ai_category"
                  :color="categoryColorMap[item.ai_category] || 'default'"
                  size="small"
                  class="activity-item__tag"
                >
                  {{ item.ai_category }}
                </a-tag>
              </div>
              <div class="activity-item__time">{{ formatTime(item.created_at || item.timestamp) }}</div>
            </div>
          </div>
        </div>
        <a-empty
          v-else
          description="暂无动态，开启AI自动回复后将显示实时记录"
          :image-style="{ height: '60px' }"
        />
      </div>

      <!-- Section 4: 待处理事项 -->
      <div class="section">
        <div class="section-title">
          待处理事项
          <a-badge :count="alerts.length" :offset="[8, -2]" />
        </div>
        <div v-if="alerts.length" class="alerts-list">
          <div
            v-for="alert in alerts"
            :key="alert.id"
            class="alert-card"
            :class="`alert-card--${alert.level}`"
            @click="handleAlertAction(alert)"
          >
            <div class="alert-card__icon">
              <ExclamationCircleOutlined v-if="alert.level === 'error'" style="color: #ff4d4f" />
              <WarningOutlined v-else-if="alert.level === 'warning'" style="color: #faad14" />
              <InfoCircleOutlined v-else style="color: #1677ff" />
            </div>
            <div class="alert-card__body">
              <div class="alert-card__title">{{ alert.title }}</div>
              <div class="alert-card__desc">{{ alert.description }}</div>
              <div class="alert-card__time">{{ alert.time }}</div>
            </div>
            <div class="alert-card__action">
              <a-button type="link" size="small">{{ alert.actionText || '处理' }}</a-button>
            </div>
          </div>
        </div>
        <a-empty v-else description="暂无待处理事项" :image-style="{ height: '60px' }" />
      </div>

      <!-- Section 5: 快捷入口 -->
      <div class="section">
        <div class="section-title">快捷入口</div>
        <div class="shortcut-grid">
          <router-link
            v-for="entry in shortcuts"
            :key="entry.key"
            :to="entry.route"
            class="shortcut-card"
          >
            <div class="shortcut-card__icon" :style="{ background: entry.bgColor }">
              <component :is="entry.icon" :style="{ fontSize: '22px', color: entry.color }" />
            </div>
            <div class="shortcut-card__label">{{ entry.label }}</div>
          </router-link>
        </div>
      </div>
    </a-spin>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined,
  CloudDownloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  EditOutlined,
  ReadOutlined,
  BarChartOutlined,
  TeamOutlined,
  MessageOutlined,
  CommentOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue'
import request from '@/utils/request'

const router = useRouter()

// ---------- State ----------
const loading = ref(false)
const refreshing = ref(false)
const aiReplyEnabled = ref(false)
const aiSwitchLoading = ref(false)
const pullLoading = ref(false)
const activeAccounts = ref(0)
const activityList = ref([])
const alerts = ref([])

// ---------- Metric Cards ----------
const metricCards = reactive([
  { key: 'pulled', label: '拉取评论数', value: '--', trend: undefined, color: '#1677ff' },
  { key: 'aiReplies', label: 'AI回复数', value: '--', trend: undefined, color: '#52c41a' },
  { key: 'hidden', label: '已隐藏差评', value: '--', trend: undefined, color: '#ff4d4f' },
  { key: 'pending', label: '待处理评论', value: '--', trend: undefined, color: '#722ed1' },
])

// ---------- Category Colors ----------
const categoryColorMap = {
  '好评': 'green',
  '咨询': 'blue',
  '差评': 'red',
  '疑问': 'orange',
}

// ---------- Shortcuts ----------
const shortcuts = [
  { key: 'comments', label: '评论管理', icon: markRaw(EditOutlined), color: '#1677ff', bgColor: '#e6f4ff', route: '/ops-comments' },
  { key: 'scripts', label: '话术库', icon: markRaw(ReadOutlined), color: '#faad14', bgColor: '#fffbe6', route: '/ops-scripts' },
  { key: 'accounts', label: '账号管理', icon: markRaw(TeamOutlined), color: '#52c41a', bgColor: '#f6ffed', route: '/ops-accounts' },
  { key: 'stats', label: '数据统计', icon: markRaw(BarChartOutlined), color: '#722ed1', bgColor: '#f9f0ff', route: '/ops-stats' },
]

// ---------- Lifecycle ----------
let refreshTimer = null

onMounted(() => {
  loadAll()
  // Auto-refresh every 60 seconds
  refreshTimer = setInterval(loadAll, 60000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// ---------- Data Loading ----------
async function loadAll() {
  loading.value = true
  try {
    await Promise.all([
      loadOverview(),
      loadAiConfig(),
      loadActivityLogs(),
      loadAlerts(),
    ])
  } finally {
    loading.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await loadAll()
    message.success('刷新成功')
  } finally {
    refreshing.value = false
  }
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
  } catch (e) {
    console.error('Failed to load overview:', e)
  }
}

async function loadAiConfig() {
  try {
    const res = await request.get('/operations/ai-reply/config')
    const d = res.data || {}
    aiReplyEnabled.value = !!d.enabled
  } catch (e) {
    console.error('Failed to load AI config:', e)
  }
}

async function loadActivityLogs() {
  try {
    const res = await request.get('/operations/ai-reply/logs', { params: { limit: 20 } })
    activityList.value = res.data || []
  } catch (e) {
    console.error('Failed to load activity logs:', e)
  }
}

async function loadAlerts() {
  try {
    const res = await request.get('/operations/pending-alerts')
    alerts.value = res.data || []
  } catch (e) {
    console.error('Failed to load alerts:', e)
  }
}

// ---------- Actions ----------
async function handleAiToggle(checked) {
  aiSwitchLoading.value = true
  try {
    await request.put('/operations/ai-reply/config', { enabled: checked })
    message.success(checked ? 'AI自动回复已开启' : 'AI自动回复已关闭')
  } catch (e) {
    // Revert on failure
    aiReplyEnabled.value = !checked
    console.error('Failed to toggle AI reply:', e)
  } finally {
    aiSwitchLoading.value = false
  }
}

async function handlePullComments() {
  pullLoading.value = true
  try {
    const res = await request.post('/operations/comments/pull')
    const count = res.data?.count ?? 0
    message.success(`成功拉取 ${count} 条评论`)
    await loadOverview()
    await loadActivityLogs()
  } catch (e) {
    console.error('Failed to pull comments:', e)
  } finally {
    pullLoading.value = false
  }
}

function handleAlertAction(alert) {
  if (alert.route) {
    router.push(alert.route)
  } else {
    message.info('正在处理...')
  }
}

// ---------- Helpers ----------
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getActivityIcon(item) {
  if (item.type === 'reply' || item.type === 'ai_reply') return RobotOutlined
  if (item.type === 'pull') return SyncOutlined
  if (item.type === 'comment') return CommentOutlined
  return MessageOutlined
}

function getActivityColor(item) {
  if (item.type === 'reply' || item.type === 'ai_reply') return '#52c41a'
  if (item.type === 'pull') return '#1677ff'
  if (item.type === 'error') return '#ff4d4f'
  return '#1677ff'
}
</script>

<style scoped>
.ops-workbench {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
  background: #f5f5f5;
  min-height: 100vh;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-header__left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}
.page-subtitle {
  font-size: 13px;
  color: #8c8c8c;
  background: #f0f5ff;
  padding: 2px 8px;
  border-radius: 4px;
  color: #1677ff;
}

/* Status Bar */
.status-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.status-bar__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.status-bar__switch {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-bar__label {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}
.status-bar__text {
  font-size: 12px;
  color: #8c8c8c;
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
}
.status-bar__text--active {
  color: #52c41a;
  background: #f6ffed;
}
.status-bar__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.status-bar__badge {
  cursor: default;
}
.status-bar__badge-label {
  font-size: 13px;
  color: #595959;
  padding: 4px 8px;
  background: #fafafa;
  border-radius: 6px;
}

/* Section */
.section {
  margin-bottom: 20px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Metric Cards */
.metrics-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 -16px;
  padding: 0 16px 4px;
}
.metrics-grid {
  display: flex;
  gap: 12px;
  min-width: max-content;
}
.metric-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  min-width: 150px;
  flex: 1;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.metric-card__label {
  font-size: 13px;
  color: #8c8c8c;
  margin-bottom: 8px;
}
.metric-card__value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.metric-card__trend {
  font-size: 12px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.trend-up {
  color: #52c41a;
}
.trend-down {
  color: #ff4d4f;
}
.metric-card__sub {
  font-size: 12px;
  color: #bfbfbf;
  margin-top: 4px;
}

/* Activity Feed */
.activity-feed {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.15s;
}
.activity-item:last-child {
  border-bottom: none;
}
.activity-item:active {
  background: #fafafa;
}
.activity-item__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 6px;
}
.activity-item__body {
  flex: 1;
  min-width: 0;
}
.activity-item__content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.activity-item__icon {
  font-size: 14px;
  color: #8c8c8c;
  flex-shrink: 0;
}
.activity-item__text {
  font-size: 14px;
  color: #1a1a1a;
  line-height: 1.5;
  word-break: break-all;
}
.activity-item__tag {
  flex-shrink: 0;
}
.activity-item__time {
  font-size: 12px;
  color: #bfbfbf;
  margin-top: 4px;
}

/* Alerts */
.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alert-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}
.alert-card:active {
  transform: scale(0.99);
}
.alert-card--error {
  border-left-color: #ff4d4f;
}
.alert-card--warning {
  border-left-color: #faad14;
}
.alert-card--info {
  border-left-color: #1677ff;
}
.alert-card__icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}
.alert-card__body {
  flex: 1;
  min-width: 0;
}
.alert-card__title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}
.alert-card__desc {
  font-size: 13px;
  color: #8c8c8c;
  margin-top: 4px;
}
.alert-card__time {
  font-size: 12px;
  color: #bfbfbf;
  margin-top: 4px;
}
.alert-card__action {
  flex-shrink: 0;
}

/* Shortcut Grid */
.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.shortcut-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  text-decoration: none;
  transition: all 0.2s ease;
}
.shortcut-card:active {
  transform: scale(0.96);
}
.shortcut-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.shortcut-card__label {
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  text-align: center;
}

/* Desktop Breakpoint */
@media (min-width: 768px) {
  .ops-workbench {
    padding: 24px;
  }
  .status-bar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .metrics-scroll {
    overflow-x: visible;
    margin: 0;
    padding: 0;
  }
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    min-width: unset;
  }
  .shortcut-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
  .alert-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  .activity-item:hover {
    background: #fafafa;
  }
}
</style>
