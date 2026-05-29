# Grayjay Plugins

[![Install MP3Quran](https://img.shields.io/badge/Install-MP3Quran-2ea44f)](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mp3quran/Mp3QuranConfig.json)
[![Install tvQuran](https://img.shields.io/badge/Install-tvQuran-2ea44f)](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/tvquran/TvQuranConfig.json)
[![Install Archive.org](https://img.shields.io/badge/Install-Archive.org-2ea44f)](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/archiveorg/ArchiveOrgConfig.json)
[![Install Mixlr](https://img.shields.io/badge/Install-Mixlr-2ea44f)](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mixlr/MixlrConfig.json)

[Grayjay](https://grayjay.app/) plugins in one repository. Current sources:

- `plugins/mp3quran`: [MP3Quran.net](https://mp3quran.net) reciters, moshaf playlists, surah tracks with ayah chapters/subtitles, tafsir audio/playlists, reminder video playlists, recent reads, live Quran radio streams, and live TV using the public v3 API.
- `plugins/tvquran`: [tvQuran.com](https://tvquran.com) Arabic/English/German recitation selections, category/collection playlists, reciter channels, direct collection links, richer category/video channel metadata, reciter/surah/category filters, direct MP3 links, recommendations, and nested YouTube video/live/prayer-recitation links from the public site pages.
- `plugins/archiveorg`: [Internet Archive](https://archive.org) search-only audio/video plugin with Archive.org item playlists, direct playable file details, and direct `/details` or `/download` URL handling.
- `plugins/mixlr`: [Mixlr](https://mixlr.com) public live audio channels/events, popular/category/search live feeds, channel search, direct channel/event URL handling, live MP3 playback, channel peeks, and recommendations.

Plugin icons are copied from the original source sites:

- MP3Quran: `https://www.mp3quran.net/img/logo2.png`
- tvQuran: `https://tvquran.com/bundles/tvquran/img/favicon/apple-touch-icon-144x144-precomposed.png`
- Archive.org: `https://archive.org/images/glogo.png`
- Mixlr: `https://mixlr.com/favicon.ico`

Install URLs need to point at hosted raw config files after publishing this repo. The config files currently target this GitHub raw layout:

- `https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mp3quran/Mp3QuranConfig.json`
- `https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/tvquran/TvQuranConfig.json`
- `https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/archiveorg/ArchiveOrgConfig.json`
- `https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mixlr/MixlrConfig.json`

## Playlist Support

- MP3Quran reciter channels expose one playlist per moshaf. Global playlist search also exposes tafsir-source playlists and video-type playlists.
- tvQuran category channels expose audio selection playlists, and reciter channels expose moshaf/collection playlists parsed from the reciter profile. tvQuran video categories stay as channel/content results because Grayjay playlist details require video items, while these entries are nested YouTube links.
- Direct tvQuran collection URLs are recognized as both channel URLs and playlist URLs, so shared collection links can open into either navigation surface depending on what Grayjay asks for.
- Archive.org exposes items as playlists, with each playable audio/video file represented as a playlist entry. It does not provide a home feed; use search to discover items.
- Mixlr is live-only in v1; it intentionally does not expose playlists until recordings or collections are implemented as concrete playable lists.

## MP3Quran Ayah Text

MP3Quran surah tracks use MP3Quran's ayah timing API for timed chapters. Quran text is fetched lazily per surah from `fawazahmed0/quran-api` using `ara-quransimple`.

Android clients that support plugin subtitle sources can use the generated WebVTT subtitle source. Grayjay Desktop currently plays direct MP3 audio through a path that does not attach external subtitles, so the plugin also includes the ayah text in chapter labels as the Desktop fallback.

## Development

### Android

Use Grayjay's Android DevServer while serving this repository from your computer on the same network.

1. Enable developer mode in Grayjay:
   - Open Grayjay on Android.
   - Go to `More` -> `Settings`.
   - Scroll to the bottom and tap `Version Code` repeatedly.

2. Start Grayjay DevServer:
   - In Grayjay settings, open `Developer Settings`.
   - Tap `Start Server`.
   - Note the phone IP address from Android Wi-Fi/network settings.

3. Serve this repo from your computer:

   ```sh
   cd <repo>
   pnpm run dev
   ```

4. Open the DevServer in your computer browser:

   ```text
   http://PHONE_IP:11337/dev
   ```

5. Load a plugin using your computer LAN IP, not `localhost`:

   ```text
   http://COMPUTER_IP:3000/plugins/mp3quran/Mp3QuranConfig.json
   http://COMPUTER_IP:3000/plugins/tvquran/TvQuranConfig.json
   http://COMPUTER_IP:3000/plugins/archiveorg/ArchiveOrgConfig.json
   http://COMPUTER_IP:3000/plugins/mixlr/MixlrConfig.json
   ```

6. In the DevServer UI:
   - Click `Load Plugin` to test individual methods.
   - Use the `Integration` tab and click `Inject Plugin` to test inside the Android app.
   - Click refresh or inject again after local edits.

The phone must be able to reach your computer over the LAN, and your firewall must allow inbound connections to port `3000`.

### Desktop

Use Grayjay Desktop's Developer Portal while serving this repository from your computer.

1. Enable developer mode by creating a `DEV` file in Grayjay Desktop's data directory.

   On macOS:

   ```sh
   mise run grayjay-desktop-dev-mode
   ```

   Restart Grayjay Desktop after creating the file.

2. Serve this repo from your computer:

   ```sh
   cd <repo>
   pnpm run dev
   ```

3. Find Grayjay Desktop's local server port:

   ```sh
   mise run grayjay-desktop-port
   ```

4. Open the Developer Portal in your browser:

   ```sh
   mise run grayjay-desktop-dev
   ```

5. Load a plugin using the local config URL:

   ```text
   http://127.0.0.1:3000/plugins/mp3quran/Mp3QuranConfig.json
   http://127.0.0.1:3000/plugins/tvquran/TvQuranConfig.json
   http://127.0.0.1:3000/plugins/archiveorg/ArchiveOrgConfig.json
   http://127.0.0.1:3000/plugins/mixlr/MixlrConfig.json
   ```

6. In the Developer Portal:
   - Click `Load Plugin` to test individual methods.
   - Use the `Integration` tab and click `Inject Plugin` to test inside Grayjay Desktop.
   - Click refresh or inject again after local edits.

Signing is not needed during local development. Grayjay Desktop normally listens on loopback with a random port written to the `port` file. Desktop also has a `--server` mode that binds to all IPs on port `11338`, but it has no built-in security and should only be used deliberately.

### Validation

```sh
pnpm run validate
```

### Style and Lint

```sh
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run check
```

`check` runs formatting, linting, and validation.

### Git Hooks

Install Lefthook once after cloning:

```sh
lefthook install
```

The pre-commit hook runs `pnpm run format`, `pnpm run lint:fix`, and `pnpm run validate`, then stages fixed files.

### Bump and Signing

Bump versions and sign scripts only after final script edits, because any script change invalidates the signature.

Install local tooling once:

```sh
pnpm install
```

```sh
pnpm run bump
pnpm run sign
pnpm run sign-bump
```

The prompted tasks let you select plugins, enter changelog entries when bumping, and choose a signing key when signing. The signing key defaults to `$GRAYJAY_SIGN_KEY`. `bump` writes the next `version` and `changelog`, `sign` writes `scriptSignature` and `scriptPublicKey`, and `sign-bump` does both in one flow.

The same tasks can run non-interactively:

```sh
pnpm run bump -- --plugin mp3quran --message "Release notes" --yes --no-input
pnpm run sign -- --plugin all --key ~/.ssh/ysh --yes --no-input
pnpm run sign-bump -- --plugin all --message "Release notes" --key ~/.ssh/ysh --yes --no-input
```

Use `--dry-run` to preview without writing files. `--plugin` accepts `mp3quran`, `tvquran`, `archiveorg`, `mixlr`, or `all`, and can be repeated or comma-separated.

## Sources

- [Plugin repository target](https://github.com/yshalsager/grayjay-plugins)
- [MP3Quran install config](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mp3quran/Mp3QuranConfig.json)
- [tvQuran install config](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/tvquran/TvQuranConfig.json)
- [MP3Quran website](https://mp3quran.net)
- [MP3Quran API docs](https://mp3quran.net/ar/api)
- [MP3Quran API base](https://www.mp3quran.net/api/v3)
- [MP3Quran ayah timing reads](https://www.mp3quran.net/api/v3/ayat_timing/reads)
- [tvQuran website](https://tvquran.com)
- [Quran text repository](https://github.com/fawazahmed0/quran-api)
- [Quran text CDN pattern](https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quransimple/{surah}.min.json)
- [Internet Archive metadata API](https://archive.org/developers/md-read.html)
- [Internet Archive files, formats, and derivatives guide](https://help.archive.org/help/files-formats-and-derivatives-a-basic-guide/)
- [Internet Archive search API](https://doc-tools.readthedocs.io/en/ia-test-gsod/item-search-apis.html)
- [Grayjay plugin development docs](https://gitlab.futo.org/videostreaming/grayjay/-/blob/master/plugin-development.md)
- [Grayjay sample plugin](https://gitlab.futo.org/videostreaming/plugins/sample)
- [Grayjay RadioBrowser plugin](https://gitlab.futo.org/videostreaming/plugins/radiobrowser)

## License

This repository is licensed under the GNU Affero General Public License v3.0 or later. See `LICENSE`.
