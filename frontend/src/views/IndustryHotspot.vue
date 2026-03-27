<template>
  <div class="dd-page">
    <!-- 移动端脚本面板返回 -->
    <div v-if="isMobile && showScript" class="dd-navbar">
      <button class="dd-navbar__back" @click="showScript = false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        <span>返回列表</span>
      </button>
      <span class="dd-navbar__title">AI脚本</span>
      <span style="width:60px"></span>
    </div>

    <div class="dd-split" :class="{ 'dd-split--detail': isMobile && showScript }">
      <!-- 热点列表面板 -->
      <div class="dd-list-panel" v-show="!isMobile || !showScript">
        <div class="dd-list-head">
          <div class="dd-list-head__title">抖音热点话题</div>
          <button class="dd-btn dd-btn--primary dd-btn--sm" @click="refreshTopics" :disabled="refreshing">
            <svg v-if="!refreshing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {{ refreshing ? 'AI分析中...' : '刷新热点' }}
          </button>
        </div>

        <div class="dd-scroll-list">
          <div v-if="loading" class="dd-loading">
            <div class="dd-dots"><i></i><i></i><i></i></div>
            <span>加载中</span>
          </div>

          <template v-else-if="topics.length">
            <div v-for="(topic, idx) in topics" :key="topic.id"
              class="dd-card dd-card--tap"
              :class="{ 'dd-card--selected': selectedTopic?.id === topic.id }"
              @click="selectTopic(topic)">
              <div class="dd-card__row">
                <span class="dd-hotrank" :class="'dd-hotrank--' + (idx < 3 ? (idx+1) : 'n')">{{ idx + 1 }}</span>
                <span class="dd-card__heat">{{ formatHeat(topic.heat_score) }}</span>
                <div class="dd-card__arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
              <div class="dd-card__title">{{ topic.title }}</div>
              <div v-if="topic.description" class="dd-card__desc">{{ topic.description }}</div>
              <div v-if="topic.recommend_score" class="dd-card__recommend">
                <span class="dd-stars">{{ '\u2605'.repeat(topic.recommend_score) }}{{ '\u2606'.repeat(5 - topic.recommend_score) }}</span>
                <span class="dd-recommend-text">{{ topic.recommend_reason }}</span>
              </div>
              <div v-if="topic.hook_angle" class="dd-card__hook">{{ topic.hook_angle }}</div>
              <div class="dd-card__row dd-card__row--bottom">
                <div class="dd-card__tags">
                  <span v-for="tag in (topic.tags || []).slice(0, 3)" :key="tag" class="dd-tag dd-tag--blue dd-tag--sm">{{ tag }}</span>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="dd-empty">
            <div class="dd-empty__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <p class="dd-empty__text">暂无热点数据</p>
            <p class="dd-empty__sub">点击「刷新热点」获取最新美妆行业趋势</p>
            <button class="dd-btn dd-btn--primary dd-btn--sm" style="margin-top:12px" @click="refreshTopics" :disabled="refreshing">
              {{ refreshing ? '分析中...' : '获取热点' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 脚本面板 -->
      <div class="dd-detail-panel" v-show="!isMobile || showScript">
        <div v-if="!selectedTopic" class="dd-welcome">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="1.2" opacity="0.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <h3 class="dd-welcome__title">AI脚本工坊</h3>
          <p class="dd-welcome__desc">选择热点话题，AI为你生成专业脚本</p>
        </div>

        <template v-else>
          <!-- 话题标题栏 -->
          <div class="dd-detail-head">
            <span class="dd-tag dd-tag--danger">{{ selectedTopic.title }}</span>
          </div>

          <!-- 聊天列表 -->
          <div class="dd-chat-scroll" ref="chatArea">
            <div v-for="script in scripts" :key="script.id" class="dd-chat-pair">
              <!-- 用户消息 -->
              <div class="dd-chat-user">
                <div class="dd-bubble dd-bubble--user">
                  <div class="dd-bubble__label">{{ scriptTypeLabel(script.script_type) }} · {{ script.user_prompt || '油皮女生' }}</div>
                  基于热点「{{ script.topic_title }}」生成脚本
                </div>
              </div>
              <!-- AI回复 -->
              <div class="dd-chat-ai">
                <div class="dd-ai-avatar">AI</div>
                <div class="dd-chat-ai__body">
                  <div v-if="script.status === 'done'" class="dd-bubble dd-bubble--ai">
                    <div class="dd-script-text" v-html="formatScript(script.script_content)"></div>
                    <div class="dd-script-actions">
                      <button class="dd-btn dd-btn--ghost dd-btn--sm" @click="copyScript(script)">复制</button>
                      <button class="dd-btn dd-btn--ghost dd-btn--sm" @click="regenerate(script)">重新生成</button>
                    </div>
                  </div>
                  <div v-else-if="script.status === 'generating'" class="dd-bubble dd-bubble--ai dd-bubble--loading">
                    <div class="dd-dots"><i></i><i></i><i></i></div>
                    <span>脚本生成中...</span>
                  </div>
                  <div v-else class="dd-bubble dd-bubble--ai dd-bubble--error">
                    生成失败{{ script.error_msg ? '：' + script.error_msg : '' }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作区 -->
          <div class="dd-float-bar">
            <div class="dd-float-bar__inner">
              <div class="dd-chip-row">
                <span class="dd-chip-label">人群</span>
                <div class="dd-chips">
                  <button v-for="a in audienceTypes" :key="a.value"
                    class="dd-chip" :class="{ 'dd-chip--active': audienceType === a.value }"
                    @click="audienceType = a.value">
                    {{ a.label }}
                  </button>
                </div>
              </div>
              <button class="dd-btn dd-btn--primary dd-btn--lg dd-btn--block" @click="generateScript" :disabled="generating">
                {{ generating ? '生成中...' : '生成脚本' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import request from '../utils/request'

const topics = ref([])
const scripts = ref([])
const selectedTopic = ref(null)
const scriptType = ref('short_video')
const audienceType = ref('category_potential')
const loading = ref(false)
const refreshing = ref(false)
const generating = ref(false)
const showScript = ref(false)
const isMobile = ref(false)
const chatArea = ref(null)
let pollTimer = null

const audienceTypes = [
  { value: 'category_potential', label: '品类潜在' },
  { value: 'product_potential', label: '产品潜在' },
  { value: 'precise_demand', label: '精准刚需' },
]

function checkMobile() { isMobile.value = window.innerWidth < 768 }
function formatHeat(n) { if (!n) return '0'; if (n >= 10000) return (n / 10000).toFixed(1) + 'w'; return n.toString() }
function scriptTypeLabel(type) { return { short_video: '短视频脚本', live_intro: '直播开场', product_review: '产品测评' }[type] || '脚本' }

function formatScript(text) {
  if (!text) return ''
  return text.replace(/\n/g, '<br>')
    .replace(/【(.*?)】/g, '<span class="dd-mark--blue">【$1】</span>')
    .replace(/「(.*?)」/g, '<span class="dd-mark--red">「$1」</span>')
}

function getAudienceLabel() {
  return audienceTypes.find(a => a.value === audienceType.value)?.label || '品类潜在'
}

function scrollBottom() { nextTick(() => { if (chatArea.value) chatArea.value.scrollTop = chatArea.value.scrollHeight }) }

async function loadTopics() {
  loading.value = true
  try {
    const r = await request.get('/industry/hotspots', { params: { page: 1, page_size: 30 } })
    if (r?.code === 0) topics.value = r.data?.list || []
  } catch {} finally { loading.value = false }
}

async function refreshTopics() {
  refreshing.value = true
  try {
    const r = await request.post('/industry/hotspots/refresh')
    if (r?.code === 0) topics.value = r.data?.list || []
    else alert(r?.msg || '刷新失败')
  } catch (e) { alert('请求失败: ' + e.message) } finally { refreshing.value = false }
}

async function selectTopic(topic) {
  selectedTopic.value = topic
  if (isMobile.value) showScript.value = true
  await loadScripts(topic.id)
}

async function loadScripts(hotspotId) {
  try {
    const r = await request.get('/industry/scripts/list', { params: { hotspot_id: hotspotId, page_size: 50 } })
    if (r?.code === 0) scripts.value = (r.data?.list || []).reverse()
    scrollBottom()
  } catch {}
}

async function generateScript() {
  if (!selectedTopic.value || generating.value) return
  generating.value = true
  try {
    const audienceLabel = getAudienceLabel()
    const r = await request.post('/industry/scripts/generate', {
      hotspot_id: selectedTopic.value.id,
      topic_title: selectedTopic.value.title,
      topic_description: selectedTopic.value.description,
      target_audience: audienceLabel,
      hook_angle: selectedTopic.value.hook_angle || '',
      script_type: scriptType.value,
      custom_prompt: `目标人群：${audienceLabel}`,
    })
    if (r?.code === 0) {
      scripts.value.push({
        id: r.data.id, topic_title: selectedTopic.value.title,
        script_type: scriptType.value, user_prompt: audienceLabel,
        status: 'generating',
      })
      scrollBottom()
    } else { alert(r?.msg || '生成失败') }
  } catch (e) { alert('请求失败: ' + e.message) } finally { generating.value = false }
}

function regenerate(script) { scriptType.value = script.script_type || 'short_video'; generateScript() }

async function copyScript(script) {
  try { await navigator.clipboard.writeText(script.script_content); alert('已复制') } catch { alert('复制失败') }
}

function pollScripts() {
  if (scripts.value.some(s => s.status === 'generating') && selectedTopic.value) {
    loadScripts(selectedTopic.value.id)
  }
}

onMounted(() => {
  checkMobile(); window.addEventListener('resize', checkMobile)
  loadTopics()
  pollTimer = setInterval(pollScripts, 5000)
})
onUnmounted(() => { window.removeEventListener('resize', checkMobile); if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
/* ===== Page Shell ===== */
.dd-page {
  display: flex; flex-direction: column;
  height: calc(100vh - var(--header-h) - var(--tabnav-h) - var(--safe-b));
  margin: -16px; background: var(--bg-page);
}
@media (min-width: 768px) {
  .dd-page { height: calc(100vh - var(--header-h)); margin: -20px -24px; }
}

/* Navbar */
.dd-navbar {
  display: flex; align-items: center; justify-content: space-between;
  height: 44px; padding: 0 12px;
  background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.dd-navbar__back {
  display: flex; align-items: center; gap: 2px;
  background: none; border: none; color: var(--c-primary);
  font-size: 14px; cursor: pointer; padding: 0;
}
.dd-navbar__title { font-size: 15px; font-weight: 600; color: var(--text-primary); }

/* Split */
.dd-split { display: flex; flex: 1; overflow: hidden; }
@media (max-width: 767px) {
  .dd-split { flex-direction: column; position: relative; }
  .dd-split--detail .dd-detail-panel { display: flex !important; }
}

/* List Panel */
.dd-list-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--bg-card); }
@media (min-width: 768px) { .dd-list-panel { width: 380px; flex-shrink: 0; border-right: 1px solid var(--border); } }

.dd-list-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px; flex-shrink: 0;
}
.dd-list-head__title { font-size: 16px; font-weight: 600; color: var(--text-primary); }

.dd-scroll-list { flex: 1; overflow-y: auto; padding: 0 8px 8px; -webkit-overflow-scrolling: touch; }

/* Card */
.dd-card {
  background: var(--bg-card); border-radius: var(--radius-sm);
  padding: 12px; margin-bottom: 8px;
  border: 1.5px solid transparent; transition: all 0.15s;
}
.dd-card--tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.dd-card--tap:active { background: var(--bg-secondary); transform: scale(0.99); }
.dd-card--selected { border-color: var(--c-primary); background: var(--c-primary-bg); }

.dd-card__row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.dd-card__row--bottom { margin-bottom: 0; margin-top: 6px; }
.dd-card__title { font-size: 14px; font-weight: 500; color: var(--text-primary); line-height: 1.4; margin-bottom: 4px; }
.dd-card__desc {
  font-size: 12px; color: var(--text-hint); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin-bottom: 4px;
}
.dd-card__heat { font-size: 11px; color: var(--c-danger); background: var(--c-danger-bg); padding: 1px 8px; border-radius: 10px; }
.dd-card__arrow { margin-left: auto; color: var(--text-hint); display: flex; }
.dd-card__recommend { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.dd-stars { color: var(--c-orange); font-size: 12px; letter-spacing: 1px; flex-shrink: 0; }
.dd-recommend-text { font-size: 11px; color: var(--c-success); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd-card__hook {
  font-size: 11px; color: var(--c-warning); background: var(--c-warning-bg);
  padding: 3px 8px; border-radius: var(--radius-xs); margin-bottom: 4px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
}
.dd-card__tags { display: flex; gap: 4px; flex-wrap: wrap; }

.dd-hotrank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: var(--bg-secondary); color: var(--text-hint);
}
.dd-hotrank--1 { background: var(--c-danger); color: #fff; }
.dd-hotrank--2 { background: var(--c-orange); color: #fff; }
.dd-hotrank--3 { background: var(--c-warning); color: #fff; }

.dd-tag {
  display: inline-flex; align-items: center; padding: 2px 8px;
  border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap;
}
.dd-tag--sm { font-size: 10px; padding: 1px 6px; }
.dd-tag--blue { color: var(--c-primary); background: var(--c-primary-bg); }
.dd-tag--danger { color: var(--c-danger); background: var(--c-danger-bg); font-weight: 600; padding: 3px 10px; border-radius: 12px; }

/* Detail Panel */
.dd-detail-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-page); position: relative; }
@media (max-width: 767px) { .dd-detail-panel { position: absolute; inset: 0; top: 44px; z-index: 5; display: none; } }

.dd-welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; }
.dd-welcome__title { font-size: 18px; color: var(--text-primary); margin: 16px 0 6px; }
.dd-welcome__desc { font-size: 13px; color: var(--text-hint); }

.dd-detail-head { padding: 12px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }

/* Chat */
.dd-chat-scroll {
  flex: 1; overflow-y: auto; padding: 16px 16px 140px;
  -webkit-overflow-scrolling: touch;
}
@media (min-width: 768px) { .dd-chat-scroll { max-width: 720px; margin: 0 auto; width: 100%; } }

.dd-chat-pair { margin-bottom: 20px; }
.dd-chat-user { display: flex; justify-content: flex-end; margin-bottom: 10px; }
.dd-chat-ai { display: flex; gap: 8px; align-items: flex-start; }

.dd-ai-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, var(--c-primary), var(--c-purple));
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.dd-chat-ai__body { max-width: calc(100% - 44px); display: flex; flex-direction: column; gap: 8px; }

.dd-bubble {
  padding: 12px 16px; border-radius: 16px;
  font-size: 14px; line-height: 1.6; word-break: break-word;
}
.dd-bubble--user {
  background: var(--c-primary); color: #fff;
  border-bottom-right-radius: 4px; max-width: 85%;
}
.dd-bubble--ai {
  background: var(--bg-card); color: var(--text-primary);
  border-bottom-left-radius: 4px; box-shadow: var(--shadow-xs);
}
.dd-bubble--loading {
  display: flex; align-items: center; gap: 8px;
  color: var(--text-hint); font-size: 13px;
}
.dd-bubble--error { color: var(--c-danger); background: var(--c-danger-bg); }
.dd-bubble__label { display: block; font-size: 11px; opacity: 0.7; margin-bottom: 4px; }

.dd-script-text { font-size: 14px; line-height: 1.8; }
.dd-script-text :deep(.dd-mark--blue) { color: var(--c-primary); font-weight: 600; }
.dd-script-text :deep(.dd-mark--red) { color: var(--c-danger); }
.dd-script-actions {
  display: flex; gap: 8px; margin-top: 10px;
  padding-top: 10px; border-top: 1px solid var(--divider);
}

/* Float Bar */
.dd-float-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 0 16px 16px; display: flex; justify-content: center;
  pointer-events: none; z-index: 10;
}
@media (min-width: 768px) { .dd-float-bar { padding: 0 24px 20px; } }
@media (max-width: 767px) { .dd-float-bar { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); } }

.dd-float-bar__inner {
  width: 100%; max-width: 720px;
  background: var(--bg-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md), 0 0 0 1px rgba(0,0,0,0.04);
  pointer-events: all; padding: 14px 16px;
}

.dd-chip-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dd-chip-label { font-size: 13px; color: var(--text-hint); flex-shrink: 0; font-weight: 500; }
.dd-chips { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.dd-chips::-webkit-scrollbar { display: none; }
.dd-chip {
  padding: 6px 14px; border-radius: 18px; font-size: 12px; font-weight: 500;
  color: var(--text-secondary); background: var(--bg-secondary);
  border: 1px solid transparent; cursor: pointer; white-space: nowrap;
  flex-shrink: 0; transition: all 0.2s; -webkit-tap-highlight-color: transparent;
}
.dd-chip:active { transform: scale(0.96); }
.dd-chip--active { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }

/* Buttons */
.dd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s; white-space: nowrap; -webkit-tap-highlight-color: transparent;
}
.dd-btn:active { transform: scale(0.97); }
.dd-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.dd-btn--sm { padding: 5px 12px; font-size: 12px; }
.dd-btn--lg { padding: 12px 20px; font-size: 15px; font-weight: 600; border-radius: var(--radius-md); }
.dd-btn--block { flex: 1; }
.dd-btn--primary { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }
.dd-btn--primary:active:not(:disabled) { background: #1060DD; }
.dd-btn--ghost { background: var(--bg-card); color: var(--text-secondary); border-color: var(--border); }
.dd-btn--ghost:active:not(:disabled) { background: var(--bg-secondary); }

/* Utilities */
.dd-dots { display: flex; gap: 4px; }
.dd-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-hint); animation: dd-bounce 1.4s infinite; font-style: normal; }
.dd-dots i:nth-child(2) { animation-delay: 0.16s; }
.dd-dots i:nth-child(3) { animation-delay: 0.32s; }
@keyframes dd-bounce { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }

.dd-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 48px 16px; color: var(--text-hint); font-size: 13px; }
.dd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 48px 20px; text-align: center; }
.dd-empty__icon { margin-bottom: 12px; opacity: 0.4; }
.dd-empty__text { font-size: 13px; color: var(--text-hint); margin: 0 0 4px; }
.dd-empty__sub { font-size: 12px; color: var(--text-hint); margin: 0; opacity: 0.7; }
</style>
