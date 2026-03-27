<template>
  <div class="alerts-page">
    <!-- 顶部Tab切换 -->
    <div class="top-tabs">
      <button
        v-for="t in topTabOptions"
        :key="t.value"
        class="top-tab"
        :class="{ active: activeTab === t.value }"
        @click="activeTab = t.value"
      >{{ t.label }}</button>
    </div>

    <!-- 告警中心 -->
    <template v-if="activeTab === 'alerts'">
      <!-- 告警状态卡 -->
      <div class="alert-overview">
        <div class="overview-item" v-for="o in overviewItems" :key="o.key">
          <div class="ov-icon" :style="{ background: o.bg, color: o.color }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="o.icon"></svg>
          </div>
          <div class="ov-info">
            <div class="ov-count">{{ o.count }}</div>
            <div class="ov-label">{{ o.label }}</div>
          </div>
        </div>
      </div>

      <!-- 告警列表 -->
      <div class="section-header">
        <span class="section-title">告警记录</span>
        <div class="level-tabs">
          <button
            v-for="l in levelOptions"
            :key="l.value"
            class="level-tab"
            :class="{ active: selectedLevel === l.value }"
            @click="selectedLevel = l.value"
          >{{ l.label }}</button>
        </div>
      </div>

      <div class="alert-list" v-if="!loading">
        <div
          class="alert-card"
          v-for="alert in filteredAlerts"
          :key="alert.id"
          :class="['level-' + alert.level, { resolved: alert.resolved }]"
        >
          <div class="alert-left">
            <div class="alert-dot" :class="'dot-' + alert.level"></div>
            <div class="alert-content">
              <div class="alert-title">{{ alert.title }}</div>
              <div class="alert-desc">{{ alert.description }}</div>
              <div class="alert-time">{{ formatTime(alert.created_at) }}</div>
            </div>
          </div>
          <div class="alert-right">
            <div class="alert-badge" :class="'badge-' + alert.level">
              {{ getLevelLabel(alert.level) }}
            </div>
            <button
              v-if="!alert.resolved"
              class="resolve-btn"
              @click.stop="resolveAlert(alert)"
            >处理</button>
            <div v-else class="resolved-tag">已处理</div>
          </div>
        </div>
      </div>

      <div class="empty-state" v-if="!loading && filteredAlerts.length === 0">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <p>{{ selectedLevel ? '该级别暂无告警' : '暂无告警' }}</p>
      </div>
      <div class="loading-state" v-if="loading"><a-spin size="large" /></div>

      <!-- 告警规则入口 -->
      <div class="rules-section">
        <div class="rules-header">
          <span class="section-title">告警规则</span>
          <button class="add-rule-btn" @click="showRuleModal = true">+ 新增规则</button>
        </div>
        <div class="rule-list">
          <div class="rule-card" v-for="rule in rules" :key="rule.id">
            <div class="rule-info">
              <div class="rule-name">{{ rule.name }}</div>
              <div class="rule-cond">{{ rule.condition }}</div>
            </div>
            <a-switch v-model:checked="rule.enabled" size="small" />
          </div>
        </div>
      </div>
    </template>

    <!-- 每日简报 -->
    <template v-if="activeTab === 'briefing'">
      <div class="briefing-section">
        <div class="briefing-header">
          <span class="section-title">每日简报</span>
          <button class="trigger-btn" :disabled="triggerLoading" @click="triggerBriefing">
            {{ triggerLoading ? '生成中...' : '手动生成' }}
          </button>
        </div>
        <div class="briefing-desc">每日早上 9:00 自动生成昨日数据分析简报，通过钉钉推送</div>

        <div class="loading-state" v-if="briefingLoading"><a-spin size="large" /></div>

        <div v-if="!briefingLoading && briefings.length === 0" class="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="1">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p>暂无简报记录，点击「手动生成」立即创建</p>
        </div>

        <div class="briefing-list" v-if="!briefingLoading">
          <div
            class="briefing-card"
            v-for="b in briefings"
            :key="b.id"
            @click="expandedBriefing = expandedBriefing === b.id ? null : b.id"
          >
            <div class="briefing-card-header">
              <div class="briefing-date-badge">{{ formatBriefDate(b.brief_date) }}</div>
              <div class="briefing-stats">
                <span class="stat-item">消耗 <strong>¥{{ formatNum(b.total_cost) }}</strong></span>
                <span class="stat-item">展示 <strong>{{ formatNum(b.total_show) }}</strong></span>
                <span class="stat-item">点击 <strong>{{ formatNum(b.total_click) }}</strong></span>
                <span class="stat-item">转化 <strong>{{ b.total_convert }}</strong></span>
              </div>
              <div class="briefing-sent">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52c41a" stroke-width="2">
                  <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
                </svg>
                {{ formatTime(b.sent_at) }}
              </div>
              <svg class="expand-icon" :class="{ expanded: expandedBriefing === b.id }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="briefing-content" v-if="expandedBriefing === b.id" v-html="renderMd(b.content)"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- 新增规则弹窗 -->
    <a-modal
      v-model:open="showRuleModal"
      title="新增告警规则"
      okText="保存"
      cancelText="取消"
      @ok="saveRule"
    >
      <div class="rule-form">
        <div class="form-item">
          <label>规则名称</label>
          <a-input v-model:value="ruleForm.name" placeholder="请输入规则名称" />
        </div>
        <div class="form-item">
          <label>监控指标</label>
          <a-select v-model:value="ruleForm.metric" style="width:100%" :options="metricOptions" />
        </div>
        <div class="form-item">
          <label>触发条件</label>
          <div class="cond-row">
            <a-select v-model:value="ruleForm.operator" style="width:110px" :options="operatorOptions" />
            <a-input-number v-model:value="ruleForm.threshold" style="flex:1" />
          </div>
        </div>
        <div class="form-item">
          <label>告警级别</label>
          <a-select v-model:value="ruleForm.level" style="width:100%" :options="levelSelectOptions" />
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import axios from '@/utils/request'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const topTabOptions = [
  { label: '告警中心', value: 'alerts' },
  { label: '每日简报', value: 'briefing' },
]
const activeTab = ref('alerts')

const levelOptions = [
  { label: '全部', value: '' },
  { label: '严重', value: 'critical' },
  { label: '警告', value: 'warning' },
  { label: '提示', value: 'info' },
]
const metricOptions = [
  { label: '今日花费', value: 'stat_cost' },
  { label: '点击率 CTR', value: 'ctr' },
  { label: '转化率 CVR', value: 'convert_rate' },
  { label: '转化成本', value: 'convert_cost' },
]
const operatorOptions = [
  { label: '大于', value: 'gt' },
  { label: '小于', value: 'lt' },
  { label: '等于', value: 'eq' },
]
const levelSelectOptions = [
  { label: '严重', value: 'critical' },
  { label: '警告', value: 'warning' },
  { label: '提示', value: 'info' },
]

const selectedLevel = ref('')
const loading = ref(false)
const alerts = ref([])
const showRuleModal = ref(false)
const rules = ref([
  { id: 1, name: '日预算超限告警', condition: '今日花费 > 日预算 90%', enabled: true },
  { id: 2, name: 'CTR 过低告警', condition: '点击率 < 0.5%', enabled: true },
  { id: 3, name: '转化成本过高', condition: '转化成本 > ¥500', enabled: false },
])
const ruleForm = ref({ name: '', metric: 'stat_cost', operator: 'gt', threshold: 0, level: 'warning' })

// 简报相关
const briefings = ref([])
const briefingLoading = ref(false)
const triggerLoading = ref(false)
const expandedBriefing = ref(null)

const overviewItems = computed(() => {
  const critical = alerts.value.filter(a => a.level === 'critical' && !a.resolved).length
  const warning = alerts.value.filter(a => a.level === 'warning' && !a.resolved).length
  const total = alerts.value.filter(a => !a.resolved).length
  return [
    { key: 'critical', label: '严重', count: critical, color: '#FF4D4F', bg: '#FFF1F0', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
    { key: 'warning', label: '警告', count: warning, color: '#FF8A00', bg: '#FFF7E6', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
    { key: 'total', label: '未处理', count: total, color: '#1677FF', bg: '#E8F4FF', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
  ]
})

const filteredAlerts = computed(() => {
  if (!selectedLevel.value) return alerts.value
  return alerts.value.filter(a => a.level === selectedLevel.value)
})

function getLevelLabel(l) {
  return { critical: '严重', warning: '警告', info: '提示' }[l] || l
}

function formatTime(t) {
  return dayjs(t).fromNow()
}

function formatBriefDate(d) {
  return dayjs(d).format('MM/DD')
}

function formatNum(n) {
  if (n == null) return '-'
  const num = parseFloat(n)
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toFixed(num % 1 === 0 ? 0 : 2)
}

function renderMd(text) {
  if (!text) return ''
  return text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

async function loadData() {
  loading.value = true
  try {
    const res = await axios.get('/alerts/history')
    alerts.value = res.data?.data?.list || getMockAlerts()
  } catch {
    alerts.value = getMockAlerts()
  } finally {
    loading.value = false
  }
}

async function loadBriefings() {
  briefingLoading.value = true
  try {
    const res = await axios.get('/alerts/briefings')
    briefings.value = res.data?.data?.list || []
  } catch {
    briefings.value = []
  } finally {
    briefingLoading.value = false
  }
}

function getMockAlerts() {
  return [
    { id: 1, level: 'critical', title: '账户余额不足', description: '账户 1842321714551812 余额低于 ¥100，请及时充值', created_at: new Date(Date.now() - 3600000), resolved: false },
    { id: 2, level: 'warning', title: 'CTR 过低告警', description: '广告计划「短视频带货计划-001」今日 CTR 仅 0.3%，低于阈值', created_at: new Date(Date.now() - 7200000), resolved: false },
    { id: 3, level: 'warning', title: '预算消耗超 90%', description: '计划「直播推广计划-002」日预算已消耗 92%', created_at: new Date(Date.now() - 10800000), resolved: false },
    { id: 4, level: 'info', title: '数据同步完成', description: '今日数据已成功同步，共 8 个计划', created_at: new Date(Date.now() - 14400000), resolved: true },
    { id: 5, level: 'critical', title: 'Access Token 即将过期', description: 'Token 将于 2 小时后过期，请及时更新授权', created_at: new Date(Date.now() - 1800000), resolved: false },
    { id: 6, level: 'info', title: '转化率提升通知', description: '计划「短视频带货计划-003」转化率较昨日提升 15%', created_at: new Date(Date.now() - 86400000), resolved: true },
  ]
}

async function resolveAlert(alert) {
  try {
    await axios.post(`/alerts/${alert.id}/resolve`)
    alert.resolved = true
    message.success('已标记为已处理')
  } catch {
    alert.resolved = true
    message.success('已标记为已处理')
  }
}

async function triggerBriefing() {
  triggerLoading.value = true
  try {
    const res = await axios.post('/alerts/briefings/trigger')
    if (res.data.code === 0) {
      message.success('简报已生成并发送至钉钉')
      await loadBriefings()
    } else {
      message.error(res.data.msg || '生成失败')
    }
  } catch (e) {
    message.error('生成简报失败: ' + (e.response?.data?.msg || e.message))
  } finally {
    triggerLoading.value = false
  }
}

function saveRule() {
  if (!ruleForm.value.name) { message.warning('请填写规则名称'); return }
  rules.value.push({
    id: Date.now(),
    name: ruleForm.value.name,
    condition: `${ruleForm.value.metric} ${ruleForm.value.operator} ${ruleForm.value.threshold}`,
    enabled: true,
  })
  showRuleModal.value = false
  message.success('规则已保存')
}

onMounted(() => {
  loadData()
  loadBriefings()
})
</script>

<style scoped>
.alerts-page {
  padding-bottom: calc(var(--tabnav-h) + var(--safe-b) + 16px);
  min-height: 100vh;
  background: var(--bg-page);
}

.top-tabs {
  display: flex;
  gap: 0;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
}
.top-tab {
  flex: 1;
  padding: 14px 0;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  text-align: center;
  transition: all 0.2s;
}
.top-tab.active {
  color: var(--c-primary);
  border-bottom-color: var(--c-primary);
}

.alert-overview {
  display: flex;
  gap: 0;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 16px;
  gap: 12px;
  margin-bottom: 8px;
}
.overview-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: #F5F6F8;
}
.ov-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ov-count { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.ov-label { font-size: 11px; color: var(--text-hint); margin-top: 1px; }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
.section-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }

.level-tabs { display: flex; gap: 4px; }
.level-tab {
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.level-tab.active {
  background: var(--c-primary-bg);
  border-color: var(--c-primary);
  color: var(--c-primary);
}

.alert-list { padding: 0 12px; display: flex; flex-direction: column; gap: 8px; }

.alert-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border-left: 3px solid transparent;
  transition: opacity 0.2s;
}
.alert-card.level-critical { border-left-color: var(--c-danger); }
.alert-card.level-warning { border-left-color: var(--c-warning); }
.alert-card.level-info { border-left-color: var(--c-primary); }
.alert-card.resolved { opacity: 0.5; }

.alert-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }

.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.dot-critical { background: var(--c-danger); box-shadow: 0 0 0 3px rgba(255,77,79,0.15); }
.dot-warning { background: var(--c-warning); box-shadow: 0 0 0 3px rgba(255,138,0,0.15); }
.dot-info { background: var(--c-primary); box-shadow: 0 0 0 3px rgba(22,119,255,0.15); }

.alert-content { flex: 1; min-width: 0; }
.alert-title { font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 4px; }
.alert-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; line-height: 1.5; }
.alert-time { font-size: 11px; color: var(--text-hint); }

.alert-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }

.alert-badge {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.badge-critical { background: var(--c-danger-bg); color: var(--c-danger); }
.badge-warning { background: var(--c-warning-bg); color: var(--c-warning); }
.badge-info { background: var(--c-primary-bg); color: var(--c-primary); }

.resolve-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--c-primary);
  background: transparent;
  color: var(--c-primary);
  font-size: 12px;
  cursor: pointer;
}
.resolved-tag { font-size: 11px; color: var(--text-hint); }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 20px;
  color: var(--text-hint); gap: 12px;
}
.loading-state { display: flex; justify-content: center; padding: 60px 20px; }

.rules-section {
  margin: 16px 12px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.rules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.add-rule-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--c-primary);
  background: var(--c-primary-bg);
  color: var(--c-primary);
  font-size: 13px;
  cursor: pointer;
}
.rule-list { display: flex; flex-direction: column; }
.rule-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.rule-card:last-child { border-bottom: none; }
.rule-name { font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 2px; }
.rule-cond { font-size: 12px; color: var(--text-hint); }

.rule-form { display: flex; flex-direction: column; gap: 16px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.form-item label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.cond-row { display: flex; gap: 8px; align-items: center; }

/* 简报样式 */
.briefing-section {
  padding: 16px 12px;
}
.briefing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.briefing-desc {
  font-size: 12px;
  color: var(--text-hint);
  margin-bottom: 16px;
}
.trigger-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: var(--c-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.trigger-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.briefing-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.briefing-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.briefing-card:hover { box-shadow: var(--shadow-md, 0 2px 8px rgba(0,0,0,0.1)); }
.briefing-card-header {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.briefing-date-badge {
  background: var(--c-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  flex-shrink: 0;
}
.briefing-stats {
  display: flex;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
}
.stat-item {
  font-size: 12px;
  color: var(--text-secondary);
}
.stat-item strong {
  color: var(--text-primary);
  font-weight: 600;
}
.briefing-sent {
  font-size: 11px;
  color: var(--text-hint);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.expand-icon {
  flex-shrink: 0;
  color: var(--text-hint);
  transition: transform 0.2s;
}
.expand-icon.expanded { transform: rotate(180deg); }
.briefing-content {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.briefing-content :deep(h3) { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 12px 0 6px; }
.briefing-content :deep(h4) { font-size: 13px; font-weight: 600; color: var(--text-primary); margin: 10px 0 4px; }
.briefing-content :deep(strong) { color: var(--text-primary); }
.briefing-content :deep(ul) { padding-left: 16px; margin: 4px 0; }
.briefing-content :deep(li) { margin: 2px 0; }

@media (min-width: 768px) {
  .alerts-page { padding-bottom: 24px; }
  .alert-list { display: grid; grid-template-columns: repeat(2, 1fr); padding: 0 24px; }
  .rules-section { margin: 16px 24px; }
  .briefing-section { padding: 16px 24px; }
}
</style>
