import { clean_text, decode_html } from '@lib/text.js'

export function parse_inertia_page(html) {
  const raw = String(html ?? '').match(/<script\b[^>]*data-page=["']app["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!raw) return null
  return JSON.parse(decode_html(raw))
}

export function pick_playable_resource(item) {
  return (item?.resources ?? []).find(
    (resource) => ['audio', 'video'].indexOf(String(resource.type ?? '').toLowerCase()) >= 0 && resource.path
  )
}

export function pick_image(item) {
  const resources = item?.resources ?? []
  const image = resources.find((resource) => String(resource.type ?? '').toLowerCase() === 'image' && resource.path)
  if (image?.path) return image.path
  if (typeof item?.image === 'string') return item.image
  if (item?.image?.path) return item.image.path
  return ''
}

export function clean_midad_title(value) {
  return clean_text(value)
}
