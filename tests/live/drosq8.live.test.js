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

const runtime = await load_plugin('drosq8')
const { source } = runtime

test('drosq8 exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters).toEqual([])
  expect(source.searchSuggestions('الع')).toContain('العلم')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^drosq8:\/\/content\//)
})

test('drosq8 resolves play pages to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails('https://www.drosq8.com/play/24727'), 'audio details')
  expect(details.name).toContain('العشر')
  expect(assert_has_media(details, 'audio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'audio details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'audio recommendations')
  expect(recommendations[0].url).toMatch(/^drosq8:\/\/content\//)
})

test('drosq8 channels, peeks, playlists, and scoped search work', () => {
  const root = assert_channel(source.getChannel('drosq8://root'), 'root channel')
  expect(root.url).toBe('drosq8://root')

  const category = assert_channel(source.getChannel('https://www.drosq8.com/cat/221'), 'speaker category')
  const contents = assert_pager(source.getChannelContents(category.url, null, null, null), 'category contents')
  expect(contents[0].url).toMatch(/^drosq8:\/\/content\//)
  expect(source.peekChannelContents(category.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.searchChannelContents(category.url, 'العشر', null, null, null), 'scoped search')
  expect(search.some((item) => item.name.includes('العشر'))).toBe(true)

  const playlists = assert_pager(source.getChannelPlaylists(root.url), 'channel playlists')
  const playlist = assert_playlist(source.getPlaylist(playlists[0].url), 'playlist details')
  expect(playlist.contents).toBeTruthy()
})

test('drosq8 uses the server search across older materials', () => {
  const search = assert_pager(source.search('آداب العشرة', null, null, null), 'global search')
  expect(search.some((item) => item.name.includes('المجلس الرابع'))).toBe(true)

  const playlists = assert_pager(source.searchPlaylists('محمد هشام', null, null, null), 'playlist search')
  expect(playlists.some((playlist) => playlist.name.includes('محمد هشام'))).toBe(true)
})
