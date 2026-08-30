import * as Vue from 'vue'

let compilerSfc: typeof import('@vue/compiler-sfc') | null = null
let sucraseModule: typeof import('sucrase') | null = null

// 演示源码可 import 的模块由站点注入，逐模块容错：
// 某个模块不可用只影响其自身的编辑预览，不阻断整个编译链路
const resolvedExtraModules = new WeakMap<Record<string, () => Promise<any>>, Record<string, any>>()

async function ensureDependencies(extraModules: Record<string, () => Promise<any>>) {
  if (!compilerSfc) {
    compilerSfc = await import('@vue/compiler-sfc')
  }
  if (!sucraseModule) {
    sucraseModule = await import('sucrase')
  }
  if (!resolvedExtraModules.has(extraModules)) {
    const resolved: Record<string, any> = {}
    await Promise.all(
      Object.entries(extraModules).map(async ([name, loader]) => {
        try {
          const mod = await loader()
          // 保存模块命名空间:命名导入从空间上取(default 导入经 transformCode 的
          // `mod.default || mod` 兜底)。取 mod.default 会丢掉命名导出(如 icons 的
          // 836 个图标,其 default 只是单个图标组件)。
          resolved[name] = mod
        }
        catch {
          // 依赖不可用时跳过，保持 modulesMap 中无该条目
        }
      }),
    )
    resolvedExtraModules.set(extraModules, resolved)
  }
}

function buildModulesMap(extraModules: Record<string, () => Promise<any>>) {
  return {
    vue: Vue,
    ...resolvedExtraModules.get(extraModules),
  }
}

/**
 * 从模块命名空间收集组件,建立 名称/kebab/camel 三种索引。
 * 模板里 `<a-avatar>` / `<ax-bubble>` 经编译为 _resolveComponent("a-avatar"),
 * 运行时解析需要站点全局注册;这里在编译期直接映射到模块里的 AAvatar/AxBubble,
 * 使在线编辑不依赖站点全量注册(保留按需引入与摇树)。
 */
function buildComponentsMap(modulesMap: Record<string, any>): Record<string, unknown> {
  const comps: Record<string, unknown> = {}
  for (const mod of Object.values(modulesMap)) {
    if (!mod || typeof mod !== 'object')
      continue
    for (const value of Object.values(mod)) {
      if (!value || typeof value !== 'object' || !('name' in value))
        continue
      const name = value.name
      if (typeof name !== 'string' || !name)
        continue
      comps[name] = value
      // 与 vue 的 hyphenate 一致:AAvatar -> a-avatar,AxBubble -> ax-bubble
      const kebab = name.replace(/\B([A-Z])/g, '-$1').toLowerCase()
      comps[kebab] = value
      comps[kebab.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = value
    }
  }
  return comps
}

/** 把 _resolveComponent("name") 替换为组件映射查找,未命中时回退运行时解析 */
function injectComponentResolution(code: string): string {
  return code.replace(
    /_resolveComponent\(\s*(['"])([^'"]+)\1(?:,([^)]*))?\)/g,
    (_, quote: string, name: string, rest?: string) =>
      `(__componentsMap[${quote}${name}${quote}] || _resolveComponent(${quote}${name}${quote}${rest ? `,${rest}` : ''}))`,
  )
}

function transformCode(code: string): string {
  let result = code

  // Named imports: import { a, b as c } from 'module'
  // Need to convert 'as' to ':' for destructuring syntax
  result = result.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g,
    (_, names, source) => {
      const transformedNames = names.replace(/\bas\b/g, ':')
      return `const {${transformedNames}} = (__modules__["${source}"] || {});`
    },
  )

  // Default import: import Name from 'module'
  result = result.replace(
    /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]\s*;?/g,
    (_, name, source) => `const ${name} = (__modules__["${source}"] || {}).default || (__modules__["${source}"] || {});`,
  )

  // Namespace import: import * as Name from 'module'
  result = result.replace(
    /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]\s*;?/g,
    (_, name, source) => `const ${name} = (__modules__["${source}"] || {});`,
  )

  // Side-effect imports: import 'module'
  result = result.replace(/^\s*import\s*['"][^'"]+['"]\s*(?:;\s*)?$/gm, '')

  // export default → __exports__.default =
  result = result.replace(/export\s+default\s+/g, '__exports__.default = ')

  // export function name → function name + track for later export
  const exportedNames: string[] = []
  result = result.replace(/export\s+function\s+(\w+)/g, (_, name) => {
    exportedNames.push(name)
    return `function ${name}`
  })

  result = result.replace(/export\s+(const|let|var)\s+(\w+)/g, (_, keyword, name) => {
    exportedNames.push(name)
    return `${keyword} ${name}`
  })

  // Append exports for named declarations
  for (const name of exportedNames) {
    result += `\n__exports__["${name}"] = ${name};`
  }

  return result
}

export async function compileSfcSource(
  source: string,
  extraModules: Record<string, () => Promise<any>> = {},
): Promise<{ component: any, error: string | null }> {
  await ensureDependencies(extraModules)

  const modulesMap = buildModulesMap(extraModules)

  try {
    const { compileScript, compileTemplate, parse } = compilerSfc!
    const { transform } = sucraseModule!

    const id = `live-${Math.random().toString(36).slice(2, 8)}`
    const { descriptor, errors } = parse(source, { filename: 'Demo.vue' })

    if (errors.length > 0) {
      return { component: null, error: errors.map(e => e.message).join('\n') }
    }

    let jsCode: string

    if (descriptor.scriptSetup) {
      // <script setup> — use inlineTemplate to bake render into setup()
      const compiled = compileScript(descriptor, {
        id,
        inlineTemplate: true,
      })
      jsCode = compiled.content
    }
    else if (descriptor.script) {
      // Options API <script>
      const compiled = compileScript(descriptor, { id })
      jsCode = compiled.content

      if (descriptor.template) {
        const templateResult = compileTemplate({
          source: descriptor.template.content,
          filename: 'Demo.vue',
          id,
          compilerOptions: {
            bindingMetadata: compiled.bindings,
          },
        })
        if (templateResult.errors.length) {
          return {
            component: null,
            error: templateResult.errors
              .map(e => (typeof e === 'string' ? e : e.message))
              .join('\n'),
          }
        }
        jsCode += `\n${templateResult.code}`
      }
    }
    else if (descriptor.template) {
      // Template-only component
      const templateResult = compileTemplate({
        source: descriptor.template.content,
        filename: 'Demo.vue',
        id,
      })
      if (templateResult.errors.length) {
        return {
          component: null,
          error: templateResult.errors
            .map(e => (typeof e === 'string' ? e : e.message))
            .join('\n'),
        }
      }
      jsCode = templateResult.code
    }
    else {
      return { component: null, error: 'No template or script found' }
    }

    // Strip TypeScript type annotations
    try {
      const result = transform(jsCode, {
        transforms: ['typescript'],
        disableESTransforms: true,
      })
      jsCode = result.code
    }
    catch {
      // May already be plain JS — continue
    }

    // Transform imports / exports to work with new Function
    jsCode = transformCode(jsCode)

    // 编译期组件解析:模板中的 <a-*>/<ax-*> 映射到模块内的组件,不依赖站点全局注册
    const componentsMap = buildComponentsMap(modulesMap)
    jsCode = injectComponentResolution(jsCode)

    // Evaluate the compiled code
    const __exports__: Record<string, any> = {}
    // eslint-disable-next-line no-new-func
    const fn = new Function('__modules__', '__componentsMap', '__exports__', jsCode)
    fn(modulesMap, componentsMap, __exports__)

    // For options API + separate template, attach the render function
    if (!descriptor.scriptSetup && descriptor.script && descriptor.template) {
      const comp = __exports__.default || {}
      if (__exports__.render) {
        comp.render = __exports__.render
      }
      return { component: comp, error: null }
    }

    // For template-only, create component with render
    if (!descriptor.scriptSetup && !descriptor.script && descriptor.template) {
      return { component: { render: __exports__.render }, error: null }
    }

    return { component: __exports__.default, error: null }
  }
  catch (e: any) {
    return { component: null, error: e.message || String(e) }
  }
}
