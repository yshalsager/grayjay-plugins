import { beforeEach, describe, expect, it } from 'vitest'
import { content_thumbnails, plugin_asset, plugin_icon_url, static_thumbnails } from '@lib/assets.js'

describe('asset helpers', () => {
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
  })

  it('resolves config-relative assets and icons', () => {
    const config = {
      sourceUrl: 'https://example.test/plugins/source/Config.json',
      iconUrl: './Icon.png'
    }

    expect(plugin_asset(config, './Script.js')).toBe('https://example.test/plugins/source/Script.js')
    expect(plugin_asset(config, 'https://cdn.example.test/icon.png')).toBe('https://cdn.example.test/icon.png')
    expect(plugin_icon_url(config, './Default.png')).toBe('https://example.test/plugins/source/Icon.png')
  })

  it('creates static and content thumbnails', () => {
    const config = { absoluteIconUrl: 'https://example.test/icon.png' }
    expect(static_thumbnails(config, './Default.png').items[0].url).toBe('https://example.test/icon.png')
    expect(content_thumbnails(config, './Default.png', 'https://example.test/content.png').items[0].url).toBe(
      'https://example.test/content.png'
    )
  })
})
