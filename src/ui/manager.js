'use strict';
const $ = (s) => document.querySelector(s);

const SB_INFO = {
  sponsor: [T('Sponsor'), '#00d400'],
  selfpromo: [T('Kendi tanıtımı / ücretsiz tanıtım'), '#ffff00'],
  interaction: [T('Abone ol / beğen hatırlatması'), '#cc00ff'],
  intro: [T('Giriş / ara animasyon'), '#00ffff'],
  outro: [T('Kapanış / bitiş kartları'), '#0202ed'],
  preview: [T('Önizleme / özet'), '#008fd6'],
  music_offtopic: [T('Müzik videolarında müzik dışı bölüm'), '#ff9900'],
  filler: [T('Konu dışı dolgu'), '#7300ff'],
};

const STATUS = {
  queued: T('Sırada'),
  preparing: T('Hazırlanıyor…'),
  downloading: T('İndiriliyor'),
  processing: T('İşleniyor (birleştirme / dönüştürme)…'),
  done: T('Tamamlandı'),
  error: T('Başarısız'),
  canceled: T('İptal edildi'),
};

let state = { downloads: [], settings: null, presets: {}, sbCategories: [] };
const nodes = new Map();

// ------------------------------------------------------------ sekmeler
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'settings') loadTools();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ------------------------------------------------------------ indirme ekleme
$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#url').value.trim();
  const err = $('#add-error');
  err.hidden = true;
  if (!url) { $('#url').focus(); return; }
  const r = await window.pt.add({ url, preset: $('#preset').value, playlist: $('#playlist').checked });
  if (r.ok) {
    $('#url').value = '';
    $('#playlist').checked = false;
  } else {
    err.textContent = T(r.error);
    err.hidden = false;
  }
});

$('#url').addEventListener('input', () => {
  const v = $('#url').value;
  if (/[?&]list=/.test(v) && !/[?&]list=RD/.test(v) && /\/playlist\?/.test(v)) $('#playlist').checked = true;
});

$('#paste').addEventListener('click', async () => {
  $('#url').value = (await window.pt.clipboard()).trim();
  $('#url').dispatchEvent(new Event('input'));
  $('#url').focus();
});
$('#open-folder').addEventListener('click', () => window.pt.openFolder());
$('#clear').addEventListener('click', () => window.pt.clearFinished());

// ------------------------------------------------------------ liste
function btn(label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function render(item) {
  if (item.removed) {
    const n = nodes.get(item.id);
    if (n) n.remove();
    nodes.delete(item.id);
    state.downloads = state.downloads.filter((d) => d.id !== item.id);
    updateSummary();
    return;
  }
  const idx = state.downloads.findIndex((d) => d.id === item.id);
  if (idx >= 0) state.downloads[idx] = item; else state.downloads.unshift(item);

  let li = nodes.get(item.id);
  if (!li) {
    li = $('#item-tpl').content.firstElementChild.cloneNode(true);
    nodes.set(item.id, li);
    const img = li.querySelector('.thumb');
    if (item.videoId) img.src = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
    img.addEventListener('error', () => { img.removeAttribute('src'); });
    img.addEventListener('dblclick', () => window.pt.openInApp(item.url));
    const list = $('#list');
    // Yeni öğeler en üste
    const pos = state.downloads.findIndex((d) => d.id === item.id);
    const next = state.downloads.slice(pos + 1).map((d) => nodes.get(d.id)).find(Boolean);
    list.insertBefore(li, next || null);
  }

  li.className = 'item ' + item.status;
  const indeterminate = item.status === 'processing' || (item.status === 'preparing' && !item.progress) || item.status === 'queued' && false;
  li.classList.toggle('indeterminate', indeterminate);

  li.querySelector('.title').textContent = item.title || item.url;
  li.querySelector('.title').title = item.title || item.url;

  const meta = [STATUS[item.status] || item.status];
  if (item.status === 'downloading') {
    meta[0] += ` %${Math.floor((item.progress || 0) * 100)}`;
    if (item.part > 1) meta.push(item.part === 2 ? T('ses parçası') : T('parça {0}', item.part));
    if (item.size) meta.push(item.size);
    if (item.speed) meta.push(item.speed);
    if (item.eta) meta.push(T('kalan {0}', item.eta));
  }
  if (item.plCount) meta.push(T('liste: {0}/{1}', item.plIndex || '?', item.plCount));
  meta.push(T(item.presetLabel));
  li.querySelector('.meta').textContent = meta.join(' · ');

  const fill = li.querySelector('.fill');
  fill.style.width = (item.status === 'done' ? 100 : (item.progress || 0) * 100) + '%';
  li.querySelector('.err').textContent = item.error ? T(item.error) : '';

  const actions = li.querySelector('.actions');
  actions.replaceChildren();
  const active = ['queued', 'preparing', 'downloading', 'processing'].includes(item.status);
  if (active) actions.append(btn(T('İptal'), () => window.pt.cancel(item.id)));
  if (item.status === 'done') {
    actions.append(btn(T('Oynat'), () => window.pt.openFile(item.id)), btn(T('Klasörde göster'), () => window.pt.showFile(item.id)));
  }
  if (item.status === 'error' || item.status === 'canceled') actions.append(btn(T('Tekrar dene'), () => window.pt.retry(item.id)));
  if (!active) actions.append(btn('✕', () => window.pt.remove(item.id)));
  actions.lastChild.title = active ? T('İptal') : T('Listeden kaldır');

  updateSummary();
}

function updateSummary() {
  const d = state.downloads;
  const active = d.filter((x) => ['queued', 'preparing', 'downloading', 'processing'].includes(x.status)).length;
  const done = d.filter((x) => x.status === 'done').length;
  $('#summary').textContent = d.length ? T('{0} etkin · {1} tamamlandı · {2} toplam', active, done, d.length) : '';
  $('#empty').style.display = d.length ? 'none' : 'block';
}

// ------------------------------------------------------------ ayarlar
function fillPresets(select, value) {
  select.replaceChildren();
  for (const [k, label] of Object.entries(state.presets)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = T(label);
    select.append(o);
  }
  select.value = value;
}

function bindSwitch(id, get, set) {
  const el = $(id);
  el.checked = get(state.settings);
  el.onchange = () => window.pt.setSettings(set(el.checked));
}

function renderSettings() {
  const s = state.settings;
  $('#dir').textContent = s.download.dir;
  $('#s-preset').value = s.download.preset;
  $('#s-concurrency').value = String(s.download.concurrency);
  $('#s-cookies').value = s.download.cookies;
  $('#s-channel').value = s.tools.channel;
  $('#s-lang').value = s.ui.lang || (window.pt.i18n && window.pt.i18n.lang) || 'tr';
  if (document.activeElement !== $('#s-sublangs')) $('#s-sublangs').value = s.download.subLangs;

  bindSwitch('#s-thumb', (x) => x.download.embedThumbnail, (v) => ({ download: { embedThumbnail: v } }));
  bindSwitch('#s-chapters', (x) => x.download.embedChapters, (v) => ({ download: { embedChapters: v } }));
  bindSwitch('#s-subs', (x) => x.download.subtitles, (v) => ({ download: { subtitles: v } }));
  bindSwitch('#s-sbcut', (x) => x.download.sponsorblockRemove, (v) => ({ download: { sponsorblockRemove: v } }));
  bindSwitch('#s-tray', (x) => x.ui.closeToTray, (v) => ({ ui: { closeToTray: v } }));
  bindSwitch('#s-notify', (x) => x.download.notify, (v) => ({ download: { notify: v } }));
  bindSwitch('#s-adblock', (x) => x.adblock, (v) => ({ adblock: v }));
  bindSwitch('#s-novideo', (x) => !!(x.music && x.music.videoOff), (v) => ({ music: { videoOff: v } }));
  $('#s-musicpreset').value = s.download.musicPreset || 'mp3';
  bindSwitch('#s-sb', (x) => x.sponsorblock.enabled, (v) => ({ sponsorblock: { enabled: v } }));
  bindSwitch('#s-sbnotify', (x) => x.sponsorblock.notify, (v) => ({ sponsorblock: { notify: v } }));
  bindSwitch('#s-sbmarkers', (x) => x.sponsorblock.showMarkers, (v) => ({ sponsorblock: { showMarkers: v } }));

  const cats = $('#sb-cats');
  cats.replaceChildren();
  for (const c of state.sbCategories) {
    const [name, color] = SB_INFO[c] || [c, '#fff'];
    const label = document.createElement('label');
    label.className = 'cat';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = color;
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = name;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'switch';
    cb.checked = !!s.sponsorblock.categories[c];
    cb.onchange = () => window.pt.setSettings({ sponsorblock: { categories: { [c]: cb.checked } } });
    label.append(dot, n, cb);
    cats.append(label);
  }
}

$('#s-preset').addEventListener('change', (e) => { window.pt.setSettings({ download: { preset: e.target.value } }); $('#preset').value = e.target.value; });
$('#s-concurrency').addEventListener('change', (e) => window.pt.setSettings({ download: { concurrency: Number(e.target.value) } }));
$('#s-musicpreset').addEventListener('change', (e) => window.pt.setSettings({ download: { musicPreset: e.target.value } }));
$('#s-cookies').addEventListener('change', (e) => window.pt.setSettings({ download: { cookies: e.target.value } }));
$('#s-channel').addEventListener('change', (e) => window.pt.setSettings({ tools: { channel: e.target.value } }));
$('#s-sublangs').addEventListener('change', (e) => window.pt.setSettings({ download: { subLangs: e.target.value } }));
$('#choose-dir').addEventListener('click', () => window.pt.chooseDir());
$('#s-lang').addEventListener('change', async (e) => {
  const ok = await window.pt.setLang(e.target.value);
  if (!ok) e.target.value = (window.pt.i18n && window.pt.i18n.lang) || 'tr';
});
$('#clear-data').addEventListener('click', () => window.pt.clearData());

$('#refresh-filters').addEventListener('click', async (e) => {
  const b = e.target;
  b.disabled = true;
  b.textContent = T('Güncelleniyor…');
  const r = await window.pt.refreshFilters();
  b.disabled = false;
  b.textContent = T('Şimdi güncelle');
  $('#filters-info').textContent = r.ok ? T('Az önce güncellendi') : T('Güncellenemedi: {0}', r.error);
});

async function loadTools() {
  const v = await window.pt.tools();
  $('#v-ytdlp').textContent = T(v.ytdlp);
  $('#v-deno').textContent = T(v.deno);
  $('#v-ffmpeg').textContent = T(v.ffmpeg);
}

$('#update-tools').addEventListener('click', async (e) => {
  const b = e.target;
  b.disabled = true;
  b.textContent = T('Güncelleniyor…');
  const r = await window.pt.updateTools();
  b.disabled = false;
  b.textContent = T('Şimdi güncelle');
  if (r.ok) loadTools(); else $('#v-ytdlp').textContent = T('Hata: {0}', r.error);
});

function toolsBanner({ status, text }) {
  const b = $('#tools-banner');
  if (status === 'installing' || status === 'updating') {
    b.hidden = false;
    b.className = 'banner';
    b.textContent = T('{0} (indirmeler bitince otomatik başlar)', T(text));
  } else if (status === 'error') {
    b.hidden = false;
    b.className = 'banner err';
    b.textContent = T(text);
  } else {
    b.hidden = true;
    if ($('#tab-settings').classList.contains('active')) loadTools();
  }
}

// ------------------------------------------------------------ başlat
(async () => {
  const init = await window.pt.init();
  state = { ...state, ...init, downloads: [] };
  fillPresets($('#preset'), init.settings.download.preset);
  fillPresets($('#s-preset'), init.settings.download.preset);
  for (const d of [...init.downloads].reverse()) render(d);
  updateSummary();
  renderSettings();
  $('#about').textContent = `Tubify ${init.version}`;

  const params = new URLSearchParams(location.search);
  if (params.get('url')) $('#url').value = params.get('url');
  showTab(params.get('tab') || 'downloads');

  window.pt.onDownload(render);
  window.pt.onSettings((s) => { state.settings = s; renderSettings(); });
  window.pt.onToolsStatus(toolsBanner);
  window.pt.onNavigate(({ tab, url }) => {
    showTab(tab || 'downloads');
    if (url) { $('#url').value = url; $('#url').focus(); }
  });
})();
