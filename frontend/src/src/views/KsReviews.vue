<template>
  <div class="ks-reviews">
    <div class="page-header">
      <h2 class="page-title">评价管理</h2>
      <div class="timer-status" v-if="overview.timer_running">
        <span class="status-dot running"></span>
        AI定时回复运行中（每{{ overview.auto_reply_interval }}分钟）
      </div>
    </div>

    <!-- 数据概览卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-card__value">{{ overview.total }}</div>
        <div class="stat-card__label">总评论数</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value blue">{{ overview.replied }}</div>
        <div class="stat-card__label">已回复</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value orange">{{ overview.pending }}</div>
        <div class="stat-card__label">待回复</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value green">{{ overview.today_comments || 0 }}</div>
        <div class="stat-card__label">今日新评论</div>
        <div class="stat-card__sub" v-if="overview.yesterday_comments">昨日 {{ overview.yesterday_comments }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value purple">{{ overview.today_replies || 0 }}</div>
        <div class="stat-card__label">今日已回复</div>
        <div class="stat-card__sub" v-if="overview.yesterday_replies">昨日 {{ overview.yesterday_replies }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" :class="overview.avg_star >= 4 ? 'green' : 'orange'">{{ overview.avg_star }}★</div>
        <div class="stat-card__label">平均评分</div>
      </div>
    </div>

    <!-- 最新评论滚动 -->
    <div class="latest-scroll" v-if="latestComments.length">
      <div class="latest-scroll__header">
        <span class="latest-scroll__title">最新评论</span>
        <span class="latest-scroll__count">{{ latestComments.length }}条</span>
      </div>
      <div class="latest-scroll__body" ref="scrollContainer">
        <div class="scroll-inner" :class="{ 'scroll-animate': latestComments.length > 3 }">
          <div v-for="(item, idx) in scrollList" :key="idx" class="scroll-item">
            <span class="scroll-item__stars" :class="'star-' + starCategory(item.quality_score)">
              {{ '★'.repeat(item.quality_score || 5) }}
            </span>
            <span class="scroll-item__nick">{{ item.buyer_nick || '匿名用户' }}</span>
            <span class="scroll-item__content">{{ item.content }}</span>
            <a-tag :color="item.reply_status === 'replied' ? 'green' : 'default'" size="small" class="scroll-item__tag">
              {{ item.reply_status === 'replied' ? '已回复' : '待回复' }}
            </a-tag>
            <span class="scroll-item__time">{{ formatShortTime(item.comment_time) }}</span>
          </div>
        </div>
      </div>
    </div>

    <a-tabs v-model:activeKey="activeTab" class="ops-tabs">
      <!-- Tab 1: 评价列表 -->
      <a-tab-pane key="comments" tab="评价列表">
        <div class="tab-content">
          <div class="tab-toolbar">
            <a-button type="primary" :loading="pulling" @click="pullReviews">
              <template #icon><CloudDownloadOutlined /></template>
              拉取评价
            </a-button>
            <a-button @click="fetchReviews">
              <template #icon><ReloadOutlined /></template>
            </a-button>
            <a-button :loading="batchReplying" @click="batchReply" :disabled="!overview.pending">
              模板批量回复 ({{ overview.pending }}条)
            </a-button>
            <a-button type="primary" ghost :loading="aiBatchReplying" @click="aiBatchReply" :disabled="!overview.pending">
              <template #icon><RobotOutlined /></template>
              AI批量回复
            </a-button>
          </div>

          <!-- 好评/中评/差评统计 -->
          <div class="stat-row" v-if="overview.total > 0">
            <div class="stat-tag-wrap">
              <span class="overview-tag positive">好评 {{ overview.positive }}</span>
              <span class="overview-tag neutral" v-if="overview.neutral">中评 {{ overview.neutral }}</span>
              <span class="overview-tag negative" v-if="overview.negative">差评 {{ overview.negative }}</span>
            </div>
          </div>

          <!-- 筛选 -->
          <div class="filter-bar">
            <a-select v-model:value="filters.status" placeholder="回复状态" allow-clear style="min-width:110px" @change="fetchReviews">
              <a-select-option value="pending">待回复</a-select-option>
              <a-select-option value="replied">已回复</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
            </a-select>
            <a-select v-model:value="filters.star" placeholder="星级" allow-clear style="min-width:90px" @change="fetchReviews">
              <a-select-option v-for="s in 5" :key="s" :value="s">{{ s }}星</a-select-option>
            </a-select>
            <a-input-search v-model:value="filters.keyword" placeholder="搜索评价内容/商品..." allow-clear style="flex:1;min-width:140px" @search="fetchReviews" />
          </div>

          <!-- 评价卡片 -->
          <a-spin :spinning="reviewsLoading">
            <div v-if="reviews.length" class="comment-list">
              <div v-for="item in reviews" :key="item.id" class="comment-card">
                <div class="comment-card__header">
                  <span class="comment-card__buyer">{{ item.buyer_nick || '匿名用户' }}</span>
                  <span class="comment-card__stars" :class="'star-' + starCategory(item.quality_score || item.star)">
                    {{ '★'.repeat(item.quality_score || item.star || 0) }}{{ '☆'.repeat(5 - (item.quality_score || item.star || 0)) }}
                  </span>
                  <a-tag :color="statusColorMap[item.reply_status]" size="small">{{ statusTextMap[item.reply_status] }}</a-tag>
                  <span class="comment-card__time">{{ formatTime(item.comment_time) }}</span>
                </div>
                <div class="comment-card__product">{{ item.item_title }}</div>
                <div class="comment-card__body">
                  <div class="comment-card__text">{{ item.content || '（无文字评价）' }}</div>
                </div>
                <div v-if="item.seller_reply" class="comment-card__reply">
                  <MessageOutlined class="reply-icon" />
                  <span>商家回复：{{ item.seller_reply }}</span>
                </div>
                <div v-if="item.reply_status === 'pending' || item.reply_status === 'failed'" class="comment-card__actions">
                  <a-button type="link" size="small" @click="toggleReply(item)">
                    <template #icon><EditOutlined /></template>
                    {{ replyingId === item.id ? '收起' : '回复' }}
                  </a-button>
                </div>
                <div v-if="replyingId === item.id" class="comment-card__reply-input">
                  <div class="quick-templates">
                    <span class="quick-label">快速：</span>
                    <span v-for="tpl in matchTemplates(item.quality_score || item.star)" :key="tpl.id" class="quick-tag" @click="replyText = tpl.content; selectedTemplateId = tpl.id">{{ tpl.name || '模板' }}</span>
                    <span class="quick-tag ai-tag" @click="aiGenerate(item)" :class="{ loading: aiGenerating }">
                      <RobotOutlined /> AI生成
                    </span>
                  </div>
                  <a-textarea v-model:value="replyText" placeholder="输入回复内容，或点击「AI生成」自动生成..." :rows="2" :auto-size="{ minRows: 2, maxRows: 4 }" />
                  <div class="reply-btns">
                    <a-button type="primary" size="small" :loading="replySending" :disabled="!replyText" @click="sendReply(item)">发送</a-button>
                    <a-button size="small" :loading="aiGenerating" @click="aiGenerate(item)"><template #icon><RobotOutlined /></template>重新生成</a-button>
                    <a-button size="small" @click="replyingId = null">取消</a-button>
                  </div>
                </div>
              </div>
            </div>
            <a-empty v-else description="暂无评价数据，请先拉取评价" />
          </a-spin>

          <div v-if="reviewPagination.total > 0" class="pagination-wrap">
            <a-pagination v-model:current="reviewPagination.current" :total="reviewPagination.total" :page-size="reviewPagination.pageSize" size="small" show-quick-jumper @change="onPageChange" />
          </div>
        </div>
      </a-tab-pane>

      <!-- Tab 2: 自动回复设置 -->
      <a-tab-pane key="auto-reply" tab="自动回复">
        <div class="tab-content">
          <!-- AI定时回复 -->
          <div class="config-card">
            <div class="config-card__header">
              <span class="config-card__title"><RobotOutlined /> AI定时自动回复</span>
              <a-switch v-model:checked="settings.ai_reply_enabled" checked-children="开启" un-checked-children="关闭" />
            </div>
            <div class="config-card__body">
              <div class="ai-desc">
                开启后系统每隔指定时间自动拉取新评价，并用AI逐条生成针对性回复发送。站在「雪玲妃护肤旗舰店」品牌角度，语气亲切正向。
              </div>
              <div class="config-row" style="margin-top:12px">
                <span class="config-label">执行间隔</span>
                <a-select v-model:value="settings.auto_reply_interval" style="width:150px">
                  <a-select-option :value="5">每5分钟</a-select-option>
                  <a-select-option :value="10">每10分钟</a-select-option>
                  <a-select-option :value="15">每15分钟</a-select-option>
                  <a-select-option :value="30">每30分钟</a-select-option>
                  <a-select-option :value="60">每1小时</a-select-option>
                  <a-select-option :value="120">每2小时</a-select-option>
                </a-select>
              </div>
              <div class="timer-info" v-if="settings.timer_running">
                <span class="status-dot running"></span> 定时任务运行中
              </div>
              <div class="timer-info" v-else-if="settings.ai_reply_enabled">
                <span class="status-dot stopped"></span> 保存后启动
              </div>
            </div>
          </div>

          <!-- 模板回复设置 -->
          <div class="config-card" style="margin-top:16px">
            <div class="config-card__header">
              <span class="config-card__title">模板自动回复</span>
              <a-switch v-model:checked="settings.auto_reply_enabled" checked-children="开启" un-checked-children="关闭" />
            </div>
            <div class="config-card__body">
              <div class="config-row">
                <span class="config-label">自动回复星级</span>
                <a-checkbox-group v-model:value="settings.auto_reply_categories">
                  <a-checkbox value="5">5星</a-checkbox>
                  <a-checkbox value="4">4星</a-checkbox>
                  <a-checkbox value="3">3星</a-checkbox>
                  <a-checkbox value="2">2星</a-checkbox>
                  <a-checkbox value="1">1星</a-checkbox>
                </a-checkbox-group>
              </div>
            </div>
          </div>

          <div style="margin-top:16px">
            <a-button type="primary" :loading="settingsSaving" @click="saveSettings">保存设置</a-button>
          </div>

          <!-- 模板管理 -->
          <div class="config-card" style="margin-top:16px">
            <div class="config-card__header">
              <span class="config-card__title">回复模板</span>
              <a-button type="primary" size="small" @click="openTemplateForm()">+ 新增</a-button>
            </div>
            <div class="config-card__body">
              <div v-if="templates.length" class="template-list">
                <div v-for="tpl in templates" :key="tpl.id" class="template-card">
                  <div class="tpl-header">
                    <span class="tpl-name">{{ tpl.name || '未命名模板' }}</span>
                    <div class="tpl-tags">
                      <a-tag v-if="tpl.is_default" color="blue" size="small">默认</a-tag>
                      <a-tag size="small">{{ tpl.star_min }}-{{ tpl.star_max }}星</a-tag>
                      <a-tag v-if="tpl.use_count" size="small" color="default">已用{{ tpl.use_count }}次</a-tag>
                    </div>
                  </div>
                  <div class="tpl-content">{{ tpl.content }}</div>
                  <div class="tpl-actions">
                    <a-button type="link" size="small" @click="openTemplateForm(tpl)">编辑</a-button>
                    <a-button type="link" size="small" danger @click="deleteTemplate(tpl.id)">删除</a-button>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无模板" />
            </div>
          </div>
        </div>
      </a-tab-pane>

      <!-- Tab 3: 回复记录 -->
      <a-tab-pane key="logs" tab="回复记录">
        <div class="tab-content">
          <div class="stat-row" v-if="logStats.total > 0">
            <div class="stat-tag-wrap">
              <span class="overview-tag">总计 {{ logStats.total }}</span>
              <span class="overview-tag" style="background:#e6f7ff;color:#1890ff">模板 {{ logStats.auto }}</span>
              <span class="overview-tag" style="background:#f0f5ff;color:#722ed1">AI {{ logStats.ai || 0 }}</span>
              <span class="overview-tag" style="background:#f6ffed;color:#52c41a">手动 {{ logStats.manual }}</span>
              <span class="overview-tag success">成功 {{ logStats.success }}</span>
              <span class="overview-tag negative" v-if="logStats.fail">失败 {{ logStats.fail }}</span>
            </div>
          </div>

          <div class="filter-bar">
            <a-select v-model:value="logFilters.reply_type" placeholder="回复类型" allow-clear style="min-width:100px" @change="fetchLogs">
              <a-select-option value="auto">模板回复</a-select-option>
              <a-select-option value="ai">AI回复</a-select-option>
              <a-select-option value="manual">手动回复</a-select-option>
            </a-select>
            <a-select v-model:value="logFilters.reply_status" placeholder="状态" allow-clear style="min-width:100px" @change="fetchLogs">
              <a-select-option value="success">成功</a-select-option>
              <a-select-option value="fail">失败</a-select-option>
            </a-select>
          </div>

          <a-spin :spinning="logsLoading">
            <div v-if="logs.length" class="comment-list">
              <div v-for="log in logs" :key="log.id" class="log-card">
                <div class="log-card__header">
                  <span class="log-card__buyer">{{ log.buyer_nick || '匿名' }}</span>
                  <a-tag :color="replyTypeColor(log.reply_type)" size="small">{{ replyTypeText(log.reply_type) }}</a-tag>
                  <a-tag :color="log.reply_status === 'success' ? 'green' : 'red'" size="small">{{ log.reply_status === 'success' ? '成功' : '失败' }}</a-tag>
                  <span class="log-card__stars" v-if="log.star">{{ '★'.repeat(log.star) }}</span>
                  <span class="log-card__time">{{ formatTime(log.created_at) }}</span>
                </div>
                <div v-if="log.item_title" class="log-card__product">{{ log.item_title }}</div>
                <div class="log-card__content"><span class="log-label">评价：</span>{{ log.comment_content || '（无）' }}</div>
                <div class="log-card__reply"><span class="log-label">回复：</span>{{ log.reply_content }}</div>
                <div v-if="log.fail_reason" class="log-card__fail">失败原因：{{ log.fail_reason }}</div>
              </div>
            </div>
            <a-empty v-else description="暂无回复记录" />
          </a-spin>

          <div v-if="logPagination.total > 0" class="pagination-wrap">
            <a-pagination v-model:current="logPagination.current" :total="logPagination.total" :page-size="logPagination.pageSize" size="small" show-quick-jumper @change="onLogPageChange" />
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>

    <!-- 模板弹窗 -->
    <a-modal v-model:open="templateModalOpen" :title="editingTemplateId ? '编辑模板' : '新增模板'" @ok="saveTemplate" :confirm-loading="templateSaving">
      <a-form :label-col="{ span: 6 }">
        <a-form-item label="模板名称"><a-input v-model:value="templateForm.name" placeholder="如：好评通用回复" /></a-form-item>
        <a-form-item label="回复内容"><a-textarea v-model:value="templateForm.content" :rows="4" placeholder="感谢您的评价！如有任何问题随时联系我们～" /></a-form-item>
        <a-form-item label="适用星级">
          <div style="display:flex;gap:12px">
            <a-select v-model:value="templateForm.star_min" style="width:100px"><a-select-option v-for="s in 5" :key="s" :value="s">{{ s }}星起</a-select-option></a-select>
            <span style="line-height:32px">至</span>
            <a-select v-model:value="templateForm.star_max" style="width:100px"><a-select-option v-for="s in 5" :key="s" :value="s">{{ s }}星</a-select-option></a-select>
          </div>
        </a-form-item>
        <a-form-item label="设为默认"><a-switch v-model:checked="templateForm.is_default" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, CloudDownloadOutlined, MessageOutlined, EditOutlined, RobotOutlined } from '@ant-design/icons-vue'
import request from '../utils/request'

const activeTab = ref('comments')
const shopId = ref(null)
const statusColorMap = { pending: 'default', replied: 'green', failed: 'red' }
const statusTextMap = { pending: '待回复', replied: '已回复', failed: '失败' }

function starCategory(star) { return star >= 4 ? 'positive' : star === 3 ? 'neutral' : 'negative' }
function replyTypeColor(type) { return type === 'ai' ? 'purple' : type === 'auto' ? 'blue' : 'green' }
function replyTypeText(type) { return type === 'ai' ? 'AI' : type === 'auto' ? '模板' : '手动' }
function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr), now = new Date(), diff = (now - d) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  return dateStr.slice(0, 16).replace('T', ' ')
}
function formatShortTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

// ===== 概览 =====
const overview = reactive({ total: 0, pending: 0, replied: 0, failed: 0, positive: 0, neutral: 0, negative: 0, avg_star: 0, today_comments: 0, today_replies: 0, yesterday_comments: 0, yesterday_replies: 0, timer_running: false, auto_reply_interval: 30 })

async function fetchOverview() {
  if (!shopId.value) return
  try {
    const res = await request.get('/ks-reviews/overview', { params: { shop_id: shopId.value } })
    Object.assign(overview, res.data || res)
  } catch (e) {}
}

// ===== 最新评论滚动 =====
const latestComments = ref([])
const scrollList = computed(() => latestComments.value.length > 3 ? [...latestComments.value, ...latestComments.value] : latestComments.value)
let latestTimer = null

async function fetchLatest() {
  if (!shopId.value) return
  try {
    const res = await request.get('/ks-reviews/latest', { params: { shop_id: shopId.value, limit: 20 } })
    latestComments.value = res.data || res || []
  } catch (e) {}
}

// ===== 评价列表 =====
const reviews = ref([])
const reviewsLoading = ref(false)
const pulling = ref(false)
const batchReplying = ref(false)
const aiBatchReplying = ref(false)
const filters = reactive({ status: undefined, star: undefined, keyword: '' })
const reviewPagination = reactive({ current: 1, pageSize: 20, total: 0 })

async function fetchReviews() {
  if (!shopId.value) return
  reviewsLoading.value = true
  try {
    const params = { shop_id: shopId.value, page: reviewPagination.current, page_size: reviewPagination.pageSize }
    if (filters.status) params.status = filters.status
    if (filters.star) params.star = filters.star
    if (filters.keyword) params.keyword = filters.keyword
    const res = await request.get('/ks-reviews/list', { params })
    const data = res.data || res
    reviews.value = data.list || []
    reviewPagination.total = data.total || 0
  } catch (e) { reviews.value = [] }
  finally { reviewsLoading.value = false }
}

function onPageChange(page) { reviewPagination.current = page; fetchReviews() }

async function pullReviews() {
  if (!shopId.value) return
  pulling.value = true
  try {
    const res = await request.post('/ks-reviews/pull', { shop_id: shopId.value })
    message.success(res.msg || '拉取完成')
    await Promise.all([fetchReviews(), fetchOverview(), fetchLatest()])
  } catch (e) { message.error('拉取失败') }
  finally { pulling.value = false }
}

async function batchReply() {
  if (!shopId.value) return
  batchReplying.value = true
  try {
    const res = await request.post('/ks-reviews/batch-reply', { shop_id: shopId.value })
    message.success(res.msg || '批量回复完成')
    await Promise.all([fetchReviews(), fetchOverview()])
  } catch (e) { message.error('批量回复失败') }
  finally { batchReplying.value = false }
}

async function aiBatchReply() {
  if (!shopId.value) return
  aiBatchReplying.value = true
  message.loading({ content: 'AI正在逐条生成回复并发送...', key: 'ai-batch', duration: 0 })
  try {
    const res = await request.post('/ks-reviews/ai-batch-reply', { shop_id: shopId.value })
    message.destroy('ai-batch')
    message.success(res.msg || 'AI批量回复完成')
    await Promise.all([fetchReviews(), fetchOverview()])
  } catch (e) { message.destroy('ai-batch'); message.error('AI批量回复失败') }
  finally { aiBatchReplying.value = false }
}

// ===== 手动回复 + AI =====
const replyingId = ref(null)
const replyText = ref('')
const replySending = ref(false)
const aiGenerating = ref(false)
const selectedTemplateId = ref(null)

function toggleReply(item) {
  if (replyingId.value === item.id) { replyingId.value = null }
  else { replyingId.value = item.id; replyText.value = ''; selectedTemplateId.value = null }
}
function matchTemplates(star) { return templates.value.filter(t => (star||5) >= t.star_min && (star||5) <= t.star_max) }

async function aiGenerate(item) {
  if (aiGenerating.value) return
  aiGenerating.value = true
  try {
    const res = await request.post('/ks-reviews/ai-generate', { content: item.content, star: item.quality_score || item.star || 5 })
    const data = res.data || res
    if (data.reply) { replyText.value = data.reply; selectedTemplateId.value = null; message.success('AI回复已生成') }
    else { message.error('AI生成失败') }
  } catch (e) { message.error('AI生成失败') }
  finally { aiGenerating.value = false }
}

async function sendReply(item) {
  if (!replyText.value) return
  replySending.value = true
  try {
    await request.post('/ks-reviews/reply', {
      shop_id: shopId.value, comment_id: item.comment_id, content: replyText.value,
      template_id: selectedTemplateId.value, reply_type: selectedTemplateId.value ? 'manual' : 'ai',
    })
    message.success('回复成功')
    item.seller_reply = replyText.value; item.reply_status = 'replied'
    replyingId.value = null; replyText.value = ''; fetchOverview()
  } catch (e) { message.error('回复失败') }
  finally { replySending.value = false }
}

// ===== 设置 =====
const settings = reactive({ auto_reply_enabled: false, auto_reply_categories: ['5','4'], ai_reply_enabled: false, auto_reply_interval: 30, timer_running: false })
const settingsSaving = ref(false)

async function fetchSettings() {
  if (!shopId.value) return
  try {
    const res = await request.get('/ks-reviews/settings', { params: { shop_id: shopId.value } })
    const data = res.data || res
    settings.auto_reply_enabled = !!data.auto_reply_enabled
    settings.auto_reply_categories = data.auto_reply_categories || ['5','4']
    settings.ai_reply_enabled = !!data.ai_reply_enabled
    settings.auto_reply_interval = data.auto_reply_interval || 30
    settings.timer_running = !!data.timer_running
  } catch (e) {}
}

async function saveSettings() {
  settingsSaving.value = true
  try {
    const res = await request.post('/ks-reviews/settings', {
      shop_id: shopId.value, auto_reply_enabled: settings.auto_reply_enabled,
      auto_reply_stars: settings.auto_reply_categories, ai_reply_enabled: settings.ai_reply_enabled,
      auto_reply_interval: settings.auto_reply_interval,
    })
    const data = res.data || res
    settings.timer_running = !!data.timer_running
    message.success('设置已保存')
    fetchOverview()
  } catch (e) { message.error('保存失败') }
  finally { settingsSaving.value = false }
}

// ===== 模板 =====
const templates = ref([])
const templateModalOpen = ref(false)
const editingTemplateId = ref(null)
const templateSaving = ref(false)
const templateForm = reactive({ name: '', content: '', star_min: 1, star_max: 5, is_default: false })

async function fetchTemplates() {
  if (!shopId.value) return
  try { const res = await request.get('/ks-reviews/templates', { params: { shop_id: shopId.value } }); templates.value = res.data || res || [] } catch (e) {}
}
function openTemplateForm(tpl) {
  if (tpl) { editingTemplateId.value = tpl.id; Object.assign(templateForm, { name: tpl.name, content: tpl.content, star_min: tpl.star_min, star_max: tpl.star_max, is_default: !!tpl.is_default }) }
  else { editingTemplateId.value = null; Object.assign(templateForm, { name: '', content: '', star_min: 1, star_max: 5, is_default: false }) }
  templateModalOpen.value = true
}
async function saveTemplate() {
  if (!templateForm.content.trim()) return message.warning('请输入回复内容')
  templateSaving.value = true
  try { await request.post('/ks-reviews/templates', { id: editingTemplateId.value, shop_id: shopId.value, ...templateForm }); message.success('模板已保存'); templateModalOpen.value = false; fetchTemplates() }
  catch (e) { message.error('保存失败') }
  finally { templateSaving.value = false }
}
async function deleteTemplate(id) {
  try { await request.delete(`/ks-reviews/templates/${id}`); message.success('已删除'); fetchTemplates() } catch (e) { message.error('删除失败') }
}

// ===== 日志 =====
const logs = ref([])
const logsLoading = ref(false)
const logFilters = reactive({ reply_type: undefined, reply_status: undefined })
const logPagination = reactive({ current: 1, pageSize: 20, total: 0 })
const logStats = reactive({ total: 0, auto: 0, manual: 0, ai: 0, success: 0, fail: 0 })

async function fetchLogs() {
  if (!shopId.value) return
  logsLoading.value = true
  try {
    const params = { shop_id: shopId.value, page: logPagination.current, page_size: logPagination.pageSize }
    if (logFilters.reply_type) params.reply_type = logFilters.reply_type
    if (logFilters.reply_status) params.reply_status = logFilters.reply_status
    const res = await request.get('/ks-reviews/logs', { params })
    const data = res.data || res
    logs.value = data.list || []; logPagination.total = data.total || 0
    if (data.stats) Object.assign(logStats, data.stats)
  } catch (e) { logs.value = [] }
  finally { logsLoading.value = false }
}
function onLogPageChange(page) { logPagination.current = page; fetchLogs() }

// ===== 初始化 =====
onMounted(async () => {
  try {
    const res = await request.get('/ks/accounts')
    const accounts = res.data || res || []
    if (accounts.length) {
      shopId.value = accounts[0].shop_id
      await Promise.all([fetchOverview(), fetchReviews(), fetchSettings(), fetchTemplates(), fetchLatest()])
    }
  } catch (e) { message.error('获取店铺信息失败') }

  // 每60秒刷新最新评论和概览
  latestTimer = setInterval(() => { fetchLatest(); fetchOverview() }, 60000)
})

onUnmounted(() => { if (latestTimer) clearInterval(latestTimer) })
</script>

<style scoped>
.ks-reviews { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.timer-status { font-size: 12px; color: #52c41a; display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-dot.running { background: #52c41a; animation: pulse 2s infinite; }
.status-dot.stopped { background: #d9d9d9; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

/* 数据概览卡片 */
.stat-cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card {
  background: #fff; border: 1px solid #f0f0f0; border-radius: 8px; padding: 14px 16px; text-align: center;
}
.stat-card__value { font-size: 24px; font-weight: 700; color: #333; line-height: 1.2; }
.stat-card__value.blue { color: #1677ff; }
.stat-card__value.orange { color: #fa8c16; }
.stat-card__value.green { color: #52c41a; }
.stat-card__value.purple { color: #722ed1; }
.stat-card__label { font-size: 12px; color: #8c8c8c; margin-top: 4px; }
.stat-card__sub { font-size: 11px; color: #bfbfbf; margin-top: 2px; }

/* 最新评论滚动 */
.latest-scroll {
  background: #fff; border: 1px solid #f0f0f0; border-radius: 8px; margin-bottom: 16px; overflow: hidden;
}
.latest-scroll__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid #f0f0f0; background: #fafafa;
}
.latest-scroll__title { font-size: 14px; font-weight: 600; }
.latest-scroll__count { font-size: 12px; color: #8c8c8c; }
.latest-scroll__body { height: 160px; overflow: hidden; position: relative; }
.scroll-inner { padding: 8px 0; }
.scroll-inner.scroll-animate {
  animation: scrollUp 30s linear infinite;
}
.scroll-inner.scroll-animate:hover { animation-play-state: paused; }
@keyframes scrollUp {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
.scroll-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 16px; font-size: 12px;
  border-bottom: 1px solid #fafafa;
}
.scroll-item__stars { font-size: 11px; min-width: 55px; }
.scroll-item__stars.star-positive { color: #52c41a; }
.scroll-item__stars.star-neutral { color: #faad14; }
.scroll-item__stars.star-negative { color: #ff4d4f; }
.scroll-item__nick { color: #666; min-width: 60px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scroll-item__content { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; }
.scroll-item__tag { flex-shrink: 0; }
.scroll-item__time { color: #bfbfbf; font-size: 11px; min-width: 80px; text-align: right; }

.ops-tabs :deep(.ant-tabs-nav) { margin-bottom: 0; }
.tab-content { padding: 16px 0; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.stat-row { margin-bottom: 12px; }
.stat-tag-wrap { display: flex; gap: 8px; flex-wrap: wrap; }
.overview-tag { font-size: 12px; padding: 3px 10px; border-radius: 4px; background: #f5f5f5; color: #666; }
.overview-tag.pending { background: #fffbe6; color: #d48806; }
.overview-tag.success { background: #f6ffed; color: #52c41a; }
.overview-tag.positive { background: #f6ffed; color: #52c41a; }
.overview-tag.neutral { background: #fffbe6; color: #d48806; }
.overview-tag.negative { background: #fff1f0; color: #f5222d; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }

.comment-list { display: flex; flex-direction: column; gap: 12px; }
.comment-card { background: #fff; border: 1px solid #f0f0f0; border-radius: 8px; padding: 14px 16px; }
.comment-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.comment-card__buyer { font-size: 13px; font-weight: 600; }
.comment-card__stars { font-size: 13px; }
.comment-card__stars.star-positive { color: #52c41a; }
.comment-card__stars.star-neutral { color: #faad14; }
.comment-card__stars.star-negative { color: #ff4d4f; }
.comment-card__time { font-size: 11px; color: #8c8c8c; margin-left: auto; }
.comment-card__product { font-size: 12px; color: #8c8c8c; margin-bottom: 6px; }
.comment-card__body { margin-bottom: 8px; }
.comment-card__text { font-size: 13px; line-height: 1.6; }
.comment-card__reply { background: #f9f9f9; padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #666; display: flex; align-items: flex-start; gap: 6px; }
.reply-icon { color: #1677ff; margin-top: 2px; }
.comment-card__actions { margin-top: 8px; }
.comment-card__reply-input { margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0f0f0; }
.quick-templates { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; align-items: center; }
.quick-label { font-size: 12px; color: #8c8c8c; }
.quick-tag { padding: 2px 10px; background: #f0f5ff; border: 1px solid #d6e4ff; border-radius: 12px; font-size: 11px; color: #1677ff; cursor: pointer; }
.quick-tag:hover { background: #d6e4ff; }
.quick-tag.ai-tag { background: #f9f0ff; border-color: #d3adf7; color: #722ed1; }
.quick-tag.ai-tag:hover { background: #efdbff; }
.quick-tag.ai-tag.loading { opacity: 0.6; cursor: wait; }
.reply-btns { display: flex; gap: 8px; margin-top: 8px; }

.config-card { background: #fff; border: 1px solid #f0f0f0; border-radius: 8px; overflow: hidden; }
.config-card__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; }
.config-card__title { font-size: 15px; font-weight: 600; }
.config-card__body { padding: 16px; }
.config-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.config-label { font-size: 13px; color: #666; min-width: 80px; }
.ai-desc { font-size: 13px; color: #8c8c8c; line-height: 1.8; }
.timer-info { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 13px; color: #52c41a; }

.template-list { display: flex; flex-direction: column; gap: 10px; }
.template-card { border: 1px solid #f0f0f0; border-radius: 6px; padding: 12px 14px; }
.tpl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 6px; }
.tpl-name { font-size: 14px; font-weight: 600; }
.tpl-tags { display: flex; gap: 4px; }
.tpl-content { font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 8px; }
.tpl-actions { display: flex; gap: 4px; }

.log-card { background: #fff; border: 1px solid #f0f0f0; border-radius: 8px; padding: 12px 16px; }
.log-card__header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.log-card__buyer { font-size: 13px; font-weight: 500; }
.log-card__stars { color: #faad14; font-size: 12px; }
.log-card__time { font-size: 11px; color: #8c8c8c; margin-left: auto; }
.log-card__product { font-size: 12px; color: #8c8c8c; margin-bottom: 4px; }
.log-card__content, .log-card__reply { font-size: 12px; line-height: 1.6; margin-bottom: 2px; }
.log-label { color: #8c8c8c; }
.log-card__fail { font-size: 11px; color: #ff4d4f; margin-top: 4px; }
.pagination-wrap { margin-top: 16px; text-align: center; }

@media (max-width: 768px) {
  .stat-cards { grid-template-columns: repeat(3, 1fr); }
  .tab-toolbar { flex-direction: column; }
  .filter-bar { flex-direction: column; }
  .config-row { flex-direction: column; align-items: flex-start; }
}
</style>
