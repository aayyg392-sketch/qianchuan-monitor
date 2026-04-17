import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '数据概览' } },
      { path: 'materials', name: 'Materials', component: () => import('../views/Materials.vue'), meta: { title: '素材监控' } },
      { path: 'materials/:id/remix', name: 'MaterialRemix', component: () => import('../views/MaterialRemix.vue'), meta: { title: 'AI翻剪推荐' } },
      { path: 'material-analysis/:materialId', name: 'MaterialAnalysis', component: () => import('../views/MaterialAnalysisPage.vue'), meta: { title: '内容分析' } },
      { path: 'material-tasks', name: 'MaterialTasks', component: () => import('../views/MaterialTasks.vue'), meta: { title: '素材任务' } },
      { path: 'video-production', name: 'VideoProduction', component: () => import('../views/VideoProduction.vue'), meta: { title: '爆款视频改造' } },
      { path: 'material-audit', name: 'MaterialAudit', component: () => import('../views/MaterialAudit.vue'), meta: { title: '素材审核' } },
      { path: 'super5s', name: 'Super5s', component: () => import('../views/Super5s.vue'), meta: { title: '超级5秒镜头' } },
      { path: 'ai-text2video', name: 'AiText2Video', component: () => import('../views/RunwayText2Video.vue'), meta: { title: 'AI文生视频' } },

      { path: 'audience-profile', name: 'AudienceProfile', component: () => import('../views/AudienceProfile.vue'), meta: { title: '产品人群画像' } },
      { path: 'influencer-match', name: 'InfluencerMatch', component: () => import('../views/InfluencerMatch.vue'), meta: { title: '达人合作筛选' } },
      { path: 'industry-hotspot', name: 'IndustryHotspot', component: () => import('../views/IndustryHotspot.vue'), meta: { title: '行业热点' } },
      { path: 'industry-videos', name: 'IndustryVideos', component: () => import('../views/IndustryVideos.vue'), meta: { title: '内容榜单' } },
      { path: 'competitor-videos', name: 'CompetitorVideos', component: () => import('../views/CompetitorVideos.vue'), meta: { title: '竞品爆款视频' } },
      { path: 'premium-materials', name: 'PremiumMaterials', component: () => import('../views/PremiumMaterials.vue'), meta: { title: '优质素材' } },
      { path: 'ctr-analysis', name: 'CtrAnalysis', component: () => import('../views/CtrAnalysis.vue'), meta: { title: 'CTR素材分析' } },
      { path: 'material-dimensions', name: 'MaterialDimensions', component: () => import('../views/MaterialDimensions.vue'), meta: { title: '内容人员' } },
      { path: 'ops-workbench', name: 'OpsWorkbench', component: () => import('../views/OpsWorkbench.vue'), meta: { title: '运营工作台' } },
      { path: 'ops-comments', name: 'OpsComments', component: () => import('../views/OpsComments.vue'), meta: { title: '评论管理' } },
      { path: 'push-manager', name: 'PushManager', component: () => import('../views/PushManager.vue'), meta: { title: '数据推送管理' } },
      { path: 'campaigns', name: 'Campaigns', component: () => import('../views/Campaigns.vue'), meta: { title: '账户列表' } },
      { path: 'alerts', name: 'Alerts', component: () => import('../views/Alerts.vue'), meta: { title: '告警中心' } },
      { path: 'reports', name: 'Reports', component: () => import('../views/Reports.vue'), meta: { title: '数据分析' } },
      { path: "accounts", name: "Accounts", component: () => import('../views/Accounts.vue'), meta: { title: '账户管理' } },
      { path: 'tiktok-dashboard', name: 'TiktokDashboard', component: () => import('../views/TiktokDashboard.vue'), meta: { title: 'TikTok账户管理' } },
      { path: 'settings', name: 'Settings', component: () => import('../views/Settings.vue'), meta: { title: '系统设置' } },
      // AI金牌投手
      { path: 'ai-trader', name: 'AiTrader', component: () => import('../views/AiTrader.vue'), meta: { title: 'AI金牌投手' } },
      // 系统管理
      { path: 'user-manage', name: 'UserManage', component: () => import('../views/UserManage.vue'), meta: { title: '用户管理' } },
      { path: 'role-manage', name: 'RoleManage', component: () => import('../views/RoleManage.vue'), meta: { title: '角色管理' } },
      { path: 'operation-logs', name: 'OperationLogs', component: () => import('../views/OperationLogs.vue'), meta: { title: '操作日志' } },
      // 直播中心
      { path: 'live-monitor', name: 'LiveMonitor', component: () => import('../views/LiveMonitor.vue'), meta: { title: '实时监控' } },
      { path: 'live-comments', name: 'LiveComments', component: () => import('../views/LiveComments.vue'), meta: { title: '智能评论' } },
      { path: 'live-analytics', name: 'LiveAnalytics', component: () => import('../views/LiveAnalytics.vue'), meta: { title: '分时数据' } },
      { path: 'live-speech', name: 'LiveSpeech', component: () => import('../views/LiveSpeech.vue'), meta: { title: '话术抓取' } },
      { path: 'live-alerts', name: 'LiveAlerts', component: () => import('../views/LiveAlerts.vue'), meta: { title: '异常预警' } },
      { path: 'live-replay', name: 'LiveReplay', component: () => import('../views/LiveReplay.vue'), meta: { title: '主播复盘' } },
      { path: 'live-competitor', name: 'LiveCompetitor', component: () => import('../views/LiveCompetitor.vue'), meta: { title: '竞品监控' } },
      // 主播中心
      { path: 'anchor-schedule', name: 'AnchorSchedule', component: () => import('../views/AnchorSchedule.vue'), meta: { title: '主播排班' } },
      { path: 'anchor-stats', name: 'AnchorStats', component: () => import('../views/AnchorStats.vue'), meta: { title: '主播数据' } },
      // 视频号运营中心
      { path: 'wx-ops-workbench', name: 'WxOpsWorkbench', component: () => import('../views/WxOpsWorkbench.vue'), meta: { title: '视频号运营工作台' } },
      { path: 'wx-finder-list', name: 'WxFinderList', component: () => import('../views/WxFinderList.vue'), meta: { title: '达人管理' } },
      { path: 'adq-dashboard', name: 'AdqDashboard', component: () => import('../views/AdqDashboard.vue'), meta: { title: 'ADQ账户管理' } },
      // 快手运营中心
      { path: 'ks-workbench', name: 'KsWorkbench', component: () => import('../views/KsWorkbench.vue'), meta: { title: '快手运营工作台' } },
      { path: 'ks-live-analytics', name: 'KsLiveAnalytics', component: () => import('../views/KsLiveAnalytics.vue'), meta: { title: '直播电商联动' } },
      { path: 'ks-ad-dashboard', name: 'KsAdDashboard', component: () => import('../views/KsAdDashboard.vue'), meta: { title: '账户管理' } },
      { path: 'ks-ad-pitcher', name: 'KsAdPitcher', component: () => import('../views/KsAdPitcher.vue'), meta: { title: '快手AI金牌投手' } },
      { path: 'ks-reviews', name: 'KsReviews', component: () => import('../views/KsReviews.vue'), meta: { title: '评价管理' } },
    ],
  },
  // AI投放引擎（独立页面，不套AppLayout）
  {
    path: '/ai-engine',
    name: 'AiEngine',
    component: () => import('../views/AiEngine.vue'),
    meta: { title: 'AI投放引擎' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to, from, next) => {
  try {
    const token = localStorage.getItem('qc_token')
    if (!to.meta.public && !token) {
      return next('/login')
    }
    if (to.path === '/login' && token) {
      return next('/')
    }
    // 确保权限已加载（失败也必须放行，防止卡死菜单）
    if (token && to.path !== '/login') {
      try {
        const { useAuthStore } = await import('../store/auth')
        const auth = useAuthStore()
        if (!auth.permissions.menus || !auth.permissions.menus.length) {
          await auth.fetchPermissions()
        }
        if (!auth.user) {
          await auth.fetchMe()
        }
      } catch (e) {
        console.warn('[Router] 权限加载异常，已放行:', e)
      }
    }
    if (to.meta.title) document.title = `${to.meta.title} - 千川监控`
    next()
  } catch (e) {
    console.error('[Router] beforeEach 异常:', e)
    next() // 兜底放行，避免死锁
  }
})

// Catch navigation errors to prevent silent failures
router.onError((error) => {
  console.error('[Router Error]', error)
})

// Clean up body.overflow on every route change (some pages set it to hidden)
router.afterEach(() => {
  document.body.style.overflow = ''
  document.body.style.pointerEvents = ''
  // Remove any orphaned ant-design modal masks
  document.querySelectorAll('.ant-modal-mask, .ant-drawer-mask, .ant-modal-wrap').forEach(el => {
    if (el && el.style) el.style.display = 'none'
  })
})

export default router
