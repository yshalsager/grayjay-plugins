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

const runtime = await load_plugin('alukah')
const { source } = runtime

test('alukah exposes home, capabilities, channels, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(source.searchSuggestions('ال')).toContain('القرآن')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.url.startsWith('alukah://content/library/'))).toBe(true)
  expect(home.some((item) => item.url.startsWith('alukah://radio/'))).toBe(true)
})

test('alukah resolves library audio details to reachable MP3 media', async () => {
  const item = assert_pager(source.getChannelContents('alukah://category/library/8012', null, null, null), 'library contents')[0]
  const details = assert_details(source.getContentDetails(item.url), 'library details')
  expect(assert_has_media(details, 'library details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'library details')

  expect(details.getContentRecommendations().results.length).toBe(0)
})

test('alukah resolves audio-book playlists and tracks', async () => {
  const playlist = assert_playlist(source.getPlaylist('https://www.alukah.net/audio_books/0/15670/'), 'audio book playlist')
  const contents = assert_pager(playlist.contents, 'audio book contents')
  expect(contents.length).toBeGreaterThan(10)

  const details = assert_details(source.getContentDetails(contents[0].url), 'audio book track')
  expect(details.name).toContain('برامج من أحكام القرآن')
  await assert_first_media_reachable(details, 'audio book track')
})

test('alukah radio details expose live MP3 source', () => {
  const details = assert_details(source.getContentDetails('alukah://radio/quran'), 'radio details')
  expect(details.isLive).toBe(true)
  expect(assert_has_media(details, 'radio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
})

test('alukah channels, peeks, playlists, and search work', () => {
  const root = assert_channel(source.getChannel('alukah://root'), 'root channel')
  expect(root.url).toBe('alukah://root')

  const audio = assert_channel(source.getChannel('alukah://category/library/8012'), 'audio channel')
  const contents = assert_pager(source.getChannelContents(audio.url, null, null, null), 'audio contents')
  expect(contents[0].url).toMatch(/^alukah:\/\/content\/library\//)
  expect(source.peekChannelContents(audio.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const playlists = assert_pager(source.getChannelPlaylists('alukah://category/audio-books/0'), 'audio book playlists')
  expect(playlists[0].url).toMatch(/^alukah:\/\/playlist\/audio-books\//)

  const search = assert_pager(source.search('التوحيد', null, null, null), 'search')
  expect(search.some((item) => item.name.includes('التوحيد'))).toBe(true)
})
