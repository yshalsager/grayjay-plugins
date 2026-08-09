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

const runtime = await load_plugin('qurancom', { language: '0' })
const { source, Type } = runtime

function set_settings(settings) {
  source.enable(runtime.config, { language: '0', ...settings }, null)
}

test('qurancom home modes and capabilities work', () => {
  for (const homeMode of ['0', '1']) {
    set_settings({ homeMode })
    assert_pager(source.getHome(), `home mode ${homeMode}`)
  }

  set_settings({ homeMode: '0', defaultReciter: '2' })
  const home = assert_pager(source.getHome(), 'default reciter home')[0]
  expect(home.url).toMatch(/^qurancom:\/\/timed\/2\/1$/)
  expect(home.name).not.toContain('1:1')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.sorts).toEqual([Type.Order.Chronological])
  expect(capabilities.filters.some((filter) => filter.id === 'content')).toBe(false)
  expect(capabilities.filters.some((filter) => filter.id === 'reciter')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'surah')).toBe(true)
  expect(first_filter_value(capabilities, 'reciter')).not.toMatch(/^\d+$/)
  expect(first_filter_value(capabilities, 'surah')).toMatch(/\(\d+\)$/)
  expect(source.searchSuggestions('الفاتحة').length).toBeGreaterThan(0)
  expect(source.searchSuggestions('عبد').length).toBeGreaterThan(0)
})

test('qurancom surah search, details, direct URLs, and recommendations work', async () => {
  set_settings({ homeMode: '0' })
  const surah = assert_pager(
    source.search('الفاتحة', null, Type.Order.Chronological, { reciter: 'عبد الباسط عبد الصمد - Murattal (2)' }),
    'surah search'
  )[0]
  expect(surah.url).toBe('qurancom://timed/2/1')
  expect(surah.name).not.toContain('1:1')

  const reciterSearch = assert_pager(source.search('محمد صديق المنشاوي', null, Type.Order.Chronological, null), 'reciter search')
  expect(reciterSearch.length).toBeGreaterThan(2)
  expect(new Set(reciterSearch.map((result) => result.url)).size).toBe(reciterSearch.length)
  expect(reciterSearch.some((result) => result.url.endsWith('/2'))).toBe(true)

  const item = assert_pager(
    source.search('1:1', null, Type.Order.Chronological, { reciter: 'عبد الباسط عبد الصمد - Murattal (2)' }),
    'verse-reference search'
  )[0]
  expect(item.url).toBe('qurancom://timed/2/1')
  const details = assert_details(source.getContentDetails(item.url), 'surah details')
  assert_has_media(details, 'surah details')

  expect(source.isContentDetailsUrl('https://quran.com/1/1')).toBe(true)
  expect(source.getContentDetails('https://quran.com/1/1').url).toMatch(/^qurancom:\/\/timed\//)

  const mediaUrl = media_sources(details)[0].url
  expect(source.isContentDetailsUrl(mediaUrl)).toBe(true)
  expect(source.getContentDetails(mediaUrl).url).toBe(details.url)

  const recommendations = assert_pager(details.getContentRecommendations(), 'surah recommendations')
  expect(recommendations.every((recommendation) => recommendation.url !== details.url)).toBe(true)
  expect(recommendations.some((recommendation) => recommendation.url.endsWith('/2'))).toBe(true)

  await assert_first_media_reachable(details, 'surah details')
})

test('qurancom timed surah details expose chapters and subtitles', async () => {
  set_settings({ homeMode: '1' })
  const item = assert_pager(
    source.search('', null, Type.Order.Chronological, {
      reciter: 'عبد الباسط عبد الصمد - Mujawwad (1)',
      surah: 'الفاتحة (1)'
    }),
    'timed search'
  )[0]
  const details = assert_details(source.getContentDetails(item.url), 'timed details')
  const chapters = source.getContentChapters(details.url)

  assert_has_media(details, 'timed details')
  expect(details.subtitles?.length, 'expected timed Quran subtitle track').toBeGreaterThan(0)
  expect(decodeURIComponent(details.subtitles[0].url.replace(/^data:text\/vtt;charset=utf-8,/, ''))).toMatch(/^WEBVTT/)
  expect(chapters.length, 'expected Al-Fatihah chapter markers').toBeGreaterThanOrEqual(7)
  expect(chapters.every((chapter) => chapter.timeEnd > chapter.timeStart)).toBe(true)

  set_settings({ homeMode: '1', subtitles: '1' })
  expect(source.getContentDetails(details.url).subtitles ?? []).toHaveLength(0)
  set_settings({ homeMode: '1' })

  expect(source.isContentDetailsUrl('https://quran.com/1')).toBe(true)
  expect(source.getContentDetails('https://quran.com/1').url).toMatch(/^qurancom:\/\/timed\//)

  const mediaUrl = media_sources(details)[0].url
  expect(source.isContentDetailsUrl(mediaUrl)).toBe(true)
  expect(source.getContentDetails(mediaUrl).url).toBe(details.url)

  const recommendations = assert_pager(details.getContentRecommendations(), 'timed recommendations')
  expect(recommendations.every((recommendation) => recommendation.url !== details.url)).toBe(true)

  await assert_first_media_reachable(details, 'timed details')
})

test('qurancom channels and playlists work', () => {
  set_settings({ homeMode: '0' })
  const root = assert_channel(source.getChannel('https://quran.com'), 'root channel')
  assert_pager(source.getChannelContents(root.url, null, Type.Order.Chronological, null), 'root contents')

  const channel = assert_channel(assert_pager(source.searchChannels('عبد الباسط'), 'reciter channel search')[0], 'reciter channel')
  expect(source.isChannelUrl(channel.url)).toBe(true)
  assert_pager(source.getChannelContents(channel.url, null, Type.Order.Chronological, { surah: 'الفاتحة (1)' }), 'channel contents')
  assert_pager(source.searchChannelContents(channel.url, 'الفاتحة', null, Type.Order.Chronological, null), 'channel-local surah search')
  expect(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const playlist = assert_playlist(
    source.searchPlaylists('', null, Type.Order.Chronological, {
      reciter: channel.name
    }).results[0],
    'reciter playlist'
  )
  expect(source.isPlaylistUrl(playlist.url)).toBe(true)
  expect(playlist.videoCount).toBeGreaterThan(1)
  const details = assert_playlist(source.getPlaylist(playlist.url), 'playlist details')
  expect(details.videoCount).toBeGreaterThan(1)
  expect(assert_pager(details.contents, 'playlist contents')[0].url).toMatch(/^qurancom:\/\/timed\//)
  expect(source.getPlaylist(`${playlist.url}/1`).videoCount).toBe(details.videoCount)
})

test('qurancom saved state restores catalog', () => {
  set_settings({})
  assert_pager(source.getHome(), 'home before save')
  const saved = source.saveState()
  expect(Number(JSON.parse(saved).catalogFetchedAt)).toBeGreaterThan(0)

  source.enable(runtime.config, { language: '0', homeMode: '0' }, saved)
  assert_pager(source.getHome(), 'home after restore')
})
