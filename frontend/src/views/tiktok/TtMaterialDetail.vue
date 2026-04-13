<template>
  <div class="tt-page">
    <div class="tt-page__header">
      <a-button size="small" @click="$router.back()">← 返回</a-button>
      <div class="tt-page__actions">
        <a-button size="small" v-if="detail.status === 'draft' || detail.status === 'pending'" @click="reviewModal = true">审核</a-button>
        <a-button size="small" type="primary" v-if="detail.status === 'approved'" @click="pushModal = true">推送投放</a-button>
      </div>
    </div>

    <div class="tt-detail-grid" v-if="detail.id">
      <!-- 基本信息 -->
      <div class="tt-card">
        <div class="tt-card__header"><span class="tt-card__title">基本信息</span>
          <a-button size="small" type="link" @click="editModal = true">编辑</a-button>
        </div>
        <div class="tt-info-list">
          <div class="tt-info-row"><span class="tt-info-row__label">名称</span><span>{{ detail.title || '未命名' }}</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">类型</span><span>{{ detail.type === 'video' ? '视频' : '图片' }}</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">状态</span>
            <span class="tt-status-dot" :class="'tt-status-dot--' + detail.status"></span>
            <span>{{ statusMap[detail.status] }}</span>
          </div>
          <div class="tt-info-row"><span class="tt-info-row__label">市场</span><span>{{ detail.market || '-' }}</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">语言</span><span>{{ detail.language || '-' }}</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">产品SPU</span><span>{{ detail.product_spu || '-' }}</span></div>
          <div class="tt-info-row" v-if="detail.duration"><span class="tt-info-row__label">时长</span><span>{{ detail.duration }}s</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">文件大小</span><span>{{ fmtSize(detail.file_size) }}</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">创建者</span><span>{{ detail.creator_name || '-' }}</span></div>
          <div class="tt-info-row"><span class="tt-info-row__label">创建时间</span><span>{{ detail.created_at?.slice(0,16) }}</span></div>
          <div class="tt-info-row" v-if="detail.reviewer_name"><span class="tt-info-row__label">审核人</span><span>{{ detail.reviewer_name }}</span></div>
          <div class="tt-info-row" v-if="detail.review_note"><span class="tt-info-row__label">审核备注</span><span>{{ detail.review_note }}</span></div>
        </div>
      </div>

      <!-- 消耗趋势 -->
      <div class="tt-card" v-if="detail.stats?.length">
        <div class="tt-card__header"><span class="tt-card__title">消耗趋势（近30天）</span></div>
        <div ref="statsChart" class="tt-chart"></div>
      </div>

      <!-- 推送记录 -->
      <div class="tt-card">
        <div class="tt-card__header"><span class="tt-card__title">推送记录</span></div>
        <div class="tt-push-list" v-if="detail.pushes?.length">
          <div class="tt-push-item" v-for="p in detail.pushes" :key="p.id">
            <div class="tt-push-item__info">
              <div class="tt-push-item__adv">{{ p.advertiser_name || p.advertiser_id }}</div>
              <div class="tt-push-item__time">{{ p.pushed_at?.slice(0,16) }}</div>
            </div>
            <div class="tt-push-item__status" :class="'tt-push-item__status--' + p.push_status">
              {{ { pending: '待推送', uploading: '推送中', success: '成功', failed: '失败' }[p.push_status] }}
            </div>
          </div>
        </div>
        <a-empty v-else description="暂无推送记录" :image="null" />
      </div>
    </div>

    <!-- 审核弹窗 -->
    <a-modal v-model:open="reviewModal" title="素材审核" @ok="doReview" :confirmLoading="reviewLoading">
      <a-radio-group v-model:value="reviewAction" style="margin-bottom:12px">
        <a-radio-button value="approved">通过</a-radio-button>
        <a-radio-button value="rejected">拒绝</a-radio-button>
      </a-radio-group>
      <a-textarea v-model:value="reviewNote" placeholder="审核备注（可选）" :rows="3" />
    </a-modal>

    <!-- 推送弹窗 -->
    <a-modal v-model:open="pushModal" title="推送到TikTok" @ok="doPush" :confirmLoading="pushLoading">
      <p style="margin-bottom:8px">选择广告账户：</p>
      <a-checkbox-group v-model:value="selectedAccounts" style="display:flex;flex-direction:column;gap:8px">
        <a-checkbox v-for="acc in accounts" :key="acc.advertiser_id" :value="acc.advertiser_id">
          {{ acc.advertiser_name || acc.advertiser_id }} <span v-if="acc.market" style="color:#8f959e">({{ acc.market }})</span>
        </a-checkbox>
      </a-checkbox-group>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModal" title="编辑素材" @ok="doEdit" :confirmLoading="editLoading">
      <a-form layout="vertical">
        <a-form-item label="名称"><a-input v-model:value="editForm.title" /></a-form-item>
        <a-form-item label="市场">
          <a-select v-model:value="editForm.market" allow-clear>
            <a-select-option v-for="m in marketOptions" :key="m" :value="m">{{ m }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="语言">
          <a-select v-model:value="editForm.language" allow-clear>
            <a-select-option value="en">English</a-select-option>
            <a-select-option value="id">Bahasa Indonesia</a-select-option>
            <a-select-option value="th">ภาษาไทย</a-select-option>
            <a-select-option value="vi">Tiếng Việt</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="产品SPU"><a-input v-model:value="editForm.product_spu" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import request from '../../utils/request'
import { message } from 'ant-design-vue'
import * as echarts from 'echarts'

const route = useRoute()
const detail = ref({})
const accounts = ref([])
const statsChart = ref(null)
let chartInstance = null

const statusMap = { draft: '草稿', pending: '待审核', approved: '已通过', rejected: '已拒绝', pushed: '已投放', archived: '已归档' }
const marketOptions = ['US', 'UK', 'ID', 'TH', 'MY', 'VN', 'PH', 'SG', 'SA', 'AE']

const reviewModal = ref(false)
const reviewAction = ref('approved')
const reviewNote = ref('')
const reviewLoading = ref(false)

const pushModal = ref(false)
const pushLoading = ref(false)
const selectedAccounts = ref([])

const editModal = ref(false)
const editLoading = ref(false)
const editForm = reactive({ title: '', market: '', language: '', product_spu: '' })

function fmtSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}

async function loadDetail() {
  try {
    const res = await request.get('/tt-materials/' + route.params.id)
    detail.value = res.data || {}
    editForm.title = detail.value.title
    editForm.market = detail.value.market
    editForm.language = detail.value.language
    editForm.product_spu = detail.value.product_spu
    await nextTick()
    renderChart()
  } catch (e) { console.error(e) }
}

async function loadAccounts() {
  try {
    const res = await request.get('/tiktok/accounts')
    accounts.value = (res.data || []).filter(a => a.status === 1)
  } catch (e) { console.error(e) }
}

function renderChart() {
  const stats = detail.value.stats
  if (!stats?.length || !statsChart.value) return
  if (!chartInstance) chartInstance = echarts.init(statsChart.value)
  chartInstance.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['消耗', '转化'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: 50, right: 16, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: stats.map(r => r.stat_date?.slice(5)), axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value', name: '消耗($)', axisLabel: { fontSize: 11 } },
      { type: 'value', name: '转化', axisLabel: { fontSize: 11 } },
    ],
    series: [
      { name: '消耗', type: 'bar', data: stats.map(r => r.spend || 0), itemStyle: { color: '#1677ff' } },
      { name: '转化', type: 'line', yAxisIndex: 1, data: stats.map(r => r.conversions || 0), itemStyle: { color: '#52c41a' } },
    ]
  }, true)
}

async function doReview() {
  reviewLoading.value = true
  try {
    const res = await request.post('/tt-materials/' + route.params.id + '/review', { action: reviewAction.value, note: reviewNote.value })
    if (res.code === 0) { message.success(res.msg); reviewModal.value = false; loadDetail() }
    else message.error(res.msg)
  } catch (e) { message.error('操作失败') }
  reviewLoading.value = false
}

async function doPush() {
  if (!selectedAccounts.value.length) return message.warning('请选择账户')
  pushLoading.value = true
  try {
    const res = await request.post('/tt-push/push', { material_ids: [parseInt(route.params.id)], advertiser_ids: selectedAccounts.value })
    if (res.code === 0) { message.success(res.msg); pushModal.value = false; setTimeout(loadDetail, 2000) }
    else message.error(res.msg)
  } catch (e) { message.error('推送失败') }
  pushLoading.value = false
}

async function doEdit() {
  editLoading.value = true
  try {
    const res = await request.put('/tt-materials/' + route.params.id, editForm)
    if (res.code === 0) { message.success('已更新'); editModal.value = false; loadDetail() }
    else message.error(res.msg)
  } catch (e) { message.error('更新失败') }
  editLoading.value = false
}

onMounted(() => { loadDetail(); loadAccounts() })
</script>

<style scoped>
.tt-page { padding: 12px; max-width: 1200px; margin: 0 auto; }
.tt-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }

.tt-detail-grid { display: flex; flex-direction: column; gap: 12px; }
@media (min-width: 768px) { .tt-detail-grid { display: grid; grid-template-columns: 1fr 1fr; } }

.tt-card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-card__title { font-size: 15px; font-weight: 600; color: #1f2329; }
.tt-chart { height: 220px; }

.tt-info-list { }
.tt-info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
.tt-info-row:last-child { border-bottom: none; }
.tt-info-row__label { color: #8f959e; flex-shrink: 0; margin-right: 12px; }

.tt-status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; vertical-align: middle; }
.tt-status-dot--draft { background: #c0c4cc; }
.tt-status-dot--pending { background: #faad14; }
.tt-status-dot--approved { background: #52c41a; }
.tt-status-dot--rejected { background: #f5222d; }
.tt-status-dot--pushed { background: #1677ff; }
.tt-status-dot--archived { background: #8c8c8c; }

.tt-push-list { }
.tt-push-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
.tt-push-item:last-child { border-bottom: none; }
.tt-push-item__adv { font-size: 13px; color: #1f2329; }
.tt-push-item__time { font-size: 11px; color: #8f959e; }
.tt-push-item__status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.tt-push-item__status--success { background: #f6ffed; color: #52c41a; }
.tt-push-item__status--failed { background: #fff2f0; color: #f5222d; }
.tt-push-item__status--uploading { background: #e6f7ff; color: #1890ff; }
.tt-push-item__status--pending { background: #fffbe6; color: #faad14; }
</style>
