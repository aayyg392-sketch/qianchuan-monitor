<template>
  <div class="analysis-page">
    <!-- ① Sticky Top Nav -->
    <div class="top-nav">
      <button class="nav-back" @click="router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="nav-title">内容分析</span>
      <span class="nav-right"></span>
    </div>

    <!-- Loading State -->
    <div v-if="pageLoading" class="loading-overlay">
      <div class="loading-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-core">AI</div>
      </div>
      <div class="loading-text">AI 正在深度分析素材...</div>
      <div class="loading-steps">
        <div
          v-for="(step, i) in loadingSteps"
          :key="i"
          class="loading-step"
          :class="{ active: currentStep >= i, done: currentStep > i }"
        >
          <span class="step-icon">{{ currentStep > i ? '✓' : (currentStep === i ? '◉' : '○') }}</span>
          <span class="step-label">{{ step }}</span>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div v-if="!pageLoading && analysisData" class="page-body">
      <!-- ② Material Info Card -->
      <div class="card material-card">
        <div class="material-title">{{ material.title || '未命名素材' }}</div>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">消耗</div>
            <div class="metric-value blue">¥{{ formatNum(material.cost) }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">ROI</div>
            <div class="metric-value green">{{ formatRoi(material.roi) }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">CTR</div>
            <div class="metric-value purple">{{ formatPercent(material.ctr) }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">完播率</div>
            <div class="metric-value orange">{{ formatPercent(material.video_finish_rate) }}</div>
          </div>
        </div>
      </div>

      <!-- ③ Video Player + Interaction Timeline -->
      <div class="card video-chart-card">
        <div class="video-chart-layout">
          <div class="video-wrapper">
            <video
              ref="videoRef"
              :src="material.video_url"
              :poster="material.cover_url"
              controls
              playsinline
              preload="metadata"
              class="video-player"
            ></video>
          </div>
          <div class="chart-wrapper">
            <div class="chart-tabs">
              <button
                v-for="tab in chartTabs"
                :key="tab.key"
                class="chart-tab"
                :class="{ active: activeChartTab === tab.key }"
                @click="activeChartTab = tab.key; renderChart()"
              >{{ tab.label }}</button>
            </div>
            <div ref="chartRef" class="chart-container"></div>
            <div class="chart-info-bar" v-if="peakInfo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1677FF" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>{{ peakInfo }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ④ Script Section -->
      <div class="card script-card">
        <div class="card-header">
          <span class="card-title">本视频脚本</span>
        </div>
        <div class="script-tags" v-if="scriptFormulaTags.length">
          <span
            v-for="(tag, i) in scriptFormulaTags"
            :key="i"
            class="formula-tag"
            :class="tag.type"
          >{{ tag.text }}</span>
          <span v-if="scriptFormulaTags.length > 1" class="formula-join">+</span>
        </div>
        <div class="script-body" v-html="highlightedScript"></div>
        <div class="script-actions">
          <button class="btn-copy" @click="copyScript">复制脚本</button>
        </div>
      </div>

      <!-- ⑤ Creative Elements Table -->
      <div class="card elements-card">
        <div class="card-header">
          <span class="card-title">创意元素拆解</span>
        </div>
        <div class="table-scroll">
          <table class="elements-table">
            <thead>
              <tr>
                <th class="sticky-col"></th>
                <th>在什么场景拍</th>
                <th>用什么形式呈现</th>
                <th>产品功效</th>
                <th>适用人群</th>
                <th>适用场景</th>
                <th>用户痛点</th>
                <th>优惠活动</th>
                <th>产品卖点</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="sticky-col row-label">我的素材</td>
                <td>{{ creativeElements.scene_type || '-' }}</td>
                <td>{{ creativeElements.format_type || '-' }}</td>
                <td>{{ (creativeElements.selling_points || []).join('、') || '-' }}</td>
                <td>{{ creativeElements.target_audience || '-' }}</td>
                <td>{{ (creativeElements.use_scenarios || []).join('、') || '-' }}</td>
                <td>{{ (creativeElements.pain_points || []).join('、') || '-' }}</td>
                <td>{{ (creativeElements.trust_elements || []).join('、') || '-' }}</td>
                <td>{{ (creativeElements.selling_points || []).slice(0, 2).join('、') || '-' }}</td>
              </tr>
              <tr>
                <td class="sticky-col row-label">行业Top素材</td>
                <td>{{ industryRef.scene_type || '-' }}</td>
                <td>{{ industryRef.format_type || '-' }}</td>
                <td>{{ industryRef.selling_points || '-' }}</td>
                <td>{{ industryRef.target_audience || '-' }}</td>
                <td>{{ industryRef.use_scenarios || '-' }}</td>
                <td>{{ industryRef.pain_points || '-' }}</td>
                <td>{{ industryRef.trust_elements || '-' }}</td>
                <td>{{ industryRef.selling_points_short || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ⑥ Highlight Frames -->
      <div class="card highlights-card">
        <div class="card-header">
          <span class="card-title">高光画面</span>
          <span class="card-desc">点击帧图片可放大 · 支持文生视频和图生视频</span>
        </div>
        <div class="highlight-list">
          <div
            v-for="(frame, i) in highlightFrames"
            :key="i"
            class="highlight-item"
          >
            <!-- 帧图片 -->
            <div class="frame-visual" v-if="frame.frame_url || frame.frame_base64">
              <img
                :src="frame.frame_url || frame.frame_base64"
                class="frame-img"
                @click="previewImage = frame.frame_url || frame.frame_base64"
              />
              <span class="frame-time">{{ frame.timestamp }}</span>
            </div>
            <div class="highlight-top">
              <span class="timestamp-badge" v-if="!frame.frame_url && !frame.frame_base64">{{ frame.timestamp }}</span>
              <span
                class="impact-tag"
                :class="frame.ctr_impact"
              >{{ impactLabel(frame.ctr_impact) }}</span>
            </div>
            <div class="highlight-desc">{{ frame.description }}</div>
            <div class="highlight-why" v-if="frame.why_effective">
              <span class="why-label">为什么有效：</span>{{ frame.why_effective }}
            </div>
            <div class="highlight-prompt-toggle" @click="frame._expanded = !frame._expanded">
              <span>即梦提示词</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                :style="{ transform: frame._expanded ? 'rotate(180deg)' : 'rotate(0)' }"
              ><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div v-if="frame._expanded" class="highlight-prompt-body">
              {{ frame.jimeng_prompt }}
            </div>
            <div class="highlight-actions">
              <button class="btn-outline" @click="copyText(frame.jimeng_prompt)">复制提示词</button>
              <button class="btn-primary" @click="generateFromHighlight(frame)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10M6 14l6-6 6 6"/></svg>
                文生视频
              </button>
              <button
                v-if="frame.frame_url"
                class="btn-i2v"
                @click="generateI2V(frame)"
                :disabled="frame._i2vLoading"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                {{ frame._i2vLoading ? '提交中...' : '图生视频' }}
              </button>
            </div>
            <!-- 图生视频结果 -->
            <div v-if="frame._i2vResult" class="i2v-result">
              <span class="i2v-status" :class="frame._i2vResult.status">
                {{ frame._i2vResult.status === 'done' ? '✓ 生成完成' : frame._i2vResult.status === 'failed' ? '✕ 失败' : '⏳ 生成中...' }}
              </span>
              <a v-if="frame._i2vResult.video_url" :href="frame._i2vResult.video_url" target="_blank" class="btn-outline sm">下载视频</a>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片预览弹窗 -->
      <div v-if="previewImage" class="img-preview-overlay" @click="previewImage = null">
        <img :src="previewImage" class="img-preview" />
      </div>

      <!-- ⑦ Script Variations -->
      <div class="card variations-card">
        <div class="card-header">
          <span class="card-title">脚本裂变</span>
        </div>
        <div class="variation-list">
          <div
            v-for="(variation, i) in scriptVariations"
            :key="i"
            class="variation-item"
          >
            <div class="variation-header" @click="variation._expanded = !variation._expanded">
              <div class="variation-title-row">
                <span class="variation-name">{{ variation.target }}</span>
                <span class="variation-tag" :class="variationTagClass(i)">{{ variationStrategy(i) }}</span>
              </div>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"
                :style="{ transform: variation._expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }"
              ><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div v-if="variation._expanded" class="variation-body">
              <div class="variation-desc">{{ variation.description }}</div>
              <div class="variation-duration" v-if="variation.estimated_duration">
                预计时长：{{ variation.estimated_duration }}
              </div>
              <table class="variation-script-table">
                <thead>
                  <tr>
                    <th style="width:80px">时间</th>
                    <th>口播内容</th>
                    <th>画面</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, j) in variation.script" :key="j">
                    <td>{{ s.timestamp }}</td>
                    <td>{{ s.content }}</td>
                    <td>{{ s.visual }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="variation-actions">
                <button class="btn-copy" @click="copyVariationScript(variation)">复制脚本</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ⑧ Overall Assessment -->
      <div class="card assessment-card">
        <div class="card-header">
          <span class="card-title">整体评估</span>
        </div>
        <div class="assessment-body">
          <div class="score-circle-wrap">
            <div class="score-circle" :class="scoreClass">
              <span class="score-num">{{ overallAssessment.score || 0 }}</span>
              <span class="score-label">分</span>
            </div>
          </div>
          <div class="assessment-section" v-if="overallAssessment.strengths && overallAssessment.strengths.length">
            <div class="assess-subtitle green-text">优势</div>
            <div class="chips-wrap">
              <span class="chip green" v-for="(s, i) in overallAssessment.strengths" :key="i">{{ s }}</span>
            </div>
          </div>
          <div class="assessment-section" v-if="overallAssessment.weaknesses && overallAssessment.weaknesses.length">
            <div class="assess-subtitle red-text">不足</div>
            <div class="chips-wrap">
              <span class="chip red" v-for="(w, i) in overallAssessment.weaknesses" :key="i">{{ w }}</span>
            </div>
          </div>
          <div class="assessment-section" v-if="overallAssessment.optimization_suggestions && overallAssessment.optimization_suggestions.length">
            <div class="assess-subtitle">优化建议</div>
            <div class="suggestion-list">
              <div class="suggestion-item" v-for="(s, i) in overallAssessment.optimization_suggestions" :key="i">
                <span class="suggestion-idx">{{ i + 1 }}</span>
                <span>{{ s }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import * as echarts from 'echarts'
import request from '../utils/request'

const route = useRoute()
const router = useRouter()

// --- State ---
const pageLoading = ref(true)
const analysisData = ref(null)
const material = reactive({
  title: '',
  video_url: '',
  cover_url: '',
  cost: 0,
  roi: 0,
  ctr: 0,
  video_finish_rate: 0,
  video_play_count: 0,
  show_cnt: 0,
  click_cnt: 0,
})
const videoRef = ref(null)
const chartRef = ref(null)
let chartInstance = null
const activeChartTab = ref('click')
const currentStep = ref(0)

const loadingSteps = ['截取视频帧', '分析画面内容', '生成脚本拆解', '提炼高光画面']
const previewImage = ref(null)

const chartTabs = [
  { key: 'click', label: '整体点击次数' },
  { key: 'loss', label: '整体流失数' },
  { key: 'like', label: '整体点赞次数' },
  { key: 'comment', label: '整体评论次数' },
  { key: 'share', label: '整体转发次数' },
  { key: 'follow', label: '整体新增粉丝数' },
]

// --- Computed ---
const analysisJson = computed(() => {
  if (!analysisData.value) return null
  const raw = analysisData.value.analysis_json
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
})

const scriptBreakdown = computed(() => analysisJson.value?.script_breakdown || [])
const highlightFrames = computed(() => {
  // 优先用 highlights_json（包含 frame_url），fallback 到 analysis_json.highlight_frames
  let frames = []
  if (analysisData.value?.highlights_json) {
    const raw = analysisData.value.highlights_json
    frames = typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  if (!frames.length) {
    frames = analysisJson.value?.highlight_frames || []
  }
  return frames.map(f => reactive({ ...f, _expanded: false, _i2vLoading: false, _i2vResult: null }))
})
const creativeElements = computed(() => analysisJson.value?.creative_elements || {})
const scriptVariations = computed(() => {
  return (analysisJson.value?.script_variations || []).map(v => reactive({ ...v, _expanded: false }))
})
const interactionPeaks = computed(() => analysisJson.value?.interaction_peaks || [])
const overallAssessment = computed(() => analysisJson.value?.overall_assessment || {})

const scoreClass = computed(() => {
  const s = overallAssessment.value.score || 0
  if (s >= 8) return 'score-high'
  if (s >= 5) return 'score-mid'
  return 'score-low'
})

const peakInfo = computed(() => {
  const peaks = interactionPeaks.value.filter(p => p.type === 'attention_peak')
  if (!peaks.length) return ''
  const ts = peaks[0].timestamp
  const tabLabel = chartTabs.find(t => t.key === activeChartTab.value)?.label || '整体点击次数'
  return `${tabLabel}峰值在第${ts}秒，该峰值画面可用于视频混剪或指导后续创意制作`
})

const scriptFormulaTags = computed(() => {
  const tags = []
  const ce = creativeElements.value
  if (ce.pain_points && ce.pain_points.length) {
    tags.push({ text: '用户痛点', type: 'pain' })
  }
  if (ce.hook_type) {
    const hookMap = {
      '行动号召': 'cta',
      '健康痛点': 'pain',
      '价格优惠': 'cta',
      '产品展示': 'cta',
    }
    const hookText = ce.hook_type
    tags.push({ text: hookText, type: hookMap[hookText] || 'cta' })
  }
  return tags
})

const highlightedScript = computed(() => {
  const voiceovers = scriptBreakdown.value.map(s => s.voiceover).filter(Boolean)
  let text = voiceovers.join('')
  const ce = creativeElements.value
  const painPoints = ce.pain_points || []
  const hookType = ce.hook_type || ''
  painPoints.forEach(pp => {
    if (pp && text.includes(pp)) {
      text = text.replace(pp, `<span class="hl-pain">${pp}</span>`)
    }
  })
  if (hookType && text.includes(hookType)) {
    text = text.replace(hookType, `<span class="hl-cta">${hookType}</span>`)
  }
  return text
})

const industryRef = computed(() => {
  const assess = overallAssessment.value
  const suggestions = assess.optimization_suggestions || []
  return {
    scene_type: '工厂/实验室',
    format_type: '口播+产品展示',
    selling_points: '行业标杆成分、权威背书',
    target_audience: '25-45岁女性',
    use_scenarios: '日常护理、送礼',
    pain_points: '皮肤暗沉、衰老焦虑',
    trust_elements: '明星同款、销量认证',
    selling_points_short: '核心成分、效果对比',
  }
})

// --- Methods ---
function formatNum(v) {
  const n = parseFloat(v) || 0
  if (n >= 10000) return (n / 10000).toFixed(2) + '万'
  return n.toFixed(2)
}

function formatRoi(v) {
  const n = parseFloat(v) || 0
  return n.toFixed(2)
}

function formatPercent(v) {
  const n = parseFloat(v) || 0
  if (n > 1) return n.toFixed(2) + '%'
  return (n * 100).toFixed(2) + '%'
}

function impactLabel(impact) {
  const map = { high: '高影响', medium: '中影响', low: '低影响' }
  return map[impact] || impact
}

function variationTagClass(i) {
  return ['tag-blue', 'tag-green', 'tag-orange'][i] || 'tag-blue'
}

function variationStrategy(i) {
  return ['痛点前置', '直切产品', '价格机制'][i] || ''
}

function copyText(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    message.success('已复制到剪贴板')
  }).catch(() => {
    message.error('复制失败')
  })
}

function copyScript() {
  const voiceovers = scriptBreakdown.value.map(s => s.voiceover).filter(Boolean)
  copyText(voiceovers.join('\n'))
}

function copyVariationScript(variation) {
  const lines = (variation.script || []).map(s => `[${s.timestamp}] ${s.content} （画面：${s.visual}）`)
  copyText(lines.join('\n'))
}

async function generateFromHighlight(frame) {
  try {
    message.loading('正在提交文生视频任务...')
    await request.post('/material-analysis/generate-from-highlight', {
      highlights: [{ jimeng_prompt: frame.jimeng_prompt, duration: 5 }],
      model: 'jimeng',
    })
    message.success('文生视频任务已提交，请到AI文生视频查看进度')
  } catch {
    // Error handled by request interceptor
  }
}

async function generateI2V(frame) {
  if (!frame.frame_url) { message.warning('无帧图片'); return }
  frame._i2vLoading = true
  frame._i2vResult = null
  try {
    const res = await request.post('/material-analysis/image2video', {
      material_id: materialId,
      frame_url: frame.frame_url,
      prompt: frame.jimeng_prompt || '根据图片生成相似的短视频画面',
      model: 'jimeng',
      duration: 5,
    })
    const taskId = res.data?.task_id
    message.success('图生视频任务已提交')
    frame._i2vResult = { status: 'processing', task_id: taskId }
    // 轮询状态
    if (taskId) {
      const poll = setInterval(async () => {
        try {
          const st = await request.get(`/material-analysis/image2video/status/${taskId}`)
          const data = st.data
          if (data.status === 'done') {
            frame._i2vResult = { status: 'done', video_url: data.video_url }
            clearInterval(poll)
          } else if (data.status === 'failed') {
            frame._i2vResult = { status: 'failed', error: data.error_msg }
            clearInterval(poll)
          }
        } catch { /* ignore */ }
      }, 5000)
      // 3分钟超时
      setTimeout(() => clearInterval(poll), 180000)
    }
  } catch {
    frame._i2vResult = { status: 'failed' }
  } finally {
    frame._i2vLoading = false
  }
}

// --- Chart ---
function parseTimestamp(ts) {
  if (!ts) return 0
  const clean = ts.replace(/[^0-9:]/g, '')
  const parts = clean.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  if (parts.length === 1) return parseInt(parts[0])
  return 0
}

function generateChartData(tabKey) {
  const peaks = interactionPeaks.value
  const totalCount = parseInt(material.click_cnt) || parseInt(material.show_cnt) || 1000
  const videoDur = getVideoDuration()
  const seconds = Math.max(videoDur, 15)
  const xData = []
  const yData = []

  for (let i = 0; i <= seconds; i++) {
    xData.push(formatTimeLabel(i))
    yData.push(0)
  }

  // Distribute counts using gaussian-like around peaks
  const peakSeconds = peaks.map(p => parseTimestamp(p.timestamp))
  const sigma = Math.max(2, seconds / 10)

  // Scale factor based on tab type
  const scaleMap = { click: 1, loss: 0.6, like: 0.3, comment: 0.15, share: 0.1, follow: 0.05 }
  const scale = scaleMap[tabKey] || 1
  const scaledTotal = totalCount * scale

  if (peakSeconds.length === 0) {
    // Uniform with some noise
    const avg = scaledTotal / (seconds + 1)
    for (let i = 0; i <= seconds; i++) {
      yData[i] = Math.max(0, Math.round(avg * (0.5 + Math.random())))
    }
  } else {
    // Base level
    const baseLevel = scaledTotal * 0.3 / (seconds + 1)
    for (let i = 0; i <= seconds; i++) {
      yData[i] = baseLevel
    }
    // Add gaussian bumps at peaks
    const peakShare = scaledTotal * 0.7 / peakSeconds.length
    peakSeconds.forEach(ps => {
      for (let i = 0; i <= seconds; i++) {
        const dist = (i - ps)
        const gauss = Math.exp(-(dist * dist) / (2 * sigma * sigma))
        yData[i] += peakShare * gauss / (sigma * Math.sqrt(2 * Math.PI)) * sigma * 2.5
      }
    })
    // Normalize to match total
    const sum = yData.reduce((a, b) => a + b, 0)
    if (sum > 0) {
      const ratio = scaledTotal / sum
      for (let i = 0; i <= seconds; i++) {
        yData[i] = Math.round(yData[i] * ratio)
      }
    }
  }

  return { xData, yData, peakSeconds }
}

function formatTimeLabel(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

function getVideoDuration() {
  if (videoRef.value && videoRef.value.duration && isFinite(videoRef.value.duration)) {
    return Math.ceil(videoRef.value.duration)
  }
  // Estimate from script breakdown
  const breakdown = scriptBreakdown.value
  if (breakdown.length) {
    const last = breakdown[breakdown.length - 1]
    if (last.timestamp) {
      const parts = last.timestamp.split('-')
      const end = parts.length > 1 ? parts[1] : parts[0]
      return parseTimestamp(end) || 30
    }
  }
  return 30
}

function renderChart() {
  if (!chartRef.value) return
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }
  const { xData, yData, peakSeconds } = generateChartData(activeChartTab.value)

  const markPoints = peakSeconds
    .filter(ps => ps >= 0 && ps < xData.length)
    .map(ps => ({
      coord: [formatTimeLabel(ps), yData[ps]],
      value: '峰值',
      symbol: 'circle',
      symbolSize: 10,
      itemStyle: { color: '#52c41a' },
      label: {
        show: true,
        formatter: '峰值',
        color: '#52c41a',
        fontSize: 11,
        fontWeight: 'bold',
        position: 'top',
      },
    }))

  const option = {
    grid: { left: 45, right: 15, top: 25, bottom: 30 },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { fontSize: 10, color: '#999', interval: Math.max(1, Math.floor(xData.length / 8)) },
      axisLine: { lineStyle: { color: '#E8E8E8' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#F0F0F0' } },
    },
    series: [{
      type: 'line',
      data: yData,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#1677FF', width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(22,119,255,0.25)' },
          { offset: 1, color: 'rgba(22,119,255,0.02)' },
        ]),
      },
      markPoint: { data: markPoints },
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#E8E8E8',
      textStyle: { color: '#333', fontSize: 12 },
    },
  }
  chartInstance.setOption(option, true)
}

// --- Init ---
let pollTimer = null
let stepTimer = null

async function fetchMaterial() {
  const materialId = route.params.materialId
  const advertiserId = route.query.advertiser_id
  try {
    const res = await request.get(`/material-analysis/material-detail/${materialId}`, {
      params: { advertiser_id: advertiserId },
    })
    if (res.data) {
      Object.assign(material, res.data)
    }
  } catch {
    // Material info is supplementary, don't block page
  }
}

async function fetchAnalysis() {
  const materialId = route.params.materialId
  try {
    const res = await request.get(`/material-analysis/analysis/${materialId}`)
    const data = res.data
    if (data && data.status === 'done') {
      analysisData.value = data
      return true
    }
    return false
  } catch {
    return false
  }
}

async function triggerAnalysis() {
  const materialId = route.params.materialId
  const advertiserId = route.query.advertiser_id
  try {
    await request.post('/material-analysis/analyze', {
      material_id: materialId,
      advertiser_id: advertiserId,
    })
  } catch {
    // May already be analyzing
  }
}

function startStepAnimation() {
  currentStep.value = 0
  stepTimer = setInterval(() => {
    if (currentStep.value < loadingSteps.length - 1) {
      currentStep.value++
    }
  }, 3000)
}

function stopStepAnimation() {
  if (stepTimer) {
    clearInterval(stepTimer)
    stepTimer = null
  }
  currentStep.value = loadingSteps.length
}

async function initPage() {
  pageLoading.value = true
  startStepAnimation()

  await fetchMaterial()

  // Try cached first
  const cached = await fetchAnalysis()
  if (cached) {
    stopStepAnimation()
    pageLoading.value = false
    await nextTick()
    renderChart()
    return
  }

  // Trigger analysis and poll
  await triggerAnalysis()
  pollTimer = setInterval(async () => {
    const done = await fetchAnalysis()
    if (done) {
      clearInterval(pollTimer)
      pollTimer = null
      stopStepAnimation()
      pageLoading.value = false
      await nextTick()
      renderChart()
    }
  }, 3000)
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(() => {
  initPage()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (stepTimer) clearInterval(stepTimer)
  chartInstance?.dispose()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
/* Base */
.analysis-page {
  min-height: 100vh;
  background: #F5F6FA;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  color: #333;
  padding-bottom: 32px;
}

/* ① Top Nav */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  background: #fff;
  border-bottom: 1px solid #E8E8E8;
  padding: 0 12px;
}
.nav-back {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: #333;
  padding: 4px;
  border-radius: 6px;
}
.nav-back:active {
  background: #f0f0f0;
}
.nav-title {
  font-size: 16px;
  font-weight: 600;
}
.nav-right {
  width: 28px;
}

/* Page body */
.page-body {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Card */
.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.card-header {
  margin-bottom: 12px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

/* ② Material Card */
.material-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  line-height: 1.4;
}
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (min-width: 480px) {
  .metrics-grid {
    grid-template-columns: 1fr 1fr 1fr 1fr;
  }
}
.metric-item {
  background: #F8F9FB;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.metric-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}
.metric-value {
  font-size: 16px;
  font-weight: 700;
}
.metric-value.blue { color: #1677FF; }
.metric-value.green { color: #52c41a; }
.metric-value.purple { color: #722ED1; }
.metric-value.orange { color: #FA8C16; }

/* ③ Video + Chart */
.video-chart-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (min-width: 640px) {
  .video-chart-layout {
    flex-direction: row;
  }
  .video-wrapper {
    width: 280px;
    flex-shrink: 0;
  }
  .chart-wrapper {
    flex: 1;
    min-width: 0;
  }
}
.video-player {
  width: 100%;
  max-height: 400px;
  border-radius: 8px;
  background: #000;
  object-fit: contain;
}
.chart-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.chart-tab {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid #E8E8E8;
  background: #fff;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.chart-tab.active {
  background: #1677FF;
  color: #fff;
  border-color: #1677FF;
}
.chart-container {
  width: 100%;
  height: 220px;
}
.chart-info-bar {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: #EBF3FF;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: #1677FF;
  line-height: 1.4;
  margin-top: 8px;
}
.chart-info-bar svg {
  flex-shrink: 0;
  margin-top: 1px;
}

/* ④ Script */
.script-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.formula-tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
}
.formula-tag.pain {
  background: #E6F7E6;
  color: #389E0D;
}
.formula-tag.cta {
  background: #FFF1F0;
  color: #CF1322;
}
.formula-join {
  color: #999;
  font-size: 14px;
  font-weight: 600;
}
.script-body {
  font-size: 14px;
  line-height: 1.8;
  color: #444;
  margin-bottom: 12px;
  white-space: pre-wrap;
}
.script-body :deep(.hl-pain) {
  background: #E6F7E6;
  color: #389E0D;
  padding: 1px 4px;
  border-radius: 3px;
}
.script-body :deep(.hl-cta) {
  background: #FFF1F0;
  color: #CF1322;
  padding: 1px 4px;
  border-radius: 3px;
}
.script-actions {
  text-align: right;
}

/* Buttons */
.btn-copy {
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid #1677FF;
  background: #fff;
  color: #1677FF;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-copy:active {
  background: #EBF3FF;
}
.btn-outline {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid #D9D9D9;
  background: #fff;
  color: #666;
  cursor: pointer;
}
.btn-outline:active {
  background: #f5f5f5;
}
.btn-primary {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: #1677FF;
  color: #fff;
  cursor: pointer;
}
.btn-primary:active {
  background: #0E5DD6;
}

/* ⑤ Creative Elements Table */
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.elements-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.elements-table th {
  background: #F5F6FA;
  color: #666;
  font-weight: 500;
  padding: 8px 12px;
  border: 1px solid #E8E8E8;
  white-space: nowrap;
  text-align: left;
}
.elements-table td {
  padding: 8px 12px;
  border: 1px solid #E8E8E8;
  color: #444;
  min-width: 80px;
  max-width: 160px;
  word-break: break-all;
}
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
}
th.sticky-col {
  background: #F5F6FA;
}
.row-label {
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

/* ⑥ Highlights */
.highlight-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.highlight-item {
  border: 1px solid #F0F0F0;
  border-radius: 8px;
  padding: 12px;
}
.highlight-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.timestamp-badge {
  background: #1677FF;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.impact-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.impact-tag.high {
  background: #FFF1F0;
  color: #CF1322;
}
.impact-tag.medium {
  background: #FFF7E6;
  color: #D46B08;
}
.impact-tag.low {
  background: #F0F0F0;
  color: #999;
}
.highlight-desc {
  font-size: 14px;
  color: #333;
  margin-bottom: 6px;
  line-height: 1.5;
}
.highlight-why {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  line-height: 1.4;
}
.why-label {
  color: #666;
  font-weight: 500;
}
.highlight-prompt-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #1677FF;
  cursor: pointer;
  margin-bottom: 6px;
  user-select: none;
}
.highlight-prompt-toggle svg {
  transition: transform 0.2s;
}
.highlight-prompt-body {
  font-size: 12px;
  color: #666;
  background: #F8F9FB;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  line-height: 1.5;
  word-break: break-all;
}
.highlight-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* 帧图片 */
.frame-visual {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.frame-img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  display: block;
  border-radius: 8px;
  cursor: pointer;
}
.frame-img:hover { opacity: 0.85; }
.frame-time {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

/* 图生视频按钮 */
.btn-i2v {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1.5px solid #722ED1;
  background: linear-gradient(135deg, #F9F0FF, #EFE0FF);
  color: #722ED1;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-i2v:hover { background: linear-gradient(135deg, #F0E0FF, #E0D0FF); }
.btn-i2v:disabled { opacity: 0.5; cursor: not-allowed; }

/* 图生视频结果 */
.i2v-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 6px;
  background: #F7F8FA;
  border-radius: 6px;
  font-size: 12px;
}
.i2v-status { font-weight: 500; }
.i2v-status.done { color: #00B42A; }
.i2v-status.failed { color: #F53F3F; }
.i2v-status.processing { color: #1677FF; }
.btn-outline.sm { padding: 3px 10px; font-size: 11px; }

/* 图片预览 */
.img-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}
.img-preview {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 4px 30px rgba(0,0,0,0.4);
}

/* ⑦ Script Variations */
.variation-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.variation-item {
  border: 1px solid #F0F0F0;
  border-radius: 8px;
  overflow: hidden;
}
.variation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  cursor: pointer;
  user-select: none;
}
.variation-header:active {
  background: #FAFAFA;
}
.variation-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.variation-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.variation-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.tag-blue { background: #EBF3FF; color: #1677FF; }
.tag-green { background: #E6F7E6; color: #389E0D; }
.tag-orange { background: #FFF7E6; color: #D46B08; }
.variation-body {
  padding: 0 12px 12px;
}
.variation-desc {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  line-height: 1.5;
}
.variation-duration {
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
}
.variation-script-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 10px;
}
.variation-script-table th {
  background: #F5F6FA;
  color: #666;
  font-weight: 500;
  padding: 6px 10px;
  border: 1px solid #E8E8E8;
  text-align: left;
}
.variation-script-table td {
  padding: 6px 10px;
  border: 1px solid #E8E8E8;
  color: #444;
  line-height: 1.4;
}
.variation-actions {
  text-align: right;
}

/* ⑧ Assessment */
.assessment-body {
  text-align: center;
}
.score-circle-wrap {
  margin-bottom: 16px;
}
.score-circle {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 4px solid #E8E8E8;
}
.score-circle.score-high { border-color: #52c41a; }
.score-circle.score-mid { border-color: #FA8C16; }
.score-circle.score-low { border-color: #FF4D4F; }
.score-num {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}
.score-circle.score-high .score-num { color: #52c41a; }
.score-circle.score-mid .score-num { color: #FA8C16; }
.score-circle.score-low .score-num { color: #FF4D4F; }
.score-label {
  font-size: 12px;
  color: #999;
}
.assessment-section {
  text-align: left;
  margin-bottom: 14px;
}
.assess-subtitle {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
}
.assess-subtitle.green-text { color: #52c41a; }
.assess-subtitle.red-text { color: #FF4D4F; }
.chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 14px;
  line-height: 1.3;
}
.chip.green {
  background: #E6F7E6;
  color: #389E0D;
}
.chip.red {
  background: #FFF1F0;
  color: #CF1322;
}
.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #444;
  line-height: 1.5;
}
.suggestion-idx {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #1677FF;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

/* Loading */
.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 48px);
  padding: 40px 20px;
}
.loading-spinner {
  position: relative;
  width: 80px;
  height: 80px;
  margin-bottom: 20px;
}
.spinner-ring {
  position: absolute;
  inset: 0;
  border: 3px solid #E8E8E8;
  border-top-color: #1677FF;
  border-radius: 50%;
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner-core {
  position: absolute;
  inset: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1677FF;
  border-radius: 50%;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}
.loading-text {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
}
.loading-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.loading-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #CCC;
  transition: color 0.3s;
}
.loading-step.active {
  color: #1677FF;
  font-weight: 500;
}
.loading-step.done {
  color: #52c41a;
}
.step-icon {
  font-size: 14px;
}
</style>
