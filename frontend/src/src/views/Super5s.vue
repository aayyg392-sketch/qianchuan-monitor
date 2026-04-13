<template>
  <div class="super5s-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <h2 class="page-title">超级5秒镜头</h2>
      <button class="btn-analyze" @click="handleAnalyze" :disabled="analyzing">
        <span v-if="analyzing" class="loading-spinner"></span>
        {{ analyzing ? 'AI分析中...' : 'AI生成Hook' }}
      </button>
    </div>

    <!-- 统计栏 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-val">{{ stats.total }}</span>
        <span class="stat-label">总数量</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-val green">{{ stats.videoCount }}</span>
        <span class="stat-label">已生成视频</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-val blue">{{ stats.avgScore }}</span>
        <span class="stat-label">平均分</span>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading && !list.length" class="loading-box">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!list.length" class="empty-box">
      <div class="empty-icon">🎬</div>
      <p>暂无Hook数据</p>
      <p class="empty-hint">点击"AI生成Hook"按钮，AI将分析素材并生成超级5秒镜头脚本</p>
    </div>

    <!-- Hook卡片列表 -->
    <div v-else class="hook-list">
      <div v-for="item in list" :key="item.id" class="hook-card">
        <!-- 卡片头部：标签 + 评分 -->
        <div class="card-top">
          <span class="style-tag" :style="{ background: styleColors[item.style] || '#999', color: '#fff' }">
            {{ styleLabels[item.style] || item.style }}
          </span>
          <span class="card-score">AI评分 <strong>{{ item.score }}</strong></span>
        </div>

        <!-- Hook文案 -->
        <div class="hook-text">"{{ item.hook_text }}"</div>

        <!-- 场景描述 -->
        <div class="scene-desc">📹 {{ item.scene_desc }}</div>

        <!-- 视频区域 -->
        <div class="video-area">
          <template v-if="item.video_url">
            <video
              :src="item.video_url"
              controls
              playsinline
              preload="metadata"
              class="video-player"
            ></video>
            <div class="video-actions-row">
              <button class="btn-regenerate" @click="handleGenerateJimeng(item)" :disabled="item._generatingJimeng">
                <span v-if="item._generatingJimeng" class="loading-spinner small"></span>
                {{ item._generatingJimeng ? '即梦生成中...' : '即梦重新生成' }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="video-btn-group">
              <button
                class="btn-generate-video"
                @click="handleGenerateVideo(item)"
                :disabled="item._generating || item._generatingJimeng"
              >
                <span v-if="item._generating" class="loading-spinner small"></span>
                {{ item._generating ? '生成中...' : '素材拼接视频' }}
              </button>
              <button
                class="btn-generate-jimeng"
                @click="handleGenerateJimeng(item)"
                :disabled="item._generating || item._generatingJimeng"
              >
                <span v-if="item._generatingJimeng" class="loading-spinner small"></span>
                {{ item._generatingJimeng ? '即梦AI生成中...' : '即梦AI生成视频' }}
              </button>
            </div>
          </template>
        </div>

        <!-- 反馈按钮 -->
        <div class="feedback-row">
          <button class="fb-btn fb-like" :class="{ active: item._liked }" @click="handleFeedback(item, 'like')">
            <span>👍</span> {{ item.likes || 0 }}
          </button>
          <button class="fb-btn fb-dislike" :class="{ active: item._disliked }" @click="handleFeedback(item, 'dislike')">
            <span>👎</span> {{ item.dislikes || 0 }}
          </button>
          <button class="fb-btn fb-download" @click="handleFeedback(item, 'download')" :disabled="!item.video_url || item.video_status !== 'done'">
            <span>⬇</span> {{ item.downloads || 0 }}
          </button>
        </div>

        <!-- 来源参考 -->
        <div class="source-refs" v-if="item.source_refs">
          <span class="ref-label">参考:</span>
          <span class="ref-text">{{ item.source_refs }}</span>
        </div>
      </div>

      <!-- 加载更多 -->
      <div v-if="hasMore" class="load-more" ref="loadMoreRef">
        <div v-if="loadingMore" class="loading-more">
          <div class="spinner small"></div>
          <span>加载更多...</span>
        </div>
      </div>

      <!-- 没有更多 -->
      <div v-if="!hasMore && list.length" class="no-more">
        已加载全部
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'

const styleColors = {
  pain: '#FF4D4F',
  compare: '#1677FF',
  suspense: '#722ED1',
  display: '#52C41A',
  emotion: '#FA8C16',
}

const styleLabels = {
  pain: '痛点',
  compare: '对比',
  suspense: '悬念',
  display: '展示',
  emotion: '情绪',
}

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 30
const loading = ref(false)
const loadingMore = ref(false)
const analyzing = ref(false)
const loadMoreRef = ref(null)

let scrollObserver = null

const hasMore = computed(() => list.value.length < total.value)

const stats = computed(() => {
  const items = list.value
  const videoCount = items.filter(i => i.video_url).length
  const scores = items.filter(i => i.score).map(i => Number(i.score))
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-'
  return {
    total: total.value,
    videoCount,
    avgScore,
  }
})

async function fetchList(append = false) {
  if (!append) {
    loading.value = true
    page.value = 1
  } else {
    loadingMore.value = true
  }
  try {
    const res = await request.get('/super5s/list', {
      params: { page: page.value, pageSize },
    })
    if (res.code === 0 || res.data) {
      const items = (res.data?.list || res.data?.items || []).map(i => ({
        ...i,
        _generating: false,
        _generatingJimeng: false,
      }))
      if (append) {
        list.value.push(...items)
      } else {
        list.value = items
      }
      total.value = res.data?.total || 0
    }
  } catch (e) {
    console.error('加载Hook列表失败', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function handleAnalyze() {
  analyzing.value = true
  try {
    const res = await request.post('/super5s/analyze')
    if (res.code === 0 || res.data) {
      message.success('AI分析已完成，正在刷新列表')
      await fetchList()
    } else {
      message.error(res.msg || 'AI分析失败')
    }
  } catch (e) {
    message.error('AI分析请求失败，请重试')
    console.error('AI分析失败', e)
  } finally {
    analyzing.value = false
  }
}

async function handleGenerateVideo(item) {
  item._generating = true
  try {
    const res = await request.post(`/super5s/${item.id}/generate`)
    if (res.code === 0 || res.data) {
      item.video_url = res.data?.video_url || ''
      item.video_status = res.data?.video_status || 'done'
      message.success('视频生成成功')
    } else {
      message.error(res.msg || '视频生成失败')
    }
  } catch (e) {
    message.error('视频生成请求失败')
    console.error('视频生成失败', e)
  } finally {
    item._generating = false
  }
}

async function handleGenerateJimeng(item) {
  item._generatingJimeng = true
  try {
    const res = await request.post(`/super5s/${item.id}/generate-jimeng`)
    if (res.code === 0 || res.data) {
      item.video_url = res.data?.video_url || ''
      item.video_status = res.data?.status || 'done'
      message.success('即梦AI视频生成成功')
    } else {
      message.error(res.msg || '即梦AI视频生成失败')
    }
  } catch (e) {
    message.error('即梦AI视频生成请求失败')
    console.error('即梦AI生成失败', e)
  } finally {
    item._generatingJimeng = false
  }
}

async function handleFeedback(item, action) {
  try {
    const res = await axios.post(`/api/super5s/${item.id}/feedback`, { action })
    if (res.data.code === 0) {
      const d = res.data.data
      item.likes = d.likes
      item.dislikes = d.dislikes
      item.downloads = d.downloads
      if (action === 'like') item._liked = true
      if (action === 'dislike') item._disliked = true
      if (action === 'download' && item.video_url) {
        // 触发视频下载
        const a = document.createElement('a')
        a.href = item.video_url
        a.download = `hook_${item.id}.mp4`
        a.click()
      }
    }
  } catch (e) {
    console.error('反馈失败', e)
  }
}

function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  page.value++
  fetchList(true)
}

function setupScrollObserver() {
  nextTick(() => {
    if (!loadMoreRef.value) return
    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '200px' }
    )
    scrollObserver.observe(loadMoreRef.value)
  })
}

onMounted(() => {
  fetchList()
  // Use MutationObserver-like approach: watch for loadMoreRef after list loads
  const checkObserver = setInterval(() => {
    if (loadMoreRef.value && !scrollObserver) {
      setupScrollObserver()
      clearInterval(checkObserver)
    }
  }, 500)
  // Cleanup interval after 10s max
  setTimeout(() => clearInterval(checkObserver), 10000)
})

onUnmounted(() => {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
})
</script>

<style scoped>
.super5s-page {
  min-height: 100vh;
  background: var(--bg-page, #F5F6F8);
  padding-bottom: calc(var(--tabnav-h, 0px) + var(--safe-b, 0px) + 24px);
}

/* 顶部操作栏 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #FFF7E6 0%, #FFF0F6 100%);
  border-bottom: 1px solid var(--border, #F0F1F3);
  position: sticky;
  top: var(--header-h, 0);
  z-index: 10;
}
.page-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #1A1A2E);
}
.btn-analyze {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(135deg, #FA8C16, #FF4D4F);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(250, 140, 22, 0.3);
}
.btn-analyze:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(250, 140, 22, 0.4);
}
.btn-analyze:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 12px 14px;
  padding: 14px 0;
  background: #fff;
  border-radius: var(--radius-md, 12px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-val {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary, #1A1A2E);
}
.stat-val.green { color: #52C41A; }
.stat-val.blue { color: #1677FF; }
.stat-label {
  font-size: 12px;
  color: var(--text-hint, #BFBFBF);
}
.stat-divider {
  width: 1px;
  height: 28px;
  background: var(--border, #F0F1F3);
}

/* 加载 & 空状态 */
.loading-box,
.empty-box {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-hint, #BFBFBF);
}
.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.empty-hint {
  font-size: 13px;
  color: var(--text-hint, #BFBFBF);
  margin-top: 8px;
}

/* Hook卡片列表 */
.hook-list {
  padding: 0 14px;
}
.hook-card {
  background: #fff;
  border-radius: var(--radius-md, 12px);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s;
}
.hook-card:active {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* 卡片头部 */
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.style-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}
.card-score {
  font-size: 13px;
  color: var(--text-hint, #BFBFBF);
}
.card-score strong {
  font-size: 18px;
  font-weight: 800;
  color: #FA8C16;
  margin-left: 2px;
}

/* Hook文案 */
.hook-text {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #1A1A2E);
  line-height: 1.5;
  margin-bottom: 8px;
}

/* 场景描述 */
.scene-desc {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  margin-bottom: 12px;
}

/* 视频区域 */
.video-area {
  margin-bottom: 12px;
}
.video-player {
  width: 100%;
  border-radius: 8px;
  background: #000;
  max-height: 220px;
}
.btn-generate-video {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: 10px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  background: #FAFAFA;
  color: var(--c-primary, #1677FF);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-generate-video:hover:not(:disabled) {
  border-color: var(--c-primary, #1677FF);
  background: #E8F4FF;
}
.btn-generate-video:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 视频按钮组 */
.video-btn-group {
  display: flex;
  gap: 8px;
}
.btn-generate-jimeng {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: 10px;
  border: 1px dashed #722ED1;
  border-radius: 8px;
  background: #F9F0FF;
  color: #722ED1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-generate-jimeng:hover:not(:disabled) {
  border-color: #722ED1;
  background: #EFDBFF;
}
.btn-generate-jimeng:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.video-actions-row {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.btn-regenerate {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #722ED1;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.btn-regenerate:hover:not(:disabled) {
  border-color: #722ED1;
  background: #F9F0FF;
}
.btn-regenerate:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 反馈按钮 */
.feedback-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}
.fb-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 16px;
  background: #fafafa;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}
.fb-btn:hover:not(:disabled) {
  background: #f0f0f0;
}
.fb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.fb-like.active {
  background: #F6FFED;
  border-color: #B7EB8F;
  color: #52C41A;
}
.fb-dislike.active {
  background: #FFF1F0;
  border-color: #FFA39E;
  color: #FF4D4F;
}
.fb-download:hover:not(:disabled) {
  background: #E6F7FF;
  border-color: #91D5FF;
  color: #1890FF;
}

/* 来源参考 */
.source-refs {
  font-size: 12px;
  color: var(--text-hint, #BFBFBF);
  line-height: 1.5;
  padding-top: 10px;
  border-top: 1px solid var(--border, #F0F1F3);
}
.ref-label {
  font-weight: 600;
  margin-right: 4px;
}
.ref-text {
  color: #999;
}

/* 加载更多 */
.load-more {
  padding: 16px 0;
}
.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-hint, #BFBFBF);
}
.no-more {
  text-align: center;
  padding: 16px 0 8px;
  font-size: 13px;
  color: var(--text-hint, #BFBFBF);
}

/* 加载动画 */
.spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 3px solid var(--c-primary, #1677FF);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.loading-spinner.small {
  border-color: var(--c-primary, #1677FF);
  border-top-color: transparent;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 响应式：桌面端 */
@media (min-width: 768px) {
  .super5s-page {
    max-width: 800px;
    margin: 0 auto;
  }
  .page-header {
    border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
  }
  .hook-card:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
  .video-player {
    max-height: 360px;
  }
}

@media (min-width: 1024px) {
  .super5s-page {
    max-width: 960px;
  }
  .hook-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .hook-card {
    margin-bottom: 0;
  }
  .load-more,
  .no-more {
    grid-column: 1 / -1;
  }
}
</style>
