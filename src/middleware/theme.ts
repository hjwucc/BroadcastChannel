import { defineMiddleware } from 'astro:middleware'
import { ThemeManager } from '../lib/theme-manager'
import type { ThemeContext } from '../types/theme'

export const themeMiddleware = defineMiddleware(async (context, next) => {
  console.log('🎨 主题中间件开始执行')
  console.log('🔍 环境变量检查:', {
    THEME_NAME: process.env.THEME_NAME,
    THEME_FALLBACK: process.env.THEME_FALLBACK,
    THEME_DEBUG: process.env.THEME_DEBUG
  })
  
  const themeManager = ThemeManager.getInstance()
  const themeName = process.env.THEME_NAME || 'default'
  const fallbackTheme = process.env.THEME_FALLBACK || 'default'
  
  console.log(`🎯 尝试加载主题: ${themeName}`)

  try {
    // 尝试加载指定主题
    const themeConfig = await themeManager.loadTheme(themeName)
    
    // 将主题信息添加到上下文
    const themeContext: ThemeContext = {
      theme: themeConfig,
      themeName
    }
    
    context.locals.themeContext = themeContext
    
    // 继续处理请求
    const response = await next()
    
    // 设置响应头，用于客户端主题识别
    response.headers.set('X-Theme-Name', themeName)
    response.headers.set('X-Theme-Version', themeConfig.version)
    
    return response
    
  } catch (error) {
    console.warn(`主题 ${themeName} 加载失败，回退到 ${fallbackTheme}:`, error)
    
    try {
      // 回退到默认主题
      const fallbackConfig = await themeManager.loadTheme(fallbackTheme)
      
      const themeContext: ThemeContext = {
        theme: fallbackConfig,
        themeName: fallbackTheme
      }
      
      context.locals.themeContext = themeContext
      
      // 继续处理请求
      const response = await next()
      
      response.headers.set('X-Theme-Name', fallbackTheme)
      response.headers.set('X-Theme-Version', fallbackConfig.version)
      response.headers.set('X-Theme-Fallback', 'true')
      
      return response
      
    } catch (fallbackError) {
      console.error('回退主题也加载失败:', fallbackError)
      throw new Error('无法加载任何主题，请检查主题配置')
    }
  }
})