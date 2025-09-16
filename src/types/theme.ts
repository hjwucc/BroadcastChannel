export interface ThemeConfig {
  name: string
  displayName: string
  description?: string
  version: string
  author?: string
  homepage?: string
  license?: string
  keywords?: string[]
  variables: Record<string, string>
  styles?: Record<string, string>
  assets?: {
    icons?: string[]
    fonts?: string[]
    images?: string[]
  }
  compatibility?: {
    minVersion?: string
    maxVersion?: string
  }
  features?: {
    darkMode?: boolean
    animations?: boolean
    customFonts?: boolean
  }
}

export interface ThemeRegistry {
  themes: Array<{
    name: string
    path: string
    enabled: boolean
  }>
  defaultTheme: string
}

export interface ThemeContext {
  theme: ThemeConfig
  themeName: string
}

// 扩展Astro的locals类型
declare global {
  namespace App {
    interface Locals {
      themeContext?: ThemeContext
    }
  }
}