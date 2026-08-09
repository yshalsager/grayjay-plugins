import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, init_lru_caches } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { array_pager_class } from '@lib/paging.js'
import { normalize_search_text } from '@lib/text.js'

const PLATFORM = 'QuranicAudio'
const BASE_URL = 'https://quranicaudio.com'
const DOWNLOAD_BASE = 'https://download.quranicaudio.com/quran'
const QARIS_URL = `${BASE_URL}/api/qaris`
const DEFAULT_ICON = 'https://quranicaudio.com/favicon.ico'
const DEFAULT_LIMIT = 24
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CACHE_LIMITS = {}
const SECTIONS = {
  1: 'Recitations',
  2: 'Haramain Taraweeh',
  3: 'Non-Hafs Recitations',
  4: 'Recitations with Translations'
}
const DEFAULT_HEADERS = {
  'User-Agent': `grayjay.app/${bridge.buildVersion}`,
  Accept: 'application/json,text/plain,*/*'
}
const REGEX = {
  ROOT: /^https?:\/\/(?:www\.)?quranicaudio\.com\/?(?:[?#].*)?$/i,
  CHANNEL: /^quranicaudio:\/\/qari\/(\d+)$/,
  WEB_QARI: /^https?:\/\/(?:www\.)?quranicaudio\.com\/quran\/(\d+)(?:[?#].*)?$/i,
  PLAYLIST: /^quranicaudio:\/\/playlist\/qari\/(\d+)$/,
  SURAH: /^quranicaudio:\/\/surah\/(\d+)\/(\d{1,3})$/,
  MEDIA: /^https?:\/\/download\.quranicaudio\.com\/quran\/(.+\/)(\d{3})\.mp3(?:[?#].*)?$/i
}

let _config = {}
let state = {
  catalogFetchedAt: 0,
  qaris: [],
  qariById: {},
  qariByPath: {},
  cacheOrder: {}
}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, _settings, savedState) {
  _config = conf ?? {}
  if (savedState) {
    try {
      state = { ...state, ...JSON.parse(savedState) }
    } catch (e) {
      logIfTesting('Failed to parse QuranicAudio state: ' + e)
    }
  }
  init_lru_caches(state, CACHE_LIMITS)
  buildIndexes()
}

source.saveState = function () {
  return JSON.stringify({
    catalogFetchedAt: state.catalogFetchedAt,
    qaris: state.qaris
  })
}

source.getHome = function () {
  ensureCatalog()
  return new ArrayVideoPager(
    state.qaris.slice(0, DEFAULT_LIMIT).map((qari) => surahToVideo(qari, 1)),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => capabilities()
source.getSearchChannelContentsCapabilities = () => capabilities()
source.getChannelCapabilities = () => capabilities()

source.searchSuggestions = function (query) {
  ensureCatalog()
  const q = normalize(query)
  return [
    ...Object.values(SECTIONS),
    ...state.qaris.flatMap((qari) => [qari.name, qari.arabic_name, qari.relative_path]),
    ...surahIds().map(surahLabel)
  ]
    .filter((item) => item && (!q || normalize(item).indexOf(q) >= 0))
    .slice(0, 10)
}

source.search = function (query, _type, _order, filters) {
  ensureCatalog()
  const q = normalize(query)
  const qaris = selectedQaris(filters, q)
  const surahs = selectedSurahs(filters, q)
  const items = []
  for (const qari of qaris) {
    for (const surah of surahs) items.push(surahToVideo(qari, surah))
  }
  return new ArrayVideoPager(dedupe_by_url(items), DEFAULT_LIMIT)
}

source.searchChannels = function (query) {
  ensureCatalog()
  const q = normalize(query)
  return new ArrayChannelPager(state.qaris.filter((qari) => !q || qariMatches(qari, q)).map(qariToChannel), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return REGEX.ROOT.test(String(url ?? '')) || REGEX.CHANNEL.test(String(url ?? '')) || REGEX.WEB_QARI.test(String(url ?? ''))
}

source.getChannel = function (url) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return rootChannel()
  return qariToChannel(qariFromUrl(url))
}

source.getChannelContents = function (url, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.getHome()
  const qari = qariFromUrl(url)
  return source.search('', type, order, { ...filterObject(filters), qari: qariFilterLabel(qari) })
}

source.getPeekChannelTypes = () => ['Surah audio']

source.peekChannelContents = function (url, _type) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.getHome().results.slice(0, 6)
  const qari = qariFromUrl(url)
  return surahIds()
    .slice(0, 6)
    .map((surah) => surahToVideo(qari, surah))
}

source.searchChannelContents = function (url, query, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.search(query, type, order, filters)
  const qari = qariFromUrl(url)
  return source.search(query, type, order, { ...filterObject(filters), qari: qariFilterLabel(qari) })
}

source.searchPlaylists = function (query, _type, _order, filters) {
  ensureCatalog()
  const q = normalize(query)
  return new ArrayPlaylistPager(selectedQaris(filters, q).map(qariToPlaylist), DEFAULT_LIMIT)
}

source.isPlaylistUrl = function (url) {
  return REGEX.PLAYLIST.test(String(url ?? ''))
}

source.getPlaylist = function (url) {
  ensureCatalog()
  const match = String(url ?? '').match(REGEX.PLAYLIST)
  if (!match) throw new ScriptException('Unsupported QuranicAudio playlist URL')
  return playlistDetails(qariById(match[1]))
}

source.getChannelPlaylists = function (url) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.searchPlaylists('', null, null, null)
  return new ArrayPlaylistPager([qariToPlaylist(qariFromUrl(url))], DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  return Boolean(surahPartsFromUrl(url) || mediaPartsFromUrl(url))
}

source.getContentDetails = function (url) {
  ensureCatalog()
  const parts = surahPartsFromUrl(url) || mediaPartsFromUrl(url)
  if (!parts) throw new ScriptException('Unsupported QuranicAudio URL')
  return surahToVideo(qariById(parts.qariId), parts.surah, String(url ?? ''))
}

function ensureCatalog() {
  if (state.qaris?.length && Date.now() - Number(state.catalogFetchedAt || 0) < CACHE_MAX_AGE_MS) return
  state.qaris = (get_json(QARIS_URL, DEFAULT_HEADERS) ?? []).filter(
    (qari) => qari.id && qari.relative_path && String(qari.file_formats).indexOf('mp3') >= 0
  )
  state.catalogFetchedAt = Date.now()
  buildIndexes()
}

function buildIndexes() {
  state.qariById = {}
  state.qariByPath = {}
  for (const qari of state.qaris ?? []) {
    state.qariById[String(qari.id)] = qari
    state.qariByPath[String(qari.relative_path)] = qari
  }
}

function capabilities() {
  ensureCatalog()
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [sectionFilter(), qariFilter(), surahFilter()]
  }
}

function sectionFilter() {
  return {
    id: 'section',
    name: 'Section',
    isMultiSelect: false,
    filters: Object.keys(SECTIONS).map((id) => ({ id, name: SECTIONS[id], value: id }))
  }
}

function qariFilter() {
  return {
    id: 'qari',
    name: 'Qari',
    isMultiSelect: false,
    filters: state.qaris.map((qari) => ({ id: qariFilterLabel(qari), name: qariFilterLabel(qari), value: qariFilterLabel(qari) }))
  }
}

function surahFilter() {
  return {
    id: 'surah',
    name: 'Surah',
    isMultiSelect: false,
    filters: surahIds().map((surah) => ({ id: surahLabel(surah), name: surahLabel(surah), value: surahLabel(surah) }))
  }
}

function surahToVideo(qari, surah, requestedUrl = '') {
  const audioUrl = mediaUrl(qari, surah)
  const details = grayjay.video(`${qari.id}-${surah}`, {
    name: `${surahLabel(surah)} - ${qariName(qari)}`,
    thumbnails: staticThumbnails(),
    author: author(qari),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: requestedUrl || surahUrl(qari.id, surah),
    description: [
      `Qari: ${qariName(qari)}`,
      `Section: ${SECTIONS[qari.section_id] || qari.section_id}`,
      `Surah: ${surahLabel(surah)}`,
      `Source: ${audioUrl}`
    ].join('\n'),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: audioUrl,
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: audioUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(relatedSurahs(qari, surah), DEFAULT_LIMIT)
  }

  return details
}

function relatedSurahs(qari, surah) {
  const items = []
  if (surah < 114) items.push(surahToVideo(qari, surah + 1))
  if (surah > 1) items.push(surahToVideo(qari, surah - 1))
  for (const other of state.qaris) {
    if (other.id !== qari.id) items.push(surahToVideo(other, surah))
    if (items.length >= 12) break
  }
  return dedupe_by_url(items)
}

function qariToChannel(qari) {
  return grayjay.channel(`qari-${qari.id}`, {
    name: qariName(qari),
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${qariName(qari)}\n${SECTIONS[qari.section_id] || ''}\nFull-surah QuranicAudio MP3 recitations.`,
    url: channelUrl(qari.id),
    urlAlternatives: [`${BASE_URL}/quran/${qari.id}`]
  })
}

function rootChannel() {
  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'QuranicAudio full-surah MP3 recitations.',
    url: BASE_URL,
    urlAlternatives: [BASE_URL, QARIS_URL]
  })
}

function qariToPlaylist(qari) {
  return grayjay.playlist(`qari-${qari.id}`, {
    name: qariName(qari),
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: author(qari),
    datetime: 0,
    url: playlistUrl(qari.id),
    videoCount: 114
  })
}

function playlistDetails(qari) {
  return grayjay.playlist_details(`qari-${qari.id}`, {
    name: qariName(qari),
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: author(qari),
    datetime: 0,
    url: playlistUrl(qari.id),
    videoCount: 114,
    contents: new ArrayVideoPager(
      surahIds().map((surah) => surahToVideo(qari, surah)),
      DEFAULT_LIMIT
    ),
    shareUrl: `${BASE_URL}/quran/${qari.id}`
  })
}

function author(qari) {
  return grayjay.author(`qari-${qari.id}`, qariName(qari), channelUrl(qari.id), iconUrl())
}

function selectedQaris(filters, query) {
  const selected = selected_filter_values(filters, 'qari').map(qariIdFromFilter).filter(Boolean)
  const sections = selected_filter_values(filters, 'section')
  const qaris = selected.length ? selected.map(qariById) : state.qaris
  const filtered = qaris.filter((qari) => {
    const sectionMatches = !sections.length || sections.indexOf(String(qari.section_id)) >= 0
    const queryMatches = !query || qariMatches(qari, query) || queryMentionsSurah(query)
    return sectionMatches && queryMatches
  })
  return filtered.length ? filtered : state.qaris.slice(0, 1)
}

function selectedSurahs(filters, query) {
  const selected = selected_filter_values(filters, 'surah').map(surahIdFromFilter).filter(Boolean)
  if (selected.length) return selected
  if (query) {
    const matched = surahIds().filter((surah) => surahMatches(surah, query))
    if (matched.length) return matched
  }
  return [1]
}

function qariFromUrl(url) {
  const value = String(url ?? '')
  const match = value.match(REGEX.CHANNEL) || value.match(REGEX.WEB_QARI)
  return qariById(match?.[1])
}

function qariById(id) {
  const qari = state.qariById?.[String(id)]
  if (!qari) throw new ScriptException('QuranicAudio qari not found')
  return qari
}

function surahPartsFromUrl(url) {
  const match = String(url ?? '').match(REGEX.SURAH)
  return match ? { qariId: match[1], surah: Number(match[2]) } : null
}

function mediaPartsFromUrl(url) {
  const match = String(url ?? '').match(REGEX.MEDIA)
  if (!match) return null
  const qari = state.qariByPath?.[match[1]]
  if (!qari) return null
  return { qariId: qari.id, surah: Number(match[2]) }
}

function qariIdFromFilter(value) {
  const text = String(value ?? '')
  const id = Number(text.match(/\((\d+)\)$/)?.[1] ?? text)
  if (id) return id
  return state.qaris.find((qari) => qariFilterLabel(qari) === text || qariName(qari) === text)?.id
}

function surahIdFromFilter(value) {
  const text = String(value ?? '')
  const id = Number(text.match(/\((\d+)\)$/)?.[1] ?? text)
  if (id >= 1 && id <= 114) return id
  return surahIds().find((surah) => normalize(surahLabel(surah)) === normalize(text))
}

function qariMatches(qari, query) {
  const q = normalize(query)
  return normalize(`${qariName(qari)} ${qari.name} ${qari.arabic_name} ${qari.relative_path} ${SECTIONS[qari.section_id]}`).indexOf(q) >= 0
}

function surahMatches(surah, query) {
  const q = normalize(query)
  return normalize(`${surah} ${surahLabel(surah)}`).indexOf(q) >= 0
}

function queryMentionsSurah(query) {
  return surahIds().some((surah) => surahMatches(surah, query))
}

function qariName(qari) {
  return qari.arabic_name ? `${qari.arabic_name} - ${qari.name}` : qari.name
}

function qariFilterLabel(qari) {
  return `${qariName(qari)} (${qari.id})`
}

function surahLabel(surah) {
  return `Surah ${surah} (${surah})`
}

function surahIds() {
  return Array.from({ length: 114 }, (_value, index) => index + 1)
}

function mediaUrl(qari, surah) {
  return `${DOWNLOAD_BASE}/${qari.relative_path}${String(surah).padStart(3, '0')}.mp3`
}

function channelUrl(qariId) {
  return `quranicaudio://qari/${qariId}`
}

function playlistUrl(qariId) {
  return `quranicaudio://playlist/qari/${qariId}`
}

function surahUrl(qariId, surah) {
  return `quranicaudio://surah/${qariId}/${surah}`
}

function filterObject(filters) {
  if (!filters || Array.isArray(filters) || typeof filters.get === 'function') return {}
  return filters
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

function normalize(value) {
  return normalize_search_text(value)
}

function logIfTesting(message) {
  if (typeof IS_TESTING !== 'undefined' && IS_TESTING) log(message)
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)
