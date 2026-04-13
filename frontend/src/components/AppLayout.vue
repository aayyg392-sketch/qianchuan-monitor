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
    <main class="dt-main" ref="mainRef"
      @touchstart.passive="onPtrStart"
      @touchmove.passive="onPtrMove"
      @touchend.passive="onPtrEnd">
      <!-- 下拉刷新指示器 -->
      <div v-if="isMobile" class="ptr-indicator" :class="{ 'ptr-indicator--ready': ptrReady, 'ptr-indicator--loading': ptrLoading }"
           :style="{ transform: 'translateY(' + ptrOffset + 'px)', opacity: Math.min(ptrOffset / 60, 1) }">
        <div class="ptr-spinner">
          <svg v-if="!ptrLoading" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               :style="{ transform: 'rotate(' + (ptrOffset * 3) + 'deg)' }">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <div v-else class="ptr-spin-circle"></div>
        </div>
        <span class="ptr-text">{{ ptrLoading ? '刷新中...' : (ptrReady ? '松手刷新' : '下拉刷新') }}</span>
      </div>
      <div class="dt-content" :style="isMobile && ptrOffset > 0 ? { transform: 'translateY(' + ptrOffset + 'px)', transition: ptrTouching ? 'none' : 'transform 0.3s' } : {}">
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

// Pull-to-refresh
const mainRef = ref(null)
const ptrOffset = ref(0)
const ptrReady = ref(false)
const ptrLoading = ref(false)
const ptrTouching = ref(false)
let ptrStartY = 0
const PTR_THRESHOLD = 60
const PTR_MAX = 80

const onPtrStart = (e) => {
  if (!isMobile.value || ptrLoading.value) return
  const main = mainRef.value
  if (main && main.scrollTop <= 0) {
    ptrStartY = e.touches[0].clientY
    ptrTouching.value = true
  }
}
const onPtrMove = (e) => {
  if (!ptrTouching.value || ptrLoading.value) return
  const dy = e.touches[0].clientY - ptrStartY
  if (dy > 0) {
    const offset = Math.min(dy * 0.5, PTR_MAX)
    ptrOffset.value = offset
    ptrReady.value = offset >= PTR_THRESHOLD
  } else {
    ptrOffset.value = 0
    ptrReady.value = false
  }
}
const onPtrEnd = () => {
  if (!ptrTouching.value) return
  ptrTouching.value = false
  if (ptrReady.value && !ptrLoading.value) {
    ptrLoading.value = true
    ptrOffset.value = PTR_THRESHOLD
    ptrReady.value = false
    setTimeout(() => {
      window.location.reload()
    }, 300)
  } else {
    ptrOffset.value = 0
    ptrReady.value = false
  }
}

const handleResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  window.addEventListener('resize', handleResize)
  loadAlertCount()
  if (auth.token && !auth.permissions.menus?.length) auth.fetchPermissions()
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
const influencerIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
const industryIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
const operationIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`
const liveIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>`

const systemIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
const tiktokIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>`

const openSubMenus = ref({})
const toggleSubMenu = (path) => { openSubMenus.value[path] = !openSubMenus.value[path] }

const _allNavItems = [
  { path: '/', code: '/dashboard', label: '数据概览', icon: homeIcon },
  { path: '/live', label: '直播中心', icon: liveIcon, children: [
    { path: '/live-monitor', label: '实时监控' },
    { path: '/live-analytics', label: '分时数据' },
    { path: '/live-speech', label: '话术抓取' },
    { path: '/live-replay', label: '主播复盘' },
    { path: '/anchor-schedule', label: '主播排班' },
    { path: '/anchor-stats', label: '主播数据' },
  ]},
  { path: '/materials', label: '素材管理', icon: materialIcon, children: [
    { path: '/materials', label: '素材列表' },
    { path: '/material-tasks', label: '素材任务' },
    { path: '/video-production', label: '爆款视频改造' },
    { path: '/material-audit', label: '素材审核' },
    { path: '/super5s', label: '超级5秒镜头' },
    { path: '/ai-text2video', label: 'AI文生视频' },
    { path: '/material-dimensions', label: '内容人员' },
    { path: '/ctr-analysis', label: 'CTR素材分析' },
  ]},
  { path: '/campaigns', label: '账户管理', icon: campaignIcon, children: [
    { path: '/campaigns', label: '账户列表' },
    { path: '/ai-trader', label: 'AI金牌投手' },
    { path: '/premium-materials', label: '优质素材' },
  ]},
  { path: '/audience', label: '达人管理', icon: influencerIcon, children: [
    { path: '/audience-profile', label: '产品人群画像' },
    { path: '/influencer-match', label: '达人合作筛选' },
  ]},
  { path: '/industry', label: '行业管理', icon: industryIcon, children: [
    { path: '/industry-hotspot', label: '行业热点' },
    { path: '/industry-videos', label: '内容榜单' },
    { path: '/competitor-videos', label: '竞品爆款视频' },
  ]},
  { path: '/operations', label: '运营中心', icon: operationIcon, children: [
    { path: '/ops-workbench', label: '运营工作台' },
    { path: '/ops-comments', label: '评论管理' },
    { path: '/push-manager', label: '数据推送管理' },
  ]},
  { path: '/wx-ops', label: '视频号运营中心', icon: operationIcon, children: [
    { path: '/wx-ops-workbench', label: '运营工作台' },
    { path: '/wx-finder-list', label: '达人管理' },
  ]},
  { path: '/ks-ops', label: '快手运营中心', icon: operationIcon, children: [
    { path: '/ks-workbench', label: '运营工作台' },
    { path: '/ks-live-analytics', label: '直播电商联动' },
    { path: '/ks-ad-dashboard', label: '账户管理' },
    { path: '/ks-ad-pitcher', label: 'AI金牌投手' },
    { path: '/ks-reviews', label: '评价管理' },
  ]},
  { path: '/tt-ops', label: '跨境TIKTOK', icon: tiktokIcon, children: [
    { path: '/tt-dashboard', label: '跨境驾驶舱' },
    { path: '/tt-materials', label: '素材管理' },
    { path: '/tt-push', label: '素材推送' },
    { path: '/tt-stats', label: '素材消耗' },
    { path: '/tt-accounts', label: 'TikTok账户' },
  ]},
  { path: '/system', label: '系统管理', icon: systemIcon, children: [
    { path: '/user-manage', code: '/accounts', label: '用户管理' },
    { path: '/role-manage', label: '角色管理' },
    { path: '/operation-logs', label: '操作日志' },
    { path: '/settings', label: '系统设置' },
  ]},
  { path: '/reports', label: '数据分析', icon: chartIcon },
  { path: '/alerts', label: '告警中心', icon: bellIcon, badge: true },
]

// 跨境TikTok - 移动端菜单项（追加）
const _ttMobileItems = [
  { path: '/tt-dashboard', label: '跨境驾驶舱', icon: tiktokIcon },
  { path: '/tt-materials', label: 'TikTok素材', icon: tiktokIcon },
  { path: '/tt-push', label: '素材推送', icon: tiktokIcon },
  { path: '/tt-stats', label: '素材消耗', icon: tiktokIcon },
  { path: '/tt-accounts', label: 'TikTok账户', icon: tiktokIcon },
]

// 默认只展开当前路由所在的父菜单
;(() => {
  const cur = route.path
  for (const item of _allNavItems) {
    if (item.children && item.children.some(c => cur === c.path || cur.startsWith(c.path + '/'))) {
      openSubMenus.value[item.path] = true
    }
  }
})()

// 权限过滤：根据用户权限过滤菜单
const canAccess = (code) => {
  // 跨境TikTok模块：所有登录用户可见
  if (code && (code.startsWith('/tt-') || code === '/tt-ops')) return true
  const perms = auth.permissions
  if (perms.is_super_admin || (perms.menus && perms.menus.includes('*'))) return true
  return perms.menus && perms.menus.includes(code)
}
const navItems = computed(() => {
  return _allNavItems.map(item => {
    const menuCode = item.code || item.path
    if (!item.children) {
      return canAccess(menuCode) ? item : null
    }
    const filteredChildren = item.children.filter(c => canAccess(c.code || c.path))
    if (!filteredChildren.length) return null
    return { ...item, children: filteredChildren }
  }).filter(Boolean)
})
const _mobileNavItems = [
  { path: '/', label: '数据概览', icon: homeIcon },
  { path: '/live-monitor', label: '实时监控', icon: liveIcon },
  { path: '/live-analytics', label: '分时数据', icon: liveIcon },
  { path: '/live-speech', label: '话术抓取', icon: liveIcon },
  { path: '/live-replay', label: '主播复盘', icon: liveIcon },
  { path: '/materials', label: '素材列表', icon: materialIcon },
  { path: '/material-tasks', label: '素材任务', icon: materialIcon },
  { path: '/video-production', label: '爆款视频改造', icon: materialIcon },
  { path: '/material-audit', label: '素材审核', icon: materialIcon },
  { path: '/super5s', label: '超级5秒镜头', icon: materialIcon },
  { path: '/ai-text2video', label: 'AI文生视频', icon: materialIcon },
  { path: '/campaigns', label: '账户列表', icon: campaignIcon },
  { path: '/ai-trader', label: 'AI金牌投手', icon: campaignIcon },
  { path: '/premium-materials', label: '优质素材', icon: campaignIcon },
  { path: '/material-dimensions', label: '内容人员', icon: materialIcon },
  { path: '/audience-profile', label: '产品人群画像', icon: influencerIcon },
  { path: '/influencer-match', label: '达人合作筛选', icon: influencerIcon },
  { path: '/industry-hotspot', label: '行业热点', icon: industryIcon },
  { path: '/industry-videos', label: '内容榜单', icon: industryIcon },
  { path: '/competitor-videos', label: '竞品爆款视频', icon: industryIcon },
  { path: '/ops-workbench', label: '运营工作台', icon: operationIcon },
  { path: '/ops-comments', label: '评论管理', icon: operationIcon },
  { path: '/wx-ops-workbench', label: '视频号工作台', icon: operationIcon },
  { path: '/wx-finder-list', label: '视频号达人', icon: operationIcon },
  { path: '/ks-workbench', label: '快手工作台', icon: operationIcon },
  { path: '/ks-live-analytics', label: '快手直播联动', icon: operationIcon },
  { path: '/ks-reviews', label: '快手评价管理', icon: operationIcon },
  { path: '/reports', label: '数据分析', icon: chartIcon },
  { path: '/alerts', label: '告警中心', icon: bellIcon, badge: true },
  { path: '/user-manage', label: '用户管理', icon: accountIcon },
  { path: '/role-manage', label: '角色管理', icon: systemIcon },
  { path: '/operation-logs', label: '操作日志', icon: systemIcon },
  { path: '/settings', label: '系统设置', icon: settingsIcon },
]
// 移动端菜单也按RBAC过滤
const allNavItems = computed(() => {
  return [..._mobileNavItems, ..._ttMobileItems].filter(item => canAccess(item.path))
})
const _tabItemsDef = [
  { path: '/', label: '数据概览', shortLabel: '概览', icon: homeIcon },
  { path: '/materials', label: '素材监控', shortLabel: '素材', icon: materialIcon },
  { path: '/reports', label: '数据分析', shortLabel: '分析', icon: chartIcon },
  { path: '/alerts', label: '告警中心', shortLabel: '告警', icon: bellIcon, badge: true },
  { path: '/settings', label: '系统设置', shortLabel: '我的', icon: settingsIcon },
]
const tabItems = computed(() => {
  return _tabItemsDef.filter(item => canAccess(item.path))
})

const pageMap = {
  '/': '数据概览', '/materials': '素材管理', '/material-tasks': '素材任务', '/video-production': '爆款视频改造',
  '/material-audit': '素材审核', '/campaigns': '账户列表',
  '/audience-profile': '产品人群画像', '/influencer-match': '达人合作筛选', '/premium-materials': '优质素材', '/material-dimensions': '内容人员',
  '/ai-text2video': 'AI文生视频', '/industry-hotspot': '行业热点', '/industry-videos': '内容榜单', '/competitor-videos': '竞品爆款视频',
  '/ops-workbench': '运营工作台', '/ops-comments': '评论管理',
  '/wx-ops-workbench': '视频号运营工作台', '/wx-finder-list': '达人管理',
  '/ks-workbench': '快手运营工作台', '/ks-live-analytics': '直播电商联动',
  '/ks-reviews': '评价管理',
  '/live-monitor': '实时监控', '/live-comments': '智能评论', '/live-analytics': '分时数据',
  '/live-speech': '话术抓取', '/live-replay': '主播复盘',
  '/anchor-schedule': '主播排班', '/anchor-stats': '主播数据',
  '/ai-trader': 'AI金牌投手',
  '/reports': '数据分析', '/alerts': '告警中心', '/user-manage': '用户管理', '/accounts': '账户列表', '/role-manage': '角色管理', '/operation-logs': '操作日志', '/settings': '系统设置',
  '/tt-dashboard': '跨境驾驶舱', '/tt-materials': '素材管理', '/tt-push': '素材推送', '/tt-stats': '素材消耗', '/tt-accounts': 'TikTok账户'
}
const currentTitle = computed(() => {
  if (route.path.includes('/remix')) return 'AI翻剪推荐'
  return pageMap[route.path] || '千川监控'
})
const isActive = (path) => {
  if (path === '/') return route.path === '/' || route.path === '/dashboard'
  if (path === '/live') return route.path.startsWith('/live-') || route.path.startsWith('/anchor-')
  if (path === '/materials') return route.path === '/materials' || route.path.includes('/remix') || route.path === '/material-tasks' || route.path === '/video-production' || route.path === '/material-audit' || route.path.startsWith('/ai-')
  if (path === '/campaigns') return route.path === '/campaigns'
  if (path === '/audience') return route.path === '/audience-profile' || route.path === '/influencer-match'
  if (path === '/industry') return route.path.startsWith('/industry')
  if (path === '/operations') return route.path.startsWith('/ops-')
  if (path === '/ks-ops') return route.path.startsWith('/ks-')
  if (path === '/tt-ops') return route.path.startsWith('/tt-')
  if (path === '/system') return route.path === '/user-manage' || route.path === '/role-manage' || route.path === '/operation-logs' || route.path === '/settings'
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
  pointer-events: auto !important;
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
  max-width: 1600px;
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
/* ===== Pull-to-Refresh ===== */
.ptr-indicator {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 50px; margin-top: -50px;
  color: #8c8c8c; font-size: 12px; font-weight: 500;
  transition: transform 0.3s, opacity 0.3s;
  z-index: 1; pointer-events: none;
}
.ptr-indicator--ready { color: #1677ff; }
.ptr-indicator--loading { color: #1677ff; }
.ptr-spinner { display: flex; align-items: center; justify-content: center; }
.ptr-spin-circle {
  width: 18px; height: 18px; border: 2px solid #e5e7eb;
  border-top-color: #1677ff; border-radius: 50%;
  animation: ptr-spin 0.7s linear infinite;
}
@keyframes ptr-spin { to { transform: rotate(360deg); } }
.ptr-text { white-space: nowrap; }
.dt-main { position: relative; overflow-x: hidden; }
</style>
