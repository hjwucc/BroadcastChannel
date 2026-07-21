import type { CheerioAPI } from 'cheerio'
import type { MessageAssetOptions, MessageSelection } from '../types'
import { escapeHtmlAttribute, getProxiedUrl } from '../url'
import { getImageLoading, inferImageDimensions, STYLE_URL_REGEX } from './utils'

/** Detect if an image is landscape (width > height) based on inferred dimensions. */
function isLandscape(width: number, height: number): boolean {
  return width > height
}

/** Determine the optimal grid layout class based on image count and aspect ratios. */
function getGridLayoutClass(
  count: number,
  dimensions: Array<{ width: number, height: number }>,
): string {
  switch (count) {
    case 3: {
      // Smart layout: if 2+ images are landscape, use 3-column equal width.
      // Otherwise use 2-top + 1-bottom-centered (better for portraits/mixed).
      const landscapeCount = dimensions.filter(d => isLandscape(d.width, d.height)).length
      return landscapeCount >= 2 ? 'grid-3-equal' : 'grid-3-mixed'
    }
    case 5:
      return 'grid-5-mixed'
    case 7:
      return 'grid-7-mixed'
    default:
      // For 1,2,4,6,8,9 use standard CSS grid (equal columns)
      return ''
  }
}

interface ImageEntry {
  url: string
  proxiedUrl: string
  width: number
  height: number
}

/**
 * Build the modal body for a given thumbnail: a horizontal scroll-snap list of
 * all images in the post, rotated so the clicked image is first. This lets the
 * Popover API open at default scroll (top of list) while still showing image N
 * when thumbnail N is clicked — without `:target` or JS.
 *
 * Each item carries a stable id (`modal-{postId}-{photoIndex}-item-{imgIndex}`)
 * so anchor-based prev/next navigation can jump to a specific image inside the
 * same popover. Items are non-circular (first has no prev, last has no next),
 * matching Twitter/X behavior per ADR 0004.
 *
 * Each item also owns its own toolbar (counter + prev + next + close). Because
 * the toolbar travels with the item, the counter text updates naturally as the
 * user scrolls — no JS needed. Close is repeated per-item (DOM cost is bounded
 * by Telegram's 9-image cap) so the toolbar layout stays self-contained.
 *
 * See `docs/adr/0004-zero-js-image-lightbox.md`.
 */
function buildRotatedScrollList(
  images: ImageEntry[],
  startIndex: number,
  postId: string,
  photoIndex: number,
  safeTitle: string,
  safePrevLabel: string,
  safeNextLabel: string,
  safeCloseLabel: string,
): string {
  const count = images.length
  const rotated = [...images.slice(startIndex), ...images.slice(0, startIndex)]
  const popoverId = `modal-${postId}-${photoIndex}`
  const isSingle = count === 1

  return rotated.map((img, listIndex) => {
    // Real index of this image in the post (0..count-1), independent of rotation.
    // The counter displays this so it reflects the actual image being viewed,
    // not the rotated list position.
    const realImgIndex = (startIndex + listIndex) % count
    // First item is the clicked image — load eagerly so it shows instantly
    // (the browser already has it cached from the grid thumbnail).
    const loading = listIndex === 0 ? 'eager' : 'lazy'
    const itemId = `modal-${postId}-${photoIndex}-item-${realImgIndex}`
    const counterText = `${realImgIndex + 1} / ${count}`

    // Non-circular navigation: first image has no prev, last has no next.
    // Disabled state uses `<a>` without href so the browser does not treat it
    // as a link (no focus, no Enter activation) — matching native disabled UX.
    // The `<a>` is empty: the arrow icon is rendered via CSS background-image
    // (SVG data URI) so it optical-centers reliably across fonts. aria-label
    // provides the accessible name.
    const prevIndex = realImgIndex - 1
    const nextIndex = realImgIndex + 1
    const prevNav = prevIndex >= 0
      ? `<a class="modal__nav modal__nav--prev" href="#${`modal-${postId}-${photoIndex}-item-${prevIndex}`}" aria-label="${safePrevLabel}" title="${safePrevLabel}"></a>`
      : `<a class="modal__nav modal__nav--prev modal__nav--disabled" aria-hidden="true"></a>`
    const nextNav = nextIndex <= count - 1
      ? `<a class="modal__nav modal__nav--next" href="#${`modal-${postId}-${photoIndex}-item-${nextIndex}`}" aria-label="${safeNextLabel}" title="${safeNextLabel}"></a>`
      : `<a class="modal__nav modal__nav--next modal__nav--disabled" aria-hidden="true"></a>`

    // Hide counter + nav for single-image posts; they add nothing.
    // Close is always rendered so the user can always dismiss the popover.
    const counterHtml = isSingle ? '' : `<span class="modal__counter" aria-hidden="true">${counterText}</span>`
    const navHtml = isSingle ? '' : `${prevNav}${nextNav}`
    const closeHtml = `<button type="button" class="modal__close" popovertarget="${popoverId}" popovertargetaction="hide" aria-label="${safeCloseLabel}">&times;</button>`

    // Toolbar (counter + close) stays pinned to the top edge so it never
    // overlaps the image body. Prev/next are siblings of the toolbar, pinned
    // to the left/right vertical midpoint — industry-standard lightbox layout
    // (Twitter/X, Medium, Facebook all do this).
    return `
        <figure class="modal__item" id="${itemId}">
          <img class="modal-img" src="${img.proxiedUrl}" alt="${safeTitle}" width="${img.width}" height="${img.height}" loading="${loading}" decoding="async" />
          <div class="modal__toolbar">
            ${counterHtml}
            ${closeHtml}
          </div>
          ${navHtml}
        </figure>`
  }).join('')
}

export function getImages($: CheerioAPI, message: MessageSelection, options: MessageAssetOptions): string {
  const { staticProxy = '', id = '', index = 0, title = '' } = options
  const safeTitle = escapeHtmlAttribute(title || 'Image from post')
  const safePreviewLabel = escapeHtmlAttribute(title ? `Open image preview: ${title}` : 'Open image preview')
  const safeCloseLabel = 'Close image preview'
  const safePrevLabel = 'Previous image'
  const safeNextLabel = 'Next image'

  // Collect all images first so each thumbnail's modal can reference the full set
  const images: ImageEntry[] = []
  for (const photoNode of message.find('.tgme_widget_message_photo_wrap').toArray()) {
    const imageUrl = $(photoNode).attr('style')?.match(STYLE_URL_REGEX)?.[1]
    if (!imageUrl) {
      continue
    }

    const { width, height } = inferImageDimensions($, photoNode)
    images.push({ url: imageUrl, proxiedUrl: getProxiedUrl(staticProxy, imageUrl), width, height })
  }

  if (images.length === 0) {
    return ''
  }

  const count = images.length
  const dimensions = images.map(img => ({ width: img.width, height: img.height }))
  const countClass = `image-count-${Math.min(count, 9)}`
  const legacyLayoutClass = count % 2 === 0 ? 'image-list-even' : 'image-list-odd'
  const gridLayoutClass = getGridLayoutClass(count, dimensions)
  const layoutClass = gridLayoutClass ? `${legacyLayoutClass} ${gridLayoutClass}` : legacyLayoutClass

  // One thumbnail + one popover per image. Each popover contains a rotated
  // scroll-snap list of ALL images so click-thumb-N → see-image-N works
  // without JS. DOM cost is O(N²) but bounded by Telegram's 9-image cap.
  const fragments: string[] = []
  images.forEach((image, photoIndex) => {
    const thumbnailLoading = getImageLoading(index)
    const popoverId = `modal-${id}-${photoIndex}`
    const counterText = `${photoIndex + 1} / ${count}`
    const itemsHtml = buildRotatedScrollList(
      images,
      photoIndex,
      id,
      photoIndex,
      safeTitle,
      safePrevLabel,
      safeNextLabel,
      safeCloseLabel,
    )

    fragments.push(`
      <button
        type="button"
        class="image-preview-button image-preview-wrap"
        popovertarget="${popoverId}"
        popovertargetaction="show"
        aria-label="${safePreviewLabel}"
      >
        <img src="${image.proxiedUrl}" alt="${safeTitle}" width="${image.width}" height="${image.height}" loading="${thumbnailLoading}" decoding="async" />
      </button>
      <div class="modal" id="${popoverId}" popover="auto" role="dialog" aria-label="Image preview ${counterText}">
        <button
          type="button"
          class="modal__backdrop"
          popovertarget="${popoverId}"
          popovertargetaction="hide"
          aria-label="${safeCloseLabel}"
        ></button>
        <div class="modal__surface">${itemsHtml}</div>
      </div>
    `)
  })

  return `<div class="image-list-container ${layoutClass} ${countClass}">${fragments.join('')}</div>`
}
