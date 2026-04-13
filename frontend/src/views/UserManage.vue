<template>
<div class="um">
  <div class="um-hd">
    <h2>用户管理</h2>
    <button class="um-btn um-btn-p" @click="openCreate">+ 新建用户</button>
  </div>

  <table class="um-tbl">
    <thead><tr><th>用户名</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
    <tbody>
      <tr v-for="u in users" :key="u.id">
        <td><strong>{{ u.username }}</strong></td>
        <td>
          <span v-for="r in (u.roles||[])" :key="r" class="um-role-tag">{{ roleNameMap[r] || r }}</span>
          <span v-if="!u.roles||!u.roles.length" style="color:#999">未分配</span>
        </td>
        <td><span :class="u.status?'um-on':'um-off'">{{ u.status ? '启用' : '禁用' }}</span></td>
        <td>{{ fmtTime(u.created_at) }}</td>
        <td>
          <button class="um-link" @click="openRoleEdit(u)">分配角色</button>
          <button v-if="u.username!=='admin'" class="um-link um-link-d" @click="toggleStatus(u)">{{ u.status ? '禁用' : '启用' }}</button>
        </td>
      </tr>
      <tr v-if="!users.length"><td colspan="5" style="text-align:center;color:#999;padding:20px">暂无用户</td></tr>
    </tbody>
  </table>

  <!-- 新建用户弹窗 -->
  <div v-if="showCreate" class="um-mask" @click.self="showCreate=false">
    <div class="um-modal">
      <div class="um-modal-hd"><span>新建用户</span><button class="um-close" @click="showCreate=false">&times;</button></div>
      <div class="um-modal-bd">
        <div class="um-field"><label>用户名</label><input v-model="createForm.username" placeholder="用户名" /></div>
        <div class="um-field"><label>密码</label><input v-model="createForm.password" type="password" placeholder="密码" /></div>
      </div>
      <div class="um-modal-ft">
        <button @click="showCreate=false">取消</button>
        <button class="um-btn-p" @click="doCreate" :disabled="saving">创建</button>
      </div>
    </div>
  </div>

  <!-- 角色分配弹窗 -->
  <div v-if="showRoleModal" class="um-mask" @click.self="showRoleModal=false">
    <div class="um-modal">
      <div class="um-modal-hd"><span>分配角色 - {{ editUser?.username }}</span><button class="um-close" @click="showRoleModal=false">&times;</button></div>
      <div class="um-modal-bd">
        <div v-for="r in allRoles" :key="r.id" class="um-role-item">
          <label>
            <input type="checkbox" :value="r.id" v-model="selectedRoles" />
            <strong>{{ r.display_name }}</strong>
            <span class="um-role-desc">{{ r.description }}</span>
          </label>
        </div>
      </div>
      <div class="um-modal-ft">
        <button @click="showRoleModal=false">取消</button>
        <button class="um-btn-p" @click="saveRoles" :disabled="saving">保存</button>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const users = ref([])
const allRoles = ref([])
const roleNameMap = ref({})
const showCreate = ref(false)
const showRoleModal = ref(false)
const editUser = ref(null)
const selectedRoles = ref([])
const saving = ref(false)
const createForm = ref({ username: '', password: '' })

function fmtTime(t) { return t ? t.replace('T', ' ').slice(0, 19) : '' }

async function loadUsers() {
  try {
    const res = await request.get('/auth/users')
    if (res.code === 0) users.value = res.data || []
    else users.value = res.data || res || []
  } catch { users.value = [] }
}

async function loadRoles() {
  try {
    const res = await request.get('/rbac/roles')
    if (res.code === 0) {
      allRoles.value = res.data || []
      const map = {}
      for (const r of allRoles.value) map[r.name] = r.display_name
      roleNameMap.value = map
    }
  } catch {}
}

function openCreate() {
  createForm.value = { username: '', password: '' }
  showCreate.value = true
}

async function doCreate() {
  if (!createForm.value.username || !createForm.value.password) return alert('请填写用户名和密码')
  saving.value = true
  try {
    const res = await request.post('/auth/users', createForm.value)
    if (res.code === 0) { showCreate.value = false; await loadUsers() }
    else alert(res.msg || '创建失败')
  } catch (e) { alert(e.message) }
  saving.value = false
}

function openRoleEdit(u) {
  editUser.value = u
  // 把用户的role name转成role id
  const names = u.roles || []
  selectedRoles.value = allRoles.value.filter(r => names.includes(r.name)).map(r => r.id)
  showRoleModal.value = true
}

async function saveRoles() {
  saving.value = true
  try {
    const res = await request.put('/rbac/users/' + editUser.value.id + '/roles', { role_ids: selectedRoles.value })
    if (res.code === 0) { showRoleModal.value = false; await loadUsers() }
    else alert(res.msg || '保存失败')
  } catch (e) { alert(e.message) }
  saving.value = false
}

async function toggleStatus(u) {
  try {
    const res = await request.put('/auth/users/' + u.id + '/status', { status: u.status ? 0 : 1 })
    if (res.code === 0) await loadUsers()
    else alert(res.msg || '操作失败')
  } catch (e) { alert(e.message) }
}

onMounted(() => { loadUsers(); loadRoles() })
</script>

<style scoped>
.um{padding:20px;max-width:1200px;margin:0 auto}
.um-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.um-hd h2{margin:0;font-size:20px}
.um-btn{padding:8px 16px;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer;background:#fff;font-size:14px}
.um-btn-p{background:#1677ff;color:#fff;border-color:#1677ff}
.um-btn-p:hover{background:#4096ff}
.um-tbl{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden}
.um-tbl th,.um-tbl td{padding:12px 16px;text-align:left;border-bottom:1px solid #f0f0f0;font-size:14px}
.um-tbl th{background:#fafafa;font-weight:600}
.um-role-tag{display:inline-block;padding:2px 8px;background:#e6f4ff;color:#1677ff;border-radius:4px;font-size:12px;margin-right:4px}
.um-on{color:#52c41a}.um-off{color:#ff4d4f}
.um-link{background:none;border:none;color:#1677ff;cursor:pointer;font-size:13px;margin-right:8px}
.um-link-d{color:#ff4d4f}
.um-mask{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center}
.um-modal{background:#fff;border-radius:8px;width:480px;max-height:70vh;display:flex;flex-direction:column}
.um-modal-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #f0f0f0;font-size:16px;font-weight:600}
.um-close{background:none;border:none;font-size:22px;cursor:pointer;color:#999}
.um-modal-bd{padding:16px 20px;overflow-y:auto;flex:1}
.um-modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #f0f0f0}
.um-field{margin-bottom:12px}
.um-field label{display:block;font-size:13px;color:#666;margin-bottom:4px}
.um-field input{width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:4px;font-size:14px;box-sizing:border-box}
.um-role-item{margin-bottom:8px}
.um-role-item label{display:flex;align-items:center;gap:8px;cursor:pointer}
.um-role-desc{color:#999;font-size:12px}
</style>
