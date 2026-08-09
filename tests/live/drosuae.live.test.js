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

const runtime = await load_plugin('drosuae')
const { source } = runtime

test('drosuae exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'section')).toBe(true)
  expect(source.searchSuggestions('الق')).toContain('القرآن')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.url.startsWith('drosuae://content/'))).toBe(true)
  expect(home.some((item) => item.video?.audioSources?.length)).toBe(true)
})

test('drosuae resolves REST details to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails('drosuae://content/lectures/94861'), 'audio details')
  expect(details.name).toContain('حقوق العلماء')
  expect(assert_has_media(details, 'audio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'audio details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'audio recommendations')
  expect(recommendations[0].url).toMatch(/^drosuae:\/\/content\//)
})

test('drosuae resolves public slugs and Quran redirecting media', async () => {
  const details = assert_details(
    source.getContentDetails('https://drosuae.com/quran/%d8%b3%d9%88%d8%b1%d8%a9-%d8%a7%d9%84%d9%86%d8%a7%d8%b3/'),
    'quran details'
  )
  expect(details.name).toContain('سورة الناس')
  await assert_first_media_reachable(details, 'quran details')
})

test('drosuae channels, peeks, playlists, and scoped search work', () => {
  const root = assert_channel(source.getChannel('drosuae://root'), 'root channel')
  expect(root.url).toBe('drosuae://root')

  const section = assert_channel(source.getChannel('https://drosuae.com/lessons/'), 'lessons section')
  const contents = assert_pager(source.getChannelContents(section.url, null, null, null), 'section contents')
  expect(contents[0].url).toMatch(/^drosuae:\/\/content\/lessons\//)
  expect(source.peekChannelContents(section.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.searchChannelContents(section.url, 'القرآن', null, null, null), 'scoped search')
  expect(search.every((item) => item.url.startsWith('drosuae://content/lessons/'))).toBe(true)

  const playlists = assert_pager(source.getChannelPlaylists(root.url), 'channel playlists')
  const playlist = assert_playlist(source.getPlaylist(playlists[0].url), 'playlist details')
  assert_pager(playlist.contents, 'playlist contents')
})

test('drosuae search and playlist search use section filters', () => {
  const search = assert_pager(source.search('القرآن', null, null, { section: 'lessons' }), 'lesson search')
  expect(search.every((item) => item.url.startsWith('drosuae://content/lessons/'))).toBe(true)

  const playlists = assert_pager(source.searchPlaylists('القرآن', null, null, null), 'playlist search')
  expect(playlists.some((playlist) => playlist.name.includes('القرآن'))).toBe(true)
})
