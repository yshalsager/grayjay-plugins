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

const runtime = await load_plugin('binothaimeen')
const { source } = runtime

const WOMEN_SECTION = '09168125-b1e7-4d18-b92c-fc1f21e0be02'
const SAMPLE_AUDIO = 'd0219051-2acd-4db9-b530-e3bf8d870f36'

test('binothaimeen exposes home, capabilities, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(source.searchSuggestions('الم')).toContain('المرأة')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^binothaimeen:\/\/audio\//)
  expect(home.some((item) => item.video?.audioSources?.length)).toBe(true)
})

test('binothaimeen resolves audio details to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails(`binothaimeen://audio/${SAMPLE_AUDIO}/${WOMEN_SECTION}`), 'audio details')
  expect(details.name).toContain('حق أم الزوج')
  expect(assert_has_media(details, 'audio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'audio details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'audio recommendations')
  expect(recommendations[0].url).toMatch(/^binothaimeen:\/\/audio\//)
})

test('binothaimeen channels, peeks, playlists, and scoped search work', () => {
  const root = assert_channel(source.getChannel('binothaimeen://root'), 'root channel')
  expect(root.url).toBe('binothaimeen://root')

  const section = assert_channel(source.getChannel(`binothaimeen://section/${WOMEN_SECTION}`), 'women section')
  const contents = assert_pager(source.getChannelContents(section.url, null, null, null), 'section contents')
  expect(contents[0].url).toMatch(/^binothaimeen:\/\/audio\//)
  expect(source.peekChannelContents(section.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.searchChannelContents(section.url, 'الزوج', null, null, null), 'scoped search')
  expect(search.some((item) => item.name.includes('الزوج'))).toBe(true)

  const playlists = assert_pager(source.getChannelPlaylists(root.url), 'channel playlists')
  const playlist = assert_playlist(source.getPlaylist(playlists[0].url), 'playlist details')
  assert_pager(playlist.contents, 'playlist contents')
})

test('binothaimeen search and playlist search work', () => {
  const search = assert_pager(source.search('حكم صوم', null, null, null), 'search')
  expect(search[0].url).toMatch(/^binothaimeen:\/\/audio\//)
  expect(assert_has_media(source.getContentDetails(search[0].url), 'search result details')[0].url).toContain('.mp3')

  const playlists = assert_pager(source.searchPlaylists('المرأة', null, null, null), 'playlist search')
  expect(playlists.some((playlist) => playlist.name.includes('المرأة'))).toBe(true)
})
