import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, init_lru_caches, cache_get, cache_set, post_json } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'BinOthaimeen'
const BASE_URL = 'https://binothaimeen.net'
const API_URL = 'https://shekhapi.binothaimeen.net'
const SEARCH_URL = 'https://shekhcp.binothaimeen.net/api/search-data'
const SOUND_URL = 'https://sounds.binothaimeen.net'
const DEFAULT_ICON = `${BASE_URL}/favicon.ico`
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { jsonCache: 120 }

let _config = {}
let _state = {}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, _settings, savedState) {
  _config = conf ?? {}
  _state = parseState(savedState)
  init_lru_caches(_state, CACHE_LIMITS)
}

source.saveState = function () {
  return '{}'
}

source.getHome = function () {
  return new ArrayVideoPager(
    rootSections()
      .flatMap((section) =>
        fetchLessons(section.id, 1)
          .data.slice(0, section.children_count ? 2 : 4)
          .map((lesson) => lessonToContent(lesson, section))
      )
      .filter(Boolean),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: []
})

source.searchSuggestions = function (query) {
  const terms = ['الفتاوى', 'الصلاة', 'المرأة', 'العقيدة', 'التفسير', 'الحج', 'الصيام']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, _filters) {
  if (!normalize_search_text(query)) return source.getHome()
  return new OthaimeenSearchPager(query)
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'root' || parsed?.type === 'section' || normalized === BASE_URL || normalized === 'https://shekh.binothaimeen.net'
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'section') return sectionChannel(sectionById(parsed.id))

  return grayjay.channel('root', {
    name: 'الشيخ ابن عثيمين',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'المكتبة الصوتية للشيخ محمد بن صالح العثيمين.',
    url: 'binothaimeen://root',
    urlAlternatives: [BASE_URL, 'https://shekh.binothaimeen.net']
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  return new OthaimeenLessonPager(parsed?.type === 'section' ? parsed.id : rootSections()[0].id)
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  const needle = normalize_search_text(query)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : rootSections()[0]
  return new ArrayVideoPager(
    fetchLessons(section.id, 1)
      .data.map((lesson) => lessonToContent(lesson, section))
      .filter((item) => item && (!needle || normalize_search_text(item.name).includes(needle))),
    DEFAULT_LIMIT
  )
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [source.getChannel('binothaimeen://root'), ...rootSections().map(sectionChannel)]
  return new ArrayChannelPager(
    channels.filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  return parseInternalUrl(url)?.type === 'playlist'
}

source.searchPlaylists = function (query, _type, _order, _filters) {
  const needle = normalize_search_text(query)
  return new ArrayPlaylistPager(
    rootSections()
      .filter(isPlaylistSection)
      .filter((section) => !needle || normalize_search_text(sectionTitle(section)).includes(needle))
      .map(sectionToPlaylist),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type !== 'playlist') throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  const section = sectionById(parsed.id)
  return grayjay.playlist_details(`playlist-${section.id}`, {
    name: sectionTitle(section),
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url,
    videoCount: section.many_all_lessons_count || section.many_lessons_count || 0,
    contents: new OthaimeenLessonPager(section.id)
  })
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  const sections = parsed?.type === 'section' ? fetchChildren(parsed.id, 1).data : rootSections()
  return new ArrayPlaylistPager(sections.filter(isPlaylistSection).map(sectionToPlaylist), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'audio' || /^https:\/\/sounds\.binothaimeen\.net\/.*\.mp3(?:$|\?)/i.test(normalized)
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'audio') return lessonToDetails(fetchLesson(parsed.id), parsed.section ? sectionById(parsed.section) : null)
  const normalized = normalizePublicUrl(url)
  if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized)
  throw new ScriptException(`Unsupported ${PLATFORM} content URL`)
}

function parseState(value) {
  try {
    return JSON.parse(value || '{}')
  } catch (_e) {
    return {}
  }
}

function fetchJson(url) {
  const cached = cache_get(_state, CACHE_LIMITS, 'jsonCache', url)
  if (cached) return cached
  return cache_set(_state, CACHE_LIMITS, 'jsonCache', url, get_json(url, { Accept: 'application/json' }))
}

function rootSections() {
  return fetchJson(`${API_URL}/course/sections/audio_library/10`).data ?? []
}

function fetchChildren(id, page = 1) {
  return fetchJson(`${API_URL}/course/sections/audio_library/children/${id}?pageSize=${DEFAULT_LIMIT}&page=${page}`)
}

function fetchLessons(id, page = 1) {
  return fetchJson(`${API_URL}/course/sections/audio_library/many_lessons/${id}/${DEFAULT_LIMIT}?page=${page}`)
}

function fetchLesson(id) {
  return fetchJson(`${API_URL}/lessons/audios/show/${id}/0/1?getManySectionsWithAllParent=audio_library&getAllPaths=1`).data
}

function fetchSearch(query, page = 1) {
  const key = `search:${query}:${page}`
  const cached = cache_get(_state, CACHE_LIMITS, 'jsonCache', key)
  if (cached) return cached
  return cache_set(
    _state,
    CACHE_LIMITS,
    'jsonCache',
    key,
    post_json(SEARCH_URL, JSON.stringify({ pageSize: DEFAULT_LIMIT, searchTerm: query, type: 'audios', page, mode: 'wide' }), {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    })
  )
}

function lessonToContent(lesson, section = null) {
  if (!audioUrl(lesson.certificate_url)) return null
  return grayjay.feed_video(`audio-${lesson.id}`, {
    name: titleText(lesson.title),
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: parseDate(lesson.created_at || lesson.publish_date),
    duration: 0,
    viewCount: Number(lesson.views || 0),
    isLive: false,
    url: audioInternalUrl(lesson.id, section?.id),
    description: clean_text(lesson.objective?.content?.ar || ''),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: audioUrl(lesson.certificate_url),
      language: 'ar'
    }),
    shareUrl: audioUrl(lesson.certificate_url)
  })
}

function searchResultToContent(item) {
  return grayjay.feed_video(`audio-${item.id}`, {
    name: titleText(item.title),
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: audioInternalUrl(item.id),
    description: titleText(item.content)
  })
}

function lessonToDetails(lesson, section = null) {
  const resolvedSection = section ?? lesson.many_sections?.[0] ?? lesson.paths?.[0] ?? null
  return grayjay.video(`audio-${lesson.id}`, {
    name: titleText(lesson.title),
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: parseDate(lesson.created_at || lesson.publish_date),
    duration: 0,
    viewCount: Number(lesson.views || 0),
    isLive: false,
    url: audioInternalUrl(lesson.id, resolvedSection?.id),
    description: clean_text(lesson.objective?.content?.ar || lesson.description?.ar || ''),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: audioUrl(lesson.certificate_url),
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: audioUrl(lesson.certificate_url),
    getContentRecommendations: () => (resolvedSection?.id ? new OthaimeenLessonPager(resolvedSection.id) : source.getHome())
  })
}

function directMp3ToDetails(url) {
  return grayjay.video(`mp3-${normalize_search_text(url).slice(-60)}`, {
    name: decodeTitle(url),
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url,
    description: PLATFORM,
    video: audio_source_descriptor({ name: 'MP3 Audio', container: 'audio/mpeg', codec: 'mp3', duration: 0, url, language: 'ar' }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: url
  })
}

function audioUrl(value) {
  const raw = normalizePublicUrl(value)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.includes('/storage')) return `${SOUND_URL}${raw.startsWith('/') ? raw : `/${raw}`}`
  return `${SOUND_URL}/storage/${raw.replace(/^\/+/, '')}`
}

function sectionChannel(section) {
  return grayjay.channel(`section-${section.id}`, {
    name: sectionTitle(section),
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${sectionTitle(section)} - الشيخ ابن عثيمين`,
    url: sectionUrl(section.id),
    urlAlternatives: [BASE_URL]
  })
}

function sectionToPlaylist(section) {
  return grayjay.playlist(`playlist-${section.id}`, {
    name: sectionTitle(section),
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(section.id),
    videoCount: section.many_all_lessons_count || section.many_lessons_count || 0
  })
}

function sectionById(id) {
  return rootSections().find((section) => section.id === id) ?? { id, title: { ar: 'قسم صوتي' }, many_all_lessons_count: 0 }
}

function isPlaylistSection(section) {
  return (section.many_lessons_count || 0) > 0 || ((section.children_count || 0) === 0 && (section.many_all_lessons_count || 0) > 0)
}

function rootAuthor() {
  return grayjay.author('binothaimeen', 'الشيخ محمد بن صالح العثيمين', BASE_URL, iconUrl())
}

function titleText(value) {
  return clean_text(typeof value === 'object' ? value.ar || value.en || value.fr : value)
}

function sectionTitle(section) {
  return titleText(section.title)
}

function parseDate(value) {
  const raw = String(value ?? '')
  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (match) return Math.floor(new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00Z`).getTime() / 1000)
  return Math.floor(new Date(raw).getTime() / 1000) || 0
}

function decodeTitle(url) {
  const file = decodeURIComponent(
    String(url ?? '')
      .split('/')
      .pop()
      ?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, '') || PLATFORM
  )
  return file.replace(/[-_]+/g, ' ')
}

function normalizePublicUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return raw
  return raw.replace(/^http:\/\//i, 'https://')
}

function sectionUrl(id) {
  return `binothaimeen://section/${id}`
}

function playlistUrl(id) {
  return `binothaimeen://playlist/section/${id}`
}

function audioInternalUrl(id, sectionId = '') {
  return `binothaimeen://audio/${id}${sectionId ? `/${sectionId}` : ''}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'binothaimeen://root') return { type: 'root' }
  let match = value.match(/^binothaimeen:\/\/section\/([^/]+)$/)
  if (match) return { type: 'section', id: match[1] }
  match = value.match(/^binothaimeen:\/\/playlist\/section\/([^/]+)$/)
  if (match) return { type: 'playlist', id: match[1] }
  match = value.match(/^binothaimeen:\/\/audio\/([^/]+)\/?([^/]*)$/)
  if (match) return { type: 'audio', id: match[1], section: match[2] || '' }
  return null
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

class OthaimeenLessonPager extends VideoPager {
  constructor(sectionId, page = 1) {
    const section = sectionById(sectionId)
    const data = fetchLessons(sectionId, page)
    super((data.data ?? []).map((lesson) => lessonToContent(lesson, section)).filter(Boolean), page < (data.meta?.last_page || 1), {
      sectionId,
      page
    })
  }

  nextPage() {
    return apply_pager_state(this, new OthaimeenLessonPager(this.context.sectionId, this.context.page + 1))
  }
}

class OthaimeenSearchPager extends VideoPager {
  constructor(query, page = 1) {
    const response = fetchSearch(query, page)
    super(
      (response.data ?? []).map(searchResultToContent),
      Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page),
      { query, page }
    )
  }

  nextPage() {
    return apply_pager_state(this, new OthaimeenSearchPager(this.context.query, this.context.page + 1))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + staticThumbnails().sources.length)
