<template>
  <div class="ops-accounts">
    <div class="page-header">
      <h2 class="page-title">账号管理</h2>
      <a-button type="primary" @click="openAccountModal()">
        <template #icon><PlusOutlined /></template>
        添加账号
      </a-button>
    </div>

    <!-- Quick Stats -->
    <div class="stats-bar">
      <span class="stats-bar__item">总账号: <b>{{ accountStats.total }}</b></span>
      <span class="stats-bar__sep">|</span>
      <span class="stats-bar__item">正常: <b class="stats-bar__val--active">{{ accountStats.active }}</b></span>
      <span class="stats-bar__sep">|</span>
      <span class="stats-bar__item">停用: <b>{{ accountStats.inactive }}</b></span>
      <span class="stats-bar__sep">|</span>
      <span class="stats-bar__item">过期: <b class="stats-bar__val--expired">{{ accountStats.expired }}</b></span>
    </div>

    <!-- Guide Section -->
    <div class="guide-section" v-if="showGuide">
      <div class="guide-section__header">
        <div class="guide-section__title-row">
          <InfoCircleOutlined class="guide-section__icon" />
          <span class="guide-section__title">账号管理说明</span>
        </div>
        <a-button type="text" size="small" class="guide-section__close" @click="showGuide = false">
          <CloseOutlined />
        </a-button>
      </div>
      <div class="guide-section__desc">
        管理用于千川素材评论互动的抖音账号池。系统会自动轮询可用账号发布评论和回复，确保分散操作降低风控风险。
      </div>

      <!-- Flow Steps -->
      <div class="guide-flow">
        <div class="guide-flow__title">接入流程</div>
        <div class="guide-flow__steps">
          <div class="guide-flow__step">
            <div class="guide-flow__step-num">1</div>
            <div class="guide-flow__step-content">
              <div class="guide-flow__step-title">抖音开放平台授权</div>
              <div class="guide-flow__step-desc">在巨量引擎开放平台完成 OAuth 授权，获取账号的 Access Token 和 Refresh Token</div>
            </div>
          </div>
          <div class="guide-flow__arrow"><RightOutlined v-if="!isMobile" /><DownOutlined v-else /></div>
          <div class="guide-flow__step">
            <div class="guide-flow__step-num">2</div>
            <div class="guide-flow__step-content">
              <div class="guide-flow__step-title">录入账号信息</div>
              <div class="guide-flow__step-desc">点击「添加账号」填写账号名称、抖音UID、Token 等信息，按业务需要分配分组</div>
            </div>
          </div>
          <div class="guide-flow__arrow"><RightOutlined v-if="!isMobile" /><DownOutlined v-else /></div>
          <div class="guide-flow__step">
            <div class="guide-flow__step-num">3</div>
            <div class="guide-flow__step-content">
              <div class="guide-flow__step-title">系统自动轮询</div>
              <div class="guide-flow__step-desc">系统自动监控 Token 状态，过期前提醒刷新；异常账号自动剔除，不影响任务执行</div>
            </div>
          </div>
          <div class="guide-flow__arrow"><RightOutlined v-if="!isMobile" /><DownOutlined v-else /></div>
          <div class="guide-flow__step">
            <div class="guide-flow__step-num">4</div>
            <div class="guide-flow__step-content">
              <div class="guide-flow__step-title">投入评论任务</div>
              <div class="guide-flow__step-desc">在「评论管理」中创建任务时选择账号，系统自动按风控规则轮换账号执行</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status & Risk Info -->
      <div class="guide-info-cards">
        <div class="guide-info-card">
          <div class="guide-info-card__title">账号状态说明</div>
          <div class="guide-info-card__list">
            <div class="guide-info-card__item"><a-tag color="green" size="small">正常</a-tag><span>已授权且可用，可正常参与评论任务</span></div>
            <div class="guide-info-card__item"><a-tag size="small">停用</a-tag><span>手动暂停，不会被分配新的评论任务</span></div>
            <div class="guide-info-card__item"><a-tag color="orange" size="small">过期</a-tag><span>Token 已过期，需重新授权获取新 Token</span></div>
            <div class="guide-info-card__item"><a-tag color="red" size="small">封禁</a-tag><span>平台检测到异常，建议停用并排查原因</span></div>
          </div>
        </div>
        <div class="guide-info-card">
          <div class="guide-info-card__title">风控限额（单账号）</div>
          <div class="guide-info-card__list">
            <div class="guide-info-card__item"><span class="risk-label">每分钟上限</span><span class="risk-value">≤ 5 条</span></div>
            <div class="guide-info-card__item"><span class="risk-label">每小时上限</span><span class="risk-value">≤ 80 条</span></div>
            <div class="guide-info-card__item"><span class="risk-label">每日上限</span><span class="risk-value">≤ 200 条</span></div>
            <div class="guide-info-card__item"><span class="risk-label">评论间隔</span><span class="risk-value">10 ~ 60 秒随机</span></div>
          </div>
        </div>
      </div>

      <div class="guide-tip">
        <BulbOutlined class="guide-tip__icon" />
        <span>建议至少添加 <b>3 个以上账号</b> 并分配到不同分组，系统会自动轮换使用，有效降低单账号风控压力。</span>
      </div>
    </div>

    <div v-if="!showGuide" class="guide-toggle" @click="showGuide = true">
      <QuestionCircleOutlined />
      <span>查看账号接入说明与流程</span>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <a-select v-model:value="filters.status" placeholder="账号状态" allow-clear style="width: 120px" @change="loadAccounts">
        <a-select-option value="active">正常</a-select-option>
        <a-select-option value="inactive">停用</a-select-option>
        <a-select-option value="banned">封禁</a-select-option>
        <a-select-option value="expired">过期</a-select-option>
      </a-select>
      <a-select v-model:value="filters.group" placeholder="分组" allow-clear style="width: 120px" @change="loadAccounts">
        <a-select-option v-for="g in groups" :key="g" :value="g">{{ g }}</a-select-option>
      </a-select>
      <a-input-search
        v-model:value="filters.keyword"
        placeholder="搜索账号名/UID"
        style="width: 200px"
        allow-clear
        @search="loadAccounts"
      />
    </div>

    <a-spin :spinning="loading">
      <!-- Mobile: Card View -->
      <div v-if="isMobile" class="account-cards">
        <div v-for="acc in accounts" :key="acc.id" class="account-card">
          <div class="account-card__top">
            <div class="account-card__avatar">
              <a-avatar :src="acc.avatar" :size="44">
                {{ (acc.name || '?')[0] }}
              </a-avatar>
            </div>
            <div class="account-card__info">
              <div class="account-card__name">{{ acc.name }}</div>
              <div class="account-card__uid">UID: {{ acc.uid }}</div>
            </div>
            <a-tag :color="statusColor(acc.status)" size="small">{{ statusText(acc.status) }}</a-tag>
          </div>
          <div class="account-card__token">
            <span :class="['token-dot', 'token-dot--' + tokenHealth(acc).level]"></span>
            <span class="token-health-text">{{ tokenHealth(acc).text }}</span>
          </div>
          <div class="account-card__meta">
            <div class="account-card__meta-item">
              <span class="meta-label">分组</span>
              <a-tag v-if="acc.group" size="small">{{ acc.group }}</a-tag>
              <span v-else class="meta-value">未分组</span>
            </div>
            <div class="account-card__meta-item">
              <span class="meta-label">今日评论</span>
              <span class="meta-value">{{ acc.today_comments ?? 0 }}</span>
            </div>
            <div class="account-card__meta-item">
              <span class="meta-label">最后活跃</span>
              <span class="meta-value">{{ acc.last_active || '-' }}</span>
            </div>
          </div>
          <div class="account-card__actions">
            <a-button type="link" size="small" @click="openAccountModal(acc)">编辑</a-button>
            <a-button
              type="link"
              size="small"
              @click="toggleStatus(acc)"
            >{{ acc.status === 'active' ? '停用' : '启用' }}</a-button>
            <a-button type="link" size="small" danger @click="deleteAccount(acc.id)">删除</a-button>
          </div>
        </div>
        <a-empty v-if="!accounts.length && !loading" description="暂无账号" />
      </div>

      <!-- Desktop: Table View -->
      <a-table
        v-else
        :columns="columns"
        :data-source="accounts"
        :pagination="pagination"
        row-key="id"
        size="small"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="table-account">
              <a-avatar :src="record.avatar" :size="32">{{ (record.name || '?')[0] }}</a-avatar>
              <div>
                <div class="table-account__name">{{ record.name }}</div>
                <div class="table-account__uid">{{ record.uid }}</div>
              </div>
            </div>
          </template>
          <template v-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)" size="small">{{ statusText(record.status) }}</a-tag>
          </template>
          <template v-if="column.key === 'token_health'">
            <span class="token-health-inline">
              <span :class="['token-dot', 'token-dot--' + tokenHealth(record).level]"></span>
              {{ tokenHealth(record).text }}
            </span>
          </template>
          <template v-if="column.key === 'group'">
            <a-tag v-if="record.group" size="small">{{ record.group }}</a-tag>
            <span v-else style="color: #bfbfbf">-</span>
          </template>
          <template v-if="column.key === 'actions'">
            <a-space>
              <a-button type="link" size="small" @click="openAccountModal(record)">编辑</a-button>
              <a-button type="link" size="small" @click="toggleStatus(record)">
                {{ record.status === 'active' ? '停用' : '启用' }}
              </a-button>
              <a-button type="link" size="small" danger @click="deleteAccount(record.id)">删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-spin>

    <!-- Add/Edit Account Modal -->
    <a-modal
      v-model:open="showModal"
      :title="editingAccount ? '编辑账号' : '添加账号'"
      :width="isMobile ? '95%' : 520"
      @ok="submitAccount"
      :confirm-loading="submitting"
      ok-text="保存"
      cancel-text="取消"
    >
      <a-form :model="accountForm" layout="vertical" style="margin-top: 16px">
        <a-form-item label="账号名称" required>
          <a-input v-model:value="accountForm.name" placeholder="输入账号名称" />
        </a-form-item>
        <a-form-item label="抖音UID" required>
          <a-input v-model:value="accountForm.uid" placeholder="输入抖音UID" />
        </a-form-item>
        <a-form-item label="Access Token">
          <a-input-password v-model:value="accountForm.access_token" placeholder="输入access token" />
        </a-form-item>
        <a-form-item label="Refresh Token">
          <a-input-password v-model:value="accountForm.refresh_token" placeholder="输入refresh token" />
        </a-form-item>
        <a-form-item label="过期时间">
          <a-date-picker
            v-model:value="accountForm.expire_at"
            show-time
            placeholder="选择过期时间"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="分组">
          <a-select v-model:value="accountForm.group" placeholder="选择或输入分组" allow-clear mode="tags" :max-tag-count="1">
            <a-select-option v-for="g in groups" :key="g" :value="g">{{ g }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, InfoCircleOutlined, CloseOutlined, RightOutlined, DownOutlined, BulbOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import request from '@/utils/request'

const isMobile = ref(window.innerWidth < 768)
const showGuide = ref(false)
const onResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  window.addEventListener('resize', onResize)
  loadAccounts()
  loadGroups()
})
onBeforeUnmount(() => { window.removeEventListener('resize', onResize) })

const loading = ref(false)
const accounts = ref([])
const groups = ref([])
const filters = reactive({ status: undefined, group: undefined, keyword: '' })
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: false })

const columns = [
  { title: '账号', key: 'name', width: 200 },
  { title: '状态', key: 'status', width: 80 },
  { title: 'Token', key: 'token_health', width: 100 },
  { title: '分组', key: 'group', width: 100 },
  { title: '今日评论', dataIndex: 'today_comments', key: 'today_comments', width: 100 },
  { title: '最后活跃', dataIndex: 'last_active', key: 'last_active', width: 160 },
  { title: '操作', key: 'actions', width: 180, fixed: 'right' },
]

function statusColor(s) {
  const map = { active: 'green', inactive: 'default', banned: 'red', expired: 'orange' }
  return map[s] || 'default'
}
function statusText(s) {
  const map = { active: '正常', inactive: '停用', banned: '封禁', expired: '过期' }
  return map[s] || s
}

function tokenHealth(acc) {
  if (!acc.token_expires_at) return { level: 'gray', text: '未配置' }
  const now = Date.now()
  const expires = new Date(acc.token_expires_at).getTime()
  if (expires <= now) return { level: 'red', text: '已过期' }
  const hoursLeft = (expires - now) / (1000 * 60 * 60)
  if (hoursLeft < 12) return { level: 'orange', text: '即将过期' }
  return { level: 'green', text: '有效' }
}

const accountStats = computed(() => {
  const list = accounts.value
  return {
    total: list.length,
    active: list.filter(a => a.status === 'active').length,
    inactive: list.filter(a => a.status === 'inactive').length,
    expired: list.filter(a => a.status === 'expired').length,
  }
})

async function loadAccounts() {
  loading.value = true
  try {
    const params = {
      page: pagination.current,
      page_size: pagination.pageSize,
      status: filters.status,
      group: filters.group,
      keyword: filters.keyword || undefined,
    }
    const res = await request.get('/operations/accounts', { params })
    accounts.value = res.data?.list || res.data || []
    pagination.total = res.data?.total || 0
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

async function loadGroups() {
  try {
    const res = await request.get('/operations/accounts/groups')
    groups.value = res.data || []
  } catch (e) { console.error(e) }
}

function onTableChange(pag) {
  pagination.current = pag.current
  loadAccounts()
}

// Modal
const showModal = ref(false)
const editingAccount = ref(null)
const submitting = ref(false)
const accountForm = reactive({
  name: '',
  uid: '',
  access_token: '',
  refresh_token: '',
  expire_at: null,
  group: undefined,
})

function openAccountModal(acc = null) {
  editingAccount.value = acc
  if (acc) {
    accountForm.name = acc.name
    accountForm.uid = acc.uid
    accountForm.access_token = ''
    accountForm.refresh_token = ''
    accountForm.expire_at = null
    accountForm.group = acc.group ? [acc.group] : undefined
  } else {
    accountForm.name = ''
    accountForm.uid = ''
    accountForm.access_token = ''
    accountForm.refresh_token = ''
    accountForm.expire_at = null
    accountForm.group = undefined
  }
  showModal.value = true
}

async function submitAccount() {
  if (!accountForm.name || !accountForm.uid) {
    message.warning('请填写账号名称和UID')
    return
  }
  submitting.value = true
  try {
    const payload = {
      name: accountForm.name,
      uid: accountForm.uid,
      access_token: accountForm.access_token || undefined,
      refresh_token: accountForm.refresh_token || undefined,
      expire_at: accountForm.expire_at ? accountForm.expire_at.format('YYYY-MM-DD HH:mm:ss') : undefined,
      group: Array.isArray(accountForm.group) ? accountForm.group[0] : accountForm.group,
    }
    if (editingAccount.value) {
      await request.put(`/operations/accounts/${editingAccount.value.id}`, payload)
      message.success('账号已更新')
    } else {
      await request.post('/operations/accounts', payload)
      message.success('账号已添加')
    }
    showModal.value = false
    loadAccounts()
    loadGroups()
  } catch (e) { console.error(e) }
  finally { submitting.value = false }
}

async function toggleStatus(acc) {
  const newStatus = acc.status === 'active' ? 'inactive' : 'active'
  try {
    await request.put(`/operations/accounts/${acc.id}`, { status: newStatus })
    message.success(newStatus === 'active' ? '已启用' : '已停用')
    loadAccounts()
  } catch (e) { console.error(e) }
}

function deleteAccount(id) {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除该账号吗？此操作不可恢复。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await request.delete(`/operations/accounts/${id}`)
        message.success('已删除')
        loadAccounts()
      } catch (e) { console.error(e) }
    },
  })
}
</script>

<style scoped>
.ops-accounts {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #595959;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 8px;
}
.stats-bar__sep {
  color: #d9d9d9;
}
.stats-bar__val--active {
  color: #52c41a;
}
.stats-bar__val--expired {
  color: #faad14;
}

/* Token Health */
.token-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.token-dot--green { background: #52c41a; }
.token-dot--orange { background: #faad14; }
.token-dot--red { background: #ff4d4f; }
.token-dot--gray { background: #d9d9d9; }
.token-health-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #595959;
}
.account-card__token {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #595959;
  margin-bottom: 8px;
  padding-left: 56px;
}
.token-health-text {
  font-size: 12px;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

/* Account Cards (Mobile) */
.account-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.account-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.account-card__top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.account-card__avatar {
  flex-shrink: 0;
}
.account-card__info {
  flex: 1;
  min-width: 0;
}
.account-card__name {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-card__uid {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 2px;
}
.account-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid #f5f5f5;
  border-bottom: 1px solid #f5f5f5;
}
.account-card__meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.meta-label {
  font-size: 12px;
  color: #8c8c8c;
}
.meta-value {
  font-size: 14px;
  color: #1a1a1a;
}
.account-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
}

/* Table account cell */
.table-account {
  display: flex;
  align-items: center;
  gap: 10px;
}
.table-account__name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}
.table-account__uid {
  font-size: 12px;
  color: #8c8c8c;
}

/* Guide Section */
.guide-section {
  background: linear-gradient(135deg, #f0f5ff 0%, #e8f4f8 100%);
  border: 1px solid #d6e4ff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.guide-section__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.guide-section__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.guide-section__icon {
  font-size: 18px;
  color: #1677ff;
}
.guide-section__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}
.guide-section__close {
  color: #8c8c8c;
  flex-shrink: 0;
}
.guide-section__desc {
  font-size: 13px;
  color: #595959;
  line-height: 1.6;
  margin: 8px 0 16px;
  padding-left: 26px;
}

/* Flow Steps */
.guide-flow {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
}
.guide-flow__title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 14px;
}
.guide-flow__steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.guide-flow__step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: #fafafa;
  border-radius: 8px;
}
.guide-flow__step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1677ff;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.guide-flow__step-content {
  flex: 1;
  min-width: 0;
}
.guide-flow__step-title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  margin-bottom: 3px;
}
.guide-flow__step-desc {
  font-size: 12px;
  color: #8c8c8c;
  line-height: 1.5;
}
.guide-flow__arrow {
  display: flex;
  justify-content: center;
  align-items: center;
  color: #bfbfbf;
  font-size: 12px;
  padding: 2px 0;
}

/* Info Cards */
.guide-info-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.guide-info-card {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
}
.guide-info-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 10px;
}
.guide-info-card__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.guide-info-card__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #595959;
}
.risk-label {
  color: #8c8c8c;
  min-width: 72px;
}
.risk-value {
  font-weight: 500;
  color: #1a1a1a;
}

/* Tip */
.guide-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 8px;
  font-size: 13px;
  color: #595959;
  line-height: 1.5;
}
.guide-tip__icon {
  color: #faad14;
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* Guide Toggle */
.guide-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #1677ff;
  cursor: pointer;
  margin-bottom: 12px;
  padding: 6px 0;
}
.guide-toggle:hover {
  opacity: 0.8;
}

@media (min-width: 768px) {
  .ops-accounts {
    padding: 24px;
  }
  .guide-section {
    padding: 20px;
  }
  .guide-section__desc {
    font-size: 14px;
  }
  .guide-flow__steps {
    flex-direction: row;
    align-items: flex-start;
    gap: 0;
  }
  .guide-flow__step {
    flex: 1;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 14px 10px;
    background: #fafafa;
  }
  .guide-flow__step-content {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .guide-flow__step-desc {
    max-width: 180px;
  }
  .guide-flow__arrow {
    display: flex;
    align-items: center;
    padding: 0 4px;
    margin-top: 14px;
    color: #bfbfbf;
    font-size: 14px;
  }
  .guide-info-cards {
    flex-direction: row;
  }
  .guide-info-card {
    flex: 1;
  }
}
</style>
