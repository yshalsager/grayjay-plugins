import { expect, test } from 'vitest'
import { assert_channel, assert_details, assert_has_media, assert_pager, assert_playlist, media_sources } from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('archiveorg')
const { source, Type } = runtime

test('archiveorg home is intentionally empty and capabilities expose sort/filter controls', () => {
  expect(source.getHome().results.length, 'Archive.org should not expose a home feed').toBe(0)
  expect(source.search('', null, null, null).results.length, 'blank search should stay empty without filters').toBe(0)

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.sorts.includes(Type.Order.Chronological), 'expected chronological sort').toBe(true)
  expect(capabilities.sorts.includes(Type.Order.Popularity), 'expected popularity sort').toBe(true)
  expect(
    capabilities.filters.some((filter) => filter.id === 'content'),
    'expected content filter'
  ).toBe(true)
})

test('archiveorg search applies relevance, sort, and media filters', () => {
  const relevance = assert_pager(source.search('NASA', null, null, null), 'relevance search')
  const chronological = assert_pager(source.search('NASA', null, Type.Order.Chronological, null), 'chronological search')
  const popularity = assert_pager(source.search('NASA', null, Type.Order.Popularity, null), 'popularity search')
  const audio = assert_pager(source.search('NASA', null, null, { content: 'audio' }), 'audio search')[0]
  const video = assert_pager(source.search('moon', null, null, { content: 'video' }), 'video search')[0]

  expect(relevance[0].url, 'chronological sort should affect result order').not.toBe(chronological[0].url)
  expect(relevance[0].url, 'popularity sort should affect result order').not.toBe(popularity[0].url)
  expect(audio.url).toMatch(/\/audio$/)
  expect(video.url).toMatch(/\/video$/)

  const details = assert_details(source.getContentDetails(video.url), 'video details')
  expect(details.url).toBe(video.url)
  const videoSources = assert_has_media(details, 'video details')
  expect(videoSources[0].url).toMatch(/^https:\/\/archive\.org\/download\//)
})

test('archiveorg public details URLs open as quick content details, not playlists', () => {
  const url = 'https://archive.org/details/sadek_abdo_yahoo_033_20180316_2015'

  expect(source.isContentDetailsUrl(url)).toBe(true)
  expect(source.isPlaylistUrl(url)).toBe(false)

  const details = assert_details(source.getContentDetails(url), 'public details URL')
  expect(details.url).toBe(url)
  assert_has_media(details, 'public details URL')
  const urls = media_sources(details).map((source) => source.url)
  expect(urls[0]).toBe('https://archive.org/download/sadek_abdo_yahoo_033_20180316_2015/033.mp3')
  expect(
    urls.some((sourceUrl) => /^https:\/\/ia\d+.*\.archive\.org\/\d+\/items\/sadek_abdo_yahoo_033_20180316_2015\/033\.mp3$/.test(sourceUrl))
  ).toBe(true)
  expect(details.video.videoSources.length).toBe(0)
  expect(details.video.audioSources[0]).toMatchObject({
    container: 'audio/mpeg',
    codec: 'mp3',
    language: 'Unknown'
  })
  expect(details.video.audioSources[0].bitrate).toBeGreaterThan(0)
  expect(details.video.audioSources[1].bitrate).toBeGreaterThan(0)
})

test('archiveorg public Quran video details prefer playable MP4 video when available', () => {
  const details = assert_details(
    source.getContentDetails('https://archive.org/details/quranarabicenglishmp4'),
    'public Quran video details URL'
  )
  const videoSources = assert_has_media(details, 'public Quran video details URL')

  expect(details.video.audioSources ?? []).toHaveLength(0)
  expect(videoSources[0]).toMatchObject({
    container: 'video/mp4',
    codec: 'h264'
  })
  expect(videoSources[0].url).toMatch(/^https:\/\/archive\.org\/download\/.*\.mp4$/)
})

test('archiveorg public Quran video details prefer MP4 video when available', () => {
  const details = assert_details(source.getContentDetails('https://archive.org/details/87.877'), 'public Quran MP4 video details URL')
  const videoSources = assert_has_media(details, 'public Quran MP4 video details URL')

  expect(videoSources[0]).toMatchObject({
    container: 'video/mp4',
    codec: 'h264'
  })
  expect(videoSources[0].url).toMatch(/^https:\/\/archive\.org\/download\/.*\.mp4$/)
})

test('archiveorg public Quran MP3-only details expose the original MP3 source', () => {
  const details = assert_details(
    source.getContentDetails('https://archive.org/details/21_20201019_20201019'),
    'public Quran MP3 details URL'
  )
  const audioSources = assert_has_media(details, 'public Quran MP3 details URL')

  expect(details.video.videoSources ?? []).toHaveLength(0)
  expect(audioSources[0]).toMatchObject({
    container: 'audio/mpeg',
    codec: 'mp3'
  })
  expect(audioSources[0].bitrate).toBeGreaterThan(0)
  expect(audioSources[0].url).toMatch(/^https:\/\/archive\.org\/download\/.*\.mp3$/)
})

test('archiveorg creator channels expose contents, scoped search, peeks, and playlists', () => {
  assert_pager(source.searchChannels('NASA'), 'creator search')
  const channel = assert_channel(source.getChannel('archiveorg://creator/NASA%20TV'), 'creator channel')
  expect(source.isChannelUrl(channel.url)).toBe(true)
  expect(source.getChannel(channel.url).url).toBe(channel.url)

  assert_pager(source.getChannelContents(channel.url, null, Type.Order.Chronological, null), 'channel contents')
  assert_pager(source.searchChannelContents(channel.url, 'moon', null, Type.Order.Popularity, { content: 'video' }), 'channel search')
  expect(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0]).length, 'expected channel peek contents').toBeGreaterThan(
    0
  )

  const playlist = assert_playlist(assert_pager(source.getChannelPlaylists(channel.url), 'channel playlists')[0], 'channel playlist')
  assert_pager(source.getPlaylist(playlist.url).contents, 'channel playlist contents')
})

test('archiveorg playlist search only returns playlists with concrete playable contents', () => {
  const playlist = assert_playlist(
    assert_pager(
      source.searchPlaylists('Holy Quran Translation Arabic English Mishary MP4', null, Type.Order.Popularity, { content: 'video' }),
      'playlist search'
    )[0],
    'search playlist'
  )
  const details = assert_playlist(source.getPlaylist(playlist.url), 'playlist details')
  assert_pager(details.contents, 'playlist contents')
})
