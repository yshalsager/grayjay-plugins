export function extract_first(value, regex) {
  const match = String(value ?? '').match(regex)
  return match ? match[1] : null
}

export function last_match(value, regex) {
  let result = null
  let match
  regex.lastIndex = 0
  while ((match = regex.exec(String(value ?? ''))) !== null) {
    result = match[1]
  }
  return result
}
