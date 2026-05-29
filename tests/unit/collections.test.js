import { describe, expect, it } from 'vitest'
import { dedupe_by, dedupe_by_url, dedupe_strings } from '@lib/collections.js'

describe('collection helpers', () => {
  it('dedupes items by key, URL, and normalized strings', () => {
    expect(dedupe_by([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => item.id)).toEqual([{ id: 1 }, { id: 2 }])
    expect(dedupe_by_url([{ url: 'a' }, { contentUrl: 'a' }, { url: 'b' }])).toEqual([{ url: 'a' }, { url: 'b' }])
    expect(dedupe_strings(['A', 'a', 'B'], (value) => value.toLowerCase())).toEqual(['A', 'B'])
  })
})
