<template>
  <div class="settings-page">
    <!-- 用户信息块 -->
    <div class="user-block">
      <div class="user-avatar">{{ userInitial }}</div>
      <div class="user-info">
        <div class="user-name">{{ userInfo.username || '管理员' }}</div>
        <div class="user-role">{{ userInfo.roleName || (userInfo.role === 'admin' ? '超级管理员' : '普通用户') }}</div>
      </div>
      <button class="edit-avatar-btn" @click="showPasswordModal = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>

    <!-- 设置分组 -->
    <div class="settings-group" v-for="group in settingGroups" :key="group.title">
      <div class="group-title">{{ group.title }}</div>
      <div class="group-card">
        <div
          class="setting-item"
          v-for="item in group.items"
          :key="item.key"
          @click="handleItemClick(item)"
        >
          <div class="item-left">
            <div class="item-icon" :style="{ background: item.iconBg, color: item.iconColor }">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="item.icon"></svg>
            </div>
            <div class="item-text">
              <div class="item-label">{{ item.label }}</div>
              <div class="item-desc" v-if="item.desc">{{ item.desc }}</div>
            </div>
          </div>
          <div class="item-right">
            <a-switch
              v-if="item.type === 'switch'"
              v-model:checked="settings[item.key]"
              size="small"
              @click.stop
              @change="saveSetting(item.key, $event)"
            />
            <span v-else-if="item.type === 'value'" class="item-value">{{ item.value }}</span>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- 同步设置 -->
    <div class="settings-group">
      <div class="group-title">同步设置</div>
      <div class="group-card">
        <div class="setting-item no-arrow">
          <div class="item-left">
            <div class="item-icon" style="background: #E8F4FF; color: #1677FF;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="item-text">
              <div class="item-label">同步频率</div>
            </div>
          </div>
          <a-select
            v-model:value="settings.syncInterval"
            style="width: 110px"
            size="small"
            :options="syncIntervalOptions"
            @change="saveSetting('syncInterval', $event)"
          />
        </div>
        <div class="setting-item no-arrow">
          <div class="item-left">
            <div class="item-icon" style="background: #E8FFF3; color: #00B96B;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </div>
            <div class="item-text">
              <div class="item-label">上次同步</div>
              <div class="item-desc">{{ lastSyncTime }}</div>
            </div>
          </div>
          <button class="sync-now-btn" @click="syncNow" :disabled="syncing">
            {{ syncing ? '同步中' : '立即同步' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 退出登录 -->
    <div class="logout-section">
      <button class="logout-btn" @click="logout">退出登录</button>
    </div>

    <!-- 版本信息 -->
    <div class="version-info">千川监控系统 v2.0.0</div>

    <!-- 修改密码弹窗 -->
    <a-modal
      v-model:open="showPasswordModal"
      title="修改密码"
      okText="确认修改"
      cancelText="取消"
      @ok="changePassword"
    >
      <div class="pwd-form">
        <div class="form-item">
          <label>当前密码</label>
          <a-input-password v-model:value="pwdForm.old" placeholder="请输入当前密码" />
        </div>
        <div class="form-item">
          <label>新密码</label>
          <a-input-password v-model:value="pwdForm.new" placeholder="至少6位" />
        </div>
        <div class="form-item">
          <label>确认新密码</label>
          <a-input-password v-model:value="pwdForm.confirm" placeholder="再次输入新密码" />
        </div>
      </div>
    </a-modal>

    <!-- API Config Modal -->
    <a-drawer
      v-model:open="showApiConfigModal"
      title="API 配置"
      :placement="isMobile ? 'bottom' : 'right'"
      :width="isMobile ? '100%' : 600"
      :height="isMobile ? '85vh' : undefined"
    >
      <a-tabs v-model:activeKey="apiConfigTab" style="margin-top: -8px">
        <a-tab-pane key="qianchuan" tab="千川配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP ID">
                  <a-input v-model:value="qianchuanForm.app_id" placeholder="千川 APP ID" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="qianchuanForm.app_secret" placeholder="千川 APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveQianchuanConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权账户
                <a-button type="link" size="small" @click="goAuth('qianchuan')" style="float:right">去授权</a-button>
              </div>
              <div v-if="qianchuanConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in qianchuanConfig.accounts" :key="acc.advertiser_id">
                  <div class="api-account-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.token_expires_at">有效期至 {{ acc.token_expires_at?.substring(0, 16) }}</span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="marketing" tab="巨量营销配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP ID">
                  <a-input v-model:value="marketingForm.marketing_app_id" placeholder="巨量营销 APP ID" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="marketingForm.marketing_app_secret" placeholder="巨量营销 APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveMarketingConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权账户
                <a-button type="link" size="small" @click="goAuth('marketing')" style="float:right;margin-left:8px">去授权</a-button>
                <a-button type="link" size="small" :loading="tokenRefreshing" @click="refreshMarketingToken" style="float:right">刷新Token</a-button>
              </div>
              <div v-if="marketingConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in marketingConfig.accounts" :key="acc.advertiser_id">
                  <div class="api-account-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.token_expires_at">
                      有效期至 {{ acc.token_expires_at?.substring(0, 16) }}
                    </span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />
              <div class="api-config-tip">
                <span>💡 评论管理功能使用巨量营销Token，独立于千川Token。系统每小时自动检查并刷新即将过期的Token。</span>
              </div>
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="wx_channels" tab="视频号助手配置">
          <a-spin :spinning="apiConfigLoading">
            <div style="max-width: 480px">
              <a-form layout="vertical">
                <a-form-item label="AppID（橱窗）">
                  <a-input v-model:value="wxChannelsForm.app_id" placeholder="视频号助手 AppID" />
                </a-form-item>
                <a-form-item label="AppSecret">
                  <a-input-password v-model:value="wxChannelsForm.app_secret" placeholder="视频号助手 AppSecret" />
                </a-form-item>
              </a-form>
              <a-button type="primary" @click="saveWxChannels" :loading="apiConfigLoading">保存配置</a-button>
              <div style="margin-top: 12px; color: #8c8c8c; font-size: 12px">
                <span>💡 视频号助手使用AppID+Secret直接鉴权，保存配置后即可使用，无需额外授权。</span>
              </div>
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="wx_shop" tab="微信小店配置">
          <a-spin :spinning="apiConfigLoading">
            <div style="max-width: 480px">
              <a-form layout="vertical">
                <a-form-item label="AppID（小店）">
                  <a-input v-model:value="wxShopForm.app_id" placeholder="微信小店 AppID" />
                </a-form-item>
                <a-form-item label="AppSecret">
                  <a-input-password v-model:value="wxShopForm.app_secret" placeholder="微信小店 AppSecret" />
                </a-form-item>
              </a-form>
              <a-button type="primary" @click="saveWxShop" :loading="apiConfigLoading">保存配置</a-button>
              <div style="margin-top: 12px; color: #8c8c8c; font-size: 12px">
                <span>💡 微信小店使用AppID+Secret直接鉴权，保存配置后即可使用，无需额外授权。</span>
              </div>
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="ks_ad" tab="快手磁力配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP ID">
                  <a-input v-model:value="ksAdForm.app_id" placeholder="快手磁力 APP ID" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="ksAdForm.app_secret" placeholder="快手磁力 APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveKsAdConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权广告账户
                <a-button type="link" size="small" @click="goAuth('ks_ad')" style="float:right">去授权</a-button>
              </div>
              <div v-if="ksAdConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in ksAdConfig.accounts" :key="acc.advertiser_id">
                  <div class="api-account-name">{{ acc.advertiser_name || acc.advertiser_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="ks_shop" tab="快手小店配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP Key">
                  <a-input v-model:value="ksShopForm.app_key" placeholder="快手小店 APP Key" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="ksShopForm.app_secret" placeholder="快手小店 APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveKsShopConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权店铺
                <a-button type="link" size="small" @click="goAuth('ks_shop')" style="float:right">去授权</a-button>
              </div>
              <div v-if="ksShopConfig.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in ksShopConfig" :key="acc.shop_id">
                  <div class="api-account-name">{{ acc.shop_name || acc.shop_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.last_sync_at">最后同步 {{ acc.last_sync_at?.substring(0, 16) }}</span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权店铺" :image-style="{ height: '40px' }" />
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="tiktok" tab="TikTok配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP ID">
                  <a-input v-model:value="tiktokForm.app_id" placeholder="TikTok APP ID" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="tiktokForm.app_secret" placeholder="TikTok APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveTiktokConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权账户
                <a-button type="link" size="small" @click="goAuth('tiktok')" style="float:right">去授权</a-button>
              </div>
              <div v-if="tiktokConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in tiktokConfig.accounts" :key="acc.advertiser_id || acc.id">
                  <div class="api-account-name">{{ acc.advertiser_name || acc.account_name || acc.advertiser_id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.token_expires_at">有效期至 {{ acc.token_expires_at?.substring(0, 16) }}</span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />
              <div style="margin-top: 12px; color: #8c8c8c; font-size: 12px">
                <span>💡 TikTok for Business API用于海外广告投放管理。在TikTok开发者后台获取APP ID和Secret。</span>
              </div>
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="douyin_shop" tab="抖音小店配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP Key">
                  <a-input v-model:value="douyinShopForm.app_key" placeholder="抖音小店 APP Key" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="douyinShopForm.app_secret" placeholder="抖音小店 APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveDouyinShopConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">
                已授权店铺
                <a-button type="link" size="small" @click="goAuth('douyin_shop')" style="float:right">去授权</a-button>
              </div>
              <div v-if="douyinShopConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in douyinShopConfig.accounts" :key="acc.shop_id || acc.id">
                  <div class="api-account-name">{{ acc.shop_name || acc.shop_id || acc.id }}</div>
                  <div class="api-account-meta">
                    <a-tag :color="acc.status === 1 ? 'green' : 'default'" size="small">{{ acc.status === 1 ? '正常' : '停用' }}</a-tag>
                    <span class="api-account-expire" v-if="acc.token_expires_at">有效期至 {{ acc.token_expires_at?.substring(0, 16) }}</span>
                  </div>
                </div>
              </div>
              <a-empty v-else description="暂无授权店铺" :image-style="{ height: '40px' }" />
              <div style="margin-top: 12px; color: #8c8c8c; font-size: 12px">
                <span>💡 抖音小店API用于店铺订单、商品管理、电商数据分析。在抖音开放平台获取APP Key和Secret。</span>
              </div>
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="tencent_adq" tab="腾讯ADQ配置">
          <a-spin :spinning="apiConfigLoading">
            <div class="api-config-section">
              <a-form layout="vertical">
                <a-form-item label="APP ID">
                  <a-input v-model:value="adqForm.app_id" placeholder="腾讯ADQ APP ID" />
                </a-form-item>
                <a-form-item label="APP Secret">
                  <a-input-password v-model:value="adqForm.app_secret" placeholder="腾讯ADQ APP Secret" />
                </a-form-item>
                <a-button type="primary" block @click="saveAdqConfig">保存配置</a-button>
              </a-form>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">添加账户</div>
              <!-- Token已保存状态 -->
              <div v-if="adqTokenSaved" style="margin-bottom:16px;padding:12px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="color:#52c41a;font-size:16px;font-weight:bold">✓</span>
                  <span style="font-size:13px;font-weight:600;color:#389e0d">组织Token已保存</span>
                </div>
                <div style="font-size:12px;color:#8c8c8c;line-height:1.8">
                  已关联 {{ adqConfig.accounts?.length || 0 }} 个子账户，Token有效期至 {{ adqTokenExpire }}<br/>
                  <span style="color:#1677ff">系统每6小时自动检查并刷新Token，无需手动操作</span>
                </div>
                <a-button size="small" style="margin-top:8px" @click="adqTokenSaved=false">更新Token</a-button>
              </div>
              <!-- 组织Token方式（推荐） -->
              <div v-else style="margin-bottom:16px;padding:12px;background:#f6f9ff;border-radius:6px">
                <div style="font-size:13px;font-weight:600;margin-bottom:8px">粘贴组织Token（一键关联所有子账户）</div>
                <div style="font-size:12px;color:#8c8c8c;margin-bottom:10px;line-height:1.8">
                  1. 打开 <a href="https://developers.e.qq.com" target="_blank">开发者后台</a> → 应用管理 → Token获取<br/>
                  2. 身份选择：选择<b>「客户工作台/集团」</b>身份（不要选单个广告主）<br/>
                  3. 复制 access_token 和 refresh_token 粘贴到下方<br/>
                  <span style="color:#fa8c16">⚠ 组织token可一次性关联该组织下全部子账户</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                  <a-input v-model:value="adqAccessToken" placeholder="粘贴 access_token" />
                  <a-input v-model:value="adqRefreshToken" placeholder="粘贴 refresh_token（建议填写，用于自动续期）" />
                  <a-button type="primary" :loading="adqExchanging" @click="doAdqExchange" block>添加并发现子账户</a-button>
                </div>
              </div>
              <!-- 发现到的账户预览 -->
              <div v-if="adqDiscovered.length" style="margin-bottom:16px">
                <div style="font-size:13px;color:#595959;margin-bottom:8px">发现 {{ adqDiscovered.length }} 个账户：</div>
                <div style="max-height:200px;overflow-y:auto;border:1px solid #f0f0f0;border-radius:6px;padding:8px">
                  <div v-for="a in adqDiscovered" :key="a.account_id" style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid #fafafa">
                    <span>{{ a.account_name || '-' }}</span>
                    <span style="color:#8c8c8c">{{ a.account_id }}</span>
                  </div>
                </div>
              </div>
              <!-- 手动输入备选 -->
              <a-collapse :bordered="false" style="margin-bottom:16px;background:transparent">
                <a-collapse-panel key="manual" header="手动输入账户ID">
                  <a-textarea v-model:value="adqAccountId" placeholder="广告主账户ID（多个用逗号或换行分隔）" :rows="2" style="margin-bottom:8px" />
                  <a-button type="primary" :loading="adqExchanging" @click="doAdqExchangeManual" block size="small">添加指定账户</a-button>
                </a-collapse-panel>
              </a-collapse>
              <div class="api-config-divider"></div>
              <div class="api-config-subtitle">已授权账户 ({{ adqConfig.accounts?.length || 0 }})</div>
              <div v-if="adqConfig.accounts?.length" class="api-accounts-list">
                <div class="api-account-item" v-for="acc in adqConfig.accounts" :key="acc.account_id || acc.id" style="display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <div class="api-account-name">{{ acc.account_name || acc.account_id }} <span style="color:#8c8c8c;font-size:12px">ID: {{ acc.account_id }}</span></div>
                    <div class="api-account-meta">
                      <a-tag :color="acc.status === 1 ? 'green' : acc.token_expires_at ? 'orange' : 'default'" size="small">
                        {{ acc.status === 1 ? '正常' : (acc.token_expires_at ? '停用' : '待绑定Token') }}
                      </a-tag>
                      <span class="api-account-expire" v-if="acc.token_expires_at">Token有效期至 {{ acc.token_expires_at?.substring(0, 16) }}</span>
                    </div>
                  </div>
                  <a-button v-if="!acc.token_expires_at" size="small" type="link" @click="bindTokenFor(acc)">绑定Token</a-button>
                  <a-button v-else size="small" type="link" @click="bindTokenFor(acc)">更新Token</a-button>
                </div>
              </div>
              <a-empty v-else description="暂无授权账户" :image-style="{ height: '40px' }" />

              <!-- 绑定Token弹窗 -->
              <a-modal v-model:open="bindTokenVisible" :title="'绑定Token - ' + bindTokenAcct.account_id" @ok="doBindToken" ok-text="确认绑定" :confirm-loading="bindTokenLoading">
                <p style="font-size:12px;color:#8c8c8c;margin-bottom:12px">
                  在开发者后台Token获取中选择账户「{{ bindTokenAcct.account_id }}」，复制token粘贴到下方
                </p>
                <a-input v-model:value="bindTokenVal" placeholder="粘贴 access_token" style="margin-bottom:8px" />
                <a-input v-model:value="bindRefreshVal" placeholder="粘贴 refresh_token（选填）" />
              </a-modal>
            </div>
          </a-spin>
        </a-tab-pane>
      </a-tabs>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import request from '@/utils/request'
import dayjs from 'dayjs'
import { useAuthStore } from '../store/auth'

const router = useRouter()
const auth = useAuthStore()

const userInfo = ref({ username: '管理员', role: 'admin' })
const userInitial = computed(() => String(userInfo.value.username || 'A').charAt(0).toUpperCase())
const showPasswordModal = ref(false)
const isMobile = ref(window.innerWidth < 768)
const showApiConfigModal = ref(false)
const apiConfigTab = ref('qianchuan')
const apiConfigLoading = ref(false)
const settingsLoading = ref(false)
const qianchuanConfig = ref({ config: {}, accounts: [] })
const marketingConfig = ref({ config: {}, accounts: [] })
const ksAdConfig = ref({ app_id: '', app_secret: '', accounts: [] })
const ksShopConfig = ref([])
const qianchuanForm = reactive({ app_id: '', app_secret: '' })
const ksAdForm = reactive({ app_id: '', app_secret: '' })
const ksShopForm = reactive({ app_key: '', app_secret: '' })
const tiktokForm = reactive({ app_id: '', app_secret: '' })
const tiktokConfig = ref({ accounts: [] })
const douyinShopForm = reactive({ app_key: '', app_secret: '' })
const douyinShopConfig = ref({ accounts: [] })
const adqForm = reactive({ app_id: '', app_secret: '' })
const adqAccountId = ref('')
const adqAccessToken = ref('')
const adqRefreshToken = ref('')
const adqExchanging = ref(false)
const adqDiscovering = ref(false)
const adqDiscovered = ref([])
const adqConfig = ref({ accounts: [] })
const adqTokenSaved = ref(false)
const adqTokenExpire = ref('')
const marketingForm = reactive({ marketing_app_id: '', marketing_app_secret: '' })
const wxChannelsForm = reactive({ app_id: '', app_secret: '' })
const wxShopForm = reactive({ app_id: '', app_secret: '' })
const tokenRefreshing = ref(false)
const syncing = ref(false)
const lastSyncTime = ref('加载中...')

const settings = ref({
  autoSync: true,
  syncInterval: '30',
  alertNotify: true,
  darkMode: false,
  mobileOptimize: true,
})

const syncIntervalOptions = [
  { label: '15 分钟', value: '15' },
  { label: '30 分钟', value: '30' },
  { label: '1 小时', value: '60' },
  { label: '3 小时', value: '180' },
]

const settingGroups = [
  {
    title: '通知设置',
    items: [
      {
        key: 'alertNotify',
        label: '告警通知',
        desc: '触发告警规则时发送通知',
        type: 'switch',
        icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        iconBg: '#FFF7E6',
        iconColor: '#FF8A00',
      },
      {
        key: 'autoSync',
        label: '自动同步',
        desc: '按设置频率自动拉取数据',
        type: 'switch',
        icon: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        iconBg: '#E8FFF3',
        iconColor: '#00B96B',
      },
    ],
  },
  {
    title: '账户安全',
    items: [
      {
        key: 'changePassword',
        label: '修改密码',
        type: 'link',
        icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        iconBg: '#E8F4FF',
        iconColor: '#1677FF',
      },
      {
        key: 'apiConfig',
        label: 'API 配置管理',
        desc: '千川 & 巨量营销配置',
        type: 'link',
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>',
        iconBg: '#F3F0FF',
        iconColor: '#7B5EA7',
      },
    ],
  },
  {
    title: '关于',
    items: [
      {
        key: 'docs',
        label: '使用文档',
        type: 'link',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>',
        iconBg: '#F5F6F8',
        iconColor: '#595959',
      },
      {
        key: 'version',
        label: '当前版本',
        type: 'value',
        value: 'v2.0.0',
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>',
        iconBg: '#F5F6F8',
        iconColor: '#595959',
      },
    ],
  },
]

const pwdForm = ref({ old: '', new: '', confirm: '' })

function handleItemClick(item) {
  if (item.key === 'changePassword') {
    showPasswordModal.value = true
  } else if (item.key === 'apiConfig') {
    showApiConfigModal.value = true
    loadApiConfig()
  }
}

function saveSetting(key, val) {
  settings.value[key] = val
  try {
    localStorage.setItem('app_settings', JSON.stringify(settings.value))
  } catch {}
}

async function syncNow() {
  syncing.value = true
  try {
    await axios.post('/api/sync/manual')
    lastSyncTime.value = dayjs().format('MM-DD HH:mm')
    message.success('数据同步完成')
  } catch {
    message.error('同步失败')
  } finally {
    syncing.value = false
  }
}

async function loadKsConfig() {
  try {
    // 快手磁力
    const adRes = await request.get('/settings/ks-ad').catch(() => null)
    if (adRes?.data) {
      ksAdConfig.value.app_id = adRes.data.config?.ks_ad_app_id || ''
      ksAdConfig.value.app_secret = adRes.data.config?.ks_ad_app_secret || ''
      ksAdConfig.value.accounts = adRes.data.accounts || []
      ksAdForm.app_id = ksAdConfig.value.app_id
      ksAdForm.app_secret = ksAdConfig.value.app_secret
    }
    // 快手小店
    const shopRes = await request.get('/settings/kuaishou').catch(() => null)
    if (shopRes?.data) {
      ksShopForm.app_key = shopRes.data.config?.ks_app_key || ''
      ksShopForm.app_secret = shopRes.data.config?.ks_app_secret || ''
      ksShopConfig.value = (shopRes.data.accounts || []).map(s => ({ ...s, app_key: shopRes.data.config?.ks_app_key || '' }))
    }
  } catch (e) { console.warn('loadKsConfig error', e) }
}

async function loadApiConfig() {
  loadKsConfig();
  apiConfigLoading.value = true
  try {
    const [qcRes, mktRes] = await Promise.all([
      request.get('/settings/qianchuan'),
      request.get('/settings/marketing'),
    ])
    qianchuanConfig.value = qcRes?.data || { config: {}, accounts: [] }
    qianchuanForm.app_id = qianchuanConfig.value.config?.qianchuan_app_id || ''
    qianchuanForm.app_secret = qianchuanConfig.value.config?.qianchuan_app_secret || ''
    marketingConfig.value = mktRes?.data || { config: {}, accounts: [] }
    marketingForm.marketing_app_id = marketingConfig.value.config?.marketing_app_id || ''
    marketingForm.marketing_app_secret = marketingConfig.value.config?.marketing_app_secret || ''
    // 加载TikTok配置
    try {
      const ttRes = await request.get('/settings/tiktok')
      if (ttRes?.data) {
        tiktokForm.app_id = ttRes.data.config?.tiktok_app_id || ''
        tiktokForm.app_secret = ttRes.data.config?.tiktok_app_secret || ''
        tiktokConfig.value = { accounts: ttRes.data.accounts || [] }
      }
    } catch (e) { /* ignore */ }
    // 加载抖音小店配置
    try {
      const dyRes = await request.get('/settings/douyin-shop')
      if (dyRes?.data) {
        douyinShopForm.app_key = dyRes.data.config?.douyin_shop_app_key || ''
        douyinShopForm.app_secret = dyRes.data.config?.douyin_shop_app_secret || ''
        douyinShopConfig.value = { accounts: dyRes.data.accounts || [] }
      }
    } catch (e) { /* ignore */ }
    // 加载腾讯ADQ配置
    try {
      const adqRes = await request.get('/settings/tencent-adq')
      if (adqRes?.data) {
        adqForm.app_id = adqRes.data.config?.adq_app_id || ''
        adqForm.app_secret = adqRes.data.config?.adq_app_secret || ''
      }
    } catch (e) { /* ignore */ }
    // 加载ADQ已授权账户
    loadAdqAccounts()
    // 加载视频号配置
    try {
      const wxRes = await request.get('/settings/wx-channels')
      const wxCfg = wxRes?.data || {}
      wxChannelsForm.app_id = wxCfg.wx_channels_app_id || wxCfg.wx_finder_app_id || ''
      wxChannelsForm.app_secret = wxCfg.wx_channels_app_secret || wxCfg.wx_finder_app_secret || ''
      wxShopForm.app_id = wxCfg.wx_shop_app_id || ''
      wxShopForm.app_secret = wxCfg.wx_shop_app_secret || ''
    } catch (e) { /* ignore */ }
  } catch (e) { console.error(e) }
  finally { apiConfigLoading.value = false }
}

async function saveMarketingConfig() {
  try {
    await request.post('/settings/marketing', marketingForm)
    message.success('巨量营销配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}


async function saveQianchuanConfig() {
  try {
    await request.post('/settings/qianchuan', { qianchuan_app_id: qianchuanForm.app_id, qianchuan_app_secret: qianchuanForm.app_secret })
    message.success('千川配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function saveKsAdConfig() {
  try {
    await request.post('/settings/ks-ad', { ks_ad_app_id: ksAdForm.app_id, ks_ad_app_secret: ksAdForm.app_secret })
    message.success('快手磁力配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function saveKsShopConfig() {
  try {
    await request.post('/settings/kuaishou', { ks_app_key: ksShopForm.app_key, ks_app_secret: ksShopForm.app_secret })
    message.success('快手小店配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function saveAdqConfig() {
  try {
    await request.post('/settings/tencent-adq', { adq_app_id: adqForm.app_id, adq_app_secret: adqForm.app_secret })
    message.success('腾讯ADQ配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function doOAuthAuthorize() {
  try {
    const res = await request.get('/adq/oauth-url')
    const url = res?.data?.url
    if (!url) return message.error('获取授权链接失败')
    // 监听授权完成消息
    const handler = (e) => {
      if (e.data === 'adq-oauth-done') {
        loadAdqAccounts()
        window.removeEventListener('message', handler)
      }
    }
    window.addEventListener('message', handler)
    window.open(url, '_blank', 'width=800,height=600')
  } catch (e) { message.error('获取授权链接失败') }
}

async function doAdqDiscover() {
  if (!adqAccessToken.value.trim()) return message.warning('请输入access_token')
  adqDiscovering.value = true
  adqDiscovered.value = []
  try {
    const res = await request.post('/adq/discover-accounts', { access_token: adqAccessToken.value.trim() })
    const accounts = res?.data?.accounts || []
    if (accounts.length) {
      adqDiscovered.value = accounts
      message.success(`发现 ${accounts.length} 个账户`)
    } else {
      message.warning('未发现账户，请确认Token来自组织身份，或使用下方手动输入')
    }
  } catch (e) { message.error('发现失败: ' + (e.response?.data?.msg || e.message)) }
  adqDiscovering.value = false
}

async function doAdqExchange() {
  if (!adqAccessToken.value.trim()) return message.warning('请输入access_token')
  adqExchanging.value = true
  try {
    const res = await request.post('/adq/add-token', {
      access_token: adqAccessToken.value.trim(),
      refresh_token: adqRefreshToken.value.trim(),
    })
    message.success(res?.msg || res?.data?.msg || '添加成功')
    adqAccessToken.value = ''
    adqRefreshToken.value = ''
    adqDiscovered.value = []
    loadAdqAccounts()
  } catch (e) { message.error('添加失败: ' + (e.response?.data?.msg || e.message)) }
  adqExchanging.value = false
}

async function doAdqExchangeManual() {
  if (!adqAccountId.value.trim()) return message.warning('请输入账户ID')
  if (!adqAccessToken.value.trim()) return message.warning('请输入access_token')
  adqExchanging.value = true
  try {
    const res = await request.post('/adq/add-token', {
      account_id: adqAccountId.value.trim(),
      access_token: adqAccessToken.value.trim(),
      refresh_token: adqRefreshToken.value.trim(),
    })
    message.success(res?.msg || res?.data?.msg || '添加成功')
    adqAccountId.value = ''
    loadAdqAccounts()
  } catch (e) { message.error('添加失败: ' + (e.response?.data?.msg || e.message)) }
  adqExchanging.value = false
}

const bindTokenVisible = ref(false)
const bindTokenAcct = ref({})
const bindTokenVal = ref('')
const bindRefreshVal = ref('')
const bindTokenLoading = ref(false)

function bindTokenFor(acc) {
  bindTokenAcct.value = acc
  bindTokenVal.value = ''
  bindRefreshVal.value = ''
  bindTokenVisible.value = true
}

async function doBindToken() {
  if (!bindTokenVal.value.trim()) return message.warning('请输入access_token')
  bindTokenLoading.value = true
  try {
    const res = await request.post('/adq/add-token', {
      account_id: bindTokenAcct.value.account_id,
      access_token: bindTokenVal.value.trim(),
      refresh_token: bindRefreshVal.value.trim(),
    })
    message.success('绑定成功')
    bindTokenVisible.value = false
    loadAdqAccounts()
  } catch (e) { message.error('绑定失败: ' + (e.response?.data?.msg || e.message)) }
  bindTokenLoading.value = false
}

async function loadAdqAccounts() {
  try {
    const res = await request.get('/adq/accounts')
    const accounts = res?.data || res || []
    adqConfig.value = { accounts }
    // 检查是否有已保存的token（显示保存状态）
    const withToken = accounts.filter(a => a.token_expires_at)
    if (withToken.length > 0) {
      adqTokenSaved.value = true
      adqTokenExpire.value = withToken[0].token_expires_at?.substring(0, 16) || ''
    } else {
      adqTokenSaved.value = false
    }
  } catch (e) {}
}

async function goAuth(platform) {
  const urlMap = {
    qianchuan: '/accounts/oauth-url',
    marketing: '/accounts/oauth-url',
    ks_ad: '/ks-ad/oauth-url',
    ks_shop: '/ks/oauth-url',
    tiktok: '/settings/tiktok/oauth-url',
    douyin_shop: '/settings/douyin-shop/oauth-url',
  }
  const apiUrl = urlMap[platform]
  if (!apiUrl) return message.info('该平台使用AppID+Secret直接鉴权，无需授权')
  try {
    const res = await request.get(apiUrl)
    if (res?.data?.url) {
      window.open(res.data.url, '_blank')
    } else {
      message.error(res?.msg || '获取授权链接失败，请先保存API配置')
    }
  } catch (e) {
    message.error('获取授权链接失败，请先保存API配置')
  }
}

async function saveDouyinShopConfig() {
  try {
    await request.post('/settings/douyin-shop', { douyin_shop_app_key: douyinShopForm.app_key, douyin_shop_app_secret: douyinShopForm.app_secret })
    message.success('抖音小店配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function saveTiktokConfig() {
  try {
    await request.post('/settings/tiktok', { tiktok_app_id: tiktokForm.app_id, tiktok_app_secret: tiktokForm.app_secret })
    message.success('TikTok配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function saveWxChannels() {
  try {
    await request.post('/settings/wx-channels', { wx_finder_app_id: wxChannelsForm.app_id, wx_finder_app_secret: wxChannelsForm.app_secret })
    message.success('视频号助手配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function saveWxShop() {
  try {
    await request.post('/settings/wx-channels', { wx_shop_app_id: wxShopForm.app_id, wx_shop_app_secret: wxShopForm.app_secret })
    message.success('微信小店配置已保存')
    loadApiConfig()
  } catch (e) { message.error('保存失败') }
}

async function refreshMarketingToken() {
  tokenRefreshing.value = true
  try {
    const res = await request.post('/settings/marketing/refresh-token')
    if (res?.code === 0 || res?.msg) {
      message.success(res?.msg || 'Token刷新成功')
      loadApiConfig()
    } else {
      message.error(res?.msg || 'Token刷新失败')
    }
  } catch (e) { message.error('刷新失败') }
  finally { tokenRefreshing.value = false }
}

async function changePassword() {
  if (!pwdForm.value.old || !pwdForm.value.new) { message.warning('请填写完整'); return }
  if (pwdForm.value.new !== pwdForm.value.confirm) { message.warning('两次密码不一致'); return }
  if (pwdForm.value.new.length < 6) { message.warning('新密码至少6位'); return }
  try {
    await axios.post('/api/auth/change-password', { oldPassword: pwdForm.value.old, newPassword: pwdForm.value.new })
    showPasswordModal.value = false
    message.success('密码已修改')
    pwdForm.value = { old: '', new: '', confirm: '' }
  } catch {
    message.error('密码修改失败，请检查当前密码')
  }
}

function logout() {
  Modal.confirm({
    title: '确认退出',
    content: '确定要退出登录吗？',
    okText: '退出',
    cancelText: '取消',
    okType: 'danger',
    onOk() {
      auth.logout()
      router.push('/login')
    },
  })
}

onMounted(() => {
  const saved = localStorage.getItem('app_settings')
  if (saved) { try { Object.assign(settings.value, JSON.parse(saved)) } catch {} }
  // 从auth store获取用户信息
  if (auth.user) {
    userInfo.value.username = auth.user.username || '管理员'
    userInfo.value.role = auth.user.role || 'viewer'
  } else {
    const token = localStorage.getItem('qc_token')
    if (token) { try { const p = JSON.parse(atob(token.split('.')[1])); userInfo.value.username = p.username || '管理员'; userInfo.value.role = p.role || 'viewer' } catch {} }
  }
  // 获取RBAC角色显示
  if (auth.permissions && auth.permissions.roles && auth.permissions.roles.length) {
    userInfo.value.roleName = auth.permissions.roles.map(r => r.display_name).join(', ')
  }
  axios.get('/api/sync/status').then(r => {
    lastSyncTime.value = r.data?.last_sync ? dayjs(r.data.last_sync).format('MM-DD HH:mm') : '从未'
  }).catch(() => { lastSyncTime.value = '未知' })
})
</script>

<style scoped>
.settings-page {
  padding-bottom: calc(var(--tabnav-h) + var(--safe-b) + 24px);
  min-height: 100vh;
  background: var(--bg-page);
}

.user-block {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-card);
  padding: 20px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1677FF, #0958D9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  flex-shrink: 0;
}
.user-info { flex: 1; }
.user-name { font-size: 17px; font-weight: 600; color: var(--text-primary); }
.user-role { font-size: 13px; color: var(--text-hint); margin-top: 2px; }
.edit-avatar-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #F5F6F8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
}

.settings-group { margin: 0 12px 16px; }
.group-title { font-size: 12px; color: var(--text-hint); font-weight: 500; margin-bottom: 8px; padding-left: 4px; }

.group-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.setting-item:last-child { border-bottom: none; }
.setting-item:active { background: #F5F6F8; }
.setting-item.no-arrow { cursor: default; }
.setting-item.no-arrow:active { background: transparent; }

.item-left { display: flex; align-items: center; gap: 12px; }
.item-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.item-label { font-size: 14px; color: var(--text-primary); }
.item-desc { font-size: 11px; color: var(--text-hint); margin-top: 2px; }
.item-right { display: flex; align-items: center; }
.item-value { font-size: 13px; color: var(--text-hint); margin-right: 4px; }

.sync-now-btn {
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid var(--c-primary);
  background: var(--c-primary-bg);
  color: var(--c-primary);
  font-size: 13px;
  cursor: pointer;
}
.sync-now-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.logout-section { margin: 0 12px 12px; }
.logout-btn {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--c-danger);
  background: transparent;
  color: var(--c-danger);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.logout-btn:active { background: var(--c-danger-bg); }

.version-info {
  text-align: center;
  font-size: 12px;
  color: var(--text-hint);
  padding: 8px;
}

.pwd-form { display: flex; flex-direction: column; gap: 16px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.form-item label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }

.api-config-section {
  padding: 4px 0;
}
.api-config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
}
.api-config-label {
  font-size: 14px;
  color: #595959;
}
.api-config-value {
  font-size: 14px;
  color: #1a1a1a;
  font-family: monospace;
}
.secret-mask {
  color: #8c8c8c;
}
.api-config-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 16px 0;
}
.api-config-subtitle {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 10px;
}
.api-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.api-account-item {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 8px;
}
.api-account-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  margin-bottom: 4px;
}
.api-account-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.api-account-expire {
  font-size: 12px;
  color: #8c8c8c;
}
.api-config-tip {
  margin-top: 16px;
  padding: 10px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 8px;
  font-size: 13px;
  color: #595959;
  line-height: 1.5;
}

@media (min-width: 768px) {
  .settings-page { padding-bottom: 24px; max-width: 960px; margin: 0 auto; padding: 16px 24px; }
  .settings-group { margin: 0 0 16px; }
  .logout-section { margin: 0 0 12px; }
}
</style>
