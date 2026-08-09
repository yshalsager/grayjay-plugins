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

const runtime = await load_plugin('jeman')
const { source } = runtime

test('jeman exposes home, capabilities, filters, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(capabilities.filters.some((filter) => filter.id === 'kind')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'tab')).toBe(true)
  expect(source.searchSuggestions('الع')).toContain('العلم')

  const home = assert_pager(source.getHome(), 'home')
  expect(home.some((item) => item.video?.audioSources?.length)).toBe(true)
  expect(home.some((item) => item.contentProvider === 'YouTube')).toBe(true)
})

test('jeman resolves audio details to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails('jeman://audio/lessons/46825c18-233e-4ada-a341-f1fc64a69465'), 'audio details')
  expect(details.name).toContain('وتوبوا')
  expect(assert_has_media(details, 'audio details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'audio details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'audio recommendations')
  expect(recommendations[0].url).toMatch(/^jeman:\/\/audio\//)
})

test('jeman resolves YouTube clip details', () => {
  const nested = source.getContentDetails('jeman://video/visuallessons/705f691d-6594-4bb3-af53-3d588f1929b9')
  expect(nested.contentProvider).toBe('YouTube')
  expect(nested.contentUrl).toBe('https://www.youtube.com/watch?v=OhUiPr-D9Vw')

  const publicNested = source.getContentDetails('https://j-eman.net/video/visuallessons/show/705f691d-6594-4bb3-af53-3d588f1929b9/clip')
  expect(publicNested.contentUrl).toBe(nested.contentUrl)
})

test('jeman tab/category channels and playlists expose contents', () => {
  const root = assert_channel(source.getChannel('jeman://root'), 'root channel')
  expect(root.url).toBe('jeman://root')

  const tab = assert_channel(source.getChannel('jeman://tab/audio/lessons'), 'audio tab')
  const tabContents = assert_pager(source.getChannelContents(tab.url, null, null, null), 'tab contents')
  expect(tabContents[0].url).toMatch(/^jeman:\/\/audio\//)

  const playlists = assert_pager(source.getChannelPlaylists(tab.url), 'tab playlists')
  const playlist = assert_playlist(playlists[0], 'playlist')
  const details = assert_playlist(source.getPlaylist(playlist.url), 'playlist details')
  assert_pager(details.contents, 'playlist contents')
})

test('jeman searches the paginated global and media APIs', () => {
  const audio = assert_pager(source.search('العلم', null, null, { kind: 'audio' }), 'audio search')
  expect(audio.some((item) => item.video?.audioSources?.[0]?.url.includes('.mp3'))).toBe(true)

  const video = assert_pager(source.search('صلة الناسك', null, null, { kind: 'video', tab: ['video:visuallessons'] }), 'video search')
  expect(video.some((item) => item.contentProvider === 'YouTube')).toBe(true)
})
