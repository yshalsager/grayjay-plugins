import { afterEach, describe, expect, it, vi } from 'vitest'
import { debug_log, debug_string, is_testing } from '@lib/debug.js'

afterEach(() => {
  delete globalThis.IS_TESTING
  delete globalThis.log
})

describe('debug helpers', () => {
  it('logs only when Grayjay testing mode is enabled', () => {
    const log = vi.fn()
    globalThis.log = log

    debug_log('scope', 'hidden')
    expect(log).not.toHaveBeenCalled()

    globalThis.IS_TESTING = true
    debug_log('scope', 'visible')
    expect(log).toHaveBeenCalledWith('[scope] visible')
    expect(is_testing()).toBe(true)
  })

  it('redacts sensitive fields and truncates long payloads', () => {
    const text = debug_string(
      {
        ok: true,
        authorization: 'Bearer abc',
        nested: { cookie: 'session=abc' },
        body: 'x'.repeat(20)
      },
      80
    )

    expect(text).toContain('"authorization":"[redacted]"')
    expect(text).toContain('"cookie":"[redacted]"')
    expect(text.length).toBeLessThanOrEqual(83)
  })

  it('keeps useful error messages', () => {
    expect(debug_string(new Error('network failed'))).toContain('network failed')
  })
})
