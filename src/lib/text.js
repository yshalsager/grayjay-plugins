export function decode_html(value) {
  return String(value ?? '')
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

export function clean_text(value) {
  return decode_html(String(value ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalize_text(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function normalize_search_text(value) {
  return normalize_text(value)
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[إأآٱا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[^\w\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
