import { thumbnails } from '@lib/media.js'

export function plugin_asset(config, path) {
  const url = String(path ?? '')
  if (/^https?:\/\//.test(url)) {
    return url
  }

  const base = String(config?.sourceUrl ?? '').replace(/\/[^/]*$/, '/')
  return base ? `${base}${url.replace(/^\.\//, '')}` : url
}

export function plugin_icon_url(config, default_icon) {
  return config?.absoluteIconUrl ?? plugin_asset(config, config?.iconUrl ?? default_icon)
}

export function static_thumbnails(config, default_icon) {
  return thumbnails(plugin_icon_url(config, default_icon))
}

export function content_thumbnails(config, default_icon, url) {
  return thumbnails(url || plugin_icon_url(config, default_icon))
}
