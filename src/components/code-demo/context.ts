import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

/** 组件内置文案 key（可通过 DemoContext.t / labels 覆盖） */
export type DemoLabelKey
  = | 'action.copy'
    | 'action.copied'
    | 'action.stackblitz'
    | 'action.externalLink'
    | 'action.openPlayground'
    | 'action.expandCode'
    | 'action.expandedCode'
    | 'action.loadError'
    | 'type.typescript'
    | 'type.javascript'

export interface DemoContext {
  /** 当前语言（决定内置文案与 demo 描述的选取），如 'zh-CN' / 'en-US' */
  locale?: () => string
  /** 自定义文案（i18n），key 见 DemoLabelKey */
  t?: (key: DemoLabelKey) => string
  /** 暗色状态（Sandpack 编辑器主题跟随） */
  isDark?: () => boolean
  /**
   * 额外可被演示源码 import 的模块（浏览器实时编译用）。
   * 由站点提供（如组件库本体），逐模块容错，不可用只影响编辑预览。
   */
  modules?: Record<string, () => Promise<any>>
  /** 在 Playground 中打开（不提供则隐藏按钮） */
  openPlayground?: (code: string) => void
  /** 在 StackBlitz 中打开（不提供则隐藏按钮） */
  openStackBlitz?: (options: { title: string, code: string }) => void
  /** demo 独立页地址（不提供则隐藏按钮） */
  demoPageUrl?: (id: string) => string
  /** iframe 模式渲染器（不提供则忽略 iframe 属性） */
  iframeRenderer?: (id: string, height?: string) => any
  /** 记住 TS/JS 页签偏好（不提供则仅组件内记忆） */
  preferredCodeType?: {
    get: () => 'ts' | 'js'
    set: (value: 'ts' | 'js') => void
  }
}

export const demoContextKey: InjectionKey<DemoContext> = Symbol('demo-context')

export function provideDemoContext(context: DemoContext) {
  provide(demoContextKey, context)
}

export function useDemoContext(): DemoContext {
  return inject(demoContextKey, {})
}

const builtinLabels: Record<string, Record<DemoLabelKey, string>> = {
  'zh-CN': {
    'action.copy': '复制代码',
    'action.copied': '已复制',
    'action.stackblitz': '在 StackBlitz 中打开',
    'action.externalLink': '查看独立示例页',
    'action.openPlayground': '在 Playground 中打开',
    'action.expandCode': '展开代码',
    'action.expandedCode': '收起代码',
    'action.loadError': '源码加载失败',
    'type.typescript': 'TypeScript',
    'type.javascript': 'JavaScript',
  },
  'en-US': {
    'action.copy': 'Copy Code',
    'action.copied': 'Copied',
    'action.stackblitz': 'Open in StackBlitz',
    'action.externalLink': 'Open demo page',
    'action.openPlayground': 'Open in Playground',
    'action.expandCode': 'Expand code',
    'action.expandedCode': 'Collapse code',
    'action.loadError': 'Failed to load source code',
    'type.typescript': 'TypeScript',
    'type.javascript': 'JavaScript',
  },
}

export function resolveLabel(context: DemoContext, key: DemoLabelKey): string {
  if (context.t)
    return context.t(key)
  const locale = context.locale?.() ?? 'zh-CN'
  return builtinLabels[locale]?.[key] ?? builtinLabels['en-US']![key]
}
