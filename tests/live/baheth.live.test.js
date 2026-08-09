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

const runtime = await load_plugin('baheth')
const { source } = runtime

const speakerUrl = 'baheth://speaker/أحمد-عبدالمنعم'
const playlistPublicUrl = 'https://baheth.ieasybooks.com/ar/playlists/خطب-الجمعة-د-أحمد-عبد-المنعم'
const mediaPublicUrl = 'https://baheth.ieasybooks.com/ar/media/اللياقة-الإيمانية-خطبة-د-أحمد-عبد-المنعم'

test('baheth exposes home, capabilities, search, and suggestions', () => {
  expect(source.saveState()).toBe('{}')

  const capabilities = source.getSearchCapabilities()
  expect(capabilities.types).toContain(runtime.Type.Feed.Mixed)
  expect(capabilities.sorts).toContain(runtime.Type.Order.Chronological)
  expect(source.searchSuggestions('ال')).toContain('القرآن')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^baheth:\/\/media\//)

  const search = assert_pager(source.search('القرآن', null, null, null), 'search')
  expect(search.some((item) => item.url.startsWith('baheth://media/'))).toBe(true)

  const channels = assert_pager(source.searchChannels('أحمد'), 'speaker search')
  expect(channels.some((item) => decodeURIComponent(item.url) === speakerUrl)).toBe(true)

  const playlists = assert_pager(source.searchPlaylists('خطب الجمعة', null, null, null), 'playlist search')
  expect(playlists.some((item) => item.name.includes('خطب الجمعة'))).toBe(true)
})

test('baheth resolves media details to reachable WebM audio with chapters and subtitles', async () => {
  const details = assert_details(source.getContentDetails(mediaPublicUrl), 'media details')
  expect(details.name).toContain('اللياقة')
  expect(details.author.name).toContain('أحمد')
  expect(assert_has_media(details, 'media details')[0]).toMatchObject({ container: 'audio/webm' })
  expect(details.subtitles?.[0]).toMatchObject({ format: 'text/vtt', language: 'ar' })
  expect(details.description).toContain('YouTube:')

  const chapters = source.getContentChapters(details.url)
  expect(chapters.length).toBeGreaterThan(10)
  expect(chapters.every((chapter) => chapter.timeEnd > chapter.timeStart)).toBe(true)

  const recommendations = assert_pager(details.getContentRecommendations(), 'media recommendations')
  expect(recommendations.every((item) => item.url !== details.url)).toBe(true)

  const nonLocalized = assert_details(
    source.getContentDetails(mediaPublicUrl.replace('https://baheth.ieasybooks.com/ar/', 'https://baheth.ieasybooks.com/')),
    'non-localized media details'
  )
  expect(nonLocalized.url).toBe(details.url)

  await assert_first_media_reachable(details, 'media details')
})

test('baheth resolves playlist details and playlist tracks', async () => {
  const playlist = assert_playlist(source.getPlaylist(playlistPublicUrl), 'playlist')
  expect(playlist.name).toContain('خطب الجمعة')
  const contents = assert_pager(playlist.contents, 'playlist contents')
  expect(contents.length).toBeGreaterThan(10)

  const details = assert_details(source.getContentDetails(contents[0].url), 'playlist first media')
  await assert_first_media_reachable(details, 'playlist first media')
})

test('baheth supports speaker channels, channel playlists, and scoped search', () => {
  const channel = assert_channel(source.getChannel(speakerUrl), 'speaker channel')
  expect(channel.name).toContain('أحمد')

  const playlists = assert_pager(source.getChannelPlaylists(speakerUrl), 'speaker playlists')
  expect(playlists[0].url).toMatch(/^baheth:\/\/playlist\//)

  const contents = assert_pager(source.getChannelContents(speakerUrl, null, null, null), 'speaker contents')
  expect(contents[0].url).toMatch(/^baheth:\/\/media\//)

  const scoped = assert_pager(source.searchChannelContents(speakerUrl, 'القرآن', null, null, null), 'speaker search')
  expect(scoped[0].url).toMatch(/^baheth:\/\/media\//)
})
