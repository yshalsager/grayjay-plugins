import { describe, expect, it } from 'vitest'
import { apply_pager_state, array_pager_class, empty_pager_class } from '@lib/paging.js'

class BasePager {
  constructor(results, hasMore, context) {
    this.results = results
    this.hasMore = hasMore
    this.context = context
  }
}

describe('paging helpers', () => {
  it('creates array-backed pagers with stable nextPage mutation', () => {
    const ArrayPager = array_pager_class(BasePager)
    const pager = new ArrayPager([1, 2, 3], 2)

    expect(pager.results).toEqual([1, 2])
    expect(pager.hasMore).toBe(true)
    expect(pager.nextPage()).toBe(pager)
    expect(pager.results).toEqual([3])
    expect(pager.hasMore).toBe(false)
  })

  it('creates empty pagers for unsupported surfaces', () => {
    const EmptyPager = empty_pager_class(BasePager)
    const pager = new EmptyPager()

    expect(pager.results).toEqual([])
    expect(pager.hasMore).toBe(false)
    expect(pager.nextPage()).toBe(pager)
  })

  it('applies next pager state to an existing pager', () => {
    const current = new BasePager([1], true, { page: 1 })
    const next = new BasePager([2], false, { page: 2 })

    expect(apply_pager_state(current, next)).toBe(current)
    expect(current).toMatchObject({ results: [2], hasMore: false, context: { page: 2 } })
  })
})
