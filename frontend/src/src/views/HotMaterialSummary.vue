<template>
  <div class="summary-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2>🔥 爆款素材总结</h2>
        <span class="header-desc">每7天自动分析近15天消耗破万素材，提炼爆款规律与创作方向</span>
      </div>
      <div class="header-right">
        <button class="btn-generate" @click="handleGenerate" :disabled="generating">
          <span v-if="generating" class="loading-spinner"></span>
          {{ generating ? 'AI分析中...' : '📊 立即生成总结' }}
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-box">
      <div class="loading-spinner large"></div>
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!list.length" class="empty-box">
      <div class="empty-icon">📋</div>
      <p>暂无总结报告</p>
      <p class="empty-hint">点击"立即生成总结"按钮，AI将分析近15天爆款素材数据</p>
    </div>

    <!-- 总结列表 -->
    <div v-else class="summary-list">
      <div v-for="item in list" :key="item.id" class="summary-card" :class="{ expanded: expandedId === item.id }">
        <!-- 卡片头部 -->
        <div class="card-header" @click="toggleExpand(item.id)">
          <div class="card-meta">
            <span class="card-badge" :class="item.hot_count > 0 ? 'hot' : 'empty'">
              {{ item.hot_count > 0 ? `🔥 ${item.hot_count}个爆款` : '无爆款' }}
            </span>
            <span class="card-period">{{ item.period_start }} ~ {{ item.period_end }}</span>
            <span class="card-cost" v-if="item.total_cost > 0">总消耗 ¥{{ formatNum(item.total_cost) }}</span>
          </div>
          <div class="card-time">
            {{ formatTime(item.created_at) }}
            <span class="expand-arrow">{{ expandedId === item.id ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- 展开的AI分析内容 -->
        <div class="card-body" v-if="expandedId === item.id">
          <div class="ai-content" v-html="renderMarkdown(item.content)"></div>

          <!-- 素材详细数据表格 -->
          <div class="materials-table" v-if="detailData && detailData.id === item.id && detailData.materials_data && detailData.materials_data.length">
            <h4>📋 爆款素材明细数据</h4>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>素材名称</th>
                    <th>消耗</th>
                    <th>成交</th>
                    <th>ROI</th>
                    <th>CTR</th>
                    <th>转化率</th>
                    <th>3s留存</th>
                    <th>完播率</th>
                    <th>时长</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(m, idx) in detailData.materials_data" :key="idx">
                    <td class="td-title" :title="m.title">{{ truncate(m.title, 25) }}</td>
                    <td class="td-cost">¥{{ formatNum(m.total_cost) }}</td>
                    <td>{{ m.orders || 0 }}</td>
                    <td :class="roiClass(m.roi)">{{ m.roi || '-' }}</td>
                    <td>{{ formatPct(m.avg_ctr) }}</td>
                    <td>{{ formatPct(m.avg_cvr) }}</td>
                    <td>{{ formatPct(m.avg_3s_rate) }}</td>
                    <td>{{ formatPct(m.avg_finish_rate) }}</td>
                    <td>{{ m.duration ? Math.round(parseFloat(m.duration)) + 's' : '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination" v-if="total > pageSize">
      <button @click="changePage(page - 1)" :disabled="page <= 1">上一页</button>
      <span class="page-info">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button @click="changePage(page + 1)" :disabled="page >= Math.ceil(total / pageSize)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const generating = ref(false)
const expandedId = ref(null)
const detailData = ref(null)

onMounted(() => { fetchList() })

async function fetchList() {
  loading.value = true
  try {
    const res = await request.get('/material-summary/list', { params: { page: page.value, pageSize: pageSize.value } })
    if (res.code === 0) {
      list.value = res.data.list || []
      total.value = res.data.total || 0
      // 自动展开第一条
      if (list.value.length && !expandedId.value) {
        expandedId.value = list.value[0].id
        loadDetail(list.value[0].id)
      }
    }
  } catch (e) { console.error('加载失败', e) }
  loading.value = false
}

async function handleGenerate() {
  generating.value = true
  try {
    await request.post('/material-summary/generate')
    // 等待一段时间后刷新（AI生成需要时间）
    setTimeout(async () => {
      await fetchList()
      generating.value = false
    }, 15000)
  } catch (e) {
    console.error('生成失败', e)
    generating.value = false
  }
}

async function toggleExpand(id) {
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  await loadDetail(id)
}

async function loadDetail(id) {
  try {
    const res = await request.get(`/material-summary/detail/${id}`)
    if (res.code === 0) {
      detailData.value = res.data
    }
  } catch (e) { console.error('加载详情失败', e) }
}

function changePage(p) {
  page.value = p
  expandedId.value = null
  detailData.value = null
  fetchList()
}

// 工具函数
function formatNum(v) {
  const n = parseFloat(v || 0)
  return n >= 10000 ? (n / 10000).toFixed(2) + '万' : n.toFixed(0)
}

function formatPct(v) {
  // 数据库中已经是百分比格式（1.82=1.82%），直接显示
  const n = parseFloat(v || 0)
  return n.toFixed(2) + '%'
}

function formatTime(t) {
  if (!t) return ''
  return t.replace('T', ' ').slice(0, 16)
}

function truncate(s, len) {
  if (!s) return ''
  return s.length > len ? s.slice(0, len) + '...' : s
}

function roiClass(v) {
  const n = parseFloat(v || 0)
  if (n >= 3) return 'roi-high'
  if (n >= 2) return 'roi-mid'
  return 'roi-low'
}

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}
</script>

<style scoped>
.summary-page { padding: 24px; max-width: 1200px; }

.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; padding: 20px 24px;
  background: linear-gradient(135deg, #fff5f5 0%, #fff0e6 100%);
  border-radius: 12px; border: 1px solid #ffe0d0;
}
.header-left h2 { margin: 0 0 4px; font-size: 20px; color: #1a1a2e; }
.header-desc { font-size: 13px; color: #888; }
.btn-generate {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 24px; background: linear-gradient(135deg, #ff6b35, #ff4444);
  color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.3s;
}
.btn-generate:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(255,107,53,0.4); }
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }

.loading-box, .empty-box {
  text-align: center; padding: 80px 0; color: #999;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-hint { font-size: 13px; color: #bbb; margin-top: 8px; }

.summary-card {
  background: #fff; border-radius: 12px; margin-bottom: 16px;
  border: 1px solid #eee; overflow: hidden; transition: all 0.3s;
}
.summary-card:hover { border-color: #ddd; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.summary-card.expanded { border-color: #ff6b35; box-shadow: 0 4px 20px rgba(255,107,53,0.1); }

.card-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; cursor: pointer; user-select: none;
}
.card-header:hover { background: #fafafa; }
.card-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.card-badge {
  padding: 3px 10px; border-radius: 12px; font-size: 13px; font-weight: 600;
}
.card-badge.hot { background: #fff0e6; color: #ff6b35; }
.card-badge.empty { background: #f5f5f5; color: #999; }
.card-period { font-size: 14px; color: #555; font-weight: 500; }
.card-cost { font-size: 13px; color: #888; }
.card-time { font-size: 13px; color: #aaa; white-space: nowrap; }
.expand-arrow { margin-left: 8px; font-size: 11px; }

.card-body { padding: 0 20px 20px; border-top: 1px solid #f0f0f0; }

.ai-content {
  padding: 16px 0; font-size: 14px; line-height: 1.8; color: #333;
}
.ai-content :deep(h1) { font-size: 18px; margin: 16px 0 8px; color: #1a1a2e; }
.ai-content :deep(h2) { font-size: 16px; margin: 20px 0 10px; color: #333; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px; }
.ai-content :deep(h3) { font-size: 15px; margin: 14px 0 6px; color: #555; }
.ai-content :deep(strong) { color: #ff6b35; }
.ai-content :deep(li) { margin: 4px 0; padding-left: 4px; }
.ai-content :deep(ul) { list-style: disc; padding-left: 20px; }
.ai-content :deep(code) { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #e83e8c; }
.ai-content :deep(blockquote) { border-left: 3px solid #ff6b35; padding: 8px 12px; background: #fff9f5; margin: 12px 0; color: #666; }
.ai-content :deep(hr) { border: none; border-top: 1px solid #eee; margin: 16px 0; }

.materials-table { margin-top: 20px; }
.materials-table h4 { margin: 0 0 12px; font-size: 15px; color: #333; }
.table-wrapper { overflow-x: auto; }
.table-wrapper table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.table-wrapper th {
  background: #f8f9fa; padding: 10px 12px; text-align: left;
  font-weight: 600; color: #555; border-bottom: 2px solid #eee; white-space: nowrap;
}
.table-wrapper td {
  padding: 10px 12px; border-bottom: 1px solid #f0f0f0; color: #333;
}
.table-wrapper tr:hover td { background: #fafafa; }
.td-title { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-cost { font-weight: 600; color: #ff6b35; }
.roi-high { color: #52c41a; font-weight: 600; }
.roi-mid { color: #faad14; font-weight: 600; }
.roi-low { color: #ff4d4f; font-weight: 600; }

.pagination {
  display: flex; justify-content: center; align-items: center; gap: 16px;
  margin-top: 24px; padding: 16px 0;
}
.pagination button {
  padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px;
  background: #fff; cursor: pointer; font-size: 13px;
}
.pagination button:hover:not(:disabled) { border-color: #ff6b35; color: #ff6b35; }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 13px; color: #888; }

.loading-spinner {
  display: inline-block; width: 16px; height: 16px;
  border: 2px solid #fff; border-top-color: transparent;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
.loading-spinner.large { width: 32px; height: 32px; border-color: #ff6b35; border-top-color: transparent; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
