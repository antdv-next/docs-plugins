# @antdv-next/docs-plugins

antdv-next 文档站与 x 组件文档站共享的 Vite / markdown-it 插件集。

独立工程，不属于任何一个仓库，位于两个仓库旁边：

```
/Users/carl/Desktop/antdv-next/
├── antdv-next/        # 主仓库（组件库 + 文档站）
├── x/                 # x 组件仓库（文档站）
└── docs-plugins/      # 本工程
```

## 消费方式

两个仓库均通过 pnpm `link:` 协议引用本工程（改完代码重新 `pnpm build` 即生效）：

- `antdv-next/docs/package.json` → `"@antdv-next/docs-plugins": "link:../../docs-plugins"`
- `x/packages/docs/package.json` → `"@antdv-next/docs-plugins": "link:../../../docs-plugins"`

## 内容

- `mdPlugin`：docs 站点默认的 markdown 插件组合（md2vue + demo）
- `createMarkdown` / `useMarkdown`：markdown-it 渲染链路（shiki 高亮、anchor、toc、容器等）
- `demoPlugin`：demo 收集虚拟模块（`virtual:demos`，懒加载注册表，支持开发时增删 demo 热更新）
- `md2VuePlugin`：markdown → Vue SFC 转换
- markdown-it 插件：container / demo / github-alerts / image / link / pre-wrapper / stackblitz / table
- `postcssIsolateStyles`：markdown 样式隔离 PostCSS 插件
- `tsToJs` + `createOxfmtJsFormatter`：demo 源码 TS → JS 转换与内置 oxfmt 格式化

## 统一默认行为(两站一致)

- `virtual:demos` 为懒加载注册表(代码分割按需加载，开发时增删 demo 文件自动热更新)，站点通过 `loadDemo(id)` 异步获取 demo
- demo 锚点统一挂到 slug 为 `examples` 的标题下(`markdown.demo.headerMode: examples` 默认值)
- 生产构建跳过带 `debug` 属性 demo 的目录收集(`markdown.demo.debugDemo` 默认 `true`)
- 外部链接自动 `target="_blank"` + `rel="noopener noreferrer"`(`markdown.externalLink` 默认 `true`)
- 任意 HMR 更新提升 sourceVersion，促使已挂载 demo 重新拉取源码(`demo.sourceVersionOnHmr` 默认 `true`)
- TS -> JS 源码格式化使用内置 oxfmt 格式化器(可用 `createOxfmtJsFormatter(style)` 调整风格，或通过 `demo.jsFormatter` 注入自定义实现)
- 源码数据只含 `source` / `jsSource` / `extraFiles`，代码展示与在线编辑由站点在浏览器端完成(Sandpack 编辑器 + `@vue/compiler-sfc` 实时编译)

以上默认均为两站对齐后的约定；如站点确有差异需求，选项仍可显式覆盖。

## demo 锚点约定（两站统一）

页面中收集 demo 的章节标题需使用统一写法，demo 锚点会挂到 slug 为 `examples` 的标题下：

```md
## 代码演示 {#examples}   <!-- 中文页 -->
## Examples               <!-- 英文页，slug 自动为 examples -->
```

不在该章节内的 demo（如语义化 DOM 区、教程页）不会出现在右侧目录，与 antdv-next 行为一致。

## 开发

```bash
pnpm install        # 安装依赖
pnpm build          # tsdown 构建 dist（改动后需重新构建，两边站点才会生效）
pnpm dev            # watch 模式
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
```
