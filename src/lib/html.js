export function extract_first(value, regex) {
  const match = String(value ?? '').match(regex)
  return match ? match[1] : null
}

export function last_match(value, regex) {
  let result = null
  let match
  regex.lastIndex = 0
  while ((match = regex.exec(String(value ?? ''))) !== null) {
    result = match[1]
  }
  return result
}

export function escape_html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function external_embed_html({ language = 'en', title = '', description = '', embedUrl = '', linkUrl = '', linkLabel = 'Source' }) {
  return [
    '<!doctype html>',
    `<html lang="${escape_html(language)}">`,
    '<head><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body>',
    title ? `<h1>${escape_html(title)}</h1>` : '',
    description ? `<p>${escape_html(description)}</p>` : '',
    embedUrl
      ? `<iframe width="100%" height="315" src="${escape_html(embedUrl)}" title="${escape_html(title)}" frameborder="0" allowfullscreen></iframe>`
      : '',
    linkUrl ? `<p><a href="${escape_html(linkUrl)}">${escape_html(linkLabel)}</a></p>` : '',
    '</body></html>'
  ]
    .filter(Boolean)
    .join('')
}
