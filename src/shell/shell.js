'use strict';
/* global shell */
const $ = (s, r = document) => r.querySelector(s);

const IC = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  shuffle: 'M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  repeatOne: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z',
  autoplay: 'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
  more: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  heartO: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  note: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z',
  queue: 'M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  next: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  list: 'M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z',
  remove: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  radio: 'M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.89 2 2 2h16c1.11 0 2-.9 2-2V8c0-1.11-.89-2-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 9.5 16a6.5 6.5 0 0 0 4.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
  folder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  artist: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  album: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z',
};

const S = {
  mode: 'video', collapsed: false, pageOpen: false, strip: false, canBack: false, canForward: false, musicUrl: '',
  lib: { liked: [], playlists: [], history: [] },
  account: { loggedIn: null },
  queue: { queue: [], index: -1, active: false, shuffle: false, repeat: 'off', autoplay: true, source: null },
  media: { video: null, music: null },
  chip: 'local',
  filter: '',
  page: null, // { type: 'list', id } | { type: 'queue' } | { type: 'search' } | { type: 'nowplaying' }
  upnext: [],
  music: { videoOff: false },
  selected: null,
};

// ------------------------------------------------------------------ yardımcılar
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', IC[name] || name);
  s.append(p);
  return s;
}
const fmt = (s) => {
  s = Math.round(s || 0);
  if (!s) return '';
  const hr = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const ss = String(x).padStart(2, '0');
  return hr ? `${hr}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
function total(tracks) {
  const s = tracks.reduce((a, t) => a + (t.duration || 0), 0);
  if (!s) return '';
  const hr = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return hr ? T('{0} sa {1} dk', hr, m) : T('{0} dk', m);
}
function hue(str) { let x = 0; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; }
function img(src) { const i = h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }); i.onerror = () => { i.style.visibility = 'hidden'; }; return i; }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function lists() { return S.lib.playlists; }
function listById(id) {
  if (id === 'liked') return { id, name: T('Beğenilen şarkılar'), tracks: S.lib.liked, kind: 'liked' };
  if (id === 'history') return { id, name: T('Son çalınanlar'), tracks: S.lib.history, kind: 'history' };
  const p = S.lib.playlists.find((x) => x.id === id);
  return p ? { ...p, kind: 'playlist' } : null;
}
const isLiked = (id) => S.lib.liked.some((t) => t.id === id);
const nowId = () => (S.media.music && S.media.music.id) || null;
const musicPlaying = () => !!(S.media.music && S.media.music.playing);

function coverFor(kind, tracks, size) {
  if (kind === 'liked') return h('div', { class: 'cover liked' }, icon('heart'));
  if (kind === 'queue') return h('div', { class: 'cover queue' }, icon('queue'));
  if (kind === 'history') return h('div', { class: 'cover history' }, icon('history'));
  if (kind === 'downloads') return h('div', { class: 'cover downloads' }, icon('download'));
  const arts = [...new Set((tracks || []).map((t) => t.art).filter(Boolean))];
  if (arts.length >= 4) return h('div', { class: 'cover mosaic' }, arts.slice(0, 4).map(img));
  if (arts.length) return h('div', { class: 'cover' }, img(arts[0]));
  return h('div', { class: 'cover empty' }, icon('note'));
}

// ------------------------------------------------------------------ menü
function closeMenu() { $('#menu').hidden = true; $('#menu').replaceChildren(); }
function openMenu(items, x, y, upFrom) {
  const m = $('#menu');
  m.replaceChildren();
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h('div', { class: 'msep' })); continue; }
    if (it.head) { m.append(h('div', { class: 'mhead', text: it.head })); continue; }
    m.append(h('button', { class: 'mi' + (it.danger ? ' danger' : ''), onclick: (e) => { e.stopPropagation(); closeMenu(); it.run(); } },
      it.icon ? icon(it.icon) : h('span', { style: { width: '18px' } }), h('span', { class: 'l', text: it.label }), it.hint ? h('span', { class: 'h', text: it.hint }) : null));
  }
  m.hidden = false;
  const bottomLimit = window.innerHeight - (S.strip ? 88 : 8);
  const w = m.offsetWidth, ht = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
  const top = upFrom !== undefined ? upFrom - ht - 8 : Math.min(y, bottomLimit - ht);
  m.style.top = Math.max(8, top) + 'px';
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#menu')) closeMenu(); });
window.addEventListener('blur', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

function trackMenu(t, ctx) {
  const items = [
    { head: t.title + (t.artist ? ' · ' + t.artist : '') },
    { icon: 'queue', label: T('Sıraya ekle'), run: () => { shell.lib.enqueue([t], false); toast(T('Sıraya eklendi')); } },
    { icon: 'next', label: T('Sonra çal'), run: () => { shell.lib.enqueue([t], true); toast(T('Sıradaki şarkı olarak eklendi')); } },
    { sep: true },
    isLiked(t.id)
      ? { icon: 'heart', label: T('Beğenilenlerden çıkar'), run: () => { shell.lib.like(t, false); toast(T('Beğenilenlerden çıkarıldı')); } }
      : { icon: 'heartO', label: T('Beğenilen şarkılara ekle'), run: () => { shell.lib.like(t, true); toast(T('Beğenilen şarkılara eklendi')); } },
    { head: T('Listeye ekle') },
    { icon: 'add', label: T('Yeni liste oluştur…'), run: async () => { const p = await shell.lib.create(''); shell.lib.add(p.id, [t]); openPage({ type: 'list', id: p.id, rename: true }); } },
    ...lists().filter((p) => !ctx || p.id !== ctx.listId).map((p) => ({ icon: 'list', label: p.name, hint: String(p.tracks.length), run: () => { shell.lib.add(p.id, [t]); toast(T('"{0}" listesine eklendi', p.name)); } })),
    { sep: true },
    ctx && ctx.removable ? { icon: 'remove', label: T('Bu listeden kaldır'), danger: true, run: () => ctx.remove() } : null,
    { icon: 'radio', label: T('Şarkı radyosunu başlat'), run: () => shell.musicGo({ kind: 'radio', videoId: t.id }) },
    { icon: 'download', label: T('MP3 olarak indir'), run: () => shell.lib.downloadTracks([t], 'mp3').then(() => toast(T('İndirme sıraya eklendi'))) },
    { icon: 'download', label: T('M4A olarak indir'), run: () => shell.lib.downloadTracks([t], 'm4a').then(() => toast(T('İndirme sıraya eklendi'))) },
    { icon: 'link', label: T('Bağlantıyı kopyala'), run: () => navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${t.id}`).then(() => toast(T('Bağlantı kopyalandı'))) },
  ];
  return items;
}

// ------------------------------------------------------------------ üst çubuk
function renderTop() {
  document.body.classList.toggle('mode-video', S.mode === 'video');
  document.body.classList.toggle('mode-music', S.mode === 'music');
  document.body.classList.toggle('collapsed', S.collapsed);
  document.body.classList.toggle('strip', S.strip);
  $('#nav-back').disabled = !(S.canBack || (S.mode === 'music' && S.page));
  $('#nav-forward').disabled = !S.canForward;
  renderNowPlaying();
}

function renderNowPlaying() {
  const other = S.mode === 'video' ? 'music' : 'video';
  const m = S.media[other];
  const np = $('#np');
  if (!m || !m.id || !m.title) { np.hidden = true; return; }
  np.hidden = false;
  np.dataset.kind = other;
  $('#np-art').src = m.art || '';
  $('#np-title').textContent = m.title;
  $('#np-sub').textContent = (other === 'music' ? T('Müzik') + ' · ' : T('Video') + ' · ') + (m.artist || '');
  $('#np-toggle-path').setAttribute('d', m.playing ? IC.pause : IC.play);
  $('#np-prev').hidden = other !== 'music';
  $('#np-next').hidden = other !== 'music';
}

$('#switcher').addEventListener('click', (e) => {
  const b = e.target.closest('.sw-opt');
  if (b) shell.setMode(b.dataset.mode);
});
$('#nav-back').onclick = () => { if (S.mode === 'music' && S.page) closePage(); else shell.nav('back'); };
$('#nav-forward').onclick = () => shell.nav('forward');
$('#nav-reload').onclick = () => { if (S.mode === 'music' && S.page) renderPage(); else shell.nav('reload'); };
$('#dl-btn').onclick = () => shell.openManager('downloads');
$('#settings-btn').onclick = () => shell.openManager('settings');
$('#more-btn').onclick = () => shell.menu();
$('#np-text').onclick = () => shell.setMode($('#np').dataset.kind);
$('#np-toggle').onclick = () => {
  const k = $('#np').dataset.kind;
  if (k === 'music') shell.player('toggle'); else shell.media(k, 'toggle');
};
$('#np-next').onclick = () => (S.queue.active ? shell.player('next') : shell.media('music', 'next'));
$('#np-prev').onclick = () => (S.queue.active ? shell.player('prev') : shell.media('music', 'prev'));

// ------------------------------------------------------------------ yan panel
document.querySelectorAll('.sb-link[data-go]').forEach((b) => {
  b.onclick = () => { closePage(); shell.musicGo({ kind: 'browse', browseId: b.dataset.go }); };
});
$('.sb-link[data-page="search"]').onclick = () => openPage({ type: 'search' });
$('#collapse-btn').onclick = () => shell.setSidebar(!S.collapsed);
$('#new-list-btn').onclick = createList;
$('#lib-filter').addEventListener('input', (e) => { S.filter = e.target.value.trim().toLowerCase(); renderSidebar(); });
$('#chips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  S.chip = c.dataset.chip;
  document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
  renderSidebar();
});

async function createList() {
  const p = await shell.lib.create('');
  openPage({ type: 'list', id: p.id, rename: true });
}

function sbItem({ key, cover, name, sub, active, playing, onclick, oncontext }) {
  return h('button', { class: 'sb-item' + (active ? ' active' : '') + (playing ? ' playing' : ''), title: name, onclick, oncontextmenu: oncontext, 'data-key': key },
    cover, h('div', { class: 'meta' }, h('div', { class: 'name', text: name }), h('div', { class: 'sub', text: sub })),
    playing ? h('span', { class: 'eq' + (musicPlaying() ? '' : ' paused') }, h('i'), h('i'), h('i')) : null);
}

function isPageActive(type, id) { return S.page && S.page.type === type && (id === undefined || S.page.id === id); }
function sourcePlaying(listId) { return S.queue.active && S.queue.source && S.queue.source.listId === listId; }

function renderSidebar() {
  const box = $('#sb-list');
  box.replaceChildren();
  const f = S.filter;
  const match = (s) => !f || String(s).toLowerCase().includes(f);
  const acc = S.account;
  $('#chip-account').hidden = !acc.loggedIn;
  if (!acc.loggedIn && S.chip === 'account') { S.chip = 'local'; document.querySelector('.chip[data-chip="local"]').classList.add('active'); }

  if (S.chip === 'account' && acc.loggedIn) {
    const sec = (title, items, round) => {
      const shown = items.filter((i) => match(i.title));
      if (!shown.length) return;
      box.append(h('div', { class: 'sb-section', text: title }));
      for (const it of shown) {
        box.append(sbItem({
          key: it.id,
          cover: h('div', { class: 'cover' + (round ? ' round' : '') }, it.thumb ? img(it.thumb) : icon('note')),
          name: it.title, sub: it.subtitle,
          onclick: () => { closePage(); shell.musicGo({ kind: 'browse', browseId: it.id }); },
        }));
      }
    };
    sec(T('Çalma listeleri'), acc.playlists || []);
    sec(T('Albümler'), acc.albums || []);
    sec(T('Sanatçılar'), acc.artists || [], true);
    return;
  }

  const fixed = [
    { key: 'liked', kind: 'liked', name: T('Beğenilen şarkılar'), sub: T('Çalma listesi · {0} şarkı', S.lib.liked.length), page: { type: 'list', id: 'liked' } },
    { key: 'queue', kind: 'queue', name: T('Çalma sırası'), sub: S.queue.queue.length ? T('{0} şarkı sırada', Math.max(0, S.queue.queue.length - S.queue.index - 1)) : T('Boş'), page: { type: 'queue' } },
    { key: 'history', kind: 'history', name: T('Son çalınanlar'), sub: T('{0} şarkı', S.lib.history.length), page: { type: 'list', id: 'history' } },
  ];
  for (const it of fixed) {
    if (!match(it.name)) continue;
    box.append(sbItem({
      key: it.key, cover: coverFor(it.kind), name: it.name, sub: it.sub,
      active: isPageActive(it.page.type, it.page.id), playing: sourcePlaying(it.key),
      onclick: () => openPage(it.page),
    }));
  }
  const pls = lists().filter((p) => match(p.name));
  if (lists().length) box.append(h('div', { class: 'sb-section', text: T('Çalma listelerin') }));
  for (const p of pls) {
    box.append(sbItem({
      key: p.id, cover: coverFor('playlist', p.tracks), name: p.name, sub: T('Çalma listesi · {0} şarkı', p.tracks.length),
      active: isPageActive('list', p.id), playing: sourcePlaying(p.id),
      onclick: () => openPage({ type: 'list', id: p.id }),
      oncontext: (e) => { e.preventDefault(); openMenu(listMenu(listById(p.id)), e.clientX, e.clientY); },
    }));
  }
  if (!lists().length && !f) {
    box.append(h('div', { class: 'sb-empty' },
      h('b', { text: T('İlk çalma listeni oluştur') }),
      h('p', { text: T('Kolay, sana yardımcı olacağız. Hesap gerekmez.') }),
      h('button', { class: 'pill-btn', text: T('Çalma listesi oluştur'), onclick: createList })));
  }
  if (match(T('İndirilenler'))) {
    box.append(h('div', { class: 'sb-section', text: T('Arşiv') }));
    box.append(sbItem({ key: 'downloads', cover: coverFor('downloads'), name: T('İndirilenler'), sub: T('İndirme yöneticisi'), onclick: () => shell.openManager('downloads') }));
  }
}

function markNav() {
  let path = '';
  try { path = new URL(S.musicUrl).pathname; } catch { /* yoksay */ }
  document.querySelectorAll('.sb-link').forEach((b) => {
    let on = false;
    if (b.dataset.page === 'search') on = isPageActive('search');
    else if (!S.page) on = (b.dataset.go === 'FEmusic_home' && path === '/') || (b.dataset.go === 'FEmusic_explore' && path.startsWith('/explore'));
    b.classList.toggle('active', on);
  });
}

// ------------------------------------------------------------------ sayfalar
function openPage(p) {
  S.page = p;
  S.selected = null;
  shell.setPage(true);
  if (S.mode !== 'music') shell.setMode('music');
  renderPage();
  renderSidebar();
  markNav();
  renderTop();
  $('#page').scrollTop = 0;
}

function closePage() {
  if (!S.page) return;
  S.page = null;
  $('#page').hidden = true;
  $('#page').replaceChildren();
  shell.setPage(false);
  renderSidebar();
  markNav();
  renderTop();
}

function renderPage() {
  const el = $('#page');
  if (!S.page) { el.hidden = true; return; }
  el.hidden = false;
  const scroll = el.scrollTop;
  el.replaceChildren();
  if (S.page.type === 'list') renderListPage(el, S.page.id);
  else if (S.page.type === 'queue') renderQueuePage(el);
  else if (S.page.type === 'search') renderSearchPage(el);
  else if (S.page.type === 'nowplaying') renderNowPlayingPage(el);
  el.scrollTop = scroll;
}

function listMenu(list) {
  if (!list) return [];
  return [
    { icon: 'queue', label: T('Tümünü sıraya ekle'), run: () => { shell.lib.enqueue(list.tracks, false); toast(T('{0} şarkı sıraya eklendi', list.tracks.length)); } },
    { icon: 'next', label: T('Sonra çal'), run: () => { shell.lib.enqueue(list.tracks, true); toast(T('Sıradaki olarak eklendi')); } },
    { sep: true },
    { icon: 'download', label: T('Listeyi MP3 olarak indir'), run: () => downloadList(list, 'mp3') },
    { icon: 'download', label: T('Listeyi M4A olarak indir'), run: () => downloadList(list, 'm4a') },
    ...(list.kind === 'playlist' ? [
      { sep: true },
      { icon: 'edit', label: T('Yeniden adlandır'), run: () => { openPage({ type: 'list', id: list.id, rename: true }); } },
      { icon: 'remove', label: T('Listeyi sil'), danger: true, run: async () => { if (await shell.lib.remove(list.id) && isPageActive('list', list.id)) closePage(); } },
    ] : []),
  ];
}

async function downloadList(list, preset) {
  if (!list.tracks.length) { toast(T('Listede şarkı yok')); return; }
  const n = await shell.lib.download(list.id, preset);
  toast(T('{0} şarkı indiriliyor → {1}', n, T('Müzik') + '\\' + list.name));
}

function renderListPage(el, id) {
  const list = listById(id);
  if (!list) { closePage(); return; }
  const tracks = list.tracks;
  const hueV = list.kind === 'liked' ? 255 : list.kind === 'history' ? 25 : hue(list.id);
  const hero = h('section', { class: 'hero', style: { '--hero': `hsl(${hueV} 45% 34%)` } });
  hero.style.setProperty('--hero', `hsl(${hueV} 45% 34%)`);
  const titleEl = h('h1', { class: 'hero-title' + (list.kind === 'playlist' ? ' editable' : ''), text: list.name, title: list.kind === 'playlist' ? T('Yeniden adlandırmak için tıkla') : '' });
  if (list.kind === 'playlist') titleEl.onclick = () => startRename(titleEl, list);
  hero.append(
    coverFor(list.kind, tracks),
    h('div', { class: 'hero-info' },
      h('div', { class: 'hero-type', text: list.kind === 'history' ? T('Geçmiş') : T('Çalma listesi') }),
      titleEl,
      h('div', { class: 'hero-meta' }, h('b', { text: 'Tubify' }), ' · ' + T('{0} şarkı', tracks.length), total(tracks) ? `, ${total(tracks)}` : '')),
  );
  el.append(hero);

  const playingThis = sourcePlaying(id);
  const actions = h('div', { class: 'actions' },
    h('button', {
      class: 'play-big', title: playingThis && musicPlaying() ? T('Duraklat') : T('Çal'),
      onclick: () => {
        if (!tracks.length) return;
        if (playingThis) shell.player('toggle'); else shell.lib.play(id, 0);
      },
    }, icon(playingThis && musicPlaying() ? 'pause' : 'play')),
    h('button', {
      class: 'act' + (S.queue.shuffle ? ' on' : ''), title: S.queue.shuffle ? T('Karıştırma açık') : T('Karıştırarak çal'),
      onclick: () => {
        if (!tracks.length) return;
        if (playingThis) shell.player('shuffle');
        else shell.lib.play(id, Math.floor(Math.random() * tracks.length), true);
      },
    }, icon('shuffle')),
    h('button', { class: 'act', title: T('Listeyi indir'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu([{ head: T('Listeyi indir') }, { icon: 'download', label: T('MP3 (kapaklı, etiketli)'), run: () => downloadList(list, 'mp3') }, { icon: 'download', label: 'M4A (AAC)', run: () => downloadList(list, 'm4a') }, { icon: 'download', label: T('Opus (orijinal kalite)'), run: () => downloadList(list, 'opus') }], r.left, r.bottom + 6); } }, icon('download')),
    h('button', { class: 'act', title: T('Diğer seçenekler'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu(listMenu(list), r.left, r.bottom + 6); } }, icon('more')),
  );
  el.append(actions);

  if (!tracks.length) {
    el.append(h('div', { class: 'empty-state' },
      h('h3', { text: list.kind === 'liked' ? T('Beğendiğin şarkılar burada görünür') : list.kind === 'history' ? T('Henüz bir şey dinlemedin') : T('Bu liste henüz boş') }),
      h('p', { text: list.kind === 'history' ? T('YouTube Music\'te çaldığın şarkılar burada listelenir.') : T('Aşağıdan şarkı ara ya da YouTube Music\'te bir şarkıya sağ tıklayıp "Listeye ekle"yi seç.') })));
  } else {
    el.append(trackTable(tracks, {
      listId: id,
      draggable: list.kind !== 'history',
      removable: list.kind !== 'history',
      onPlay: (i) => shell.lib.play(id, i),
      onRemove: (t) => { shell.lib.removeTrack(id, t.id); toast(T('Listeden kaldırıldı')); },
      onMove: (from, to) => shell.lib.move(id, from, to),
    }));
  }

  if (list.kind !== 'history') el.append(finder(list));
  if (S.page.rename) { S.page.rename = false; setTimeout(() => startRename(titleEl, list), 50); }
}

function startRename(titleEl, list) {
  const input = h('input', { class: 'hero-title-input', value: list.name, maxlength: '100' });
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (save && v && v !== list.name) shell.lib.rename(list.id, v);
    renderPage();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
}

function trackRow(t, i, opts) {
  const now = nowId() === t.id;
  const row = h('div', { class: 'tr' + (now ? ' now' : '') + (S.selected === t.id ? ' sel' : ''), draggable: opts.draggable ? 'true' : null, 'data-i': i });
  const num = h('div', { class: 'num' },
    now && musicPlaying() ? h('span', { class: 'n' }, h('span', { class: 'eq' }, h('i'), h('i'), h('i'))) : h('span', { class: 'n', text: String(i + 1) }),
    h('button', { class: 'pbtn', title: T('Çal'), onclick: (e) => { e.stopPropagation(); if (now) shell.player('toggle'); else opts.onPlay(i); } }, icon(now && musicPlaying() ? 'pause' : 'play')));
  const liked = isLiked(t.id);
  row.append(
    num,
    h('div', { class: 't' }, img(t.art), h('div', { class: 'tt' }, h('div', { class: 'title', text: t.title }), h('div', { class: 'artist', text: t.artist || '' }))),
    h('button', { class: 'heart' + (liked ? ' on' : ''), title: liked ? T('Beğenilenlerden çıkar') : T('Beğenilen şarkılara ekle'), onclick: (e) => { e.stopPropagation(); shell.lib.like(t, !liked); } }, icon(liked ? 'heart' : 'heartO')),
    h('div', { class: 'dur', text: fmt(t.duration) }),
    h('button', { class: 'more', title: T('Diğer seçenekler'), onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(trackMenu(t, { listId: opts.listId, removable: opts.removable, remove: () => opts.onRemove(t, i) }), r.left - 200, r.bottom + 4); } }, icon('more')),
  );
  row.addEventListener('click', () => { S.selected = t.id; document.querySelectorAll('.tr.sel').forEach((x) => x.classList.remove('sel')); row.classList.add('sel'); });
  row.addEventListener('dblclick', () => opts.onPlay(i));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(trackMenu(t, { listId: opts.listId, removable: opts.removable, remove: () => opts.onRemove(t, i) }), e.clientX, e.clientY); });
  if (opts.draggable) {
    row.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const below = e.clientY > r.top + r.height / 2;
      row.classList.toggle('drop-below', below);
      row.classList.toggle('drop-above', !below);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const below = row.classList.contains('drop-below');
      row.classList.remove('drop-above', 'drop-below');
      const from = +e.dataTransfer.getData('text/plain');
      let to = i + (below ? 1 : 0);
      if (from < to) to--;
      if (Number.isInteger(from) && from !== to) opts.onMove(from, to);
    });
  }
  return row;
}

function trackTable(tracks, opts) {
  const wrap = h('div', { class: 'tracks' },
    h('div', { class: 'th' }, h('div', { class: 'num', text: '#', style: { textAlign: 'center' } }), h('div', { text: T('Başlık') }), h('div'), h('div', { class: 'dur', text: T('Süre') }), h('div')));
  tracks.forEach((t, i) => wrap.append(trackRow(t, i, opts)));
  return wrap;
}

// Listeye şarkı arayıp ekleme (Spotify'daki "Listen için bir şeyler bulalım").
function finder(list) {
  const results = h('div', { class: 'tracks search' });
  const input = h('input', { type: 'text', placeholder: T('Şarkı ya da sanatçı ara'), spellcheck: 'false' });
  const box = h('div', { class: 'finder' },
    h('h3', { text: list.tracks.length ? T('Daha fazla şarkı ekle') : T('Listen için bir şeyler bulalım') }),
    h('div', { class: 'search-box' }, icon('search'), input), results);
  let timer = null;
  let seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const my = ++seq;
      if (!q) { results.replaceChildren(); return; }
      results.replaceChildren(h('div', { class: 'muted', style: { padding: '12px 10px' }, text: T('Aranıyor…') }));
      const r = await shell.lib.search(q);
      if (my !== seq) return;
      results.replaceChildren();
      if (!r || !r.ok) { results.append(h('div', { class: 'muted', style: { padding: '12px 10px' }, text: T('Arama yapılamadı. Müzik sayfası yüklenince tekrar deneyin.') })); return; }
      if (!r.tracks.length) { results.append(h('div', { class: 'muted', style: { padding: '12px 10px' }, text: T('Sonuç bulunamadı') })); return; }
      const have = new Set(list.tracks.map((t) => t.id));
      for (const t of r.tracks) {
        const added = have.has(t.id);
        const btn = h('button', { class: 'add-btn' + (added ? ' done' : ''), text: added ? T('Eklendi') : T('Ekle'), onclick: (e) => {
          e.stopPropagation();
          if (btn.classList.contains('done')) return;
          shell.lib.add(list.id, [t]);
          btn.textContent = T('Eklendi');
          btn.classList.add('done');
        } });
        const row = h('div', { class: 'tr' },
          h('div', { class: 't' }, img(t.art), h('div', { class: 'tt' }, h('div', { class: 'title', text: t.title }), h('div', { class: 'artist', text: t.artist }))),
          h('div', { class: 'dur', text: fmt(t.duration) }), btn);
        row.addEventListener('dblclick', () => shell.lib.playTracks([t], 0));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(trackMenu(t), e.clientX, e.clientY); });
        results.append(row);
      }
    }, 350);
  });
  return box;
}

function renderSearchPage(el) {
  const results = h('div', { class: 'tracks' });
  const input = h('input', { type: 'text', placeholder: T('Ne dinlemek istiyorsun?'), spellcheck: 'false' });
  el.append(h('div', { class: 'search-page' },
    h('h1', { text: T('Şarkı ara') }),
    h('div', { class: 'search-box' }, icon('search'), input),
    results));
  let timer = null;
  let seq = 0;
  let last = [];
  const draw = () => {
    results.replaceChildren();
    if (!last.length) return;
    results.append(trackTable(last, {
      listId: null,
      onPlay: (i) => shell.lib.playTracks(last, i),
      onRemove: () => {},
      removable: false,
    }));
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const my = ++seq;
      if (!q) { last = []; draw(); return; }
      const r = await shell.lib.search(q);
      if (my !== seq) return;
      last = r && r.ok ? r.tracks : [];
      if (!last.length) results.replaceChildren(h('div', { class: 'muted', style: { padding: '14px 10px' }, text: r && r.ok ? T('Sonuç bulunamadı') : T('Arama yapılamadı') }));
      else draw();
    }, 300);
  });
  setTimeout(() => input.focus(), 30);
  renderSearchPage.redraw = draw;
}

function renderQueuePage(el) {
  const q = S.queue;
  const page = h('div', { class: 'queue-page' },
    h('h1', { text: T('Çalma sırası') }),
    h('div', { class: 'muted', text: q.source && q.source.name ? T('Kaynak: {0}', q.source.name) : (q.active ? T('Tubify sırası') : T('Sıra beklemede: YouTube Music kendi önerilerini çalıyor')) }));
  const toggles = h('div', { class: 'toggles' },
    h('button', { class: 'toggle' + (q.shuffle ? ' on' : ''), onclick: () => shell.player('shuffle') }, icon('shuffle'), T('Karıştır')),
    h('button', { class: 'toggle' + (q.repeat !== 'off' ? ' on' : ''), onclick: () => shell.player('repeat') }, icon(q.repeat === 'one' ? 'repeatOne' : 'repeat'), q.repeat === 'one' ? T('Tek şarkıyı tekrarla') : q.repeat === 'all' ? T('Listeyi tekrarla') : T('Tekrar kapalı')),
    h('button', { class: 'toggle' + (q.autoplay ? ' on' : ''), title: T('Sıra bitince benzer şarkılarla devam et'), onclick: () => shell.player('autoplay') }, icon('autoplay'), T('Otomatik oynatma')),
    !q.active && q.queue.length ? h('button', { class: 'toggle', onclick: () => shell.player('resume') }, icon('play'), T('Sıraya dön')) : null,
    q.queue.length > q.index + 1 ? h('button', { class: 'toggle', onclick: () => shell.player('clear') }, icon('remove'), T('Sıradakileri temizle')) : null,
  );
  page.append(toggles);
  const cur = q.queue[q.index];
  if (cur) {
    page.append(h('h2', { text: T('Şu an çalıyor') }));
    const t = h('div', { class: 'tracks' });
    t.append(trackRow(cur, q.index, { onPlay: () => shell.player('toggle'), onRemove: () => {}, removable: false }));
    page.append(t);
  }
  const upcoming = q.queue.slice(q.index + 1);
  page.append(h('h2', { text: upcoming.length ? T('Sıradakiler · {0}', upcoming.length) : T('Sırada şarkı yok') }));
  if (upcoming.length) {
    const t = h('div', { class: 'tracks' });
    upcoming.forEach((tr, k) => {
      const i = q.index + 1 + k;
      t.append(trackRow(tr, i, {
        draggable: true, removable: true,
        onPlay: () => shell.player('jump', i),
        onRemove: () => shell.player('remove', i),
        onMove: (from, to) => shell.player('move', [from, to]),
      }));
    });
    page.append(t);
  } else if (!cur) {
    page.append(h('div', { class: 'empty-state' }, h('h3', { text: T('Sıran boş') }), h('p', { text: T('Bir listeyi çal ya da şarkılara sağ tıklayıp "Sıraya ekle"yi seç.') })));
  }
  el.append(page);
}

// ------------------------------------------------------------------ Şu an çalıyor
function hiRes(url) {
  if (!url) return '';
  if (/googleusercontent\.com/.test(url)) return url.replace(/=w\d+-h\d+[^?#]*$/, '=w720-h720-l90-rj');
  return url;
}

function upnextRows() {
  // Kendi sıramız çalıyorsa o, değilse YouTube Music'in kendi sırası gösterilir.
  if (S.queue.active && S.queue.queue.length) {
    return S.queue.queue.map((t, i) => ({ ...t, current: i === S.queue.index, play: () => shell.player('jump', i) }));
  }
  const cur = nowId();
  return S.upnext.map((t) => ({ ...t, current: t.id === cur, play: () => shell.np.playItem(t.i) }));
}

async function refreshUpnext() {
  if (!S.page || S.page.type !== 'nowplaying' || S.queue.active) return;
  const list = await shell.np.upnext();
  const key = JSON.stringify(list.map((t) => t.id + (t.selected ? '*' : '')));
  if (key === refreshUpnext.last) return;
  refreshUpnext.last = key;
  S.upnext = list;
  const box = document.getElementById('np-list');
  if (box) drawUpnext(box);
}
setInterval(refreshUpnext, 4000);

function drawUpnext(box) {
  box.replaceChildren();
  const rows = upnextRows();
  if (!rows.length) {
    box.append(h('div', { class: 'np-empty', text: T('Sırada şarkı yok') }));
    return;
  }
  for (const t of rows) {
    const row = h('div', { class: 'np-row' + (t.current ? ' current' : ''), title: t.title },
      img(t.art),
      h('div', { class: 'np-row-text' }, h('div', { class: 'np-row-title', text: t.title }), h('div', { class: 'np-row-artist', text: t.artist || '' })),
      t.current && musicPlaying() ? h('span', { class: 'eq' }, h('i'), h('i'), h('i')) : h('span', { class: 'np-row-dur', text: fmt(t.duration) }));
    row.addEventListener('click', () => { if (!t.current) t.play(); });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(trackMenu(t), e.clientX, e.clientY); });
    box.append(row);
  }
  const cur = box.querySelector('.current');
  if (cur && !box.dataset.scrolled) { cur.scrollIntoView({ block: 'center' }); box.dataset.scrolled = '1'; }
}

function renderNowPlayingPage(el) {
  const m = S.media.music;
  if (!m || !m.id) {
    el.append(h('div', { class: 'empty-state', style: { paddingTop: '120px' } },
      h('h3', { text: T('Şu an bir şey çalmıyor') }),
      h('p', { text: T('Bir liste ya da şarkı seçerek başla.') }),
      h('button', { class: 'pill-btn', text: T('Ana sayfaya git'), onclick: () => { closePage(); shell.musicGo({ kind: 'browse', browseId: 'FEmusic_home' }); } })));
    return;
  }
  const art = hiRes(m.art);
  const t = { id: m.id, title: m.title, artist: m.artist, art: m.art, duration: m.duration };
  const liked = isLiked(m.id);
  const page = h('div', { class: 'np-page' });
  const bg = h('div', { class: 'np-bg' });
  bg.style.backgroundImage = `url("${art.replace(/"/g, '')}")`;
  const left = h('div', { class: 'np-left' },
    h('div', { class: 'np-cover' }, img(art)),
    h('div', { class: 'np-meta' },
      h('div', { class: 'np-big-title', text: m.title }),
      h('div', { class: 'np-big-artist', text: m.artist || '' })),
    h('div', { class: 'np-actions' },
      h('button', { class: 'act' + (liked ? ' on' : ''), title: liked ? T('Beğenilenlerden çıkar') : T('Beğenilen şarkılara ekle'), onclick: () => shell.lib.like(t, !liked) }, icon(liked ? 'heart' : 'heartO')),
      h('button', { class: 'act', title: T('Sıraya / listeye ekle'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu(trackMenu(t), r.left, r.bottom + 6); } }, icon('add')),
      h('button', { class: 'act', title: T('İndir'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu([{ head: T('İndir') }, { icon: 'download', label: 'MP3', run: () => shell.lib.downloadTracks([t], 'mp3').then(() => toast(T('İndirme sıraya eklendi'))) }, { icon: 'download', label: 'M4A (AAC)', run: () => shell.lib.downloadTracks([t], 'm4a').then(() => toast(T('İndirme sıraya eklendi'))) }, { icon: 'download', label: T('Klip (MP4 video)'), run: () => shell.lib.downloadTracks([t], 'best-mp4').then(() => toast(T('İndirme sıraya eklendi'))) }], r.left, r.bottom + 6); } }, icon('download')),
      h('button', { class: 'act', title: T('Şarkı radyosunu başlat'), onclick: () => shell.musicGo({ kind: 'radio', videoId: m.id }) }, icon('radio')),
    ),
    h('div', { class: 'np-video' },
      h('button', {
        class: 'toggle' + (S.music.videoOff ? ' on' : ''),
        title: T('Açıkken video yerine yalnızca kapak gösterilir; video en düşük kaliteye iner (daha az veri, daha az işlemci)'),
        onclick: () => shell.np.videoOff(!S.music.videoOff),
      }, icon('album'), S.music.videoOff ? T('Videolar kapalı · yalnızca kapak') : T('Videoları kapat')),
      !S.music.videoOff ? h('button', { class: 'toggle', title: T('Klibi YouTube Music oynatıcısında göster'), onclick: () => shell.np.showVideo() }, icon('play'), T('Videoyu göster')) : null,
    ),
  );
  const list = h('div', { class: 'np-list', id: 'np-list' });
  const rows = upnextRows();
  const right = h('div', { class: 'np-right' },
    h('div', { class: 'np-right-head' },
      h('div', {}, h('div', { class: 'np-right-title', text: T('Sıradaki') }),
        h('div', { class: 'np-right-sub', text: S.queue.active ? (S.queue.source && S.queue.source.name ? S.queue.source.name : T('Tubify sırası')) : T('YouTube Music önerileri') })),
      h('button', {
        class: 'pill-btn ghost', title: T('Bu sırayı kitaplığına çalma listesi olarak kaydet'),
        onclick: async () => {
          const tracks = upnextRows().map(({ id, title, artist, art, duration }) => ({ id, title, artist, art, duration }));
          if (!tracks.length) return;
          const r = await shell.np.saveTracks(T('{0} · sıradakiler', m.title), tracks);
          toast(T('"{0}" kaydedildi · {1} şarkı', r.name, r.count));
          openPage({ type: 'list', id: r.id, rename: true });
        },
      }, T('Kaydet')),
    ),
    list);
  page.append(bg, left, right);
  el.append(page);
  if (rows.length || S.queue.active) drawUpnext(list);
  if (!S.queue.active) { refreshUpnext.last = null; refreshUpnext(); }
}

// ------------------------------------------------------------------ olaylar
function refreshAll() {
  renderTop();
  renderSidebar();
  markNav();
  if (S.page && S.page.type !== 'search') renderPage();
}

shell.onState((st) => {
  S.mode = st.mode;
  S.collapsed = st.sidebarCollapsed;
  S.canBack = st.canBack;
  S.canForward = st.canForward;
  S.musicUrl = st.musicUrl;
  S.pageOpen = st.pageOpen;
  S.strip = st.strip;
  renderTop();
  markNav();
});
shell.onMedia((m) => {
  const prev = S.media.music && S.media.music.id;
  const prevPlaying = musicPlaying();
  S.media = { video: m.video || null, music: m.music || null };
  renderNowPlaying();
  if (prev !== nowId() || prevPlaying !== musicPlaying()) {
    renderSidebar();
    if (S.page && S.page.type !== 'search') renderPage();
    else if (S.page && S.page.type === 'search' && renderSearchPage.redraw) renderSearchPage.redraw();
  }
});
shell.onDownloads(({ active, progress }) => {
  const b = $('#dl-badge');
  b.hidden = !active;
  b.textContent = String(active);
  $('#dl-btn').classList.toggle('active', active > 0);
  $('#ring-fg').style.strokeDashoffset = String(100.5 * (1 - (active && progress >= 0 ? progress : 0)));
});
shell.onAccount((acc) => { S.account = acc || { loggedIn: false }; renderSidebar(); });
shell.onLocalLib((lib) => { S.lib = lib; refreshAll(); });
shell.onQueue((q) => { S.queue = q; refreshAll(); });
shell.onOpenList((id) => openPage({ type: 'list', id }));
shell.onNpToggle(() => { if (S.page && S.page.type === 'nowplaying') closePage(); else openPage({ type: 'nowplaying' }); });
shell.onSettings((st) => { if (st && st.music) { S.music = st.music; if (S.page && S.page.type === 'nowplaying') renderPage(); } });
shell.onStripMenu(({ kind, track, x, left }) => {
  const stripTop = window.innerHeight - 8 - 72;
  const items = kind === 'download' ? [
    { head: T('İndir') + ' · ' + track.title },
    { icon: 'download', label: 'MP3', run: () => shell.lib.downloadTracks([track], 'mp3').then(() => toast(T('İndirme sıraya eklendi'))) },
    { icon: 'download', label: 'M4A (AAC)', run: () => shell.lib.downloadTracks([track], 'm4a').then(() => toast(T('İndirme sıraya eklendi'))) },
    { icon: 'download', label: T('Opus (orijinal)'), run: () => shell.lib.downloadTracks([track], 'opus').then(() => toast(T('İndirme sıraya eklendi'))) },
    { icon: 'download', label: T('Klip (MP4 video)'), run: () => shell.lib.downloadTracks([track], 'best-mp4').then(() => toast(T('İndirme sıraya eklendi'))) },
  ] : trackMenu(track);
  openMenu(items, left + x - 20, 0, stripTop);
});
shell.onClosePage(() => { if (S.page) { S.page = null; $('#page').hidden = true; renderSidebar(); markNav(); renderTop(); } });

(async () => {
  const init = await shell.init();
  S.collapsed = !!init.ui.sidebarCollapsed;
  S.music = init.music || S.music;
  S.mode = init.ui.mode === 'music' ? 'music' : 'video';
  const st = await shell.lib.state();
  S.lib = st.library;
  S.queue = st.queue;
  refreshAll();
})();
