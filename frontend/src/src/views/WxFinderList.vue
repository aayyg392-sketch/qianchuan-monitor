<template>
  <div class="ops-wb">
    <!-- Hero 渐变顶栏 -->
    <div class="ops-hero">
      <div class="ops-hero__top">
        <h2 class="ops-hero__title">达人管理</h2>
        <button class="ops-hero__icon-btn" @click="syncFinders" :disabled="syncing">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        </button>
      </div>
      <div class="ops-hero__controls">
        <div class="ops-hero__switch">
          <span class="ops-hero__switch-text">共 <b>{{ total }}</b> 位达人</span>
        </div>
        <button class="ops-hero__pull-btn" :disabled="syncing" @click="syncFinders">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ syncing ? '同步中...' : '同步数据' }}
        </button>
      </div>
    </div>

    <!-- KPI卡片 -->
    <div class="ops-content">
      <div class="stat-grid ops-kpi-overlap">
        <div class="stat-card">
          <div class="stat-card__top"><span class="stat-card__label">达人总数</span></div>
          <div class="stat-card__value" style="color:#1677ff">{{ total }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__top"><span class="stat-card__label">昨日总GMV</span></div>
          <div class="stat-card__value" style="color:#fa8c16">¥{{ fmtNum(totalGmv) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__top"><span class="stat-card__label">已合作</span></div>
          <div class="stat-card__value" style="color:#52c41a">{{ cooperatingCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__top"><span class="stat-card__label">洽谈中</span></div>
          <div class="stat-card__value" style="color:#597ef7">{{ talkingCount }}</div>
        </div>
      </div>

      <!-- 筛选栏 -->
      <div class="dt-card" style="margin-bottom:10px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <a-input-search v-model:value="keyword" placeholder="搜索达人" allow-clear size="small" style="width:150px" />
          <a-select :value="statusFilter" @change="v => statusFilter = v" size="small" style="width:100px" placeholder="状态">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="pending">待沟通</a-select-option>
            <a-select-option value="talking">洽谈中</a-select-option>
            <a-select-option value="cooperating">已合作</a-select-option>
          </a-select>
        </div>
      </div>

      <!-- 达人列表 -->
      <div class="dt-card">
        <div class="dt-card__head">
          <span class="dt-card__title">达人列表</span>
          <span class="dt-card__badge dt-card__badge--blue">{{ filteredList.length }}位</span>
        </div>
        <div class="finder-scroll">
          <div v-for="f in filteredList" :key="f.id || f.finder_id" class="finder-row" @click="showDetail(f)">
            <div class="finder-row__avatar">{{ (f.finder_nickname || '达').charAt(0) }}</div>
            <div class="finder-row__body">
              <div class="finder-row__name">{{ f.finder_nickname || f.finder_id }}</div>
              <div class="finder-row__sub">
                <span>总GMV <b style="color:#fa8c16">¥{{ fmtNum(f.total_gmv || f.avg_sales || 0) }}</b></span>
                <span style="margin-left:8px">昨日 <b>¥{{ fmtNum(f.avg_sales || 0) }}</b></span>
                <span v-if="f.video_count" style="margin-left:8px;color:#8c8c8c">{{ f.video_count }}款</span>
              </div>
            </div>
            <div class="finder-row__right">
              <a-tag :color="statusColor[f.cooperation_status || 'pending']" size="small">{{ statusText[f.cooperation_status || 'pending'] }}</a-tag>
            </div>
          </div>
          <div v-if="!filteredList.length && !loading" class="ops-empty-tip">暂无达人数据</div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailVisible" :title="null" :footer="null" :width="380" :bodyStyle="{padding:'16px'}">
      <div class="finder-detail" v-if="detailData.finder_id">
        <div class="finder-detail__head">
          <div class="finder-detail__avatar-lg">{{ (detailData.finder_nickname || '达').charAt(0) }}</div>
          <div>
            <div class="finder-detail__name">{{ detailData.finder_nickname }}</div>
            <div class="finder-detail__id">ID: {{ detailData.finder_id }}</div>
          </div>
        </div>
        <div class="finder-detail__stats">
          <div class="finder-detail__stat">
            <div class="finder-detail__stat-val" style="color:#fa8c16">¥{{ fmtNum(detailData.total_gmv || 0) }}</div>
            <div class="finder-detail__stat-label">总GMV</div>
          </div>
          <div class="finder-detail__stat">
            <div class="finder-detail__stat-val">¥{{ fmtNum(detailData.avg_sales || 0) }}</div>
            <div class="finder-detail__stat-label">昨日销售</div>
          </div>
          <div class="finder-detail__stat">
            <div class="finder-detail__stat-val">{{ detailData.video_count || 0 }}</div>
            <div class="finder-detail__stat-label">商品数</div>
          </div>
        </div>
        <div class="finder-detail__action">
          <span style="color:#8c8c8c;font-size:13px">对接状态</span>
          <a-select v-model:value="detailData.cooperation_status" style="width:120px" size="small" @change="updateStatus(detailData)">
            <a-select-option value="pending">待沟通</a-select-option>
            <a-select-option value="talking">洽谈中</a-select-option>
            <a-select-option value="cooperating">已合作</a-select-option>
          </a-select>
        </div>
      </div>
    </a-modal>

    <div v-if="loading" class="ops-loading"><a-spin /></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '@/utils/request';

const loading = ref(false);
const syncing = ref(false);
const finders = ref([]);
const total = ref(0);
const keyword = ref('');
const statusFilter = ref('');
const detailVisible = ref(false);
const detailData = ref({});

const statusText = { pending: '待沟通', talking: '洽谈中', cooperating: '已合作' };
const statusColor = { pending: 'default', talking: 'blue', cooperating: 'green' };

function fmtNum(val) { return parseFloat(val || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }
const totalGmv = computed(() => finders.value.reduce((s, f) => s + parseFloat(f.avg_sales || 0), 0));
const cooperatingCount = computed(() => finders.value.filter(f => f.cooperation_status === 'cooperating').length);
const talkingCount = computed(() => finders.value.filter(f => f.cooperation_status === 'talking').length);

const filteredList = computed(() => {
  return finders.value.filter(f => {
    if (keyword.value && !(f.finder_nickname || '').toLowerCase().includes(keyword.value.toLowerCase())) return false;
    if (statusFilter.value && (f.cooperation_status || 'pending') !== statusFilter.value) return false;
    return true;
  });
});

async function loadFinders() {
  loading.value = true;
  try {
    const res = await request.get('/wechat-channels/finder/list', { params: { pageSize: 100, sortBy: 'avg_sales' } });
    finders.value = res?.data?.list || [];
    total.value = res?.data?.total || finders.value.length;
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
}

async function syncFinders() {
  syncing.value = true;
  try {
    await request.post('/wechat-channels/finder/sync');
    message.success('同步成功');
    await loadFinders();
  } catch (e) { message.error('同步失败'); }
  finally { syncing.value = false; }
}

function showDetail(f) {
  detailData.value = { ...f };
  if (!detailData.value.cooperation_status) detailData.value.cooperation_status = 'pending';
  detailVisible.value = true;
}

async function updateStatus(f) {
  try {
    await request.post('/wechat-channels/finder/batch-status', { finder_ids: [f.id], status: f.cooperation_status });
    const idx = finders.value.findIndex(x => x.id === f.id);
    if (idx >= 0) finders.value[idx].cooperation_status = f.cooperation_status;
    message.success('状态已更新');
  } catch (e) { message.error('更新失败'); }
}

onMounted(loadFinders);
</script>

<style scoped>
/* 复用运营工作台的钉钉风格 */
.ops-wb { --primary: #1677ff; --bg: #f5f6fa; background: var(--bg); min-height: 100vh; padding-bottom: env(safe-area-inset-bottom); }

.ops-hero { background: linear-gradient(135deg, #1a2b4a 0%, #16304f 50%, #0d1f3c 100%); color: #fff; padding: 16px 16px 32px; }
.ops-hero__top { display: flex; justify-content: space-between; align-items: center; }
.ops-hero__title { font-size: 17px; font-weight: 600; margin: 0; }
.ops-hero__icon-btn { background: rgba(255,255,255,0.12); border: none; color: #fff; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ops-hero__controls { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.ops-hero__switch { display: flex; align-items: center; gap: 6px; }
.ops-hero__switch-text { font-size: 13px; color: rgba(255,255,255,0.85); }
.ops-hero__switch-text b { color: #fff; font-size: 18px; }
.ops-hero__pull-btn { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px; }

.ops-content { padding: 0 12px 20px; margin-top: -24px; }

.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ops-kpi-overlap { position: relative; z-index: 2; }
.stat-card { background: #fff; border-radius: 10px; padding: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.stat-card__top { margin-bottom: 4px; }
.stat-card__label { font-size: 11px; color: #8c8c8c; }
.stat-card__value { font-size: 20px; font-weight: 700; line-height: 1.2; }

.dt-card { background: #fff; border-radius: 10px; padding: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); margin-top: 10px; }
.dt-card__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.dt-card__title { font-size: 14px; font-weight: 600; color: #1a1a1a; }
.dt-card__badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.dt-card__badge--blue { background: #e6f4ff; color: #1677ff; }

/* 达人行 */
.finder-scroll { max-height: 60vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.finder-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; cursor: pointer; }
.finder-row:last-child { border-bottom: none; }
.finder-row:active { background: #f0f5ff; }
.finder-row__avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; flex-shrink: 0; }
.finder-row__body { flex: 1; min-width: 0; }
.finder-row__name { font-size: 14px; font-weight: 500; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.finder-row__sub { font-size: 12px; color: #595959; margin-top: 2px; }
.finder-row__right { flex-shrink: 0; }

.ops-empty-tip { text-align: center; color: #bfbfbf; padding: 40px 0; font-size: 13px; }
.ops-loading { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }

/* 详情弹窗 */
.finder-detail__head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.finder-detail__avatar-lg { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; flex-shrink: 0; }
.finder-detail__name { font-size: 16px; font-weight: 600; }
.finder-detail__id { font-size: 11px; color: #8c8c8c; margin-top: 2px; }
.finder-detail__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f9fafb; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.finder-detail__stat { text-align: center; }
.finder-detail__stat-val { font-size: 16px; font-weight: 700; }
.finder-detail__stat-label { font-size: 11px; color: #8c8c8c; margin-top: 2px; }
.finder-detail__action { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #f0f0f0; }

/* Mobile */
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .stat-card__value { font-size: 16px; }
  .ops-content { padding: 0 8px 20px; }
}
@media (max-width: 480px) {
  .stat-card { padding: 10px 8px; }
  .stat-card__value { font-size: 15px; }
}
</style>
