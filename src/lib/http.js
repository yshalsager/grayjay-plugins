export function get_response(url, headers = {}, useAuth = false) {
  const response = http.GET(url, headers, useAuth)
  if (!response.isOk) {
    throw new ScriptException(`Request failed with code ${response.code}: ${url}`)
  }
  return response
}

export function get_text(url, headers = {}, useAuth = false) {
  return get_response(url, headers, useAuth).body
}

export function get_json(url, headers = {}, useAuth = false) {
  return JSON.parse(get_text(url, headers, useAuth))
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
