import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, init_lru_caches, cache_get, cache_set } from '@lib/http.js'
import { audio_source_descriptor, thumbnails } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'Jeman'
const BASE_URL = 'https://j-eman.net'
const API_URL = 'https://apis.j-eman.net'
const DEFAULT_ICON = `${BASE_URL}/favicon.ico`
const DEFAULT_LIMIT = 20
const CATEGORY_LIMIT = 500
const CACHE_LIMITS = { jsonCache: 80 }

const AUDIO_TABS = [
  { id: 'lessons', name: 'الدروس' },
  { id: 'simplifyscience', name: 'تقريب العلم' },
  { id: 'lectures', name: 'الخطب المنبرية' },
  { id: 'programsquestions', name: 'سؤالات البرامج' },
  { id: 'occasionsdoctrine', name: 'فقه المناسبات' },
  { id: 'words', name: 'الكلمات والمواعظ' },
  { id: 'sciencelectures', name: 'المحاضرات العلمية' },
  { id: 'scientificmeetings', name: 'اللقاءات العلمية' }
]

const VIDEO_TABS = [
  { id: 'lessonsbenefits', name: 'فوائد الدروس' },
  { id: 'visuallessons', name: 'دروس مرئية' },
  { id: 'translatedclips', name: 'مقاطع مترجمة' }
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
      ...fetchList('pgsounds', 'sciencelectures', 1).data.slice(0, 10).map(audioToDetails),
      ...fetchList('pgclips', 'visuallessons', 1).data.slice(0, 10).map(apiItemToContent)
    ].filter(Boolean),
    DEFAULT_LIMIT
  )
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [kindFilter(), tabFilter()]
})

source.searchSuggestions = function (query) {
  const terms = ['العلم', 'التوحيد', 'الصيام', 'الحج', 'الدروس', 'الخطب', 'فوائد الدروس']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, filters) {
  const needle = normalize_search_text(query)
  const kind = selectedKind(filters)
  const tabs = selectedTabs(filters, kind)

  if (!needle) {
    const items = []
    for (const tab of tabs.slice(0, 3)) items.push(...fetchTabPage(tab, 1).map(apiItemToContent))
    return new ArrayVideoPager(items.filter(Boolean), DEFAULT_LIMIT)
  }

  const selected = selected_filter_values(filters, 'tab')
  if (kind === 'video' || selected.length) return new JemanTabSearchPager(query, kind, selected)
  return new JemanSearchPager(query, kind)
}

source.isChannelUrl = function (url) {
  const parsed = parseInternalUrl(url)
  return parsed?.type === 'root' || parsed?.type === 'tab' || parsed?.type === 'category' || normalizePublicUrl(url) === BASE_URL
}

source.getChannel = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'tab') return tabChannel(tabByKind(parsed.kind, parsed.tab), parsed.kind)
  if (parsed?.type === 'category') return categoryChannel(categoryById(parsed.kind, parsed.tab, parsed.categoryId), parsed.kind, parsed.tab)

  return grayjay.channel('root', {
    name: 'Jeman',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'برامج الدعوة والإرشاد لفضيلة الشيخ صالح العصيمي.',
    url: 'jeman://root',
    urlAlternatives: [BASE_URL]
  })
}

source.getChannelContents = function (url, _type, _order, _filters) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'tab') return new JemanPager(parsed.kind, parsed.tab)
  if (parsed?.type === 'category') return new JemanPager(parsed.kind, parsed.tab, parsed.categoryId)
  return source.getHome()
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
  if (parsed?.type === 'tab' || parsed?.type === 'category') {
    return new ArrayVideoPager(
      fetchChannelPage(parsed, 1)
        .filter((item) => !needle || normalize_search_text(`${item.title} ${categoryTitle(item)}`).includes(needle))
        .map(apiItemToContent),
      DEFAULT_LIMIT
    )
  }
  return source.search(query, null, null, null)
}

source.searchChannels = function (query) {
  const needle = normalize_search_text(query)
  const channels = [
    source.getChannel('jeman://root'),
    ...AUDIO_TABS.map((tab) => tabChannel(tab, 'audio')),
    ...VIDEO_TABS.map((tab) => tabChannel(tab, 'video')),
    ...AUDIO_TABS.flatMap((tab) =>
      categories('audio', tab.id)
        .slice(0, 12)
        .map((category) => categoryChannel(category, 'audio', tab.id))
    ),
    ...VIDEO_TABS.flatMap((tab) =>
      categories('video', tab.id)
        .slice(0, 12)
        .map((category) => categoryChannel(category, 'video', tab.id))
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
  const kind = selectedKind(filters)
  const tabs = selectedTabs(filters, kind)
  const playlists = tabs.flatMap((tab) =>
    playableCategories(tab.kind, tab.id).map((category) => categoryToPlaylist(category, tab.kind, tab.id))
  )
  return new ArrayPlaylistPager(
    playlists.filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)),
    DEFAULT_LIMIT
  )
}

source.getPlaylist = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type !== 'playlist') throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`)
  const category = categoryById(parsed.kind, parsed.tab, parsed.categoryId)
  return grayjay.playlist_details(`playlist-${parsed.kind}-${parsed.tab}-${parsed.categoryId}`, {
    name: category.title,
    thumbnails: imageThumbnails(category.image_url),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: parseDate(category.publish_date),
    url,
    videoCount: 0,
    contents: new JemanPager(parsed.kind, parsed.tab, parsed.categoryId)
  })
}

source.getChannelPlaylists = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'tab') {
    return new ArrayPlaylistPager(
      playableCategories(parsed.kind, parsed.tab).map((category) => categoryToPlaylist(category, parsed.kind, parsed.tab)),
      DEFAULT_LIMIT
    )
  }
  if (parsed?.type === 'category') {
    return new ArrayPlaylistPager(
      [categoryToPlaylist(categoryById(parsed.kind, parsed.tab, parsed.categoryId), parsed.kind, parsed.tab)],
      DEFAULT_LIMIT
    )
  }
  return source.searchPlaylists('', null, null, null)
}

source.isContentDetailsUrl = function (url) {
  const parsed = parseInternalUrl(url)
  const normalized = normalizePublicUrl(url)
  return (
    parsed?.type === 'audio' ||
    parsed?.type === 'video' ||
    /^https:\/\/apis\.j-eman\.net\/storage\/.*\.mp3/i.test(normalized) ||
    /^https:\/\/j-eman\.net\/video\/[^/]+\/show\/[^/]+/i.test(normalized) ||
    /^https:\/\/www\.youtube\.com\/watch\?v=/i.test(normalized)
  )
}

source.getContentDetails = function (url) {
  const parsed = parseInternalUrl(url)
  if (parsed?.type === 'audio') return audioToDetails(fetchDetail('pgsounds', parsed.tab, parsed.id))
  if (parsed?.type === 'video') return clipToNested(fetchDetail('pgclips', parsed.tab, parsed.id))

  const normalized = normalizePublicUrl(url)
  if (/^https:\/\/apis\.j-eman\.net\/storage\/.*\.mp3/i.test(normalized)) return directMp3ToDetails(normalized)
  const publicVideo = normalized.match(/^https:\/\/j-eman\.net\/video\/([^/]+)\/show\/([^/]+)/i)
  if (publicVideo) return clipToNested(fetchDetail('pgclips', publicVideo[1], publicVideo[2]))
  const youtubeId = normalized.match(/[?&]v=([^&]+)/)?.[1]
  if (youtubeId) return youtubeToNested(youtubeId)
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
  return cache_set(_state, CACHE_LIMITS, 'jsonCache', url, get_json(url))
}

function fetchList(endpoint, tab, page = 1, categoryId = null) {
  const path = categoryId ? `${endpoint}/${tab}/bycategory/${categoryId}/0/${DEFAULT_LIMIT}` : `${endpoint}/${tab}/0/${DEFAULT_LIMIT}`
  return fetchJson(`${API_URL}/${path}?page=${page}`)
}

function fetchTabPage(tab, page) {
  return fetchList(tab.kind === 'video' ? 'pgclips' : 'pgsounds', tab.id, page).data ?? []
}

function fetchChannelPage(parsed, page) {
  const endpoint = parsed.kind === 'video' ? 'pgclips' : 'pgsounds'
  return fetchList(endpoint, parsed.tab, page, parsed.categoryId).data ?? []
}

function fetchDetail(endpoint, tab, id) {
  return fetchJson(`${API_URL}/${endpoint}/${tab}/show/${id}`).data
}

function fetchSearch(query, page = 1) {
  return fetchJson(`${API_URL}/globalsearch/${encodeURIComponent(query)}/0/${DEFAULT_LIMIT}?page=${page}`)
}

function categories(kind, tab) {
  const endpoint = kind === 'video' ? 'pgclipcategories' : 'pgsoundcategories'
  return flattenCategories(fetchJson(`${API_URL}/${endpoint}/${tab}/parentCategory/0/${CATEGORY_LIMIT}`).data ?? [])
}

function playableCategories(kind, tab) {
  return categories(kind, tab).filter((category) => !category.children?.length)
}

function flattenCategories(items) {
  const result = []
  for (const item of items) {
    result.push(item)
    result.push(...flattenCategories(item.children ?? []))
  }
  return result
}

function audioToDetails(item) {
  const audioUrl = storageUrl(item.file_url || item.sound_url)
  if (!audioUrl) throw new ScriptException('No playable Jeman MP3 found')

  const details = grayjay.video(`audio-${item.type}-${item.id}`, {
    name: item.title,
    thumbnails: imageThumbnails(item.image_url),
    author: rootAuthor(),
    uploadDate: parseDate(item.publish_date),
    duration: 0,
    viewCount: Number(item.views || 0),
    isLive: false,
    url: audioUrlInternal(item.type, item.id),
    description: clean_text(item.description || item.content || ''),
    video: audio_source_descriptor({
      name: 'MP3 Audio',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: audioUrl,
      language: 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: `${BASE_URL}/sounds/${item.type}/${item.pgsoundcategories_id || 0}/1`
  })

  details.getContentRecommendations = function () {
    if (item.pgsoundcategories_id) return new JemanPager('audio', item.type, item.pgsoundcategories_id)
    return new JemanPager('audio', item.type)
  }

  return details
}

function clipToNested(item) {
  const youtubeId = item.clip_code || String(item.clip_url ?? '').match(/\/embed\/([^"/?]+)/)?.[1]
  if (!youtubeId) throw new ScriptException('No playable Jeman YouTube clip found')
  return grayjay.nested(`video-${item.type}-${item.id}`, {
    name: item.title,
    author: rootAuthor(),
    datetime: parseDate(item.publish_date),
    url: videoUrlInternal(item.type, item.id),
    contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    contentName: item.title,
    contentDescription: clean_text(item.description || item.content || ''),
    contentProvider: 'YouTube',
    contentThumbnails: imageThumbnails(item.image_url || `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`)
  })
}

function apiItemToContent(item) {
  if (item.clip_code || item.clip_url) {
    try {
      return clipToNested(item)
    } catch (_e) {
      return null
    }
  }
  return audioToDetails(item)
}

function searchItemToContent(item, kind) {
  const html = `${item.content ?? ''} ${item.description ?? ''}`
  if (kind !== 'video') {
    const direct = String(item.sound_url || item.file_url || '')
    const match = html.match(/href=["']([^"']+\.mp3(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/i)
    const url = storageUrl(direct && /\.mp3(?:$|\?)/i.test(direct) ? direct : decode_html(match?.[1] || ''))
    if (url) return directMp3ToDetails(url, clean_text(match?.[2] || item.title))
  }

  if (kind !== 'audio') {
    const id = item.clip_code || String(item.clip_url || html).match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([^"'&?/]+)/i)?.[1]
    if (id) return youtubeToNested(id, clean_text(item.title))
  }

  return null
}

function directMp3ToDetails(url, name = '') {
  return grayjay.video(`mp3-${url.split('/').pop()}`, {
    name:
      name ||
      decodeURIComponent(
        url
          .split('/')
          .pop()
          .replace(/\.mp3(?:\?.*)?$/i, '')
      ).replace(/[-_]+/g, ' '),
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

function youtubeToNested(id, name = 'YouTube') {
  return grayjay.nested(`youtube-${id}`, {
    name,
    author: rootAuthor(),
    datetime: 0,
    url: `https://www.youtube.com/watch?v=${id}`,
    contentUrl: `https://www.youtube.com/watch?v=${id}`,
    contentName: name,
    contentDescription: '',
    contentProvider: 'YouTube',
    contentThumbnails: imageThumbnails(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`)
  })
}

function categoryToPlaylist(category, kind, tab) {
  return grayjay.playlist(`playlist-${kind}-${tab}-${category.id}`, {
    name: category.title,
    thumbnails: imageThumbnails(category.image_url),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: parseDate(category.publish_date),
    url: playlistUrlInternal(kind, tab, category.id),
    videoCount: 0
  })
}

function tabChannel(tab, kind) {
  return grayjay.channel(`tab-${kind}-${tab.id}`, {
    name: tab.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `${kind === 'video' ? 'مرئيات' : 'صوتيات'} ${tab.name}`,
    url: tabUrlInternal(kind, tab.id),
    urlAlternatives: [`${BASE_URL}/${kind === 'video' ? 'videos' : 'sounds'}/${tab.id}/0/1`]
  })
}

function categoryChannel(category, kind, tab) {
  return grayjay.channel(`category-${kind}-${tab}-${category.id}`, {
    name: category.title,
    thumbnail: imageUrl(category.image_url) || iconUrl(),
    banner: imageUrl(category.image_url) || iconUrl(),
    description: tabByKind(kind, tab).name,
    url: categoryUrlInternal(kind, tab, category.id),
    urlAlternatives: [`${BASE_URL}/${kind === 'video' ? 'videos' : 'sounds'}/${tab}/${category.id}/1`]
  })
}

function rootAuthor() {
  return grayjay.author('saleh-osaimi', 'الشيخ صالح العصيمي', BASE_URL, iconUrl())
}

function storageUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('http')) return encodeURI(raw)
  if (raw.startsWith('/storage/')) return encodeURI(`${API_URL}${raw}`)
  return encodeURI(`${API_URL}/storage/${raw.replace(/^\/+/, '')}`)
}

function imageUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('http')) return raw
  if (raw.startsWith('/')) return `${API_URL}${raw}`
  return `${API_URL}/${raw}`
}

function imageThumbnails(value) {
  const url = imageUrl(value) || iconUrl()
  return thumbnails(url)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function categoryTitle(item) {
  return item.pgsoundcategories_title || item.pgclipcategories_title || ''
}

function parseDate(value) {
  const date = Date.parse(String(value ?? ''))
  return Number.isFinite(date) ? Math.floor(date / 1000) : 0
}

function normalizePublicUrl(url) {
  return String(url ?? '')
    .trim()
    .replace('http://', 'https://')
}

function tabByKind(kind, id) {
  const tab = (kind === 'video' ? VIDEO_TABS : AUDIO_TABS).find((item) => item.id === id)
  if (!tab) throw new ScriptException(`Unknown ${PLATFORM} tab: ${kind}/${id}`)
  return { ...tab, kind }
}

function categoryById(kind, tab, id) {
  const category = categories(kind, tab).find((item) => item.id === id)
  if (!category) throw new ScriptException(`Unknown ${PLATFORM} category: ${kind}/${tab}/${id}`)
  return category
}

function selectedKind(filters) {
  const value = selected_filter_values(filters, 'kind')[0]
  return value === 'audio' || value === 'video' ? value : 'all'
}

function selectedTabs(filters, kind) {
  const selected = selected_filter_values(filters, 'tab')
  const tabs = [...AUDIO_TABS.map((tab) => ({ ...tab, kind: 'audio' })), ...VIDEO_TABS.map((tab) => ({ ...tab, kind: 'video' }))]
  return tabs.filter((tab) => (kind === 'all' || tab.kind === kind) && (!selected.length || selected.includes(`${tab.kind}:${tab.id}`)))
}

function kindFilter() {
  return {
    id: 'kind',
    name: 'المحتوى',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'الكل', value: 'all' },
      { id: 'audio', name: 'صوتيات', value: 'audio' },
      { id: 'video', name: 'مرئيات', value: 'video' }
    ]
  }
}

function tabFilter() {
  return {
    id: 'tab',
    name: 'القسم',
    isMultiSelect: true,
    filters: [
      ...AUDIO_TABS.map((tab) => ({ id: `audio:${tab.id}`, name: tab.name, value: `audio:${tab.id}` })),
      ...VIDEO_TABS.map((tab) => ({ id: `video:${tab.id}`, name: tab.name, value: `video:${tab.id}` }))
    ]
  }
}

function tabUrlInternal(kind, tab) {
  return `jeman://tab/${kind}/${tab}`
}

function categoryUrlInternal(kind, tab, categoryId) {
  return `jeman://category/${kind}/${tab}/${categoryId}`
}

function playlistUrlInternal(kind, tab, categoryId) {
  return `jeman://playlist/${kind}/${tab}/${categoryId}`
}

function audioUrlInternal(tab, id) {
  return `jeman://audio/${tab}/${id}`
}

function videoUrlInternal(tab, id) {
  return `jeman://video/${tab}/${id}`
}

function parseInternalUrl(url) {
  const value = String(url ?? '')
  if (value === 'jeman://root') return { type: 'root' }
  let match = value.match(/^jeman:\/\/(tab|category|playlist)\/(audio|video)\/([^/]+)(?:\/([^/]+))?$/)
  if (match) return { type: match[1], kind: match[2], tab: match[3], categoryId: match[4] }
  match = value.match(/^jeman:\/\/(audio|video)\/([^/]+)\/([^/]+)$/)
  if (match) return { type: match[1], tab: match[2], id: match[3] }
  return null
}

class JemanPager extends VideoPager {
  constructor(kind, tab, categoryId = null, page = 1) {
    const response = fetchList(kind === 'video' ? 'pgclips' : 'pgsounds', tab, page, categoryId)
    super(
      (response.data ?? []).map(apiItemToContent).filter(Boolean),
      Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page),
      { kind, tab, categoryId, page }
    )
  }

  nextPage() {
    return apply_pager_state(this, new JemanPager(this.context.kind, this.context.tab, this.context.categoryId, this.context.page + 1))
  }
}

class JemanSearchPager extends VideoPager {
  constructor(query, kind = 'all', page = 1) {
    const response = fetchSearch(query, page)
    super(
      (response.data ?? []).map((item) => searchItemToContent(item, kind)).filter(Boolean),
      Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page),
      { query, kind, page }
    )
  }

  nextPage() {
    return apply_pager_state(this, new JemanSearchPager(this.context.query, this.context.kind, this.context.page + 1))
  }
}

class JemanTabSearchPager extends VideoPager {
  constructor(query, kind = 'all', selected = [], page = 1) {
    const needle = normalize_search_text(query)
    const tabs = selectedTabs({ tab: selected }, kind)
    const responses = tabs.map((tab) => ({ tab, response: fetchList(tab.kind === 'video' ? 'pgclips' : 'pgsounds', tab.id, page) }))
    super(
      responses
        .flatMap(({ response }) => response.data ?? [])
        .filter((item) => normalize_search_text(`${item.title} ${categoryTitle(item)}`).includes(needle))
        .map(apiItemToContent)
        .filter(Boolean),
      responses.some(({ response }) => Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page)),
      { query, kind, selected, page }
    )
  }

  nextPage() {
    return apply_pager_state(
      this,
      new JemanTabSearchPager(this.context.query, this.context.kind, this.context.selected, this.context.page + 1)
    )
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`)
