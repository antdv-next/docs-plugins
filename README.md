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
  // openStackBlitz / demoPageUrl / editUrl / iframeRenderer / preferredCodeType 可选
  // copyCode: false 可隐藏操作栏复制按钮(默认显示)
})
```

```vue
<CodeDemo src="/src/pages/components/button/demo/basic.vue">
  基本用法
</CodeDemo>
```

- 展开代码面板即得可编辑编辑器(Sandpack),编辑内容经 `@vue/compiler-sfc` + `sucrase` 在浏览器端实时编译并替换预览
- 操作栏按钮全部由站点能力驱动:未提供的能力(如 StackBlitz)对应按钮自动隐藏;复制按钮默认显示,`copyCode: false` 可关闭;标题区编辑图标由 `editUrl` 提供时显示

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

## 国内镜像通道(主站 → `.cn` 镜像站)

antdv-next 主站(www.antdv-next.com ⇄ www.antdv-next.cn)和 x 站
(x.antdv-next.com ⇄ x.antdv-next.cn)之前各自维护过一份"检测到国内访问,
就引导到镜像站"的逻辑。这份逻辑(语言 / 时区本地信号、GeoIP 回退、可达性
探测、偏好记忆、调试与豁免开关)现在已经收敛成一份按站点配置实例化的实现;
弹窗和文案仍然由站点自己负责,因为两个站点的弹窗方式不同。

```ts
import { createMirrorRedirect } from '@antdv-next/docs-plugins'

const mirror = createMirrorRedirect({
  mainHosts: ['antdv-next.com', 'www.antdv-next.com'],
  mirrorOrigin: 'https://www.antdv-next.cn',
  // 跳转前先探测镜像站能不能访问(用图片请求,跨域不需要 CORS);
  // 不需要探测的站点可以省略这行
  probeUrl: 'https://www.antdv-next.cn/antdv-next.png',
})
```

```ts
// 在组件 mounted 之后调用一次
const decision = await mirror.getDecision()

if (decision === 'redirect') {
  mirror.redirect() // location.replace,保留 pathname/search/hash
  return
}
if (decision === 'prompt') {
  // 用站点自己的弹窗 + 文案询问;用户确认后 setPreference('accepted') 再 redirect()
}
```

- 只有 `mainHosts` 里的权威主站域名会触发,localhost 和 preview 部署不受影响
- 用户选过 `accepted` → 镜像站可达就自动跳转;选过 `rejected` → 跳过
  (拒绝默认记住 30 天,可用 `rejectedTtlMs` 调整)
- 没有偏好时,先按语言 / 时区 / `-cn` 路径打分(港/澳/台直接排除),分数不足
  再查 GeoIP(`geoApis`,默认 boce 单接口);没配 `probeUrl` 就不探测
- 调试:`localStorage.DEBUG = debugValue` 可强制走完整流程(含 localhost);
  本次豁免:`?cn-redirect=off`(参数名可用 `disableSearchParam` 改)
- `mirror.isMirrorHost(hostname)`:判断主机是否属于镜像站部署
  (比如只在 `.cn` 镜像站展示 ICP 备案)

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
- 镜像通道:`createMirrorRedirect`(类型:`MirrorRedirectOptions` / `MirrorRedirect` / `MirrorRedirectDecision`)
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
