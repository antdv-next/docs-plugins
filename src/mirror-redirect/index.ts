/**
 * 主站与国内镜像站之间的访问判定与跳转。
 *
 * 文档站点通常同时部署在国际主站与国内镜像站上:镜像站面向中国大陆,
 * 访问更快,也可能需要展示 ICP 备案。主站需要识别来自中国大陆的访客,
 * 引导他们切换到镜像站继续浏览。各站点此前常各自复制一份"判定 + 跳转"
 * 实现,后续修补难以同步;这里把它收敛为按站点配置实例化的单一实现:
 * 站点只需要声明自己的差异 —— 权威域名、镜像站 origin、路径映射方式、
 * 探测资源等 —— 判断流程完全复用。
 *
 * 选项默认值按一份实践中打磨过的配置设定:
 * - 只有权威主站域名会触发跳转,preview 部署和 localhost 不受影响;
 * - 先用浏览器语言、时区、国内文档路径做本地信号打分,港/澳/台直接排除;
 * - 信号不足以判断时,再走 GeoIP 接口链二次确认(接口可达但判定非国内即停);
 * - 提示或跳转前先探测镜像站能否访问(用图片请求避开 CORS),可关闭;
 * - 用户的通过/拒绝偏好写入 localStorage,拒绝会带 TTL,过期后重新询问。
 *
 * 本模块只包含纯浏览器逻辑,不依赖 Vue / antd;弹窗与文案由站点负责。
 */

export type MirrorRedirectPreference = 'accepted' | 'rejected'
export type MirrorRedirectDecision = 'redirect' | 'prompt' | 'skip'

/** 主机匹配规则:`equals` 精确匹配;`subdomainsOf` 匹配域名本身及其所有子域。 */
export interface HostnameMatcher {
  /** 精确相等的主机名(小写、可带尾点,自动规范化)。 */
  equals?: string[]
  /** 命中该域名本身或以 `.${domain}` 结尾的任意子域。 */
  subdomainsOf?: string[]
}

export interface GeoIpApi {
  url: string
  /**
   * 解析响应文本并判定是否为国内(中国大陆)访问。
   * 返回 false 表示接口可达但判定非国内 —— 判定链立即停止,不再尝试后续接口;
   * 网络 / CORS / HTTP 非 2xx 失败则继续下一个接口。
   */
  parse: (text: string) => boolean
}

export interface MirrorRedirectOptions {
  /**
   * 权威主站域名(跳转发起方),如 `['example.com', 'www.example.com']`。
   * 只有这些域名会触发跳转/提示,preview 部署和 localhost 不受影响。
   */
  mainHosts: string[]

  /**
   * 国内镜像站 origin,如 `'https://www.example.cn'`。
   * 跳转时保留当前 pathname/search/hash,只替换 origin。
   */
  mirrorOrigin: string

  /**
   * 判断"当前站点是否部署在镜像域"的匹配规则,`isMirrorHost()` 按它判断
   * (例如只在镜像站展示 ICP 备案)。
   * @default 由 mirrorOrigin 推导:去掉 `www.` 前缀,按该域名及其子域匹配
   */
  mirrorHosts?: HostnameMatcher

  /**
   * 国际主站路径 → 镜像站路径 的映射。
   * - `'cn-suffix'`:追加 `-cn`(`/` → `/index-cn`,已带 `-cn` 或 `/~demos` 保持不变);
   * - `'same'`:两站路由一致,直接保留原路径;
   * - 自定义函数:返回目标路径。
   * @default 'cn-suffix'
   */
  pathname?: 'cn-suffix' | 'same' | ((pathname: string) => string)

  /**
   * 是否启用本地信号(浏览器语言 / 时区 / `-cn` 路径)打分。
   * @default true
   */
  localSignals?: boolean

  /**
   * GeoIP 回退链:本地信号不足以判定时按序尝试,首个可达接口出结论。
   * @default v4_dx.boce.com 单接口
   */
  geoApis?: GeoIpApi[]

  /** 单个 GeoIP 接口超时。@default 1500 */
  geoTimeoutMs?: number

  /**
   * 镜像站可达性探测地址(图片请求,跨域也不需要 CORS)。
   * 提示或跳转之前会先确认镜像站确实能访问;传 `null` 关闭探测,
   * 直接按可达处理。
   * @default null
   */
  probeUrl?: string | null

  /** 可达性探测超时。@default 1500 */
  probeTimeoutMs?: number

  /** 偏好 localStorage key。@default 'cn-site-redirect-preference' */
  storageKey?: string

  /**
   * 用户拒绝后需要等待多久才重新询问(ms)。带过期时间是为了照顾
   * 经常往返两地的用户;传 `Infinity` 表示永久记住。
   * @default 30 天
   */
  rejectedTtlMs?: number

  /**
   * 本地信号得分达到该值才直接提示,不再请求 GeoIP。
   * @default 3
   */
  confidentScore?: number

  /**
   * `localStorage.DEBUG` 的强制触发值(含 localhost):设 `'site-a'`
   * 后 `localStorage.DEBUG = 'site-a'` 强制走完整流程。省略则禁用该开关。
   */
  debugValue?: string

  /**
   * 单次访问豁免的 query 参数名:`?${param}=off` 跳过本次判定
   * (用于有意引导到国际站时)。
   * @default 'cn-redirect'
   */
  disableSearchParam?: string
}

export interface MirrorRedirect {
  /** 当前用户偏好;无记录或已过期返回 null。兼容旧版写入的纯字符串值。 */
  getPreference: () => MirrorRedirectPreference | null

  /** 写入偏好(带时间戳)。 */
  setPreference: (preference: MirrorRedirectPreference) => void

  /** 构造跳转 URL;不在主站权威域名、位于 `/~demos` 或与当前地址相同返回 null。 */
  buildRedirectUrl: () => string | null

  /** 跳转到镜像站对应页面(`location.replace`,不产生历史记录)。 */
  redirect: () => void

  /**
   * 返回本次访问应该怎么处理:自动跳转 / 询问用户 / 静默跳过。
   * 判断会读取 window 的 location、navigator、localStorage,并可能用到
   * fetch 与 Image,所以要等进入浏览器环境之后再调用
   * (比如组件 mounted 之后)。
   */
  getDecision: () => Promise<MirrorRedirectDecision>

  /** 主机名是否命中镜像站部署规则(可与 localhost 判断并用,如备案展示)。 */
  isMirrorHost: (hostname: string) => boolean
}

interface IpAddrResponse {
  code?: number
  message?: string
  data?: {
    from?: string
    ip?: string
  }
}

interface StoredPreference {
  value: MirrorRedirectPreference
  time: number
}

const DEFAULT_STORAGE_KEY = 'cn-site-redirect-preference'
const DEFAULT_REJECTED_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_GEO_TIMEOUT_MS = 1500
const DEFAULT_PROBE_TIMEOUT_MS = 1500
const DEFAULT_CONFIDENT_SCORE = 3
const DEFAULT_DISABLE_SEARCH_PARAM = 'cn-redirect'

// 仅中国大陆(不含港澳台)的 IANA 时区;港澳台走国际站,不进国内通道。
const MAINLAND_TIME_ZONES = [
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Chungking',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
  'PRC',
]
const NON_MAINLAND_TIME_ZONES = ['Asia/Hong_Kong', 'Asia/Macau', 'Asia/Macao', 'Asia/Taipei']
const NON_MAINLAND_LANGUAGE_REGIONS = ['hk', 'mo', 'tw', 'sg', 'hant']
const NON_MAINLAND_IP_REGIONS = ['香港', '澳门', '澳門', '台湾', '台灣']

const DEFAULT_GEO_APIS: GeoIpApi[] = [
  {
    url: 'https://v4_dx.boce.com:44433/ipaddr',
    parse: (text) => {
      try {
        const result = JSON.parse(text) as IpAddrResponse
        return isChinaMainlandVisit(result.data?.from)
      }
      catch {
        return false
      }
    },
  },
]

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

function hostMatches(hostname: string, matcher: HostnameMatcher): boolean {
  const host = normalizeHostname(hostname)

  if (!host)
    return false

  if (matcher.equals?.some(item => normalizeHostname(item) === host))
    return true

  return matcher.subdomainsOf?.some((domain) => {
    const d = normalizeHostname(domain)
    return host === d || host.endsWith(`.${d}`)
  }) ?? false
}

function toCnSuffixPathname(pathname: string): string {
  if (pathname === '/' || pathname === '')
    return '/index-cn'
  if (pathname.startsWith('/~demos') || pathname.endsWith('-cn'))
    return pathname
  return `${pathname}-cn`
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  }
  catch {
    // 禁用 cookie、隐私模式等场景下 localStorage 可能抛错,不能因此打断页面。
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  }
  catch {
    // 配额不足或隐私模式写不进去时直接忽略,下次访问会再问一次。
  }
}

/**
 * 低成本的本地信号打分:单条弱信号不足以单独触发提示,港/澳/台(时区或
 * 语言)直接否决。语言 zh-CN/zh-Hans +2、其他 zh-* +1;大陆时区 +2;
 * 命中 `-cn` 页面 +1。
 */
function getLocalSignalScore(pathname: string): number {
  // navigator.languages 可能为空,退回到单个 language。
  const { languages, language } = window.navigator
  const languageTags = (languages?.length ? [...languages] : [language])
    .filter(Boolean)
    .map(tag => tag.toLowerCase())

  let timeZone = ''

  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  }
  catch {
    // 个别环境 Intl 不可用,时区信号缺失不阻塞其余信号。
  }

  const vetoed = NON_MAINLAND_TIME_ZONES.includes(timeZone)
    || languageTags.some(tag => tag.startsWith('zh-')
      && NON_MAINLAND_LANGUAGE_REGIONS.some(region => tag.includes(region)))

  if (vetoed)
    return 0

  let score = 0

  if (languageTags.some(tag => tag === 'zh-cn' || tag.startsWith('zh-hans')))
    score += 2
  else if (languageTags.some(tag => tag === 'zh' || tag.startsWith('zh-')))
    score += 1

  if (MAINLAND_TIME_ZONES.includes(timeZone))
    score += 2

  // 已在国内文档页(`-cn` 路径,斜杠结尾也命中)本身就是强信号。
  if (/-cn\/?$/.test(pathname))
    score += 1

  return score
}

/** boce 接口的返回文本以"中国 福建 福州"等表述来源,港澳台需单独排除。 */
function isChinaMainlandVisit(from: string | undefined): boolean {
  if (!from)
    return false

  if (NON_MAINLAND_IP_REGIONS.some(region => from.includes(region)))
    return false

  return from === '中国' || from.startsWith('中国/')
}

export function createMirrorRedirect(options: MirrorRedirectOptions): MirrorRedirect {
  const {
    mainHosts,
    mirrorOrigin,
    mirrorHosts: mirrorHostsOption,
    pathname = 'cn-suffix',
    localSignals = true,
    geoApis = DEFAULT_GEO_APIS,
    geoTimeoutMs = DEFAULT_GEO_TIMEOUT_MS,
    probeUrl = null,
    probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    storageKey = DEFAULT_STORAGE_KEY,
    rejectedTtlMs = DEFAULT_REJECTED_TTL_MS,
    confidentScore = DEFAULT_CONFIDENT_SCORE,
    debugValue,
    disableSearchParam = DEFAULT_DISABLE_SEARCH_PARAM,
  } = options

  const mapPathname = (pathnameValue: string): string => {
    if (pathname === 'cn-suffix')
      return toCnSuffixPathname(pathnameValue)
    if (pathname === 'same')
      return pathnameValue
    return pathname(pathnameValue)
  }

  const mirrorHosts = mirrorHostsOption ?? deriveHostsFromOrigin(mirrorOrigin)

  const isRedirectableHost = (hostname: string): boolean => {
    // 只有权威主站域名参与跳转,preview 部署和 localhost 不受影响;
    // 调试开关(localStorage.DEBUG === debugValue)也会放行,和 getDecision 里的判断保持一致。
    const normalized = normalizeHostname(hostname)
    return mainHosts.some(host => normalizeHostname(host) === normalized)
      || readStorage('DEBUG') === debugValue
  }

  // 镜像站是否可达只需要探测一次;图片请求不需要 CORS,跨域也能用。
  let cnSiteReachablePromise: Promise<boolean> | null = null
  const probeReachable = (): Promise<boolean> => {
    if (!probeUrl)
      return Promise.resolve(true)

    cnSiteReachablePromise ??= new Promise<boolean>((resolve) => {
      const image = new Image()
      let settled = false

      const settle = (reachable: boolean) => {
        if (!settled) {
          settled = true
          resolve(reachable)
        }
      }

      image.onload = () => settle(true)
      image.onerror = () => settle(false)
      image.src = probeUrl

      window.setTimeout(() => settle(false), probeTimeoutMs)
    })

    return cnSiteReachablePromise
  }

  const getPreference = (): MirrorRedirectPreference | null => {
    if (typeof window === 'undefined')
      return null

    const raw = readStorage(storageKey)

    if (!raw)
      return null

    // 旧版站点写入的是纯字符串,继续兼容。
    if (raw === 'accepted' || raw === 'rejected')
      return raw

    let stored: StoredPreference | null = null

    try {
      stored = JSON.parse(raw) as StoredPreference
    }
    catch {
      return null
    }

    if (stored?.value !== 'accepted' && stored?.value !== 'rejected')
      return null

    if (stored.value === 'rejected'
      && rejectedTtlMs < Number.POSITIVE_INFINITY
      && Date.now() - stored.time > rejectedTtlMs) {
      return null
    }

    return stored.value
  }

  const setPreference = (preference: MirrorRedirectPreference): void => {
    if (typeof window === 'undefined')
      return

    writeStorage(
      storageKey,
      JSON.stringify({ value: preference, time: Date.now() } satisfies StoredPreference),
    )
  }

  const buildRedirectUrl = (): string | null => {
    if (typeof window === 'undefined')
      return null

    const { location } = window

    if (!isRedirectableHost(location.hostname) || location.pathname.startsWith('/~demos'))
      return null

    const targetUrl = new URL(mirrorOrigin)
    targetUrl.pathname = mapPathname(location.pathname)
    targetUrl.search = location.search
    targetUrl.hash = location.hash

    return targetUrl.href === location.href ? null : targetUrl.href
  }

  const redirect = (): void => {
    const targetUrl = buildRedirectUrl()

    if (targetUrl)
      window.location.replace(targetUrl)
  }

  /**
   * GeoIP 接口链二次确认,只在本地信号不足以判断时使用:某个接口一旦返回
   * 成功就立刻下结论(判定非国内即停止);只有网络错误、CORS 失败或非 2xx
   * 响应才继续尝试下一个接口。
   */
  const lookupChinaMainland = async (): Promise<boolean> => {
    for (const api of geoApis) {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), geoTimeoutMs)

      try {
        const response = await fetch(api.url, { signal: controller.signal })

        if (!response.ok)
          continue

        const text = await response.text()
        let mainland = false

        try {
          mainland = api.parse(text)
        }
        catch {
          // 解析失败按"接口可达但非国内"处理,停止探测。
        }

        return mainland
      }
      catch {
        // 忽略网络与 CORS 失败,尝试下一个接口。
      }
      finally {
        window.clearTimeout(timeoutId)
      }
    }

    return false
  }

  const getDecision = async (): Promise<MirrorRedirectDecision> => {
    if (typeof window === 'undefined')
      return 'skip'

    const { location } = window

    // `?${disableSearchParam}=off` 表示本次访问不参与判定,方便刻意留在国际站。
    if (new URLSearchParams(location.search).get(disableSearchParam) === 'off' || !buildRedirectUrl())
      return 'skip'

    const preference = getPreference()

    if (preference === 'rejected')
      return 'skip'

    if (preference === 'accepted')
      return await probeReachable() ? 'redirect' : 'skip'

    // 调试开关(localStorage.DEBUG === debugValue,含 localhost)直接按高分处理,
    // 和 isRedirectableHost 里的判断保持一致。
    const forced = readStorage('DEBUG') === debugValue
    const score = forced
      ? confidentScore
      : (localSignals ? getLocalSignalScore(location.pathname) : 0)

    // 没有任何本地信号时直接跳过,不为 GeoIP 额外发请求。
    if (score <= 0)
      return 'skip'

    if (score < confidentScore && !await lookupChinaMainland())
      return 'skip'

    return await probeReachable() ? 'prompt' : 'skip'
  }

  return {
    getPreference,
    setPreference,
    buildRedirectUrl,
    redirect,
    getDecision,
    isMirrorHost: hostname => hostMatches(hostname, mirrorHosts),
  }
}

function deriveHostsFromOrigin(origin: string): HostnameMatcher {
  let host = origin

  try {
    host = new URL(origin).hostname
  }
  catch {
    // origin 非法时按原始字符串匹配,由调用方保证配置正确。
  }

  const domain = normalizeHostname(host).replace(/^www\./, '')

  return domain ? { subdomainsOf: [domain] } : {}
}
