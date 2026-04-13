<template>
  <div class="anchor-schedule-page" :class="{ 'is-mobile': isMobile }">
    <!-- 顶部栏 - DingTalk style -->
    <div class="top-bar">
      <div class="date-nav">
        <button class="nav-btn" @click="changeDate(-1)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="date-pill" @click="showDatePicker = true">
          <span class="date-text">{{ currentDateLabel }}</span>
        </div>
        <button class="nav-btn" @click="changeDate(1)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="today-btn" v-if="!isToday" @click="goToday">今天</button>
      </div>
      <div class="top-actions">
        <button class="dd-btn primary" @click="showAddAnchor = true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <span>添加主播</span>
        </button>
        <button class="dd-btn" @click="sendAllNotify" :disabled="notifyLoading" style="margin-left:8px;color:#1677FF;border-color:#1677FF;">
          <span>{{ notifyLoading ? '发送中...' : '📢 发送排班通知' }}</span>
        </button>
        <a-tooltip placement="bottomRight" :overlayStyle="{ maxWidth: '320px' }">
          <template #title>
            <div class="help-tip-content">
              <div class="help-tip-item"><b>拖拽排班</b> - 在空白区域按住拖拽创建</div>
              <div class="help-tip-item"><b>快速创建</b> - 双击空白处创建30分钟排班</div>
              <div class="help-tip-item"><b>调整时长</b> - 拖拽色块上/下边缘</div>
              <div class="help-tip-item"><b>移动排班</b> - 拖拽色块中间部分</div>
              <div class="help-tip-item"><b>主播拖入</b> - 从主播列表拖入时间轴</div>
              <div class="help-tip-item"><b>编辑/删除</b> - 点击色块打开编辑</div>
              <div class="help-tip-item"><b>手机操作</b> - 长按500ms后拖拽</div>
            </div>
          </template>
          <button class="help-btn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6.5C6.5 5.67 7.17 5 8 5C8.83 5 9.5 5.67 9.5 6.5C9.5 7.33 8.83 8 8 8V9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/></svg>
          </button>
        </a-tooltip>
      </div>
    </div>

    <!-- Mobile anchor tab bar -->
    <div class="mobile-anchor-tabs" v-if="isMobile && anchors.length">
      <div class="tabs-scroll">
        <div
          v-for="(anchor, idx) in anchors"
          :key="'tab-' + anchor.id"
          class="anchor-tab"
          :class="{ active: mobileActiveAnchorIdx === idx }"
          @click="mobileActiveAnchorIdx = idx"
        >
          <div class="tab-avatar" :style="{ background: getColor(anchor.id) }">
            {{ anchor.name?.charAt(0) }}
          </div>
          <span class="tab-name">{{ anchor.name }}</span>
        </div>
      </div>
    </div>

    <!-- 日期选择弹窗 -->
    <a-modal v-model:open="showDatePicker" title="选择日期" :footer="null" :width="320" destroyOnClose centered>
      <input type="date" class="date-input" :value="currentDate" @change="onDatePick" />
    </a-modal>

    <!-- 主体区域 -->
    <div class="main-body">
      <!-- 时间轴排班表 -->
      <div class="timeline-wrapper">
        <!-- 主播列头 (desktop only) -->
        <div class="header-row" v-if="!isMobile">
          <div class="time-gutter-header"></div>
          <div class="columns-header" ref="columnsHeaderRef">
            <div
              v-for="anchor in anchors"
              :key="anchor.id"
              class="anchor-col-header"
              :style="{ minWidth: colWidth + 'px', width: colWidth + 'px' }"
            >
              <div class="anchor-avatar" :style="{ background: getColor(anchor.id) }">
                {{ anchor.name?.charAt(0) }}
              </div>
              <span class="anchor-name">{{ anchor.name }}</span>
            </div>
          </div>
        </div>

        <!-- 可滚动区域 -->
        <div class="scroll-area" ref="scrollAreaRef" @scroll="onScroll">
          <!-- 时间刻度 -->
          <div class="time-gutter">
            <div v-for="h in 25" :key="h - 1" class="time-label" :style="{ top: (h - 1) * 60 + 'px' }">
              {{ String(h - 1).padStart(2, '0') }}:00
            </div>
          </div>

          <!-- 网格+排班列 -->
          <div
            class="grid-container"
            ref="gridRef"
            @mousedown="onGridMouseDown"
            @mousemove="onGridMouseMove"
            @mouseup="onGridMouseUp"
            @mouseleave="onGridMouseUp"
            @touchstart.passive="onGridTouchStart"
            @touchmove="onGridTouchMove"
            @touchend="onGridTouchEnd"
            @dblclick="onGridDblClick"
          >
            <!-- 横向网格线 (half-hour) -->
            <div v-for="i in 48" :key="'line-' + i" class="grid-line" :style="{ top: i * 30 + 'px' }"></div>

            <!-- 整点加粗线 -->
            <div v-for="h in 24" :key="'hour-' + h" class="grid-line-hour" :style="{ top: h * 60 + 'px' }"></div>

            <!-- 当前时间线 -->
            <div v-if="isToday" class="now-line" :style="{ top: nowLineY + 'px' }">
              <div class="now-dot"></div>
              <div class="now-label">{{ nowTimeLabel }}</div>
            </div>

            <!-- 主播列 -->
            <div
              v-for="(anchor, colIdx) in visibleAnchors"
              :key="'col-' + anchor.id"
              class="anchor-column"
              :style="isMobile
                ? { left: '0px', width: '100%' }
                : { left: colIdx * colWidth + 'px', width: colWidth + 'px' }"
              :data-anchor-id="anchor.id"
              :data-col-idx="isMobile ? mobileActiveAnchorIdx : colIdx"
            >
              <!-- 排班色块 -->
              <div
                v-for="sch in getSchedules(anchor.id)"
                :key="sch.id"
                class="schedule-block"
                :style="blockStyle(sch, anchor.id)"
                :data-schedule-id="sch.id"
                @mousedown.stop="onBlockMouseDown(sch, anchor.id, $event)"
                @touchstart.stop="onBlockTouchStart(sch, anchor.id, $event)"
                @click.stop="onBlockClick(sch, anchor.id)"
              >
                <!-- 顶部拖拽把手 -->
                <div class="resize-handle resize-top" @mousedown.stop="onResizeMouseDown(sch, anchor.id, 'top', $event)" @touchstart.stop.prevent="onResizeTouchStart(sch, anchor.id, 'top', $event)"></div>
                <div class="block-content">
                  <span class="block-time">{{ sch.start_time }} - {{ sch.end_time }}</span>
                  <span class="block-anchor">{{ getAnchorName(anchor.id) }}</span>
                </div>
                <!-- 底部拖拽把手 -->
                <div class="resize-handle resize-bottom" @mousedown.stop="onResizeMouseDown(sch, anchor.id, 'bottom', $event)" @touchstart.stop.prevent="onResizeTouchStart(sch, anchor.id, 'bottom', $event)"></div>
              </div>
            </div>

            <!-- 拖拽创建预览 -->
            <div v-if="creating" class="schedule-block creating-block" :style="creatingStyle"></div>

            <!-- 拖拽中的幽灵块 -->
            <div v-if="dragging && dragGhost" class="schedule-block drag-ghost" :style="dragGhostStyle"></div>
          </div>
        </div>
      </div>

      <!-- 主播池 (desktop sidebar / mobile bottom sheet) -->
      <div class="anchor-pool" :class="{ 'pool-expanded': mobilePoolOpen }">
        <div class="pool-header" @click="isMobile && (mobilePoolOpen = !mobilePoolOpen)">
          <span class="pool-title">主播列表</span>
          <span class="pool-count" v-if="anchors.length">{{ anchors.length }}</span>
          <svg v-if="isMobile" class="pool-chevron" :class="{ rotated: mobilePoolOpen }" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 10L8 6L12 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="pool-list">
          <div
            v-for="anchor in anchors"
            :key="'pool-' + anchor.id"
            class="pool-card"
            :draggable="true"
            @dragstart="onPoolDragStart(anchor, $event)"
            @dragend="onPoolDragEnd"
          >
            <div class="pool-avatar" :style="{ background: getColor(anchor.id) }">
              {{ anchor.name?.charAt(0) }}
            </div>
            <span class="pool-name">{{ anchor.name }}</span>
            <a-popconfirm title="确认删除该主播？" @confirm="deleteAnchor(anchor.id)" okText="确认" cancelText="取消">
              <button class="pool-delete" @click.stop>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
              </button>
            </a-popconfirm>
          </div>
          <div v-if="!anchors.length" class="pool-empty">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="16" r="6" stroke="#CCC" stroke-width="1.5"/><path d="M10 32C10 27.58 14.48 24 20 24C25.52 24 30 27.58 30 32" stroke="#CCC" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span>暂无主播</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑排班弹窗 -->
    <a-modal v-model:open="editModal.visible" title="编辑排班" @ok="saveEdit" okText="保存" cancelText="取消" :width="isMobile ? '90%' : 400" destroyOnClose centered>
      <a-form layout="vertical" class="dd-form">
        <a-form-item label="主播">
          <div class="edit-anchor-info">
            <div class="edit-anchor-avatar" :style="{ background: editModal.anchorColor }">
              {{ editModal.anchorName?.charAt(0) }}
            </div>
            <span>{{ editModal.anchorName }}</span>
          </div>
        </a-form-item>
        <a-form-item label="开始时间">
          <a-input v-model:value="editModal.startTime" placeholder="HH:mm" class="dd-input" />
        </a-form-item>
        <a-form-item label="结束时间">
          <a-input v-model:value="editModal.endTime" placeholder="HH:mm" class="dd-input" />
        </a-form-item>
      </a-form>
      <div class="edit-actions">
        <a-popconfirm title="确认删除该排班？" @confirm="deleteSchedule(editModal.scheduleId)" okText="确认" cancelText="取消">
          <button class="dd-btn danger-outline">删除排班</button>
        </a-popconfirm>
        <button class="dd-btn outline" @click="notifyAnchor(editModal.scheduleId)">发送通知</button>
      </div>
    </a-modal>

    <!-- 添加主播弹窗 -->
    <a-modal v-model:open="showAddAnchor" title="添加主播" @ok="addAnchor" okText="添加" cancelText="取消" :width="isMobile ? '90%' : 400" destroyOnClose centered>
      <a-form layout="vertical" class="dd-form">
        <a-form-item label="主播名称">
          <a-input v-model:value="newAnchorName" placeholder="请输入主播名称" class="dd-input" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import request from '../utils/request'

// ========== 常量 ==========
const COLORS = ['#1677FF', '#00B578', '#FF8F1F', '#EB2F96', '#722ED1', '#13C2C2', '#FF3141', '#2F54EB']
const ROW_HEIGHT = 30 // 每30分钟30px
const HOUR_HEIGHT = 60 // 每小时60px
const TOTAL_HEIGHT = 1440 // 24 * 60
const SNAP = 30 // 对齐到30分钟
const LONG_PRESS_MS = 500
const MIN_COL_WIDTH = 80

// ========== 状态 ==========
const currentDate = ref(dayjs().format('YYYY-MM-DD'))
const anchors = ref([])
const schedules = ref([])
const colWidth = ref(120)
const showDatePicker = ref(false)
const showAddAnchor = ref(false)
const notifyLoading = ref(false)
const newAnchorName = ref('')
const scrollAreaRef = ref(null)
const columnsHeaderRef = ref(null)
const gridRef = ref(null)
const nowLineY = ref(0)
let nowTimer = null

// Mobile
const isMobile = ref(false)
const mobileActiveAnchorIdx = ref(0)
const mobilePoolOpen = ref(false)

// 拖拽创建
const creating = ref(false)
const createState = reactive({ anchorId: null, colIdx: -1, startY: 0, endY: 0 })

// 色块拖拽移动
const dragging = ref(false)
const dragState = reactive({ schedule: null, anchorId: null, offsetY: 0, currentY: 0, startTop: 0 })
const dragGhost = ref(false)

// 色块resize
const resizing = ref(false)
const resizeState = reactive({ schedule: null, anchorId: null, edge: '', startY: 0, origTop: 0, origBottom: 0 })

// 触摸长按
let touchTimer = null
let touchStartInfo = null

// 编辑弹窗
const editModal = reactive({ visible: false, scheduleId: null, anchorName: '', anchorColor: '#1677FF', startTime: '', endTime: '' })

// 主播池拖拽
const poolDragAnchor = ref(null)

// 防止拖拽后触发click
let didDrag = false

// ========== 计算属性 ==========
const currentDateLabel = computed(() => {
  const d = dayjs(currentDate.value)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.format('M月D日')} ${weekdays[d.day()]}`
})

const isToday = computed(() => currentDate.value === dayjs().format('YYYY-MM-DD'))

const nowTimeLabel = computed(() => {
  const h = Math.floor(nowLineY.value / 60)
  const m = nowLineY.value % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

const visibleAnchors = computed(() => {
  if (isMobile.value && anchors.value.length) {
    const anchor = anchors.value[mobileActiveAnchorIdx.value]
    return anchor ? [anchor] : []
  }
  return anchors.value
})

const creatingStyle = computed(() => {
  if (!creating.value) return {}
  const top = Math.min(createState.startY, createState.endY)
  const height = Math.abs(createState.endY - createState.startY)
  const anchorId = createState.anchorId
  const color = getColor(anchorId)
  if (isMobile.value) {
    return {
      top: top + 'px',
      height: Math.max(height, ROW_HEIGHT) + 'px',
      left: '0px',
      width: '100%',
      background: hexToRgba(color, 0.18),
      borderLeft: `4px solid ${color}`,
      pointerEvents: 'none',
      zIndex: 10
    }
  }
  return {
    top: top + 'px',
    height: Math.max(height, ROW_HEIGHT) + 'px',
    left: createState.colIdx * colWidth.value + 'px',
    width: colWidth.value + 'px',
    background: hexToRgba(color, 0.18),
    borderLeft: `4px solid ${color}`,
    pointerEvents: 'none',
    zIndex: 10
  }
})

const dragGhostStyle = computed(() => {
  if (!dragging.value || !dragGhost.value) return {}
  const sch = dragState.schedule
  const duration = timeToMinutes(sch.end_time) - timeToMinutes(sch.start_time)
  const height = duration // 1px per minute
  const color = getColor(dragState.anchorId)
  if (isMobile.value) {
    return {
      top: dragState.currentY + 'px',
      height: height + 'px',
      left: '0px',
      width: '100%',
      background: hexToRgba(color, 0.25),
      borderLeft: `4px solid ${color}`,
      opacity: 0.7,
      pointerEvents: 'none',
      zIndex: 20
    }
  }
  const anchorIdx = anchors.value.findIndex(a => a.id === dragState.anchorId)
  return {
    top: dragState.currentY + 'px',
    height: height + 'px',
    left: anchorIdx * colWidth.value + 'px',
    width: colWidth.value + 'px',
    background: hexToRgba(color, 0.25),
    borderLeft: `4px solid ${color}`,
    opacity: 0.7,
    pointerEvents: 'none',
    zIndex: 20
  }
})

// ========== 工具函数 ==========
function getColor(anchorId) {
  const idx = anchors.value.findIndex(a => a.id === anchorId)
  return COLORS[idx >= 0 ? idx % COLORS.length : 0]
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function timeToY(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function yToTime(y) {
  const snapped = Math.round(y / SNAP) * SNAP
  const clamped = Math.max(0, Math.min(snapped, 1440))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snapY(y) {
  return Math.round(y / SNAP) * SNAP
}

function getSchedules(anchorId) {
  return schedules.value.filter(s => s.anchor_id === anchorId)
}

function getAnchorName(anchorId) {
  return anchors.value.find(a => a.id === anchorId)?.name || ''
}

function blockStyle(sch, anchorId) {
  const top = timeToY(sch.start_time)
  const bottom = timeToY(sch.end_time)
  const height = bottom - top
  const color = getColor(anchorId)
  return {
    top: top + 'px',
    height: height + 'px',
    background: '#FFFFFF',
    borderLeft: `4px solid ${color}`,
    color: '#333333',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
  }
}

function getGridPosition(e) {
  const grid = gridRef.value
  if (!grid) return null
  const rect = grid.getBoundingClientRect()
  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
  const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0
  const x = clientX - rect.left
  const y = clientY - rect.top

  if (isMobile.value) {
    const anchorId = anchors.value[mobileActiveAnchorIdx.value]?.id
    return { x, y: Math.max(0, Math.min(y, TOTAL_HEIGHT)), colIdx: mobileActiveAnchorIdx.value, anchorId }
  }

  const colIdx = Math.floor(x / colWidth.value)
  if (colIdx < 0 || colIdx >= anchors.value.length) return null
  return { x, y: Math.max(0, Math.min(y, TOTAL_HEIGHT)), colIdx, anchorId: anchors.value[colIdx]?.id }
}

function updateNowLine() {
  const now = dayjs()
  nowLineY.value = now.hour() * 60 + now.minute()
}

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

function updateColWidth() {
  if (isMobile.value) {
    colWidth.value = 100 // not used in mobile single-column mode
    return
  }
  const container = scrollAreaRef.value
  if (!container) return
  const gutterWidth = 56
  const available = container.clientWidth - gutterWidth
  const w = anchors.value.length ? Math.max(MIN_COL_WIDTH, Math.floor(available / anchors.value.length)) : 120
  colWidth.value = w
}

// ========== 日期操作 ==========
function changeDate(delta) {
  currentDate.value = dayjs(currentDate.value).add(delta, 'day').format('YYYY-MM-DD')
  fetchSchedules()
}

function goToday() {
  currentDate.value = dayjs().format('YYYY-MM-DD')
  fetchSchedules()
}

function onDatePick(e) {
  currentDate.value = e.target.value
  showDatePicker.value = false
  fetchSchedules()
}

// ========== API ==========
async function fetchAnchors() {
  try {
    const res = await request.get('/anchor/anchors')
    anchors.value = res.data?.data || res.data || []
    nextTick(updateColWidth)
  } catch (e) {
    message.error('获取主播列表失败')
  }
}

async function fetchSchedules() {
  try {
    const res = await request.get('/anchor/schedules', {
      params: { date_start: currentDate.value, date_end: currentDate.value }
    })
    schedules.value = res.data?.data || res.data || []
  } catch (e) {
    message.error('获取排班失败')
  }
}

async function createSchedule(anchorId, startTime, endTime) {
  try {
    await request.post('/anchor/schedules', {
      anchor_id: anchorId,
      dates: [currentDate.value],
      start_time: startTime,
      end_time: endTime
    })
    message.success('排班已创建')
    fetchSchedules()
  } catch (e) {
    message.error('创建排班失败')
  }
}

async function updateSchedule(id, startTime, endTime) {
  try {
    await request.put(`/anchor/schedules/${id}`, { start_time: startTime, end_time: endTime })
    fetchSchedules()
  } catch (e) {
    message.error('更新排班失败')
  }
}

async function deleteSchedule(id) {
  try {
    await request.delete(`/anchor/schedules/${id}`)
    message.success('排班已删除')
    editModal.visible = false
    fetchSchedules()
  } catch (e) {
    message.error('删除排班失败')
  }
}

async function notifyAnchor(id) {
  try {
    await request.post(`/anchor/schedules/${id}/notify`)
    message.success('通知已发送')
  } catch (e) {
    message.error('发送通知失败')
  }
}

async function sendAllNotify() {
  notifyLoading.value = true
  try {
    const date = dayjs(currentDate.value).format('YYYY-MM-DD')
    const res = await request.post('/anchor/schedules/notify-all', { date })
    if (res.code === 0) {
      message.success(res.message || '排班通知已发送')
    } else {
      message.error(res.message || '发送失败')
    }
  } catch (e) {
    message.error('发送排班通知失败')
  } finally {
    notifyLoading.value = false
  }
}

async function addAnchor() {
  if (!newAnchorName.value.trim()) {
    message.warning('请输入主播名称')
    return
  }
  try {
    await request.post('/anchor/anchors', { name: newAnchorName.value.trim() })
    message.success('主播已添加')
    newAnchorName.value = ''
    showAddAnchor.value = false
    fetchAnchors()
  } catch (e) {
    message.error('添加主播失败')
  }
}

async function deleteAnchor(id) {
  try {
    await request.delete(`/anchor/anchors/${id}`)
    message.success('主播已删除')
    fetchAnchors()
    fetchSchedules()
  } catch (e) {
    message.error('删除主播失败')
  }
}

// ========== 拖拽创建排班（网格空白区域） ==========
function onGridMouseDown(e) {
  if (e.button !== 0) return
  if (e.target.closest('.schedule-block')) return
  const pos = getGridPosition(e)
  if (!pos) return
  creating.value = true
  didDrag = false
  const snappedY = snapY(pos.y)
  createState.anchorId = pos.anchorId
  createState.colIdx = pos.colIdx
  createState.startY = snappedY
  createState.endY = snappedY + SNAP
}

function onGridMouseMove(e) {
  if (creating.value) {
    const pos = getGridPosition(e)
    if (!pos) return
    createState.endY = snapY(pos.y)
  }
  if (dragging.value) {
    didDrag = true
    const grid = gridRef.value
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const y = e.clientY - rect.top
    dragState.currentY = snapY(Math.max(0, Math.min(y - dragState.offsetY, TOTAL_HEIGHT)))
    dragGhost.value = true
  }
  if (resizing.value) {
    didDrag = true
    const grid = gridRef.value
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const y = snapY(Math.max(0, Math.min(e.clientY - rect.top, TOTAL_HEIGHT)))
    applyResize(y)
  }
}

function onGridMouseUp() {
  if (creating.value) {
    finishCreate()
  }
  if (dragging.value) {
    finishDrag()
  }
  if (resizing.value) {
    finishResize()
  }
}

function onGridDblClick(e) {
  if (e.target.closest('.schedule-block')) return
  const pos = getGridPosition(e)
  if (!pos) return
  const snappedY = snapY(pos.y)
  const startTime = yToTime(snappedY)
  const endTime = yToTime(snappedY + SNAP)
  createSchedule(pos.anchorId, startTime, endTime)
}

function finishCreate() {
  creating.value = false
  let y1 = snapY(createState.startY)
  let y2 = snapY(createState.endY)
  if (y1 === y2) y2 = y1 + SNAP
  const startTime = yToTime(Math.min(y1, y2))
  const endTime = yToTime(Math.max(y1, y2))
  if (startTime !== endTime) {
    createSchedule(createState.anchorId, startTime, endTime)
  }
}

// ========== 触摸：拖拽创建 ==========
function onGridTouchStart(e) {
  if (e.target.closest('.schedule-block')) return
  const pos = getGridPosition(e.touches[0])
  if (!pos) return
  touchStartInfo = { pos, time: Date.now(), type: 'create' }
  touchTimer = setTimeout(() => {
    if (touchStartInfo?.type === 'create') {
      vibrate()
      creating.value = true
      const snappedY = snapY(pos.y)
      createState.anchorId = pos.anchorId
      createState.colIdx = pos.colIdx
      createState.startY = snappedY
      createState.endY = snappedY + SNAP
    }
  }, LONG_PRESS_MS)
}

function onGridTouchMove(e) { if (creating.value || dragging.value || resizing.value) e.preventDefault(); else return;
  if (creating.value) {
    const touch = e.touches[0]
    const grid = gridRef.value
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const y = touch.clientY - rect.top
    createState.endY = snapY(Math.max(0, Math.min(y, TOTAL_HEIGHT)))
  }
  if (dragging.value) {
    const touch = e.touches[0]
    const grid = gridRef.value
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const y = touch.clientY - rect.top
    dragState.currentY = snapY(Math.max(0, Math.min(y - dragState.offsetY, TOTAL_HEIGHT)))
    dragGhost.value = true
  }
  if (resizing.value) {
    const touch = e.touches[0]
    const grid = gridRef.value
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const y = snapY(Math.max(0, Math.min(touch.clientY - rect.top, TOTAL_HEIGHT)))
    applyResize(y)
  }
  // 如果没有进入拖拽模式，取消长按检测
  if (!creating.value && !dragging.value && !resizing.value) {
    clearTimeout(touchTimer)
    touchStartInfo = null
  }
}

function onGridTouchEnd() {
  clearTimeout(touchTimer)
  touchStartInfo = null
  if (creating.value) finishCreate()
  if (dragging.value) finishDrag()
  if (resizing.value) finishResize()
}

function vibrate() {
  if (navigator.vibrate) navigator.vibrate(30)
}

// ========== 色块拖拽移动 ==========
function onBlockMouseDown(sch, anchorId, e) {
  if (e.button !== 0) return
  if (e.target.closest('.resize-handle')) return
  const grid = gridRef.value
  if (!grid) return
  const rect = grid.getBoundingClientRect()
  const y = e.clientY - rect.top
  const blockTop = timeToY(sch.start_time)
  dragging.value = true
  didDrag = false
  dragState.schedule = sch
  dragState.anchorId = anchorId
  dragState.offsetY = y - blockTop
  dragState.currentY = blockTop
  dragState.startTop = blockTop
  dragGhost.value = false
}

function onBlockTouchStart(sch, anchorId, e) {
  if (e.target.closest('.resize-handle')) return
  const touch = e.touches[0]
  touchStartInfo = { type: 'block-drag', sch, anchorId }
  touchTimer = setTimeout(() => {
    if (touchStartInfo?.type === 'block-drag') {
      vibrate()
      const grid = gridRef.value
      if (!grid) return
      const rect = grid.getBoundingClientRect()
      const y = touch.clientY - rect.top
      const blockTop = timeToY(sch.start_time)
      dragging.value = true
      didDrag = false
      dragState.schedule = sch
      dragState.anchorId = anchorId
      dragState.offsetY = y - blockTop
      dragState.currentY = blockTop
      dragState.startTop = blockTop
      dragGhost.value = false
    }
  }, LONG_PRESS_MS)
}

function finishDrag() {
  if (!dragging.value) return
  dragging.value = false
  dragGhost.value = false
  const sch = dragState.schedule
  if (!sch) return
  const duration = timeToMinutes(sch.end_time) - timeToMinutes(sch.start_time)
  const newStartY = snapY(dragState.currentY)
  const newStart = yToTime(newStartY)
  const newEnd = yToTime(newStartY + duration)
  if (newStart !== sch.start_time || newEnd !== sch.end_time) {
    updateSchedule(sch.id, newStart, newEnd)
  }
}

// ========== Resize ==========
function onResizeMouseDown(sch, anchorId, edge, e) {
  e.preventDefault()
  resizing.value = true
  didDrag = false
  resizeState.schedule = sch
  resizeState.anchorId = anchorId
  resizeState.edge = edge
  resizeState.origTop = timeToY(sch.start_time)
  resizeState.origBottom = timeToY(sch.end_time)
}

function onResizeTouchStart(sch, anchorId, edge, e) {
  vibrate()
  resizing.value = true
  resizeState.schedule = sch
  resizeState.anchorId = anchorId
  resizeState.edge = edge
  resizeState.origTop = timeToY(sch.start_time)
  resizeState.origBottom = timeToY(sch.end_time)
}

function applyResize(y) {
  const sch = resizeState.schedule
  if (!sch) return
  if (resizeState.edge === 'top') {
    const newTop = Math.min(y, resizeState.origBottom - SNAP)
    sch.start_time = yToTime(newTop)
  } else {
    const newBottom = Math.max(y, resizeState.origTop + SNAP)
    sch.end_time = yToTime(newBottom)
  }
}

function finishResize() {
  if (!resizing.value) return
  resizing.value = false
  const sch = resizeState.schedule
  if (!sch) return
  updateSchedule(sch.id, sch.start_time, sch.end_time)
}

// ========== 色块点击编辑 ==========
function onBlockClick(sch, anchorId) {
  if (didDrag) { didDrag = false; return }
  if (dragging.value || resizing.value) return
  editModal.scheduleId = sch.id
  editModal.anchorName = getAnchorName(anchorId)
  editModal.anchorColor = getColor(anchorId)
  editModal.startTime = sch.start_time
  editModal.endTime = sch.end_time
  editModal.visible = true
}

function saveEdit() {
  const { scheduleId, startTime, endTime } = editModal
  if (!startTime || !endTime) {
    message.warning('请输入有效时间')
    return
  }
  updateSchedule(scheduleId, startTime, endTime)
  editModal.visible = false
}

// ========== 主播池拖拽 ==========
function onPoolDragStart(anchor, e) {
  poolDragAnchor.value = anchor
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', String(anchor.id))
}

function onPoolDragEnd() {
  poolDragAnchor.value = null
}

// 监听网格的drop事件
function setupGridDrop() {
  const grid = gridRef.value
  if (!grid) return
  grid.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  })
  grid.addEventListener('drop', (e) => {
    e.preventDefault()
    if (!poolDragAnchor.value) return
    const rect = grid.getBoundingClientRect()
    const y = snapY(e.clientY - rect.top)
    const startTime = yToTime(y)
    const endTime = yToTime(y + 60) // 默认1小时
    createSchedule(poolDragAnchor.value.id, startTime, endTime)
    poolDragAnchor.value = null
  })
}

// ========== 同步滚动 ==========
function onScroll() {
  if (columnsHeaderRef.value && scrollAreaRef.value) {
    columnsHeaderRef.value.scrollLeft = scrollAreaRef.value.scrollLeft
  }
}

// ========== 生命周期 ==========
onMounted(async () => {
  checkMobile()
  await fetchAnchors()
  await fetchSchedules()
  updateNowLine()
  nowTimer = setInterval(updateNowLine, 60000)
  nextTick(() => {
    updateColWidth()
    setupGridDrop()
    // 滚动到当前时间附近
    if (scrollAreaRef.value && isToday.value) {
      const scrollTo = Math.max(0, nowLineY.value - 200)
      scrollAreaRef.value.scrollTop = scrollTo
    }
  })
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  clearInterval(nowTimer)
  window.removeEventListener('resize', onResize)
})

function onResize() {
  checkMobile()
  updateColWidth()
}
</script>

<style scoped>
/* ============================
   DingTalk Design Language
   ============================ */

.anchor-schedule-page {
  height: calc(100vh - var(--header-h, 56px) - 16px);
  display: flex;
  flex-direction: column;
  background: #F5F6FA;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  max-width: 100vw;
  -webkit-font-smoothing: antialiased;
}

/* ===== Top Bar ===== */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #FFFFFF;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  z-index: 10;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

.date-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: #F5F6FA;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #333333;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.nav-btn:hover {
  background: #E8EAEF;
  color: #1677FF;
}

.nav-btn:active {
  transform: scale(0.95);
}

.date-pill {
  padding: 6px 16px;
  border-radius: 20px;
  background: #F5F6FA;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.date-pill:hover {
  background: #E8EAEF;
}

.date-pill:active {
  transform: scale(0.97);
}

.date-text {
  font-size: 15px;
  font-weight: 600;
  color: #333333;
  white-space: nowrap;
}

.today-btn {
  margin-left: 8px;
  padding: 6px 14px;
  border: none;
  border-radius: 20px;
  background: rgba(22, 119, 255, 0.1);
  color: #1677FF;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.today-btn:hover {
  background: rgba(22, 119, 255, 0.18);
}

.today-btn:active {
  transform: scale(0.96);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* DingTalk Buttons */
.dd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  line-height: 1;
}

.dd-btn:active {
  transform: scale(0.96);
}

.dd-btn.primary {
  background: #1677FF;
  color: #FFFFFF;
}

.dd-btn.primary:hover {
  background: #4096FF;
}

.dd-btn.outline {
  background: #FFFFFF;
  color: #333333;
  border: 1px solid #E0E0E0;
}

.dd-btn.outline:hover {
  border-color: #1677FF;
  color: #1677FF;
}

.dd-btn.danger-outline {
  background: #FFFFFF;
  color: #FF3141;
  border: 1px solid #FFCDD2;
}

.dd-btn.danger-outline:hover {
  background: #FFF5F5;
  border-color: #FF3141;
}

/* Help button */
.help-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #F5F6FA;
  color: #999999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.help-btn:hover {
  color: #1677FF;
  background: rgba(22, 119, 255, 0.1);
}

/* Help tooltip content */
.help-tip-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.help-tip-item {
  color: rgba(255, 255, 255, 0.95);
}

.help-tip-item b {
  color: #FFFFFF;
}

/* ===== Mobile Anchor Tabs ===== */
.mobile-anchor-tabs {
  background: #FFFFFF;
  border-bottom: 1px solid #F0F0F0;
  flex-shrink: 0;
  overflow: hidden;
}

.tabs-scroll {
  display: flex;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 8px 12px;
  gap: 8px;
}

.tabs-scroll::-webkit-scrollbar {
  display: none;
}

.anchor-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  background: #F5F6FA;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  min-height: 36px;
}

.anchor-tab.active {
  background: #1677FF;
  color: #FFFFFF;
}

.anchor-tab.active .tab-name {
  color: #FFFFFF;
}

.anchor-tab.active .tab-avatar {
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.tab-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.tab-name {
  font-size: 13px;
  font-weight: 500;
  color: #333333;
  white-space: nowrap;
}

/* ===== Main Body ===== */
.main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ===== Timeline ===== */
.timeline-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #FFFFFF;
  border-radius: 12px 0 0 0;
}

.header-row {
  display: flex;
  border-bottom: 1px solid #F0F0F0;
  flex-shrink: 0;
  background: #FAFBFC;
  overflow: hidden;
}

.time-gutter-header {
  width: 56px;
  flex-shrink: 0;
}

.columns-header {
  display: flex;
  overflow: hidden;
  flex: 1;
}

.anchor-col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  border-left: 1px solid #F0F0F0;
  gap: 4px;
  flex-shrink: 0;
}

.anchor-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
}

.anchor-name {
  font-size: 12px;
  color: #999999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ===== Scroll Area ===== */
.scroll-area {
  flex: 1;
  overflow: auto;
  position: relative;
  display: flex;
  -webkit-overflow-scrolling: touch;
}

.time-gutter {
  width: 56px;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  z-index: 2;
  background: #FFFFFF;
}

.time-label {
  position: absolute;
  width: 56px;
  text-align: right;
  padding-right: 10px;
  font-size: 11px;
  color: #BBBBBB;
  transform: translateY(-7px);
  user-select: none;
  font-variant-numeric: tabular-nums;
}

.grid-container {
  position: relative;
  height: 1440px;
  min-height: 1440px;
  flex: 1;
  cursor: crosshair;
}

.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid #F5F6FA;
}

.grid-line-hour {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid #EEEFF3;
}

/* ===== Now Line ===== */
.now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 2px solid #FF3141;
  z-index: 5;
  pointer-events: none;
}

.now-dot {
  position: absolute;
  left: -5px;
  top: -5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #FF3141;
  border: 2px solid #FFFFFF;
  box-shadow: 0 0 4px rgba(255, 49, 65, 0.4);
}

.now-label {
  position: absolute;
  left: 8px;
  top: -10px;
  font-size: 10px;
  color: #FF3141;
  font-weight: 600;
  background: #FFFFFF;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 18px;
  pointer-events: none;
}

/* ===== Anchor Column ===== */
.anchor-column {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid #F5F6FA;
}

/* ===== Schedule Block - DingTalk Card Style ===== */
.schedule-block {
  position: absolute;
  left: 4px;
  right: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 3;
  user-select: none;
}

.schedule-block:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 4;
  transform: translateY(-1px);
}

.block-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3px 8px;
  overflow: hidden;
}

.block-time {
  font-size: 12px;
  font-weight: 600;
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block-anchor {
  font-size: 11px;
  color: #999999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Resize handles */
.resize-handle {
  height: 8px;
  cursor: ns-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}

.resize-top {
  border-radius: 8px 8px 0 0;
}

.resize-bottom {
  border-radius: 0 0 8px 8px;
}

.resize-handle:hover {
  background: rgba(22, 119, 255, 0.1);
}

/* Creating preview */
.creating-block {
  border-radius: 8px;
  border: 2px dashed #1677FF;
  background: rgba(22, 119, 255, 0.06) !important;
}

/* Drag ghost */
.drag-ghost {
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

/* ===== Anchor Pool ===== */
.anchor-pool {
  width: 180px;
  flex-shrink: 0;
  background: #FFFFFF;
  border-left: 1px solid #F0F0F0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.pool-title {
  font-size: 14px;
  font-weight: 600;
  color: #333333;
  flex: 1;
}

.pool-count {
  font-size: 12px;
  color: #999999;
  background: #F5F6FA;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.pool-chevron {
  color: #999999;
  transition: transform 0.25s ease;
}

.pool-chevron.rotated {
  transform: rotate(180deg);
}

.pool-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
  -webkit-overflow-scrolling: touch;
}

.pool-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  cursor: grab;
  transition: all 0.2s ease;
  margin-bottom: 4px;
  position: relative;
}

.pool-card:hover {
  background: #F5F6FA;
}

.pool-card:active {
  cursor: grabbing;
  transform: scale(0.98);
}

.pool-avatar {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.pool-name {
  font-size: 14px;
  color: #333333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.pool-delete {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #CCCCCC;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.pool-card:hover .pool-delete {
  opacity: 1;
}

.pool-delete:hover {
  background: #FFF5F5;
  color: #FF3141;
}

.pool-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #CCCCCC;
  font-size: 13px;
  padding: 32px 0;
}

/* ===== Edit Modal ===== */
.dd-form :deep(.ant-form-item-label > label) {
  font-weight: 500;
  color: #333333;
}

.dd-input {
  border-radius: 8px !important;
}

.edit-anchor-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.edit-anchor-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #F0F0F0;
}

/* Date input */
.date-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  font-size: 14px;
  color: #333333;
  transition: border-color 0.2s;
  outline: none;
}

.date-input:focus {
  border-color: #1677FF;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
}

/* ===== Responsive: Mobile (<768px) ===== */
@media (max-width: 767px) {
  .top-bar {
    padding: 8px 12px;
    position: sticky;
    top: 0;
  }

  .date-pill {
    padding: 5px 12px;
  }

  .date-text {
    font-size: 14px;
  }

  .dd-btn.primary span {
    display: none;
  }

  .dd-btn.primary {
    padding: 8px;
    border-radius: 10px;
    width: 36px;
    height: 36px;
    justify-content: center;
  }

  .main-body {
    flex-direction: column;
  }

  .timeline-wrapper {
    border-radius: 0;
    flex: 1;
  }

  .grid-container {
    cursor: default;
  }

  .anchor-column {
    border-left: none;
  }

  .schedule-block {
    left: 6px;
    right: 6px;
    border-radius: 10px;
  }

  .block-content {
    padding: 4px 10px;
  }

  .block-time {
    font-size: 13px;
  }

  .block-anchor {
    font-size: 12px;
  }

  .resize-handle {
    height: 12px;
    min-height: 12px;
  }

  /* Anchor pool as bottom sheet */
  .anchor-pool {
    width: 100%;
    border-left: none;
    border-top: 1px solid #F0F0F0;
    max-height: 56px;
    transition: max-height 0.3s ease;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
  }

  .anchor-pool.pool-expanded {
    max-height: 280px;
  }

  .pool-header {
    padding: 12px 16px 8px;
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .pool-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 12px 12px;
    overflow-y: auto;
  }

  .pool-card {
    flex: 0 0 calc(50% - 4px);
    min-height: 44px;
    margin-bottom: 0;
  }

  .pool-delete {
    opacity: 1;
  }
}

/* ===== Responsive: Tablet (768-1024px) ===== */
@media (min-width: 768px) and (max-width: 1024px) {
  .anchor-col-header {
    min-width: 100px !important;
  }

  .anchor-pool {
    width: 160px;
  }

  .pool-card {
    padding: 8px;
  }
}

/* ===== Responsive: Desktop (>1024px) ===== */
@media (min-width: 1025px) {
  .mobile-anchor-tabs {
    display: none;
  }
}

/* ===== Ant Design Override for DingTalk style ===== */
:deep(.ant-modal-content) {
  border-radius: 16px;
  overflow: hidden;
}

:deep(.ant-modal-header) {
  padding: 16px 20px 12px;
  border-bottom: none;
}

:deep(.ant-modal-title) {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
}

:deep(.ant-modal-body) {
  padding: 4px 20px 16px;
}

:deep(.ant-modal-footer) {
  padding: 8px 20px 16px;
  border-top: none;
}

:deep(.ant-modal-footer .ant-btn-primary) {
  border-radius: 20px;
  background: #1677FF;
  border: none;
  font-weight: 500;
  padding: 4px 20px;
  height: 36px;
}

:deep(.ant-modal-footer .ant-btn-default) {
  border-radius: 20px;
  font-weight: 500;
  padding: 4px 20px;
  height: 36px;
}

:deep(.ant-input) {
  border-radius: 8px;
}

:deep(.ant-input:focus),
:deep(.ant-input-focused) {
  border-color: #1677FF;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
}

:deep(.ant-popconfirm .ant-btn-primary) {
  border-radius: 16px;
  background: #1677FF;
  border: none;
}

:deep(.ant-popconfirm .ant-btn-default) {
  border-radius: 16px;
}
@media (max-width: 767px) {
  .anchor-schedule-page {
    height: calc(100vh - var(--header-h, 56px) - var(--tabnav-h, 52px) - 16px) !important;
  }
}
</style>
