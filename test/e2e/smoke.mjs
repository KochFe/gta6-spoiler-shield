// End-to-end smoke test in real (headless) Firefox: installs the built add-on
// temporarily and checks local, neutral fixture pages. Run: npm run test:e2e
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'web-ext-artifacts');
const zip = readdirSync(artifacts).find((f) => f.endsWith('.zip'));
assert.ok(zip, 'run `npm run build` first');

// Served over HTTP: closer to real browsing than file:// URLs.
const server = http.createServer((req, res) => {
  try {
    const body = readFileSync(path.join(root, 'test/e2e', path.basename(req.url)));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const fixture = (name) => `http://127.0.0.1:${server.address().port}/${name}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pin the moz-extension:// UUID so the popup page can be opened directly.
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const EXT_UUID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const popupUrl = `moz-extension://${EXT_UUID}/src/popup/popup.html`;

const options = new firefox.Options()
  // -no-remote: run isolated even if the user's own Firefox is open.
  .addArguments('-headless', '-no-remote')
  .setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: EXT_UUID })
  );
const driver = await new Builder()
  .forBrowser('firefox')
  .setFirefoxOptions(options)
  // Needed for the chrome-context script that opens the popup page.
  .setFirefoxService(new firefox.ServiceBuilder().addArguments('--allow-system-access'))
  .build();

try {
  await driver.installAddon(path.join(artifacts, zip), true);

  await driver.get(fixture('feed.html'));
  await sleep(1000);
  const feed = await driver.executeScript(() =>
    Object.fromEntries(
      ['bad', 'ok', 'late'].map((id) => {
        const s = getComputedStyle(document.getElementById(id));
        return [id, { display: s.display, filter: s.filter, pointerEvents: s.pointerEvents }];
      })
    )
  );
  assert.match(feed.bad.filter, /blur/, 'matching item blurred');
  assert.notEqual(feed.bad.display, 'none', 'matching item not removed');
  assert.equal(feed.bad.pointerEvents, 'none', 'blurred item not interactive');
  assert.equal(feed.ok.filter, 'none', 'other item sharp');
  assert.match(feed.late.filter, /blur/, 'dynamically added item blurred');
  console.log('✔ feed page: items blurred in place');

  await driver.get(fixture('about.html'));
  await sleep(500);
  const about = await driver.executeScript(() => ({
    title: document.title,
    bodyFilter: getComputedStyle(document.body).filter,
    textFilter: getComputedStyle(document.getElementById('text')).filter,
    videoFilter: getComputedStyle(document.getElementById('v')).filter,
    anyOverlay: [...document.documentElement.children].some((el) => el.id.startsWith('gta6')),
  }));
  assert.equal(about.title, 'Spoiler hidden', 'tab title masked');
  assert.equal(about.anyOverlay, false, 'page not blocked');
  assert.equal(about.bodyFilter, 'none', 'page itself stays sharp');
  assert.equal(about.textFilter, 'none', 'unrelated text stays sharp');
  assert.match(about.videoFilter, /blur/, 'video player blurred');
  console.log('✔ page about the game: stays usable, tab title masked, video blurred');

  // Badge + popup: keep the feed in one tab, open the popup page in another.
  await driver.get(fixture('feed.html'));
  await sleep(1000);
  const feedTab = await driver.getWindowHandle();
  // WebDriver refuses to navigate to moz-extension:// URLs; open the tab from
  // browser chrome instead.
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript((url) => {
    gBrowser.selectedTab = gBrowser.addTab(url, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  }, popupUrl);
  await driver.setContext(firefox.Context.CONTENT);
  await sleep(1000);
  const popupTab = (await driver.getAllWindowHandles()).find((h) => h !== feedTab);
  await driver.switchTo().window(popupTab);
  const badge = () =>
    driver.executeAsyncScript((done) => {
      browser.tabs
        .query({ url: 'http://127.0.0.1/*' })
        .then(([tab]) => browser.action.getBadgeText({ tabId: tab.id }))
        .then(done, (e) => done('ERR ' + e.message));
    });
  assert.equal(await badge(), '2', 'badge shows hidden count');
  assert.equal(await driver.executeScript(() => document.getElementById('state').textContent), 'Active');
  console.log('✔ badge shows count, popup renders');

  await driver.executeScript(() => document.getElementById('enabled').click());
  await sleep(2000); // background-tab timers are throttled to >= 1s
  assert.equal(await badge(), 'off', 'badge shows off');
  await driver.switchTo().window(feedTab);
  const offDisplay = await driver.executeScript(() => getComputedStyle(document.getElementById('bad')).display);
  assert.notEqual(offDisplay, 'none', 'disabling unhides');
  console.log('✔ popup toggle disables filtering and updates badge');
} finally {
  await driver.quit();
  server.close();
}
