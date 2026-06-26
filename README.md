<div align="center">
  <img src="public/icon/128.png" alt="Streamer Mode for Lichess" width="128" />

  # Streamer Mode for Lichess

  [![Available in the Chrome Web Store](https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/UV4C4sCIILO7Ok2XaiUa.png)](https://chromewebstore.google.com/detail/streamer-mode-for-lichess/geeapagaajpjlnenfongaecamhknbokc)
</div>

A cross-browser extension that hides **every username** on [lichess.org](https://lichess.org)
with one click — so chess streamers can play without leaking their identity,
getting stream-sniped, or exposing other players on camera.

When enabled:

| Real identity        | Shown as       |
| -------------------- | -------------- |
| You (logged-in user) | **Streamer**   |
| Your game opponent   | **Opponent**   |
| Everyone else        | **Player 1**, **Player 2**, … (stable per page) |

It also:

- **Scrubs profile links** (`/@/username`) so the real name can't leak via hover / status bar.
- **Hides title badges** (GM/IM/FM…) and **blurs profile photos** — both are strong identity hints.
- **Blurs any not-yet-masked name** so a real username never flashes on stream, even for one frame.
- Works everywhere: game view, **live chat**, lobby, tournaments, leaderboards, profiles.
- Survives Lichess's single-page navigation via a `MutationObserver`.
- Is **fully reversible** — turning it off restores the original page instantly, no reload.

Toggle from the toolbar popup, or with **Alt+Shift+S** mid-game (remappable at
`about:addons` → Manage Extension Shortcuts in Firefox, or `chrome://extensions/shortcuts` in Chrome).

## Donations

The extension is free. The popup has a **"Support this extension"** button that
opens [ko-fi.com/jackalope_digital](https://ko-fi.com/jackalope_digital) in a new
tab (the MV3/Web-Store-safe way to accept donations — embedded payment widgets are
blocked by CSP).

The link lives in one place — `href` of `#donate` in
[`entrypoints/popup/index.html`](entrypoints/popup/index.html).

## Tech

Built with [WXT](https://wxt.dev) + TypeScript. One codebase → Chrome, Edge (MV3) and Firefox (MV2).
The masking logic lives in [`lib/masker.ts`](lib/masker.ts); it's pure DOM and has no runtime dependencies.

## Develop

```bash
npm install
npm run dev            # Chrome with hot reload
npm run dev:firefox    # Firefox with hot reload
```

`npm run dev` launches a browser with the extension loaded. Open lichess.org and
click the toolbar icon.

## Test

```bash
npm test       # functional tests against Lichess-shaped DOM (jsdom)
npm run compile  # type-check
```

## Build

```bash
npm run build          # -> .output/chrome-mv3   (also used for Edge)
npm run build:firefox  # -> .output/firefox-mv2
npm run build:edge     # -> .output/edge-mv3

npm run zip            # store-ready zip (Chrome/Edge)
npm run zip:firefox    # store-ready zip (Firefox)
```

### Load an unpacked build manually

- **Chrome / Edge:** go to `chrome://extensions`, enable *Developer mode*,
  *Load unpacked* → select `.output/chrome-mv3`.
- **Firefox:** go to `about:debugging#/runtime/this-firefox`,
  *Load Temporary Add-on* → select any file in `.output/firefox-mv2`.

## Building from source (for Firefox AMO reviewers)

This add-on is bundled and minified with [WXT](https://wxt.dev) (Vite + rolldown),
so the published files are generated. To reproduce them from the source archive:

- **Environment:** Node.js 22 LTS and npm 10 (developed on Node 22.13.1 / npm 10.9.2),
  on any OS. No global tools required; everything installs locally.

```bash
npm ci                 # install exact, locked dependencies
npm run build:firefox  # produces the unpacked extension in .output/firefox-mv2
```

The contents of `.output/firefox-mv2/` match the uploaded package. (`npm run zip:firefox`
simply zips that folder.) No network access or environment variables are needed at
build time. The platform-specific entries under `optionalDependencies` are native
build-tool binaries for Windows only; npm automatically selects the correct binaries
for the reviewer's platform and skips the rest.

## Project layout

```
entrypoints/
  background.ts          # hotkey handler
  lichess.content.ts     # injects the masker on lichess.org
  popup/                 # on/off toggle UI
lib/
  masker.ts              # the masking engine (apply / observe / restore)
  state.ts               # shared enabled flag (storage)
scripts/
  gen-icons.mjs          # dependency-free PNG icon generator
  test-masker.mjs        # jsdom functional tests
```

## Notes on the Windows native bindings

`optionalDependencies` pins `@rolldown/binding-win32-x64-msvc` and
`lightningcss-win32-x64-msvc` to work around an npm bug where platform-specific
binaries are occasionally not installed. On non-Windows machines npm skips them
automatically.

## Support & feedback

Questions, bugs, or feature requests? Email **contact@jackalope.dev**
(there's also a link in the extension popup).

## Disclaimer

This is an independent, fan-made tool. It is **not affiliated with, endorsed by,
or associated with Lichess** (lichess.org). "Lichess" is used here only to
describe what the extension works with. Lichess is free/open-source software; this
extension only modifies how pages are displayed in your own browser and sends no
data anywhere.

## License

MIT — free to use and modify. See [LICENSE](LICENSE).
