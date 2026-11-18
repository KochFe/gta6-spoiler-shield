(function () {
  'use strict';

  const { DEFAULT_SETTINGS } = globalThis.GTAFilter;
  const $ = (id) => document.getElementById(id);

  let settings = { ...DEFAULT_SETTINGS };
  let tabStats = null; // null on pages without the content script (about:, AMO)

  const getSettings = () => browser.storage.sync.get(DEFAULT_SETTINGS);
  const save = (patch) => browser.storage.sync.set(patch);

  async function fetchStats() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      tabStats = (await browser.tabs.sendMessage(tab.id, { type: 'gta6-shield:stats' })) || null;
    } catch {
      tabStats = null;
    }
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('blockLore').checked = settings.blockLore;
    $('blockPublisher').checked = settings.blockPublisher;

    const paused = tabStats && settings.allowlist.includes(tabStats.hostname);
    $('state').textContent = !settings.enabled
      ? 'Off: spoilers can get through'
      : paused
        ? 'Paused on this site'
        : 'Active';
    document.body.classList.toggle('off', !settings.enabled);

    $('site').hidden = !tabStats || !tabStats.hostname;
    if (tabStats && tabStats.hostname) {
      $('hostname').textContent = tabStats.hostname;
      const n = tabStats.blurred;
      $('page-stats').textContent = paused
        ? 'Nothing is filtered here'
        : `${n} item${n === 1 ? '' : 's'} blurred` + (tabStats.pageMatch ? ' · tab title hidden' : '');
      $('pause').textContent = paused ? 'Resume here' : 'Pause here';
      $('pause').disabled = !settings.enabled;
    }

    const list = $('paused-list');
    list.replaceChildren(
      ...settings.allowlist.map((host) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = host;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Resume';
        remove.addEventListener('click', () => update({ allowlist: settings.allowlist.filter((h) => h !== host) }));
        li.append(name, remove);
        return li;
      })
    );
    $('paused-section').hidden = settings.allowlist.length === 0;
  }

  async function update(patch) {
    settings = { ...settings, ...patch };
    render();
    await save(patch);
    // Give content scripts a moment to rescan before reading their stats.
    setTimeout(async () => {
      await fetchStats();
      render();
    }, 150);
  }

  for (const key of ['enabled', 'blockLore', 'blockPublisher']) {
    $(key).addEventListener('change', (e) => update({ [key]: e.target.checked }));
  }

  $('pause').addEventListener('click', () => {
    const host = tabStats.hostname;
    const allowlist = settings.allowlist.includes(host)
      ? settings.allowlist.filter((h) => h !== host)
      : [...settings.allowlist, host];
    update({ allowlist });
  });

  function saveKeywords() {
    const keywords = [...new Set($('keywords').value.split('\n').map((k) => k.trim()).filter(Boolean))];
    $('keywords').value = keywords.join('\n');
    update({ keywords });
    $('saved').hidden = false;
    setTimeout(() => ($('saved').hidden = true), 1500);
  }

  $('save').addEventListener('click', saveKeywords);
  $('keywords').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveKeywords();
  });

  Promise.all([getSettings(), fetchStats()]).then(([stored]) => {
    settings = stored;
    $('keywords').value = settings.keywords.join('\n');
    render();
  });
})();
