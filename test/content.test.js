// DOM behaviour of src/content.js in jsdom. Fixtures are generic made-up phrases.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./dom-harness.js');

const filler = (n) => '<p>' + 'Unrelated filler text. '.repeat(n) + '</p>';

test('content.css blurs in place and never removes', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.css'), 'utf8');
  assert.match(css, /filter:\s*blur\(/);
  assert.doesNotMatch(css, /display:\s*none|visibility:\s*hidden/);
});

test('blurs a YouTube card by its title, leaving it in the page', async () => {
  const { $, isBlurred } = await load(
    `<ytd-rich-item-renderer id="bad"><a id="video-title">GTA 6 trailer reaction</a></ytd-rich-item-renderer>
     <ytd-rich-item-renderer id="ok"><a>Cooking pasta</a></ytd-rich-item-renderer>`,
    { url: 'https://www.youtube.com/' }
  );
  assert.ok(isBlurred($('#bad')));
  assert.ok($('#bad').isConnected, 'still in the DOM');
  assert.ok(!isBlurred($('#ok')));
});

test('blurs a Reddit post as a whole', async () => {
  const { $, isBlurred } = await load(
    `<shreddit-post id="post" post-title="GTA 6 discussion"><a slot="title">GTA 6 discussion</a></shreddit-post>
     <shreddit-post id="ok" post-title="Cats"><a slot="title">Cats</a></shreddit-post>`,
    { url: 'https://www.reddit.com/' }
  );
  assert.equal($('#post').getAttribute('data-gta6-shield'), 'item');
  assert.ok(!isBlurred($('#ok')));
});

test('blurs a generic list item but never the body', async () => {
  const { $, doc, isBlurred } = await load(`<ul><li id="bad">New GTA VI info</li><li id="ok">Other</li></ul>`);
  assert.ok(isBlurred($('#bad')));
  assert.ok(!isBlurred($('#ok')));
  assert.ok(!doc.body.hasAttribute('data-gta6-shield'));
});

test('blurs the whole card on unknown layouts', async () => {
  const { $, isBlurred } = await load(
    `<div id="page">${filler(40)}
       <div id="card"><img src="x.jpg"><h3><a href="/a">GTA 6 talk</a></h3><span>2h ago</span></div>
     </div>`
  );
  assert.ok(isBlurred($('#card')));
  assert.ok(!isBlurred($('#page > p')));
});

test('blurs the whole paragraph around a matching link', async () => {
  const { $, isBlurred } = await load(
    `<div>${filler(40)}<p id="para">Spoiler sentence start <a>GTA 6</a> spoiler sentence end.
     ${'More words. '.repeat(80)}</p></div>`
  );
  assert.ok(isBlurred($('#para')));
});

test('catches text split across elements inside a site item', async () => {
  const { $, isBlurred } = await load(
    `<shreddit-post id="post"><a slot="title"><b>GTA</b> <i>6</i> thread</a></shreddit-post>`,
    { url: 'https://www.reddit.com/' }
  );
  assert.ok(isBlurred($('#post')));
});

test('checks attributes: alt, aria-label, href slugs', async () => {
  const { $, isBlurred } = await load(
    `<div>${filler(40)}
       <figure id="a"><img alt="GTA VI screenshot"></figure>
       <div id="b"><button aria-label="Play GTA 6 clip">▶</button></div>
       <div id="c"><a href="/r/games/comments/x/gta_6_thoughts/">link</a></div>
       <div id="ok"><a href="/r/games/comments/y/gta_5_mods/">link</a></div>
     </div>`
  );
  assert.ok(isBlurred($('#a')));
  assert.ok(isBlurred($('#b')));
  assert.ok(isBlurred($('#c')));
  assert.ok(!isBlurred($('#ok')));
});

test('blurs content inserted later (SPA)', async () => {
  const { doc, $, isBlurred, flush } = await load(`<ul id="feed"></ul>`);
  const li = doc.createElement('li');
  li.id = 'late';
  li.textContent = 'Breaking GTA6 news';
  $('#feed').append(li);
  await flush();
  assert.ok(isBlurred($('#late')));
});

test('blurs items whose text changes in place (recycled elements)', async () => {
  const { $, isBlurred, flush } = await load(
    `<ytd-video-renderer id="v"><span id="t">Harmless title</span></ytd-video-renderer>`,
    { url: 'https://www.youtube.com/' }
  );
  assert.ok(!isBlurred($('#v')));
  $('#t').firstChild.data = 'GTA 6 leak compilation';
  await flush();
  assert.ok(isBlurred($('#v')));
});

test('looks inside shadow DOM and blurs the host item', async () => {
  const { $, isBlurred, flush } = await load(`<ul><li id="host-item"><x-card id="host"></x-card></li></ul>`);
  const root = $('#host').attachShadow({ mode: 'open' });
  root.innerHTML = '<span>placeholder</span>';
  // Re-insert so the content script sees the host with its shadow root.
  $('#host-item').append($('#host'));
  await flush();
  root.querySelector('span').textContent = 'GTA 6 inside shadow';
  await flush();
  assert.ok(isBlurred($('#host-item')));
});

test('ignores script/style content and the user’s own text fields', async () => {
  const { $, isBlurred } = await load(
    `<div id="wrap"><script>var q = "GTA 6";</script><style>/* GTA 6 */</style>
     <textarea>GTA 6</textarea><p id="ok">Hello world</p></div>`
  );
  assert.ok(!isBlurred($('#wrap')));
  assert.ok(!isBlurred($('#ok')));
});

test('during parsing blurs minimally, then widens to the card at DOMContentLoaded', async () => {
  const { $, isBlurred } = await load(
    `<div id="card"><h3 id="h">GTA 6 talk</h3><span id="meta">2h ago</span></div>`,
    {
      beforeLoad: true,
      onInjected: ({ doc, $, isBlurred }) => {
        assert.equal(doc.readyState, 'loading');
        assert.ok(isBlurred($('#h')), 'heading blurred immediately');
        assert.ok(!isBlurred($('#meta')), 'card not judged while half-parsed');
      },
    }
  );
  assert.ok(isBlurred($('#meta')), 'card widened after parse');
});

test('pages about the game stay usable: no block, tab title masked, video blurred', async () => {
  const { doc, $, isBlurred } = await load(
    `<head><title>GTA 6 Trailer - VideoSite</title></head>
     <body><nav id="nav">Home Subscriptions</nav><video id="v"></video>
       <iframe id="embed" src="https://www.youtube.com/embed/abc"></iframe>
       <p id="other">Comments are below.</p></body>`
  );
  assert.equal(doc.getElementById('gta6-shield-overlay'), null, 'no overlay');
  assert.ok(!isBlurred(doc.body));
  assert.ok(!isBlurred($('#nav')));
  assert.ok(!isBlurred($('#other')));
  assert.equal(doc.title, 'Spoiler hidden');
  assert.equal($('#v').getAttribute('data-gta6-shield'), 'page');
  assert.equal($('#v').dataset.paused, '1', 'video paused');
  assert.ok(isBlurred($('#embed')));
});

test('page match also comes from og:title, h1 or URL', async () => {
  const og = await load(`<head><meta property="og:title" content="All about GTA VI"></head><body><video></video></body>`);
  assert.equal(og.doc.title, 'Spoiler hidden');
  const h1 = await load(`<h1>Grand Theft Auto VI</h1><video id="v"></video>`);
  assert.ok(h1.isBlurred(h1.$('#v')));
  const url = await load(`<video id="v"></video>`, { url: 'https://example.com/r/GTA6/' });
  assert.ok(url.isBlurred(url.$('#v')));
  const clean = await load(`<head><title>Recipes</title></head><body><h1>Pasta</h1><video id="v"></video></body>`);
  assert.equal(clean.doc.title, 'Recipes');
  assert.ok(!clean.isBlurred(clean.$('#v')));
});

test('SPA navigation away from a matching page restores title and video', async () => {
  const { doc, $, isBlurred, window, flush } = await load(
    `<head><title>GTA 6 news</title></head><body><video id="v"></video></body>`
  );
  assert.ok(isBlurred($('#v')));
  window.history.pushState({}, '', '/cooking');
  doc.querySelector('title').textContent = 'Cooking show';
  await flush();
  assert.equal(doc.title, 'Cooking show');
  assert.ok(!isBlurred($('#v')));
});

test('blurred videos are paused when they try to play', async () => {
  const { $, window, flush } = await load(
    `<ytd-video-renderer><span>GTA 6 clip</span><video id="v"></video></ytd-video-renderer>
     <video id="ok"></video>`,
    { url: 'https://www.youtube.com/' }
  );
  for (const id of ['v', 'ok']) {
    delete $('#' + id).dataset.paused;
    $('#' + id).dispatchEvent(new window.Event('play'));
  }
  await flush();
  assert.equal($('#v').dataset.paused, '1');
  assert.equal($('#ok').dataset.paused, undefined);
});

test('disabling un-blurs everything; re-enabling blurs again', async () => {
  const { $, doc, isBlurred, browser } = await load(
    `<head><title>GTA 6 news</title></head><body><ul><li id="bad">GTA 6</li></ul></body>`
  );
  assert.ok(isBlurred($('#bad')));
  await browser.setSettings({ enabled: false });
  assert.ok(!isBlurred($('#bad')));
  assert.equal(doc.title, 'GTA 6 news');
  await browser.setSettings({ enabled: true });
  assert.ok(isBlurred($('#bad')));
});

test('paused sites are not filtered', async () => {
  const { $, isBlurred } = await load(`<ul><li id="bad">GTA 6</li></ul>`, {
    settings: { allowlist: ['example.com'] },
  });
  assert.ok(!isBlurred($('#bad')));
});

test('custom keywords apply after settings change', async () => {
  const { $, isBlurred, browser } = await load(`<ul><li id="kw">Mystery codename</li></ul>`);
  assert.ok(!isBlurred($('#kw')));
  await browser.setSettings({ keywords: ['mystery codename'] });
  assert.ok(isBlurred($('#kw')));
});

test('reports a de-duplicated blurred count for the badge', async () => {
  const { browser } = await load(`<ul><li>GTA 6 <b>GTA 6</b></li><li>GTA VI</li><li>fine</li></ul>`);
  await new Promise((r) => setTimeout(r, 400));
  const last = browser.messages.at(-1);
  assert.equal(last.type, 'gta6-shield:report');
  assert.equal(last.blurred, 2);
});
