import { describe, expect, it } from 'vitest'
import { extract_first, last_match } from '@lib/html.js'

describe('html helpers', () => {
  it('extracts the first capture group safely', () => {
    expect(extract_first('<a href="/x">x</a>', /href="([^"]+)"/)).toBe('/x')
    expect(extract_first(null, /href="([^"]+)"/)).toBeNull()
  })

  it('returns the last capture from a global regex', () => {
    expect(last_match('<span>1</span><span>2</span>', /<span>(\d+)<\/span>/g)).toBe('2')
  })
})
