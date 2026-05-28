import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import { load_plugin_registry } from '@scripts/plugin-registry.mjs'

const root_dir = new URL('../../../', import.meta.url).pathname

class PlatformID {
  constructor(platform, value, pluginId) {
    this.platform = platform
    this.value = value
    this.id = value
    this.pluginId = pluginId
  }
}

class Thumbnail {
  constructor(url, quality) {
    this.url = url
    this.quality = quality
  }
}

class Thumbnails {
  constructor(thumbnails) {
    this.thumbnails = thumbnails ?? []
    this.sources = this.thumbnails
  }
}

class PlatformAuthorLink {
  constructor(id, name, url, thumbnail) {
    this.id = id
    this.name = name
    this.url = url
    this.thumbnail = thumbnail
  }
}

class ObjectModel {
  constructor(fields = {}) {
    Object.assign(this, fields)
  }
}

class PlatformVideo extends ObjectModel {}
class PlatformVideoDetails extends ObjectModel {}
class PlatformNestedMediaContent extends ObjectModel {}
class PlatformChannel extends ObjectModel {}
class PlatformPlaylist extends ObjectModel {}
class PlatformPlaylistDetails extends ObjectModel {}
class AudioUrlSource extends ObjectModel {}
class VideoUrlSource extends ObjectModel {}
class HLSSource extends ObjectModel {}

class UnMuxVideoSourceDescriptor {
  constructor(videoSources = [], audioSources = []) {
    this.videoSources = videoSources
    this.audioSources = audioSources
    this.videos = videoSources
    this.audio = audioSources
  }
}

class VideoSourceDescriptor {
  constructor(sources = []) {
    this.sources = sources
    this.videoSources = sources
  }
}

class Pager {
  constructor(results = [], hasMore = false, context = {}) {
    this.results = results
    this.hasMore = hasMore
    this.context = context
  }
}

class VideoPager extends Pager {}
class ChannelPager extends Pager {}
class PlaylistPager extends Pager {}

class ScriptException extends Error {}

const Type = {
  Feed: {
    Mixed: 'Mixed'
  },
  Order: {
    Chronological: 'Chronological',
    Popularity: 'Popularity'
  },
  Chapter: {
    NORMAL: 'NORMAL'
  }
}

const curl_get = (url, headers = {}) => {
  const marker = '\n__GRAYJAY_LIVE_TEST_HTTP_CODE__'
  const args = [
    '-L',
    '-sS',
    '--max-time',
    process.env.LIVE_TEST_HTTP_TIMEOUT ?? '35',
    '-w',
    `${marker}%{http_code}`,
    '-A',
    'grayjay-live-tests'
  ]

  for (const [name, value] of Object.entries(headers ?? {})) {
    args.push('-H', `${name}: ${value}`)
  }

  args.push(url)

  try {
    const output = execFileSync('curl', args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    })
    const index = output.lastIndexOf(marker)
    const body = index >= 0 ? output.slice(0, index) : output
    const code = index >= 0 ? Number(output.slice(index + marker.length)) : 0

    return {
      code,
      body,
      isOk: code >= 200 && code < 300,
      headers: {}
    }
  } catch (error) {
    return {
      code: 0,
      body: error.stdout?.toString?.() ?? error.message,
      isOk: false,
      headers: {}
    }
  }
}

export async function load_plugin(name, settings = {}) {
  const plugin = (await load_plugin_registry()).find((item) => item.value === name)
  if (!plugin) {
    throw new Error(`Unknown plugin: ${name}`)
  }

  const config_path = join(root_dir, plugin.config_path)
  const script_path = join(root_dir, plugin.script_path)
  const config = JSON.parse(await readFile(config_path, 'utf8'))
  const script = await readFile(script_path, 'utf8')
  const source = {}
  const logs = []
  const context = {
    AudioUrlSource,
    ChannelPager,
    HLSSource,
    IS_TESTING: true,
    PlatformAuthorLink,
    PlatformChannel,
    PlatformID,
    PlatformNestedMediaContent,
    PlatformPlaylist,
    PlatformPlaylistDetails,
    PlatformVideo,
    PlatformVideoDetails,
    PlaylistPager,
    ScriptException,
    Thumbnail,
    Thumbnails,
    Type,
    UnMuxVideoSourceDescriptor,
    VideoPager,
    VideoSourceDescriptor,
    VideoUrlSource,
    bridge: {
      buildVersion: 'live-test'
    },
    console,
    http: {
      GET: curl_get
    },
    log: (message) => logs.push(String(message)),
    source
  }

  vm.runInNewContext(script, context, {
    filename: script_path,
    displayErrors: true
  })

  const runtime_config = {
    ...config,
    sourceUrl: `file://${config_path}`,
    absoluteIconUrl: `file://${join(dirname(config_path), config.iconUrl.replace(/^\.\//, ''))}`
  }

  source.enable(runtime_config, settings, null)

  return {
    config: runtime_config,
    logs,
    source,
    Type
  }
}
