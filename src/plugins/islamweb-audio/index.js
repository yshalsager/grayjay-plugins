import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first } from '@lib/html.js'
import { cache_get, cache_set, get_text, init_lru_caches, query_string } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'IslamWeb Audio'
const BASE_URL = 'https://audio.islamweb.net/audio'
const DEFAULT_ICON = 'https://www.islamweb.net/favicon.ico'
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { pageCache: 160 }

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
  return new IslamWebAudioListPager(`${BASE_URL}/index.php?page=allsoura&qid=1762&tab=qareelast`)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [searchFilter()]
})

source.searchSuggestions = function (query) {
  const terms = ['التوحيد', 'القرآن', 'الفقه', 'العقيدة', 'محمد مكي', 'ابن باز']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, filters) {
  return new IslamWebSearchPager(query || 'التوحيد', selectedSearchTab(filters), 0)
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return (
    parsed?.type === 'root' ||
    parsed?.type === 'reader' ||
    parsed?.type === 'speaker' ||
    /page=(allsoura|lecview).*?(qid|sid)=\d+/i.test(String(url ?? ''))
  )
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url) || publicChannel(url)
  if (parsed?.type === 'reader')
    return simpleChannel(
      `reader-${parsed.id}`,
      parsed.name || detailTitle(fetchPage(readerPage(parsed.id))),
      readerUrl(parsed.id),
      readerPage(parsed.id)
    )
  if (parsed?.type === 'speaker')
    return simpleChannel(
      `speaker-${parsed.id}`,
      parsed.name || detailTitle(fetchPage(speakerPage(parsed.id))),
      speakerUrl(parsed.id),
      speakerPage(parsed.id)
    )
  return grayjay.channel('root', {
    name: 'صوتيات إسلام ويب',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'تلاوات القرآن الكريم ومحاضرات ودروس إسلام ويب الصوتية.',
    url: 'islamweb-audio://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url) || publicChannel(url)
  if (parsed?.type === 'reader') return new IslamWebAudioListPager(readerPage(parsed.id))
  if (parsed?.type === 'speaker') return new IslamWebAudioListPager(speakerPage(parsed.id))
  return source.getHome()
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, type, order, filters) {
  const needle = normalize_search_text(query)
  const pager = source.getChannelContents(url, type, order, filters)
  pager.results = pager.results.filter((item) => !needle || normalize_search_text(item.name).includes(needle))
  return pager
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [
    ...parseChannels(fetchPage(`${BASE_URL}/index.php?page=qareelast`), 'reader'),
    ...parseChannels(fetchPage(`${BASE_URL}/index.php?page=lectures`), 'speaker')
  ]
  return new ArrayChannelPager(
    channels.filter((channel) => !needle || normalize_search_text(channel.name).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'reader' || parsed?.type === 'series' || /page=(allsoura|lecview).*?(qid|sid)=\d+/i.test(String(url ?? ''))
}

source.searchPlaylists = function (query, _type, _order, _filters) {
  const needle = normalize_search_text(query)
  const playlists = parseSeries(fetchPage(speakerPage(1265))).filter(
    (playlist) => !needle || normalize_search_text(playlist.name).includes(needle)
  )
  return new ArrayPlaylistPager(playlists, DEFAULT_LIMIT)
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url) || publicChannel(url)
  if (parsed?.type === 'reader') return pagePlaylist(readerPage(parsed.id), readerUrl(parsed.id))
  if (parsed?.type === 'series') return pagePlaylist(seriesPage(parsed.sid, parsed.lg), seriesUrl(parsed.sid, parsed.lg))
  throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url) || publicChannel(url)
  if (parsed?.type === 'reader')
    return new ArrayPlaylistPager([playlistSummary(detailTitle(fetchPage(readerPage(parsed.id))), readerUrl(parsed.id), 0)], DEFAULT_LIMIT)
  if (parsed?.type === 'speaker') return new ArrayPlaylistPager(parseSeries(fetchPage(speakerPage(parsed.id))), DEFAULT_LIMIT)
  return new ArrayPlaylistPager([], DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'audio' || /audioid=\d+/i.test(String(url ?? ''))
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'audio' && parsed.media)
    return audioDetails({ id: parsed.id, title: parsed.title, media: parsed.media, shareUrl: audioInfoUrl(parsed.id) })
  const id = parsed?.id || String(url ?? '').match(/audioid=(\d+)/i)?.[1]
  return audioDetailsFromPage(fetchPage(audioInfoUrl(id)), id)
}

function parseState(value) {
  try {
    return JSON.parse(value || '{}')
  } catch (_e) {
    return {}
  }
}

function fetchPage(url) {
  const normalized = absoluteUrl(url)
  const cached = cache_get(_state, CACHE_LIMITS, 'pageCache', normalized)
  if (cached) return cached
  return cache_set(_state, CACHE_LIMITS, 'pageCache', normalized, get_text(normalized, { Accept: 'text/html,application/xhtml+xml' }))
}

function parseRows(html) {
  const rows = []
  const regex = /<li\b[^>]*id=['"]poem-line-(\d+)['"][\s\S]*?<\/li>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const row = match[0]
    const id = match[1]
    const href = attr(row, 'href') || `index.php?page=audioinfo&audioid=${id}`
    const media = attr(row, 'data-file') || attr(row, 'data-mp3') || attr(row, 'url')
    const title = clean_text(extract_first(row, /href=['"][^'"]*audioinfo[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i)) || `مادة ${id}`
    if (media) rows.push({ id, title, media: absoluteUrl(media), shareUrl: absoluteUrl(href) })
  }
  return dedupe_by_url(rows.map((row) => audioFeed(row)))
}

function parseChannels(html, kind) {
  const key = kind === 'reader' ? 'qid' : 'sid'
  const page = kind === 'reader' ? 'allsoura' : 'lecview'
  const regex = new RegExp(`<a\\b[^>]*href=['"][^'"]*page=${page}[^'"]*${key}=(\\d+)[^'"]*['"][^>]*>([\\s\\S]*?)<\\/a>`, 'gi')
  const items = []
  let match
  while ((match = regex.exec(html)) !== null) {
    const name = clean_text(match[2])
    if (name && !/^\d+$/.test(name))
      items.push(
        simpleChannel(
          `${kind}-${match[1]}`,
          name,
          kind === 'reader' ? readerUrl(match[1], name) : speakerUrl(match[1], name),
          kind === 'reader' ? readerPage(match[1]) : speakerPage(match[1])
        )
      )
  }
  return dedupeChannels(items)
}

function parseSeries(html) {
  const items = []
  const regex = /<a\b[^>]*href=['"]([^'"]*page=lecview[^'"]*sid=(\d+)[^'"]*lg=(\d+)[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const name = clean_text(match[4]) || `سلسلة ${match[3]}`
    items.push(playlistSummary(name, seriesUrl(match[2], match[3]), 0))
  }
  return dedupe_by_url(items)
}

function audioFeed(item) {
  return grayjay.feed_video(`audio-${item.id}`, {
    name: item.title,
    thumbnails: static_thumbnails(_config, DEFAULT_ICON),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: audioUrl(item.id, item.title, item.media),
    description: item.shareUrl,
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: item.media,
      language: 'ar'
    }),
    shareUrl: item.shareUrl
  })
}

function audioDetails(item) {
  return grayjay.video(`audio-${item.id}`, {
    name: item.title,
    thumbnails: static_thumbnails(_config, DEFAULT_ICON),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: audioUrl(item.id, item.title, item.media),
    description: item.shareUrl,
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: item.media,
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: item.shareUrl,
    getContentRecommendations: () => new ArrayVideoPager([], DEFAULT_LIMIT)
  })
}

function audioDetailsFromPage(html, id) {
  const media = contentUrl(html) || attrFromHtml(html, 'data-file') || `${BASE_URL}/downloadmp3.php?audioid=${id}`
  return audioDetails({ id, title: detailTitle(html), media: absoluteUrl(media), shareUrl: audioInfoUrl(id) })
}

function pagePlaylist(pageUrl, internalUrl) {
  const html = fetchPage(pageUrl)
  const contents = parseRows(html)
  return grayjay.playlist_details(`playlist-${internalUrl}`, {
    name: detailTitle(html),
    thumbnails: static_thumbnails(_config, DEFAULT_ICON),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: internalUrl,
    videoCount: contents.length,
    contents: new ArrayVideoPager(contents, DEFAULT_LIMIT)
  })
}

function playlistSummary(name, url, count) {
  return grayjay.playlist(`playlist-${url}`, {
    name,
    thumbnails: static_thumbnails(_config, DEFAULT_ICON),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url,
    videoCount: count
  })
}

function simpleChannel(id, name, url, publicUrl) {
  return grayjay.channel(id, { name, thumbnail: iconUrl(), banner: iconUrl(), description: name, url, urlAlternatives: [publicUrl] })
}

function detailTitle(html) {
  return clean_text(extract_first(html, /<title>([^<]+)/i) || PLATFORM).replace(/ - صوتيات إسلام ويب.*/i, '')
}

function attr(tag, name) {
  return decode_html(extract_first(tag, new RegExp(`${name}=['"]([^'"]*)['"]`, 'i')) || '').trim()
}

function attrFromHtml(html, name) {
  return decode_html(extract_first(html, new RegExp(`${name}=['"]([^'"]*)['"]`, 'i')) || '').trim()
}

function contentUrl(html) {
  return decode_html(
    extract_first(html, /itemprop=['"]contentUrl['"][^>]*content=['"]([^'"]+)['"]/i) ||
      extract_first(html, /content=['"]([^'"]+)['"][^>]*itemprop=['"]contentUrl['"]/i) ||
      ''
  ).trim()
}

function absoluteUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://')
  return `${BASE_URL}/${raw.replace(/^\//, '').replace(/^audio\//, '')}`
}

function readerPage(id) {
  return `${BASE_URL}/index.php?page=allsoura&qid=${id}&tab=qareelast`
}

function speakerPage(id) {
  return `${BASE_URL}/index.php?page=lecview&sid=${id}`
}

function seriesPage(sid, lg) {
  return `${BASE_URL}/index.php?page=lecview&sid=${sid}&read=0&lg=${lg}&kh=0`
}

function audioInfoUrl(id) {
  return `${BASE_URL}/index.php?page=audioinfo&audioid=${id}`
}

function audioUrl(id, title = '', media = '') {
  return `islamweb-audio://audio/${id}/${encodeURIComponent(title)}/${encodeURIComponent(media)}`
}

function readerUrl(id, name = '') {
  return `islamweb-audio://reader/${id}/${encodeURIComponent(name)}`
}

function speakerUrl(id, name = '') {
  return `islamweb-audio://speaker/${id}/${encodeURIComponent(name)}`
}

function seriesUrl(sid, lg) {
  return `islamweb-audio://series/${sid}/${lg}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'islamweb-audio://root') return { type: 'root' }
  let match = value.match(/^islamweb-audio:\/\/audio\/(\d+)\/([^/]*)\/(.*)$/)
  if (match) return { type: 'audio', id: match[1], title: decodeURIComponent(match[2]), media: decodeURIComponent(match[3]) }
  match = value.match(/^islamweb-audio:\/\/reader\/(\d+)\/?(.*)$/)
  if (match) return { type: 'reader', id: match[1], name: decodeURIComponent(match[2] || '') }
  match = value.match(/^islamweb-audio:\/\/speaker\/(\d+)\/?(.*)$/)
  if (match) return { type: 'speaker', id: match[1], name: decodeURIComponent(match[2] || '') }
  match = value.match(/^islamweb-audio:\/\/series\/(\d+)\/(\d+)$/)
  if (match) return { type: 'series', sid: match[1], lg: match[2] }
  return null
}

function publicChannel(url) {
  const value = String(url ?? '')
  let match = value.match(/page=allsoura[^#]*qid=(\d+)/i)
  if (match) return { type: 'reader', id: match[1] }
  match = value.match(/page=lecview[^#]*sid=(\d+)/i)
  if (match) return { type: 'speaker', id: match[1] }
  return null
}

function searchFilter() {
  return {
    id: 'tab',
    name: 'نوع البحث',
    isMultiSelect: false,
    filters: [
      { id: 'titlelec', name: 'عناوين المحاضرات', value: 'titlelec' },
      { id: 'qiraname', name: 'أسماء القراء', value: 'qiraname' },
      { id: 'namelec', name: 'أسماء المحاضرين', value: 'namelec' }
    ]
  }
}

function selectedSearchTab(filters) {
  return selected_filter_values(filters, 'tab')[0] || 'titlelec'
}

function rootAuthor() {
  return grayjay.author('islamweb-audio', 'إسلام ويب', BASE_URL, iconUrl())
}

function dedupeChannels(channels) {
  const seen = {}
  return channels.filter((channel) => {
    if (!channel.url || seen[channel.url]) return false
    seen[channel.url] = true
    return true
  })
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

class IslamWebAudioListPager extends VideoPager {
  constructor(url, page = 1) {
    const pageUrl = page > 1 ? `${url}&pageno=${page}` : url
    const html = fetchPage(pageUrl)
    super(parseRows(html), /pageno=\d+/i.test(html), { url, page })
  }

  nextPage() {
    return apply_pager_state(this, new IslamWebAudioListPager(this.context.url, this.context.page + 1))
  }
}

class IslamWebSearchPager extends VideoPager {
  constructor(query, tab = 'titlelec', page = 0) {
    const html = fetchPage(
      `${BASE_URL}/ajax/index.php?${query_string([
        ['page', tab],
        ['kword', query],
        ['pageno', page]
      ])}`
    )
    super(tab === 'titlelec' ? parseRows(html) : [], /pageno=\d+/i.test(html), { query, tab, page })
  }

  nextPage() {
    return apply_pager_state(this, new IslamWebSearchPager(this.context.query, this.context.tab, this.context.page + 1))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + static_thumbnails(_config, DEFAULT_ICON).sources.length)
