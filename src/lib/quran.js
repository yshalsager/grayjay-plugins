export function quran_name(item, language = 'ar') {
  if (typeof item?.name === 'object') {
    return String(item.name[language] ?? item.name.ar ?? item.name.en ?? Object.values(item.name)[0] ?? '').trim()
  }

  if (item?.name) return String(item.name).trim()
  if (language === 'ar') return String(item?.name_arabic ?? item?.translated_name?.name ?? item?.name_simple ?? '').trim()
  return String(item?.translated_name?.name ?? item?.name_simple ?? item?.name_arabic ?? '').trim()
}

export function quran_filter_label(item, language = 'ar') {
  return `${quran_name(item, language)} (${item.id})`
}

export function quran_id_from_filter(value, items, language = 'ar', aliases = () => []) {
  const text = String(value ?? '').trim()
  const directId = Number(text)
  if (directId) return directId

  const trailingId = Number(text.match(/\((\d+)\)$/)?.[1])
  if (trailingId) return trailingId

  return Number(
    (items ?? []).find((item) => {
      const names = [quran_filter_label(item, language), quran_name(item, language), ...aliases(item)]
      return names.some((name) => name === text)
    })?.id
  )
}

export function verse_reference(query) {
  const match = String(query ?? '')
    .trim()
    .match(/^(\d{1,3})\s*[:/]\s*(\d{1,3})$/)
  if (!match) return null
  return {
    chapter: Number(match[1]),
    ayah: Number(match[2])
  }
}
