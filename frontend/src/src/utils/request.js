import axios from "axios"
import { message } from "ant-design-vue"
import router from "../router"

const request = axios.create({ baseURL: "/api", timeout: 90000 })

request.interceptors.request.use(config => {
  const token = localStorage.getItem("qc_token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

request.interceptors.response.use(
  res => {
    const data = res.data
    if (data.code === 401) {
      localStorage.removeItem("qc_token")
      router.push("/login")
      return Promise.reject(new Error(data.msg))
    }
    if (data.code !== 0) {
      message.error(data.msg || "操作失败")
      return Promise.reject(new Error(data.msg))
    }
    return data
  },
  err => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem("qc_token")
      message.error("登录已过期，请重新登录")
      router.push("/login")
      return Promise.reject(err)
    }
    message.error(err.response?.data?.msg || err.message || "网络错误")
    return Promise.reject(err)
  }
)

export default request
