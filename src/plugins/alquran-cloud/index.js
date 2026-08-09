import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url, dedupe_strings } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { cache_get, cache_set, get_json, init_lru_caches } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { array_pager_class } from '@lib/paging.js'
import { verse_reference } from '@lib/quran.js'
import { normalize_search_text } from '@lib/text.js'

const PLATFORM = 'AlQuran.cloud'
const BASE_URL = 'https://alquran.cloud'
const API_BASE = 'https://api.alquran.cloud/v1'
const DEFAULT_ICON = 'https://alquran.cloud/favicon.ico'
const DEFAULT_LIMIT = 24
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CACHE_LIMITS = {
  surahCache: 80
}
const LANGUAGE_OPTIONS = ['', 'ar', 'en', 'ur', 'fr', 'ru', 'zh', 'fa']
const TYPE_OPTIONS = ['', 'versebyverse', 'translation']
const DEFAULT_EDITION_OPTIONS = ['', 'ar.alafasy', 'ar.abdurrahmaansudais', 'en.walk']
const DEFAULT_HEADERS = {
  'User-Agent': `grayjay.app/${bridge.buildVersion}`,
  Accept: 'application/json,text/plain,*/*'
}
const REGEX = {
  ROOT: /^https?:\/\/(?:www\.)?alquran\.cloud\/?(?:[?#].*)?$/i,
  CHANNEL: /^alqurancloud:\/\/edition\/([^/?#]+)$/,
  PLAYLIST: /^alqurancloud:\/\/surah\/([^/]+)\/(\d{1,3})$/,
  AYAH: /^alqurancloud:\/\/ayah\/([^/]+)\/(\d{1,3})\/(\d{1,3})$/,
  MEDIA: /^https?:\/\/cdn\.islamic\.network\/quran\/audio\/(\d+)\/([^/]+)\/(\d+)\.mp3(?:[?#].*)?$/i
}

let _config = {}
let _settings = {}
let state = {
  catalogFetchedAt: 0,
  editions: [],
  surahs: [],
  editionById: {},
  surahById: {},
  surahCache: {},
  cacheOrder: {}
}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, settings, savedState) {
  _config = conf ?? {}
  _settings = settings ?? {}
  if (savedState) {
    try {
      state = { ...state, ...JSON.parse(savedState) }
    } catch (e) {
      logIfTesting('Failed to parse AlQuran.cloud state: ' + e)
    }
  }
  init_lru_caches(state, CACHE_LIMITS)
  buildIndexes()
}

source.saveState = function () {
  return JSON.stringify({
    catalogFetchedAt: state.catalogFetchedAt,
    editions: state.editions,
    surahs: state.surahs
  })
}

source.getHome = function () {
  ensureCatalog()
  return new ArrayVideoPager(
    selectedEditions(null, '')
      .slice(0, DEFAULT_LIMIT)
      .map((edition) => surahToFeed(edition, state.surahs[0])),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => capabilities()
source.getSearchChannelContentsCapabilities = () => capabilities()
source.getChannelCapabilities = () => capabilities()

source.searchSuggestions = function (query) {
  ensureCatalog()
  const q = normalize(query)
  return dedupe_strings([
    '1:1',
    '2:255',
    ...state.editions.flatMap((edition) => [edition.name, edition.englishName, edition.identifier, edition.language, edition.type]),
    ...state.surahs.flatMap((surah) => [surahLabel(surah), surah.englishName, surah.name])
  ])
    .filter((item) => item && (!q || normalize(item).indexOf(q) >= 0))
    .slice(0, 10)
}

source.search = function (query, _type, _order, filters) {
  ensureCatalog()
  const q = normalize(query)
  const reference = verse_reference(query)
  const editions = selectedEditions(filters, q, reference)
  const surahs = selectedSurahs(filters, q, reference)
  const items = []

  for (const edition of editions) {
    for (const surah of surahs) {
      if (reference?.ayah) {
        items.push(ayahToFeed(edition, surah, reference.ayah))
      } else {
        items.push(surahToFeed(edition, surah))
      }
    }
  }

  return new ArrayVideoPager(dedupe_by_url(items), DEFAULT_LIMIT)
}

source.searchChannels = function (query) {
  ensureCatalog()
  const q = normalize(query)
  return new ArrayChannelPager(state.editions.filter((edition) => !q || editionMatches(edition, q)).map(editionToChannel), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return REGEX.ROOT.test(String(url ?? '')) || REGEX.CHANNEL.test(String(url ?? ''))
}

source.getChannel = function (url) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return rootChannel()
  const edition = editionFromUrl(url)
  return editionToChannel(edition)
}

source.getChannelContents = function (url, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.getHome()
  const edition = editionFromUrl(url)
  return source.search('', type, order, { ...filterObject(filters), edition: editionLabel(edition) })
}

source.getPeekChannelTypes = () => ['Ayah audio']

source.peekChannelContents = function (url, _type) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.getHome().results.slice(0, 6)
  const edition = editionFromUrl(url)
  return state.surahs.slice(0, 6).map((surah) => surahToFeed(edition, surah))
}

source.searchChannelContents = function (url, query, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.search(query, type, order, filters)
  const edition = editionFromUrl(url)
  return source.search(query, type, order, { ...filterObject(filters), edition: editionLabel(edition) })
}

source.searchPlaylists = function (query, _type, _order, filters) {
  ensureCatalog()
  const q = normalize(query)
  const playlists = []
  for (const edition of selectedEditions(filters, q)) {
    for (const surah of selectedSurahs(filters, q, null, true)) {
      playlists.push(playlistToPlatform(edition, surah))
    }
  }
  return new ArrayPlaylistPager(playlists, DEFAULT_LIMIT)
}

source.isPlaylistUrl = function (url) {
  return REGEX.PLAYLIST.test(String(url ?? ''))
}

source.getPlaylist = function (url) {
  ensureCatalog()
  const match = String(url ?? '').match(REGEX.PLAYLIST)
  if (!match) throw new ScriptException('Unsupported AlQuran.cloud playlist URL')
  return playlistDetails(editionById(match[1]), surahById(match[2]))
}

source.getChannelPlaylists = function (url) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.searchPlaylists('', null, null, null)
  const edition = editionFromUrl(url)
  return new ArrayPlaylistPager(
    state.surahs.map((surah) => playlistToPlatform(edition, surah)),
    DEFAULT_LIMIT
  )
}

source.isContentDetailsUrl = function (url) {
  return Boolean(ayahPartsFromUrl(url) || mediaPartsFromUrl(url))
}

source.getContentDetails = function (url) {
  ensureCatalog()
  const parts = ayahPartsFromUrl(url) || mediaPartsFromUrl(url)
  if (!parts) throw new ScriptException('Unsupported AlQuran.cloud URL')
  return ayahToVideo(editionById(parts.editionId), parts.surah, parts.ayah, null, String(url ?? ''))
}

function ensureCatalog() {
  if (state.editions?.length && state.surahs?.length && Date.now() - Number(state.catalogFetchedAt || 0) < CACHE_MAX_AGE_MS) {
    return
  }

  state.editions = get_json(`${API_BASE}/edition?format=audio`, DEFAULT_HEADERS).data ?? []
  state.surahs = get_json(`${API_BASE}/surah`, DEFAULT_HEADERS).data ?? []
  state.catalogFetchedAt = Date.now()
  buildIndexes()
}

function buildIndexes() {
  state.editionById = {}
  state.surahById = {}
  for (const edition of state.editions ?? []) state.editionById[edition.identifier] = edition
  for (const surah of state.surahs ?? []) state.surahById[String(surah.number)] = surah
}

function loadSurah(editionId, surahNumber) {
  const key = `${editionId}:${surahNumber}`
  const cached = cache_get(state, CACHE_LIMITS, 'surahCache', key)
  if (cached) return cached

  const data = get_json(`${API_BASE}/surah/${surahNumber}/${editionId}`, DEFAULT_HEADERS).data
  if (!data?.ayahs) throw new ScriptException('AlQuran.cloud surah audio not found')
  return cache_set(state, CACHE_LIMITS, 'surahCache', key, data)
}

function capabilities() {
  ensureCatalog()
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [languageFilter(), typeFilter(), editionFilter(), surahFilter()]
  }
}

function languageFilter() {
  return {
    id: 'language',
    name: 'Language',
    isMultiSelect: false,
    filters: availableLanguages().map((language) => ({ id: language, name: language || 'All languages', value: language }))
  }
}

function typeFilter() {
  return {
    id: 'edition-type',
    name: 'Edition type',
    isMultiSelect: false,
    filters: availableTypes().map((type) => ({ id: type, name: type || 'All types', value: type }))
  }
}

function editionFilter() {
  return {
    id: 'edition',
    name: 'Edition',
    isMultiSelect: false,
    filters: state.editions.map((edition) => ({ id: editionLabel(edition), name: editionLabel(edition), value: editionLabel(edition) }))
  }
}

function surahFilter() {
  return {
    id: 'surah',
    name: 'Surah',
    isMultiSelect: false,
    filters: state.surahs.map((surah) => ({ id: surahLabel(surah), name: surahLabel(surah), value: surahLabel(surah) }))
  }
}

function ayahToVideo(edition, surahNumber, ayahNumber, knownAyah = null, requestedUrl = '') {
  const surah = surahById(surahNumber)
  const ayah =
    knownAyah ?? (loadSurah(edition.identifier, surah.number).ayahs ?? []).find((item) => Number(item.numberInSurah) === Number(ayahNumber))
  if (!ayah?.audio) throw new ScriptException('AlQuran.cloud ayah audio not found')

  const details = grayjay.video(`${edition.identifier}-${surah.number}-${ayah.numberInSurah}`, {
    name: `${surahLabel(surah)}:${ayah.numberInSurah} - ${editionName(edition)}`,
    thumbnails: staticThumbnails(),
    author: author(edition),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: requestedUrl || ayahUrl(edition.identifier, surah.number, ayah.numberInSurah),
    description: [
      `Edition: ${editionLabel(edition)}`,
      `Surah: ${surahLabel(surah)}`,
      `Ayah: ${ayah.numberInSurah}`,
      `Type: ${edition.type}`,
      `Language: ${edition.language}`,
      `Source: ${ayah.audio}`
    ].join('\n'),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      bitrate: bitrateFromUrl(ayah.audio) * 1000,
      duration: 0,
      url: ayah.audio,
      language: edition.language || 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: ayah.audio
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(relatedAyahs(edition, surah, ayah), DEFAULT_LIMIT)
  }

  return details
}

function ayahToFeed(edition, surah, ayahNumber) {
  return grayjay.feed_video(`${edition.identifier}-${surah.number}-${ayahNumber}`, {
    name: `${surahLabel(surah)}:${ayahNumber} - ${editionName(edition)}`,
    thumbnails: staticThumbnails(),
    author: author(edition),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: ayahUrl(edition.identifier, surah.number, ayahNumber),
    shareUrl: `${API_BASE}/surah/${surah.number}/${edition.identifier}`
  })
}

function surahToFeed(edition, surah) {
  return grayjay.feed_video(`${edition.identifier}-${surah.number}`, {
    name: `${surahLabel(surah)} - ${editionName(edition)}`,
    thumbnails: staticThumbnails(),
    author: author(edition),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: ayahUrl(edition.identifier, surah.number, 1),
    shareUrl: playlistUrl(edition.identifier, surah.number)
  })
}

function relatedAyahs(edition, surah, ayah) {
  const items = []
  const ayahNumber = Number(ayah.numberInSurah)
  if (ayahNumber < Number(surah.numberOfAyahs)) items.push(ayahToFeed(edition, surah, ayahNumber + 1))
  if (ayahNumber > 1) items.push(ayahToFeed(edition, surah, ayahNumber - 1))
  for (const other of state.editions) {
    if (other.identifier === edition.identifier) continue
    items.push(ayahToFeed(other, surah, ayahNumber))
    if (items.length >= 8) break
  }
  return dedupe_by_url(items)
}

function editionToChannel(edition) {
  return grayjay.channel(`edition-${edition.identifier}`, {
    name: editionLabel(edition),
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${editionName(edition)}\n${edition.identifier}\n${edition.language || ''} ${edition.type || ''}`,
    url: channelUrl(edition.identifier),
    urlAlternatives: [`${API_BASE}/edition/${edition.identifier}`]
  })
}

function rootChannel() {
  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'AlQuran.cloud ayah-by-ayah Quran audio editions and translations.',
    url: BASE_URL,
    urlAlternatives: [BASE_URL, API_BASE]
  })
}

function playlistToPlatform(edition, surah) {
  return grayjay.playlist(`${edition.identifier}-${surah.number}`, {
    name: `${surahLabel(surah)} - ${editionName(edition)}`,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: author(edition),
    datetime: 0,
    url: playlistUrl(edition.identifier, surah.number),
    videoCount: Number(surah.numberOfAyahs || 0)
  })
}

function playlistDetails(edition, surah) {
  const data = loadSurah(edition.identifier, surah.number)
  const items = (data.ayahs ?? []).map((ayah) => ayahToFeed(edition, surah, ayah.numberInSurah))
  return grayjay.playlist_details(`${edition.identifier}-${surah.number}`, {
    name: `${surahLabel(surah)} - ${editionName(edition)}`,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: author(edition),
    datetime: 0,
    url: playlistUrl(edition.identifier, surah.number),
    videoCount: items.length,
    contents: new ArrayVideoPager(items, DEFAULT_LIMIT),
    shareUrl: `${API_BASE}/surah/${surah.number}/${edition.identifier}`
  })
}

function author(edition) {
  return grayjay.author(`edition-${edition.identifier}`, editionName(edition), channelUrl(edition.identifier), iconUrl())
}

function selectedEditions(filters, query, reference = null) {
  const selected = selected_filter_values(filters, 'edition').map(editionIdFromFilter).filter(Boolean)
  const languages = selected_filter_values(filters, 'language')
  const types = selected_filter_values(filters, 'edition-type')
  const languageSetting = selectedLanguageSetting()
  const typeSetting = selectedTypeSetting()
  const editions = selected.length ? selected.map(editionById) : state.editions
  const filtered = editions.filter((edition) => {
    const languageMatches =
      (!languages.length || languages.indexOf(edition.language) >= 0) && (!languageSetting || edition.language === languageSetting)
    const typeMatches = (!types.length || types.indexOf(edition.type) >= 0) && (!typeSetting || edition.type === typeSetting)
    const queryMatches = Boolean(reference) || !query || editionMatches(edition, query) || queryMentionsSurah(query)
    return languageMatches && typeMatches && queryMatches
  })
  return filtered.length ? filtered : [defaultEdition()]
}

function selectedSurahs(filters, query, reference = null, broadDefault = false) {
  if (reference?.chapter) return [surahById(reference.chapter)]
  const selected = selected_filter_values(filters, 'surah').map(surahIdFromFilter).filter(Boolean).map(surahById)
  if (selected.length) return selected
  if (query) {
    const matches = state.surahs.filter((surah) => surahMatches(surah, query))
    if (matches.length) return matches
  }
  return broadDefault ? state.surahs : [state.surahs[0]]
}

function defaultEdition() {
  const configured = DEFAULT_EDITION_OPTIONS[Number(_settings.defaultEdition ?? 0)]
  return (configured && state.editionById?.[configured]) || state.editionById?.['ar.alafasy'] || state.editions[0]
}

function selectedLanguageSetting() {
  return LANGUAGE_OPTIONS[Number(_settings.language ?? 0)] ?? ''
}

function selectedTypeSetting() {
  return TYPE_OPTIONS[Number(_settings.editionType ?? 0)] ?? ''
}

function availableLanguages() {
  return ['', ...dedupe_strings(state.editions.map((edition) => edition.language).filter(Boolean)).sort()]
}

function availableTypes() {
  return ['', ...dedupe_strings(state.editions.map((edition) => edition.type).filter(Boolean)).sort()]
}

function editionFromUrl(url) {
  return editionById(String(url ?? '').match(REGEX.CHANNEL)?.[1])
}

function editionById(id) {
  const edition = state.editionById?.[String(id)]
  if (!edition) throw new ScriptException('AlQuran.cloud edition not found')
  return edition
}

function surahById(id) {
  const surah = state.surahById?.[String(Number(id))]
  if (!surah) throw new ScriptException('AlQuran.cloud surah not found')
  return surah
}

function ayahPartsFromUrl(url) {
  const match = String(url ?? '').match(REGEX.AYAH)
  if (!match) return null
  return { editionId: match[1], surah: Number(match[2]), ayah: Number(match[3]) }
}

function mediaPartsFromUrl(url) {
  const match = String(url ?? '').match(REGEX.MEDIA)
  if (!match) return null
  const globalAyah = Number(match[3])
  const location = surahAyahFromGlobal(globalAyah)
  return { editionId: match[2], surah: location.surah, ayah: location.ayah }
}

function surahAyahFromGlobal(globalAyah) {
  let remaining = Number(globalAyah)
  for (const surah of state.surahs) {
    const count = Number(surah.numberOfAyahs)
    if (remaining <= count) return { surah: surah.number, ayah: remaining }
    remaining -= count
  }
  throw new ScriptException('AlQuran.cloud ayah number not found')
}

function editionIdFromFilter(value) {
  const text = String(value ?? '')
  const direct = state.editionById?.[text]
  if (direct) return direct.identifier
  return state.editions.find((edition) => editionLabel(edition) === text || editionName(edition) === text)?.identifier
}

function surahIdFromFilter(value) {
  const text = String(value ?? '')
  const id = Number(text.match(/\((\d+)\)$/)?.[1] ?? text)
  if (id >= 1 && id <= 114) return id
  return state.surahs.find((surah) => normalize(surahLabel(surah)) === normalize(text) || normalize(surah.englishName) === normalize(text))
    ?.number
}

function editionMatches(edition, query) {
  const q = normalize(query)
  return normalize(`${edition.identifier} ${edition.name} ${edition.englishName} ${edition.language} ${edition.type}`).indexOf(q) >= 0
}

function surahMatches(surah, query) {
  const q = normalize(query)
  return normalize(`${surah.number} ${surah.name} ${surah.englishName} ${surah.englishNameTranslation}`).indexOf(q) >= 0
}

function queryMentionsSurah(query) {
  return state.surahs.some((surah) => surahMatches(surah, query))
}

function editionName(edition) {
  return String(edition.name || edition.englishName || edition.identifier).trim()
}

function editionLabel(edition) {
  return `${editionName(edition)} - ${edition.language}/${edition.type} (${edition.identifier})`
}

function surahLabel(surah) {
  return `${surah.englishName || surah.name} (${surah.number})`
}

function bitrateFromUrl(url) {
  return Number(String(url ?? '').match(/\/audio\/(\d+)\//)?.[1] ?? 0)
}

function channelUrl(editionId) {
  return `alqurancloud://edition/${editionId}`
}

function playlistUrl(editionId, surah) {
  return `alqurancloud://surah/${editionId}/${surah}`
}

function ayahUrl(editionId, surah, ayah) {
  return `alqurancloud://ayah/${editionId}/${surah}/${ayah}`
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
