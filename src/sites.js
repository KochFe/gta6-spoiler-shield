// Per-site selectors.
// - items: the element that represents one "item" (video card, post, tweet,
//   search result). When matching text is found, the closest one is blurred.
// - media: video players blurred when the page as a whole is about GTA VI
//   (its title/URL/heading matches), since a player has no text to match.
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
      ],
      media: ['#movie_player', 'ytd-reel-video-renderer'],
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

  // Text blocks blurred as a whole, so a blurred link doesn't leave the rest of
  // its sentence readable.
  const BLOCK_ELEMENTS = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'dt', 'dd', 'figcaption', 'summary',
  ];

  function siteFor(hostname) {
    const site = SITES.find((s) => s.host.test(hostname)) || {};
    return { items: site.items || [], media: [...(site.media || []), ...GENERIC_MEDIA] };
  }

  const api = { siteFor, GENERIC_CONTAINERS, BLOCK_ELEMENTS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GTAFilterSites = api;
})();
