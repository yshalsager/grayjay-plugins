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

const runtime = await load_plugin('binbaz')
const { source } = runtime

test('binbaz exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'content')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'section')).toBe(true)
  expect(source.searchSuggestions('الص')).toEqual([])

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^binbaz:\/\/content\//)
})

test('binbaz resolves public fatwa and audio details to reachable MP3 media', async () => {
  const fatwa = assert_details(source.getContentDetails('https://binbaz.org.sa/fatwas/7561/فضل-صيام-يوم-عرفة'), 'fatwa')
  expect(fatwa.name).toContain('فضل صيام يوم عرفة')
  expect(assert_has_media(fatwa, 'fatwa')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  const fatwaRecommendations = assert_pager(fatwa.getContentRecommendations(), 'fatwa recommendations')
  expect(fatwaRecommendations.every((item) => item.url !== fatwa.url)).toBe(true)
  await assert_first_media_reachable(fatwa, 'fatwa')

  const audio = assert_details(
    source.getContentDetails('https://binbaz.org.sa/audios/256/23-من-حديث-أن-رسول-الله-سئل-عن-صوم-يوم-عرفة'),
    'audio'
  )
  expect(audio.name).toContain('صوم يوم عرفة')
  expect(assert_has_media(audio, 'audio')[0].url).toContain('blogh_almaram_old%2023.mp3')
  const audioRecommendations = assert_pager(audio.getContentRecommendations(), 'audio recommendations')
  expect(audioRecommendations.every((item) => item.url !== audio.url)).toBe(true)
  await assert_first_media_reachable(audio, 'audio')
})

test('binbaz section channels expose browsable content and scoped search', () => {
  const root = assert_channel(source.getChannel('https://binbaz.org.sa'), 'root channel')
  expect(root.url).toBe('https://binbaz.org.sa')

  const section = assert_channel(source.getChannel('https://binbaz.org.sa/fatwas/kind/2'), 'fatwa section')
  const contents = assert_pager(source.getChannelContents(section.url, null, null, null), 'fatwa section contents')
  expect(contents[0].url).toMatch(/^binbaz:\/\/content\//)
  expect(source.peekChannelContents(section.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const browse = assert_pager(source.searchChannelContents(section.url, '', null, null, null), 'filtered fatwa browse')
  expect(browse.every((item) => item.url.startsWith('binbaz://content/'))).toBe(true)
  expect(source.search('الصلاة', null, null, null).results).toEqual([])
})

test('binbaz audio series are exposed as playlists with playable contents', () => {
  const playlists = assert_pager(source.searchPlaylists('', null, null, { section: 'audios-1' }), 'playlist browse')
  const playlist = assert_playlist(playlists[0], 'playlist')
  expect(playlist.url).toMatch(/^binbaz:\/\/series\//)

  const details = assert_playlist(
    source.getPlaylist('https://binbaz.org.sa/audios/series/23/شرح-بلوغ-المرام-الشرح-القديم'),
    'playlist details'
  )
  const items = assert_pager(details.contents, 'playlist contents')
  expect(items[0].url).toMatch(/^binbaz:\/\/content\//)

  const itemDetails = assert_details(source.getContentDetails(items[0].url), 'playlist item details')
  expect(assert_has_media(itemDetails, 'playlist item details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
})

test('binbaz video pages resolve to YouTube nested content', () => {
  const nested = source.getContentDetails('https://binbaz.org.sa/videos/2/صلاح-القلب')
  expect(nested.contentProvider).toBe('YouTube')
  expect(nested.contentUrl).toBe('https://www.youtube.com/watch?v=2w6hOesNSsM')
})
