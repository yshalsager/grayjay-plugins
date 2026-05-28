import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

export function assert_pager(pager, label) {
  assert.ok(pager, `${label}: expected pager`)
  assert.ok(Array.isArray(pager.results), `${label}: expected results array`)
  assert.ok(pager.results.length > 0, `${label}: expected at least one result`)
  assert.equal(typeof pager.hasMore, 'boolean', `${label}: expected boolean hasMore`)
  return pager.results
}

export function assert_item(item, label) {
  assert.ok(item, `${label}: expected item`)
  assert.ok(non_empty(item.name ?? item.contentName), `${label}: expected name`)
  assert.ok(non_empty(item.url ?? item.contentUrl), `${label}: expected URL`)
  return item
}

export function assert_channel(channel, label) {
  assert_item(channel, label)
  assert.ok(non_empty(channel.thumbnail), `${label}: expected thumbnail`)
  assert.ok(Array.isArray(channel.urlAlternatives), `${label}: expected URL alternatives`)
  return channel
}

export function assert_playlist(playlist, label) {
  assert_item(playlist, label)
  assert.ok(playlist.thumbnails, `${label}: expected thumbnails`)
  return playlist
}

export function assert_details(details, label) {
  assert_item(details, label)
  assert.ok(details.author, `${label}: expected author`)
  assert.ok(details.thumbnails || details.contentThumbnails, `${label}: expected thumbnails`)
  return details
}

export function assert_next_page(pager, label) {
  assert_pager(pager, label)
  if (!pager.hasMore) {
    return null
  }

  const next = pager.nextPage()
  assert_pager(next, `${label} next page`)
  return next
}

export function media_sources(item) {
  const sources = []
  const descriptor = item.video

  if (item.live) {
    sources.push(item.live)
  }

  if (descriptor?.sources) {
    sources.push(...descriptor.sources)
  }
  if (descriptor?.videoSources) {
    sources.push(...descriptor.videoSources)
  }
  if (descriptor?.audioSources) {
    sources.push(...descriptor.audioSources)
  }
  if (descriptor?.videos) {
    sources.push(...descriptor.videos)
  }
  if (descriptor?.audio) {
    sources.push(...descriptor.audio)
  }

  return dedupe(
    sources.filter((source) => source?.url),
    (source) => source.url
  )
}

export function assert_has_media(item, label) {
  if (item.contentUrl) {
    assert.ok(/^https?:\/\//.test(item.contentUrl), `${label}: expected nested media contentUrl`)
    return []
  }

  const sources = media_sources(item)
  assert.ok(sources.length > 0, `${label}: expected media source`)
  for (const source of sources) {
    assert.ok(/^https?:\/\//.test(source.url), `${label}: expected HTTP media URL: ${source.url}`)
  }
  return sources
}

export async function assert_reachable_url(url, label) {
  const code = Number(
    execFileSync(
      'curl',
      [
        '-L',
        '-sS',
        '--max-time',
        String(process.env.LIVE_TEST_MEDIA_TIMEOUT_SECONDS ?? 15),
        '--range',
        '0-0',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        url
      ],
      {
        encoding: 'utf8'
      }
    )
  )

  assert.ok((code >= 200 && code < 300) || code === 416, `${label}: expected reachable media URL ${url}, got ${code}`)
}

export async function assert_first_media_reachable(item, label) {
  const sources = assert_has_media(item, label)
  if (!sources.length) {
    return
  }

  await assert_reachable_url(sources[0].url, label)
}

export function find_by_url_part(items, part) {
  return items.find((item) => String(item.url ?? item.contentUrl ?? '').includes(part))
}

export function first_filter_value(capabilities, id) {
  const filter = capabilities.filters.find((item) => item.id === id)
  assert.ok(filter, `expected filter ${id}`)
  assert.ok(filter.filters.length > 0, `expected filter ${id} values`)
  return filter.filters[0].value
}

function non_empty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function dedupe(items, key) {
  const seen = new Set()
  return items.filter((item) => {
    const value = key(item)
    if (seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}
