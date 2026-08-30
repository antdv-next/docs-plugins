export interface DemoLocale {
  html?: string
  title?: string
}

export interface DemoExtraFile {
  name: string
  lang: string
  code: string
}

export interface DemoSourceData {
  source: string
  jsSource: string
  extraFiles: DemoExtraFile[]
}

export interface DemoModule {
  component?: () => Promise<unknown>
  locales?: Record<string, DemoLocale>
  sourceVersion: number
  loadSource: (signal?: AbortSignal) => Promise<DemoSourceData>
}
