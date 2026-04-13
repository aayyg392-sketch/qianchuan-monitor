<template>
  <div class="tt-page">
    <div class="tt-page__header">
      <h2 class="tt-page__title">素材推送</h2>
    </div>

    <!-- Tab 切换 -->
    <a-tabs v-model:activeKey="activeTab" size="small">
      <a-tab-pane key="push" tab="推送素材">
        <!-- 选择素材 -->
        <div class="tt-card" style="margin-bottom:12px">
          <div class="tt-card__header"><span class="tt-card__title">选择素材</span>
            <a-input-search v-model:value="matKeyword" placeholder="搜索" size="small" style="width:160px" @search="loadMaterials" allow-clear />
          </div>
          <div class="tt-select-list">
            <label class="tt-select-item" v-for="m in materials" :key="m.id">
              <a-checkbox :value="m.id" :checked="selectedMats.includes(m.id)" @change="e => toggleMat(m.id, e.target.checked)" />
              <div class="tt-select-item__info">
                <span class="tt-select-item__title">{{ m.title || '未命名' }}</span>
                <span class="tt-select-item__meta">{{ m.type }} · {{ m.market || '-' }} · {{ statusMap[m.status] }}</span>
              </div>
            </label>
            <a-empty v-if="!materials.length" description="无可推送素材" :image="null" />
          </div>
          <div v-if="selectedMats.length" class="tt-select-summary">已选 {{ selectedMats.length }} 个素材</div>
        </div>

        <!-- 选择账户 -->
        <div class="tt-card" style="margin-bottom:12px">
          <div class="tt-card__header"><span class="tt-card__title">选择广告账户</span></div>
          <div class="tt-select-list">
            <label class="tt-select-item" v-for="a in accounts" :key="a.advertiser_id">
              <a-checkbox :value="a.advertiser_id" :checked="selectedAccs.includes(a.advertiser_id)" @change="e => toggleAcc(a.advertiser_id, e.target.checked)" />
              <div class="tt-select-item__info">
                <span class="tt-select-item__title">{{ a.advertiser_name || a.advertiser_id }}</span>
                <span class="tt-select-item__meta">{{ a.market || '-' }} · {{ a.currency }}</span>
              </div>
            </label>
            <a-empty v-if="!accounts.length" description="无广告账户，请先绑定" :image="null" />
          </div>
        </div>

        <a-button type="primary" block :loading="pushing" :disabled="!selectedMats.length || !selectedAccs.length" @click="doPush">
          推送 {{ selectedMats.length }} 个素材到 {{ selectedAccs.length }} 个账户
        </a-button>
      </a-tab-pane>

      <a-tab-pane key="logs" tab="推送记录">
        <div class="tt-filter-bar">
          <a-select v-model:value="logFilter.push_status" placeholder="状态" size="small" style="width:90px" allow-clear @change="loadLogs">
            <a-select-option value="success">成功</a-select-option>
            <a-select-option value="failed">失败</a-select-option>
            <a-select-option value="uploading">推送中</a-select-option>
          </a-select>
        </div>
        <div class="tt-card">
          <div class="tt-push-log-list">
            <div class="tt-push-log-item" v-for="log in logs" :key="log.id">
              <div class="tt-push-log-item__main">
                <div class="tt-push-log-item__title">{{ log.material_title || '素材#' + log.material_id }}</div>
                <div class="tt-push-log-item__meta">
                  → {{ log.advertiser_name || log.advertiser_id }}
                  <span style="margin-left:8px">{{ log.pushed_at?.slice(0,16) }}</span>
                </div>
              </div>
              <div class="tt-push-item__status" :class="'tt-push-item__status--' + log.push_status">
                {{ { pending: '待推送', uploading: '推送中', success: '成功', failed: '失败' }[log.push_status] }}
              </div>
              <a-button v-if="log.push_status === 'failed'" size="small" type="link" @click="retryPush(log.id)">重试</a-button>
            </div>
            <a-empty v-if="!logs.length" description="暂无推送记录" />
          </div>
        </div>
        <div class="tt-pagination" v-if="logTotal > 20">
          <a-pagination v-model:current="logPage" :total="logTotal" :pageSize="20" size="small" simple @change="loadLogs" />
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import request from '../../utils/request'
import { message } from 'ant-design-vue'

const activeTab = ref('push')
const statusMap = { draft: '草稿', pending: '待审核', approved: '已通过', rejected: '已拒绝', pushed: '已投放', archived: '已归档' }

const materials = ref([])
const accounts = ref([])
const selectedMats = ref([])
const selectedAccs = ref([])
const matKeyword = ref('')
const pushing = ref(false)

const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logFilter = reactive({ push_status: undefined })

function toggleMat(id, checked) { checked ? selectedMats.value.push(id) : (selectedMats.value = selectedMats.value.filter(x => x !== id)) }
function toggleAcc(id, checked) { checked ? selectedAccs.value.push(id) : (selectedAccs.value = selectedAccs.value.filter(x => x !== id)) }

async function loadMaterials() {
  try {
    const res = await request.get('/tt-materials', { params: { pageSize: 100, status: 'approved', keyword: matKeyword.value } })
    materials.value = res.data?.list || []
  } catch (e) { console.error(e) }
}

async function loadAccounts() {
  try {
    const res = await request.get('/tiktok/accounts')
    accounts.value = (res.data || []).filter(a => a.status === 1)
  } catch (e) { console.error(e) }
}

async function doPush() {
  pushing.value = true
  try {
    const res = await request.post('/tt-push/push', { material_ids: selectedMats.value, advertiser_ids: selectedAccs.value })
    if (res.code === 0) { message.success(res.msg); selectedMats.value = []; activeTab.value = 'logs'; loadLogs() }
    else message.error(res.msg)
  } catch (e) { message.error('推送失败') }
  pushing.value = false
}

async function loadLogs() {
  try {
    const res = await request.get('/tt-push/logs', { params: { page: logPage.value, pageSize: 20, ...logFilter } })
    logs.value = res.data?.list || []
    logTotal.value = res.data?.total || 0
  } catch (e) { console.error(e) }
}

async function retryPush(id) {
  try {
    const res = await request.post('/tt-push/retry/' + id)
    if (res.code === 0) { message.success('重试中'); setTimeout(loadLogs, 2000) }
    else message.error(res.msg)
  } catch (e) { message.error('重试失败') }
}

onMounted(() => { loadMaterials(); loadAccounts(); loadLogs() })
</script>

<style scoped>
.tt-page { padding: 12px; max-width: 1200px; margin: 0 auto; }
.tt-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-page__title { font-size: 18px; font-weight: 600; color: #1f2329; margin: 0; }
.tt-filter-bar { display: flex; gap: 8px; margin-bottom: 12px; }

.tt-card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.tt-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tt-card__title { font-size: 15px; font-weight: 600; color: #1f2329; }

.tt-select-list { max-height: 300px; overflow-y: auto; }
.tt-select-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; cursor: pointer; }
.tt-select-item:last-child { border-bottom: none; }
.tt-select-item__info { flex: 1; min-width: 0; }
.tt-select-item__title { display: block; font-size: 13px; color: #1f2329; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-select-item__meta { display: block; font-size: 11px; color: #8f959e; margin-top: 2px; }
.tt-select-summary { text-align: center; padding: 8px; font-size: 12px; color: #1677ff; font-weight: 500; }

.tt-push-log-list { }
.tt-push-log-item { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
.tt-push-log-item:last-child { border-bottom: none; }
.tt-push-log-item__main { flex: 1; min-width: 0; }
.tt-push-log-item__title { font-size: 13px; color: #1f2329; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-push-log-item__meta { font-size: 11px; color: #8f959e; margin-top: 2px; }

.tt-push-item__status { font-size: 12px; padding: 2px 8px; border-radius: 4px; flex-shrink: 0; }
.tt-push-item__status--success { background: #f6ffed; color: #52c41a; }
.tt-push-item__status--failed { background: #fff2f0; color: #f5222d; }
.tt-push-item__status--uploading { background: #e6f7ff; color: #1890ff; }
.tt-push-item__status--pending { background: #fffbe6; color: #faad14; }

.tt-pagination { display: flex; justify-content: center; padding: 16px 0; }
</style>
