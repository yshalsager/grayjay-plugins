import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, init_lru_caches, cache_get, cache_set, query_string } from '@lib/http.js'
import { audio_source_descriptor, thumbnails } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'AlQasim'
const BASE_URL = 'https://a-alqasim.com'
const API_URL = `${BASE_URL}/wp-json/alqasim-api/v1`
const DEFAULT_ICON = `${BASE_URL}/favicon.ico`
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { jsonCache: 160 }

const KINDS = [
  { id: 'lessons', name: 'الدروس', publicType: 'sounds-explain' },
  { id: 'sermons', name: 'الخطب', publicType: 'khotab' },
  { id: 'sounds', name: 'التلاوات', publicType: 'sounds' },
  { id: 'videos', name: 'المرئيات', publicType: 'video' }
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
  const home = fetchJson(`${API_URL}/home`)
  return new ArrayVideoPager(
    KINDS.flatMap((kind) => (home[kind.id] ?? []).map((post) => postToContent(post, kind.id))).filter(Boolean),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [contentFilter()]
})

source.searchSuggestions = function (query) {
  const terms = ['القرآن', 'العلم', 'التوحيد', 'الخطب', 'التفسير', 'الحديث', 'العقيدة']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, filters) {
  const pager = new AlQasimSearchPager(
    query,
    1,
    selectedKinds(filters).map((kind) => kind.id)
  )
  if (query) return pager
  return new ArrayVideoPager(
    selectedKinds(filters)
      .flatMap((kind) => postsFrom(fetchList(kind.id, 1)).map((post) => postToContent(post, kind.id)))
      .filter(Boolean),
    DEFAULT_LIMIT
  )
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'root' || parsed?.type === 'channel' || parsed?.type === 'category' || normalizePublicUrl(url) === BASE_URL
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'channel') return kindChannel(kindById(parsed.kind))
  if (parsed?.type === 'category') return categoryChannel(parsed.kind, categoryById(parsed.kind, parsed.categoryId))

  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'دروس وخطب وتلاوات ومرئيات الشيخ عبد المحسن القاسم.',
    url: 'alqasim://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'category') return new AlQasimCategoryPager(parsed.kind, parsed.categoryId)
  return new AlQasimKindPager(parsed?.type === 'channel' ? parsed.kind : 'lessons')
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'channel') return source.search(query, null, null, { content: parsed.kind })
  if (parsed?.type === 'category') {
    const needle = normalize_search_text(query)
    return new ArrayVideoPager(
      postsFrom(fetchCategory(parsed.kind, parsed.categoryId, 1))
        .map((post) => postToContent(post, parsed.kind))
        .filter((item) => item && (!needle || normalize_search_text(item.name).includes(needle))),
      DEFAULT_LIMIT
    )
  }
  return source.search(query, null, null, null)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [
    source.getChannel('alqasim://root'),
    ...KINDS.map(kindChannel),
    ...KINDS.flatMap((kind) =>
      categoryTree(kind.id)
        .slice(0, 12)
        .map((category) => categoryChannel(kind.id, category))
    )
  ]
  return new ArrayChannelPager(
    channels.filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  return parseInternalUrl(url)?.type === 'playlist'
}

source.searchPlaylists = function (query, _type, _order, filters) {
  const needle = normalize_search_text(query)
  const playlists = selectedKinds(filters).flatMap((kind) =>
    categoryTree(kind.id)
      .filter((category) => category.count > 0)
      .map((category) => categoryToPlaylist(kind.id, category))
  )
  return new ArrayPlaylistPager(
    playlists.filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type !== 'playlist') throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  const category = categoryById(parsed.kind, parsed.categoryId)
  return grayjay.playlist_details(`playlist-${parsed.kind}-${parsed.categoryId}`, {
    name: category.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url,
    videoCount: category.count || 0,
    contents: new AlQasimCategoryPager(parsed.kind, parsed.categoryId)
  })
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  const kinds = parsed?.type === 'channel' ? [kindById(parsed.kind)] : KINDS
  if (parsed?.type === 'category')
    return new ArrayPlaylistPager([categoryToPlaylist(parsed.kind, categoryById(parsed.kind, parsed.categoryId))], DEFAULT_LIMIT)
  return new ArrayPlaylistPager(
    kinds.flatMap((kind) =>
      categoryTree(kind.id)
        .filter((category) => category.count > 0)
        .map((category) => categoryToPlaylist(kind.id, category))
    ),
    DEFAULT_LIMIT
  )
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return (
    parsed?.type === 'content' ||
    /^https:\/\/(?:a-alqasim\.com|files\.a-alqasim\.com)\/.*\.mp3(?:$|\?)/i.test(normalized) ||
    youtubeId(normalized)
  )
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'content') return postToDetails(fetchDetail(parsed.kind, parsed.id), parsed.kind)

  const normalized = normalizePublicUrl(url)
  if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized)
  const id = youtubeId(normalized)
  if (id) return youtubeToNested({ id, title: 'YouTube', video_url: normalized }, 'videos', normalized)
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

function fetchList(kind, page = 1) {
  return fetchJson(
    `${API_URL}/${kind}?${query_string([
      ['page', page],
      ['per_page', DEFAULT_LIMIT]
    ])}`
  )
}

function fetchDetail(kind, id) {
  return fetchJson(`${API_URL}/${kind}/${id}?lang=ar`)
}

function fetchCategory(kind, id, page = 1) {
  return fetchJson(
    `${API_URL}/${kind}/category/${id}?${query_string([
      ['page', page],
      ['per_page', DEFAULT_LIMIT],
      ['order_by_number', kind !== 'sermons']
    ])}`
  )
}

function categoryTree(kind) {
  return fetchJson(`${API_URL}/${kind}/category-tree?parent_id=0&depth=1`).tree ?? []
}

function postsFrom(data) {
  return Array.isArray(data?.posts) ? data.posts : []
}

function categoryById(kind, id) {
  const cached = categoryTree(kind).find((category) => String(category.id) === String(id))
  if (cached) return cached
  return fetchCategory(kind, id, 1).term ?? { id, name: `${kindById(kind).name} ${id}`, count: 0 }
}

function postToContent(post, fallbackKind = null) {
  const kind = normalizeKind(post.post_type || fallbackKind)
  if (!kind) return null
  if (mediaUrl(post.audio_url)) return postToFeed(post, kind)
  if (kind === 'videos' && youtubeId(post.video_url)) return youtubeToNested(post, kind)
  return null
}

function postToFeed(post, kind) {
  return grayjay.feed_video(`${kind}-${post.id}`, {
    name: postTitle(post),
    thumbnails: imageThumbnails(post.thumbnail),
    author: authorForPost(post, kind),
    uploadDate: parseDate(post.date),
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: contentUrl(kind, post.id),
    description: clean_text(post.excerpt || post.content || kindById(kind).name),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: mediaUrl(post.audio_url),
      language: 'ar'
    }),
    shareUrl: publicPostUrl(post, kind)
  })
}

function postToDetails(post, kind) {
  if (mediaUrl(post.audio_url)) {
    return grayjay.video(`${kind}-${post.id}`, {
      name: postTitle(post),
      thumbnails: imageThumbnails(post.thumbnail),
      author: authorForPost(post, kind),
      uploadDate: parseDate(post.date),
      duration: 0,
      viewCount: 0,
      isLive: false,
      url: contentUrl(kind, post.id),
      description: clean_text(post.content || post.excerpt || kindById(kind).name),
      video: audio_source_descriptor({
        name: 'MP3 Audio',
        container: 'audio/mpeg',
        codec: 'mp3',
        duration: 0,
        url: mediaUrl(post.audio_url),
        language: 'ar'
      }),
      live: null,
      rating: null,
      subtitles: [],
      shareUrl: publicPostUrl(post, kind),
      getContentRecommendations: () => recommendations(post, kind)
    })
  }
  if (kind === 'videos' && youtubeId(post.video_url)) return youtubeToNested(post, kind)
  throw new ScriptException(`${PLATFORM} playable media not found`)
}

function youtubeToNested(post, kind, requestedUrl = null) {
  const id = youtubeId(post.video_url || requestedUrl)
  if (!id) return null
  const watchUrl = `https://www.youtube.com/watch?v=${id}`
  return grayjay.nested(`youtube-${post.id ?? id}`, {
    name: postTitle(post),
    author: authorForPost(post, kind),
    datetime: parseDate(post.date),
    url: requestedUrl || contentUrl(kind, post.id),
    contentUrl: watchUrl,
    contentName: postTitle(post),
    contentDescription: clean_text(post.content || post.excerpt || ''),
    contentProvider: 'YouTube',
    contentThumbnails: imageThumbnails(post.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`)
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

function recommendations(post, kind) {
  const category = (post.categories ?? []).slice(-1)[0]
  if (!category?.id) return new AlQasimKindPager(kind)
  const items = postsFrom(fetchCategory(kind, category.id, 1))
    .filter((item) => String(item.id) !== String(post.id))
    .map((item) => postToContent(item, kind))
    .filter(Boolean)
  return new ArrayVideoPager(items, DEFAULT_LIMIT)
}

function postTitle(post) {
  return clean_text(post?.title || PLATFORM)
}

function publicPostUrl(post, kind) {
  if (!post?.slug) return BASE_URL
  return `${BASE_URL}/${kindById(kind).publicType}/${post.slug}/`
}

function mediaUrl(value) {
  return encodeUrl(normalizePublicUrl(value))
}

function normalizePublicUrl(url) {
  const raw = decode_html(String(url ?? '').trim())
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`
  return raw.replace(/^http:\/\//i, 'https://').replace(/^https:\/\/www\.a-alqasim\.com/i, BASE_URL)
}

function youtubeId(url) {
  return (
    String(url ?? '').match(/youtube\.com\/embed\/([^/?&"']+)/i)?.[1] ||
    String(url ?? '').match(/[?&]v=([^&]+)/)?.[1] ||
    String(url ?? '').match(/youtu\.be\/([^/?&"']+)/i)?.[1] ||
    ''
  )
}

function imageThumbnails(url) {
  const normalized = normalizePublicUrl(url)
  return normalized ? thumbnails(encodeUrl(normalized)) : staticThumbnails()
}

function encodeUrl(url) {
  try {
    return encodeURI(decodeURI(url))
  } catch (_e) {
    return encodeURI(url)
  }
}

function rootAuthor() {
  return grayjay.author('alqasim', 'الشيخ عبد المحسن القاسم', BASE_URL, iconUrl())
}

function authorForPost(post, kind) {
  const name = (post.categories ?? [])[0]?.name || kindById(kind).name
  return grayjay.author(`author-${normalize_search_text(name) || kind}`, name, BASE_URL, iconUrl())
}

function kindChannel(kind) {
  return grayjay.channel(`kind-${kind.id}`, {
    name: kind.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${kind.name} - ${PLATFORM}`,
    url: kindUrl(kind.id),
    urlAlternatives: [`${BASE_URL}/${kind.publicType}/`]
  })
}

function categoryChannel(kind, category) {
  return grayjay.channel(`category-${kind}-${category.id}`, {
    name: category.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: clean_text(category.description || `${category.name} - ${kindById(kind).name}`),
    url: categoryUrl(kind, category.id),
    urlAlternatives: [`${BASE_URL}/${kindById(kind).publicType}-cats/${category.slug || category.id}/`]
  })
}

function categoryToPlaylist(kind, category) {
  return grayjay.playlist(`playlist-${kind}-${category.id}`, {
    name: category.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(kind, category.id),
    videoCount: category.count || 0
  })
}

function contentFilter() {
  return {
    id: 'content',
    name: 'المحتوى',
    isMultiSelect: false,
    filters: [{ id: 'all', name: 'كل المحتوى', value: 'all' }, ...KINDS.map((kind) => ({ id: kind.id, name: kind.name, value: kind.id }))]
  }
}

function selectedKinds(filters) {
  const value = selected_filter_values(filters, 'content')[0]
  return value && value !== 'all' ? [kindById(value)] : KINDS
}

function kindById(id) {
  return KINDS.find((kind) => kind.id === id)
}

function normalizeKind(value) {
  if (KINDS.some((kind) => kind.id === value)) return value
  if (value === 'sounds-explain') return 'lessons'
  if (value === 'khotab') return 'sermons'
  if (value === 'video') return 'videos'
  return null
}

function parseDate(value) {
  const raw = String(value ?? '')
  if (!raw) return 0
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

function kindUrl(kind) {
  return `alqasim://channel/${kind}`
}

function categoryUrl(kind, id) {
  return `alqasim://category/${kind}/${id}`
}

function playlistUrl(kind, id) {
  return `alqasim://playlist/${kind}/${id}`
}

function contentUrl(kind, id) {
  return `alqasim://content/${kind}/${id}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'alqasim://root') return { type: 'root' }
  let match = value.match(/^alqasim:\/\/channel\/([^/]+)$/)
  if (match) return { type: 'channel', kind: match[1] }
  match = value.match(/^alqasim:\/\/category\/([^/]+)\/([^/]+)$/)
  if (match) return { type: 'category', kind: match[1], categoryId: match[2] }
  match = value.match(/^alqasim:\/\/playlist\/([^/]+)\/([^/]+)$/)
  if (match) return { type: 'playlist', kind: match[1], categoryId: match[2] }
  match = value.match(/^alqasim:\/\/content\/([^/]+)\/(\d+)$/)
  if (match) return { type: 'content', kind: match[1], id: match[2] }
  return null
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

class AlQasimKindPager extends VideoPager {
  constructor(kind, page = 1) {
    const data = fetchList(kind, page)
    super(
      postsFrom(data)
        .map((post) => postToContent(post, kind))
        .filter(Boolean),
      page < (data.pagination?.total_pages || 1),
      { kind, page }
    )
  }

  nextPage() {
    return apply_pager_state(this, new AlQasimKindPager(this.context.kind, this.context.page + 1))
  }
}

class AlQasimCategoryPager extends VideoPager {
  constructor(kind, categoryId, page = 1) {
    const data = fetchCategory(kind, categoryId, page)
    super(
      postsFrom(data)
        .map((post) => postToContent(post, kind))
        .filter(Boolean),
      page < (data.pagination?.total_pages || 1),
      { kind, categoryId, page }
    )
  }

  nextPage() {
    return apply_pager_state(this, new AlQasimCategoryPager(this.context.kind, this.context.categoryId, this.context.page + 1))
  }
}

class AlQasimSearchPager extends VideoPager {
  constructor(query, page = 1, kinds = KINDS.map((kind) => kind.id)) {
    const data = fetchJson(
      `${API_URL}/search?${query_string([
        ['q', query],
        ['page', page],
        ['per_page', DEFAULT_LIMIT]
      ])}`
    )
    const items = postsFrom(data)
      .map((post) => postToContent(post))
      .filter((item) => item && kinds.some((kind) => item.url.includes(`/${kind}/`)))
    super(dedupe_by_url(items), page < (data.pagination?.total_pages || 1), { query, page, kinds })
  }

  nextPage() {
    return apply_pager_state(this, new AlQasimSearchPager(this.context.query, this.context.page + 1, this.context.kinds))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + staticThumbnails().sources.length)
