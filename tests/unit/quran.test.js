import { describe, expect, it } from 'vitest'
import { quran_filter_label, quran_id_from_filter, quran_name, verse_reference } from '@lib/quran.js'

describe('quran helpers', () => {
  it('formats and resolves localized surah labels', () => {
    const surahs = [{ id: 1, name: { ar: 'الفاتحة', en: 'Al-Fatihah' } }]

    expect(quran_name(surahs[0], 'en')).toBe('Al-Fatihah')
    expect(quran_filter_label(surahs[0], 'ar')).toBe('الفاتحة (1)')
    expect(quran_id_from_filter('الفاتحة (1)', surahs, 'ar')).toBe(1)
    expect(quran_id_from_filter('Al-Fatihah', surahs, 'en')).toBe(1)
  })

  it('parses verse references', () => {
    expect(verse_reference('2:255')).toEqual({ chapter: 2, ayah: 255 })
    expect(verse_reference('not a verse')).toBeNull()
  })
})
