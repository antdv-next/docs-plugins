import type { JsFormatter } from './tsToJs'

type OxfmtFormat = (typeof import('oxfmt'))['format']

export interface OxfmtStyleOptions {
  /** 语句末尾分号 */
  semi?: boolean
  /** 使用单引号 */
  singleQuote?: boolean
  [key: string]: unknown
}

let oxfmtPromise: Promise<OxfmtFormat | null> | null = null

async function getOxfmtFormat() {
  if (!oxfmtPromise) {
    oxfmtPromise = (async () => {
      try {
        const { format } = await import('oxfmt')
        return format
      }
      catch {
        return null
      }
    })()
  }
  return oxfmtPromise
}

/**
 * 基于 oxfmt 的内置 demo 源码 JS 格式化器。
 * oxfmt 随本包安装，站点无需自行提供格式化器；
 * 不可用时静默降级为不格式化。
 */
export function createOxfmtJsFormatter(style: OxfmtStyleOptions = {}): JsFormatter {
  return async (code, lang) => {
    try {
      const format = await getOxfmtFormat()
      if (!format)
        return code

      const filePath = `virtual-demo-script.${lang === 'tsx' ? 'jsx' : 'js'}`
      const result = await format(filePath, code, style)
      return result.errors.length > 0 ? code : result.code
    }
    catch {
      return code
    }
  }
}
