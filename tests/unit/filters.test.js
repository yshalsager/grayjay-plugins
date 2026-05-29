import { describe, expect, it } from 'vitest'
import { selected_filter_values } from '@lib/filters.js'

describe('filter helpers', () => {
  it('normalizes object, map, and array filter shapes to values', () => {
    expect(selected_filter_values({ content: { value: 'audio' } }, 'content')).toEqual(['audio'])
    expect(selected_filter_values(new Map([['content', [{ id: 'video' }]]]), 'content')).toEqual(['video'])
    expect(selected_filter_values([{ group: { id: 'content' }, value: 'live' }], 'content')).toEqual(['live'])
  })
})
