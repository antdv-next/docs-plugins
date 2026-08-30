<script setup lang="ts">
import { ThemeProvider, useTheme } from 'antdv-style'
import DemoPanel from './demo-panel.vue'

defineOptions({
  name: 'Demo',
})

const props = withDefaults(defineProps<{
  src: string
  /** 使用 iframe 模式渲染独立示例页（需要站点提供 iframeRenderer） */
  iframe?: string
  /** 紧凑模式：预览区无内边距 */
  compact?: boolean
  /** 'grey' 时预览区使用灰色背景 */
  background?: string
  simplify?: boolean
  /** Debug demos are shown in development only and hidden in the production docs build. */
  debug?: boolean
}>(), {
  iframe: undefined,
  compact: false,
  background: '',
  simplify: false,
  debug: false,
})

// antdv-style 的 useStyles 需要 <ThemeProvider> 祖先;站点未提供时由组件自给,
// 提供时则直接复用(避免嵌套 provider 造成 token 漂移)
function hasThemeProvider() {
  try {
    useTheme()
    return true
  }
  catch {
    return false
  }
}

const wrap = hasThemeProvider()
</script>

<template>
  <ThemeProvider v-if="!wrap">
    <DemoPanel v-bind="props">
      <slot />
    </DemoPanel>
  </ThemeProvider>
  <DemoPanel v-else v-bind="props">
    <slot />
  </DemoPanel>
</template>
