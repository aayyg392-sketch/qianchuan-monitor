<template>
  <div class="bigscreen">
    <div class="bg-stars"></div>
    <div class="bg-grid"></div>
    <div class="bg-vignette"></div>
    <canvas ref="particleCanvas" class="particle-canvas"></canvas>

    <!-- ===== 顶部标题 ===== -->
    <div class="title-bar">
      <div class="wing left"><div class="wing-line"></div><div class="wing-dot"></div></div>
      <div class="title-center">
        <div class="td tl"></div><div class="td tr"></div><div class="td bl"></div><div class="td br"></div>
        <div class="title-sub-top">INTELLIGENT AUTOMATION PLATFORM</div>
        <h1 class="title-main">
          <svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="14" fill="none" stroke="#00f0ff" stroke-width="1.5" stroke-dasharray="6 4"/><circle cx="16" cy="16" r="8" fill="none" stroke="#00f0ff" stroke-width="1"/><circle cx="16" cy="16" r="3" fill="#00f0ff" opacity="0.8"/></svg>
          AI自动化腾讯ADQ指挥大屏
        </h1>
        <div class="title-sub-bot">TENCENT ADQ AI COMMAND CENTER</div>
      </div>
      <div class="wing right"><div class="wing-dot"></div><div class="wing-line"></div></div>
    </div>

    <!-- ===== 状态条 ===== -->
    <div class="status-bar">
      <div class="sb-left"><span class="sb-lbl">SYSTEM</span><span class="sb-val">{{ currentTime }}</span></div>
      <button class="engine-btn" :class="{ on: engineRunning }" @click="toggleEngine">
        <span class="eb-dot"></span>{{ engineRunning ? 'AI ENGINE ONLINE' : 'AI ENGINE OFFLINE' }}
      </button>
      <div class="sb-right"><span class="sb-lbl">LAST SCAN</span><span class="sb-val">{{ engineStatus.last_run_at ? fmtTime(engineStatus.last_run_at) : '--' }}</span></div>
    </div>

    <!-- ===== KPI 横条 ===== -->
    <div class="kpi-bar">
      <div class="kpi" v-for="k in kpiList" :key="k.key">
        <div class="kpi-top-line" :style="{background: k.color}"></div>
        <div class="kpi-val" :style="{color: k.color}">{{ k.value }}</div>
        <div class="kpi-lbl">{{ k.label }}</div>
      </div>
    </div>

    <!-- ===== 三栏主体（flex:1撑满剩余） ===== -->
    <div class="main-row">
      <!-- 左栏 -->
      <div class="col col-l">
        <div class="pnl">
          <div class="pnl-hd"><i class="dot cyan"></i>ADQ账户AI接管<div class="hd-line"></div></div>
          <div class="pnl-bd scroll-y">
            <div class="empty" v-if="!adqAccounts.length">暂无ADQ账户</div>
            <div class="acc" v-for="a in adqAccounts" :key="a.id" @click="toggleAiTakeover(a)">
              <div class="acc-l"><div class="acc-dot" :class="{on:a.aiEnabled}"></div><div><div class="acc-n">{{ a.account_name||a.app_id||'账户'+a.id }}</div><div class="acc-id">{{ a.account_id||a.id }}</div></div></div>
              <div class="sw" :class="{on:a.aiEnabled}"><div class="sw-t"><div class="sw-b"></div></div><span>{{ a.aiEnabled?'AI':'OFF' }}</span></div>
            </div>
          </div>
        </div>
        <div class="pnl">
          <div class="pnl-hd"><i class="dot red"></i>异常预警<div class="hd-line"></div></div>
          <div class="pnl-bd scroll-y">
            <div class="empty" v-if="!recentAnomalies.length"><span class="ok-icon">&#10003;</span>正常</div>
            <div v-for="(a,i) in recentAnomalies.slice(0,5)" :key="i" class="al-row" :class="'sv-'+getSeverity(a)">
              <div class="al-dot"></div>
              <div class="al-txt"><div class="al-msg">{{ getAlertMsg(a) }}</div><div class="al-t">{{ fmtTime(a.created_at) }}</div></div>
              <div class="al-tag">{{ getSeverity(a)==='critical'?'CRIT':'WARN' }}</div>
            </div>
          </div>
        </div>
        <div class="pnl">
          <div class="pnl-hd"><i class="dot purple"></i>策略规则<div class="hd-line"></div><button class="mini-btn" @click="showTemplates=true">+</button></div>
          <div class="pnl-bd scroll-y">
            <div class="empty" v-if="!rules.length">暂无规则</div>
            <div v-for="r in rules" :key="r.id" class="rule-row">
              <span class="rule-n">{{ r.rule_name }}</span>
              <span class="rule-sw" :class="r.is_active?'rs-on':'rs-off'" @click.stop="toggleRule(r)">{{ r.is_active?'ON':'OFF' }}</span>
              <span class="rule-del" @click.stop="deleteRule(r.id)">&#215;</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中央 -->
      <div class="col col-c">
        <div class="radar-wrap">
          <svg viewBox="0 0 400 400" class="radar-svg">
            <defs>
              <radialGradient id="rg1"><stop offset="0%" stop-color="rgba(0,240,255,0.06)"/><stop offset="100%" stop-color="transparent"/></radialGradient>
              <linearGradient id="swG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(0,240,255,0)"/><stop offset="100%" stop-color="rgba(0,240,255,0.15)"/></linearGradient>
            </defs>
            <circle cx="200" cy="200" r="190" fill="url(#rg1)"/>
            <circle v-for="r in [175,135,95,55]" :key="r" cx="200" cy="200" :r="r" fill="none" stroke="rgba(0,240,255,0.07)" stroke-width="0.8"/>
            <line x1="200" y1="15" x2="200" y2="385" stroke="rgba(0,240,255,0.05)" stroke-width="0.5"/>
            <line x1="15" y1="200" x2="385" y2="200" stroke="rgba(0,240,255,0.05)" stroke-width="0.5"/>
            <line x1="60" y1="60" x2="340" y2="340" stroke="rgba(0,240,255,0.025)" stroke-width="0.5"/>
            <line x1="340" y1="60" x2="60" y2="340" stroke="rgba(0,240,255,0.025)" stroke-width="0.5"/>
            <line v-for="d in 12" :key="'t'+d" x1="200" y1="25" x2="200" y2="33" stroke="rgba(0,240,255,0.12)" stroke-width="0.8" :transform="`rotate(${d*30} 200 200)`"/>
            <g v-if="engineRunning" class="sweep"><path d="M200,200 L200,25 A175,175 0 0,1 324,75 Z" fill="url(#swG)"/></g>
            <g v-for="(dot,i) in radarDots" :key="'d'+i">
              <circle :cx="dot.x" :cy="dot.y" :r="dot.r+3" :fill="dot.color" opacity="0.12" class="dhalo"/>
              <circle :cx="dot.x" :cy="dot.y" :r="dot.r" :fill="dot.color" class="dcore"/>
            </g>
            <circle cx="200" cy="200" r="188" fill="none" stroke="rgba(0,240,255,0.1)" stroke-width="1" stroke-dasharray="8 5" class="oring"/>
          </svg>
          <div class="radar-info">
            <div class="ri-st" :class="engineRunning?'on':'off'">{{ engineRunning?'SCANNING':'STANDBY' }}</div>
            <div class="ri-num">{{ engineStatus.total_decisions||0 }}</div>
            <div class="ri-sub">DECISIONS</div>
            <div class="ri-ring" v-if="engineRunning"></div>
          </div>
          <div class="rl tl">出价优化<br><b>{{ recentBids.length }}</b></div>
          <div class="rl tr">异常检测<br><b>{{ todayAnomalies }}</b></div>
          <div class="rl bl">素材监控<br><b>{{ fatigueAlerts.length }}</b></div>
          <div class="rl br">预算控制<br><b>{{ recentDecisions.filter(d=>d.decision_type==='budget_pace').length }}</b></div>
        </div>
        <div class="ebars">
          <div class="eb" v-for="e in engineBars" :key="e.label">
            <span class="eb-l">{{ e.label }}</span>
            <div class="eb-track"><div class="eb-fill" :style="{width:e.pct+'%',background:`linear-gradient(90deg,${e.color}00,${e.color})`}"></div></div>
            <span class="eb-v" :style="{color:e.color}">{{ e.value }}</span>
          </div>
        </div>
      </div>

      <!-- 右栏 -->
      <div class="col col-r">
        <div class="pnl">
          <div class="pnl-hd"><i class="dot green"></i>实时决策流<div class="hd-line"></div></div>
          <div class="pnl-bd scroll-y">
            <div class="empty" v-if="!recentDecisions.length">等待AI决策...</div>
            <div v-for="d in recentDecisions.slice(0,10)" :key="d.id" class="fd">
              <div class="fd-ic" :class="'fi-'+d.decision_type">{{ typeIcon(d.decision_type) }}</div>
              <div class="fd-bd"><div class="fd-msg">{{ summarizeDecision(d) }}</div><div class="fd-t">{{ fmtTime(d.created_at) }}</div></div>
              <div class="fd-st" :class="d.executed?'fs-ok':'fs-w'">{{ d.executed?'OK':'...' }}</div>
            </div>
          </div>
        </div>
        <div class="pnl">
          <div class="pnl-hd"><i class="dot yellow"></i>出价变动<div class="hd-line"></div></div>
          <div class="pnl-bd scroll-y">
            <div class="empty" v-if="!recentBids.length">暂无调价</div>
            <div v-for="(b,i) in recentBids.slice(0,6)" :key="i" class="bd-row">
              <div class="bd-arr" :class="getBidDirection(b)>0?'arr-up':'arr-dn'">{{ getBidDirection(b)>0?'&#9650;':'&#9660;' }}</div>
              <div class="bd-info"><div class="bd-v">{{ getBidFrom(b) }} <span>&rarr;</span> {{ getBidTo(b) }}</div><div class="bd-t">{{ fmtTime(b.created_at) }}</div></div>
              <div class="bd-pct" :class="getBidDirection(b)>0?'p-up':'p-dn'">{{ getBidDirection(b)>0?'+':'' }}{{ (getBidDirection(b)*100).toFixed(1) }}%</div>
            </div>
          </div>
        </div>
        <div class="pnl">
          <div class="pnl-hd"><i class="dot cyan"></i>模拟测试<div class="hd-line"></div></div>
          <div class="pnl-bd scroll-y">
            <div class="sim-tabs">
              <span :class="{active:simMode==='bid'}" @click="simMode='bid'">PID</span>
              <span :class="{active:simMode==='coldstart'}" @click="simMode='coldstart'">冷启动</span>
              <span :class="{active:simMode==='budget'}" @click="simMode='budget'">预算</span>
            </div>
            <div v-if="simMode==='bid'" class="sim-form">
              <div class="sf"><label>出价</label><input v-model.number="simBid.currentBid" type="number" class="si"></div>
              <div class="sf"><label>目标ROI</label><input v-model.number="simBid.targetROI" type="number" class="si"></div>
              <div class="sf"><label>实际ROI</label><input v-model.number="simBid.actualROI" type="number" class="si"></div>
              <button class="run-btn" @click="runBidSim" :disabled="simLoading">RUN</button>
              <div v-if="simBidResult" class="sim-r">
                <div class="sr-kv"><span>建议</span><b :class="simBidResult.adjustment>0?'v-up':'v-dn'">{{ simBidResult.newBid }}</b></div>
                <div class="sr-kv"><span>幅度</span><b>{{ (simBidResult.adjustment*100).toFixed(1) }}%</b></div>
              </div>
            </div>
            <div v-if="simMode==='coldstart'" class="sim-form">
              <div class="sf"><label>创建时间</label><input v-model="simCold.createTime" type="datetime-local" class="si"></div>
              <div class="sf"><label>累计转化</label><input v-model.number="simCold.totalConversions" type="number" class="si"></div>
              <button class="run-btn" @click="runColdSim" :disabled="simLoading">RUN</button>
              <div v-if="simColdResult" class="sim-r">
                <div class="sr-kv"><span>阶段</span><b class="ph" :class="'ph-'+simColdResult.phase">{{ phaseLabel(simColdResult.phase) }}</b></div>
                <div class="sr-kv"><span>进度</span><b>{{ (simColdResult.progress*100).toFixed(0) }}%</b></div>
              </div>
            </div>
            <div v-if="simMode==='budget'" class="sim-form">
              <div class="sf"><label>日预算</label><input v-model.number="simBudget.dailyBudget" type="number" class="si"></div>
              <div class="sf"><label>已花费</label><input v-model.number="simBudget.spentToday" type="number" class="si"></div>
              <button class="run-btn" @click="runBudgetSim" :disabled="simLoading">RUN</button>
              <div v-if="simBudgetResult" class="sim-r">
                <div class="sr-kv"><span>状态</span><b class="pc" :class="'pc-'+simBudgetResult.status">{{ paceLabel(simBudgetResult.status) }}</b></div>
                <div class="sr-kv"><span>偏差</span><b>{{ (simBudgetResult.deviation*100).toFixed(1) }}%</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板弹窗 -->
    <Teleport to="body">
      <div class="modal-mask" v-if="showTemplates" @click.self="showTemplates=false">
        <div class="modal-box">
          <div class="modal-t">RULE TEMPLATES</div>
          <div v-for="(t,i) in ruleTemplates" :key="i" class="tpl" @click="createFromTemplate(t)">
            <div class="tpl-n">{{ t.name }}</div>
            <div class="tpl-d">{{ t.description }}</div>
          </div>
          <button class="run-btn" @click="showTemplates=false" style="width:100%;margin-top:10px">CLOSE</button>
        </div>
      </div>
    </Teleport>
    <router-link to="/dashboard" class="back-link">&laquo; 返回</router-link>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const particleCanvas = ref(null)
const engineRunning = ref(false)
const engineStatus = ref({})
const todayAnomalies = ref(0)
const adqAccounts = ref([])
const recentAnomalies = ref([])
const recentBids = ref([])
const recentDecisions = ref([])
const fatigueAlerts = ref([])
const currentTime = ref('')
let timeTimer = null, refreshTimer = null, animFrame = null

const rules = ref([])
const ruleTemplates = ref([])
const showTemplates = ref(false)

const simMode = ref('bid')
const simLoading = ref(false)
const simBid = reactive({ platform:'adq', currentBid:5, targetROI:2.0, actualROI:1.2 })
const simBidResult = ref(null)
const simCold = reactive({ platform:'adq', createTime:'', totalConversions:8, currentBid:5 })
const simColdResult = ref(null)
const simBudget = reactive({ platform:'adq', dailyBudget:1000, spentToday:350, currentHour:new Date().getHours() })
const simBudgetResult = ref(null)

const kpiList = computed(() => {
  const t = engineStatus.value.total_decisions||0
  return [
    { key:'d', label:'AI决策', value:t, color:'#00f0ff' },
    { key:'a', label:'异常', value:todayAnomalies.value, color:'#ff4d6a' },
    { key:'t', label:'耗时', value:fmtDur(engineStatus.value.last_run_duration_ms), color:'#00ff88' },
    { key:'c', label:'AI接管', value:adqAccounts.value.filter(a=>a.aiEnabled).length, color:'#a78bfa' },
  ]
})

const engineBars = computed(() => {
  const t = Math.max(engineStatus.value.total_decisions||1,1)
  return [
    { label:'BID', value:recentBids.value.length, pct:Math.min(100,(recentBids.value.length/t)*100+5), color:'#00f0ff' },
    { label:'ANOMALY', value:todayAnomalies.value, pct:Math.min(100,(todayAnomalies.value/t)*100+3), color:'#ff4d6a' },
    { label:'CREATIVE', value:fatigueAlerts.value.length, pct:Math.min(100,(fatigueAlerts.value.length/t)*100+3), color:'#a78bfa' },
    { label:'BUDGET', value:recentDecisions.value.filter(d=>d.decision_type==='budget_pace').length, pct:8, color:'#00ff88' },
  ]
})

const radarDots = computed(() => {
  const dots = []; const items = [...recentBids.value.slice(0,6),...recentAnomalies.value.slice(0,4)]
  items.forEach((_,i) => { const a=(i/Math.max(items.length,1))*Math.PI*2+i*0.7, d=50+Math.random()*110; dots.push({x:200+Math.cos(a)*d,y:200+Math.sin(a)*d,r:2+Math.random()*2,color:i<recentBids.value.length?'#00f0ff':'#ff4d6a'}) })
  return dots
})

function fmtTime(t){return t?dayjs(t).format('MM-DD HH:mm'):''}
function fmtDur(ms){if(!ms)return'--';return ms<1000?ms+'ms':(ms/1000).toFixed(1)+'s'}
function updateTime(){currentTime.value=dayjs().format('YYYY-MM-DD HH:mm:ss')}
function getSeverity(a){try{const d=typeof a.decision_data==='string'?JSON.parse(a.decision_data):a.decision_data;return d?.anomalies?.[0]?.severity||'warning'}catch{return'warning'}}
function getAlertMsg(a){try{const d=typeof a.decision_data==='string'?JSON.parse(a.decision_data):a.decision_data;return d?.anomalies?.[0]?.message||d?.adName||'异常'}catch{return'异常'}}
function getBidDirection(b){try{const d=typeof b.decision_data==='string'?JSON.parse(b.decision_data):b.decision_data;return d?.adjustment||0}catch{return 0}}
function getBidFrom(b){try{const d=typeof b.decision_data==='string'?JSON.parse(b.decision_data):b.decision_data;return(d?.currentBid||0).toFixed(2)}catch{return'--'}}
function getBidTo(b){try{const d=typeof b.decision_data==='string'?JSON.parse(b.decision_data):b.decision_data;return(d?.newBid||0).toFixed(2)}catch{return'--'}}
function typeLabel(t){return{bid_adjust:'出价调整',bid:'出价',creative_rotate:'素材轮换',creative:'素材',budget_pace:'预算控制',budget:'预算',anomaly_alert:'异常告警',alert:'告警',cold_start:'冷启动',ai_takeover:'AI接管'}[t]||t}
function typeIcon(t){return{bid_adjust:'$',creative_rotate:'~',budget_pace:'%',anomaly_alert:'!',cold_start:'*'}[t]||'>'}
function phaseLabel(p){return{exploring:'探索期',accelerating:'加速期',graduated:'已毕业',failed:'失败'}[p]||p}
function paceLabel(s){return{normal:'正常',overspend:'超速',underspend:'偏慢'}[s]||s}
function summarizeDecision(d){try{const data=typeof d.decision_data==='string'?JSON.parse(d.decision_data):d.decision_data;if(d.decision_type==='bid_adjust')return`${data.adName||''} ${data.currentBid}->${data.newBid}`;if(d.decision_type==='anomaly_alert')return data.anomalies?.[0]?.message||data.adName||'异常';if(d.decision_type==='creative_rotate')return data.suggestion||`疲劳${data.score}`;if(d.decision_type==='budget_pace')return data.action?.message||`偏差${((data.deviation||0)*100).toFixed(1)}%`;return JSON.stringify(data).slice(0,40)}catch{return''}}

function initParticles(){
  const c=particleCanvas.value;if(!c)return;const ctx=c.getContext('2d');let w,h;const ps=[]
  function resize(){w=c.width=window.innerWidth;h=c.height=window.innerHeight};resize();window.addEventListener('resize',resize)
  for(let i=0;i<50;i++)ps.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-0.5)*0.25,vy:(Math.random()-0.5)*0.25,r:Math.random()*1.2+0.4,a:Math.random()*0.3+0.1})
  function draw(){ctx.clearRect(0,0,w,h);for(const p of ps){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=w;if(p.x>w)p.x=0;if(p.y<0)p.y=h;if(p.y>h)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(0,240,255,${p.a})`;ctx.fill()}
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const dx=ps[i].x-ps[j].x,dy=ps[i].y-ps[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<100){ctx.beginPath();ctx.moveTo(ps[i].x,ps[i].y);ctx.lineTo(ps[j].x,ps[j].y);ctx.strokeStyle=`rgba(0,240,255,${0.04*(1-dist/100)})`;ctx.stroke()}}
  animFrame=requestAnimationFrame(draw)};draw()
}

async function loadStatus(){try{const r=await request.get('/ai-engine/dashboard/status');engineStatus.value=r.data.engine||{};engineRunning.value=!!engineStatus.value.is_running;todayAnomalies.value=r.data.todayAnomalies||0}catch{}}
async function loadOverview(){try{const r=await request.get('/ai-engine/dashboard/overview');recentAnomalies.value=r.data.recentAnomalies||[];recentBids.value=r.data.recentBids||[];fatigueAlerts.value=r.data.fatigueAlerts||[]}catch{}}
async function loadRecentDecisions(){try{const r=await request.get('/ai-engine/dashboard/decisions',{params:{platform:'adq',page:1,page_size:10}});recentDecisions.value=r.data.list||[]}catch{}}
async function loadRules(){try{const r=await request.get('/ai-engine/rules/list');rules.value=r.data||[]}catch{}}
async function loadTemplates(){try{const r=await request.get('/ai-engine/rules/templates');ruleTemplates.value=r.data||[]}catch{}}
async function loadAdqAccounts(){try{const res=await request.get('/adq/accounts');const accounts=res.data||[];const rulesRes=await request.get('/ai-engine/rules/list');const aiRules=(rulesRes.data||[]).filter(r=>r.rule_type==='ai_takeover'&&r.is_active);const aiIds=new Set(aiRules.map(r=>{const c=typeof r.rule_config==='string'?JSON.parse(r.rule_config):r.rule_config;return String(c?.accountDbId||'')}));adqAccounts.value=accounts.map(a=>({...a,aiEnabled:aiIds.has(String(a.id))}))}catch{}}
async function toggleAiTakeover(acc){try{if(acc.aiEnabled){const rulesRes=await request.get('/ai-engine/rules/list');const rule=(rulesRes.data||[]).find(r=>{if(r.rule_type!=='ai_takeover')return false;const c=typeof r.rule_config==='string'?JSON.parse(r.rule_config):r.rule_config;return String(c?.accountDbId)===String(acc.id)});if(rule)await request.delete(`/ai-engine/rules/${rule.id}`);acc.aiEnabled=false;message.success('已关闭AI接管')}else{await request.post('/ai-engine/rules/create',{platform:'adq',rule_name:`AI接管-${acc.account_name||acc.id}`,rule_type:'ai_takeover',rule_config:{accountDbId:acc.id,accountId:acc.account_id,enableBidAdjust:true,enableMaterialRotate:true,enableBudgetPace:true,enableAnomalyAlert:true,targetCPA:50}});acc.aiEnabled=true;message.success('AI接管已开启')}}catch{message.error('操作失败')}}
async function createFromTemplate(tpl){try{await request.post('/ai-engine/rules/create',{platform:tpl.config?.platform||'adq',rule_name:tpl.name,rule_type:tpl.type,rule_config:tpl.config});message.success('创建成功');showTemplates.value=false;loadRules()}catch{}}
async function toggleRule(r){try{await request.post(`/ai-engine/rules/toggle/${r.id}`);r.is_active=r.is_active?0:1}catch{}}
async function deleteRule(id){try{await request.delete(`/ai-engine/rules/${id}`);rules.value=rules.value.filter(r=>r.id!==id)}catch{}}
async function toggleEngine(){try{const a=engineRunning.value?'stop':'start';await request.post(`/ai-engine/${a}`);engineRunning.value=!engineRunning.value;message.success(engineRunning.value?'引擎已启动':'引擎已停止')}catch{}}
async function runBidSim(){simLoading.value=true;try{const r=await request.post('/ai-engine/dashboard/simulate-bid',simBid);simBidResult.value=r.data}catch{}finally{simLoading.value=false}}
async function runColdSim(){simLoading.value=true;try{const r=await request.post('/ai-engine/dashboard/simulate-coldstart',{platform:'adq',adgroup:{createTime:simCold.createTime||new Date(Date.now()-48*3600000).toISOString(),totalConversions:simCold.totalConversions,totalImpressions:10000,totalCost:500,currentBid:simCold.currentBid,dailyBudget:300}});simColdResult.value=r.data}catch{}finally{simLoading.value=false}}
async function runBudgetSim(){simLoading.value=true;try{const r=await request.post('/ai-engine/dashboard/simulate-budget',simBudget);simBudgetResult.value=r.data}catch{}finally{simLoading.value=false}}

onMounted(()=>{updateTime();timeTimer=setInterval(updateTime,1000);initParticles();loadStatus();loadOverview();loadRecentDecisions();loadRules();loadTemplates();loadAdqAccounts();refreshTimer=setInterval(()=>{loadStatus();loadOverview();loadRecentDecisions()},30000)})
onUnmounted(()=>{clearInterval(timeTimer);clearInterval(refreshTimer);if(animFrame)cancelAnimationFrame(animFrame)})
</script>

<style scoped>
@keyframes scanDown{0%{top:-2px}100%{top:100%}}
@keyframes radarSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes dotBlink{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}
@keyframes ringExpand{0%{transform:translate(-50%,-50%) scale(.8);opacity:.5}100%{transform:translate(-50%,-50%) scale(2);opacity:0}}
@keyframes floatUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes oringSpin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}

/* 根 - 一屏填满 */
.bigscreen{width:100vw;height:100vh;background:#020810;color:#c0d0e0;font-family:'SF Mono','Menlo','Consolas','PingFang SC',monospace;display:flex;flex-direction:column;overflow:hidden;position:relative}

/* 背景 */
.bg-stars{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(1px 1px at 20% 30%,rgba(0,240,255,.3),transparent),radial-gradient(1px 1px at 60% 70%,rgba(0,240,255,.2),transparent),radial-gradient(1px 1px at 80% 20%,rgba(0,240,255,.15),transparent),radial-gradient(1px 1px at 40% 80%,rgba(255,77,106,.12),transparent)}
.bg-grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,240,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,.02) 1px,transparent 1px);background-size:50px 50px}
.bg-vignette{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 40%,rgba(2,8,16,.7))}
.particle-canvas{position:fixed;inset:0;z-index:1;pointer-events:none}

/* 标题 */
.title-bar{position:relative;z-index:10;display:flex;align-items:center;justify-content:center;padding:8px 20px 4px;flex-shrink:0}
.wing{flex:1;display:flex;align-items:center;gap:5px;max-width:300px}
.wing.left{flex-direction:row-reverse}
.wing-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(0,240,255,.35),rgba(0,240,255,.08))}
.wing.left .wing-line{background:linear-gradient(90deg,rgba(0,240,255,.08),rgba(0,240,255,.35),transparent)}
.wing-dot{width:5px;height:5px;border-radius:50%;background:#00f0ff;box-shadow:0 0 6px #00f0ff}
.title-center{position:relative;text-align:center;padding:4px 24px;border:1px solid rgba(0,240,255,.12);background:linear-gradient(180deg,rgba(0,240,255,.02),transparent);clip-path:polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)}
.td{position:absolute;width:10px;height:10px;border-color:rgba(0,240,255,.35);border-style:solid;border-width:0}
.td.tl{top:-1px;left:-1px;border-top-width:2px;border-left-width:2px}
.td.tr{top:-1px;right:-1px;border-top-width:2px;border-right-width:2px}
.td.bl{bottom:-1px;left:-1px;border-bottom-width:2px;border-left-width:2px}
.td.br{bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px}
.title-sub-top{font-size:7px;letter-spacing:2.5px;color:rgba(0,240,255,.35)}
.title-main{margin:0;font-size:18px;font-weight:800;letter-spacing:3px;background:linear-gradient(90deg,#00f0ff,#fff,#00f0ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:flex;align-items:center;justify-content:center;gap:6px}
.title-sub-bot{font-size:7px;letter-spacing:3px;color:rgba(0,240,255,.25)}

/* 状态条 */
.status-bar{position:relative;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:3px 24px;flex-shrink:0;border-top:1px solid rgba(0,240,255,.06)}
.sb-lbl{font-size:7px;color:rgba(0,240,255,.25);letter-spacing:1px;display:block}
.sb-val{font-size:10px;color:rgba(0,240,255,.6);font-weight:600}
.sb-left,.sb-right{min-width:100px}
.sb-right{text-align:right}
.engine-btn{display:flex;align-items:center;gap:6px;padding:3px 14px;border:1px solid rgba(255,77,106,.35);background:rgba(255,77,106,.05);color:#ff4d6a;font-size:9px;font-weight:700;letter-spacing:1.5px;cursor:pointer;font-family:inherit;transition:all .3s}
.engine-btn.on{border-color:rgba(0,240,255,.35);background:rgba(0,240,255,.05);color:#00f0ff}
.eb-dot{width:5px;height:5px;border-radius:50%;background:#ff4d6a}
.engine-btn.on .eb-dot{background:#00f0ff;box-shadow:0 0 6px #00f0ff;animation:pulse 2s infinite}

/* KPI */
.kpi-bar{position:relative;z-index:10;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:4px 20px;flex-shrink:0}
.kpi{position:relative;padding:6px 10px;background:rgba(0,240,255,.015);border:1px solid rgba(0,240,255,.06);clip-path:polygon(5px 0,calc(100% - 5px) 0,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0 calc(100% - 5px),0 5px);text-align:center}
.kpi-top-line{position:absolute;top:0;left:20%;right:20%;height:1px;filter:blur(2px)}
.kpi-val{font-size:20px;font-weight:900;line-height:1}
.kpi-lbl{font-size:8px;color:rgba(200,210,220,.35);margin-top:1px;letter-spacing:.5px}

/* 三栏 - 占满剩余高度 */
.main-row{position:relative;z-index:10;flex:1;display:flex;gap:10px;padding:6px 20px 8px;min-height:0}

.col{display:flex;flex-direction:column;gap:6px;min-height:0}
.col-l,.col-r{width:24%;flex-shrink:0}
.col-c{flex:1;display:flex;flex-direction:column;align-items:center;min-height:0}

/* 面板 */
.pnl{background:linear-gradient(180deg,rgba(0,16,32,.85),rgba(0,8,20,.9));border:1px solid rgba(0,240,255,.08);position:relative;display:flex;flex-direction:column;min-height:0;flex:1;animation:floatUp .4s ease}
.pnl::before,.pnl::after{content:'';position:absolute;width:12px;height:12px;border-color:rgba(0,240,255,.2);border-style:solid;border-width:0}
.pnl::before{top:-1px;left:-1px;border-top-width:2px;border-left-width:2px}
.pnl::after{bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px}
.pnl-hd{display:flex;align-items:center;gap:6px;padding:6px 10px 5px;font-size:10px;font-weight:700;color:#00f0ff;letter-spacing:.8px;border-bottom:1px solid rgba(0,240,255,.05);flex-shrink:0}
.dot{width:5px;height:5px;border-radius:50%;box-shadow:0 0 4px currentColor;animation:pulse 3s infinite;flex-shrink:0}
.dot.cyan{background:#00f0ff;color:#00f0ff}
.dot.red{background:#ff4d6a;color:#ff4d6a}
.dot.green{background:#00ff88;color:#00ff88}
.dot.yellow{background:#ffb800;color:#ffb800}
.dot.purple{background:#a78bfa;color:#a78bfa}
.hd-line{flex:1;height:1px;background:linear-gradient(90deg,rgba(0,240,255,.12),transparent)}
.mini-btn{background:none;border:1px solid rgba(0,240,255,.2);color:#00f0ff;font-size:10px;width:18px;height:18px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;padding:0}
.pnl-bd{padding:4px 10px 6px;flex:1;min-height:0}
.scroll-y{overflow-y:auto;overflow-x:hidden}
.scroll-y::-webkit-scrollbar{width:2px}
.scroll-y::-webkit-scrollbar-thumb{background:rgba(0,240,255,.15);border-radius:1px}
.empty{text-align:center;color:rgba(200,210,220,.18);font-size:10px;padding:8px 0}
.ok-icon{color:#00ff88;font-size:14px;display:block;margin-bottom:2px}

/* 账户 */
.acc{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.02);cursor:pointer}
.acc:hover{background:rgba(0,240,255,.02)}
.acc-l{display:flex;align-items:center;gap:6px}
.acc-dot{width:5px;height:5px;border-radius:50%;background:rgba(200,210,220,.15);flex-shrink:0}
.acc-dot.on{background:#00f0ff;box-shadow:0 0 4px #00f0ff}
.acc-n{font-size:10px;color:rgba(255,255,255,.75)}
.acc-id{font-size:8px;color:rgba(200,210,220,.2)}
.sw{display:flex;align-items:center;gap:4px;font-size:8px;font-weight:700;color:rgba(200,210,220,.25)}
.sw.on{color:#00f0ff}
.sw-t{width:22px;height:11px;border-radius:6px;background:rgba(255,255,255,.06);position:relative}
.sw.on .sw-t{background:rgba(0,240,255,.15)}
.sw-b{width:7px;height:7px;border-radius:50%;background:rgba(200,210,220,.3);position:absolute;top:2px;left:2px;transition:all .3s}
.sw.on .sw-b{left:13px;background:#00f0ff;box-shadow:0 0 4px #00f0ff}

/* 异常 */
.al-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.02)}
.al-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
.sv-critical .al-dot{background:#ff4d6a;box-shadow:0 0 6px #ff4d6a;animation:pulse 1s infinite}
.sv-warning .al-dot{background:#ffb800}
.al-txt{flex:1;min-width:0}
.al-msg{font-size:10px;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.al-t{font-size:7px;color:rgba(200,210,220,.18)}
.al-tag{font-size:7px;font-weight:700;padding:1px 4px;flex-shrink:0}
.sv-critical .al-tag{color:#ff4d6a;border:1px solid rgba(255,77,106,.15)}
.sv-warning .al-tag{color:#ffb800;border:1px solid rgba(255,184,0,.15)}

/* 规则 */
.rule-row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.02);font-size:10px}
.rule-n{flex:1;color:rgba(255,255,255,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rule-sw{font-size:8px;font-weight:700;padding:1px 6px;cursor:pointer}
.rs-on{color:#00f0ff;border:1px solid rgba(0,240,255,.2)}
.rs-off{color:rgba(200,210,220,.2);border:1px solid rgba(200,210,220,.06)}
.rule-del{color:#ff4d6a;cursor:pointer;font-size:12px;flex-shrink:0}

/* 雷达 */
.radar-wrap{position:relative;width:100%;max-width:340px;aspect-ratio:1;flex-shrink:0}
.radar-svg{width:100%;height:100%}
.sweep{transform-origin:200px 200px;animation:radarSpin 4s linear infinite}
.dhalo{animation:dotBlink 3s ease infinite}
.dcore{filter:drop-shadow(0 0 2px currentColor)}
.oring{transform-origin:200px 200px;animation:oringSpin 30s linear infinite}
.radar-info{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
.ri-st{font-size:8px;font-weight:700;letter-spacing:2px}
.ri-st.on{color:#00f0ff}
.ri-st.off{color:#ff4d6a}
.ri-num{font-size:28px;font-weight:900;color:#fff;line-height:1;margin:1px 0}
.ri-sub{font-size:6px;color:rgba(200,210,220,.25);letter-spacing:2px}
.ri-ring{position:absolute;top:50%;left:50%;width:55px;height:55px;border-radius:50%;border:1px solid rgba(0,240,255,.15);animation:ringExpand 2.5s ease-out infinite}
.rl{position:absolute;font-size:8px;color:rgba(0,240,255,.35);text-align:center;line-height:1.3}
.rl b{color:#00f0ff;font-size:12px;display:block}
.rl.tl{top:6%;left:6%}
.rl.tr{top:6%;right:6%}
.rl.bl{bottom:6%;left:6%}
.rl.br{bottom:6%;right:6%}

/* 引擎条 */
.ebars{width:100%;max-width:340px;margin-top:4px}
.eb{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.eb-l{font-size:7px;color:rgba(200,210,220,.25);width:55px;text-align:right;flex-shrink:0;letter-spacing:.3px}
.eb-track{flex:1;height:3px;background:rgba(255,255,255,.03);border-radius:1px;overflow:hidden}
.eb-fill{height:100%;border-radius:1px;transition:width .8s ease}
.eb-v{font-size:9px;font-weight:700;width:20px}

/* 决策流 */
.fd{display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.02)}
.fd-ic{width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;flex-shrink:0;border:1px solid}
.fi-bid_adjust{color:#00f0ff;border-color:rgba(0,240,255,.15)}
.fi-creative_rotate{color:#a78bfa;border-color:rgba(167,139,250,.15)}
.fi-budget_pace{color:#00ff88;border-color:rgba(0,255,136,.15)}
.fi-anomaly_alert{color:#ff4d6a;border-color:rgba(255,77,106,.15)}
.fi-cold_start{color:#ffb800;border-color:rgba(255,184,0,.15)}
.fd-bd{flex:1;min-width:0}
.fd-msg{font-size:9px;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fd-t{font-size:7px;color:rgba(200,210,220,.15)}
.fd-st{font-size:7px;font-weight:700;padding:1px 4px;flex-shrink:0}
.fs-ok{color:#00ff88;border:1px solid rgba(0,255,136,.12)}
.fs-w{color:rgba(200,210,220,.2);border:1px solid rgba(200,210,220,.06)}

/* 出价 */
.bd-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.02)}
.bd-arr{font-size:8px;flex-shrink:0}
.arr-up{color:#00f0ff}
.arr-dn{color:#00ff88}
.bd-info{flex:1}
.bd-v{font-size:10px;color:rgba(255,255,255,.6)}
.bd-v span{color:rgba(0,240,255,.35)}
.bd-t{font-size:7px;color:rgba(200,210,220,.15)}
.bd-pct{font-size:10px;font-weight:700;flex-shrink:0}
.p-up{color:#00f0ff}
.p-dn{color:#00ff88}

/* 模拟 */
.sim-tabs{display:flex;gap:5px;margin-bottom:6px}
.sim-tabs span{padding:3px 8px;font-size:9px;cursor:pointer;color:rgba(200,210,220,.25);border:1px solid rgba(200,210,220,.06)}
.sim-tabs span.active{color:#00f0ff;border-color:rgba(0,240,255,.2);background:rgba(0,240,255,.02)}
.sim-form{}
.sf{margin-bottom:5px;display:flex;align-items:center;gap:6px}
.sf label{font-size:8px;color:rgba(200,210,220,.3);width:50px;flex-shrink:0;text-align:right}
.si{flex:1;background:rgba(0,240,255,.02);border:1px solid rgba(0,240,255,.1);color:#c0d0e0;padding:4px 6px;font-size:10px;font-family:inherit;-webkit-appearance:none;box-sizing:border-box}
.si:focus{border-color:#00f0ff;outline:none}
.run-btn{background:rgba(0,240,255,.03);border:1px solid rgba(0,240,255,.2);color:#00f0ff;padding:4px 10px;font-size:9px;font-weight:700;letter-spacing:1px;cursor:pointer;font-family:inherit;width:100%;margin-top:4px}
.run-btn:disabled{opacity:.3}
.sim-r{margin-top:5px;border:1px solid rgba(0,240,255,.06);padding:5px 8px}
.sr-kv{display:flex;justify-content:space-between;padding:2px 0;font-size:10px}
.sr-kv span{color:rgba(200,210,220,.3)}
.sr-kv b{color:#fff}
.v-up{color:#00f0ff !important}
.v-dn{color:#00ff88 !important}
.ph{padding:1px 4px;font-size:8px}
.ph-exploring{color:#ffb800}
.ph-accelerating{color:#00f0ff}
.ph-graduated{color:#00ff88}
.ph-failed{color:#ff4d6a}
.pc{font-size:9px}
.pc-normal{color:#00ff88}
.pc-overspend{color:#ff4d6a}
.pc-underspend{color:#ffb800}

/* 弹窗 */
.modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.modal-box{background:#060e1a;border:1px solid rgba(0,240,255,.2);padding:16px;width:100%;max-width:380px;max-height:60vh;overflow-y:auto}
.modal-t{font-size:11px;font-weight:700;color:#00f0ff;letter-spacing:1.5px;text-align:center;margin-bottom:10px}
.tpl{padding:8px;border:1px solid rgba(0,240,255,.05);margin-bottom:5px;cursor:pointer}
.tpl:hover{border-color:rgba(0,240,255,.2)}
.tpl-n{font-size:11px;color:#fff;font-weight:600}
.tpl-d{font-size:9px;color:rgba(200,210,220,.3);margin-top:2px}

.back-link{position:fixed;bottom:8px;left:20px;z-index:50;color:rgba(0,240,255,.35);font-size:9px;text-decoration:none;padding:3px 8px;border:1px solid rgba(0,240,255,.08);background:rgba(2,8,16,.9);font-family:inherit}
.back-link:hover{color:#00f0ff;border-color:rgba(0,240,255,.25)}

/* 手机端 */
@media(max-width:768px){
  .bigscreen{height:auto;min-height:100vh;overflow-y:auto}
  .main-row{flex-direction:column;flex:none}
  .col-l,.col-r{width:100%}
  .pnl{flex:none}
  .scroll-y{max-height:200px}
  .radar-wrap{max-width:240px}
  .kpi-bar{grid-template-columns:repeat(2,1fr)}
  .title-main{font-size:13px}
  .wing{display:none}
}
</style>
