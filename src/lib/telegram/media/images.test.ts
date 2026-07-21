import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { getImages } from './images'

interface Photo {
  url: string
  width: number
  height: number
}

function buildMessage(photos: Photo[]): string {
  const wraps = photos
    .map(
      p =>
        `<div class="tgme_widget_message_photo_wrap" style="background-image:url('${p.url}'); width:${p.width}px; height:${p.height}px;"></div>`,
    )
    .join('')
  return `<div class="tgme_widget_message">${wraps}</div>`
}

function loadImages(
  photos: Photo[],
  options: { id?: string, staticProxy?: string, index?: number, title?: string } = {},
): string {
  const $ = load(buildMessage(photos))
  const message = $('.tgme_widget_message')
  return getImages($, message, {
    staticProxy: options.staticProxy ?? '',
    id: options.id ?? 'post-1',
    index: options.index ?? 0,
    title: options.title ?? '',
  })
}

const PHOTOS: Photo[] = [
  { url: 'https://cdn-telegram.org/a.jpg', width: 400, height: 300 },
  { url: 'https://cdn-telegram.org/b.jpg', width: 600, height: 800 },
  { url: 'https://cdn-telegram.org/c.jpg', width: 800, height: 600 },
]

describe('getImages', () => {
  it('returns empty string when there are no images', () => {
    const $ = load('<div class="tgme_widget_message"></div>')
    const message = $('.tgme_widget_message')
    expect(getImages($, message, { staticProxy: '', id: 'p1', index: 0, title: '' })).toBe('')
  })

  it('emits one thumbnail + one popover per image', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    expect($('.image-preview-button').length).toBe(3)
    expect($('.modal').length).toBe(3)
  })

  it('links each thumbnail to its modal via popovertarget', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    expect($('[popovertarget="modal-p1-0"]').length).toBeGreaterThan(0)
    expect($('[popovertarget="modal-p1-1"]').length).toBeGreaterThan(0)
    expect($('[popovertarget="modal-p1-2"]').length).toBeGreaterThan(0)
    expect($('#modal-p1-0').length).toBe(1)
    expect($('#modal-p1-1').length).toBe(1)
    expect($('#modal-p1-2').length).toBe(1)
  })

  it('each modal contains a rotated scroll-snap list starting at the clicked image', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // Clicked thumb 1 (b.jpg) → list should be [b, c, a]
    const srcs = $('#modal-p1-1 .modal-img')
      .toArray()
      .map(el => $(el).attr('src'))
    expect(srcs).toEqual([
      'https://cdn-telegram.org/b.jpg',
      'https://cdn-telegram.org/c.jpg',
      'https://cdn-telegram.org/a.jpg',
    ])
  })

  it('first image in each rotated list loads eagerly, rest lazy', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    const imgs = $('#modal-p1-0 .modal-img').toArray()
    expect(imgs.length).toBe(3)
    expect($(imgs[0]!).attr('loading')).toBe('eager')
    expect($(imgs[1]!).attr('loading')).toBe('lazy')
    expect($(imgs[2]!).attr('loading')).toBe('lazy')
  })

  it('does not emit any open-original link (removed per UX decision)', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    expect($('.modal__original').length).toBe(0)
  })

  it('renders prev/next nav arrows on every item in multi-image posts', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // 3 popovers × 3 items each = 9 items, each should have prev+next nav
    expect($('.modal__item').length).toBe(9)
    expect($('.modal__nav--prev').length).toBe(9)
    expect($('.modal__nav--next').length).toBe(9)
  })

  it('marks the first image\'s prev and last image\'s next as disabled (non-circular)', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // In popover 0, the item with realImgIndex=0 (id ends with item-0) should
    // have its prev arrow disabled, and item-2's next arrow should be disabled.
    const firstItem = $('#modal-p1-0-item-0')
    const lastItem = $('#modal-p1-0-item-2')
    expect(firstItem.find('.modal__nav--prev.modal__nav--disabled').length).toBe(1)
    expect(firstItem.find('.modal__nav--prev').not('.modal__nav--disabled').length).toBe(0)
    expect(lastItem.find('.modal__nav--next.modal__nav--disabled').length).toBe(1)
    expect(lastItem.find('.modal__nav--next').not('.modal__nav--disabled').length).toBe(0)

    // Middle item (item-1) should have both arrows enabled
    const middleItem = $('#modal-p1-0-item-1')
    expect(middleItem.find('.modal__nav--disabled').length).toBe(0)
    expect(middleItem.find('.modal__nav--prev[href]').length).toBe(1)
    expect(middleItem.find('.modal__nav--next[href]').length).toBe(1)
  })

  it('prev/next hrefs target the correct adjacent image within the same popover', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // In popover 0, item-1's prev → #modal-p1-0-item-0, next → #modal-p1-0-item-2
    const item1 = $('#modal-p1-0-item-1')
    expect(item1.find('.modal__nav--prev').attr('href')).toBe('#modal-p1-0-item-0')
    expect(item1.find('.modal__nav--next').attr('href')).toBe('#modal-p1-0-item-2')
  })

  it('disabled nav arrows have no href (so they are not focusable as links)', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    const disabled = $('.modal__nav--disabled').toArray()
    expect(disabled.length).toBeGreaterThan(0)
    for (const el of disabled) {
      expect($(el).attr('href')).toBeUndefined()
    }
  })

  it('omits nav arrows entirely for single-image posts', () => {
    const html = loadImages([PHOTOS[0]!], { id: 'p1' })
    const $ = load(html)
    expect($('.modal__nav').length).toBe(0)
    expect($('.modal__item').length).toBe(1)
  })

  it('each modal item has a stable unique id for anchor navigation', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    const ids = $('.modal__item')
      .toArray()
      .map(el => $(el).attr('id'))
      .sort()
    // 9 items total, all unique
    expect(new Set(ids).size).toBe(9)
    // All match the expected pattern
    for (const id of ids) {
      expect(id).toMatch(/^modal-p1-[0-2]-item-[0-2]$/)
    }
  })

  it('counter lives inside each item and reflects the real image index (updates on scroll)', () => {
    // Single-image post: no counter at all
    const single = loadImages([PHOTOS[0]!], { id: 'p1' })
    const $single = load(single)
    expect($single('.modal__counter').length).toBe(0)

    // Multi-image post: one counter per item, text follows the real image index
    // (not the rotated list position) so it changes as the user scrolls.
    const multi = loadImages(PHOTOS, { id: 'p2' })
    const $multi = load(multi)
    // 3 popovers × 3 items each = 9 counters total
    expect($multi('.modal__counter').length).toBe(9)

    // Popover 0: rotated = [img0, img1, img2] → realIdx 0,1,2 → "1/3","2/3","3/3"
    const popover0Counters = $multi('#modal-p2-0 .modal__counter')
      .toArray()
      .map(el => $multi(el).text())
    expect(popover0Counters).toEqual(['1 / 3', '2 / 3', '3 / 3'])

    // Popover 1: rotated = [img1, img2, img0] → realIdx 1,2,0 → "2/3","3/3","1/3"
    const popover1Counters = $multi('#modal-p2-1 .modal__counter')
      .toArray()
      .map(el => $multi(el).text())
    expect(popover1Counters).toEqual(['2 / 3', '3 / 3', '1 / 3'])

    // Popover 2: rotated = [img2, img0, img1] → realIdx 2,0,1 → "3/3","1/3","2/3"
    const popover2Counters = $multi('#modal-p2-2 .modal__counter')
      .toArray()
      .map(el => $multi(el).text())
    expect(popover2Counters).toEqual(['3 / 3', '1 / 3', '2 / 3'])
  })

  it('counter, prev, next, close share one item; prev/next are siblings of toolbar (industry-standard layout)', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // Every item has exactly one toolbar (counter + close) + prev + next.
    // Prev/next are siblings of the toolbar, not inside it — they pin to the
    // left/right vertical midpoint (industry-standard lightbox layout).
    const items = $('.modal__item').toArray()
    expect(items.length).toBe(9)
    for (const item of items) {
      const toolbar = $(item).find('.modal__toolbar')
      expect(toolbar.length).toBe(1)
      // Toolbar contains only counter + close
      expect($(item).find('.modal__toolbar > .modal__counter').length).toBe(1)
      expect($(item).find('.modal__toolbar > .modal__close').length).toBe(1)
      // Nav arrows are direct children of the item, NOT inside the toolbar
      expect(toolbar.find('.modal__nav').length).toBe(0)
      expect($(item).children('.modal__nav--prev').length).toBe(1)
      expect($(item).children('.modal__nav--next').length).toBe(1)
      // Image present
      expect($(item).find('img.modal-img').length).toBe(1)
    }
  })

  it('close button is no longer at popover top level (moved into each item)', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // Popover itself should only contain backdrop + surface (no direct close)
    const popover = $('#modal-p1-0')
    expect(popover.children('.modal__backdrop').length).toBe(1)
    expect(popover.children('.modal__surface').length).toBe(1)
    expect(popover.children('.modal__close').length).toBe(0)
    expect(popover.children('.modal__counter').length).toBe(0)
  })

  it('each item\'s close button targets its parent popover', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    // All 9 close buttons (3 popovers × 3 items) target their parent popover id
    const close0 = $('#modal-p1-0 .modal__close')
    expect(close0.length).toBe(3)
    for (const btn of close0.toArray()) {
      expect($(btn).attr('popovertarget')).toBe('modal-p1-0')
      expect($(btn).attr('popovertargetaction')).toBe('hide')
    }
  })

  it('preserves popover=auto and role=dialog on each modal', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    const $ = load(html)
    const modals = $('.modal').toArray()
    expect(modals.length).toBe(3)
    for (const modal of modals) {
      expect($(modal).attr('popover')).toBe('auto')
      expect($(modal).attr('role')).toBe('dialog')
    }
  })

  it('proxies image URLs when staticProxy is set', () => {
    const html = loadImages(PHOTOS, { id: 'p1', staticProxy: '/static/' })
    expect(html).toContain('/static/https://cdn-telegram.org/a.jpg')
    expect(html).toContain('/static/https://cdn-telegram.org/b.jpg')
    expect(html).toContain('/static/https://cdn-telegram.org/c.jpg')
  })

  it('emits count-based layout class on the container', () => {
    const html = loadImages(PHOTOS, { id: 'p1' })
    expect(html).toContain('image-list-container')
    expect(html).toContain('image-count-3')
    // 3 images, mixed aspect (1 portrait, 2 landscape) → grid-3-equal
    expect(html).toContain('grid-3-equal')
  })
})
