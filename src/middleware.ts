/**
 * Astro 中间件入口文件
 * 统一管理所有中间件的注册和执行顺序
 */

import { defineMiddleware } from 'astro:middleware'
import { ThemeManager } from './lib/theme-manager'
import type { ThemeContext } from './types/theme'

/**
 * 主要中间件 - 处理主题和其他功能
 */
export const onRequest = defineMiddleware(async (context, next) => {
  console.log('🎨 主题中间件开始执行')
  console.log('🔍 环境变量检查:', {
    'process.env.THEME_NAME': process.env.THEME_NAME,
    'import.meta.env.THEME_NAME': import.meta.env.THEME_NAME,
    'process.env.THEME_FALLBACK': process.env.THEME_FALLBACK,
    'import.meta.env.THEME_FALLBACK': import.meta.env.THEME_FALLBACK,
    'process.env.THEME_DEBUG': process.env.THEME_DEBUG,
    'import.meta.env.THEME_DEBUG': import.meta.env.THEME_DEBUG
  })
  
  // 设置站点相关的上下文变量
  context.locals.SITE_URL = `${import.meta.env.SITE ?? ''}${import.meta.env.BASE_URL}`
  context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml`
  context.locals.RSS_PREFIX = ''

  // 处理搜索页面的RSS链接
  if (context.url.pathname.startsWith('/search') && context.params.q?.startsWith('#')) {
    const tag = context.params.q.replace('#', '')
    context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml?tag=${tag}`
    context.locals.RSS_PREFIX = `${tag} | `
  }
  
  // 主题处理逻辑 - 使用ThemeManager
  const themeManager = ThemeManager.getInstance()
  // 尝试从不同来源获取主题名称
  const themeName = import.meta.env.THEME_NAME || process.env.THEME_NAME || 'default'
  const fallbackTheme = import.meta.env.THEME_FALLBACK || process.env.THEME_FALLBACK || 'default'
  
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
    console.log('✅ 主题上下文已设置:', themeName)
    
    // 继续处理请求
    const response = await next()
    
    // 设置响应头，用于客户端主题识别
    response.headers.set('X-Theme-Name', themeName)
    response.headers.set('X-Theme-Version', themeConfig.version)
    
    // 设置缓存和其他响应头
    if (!response.bodyUsed) {
      if (response.headers.get('Content-type') === 'text/html') {
        response.headers.set('Speculation-Rules', '"/rules/prefetch.json"')
      }

      if (!response.headers.has('Cache-Control')) {
        response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300')
      }
    }
    
    console.log('🎨 主题中间件执行完成')
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
      console.log('✅ 回退主题上下文已设置:', fallbackTheme)
      
      // 继续处理请求
      const response = await next()
      
      response.headers.set('X-Theme-Name', fallbackTheme)
      response.headers.set('X-Theme-Version', fallbackConfig.version)
      response.headers.set('X-Theme-Fallback', 'true')
      
      // 设置缓存和其他响应头
      if (!response.bodyUsed) {
        if (response.headers.get('Content-type') === 'text/html') {
          response.headers.set('Speculation-Rules', '"/rules/prefetch.json"')
        }

        if (!response.headers.has('Cache-Control')) {
          response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300')
        }
      }
      
      console.log('🎨 主题中间件执行完成（使用回退主题）')
      return response
      
    } catch (fallbackError) {
      console.error('回退主题也加载失败:', fallbackError)
      throw new Error('无法加载任何主题，请检查主题配置')
    }
  }
})