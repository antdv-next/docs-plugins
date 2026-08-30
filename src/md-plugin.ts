import type { PluginOption } from 'vite'
import type { DemoPluginOptions } from './demo/index'
import type { CreateMarkdownOptions } from './markdown'
import { demoPlugin } from './demo/index'
import { md2VuePlugin } from './md2vue'

export interface DocsPluginsOptions {
  /**
   * markdown-it 渲染链路选项（传给 md2vue / createMarkdown）
   */
  markdown?: CreateMarkdownOptions
  /**
   * vite demo 插件选项
   */
  demo?: DemoPluginOptions
}

/** docs 站点默认的 markdown 处理插件组合 */
export function mdPlugin(options: DocsPluginsOptions = {}): PluginOption[] {
  return [
    md2VuePlugin(options.markdown),
    demoPlugin(options.demo),
  ]
}
