import { defineStore } from "pinia"
import request from "../utils/request"

export const useAuthStore = defineStore("auth", {
  state: () => ({ user: null, token: localStorage.getItem("qc_token") || "" }),
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
    logout() {
      this.token = ""
      this.user = null
      localStorage.removeItem("qc_token")
    }
  }
})
