// Event page: owns the toolbar badge. Stateless, so it's fine for Firefox to
// suspend it between messages.
(function () {
  'use strict';

  const { DEFAULT_SETTINGS } = globalThis.GTAFilter;

  browser.action.setBadgeBackgroundColor({ color: '#5b5b66' });
  browser.action.setBadgeTextColor({ color: '#ffffff' });

  // Global badge shows "off" while filtering is disabled; per-tab text wins
  // over it, so tabs report null when they have nothing to show.
  async function refreshGlobalBadge() {
    const { enabled } = await browser.storage.sync.get(DEFAULT_SETTINGS);
    browser.action.setBadgeText({ text: enabled ? '' : 'off' });
  }

  browser.runtime.onInstalled.addListener(refreshGlobalBadge);
  browser.runtime.onStartup.addListener(refreshGlobalBadge);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'enabled' in changes) refreshGlobalBadge();
  });

  // Only our own content scripts can reach this (no externally_connectable),
  // but validate anyway: content scripts live inside untrusted pages.
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== browser.runtime.id || !sender.tab || sender.frameId !== 0) return;
    if (msg?.type !== 'gta6-shield:report' || !Number.isSafeInteger(msg.blurred)) return;
    let text = null;
    if (msg.allowlisted === true) text = 'II';
    else if (msg.blurred > 0) text = msg.blurred > 999 ? '999+' : String(msg.blurred);
    browser.action.setBadgeText({ tabId: sender.tab.id, text });
  });
})();
