import { expect, test } from 'vitest'
import {
  assert_channel,
  assert_details,
  assert_first_media_reachable,
  assert_has_media,
  assert_pager,
  assert_playlist
} from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('sunnahwadeha')
const { source } = runtime

test('sunnahwadeha exposes paged home, search, filters, and suggestions', () => {
  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'content')).toBe(true)
  expect(source.searchSuggestions('ال')).toContain('الحديث')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.video?.audioSources?.length)).toBe(true)

  const search = assert_pager(source.search('مسند الإمام أحمد', null, null, null), 'search')
  expect(search[0].name).toContain('مسند الإمام أحمد')

  const audio = assert_pager(source.search('', null, null, { content: { value: 'audio' } }), 'audio filter')
  expect(audio.every((item) => item.video?.audioSources?.length)).toBe(true)
  expect(audio.map((item) => item.uploadDate)).toEqual([...audio.map((item) => item.uploadDate)].sort((a, b) => b - a))
})

test('sunnahwadeha resolves lessons to reachable Ogg Opus audio and series recommendations', async () => {
  const search = assert_pager(source.search('مسند الإمام أحمد', null, null, null), 'search')
  const details = assert_details(source.getContentDetails(search[0].url), 'lesson details')
  expect(assert_has_media(details, 'lesson details')[0]).toMatchObject({ container: 'audio/ogg', codec: 'opus' })
  expect(assert_pager(details.getContentRecommendations(), 'recommendations').every((item) => item.url !== details.url)).toBe(true)
  await assert_first_media_reachable(details, 'lesson details')
})

test('sunnahwadeha exposes the site channel and series playlists', () => {
  const channel = assert_channel(source.getChannel('sunnahwadeha://root'), 'channel')
  expect(channel.name).toBe('السنة واضحة')
  expect(assert_pager(source.getChannelContents(channel.url), 'channel contents')[0]).toBeTruthy()

  const playlists = assert_pager(source.searchPlaylists('مسند الإمام أحمد', null, null, null), 'playlist search')
  const playlist = assert_playlist(source.getPlaylist(playlists[0].url), 'playlist details')
  expect(playlist.name).toContain('مسند الإمام أحمد')
  expect(assert_pager(playlist.contents, 'playlist contents').length).toBeGreaterThan(0)
})

test('sunnahwadeha exposes an active Cloudflare broadcast as nested live content', () => {
  const live = source.getHome().results.find((item) => item.url === 'sunnahwadeha://live')
  if (!live) return

  expect(source.isContentDetailsUrl('https://sunnahwadeha.com/#live')).toBe(true)
  const details = assert_details(source.getContentDetails(live.url), 'live details')
  expect(details.contentProvider).toBe('Cloudflare Stream')
  expect(details.contentUrl).toMatch(/^https:\/\/customer-[^.]+\.cloudflarestream\.com\/.+\/iframe$/)
})
