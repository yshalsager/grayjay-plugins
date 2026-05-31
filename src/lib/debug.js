const REDACTED = '[redacted]'
const SENSITIVE_KEY = /authorization|cookie|token|secret|password|signature/i

export function is_testing() {
  return typeof IS_TESTING !== 'undefined' && IS_TESTING
}

export function debug_string(value, maxLength = 1200) {
  if (value === undefined) return ''
  const seen = []
  let text

  try {
    if (typeof value === 'string') {
      text = value
    } else if (value && typeof value === 'object' && typeof value.message === 'string') {
      text = value.stack || `${value.name || 'Error'}: ${value.message}`
    } else {
      text = JSON.stringify(value, (key, item) => {
        if (SENSITIVE_KEY.test(key)) return REDACTED
        if (item && typeof item === 'object') {
          if (seen.indexOf(item) >= 0) return '[circular]'
          seen.push(item)
        }
        return item
      })
    }
  } catch {
    text = String(value)
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

export function debug_log(scope, message, data) {
  if (!is_testing()) return

  const suffix = data === undefined ? '' : ` ${debug_string(data)}`
  const text = `[${scope}] ${message}${suffix}`
  if (typeof log === 'function') {
    log(text)
  }
}

export function debug_warn(scope, message, data) {
  debug_log(scope, `WARN ${message}`, data)
}

export function debug_error(scope, message, data) {
  debug_log(scope, `ERROR ${message}`, data)
}

export function debug_time(scope, label, fn) {
  const start = Date.now()
  try {
    return fn()
  } finally {
    debug_log(scope, `${label} completed in ${Date.now() - start}ms`)
  }
}
