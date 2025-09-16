import fs from 'fs/promises'
import path from 'path'
import type { ThemeConfig, ThemeRegistry } from '../types/theme'

export class ThemeManager {
  private static instance: ThemeManager
  private themesPath: string
  private registry: ThemeRegistry | null = null
  private cache: Map<string, ThemeConfig> = new Map()
  private debug: boolean

  constructor() {
    this.themesPath = path.join(process.cwd(), 'theme')
    this.debug = process.env.THEME_DEBUG === 'true' || true // 临时启用调试模式
  }

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager()
    }
    return ThemeManager.instance
  }

  /**
   * 加载主题注册表
   */
  async loadRegistry(): Promise<ThemeRegistry> {
    if (!this.registry) {
      try {
        const registryPath = path.join(this.themesPath, 'theme-registry.json')
        const registryContent = await fs.readFile(registryPath, 'utf-8')
        const rawRegistry = JSON.parse(registryContent)
        
        // 转换新格式的注册表为ThemeManager期望的格式
        if (rawRegistry.themes && typeof rawRegistry.themes === 'object') {
          // 新格式：themes是对象
          this.registry = {
            themes: Object.keys(rawRegistry.themes).map(key => ({
              name: key,
              path: key, // 使用主题名作为路径
              enabled: rawRegistry.themes[key].status !== 'disabled'
            })),
            defaultTheme: rawRegistry.defaultTheme || 'default'
          }
        } else {
          // 旧格式：themes是数组
          this.registry = rawRegistry
        }
        
        this.log('主题注册表加载成功')
      } catch (error) {
        this.log('主题注册表加载失败，使用默认配置', error)
        this.registry = {
          themes: [
            { name: 'default', path: 'default', enabled: true },
            { name: 'ios', path: 'ios', enabled: true }
          ],
          defaultTheme: 'default'
        }
      }
    }
    return this.registry
  }

  /**
   * 加载指定主题
   */
  async loadTheme(themeName: string): Promise<ThemeConfig> {
    // 检查缓存
    if (process.env.THEME_CACHE_ENABLED === 'true' && this.cache.has(themeName)) {
      this.log(`从缓存加载主题: ${themeName}`)
      return this.cache.get(themeName)!
    }

    try {
      const registry = await this.loadRegistry()
      const themeInfo = registry.themes.find(t => t.name === themeName)

      if (!themeInfo || !themeInfo.enabled) {
        throw new Error(`主题 ${themeName} 不存在或已禁用`)
      }

      // 修正路径构建逻辑，直接使用主题名作为子目录
      const themePath = path.join(this.themesPath, themeInfo.path, 'theme.json')
      this.log(`尝试加载主题文件: ${themePath}`)
      
      const themeContent = await fs.readFile(themePath, 'utf-8')
      const themeConfig: ThemeConfig = JSON.parse(themeContent)

      // 验证主题配置
      this.validateThemeConfig(themeConfig)

      // 加载CSS变量
      await this.loadThemeStyles(themeConfig, themeInfo.path)

      // 缓存主题配置
      if (process.env.THEME_CACHE_ENABLED === 'true') {
        this.cache.set(themeName, themeConfig)
      }

      this.log(`主题 ${themeName} 加载成功`)
      return themeConfig
    } catch (error) {
      this.log(`主题 ${themeName} 加载失败`, error)
      throw error
    }
  }

  /**
   * 加载主题样式文件
   */
  private async loadThemeStyles(themeConfig: ThemeConfig, themePath: string): Promise<void> {
    const styleFiles = ['variables.css', 'components.css', 'custom.css']
    
    for (const styleFile of styleFiles) {
      try {
        const stylePath = path.join(this.themesPath, themePath, styleFile)
        const styleContent = await fs.readFile(stylePath, 'utf-8')
        
        // 将样式内容添加到主题配置中
        if (!themeConfig.styles) {
          themeConfig.styles = {}
        }
        themeConfig.styles[styleFile] = styleContent
      } catch (error) {
        // 样式文件不存在是正常的，只有variables.css是必需的
        if (styleFile === 'variables.css') {
          throw new Error(`必需的样式文件 ${styleFile} 不存在`)
        }
      }
    }
  }

  /**
   * 验证主题配置
   */
  private validateThemeConfig(config: ThemeConfig): void {
    const requiredFields = ['name', 'displayName', 'version', 'variables']
    
    for (const field of requiredFields) {
      if (!config[field as keyof ThemeConfig]) {
        throw new Error(`主题配置缺少必需字段: ${field}`)
      }
    }

    // 验证必需的CSS变量
    const requiredVariables = [
      '--background-color',
      '--foreground-color',
      '--highlight-color',
      '--border-color',
      '--cell-background-color'
    ]

    for (const variable of requiredVariables) {
      if (!config.variables[variable]) {
        throw new Error(`主题配置缺少必需的CSS变量: ${variable}`)
      }
    }
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): string {
    return process.env.THEME_NAME || 'default'
  }

  /**
   * 获取可用主题列表
   */
  async getAvailableThemes(): Promise<string[]> {
    const registry = await this.loadRegistry()
    return registry.themes
      .filter(theme => theme.enabled)
      .map(theme => theme.name)
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
    this.log('主题缓存已清除')
  }

  /**
   * 调试日志
   */
  private log(message: string, error?: any): void {
    if (this.debug) {
      console.log(`[ThemeManager] ${message}`)
      if (error) {
        console.error(error)
      }
    }
  }
}