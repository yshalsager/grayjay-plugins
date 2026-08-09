import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url, dedupe_strings } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first } from '@lib/html.js'
import { cache_get, cache_set, get_text, init_lru_caches, query_string } from '@lib/http.js'
import { audio_source_descriptor, thumbnails } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'BinBaz'
const BASE_URL = 'https://binbaz.org.sa'
const DEFAULT_ICON = `${BASE_URL}/img/square-logo.png`
const DEFAULT_LIMIT = 18
const CACHE_LIMITS = { pageCache: 80, detailCache: 40 }

const SECTIONS = [
  { id: 'fatwas-1', kind: 'fatwa', name: 'مجموع الفتاوى', url: `${BASE_URL}/fatwas/kind/1` },
  { id: 'fatwas-2', kind: 'fatwa', name: 'نور على الدرب', url: `${BASE_URL}/fatwas/kind/2` },
  { id: 'fatwas-3', kind: 'fatwa', name: 'فتاوى الدروس', url: `${BASE_URL}/fatwas/kind/3` },
  { id: 'fatwas-4', kind: 'fatwa', name: 'فتاوى الجامع الكبير', url: `${BASE_URL}/fatwas/kind/4` },
  { id: 'audios-1', kind: 'audio', name: 'شروح الكتب', url: `${BASE_URL}/audios/kind/1` },
  { id: 'audios-2', kind: 'audio', name: 'دروس ومحاضرات', url: `${BASE_URL}/audios/kind/2` },
  { id: 'videos-1', kind: 'video', name: 'مقاطع مختارة', url: `${BASE_URL}/videos/type/1` },
  { id: 'videos-2', kind: 'video', name: 'مرئيات الشيخ', url: `${BASE_URL}/videos/type/2` }
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
  return new BinBazListPager(sectionById('fatwas-2'))
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [contentFilter(), sectionFilter()]
})

source.searchSuggestions = function (_query) {
  return []
}

source.search = function (query, _type, _order, filters) {
  if (normalize_search_text(query)) return new ArrayContentPager([], DEFAULT_LIMIT)
  const section = selectedSection(filters)
  const content = selectedContent(filters)
  const sections = section ? [section] : SECTIONS.filter((item) => content === 'all' || item.kind === content)
  const entries = []

  for (const item of sections) {
    entries.push(...loadSectionPage(item, 1).items)
  }

  return new ArrayContentPager(entries.map(entryToContent).filter(Boolean), DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return normalizePublicUrl(url) === BASE_URL || parseInternalUrl(url)?.type === 'section' || sectionByUrl(url)
}

source.getChannel = function (url) {
  const section = sectionFromUrl(url)
  if (section) {
    return sectionChannel(section)
  }

  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'الموقع الرسمي لسماحة الشيخ عبد العزيز بن باز رحمه الله.',
    url: `${BASE_URL}`,
    urlAlternatives: [`${BASE_URL}/`]
  })
}

source.getChannelContents = function (url, _type, _order, filters) {
  const section = sectionFromUrl(url) ?? selectedSection(filters) ?? sectionById('fatwas-2')
  return new BinBazListPager(section)
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, type, order, filters) {
  const section = sectionFromUrl(url)
  return source.search(query, type, order, section ? { ...filters, section: section.id } : filters)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  return new ArrayChannelPager(
    [source.getChannel(BASE_URL), ...SECTIONS.map(sectionChannel)].filter(
      (channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)
    ),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'series' || /^https:\/\/binbaz\.org\.sa\/audios\/series\/\d+/i.test(normalizePublicUrl(url))
}

source.searchPlaylists = function (query, _type, _order, filters) {
  if (normalize_search_text(query)) return new ArrayPlaylistPager([], DEFAULT_LIMIT)
  const section = selectedSection(filters)
  const sections = section?.kind === 'audio' ? [section] : SECTIONS.filter((item) => item.kind === 'audio')
  const playlists = []

  for (const item of sections) {
    playlists.push(
      ...loadSectionPage(item, 1)
        .items.filter((entry) => entry.type === 'series')
        .map(entryToPlaylist)
    )
  }

  return new ArrayPlaylistPager(dedupe_by_url(playlists), DEFAULT_LIMIT)
}

source.getPlaylist = function (url) {
  const details = loadPlaylist(url)
  return grayjay.playlist_details(`series-${details.id}`, {
    name: details.title,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: seriesInternalUrl(details.url),
    videoCount: details.items.length,
    contents: new BinBazSeriesPager(details.url, details.items, details.hasMore, 1)
  })
}

source.getChannelPlaylists = function (url) {
  const section = sectionFromUrl(url)
  if (section && section.kind !== 'audio') return new ArrayPlaylistPager([], DEFAULT_LIMIT)
  return source.searchPlaylists('', null, null, section ? { section: section.id } : { content: 'audio' })
}

source.isContentDetailsUrl = function (url) {
  const normalized = normalizePublicUrl(url)
  const parsed = parseInternalUrl(url)
  return (
    parsed?.type === 'content' ||
    /^https:\/\/binbaz\.org\.sa\/(fatwas|audios|videos)\/\d+/i.test(normalized) ||
    /^https:\/\/files\.zadapps\.info\/.*\.mp3(?:$|\?)/i.test(normalized)
  )
}

source.getContentDetails = function (url) {
  const normalized = normalizePublicUrl(url)
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'content') return loadContent(parsed.url)
  if (/^https:\/\/files\.zadapps\.info\/.*\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToVideo(normalized)
  return loadContent(normalized)
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

function cachedDetail(url, load) {
  const normalized = normalizePublicUrl(url)
  const cached = cache_get(_state, CACHE_LIMITS, 'detailCache', normalized)
  if (cached) return cached
  return cache_set(_state, CACHE_LIMITS, 'detailCache', normalized, load())
}

function loadContent(url) {
  const normalized = normalizePublicUrl(url)
  return cachedDetail(normalized, () => {
    const html = fetchPage(normalized)
    const kind = contentKind(normalized)
    if (kind === 'video') return videoToNested(parseVideoDetail(html, normalized))

    const detail = parseAudioDetail(html, normalized, kind)
    if (!detail.audioUrl) throw new ScriptException(`No playable BinBaz MP3 found: ${normalized}`)
    return audioDetailToVideo(detail)
  })
}

function loadPlaylist(url) {
  const normalized = normalizePublicUrl(parseInternalUrl(url)?.url ?? url)
  const html = fetchPage(normalized)
  const id = extract_first(normalized, /\/audios\/series\/(\d+)/) ?? mediaId(normalized)
  const parsed = parseEntries(html, 'audio')
  return {
    id,
    url: normalized,
    title: titleFromHtml(html, 'سلسلة صوتية'),
    items: parsed.items.filter((item) => item.type === 'audio'),
    hasMore: Boolean(parsed.nextUrl)
  }
}

function loadSectionPage(section, page = 1) {
  if (!section) return { items: [], nextUrl: null }
  const url = withPage(section.url, page)
  const parsed = parseEntries(fetchPage(url), section.kind)
  return {
    items: parsed.items.map((item) => ({ ...item, sectionId: section.id, sectionName: section.name })),
    nextUrl: parsed.nextUrl
  }
}

function parseEntries(html, kind) {
  if (kind === 'video') return parseVideoEntries(html)

  const items = []
  const articleRegex = /<article\b[^>]*class="[^"]*box__body__element[^"]*(fatwa|audio)[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let match
  while ((match = articleRegex.exec(html)) !== null) {
    const body = match[2]
    const anchor = body.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!anchor) continue
    const url = normalizePublicUrl(anchor[1])
    const type = /\/audios\/series\//.test(url) ? 'series' : contentKind(url)
    const title = clean_text(anchor[2])
    const description = clean_text(extract_first(body, /<p[^>]*>([\s\S]*?)<\/p>/i) ?? '')
    if (!title || !url) continue
    items.push({ type, title, description, url })
  }

  return { items: dedupeEntries(items), nextUrl: nextUrl(html) }
}

function parseVideoEntries(html) {
  const items = []
  const regex = /<a\b[^>]*href="(https:\/\/binbaz\.org\.sa\/videos\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const title = clean_text(match[2])
    if (!title || /youtube-play/.test(match[2])) continue
    items.push({ type: 'video', title, description: '', url: normalizePublicUrl(match[1]) })
  }
  return { items: dedupeEntries(items), nextUrl: nextUrl(html) }
}

function parseAudioDetail(html, pageUrl, kind) {
  const files = parseDataFiles(html)
  const media = files.find(
    (item) => /^audio/i.test(item.type ?? '') || /^audio\//i.test(item.mime ?? '') || /\.mp3(?:$|\?)/i.test(item.link ?? '')
  )
  const fallbackAudio = extract_first(html, /<audio\b[^>]*src="([^"]+)"/i) ?? extract_first(html, /<a\b[^>]*href="([^"]+\.mp3[^"]*)"/i)
  return {
    kind,
    pageUrl,
    title: titleFromHtml(html, 'مادة صوتية'),
    description: descriptionFromHtml(html),
    audioUrl: mediaUrl(media?.link ?? fallbackAudio),
    createdAt: parseDate(media?.created_at?.date ?? extract_first(html, /itemprop="uploadDate"\s+content="([^"]+)"/i))
  }
}

function parseVideoDetail(html, pageUrl) {
  const embed = normalizePublicUrl(
    extract_first(html, /<meta\s+itemprop="embedUrl"\s+content="([^"]+)"/i) ??
      extract_first(html, /data-src="([^"]*youtube\.com\/embed\/[^"]+)"/i)
  )
  const youtubeId = extract_first(embed, /\/embed\/([^?&/]+)/)
  if (!youtubeId) throw new ScriptException(`No YouTube embed found for BinBaz video: ${pageUrl}`)

  return {
    pageUrl,
    title: titleFromHtml(html, 'مرئي'),
    description: descriptionFromHtml(html),
    contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    uploadDate: parseDate(extract_first(html, /itemprop="uploadDate"\s+content="([^"]+)"/i))
  }
}

function parseDataFiles(html) {
  const raw = extract_first(html, /data-files="([^"]+)"/i)
  if (!raw) return []
  try {
    return JSON.parse(decode_html(raw))
  } catch (e) {
    log(`Could not parse BinBaz data-files: ${e}`)
    return []
  }
}

function entryToContent(item) {
  if (item.type === 'series') return firstSeriesItem(item.url) ?? null
  if (item.type === 'video') return videoEntryToNested(item)
  return feedItem(item)
}

function feedItem(item) {
  return grayjay.feed_video(`${item.type}-${mediaId(item.url)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: contentInternalUrl(item.url),
    shareUrl: item.url
  })
}

function audioDetailToVideo(item) {
  const details = grayjay.video(`${item.kind}-${mediaId(item.pageUrl)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: item.createdAt,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: contentInternalUrl(item.pageUrl),
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
    shareUrl: item.pageUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayContentPager(relatedEntries(item), DEFAULT_LIMIT)
  }

  return details
}

function directMp3ToVideo(url) {
  const title = decodeURIComponent(
    url
      .split('/')
      .pop()
      .replace(/\.mp3(?:\?.*)?$/i, '')
  )
    .replace(/[_-]+/g, ' ')
    .trim()
  return grayjay.video(`mp3-${mediaId(url)}`, {
    name: title || 'BinBaz MP3',
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url,
    description: '',
    video: audio_source_descriptor({ name: 'MP3 Audio', container: 'audio/mpeg', codec: 'mp3', duration: 0, url, language: 'ar' }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: url
  })
}

function videoEntryToNested(item) {
  const id = mediaId(item.url)
  const youtubeId = extract_first(item.thumbnail, /\/vi\/([^/]+)\//)
  return grayjay.nested(`video-${id}`, {
    name: item.title,
    author: rootAuthor(),
    datetime: 0,
    url: contentInternalUrl(item.url),
    contentUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : item.url,
    contentName: item.title,
    contentDescription: item.description || '',
    contentProvider: youtubeId ? 'YouTube' : PLATFORM,
    contentThumbnails: item.thumbnail ? thumbnails(item.thumbnail) : staticThumbnails()
  })
}

function videoToNested(item) {
  return grayjay.nested(`video-${mediaId(item.pageUrl)}`, {
    name: item.title,
    author: rootAuthor(),
    datetime: item.uploadDate,
    url: contentInternalUrl(item.pageUrl),
    contentUrl: item.contentUrl,
    contentName: item.title,
    contentDescription: item.description,
    contentProvider: 'YouTube',
    contentThumbnails: thumbnails(item.thumbnail)
  })
}

function firstSeriesItem(url) {
  const html = fetchPage(url)
  const item = parseEntries(html, 'audio').items.find((entry) => entry.type === 'audio')
  return item ? feedItem(item) : null
}

function relatedEntries(item) {
  const related = []
  for (const section of SECTIONS.filter((section) => section.kind === item.kind)) {
    related.push(...loadSectionPage(section, 1).items.map(entryToContent).filter(Boolean))
    if (related.length >= DEFAULT_LIMIT) break
  }
  return dedupe_by_url(related)
    .filter((entry) => entry.url !== contentInternalUrl(item.pageUrl))
    .slice(0, DEFAULT_LIMIT)
}

function entryToPlaylist(item) {
  return grayjay.playlist(`series-${mediaId(item.url)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: seriesInternalUrl(item.url),
    videoCount: 0
  })
}

function sectionChannel(section) {
  return grayjay.channel(`section-${section.id}`, {
    name: section.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `قسم ${section.name} من موقع الشيخ ابن باز.`,
    url: sectionInternalUrl(section.id),
    urlAlternatives: [section.url]
  })
}

function rootAuthor() {
  return grayjay.author('binbaz', 'الشيخ عبد العزيز بن باز', BASE_URL, iconUrl())
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function titleFromHtml(html, fallback) {
  return (
    clean_text(extract_first(html, /<h1\b[^>]*class="[^"]*article-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)) ||
    clean_text(extract_first(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i)) ||
    clean_text(extract_first(html, /<title>([\s\S]*?)<\/title>/i)).replace(/\s*-\s*موقع الشيخ ابن باز\s*$/i, '') ||
    fallback
  )
}

function descriptionFromHtml(html) {
  return (
    clean_text(extract_first(html, /<div\b[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)) ||
    clean_text(extract_first(html, /<meta\s+name="description"\s+content="([^"]+)"/i)) ||
    ''
  )
}

function nextUrl(html) {
  const href =
    extract_first(html, /<a\b[^>]*href="([^"]+)"[^>]*rel="next"/i) ?? extract_first(html, /<a\b[^>]*rel="next"[^>]*href="([^"]+)"/i)
  return href ? normalizePublicUrl(href) : null
}

function mediaUrl(url) {
  if (!url) return null
  return encodeURI(normalizePublicUrl(String(url).replace(/\\\//g, '/')))
}

function normalizePublicUrl(url) {
  const value = decode_html(String(url ?? '').trim()).replace(/\\\//g, '/')
  if (!value) return ''
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `${BASE_URL}${value}`
  if (value.startsWith('http://binbaz.org.sa')) return value.replace('http://', 'https://')
  if (value.startsWith('http://files.zadapps.info')) return value.replace('http://', 'https://')
  return value
}

function withPage(url, page) {
  if (page <= 1) return url
  return `${url}?${query_string([['page', page]])}`
}

function parseDate(value) {
  const date = Date.parse(String(value ?? '').replace(' ', 'T'))
  return Number.isFinite(date) ? Math.floor(date / 1000) : 0
}

function contentKind(url) {
  if (/\/fatwas\//.test(url)) return 'fatwa'
  if (/\/videos\//.test(url)) return 'video'
  return 'audio'
}

function mediaId(url) {
  return (
    extract_first(url, /\/(?:fatwas|audios|videos|series)\/(\d+)/) ??
    String(url)
      .split('/')
      .pop()
      .replace(/[^\w-]+/g, '-')
  )
}

function sectionById(id) {
  return SECTIONS.find((section) => section.id === id)
}

function sectionByUrl(url) {
  const normalized = normalizePublicUrl(url)
  return SECTIONS.find((section) => section.url === normalized)
}

function sectionFromUrl(url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(url)
}

function dedupeEntries(items) {
  const urls = dedupe_strings(items.map((item) => item.url))
  return urls.map((url) => items.find((item) => item.url === url))
}

function sectionInternalUrl(id) {
  return `binbaz://section/${encodeURIComponent(id)}`
}

function contentInternalUrl(url) {
  return `binbaz://content/${encodeURIComponent(normalizePublicUrl(url))}`
}

function seriesInternalUrl(url) {
  return `binbaz://series/${encodeURIComponent(normalizePublicUrl(url))}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  const match = value.match(/^binbaz:\/\/(section|content|series)\/(.+)$/)
  if (!match) return null
  const decoded = decodeURIComponent(match[2])
  return match[1] === 'section' ? { type: 'section', id: decoded } : { type: match[1], url: decoded }
}

function contentFilter() {
  return {
    id: 'content',
    name: 'المحتوى',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'الكل', value: 'all' },
      { id: 'fatwa', name: 'فتاوى صوتية', value: 'fatwa' },
      { id: 'audio', name: 'صوتيات', value: 'audio' },
      { id: 'video', name: 'مرئيات', value: 'video' }
    ]
  }
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

function selectedContent(filters) {
  const value = selected_filter_values(filters, 'content')[0]
  return value && value !== 'all' ? value : 'all'
}

function selectedSection(filters) {
  const value = selected_filter_values(filters, 'section')[0]
  return value && value !== 'all' ? sectionById(value) : null
}

class BinBazListPager extends VideoPager {
  constructor(section, page = 1) {
    const loaded = loadSectionPage(section, page)
    super(loaded.items.map(entryToContent).filter(Boolean), Boolean(loaded.nextUrl), { section, page })
  }

  nextPage() {
    return apply_pager_state(this, new BinBazListPager(this.context.section, this.context.page + 1))
  }
}

class BinBazSeriesPager extends VideoPager {
  constructor(url, firstPageItems = null, hasMore = false, page = 1) {
    const loaded = firstPageItems
      ? { items: firstPageItems, nextUrl: hasMore ? withPage(url, page + 1) : null }
      : parseEntries(fetchPage(withPage(url, page)), 'audio')
    super(loaded.items.filter((item) => item.type === 'audio').map(feedItem), Boolean(loaded.nextUrl), { url, page })
  }

  nextPage() {
    return apply_pager_state(this, new BinBazSeriesPager(this.context.url, null, false, this.context.page + 1))
  }
}

const ArrayContentPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`)
