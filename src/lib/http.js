import { debug_log, debug_string } from '@lib/debug.js'

const BODY_PREVIEW_LENGTH = 500

export function get_response(url, headers = {}, useAuth = false, debugContext = null) {
  const response = request('GET', url, '', headers, useAuth, debugContext)
  if (!response.isOk) {
    throw request_error(response, url)
  }
  return response
}

export function get_text(url, headers = {}, useAuth = false, debugContext = null) {
  return get_response(url, headers, useAuth, debugContext).body
}

export function get_json(url, headers = {}, useAuth = false, debugContext = null) {
  const text = get_text(url, headers, useAuth, debugContext)
  try {
    return JSON.parse(text)
  } catch (e) {
    debug_log(debug_scope(debugContext), 'JSON parse failed', {
      url,
      error: String(e),
      preview: debug_string(text, BODY_PREVIEW_LENGTH)
    })
    throw e
  }
}

export function post_text(url, body = '', headers = {}, useAuth = false, debugContext = null) {
  const response = request('POST', url, body, headers, useAuth, debugContext)
  if (!response.isOk) {
    throw request_error(response, url)
  }
  return response.body
}

export function post_json(url, body = '', headers = {}, useAuth = false, debugContext = null) {
  const text = post_text(url, body, headers, useAuth, debugContext)
  try {
    return JSON.parse(text)
  } catch (e) {
    debug_log(debug_scope(debugContext), 'JSON parse failed', {
      url,
      error: String(e),
      preview: debug_string(text, BODY_PREVIEW_LENGTH)
    })
    throw e
  }
}

export function query_string(params) {
  return params
    .filter((item) => item[1] !== null && item[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

export function init_lru_caches(state, limits) {
  state.cacheOrder = state.cacheOrder ?? {}

  for (const cacheName of Object.keys(limits)) {
    state[cacheName] = state[cacheName] ?? {}
    if (!Array.isArray(state.cacheOrder[cacheName])) {
      state.cacheOrder[cacheName] = Object.keys(state[cacheName])
    }
    prune_lru_cache(state, limits, cacheName)
  }
}

export function cache_set(state, limits, cacheName, key, value) {
  if (!key) {
    return value
  }

  state[cacheName] = state[cacheName] ?? {}
  state.cacheOrder = state.cacheOrder ?? {}
  state.cacheOrder[cacheName] = Array.isArray(state.cacheOrder[cacheName]) ? state.cacheOrder[cacheName] : Object.keys(state[cacheName])

  const cacheKey = String(key)
  const order = state.cacheOrder[cacheName]
  const previousIndex = order.indexOf(cacheKey)
  if (previousIndex >= 0) {
    order.splice(previousIndex, 1)
  }

  state[cacheName][cacheKey] = value
  order.push(cacheKey)
  prune_lru_cache(state, limits, cacheName)
  return value
}

export function cache_get(state, limits, cacheName, key) {
  const cacheKey = String(key)
  const value = state[cacheName]?.[cacheKey]
  if (value !== undefined) {
    cache_set(state, limits, cacheName, cacheKey, value)
  }
  return value
}

export function prune_lru_cache(state, limits, cacheName) {
  const limit = limits[cacheName]
  const order = state.cacheOrder?.[cacheName]
  if (!limit || !Array.isArray(order)) {
    return
  }

  while (order.length > limit) {
    const key = order.shift()
    if (key) {
      delete state[cacheName][key]
    }
  }
}

function request(method, url, body, headers, useAuth, debugContext = null) {
  const start = Date.now()
  try {
    const response = method === 'POST' ? http.POST(url, body, headers, useAuth) : http.GET(url, headers, useAuth)
    log_response(method, url, response, Date.now() - start, debugContext)
    return response
  } catch (e) {
    debug_log(debug_scope(debugContext), 'HTTP exception', {
      method,
      url,
      ms: Date.now() - start,
      error: String(e)
    })
    throw e
  }
}

function log_response(method, url, response, ms, debugContext) {
  const details = {
    method,
    url,
    code: response?.code,
    ms,
    bytes: body_length(response)
  }

  if (response?.isOk) {
    debug_log(debug_scope(debugContext), 'HTTP OK', details)
    return
  }

  debug_log(debug_scope(debugContext), 'HTTP failure', {
    ...details,
    preview: body_preview(response)
  })
}

function request_error(response, url) {
  return new ScriptException(`Request failed with code ${response.code}: ${url}`)
}

function debug_scope(debugContext) {
  if (!debugContext) return 'http'
  if (typeof debugContext === 'string') return debugContext
  return debugContext.scope || 'http'
}

function body_length(response) {
  const body = response?.body
  if (typeof body === 'string') return body.length
  return body?.length ?? body?.byteLength ?? 0
}

function body_preview(response) {
  const body = response?.body
  return typeof body === 'string' ? debug_string(body, BODY_PREVIEW_LENGTH) : ''
}
