import { expect, test } from 'vitest'
import {
  assert_channel,
  assert_details,
  assert_first_media_reachable,
  assert_has_media,
  assert_item,
  assert_next_page,
  assert_pager,
  assert_playlist,
  find_by_url_part,
  first_filter_value
} from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('mp3quran', { language: '0', homeMode: '0' })
const { source, Type } = runtime

function set_settings(settings) {
  source.enable(runtime.config, { language: '0', ...settings }, null)
}

function representative_reciter_name() {
  return assert_pager(source.searchChannels('إبراهيم الأخضر'), 'representative reciter search')[0].name
}

test('mp3quran home modes return content', () => {
  for (const homeMode of ['0', '1', '2', '3', '4', '5']) {
    set_settings({ homeMode })
    const items = assert_pager(source.getHome(), `home mode ${homeMode}`)
    assert_item(items[0], `home mode ${homeMode} first item`)
  }
})

test('mp3quran search capabilities expose localized readable filters', () => {
  set_settings({})
  const capabilities = source.getSearchCapabilities()
  expect(
    capabilities.filters.some((filter) => filter.id === 'content'),
    'expected content filter'
  ).toBe(true)
  expect(
    capabilities.filters.some((filter) => filter.id === 'reciter'),
    'expected reciter filter'
  ).toBe(true)
  expect(
    capabilities.filters.some((filter) => filter.id === 'surah'),
    'expected surah filter'
  ).toBe(true)
  expect(
    capabilities.filters.some((filter) => filter.id === 'riwayah'),
    'expected riwayah filter'
  ).toBe(true)
  expect(first_filter_value(capabilities, 'surah')).toMatch(/\(\d+\)$/)
  expect(first_filter_value(capabilities, 'reciter')).not.toMatch(/^\d+$/)
  expect(first_filter_value(capabilities, 'riwayah')).not.toMatch(/^\d+$/)
})

test('mp3quran suggestions and saved state restore work', () => {
  set_settings({})
  const suggestions = source.searchSuggestions('إبراهيم')
  expect(suggestions.length, 'expected search suggestions').toBeGreaterThan(0)
  expect(suggestions.length, 'expected capped search suggestions').toBeLessThanOrEqual(10)

  const saved_state = source.saveState()
  expect(() => JSON.parse(saved_state), 'expected valid saved state JSON').not.toThrow()
  source.enable(runtime.config, { language: '0', homeMode: '0' }, saved_state)
  assert_pager(source.getHome(), 'home after saved state restore')
})

const deep_test = process.env.LIVE_TEST_DEEP ? test : test.skip

deep_test('mp3quran non-arabic catalog and tafsir fallback work', () => {
  source.enable(runtime.config, { language: '1', homeMode: '1' }, null)
  assert_pager(source.getHome(), 'english recitations home')
  assert_pager(source.search('', null, Type.Order.Chronological, { content: 'tafsir', surah: 'Al-Fatihah (1)' }), 'english tafsir fallback')
})

test('mp3quran search covers tracks, radios, live tv, tafsir, and videos', async () => {
  set_settings({})
  const reciter = representative_reciter_name()
  const track = assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'tracks', reciter, surah: 'الفاتحة (1)' }),
    'track search'
  )[0]
  const radio = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'radios' }), 'radio search')[0]
  const live_tv = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'live-tv' }), 'live tv search')[0]
  const tafsir = assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'tafsir', surah: 'الفاتحة (1)' }),
    'tafsir search'
  )[0]
  const video = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'videos' }), 'video search')[0]

  for (const [label, item] of [
    ['track', track],
    ['radio', radio],
    ['live tv', live_tv],
    ['tafsir', tafsir],
    ['video', video]
  ]) {
    const details = assert_details(source.getContentDetails(item.url), `${label} details`)
    assert_has_media(details, `${label} details`)
  }

  await assert_first_media_reachable(source.getContentDetails(track.url), 'track details')
  await assert_first_media_reachable(source.getContentDetails(tafsir.url), 'tafsir details')
  await assert_first_media_reachable(source.getContentDetails(video.url), 'video details')
})

test('mp3quran filter branches cover riwayah, video type, tafsir source, and video reciter', () => {
  set_settings({})
  const capabilities = source.getSearchCapabilities()
  const riwayah = first_filter_value(capabilities, 'riwayah')
  const video_type = first_filter_value(capabilities, 'video-type')
  const tafsir_source = first_filter_value(capabilities, 'tafsir-source')
  const reciter = representative_reciter_name()
  const video = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'videos' }), 'video search')[0]

  assert_pager(source.search('', null, Type.Order.Chronological, { content: 'tracks', reciter, riwayah }), 'riwayah-filtered tracks')
  assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'videos', 'video-type': video_type }),
    'video-type-filtered videos'
  )
  assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'tafsir', 'tafsir-source': tafsir_source, surah: 'الفاتحة (1)' }),
    'tafsir-source-filtered tafsir'
  )
  assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'videos', reciter: video.author.name }),
    'reciter-filtered videos'
  )
})

test('mp3quran reciter channels, channel contents, peeks, and channel playlists work', () => {
  set_settings({})
  const root = assert_channel(source.getChannel('https://mp3quran.net'), 'root channel')
  assert_pager(source.getChannelContents(root.url, null, Type.Order.Chronological, null), 'root channel contents')
  expect(
    source.getChannelCapabilities().filters.some((filter) => filter.id === 'surah'),
    'expected channel surah filter'
  ).toBe(true)
  expect(
    source.getSearchChannelContentsCapabilities().filters.some((filter) => filter.id === 'riwayah'),
    'expected channel riwayah filter'
  ).toBe(true)

  const channels = assert_pager(source.searchChannels(''), 'reciter channel search')
  const channel = assert_channel(channels[0], 'first reciter channel')
  expect(source.isChannelUrl(channel.url)).toBe(true)

  const details = assert_channel(source.getChannel(channel.url), 'reciter channel details')
  assert_pager(source.getChannelContents(details.url, null, Type.Order.Chronological, { surah: 'الفاتحة (1)' }), 'reciter channel contents')
  expect(
    source.peekChannelContents(details.url, source.getPeekChannelTypes()[0]).length,
    'expected reciter channel peek contents'
  ).toBeGreaterThan(0)
  assert_pager(
    source.searchChannelContents(details.url, '', null, Type.Order.Chronological, { surah: 'الفاتحة (1)' }),
    'reciter channel search'
  )
  assert_pager(source.getChannelPlaylists(details.url), 'reciter channel playlists')
})

test('mp3quran playlists cover moshaf, tafsir, and video type contents', () => {
  set_settings({})
  const capabilities = source.getSearchCapabilities()
  const tafsir_source = first_filter_value(capabilities, 'tafsir-source')
  const video_type = first_filter_value(capabilities, 'video-type')
  const reciter_channel = assert_pager(source.searchChannels('إبراهيم الأخضر'), 'representative reciter search')[0]
  const moshaf_playlist = assert_pager(source.getChannelPlaylists(reciter_channel.url), 'moshaf playlists')[0]
  const tafsir_playlist = assert_pager(
    source.searchPlaylists('', null, Type.Order.Chronological, { content: 'tafsir', 'tafsir-source': tafsir_source }),
    'tafsir playlists'
  )[0]
  const video_playlist = assert_pager(
    source.searchPlaylists('', null, Type.Order.Chronological, { content: 'videos', 'video-type': video_type }),
    'video playlists'
  )[0]

  for (const [label, playlist] of [
    ['moshaf', moshaf_playlist],
    ['tafsir', tafsir_playlist],
    ['video type', video_playlist]
  ]) {
    assert_playlist(playlist, `${label} playlist`)
    expect(source.isPlaylistUrl(playlist.url)).toBe(true)
    const details = assert_playlist(source.getPlaylist(playlist.url), `${label} playlist details`)
    assert_pager(details.contents, `${label} playlist contents`)
    assert_next_page(details.contents, `${label} playlist contents`)
  }
})

test('mp3quran array pagination and recommendations work', () => {
  set_settings({})
  const reciter = representative_reciter_name()
  assert_next_page(source.search('', null, Type.Order.Chronological, { content: 'tracks', reciter }), 'reciter track search')

  const item = assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'tracks', reciter, surah: 'الفاتحة (1)' }),
    'track search'
  )[0]
  const details = source.getContentDetails(item.url)
  const recommendations = assert_pager(details.getContentRecommendations(), 'track recommendations')
  expect(
    recommendations.every((recommendation) => recommendation.url !== details.url),
    'recommendations should not include current item'
  ).toBe(true)
})

test('mp3quran tafsir and video recommendations return pagers', () => {
  set_settings({})
  const tafsir = source.getContentDetails(
    assert_pager(source.search('', null, Type.Order.Chronological, { content: 'tafsir', surah: 'الفاتحة (1)' }), 'tafsir search')[0].url
  )
  const tafsir_recommendations = tafsir.getContentRecommendations()
  expect(Array.isArray(tafsir_recommendations.results), 'tafsir recommendations should return a pager').toBe(true)

  const video = source.getContentDetails(
    assert_pager(source.search('', null, Type.Order.Chronological, { content: 'videos' }), 'video search')[0].url
  )
  const video_recommendations = assert_pager(video.getContentRecommendations(), 'video recommendations')
  expect(
    video_recommendations.every((recommendation) => recommendation.url !== video.url),
    'video recommendations should not include current item'
  ).toBe(true)
})

test('mp3quran chapters and subtitles are available for a timed recitation', () => {
  set_settings({})
  const items = assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'tracks', reciter: 'إبراهيم الأخضر', surah: 'الفاتحة (1)' }),
    'timed reciter search'
  )
  const timed = find_by_url_part(items, '/1') ?? items[0]
  const details = source.getContentDetails(timed.url)
  const chapters = source.getContentChapters(details.url)

  expect(details.subtitles?.length, 'expected Quran text subtitle track').toBeGreaterThan(0)
  const subtitle_payload = decodeURIComponent(details.subtitles[0].url.replace(/^data:text\/vtt;charset=utf-8,/, ''))
  expect(subtitle_payload).toMatch(/^WEBVTT/)
  expect(subtitle_payload).toMatch(/الْحَمْد/)
  expect(chapters.length, 'expected Al-Fatihah ayah chapters').toBeGreaterThanOrEqual(7)
  expect(
    chapters.every((chapter) => chapter.timeEnd > chapter.timeStart),
    'expected chapter end after start'
  ).toBe(true)
})

test('mp3quran invalid detail urls fail cleanly', () => {
  set_settings({})
  expect(source.isContentDetailsUrl('mp3quran://track/999999/999999/1')).toBe(true)
  expect(() => source.getContentDetails('mp3quran://track/999999/999999/1')).toThrow(/Track not found/)
  expect(source.isPlaylistUrl('mp3quran://playlist/moshaf/999999/999999')).toBe(true)
  expect(() => source.getPlaylist('mp3quran://playlist/moshaf/999999/999999')).toThrow(/Moshaf playlist not found/)
})
