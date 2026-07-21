import * as cheerio from 'cheerio'
import { $fetch } from 'ofetch'
import { getBooleanEnv } from './env'

export interface OgMetadata {
  title: string
  description: string
  image: string
  siteName: string
  favicon: string
  url: string
}

const OG_FETCH_TIMEOUT = 3000
const OG_MAX_RESPONSE_SIZE = 512 * 1024
const OG_CACHE_MAX_AGE = 60 * 60 * 24 * 1000

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]

const ogCache = new Map<string, { data: OgMetadata, expiresAt: number }>()
const pendingFetches = new Set<string>()

let activePrefetchCount = 0
const MAX_CONCURRENT_PREFETCH = 3

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (normalized === 'localhost') {
    return true
  }

  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(normalized))
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    if (isPrivateHostname(parsed.hostname)) {
      return false
    }
    return true
  }
  catch {
    return false
  }
}

function extractFaviconUrl($: cheerio.CheerioAPI, baseUrl: string): string {
  const iconLink = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first()
  const href = iconLink.attr('href')

  if (!href) {
    return ''
  }

  try {
    return new URL(href, baseUrl).href
  }
  catch {
    return ''
  }
}

async function fetchOgMetadata(url: string): Promise<OgMetadata | null> {
  if (!isAllowedUrl(url)) {
    return null
  }

  let html: string

  try {
    html = await $fetch<string, 'text'>(url, {
      responseType: 'text',
      timeout: OG_FETCH_TIMEOUT,
      retry: 0,
      headers: {
        'accept': 'text/html,application/xhtml+xml',
        'user-agent': 'BroadcastChannel/0.3.0 (OG Preview)',
      },
    })
  }
  catch {
    return null
  }

  if (html.length > OG_MAX_RESPONSE_SIZE) {
    html = html.slice(0, OG_MAX_RESPONSE_SIZE)
  }

  const $ = cheerio.load(html, {}, false)
  const getMeta = (selector: string): string => {
    return $(selector).attr('content')?.trim() ?? ''
  }

  const title = getMeta('meta[property="og:title"]')
    || getMeta('meta[name="og:title"]')
    || $('title').first().text().trim()
  const description = getMeta('meta[property="og:description"]')
    || getMeta('meta[name="og:description"]')
    || getMeta('meta[name="description"]')
  const image = getMeta('meta[property="og:image"]')
    || getMeta('meta[name="og:image"]')
    || getMeta('meta[name="twitter:image"]')
  const siteName = getMeta('meta[property="og:site_name"]')
    || getMeta('meta[name="og:site_name"]')

  if (!title && !description && !image) {
    return null
  }

  let resolvedImage = ''
  if (image) {
    try {
      resolvedImage = new URL(image, url).href
    }
    catch {
      resolvedImage = image
    }
  }

  const favicon = extractFaviconUrl($, url)

  return {
    title: title || siteName || '',
    description,
    image: resolvedImage,
    siteName,
    favicon,
    url,
  }
}

export function isOgPreviewEnabled(env: Record<string, string | undefined> = import.meta.env): boolean {
  const value = getBooleanEnv(env, 'OG_PREVIEW')
  return value ?? true
}

export function getOgMetadata(url: string): OgMetadata | null {
  if (!isAllowedUrl(url)) {
    return null
  }

  const cached = ogCache.get(url)
  if (!cached) {
    return null
  }

  if (Date.now() > cached.expiresAt) {
    ogCache.delete(url)
    return null
  }

  return cached.data
}

export function prefetchOgMetadata(
  url: string,
  runtimeContext?: { waitUntil?: (promise: Promise<unknown>) => void },
): void {
  if (!isAllowedUrl(url)) {
    return
  }

  const cached = ogCache.get(url)
  if (cached && Date.now() < cached.expiresAt) {
    return
  }

  if (pendingFetches.has(url)) {
    return
  }

  if (activePrefetchCount >= MAX_CONCURRENT_PREFETCH) {
    return
  }

  const task = (async () => {
    activePrefetchCount += 1
    pendingFetches.add(url)
    try {
      const data = await fetchOgMetadata(url)
      if (data) {
        ogCache.set(url, {
          data,
          expiresAt: Date.now() + OG_CACHE_MAX_AGE,
        })
      }
    }
    catch {
      // Silently ignore — next request will retry.
    }
    finally {
      pendingFetches.delete(url)
      activePrefetchCount -= 1
    }
  })()

  const waitUntil = runtimeContext?.waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil(task)
  }
  else {
    queueMicrotask(() => {
      void task.catch(() => {})
    })
  }
}
