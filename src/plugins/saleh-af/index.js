import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first } from '@lib/html.js'
import { cache_get, cache_set, get_text, init_lru_caches } from '@lib/http.js'
import { audio_source_descriptor, thumbnails } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'Saleh Al Sheikh'
const BASE_URL = 'https://saleh.af.org.sa'
const DEFAULT_ICON = `${BASE_URL}/sites/default/files/logo_0_0.png`
const DEFAULT_LIMIT = 24
const CACHE_LIMITS = { pageCache: 50 }

const SECTIONS = [
  { id: 'ftawa', name: 'الفتاوى', url: `${BASE_URL}/ar/ftawa` },
  { id: 'mohadrat', name: 'المحاضرات', url: `${BASE_URL}/ar/mohadrat` },
  { id: 'khotab', name: 'الخطب', url: `${BASE_URL}/ar/khotab` }
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
  return new SalehPager(sectionById('mohadrat'))
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [sectionFilter()]
})

source.searchSuggestions = function (query) {
  const terms = ['التوحيد', 'العلم', 'الإيمان', 'الفتاوى', 'المحاضرات', 'الخطب']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, filters) {
  const needle = normalize_search_text(query)
  const items = selectedSections(filters).flatMap((section) => parseItems(fetchPage(section.url), section))
  return new ArrayVideoPager(
    items.filter((item) => !needle || normalize_search_text(item.title).includes(needle)).map(itemToDetails),
    DEFAULT_LIMIT
  )
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return (
    parsed?.type === 'root' ||
    parsed?.type === 'section' ||
    normalizePublicUrl(url) === BASE_URL ||
    Boolean(sectionByUrl(normalizePublicUrl(url)))
  )
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  if (section) return sectionChannel(section)

  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'الموقع الرسمي للشيخ صالح بن عبد العزيز آل الشيخ.',
    url: 'salehaf://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  return new SalehPager(section ?? sectionById('mohadrat'))
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, type, order, filters) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'section' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  return source.search(query, type, order, section ? { section: section.id } : filters)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  return new ArrayChannelPager(
    [source.getChannel('salehaf://root'), ...SECTIONS.map(sectionChannel)].filter(
      (channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)
    ),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'playlist' || Boolean(sectionByUrl(normalizePublicUrl(url)))
}

source.searchPlaylists = function (query, _type, _order, filters) {
  const needle = normalize_search_text(query)
  return new ArrayPlaylistPager(
    selectedSections(filters)
      .map(sectionToPlaylist)
      .filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  const section = parsed?.type === 'playlist' ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))
  if (!section) throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  const items = parseItems(fetchPage(section.url), section)
  return grayjay.playlist_details(`playlist-${section.id}`, {
    name: section.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(section.id),
    videoCount: items.length,
    contents: new ArrayVideoPager(items.map(itemToDetails), DEFAULT_LIMIT)
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
  return parsed?.type === 'audio' || /^https:\/\/saleh\.af\.org\.sa\/sites\/default\/files\/.*\.mp3/i.test(normalized)
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'audio')
    return itemToDetails({ section: sectionById(parsed.section), title: parsed.title, audioUrl: parsed.audioUrl, thumb: parsed.thumb })
  const normalized = normalizePublicUrl(url)
  if (/\.mp3(?:$|\?)/i.test(normalized))
    return itemToDetails({ section: sectionById('mohadrat'), title: decodeTitle(normalized), audioUrl: normalized, thumb: '' })
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

function parseItems(html, section) {
  const items = []
  const regex = /<div\b[^>]*class="[^"]*audioplayer-tobe[^"]*"[^>]*>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0]
    const title = clean_text(attr(tag, 'data-videoTitle'))
    const audioUrl = mediaUrl(attr(tag, 'data-source'))
    const thumb = normalizePublicUrl(attr(tag, 'data-thumb'))
    if (!title || !audioUrl || !/\.mp3(?:$|\?)/i.test(audioUrl)) continue
    items.push({ section, title, audioUrl, thumb })
  }
  return dedupe_by_url(items.map((item) => ({ ...item, url: audioUrlInternal(item) })))
}

function itemToDetails(item) {
  const details = grayjay.video(`audio-${item.section.id}-${mediaId(item.audioUrl)}`, {
    name: item.title,
    thumbnails: item.thumb ? thumbnails(item.thumb) : staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: audioUrlInternal(item),
    description: item.section.name,
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
    shareUrl: item.audioUrl
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(
      parseItems(fetchPage(item.section.url), item.section)
        .filter((candidate) => candidate.url !== audioUrlInternal(item))
        .map(itemToDetails),
      DEFAULT_LIMIT
    )
  }

  return details
}

function sectionChannel(section) {
  return grayjay.channel(`section-${section.id}`, {
    name: section.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${section.name} الشيخ صالح آل الشيخ`,
    url: sectionUrl(section.id),
    urlAlternatives: [section.url]
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
  return grayjay.author('saleh-af', 'الشيخ صالح آل الشيخ', BASE_URL, iconUrl())
}

function attr(tag, name) {
  return decode_html(extract_first(tag, new RegExp(`${name}="([^"]*)"`, 'i')) ?? '').trim()
}

function mediaUrl(value) {
  const raw = decode_html(String(value ?? '').trim())
  if (!raw) return ''
  return encodeURI(normalizePublicUrl(raw))
}

function normalizePublicUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`
  return raw.replace('http://saleh.af.org.sa', 'https://saleh.af.org.sa')
}

function decodeTitle(url) {
  return decodeURIComponent(
    String(url)
      .split('/')
      .pop()
      .replace(/\.mp3(?:\?.*)?$/i, '')
  ).replace(/[_-]+/g, ' ')
}

function mediaId(url) {
  return String(url)
    .split('/')
    .pop()
    .replace(/[^\w-]+/g, '-')
}

function selectedSections(filters) {
  const value = selected_filter_values(filters, 'section')[0]
  return value && value !== 'all' ? SECTIONS.filter((section) => section.id === value) : SECTIONS
}

function sectionById(id) {
  return SECTIONS.find((section) => section.id === id)
}

function sectionByUrl(url) {
  return SECTIONS.find((section) => section.url === url)
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

function sectionUrl(id) {
  return `salehaf://section/${id}`
}

function playlistUrl(id) {
  return `salehaf://playlist/${id}`
}

function audioUrlInternal(item) {
  return `salehaf://audio/${item.section.id}/${encodeURIComponent(item.title)}/${encodeURIComponent(item.audioUrl)}/${encodeURIComponent(item.thumb || '')}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'salehaf://root') return { type: 'root' }
  let match = value.match(/^salehaf:\/\/section\/([^/]+)$/)
  if (match) return { type: 'section', id: match[1] }
  match = value.match(/^salehaf:\/\/playlist\/([^/]+)$/)
  if (match) return { type: 'playlist', id: match[1] }
  match = value.match(/^salehaf:\/\/audio\/([^/]+)\/([^/]+)\/([^/]+)\/?(.*)$/)
  if (match)
    return {
      type: 'audio',
      section: match[1],
      title: decodeURIComponent(match[2]),
      audioUrl: decodeURIComponent(match[3]),
      thumb: decodeURIComponent(match[4] || '')
    }
  return null
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

class SalehPager extends VideoPager {
  constructor(section, page = 0) {
    const url = page ? `${section.url}?page=${page}` : section.url
    const html = fetchPage(url)
    super(parseItems(html, section).map(itemToDetails), Boolean(extract_first(html, /rel="next"/i)), { section, page })
  }

  nextPage() {
    return apply_pager_state(this, new SalehPager(this.context.section, this.context.page + 1))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`)
