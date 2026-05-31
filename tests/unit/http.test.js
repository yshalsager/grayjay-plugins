import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cache_get, cache_set, get_json, get_text, init_lru_caches, post_json, post_text, query_string } from '@lib/http.js'

describe('http helpers', () => {
  beforeEach(() => {
    globalThis.ScriptException = class extends Error {}
    globalThis.http = {
      GET(url) {
        if (url.includes('fail')) {
          return { isOk: false, code: 404, body: 'not found' }
        }
        if (url.includes('bad-json')) {
          return { isOk: true, code: 200, body: '{' }
        }
        return { isOk: true, code: 200, body: url.includes('json') ? '{"ok":true}' : 'body' }
      },
      POST(url) {
        if (url.includes('fail')) {
          return { isOk: false, code: 500, body: 'bad post' }
        }
        return { isOk: true, code: 200, body: url.includes('json') ? '{"posted":true}' : 'posted' }
      }
    }
  })

  afterEach(() => {
    delete globalThis.IS_TESTING
    delete globalThis.log
  })

  it('fetches text and json with response checks', () => {
    expect(get_text('https://example.test/text')).toBe('body')
    expect(get_json('https://example.test/json')).toEqual({ ok: true })
    expect(() => get_text('https://example.test/fail')).toThrow(/Request failed with code 404/)
  })

  it('posts text and json with response checks', () => {
    expect(post_text('https://example.test/text')).toBe('posted')
    expect(post_json('https://example.test/json')).toEqual({ posted: true })
    expect(() => post_text('https://example.test/fail')).toThrow(/Request failed with code 500/)
  })

  it('logs request status and parse errors in testing mode', () => {
    globalThis.IS_TESTING = true
    globalThis.log = vi.fn()

    get_text('https://example.test/text')
    expect(globalThis.log).toHaveBeenCalledWith(expect.stringContaining('[http] HTTP OK'))

    expect(() => get_text('https://example.test/fail')).toThrow(/Request failed/)
    expect(globalThis.log).toHaveBeenCalledWith(expect.stringContaining('[http] HTTP failure'))
    expect(globalThis.log).toHaveBeenCalledWith(expect.stringContaining('not found'))

    expect(() => get_json('https://example.test/bad-json')).toThrow()
    expect(globalThis.log).toHaveBeenCalledWith(expect.stringContaining('[http] JSON parse failed'))
  })

  it('builds query strings and skips empty values', () => {
    expect(
      query_string([
        ['query', 'عبد الله'],
        ['page', 2],
        ['skip', null]
      ])
    ).toBe('query=%D8%B9%D8%A8%D8%AF%20%D8%A7%D9%84%D9%84%D9%87&page=2')
  })

  it('maintains bounded lru caches', () => {
    const state = {}
    const limits = { items: 2 }

    init_lru_caches(state, limits)
    cache_set(state, limits, 'items', 'a', 1)
    cache_set(state, limits, 'items', 'b', 2)
    cache_get(state, limits, 'items', 'a')
    cache_set(state, limits, 'items', 'c', 4)

    expect(state.items).toEqual({ a: 1, c: 4 })
    expect(state.cacheOrder.items).toEqual(['a', 'c'])
  })
})
