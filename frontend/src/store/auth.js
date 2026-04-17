import { defineStore } from "pinia"
import request from "../utils/request"

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    token: localStorage.getItem("qc_token") || "",
    permissions: { is_super_admin: false, menus: [], ad_accounts: { qianchuan: [], kuaishou: [] }, roles: [] }
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === "admin",
    isSuperAdmin: (s) => s.permissions.is_super_admin
  },
  actions: {
    async login(username, password) {
      const res = await request.post("/auth/login", { username, password })
      this.token = res.data.token
      this.user = res.data.user
      localStorage.setItem("qc_token", res.data.token)
      await this.fetchPermissions()
      return res
    },
    async fetchMe() {
      if (!this.token) return
      try {
        const res = await request.get("/auth/me")
        this.user = res.data
      } catch (e) { console.warn("fetchMe failed", e) }
    },
    async fetchPermissions() {
      if (!this.token) return
      try {
        const res = await request.get("/rbac/my-permissions")
        if (res.code === 0) this.permissions = res.data
      } catch (e) { console.warn("fetchPermissions failed", e) }
    },
    hasMenu(menuCode) {
      if (this.permissions.is_super_admin) return true
      return this.permissions.menus.includes(menuCode)
    },
    hasAccount(platform, accountId) {
      if (this.permissions.is_super_admin) return true
      const list = this.permissions.ad_accounts[platform] || []
      return list.includes("*") || list.includes(accountId)
    },
    logout() {
      this.token = ""
      this.user = null
      this.permissions = { is_super_admin: false, menus: [], ad_accounts: { qianchuan: [], kuaishou: [] }, roles: [] }
      localStorage.removeItem("qc_token")
    }
  }
})
