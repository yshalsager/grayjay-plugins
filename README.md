# Grayjay Plugins

[Grayjay](https://grayjay.app/) plugins in one repository. Install an active plugin by opening its config URL in Grayjay.

## Active Plugins

| Plugin              | Source                                                 | Config                                                                                                                                |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| MP3Quran            | [mp3quran.net](https://mp3quran.net)                   | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mp3quran/Mp3QuranConfig.json)                   |
| tvQuran             | [tvquran.com](https://tvquran.com)                     | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/tvquran/TvQuranConfig.json)                     |
| Archive.org         | [archive.org](https://archive.org)                     | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/archiveorg/ArchiveOrgConfig.json)               |
| Mixlr               | [mixlr.com](https://mixlr.com)                         | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/mixlr/MixlrConfig.json)                         |
| AlBadr              | [al-badr.net](https://www.al-badr.net)                 | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/albadr/AlBadrConfig.json)                       |
| Quran.com           | [quran.com](https://quran.com)                         | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/qurancom/QuranComConfig.json)                   |
| Midad               | [midad.com](https://midad.com)                         | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/midad/MidadConfig.json)                         |
| QuranicAudio        | [quranicaudio.com](https://quranicaudio.com)           | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/quranicaudio/QuranicAudioConfig.json)           |
| EveryAyah           | [everyayah.com](https://everyayah.com)                 | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/everyayah/EveryAyahConfig.json)                 |
| AlQuran.cloud       | [alquran.cloud](https://alquran.cloud)                 | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/alquran-cloud/AlQuranCloudConfig.json)          |
| BinBaz              | [binbaz.org.sa](https://binbaz.org.sa)                 | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/binbaz/BinBazConfig.json)                       |
| Tilawat Al Haramain | [tilawatalharamain.com](https://tilawatalharamain.com) | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/tilawatalharamain/TilawatAlHaramainConfig.json) |
| Jeman               | [j-eman.net](https://j-eman.net)                       | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/jeman/JemanConfig.json)                         |
| Saleh Al Sheikh     | [saleh.af.org.sa](https://saleh.af.org.sa)             | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/saleh-af/SalehAfConfig.json)                    |
| DrosQ8              | [drosq8.com](https://www.drosq8.com)                   | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/drosq8/DrosQ8Config.json)                       |
| DrosUAE             | [drosuae.com](https://drosuae.com)                     | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/drosuae/DrosUAEConfig.json)                     |
| AlQasim             | [a-alqasim.com](https://a-alqasim.com)                 | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/alqasim/AlQasimConfig.json)                     |
| BinOthaimeen        | [binothaimeen.net](https://binothaimeen.net)           | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/binothaimeen/BinOthaimeenConfig.json)           |
| Shkhudheir          | [shkhudheir.com](https://shkhudheir.com)               | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/shkhudheir/ShkhudheirConfig.json)               |
| AlFiqh              | [alfiqh.net](https://alfiqh.net)                       | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/alfiqh/AlFiqhConfig.json)                       |
| Alukah              | [alukah.net](https://www.alukah.net)                   | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/alukah/AlukahConfig.json)                       |
| Baheth              | [baheth.ieasybooks.com](https://baheth.ieasybooks.com) | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/baheth/BahethConfig.json)                       |
| IslamHouse          | [islamhouse.com](https://islamhouse.com)               | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/islamhouse/IslamHouseConfig.json)               |
| IslamWeb Audio      | [audio.islamweb.net](https://audio.islamweb.net)       | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/islamweb-audio/IslamWebAudioConfig.json)        |
| Sunnah Wadeha       | [sunnahwadeha.com](https://sunnahwadeha.com)           | [Install](https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/sunnahwadeha/SunnahWadehaConfig.json)           |

## Playlist Support

- MP3Quran reciter channels expose one playlist per moshaf. Global playlist search also exposes tafsir-source playlists and video-type playlists.
- tvQuran category channels expose audio selection playlists, and reciter channels expose moshaf/collection playlists parsed from the reciter profile. tvQuran video categories stay as channel/content results because Grayjay playlist details require video items, while these entries are nested YouTube links.
- Direct tvQuran collection URLs are recognized as both channel URLs and playlist URLs, so shared collection links can open into either navigation surface depending on what Grayjay asks for.
- Archive.org exposes items as playlists, with each playable audio/video file represented as a playlist entry. It does not provide a home feed; use search to discover items.
- Mixlr is live-only in v1; it intentionally does not expose playlists until recordings or collections are implemented as concrete playable lists.
- AlBadr exposes each `/sub/{id}` lesson series as a playlist, category channels expose their series through channel playlists, and the site live page is represented as nested Mixlr content.
- Quran.com exposes each reciter as a timed full-surah playlist containing that reciter's surahs. Older ayah-style Quran.com URLs are accepted for compatibility but resolve to the full surah item.

## Quran Playback Granularity

MP3Quran, Quran.com, and QuranicAudio expose continuous full-surah media. EveryAyah and AlQuran.cloud expose each ayah as a playable item and group those items into reciter/edition surah playlists; they do not synthesize continuous surah files.

## MP3Quran Ayah Text

MP3Quran surah tracks use MP3Quran's ayah timing API for timed chapters. Quran text is fetched lazily per surah from `fawazahmed0/quran-api` using `ara-quransimple`.

Android clients that support plugin subtitle sources can use the generated WebVTT subtitle source. Grayjay Desktop currently plays direct MP3 audio through a path that does not attach external subtitles, so the plugin also includes the ayah text in chapter labels as the Desktop fallback.

## Development

### Live Tests

Run every live integration test:

```sh
pnpm run test:live
```

Pass a plugin registry value to run one test file:

```sh
pnpm run test:live -- midad
```

Live tests call the upstream provider websites. Set `LIVE_TEST_DEEP=1` to include the slower MP3Quran catalog fallback test.

### Android Phone

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
   mise run dev
   ```

   The dev server rebuilds plugin scripts when `src/**` or `plugins/registry.json` changes, then serves the generated files from `plugins/**`.

4. Open the DevServer in your computer browser:

   ```text
   http://PHONE_IP:11337/dev
   ```

5. Load a plugin using your computer LAN IP, not `localhost`:

   Replace the raw GitHub origin in any config link from the [active plugin table](#active-plugins) with `http://COMPUTER_IP:3000`.

6. In the DevServer UI:
   - Click `Load Plugin` to test individual methods.
   - Use the `Integration` tab and click `Inject Plugin` to test inside the Android app.
   - Click refresh or inject again after local edits.

The phone must be able to reach your computer over the LAN, and your firewall must allow inbound connections to port `3000`.

Android DevServer API helpers:

```sh
pnpm run grayjay:dev-api -- logs --server-url http://PHONE_IP:11337
pnpm run grayjay:dev-api -- logs --server-url http://PHONE_IP:11337 --follow
pnpm run grayjay:dev-api -- http --server-url http://PHONE_IP:11337
pnpm run grayjay:dev-api -- remote-test --server-url http://PHONE_IP:11337 --method getContentDetails --args '["CONTENT_URL"]'
pnpm run grayjay:dev-api -- load --plugin mp3quran --server-url http://PHONE_IP:11337 --dev-url http://COMPUTER_IP:3000 --follow
```

Run the Android smoke suite for the released Quran plugins with:

```sh
pnpm run grayjay:android-smoke -- --server-url http://PHONE_IP:11337 --dev-url http://COMPUTER_IP:3000
```

This loads MP3Quran, tvQuran, AlBadr, and Archive.org as Android test plugins and verifies search capabilities, home/search feeds, filters, content details, chapters where supported, channels, channel search, and URL recognition. Android `remoteTest` currently cannot serialize playlist detail objects because Grayjay's Gson path sees duplicate inherited `contentType` fields on playlist classes, so playlist checks assert URL recognition plus that known platform serializer limitation for `getPlaylist` and `searchPlaylists`.

### Android Emulator / AVD

For a running AVD, install the ABI-matching Grayjay APK, start Grayjay once, enable developer mode in the app, then start Grayjay's DevServer from `Developer Settings`.

The default emulator serial used by the mise tasks is `emulator-5554`. Override it with `ANDROID_SERIAL` when needed:

```sh
ANDROID_SERIAL=emulator-5556 mise run grayjay-avd-forward
```

Install and launch Grayjay:

```sh
mise run grayjay-avd-install
mise run grayjay-avd-launch
```

`grayjay-avd-install` defaults to `tmp/app-arm64-v8a-release.apk`. Override the APK path with:

```sh
GRAYJAY_APK=tmp/app-universal-release.apk mise run grayjay-avd-install
```

Forward the emulator DevServer port to the host:

```sh
mise run grayjay-avd-forward
```

Serve plugin configs/scripts from the host:

```sh
mise run dev
```

Run the Android smoke suite against the AVD:

```sh
mise run grayjay-avd-smoke
```

The AVD smoke task uses:

- `--server-url http://127.0.0.1:11337`, because `adb forward` exposes Grayjay's emulator DevServer on the host loopback.
- `--dev-url http://10.0.2.2:3000`, because Android Emulator reaches the host machine through `10.0.2.2`.

For a non-default dev server or forwarded port:

```sh
GRAYJAY_SERVER_URL=http://127.0.0.1:11338 GRAYJAY_DEV_URL=http://10.0.2.2:3001 mise run grayjay-avd-smoke
```

To expose optional plugin smoke tests in Grayjay's `TestSystem` tab, build with:

```sh
pnpm run build:debug-tests -- --plugin mp3quran
```

Rebuild normally before signing or release builds.

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

   Replace the raw GitHub origin in any config link from the [active plugin table](#active-plugins) with `http://127.0.0.1:3000`.

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
pnpm run grayjay:dev-api -- load --target desktop --plugin archiveorg
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

The helper script can also read Desktop developer logs:

```sh
pnpm run grayjay:dev-api -- logs --target desktop
pnpm run grayjay:dev-api -- load --target desktop --plugin archiveorg --follow
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

Use `--dry-run` to preview without writing files. `--plugin` accepts any registry value from the [active plugin table](#active-plugins), or `all`, and can be repeated or comma-separated.

## Sources

- [MP3Quran website](https://mp3quran.net)
- [MP3Quran API docs](https://mp3quran.net/ar/api)
- [MP3Quran ayah timing reads](https://www.mp3quran.net/api/v3/ayat_timing/reads)
- [tvQuran website](https://tvquran.com)
- [Quran text repository](https://github.com/fawazahmed0/quran-api)
- [Quran text CDN pattern](https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quransimple/{surah}.min.json)
- [Quran.com](https://quran.com)
- [Quran.com Content API docs](https://api-docs.quran.com/docs/category/content-apis-4.0.0/)
- [Quran.com recitations API docs](https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/recitations/)
- [Quran.com chapter-reciter audio docs](https://api-docs.quran.com/docs/content_apis_versioned/4.0.0/chapter-reciter-audio-file/)
- [Internet Archive metadata API](https://archive.org/developers/md-read.html)
- [Internet Archive files, formats, and derivatives guide](https://help.archive.org/help/files-formats-and-derivatives-a-basic-guide/)
- [Internet Archive search API](https://doc-tools.readthedocs.io/en/ia-test-gsod/item-search-apis.html)
- [AlBadr website](https://www.al-badr.net)
- [Grayjay plugin development docs](https://gitlab.futo.org/videostreaming/grayjay/-/blob/master/plugin-development.md)
- [Grayjay sample plugin](https://gitlab.futo.org/videostreaming/plugins/sample)
- [Grayjay RadioBrowser plugin](https://gitlab.futo.org/videostreaming/plugins/radiobrowser)

## License

This repository is licensed under the GNU Affero General Public License v3.0 or later. See `LICENSE`.
