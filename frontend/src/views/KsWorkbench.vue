<template>
  <div class="wb">
    <div class="wb-top">
      <span class="wb-title">快手工作台</span>
      <span class="wb-date">{{ todayStr }}</span>
      <span class="wb-rf" :class="{ spinning: loading }" @click="refresh">&#x21bb;</span>
    </div>

    <template v-if="total">
      <!-- 顶部总览卡片 -->
      <div class="cards">
        <div class="card">
          <div class="card-head"><span class="card-label">整体GMV</span><span class="card-chg" :class="cc(total.changes.gmv)">{{ ct(total.changes.gmv) }}</span></div>
          <div class="card-val blue">¥{{ fmt(total.today.gmv) }}</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">整体订单数</span><span class="card-chg" :class="cc(total.changes.orders)">{{ ct(total.changes.orders) }}</span></div>
          <div class="card-val">{{ total.today.orders }}</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">整体退款额</span><span class="card-chg" :class="cc(total.changes.refund_amt, true)">{{ ct(total.changes.refund_amt) }}</span></div>
          <div class="card-val">¥{{ fmt(total.today.refund_amt) }}</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">整体客单价</span><span class="card-chg" :class="cc(total.changes.avg)">{{ ct(total.changes.avg) }}</span></div>
          <div class="card-val">¥{{ fmt(total.today.avg) }}</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">访客数</span></div>
          <div class="card-val dim">-</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">转化率</span></div>
          <div class="card-val dim">-</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">付费销售</span><span class="card-chg" :class="cc(total.changes.paid_sales)">{{ ct(total.changes.paid_sales) }}</span></div>
          <div class="card-val">¥{{ fmt(total.today.paid_sales) }}</div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-label">磁力消耗</span><span class="card-chg" :class="cc(total.changes.ad_cost, true)">{{ ct(total.changes.ad_cost) }}</span></div>
          <div class="card-val">¥{{ fmt(total.today.ad_cost) }}</div>
        </div>
      </div>

      <!-- 店铺列表标题 -->
      <div class="list-head">
        <span class="list-title">店铺列表</span>
        <span class="wb-rf" :class="{ spinning: loading }" @click="refresh">&#x21bb;</span>
      </div>

      <!-- 店铺表格 -->
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="col-shop">店铺信息</th>
              <th>GMV</th>
              <th>订单</th>
              <th>退款额</th>
              <th>客单价</th>
              <th>访客</th>
              <th>转化率</th>
              <th>付费销售</th>
              <th>磁力消耗</th>
              <th>待办</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="shop in shops" :key="shop.shop_id">
              <td class="col-shop">
                <div class="sn">{{ shop.shop_name }}</div>
                <div class="ss" :class="{ off: !shop.last_sync_at }">{{ shop.last_sync_at ? fmtSync(shop.last_sync_at) : '未同步' }}</div>
              </td>
              <td>
                <span class="v hl">¥{{ fmt(shop.today.gmv) }}</span>
                <span class="c" :class="cc(shop.changes.gmv)">{{ ct(shop.changes.gmv) }}</span>
              </td>
              <td>
                <span class="v">{{ shop.today.orders }}</span>
                <span class="c" :class="cc(shop.changes.orders)">{{ ct(shop.changes.orders) }}</span>
              </td>
              <td>
                <span class="v">¥{{ fmt(shop.today.refund_amt) }}</span>
                <span class="c" :class="cc(shop.changes.refund_amt, true)">{{ ct(shop.changes.refund_amt) }}</span>
              </td>
              <td>
                <span class="v">¥{{ fmt(shop.today.avg) }}</span>
                <span class="c" :class="cc(shop.changes.avg)">{{ ct(shop.changes.avg) }}</span>
              </td>
              <td><span class="v na">-</span></td>
              <td><span class="v na">-</span></td>
              <td>
                <span class="v">¥{{ fmt(shop.today.paid_sales) }}</span>
                <span class="c" :class="cc(shop.changes.paid_sales)">{{ ct(shop.changes.paid_sales) }}</span>
              </td>
              <td>
                <span class="v">¥{{ fmt(shop.today.ad_cost) }}</span>
                <span class="c" :class="cc(shop.changes.ad_cost, true)">{{ ct(shop.changes.ad_cost) }}</span>
              </td>
              <td class="col-tags">
                <span class="tag tw" v-if="shop.pending.ship > 0">发{{ shop.pending.ship }}</span>
                <span class="tag te" v-if="shop.pending.refund > 0">退{{ shop.pending.refund }}</span>
              </td>
            </tr>
            <!-- 汇总行（底部） -->
            <tr class="row-total">
              <td class="col-shop"><b>汇总 ({{ shops.length }}个店铺)</b></td>
              <td><span class="v">¥{{ fmt(total.today.gmv) }}</span></td>
              <td><span class="v">{{ total.today.orders }}</span></td>
              <td><span class="v">¥{{ fmt(total.today.refund_amt) }}</span></td>
              <td><span class="v">¥{{ fmt(total.today.avg) }}</span></td>
              <td></td>
              <td></td>
              <td><span class="v">¥{{ fmt(total.today.paid_sales) }}</span></td>
              <td><span class="v">¥{{ fmt(total.today.ad_cost) }}</span></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="wb-empty" v-if="!loading && !shops.length">暂无店铺数据</div>
    <div class="wb-ld" v-if="loading && !total"><span/><span/><span/></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import request from '../utils/request'

const loading = ref(false)
const total = ref(null)
const shops = ref([])
let timer = null

const todayStr = (() => {
  const d = new Date()
  return `${d.getMonth()+1}/${d.getDate()} ${'日一二三四五六'[d.getDay()]}`
})()

function fmt(v) {
  const n = Number(v) || 0
  if (n >= 10000) return (n / 10000).toFixed(2) + '万'
  if (n >= 1000) return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return n % 1 ? n.toFixed(2) : String(n)
}
function cc(v, inv) {
  if (v > 0) return inv ? 'cr' : 'cg'
  if (v < 0) return inv ? 'cg' : 'cr'
  return 'cn'
}
function ct(v) { return v == null || v === 0 ? '' : (v > 0 ? '+' : '') + v + '%' }
function fmtSync(dt) {
  const diff = Math.floor((Date.now() - new Date(dt)) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return diff + '分钟前'
  if (diff < 1440) return Math.floor(diff / 60) + '小时前'
  return `${new Date(dt).getMonth()+1}/${new Date(dt).getDate()}`
}
async function fetchData() {
  loading.value = true
  try {
    const res = await request.get('/ks-wb/overview-all')
    const d = res.data || res
    total.value = d.total; shops.value = d.shops || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}
function refresh() { if (!loading.value) fetchData() }
onMounted(() => { fetchData(); timer = setInterval(fetchData, 120000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
.wb {
  background: #fff; min-height: 100vh;
  font: 13px/1.4 -apple-system, 'PingFang SC', sans-serif;
  -webkit-font-smoothing: antialiased; color: #1D2129;
}

/* 顶栏 */
.wb-top {
  display: flex; align-items: baseline;
  padding: 16px 20px 14px; border-bottom: 1px solid #EBEDF0;
  position: sticky; top: 0; background: #fff; z-index: 20;
}
.wb-title { font-size: 17px; font-weight: 700; }
.wb-date { font-size: 12px; color: #86909C; margin-left: 8px; }
.wb-rf { margin-left: auto; font-size: 16px; color: #86909C; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
.wb-rf:hover { background: #F2F3F5; }
.spinning { display: inline-block; animation: sp .7s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }

/* ===== 总览卡片 ===== */
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 16px 20px;
}
.card {
  border: 1px solid #E5E6EB;
  border-radius: 8px;
  padding: 14px 16px;
}
.card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.card-label { font-size: 13px; color: #86909C; }
.card-chg { font-size: 12px; font-weight: 500; }
.card-val { font-size: 24px; font-weight: 700; color: #1D2129; line-height: 1.2; }
.card-val.blue { color: #1677FF; }
.card-val.dim { color: #C9CDD4; }

/* ===== 店铺列表标题 ===== */
.list-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
}
.list-title { font-size: 16px; font-weight: 700; color: #1D2129; }

/* ===== 表格 ===== */
.tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.tbl { width: 100%; min-width: 900px; border-collapse: collapse; }
.tbl th, .tbl td { padding: 12px 10px; text-align: center; vertical-align: middle; white-space: nowrap; }
.tbl th {
  font-size: 12px; font-weight: 500; color: #86909C;
  background: #FAFBFC; border-bottom: 1px solid #EBEDF0;
  
}
.tbl td { border-bottom: 1px solid #F0F0F0; }
.tbl tbody tr:hover { background: #F7F8FA; }
.tbl tbody tr:hover .col-shop { background: #F7F8FA; }

/* 列 */
.col-shop {
  width: 180px; text-align: left !important; padding-left: 20px !important;
  position: sticky; left: 0; z-index: 10; background: #fff;
}
.tbl th.col-shop { background: #FAFBFC; }
.col-tags { width: 90px; }

/* 汇总行 */
.row-total { background: #FAFBFC !important; }
.row-total td { border-top: 2px solid #EBEDF0; border-bottom: none; }
.row-total .col-shop { background: #FAFBFC; }
.row-total b { font-size: 14px; font-weight: 700; color: #1D2129; }
.row-total .v { font-size: 15px; font-weight: 700; }

/* 店名 */
.sn { font-size: 13px; font-weight: 600; color: #1D2129; }
.ss { font-size: 10px; color: #00B578; margin-top: 2px; display: flex; align-items: center; gap: 3px; }
.ss::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: #00B578; }
.ss.off { color: #C9CDD4; }
.ss.off::before { background: #C9CDD4; }

/* 数值 */
.v { display: block; font-size: 14px; font-weight: 600; color: #1D2129; }
.v.hl { color: #1677FF; }
.v.na { color: #C9CDD4; font-weight: 400; }
.c { display: block; font-size: 11px; font-weight: 500; margin-top: 2px; }
.cg { color: #00B578; }
.cr { color: #FF3141; }
.cn { color: #C9CDD4; }

/* 标签 */
.tag { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 500; display: inline-block; margin: 1px; }
.tw { background: #FFF7E6; color: #FF8F1F; }
.te { background: #FFF1F0; color: #FF3141; }

/* 空/加载 */
.wb-empty { text-align: center; padding: 60px 0; color: #86909C; }
.wb-ld { display: flex; justify-content: center; gap: 5px; padding: 60px 0; }
.wb-ld span { width: 7px; height: 7px; border-radius: 50%; background: #1677FF; animation: bn 1s infinite; }
.wb-ld span:nth-child(2) { animation-delay: .15s; }
.wb-ld span:nth-child(3) { animation-delay: .3s; }
@keyframes bn { 0%,80%,100%{opacity:.25;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }

/* 响应式 */
@media (max-width: 768px) {
  .cards { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 12px; }
  .card { padding: 10px 12px; }
  .card-val { font-size: 18px; }
  .list-head { padding: 12px; }
}
@media (min-width: 1000px) {
  .tbl { min-width: auto; }
}
</style>
