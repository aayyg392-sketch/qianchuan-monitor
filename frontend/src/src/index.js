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
      { path: 'material-tasks', name: 'MaterialTasks', component: () => import('../views/MaterialTasks.vue'), meta: { title: '素材任务' } },
      { path: 'video-production', name: 'VideoProduction', component: () => import('../views/VideoProduction.vue'), meta: { title: 'AI视频生产' } },
      { path: 'material-summary', name: 'HotMaterialSummary', component: () => import('../views/HotMaterialSummary.vue'), meta: { title: '爆款素材总结' } },
      { path: 'incubation', name: 'Incubation', component: () => import('../views/Incubation.vue'), meta: { title: '爆款孵化计划' } },
      { path: 'campaigns', name: 'Campaigns', component: () => import('../views/Campaigns.vue'), meta: { title: '计划管理' } },
      { path: 'alerts', name: 'Alerts', component: () => import('../views/Alerts.vue'), meta: { title: '告警中心' } },
      { path: 'reports', name: 'Reports', component: () => import('../views/Reports.vue'), meta: { title: '数据分析' } },
      { path: 'accounts', name: 'Accounts', component: () => import('../views/Accounts.vue'), meta: { title: '账户管理' } },
      { path: 'settings', name: 'Settings', component: () => import('../views/Settings.vue'), meta: { title: '系统设置' } },
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
