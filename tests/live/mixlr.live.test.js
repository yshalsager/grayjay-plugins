import { expect, test } from 'vitest'
import { assert_channel, assert_details, assert_has_media, assert_pager } from '@tests/live/assertions.js'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin('mixlr')
const { source } = runtime
let fixture

function live_fixture() {
  if (!fixture) {
    const item = assert_pager(source.getHome(), 'home')[0]
    fixture = {
      item,
      eventUrl: item.shareUrl,
      channelUrl: String(item.shareUrl).replace(/\/events\/\d+.*$/, '')
    }
  }
  return fixture
}

test('mixlr exposes useful live capabilities and a non-empty home feed', () => {
  const capabilities = source.getSearchCapabilities()

  expect(capabilities.filters.some((filter) => filter.id === 'content')).toBe(true)
  expect(capabilities.filters.some((filter) => filter.id === 'category')).toBe(true)
  expect(source.searchSuggestions('rad')).toContain('radio')
  assert_pager(source.getHome(), 'home')
})

test('mixlr direct public event URL resolves to playable live MP3 details', () => {
  const { eventUrl } = live_fixture()
  expect(source.isContentDetailsUrl(eventUrl)).toBe(true)

  const details = assert_details(source.getContentDetails(eventUrl), 'direct event details')
  const sources = assert_has_media(details, 'direct event details')

  expect(details.isLive).toBe(true)
  expect(details.duration).toBe(-1)
  expect(sources[0]).toMatchObject({
    container: 'audio/mpeg',
    codec: 'mp3',
    duration: -1
  })
  expect(sources[0].url).toMatch(/^https:\/\/listen\.mixlr\.com\//)
})

test('mixlr channel URLs expose channel metadata, contents, peeks, and recommendations', () => {
  const { channelUrl } = live_fixture()
  expect(source.isChannelUrl(channelUrl)).toBe(true)

  const channel = assert_channel(source.getChannel(channelUrl), 'live channel')
  expect(channel.url).toMatch(/^mixlr:\/\/channel\//)

  const current = assert_pager(source.getChannelContents(channel.url, null, null, null), 'channel contents')[0]
  expect(current.isLive).toBe(true)
  expect(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0]).length).toBeGreaterThan(0)

  const recommendations = current.getContentRecommendations()
  expect(Array.isArray(recommendations.results)).toBe(true)
  expect(recommendations.results.every((item) => item.url !== current.url)).toBe(true)
})

test('mixlr search finds live events and channel search returns channels', () => {
  const search = assert_pager(source.search('radio', null, null, null), 'radio search')
  expect(search.some((item) => item.isLive && /^mixlr:\/\/event\//.test(item.url))).toBe(true)

  const channels = assert_pager(source.searchChannels('radio'), 'channel search')
  expect(channels.some((channel) => /^mixlr:\/\/channel\//.test(channel.url))).toBe(true)
})

test('mixlr playlist surface is intentionally empty for live-only v1', () => {
  const { eventUrl, channelUrl } = live_fixture()
  expect(source.isPlaylistUrl(eventUrl)).toBe(false)
  expect(source.searchPlaylists('radio').results).toEqual([])
  expect(source.getChannelPlaylists(channelUrl).results).toEqual([])
})
