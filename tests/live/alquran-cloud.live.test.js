import { expect, test } from 'vitest'
import {
  assert_channel,
  assert_details,
  assert_first_media_reachable,
  assert_has_media,
  assert_pager,
  assert_playlist,
  media_sources
} from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('alquran-cloud', { language: '0', editionType: '0', defaultEdition: '1' })
const { source, Type } = runtime
const ALAFASY = 'مشاري العفاسي - ar/versebyverse (ar.alafasy)'

test('alquran.cloud loads its catalogs, home, capabilities, and suggestions', () => {
  expect(assert_pager(source.getHome(), 'home')[0].url).toMatch(/^alqurancloud:\/\/ayah\//)

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.sorts).toEqual([Type.Order.Chronological])
  expect(capabilities.filters.map((filter) => filter.id)).toEqual(['language', 'edition-type', 'edition', 'surah'])
  expect(source.searchSuggestions('Alafasy')).toContain('Alafasy')
})

test('alquran.cloud resolves ayah details, direct CDN URLs, and recommendations', async () => {
  const item = assert_pager(source.search('1:1', null, Type.Order.Chronological, { edition: ALAFASY }), 'ayah search')[0]
  expect(item.url).toBe('alqurancloud://ayah/ar.alafasy/1/1')

  const details = assert_details(source.getContentDetails(item.url), 'ayah details')
  const sources = assert_has_media(details, 'ayah details')
  expect(sources[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3', bitrate: 128000 })
  expect(sources[0].url).toBe('https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3')

  expect(source.isContentDetailsUrl(sources[0].url)).toBe(true)
  expect(media_sources(source.getContentDetails(sources[0].url))[0].url).toBe(sources[0].url)

  const recommendations = assert_pager(details.getContentRecommendations(), 'recommendations')
  expect(recommendations.some((recommendation) => recommendation.url === 'alqurancloud://ayah/ar.alafasy/1/2')).toBe(true)
  expect(recommendations.every((recommendation) => recommendation.url !== details.url)).toBe(true)

  await assert_first_media_reachable(details, 'ayah details')
})

test('alquran.cloud supports edition channels and surah playlists', () => {
  const channel = assert_channel(assert_pager(source.searchChannels('Alafasy'), 'channel search')[0], 'edition channel')
  expect(channel.url).toBe('alqurancloud://edition/ar.alafasy')
  expect(source.isChannelUrl(channel.url)).toBe(true)

  expect(
    assert_pager(source.getChannelContents(channel.url, null, Type.Order.Chronological, { surah: 'Al-Baqara (2)' }), 'channel contents')[0]
      .url
  ).toBe('alqurancloud://ayah/ar.alafasy/2/1')
  expect(
    assert_pager(source.searchChannelContents(channel.url, '2:255', null, Type.Order.Chronological, null), 'channel search')[0].url
  ).toBe('alqurancloud://ayah/ar.alafasy/2/255')
  expect(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0])).toHaveLength(6)

  const playlist = assert_playlist(
    assert_pager(source.searchPlaylists('Al-Faatiha', null, Type.Order.Chronological, { edition: ALAFASY }), 'playlist search')[0],
    'playlist'
  )
  expect(playlist.url).toBe('alqurancloud://surah/ar.alafasy/1')
  expect(source.isPlaylistUrl(playlist.url)).toBe(true)

  const details = assert_playlist(source.getPlaylist(playlist.url), 'playlist details')
  expect(details.videoCount).toBe(7)
  expect(assert_pager(details.contents, 'playlist contents')[0].url).toBe('alqurancloud://ayah/ar.alafasy/1/1')
  expect(assert_pager(source.getChannelPlaylists(channel.url), 'channel playlists')).toHaveLength(24)
})

test('alquran.cloud restores its saved catalogs', () => {
  assert_pager(source.getHome(), 'home before save')
  const saved = source.saveState()
  expect(JSON.parse(saved).editions.length).toBeGreaterThan(30)

  source.enable(runtime.config, { language: '0', editionType: '0', defaultEdition: '1' }, saved)
  assert_pager(source.getHome(), 'home after restore')
})
