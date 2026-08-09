import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first } from '@lib/html.js'
import { cache_get, cache_set, get_text, init_lru_caches, post_text, query_string } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'DrosQ8'
const BASE_URL = 'https://www.drosq8.com'
const DEFAULT_ICON = `${BASE_URL}/favicon.ico`
const DEFAULT_LIMIT = 20
const ROOT_CATEGORY = '218'
const HOME_CATEGORY = '221'
const CACHE_LIMITS = { pageCache: 80 }

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
  return new DrosCategoryPager(HOME_CATEGORY)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: []
})

source.searchSuggestions = function (query) {
  const terms = ['العلم', 'العشر', 'القرآن', 'التوحيد', 'الصيام', 'الحج', 'الحديث']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, _filters) {
  const needle = normalize_search_text(query)
  if (!needle) return source.getHome()
  const category = { id: ROOT_CATEGORY, title: PLATFORM, url: `${BASE_URL}/cat/${ROOT_CATEGORY}` }
  return new ArrayVideoPager(
    parseItems(fetchSearchResults(query), category)
      .filter((item) => !needle || normalize_search_text(`${item.title} ${item.category.title}`).includes(needle))
      .map(itemToFeed),
    DEFAULT_LIMIT
  )
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'root' || parsed?.type === 'category' || normalized === BASE_URL || isCategoryUrl(normalized)
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  const category = parsed?.type === 'category' ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url))
  if (category) return categoryChannel(category)

  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'محاضرات ودروس صوتية من موقع دروس الكويت.',
    url: 'drosq8://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  const category = parsed?.type === 'category' ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url))
  return new DrosCategoryPager(category?.id ?? HOME_CATEGORY)
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  const category = parsed?.type === 'category' ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url))
  return source.search(query, null, null, category ? { category: category.id } : null)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [source.getChannel('drosq8://root'), ...rootCategories().map(categoryChannel)]
  return new ArrayChannelPager(
    channels.filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'playlist' || isCategoryUrl(normalized)
}

source.searchPlaylists = function (query, _type, _order, _filters) {
  const needle = normalize_search_text(query)
  const roots = rootCategories()
  return new ArrayPlaylistPager(
    roots
      .flatMap((category) => [category, ...parseCategories(fetchCategoryPage(category.id, 1)).slice(0, 60)])
      .filter((category) => !needle || normalize_search_text(category.title).includes(needle))
      .map(categoryToPlaylist),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  const category = parsed?.type === 'playlist' ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url))
  if (!category) throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  const items = parseItems(fetchCategoryPage(category.id, 1), category)
  return grayjay.playlist_details(`playlist-${category.id}`, {
    name: category.title,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(category.id),
    videoCount: category.count || items.length,
    contents: new DrosCategoryPager(category.id)
  })
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  const category = parsed?.type === 'category' ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url))
  const categories = category ? parseCategories(fetchCategoryPage(category.id, 1)) : rootCategories()
  return new ArrayPlaylistPager(categories.map(categoryToPlaylist), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'content' || isPlayUrl(normalized) || /^https:\/\/www\.drosq8\.com\/.*\.mp3(?:$|\?)/i.test(normalized)
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = parsed?.type === 'content' ? parsed.url : normalizePublicUrl(url)
  if (/\.mp3(?:$|\?)/i.test(normalized))
    return itemToDetails({ title: decodeTitle(normalized), url: normalized, audioUrl: normalized, category: categoryById(HOME_CATEGORY) })
  if (!isPlayUrl(normalized)) throw new ScriptException(`Unsupported ${PLATFORM} content URL`)
  return itemToDetails(parseDetail(fetchPage(normalized), normalized))
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

function fetchCategoryPage(id, page = 1) {
  return fetchPage(page > 1 ? `${BASE_URL}/cat/${id}/${page}/` : `${BASE_URL}/cat/${id}`)
}

function fetchSearchResults(query) {
  return post_text(
    `${BASE_URL}/cat/search`,
    query_string([
      ['search', query],
      ['action', 'ابحث']
    ]),
    { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html,application/xhtml+xml' }
  )
}

function rootCategories() {
  return parseCategories(fetchCategoryPage(ROOT_CATEGORY, 1)).filter((category) => category.count !== 0)
}

function parseCategories(html) {
  const categories = []
  const regex =
    /<h4\b[^>]*class=["'][^"']*pull-right[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/cat\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\b[^>]*class=["'][^"']*btn-d[^"']*["'][^>]*>[\s\S]*?(\d+)[\s\S]*?<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    categories.push({ id: match[2], title: clean_text(match[3]), url: normalizePublicUrl(match[1]), count: Number(match[4] || 0) })
  }
  return dedupe_by_url(categories)
}

function parseItems(html, category) {
  const items = []
  const regex = /<li\b[^>]*class=["'][^"']*list-group-item[^"']*["'][^>]*>[\s\S]*?<\/li>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const block = match[0]
    const path = extract_first(block, /<a\b[^>]*href=["']([^"']*\/play\/\d+[^"']*)["'][^>]*>/i)
    const title = clean_text(
      extract_first(block, /<h4\b[^>]*class=["'][^"']*hedh4[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>[\s\S]*?([\s\S]*?)<\/a>/i)
    )
    if (!path || !title) continue
    const url = normalizePublicUrl(path)
    items.push({
      title,
      url,
      category,
      viewCount: Number(extract_first(block, /fa-comments[^<]*<\/i>\s*([0-9]+)/i) || 0),
      uploadDate: parseDate(extract_first(block, /<br>\s*(\d{4}-\d{2}-\d{2})/i))
    })
  }
  return dedupe_by_url(items)
}

function parseDetail(html, url) {
  const title = cleanTitle(
    extract_first(html, /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
      decodeTitle(url)
  )
  const audioUrl = normalizePublicUrl(
    extract_first(html, /<source\b[^>]*src=["']([^"']+\.mp3[^"']*)["']/i) ||
      extract_first(html, /<a\b[^>]*href=["']([^"']+\.mp3[^"']*)["']/i)
  )
  if (!audioUrl) throw new ScriptException(`${PLATFORM} audio file not found`)
  return {
    title,
    url,
    audioUrl: encodeURI(audioUrl),
    category: categoryFromBreadcrumb(html) ?? categoryById(HOME_CATEGORY),
    viewCount: Number(extract_first(html, /fa-comments[^<]*<\/i>\s*([0-9]+)/i) || 0),
    uploadDate: parseDate(extract_first(html, /(\d{4}-\d{2}-\d{2})/i)),
    description: clean_text(extract_first(html, /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) || '')
  }
}

function itemToFeed(item) {
  return grayjay.feed_video(`play-${playId(item.url)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: authorForCategory(item.category),
    uploadDate: item.uploadDate || 0,
    duration: 0,
    viewCount: item.viewCount || 0,
    isLive: false,
    url: contentUrl(item.url),
    description: item.category?.title ?? '',
    shareUrl: item.url
  })
}

function itemToDetails(item) {
  return grayjay.video(`audio-${playId(item.url || item.audioUrl)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: authorForCategory(item.category),
    uploadDate: item.uploadDate || 0,
    duration: 0,
    viewCount: item.viewCount || 0,
    isLive: false,
    url: contentUrl(item.url),
    description: item.description || item.category?.title || '',
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
    shareUrl: item.url || item.audioUrl,
    getContentRecommendations: () => new DrosCategoryPager(item.category?.id ?? HOME_CATEGORY)
  })
}

function categoryChannel(category) {
  return grayjay.channel(`category-${category.id}`, {
    name: category.title,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${category.title} - دروس الكويت`,
    url: categoryUrl(category.id),
    urlAlternatives: [category.url]
  })
}

function categoryToPlaylist(category) {
  return grayjay.playlist(`playlist-${category.id}`, {
    name: category.title,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(category.id),
    videoCount: category.count || 0
  })
}

function rootAuthor() {
  return grayjay.author('drosq8', PLATFORM, BASE_URL, iconUrl())
}

function authorForCategory(category) {
  return grayjay.author(`category-${category?.id ?? 'root'}`, category?.title || PLATFORM, category?.url || BASE_URL, iconUrl())
}

function categoryById(id) {
  const html = fetchCategoryPage(id, 1)
  return {
    id: String(id),
    title: parseCategoryTitle(html) || `قسم ${id}`,
    url: `${BASE_URL}/cat/${id}`,
    count: parseItems(html, { id: String(id), title: '', url: `${BASE_URL}/cat/${id}` }).length
  }
}

function categoryFromUrl(url) {
  const id = String(url ?? '').match(/\/cat\/(\d+)/)?.[1]
  return id ? categoryById(id) : null
}

function categoryFromBreadcrumb(html) {
  const links = []
  const regex = /<a\b[^>]*href=["']([^"']*\/cat\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null) links.push({ id: match[2], title: clean_text(match[3]), url: normalizePublicUrl(match[1]) })
  return links.pop() ?? null
}

function parseCategoryTitle(html) {
  return cleanTitle(
    extract_first(html, /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
      extract_first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
  )
}

function cleanTitle(value) {
  return clean_text(value)
    .replace(/\s*-\s*دروس الكويت\s*$/i, '')
    .replace(/^دروس الكويت\s*-\s*/i, '')
}

function parseDate(value) {
  const match = String(value ?? '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return 0
  return Math.floor(new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`).getTime() / 1000)
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

function playId(url) {
  return String(url ?? '').match(/\/play\/(\d+)/)?.[1] || normalize_search_text(url).slice(-48) || 'audio'
}

function normalizePublicUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`.replace('https://drosq8.com', BASE_URL)
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`
  return raw.replace(/^http:\/\//i, 'https://').replace(/^https:\/\/drosq8\.com/i, BASE_URL)
}

function isCategoryUrl(url) {
  return /^https:\/\/www\.drosq8\.com\/cat\/\d+(?:\/\d+\/?)?$/i.test(url)
}

function isPlayUrl(url) {
  return /^https:\/\/www\.drosq8\.com\/play\/\d+\/?$/i.test(url)
}

function categoryUrl(id) {
  return `drosq8://category/${id}`
}

function playlistUrl(id) {
  return `drosq8://playlist/${id}`
}

function contentUrl(url) {
  return `drosq8://content/${encodeURIComponent(url)}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'drosq8://root') return { type: 'root' }
  let match = value.match(/^drosq8:\/\/category\/([^/]+)$/)
  if (match) return { type: 'category', id: match[1] }
  match = value.match(/^drosq8:\/\/playlist\/([^/]+)$/)
  if (match) return { type: 'playlist', id: match[1] }
  match = value.match(/^drosq8:\/\/content\/(.+)$/)
  if (match) return { type: 'content', url: decodeURIComponent(match[1]) }
  return null
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

class DrosCategoryPager extends VideoPager {
  constructor(categoryId, page = 1) {
    const category = categoryById(categoryId)
    const html = fetchCategoryPage(categoryId, page)
    const items = parseItems(html, category).map(itemToFeed)
    super(items, hasNextPage(html, categoryId, page), { categoryId, page })
  }

  nextPage() {
    return apply_pager_state(this, new DrosCategoryPager(this.context.categoryId, this.context.page + 1))
  }
}

function hasNextPage(html, categoryId, page) {
  return new RegExp(`/cat/${categoryId}/${page + 1}/`, 'i').test(html)
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + staticThumbnails().sources.length)
