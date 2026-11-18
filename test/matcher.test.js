// Fixtures are deliberately generic phrases — never real GTA VI news, leaks,
// or names from the lore list.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildMatcher } = require('../src/matcher.js');

const matches = buildMatcher();

test('matches common spellings', () => {
  for (const s of [
    'GTA 6 trailer',
    'new GTA VI footage',
    'gta6',
    'GTAVI',
    'GTA-6',
    'GTA: VI',
    'Grand Theft Auto VI',
    'grand-theft-auto-6',
    'GrandTheftAuto6',
    '#GTA6',
    'r/GTA6',
  ]) {
    assert.ok(matches(s), s);
  }
});

test('matches hashtags with glued-on words', () => {
  for (const s of ['#GTA6Leaks', 'gta6news', '#playgta6', 'GTA6Online']) assert.ok(matches(s), s);
});

test('matches URL slugs and query strings', () => {
  assert.ok(matches('https://example.com/r/x/comments/abc/gta_6_discussion/'));
  assert.ok(matches('https://example.com/search?q=gta+6'));
});

test('matches other languages', () => {
  for (const s of ['侠盗猎车手6', '俠盜獵車手6', 'グランド・セフト・オート6', 'グラセフ6', 'ГТА 6']) {
    assert.ok(matches(s), s);
  }
});

test('defeats unicode tricks', () => {
  assert.ok(matches('GTA Ⅵ'), 'Roman numeral six');
  assert.ok(matches('GTA​6'), 'zero-width space');
  assert.ok(matches('ＧＴＡ６'), 'fullwidth letters and digit');
  assert.ok(matches('G­T­A 6'), 'soft hyphens');
});

test('does not match other games or near-misses', () => {
  for (const s of [
    'GTA V',
    'GTA 5',
    'GTA IV',
    'GTA VII',
    'GTA 60fps',
    'GTA 16',
    'GTA video',
    'gtavice',
    'Leonidas',
    'vita 6',
    'take two aspirin',
    '',
  ]) {
    assert.ok(!matches(s), s);
  }
});

test('lore terms follow the blockLore setting', () => {
  assert.ok(matches('Vice City'));
  assert.ok(matches('a trip to Leonida'));
  const relaxed = buildMatcher({ blockLore: false });
  assert.ok(!relaxed('Vice City'));
  assert.ok(relaxed('GTA 6'), 'core terms stay on');
});

test('publisher terms are opt-in', () => {
  assert.ok(!matches('Rockstar Games'));
  assert.ok(buildMatcher({ blockPublisher: true })('Rockstar Games'));
  assert.ok(!matches('rockstar energy drink'));
});

test('custom keywords are escaped and boundary-aware', () => {
  const m = buildMatcher({ keywords: ['Rockstar trailer', 'C++', '  ', 'next-gen'] });
  assert.ok(m('the Rockstar   trailer dropped'));
  assert.ok(m('learning C++ today'));
  assert.ok(m('next gen consoles'));
  assert.ok(!m('Rockstar trailers'));
  assert.ok(!m('C+'));
  assert.ok(!m('nothing here'));
});

test('matcher is stateless across calls', () => {
  assert.ok(matches('GTA 6'));
  assert.ok(matches('GTA 6'));
});
