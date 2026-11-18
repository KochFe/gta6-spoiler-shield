# GTA VI Spoiler Shield

A Firefox add-on that blurs GTA VI news, trailers, thumbnails, posts and
spoilers across the web, so you can wait for the PC release in peace.

- Blurs whole items (video cards, posts, tweets, search results) in place. Pages
  keep their layout, and nothing is removed or blocked.
- On pages about the game, the page stays usable. Only the tab title is replaced
  and video players are blurred and paused.
- Catches spellings like `GTA6`, `#GTA6Leaks`, `gta_6` slugs, `GTA Ⅵ`, other languages.
- Optional: setting & character names (on by default), Rockstar/Take-Two news (off).
- Pause it per site, add your own keywords. Settings sync via Firefox Sync.
- No data collection. The only network request is Firefox's daily update check
  against this repo's `updates.json`. Filtering runs entirely locally.
- Updates itself automatically from GitHub releases.

## Install

Download the latest `.xpi` from
[Releases](https://github.com/KochFe/gta6-spoiler-shield/releases/latest) and
open it in Firefox (desktop, version 142+). You can also go to `about:addons` →
gear icon → **Install Add-on From File…**. Later versions install themselves,
usually within a day. To check right away: `about:addons` → gear icon →
**Check for Updates**.

## Building and signing it yourself

Release Firefox only installs add-ons that Mozilla has signed. Signing as
**unlisted** is free, takes a few minutes, and does *not* publish the add-on
anywhere. You get a private `.xpi` file.

1. Sign in at <https://addons.mozilla.org> (any Firefox account works).
2. Open <https://addons.mozilla.org/developers/addon/api/key/>, accept the
   developer agreement and click **Generate new credentials**.
3. In this folder, in PowerShell:

   ```powershell
   npm install
   $env:WEB_EXT_API_KEY = "user:12345678:123"     # "JWT issuer"
   $env:WEB_EXT_API_SECRET = "abc123..."          # "JWT secret"
   npm run sign
   ```

4. Firefox → `about:addons` → gear icon → **Install Add-on From File…** → pick
   `web-ext-artifacts\*.xpi`. (Or drag the `.xpi` onto a Firefox window.)

## Releasing a new version (maintainer)

With the two `$env:` variables set as above, on a clean `main` branch:

```powershell
npm run release -- patch     # or minor / major / 1.4.0
```

This bumps the version, runs tests and lint, and signs the add-on. It then
publishes a GitHub release with the `.xpi` and adds that release to
`updates.json`. Every installed copy picks it up from there. Needs the GitHub
CLI (`gh`) logged in with push access. If signing fails, the version bump is
reverted and nothing is pushed.

Copies installed from a version without auto-update (1.1.0 or older) need
the first auto-updating version installed by hand once.

### Alternatives

- **Firefox Developer Edition / Nightly / ESR:** set
  `xpinstall.signatures.required` to `false` in `about:config`, run
  `npm run build`, rename the `.zip` in `web-ext-artifacts` to `.xpi`, and install
  it from file.
- **Temporary (until restart):** `about:debugging#/runtime/this-firefox` →
  **Load Temporary Add-on…** → `manifest.json`.

## After installing: close Firefox's own leaks

The add-on can only filter web pages. Firefox's own UI can still show GTA VI
headlines, so also do this:

- `about:addons` → GTA VI Spoiler Shield → **Run in Private Windows: Allow**.
- Settings → Home → Firefox Home Content: turn off **Stories** and **Sponsored**.
- Settings → Search: turn off **Show trending search suggestions**. Under
  Firefox Suggest, turn off **Suggestions from sponsors**. Optionally turn off
  **Show search suggestions** too: typing "gta" will otherwise autocomplete
  to GTA VI searches.
- Phones, smart TVs and other browsers aren't covered.

## Using it

The toolbar icon shows how many items are blurred on the current page (`II` =
paused on this site, `off` = disabled). Click it to:

- turn filtering on or off,
- pause or resume on the current site (for false positives),
- toggle the extra term categories,
- add your own keywords (one per line, Ctrl+Enter saves).

Blurred items can't be clicked or hovered, so YouTube can't start a preview
video. If something harmless gets blurred, pause the add-on on that site.

## Development

```sh
npm install
npm test        # unit + jsdom tests
npm run test:e2e  # headless real-Firefox smoke test
npm run lint    # Mozilla's add-on validator
npm start       # temporary Firefox profile with the add-on, live reload
npm run build   # unsigned zip in web-ext-artifacts/
npm run sign    # signed .xpi (needs WEB_EXT_API_KEY / WEB_EXT_API_SECRET)
```
