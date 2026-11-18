// Content script: blurs GTA VI items in place. On pages that are about GTA VI
// as a whole (title/URL/heading matches), also masks the tab title and blurs
// video players. Never blocks or removes anything. Runs at document_start in
// every frame.
(function () {
  'use strict';

  const { buildMatcher, DEFAULT_SETTINGS } = globalThis.GTAFilter;
  const { siteFor, GENERIC_CONTAINERS, BLOCK_ELEMENTS } = globalThis.GTAFilterSites;

  const BLUR_ATTR = 'data-gta6-shield';
  // Attribute values: matched item vs. media blurred because the page matched.
  // Page media is un-blurred again when an SPA navigates to an unrelated page.
  const ITEM = 'item';
  const PAGE = 'page';
  // Must not contain a filtered term, or the page check would match itself.
  const MASKED_TITLE = 'Spoiler hidden';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'TEMPLATE', 'TITLE']);
  // "post-title" carries the title on Reddit's <shreddit-post>.
  const CHECKED_ATTRS = ['alt', 'title', 'aria-label', 'href', 'post-title'];
  const PAGE_TITLE_SELECTOR = 'h1, meta[property="og:title"], meta[name="twitter:title"]';
  // Mirrors content.css, which doesn't reach into shadow roots.
  const INLINE_BLUR = { filter: 'blur(16px)', 'clip-path': 'inset(0)', 'pointer-events': 'none', 'user-select': 'none' };
  const MIN_TEXT_LENGTH = 4; // "GTA6"
  // A generic container (li, article, ...) with more text than this is likely a
  // whole page section rather than a single item, so don't blur it.
  const MAX_GENERIC_TEXT = 3000;
  // Unknown layouts: climb to the largest ancestor with at most this much text.
  const MAX_CARD_TEXT = 600;
  const MAX_CLIMB = 12;
  const REPORT_DELAY_MS = 250;

  const site = siteFor(location.hostname);
  const itemSelector = site.items.join(',');
  const mediaSelector = site.media.join(',');
  const genericSelector = GENERIC_CONTAINERS.join(',');
  const blockSelector = BLOCK_ELEMENTS.join(',');
  const isTop = window === window.top;
  const observeOptions = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: CHECKED_ATTRS,
  };

  // Fail closed: filter with the defaults until stored settings arrive.
  let active = true;
  let allowlisted = false;
  let matches = buildMatcher(DEFAULT_SETTINGS);
  // Elements blurred minimally while the page was still parsing; widened to
  // their full card at DOMContentLoaded.
  let pendingExpand = [];
  const shadowBlurred = new Set();
  const observedRoots = new WeakSet();

  let realTitle = '';
  let pageMatch = false;
  let reportTimer = 0;

  // --- Blurring --------------------------------------------------------------

  function isPageRoot(el) {
    return el === document.body || el === document.documentElement || el === document.head;
  }

  function asElement(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return node.host || null;
    return node.parentElement;
  }

  // Like Element.closest(), but continues past shadow-root boundaries.
  function closestAcross(el, selector) {
    while (el) {
      const found = el.closest(selector);
      if (found) return found;
      el = el.getRootNode().host || null;
    }
    return null;
  }

  function pauseMediaIn(el) {
    if (el.matches('video, audio')) el.pause();
    for (const m of el.querySelectorAll('video, audio')) m.pause();
  }

  function blur(el, kind = ITEM) {
    if (!el || isPageRoot(el)) return;
    const current = el.getAttribute(BLUR_ATTR);
    if (current === ITEM || current === kind) return; // an item blur is never downgraded
    el.setAttribute(BLUR_ATTR, kind);
    if (el.getRootNode() !== document) {
      for (const [prop, value] of Object.entries(INLINE_BLUR)) el.style.setProperty(prop, value, 'important');
      shadowBlurred.add(el);
    }
    pauseMediaIn(el);
    scheduleReport();
  }

  function unblur(el) {
    el.removeAttribute(BLUR_ATTR);
    if (shadowBlurred.delete(el)) {
      for (const prop of Object.keys(INLINE_BLUR)) el.style.removeProperty(prop);
    }
  }

  function unblurAll() {
    for (const el of document.querySelectorAll(`[${BLUR_ATTR}]`)) unblur(el);
    for (const el of [...shadowBlurred]) unblur(el);
    pendingExpand = [];
  }

  // Outermost blurred elements only, so nested blurs count once.
  function blurredCount() {
    const all = [...document.querySelectorAll(`[${BLUR_ATTR}]`)];
    for (const el of shadowBlurred) if (el.isConnected) all.push(el);
    return all.filter((el) => !closestAcross(asElement(el.parentNode), `[${BLUR_ATTR}]`)).length;
  }

  function containerFor(el) {
    const item = itemSelector && closestAcross(el, itemSelector);
    if (item) return item;

    const generic = closestAcross(el, genericSelector);
    if (generic && !isPageRoot(generic) && generic.textContent.length <= MAX_GENERIC_TEXT) {
      return generic;
    }

    let best = el;
    for (
      let i = 0, p = el.parentElement;
      i < MAX_CLIMB && p && !isPageRoot(p) && p.textContent.length <= MAX_CARD_TEXT;
      i++, p = p.parentElement
    ) {
      best = p;
    }
    const block = el.closest(blockSelector);
    return block && block.contains(best) ? block : best;
  }

  function blurMatch(el) {
    if (!el || isPageRoot(el)) return;
    // Already covered: skip the container search. Bounds the work a page with
    // thousands of matches inside one item can cause.
    if (closestAcross(el, `[${BLUR_ATTR}="${ITEM}"]`)) return;
    if (document.readyState === 'loading') {
      // Ancestors are still half-parsed, so their text length says nothing yet.
      const item = itemSelector && closestAcross(el, itemSelector);
      blur(item || el.closest(blockSelector) || el);
      if (!item) pendingExpand.push(el);
    } else {
      blur(containerFor(el));
    }
  }

  // --- Scanning --------------------------------------------------------------

  function checkText(node) {
    if (node.data.length < MIN_TEXT_LENGTH) return;
    const parent = node.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName) || parent.isContentEditable) return;
    if (matches(node.data)) blurMatch(parent);
  }

  function checkAttrs(el) {
    if (!el.hasAttributes() || SKIP_TAGS.has(el.tagName)) return;
    for (const attr of CHECKED_ATTRS) {
      if (attr === 'href' && el.tagName !== 'A') continue;
      const value = el.getAttribute(attr);
      if (value && matches(attr === 'href' ? safeDecode(value) : value)) {
        blurMatch(el);
        return;
      }
    }
  }

  // Catches text split across nodes, e.g. "<b>GTA</b> 6", inside a known item.
  function recheckItem(node) {
    const item = itemSelector && closestAcross(asElement(node), itemSelector);
    if (item && item.getAttribute(BLUR_ATTR) !== ITEM && matches(item.textContent)) blur(item);
  }

  function checkElement(el) {
    checkAttrs(el);
    if (itemSelector && el.matches(itemSelector) && matches(el.textContent)) blur(el);
    // openOrClosedShadowRoot is Firefox's content-script-only view of closed roots.
    const shadow = el.openOrClosedShadowRoot || el.shadowRoot;
    if (shadow) watchRoot(shadow);
  }

  function scan(root) {
    if (root.nodeType === Node.TEXT_NODE) return checkText(root);
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(root.tagName)) return;
      checkElement(root);
    } else if (root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) checkText(n);
      else checkElement(n);
    }
  }

  function watchRoot(root) {
    if (!observedRoots.has(root)) {
      observedRoots.add(root);
      observer.observe(root, observeOptions);
    }
    scan(root);
  }

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  // --- Pages about GTA VI ----------------------------------------------------

  function pageSignals() {
    const signals = [safeDecode(location.href), realTitle];
    for (const el of document.querySelectorAll(PAGE_TITLE_SELECTOR)) {
      signals.push(el.tagName === 'META' ? el.content : el.textContent);
      if (el.tagName === 'H1') break; // first h1 only; metas come from <head> first
    }
    return signals;
  }

  // Called on every mutation batch, so it must stay cheap. Handles SPA
  // navigation (YouTube/Reddit/X) in both directions.
  function checkPage() {
    if (document.title !== MASKED_TITLE) realTitle = document.title;
    const match = active && pageSignals().some(matches);

    if (match) {
      // The tab strip shows the title; it can't be blurred, so replace it.
      if (isTop && document.title !== MASKED_TITLE) document.title = MASKED_TITLE;
      for (const el of document.querySelectorAll(mediaSelector)) blur(el, PAGE);
    } else {
      if (isTop && document.title === MASKED_TITLE && realTitle) document.title = realTitle;
      if (pageMatch) for (const el of document.querySelectorAll(`[${BLUR_ATTR}="${PAGE}"]`)) unblur(el);
    }

    if (match !== pageMatch) {
      pageMatch = match;
      scheduleReport();
    }
  }

  // Blurred videos must not play (autoplay, keyboard shortcuts) — their audio
  // would still spoil.
  document.addEventListener(
    'play',
    (e) => {
      if (closestAcross(e.target, `[${BLUR_ATTR}]`)) e.target.pause();
    },
    true
  );

  // --- Reporting -------------------------------------------------------------

  function stats() {
    return { blurred: blurredCount(), pageMatch, active, allowlisted, hostname: location.hostname };
  }

  // Throttled badge update; only the top frame owns the tab's badge.
  function scheduleReport() {
    if (!isTop || reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = 0;
      browser.runtime.sendMessage({ type: 'gta6-shield:report', ...stats() }).catch(() => {});
    }, REPORT_DELAY_MS);
  }

  // --- Wiring ----------------------------------------------------------------

  // Mutation callbacks run as microtasks before the next paint, so blurring
  // synchronously here keeps matched content from ever being rendered sharp.
  const observer = new MutationObserver((mutations) => {
    if (!active) return;
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) scan(n);
        recheckItem(m.target);
      } else if (m.type === 'characterData') {
        checkText(m.target);
        recheckItem(m.target);
      } else {
        checkAttrs(m.target);
      }
    }
    checkPage();
  });

  observer.observe(document, observeOptions);

  document.addEventListener('DOMContentLoaded', () => {
    const pending = pendingExpand;
    pendingExpand = [];
    if (!active) return;
    for (const el of pending) if (el.isConnected) blur(containerFor(el));
  });

  function applySettings(settings) {
    allowlisted = settings.allowlist.includes(location.hostname);
    active = settings.enabled && !allowlisted;
    matches = buildMatcher(settings);
    unblurAll();
    pageMatch = false;
    if (active && document.documentElement) scan(document.documentElement);
    checkPage();
    scheduleReport();
  }

  if (document.documentElement) scan(document.documentElement);
  checkPage();

  const loadSettings = () => browser.storage.sync.get(DEFAULT_SETTINGS).then(applySettings);
  loadSettings();
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') loadSettings();
  });

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'gta6-shield:stats' && isTop) return Promise.resolve(stats());
  });
})();
