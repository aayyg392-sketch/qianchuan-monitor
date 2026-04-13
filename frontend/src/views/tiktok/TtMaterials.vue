<template>
  <div class="tt-page">
    <div class="tt-page__header">
      <h2 class="tt-page__title">素材管理</h2>
      <div class="tt-page__actions">
        <a-button type="primary" size="small" @click="showUpload = true">上传素材</a-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="tt-filter-bar">
      <a-input-search v-model:value="filters.keyword" placeholder="搜索素材名称/SPU" size="small" style="width:180px" @search="loadList" allow-clear />
      <a-select v-model:value="filters.status" size="small" placeholder="状态" style="width:90px" allow-clear @change="loadList">
        <a-select-option value="draft">草稿</a-select-option>
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
        <a-select-option value="pushed">已投放</a-select-option>
        <a-select-option value="archived">已归档</a-select-option>
      </a-select>
      <a-select v-model:value="filters.type" size="small" placeholder="类型" style="width:80px" allow-clear @change="loadList">
        <a-select-option value="video">视频</a-select-option>
        <a-select-option value="image">图片</a-select-option>
      </a-select>
      <a-select v-model:value="filters.market" size="small" placeholder="市场" style="width:90px" allow-clear @change="loadList">
        <a-select-option v-for="m in marketOptions" :key="m" :value="m">{{ m }}</a-select-option>
      </a-select>
    </div>

    <!-- 素材列表 -->
    <div class="tt-mat-list">
      <div class="tt-mat-item" v-for="item in list" :key="item.id" @click="$router.push('/tt-materials/' + item.id)">
        <div class="tt-mat-item__thumb">
          <div class="tt-mat-item__type-badge">{{ item.type === 'video' ? '视频' : '图片' }}</div>
          <div v-if="item.duration" class="tt-mat-item__duration">{{ fmtDuration(item.duration) }}</div>
        </div>
        <div class="tt-mat-item__body">
          <div class="tt-mat-item__title">{{ item.title || '未命名' }}</div>
          <div class="tt-mat-item__meta">
            <span class="tt-status-dot" :class="'tt-status-dot--' + item.status"></span>
            <span class="tt-mat-item__status">{{ statusMap[item.status] }}</span>
            <span v-if="item.market" class="tt-tag tt-tag--market">{{ item.market }}</span>
            <span v-if="item.language" class="tt-tag tt-tag--lang">{{ item.language }}</span>
          </div>
          <div class="tt-mat-item__stats">
            <span v-if="item.stats?.total_spend > 0">消耗 ${{ fmtNum(item.stats.total_spend) }}</span>
            <span v-if="item.stats?.total_conversions > 0">转化 {{ item.stats.total_conversions }}</span>
            <span class="tt-mat-item__date">{{ item.created_at?.slice(0,10) }}</span>
          </div>
        </div>
        <div class="tt-mat-item__arrow">›</div>
      </div>
      <a-empty v-if="!list.length && !loading" description="暂无素材" />
    </div>

    <!-- 分页 -->
    <div class="tt-pagination" v-if="total > pageSize">
      <a-pagination v-model:current="page" :total="total" :pageSize="pageSize" size="small" simple @change="loadList" />
    </div>

    <!-- 上传弹窗 -->
    <a-modal v-model:open="showUpload" title="上传素材" :footer="null" :width="isMobile ? '100%' : 520" :style="isMobile ? { top: 0, margin: 0, maxWidth: '100vw', height: '100vh' } : {}">
      <a-form layout="vertical" :model="uploadForm">
        <a-form-item label="素材类型">
          <a-radio-group v-model:value="uploadForm.type">
            <a-radio-button value="video">视频</a-radio-button>
            <a-radio-button value="image">图片</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="选择文件">
          <a-upload-dragger :before-upload="beforeUpload" :file-list="uploadFiles" multiple :accept="uploadForm.type === 'video' ? 'video/*' : 'image/*'" @remove="f => { uploadFiles = uploadFiles.filter(x => x !== f) }">
            <p style="font-size:28px;color:#1677ff">+</p>
            <p>点击或拖拽文件到此区域</p>
          </a-upload-dragger>
        </a-form-item>
        <a-form-item label="目标市场">
          <a-select v-model:value="uploadForm.market" placeholder="选择市场" allow-clear>
            <a-select-option v-for="m in marketOptions" :key="m" :value="m">{{ m }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="语言">
          <a-select v-model:value="uploadForm.language" placeholder="选择语言" allow-clear>
            <a-select-option value="en">English</a-select-option>
            <a-select-option value="id">Bahasa Indonesia</a-select-option>
            <a-select-option value="th">ภาษาไทย</a-select-option>
            <a-select-option value="ms">Bahasa Melayu</a-select-option>
            <a-select-option value="vi">Tiếng Việt</a-select-option>
            <a-select-option value="tl">Filipino</a-select-option>
            <a-select-option value="ar">العربية</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="关联产品SPU">
          <a-input v-model:value="uploadForm.product_spu" placeholder="可选" />
        </a-form-item>
        <a-button type="primary" block :loading="uploading" @click="doUpload">开始上传</a-button>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import request from '../../utils/request'
import { message } from 'ant-design-vue'

const isMobile = ref(window.innerWidth < 768)
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const filters = reactive({ keyword: '', status: undefined, type: undefined, market: undefined })
const marketOptions = ['US', 'UK', 'ID', 'TH', 'MY', 'VN', 'PH', 'SG', 'SA', 'AE', 'SEA']
const statusMap = { draft: '草稿', pending: '待审核', approved: '已通过', rejected: '已拒绝', pushed: '已投放', archived: '已归档' }

const showUpload = ref(false)
const uploading = ref(false)
const uploadFiles = ref([])
const uploadForm = reactive({ type: 'video', market: undefined, language: undefined, product_spu: '' })

function fmtNum(n) { return n ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0' }
function fmtDuration(s) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }

async function loadList() {
  loading.value = true
  try {
    const res = await request.get('/tt-materials', { params: { page: page.value, pageSize, ...filters } })
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch (e) { console.error(e) }
  loading.value = false
}

function beforeUpload(file) {
  uploadFiles.value.push(file)
  return false
}

async function doUpload() {
  if (!uploadFiles.value.length) return message.warning('请选择文件')
  uploading.value = true
  try {
    const formData = new FormData()
    uploadFiles.value.forEach(f => formData.append('files', f))
    formData.append('type', uploadForm.type)
    if (uploadForm.market) formData.append('market', uploadForm.market)
    if (uploadForm.language) formData.append('language', uploadForm.language)
    if (uploadForm.product_spu) formData.append('product_spu', uploadForm.product_spu)
    const res = await request.post('/tt-materials/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
    if (res.code === 0) {
      message.success(res.msg)
      showUpload.value = false
      uploadFiles.value = []
      loadList()
    } else {
      message.error(res.msg)
    }
  } catch (e) { message.error('上传失败') }
  uploading.value = false
}

onMounted(loadList)
</script>

<style scoped>
.tt-page { padding: 12px; max-width: 1200px; margin: 0 auto; }
.tt-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-page__title { font-size: 18px; font-weight: 600; color: #1f2329; margin: 0; }

.tt-filter-bar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }

.tt-mat-list { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-mat-item { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f5f5f5; cursor: pointer; transition: background .15s; }
.tt-mat-item:active { background: #f7f8fa; }
.tt-mat-item:last-child { border-bottom: none; }
.tt-mat-item__thumb { width: 56px; height: 56px; border-radius: 8px; background: #f0f0f0; position: relative; flex-shrink: 0; margin-right: 12px; display: flex; align-items: center; justify-content: center; }
.tt-mat-item__type-badge { font-size: 10px; color: #fff; background: rgba(0,0,0,.5); border-radius: 4px; padding: 1px 4px; position: absolute; top: 2px; left: 2px; }
.tt-mat-item__duration { font-size: 10px; color: #fff; background: rgba(0,0,0,.5); border-radius: 4px; padding: 1px 4px; position: absolute; bottom: 2px; right: 2px; }
.tt-mat-item__body { flex: 1; min-width: 0; }
.tt-mat-item__title { font-size: 14px; font-weight: 500; color: #1f2329; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-mat-item__meta { display: flex; gap: 6px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
.tt-mat-item__status { font-size: 11px; color: #8f959e; }
.tt-mat-item__stats { display: flex; gap: 8px; margin-top: 4px; font-size: 11px; color: #8f959e; }
.tt-mat-item__date { margin-left: auto; }
.tt-mat-item__arrow { color: #c0c4cc; font-size: 18px; margin-left: 4px; }

.tt-status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.tt-status-dot--draft { background: #c0c4cc; }
.tt-status-dot--pending { background: #faad14; }
.tt-status-dot--approved { background: #52c41a; }
.tt-status-dot--rejected { background: #f5222d; }
.tt-status-dot--pushed { background: #1677ff; }
.tt-status-dot--archived { background: #8c8c8c; }

.tt-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.tt-tag--market { background: #e6f7ff; color: #1890ff; }
.tt-tag--lang { background: #f6ffed; color: #52c41a; }

.tt-pagination { display: flex; justify-content: center; padding: 16px 0; }
</style>
