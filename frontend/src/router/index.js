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
      { path: 'incubation', name: 'Incubation', component: () => import('../views/Incubation.vue'), meta: { title: '爆款孵化计划' } },
      { path: 'audience-profile', name: 'AudienceProfile', component: () => import('../views/AudienceProfile.vue'), meta: { title: '产品人群画像' } },
      { path: 'influencer-match', name: 'InfluencerMatch', component: () => import('../views/InfluencerMatch.vue'), meta: { title: '达人合作筛选' } },
      { path: 'industry-hotspot', name: 'IndustryHotspot', component: () => import('../views/IndustryHotspot.vue'), meta: { title: '行业热点' } },
      { path: 'industry-videos', name: 'IndustryVideos', component: () => import('../views/IndustryVideos.vue'), meta: { title: '内容榜单' } },
      { path: 'competitor-videos', name: 'CompetitorVideos', component: () => import('../views/CompetitorVideos.vue'), meta: { title: '竞品爆款视频' } },
      { path: 'premium-materials', name: 'PremiumMaterials', component: () => import('../views/PremiumMaterials.vue'), meta: { title: '优质素材' } },
      { path: 'material-dimensions', name: 'MaterialDimensions', component: () => import('../views/MaterialDimensions.vue'), meta: { title: '内容人员' } },
      { path: 'ops-workbench', name: 'OpsWorkbench', component: () => import('../views/OpsWorkbench.vue'), meta: { title: '运营工作台' } },
      { path: 'ops-comments', name: 'OpsComments', component: () => import('../views/OpsComments.vue'), meta: { title: '评论管理' } },
      { path: 'ops-accounts', name: 'OpsAccounts', component: () => import('../views/OpsAccounts.vue'), meta: { title: '账号管理' } },
      { path: 'ops-scripts', name: 'OpsScripts', component: () => import('../views/OpsScripts.vue'), meta: { title: '话术库' } },
      { path: 'ops-stats', name: 'OpsStats', component: () => import('../views/OpsStats.vue'), meta: { title: '数据统计' } },
      { path: 'campaigns', name: 'Campaigns', component: () => import('../views/Accounts.vue'), meta: { title: '账户列表' } },
      { path: 'alerts', name: 'Alerts', component: () => import('../views/Alerts.vue'), meta: { title: '告警中心' } },
      { path: 'reports', name: 'Reports', component: () => import('../views/Reports.vue'), meta: { title: '数据分析' } },
      { path: 'accounts', name: 'Accounts', component: () => import('../views/Accounts.vue'), meta: { title: '账户管理' } },
      { path: 'settings', name: 'Settings', component: () => import('../views/Settings.vue'), meta: { title: '系统设置' } },
      // 直播中心
      { path: 'live-monitor', name: 'LiveMonitor', component: () => import('../views/LiveMonitor.vue'), meta: { title: '实时监控' } },
      { path: 'live-comments', name: 'LiveComments', component: () => import('../views/LiveComments.vue'), meta: { title: '智能评论' } },
      { path: 'live-analytics', name: 'LiveAnalytics', component: () => import('../views/LiveAnalytics.vue'), meta: { title: '分时数据' } },
      { path: 'live-speech', name: 'LiveSpeech', component: () => import('../views/LiveSpeech.vue'), meta: { title: '话术抓取' } },
      { path: 'live-alerts', name: 'LiveAlerts', component: () => import('../views/LiveAlerts.vue'), meta: { title: '异常预警' } },
      { path: 'live-replay', name: 'LiveReplay', component: () => import('../views/LiveReplay.vue'), meta: { title: '直播复盘' } },
      { path: 'live-competitor', name: 'LiveCompetitor', component: () => import('../views/LiveCompetitor.vue'), meta: { title: '竞品监控' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('qc_token')
  if (!to.meta.public && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/')
  } else {
    if (to.meta.title) document.title = `${to.meta.title} - 千川监控`
    next()
  }
})

export default router
