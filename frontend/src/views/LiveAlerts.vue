<template>
  <div class="live-alerts">
    <div class="page-header">
      <h2 class="page-title">异常预警</h2>
      <div class="page-header__actions">
        <a-button @click="showConfig = true">预警配置</a-button>
        <a-button @click="loadAlerts">刷新</a-button>
      </div>
    </div>

    <!-- Alert Summary -->
    <div class="alert-summary">
      <div class="summary-card summary-card--danger">
        <div class="summary-card__value">{{ alertSummary.critical }}</div>
        <div class="summary-card__label">严重预警</div>
      </div>
      <div class="summary-card summary-card--warning">
        <div class="summary-card__value">{{ alertSummary.warning }}</div>
        <div class="summary-card__label">警告</div>
      </div>
      <div class="summary-card summary-card--info">
        <div class="summary-card__value">{{ alertSummary.info }}</div>
        <div class="summary-card__label">提醒</div>
      </div>
      <div class="summary-card summary-card--success">
        <div class="summary-card__value">{{ alertSummary.resolved }}</div>
        <div class="summary-card__label">已恢复</div>
      </div>
    </div>

    <!-- Active Alerts -->
    <a-card title="实时预警" :bordered="false" style="margin-top: 12px">
      <div class="alert-list">
        <div v-for="alert in activeAlerts" :key="alert.id" class="alert-item" :class="'alert-item--' + alert.level">
          <div class="alert-item__icon">
            <span v-if="alert.level === 'critical'">🔴</span>
            <span v-else-if="alert.level === 'warning'">🟡</span>
            <span v-else>🔵</span>
          </div>
          <div class="alert-item__content">
            <div class="alert-item__header">
              <span class="alert-item__title">{{ alert.title }}</span>
              <a-tag :color="levelColor(alert.level)" size="small">{{ levelText(alert.level) }}</a-tag>
            </div>
            <div class="alert-item__desc">{{ alert.description }}</div>
            <div class="alert-item__meta">
              <span>{{ alert.room_name }}</span>
              <span class="meta-dot">·</span>
              <span>{{ alert.time }}</span>
              <span class="meta-dot">·</span>
              <span>{{ alert.cause }}</span>
            </div>
          </div>
          <div class="alert-item__actions">
            <a-button type="link" size="small" @click="viewAlert(alert)">查看</a-button>
            <a-button type="link" size="small" @click="resolveAlert(alert.id)">处理</a-button>
          </div>
        </div>
        <a-empty v-if="!activeAlerts.length" description="当前无异常预警" />
      </div>
    </a-card>

    <!-- Alert Trend -->
    <a-card title="预警趋势" :bordered="false" style="margin-top: 12px">
      <div ref="trendChartRef" class="chart-box"></div>
    </a-card>

    <!-- Alert History -->
    <a-card title="历史预警" :bordered="false" style="margin-top: 12px">
      <a-table :dataSource="alertHistory" :columns="historyColumns" :pagination="{ pageSize: 10 }" size="small" :scroll="{ x: 800 }" />
    </a-card>

    <!-- Config Drawer -->
    <a-drawer v-model:open="showConfig" title="预警配置" :width="isMobile ? '100%' : 520" placement="right">
      <div class="config-section" v-for="cfg in alertConfigs" :key="cfg.key">
        <div class="config-section__header">
          <span class="config-section__title">{{ cfg.title }}</span>
          <a-switch v-model:checked="cfg.enabled" size="small" />
        </div>
        <div class="config-section__body" v-if="cfg.enabled">
          <div class="threshold-row" v-for="threshold in cfg.thresholds" :key="threshold.label">
            <span class="threshold-label">{{ threshold.label }}</span>
            <a-input-number v-model:value="threshold.value" :min="threshold.min" :max="threshold.max" size="small" style="width: 100px" />
            <span class="threshold-unit">{{ threshold.unit }}</span>
          </div>
        </div>
      </div>
      <a-divider />
      <div class="config-section">
        <div class="config-section__title">预警通知方式</div>
        <div class="notify-options">
          <a-checkbox v-model:checked="notifyConfig.popup">后台弹窗</a-checkbox>
          <a-checkbox v-model:checked="notifyConfig.sound">语音提醒</a-checkbox>
          <a-checkbox v-model:checked="notifyConfig.message">站内消息</a-checkbox>
          <a-checkbox v-model:checked="notifyConfig.dingtalk">钉钉通知</a-checkbox>
        </div>
      </div>
      <div class="drawer-footer">
        <a-button @click="showConfig = false" style="margin-right: 8px">取消</a-button>
        <a-button type="primary" @click="saveConfig">保存配置</a-button>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import * as echarts from 'echarts'

const isMobile = ref(window.innerWidth < 768)
const showConfig = ref(false)

const alertSummary = ref({ critical: 3, warning: 8, info: 15, resolved: 42 })

const activeAlerts = ref([
  { id: 1, level: 'critical', title: '在线人数断崖式下降', description: '好物推荐官直播间在线人数从5230骤降至1200，降幅达77%', room_name: '好物推荐官', time: '14:32', cause: '可能原因：千川投流到期/被限流' },
  { id: 2, level: 'critical', title: 'ROI跌破预警线', description: '千川投放ROI从2.3跌至0.8，低于预设阈值1.5', room_name: '美妆达人', time: '14:28', cause: '可能原因：转化率下降/竞价提升' },
  { id: 3, level: 'warning', title: '转化率持续走低', description: '商品点击转化率从3.8%降至1.2%，环比下降68%', room_name: '好物推荐官', time: '14:15', cause: '可能原因：话术效果下降/商品卖点疲劳' },
  { id: 4, level: 'warning', title: '平均停留时长下降', description: '平均停留时长从2m30s降至45s，环比下降70%', room_name: '食品旗舰店', time: '14:10', cause: '可能原因：直播内容吸引力不足' },
  { id: 5, level: 'info', title: '进房流量波动', description: '自然推荐流量较上一时段减少25%', room_name: '好物推荐官', time: '14:05', cause: '可能原因：推荐池竞争加剧' },
])

const alertHistory = ref([
  { key: 1, time: '03-27 14:32', room: '好物推荐官', type: '在线骤降', level: '严重', status: '处理中', handler: '系统' },
  { key: 2, time: '03-27 14:28', room: '美妆达人', type: 'ROI异常', level: '严重', status: '处理中', handler: '系统' },
  { key: 3, time: '03-27 13:45', room: '好物推荐官', type: '转化率下降', level: '警告', status: '已恢复', handler: '张运营' },
  { key: 4, time: '03-27 12:30', room: '食品旗舰店', type: '停留下降', level: '警告', status: '已恢复', handler: '系统' },
  { key: 5, time: '03-27 11:15', room: '好物推荐官', type: '流量波动', level: '提醒', status: '已忽略', handler: '李主管' },
])
const historyColumns = [
  { title: '时间', dataIndex: 'time', key: 'time', width: 130 },
  { title: '直播间', dataIndex: 'room', key: 'room' },
  { title: '预警类型', dataIndex: 'type', key: 'type' },
  { title: '级别', dataIndex: 'level', key: 'level' },
  { title: '状态', dataIndex: 'status', key: 'status' },
  { title: '处理人', dataIndex: 'handler', key: 'handler' },
]

const alertConfigs = ref([
  { key: 'online', title: '在线人数异常', enabled: true, thresholds: [
    { label: '突增阈值', value: 50, min: 10, max: 200, unit: '%' },
    { label: '突降阈值', value: 30, min: 10, max: 200, unit: '%' },
  ]},
  { key: 'traffic', title: '进房流量异常', enabled: true, thresholds: [
    { label: '骤减阈值', value: 40, min: 10, max: 100, unit: '%' },
  ]},
  { key: 'cvr', title: '转化率异常', enabled: true, thresholds: [
    { label: '暴跌阈值', value: 50, min: 10, max: 100, unit: '%' },
  ]},
  { key: 'roi', title: 'ROI异常', enabled: true, thresholds: [
    { label: '最低ROI', value: 1.5, min: 0.5, max: 10, unit: '' },
  ]},
  { key: 'stay', title: '停留时长异常', enabled: true, thresholds: [
    { label: '下滑阈值', value: 40, min: 10, max: 100, unit: '%' },
  ]},
])

const notifyConfig = reactive({ popup: true, sound: true, message: true, dingtalk: false })

const levelColor = (l) => ({ critical: 'red', warning: 'orange', info: 'blue' }[l] || 'default')
const levelText = (l) => ({ critical: '严重', warning: '警告', info: '提醒' }[l] || l)
const viewAlert = (a) => { message.info(`查看预警详情: ${a.title}`) }
const resolveAlert = (id) => { activeAlerts.value = activeAlerts.value.filter(a => a.id !== id); message.success('已标记处理') }
const loadAlerts = async () => {
  try {
    const res = await request.get('/api/live/alerts')
    if (res && res.data) {
      const data = res.data
      if (data.summary) alertSummary.value = data.summary
      if (data.active_alerts) activeAlerts.value = data.active_alerts
      if (data.history) alertHistory.value = data.history
      if (data.trend) {
        renderTrendChart(data.trend)
      }
    }
    message.success('已刷新')
  } catch (e) {
    message.error('加载预警数据失败')
  }
}
const saveConfig = () => { showConfig.value = false; message.success('配置已保存') }

const trendChartRef = ref(null)
let trendChart

const renderTrendChart = (trendData) => {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)
  if (!trendData || !trendData.hours || !trendData.hours.length) {
    trendChart.setOption({
      title: { text: '暂无预警数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14, fontWeight: 'normal' } },
      xAxis: { show: false }, yAxis: { show: false }, series: []
    })
    return
  }
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['严重', '警告', '提醒'] },
    grid: { left: 40, right: 16, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: trendData.hours },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      { name: '严重', type: 'bar', stack: 'total', itemStyle: { color: '#FF4D4F' }, data: trendData.critical || [] },
      { name: '警告', type: 'bar', stack: 'total', itemStyle: { color: '#FF8A00' }, data: trendData.warning || [] },
      { name: '提醒', type: 'bar', stack: 'total', itemStyle: { color: '#1677FF' }, data: trendData.info || [] },
    ]
  })
}

onMounted(async () => {
  await nextTick()
  await loadAlerts()
})
onUnmounted(() => { trendChart?.dispose() })
</script>

<style scoped>
.live-alerts { padding: 0 0 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.page-title { font-size: 18px; font-weight: 700; margin: 0; }
.page-header__actions { display: flex; gap: 8px; }

.alert-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.summary-card { background: #fff; border-radius: 10px; padding: 16px; text-align: center; border: 1px solid var(--border); }
.summary-card--danger { border-top: 3px solid #FF4D4F; }
.summary-card--warning { border-top: 3px solid #FF8A00; }
.summary-card--info { border-top: 3px solid #1677FF; }
.summary-card--success { border-top: 3px solid #00B96B; }
.summary-card__value { font-size: 28px; font-weight: 700; }
.summary-card--danger .summary-card__value { color: #FF4D4F; }
.summary-card--warning .summary-card__value { color: #FF8A00; }
.summary-card--info .summary-card__value { color: #1677FF; }
.summary-card--success .summary-card__value { color: #00B96B; }
.summary-card__label { font-size: 12px; color: var(--text-hint); margin-top: 4px; }

.alert-list { display: flex; flex-direction: column; gap: 10px; }
.alert-item { display: flex; gap: 12px; padding: 14px; border-radius: 10px; border: 1px solid var(--border); align-items: flex-start; }
.alert-item--critical { border-left: 3px solid #FF4D4F; background: #FFF1F0; }
.alert-item--warning { border-left: 3px solid #FF8A00; background: #FFF7E6; }
.alert-item--info { border-left: 3px solid #1677FF; background: #E8F4FF; }
.alert-item__icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
.alert-item__content { flex: 1; min-width: 0; }
.alert-item__header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.alert-item__title { font-weight: 600; font-size: 14px; }
.alert-item__desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.alert-item__meta { display: flex; gap: 4px; font-size: 11px; color: var(--text-hint); flex-wrap: wrap; }
.meta-dot { color: var(--text-hint); }
.alert-item__actions { display: flex; flex-direction: column; flex-shrink: 0; }

.chart-box { height: 260px; }

.config-section { margin-bottom: 20px; }
.config-section__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.config-section__title { font-weight: 600; font-size: 14px; }
.threshold-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-left: 8px; }
.threshold-label { font-size: 13px; width: 80px; color: var(--text-secondary); }
.threshold-unit { font-size: 12px; color: var(--text-hint); }
.notify-options { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.drawer-footer { display: flex; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--divider); margin-top: 16px; }

@media (max-width: 767px) {
  .alert-summary { grid-template-columns: repeat(2, 1fr); }
  .alert-item { flex-direction: column; }
  .alert-item__actions { flex-direction: row; }
}
</style>
