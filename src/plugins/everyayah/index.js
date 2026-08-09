import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, init_lru_caches } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { array_pager_class } from '@lib/paging.js'
import { verse_reference } from '@lib/quran.js'
import { normalize_search_text } from '@lib/text.js'

const PLATFORM = 'EveryAyah'
const DISPLAY_NAME = 'EveryAyah'
const BASE_URL = 'https://everyayah.com'
const SITE_URL = 'https://www.versebyversequran.com'
const CATALOG_URL = `${BASE_URL}/data/recitations.js`
const DEFAULT_ICON = 'https://everyayah.com/favicon.ico'
const DEFAULT_LIMIT = 24
const CACHE_LIMITS = {
  catalogCache: 1
}
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const SURAH_NAMES = [
  'Al-Fatihah',
  'Al-Baqarah',
  'Ali Imran',
  'An-Nisa',
  'Al-Maidah',
  'Al-Anam',
  'Al-Araf',
  'Al-Anfal',
  'At-Tawbah',
  'Yunus',
  'Hud',
  'Yusuf',
  'Ar-Rad',
  'Ibrahim',
  'Al-Hijr',
  'An-Nahl',
  'Al-Isra',
  'Al-Kahf',
  'Maryam',
  'Taha',
  'Al-Anbiya',
  'Al-Hajj',
  'Al-Muminun',
  'An-Nur',
  'Al-Furqan',
  'Ash-Shuara',
  'An-Naml',
  'Al-Qasas',
  'Al-Ankabut',
  'Ar-Rum',
  'Luqman',
  'As-Sajdah',
  'Al-Ahzab',
  'Saba',
  'Fatir',
  'Ya-Sin',
  'As-Saffat',
  'Sad',
  'Az-Zumar',
  'Ghafir',
  'Fussilat',
  'Ash-Shura',
  'Az-Zukhruf',
  'Ad-Dukhan',
  'Al-Jathiyah',
  'Al-Ahqaf',
  'Muhammad',
  'Al-Fath',
  'Al-Hujurat',
  'Qaf',
  'Adh-Dhariyat',
  'At-Tur',
  'An-Najm',
  'Al-Qamar',
  'Ar-Rahman',
  'Al-Waqiah',
  'Al-Hadid',
  'Al-Mujadila',
  'Al-Hashr',
  'Al-Mumtahanah',
  'As-Saff',
  'Al-Jumuah',
  'Al-Munafiqun',
  'At-Taghabun',
  'At-Talaq',
  'At-Tahrim',
  'Al-Mulk',
  'Al-Qalam',
  'Al-Haqqah',
  'Al-Maarij',
  'Nuh',
  'Al-Jinn',
  'Al-Muzzammil',
  'Al-Muddaththir',
  'Al-Qiyamah',
  'Al-Insan',
  'Al-Mursalat',
  'An-Naba',
  'An-Naziat',
  'Abasa',
  'At-Takwir',
  'Al-Infitar',
  'Al-Mutaffifin',
  'Al-Inshiqaq',
  'Al-Buruj',
  'At-Tariq',
  'Al-Ala',
  'Al-Ghashiyah',
  'Al-Fajr',
  'Al-Balad',
  'Ash-Shams',
  'Al-Layl',
  'Ad-Duha',
  'Ash-Sharh',
  'At-Tin',
  'Al-Alaq',
  'Al-Qadr',
  'Al-Bayyinah',
  'Az-Zalzalah',
  'Al-Adiyat',
  'Al-Qariah',
  'At-Takathur',
  'Al-Asr',
  'Al-Humazah',
  'Al-Fil',
  'Quraysh',
  'Al-Maun',
  'Al-Kawthar',
  'Al-Kafirun',
  'An-Nasr',
  'Al-Masad',
  'Al-Ikhlas',
  'Al-Falaq',
  'An-Nas'
]
const DEFAULT_HEADERS = {
  'User-Agent': `grayjay.app/${bridge.buildVersion}`,
  Accept: 'application/json,text/plain,*/*'
}
const REGEX = {
  ROOT: /^https?:\/\/(?:www\.)?(?:everyayah\.com|versebyversequran\.com)\/?(?:[?#].*)?$/i,
  CHANNEL: /^everyayah:\/\/reciter\/(\d+)$/,
  PLAYLIST: /^everyayah:\/\/surah\/(\d+)\/(\d{1,3})$/,
  AYAH: /^everyayah:\/\/ayah\/(\d+)\/(\d{1,3})\/(\d{1,3})$/,
  MEDIA: /^https?:\/\/everyayah\.com\/data\/([^/]+)\/(\d{3})(\d{3})\.mp3(?:[?#].*)?$/i
}

let _config = {}
let state = {
  catalogFetchedAt: 0,
  ayahCount: [],
  reciters: [],
  reciterById: {},
  reciterBySubfolder: {},
  catalogCache: {},
  cacheOrder: {}
}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, _settings, savedState) {
  _config = conf ?? {}
  if (savedState) {
    try {
      state = { ...state, ...JSON.parse(savedState) }
    } catch (e) {
      logIfTesting('Failed to parse EveryAyah state: ' + e)
    }
  }
  init_lru_caches(state, CACHE_LIMITS)
  buildIndexes()
}

source.saveState = function () {
  return JSON.stringify({
    catalogFetchedAt: state.catalogFetchedAt,
    ayahCount: state.ayahCount,
    reciters: state.reciters
  })
}

source.getHome = function () {
  ensureCatalog()
  return new ArrayVideoPager(
    state.reciters.map((reciter) => surahToVideo(reciter, 1)),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => capabilities()
source.getSearchChannelContentsCapabilities = () => capabilities()
source.getChannelCapabilities = () => capabilities()

source.searchSuggestions = function (query) {
  ensureCatalog()
  const q = normalize(query)
  return ['1:1', '2:255', ...state.reciters.map((reciter) => reciter.name), ...SURAH_NAMES.map((name, index) => surahLabel(index + 1))]
    .filter((item) => !q || normalize(item).indexOf(q) >= 0)
    .slice(0, 10)
}

source.search = function (query, _type, _order, filters) {
  ensureCatalog()
  const q = normalize(query)
  const reference = verse_reference(query)
  const reciters = selectedReciters(filters, q, reference)
  const surahs = selectedSurahs(filters, q, reference)
  const ayahNumbers = reference ? [reference.ayah] : [1]
  const items = []

  for (const reciter of reciters) {
    for (const surah of surahs) {
      if (reference?.ayah) {
        for (const ayah of ayahNumbers) {
          if (ayah >= 1 && ayah <= ayahCount(surah)) {
            items.push(ayahToVideo(reciter, surah, ayah))
          }
        }
      } else {
        items.push(surahToVideo(reciter, surah))
      }
    }
  }

  return new ArrayVideoPager(dedupe_by_url(items), DEFAULT_LIMIT)
}

source.searchChannels = function (query) {
  ensureCatalog()
  const q = normalize(query)
  return new ArrayChannelPager(state.reciters.filter((reciter) => !q || reciterMatches(reciter, q)).map(reciterToChannel), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return REGEX.ROOT.test(String(url ?? '')) || REGEX.CHANNEL.test(String(url ?? ''))
}

source.getChannel = function (url) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return rootChannel()
  return reciterToChannel(reciterFromUrl(url))
}

source.getChannelContents = function (url, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.getHome()
  const reciter = reciterFromUrl(url)
  return source.search('', type, order, { ...filterObject(filters), reciter: reciterFilterLabel(reciter) })
}

source.getPeekChannelTypes = () => ['Ayah audio']

source.peekChannelContents = function (url, _type) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.getHome().results.slice(0, 6)
  const reciter = reciterFromUrl(url)
  return [1, 2, 3, 4, 5, 6].map((surah) => surahToVideo(reciter, surah))
}

source.searchChannelContents = function (url, query, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.search(query, type, order, filters)
  const reciter = reciterFromUrl(url)
  return source.search(query, type, order, { ...filterObject(filters), reciter: reciterFilterLabel(reciter) })
}

source.searchPlaylists = function (query, _type, _order, filters) {
  ensureCatalog()
  const q = normalize(query)
  const playlists = []
  for (const reciter of selectedReciters(filters, q)) {
    for (const surah of selectedSurahs(filters, q, null, true)) {
      playlists.push(playlistToPlatform(reciter, surah))
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
  if (!match) throw new ScriptException('Unsupported EveryAyah playlist URL')
  const reciter = reciterById(match[1])
  const surah = Number(match[2])
  return playlistDetails(reciter, surah)
}

source.getChannelPlaylists = function (url) {
  ensureCatalog()
  if (REGEX.ROOT.test(String(url ?? ''))) return source.searchPlaylists('', null, null, null)
  const reciter = reciterFromUrl(url)
  return new ArrayPlaylistPager(
    surahIds().map((surah) => playlistToPlatform(reciter, surah)),
    DEFAULT_LIMIT
  )
}

source.isContentDetailsUrl = function (url) {
  return Boolean(ayahPartsFromUrl(url) || mediaPartsFromUrl(url))
}

source.getContentDetails = function (url) {
  ensureCatalog()
  const parts = ayahPartsFromUrl(url) || mediaPartsFromUrl(url)
  if (!parts) throw new ScriptException('Unsupported EveryAyah URL')
  const reciter = reciterById(parts.reciterId)
  return ayahToVideo(reciter, parts.surah, parts.ayah, String(url ?? ''))
}

function ensureCatalog() {
  if (state.reciters?.length && state.ayahCount?.length && Date.now() - Number(state.catalogFetchedAt || 0) < CACHE_MAX_AGE_MS) {
    return
  }

  const catalog = get_json(CATALOG_URL, DEFAULT_HEADERS)
  state.ayahCount = Array.isArray(catalog.ayahCount) ? catalog.ayahCount.map(Number) : []
  state.reciters = Object.keys(catalog)
    .filter((key) => /^\d+$/.test(key))
    .map((key) => ({ id: Number(key), ...catalog[key] }))
    .filter((reciter) => reciter.id && reciter.subfolder)
    .sort((a, b) => a.id - b.id)
  state.catalogFetchedAt = Date.now()
  buildIndexes()
}

function buildIndexes() {
  state.reciterById = {}
  state.reciterBySubfolder = {}
  for (const reciter of state.reciters ?? []) {
    state.reciterById[String(reciter.id)] = reciter
    state.reciterBySubfolder[String(reciter.subfolder)] = reciter
  }
}

function capabilities() {
  ensureCatalog()
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [reciterFilter(), surahFilter(), bitrateFilter()]
  }
}

function reciterFilter() {
  return {
    id: 'reciter',
    name: 'Reciter',
    isMultiSelect: false,
    filters: state.reciters.map((reciter) => ({
      id: reciterFilterLabel(reciter),
      name: reciterFilterLabel(reciter),
      value: reciterFilterLabel(reciter)
    }))
  }
}

function surahFilter() {
  return {
    id: 'surah',
    name: 'Surah',
    isMultiSelect: false,
    filters: surahIds().map((surah) => ({
      id: surahLabel(surah),
      name: surahLabel(surah),
      value: surahLabel(surah)
    }))
  }
}

function bitrateFilter() {
  const bitrates = []
  for (const reciter of state.reciters) {
    if (reciter.bitrate && bitrates.indexOf(reciter.bitrate) < 0) bitrates.push(reciter.bitrate)
  }
  return {
    id: 'bitrate',
    name: 'Bitrate',
    isMultiSelect: false,
    filters: bitrates.sort((a, b) => bitrateNumber(a) - bitrateNumber(b)).map((bitrate) => ({ id: bitrate, name: bitrate, value: bitrate }))
  }
}

function ayahToVideo(reciter, surah, ayah, requestedUrl = '') {
  const audioUrl = mediaUrl(reciter, surah, ayah)
  const details = grayjay.video(`${reciter.id}-${surah}-${ayah}`, {
    name: `${surahLabel(surah)}:${ayah} - ${reciter.name}`,
    thumbnails: staticThumbnails(),
    author: author(reciter),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: requestedUrl || ayahUrl(reciter.id, surah, ayah),
    description: [
      `Reciter: ${reciter.name}`,
      `Surah: ${surahLabel(surah)}`,
      `Ayah: ${ayah}`,
      `Bitrate: ${reciter.bitrate || 'Unknown'}`,
      `Source: ${audioUrl}`
    ].join('\n'),
    video: audio_source_descriptor({
      name: reciter.bitrate ? `MP3 ${reciter.bitrate}` : 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      bitrate: bitrateNumber(reciter.bitrate) * 1000,
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
    return new ArrayVideoPager(relatedAyahs(reciter, surah, ayah), DEFAULT_LIMIT)
  }

  return details
}

function surahToVideo(reciter, surah) {
  return grayjay.feed_video(`${reciter.id}-${surah}`, {
    name: `${surahLabel(surah)} - ${reciter.name}`,
    thumbnails: staticThumbnails(),
    author: author(reciter),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: ayahUrl(reciter.id, surah, 1),
    shareUrl: playlistUrl(reciter.id, surah)
  })
}

function relatedAyahs(reciter, surah, ayah) {
  const items = []
  if (ayah < ayahCount(surah)) items.push(ayahToVideo(reciter, surah, ayah + 1))
  if (ayah > 1) items.push(ayahToVideo(reciter, surah, ayah - 1))
  for (const other of state.reciters) {
    if (other.id !== reciter.id) items.push(ayahToVideo(other, surah, ayah))
    if (items.length >= 12) break
  }
  return dedupe_by_url(items)
}

function reciterToChannel(reciter) {
  return grayjay.channel(`reciter-${reciter.id}`, {
    name: reciter.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${reciter.name}\n${reciter.bitrate || ''}\nEveryAyah verse-by-verse Quran audio.`,
    url: channelUrl(reciter.id),
    urlAlternatives: [`${BASE_URL}/data/${reciter.subfolder}/`]
  })
}

function rootChannel() {
  return grayjay.channel('root', {
    name: DISPLAY_NAME,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'Verse-by-verse Quran MP3 recitations from EveryAyah.',
    url: BASE_URL,
    urlAlternatives: [BASE_URL, SITE_URL]
  })
}

function playlistToPlatform(reciter, surah) {
  return grayjay.playlist(`${reciter.id}-${surah}`, {
    name: `${surahLabel(surah)} - ${reciter.name}`,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: author(reciter),
    datetime: 0,
    url: playlistUrl(reciter.id, surah),
    videoCount: ayahCount(surah)
  })
}

function playlistDetails(reciter, surah) {
  const items = []
  for (let ayah = 1; ayah <= ayahCount(surah); ayah++) {
    items.push(ayahToVideo(reciter, surah, ayah))
  }

  return grayjay.playlist_details(`${reciter.id}-${surah}`, {
    name: `${surahLabel(surah)} - ${reciter.name}`,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: author(reciter),
    datetime: 0,
    url: playlistUrl(reciter.id, surah),
    videoCount: items.length,
    contents: new ArrayVideoPager(items, DEFAULT_LIMIT),
    shareUrl: `${BASE_URL}/data/${reciter.subfolder}/`
  })
}

function author(reciter) {
  return grayjay.author(`reciter-${reciter.id}`, reciter.name, channelUrl(reciter.id), iconUrl())
}

function selectedReciters(filters, query, reference = null) {
  const selected = selected_filter_values(filters, 'reciter').map(reciterIdFromFilter).filter(Boolean)
  const bitrates = selected_filter_values(filters, 'bitrate')
  const reciters = selected.length ? selected.map(reciterById) : state.reciters
  const filtered = reciters.filter((reciter) => {
    const bitrateMatches = !bitrates.length || bitrates.indexOf(String(reciter.bitrate ?? '')) >= 0
    const queryMatches = Boolean(reference) || !query || reciterMatches(reciter, query) || queryMentionsSurah(query)
    return bitrateMatches && queryMatches
  })
  return filtered.length ? filtered : state.reciters.slice(0, 1)
}

function selectedSurahs(filters, query, reference = null, broadDefault = false) {
  if (reference?.chapter) return [reference.chapter]
  const selected = selected_filter_values(filters, 'surah').map(surahIdFromFilter).filter(Boolean)
  if (selected.length) return selected
  if (query) {
    const matched = surahIds().filter((surah) => surahMatches(surah, query))
    if (matched.length) return matched
  }
  return broadDefault ? surahIds() : [1]
}

function reciterFromUrl(url) {
  const id = String(url ?? '').match(REGEX.CHANNEL)?.[1]
  return reciterById(id)
}

function reciterById(id) {
  const reciter = state.reciterById?.[String(id)]
  if (!reciter) throw new ScriptException('EveryAyah reciter not found')
  return reciter
}

function ayahPartsFromUrl(url) {
  const match = String(url ?? '').match(REGEX.AYAH)
  if (!match) return null
  return { reciterId: match[1], surah: Number(match[2]), ayah: Number(match[3]) }
}

function mediaPartsFromUrl(url) {
  const match = String(url ?? '').match(REGEX.MEDIA)
  if (!match) return null
  const reciter = state.reciterBySubfolder?.[match[1]]
  if (!reciter) return null
  return { reciterId: reciter.id, surah: Number(match[2]), ayah: Number(match[3]) }
}

function reciterIdFromFilter(value) {
  const text = String(value ?? '')
  const id = Number(text.match(/\((\d+)\)$/)?.[1])
  if (id) return id
  return Number(state.reciters.find((reciter) => reciter.name === text || reciterFilterLabel(reciter) === text)?.id)
}

function surahIdFromFilter(value) {
  const text = String(value ?? '')
  const id = Number(text.match(/\((\d+)\)$/)?.[1] ?? text)
  if (id >= 1 && id <= 114) return id
  return surahIds().find((surah) => normalize(surahLabel(surah)) === normalize(text))
}

function reciterMatches(reciter, query) {
  const q = normalize(query)
  return normalize(`${reciter.name} ${reciter.subfolder} ${reciter.bitrate}`).indexOf(q) >= 0
}

function surahMatches(surah, query) {
  const q = normalize(query)
  return normalize(`${surah} ${surahLabel(surah)} ${SURAH_NAMES[surah - 1]}`).indexOf(q) >= 0
}

function queryMentionsSurah(query) {
  return surahIds().some((surah) => surahMatches(surah, query))
}

function reciterFilterLabel(reciter) {
  return `${reciter.name}${reciter.bitrate ? ` - ${reciter.bitrate}` : ''} (${reciter.id})`
}

function surahLabel(surah) {
  return `${SURAH_NAMES[surah - 1] || `Surah ${surah}`} (${surah})`
}

function ayahCount(surah) {
  return Number(state.ayahCount[Number(surah) - 1] ?? 0)
}

function surahIds() {
  return state.ayahCount.map((_count, index) => index + 1)
}

function mediaUrl(reciter, surah, ayah) {
  return `${BASE_URL}/data/${reciter.subfolder}/${pad3(surah)}${pad3(ayah)}.mp3`
}

function channelUrl(reciterId) {
  return `everyayah://reciter/${reciterId}`
}

function playlistUrl(reciterId, surah) {
  return `everyayah://surah/${reciterId}/${surah}`
}

function ayahUrl(reciterId, surah, ayah) {
  return `everyayah://ayah/${reciterId}/${surah}/${ayah}`
}

function bitrateNumber(value) {
  return Number(String(value ?? '').match(/\d+/)?.[0] ?? 0)
}

function pad3(value) {
  return String(value).padStart(3, '0')
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
