// Per-site selectors.
// - items: the element that represents one "item" (video card, post, tweet,
//   search result). When matching text is found, the closest one is blurred.
// - media: video players blurred when the page as a whole is about GTA VI
//   (its title/URL/heading matches), since a player has no text to match.
// - search: search boxes incl. their suggestion dropdowns, which are not
//   filtered at all (user's choice; see GENERIC_SEARCH).
// Sites change their markup often; update these first when something slips
// through.
(function () {
  'use strict';

  const SITES = [
    {
      host: /(^|\.)youtube\.com$/,
      items: [
        'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
        'ytd-grid-video-renderer', 'ytd-reel-item-renderer', 'ytd-playlist-renderer',
        'ytd-playlist-panel-video-renderer', 'ytd-compact-radio-renderer', 'ytd-radio-renderer',
        'ytd-channel-renderer', 'ytd-comment-thread-renderer', 'ytd-notification-renderer',
        'ytd-post-renderer', 'ytd-backstage-post-thread-renderer', 'ytd-guide-entry-renderer',
        'yt-lockup-view-model', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
        // Player end screen and autoplay "up next".
        '.ytp-videowall-still', '.ytp-ce-element', '.ytp-autonav-endscreen-upnext-container',
        // Live chat (its own frame on youtube.com/live_chat): one message each.
        'yt-live-chat-text-message-renderer', 'yt-live-chat-paid-message-renderer',
        'yt-live-chat-membership-item-renderer', 'yt-live-chat-paid-sticker-renderer',
      ],
      media: ['#movie_player', 'ytd-reel-video-renderer'],
      search: ['yt-searchbox', 'ytd-searchbox'],
    },
    {
      host: /(^|\.)twitch\.tv$/,
      // One chat message each (live chat, VOD chat replay), so a match blurs
      // that message instead of the whole chat.
      items: [
        '.chat-line__message', '[data-a-target="chat-line-message"]', '.chat-line__status',
        '.user-notice-line', '.vod-message',
      ],
    },
    {
      host: /(^|\.)reddit\.com$/,
      items: ['shreddit-post', 'shreddit-comment', '[data-testid="search-post-unit"]', 'div.thing'],
    },
    {
      host: /(^|\.)(x|twitter)\.com$/,
      items: ['article[data-testid="tweet"]', '[data-testid="trend"]', '[data-testid="UserCell"]'],
    },
    {
      host: /(^|\.)bsky\.app$/,
      items: ['[data-testid^="feedItem-"]', '[data-testid^="postThreadItem-"]'],
    },
    {
      host: /(^|\.)google\.[a-z.]+$/,
      items: ['div.MjjYud', 'div.g', 'g-inner-card', 'div.related-question-pair'],
    },
    { host: /(^|\.)bing\.com$/, items: ['li.b_algo', 'li.b_ans'] },
    {
      host: /(^|\.)steampowered\.com$/,
      items: ['a.search_result_row', 'a.tab_item', '.store_capsule'],
      media: ['.highlight_player_area', '#highlight_player_area'],
    },
  ];

  // Used on every site (and as fallback on known sites).
  const GENERIC_CONTAINERS = ['article', 'li', '[role="article"]', '[role="listitem"]', 'figure'];

  const GENERIC_MEDIA = [
    'video',
    'iframe[src*="youtube.com/embed"]',
    'iframe[src*="youtube-nocookie.com/embed"]',
    'iframe[src*="player.twitch.tv"]',
    'iframe[src*="player.vimeo.com"]',
  ];

  // Search boxes/autocomplete widgets: never filtered, so typing a letter
  // doesn't blur the whole box when one suggestion mentions the game.
  // Suggestion listboxes linked via aria-controls/aria-owns count too (content.js).
  const GENERIC_SEARCH = ['[role="search"]', '[role="combobox"]'];

  // Append-only logs (chats). The card climb stops below them: a young chat has
  // little text and would pass as a "card", then stay blurred as it grows.
  const LOG_CONTAINERS = ['[role="log"]'];

  // Text blocks blurred as a whole, so a blurred link doesn't leave the rest of
  // its sentence readable.
  const BLOCK_ELEMENTS = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'dt', 'dd', 'figcaption', 'summary',
  ];

  function siteFor(hostname) {
    const site = SITES.find((s) => s.host.test(hostname)) || {};
    return {
      items: site.items || [],
      media: [...(site.media || []), ...GENERIC_MEDIA],
      search: [...(site.search || []), ...GENERIC_SEARCH],
    };
  }

  const api = { siteFor, GENERIC_CONTAINERS, BLOCK_ELEMENTS, LOG_CONTAINERS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GTAFilterSites = api;
})();
