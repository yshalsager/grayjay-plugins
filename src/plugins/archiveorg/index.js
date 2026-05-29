import { plugin_icon_url } from '@lib/assets.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { get_json, query_string } from '@lib/http.js'
import { audio_sources_descriptor, thumbnails, video_source_descriptor } from '@lib/media.js'
import { apply_pager_state, array_pager_class, empty_pager_class } from '@lib/paging.js'
import { clean_text, normalize_search_text, normalize_text } from '@lib/text.js'

const PLATFORM = 'Archive.org'
const BASE_URL = 'https://archive.org'
const SEARCH_URL = `${BASE_URL}/advancedsearch.php`
const DEFAULT_LIMIT = 24
const PLAYLIST_LIMIT = 8
const SEARCH_COUNT = 100
const DEFAULT_ICON = 'https://archive.org/images/glogo.png'
const MEDIA = {
  BOTH: 0,
  AUDIO: 1,
  VIDEO: 2
}
const SORTS = {
  RELEVANCE: 0,
  DATE: 1,
  DOWNLOADS: 2,
  TITLE: 3
}
const DEFAULT_HEADERS = {
  'User-Agent': `grayjay.app/${bridge.buildVersion}`,
  Accept: 'application/json'
}
const PLAYABLE_AUDIO_FORMATS = ['VBR MP3', 'MP3', '64Kbps MP3', 'Ogg Vorbis', 'FLAC']
const PLAYABLE_VIDEO_FORMATS = ['MPEG4', 'h.264', '512Kb MPEG4', 'Ogg Video']
const SKIPPED_FORMATS = ['Metadata', 'Item Tile', 'Archive BitTorrent', 'JPEG Thumb', 'PNG', 'JSON', 'Text', 'PDF', 'Abbyy GZ']
const REGEX = {
  CREATOR: /^archiveorg:\/\/creator\/(.+)$/,
  ITEM: /^archiveorg:\/\/item\/([^/?#]+)\/(audio|video|both)$/,
  PLAYLIST: /^archiveorg:\/\/playlist\/([^/?#]+)(?:\/(audio|video|both))?$/,
  CONTENT: /^archiveorg:\/\/content\/([^/?#]+)\/(.+)$/,
  WEB_DETAILS: /^https?:\/\/(?:www\.)?archive\.org\/details\/([^/?#]+)/,
  WEB_DOWNLOAD: /^https?:\/\/(?:www\.)?archive\.org\/download\/([^/?#]+)\/([^?#]+)/
}

let _config = {}
let _settings = {}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)
let state = {
  itemCache: {}
}

source.enable = function (conf, settings, savedState) {
  _config = conf ?? {}
  _settings = settings ?? {}

  if (savedState) {
    try {
      state = JSON.parse(savedState)
      state.itemCache ??= {}
    } catch (e) {
      logIfTesting('Failed to parse Archive.org state: ' + e)
    }
  }
}

source.saveState = function () {
  return JSON.stringify(state)
}

Type.Order.Popularity = 'Popularity'

source.getHome = function () {
  return new ArrayVideoPager([], DEFAULT_LIMIT)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological, Type.Order.Popularity],
  filters: [contentFilter()]
})

source.searchSuggestions = function (query) {
  const q = normalize(query)
  if (!q) {
    return ['NASA', 'concert', 'lecture', 'public domain film']
  }

  return [`${query} audio`, `${query} video`, `${query} lecture`, `${query} collection`]
}

source.search = function (query, type, order, filters) {
  if (!normalize(query) && !hasSearchFilters(filters)) {
    return new ArrayVideoPager([], DEFAULT_LIMIT)
  }

  return new ArchiveSearchPager(query, selectedMedia(filters), order || defaultSort(), null)
}

source.searchChannels = function (_query) {
  return normalize(_query) ? new ArchiveCreatorPager(_query) : new EmptyChannelPager()
}

source.searchPlaylists = function (query, type, order, filters) {
  if (!normalize(query) && !hasSearchFilters(filters)) {
    return new EmptyPlaylistPager()
  }

  return new ArchivePlaylistSearchPager(query, selectedMedia(filters), order || defaultSort(), null)
}

source.isChannelUrl = function (_url) {
  return REGEX.CREATOR.test(_url)
}

source.getChannel = function (url) {
  return creatorToChannel(creatorFromUrl(url))
}

source.getChannelPlaylists = function (url) {
  return new ArchivePlaylistSearchPager('', mediaType(), defaultSort(), null, null, 0, false, creatorFromUrl(url))
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()

source.getChannelCapabilities = () => source.getSearchCapabilities()

source.getPeekChannelTypes = () => ['Media']

source.peekChannelContents = function (url, _type) {
  const pager = new ArchiveSearchPager('', mediaType(), defaultSort(), null, null, 0, false, creatorFromUrl(url))
  return pager.results.slice(0, 6)
}

source.searchChannelContents = function (url, query, type, order, filters) {
  return new ArchiveSearchPager(query, selectedMedia(filters), order || defaultSort(), null, null, 0, false, creatorFromUrl(url))
}

source.getChannelContents = function (url, _type, order, filters) {
  return new ArchiveSearchPager('', selectedMedia(filters), order || defaultSort(), null, null, 0, false, creatorFromUrl(url))
}

source.isPlaylistUrl = function (url) {
  return REGEX.PLAYLIST.test(url)
}

source.getPlaylist = function (url) {
  return itemToPlaylistDetails(getItemFromUrl(url), mediaFromUrl(url))
}

source.isContentDetailsUrl = function (url) {
  return REGEX.ITEM.test(url) || REGEX.CONTENT.test(url) || REGEX.WEB_DOWNLOAD.test(url) || REGEX.WEB_DETAILS.test(url)
}

source.getContentDetails = function (url) {
  const direct = fileFromUrl(url)
  if (direct) {
    return fileToVideo(direct.item, direct.file, url)
  }

  const item = getItemFromUrl(url)
  const file = firstPlayableFile(item, mediaFromUrl(url))
  if (!file) {
    throw new ScriptException('Archive.org item has no playable audio or video files')
  }

  return fileToVideo(item, file, url)
}

class ArchiveSearchPager extends VideoPager {
  constructor(query, media, order, pageNumber = 1, items = null, offset = 0, sourceHasMore = false, creator = null) {
    const page = items ? { items, hasMore: sourceHasMore, nextPage: pageNumber } : searchArchive(query, media, order, pageNumber, creator)
    const results = itemsToVideos(page.items.slice(offset, offset + DEFAULT_LIMIT), media)
    const nextOffset = offset + DEFAULT_LIMIT

    super(results, nextOffset < page.items.length || page.hasMore, {
      query,
      media,
      order,
      page: page.nextPage,
      items: page.items,
      offset: nextOffset,
      sourceHasMore: page.hasMore,
      creator
    })
  }

  nextPage() {
    const remainingItems = this.context.offset < this.context.items.length ? this.context.items : null
    const offset = remainingItems ? this.context.offset : 0
    const next = new ArchiveSearchPager(
      this.context.query,
      this.context.media,
      this.context.order,
      this.context.page,
      remainingItems,
      offset,
      remainingItems ? this.context.sourceHasMore : false,
      this.context.creator
    )
    return apply_pager_state(this, next)
  }
}

class ArchivePlaylistSearchPager extends PlaylistPager {
  constructor(query, media, order, pageNumber = 1, items = null, offset = 0, sourceHasMore = false, creator = null) {
    const page = items ? { items, hasMore: sourceHasMore, nextPage: pageNumber } : searchArchive(query, media, order, pageNumber, creator)
    const results = itemsToPlaylists(page.items.slice(offset, offset + PLAYLIST_LIMIT), media)
    const nextOffset = offset + PLAYLIST_LIMIT

    super(results, nextOffset < page.items.length || page.hasMore, {
      query,
      media,
      order,
      page: page.nextPage,
      items: page.items,
      offset: nextOffset,
      sourceHasMore: page.hasMore,
      creator
    })
  }

  nextPage() {
    const remainingItems = this.context.offset < this.context.items.length ? this.context.items : null
    const offset = remainingItems ? this.context.offset : 0
    const next = new ArchivePlaylistSearchPager(
      this.context.query,
      this.context.media,
      this.context.order,
      this.context.page,
      remainingItems,
      offset,
      remainingItems ? this.context.sourceHasMore : false,
      this.context.creator
    )
    return apply_pager_state(this, next)
  }
}

class ArrayVideoPager extends array_pager_class(VideoPager) {
  constructor(items, limit = DEFAULT_LIMIT, offset = 0) {
    super(items, limit, offset)
  }
}

const EmptyChannelPager = empty_pager_class(ChannelPager)
const EmptyPlaylistPager = empty_pager_class(PlaylistPager)

class ArchiveCreatorPager extends ChannelPager {
  constructor(query, pageNumber = 1) {
    const page = searchArchive(query, MEDIA.BOTH, defaultSort(), pageNumber)
    const channels = summariesToCreatorChannels(page.items)

    super(channels, page.hasMore, { query, page: page.nextPage })
  }

  nextPage() {
    const next = new ArchiveCreatorPager(this.context.query, this.context.page)
    return apply_pager_state(this, next)
  }
}

function searchArchive(query, media, order, pageNumber, creator = null) {
  const params = [
    ['q', searchQuery(query, media, creator)],
    ['rows', String(SEARCH_COUNT)],
    ['page', String(pageNumber || 1)],
    ['output', 'json'],
    ['fl[]', 'identifier'],
    ['fl[]', 'title'],
    ['fl[]', 'creator'],
    ['fl[]', 'mediatype'],
    ['fl[]', 'downloads'],
    ['fl[]', 'publicdate'],
    ['fl[]', 'date']
  ]
  const sort = sortParam(order)

  if (sort) {
    params.push(['sort[]', sort])
  }

  const url = `${SEARCH_URL}?${query_string(params)}`
  const data = callJson(url)
  const response = data.response ?? {}
  const items = response.docs ?? []
  const page = Number(pageNumber || 1)
  const sortedItems = sort ? items : rankSearchItems(items, query)

  return {
    items: sortedItems,
    nextPage: page + 1,
    hasMore: (response.start ?? (page - 1) * SEARCH_COUNT) + items.length < Number(response.numFound ?? 0)
  }
}

function searchQuery(query, media, creator = null) {
  const parts = []
  const q = cleanText(query)

  if (creator) {
    parts.push(creatorSearchQuery(creator))
  }

  if (q) {
    parts.push(userSearchQuery(q))
  }

  if (media === MEDIA.AUDIO) {
    parts.push('mediatype:audio')
  } else if (media === MEDIA.VIDEO) {
    parts.push('mediatype:movies')
  } else {
    parts.push('(mediatype:audio OR mediatype:movies)')
  }

  return parts.join(' AND ')
}

function userSearchQuery(query) {
  const terms = searchTerms(query)
  const clauses = [`"${escapeSearch(query)}"`, escapeSearch(query)]
  if (terms.length > 1) {
    clauses.push(terms[terms.length - 1])
  }

  return `(${dedupeStrings(clauses).join(' OR ')})`
}

function creatorSearchQuery(creator) {
  return `creator:"${escapeSearch(creator)}"`
}

function rankSearchItems(items, query) {
  const terms = searchTerms(query)
  if (!terms.length) {
    return items
  }

  return items
    .map((item, index) => ({ item, index, score: searchScore(item, query, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
}

function searchScore(item, query, terms) {
  const normalizedQuery = normalizeSearch(query)
  const title = normalizeSearch(item.title)
  const creator = normalizeSearch(arrayText(item.creator))
  const identifier = normalizeSearch(item.identifier)
  const description = normalizeSearch(item.description)
  const subject = normalizeSearch(arrayText(item.subject))
  const searchable = `${title} ${creator} ${identifier} ${description} ${subject}`
  const titleMatches = terms.filter((term) => title.indexOf(term) >= 0).length
  const creatorMatches = terms.filter((term) => creator.indexOf(term) >= 0).length
  const allTermsInTitle = terms.length > 0 && titleMatches === terms.length
  const allTermsInSearchable = terms.every((term) => searchable.indexOf(term) >= 0)

  let score = 0
  if (normalizedQuery && title.indexOf(normalizedQuery) >= 0) score += 1000
  if (normalizedQuery && creator.indexOf(normalizedQuery) >= 0) score += 900
  if (allTermsInTitle) score += 700
  if (allTermsInSearchable) score += 350
  score += titleMatches * 90
  score += creatorMatches * 70
  score += terms.filter((term) => identifier.indexOf(term) >= 0).length * 40
  score += terms.filter((term) => description.indexOf(term) >= 0 || subject.indexOf(term) >= 0).length * 15

  return score
}

function itemsToVideos(items, media) {
  return (items ?? []).map((summary) => summaryToVideo(summary, media)).filter(Boolean)
}

function itemsToPlaylists(items, media) {
  const playlists = []

  for (const summary of items ?? []) {
    try {
      const item = getItem(summary.identifier, summary)
      if (firstPlayableFile(item, media)) {
        playlists.push(itemToPlaylist(item, media))
      }
    } catch (e) {
      logIfTesting('Failed to map Archive.org playlist: ' + e)
    }
  }

  return playlists
}

function getItem(identifier, summary = null) {
  const id = String(identifier ?? '')
  if (!id) {
    throw new ScriptException('Archive.org item not found')
  }

  if (!state.itemCache[id]?.files?.length) {
    const item = callJson(`${BASE_URL}/metadata/${encodeURIComponent(id)}`)
    if (!item?.files?.length && !summary) {
      throw new ScriptException('Archive.org item not found')
    }
    state.itemCache[id] = normalizeItem(item, id, summary)
  } else if (summary && !state.itemCache[id].summary) {
    state.itemCache[id].summary = summary
  }

  state.itemCache[id] = normalizeItem(state.itemCache[id], id, state.itemCache[id].summary ?? summary)
  return state.itemCache[id]
}

function getItemFromUrl(url) {
  const match =
    url.match(REGEX.ITEM) ??
    url.match(REGEX.PLAYLIST) ??
    url.match(REGEX.CONTENT) ??
    url.match(REGEX.WEB_DETAILS) ??
    url.match(REGEX.WEB_DOWNLOAD)
  if (!match?.[1]) {
    throw new ScriptException('Archive.org item not found')
  }

  return getItem(decodeURIComponent(match[1]))
}

function fileFromUrl(url) {
  const match = url.match(REGEX.CONTENT) ?? url.match(REGEX.WEB_DOWNLOAD)
  if (!match?.[1] || !match?.[2]) {
    return null
  }

  const item = getItem(decodeURIComponent(match[1]))
  const fileName = decodeURIComponent(match[2])
  const file = (item.files ?? []).find((candidate) => candidate.name === fileName && isPlayableFile(candidate))
  if (!file) {
    throw new ScriptException('Archive.org file not found')
  }

  return { item, file }
}

function playableFiles(item, media = MEDIA.BOTH) {
  return (item.files ?? []).filter((file) => isPlayableFile(file, media)).sort(fileSort)
}

function firstPlayableFile(item, media = MEDIA.BOTH) {
  const preferredMedia = itemMedia(item, media)
  let best = null

  for (const file of item.files ?? []) {
    if (isPlayableFile(file, preferredMedia) && (!best || fileSort(file, best) < 0)) {
      best = file
    }
  }

  return best
}

function itemMedia(item, media = MEDIA.BOTH) {
  if (media !== MEDIA.BOTH) {
    return media
  }

  const mediatype = normalize(item?.metadata?.mediatype || item?.summary?.mediatype)
  if (mediatype === 'movies' || mediatype === 'movie') {
    return MEDIA.VIDEO
  }
  if (mediatype === 'audio') {
    return MEDIA.AUDIO
  }

  return media
}

function playableFileCount(item, media = MEDIA.BOTH) {
  return (item.files ?? []).filter((file) => isPlayableFile(file, media)).length
}

function isPlayableFile(file, media = MEDIA.BOTH) {
  if (isSkippedFile(file)) {
    return false
  }

  const kind = fileKind(file)
  return kind && (media === MEDIA.BOTH || media === kind)
}

function isSkippedFile(file) {
  const name = String(file.name ?? '')
  const format = String(file.format ?? '')

  return (
    !name ||
    SKIPPED_FORMATS.some((skipped) => format.indexOf(skipped) >= 0) ||
    /\.(xml|json|txt|pdf|torrent|sqlite|srt|vtt|jpg|jpeg|png|gif|zip|rar|7z)$/i.test(name)
  )
}

function fileKind(file) {
  const name = String(file.name ?? '')
  const format = String(file.format ?? '')

  if (PLAYABLE_AUDIO_FORMATS.some((value) => format.indexOf(value) >= 0) || /\.(mp3|ogg|oga|flac)$/i.test(name)) {
    return MEDIA.AUDIO
  }

  if (PLAYABLE_VIDEO_FORMATS.some((value) => format.indexOf(value) >= 0) || /\.(mp4|m4v|webm|ogv)$/i.test(name)) {
    return MEDIA.VIDEO
  }

  return 0
}

function fileSort(a, b) {
  const ak = fileKind(a)
  const bk = fileKind(b)
  if (ak !== bk) {
    return ak - bk
  }

  const ai = formatIndex(a)
  const bi = formatIndex(b)
  if (ai !== bi) {
    return ai - bi
  }

  return naturalName(a.name).localeCompare(naturalName(b.name))
}

function formatIndex(file) {
  const formats = fileKind(file) === MEDIA.AUDIO ? PLAYABLE_AUDIO_FORMATS : PLAYABLE_VIDEO_FORMATS
  const index = formats.findIndex((format) => String(file.format ?? '').indexOf(format) >= 0)
  return index >= 0 ? index : formats.length
}

function summaryToVideo(summary, media = MEDIA.BOTH) {
  const identifier = summaryIdentifier(summary)
  if (!identifier) {
    return null
  }

  cacheSummary(summary)

  return grayjay.feed_video(`item-${identifier}-${media}`, {
    name: cleanText(summary.title || identifier),
    thumbnails: itemThumbnails(identifier),
    author: summaryAuthor(summary),
    uploadDate: unixDate(summary.publicdate || summary.date),
    duration: 0,
    viewCount: Number(summary.downloads || 0),
    isLive: false,
    url: itemUrl(identifier, media),
    shareUrl: detailsUrl(identifier)
  })
}

function summariesToCreatorChannels(items) {
  const channels = []
  const seen = {}

  for (const item of items ?? []) {
    for (const creator of creatorsFromSummary(item)) {
      const key = normalize(creator)
      if (!key || seen[key]) {
        continue
      }
      seen[key] = true
      channels.push(creatorToChannel(creator))
    }
  }

  return channels
}

function creatorsFromSummary(summary) {
  const creators = Array.isArray(summary?.creator) ? summary.creator : summary?.creator ? [summary.creator] : []
  return creators.map(cleanText).filter(Boolean)
}

function fileToVideo(item, file, urlOverride = null) {
  const identifier = itemIdentifier(item)
  const meta = item.metadata ?? {}
  const summary = item.summary ?? {}
  const title = cleanText(file.title || file.name?.replace(/\.[^.]+$/, '') || meta.title || summary.title || identifier)
  const itemTitle = cleanText(meta.title || summary.title || identifier)
  const kind = fileKind(file)
  const mediaUrl = fileUrl(identifier, file.name)
  const directMediaUrl = itemFileUrl(item, file.name)
  const details = grayjay.video(`${identifier}-${file.name}`, {
    name: title === itemTitle ? title : `${title} - ${itemTitle}`,
    thumbnails: itemThumbnails(identifier),
    author: itemAuthor(item),
    uploadDate: unixDate(meta.publicdate || summary.publicdate || meta.date),
    duration: durationSeconds(file.length || file.runtime || meta.runtime),
    viewCount: Number(meta.downloads || summary.downloads || 0),
    isLive: false,
    url: urlOverride || contentUrl(identifier, file.name),
    description: itemDescription(item, file, mediaUrl),
    video: sourceDescriptor(file, mediaUrl, kind, directMediaUrl),
    shareUrl: detailsUrl(identifier)
  })

  details.getContentRecommendations = function () {
    return new ArrayVideoPager(
      playableFiles(item)
        .filter((candidate) => candidate.name !== file.name)
        .map((candidate) => fileToVideo(item, candidate)),
      DEFAULT_LIMIT
    )
  }

  return details
}

function sourceDescriptor(file, url, kind, fallbackUrl = null) {
  if (kind === MEDIA.AUDIO) {
    const urls = [url, fallbackUrl].filter((value, index, list) => value && list.indexOf(value) === index)
    return audio_sources_descriptor(
      urls.map((sourceUrl) => ({
        name: sourceName(file),
        container: audioContainer(file),
        codec: audioCodec(file),
        bitrate: bitrateBitsPerSecond(file),
        duration: durationSeconds(file.length || file.runtime),
        url: sourceUrl
      }))
    )
  }

  return video_source_descriptor({
    name: sourceName(file),
    width: Number(file.width ?? 0),
    height: Number(file.height ?? 0),
    container: videoContainer(file),
    codec: videoCodec(file),
    bitrate: bitrateBitsPerSecond(file),
    duration: durationSeconds(file.length || file.runtime),
    url
  })
}

function itemToPlaylist(item, media = MEDIA.BOTH) {
  const identifier = itemIdentifier(item)
  const meta = item.metadata ?? {}
  const name = cleanText(meta.title || item.summary?.title || identifier)
  const thumbnail = thumbnailUrl(identifier)

  return grayjay.playlist(`playlist-${identifier}`, {
    name,
    thumbnails: itemThumbnails(identifier),
    author: itemAuthor(item),
    datetime: unixDate(meta.publicdate || item.summary?.publicdate || meta.date),
    url: playlistUrl(identifier, media),
    videoCount: playableFileCount(item, media),
    thumbnail
  })
}

function itemToPlaylistDetails(item, media = MEDIA.BOTH) {
  const playlist = itemToPlaylist(item, media)

  return grayjay.playlist_details(`playlist-${itemIdentifier(item)}`, {
    name: playlist.name,
    thumbnails: playlist.thumbnails,
    author: playlist.author,
    datetime: playlist.datetime,
    url: playlist.url,
    videoCount: playlist.videoCount,
    thumbnail: playlist.thumbnail,
    contents: new ArrayVideoPager(
      playableFiles(item, media).map((file) => fileToVideo(item, file)),
      DEFAULT_LIMIT
    )
  })
}

function itemAuthor(item) {
  const meta = item.metadata ?? {}
  const creator = arrayText(meta.creator || item.summary?.creator) || 'Internet Archive'

  return grayjay.author(`creator-${creatorId(creator)}`, creator, creatorUrl(creator), iconUrl())
}

function summaryAuthor(summary) {
  const creator = arrayText(summary?.creator) || 'Internet Archive'

  return grayjay.author(`creator-${creatorId(creator)}`, creator, creatorUrl(creator), iconUrl())
}

function itemDescription(item, file, mediaUrl) {
  const identifier = itemIdentifier(item)
  const meta = item.metadata ?? {}
  const summary = item.summary ?? {}

  return [
    cleanText(meta.description || summary.description),
    `Item: ${cleanText(meta.title || summary.title || identifier)}`,
    `File: ${file.name}`,
    file.format ? `Format: ${file.format}` : '',
    file.size ? `Size: ${file.size}` : '',
    `Source: ${mediaUrl}`,
    `Page: ${detailsUrl(identifier)}`
  ]
    .filter(Boolean)
    .join('\n')
}

function creatorToChannel(creator) {
  const name = cleanText(creator)
  const id = creatorId(name)

  return grayjay.channel(`creator-${id}`, {
    name,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: `Archive.org items by ${name}.`,
    url: creatorUrl(name),
    urlAlternatives: [creatorPublicUrl(name)]
  })
}

function creatorId(creator) {
  return (
    normalize(creator)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'internet-archive'
  )
}

function creatorUrl(creator) {
  return `archiveorg://creator/${encodeURIComponent(cleanText(creator))}`
}

function creatorPublicUrl(creator) {
  return `${BASE_URL}/search?${query_string([['query', creatorSearchQuery(creator)]])}`
}

function creatorFromUrl(url) {
  const match = String(url ?? '').match(REGEX.CREATOR)
  if (!match?.[1]) {
    throw new ScriptException('Archive.org creator not found')
  }

  return decodeURIComponent(match[1])
}

function normalizeItem(item, fallbackIdentifier, summary = null) {
  const metadata = item?.metadata ?? {}
  const identifier = String(item?.identifier ?? metadata.identifier ?? summary?.identifier ?? fallbackIdentifier ?? '')

  return {
    ...item,
    identifier,
    metadata: {
      ...metadata,
      identifier
    },
    summary: summary ?? item?.summary ?? null,
    files: item?.files ?? []
  }
}

function cacheSummary(summary) {
  const identifier = summaryIdentifier(summary)
  if (!identifier || state.itemCache[identifier]?.files?.length) {
    return
  }

  state.itemCache[identifier] = normalizeItem(state.itemCache[identifier] ?? {}, identifier, summary)
}

function summaryIdentifier(summary) {
  const identifier = String(summary?.identifier ?? '').trim()
  return identifier && identifier !== 'undefined' ? identifier : ''
}

function itemIdentifier(item) {
  const identifier = String(item?.identifier ?? item?.metadata?.identifier ?? item?.summary?.identifier ?? '')
  if (!identifier || identifier === 'undefined') {
    throw new ScriptException('Archive.org item not found')
  }

  return identifier
}

function contentFilter() {
  return {
    id: 'content',
    name: 'Content',
    isMultiSelect: false,
    filters: [
      { id: 'both', name: 'Audio and video', value: 'both' },
      { id: 'audio', name: 'Audio', value: 'audio' },
      { id: 'video', name: 'Video', value: 'video' }
    ]
  }
}

function selectedMedia(filters) {
  const value = selectedFilterValues(filters, 'content')[0]
  if (filterValue(value) === 'audio') {
    return MEDIA.AUDIO
  }
  if (filterValue(value) === 'video') {
    return MEDIA.VIDEO
  }

  return mediaType()
}

function selectedFilterValues(filters, id) {
  if (!filters) {
    return []
  }

  if (Array.isArray(filters)) {
    return filters.filter((filter) => filter?.id === id || filter?.group?.id === id)
  }

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

function hasSearchFilters(filters) {
  return selectedFilterValues(filters, 'content').length > 0
}

function mediaType() {
  const type = Number(_settings.mediaType ?? MEDIA.BOTH)
  return type === MEDIA.AUDIO || type === MEDIA.VIDEO ? type : MEDIA.BOTH
}

function defaultSort() {
  const sort = Number(_settings.sort ?? SORTS.RELEVANCE)
  if (sort === SORTS.DATE) {
    return Type.Order.Chronological
  }
  if (sort === SORTS.DOWNLOADS) {
    return Type.Order.Popularity
  }
  if (sort === SORTS.TITLE) {
    return 'Title'
  }

  return null
}

function sortParam(order) {
  if (order === Type.Order.Chronological) {
    return 'publicdate desc,identifier'
  }
  if (order === Type.Order.Popularity) {
    return 'downloads desc,identifier'
  }
  if (order === 'Title') {
    return 'titleSorter asc,identifier'
  }

  return null
}

function callJson(url) {
  return get_json(url, DEFAULT_HEADERS)
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function itemThumbnails(identifier) {
  return thumbnails(thumbnailUrl(identifier))
}

function thumbnailUrl(identifier) {
  return `${BASE_URL}/services/img/${encodeURIComponent(identifier)}`
}

function fileUrl(identifier, fileName) {
  return `${BASE_URL}/download/${encodeURIComponent(identifier)}/${encodePath(fileName)}`
}

function itemFileUrl(item, fileName) {
  const server = itemServer(item)
  const dir = String(item?.dir ?? '')
  if (server && dir) {
    return `https://${server}${encodePath(dir)}/${encodePath(fileName)}`
  }

  return fileUrl(itemIdentifier(item), fileName)
}

function itemServer(item) {
  const servers = item?.workable_servers ?? []
  return cleanText(servers[0] || item?.d1 || item?.d2 || item?.server)
}

function detailsUrl(identifier) {
  return `${BASE_URL}/details/${encodeURIComponent(identifier)}`
}

function itemUrl(identifier, media = MEDIA.BOTH) {
  return `archiveorg://item/${encodeURIComponent(identifier)}/${mediaSlug(media)}`
}

function playlistUrl(identifier, media = MEDIA.BOTH) {
  return `archiveorg://playlist/${encodeURIComponent(identifier)}/${mediaSlug(media)}`
}

function contentUrl(identifier, fileName) {
  return `archiveorg://content/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`
}

function mediaFromUrl(url) {
  const match = url.match(REGEX.ITEM) ?? url.match(REGEX.PLAYLIST)
  if (match?.[2] === 'audio') {
    return MEDIA.AUDIO
  }
  if (match?.[2] === 'video') {
    return MEDIA.VIDEO
  }

  return MEDIA.BOTH
}

function mediaSlug(media) {
  if (media === MEDIA.AUDIO) {
    return 'audio'
  }
  if (media === MEDIA.VIDEO) {
    return 'video'
  }

  return 'both'
}

function encodePath(value) {
  return String(value ?? '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

function sourceName(file) {
  return cleanText(file.format || file.name || 'Archive.org media')
}

function audioContainer(file) {
  const name = String(file.name ?? '').toLowerCase()
  if (name.endsWith('.ogg') || name.endsWith('.oga')) {
    return 'audio/ogg'
  }
  if (name.endsWith('.flac')) {
    return 'audio/flac'
  }

  return 'audio/mpeg'
}

function audioCodec(file) {
  const name = String(file.name ?? '').toLowerCase()
  if (name.endsWith('.ogg') || name.endsWith('.oga')) {
    return 'vorbis'
  }
  if (name.endsWith('.flac')) {
    return 'flac'
  }

  return 'mp3'
}

function videoContainer(file) {
  const name = String(file.name ?? '').toLowerCase()
  if (name.endsWith('.ogv')) {
    return 'video/ogg'
  }

  return name.endsWith('.webm') ? 'video/webm' : 'video/mp4'
}

function videoCodec(file) {
  const name = String(file.name ?? '').toLowerCase()
  if (name.endsWith('.ogv')) {
    return 'theora'
  }

  return name.endsWith('.webm') ? 'vp9' : 'h264'
}

function durationSeconds(value) {
  if (typeof value === 'number') {
    return value
  }

  const text = String(value ?? '')
  if (!text) {
    return 0
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text)
  }

  return text
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + (part || 0), 0)
}

function bitrateBitsPerSecond(file) {
  const explicit = Number(file.bitrate || file.bps || 0)
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit)
  }

  const size = Number(file.size || 0)
  const duration = durationSeconds(file.length || file.runtime)
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return Math.round((size * 8) / duration)
}

function unixDate(value) {
  const time = Date.parse(String(value ?? ''))
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0
}

function naturalName(value) {
  return String(value ?? '').replace(/\d+/g, (number) => number.padStart(10, '0'))
}

function arrayText(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(', ') : cleanText(value)
}

function cleanText(value) {
  return clean_text(value)
}

function normalize(value) {
  return normalize_text(value)
}

function normalizeSearch(value) {
  return normalize_search_text(value)
}

function searchTerms(value) {
  const stopWords = ['the', 'and', 'or', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'with', 'by', 'بن', 'ابن']
  return dedupeStrings(
    normalizeSearch(value)
      .split(' ')
      .filter((term) => term.length > 1 && stopWords.indexOf(term) < 0)
  )
}

function escapeSearch(value) {
  return cleanText(value).replace(/["()]/g, ' ')
}

function dedupeStrings(values) {
  const seen = {}
  const result = []
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text && !seen[text]) {
      seen[text] = true
      result.push(text)
    }
  }
  return result
}

function logIfTesting(msg) {
  if (typeof IS_TESTING !== 'undefined' && IS_TESTING) {
    log(msg)
  }
}
