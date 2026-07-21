import type { CheerioAPI } from 'cheerio'
import type { IndexedStaticProxyOptions, MessageSelection, StaticProxyOptions } from '../types'
import { getProxiedUrl } from '../url'
import { STYLE_URL_REGEX } from './utils'

export function getVideo($: CheerioAPI, message: MessageSelection, options: IndexedStaticProxyOptions): string {
  const { staticProxy = '' } = options
  const video = message.find('.tgme_widget_message_video_wrap video')
  const videoSrc = video.attr('src')

  if (videoSrc) {
    video.attr('src', getProxiedUrl(staticProxy, videoSrc))
  }

  const videoWrap = message.find('.tgme_widget_message_video_wrap')
  const posterBg = videoWrap.attr('style')?.match(STYLE_URL_REGEX)?.[1]
  if (posterBg) {
    video.attr('poster', getProxiedUrl(staticProxy, posterBg))
  }

  video
    .attr('controls', '')
    .attr('preload', 'metadata')
    .attr('playsinline', '')
    .attr('webkit-playsinline', '')

  const roundVideo = message.find('.tgme_widget_message_roundvideo_wrap video')
  const roundVideoSrc = roundVideo.attr('src')

  if (roundVideoSrc) {
    roundVideo.attr('src', getProxiedUrl(staticProxy, roundVideoSrc))
  }

  const roundVideoWrap = message.find('.tgme_widget_message_roundvideo_wrap')
  const roundPosterBg = roundVideoWrap.attr('style')?.match(STYLE_URL_REGEX)?.[1]
  if (roundPosterBg) {
    roundVideo.attr('poster', getProxiedUrl(staticProxy, roundPosterBg))
  }

  roundVideo
    .attr('controls', '')
    .attr('preload', 'metadata')
    .attr('playsinline', '')
    .attr('webkit-playsinline', '')

  return $.html(video) + $.html(roundVideo)
}

export function getAudio($: CheerioAPI, message: MessageSelection, options: StaticProxyOptions): string {
  const { staticProxy = '' } = options
  const audio = message.find('.tgme_widget_message_voice')
  const audioSrc = audio.attr('src')

  if (audioSrc) {
    audio.attr('src', getProxiedUrl(staticProxy, audioSrc))
  }

  audio.attr('controls', '')
  return $.html(audio)
}
