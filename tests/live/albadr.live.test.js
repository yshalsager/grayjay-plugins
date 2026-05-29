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

const runtime = await load_plugin('albadr')
const { source } = runtime

test('albadr exposes search capabilities, suggestions, home audio, and nested Mixlr live content', () => {
  const capabilities = source.getSearchCapabilities()

  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'content')).toBe(true)
  expect(source.searchSuggestions('تو')).toContain('التوحيد')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.contentProvider === 'Mixlr' && item.contentUrl === 'https://albadrnet.mixlr.com')).toBe(true)
  expect(home.some((item) => item.video?.audioSources?.length)).toBe(true)
})

test('albadr resolves direct detail and direct mp3 URLs to playable audio', async () => {
  const detailUrl = 'https://www.al-badr.net/detail/BXrdatJsQH'
  expect(source.isContentDetailsUrl(detailUrl)).toBe(true)

  const details = assert_details(source.getContentDetails(detailUrl), 'direct detail')
  const sources = assert_has_media(details, 'direct detail')
  expect(details.name).toContain('001/162')
  expect(sources[0]).toMatchObject({
    container: 'audio/mpeg',
    codec: 'mp3',
    duration: 0
  })
  await assert_first_media_reachable(details, 'direct detail')

  const mediaUrl = sources[0].url
  expect(source.isContentDetailsUrl(mediaUrl)).toBe(true)
  assert_has_media(source.getContentDetails(mediaUrl), 'direct media')
})

test('albadr category channels expose metadata, peeks, contents, and series playlists', () => {
  const channelUrl = 'https://www.al-badr.net/category/9'
  expect(source.isChannelUrl(channelUrl)).toBe(true)

  const channel = assert_channel(source.getChannel(channelUrl), 'category')
  expect(channel.url).toBe('albadr://category/9')

  const contents = assert_pager(source.getChannelContents(channel.url, null, null, null), 'category contents')
  expect(contents.some((item) => item.video?.audioSources?.length)).toBe(true)
  expect(contents.length).toBeGreaterThan(4)
  expect(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const playlist = assert_playlist(assert_pager(source.getChannelPlaylists(channel.url), 'category playlists')[0], 'category playlist')
  expect(playlist.url).toMatch(/^albadr:\/\/playlist\/sub\//)
})

test('albadr series playlists page native mp3 lessons and recommend same-series siblings', () => {
  const publicPlaylistUrl = 'https://www.al-badr.net/sub/33'
  expect(source.isPlaylistUrl(publicPlaylistUrl)).toBe(true)

  const playlist = assert_playlist(source.getPlaylist(publicPlaylistUrl), 'series details')
  const items = assert_pager(playlist.contents, 'series contents')
  expect(items[0].name).toContain('001/162')

  const recommendations = items[0].getContentRecommendations()
  expect(Array.isArray(recommendations.results)).toBe(true)
  expect(recommendations.results.every((item) => item.url !== items[0].url)).toBe(true)
})

test('albadr search resolves result details and live URL returns nested Mixlr content', () => {
  const search = assert_pager(source.search('التوحيد', null, null, null), 'search')
  expect(search.some((item) => item.video?.audioSources?.length)).toBe(true)

  expect(source.isContentDetailsUrl('https://www.al-badr.net/streaming')).toBe(true)
  const live = source.getContentDetails('https://www.al-badr.net/streaming')
  expect(live.contentProvider).toBe('Mixlr')
  expect(live.contentUrl).toBe('https://albadrnet.mixlr.com')
  assert_has_media(live, 'nested live')
})
