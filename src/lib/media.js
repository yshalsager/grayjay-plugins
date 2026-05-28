export function thumbnails(url) {
  return new Thumbnails([new Thumbnail(url, 0)])
}

export function audio_source_descriptor({
  name,
  url,
  language = 'Unknown',
  duration = 0,
  container = 'audio/mpeg',
  codec = 'mp3',
  bitrate = 0
}) {
  return audio_sources_descriptor([{ name, url, language, duration, container, codec, bitrate }])
}

export function audio_sources_descriptor(sources) {
  return new UnMuxVideoSourceDescriptor(
    [],
    sources.map(
      ({ name, url, language = 'Unknown', duration = 0, container = 'audio/mpeg', codec = 'mp3', bitrate = 0 }) =>
        new AudioUrlSource({
          name,
          bitrate,
          container,
          codec,
          duration,
          url,
          language
        })
    )
  )
}

export function video_source_descriptor({
  name,
  url,
  width = 0,
  height = 0,
  container = 'video/mp4',
  codec = 'h264',
  duration = 0,
  bitrate = 0
}) {
  return new VideoSourceDescriptor([
    new VideoUrlSource({
      name,
      width,
      height,
      container,
      codec,
      bitrate,
      duration,
      url
    })
  ])
}

export function hls_source({ name, url, language = '', duration = -1, priority = true }) {
  return new HLSSource({
    name,
    duration,
    url,
    priority,
    language
  })
}

export function hls_source_descriptor(source) {
  return new UnMuxVideoSourceDescriptor([source], [])
}
