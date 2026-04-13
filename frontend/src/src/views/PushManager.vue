<template>
 <div class="push-manager-page">
  <div class="page-header">
   <h2 class="page-title">数据推送管理</h2>
  </div>

  <div class="config-cards">
   <!-- 直播数据报表 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">直播数据报表</div>
     <a-switch v-model:checked="configs.liveReport.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">主播下播后自动推送当日投放数据表格图片</div>
    <div class="card-settings">
     <div class="setting-item">
      <span class="setting-label">下播后推送延迟</span>
      <a-select
       v-model:value="configs.liveReport.delay"
       :style="{ width: '120px' }"
       size="small"
       @change="saveConfigs"
      >
       <a-select-option :value="5">5分钟</a-select-option>
       <a-select-option :value="10">10分钟</a-select-option>
       <a-select-option :value="15">15分钟</a-select-option>
       <a-select-option :value="30">30分钟</a-select-option>
      </a-select>
     </div>

     <div class="setting-item setting-block">
      <span class="setting-label">🤖 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div
        class="webhook-row"
        v-for="(wh, idx) in configs.liveReport.webhooks"
        :key="idx"
       >
        <a-input
         v-model:value="wh.name"
         size="small"
         placeholder="群名称"
         :style="{ width: '100px', 'flex-shrink': '0' }"
         @change="saveConfigs"
         @blur="saveConfigs"
        />
        <a-input
         v-model:value="wh.url"
         size="small"
         placeholder="Webhook地址（access_token=...）"
         :style="{ flex: '1' }"
         @change="saveConfigs"
         @blur="saveConfigs"
        />
        <a-switch
         v-model:checked="wh.enabled"
         size="small"
         @change="saveConfigs"
        />
        <a-button
         type="text"
         danger
         size="small"
         @click="removeWebhook(idx)"
         :disabled="configs.liveReport.webhooks.length <= 1"
        >
         <template #icon>
          <span style="font-size: 14px">✕</span>
         </template>
        </a-button>
       </div>
       <a-button
        type="dashed"
        size="small"
        block
        @click="addWebhook"
        style="margin-top: 6px"
       >+ 添加群机器人</a-button>
      </div>
     </div>

     <div class="setting-item">
      <span class="setting-label">👤 钉钉个人UserID</span>
      <a-input
       v-model:value="configs.liveReport.customUserIds"
       size="small"
       placeholder="多个用逗号分隔"
       @change="saveConfigs"
       @blur="saveConfigs"
       :style="{ width: '100%', 'max-width': '360px' }"
      />
     </div>
    </div>
    <div class="card-footer">
     <span v-if="saveStatus" class="save-status">{{ saveStatus }}</span>
    </div>
   </div>

   <!-- 主播复盘报告 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">主播复盘报告</div>
     <a-switch v-model:checked="configs.anchorReview.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">主播下播后自动推送AI复盘分析到个人钉钉</div>
    <div class="card-settings">
     <div class="setting-item">
      <span class="setting-label">下播后推送延迟</span>
      <a-select
       v-model:value="configs.anchorReview.delay"
       :style="{ width: '120px' }"
       size="small"
       @change="saveConfigs"
      >
       <a-select-option :value="10">10分钟</a-select-option>
       <a-select-option :value="15">15分钟</a-select-option>
       <a-select-option :value="30">30分钟</a-select-option>
      </a-select>
     </div>
    </div>
    <div class="card-footer">
     <span class="push-stat">今日已推送 {{ todayReviewCount }} 条</span>
    </div>
   </div>

   <!-- 排班通知 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">排班通知</div>
     <a-switch v-model:checked="configs.scheduleNotify.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">排班确认后自动发送排班信息给主播</div>
    <div class="card-settings">
     <div class="setting-item setting-block">
      <span class="setting-label">推送对象</span>
      <div class="target-group">
       <a-checkbox
        v-model:checked="configs.scheduleNotify.sendToAnchor"
        @change="saveConfigs"
       >👤 推送给对应主播</a-checkbox>
       <a-checkbox
        v-model:checked="configs.scheduleNotify.sendToGroup"
        @change="saveConfigs"
       >🤖 同步到群机器人</a-checkbox>
       <a-input
        v-if="configs.scheduleNotify.sendToGroup"
        v-model:value="configs.scheduleNotify.webhookUrl"
        size="small"
        placeholder="群Webhook地址（留空则使用报表群配置）"
        @change="saveConfigs"
        @blur="saveConfigs"
        style="margin-top: 4px"
       />
      </div>
     </div>
    </div>
    <div v-if="saveStatus" class="card-footer">
     <span class="save-status">{{ saveStatus }}</span>
    </div>
   </div>

   <!-- 上播通知 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">上播通知</div>
     <a-switch v-model:checked="configs.preLiveNotify.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">上播前自动提醒主播准备开播</div>
    <div class="card-settings">
     <div class="setting-item">
      <span class="setting-label">提前提醒时间</span>
      <a-select
       v-model:value="configs.preLiveNotify.remindBefore"
       :style="{ width: '120px' }"
       size="small"
       @change="saveConfigs"
      >
       <a-select-option :value="1">1小时</a-select-option>
       <a-select-option :value="2">2小时</a-select-option>
       <a-select-option :value="3">3小时</a-select-option>
      </a-select>
     </div>

     <div class="setting-item setting-block">
      <span class="setting-label">推送对象</span>
      <div class="target-group">
       <a-checkbox
        v-model:checked="configs.preLiveNotify.sendToAnchor"
        @change="saveConfigs"
       >👤 推送给对应主播</a-checkbox>
       <a-checkbox
        v-model:checked="configs.preLiveNotify.sendToGroup"
        @change="saveConfigs"
       >🤖 同步到群机器人</a-checkbox>
       <a-input
        v-if="configs.preLiveNotify.sendToGroup"
        v-model:value="configs.preLiveNotify.webhookUrl"
        size="small"
        placeholder="群Webhook地址（留空则使用报表群配置）"
        @change="saveConfigs"
        @blur="saveConfigs"
        style="margin-top: 4px"
       />
      </div>
     </div>
    </div>
    <div v-if="saveStatus" class="card-footer">
     <span class="save-status">{{ saveStatus }}</span>
    </div>
   </div>
  </div>

  <!-- 推送记录 -->
  <div class="section-card">
   <div class="section-header">推送记录</div>
   <div class="history-filter">
    <a-date-picker
     v-model:value="historyDate"
     size="small"
     :style="{ width: '140px' }"
     :allowClear="false"
     @change="loadHistory"
    />
    <a-select
     v-model:value="historyType"
     size="small"
     :style="{ width: '100px', 'margin-left': '8px' }"
     @change="loadHistory"
     allowClear
     placeholder="全部类型"
    >
     <a-select-option value="report">报表</a-select-option>
     <a-select-option value="review">复盘</a-select-option>
     <a-select-option value="schedule">排班</a-select-option>
    </a-select>
   </div>

   <div v-if="historyList.length" class="history-list">
    <div
     class="history-item"
     v-for="(item, idx) in historyList"
     :key="idx"
    >
     <div class="history-left">
      <div class="history-time">{{ formatTime(item.created_at || item.time) }}</div>
      <a-tag :color="typeColor(item.push_type || item.type)" size="small">
       {{ typeLabel(item.push_type || item.type) }}
      </a-tag>
     </div>
     <div class="history-mid">
      <span class="history-receiver">
       <template v-if="(item.receiver_id || '').startsWith('webhook_')">
        🤖 {{ item.receiver_name }}
       </template>
       <template v-else>
        {{ item.receiver_name || item.receiver_id }}
       </template>
      </span>
     </div>
     <div class="history-right">
      <a-badge
       :status="item.status === 'success' ? 'success' : 'error'"
       :text="item.status === 'success' ? '成功' : '失败'"
      />
     </div>
    </div>
   </div>
   <a-empty v-else description="暂无推送记录" :image="null" />

   <div v-if="historyTotal > 0" class="history-total">
    共 {{ historyTotal }} 条记录
   </div>
  </div>
 </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import dayjs from 'dayjs'
import { message } from 'ant-design-vue'
import request from '@/utils/request'

const DEFAULT_WEBHOOK_URL = 'https://oapi.dingtalk.com/robot/send?access_token=a5a3943bb6dbfee17663b47594453db8e7037aca6b65808330548e22533b6013'

const historyList = ref([])
const historyTotal = ref(0)
const historyDate = ref(dayjs())
const historyType = ref(undefined)
const saveStatus = ref('')

const defaultConfigs = {
 liveReport: {
  enabled: true,
  delay: 5,
  webhooks: [
   { name: '直播运营群', url: DEFAULT_WEBHOOK_URL, enabled: true }
  ],
  customUserIds: '062134001437905837'
 },
 anchorReview: {
  enabled: true,
  delay: 10
 },
 scheduleNotify: {
  enabled: true,
  sendToAnchor: true,
  sendToGroup: false,
  webhookUrl: ''
 },
 preLiveNotify: {
  enabled: true,
  remindBefore: 2,
  sendToAnchor: true,
  sendToGroup: false,
  webhookUrl: ''
 }
}

const configs = reactive(JSON.parse(JSON.stringify(defaultConfigs)))

const todayReviewCount = computed(() => {
 const today = dayjs().format('YYYY-MM-DD')
 return historyList.value.filter(
  (item) =>
   (item.push_type || item.type) === 'review' &&
   (item.created_at || item.time || '').startsWith(today) &&
   item.status === 'success'
 ).length
})

async function loadConfigs() {
 try {
  const res = await request.get('/anchor/push-configs')
  if (res?.data) {
   const data = res.data
   if (data.liveReport) {
    Object.assign(configs.liveReport, data.liveReport)
    if (data.liveReport.webhooks) {
     configs.liveReport.webhooks = data.liveReport.webhooks
    }
   }
   if (data.anchorReview) {
    Object.assign(configs.anchorReview, data.anchorReview)
   }
   if (data.scheduleNotify) {
    Object.assign(configs.scheduleNotify, { ...defaultConfigs.scheduleNotify, ...data.scheduleNotify })
   }
   if (data.preLiveNotify) {
    Object.assign(configs.preLiveNotify, { ...defaultConfigs.preLiveNotify, ...data.preLiveNotify })
   }
  }
 } catch {
  // ignore
 }
}

let saveTimer = null

function saveConfigs() {
 clearTimeout(saveTimer)
 saveStatus.value = '保存中...'
 saveTimer = setTimeout(async () => {
  try {
   const data = JSON.parse(JSON.stringify(configs))
   await request.post('/anchor/push-configs', data)
   saveStatus.value = '✓ 已保存'
   setTimeout(() => {
    saveStatus.value = ''
   }, 2000)
  } catch {
   saveStatus.value = '保存失败'
   message.error('配置保存失败')
  }
 }, 1000)
}

function addWebhook() {
 configs.liveReport.webhooks.push({ name: '', url: '', enabled: true })
 saveConfigs()
}

function removeWebhook(idx) {
 configs.liveReport.webhooks.splice(idx, 1)
 saveConfigs()
}

async function loadHistory() {
 try {
  const params = { date: historyDate.value.format('YYYY-MM-DD') }
  if (historyType.value) {
   params.type = historyType.value
  }
  const res = await request.get('/anchor/push-logs', { params })
  if (res?.data) {
   historyList.value = res.data?.logs || []
   historyTotal.value = res.data?.total || 0
  }
 } catch {
  historyList.value = []
  historyTotal.value = 0
 }
}

function typeLabel(type) {
 return { report: '报表', auto_report: '自动报表', review: '复盘', schedule: '排班' }[type] || type
}

function typeColor(type) {
 return { report: 'blue', auto_report: 'cyan', review: 'purple', schedule: 'green' }[type] || 'default'
}

function formatTime(time) {
 return time ? dayjs(time).format('HH:mm:ss') : '-'
}

let initialized = false

onMounted(async () => {
 await loadConfigs()
 initialized = true
 loadHistory()
})

watch(
 () => configs,
 () => {
  if (initialized) {
   saveConfigs()
  }
 },
 { deep: true }
)
</script>

<style scoped>
.push-manager-page {
 max-width: 100%;
 margin: 0 auto;
 padding: 24px 20px;
}

.page-header {
 margin-bottom: 24px;
}

.page-title {
 font-size: 20px;
 font-weight: 600;
 margin: 0;
}

.config-cards {
 display: flex;
 flex-direction: column;
 gap: 16px;
 margin-bottom: 24px;
}

.config-card {
 background: #fff;
 border-radius: 8px;
 padding: 20px;
 border: 1px solid #f0f0f0;
}

.card-header {
 display: flex;
 align-items: center;
 justify-content: space-between;
 margin-bottom: 8px;
}

.card-title {
 font-size: 16px;
 font-weight: 600;
}

.card-desc {
 color: #888;
 font-size: 13px;
 margin-bottom: 16px;
}

.card-settings {
 display: flex;
 flex-direction: column;
 gap: 12px;
}

.setting-item {
 display: flex;
 align-items: center;
 gap: 12px;
}

.setting-item.setting-block {
 flex-direction: column;
 align-items: flex-start;
}

.setting-label {
 font-size: 13px;
 color: #555;
 white-space: nowrap;
}

.webhook-list {
 width: 100%;
}

.webhook-row {
 display: flex;
 align-items: center;
 gap: 8px;
 margin-bottom: 6px;
}

.target-group {
 display: flex;
 flex-direction: column;
 gap: 6px;
}

.card-footer {
 margin-top: 12px;
 min-height: 22px;
}

.save-status {
 font-size: 12px;
 color: #52c41a;
}

.push-stat {
 font-size: 12px;
 color: #888;
}

.section-card {
 background: #fff;
 border-radius: 8px;
 padding: 20px;
 border: 1px solid #f0f0f0;
}

.section-header {
 font-size: 16px;
 font-weight: 600;
 margin-bottom: 16px;
}

.history-filter {
 display: flex;
 align-items: center;
 margin-bottom: 16px;
}

.history-list {
 display: flex;
 flex-direction: column;
 gap: 8px;
}

.history-item {
 display: flex;
 align-items: center;
 padding: 10px 12px;
 background: #fafafa;
 border-radius: 6px;
}

.history-left {
 display: flex;
 align-items: center;
 gap: 8px;
 min-width: 160px;
}

.history-time {
 font-size: 13px;
 color: #555;
 font-family: monospace;
}

.history-mid {
 flex: 1;
}

.history-receiver {
 font-size: 13px;
}

.history-right {
 min-width: 60px;
 text-align: right;
}

.history-total {
 margin-top: 12px;
 text-align: center;
 font-size: 12px;
 color: #999;
}
</style>
