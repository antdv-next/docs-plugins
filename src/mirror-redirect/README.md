# 镜像通道跳转(`createMirrorRedirect`)

主站与国内镜像站之间的访问判定与跳转。

文档站点通常同时部署在国际主站与国内镜像站上:镜像站面向中国大陆,访问
更快,也可能需要展示 ICP 备案。主站需要识别来自中国大陆的访客,引导他们
切换到镜像站继续浏览。各站点此前常各自复制一份实现,后续修补难以同步;
本模块把"判定 + 跳转"收敛为按站点配置实例化的单一实现,站点只需声明
自身差异,判断流程完全复用。

模块只包含纯浏览器逻辑,不依赖 Vue / antd;弹窗与文案由站点负责。

## 使用

```ts
import { createMirrorRedirect } from '@antdv-next/docs-plugins'

const mirror = createMirrorRedirect({
  mainHosts: ['example.com', 'www.example.com'],
  mirrorOrigin: 'https://www.example.cn',
  // 跳转前先探测镜像站能不能访问(用图片请求,跨域不需要 CORS);
  // 不需要探测的站点可以省略这行
  probeUrl: 'https://www.example.cn/probe.png',
})
```

在组件 mounted 之后调用一次:

```ts
const decision = await mirror.getDecision()

if (decision === 'redirect') {
  mirror.redirect() // location.replace,保留 pathname/search/hash
  return
}
if (decision === 'prompt') {
  // 用站点自己的弹窗 + 文案询问;用户确认后 setPreference('accepted') 再 redirect()
}
```

## 决策流程

1. 当前域名不在 `mainHosts` 内,或 URL 带 `?cn-redirect=off` → 跳过
2. 用户之前选过:
   - `accepted` → 镜像站可达则直接跳转
   - `rejected` → 跳过(默认记住 30 天,可用 `rejectedTtlMs` 调整)
3. 没有偏好时按本地信号打分:
   - 浏览器语言:`zh-CN` / `zh-Hans` +2,其他 `zh-*` +1
   - 时区命中大陆时区 +2;港 / 澳 / 台时区或语言直接否决
   - 命中国内文档路径(如 `-cn` 后缀)+1
   - 分数 ≥ `confidentScore`(默认 3)才直接提示;分数不足时再查 GeoIP
4. GeoIP 接口链(`geoApis`,默认 v4_dx.boce.com 单接口)按序尝试,某个接口
   一旦成功返回就下结论(判定非国内即停止),只有网络错误 / CORS 失败 /
   非 2xx 响应才换下一个
5. 提示或跳转前,若配置了 `probeUrl`,先确认镜像站确实可访问

## 选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `mainHosts` | 必填 | 权威主站域名(跳转发起方),只有这些域名会触发;preview 部署和 localhost 不受影响 |
| `mirrorOrigin` | 必填 | 国内镜像站 origin;跳转保留当前 pathname/search/hash,只替换 origin |
| `mirrorHosts` | 由 `mirrorOrigin` 推导 | 判断"当前是否部署在镜像域"的匹配规则,`isMirrorHost()` 使用(如只在镜像站展示备案) |
| `pathname` | `'cn-suffix'` | 路径映射:`'cn-suffix'` 追加 `-cn`(`/` → `/index-cn`);`'same'` 两站路由一致原样保留;或自定义函数 |
| `localSignals` | `true` | 是否启用语言 / 时区 / 路径本地信号打分 |
| `geoApis` | boce 单接口 | GeoIP 回退链,本地信号不足时二次确认 |
| `geoTimeoutMs` | `1500` | 单个 GeoIP 接口超时 |
| `probeUrl` | `null` | 镜像站可达性探测地址;传 `null` 不探测,按可达处理 |
| `probeTimeoutMs` | `1500` | 可达性探测超时 |
| `storageKey` | `'cn-site-redirect-preference'` | 偏好存储 key(兼容旧版写入的纯字符串值) |
| `rejectedTtlMs` | 30 天 | 用户拒绝后多久重新询问;`Infinity` 永久记住 |
| `confidentScore` | `3` | 本地信号达到该分数才直接提示,不再请求 GeoIP |
| `debugValue` | 无 | 设 `localStorage.DEBUG = debugValue` 强制走完整流程(含 localhost);省略禁用 |
| `disableSearchParam` | `'cn-redirect'` | URL 带 `?{param}=off` 时本次访问不参与判定 |

## API

`createMirrorRedirect(options)` 返回:

- `getDecision(): Promise<'redirect' | 'prompt' | 'skip'>`
- `redirect(): void`
- `buildRedirectUrl(): string | null`
- `getPreference(): 'accepted' | 'rejected' | null`
- `setPreference(preference): void`
- `isMirrorHost(hostname): boolean` —— 主机是否属于镜像站部署(可配合
  localhost 判断用于备案展示)

类型:`MirrorRedirectOptions` / `MirrorRedirect` / `MirrorRedirectDecision` /
`MirrorRedirectPreference` / `HostnameMatcher` / `GeoIpApi`
