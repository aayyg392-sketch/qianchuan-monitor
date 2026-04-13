import { defineStore } from "pinia"
import request from "../utils/request"

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    token: localStorage.getItem("qc_token") || "",
    permissions: { menus: [], is_super_admin: false, ad_accounts: {} }
  }),
  getters: { isLoggedIn: (s) => !!s.token, isAdmin: (s) => s.user?.role === "admin" },
  actions: {
    async login(username, password) {
      const res = await request.post("/auth/login", { username, password })
      this.token = res.data.token
      this.user = res.data.user
      localStorage.setItem("qc_token", res.data.token)
      return res
    },
    async fetchMe() {
      if (!this.token) return
      const res = await request.get("/auth/me")
      this.user = res.data
    },
    async fetchPermissions() {
      if (!this.token) return
      try {
        const res = await request.get("/auth/permissions")
        if (res.code === 0 && res.data) {
          this.permissions = res.data
        }
      } catch (e) {
        // 权限接口不存在时使用默认值（超管）
        this.permissions = { menus: ['*'], is_super_admin: true, ad_accounts: {} }
      }
    },
    logout() {
      this.token = ""
      this.user = null
      this.permissions = { menus: [], is_super_admin: false, ad_accounts: {} }
      localStorage.removeItem("qc_token")
    }
  }
})
