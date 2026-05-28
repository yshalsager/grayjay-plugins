import { plugin_icon_url, static_thumbnails } from '@lib/assets.js'
import { grayjay_platform } from '@lib/grayjay.js'
import { array_pager_class } from '@lib/paging.js'

const PLATFORM = __LABEL_JSON__
const DEFAULT_ICON = __DEFAULT_ICON_JSON__
const DEFAULT_LIMIT = 24

let _config = {}
const grayjay = grayjay_platform(PLATFORM, () => _config.id)

source.enable = function (conf, _settings, _savedState) {
  _config = conf ?? {}
}

source.saveState = function () {
  return '{}'
}

source.getHome = function () {
  return new ArrayVideoPager([], DEFAULT_LIMIT)
}

source.getSearchCapabilities = () => ({
  types: [Type.Feed.Mixed],
  sorts: [Type.Order.Chronological],
  filters: []
})

source.searchSuggestions = function (_query) {
  return []
}

source.search = function (_query, _type, _order, _filters) {
  return new ArrayVideoPager([], DEFAULT_LIMIT)
}

source.isChannelUrl = function (url) {
  return url === __PLATFORM_URL_JSON__
}

source.getChannel = function (_url) {
  return grayjay.channel('root', {
    name: PLATFORM,
    thumbnail: iconUrl(),
    banner: iconUrl(),
    description: __DESCRIPTION_JSON__,
    url: __PLATFORM_URL_JSON__,
    urlAlternatives: [__PLATFORM_URL_JSON__]
  })
}

source.getChannelContents = function (_url, _type, _order, _filters) {
  return source.getHome()
}

source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities()
source.getChannelCapabilities = () => source.getSearchCapabilities()
source.getPeekChannelTypes = () => ['Home']

source.peekChannelContents = function (_url, _type) {
  return source.getHome().results.slice(0, 6)
}

source.searchChannelContents = function (_url, query, type, order, filters) {
  return source.search(query, type, order, filters)
}

source.searchChannels = function (_query) {
  return new ArrayChannelPager([source.getChannel(__PLATFORM_URL_JSON__)], DEFAULT_LIMIT)
}

source.isPlaylistUrl = function (_url) {
  return false
}

source.searchPlaylists = function (_query, _type, _order, _filters) {
  return new ArrayPlaylistPager([], DEFAULT_LIMIT)
}

source.getPlaylist = function (_url) {
  throw new ScriptException('Unsupported ' + PLATFORM + ' playlist URL')
}

source.getChannelPlaylists = function (_url) {
  return new ArrayPlaylistPager([], DEFAULT_LIMIT)
}

source.isContentDetailsUrl = function (_url) {
  return false
}

source.getContentDetails = function (_url) {
  throw new ScriptException('Unsupported ' + PLATFORM + ' URL')
}

function iconUrl() {
  return plugin_icon_url(_config, DEFAULT_ICON)
}

function thumbnails() {
  return static_thumbnails(_config, DEFAULT_ICON)
}

const ArrayVideoPager = array_pager_class(VideoPager)
const ArrayChannelPager = array_pager_class(ChannelPager)
const ArrayPlaylistPager = array_pager_class(PlaylistPager)

log('LOADED ' + PLATFORM + ' ' + thumbnails().sources.length)
