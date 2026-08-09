import { content_thumbnails, plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { selected_filter_values } from '@lib/filters.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { cache_get, cache_set, get_json, init_lru_caches, query_string } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'Sunnah Wadeha'
const BASE_URL = 'https://sunnahwadeha.com'
const API_URL = `${BASE_URL}/api`
const DEFAULT_ICON = `${BASE_URL}/icons/favicon-32.png`
const DEFAULT_LIMIT = 20
const CACHE_LIMITS = { jsonCache: 160 }

let _config = {}
let _state = {}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, _settings, savedState) {
  _config = conf ?? {}
  _state = parseState(savedState)
  init_lru_caches(_state, CACHE_LIMITS)
}

source.saveState = () => '{}'

source.getHome = function () {
  return new SunnahWadehaLessonPager(1, '', null, true)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [contentFilter()]
})

source.searchSuggestions = function (query) {
  const terms = ['الحديث', 'العقيدة', 'الفقه', 'السيرة', 'التفسير', 'التوحيد']
  const needle = normalize_search_text(query)
  return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6)
}

source.search = function (query, _type, _order, filters) {
  const content = selectedContent(filters)
  if (content === 'live') {
    const live = safeLiveItem()
    return new ArrayVideoPager(live && itemMatches(live, query) ? [live] : [], DEFAULT_LIMIT)
  }
  return new SunnahWadehaLessonPager(1, query, null, content === 'all')
}

source.isChannelUrl = function (url) {
  return /^sunnahwadeha:\/\/root$/.test(String(url ?? '')) || /^https?:\/\/(?:www\.)?sunnahwadeha\.com\/?$/.test(String(url ?? ''))
}

source.getChannel = function (_url) {
  return rootChannel()
}

source.getChannelContents = function (_url, type, order, filters) {
  return source.search('', type, order, filters)
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Latest']

source.peekChannelContents = function (url, _type) {
  return source.getChannelContents(url).results.slice(0, 6)
}

source.searchChannelContents = function (_url, query, type, order, filters) {
  return source.search(query, type, order, filters)
}

source.searchChannels = function (query) {
  const channel = rootChannel()
  return new ArrayChannelPager(itemMatches(channel, query) ? [channel] : [], DEFAULT_LIMIT)
}

source.isPlaylistUrl = function (url) {
  return Boolean(seriesId(url))
}

source.searchPlaylists = function (query, _type, _order, _filters) {
  return new SunnahWadehaSeriesPager(1, query)
}

source.getPlaylist = function (url) {
  const id = seriesId(url)
  if (!id) throw new ScriptException(`${PLATFORM} series id missing`)
  return seriesToPlaylistDetails(fetchJson(`${API_URL}/series/${id}?depth=1`))
}

source.getChannelPlaylists = function (_url) {
  return new SunnahWadehaSeriesPager(1)
}

source.isContentDetailsUrl = function (url) {
  return Boolean(lessonId(url)) || isLiveUrl(url)
}

source.getContentDetails = function (url) {
  if (isLiveUrl(url)) {
    const live = liveItem(fetchLive())
    if (!live) throw new ScriptException(`${PLATFORM} has no active live broadcast`)
    return live
  }

  const id = lessonId(url)
  if (!id) throw new ScriptException(`${PLATFORM} lesson id missing`)
  return lessonToDetails(fetchJson(`${API_URL}/lessons/${id}?depth=2`))
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

function fetchLive() {
  return get_json(`${API_URL}/live/now`, { Accept: 'application/json' })
}

function safeLiveItem() {
  try {
    return liveItem(fetchLive())
  } catch (_e) {
    return null
  }
}

function fetchLessons(page, query = '', series = null) {
  return fetchJson(
    `${API_URL}/lessons?${query_string([
      ['depth', 1],
      ['limit', DEFAULT_LIMIT],
      ['page', page],
      ['sort', '-createdAt'],
      ['where[title][contains]', query || null],
      ['where[series][equals]', series]
    ])}`
  )
}

function fetchSeries(page, query = '') {
  return fetchJson(
    `${API_URL}/series?${query_string([
      ['depth', 1],
      ['limit', DEFAULT_LIMIT],
      ['page', page],
      ['sort', '-updatedAt'],
      ['where[title][contains]', query || null],
      ['where[scope][equals]', 'public']
    ])}`
  )
}

function lessonToFeed(item) {
  const media = item?.audioFile
  if (!item?.id || !media?.url) return null
  return grayjay.feed_video(`lesson-${item.id}`, {
    name: clean_text(item.title),
    thumbnails: lessonThumbnails(item),
    author: rootAuthor(),
    uploadDate: parseDate(item.createdAt),
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: lessonUrl(item.id),
    description: lessonDescription(item),
    video: lessonSource(media),
    shareUrl: publicSeriesUrl(relationId(item.series))
  })
}

function lessonToDetails(item) {
  const details = lessonToFeed(item)
  if (!details) throw new ScriptException(`${PLATFORM} lesson has no playable audio`)

  const result = grayjay.video(`lesson-${item.id}`, {
    name: details.name,
    thumbnails: lessonThumbnails(item),
    author: rootAuthor(),
    uploadDate: parseDate(item.createdAt),
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: lessonUrl(item.id),
    description: lessonDescription(item),
    video: lessonSource(item.audioFile),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: publicSeriesUrl(relationId(item.series))
  })

  const series = relationId(item.series)
  result.getContentRecommendations = function () {
    return series ? new SunnahWadehaLessonPager(1, '', series, false, item.id) : new ArrayVideoPager([], DEFAULT_LIMIT)
  }
  return result
}

function lessonSource(media) {
  return audio_source_descriptor({
    name: 'Ogg Opus Audio',
    container: media.mimeType || 'audio/ogg',
    codec: 'opus',
    duration: 0,
    url: media.url,
    language: 'ar'
  })
}

function liveItem(item) {
  if (!item?.live || !item.cfIframeUrl) return null
  const nested = grayjay.nested(`live-${item.id}`, {
    name: clean_text(item.title || 'البث المباشر'),
    author: rootAuthor(),
    datetime: parseDate(item.startedAt),
    url: 'sunnahwadeha://live',
    contentUrl: item.cfIframeUrl,
    contentName: clean_text(item.title || 'البث المباشر'),
    contentDescription: clean_text(item.description || 'البث المباشر لموقع السنة واضحة'),
    contentProvider: 'Cloudflare Stream',
    contentThumbnails: static_thumbnails(_config, DEFAULT_ICON)
  })
  nested.getContentRecommendations = () => new SunnahWadehaLessonPager(1)
  return nested
}

function seriesToPlaylist(item) {
  return grayjay.playlist(`series-${item.id}`, {
    name: clean_text(item.title),
    thumbnails: seriesThumbnails(item),
    thumbnail: imageUrl(item.coverImage) || iconUrl(),
    author: rootAuthor(),
    datetime: parseDate(item.createdAt),
    url: seriesUrl(item.id),
    videoCount: 0
  })
}

function seriesToPlaylistDetails(item) {
  if (!item?.id) throw new ScriptException(`${PLATFORM} series not found`)
  const contents = new SunnahWadehaLessonPager(1, '', item.id)
  return grayjay.playlist_details(`series-${item.id}`, {
    name: clean_text(item.title),
    thumbnails: seriesThumbnails(item),
    thumbnail: imageUrl(item.coverImage) || iconUrl(),
    author: rootAuthor(),
    datetime: parseDate(item.createdAt),
    url: seriesUrl(item.id),
    videoCount: contents.context.totalDocs,
    contents
  })
}

function rootChannel() {
  return grayjay.channel('root', {
    name: 'السنة واضحة',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'دروس صوتية وشروح كتب وبث مباشر.',
    url: 'sunnahwadeha://root',
    urlAlternatives: [BASE_URL]
  })
}

function rootAuthor() {
  return grayjay.author('root', 'السنة واضحة', 'sunnahwadeha://root', iconUrl())
}

function lessonDescription(item) {
  const series = typeof item.series === 'object' ? clean_text(item.series.title) : ''
  const category = categoryName(item.category) || categoryName(item.series?.category)
  return [clean_text(typeof item.description === 'string' ? item.description : ''), series, category].filter(Boolean).join('\n')
}

function lessonThumbnails(item) {
  const image = imageUrl(item.coverImage) || imageUrl(item.series?.coverImage)
  return image ? content_thumbnails(_config, DEFAULT_ICON, image) : static_thumbnails(_config, DEFAULT_ICON)
}

function seriesThumbnails(item) {
  const image = imageUrl(item.coverImage) || imageUrl(item.explainedBook?.coverImage)
  return image ? content_thumbnails(_config, DEFAULT_ICON, image) : static_thumbnails(_config, DEFAULT_ICON)
}

function imageUrl(image) {
  return typeof image === 'object' ? image.sizes?.thumbnail?.url || image.sizes?.card?.url || image.url : ''
}

function categoryName(category) {
  return typeof category === 'object' ? clean_text(category.name) : ''
}

function relationId(value) {
  return typeof value === 'object' ? value.id : value
}

function lessonId(url) {
  const value = String(url ?? '')
  return (
    value.match(/^sunnahwadeha:\/\/lesson\/(\d+)$/)?.[1] ||
    value.match(/^https?:\/\/(?:www\.)?sunnahwadeha\.com\/api\/lessons\/(\d+)(?:[?#].*)?$/)?.[1]
  )
}

function seriesId(url) {
  const value = String(url ?? '')
  return (
    value.match(/^sunnahwadeha:\/\/series\/(\d+)$/)?.[1] ||
    value.match(/^https?:\/\/(?:www\.)?sunnahwadeha\.com\/series\/(\d+)\/?(?:[?#].*)?$/)?.[1]
  )
}

function isLiveUrl(url) {
  return /^sunnahwadeha:\/\/live$/.test(String(url ?? '')) || /^https?:\/\/(?:www\.)?sunnahwadeha\.com\/?#live$/.test(String(url ?? ''))
}

function lessonUrl(id) {
  return `sunnahwadeha://lesson/${id}`
}

function seriesUrl(id) {
  return `sunnahwadeha://series/${id}`
}

function publicSeriesUrl(id) {
  return id ? `${BASE_URL}/series/${id}` : BASE_URL
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function parseDate(value) {
  return Math.floor(Date.parse(value || '') / 1000) || 0
}

function itemMatches(item, query) {
  const needle = normalize_search_text(query)
  return (
    !needle || normalize_search_text(`${item.name || item.contentName} ${item.description || item.contentDescription}`).includes(needle)
  )
}

function contentFilter() {
  return {
    id: 'content',
    name: 'المحتوى',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'الدروس والبث المباشر', value: 'all' },
      { id: 'audio', name: 'الدروس الصوتية', value: 'audio' },
      { id: 'live', name: 'البث المباشر', value: 'live' }
    ]
  }
}

function selectedContent(filters) {
  const value = selected_filter_values(filters, 'content')[0]
  return value === 'audio' || value === 'live' ? value : 'all'
}

class SunnahWadehaLessonPager extends VideoPager {
  constructor(page = 1, query = '', series = null, includeLive = false, excludeId = null) {
    const data = fetchLessons(page, query, series)
    const items = (data.docs ?? [])
      .filter((item) => String(item.id) !== String(excludeId ?? ''))
      .map(lessonToFeed)
      .filter(Boolean)
    const live = page === 1 && includeLive ? safeLiveItem() : null
    super(live && itemMatches(live, query) ? [live, ...items] : items, Boolean(data.hasNextPage), {
      page,
      query,
      series,
      includeLive,
      excludeId,
      totalDocs: Number(data.totalDocs || 0)
    })
  }

  nextPage() {
    return apply_pager_state(
      this,
      new SunnahWadehaLessonPager(
        this.context.page + 1,
        this.context.query,
        this.context.series,
        this.context.includeLive,
        this.context.excludeId
      )
    )
  }
}

class SunnahWadehaSeriesPager extends PlaylistPager {
  constructor(page = 1, query = '') {
    const data = fetchSeries(page, query)
    super((data.docs ?? []).map(seriesToPlaylist), Boolean(data.hasNextPage), { page, query })
  }

  nextPage() {
    return apply_pager_state(this, new SunnahWadehaSeriesPager(this.context.page + 1, this.context.query))
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)

log(`LOADED ${PLATFORM} ${static_thumbnails(_config, DEFAULT_ICON).sources.length}`)
