// Text matching for GTA VI content. Loaded as a classic script in the content
// script, background and popup (exposes globalThis.GTAFilter) and via
// require() in tests.
(function () {
  'use strict';

  // Custom "word boundaries": unlike \b these also treat "_" as a separator,
  // so URL slugs like "gta_6_trailer" match.
  const B = '(?<![a-z0-9])';
  const E = '(?![a-z0-9])';
  const SEP = '[\\s\\-_.:+]*';
  // "6" may be followed by letters (#GTA6Leaks) but not digits (GTA 60fps).
  // "vi" must not be followed by letters, or "GTA video" would match.
  const SIX_OR_VI = `(?:vi${E}|6(?![0-9]))`;

  // Always on. Names of the game itself, in any spelling.
  const CORE_PATTERNS = [
    `${B}gta${SEP}vi${E}`,
    `(?<![0-9])gta${SEP}6(?![0-9])`,
    `${B}grand${SEP}theft${SEP}auto${SEP}${SIX_OR_VI}`,
    `(?:侠盗猎车手|俠盜獵車手|グランド・?セフト・?オート|グラセフ)${SEP}${SIX_OR_VI}`,
    `гта${SEP}(?:6|vi)(?![0-9])`,
  ];

  // MILD SPOILERS BELOW: official marketing names for the setting and cast.
  // Kept out of the UI on purpose. Don't read if you want to go in fresh.
  // "vice city" also hides old Vice City content; that trade-off is intentional.
  const LORE_TERMS = [
    'leonida', 'vice city', 'port gellhorn', 'mount kalaga', 'grassrivers',
    'lucia caminos', 'jason duval', 'cal hampton', 'boobie ike', 'raul bautista',
    'brian heder', 'real dimez', "dre'quan priest", 'drequan priest',
  ];

  // Off by default: almost all their news is about GTA VI right now.
  const PUBLISHER_TERMS = [
    'rockstar games', 'rockstar north', 'rockstar newswire', 'take-two interactive',
    'strauss zelnick',
  ];

  const DEFAULT_SETTINGS = {
    enabled: true,
    blockLore: true,
    blockPublisher: false,
    keywords: [],
    allowlist: [],
  };

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Plain keyword -> pattern. Spaces, "-" and "_" match any separator (or none).
  function keywordToPattern(keyword) {
    const k = normalize(keyword.trim());
    const body = escapeRegExp(k).replace(/[\s\-_]+/g, SEP);
    return (/^[a-z0-9]/i.test(k) ? B : '') + body + (/[a-z0-9]$/i.test(k) ? E : '');
  }

  // NFKC folds look-alikes (Roman numeral "Ⅵ", fullwidth "ＧＴＡ６") into ASCII.
  // Zero-width characters and soft hyphens are stripped so "GTA​6" matches.
  function normalize(text) {
    return text
      .normalize('NFKC')
      .replace(/[​-‍⁠﻿­]/g, '')
      .replace(/[‘’ʼ]/g, "'");
  }

  function buildMatcher(settings = {}) {
    const { blockLore, blockPublisher, keywords } = { ...DEFAULT_SETTINGS, ...settings };
    const terms = [
      ...(blockLore ? LORE_TERMS : []),
      ...(blockPublisher ? PUBLISHER_TERMS : []),
      ...keywords.filter((k) => typeof k === 'string' && k.trim()),
    ];
    // No "g" flag: a global regex keeps lastIndex between test() calls.
    const re = new RegExp(CORE_PATTERNS.concat(terms.map(keywordToPattern)).join('|'), 'i');
    return (text) => !!text && re.test(normalize(text));
  }

  const api = { buildMatcher, normalize, DEFAULT_SETTINGS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GTAFilter = api;
})();
