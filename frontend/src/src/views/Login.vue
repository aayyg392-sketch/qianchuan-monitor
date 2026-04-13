<template>
  <div class="login-screen">
    <div class="login-bg">
      <div class="login-bg__circle login-bg__circle--1"></div>
      <div class="login-bg__circle login-bg__circle--2"></div>
    </div>
    <div class="login-card">
      <div class="login-brand">
        <div class="login-brand__icon">千</div>
        <div class="login-brand__info">
          <h2 class="login-brand__name">千川监控平台</h2>
          <p class="login-brand__desc">巨量千川广告数据实时监控</p>
        </div>
      </div>
      <a-form :model="form" @finish="handleLogin" layout="vertical" class="login-form">
        <a-form-item name="username" :rules="[{required:true,message:'请输入用户名'}]">
          <a-input v-model:value="form.username" size="large" placeholder="请输入用户名" autocomplete="username">
            <template #prefix>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2">
                <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
              </svg>
            </template>
          </a-input>
        </a-form-item>
        <a-form-item name="password" :rules="[{required:true,message:'请输入密码'}]">
          <a-input-password v-model:value="form.password" size="large" placeholder="请输入密码" autocomplete="current-password">
            <template #prefix>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </template>
          </a-input-password>
        </a-form-item>
        <a-button type="primary" html-type="submit" :loading="loading" block size="large" class="login-btn">
          登录
        </a-button>
      </a-form>
      <p class="login-footer">Snefe · 千川监控平台 v1.0</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { message } from 'ant-design-vue'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const form = reactive({ username: '', password: '' })

const handleLogin = async () => {
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    router.push('/')
  } catch (e) {
    message.error(e.message || '账号或密码错误')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-screen {
  min-height: 100vh;
  background: #F5F6F8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.login-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(155deg, #0f2749 0%, #1677FF 50%, #4096FF 100%);
}
.login-bg__circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.08;
  background: #fff;
}
.login-bg__circle--1 {
  width: 400px; height: 400px;
  top: -100px; right: -100px;
}
.login-bg__circle--2 {
  width: 300px; height: 300px;
  bottom: -80px; left: -80px;
}
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 20px;
  padding: 36px 28px 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 32px;
}
.login-brand__icon {
  width: 48px; height: 48px;
  background: linear-gradient(135deg, #1677FF 0%, #4096FF 100%);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 20px; font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(22,119,255,0.4);
}
.login-brand__name {
  font-size: 18px; font-weight: 700;
  color: #1A1A2E;
  margin-bottom: 2px;
}
.login-brand__desc { font-size: 12px; color: #8C8C8C; }
.login-form { margin-bottom: 8px; }
.login-btn {
  height: 46px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  border-radius: 10px !important;
  background: linear-gradient(135deg, #1677FF 0%, #4096FF 100%) !important;
  border: none !important;
  box-shadow: 0 4px 16px rgba(22,119,255,0.35) !important;
  margin-top: 4px;
}
.login-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 11px;
  color: #BFBFBF;
}

@media (max-width: 400px) {
  .login-card { padding: 28px 20px 20px; }
  .login-brand { margin-bottom: 24px; }
}
</style>
