import type { CheerioAPI } from 'cheerio'
import type { IndexedStaticProxyOptions, MessageSelection } from '../types'
import { getOgMetadata, isOgPreviewEnabled, prefetchOgMetadata } from '../../og-preview'
import { escapeHtmlAttribute, getProxiedUrl, normalizeUrlAttribute } from '../url'
import { getImageLoading, STYLE_URL_REGEX } from './utils'

function renderOgLinkCard(
  href: string,
  title: string,
  description: string,
  image: string,
  siteName: string,
): string {
  const safeHref = escapeHtmlAttribute(href)
  const safeTitle = escapeHtmlAttribute(title || siteName || 'Link preview')
  const safeDescription = description ? escapeHtmlAttribute(description) : ''
  const safeSiteName = siteName ? escapeHtmlAttribute(siteName) : ''
  const safeImage = image ? escapeHtmlAttribute(image) : ''

  const imageHtml = safeImage
    ? `<div class="og-card-thumb-wrap"><img class="link_preview_image og-card-thumb" src="${safeImage}" width="120" height="120" alt="${safeTitle}" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></div>`
    : ''

  const siteNameHtml = safeSiteName
    ? `<span class="og-card-site">${safeSiteName}</span>`
    : ''

  const titleHtml = title
    ? `<span class="og-card-title">${escapeHtmlAttribute(title)}</span>`
    : ''

  const descriptionHtml = safeDescription
    ? `<span class="og-card-description">${safeDescription}</span>`
    : ''

  const textBlock = `<div class="og-card-text">${siteNameHtml}${titleHtml}${descriptionHtml}</div>`

  return `<a class="tgme_widget_message_link_preview og-link-card" href="${safeHref}" target="_blank" rel="noopener" title="${safeDescription || safeTitle}">
${imageHtml}
${textBlock}
</a>`
}

export function getLinkPreview($: CheerioAPI, message: MessageSelection, options: IndexedStaticProxyOptions): string {
  const { staticProxy = '', index = 0 } = options
  const link = message.find('.tgme_widget_message_link_preview')
  const href = link.attr('href')
  const title = message.find('.link_preview_title').text() || message.find('.link_preview_site_name').text()
  const description = message.find('.link_preview_description').text()
  const loading = getImageLoading(index)
  const safeTitle = escapeHtmlAttribute(title || 'Link preview image')

  if (href) {
    link.attr('href', normalizeUrlAttribute(href))
  }

  link.attr('target', '_blank').attr('rel', 'noopener').attr('title', description)

  const normalizedHref = href ? normalizeUrlAttribute(href) : ''

  if (normalizedHref && isOgPreviewEnabled()) {
    const ogData = getOgMetadata(normalizedHref)

    if (ogData) {
      return renderOgLinkCard(
        normalizedHref,
        ogData.title || title,
        ogData.description || description,
        ogData.image,
        ogData.siteName || title,
      )
    }

    prefetchOgMetadata(normalizedHref)
  }

  const image = message.find('.link_preview_image')
  const previewUrl = image.attr('style')?.match(STYLE_URL_REGEX)?.[1]
  const imageSrc = previewUrl ? getProxiedUrl(staticProxy, previewUrl) : ''

  image.replaceWith(
    `<img class="link_preview_image" alt="${safeTitle}" src="${imageSrc}" width="1200" height="630" loading="${loading}" decoding="async" />`,
  )

  return $.html(link)
}
