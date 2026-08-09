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

const runtime = await load_plugin('saleh-af')
const { source } = runtime

test('saleh-af exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'section')).toBe(true)
  expect(source.searchSuggestions('الع')).toContain('العلم')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^salehaf:\/\/audio\//)
})

test('saleh-af resolves section audio to reachable MP3 media', async () => {
  const item = assert_pager(source.getChannelContents('salehaf://section/khotab', null, null, null), 'khutab contents')[0]
  const details = assert_details(source.getContentDetails(item.url), 'audio details')
  expect(details.name).toContain('اليوم الآخر')
  expect(assert_has_media(details, 'audio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  const recommendations = assert_pager(details.getContentRecommendations(), 'audio recommendations')
  expect(recommendations.every((item) => item.url !== details.url)).toBe(true)
  await assert_first_media_reachable(details, 'audio details')
})

test('saleh-af channels, peeks, playlists, and scoped search work', () => {
  const root = assert_channel(source.getChannel('salehaf://root'), 'root channel')
  expect(root.url).toBe('salehaf://root')

  const section = assert_channel(source.getChannel('https://saleh.af.org.sa/ar/ftawa'), 'fatwa section')
  const contents = assert_pager(source.getChannelContents(section.url, null, null, null), 'section contents')
  expect(contents[0].url).toMatch(/^salehaf:\/\/audio\//)
  expect(source.peekChannelContents(section.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.searchChannelContents(section.url, 'التوحيد', null, null, null), 'scoped search')
  expect(search.every((item) => item.url.startsWith('salehaf://audio/'))).toBe(true)

  const playlists = assert_pager(source.getChannelPlaylists(section.url), 'channel playlists')
  const playlist = assert_playlist(playlists[0], 'playlist')
  assert_pager(source.getPlaylist(playlist.url).contents, 'playlist contents')
})
