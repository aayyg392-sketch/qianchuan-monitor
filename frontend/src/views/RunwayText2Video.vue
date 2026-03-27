<template>
  <div class="ai-create-page">
    <!-- 上方内容区 -->
    <div class="content-area" ref="contentArea">
      <div v-if="!tasks.length && !submitting" class="welcome-section">
        <div class="welcome-icon">🎬</div>
        <h2>AI文生视频</h2>
        <p class="welcome-desc">输入场景描述，AI自动按CCR公式优化并生成视频</p>
        <div class="quick-prompts">
          <div class="prompt-chip" @click="usePrompt('近景镜头，年轻女性用洗面奶洗脸，丰富泡沫轻柔按摩面部，用清水冲洗露出水润肌肤')">🧴 洗面奶广告</div>
          <div class="prompt-chip" @click="usePrompt('特写镜头，女生轻轻挤出精华液滴在手指上，质地清透水润，缓缓涂抹在脸颊上，皮肤呈现水光感')">💧 精华液展示</div>
          <div class="prompt-chip" @click="usePrompt('俯拍视角，桌面上摆放着雪玲妃全套护肤品，旁边有鲜花和绿植点缀，阳光从窗户洒入，整体氛围清新自然')">🌿 产品摆拍</div>
          <div class="prompt-chip" @click="usePrompt('对比画面，左边是暗沉出油的皮肤特写，右边是使用产品后清透水润的皮肤，过渡自然流畅')">✨ 前后对比</div>
        </div>
      </div>

      <!-- 聊天记录 -->
      <div v-if="tasks.length || submitting" class="chat-list">
        <div v-for="t in [...tasks].reverse()" :key="t.id" class="chat-pair">
          <!-- 用户消息 -->
          <div class="chat-msg user-msg">
            <div class="msg-bubble user-bubble">
              <span class="msg-model">{{ modelLabels[t.model] || t.model }} · {{ t.task_type === 'image2video' ? '图生视频' : '文生视频' }} · {{ t.duration || 5 }}s</span>
              <!-- 参考图缩略图 -->
              <div v-if="t.product_images && parseImages(t.product_images).length" class="ref-images">
                <img v-for="(img, i) in parseImages(t.product_images)" :key="i" :src="img" class="ref-thumb" />
              </div>
              {{ t.prompt_text }}
            </div>
            <div class="msg-time">{{ formatTime(t.created_at) }}</div>
          </div>
          <!-- AI回复 -->
          <div class="chat-msg ai-msg">
            <div class="ai-avatar">AI</div>
            <div class="msg-content">
              <div v-if="t.status === 'done' && t.video_url" class="result-box" @click="showDetail(t)">
                <video :src="t.video_url" preload="metadata" class="result-media"></video>
                <div class="result-overlay"><span class="play-icon">▶</span></div>
              </div>
              <div v-else-if="t.status === 'failed'" class="msg-bubble ai-bubble error-bubble">
                生成失败{{ t.error_msg ? '：' + t.error_msg : '' }}
              </div>
              <div v-else class="msg-bubble ai-bubble loading-bubble">
                <div class="typing-dots"><span></span><span></span><span></span></div>
                {{ t.status === 'composing' ? '合成中...' : '视频生成中...' }}
              </div>
              <!-- 操作按钮 -->
              <div v-if="t.status === 'done' && t.video_url" class="result-actions">
                <a :href="t.video_url" target="_blank" class="result-btn">⬇ 下载</a>
                <button class="result-btn" @click="usePrompt(t.prompt_text)">🔄 重新生成</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 正在生成 -->
        <div v-if="submitting" class="chat-pair">
          <div class="chat-msg user-msg">
            <div class="msg-bubble user-bubble">
              <span class="msg-model">{{ modelLabels[form.model] }} · {{ form.duration }}s</span>
              {{ lastPrompt }}
            </div>
          </div>
          <div class="chat-msg ai-msg">
            <div class="ai-avatar">AI</div>
            <div class="msg-content">
              <div class="msg-bubble ai-bubble loading-bubble">
                <div class="typing-dots"><span></span><span></span><span></span></div>
                视频生成中，请稍候...
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 加载更多提示 -->
      <div v-if="loadingMore" class="load-more-tip">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        加载中...
      </div>
      <div v-if="!hasMore && tasks.length > 0" class="no-more-tip">— 没有更多了 —</div>
    </div>

    <!-- 底部悬浮输入区 -->
    <div class="floating-input-wrap">
      <div class="floating-input-box" :class="{ focused: inputFocused }">
        <!-- 附件预览 -->
        <div v-if="attachments.length" class="attach-preview-row">
          <div v-for="(file, idx) in attachments" :key="idx" class="attach-thumb">
            <img v-if="file.type.startsWith('image/')" :src="file.preview" class="attach-img" />
            <video v-else :src="file.preview" class="attach-img"></video>
            <button class="attach-remove" @click="removeAttach(idx)">&times;</button>
            <span class="attach-name">{{ file.file.name.slice(0, 12) }}</span>
          </div>
        </div>
        <!-- 输入框 -->
        <div class="input-row">
          <textarea
            v-model="form.scene_desc"
            placeholder="用中文描述场景，AI自动按CCR公式优化..."
            @keydown.enter.exact.prevent="submitTask"
            @keydown.shift.enter.exact="null"
            @input="autoResize"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            rows="1"
            class="prompt-input"
            ref="inputEl"
          ></textarea>
          <button class="btn-send" @click="submitTask" :disabled="(!form.scene_desc?.trim() && !attachments.length) || submitting">
            <svg v-if="!submitting" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span v-else class="send-loading"></span>
          </button>
        </div>
        <!-- 功能按钮行 -->
        <div class="func-bar">
          <!-- 上传附件 -->
          <button class="func-btn" @click="$refs.fileInput.click()">
            <span class="func-icon">📎</span> 附件
          </button>
          <input type="file" ref="fileInput" accept="image/*,video/*" multiple style="display:none" @change="handleFileSelect" />
          <span class="func-divider"></span>

          <!-- 模型选择 -->
          <div class="func-dropdown" ref="modelDropRef">
            <button class="func-btn" @click.stop="modelDropOpen = !modelDropOpen; durDropOpen = false; ratioDropOpen = false">
              <span class="func-icon">🤖</span> {{ modelLabels[form.model] }}
              <span class="drop-arrow" :class="{ open: modelDropOpen }">▾</span>
            </button>
            <div class="dropdown-menu" v-if="modelDropOpen">
              <div class="drop-item" :class="{ active: form.model === 'jimeng_v30' }" @click="form.model = 'jimeng_v30'; modelDropOpen = false">即梦 3.0 Pro</div>
              <div class="drop-item" :class="{ active: form.model === 'doubao_seed' }" @click="form.model = 'doubao_seed'; modelDropOpen = false">豆包 Seedance</div>
              <div class="drop-item" :class="{ active: form.model === 'kling_v2' }" @click="form.model = 'kling_v2'; modelDropOpen = false">可灵 2.0</div>
              <div class="drop-item" :class="{ active: form.model === 'gen4_turbo' }" @click="form.model = 'gen4_turbo'; modelDropOpen = false">Runway Gen-4</div>
            </div>
          </div>
          <span class="func-divider"></span>

          <!-- 时长选择 -->
          <div class="func-dropdown" ref="durDropRef">
            <button class="func-btn" @click.stop="durDropOpen = !durDropOpen; modelDropOpen = false; ratioDropOpen = false">
              <span class="func-icon">⏱</span> {{ form.duration }}s
              <span class="drop-arrow" :class="{ open: durDropOpen }">▾</span>
            </button>
            <div class="dropdown-menu" v-if="durDropOpen">
              <div class="drop-item" :class="{ active: form.duration === 5 }" @click="form.duration = 5; durDropOpen = false">5 秒</div>
              <div class="drop-item" :class="{ active: form.duration === 10 }" @click="form.duration = 10; durDropOpen = false">10 秒</div>
            </div>
          </div>

          <!-- 比例选择 -->
          <div class="func-dropdown" ref="ratioDropRef">
            <button class="func-btn" @click.stop="ratioDropOpen = !ratioDropOpen; modelDropOpen = false; durDropOpen = false">
              <span class="func-icon">📐</span> {{ ratioLabel }}
              <span class="drop-arrow" :class="{ open: ratioDropOpen }">▾</span>
            </button>
            <div class="dropdown-menu" v-if="ratioDropOpen">
              <div class="drop-item" :class="{ active: form.ratio === '720:1280' }" @click="form.ratio = '720:1280'; ratioDropOpen = false">9:16 竖屏</div>
              <div class="drop-item" :class="{ active: form.ratio === '1280:720' }" @click="form.ratio = '1280:720'; ratioDropOpen = false">16:9 横屏</div>
              <div class="drop-item" :class="{ active: form.ratio === '1024:1024' }" @click="form.ratio = '1024:1024'; ratioDropOpen = false">1:1 方形</div>
            </div>
          </div>
          <span class="func-divider"></span>

          <!-- 数据驱动 -->
          <button class="func-btn" :class="{ active: dataDriven }" @click="dataDriven = !dataDriven">
            <span class="func-icon">📊</span> 数据驱动
          </button>

          <!-- CCR优化 -->
          <button class="func-btn" @click="previewOptimize" :disabled="optimizing || !form.scene_desc">
            <span class="func-icon">🤖</span> {{ optimizing ? '优化中...' : 'CCR优化' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detailVisible" class="modal-overlay" @click.self="detailVisible = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>视频详情</h3>
          <button class="modal-close" @click="detailVisible = false">&times;</button>
        </div>
        <div class="modal-body" v-if="detailItem">
          <div class="detail-media">
            <video v-if="detailItem.video_url" :src="detailItem.video_url" controls class="detail-player"></video>
          </div>
          <div class="detail-info">
            <div class="detail-row"><label>提示词：</label><span>{{ detailItem.prompt_text }}</span></div>
            <div class="detail-row"><label>模型：</label><span>{{ detailItem.model }}</span></div>
            <div class="detail-row"><label>时长：</label><span>{{ detailItem.duration }}s</span></div>
            <div class="detail-row"><label>状态：</label><span :class="'status-' + detailItem.status">{{ statusMap[detailItem.status] }}</span></div>
            <div class="detail-row"><label>创建时间：</label><span>{{ formatTime(detailItem.created_at) }}</span></div>
          </div>
          <div class="detail-actions" v-if="detailItem.video_url">
            <a :href="detailItem.video_url" target="_blank" class="btn-download">下载视频</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const tasks = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const submitting = ref(false)
const optimizing = ref(false)
const dataDriven = ref(true)
const lastPrompt = ref('')
const inputFocused = ref(false)
const modelDropOpen = ref(false)
const durDropOpen = ref(false)
const ratioDropOpen = ref(false)
const detailVisible = ref(false)
const detailItem = ref(null)
const contentArea = ref(null)
const inputEl = ref(null)
const attachments = ref([])
let pollTimer = null

const form = ref({ scene_desc: '', model: 'jimeng_v30', duration: 5, ratio: '720:1280', add_tts: false })
const statusMap = { pending: '等待中', generating: '生成中', composing: '合成中', done: '已完成', failed: '失败' }
const modelLabels = { jimeng_v30: '即梦 3.0 Pro', doubao_seed: '豆包 Seedance', kling_v2: '可灵 2.0', gen4_turbo: 'Runway Gen-4' }
const ratioLabel = computed(() => ({ '720:1280': '9:16', '1280:720': '16:9', '1024:1024': '1:1' }[form.value.ratio] || '9:16'))

const formatTime = (t) => dayjs(t).format('MM-DD HH:mm')
function parseImages(str) { try { return typeof str === 'string' ? JSON.parse(str) : (Array.isArray(str) ? str : []) } catch { return [] } }

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function usePrompt(text) {
  form.value.scene_desc = text
  nextTick(() => { autoResize(); inputEl.value?.focus() })
}

function showDetail(item) { detailItem.value = item; detailVisible.value = true }

function handleFileSelect(e) {
  const files = Array.from(e.target.files || [])
  files.forEach(file => {
    if (file.size > 50 * 1024 * 1024) { alert(`${file.name} 超过50MB限制`); return }
    attachments.value.push({ file, type: file.type, preview: URL.createObjectURL(file) })
  })
  e.target.value = ''
}

function removeAttach(idx) {
  URL.revokeObjectURL(attachments.value[idx].preview)
  attachments.value.splice(idx, 1)
}

const previewOptimize = async () => {
  if (!form.value.scene_desc?.trim()) return
  optimizing.value = true
  try {
    const r = await request.post('/runway/optimize-prompt', {
      scene_desc: form.value.scene_desc,
      model: form.value.model,
      data_driven: dataDriven.value
    })
    if (r?.code === 0 && r.data?.optimized) {
      form.value.scene_desc = r.data.optimized
      nextTick(() => autoResize())
    } else { alert(r?.msg || '优化失败') }
  } catch (e) { alert('请求失败: ' + e.message) } finally { optimizing.value = false }
}

const loadTasks = async (mode = 'reload') => {
  // mode: 'reload' = 重新加载第1页, 'more' = 加载下一页, 'poll' = 静默刷新当前已加载数据
  if (mode === 'reload') {
    loading.value = true
    page.value = 1
    hasMore.value = true
  } else if (mode === 'more') {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    page.value++
  }

  try {
    if (mode === 'poll') {
      // 静默刷新：重新加载已有页数的数据，只更新状态
      const r = await request.get('/runway/list', { params: { page: 1, page_size: tasks.value.length || pageSize, task_type: 'text2video,image2video' } })
      const newList = r?.data?.list || []
      total.value = r?.data?.total || 0
      for (let i = 0; i < Math.min(tasks.value.length, newList.length); i++) {
        const old = tasks.value[i], nw = newList[i]
        if (old && nw && old.id === nw.id) {
          if (old.status !== nw.status || old.video_url !== nw.video_url || old.error_msg !== nw.error_msg) {
            Object.assign(old, nw)
          }
        } else { tasks.value = newList; break }
      }
      // 如果有新任务插入到前面
      if (newList.length > tasks.value.length) tasks.value = newList
    } else {
      const r = await request.get('/runway/list', { params: { page: page.value, page_size: pageSize, task_type: 'text2video,image2video' } })
      const newList = r?.data?.list || []
      total.value = r?.data?.total || 0

      if (mode === 'reload') {
        tasks.value = newList
      } else if (mode === 'more') {
        tasks.value.push(...newList)
      }

      if (newList.length < pageSize) hasMore.value = false
    }
  } catch {} finally {
    loading.value = false
    loadingMore.value = false
  }
}

function onContentScroll() {
  const el = contentArea.value
  if (!el) return
  // 向上滚动到顶部时加载更多（因为列表是倒序的，最新在底部，旧的在顶部）
  if (el.scrollTop < 100 && hasMore.value && !loadingMore.value) {
    const oldHeight = el.scrollHeight
    loadTasks('more').then(() => {
      // 保持滚动位置
      nextTick(() => {
        const newHeight = el.scrollHeight
        el.scrollTop = newHeight - oldHeight + el.scrollTop
      })
    })
  }
}

// 上传图片到服务器，返回URL
async function uploadImage(file) {
  const fd = new FormData()
  fd.append('image', file)
  const r = await request.post('/runway/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  if (r?.code === 0) return r.data.url
  throw new Error(r?.msg || '图片上传失败')
}

const submitTask = async () => {
  if ((!form.value.scene_desc?.trim() && !attachments.value.length) || submitting.value) return
  submitting.value = true
  lastPrompt.value = form.value.scene_desc || '(图片生成视频)'

  const hasImages = attachments.value.some(a => a.type.startsWith('image/'))

  try {
    let r

    if (hasImages) {
      // === 图生视频流程 ===
      // 先上传所有图片到服务器
      const imageFiles = attachments.value.filter(a => a.type.startsWith('image/'))
      const uploadedUrls = []
      for (const img of imageFiles) {
        const url = await uploadImage(img.file)
        uploadedUrls.push(url)
      }

      if (form.value.model === 'jimeng_v30') {
        // 即梦图生视频
        r = await request.post('/super5s/i2v-jimeng', {
          image_urls: uploadedUrls,
          prompt: form.value.scene_desc || '产品展示，真实感',
          ratio: form.value.ratio,
          duration: form.value.duration,
        })
      } else if (form.value.model === 'doubao_seed') {
        // 豆包图生视频 - 通过 generate-with-file
        const fd = new FormData()
        fd.append('prompt', form.value.scene_desc || '根据图片生成视频')
        fd.append('duration', form.value.duration)
        fd.append('ratio', form.value.ratio === '720:1280' ? '9:16' : form.value.ratio === '1280:720' ? '16:9' : '1:1')
        fd.append('model', 'doubao')
        fd.append('type', 'video')
        imageFiles.forEach(a => fd.append('files', a.file))
        const token = localStorage.getItem('qc_token')
        const resp = await fetch('/api/ai-hot-material/generate-with-file', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        r = await resp.json()
      } else {
        // Runway / 可灵 图生视频
        r = await request.post('/runway/image2video', {
          scene_desc: form.value.scene_desc || '根据图片生成视频',
          product_images: uploadedUrls,
          model: form.value.model,
          duration: form.value.duration,
        })
      }
    } else {
      // === 文生视频流程 ===
      if (form.value.model === 'jimeng_v30') {
        r = await request.post('/super5s/text2video-jimeng', {
          scene_desc: form.value.scene_desc,
          ratio: form.value.ratio,
          duration: form.value.duration,
        })
      } else if (form.value.model === 'doubao_seed') {
        r = await request.post('/super5s/text2video-jimeng', {
          scene_desc: form.value.scene_desc,
          ratio: form.value.ratio,
          duration: form.value.duration,
          model: 'doubao_seed',
        })
      } else {
        r = await request.post('/runway/text2video', {
          scene_desc: form.value.scene_desc,
          model: form.value.model,
          duration: form.value.duration,
          ratio: form.value.ratio,
          add_tts: form.value.add_tts,
        })
      }
    }

    if (r?.code === 0) {
      form.value.scene_desc = ''
      attachments.value.forEach(a => URL.revokeObjectURL(a.preview))
      attachments.value = []
      nextTick(() => { if (inputEl.value) inputEl.value.style.height = 'auto' })
      loadTasks('reload').then(scrollToBottom)
    } else {
      alert(r?.msg || '创建失败')
    }
  } catch (e) { alert('请求失败: ' + e.message) } finally { submitting.value = false }
}

function closeDropdowns() {
  modelDropOpen.value = false
  durDropOpen.value = false
  ratioDropOpen.value = false
}

function scrollToBottom() {
  nextTick(() => {
    if (contentArea.value) {
      contentArea.value.scrollTop = contentArea.value.scrollHeight
    }
  })
}

onMounted(() => {
  loadTasks('reload').then(scrollToBottom)
  pollTimer = setInterval(() => {
    if (tasks.value.some(t => ['generating','composing','pending'].includes(t.status))) { loadTasks('poll') }
  }, 8000)
  document.addEventListener('click', closeDropdowns)
  nextTick(() => {
    if (contentArea.value) contentArea.value.addEventListener('scroll', onContentScroll)
  })
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('click', closeDropdowns)
  if (contentArea.value) contentArea.value.removeEventListener('scroll', onContentScroll)
})
</script>

<style scoped>
.ai-create-page { display: flex; flex-direction: column; height: 100vh; background: #f7f8fa; }
.content-area { flex: 1; overflow-y: auto; padding: 24px 24px 160px; }

/* 欢迎页 */
.welcome-section { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; text-align: center; }
.welcome-icon { font-size: 48px; margin-bottom: 16px; }
.welcome-section h2 { font-size: 24px; font-weight: 600; color: #1a1a2e; margin: 0 0 8px; }
.welcome-desc { color: #888; font-size: 14px; margin: 0 0 32px; }
.quick-prompts { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 600px; }
.prompt-chip { padding: 10px 18px; background: #fff; border: 1px solid #e8e8e8; border-radius: 20px; font-size: 13px; cursor: pointer; transition: all 0.2s; color: #333; }
.prompt-chip:hover { background: #f0f0ff; border-color: #4e6ef2; color: #4e6ef2; }

/* 聊天记录 */
.chat-list { max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
.chat-pair { display: flex; flex-direction: column; gap: 12px; }
.chat-msg { display: flex; gap: 10px; }
.user-msg { flex-direction: row-reverse; }
.ai-msg { align-items: flex-start; }
.msg-bubble { max-width: 70%; padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.6; word-break: break-word; }
.user-bubble { background: #4e6ef2; color: #fff; border-bottom-right-radius: 4px; }
.ai-bubble { background: #fff; color: #333; border-bottom-left-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.error-bubble { color: #ef4444; background: #fff5f5; }
.loading-bubble { display: flex; align-items: center; gap: 8px; color: #888; }
.msg-model { display: block; font-size: 11px; opacity: 0.7; margin-bottom: 4px; }
.ref-images { display: flex; gap: 4px; margin: 6px 0; flex-wrap: wrap; }
.ref-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); }
.msg-time { font-size: 11px; color: #bbb; text-align: right; margin-top: 4px; padding-right: 4px; }
.ai-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #4e6ef2, #7c3aed); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.msg-content { display: flex; flex-direction: column; gap: 8px; max-width: 70%; }

/* 结果展示 */
.result-box { position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; background: #000; max-width: 300px; }
.result-media { width: 100%; max-height: 400px; object-fit: cover; display: block; }
.result-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.15); opacity: 0; transition: opacity 0.2s; }
.result-box:hover .result-overlay { opacity: 1; }
.play-icon { width: 48px; height: 48px; background: rgba(255,255,255,0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #333; }
.result-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.result-btn { padding: 5px 12px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff; font-size: 12px; color: #555; cursor: pointer; text-decoration: none; transition: all 0.15s; }
.result-btn:hover { border-color: #4e6ef2; color: #4e6ef2; }

/* 加载更多提示 */
.load-more-tip { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px; color: #999; font-size: 13px; }
.no-more-tip { text-align: center; padding: 16px; color: #ccc; font-size: 12px; }

/* 打字动画 */
.typing-dots { display: flex; gap: 4px; }
.typing-dots span { width: 6px; height: 6px; background: #bbb; border-radius: 50%; animation: typing 1.4s infinite; }
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing { 0%,60%,100% { opacity: 0.3; } 30% { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
.status-done { color: #166534; } .status-failed { color: #991b1b; } .status-processing { color: #92400e; }

/* 附件预览 */
.attach-preview-row { display: flex; gap: 8px; padding: 10px 16px 0; flex-wrap: wrap; }
.attach-thumb { position: relative; width: 72px; display: flex; flex-direction: column; align-items: center; }
.attach-img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; border: 1px solid #e8e8e8; }
.attach-remove { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; border: none; background: #ff4d4f; color: #fff; font-size: 14px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.attach-name { font-size: 10px; color: #999; margin-top: 2px; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 底部悬浮输入区 */
.floating-input-wrap { position: fixed; bottom: 0; left: 220px; right: 0; padding: 0 24px 20px; display: flex; justify-content: center; pointer-events: none; z-index: 100; }
.floating-input-box { width: 100%; max-width: 780px; background: #fff; border-radius: 20px; box-shadow: 0 2px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04); pointer-events: all; transition: box-shadow 0.2s; overflow: visible !important; position: relative; z-index: 100; }
.floating-input-box.focused { box-shadow: 0 2px 20px rgba(78,110,242,0.15), 0 0 0 1.5px rgba(78,110,242,0.3); }
.input-row { display: flex; align-items: flex-end; padding: 14px 16px 8px; gap: 8px; }
.prompt-input { flex: 1; border: none; outline: none; font-size: 15px; line-height: 1.5; resize: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; background: transparent; max-height: 200px; overflow-y: auto; }
.prompt-input::placeholder { color: #bbb; }
.btn-send { width: 36px; height: 36px; border-radius: 50%; border: none; background: #4e6ef2; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
.btn-send:disabled { background: #ccc; cursor: not-allowed; }
.btn-send:hover:not(:disabled) { background: #3d5bd9; }
.send-loading { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }

/* 功能按钮行 */
.func-bar { display: flex; align-items: center; gap: 2px; padding: 6px 12px 10px; overflow: visible; position: relative; }
.func-btn { display: flex; align-items: center; gap: 4px; padding: 5px 12px; border: none; background: none; font-size: 13px; color: #666; cursor: pointer; border-radius: 6px; white-space: nowrap; transition: all 0.15s; }
.func-btn:hover { background: #f0f1f5; color: #333; }
.func-btn.active { color: #4e6ef2; background: #eef2ff; }
.func-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.func-icon { font-size: 15px; }
.func-divider { width: 1px; height: 16px; background: #e0e0e0; margin: 0 6px; flex-shrink: 0; }

/* 下拉菜单 */
.func-dropdown { position: relative; }
.drop-arrow { font-size: 10px; margin-left: 2px; transition: transform 0.2s; display: inline-block; }
.drop-arrow.open { transform: rotate(180deg); }
.dropdown-menu { position: absolute; top: auto; bottom: calc(100% + 8px); left: 0; background: #fff; border-radius: 10px; box-shadow: 0 -4px 20px rgba(0,0,0,0.15); padding: 4px; min-width: 140px; z-index: 999; }
.drop-item { padding: 8px 14px; font-size: 13px; color: #333; border-radius: 6px; cursor: pointer; white-space: nowrap; transition: background 0.1s; }
.drop-item:hover { background: #f0f1f5; }
.drop-item.active { color: #4e6ef2; background: #eef2ff; font-weight: 500; }


/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center; }
.modal-content { background: #fff; border-radius: 16px; width: 90%; max-width: 600px; max-height: 85vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; font-size: 16px; }
.modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; }
.modal-body { padding: 20px; }
.detail-media { margin-bottom: 16px; }
.detail-player { width: 100%; max-height: 400px; border-radius: 8px; background: #000; }
.detail-info { margin-bottom: 16px; }
.detail-row { margin-bottom: 8px; font-size: 14px; }
.detail-row label { font-weight: 600; color: #666; margin-right: 8px; }
.detail-actions { display: flex; gap: 12px; }
.btn-download { flex: 1; text-align: center; padding: 10px; background: #4e6ef2; color: #fff; border-radius: 10px; text-decoration: none; font-size: 14px; }
</style>
