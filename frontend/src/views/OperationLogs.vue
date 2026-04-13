<template>
<div class="ol">
  <h2>操作日志</h2>
  <div class="ol-filters">
    <select v-model="filter.action">
      <option value="">全部操作</option>
      <option value="create_role">创建角色</option>
      <option value="update_role">更新角色</option>
      <option value="delete_role">删除角色</option>
      <option value="set_role_menus">设置角色菜单</option>
      <option value="set_role_accounts">设置角色账户</option>
      <option value="set_user_roles">设置用户角色</option>
      <option value="create_user">创建用户</option>
    </select>
    <button @click="loadLogs">查询</button>
  </div>
  <table class="ol-tbl">
    <thead><tr><th>时间</th><th>操作人</th><th>操作类型</th><th>对象</th><th>IP</th><th>详情</th></tr></thead>
    <tbody>
      <tr v-for="l in logs" :key="l.id">
        <td>{{ formatTime(l.created_at) }}</td>
        <td>{{ l.username }}</td>
        <td>{{ l.action }}</td>
        <td>{{ l.target_type }} #{{ l.target_id }}</td>
        <td>{{ l.ip }}</td>
        <td><button v-if="l.detail" class="ol-link" @click="showDetail=l.detail">查看</button></td>
      </tr>
      <tr v-if="!logs.length"><td colspan="6" style="text-align:center;color:#999">暂无日志</td></tr>
    </tbody>
  </table>
  <div v-if="total>pageSize" class="ol-pager">
    <button :disabled="page<=1" @click="page--;loadLogs()">上一页</button>
    <span>{{ page }} / {{ Math.ceil(total/pageSize) }}</span>
    <button :disabled="page*pageSize>=total" @click="page++;loadLogs()">下一页</button>
  </div>
  <div v-if="showDetail" class="rm-mask" @click.self="showDetail=null">
    <div class="ol-detail">
      <div class="rm-modal-hd"><span>操作详情</span><button class="rm-close" @click="showDetail=null">&times;</button></div>
      <pre>{{ typeof showDetail==='string' ? showDetail : JSON.stringify(showDetail,null,2) }}</pre>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/request'

const logs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const filter = ref({ action: '' })
const showDetail = ref(null)

function formatTime(t) { return t ? t.replace('T',' ').slice(0,19) : '' }

async function loadLogs() {
  const params = { page: page.value, page_size: pageSize }
  if (filter.value.action) params.action = filter.value.action
  const res = await request.get('/rbac/logs', { params })
  if (res.code === 0) { logs.value = res.data.list; total.value = res.data.total }
}

onMounted(loadLogs)
</script>

<style scoped>
.ol{padding:20px;max-width:1200px;margin:0 auto}
.ol h2{margin:0 0 16px;font-size:20px}
.ol-filters{display:flex;gap:8px;margin-bottom:16px}
.ol-filters select,.ol-filters button{padding:6px 12px;border:1px solid #d9d9d9;border-radius:4px;font-size:14px}
.ol-filters button{background:#1677ff;color:#fff;border-color:#1677ff;cursor:pointer}
.ol-tbl{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden}
.ol-tbl th,.ol-tbl td{padding:10px 12px;text-align:left;border-bottom:1px solid #f0f0f0;font-size:13px}
.ol-tbl th{background:#fafafa;font-weight:600}
.ol-link{background:none;border:none;color:#1677ff;cursor:pointer;font-size:13px}
.ol-pager{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px}
.ol-pager button{padding:4px 12px;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;background:#fff}
.ol-pager button:disabled{opacity:.5;cursor:default}
.ol-detail{background:#fff;border-radius:8px;width:500px;max-height:60vh;overflow:auto}
.ol-detail pre{padding:16px;font-size:13px;white-space:pre-wrap;word-break:break-all}
.rm-mask{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center}
.rm-modal-hd{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f0f0f0;font-weight:600}
.rm-close{background:none;border:none;font-size:22px;cursor:pointer;color:#999}
</style>
