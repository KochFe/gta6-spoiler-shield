// Loads the real content script into a jsdom window with a fake `browser` API.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { DEFAULT_SETTINGS } = require('../src/matcher.js');

const SCRIPTS = ['matcher.js', 'sites.js', 'content.js'].map((f) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeBrowser(initial) {
  let store = { ...DEFAULT_SETTINGS, ...initial };
  const changeListeners = [];
  const messages = [];
  return {
    messages,
    async setSettings(patch) {
      store = { ...store, ...patch };
      for (const l of changeListeners) l(patch, 'sync');
      await flush();
      await flush();
    },
    api: {
      storage: {
        sync: { get: async (defaults) => ({ ...defaults, ...store }) },
        onChanged: { addListener: (l) => changeListeners.push(l) },
      },
      runtime: {
        sendMessage: async (msg) => messages.push(msg),
        onMessage: { addListener() {} },
      },
    },
  };
}

// `beforeLoad: true` injects while readyState is still "loading", like
// document_start does in Firefox. jsdom fires DOMContentLoaded on a microtask
// right after construction, so assertions about the loading phase must run
// synchronously in `onInjected`.
async function load(
  html,
  { url = 'https://example.com/', settings = {}, beforeLoad = false, onInjected } = {}
) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (!beforeLoad && window.document.readyState !== 'complete') {
    await new Promise((r) => window.addEventListener('load', r));
  }
  const browser = fakeBrowser(settings);
  window.browser = browser.api;
  // jsdom doesn't implement media playback; record pause() calls instead.
  window.HTMLMediaElement.prototype.pause = function () {
    this.dataset.paused = '1';
  };
  const ctx = helpers(window, browser);
  for (const src of SCRIPTS) window.eval(src);
  if (onInjected) onInjected(ctx);
  await flush();
  await flush();
  return ctx;
}

function helpers(window, browser) {
  const doc = window.document;
  return {
    window,
    doc,
    browser,
    $: (sel) => doc.querySelector(sel),
    // True if el or any ancestor (crossing shadow roots) is blurred.
    isBlurred: (el) => {
      for (let n = el; n; n = n.parentNode?.nodeType === 11 ? n.parentNode.host : n.parentNode) {
        if (n.nodeType === 1 && n.hasAttribute('data-gta6-shield')) return true;
      }
      return false;
    },
    flush,
  };
}

module.exports = { load, flush };
