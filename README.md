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

Plugin icons come from the original source sites:

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

   The dev server rebuilds plugin scripts when `src/**` or `plugins/registry.json` changes, then serves the generated files from `plugins/**`.

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

   The dev server rebuilds plugin scripts when `src/**` or `plugins/registry.json` changes, then serves the generated files from `plugins/**`.

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

Signing is not needed during local development. Grayjay Desktop normally listens on loopback with a random port written to the `port` file. Desktop also has a `--server` mode that binds on port `11338`.

#### Desktop Debugging Notes

Desktop has two useful log surfaces, and they show different failures:

```sh
tail -n 200 "$HOME/Library/Application Support/Grayjay/log.txt"
curl -sS "http://127.0.0.1:$(cat "$HOME/Library/Application Support/Grayjay/port")/Developer/GetDevLogs?index=0"
```

`log.txt` is the backend log. The Developer log endpoint is available without the private UI token and shows plugin method calls such as `search`, `isContentDetailsUrl`, and `getContentDetails`. A successful `getContentDetails` only proves the plugin returned a details object; it does not prove Desktop selected a source or the CEF media element started playback.

The normal player endpoints, including `/details/SourceAuto` and `/details/SourceProxy`, require Grayjay Desktop's private `_token` header. Direct `curl` calls without that token fail with `No valid token`, which is expected and not a plugin failure.

For endpoint debugging without copying the UI token, start Desktop server mode:

```sh
mise run grayjay-desktop-server-unsafe
```

That launches Grayjay Desktop with `--server --ignore-security` and exposes debug endpoints at:

```text
http://127.0.0.1:11338
```

Then inject the local dev plugin into that server-mode process:

```sh
mise run grayjay-load-dev-plugin -- --plugin archiveorg
```

This posts the local config from `http://127.0.0.1:3000/plugins/archiveorg/ArchiveOrgConfig.json`, rewrites the script URL to the local dev server, and enables the injected plugin as `DEV`.

Desktop API quick check:

```sh
base=http://127.0.0.1:11338
identifier='ARCHIVE_IDENTIFIER'
url="https%3A%2F%2Farchive.org%2Fdetails%2F$identifier"

curl -sS "$base/details/VideoLoad?url=$url"
curl -sS "$base/details/SourceAuto"
curl -sS "$base/Developer/GetDevLogs?index=0"
```

`VideoLoad` asks the enabled plugin for content details and stores that item as Desktop's current video. `SourceAuto` asks Desktop to choose the source it would hand to the player. For audio-only Archive items it should return `audioIndex: 0` and a direct `audio/*` URL; for video items it should return `videoIndex: 0` and a direct `video/*` URL.

To inspect a specific source index explicitly:

```sh
curl -sS "$base/details/SourceProxy?videoIndex=-1&audioIndex=0&subtitleIndex=-1&videoIsLocal=false&audioIsLocal=false&subtitleIsLocal=false&tag=debug"
```

When playback fails after `getContentDetails` succeeds:

- Open Grayjay Desktop devtools and check the browser console for `source auto`, `Direct url`, `Player error`, `HLS player error`, or `DashJS` messages. These are emitted by the Desktop web player and do not appear in the Developer log.
- Check whether the loaded config is the local dev URL in `lastDevUrl`:

  ```sh
  cat "$HOME/Library/Application Support/Grayjay/lastDevUrl"
  ```

- Rebuild before reinjecting; generated scripts are what Desktop loads:

  ```sh
  pnpm run build -- --plugin archiveorg
  ```

- Prefer direct Archive file hosts from metadata (`https://ia*.archive.org/.../items/...`) over `https://archive.org/download/...` redirect URLs for media sources. Desktop's player path is easier to debug when the final media URL is already resolved.
- If inspecting Desktop behavior, fetch the missing engine submodule/source separately. The Desktop repo references `Grayjay.Engine`; that source contains the JS-to-model conversion for `VideoSourceDescriptor`, `UnMuxVideoSourceDescriptor`, `VideoUrlSource`, and `AudioUrlSource`.

### Build Flow

Plugin source lives in `src/plugins/<plugin>/index.js`. Do not edit generated `plugins/<plugin>/*Script.js` files directly unless you are debugging generated output.

After source edits, rebuild the generated Grayjay scripts:

```sh
pnpm run build:all
```

For one plugin:

```sh
pnpm run build -- --plugin mp3quran
```

Commit both the source changes under `src/**` and the generated `plugins/**/*Script.js` output. Signing should happen only after this build step; validation and signing both fail when a source file is newer than its generated script.

### Scaffold Plugin

Create a new registry entry, config, source entry, generated script, and live test placeholder:

```sh
pnpm run scaffold -- --value midad --label "Midad" --stem Midad --platform-url https://midad.com
```

Run `pnpm run scaffold` without flags for an interactive prompt.

The same task is available through mise:

```sh
mise run scaffold -- --value midad --label "Midad" --stem Midad --platform-url https://midad.com
```

Use `--dry-run` to preview without writing files. Pass `--icon-url` when the default `/favicon.ico` is not suitable.

### Validation

```sh
pnpm run validate
```

Validation checks the source entry files, generated scripts, plugin configs, local icon paths, and source/script freshness.

### Style and Lint

```sh
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run check
```

`check` runs formatting, linting, `pnpm run build:all`, validation, and unit tests.

### Git Hooks

Install Lefthook once after cloning:

```sh
lefthook install
```

The pre-commit hook runs `pnpm run format`, `pnpm run lint:fix`, and `pnpm run validate`, then stages fixed files.

### Bump and Signing

Bump versions and sign scripts only after final source edits and `pnpm run build:all`, because any generated script change invalidates the signature.

Install local tooling once:

```sh
pnpm install
```

```sh
pnpm run bump
pnpm run sign
pnpm run sign-bump
```

The prompted tasks let you select plugins, enter changelog entries when bumping, and choose a signing key when signing. The signing key defaults to `$GRAYJAY_SIGN_KEY`. `bump` writes the next `version` and `changelog`, `sign` writes `scriptSignature` and `scriptPublicKey`, and `sign-bump` does both in one flow. Signing refuses stale generated scripts, so run the build first.

The same tasks can run non-interactively:

```sh
pnpm run bump -- --plugin mp3quran --message "Release notes" --yes --no-input
pnpm run sign -- --plugin all --key ~/.ssh/ysh --yes --no-input
pnpm run sign-bump -- --plugin all --message "Release notes" --key ~/.ssh/ysh --yes --no-input
```

Use `--dry-run` to preview without writing files. `--plugin` accepts `mp3quran`, `tvquran`, `archiveorg`, `mixlr`, or `all`, and can be repeated or comma-separated.

## Sources

- [MP3Quran website](https://mp3quran.net)
- [MP3Quran API docs](https://mp3quran.net/ar/api)
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
