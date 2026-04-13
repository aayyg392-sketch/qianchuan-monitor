<template>
  <div class="i2v-page">
    <div class="stat-row">
      <div class="stat-card"><div class="stat-label">图生视频总数</div><div class="stat-value blue">{{ stats.image2video_count || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">生成成功</div><div class="stat-value green">{{ stats.done_count || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">今日生成</div><div class="stat-value orange">{{ stats.today_count || 0 }}</div></div>
      <div class="stat-card"><div class="stat-label">累计消耗Credits</div><div class="stat-value purple">{{ stats.total_credits || 0 }}</div></div>
    </div>

    <div class="workspace">
      <!-- 左侧编辑面板 -->
      <div class="editor-panel">
        <!-- 多图上传区 -->
        <div class="frame-section">
          <div class="frame-main" @click="triggerUpload(0)">
            <input :ref="el => fileInputs[0] = el" type="file" accept="image/*" style="display:none" @change="e => onFileChange(e, 0)" />
            <template v-if="!images[0].url && !images[0].uploading">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <span class="frame-label">Start Frame</span>
              <div class="frame-actions"><span class="frame-btn">Upload</span></div>
            </template>
            <div v-if="images[0].uploading" class="frame-loading"><div class="spinner"></div></div>
            <template v-if="images[0].url && !images[0].uploading">
              <img :src="getFullUrl(images[0].url)" class="frame-thumb" />
              <div class="frame-overlay" @click.stop="removeImg(0)">✕ 移除</div>
              <div class="frame-tag">主图</div>
            </template>
          </div>
          <!-- 额外角度小图 -->
          <div class="frame-extras">
            <div v-for="idx in extraSlots" :key="idx" class="extra-slot" @click="triggerUpload(idx)">
              <input :ref="el => fileInputs[idx] = el" type="file" accept="image/*" style="display:none" @change="e => onFileChange(e, idx)" />
              <template v-if="!images[idx]?.url && !images[idx]?.uploading">
                <span class="extra-icon">+</span>
                <span class="extra-label">侧面{{ idx }}</span>
              </template>
              <div v-if="images[idx]?.uploading" class="frame-loading"><div class="spinner-sm"></div></div>
              <template v-if="images[idx]?.url && !images[idx]?.uploading">
                <img :src="getFullUrl(images[idx].url)" class="extra-thumb" />
                <div class="extra-del" @click.stop="removeImg(idx)">✕</div>
              </template>
            </div>
            <div v-if="images.length < 6" class="extra-slot extra-add" @click="addSlot">
              <span class="extra-icon">+</span>
              <span class="extra-label">添加</span>
            </div>
          </div>
          <div class="frame-hint">上传多张不同角度图片，视频展示更自然</div>
        </div>

        <!-- Prompt -->
        <div class="prompt-section">
          <div class="prompt-label-row">
            <span class="prompt-label">场景描述</span>
            <button class="btn-ai-gen" @click="analyzeImages" :disabled="analyzing || uploadedCount === 0">
              {{ analyzing ? '⏳ 生成中...' : '🤖 AI生成' }}
            </button>
          </div>
          <textarea v-model="prompt" class="prompt-input" rows="4" placeholder="描述视频画面，或点击 AI生成 自动填写...\n如：人物把手中洗面奶挤出，在手中揉搓起泡，然后将泡沫放上脸庞揉洗"></textarea>
          <div class="prompt-count">{{ (prompt || '').length }}/5000</div>
        </div>

        <!-- 设置栏 -->
        <div class="settings-bar">
          <div class="setting-item">
            <span class="setting-icon">📐</span>
            <select v-model="form.ratio" class="setting-select">
              <option value="720:1280">9:16</option>
              <option value="1280:720">16:9</option>
              <option value="1024:1024">1:1</option>
            </select>
          </div>
          <div class="setting-item">
            <span class="setting-icon">⏱</span>
            <select v-model.number="form.duration" class="setting-select">
              <option :value="5">5s</option>
              <option :value="10">10s</option>
            </select>
          </div>
          <label class="setting-item tts-toggle">
            <input type="checkbox" v-model="form.add_tts" />
            <span>口播</span>
          </label>
          <input v-if="form.add_tts" v-model="form.tts_text" placeholder="口播文案" class="tts-input" />
          <div class="setting-spacer"></div>
          <div class="credits-info">{{ uploadedCount }}张 | {{ estimatedCredits }} credits</div>
        </div>

        <!-- 操作栏 -->
        <div class="action-bar">
          <select v-model="form.model" class="model-select">
            <option value="jimeng_v30">即梦 3.0</option>
            <option value="gen4_turbo">Gen-4 Turbo</option>
            <option value="gen4.5">Gen-4.5</option>
          </select>
          <button class="btn-generate" @click="submitTask" :disabled="submitting || uploadedCount === 0">
            {{ submitting ? '提交中...' : '🎬 Generate' }}
          </button>
        </div>
      </div>

      <!-- 右侧历史 -->
      <div class="history-panel">
        <div class="history-title">生成记录</div>
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="tasks.length === 0" class="empty">暂无记录</div>
        <div v-else class="history-list">
          <div v-for="t in tasks" :key="t.id" class="history-card" :class="'s-' + t.status">
            <div class="hc-header">
              <span class="hc-id">#{{ t.id }}</span>
              <span class="hc-model">{{ t.model }}</span>
              <span class="hc-status">{{ statusMap[t.status] }}</span>
              <span class="hc-time">{{ formatTime(t.created_at) }}</span>
            </div>
            <div v-if="t.prompt_image" class="hc-thumbs">
              <img v-for="(u, i) in getTaskImages(t)" :key="i" :src="getFullUrl(u)" @error="onImgErr" />
            </div>
            <div class="hc-prompt">{{ t.prompt_text }}</div>
            <div class="hc-meta">{{ t.duration }}s | {{ t.cost_credits }} credits</div>
            <div v-if="t.error_msg" class="hc-error">{{ t.error_msg }}</div>
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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const stats = ref({})
const tasks = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const submitting = ref(false)
const analyzing = ref(false)
const fileInputs = ref([])
let pollTimer = null

const images = reactive([
  { url: '', uploading: false },
  { url: '', uploading: false },
  { url: '', uploading: false }
])

const prompt = ref('')
const form = ref({ model: 'jimeng_v30', duration: 5, ratio: '720:1280', add_tts: false, tts_text: '' })
const statusMap = { pending: '等待中', generating: '生成中', composing: '合成中', done: '已完成', failed: '失败' }

const extraSlots = computed(() => {
  const arr = []
  for (let i = 1; i < images.length; i++) arr.push(i)
  return arr
})
const uploadedCount = computed(() => images.filter(i => i.url).length)
const estimatedCredits = computed(() => form.value.model === 'jimeng_v30' ? 0 : (form.value.model === 'gen4.5' ? 12 : 5) * form.value.duration)

const formatTime = (t) => dayjs(t).format('MM-DD HH:mm')
const getVideoUrl = (url) => url && url.startsWith('http') ? url : url
const getFullUrl = (url) => url && url.startsWith('http') ? url : url
const onImgErr = (e) => { e.target.style.display = 'none' }

const getTaskImages = (t) => {
  try {
    const pi = t.prompt_image
    if (pi && pi.startsWith('[')) return JSON.parse(pi)
    if (pi) return [pi]
  } catch {} return []
}

const addSlot = () => { if (images.length < 6) images.push({ url: '', uploading: false }) }
const triggerUpload = (idx) => { if (!images[idx]?.url) fileInputs.value[idx]?.click() }
const removeImg = (idx) => { images[idx].url = '' }

const onFileChange = async (e, idx) => {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  if (file.size > 20 * 1024 * 1024) return alert('图片不能超过20MB')
  images[idx].uploading = true
  try {
    const fd = new FormData()
    fd.append('image', file)
    const r = await request.post('/runway/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (r?.code === 0) images[idx].url = r.data.url
    else alert(r?.msg || '上传失败')
  } catch (err) { alert('上传失败: ' + err.message) } finally { images[idx].uploading = false }
}

const analyzeImages = async () => {
  const urls = images.filter(i => i.url).map(i => i.url)
  if (urls.length === 0) return alert('请先上传产品图片')
  analyzing.value = true
  try {
    const r = await request.post('/runway/analyze-images', { image_urls: urls })
    if (r?.code === 0 && r.data) {
      const d = r.data
      let text = d.scene_desc || ''
      if (d.script) text += '\n' + d.script
      if (d.shot_list && d.shot_list.length) {
        text += '\n---分镜---'
        d.shot_list.forEach((s, i) => { text += '\n' + (i+1) + '. ' + s.shot + ' (' + s.duration + ')' })
      }
      prompt.value = text.trim()
    } else { alert(r?.msg || 'AI分析失败') }
  } catch (e) { alert('AI分析失败: ' + e.message) } finally { analyzing.value = false }
}

const loadStats = async () => { try { const r = await request.get('/runway/stats'); stats.value = r?.data || {} } catch {} }
const loadTasks = async () => {
  loading.value = true
  try {
    const r = await request.get('/runway/list', { params: { page: page.value, page_size: pageSize, task_type: 'image2video' } })
    tasks.value = r?.data?.list || []; total.value = r?.data?.total || 0
  } catch {} finally { loading.value = false }
}
const submitTask = async () => {
  const urls = images.filter(i => i.url).map(i => i.url)
  if (urls.length === 0) return alert('请至少上传1张产品图片')
  submitting.value = true
  try {
    let r
    if (form.value.model === 'jimeng_v30') {
      // 即梦图生视频API
      r = await request.post('/super5s/i2v-jimeng', {
        image_urls: urls,
        prompt: prompt.value || '产品展示视频，真实感，手机竖屏拍摄',
        ratio: form.value.ratio,
        duration: form.value.duration,
      })
    } else {
      r = await request.post('/runway/image2video', {
        image_url: urls[0], image_urls: urls, prompt: prompt.value,
        model: form.value.model, duration: form.value.duration,
        add_tts: form.value.add_tts, tts_text: form.value.add_tts ? form.value.tts_text : ''
      })
    }
    if (r?.code === 0) { loadTasks(); loadStats() }
    else { alert(r?.msg || '创建失败') }
  } catch (e) { alert('请求失败: ' + e.message) } finally { submitting.value = false }
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
.i2v-page { max-width: 1200px; }
.stat-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 10px; padding: 14px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.stat-label { font-size: 12px; color: #8c8c8c; margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-value.blue { color: #1677ff; } .stat-value.green { color: #52c41a; } .stat-value.orange { color: #fa8c16; } .stat-value.purple { color: #722ed1; }

.workspace { display: flex; gap: 16px; align-items: flex-start; }

/* 编辑面板 */
.editor-panel { width: 380px; flex-shrink: 0; background: #1a1a2e; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }

/* 主图上传 */
.frame-section { display: flex; flex-direction: column; gap: 8px; }
.frame-main { width: 100%; aspect-ratio: 9/10; border: 2px dashed #333; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all .2s; background: #12122a; position: relative; overflow: hidden; }
.frame-main:hover { border-color: #555; background: #1e1e3a; }
.frame-label { color: #888; font-size: 14px; }
.frame-btn { padding: 6px 16px; background: #2a2a4a; color: #ccc; border-radius: 6px; font-size: 12px; }
.frame-loading { display: flex; align-items: center; justify-content: center; }
.spinner { width: 24px; height: 24px; border: 2px solid #333; border-top-color: #7c5cfc; border-radius: 50%; animation: spin .8s linear infinite; }
.spinner-sm { width: 16px; height: 16px; border: 2px solid #333; border-top-color: #7c5cfc; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.frame-thumb { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
.frame-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; opacity: 0; transition: opacity .2s; cursor: pointer; }
.frame-main:hover .frame-overlay { opacity: 1; }
.frame-tag { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: #fff; font-size: 11px; text-align: center; padding: 3px 0; }
.frame-hint { color: #555; font-size: 11px; text-align: center; }

/* 额外角度小图 */
.frame-extras { display: flex; gap: 8px; }
.extra-slot { width: 64px; height: 64px; border: 1.5px dashed #333; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; background: #12122a; position: relative; overflow: hidden; transition: all .2s; flex-shrink: 0; }
.extra-slot:hover { border-color: #555; }
.extra-add { border-color: #2a2a4a; }
.extra-icon { font-size: 18px; color: #555; }
.extra-label { font-size: 9px; color: #555; }
.extra-thumb { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
.extra-del { position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; background: rgba(0,0,0,0.7); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; opacity: 0; transition: opacity .2s; cursor: pointer; }
.extra-slot:hover .extra-del { opacity: 1; }

/* Prompt */
.prompt-section { position: relative; }
.prompt-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.prompt-label { color: #888; font-size: 12px; }
.btn-ai-gen { padding: 4px 12px; background: linear-gradient(135deg, #7c5cfc, #5c3cdc); color: #fff; border: none; border-radius: 5px; font-size: 11px; cursor: pointer; font-weight: 600; }
.btn-ai-gen:disabled { opacity: 0.4; cursor: not-allowed; }
.prompt-input { width: 100%; background: #12122a; border: 1px solid #333; border-radius: 10px; padding: 12px; color: #e0e0e0; font-size: 13px; line-height: 1.6; resize: vertical; min-height: 90px; box-sizing: border-box; font-family: inherit; }
.prompt-input::placeholder { color: #555; }
.prompt-input:focus { border-color: #7c5cfc; outline: none; }
.prompt-count { position: absolute; bottom: 8px; right: 10px; color: #444; font-size: 10px; }

/* 设置栏 */
.settings-bar { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #2a2a3a; flex-wrap: wrap; }
.setting-item { display: flex; align-items: center; gap: 3px; }
.setting-icon { font-size: 13px; }
.setting-select { background: #2a2a4a; border: 1px solid #333; color: #ccc; border-radius: 4px; padding: 3px 6px; font-size: 11px; }
.tts-toggle { font-size: 11px; color: #888; cursor: pointer; display: flex; align-items: center; gap: 3px; }
.tts-toggle input { accent-color: #7c5cfc; }
.tts-input { flex: 1; min-width: 100px; background: #2a2a4a; border: 1px solid #333; color: #ccc; border-radius: 4px; padding: 3px 8px; font-size: 11px; }
.setting-spacer { flex: 1; }
.credits-info { font-size: 11px; color: #555; white-space: nowrap; }

/* 操作栏 */
.action-bar { display: flex; gap: 10px; align-items: center; }
.model-select { background: #2a2a4a; border: 1px solid #333; color: #ccc; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 600; flex-shrink: 0; }
.btn-generate { flex: 1; padding: 12px; background: linear-gradient(135deg, #7c5cfc, #5c3cdc); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .2s; }
.btn-generate:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(124,92,252,0.4); transform: translateY(-1px); }
.btn-generate:disabled { opacity: 0.4; cursor: not-allowed; }

/* 右侧历史 */
.history-panel { flex: 1; min-width: 0; background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); max-height: 80vh; overflow-y: auto; }
.history-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #333; }
.history-list { display: flex; flex-direction: column; gap: 12px; }
.history-card { border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px; }
.history-card.s-done { border-left: 3px solid #52c41a; }
.history-card.s-failed { border-left: 3px solid #ff4d4f; }
.history-card.s-generating { border-left: 3px solid #fa8c16; }
.hc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.hc-id { font-weight: 600; font-size: 13px; }
.hc-model { font-size: 10px; padding: 2px 6px; background: #f0f5ff; color: #1677ff; border-radius: 3px; }
.hc-status { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 500; }
.s-done .hc-status { background: #f6ffed; color: #52c41a; }
.s-failed .hc-status { background: #fff2f0; color: #ff4d4f; }
.s-generating .hc-status { background: #fff7e6; color: #fa8c16; }
.s-pending .hc-status { background: #f5f5f5; color: #999; }
.hc-time { font-size: 11px; color: #bbb; margin-left: auto; }
.hc-thumbs { display: flex; gap: 4px; margin-bottom: 6px; }
.hc-thumbs img { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; }
.hc-prompt { font-size: 12px; color: #666; line-height: 1.5; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
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
  .frame-main { aspect-ratio: 1; }
}
</style>
