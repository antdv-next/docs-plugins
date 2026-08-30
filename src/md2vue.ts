import type { MarkdownItEnv } from '@mdit-vue/types'
import type { PluginOption } from 'vite'
import type { CreateMarkdownOptions } from './markdown'
import { LRUCache } from 'lru-cache'
import { findStaticImports } from 'mlly'
import pathe from 'pathe'
import { useMarkdown } from './markdown'
import { SCRIPT_REGEX, STYLE_REGEX } from './shared'
import { shortHash } from './utils/short-hash'

export function formatPageData(env: MarkdownItEnv) {
  const pageData = {
    title: env.title ?? '',
    frontmatter: env.frontmatter ?? {},
    headers: env.headers ?? [],
    description: '',
  }

  if (typeof env.frontmatter?.description === 'string')
    pageData.description = env.frontmatter.description

  if (typeof env.frontmatter?.title === 'string' && !env.title)
    pageData.title = env.frontmatter.title

  return pageData
}

export function checkPkgImport(findCode: string, pkg: string, importName: string) {
  if (!findCode)
    return false
  const imports = findStaticImports(findCode)
  return imports.some(
    item => item.specifier === pkg && item.imports.includes(importName),
  )
}

export function addScriptSetup(scriptTags: RegExpMatchArray | null, env: MarkdownItEnv) {
  const pageData = formatPageData(env)
  const baseCode = `const __pageData = ${JSON.stringify(pageData)};\nconst frontmatter = ${JSON.stringify(env.frontmatter ?? {})};\n`
  const importsCode = `import { inject, provide, ref } from 'vue';\n`
  const injectedCode = `const __parentPageData = ref({});provide('__pageData__',(data)=>{__parentPageData.value=data});const __pageDataFunc__ = inject('__pageData__',null);if(__pageDataFunc__)__pageDataFunc__(__pageData);provide('__pageInfo__',__pageData);defineExpose({frontmatter,pageData:__pageData})`

  if (!scriptTags || !scriptTags.length) {
    return `<script setup lang="ts">\n${importsCode}${baseCode}${injectedCode}\n</script>\n`
  }
  const scriptSetupCode = scriptTags.find((v) => {
    // 只要是单行的script标签，中包含<script setup>的标签
    return /<script\b[^>]+\bsetup\b[^>]*>/i.test(v)
  })
  if (!scriptSetupCode) {
    // 如果没有找到script setup标签，则直接返回
    return `<script setup lang="ts">\n${importsCode}${baseCode}${injectedCode}\n</script>\n${scriptTags.join('\n')}\n`
  }
  // 剩余的script代码
  const restScriptTags = scriptTags.filter((v) => {
    return v !== scriptSetupCode
  })
  // 获取内部的代码
  const scriptContent = scriptSetupCode
    ? scriptSetupCode
        .replace(/<script\b[^>]+\bsetup\b[^>]*>/i, '')
        .replace(/<\/script>/i, '')
    : ''
  const importArr: string[] = []
  if (!checkPkgImport(scriptContent, 'vue', 'provide'))
    importArr.push('provide')
  if (!checkPkgImport(scriptContent, 'vue', 'inject'))
    importArr.push('inject')
  if (!checkPkgImport(scriptContent, 'vue', 'ref'))
    importArr.push('ref')
  const _importsCode = importArr.length
    ? `import { ${importArr.join(', ')} } from 'vue';\n`
    : ''
  return `<script setup lang="ts">\n${_importsCode}${scriptContent}${baseCode}${injectedCode}\n</script>\n${restScriptTags.join('\n')}\n`
}

export function md2Vue(code: string, env: MarkdownItEnv) {
  // 先处理代码块，转义其中可能影响 Vue 模板解析的特殊字符
  code = code.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (match) => {
    // 转义 { } 避免被 Vue 模板引擎误解析
    return match
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;')
  })

  const scriptTags = code.match(SCRIPT_REGEX)
  const styleTags = code.match(STYLE_REGEX)
  // Remove script and style tags from the original code
  const templateCode = code.replace(SCRIPT_REGEX, '').replace(STYLE_REGEX, '')
  // Create a Vue component string
  const vueComponent = `<template>\n<div class="ant-doc vp-doc">${templateCode}</div>\n</template>\n`
  const scriptContent = addScriptSetup(scriptTags, env)
  const styleContent = styleTags ? styleTags.join('\n') : ''
  return `${scriptContent}\n${vueComponent}\n${styleContent}`
}

export function md2VuePlugin(options: CreateMarkdownOptions = {}): PluginOption {
  let md: ReturnType<typeof useMarkdown>
  const cache = new LRUCache<string, { hash: string, code: string }>({
    max: 500,
    ttl: 1000 * 60 * 10,
    allowStale: true,
    updateAgeOnGet: true,
  })

  async function transform(code: string, id: string) {
    const hash = shortHash(code)
    const cached = cache.get(id)
    if (cached && cached.hash === hash) {
      return cached.code
    }
    const env: MarkdownItEnv = {
      id,
    }
    const html = await md.renderAsync(code, env)
    const vueCode = md2Vue(html, env)
    cache.set(id, { hash, code: vueCode })
    return vueCode
  }

  function shouldSkipTransform(id: string) {
    if (id.includes('?vue'))
      return true

    const query = id.split('?')[1]
    if (!query)
      return false
    const params = new URLSearchParams(query)
    return params.has('raw') || params.has('url')
  }

  return {
    enforce: 'pre',
    name: 'vite:md2vue',
    configResolved(config) {
      md = useMarkdown({
        root: pathe.resolve(config.root ?? process.cwd(), '.'),
        ...options,
      })
    },
    transform: {
      filter: {
        id: /\.md($|\?)/,
      },
      async handler(code, id) {
        if (shouldSkipTransform(id))
          return null
        return transform(code, id)
      },
    },
    handleHotUpdate(ctx) {
      const { file, read } = ctx
      if (!file.endsWith('.md'))
        return

      const defaultRead = read
      ctx.read = async () => {
        const code = await defaultRead()
        return transform(code, file)
      }
    },
  }
}
