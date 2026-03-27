import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://business.snefe.com',
        changeOrigin: true,
        secure: false,
        // 本地开发代理到线上，需真实登录获取token
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router'],
          antd: ['ant-design-vue'],
          echarts: ['echarts'],
        },
      },
    },
  },
})
