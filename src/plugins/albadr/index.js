import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { extract_first } from '@lib/html.js'
import { cache_set, get_text, init_lru_caches, query_string } from '@lib/http.js'
import { audio_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class } from '@lib/paging.js'
import { clean_text, decode_html, normalize_search_text } from '@lib/text.js'

const PLATFORM = 'AlBadr'
const DISPLAY_NAME = 'البدر'
const BASE_URL = 'https://www.al-badr.net'
const BARE_URL = 'https://al-badr.net'
const DEFAULT_ICON = './AlBadrIcon.png'
const AUTHOR = 'عبد الرزاق البدر'
const DEFAULT_LIMIT = 20
const SEARCH_LIMIT = 12
const CACHE_MAX_AGE_MS = 10 * 60 * 1000
const MIXLR_CHANNEL_URL = 'https://albadrnet.mixlr.com'
const MIXLR_EMBED_URL = 'https://mixlr.com/users/6063850/embed?color=2c2626'
const LIVE_URL = 'albadr://live/mixlr'
const CACHE_LIMITS = {
  pageCache: 80,
  detailCache: 180,
  seriesCache: 120,
  categoryCache: 30
}
const HOME_MODES = {
  LATEST: 0,
  SELECTED: 1,
  LECTURES: 2,
  SERMONS: 3,
  LIVE: 4
}
const CATEGORIES = [
  { id: '9', name: 'العقيدة' },
  { id: '11', name: 'الحديث' },
  { id: '14', name: 'التفسير وعلوم القرآن' },
  { id: '72', name: 'الآداب والأخلاق' },
  { id: '118', name: 'فقه و أصول الفقه' },
  { id: '238', name: 'الأذكار و الأدعية' },
  { id: '240', name: 'السيرة' },
  { id: '274', name: 'دروس باللغة الإندونيسية' }
]
const SPECIAL_SERIES = [
  { id: '220', name: 'المحاضرات', group: 'lectures' },
  { id: '221', name: 'الكلمات', group: 'lectures' },
  { id: '20', name: 'خطب العقيدة', group: 'sermons' },
  { id: '21', name: 'خطب العبادة', group: 'sermons' },
  { id: '22', name: 'خطب مواعظ', group: 'sermons' },
  { id: '23', name: 'خطب متنوعة', group: 'sermons' },
  { id: '229', name: 'خطب الأذكار و الأدعية', group: 'sermons' },
  { id: '230', name: 'خطب الأعياد', group: 'sermons' },
  { id: '231', name: 'خطب الاستسقاء', group: 'sermons' },
  { id: '356', name: 'خطب اليوم الآخر', group: 'sermons' },
  { id: '372', name: 'خطب المناهي', group: 'sermons' }
]
const DEFAULT_HEADERS = {
  'User-Agent': `grayjay.app/${bridge.buildVersion}`,
  Accept: 'text/html,application/xhtml+xml'
}
const REGEX = {
  ROOT: /^https?:\/\/(?:www\.)?al-badr\.net\/?(?:[?#].*)?$/,
  INTERNAL_ROOT: /^albadr:\/\/root$/,
  INTERNAL_CATEGORY: /^albadr:\/\/category\/(\d+)$/,
  INTERNAL_PLAYLIST: /^albadr:\/\/playlist\/sub\/(\d+)$/,
  INTERNAL_CONTENT: /^albadr:\/\/content\/([^/?#]+)$/,
  INTERNAL_MEDIA: /^albadr:\/\/media\/([^/?#]+)$/,
  INTERNAL_LIVE: /^albadr:\/\/live\/mixlr$/,
  WEB_CATEGORY: /^https?:\/\/(?:www\.)?al-badr\.net\/category\/(\d+)\/?(?:[?#].*)?$/,
  WEB_SERIES: /^https?:\/\/(?:www\.)?al-badr\.net\/sub\/(\d+)\/?(?:[?#].*)?$/,
  WEB_DETAIL: /^https?:\/\/(?:www\.)?al-badr\.net\/detail\/([^/?#]+)\/?(?:[?#].*)?$/,
  WEB_MEDIA: /^https?:\/\/(?:www\.)?al-badr\.net\/download\/esound\/([^?#]+\.mp3)(?:[?#].*)?$/,
  WEB_STREAMING: /^https?:\/\/(?:www\.)?al-badr\.net\/streaming\/?(?:[?#].*)?$/
}

let _config = {}
let _settings = {}
let state = {
  pageCache: {},
  detailCache: {},
  seriesCache: {},
  categoryCache: {},
  cacheOrder: {},
  seriesIndex: [],
  seriesById: {}
}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, settings, savedState) {
  _config = conf ?? {}
  _settings = settings ?? {}

  if (savedState) {
    try {
      const saved = JSON.parse(savedState)
      state.seriesIndex = Array.isArray(saved.seriesIndex) ? saved.seriesIndex : []
      state.seriesById = saved.seriesById ?? {}
    } catch (e) {
      logIfTesting('Failed to parse AlBadr state: ' + e)
    }
  }

  state.pageCache ??= {}
  state.detailCache ??= {}
  state.seriesCache ??= {}
  state.categoryCache ??= {}
  state.cacheOrder ??= {}
  state.seriesIndex ??= []
  state.seriesById ??= {}
  init_lru_caches(state, CACHE_LIMITS)
}

source.saveState = function () {
  return JSON.stringify({
    seriesIndex: state.seriesIndex ?? [],
    seriesById: state.seriesById ?? {}
  })
}

source.getHome = function () {
  const mode = Number(_settings.homeMode ?? HOME_MODES.LATEST)
  if (mode === HOME_MODES.LIVE) {
    return new ArrayVideoPager([liveNested()], DEFAULT_LIMIT)
  }
  if (mode === HOME_MODES.SELECTED) {
    return new ArrayVideoPager(homeSelected(), DEFAULT_LIMIT)
  }
  if (mode === HOME_MODES.LECTURES) {
    return new ArrayVideoPager(seriesGroupVideos('lectures'), DEFAULT_LIMIT)
  }
  if (mode === HOME_MODES.SERMONS) {
    return new ArrayVideoPager(seriesGroupVideos('sermons'), DEFAULT_LIMIT)
  }

  return new ArrayVideoPager(homeLatest(), DEFAULT_LIMIT)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: [contentFilter()]
})

source.searchSuggestions = function (query) {
  const q = normalize(query)
  return ['التوحيد', 'الحج', 'الأدب المفرد', 'شرح السنة', 'العقيدة', 'الأذكار', 'الحديث']
    .filter((item) => !q || normalize(item).indexOf(q) >= 0)
    .slice(0, 10)
}

source.search = function (query, _type, _order, filters) {
  const content = selectedContent(filters)
  const q = normalize(query)

  if (content === 'live') {
    const live = liveNested()
    return new ArrayVideoPager(!q || itemMatches(live, query) ? [live] : [], DEFAULT_LIMIT)
  }
  if (!q) {
    return source.getHome()
  }

  return new AlBadrSearchPager(query, 0)
}

source.searchChannels = function (query) {
  const q = normalize(query)
  const channels = [rootChannel(), liveChannel(), ...CATEGORIES.map(categoryToChannel)]
  return new ArrayChannelPager(
    channels.filter((channel) => !q || itemMatches(channel, query)),
    DEFAULT_LIMIT
  )
}

source.isChannelUrl = function (url) {
  return Boolean(
    isRootUrl(url) || categoryIdFromUrl(url) || REGEX.INTERNAL_LIVE.test(String(url ?? '')) || REGEX.WEB_STREAMING.test(String(url ?? ''))
  )
}

source.getChannel = function (url) {
  if (REGEX.INTERNAL_LIVE.test(String(url ?? '')) || REGEX.WEB_STREAMING.test(String(url ?? ''))) {
    return liveChannel()
  }
  if (isRootUrl(url)) {
    return rootChannel()
  }

  const category = CATEGORIES.find((item) => item.id === categoryIdFromUrl(url))
  if (!category) {
    throw new ScriptException('AlBadr category not found')
  }
  return categoryToChannel(category)
}

source.getChannelCapabilities = () => source.getSearchCapabilities()

source.getChannelContents = function (url, _type, _order, filters) {
  const content = selectedContent(filters)
  if (REGEX.INTERNAL_LIVE.test(String(url ?? '')) || REGEX.WEB_STREAMING.test(String(url ?? ''))) {
    return new ArrayVideoPager([liveNested()], DEFAULT_LIMIT)
  }
  if (content === 'live') {
    return new ArrayVideoPager([liveNested()], DEFAULT_LIMIT)
  }
  if (isRootUrl(url)) {
    return source.getHome()
  }

  const category = CATEGORIES.find((item) => item.id === categoryIdFromUrl(url))
  if (!category) {
    throw new ScriptException('AlBadr category not found')
  }
  return new AlBadrCategoryPager(category.id, 0)
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()

source.searchChannelContents = function (url, query, type, order, filters) {
  if (isRootUrl(url)) {
    return source.search(query, type, order, filters)
  }

  const q = normalize(query)
  const pager = source.getChannelContents(url, type, order, filters)
  pager.results = pager.results.filter((item) => !q || itemMatches(item, query))
  pager.hasMore = false
  return pager
}

source.getPeekChannelTypes = () => ['الصوتيات']

source.peekChannelContents = function (url, type) {
  return source.getChannelContents(url, type, null, null).results.slice(0, 6)
}

source.searchPlaylists = function (query, _type, _order, _filters) {
  ensureSeriesIndex()
  const q = normalize(query)
  const playlists = state.seriesIndex.filter((item) => !q || normalize(item.name).indexOf(q) >= 0).map(seriesToPlaylist)
  return new ArrayPlaylistPager(playlists, DEFAULT_LIMIT)
}

source.isPlaylistUrl = function (url) {
  return Boolean(seriesIdFromUrl(url))
}

source.getPlaylist = function (url) {
  const parts = seriesPartsFromUrl(url)
  if (!parts?.id) {
    throw new ScriptException('Unsupported AlBadr playlist URL')
  }

  const loaded = loadSeries(parts.id, parts.offset)
  const metadata = seriesMetadata(parts.id, loaded.title)
  return grayjay.playlist_details(`series-${parts.id}`, {
    name: metadata.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(parts.id),
    videoCount: metadata.count || loaded.total || loaded.items.length,
    contents: new AlBadrSeriesPager(parts.id, parts.offset),
    shareUrl: publicSeriesUrl(parts.id)
  })
}

source.getChannelPlaylists = function (url) {
  if (REGEX.INTERNAL_LIVE.test(String(url ?? '')) || REGEX.WEB_STREAMING.test(String(url ?? ''))) {
    return new ArrayPlaylistPager([], DEFAULT_LIMIT)
  }

  if (isRootUrl(url)) {
    ensureSeriesIndex()
    return new ArrayPlaylistPager(state.seriesIndex.map(seriesToPlaylist), DEFAULT_LIMIT)
  }

  const categoryId = categoryIdFromUrl(url)
  const category = CATEGORIES.find((item) => item.id === categoryId)
  if (!category) {
    throw new ScriptException('AlBadr category not found')
  }
  return new ArrayPlaylistPager(loadCategory(category.id).series.map(seriesToPlaylist), DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (url) {
  return Boolean(
    contentPartsFromUrl(url) ||
    mediaPartsFromUrl(url) ||
    REGEX.INTERNAL_LIVE.test(String(url ?? '')) ||
    REGEX.WEB_STREAMING.test(String(url ?? ''))
  )
}

source.getContentDetails = function (url) {
  if (REGEX.INTERNAL_LIVE.test(String(url ?? '')) || REGEX.WEB_STREAMING.test(String(url ?? ''))) {
    return liveNested()
  }

  const media = mediaPartsFromUrl(url)
  if (media) {
    return directMediaToVideo(media)
  }

  const parts = contentPartsFromUrl(url)
  if (!parts?.slug) {
    throw new ScriptException('Unsupported AlBadr content URL')
  }

  return loadDetail(parts.slug)
}

class AlBadrSeriesPager extends VideoPager {
  constructor(seriesId, offset = 0) {
    const loaded = loadSeries(seriesId, offset)
    super(loaded.items.map(itemToVideo), loaded.hasMore, { seriesId, offset: loaded.nextOffset })
  }

  nextPage() {
    return apply_pager_state(this, new AlBadrSeriesPager(this.context.seriesId, this.context.offset))
  }
}

class AlBadrCategoryPager extends VideoPager {
  constructor(categoryId, seriesOffset = 0) {
    const category = loadCategory(categoryId)
    const series = category.series.slice(seriesOffset, seriesOffset + DEFAULT_LIMIT)
    const videos = []

    for (const item of series) {
      const loaded = safeLoadSeries(item.id, 0)
      if (loaded?.items?.[0]) videos.push(itemToVideo(loaded.items[0]))
    }

    super(dedupeByUrl(videos), seriesOffset + DEFAULT_LIMIT < category.series.length, {
      categoryId,
      seriesOffset: seriesOffset + DEFAULT_LIMIT
    })
  }

  nextPage() {
    return apply_pager_state(this, new AlBadrCategoryPager(this.context.categoryId, this.context.seriesOffset))
  }
}

class AlBadrSearchPager extends VideoPager {
  constructor(query, offset = 0) {
    const loaded = loadSearch(query, offset)
    super(loaded.items.map(itemToVideo), loaded.hasMore, { query, offset: loaded.nextOffset })
  }

  nextPage() {
    return apply_pager_state(this, new AlBadrSearchPager(this.context.query, this.context.offset))
  }
}

function homeLatest() {
  const html = fetchPage(`${BASE_URL}/`)
  const seriesLinks = parseHomeSeriesLinks(html)
  const items = []

  for (const link of seriesLinks) {
    const parts = seriesPartsFromUrl(link.url)
    if (!parts?.id) continue
    const loaded = safeLoadSeries(parts.id, parts.offset)
    const item = loaded?.items?.[loaded.items.length - 1]
    if (item) items.push(itemToVideo(item))
  }

  return dedupeByUrl([liveNested(), ...items])
}

function homeSelected() {
  const html = fetchPage(`${BASE_URL}/`)
  return dedupeByUrl([
    liveNested(),
    ...parseHomeDetailLinks(html)
      .map((item) => safeLoadDetail(item.slug))
      .filter(Boolean)
  ])
}

function seriesGroupVideos(group) {
  const videos = [liveNested()]
  for (const item of SPECIAL_SERIES.filter((series) => series.group === group).slice(0, 6)) {
    const loaded = safeLoadSeries(item.id, 0)
    if (loaded?.items?.[0]) videos.push(itemToVideo(loaded.items[0]))
  }
  return dedupeByUrl(videos)
}

function loadCategory(id) {
  const category = CATEGORIES.find((item) => item.id === String(id))
  if (!category) {
    throw new ScriptException('AlBadr category not found')
  }

  return cached('categoryCache', category.id, () => {
    const html = fetchPage(`${BASE_URL}/category/${category.id}`)
    const series = parseCategorySeries(html, category)
    for (const item of series) {
      rememberSeries(item)
    }
    return { ...category, count: series.reduce((sum, item) => sum + (Number(item.count) || 0), 0), series }
  })
}

function loadSeries(id, offset = 0) {
  const seriesId = String(id)
  const currentOffset = Number(offset || 0)
  const key = `${seriesId}:${currentOffset}`
  return cached('seriesCache', key, () => {
    const html = fetchPage(seriesPageUrl(seriesId, currentOffset))
    const title = pageTitle(html) || seriesMetadata(seriesId).name || `سلسلة ${seriesId}`
    const items = parseSeriesItems(html, seriesId, currentOffset, title)
    if (!items.length) {
      throw new ScriptException('No playable AlBadr lessons found for this series')
    }
    const nextOffset = nextPageOffset(html, currentOffset)
    rememberSeries({ id: seriesId, name: title, count: maxLessonCount(items), pageUrl: publicSeriesUrl(seriesId) })
    return {
      id: seriesId,
      title,
      items,
      hasMore: nextOffset > currentOffset,
      nextOffset,
      total: maxLessonCount(items)
    }
  })
}

function loadSearch(query, offset = 0) {
  const q = String(query ?? '').trim()
  const currentOffset = Number(offset || 0)
  const html = fetchPage(searchPageUrl(q, currentOffset))
  const links = parseSearchDetailLinks(html).slice(0, SEARCH_LIMIT)
  const items = links.map((item) => detailItem(item.slug, item.title)).filter(Boolean)
  const nextOffset = nextPageOffset(html, currentOffset)
  return {
    items,
    hasMore: nextOffset > currentOffset,
    nextOffset
  }
}

function loadDetail(slug) {
  const cleanSlug = String(slug ?? '').trim()
  if (!cleanSlug) {
    throw new ScriptException('AlBadr lesson not found')
  }

  return cached('detailCache', cleanSlug, () => {
    const html = fetchPage(`${BASE_URL}/detail/${cleanSlug}`)
    const item = parseDetail(html, cleanSlug)
    if (!item.audioUrl) {
      throw new ScriptException('No playable MP3 found for AlBadr lesson')
    }
    return itemToVideo(item)
  })
}

function detailItem(slug, fallbackTitle) {
  try {
    const html = fetchPage(`${BASE_URL}/detail/${slug}`)
    return parseDetail(html, slug, fallbackTitle)
  } catch (e) {
    logIfTesting(`Skipping AlBadr detail ${slug}: ${e}`)
    return null
  }
}

function itemToVideo(item) {
  const details = grayjay.video(`lesson-${item.slug || mediaId(item.audioUrl)}`, {
    name: item.title,
    thumbnails: staticThumbnails(),
    author: rootAuthor(),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    isLive: false,
    url: item.slug ? contentUrl(item.slug) : mediaUrl(item.audioUrl),
    description: videoDescription(item),
    video: audio_source_descriptor({
      name: 'صوت MP3',
      container: 'audio/mpeg',
      codec: 'mp3',
      duration: 0,
      url: item.audioUrl,
      language: item.language || 'ar'
    }),
    live: null,
    rating: null,
    subtitles: [],
    shareUrl: item.pageUrl || item.audioUrl
  })

  details.seriesId = item.seriesId || ''
  details.getContentRecommendations = function () {
    if (item.seriesId) {
      const loaded = safeLoadSeries(item.seriesId, item.offset || 0)
      const related = (loaded?.items ?? []).filter((other) => other.slug !== item.slug).map(itemToVideo)
      return new ArrayVideoPager(related, DEFAULT_LIMIT)
    }
    return new ArrayVideoPager(
      homeLatest().filter((other) => other.url !== details.url),
      DEFAULT_LIMIT
    )
  }

  return details
}

function directMediaToVideo(media) {
  const audioUrl = media.audioUrl
  const name = safeDecode(
    audioUrl
      .split('/')
      .pop()
      ?.replace(/\.mp3(?:$|\?)/i, '') || 'ملف صوتي من البدر'
  )
  return itemToVideo({
    slug: '',
    title: name,
    audioUrl,
    pageUrl: audioUrl,
    description: audioUrl,
    seriesId: '',
    language: 'ar'
  })
}

function liveNested() {
  const nested = grayjay.nested('live-mixlr', {
    name: 'البث المباشر',
    author: rootAuthor(),
    datetime: 0,
    url: LIVE_URL,
    contentUrl: MIXLR_CHANNEL_URL,
    contentName: 'البث المباشر لموقع البدر على Mixlr',
    contentDescription: `قناة Mixlr المتداخلة لبث دروس الشيخ عبد الرزاق البدر المباشر.\nصفحة البث: ${BASE_URL}/streaming\nرابط التضمين: ${MIXLR_EMBED_URL}`,
    contentProvider: 'Mixlr',
    contentThumbnails: staticThumbnails()
  })

  nested.getContentRecommendations = function () {
    return new ArrayVideoPager(
      homeLatest().filter((item) => item.url !== nested.url),
      DEFAULT_LIMIT
    )
  }

  return nested
}

function parseHomeSeriesLinks(html) {
  const section = extractSection(html, 'جديد الدروس') || html
  return parseAnchors(section, /\/sub\/\d+/).slice(0, 8)
}

function parseHomeDetailLinks(html) {
  const section = extractSection(html, 'محاضرات مختارة') || html
  return parseAnchors(section, /\/detail\/[^"'?#]+/)
    .map((item) => ({
      slug: slugFromDetailUrl(item.url),
      title: item.title
    }))
    .filter((item) => item.slug)
    .slice(0, 10)
}

function parseCategorySeries(html, category) {
  const main = mainContent(html)
  const series = []
  const regex = /<li\b[^>]*>\s*<a\b([^>]*)href=["']([^"']*\/sub\/(\d+)[^"']*)["']([^>]*)>([\s\S]*?)<\/a>\s*(?:\((\d+)\))?/gi
  let match
  while ((match = regex.exec(main)) !== null) {
    const title = clean_text(extract_first(`${match[1]} ${match[4]}`, /title=["']([^"']+)["']/i) || match[5])
    const item = {
      id: match[3],
      name: title,
      count: Number(match[6] ?? 0),
      categoryId: category.id,
      categoryName: category.name,
      pageUrl: absolutize(match[2])
    }
    series.push(item)
  }
  return dedupeBy(series, (item) => item.id)
}

function parseSeriesItems(html, seriesId, offset, seriesTitle) {
  const main = mainContent(html)
  const rows = String(main).match(/<li\b[\s\S]*?<\/li>/gi) ?? []
  const items = []

  for (const row of rows) {
    const detailMatch = row.match(/<h3[^>]*>\s*<a\b[^>]*href=["']([^"']*\/detail\/([^"']+))["'][^>]*>([\s\S]*?)<\/a>/i)
    const mp3 = extract_first(row, /href=["']([^"']+\.mp3)["']/i)
    if (!detailMatch || !mp3) continue

    const slug = detailMatch[2].replace(/[?#].*$/, '')
    items.push({
      slug,
      title: clean_text(detailMatch[3]),
      audioUrl: absolutize(mp3),
      pageUrl: absolutize(detailMatch[1]),
      seriesId: String(seriesId),
      seriesTitle,
      offset: Number(offset || 0),
      language: 'ar'
    })
  }

  return dedupeBy(items, (item) => item.slug)
}

function parseSearchDetailLinks(html) {
  return parseAnchors(mainContent(html), /\/detail\/[^"'?#]+/)
    .map((item) => ({ slug: slugFromDetailUrl(item.url), title: item.title }))
    .filter((item) => item.slug)
}

function parseDetail(html, slug, fallbackTitle = '') {
  const main = mainContent(html)
  const title =
    clean_text(
      extract_first(main, /<h2[^>]*class=["'][^"']*post-title-center[^"']*["'][^>]*>[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i)
    ) ||
    clean_text(extract_first(main, /<h2[^>]*>([\s\S]*?)<\/h2>/i)) ||
    clean_text(fallbackTitle) ||
    pageTitle(html)
  const audioUrl = absolutize(
    extract_first(main, /<source\b[^>]*src=["']([^"']+\.mp3)["']/i) || extract_first(main, /href=["']([^"']+\.mp3)["']/i)
  )

  return {
    slug,
    title,
    audioUrl,
    pageUrl: `${BASE_URL}/detail/${slug}`,
    description: clean_text(extract_first(main, /<div[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)),
    seriesId: '',
    language: 'ar'
  }
}

function parseAnchors(html, hrefRegex) {
  const links = []
  const regex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(String(html ?? ''))) !== null) {
    const href = decode_html(match[2])
    if (!hrefRegex.test(href)) continue
    links.push({
      url: absolutize(href),
      title: clean_text(extract_first(`${match[1]} ${match[3]}`, /title=["']([^"']+)["']/i) || match[4])
    })
  }
  return dedupeBy(links, (item) => item.url)
}

function extractSection(html, title) {
  const index = String(html ?? '').indexOf(title)
  if (index < 0) return ''
  const rest = String(html).slice(index)
  const end = rest.search(/<h3\b|<div class="smallwidget|<article\b|<aside\b/i)
  return end > title.length ? rest.slice(0, end) : rest.slice(0, 5000)
}

function mainContent(html) {
  const article = extract_first(html, /<article\b[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/article>/i)
  if (article) return article
  return (
    extract_first(html, /<div\b[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--end post-content-->/i) ||
    extract_first(html, /<div\b[^>]*class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    String(html ?? '')
  )
}

function pageTitle(html) {
  return clean_text(extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i))
}

function nextPageOffset(html, currentOffset) {
  const offsets = []
  const regex = /[?&]page=(\d+)/g
  let match
  while ((match = regex.exec(decode_html(mainContent(html)))) !== null) {
    const offset = Number(match[1])
    if (offset > currentOffset) offsets.push(offset)
  }
  return offsets.length ? Math.min(...offsets) : currentOffset
}

function maxLessonCount(items) {
  let max = 0
  for (const item of items) {
    const match = String(item.title ?? '').match(/^\s*(\d+)\s*\/\s*(\d+)/)
    if (match) max = Math.max(max, Number(match[2]))
  }
  return max
}

function ensureSeriesIndex() {
  if (state.seriesIndex?.length) return

  const allSeries = []
  for (const category of CATEGORIES) {
    allSeries.push(...loadCategory(category.id).series)
  }
  allSeries.push(...SPECIAL_SERIES.map((item) => ({ ...item, pageUrl: publicSeriesUrl(item.id), count: 0 })))

  state.seriesIndex = dedupeBy(allSeries, (item) => item.id)
  state.seriesById = {}
  for (const item of state.seriesIndex) {
    state.seriesById[item.id] = item
  }
}

function rememberSeries(item) {
  if (!item?.id) return
  state.seriesById[item.id] = { ...(state.seriesById[item.id] ?? {}), ...item }
  const existing = state.seriesIndex.findIndex((series) => series.id === item.id)
  if (existing >= 0) state.seriesIndex[existing] = state.seriesById[item.id]
  else state.seriesIndex.push(state.seriesById[item.id])
}

function seriesMetadata(id, fallbackName = '') {
  return (
    state.seriesById?.[String(id)] ??
    SPECIAL_SERIES.find((item) => item.id === String(id)) ?? { id: String(id), name: fallbackName || `سلسلة ${id}` }
  )
}

function seriesToPlaylist(series) {
  return grayjay.playlist(`series-${series.id}`, {
    name: series.name,
    thumbnails: staticThumbnails(),
    thumbnail: iconUrl(),
    author: rootAuthor(),
    datetime: 0,
    url: playlistUrl(series.id),
    videoCount: series.count || 0
  })
}

function categoryToChannel(category) {
  const description = category.count
    ? `${category.name}\n${category.count} مادة صوتية ضمن سلاسل موقع البدر.`
    : `${category.name}\nسلاسل صوتية من موقع البدر.`

  return grayjay.channel(`category-${category.id}`, {
    name: category.name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description,
    url: categoryUrl(category.id),
    urlAlternatives: [publicCategoryUrl(category.id)]
  })
}

function rootChannel() {
  return grayjay.channel('root', {
    name: DISPLAY_NAME,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'دروس الشيخ عبد الرزاق البدر الصوتية، سلاسل الدروس كقوائم تشغيل، قنوات التصنيفات، والبث المباشر كمحتوى Mixlr متداخل.',
    url: rootUrl(),
    urlAlternatives: [BASE_URL, BARE_URL]
  })
}

function liveChannel() {
  return grayjay.channel('live', {
    name: 'البث المباشر',
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: 'البث المباشر لموقع البدر عبر مصدر Mixlr عند توفره.',
    url: LIVE_URL,
    urlAlternatives: [`${BASE_URL}/streaming`, MIXLR_CHANNEL_URL, MIXLR_EMBED_URL]
  })
}

function rootAuthor() {
  return grayjay.author('root', AUTHOR, rootUrl(), iconUrl())
}

function contentFilter() {
  return {
    id: 'content',
    name: 'المحتوى',
    isMultiSelect: false,
    filters: [
      { id: 'all', name: 'الصوتيات والبث المباشر', value: 'all' },
      { id: 'audio', name: 'الدروس الصوتية', value: 'audio' },
      { id: 'live', name: 'البث المباشر', value: 'live' }
    ]
  }
}

function selectedContent(filters) {
  const value = filterValue(selectedFilterValues(filters, 'content')[0])
  return value === 'live' || value === 'audio' ? value : 'all'
}

function selectedFilterValues(filters, id) {
  if (!filters) return []
  if (Array.isArray(filters)) return filters.filter((filter) => filter?.id === id || filter?.group?.id === id)
  if (typeof filters.get === 'function') {
    const value = filters.get(id)
    return Array.isArray(value) ? value : value ? [value] : []
  }
  const value = filters[id]
  return Array.isArray(value) ? value : value ? [value] : []
}

function filterValue(value) {
  return String(value?.value ?? value?.id ?? value ?? '')
}

function cached(cacheName, key, loader) {
  const cacheKey = String(key)
  const cachedItem = state[cacheName]?.[cacheKey]
  if (cachedItem?.expiresAt > Date.now()) {
    return cachedItem.value
  }

  const value = loader()
  cache_set(state, CACHE_LIMITS, cacheName, cacheKey, {
    expiresAt: Date.now() + CACHE_MAX_AGE_MS,
    value
  })
  return value
}

function fetchPage(url) {
  return cached('pageCache', normalizePublicUrl(url), () => get_text(normalizePublicUrl(url), DEFAULT_HEADERS, false))
}

function safeLoadSeries(id, offset) {
  try {
    return loadSeries(id, offset)
  } catch (e) {
    logIfTesting(`Skipping AlBadr series ${id}: ${e}`)
    return null
  }
}

function safeLoadDetail(slug) {
  try {
    return loadDetail(slug)
  } catch (e) {
    logIfTesting(`Skipping AlBadr detail ${slug}: ${e}`)
    return null
  }
}

function videoDescription(item) {
  return [
    item.description,
    item.seriesTitle ? `السلسلة: ${item.seriesTitle}` : '',
    `الشيخ: ${AUTHOR}`,
    `المصدر: ${item.pageUrl || item.audioUrl}`
  ]
    .filter(Boolean)
    .join('\n')
}

function isRootUrl(url) {
  const value = String(url ?? '')
  return REGEX.INTERNAL_ROOT.test(value) || REGEX.ROOT.test(value)
}

function categoryIdFromUrl(url) {
  const value = String(url ?? '')
  const match = value.match(REGEX.INTERNAL_CATEGORY) || value.match(REGEX.WEB_CATEGORY)
  return match?.[1] ?? null
}

function seriesPartsFromUrl(url) {
  const value = String(url ?? '')
  const internal = value.match(REGEX.INTERNAL_PLAYLIST)
  if (internal) return { id: internal[1], offset: 0 }
  const web = value.match(REGEX.WEB_SERIES)
  if (web) return { id: web[1], offset: Number(extract_first(value, /[?&]page=(\d+)/) ?? 0) }
  return null
}

function seriesIdFromUrl(url) {
  return seriesPartsFromUrl(url)?.id ?? null
}

function contentPartsFromUrl(url) {
  const value = String(url ?? '')
  const match = value.match(REGEX.INTERNAL_CONTENT) || value.match(REGEX.WEB_DETAIL)
  return match?.[1] ? { slug: safeDecode(match[1]) } : null
}

function mediaPartsFromUrl(url) {
  const value = String(url ?? '')
  const internal = value.match(REGEX.INTERNAL_MEDIA)
  if (internal?.[1]) return { audioUrl: absolutize(`/download/esound/${safeDecode(internal[1])}`) }
  const web = value.match(REGEX.WEB_MEDIA)
  if (web?.[1]) return { audioUrl: `${BASE_URL}/download/esound/${web[1]}` }
  return null
}

function slugFromDetailUrl(url) {
  return String(url ?? '').match(REGEX.WEB_DETAIL)?.[1] ?? extract_first(url, /\/detail\/([^/?#]+)/)
}

function rootUrl() {
  return 'albadr://root'
}

function categoryUrl(id) {
  return `albadr://category/${id}`
}

function playlistUrl(id) {
  return `albadr://playlist/sub/${id}`
}

function contentUrl(slug) {
  return `albadr://content/${encodeURIComponent(slug)}`
}

function mediaUrl(url) {
  return `albadr://media/${encodeURIComponent(String(url ?? '').replace(/^https?:\/\/(?:www\.)?al-badr\.net\/download\/esound\//, ''))}`
}

function publicCategoryUrl(id) {
  return `${BASE_URL}/category/${id}`
}

function publicSeriesUrl(id) {
  return `${BASE_URL}/sub/${id}`
}

function seriesPageUrl(id, offset = 0) {
  const params = [
    ['q', ''],
    ['page', offset > 0 ? offset : null]
  ]
  const query = query_string(params)
  return `${BASE_URL}/sub/${id}/${query ? `?${query}` : ''}`
}

function searchPageUrl(query, offset = 0) {
  const params = [
    ['q', query],
    ['page', offset > 0 ? offset : null]
  ]
  return `${BASE_URL}/search/?${query_string(params)}`
}

function absolutize(url) {
  const value = decode_html(String(url ?? '')).trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return normalizePublicUrl(value)
  if (value.startsWith('/')) return `${BASE_URL}${value}`
  return `${BASE_URL}/${value.replace(/^\/+/, '')}`
}

function normalizePublicUrl(url) {
  return String(url ?? '').replace(/^https:\/\/al-badr\.net/i, BASE_URL)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function staticThumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

function mediaId(url) {
  return String(url ?? '')
    .replace(/^https?:\/\/(?:www\.)?al-badr\.net\/download\/esound\//, '')
    .replace(/[?#].*$/, '')
}

function itemMatches(item, query) {
  const q = normalize(query)
  return (
    !q || normalize(item.name ?? item.contentName).indexOf(q) >= 0 || normalize(item.description ?? item.contentDescription).indexOf(q) >= 0
  )
}

function normalize(value) {
  return normalize_search_text(value)
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value ?? ''))
  } catch {
    return String(value ?? '')
  }
}

function dedupeByUrl(items) {
  return dedupeBy(items, (item) => item.url ?? item.contentUrl)
}

function dedupeBy(items, key) {
  const seen = {}
  const result = []
  for (const item of items) {
    const value = key(item)
    if (!value || seen[value]) continue
    seen[value] = true
    result.push(item)
  }
  return result
}

function logIfTesting(message) {
  if (typeof IS_TESTING !== 'undefined' && IS_TESTING) {
    log(message)
  }
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)
