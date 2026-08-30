# @antdv-next/docs-plugins

[antdv-next/docs-base](https://github.com/antdv-next/docs-base) 文档站点的插件与组件集:一条开箱即用的 Vite + markdown-it 管线,负责 Markdown → Vue 渲染、demo 收集、代码高亮与在线编辑,并附带可复用的 `<CodeDemo>` 展示组件。

## 安装

```bash
pnpm add -D @antdv-next/docs-plugins
```

## 快速开始

### 1. 接入 markdown 管线

```ts
// vite.config.ts
import { mdPlugin } from '@antdv-next/docs-plugins'

export default defineConfig({
  plugins: [
    mdPlugin(),
  ],
})
```

`mdPlugin()` = `md2VuePlugin`(Markdown → Vue SFC)+ `demoPlugin`(demo 收集虚拟模块),覆盖:

- shiki 双主题高亮、anchor/toc/frontmatter/emoji、tip/warning 等容器、GitHub Alerts
- demo 收集:页面里 `<demo src="./demo/basic.vue">标题</demo>` 生成锚点目录与按需加载的 demo 模块
- 外部链接自动新标签页打开

### 2. 编写文档与 demo

```md
## 代码演示 {#examples}   <!-- 英文页写 ## Examples -->

<demo src="./demo/basic.vue">基本用法</demo>
```

- demo 文件放在页面同级的 `demo/` 目录(默认收集 `<root>/src/pages/**/demo/*.vue`,可用 `include` 调整)
- demo SFC 内的 `<docs>` 自定义块作为该 demo 的描述文案
- 锚点统一挂到 slug 为 `examples` 的标题下

### 3. 隔离 markdown 样式(可选)

```ts
css: {
  postcss: {
    plugins: [postcssIsolateStyles()],
  },
},
```

## `<CodeDemo>` 组件(自定义 demo 渲染时使用)

demo 的展示与在线编辑由包内组件承担,站点只需注入站点差异:

```ts
import CodeDemo from '@antdv-next/docs-plugins/component/code-demo/index.vue'
import { provideDemoContext } from '@antdv-next/docs-plugins/component/code-demo/context'

provideDemoContext({
  locale: () => (route.meta?.locale === 'en-US' ? 'en-US' : 'zh-CN'),
  isDark: () => isDark.value,
  // 演示源码可 import 的模块(浏览器实时编译用),逐模块容错
  modules: {
    'antdv-next': () => import('antdv-next'),
    '@antdv-next/icons': () => import('@antdv-next/icons'),
  },
  openPlayground: code => window.open(loadPlaygroundUrl(code), '_blank'),
  // openStackBlitz / demoPageUrl / iframeRenderer / preferredCodeType 可选
})
```

```vue
<CodeDemo src="/src/pages/components/button/demo/basic.vue">
  基本用法
</CodeDemo>
```

- 展开代码面板即得可编辑编辑器(Sandpack),编辑内容经 `@vue/compiler-sfc` + `sucrase` 在浏览器端实时编译并替换预览
- 未提供的能力(如 StackBlitz)对应按钮自动隐藏

建议在 vite 中对这些依赖做 `resolve.dedupe`,保证与站点共享同一实例:

```ts
resolve: {
  dedupe: ['vue', 'vue-router', '@vueuse/core', 'antdv-next', '@antdv-next/icons', 'antdv-style'],
},
```

### virtual:demos 类型声明

自定义 demo UI 时引用包内自带的类型:

```ts
/// <reference types="@antdv-next/docs-plugins/component/code-demo/virtual" />
```

## 默认行为与选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `markdown.demo.headerMode` | `'examples'` | demo 锚点挂到 slug 为 `examples` 的标题下;`'section'` 为跟随章节层级 |
| `markdown.demo.debugDemo` | `true` | 生产构建跳过带 `debug` 属性 demo 的目录收集 |
| `markdown.demo.wrapper` | `'demo'` | demo 标签名 |
| `markdown.externalLink` | `true` | 外部链接自动 `target="_blank"` + `rel="noopener noreferrer"` |
| `demo.include` | `/src/pages/**/demo/*.vue` | demo 收集范围 |
| `demo.sourceVersionOnHmr` | `true` | 任意 HMR 提升 sourceVersion,促使已挂载 demo 重新拉取源码 |
| `demo.jsFormatter` | 内置 oxfmt | TS → JS 源码格式化器,可用 `createOxfmtJsFormatter(style)` 换风格 |
| ~~`demo.renderSourceHtml` / `demo.virtualMode`~~ | 已移除 | 源码统一在浏览器端编译展示;`virtual:demos` 统一为懒加载注册表 |

## API 总览

- `mdPlugin(options)` / `md2VuePlugin` / `demoPlugin`
- `createMarkdown` / `useMarkdown` / `loadBaseMd` / `loadShiki`(`CreateMarkdownOptions`)
- markdown-it 插件:`container` / `demo` / `github-alerts` / `image` / `link` / `pre-wrapper` / `stackblitz` / `table`
- `postcssIsolateStyles`:markdown 样式隔离 PostCSS 插件
- `tsToJs` + `createOxfmtJsFormatter`:demo 源码 TS → JS 转换与格式化
- 组件:`CodeDemo` + `provideDemoContext` / `useDemoContext`(类型:`DemoModule` / `DemoSourceData` 等)
- 工具:`getDemoId` / `shortHash`

## 本地开发

```bash
pnpm install        # 安装依赖
pnpm build          # tsdown 构建 dist(插件部分;组件以 src 源码形态被站点引用)
pnpm dev            # watch 模式
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
```

下游站点开发期可通过 pnpm `link:` 引用本工程联调,发布后改为正常版本依赖。
