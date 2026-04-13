<template>
  <div class="layout" :class="{ 'layout--mobile': isMobile }">

    <!-- ===== 顶部导航栏 ===== -->
    <header class="dt-header">
      <div class="dt-header__inner">
        <!-- 移动端：菜单按钮 / 桌面端：Logo -->
        <div class="dt-header__left">
          <div v-if="!isMobile" class="dt-logo">
            <div class="dt-logo__icon">千</div>
            <div class="dt-logo__text">
              <span class="dt-logo__name">千川监控</span>
              <span class="dt-logo__sub">广告数据平台</span>
            </div>
          </div>
          <button v-else class="dt-icon-btn" @click="drawerVisible = true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <h1 v-if="isMobile" class="dt-page-title">{{ currentTitle }}</h1>
        </div>
        <div class="dt-header__right">
          <span v-if="!isMobile" class="dt-header__page-name">{{ currentTitle }}</span>
          <a-badge :count="alertCount" :offset="[-2, 2]">
            <button class="dt-icon-btn" @click="$router.push('/alerts')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
          </a-badge>
          <div class="dt-avatar" @click="$router.push('/settings')">
            <span>{{ userInitial }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- ===== 桌面端侧边栏 ===== -->
    <aside v-if="!isMobile" class="dt-sidebar">
      <nav class="dt-nav">
        <template v-for="item in navItems" :key="item.path">
          <!-- 有子菜单的项 -->
          <template v-if="item.children">
            <div class="dt-nav__group">
              <div class="dt-nav__item" :class="{ 'dt-nav__item--active': isActive(item.path) }" @click="toggleSubMenu(item.path)">
                <span class="dt-nav__icon" v-html="item.icon"></span>
                <span class="dt-nav__label">{{ item.label }}</span>
                <svg class="dt-nav__arrow" :class="{ 'dt-nav__arrow--open': openSubMenus[item.path] }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div class="dt-nav__sub" v-show="openSubMenus[item.path]">
                <router-link v-for="child in item.children" :key="child.path"
                  :to="child.path" class="dt-nav__sub-item"
                  :class="{ 'dt-nav__sub-item--active': route.path === child.path }">
                  <span class="dt-nav__sub-dot"></span>
                  <span>{{ child.label }}</span>
                </router-link>
              </div>
            </div>
          </template>
          <!-- 无子菜单的普通项 -->
          <router-link v-else :to="item.path" class="dt-nav__item"
            :class="{ 'dt-nav__item--active': isActive(item.path) }">
            <span class="dt-nav__icon" v-html="item.icon"></span>
            <span class="dt-nav__label">{{ item.label }}</span>
            <a-badge v-if="item.badge" :count="alertCount" size="small" style="margin-left:auto" />
          </router-link>
        </template>
      </nav>
      <div class="dt-sidebar__footer">
        <button class="dt-sync-btn" @click="handleSync" :disabled="syncing">
          <svg class="dt-sync-btn__icon" :class="{ 'spinning': syncing }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {{ syncing ? '同步中...' : '立即同步' }}
        </button>
        <div class="dt-sidebar__sync-time">
          {{ lastSyncTime ? '最后: ' + lastSyncTime : '暂未同步' }}
        </div>
      </div>
    </aside>

    <!-- ===== 移动端抽屉导航 ===== -->
    <div v-if="isMobile && drawerVisible" class="dt-drawer-overlay" @click="drawerVisible=false"></div>
    <div v-if="isMobile" class="dt-drawer" :class="{ 'dt-drawer--open': drawerVisible }">
      <div class="dt-drawer__header">
        <div class="dt-logo">
          <div class="dt-logo__icon">千</div>
          <div class="dt-logo__text">
            <span class="dt-logo__name">千川监控</span>
            <span class="dt-logo__sub">广告数据平台</span>
          </div>
        </div>
        <button class="dt-icon-btn" @click="drawerVisible=false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <nav class="dt-drawer__nav">
        <router-link v-for="item in allNavItems" :key="item.path"
          :to="item.path" class="dt-drawer__item"
          :class="{ 'dt-drawer__item--active': isActive(item.path) }"
          @click="drawerVisible=false">
          <span class="dt-drawer__icon" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
      <div class="dt-drawer__footer">
        <button class="dt-sync-btn dt-sync-btn--full" @click="handleSync" :disabled="syncing">
          <svg class="dt-sync-btn__icon" :class="{ 'spinning': syncing }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {{ syncing ? '同步中...' : '立即同步数据' }}
        </button>
      </div>
    </div>

    <!-- ===== 主内容区 ===== -->
    <main class="dt-main">
      <div class="dt-content">
        <router-view />
      </div>
    </main>

    <!-- ===== 移动端底部标签栏 ===== -->
    <nav v-if="isMobile" class="dt-tabnav">
      <router-link v-for="item in tabItems" :key="item.path"
        :to="item.path" class="dt-tabnav__item"
        :class="{ 'dt-tabnav__item--active': isActive(item.path) }">
        <div class="dt-tabnav__icon-wrap">
          <a-badge v-if="item.badge" :count="alertCount" size="small" :offset="[6, -2]">
            <span v-html="item.icon"></span>
          </a-badge>
          <span v-else v-html="item.icon"></span>
        </div>
        <span class="dt-tabnav__label">{{ item.shortLabel }}</span>
      </router-link>
    </nav>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { message } from 'ant-design-vue'
import request from '../utils/request'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isMobile = ref(window.innerWidth < 768)
const drawerVisible = ref(false)
const syncing = ref(false)
const alertCount = ref(0)
const lastSyncTime = ref('')

const handleResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  window.addEventListener('resize', handleResize)
  loadAlertCount()
})
onUnmounted(() => window.removeEventListener('resize', handleResize))

const userInitial = computed(() => {
  const name = auth.user?.username || 'U'
  return name.charAt(0).toUpperCase()
})

const homeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
const homeIconFill = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="white" stroke-width="1.5"/></svg>`
const materialIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`
const chartIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`
const bellIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
const settingsIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>`
const campaignIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
const accountIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`

const openSubMenus = ref({ '/materials': true, '/campaigns': true })
const toggleSubMenu = (path) => { openSubMenus.value[path] = !openSubMenus.value[path] }

const navItems = [
  { path: '/', label: '数据概览', icon: homeIcon },
  { path: '/materials', label: '素材管理', icon: materialIcon, children: [
    { path: '/materials', label: '素材列表' },
    { path: '/material-tasks', label: '素材任务' },
    { path: '/video-production', label: 'AI视频生产' },
    { path: '/material-summary', label: '爆款素材总结' },
    { path: '/material-audit', label: '素材审核' },
    { path: '/super5s', label: '超级5秒镜头' },
    { path: '/ai-image-video', label: 'AI图生视频' },
    { path: '/ai-text-video', label: 'AI文生视频' },
    { path: '/ai-match', label: 'AI素材库匹配' },
    { path: '/ai-hot-material', label: 'AI爆款素材' },
  ]},
  { path: '/campaigns', label: '账户管理', icon: campaignIcon, children: [
    { path: '/campaigns', label: '计划管理' },
    { path: '/ai-pitcher', label: 'AI金牌投手' },
    { path: '/incubation', label: '爆款孵化计划' },
  ]},
  { path: '/reports', label: '数据分析', icon: chartIcon },
  { path: '/alerts', label: '告警中心', icon: bellIcon, badge: true },
]
const allNavItems = [
  { path: '/', label: '数据概览', icon: homeIcon },
  { path: '/materials', label: '素材列表', icon: materialIcon },
  { path: '/material-tasks', label: '素材任务', icon: materialIcon },
  { path: '/video-production', label: 'AI视频生产', icon: materialIcon },
  { path: '/material-summary', label: '爆款素材总结', icon: materialIcon },
  { path: '/campaigns', label: '计划管理', icon: campaignIcon },
  { path: '/ai-pitcher', label: 'AI金牌投手', icon: campaignIcon },
  { path: '/incubation', label: '爆款孵化计划', icon: campaignIcon },
  { path: '/reports', label: '数据分析', icon: chartIcon },
  { path: '/alerts', label: '告警中心', icon: bellIcon, badge: true },
  { path: '/accounts', label: '账户管理', icon: accountIcon },
  { path: '/settings', label: '系统设置', icon: settingsIcon },
]
const tabItems = [
  { path: '/', label: '数据概览', shortLabel: '概览', icon: homeIcon },
  { path: '/materials', label: '素材监控', shortLabel: '素材', icon: materialIcon },
  { path: '/reports', label: '数据分析', shortLabel: '分析', icon: chartIcon },
  { path: '/alerts', label: '告警中心', shortLabel: '告警', icon: bellIcon, badge: true },
  { path: '/settings', label: '系统设置', shortLabel: '我的', icon: settingsIcon },
]

const pageMap = {
  '/': '数据概览', '/materials': '素材管理', '/material-tasks': '素材任务', '/video-production': 'AI视频生产',
  '/material-summary': '爆款素材总结', '/material-audit': '素材审核', '/super5s': '超级5秒镜头', '/ai-image-video': 'AI图生视频', '/ai-text-video': 'AI文生视频', '/ai-match': 'AI素材库匹配', '/ai-hot-material': 'AI爆款素材', '/campaigns': '计划管理', '/incubation': '爆款孵化计划',
  '/reports': '数据分析', '/alerts': '告警中心', '/accounts': '账户管理', '/settings': '系统设置'
}
const currentTitle = computed(() => {
  if (route.path.includes('/remix')) return 'AI翻剪推荐'
  return pageMap[route.path] || '千川监控'
})
const isActive = (path) => {
  if (path === '/') return route.path === '/' || route.path === '/dashboard'
  if (path === '/materials') return route.path === '/materials' || route.path.includes('/remix') || route.path === '/material-tasks' || route.path === '/video-production' || route.path === '/material-summary'
  if (path === '/campaigns') return route.path === '/campaigns' || route.path === '/incubation' || route.path === '/ai-pitcher'
  return route.path.startsWith(path)
}

const loadAlertCount = async () => {
  try {
    const res = await request.get('/alerts/history', { params: { page: 1, pageSize: 1 } })
    alertCount.value = res?.data?.total || 0
  } catch {}
}

const handleSync = async () => {
  syncing.value = true
  try {
    const accounts = await request.get('/accounts')
    const list = accounts?.data || []
    for (const acc of list) {
      if (acc.status === 1) await request.post(`/accounts/${acc.id}/sync`)
    }
    message.success('数据同步已启动')
    lastSyncTime.value = dayjs().format('HH:mm')
  } catch (e) {
    message.error('同步失败')
  } finally {
    syncing.value = false
  }
}
</script>

<style scoped>
/* ===== Layout Container ===== */
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ===== Header ===== */
.dt-header {
  pointer-events: auto !important;
  position: fixed;
  top: 0; left: 0; right: 0;
  height: var(--header-h);
  background: #fff;
  border-bottom: 1px solid var(--border);
  z-index: 1002;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.dt-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 16px;
}
.dt-header__left { display: flex; align-items: center; gap: 10px; }
.dt-header__right { display: flex; align-items: center; gap: 8px; }
.dt-header__page-name {
  font-size: 13px;
  color: var(--text-hint);
  margin-right: 8px;
}

/* ===== Logo ===== */
.dt-logo { display: flex; align-items: center; gap: 10px; }
.dt-logo__icon {
  width: 32px; height: 32px;
  background: linear-gradient(135deg, #1677FF 0%, #4096FF 100%);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700;
  flex-shrink: 0;
}
.dt-logo__name { display: block; font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
.dt-logo__sub { display: block; font-size: 10px; color: var(--text-hint); line-height: 1; }

/* ===== Icon Button ===== */
.dt-icon-btn {
  width: 36px; height: 36px;
  border: none; background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.dt-icon-btn:hover { background: var(--bg-secondary); color: var(--c-primary); }
.dt-icon-btn:active { background: var(--c-primary-bg); }

/* ===== Avatar ===== */
.dt-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1677FF, #722ED1);
  color: #fff;
  font-size: 13px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

/* ===== Page Title (mobile) ===== */
.dt-page-title {
  font-size: 16px; font-weight: 600;
  color: var(--text-primary);
}

/* ===== Sidebar (desktop) ===== */
.dt-sidebar {
  pointer-events: auto !important;
  position: fixed;
  top: var(--header-h); left: 0; bottom: 0;
  width: var(--sidebar-w);
  background: #fff;
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  padding: 12px 0;
  overflow-y: auto;
  z-index: 1001;
}

/* ===== Sidebar Nav ===== */
.dt-nav { flex: 1; padding: 4px 0; }
.dt-nav__item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  margin: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px; font-weight: 500;
  transition: all 0.15s;
  cursor: pointer;
}
.dt-nav__item:hover { background: var(--bg-secondary); color: var(--text-primary); }
.dt-nav__item--active {
  background: var(--c-primary-bg) !important;
  color: var(--c-primary) !important;
}
.dt-nav__item--active .dt-nav__icon { color: var(--c-primary); }
.dt-nav__icon { flex-shrink: 0; display: flex; }
.dt-nav__label { flex: 1; }

/* ===== Sub Menu ===== */
.dt-nav__group { position: relative; }
.dt-nav__arrow {
  flex-shrink: 0; color: var(--text-hint);
  transition: transform 0.2s;
}
.dt-nav__arrow--open { transform: rotate(180deg); }
.dt-nav__sub {
  padding: 2px 0 4px;
}
.dt-nav__sub-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px 8px 44px;
  margin: 1px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-hint);
  text-decoration: none;
  font-size: 12px; font-weight: 500;
  transition: all 0.15s;
  cursor: pointer;
}
.dt-nav__sub-item:hover { background: var(--bg-secondary); color: var(--text-primary); }
.dt-nav__sub-item--active {
  color: var(--c-primary) !important;
  background: var(--c-primary-bg) !important;
}
.dt-nav__sub-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--text-hint);
  flex-shrink: 0;
}
.dt-nav__sub-item--active .dt-nav__sub-dot { background: var(--c-primary); }

/* ===== Sidebar Footer ===== */
.dt-sidebar__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--divider);
}
.dt-sidebar__sync-time {
  font-size: 11px; color: var(--text-hint);
  margin-top: 6px; text-align: center;
}

/* ===== Sync Button ===== */
.dt-sync-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.dt-sync-btn:hover:not(:disabled) { background: var(--c-primary-bg); color: var(--c-primary); border-color: var(--c-primary); }
.dt-sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dt-sync-btn--full { width: 100%; }
.dt-sync-btn__icon { flex-shrink: 0; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; }

/* ===== Mobile Drawer ===== */
.dt-drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 200;
  backdrop-filter: blur(2px);
}
.dt-drawer {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 260px;
  background: #fff;
  z-index: 210;
  transform: translateX(-100%);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex; flex-direction: column;
  box-shadow: 4px 0 20px rgba(0,0,0,0.1);
}
.dt-drawer--open { transform: translateX(0); }
.dt-drawer__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.dt-drawer__nav { flex: 1; padding: 8px 0; overflow-y: auto; }
.dt-drawer__item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 20px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px; font-weight: 500;
  transition: all 0.15s;
}
.dt-drawer__item:hover { background: var(--bg-secondary); color: var(--text-primary); }
.dt-drawer__item--active { color: var(--c-primary); background: var(--c-primary-bg); }
.dt-drawer__icon { display: flex; flex-shrink: 0; }
.dt-drawer__footer { padding: 16px; border-top: 1px solid var(--border); }

/* ===== Main Content ===== */
.dt-main {
  flex: 1;
  padding-top: var(--header-h);
}
.dt-content {
  padding: 16px;
  max-width: 1280px;
  margin: 0 auto;
}

/* ===== Bottom Tab Navigation ===== */
.dt-tabnav {
  pointer-events: auto !important;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: calc(var(--tabnav-h) + var(--safe-b));
  padding-bottom: var(--safe-b);
  background: #fff;
  border-top: 1px solid var(--border);
  display: flex;
  z-index: 1001;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.04);
}
.dt-tabnav__item {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: var(--text-hint);
  transition: color 0.15s;
  padding: 6px 4px 0;
  min-height: var(--tabnav-h);
}
.dt-tabnav__item--active { color: var(--c-primary); }
.dt-tabnav__icon-wrap { position: relative; display: flex; }
.dt-tabnav__label { font-size: 10px; font-weight: 500; line-height: 1; }

/* ===== Desktop layout adjustments ===== */
@media (min-width: 768px) {
  .dt-header__inner { padding: 0 20px 0 calc(var(--sidebar-w) + 20px); }
  .dt-main { padding-left: var(--sidebar-w); }
  .dt-content { padding: 20px 24px; }
}
</style>
