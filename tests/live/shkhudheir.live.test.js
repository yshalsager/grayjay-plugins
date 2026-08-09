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

const runtime = await load_plugin('shkhudheir')
const { source } = runtime

test('shkhudheir exposes home, capabilities, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(source.searchSuggestions('الت')).toContain('التفسير')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^shkhudheir:\/\/lesson\//)
})

test('shkhudheir resolves lesson details to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails('shkhudheir://lesson/1972094527'), 'lesson details')
  expect(details.name).toContain('سورة طه')
  expect(assert_has_media(details, 'lesson details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  await assert_first_media_reachable(details, 'lesson details')

  const recommendations = assert_pager(details.getContentRecommendations(), 'lesson recommendations')
  expect(recommendations[0].url).toMatch(/^shkhudheir:\/\/lesson\//)
})

test('shkhudheir resolves fatwa details to reachable MP3 media', async () => {
  const details = assert_details(source.getContentDetails('https://shkhudheir.com/fatawa/1414595258'), 'fatwa details')
  expect(details.name).toContain('رموش')
  await assert_first_media_reachable(details, 'fatwa details')
})

test('shkhudheir channels, peeks, playlists, and search work', () => {
  const root = assert_channel(source.getChannel('shkhudheir://root'), 'root channel')
  expect(root.url).toBe('shkhudheir://root')

  const series = assert_channel(source.getChannel('shkhudheir://series/1054903076'), 'series channel')
  const contents = assert_pager(source.getChannelContents(series.url, null, null, null), 'series contents')
  expect(contents[0].url).toMatch(/^shkhudheir:\/\/lesson\//)
  expect(source.peekChannelContents(series.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const search = assert_pager(source.search('طه', null, null, null), 'search')
  expect(search.some((item) => item.name.includes('طه'))).toBe(true)

  const playlists = assert_pager(source.getChannelPlaylists(root.url), 'channel playlists')
  const playlist = assert_playlist(source.getPlaylist(playlists[0].url), 'playlist details')
  assert_pager(playlist.contents, 'playlist contents')
})
