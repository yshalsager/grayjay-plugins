import { content_thumbnails, plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json } from '@lib/http.js'
import { audio_source_descriptor, hls_source, hls_source_descriptor, video_source_descriptor } from '@lib/media.js'
import { array_pager_class } from '@lib/paging.js'

const PLATFORM = 'MP3Quran'
const API_BASE = 'https://www.mp3quran.net/api/v3'
const QURAN_TEXT_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quransimple'
const DEFAULT_LIMIT = 24
const DEFAULT_ICON = './Mp3QuranIcon.png'
const LANGUAGE_CODES = [
  'ar',
  'eng',
  'fr',
  'ru',
  'de',
  'es',
  'tr',
  'cn',
  'th',
  'ur',
  'bn',
  'bs',
  'ug',
  'fa',
  'tg',
  'ml',
  'tl',
  'id',
  'pt',
  'ha',
  'sw'
]
const HOME_MODES = {
  RADIOS: 0,
  RECITATIONS: 1,
  LIVE_TV: 2,
  RECENT_READS: 3,
  TAFSIR: 4,
  VIDEOS: 5
}
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': `grayjay.app/${bridge.buildVersion}`
}
const LABELS = {
  eng: {
    content: 'Content',
    surah: 'Surah',
    riwayah: 'Riwayah',
    videoType: 'Video type',
    tracks: 'Surah tracks',
    radios: 'Live radios',
    liveTv: 'Live TV',
    tafsirAudio: 'Tafsir audio',
    tafsirSource: 'Tafsir source',
    videos: 'Videos',
    video: 'Video',
    videoTypeFallback: 'Video type',
    reciter: 'Reciter',
    moshaf: 'Moshaf',
    pages: 'Pages',
    updated: 'Updated',
    source: 'Source',
    tafsir: 'Tafsir',
    type: 'Type',
    quranText: 'Quran text',
    opening: 'Opening',
    liveRadioDescription: 'Live Quran radio stream from MP3Quran.',
    liveTvDescription: 'Live TV stream from MP3Quran.'
  },
  ar: {
    content: 'المحتوى',
    surah: 'السورة',
    riwayah: 'الرواية',
    videoType: 'نوع الفيديو',
    tracks: 'تلاوات السور',
    radios: 'إذاعات مباشرة',
    liveTv: 'بث مباشر',
    tafsirAudio: 'تفسير صوتي',
    tafsirSource: 'مصدر التفسير',
    videos: 'مقاطع فيديو',
    video: 'فيديو',
    videoTypeFallback: 'نوع الفيديو',
    reciter: 'القارئ',
    moshaf: 'المصحف',
    pages: 'الصفحات',
    updated: 'آخر تحديث',
    source: 'المصدر',
    tafsir: 'التفسير',
    type: 'النوع',
    quranText: 'نص القرآن',
    opening: 'افتتاح',
    liveRadioDescription: 'بث إذاعي مباشر للقرآن من MP3Quran.',
    liveTvDescription: 'بث تلفزيوني مباشر من MP3Quran.'
  }
}

const REGEX = {
  ROOT_CHANNEL: /^https?:\/\/(?:www\.)?mp3quran\.net(?:\/.*)?$/,
  CHANNEL: /^mp3quran:\/\/reciter\/(\d+)$/,
  MOSHAF_PLAYLIST: /^mp3quran:\/\/playlist\/moshaf\/(\d+)\/(\d+)$/,
  TAFSIR_PLAYLIST: /^mp3quran:\/\/playlist\/tafsir\/(\d+)$/,
  VIDEO_TYPE_PLAYLIST: /^mp3quran:\/\/playlist\/video-type\/(\d+)$/,
  TRACK: /^mp3quran:\/\/track\/(\d+)\/(\d+)\/(\d+)$/,
  RADIO: /^mp3quran:\/\/radio\/(\d+)$/,
  LIVE_TV: /^mp3quran:\/\/live-tv\/(\d+)$/,
  TAFSIR: /^mp3quran:\/\/tafsir\/(\d+)\/(\d+)$/,
  VIDEO: /^mp3quran:\/\/video\/(\d+)\/(\d+)$/
}

let _config = {}
let _settings = {}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)
let timingReadsAttempted = false
let state = {
  language: '',
  reciters: [],
  suwar: [],
  riwayat: [],
  radios: [],
  liveTv: [],
  recentReads: [],
  tafasir: [],
  tafsirItems: [],
  videos: [],
  videoTypes: [],
  timingReads: [],
  reciterById: {},
  surahById: {},
  radioById: {},
  liveTvById: {},
  tafsirByKey: {},
  videoByKey: {},
  videoTypeById: {},
  timingReadByFolder: {}
}

let quranTextBySurah = {}

source.enable = function (conf, settings, savedState) {
  _config = conf ?? {}
  _settings = settings ?? {}

  if (savedState) {
    try {
      state = JSON.parse(savedState)
    } catch (e) {
      logIfTesting('Failed to parse saved MP3Quran state: ' + e)
    }
  }
}

source.saveState = function () {
  return JSON.stringify(state)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

function contentThumbnails(url) {
  return content_thumbnails(_config, DEFAULT_ICON, url)
}

function text(key) {
  return LABELS[state.language]?.[key] ?? LABELS.eng[key] ?? key
}

source.getHome = function () {
  ensureCatalog()

  const homeMode = Number(_settings.homeMode ?? 0)

  if (homeMode === HOME_MODES.RECITATIONS) {
    return new ArrayVideoPager(buildCompleteTracks(), DEFAULT_LIMIT)
  }

  if (homeMode === HOME_MODES.LIVE_TV) {
    return new ArrayVideoPager(state.liveTv.map(liveTvToVideo), DEFAULT_LIMIT)
  }

  if (homeMode === HOME_MODES.RECENT_READS) {
    return new ArrayVideoPager(buildRecentReadTracks(), DEFAULT_LIMIT)
  }

  if (homeMode === HOME_MODES.TAFSIR) {
    return new ArrayVideoPager(state.tafsirItems.map(tafsirToVideo), DEFAULT_LIMIT)
  }

  if (homeMode === HOME_MODES.VIDEOS) {
    return new ArrayVideoPager(state.videos.map(mp3VideoToVideo), DEFAULT_LIMIT)
  }

  return new ArrayVideoPager(state.radios.map(radioToVideo), DEFAULT_LIMIT)
}

Type.Order.Popularity = 'Popularity'

source.getSearchCapabilities = () => getSearchCapabilities()

source.searchSuggestions = function (query) {
  ensureCatalog()
  const q = normalize(query)
  if (!q) {
    return []
  }

  const suggestions = [
    text('tracks'),
    text('radios'),
    text('liveTv'),
    text('tafsirAudio'),
    text('videos'),
    ...state.reciters.map((reciter) => reciter.name),
    ...state.reciters.flatMap((reciter) => (reciter.moshaf ?? []).flatMap((moshaf) => [moshaf.name, `${reciter.name} - ${moshaf.name}`])),
    ...state.suwar.map(surahFilterLabel),
    ...state.radios.map((radio) => radio.name),
    ...state.liveTv.map((tv) => tv.name),
    ...state.tafasir.map((tafsir) => tafsir.name),
    ...state.tafsirItems.map((tafsir) => tafsir.name),
    ...state.videoTypes.map((videoType) => videoType.video_type),
    ...state.videos.flatMap((video) => [video.reciter_name, `${video.reciter_name} - ${getVideoTypeName(video.video_type)}`])
  ]

  return dedupeStrings(suggestions)
    .filter((name) => normalize(name).indexOf(q) >= 0)
    .slice(0, 10)
}

source.search = function (query, type, order, filters) {
  ensureCatalog()
  const q = normalize(query)

  if (!q && !hasSearchFilters(filters)) {
    return source.getHome()
  }

  const results = []

  if (contentAllowed(filters, 'live-tv')) {
    results.push(...state.liveTv.filter((tv) => liveTvMatches(tv, q)).map(liveTvToVideo))
  }

  if (contentAllowed(filters, 'radios')) {
    results.push(...state.radios.filter((radio) => radioMatches(radio, q)).map(radioToVideo))
  }

  if (contentAllowed(filters, 'tracks')) {
    results.push(...tracksFromReciters(state.reciters, q, filters))
  }

  if (contentAllowed(filters, 'tafsir')) {
    results.push(...tafsirTracks(q, filters))
  }

  if (contentAllowed(filters, 'videos')) {
    results.push(...mp3Videos(q, filters))
  }

  return new ArrayVideoPager(results, DEFAULT_LIMIT)
}

source.searchChannels = function (query) {
  ensureCatalog()
  const q = normalize(query)
  const channels = state.reciters.filter((reciter) => !q || normalize(reciter.name).indexOf(q) >= 0).map(reciterToChannel)

  return new ArrayChannelPager(channels, DEFAULT_LIMIT)
}

source.searchPlaylists = function (query, type, order, filters) {
  ensureCatalog()
  return new ArrayPlaylistPager(mp3Playlists(query, filters), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return REGEX.ROOT_CHANNEL.test(url) || REGEX.CHANNEL.test(url)
}

source.getChannel = function (url) {
  ensureCatalog()
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return rootChannel()
  }

  return reciterToChannel(getReciterFromUrl(url))
}

source.isPlaylistUrl = function (url) {
  return REGEX.MOSHAF_PLAYLIST.test(url) || REGEX.TAFSIR_PLAYLIST.test(url) || REGEX.VIDEO_TYPE_PLAYLIST.test(url)
}

source.getPlaylist = function (url) {
  ensureCatalog()
  return getMp3Playlist(url)
}

source.getChannelPlaylists = function (url) {
  ensureCatalog()
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return new ArrayPlaylistPager(mp3Playlists('', null), DEFAULT_LIMIT)
  }

  const reciter = getReciterFromUrl(url)
  return new ArrayPlaylistPager(
    (reciter.moshaf ?? []).map((moshaf) => moshafToPlaylist(reciter, moshaf)),
    DEFAULT_LIMIT
  )
}

source.getSearchChannelContentsCapabilities = () => getTrackCapabilities()

source.getChannelCapabilities = () => getTrackCapabilities()

source.getPeekChannelTypes = () => [text('tracks'), text('videos')]

source.peekChannelContents = function (url, type) {
  ensureCatalog()
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return source.getHome().results.slice(0, 6)
  }

  const reciter = getReciterFromUrl(url)
  const peekType = normalize(type)

  if (peekType === normalize(text('videos')) || peekType === 'videos') {
    return mp3Videos('', { reciter: reciter.name }).slice(0, 6)
  }

  const moshaf = primaryMoshaf(reciter)
  if (!moshaf) {
    return []
  }

  return parseSurahList(moshaf.surah_list)
    .slice(0, 6)
    .map((surahId) => trackToVideo(reciter, moshaf, surahId))
}

source.searchChannelContents = function (url, query, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return source.search(query, type, order, filters)
  }

  const q = normalize(query)
  const reciter = getReciterFromUrl(url)

  return new ArrayVideoPager(reciterTracks(reciter, q, filters), DEFAULT_LIMIT)
}

source.getChannelContents = function (url, type, order, filters) {
  ensureCatalog()
  if (REGEX.ROOT_CHANNEL.test(url)) {
    return source.getHome()
  }

  return new ArrayVideoPager(reciterTracks(getReciterFromUrl(url), '', filters), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  return REGEX.TRACK.test(url) || REGEX.RADIO.test(url) || REGEX.LIVE_TV.test(url) || REGEX.TAFSIR.test(url) || REGEX.VIDEO.test(url)
}

source.getContentDetails = function (url) {
  ensureCatalog()

  let match = url.match(REGEX.RADIO)
  if (match) {
    const radio = state.radioById[match[1]]
    if (!radio) {
      throw new ScriptException('Radio not found')
    }
    return radioToVideo(radio)
  }

  match = url.match(REGEX.LIVE_TV)
  if (match) {
    const liveTv = state.liveTvById[match[1]]
    if (!liveTv) {
      throw new ScriptException('Live TV channel not found')
    }
    return liveTvToVideo(liveTv)
  }

  match = url.match(REGEX.TAFSIR)
  if (match) {
    const tafsir = state.tafsirByKey[tafsirKey(match[1], match[2])]
    if (!tafsir) {
      throw new ScriptException('Tafsir item not found')
    }
    return tafsirToVideo(tafsir)
  }

  match = url.match(REGEX.VIDEO)
  if (match) {
    const video = state.videoByKey[videoKey(match[1], match[2])]
    if (!video) {
      throw new ScriptException('MP3Quran video not found')
    }
    return mp3VideoToVideo(video)
  }

  match = url.match(REGEX.TRACK)
  if (!match) {
    throw new ScriptException('Unsupported MP3Quran URL')
  }

  const reciter = state.reciterById[match[1]]
  const moshaf = reciter?.moshaf?.find((m) => String(m.id) === match[2])
  const surahId = Number(match[3])

  if (!reciter || !moshaf || !state.surahById[surahId]) {
    throw new ScriptException('Track not found')
  }

  return trackToVideo(reciter, moshaf, surahId)
}

source.getContentChapters = function (url) {
  ensureCatalog()
  const track = trackFromUrl(url)
  if (!track) {
    return []
  }

  try {
    const versesByNumber = versesByAyah(surahText(track.surahId))
    return trackTiming(track.moshaf, track.surahId)
      .filter((timing) => Number(timing.end_time) > Number(timing.start_time))
      .map((timing) => ({
        name: chapterLabel(track.surahId, timing, versesByNumber),
        timeStart: Number(timing.start_time) / 1000,
        timeEnd: Number(timing.end_time) / 1000,
        type: Type.Chapter.NORMAL
      }))
  } catch (e) {
    logIfTesting('Failed to load chapters: ' + e)
    return []
  }
}

function ensureCatalog() {
  const language = LANGUAGE_CODES[Number(_settings.language ?? 0)] ?? 'ar'

  if (
    state.language === language &&
    state.reciters?.length &&
    state.suwar?.length &&
    state.riwayat?.length &&
    state.radios?.length &&
    state.liveTv?.length &&
    state.recentReads?.length &&
    Array.isArray(state.tafsirItems) &&
    Array.isArray(state.videos) &&
    Array.isArray(state.videoTypes) &&
    Array.isArray(state.timingReads)
  ) {
    sortCatalog()
    rebuildIndexes()
    return
  }

  state.language = language
  state.reciters = callJson(`${API_BASE}/reciters?language=${language}`).reciters ?? []
  state.suwar = callJson(`${API_BASE}/suwar?language=${language}`).suwar ?? []
  state.riwayat = callJson(`${API_BASE}/riwayat?language=${language}`).riwayat ?? []
  state.radios = callJson(`${API_BASE}/radios?language=${language}`).radios ?? []
  state.liveTv = callJson(`${API_BASE}/live-tv?language=${language}`).livetv ?? []
  state.recentReads = callJson(`${API_BASE}/recent_reads?language=${language}`).reads ?? []
  const tafsir = loadTafsir(language)
  state.tafasir = tafsir.catalog
  state.tafsirItems = tafsir.items
  state.videoTypes = callJson(`${API_BASE}/video_types?language=${language}`).video_types ?? []
  state.videos = flattenVideos(callJson(`${API_BASE}/videos?language=${language}`).videos ?? [])
  state.timingReads = loadTimingReads()
  sortCatalog()
  rebuildIndexes()
}

function sortCatalog() {
  state.reciters = sortByName(state.reciters)
}

function rebuildIndexes() {
  state.reciterById = {}
  state.surahById = {}
  state.radioById = {}
  state.liveTvById = {}
  state.tafsirByKey = {}
  state.videoByKey = {}
  state.videoTypeById = {}
  state.timingReadByFolder = {}

  for (const reciter of state.reciters ?? []) {
    state.reciterById[String(reciter.id)] = reciter
  }
  for (const surah of state.suwar ?? []) {
    state.surahById[Number(surah.id)] = surah
  }
  for (const radio of state.radios ?? []) {
    state.radioById[String(radio.id)] = radio
  }
  for (const liveTv of state.liveTv ?? []) {
    state.liveTvById[String(liveTv.id)] = liveTv
  }
  for (const tafsir of state.tafsirItems ?? []) {
    state.tafsirByKey[tafsirKey(tafsir.tafsir_id, tafsir.id)] = tafsir
  }
  for (const video of state.videos ?? []) {
    state.videoByKey[videoKey(video.reciter_id, video.id)] = video
  }
  for (const videoType of state.videoTypes ?? []) {
    state.videoTypeById[String(videoType.id)] = videoType
  }
  for (const read of state.timingReads ?? []) {
    state.timingReadByFolder[normalizeFolderUrl(read.folder_url)] = read
  }
}

function loadTafsir(language) {
  let catalog = callJson(`${API_BASE}/tafasir?language=${language}`).tafasir ?? []
  let tafsirLanguage = language

  if (!catalog.length && language !== 'ar') {
    catalog = callJson(`${API_BASE}/tafasir?language=ar`).tafasir ?? []
    tafsirLanguage = 'ar'
  }

  const items = []
  for (const tafsir of catalog) {
    const details = callJson(`${API_BASE}/tafsir?tafsir=${tafsir.id}&language=${tafsirLanguage}`).tafasir
    for (const item of details?.soar ?? []) {
      items.push({
        ...item,
        tafsir_id: item.tafsir_id ?? tafsir.id,
        tafsir_name: details.name ?? tafsir.name
      })
    }
  }

  return { catalog, items }
}

function loadTimingReads() {
  timingReadsAttempted = true
  try {
    return callJson(`${API_BASE}/ayat_timing/reads`) ?? []
  } catch (e) {
    logIfTesting('Failed to load timing reads: ' + e)
    return []
  }
}

function flattenVideos(groups) {
  const videos = []

  for (const group of groups ?? []) {
    for (const video of group.videos ?? []) {
      videos.push({
        ...video,
        reciter_id: group.id,
        reciter_name: group.reciter_name
      })
    }
  }

  return videos
}

function buildCompleteTracks() {
  const tracks = []

  for (const reciter of state.reciters) {
    const moshaf = primaryMoshaf(reciter)
    if (!moshaf) {
      continue
    }
    tracks.push(trackToVideo(reciter, moshaf, parseSurahList(moshaf.surah_list)[0] ?? 1))
  }

  return tracks
}

function buildRecentReadTracks() {
  const tracks = []

  for (const reciter of state.recentReads ?? []) {
    for (const moshaf of reciter.moshaf ?? []) {
      const firstSurah = parseSurahList(moshaf.surah_list)[0]
      if (firstSurah) {
        tracks.push(trackToVideo(reciter, moshaf, firstSurah))
      }
    }
  }

  return tracks
}

function reciterTracks(reciter, query = '', filters = null) {
  return tracksFromReciters([reciter], query, filters)
}

function primaryMoshaf(reciter) {
  return (reciter.moshaf ?? []).find((m) => Number(m.surah_total) === 114) ?? reciter.moshaf?.[0] ?? null
}

function tracksFromReciters(reciters, query, filters) {
  const tracks = []
  const q = normalize(query)
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)
  const selectedRiwayahIds = selectedFilterValues(filters, 'riwayah').map(riwayahIdFromFilter).filter(Boolean)
  const selectedReciterIds = selectedFilterValues(filters, 'reciter').map(reciterIdFromFilter).filter(Boolean)

  for (const reciter of reciters) {
    if (selectedReciterIds.length && selectedReciterIds.indexOf(Number(reciter.id)) < 0) {
      continue
    }

    for (const moshaf of reciter.moshaf ?? []) {
      if (selectedRiwayahIds.length && selectedRiwayahIds.indexOf(Number(moshaf.rewaya_id)) < 0) {
        continue
      }

      const moshafSurahIds = parseSurahList(moshaf.surah_list)
      const targetSurahIds = selectedSurahIds.length
        ? selectedSurahIds.filter((surahId) => moshafSurahIds.indexOf(surahId) >= 0)
        : moshafSurahIds

      for (const surahId of targetSurahIds) {
        const surah = state.surahById[surahId]
        if (!q || trackMatches(reciter, moshaf, surah, q)) {
          tracks.push(trackToVideo(reciter, moshaf, surahId))
        }
      }
    }
  }

  return tracks
}

function tafsirTracks(query, filters) {
  const q = normalize(query)
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)
  const selectedTafsirIds = selectedFilterValues(filters, 'tafsir-source').map(tafsirIdFromFilter).filter(Boolean)

  return (state.tafsirItems ?? [])
    .filter((item) => !selectedTafsirIds.length || selectedTafsirIds.indexOf(Number(item.tafsir_id)) >= 0)
    .filter((item) => !selectedSurahIds.length || selectedSurahIds.indexOf(Number(item.sura_id)) >= 0)
    .filter((item) => !q || tafsirMatches(item, q))
    .map(tafsirToVideo)
}

function mp3Videos(query, filters) {
  const q = normalize(query)
  const selectedVideoTypeIds = selectedFilterValues(filters, 'video-type').map(videoTypeIdFromFilter).filter(Boolean)
  const selectedReciterIds = selectedFilterValues(filters, 'reciter').map(reciterIdFromFilter).filter(Boolean)

  return (state.videos ?? [])
    .filter((video) => !selectedReciterIds.length || selectedReciterIds.indexOf(Number(video.reciter_id)) >= 0)
    .filter((video) => !selectedVideoTypeIds.length || selectedVideoTypeIds.indexOf(Number(video.video_type)) >= 0)
    .filter((video) => !q || mp3VideoMatches(video, q))
    .map(mp3VideoToVideo)
}

function trackToVideo(reciter, moshaf, surahId) {
  const surah = state.surahById[Number(surahId)] ?? {
    id: surahId,
    name: `${text('surah')} ${surahId}`
  }
  const audioUrl = `${trimSlash(moshaf.server)}/${padSurah(surahId)}.mp3`
  const name = `${surahName(surah)} - ${reciter.name}`
  const author = reciterToAuthor(reciter)

  const details = grayjay.video(`${reciter.id}-${moshaf.id}-${surahId}`, {
    name,
    thumbnails: contentThumbnails(reciterThumbnailUrl(reciter.id)),
    author,
    uploadDate: unixDate(reciter.recent_date),
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: trackUrl(reciter.id, moshaf.id, surahId),
    description: trackDescription(reciter, moshaf, surah, audioUrl),
    video: audio_source_descriptor({ name: 'MP3 Audio', url: audioUrl, language: state.language }),
    subtitles: trackSubtitles(moshaf, surahId),
    shareUrl: audioUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(
      reciterTracks(reciter, '', null).filter((video) => video.url !== details.url),
      DEFAULT_LIMIT
    )
  }

  return details
}

function trackDescription(reciter, moshaf, surah, audioUrl) {
  const lines = [
    `${text('reciter')}: ${reciter.name}`,
    `${text('moshaf')}: ${moshaf.name}`,
    `${text('surah')}: ${surahName(surah)} (${surah.id})`,
    `${text('pages')}: ${surah.start_page ?? '-'}-${surah.end_page ?? '-'}`
  ]

  if (reciter.recent_date) {
    lines.push(`${text('updated')}: ${reciter.recent_date}`)
  }

  lines.push(`${text('source')}: ${audioUrl}`)
  return lines.join('\n')
}

function trackSubtitles(moshaf, surahId) {
  if (!timingReadForMoshaf(moshaf)) {
    return []
  }

  try {
    return [
      {
        name: text('quranText'),
        language: 'ar',
        format: 'text/vtt',
        url: `data:text/vtt;charset=utf-8,${encodeURIComponent(buildTrackWebVtt(moshaf, surahId))}`
      }
    ]
  } catch (e) {
    logIfTesting('Failed to build Quran subtitles: ' + e)
    return []
  }
}

function buildTrackWebVtt(moshaf, surahId) {
  const versesByNumber = versesByAyah(surahText(surahId))
  const cues = trackTiming(moshaf, surahId)
    .filter((timing) => versesByNumber[Number(timing.ayah)])
    .filter((timing) => Number(timing.end_time) > Number(timing.start_time))
    .map(
      (timing) =>
        `${vttTimestamp(timing.start_time)} --> ${vttTimestamp(timing.end_time)}\n${versesByNumber[Number(timing.ayah)].text.trim()}`
    )

  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

function chapterLabel(surahId, timing, versesByNumber) {
  const ayah = Number(timing.ayah)
  if (!ayah) {
    return text('opening')
  }

  const verseText = versesByNumber[ayah]?.text?.trim()
  return verseText ? `${surahId}:${ayah} ${verseText}` : `${text('surah')} ${surahId}:${ayah}`
}

function surahText(surahId) {
  const key = String(surahId)
  if (!quranTextBySurah[key]) {
    quranTextBySurah[key] = callJson(`${QURAN_TEXT_BASE}/${surahId}.min.json`).chapter ?? []
  }
  return quranTextBySurah[key]
}

function versesByAyah(verses) {
  const byAyah = {}
  for (const verse of verses ?? []) {
    byAyah[Number(verse.verse)] = verse
  }
  return byAyah
}

function trackTiming(moshaf, surahId) {
  const read = timingReadForMoshaf(moshaf)
  if (!read) {
    return []
  }

  return callJson(`${API_BASE}/ayat_timing?read=${read.id}&sura=${surahId}`) ?? []
}

function timingReadForMoshaf(moshaf) {
  if (!Array.isArray(state.timingReads)) {
    state.timingReads = []
  }

  if (!timingReadsAttempted && !state.timingReads.length) {
    state.timingReads = loadTimingReads()
    rebuildTimingIndex()
  }

  return state.timingReadByFolder?.[normalizeFolderUrl(moshaf.server)] ?? null
}

function rebuildTimingIndex() {
  state.timingReadByFolder = {}
  for (const read of state.timingReads ?? []) {
    state.timingReadByFolder[normalizeFolderUrl(read.folder_url)] = read
  }
}

function tafsirToVideo(item) {
  const audioUrl = item.url.trim()
  const surah = state.surahById[Number(item.sura_id)]

  const details = grayjay.video(`tafsir-${item.tafsir_id}-${item.id}`, {
    name: item.name,
    thumbnails: staticThumbnails(),
    author: grayjay.author(`tafsir-${item.tafsir_id}`, item.tafsir_name, 'https://mp3quran.net', iconUrl()),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: tafsirUrl(item.tafsir_id, item.id),
    description: tafsirDescription(item, surah, audioUrl),
    video: audio_source_descriptor({ name: 'Tafsir MP3', url: audioUrl, language: state.language }),
    shareUrl: audioUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(
      (state.tafsirItems ?? [])
        .filter(
          (other) =>
            Number(other.sura_id) === Number(item.sura_id) && tafsirKey(other.tafsir_id, other.id) !== tafsirKey(item.tafsir_id, item.id)
        )
        .map(tafsirToVideo),
      DEFAULT_LIMIT
    )
  }

  return details
}

function tafsirDescription(item, surah, audioUrl) {
  return [
    `${text('tafsir')}: ${item.tafsir_name}`,
    `${text('surah')}: ${surah ? `${surahName(surah)} (${surah.id})` : item.sura_id}`,
    `${text('source')}: ${audioUrl}`
  ].join('\n')
}

function radioToVideo(radio) {
  return grayjay.video(`radio-${radio.id}`, {
    name: radio.name,
    thumbnails: staticThumbnails(),
    author: grayjay.author('radio', 'MP3Quran Radio', 'https://mp3quran.net', iconUrl()),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: true,
    url: radioUrl(radio.id),
    description: `${text('liveRadioDescription')}\n\n${text('updated')}: ${radio.recent_date ?? '-'}\n${text('source')}: ${radio.url}`,
    video: audio_source_descriptor({ name: 'Live MP3', url: radio.url.trim(), duration: -1, language: state.language }),
    shareUrl: radio.url.trim()
  })
}

function mp3VideoToVideo(video) {
  const videoUrl = video.video_url.trim()
  const videoTypeName = getVideoTypeName(video.video_type)
  const title = `${video.reciter_name} - ${videoTypeName} (${text('video')} #${video.id})`

  const details = grayjay.video(`video-${video.reciter_id}-${video.id}`, {
    name: title,
    thumbnails: contentThumbnails(video.video_thumb_url),
    author: grayjay.author(video.reciter_id, video.reciter_name, reciterUrl(video.reciter_id), iconUrl()),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: videoUrlFor(video.reciter_id, video.id),
    description: mp3VideoDescription(video, videoTypeName, videoUrl),
    video: video_source_descriptor({ name: 'MP4 Video', url: videoUrl }),
    shareUrl: videoUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(relatedMp3Videos(video).map(mp3VideoToVideo), DEFAULT_LIMIT)
  }

  return details
}

function mp3VideoDescription(video, videoTypeName, videoUrl) {
  return [
    `${text('reciter')}: ${video.reciter_name}`,
    `${text('type')}: ${videoTypeName}`,
    `${text('video')}: #${video.id}`,
    `${text('source')}: ${videoUrl}`
  ].join('\n')
}

function relatedMp3Videos(current) {
  return (state.videos ?? [])
    .filter((video) => videoKey(video.reciter_id, video.id) !== videoKey(current.reciter_id, current.id))
    .filter((video) => Number(video.reciter_id) === Number(current.reciter_id) || Number(video.video_type) === Number(current.video_type))
    .sort((a, b) => videoRelationScore(current, b) - videoRelationScore(current, a))
}

function videoRelationScore(current, video) {
  return (
    (Number(video.reciter_id) === Number(current.reciter_id) ? 2 : 0) + (Number(video.video_type) === Number(current.video_type) ? 1 : 0)
  )
}

function liveTvToVideo(liveTv) {
  const hls = hls_source({
    name: 'Live HLS',
    url: liveTv.url.trim(),
    language: state.language
  })

  return grayjay.video(`live-tv-${liveTv.id}`, {
    name: liveTv.name,
    thumbnails: staticThumbnails(),
    author: grayjay.author('live-tv', 'MP3Quran Live TV', 'https://mp3quran.net/live', iconUrl()),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: true,
    url: liveTvUrl(liveTv.id),
    description: `${text('liveTvDescription')}\n\n${text('source')}: ${liveTv.url}`,
    video: hls_source_descriptor(hls),
    live: hls,
    shareUrl: liveTv.url.trim()
  })
}

function reciterToAuthor(reciter) {
  return grayjay.author(reciter.id, reciter.name, reciterUrl(reciter.id), reciterThumbnailUrl(reciter.id) || iconUrl())
}

function rootChannel() {
  return grayjay.channel('root', {
    name: 'MP3Quran',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'MP3Quran reciters, tracks, tafsir audio, videos, live radio, and live TV.',
    url: 'https://mp3quran.net',
    urlAlternatives: ['https://www.mp3quran.net']
  })
}

function reciterToChannel(reciter) {
  return grayjay.channel(reciter.id, {
    name: reciter.name,
    thumbnail: reciterThumbnailUrl(reciter.id) || iconUrl(),
    banner: reciterThumbnailUrl(reciter.id) || iconUrl(),
    description: `${reciter.name}\n\n${(reciter.moshaf ?? []).map((m) => `${m.name}: ${m.surah_total} surah`).join('\n')}`,
    url: reciterUrl(reciter.id),
    urlAlternatives: [reciterUrl(reciter.id)]
  })
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

function mp3Playlists(query, filters) {
  const q = normalize(query)
  const playlists = []

  if (contentAllowed(filters, 'tracks')) {
    for (const reciter of state.reciters ?? []) {
      for (const moshaf of reciter.moshaf ?? []) {
        if (moshafMatchesFilters(reciter, moshaf, filters)) {
          playlists.push(moshafToPlaylist(reciter, moshaf))
        }
      }
    }
  }

  if (contentAllowed(filters, 'tafsir')) {
    playlists.push(...tafsirPlaylists(filters))
  }

  if (contentAllowed(filters, 'videos')) {
    playlists.push(...videoTypePlaylists(filters))
  }

  return playlists.filter((playlist) => playlistMatches(playlist, q))
}

function moshafToPlaylist(reciter, moshaf) {
  const thumbnail = reciterThumbnailUrl(reciter.id) || iconUrl()
  return grayjay.playlist(`playlist-moshaf-${reciter.id}-${moshaf.id}`, {
    name: `${reciter.name} - ${moshaf.name}`,
    thumbnails: contentThumbnails(thumbnail),
    author: reciterToAuthor(reciter),
    datetime: unixDate(reciter.recent_date),
    url: moshafPlaylistUrl(reciter.id, moshaf.id),
    videoCount: parseSurahList(moshaf.surah_list).length,
    thumbnail
  })
}

function moshafToPlaylistDetails(reciter, moshaf) {
  return grayjay.playlist_details(`playlist-moshaf-${reciter.id}-${moshaf.id}`, {
    name: `${reciter.name} - ${moshaf.name}`,
    thumbnails: contentThumbnails(reciterThumbnailUrl(reciter.id) || iconUrl()),
    author: reciterToAuthor(reciter),
    datetime: unixDate(reciter.recent_date),
    url: moshafPlaylistUrl(reciter.id, moshaf.id),
    videoCount: parseSurahList(moshaf.surah_list).length,
    thumbnail: reciterThumbnailUrl(reciter.id) || iconUrl(),
    contents: new ArrayVideoPager(
      parseSurahList(moshaf.surah_list).map((surahId) => trackToVideo(reciter, moshaf, surahId)),
      DEFAULT_LIMIT
    )
  })
}

function tafsirPlaylists(filters) {
  const selectedTafsirIds = selectedFilterValues(filters, 'tafsir-source').map(tafsirIdFromFilter).filter(Boolean)
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)

  return (state.tafasir ?? [])
    .filter((tafsir) => !selectedTafsirIds.length || selectedTafsirIds.indexOf(Number(tafsir.id)) >= 0)
    .filter(
      (tafsir) =>
        !selectedSurahIds.length ||
        (state.tafsirItems ?? []).some(
          (item) => Number(item.tafsir_id) === Number(tafsir.id) && selectedSurahIds.indexOf(Number(item.sura_id)) >= 0
        )
    )
    .map(tafsirToPlaylist)
}

function tafsirToPlaylist(tafsir) {
  const items = tafsirItemsForSource(tafsir.id)
  return grayjay.playlist(`playlist-tafsir-${tafsir.id}`, {
    name: tafsir.name,
    thumbnails: staticThumbnails(),
    author: mp3QuranAuthor('tafsir', text('tafsirAudio')),
    datetime: 0,
    url: tafsirPlaylistUrl(tafsir.id),
    videoCount: items.length,
    thumbnail: iconUrl()
  })
}

function tafsirToPlaylistDetails(tafsir) {
  const items = tafsirItemsForSource(tafsir.id)
  return grayjay.playlist_details(`playlist-tafsir-${tafsir.id}`, {
    name: tafsir.name,
    thumbnails: staticThumbnails(),
    author: mp3QuranAuthor('tafsir', text('tafsirAudio')),
    datetime: 0,
    url: tafsirPlaylistUrl(tafsir.id),
    videoCount: items.length,
    thumbnail: iconUrl(),
    contents: new ArrayVideoPager(items.map(tafsirToVideo), DEFAULT_LIMIT)
  })
}

function videoTypePlaylists(filters) {
  const selectedVideoTypeIds = selectedFilterValues(filters, 'video-type').map(videoTypeIdFromFilter).filter(Boolean)
  const selectedReciterIds = selectedFilterValues(filters, 'reciter').map(reciterIdFromFilter).filter(Boolean)

  return (state.videoTypes ?? [])
    .filter((videoType) => !selectedVideoTypeIds.length || selectedVideoTypeIds.indexOf(Number(videoType.id)) >= 0)
    .filter(
      (videoType) =>
        !selectedReciterIds.length ||
        (state.videos ?? []).some(
          (video) => Number(video.video_type) === Number(videoType.id) && selectedReciterIds.indexOf(Number(video.reciter_id)) >= 0
        )
    )
    .map(videoTypeToPlaylist)
}

function videoTypeToPlaylist(videoType) {
  const items = videosForType(videoType.id)
  const thumbnail = items.find((video) => video.video_thumb_url)?.video_thumb_url || iconUrl()
  return grayjay.playlist(`playlist-video-type-${videoType.id}`, {
    name: videoType.video_type,
    thumbnails: contentThumbnails(thumbnail),
    author: mp3QuranAuthor('videos', text('videos')),
    datetime: 0,
    url: videoTypePlaylistUrl(videoType.id),
    videoCount: items.length,
    thumbnail
  })
}

function videoTypeToPlaylistDetails(videoType) {
  const items = videosForType(videoType.id)
  const thumbnail = items.find((video) => video.video_thumb_url)?.video_thumb_url || iconUrl()
  return grayjay.playlist_details(`playlist-video-type-${videoType.id}`, {
    name: videoType.video_type,
    thumbnails: contentThumbnails(thumbnail),
    author: mp3QuranAuthor('videos', text('videos')),
    datetime: 0,
    url: videoTypePlaylistUrl(videoType.id),
    videoCount: items.length,
    thumbnail,
    contents: new ArrayVideoPager(items.map(mp3VideoToVideo), DEFAULT_LIMIT)
  })
}

function getMp3Playlist(url) {
  let match = url.match(REGEX.MOSHAF_PLAYLIST)
  if (match) {
    const reciter = state.reciterById[match[1]]
    const moshaf = reciter?.moshaf?.find((item) => String(item.id) === match[2])
    if (!reciter || !moshaf) {
      throw new ScriptException('Moshaf playlist not found')
    }
    return moshafToPlaylistDetails(reciter, moshaf)
  }

  match = url.match(REGEX.TAFSIR_PLAYLIST)
  if (match) {
    const tafsir = (state.tafasir ?? []).find((item) => String(item.id) === match[1])
    if (!tafsir) {
      throw new ScriptException('Tafsir playlist not found')
    }
    return tafsirToPlaylistDetails(tafsir)
  }

  match = url.match(REGEX.VIDEO_TYPE_PLAYLIST)
  if (match) {
    const videoType = state.videoTypeById[match[1]]
    if (!videoType) {
      throw new ScriptException('Video playlist not found')
    }
    return videoTypeToPlaylistDetails(videoType)
  }

  throw new ScriptException('Unsupported MP3Quran playlist URL')
}

function moshafMatchesFilters(reciter, moshaf, filters) {
  const selectedReciterIds = selectedFilterValues(filters, 'reciter').map(reciterIdFromFilter).filter(Boolean)
  const selectedRiwayahIds = selectedFilterValues(filters, 'riwayah').map(riwayahIdFromFilter).filter(Boolean)
  const selectedSurahIds = selectedFilterValues(filters, 'surah').map(surahIdFromFilter).filter(Boolean)

  return (
    (!selectedReciterIds.length || selectedReciterIds.indexOf(Number(reciter.id)) >= 0) &&
    (!selectedRiwayahIds.length || selectedRiwayahIds.indexOf(Number(moshaf.rewaya_id)) >= 0) &&
    (!selectedSurahIds.length || selectedSurahIds.some((surahId) => parseSurahList(moshaf.surah_list).indexOf(surahId) >= 0))
  )
}

function playlistMatches(playlist, query) {
  return !query || normalize(playlist.name).indexOf(query) >= 0 || normalize(playlist.author?.name).indexOf(query) >= 0
}

function tafsirItemsForSource(tafsirId) {
  return (state.tafsirItems ?? []).filter((item) => Number(item.tafsir_id) === Number(tafsirId))
}

function videosForType(videoTypeId) {
  return (state.videos ?? []).filter((video) => Number(video.video_type) === Number(videoTypeId))
}

function mp3QuranAuthor(id, name) {
  return grayjay.author(id, name, 'https://mp3quran.net', iconUrl())
}

function getSearchCapabilities() {
  ensureCatalog()
  const filters = [contentFilter(), reciterFilter(), surahFilter(), riwayahFilter(), videoTypeFilter()]
  if (state.tafasir.length) {
    filters.push(tafsirSourceFilter())
  }

  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological, Type.Order.Popularity],
    filters
  }
}

function getTrackCapabilities() {
  ensureCatalog()
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological, Type.Order.Popularity],
    filters: [surahFilter(), riwayahFilter()]
  }
}

function contentFilter() {
  return {
    id: 'content',
    name: text('content'),
    isMultiSelect: true,
    filters: [
      { id: 'tracks', name: text('tracks'), value: 'tracks' },
      { id: 'radios', name: text('radios'), value: 'radios' },
      { id: 'live-tv', name: text('liveTv'), value: 'live-tv' },
      { id: 'tafsir', name: text('tafsirAudio'), value: 'tafsir' },
      { id: 'videos', name: text('videos'), value: 'videos' }
    ]
  }
}

function reciterFilter() {
  return {
    id: 'reciter',
    name: text('reciter'),
    isMultiSelect: false,
    filters: state.reciters.map((reciter) => ({
      id: reciter.name,
      name: reciter.name,
      value: reciter.name
    }))
  }
}

function surahFilter() {
  return {
    id: 'surah',
    name: text('surah'),
    isMultiSelect: false,
    filters: state.suwar.map((surah) => ({
      id: surahFilterLabel(surah),
      name: surahFilterLabel(surah),
      value: surahFilterLabel(surah)
    }))
  }
}

function riwayahFilter() {
  return {
    id: 'riwayah',
    name: text('riwayah'),
    isMultiSelect: false,
    filters: state.riwayat.map((riwayah) => ({
      id: riwayah.name,
      name: riwayah.name,
      value: riwayah.name
    }))
  }
}

function videoTypeFilter() {
  return {
    id: 'video-type',
    name: text('videoType'),
    isMultiSelect: false,
    filters: state.videoTypes.map((videoType) => ({
      id: videoType.video_type,
      name: videoType.video_type,
      value: videoType.video_type
    }))
  }
}

function tafsirSourceFilter() {
  return {
    id: 'tafsir-source',
    name: text('tafsirSource'),
    isMultiSelect: false,
    filters: state.tafasir.map((tafsir) => ({
      id: tafsir.name,
      name: tafsir.name,
      value: tafsir.name
    }))
  }
}

function callJson(url) {
  return get_json(url, DEFAULT_HEADERS)
}

function getReciterFromUrl(url) {
  const match = url.match(REGEX.CHANNEL)
  if (!match || !state.reciterById[match[1]]) {
    throw new ScriptException('Reciter not found')
  }
  return state.reciterById[match[1]]
}

function trackFromUrl(url) {
  const match = url.match(REGEX.TRACK)
  if (!match) {
    return null
  }

  const reciter = state.reciterById[match[1]]
  const moshaf = reciter?.moshaf?.find((m) => String(m.id) === match[2])
  const surahId = Number(match[3])
  if (!reciter || !moshaf || !state.surahById[surahId]) {
    return null
  }

  return { reciter, moshaf, surahId }
}

function parseSurahList(list) {
  return String(list ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Boolean)
}

function trackMatches(reciter, moshaf, surah, query) {
  return (
    normalize(reciter.name).indexOf(query) >= 0 ||
    normalize(moshaf.name).indexOf(query) >= 0 ||
    normalize(surah?.name).indexOf(query) >= 0 ||
    String(surah?.id ?? '').indexOf(query) >= 0
  )
}

function tafsirMatches(item, query) {
  const surah = state.surahById[Number(item.sura_id)]
  return (
    normalize(item.name).indexOf(query) >= 0 ||
    normalize(item.tafsir_name).indexOf(query) >= 0 ||
    normalize(surah?.name).indexOf(query) >= 0 ||
    String(item.sura_id ?? '').indexOf(query) >= 0
  )
}

function radioMatches(radio, query) {
  return !query || normalize(radio.name).indexOf(query) >= 0 || query === 'radio' || query === 'live'
}

function liveTvMatches(liveTv, query) {
  return !query || normalize(liveTv.name).indexOf(query) >= 0 || query === 'tv' || query === 'live'
}

function mp3VideoMatches(video, query) {
  return (
    normalize(video.reciter_name).indexOf(query) >= 0 ||
    normalize(getVideoTypeName(video.video_type)).indexOf(query) >= 0 ||
    String(video.id ?? '').indexOf(query) >= 0
  )
}

function hasSearchFilters(filters) {
  return (
    selectedFilterValues(filters, 'content').length > 0 ||
    selectedFilterValues(filters, 'reciter').length > 0 ||
    selectedFilterValues(filters, 'surah').length > 0 ||
    selectedFilterValues(filters, 'riwayah').length > 0 ||
    selectedFilterValues(filters, 'video-type').length > 0 ||
    selectedFilterValues(filters, 'tafsir-source').length > 0
  )
}

function contentAllowed(filters, contentType) {
  const selected = selectedFilterValues(filters, 'content')
  if (selected.length) {
    return selected.indexOf(contentType) >= 0
  }

  if (selectedFilterValues(filters, 'riwayah').length) {
    return contentType === 'tracks'
  }

  if (selectedFilterValues(filters, 'reciter').length) {
    return contentType === 'tracks' || contentType === 'videos'
  }

  if (selectedFilterValues(filters, 'video-type').length) {
    return contentType === 'videos'
  }

  if (selectedFilterValues(filters, 'tafsir-source').length) {
    return contentType === 'tafsir'
  }

  if (selectedFilterValues(filters, 'surah').length) {
    return contentType === 'tracks' || contentType === 'tafsir'
  }

  return true
}

function selectedFilterValues(filters, id) {
  if (!filters) {
    return []
  }

  let value = filters[id]
  if (value === undefined && filters.get) {
    value = filters.get(id)
  }

  if (value === undefined || value === null) {
    return []
  }

  if (!Array.isArray(value)) {
    value = [value]
  }

  return value.map(filterValue).filter(Boolean)
}

function filterValue(value) {
  if (typeof value === 'object' && value !== null) {
    return String(value.value ?? value.id ?? '')
  }

  return String(value)
}

function surahIdFromFilter(value) {
  const text = String(value ?? '').trim()
  const directId = Number(text)
  if (directId) {
    return directId
  }

  const trailingId = Number(text.match(/\((\d+)\)$/)?.[1])
  if (trailingId) {
    return trailingId
  }

  return Number((state.suwar ?? []).find((surah) => surahFilterLabel(surah) === text || surahName(surah) === text)?.id)
}

function riwayahIdFromFilter(value) {
  const text = String(value ?? '').trim()
  const directId = Number(text)
  if (directId) {
    return directId
  }

  return Number((state.riwayat ?? []).find((riwayah) => riwayah.name === text)?.id)
}

function reciterIdFromFilter(value) {
  const text = String(value ?? '').trim()
  const directId = Number(text)
  if (directId) {
    return directId
  }

  return Number((state.reciters ?? []).find((reciter) => reciter.name === text)?.id)
}

function videoTypeIdFromFilter(value) {
  const text = String(value ?? '').trim()
  const directId = Number(text)
  if (directId) {
    return directId
  }

  return Number((state.videoTypes ?? []).find((videoType) => videoType.video_type === text)?.id)
}

function tafsirIdFromFilter(value) {
  const text = String(value ?? '').trim()
  const directId = Number(text)
  if (directId) {
    return directId
  }

  return Number((state.tafasir ?? []).find((tafsir) => tafsir.name === text)?.id)
}

function padSurah(id) {
  return String(id).padStart(3, '0')
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function normalizeFolderUrl(value) {
  return trimSlash(String(value ?? '').replace(/^http:\/\//, 'https://')).toLowerCase()
}

function surahName(surah) {
  return String(surah.name ?? '').trim()
}

function surahFilterLabel(surah) {
  return `${surahName(surah)} (${surah.id})`
}

function getVideoTypeName(id) {
  return state.videoTypeById[String(id)]?.video_type ?? `${text('videoTypeFallback')} ${id}`
}

function reciterThumbnailUrl(reciterId) {
  return (
    (state.videos ?? []).find((video) => String(video.reciter_id) === String(reciterId) && video.video_thumb_url)?.video_thumb_url ?? null
  )
}

function unixDate(value) {
  const timestamp = Date.parse(value ?? '')
  return isNaN(timestamp) ? 0 : Math.floor(timestamp / 1000)
}

function vttTimestamp(ms) {
  const value = Math.max(0, Number(ms) || 0)
  const hours = Math.floor(value / 3600000)
  const minutes = Math.floor((value % 3600000) / 60000)
  const seconds = Math.floor((value % 60000) / 1000)
  const milliseconds = Math.floor(value % 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
}

function sortByName(items) {
  return [...(items ?? [])].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), state.language || undefined))
}

function reciterUrl(id) {
  return `mp3quran://reciter/${id}`
}

function moshafPlaylistUrl(reciterId, moshafId) {
  return `mp3quran://playlist/moshaf/${reciterId}/${moshafId}`
}

function tafsirPlaylistUrl(tafsirId) {
  return `mp3quran://playlist/tafsir/${tafsirId}`
}

function videoTypePlaylistUrl(videoTypeId) {
  return `mp3quran://playlist/video-type/${videoTypeId}`
}

function trackUrl(reciterId, moshafId, surahId) {
  return `mp3quran://track/${reciterId}/${moshafId}/${surahId}`
}

function radioUrl(id) {
  return `mp3quran://radio/${id}`
}

function liveTvUrl(id) {
  return `mp3quran://live-tv/${id}`
}

function tafsirUrl(tafsirId, itemId) {
  return `mp3quran://tafsir/${tafsirId}/${itemId}`
}

function videoUrlFor(reciterId, videoId) {
  return `mp3quran://video/${reciterId}/${videoId}`
}

function tafsirKey(tafsirId, itemId) {
  return `${tafsirId}-${itemId}`
}

function videoKey(reciterId, videoId) {
  return `${reciterId}-${videoId}`
}

function dedupeStrings(values) {
  const seen = {}
  const deduped = []

  for (const value of values) {
    if (!value || seen[value]) {
      continue
    }
    seen[value] = true
    deduped.push(value)
  }

  return deduped
}

function logIfTesting(msg) {
  if (typeof IS_TESTING !== 'undefined' && IS_TESTING) {
    log(msg)
  }
}

log('LOADED')
