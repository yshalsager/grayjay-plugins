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

const runtime = await load_plugin('islamhouse')
const { source } = runtime

test('islamhouse exposes home, capabilities, search, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.filters.map((filter) => filter.id)).toEqual(['content', 'language'])
  expect(source.searchSuggestions('q')).toContain('quran')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.url.startsWith('islamhouse://item/'))).toBe(true)

  const search = assert_pager(source.search('quran', null, null, null), 'search')
  expect(search.some((item) => item.name.toLowerCase().includes('quran'))).toBe(true)
})

test('islamhouse resolves video details to reachable MP4 media', async () => {
  const details = assert_details(source.getContentDetails('https://islamhouse.com/en/videos/2844648/'), 'video details')
  expect(details.name).toContain('Prayer')
  expect(assert_has_media(details, 'video details')[0]).toMatchObject({ container: 'video/mp4' })
  await assert_first_media_reachable(details, 'video details')
})

test('islamhouse resolves Quran audio item as playlist and MP3 track', async () => {
  const playlist = assert_playlist(source.getPlaylist('https://islamhouse.com/en/audios/2840060/'), 'quran audio playlist')
  expect(playlist.name).toContain('Surah')
  expect(playlist.videoCount).toBeGreaterThan(20)
  const contents = assert_pager(playlist.contents, 'quran audio contents')
  expect(contents.length).toBeGreaterThan(10)

  const details = assert_details(source.getContentDetails(contents[0].url), 'quran audio details')
  expect(assert_has_media(details, 'quran audio details')[0]).toMatchObject({ container: 'audio/mpeg' })
  await assert_first_media_reachable(details, 'quran audio details')
})

test('islamhouse supports author channels and channel playlists', () => {
  const channels = assert_pager(source.searchChannels('Khalid'), 'channels')
  expect(channels.some((channel) => channel.url.startsWith('islamhouse://author/'))).toBe(true)

  const channel = assert_channel(channels.find((item) => item.name.includes('Khalid')) || channels[0], 'author channel')
  const contents = assert_pager(source.getChannelContents(channel.url, null, null, null), 'author contents')
  expect(contents[0].url).toMatch(/^islamhouse:\/\/item\//)

  const playlists = assert_pager(source.getChannelPlaylists(channel.url), 'author playlists')
  expect(playlists[0].url).toMatch(/^islamhouse:\/\/playlist\//)
})
