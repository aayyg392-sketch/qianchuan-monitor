<template>
  <div class="remix-page">
    <!-- 顶部返回栏 -->
    <div class="remix-topbar">
      <button class="back-btn" @click="$router.back()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="topbar-title">AI 翻剪推荐</span>
      <span class="topbar-right"></span>
    </div>

    <!-- 素材基本信息 -->
    <div v-if="material" class="material-info-card">
      <div class="material-header">
        <div class="material-cover" v-if="material.cover_url">
          <img :src="material.cover_url" alt="" />
        </div>
        <div class="material-meta">
          <div class="material-name">{{ material.title || '未命名素材' }}</div>
          <div class="material-stats-row">
            <span class="mini-stat"><span class="mini-label">消耗</span><span class="mini-val blue">¥{{ formatNum(material.cost) }}</span></span>
            <span class="mini-stat"><span class="mini-label">ROI</span><span class="mini-val green">{{ formatRoi(material.roi) }}</span></span>
            <span class="mini-stat"><span class="mini-label">成交</span><span class="mini-val orange">{{ formatInt(material.pay_order_count) }}单</span></span>
          </div>
          <div class="material-stats-row">
            <span class="mini-stat"><span class="mini-label">GMV</span><span class="mini-val">¥{{ formatNum(material.pay_order_amount) }}</span></span>
            <span class="mini-stat"><span class="mini-label">CTR</span><span class="mini-val">{{ material.ctr ? (parseFloat(material.ctr) * 100).toFixed(2) + '%' : '-' }}</span></span>
            <span class="mini-stat"><span class="mini-label">千元出单</span><span class="mini-val">{{ formatRoi(material.orders_per_1k_cost) }}</span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-card">
      <div class="loading-animation">
        <div class="pulse-ring"></div>
        <div class="pulse-core">AI</div>
      </div>
      <div class="loading-text">AI 正在深度分析素材数据</div>
      <div class="loading-sub">结合行业热点生成翻剪脚本中...</div>
    </div>

    <!-- AI分析结果 -->
    <div v-if="result && !loading" class="result-container">
      <!-- 评分卡片 -->
      <div class="score-card" :class="getScoreClass(result.score)">
        <div class="score-circle">
          <span class="score-num">{{ result.score }}</span>
          <span class="score-unit">分</span>
        </div>
        <div class="score-label">{{ result.level }}</div>
      </div>

      <!-- 素材优秀之处 -->
      <div v-if="result.strengths && result.strengths.length" class="section-card">
        <div class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52c41a" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          素材优秀之处
        </div>
        <div class="list-items green">
          <div class="list-item" v-for="(s, i) in result.strengths" :key="i">
            <span class="dot"></span>
            <span>{{ s }}</span>
          </div>
        </div>
      </div>

      <!-- 建议调整 -->
      <div v-if="result.adjustments && result.adjustments.length" class="section-card">
        <div class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fa8c16" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          建议调整
        </div>
        <div class="list-items orange">
          <div class="list-item" v-for="(a, i) in result.adjustments" :key="i">
            <span class="dot"></span>
            <span>{{ a }}</span>
          </div>
        </div>
      </div>

      <!-- 行业热点 -->
      <div v-if="result.hot_topic" class="section-card">
        <div class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eb2f96" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          结合行业热点
        </div>
        <div class="hot-topic-badge">🔥 {{ result.hot_topic }}</div>
      </div>

      <!-- 翻剪新脚本 -->
      <div v-if="result.new_script" class="section-card script-card-section">
        <div class="section-title purple">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#722ED1" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          翻剪新脚本
        </div>

        <div class="script-card">
          <div class="script-title-row">📹 {{ result.new_script.title }}</div>

          <!-- 黄金Hook -->
          <div v-if="result.new_script.hook" class="hook-box">
            <div class="hook-label">🎣 黄金Hook（前3秒）</div>
            <div class="hook-text">{{ result.new_script.hook }}</div>
          </div>

          <!-- 分镜脚本 -->
          <div v-if="result.new_script.scenes" class="scenes-container">
            <div class="scene-card" v-for="(scene, i) in result.new_script.scenes" :key="i">
              <div class="scene-time-badge">{{ scene.time }}</div>
              <div class="scene-detail">
                <div class="scene-row">
                  <span class="scene-icon">🎬</span>
                  <span class="scene-text">{{ scene.content }}</span>
                </div>
                <div class="scene-row narration">
                  <span class="scene-icon">🎙️</span>
                  <span class="scene-text">{{ scene.narration }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 转化引导 -->
          <div v-if="result.new_script.cta" class="cta-box">
            <div class="cta-label">💡 转化引导</div>
            <div class="cta-text">{{ result.new_script.cta }}</div>
          </div>
        </div>
      </div>

      <!-- 重新生成 -->
      <div class="action-bar">
        <button class="regenerate-btn" @click="runAnalysis" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          重新生成脚本
        </button>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-if="error && !loading" class="error-card">
      <div class="error-text">{{ error }}</div>
      <button class="retry-btn" @click="runAnalysis">重试</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import request from '../utils/request'

const route = useRoute()
const materialId = route.params.id

const material = ref(null)
const loading = ref(false)
const result = ref(null)
const error = ref(null)

function formatNum(v) { const n = parseFloat(v) || 0; return n >= 10000 ? (n / 10000).toFixed(2) + '万' : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatRoi(v) { const n = parseFloat(v); return isNaN(n) ? '-' : n.toFixed(2) }
function formatInt(v) { const n = parseInt(v) || 0; return n.toLocaleString() }
function getScoreClass(score) { if (score >= 80) return 'level-good'; if (score >= 60) return 'level-ok'; if (score >= 40) return 'level-mid'; return 'level-bad' }

async function loadMaterial() {
  try {
    const res = await request.get('/materials', { params: { page: 1, pageSize: 1, material_id: materialId } })
    if (res.data?.items?.length) {
      material.value = res.data.items[0]
    }
  } catch (e) { console.error('加载素材信息失败', e) }
}

async function runAnalysis() {
  loading.value = true
  error.value = null
  result.value = null
  try {
    const res = await request.post('/materials/' + materialId + '/ai-check')
    if (res.data) {
      result.value = res.data
    } else {
      error.value = res.msg || '分析失败'
    }
  } catch (e) {
    error.value = '分析请求失败，请重试'
    console.error('AI翻剪推荐失败', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadMaterial()
  runAnalysis()
})
</script>

<style scoped>
.remix-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #F5F0FF 0%, #F7F8FA 120px);
  padding-bottom: calc(var(--tabnav-h, 0px) + var(--safe-b, 0px) + 24px);
}

/* 顶部栏 */
.remix-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: var(--header-h, 0);
  z-index: 10;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--c-primary, #1677FF);
  font-size: 14px;
  cursor: pointer;
}
.topbar-title {
  font-size: 15px;
  font-weight: 600;
  color: #531DAB;
}
.topbar-right { width: 60px; }

/* 素材信息卡片 */
.material-info-card {
  margin: 12px 14px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.material-header {
  display: flex;
  gap: 12px;
}
.material-cover {
  width: 72px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0f0f0;
}
.material-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.material-meta { flex: 1; min-width: 0; }
.material-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.material-stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}
.mini-stat { display: flex; flex-direction: column; gap: 2px; }
.mini-label { font-size: 11px; color: var(--text-hint); }
.mini-val { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.mini-val.blue { color: #1677FF; }
.mini-val.green { color: #52c41a; }
.mini-val.orange { color: #fa8c16; }

/* 加载动画 */
.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
}
.loading-animation {
  position: relative;
  width: 80px;
  height: 80px;
  margin-bottom: 20px;
}
.pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid #722ED1;
  animation: pulse-ring 1.5s ease-out infinite;
}
@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.4); opacity: 0; }
}
.pulse-core {
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, #722ED1, #9254DE);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse-core 1.5s ease-in-out infinite;
}
@keyframes pulse-core {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
.loading-text {
  font-size: 16px;
  font-weight: 600;
  color: #531DAB;
  margin-bottom: 6px;
}
.loading-sub {
  font-size: 13px;
  color: var(--text-hint);
}

/* 结果容器 */
.result-container {
  padding: 0 14px;
}

/* 评分卡片 */
.score-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 12px;
}
.score-card.level-good { background: linear-gradient(135deg, #F6FFED, #D9F7BE); }
.score-card.level-ok { background: linear-gradient(135deg, #E6F7FF, #BAE0FF); }
.score-card.level-mid { background: linear-gradient(135deg, #FFF7E6, #FFE7BA); }
.score-card.level-bad { background: linear-gradient(135deg, #FFF2F0, #FFCCC7); }
.score-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: baseline;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.score-num { font-size: 24px; font-weight: 800; color: #333; }
.score-unit { font-size: 12px; color: var(--text-hint); margin-left: 1px; }
.score-label { font-size: 18px; font-weight: 700; color: #333; }
.level-good .score-label { color: #389E0D; }
.level-ok .score-label { color: #1677FF; }
.level-mid .score-label { color: #D48806; }
.level-bad .score-label { color: #CF1322; }

/* 通用段落卡片 */
.section-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.section-title.purple { color: #531DAB; }

/* 列表项 */
.list-items { display: flex; flex-direction: column; gap: 8px; }
.list-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  line-height: 1.7;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 9px;
}
.list-items.green .list-item { color: #389E0D; }
.list-items.green .dot { background: #52c41a; }
.list-items.orange .list-item { color: #D46B08; }
.list-items.orange .dot { background: #fa8c16; }

/* 热点标签 */
.hot-topic-badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, #FFF0F6, #FFD6E7);
  color: #C41D7F;
  font-size: 14px;
  font-weight: 600;
}

/* 脚本卡片 */
.script-card {
  background: linear-gradient(135deg, #F9F0FF 0%, #F0F5FF 100%);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #D3ADF7;
}
.script-title-row {
  font-size: 16px;
  font-weight: 800;
  color: #531DAB;
  margin-bottom: 14px;
}

/* Hook */
.hook-box {
  background: #FFF0F6;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-left: 4px solid #EB2F96;
}
.hook-label {
  font-size: 13px;
  font-weight: 700;
  color: #C41D7F;
  margin-bottom: 4px;
}
.hook-text {
  font-size: 14px;
  color: #AD2067;
  line-height: 1.7;
}

/* 分镜 */
.scenes-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.scene-card {
  display: flex;
  gap: 10px;
  background: rgba(255,255,255,0.7);
  border-radius: 10px;
  padding: 10px 12px;
}
.scene-time-badge {
  flex-shrink: 0;
  width: 52px;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 800;
  color: #722ED1;
  text-align: center;
  background: #F0E6FF;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
}
.scene-detail { flex: 1; }
.scene-row {
  display: flex;
  gap: 6px;
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 4px;
}
.scene-row:last-child { margin-bottom: 0; }
.scene-icon { flex-shrink: 0; }
.scene-text { flex: 1; }
.scene-row.narration .scene-text {
  color: #1677FF;
  font-style: italic;
}

/* CTA */
.cta-box {
  background: #FFFBE6;
  border-radius: 10px;
  padding: 12px 14px;
  border-left: 4px solid #FAAD14;
}
.cta-label {
  font-size: 13px;
  font-weight: 700;
  color: #D48806;
  margin-bottom: 4px;
}
.cta-text {
  font-size: 14px;
  color: #AD6800;
  line-height: 1.7;
}

/* 操作栏 */
.action-bar {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}
.regenerate-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 28px;
  border-radius: 24px;
  border: 1px solid #722ED1;
  background: linear-gradient(135deg, #F9F0FF, #EFE0FF);
  color: #722ED1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(114,46,209,0.15);
}
.regenerate-btn:hover { background: linear-gradient(135deg, #722ED1, #9254DE); color: #fff; }
.regenerate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 错误 */
.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  gap: 16px;
}
.error-text { font-size: 14px; color: #FF4D4F; }
.retry-btn {
  padding: 8px 24px;
  border-radius: 20px;
  border: 1px solid #FF4D4F;
  background: #FFF2F0;
  color: #FF4D4F;
  font-size: 14px;
  cursor: pointer;
}
</style>
