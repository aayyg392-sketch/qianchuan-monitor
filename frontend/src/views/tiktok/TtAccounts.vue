<template>
  <div class="tt-page">
    <div class="tt-page__header">
      <h2 class="tt-page__title">TikTok 账户</h2>
      <a-button type="primary" size="small" @click="doAuth">绑定新账户</a-button>
    </div>

    <!-- 提示信息 -->
    <a-alert v-if="$route.query.success" type="success" message="账户绑定成功" show-icon closable style="margin-bottom:12px" />
    <a-alert v-if="$route.query.error" type="error" :message="'绑定失败: ' + $route.query.error" show-icon closable style="margin-bottom:12px" />

    <!-- 账户列表 -->
    <div class="tt-card">
      <div class="tt-acc-list">
        <div class="tt-acc-item" v-for="acc in accounts" :key="acc.id">
          <div class="tt-acc-item__avatar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <div class="tt-acc-item__info">
            <div class="tt-acc-item__name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
            <div class="tt-acc-item__meta">
              <span>ID: {{ acc.advertiser_id }}</span>
              <span v-if="acc.market" class="tt-tag tt-tag--market">{{ acc.market }}</span>
              <span>{{ acc.currency }}</span>
            </div>
            <div class="tt-acc-item__token">
              Token {{ tokenStatus(acc) }}
            </div>
          </div>
          <div class="tt-acc-item__actions">
            <a-button size="small" @click="editAcc = acc; editModal = true">编辑</a-button>
            <a-popconfirm title="确认解绑此账户？" @confirm="unbind(acc.id)">
              <a-button size="small" danger>解绑</a-button>
            </a-popconfirm>
          </div>
        </div>
        <a-empty v-if="!accounts.length && !loading" description="暂无绑定账户">
          <a-button type="primary" @click="doAuth">绑定 TikTok 广告账户</a-button>
        </a-empty>
      </div>
    </div>

    <!-- 配置说明 -->
    <div class="tt-card" style="margin-top:12px">
      <div class="tt-card__header"><span class="tt-card__title">接入说明</span></div>
      <div class="tt-guide">
        <div class="tt-guide__step">
          <div class="tt-guide__num">1</div>
          <div class="tt-guide__text">在 TikTok 开发者平台创建应用，获取 App ID 和 Secret</div>
        </div>
        <div class="tt-guide__step">
          <div class="tt-guide__num">2</div>
          <div class="tt-guide__text">配置回调URL为：<code>{{ callbackUrl }}</code></div>
        </div>
        <div class="tt-guide__step">
          <div class="tt-guide__num">3</div>
          <div class="tt-guide__text">在服务器 .env 中填入 TIKTOK_APP_ID 和 TIKTOK_APP_SECRET</div>
        </div>
        <div class="tt-guide__step">
          <div class="tt-guide__num">4</div>
          <div class="tt-guide__text">点击「绑定新账户」完成 OAuth 授权</div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModal" title="编辑账户" @ok="doEdit" :confirmLoading="editLoading">
      <a-form layout="vertical" v-if="editAcc">
        <a-form-item label="账户名称"><a-input v-model:value="editAcc.advertiser_name" /></a-form-item>
        <a-form-item label="目标市场">
          <a-select v-model:value="editAcc.market" allow-clear>
            <a-select-option v-for="m in marketOptions" :key="m" :value="m">{{ m }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="时区">
          <a-select v-model:value="editAcc.timezone">
            <a-select-option value="UTC">UTC</a-select-option>
            <a-select-option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</a-select-option>
            <a-select-option value="Asia/Jakarta">Asia/Jakarta (UTC+7)</a-select-option>
            <a-select-option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (UTC+8)</a-select-option>
            <a-select-option value="America/New_York">America/New_York (UTC-5)</a-select-option>
            <a-select-option value="Europe/London">Europe/London (UTC+0)</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="币种">
          <a-select v-model:value="editAcc.currency">
            <a-select-option value="USD">USD</a-select-option>
            <a-select-option value="IDR">IDR</a-select-option>
            <a-select-option value="THB">THB</a-select-option>
            <a-select-option value="MYR">MYR</a-select-option>
            <a-select-option value="GBP">GBP</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../../utils/request'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'

const loading = ref(false)
const accounts = ref([])
const editModal = ref(false)
const editLoading = ref(false)
const editAcc = ref(null)
const marketOptions = ['US', 'UK', 'ID', 'TH', 'MY', 'VN', 'PH', 'SG', 'SA', 'AE', 'SEA']
const callbackUrl = location.origin + '/api/tiktok/callback'

function tokenStatus(acc) {
  if (!acc.token_expires_at) return '未知'
  const exp = dayjs(acc.token_expires_at)
  const hours = exp.diff(dayjs(), 'hour')
  if (hours <= 0) return '已过期'
  if (hours <= 24) return `${hours}小时后过期`
  return `${Math.floor(hours / 24)}天后过期`
}

async function loadAccounts() {
  loading.value = true
  try {
    const res = await request.get('/tiktok/accounts')
    accounts.value = res.data || []
  } catch (e) { console.error(e) }
  loading.value = false
}

async function doAuth() {
  try {
    const res = await request.get('/tiktok/auth-url')
    if (res.data?.url) window.location.href = res.data.url
    else message.error('获取授权链接失败，请检查 TIKTOK_APP_ID 配置')
  } catch (e) { message.error('获取授权链接失败') }
}

async function unbind(id) {
  try {
    const res = await request.delete('/tiktok/accounts/' + id)
    if (res.code === 0) { message.success('已解绑'); loadAccounts() }
    else message.error(res.msg)
  } catch (e) { message.error('解绑失败') }
}

async function doEdit() {
  editLoading.value = true
  try {
    const res = await request.put('/tiktok/accounts/' + editAcc.value.id, {
      advertiser_name: editAcc.value.advertiser_name,
      market: editAcc.value.market,
      timezone: editAcc.value.timezone,
      currency: editAcc.value.currency,
    })
    if (res.code === 0) { message.success('已更新'); editModal.value = false; loadAccounts() }
    else message.error(res.msg)
  } catch (e) { message.error('更新失败') }
  editLoading.value = false
}

onMounted(loadAccounts)
</script>

<style scoped>
.tt-page { padding: 12px; max-width: 1200px; margin: 0 auto; }
.tt-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-page__title { font-size: 18px; font-weight: 600; color: #1f2329; margin: 0; }

.tt-card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-card__title { font-size: 15px; font-weight: 600; color: #1f2329; }

.tt-acc-list { }
.tt-acc-item { display: flex; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid #f5f5f5; gap: 12px; }
.tt-acc-item:last-child { border-bottom: none; }
.tt-acc-item__avatar { width: 40px; height: 40px; border-radius: 10px; background: #f0f5ff; display: flex; align-items: center; justify-content: center; color: #1677ff; flex-shrink: 0; }
.tt-acc-item__info { flex: 1; min-width: 0; }
.tt-acc-item__name { font-size: 15px; font-weight: 600; color: #1f2329; }
.tt-acc-item__meta { display: flex; gap: 8px; margin-top: 4px; font-size: 12px; color: #8f959e; flex-wrap: wrap; align-items: center; }
.tt-acc-item__token { font-size: 11px; color: #8f959e; margin-top: 4px; }
.tt-acc-item__actions { display: flex; gap: 6px; flex-shrink: 0; }

.tt-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.tt-tag--market { background: #e6f7ff; color: #1890ff; }

.tt-guide { }
.tt-guide__step { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; }
.tt-guide__num { width: 22px; height: 22px; border-radius: 50%; background: #1677ff; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.tt-guide__text { font-size: 13px; color: #3d3d3d; line-height: 1.5; }
.tt-guide__text code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 11px; word-break: break-all; }
</style>
