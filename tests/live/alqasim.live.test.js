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

const runtime = await load_plugin('alqasim')
const { source } = runtime

test('alqasim exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'content')).toBe(true)
  expect(source.searchSuggestions('الق')).toContain('القرآن')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.url?.startsWith('alqasim://content/'))).toBe(true)
  expect(home.some((item) => item.contentProvider === 'YouTube')).toBe(true)
})

test('alqasim resolves audio details to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails('alqasim://content/sounds/5603'), 'audio details')
  expect(details.name).toContain('الخاتمة')
  expect(assert_has_media(details, 'audio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'audio details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'audio recommendations')
  expect(recommendations[0].url).toMatch(/^alqasim:\/\/content\//)
})

test('alqasim resolves YouTube video details', () => {
  const nested = source.getContentDetails('alqasim://content/videos/19082')
  expect(nested.contentProvider).toBe('YouTube')
  expect(nested.contentUrl).toBe('https://www.youtube.com/watch?v=VlNU3Yv1360')
})

test('alqasim channels, peeks, playlists, and scoped search work', () => {
  const root = assert_channel(source.getChannel('alqasim://root'), 'root channel')
  expect(root.url).toBe('alqasim://root')

  const section = assert_channel(source.getChannel('alqasim://channel/lessons'), 'lessons channel')
  const contents = assert_pager(source.getChannelContents(section.url, null, null, null), 'channel contents')
  expect(contents[0].url).toMatch(/^alqasim:\/\/content\/lessons\//)
  expect(source.peekChannelContents(section.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.searchChannelContents(section.url, 'القرآن', null, null, null), 'scoped search')
  expect(search.every((item) => item.url.startsWith('alqasim://content/lessons/'))).toBe(true)

  assert_pager(source.getChannelPlaylists(section.url), 'channel playlists')
  const playlist = assert_playlist(source.getPlaylist('alqasim://playlist/lessons/607'), 'playlist details')
  assert_pager(playlist.contents, 'playlist contents')
})

test('alqasim search and playlist search use content filters', () => {
  const search = assert_pager(source.search('القرآن', null, null, { content: 'lessons' }), 'lesson search')
  expect(search.every((item) => item.url.startsWith('alqasim://content/lessons/'))).toBe(true)

  const playlists = assert_pager(source.searchPlaylists('متون', null, null, { content: 'lessons' }), 'playlist search')
  expect(playlists.some((playlist) => playlist.name.includes('متون'))).toBe(true)
})
