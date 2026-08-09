import { expect, test } from 'vitest'
import { assert_channel, assert_details, assert_has_media, assert_pager, assert_playlist } from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('islamweb-audio')
const { source } = runtime

test('islamweb audio exposes home, capabilities, search, and suggestions', () => {
  expect(source.saveState()).toBe('{}')
  expect(source.getSearchCapabilities().filters.map((filter) => filter.id)).toContain('tab')
  expect(source.searchSuggestions('ال')).toContain('القرآن')

  const home = assert_pager(source.getHome(), 'home')
  expect(home[0].url).toMatch(/^islamweb-audio:\/\/audio\//)

  const search = assert_pager(source.search('التوحيد', null, null, null), 'search')
  expect(search[0].url).toMatch(/^islamweb-audio:\/\/audio\//)
})

test('islamweb audio resolves Quran and lecture details to MP3 media', () => {
  const quran = assert_details(
    source.getContentDetails('https://audio.islamweb.net/audio/index.php?page=audioinfo&audioid=673662'),
    'quran details'
  )
  expect(quran.name).toContain('سورة')
  expect(assert_has_media(quran, 'quran details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })

  const lecture = assert_details(
    source.getContentDetails('https://audio.islamweb.net/audio/index.php?page=audioinfo&audioid=177536'),
    'lecture details'
  )
  expect(lecture.name).toContain('سنن')
  expect(assert_has_media(lecture, 'lecture details')[0]).toMatchObject({ container: 'audio/mpeg', codec: 'mp3' })
})

test('islamweb audio supports reader and speaker channels', () => {
  const reader = assert_channel(source.getChannel('islamweb-audio://reader/1762/محمد%20مكي'), 'reader channel')
  expect(reader.name).toContain('محمد')
  const readerContents = assert_pager(source.getChannelContents(reader.url, null, null, null), 'reader contents')
  expect(readerContents.length).toBeGreaterThan(10)

  const speaker = assert_channel(source.getChannel('islamweb-audio://speaker/1265/مجدي%20عرفات'), 'speaker channel')
  const speakerContents = assert_pager(source.getChannelContents(speaker.url, null, null, null), 'speaker contents')
  expect(speakerContents[0].url).toMatch(/^islamweb-audio:\/\/audio\//)
})

test('islamweb audio supports reader and lecture series playlists', () => {
  const readerPlaylist = assert_playlist(source.getPlaylist('islamweb-audio://reader/1762/محمد%20مكي'), 'reader playlist')
  const readerContents = assert_pager(readerPlaylist.contents, 'reader playlist contents')
  expect(readerContents.length).toBeGreaterThan(10)

  const series = assert_playlist(source.getPlaylist('islamweb-audio://series/1265/1094'), 'series playlist')
  const seriesContents = assert_pager(series.contents, 'series contents')
  expect(seriesContents[0].url).toMatch(/^islamweb-audio:\/\/audio\//)
})
