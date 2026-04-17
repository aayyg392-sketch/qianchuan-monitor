<template>
  <div class="ac">
    <div class="ac-top">
      <span class="ac-title">磁力素材评论</span>
      <div class="ac-acts">
        <select class="ac-sel" v-model="shopId" @change="loadData">
          <option value="">全部店铺</option>
          <option v-for="s in shopList" :key="s.shop_id" :value="s.shop_id">{{ s.shop_name }}</option>
        </select>
        <button class="ac-btn" :disabled="syncing" @click="syncComments">{{ syncing ? '同步中...' : '同步评论' }}</button>
        <button class="ac-btn ac-btn-ai" :disabled="batchReplying" @click="batchAiReply">{{ batchReplying ? 'AI回复中...' : 'AI批量回复' }}</button>
      </div>
    </div>

    <!-- 统计 -->
    <div class="ac-stats" v-if="stats">
      <div class="ac-stat"><span class="ac-stat-n">{{ stats.total_count || 0 }}</span><span class="ac-stat-l">总评论</span></div>
      <div class="ac-stat"><span class="ac-stat-n cr">{{ stats.pending_count || 0 }}</span><span class="ac-stat-l">待回复</span></div>
      <div class="ac-stat"><span class="ac-stat-n cg">{{ stats.replied_count || 0 }}</span><span class="ac-stat-l">已回复</span></div>
    </div>

    <!-- Tab切换 -->
    <div class="ac-tabs">
      <span class="ac-tab" :class="{ on: tab === '' }" @click="tab=''; loadData()">全部</span>
      <span class="ac-tab" :class="{ on: tab === '0' }" @click="tab='0'; loadData()">待回复</span>
      <span class="ac-tab" :class="{ on: tab === '1' }" @click="tab='1'; loadData()">已回复</span>
      <span class="ac-tab" :class="{ on: tab === 'logs' }" @click="tab='logs'; loadLogs()">回复日志</span>
    </div>

    <!-- 评论列表 -->
    <div class="ac-list" v-if="tab !== 'logs'">
      <div class="ac-card" v-for="c in comments" :key="c.comment_id">
        <div class="ac-card-top">
          <span class="ac-nick">{{ c.nickname || '用户' }}</span>
          <span class="ac-time">{{ fmtTime(c.post_time) }}</span>
          <span class="ac-badge" v-if="!c.replied">待回复</span>
          <span class="ac-badge ac-badge-ok" v-else>已回复</span>
        </div>
        <div class="ac-video" v-if="c.photo_title">视频: {{ c.photo_title }}</div>
        <div class="ac-content">{{ c.content }}</div>
        <div class="ac-reply-box" v-if="c.replied && c.reply_content">
          <div class="ac-reply-label">{{ c.reply_type === 'ai' ? 'AI回复' : '手动回复' }}</div>
          <div class="ac-reply-text">{{ c.reply_content }}</div>
        </div>
        <div class="ac-card-acts" v-if="!c.replied">
          <input class="ac-input" v-model="c._reply" placeholder="输入回复内容..." />
          <button class="ac-btn-sm" @click="replyComment(c, false)" :disabled="c._loading">回复</button>
          <button class="ac-btn-sm ac-btn-ai-sm" @click="replyComment(c, true)" :disabled="c._loading">AI回复</button>
          <button class="ac-btn-sm ac-btn-shield" @click="shieldComment(c)" :disabled="c._loading">屏蔽</button>
        </div>
      </div>
      <div class="ac-empty" v-if="!loading && !comments.length">暂无评论数据，请先同步</div>
      <div class="ac-pager" v-if="total > pageSize">
        <button :disabled="page <= 1" @click="page--; loadData()">上一页</button>
        <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
        <button :disabled="page * pageSize >= total" @click="page++; loadData()">下一页</button>
      </div>
    </div>

    <!-- 回复日志 -->
    <div class="ac-list" v-if="tab === 'logs'">
      <div class="ac-card" v-for="l in logs" :key="l.id">
        <div class="ac-card-top">
          <span class="ac-nick">{{ l.nickname || '用户' }}</span>
          <span class="ac-time">{{ fmtTime(l.created_at) }}</span>
          <span class="ac-badge" :class="l.reply_status === 'success' ? 'ac-badge-ok' : 'ac-badge-fail'">{{ l.reply_status === 'success' ? '成功' : '失败' }}</span>
          <span class="ac-type">{{ l.reply_type === 'ai' ? 'AI' : '手动' }}</span>
        </div>
        <div class="ac-content">{{ l.comment_content }}</div>
        <div class="ac-reply-box">
          <div class="ac-reply-text">{{ l.reply_content }}</div>
          <div class="ac-fail" v-if="l.fail_reason">{{ l.fail_reason }}</div>
        </div>
      </div>
      <div class="ac-empty" v-if="!loading && !logs.length">暂无回复日志</div>
    </div>

    <div class="ac-loading" v-if="loading"><span/><span/><span/></div>

    <!-- 提示 -->
    <div class="ac-toast" v-if="toast" @click="toast=''">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const shopId = ref('')
const shopList = ref([])
const tab = ref('')
const comments = ref([])
const logs = ref([])
const stats = ref(null)
const loading = ref(false)
const syncing = ref(false)
const batchReplying = ref(false)
const toast = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)

function showToast(msg) { toast.value = msg; setTimeout(() => toast.value = '', 3000) }

function fmtTime(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const now = new Date()
  const diff = Math.floor((now - d) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return diff + '分钟前'
  if (diff < 1440) return Math.floor(diff / 60) + '小时前'
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function loadShops() {
  try {
    const res = await request.get('/ks-wb/overview-all')
    const d = res.data || res
    shopList.value = (d.shops || []).map(s => ({ shop_id: s.shop_id, shop_name: s.shop_name }))
  } catch (e) {}
}

async function loadData() {
  if (tab.value === 'logs') return loadLogs()
  loading.value = true
  try {
    const res = await request.get('/ks-ad-comments/list', { params: { shop_id: shopId.value, replied: tab.value, page: page.value, page_size: pageSize } })
    const d = res.data || res
    comments.value = (d.list || []).map(c => ({ ...c, _reply: '', _loading: false }))
    total.value = d.total || 0
    stats.value = d.stats || null
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

async function loadLogs() {
  loading.value = true
  try {
    const res = await request.get('/ks-ad-comments/logs', { params: { shop_id: shopId.value, page: 1, page_size: 50 } })
    const d = res.data || res
    logs.value = d.list || []
  } catch (e) {}
  finally { loading.value = false }
}

async function syncComments() {
  syncing.value = true
  try {
    const res = await request.post('/ks-ad-comments/sync', { shop_id: shopId.value })
    const d = res.data || res
    showToast(d.msg || '同步完成')
    loadData()
  } catch (e) { showToast('同步失败') }
  finally { syncing.value = false }
}

async function batchAiReply() {
  batchReplying.value = true
  try {
    const res = await request.post('/ks-ad-comments/batch-reply', { shop_id: shopId.value, limit: 20 })
    const d = res.data || res
    showToast(d.msg || '批量回复完成')
    loadData()
  } catch (e) { showToast('批量回复失败') }
  finally { batchReplying.value = false }
}

async function replyComment(c, useAi) {
  if (!useAi && !c._reply) return showToast('请输入回复内容')
  c._loading = true
  try {
    const res = await request.post('/ks-ad-comments/reply', { comment_id: c.comment_id, reply_content: c._reply, use_ai: useAi })
    const d = res.data || res
    if (d.reply_content) { c.reply_content = d.reply_content; c.replied = 1; c.reply_type = useAi ? 'ai' : 'manual' }
    showToast(res.msg || d.msg || '回复成功')
    // 刷新统计
    loadData()
  } catch (e) { showToast('回复失败') }
  finally { c._loading = false }
}

async function shieldComment(c) {
  c._loading = true
  try {
    const res = await request.post('/ks-ad-comments/shield', { comment_id: c.comment_id })
    showToast(res.msg || (res.data || {}).msg || '已屏蔽')
    loadData()
  } catch (e) { showToast('屏蔽失败') }
  finally { c._loading = false }
}

onMounted(() => { loadShops(); loadData() })
</script>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
.ac {
  background: #fff; min-height: 100vh;
  font: 13px/1.4 -apple-system, 'PingFang SC', sans-serif;
  color: #1D2129; padding-bottom: 20px;
}
.ac-top {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
  padding: 16px 20px 14px; border-bottom: 1px solid #EBEDF0;
  position: sticky; top: 0; background: #fff; z-index: 20;
}
.ac-title { font-size: 17px; font-weight: 700; }
.ac-acts { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.ac-sel {
  padding: 6px 10px; border: 1px solid #D9D9D9; border-radius: 6px;
  font-size: 13px; background: #fff; outline: none;
}
.ac-btn {
  padding: 6px 14px; border: 1px solid #1677FF; border-radius: 6px;
  background: #1677FF; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer;
}
.ac-btn:disabled { opacity: .5; cursor: not-allowed; }
.ac-btn-ai { background: #722ED1; border-color: #722ED1; }

/* 统计 */
.ac-stats { display: flex; gap: 16px; padding: 14px 20px; }
.ac-stat { display: flex; flex-direction: column; align-items: center; min-width: 70px; }
.ac-stat-n { font-size: 22px; font-weight: 700; color: #1D2129; }
.ac-stat-n.cr { color: #FF3141; }
.ac-stat-n.cg { color: #00B578; }
.ac-stat-l { font-size: 11px; color: #86909C; margin-top: 2px; }

/* Tabs */
.ac-tabs { display: flex; gap: 0; padding: 0 20px; border-bottom: 1px solid #EBEDF0; }
.ac-tab {
  padding: 10px 16px; font-size: 13px; color: #86909C; cursor: pointer;
  border-bottom: 2px solid transparent; font-weight: 500;
}
.ac-tab.on { color: #1677FF; border-bottom-color: #1677FF; }

/* 评论卡片 */
.ac-list { padding: 12px 20px; }
.ac-card {
  border: 1px solid #F0F0F0; border-radius: 8px; padding: 14px 16px;
  margin-bottom: 10px;
}
.ac-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ac-nick { font-weight: 600; font-size: 13px; }
.ac-time { font-size: 11px; color: #86909C; }
.ac-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 3px;
  background: #FFF1F0; color: #FF3141; font-weight: 500;
}
.ac-badge-ok { background: #F0FFF0; color: #00B578; }
.ac-badge-fail { background: #FFF1F0; color: #FF3141; }
.ac-type { font-size: 10px; color: #722ED1; background: #F9F0FF; padding: 1px 6px; border-radius: 3px; }
.ac-video { font-size: 11px; color: #86909C; margin-bottom: 4px; }
.ac-content { font-size: 14px; color: #1D2129; line-height: 1.5; margin-bottom: 8px; }

/* 回复 */
.ac-reply-box {
  background: #F7F8FA; border-radius: 6px; padding: 10px 12px; margin-top: 6px;
}
.ac-reply-label { font-size: 11px; color: #722ED1; font-weight: 500; margin-bottom: 4px; }
.ac-reply-text { font-size: 13px; color: #4E5969; line-height: 1.5; }
.ac-fail { font-size: 11px; color: #FF3141; margin-top: 4px; }

/* 操作区 */
.ac-card-acts { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.ac-input {
  flex: 1; padding: 6px 10px; border: 1px solid #D9D9D9; border-radius: 6px;
  font-size: 13px; outline: none; min-width: 0;
}
.ac-input:focus { border-color: #1677FF; }
.ac-btn-sm {
  padding: 5px 12px; border: 1px solid #1677FF; border-radius: 6px;
  background: #fff; color: #1677FF; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.ac-btn-sm:disabled { opacity: .5; }
.ac-btn-ai-sm { border-color: #722ED1; color: #722ED1; }
.ac-btn-shield { border-color: #FF3141; color: #FF3141; }

/* 分页 */
.ac-pager { display: flex; justify-content: center; align-items: center; gap: 12px; padding: 16px 0; }
.ac-pager button { padding: 5px 14px; border: 1px solid #D9D9D9; border-radius: 6px; background: #fff; cursor: pointer; }
.ac-pager button:disabled { opacity: .4; cursor: not-allowed; }

/* 空/加载 */
.ac-empty { text-align: center; padding: 40px 0; color: #86909C; }
.ac-loading { display: flex; justify-content: center; gap: 5px; padding: 40px 0; }
.ac-loading span { width: 7px; height: 7px; border-radius: 50%; background: #1677FF; animation: bn 1s infinite; }
.ac-loading span:nth-child(2) { animation-delay: .15s; }
.ac-loading span:nth-child(3) { animation-delay: .3s; }
@keyframes bn { 0%,80%,100%{opacity:.25;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }

/* Toast */
.ac-toast {
  position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,.75); color: #fff; padding: 8px 20px; border-radius: 8px;
  font-size: 13px; z-index: 999; cursor: pointer;
}

/* 响应式 */
@media (max-width: 768px) {
  .ac-top { flex-direction: column; align-items: flex-start; }
  .ac-acts { margin-left: 0; width: 100%; }
  .ac-sel { flex: 1; }
  .ac-stats { gap: 10px; padding: 10px 12px; }
  .ac-stat-n { font-size: 18px; }
  .ac-tabs { padding: 0 12px; }
  .ac-list { padding: 10px 12px; }
  .ac-card-acts { flex-wrap: wrap; }
  .ac-input { width: 100%; }
}
</style>
