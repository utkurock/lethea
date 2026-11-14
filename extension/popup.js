// The toolbar popup: what Lethea has done in this browser, read from the counts background.js keeps.

const $ = (id) => document.getElementById(id);
$('version').textContent = ` ${chrome.runtime.getManifest().version}`;

function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function render(s) {
  const fmt = (n) => (n ?? 0).toLocaleString('en-US');
  $('tokens').textContent = fmt(s?.tokens?.length);
  $('posts').textContent = fmt(s?.posts);
  $('flags').textContent = fmt(s?.flags);
  $('opened').textContent = fmt((s?.swaps ?? 0) + (s?.pays ?? 0));

  const tokens = (s?.tokens ?? []).slice(-12).reverse();
  $('tokenList').replaceChildren(
    ...tokens.map((t) => {
      const chip = document.createElement('span');
      chip.textContent = `$${t}`;
      return chip;
    }),
  );

  const items = s?.recent ?? [];
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Open x.com and scroll. Lethea adds Swap buttons to cashtags and checks contracts and links as posts load.';
    $('activity').replaceChildren(empty);
  } else {
    const list = document.createElement('ul');
    for (const it of items.slice(0, 6)) {
      const li = document.createElement('li');
      li.className = it.kind;
      const dot = document.createElement('i');
      const text = document.createElement('span');
      text.textContent = it.text;
      text.title = it.text;
      const time = document.createElement('time');
      time.textContent = ago(it.at);
      li.append(dot, text, time);
      list.append(li);
    }
    $('activity').replaceChildren(list);
  }
  $('since').textContent = s?.since ? `Since ${new Date(s.since).toLocaleDateString()}. Stays in this browser.` : 'Counts stay in this browser.';
}

chrome.storage.local.get('stats').then(({ stats }) => render(stats));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.stats) render(changes.stats.newValue);
});
$('reset').addEventListener('click', () => chrome.storage.local.remove('stats').then(() => render(undefined)));
