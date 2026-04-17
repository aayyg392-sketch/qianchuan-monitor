<template>
  <div :class="embedded ? 'embedded-mode' : 'page'">
    <!-- Overview Section (仅独立页面显示) -->
    <template v-if="!embedded">
    <div class="overview">
      <div class="overview-header">
        <h3 class="overview-title">AI金牌投手</h3>
        <p class="overview-desc">自动监控千川计划，放大赚钱素材、止损亏钱计划、全程无人值守</p>
      </div>
      <!-- 核心数据行 -->
      <div class="ov-stats">
        <div class="ov-stat">
          <div class="ov-stat__val">{{ fmtMoney(totalCost) }}</div>
          <div class="ov-stat__label">今日花费</div>
        </div>
        <div class="ov-stat__divider"></div>
        <div class="ov-stat">
          <div class="ov-stat__val">{{ fmtMoney(totalGmv) }}</div>
          <div class="ov-stat__label">今日成交</div>
        </div>
        <div class="ov-stat__divider"></div>
        <div class="ov-stat">
          <div class="ov-stat__val" :class="overallRoi >= 1.5 ? 'val-green' : overallRoi > 0 ? 'val-orange' : ''">{{ overallRoi > 0 ? overallRoi.toFixed(2) : '--' }}</div>
          <div class="ov-stat__label">{{ overallRoi >= 1.5 ? '投产比优秀' : overallRoi > 1 ? '投产比保本' : '投产比' }}</div>
        </div>
        <div class="ov-stat__divider"></div>
        <div class="ov-stat">
          <div class="ov-stat__val">{{ runningCount }}<span class="ov-stat__unit">/{{ accountList.length }}</span></div>
          <div class="ov-stat__label">监控账户</div>
        </div>
      </div>
      <!-- 4大功能状态 -->
      <div class="ov-features">
        <div class="ov-feat" :class="{ 'ov-feat--active': featureCount('enabled') > 0 }">
          <div class="ov-feat__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
          </div>
          <div class="ov-feat__body">
            <div class="ov-feat__name">计划管理</div>
            <div class="ov-feat__data">
              <span class="ov-feat__num green">{{ totalScaleUp }}</span>加大
              <span class="ov-feat__num red" style="margin-left:6px">{{ totalScaleDown }}</span>止损
            </div>
          </div>
        </div>
        <div class="ov-feat" :class="{ 'ov-feat--active': featureCount('material_auto_clean_enabled') > 0 }">
          <div class="ov-feat__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </div>
          <div class="ov-feat__body">
            <div class="ov-feat__name">自动清理</div>
            <div class="ov-feat__data"><span class="ov-feat__num orange">{{ totalAutoClean }}</span>已清理</div>
          </div>
        </div>
        <div class="ov-feat" :class="{ 'ov-feat--active': featureCount('boost_enabled') > 0 }">
          <div class="ov-feat__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div class="ov-feat__body">
            <div class="ov-feat__name">一键调速</div>
            <div class="ov-feat__data"><span class="ov-feat__num green">{{ totalBoostCount }}</span>已调速</div>
          </div>
        </div>
        <div class="ov-feat" :class="{ 'ov-feat--active': featureCount('mat_boost_enabled') > 0 }">
          <div class="ov-feat__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div class="ov-feat__body">
            <div class="ov-feat__name">素材追投</div>
            <div class="ov-feat__data"><span class="ov-feat__num purple">{{ totalMatBoostCount }}</span>已追投</div>
          </div>
        </div>
      </div>
      <div class="ov-time" v-if="latestRun">最近巡检 {{ latestRun }}</div>
    </div>

    <!-- Account Table Section -->
    <div class="acc-section">
      <div class="acc-section-title">账户列表 <span class="acc-section-hint">点击账户查看详情和配置</span></div>
      <div class="acc-table-header">
        <span class="col-info">账户信息</span>
        <span class="col-val">目标ROI</span>
        <span class="col-val">止损线</span>
        <span class="col-val">赚钱</span>
        <span class="col-val">亏钱</span>
        <span class="col-val col-hide-m">花费</span>
        <span class="col-val col-hide-m">成交</span>
        <span class="col-status">状态</span>
      </div>
      <div v-if="loading" class="empty-state">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>
      <template v-else>
        <div
          v-for="acc in accountList"
          :key="acc.advertiser_id"
          class="acc-table-row"
          @click="openDrawer(acc)"
        >
          <div class="col-info">
            <div class="acc-avatar" :style="{ background: avatarColor(acc.advertiser_id) }">
              {{ (acc.advertiser_name || acc.advertiser_id || '账').charAt(0) }}
            </div>
            <div class="acc-text">
              <div class="acc-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
              <div class="acc-sub">ID: {{ acc.advertiser_id }}</div>
            </div>
          </div>
          <span class="col-val blue">{{ getStatus(acc.advertiser_id)?.min_roi || '--' }}</span>
          <span class="col-val orange">{{ getStatus(acc.advertiser_id)?.stop_roi || '--' }}</span>
          <span class="col-val green">{{ getStatus(acc.advertiser_id)?.today_scale_up || 0 }}个</span>
          <span class="col-val red">{{ getStatus(acc.advertiser_id)?.today_scale_down || 0 }}个</span>
          <span class="col-val col-hide-m">{{ fmtMoney(getStatus(acc.advertiser_id)?.today_cost || 0) }}</span>
          <span class="col-val col-hide-m">{{ fmtMoney(getStatus(acc.advertiser_id)?.today_gmv || 0) }}</span>
          <div class="col-status">
            <template v-if="hasAnyFeature(acc.advertiser_id)">
              <span v-if="getStatus(acc.advertiser_id)?.enabled" class="feat-tag feat-tag--blue">计划</span>
              <span v-if="getStatus(acc.advertiser_id)?.material_auto_clean_enabled" class="feat-tag feat-tag--orange">清理</span>
              <span v-if="getStatus(acc.advertiser_id)?.boost_enabled" class="feat-tag feat-tag--green">调速</span>
              <span v-if="getStatus(acc.advertiser_id)?.mat_boost_enabled" class="feat-tag feat-tag--purple">追投</span>
            </template>
            <span v-else class="badge off"><i class="dot"></i>未启动</span>
          </div>
        </div>
        <div v-if="!accountList.length" class="empty-state">暂无账户，请先在账户管理中授权千川广告账户</div>
      </template>
    </div>
    </template><!-- end v-if="!embedded" -->

    <!-- Drawer -->
    <div v-if="drawerVisible || embedded" class="drawer-mask" @click.self="!embedded && (drawerVisible = false)">
      <div class="drawer">
        <div class="drawer-head">
          <div class="dh-left">
            <div class="dh-avatar" :style="{ background: avatarColor(currentAcc.advertiser_id) }">
              {{ (currentAcc.advertiser_name || currentAcc.advertiser_id || '账').charAt(0) }}
            </div>
            <div>
              <div class="dh-name">{{ currentAcc.advertiser_name || currentAcc.advertiser_id }}</div>
              <div class="dh-id">ID: {{ currentAcc.advertiser_id }}</div>
            </div>
          </div>
          <span class="dh-close" @click="drawerVisible = false">&times;</span>
        </div>
        <div class="drawer-body">
          <!-- Hero Row (仅独立页面显示) -->
          <div class="hero-row" v-if="!embedded">
            <div class="hero-card" :class="config.enabled ? 'c-on' : 'c-off'">
              <div class="hero-label">投手状态</div>
              <div class="hero-val">{{ config.enabled ? '运行中' : '已停止' }}</div>
            </div>
            <div class="hero-card c-cost">
              <div class="hero-label">今日花费</div>
              <div class="hero-val">{{ fmtMoney(currentStats.cost) }}</div>
            </div>
            <div class="hero-card c-gmv">
              <div class="hero-label">今日成交</div>
              <div class="hero-val">{{ fmtMoney(currentStats.gmv) }}</div>
            </div>
            <div class="hero-card c-action">
              <button v-if="!config.enabled" class="btn-primary" @click="startPitcher" :disabled="saving">启动投手</button>
              <button v-else class="btn-danger" @click="stopPitcher" :disabled="saving">停止投手</button>
              <button class="btn-run" @click="runOnce" :disabled="running || !config.enabled">
                {{ running ? '执行中...' : '手动执行' }}
              </button>
            </div>
          </div>

          <!-- Tab Switch -->
          <div class="drawer-tabs">
            <div class="drawer-tab" :class="{ active: drawerTab === 'plan' }" @click="drawerTab = 'plan'">计划管理</div>
            <div class="drawer-tab" :class="{ active: drawerTab === 'material' }" @click="drawerTab = 'material'">自动清理</div>
            <div class="drawer-tab" :class="{ active: drawerTab === 'boost' }" @click="drawerTab = 'boost'">一键调速</div>
            <div class="drawer-tab" :class="{ active: drawerTab === 'matboost' }" @click="drawerTab = 'matboost'">素材追投</div>
          </div>

          <!-- Tab1: 计划管理 -->
          <div v-show="drawerTab === 'plan'">
            <!-- 嵌入模式：操作栏 -->
            <div class="plan-action-bar" v-if="embedded">
              <div class="plan-status-row">
                <span class="plan-status-dot" :class="config.enabled ? 'on' : 'off'"></span>
                <span class="plan-status-text">{{ config.enabled ? '运行中' : '已停止' }}</span>
                <span class="plan-stats" v-if="currentStats.cost > 0">花费 {{ fmtMoney(currentStats.cost) }} · 成交 {{ fmtMoney(currentStats.gmv) }}</span>
              </div>
              <div class="plan-action-btns">
                <button v-if="!config.enabled" class="btn-primary" @click="startPitcher" :disabled="saving">启动投手</button>
                <button v-else class="btn-danger" @click="stopPitcher" :disabled="saving">停止投手</button>
                <button class="btn-run" @click="runOnce" :disabled="running || !config.enabled">{{ running ? '执行中...' : '手动执行' }}</button>
              </div>
            </div>
            <!-- Strategy Info (运营易懂版) -->
            <div class="strategy-info">
              <div class="strategy-info__item si-up">
                <strong>赚钱了怎么做</strong>：计划投产比 &ge; 目标ROI且有成交 → AI自动<em>加大投放</em>，让赚钱的计划跑更多量
              </div>
              <div class="strategy-info__item si-down">
                <strong>亏钱了怎么做</strong>：计划投产比 &lt; 止损线或花钱没转化 → AI自动<em>减少投放</em>，避免继续亏钱
              </div>
            </div>

            <!-- Config Section -->
            <div class="sec-label">
              投放规则
              <button class="btn-save" @click="saveConfig" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button>
            </div>

            <!-- 巡检间隔（始终显示） -->
            <div class="cfg-group">
              <div class="cfg-group__title">巡检设置</div>
              <div class="cfg-row">
                <span class="cfg-name">巡检间隔</span>
                <span class="cfg-desc">AI多久看一次数据</span>
                <select v-model.number="config.poll_interval" class="cfg-input">
                  <option :value="10">10分钟</option>
                  <option :value="20">20分钟</option>
                  <option :value="30">30分钟</option>
                  <option :value="60">1小时</option>
                  <option :value="120">2小时</option>
                  <option :value="360">6小时</option>
                  <option :value="720">12小时</option>
                  <option :value="1440">24小时</option>
                </select>
              </div>
            </div>

            <!-- 已启用规则 -->
            <div class="rule-zone rule-zone--active"
              @dragover.prevent="onDragOver($event, 'rule_active')"
              @dragleave="onDragLeave($event, 'rule_active')"
              @drop="onDrop($event, 'rule_active')"
              :class="{ 'rule-zone--hover': dragOverZone === 'rule_active' }">
              <div class="rule-zone__title">
                <span class="rule-zone__dot rule-zone__dot--green"></span>
                已启用（{{ activeRuleKeys.length }}）
                <span class="rule-zone__hint">拖到下方关闭</span>
              </div>
              <div v-if="!activeRuleKeys.length" class="rule-zone__empty">从下方拖入需要的规则</div>
              <div class="rule-grid">
                <div v-for="key in activeRuleKeys" :key="key"
                  class="rule-card rule-card--active"
                  draggable="true"
                  @dragstart="onDragStart($event, key, 'rule')"
                  @dragend="onDragEnd">
                  <div class="rule-card__top">
                    <span class="rule-card__handle">&#9776;</span>
                    <span class="rule-card__name">{{ ruleMap[key].name }}</span>
                  </div>
                  <div class="rule-card__bottom">
                    <span class="rule-card__desc">{{ ruleMap[key].desc }}</span>
                    <input v-if="ruleMap[key].inputType === 'number'"
                      type="number" v-model.number="config[ruleMap[key].configKey]"
                      :step="ruleMap[key].step" :min="ruleMap[key].min" :max="ruleMap[key].max"
                      class="rule-input" @click.stop>
                    <input v-if="ruleMap[key].inputType === 'minutes'"
                      type="number" v-model.number="config[ruleMap[key].configKey]"
                      :step="ruleMap[key].step" :min="ruleMap[key].min"
                      class="rule-input" placeholder="分钟" @click.stop>
                  </div>
                </div>
              </div>
            </div>

            <!-- 未启用规则 -->
            <div class="rule-zone rule-zone--pool"
              @dragover.prevent="onDragOver($event, 'rule_pool')"
              @dragleave="onDragLeave($event, 'rule_pool')"
              @drop="onDrop($event, 'rule_pool')"
              :class="{ 'rule-zone--hover': dragOverZone === 'rule_pool' }">
              <div class="rule-zone__title">
                <span class="rule-zone__dot rule-zone__dot--gray"></span>
                未启用（{{ poolRuleKeys.length }}）
                <span class="rule-zone__hint">拖到上方启用</span>
              </div>
              <div v-if="!poolRuleKeys.length" class="rule-zone__empty">全部已启用</div>
              <div class="rule-grid">
                <div v-for="key in poolRuleKeys" :key="key"
                  class="rule-card rule-card--pool"
                  draggable="true"
                  @dragstart="onDragStart($event, key, 'rule')"
                  @dragend="onDragEnd">
                  <div class="rule-card__top">
                    <span class="rule-card__handle">&#9776;</span>
                    <span class="rule-card__name">{{ ruleMap[key].name }}</span>
                  </div>
                  <div class="rule-card__bottom">
                    <span class="rule-card__desc">{{ ruleMap[key].desc }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Logs Section -->
            <div class="sec-label">
              操作记录
              <button class="btn-text" @click="loadLogs">刷新</button>
            </div>
            <div class="log-card">
              <div v-for="log in logs" :key="log.id" class="log-item" :class="'log-' + log.action">
                <div class="log-item__head">
                  <span class="log-action-tag" :class="'action-' + log.action">{{ actionLabel(log.action) }}</span>
                  <span class="log-time">{{ fmtTime(log.created_at) }}</span>
                </div>
                <div class="log-ad">{{ log.ad_name || log.ad_id || '系统操作' }}</div>
                <div class="log-metrics" v-if="log.cost > 0">
                  <span>花费 ¥{{ parseFloat(log.cost).toFixed(0) }}</span>
                  <span>投产比 {{ log.roi }}</span>
                  <span v-if="log.orders > 0">成交 {{ log.orders }}单</span>
                  <span v-if="log.gmv > 0">成交额 ¥{{ parseFloat(log.gmv).toFixed(0) }}</span>
                </div>
                <div class="log-detail">{{ log.action_detail }}</div>
              </div>
              <div v-if="!logs.length" class="empty-tip">暂无操作记录，启动AI投手后会自动记录每次操作</div>
            </div>
          </div>

          <!-- Tab2: 自动清理 -->
          <div v-show="drawerTab === 'material'">

            <!-- ========== 差素材自动清理 ========== -->
            <div class="feature-card feature-card--orange">
              <div class="feature-card__bar feature-card__bar--orange"></div>
              <div class="feature-card__body">
                <div class="feature-card__header">
                  <div class="feature-card__title-row">
                    <span class="feature-card__icon">&#129529;</span>
                    <span class="feature-card__title">差素材自动清理</span>
                  </div>
                  <div class="feature-switch" :class="{ on: autoCleanConfig.material_auto_clean_enabled }" @click="autoCleanConfig.material_auto_clean_enabled = !autoCleanConfig.material_auto_clean_enabled; saveAutoCleanConfig()">
                    <div class="feature-switch__thumb"></div>
                  </div>
                </div>
                <div class="feature-card__desc">自动删除亏钱的素材，让预算集中给好素材</div>

                <div class="feature-card__config" v-if="autoCleanConfig.material_auto_clean_enabled">
                  <!-- 统计天数（始终显示） -->
                  <div class="clean-top-bar">
                    <span class="clean-top-label">统计范围</span>
                    <select v-model.number="autoCleanConfig.material_clean_days" class="clean-rule-select">
                      <option :value="3">前3天</option>
                      <option :value="5">前5天</option>
                      <option :value="7">前7天</option>
                    </select>
                    <span class="clean-top-hint">即清理{{ cleanDateRange }}的差素材，{{ cleanProtectRange }}的新素材不受影响</span>
                  </div>

                  <!-- 已启用清理规则 -->
                  <div class="rule-zone rule-zone--active rule-zone--sm"
                    @dragover.prevent="onDragOver($event, 'clean_active')"
                    @dragleave="onDragLeave($event, 'clean_active')"
                    @drop="onDrop($event, 'clean_active')"
                    :class="{ 'rule-zone--hover': dragOverZone === 'clean_active' }">
                    <div class="rule-zone__title">
                      <span class="rule-zone__dot rule-zone__dot--green"></span>
                      已启用（{{ activeCleanRuleKeys.length }}）
                      <span class="rule-zone__hint">拖到下方关闭</span>
                    </div>
                    <div v-if="!activeCleanRuleKeys.length" class="rule-zone__empty">从下方拖入需要的规则</div>
                    <div class="rule-grid">
                      <div v-for="key in activeCleanRuleKeys" :key="key"
                        class="rule-card rule-card--active rule-card--orange"
                        draggable="true"
                        @dragstart="onDragStart($event, key, 'clean')"
                        @dragend="onDragEnd">
                        <div class="rule-card__top">
                          <span class="rule-card__handle">&#9776;</span>
                          <span class="rule-card__name">{{ cleanRuleMap[key].name }}</span>
                        </div>
                        <div class="rule-card__inputs">
                          <label class="rule-card__field">
                            <span class="rule-card__flabel">{{ cleanRuleMap[key].label }}</span>
                            <input type="number" v-model.number="autoCleanConfig[cleanRuleMap[key].configKey]"
                              class="rule-input rule-input--sm" @click.stop>
                            <span v-if="cleanRuleMap[key].unit" class="rule-card__unit">{{ cleanRuleMap[key].unit }}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 未启用清理规则 -->
                  <div class="rule-zone rule-zone--pool rule-zone--sm"
                    @dragover.prevent="onDragOver($event, 'clean_pool')"
                    @dragleave="onDragLeave($event, 'clean_pool')"
                    @drop="onDrop($event, 'clean_pool')"
                    :class="{ 'rule-zone--hover': dragOverZone === 'clean_pool' }">
                    <div class="rule-zone__title">
                      <span class="rule-zone__dot rule-zone__dot--gray"></span>
                      未启用（{{ poolCleanRuleKeys.length }}）
                      <span class="rule-zone__hint">拖到上方启用</span>
                    </div>
                    <div v-if="!poolCleanRuleKeys.length" class="rule-zone__empty">全部规则已启用，拖到此处可关闭</div>
                    <div v-else class="rule-grid">
                      <div v-for="key in poolCleanRuleKeys" :key="key"
                        class="rule-card rule-card--pool"
                        draggable="true"
                        @dragstart="onDragStart($event, key, 'clean')"
                        @dragend="onDragEnd">
                        <div class="rule-card__top">
                          <span class="rule-card__handle">&#9776;</span>
                          <span class="rule-card__name">{{ cleanRuleMap[key].name }}</span>
                        </div>
                        <div class="rule-card__desc-line">{{ cleanRuleMap[key].label }} {{ cleanRuleMap[key].unit }}</div>
                      </div>
                    </div>
                  </div>

                  <div class="clean-rule-actions">
                    <button class="btn-outline btn-outline--orange" @click="saveAutoCleanConfig" :disabled="saving">保存规则</button>
                    <button class="btn-outline btn-outline--orange" @click="runAutoClean" :disabled="saving">立即清理</button>
                  </div>
                </div>

                <div class="feature-card__stat">
                  今日：清理 <b class="orange">{{ currentAutoCleanCount }}</b> 个，节省 <b class="orange">{{ fmtMoney(totalCleanSaved) }}</b>
                </div>

                <!-- 操作与清理记录 -->
                <div class="feature-collapse">
                  <div class="feature-collapse__head" @click="cleanLogsExpanded = !cleanLogsExpanded">
                    <span>操作记录</span>
                    <svg class="feature-collapse__arrow" :class="{ open: cleanLogsExpanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="feature-collapse__body" v-show="cleanLogsExpanded">
                    <!-- 操作日志 -->
                    <div v-for="log in materialOpsLogs" :key="'ops-'+log.id" class="feature-log-item">
                      <div class="feature-log-head">
                        <span class="log-action-tag" :class="'action-' + log.action">{{ materialActionLabel(log.action) }}</span>
                        <span class="feature-log-time">{{ fmtTime(log.created_at) }}</span>
                      </div>
                      <div class="feature-log-reason">{{ log.action_detail }}</div>
                    </div>
                    <!-- 清理记录 -->
                    <div v-for="cl in materialCleanLogs" :key="'cl-'+cl.id" class="feature-log-item feature-log-item--clean">
                      <div class="feature-log-head">
                        <span class="log-action-tag action-clean_run">素材清理</span>
                        <span class="feature-log-time">{{ fmtTime(cl.created_at) }}</span>
                      </div>
                      <div class="feature-log-main">{{ cl.video_name || cl.material_id || '未命名素材' }}（{{ cl.ad_name || cl.ad_id || '计划' }}）</div>
                      <div class="feature-log-metrics">
                        消耗¥{{ parseFloat(cl.cost || 0).toFixed(0) }}
                        &nbsp;ROI {{ (cl.roi || 0).toFixed(2) }}
                        &nbsp;{{ cl.orders || 0 }}单
                      </div>
                      <div class="feature-log-reason">{{ cl.reason || '规则清理' }}</div>
                    </div>
                    <div v-if="!materialCleanLogs.length && !materialOpsLogs.length" class="empty-tip">暂无记录</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Tab3: 一键调速 -->
          <div v-show="drawerTab === 'boost'">
            <div class="feature-card feature-card--blue">
              <div class="feature-card__bar feature-card__bar--blue"></div>
              <div class="feature-card__body">
                <div class="feature-card__header">
                  <div class="feature-card__title-row">
                    <span class="feature-card__icon">&#9889;</span>
                    <span class="feature-card__title">一键调速</span>
                  </div>
                  <div class="feature-switch" :class="{ on: boostConfig.boost_enabled }" @click="boostConfig.boost_enabled = !boostConfig.boost_enabled; saveBoostConfig()">
                    <div class="feature-switch__thumb"></div>
                  </div>
                </div>
                <div class="feature-card__desc">ROI达到保底线自动开启调速加量，低于保底线自动关闭</div>

                <div class="feature-card__config" v-if="boostConfig.boost_enabled">
                  <!-- 巡检间隔 -->
                  <div class="clean-top-bar" style="background:#f0f7ff;border-left-color:#1677ff;margin-bottom:10px">
                    <span class="clean-top-label" style="color:#1677ff">巡检间隔</span>
                    <select v-model.number="boostConfig.boost_poll_interval" class="clean-rule-select">
                      <option :value="10">10分钟</option>
                      <option :value="20">20分钟</option>
                      <option :value="30">30分钟</option>
                      <option :value="60">1小时</option>
                      <option :value="120">2小时</option>
                      <option :value="360">6小时</option>
                      <option :value="720">12小时</option>
                      <option :value="1440">24小时</option>
                    </select>
                  </div>
                  <div class="boost-grid">
                    <div class="boost-item">
                      <span class="boost-label">保底ROI</span>
                      <input type="number" v-model.number="boostConfig.boost_min_roi" step="0.1" min="0" class="boost-input">
                    </div>
                    <div class="boost-item">
                      <span class="boost-label">调速预算（元）</span>
                      <input type="number" v-model.number="boostConfig.boost_budget" step="50" min="50" class="boost-input">
                    </div>
                    <div class="boost-item">
                      <span class="boost-label">调速时长（小时）</span>
                      <select v-model.number="boostConfig.boost_duration" class="boost-input">
                        <option :value="0.5">0.5小时</option>
                        <option :value="1">1小时</option>
                        <option :value="2">2小时</option>
                        <option :value="3">3小时</option>
                        <option :value="6">6小时</option>
                        <option :value="12">12小时</option>
                        <option :value="24">24小时</option>
                      </select>
                    </div>
                  </div>
                  <div class="boost-tip">启动投手后，巡检时自动判断：ROI ≥ {{ boostConfig.boost_min_roi }} 且有成交 → 开启调速；ROI &lt; {{ boostConfig.boost_min_roi }} → 自动关闭</div>
                  <div class="clean-rule-actions">
                    <button class="btn-outline btn-outline--blue" @click="saveBoostConfig" :disabled="saving">保存设置</button>
                  </div>
                </div>

                <div class="feature-card__stat">
                  启动投手后生效，巡检时自动根据ROI开启/关闭调速
                </div>

                <!-- 调速操作记录 -->
                <div class="feature-collapse">
                  <div class="feature-collapse__head" @click="boostLogsExpanded = !boostLogsExpanded">
                    <span>调速记录</span>
                    <svg class="feature-collapse__arrow" :class="{ open: boostLogsExpanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="feature-collapse__body" v-show="boostLogsExpanded">
                    <div v-for="log in boostLogs" :key="'boost-'+log.id" class="feature-log-item">
                      <div class="feature-log-head">
                        <span class="log-action-tag" :class="'action-' + log.action">{{ actionLabel(log.action) }}</span>
                        <span class="feature-log-time">{{ fmtTime(log.created_at) }}</span>
                      </div>
                      <div class="feature-log-main">{{ log.ad_name || log.ad_id || '系统操作' }}</div>
                      <div class="feature-log-metrics" v-if="log.cost > 0">
                        消耗¥{{ parseFloat(log.cost).toFixed(0) }}
                        &nbsp;ROI {{ log.roi }}
                        <span v-if="log.orders > 0">&nbsp;{{ log.orders }}单</span>
                      </div>
                      <div class="feature-log-reason">{{ log.action_detail }}</div>
                    </div>
                    <div v-if="!boostLogs.length" class="empty-tip">暂无调速记录，启动投手后会自动记录</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab4: 素材追投 -->
          <div v-show="drawerTab === 'matboost'">
            <div class="feature-card feature-card--purple">
              <div class="feature-card__bar feature-card__bar--purple"></div>
              <div class="feature-card__body">
                <div class="feature-card__header">
                  <div class="feature-card__title-row">
                    <span class="feature-card__icon">&#127942;</span>
                    <span class="feature-card__title">素材追投</span>
                  </div>
                  <div class="feature-switch" :class="{ on: matBoostConfig.mat_boost_enabled }" @click="matBoostConfig.mat_boost_enabled = !matBoostConfig.mat_boost_enabled; saveMatBoostConfig()">
                    <div class="feature-switch__thumb"></div>
                  </div>
                </div>
                <div class="feature-card__desc">自动识别优质素材并追加预算，让好素材跑更多量赚更多钱</div>

                <div class="feature-card__config" v-if="matBoostConfig.mat_boost_enabled">
                  <!-- 巡检间隔 -->
                  <div class="clean-top-bar" style="background:#f5f0ff;border-left-color:#7c3aed;margin-bottom:10px">
                    <span class="clean-top-label" style="color:#7c3aed">巡检间隔</span>
                    <select v-model.number="matBoostConfig.mat_boost_poll_interval" class="clean-rule-select">
                      <option :value="10">10分钟</option>
                      <option :value="20">20分钟</option>
                      <option :value="30">30分钟</option>
                      <option :value="60">1小时</option>
                      <option :value="120">2小时</option>
                      <option :value="360">6小时</option>
                      <option :value="720">12小时</option>
                    </select>
                  </div>

                  <!-- 追投预算和时长 -->
                  <div class="boost-grid" style="margin-bottom:12px">
                    <div class="boost-item">
                      <span class="boost-label">追投预算（元）</span>
                      <input type="number" v-model.number="matBoostConfig.mat_boost_budget" step="50" min="100" class="boost-input">
                    </div>
                    <div class="boost-item">
                      <span class="boost-label">追投时长（小时）</span>
                      <select v-model.number="matBoostConfig.mat_boost_duration" class="boost-input">
                        <option :value="1">1小时</option>
                        <option :value="2">2小时</option>
                        <option :value="3">3小时</option>
                        <option :value="6">6小时</option>
                        <option :value="12">12小时</option>
                        <option :value="24">24小时</option>
                      </select>
                    </div>
                  </div>

                  <!-- 追投规则（可拖拉组合） -->
                  <div class="sec-label" style="margin-bottom:8px;border-bottom:none;padding-bottom:0">
                    <span>追投规则 <span style="font-size:11px;color:#999;font-weight:400">（拖拽启用/停用）</span></span>
                  </div>

                  <div class="rule-zone rule-zone--active" :class="{ 'rule-zone--hover': dragOverZone === 'matboost-active' }"
                    @dragover.prevent="onDragOver($event, 'matboost-active')"
                    @dragleave="onDragLeave($event, 'matboost-active')"
                    @drop.prevent="onDrop($event, 'matboost-active')">
                    <div class="rule-zone__title">
                      <span class="rule-zone__dot rule-zone__dot--green"></span> 已启用
                      <span class="rule-zone__hint">素材同时满足以下条件才追投</span>
                    </div>
                    <div class="rule-grid" v-if="activeMatBoostRuleKeys.length">
                      <div v-for="key in activeMatBoostRuleKeys" :key="'mb-act-'+key"
                        class="rule-card rule-card--active rule-card--purple"
                        draggable="true"
                        @dragstart="onDragStart($event, key, 'matboost')"
                        @dragend="onDragEnd">
                        <div class="rule-card__top">
                          <span class="rule-card__handle">&#9776;</span>
                          <span class="rule-card__name">{{ matBoostRuleMap[key].name }}</span>
                        </div>
                        <div class="rule-card__desc">{{ matBoostRuleMap[key].desc }}</div>
                        <div class="rule-card__inputs">
                          <div class="rule-card__field">
                            <span class="rule-card__flabel">{{ matBoostRuleMap[key].label }}</span>
                            <input type="number" :step="matBoostRuleMap[key].step" :min="matBoostRuleMap[key].min"
                              v-model.number="matBoostRuleValues[key]" class="rule-input rule-input--sm">
                            <span v-if="matBoostRuleMap[key].unit" class="rule-card__flabel">{{ matBoostRuleMap[key].unit }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div v-else class="rule-zone__empty">拖入规则卡片</div>
                  </div>

                  <div class="rule-zone rule-zone--pool rule-zone--sm" :class="{ 'rule-zone--hover': dragOverZone === 'matboost-pool' }"
                    @dragover.prevent="onDragOver($event, 'matboost-pool')"
                    @dragleave="onDragLeave($event, 'matboost-pool')"
                    @drop.prevent="onDrop($event, 'matboost-pool')">
                    <div class="rule-zone__title">
                      <span class="rule-zone__dot rule-zone__dot--gray"></span> 未启用
                    </div>
                    <div class="rule-grid" v-if="poolMatBoostRuleKeys.length">
                      <div v-for="key in poolMatBoostRuleKeys" :key="'mb-pool-'+key"
                        class="rule-card rule-card--pool"
                        draggable="true"
                        @dragstart="onDragStart($event, key, 'matboost')"
                        @dragend="onDragEnd">
                        <div class="rule-card__top">
                          <span class="rule-card__handle">&#9776;</span>
                          <span class="rule-card__name">{{ matBoostRuleMap[key].name }}</span>
                        </div>
                        <div class="rule-card__desc">{{ matBoostRuleMap[key].desc }}</div>
                      </div>
                    </div>
                    <div v-else class="rule-zone__empty">所有规则已启用</div>
                  </div>

                  <div class="boost-tip" style="border-left-color:#7c3aed;background:#f5f0ff;margin-top:8px">
                    巡检时自动筛选：同时满足所有已启用规则的素材 → 为每个在投计划自动创建追投任务，追投预算¥{{ matBoostConfig.mat_boost_budget }}，时长{{ matBoostConfig.mat_boost_duration }}小时
                  </div>
                  <div class="clean-rule-actions">
                    <button class="btn-outline btn-outline--purple" @click="saveMatBoostConfig" :disabled="saving">保存设置</button>
                    <button class="btn-outline btn-outline--purple" @click="runMatBoostOnce" :disabled="saving" style="background:#f5f0ff">立即执行一次</button>
                  </div>
                </div>

                <div class="feature-card__stat">
                  启用后按巡检间隔自动识别爆款素材并追投
                </div>

                <!-- 追投记录 -->
                <div class="feature-collapse">
                  <div class="feature-collapse__head" @click="matBoostLogsExpanded = !matBoostLogsExpanded">
                    <span>追投记录</span>
                    <svg class="feature-collapse__arrow" :class="{ open: matBoostLogsExpanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="feature-collapse__body" v-show="matBoostLogsExpanded">
                    <div v-for="log in matBoostLogs" :key="'mb-'+log.id" class="feature-log-item">
                      <div class="feature-log-head">
                        <span class="log-action-tag" :class="log.ad_id ? 'action-mat_boost' : 'action-matboost_enable'">{{ log.ad_id ? '追投' : '配置' }}</span>
                        <span class="feature-log-time">{{ fmtTime(log.created_at) }}</span>
                      </div>
                      <template v-if="log.ad_id">
                        <div class="feature-log-main">{{ log.video_name || log.material_id }}</div>
                        <div class="feature-log-metrics">
                          计划: {{ log.ad_name }} &nbsp;|&nbsp;
                          消耗¥{{ parseFloat(log.cost || 0).toFixed(0) }}
                          &nbsp;ROI {{ log.roi }}
                          &nbsp;{{ log.orders }}单
                          <span v-if="log.ctr > 0">&nbsp;CTR {{ parseFloat(log.ctr).toFixed(2) }}%</span>
                          &nbsp;|&nbsp; 追投¥{{ parseFloat(log.budget || 0).toFixed(0) }}
                        </div>
                      </template>
                      <div class="feature-log-reason">{{ log.reason }}</div>
                    </div>
                    <div v-if="!matBoostLogs.length" class="empty-tip">暂无追投记录，启用后会自动记录</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========== 追投素材消耗数据 ========== -->
            <div class="feature-card feature-card--purple" style="margin-top:0">
              <div class="feature-card__bar feature-card__bar--purple"></div>
              <div class="feature-card__body">
                <div class="feature-card__header">
                  <div class="feature-card__title-row">
                    <span class="feature-card__icon">&#128640;</span>
                    <span class="feature-card__title">追投素材消耗数据</span>
                  </div>
                  <a-date-picker v-model:value="boostDate" size="small" :style="{width:'120px'}" :allowClear="true" placeholder="全部日期" @change="loadBoostEffect" />
                  <button class="btn-text" @click="loadBoostEffect">刷新</button>
                </div>
                <div class="feature-card__desc">每次追投的实际消耗数据（追投预算·消耗·ROI·转化）</div>
                <div v-if="boostEffectLoading" class="empty-tip">加载中...</div>
                <div class="boost-effect-list" v-else-if="boostEffectData.length">
                  <div v-for="(m, idx) in boostEffectData" :key="'be-'+idx" class="boost-effect-item" :class="{ 'is-closed': m.is_closed }">
                    <div class="boost-effect-head">
                      <span class="boost-effect-rank" :class="idx < 3 ? 'top' : ''">{{ idx + 1 }}</span>
                      <span class="boost-effect-name">{{ m.video_name || m.material_id }}</span>
                      <span v-if="m.is_closed" class="boost-effect-tag closed">已关闭</span>
                      <span v-else class="boost-effect-tag running">追投中</span>
                    </div>
                    <div class="boost-effect-metrics">
                      <div class="boost-effect-metric">
                        <span class="bem-label">追投预算</span>
                        <span class="bem-value">¥{{ parseFloat(m.budget||0).toFixed(0) }}</span>
                      </div>
                      <div class="boost-effect-metric">
                        <span class="bem-label">追投消耗</span>
                        <span class="bem-value">¥{{ m.cost.toFixed(0) }}</span>
                      </div>
                      <div class="boost-effect-metric">
                        <span class="bem-label">ROI</span>
                        <span class="bem-value" :class="m.roi>=2?'green':m.roi>0?'orange':''">{{ m.roi > 0 ? m.roi.toFixed(2) : '--' }}</span>
                      </div>
                      <div class="boost-effect-metric">
                        <span class="bem-label">CTR</span>
                        <span class="bem-value">{{ m.ctr > 0 ? m.ctr.toFixed(1)+'%' : '--' }}</span>
                      </div>
                      <div class="boost-effect-metric">
                        <span class="bem-label">转化数</span>
                        <span class="bem-value">{{ m.orders }}单</span>
                      </div>
                      <div class="boost-effect-metric">
                        <span class="bem-label">转化率</span>
                        <span class="bem-value">{{ m.convert_rate > 0 ? m.convert_rate.toFixed(1)+'%' : '--' }}</span>
                      </div>
                    </div>
                    <div class="boost-effect-plan">{{ m.ad_name }} · 追投于{{ fmtTime(m.boost_time) }}</div>
                  </div>
                </div>
                <div v-else class="empty-tip">暂无追投素材数据</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  embeddedAccount: { type: Object, default: null }
})

const accountList = ref([])
const statusList = ref([])
const loading = ref(false)
const drawerVisible = ref(false)
const currentAcc = ref({})
const saving = ref(false)
const running = ref(false)
const effectExpanded = ref(false)
const logs = ref([])
const drawerTab = ref('plan')
const config = ref({
  min_roi: 1.5, stop_roi: 0.8, min_cost: 100,
  poll_interval: 60, budget_multiply: 1.5, bid_up_pct: 5,
  bid_down_pct: 5, max_budget_multiply: 3, no_convert_minutes: 30, enabled: 0
})

// ===== 一键调速配置 =====
const boostConfig = ref({
  boost_enabled: false,
  boost_min_roi: 1.0,
  boost_budget: 200,
  boost_duration: 6,
  boost_poll_interval: 60
})
const boostLogs = ref([])
const boostLogsExpanded = ref(false)

// ===== 素材追投配置 =====
const matBoostConfig = ref({
  mat_boost_enabled: false,
  mat_boost_budget: 200,
  mat_boost_duration: 6,
  mat_boost_poll_interval: 60
})
const matBoostLogs = ref([])
const matBoostLogsExpanded = ref(false)
const boostDate = ref(dayjs())
const boostEffectData = ref([])
const boostEffectLoading = ref(false)
const matBoostEffectList = computed(() => {
  const logs = matBoostLogs.value.filter(l => l.ad_id && l.material_id)
  // 收集已关闭的task_id
  const closedTaskIds = new Set()
  logs.forEach(l => { if (l.reason && l.reason.includes('不达标关闭') && l.task_id) closedTaskIds.add(l.task_id) })
  // 给每条记录标记是否已关闭
  return logs.map(l => ({
    ...l,
    _closed: l.reason && l.reason.includes('不达标关闭'),
    _isClosed: l.task_id && closedTaskIds.has(l.task_id)
  }))
})

const matBoostRuleMap = {
  min_roi: { name: 'ROI达标', desc: '投产比高于此值', label: 'ROI ≥', value: 2.0, step: 0.1, min: 0, unit: '' },
  min_orders: { name: '转化达标', desc: '成交单数达到门槛', label: '成交 ≥', value: 5, step: 1, min: 0, unit: '单' },
  min_cost: { name: '消耗达标', desc: '有足够消耗验证效果', label: '消耗 ≥', value: 100, step: 10, min: 0, unit: '元' },
  min_ctr: { name: '点击率达标', desc: '用户点击意愿强', label: 'CTR ≥', value: 2.0, step: 0.1, min: 0, unit: '%' },
  min_show: { name: '曝光达标', desc: '有足够曝光量验证', label: '曝光 ≥', value: 1000, step: 100, min: 0, unit: '' },
  min_gpm: { name: 'GPM达标', desc: '千次曝光成交金额高', label: 'GPM ≥', value: 500, step: 50, min: 0, unit: '' }
}
const allMatBoostRuleKeys = Object.keys(matBoostRuleMap)
const activeMatBoostRuleKeys = ref(['min_roi', 'min_orders', 'min_cost'])
const poolMatBoostRuleKeys = computed(() => allMatBoostRuleKeys.filter(k => !activeMatBoostRuleKeys.value.includes(k)))
const matBoostRuleValues = ref({
  min_roi: 2.0, min_orders: 5, min_cost: 100, min_ctr: 2.0, min_show: 1000, min_gpm: 500
})

// ===== 素材效果排行 =====

// ===== 可配置规则拖拽 =====
const ruleMap = {
  min_roi: { name: '赚钱线（投产比）', desc: '高于此值自动加预算', configKey: 'min_roi', inputType: 'number', step: 0.1, min: 0 },
  stop_roi: { name: '亏钱线（投产比）', desc: '低于此值自动减预算', configKey: 'stop_roi', inputType: 'number', step: 0.1, min: 0 },
  min_cost: { name: '最少消耗（元）', desc: '花不到这个数不做判断', configKey: 'min_cost', inputType: 'number', step: 10, min: 0 },
  no_convert: { name: '多久没单就减预算', desc: '连续无成交自动减（分钟）', configKey: 'no_convert_minutes', inputType: 'minutes', step: 5, min: 10 },
  budget_multiply: { name: '放量倍数', desc: '赚钱时预算乘以几倍', configKey: 'budget_multiply', inputType: 'number', step: 0.1, min: 1, max: 5 },
  max_budget_multiply: { name: '预算上限（倍）', desc: '预算最多加到原来几倍', configKey: 'max_budget_multiply', inputType: 'number', step: 0.5, min: 1, max: 10 },
  bid_up_pct: { name: '加速力度（%）', desc: '数字越大跑量越快', configKey: 'bid_up_pct', inputType: 'number', step: 1, min: 0, max: 30 },
  bid_down_pct: { name: '刹车力度（%）', desc: '数字越大停得越快', configKey: 'bid_down_pct', inputType: 'number', step: 1, min: 0, max: 30 }
}
const allRuleKeys = Object.keys(ruleMap)
const activeRuleKeys = ref([...allRuleKeys])
const poolRuleKeys = computed(() => allRuleKeys.filter(k => !activeRuleKeys.value.includes(k)))

// ===== 差素材清理规则定义 =====
const cleanRuleMap = {
  min_cost: { name: '消耗过低', desc: '消耗低于此金额判为差素材', configKey: 'material_clean_min_cost', label: '消耗 <', unit: '元' },
  bad_roi: { name: 'ROI过低', desc: 'ROI低于此值判为差素材', configKey: 'material_clean_bad_roi', label: 'ROI <', unit: '' },
  low_order: { name: '成交过少', desc: '成交低于此值判为差素材', configKey: 'material_clean_min_orders', label: '成交 ≤', unit: '单' },
  min_show: { name: '曝光过低', desc: '曝光低于此量判为差素材', configKey: 'material_clean_min_show', label: '曝光 <', unit: '' },
  low_ctr: { name: '点击率低', desc: '点击率低于此值判为差素材', configKey: 'material_clean_min_ctr', label: '点击率 <', unit: '%' }
}
const allCleanRuleKeys = Object.keys(cleanRuleMap)
const activeCleanRuleKeys = ref([...allCleanRuleKeys])
const poolCleanRuleKeys = computed(() => allCleanRuleKeys.filter(k => !activeCleanRuleKeys.value.includes(k)))

// ===== 通用拖拽逻辑 =====
const dragOverZone = ref('')
let dragKey = ''
let dragGroup = '' // 'rule' or 'clean'

const onDragStart = (e, key, group) => {
  dragKey = key
  dragGroup = group || 'rule'
  e.dataTransfer.effectAllowed = 'move'
  e.target.classList.add('rule-card--dragging')
}
const onDragEnd = (e) => {
  e.target.classList.remove('rule-card--dragging')
  dragOverZone.value = ''
}
const onDragOver = (e, zone) => {
  dragOverZone.value = zone
  e.dataTransfer.dropEffect = 'move'
}
const onDragLeave = (e, zone) => {
  if (!e.currentTarget.contains(e.relatedTarget)) dragOverZone.value = ''
}
const onDrop = (e, zone) => {
  dragOverZone.value = ''
  if (!dragKey) return
  const arr = dragGroup === 'matboost' ? activeMatBoostRuleKeys : dragGroup === 'clean' ? activeCleanRuleKeys : activeRuleKeys
  const idx = arr.value.indexOf(dragKey)
  if (zone.endsWith('active') && idx === -1) {
    arr.value.push(dragKey)
  } else if (zone.endsWith('pool') && idx !== -1) {
    arr.value.splice(idx, 1)
  }
  dragKey = ''
  dragGroup = ''
}

// ===== 差素材自动清理 =====
const materialCleanLogs = ref([])
const cleanLogsExpanded = ref(false)
const autoCleanConfig = ref({
  material_auto_clean_enabled: false,
  material_clean_min_cost: 50,
  material_clean_bad_roi: 0.5,
  material_clean_min_show: 5000,
  material_clean_days: 3,
  material_clean_min_orders: 0,
  material_clean_min_ctr: 0.5
})

// Computed aggregates
const hasAnyFeature = (aid) => {
  const s = getStatus(aid)
  return s && (s.enabled || s.material_auto_clean_enabled || s.boost_enabled || s.mat_boost_enabled)
}
const runningCount = computed(() => statusList.value.filter(s => s.enabled || s.material_auto_clean_enabled || s.boost_enabled || s.mat_boost_enabled).length)
const totalScaleUp = computed(() => statusList.value.reduce((a, s) => a + (s.today_scale_up || 0), 0))
const totalScaleDown = computed(() => statusList.value.reduce((a, s) => a + (s.today_scale_down || 0), 0))
const totalScaleUpTimes = computed(() => statusList.value.reduce((a, s) => a + (s.today_scale_up_times || 0), 0))
const totalScaleDownTimes = computed(() => statusList.value.reduce((a, s) => a + (s.today_scale_down_times || 0), 0))
const totalCost = computed(() => statusList.value.reduce((a, s) => a + parseFloat(s.today_cost || 0), 0))
const totalGmv = computed(() => statusList.value.reduce((a, s) => a + parseFloat(s.today_gmv || 0), 0))
const overallRoi = computed(() => totalCost.value > 0 ? totalGmv.value / totalCost.value : 0)
const avgPollInterval = computed(() => {
  const enabled = statusList.value.filter(s => s.enabled)
  if (!enabled.length) return '未设置'
  const avg = Math.round(enabled.reduce((a, s) => a + (s.poll_interval || 60), 0) / enabled.length)
  if (avg >= 60) return (avg / 60) + '小时'
  return avg + '分钟'
})
const latestRun = computed(() => {
  const times = statusList.value.filter(s => s.last_run).map(s => new Date(s.last_run).getTime())
  return times.length ? fmtTime(new Date(Math.max(...times))) : ''
})

const currentStats = computed(() => {
  const s = getStatus(currentAcc.value?.advertiser_id)
  return { cost: s?.today_cost || 0, gmv: s?.today_gmv || 0 }
})

// ===== 新增 computed: overview 汇总 =====
const totalAutoClean = computed(() => statusList.value.reduce((a, s) => a + (s.today_auto_clean_count || 0), 0))
const totalBoostCount = computed(() => statusList.value.reduce((a, s) => a + (s.today_boost_count || 0), 0))
const totalMatBoostCount = computed(() => statusList.value.reduce((a, s) => a + (s.today_mat_boost_count || 0), 0))
const featureCount = (key) => statusList.value.filter(s => s[key]).length

// 当前账户的今日统计
const currentAutoCleanCount = computed(() => {
  const s = getStatus(currentAcc.value?.advertiser_id)
  return s?.today_auto_clean_count || 0
})
const cleanDateRange = computed(() => {
  const d = autoCleanConfig.value.material_clean_days || 3
  const end = new Date(); end.setDate(end.getDate() - d)
  const start = new Date(); start.setDate(start.getDate() - d - 29)
  const fmt = (dt) => `${dt.getMonth()+1}/${dt.getDate()}`
  return `${fmt(start)}-${fmt(end)}`
})
const cleanProtectRange = computed(() => {
  const d = autoCleanConfig.value.material_clean_days || 3
  const start = new Date(); start.setDate(start.getDate() - d + 1)
  const fmt = (dt) => `${dt.getMonth()+1}/${dt.getDate()}`
  return `${fmt(start)}-今天`
})

// 清理节省金额 = 清理记录中所有素材的消耗总和
const totalCleanSaved = computed(() => {
  return materialCleanLogs.value.reduce((a, cl) => a + parseFloat(cl.cost || 0), 0)
})

// Helpers
const getStatus = (aid) => statusList.value.find(s => s.advertiser_id === String(aid))
const avatarColor = (id) => ['#1677FF', '#3B82F6', '#0958D9', '#4096FF', '#69B1FF', '#1890FF'][parseInt(id) % 6]
const actionLabel = (a) => ({ scale_up: '加大投放', scale_down: '减少花费', stop_scale: '暂停', hold: '继续观察', boost_on: '开启调速', boost_off: '关闭调速', boost_enable: '启用调速', boost_disable: '关闭调速' })[a] || a
const fmtTime = (t) => t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const fmtMoney = (v) => {
  if (!v || v == 0) return '¥0'
  const n = Number(v)
  if (n >= 10000) return '¥' + (n / 10000).toFixed(2) + '万'
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Data loading
onMounted(async () => {
  if (props.embedded && props.embeddedAccount) {
    // 嵌入模式：直接打开指定账户
    await loadStatus()
    openDrawer(props.embeddedAccount)
    return
  }
  loading.value = true
  try {
    const r = await request.get('/accounts')
    accountList.value = r.data?.list || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
  loadStatus()
})

// 嵌入模式下，外部账户变化时自动切换
watch(() => props.embeddedAccount, (newAcc) => {
  if (props.embedded && newAcc?.advertiser_id) {
    openDrawer(newAcc)
  }
})

const loadStatus = async () => {
  try {
    const r = await request.get('/ai-pitcher/status')
    statusList.value = r.data || []
  } catch (e) { console.error(e) }
}

const openDrawer = async (acc) => {
  currentAcc.value = acc
  drawerVisible.value = true
  drawerTab.value = 'plan'
  config.value = {
    min_roi: 1.5, stop_roi: 0.8, min_cost: 100,
    poll_interval: 60, budget_multiply: 1.5, bid_up_pct: 5,
    bid_down_pct: 5, max_budget_multiply: 3, no_convert_minutes: 30, enabled: 0
  }
  activeRuleKeys.value = [...allRuleKeys] // 默认全部启用
  logs.value = []
  // 重置调速配置
  boostConfig.value = { boost_enabled: false, boost_min_roi: 1.0, boost_budget: 200, boost_duration: 6, boost_poll_interval: 60 }
  boostLogs.value = []
  boostLogsExpanded.value = false
  // 重置新增功能状态
  materialCleanLogs.value = []
  cleanLogsExpanded.value = false
  autoCleanConfig.value = {
    material_auto_clean_enabled: false,
    material_clean_min_cost: 50,
    material_clean_bad_roi: 0.5,
    material_clean_min_show: 5000,
    material_clean_days: 3,
    material_clean_min_orders: 0,
    material_clean_min_ctr: 0.5
  }

  // 重置素材追投
  matBoostConfig.value = { mat_boost_enabled: false, mat_boost_budget: 200, mat_boost_duration: 6, mat_boost_poll_interval: 60 }
  matBoostLogs.value = []
  matBoostLogsExpanded.value = false
  activeMatBoostRuleKeys.value = ['min_roi', 'min_orders', 'min_cost']
  matBoostRuleValues.value = { min_roi: 2.0, min_orders: 5, min_cost: 100, min_ctr: 2.0, min_show: 1000, min_gpm: 500 }

  try {
    const r = await request.get('/ai-pitcher/config/' + acc.advertiser_id)
    if (r.data) {
      config.value = { ...config.value, ...r.data }
      // 还原已启用规则
      if (r.data.enabled_rules) {
        const saved = r.data.enabled_rules.split(',').filter(k => allRuleKeys.includes(k))
        activeRuleKeys.value = saved.length ? saved : [...allRuleKeys]
      }
      // Load auto clean config
      if (r.data.material_auto_clean_enabled !== undefined) autoCleanConfig.value.material_auto_clean_enabled = !!r.data.material_auto_clean_enabled
      if (r.data.material_clean_min_cost !== undefined) autoCleanConfig.value.material_clean_min_cost = r.data.material_clean_min_cost
      if (r.data.material_clean_bad_roi !== undefined) autoCleanConfig.value.material_clean_bad_roi = r.data.material_clean_bad_roi
      if (r.data.material_clean_min_show !== undefined) autoCleanConfig.value.material_clean_min_show = r.data.material_clean_min_show
      if (r.data.material_clean_days !== undefined) autoCleanConfig.value.material_clean_days = r.data.material_clean_days
      if (r.data.material_clean_min_orders !== undefined) autoCleanConfig.value.material_clean_min_orders = r.data.material_clean_min_orders
      if (r.data.material_clean_min_ctr !== undefined) autoCleanConfig.value.material_clean_min_ctr = r.data.material_clean_min_ctr
      // 恢复清理规则启用状态
      if (r.data.clean_enabled_rules) {
        activeCleanRuleKeys.value = r.data.clean_enabled_rules.split(',').filter(k => cleanRuleMap[k])
      }
      // Load boost config
      if (r.data.boost_enabled !== undefined) boostConfig.value.boost_enabled = !!r.data.boost_enabled
      if (r.data.boost_min_roi !== undefined) boostConfig.value.boost_min_roi = parseFloat(r.data.boost_min_roi)
      if (r.data.boost_budget !== undefined) boostConfig.value.boost_budget = parseFloat(r.data.boost_budget)
      if (r.data.boost_duration !== undefined) boostConfig.value.boost_duration = parseFloat(r.data.boost_duration)
      if (r.data.boost_poll_interval !== undefined) boostConfig.value.boost_poll_interval = parseInt(r.data.boost_poll_interval)
      // Load mat boost config
      if (r.data.mat_boost_enabled !== undefined) matBoostConfig.value.mat_boost_enabled = !!r.data.mat_boost_enabled
      if (r.data.mat_boost_budget !== undefined) matBoostConfig.value.mat_boost_budget = parseFloat(r.data.mat_boost_budget)
      if (r.data.mat_boost_duration !== undefined) matBoostConfig.value.mat_boost_duration = parseFloat(r.data.mat_boost_duration)
      if (r.data.mat_boost_poll_interval !== undefined) matBoostConfig.value.mat_boost_poll_interval = parseInt(r.data.mat_boost_poll_interval)
      if (r.data.mat_boost_rules) {
        try {
          const savedRules = typeof r.data.mat_boost_rules === 'string' ? JSON.parse(r.data.mat_boost_rules) : r.data.mat_boost_rules
          if (Array.isArray(savedRules)) {
            activeMatBoostRuleKeys.value = savedRules.filter(r => r.enabled).map(r => r.key)
            for (const rule of savedRules) {
              if (rule.key && rule.value !== undefined) matBoostRuleValues.value[rule.key] = rule.value
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) { console.error(e) }
  loadLogs()
  loadMaterialCleanLogs()
  loadMaterialOpsLogs()
  loadBoostLogs()
  loadMatBoostLogs()
    loadBoostEffect()
}

const saveConfig = async () => {
  saving.value = true
  try {
    const planData = { enabled_rules: activeRuleKeys.value.join(',') }
    await request.post('/ai-pitcher/config/' + currentAcc.value.advertiser_id, {
      ...config.value, ...planData, auto_start: false
    })
    Object.assign(config.value, planData)
  } catch (e) { console.error(e) }
  finally { saving.value = false; loadStatus() }
}

const saveBoostConfig = async () => {
  saving.value = true
  try {
    const boostData = {
      boost_enabled: boostConfig.value.boost_enabled ? 1 : 0,
      boost_min_roi: boostConfig.value.boost_min_roi,
      boost_budget: boostConfig.value.boost_budget,
      boost_duration: boostConfig.value.boost_duration,
      boost_poll_interval: boostConfig.value.boost_poll_interval
    }
    await request.post('/ai-pitcher/config/' + currentAcc.value.advertiser_id, {
      ...config.value, ...boostData, auto_start: false
    })
    Object.assign(config.value, boostData)
    // 写操作日志
    const status = boostConfig.value.boost_enabled ? '已启用' : '已关闭'
    const detail = `${status}一键调速，保底ROI=${boostConfig.value.boost_min_roi}，预算${boostConfig.value.boost_budget}元，时长${boostConfig.value.boost_duration}小时，巡检${boostConfig.value.boost_poll_interval}分钟`
    await request.post('/ai-pitcher/material-ops-log/' + currentAcc.value.advertiser_id, {
      action: boostConfig.value.boost_enabled ? 'boost_enable' : 'boost_disable',
      detail
    }).catch(() => {})
    loadBoostLogs()
  } catch (e) { console.error(e) }
  finally { saving.value = false; loadStatus() }
}

const startPitcher = async () => {
  saving.value = true
  try {
    await request.post('/ai-pitcher/start/' + currentAcc.value.advertiser_id)
    config.value.enabled = 1
    loadStatus(); loadLogs()
  } catch (e) { console.error(e) }
  finally { saving.value = false }
}

const stopPitcher = async () => {
  saving.value = true
  try {
    await request.post('/ai-pitcher/stop/' + currentAcc.value.advertiser_id)
    config.value.enabled = 0
    loadStatus(); loadLogs()
  } catch (e) { console.error(e) }
  finally { saving.value = false }
}

const loadLogs = async () => {
  if (!currentAcc.value?.advertiser_id) return
  try {
    const r = await request.get('/ai-pitcher/logs/' + currentAcc.value.advertiser_id)
    logs.value = r.data?.list || []
  } catch (e) { console.error(e) }
}

const runOnce = async () => {
  running.value = true
  try {
    const r = await request.post('/ai-pitcher/run-once/' + currentAcc.value.advertiser_id)
    loadLogs(); loadStatus()
  } catch (e) { console.error(e) }
  finally { running.value = false }
}

// ===== 差素材自动清理 =====
const loadMaterialCleanLogs = async () => {
  if (!currentAcc.value?.advertiser_id) return
  try {
    const r = await request.get('/ai-pitcher/material-clean-logs/' + currentAcc.value.advertiser_id)
    materialCleanLogs.value = r.data?.list || r.data || []
  } catch (e) { console.error(e) }
}

const saveAutoCleanConfig = async () => {
  saving.value = true
  try {
    const cleanData = {
      material_auto_clean_enabled: autoCleanConfig.value.material_auto_clean_enabled ? 1 : 0,
      material_clean_min_cost: autoCleanConfig.value.material_clean_min_cost,
      material_clean_bad_roi: autoCleanConfig.value.material_clean_bad_roi,
      material_clean_min_show: autoCleanConfig.value.material_clean_min_show,
      material_clean_days: autoCleanConfig.value.material_clean_days,
      material_clean_min_orders: autoCleanConfig.value.material_clean_min_orders,
      material_clean_min_ctr: autoCleanConfig.value.material_clean_min_ctr,
      clean_enabled_rules: activeCleanRuleKeys.value.join(',')
    }
    await request.post('/ai-pitcher/config/' + currentAcc.value.advertiser_id, {
      ...config.value, ...cleanData, auto_start: false
    })
    // 同步config.value防止其他tab保存时覆盖
    Object.assign(config.value, cleanData)
    // 写操作日志
    const status = autoCleanConfig.value.material_auto_clean_enabled ? '已启用' : '已关闭'
    const rulesDesc = activeCleanRuleKeys.value.map(k => `${cleanRuleMap[k].label}${autoCleanConfig.value[cleanRuleMap[k].configKey]}${cleanRuleMap[k].unit}`).join(' ')
    const detail = `${status}差素材清理，前${autoCleanConfig.value.material_clean_days}天，${rulesDesc}`
    await request.post('/ai-pitcher/material-ops-log/' + currentAcc.value.advertiser_id, {
      action: autoCleanConfig.value.material_auto_clean_enabled ? 'clean_enable' : 'clean_disable',
      detail
    }).catch(() => {})
    loadMaterialOpsLogs()
  } catch (e) { console.error(e) }
  finally { saving.value = false; loadStatus() }
}

const runAutoClean = async () => {
  saving.value = true
  try {
    const r = await request.post('/ai-pitcher/material-auto-clean/' + currentAcc.value.advertiser_id)
    const d = r.data || {}
    const count = d.clean_count || 0
    // 写操作日志
    await request.post('/ai-pitcher/material-ops-log/' + currentAcc.value.advertiser_id, {
      action: 'clean_run',
      detail: `手动执行清理，清理了${count}个差素材`
    }).catch(() => {})
    loadMaterialCleanLogs()
    loadMaterialOpsLogs()
    loadStatus()
  } catch (e) { console.error(e) }
  finally { saving.value = false }
}

// ===== 素材操作记录 =====
const materialOpsLogs = ref([])
const loadMaterialOpsLogs = async () => {
  if (!currentAcc.value?.advertiser_id) return
  try {
    const r = await request.get('/ai-pitcher/material-ops-logs/' + currentAcc.value.advertiser_id)
    materialOpsLogs.value = r.data?.list || []
  } catch (e) { console.error(e) }
}

const loadBoostLogs = async () => {
  if (!currentAcc.value?.advertiser_id) return
  try {
    const r = await request.get('/ai-pitcher/logs/' + currentAcc.value.advertiser_id + '?action=boost_on,boost_off,boost_enable,boost_disable')
    boostLogs.value = r.data?.list || []
  } catch (e) { console.error(e) }
}

// ===== 素材追投 =====
const loadMatBoostLogs = async () => {
  if (!currentAcc.value?.advertiser_id) return
  try {
    const r = await request.get('/ai-pitcher/material-boost-logs/' + currentAcc.value.advertiser_id)
    matBoostLogs.value = r.data?.list || []
  } catch (e) { console.error(e) }
}


const loadBoostEffect = async () => {
  if (!currentAcc.value?.advertiser_id) return
  boostEffectLoading.value = true
  try {
    const params = {};
    if (boostDate.value) params.date = boostDate.value.format('YYYY-MM-DD');
    const r = await request.get('/ai-pitcher/material-boost-effect/' + currentAcc.value.advertiser_id, { params })
    boostEffectData.value = r.data?.list || []
  } catch (e) { console.error(e) }
  finally { boostEffectLoading.value = false }
}

const saveMatBoostConfig = async () => {
  saving.value = true
  try {
    // 构建规则JSON
    const rules = allMatBoostRuleKeys.map(key => ({
      key,
      enabled: activeMatBoostRuleKeys.value.includes(key),
      value: matBoostRuleValues.value[key]
    }))
    const mbData = {
      mat_boost_enabled: matBoostConfig.value.mat_boost_enabled ? 1 : 0,
      mat_boost_budget: matBoostConfig.value.mat_boost_budget,
      mat_boost_duration: matBoostConfig.value.mat_boost_duration,
      mat_boost_poll_interval: matBoostConfig.value.mat_boost_poll_interval,
      mat_boost_rules: JSON.stringify(rules)
    }
    await request.post('/ai-pitcher/config/' + currentAcc.value.advertiser_id, {
      ...config.value, ...mbData, auto_start: false
    })
    Object.assign(config.value, mbData)
    const status = matBoostConfig.value.mat_boost_enabled ? '已启用' : '已关闭'
    const activeNames = activeMatBoostRuleKeys.value.map(k => matBoostRuleMap[k]?.name).join('+')
    // 写入追投日志表，直接显示在记录里
    await request.post('/ai-pitcher/material-boost-config-log/' + currentAcc.value.advertiser_id, {
      action: matBoostConfig.value.mat_boost_enabled ? 'enable' : 'disable',
      detail: `${status}素材追投，规则:${activeNames}，预算¥${matBoostConfig.value.mat_boost_budget}，时长${matBoostConfig.value.mat_boost_duration}h，间隔${matBoostConfig.value.mat_boost_poll_interval}分钟`
    }).catch(() => {})
    matBoostLogsExpanded.value = true
    await loadMatBoostLogs()
    loadBoostEffect()
  } catch (e) { console.error(e) }
  finally { saving.value = false; loadStatus() }
}

const runMatBoostOnce = async () => {
  saving.value = true
  try {
    // 先保存最新规则
    const rules = allMatBoostRuleKeys.map(key => ({
      key,
      enabled: activeMatBoostRuleKeys.value.includes(key),
      value: matBoostRuleValues.value[key]
    }))
    const mbData2 = {
      mat_boost_enabled: matBoostConfig.value.mat_boost_enabled ? 1 : 0,
      mat_boost_budget: matBoostConfig.value.mat_boost_budget,
      mat_boost_duration: matBoostConfig.value.mat_boost_duration,
      mat_boost_poll_interval: matBoostConfig.value.mat_boost_poll_interval,
      mat_boost_rules: JSON.stringify(rules)
    }
    await request.post('/ai-pitcher/config/' + currentAcc.value.advertiser_id, {
      ...config.value, ...mbData2, auto_start: false
    })
    Object.assign(config.value, mbData2)
    await request.post('/ai-pitcher/run-material-boost/' + currentAcc.value.advertiser_id)
    matBoostLogsExpanded.value = true
    await loadMatBoostLogs()
    loadBoostEffect()
  } catch (e) { console.error(e) }
  finally { saving.value = false }
}

const materialActionLabel = (a) => ({
  clean_enable: '启用清理', clean_disable: '关闭清理', clean_run: '手动清理', clean_auto: '自动清理'
})[a] || a
</script>

<style scoped>
.page { padding: 0; box-sizing: border-box; }

/* ===== Overview ===== */
.overview {
  background: linear-gradient(135deg, #1a56db 0%, #3b82f6 50%, #60a5fa 100%);
  color: #fff; padding: 20px 20px 16px; border-radius: 0 0 16px 16px;
  max-width: 100%;
}
.overview-header { margin-bottom: 16px; }
.overview-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
.overview-desc { font-size: 12px; opacity: 0.8; margin: 0; }
/* 核心数据行 */
.ov-stats {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.12); backdrop-filter: blur(8px);
  border-radius: 12px; padding: 16px 12px; margin-bottom: 12px;
}
.ov-stat { flex: 1; text-align: center; }
.ov-stat__val { font-size: 22px; font-weight: 700; line-height: 1.2; }
.ov-stat__val.val-green { color: #86efac; }
.ov-stat__val.val-orange { color: #fdba74; }
.ov-stat__unit { font-size: 13px; font-weight: 400; opacity: 0.7; }
.ov-stat__label { font-size: 11px; opacity: 0.7; margin-top: 3px; }
.ov-stat__divider { width: 1px; height: 28px; background: rgba(255,255,255,0.2); flex-shrink: 0; }
/* 4大功能状态 */
.ov-features {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
}
.ov-feat {
  background: rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 8px;
  display: flex; align-items: center; gap: 8px; transition: all 0.2s;
  opacity: 0.55;
}
.ov-feat--active { background: rgba(255,255,255,0.18); opacity: 1; }
.ov-feat__icon {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.15); color: #fff;
}
.ov-feat--active .ov-feat__icon { background: rgba(255,255,255,0.25); }
.ov-feat__body { min-width: 0; }
.ov-feat__name { font-size: 11px; opacity: 0.8; white-space: nowrap; }
.ov-feat__data { font-size: 12px; font-weight: 600; margin-top: 2px; white-space: nowrap; }
.ov-feat__num { font-size: 16px; font-weight: 700; margin-right: 2px; }
.ov-feat__num.green { color: #86efac; }
.ov-feat__num.red { color: #fca5a5; }
.ov-feat__num.orange { color: #fdba74; }
.ov-feat__num.purple { color: #c4b5fd; }
.ov-time { font-size: 11px; opacity: 0.5; text-align: right; margin-top: 8px; }

/* ===== Account Table ===== */
.acc-section {
  background: #fff; margin: 12px; border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden;
}
.acc-section-title {
  font-size: 15px; font-weight: 700; color: #1f2937; padding: 14px 16px 0;
}
.acc-section-hint { font-size: 11px; color: #999; font-weight: 400; margin-left: 8px; }
.acc-table-header {
  display: flex; align-items: center; padding: 10px 14px;
  background: #fafbfc; border-bottom: 1px solid #f0f0f0;
  font-size: 11px; color: #999; font-weight: 500; margin-top: 8px;
}
.acc-table-row {
  display: flex; align-items: center; padding: 12px 14px;
  border-bottom: 1px solid #f5f5f5; cursor: pointer; transition: background 0.15s;
}
.acc-table-row:hover { background: #fafbfc; }
.acc-table-row:last-child { border-bottom: none; }
.col-info { flex: 2.5; display: flex; align-items: center; gap: 10px; min-width: 0; }
.col-val { flex: 1; text-align: center; font-size: 13px; font-weight: 600; }
.col-val.blue { color: #1677ff; }
.col-val.orange { color: #fa8c16; }
.col-val.green { color: #52c41a; }
.col-val.red { color: #ff4d4f; }
.col-status { flex: 1; display: flex; justify-content: center; }
.acc-avatar {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700;
}
.acc-text { min-width: 0; }
.acc-name { font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acc-sub { font-size: 11px; color: #999; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 10px;
}
.badge.on { background: #f0fdf4; color: #16a34a; }
.badge.off { background: #f3f4f6; color: #9ca3af; }
.feat-tag { display: inline-block; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin: 1px 2px; font-weight: 500; }
.feat-tag--blue { background: #eff6ff; color: #1d4ed8; }
.feat-tag--orange { background: #fff7ed; color: #c2410c; }
.feat-tag--green { background: #f0fdf4; color: #15803d; }
.feat-tag--purple { background: #f5f0ff; color: #7c3aed; }
.dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block;
}
.badge.on .dot { background: #16a34a; box-shadow: 0 0 4px #16a34a; }
.badge.off .dot { background: #d1d5db; }
.empty-state { text-align: center; padding: 32px 16px; color: #999; font-size: 13px; }
.loading-dots { display: flex; gap: 6px; justify-content: center; }
.loading-dots span {
  width: 8px; height: 8px; border-radius: 50%; background: #1677ff;
  animation: dotPulse 1.2s infinite ease-in-out;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

/* ===== Drawer ===== */
.drawer-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  z-index: 1000; display: flex; justify-content: flex-end;
}
.drawer {
  width: 90%; max-width: 520px; height: 100%; background: #f5f6fa;
  display: flex; flex-direction: column; animation: slideIn 0.25s ease;
}
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px; background: #fff; border-bottom: 1px solid #f0f0f0;
}
.dh-left { display: flex; align-items: center; gap: 10px; }
.dh-avatar {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700;
}
.dh-name { font-size: 15px; font-weight: 600; color: #1f2937; }
.dh-id { font-size: 11px; color: #999; }
.dh-close { font-size: 24px; color: #999; cursor: pointer; padding: 4px 8px; line-height: 1; }
.dh-close:hover { color: #333; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; -webkit-overflow-scrolling: touch; }

/* ===== Drawer Tabs ===== */
.drawer-tabs {
  display: flex; gap: 0; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb;
}
.drawer-tab {
  padding: 10px 20px; font-size: 14px; font-weight: 500; color: #999;
  cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s;
  user-select: none;
}
.drawer-tab:hover { color: #666; }
.drawer-tab.active {
  color: #1677ff; border-bottom-color: #1677ff; font-weight: 600;
}

/* ===== Hero Row ===== */
.hero-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.hero-card {
  background: #fff; border-radius: 10px; padding: 12px 10px; text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.hero-label { font-size: 11px; color: #999; margin-bottom: 4px; }
.hero-val { font-size: 16px; font-weight: 700; color: #1f2937; }
.c-on { border-top: 3px solid #52c41a; }
.c-on .hero-val { color: #16a34a; }
.c-off { border-top: 3px solid #d1d5db; }
.c-off .hero-val { color: #9ca3af; }
.c-cost { border-top: 3px solid #fa8c16; }
.c-cost .hero-val { color: #d97706; }
.c-gmv { border-top: 3px solid #1677ff; }
.c-gmv .hero-val { color: #1677ff; }
.c-action {
  display: flex; flex-direction: column; gap: 6px; justify-content: center;
  padding: 8px;
}

/* ===== Strategy Info ===== */
.strategy-info { margin-bottom: 16px; }
.strategy-info__item {
  padding: 8px 12px; border-radius: 6px; font-size: 12px;
  line-height: 1.6; color: #374151; margin-bottom: 6px;
}
.si-up { background: #f0fdf4; border-left: 3px solid #52c41a; }
.si-down { background: #fef2f2; border-left: 3px solid #ff4d4f; }
.strategy-info__item strong { color: #1f2937; }
.strategy-info__item em { font-style: normal; color: #1677ff; font-weight: 600; }

/* ===== Buttons ===== */
.btn-primary {
  padding: 7px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
  background: #1677ff; color: #fff; cursor: pointer; transition: 0.2s;
}
.btn-primary:hover { background: #0958d9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
  padding: 7px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
  background: #ff4d4f; color: #fff; cursor: pointer; transition: 0.2s;
}
.btn-danger:hover { background: #d9363e; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-run {
  padding: 6px 12px; border: 1px solid #52c41a; border-radius: 6px; font-size: 11px;
  background: #f6ffed; color: #52c41a; cursor: pointer; font-weight: 500; transition: 0.2s;
}
.btn-run:hover { background: #52c41a; color: #fff; }
.btn-run:disabled { opacity: 0.5; cursor: not-allowed; border-color: #d9d9d9; color: #999; background: #fafafa; }
.btn-save {
  padding: 4px 12px; border: 1px solid #1677ff; border-radius: 4px; font-size: 11px;
  background: #fff; color: #1677ff; cursor: pointer; font-weight: 500;
}
.btn-save:hover { background: #1677ff; color: #fff; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-text {
  border: none; background: none; color: #1677ff; font-size: 12px; cursor: pointer; font-weight: 500;
}

/* ===== Section Label ===== */
.sec-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 10px;
  padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;
}

/* ===== Config Group (分组列表) ===== */
.cfg-group {
  background: #fff; border-radius: 10px; margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden;
}
.cfg-group__title {
  font-size: 12px; font-weight: 600; color: #1677ff; padding: 10px 14px 6px;
  border-bottom: 1px solid #f5f5f5;
}
.cfg-row {
  display: flex; align-items: center; padding: 10px 14px;
  border-bottom: 1px solid #f9fafb;
}
.cfg-row:last-child { border-bottom: none; }
.cfg-name {
  font-size: 13px; color: #333; font-weight: 500; white-space: nowrap; min-width: 120px;
}
.cfg-desc {
  flex: 1; font-size: 11px; color: #bbb; padding: 0 8px; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cfg-input {
  width: 90px; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 6px;
  font-size: 13px; text-align: right; background: #fafbfc; box-sizing: border-box;
  flex-shrink: 0;
}
.cfg-input:focus {
  border-color: #1677ff; outline: none; background: #fff;
  box-shadow: 0 0 0 2px rgba(22,119,255,0.1);
}

/* ===== Rule Drag Zones ===== */
.rule-zone {
  border-radius: 8px; margin-bottom: 8px; padding: 8px;
  min-height: 40px; transition: all 0.2s;
}
.rule-zone--sm { padding: 6px; margin-bottom: 6px; min-height: 30px; }
.rule-zone--active {
  background: #f0fdf4; border: 2px dashed #bbf7d0;
}
.rule-zone--pool {
  background: #f9fafb; border: 2px dashed #e5e7eb;
}
.rule-zone--hover.rule-zone--active {
  border-color: #52c41a; background: #dcfce7;
}
.rule-zone--hover.rule-zone--pool {
  border-color: #9ca3af; background: #f3f4f6;
}
.rule-zone__title {
  font-size: 11px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 4px;
  margin-bottom: 6px;
}
.rule-zone__dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block;
}
.rule-zone__dot--green { background: #52c41a; }
.rule-zone__dot--gray { background: #d1d5db; }
.rule-zone__hint {
  font-size: 10px; color: #9ca3af; font-weight: 400; margin-left: auto;
}
.rule-zone__empty {
  text-align: center; padding: 10px; color: #9ca3af; font-size: 11px;
}
.rule-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;
}
.rule-card {
  padding: 8px 10px; border-radius: 8px; cursor: grab;
  transition: all 0.15s; user-select: none;
}
.rule-card--active {
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;
}
.rule-card--orange { border-left: 3px solid #fa8c16; }
.rule-card--purple { border-left: 3px solid #7c3aed; }
.rule-card--purple .rule-input:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124,58,237,0.1);
}
.rule-card--pool {
  background: #fff; border: 1px solid #f0f0f0; opacity: 0.65;
}
.rule-card--pool:hover { opacity: 1; }
.rule-card--dragging { opacity: 0.4; transform: scale(0.95); }
.rule-card:active { cursor: grabbing; }
.rule-card__top {
  display: flex; align-items: center; gap: 4px; margin-bottom: 3px;
}
.rule-card__handle {
  font-size: 11px; color: #d1d5db; flex-shrink: 0;
}
.rule-card__name { font-size: 12px; font-weight: 600; color: #333; }
.rule-card__desc { font-size: 10px; color: #9ca3af; line-height: 1.3; }
.rule-card__bottom {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
}
.rule-card__inputs {
  display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;
}
.rule-card__field {
  display: flex; align-items: center; gap: 3px;
}
.rule-card__flabel {
  font-size: 10px; color: #888; white-space: nowrap;
}
.rule-card__unit {
  font-size: 10px; color: #999; white-space: nowrap;
}
.rule-card__desc-line {
  font-size: 10px; color: #aaa; padding: 2px 0 0 24px;
}
.rule-input {
  width: 64px; padding: 4px 6px; border: 1px solid #e5e7eb; border-radius: 5px;
  font-size: 12px; text-align: right; background: #fafbfc; box-sizing: border-box;
}
.rule-input--sm { width: 56px; font-size: 11px; padding: 3px 5px; }
.rule-input:focus {
  border-color: #1677ff; outline: none; background: #fff;
  box-shadow: 0 0 0 2px rgba(22,119,255,0.1);
}
.rule-card--orange .rule-input:focus {
  border-color: #fa8c16;
  box-shadow: 0 0 0 2px rgba(250,140,22,0.1);
}
/* 清理统计天数顶栏 */
.clean-top-bar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
  padding: 6px 10px; background: #fff7e6; border-radius: 6px; border-left: 3px solid #fa8c16;
}
.clean-top-label {
  font-size: 11px; font-weight: 600; color: #d48806;
}
.clean-top-hint {
  font-size: 10px; color: #999; margin-left: 4px;
}

/* ===== Log Card ===== */
.log-card {
  background: #fff; border-radius: 10px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  max-height: 500px; overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.log-item {
  padding: 10px 14px; border-bottom: 1px solid #f9fafb;
  border-left: 3px solid transparent; transition: background 0.15s;
}
.log-item:hover { background: #fafbfc; }
.log-item:last-child { border-bottom: none; }
.log-scale_up { border-left-color: #52c41a; }
.log-scale_down { border-left-color: #ff4d4f; }
.log-stop_scale { border-left-color: #faad14; }
.log-hold { border-left-color: #d9d9d9; }
.log-item__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.log-action-tag {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
}
.action-scale_up { background: #f0fdf4; color: #16a34a; }
.action-scale_down { background: #fef2f2; color: #dc2626; }
.action-stop_scale { background: #fffbeb; color: #d97706; }
.action-hold { background: #f3f4f6; color: #6b7280; }
.action-clean_enable { background: #fff7ed; color: #ea580c; }
.action-clean_disable { background: #f3f4f6; color: #6b7280; }
.action-clean_run { background: #fef2f2; color: #dc2626; }
.action-clean_auto { background: #fffbeb; color: #d97706; }
.action-boost_on { background: #eff6ff; color: #1677ff; }
.action-boost_off { background: #f3f4f6; color: #6b7280; }
.action-boost_enable { background: #eff6ff; color: #1677ff; }
.action-boost_disable { background: #f3f4f6; color: #6b7280; }
.action-mat_boost { background: #f5f0ff; color: #7c3aed; }
.action-matboost_enable { background: #f5f0ff; color: #7c3aed; }
.action-matboost_disable { background: #f3f4f6; color: #6b7280; }
.log-clean_enable { border-left-color: #ea580c; }
.log-clean_disable { border-left-color: #d1d5db; }
.log-clean_run { border-left-color: #dc2626; }
.log-clean_auto { border-left-color: #d97706; }
.log-boost_on { border-left-color: #1677ff; }
.log-boost_off { border-left-color: #9ca3af; }
.log-boost_enable { border-left-color: #1677ff; }
.log-boost_disable { border-left-color: #9ca3af; }
.log-time { font-size: 11px; color: #9ca3af; }
.log-ad { font-size: 13px; font-weight: 500; color: #1f2937; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.log-metrics { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #6b7280; margin-bottom: 3px; }
.log-detail { font-size: 11px; color: #3b82f6; word-break: break-all; }
.empty-tip { text-align: center; padding: 32px 16px; color: #9ca3af; font-size: 13px; }

/* ===== Feature Card (差素材清理) ===== */
.feature-card {
  display: flex; border-radius: 10px; background: #fff; margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden;
}
.feature-card__bar {
  width: 4px; flex-shrink: 0;
}
.feature-card__bar--orange { background: #fa8c16; }
.feature-card__bar--blue { background: #1677ff; }
.feature-card__bar--purple { background: #7c3aed; }
.feature-card__body {
  flex: 1; padding: 14px 16px; min-width: 0;
}
.feature-card__header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
}
.feature-card__title-row {
  display: flex; align-items: center; gap: 6px;
}
.feature-card__icon { font-size: 18px; line-height: 1; }
.feature-card__title { font-size: 15px; font-weight: 700; color: #1f2937; }
.feature-card__desc {
  font-size: 12px; color: #888; line-height: 1.6; margin-bottom: 12px;
}

/* Feature switch */
.feature-switch {
  width: 44px; height: 24px; border-radius: 12px; background: #d1d5db;
  position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0;
}
.feature-switch.on { background: #52c41a; }
.feature-switch__thumb {
  width: 20px; height: 20px; border-radius: 50%; background: #fff;
  position: absolute; top: 2px; left: 2px; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.feature-switch.on .feature-switch__thumb { transform: translateX(20px); }

/* ===== 素材效果排行 ===== */
.ranking-summary {
  display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;
}
.ranking-tag {
  font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px;
}
.ranking-tag--hot { background: #fef2f2; color: #dc2626; }
.ranking-tag--healthy { background: #f0fdf4; color: #16a34a; }
.ranking-tag--observe { background: #f5f5f5; color: #6b7280; }
.ranking-tag--bad { background: #fffbeb; color: #d97706; }

.ranking-list {
  max-height: 400px; overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.ranking-item {
  padding: 10px; margin-bottom: 6px; border-radius: 8px;
  background: #fafbfc; border: 1px solid #f0f0f0; border-left: 3px solid #d1d5db;
}
.ranking-item--hot { border-left-color: #dc2626; background: #fef7f7; }
.ranking-item--healthy { border-left-color: #16a34a; background: #f7fdf9; }
.ranking-item--bad { border-left-color: #d97706; background: #fffdf7; }
.ranking-item__head {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.ranking-rank {
  width: 20px; height: 20px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 11px;
  font-weight: 700; flex-shrink: 0; color: #fff;
}
.rank-1 { background: linear-gradient(135deg, #f59e0b, #d97706); }
.rank-2 { background: linear-gradient(135deg, #9ca3af, #6b7280); }
.rank-3 { background: linear-gradient(135deg, #d97706, #b45309); }
.rank-n { background: #d1d5db; color: #666; }
.ranking-status-tag {
  font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px;
}
.rst--hot { background: #fecaca; color: #dc2626; }
.rst--healthy { background: #bbf7d0; color: #16a34a; }
.rst--observe { background: #e5e7eb; color: #6b7280; }
.rst--bad { background: #fde68a; color: #d97706; }
.ranking-name {
  font-size: 12px; font-weight: 600; color: #1f2937;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;
}
.ranking-metrics {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 4px;
}
.ranking-metric { text-align: center; }
.rm-label { display: block; font-size: 10px; color: #9ca3af; }
.rm-value { display: block; font-size: 12px; font-weight: 600; color: #374151; }
.rm-value.green { color: #16a34a; }
.rm-value.orange { color: #d97706; }
.ranking-extra {
  display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: #9ca3af;
}

/* 追投素材消耗数据 */

.boost-effect-tag.running { background: #e6f7ff; color: #1890ff; }
.bem-cmp { display: block; font-size: 10px; margin-top: 2px; }
.bem-cmp.up { color: #f5222d; }
.bem-cmp.down { color: #52c41a; }

.boost-effect-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.boost-effect-item { background: #fafbfc; border: 1px solid #f0f0f0; border-radius: 8px; padding: 10px; }
.boost-effect-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.boost-effect-rank { width: 20px; height: 20px; border-radius: 50%; background: #e5e7eb; color: #6b7280; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.boost-effect-rank.top { background: #7c3aed; color: #fff; }
.boost-effect-name { font-size: 12px; font-weight: 600; color: #1f2937; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.boost-effect-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f5f0ff; color: #7c3aed; font-weight: 500; flex-shrink: 0; }
.boost-effect-tag.closed { background: #fef2f2; color: #ef4444; }
.boost-effect-item.is-closed { opacity: 0.6; }
.boost-effect-metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 4px; }
.boost-effect-metric { text-align: center; }
.bem-label { display: block; font-size: 10px; color: #9ca3af; }
.bem-value { display: block; font-size: 12px; font-weight: 600; color: #374151; }
.bem-value.green { color: #16a34a; }
.bem-value.orange { color: #d97706; }
.boost-effect-plan { font-size: 10px; color: #9ca3af; }

/* Feature config */
.feature-card__config {
  margin-bottom: 12px;
}

/* Boost grid */
.boost-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;
}
.boost-item {
  display: flex; flex-direction: column; gap: 4px;
}
.boost-label {
  font-size: 11px; font-weight: 600; color: #555;
}
.boost-input {
  width: 100%; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 6px;
  font-size: 13px; background: #fafbfc; box-sizing: border-box;
}
.boost-input:focus {
  border-color: #1677ff; outline: none; background: #fff;
  box-shadow: 0 0 0 2px rgba(22,119,255,0.1);
}
.boost-tip {
  font-size: 11px; color: #888; line-height: 1.5; padding: 6px 10px;
  background: #f0f7ff; border-radius: 6px; border-left: 3px solid #1677ff;
}

/* Outline buttons */
.btn-outline {
  padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 500;
  background: #fff; cursor: pointer; transition: 0.2s; white-space: nowrap;
}
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline--orange {
  border: 1px solid #fa8c16; color: #fa8c16;
}
.btn-outline--orange:hover:not(:disabled) { background: #fff7e6; }
.btn-outline--blue {
  border: 1px solid #1677ff; color: #1677ff;
}
.btn-outline--blue:hover:not(:disabled) { background: #eff6ff; }
.btn-outline--purple {
  border: 1px solid #7c3aed; color: #7c3aed;
}
.btn-outline--purple:hover:not(:disabled) { background: #f5f0ff; }

/* Feature stat */
.feature-card__stat {
  font-size: 12px; color: #666; margin-bottom: 10px; padding: 6px 0;
  border-top: 1px dashed #f0f0f0;
}
.feature-card__stat b.orange { color: #fa8c16; }

/* Feature collapse */
.feature-collapse {
  border-top: 1px solid #f0f0f0;
}
.feature-collapse__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; cursor: pointer; user-select: none;
  font-size: 12px; color: #999;
}
.feature-collapse__head:hover { color: #666; }
.feature-collapse__arrow { transition: transform 0.25s; }
.feature-collapse__arrow.open { transform: rotate(180deg); }
.feature-collapse__body {
  max-height: 300px; overflow-y: auto; -webkit-overflow-scrolling: touch;
}

/* Feature log items */
.feature-log-item {
  padding: 8px 0; border-bottom: 1px solid #f9fafb; font-size: 12px;
}
.feature-log-item:last-child { border-bottom: none; }
.feature-log-head {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;
}
.feature-log-time { font-size: 11px; color: #9ca3af; }
.feature-log-main {
  color: #1f2937; font-weight: 500; margin-bottom: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.feature-log-metrics { color: #6b7280; font-size: 11px; margin-top: 2px; }
.feature-log-reason {
  font-size: 11px; color: #fa8c16; margin-top: 2px;
}

/* ===== Clean rule styles ===== */
.clean-rule-hint {
  font-size: 12px; color: #555; padding: 8px 12px; margin-bottom: 10px;
  border-radius: 6px; line-height: 1.6;
  background: linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%);
  border-left: 3px solid #fa8c16;
}
.clean-rule-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 6px;
  background: #f9fafb; border-radius: 6px; flex-wrap: wrap;
}
.clean-rule-label {
  font-size: 11px; font-weight: 600; color: #fa8c16; background: #fff7e6;
  padding: 2px 8px; border-radius: 4px; flex-shrink: 0;
}
.clean-rule-text {
  font-size: 12px; color: #555; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
}
.clean-rule-input {
  width: 60px; padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 4px;
  font-size: 12px; text-align: center; background: #fff; box-sizing: border-box;
}
.clean-rule-input--wide { width: 80px; }
.clean-rule-input:focus {
  border-color: #fa8c16; outline: none;
  box-shadow: 0 0 0 2px rgba(250,140,22,0.1);
}
.clean-rule-select {
  padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 4px;
  font-size: 12px; background: #fff; box-sizing: border-box;
}
.clean-rule-select:focus {
  border-color: #fa8c16; outline: none;
  box-shadow: 0 0 0 2px rgba(250,140,22,0.1);
}
.clean-rule-actions {
  display: flex; gap: 10px; margin-top: 10px;
}

/* ===== Responsive ===== */
@media (max-width: 640px) {
  .ov-features { grid-template-columns: repeat(2, 1fr); }
  .ov-stat__val { font-size: 18px; }
  .col-hide-m { display: none; }
  .hero-row { grid-template-columns: 1fr 1fr; }
  .cfg-name { min-width: 90px; font-size: 12px; }
  .cfg-desc { display: none; }
  .acc-table-header { display: none; }
  .acc-table-row { flex-wrap: wrap; gap: 4px; }
  .col-info { flex: 100%; }
  .col-val { flex: none; font-size: 12px; }
  .col-status { flex: none; }
  .rule-grid { grid-template-columns: repeat(2, 1fr); }
  .boost-grid { grid-template-columns: 1fr 1fr; }
  .ranking-metrics { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 641px) {
  .overview { border-radius: 12px; margin: 0; }
  .rule-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 768px) {
  .page { padding: 0; }
  .drawer { max-width: 560px; }
}

/* 嵌入模式 */
.embedded-mode { padding: 0; }
.embedded-mode .drawer-mask {
  position: static;
  background: none;
  display: block;
}
.embedded-mode .drawer {
  position: static;
  width: 100%;
  max-width: 100%;
  height: auto;
  overflow: visible;
  box-shadow: none;
  border-radius: 0;
}
.embedded-mode .drawer-head { display: none; }
.embedded-mode .drawer-body { padding: 0; }

/* 计划管理内嵌操作栏 */
.plan-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #F7F8FA;
  border-radius: 10px;
  border: 1px solid #E8E8E8;
  flex-wrap: wrap;
  gap: 8px;
}
.plan-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.plan-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.plan-status-dot.on { background: #52C41A; box-shadow: 0 0 6px rgba(82,196,26,0.4); }
.plan-status-dot.off { background: #BFBFBF; }
.plan-status-text { font-weight: 600; color: #1D2129; }
.plan-stats { font-size: 12px; color: #86909C; margin-left: 4px; }
.plan-action-btns {
  display: flex;
  gap: 6px;
}
</style>
