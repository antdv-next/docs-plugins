import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  unbundle: true,
  format: 'esm',
  platform: 'node',
  deps: {
    neverBundle: true,
  },
  outExtensions() {
    return {
      js: '.js',
      dts: '.d.ts',
    }
  },
})
