<template>
<div class="adq-dash">
  <div class="adq-hd">
    <h2>ADQ账户管理</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <span v-if="utStatus==='valid'" class="ut-tag" :class="utDaysLeft<=3?'warn':'ok'">实名已认证 · 剩{{ utDaysLeft }}天</span>
      <button v-if="utStatus!=='valid' || utDaysLeft<=3" class="adq-btn ut-btn" @click="goUserTokenAuth">{{ utStatus==='valid'?'续期':'实名认证' }}</button>
      <button class="adq-btn" @click="loadOverview" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
      <a-range-picker v-model:value="dateRange" size="small" :presets="datePresets" :allow-clear="false" :style="{width:'260px'}" @change="onDateChange" />
    </div>
  </div>

  <!-- 汇总卡片 -->
  <div class="adq-summary" v-if="summary.cost !== undefined">
    <div class="adq-card"><div class="adq-card-label">{{ periodLabel }}消耗</div><div class="adq-card-val">{{ fmt(summary.cost) }}</div><div class="adq-card-change" :class="summary.costChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.costChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">曝光量</div><div class="adq-card-val">{{ fmtInt(summary.impression) }}</div><div class="adq-card-change" :class="summary.impressionChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.impressionChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">点击量</div><div class="adq-card-val">{{ fmtInt(summary.click) }}</div><div class="adq-card-change" :class="summary.clickChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.clickChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">转化数</div><div class="adq-card-val">{{ fmtInt(summary.conversion) }}</div><div class="adq-card-change" :class="summary.conversionChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.conversionChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">点击率</div><div class="adq-card-val">{{ summary.impression ? ((summary.click / summary.impression) * 100).toFixed(2) + '%' : '-' }}</div><div class="adq-card-change" :class="summary.ctrChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.ctrChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">目标转化率</div><div class="adq-card-val">{{ summary.click ? ((summary.conversion / summary.click) * 100).toFixed(2) + '%' : '-' }}</div><div class="adq-card-change" :class="summary.cvrChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.cvrChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">点击均价</div><div class="adq-card-val">{{ summary.click ? (summary.cost / 100 / summary.click).toFixed(2) : '-' }}</div><div class="adq-card-change" :class="summary.cpcChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.cpcChange) }}</div></div>
    <div class="adq-card"><div class="adq-card-label">ROI</div><div class="adq-card-val">{{ summary.cost ? (summary.orderAmount / summary.cost).toFixed(2) : '-' }}</div><div class="adq-card-change" :class="summary.roiChange >= 0 ? 'up' : 'down'">较上期 {{ fc(summary.roiChange) }}</div></div>
  </div>

  <!-- 账户列表 -->
  <div class="adq-section">
    <div class="adq-section-hd"><h3>账户列表</h3><span style="font-size:12px;color:#8c8c8c">按消耗排序 · 点击查看明细</span></div>
    <div class="adq-tbl-wrap">
    <table class="adq-tbl">
      <thead><tr>
        <th>账户ID</th><th>账户名称</th><th class="r">消耗</th><th class="r">曝光</th><th class="r">点击</th><th class="r">转化</th><th class="r">转化成本</th><th class="r">点击率</th><th class="r">转化率</th><th class="r">点击均价</th><th class="r">ROI</th>
      </tr></thead>
      <tbody>
        <tr v-for="a in sortedAccounts" :key="a.id" class="adq-row-click" @click="openDetail(a)">
          <td>{{ a.account_id }}</td><td>{{ a.account_name || '-' }}</td>
          <td class="r bold">{{ val(a,'cost') ? fmt(a.today.cost) : '-' }}</td>
          <td class="r">{{ val(a,'view_count') ? fmtInt(a.today.view_count) : '-' }}</td>
          <td class="r">{{ val(a,'valid_click_count') ? fmtInt(a.today.valid_click_count) : '-' }}</td>
          <td class="r">{{ val(a,'conversions_count') ? fmtInt(a.today.conversions_count) : '-' }}</td>
          <td class="r">{{ val(a,'conversions_cost') ? fmt(a.today.conversions_cost) : '-' }}</td>
          <td class="r">{{ val(a,'ctr') ? (a.today.ctr*100).toFixed(2)+'%' : '-' }}</td>
          <td class="r">{{ rowCvr(a.today) }}</td><td class="r">{{ rowCpc(a.today) }}</td>
          <td class="r bold">{{ val(a,'order_roi') ? a.today.order_roi.toFixed(2) : '-' }}</td>
        </tr>
        <tr v-if="!sortedAccounts.length && !loading"><td colspan="11" style="text-align:center;color:#999;padding:32px">暂无账户，请前往设置添加</td></tr>
      </tbody>
    </table>
    </div>
  </div>

  <!-- ========== 抽屉（含 tab） ========== -->
  <div v-if="drawerVisible" class="drawer-mask" @click.self="drawerVisible=false">
    <div class="drawer-panel" :class="isMobile ? 'from-bottom' : 'from-right'">
      <div class="drawer-hd">
        <div>
          <div class="drawer-title">{{ drawerAcct.account_name || drawerAcct.account_id }}</div>
          <div class="drawer-sub">ID: {{ drawerAcct.account_id }}</div>
        </div>
        <button class="drawer-close" @click="drawerVisible=false">&times;</button>
      </div>
      <!-- 抽屉内 tab -->
      <div class="dtab-bar">
        <div class="dtab" :class="{ active: drawerTab === 'detail' }" @click="drawerTab='detail'">广告组明细</div>
        <div class="dtab" :class="{ active: drawerTab === 'pitcher' }" @click="drawerTab='pitcher'">AI金牌投手</div>
        <div class="dtab" :class="{ active: drawerTab === 'cleanup' }" @click="switchToCleanup">素材清理</div>
        <div class="dtab" :class="{ active: drawerTab === 'autodeliver' }" @click="switchToAutoDeliver">🤖AI自动投放</div>
      </div>

      <div v-if="detailLoading && drawerTab === 'detail'" style="text-align:center;padding:40px;color:#8c8c8c">加载中...</div>

      <!-- ===== Tab: 广告组明细 ===== -->
      <div v-if="drawerTab === 'detail' && !detailLoading" class="drawer-body">
        <div class="drawer-summary">
          <div class="ds-item"><span>消耗</span><b>{{ fmt(drawerAcct.today?.cost) }}</b></div>
          <div class="ds-item"><span>ROI</span><b>{{ drawerAcct.today?.order_roi?.toFixed(2) || '-' }}</b></div>
          <div class="ds-item"><span>转化</span><b>{{ fmtInt(drawerAcct.today?.conversions_count) }}</b></div>
          <div class="ds-item"><span>转化成本</span><b>{{ fmt(drawerAcct.today?.conversions_cost) }}</b></div>
        </div>
        <div class="drawer-section-title">广告组明细 ({{ detailList.length }})</div>
        <div class="detail-list">
          <div class="detail-item" v-for="d in detailList" :key="d.adgroup_id">
            <div class="di-hd">
              <span class="di-name">{{ d.adgroup_name || d.adgroup_id }}</span>
              <div class="di-hd-right">
                <span class="di-roi-tag" :class="d.order_roi >= 1 ? 'good' : 'low'">ROI {{ d.order_roi ? d.order_roi.toFixed(2) : '-' }}</span>
                <span class="di-cost">{{ fmt(d.cost) }}</span>
              </div>
            </div>
            <div class="di-metrics">
              <span>曝光 {{ fmtInt(d.view_count) }}</span><span>点击率 {{ d.ctr ? (d.ctr*100).toFixed(2)+'%' : '-' }}</span>
              <span>转化 {{ d.conversions_count || 0 }}</span>
              <span v-if="editingBidId !== d.adgroup_id" class="di-bid di-bid-click" @click.stop="startEditBid(d)">
                出价 {{ d.bid_amount ? (d.bid_amount/100).toFixed(2) : '-' }} ✎
              </span>
              <span v-else class="di-bid-edit" @click.stop>
                出价 <input type="number" v-model.number="bidEditVal" step="0.01" min="0.01" class="bid-input" @keyup.enter="saveBid(d)" @keyup.escape="editingBidId=null" /> 元
                <button class="bid-ok" @click="saveBid(d)" :disabled="bidSaving">✓</button>
                <button class="bid-no" @click="editingBidId=null">✗</button>
              </span>
              <span>CPC {{ d.cpc ? (d.cpc/100).toFixed(2) : '-' }}</span>
              <span class="di-mat-toggle" @click.stop="toggleMaterials(d)">{{ d._showMat ? '收起素材 ▲' : '查看素材 ▼' }}</span>
            </div>
            <div v-if="d._showMat" class="di-materials">
              <div v-if="d._matLoading" class="di-mat-loading">加载素材中...</div>
              <template v-else-if="d._matList && d._matList.length">
                <div class="di-mat-item" v-for="m in d._matList" :key="m.dynamic_creative_id">
                  <div class="di-mat-hd">
                    <div class="di-mat-name">{{ m.creative_name || ('创意'+m.dynamic_creative_id) }}</div>
                    <button class="di-mat-del" @click.stop="deleteMaterial(d, m)">删除</button>
                  </div>
                  <div class="di-mat-tags">
                    <span class="di-roi-tag" :class="parseFloat(m.order_roi||0)>=1?'good':'low'">ROI {{ m.order_roi ? parseFloat(m.order_roi).toFixed(2) : '-' }}</span>
                    <span>消耗 {{ ((parseFloat(m.cost)||0)/100).toFixed(2) }}</span>
                    <span>转化 {{ m.conversions_count||0 }}</span>
                    <span>转化成本 {{ m.conversions_cost ? (parseFloat(m.conversions_cost)/100).toFixed(2) : '-' }}</span>
                    <span>曝光 {{ fmtInt(m.view_count) }}</span>
                    <span>点击 {{ fmtInt(m.valid_click_count) }}</span>
                  </div>
                </div>
              </template>
              <div v-else class="di-mat-empty">暂无素材数据</div>
            </div>
          </div>
          <div v-if="!detailList.length" style="text-align:center;padding:24px;color:#999">暂无广告组数据</div>
        </div>
      </div>

      <!-- ===== Tab: AI金牌投手 ===== -->
      <div v-if="drawerTab === 'pitcher'" class="drawer-body">

        <!-- Step 1: 条件筛选 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">Step1 筛选优秀素材</span>
            <button class="p-btn accent" @click="randomConditions">随机条件</button>
          </div>
          <div class="p-chips">
            <div v-for="c in condPool" :key="c.key" class="p-chip" :class="{ used: isCondActive(c.key) }"
              draggable="true" @dragstart="onDragStart($event, c.key)" @click="toggleCondition(c.key)">
              {{ c.icon }} {{ c.label }}
            </div>
          </div>
          <div class="p-drop-zone" @dragover.prevent="dragOverZone=true" @dragleave="dragOverZone=false" @drop="onDrop" :class="{ over: dragOverZone }">
            <div v-if="!activeConds.length" class="p-drop-hint">拖拽或点击条件添加</div>
            <div v-for="(ac, idx) in activeConds" :key="ac.key" class="p-cond">
              <span class="p-cond-name">{{ ac.icon }} {{ ac.label }}</span>
              <select v-if="ac.op!=='top'" v-model="ac.op" class="p-sel-sm"><option value=">=">>=</option><option value="<="><=</option></select>
              <span v-else class="p-unit">取前</span>
              <input type="number" v-model.number="ac.value" :step="ac.step" class="p-input-sm" />
              <span v-if="ac.unit" class="p-unit">{{ ac.unit }}</span>
              <button class="p-x" @click="activeConds.splice(idx,1)">×</button>
            </div>
          </div>
          <div class="p-cfg" style="margin-top:8px">
            <label>回溯<input type="number" v-model.number="pConfig.lookback_days" min="1" max="30"/>天</label>
          </div>
          <button class="p-btn primary" @click="smartScan" :disabled="scanning || !activeConds.length" style="width:100%;margin-top:10px">
            {{ scanning ? '扫描中...' : '扫描素材' }}
          </button>
        </div>

        <!-- Step 2: 素材池 -->
        <div class="p-block" v-if="scanResults.length || scanDone">
          <div class="p-block-hd">
            <span class="p-block-title">Step2 素材池 <b class="p-count">{{ scanResults.length }}</b></span>
            <span style="font-size:11px;color:#8c8c8c">
              共扫描 {{ scannedTotal }} 条
              <span v-if="statusSkipped>0" style="color:#fa8c16"> · 🛡️过滤{{ statusSkipped }}条(审核中/已下架)</span>
              <span v-if="deniedSkipped>0" style="color:#f5222d"> · 黑名单{{ deniedSkipped }}条</span>
            </span>
          </div>
          <div class="p-material-pool">
            <div v-for="(m, mi) in scanResults" :key="m.material_id || mi" class="p-mat"
              :class="{ selected: m._selected }" @click="m._selected = !m._selected">
              <div class="p-mat-idx">{{ mi + 1 }}</div>
              <img v-if="m.thumb_url" :src="m.thumb_url" class="p-mat-thumb" />
              <div v-else class="p-mat-thumb-placeholder">{{ m.material_type === 'video' ? '🎬' : '🖼' }}</div>
              <div class="p-mat-info">
                <div class="p-mat-name">{{ m.material_name || ('素材 ' + m.material_id) }}</div>
                <div class="p-mat-sub">{{ m.account_name }}</div>
                <div class="p-mat-tags">
                  <span class="di-roi-tag" :class="parseFloat(m.order_roi||0)>=1?'good':'low'">ROI {{ parseFloat(m.order_roi||0).toFixed(2) }}</span>
                  <span class="p-mat-tag">消耗{{ (parseFloat(m.cost||0)/100).toFixed(0) }}</span>
                  <span class="p-mat-tag">转化{{ m.conversions_count||0 }}</span>
                  <span class="p-mat-tag">曝光{{ parseInt(m.view_count||0).toLocaleString() }}</span>
                  <span class="p-mat-tag" v-if="m.cpc">CPC{{ (parseFloat(m.cpc||0)/100).toFixed(2) }}</span>
                  <span class="p-mat-tag" style="background:#f6ffed;color:#389e0d;border-color:#b7eb8f" v-if="m.system_status==='MEDIA_STATUS_VALID'">✓审核通过</span>
                </div>
              </div>
              <div class="p-mat-check">{{ m._selected ? '✓' : '' }}</div>
            </div>
            <div v-if="!scanResults.length && scanDone" style="text-align:center;color:#999;padding:16px;font-size:13px">未找到符合条件的素材</div>
          </div>
          <div v-if="scanResults.length" style="display:flex;gap:8px;margin-top:8px">
            <button class="p-btn" @click="selectAll(true)" style="flex:1">全选</button>
            <button class="p-btn" @click="selectAll(false)" style="flex:1">取消</button>
          </div>
        </div>

        <!-- Step 3: 组合计划 -->
        <div class="p-block" v-if="selectedMaterials.length >= 1">
          <div class="p-block-hd">
            <span class="p-block-title">Step3 组合计划</span>
            <button class="p-btn accent" @click="generateCombos">随机组合</button>
          </div>
          <div class="p-cfg">
            <label>每条计划<input type="number" v-model.number="pConfig.per_plan" min="1" max="10"/>个素材</label>
            <label>生成<input type="number" v-model.number="pConfig.plan_count" min="1" max="20"/>条计划</label>
          </div>
          <!-- 组合预览 -->
          <div v-if="comboPlan.length" class="p-combo-list">
            <div v-for="(plan, pi) in comboPlan" :key="pi" class="p-combo-card">
              <div class="p-combo-hd">{{ planName(pi) }}<button class="p-x" @click="comboPlan.splice(pi,1)" style="margin-left:auto">×</button></div>
              <div class="p-combo-mats">
                <span v-for="m in plan" :key="m.material_id" class="p-combo-tag">
                  {{ m.material_type === 'video' ? '🎬' : '🖼' }} {{ m.material_name || ('素材' + m.material_id) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 4: 选择目标广告组 -->
        <div class="p-block" v-if="comboPlan.length">
          <div class="p-block-hd">
            <span class="p-block-title">Step4 选择目标广告组</span>
            <span style="font-size:11px;color:#8c8c8c">已选 {{ selectedAdgroupIds.length }}/{{ filteredAdgroups.length }}</span>
          </div>
          <div class="p-ag-toolbar">
            <input v-model="adgroupKeyword" placeholder="搜索广告组名/ID" class="p-input-sm" style="flex:1;min-width:0" />
            <select v-model.number="adgroupLookbackDays" @change="reloadAdgroups" class="p-sel-sm">
              <option :value="1">今日</option>
              <option :value="3">近3天</option>
              <option :value="7">近7天</option>
              <option :value="15">近15天</option>
            </select>
            <label class="p-ag-switch"><input type="checkbox" v-model="adgroupFilterActiveOnly" />仅运行中</label>
            <button class="p-btn" @click="toggleAllAdgroups">全选</button>
            <button class="p-btn" @click="selectedAdgroupIds=[]">清空</button>
          </div>
          <div class="p-ag-pool">
            <div v-if="adgroupsLoading" class="p-ag-empty">加载中...</div>
            <div v-else-if="!filteredAdgroups.length" class="p-ag-empty">暂无广告组</div>
            <div v-else v-for="ag in filteredAdgroups" :key="ag.adgroup_id"
              class="p-ag-item" :class="{ selected: selectedAdgroupIds.includes(ag.adgroup_id) }"
              @click="toggleAdgroup(ag.adgroup_id)">
              <span class="p-ag-chk">{{ selectedAdgroupIds.includes(ag.adgroup_id) ? '✓' : '' }}</span>
              <div class="p-ag-info">
                <div class="p-ag-row1">
                  <span class="p-ag-name">{{ ag.adgroup_name }}</span>
                  <span class="p-ag-status" :class="ag.configured_status === 'AD_STATUS_NORMAL' ? 'ok' : 'off'">
                    {{ ag.configured_status === 'AD_STATUS_NORMAL' ? '运行' : '暂停' }}
                  </span>
                </div>
                <div class="p-ag-sub">ID {{ ag.adgroup_id }} · 预算{{ ((ag.daily_budget||0)/100).toFixed(0) }}元</div>
                <div class="p-ag-stats" v-if="ag.stats">
                  <span class="p-ag-tag" :class="ag.stats.roi >= 1 ? 'good' : (ag.stats.cost > 0 ? 'low' : '')">
                    ROI {{ ag.stats.roi.toFixed(2) }}
                  </span>
                  <span class="p-ag-tag">消耗{{ (ag.stats.cost/100).toFixed(0) }}</span>
                  <span class="p-ag-tag">转化{{ ag.stats.conversions_count }}</span>
                  <span class="p-ag-tag" v-if="ag.stats.cpc">CPC{{ (ag.stats.cpc/100).toFixed(2) }}</span>
                  <span class="p-ag-tag" v-if="ag.stats.cvr">CVR{{ ag.stats.cvr.toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
          <button class="p-btn warn" @click="smartBuild" :disabled="building || !selectedAdgroupIds.length" style="width:100%;margin-top:10px;padding:10px 0;font-size:14px">
            {{ building ? '添加中...' : (selectedAdgroupIds.length ? `为 ${selectedAdgroupIds.length} 个广告组添加 ${comboPlan.length} 条创意` : '请选择目标广告组') }}
          </button>
          <div v-if="buildMsg" class="p-msg" :class="buildMsg.type" style="margin-top:8px">{{ buildMsg.text }}</div>
        </div>
      </div>

      <!-- ===== Tab: 素材清理 ===== -->
      <div v-if="drawerTab === 'cleanup'" class="drawer-body">
        <!-- Step1: 筛选条件 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">Step1 设置清理条件</span>
          </div>
          <div class="cl-cfg">
            <div class="cl-row">
              <label>消耗≥</label>
              <input type="number" v-model.number="cleanupCfg.min_cost" class="p-input-sm" style="width:80px" /> 元
              <label style="margin-left:16px">ROI≤</label>
              <input type="number" v-model.number="cleanupCfg.max_roi" step="0.1" class="p-input-sm" style="width:80px" />
            </div>
            <div class="cl-row">
              <label>回溯</label>
              <input type="number" v-model.number="cleanupCfg.lookback_days" min="1" max="30" class="p-input-sm" style="width:70px" /> 天
              <label style="margin-left:16px">范围</label>
              <select v-model="cleanupCfg.scope" class="p-sel-sm">
                <option value="all">全部账户</option>
                <option value="current">当前账户</option>
              </select>
            </div>
            <div class="cl-tip">💡 按视频素材维度清理：近{{ cleanupCfg.lookback_days }}天内该素材累计消耗≥{{ cleanupCfg.min_cost }}元 且 ROI≤{{ cleanupCfg.max_roi }}，将删除其在所有广告组的创意引用</div>
          </div>
          <button class="p-btn primary" @click="cleanupPreview" :disabled="cleanupLoading" style="width:100%;margin-top:10px">
            {{ cleanupLoading ? '预览中...' : '🔍 预览待清理素材' }}
          </button>
        </div>

        <!-- Step2: 待清理列表 -->
        <div class="p-block" v-if="cleanupPreviewDone">
          <div class="p-block-hd">
            <span class="p-block-title">Step2 待清理列表 <b class="p-count">{{ cleanupPreviewList.length }}</b></span>
            <button v-if="cleanupPreviewList.length" class="p-btn danger" @click="doCleanup" :disabled="cleanupExecuting">
              {{ cleanupExecuting ? '清理中...' : '🗑️ 一键清理' }}
            </button>
          </div>
          <div v-if="!cleanupPreviewList.length" style="text-align:center;color:#8c8c8c;padding:20px">✅ 当前无符合条件的素材需要清理</div>
          <div v-else class="cl-list">
            <div v-for="(item, idx) in cleanupPreviewList" :key="item.account_id+'_'+item.video_id" class="cl-item">
              <div class="cl-idx">{{ idx+1 }}</div>
              <img v-if="item.thumb_url" :src="item.thumb_url" class="cl-thumb" />
              <div v-else class="cl-thumb-ph">🎬</div>
              <div class="cl-info">
                <div class="cl-name">{{ item.video_name || ('素材 '+item.video_id) }}</div>
                <div class="cl-sub">{{ item.account_name }} · 将删除 {{ item.affected_count }} 个引用创意</div>
                <div class="cl-tags">
                  <span class="cl-tag cost">消耗 {{ item.cost }}</span>
                  <span class="cl-tag" :class="parseFloat(item.roi)>=1?'roi-good':'roi-bad'">ROI {{ item.roi }}</span>
                  <span class="cl-tag">转化 {{ item.conversions_count }}</span>
                  <span class="cl-tag">成交 {{ item.order_amount }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="cleanupExecMsg" class="p-msg" :class="cleanupExecMsg.type" style="margin-top:8px">{{ cleanupExecMsg.text }}</div>
        </div>

        <!-- Step3: 定时规则 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">⏰ 定时自动清理规则</span>
            <button class="p-btn accent" @click="addCleanupRule">+ 新建规则</button>
          </div>
          <div v-if="!cleanupRules.length" style="text-align:center;color:#8c8c8c;padding:16px">暂无规则，点击"新建规则"添加</div>
          <div v-for="r in cleanupRules" :key="r.id" class="cl-rule">
            <div class="cl-rule-hd">
              <input v-model="r.name" class="p-input-sm" style="flex:1" />
              <label class="cl-sw"><input type="checkbox" v-model="r._enabled"/>启用</label>
              <button class="p-btn warn" @click="saveCleanupRule(r)">保存</button>
              <button class="p-btn" @click="deleteCleanupRule(r)">删除</button>
            </div>
            <div class="cl-rule-body">
              <label>消耗≥<input type="number" v-model.number="r.min_cost" class="p-input-sm" style="width:60px" />元</label>
              <label>ROI≤<input type="number" v-model.number="r.max_roi" step="0.1" class="p-input-sm" style="width:60px" /></label>
              <label>回溯<input type="number" v-model.number="r.lookback_days" class="p-input-sm" style="width:50px" />天</label>
              <label>每日<input type="time" v-model="r.schedule_time" class="p-input-sm" style="width:100px" /></label>
            </div>
          </div>
        </div>

        <!-- Step4: 执行记录 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">📋 最近执行记录</span>
            <button class="p-btn accent" @click="loadCleanupLogs">刷新</button>
          </div>
          <div v-if="!cleanupLogs.length" style="text-align:center;color:#8c8c8c;padding:16px">暂无执行记录</div>
          <div v-else class="cl-logs">
            <div v-for="l in cleanupLogs" :key="l.id" class="cl-log-item">
              <span class="cl-log-type" :class="l.exec_type">{{ l.exec_type === 'auto' ? '⏰自动' : '👆手动' }}</span>
              <span class="cl-log-name">{{ l.rule_name || '临时' }}</span>
              <span class="cl-log-res">成功{{ l.cleaned_count }}/失败{{ l.failed_count }}</span>
              <span class="cl-log-time">{{ l.executed_at }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== AI 自动投放 Tab ========== -->
      <div v-if="drawerTab === 'autodeliver'" class="drawer-body">
        <!-- Step1: 核心参数 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">🤖 Step1 AI 投放参数</span>
            <span class="p-tip">超越人工专家：多因子评分 + 智能目标筛选 + 三轴限流</span>
          </div>
          <div class="ad-grid">
            <div class="ad-sec">
              <div class="ad-sec-title">① 优质素材条件</div>
              <label>消耗≥<input type="number" v-model.number="adCfg.min_cost" class="p-input-sm" style="width:70px" />元</label>
              <label>ROI≥<input type="number" v-model.number="adCfg.min_roi" step="0.1" class="p-input-sm" style="width:60px" /></label>
              <label>转化≥<input type="number" v-model.number="adCfg.min_conversions" class="p-input-sm" style="width:55px" />条</label>
              <label>回溯<input type="number" v-model.number="adCfg.lookback_days" min="1" max="30" class="p-input-sm" style="width:55px" />天</label>
            </div>
            <div class="ad-sec">
              <div class="ad-sec-title">② 目标广告组筛选</div>
              <label>模式
                <select v-model="adCfg.target_mode" class="p-sel-sm">
                  <option value="smart">智能(组ROI&消耗过滤)</option>
                  <option value="all_active">所有投放中</option>
                </select>
              </label>
              <label v-if="adCfg.target_mode==='smart'">组ROI≥<input type="number" v-model.number="adCfg.target_min_adgroup_roi" step="0.1" class="p-input-sm" style="width:55px" /></label>
              <label v-if="adCfg.target_mode==='smart'">组消耗≥<input type="number" v-model.number="adCfg.target_min_adgroup_cost" class="p-input-sm" style="width:60px" />元</label>
              <label>单组创意≤<input type="number" v-model.number="adCfg.target_max_creatives" class="p-input-sm" style="width:50px" />条</label>
            </div>
            <div class="ad-sec">
              <div class="ad-sec-title">③ 限流防疲劳</div>
              <label>单次总上限<input type="number" v-model.number="adCfg.max_adds_per_run" class="p-input-sm" style="width:55px" />条</label>
              <label>每组最多<input type="number" v-model.number="adCfg.max_per_adgroup" class="p-input-sm" style="width:45px" />条</label>
              <label>每素材最多投<input type="number" v-model.number="adCfg.max_per_video" class="p-input-sm" style="width:45px" />组</label>
              <label><input type="checkbox" v-model="adCfg.cross_account" />跨账户投放</label>
            </div>
          </div>
          <div class="cl-tip">
            💡 AI 会扫描所有账户近{{ adCfg.lookback_days }}天消耗≥{{ adCfg.min_cost }}元 且 ROI≥{{ adCfg.min_roi }} 的优质素材，按 <b>4因子综合分</b>(ROI/规模/转化/CTR) 排序，
            匹配到{{ adCfg.target_mode==='smart' ? '组ROI≥'+adCfg.target_min_adgroup_roi+'、消耗≥'+adCfg.target_min_adgroup_cost+'元、创意数未满的优质广告组' : '所有投放中广告组' }}，
            单次最多新增 {{ adCfg.max_adds_per_run }} 条创意。
          </div>
          <button class="p-btn primary" @click="adPreview" :disabled="adLoading" style="width:100%;margin-top:10px">
            {{ adLoading ? '扫描中(全账户约30-90秒)...' : '🔍 预览投放计划(试运行)' }}
          </button>
        </div>

        <!-- Step2: 预览结果 -->
        <div class="p-block" v-if="adPreviewDone">
          <div class="p-block-hd">
            <span class="p-block-title">Step2 投放计划
              <b class="p-count">{{ adPreviewData?.details?.length || 0 }} 条</b>
            </span>
            <button v-if="adPreviewData?.details?.length" class="p-btn warn" @click="adExecute" :disabled="adExecuting">
              {{ adExecuting ? '投放中...' : '🚀 一键执行投放' }}
            </button>
          </div>
          <div v-if="adPreviewData" class="ad-stats">
            <span>扫到优质素材 <b>{{ adPreviewData.good_material_count }}</b> 条</span>
            <span>候选广告组 <b>{{ adPreviewData.target_adgroup_count }}</b> 个</span>
            <span>将新增 <b>{{ adPreviewData.details?.length || 0 }}</b> 条创意</span>
          </div>
          <div v-if="!adPreviewData?.details?.length" style="text-align:center;color:#8c8c8c;padding:20px">
            没有符合条件的投放计划（可能是没有优质素材 或 没有合格目标组 或 所有组都已投过）
          </div>
          <div v-else class="ad-list">
            <div v-for="(p, idx) in adPreviewData.details" :key="idx" class="ad-item">
              <span class="ad-score">{{ p.video_score?.toFixed(0) }}分</span>
              <div class="ad-main">
                <div class="ad-line1">
                  <b>{{ p.video_name || '素材'+p.video_id }}</b>
                  <span class="ad-arrow">→</span>
                  <span>{{ p.target_adgroup_name || '组'+p.target_adgroup_id }}</span>
                </div>
                <div class="ad-line2">{{ p.reason }}</div>
              </div>
            </div>
          </div>
          <div v-if="adExecMsg" class="p-msg" :class="adExecMsg.type" style="margin-top:8px">{{ adExecMsg.text }}</div>
        </div>

        <!-- Step3: 定时规则 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">⏰ 定时自动投放规则</span>
            <button class="p-btn accent" @click="addAdRule">+ 新建规则</button>
          </div>
          <div v-if="!adRules.length" style="text-align:center;color:#8c8c8c;padding:16px">暂无规则，点击"新建规则"添加</div>
          <div v-for="r in adRules" :key="r.id" class="cl-rule">
            <div class="cl-rule-hd">
              <input v-model="r.name" class="p-input-sm" style="flex:1" placeholder="规则名称" />
              <label class="cl-sw"><input type="checkbox" v-model="r._enabled"/>启用</label>
              <label class="cl-sw"><input type="checkbox" v-model="r._dry_run"/>试运行</label>
              <button class="p-btn" @click="runAdRule(r)">立即执行</button>
              <button class="p-btn warn" @click="saveAdRule(r)">保存</button>
              <button class="p-btn" @click="deleteAdRule(r)">删除</button>
            </div>
            <div class="cl-rule-body">
              <label>素材消耗≥<input type="number" v-model.number="r.min_cost" class="p-input-sm" style="width:60px" />元</label>
              <label>ROI≥<input type="number" v-model.number="r.min_roi" step="0.1" class="p-input-sm" style="width:55px" /></label>
              <label>转化≥<input type="number" v-model.number="r.min_conversions" class="p-input-sm" style="width:50px" /></label>
              <label>回溯<input type="number" v-model.number="r.lookback_days" class="p-input-sm" style="width:45px" />天</label>
              <label>组ROI≥<input type="number" v-model.number="r.target_min_adgroup_roi" step="0.1" class="p-input-sm" style="width:55px" /></label>
              <label>单次≤<input type="number" v-model.number="r.max_adds_per_run" class="p-input-sm" style="width:50px" /></label>
              <label>每组≤<input type="number" v-model.number="r.max_per_adgroup" class="p-input-sm" style="width:40px" /></label>
              <label>每素材投≤<input type="number" v-model.number="r.max_per_video" class="p-input-sm" style="width:40px" /></label>
              <label><input type="checkbox" v-model="r._cross_account" />跨账户</label>
              <label>每日<input type="time" v-model="r.schedule_time" class="p-input-sm" style="width:100px" /></label>
            </div>
          </div>
        </div>

        <!-- Step4: 执行记录 -->
        <div class="p-block">
          <div class="p-block-hd">
            <span class="p-block-title">📋 最近执行记录</span>
            <button class="p-btn accent" @click="loadAdLogs">刷新</button>
          </div>
          <div v-if="!adLogs.length" style="text-align:center;color:#8c8c8c;padding:16px">暂无执行记录</div>
          <div v-else class="cl-logs">
            <div v-for="l in adLogs" :key="l.id" class="cl-log-item">
              <span class="cl-log-type" :class="l.exec_type">
                {{ l.exec_type === 'scheduled' ? '⏰定时' : (l.exec_type === 'preview' ? '🔍预览' : '👆手动') }}
              </span>
              <span class="cl-log-name">{{ l.rule_name || '临时' }}</span>
              <span class="cl-log-res">素材{{ l.good_material_count }}/组{{ l.target_adgroup_count }}/新增{{ l.added_count }}/跳过{{ l.skipped_count }}/失败{{ l.failed_count }}</span>
              <span class="cl-log-time">{{ l.executed_at }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { message } from 'ant-design-vue'
import request from '../utils/request'

const isMobile = ref(window.innerWidth < 768)
const onResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// 路由变化时强制关闭抽屉，防止 mask 残留遮挡左侧菜单导致点击无响应
const route = useRoute()
watch(() => route.path, () => { try { drawerVisible.value = false } catch(e){} })

function fmt(v) { const n = parseFloat(v||0)/100; return n >= 10000 ? (n/10000).toFixed(2)+'万' : n.toFixed(2) }
function fmtInt(v) { const n = parseInt(v||0); return n >= 10000 ? (n/10000).toFixed(1)+'万' : n.toLocaleString() }
function fc(v) { return (v>=0?'+':'')+v.toFixed(1)+'%' }
function cc(t,y) { const a=parseFloat(t||0),b=parseFloat(y||0); if(b===0) return a>0?100:0; return ((a-b)/b)*100 }
function val(a,k) { return a.today && a.today[k] }
function rowCvr(d) { if(!d||!d.valid_click_count) return '-'; return ((d.conversions_count||0)/d.valid_click_count*100).toFixed(2)+'%' }
function rowCpc(d) { if(!d||!d.valid_click_count||!d.cost) return '-'; return (d.cost/100/d.valid_click_count).toFixed(2) }

// ============ 实名认证 ============
const utStatus = ref('unknown')
const utDaysLeft = ref(0)
async function checkUserToken() {
  try {
    const r = await request.get('/adq-dash/user-token-status')
    if (r?.valid) {
      utStatus.value = 'valid'
      if (r.expires) {
        const left = Math.ceil((new Date(r.expires).getTime() - Date.now()) / 86400000)
        utDaysLeft.value = Math.max(0, left)
      }
    } else { utStatus.value = 'none' }
  } catch(e) { utStatus.value = 'none' }
}
async function goUserTokenAuth() {
  try {
    const r = await request.get('/adq-dash/user-token-auth-url')
    if (r?.url) window.open(r.url, '_blank')
  } catch(e) { message.error('获取认证链接失败') }
}

// ============ 日期筛选 ============
const dateRange = ref([dayjs(), dayjs()])
const datePresets = [
  { label: '今天', value: [dayjs(), dayjs()] },
  { label: '昨天', value: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
  { label: '近3天', value: [dayjs().subtract(2, 'day'), dayjs()] },
  { label: '近7天', value: [dayjs().subtract(6, 'day'), dayjs()] },
  { label: '近15天', value: [dayjs().subtract(14, 'day'), dayjs()] },
  { label: '近30天', value: [dayjs().subtract(29, 'day'), dayjs()] },
  { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
  { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
]
const periodLabel = computed(() => {
  const s = dateRange.value[0], e = dateRange.value[1]
  if (s.isSame(dayjs(), 'day') && e.isSame(dayjs(), 'day')) return '今日'
  if (s.isSame(e, 'day') && s.isSame(dayjs().subtract(1,'day'), 'day')) return '昨日'
  return s.format('MM/DD') + '-' + e.format('MM/DD')
})
function onDateChange() { loadOverview() }

// ============ 概览 ============
const accounts = ref([])
const loading = ref(false)
const summary = reactive({ cost:undefined, impression:0, click:0, conversion:0, orderAmount:0, costChange:0, impressionChange:0, clickChange:0, conversionChange:0, ctrChange:0, cvrChange:0, cpcChange:0, roiChange:0 })
const sortedAccounts = computed(() => [...accounts.value].filter(a=>a.today&&parseFloat(a.today.cost||0)>0).sort((a,b)=>parseFloat(b.today?.cost||0)-parseFloat(a.today?.cost||0)))

async function loadOverview() {
  loading.value = true
  try {
    let res
    const s = dateRange.value[0].format('YYYY-MM-DD'), e = dateRange.value[1].format('YYYY-MM-DD')
    const isToday = dateRange.value[0].isSame(dayjs(), 'day') && dateRange.value[1].isSame(dayjs(), 'day')
    if (isToday) {
      res = await request.get('/adq-dash/overview?refresh=1')
    } else {
      res = await request.get('/adq-dash/date-overview', { params: { start_date: s, end_date: e } })
    }
    const list = Array.isArray(res?.data||res) ? (res?.data||res) : []
    accounts.value = list
    let tC=0,tI=0,tK=0,tV=0,tO=0,yC=0,yI=0,yK=0,yV=0,yO=0
    list.forEach(a => {
      if(a.today){tC+=parseFloat(a.today.cost||0);tI+=parseInt(a.today.view_count||0);tK+=parseInt(a.today.valid_click_count||0);tV+=parseInt(a.today.conversions_count||0);tO+=parseFloat(a.today.order_amount||0)}
      if(a.yesterday){yC+=parseFloat(a.yesterday.cost||0);yI+=parseInt(a.yesterday.view_count||0);yK+=parseInt(a.yesterday.valid_click_count||0);yV+=parseInt(a.yesterday.conversions_count||0);yO+=parseFloat(a.yesterday.order_amount||0)}
    })
    summary.cost=tC;summary.impression=tI;summary.click=tK;summary.conversion=tV;summary.orderAmount=tO
    summary.costChange=cc(tC,yC);summary.impressionChange=cc(tI,yI);summary.clickChange=cc(tK,yK);summary.conversionChange=cc(tV,yV)
    summary.ctrChange=cc(tI?tK/tI:0,yI?yK/yI:0);summary.cvrChange=cc(tK?tV/tK:0,yK?yV/yK:0)
    summary.cpcChange=cc(tK?tC/tK:0,yK?yC/yK:0);summary.roiChange=cc(tC?tO/tC:0,yC?yO/yC:0)
  } catch(e) {
    console.error(e)
    try { const r=await request.get('/adq/accounts');accounts.value=(r?.data||r||[]).map(a=>({...a,today:null,yesterday:null})) } catch(e2){}
  }
  loading.value = false
}
onMounted(() => { loadOverview(); checkUserToken() })

// ============ 抽屉 ============
const drawerVisible = ref(false)
const drawerAcct = ref({})
const drawerTab = ref('detail')
const detailList = ref([])
const detailLoading = ref(false)

async function openDetail(acct) {
  drawerAcct.value = acct
  drawerVisible.value = true
  drawerTab.value = 'detail'
  detailLoading.value = true
  detailList.value = []
  // 重置 pitcher 状态
  scanResults.value = []; scanDone.value = false; buildMsg.value = null
  adgroupList.value = []; selectedAdgroupIds.value = []
  loadAdgroups(acct.account_id)
  try {
    const res = await request.get('/adq-dash/account-detail', { params: { account_id: acct.account_id } })
    detailList.value = (res?.data||res||[]).filter(d => d.cost > 0)
  } catch(e) { console.error(e) }
  detailLoading.value = false
}

// ============ 出价编辑 / 删除 / 素材 ============
const editingBidId = ref(null)
const bidEditVal = ref(0)
const bidSaving = ref(false)

function startEditBid(d) {
  editingBidId.value = d.adgroup_id
  bidEditVal.value = d.bid_amount ? parseFloat((d.bid_amount / 100).toFixed(2)) : 0
}

async function saveBid(d) {
  if (bidSaving.value) return
  const newFen = Math.round(bidEditVal.value * 100)
  if (newFen <= 0) { editingBidId.value = null; return }
  if (newFen === d.bid_amount) { editingBidId.value = null; return }
  bidSaving.value = true
  try {
    const r = await request.post('/adq-dash/adgroup/update-bid', {
      account_id: drawerAcct.value.account_id,
      adgroup_id: d.adgroup_id,
      bid_amount: newFen,
    })
    if (r?.code === 0) { d.bid_amount = newFen; editingBidId.value = null; message.success('出价已更新') }
    else message.error('修改失败: ' + (r?.msg || ''))
  } catch(e) { message.error('修改出价失败: ' + (e.message || '')) }
  bidSaving.value = false
}

async function deleteMaterial(d, m) {
  if (!confirm(`确定删除素材「${m.creative_name || m.dynamic_creative_id}」？删除后无法恢复！`)) return
  try {
    const r = await request.post('/adq-dash/material/delete', {
      account_id: drawerAcct.value.account_id,
      dynamic_creative_id: m.dynamic_creative_id,
    })
    if (r?.code === 0) { d._matList = d._matList.filter(x => x.dynamic_creative_id !== m.dynamic_creative_id); message.success('已删除') }
    else message.error('删除失败: ' + (r?.msg || ''))
  } catch(e) { message.error('删除失败: ' + (e.message || '')) }
}

async function toggleMaterials(d) {
  if (d._showMat) { d._showMat = false; return }
  d._showMat = true; d._matLoading = true; d._matList = []
  try {
    const r = await request.get('/adq-dash/adgroup-materials', { params: { account_id: drawerAcct.value.account_id, adgroup_id: d.adgroup_id } })
    d._matList = r?.data || r || []
  } catch(e) { d._matList = [] }
  d._matLoading = false
}

function planName(pi) {
  const n = new Date()
  const t = String(n.getMonth()+1).padStart(2,'0') + String(n.getDate()).padStart(2,'0') + String(n.getHours()).padStart(2,'0') + String(n.getMinutes()).padStart(2,'0')
  return `${drawerAcct.value.account_id}-${t}-ai生成${pi+1}`
}

// ============ AI金牌投手（抽屉内） ============
const condPool = [
  { key:'roi', label:'ROI', icon:'📈', op:'>=', defaultVal:1.0, step:0.1, unit:'', range:[0.5,3.0] },
  { key:'cost', label:'消耗', icon:'💰', op:'>=', defaultVal:100, step:50, unit:'元', range:[50,5000] },
  { key:'cpc', label:'CPC', icon:'🖱', op:'<=', defaultVal:3, step:0.5, unit:'元', range:[0.5,8] },
  { key:'cvr', label:'转化率', icon:'🎯', op:'>=', defaultVal:3, step:0.5, unit:'%', range:[1,10] },
  { key:'impression', label:'曝光', icon:'👁', op:'>=', defaultVal:5000, step:1000, unit:'', range:[1000,80000] },
  { key:'latest', label:'最新素材', icon:'🆕', op:'top', defaultVal:30, step:10, unit:'条', range:[10,100] },
]
const activeConds = ref([])
const dragOverZone = ref(false)
const dragKey = ref(null)
const scanning = ref(false)
const scanDone = ref(false)
const scanResults = ref([])
const scannedTotal = ref(0)
const statusSkipped = ref(0)
const deniedSkipped = ref(0)
const building = ref(false)
const buildMsg = ref(null)
const comboPlan = ref([])
const pConfig = reactive({ lookback_days:3, daily_budget:300, bid_amount:50, per_plan:3, plan_count:5, marketing_goal:'MARKETING_GOAL_PRODUCT_SALES', optimization_goal:'OPTIMIZATIONGOAL_ECOMMERCE_ORDER' })

// 目标广告组
const adgroupList = ref([])
const adgroupsLoading = ref(false)
const selectedAdgroupIds = ref([])
const adgroupFilterActiveOnly = ref(true)
const adgroupKeyword = ref('')
const adgroupLookbackDays = ref(1)
const filteredAdgroups = computed(() => {
  let arr = adgroupList.value
  if (adgroupFilterActiveOnly.value) arr = arr.filter(a => a.configured_status === 'AD_STATUS_NORMAL')
  const kw = adgroupKeyword.value.trim().toLowerCase()
  if (kw) arr = arr.filter(a => String(a.adgroup_name || '').toLowerCase().includes(kw) || String(a.adgroup_id).includes(kw))
  return arr
})
async function loadAdgroups(accountId) {
  adgroupsLoading.value = true
  adgroupList.value = []; selectedAdgroupIds.value = []
  try {
    const r = await request.get('/adq-pitcher/adgroups', { params: { account_id: accountId, lookback_days: adgroupLookbackDays.value } })
    adgroupList.value = (r?.data || r || [])
  } catch(e) { console.error(e) }
  adgroupsLoading.value = false
}
function reloadAdgroups() {
  if (drawerAcct.value?.account_id) loadAdgroups(drawerAcct.value.account_id)
}
function toggleAdgroup(id) {
  const i = selectedAdgroupIds.value.indexOf(id)
  if (i >= 0) selectedAdgroupIds.value.splice(i, 1)
  else selectedAdgroupIds.value.push(id)
}
function toggleAllAdgroups() {
  const ids = filteredAdgroups.value.map(a => a.adgroup_id)
  const allSelected = ids.every(id => selectedAdgroupIds.value.includes(id))
  if (allSelected) selectedAdgroupIds.value = selectedAdgroupIds.value.filter(id => !ids.includes(id))
  else ids.forEach(id => { if (!selectedAdgroupIds.value.includes(id)) selectedAdgroupIds.value.push(id) })
}

const selectedMaterials = computed(() => scanResults.value.filter(m=>m._selected))

function isCondActive(k) { return activeConds.value.some(c=>c.key===k) }
function toggleCondition(k) { const i=activeConds.value.findIndex(c=>c.key===k); if(i>=0) activeConds.value.splice(i,1); else addCond(k) }
function addCond(k) { if(isCondActive(k)) return; const p=condPool.find(c=>c.key===k); if(!p) return; activeConds.value.push({key:p.key,label:p.label,icon:p.icon,op:p.op,value:p.defaultVal,step:p.step,unit:p.unit,range:p.range}) }
function onDragStart(e,k) { dragKey.value=k; e.dataTransfer.effectAllowed='copy' }
function onDrop() { dragOverZone.value=false; if(dragKey.value){addCond(dragKey.value);dragKey.value=null} }
function selectAll(v) { scanResults.value.forEach(m=>m._selected=v) }

function randomConditions() {
  activeConds.value = []
  const keys = condPool.map(c=>c.key)
  for(let i=keys.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]]}
  keys.slice(0, 2+Math.floor(Math.random()*3)).forEach(k => {
    const p=condPool.find(c=>c.key===k); if(!p) return
    const[lo,hi]=p.range; const steps=Math.round((hi-lo)/p.step)
    const v=parseFloat((lo+Math.floor(Math.random()*steps)*p.step).toFixed(4))
    activeConds.value.push({key:p.key,label:p.label,icon:p.icon,op:p.op,value:v,step:p.step,unit:p.unit,range:p.range})
  })
}

// 随机组合素材成计划
function generateCombos() {
  const pool = selectedMaterials.value
  if(!pool.length) return
  const perPlan = Math.min(pConfig.per_plan, pool.length)
  const planCount = pConfig.plan_count
  const plans = []
  for(let i=0; i<planCount; i++) {
    // 随机打乱后取前N个（只有1个素材时，每条计划都是这1个）
    const shuffled = [...pool].sort(()=>Math.random()-0.5)
    plans.push(shuffled.slice(0, perPlan))
  }
  comboPlan.value = plans
}

async function smartScan() {
  scanning.value=true; scanDone.value=false; scanResults.value=[]; buildMsg.value=null; comboPlan.value=[]
  try {
    const conditions = activeConds.value.map(c=>({key:c.key,op:c.op,value:c.value}))
    // 跨账户扫描发现优质素材；smart-build 时会按 media_id 在目标账户 videos/get 校验是否可用
    const res = await request.post('/adq-pitcher/smart-scan', { conditions, lookback_days:pConfig.lookback_days })
    const list = (res?.data||res||[]).map(r=>({...r, _selected:true}))
    scanResults.value = list
    scannedTotal.value = res?.total_scanned||0
    statusSkipped.value = res?.status_skipped||0
    deniedSkipped.value = res?.denied_skipped||0
  } catch(e){ console.error(e) }
  scanning.value=false; scanDone.value=true
}

async function smartBuild() {
  if(!comboPlan.value.length) return
  if(!selectedAdgroupIds.value.length) { buildMsg.value = { type:'error', text:'请先选择目标广告组' }; return }
  building.value=true; buildMsg.value=null
  try {
    const res = await request.post('/adq-pitcher/smart-build', {
      combo_plans: comboPlan.value.map(plan => plan.map(m=>({
        material_id: m.material_id,
        signature: m.signature,          // 视频哈希：跨账户唯一标识
        account_id: m.account_id,        // 原素材所属账户
        material_type: m.material_type,
        material_name: m.material_name,
      }))),
      account_id: drawerAcct.value.account_id,
      target_adgroup_ids: selectedAdgroupIds.value,
    }, { timeout: 600000 })
    const d = res?.data || {}
    const failItems = (d.logs || []).filter(l => l.status === 'fail')
    let text = res?.msg || '任务已提交'
    if (failItems.length) text += ' · 失败原因：' + failItems.slice(0,2).map(l => l.error).join('；')
    buildMsg.value = { type: d.fail ? 'error' : 'success', text }
  } catch(e) { buildMsg.value = { type:'error', text:'失败: '+(e.message||'未知错误') } }
  building.value=false
}

// ============ 素材清理 ============
const cleanupCfg = reactive({ min_cost: 30, max_roi: 1.0, lookback_days: 3, scope: 'all' })
const cleanupLoading = ref(false)
const cleanupExecuting = ref(false)
const cleanupPreviewDone = ref(false)
const cleanupPreviewList = ref([])
const cleanupExecMsg = ref(null)
const cleanupRules = ref([])
const cleanupLogs = ref([])

function switchToCleanup() {
  drawerTab.value = 'cleanup'
  loadCleanupRules()
  loadCleanupLogs()
}

async function cleanupPreview() {
  cleanupLoading.value = true
  cleanupExecMsg.value = null
  try {
    const body = {
      scope: cleanupCfg.scope === 'current' ? 'specific' : 'all',
      account_ids: cleanupCfg.scope === 'current' ? [drawerAcct.value.account_id] : [],
      min_cost: cleanupCfg.min_cost,
      max_roi: cleanupCfg.max_roi,
      lookback_days: cleanupCfg.lookback_days,
    }
    const r = await request.post('/adq-pitcher/cleanup-preview', body, { timeout: 600000 })
    cleanupPreviewList.value = r?.data || []
    cleanupPreviewDone.value = true
  } catch(e) { message.error('预览失败: '+e.message) }
  cleanupLoading.value = false
}

async function doCleanup() {
  if(!cleanupPreviewList.value.length) return
  cleanupExecuting.value = true
  cleanupExecMsg.value = null
  try {
    const body = {
      scope: cleanupCfg.scope === 'current' ? 'specific' : 'all',
      account_ids: cleanupCfg.scope === 'current' ? [drawerAcct.value.account_id] : [],
      min_cost: cleanupCfg.min_cost,
      max_roi: cleanupCfg.max_roi,
      lookback_days: cleanupCfg.lookback_days,
      name: '手动清理',
    }
    const r = await request.post('/adq-pitcher/cleanup-execute', body, { timeout: 600000 })
    cleanupExecMsg.value = { type: (r?.data?.failed>0 ? 'warn' : 'success'), text: r?.msg || '完成' }
    cleanupPreviewList.value = []
    loadCleanupLogs()
  } catch(e) { cleanupExecMsg.value = { type:'error', text:'失败: '+e.message } }
  cleanupExecuting.value = false
}

async function loadCleanupRules() {
  try {
    const r = await request.get('/adq-pitcher/cleanup-rules')
    cleanupRules.value = (r?.data || []).map(x => ({ ...x, _enabled: !!x.enabled }))
  } catch(e) {}
}

function addCleanupRule() {
  cleanupRules.value.unshift({ id: null, name: '新规则', _enabled: false, scope: 'all', min_cost: 100, max_roi: 0.5, lookback_days: 3, schedule_time: '09:00' })
}

async function saveCleanupRule(r) {
  try {
    const body = {
      id: r.id, name: r.name, enabled: r._enabled ? 1 : 0,
      scope: r.scope || 'all', account_ids: [],
      min_cost: r.min_cost, max_roi: r.max_roi, lookback_days: r.lookback_days, schedule_time: r.schedule_time,
    }
    const res = await request.post('/adq-pitcher/cleanup-rule', body)
    if(res?.id) r.id = res.id
  } catch(e) { message.error('保存失败: '+e.message) }
}

async function deleteCleanupRule(r) {
  if(!r.id) { cleanupRules.value = cleanupRules.value.filter(x => x !== r); return }
  if(!confirm('确定删除此规则？')) return
  try {
    await request.delete(`/adq-pitcher/cleanup-rule/${r.id}`)
    cleanupRules.value = cleanupRules.value.filter(x => x.id !== r.id)
  } catch(e) { message.error('删除失败: '+e.message) }
}

async function loadCleanupLogs() {
  try {
    const r = await request.get('/adq-pitcher/cleanup-logs?limit=20')
    cleanupLogs.value = r?.data || []
  } catch(e) {}
}

// ============ AI 自动投放 ============
const adCfg = reactive({
  min_cost: 200, min_roi: 2.0, min_conversions: 5, lookback_days: 3,
  target_mode: 'smart', target_min_adgroup_roi: 1.0, target_min_adgroup_cost: 50, target_max_creatives: 15,
  max_adds_per_run: 50, max_per_adgroup: 2, max_per_video: 5, cross_account: false,
})
const adLoading = ref(false)
const adExecuting = ref(false)
const adPreviewDone = ref(false)
const adPreviewData = ref(null)
const adExecMsg = ref(null)
const adRules = ref([])
const adLogs = ref([])

function switchToAutoDeliver() {
  drawerTab.value = 'autodeliver'
  loadAdRules()
  loadAdLogs()
}

async function adPreview() {
  adLoading.value = true
  adExecMsg.value = null
  try {
    const body = {
      material_scope: 'all',
      min_cost: adCfg.min_cost, min_roi: adCfg.min_roi, min_conversions: adCfg.min_conversions, lookback_days: adCfg.lookback_days,
      target_mode: adCfg.target_mode,
      target_min_adgroup_roi: adCfg.target_min_adgroup_roi, target_min_adgroup_cost: adCfg.target_min_adgroup_cost, target_max_creatives: adCfg.target_max_creatives,
      max_adds_per_run: adCfg.max_adds_per_run, max_per_adgroup: adCfg.max_per_adgroup, max_per_video: adCfg.max_per_video,
      cross_account: adCfg.cross_account ? 1 : 0,
    }
    const r = await request.post('/adq-pitcher/autodeliver-preview', body, { timeout: 600000 })
    adPreviewData.value = r?.data || {}
    adPreviewDone.value = true
  } catch(e) { message.error('预览失败: '+e.message) }
  adLoading.value = false
}

async function adExecute() {
  if(!adPreviewData.value?.details?.length) return
  adExecuting.value = true
  adExecMsg.value = null
  try {
    const body = {
      material_scope: 'all', name: '手动投放',
      min_cost: adCfg.min_cost, min_roi: adCfg.min_roi, min_conversions: adCfg.min_conversions, lookback_days: adCfg.lookback_days,
      target_mode: adCfg.target_mode,
      target_min_adgroup_roi: adCfg.target_min_adgroup_roi, target_min_adgroup_cost: adCfg.target_min_adgroup_cost, target_max_creatives: adCfg.target_max_creatives,
      max_adds_per_run: adCfg.max_adds_per_run, max_per_adgroup: adCfg.max_per_adgroup, max_per_video: adCfg.max_per_video,
      cross_account: adCfg.cross_account ? 1 : 0, dry_run: 0,
    }
    const r = await request.post('/adq-pitcher/autodeliver-execute', body, { timeout: 600000 })
    const d = r?.data || {}
    adExecMsg.value = { type: (d.failed>0 ? 'warn' : 'success'), text: r?.msg || '完成' }
    adPreviewData.value = null
    adPreviewDone.value = false
    loadAdLogs()
  } catch(e) { adExecMsg.value = { type:'error', text:'失败: '+e.message } }
  adExecuting.value = false
}

async function loadAdRules() {
  try {
    const r = await request.get('/adq-pitcher/autodeliver-rules')
    adRules.value = (r?.data || []).map(x => ({ ...x, _enabled: !!x.enabled, _dry_run: !!x.dry_run, _cross_account: !!x.cross_account }))
  } catch(e) {}
}

function addAdRule() {
  adRules.value.unshift({
    id: null, name: '新投放规则', _enabled: false, _dry_run: true, _cross_account: false,
    material_scope: 'all', min_cost: 200, min_roi: 2.0, min_conversions: 5, lookback_days: 3,
    target_mode: 'smart', target_min_adgroup_roi: 1.0, target_min_adgroup_cost: 50, target_max_creatives: 15,
    max_adds_per_run: 50, max_per_adgroup: 2, max_per_video: 5,
    schedule_time: '09:00',
  })
}

async function saveAdRule(r) {
  try {
    const body = {
      id: r.id, name: r.name, enabled: r._enabled ? 1 : 0, dry_run: r._dry_run ? 1 : 0, cross_account: r._cross_account ? 1 : 0,
      material_scope: r.material_scope || 'all',
      min_cost: r.min_cost, min_roi: r.min_roi, min_conversions: r.min_conversions, lookback_days: r.lookback_days,
      target_mode: r.target_mode || 'smart',
      target_min_adgroup_roi: r.target_min_adgroup_roi, target_min_adgroup_cost: r.target_min_adgroup_cost, target_max_creatives: r.target_max_creatives,
      max_adds_per_run: r.max_adds_per_run, max_per_adgroup: r.max_per_adgroup, max_per_video: r.max_per_video,
      schedule_time: r.schedule_time,
    }
    const res = await request.post('/adq-pitcher/autodeliver-rule', body)
    if(res?.id) r.id = res.id
    message.success('规则已保存')
  } catch(e) { message.error('保存失败: '+e.message) }
}

async function deleteAdRule(r) {
  if(!r.id) { adRules.value = adRules.value.filter(x => x !== r); return }
  if(!confirm('确定删除此规则？')) return
  try {
    await request.delete(`/adq-pitcher/autodeliver-rule/${r.id}`)
    adRules.value = adRules.value.filter(x => x.id !== r.id)
  } catch(e) { message.error('删除失败: '+e.message) }
}

async function runAdRule(r) {
  if(!r.id) { message.warning('请先保存规则'); return }
  try {
    message.loading({ content: '正在执行...', key: 'ad-run', duration: 0 })
    const res = await request.post('/adq-pitcher/autodeliver-execute', { rule_id: r.id }, { timeout: 600000 })
    message.success({ content: res?.msg || '完成', key: 'ad-run' })
    loadAdLogs()
  } catch(e) { message.error({ content: '执行失败: '+e.message, key: 'ad-run' }) }
}

async function loadAdLogs() {
  try {
    const r = await request.get('/adq-pitcher/autodeliver-logs?limit=20')
    adLogs.value = r?.data || []
  } catch(e) {}
}
</script>

<style scoped>
.adq-dash { padding: 20px; max-width: 1400px; margin: 0 auto }
.adq-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px }
.adq-hd h2 { margin: 0; font-size: 20px }
.adq-btn { padding: 6px 16px; border: 1px solid #d9d9d9; border-radius: 6px; cursor: pointer; font-size: 14px; background: #fff }
.adq-btn:disabled { opacity:.5; cursor:default }
.ut-btn { background:#fa8c16; color:#fff; border-color:#fa8c16; font-weight:600 }
.ut-btn:hover { background:#d46b08 }
.ut-tag { font-size:11px; padding:3px 8px; border-radius:4px; font-weight:600 }
.ut-tag.ok { background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f }
.ut-tag.warn { background:#fff7e6; color:#fa8c16; border:1px solid #ffd591 }

.adq-summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px }
@media(max-width:900px){.adq-summary{grid-template-columns:repeat(2,1fr)}}
.adq-card { background:#fff; border-radius:8px; padding:14px 16px; box-shadow:0 1px 3px rgba(0,0,0,.06) }
.adq-card-label { font-size:12px; color:#8c8c8c; margin-bottom:6px }
.adq-card-val { font-size:22px; font-weight:700; color:#1a1a1a }
.adq-card-change { font-size:12px; margin-top:4px }
.adq-card-change.up { color:#f5222d }
.adq-card-change.down { color:#52c41a }

.adq-section { background:#fff; border-radius:8px; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,.06) }
.adq-section-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px }
.adq-section-hd h3 { margin:0; font-size:16px }
.adq-tbl-wrap { overflow-x:auto }
.adq-tbl { width:100%; border-collapse:collapse; min-width:1000px }
.adq-tbl th,.adq-tbl td { padding:10px 8px; text-align:left; border-bottom:1px solid #f0f0f0; font-size:13px; white-space:nowrap }
.adq-tbl th { background:#fafafa; font-weight:600 }
.adq-tbl .r { text-align:right }
.adq-tbl .bold { font-weight:600 }
.adq-row-click { cursor:pointer; transition:background .15s }
.adq-row-click:hover { background:#f5f7fa }

/* 抽屉 */
.drawer-mask { position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,.35); z-index:1000; display:flex }
.drawer-panel { background:#fff; display:flex; flex-direction:column; overflow:hidden; animation:slideIn .25s ease }
.drawer-panel.from-right { position:absolute; right:0;top:0;bottom:0; width:560px; max-width:92vw; border-radius:8px 0 0 8px }
.drawer-panel.from-bottom { position:absolute; left:0;right:0;bottom:0; max-height:90vh; border-radius:12px 12px 0 0 }
@keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }
.from-bottom { animation-name:slideUp !important }
@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
.drawer-hd { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; border-bottom:1px solid #f0f0f0 }
.drawer-title { font-size:16px; font-weight:600 }
.drawer-sub { font-size:12px; color:#8c8c8c; margin-top:2px }
.drawer-close { background:none; border:none; font-size:24px; cursor:pointer; color:#999; padding:0 4px }
.drawer-body { flex:1; overflow-y:auto; padding:16px 20px }

/* 抽屉内 tab */
.dtab-bar { display:flex; border-bottom:1px solid #f0f0f0; padding:0 20px; background:#fafafa }
.dtab { padding:10px 16px; font-size:14px; font-weight:600; color:#8c8c8c; cursor:pointer; border-bottom:2px solid transparent; transition:all .2s; user-select:none }
.dtab:hover { color:#333 }
.dtab.active { color:#1677ff; border-bottom-color:#1677ff }

/* 明细 */
.drawer-summary { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:16px }
.ds-item { background:#fafafa; border-radius:6px; padding:10px; display:flex; justify-content:space-between; align-items:center }
.ds-item span { font-size:13px; color:#8c8c8c }
.ds-item b { font-size:18px; color:#1a1a1a }
.drawer-section-title { font-size:14px; font-weight:600; margin-bottom:10px; color:#333 }
.detail-list { display:flex; flex-direction:column; gap:10px }
.detail-item { border:1px solid #f0f0f0; border-radius:8px; padding:12px }
.di-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }
.di-name { font-size:13px; font-weight:600; color:#333; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:12px }
.di-hd-right { display:flex; align-items:center; gap:8px; flex-shrink:0 }
.di-roi-tag { font-size:12px; font-weight:700; padding:2px 8px; border-radius:4px; white-space:nowrap }
.di-roi-tag.good { background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f }
.di-roi-tag.low { background:#fff2f0; color:#ff4d4f; border:1px solid #ffccc7 }
.di-cost { font-size:15px; font-weight:700; color:#1677ff; white-space:nowrap }
.di-metrics { display:flex; flex-wrap:wrap; gap:6px 14px }
.di-metrics span { font-size:12px; color:#8c8c8c }
.di-bid { color:#fa8c16 !important; font-weight:600 }
.di-bid-click { cursor:pointer; border-bottom:1px dashed #fa8c16; padding-bottom:1px }
.di-bid-click:hover { color:#d46b08 !important }
.di-bid-edit { display:inline-flex; align-items:center; gap:3px; color:#fa8c16; font-weight:600; font-size:12px }
.bid-input { width:60px; padding:1px 4px; border:1px solid #fa8c16; border-radius:3px; font-size:12px; text-align:right; color:#fa8c16; outline:none }
.bid-input:focus { border-color:#d46b08; box-shadow:0 0 0 1px rgba(250,140,22,.2) }
.bid-ok,.bid-no { width:18px; height:18px; border:none; border-radius:3px; cursor:pointer; font-size:11px; display:inline-flex; align-items:center; justify-content:center; padding:0 }
.bid-ok { background:#52c41a; color:#fff }
.bid-ok:hover { background:#389e0d }
.bid-ok:disabled { opacity:.5 }
.bid-no { background:#f5f5f5; color:#999 }
.bid-no:hover { background:#ff4d4f; color:#fff }

.di-mat-toggle { color:#1677ff !important; font-weight:600; cursor:pointer; user-select:none }
.di-mat-toggle:hover { color:#4096ff !important }

.di-materials { margin-top:8px; padding:8px; background:#fafafa; border-radius:6px; border:1px solid #f0f0f0 }
.di-mat-loading,.di-mat-empty { text-align:center; padding:10px; color:#8c8c8c; font-size:12px }
.di-mat-item { padding:6px 0; border-bottom:1px solid #f0f0f0 }
.di-mat-item:last-child { border-bottom:none }
.di-mat-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px }
.di-mat-name { font-size:12px; font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0 }
.di-mat-del { padding:1px 6px; font-size:10px; border:1px solid #ffccc7; border-radius:3px; background:#fff; color:#ff4d4f; cursor:pointer; flex-shrink:0; margin-left:6px }
.di-mat-del:hover { background:#fff2f0; border-color:#ff4d4f }
.di-mat-tags { display:flex; flex-wrap:wrap; gap:4px 10px }
.di-mat-tags span { font-size:11px; color:#8c8c8c }
.di-mat-tags .di-roi-tag { font-size:11px }

/* ===== AI金牌投手（抽屉内） ===== */
.p-block { margin-bottom:16px }
.p-block-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }
.p-block-title { font-size:14px; font-weight:600; color:#333 }
.p-count { background:#1677ff; color:#fff; border-radius:10px; padding:0 7px; font-size:12px; margin-left:4px }

.p-btn { padding:4px 12px; border:1px solid #d9d9d9; border-radius:6px; cursor:pointer; font-size:12px; background:#fff }
.p-btn.accent { background:linear-gradient(135deg,#722ED1,#1677ff); color:#fff; border:none; font-weight:600 }
.p-btn.primary { background:#1677ff; color:#fff; border-color:#1677ff; font-size:14px; padding:8px 0; font-weight:600; border-radius:8px }
.p-btn.warn { background:#fa8c16; color:#fff; border-color:#fa8c16; font-weight:600 }
.p-btn:disabled { opacity:.5; cursor:default }

/* 条件池 */
.p-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px }
.p-chip { display:inline-flex; align-items:center; gap:3px; padding:5px 12px; background:#f5f5f5; border:1.5px dashed #d9d9d9; border-radius:16px; font-size:12px; font-weight:500; cursor:grab; user-select:none; transition:all .2s }
.p-chip:hover { border-color:#1677ff; color:#1677ff; background:#e6f4ff }
.p-chip.used { background:#e6f4ff; border-color:#91caff; border-style:solid; color:#1677ff }

/* 组合区 */
.p-drop-zone { min-height:50px; border:2px dashed #e8e8e8; border-radius:8px; padding:8px; background:#fafafa; transition:all .2s; display:flex; flex-wrap:wrap; gap:8px }
.p-drop-zone.over { border-color:#1677ff; background:#e6f4ff }
.p-drop-hint { width:100%; text-align:center; color:#bfbfbf; font-size:12px; padding:10px 0 }
.p-cond { display:flex; align-items:center; gap:4px; background:#fff; border:1px solid #e8e8e8; border-radius:6px; padding:4px 8px }
.p-cond-name { font-size:12px; font-weight:600; color:#1677ff; white-space:nowrap }
.p-sel-sm { width:46px; padding:2px; border:1px solid #d9d9d9; border-radius:4px; font-size:12px; text-align:center; background:#fafafa }
.p-input-sm { width:65px; padding:2px 6px; border:1px solid #d9d9d9; border-radius:4px; font-size:12px; text-align:right }
.p-input-sm:focus { border-color:#1677ff; outline:none }
.p-unit { font-size:11px; color:#8c8c8c }
.p-x { width:18px; height:18px; display:flex; align-items:center; justify-content:center; border:none; background:#f5f5f5; border-radius:50%; cursor:pointer; font-size:12px; color:#999 }
.p-x:hover { background:#ff4d4f; color:#fff }

/* 配置 */
.p-cfg { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px }
.p-cfg label { display:flex; align-items:center; gap:4px; font-size:12px; color:#595959 }
.p-cfg input { width:60px; padding:3px 6px; border:1px solid #d9d9d9; border-radius:4px; font-size:13px; text-align:center }
.p-cfg input:focus { border-color:#1677ff; outline:none }

/* 素材池 */
.p-material-pool { display:flex; flex-direction:column; gap:6px; max-height:240px; overflow-y:auto }
.p-mat { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1.5px solid #f0f0f0; border-radius:8px; cursor:pointer; transition:all .15s; user-select:none }
.p-mat:hover { border-color:#91caff; background:#f8fbff }
.p-mat.selected { border-color:#1677ff; background:#e6f4ff }
.p-mat-idx { width:20px; height:20px; border-radius:50%; background:#f0f0f0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#8c8c8c; flex-shrink:0 }
.p-mat.selected .p-mat-idx { background:#1677ff; color:#fff }
.p-mat-thumb { width:40px; height:40px; border-radius:4px; object-fit:cover; flex-shrink:0; background:#f0f0f0 }
.p-mat-thumb-placeholder { width:40px; height:40px; border-radius:4px; background:#f5f5f5; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0 }
.p-mat-info { flex:1; min-width:0 }
.p-mat-name { font-size:12px; font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.p-mat-sub { font-size:10px; color:#bfbfbf; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.p-mat-tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px }
.p-mat-tag { font-size:10px; color:#8c8c8c; background:#fafafa; padding:1px 6px; border-radius:3px }
.p-mat-check { width:18px; font-size:14px; color:#1677ff; font-weight:700; text-align:center; flex-shrink:0 }

/* 组合预览 */
.p-combo-list { display:flex; flex-direction:column; gap:8px; margin-top:10px }
.p-combo-card { border:1px solid #e8e8e8; border-radius:8px; padding:8px 10px; background:#fafafa }
.p-combo-hd { display:flex; align-items:center; font-size:13px; font-weight:700; color:#1677ff; margin-bottom:6px }
.p-combo-mats { display:flex; flex-wrap:wrap; gap:4px }
.p-combo-tag { font-size:11px; background:#fff; border:1px solid #d9d9d9; border-radius:4px; padding:2px 8px; color:#333; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }

.p-msg { margin-top:10px; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:500 }
.p-msg.success { background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f }
.p-msg.error { background:#fff2f0; color:#ff4d4f; border:1px solid #ffccc7 }
.p-msg.warn { background:#fffbe6; color:#faad14; border:1px solid #ffe58f }

/* 素材清理 */
.p-btn.danger { background:#ff4d4f; color:#fff; border-color:#ff4d4f; font-weight:600 }
.p-btn.danger:hover { background:#d9363e }
.cl-cfg { background:#fafafa; border-radius:6px; padding:12px }
.cl-row { display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:12px; color:#595959 }
.cl-row label { color:#595959 }
.cl-tip { font-size:11px; color:#fa8c16; background:#fff7e6; padding:6px 10px; border-radius:4px; margin-top:8px }
.cl-list { max-height:400px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding:4px }
.cl-item { display:flex; gap:10px; padding:10px; background:#fff; border:1px solid #f0f0f0; border-radius:6px }
.cl-idx { width:24px; height:24px; background:#ff4d4f; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0 }
.cl-thumb { width:48px; height:48px; object-fit:cover; border-radius:4px; flex-shrink:0 }
.cl-thumb-ph { width:48px; height:48px; background:#f0f0f0; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0 }
.cl-info { flex:1; min-width:0 }
.cl-name { font-size:13px; color:#262626; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.cl-sub { font-size:11px; color:#8c8c8c; margin-bottom:4px }
.cl-tags { display:flex; gap:4px; flex-wrap:wrap }
.cl-tag { font-size:11px; padding:2px 6px; border-radius:3px; background:#f0f0f0; color:#595959 }
.cl-tag.cost { background:#fff1f0; color:#ff4d4f }
.cl-tag.roi-bad { background:#fff2f0; color:#ff4d4f; font-weight:600 }
.cl-tag.roi-good { background:#f6ffed; color:#52c41a; font-weight:600 }
.cl-rule { background:#fafafa; border:1px solid #f0f0f0; border-radius:6px; padding:10px; margin-bottom:8px }
.cl-rule-hd { display:flex; gap:8px; align-items:center; margin-bottom:8px }
.cl-rule-body { display:flex; gap:10px; flex-wrap:wrap; font-size:12px; color:#595959 }
.cl-rule-body label { display:flex; align-items:center; gap:4px }
.cl-sw { font-size:12px; display:flex; align-items:center; gap:4px }
.cl-logs { display:flex; flex-direction:column; gap:4px; max-height:220px; overflow-y:auto }
.cl-log-item { display:flex; gap:8px; align-items:center; padding:6px 10px; background:#fafafa; border-radius:4px; font-size:12px }
.cl-log-type { padding:2px 6px; border-radius:3px; font-size:10px; font-weight:600 }
.cl-log-type.auto { background:#e6f4ff; color:#1677ff }
.cl-log-type.manual { background:#fff7e6; color:#fa8c16 }
.cl-log-name { flex:1; color:#262626 }
.cl-log-res { color:#52c41a; font-weight:500 }
.cl-log-time { color:#8c8c8c; font-size:11px }
.cl-log-type.scheduled { background:#e6f4ff; color:#1677ff }
.cl-log-type.preview { background:#f6ffed; color:#52c41a }

/* AI 自动投放 */
.ad-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:10px }
@media(max-width:900px){.ad-grid{grid-template-columns:1fr}}
.ad-sec { background:#fafafa; border-radius:6px; padding:10px 12px }
.ad-sec-title { font-size:12px; font-weight:600; color:#262626; margin-bottom:8px }
.ad-sec label { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:#595959; margin:4px 6px 4px 0 }
.ad-stats { display:flex; gap:16px; padding:8px 12px; background:#f6ffed; border-radius:4px; font-size:12px; margin-bottom:8px }
.ad-stats b { color:#1677ff; margin:0 2px; font-size:13px }
.ad-list { display:flex; flex-direction:column; gap:4px; max-height:400px; overflow-y:auto }
.ad-item { display:flex; align-items:center; gap:10px; padding:8px 10px; background:#fff; border:1px solid #f0f0f0; border-radius:6px }
.ad-score { flex-shrink:0; width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#1677ff,#722ed1); color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:13px }
.ad-main { flex:1; min-width:0 }
.ad-line1 { font-size:13px; color:#262626; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.ad-line1 b { color:#1677ff }
.ad-arrow { margin:0 6px; color:#8c8c8c }
.ad-line2 { font-size:11px; color:#8c8c8c; margin-top:2px }
.p-tip { font-size:11px; color:#8c8c8c; margin-left:10px }

/* 目标广告组选择器 */
.p-ag-toolbar { display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap }
.p-ag-switch { font-size:11px; color:#595959; display:flex; align-items:center; gap:4px; user-select:none; cursor:pointer }
.p-ag-switch input { margin:0 }
.p-ag-pool { display:flex; flex-direction:column; gap:4px; max-height:240px; overflow-y:auto; border:1px solid #f0f0f0; border-radius:6px; padding:4px; background:#fafafa }
.p-ag-empty { text-align:center; padding:18px; color:#999; font-size:12px }
.p-ag-item { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; background:#fff; border:1.5px solid transparent; border-radius:6px; cursor:pointer; transition:all .15s; user-select:none }
.p-ag-item:hover { border-color:#91caff }
.p-ag-item.selected { border-color:#1677ff; background:#e6f4ff }
.p-ag-chk { width:18px; height:18px; border-radius:4px; border:1.5px solid #d9d9d9; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff; flex-shrink:0; margin-top:1px }
.p-ag-item.selected .p-ag-chk { background:#1677ff; border-color:#1677ff }
.p-ag-info { flex:1; min-width:0 }
.p-ag-row1 { display:flex; align-items:center; gap:6px }
.p-ag-name { font-size:12px; color:#1a1a1a; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0 }
.p-ag-sub { font-size:10px; color:#8c8c8c; margin-top:2px }
.p-ag-status { font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; flex-shrink:0 }
.p-ag-status.ok { background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f }
.p-ag-status.off { background:#fafafa; color:#8c8c8c; border:1px solid #d9d9d9 }
.p-ag-stats { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px }
.p-ag-tag { font-size:10px; padding:1px 6px; border-radius:3px; background:#fafafa; color:#595959; border:1px solid #f0f0f0 }
.p-ag-tag.good { background:#f6ffed; color:#52c41a; border-color:#b7eb8f; font-weight:600 }
.p-ag-tag.low { background:#fff2f0; color:#ff4d4f; border-color:#ffccc7; font-weight:600 }
</style>
