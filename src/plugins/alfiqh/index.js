import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { dedupe_by_url } from '@lib/collections.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { cache_get, cache_set, get_json, init_lru_caches, query_string } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'AlFiqh'
const BASE_URL = 'https://alfiqh.net'
const API_URL = `${BASE_URL}/wp-json/wp/v2`
const DEFAULT_ICON = `${BASE_URL}/wp-content/uploads/2020/04/cropped-alfiqh.net_-1.jpg`
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { jsonCache: 160 }

Type.Order.Chronological_Reverse = 'Chronological Reverse'

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
  return new AlFiqhPostPager(1)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological, Type.Order.Chronological_Reverse],
  filters: [speakerFilter(), topicFilter()]
})

source.searchSuggestions = function (query) {
  const terms = [
    ...categories()
      .slice(0, 6)
      .map((item) => item.name),
    ...tags()
      .slice(0, 6)
      .map((item) => item.name)
  ]
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, order, filters) {
  return new AlFiqhPostPager(1, {
    search: query,
    category: selectedSpeaker(filters),
    tag: selectedTopic(filters),
    order: order === Type.Order.Chronological_Reverse ? 'asc' : 'desc'
  })
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return (
    parsed?.type === 'root' ||
    parsed?.type === 'category' ||
    parsed?.type === 'tag' ||
    normalized === BASE_URL ||
    Boolean(categoryFromPublicUrl(normalized)) ||
    Boolean(tagFromPublicUrl(normalized))
  )
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'category') return categoryChannel(categoryById(parsed.id))
  if (parsed?.type === 'tag') return tagChannel(tagById(parsed.id))

  const category = categoryFromPublicUrl(normalizePublicUrl(url))
  if (category) return categoryChannel(category)
  const tag = tagFromPublicUrl(normalizePublicUrl(url))
  if (tag) return tagChannel(tag)

  return grayjay.channel('root', {
    name: 'موقع الفقه في الدين',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'دروس علمية وفتاوى شرعية لطلبة العلم.',
    url: 'alfiqh://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'category') return new AlFiqhPostPager(1, { category: parsed.id })
  if (parsed?.type === 'tag') return new AlFiqhPostPager(1, { tag: parsed.id })
  return source.getHome()
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (url, query, _type, order, _filters) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'category')
    return new AlFiqhPostPager(1, {
      search: query,
      category: parsed.id,
      order: order === Type.Order.Chronological_Reverse ? 'asc' : 'desc'
    })
  if (parsed?.type === 'tag')
    return new AlFiqhPostPager(1, { search: query, tag: parsed.id, order: order === Type.Order.Chronological_Reverse ? 'asc' : 'desc' })
  return source.search(query, null, order, null)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [source.getChannel('alfiqh://root'), ...categories().map(categoryChannel), ...tags().slice(0, 24).map(tagChannel)]
  return new ArrayChannelPager(
    channels.filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.isPlaylistUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'playlist' || isPublicPostUrl(normalized)
}

source.searchPlaylists = function (query, _type, order, filters) {
  return new AlFiqhPlaylistPager(1, {
    search: query,
    category: selectedSpeaker(filters),
    tag: selectedTopic(filters),
    order: order === Type.Order.Chronological_Reverse ? 'asc' : 'desc'
  })
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  const post = parsed?.type === 'playlist' ? fetchPost(parsed.id) : fetchPostBySlug(slugFromPublicUrl(normalizePublicUrl(url)))
  return postToPlaylistDetails(post)
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'category') return new AlFiqhPlaylistPager(1, { category: parsed.id })
  if (parsed?.type === 'tag') return new AlFiqhPlaylistPager(1, { tag: parsed.id })
  return new AlFiqhPlaylistPager(1)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return parsed?.type === 'track' || /^https:\/\/archive\.org\/download\/.*\.mp3(?:$|\?)/i.test(normalized)
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'track') return trackToDetails(fetchPost(parsed.postId), Number(parsed.index))
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

function fetchPosts(page = 1, options = {}) {
  return fetchJson(
    `${API_URL}/posts?${query_string([
      ['per_page', DEFAULT_LIMIT],
      ['page', page],
      ['_embed', 1],
      ['search', options.search || null],
      ['categories', options.category || null],
      ['tags', options.tag || null],
      ['orderby', 'date'],
      ['order', options.order || 'desc']
    ])}`
  )
}

function fetchPost(id) {
  return fetchJson(`${API_URL}/posts/${id}`)
}

function fetchPostBySlug(slug) {
  const posts = fetchJson(
    `${API_URL}/posts?${query_string([
      ['slug', slug],
      ['per_page', 1]
    ])}`
  )
  if (!posts?.[0]) throw new ScriptException(`${PLATFORM} post not found`)
  return posts[0]
}

function categories() {
  return fetchJson(`${API_URL}/categories?per_page=100&orderby=count&order=desc`)
}

function tags() {
  return fetchJson(`${API_URL}/tags?per_page=100&orderby=count&order=desc`)
}

function postToFirstTrack(post) {
  const tracks = tracksFromPost(post)
  return tracks[0] ? trackToFeed(post, tracks[0], 0) : null
}

function postToPlaylist(post) {
  return grayjay.playlist(`post-${post.id}`, {
    name: postTitle(post),
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: authorForPost(post),
    datetime: parseDate(post.date),
    url: playlistUrl(post.id),
    videoCount: tracksFromPost(post).length
  })
}

function postToPlaylistDetails(post) {
  const tracks = tracksFromPost(post)
  return grayjay.playlist_details(`post-${post.id}`, {
    name: postTitle(post),
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: authorForPost(post),
    datetime: parseDate(post.date),
    url: playlistUrl(post.id),
    videoCount: tracks.length,
    contents: new ArrayVideoPager(
      tracks.map((track, index) => trackToFeed(post, track, index)),
      DEFAULT_LIMIT
    )
  })
}

function trackToFeed(post, track, index) {
  return grayjay.feed_video(`track-${post.id}-${index}`, {
    name: track.title || postTitle(post),
    thumbnails: staticThumbnails(),
    author: authorForPost(post),
    uploadDate: parseDate(post.date),
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: trackUrl(post.id, index),
    description: postTitle(post),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: track.url,
      language: 'ar'
    }),
    shareUrl: normalizePublicUrl(post.link)
  })
}

function trackToDetails(post, index) {
  const tracks = tracksFromPost(post)
  const track = tracks[index]
  if (!track) throw new ScriptException(`${PLATFORM} track not found`)
  return grayjay.video(`track-${post.id}-${index}`, {
    name: track.title || postTitle(post),
    thumbnails: staticThumbnails(),
    author: authorForPost(post),
    uploadDate: parseDate(post.date),
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: trackUrl(post.id, index),
    description: clean_text(post.content?.rendered || postTitle(post)).slice(0, 2000),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: track.url,
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: normalizePublicUrl(post.link),
    getContentRecommendations: () =>
      new ArrayVideoPager(
        tracks.map((item, itemIndex) => trackToFeed(post, item, itemIndex)).filter((_, itemIndex) => itemIndex !== index),
        DEFAULT_LIMIT
      )
  })
}

function directMp3ToDetails(url) {
  return grayjay.video(`mp3-${normalize_search_text(url).slice(-64)}`, {
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

function tracksFromPost(post) {
  const tracks = []
  const html = decode_html(post.content?.rendered || '')
  const regex = /<a\b[^>]*href=["']([^"']+\.mp3(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html)) !== null) tracks.push({ url: encodeUrl(match[1]), title: clean_text(match[2]) })
  return dedupe_by_url(tracks)
}

function postTitle(post) {
  return clean_text(post?.title?.rendered || post?.title || PLATFORM)
}

function authorForPost(post) {
  const category = categoryById(post.categories?.[0])
  return category ? grayjay.author(`category-${category.id}`, category.name, category.link || BASE_URL, iconUrl()) : rootAuthor()
}

function rootAuthor() {
  return grayjay.author('alfiqh', 'موقع الفقه في الدين', BASE_URL, iconUrl())
}

function categoryChannel(category) {
  return grayjay.channel(`category-${category.id}`, {
    name: category.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${category.name} - ${category.count} سلسلة`,
    url: categoryUrl(category.id),
    urlAlternatives: [normalizePublicUrl(category.link)]
  })
}

function tagChannel(tag) {
  return grayjay.channel(`tag-${tag.id}`, {
    name: tag.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${tag.name} - ${tag.count} سلسلة`,
    url: tagUrl(tag.id),
    urlAlternatives: [normalizePublicUrl(tag.link)]
  })
}

function speakerFilter() {
  return {
    id: 'speaker',
    name: 'الشيخ',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'كل الشيوخ', value: 'all' },
      ...categories()
        .slice(0, 60)
        .map((category) => ({ id: String(category.id), name: category.name, value: String(category.id) }))
    ]
  }
}

function topicFilter() {
  return {
    id: 'topic',
    name: 'الموضوع',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'كل المواضيع', value: 'all' },
      ...tags()
        .slice(0, 60)
        .map((tag) => ({ id: String(tag.id), name: tag.name, value: String(tag.id) }))
    ]
  }
}

function selectedSpeaker(filters) {
  const value = selected_filter_values(filters, 'speaker')[0]
  return value && value !== 'all' ? value : null
}

function selectedTopic(filters) {
  const value = selected_filter_values(filters, 'topic')[0]
  return value && value !== 'all' ? value : null
}

function categoryById(id) {
  return categories().find((category) => String(category.id) === String(id))
}

function tagById(id) {
  return tags().find((tag) => String(tag.id) === String(id))
}

function categoryFromPublicUrl(url) {
  return categories().find((category) => normalizePublicUrl(category.link) === url)
}

function tagFromPublicUrl(url) {
  return tags().find((tag) => normalizePublicUrl(tag.link) === url)
}

function normalizePublicUrl(url) {
  return decode_html(String(url ?? '').trim())
    .replace(/^http:\/\//i, 'https://')
    .replace(/^https:\/\/www\.alfiqh\.net/i, BASE_URL)
}

function encodeUrl(url) {
  try {
    return encodeURI(decodeURI(url))
  } catch (_e) {
    return encodeURI(url)
  }
}

function parseDate(value) {
  const raw = String(value ?? '')
  return raw ? Math.floor(new Date(`${raw.endsWith('Z') ? raw : `${raw}Z`}`).getTime() / 1000) || 0 : 0
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

function isPublicPostUrl(url) {
  return /^https:\/\/alfiqh\.net\/[^/?#]+\/?$/i.test(url) && !url.includes('/category/') && !url.includes('/tag/')
}

function slugFromPublicUrl(url) {
  return String(url ?? '')
    .replace(/^https:\/\/alfiqh\.net\//i, '')
    .replace(/\/.*$/, '')
}

function categoryUrl(id) {
  return `alfiqh://category/${id}`
}

function tagUrl(id) {
  return `alfiqh://tag/${id}`
}

function playlistUrl(id) {
  return `alfiqh://playlist/post/${id}`
}

function trackUrl(postId, index) {
  return `alfiqh://track/${postId}/${index}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'alfiqh://root') return { type: 'root' }
  let match = value.match(/^alfiqh:\/\/category\/(\d+)$/)
  if (match) return { type: 'category', id: match[1] }
  match = value.match(/^alfiqh:\/\/tag\/(\d+)$/)
  if (match) return { type: 'tag', id: match[1] }
  match = value.match(/^alfiqh:\/\/playlist\/post\/(\d+)$/)
  if (match) return { type: 'playlist', id: match[1] }
  match = value.match(/^alfiqh:\/\/track\/(\d+)\/(\d+)$/)
  if (match) return { type: 'track', postId: match[1], index: match[2] }
  return null
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

class AlFiqhPostPager extends VideoPager {
  constructor(page = 1, options = {}) {
    const posts = fetchPosts(page, options)
    super(posts.map(postToFirstTrack).filter(Boolean), posts.length === DEFAULT_LIMIT, { page, options })
  }

  nextPage() {
    return apply_pager_state(this, new AlFiqhPostPager(this.context.page + 1, this.context.options))
  }
}

class AlFiqhPlaylistPager extends PlaylistPager {
  constructor(page = 1, options = {}) {
    const posts = fetchPosts(page, options).filter((post) => tracksFromPost(post).length)
    super(posts.map(postToPlaylist), posts.length === DEFAULT_LIMIT, { page, options })
  }

  nextPage() {
    return apply_pager_state(this, new AlFiqhPlaylistPager(this.context.page + 1, this.context.options))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)

log('LOADED ' + PLATFORM + ' ' + staticThumbnails().sources.length)
