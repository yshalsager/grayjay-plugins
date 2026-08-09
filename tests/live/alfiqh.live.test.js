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

const runtime = await load_plugin('alfiqh')
const { source } = runtime

test('alfiqh exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological_Reverse)
  expect(capabilities.filters.some((filter) => filter.id === 'speaker')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'topic')).toBe(true)
  expect(source.searchSuggestions('تفسير')).toContain('تفسير')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^alfiqh:\/\/track\//)
  expect(home.some((item) => item.video?.audioSources?.length)).toBe(true)
})

test('alfiqh resolves track details to reachable Archive.org MP3 media', async () => {
  const details = assert_details(source.getContentDetails('alfiqh://track/10785/0'), 'track details')
  expect(details.name).toContain('فاطر')
  expect(assert_has_media(details, 'track details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'track details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'track recommendations')
  expect(recommendations[0].url).toMatch(/^alfiqh:\/\/track\/10785\//)
})

test('alfiqh post playlists and public post URLs work', () => {
  const playlist = assert_playlist(source.getPlaylist('alfiqh://playlist/post/10785'), 'playlist details')
  const contents = assert_pager(playlist.contents, 'playlist contents')
  expect(contents.length).toBeGreaterThan(5)
  expect(contents[0].url).toBe('alfiqh://track/10785/0')

  const publicPlaylist = assert_playlist(
    source.getPlaylist(
      'https://alfiqh.net/%d8%aa%d9%81%d8%b3%d9%8a%d8%b1-%d8%b3%d9%88%d8%b1%d8%a9-%d9%81%d8%a7%d8%b7%d8%b1-%d8%b9%d8%a8%d8%af%d8%a7%d9%84%d8%b1%d8%ad%d9%85%d9%86-%d8%a7%d9%84%d8%b9%d8%ac%d9%84%d8%a7%d9%86/'
    ),
    'public playlist'
  )
  expect(publicPlaylist.name).toContain('فاطر')
})

test('alfiqh channels, peeks, playlists, and scoped search work', () => {
  const root = assert_channel(source.getChannel('alfiqh://root'), 'root channel')
  expect(root.url).toBe('alfiqh://root')

  const speaker = assert_channel(source.getChannel('alfiqh://category/78'), 'speaker channel')
  const contents = assert_pager(source.getChannelContents(speaker.url, null, null, null), 'speaker contents')
  expect(contents[0].url).toMatch(/^alfiqh:\/\/track\//)
  expect(source.peekChannelContents(speaker.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.searchChannelContents(speaker.url, 'فاطر', null, null, null), 'scoped search')
  expect(search.some((item) => item.name.includes('فاطر'))).toBe(true)

  const playlists = assert_pager(source.getChannelPlaylists(speaker.url), 'channel playlists')
  expect(playlists[0].url).toMatch(/^alfiqh:\/\/playlist\/post\//)
})

test('alfiqh search and playlist search use filters', () => {
  const search = assert_pager(source.search('التوحيد', null, null, { topic: '34' }), 'topic search')
  expect(search[0].url).toMatch(/^alfiqh:\/\/track\//)

  const playlists = assert_pager(source.searchPlaylists('التوحيد', null, null, { topic: '34' }), 'playlist search')
  expect(playlists[0].url).toMatch(/^alfiqh:\/\/playlist\/post\//)
})
