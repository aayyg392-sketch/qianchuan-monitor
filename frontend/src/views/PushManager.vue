<template>
 <div class="push-manager-page">
  <div class="page-header">
   <h2 class="page-title">数据推送管理</h2>
  </div>

  <div class="config-cards">
   <!-- 每日数据报告 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">每日数据报告</div>
     <a-switch v-model:checked="configs.dailyReport.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">每天早上9点自动推送昨日全平台数据报告到钉钉群（含千川/快手/视频号汇总）</div>
    <div class="card-settings">
     <div class="setting-item setting-block">
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh, idx) in configs.dailyReport.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{ width: '100px', 'flex-shrink': '0' }" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{ flex: '1' }" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
        <a-button type="text" danger size="small" @click="removeWebhook('dailyReport', idx)" :disabled="configs.dailyReport.webhooks.length <= 1"><template #icon><span style="font-size:14px">&#x2715;</span></template></a-button>
       </div>
       <a-button type="dashed" size="small" block @click="addWebhook('dailyReport')" style="margin-top:6px">+ 添加群机器人</a-button>
      </div>
     </div>
     <div class="setting-item">
      <span class="setting-label">&#x1F464; 钉钉个人UserID</span>
      <a-input v-model:value="configs.dailyReport.customUserIds" size="small" placeholder="多个用逗号分隔" @blur="saveConfigs" :style="{ width: '100%', 'max-width': '360px' }" />
     </div>
    </div>
   </div>

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
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
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
         @blur="saveConfigs"
        />
        <a-input
         v-model:value="wh.url"
         size="small"
         placeholder="Webhook地址（access_token=...）"
         :style="{ flex: '1' }"
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
         @click="removeWebhook('liveReport', idx)"
         :disabled="configs.liveReport.webhooks.length <= 1"
        >
         <template #icon>
          <span style="font-size: 14px">&#x2715;</span>
         </template>
        </a-button>
       </div>
       <a-button
        type="dashed"
        size="small"
        block
        @click="addWebhook('liveReport')"
        style="margin-top: 6px"
       >+ 添加群机器人</a-button>
      </div>
     </div>

     <div class="setting-item">
      <span class="setting-label">&#x1F464; 钉钉个人UserID</span>
      <a-input
       v-model:value="configs.liveReport.customUserIds"
       size="small"
       placeholder="多个用逗号分隔"
       @blur="saveConfigs"
       :style="{ width: '100%', 'max-width': '360px' }"
      />
     </div>
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
       <a-checkbox v-model:checked="configs.scheduleNotify.sendToAnchor" @change="saveConfigs">&#x1F464; 推送给对应主播</a-checkbox>
       <a-checkbox v-model:checked="configs.scheduleNotify.sendToGroup" @change="saveConfigs">&#x1F916; 同步到群机器人</a-checkbox>
      </div>
     </div>
     <div v-if="configs.scheduleNotify.sendToGroup" class="setting-item setting-block">
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh, idx) in configs.scheduleNotify.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{ width: '100px', 'flex-shrink': '0' }" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{ flex: '1' }" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
        <a-button type="text" danger size="small" @click="removeWebhook('scheduleNotify', idx)" :disabled="configs.scheduleNotify.webhooks.length <= 1"><template #icon><span style="font-size:14px">&#x2715;</span></template></a-button>
       </div>
       <a-button type="dashed" size="small" block @click="addWebhook('scheduleNotify')" style="margin-top:6px">+ 添加群机器人</a-button>
      </div>
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
      <a-select v-model:value="configs.preLiveNotify.remindBefore" :style="{ width: '120px' }" size="small" @change="saveConfigs">
       <a-select-option :value="1">1小时</a-select-option>
       <a-select-option :value="2">2小时</a-select-option>
       <a-select-option :value="3">3小时</a-select-option>
      </a-select>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送对象</span>
      <div class="target-group">
       <a-checkbox v-model:checked="configs.preLiveNotify.sendToAnchor" @change="saveConfigs">&#x1F464; 推送给对应主播</a-checkbox>
       <a-checkbox v-model:checked="configs.preLiveNotify.sendToGroup" @change="saveConfigs">&#x1F916; 同步到群机器人</a-checkbox>
      </div>
     </div>
     <div v-if="configs.preLiveNotify.sendToGroup" class="setting-item setting-block">
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh, idx) in configs.preLiveNotify.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{ width: '100px', 'flex-shrink': '0' }" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{ flex: '1' }" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
        <a-button type="text" danger size="small" @click="removeWebhook('preLiveNotify', idx)" :disabled="configs.preLiveNotify.webhooks.length <= 1"><template #icon><span style="font-size:14px">&#x2715;</span></template></a-button>
       </div>
       <a-button type="dashed" size="small" block @click="addWebhook('preLiveNotify')" style="margin-top:6px">+ 添加群机器人</a-button>
      </div>
     </div>
    </div>
   </div>

   <!-- 巨量千川数据推送 -->
   <div class="config-card">
    <div class="card-header">
     <div class="card-title">巨量千川数据推送</div>
     <a-switch v-model:checked="configs.qianchuan.enabled" @change="saveConfigs" />
    </div>
    <div class="card-desc">按账户维度定时推送千川投放数据到钉钉群（图片形式，多账户合并）</div>
    <div class="card-settings">
     <div class="setting-row">
      <div class="setting-item">
       <span class="setting-label">推送频率</span>
       <a-select v-model:value="configs.qianchuan.pushInterval" :style="{ width: '120px' }" size="small" @change="saveConfigs">
        <a-select-option :value="2">每2小时</a-select-option>
        <a-select-option :value="3">每3小时</a-select-option>
        <a-select-option :value="4">每4小时</a-select-option>
        <a-select-option :value="0">每天1次</a-select-option>
       </a-select>
      </div>
     </div>
     <div class="setting-item">
      <span class="setting-label">推送时段</span>
      <a-checkbox-group v-model:value="configs.qianchuan.pushHours" @change="saveConfigs" class="hour-checks">
       <a-checkbox v-for="h in pushHourOptions" :key="h" :value="h">{{ String(h).padStart(2,'0') }}:00</a-checkbox>
      </a-checkbox-group>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">推送账户（可多选，合并为一条推送）</span>
      <a-checkbox-group v-model:value="configs.qianchuan.selectedAccounts" @change="saveConfigs" class="account-checks">
       <a-checkbox v-for="a in qcAccountList" :key="a.advertiser_id" :value="a.advertiser_id">
        {{ a.advertiser_name }}
       </a-checkbox>
      </a-checkbox-group>
      <a-button v-if="qcAccountList.length" type="link" size="small" @click="toggleAllQcAccounts" style="padding:0;margin-top:4px">
       {{ configs.qianchuan.selectedAccounts.length === qcAccountList.length ? '取消全选' : '全选' }}
      </a-button>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh, idx) in configs.qianchuan.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{ width: '100px', 'flex-shrink': '0' }" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{ flex: '1' }" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
        <a-button type="text" danger size="small" @click="removeWebhook('qianchuan', idx)" :disabled="configs.qianchuan.webhooks.length <= 1"><template #icon><span style="font-size:14px">&#x2715;</span></template></a-button>
       </div>
       <a-button type="dashed" size="small" block @click="addWebhook('qianchuan')" style="margin-top:6px">+ 添加群机器人</a-button>
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
    <div class="card-desc">按店铺维度定时推送视频号运营数据到钉钉群（图片形式）</div>
    <div class="card-settings">
     <div class="setting-row">
      <div class="setting-item">
       <span class="setting-label">推送频率</span>
       <a-select v-model:value="configs.wxChannels.pushInterval" :style="{ width: '120px' }" size="small" @change="saveConfigs">
        <a-select-option :value="2">每2小时</a-select-option>
        <a-select-option :value="3">每3小时</a-select-option>
        <a-select-option :value="4">每4小时</a-select-option>
        <a-select-option :value="0">每天1次</a-select-option>
       </a-select>
      </div>
      <div class="setting-item">
       <span class="setting-label">关联店铺</span>
       <div class="shop-tags">
        <a-tag v-for="s in shops.wx" :key="s" color="green">{{ s }}</a-tag>
        <a-tag v-if="!shops.wx.length" color="default">暂无店铺</a-tag>
       </div>
      </div>
     </div>
     <div class="setting-item">
      <span class="setting-label">推送时段</span>
      <a-checkbox-group v-model:value="configs.wxChannels.pushHours" @change="saveConfigs" class="hour-checks">
       <a-checkbox v-for="h in pushHourOptions" :key="h" :value="h">{{ String(h).padStart(2,'0') }}:00</a-checkbox>
      </a-checkbox-group>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh, idx) in configs.wxChannels.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{ width: '100px', 'flex-shrink': '0' }" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{ flex: '1' }" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
        <a-button type="text" danger size="small" @click="removeWebhook('wxChannels', idx)" :disabled="configs.wxChannels.webhooks.length <= 1"><template #icon><span style="font-size:14px">&#x2715;</span></template></a-button>
       </div>
       <a-button type="dashed" size="small" block @click="addWebhook('wxChannels')" style="margin-top:6px">+ 添加群机器人</a-button>
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
    <div class="card-desc">按店铺维度定时推送快手电商运营数据到钉钉群（图片形式）</div>
    <div class="card-settings">
     <div class="setting-row">
      <div class="setting-item">
       <span class="setting-label">推送频率</span>
       <a-select v-model:value="configs.ksData.pushInterval" :style="{ width: '120px' }" size="small" @change="saveConfigs">
        <a-select-option :value="2">每2小时</a-select-option>
        <a-select-option :value="3">每3小时</a-select-option>
        <a-select-option :value="4">每4小时</a-select-option>
        <a-select-option :value="0">每天1次</a-select-option>
       </a-select>
      </div>
      <div class="setting-item">
       <span class="setting-label">关联店铺</span>
       <div class="shop-tags">
        <a-checkbox-group v-model:value="configs.ksData.selectedShops" @change="saveConfigs">
         <a-checkbox v-for="s in shops.ks" :key="s.id" :value="s.id">{{ s.name }}</a-checkbox>
        </a-checkbox-group>
        <a-tag v-if="!shops.ks.length" color="default">暂无店铺</a-tag>
       </div>
      </div>
      <div class="setting-item">
       <a-checkbox v-model:checked="configs.ksData.showAdCost" @change="saveConfigs">显示磁力消耗（按店铺关联广告账户汇总）</a-checkbox>
      </div>
     </div>
     <div class="setting-item">
      <span class="setting-label">推送时段</span>
      <a-checkbox-group v-model:value="configs.ksData.pushHours" @change="saveConfigs" class="hour-checks">
       <a-checkbox v-for="h in pushHourOptions" :key="h" :value="h">{{ String(h).padStart(2,'0') }}:00</a-checkbox>
      </a-checkbox-group>
     </div>
     <div class="setting-item setting-block">
      <span class="setting-label">&#x1F916; 钉钉群机器人（Webhook）</span>
      <div class="webhook-list">
       <div class="webhook-row" v-for="(wh, idx) in configs.ksData.webhooks" :key="idx">
        <a-input v-model:value="wh.name" size="small" placeholder="群名称" :style="{ width: '100px', 'flex-shrink': '0' }" @blur="saveConfigs" />
        <a-input v-model:value="wh.url" size="small" placeholder="Webhook地址" :style="{ flex: '1' }" @blur="saveConfigs" />
        <a-switch v-model:checked="wh.enabled" size="small" @change="saveConfigs" />
        <a-button type="text" danger size="small" @click="removeWebhook('ksData', idx)" :disabled="configs.ksData.webhooks.length <= 1"><template #icon><span style="font-size:14px">&#x2715;</span></template></a-button>
       </div>
       <a-button type="dashed" size="small" block @click="addWebhook('ksData')" style="margin-top:6px">+ 添加群机器人</a-button>
      </div>
     </div>
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
     :style="{ width: '120px', 'margin-left': '8px' }"
     @change="loadHistory"
     allowClear
     placeholder="全部类型"
    >
     <a-select-option value="report">报表</a-select-option>
     <a-select-option value="review">复盘</a-select-option>
     <a-select-option value="schedule">排班</a-select-option>
     <a-select-option value="daily_report">每日报告</a-select-option>
     <a-select-option value="qianchuan">千川</a-select-option>
     <a-select-option value="wx_channels">视频号</a-select-option>
     <a-select-option value="ks_data">快手</a-select-option>
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
        &#x1F916; {{ item.receiver_name }}
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

const pushHourOptions = [8, 10, 12, 14, 16, 18, 20, 22]
const shops = reactive({ wx: [], ks: [] })
const qcAccountList = ref([])

const historyList = ref([])
const historyTotal = ref(0)
const historyDate = ref(dayjs())
const historyType = ref(undefined)
const saveStatus = ref('')

const defaultConfigs = {
 dailyReport: {
  enabled: true,
  webhooks: [
   { name: '', url: '', enabled: true }
  ],
  customUserIds: ''
 },
 liveReport: {
  enabled: true,
  delay: 5,
  webhooks: [
   { name: '直播运营群', url: DEFAULT_WEBHOOK_URL, enabled: true }
  ],
  customUserIds: ''
 },
 anchorReview: {
  enabled: true,
  delay: 10
 },
 scheduleNotify: {
  enabled: true,
  sendToAnchor: true,
  sendToGroup: false,
  webhooks: [
   { name: '', url: '', enabled: true }
  ]
 },
 preLiveNotify: {
  enabled: true,
  remindBefore: 2,
  sendToAnchor: true,
  sendToGroup: false,
  webhooks: [
   { name: '', url: '', enabled: true }
  ]
 },
 qianchuan: {
  enabled: false,
  pushInterval: 2,
  pushHours: [10, 12, 14, 16, 18, 20],
  selectedAccounts: [],
  webhooks: [
   { name: '', url: '', enabled: true }
  ]
 },
 wxChannels: {
  enabled: false,
  pushInterval: 2,
  pushHours: [10, 12, 14, 16, 18, 20],
  webhooks: [
   { name: '', url: '', enabled: true }
  ]
 },
 ksData: {
  enabled: false,
  pushInterval: 2,
  pushHours: [10, 12, 14, 16, 18, 20],
  selectedShops: [],
  showAdCost: true,
  webhooks: [
   { name: '', url: '', enabled: true }
  ]
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
   if (data.dailyReport) {
    Object.assign(configs.dailyReport, { ...defaultConfigs.dailyReport, ...data.dailyReport })
    if (data.dailyReport.webhooks) configs.dailyReport.webhooks = data.dailyReport.webhooks
   }
   if (data.liveReport) {
    Object.assign(configs.liveReport, data.liveReport)
    if (data.liveReport.webhooks) configs.liveReport.webhooks = data.liveReport.webhooks
   }
   if (data.anchorReview) Object.assign(configs.anchorReview, data.anchorReview)
   if (data.scheduleNotify) {
    Object.assign(configs.scheduleNotify, { ...defaultConfigs.scheduleNotify, ...data.scheduleNotify })
    if (data.scheduleNotify.webhooks) configs.scheduleNotify.webhooks = data.scheduleNotify.webhooks
    else if (data.scheduleNotify.webhookUrl) configs.scheduleNotify.webhooks = [{ name: '', url: data.scheduleNotify.webhookUrl, enabled: true }]
   }
   if (data.preLiveNotify) {
    Object.assign(configs.preLiveNotify, { ...defaultConfigs.preLiveNotify, ...data.preLiveNotify })
    if (data.preLiveNotify.webhooks) configs.preLiveNotify.webhooks = data.preLiveNotify.webhooks
    else if (data.preLiveNotify.webhookUrl) configs.preLiveNotify.webhooks = [{ name: '', url: data.preLiveNotify.webhookUrl, enabled: true }]
   }
   if (data.qianchuan) {
    Object.assign(configs.qianchuan, { ...defaultConfigs.qianchuan, ...data.qianchuan })
    if (data.qianchuan.webhooks) configs.qianchuan.webhooks = data.qianchuan.webhooks
   }
   if (data.wxChannels) {
    Object.assign(configs.wxChannels, { ...defaultConfigs.wxChannels, ...data.wxChannels })
    if (data.wxChannels.webhooks) configs.wxChannels.webhooks = data.wxChannels.webhooks
   }
   if (data.ksData) {
    Object.assign(configs.ksData, { ...defaultConfigs.ksData, ...data.ksData })
    if (data.ksData.webhooks) configs.ksData.webhooks = data.ksData.webhooks
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
   saveStatus.value = ''
  } catch {
   saveStatus.value = ''
   message.error('配置保存失败')
  }
 }, 1000)
}

function addWebhook(section) {
 configs[section].webhooks.push({ name: '', url: '', enabled: true })
 saveConfigs()
}

function removeWebhook(section, idx) {
 configs[section].webhooks.splice(idx, 1)
 saveConfigs()
}

async function loadHistory() {
 try {
  const params = { date: historyDate.value.format('YYYY-MM-DD') }
  if (historyType.value) params.type = historyType.value
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
 return { report: '报表', auto_report: '自动报表', review: '复盘', schedule: '排班', daily_report: '每日报告', qianchuan: '千川', wx_channels: '视频号', ks_data: '快手' }[type] || type
}

function typeColor(type) {
 return { report: 'blue', auto_report: 'cyan', review: 'purple', schedule: 'green', daily_report: 'geekblue', qianchuan: 'volcano', wx_channels: 'orange', ks_data: 'red' }[type] || 'default'
}

function formatTime(time) {
 return time ? dayjs(time).format('HH:mm:ss') : '-'
}

let initialized = false

async function loadShops() {
 try {
  const res = await request.get('/anchor/push-shops')
  if (res?.data) {
   shops.wx = res.data.wx || []
   shops.ks = res.data.ks || []
  }
 } catch { /* ignore */ }
}

async function loadQcAccounts() {
 try {
  const res = await request.get('/rbac/ad-accounts')
  if (res?.code === 0) {
   qcAccountList.value = res.data?.qianchuan || []
  }
 } catch { /* ignore */ }
}

function toggleAllQcAccounts() {
 if (configs.qianchuan.selectedAccounts.length === qcAccountList.value.length) {
  configs.qianchuan.selectedAccounts = []
 } else {
  configs.qianchuan.selectedAccounts = qcAccountList.value.map(a => a.advertiser_id)
 }
 saveConfigs()
}

onMounted(async () => {
 await Promise.all([loadConfigs(), loadShops(), loadQcAccounts()])
 initialized = true
 loadHistory()
})

watch(
 () => configs,
 () => {
  if (initialized) saveConfigs()
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

.setting-row {
 display: flex;
 gap: 32px;
 align-items: center;
 flex-wrap: wrap;
}

.shop-tags {
 display: flex;
 gap: 4px;
 align-items: center;
 flex-wrap: wrap;
}

.hour-checks {
 display: flex;
 gap: 4px;
 flex-wrap: wrap;
}

.account-checks {
 display: flex;
 flex-direction: column;
 gap: 4px;
 max-height: 200px;
 overflow-y: auto;
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
