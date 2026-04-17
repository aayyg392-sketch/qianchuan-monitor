<template>
<div class="rm">
  <div class="rm-hd">
    <h2>角色管理</h2>
    <button class="rm-btn rm-btn-p" @click="openCreate">+ 新建角色</button>
  </div>

  <div class="rm-cards">
    <div v-for="r in roles" :key="r.id" class="rm-card" :class="{disabled:!r.status}">
      <div class="rm-card-hd">
        <span class="rm-card-name">{{ r.display_name }}</span>
        <span v-if="r.is_system" class="rm-tag sys">内置</span>
        <span v-if="!r.status" class="rm-tag off">禁用</span>
      </div>
      <div class="rm-card-desc">{{ r.description || '暂无描述' }}</div>
      <div class="rm-card-stats">
        <span>&#x1F464; {{ r.user_count }}人</span>
        <span>&#x1F4CB; {{ r.menu_count }}菜单</span>
        <span>&#x1F3E2; {{ r.account_count }}账户</span>
        <span>&#x1F4F1; {{ r.live_room_count || 0 }}抖音号</span>
      </div>
      <div class="rm-card-acts">
        <button @click="openEdit(r)">编辑权限</button>
        <button v-if="!r.is_system" class="rm-del" @click="removeRole(r)">删除</button>
      </div>
    </div>
  </div>

  <!-- 编辑弹窗 -->
  <div v-if="showModal" class="rm-mask" @click.self="showModal=false">
    <div class="rm-modal">
      <div class="rm-modal-hd">
        <span>{{ isEdit ? '编辑角色' : '新建角色' }}</span>
        <button class="rm-close" @click="showModal=false">&times;</button>
      </div>
      <div class="rm-modal-bd">
        <div class="rm-field">
          <label>角色标识</label>
          <input v-model="form.name" :disabled="isEdit" placeholder="英文标识如 ad_operator" />
        </div>
        <div class="rm-field">
          <label>显示名称</label>
          <input v-model="form.display_name" placeholder="如 广告运营" />
        </div>
        <div class="rm-field">
          <label>描述</label>
          <input v-model="form.description" placeholder="角色描述" />
        </div>

        <div class="rm-tabs">
          <button :class="{active:tab==='menu'}" @click="tab='menu'">菜单权限</button>
          <button :class="{active:tab==='account'}" @click="tab='account'">账户权限</button>
          <button :class="{active:tab==='liveroom'}" @click="tab='liveroom'">抖音号权限</button>
        </div>

        <div v-if="tab==='menu'" class="rm-perm-list">
          <div class="rm-check-all">
            <label><input type="checkbox" :checked="allMenuChecked" @change="toggleAllMenus" /> 全选</label>
          </div>
          <div v-for="g in menuTree" :key="g.code" class="rm-menu-group">
            <label class="rm-group-label">
              <input type="checkbox" :checked="groupChecked(g)" @change="toggleGroup(g)" />
              <strong>{{ g.name }}</strong>
            </label>
            <div v-if="g.children" class="rm-menu-children">
              <label v-for="c in g.children" :key="c.code">
                <input type="checkbox" :value="c.code" v-model="form.menu_codes" /> {{ c.name }}
              </label>
            </div>
          </div>
        </div>

        <div v-if="tab==='account'" class="rm-perm-list">
          <h4>千川账户</h4>
          <div class="rm-acc-list">
            <label v-for="a in adAccounts.qianchuan" :key="a.advertiser_id">
              <input type="checkbox" :value="'qianchuan:'+a.advertiser_id" v-model="form.account_keys" />
              {{ a.advertiser_name || a.advertiser_id }}
            </label>
          </div>
          <h4>快手磁力账户</h4>
          <div class="rm-acc-list">
            <label v-for="a in adAccounts.kuaishou" :key="a.advertiser_id">
              <input type="checkbox" :value="'kuaishou:'+a.advertiser_id" v-model="form.account_keys" />
              {{ a.advertiser_name || a.advertiser_id }}
            </label>
          </div>
          <h4>视频号ADQ主体</h4>
          <div class="rm-acc-list">
            <label v-for="s in adAccounts.adq_subjects" :key="s.subject_name">
              <input type="checkbox" :checked="isAdqSubjectChecked(s)" @change="toggleAdqSubject(s)" />
              {{ s.subject_name }} <span style="color:#999;font-size:12px">({{ s.account_ids.length }}账户)</span>
            </label>
          </div>
        </div>

        <div v-if="tab==='liveroom'" class="rm-perm-list">
          <div class="rm-check-all">
            <label><input type="checkbox" :checked="allLiveRoomChecked" @change="toggleAllLiveRooms" /> 全选</label>
          </div>
          <div class="rm-acc-list">
            <label v-for="r in liveRooms" :key="r.id">
              <input type="checkbox" :value="r.id" v-model="form.live_room_ids" />
              {{ r.nickname }}{{ r.advertiser_name ? ' (' + r.advertiser_name.replace(/.*-/, '') + ')' : '' }}
            </label>
          </div>
        </div>
      </div>
      <div class="rm-modal-ft">
        <button @click="showModal=false">取消</button>
        <button class="rm-btn-p" @click="saveRole" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import request from '../utils/request'

const roles = ref([])
const menuTree = ref([])
const adAccounts = ref({ qianchuan: [], kuaishou: [], adq: [], adq_subjects: [] })
const liveRooms = ref([])
const showModal = ref(false)
const isEdit = ref(false)
const tab = ref('menu')
const saving = ref(false)
const form = ref({ name: '', display_name: '', description: '', menu_codes: [], account_keys: [], live_room_ids: [] })

const allMenuChecked = computed(() => {
  const allCodes = menuTree.value.flatMap(g => g.children ? g.children.map(c => c.code) : [g.code])
  return allCodes.length > 0 && allCodes.every(c => form.value.menu_codes.includes(c))
})

const allLiveRoomChecked = computed(() => {
  return liveRooms.value.length > 0 && liveRooms.value.every(r => form.value.live_room_ids.includes(r.id))
})

function toggleAllLiveRooms() {
  if (allLiveRoomChecked.value) {
    form.value.live_room_ids = []
  } else {
    form.value.live_room_ids = liveRooms.value.map(r => r.id)
  }
}

function groupChecked(g) {
  const codes = g.children ? g.children.map(c => c.code) : [g.code]
  return codes.every(c => form.value.menu_codes.includes(c))
}
function toggleGroup(g) {
  const codes = g.children ? g.children.map(c => c.code) : [g.code]
  const allIn = codes.every(c => form.value.menu_codes.includes(c))
  if (allIn) {
    form.value.menu_codes = form.value.menu_codes.filter(c => !codes.includes(c))
  } else {
    const s = new Set([...form.value.menu_codes, ...codes])
    form.value.menu_codes = [...s]
  }
}
function isAdqSubjectChecked(s) {
  if (!s.account_ids?.length) return false
  return s.account_ids.every(id => form.value.account_keys.includes('adq:' + id))
}
function toggleAdqSubject(s) {
  const keys = s.account_ids.map(id => 'adq:' + id)
  if (isAdqSubjectChecked(s)) {
    form.value.account_keys = form.value.account_keys.filter(k => !keys.includes(k))
  } else {
    const set = new Set([...form.value.account_keys, ...keys])
    form.value.account_keys = [...set]
  }
}

function toggleAllMenus() {
  const allCodes = menuTree.value.flatMap(g => g.children ? g.children.map(c => c.code) : [g.code])
  if (allMenuChecked.value) {
    form.value.menu_codes = []
  } else {
    form.value.menu_codes = [...allCodes]
  }
}

async function loadData() {
  const [r1, r2, r3, r4] = await Promise.all([
    request.get('/rbac/roles'),
    request.get('/rbac/menus'),
    request.get('/rbac/ad-accounts'),
    request.get('/rbac/live-rooms')
  ])
  if (r1.code === 0) roles.value = r1.data
  if (r2.code === 0) menuTree.value = r2.data
  if (r3.code === 0) adAccounts.value = r3.data
  if (r4.code === 0) liveRooms.value = r4.data
}

function openCreate() {
  isEdit.value = false
  form.value = { name: '', display_name: '', description: '', menu_codes: [], account_keys: [], live_room_ids: [] }
  tab.value = 'menu'
  showModal.value = true
}

async function openEdit(r) {
  isEdit.value = true
  const res = await request.get('/rbac/roles/' + r.id)
  if (res.code !== 0) return
  const d = res.data
  form.value = {
    id: d.id,
    name: d.name,
    display_name: d.display_name,
    description: d.description,
    menu_codes: d.menus || [],
    account_keys: (d.ad_accounts || []).map(a => a.platform + ':' + a.account_id),
    live_room_ids: d.live_rooms || []
  }
  tab.value = 'menu'
  showModal.value = true
}

async function saveRole() {
  saving.value = true
  try {
    const accounts = form.value.account_keys.map(k => {
      const [platform, account_id] = k.split(':')
      return { platform, account_id }
    })

    if (isEdit.value) {
      await request.put('/rbac/roles/' + form.value.id, {
        display_name: form.value.display_name,
        description: form.value.description
      })
      await request.put('/rbac/roles/' + form.value.id + '/menus', { menu_codes: form.value.menu_codes })
      await request.put('/rbac/roles/' + form.value.id + '/accounts', { accounts })
      await request.put('/rbac/roles/' + form.value.id + '/live-rooms', { room_ids: form.value.live_room_ids })
    } else {
      await request.post('/rbac/roles', {
        name: form.value.name,
        display_name: form.value.display_name,
        description: form.value.description,
        menu_codes: form.value.menu_codes,
        ad_accounts: accounts,
        live_room_ids: form.value.live_room_ids
      })
    }
    showModal.value = false
    await loadData()
  } catch (e) { alert(e.message) }
  saving.value = false
}

async function removeRole(r) {
  if (!confirm('确认删除角色「' + r.display_name + '」？')) return
  const res = await request.delete('/rbac/roles/' + r.id)
  if (res.code === 0) await loadData()
  else alert(res.msg)
}

onMounted(loadData)
</script>

<style scoped>
.rm{padding:20px;max-width:1200px;margin:0 auto}
.rm-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.rm-hd h2{margin:0;font-size:20px}
.rm-btn{padding:8px 16px;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer;background:#fff;font-size:14px}
.rm-btn-p{background:#1677ff;color:#fff;border-color:#1677ff}
.rm-btn-p:hover{background:#4096ff}
.rm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.rm-card{background:#fff;border:1px solid #f0f0f0;border-radius:8px;padding:16px;transition:box-shadow .2s}
.rm-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}
.rm-card.disabled{opacity:.6}
.rm-card-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.rm-card-name{font-size:16px;font-weight:600}
.rm-tag{font-size:11px;padding:2px 6px;border-radius:4px}
.rm-tag.sys{background:#e6f4ff;color:#1677ff}
.rm-tag.off{background:#fff2e8;color:#fa8c16}
.rm-card-desc{color:#666;font-size:13px;margin-bottom:12px}
.rm-card-stats{display:flex;gap:12px;font-size:13px;color:#888;margin-bottom:12px}
.rm-card-acts{display:flex;gap:8px}
.rm-card-acts button{padding:4px 12px;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;background:#fff;font-size:13px}
.rm-card-acts button:hover{border-color:#1677ff;color:#1677ff}
.rm-del{color:#ff4d4f!important;border-color:#ff4d4f!important}
.rm-mask{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center}
.rm-modal{background:#fff;border-radius:8px;width:640px;max-height:80vh;display:flex;flex-direction:column}
.rm-modal-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #f0f0f0;font-size:16px;font-weight:600}
.rm-close{background:none;border:none;font-size:22px;cursor:pointer;color:#999}
.rm-modal-bd{padding:16px 20px;overflow-y:auto;flex:1}
.rm-modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #f0f0f0}
.rm-field{margin-bottom:12px}
.rm-field label{display:block;font-size:13px;color:#666;margin-bottom:4px}
.rm-field input{width:100%;padding:6px 10px;border:1px solid #d9d9d9;border-radius:4px;font-size:14px;box-sizing:border-box}
.rm-tabs{display:flex;gap:0;margin:16px 0 12px;border-bottom:1px solid #f0f0f0}
.rm-tabs button{padding:8px 16px;border:none;background:none;cursor:pointer;font-size:14px;color:#666;border-bottom:2px solid transparent}
.rm-tabs button.active{color:#1677ff;border-bottom-color:#1677ff}
.rm-perm-list{max-height:300px;overflow-y:auto}
.rm-check-all{margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f5f5f5}
.rm-menu-group{margin-bottom:8px}
.rm-group-label{display:block;margin-bottom:4px}
.rm-menu-children{padding-left:24px;display:flex;flex-wrap:wrap;gap:4px 16px}
.rm-menu-children label{font-size:13px}
.rm-acc-list{display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:12px;padding-left:8px}
.rm-acc-list label{font-size:13px}
h4{margin:8px 0 4px;font-size:14px}
</style>
