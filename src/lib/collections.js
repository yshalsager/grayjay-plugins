export function dedupe_by(items, key) {
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

export function dedupe_by_url(items) {
  return dedupe_by(items, (item) => item.url ?? item.contentUrl)
}

export function dedupe_strings(values, key = (value) => value) {
  return dedupe_by(values, key)
}
