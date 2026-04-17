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

   <!-- 巨量千川数据推送 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">巨量千川数据推送</div>
     <a-switch v-model:checked="configs.qianchuan.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">定时推送千川广告投放数据到钉钉群</div>
    <div class="card-settings" v-if="configs.qianchuan.enabled">
     <div class="setting-item">
      <span class="setting-label">推送间隔</span>
      <a-select v-model:value="configs.qianchuan.pushInterval" :style="{width:'120px'}" size="small" @change="saveConfigs">
       <a-select-option :value="1">1小时</a-select-option>
       <a-select-option :value="2">2小时</a-select-option>
       <a-select-option :value="4">4小时</a-select-option>
      </a-select>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送时段</span>
      <div class="hour-tags">
       <a-checkbox-group v-model:value="configs.qianchuan.pushHours" @change="saveConfigs">
        <a-checkbox v-for="h in [8,10,12,14,16,18,20,22]" :key="h" :value="h">{{h}}:00</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">🤖 钉钉群机器人</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh,idx) in configs.qianchuan.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{width:'100px','flex-shrink':'0'}" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{flex:'1'}" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
       </div>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送账户</span>
      <div class="account-tags">
       <a-checkbox-group v-model:value="configs.qianchuan.selectedAccounts" @change="saveConfigs">
        <a-checkbox v-for="a in qcAccountList" :key="a.advertiser_id" :value="a.advertiser_id">{{a.advertiser_name||a.advertiser_id}}</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
    </div>
   </div>

   <!-- 快手数据推送 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">快手数据推送</div>
     <a-switch v-model:checked="configs.ksData.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">定时推送快手电商数据到钉钉群</div>
    <div class="card-settings" v-if="configs.ksData.enabled">
     <div class="setting-item">
      <span class="setting-label">推送间隔</span>
      <a-select v-model:value="configs.ksData.pushInterval" :style="{width:'120px'}" size="small" @change="saveConfigs">
       <a-select-option :value="1">1小时</a-select-option>
       <a-select-option :value="2">2小时</a-select-option>
       <a-select-option :value="4">4小时</a-select-option>
      </a-select>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送时段</span>
      <div class="hour-tags">
       <a-checkbox-group v-model:value="configs.ksData.pushHours" @change="saveConfigs">
        <a-checkbox v-for="h in [8,10,12,14,16,18,20,22]" :key="h" :value="h">{{h}}:00</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送内容</span>
      <div class="target-group">
       <a-checkbox v-model:checked="configs.ksData.pushLiveData" @change="saveConfigs">直播数据</a-checkbox>
       <a-checkbox v-model:checked="configs.ksData.pushOrderData" @change="saveConfigs">订单数据</a-checkbox>
       <a-checkbox v-model:checked="configs.ksData.pushAdData" @change="saveConfigs">广告数据</a-checkbox>
       <a-checkbox v-model:checked="configs.ksData.showAdCost" @change="saveConfigs">显示广告消耗</a-checkbox>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">🤖 钉钉群机器人</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh,idx) in configs.ksData.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{width:'100px','flex-shrink':'0'}" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{flex:'1'}" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
       </div>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">快手店铺</span>
      <div class="account-tags">
       <a-checkbox-group v-model:value="configs.ksData.selectedShops" @change="saveConfigs">
        <a-checkbox v-for="s in ksShopList" :key="s.shop_id" :value="s.shop_id">{{s.shop_name}}</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">磁力帐号</span>
      <div class="account-tags">
       <a-checkbox-group v-model:value="configs.ksData.selectedAdAccounts" @change="saveConfigs">
        <a-checkbox v-for="a in ksAdAccountList" :key="a.advertiser_id" :value="a.advertiser_id">{{a.advertiser_name||a.advertiser_id}}</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
    </div>
   </div>

   <!-- 视频号数据推送 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">视频号数据推送</div>
     <a-switch v-model:checked="configs.wxChannels.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">定时推送视频号运营数据到钉钉群</div>
    <div class="card-settings" v-if="configs.wxChannels.enabled">
     <div class="setting-item">
      <span class="setting-label">推送间隔</span>
      <a-select v-model:value="configs.wxChannels.pushInterval" :style="{width:'120px'}" size="small" @change="saveConfigs">
       <a-select-option :value="1">1小时</a-select-option>
       <a-select-option :value="2">2小时</a-select-option>
       <a-select-option :value="4">4小时</a-select-option>
      </a-select>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送时段</span>
      <div class="hour-tags">
       <a-checkbox-group v-model:value="configs.wxChannels.pushHours" @change="saveConfigs">
        <a-checkbox v-for="h in [8,10,12,14,16,18,20,22]" :key="h" :value="h">{{h}}:00</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送内容</span>
      <div class="target-group">
       <a-checkbox v-model:checked="configs.wxChannels.pushLiveData" @change="saveConfigs">直播数据</a-checkbox>
       <a-checkbox v-model:checked="configs.wxChannels.pushVideoData" @change="saveConfigs">视频数据</a-checkbox>
       <a-checkbox v-model:checked="configs.wxChannels.pushFinderData" @change="saveConfigs">达人数据</a-checkbox>
       <a-checkbox v-model:checked="configs.wxChannels.pushAdqData" @change="saveConfigs">ADQ广告数据</a-checkbox>
      </div>
     </div>
     <div class="setting-item setting-block" v-if="configs.wxChannels.pushAdqData">
      <span class="setting-label">ADQ主体</span>
      <div class="account-tags">
       <a-checkbox-group v-model:value="configs.wxChannels.selectedAdqOrgs" @change="saveConfigs">
        <a-checkbox v-for="org in adqOrgList" :key="org" :value="org">{{org}}</a-checkbox>
       </a-checkbox-group>
      </div>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">🤖 钉钉群机器人</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh,idx) in configs.wxChannels.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{width:'100px','flex-shrink':'0'}" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{flex:'1'}" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
       </div>
      </div>
     </div>
    </div>
   </div>

   <!-- 每日报表 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">每日报表</div>
     <a-switch v-model:checked="configs.dailyReport.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">每日自动推送汇总数据报表</div>
    <div class="card-settings" v-if="configs.dailyReport.enabled">
     <div class="setting-item setting-block">
      <span class="setting-label">🤖 钉钉群机器人</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh,idx) in configs.dailyReport.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{width:'100px','flex-shrink':'0'}" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{flex:'1'}" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
       </div>
      </div>
     </div>
     <div class="setting-item">
      <span class="setting-label">👤 钉钉个人UserID</span>
      <a-input v-model:value="configs.dailyReport.customUserIds" size="small" placeholder="多个用逗号分隔" @blur="saveConfigs" :style="{width:'100%','max-width':'360px'}" />
     </div>
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
   <div v-else style="text-align:center;padding:40px 0;color:#999;font-size:13px">暂无推送记录</div>

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

const qcAccountList = ref([])
const ksShopList = ref([])
const ksAdAccountList = ref([])
const adqAccountList = ref([])

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
 qianchuan: {
  enabled: false,
  pushInterval: 2,
  pushHours: [8, 10, 12, 14, 16, 18, 20, 22],
  webhooks: [{ name: '', url: '', enabled: true }],
  selectedAccounts: []
 },
 ksData: {
  enabled: false,
  pushInterval: 2,
  pushHours: [8, 10, 12, 14, 16, 18, 20, 22],
  pushLiveData: true,
  pushOrderData: true,
  pushAdData: false,
  showAdCost: false,
  webhooks: [{ name: '', url: '', enabled: true }],
  selectedShops: [],
  selectedAdAccounts: []
 },
 wxChannels: {
  enabled: false,
  pushInterval: 2,
  pushHours: [8, 10, 12, 14, 16, 18, 20, 22],
  pushLiveData: true,
  pushVideoData: true,
  pushFinderData: false,
  pushAdqData: false,
  selectedAdqOrgs: [],
  webhooks: [{ name: '', url: '', enabled: true }]
 },
 dailyReport: {
  enabled: false,
  webhooks: [{ name: '', url: '', enabled: true }],
  customUserIds: ''
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

const adqOrgList = computed(() => {
 const names = new Set()
 adqAccountList.value.forEach(a => { if (a.account_name) names.add(a.account_name) })
 return [...names]
})

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
   const sections = ['liveReport', 'anchorReview', 'scheduleNotify', 'qianchuan', 'ksData', 'wxChannels', 'dailyReport', 'preLiveNotify']
   for (const key of sections) {
    if (data[key]) {
     if (data[key].webhooks) {
      configs[key].webhooks = data[key].webhooks
     }
     Object.assign(configs[key], { ...defaultConfigs[key], ...data[key] })
     if (data[key].webhooks) {
      configs[key].webhooks = data[key].webhooks
     }
    }
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

async function loadAccounts() {
 try {
  const res = await request.get('/rbac/ad-accounts')
  if (res?.data?.qianchuan) {
   qcAccountList.value = res.data.qianchuan
  } else if (Array.isArray(res?.data)) {
   qcAccountList.value = res.data
  }
 } catch {
  // ignore
 }
 try {
  const res = await request.get('/ks/accounts')
  if (Array.isArray(res?.data)) {
   ksShopList.value = res.data
  }
 } catch {
  // ignore
 }
 try {
  const res = await request.get('/ks-ad/accounts')
  if (Array.isArray(res?.data)) {
   ksAdAccountList.value = res.data
  }
 } catch {
  // ignore
 }
 try {
  const res = await request.get('/adq/accounts')
  if (res?.data && Array.isArray(res.data)) {
   adqAccountList.value = res.data.filter(a => a.status === 1)
  }
 } catch {
  // ignore
 }
}

onMounted(async () => {
 await Promise.all([loadConfigs(), loadAccounts()])
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

.hour-tags,
.account-tags {
 display: flex;
 flex-wrap: wrap;
 gap: 4px;
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
