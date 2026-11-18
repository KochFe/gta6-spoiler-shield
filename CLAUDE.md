# GTA VI Spoiler Shield

A Firefox add-on (Manifest V3, Firefox 142+) that blurs any web content about
GTA VI. The user will play GTA VI on PC months after the console release and
wants **zero exposure** until then: no news, trailers, thumbnails, leaks or
spoilers. User-facing docs and install steps are in `README.md`.

**Product decision (from the user): blur, never remove or block.** Matching
items are blurred in place and keep their layout. Pages are never blocked or
covered. No `display: none`, no overlays, no redirects. Pages that are about
GTA VI as a whole only get their tab title replaced and their video players
blurred and paused.

## Spoiler safety (applies to you, Claude, too)

- **Never show the user real GTA VI content.** Don't web-search or fetch GTA VI
  news, Reddit threads, videos etc. to build fixtures or "check what's out
  there". Don't quote page text that matched the filter in chat or logs.
- **Never repeat the lore list in chat, commit messages, the popup or docs.**
  `LORE_TERMS` in `src/matcher.js` contains setting and character names, which
  are spoilers themselves. Refer to them as "the lore terms".
- Test fixtures use made-up, generic phrases (`'GTA 6 trailer'`, `'Vice City'`),
  never real headlines, plot details, leak descriptions or lore-list names.
- Never `console.log` matched text from the content script.
- When choosing between a false positive and a false negative, choose the false
  positive: blurring a harmless item is fine, showing a spoiler is not.
- Fail closed: the content script filters with defaults *before* async settings
  load. Keep it that way.
- Strings the add-on itself puts on pages (`MASKED_TITLE`) must not contain
  filtered terms, or the page check matches itself.

## Commands

```sh
npm test         # node:test: test/matcher.test.js (pure) + test/content.test.js (jsdom)
npm run lint     # web-ext lint (AMO validator), must stay at 0 errors/warnings
npm run check    # both of the above; run before calling work done
npm run test:e2e # build + headless real-Firefox smoke test (test/e2e/smoke.mjs); run after changes to
                 # manifest, background, popup or Firefox-specific APIs
npm start        # web-ext run: temporary Firefox profile, auto-reload on save
npm run build    # unsigned zip into web-ext-artifacts/
npm run sign     # signed unlisted .xpi; needs WEB_EXT_API_KEY / WEB_EXT_API_SECRET env vars
npm run release -- minor  # bump + check + sign + GitHub release + updates.json (see below)
```

Run a single test: `node --test --test-name-pattern="shadow" test/content.test.js`.

### Releasing and auto-updates

Repo: <https://github.com/KochFe/gta6-spoiler-shield> (public, because Firefox
fetches updates anonymously). Release with `npm run release -- <patch|minor|major|x.y.z>`
(`scripts/release.mjs`). The user runs it in their own PowerShell with
`WEB_EXT_API_KEY`/`WEB_EXT_API_SECRET` set. Never ask for or handle those keys.

- `manifest.json` → `gecko.update_url` points at `updates.json` on `main` via
  raw.githubusercontent.com. Firefox checks it about daily and installs any
  higher `version` from `update_link`, verified by `update_hash` (sha256).
- Order matters: the GitHub release with the `.xpi` is created *before*
  `updates.json` is pushed, so the link is never dead.
- Never rewrite or remove existing `updates.json` entries. Never change
  `update_url` or the add-on ID (GUID), or installed copies stop updating or
  become a different add-on.
- AMO rejects re-signing an existing version; the script always bumps.
- `npm run lint` uses `--self-hosted`; without it `update_url` is an error.
- The script bumps `package.json`/`package-lock.json` via `npm version` and
  `manifest.json` by regex, keeping their formatting.

## Architecture

No build step, no bundler, no runtime dependencies. Plain JS loaded as classic
scripts.

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest. Content scripts on `<all_urls>`, all frames, `document_start`; event-page background. |
| `src/matcher.js` | `buildMatcher(settings)` → `(text) => boolean`. Core patterns (always on), `LORE_TERMS`, `PUBLISHER_TERMS`, user keywords. `normalize()`, `DEFAULT_SETTINGS`. |
| `src/sites.js` | `siteFor(host)` → `{ items, media }` selectors; `GENERIC_CONTAINERS`, `BLOCK_ELEMENTS`. |
| `src/content.js` | DOM scanning + `MutationObserver`, blurring, page-level title mask + media blur, badge reports. |
| `src/content.css` | `[data-gta6-shield]`: `blur(16px)`, `clip-path: inset(0)`, `pointer-events: none` (all `!important`). |
| `src/background.js` | Stateless event page: sets the toolbar badge from content-script reports. |
| `src/popup/` | Toolbar popup: on/off, per-site pause, categories, keywords, paused-sites list. |
| `test/dom-harness.js` | Loads the real content scripts into jsdom with a fake `browser` API. |

### Settings

`browser.storage.sync`, shape = `DEFAULT_SETTINGS`:
`{ enabled, blockLore, blockPublisher, keywords: string[], allowlist: hostname[] }`.
Always read with `storage.sync.get(DEFAULT_SETTINGS)` so new keys get defaults.
On any change, every content script un-blurs everything and rescans.

### Messages

- content → background: `{ type: 'gta6-shield:report', blurred, pageMatch, active, allowlisted, hostname }`
  (top frame only, throttled to 250 ms).
- popup → content: `{ type: 'gta6-shield:stats' }` → same stats object (top frame answers).

### Shared-module pattern

Content scripts can't use ES modules, so shared files are IIFEs that end with:

```js
if (typeof module === 'object' && module.exports) module.exports = api;
else globalThis.GTAFilter = api;
```

The browser gets a global and Node tests use `require()`. Script order in the
manifest matters (matcher → sites → content; matcher → background).

### How filtering works

1. One TreeWalker pass over elements and text checks text nodes,
   `alt`/`title`/`aria-label`/`post-title`, and `<a href>` (URL-decoded). Site
   containers are also checked by full `textContent` to catch split text
   (`<b>GTA</b> 6`), including re-checks after in-place mutations.
2. On a hit, `containerFor()` picks what to blur: the closest site item,
   then a generic container (`article`, `li`, …, at most 3000 chars of text),
   then the largest ancestor with ≤ 600 chars of text (the "card"), widened to
   the enclosing `p`/heading so no half-sentence stays readable. Never `body`/`html`.
3. **While `readyState === 'loading'`** ancestors are half-parsed, so text
   lengths are meaningless. Only the site item or the immediate block is
   blurred, and the element is queued in `pendingExpand`, widened at
   `DOMContentLoaded`.
4. Blurring sets `data-gta6-shield="item"` (frameworks reset `className`, not
   unknown attributes). Inside shadow roots it also sets the `INLINE_BLUR` styles,
   since content.css doesn't reach in. Keep `INLINE_BLUR` and content.css in sync.
   `pointer-events: none` is deliberate: it stops YouTube hover previews, which
   would play unblurred.
5. Blurring happens synchronously in the MutationObserver callback, which runs
   before the next paint. Don't defer it with `requestIdleCallback`/`setTimeout`,
   or content will flash sharp on screen.
6. Shadow roots (`openOrClosedShadowRoot`, Firefox-only) found during scans are
   scanned and observed. `closestAcross()` walks up through shadow hosts.
7. `checkPage()` runs per mutation batch. If URL, title, `og:title`/`twitter:title`
   or the first `h1` matches, it sets the tab title to `MASKED_TITLE`
   (remembering `realTitle`) and blurs site/generic `media` selectors with
   `data-gta6-shield="page"`. When an SPA navigates to an unrelated page, the
   title is restored and only the `"page"` blurs are removed. An `"item"` blur
   is never downgraded.
8. Any `play` event inside a blurred element is paused. Audio would spoil too.

### Matcher conventions

- Use the `B`/`E` lookaround boundaries and `SEP` separator class, not `\b`.
  `\b` treats `_` as a word character and misses slugs like `gta_6_leaks`.
- `6` may be followed by letters (`#GTA6Leaks`) but not digits. `vi` must be
  followed by a non-letter, or "GTA video" would match.
- Text is NFKC-normalized, with zero-width characters/soft hyphens stripped and
  curly apostrophes straightened. Custom keywords are normalized the same way.
- The regex has no `g` flag on purpose (stateful `lastIndex`).
- Every new pattern gets positive *and* negative tests (`GTA V`, `GTA VII`,
  `GTA 60fps`, `GTA video`, `Leonidas` must not match).

### Testing notes

- jsdom fires `DOMContentLoaded` on a microtask right after construction. Tests
  of the loading phase use `load(html, { beforeLoad: true, onInjected })` and
  assert synchronously inside `onInjected`.
- After settings changes use `browser.setSettings(patch)` from the harness (it
  flushes). After DOM mutations, `await flush()`.
- jsdom has no layout. Nothing in content.js may rely on `getComputedStyle`
  or sizes.
- e2e (selenium + headless Firefox): passes `-no-remote` because the user
  usually has Firefox open. Without it, the launch hands off to their session.
  Fixtures are served over local HTTP because content scripts don't run on
  `file://` for this add-on. The popup is opened via a chrome-context script
  with a pinned `extensions.webextensions.uuids` pref (WebDriver can't navigate
  to `moz-extension://`). Background-tab timers are throttled to ≥ 1 s, so wait
  that long for badge updates.

## Known limitations / gotchas

- Site markup changes often. When something slips through on a big site, update
  `src/sites.js` first.
- Shadow roots attached *after* their host was scanned are only seen once
  something inside the host's light DOM mutates or the host is re-inserted.
- YouTube recycles renderer elements. A card blurred once stays blurred even if
  its content is swapped for something harmless. That's acceptable.
- On an article about GTA VI, paragraphs that don't mention the game stay
  readable (the page isn't blocked, per the user's choice). Hero images without
  matching alt text aren't blurred either.
- Images/video frames without matching text, alt or labels can't be detected.
- Content scripts don't run on `about:` pages, Firefox UI (new-tab stories, URL
  bar suggestions) or addons.mozilla.org. README tells the user which Firefox
  settings to turn off.
- Firefox history may record a page's real title before it's masked.
- `"vice city"` is a lore term, so it also blurs old Vice City content.
  This is intentional.

## Style

- Plain modern JS (ES2022), `'use strict'` IIFEs, 2-space indent, single quotes.
- Use the `browser.*` promise API (Firefox-native), not `chrome.*`.
- Build DOM with `createElement`/`textContent`, never `innerHTML` (AMO lint flags it).
- Keep comments to the *why*: the non-obvious constraint a line exists for.
