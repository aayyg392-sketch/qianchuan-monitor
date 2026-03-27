<template>
  <a-config-provider :theme="antdTheme" :locale="zhCN">
    <router-view />
  </a-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'

const antdTheme = computed(() => ({
  token: {
    colorPrimary: '#1677FF',
    colorSuccess: '#00B96B',
    colorWarning: '#FF8A00',
    colorError: '#FF4D4F',
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Button: { borderRadius: 8 },
    Input: { borderRadius: 8 },
    Select: { borderRadius: 8 },
    Card: { borderRadius: 12 },
  },
}))
</script>

<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
#app { height: 100%; }
</style>
