<template>
  <div class="settings-page">
    <!-- 用户信息块 -->
    <div class="user-block">
      <div class="user-avatar">{{ userInitial }}</div>
      <div class="user-info">
        <div class="user-name">{{ userInfo.username || '管理员' }}</div>
        <div class="user-role">{{ userInfo.role === 'admin' ? '超级管理员' : '操作员' }}</div>
      </div>
      <button class="edit-avatar-btn" @click="showPasswordModal = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>

    <!-- 设置分组 -->
    <div class="settings-group" v-for="group in settingGroups" :key="group.title">
      <div class="group-title">{{ group.title }}</div>
      <div class="group-card">
        <div
          class="setting-item"
          v-for="item in group.items"
          :key="item.key"
          @click="handleItemClick(item)"
        >
          <div class="item-left">
            <div class="item-icon" :style="{ background: item.iconBg, color: item.iconColor }">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="item.icon"></svg>
            </div>
            <div class="item-text">
              <div class="item-label">{{ item.label }}</div>
              <div class="item-desc" v-if="item.desc">{{ item.desc }}</div>
            </div>
          </div>
          <div class="item-right">
            <a-switch
              v-if="item.type === 'switch'"
              v-model:checked="settings[item.key]"
              size="small"
              @click.stop
              @change="saveSetting(item.key, $event)"
            />
            <span v-else-if="item.type === 'value'" class="item-value">{{ item.value }}</span>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- 同步设置 -->
    <div class="settings-group">
      <div class="group-title">同步设置</div>
      <div class="group-card">
        <div class="setting-item no-arrow">
          <div class="item-left">
            <div class="item-icon" style="background: #E8F4FF; color: #1677FF;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="item-text">
              <div class="item-label">同步频率</div>
            </div>
          </div>
          <a-select
            v-model:value="settings.syncInterval"
            style="width: 110px"
            size="small"
            :options="syncIntervalOptions"
            @change="saveSetting('syncInterval', $event)"
          />
        </div>
        <div class="setting-item no-arrow">
          <div class="item-left">
            <div class="item-icon" style="background: #E8FFF3; color: #00B96B;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </div>
            <div class="item-text">
              <div class="item-label">上次同步</div>
              <div class="item-desc">{{ lastSyncTime }}</div>
            </div>
          </div>
          <button class="sync-now-btn" @click="syncNow" :disabled="syncing">
            {{ syncing ? '同步中' : '立即同步' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 退出登录 -->
    <div class="logout-section">
      <button class="logout-btn" @click="logout">退出登录</button>
    </div>

    <!-- 版本信息 -->
    <div class="version-info">千川监控系统 v2.0.0</div>

    <!-- 修改密码弹窗 -->
    <a-modal
      v-model:open="showPasswordModal"
      title="修改密码"
      okText="确认修改"
      cancelText="取消"
      @ok="changePassword"
    >
      <div class="pwd-form">
        <div class="form-item">
          <label>当前密码</label>
          <a-input-password v-model:value="pwdForm.old" placeholder="请输入当前密码" />
        </div>
        <div class="form-item">
          <label>新密码</label>
          <a-input-password v-model:value="pwdForm.new" placeholder="至少6位" />
        </div>
        <div class="form-item">
          <label>确认新密码</label>
          <a-input-password v-model:value="pwdForm.confirm" placeholder="再次输入新密码" />
        </div>
      </div>
    </a-modal>

    <!-- API Config Modal -->
    <a-modal
      v-model:open="showApiConfigModal"
      title="API 配置"
      :width="520"
      :footer="null"
    >
      <a-tabs v-model:activeKey="apiConfigTab" style="margin-top: -8px">
        <a-tab-pane key="qianchuan" tab="千川配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <div class="api-config-item">
                <div class="api-config-label">APP ID</div>
                <div class="api-config-value">{{ qianchuanConfig.config?.qianchuan_app_id || '-' }}</div>
              </div>
              <div class="api-config-item">
                <div class="api-config-label">APP Secret</div>
                <div class="api-config-value secret-mask">{{ qianchuanConfig.config?.qianchuan_app_secret ? '••••••••' + qianchuanConfig.config.qianchuan_app_secret.slice(-8) : '-' }}</div>
              </div>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">已授权账户</div>
              <div v-if="qianchuanConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in qianchuanConfig.accounts" :key="acc.advertiser_id">
                  <div class="api-account-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.token_expires_at">有效期至 {{ acc.token_expires_at?.substring(0, 16) }}</span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="marketing" tab="巨量营销配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP ID">
                  <a-input v-model:value="marketingForm.marketing_app_id" placeholder="巨量营销 APP ID" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="marketingForm.marketing_app_secret" placeholder="巨量营销 APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveMarketingConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权账户
                <a-button type="link" size="small" :loading="tokenRefreshing" @click="refreshMarketingToken" style="float:right">刷新Token</a-button>
              </div>
              <div v-if="marketingConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in marketingConfig.accounts" :key="acc.advertiser_id">
                  <div class="api-account-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.token_expires_at">
                      有效期至 {{ acc.token_expires_at?.substring(0, 16) }}
                    </span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />
              <div class="api-config-tip">
                <span>💡 评论管理功能使用巨量营销Token，独立于千川Token。系统每小时自动检查并刷新即将过期的Token。</span>
              </div>
            </div>
          </a-spin>
        </a-tab-pane>
      </a-tabs>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import request from '@/utils/request'
import dayjs from 'dayjs'

const router = useRouter()

const userInfo = ref({ username: '管理员', role: 'admin' })
const userInitial = computed(() => String(userInfo.value.username || 'A').charAt(0).toUpperCase())
const showPasswordModal = ref(false)
const showApiConfigModal = ref(false)
const apiConfigTab = ref('qianchuan')
const apiConfigLoading = ref(false)
const qianchuanConfig = ref({ config: {}, accounts: [] })
const marketingConfig = ref({ config: {}, accounts: [] })
const marketingForm = reactive({ marketing_app_id: '', marketing_app_secret: '' })
const tokenRefreshing = ref(false)
const syncing = ref(false)
const lastSyncTime = ref('加载中...')

const settings = ref({
  autoSync: true,
  syncInterval: '30',
  alertNotify: true,
  darkMode: false,
  mobileOptimize: true,
})

const syncIntervalOptions = [
  { label: '15 分钟', value: '15' },
  { label: '30 分钟', value: '30' },
  { label: '1 小时', value: '60' },
  { label: '3 小时', value: '180' },
]

const settingGroups = [
  {
    title: '通知设置',
    items: [
      {
        key: 'alertNotify',
        label: '告警通知',
        desc: '触发告警规则时发送通知',
        type: 'switch',
        icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        iconBg: '#FFF7E6',
        iconColor: '#FF8A00',
      },
      {
        key: 'autoSync',
        label: '自动同步',
        desc: '按设置频率自动拉取数据',
        type: 'switch',
        icon: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        iconBg: '#E8FFF3',
        iconColor: '#00B96B',
      },
    ],
  },
  {
    title: '账户安全',
    items: [
      {
        key: 'changePassword',
        label: '修改密码',
        type: 'link',
        icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        iconBg: '#E8F4FF',
        iconColor: '#1677FF',
      },
      {
        key: 'apiConfig',
        label: 'API 配置管理',
        desc: '千川 & 巨量营销配置',
        type: 'link',
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>',
        iconBg: '#F3F0FF',
        iconColor: '#7B5EA7',
      },
    ],
  },
  {
    title: '关于',
    items: [
      {
        key: 'docs',
        label: '使用文档',
        type: 'link',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>',
        iconBg: '#F5F6F8',
        iconColor: '#595959',
      },
      {
        key: 'version',
        label: '当前版本',
        type: 'value',
        value: 'v2.0.0',
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>',
        iconBg: '#F5F6F8',
        iconColor: '#595959',
      },
    ],
  },
]

const pwdForm = ref({ old: '', new: '', confirm: '' })

function handleItemClick(item) {
  if (item.key === 'changePassword') {
    showPasswordModal.value = true
  } else if (item.key === 'apiConfig') {
    showApiConfigModal.value = true
    loadApiConfig()
  }
}

function saveSetting(key, val) {
  settings.value[key] = val
  try {
    localStorage.setItem('app_settings', JSON.stringify(settings.value))
  } catch {}
}

async function syncNow() {
  syncing.value = true
  try {
    await axios.post('/api/sync/manual')
    lastSyncTime.value = dayjs().format('MM-DD HH:mm')
    message.success('数据同步完成')
  } catch {
    message.error('同步失败')
  } finally {
    syncing.value = false
  }
}

async function loadApiConfig() {
  apiConfigLoading.value = true
  try {
    const [qcRes, mktRes] = await Promise.all([
      request.get('/settings/qianchuan'),
      request.get('/settings/marketing'),
    ])
    qianchuanConfig.value = qcRes?.data || { config: {}, accounts: [] }
    marketingConfig.value = mktRes?.data || { config: {}, accounts: [] }
    marketingForm.marketing_app_id = marketingConfig.value.config?.marketing_app_id || ''
    marketingForm.marketing_app_secret = marketingConfig.value.config?.marketing_app_secret || ''
  } catch (e) { console.error(e) }
  finally { apiConfigLoading.value = false }
}

async function saveMarketingConfig() {
  try {
    await request.post('/settings/marketing', marketingForm)
    message.success('巨量营销配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function refreshMarketingToken() {
  tokenRefreshing.value = true
  try {
    const res = await request.post('/settings/marketing/refresh-token')
    if (res?.code === 0 || res?.msg) {
      message.success(res?.msg || 'Token刷新成功')
      loadApiConfig()
    } else {
      message.error(res?.msg || 'Token刷新失败')
    }
  } catch (e) { message.error('刷新失败') }
  finally { tokenRefreshing.value = false }
}

async function changePassword() {
  if (!pwdForm.value.old || !pwdForm.value.new) { message.warning('请填写完整'); return }
  if (pwdForm.value.new !== pwdForm.value.confirm) { message.warning('两次密码不一致'); return }
  if (pwdForm.value.new.length < 6) { message.warning('新密码至少6位'); return }
  try {
    await axios.post('/api/auth/change-password', { oldPassword: pwdForm.value.old, newPassword: pwdForm.value.new })
    showPasswordModal.value = false
    message.success('密码已修改')
    pwdForm.value = { old: '', new: '', confirm: '' }
  } catch {
    message.error('密码修改失败，请检查当前密码')
  }
}

function logout() {
  Modal.confirm({
    title: '确认退出',
    content: '确定要退出登录吗？',
    okText: '退出',
    cancelText: '取消',
    okType: 'danger',
    onOk() {
      localStorage.removeItem('token')
      router.push('/login')
    },
  })
}

onMounted(() => {
  const saved = localStorage.getItem('app_settings')
  if (saved) { try { Object.assign(settings.value, JSON.parse(saved)) } catch {} }
  const token = localStorage.getItem('token')
  if (token) { try { const p = JSON.parse(atob(token.split('.')[1])); userInfo.value.username = p.username || '管理员'; userInfo.value.role = p.role || 'admin' } catch {} }
  axios.get('/api/sync/status').then(r => {
    lastSyncTime.value = r.data?.last_sync ? dayjs(r.data.last_sync).format('MM-DD HH:mm') : '从未'
  }).catch(() => { lastSyncTime.value = '未知' })
})
</script>

<style scoped>
.settings-page {
  padding-bottom: calc(var(--tabnav-h) + var(--safe-b) + 24px);
  min-height: 100vh;
  background: var(--bg-page);
}

.user-block {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-card);
  padding: 20px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1677FF, #0958D9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  flex-shrink: 0;
}
.user-info { flex: 1; }
.user-name { font-size: 17px; font-weight: 600; color: var(--text-primary); }
.user-role { font-size: 13px; color: var(--text-hint); margin-top: 2px; }
.edit-avatar-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #F5F6F8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
}

.settings-group { margin: 0 12px 16px; }
.group-title { font-size: 12px; color: var(--text-hint); font-weight: 500; margin-bottom: 8px; padding-left: 4px; }

.group-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.setting-item:last-child { border-bottom: none; }
.setting-item:active { background: #F5F6F8; }
.setting-item.no-arrow { cursor: default; }
.setting-item.no-arrow:active { background: transparent; }

.item-left { display: flex; align-items: center; gap: 12px; }
.item-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.item-label { font-size: 14px; color: var(--text-primary); }
.item-desc { font-size: 11px; color: var(--text-hint); margin-top: 2px; }
.item-right { display: flex; align-items: center; }
.item-value { font-size: 13px; color: var(--text-hint); margin-right: 4px; }

.sync-now-btn {
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid var(--c-primary);
  background: var(--c-primary-bg);
  color: var(--c-primary);
  font-size: 13px;
  cursor: pointer;
}
.sync-now-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.logout-section { margin: 0 12px 12px; }
.logout-btn {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--c-danger);
  background: transparent;
  color: var(--c-danger);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.logout-btn:active { background: var(--c-danger-bg); }

.version-info {
  text-align: center;
  font-size: 12px;
  color: var(--text-hint);
  padding: 8px;
}

.pwd-form { display: flex; flex-direction: column; gap: 16px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.form-item label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }

.api-config-section {
  padding: 4px 0;
}
.api-config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
}
.api-config-label {
  font-size: 14px;
  color: #595959;
}
.api-config-value {
  font-size: 14px;
  color: #1a1a1a;
  font-family: monospace;
}
.secret-mask {
  color: #8c8c8c;
}
.api-config-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 16px 0;
}
.api-config-subtitle {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 10px;
}
.api-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.api-account-item {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 8px;
}
.api-account-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  margin-bottom: 4px;
}
.api-account-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.api-account-expire {
  font-size: 12px;
  color: #8c8c8c;
}
.api-config-tip {
  margin-top: 16px;
  padding: 10px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 8px;
  font-size: 13px;
  color: #595959;
  line-height: 1.5;
}

@media (min-width: 768px) {
  .settings-page { padding-bottom: 24px; max-width: 600px; margin: 0 auto; }
  .settings-group { margin: 0 0 16px; }
  .logout-section { margin: 0 0 12px; }
}
</style>
