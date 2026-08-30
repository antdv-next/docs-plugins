/**
 * `virtual:demos` 运行时模块的类型声明。
 * 该虚拟模块由本包的 demoPlugin 在站点 vite 中生成：
 * - 默认导出: demo 注册表（懒加载模式下的 shallowReactive 记录）
 * - loadDemo: 按需加载单个 demo
 *
 * 站点 TS 程序通过本文件获得类型；站点自身的 types 目录不再需要重复声明。
 */
declare module 'virtual:demos' {
  interface DemoLocale {
    html?: string
    title?: string
  }

  export interface DemoExtraFile {
    name: string
    lang: string
    code: string
  }

  export interface DemoSourceData {
    source: string
    jsSource: string
    extraFiles: DemoExtraFile[]
  }

  export interface DemoModule {
    component?: () => Promise<unknown>
    locales?: Record<string, DemoLocale>
    sourceVersion: number
    loadSource: (signal?: AbortSignal) => Promise<DemoSourceData>
  }

  export function loadDemo(id: string): Promise<DemoModule | null>

  const demos: Record<string, DemoModule>
  export default demos
}
