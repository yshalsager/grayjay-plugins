import { expect, test } from 'vitest'
import {
  assert_channel,
  assert_details,
  assert_first_media_reachable,
  assert_has_media,
  assert_pager,
  assert_playlist,
  first_filter_value,
  media_sources
} from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('quranicaudio')
const { source, Type } = runtime

test('quranicaudio loads catalog, home, capabilities, and suggestions', () => {
  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^quranicaudio:\/\/surah\/\d+\/1$/)

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(Type.Feed.Mixed)
  expect(capabilities.sorts).toEqual([Type.Order.Chronological])
  expect(capabilities.filters.some((filter) => filter.id === 'section')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'qari')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'surah')).toBe(true)
  expect(first_filter_value(capabilities, 'surah')).toMatch(/\(\d+\)$/)
  expect(source.searchSuggestions('juhani').some((item) => item.includes('Juhani'))).toBe(true)
})

test('quranicaudio resolves surah details, direct mp3 URLs, and recommendations', async () => {
  const item = assert_pager(
    source.search('Surah 1', null, Type.Order.Chronological, { qari: 'عبدالله عواد الجهني - Abdullah Awad al-Juhani (1)' }),
    'surah search'
  )[0]
  const details = assert_details(source.getContentDetails(item.url), 'surah details')
  const sources = assert_has_media(details, 'surah details')
  expect(sources[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
  expect(sources[0].url).toBe('https://download.quranicaudio.com/quran/abdullaah_3awwaad_al-juhaynee/001.mp3')

  const direct = assert_details(source.getContentDetails(sources[0].url), 'direct mp3')
  expect(media_sources(direct)[0].url).toBe(sources[0].url)

  const recommendations = assert_pager(details.getContentRecommendations(), 'recommendations')
  expect(recommendations.every((recommendation) => recommendation.url !== details.url)).toBe(true)
  expect(recommendations.some((recommendation) => recommendation.url.endsWith('/2'))).toBe(true)

  await assert_first_media_reachable(details, 'surah details')
})

test('quranicaudio qari channels and channel-local search work', () => {
  const channel = assert_channel(assert_pager(source.searchChannels('Juhani'), 'channel search')[0], 'qari channel')
  expect(channel.url).toBe('quranicaudio://qari/1')
  expect(source.isChannelUrl(channel.url)).toBe(true)

  const contents = assert_pager(
    source.getChannelContents(channel.url, null, Type.Order.Chronological, { surah: 'Surah 112 (112)' }),
    'channel contents'
  )
  expect(contents[0].url).toBe('quranicaudio://surah/1/112')

  const local = assert_pager(source.searchChannelContents(channel.url, '2', null, Type.Order.Chronological, null), 'channel local search')
  expect(local[0].url).toBe('quranicaudio://surah/1/2')
  expect(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)
})

test('quranicaudio qari playlists expose full surah list', () => {
  const playlist = assert_playlist(
    source.searchPlaylists('Juhani', null, Type.Order.Chronological, { section: '1' }).results[0],
    'playlist'
  )
  expect(playlist.url).toBe('quranicaudio://playlist/qari/1')
  expect(source.isPlaylistUrl(playlist.url)).toBe(true)

  const details = assert_playlist(source.getPlaylist(playlist.url), 'playlist details')
  const contents = assert_pager(details.contents, 'playlist contents')
  expect(contents[0].url).toBe('quranicaudio://surah/1/1')
  expect(details.videoCount).toBe(114)

  const channelPlaylists = assert_pager(source.getChannelPlaylists('quranicaudio://qari/1'), 'channel playlists')
  expect(channelPlaylists[0].url).toBe('quranicaudio://playlist/qari/1')
})

test('quranicaudio saved state restores catalog', () => {
  assert_pager(source.getHome(), 'home before save')
  const saved = source.saveState()
  expect(JSON.parse(saved).qaris.length).toBeGreaterThan(150)

  source.enable(runtime.config, {}, saved)
  assert_pager(source.getHome(), 'home after restore')
})
