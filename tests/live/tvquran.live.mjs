import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assert_channel,
  assert_details,
  assert_first_media_reachable,
  assert_has_media,
  assert_item,
  assert_next_page,
  assert_pager,
  assert_playlist,
  first_filter_value
} from './assertions.mjs'
import { load_plugin } from './harness/grayjay-runtime.mjs'

const runtime = await load_plugin('tvquran', { language: '0', homeMode: '0' })
const { source, Type } = runtime

function set_settings(settings) {
  source.enable(runtime.config, { language: '0', ...settings }, null)
}

test('tvquran home modes return content', () => {
  for (const homeMode of ['0', '1', '2', '3', '4']) {
    set_settings({ homeMode })
    const items = assert_pager(source.getHome(), `home mode ${homeMode}`)
    assert_item(items[0], `home mode ${homeMode} first item`)
  }
})

test('tvquran search capabilities expose readable filters', () => {
  set_settings({})
  const capabilities = source.getSearchCapabilities()
  assert.ok(
    capabilities.filters.some((filter) => filter.id === 'content'),
    'expected content filter'
  )
  assert.ok(
    capabilities.filters.some((filter) => filter.id === 'category'),
    'expected category filter'
  )
  assert.ok(
    capabilities.filters.some((filter) => filter.id === 'reciter'),
    'expected reciter filter'
  )
  assert.ok(
    capabilities.filters.some((filter) => filter.id === 'surah'),
    'expected surah filter'
  )
  assert.match(first_filter_value(capabilities, 'surah'), /\(\d+\)$/)
  assert.doesNotMatch(first_filter_value(capabilities, 'reciter'), /^\d+$/)
})

test('tvquran suggestions, saved state restore, languages, and settings work', () => {
  set_settings({})
  const suggestions = source.searchSuggestions('الحصري')
  assert.ok(suggestions.length > 0, 'expected search suggestions')
  assert.ok(suggestions.length <= 20, 'expected capped search suggestions')

  const saved_state = source.saveState()
  assert.doesNotThrow(() => JSON.parse(saved_state), 'expected valid saved state JSON')
  source.enable(runtime.config, { language: '0', homeMode: '0' }, saved_state)
  assert_pager(source.getHome(), 'home after saved state restore')

  source.enable(runtime.config, { language: '1', homeMode: '0', homeCategory: '1', homeSort: '1', sortDirection: '1' }, null)
  assert_pager(source.getHome(), 'english sorted category home')
  assert.ok(source.getChannel('https://tvquran.com').urlAlternatives[0].includes('/en'), 'expected English root alternative')

  source.enable(runtime.config, { language: '2', homeMode: '3', reciterSort: '1' }, null)
  assert_pager(source.getHome(), 'german reciter home')
  assert.ok(source.getChannel('https://tvquran.com').urlAlternatives[0].includes('/de'), 'expected German root alternative')
})

test('tvquran search covers selections, recitations, videos, prayer videos, and live videos', async () => {
  set_settings({})
  const selection = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'selections' }), 'selection search')[0]
  const recitation = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'recitations' }), 'recitation search')[0]
  const video = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'videos' }), 'video search')[0]
  const prayer_video = assert_pager(
    source.search('', null, Type.Order.Chronological, { content: 'prayer-videos' }),
    'prayer video search'
  )[0]
  const live_video = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'live-videos' }), 'live video search')[0]

  for (const [label, item] of [
    ['selection', selection],
    ['recitation', recitation],
    ['video', video],
    ['prayer video', prayer_video],
    ['live video', live_video]
  ]) {
    const details = assert_details(source.getContentDetails(item.url), `${label} details`)
    assert_has_media(details, `${label} details`)
  }

  await assert_first_media_reachable(source.getContentDetails(selection.url), 'selection details')
})

test('tvquran filter branches cover category, reciter, and surah', () => {
  set_settings({})
  const capabilities = source.getSearchCapabilities()
  const category = first_filter_value(capabilities, 'category')
  const recitation = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'recitations' }), 'recitation search')[0]
  const reciter = recitation.author.name

  assert_pager(source.search('', null, Type.Order.Chronological, { content: 'selections', category }), 'category-filtered selections')
  assert_pager(source.search('', null, Type.Order.Chronological, { content: 'recitations', reciter }), 'reciter-filtered recitations')
  assert_pager(
    source.search('الفاتحة', null, Type.Order.Chronological, { content: 'recitations', surah: 'الفاتحة (1)' }),
    'surah-filtered recitations'
  )
})

test('tvquran channels cover root, categories, video categories, reciters, and collections', () => {
  set_settings({})
  const root = assert_channel(source.getChannel('https://tvquran.com'), 'root channel')
  assert_pager(source.getChannelContents(root.url, null, Type.Order.Chronological, null), 'root channel contents')
  assert.ok(
    source.getSearchChannelContentsCapabilities().filters.some((filter) => filter.id === 'reciter'),
    'expected channel reciter filter'
  )

  const channel_pager = assert_pager(source.searchChannels(''), 'channel search')
  assert_next_page(source.searchChannels(''), 'channel search pagination')
  const category_channel = assert_channel(
    channel_pager.find((channel) => channel.url.startsWith('tvquran://category/')),
    'category channel'
  )
  const video_channel = assert_channel(
    channel_pager.find((channel) => channel.url.startsWith('tvquran://video-category/')),
    'video category channel'
  )
  const reciter_channel = assert_channel(
    channel_pager.find((channel) => channel.url.startsWith('tvquran://reciter/')),
    'reciter channel'
  )

  for (const [label, channel] of [
    ['category', category_channel],
    ['video category', video_channel],
    ['reciter', reciter_channel]
  ]) {
    assert.equal(source.isChannelUrl(channel.url), true)
    assert_channel(source.getChannel(channel.url), `${label} channel details`)
    assert.ok(source.peekChannelContents(channel.url, source.getPeekChannelTypes()[0]).length > 0, `${label} channel peek`)
    assert_pager(source.getChannelContents(channel.url, null, Type.Order.Chronological, null), `${label} channel contents`)
    const channel_search = source.searchChannelContents(channel.url, '', null, Type.Order.Chronological, null)
    assert.ok(Array.isArray(channel_search.results), `${label} channel search should return a pager`)
  }

  const collection_playlist = assert_pager(source.getChannelPlaylists(reciter_channel.url), 'reciter channel playlists')[0]
  const collection = assert_playlist(source.getPlaylist(collection_playlist.url), 'collection playlist details')
  const collection_channel = assert_channel(
    source.getChannel(collection.url.replace('tvquran://playlist/collection/', 'tvquran://collection/')),
    'collection channel details'
  )
  assert_pager(
    source.searchChannelContents(collection_channel.url, '', null, Type.Order.Chronological, null),
    'collection channel search contents'
  )
})

test('tvquran playlists cover categories and reciter collections', () => {
  set_settings({})
  const category_playlist = assert_pager(
    source.searchPlaylists('', null, Type.Order.Chronological, { content: 'selections' }),
    'category playlists'
  )[0]
  assert_playlist(category_playlist, 'category playlist')
  assert.equal(source.isPlaylistUrl(category_playlist.url), true)
  assert_pager(source.getPlaylist(category_playlist.url).contents, 'category playlist contents')

  const reciter_channel = assert_pager(source.searchChannels(''), 'channel search').find((channel) =>
    channel.url.startsWith('tvquran://reciter/')
  )
  const collection_playlist = assert_pager(source.getChannelPlaylists(reciter_channel.url), 'collection playlists')[0]
  assert_playlist(collection_playlist, 'collection playlist')
  assert.equal(source.isPlaylistUrl(collection_playlist.url), true)
  assert_pager(source.getPlaylist(collection_playlist.url).contents, 'collection playlist contents')
})

test('tvquran pagination works for selection and video categories', () => {
  set_settings({ sortDirection: '0' })
  assert_next_page(source.getChannelContents('tvquran://category/5', null, Type.Order.Chronological, null), 'selection category')
  assert_next_page(source.getChannelContents('tvquran://video-category/videos', null, Type.Order.Chronological, null), 'video category 11')
  assert_next_page(
    source.getChannelContents('tvquran://video-category/prayer-videos', null, Type.Order.Chronological, null),
    'video category 15'
  )
  assert_next_page(
    source.getChannelContents('tvquran://video-category/live-videos', null, Type.Order.Chronological, null),
    'video category 16'
  )
  assert_next_page(source.search('', null, Type.Order.Chronological, { content: 'recitations' }), 'recitation search pagination')
})

test('tvquran direct public URLs are accepted for details, channels, and playlists', () => {
  set_settings({})
  const selection = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'selections' }), 'selection search')[0]
  const selection_details = source.getContentDetails(selection.url)
  assert.equal(source.isContentDetailsUrl(selection_details.shareUrl), true)
  assert_details(source.getContentDetails(selection_details.shareUrl), 'public selection details')

  const category_channel = source.getChannel('tvquran://category/5')
  const public_category_url = category_channel.urlAlternatives[0]
  assert.equal(source.isChannelUrl(public_category_url), true)
  assert.equal(source.isPlaylistUrl(public_category_url), true)
  assert_channel(source.getChannel(public_category_url), 'public category channel')
  assert_playlist(source.getPlaylist(public_category_url), 'public category playlist')

  const recitation = source.getContentDetails(
    assert_pager(source.search('', null, Type.Order.Chronological, { content: 'recitations' }), 'recitation search')[0].url
  )
  assert.equal(source.isContentDetailsUrl(recitation.shareUrl), true)
  assert_details(source.getContentDetails(recitation.shareUrl), 'public recitation details')

  const nested = assert_pager(source.search('', null, Type.Order.Chronological, { content: 'videos' }), 'video search')[0]
  const video_id = nested.url.match(/tvquran:\/\/video\/(\d+)/)?.[1]
  const public_video_url = `https://tvquran.com/ar/video/${video_id}`
  assert.equal(source.isContentDetailsUrl(public_video_url), true)
  assert_details(source.getContentDetails(public_video_url), 'public video details')

  const reciter_channel = assert_pager(source.searchChannels(''), 'channel search').find((channel) =>
    channel.url.startsWith('tvquran://reciter/')
  )
  const public_reciter_url = source.getChannel(reciter_channel.url).urlAlternatives[0]
  assert.equal(source.isChannelUrl(public_reciter_url), true)
  assert_channel(source.getChannel(public_reciter_url), 'public reciter channel')

  const collection_playlist = assert_pager(source.getChannelPlaylists(reciter_channel.url), 'collection playlists')[0]
  const collection_channel = source.getChannel(collection_playlist.url.replace('tvquran://playlist/collection/', 'tvquran://collection/'))
  const public_collection_url = collection_channel.urlAlternatives[0]
  assert.equal(source.isChannelUrl(public_collection_url), true)
  assert.equal(source.isPlaylistUrl(public_collection_url), true)
  assert_channel(source.getChannel(public_collection_url), 'public collection channel')
  assert_playlist(source.getPlaylist(public_collection_url), 'public collection playlist')
})

test('tvquran recommendations work for audio and nested video items', () => {
  set_settings({})
  const selection = source.getContentDetails(
    assert_pager(source.search('', null, Type.Order.Chronological, { content: 'selections' }), 'selection search')[0].url
  )
  const selection_recommendations = selection.getContentRecommendations()
  assert.ok(Array.isArray(selection_recommendations.results), 'selection recommendations should return a pager')

  const recitation = source.getContentDetails(
    assert_pager(source.search('', null, Type.Order.Chronological, { content: 'recitations' }), 'recitation search')[0].url
  )
  const recitation_recommendations = assert_pager(recitation.getContentRecommendations(), 'recitation recommendations')
  assert.ok(
    recitation_recommendations.every((recommendation) => recommendation.url !== recitation.url),
    'recitation recommendations should not include current item'
  )

  const nested = source.getContentDetails(
    assert_pager(source.search('', null, Type.Order.Chronological, { content: 'videos' }), 'video search')[0].url
  )
  assert.ok(/^https:\/\/www\.youtube\.com\/watch\?v=/.test(nested.contentUrl), 'expected nested YouTube content URL')
  const recommendations = assert_pager(nested.getContentRecommendations(), 'nested video recommendations')
  assert.ok(
    recommendations.every((recommendation) => recommendation.url !== nested.url),
    'recommendations should not include current item'
  )
})

test('tvquran invalid detail urls fail cleanly', () => {
  set_settings({})
  assert.equal(source.isContentDetailsUrl('tvquran://selection/999999999'), true)
  assert.throws(() => source.getContentDetails('tvquran://selection/999999999'), /Selection not found|Request failed/)
  assert.equal(source.isPlaylistUrl('tvquran://playlist/category/999999999'), true)
  assert.throws(() => source.getPlaylist('tvquran://playlist/category/999999999'), /category playlist not found/)
})
