// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'app',
  typescript: true,
  markdown: false,
  pnpm: false,
  e18e: false,
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false,
  },
  rules: {
    'node/prefer-global/process': 0,
  },
})
