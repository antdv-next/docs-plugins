const BACKSLASH_RE = /\\/g
const LEADING_SLASH_RE = /^\/+/
const EXTENSION_RE = /\.[^.]+$/
const PATH_SEP_RE = /[/\\.]/g

/**
 * 由 demo 文件路径生成稳定的锚点 id：
 * 取路径中最后一个 `demo` 目录往前一级（组件目录）组成的路径，
 * 去掉扩展名并把分隔符替换为 `-`。
 */
export function getDemoId(src: string) {
  if (!src)
    return ''

  const segments = src.replace(BACKSLASH_RE, '/').split('/').filter(Boolean)
  const reversedSegments = [...segments].reverse()
  const demoIndex = reversedSegments.findIndex(
    segment => segment.toLowerCase() === 'demo',
  )

  if (demoIndex === -1) {
    return src
      .replace(LEADING_SLASH_RE, '')
      .replace(EXTENSION_RE, '')
      .replace(PATH_SEP_RE, '-')
  }

  const componentDemoPath = reversedSegments
    .slice(0, demoIndex + 2)
    .reverse()
    .join('/')
  return componentDemoPath.replace(EXTENSION_RE, '').replace(PATH_SEP_RE, '-')
}
