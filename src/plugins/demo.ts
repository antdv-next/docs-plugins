import type { MarkdownItEnv, MarkdownItHeader } from '@mdit-vue/types'
import type MarkdownIt from 'markdown-it'
import pathe from 'pathe'
import { getDemoId } from '../demo/get-demo-id'

const HEADING_LEVEL_RE = /^h([2-6])$/
const SRC_ATTR_RE = /(\s|^)src=(['"])(.*?)\2/gi

export interface DemoMarkdownPluginOptions {
  /** 包裹 demo 的标签名，默认 `demo` */
  wrapper?: string
  /**
   * demo 锚点归属模式：
   * - `examples`：demo 统一挂到 slug 为 `examples` 的标题下（antdv-next 约定，默认）
   * - `section`：demo 挂到当前所在章节标题下（跟随标题层级）
   */
  headerMode?: 'examples' | 'section'
  /**
   * 生产构建时跳过 `debug` demo 的目录收集
   * @default true
   */
  debugDemo?: boolean
}

declare module '@mdit-vue/types' {
  interface MarkdownItEnv {
    id?: string
  }
}

function checkWrapper(content: string, wrapper = 'demo') {
  return new RegExp(`<${wrapper}(\\s|>|/)`, 'i').test(content)
}

function isProdDebugDemo(tag: string) {
  if (process.env.NODE_ENV !== 'production') {
    return false
  }

  const debugAttr = tag.match(/(?:^|\s)debug(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/i)
  if (!debugAttr) {
    return false
  }

  const value = debugAttr[1] ?? debugAttr[2] ?? debugAttr[3]
  return value === undefined || value === '' || value === 'true'
}

function flattenHeaders(headers: MarkdownItHeader[] = []) {
  const headerMap = new Map<string, MarkdownItHeader>()

  const visit = (items: MarkdownItHeader[]) => {
    for (const item of items) {
      headerMap.set(item.slug, item)
      if (item.children?.length)
        visit(item.children)
    }
  }

  visit(headers)
  return headerMap
}

function flattenHeadersInOrder(headers: MarkdownItHeader[] = []) {
  const flat: MarkdownItHeader[] = []

  const visit = (items: MarkdownItHeader[]) => {
    for (const item of items) {
      flat.push(item)
      if (item.children?.length)
        visit(item.children)
    }
  }

  visit(headers)
  return flat
}

function getHeadingSlug(token: { attrs?: [string, string][] | null }) {
  return token.attrs?.find(attr => attr[0] === 'id')?.[1]
}

function getHeadingTitle(token?: { type?: string, content?: string }) {
  if (token?.type !== 'inline')
    return ''
  return token.content?.trim() ?? ''
}

function getHeadingLevel(token: { tag?: string }) {
  const match = token.tag?.match(HEADING_LEVEL_RE)
  if (!match)
    return null
  return Number(match[1])
}

export function replaceSrcPath(
  content: string,
  id: string,
  root: string,
  wrapper = 'demo',
  parentHeader?: MarkdownItHeader,
  skipDebugDemo = false,
) {
  function replaceSrcInTag(tagMatch: string, titleContent?: string) {
    return tagMatch.replace(SRC_ATTR_RE, (srcMatch, prefix, quote, srcValue) => {
      if (!srcValue || srcValue.startsWith('/'))
        return srcMatch

      const dir = pathe.dirname(id)
      const filePath = pathe.resolve(dir, srcValue)
      const relative = pathe.relative(root, filePath)

      if (parentHeader && titleContent && !(skipDebugDemo && isProdDebugDemo(tagMatch))) {
        const slug = getDemoId(filePath)
        const item = {
          level: parentHeader.level + 1,
          title: titleContent,
          slug,
          link: `#${slug}`,
          children: [],
        }
        if (parentHeader.children)
          parentHeader.children.push(item)
        else
          parentHeader.children = [item]
      }

      return `${prefix}src=${quote}${relative.startsWith('/') ? relative : `/${relative}`}${quote}`
    })
  }

  // 1. First, match closed tags <demo>Title</demo> to extract title content
  const closedTag = new RegExp(`(<${wrapper}(?!-)\\b[^>]*>)([\\s\\S]*?)<\\/${wrapper}>`, 'gi')
  let result = content.replace(closedTag, (tagMatch, openTag, titleContent) => {
    return tagMatch.replace(
      openTag,
      replaceSrcInTag(openTag, titleContent?.trim()),
    )
  })

  // 2. Then, match self-closing tags <demo ... />
  const selfClosing = new RegExp(`<${wrapper}(?!-)\\b[^>]*/\\s*>`, 'gi')
  result = result.replace(selfClosing, tagMatch => replaceSrcInTag(tagMatch))

  // 3. Finally, match standalone open tags <demo ...> (when parsed separately from closing tag)
  const openTag = new RegExp(`<${wrapper}(?!-)\\b[^>]*>`, 'gi')
  return result.replace(openTag, tagMatch => replaceSrcInTag(tagMatch))
}

export function demoMarkdownPlugin(
  md: MarkdownIt,
  config: { root?: string } & DemoMarkdownPluginOptions = {},
) {
  const wrapper = config.wrapper ?? 'demo'
  const headerMode = config.headerMode ?? 'examples'
  const skipDebugDemo = config.debugDemo ?? true
  // 保存原始 render 函数
  const originalRender = md.renderer.render.bind(md.renderer)

  md.renderer.render = function render(tokens, options, env: MarkdownItEnv) {
    const root = config.root ?? process.cwd()
    const currentId = env.id || ''
    const headers = env.headers

    // 'examples' 模式：所有 demo 统一挂到 slug 为 examples 的标题下
    const fixedHeader = headerMode === 'examples'
      ? headers?.find(item => item.slug === 'examples')
      : undefined

    const headerMap = flattenHeaders(headers)
    const orderedHeaders = flattenHeadersInOrder(headers)
    const headerIndexBySlug = new Map(
      orderedHeaders.map((item, index) => [item.slug, index]),
    )
    const activeHeaders = new Map<number, MarkdownItHeader>()
    let headerCursor = 0

    function getCurrentHeader() {
      const levels = Array.from(activeHeaders.keys()).sort(
        (left, right) => right - left,
      )
      const nearestLevel = levels[0]
      return nearestLevel ? activeHeaders.get(nearestLevel) : undefined
    }

    function resolveHeading(
      headingLevel: number,
      headingSlug?: string,
      headingTitle?: string,
    ) {
      if (headingSlug) {
        const bySlug = headerMap.get(headingSlug)
        if (bySlug) {
          const index = headerIndexBySlug.get(headingSlug)
          if (typeof index === 'number')
            headerCursor = Math.max(headerCursor, index + 1)
          return bySlug
        }
      }

      for (let index = headerCursor; index < orderedHeaders.length; index += 1) {
        const header = orderedHeaders[index]!
        if (header.level !== headingLevel)
          continue
        if (headingTitle && header.title !== headingTitle)
          continue

        headerCursor = index + 1
        return header
      }

      return undefined
    }

    function processToken(token: {
      type?: string
      tag?: string
      attrs?: [string, string][] | null
      content?: string
      children?: unknown[] | null
    }) {
      const tokenType = token.type ?? ''
      const tokenContent = token.content ?? ''

      if (
        (tokenType === 'html_block'
          || tokenType === 'html_inline'
          || tokenType === 'inline')
        && checkWrapper(tokenContent, wrapper)
      ) {
        token.content = replaceSrcPath(
          tokenContent,
          currentId,
          root,
          wrapper,
          headerMode === 'examples' ? fixedHeader : getCurrentHeader(),
          skipDebugDemo,
        )
      }

      if (token.children) {
        for (const child of token.children as (typeof token)[]) {
          processToken(child)
        }
      }
    }

    const typedTokens = tokens as typeof tokens & Array<{
      type: string
      tag?: string
      attrs?: [string, string][] | null
      content?: string
      children?: unknown[] | null
    }>

    typedTokens.forEach((token, index) => {
      if (token.type === 'heading_open') {
        const headingLevel = getHeadingLevel(token)
        if (headingLevel) {
          for (const level of activeHeaders.keys()) {
            if (level >= headingLevel)
              activeHeaders.delete(level)
          }

          const headingSlug = getHeadingSlug(token)
          const headingTitle = getHeadingTitle(typedTokens[index + 1])
          const header = resolveHeading(
            headingLevel,
            headingSlug,
            headingTitle,
          )
          if (header)
            activeHeaders.set(headingLevel, header)
        }
      }

      processToken(token)
    })

    return originalRender(tokens, options, env)
  }
}
