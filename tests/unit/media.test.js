import { beforeEach, describe, expect, it } from 'vitest'
import {
  audio_source_descriptor,
  audio_sources_descriptor,
  hls_source,
  hls_source_descriptor,
  thumbnails,
  video_source_descriptor
} from '@lib/media.js'

describe('media helpers', () => {
  beforeEach(() => {
    globalThis.Thumbnail = class {
      constructor(url, quality) {
        this.url = url
        this.quality = quality
      }
    }
    globalThis.Thumbnails = class {
      constructor(items) {
        this.items = items
      }
    }
    globalThis.AudioUrlSource = class {
      constructor(value) {
        Object.assign(this, value)
      }
    }
    globalThis.VideoUrlSource = class {
      constructor(value) {
        Object.assign(this, value)
      }
    }
    globalThis.HLSSource = class {
      constructor(value) {
        Object.assign(this, value)
      }
    }
    globalThis.UnMuxVideoSourceDescriptor = class {
      constructor(videoSources, audioSources) {
        this.videoSources = videoSources
        this.audioSources = audioSources
      }
    }
    globalThis.VideoSourceDescriptor = class {
      constructor(videoSources) {
        this.videoSources = videoSources
      }
    }
  })

  it('creates thumbnails and audio descriptors', () => {
    expect(thumbnails('https://example.test/icon.png').items[0].url).toBe('https://example.test/icon.png')

    const descriptor = audio_source_descriptor({ name: 'MP3', url: 'https://example.test/a.mp3', language: 'ar' })
    expect(descriptor.audioSources[0]).toMatchObject({
      name: 'MP3',
      container: 'audio/mpeg',
      codec: 'mp3',
      language: 'ar',
      url: 'https://example.test/a.mp3'
    })

    expect(
      audio_sources_descriptor([
        { name: 'Primary', url: 'https://example.test/primary.mp3' },
        { name: 'Fallback', url: 'https://example.test/fallback.mp3' }
      ]).audioSources.map((source) => source.url)
    ).toEqual(['https://example.test/primary.mp3', 'https://example.test/fallback.mp3'])
    expect(audio_source_descriptor({ name: 'MP3', url: 'https://example.test/a.mp3' }).audioSources[0].language).toBe('Unknown')
  })

  it('creates video and hls descriptors', () => {
    expect(video_source_descriptor({ name: 'MP4', url: 'https://example.test/v.mp4' }).videoSources[0]).toMatchObject({
      name: 'MP4',
      container: 'video/mp4',
      codec: 'h264'
    })

    const hls = hls_source({ name: 'Live', url: 'https://example.test/live.m3u8' })
    expect(hls_source_descriptor(hls).videoSources[0]).toBe(hls)
  })
})
