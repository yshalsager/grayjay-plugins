export function grayjay_platform(platform, get_config_id) {
  const platform_id = (id) => new PlatformID(platform, String(id), get_config_id())

  return {
    id: platform_id,

    author(id, name, url, thumbnail) {
      return new PlatformAuthorLink(platform_id(id), name, url, thumbnail)
    },

    feed_video(id, value) {
      return new PlatformVideo({ id: platform_id(id), ...value })
    },

    video(id, value) {
      return new PlatformVideoDetails({ id: platform_id(id), ...value })
    },

    nested(id, value) {
      return new PlatformNestedMediaContent({ id: platform_id(id), ...value })
    },

    channel(id, value) {
      return new PlatformChannel({ id: platform_id(id), subscribers: 0, ...value })
    },

    playlist(id, value) {
      return new PlatformPlaylist({ id: platform_id(id), ...value })
    },

    playlist_details(id, value) {
      return new PlatformPlaylistDetails({ id: platform_id(id), ...value })
    }
  }
}
