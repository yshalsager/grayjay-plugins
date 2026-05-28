import { describe, expect, it } from 'vitest'
import { clean_text, decode_html, normalize_search_text, normalize_text } from '@lib/text.js'

describe('text helpers', () => {
  it('strips markup, decodes entities, and normalizes whitespace', () => {
    expect(clean_text('  <em>Quran</em>&nbsp;&amp;  Sunnah  ')).toBe('Quran & Sunnah')
    expect(decode_html('&quot;test&#039; &lt;ok&gt;')).toBe('"test\' <ok>')
  })

  it('normalizes latin accents and arabic search variants', () => {
    expect(normalize_text('  Café  ')).toBe('cafe')
    expect(normalize_search_text('إِختبارُ التلاوة')).toBe('اختبار التلاوه')
  })
})
