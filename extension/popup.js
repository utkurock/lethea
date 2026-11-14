// The toolbar popup: what Lethea has done in this browser, read from the counts background.js keeps.
// Two tabs, like a wallet: Overview for the totals, Activity for the latest events.

const $ = (id) => document.getElementById(id);
$('version').textContent = ` ${chrome.runtime.getManifest().version}`;

const TABS = ['overview', 'activity'];
function show(name) {
  for (const t of TABS) {
    const on = t === name;
    $(`tab-${t}`).classList.toggle('on', on);
    $(`tab-${t}`).setAttribute('aria-selected', String(on));
    $(t).hidden = !on;
  }
}
for (const t of TABS) $(`tab-${t}`).addEventListener('click', () => show(t));

function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function empty(text) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  return p;
}

function render(s) {
  const fmt = (n) => (n ?? 0).toLocaleString('en-US');
  $('tokens').textContent = fmt(s?.tokens?.length);
  $('posts').textContent = fmt(s?.posts);
  $('flags').textContent = fmt(s?.flags);
  $('opened').textContent = fmt((s?.swaps ?? 0) + (s?.pays ?? 0));

  const tokens = (s?.tokens ?? []).slice(-15).reverse();
  if (tokens.length) {
    $('tokenList').replaceChildren(
      ...tokens.map((t) => {
        const chip = document.createElement('span');
        chip.textContent = `$${t}`;
        return chip;
      }),
    );
  } else {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Cashtags NEAR Intents lists show up here as you scroll x.com.';
    $('tokenList').replaceChildren(hint);
  }

  $('since').textContent = s?.since
    ? `Kept in this browser since ${new Date(s.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Kept in this browser only';
  const items = s?.recent ?? [];
  $('activityCount').textContent = items.length ? String(items.length) : '';
  if (!items.length) {
    $('activity').replaceChildren(empty('Nothing yet. Flags, swaps and payments land here as they happen on x.com.'));
    return;
  }
  const list = document.createElement('ul');
  for (const it of items) {
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

// The status pill is the on/off switch. The content script listens for `paused` and clears or redraws the page.
function showPaused(paused) {
  $('toggle').setAttribute('aria-pressed', String(!!paused));
  $('toggle').title = paused ? 'Turn Lethea back on' : 'Pause Lethea on x.com';
  $('toggleText').textContent = paused ? 'Paused' : 'Active on x.com';
  document.body.classList.toggle('paused', !!paused);
}
$('toggle').addEventListener('click', () => {
  const paused = $('toggle').getAttribute('aria-pressed') !== 'true';
  void chrome.storage.local.set({ paused });
  showPaused(paused);
});

chrome.storage.local.get(['stats', 'paused']).then(({ stats, paused }) => {
  render(stats);
  showPaused(paused);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.stats) render(changes.stats.newValue);
  if (changes.paused) showPaused(changes.paused.newValue);
});
$('reset').addEventListener('click', () => chrome.storage.local.remove('stats').then(() => render(undefined)));
