import { transformWithOxc } from 'vite'

/**
 * TS -> JS 源码的格式化器。
 * 站点各自注入（如 eslint / oxfmt），失败时返回原始代码即可。
 */
export type JsFormatter = (code: string, lang: string) => Promise<string> | string

const SCRIPT_BLOCK_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const SCRIPT_LANG_REGEX = /\blang\s*=\s*(['"]?)([\w-]+)\1/i
const TS_LANGS = new Set(['ts', 'tsx', 'mts', 'cts'])
const EXPORT_MARKER_REGEX = /\n?export\s*\{\s*\};?\s*$/u

async function transpileScript(code: string, lang: string) {
  const oxcLang = lang === 'tsx' ? 'tsx' : 'ts'
  const result = await transformWithOxc(code, `virtual-demo-script.${oxcLang}`, {
    lang: oxcLang,
    sourceType: 'module',
    target: 'es2020',
    jsx: oxcLang === 'tsx' ? 'preserve' : undefined,
    typescript: {
      onlyRemoveTypeImports: true,
    },
    sourcemap: false,
  })

  // remove `export {}`
  return result.code.replace(EXPORT_MARKER_REGEX, '')
}

export async function tsToJs(sourceCode: string, format?: JsFormatter) {
  let nextSourceCode = ''
  let lastIndex = 0
  SCRIPT_BLOCK_REGEX.lastIndex = 0

  for (const match of sourceCode.matchAll(SCRIPT_BLOCK_REGEX)) {
    const [fullMatch, attrs = '', code = ''] = match
    const startIndex = match.index ?? 0
    nextSourceCode += sourceCode.slice(lastIndex, startIndex)

    const langMatch = attrs.match(SCRIPT_LANG_REGEX)
    if (!langMatch) {
      nextSourceCode += fullMatch
      lastIndex = startIndex + fullMatch.length
      continue
    }

    const [, quote, lang = ''] = langMatch
    const normalizedLang = lang.toLowerCase()
    if (!TS_LANGS.has(normalizedLang)) {
      nextSourceCode += fullMatch
      lastIndex = startIndex + fullMatch.length
      continue
    }

    const nextLang = normalizedLang === 'tsx' ? 'jsx' : 'js'
    const wrappedQuote = quote || '"'
    const nextAttrs = attrs.replace(
      SCRIPT_LANG_REGEX,
      `lang=${wrappedQuote}${nextLang}${wrappedQuote}`,
    )

    try {
      const transpiledCode = await transpileScript(code, normalizedLang)
      const normalizedCode = format
        ? await format(transpiledCode, normalizedLang)
        : transpiledCode
      nextSourceCode += `<script${nextAttrs}>\n${normalizedCode.trim()}\n</script>`
    }
    catch {
      nextSourceCode += fullMatch
    }

    lastIndex = startIndex + fullMatch.length
  }

  nextSourceCode += sourceCode.slice(lastIndex)
  return nextSourceCode
}
