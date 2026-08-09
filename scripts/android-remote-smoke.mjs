import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { call_remote_test, update_test_plugin } from './grayjay-dev-api.mjs'
import { load_plugin_registry, select_plugins } from './plugin-registry.mjs'

const defaults = {
  serverUrl: process.env.GRAYJAY_SERVER_URL || 'http://127.0.0.1:11337',
  devUrl: process.env.GRAYJAY_DEV_URL || 'http://127.0.0.1:3000',
  plugins: ['mp3quran', 'tvquran', 'albadr', 'archiveorg']
}

const usage = `Usage:
  node scripts/android-remote-smoke.mjs [--server-url URL] [--dev-url URL] [--plugin mp3quran,tvquran,albadr,archiveorg]

Defaults:
  server URL: ${defaults.serverUrl}
  dev URL: ${defaults.devUrl}`

const results = []

export async function main(args = process.argv.slice(2)) {
  const values = parse_cli(args)
  if (values.help) {
    console.log(usage)
    return
  }

  const base = values['server-url'].replace(/\/$/, '')
  const dev_base = values['dev-url'].replace(/\/$/, '')
  const registry = await load_plugin_registry()

  await assert_ok('dev server config reachable', async () => {
    const response = await fetch(`${dev_base}/plugins/mp3quran/Mp3QuranConfig.json`)
    assert(response.ok, `expected dev server 200, got ${response.status}`)
  })

  const selected = select_plugins(registry, values.plugin.length ? values.plugin.flatMap((value) => value.split(',')) : defaults.plugins)

  for (const plugin of selected) {
    await run_plugin(plugin.value, base, dev_base, plugin)
  }

  console.log(`\n${results.length} Android remote checks passed`)
}

function parse_cli(args) {
  const { values } = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    options: {
      'server-url': { type: 'string', default: defaults.serverUrl },
      'dev-url': { type: 'string', default: defaults.devUrl },
      plugin: { type: 'string', short: 'p', multiple: true, default: [] },
      help: { type: 'boolean', short: 'h' }
    }
  })
  return values
}

async function run_plugin(id, base, dev_base, plugin) {
  current_base = base
  await assert_ok(`${id}: update test plugin`, () => update_test_plugin('android', base, plugin, dev_base))
  const rt = (method, args = []) => assert_ok(`${id}: ${method}`, () => call_remote_test(base, method, args))

  if (id === 'mp3quran') return mp3quran(rt)
  if (id === 'tvquran') return tvquran(rt)
  if (id === 'albadr') return albadr(rt)
  if (id === 'archiveorg') return archiveorg(rt)
  throw new Error(`No Android smoke coverage defined for ${id}`)
}

async function mp3quran(rt) {
  const caps = await rt('getSearchCapabilities')
  assert_filter(caps, 'content')
  assert_filter(caps, 'reciter')
  assert_filter(caps, 'surah')
  assert_filter(caps, 'riwayah')

  assert_array(await rt('searchSuggestions', ['إبراهيم']), 'suggestions')
  assert_items(await rt('getHome'), 'home')

  const track = first(await rt('search', ['', null, null, f({ content: 'tracks', surah: 'الفاتحة (1)' })]), 'track search')
  const radio = first(await rt('search', ['', null, null, f({ content: 'radios' })]), 'radio search')
  const liveTv = first(await rt('search', ['', null, null, f({ content: 'live-tv' })]), 'live tv search')
  const tafsir = first(await rt('search', ['', null, null, f({ content: 'tafsir', surah: 'الفاتحة (1)' })]), 'tafsir search')
  const video = first(await rt('search', ['', null, null, f({ content: 'videos' })]), 'video search')

  for (const [label, item] of [
    ['track details', track],
    ['radio details', radio],
    ['live tv details', liveTv],
    ['tafsir details', tafsir],
    ['video details', video]
  ]) {
    assert_media(await rt('getContentDetails', [item.url]), label)
  }

  const chapters = await rt('getContentChapters', [track.url])
  assert(Array.isArray(chapters), 'chapters should be an array')

  const channel = first(await rt('searchChannels', ['إبراهيم']), 'reciter channel search')
  assert(await rt('isChannelUrl', [channel.url]), 'reciter channel URL should be recognized')
  assert_items(await rt('getChannelContents', [channel.url, null, null, f({ surah: 'الفاتحة (1)' })]), 'reciter channel contents')

  const playlistUrl = 'mp3quran://playlist/tafsir/1'
  assert(await rt('isPlaylistUrl', [playlistUrl]), 'tafsir playlist URL should be recognized')
  await expect_serializer_limit('mp3quran: getPlaylist serializer limit', () => call_remote_test_for_limit('getPlaylist', [playlistUrl]))
  await expect_serializer_limit('mp3quran: searchPlaylists serializer limit', () =>
    call_remote_test_for_limit('searchPlaylists', ['', null, null, f({ content: 'tafsir' })])
  )
}

async function tvquran(rt) {
  const caps = await rt('getSearchCapabilities')
  assert_filter(caps, 'content')
  assert_filter(caps, 'category')
  assert_filter(caps, 'reciter')
  assert_filter(caps, 'surah')

  assert_array(await rt('searchSuggestions', ['الحصري']), 'suggestions')
  assert_items(await rt('getHome'), 'home')

  const selection = first(await rt('search', ['', null, null, f({ content: 'selections' })]), 'selection search')
  const recitation = first(await rt('search', ['', null, null, f({ content: 'recitations' })]), 'recitation search')
  const video = first(await rt('search', ['', null, null, f({ content: 'videos' })]), 'video search')
  const prayerVideo = first(await rt('search', ['', null, null, f({ content: 'prayer-videos' })]), 'prayer video search')
  const liveVideo = first(await rt('search', ['', null, null, f({ content: 'live-videos' })]), 'live video search')

  for (const [label, item] of [
    ['selection details', selection],
    ['recitation details', recitation]
  ]) {
    assert_media(await rt('getContentDetails', [item.url]), label)
  }

  for (const [label, item] of [
    ['video', video],
    ['prayer video', prayerVideo],
    ['live video', liveVideo]
  ]) {
    assert_nested_media(item, `${label} feed item`)
    assert_web_details(await rt('getContentDetails', [item.url]), `${label} details`)
  }

  const channels = await rt('searchChannels', [''])
  const reciterChannel = first(
    channels.filter((item) => String(item.url).startsWith('tvquran://reciter/')),
    'reciter channel search'
  )
  assert(await rt('isChannelUrl', [reciterChannel.url]), 'reciter channel URL should be recognized')
  assert_items(await rt('getChannelContents', [reciterChannel.url, null, null, null]), 'reciter channel contents')
  assert_items(await rt('searchChannelContents', [reciterChannel.url, '', null, null, null]), 'reciter channel search contents')

  const playlistUrl = 'tvquran://playlist/category/5'
  assert(await rt('isPlaylistUrl', [playlistUrl]), 'category playlist URL should be recognized')
  await expect_serializer_limit('tvquran: getPlaylist serializer limit', () => call_remote_test_for_limit('getPlaylist', [playlistUrl]))
  await expect_serializer_limit('tvquran: searchPlaylists serializer limit', () =>
    call_remote_test_for_limit('searchPlaylists', ['', null, null, f({ content: 'selections' })])
  )
}

async function albadr(rt) {
  const caps = await rt('getSearchCapabilities')
  assert_filter(caps, 'content')
  assert_array(await rt('searchSuggestions', ['تو']), 'suggestions')
  assert_items(await rt('getHome'), 'home')

  assert_media(await rt('getContentDetails', ['https://www.al-badr.net/detail/BXrdatJsQH']), 'direct detail')
  assert(await rt('isContentDetailsUrl', ['https://www.al-badr.net/streaming']), 'streaming URL should be content')
  const live = await rt('getContentDetails', ['https://www.al-badr.net/streaming'])
  assert(String(live.html ?? '').includes('mixlr.com'), 'live details should expose Mixlr web embed')

  const channel = await rt('getChannel', ['https://www.al-badr.net/category/9'])
  assert(channel.url === 'albadr://category/9', 'category channel should normalize')
  assert_items(await rt('getChannelContents', [channel.url, null, null, null]), 'category contents')

  await expect_serializer_limit('albadr: getPlaylist serializer limit', () =>
    call_remote_test_for_limit('getPlaylist', ['https://www.al-badr.net/sub/33'])
  )
  assert_items(await rt('search', ['التوحيد', null, null, null]), 'search')
}

async function archiveorg(rt) {
  const caps = await rt('getSearchCapabilities')
  assert_filter(caps, 'content')

  const home = await rt('getHome')
  assert(Array.isArray(home) && home.length === 0, 'Archive.org home should be empty')

  assert_items(await rt('search', ['NASA', null, null, null]), 'search')
  const audio = first(await rt('search', ['NASA', null, null, f({ content: 'audio' })]), 'audio search')
  const video = first(await rt('search', ['moon', null, null, f({ content: 'video' })]), 'video search')
  assert_media(await rt('getContentDetails', [audio.url]), 'audio details')
  assert_media(await rt('getContentDetails', [video.url]), 'video details')

  const publicAudio = 'https://archive.org/details/sadek_abdo_yahoo_033_20180316_2015'
  assert(await rt('isContentDetailsUrl', [publicAudio]), 'public audio details URL should be content')
  assert_media(await rt('getContentDetails', [publicAudio]), 'public audio details')

  const channel = await rt('getChannel', ['archiveorg://creator/NASA%20TV'])
  assert(channel.url === 'archiveorg://creator/NASA%20TV', 'creator channel should resolve')
  assert_items(await rt('getChannelContents', [channel.url, null, null, null]), 'creator channel contents')
  assert_items(await rt('searchChannelContents', [channel.url, 'moon', null, null, f({ content: 'video' })]), 'creator channel search')

  const playlistUrl = 'archiveorg://playlist/quranarabicenglishmp4/video'
  assert(await rt('isPlaylistUrl', [playlistUrl]), 'playlist URL should be recognized')
  await expect_serializer_limit('archiveorg: getPlaylist serializer limit', () => call_remote_test_for_limit('getPlaylist', [playlistUrl]))
  await expect_serializer_limit('archiveorg: searchPlaylists serializer limit', () =>
    call_remote_test_for_limit('searchPlaylists', [
      'Holy Quran Translation Arabic English Mishary MP4',
      null,
      null,
      f({ content: 'video' })
    ])
  )
}

async function call_remote_test_for_limit(method, args) {
  return call_remote_test(current_base, method, args)
}

let current_base = ''

async function assert_ok(label, fn) {
  try {
    const value = await fn()
    results.push(label)
    console.log(`ok ${results.length} - ${label}`)
    return value
  } catch (error) {
    console.error(`not ok - ${label}`)
    throw error
  }
}

async function expect_serializer_limit(label, fn) {
  try {
    await fn()
  } catch (error) {
    assert(
      String(error.message).includes('multiple JSON fields named') || String(error.message).includes('declares multiple JSON fields'),
      `${label} failed for unexpected reason: ${error.message}`
    )
    results.push(label)
    console.log(`ok ${results.length} - ${label} (known Android remoteTest serializer limit)`)
    return
  }
  throw new Error(`${label} unexpectedly succeeded; update the remote coverage harness`)
}

function assert(value, message) {
  if (!value) throw new Error(message)
}

function assert_array(value, label) {
  assert(Array.isArray(value), `${label} should be an array`)
  assert(value.length > 0, `${label} should not be empty`)
}

function assert_items(value, label) {
  assert_array(value, label)
  assert(value[0]?.url || value[0]?.contentUrl, `${label} first item should have a URL`)
}

function assert_filter(caps, id) {
  assert(
    caps?.filters?.some((filter) => filter.id === id),
    `expected ${id} filter`
  )
}

function assert_media(details, label) {
  const audio = details?.video?.audioSources ?? []
  const video = details?.video?.videoSources ?? []
  assert(audio.length + video.length > 0 || details?.contentUrl, `${label} should expose media`)
}

function assert_nested_media(item, label) {
  assert(/^https?:\/\//.test(String(item?.contentUrl ?? '')), `${label} should expose nested media contentUrl`)
}

function assert_web_details(details, label) {
  assert(details?.url, `${label} should have URL`)
  assert(String(details?.html ?? '').includes('youtube.com/embed'), `${label} should expose embedded web details`)
}

function first(items, label) {
  assert_items(items, label)
  return items[0]
}

function f(filters) {
  return Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch (e) {
    console.error(`Error: ${e.message}`)
    process.exitCode = 1
  }
}
