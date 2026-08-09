import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, init_lru_caches, cache_get, cache_set, query_string } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'DrosUAE'
const BASE_URL = 'https://drosuae.com'
const API_URL = `${BASE_URL}/wp-json/wp/v2`
const DEFAULT_ICON = `${BASE_URL}/favicon.ico`
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { jsonCache: 120 }

const SECTIONS = [
  { id: 'lessons', name: 'الدروس العلمية', path: '/lessons/' },
  { id: 'clips', name: 'المقاطع', path: '/clips/' },
  { id: 'lectures', name: 'المحاضرات العامة', path: '/lectures/' },
  { id: 'seremons', name: 'الخطب', path: '/seremons/' },
  { id: 'quran', name: 'القرآن الكريم', path: '/quran/' },
  { id: 'manthomat', name: 'المنظومات العلمية', path: '/manthomat/' }
]

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
    SECTIONS.flatMap((section) =>
      fetchList(section.id, 1, '')
        .slice(0, section.id === 'manthomat' ? 2 : 4)
        .map(postToContent)
    ).filter(Boolean),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [sectionFilter()]
})

source.searchSuggestions = function (query) {
  const terms = ['القرآن', 'العلم', 'الصلاة', 'التوحيد', 'رمضان', 'العلماء', 'الخطب']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, filters) {
  const needle = normalize_search_text(query)
  const items = selectedSections(filters)
    .flatMap((section) => fetchList(section.id, 1, needle).map(postToContent))
    .filter(Boolean)
  return new ArrayVideoPager(dedupe_by_url(items), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'root' || parsed?.type === 'section' || normalized === BASE_URL || Boolean(sectionByUrl(normalized))
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  if (section) return sectionChannel(section)

  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'دروس ومحاضرات وتلاوات صوتية من موقع دروس الإمارات.',
    url: 'drosuae://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  return new DrosUaePager(section?.id ?? 'lessons')
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  return source.search(query, null, null, section ? { section: section.id } : null)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [source.getChannel('drosuae://root'), ...SECTIONS.map(sectionChannel)]
  return new ArrayChannelPager(
    channels.filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'playlist' || Boolean(sectionByUrl(normalized))
}

source.searchPlaylists = function (query, _type, _order, filters) {
  const needle = normalize_search_text(query)
  return new ArrayPlaylistPager(
    selectedSections(filters)
      .filter((section) => !needle || normalize_search_text(section.name).includes(needle))
      .map(sectionToPlaylist),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'playlist' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  if (!section) throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  return grayjay.playlist_details(`playlist-${section.id}`, {
    name: section.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(section.id),
    videoCount: 0,
    contents: new DrosUaePager(section.id)
  })
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  return new ArrayPlaylistPager((section ? [section] : SECTIONS).map(sectionToPlaylist), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return (
    parsed?.type === 'content' ||
    Boolean(sectionByUrl(normalized)) ||
    /^https:\/\/(?:files\.drosuae\.com|files\.kalelm\.com|drosuae\.com)\/.*\.mp3(?:$|\?)/i.test(normalized)
  )
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'content') return postToDetails(fetchDetail(parsed.section, parsed.id))

  const normalized = normalizePublicUrl(url)
  if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized)

  const section = sectionByUrl(normalized)
  if (section) {
    const slug = decodeURIComponent(normalized.replace(`${BASE_URL}${section.path}`, '').replace(/\/$/, ''))
    const post = fetchBySlug(section.id, slug)
    if (post) return postToDetails(post)
  }

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

function fetchList(sectionId, page = 1, search = '') {
  const params = query_string([
    ['per_page', DEFAULT_LIMIT],
    ['page', page],
    ['search', search || null]
  ])
  return fetchJson(`${API_URL}/${sectionId}?${params}`).filter(hasPlayableAudio)
}

function fetchDetail(sectionId, id) {
  return fetchJson(`${API_URL}/${sectionId}/${id}`)
}

function fetchBySlug(sectionId, slug) {
  return (fetchJson(
    `${API_URL}/${sectionId}?${query_string([
      ['slug', slug],
      ['per_page', 1]
    ])}`
  ) ?? [])[0]
}

function hasPlayableAudio(post) {
  return Boolean(mediaUrl(post?.['wpcf-upload-mp3']))
}

function postToContent(post) {
  if (!hasPlayableAudio(post)) return null
  const section = sectionById(post.type)
  return grayjay.feed_video(`${post.type}-${post.id}`, {
    name: postTitle(post),
    thumbnails: staticThumbnails(),
    author: authorForSection(section),
    uploadDate: parseDate(post.date),
    duration: 0,
    viewCount: Number(post.post_views_count || 0),
    isLive: false,
    url: contentUrl(post.type, post.id),
    description: section?.name ?? '',
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: mediaUrl(post['wpcf-upload-mp3']),
      language: 'ar'
    }),
    shareUrl: normalizePublicUrl(post.link)
  })
}

function postToDetails(post) {
  if (!hasPlayableAudio(post)) throw new ScriptException(`${PLATFORM} audio file not found`)
  const section = sectionById(post.type)
  return grayjay.video(`${post.type}-${post.id}`, {
    name: postTitle(post),
    thumbnails: staticThumbnails(),
    author: authorForSection(section),
    uploadDate: parseDate(post.date),
    duration: 0,
    viewCount: Number(post.post_views_count || 0),
    isLive: false,
    url: contentUrl(post.type, post.id),
    description: clean_text(post.excerpt?.rendered || section?.name || ''),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: mediaUrl(post['wpcf-upload-mp3']),
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: normalizePublicUrl(post.link),
    getContentRecommendations: () => new DrosUaePager(section?.id ?? 'lessons')
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

function postTitle(post) {
  return clean_text(post?.title?.rendered || post?.title || PLATFORM)
}

function sectionChannel(section) {
  return grayjay.channel(`section-${section.id}`, {
    name: section.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${section.name} - دروس الإمارات`,
    url: sectionUrl(section.id),
    urlAlternatives: [`${BASE_URL}${section.path}`]
  })
}

function sectionToPlaylist(section) {
  return grayjay.playlist(`playlist-${section.id}`, {
    name: section.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(section.id),
    videoCount: 0
  })
}

function rootAuthor() {
  return grayjay.author('drosuae', PLATFORM, BASE_URL, iconUrl())
}

function authorForSection(section) {
  return grayjay.author(
    `section-${section?.id ?? 'root'}`,
    section?.name || PLATFORM,
    section ? `${BASE_URL}${section.path}` : BASE_URL,
    iconUrl()
  )
}

function sectionFilter() {
  return {
    id: 'section',
    name: 'القسم',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'كل الأقسام', value: 'all' },
      ...SECTIONS.map((section) => ({ id: section.id, name: section.name, value: section.id }))
    ]
  }
}

function selectedSections(filters) {
  const value = selected_filter_values(filters, 'section')[0]
  return value && value !== 'all' ? [sectionById(value)] : SECTIONS
}

function sectionById(id) {
  return SECTIONS.find((section) => section.id === id)
}

function sectionByUrl(url) {
  return SECTIONS.find((section) => String(url ?? '').startsWith(`${BASE_URL}${section.path}`))
}

function mediaUrl(value) {
  return encodeURI(normalizePublicUrl(value))
}

function normalizePublicUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`
  return raw.replace(/^http:\/\//i, 'https://').replace(/^https:\/\/www\.drosuae\.com/i, BASE_URL)
}

function parseDate(value) {
  const raw = String(value ?? '')
  if (!raw) return 0
  return Math.floor(new Date(raw.endsWith('Z') ? raw : `${raw}Z`).getTime() / 1000) || 0
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

function sectionUrl(id) {
  return `drosuae://section/${id}`
}

function playlistUrl(id) {
  return `drosuae://playlist/${id}`
}

function contentUrl(section, id) {
  return `drosuae://content/${section}/${id}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'drosuae://root') return { type: 'root' }
  let match = value.match(/^drosuae:\/\/section\/([^/]+)$/)
  if (match) return { type: 'section', id: match[1] }
  match = value.match(/^drosuae:\/\/playlist\/([^/]+)$/)
  if (match) return { type: 'playlist', id: match[1] }
  match = value.match(/^drosuae:\/\/content\/([^/]+)\/(\d+)$/)
  if (match) return { type: 'content', section: match[1], id: match[2] }
  return null
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

class DrosUaePager extends VideoPager {
  constructor(sectionId, page = 1) {
    const results = fetchList(sectionId, page, '').map(postToContent).filter(Boolean)
    super(results, results.length === DEFAULT_LIMIT, { sectionId, page })
  }

  nextPage() {
    return apply_pager_state(this, new DrosUaePager(this.context.sectionId, this.context.page + 1))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + staticThumbnails().sources.length)
