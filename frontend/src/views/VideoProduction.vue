<template>
  <div class="vp-page">
    <!-- 顶部操作栏 -->
    <div class="vp-header">
      <div class="header-left">
        <h2 class="page-title">爆款视频改造</h2>
        <span class="plan-count" v-if="plans.length">共 {{ total }} 条</span>
      </div>
      <button class="generate-btn" :disabled="generating" @click="handleGenerate">
        <svg v-if="!generating" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <a-spin v-if="generating" size="small" />
        {{ generating ? '生成中...' : 'AI 生成生产方案' }}
      </button>
    </div>

    <!-- 脚本输入区域 -->
    <div class="script-section">
      <div class="section-header-fixed">
        <span class="section-title">✏️ 脚本输入</span>
      </div>
      <div class="script-panel">
        <p class="script-desc">输入视频脚本/文案，AI将根据脚本内容自动匹配千川素材并生成混剪方案</p>
        <textarea
          v-model="scriptText"
          class="script-textarea"
          rows="6"
          placeholder="示例：&#10;开头(0-3s): 脸出油到反光？姐妹你的洁面该换了！&#10;产品展示(3-9s): 雪玲妃绿泥洁面膏，矿物质精华，泡沫超绵密&#10;使用过程(9-17s): 上脸清洗过程，打圈按摩，冲水展示洗后肤质&#10;效果对比(17-23s): 洗前洗后T区对比，毛孔变细腻&#10;促销结尾(23-29s): 限时特惠，点击下方立即抢购"
        ></textarea>
        <div class="script-actions">
          <span class="script-char-count">{{ scriptText.length }} 字</span>
          <button class="script-generate-btn" :disabled="generating || !scriptText.trim()" @click="handleGenerateWithScript">
            <svg v-if="!generating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <a-spin v-if="generating" size="small" />
            {{ generating ? '生成中...' : '根据脚本生成方案 + 自动混剪' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 脚本规范要求 -->
    <div class="script-spec-section">
      <div class="section-header-fixed" @click="showSpec = !showSpec" style="cursor:pointer">
        <span class="section-title">📋 脚本规范要求</span>
        <span class="spec-toggle">{{ showSpec ? '收起' : '查看/编辑' }} {{ showSpec ? '▲' : '▼' }}</span>
      </div>
      <div v-if="showSpec" class="spec-panel">
        <textarea v-model="scriptSpec" class="spec-textarea" rows="20"></textarea>
        <div class="spec-actions">
          <button class="spec-save-btn" @click="saveSpec" :disabled="specSaving">{{ specSaving ? '保存中...' : '💾 保存规范' }}</button>
          <button class="spec-reset-btn" @click="resetSpec">🔄 恢复默认</button>
        </div>
      </div>
    </div>

    <!-- 视频预览弹窗 -->
    <div v-if="previewUrl" class="preview-modal" @click.self="previewUrl = null">
      <div class="preview-content">
        <button class="close-preview" @click="previewUrl = null">✕</button>
        <video :src="previewUrl" controls autoplay class="modal-player"></video>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div class="status-tabs">
      <span class="tab-item" :class="{ active: filterStatus === '' }" @click="filterStatus = ''; loadPlans()">全部</span>
      <span class="tab-item" :class="{ active: filterStatus === 'pending' }" @click="filterStatus = 'pending'; loadPlans()">待制作</span>
      <span class="tab-item" :class="{ active: filterStatus === 'producing' }" @click="filterStatus = 'producing'; loadPlans()">制作中</span>
      <span class="tab-item" :class="{ active: filterStatus === 'completed' }" @click="filterStatus = 'completed'; loadPlans()">已完成</span>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading && !plans.length" class="loading-state"><a-spin /></div>

    <!-- 空状态 -->
    <div v-if="!loading && !plans.length" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d9d9d9" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      <p>暂无生产方案</p>
      <p class="empty-hint">输入脚本或点击「AI 生成生产方案」自动创建</p>
    </div>

    <!-- 方案卡片列表 -->
    <div class="plan-list">
      <div class="plan-card" v-for="plan in plans" :key="plan.id" :class="{ expanded: expandedId === plan.id }">
        <div class="plan-card-header" @click="toggleExpand(plan.id)">
          <div class="plan-info">
            <div class="plan-title-row">
              <span class="strategy-tag" v-if="plan.strategy">{{ plan.strategy }}</span>
              <span class="plan-title">{{ plan.title }}</span>
            </div>
            <div class="plan-meta">
              <span class="ref-script-mini" v-if="plan.ref_script_title">📝 {{ plan.ref_script_title }}</span>
              <span class="plan-time">{{ formatTime(plan.created_at) }}</span>
            </div>
          </div>
          <div class="plan-actions">
            <span class="status-tag" :class="'status-' + plan.status">{{ statusLabel(plan.status) }}</span>
            <svg class="expand-icon" :class="{ rotated: expandedId === plan.id }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>

        <!-- 展开详情 -->
        <div v-if="expandedId === plan.id" class="plan-detail">

          <!-- 参考素材 -->
          <div v-if="plan.ref_materials && plan.ref_materials.length" class="detail-section detail-refs">
            <div class="detail-label">📊 参考素材</div>
            <div class="ref-item" v-for="(ref, i) in plan.ref_materials" :key="i">
              <span class="ref-title">{{ ref.title }}</span>
              <span class="ref-reason">{{ ref.reason }}</span>
            </div>
          </div>

          <!-- 关联脚本 -->
          <div v-if="plan.ref_script_title" class="detail-section detail-script">
            <div class="detail-label">📝 关联脚本</div>
            <div class="script-name">{{ plan.ref_script_title }}</div>
          </div>

          <!-- 时间轴 -->
          <div v-if="plan.timeline && plan.timeline.length" class="detail-section detail-timeline">
            <div class="detail-label">🎬 生产时间轴</div>
            <div class="tl-item" v-for="(t, i) in plan.timeline" :key="i">
              <div class="tl-time">{{ t.time }}</div>
              <div class="tl-body">
                <div class="tl-source">📂 {{ t.source }} <span v-if="t.keep_original_audio" class="tl-keep-audio">🔊 保留原声</span> <span v-if="t.visual_effect && t.visual_effect !== 'static'" class="tl-effect">🎬 {{ effectLabel(t.visual_effect) }}</span> <span v-if="t.pace && t.pace !== 'normal'" class="tl-pace">⚡{{ paceLabel(t.pace) }}</span></div>
                <div class="tl-content">🎬 {{ t.content }}</div>
                <div class="tl-narration">{{ t.keep_original_audio ? '💬' : '🎙️' }} {{ t.narration }}</div>
                <div class="tl-marketing" v-if="t.marketing_text">🏷️ {{ t.marketing_text }}</div>
                <div class="tl-edit" v-if="t.edit_note">✂️ {{ t.edit_note }}</div>
              </div>
            </div>
          </div>

          <!-- 查看详细脚本拍摄流程 -->
          <div class="detail-section detail-script-flow">
            <button class="script-flow-btn" @click.stop="generateScriptFlow(plan)" :disabled="plan._scriptFlowLoading">
              {{ plan._scriptFlowLoading ? '生成中...' : '📝 查看详细脚本拍摄流程' }}
            </button>
            <div v-if="plan._scriptFlow" class="script-flow-content">
              <div class="script-flow-header">
                <span>详细拍摄脚本</span>
                <button class="script-flow-close" @click.stop="plan._scriptFlow = null">✕</button>
              </div>
              <div class="script-flow-body" v-html="renderMarkdown(plan._scriptFlow)"></div>
            </div>
          </div>

          <!-- 制作要点 -->
          <div v-if="plan.production_notes" class="detail-section detail-notes">
            <div class="detail-label">💡 制作要点</div>
            <div class="notes-text">{{ plan.production_notes }}</div>
          </div>

          <!-- 操作栏（精简） -->
          <div class="detail-actions">
            <button class="delete-plan-btn" @click.stop="deletePlan(plan)">🗑️ 删除方案</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 推送到千川弹窗 -->
    <div v-if="showPushModal" class="push-modal-overlay" @click.self="showPushModal = false">
      <div class="push-modal">
        <div class="push-modal-header">
          <span class="push-modal-title">🚀 推送到千川账户</span>
          <button class="close-push-modal" @click="showPushModal = false">✕</button>
        </div>
        <div class="push-modal-body">
          <p class="push-desc">选择要推送视频的千川账户（可多选）：</p>
          <div v-if="qcAccountsLoading" class="push-loading"><a-spin size="small" /> 加载账户中...</div>
          <div v-else class="account-list">
            <label class="account-item" v-for="acc in qcAccounts" :key="acc.advertiser_id"
              :class="{ selected: selectedAccounts.includes(acc.advertiser_id) }">
              <input type="checkbox" :value="acc.advertiser_id" v-model="selectedAccounts" />
              <span class="acc-name">{{ acc.advertiser_name }}</span>
              <span class="acc-id">{{ acc.advertiser_id }}</span>
            </label>
          </div>
          <div v-if="pushResults.length" class="push-results">
            <div v-for="(r, i) in pushResults" :key="i" class="push-result-item" :class="{ success: r.success, fail: !r.success }">
              <span>{{ r.advertiser_name || r.advertiser_id }}</span>
              <span>{{ r.success ? '✅ ' + r.msg : '❌ ' + r.msg }}</span>
            </div>
          </div>
        </div>
        <div class="push-modal-footer">
          <button class="push-cancel-btn" @click="showPushModal = false">取消</button>
          <button class="push-confirm-btn" :disabled="!selectedAccounts.length || pushingToQc"
            @click="handlePushToQc">
            <a-spin v-if="pushingToQc" size="small" />
            {{ pushingToQc ? '推送中...' : '确认推送 (' + selectedAccounts.length + ')' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import request from '../utils/request'

const plans = ref([])
const total = ref(0)
const loading = ref(false)
const generating = ref(false)
const filterStatus = ref('')
const expandedId = ref(null)
const previewUrl = ref(null)

// 脚本输入
const scriptText = ref('')

// 脚本规范
const showSpec = ref(false)
const specSaving = ref(false)
const DEFAULT_SCRIPT_SPEC = `你是雪玲妃品牌的千川爆款脚本拆解与改编大师。你的工作是：接收一条已经跑量的爆款脚本（可能来自任何品类），拆解其成功的结构性要素，然后基于雪玲妃的产品重新填充内容，输出可直接投放的改编脚本。

【品牌背景】
雪玲妃是专注洁面品类的美妆品牌，核心产品是雪玲妃黑金氨基酸卸妆洗面奶，对外简称是雪玲妃小黑管洗面奶；核心卖点是真正能卸妆的洗面奶，洗脸、卸妆、养肤多效合一，持证可卸300款彩妆防晒；核心成分是五维净卸技术、30%氨基酸表活、30%高保湿精华；目标人群是精致妈妈、都市白领、小镇青年等。

【千川平台规则】
1. 视频时长：15-60秒，核心变体为20-30秒
2. 前3秒必须有强烈hook，直接拉停留
3. 禁止绝对化用语（"最""第一""100%"）
4. 禁止医疗功效宣称（"治疗""药用"）
5. 必须包含明确的转化引导
6. 口播风格口语化，不能像广告

【工作流程——严格按此顺序执行】

═══ 第一步：结构拆解 ═══
收到爆款脚本原文后，先输出一份完整的结构拆解报告，包含以下7个维度：

1. 【Hook类型】归类该脚本的开场属于哪种类型：
- 痛点提问型（"你是不是也..."）
- 反常识冲击型（"XXX千万不要..."）
- 数据震撼型（"90%的人都不知道..."）
- 场景代入型（直接展示一个生活场景）
- 悬念制造型（"我终于找到了..."）
- 权威背书型（"做了X年的..."）
分析为什么这个hook有效（触发了什么心理机制）。

2. 【情绪曲线】画出脚本的情绪走势：
- 先降后升（痛点→解决）
- 先升后降再升（期待→失望→翻转）
- 平铺直叙（持续输出信息价值）
- 双线对比（A做法 vs B做法）
标注每个情绪节点对应的大致秒数。

3. 【信息密度】分析脚本的信息量分布：
- 前3秒信息密度（高/中/低）
- 中段信息节奏（快节奏连续输出 / 有留白停顿）
- 尾段信息类型（促销型 / 情感型 / 悬念型）

4. 【转折机制】脚本是如何从"内容"过渡到"产品"的：
- 问题解决型（"后来我用了..."）
- 自然出现型（产品在场景中自然入镜）
- 第三方推荐型（"朋友给我推荐了..."）
- 对比引导型（"以前用A，现在换成了..."）
- 专业解读型（"其实你只需要..."）

5. 【信任锚点】脚本用了什么证据来建立可信度：
- 个人体验（"我自己用了X个月"）
- 社会证据（"已经卖了XX万支"）
- 权威认证（"皮肤科医生推荐"）
- 视觉证据（前后对比/实测）
- 成分背书（"含有XX成分"）

6. 【转化话术结构】最后的购买引导用了什么手法：
- 限时促急（"今天下单..."）
- 价格锚（"才别人的几分之一"）
- 风险解除（"不好用可以退"）
- 利益叠加（"下单还送..."）
- 情感号召（"对自己好一点"）

7. 【完播率设计】脚本用了什么手法维持观看：
- 悬念前置（开头埋下问题，结尾解答）
- 视觉节奏变化（多机位切换、特写穿插）
- 信息密度控制（每句都有新信息，无废话）
- 情绪张力（让观众想知道接下来发生什么）

═══ 第二步：骨架提取 ═══
基于以上拆解，输出一份"可复用骨架"：
【骨架名称】用一个词概括这个结构
【骨架公式】[Hook类型] + [情绪曲线] + [转折机制] + [信任锚点] + [转化话术]
【时间分配】各环节的秒数占比

═══ 第三步：雪玲妃改编 ═══
用提取出的骨架，填充雪玲妃的产品内容，输出改编脚本。
改编规则：
1. 保留原脚本的情绪节奏和时间分配，替换具体内容
2. Hook必须重写，保留同类型但换成洁面场景
3. 痛点必须转化为洁面相关的痛点
4. 产品植入必须自然，使用与原脚本相同的转折机制
5. 信任锚点替换为雪玲妃可用的证据
6. 口播风格必须口语化，像真人说话
7. 严格遵守千川平台规则，不触碰禁用词

【改编脚本输出格式】
1. 【Hook】前3秒口播
2. 【主体内容】按原脚本的情绪节奏分段写，每段标注秒数
3. 【产品植入】转折+产品介绍
4. 【信任锚点】
5. 【转化口播】
6. 【拍摄指导】场景、机位、演员动作、道具提示

═══ 第四步：变体输出 ═══
基于同一骨架输出多个变体：
- 变体A：换Hook（保留其他不变）
- 变体B：换目标人群/场景（保留结构不变）
- 变体C：换信任锚点类型（保留其他不变）

每条改编脚本末尾附上"与原脚本的差异说明"`

const scriptSpec = ref(DEFAULT_SCRIPT_SPEC)

const statusOptions = [
  { value: 'pending', label: '待制作' },
  { value: 'producing', label: '制作中' },
  { value: 'completed', label: '已完成' },
]

function statusLabel(s) {
  const m = { pending: '待制作', producing: '制作中', completed: '已完成' }
  return m[s] || s
}

function effectLabel(e) {
  const m = { zoom_in: '推入', zoom_out: '拉远', slow_zoom: '慢推', pan_lr: '左右移', micro_move: '微动' }
  return m[e] || e || ''
}

function paceLabel(p) {
  const m = { fast: '加速', slow: '减速' }
  return m[p] || p || ''
}

function formatTime(t) {
  return t ? dayjs(t).format('MM-DD HH:mm') : ''
}

function formatDuration(d) {
  if (!d) return '0s'
  const m = Math.floor(d / 60)
  const s = Math.round(d % 60)
  return m > 0 ? m + 'm' + s + 's' : s + 's'
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

async function loadPlans() {
  loading.value = true
  try {
    const params = { page: 1, page_size: 50 }
    if (filterStatus.value) params.status = filterStatus.value
    const res = await request.get('/video-production', { params })
    plans.value = (res.data?.items || []).map(p => ({
      ...p,
      _merging: p.merge_status === 'merging',
      _mergeLog: p.merge_progress || p.merge_log || '',
      _bgmStyle: 'rhythm',
      _pushing: false,
      _activeTab: 0,
      output_videos: p.output_videos || null
    }))
    total.value = res.data?.total || 0
  } catch (e) { console.error('加载方案失败', e) }
  finally { loading.value = false }
}

async function handleGenerate() {
  generating.value = true
  try {
    const res = await request.post('/video-production/generate', {}, { timeout: 200000 })
    if (res.code === 0) {
      message.success(res.msg || '视频生产方案生成成功')
      loadPlans()
    } else {
      message.error(res.msg || '生成失败')
    }
  } catch (e) {
    message.error('生成失败，请重试')
  } finally { generating.value = false }
}

async function handleGenerateWithScript() {
  if (!scriptText.value.trim()) {
    message.warning('请先输入脚本内容')
    return
  }
  generating.value = true
  try {
    const res = await request.post('/video-production/generate', {
      custom_script: scriptText.value.trim()
    }, { timeout: 200000 })
    if (res.code === 0) {
      message.success(res.msg || '方案生成成功')
      loadPlans()
      // 自动展开最新方案
      if (res.data && res.data.length) {
        expandedId.value = res.data[0].id
      }
      // 自动触发第一个方案的混剪
      setTimeout(async () => {
        const latest = plans.value[0]
        if (latest && !latest._merging && latest.merge_status !== 'done') {
          startMerge(latest)
        }
      }, 1000)
    } else {
      message.error(res.msg || '生成失败')
    }
  } catch (e) {
    message.error('生成失败，请重试')
  } finally { generating.value = false }
}

async function updateStatus(plan, newStatus) {
  try {
    const res = await request.put('/video-production/' + plan.id + '/status', { status: newStatus })
    if (res.code === 0) {
      plan.status = newStatus
      message.success('状态已更新')
    }
  } catch (e) { message.error('更新失败') }
}

async function deletePlan(plan) {
  if (!confirm('确认删除该方案？')) return
  try {
    const res = await request.delete('/video-production/' + plan.id)
    if (res.code === 0) {
      message.success('已删除')
      loadPlans()
    }
  } catch (e) { message.error('删除失败') }
}

// ========== 推送到千川 ==========
const showPushModal = ref(false)
const pushPlanId = ref(null)
const qcAccounts = ref([])
const qcAccountsLoading = ref(false)
const selectedAccounts = ref([])
const pushingToQc = ref(false)
const pushResults = ref([])

async function loadQcAccounts() {
  qcAccountsLoading.value = true
  try {
    const res = await request.get('/video-production/qc-accounts')
    qcAccounts.value = res.data || []
    // 默认全选
    selectedAccounts.value = qcAccounts.value.map(a => a.advertiser_id)
  } catch (e) { console.error('加载千川账户失败', e) }
  finally { qcAccountsLoading.value = false }
}

const pushVideoUrl = ref(null)

function openPushModal(plan) {
  pushPlanId.value = plan.id
  pushResults.value = []
  // 获取当前活动tab的视频URL
  if (plan.output_videos && plan.output_videos.length) {
    const activeVideo = plan.output_videos[plan._activeTab || 0]
    pushVideoUrl.value = activeVideo?.url || plan.output_video
  } else {
    pushVideoUrl.value = plan.output_video
  }
  showPushModal.value = true
  if (!qcAccounts.value.length) loadQcAccounts()
}

async function handlePushToQc() {
  if (!selectedAccounts.value.length || !pushPlanId.value) return
  pushingToQc.value = true
  pushResults.value = []
  // 标记对应plan的_pushing
  const plan = plans.value.find(p => p.id === pushPlanId.value)
  if (plan) plan._pushing = true
  try {
    const res = await request.post('/video-production/' + pushPlanId.value + '/push-to-qianchuan', {
      advertiser_ids: selectedAccounts.value,
      video_url: pushVideoUrl.value
    }, { timeout: 180000 })
    if (res.code === 0) {
      pushResults.value = res.data || []
      const successCount = pushResults.value.filter(r => r.success).length
      if (successCount === selectedAccounts.value.length) {
        message.success(res.msg || '全部推送成功')
      } else if (successCount > 0) {
        message.warning(res.msg || '部分推送成功')
      } else {
        message.error('推送全部失败')
      }
    } else {
      message.error(res.msg || '推送失败')
    }
  } catch (e) {
    message.error('推送请求失败: ' + (e.message || ''))
  } finally {
    pushingToQc.value = false
    if (plan) plan._pushing = false
  }
}

// ========== 混剪 ==========
async function startMerge(plan) {
  plan._merging = true
  plan._mergeLog = '启动混剪...'
  try {
    const res = await request.post('/video-production/' + plan.id + '/merge', { bgm_style: plan._bgmStyle || 'rhythm' })
    if (res.code !== 0) {
      plan._merging = false
      message.error(res.msg || '启动失败')
      return
    }
    message.info(res.msg || '混剪任务已启动')
    // 轮询状态
    const poll = setInterval(async () => {
      try {
        const sr = await request.get('/video-production/' + plan.id + '/merge-status')
        plan._mergeLog = sr.data?.merge_progress || sr.data?.merge_log || '处理中...'
        // 更新3变体状态
        if (sr.data?.output_videos) {
          plan.output_videos = sr.data.output_videos
        }
        if (sr.data?.merge_status === 'done') {
          clearInterval(poll)
          plan._merging = false
          plan.merge_status = 'done'
          plan.output_video = sr.data.output_video
          plan.output_videos = sr.data.output_videos || null
          plan.merge_log = sr.data.merge_log
          const doneCount = plan.output_videos ? plan.output_videos.filter(v => v.status === 'done').length : 1
          message.success(`混剪完成！${plan.output_videos ? doneCount + '/3个视频' : ''}`)
        } else if (sr.data?.merge_status === 'failed') {
          clearInterval(poll)
          plan._merging = false
          plan.merge_status = 'failed'
          plan.merge_log = sr.data.merge_log
          message.error('混剪失败: ' + (sr.data.merge_log || '未知错误'))
        }
      } catch(e) {}
    }, 5000)
  } catch (e) {
    plan._merging = false
    message.error('启动混剪失败')
  }
}

// 脚本规范
async function saveSpec() {
  specSaving.value = true
  try {
    await request.post('/video-production/save-spec', { spec: scriptSpec.value })
    message.success('脚本规范已保存')
  } catch (e) { message.error('保存失败') } finally { specSaving.value = false }
}
function resetSpec() { scriptSpec.value = DEFAULT_SCRIPT_SPEC }

// 查看详细脚本拍摄流程
async function generateScriptFlow(plan) {
  if (plan._scriptFlowLoading) return
  plan._scriptFlowLoading = true
  plan._scriptFlow = null
  try {
    const res = await request.post('/video-production/generate-script-flow', {
      plan_id: plan.id,
      timeline: plan.timeline,
      title: plan.title,
      strategy: plan.strategy,
      production_notes: plan.production_notes,
    }, { timeout: 120000 })
    if (res.code === 0) plan._scriptFlow = res.data?.script_flow || '生成失败'
    else message.error(res.msg || '生成失败')
  } catch (e) { message.error('请求失败: ' + e.message) } finally { plan._scriptFlowLoading = false }
}

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/【(.+?)】/g, '<strong style="color:#1677FF">【$1】</strong>')
    .replace(/═+/g, '<hr style="border:none;border-top:1px solid #e5e6eb;margin:8px 0">')
}

onMounted(() => {
  loadPlans()
  // 加载保存的脚本规范
  request.get('/video-production/get-spec').then(r => {
    if (r?.data?.spec) scriptSpec.value = r.data.spec
  }).catch(() => {})
})
</script>

<style scoped>
.vp-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: calc(var(--tabnav-h, 0px) + var(--safe-b, 0px) + 16px);
}

.vp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 8px;
}
.header-left { display: flex; align-items: center; gap: 10px; }
.page-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.plan-count { font-size: 12px; color: var(--text-hint); background: #f0f0f0; padding: 2px 8px; border-radius: 10px; }

.generate-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 20px; border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, #1677FF, #4096FF);
  color: #fff; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.3s;
  box-shadow: 0 2px 10px rgba(22,119,255,0.3);
}
.generate-btn:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(22,119,255,0.4); transform: translateY(-1px); }
.generate-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* 脚本输入区域 */
.script-section {
  background: var(--bg-card);
  border-radius: 12px;
  margin: 8px 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  overflow: hidden;
}
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; cursor: pointer;
}
.section-header-fixed {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
}
.section-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.script-hint-tag {
  font-size: 11px; color: #52c41a; font-weight: 400;
  background: #F6FFED; padding: 1px 8px; border-radius: 8px; margin-left: 6px;
}
.script-panel { padding: 0 16px 16px; }
.script-desc { font-size: 12px; color: var(--text-hint); margin: 0 0 10px; line-height: 1.5; }
.script-textarea {
  width: 100%; box-sizing: border-box;
  padding: 12px 14px;
  border: 1.5px solid #d9d9d9; border-radius: 10px;
  font-size: 13px; line-height: 1.7;
  color: var(--text-primary); background: #FAFAFA;
  resize: vertical; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.script-textarea:focus {
  border-color: #722ED1;
  box-shadow: 0 0 0 3px rgba(114,46,209,0.08);
  background: #fff;
}
.script-textarea::placeholder { color: #bbb; font-size: 12px; }
.script-actions {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; gap: 10px;
}
.script-char-count { font-size: 11px; color: var(--text-hint); }
.script-generate-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 22px; border-radius: 20px;
  border: none; font-size: 13px; font-weight: 600;
  background: linear-gradient(135deg, #722ED1, #B37FEB);
  color: #fff; cursor: pointer;
  box-shadow: 0 2px 10px rgba(114,46,209,0.3);
  transition: all 0.3s;
}
.script-generate-btn:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(114,46,209,0.4); transform: translateY(-1px); }
.script-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 视频预览弹窗 */
.preview-modal {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.8); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.preview-content { position: relative; width: 90%; max-width: 500px; }
.close-preview {
  position: absolute; top: -36px; right: 0;
  background: none; border: none; color: #fff;
  font-size: 24px; cursor: pointer; z-index: 1;
}
.modal-player { width: 100%; border-radius: 10px; max-height: 80vh; }

/* 状态筛选 */
.status-tabs {
  display: flex; gap: 6px; padding: 10px 0;
  overflow-x: auto; flex-wrap: nowrap;
}
.tab-item {
  padding: 5px 14px; border-radius: 16px;
  font-size: 13px; color: var(--text-secondary);
  background: var(--bg-card); border: 1px solid var(--border);
  cursor: pointer; white-space: nowrap; transition: all 0.2s;
}
.tab-item.active { background: #1677FF; color: #fff; border-color: #1677FF; }
.tab-item:hover:not(.active) { border-color: #1677FF; color: #1677FF; }

/* 方案卡片 */
.plan-list { display: flex; flex-direction: column; gap: 10px; }
.plan-card {
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.plan-card.expanded { box-shadow: 0 2px 12px rgba(22,119,255,0.12); }

.plan-card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; cursor: pointer;
}
.plan-info { flex: 1; min-width: 0; }
.plan-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.strategy-tag {
  padding: 1px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 600;
  background: #F0F5FF; color: #1677FF;
  white-space: nowrap;
}
.plan-title { font-size: 14px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-meta { display: flex; align-items: center; gap: 10px; }
.ref-script-mini { font-size: 12px; color: #722ED1; }
.plan-time { font-size: 11px; color: var(--text-hint); }

.plan-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.status-tag {
  padding: 2px 10px; border-radius: 10px;
  font-size: 11px; font-weight: 600;
}
.status-pending { background: #FFF7E6; color: #D48806; }
.status-producing { background: #E6F7FF; color: #1677FF; }
.status-completed { background: #F6FFED; color: #389E0D; }

.expand-icon { transition: transform 0.2s; color: var(--text-hint); }
.expand-icon.rotated { transform: rotate(180deg); }

/* 展开详情 */
.plan-detail {
  padding: 0 16px 16px;
  border-top: 1px dashed var(--border);
}

.detail-section { margin-top: 12px; }
.detail-label { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }

/* 参考素材 */
.detail-refs { background: #F0F5FF; border-radius: 8px; padding: 10px 12px; }
.detail-refs .detail-label { margin-top: 0; color: #1677FF; }
.ref-item { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(22,119,255,0.1); }
.ref-item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
.ref-title { font-size: 13px; font-weight: 600; color: #333; }
.ref-reason { font-size: 12px; color: #666; }

/* 关联脚本 */
.detail-script { background: #F9F0FF; border-radius: 8px; padding: 10px 12px; }
.detail-script .detail-label { margin-top: 0; color: #722ED1; }
.script-name { font-size: 13px; color: #531DAB; }

/* 时间轴 */
.detail-timeline { margin-top: 12px; }
.tl-item { display: flex; gap: 8px; margin-bottom: 10px; }
.tl-time {
  flex-shrink: 0; width: 50px; padding: 4px 0;
  font-size: 11px; font-weight: 700; color: #1677FF;
  text-align: center; background: #E6F4FF; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.tl-body { flex: 1; font-size: 12px; line-height: 1.7; }
.tl-source { color: #D48806; font-weight: 600; margin-bottom: 2px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.tl-effect { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: linear-gradient(135deg, #1677FF, #69B1FF); color: #fff; font-weight: 500; }
.tl-pace { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: linear-gradient(135deg, #FA8C16, #FFC069); color: #fff; font-weight: 500; }
.tl-content { color: #333; }
.tl-narration { color: #1677FF; font-style: italic; }
.tl-keep-audio {
  display: inline-block; padding: 0 6px;
  background: linear-gradient(135deg, #52c41a, #73d13d); color: #fff;
  border-radius: 8px; font-size: 10px; font-weight: 600;
  vertical-align: middle; margin-left: 6px;
}
.tl-marketing {
  display: inline-block; margin-top: 3px; padding: 1px 8px;
  background: linear-gradient(135deg, #FF4D4F, #FF7875); color: #fff;
  border-radius: 10px; font-size: 11px; font-weight: 600;
}
.tl-edit { color: #C41D7F; font-size: 11px; margin-top: 2px; }

/* 制作要点 */
.detail-notes { background: #FFFBE6; border-radius: 8px; padding: 10px 12px; }
.detail-notes .detail-label { margin-top: 0; color: #D48806; }
.notes-text { font-size: 13px; color: #AD6800; line-height: 1.6; }

/* 状态操作 */
.detail-actions {
  display: flex; align-items: center; gap: 6px; margin-top: 14px;
  padding-top: 12px; border-top: 1px solid #f0f0f0;
  flex-wrap: wrap;
}
.action-label { font-size: 12px; color: var(--text-hint); margin-right: 4px; }
.status-btn {
  padding: 4px 12px; border-radius: 14px;
  font-size: 12px; border: 1px solid var(--border);
  background: #fff; color: var(--text-secondary);
  cursor: pointer; transition: all 0.2s;
}
.status-btn:hover:not(:disabled) { border-color: #1677FF; color: #1677FF; }
.status-btn.active { opacity: 0.5; cursor: default; }
.status-btn.btn-completed:hover:not(:disabled) { border-color: #52c41a; color: #389E0D; }
.delete-plan-btn {
  padding: 4px 12px; border-radius: 14px;
  font-size: 12px; border: 1px solid #FFD6D6;
  background: #FFF2F0; color: #FF4D4F;
  cursor: pointer; transition: all 0.2s; margin-left: auto;
}
.delete-plan-btn:hover { background: #FF4D4F; color: #fff; }

.loading-state { display: flex; justify-content: center; padding: 60px; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; color: var(--text-hint); gap: 8px; }
.empty-hint { font-size: 12px; }

/* 混剪区域 */
.merge-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.merge-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bgm-select {
  padding: 6px 10px; border-radius: 16px; border: 1px solid #d9d9d9;
  font-size: 12px; background: #fafafa; cursor: pointer;
  outline: none; transition: all 0.2s;
}
.bgm-select:hover { border-color: #722ED1; }
.bgm-select:focus { border-color: #722ED1; box-shadow: 0 0 0 2px rgba(114,46,209,0.1); }
.bgm-select:disabled { opacity: 0.5; cursor: not-allowed; }
.merge-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 18px; border-radius: 18px;
  border: none; font-size: 13px; font-weight: 600;
  background: linear-gradient(135deg, #722ED1, #B37FEB);
  color: #fff; cursor: pointer;
  box-shadow: 0 2px 8px rgba(114,46,209,0.3);
  transition: all 0.2s;
}
.merge-btn:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(114,46,209,0.4); transform: translateY(-1px); }
.merge-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.merge-hint-ok { font-size: 12px; color: #389E0D; }
.merge-done-tag { font-size: 12px; color: #389E0D; font-weight: 600; }
.merge-fail-tag { font-size: 12px; color: #FF4D4F; }
.video-preview { margin-top: 12px; background: #000; border-radius: 10px; overflow: hidden; }
.preview-player { width: 100%; max-height: 400px; display: block; }
.video-actions { display: flex; justify-content: center; padding: 10px; background: #1a1a1a; }
.download-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 16px; border-radius: 16px;
  background: #1677FF; color: #fff; font-size: 13px; font-weight: 600;
  text-decoration: none; transition: all 0.2s;
}
.download-btn:hover { background: #4096FF; }

/* 3变体视频Tab */
.video-tabs-section { margin-top: 12px; }
.video-tab-bar {
  display: flex; gap: 6px; margin-bottom: 8px;
  overflow-x: auto; flex-wrap: nowrap;
}
.video-tab {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 16px;
  font-size: 12px; font-weight: 600; white-space: nowrap;
  border: 1.5px solid #e8e8e8; background: #fafafa;
  color: var(--text-secondary); cursor: pointer;
  transition: all 0.2s;
}
.video-tab:hover { border-color: #722ED1; color: #722ED1; }
.video-tab.active { background: linear-gradient(135deg, #722ED1, #B37FEB); color: #fff; border-color: transparent; }
.video-tab.tab-done { border-color: #b7eb8f; }
.video-tab.tab-failed { border-color: #ffa39e; }
.video-tab.tab-merging { border-color: #91d5ff; }
.tab-status-icon { font-size: 11px; }
.video-tab-content { min-height: 60px; }
.tab-merging-state {
  display: flex; align-items: center; gap: 8px;
  padding: 24px 16px; color: #1677FF; font-size: 13px;
  background: #E6F7FF; border-radius: 10px;
}
.tab-failed-state {
  padding: 16px; color: #FF4D4F; font-size: 13px;
  background: #FFF2F0; border-radius: 10px;
}
.tab-pending-state {
  padding: 16px; color: #999; font-size: 13px;
  background: #fafafa; border-radius: 10px;
}

/* 推送到千川按钮 */
.push-qc-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 16px; border-radius: 16px;
  background: linear-gradient(135deg, #FA541C, #FF7A45); color: #fff;
  font-size: 13px; font-weight: 600; border: none;
  cursor: pointer; transition: all 0.2s;
}
.push-qc-btn:hover:not(:disabled) { background: linear-gradient(135deg, #D4380D, #FA541C); transform: translateY(-1px); }
.push-qc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 推送弹窗 */
.push-modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.push-modal {
  background: #fff; border-radius: 16px; width: 100%; max-width: 420px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.2); overflow: hidden;
}
.push-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #f0f0f0;
}
.push-modal-title { font-size: 16px; font-weight: 700; }
.close-push-modal {
  background: none; border: none; font-size: 18px; color: #999;
  cursor: pointer; padding: 4px;
}
.push-modal-body { padding: 16px 20px; max-height: 400px; overflow-y: auto; }
.push-desc { font-size: 13px; color: #666; margin: 0 0 12px; }
.push-loading { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #999; padding: 20px 0; }
.account-list { display: flex; flex-direction: column; gap: 8px; }
.account-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px;
  border: 1.5px solid #e8e8e8; cursor: pointer;
  transition: all 0.2s; background: #fafafa;
}
.account-item:hover { border-color: #FA541C; background: #FFF7E6; }
.account-item.selected { border-color: #FA541C; background: #FFF2E8; }
.account-item input[type="checkbox"] { accent-color: #FA541C; width: 16px; height: 16px; }
.acc-name { font-size: 13px; font-weight: 600; color: #333; flex: 1; }
.acc-id { font-size: 11px; color: #999; }
.push-results { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.push-result-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-radius: 8px; font-size: 12px;
}
.push-result-item.success { background: #F6FFED; color: #389E0D; }
.push-result-item.fail { background: #FFF2F0; color: #FF4D4F; }
.push-modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid #f0f0f0;
}
.push-cancel-btn {
  padding: 8px 20px; border-radius: 20px; border: 1px solid #d9d9d9;
  background: #fff; color: #666; font-size: 13px; cursor: pointer;
}
.push-confirm-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 24px; border-radius: 20px; border: none;
  background: linear-gradient(135deg, #FA541C, #FF7A45); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 2px 8px rgba(250,84,28,0.3);
  transition: all 0.2s;
}
.push-confirm-btn:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(250,84,28,0.4); }
.push-confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 脚本规范 */
.script-spec-section { background: #fff; border-radius: 10px; margin: 16px 0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.script-spec-section .section-header-fixed { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
.spec-toggle { font-size: 12px; color: #1677FF; font-weight: 500; }
.spec-panel { padding: 0 16px 16px; }
.spec-textarea { width: 100%; border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px; font-size: 12px; line-height: 1.7; color: #1F2329; resize: vertical; font-family: inherit; outline: none; box-sizing: border-box; }
.spec-textarea:focus { border-color: #1677FF; box-shadow: 0 0 0 2px rgba(22,119,255,0.1); }
.spec-actions { display: flex; gap: 8px; margin-top: 8px; }
.spec-save-btn { padding: 6px 16px; background: #1677FF; color: #fff; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
.spec-save-btn:disabled { opacity: 0.5; }
.spec-reset-btn { padding: 6px 16px; background: #f5f6fa; color: #646A73; border: 1px solid #e5e6eb; border-radius: 6px; font-size: 12px; cursor: pointer; }

/* 详细脚本拍摄流程 */
.detail-script-flow { margin-top: 8px; }
.script-flow-btn { width: 100%; padding: 10px; background: linear-gradient(135deg, #F0F5FF, #E6F4FF); border: 1px solid #BAE0FF; border-radius: 8px; color: #1677FF; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.script-flow-btn:hover:not(:disabled) { background: linear-gradient(135deg, #E6F4FF, #D6E4FF); }
.script-flow-btn:disabled { opacity: 0.6; cursor: wait; }
.script-flow-content { margin-top: 10px; background: #FAFBFC; border: 1px solid #e5e6eb; border-radius: 8px; overflow: hidden; }
.script-flow-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #F0F5FF; font-size: 13px; font-weight: 600; color: #1F2329; }
.script-flow-close { background: none; border: none; color: #8F959E; cursor: pointer; font-size: 16px; }
.script-flow-body { padding: 14px; font-size: 12px; line-height: 1.8; color: #1F2329; max-height: 500px; overflow-y: auto; }
</style>
