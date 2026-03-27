<template>
  <div class="page">
    <!-- 顶部筛选 -->
    <div class="filter-bar">
      <div class="seg-ctrl">
        <span v-for="p in periods" :key="p.key" :class="['seg', { on: period === p.key }]" @click="period = p.key; load()">{{ p.label }}</span>
      </div>
      <div class="dim-row">
        <span v-for="d in dimensions" :key="d.key" :class="['chip', { on: dim === d.key }]" @click="dim = d.key; load()">{{ d.label }}</span>
        <span class="chip link" @click="showRule = true">📋 规则</span>
      </div>
    </div>

    <!-- 汇总 -->
    <div v-if="summary" class="kpi-bar">
      <div class="kpi"><div class="kpi-v blue">¥{{ fmt(summary.cost) }}</div><div class="kpi-l">消耗</div></div>
      <div class="kpi"><div class="kpi-v" :class="roiC(summary.roi)">{{ summary.roi }}</div><div class="kpi-l">ROI</div></div>
      <div class="kpi"><div class="kpi-v">{{ summary.material_count }}</div><div class="kpi-l">素材数</div></div>
      <div class="kpi"><div class="kpi-v">{{ fmt(summary.orders) }}</div><div class="kpi-l">订单</div></div>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="!list.length" class="empty">暂无数据</div>
    <div v-else class="card-grid">
      <div v-for="(r, i) in list" :key="r.dimension_key" class="card" @click="toggleExpand(i)">
        <div class="card-top">
          <span :class="['rank', { gold: i < 3 }]">{{ i + 1 }}</span>
          <span class="name">{{ r.dimension_key }}</span>
          <span class="cost">¥{{ fmt(r.cost) }}</span>
        </div>
        <div class="card-kpis">
          <span><b :class="roiC(r.roi)">{{ r.roi }}</b> ROI</span>
          <span><b>{{ r.ctr }}%</b> CTR</span>
          <span><b>{{ r.material_count }}</b> 素材</span>
        </div>
        <!-- 展开 -->
        <div v-if="exp === i" class="card-detail">
          <div class="detail-grid">
            <div class="d"><span class="dl">CVR</span><span class="dv">{{ r.cvr }}%</span></div>
            <div class="d"><span class="dl">播放</span><span class="dv">{{ fmt(r.plays) }}</span></div>
            <div class="d"><span class="dl">GMV</span><span class="dv">¥{{ fmt(r.gmv) }}</span></div>
            <div class="d"><span class="dl">订单</span><span class="dv">{{ r.orders }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 建议 -->
    <div v-if="insights.length" class="tips-card">
      <div class="tips-title">💡 建议</div>
      <div v-for="(t, i) in insights" :key="i" class="tip">{{ t }}</div>
    </div>

    <!-- 命名规则弹窗 -->
    <div v-if="showRule" class="overlay" @click.self="showRule = false">
      <div class="sheet">
        <div class="sheet-head"><span>素材命名规则</span><span class="close" @click="showRule = false">✕</span></div>
        <div class="sheet-body">
          <div class="rule-box">
            <div class="rule-fmt">(人群)(视角)-(类型)-日期词-产品-拍摄+剪辑</div>
            <div class="rule-eg">例：3.1用户-混功效-60323习惯-百合-夏佳金</div>
          </div>
          <div class="rule-sec"><b>人群</b> <span class="rule-tag">3.1 痛点前置</span><span class="rule-tag">3.2 直切产品</span><span class="rule-tag">3.99 价格机制</span></div>
          <div class="rule-sec"><b>视角</b> <span class="rule-tag">商家</span><span class="rule-tag">专家</span><span class="rule-tag">用户</span></div>
          <div class="rule-sec"><b>类型</b> <span class="rule-tag">促</span><span class="rule-tag">功效</span><span class="rule-tag">明星</span><span class="rule-tag">图文</span><span class="rule-tag">KOC</span><span class="rule-tag">混</span><span class="rule-tag">仿</span></div>
          <div class="rule-sec"><b>产品</b> <span class="rule-tag">百合</span><span class="rule-tag">绿泥</span><span class="rule-tag">慕斯</span><span class="rule-tag">小黑管</span><span class="rule-tag">VC</span></div>
          <div class="rule-sec"><b>拍摄</b> <span class="rule-tag">佳=江佳丽</span><span class="rule-tag">夏=夏林铎</span></div>
          <div class="rule-sec"><b>剪辑</b> <span class="rule-tag">亮=吴文亮</span><span class="rule-tag">余=余家骏</span><span class="rule-tag">金=石晓金</span></div>
        </div>
      </div>
    </div>

    <div style="height: calc(16px + env(safe-area-inset-bottom, 0))"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const period = ref('7d')
const dim = ref('content_type')
const list = ref([])
const summary = ref(null)
const loading = ref(false)
const exp = ref(-1)
const showRule = ref(false)
const insights = ref([])

const periods = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
]
const dimensions = [
  { key: 'content_type', label: '类型' },
  { key: 'product', label: '产品' },
  { key: 'crowd', label: '人群' },
  { key: 'perspective', label: '视角' },
  { key: 'shooter', label: '拍摄' },
  { key: 'editor', label: '剪辑' },
]

const fmt = (v) => { const n = parseFloat(v || 0); return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0) }
const roiC = (v) => parseFloat(v) >= 2 ? 'green' : parseFloat(v) >= 1.5 ? 'orange' : 'gray'
const toggleExpand = (i) => { exp.value = exp.value === i ? -1 : i }

const load = async () => {
  loading.value = true; exp.value = -1
  try {
    const res = await request.get('/material-dimensions/analysis', { params: { period: period.value, dimension: dim.value } })
    list.value = res.data?.list || []
    summary.value = res.data?.summary || null
    insights.value = res.data?.insights || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

onMounted(load)
</script>

<style scoped>
.page { background: #F5F6FA; min-height: 100vh; }

/* 筛选 */
.filter-bar { background: #fff; padding: 10px 16px; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #F0F1F5; }
.seg-ctrl { display: flex; background: #F0F1F5; border-radius: 8px; padding: 2px; margin-bottom: 8px; }
.seg { flex: 1; text-align: center; padding: 6px 0; font-size: 13px; color: #86909C; border-radius: 6px; cursor: pointer; font-weight: 500; }
.seg.on { background: #fff; color: #1D2129; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.dim-row { display: flex; gap: 6px; overflow-x: auto; }
.dim-row::-webkit-scrollbar { display: none; }
.chip { flex-shrink: 0; padding: 4px 12px; font-size: 12px; border-radius: 14px; background: #F0F1F5; color: #86909C; cursor: pointer; font-weight: 500; }
.chip.on { background: #E8F3FF; color: #1677FF; }
.chip.link { background: none; color: #1677FF; }

/* 汇总 KPI */
.kpi-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #E8E8E8; margin: 12px 16px; border-radius: 10px; overflow: hidden; }
.kpi { background: #fff; padding: 12px 8px; text-align: center; }
.kpi-v { font-size: 18px; font-weight: 700; color: #1D2129; }
.kpi-v.blue { color: #1677FF; }
.kpi-v.green { color: #00B42A; }
.kpi-v.orange { color: #FF7D00; }
.kpi-v.gray { color: #C9CDD4; }
.kpi-l { font-size: 11px; color: #86909C; margin-top: 2px; }

/* 卡片网格 */
.card-grid { padding: 0 16px; display: flex; flex-direction: column; gap: 8px; }
.card { background: #fff; border-radius: 10px; overflow: hidden; cursor: pointer; }
.card:active { opacity: .96; }
.card-top { display: flex; align-items: center; padding: 12px 14px; gap: 8px; }
.rank { width: 22px; height: 22px; border-radius: 6px; background: #F0F1F5; color: #86909C; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rank.gold { background: #1677FF; color: #fff; }
.name { flex: 1; font-size: 14px; font-weight: 600; color: #1D2129; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cost { font-size: 15px; font-weight: 700; color: #1677FF; }

.card-kpis { display: flex; padding: 0 14px 12px; gap: 4px; }
.card-kpis span { flex: 1; text-align: center; font-size: 11px; color: #86909C; }
.card-kpis b { display: block; font-size: 14px; color: #1D2129; font-weight: 600; }
.card-kpis b.green { color: #00B42A; }
.card-kpis b.orange { color: #FF7D00; }
.card-kpis b.gray { color: #C9CDD4; }

/* 展开 */
.card-detail { border-top: 1px solid #F2F3F5; padding: 10px 14px; }
.detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
.d { text-align: center; padding: 4px 0; }
.dl { font-size: 10px; color: #C9CDD4; display: block; }
.dv { font-size: 13px; font-weight: 600; color: #1D2129; }

/* 建议 */
.tips-card { margin: 12px 16px; background: #fff; border-radius: 10px; padding: 14px; }
.tips-title { font-size: 14px; font-weight: 600; color: #1D2129; margin-bottom: 8px; }
.tip { font-size: 13px; color: #4E5969; line-height: 1.6; padding: 3px 0 3px 12px; position: relative; }
.tip::before { content: ''; position: absolute; left: 0; top: 10px; width: 4px; height: 4px; border-radius: 50%; background: #1677FF; }

/* 弹窗 */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; display: flex; align-items: flex-end; justify-content: center; }
.sheet { background: #fff; width: 100%; max-width: 480px; max-height: 75vh; border-radius: 14px 14px 0 0; display: flex; flex-direction: column; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #F2F3F5; font-size: 15px; font-weight: 600; }
.close { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #F0F1F5; border-radius: 50%; cursor: pointer; font-size: 14px; color: #86909C; }
.sheet-body { overflow-y: auto; padding: 14px 16px; -webkit-overflow-scrolling: touch; }
.rule-box { background: #F7F8FA; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
.rule-fmt { font-size: 12px; color: #1D2129; font-weight: 500; line-height: 1.5; }
.rule-eg { font-size: 11px; color: #1677FF; margin-top: 4px; }
.rule-sec { margin-bottom: 10px; font-size: 12px; color: #1D2129; }
.rule-sec b { display: block; margin-bottom: 4px; font-size: 12px; }
.rule-tag { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px; background: #F0F1F5; border-radius: 10px; font-size: 11px; color: #4E5969; }

.empty { text-align: center; padding: 60px 20px; color: #C9CDD4; font-size: 14px; }

/* 桌面 */
@media (min-width: 768px) {
  .page { padding: 16px 24px; }
  .filter-bar { border-radius: 10px; border: none; margin-bottom: 4px; }
  .kpi-bar { margin: 12px 0; }
  .card-grid { padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .tips-card { margin: 12px 0; }
  .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .overlay { align-items: center; }
  .sheet { border-radius: 14px; }
}
</style>
