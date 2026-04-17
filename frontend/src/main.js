import { createApp } from "vue"
import { createPinia } from "pinia"
import Antd from "ant-design-vue"
import "ant-design-vue/dist/reset.css"
import App from "./App.vue"
import router from "./router"
import "./assets/global.css"

// 检测 chunk 加载失败（前端更新后旧 index.html 引用已删除的 chunk），自动刷新恢复
const CHUNK_ERR_KEY = 'qc_chunk_reload_ts'
const handleChunkError = (err) => {
  const msg = err?.message || err?.reason?.message || ''
  const isChunkErr = /Loading chunk|Failed to fetch dynamically imported|Importing a module script failed|ChunkLoadError|Unexpected token '<'/.test(msg)
  if (!isChunkErr) return
  // 60秒内只刷一次，避免死循环
  const last = parseInt(sessionStorage.getItem(CHUNK_ERR_KEY) || '0', 10)
  if (Date.now() - last < 60000) return
  sessionStorage.setItem(CHUNK_ERR_KEY, String(Date.now()))
  console.warn('[ChunkReload] 检测到资源过期，自动刷新...', msg)
  location.reload()
}
window.addEventListener('error', (e) => handleChunkError(e))
window.addEventListener('unhandledrejection', (e) => handleChunkError(e))

const app = createApp(App)
// 捕获组件渲染/生命周期错误，避免整页空白
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', info, err)
  handleChunkError(err)
}
app.use(createPinia()).use(router).use(Antd).mount("#app")
