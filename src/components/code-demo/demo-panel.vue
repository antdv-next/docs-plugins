<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { DemoExtraFile, DemoModule, DemoSourceData } from '../../demo/types'
import { CheckOutlined, CodeOutlined, CopyOutlined, EditOutlined, ThunderboltOutlined } from '@antdv-next/icons'
import { aquaBlue, atomDark } from '@codesandbox/sandpack-themes'
import { useClipboard, useDebounceFn } from '@vueuse/core'
import { Alert, Flex, Skeleton, Spin, Tabs, Tooltip } from 'antdv-next'
import { createStyles } from 'antdv-style'
import { SandpackProvider } from 'sandpack-vue3'
import { loadDemo } from 'virtual:demos'
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getDemoId } from '../../demo/get-demo-id'
import CodeEditorBridge from './code-editor-bridge.vue'
import { compileSfcSource } from './compile-sfc'
import { resolveLabel, useDemoContext } from './context'
import ExpandIcon from './expand-icon.vue'
import ExternalLinkIcon from './external-link-icon.vue'

defineOptions({
  name: 'DemoPanel',
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

const TabPane = Tabs.TabPane

const context = useDemoContext()

const useStyles = createStyles(({ token }) => ({
  root: {
    'breakInside': 'avoid',
    'display': 'flow-root',
    'overflow': 'hidden',
    'position': 'relative',
    'boxSizing': 'border-box',
    'border': `1px solid ${token.colorSplit}`,
    'borderRadius': token.borderRadiusLG,
    'background': token.colorBgContainer,
    'transition': 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
    'margin': '16px 0',
    '&.border-primary': {
      borderColor: token.colorPrimary,
      boxShadow: `0 0 0 3px color-mix(in srgb, ${token.colorPrimary} 12%, transparent)`,
    },
    '&.ant-doc-demo-box-debug': {
      borderColor: '#d3adf7',
    },
    '& .ant-doc-demo-box-demo': {
      padding: '24px',
      borderBottom: `1px solid ${token.colorSplit}`,
      borderRadius: '8px 8px 0 0',
      background: token.colorBgContainer,
    },
    '& .ant-doc-demo-box-skeleton': {
      minHeight: 160,
    },
    '&.ant-doc-demo-box-simplify': {
      borderRadius: 0,
      background: 'transparent',
    },
    '&.ant-doc-demo-box-simplify .ant-doc-demo-box-demo': {
      padding: 0,
      borderBottom: 0,
      background: 'transparent',
    },
    '& .ant-doc-demo-box-meta.markdown': {
      position: 'relative',
      width: '100%',
      fontSize: 14,
      borderRadius: '0 0 6px 6px',
      transition: 'background-color 0.4s',
    },
    '& .ant-doc-demo-box-meta-description': {
      padding: '18px 12px 24px',
    },
    '& .ant-doc-demo-box-meta-description p': {
      margin: 0,
    },
    '& .ant-doc-demo-box-title': {
      position: 'absolute',
      top: -16,
      marginLeft: 16,
      padding: '1px 8px',
      borderRadius: '6px 6px 0 0',
      backgroundColor: token.colorBgContainer,
      transition: 'background-color 0.4s',
    },
    '& .ant-doc-demo-box-title a': {
      color: token.colorText,
      textDecoration: 'none',
      fontSize: 16,
      fontWeight: 500,
    },
    '& .ant-doc-demo-box-actions': {
      display: 'flex',
      justifyContent: 'center',
      padding: '12px 0',
      borderTop: `1px dashed ${token.colorSplit}`,
      opacity: 0.7,
      transition: 'opacity 0.3s',
    },
    '&:hover .ant-doc-demo-box-actions': {
      opacity: 1,
    },
    '& .ant-doc-demo-box-code-action': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 16,
      height: 16,
      border: 0,
      padding: 0,
      background: 'transparent',
      color: token.colorTextSecondary,
      cursor: 'pointer',
      transition: 'color 0.24s ease',
    },
    '& .ant-doc-demo-box-code-action:hover': {
      color: token.colorPrimary,
    },
    '& .ant-doc-demo-box-edit-icon': {
      marginInlineStart: 4,
      color: token.colorTextTertiary,
    },
    '& .ant-doc-demo-box-code': {
      'position': 'relative',
      'lineHeight': 2,
      'padding': `${token.paddingSM}px ${token.padding}px`,
      // 与 antdv-next 原 code-demo 一致:去除 sandpack 默认表面样式并隐藏 Run 按钮
      '& .sp-wrapper': {
        background: 'transparent !important',
      },
      '& .sp-layout': {
        background: 'transparent !important',
        border: 'none !important',
      },
      '& .cm-editor': {
        'background': 'transparent',
        'fontSize': 14,
        '& .cm-content': {
          lineHeight: 2,
        },
        '& .cm-activeLine, & .cm-activeLineGutter': {
          background: 'transparent',
        },
      },
      '& .cm-gutters': {
        background: 'transparent',
        border: 'none',
      },
      '& .sp-stack': {
        height: 'auto !important',
        background: 'transparent',
      },
      '& [class*="sp-code-editor"]': {
        background: 'transparent !important',
      },
      // 隐藏 sandpack 内置 Run 按钮与只读徽标
      '& .sp-button, & .sp-read-only': {
        display: 'none',
      },
    },
    '& .ant-doc-demo-box-code-loading': {
      display: 'flex',
      justifyContent: 'center',
      paddingBlock: token.paddingLG,
    },
    '& .ant-doc-demo-box-compile-error': {
      margin: 0,
      padding: '8px 16px',
      background: token.colorErrorBg,
      color: token.colorError,
      fontSize: 12,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
    },
    '& .ant-doc-demo-box-code-tabs': {
      borderTop: `1px dashed ${token.colorSplit}`,
    },
    '& .ant-doc-demo-box-code-tabs .ant-tabs-nav': {
      marginBottom: 0,
    },
    '& .ant-doc-demo-box-code-tabs .ant-tabs-tab': {
      fontSize: 12,
    },
    '& .ant-doc-demo-box-code-copy': {
      position: 'absolute',
      top: 10,
      right: 10,
      zIndex: 1,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 24,
      height: 24,
      border: 0,
      padding: 0,
      background: 'transparent',
      color: token.colorIcon,
      cursor: 'pointer',
    },
    '& .ant-doc-demo-box-code-copied': {
      color: token.colorSuccess,
    },
  },
}))

function t(key: Parameters<typeof resolveLabel>[1]) {
  return resolveLabel(context, key)
}

const { styles } = useStyles()

// Debug demos are visible while developing but stripped from the production docs.
const hidden = computed(() => Boolean(props.debug) && import.meta.env.PROD)

// demo 模块经 virtual:demos 注册表懒加载（代码分割，按需拉取）
const demo = shallowRef<DemoModule | undefined>(undefined)
let demoLoadToken = 0

watch(() => props.src, (newSrc) => {
  const token = ++demoLoadToken
  demo.value = undefined
  if (!newSrc)
    return
  loadDemo(newSrc).then((mod) => {
    if (token === demoLoadToken && mod)
      demo.value = mod
  }).catch(() => {})
}, { immediate: true })

// 按需加载的源码数据
const sourceData = shallowRef<DemoSourceData | null>(null)
const sourceLoading = shallowRef(false)
const sourceLoadError = shallowRef<Error | null>(null)
let sourceLoadPromise: Promise<void> | null = null
let sourceAbortController: AbortController | null = null
// HMR 发生在面板收起期间时标记过期，下次展开时重新加载
let sourceStale = false

function releaseSource() {
  sourceAbortController?.abort()
  sourceAbortController = null
  sourceData.value = null
  sourceLoadError.value = null
  sourceLoadPromise = null
  sourceLoading.value = false
  sourceStale = false
}

async function ensureSourceLoaded() {
  // 如果源码已过期（HMR 发生在收起期间），先释放旧数据
  if (sourceStale)
    releaseSource()
  if (sourceData.value || !demo.value)
    return
  if (sourceLoadPromise)
    return sourceLoadPromise

  const currentDemo = demo.value
  const abortController = new AbortController()
  sourceAbortController = abortController
  sourceLoading.value = true
  sourceLoadError.value = null

  const request = currentDemo
    .loadSource(abortController.signal)
    .then((data) => {
      if (demo.value === currentDemo && !abortController.signal.aborted)
        sourceData.value = data
    })
    .catch((error) => {
      if (abortController.signal.aborted)
        return
      const loadError
        = error instanceof Error ? error : new Error(String(error))
      if (demo.value === currentDemo)
        sourceLoadError.value = loadError
      throw loadError
    })
    .finally(() => {
      if (sourceLoadPromise === request) {
        sourceAbortController = null
        sourceLoadPromise = null
        sourceLoading.value = false
      }
    })

  sourceLoadPromise = request
  return request
}

const route = useRoute()
const router = useRouter()

const hasJsSource = computed(() => {
  const jsSource = sourceData.value?.jsSource?.trim()
  return Boolean(jsSource)
})

const extraFiles = computed<DemoExtraFile[]>(() => sourceData.value?.extraFiles ?? [])

// 与线上一致:仅当存在 JS 版本或伴生文件时才显示代码页签栏
const hasCodeTabs = computed(() => hasJsSource.value || extraFiles.value.length > 0)

const codeTabKeys = computed(() => {
  const keys: string[] = ['ts']
  if (hasJsSource.value)
    keys.push('js')
  for (const file of extraFiles.value)
    keys.push(file.name)
  return keys
})

// ts/js 切换：每个 Demo 实例维护独立的偏好，初始值取自站点提供的持久化
// （不通过 computed 依赖全局状态，避免一个 demo 切换导致所有 demo 同步切换）
const localTsJs = shallowRef<'ts' | 'js'>(context.preferredCodeType?.get() ?? 'ts')
const localCodeKey = shallowRef<string | null>(null)

const activeCodeType = computed<string>({
  get() {
    if (localCodeKey.value && codeTabKeys.value.includes(localCodeKey.value))
      return localCodeKey.value
    const preferred = localTsJs.value
    if (codeTabKeys.value.includes(preferred))
      return preferred
    return 'ts'
  },
  set(value) {
    if (value === 'ts' || value === 'js') {
      localTsJs.value = value
      context.preferredCodeType?.set(value)
      localCodeKey.value = null
    }
    else {
      localCodeKey.value = value
    }
  },
})

const activeExtraFile = computed(() =>
  extraFiles.value.find(file => file.name === activeCodeType.value),
)

/** 将 demo 相对导入路径映射为 sandpack 虚拟文件路径 */
function extraFileToSandpackPath(name: string) {
  return `/src/${name.replace(/^(\.\.?\/)+/, '')}`
}

/** 代码 tab 显示名（去掉 ./ 前缀） */
function displayFileName(name: string) {
  return name.replace(/^(\.\.?\/)+/, '')
}

const mainSourceCode = computed(() => {
  if (activeCodeType.value === 'js')
    return sourceData.value?.jsSource ?? sourceData.value?.source ?? ''
  return sourceData.value?.source ?? ''
})

// 编辑器当前展示的源码（主 demo 或伴生文件）
const activeSourceCode = computed(() => {
  if (activeExtraFile.value)
    return activeExtraFile.value.code
  return mainSourceCode.value
})

const description = computed(() => {
  const locales = demo.value?.locales ?? {}
  const locale = context.locale?.() ?? 'zh-CN'
  const localeData = locales[locale] || locales['zh-CN'] || locales['en-US'] || Object.values(locales)[0] || {}
  return localeData?.html ?? ''
})

const component = computed(() => typeof demo.value?.component === 'function' ? defineAsyncComponent(demo.value.component) : demo.value?.component)
const id = computed(() => {
  if (!props.src)
    return ''
  return getDemoId(props.src)
})
const showCode = shallowRef(false)
const liveComponent = shallowRef<any>(null)
const compileError = shallowRef<string | null>(null)
const currentCode = shallowRef<string | null>(null)
const editorBridgeRef = shallowRef<{ resetCode: (code: string) => void }>()

function handleShowCode() {
  showCode.value = !showCode.value
  if (!showCode.value) {
    // 收起时只重置实时编辑状态，保留源码以便快速重新展开
    liveComponent.value = null
    compileError.value = null
    currentCode.value = null
  }
  else {
    // 展开时按需加载源码（ensureSourceLoaded 内部会处理过期重载）
    void ensureSourceLoaded().catch(() => {})
  }
}

// 切换 demo 时释放旧源码并重置多文件 tab
watch(demo, () => {
  localCodeKey.value = null
  releaseSource()
}, { flush: 'sync' })

// 展开代码面板时触发加载（收起时不释放，保留源码）
watch([showCode, demo], ([visible, currentDemo]) => {
  if (!visible)
    return
  if (currentDemo)
    void ensureSourceLoaded().catch(() => {})
})

// HMR 触发的 sourceVersion 变化：展开时立即重载，收起时标记过期
watch(
  () => demo.value?.sourceVersion,
  (version, previousVersion) => {
    if (version === previousVersion)
      return
    // 如果用户正在编辑，暂缓重载，避免覆盖编辑内容
    if (currentCode.value !== null || liveComponent.value !== null) {
      sourceStale = true
      return
    }
    if (showCode.value) {
      releaseSource()
      void ensureSourceLoaded().catch(() => {})
    }
    else if (sourceData.value) {
      sourceStale = true
    }
  },
)

onBeforeUnmount(releaseSource)

// Reset live component and editor code when tab changes
watch(activeCodeType, () => {
  liveComponent.value = null
  compileError.value = null
  currentCode.value = null
  // 等 sandpack 完成 activeFile 切换后再重置内容，避免写入错误的文件
  nextTick(() => {
    editorBridgeRef.value?.resetCode(activeSourceCode.value)
  })
})

const debouncedCompile = useDebounceFn(async (newCode: string) => {
  // 伴生文件 tab 不参与主 demo 的实时编译
  if (activeExtraFile.value)
    return
  // Code matches original source (e.g. after tab switch reset), skip compilation
  if (newCode === mainSourceCode.value) {
    liveComponent.value = null
    compileError.value = null
    return
  }
  const { component: comp, error } = await compileSfcSource(newCode, context.modules)
  if (comp) {
    liveComponent.value = markRaw(comp)
    compileError.value = null
  }
  else {
    compileError.value = error
  }
}, 300)

function handleCodeChange(newCode: string) {
  currentCode.value = newCode
  debouncedCompile(newCode)
}

const sandpackTheme = computed(() => context.isDark?.() ? atomDark : aquaBlue)

const sandpackFiles = computed(() => {
  const files: Record<string, string> = {
    '/src/App.vue': mainSourceCode.value,
  }
  for (const file of extraFiles.value) {
    files[extraFileToSandpackPath(file.name)] = file.code
  }
  return files
})

// 当前激活的 sandpack 文件（多文件 tab 时切换）
const sandpackActiveFile = computed(() => {
  if (activeExtraFile.value)
    return extraFileToSandpackPath(activeExtraFile.value.name)
  return '/src/App.vue'
})

const sandpackOptions = computed(() => ({
  autorun: false,
  activeFile: sandpackActiveFile.value,
}))

const active = computed(() => route.hash === `#${id.value}`)
function handleScroll(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  router.push({
    path: route.path,
    hash: `#${id.value}`,
  })
}

const titleRef = shallowRef<HTMLElement>()

async function handleStackBlitz() {
  if (!context.openStackBlitz)
    return
  try {
    await ensureSourceLoaded()
  }
  catch {
    showCode.value = true
    return
  }
  if (mainSourceCode.value) {
    context.openStackBlitz({
      title: titleRef.value?.textContent || 'Demo',
      code: mainSourceCode.value,
    })
  }
}

async function handleOpenPlayground() {
  if (!context.openPlayground)
    return
  // 与线上一致:面板未展开过时先加载源码,失败则展开面板展示错误
  try {
    await ensureSourceLoaded()
  }
  catch {
    showCode.value = true
    return
  }
  if (mainSourceCode.value) {
    context.openPlayground(mainSourceCode.value)
  }
}

const demoStyle = computed(() => {
  const style: CSSProperties = {}
  if (props.compact) {
    style.padding = '0px'
    style.overflow = 'hidden'
  }
  if (props.background === 'grey') {
    style.backgroundColor = 'var(--ant-color-bg-layout)'
  }
  return style
})

const copySource = computed(() => currentCode.value ?? activeSourceCode.value)

const { copied, copy } = useClipboard({
  source: copySource,
  legacy: true,
})

// 与线上一致:操作栏复制按钮在面板未展开时也可用(先加载源码再复制)
async function handleCopy() {
  try {
    await ensureSourceLoaded()
    await copy()
  }
  catch {
    showCode.value = true
  }
}

const cls = computed(() => {
  const cls: string[] = []
  if (active.value) {
    cls.push('border-primary')
  }
  if (props.simplify) {
    cls.push('ant-doc-demo-box-simplify')
  }
  if (props.debug) {
    cls.push('ant-doc-demo-box-debug')
  }
  return cls
})
</script>

<template>
  <section v-if="!hidden" :id="id" class="ant-doc-demo-box" :class="[styles.root, cls]">
    <template v-if="simplify">
      <section class="ant-doc-demo-box-demo vp-raw" :style="demoStyle">
        <Skeleton v-if="!demo" active :paragraph="{ rows: 5 }" />
        <component :is="liveComponent || component" v-else-if="liveComponent || demo?.component" />
      </section>
    </template>
    <template v-else>
      <!-- Preview area: always visible, shows live-compiled or original component -->
      <section v-if="!iframe" class="ant-doc-demo-box-demo vp-raw" :style="demoStyle">
        <Skeleton v-if="!demo" active :paragraph="{ rows: 5 }" />
        <Suspense v-else>
          <component :is="liveComponent || component" v-if="liveComponent || demo?.component" />
          <template #fallback>
            <Skeleton active :paragraph="{ rows: 5 }" />
          </template>
        </Suspense>
      </section>
      <template v-else-if="context.iframeRenderer">
        <component :is="context.iframeRenderer(id, props.iframe)" />
      </template>
      <!-- Compile error hint -->
      <div v-if="compileError && showCode" class="ant-doc-demo-box-compile-error">
        <pre>{{ compileError }}</pre>
      </div>
      <!-- Meta: title, description, actions -->
      <section class="ant-doc-demo-box-meta markdown">
        <div class="ant-doc-demo-box-title">
          <a ref="titleRef" :href="`#${id}`" @click="handleScroll">
            <slot />
          </a>
          <a
            v-if="context.editUrl"
            class="ant-doc-demo-box-edit-icon"
            :href="context.editUrl(id)"
            target="_blank"
            rel="noopener"
          >
            <EditOutlined />
          </a>
        </div>
        <div v-if="description" class="ant-doc-demo-box-meta-description">
          <div v-html="description" />
        </div>
        <Flex class="ant-doc-demo-box-actions" wrap gap="middle">
          <div v-if="context.copyCode !== false" class="ant-doc-demo-box-code-action" @click="handleCopy">
            <Tooltip :title="t(`action.${copied ? 'copied' : 'copy'}`)">
              <CheckOutlined v-if="copied" />
              <CopyOutlined v-else />
            </Tooltip>
          </div>
          <a v-if="context.openStackBlitz" class="ant-doc-demo-box-code-action" @click="handleStackBlitz">
            <Tooltip :title="t('action.stackblitz')">
              <ThunderboltOutlined />
            </Tooltip>
          </a>
          <a
            v-if="context.demoPageUrl"
            class="ant-doc-demo-box-code-action"
            :href="context.demoPageUrl(id)"
            target="_blank"
            rel="noopener"
          >
            <Tooltip :title="t('action.externalLink')">
              <ExternalLinkIcon />
            </Tooltip>
          </a>
          <div v-if="context.openPlayground" class="ant-doc-demo-box-code-action" @click="handleOpenPlayground">
            <Tooltip :title="t('action.openPlayground')">
              <CodeOutlined />
            </Tooltip>
          </div>
          <div class="ant-doc-demo-box-expand-icon ant-doc-demo-box-code-action" @click="handleShowCode">
            <Tooltip :title="t(`action.${showCode ? 'expandedCode' : 'expandCode'}`)">
              <ExpandIcon :expanded="showCode" />
            </Tooltip>
          </div>
        </Flex>
      </section>
      <!-- Code editor (only when expanded) -->
      <template v-if="showCode">
        <!-- 加载中 -->
        <div v-if="sourceLoading" class="ant-doc-demo-box-code-loading">
          <Spin />
        </div>
        <!-- 加载失败 -->
        <div v-else-if="sourceLoadError" class="ant-doc-demo-box-code">
          <Alert type="error" :message="t('action.loadError')" />
        </div>
        <!-- 正常展示 -->
        <template v-else>
          <div v-if="hasCodeTabs" class="ant-doc-demo-box-code-tabs">
            <Tabs
              v-model:active-key="activeCodeType"
              centered
              size="small"
            >
              <TabPane key="ts" :tab="t('type.typescript')" />
              <TabPane v-if="hasJsSource" key="js" :tab="t('type.javascript')" />
              <TabPane
                v-for="file in extraFiles"
                :key="file.name"
                :tab="displayFileName(file.name)"
              />
            </Tabs>
          </div>
          <div class="ant-doc-demo-box-code">
            <Tooltip :title="t(`action.${copied ? 'copied' : 'copy'}`)">
              <div class="ant-doc-demo-box-code-copy" :class="copied ? 'ant-doc-demo-box-code-copied' : ''" @click="copy()">
                <CopyOutlined v-if="!copied" />
                <CheckOutlined v-else />
              </div>
            </Tooltip>
            <SandpackProvider
              template="vite-vue-ts"
              :files="sandpackFiles"
              :theme="sandpackTheme"
              :options="sandpackOptions"
            >
              <CodeEditorBridge
                ref="editorBridgeRef"
                @update:code="handleCodeChange"
              />
            </SandpackProvider>
          </div>
        </template>
      </template>
    </template>
  </section>
</template>
