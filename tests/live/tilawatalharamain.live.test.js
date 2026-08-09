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

const runtime = await load_plugin('tilawatalharamain')
const { source } = runtime

test('tilawat exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'section')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'mosque')).toBe(true)
  expect(source.searchSuggestions('الف')).toContain('الفاتحة')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^tilawatalharamain:\/\/content\//)
})

test('tilawat resolves quran detail to reachable direct MP3 and YouTube recommendation', async () => {
  const details = assert_details(source.getContentDetails('https://tilawatalharamain.com/quran/1'), 'quran details')
  expect(details.name).toContain('الفاتحة')
  expect(assert_has_media(details, 'quran details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'quran details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'quran recommendations')
  expect(recommendations[0].contentProvider).toBe('YouTube')
})

test('tilawat sections and categories work as channels', () => {
  const root = assert_channel(source.getChannel('https://tilawatalharamain.com'), 'root channel')
  expect(root.url).toBe('https://tilawatalharamain.com')

  const section = assert_channel(source.getChannel('https://tilawatalharamain.com/quran'), 'section channel')
  const playlists = assert_pager(source.getChannelPlaylists(section.url), 'section playlists')
  expect(playlists[0].url).toMatch(/^tilawatalharamain:\/\/category\//)

  const category = assert_channel(source.getChannel('https://tilawatalharamain.com/quran/c/61'), 'category channel')
  const contents = assert_pager(source.getChannelContents(category.url, null, null, null), 'category contents')
  expect(contents[0].url).toMatch(/^tilawatalharamain:\/\/content\//)
  expect(source.peekChannelContents(category.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)
})

test('tilawat category playlists expose playable contents', () => {
  const playlist = assert_playlist(source.getPlaylist('https://tilawatalharamain.com/quran/c/61'), 'playlist details')
  expect(playlist.name).toContain('مصحف')
  const items = assert_pager(playlist.contents, 'playlist contents')
  expect(items[0].url).toMatch(/^tilawatalharamain:\/\/content\//)

  const itemDetails = assert_details(source.getContentDetails(items[0].url), 'playlist item details')
  assert_has_media(itemDetails, 'playlist item details')
})

test('tilawat search and playlist search use section and mosque filters', () => {
  const search = assert_pager(source.search('الفاتحة', null, null, { section: 'quran', mosque: 'all' }), 'search')
  expect(search.some((item) => item.name.includes('الفاتحة'))).toBe(true)
  expect(search.every((item) => source.isContentDetailsUrl(item.url) && !source.isPlaylistUrl(item.url))).toBe(true)

  const playlists = assert_pager(source.searchPlaylists('مصحف', null, null, { section: 'quran', mosque: 'makkah' }), 'playlist search')
  expect(playlists.every((item) => item.name.includes('مكي') || item.name.includes('مكة') || item.name.includes('الحرام'))).toBe(true)
})
