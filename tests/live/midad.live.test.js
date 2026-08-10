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

const runtime = await load_plugin('midad')
const { source } = runtime

test('midad exposes home, capabilities, section filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Popularity)
  expect(capabilities.filters.some((filter) => filter.id === 'section')).toBe(true)
  expect(source.searchSuggestions('تو')).toContain('التوحيد')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.every((item) => typeof item.url === 'string')).toBe(true)
  expect(home.some((item) => item.contentProvider === 'YouTube')).toBe(true)
  expect(home.some((item) => item.url?.startsWith('midad://content/lesson/'))).toBe(true)
})

test('midad resolves lesson, audiobook, recitation, video, and youtube details', async () => {
  const lesson = assert_details(source.getContentDetails('https://midad.com/lesson/302084'), 'lesson')
  expect(lesson.url).toBe('https://midad.com/lesson/302084')
  expect(assert_has_media(lesson, 'lesson')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(lesson, 'lesson')

  const audiobook = assert_details(source.getContentDetails('https://midad.com/audiobook/12'), 'audiobook')
  expect(assert_has_media(audiobook, 'audiobook')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })

  const recitation = assert_details(source.getContentDetails('https://midad.com/recitation/287939'), 'recitation')
  expect(assert_has_media(recitation, 'recitation')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })

  const video = assert_details(source.getContentDetails('https://midad.com/video/30947'), 'video')
  expect(assert_has_media(video, 'video')[0]).toMatchObject({ container: 'video/mp4', codec: 'h264' })

  const youtube = assert_details(source.getContentDetails('https://midad.com/youtube-midad-v/6013'), 'youtube')
  expect(youtube.contentProvider).toBe('YouTube')
  expect(youtube.contentUrl).toContain('youtube.com/watch')
  assert_has_media(youtube, 'youtube')
})

test('midad search follows entry results and honors section filters', () => {
  const all = assert_pager(source.search('التوحيد', null, null, null), 'search all')
  expect(all.some((item) => item.video?.audioSources?.length || item.video?.sources?.length)).toBe(true)

  const lessons = assert_pager(source.search('التوحيد', null, null, { section: 'lessons' }), 'search lessons')
  expect(lessons.every((item) => item.url.includes('/lesson/') || item.url.startsWith('midad://content/lesson/'))).toBe(true)
  expect(lessons.some((item) => item.video?.audioSources?.length)).toBe(true)

  const popular = assert_pager(source.search('التوحيد', null, runtime.Type.Order.Popularity, null), 'popular search')
  expect(popular.map((item) => item.viewCount)).toEqual(popular.map((item) => item.viewCount).sort((a, b) => b - a))

  const popularVideos = assert_pager(source.search('', null, runtime.Type.Order.Popularity, { section: 'videos' }), 'popular videos')
  expect(popularVideos[0].url).toMatch(/^midad:\/\/content\/video\//)
})

test('midad channels expose root, section, scholar contents, peeks, and playlists', () => {
  const root = assert_channel(source.getChannel('https://midad.com'), 'root channel')
  expect(root.url).toBe('midad://root')

  const section = assert_channel(source.getChannel('midad://section/lessons'), 'section channel')
  const sectionContents = assert_pager(
    source.getChannelContents(section.url, null, runtime.Type.Order.Chronological, null),
    'section contents'
  )
  expect(sectionContents[0].url).toMatch(/^midad:\/\/content\/lesson\//)

  const scholar = assert_channel(source.getChannel('https://midad.com/scholar/51672'), 'scholar channel')
  const scholarContents = assert_pager(source.getChannelContents(scholar.url, null, null, { section: 'recitations' }), 'scholar contents')
  expect(scholarContents.some((item) => item.url.includes('/recitation/') || item.url.startsWith('midad://content/recitation/'))).toBe(true)
  expect(source.peekChannelContents(scholar.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const channelPlaylists = assert_pager(source.getChannelPlaylists(scholar.url), 'scholar playlists')
  expect(channelPlaylists.some((item) => item.url.startsWith('midad://playlist/collection/'))).toBe(true)
})

test('midad mushaf playlists expose recitation entries that resolve to audio', () => {
  const playlist = assert_playlist(source.getPlaylist('https://midad.com/collection/465953'), 'playlist')
  const items = assert_pager(playlist.contents, 'playlist contents')
  expect(items[0].url).toBe('midad://content/recitation/287939')

  const details = assert_details(source.getContentDetails(items[0].url), 'playlist item details')
  expect(assert_has_media(details, 'playlist item details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })

  const searchPlaylists = assert_pager(source.searchPlaylists('مصحف إياد', null, runtime.Type.Order.Popularity, null), 'playlist search')
  expect(searchPlaylists.map((item) => item.videoCount)).toEqual(searchPlaylists.map((item) => item.videoCount).sort((a, b) => b - a))
  expect(searchPlaylists.some((item) => item.url === 'midad://playlist/collection/465953')).toBe(true)
})
