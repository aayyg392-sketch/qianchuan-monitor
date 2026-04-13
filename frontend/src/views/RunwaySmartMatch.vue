<template>
  <div class="t2v-page">
    <!-- 顶部统计 -->
    <div class="stat-row">
      <div class="stat-card"><div class="stat-label">智能匹配总数</div><div class="stat-value blue">{{ stats.smart_match_count || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">素材库复用率</div><div class="stat-value green">{{ reuseRate }}%</div></div>
      <div class="stat-card"><div class="stat-label">节省Credits</div><div class="stat-value orange">{{ savedCredits }}</div></div>
      <div class="stat-card"><div class="stat-label">素材库总量</div><div class="stat-value purple">37,517</div></div>
    </div>

    <!-- 主工作区：左侧编辑 + 右侧历史 -->
    <div class="workspace">
      <!-- 左侧：创建面板 -->
      <div class="editor-panel">
        <!-- 流程提示 -->
        <div class="flow-bar">
          <span class="flow-step"><em>1</em>AI分镜</span>
          <span class="flow-arrow">→</span>
          <span class="flow-step"><em>2</em>素材匹配</span>
          <span class="flow-arrow">→</span>
          <span class="flow-step"><em>3</em>Runway补充</span>
          <span class="flow-arrow">→</span>
          <span class="flow-step"><em>4</em>合成视频</span>
        </div>

        <!-- 场景描述 -->
        <div class="prompt-section">
          <textarea v-model="form.scene_desc" class="prompt-input" rows="5" placeholder="描述你想要的视频场景...\n如：换季敏感肌洁面教程、产品开箱测评、使用前后对比..."></textarea>
          <div class="prompt-count">{{ (form.scene_desc || '').length }}/2000</div>
        </div>

        <!-- 设置栏 -->
        <div class="settings-bar">
          <div class="setting-item">
            <span class="setting-icon">🎞</span>
            <select v-model.number="form.clip_count" class="setting-select">
              <option :value="3">3镜头</option>
              <option :value="5">5镜头</option>
              <option :value="7">7镜头</option>
            </select>
          </div>
          <div class="setting-item">
            <span class="setting-icon">⏱</span>
            <select v-model.number="form.duration" class="setting-select">
              <option :value="5">5s</option>
              <option :value="10">10s</option>
              <option :value="15">15s</option>
            </select>
          </div>
          <label class="setting-item tts-toggle">
            <input type="checkbox" v-model="form.add_tts" />
            <span>口播</span>
          </label>
          <div class="setting-spacer"></div>
          <div class="credits-info">预估 {{ estimatedCredits }} credits</div>
        </div>

        <!-- 生成按钮 -->
        <div class="action-bar">
          <button class="btn-generate" @click="analyzeMatch" :disabled="analyzing">
            {{ analyzing ? 'AI分析中...' : '🧠 AI分镜 + 智能匹配' }}
          </button>
        </div>

        <!-- 分镜方案预览（在左侧面板内） -->
        <div v-if="matchResult" class="match-preview">
          <div class="mp-header">
            <span class="mp-title">📽️ AI分镜方案</span>
            <span class="mp-tag green">素材库 {{ matchResult.stats?.from_library || 0 }}</span>
            <span class="mp-tag orange">Runway {{ matchResult.stats?.from_runway || 0 }}</span>
          </div>
          <div v-if="matchResult.script" class="mp-script">"{{ matchResult.script }}"</div>
          <div class="mp-shots">
            <div v-for="(shot, i) in matchResult.matched_clips" :key="i" class="mp-shot">
              <div class="shot-head">
                <span class="shot-idx">{{ i + 1 }}</span>
                <span class="shot-time">{{ shot.time }}</span>
                <span class="shot-src" :class="shot.source">{{ shot.source === 'minio' ? '📦素材库' : '🎬Runway' }}</span>
              </div>
              <div class="shot-desc">{{ shot.desc_cn }}</div>
            </div>
          </div>
          <div class="mp-actions">
            <button class="btn-generate" @click="generateVideo" :disabled="generating">
              {{ generating ? '合成中...' : '🚀 开始合成' }}
            </button>
            <button class="btn-reset" @click="matchResult = null">重新生成</button>
          </div>
        </div>
      </div>

      <!-- 右侧：匹配记录 -->
      <div class="history-panel">
        <div class="history-title">匹配记录</div>
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="tasks.length === 0" class="empty">暂无记录</div>
        <div v-else class="history-list">
          <div v-for="t in tasks" :key="t.id" class="history-card" :class="'s-' + t.status">
            <div class="hc-header">
              <span class="hc-id">#{{ t.id }}</span>
              <span class="hc-badge">{{ getClipStats(t) }}</span>
              <span class="hc-status">{{ statusMap[t.status] }}</span>
              <span class="hc-time">{{ formatTime(t.created_at) }}</span>
            </div>
            <div v-if="getScript(t).script" class="hc-prompt">"{{ getScript(t).script }}"</div>
            <div class="hc-meta">{{ t.duration }}s | {{ t.cost_credits }} credits</div>
            <div v-if="t.error_msg" class="hc-error">❌ {{ t.error_msg }}</div>
            <div v-if="t.video_url && t.status === 'done'" class="hc-video">
              <video :src="getVideoUrl(t.video_url)" controls preload="metadata"></video>
            </div>
            <div v-if="t.status === 'generating' || t.status === 'composing'" class="hc-generating">
              <div class="pulse-dot"></div> {{ t.status === 'composing' ? '合成中...' : '生成中...' }}
            </div>
          </div>
        </div>
        <div v-if="total > pageSize" class="pagination">
          <button :disabled="page<=1" @click="page--;loadTasks()">上一页</button>
          <span>{{ page }}/{{ Math.ceil(total/pageSize) }}</span>
          <button :disabled="page>=Math.ceil(total/pageSize)" @click="page++;loadTasks()">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const stats = ref({})
const tasks = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const analyzing = ref(false)
const generating = ref(false)
const matchResult = ref(null)
let pollTimer = null

const form = ref({ scene_desc: '', clip_count: 5, duration: 5, add_tts: true })
const statusMap = { pending: '等待中', generating: '生成中', composing: '合成中', done: '已完成', failed: '失败' }
const reuseRate = computed(() => { const t = stats.value.smart_match_count || 0; return t > 0 ? 65 : 0 })
const savedCredits = computed(() => Math.round((stats.value.smart_match_count || 0) * 15))
const estimatedCredits = computed(() => form.value.clip_count * 5)

const formatTime = (t) => dayjs(t).format('MM-DD HH:mm')
const getVideoUrl = (url) => url?.startsWith('http') ? url : url
const getScript = (t) => { try { return typeof t.script_text === 'string' ? JSON.parse(t.script_text) : (t.script_text || {}) } catch { return {} } }
const getClipStats = (t) => {
  try {
    const clips = typeof t.matched_clips === 'string' ? JSON.parse(t.matched_clips) : (t.matched_clips || [])
    const lib = clips.filter(c => c.source === 'minio').length
    return `素材库${lib} + Runway${clips.length - lib}`
  } catch { return '' }
}

const loadStats = async () => { try { const r = await request.get('/runway/stats'); stats.value = r?.data || {} } catch {} }
const loadTasks = async () => {
  loading.value = true
  try {
    const r = await request.get('/runway/list', { params: { page: page.value, page_size: pageSize, task_type: 'smart_match' } })
    tasks.value = r?.data?.list || []; total.value = r?.data?.total || 0
  } catch {} finally { loading.value = false }
}

const analyzeMatch = async () => {
  analyzing.value = true
  try {
    const r = await request.post('/runway/smart-match', form.value)
    if (r?.code === 0) {
      matchResult.value = r.data
      loadTasks(); loadStats()
    } else { alert(r?.msg || '分析失败') }
  } catch (e) { alert('请求失败: ' + e.message) } finally { analyzing.value = false }
}

const generateVideo = async () => {
  if (!matchResult.value?.id) return
  generating.value = true
  try {
    const r = await request.post(`/runway/smart-match/${matchResult.value.id}/generate`)
    if (r?.code === 0) {
      alert('视频合成已启动，请稍后查看结果')
      loadTasks()
    } else { alert(r?.msg || '合成失败') }
  } catch (e) { alert(e.message) } finally { generating.value = false }
}

onMounted(() => {
  loadStats(); loadTasks()
  pollTimer = setInterval(() => {
    if (tasks.value.some(t => ['generating','composing','pending'].includes(t.status))) { loadTasks(); loadStats() }
  }, 8000)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.t2v-page { max-width: 1200px; }
.stat-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 10px; padding: 14px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.stat-label { font-size: 12px; color: #8c8c8c; margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-value.blue { color: #1677ff; } .stat-value.green { color: #52c41a; } .stat-value.orange { color: #fa8c16; } .stat-value.purple { color: #722ed1; }

/* 主工作区 */
.workspace { display: flex; gap: 16px; align-items: flex-start; }

/* 左侧编辑面板 */
.editor-panel { width: 380px; flex-shrink: 0; background: #1a1a2e; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }

/* 流程提示 */
.flow-bar { display: flex; align-items: center; gap: 4px; padding: 10px; background: rgba(124,92,252,0.1); border-radius: 8px; flex-wrap: wrap; }
.flow-step { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #aaa; }
.flow-step em { width: 18px; height: 18px; border-radius: 50%; background: #7c5cfc; color: #fff; font-size: 10px; font-weight: 700; font-style: normal; display: inline-flex; align-items: center; justify-content: center; }
.flow-arrow { color: #555; font-size: 12px; }

/* Prompt */
.prompt-section { position: relative; }
.prompt-input { width: 100%; background: #12122a; border: 1px solid #333; border-radius: 10px; padding: 14px; color: #e0e0e0; font-size: 14px; line-height: 1.6; resize: vertical; min-height: 120px; box-sizing: border-box; font-family: inherit; }
.prompt-input::placeholder { color: #555; }
.prompt-input:focus { border-color: #7c5cfc; outline: none; }
.prompt-count { position: absolute; bottom: 10px; right: 12px; color: #555; font-size: 11px; }

/* 设置栏 */
.settings-bar { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #2a2a3a; }
.setting-item { display: flex; align-items: center; gap: 4px; }
.setting-icon { font-size: 14px; }
.setting-select { background: #2a2a4a; border: 1px solid #333; color: #ccc; border-radius: 4px; padding: 4px 8px; font-size: 12px; }
.tts-toggle { font-size: 12px; color: #888; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.tts-toggle input { accent-color: #7c5cfc; }
.setting-spacer { flex: 1; }
.credits-info { font-size: 11px; color: #666; }

/* 操作栏 */
.action-bar { display: flex; gap: 10px; }
.btn-generate { flex: 1; padding: 12px; background: linear-gradient(135deg, #13c2c2, #36cfc9); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .2s; }
.btn-generate:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(19,194,194,0.4); transform: translateY(-1px); }
.btn-generate:disabled { opacity: 0.4; cursor: not-allowed; }

/* 分镜方案预览 */
.match-preview { padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid #2a2a3a; border-radius: 10px; }
.mp-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.mp-title { font-size: 13px; font-weight: 600; color: #e0e0e0; }
.mp-tag { font-size: 10px; padding: 2px 8px; border-radius: 4px; }
.mp-tag.green { background: rgba(82,196,26,0.15); color: #52c41a; }
.mp-tag.orange { background: rgba(250,140,22,0.15); color: #fa8c16; }
.mp-script { font-size: 12px; color: #7c5cfc; font-style: italic; margin-bottom: 8px; padding: 8px; background: rgba(124,92,252,0.08); border-radius: 6px; }
.mp-shots { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; max-height: 240px; overflow-y: auto; }
.mp-shot { padding: 8px 10px; background: #12122a; border-radius: 6px; border: 1px solid #2a2a3a; }
.shot-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.shot-idx { width: 18px; height: 18px; border-radius: 50%; background: #333; color: #ccc; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.shot-time { font-size: 10px; color: #666; }
.shot-src { font-size: 10px; margin-left: auto; }
.shot-src.minio { color: #52c41a; } .shot-src.runway { color: #fa8c16; }
.shot-desc { font-size: 11px; color: #999; line-height: 1.4; }
.mp-actions { display: flex; gap: 8px; }
.btn-reset { padding: 10px 16px; background: transparent; color: #888; border: 1px solid #333; border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn-reset:hover { border-color: #555; color: #ccc; }

/* 右侧历史面板 */
.history-panel { flex: 1; min-width: 0; background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); max-height: 80vh; overflow-y: auto; }
.history-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #333; }
.history-list { display: flex; flex-direction: column; gap: 12px; }
.history-card { border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px; }
.history-card.s-done { border-left: 3px solid #52c41a; }
.history-card.s-failed { border-left: 3px solid #ff4d4f; }
.history-card.s-generating, .history-card.s-composing { border-left: 3px solid #fa8c16; }
.hc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.hc-id { font-weight: 600; font-size: 13px; }
.hc-badge { font-size: 10px; padding: 2px 8px; background: #e6fffb; color: #13c2c2; border-radius: 3px; }
.hc-status { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 500; }
.s-done .hc-status { background: #f6ffed; color: #52c41a; }
.s-failed .hc-status { background: #fff2f0; color: #ff4d4f; }
.s-generating .hc-status, .s-composing .hc-status { background: #fff7e6; color: #fa8c16; }
.s-pending .hc-status { background: #f5f5f5; color: #999; }
.hc-time { font-size: 11px; color: #bbb; margin-left: auto; }
.hc-prompt { font-size: 12px; color: #1677ff; font-style: italic; line-height: 1.5; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hc-meta { font-size: 11px; color: #bbb; }
.hc-error { font-size: 11px; color: #ff4d4f; margin-top: 4px; }
.hc-video video { width: 100%; max-height: 240px; border-radius: 8px; margin-top: 8px; }
.hc-generating { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: #fa8c16; }
.pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #fa8c16; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.pagination { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 12px; }
.pagination button { padding: 4px 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; }
.pagination button:disabled { opacity: 0.4; }
.loading, .empty { text-align: center; padding: 30px; color: #bbb; font-size: 13px; }

@media (max-width: 768px) {
  .workspace { flex-direction: column; }
  .editor-panel { width: 100%; }
  .stat-row { grid-template-columns: repeat(2,1fr); }
}
</style>
