<template>
  <div class="ops-comments">
    <div class="page-header">
      <h2 class="page-title">评论管理</h2>
    </div>

    <a-tabs v-model:activeKey="activeTab" class="ops-tabs">
      <!-- Tab 1: Comment Feed -->
      <a-tab-pane key="comments" tab="评论列表">
        <div class="tab-content">
          <!-- Toolbar -->
          <div class="tab-toolbar">
            <a-button type="primary" :loading="pulling" @click="pullComments">
              <template #icon><CloudDownloadOutlined /></template>
              拉取评论
            </a-button>
            <a-button @click="loadComments">
              <template #icon><ReloadOutlined /></template>
            </a-button>
          </div>

          <!-- Filters -->
          <div class="filter-bar">
            <a-select
              :value="commentFilters.category"
              placeholder="AI分类"
              allow-clear
              :show-search="false"
              style="min-width: 110px"
              @change="val => { commentFilters.category = val; onCommentFilterChange() }"
            >
              <a-select-option value="positive">好评</a-select-option>
              <a-select-option value="inquiry">咨询</a-select-option>
              <a-select-option value="negative">差评</a-select-option>
              <a-select-option value="question">疑问</a-select-option>
            </a-select>
            <a-select
              :value="commentFilters.status"
              placeholder="状态"
              allow-clear
              :show-search="false"
              style="min-width: 100px"
              @change="val => { commentFilters.status = val; onCommentFilterChange() }"
            >
              <a-select-option value="pending">待处理</a-select-option>
              <a-select-option value="success">已回复</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
              <a-select-option value="filtered">已过滤</a-select-option>
            </a-select>
            <a-input-search
              v-model:value="commentFilters.keyword"
              placeholder="搜索评论..."
              allow-clear
              style="flex: 1; min-width: 140px"
              @search="onCommentFilterChange"
            />
          </div>

          <!-- Comment Cards -->
          <a-spin :spinning="commentsLoading">
            <div v-if="comments.length" class="comment-list">
              <div v-for="item in comments" :key="item.id" class="comment-card">
                <!-- Card Header -->
                <div class="comment-card__header">
                  <div class="comment-card__video">
                    <PlaySquareOutlined class="comment-card__video-icon" />
                    <span class="comment-card__video-title">{{ item.video_title || '视频' }}</span>
                  </div>
                  <span class="comment-card__time">{{ formatTime(item.created_at) }}</span>
                </div>
                <div v-if="item.douyin_nickname || item.douyin_id" class="comment-card__user">
                  <UserOutlined class="comment-card__user-icon" />
                  <span v-if="item.douyin_nickname" class="comment-card__user-name">{{ item.douyin_nickname }}</span>
                  <span v-if="item.douyin_id" class="comment-card__user-id">@{{ item.douyin_id }}</span>
                </div>
                <div class="comment-card__ids">
                  <span v-if="item.video_id" class="comment-card__id-tag">素材ID: {{ item.video_id }}</span>
                  <span v-if="item.original_comment_id" class="comment-card__id-tag">评论ID: {{ item.original_comment_id }}</span>
                </div>

                <!-- Original Comment -->
                <div class="comment-card__body">
                  <div class="comment-card__text">{{ item.original_comment }}</div>
                  <div class="comment-card__tags">
                    <a-tag :color="categoryColorMap[item.ai_category] || '#8c8c8c'" size="small">
                      {{ categoryTextMap[item.ai_category] || '其他' }}
                    </a-tag>
                    <a-tag :color="statusColorMap[item.status]" size="small">
                      {{ statusTextMap[item.status] || item.status }}
                    </a-tag>
                  </div>
                </div>

                <!-- Reply Content (if exists) -->
                <div v-if="item.reply_content" class="comment-card__reply">
                  <MessageOutlined class="comment-card__reply-icon" />
                  <span>
                    <span v-if="item.douyin_nickname" style="color:#1677ff;font-weight:500">@{{ item.douyin_nickname }} </span>
                    AI回复: {{ item.reply_content }}
                  </span>
                </div>

                <!-- Actions -->
                <div class="comment-card__actions">
                  <a-button
                    type="link"
                    size="small"
                    @click="toggleReplyInput(item.id)"
                  >
                    <template #icon><EditOutlined /></template>
                    手动回复
                  </a-button>
                  <a-button
                    type="link"
                    size="small"
                    @click="operateComment(item.id, 'pin')"
                  >
                    <template #icon><PushpinOutlined /></template>
                    置顶
                  </a-button>
                  <a-button
                    type="link"
                    size="small"
                    danger
                    @click="operateComment(item.id, 'hide')"
                  >
                    <template #icon><EyeInvisibleOutlined /></template>
                    隐藏
                  </a-button>
                </div>

                <!-- Inline Reply Input -->
                <div v-if="replyingId === item.id" class="comment-card__reply-input">
                  <a-textarea
                    v-model:value="replyText"
                    placeholder="输入回复内容..."
                    :rows="2"
                    :auto-size="{ minRows: 2, maxRows: 4 }"
                  />
                  <div class="comment-card__reply-btns">
                    <a-button size="small" :loading="aiGenerating" @click="aiGenerateReply(item.id)">
                      <template #icon><RobotOutlined /></template>
                      AI生成
                    </a-button>
                    <a-button
                      type="primary"
                      size="small"
                      :loading="replySending"
                      @click="sendReply(item.id)"
                    >发送</a-button>
                    <a-button size="small" @click="replyingId = null">取消</a-button>
                  </div>
                </div>
              </div>
            </div>
            <a-empty v-else description="暂无评论数据" />
          </a-spin>

          <!-- Pagination -->
          <div v-if="commentPagination.total > 0" class="pagination-wrap">
            <a-pagination
              v-model:current="commentPagination.current"
              :total="commentPagination.total"
              :page-size="commentPagination.pageSize"
              size="small"
              show-quick-jumper
              @change="onCommentPageChange"
            />
          </div>
        </div>
      </a-tab-pane>

      <!-- Tab 2: AI Auto Reply Config + Feed -->
      <a-tab-pane key="ai-reply" tab="AI自动回复">
        <div class="tab-content">
          <!-- Config Card -->
          <div class="config-card">
            <div class="config-card__header">
              <span class="config-card__title">自动回复设置</span>
              <a-switch
                v-model:checked="aiConfig.enabled"
                checked-children="开启"
                un-checked-children="关闭"
              />
            </div>
            <div class="config-card__body">
              <div class="config-row">
                <span class="config-label">拉取间隔</span>
                <span class="config-value">5分钟 (定时任务管理)</span>
              </div>
              <div class="config-row">
                <span class="config-label">自动回复分类</span>
                <a-checkbox-group v-model:value="aiConfig.categories">
                  <a-checkbox value="positive">好评</a-checkbox>
                  <a-checkbox value="inquiry">咨询</a-checkbox>
                  <a-checkbox value="negative">差评</a-checkbox>
                  <a-checkbox value="question">疑问</a-checkbox>
                </a-checkbox-group>
              </div>
              <div class="config-row">
                <span class="config-label">回复风格</span>
                <a-select v-model:value="aiConfig.reply_style" style="width: 160px">
                  <a-select-option value="friendly">亲切友好</a-select-option>
                  <a-select-option value="professional">专业正式</a-select-option>
                  <a-select-option value="humorous">幽默风趣</a-select-option>
                </a-select>
              </div>
              <div class="config-row config-row--action">
                <a-button type="primary" :loading="configSaving" @click="saveAiConfig">
                  保存配置
                </a-button>
              </div>
            </div>
          </div>

          <!-- AI Reply Feed -->
          <div class="feed-section">
            <div class="feed-section__header">
              <span class="feed-section__title">
                回复记录
                <a-badge :count="aiLogs.length" :overflow-count="999" :number-style="{ backgroundColor: '#1677ff' }" />
              </span>
              <a-button type="link" size="small" @click="loadAiLogs">刷新</a-button>
            </div>
            <a-spin :spinning="aiLogsLoading">
              <div v-if="aiLogs.length" class="ai-feed">
                <div v-for="log in aiLogs" :key="log.id" class="ai-feed__item">
                  <div class="ai-feed__time">{{ formatTime(log.created_at) }}</div>
                  <div v-if="log.douyin_nickname || log.douyin_id" class="ai-feed__user">
                    <UserOutlined style="font-size:12px;color:#1677ff" />
                    <span v-if="log.douyin_nickname" style="color:#1a1a1a;font-weight:500">{{ log.douyin_nickname }}</span>
                    <span v-if="log.douyin_id" style="color:#8c8c8c;font-size:12px">@{{ log.douyin_id }}</span>
                  </div>
                  <div class="ai-feed__original">
                    <span class="ai-feed__label">原评论:</span>
                    <span class="ai-feed__text">{{ log.original_comment }}</span>
                  </div>
                  <div class="ai-feed__reply-row">
                    <span class="ai-feed__label">AI回复:</span>
                    <span class="ai-feed__text">{{ log.ai_reply || log.reply_content }}</span>
                    <a-tag
                      :color="statusColorMap[log.status]"
                      size="small"
                      class="ai-feed__status"
                    >{{ statusTextMap[log.status] || log.status }}</a-tag>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无回复记录" />
            </a-spin>
          </div>
        </div>
      </a-tab-pane>

      <!-- Tab 3: Full Logs -->
      <a-tab-pane key="logs" tab="评论日志">
        <div class="tab-content">
          <!-- Filters -->
          <div class="log-filters">
            <a-range-picker
              v-model:value="logFilters.dateRange"
              :placeholder="['开始日期', '结束日期']"
              class="log-filters__date"
              @change="loadLogs"
            />
            <div class="log-filters__row">
              <a-select
                v-model:value="logFilters.comment_type"
                placeholder="评论类型"
                allow-clear
                style="flex: 1"
                @change="loadLogs"
              >
                <a-select-option value="ai_reply">AI回复</a-select-option>
                <a-select-option value="manual">手动回复</a-select-option>
              </a-select>
              <a-select
                v-model:value="logFilters.status"
                placeholder="状态"
                allow-clear
                style="flex: 1"
                @change="loadLogs"
              >
                <a-select-option value="pending">待处理</a-select-option>
                <a-select-option value="success">已回复</a-select-option>
                <a-select-option value="failed">失败</a-select-option>
                <a-select-option value="filtered">已过滤</a-select-option>
              </a-select>
              <a-select
                v-model:value="logFilters.account_id"
                placeholder="账号"
                allow-clear
                style="flex: 1"
                @change="loadLogs"
              >
                <a-select-option v-for="acc in accountList" :key="acc.id" :value="acc.id">
                  {{ acc.name }}
                </a-select-option>
              </a-select>
            </div>
            <a-input-search
              v-model:value="logFilters.keyword"
              placeholder="搜索关键词..."
              allow-clear
              class="log-filters__search"
              @search="loadLogs"
            />
          </div>

          <a-spin :spinning="logsLoading">
            <!-- Mobile: Card View -->
            <div v-if="isMobile" class="log-cards">
              <div v-for="log in logs" :key="log.id" class="log-card">
                <div class="log-card__header">
                  <a-tag :color="categoryColorMap[log.ai_category] || '#8c8c8c'" size="small">
                    {{ categoryTextMap[log.ai_category] || '其他' }}
                  </a-tag>
                  <a-tag :color="statusColorMap[log.status]" size="small">
                    {{ statusTextMap[log.status] || log.status }}
                  </a-tag>
                  <span class="log-card__time">{{ log.created_at }}</span>
                </div>
                <div v-if="log.douyin_nickname || log.douyin_id" class="log-card__user">
                  <UserOutlined style="font-size:13px;color:#1677ff" />
                  <span v-if="log.douyin_nickname" style="font-weight:500">{{ log.douyin_nickname }}</span>
                  <span v-if="log.douyin_id" style="color:#8c8c8c;font-size:12px">@{{ log.douyin_id }}</span>
                </div>
                <div class="log-card__content">{{ log.original_comment || log.content }}</div>
                <div v-if="log.reply_content" class="log-card__reply">
                  回复: {{ log.reply_content }}
                </div>
                <div class="log-card__meta">
                  <span>{{ log.account_name || '-' }}</span>
                </div>
              </div>
              <a-empty v-if="!logs.length" description="暂无日志" />
            </div>

            <!-- Desktop: Table View -->
            <a-table
              v-else
              :columns="logColumns"
              :data-source="logs"
              :pagination="logPagination"
              row-key="id"
              size="small"
              @change="onLogTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'douyin_nickname'">
                  <div style="line-height:1.3">
                    <div v-if="record.douyin_nickname" style="font-weight:500;color:#1a1a1a">{{ record.douyin_nickname }}</div>
                    <div v-if="record.douyin_id" style="font-size:11px;color:#8c8c8c">@{{ record.douyin_id }}</div>
                  </div>
                </template>
                <template v-if="column.key === 'ai_category'">
                  <a-tag :color="categoryColorMap[record.ai_category] || '#8c8c8c'" size="small">
                    {{ categoryTextMap[record.ai_category] || '其他' }}
                  </a-tag>
                </template>
                <template v-if="column.key === 'status'">
                  <a-tag :color="statusColorMap[record.status]" size="small">
                    {{ statusTextMap[record.status] || record.status }}
                  </a-tag>
                </template>
                <template v-if="column.key === 'original_comment'">
                  <span class="cell-ellipsis">{{ record.original_comment || record.content }}</span>
                </template>
                <template v-if="column.key === 'reply_content'">
                  <span class="cell-ellipsis">{{ record.reply_content || '-' }}</span>
                </template>
              </template>
            </a-table>
          </a-spin>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined,
  CloudDownloadOutlined,
  PlaySquareOutlined,
  MessageOutlined,
  EditOutlined,
  PushpinOutlined,
  EyeInvisibleOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import request from '@/utils/request'

// ===== Common =====
const route = useRoute()
const isMobile = ref(window.innerWidth < 768)
const onResize = () => { isMobile.value = window.innerWidth < 768 }
const activeTab = ref('comments')
const accountList = ref([])

const categoryColorMap = {
  positive: '#52c41a',
  inquiry: '#1677ff',
  negative: '#ff4d4f',
  question: '#faad14',
  other: '#8c8c8c',
}
const categoryTextMap = {
  positive: '好评',
  inquiry: '咨询',
  negative: '差评',
  question: '疑问',
  other: '其他',
}
const statusColorMap = {
  pending: 'default',
  success: 'green',
  failed: 'red',
  filtered: 'orange',
}
const statusTextMap = {
  pending: '待处理',
  success: '已回复',
  failed: '失败',
  filtered: '已过滤',
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = (now - date) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  return dateStr.slice(0, 16).replace('T', ' ')
}

// ===== Lifecycle =====
let aiLogTimer = null

onMounted(() => {
  window.addEventListener('resize', onResize)
  if (route.query.tab) activeTab.value = route.query.tab
  loadComments()
  loadAccountList()
  loadAiConfig()
  loadAiLogs()
  loadLogs()
  // Auto-refresh AI logs every 30 seconds
  aiLogTimer = setInterval(loadAiLogs, 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (aiLogTimer) clearInterval(aiLogTimer)
})

async function loadAccountList() {
  try {
    const res = await request.get('/operations/accounts', { params: { status: 'active' } })
    accountList.value = res.data || []
  } catch (e) {
    console.error('Failed to load accounts:', e)
  }
}

// ===== Tab 1: Comment Feed =====
const commentsLoading = ref(false)
const comments = ref([])
const pulling = ref(false)
const replyingId = ref(null)
const replyText = ref('')
const replySending = ref(false)
const aiGenerating = ref(false)

const commentFilters = reactive({
  category: undefined,
  status: undefined,
  keyword: '',
})

const commentPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
})

async function loadComments() {
  commentsLoading.value = true
  try {
    const params = {
      page: commentPagination.current,
      page_size: commentPagination.pageSize,
      comment_type: 'ai_reply',
    }
    if (commentFilters.category) params.ai_category = commentFilters.category
    if (commentFilters.status) params.status = commentFilters.status
    if (commentFilters.keyword) params.keyword = commentFilters.keyword
    const res = await request.get('/operations/logs', { params })
    comments.value = res.data?.list || res.data || []
    commentPagination.total = res.data?.total || 0
  } catch (e) {
    console.error('Failed to load comments:', e)
  } finally {
    commentsLoading.value = false
  }
}

function onCommentFilterChange() {
  commentPagination.current = 1
  loadComments()
}

function onCommentPageChange(page) {
  commentPagination.current = page
  loadComments()
}

async function pullComments() {
  pulling.value = true
  try {
    await request.post('/operations/comments/pull')
    message.success('评论拉取成功')
    loadComments()
  } catch (e) {
    console.error('Failed to pull comments:', e)
  } finally {
    pulling.value = false
  }
}

function toggleReplyInput(id) {
  if (replyingId.value === id) {
    replyingId.value = null
    replyText.value = ''
  } else {
    replyingId.value = id
    replyText.value = ''
  }
}

async function aiGenerateReply(commentId) {
  aiGenerating.value = true
  try {
    const res = await request.post(`/operations/comments/${commentId}/reply`, { ai: true })
    replyText.value = res.data?.reply_content || res.data?.ai_reply || ''
    message.success('AI回复已生成')
  } catch (e) {
    console.error('AI generate reply failed:', e)
  } finally {
    aiGenerating.value = false
  }
}

async function sendReply(commentId) {
  if (!replyText.value.trim()) {
    message.warning('请输入回复内容')
    return
  }
  replySending.value = true
  try {
    await request.post(`/operations/comments/${commentId}/reply`, {
      reply_content: replyText.value.trim(),
    })
    message.success('回复已发送')
    replyingId.value = null
    replyText.value = ''
    loadComments()
  } catch (e) {
    console.error('Send reply failed:', e)
  } finally {
    replySending.value = false
  }
}

async function operateComment(commentId, action) {
  try {
    await request.post(`/operations/comments/${commentId}/operate`, { action })
    message.success(action === 'pin' ? '已置顶' : '已隐藏')
    loadComments()
  } catch (e) {
    console.error('Comment operate failed:', e)
  }
}

// ===== Tab 2: AI Auto Reply =====
const aiConfig = reactive({
  enabled: false,
  categories: ['positive', 'inquiry'],
  reply_style: 'friendly',
})
const configSaving = ref(false)
const aiLogsLoading = ref(false)
const aiLogs = ref([])

async function loadAiConfig() {
  try {
    const res = await request.get('/operations/ai-reply/config')
    const d = res.data || {}
    aiConfig.enabled = d.enabled ?? false
    aiConfig.categories = d.categories || ['positive', 'inquiry']
    aiConfig.reply_style = d.reply_style || 'friendly'
  } catch (e) {
    console.error('Failed to load AI config:', e)
  }
}

async function saveAiConfig() {
  configSaving.value = true
  try {
    await request.put('/operations/ai-reply/config', {
      enabled: aiConfig.enabled,
      categories: aiConfig.categories,
      reply_style: aiConfig.reply_style,
    })
    message.success('配置已保存')
  } catch (e) {
    console.error('Failed to save AI config:', e)
  } finally {
    configSaving.value = false
  }
}

async function loadAiLogs() {
  aiLogsLoading.value = true
  try {
    const res = await request.get('/operations/ai-reply/logs', { params: { limit: 50 } })
    aiLogs.value = res.data || []
  } catch (e) {
    console.error('Failed to load AI logs:', e)
  } finally {
    aiLogsLoading.value = false
  }
}

// ===== Tab 3: Comment Logs =====
const logsLoading = ref(false)
const logs = ref([])

const logFilters = reactive({
  dateRange: null,
  comment_type: undefined,
  status: undefined,
  account_id: undefined,
  keyword: '',
})

const logPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: false,
})

const logColumns = [
  { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160 },
  { title: '抖音用户', key: 'douyin_nickname', width: 130 },
  { title: '评论内容', key: 'original_comment', ellipsis: true },
  { title: 'AI分类', key: 'ai_category', width: 90 },
  { title: '回复内容', key: 'reply_content', ellipsis: true },
  { title: '状态', key: 'status', width: 90 },
]

async function loadLogs() {
  logsLoading.value = true
  try {
    const params = {
      page: logPagination.current,
      page_size: logPagination.pageSize,
    }
    if (logFilters.comment_type) params.comment_type = logFilters.comment_type
    if (logFilters.status) params.status = logFilters.status
    if (logFilters.account_id) params.account_id = logFilters.account_id
    if (logFilters.keyword) params.keyword = logFilters.keyword
    if (logFilters.dateRange && logFilters.dateRange.length === 2) {
      params.start_date = logFilters.dateRange[0].format('YYYY-MM-DD')
      params.end_date = logFilters.dateRange[1].format('YYYY-MM-DD')
    }
    const res = await request.get('/operations/logs', { params })
    logs.value = res.data?.list || res.data || []
    logPagination.total = res.data?.total || 0
  } catch (e) {
    console.error('Failed to load logs:', e)
  } finally {
    logsLoading.value = false
  }
}

function onLogTableChange(pag) {
  logPagination.current = pag.current
  loadLogs()
}
</script>

<style scoped>
.ops-comments {
  padding: 12px;
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
  background: #f5f5f5;
}
.page-header {
  margin-bottom: 12px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}

/* Tabs */
.ops-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
  background: #fff;
  border-radius: 12px 12px 0 0;
  padding: 0 8px;
}
.tab-content {
  padding: 12px 0;
}

/* Toolbar */
.tab-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

/* Comment Cards */
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.comment-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.comment-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}
.comment-card__video {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.comment-card__video-icon {
  color: #1677ff;
  font-size: 16px;
  flex-shrink: 0;
}
.comment-card__video-title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.comment-card__time {
  font-size: 12px;
  color: #bfbfbf;
  flex-shrink: 0;
  margin-left: 8px;
}
.comment-card__user {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 13px;
  color: #1677ff;
}
.comment-card__user-icon {
  font-size: 14px;
  color: #1677ff;
}
.comment-card__user-name {
  font-weight: 500;
  color: #1a1a1a;
}
.comment-card__user-id {
  color: #8c8c8c;
  font-size: 12px;
}
.comment-card__ids {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  padding: 0 0 6px;
}
.comment-card__id-tag {
  font-size: 11px;
  color: #8c8c8c;
  background: #f5f5f5;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.comment-card__body {
  margin-bottom: 10px;
}
.comment-card__text {
  font-size: 14px;
  color: #1a1a1a;
  line-height: 1.6;
  margin-bottom: 8px;
  word-break: break-all;
}
.comment-card__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.comment-card__reply {
  background: #f6ffed;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: #389e0d;
  line-height: 1.5;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border-bottom: 1px solid #f0f0f0;
  word-break: break-all;
}
.comment-card__reply-icon {
  color: #52c41a;
  margin-top: 2px;
  flex-shrink: 0;
}
.comment-card__actions {
  display: flex;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
.comment-card__reply-input {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.comment-card__reply-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Pagination */
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

/* Config Card */
.config-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.config-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #f5f5f5;
}
.config-card__title {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
}
.config-card__body {
  padding: 16px;
}
.config-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.config-row:last-child {
  margin-bottom: 0;
}
.config-row--action {
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid #f5f5f5;
}
.config-label {
  font-size: 14px;
  color: #595959;
  min-width: 90px;
  padding-top: 4px;
  flex-shrink: 0;
}
.config-value {
  font-size: 14px;
  color: #8c8c8c;
  padding-top: 4px;
}

/* Feed Section */
.feed-section {
  margin-top: 16px;
}
.feed-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.feed-section__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* AI Feed */
.ai-feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-feed__item {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.ai-feed__time {
  font-size: 12px;
  color: #bfbfbf;
  margin-bottom: 4px;
}
.ai-feed__user {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  font-size: 13px;
}
.ai-feed__original {
  margin-bottom: 8px;
}
.ai-feed__reply-row {
  background: #f6ffed;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px;
}
.ai-feed__label {
  font-size: 12px;
  color: #8c8c8c;
  flex-shrink: 0;
}
.ai-feed__text {
  font-size: 13px;
  color: #1a1a1a;
  line-height: 1.5;
  word-break: break-all;
}
.ai-feed__status {
  margin-left: auto;
  flex-shrink: 0;
}

/* Log Filters */
.log-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.log-filters__date {
  width: 100%;
}
.log-filters__row {
  display: flex;
  gap: 8px;
}
.log-filters__search {
  width: 100%;
}

/* Log Cards (Mobile) */
.log-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.log-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.log-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.log-card__user {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  font-size: 13px;
  color: #1677ff;
}
.log-card__time {
  font-size: 12px;
  color: #bfbfbf;
  margin-left: auto;
}
.log-card__content {
  font-size: 14px;
  color: #1a1a1a;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.log-card__reply {
  font-size: 13px;
  color: #389e0d;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.log-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #8c8c8c;
}

/* Table cell ellipsis */
.cell-ellipsis {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== Desktop ===== */
@media (min-width: 768px) {
  .ops-comments {
    padding: 24px;
  }
  .tab-content {
    padding: 16px 0;
  }
  .filter-bar {
    flex-wrap: nowrap;
  }
  .config-row {
    align-items: center;
  }
  .log-filters {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }
  .log-filters__date {
    width: 260px !important;
    flex: unset;
  }
  .log-filters__row {
    flex: 1;
  }
  .log-filters__search {
    width: 220px !important;
    flex: unset;
  }
}
</style>
