import { beforeEach, describe, expect, it } from 'vitest'
import { grayjay_platform } from '@lib/grayjay.js'

describe('grayjay helpers', () => {
  beforeEach(() => {
    globalThis.PlatformID = class {
      constructor(platform, value, pluginId) {
        this.platform = platform
        this.value = value
        this.pluginId = pluginId
      }
    }
    globalThis.PlatformAuthorLink = class {
      constructor(id, name, url, thumbnail) {
        this.id = id
        this.name = name
        this.url = url
        this.thumbnail = thumbnail
      }
    }
    for (const name of [
      'PlatformVideo',
      'PlatformVideoDetails',
      'PlatformNestedMediaContent',
      'PlatformChannel',
      'PlatformPlaylist',
      'PlatformPlaylistDetails'
    ]) {
      globalThis[name] = class {
        constructor(value) {
          Object.assign(this, value)
        }
      }
    }
  })

  it('creates platform-scoped IDs and authors', () => {
    const grayjay = grayjay_platform('Test', () => 'plugin-id')
    expect(grayjay.id(123)).toMatchObject({ platform: 'Test', value: '123', pluginId: 'plugin-id' })
    expect(grayjay.author('a', 'Author', 'https://example.test', 'thumb').id).toMatchObject({ platform: 'Test', value: 'a' })
  })

  it('wraps common Grayjay objects with platform IDs', () => {
    const grayjay = grayjay_platform('Test', () => 'plugin-id')
    expect(grayjay.feed_video('fv', { name: 'Feed video' })).toMatchObject({ id: { value: 'fv' }, name: 'Feed video' })
    expect(grayjay.video('v', { name: 'Video' })).toMatchObject({ id: { value: 'v' }, name: 'Video' })
    expect(grayjay.nested('n', { name: 'Nested' })).toMatchObject({ id: { value: 'n' }, name: 'Nested' })
    expect(grayjay.channel('c', { name: 'Channel' })).toMatchObject({ id: { value: 'c' }, subscribers: 0, name: 'Channel' })
    expect(grayjay.playlist('p', { name: 'Playlist' })).toMatchObject({ id: { value: 'p' }, name: 'Playlist' })
    expect(grayjay.playlist_details('pd', { name: 'Playlist details' })).toMatchObject({ id: { value: 'pd' }, name: 'Playlist details' })
  })
})
