<template>
<div class="page">
  <!-- 顶部筛选 -->
  <div class="hd">
    <div class="hd-tabs">
      <span v-for="p in periods" :key="p.key" :class="['tab', { on: period === p.key }]" @click="period = p.key; load()">{{ p.label }}</span>
    </div>
    <div class="hd-row">
      <div class="hd-dims">
        <span v-for="d in dimensions" :key="d.key" :class="['dim', { on: curDim === d.key }]" @click="curDim = d.key; load()">{{ d.label }}</span>
      </div>
      <span class="hd-filter" :class="{ on: filterBy === 'new_date' }" @click="toggleFilter">{{ filterBy === 'new_date' ? '按上新' : '按投放' }}</span>
      <span class="hd-rule" @click="showRule = true">&#x1F4CB; 规则</span>
    </div>
  </div>

  <!-- 汇总 -->
  <div class="sum" v-if="summary">
    <div class="sum-i"><div class="sum-v pri">¥{{ fmt(summary.cost) }}</div><div class="sum-l">消耗</div></div>
    <div class="sum-i"><div class="sum-v" :class="rc(summary.roi)">{{ summary.roi }}</div><div class="sum-l">ROI</div></div>
    <div class="sum-i"><div class="sum-v">{{ summary.material_count }}</div><div class="sum-l">素材</div></div>
    <div class="sum-i"><div class="sum-v">{{ fmt(summary.orders) }}</div><div class="sum-l">订单</div></div>
  </div>

  <!-- 列表 -->
  <div class="ls" v-if="!loading && list.length">
    <div v-for="(r, i) in list" :key="i" class="card" @click="exp = exp === i ? -1 : i">
      <!-- 头部：排名+名称+消耗 -->
      <div class="c-top">
        <div :class="['c-rank', i < 3 && 'gold']">{{ i + 1 }}</div>
        <div class="c-name">{{ r.dimension_key || '-' }}</div>
        <div class="c-cost">¥{{ fmt(r.cost) }}</div>
      </div>
      <!-- 核心指标行 -->
      <div class="c-kpi">
        <div class="k">
          <div class="k-v" :class="rc(r.roi)">{{ r.roi }}</div>
          <div class="k-l">ROI</div>
        </div>
        <div class="k">
          <div class="k-v" :class="cc(r.ctr)">{{ r.ctr }}%</div>
          <div class="k-l">CTR</div>
        </div>
        <div class="k">
          <div class="k-v">{{ r.material_count }}</div>
          <div class="k-l">素材</div>
        </div>
        <div class="k">
          <div class="k-v">{{ r.orders }}</div>
          <div class="k-l">订单</div>
        </div>
      </div>
      <!-- CTR条 -->
      <div class="c-bar"><div class="c-bar-fill" :class="cc(r.ctr)" :style="{ width: barW(r.ctr) }"></div></div>
      <!-- 展开 -->
      <div v-if="exp === i" class="c-ext">
        <div class="ext-g">
          <div class="ext"><div class="ext-l">曝光</div><div class="ext-v">{{ fmt(r.show_cnt || 0) }}</div></div>
          <div class="ext"><div class="ext-l">点击</div><div class="ext-v">{{ fmt(r.click_cnt || 0) }}</div></div>
          <div class="ext"><div class="ext-l">GMV</div><div class="ext-v">¥{{ fmt(r.gmv) }}</div></div>
          <div class="ext"><div class="ext-l">CVR</div><div class="ext-v">{{ r.cvr }}%</div></div>
          <div class="ext"><div class="ext-l">播放</div><div class="ext-v">{{ fmt(r.plays) }}</div></div>
          <div class="ext"><div class="ext-l">转化成本</div><div class="ext-v">¥{{ r.orders > 0 ? (r.cost_raw / r.orders).toFixed(0) : '-' }}</div></div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="loading" class="empty">加载中...</div>
  <div v-else-if="!list.length" class="empty">暂无数据</div>

  <!-- 建议 -->
  <div class="tips" v-if="insights.length">
    <div class="tips-t">&#x1F4A1; 建议</div>
    <div v-for="(t, i) in insights" :key="i" class="tip">{{ t }}</div>
  </div>
  <!-- 命名规则弹窗 -->
  <div v-if="showRule" class="overlay" @click.self="showRule = false">
    <div class="sheet">
      <div class="sheet-hd"><span>素材命名规则</span><span class="sheet-close" @click="showRule = false">&#x2715;</span></div>
      <div class="sheet-bd">
        <div class="rule-box">
          <div class="rule-fmt">(人群)(视角)-(类型)-日期词-产品-人员(每字一人)</div>
          <div class="rule-eg">例：3.1用户-混功效-60323习惯-百合-夏佳金</div>
          <div class="rule-eg">解析：拍摄=夏+佳，剪辑=金（每个字=一个人）</div>
        </div>
        <div class="rule-sec"><b>人群</b><div class="rule-tags"><span>3.1 痛点前置</span><span>3.2 直切产品</span><span>3.3 场景带入</span><span>3.4 对比测评</span><span>3.5 知识科普</span><span>3.99 价格机制</span></div></div>
        <div class="rule-sec"><b>视角</b><div class="rule-tags"><span>商家</span><span>专家</span><span>用户</span><span>达人</span></div></div>
        <div class="rule-sec"><b>类型</b><div class="rule-tags"><span>促(促销)</span><span>功效</span><span>明星</span><span>图文</span><span>KOC</span><span>混(混合)</span><span>仿(仿拍)</span></div></div>
        <div class="rule-sec"><b>产品</b><div class="rule-tags"><span>百合</span><span>绿泥</span><span>慕斯</span><span>小黑管</span><span>VC</span></div></div>
        <div class="rule-sec"><b>人员</b><div class="rule-tags"><span>最后一段每个字=一个人</span><span>同名自动合并统计</span></div></div>
        <div class="rule-note">不符合命名规则的素材（达人素材、.mp4文件名等）不参与人员统计</div>
      </div>
    </div>
  </div>
  <div class="safe-bottom"></div>
</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import request from '../utils/request'

const period = ref('7d')
const curDim = ref('editor')
const filterBy = ref('new_date')
const list = ref([])
const summary = ref(null)
const loading = ref(false)
const exp = ref(-1)
const insights = ref([])
const showRule = ref(false)

const periods = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
]
const dimensions = [
  { key: 'editor', label: '剪辑' },
  { key: 'shooter', label: '拍摄' },
  { key: 'content_type', label: '类型' },
  { key: 'product', label: '产品' },
  { key: 'crowd', label: '人群' },
  { key: 'perspective', label: '视角' },
]

const maxCtr = computed(() => Math.max(...list.value.map(r => parseFloat(r.ctr) || 0), 1))
const fmt = v => { const n = parseFloat(v || 0); return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0) }
const rc = v => parseFloat(v) >= 2 ? 'g' : parseFloat(v) >= 1.5 ? 'o' : 'gr'
const cc = v => parseFloat(v) >= 3 ? 'g' : parseFloat(v) >= 2 ? 'b' : parseFloat(v) >= 1 ? 'o' : 'r'
const barW = v => Math.min((parseFloat(v) || 0) / maxCtr.value * 100, 100) + '%'
const toggleFilter = () => { filterBy.value = filterBy.value === 'new_date' ? 'stat_date' : 'new_date'; load() }

const load = async () => {
  loading.value = true; exp.value = -1
  try {
    const res = await request.get('/material-dimensions/analysis', {
      params: { period: period.value, dimension: curDim.value, filter_by: filterBy.value }
    })
    list.value = (res.data?.list || []).map(r => ({ ...r, cost_raw: parseFloat(r.cost) || 0 }))
    summary.value = res.data?.summary || null
    insights.value = res.data?.insights || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}
onMounted(load)
</script>

<style scoped>
.page{background:#f5f5f5;min-height:100vh}
.safe-bottom{height:calc(16px + env(safe-area-inset-bottom,0))}

/* 顶部 */
.hd{background:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;box-shadow:0 1px 0 #f0f0f0}
.hd-tabs{display:flex;background:#f5f5f5;border-radius:8px;padding:2px;margin-bottom:10px}
.tab{flex:1;text-align:center;padding:8px 0;font-size:14px;color:#999;border-radius:6px;cursor:pointer;font-weight:500}
.tab.on{background:#fff;color:#333;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.hd-row{display:flex;align-items:center;gap:8px}
.hd-dims{display:flex;gap:8px;overflow-x:auto;flex:1;-webkit-overflow-scrolling:touch}
.hd-dims::-webkit-scrollbar{display:none}
.dim{flex-shrink:0;padding:6px 16px;font-size:13px;border-radius:20px;background:#f5f5f5;color:#999;cursor:pointer;font-weight:500}
.dim.on{background:#1677ff;color:#fff}
.hd-filter{flex-shrink:0;padding:6px 12px;font-size:12px;border-radius:20px;border:1px solid #e8e8e8;color:#999;cursor:pointer}
.hd-filter.on{border-color:#1677ff;color:#1677ff;background:#e8f3ff}

/* 汇总 */
.sum{display:grid;grid-template-columns:repeat(4,1fr);margin:12px 16px;background:#fff;border-radius:12px;overflow:hidden}
.sum-i{padding:16px 8px;text-align:center;border-right:1px solid #fafafa}
.sum-i:last-child{border:none}
.sum-v{font-size:20px;font-weight:700;color:#333}
.sum-v.pri{color:#1677ff}
.sum-v.g{color:#00b42a}.sum-v.o{color:#ff7d00}.sum-v.gr{color:#bbb}
.sum-l{font-size:11px;color:#ccc;margin-top:3px}

/* 列表 */
.ls{padding:0 16px;display:flex;flex-direction:column;gap:8px}
.card{background:#fff;border-radius:12px;overflow:hidden}
.card:active{background:#fafafa}
.c-top{display:flex;align-items:center;padding:14px 16px 6px;gap:10px}
.c-rank{width:26px;height:26px;border-radius:8px;background:#f5f5f5;color:#999;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.c-rank.gold{background:#1677ff;color:#fff}
.c-name{flex:1;font-size:16px;font-weight:600;color:#333}
.c-cost{font-size:17px;font-weight:700;color:#1677ff}
.c-kpi{display:grid;grid-template-columns:repeat(4,1fr);padding:4px 16px 8px}
.k{text-align:center}
.k-v{font-size:15px;font-weight:600;color:#333}
.k-v.g{color:#00b42a}.k-v.b{color:#1677ff}.k-v.o{color:#ff7d00}.k-v.r{color:#f53f3f}
.k-l{font-size:10px;color:#ccc;margin-top:2px}
.c-bar{height:3px;background:#f5f5f5;margin:0 16px 14px;border-radius:2px}
.c-bar-fill{height:100%;border-radius:2px;transition:width .3s}
.c-bar-fill.g{background:#00b42a}.c-bar-fill.b{background:#1677ff}.c-bar-fill.o{background:#ff7d00}.c-bar-fill.r{background:#f53f3f}

/* 展开 */
.c-ext{padding:0 16px 14px;border-top:1px solid #f8f8f8}
.ext-g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:10px}
.ext{text-align:center}
.ext-l{font-size:10px;color:#ccc}
.ext-v{font-size:14px;font-weight:600;color:#333}

/* 建议 */
.tips{margin:12px 16px;background:#fff;border-radius:12px;padding:14px 16px}
.tips-t{font-size:14px;font-weight:600;color:#333;margin-bottom:8px}
.tip{font-size:13px;color:#666;line-height:1.8}

.empty{text-align:center;padding:60px 20px;color:#ccc;font-size:14px}

.hd-rule{flex-shrink:0;padding:6px 12px;font-size:12px;color:#1677ff;cursor:pointer}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:flex-end;justify-content:center}
.sheet{background:#fff;width:100%;max-width:480px;max-height:75vh;border-radius:14px 14px 0 0;display:flex;flex-direction:column}
.sheet-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #f5f5f5;font-size:15px;font-weight:600}
.sheet-close{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#f5f5f5;border-radius:50%;cursor:pointer;font-size:13px;color:#999}
.sheet-bd{overflow-y:auto;padding:14px 16px;-webkit-overflow-scrolling:touch}
.rule-box{background:#f7f8fa;border-radius:8px;padding:12px;margin-bottom:14px}
.rule-fmt{font-size:13px;color:#333;font-weight:500;line-height:1.6}
.rule-eg{font-size:12px;color:#1677ff;margin-top:4px}
.rule-sec{margin-bottom:12px}
.rule-sec b{display:block;font-size:13px;margin-bottom:6px}
.rule-tags{display:flex;flex-wrap:wrap;gap:6px}
.rule-tags span{padding:3px 10px;background:#f5f5f5;border-radius:12px;font-size:11px;color:#666}
.rule-note{font-size:11px;color:#999;padding:8px 0;border-top:1px solid #f5f5f5}
@media(min-width:768px){
  .page{padding:16px 24px}
  .hd{border-radius:12px;margin-bottom:4px;box-shadow:none;border:1px solid #f0f0f0}
  .sum{margin:12px 0}
  .ls{padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
  .tips{margin:12px 0}
  .card:hover{box-shadow:0 2px 8px rgba(0,0,0,.04)}
  .overlay{align-items:center}
  .sheet{border-radius:14px}
}
</style>
