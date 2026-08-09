import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first } from '@lib/html.js'
import { cache_get, cache_set, get_text, init_lru_caches } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'Shkhudheir'
const BASE_URL = 'https://shkhudheir.com'
const DEFAULT_ICON = `${BASE_URL}/favicon.ico`
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { pageCache: 80 }

const SERIES = [
  { id: '1054903076', name: 'التعليق على تفسير القرطبي', category: 'القرآن وعلومه' },
  { id: '1775116188', name: 'التعليق على الموافقات', category: 'أصول الفقه' },
  { id: '1244069620', name: 'الموقظة في علم مصطلح الحديث', category: 'الحديث وعلومه' }
]

const FATWA_SECTIONS = [
  { id: '297', name: 'القرآن وعلومه' },
  { id: '299', name: 'العقيدة' },
  { id: '300', name: 'فقه العبادات' },
  { id: '302', name: 'فقه الأسرة' },
  { id: '315', name: 'مسائل متفرقة' }
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
    [
      ...parseSeriesItems(fetchPage(seriesUrl(SERIES[0].id)), SERIES[0]),
      detailToFeed(fetchDetailPage(`${BASE_URL}/fatawa/1414595258`))
    ].filter(Boolean),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: []
})

source.searchSuggestions = function (query) {
  const terms = ['التفسير', 'الحديث', 'العقيدة', 'الفقه', 'الفتاوى', 'القرآن']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, _filters) {
  const needle = normalize_search_text(query)
  const items = SERIES.flatMap((series) => parseSeriesItems(fetchPage(seriesUrl(series.id)), series))
  items.push(detailToFeed(fetchDetailPage(`${BASE_URL}/fatawa/1414595258`)))
  return new ArrayVideoPager(
    dedupe_by_url(items.filter((item) => item && (!needle || normalize_search_text(item.name).includes(needle)))),
    DEFAULT_LIMIT
  )
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return ['root', 'series', 'fatawa', 'fatwa-section'].includes(parsed?.type) || normalizePublicUrl(url) === BASE_URL
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'series') return seriesChannel(seriesById(parsed.id))
  if (parsed?.type === 'fatawa') return simpleChannel('fatawa', 'الفتاوى', 'shkhudheir://fatawa')
  if (parsed?.type === 'fatwa-section')
    return simpleChannel(`fatwa-section-${parsed.id}`, fatwaSectionById(parsed.id).name, `shkhudheir://fatawa/section/${parsed.id}`)
  return grayjay.channel('root', {
    name: 'الشيخ عبد الكريم الخضير',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'الدروس والفتاوى الصوتية للشيخ عبد الكريم الخضير.',
    url: 'shkhudheir://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'series') return new SeriesPager(parsed.id)
  if (parsed?.type === 'fatwa-section') return new FatwaSectionPager(parsed.id)
  return source.getHome()
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, type, order, filters) {
  return source.search(query, type, order, filters)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [
    source.getChannel('shkhudheir://root'),
    simpleChannel('lessons', 'الدروس العلمية', 'shkhudheir://lessons'),
    source.getChannel('shkhudheir://fatawa'),
    ...SERIES.map(seriesChannel),
    ...FATWA_SECTIONS.map((section) => source.getChannel(`shkhudheir://fatawa/section/${section.id}`))
  ]
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
    SERIES.filter((series) => !needle || normalize_search_text(series.name).includes(needle)).map(seriesToPlaylist),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type !== 'playlist') throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  const series = seriesById(parsed.id)
  return grayjay.playlist_details(`series-${series.id}`, {
    name: series.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url,
    videoCount: 0,
    contents: new SeriesPager(series.id)
  })
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'series') return new ArrayPlaylistPager([seriesToPlaylist(seriesById(parsed.id))], DEFAULT_LIMIT)
  return new ArrayPlaylistPager(SERIES.map(seriesToPlaylist), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return (
    parsed?.type === 'lesson' ||
    parsed?.type === 'fatwa' ||
    /\/(?:scientific-lesson|fatawa?|node)\/\d+/i.test(normalized) ||
    /^https:\/\/shkhudheir\.com\/files\/.*\.mp3/i.test(normalized)
  )
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'lesson') return detailToDetails(fetchDetailPage(`${BASE_URL}/scientific-lesson/${parsed.id}`))
  if (parsed?.type === 'fatwa') return detailToDetails(fetchDetailPage(`${BASE_URL}/fatawa/${parsed.id}`))
  const normalized = normalizePublicUrl(url)
  if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized)
  if (/\/(?:scientific-lesson|fatawa?|node)\/\d+/i.test(normalized)) return detailToDetails(fetchDetailPage(normalized))
  throw new ScriptException(`Unsupported ${PLATFORM} content URL`)
}

function parseState(value) {
  try {
    return JSON.parse(value || '{}')
  } catch (_e) {
    return {}
  }
}

function fetchPage(url) {
  const normalized = normalizePublicUrl(url)
  const cached = cache_get(_state, CACHE_LIMITS, 'pageCache', normalized)
  if (cached) return cached
  return cache_set(_state, CACHE_LIMITS, 'pageCache', normalized, get_text(normalized, { Accept: 'text/html,application/xhtml+xml' }))
}

function fetchDetailPage(url) {
  return { html: fetchPage(url), url: normalizePublicUrl(url) }
}

function parseSeriesItems(html, series) {
  const items = []
  const regex =
    /<td\b[^>]*class=["'][^"']*views-field-title[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/scientific-lesson\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    items.push({
      title: clean_text(match[3]),
      url: lessonUrl(match[2]),
      shareUrl: absoluteUrl(match[1]),
      series
    })
  }
  return dedupe_by_url(items.map(itemToFeed))
}

function parseFatwaItems(html) {
  const items = []
  const regex = /<a\b[^>]*href=["']([^"']*\/fatwa(?:wa)?\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null)
    items.push({ title: clean_text(match[3]), url: fatwaUrl(match[2]), shareUrl: absoluteUrl(match[1]) })
  return dedupe_by_url(items.filter((item) => item.title).map(itemToFeed))
}

function detailToFeed(detail) {
  const parsed = parseDetail(detail)
  return parsed?.audioUrl ? itemToFeed(parsed) : null
}

function itemToFeed(item) {
  return grayjay.feed_video(`item-${mediaId(item.url)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: item.url,
    description: item.series?.name || '',
    shareUrl: item.shareUrl || item.url
  })
}

function detailToDetails(detail) {
  const item = parseDetail(detail)
  if (!item?.audioUrl) throw new ScriptException(`${PLATFORM} audio file not found`)
  return grayjay.video(`audio-${mediaId(detail.url)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: item.uploadDate || 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: item.url,
    description: item.description,
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: item.audioUrl,
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: detail.url,
    getContentRecommendations: () => (item.series?.id ? new SeriesPager(item.series.id) : source.getHome())
  })
}

function parseDetail({ html, url }) {
  const title = clean_text(
    extract_first(html, /<h1\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
      extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  )
  const audioUrl = absoluteUrl(
    extract_first(html, /<source\b[^>]*src=["']([^"']+\.mp3[^"']*)["'][^>]*type=["']audio\/mpeg["']/i) ||
      extract_first(html, /href=["']([^"']+\.mp3[^"']*)["']/i)
  )
  const seriesId = extract_first(html, /href=["']\/series\/(\d+)["']/i)
  const date = extract_first(html, /<time\b[^>]*datetime=["']([^"']+)["']/i)
  return {
    title,
    audioUrl,
    url: url.includes('/scientific-lesson/')
      ? lessonUrl(extract_first(url, /\/scientific-lesson\/(\d+)/))
      : fatwaUrl(extract_first(url, /\/(?:fatawa?|node)\/(\d+)/)),
    description: clean_text(
      extract_first(html, /<div\b[^>]*class=["'][^"']*field--name-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || html
    ).slice(0, 2000),
    uploadDate: date ? Math.floor(new Date(date).getTime() / 1000) : 0,
    series: seriesId ? seriesById(seriesId) : null
  }
}

function directMp3ToDetails(url) {
  return grayjay.video(`mp3-${mediaId(url)}`, {
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

function simpleChannel(id, name, url) {
  return grayjay.channel(id, {
    name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${name} - الشيخ عبد الكريم الخضير`,
    url,
    urlAlternatives: [BASE_URL]
  })
}

function seriesChannel(series) {
  return simpleChannel(`series-${series.id}`, series.name, seriesUrlInternal(series.id))
}

function seriesToPlaylist(series) {
  return grayjay.playlist(`series-${series.id}`, {
    name: series.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(series.id),
    videoCount: 0
  })
}

function seriesById(id) {
  return SERIES.find((series) => series.id === id) ?? { id, name: `سلسلة ${id}`, category: '' }
}

function fatwaSectionById(id) {
  return FATWA_SECTIONS.find((section) => section.id === id) ?? { id, name: `فتاوى ${id}` }
}

function rootAuthor() {
  return grayjay.author('shkhudheir', 'الشيخ عبد الكريم الخضير', BASE_URL, iconUrl())
}

function absoluteUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('/')) return encodeUrl(`${BASE_URL}${raw}`)
  return encodeUrl(raw.replace(/^http:\/\//i, 'https://'))
}

function normalizePublicUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`
  return raw.replace(/^http:\/\//i, 'https://')
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

function mediaId(value) {
  return normalize_search_text(value).slice(-64) || 'audio'
}

function encodeUrl(url) {
  try {
    return encodeURI(decodeURI(url))
  } catch (_e) {
    return encodeURI(url)
  }
}

function seriesUrl(id, page = 0) {
  return `${BASE_URL}/series/${id}${page ? `?page=${page}` : ''}`
}

function seriesUrlInternal(id) {
  return `shkhudheir://series/${id}`
}

function playlistUrl(id) {
  return `shkhudheir://playlist/${id}`
}

function lessonUrl(id) {
  return `shkhudheir://lesson/${id}`
}

function fatwaUrl(id) {
  return `shkhudheir://fatwa/${id}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'shkhudheir://root') return { type: 'root' }
  if (value === 'shkhudheir://lessons') return { type: 'lessons' }
  if (value === 'shkhudheir://fatawa') return { type: 'fatawa' }
  let match = value.match(/^shkhudheir:\/\/series\/(\d+)$/)
  if (match) return { type: 'series', id: match[1] }
  match = value.match(/^shkhudheir:\/\/playlist\/(\d+)$/)
  if (match) return { type: 'playlist', id: match[1] }
  match = value.match(/^shkhudheir:\/\/lesson\/(\d+)$/)
  if (match) return { type: 'lesson', id: match[1] }
  match = value.match(/^shkhudheir:\/\/fatwa\/(\d+)$/)
  if (match) return { type: 'fatwa', id: match[1] }
  match = value.match(/^shkhudheir:\/\/fatawa\/section\/(\d+)$/)
  if (match) return { type: 'fatwa-section', id: match[1] }
  return null
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

class SeriesPager extends VideoPager {
  constructor(seriesId, page = 0) {
    const series = seriesById(seriesId)
    const html = fetchPage(seriesUrl(seriesId, page))
    const items = parseSeriesItems(html, series)
    super(items, new RegExp(`page=${page + 1}`, 'i').test(html), { seriesId, page })
  }

  nextPage() {
    return apply_pager_state(this, new SeriesPager(this.context.seriesId, this.context.page + 1))
  }
}

class FatwaSectionPager extends VideoPager {
  constructor(sectionId, page = 0) {
    const html = fetchPage(`${BASE_URL}/fatawa/section?id=${sectionId}${page ? `&page=${page}` : ''}`)
    const items = parseFatwaItems(html)
    super(items, new RegExp(`page=${page + 1}`, 'i').test(html), { sectionId, page })
  }

  nextPage() {
    return apply_pager_state(this, new FatwaSectionPager(this.context.sectionId, this.context.page + 1))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + staticThumbnails().sources.length)
