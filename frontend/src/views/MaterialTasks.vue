<template>
  <div class="tasks-page">
    <!-- 顶部操作栏 -->
    <div class="tasks-header">
      <div class="header-left">
        <h2 class="page-title">素材任务</h2>
        <span class="task-count" v-if="tasks.length">共 {{ total }} 条</span>
      </div>
      <button class="generate-btn" :disabled="generating" @click="handleGenerate">
        <svg v-if="!generating" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        <a-spin v-if="generating" size="small" />
        {{ generating ? '生成中...' : 'AI 生成素材脚本' }}
      </button>
    </div>

    <!-- 状态筛选 -->
    <div class="status-tabs">
      <span class="tab-item" :class="{ active: filterStatus === '' }" @click="filterStatus = ''; loadTasks()">全部</span>
      <span class="tab-item" :class="{ active: filterStatus === 'pending' }" @click="filterStatus = 'pending'; loadTasks()">待制作</span>
      <span class="tab-item" :class="{ active: filterStatus === 'producing' }" @click="filterStatus = 'producing'; loadTasks()">制作中</span>
      <span class="tab-item" :class="{ active: filterStatus === 'reviewing' }" @click="filterStatus = 'reviewing'; loadTasks()">待审核</span>
      <span class="tab-item" :class="{ active: filterStatus === 'approved' }" @click="filterStatus = 'approved'; loadTasks()">已通过</span>
      <span class="tab-item" :class="{ active: filterStatus === 'rejected' }" @click="filterStatus = 'rejected'; loadTasks()">已驳回</span>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading && !tasks.length" class="loading-state"><a-spin /></div>

    <!-- 空状态 -->
    <div v-if="!loading && !tasks.length" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d9d9d9" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>暂无素材任务</p>
      <p class="empty-hint">点击「AI 生成素材脚本」自动创建</p>
    </div>

    <!-- 任务卡片列表 -->
    <div class="task-list">
      <div class="task-card" v-for="task in tasks" :key="task.id" :class="{ expanded: expandedId === task.id }">
        <div class="task-card-header" @click="toggleExpand(task.id)">
          <div class="task-info">
            <div class="task-title-row">
              <span class="task-type-tag" v-if="task.source_data?.type">{{ task.source_data.type }}</span>
              <span class="task-title">{{ task.title }}</span>
            </div>
            <div class="task-meta">
              <span class="hot-topic-mini" v-if="task.hot_topic">🔥 {{ task.hot_topic }}</span>
              <span class="task-time">{{ formatTime(task.created_at) }}</span>
            </div>
          </div>
          <div class="task-actions">
            <span class="status-tag" :class="'status-' + task.status">{{ statusLabel(task.status) }}</span>
            <svg class="expand-icon" :class="{ rotated: expandedId === task.id }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>

        <!-- 展开详情 -->
        <div v-if="expandedId === task.id" class="task-detail">
          <!-- Hook -->
          <div v-if="task.hook" class="detail-hook">
            <div class="detail-label">🎣 黄金Hook</div>
            <div class="detail-hook-text">{{ task.hook }}</div>
          </div>

          <!-- 分镜 -->
          <div v-if="task.scenes && task.scenes.length" class="detail-scenes">
            <div class="detail-label">📹 分镜脚本</div>
            <div class="scene-item" v-for="(s, i) in task.scenes" :key="i">
              <span class="scene-time">{{ s.time }}</span>
              <div class="scene-body">
                <div class="scene-content">🎬 {{ s.content }}</div>
                <div class="scene-narration">🎙️ {{ s.narration }}</div>
              </div>
            </div>
          </div>

          <!-- CTA -->
          <div v-if="task.cta" class="detail-cta">
            <div class="detail-label">💡 转化引导</div>
            <div class="detail-cta-text">{{ task.cta }}</div>
          </div>

          <!-- 视频生成 -->
          <div class="detail-video">
            <!-- 已合成视频 -->
            <div v-if="task.source_data?.video_url" class="video-player-box">
              <div class="detail-label">🎥 合成视频</div>
              <video :src="task.source_data.video_url" controls preload="metadata" class="video-player"></video>
              <div class="video-meta">
                <span class="video-time">{{ task.source_data.compose_at ? formatTime(task.source_data.compose_at) : '' }}</span>
                <span v-if="task.source_data.video_size" class="video-size">{{ (task.source_data.video_size / 1024 / 1024).toFixed(1) }}MB</span>
                <a :href="task.source_data.video_url" download class="video-download">下载</a>
                <button class="video-gen-btn small" @click.stop="generateVideo(task)" :disabled="task._videoLoading">重新生成</button>
              </div>
            </div>
            <!-- 合成中 -->
            <div v-else-if="task.source_data?.compose_status === 'processing'" class="compose-loading">
              <a-spin size="small" /> 视频合成中，约30-60秒...
              <button class="video-gen-btn small" style="margin-left:8px" @click.stop="checkComposeStatus(task)">刷新状态</button>
            </div>
            <!-- 合成失败 -->
            <div v-else-if="task.source_data?.compose_status === 'failed'" class="compose-error">
              ❌ 合成失败: {{ task.source_data.compose_error }}
              <button class="video-gen-btn small" style="margin-left:8px" @click.stop="generateVideo(task)">重试</button>
            </div>
            <!-- 已匹配片段，未合成 -->
            <div v-else-if="task.source_data?.video_clips?.length" class="video-clips">
              <div class="detail-label">🎬 已匹配 {{ task.source_data.video_clips.length }} 个片段</div>
              <div class="clip-list">
                <div v-for="(clip, ci) in task.source_data.video_clips" :key="ci" class="clip-item">
                  <span class="clip-scene">{{ clip.scene_time }}</span>
                  <span class="clip-desc">{{ clip.scene_content }}</span>
                  <span class="clip-type-tag">{{ clip.clip_type === 'large' ? '完整素材' : clip.clip_type === 'medium' ? '产品特写' : '短片段' }}</span>
                </div>
              </div>
              <div class="video-meta">
                <button class="video-compose-btn" @click.stop="composeVideo(task)" :disabled="task._composeLoading">
                  <svg v-if="!task._composeLoading" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {{ task._composeLoading ? '合成中...' : '合成视频' }}
                </button>
                <button class="video-gen-btn small" @click.stop="generateVideo(task)" :disabled="task._videoLoading">重新匹配</button>
              </div>
            </div>
            <!-- 初始状态 -->
            <button v-else class="video-gen-btn" :disabled="task._videoLoading" @click.stop="generateVideo(task)">
              <svg v-if="!task._videoLoading" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <a-spin v-if="task._videoLoading" size="small" />
              {{ task._videoLoading ? '匹配中...' : '生成视频' }}
            </button>
          </div>

          <!-- 状态操作 -->
          <div class="detail-actions">
            <span class="action-label">修改状态：</span>
            <button v-for="st in statusOptions" :key="st.value" class="status-btn" :class="{ active: task.status === st.value, ['btn-' + st.value]: true }" @click.stop="updateStatus(task, st.value)" :disabled="task.status === st.value">
              {{ st.label }}
            </button>
          </div>
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

const tasks = ref([])
const total = ref(0)
const loading = ref(false)
const generating = ref(false)
const filterStatus = ref('')
const expandedId = ref(null)

const statusOptions = [
  { value: 'pending', label: '待制作' },
  { value: 'producing', label: '制作中' },
  { value: 'reviewing', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]

function statusLabel(s) {
  const m = { pending: '待制作', producing: '制作中', reviewing: '待审核', approved: '已通过', rejected: '已驳回' }
  return m[s] || s
}

function formatTime(t) {
  return t ? dayjs(t).format('MM-DD HH:mm') : ''
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

async function loadTasks() {
  loading.value = true
  try {
    const params = { page: 1, page_size: 50 }
    if (filterStatus.value) params.status = filterStatus.value
    const res = await request.get('/material-tasks', { params })
    tasks.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (e) { console.error('加载任务失败', e) }
  finally { loading.value = false }
}

async function handleGenerate() {
  generating.value = true
  try {
    const res = await request.post('/material-tasks/generate', {}, { timeout: 120000 })
    if (res.code === 0) {
      message.success(res.msg || '素材脚本生成成功')
      loadTasks()
    } else {
      message.error(res.msg || '生成失败')
    }
  } catch (e) {
    message.error('生成失败，请重试')
  } finally { generating.value = false }
}

async function updateStatus(task, newStatus) {
  try {
    const res = await request.put('/material-tasks/' + task.id + '/status', { status: newStatus })
    if (res.code === 0) {
      task.status = newStatus
      message.success('状态已更新')
    }
  } catch (e) { message.error('更新失败') }
}

async function generateVideo(task) {
  task._videoLoading = true
  try {
    // 先匹配片段
    const res = await request.post(`/material-tasks/${task.id}/generate-video`, {}, { timeout: 60000 })
    if (res.code === 0 && res.data) {
      if (!task.source_data) task.source_data = {}
      task.source_data.video_clips = res.data.clips
      task.source_data.video_generated_at = res.data.generated_at
      // 清除旧的合成状态
      task.source_data.video_url = null
      task.source_data.compose_status = null
      task.source_data.compose_error = null
      message.success(`已匹配 ${res.data.total_clips} 个片段，点击"合成视频"生成`)
    } else {
      message.error(res.msg || '匹配失败')
    }
  } catch (e) {
    message.error('视频匹配失败')
  } finally {
    task._videoLoading = false
  }
}

async function composeVideo(task) {
  task._composeLoading = true
  if (!task.source_data) task.source_data = {}
  task.source_data.compose_status = 'processing'
  try {
    const res = await request.post(`/material-tasks/${task.id}/compose-video`, {}, { timeout: 15000 })
    if (res.code === 0) {
      message.info('视频合成已启动，约30-60秒完成')
      // 轮询合成状态
      pollComposeStatus(task)
    } else {
      task.source_data.compose_status = 'failed'
      task.source_data.compose_error = res.msg
      message.error(res.msg || '合成启动失败')
    }
  } catch (e) {
    task.source_data.compose_status = 'failed'
    task.source_data.compose_error = '请求超时'
    message.error('合成请求失败')
  } finally {
    task._composeLoading = false
  }
}

function pollComposeStatus(task) {
  let attempts = 0
  const timer = setInterval(async () => {
    attempts++
    try {
      const res = await request.get(`/material-tasks/${task.id}/video-status`)
      if (res.code === 0 && res.data) {
        if (res.data.video_url) {
          clearInterval(timer)
          if (!task.source_data) task.source_data = {}
          task.source_data.video_url = res.data.video_url
          task.source_data.compose_status = 'done'
          task.source_data.compose_at = res.data.compose_at
          task.source_data.video_size = res.data.video_size
          message.success('视频合成完成！')
        } else if (res.data.compose_status === 'failed') {
          clearInterval(timer)
          task.source_data.compose_status = 'failed'
          task.source_data.compose_error = res.data.compose_error || '合成失败'
          message.error('视频合成失败')
        }
      }
    } catch {}
    if (attempts >= 30) {
      clearInterval(timer)
      if (!task.source_data?.video_url) {
        task.source_data.compose_status = 'failed'
        task.source_data.compose_error = '合成超时，请刷新页面查看'
      }
    }
  }, 3000)
}

async function checkComposeStatus(task) {
  try {
    const res = await request.get(`/material-tasks/${task.id}/video-status`)
    if (res.code === 0 && res.data) {
      if (res.data.video_url) {
        if (!task.source_data) task.source_data = {}
        task.source_data.video_url = res.data.video_url
        task.source_data.compose_status = 'done'
        task.source_data.compose_at = res.data.compose_at
        task.source_data.video_size = res.data.video_size
        message.success('视频已就绪！')
      } else if (res.data.compose_status === 'failed') {
        task.source_data.compose_status = 'failed'
        task.source_data.compose_error = res.data.compose_error
      } else {
        message.info('仍在合成中...')
      }
    }
  } catch { message.error('状态查询失败') }
}

onMounted(() => loadTasks())
</script>

<style scoped>
.tasks-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: calc(var(--tabnav-h, 0px) + var(--safe-b, 0px) + 16px);
}

.tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 8px;
}
.header-left { display: flex; align-items: center; gap: 10px; }
.page-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.task-count { font-size: 12px; color: var(--text-hint); background: #f0f0f0; padding: 2px 8px; border-radius: 10px; }

.generate-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 20px; border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, #722ED1, #9254DE);
  color: #fff; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.3s;
  box-shadow: 0 2px 10px rgba(114,46,209,0.3);
}
.generate-btn:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(114,46,209,0.4); transform: translateY(-1px); }
.generate-btn:disabled { opacity: 0.6; cursor: not-allowed; }

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
.tab-item.active { background: #722ED1; color: #fff; border-color: #722ED1; }
.tab-item:hover:not(.active) { border-color: #722ED1; color: #722ED1; }

/* 任务卡片 */
.task-list { display: flex; flex-direction: column; gap: 10px; }
.task-card {
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.task-card.expanded { box-shadow: 0 2px 12px rgba(114,46,209,0.12); }

.task-card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; cursor: pointer;
}
.task-info { flex: 1; min-width: 0; }
.task-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.task-type-tag {
  padding: 1px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 600;
  background: #E6F4FF; color: #1677FF;
  white-space: nowrap;
}
.task-title { font-size: 14px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-meta { display: flex; align-items: center; gap: 10px; }
.hot-topic-mini { font-size: 12px; color: #C41D7F; }
.task-time { font-size: 11px; color: var(--text-hint); }

.task-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.status-tag {
  padding: 2px 10px; border-radius: 10px;
  font-size: 11px; font-weight: 600;
}
.status-pending { background: #FFF7E6; color: #D48806; }
.status-producing { background: #E6F7FF; color: #1677FF; }
.status-reviewing { background: #F9F0FF; color: #722ED1; }
.status-approved { background: #F6FFED; color: #389E0D; }
.status-rejected { background: #FFF2F0; color: #FF4D4F; }

.expand-icon { transition: transform 0.2s; color: var(--text-hint); }
.expand-icon.rotated { transform: rotate(180deg); }

/* 展开详情 */
.task-detail {
  padding: 0 16px 16px;
  border-top: 1px dashed var(--border);
  margin-top: 0;
}
.detail-label { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 12px 0 6px; }

.detail-hook { background: #FFF0F6; border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
.detail-hook .detail-label { margin-top: 0; color: #C41D7F; }
.detail-hook-text { font-size: 13px; color: #AD2067; line-height: 1.6; }

.detail-scenes { margin-top: 8px; }
.scene-item { display: flex; gap: 8px; margin-bottom: 8px; }
.scene-time {
  flex-shrink: 0; width: 50px; padding: 4px 0;
  font-size: 11px; font-weight: 700; color: #722ED1;
  text-align: center; background: #F0E6FF; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.scene-body { flex: 1; font-size: 12px; line-height: 1.6; }
.scene-content { color: #333; margin-bottom: 2px; }
.scene-narration { color: #1677FF; font-style: italic; }

.detail-cta { background: #FFFBE6; border-radius: 8px; padding: 10px 12px; margin-top: 8px; }
.detail-cta .detail-label { margin-top: 0; color: #D48806; }
.detail-cta-text { font-size: 13px; color: #AD6800; line-height: 1.6; }

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
.status-btn:hover:not(:disabled) { border-color: #722ED1; color: #722ED1; }
.status-btn.active { opacity: 0.5; cursor: default; }
.status-btn.btn-approved:hover:not(:disabled) { border-color: #52c41a; color: #389E0D; }
.status-btn.btn-rejected:hover:not(:disabled) { border-color: #FF4D4F; color: #FF4D4F; }

/* 视频匹配 */
.detail-video { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #f0f0f0; }
.video-gen-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 16px; border-radius: 16px;
  border: 1px solid #722ED1; background: #F9F0FF;
  color: #722ED1; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.video-gen-btn.small { padding: 3px 10px; font-size: 11px; }
.video-gen-btn:hover:not(:disabled) { background: #722ED1; color: #fff; }
.video-gen-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.video-clips .detail-label { margin-top: 0; }
.clip-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.clip-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  background: #FAFAFA; border-radius: 8px; font-size: 12px; flex-wrap: wrap;
}
.clip-scene { font-weight: 700; color: #722ED1; min-width: 45px; }
.clip-desc { flex: 1; color: #666; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clip-type-tag { padding: 1px 6px; border-radius: 4px; background: #E6F4FF; color: #1677FF; font-size: 10px; white-space: nowrap; }
.clip-play {
  padding: 2px 8px; border-radius: 10px; background: #F6FFED; color: #389E0D;
  font-size: 11px; font-weight: 600; text-decoration: none; border: 1px solid #B7EB8F; white-space: nowrap;
}
.clip-play:hover { background: #389E0D; color: #fff; }
.video-meta { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.video-time { font-size: 11px; color: var(--text-hint); }
.video-compose-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 20px; border-radius: 16px;
  border: none; background: linear-gradient(135deg, #722ED1, #1677FF);
  color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.video-compose-btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.02); }
.video-compose-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.video-player-box { margin-top: 4px; }
.video-player { width: 100%; max-width: 400px; border-radius: 12px; background: #000; margin-top: 6px; }
.video-download {
  padding: 2px 8px; border-radius: 10px; background: #E6F4FF; color: #1677FF;
  font-size: 11px; font-weight: 600; text-decoration: none; border: 1px solid #91CAFF;
}
.video-download:hover { background: #1677FF; color: #fff; }
.video-size { font-size: 11px; color: var(--text-hint); }
.compose-loading { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #722ED1; padding: 8px 0; }
.compose-error { font-size: 12px; color: #FF4D4F; padding: 8px 0; display: flex; align-items: center; }

.loading-state { display: flex; justify-content: center; padding: 60px; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; color: var(--text-hint); gap: 8px; }
.empty-hint { font-size: 12px; }
</style>
