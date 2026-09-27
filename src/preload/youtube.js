'use strict';
// YouTube penceresi preload'u (yalıtılmış dünya). Sandbox içinde çalışır; tek dosya olmalı.
const { ipcRenderer, contextBridge } = require('electron');

// YouTube sayfasının kendi JS dünyasında, sayfa betiklerinden ÖNCE çalışır.
// Kaynak kodu olarak ana dünyaya aktarıldığı için dış değişken kullanmamalıdır.
function ptMainWorld(CONFIG) {
  'use strict';
  if (window.__ptInstalled) return;
  window.__ptInstalled = true;

  // Kullanıcı etkinliği zaman damgası: "İzlemeye devam ediyor musunuz?" duraklatmasını önler.
  setInterval(() => { try { window._lact = Date.now(); } catch (e) { /* yoksay */ } }, 60 * 1000);

  if (!CONFIG.adblock) return;

  // ---- Reklamsız oynatıcı isteği -----------------------------------------------------------
  // YouTube reklamı video akışına gömüp (SSAP/SABR) reklam süresi dolmadan içeriği sunucudan göndermiyor;
  // yanıttan reklamı silmek bu yüzden 5–20 sn bekleme yaratıyor. Çözüm: oynatıcı isteğini sunucunun
  // reklam eklemediği bağlamla göndermek. Önce isteği sıkıştırılmış ikili biçime çeviren yeni ağ katmanı
  // kapatılır (düz JSON istek), sonra oynatıcı isteğine reklamsız params varyantı eklenir.
  const NM_FLAGS = {
    all_web_enable_network_machine: false, all_web_network_machine_raw_request: false,
    web_enable_network_machine: false, wug_networking_gzip_request: false, web_unified_fetch: false,
  };
  function patchFlags(cfg) {
    try {
      const f = cfg && cfg.data_ && cfg.data_.EXPERIMENT_FLAGS;
      if (f) Object.assign(f, NM_FLAGS);
    } catch (e) { /* yoksay */ }
  }
  function hookYtcfg(cfg) {
    if (!cfg || typeof cfg !== 'object' || cfg.__ptHooked) return;
    try { Object.defineProperty(cfg, '__ptHooked', { value: true }); } catch (e) { return; }
    let setFn = cfg.set;
    const wrap = (fn) => (typeof fn === 'function' ? function () { const r = fn.apply(this, arguments); patchFlags(cfg); return r; } : fn);
    try {
      Object.defineProperty(cfg, 'set', { configurable: true, get() { return setFn; }, set(v) { setFn = wrap(v); } });
      setFn = wrap(setFn);
    } catch (e) { /* yoksay */ }
    patchFlags(cfg);
  }
  let ytcfgValue = window.ytcfg;
  hookYtcfg(ytcfgValue);
  try {
    Object.defineProperty(window, 'ytcfg', { configurable: true, get() { return ytcfgValue; }, set(v) { ytcfgValue = v; hookYtcfg(v); } });
  } catch (e) { /* yoksay */ }

  // Sunucu reklamsız yanıt versin diye oynatıcı isteğine eklenen parametreler (uBlock Origin'deki sırayla).
  // Biri reddedilirse (UNPLAYABLE vb.) o video bir sonrakiyle yeniden yüklenir; en sonda istek olduğu gibi gider.
  const VARIANTS = ['8AUB', 'YAHI', null];
  const attempt = new Map(); // videoId -> VARIANTS indeksi
  function editPlayerBody(body) {
    if (typeof body !== 'string' || body.indexOf('"videoId"') === -1 || body.indexOf('"context"') === -1) return body;
    try {
      const o = JSON.parse(body);
      const c = o && o.context && o.context.client;
      if (!c || c.clientName !== 'WEB') return body;
      const pr = o.playerRequest || o; // get_watch: playerRequest altında; /player: kökte
      const param = VARIANTS[attempt.get(pr.videoId) || 0];
      if (!param) return body;
      pr.params = param;
      const cpc = pr.playbackContext && pr.playbackContext.contentPlaybackContext;
      if (cpc) {
        cpc.lactMilliseconds = String(Date.now());
        if (typeof cpc.referer === 'string' && cpc.referer.indexOf('#reloadxhr') === -1) cpc.referer += '#reloadxhr';
      }
      return JSON.stringify(o);
    } catch (e) { return body; }
  }

  // Oynatılamayan yanıt → sonraki varyant; sayfa HTML'iyle gelen reklamlı ilk yanıt → düzenli istekle yeniden yükle.
  let initialAdsFor = null;
  const retried = new Set();
  function watchPlayer() {
    const p = document.getElementById('movie_player');
    if (!p || typeof p.getPlayerResponse !== 'function' || typeof p.loadVideoById !== 'function' || location.pathname !== '/watch') return;
    const id = new URLSearchParams(location.search).get('v');
    const r = p.getPlayerResponse();
    if (!id || !r || !r.videoDetails || r.videoDetails.videoId !== id) return;
    const start = Math.floor(Number(new URLSearchParams(location.search).get('t')) || 0);
    if (initialAdsFor === id) {
      initialAdsFor = null;
      p.loadVideoById({ videoId: id, startSeconds: start });
      return;
    }
    const status = r.playabilityStatus && r.playabilityStatus.status;
    const key = id + ':' + (attempt.get(id) || 0);
    if (status && status !== 'OK' && !retried.has(key) && (attempt.get(id) || 0) < VARIANTS.length - 1) {
      retried.add(key);
      attempt.set(id, (attempt.get(id) || 0) + 1);
      p.loadVideoById({ videoId: id, startSeconds: start });
    }
  }
  setInterval(watchPlayer, 250);

  const isPlayerUrl = (u) => /\/youtubei\/v1\/(player|get_watch)(\?|$)/.test(String(u || ''));
  window.fetch = new Proxy(window.fetch, {
    apply(target, thisArg, args) {
      try {
        const [input, init] = args;
        const url = typeof input === 'string' ? input : (input && input.url);
        if (isPlayerUrl(url)) {
          if (init && typeof init.body === 'string') args[1] = { ...init, body: editPlayerBody(init.body) };
          else if (input instanceof Request && !(init && init.body)) {
            return input.clone().text().then((b) => Reflect.apply(target, thisArg, [new Request(input, { body: editPlayerBody(b) }), init]));
          }
        }
      } catch (e) { /* yoksay */ }
      return Reflect.apply(target, thisArg, args);
    },
  });
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) { this.__ptPlayer = isPlayerUrl(url); return xhrOpen.apply(this, arguments); };
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__ptPlayer) arguments[0] = editPlayerBody(body);
    return xhrSend.apply(this, arguments);
  };

  // ---- Katman 2: oynatıcı yanıtından reklam tanımlarını ayıkla -------------------------
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams'];

  function pruneOne(o) {
    for (let i = 0; i < AD_KEYS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(o, AD_KEYS[i])) delete o[AD_KEYS[i]];
    }
  }

  function prune(o) {
    try {
      if (!o || typeof o !== 'object') return o;
      if (Array.isArray(o)) {
        for (const x of o) if (x && typeof x === 'object') prune(x);
        return o;
      }
      pruneOne(o);
      if (o.playerResponse && typeof o.playerResponse === 'object') pruneOne(o.playerResponse);
      if (o.response && typeof o.response === 'object' && o.response.playerAds) pruneOne(o.response);
    } catch (e) { /* hiçbir koşulda sayfayı bozma */ }
    return o;
  }

  function looksLikeAds(o) {
    return o && typeof o === 'object' && (Array.isArray(o) || 'playerAds' in o || 'adPlacements' in o ||
      'adSlots' in o || 'playerResponse' in o);
  }

  JSON.parse = new Proxy(JSON.parse, {
    apply(target, thisArg, args) {
      const r = Reflect.apply(target, thisArg, args);
      return looksLikeAds(r) ? prune(r) : r;
    },
  });

  Response.prototype.json = new Proxy(Response.prototype.json, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args).then((r) => (looksLikeAds(r) ? prune(r) : r));
    },
  });

  // İlk sayfa yüklemesinde yanıt satır içi betikle "var ytInitialPlayerResponse = {...}" olarak gelir.
  function trap(name) {
    let value = window[name];
    const mark = (v) => {
      try { if (v && (v.adSlots || v.playerAds || v.adPlacements) && v.videoDetails) initialAdsFor = v.videoDetails.videoId; } catch (e) { /* yoksay */ }
    };
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get() { return value; },
        set(v) { mark(v); value = prune(v); },
      });
    } catch (e) { /* yoksay */ }
    if (value) { mark(value); prune(value); }
  }
  trap('ytInitialPlayerResponse');

  // ---- Katman 3: yine de reklam oynarsa sessize al, sona sar, "Atla"ya bas ------------
  let adActive = false;
  let saved = null;

  function mainVideo(player) {
    return player.querySelector('video.html5-main-video') || player.querySelector('video');
  }

  function tick() {
    const player = document.getElementById('movie_player');
    if (!player) return;
    const video = mainVideo(player);
    const showing = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');

    const skip = player.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, button[id^="skip-button"]');
    if (skip) { try { skip.click(); } catch (e) { /* yoksay */ } }

    if (showing && video) {
      if (!adActive) {
        adActive = true;
        saved = { muted: video.muted, rate: video.playbackRate };
      }
      video.muted = true;
      if (video.playbackRate < 16) { try { video.playbackRate = 16; } catch (e) { /* yoksay */ } }
      if (isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.2) {
        try { video.currentTime = video.duration - 0.1; } catch (e) { /* yoksay */ }
      }
    } else if (adActive) {
      adActive = false;
      if (video && saved) {
        video.muted = saved.muted;
        try { video.playbackRate = saved.rate > 0 && saved.rate <= 4 ? saved.rate : 1; } catch (e) { /* yoksay */ }
      }
      saved = null;
    }

    // Reklam engelleyici uyarı penceresi çıkarsa kaldır ve oynatmaya devam et.
    const enforcement = document.querySelector('ytd-enforcement-message-view-model');
    if (enforcement) {
      const dialog = enforcement.closest('tp-yt-paper-dialog, ytd-popup-container > *') || enforcement;
      dialog.remove();
      document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach((b) => b.remove());
      document.body.style.removeProperty('overflow');
      if (video && video.paused) video.play().catch(() => {});
    }
  }

  setInterval(tick, 300);
  const startObserver = () => {
    const player = document.getElementById('movie_player');
    if (!player) { setTimeout(startObserver, 500); return; }
    new MutationObserver(tick).observe(player, { attributes: true, attributeFilter: ['class'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver);
  else startObserver();
}

const boot = ipcRenderer.sendSync('pt:boot');
// Reklam ayıklayıcıyı sayfanın kendi dünyasında, YouTube betiklerinden önce ve senkron çalıştır.
if (boot && boot.isYouTube) {
  try {
    contextBridge.executeInMainWorld({ func: ptMainWorld, args: [{ adblock: !!boot.settings.adblock }] });
  } catch (e) { console.error('Tubify: ana dünya enjeksiyonu başarısız', e); }
}

let settings = boot ? boot.settings : { sponsorblock: { enabled: false, categories: {} } };

// Arayüz çevirisi (sözlük ana süreçten pt:boot ile gelir). Kaynak metinler Türkçedir.
const I18N_DICT = (boot && boot.i18n && boot.i18n.dict) || {};
function T(s, ...args) {
  let v = Object.prototype.hasOwnProperty.call(I18N_DICT, s) ? I18N_DICT[s] : s;
  if (Array.isArray(v)) v = Number(args[0]) === 1 ? v[0] : v[1];
  return args.length ? String(v).replace(/\{(\d)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : v;
}
ipcRenderer.on('pt:settings', (_e, s) => { settings = s; sb.reset(true); });

const SB_COLORS = {
  sponsor: '#00d400', selfpromo: '#ffff00', interaction: '#cc00ff', intro: '#00ffff',
  outro: '#0202ed', preview: '#008fd6', music_offtopic: '#ff9900', filler: '#7300ff',
};
const SB_NAMES = {
  sponsor: T('Sponsor'), selfpromo: T('Kendi tanıtımı'), interaction: T('Abone ol/beğen hatırlatması'),
  intro: T('Giriş'), outro: T('Kapanış'), preview: T('Önizleme/özet'), music_offtopic: T('Müzik dışı bölüm'),
  filler: T('Konu dışı dolgu'),
};

// ---------------------------------------------------------------- yardımcılar
function currentVideoId() {
  try {
    const u = new URL(location.href);
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/live\/([\w-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}

function getPlayer() { return document.getElementById('movie_player'); }
function getVideo() {
  const p = getPlayer();
  return p ? (p.querySelector('video.html5-main-video') || p.querySelector('video')) : null;
}
function adShowing() {
  const p = getPlayer();
  return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else e.setAttribute(k, v);
  }
  for (const c of children) e.appendChild(c);
  return e;
}

function svg(pathD) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', pathD);
  s.appendChild(p);
  return s;
}

// ---------------------------------------------------------------- bildirimler
function toast(message, action, timeout = 5000) {
  if (!document.body) return;
  let box = document.getElementById('pt-toasts');
  if (!box) { box = el('div', { id: 'pt-toasts' }); document.body.appendChild(box); }
  const t = el('div', { class: 'pt-toast' }, [el('span', { text: message })]);
  if (action) {
    t.appendChild(el('button', { text: action.label, on: { click: () => { action.run(); t.remove(); } } }));
  }
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), timeout);
}
ipcRenderer.on('pt:toast', (_e, msg) => toast(T(msg)));

// ---------------------------------------------------------------- SponsorBlock
const sb = {
  videoId: null,
  segments: [],
  ignored: new Set(),
  muting: null,
  video: null,
  loadingFor: null,

  reset(refetch) {
    this.segments = [];
    this.ignored = new Set();
    this.unmute();
    this.removeMarkers();
    if (refetch) { const id = this.videoId; this.videoId = null; if (id) this.load(id); }
  },

  enabledCats() {
    const s = settings.sponsorblock;
    if (!s || !s.enabled) return [];
    return Object.entries(s.categories).filter(([, v]) => v).map(([k]) => k);
  },

  async load(id) {
    this.videoId = id;
    this.segments = [];
    this.ignored = new Set();
    this.removeMarkers();
    const cats = this.enabledCats();
    if (!cats.length) return;
    this.loadingFor = id;
    let segs = [];
    try { segs = await ipcRenderer.invoke('pt:sb-segments', id, cats); } catch { segs = []; }
    if (this.loadingFor !== id || this.videoId !== id) return;
    this.segments = segs;
    this.renderMarkers();
  },

  attach(video) {
    if (this.video === video) return;
    if (this.video) {
      this.video.removeEventListener('timeupdate', this.onTime);
      this.video.removeEventListener('durationchange', this.onDuration);
    }
    this.video = video;
    if (video) {
      video.addEventListener('timeupdate', this.onTime);
      video.addEventListener('durationchange', this.onDuration);
    }
  },

  onTime() {
    const self = sb;
    const v = self.video;
    if (!v || !self.segments.length || adShowing()) return;
    if (self.videoId !== currentVideoId()) return;
    const t = v.currentTime;
    let inMute = null;
    for (const s of self.segments) {
      if (self.ignored.has(s.uuid)) continue;
      if (s.action === 'skip' && t >= s.start && t < s.end - 0.35) {
        // Segment videonun sonuna kadar gidiyorsa tam sona değil biraz öncesine sar (sonraki video otomatik başlasın).
        const target = Math.min(s.end, (v.duration || s.end) - 0.05);
        v.currentTime = target;
        ipcRenderer.send('pt:sb-viewed', s.uuid);
        if (settings.sponsorblock.notify) {
          toast(T('{0} atlandı', SB_NAMES[s.category] || s.category), {
            label: T('Geri al'),
            run: () => { self.ignored.add(s.uuid); v.currentTime = s.start; },
          });
        }
        return;
      }
      if (s.action === 'mute' && t >= s.start && t < s.end) inMute = s;
    }
    if (inMute && !self.muting) { self.muting = { prev: v.muted }; v.muted = true; }
    else if (!inMute && self.muting) self.unmute();
  },

  unmute() {
    if (this.muting && this.video) this.video.muted = this.muting.prev;
    this.muting = null;
  },

  removeMarkers() {
    document.querySelectorAll('.pt-sb-bar').forEach((b) => b.remove());
  },

  renderMarkers() {
    this.removeMarkers();
    if (!settings.sponsorblock.showMarkers || !this.segments.length || adShowing()) return;
    const v = this.video;
    const bar = document.querySelector('#movie_player .ytp-progress-bar');
    if (!v || !bar || !isFinite(v.duration) || v.duration <= 0) return;
    const dur = v.duration;
    const wrap = el('div', { class: 'pt-sb-bar' });
    for (const s of this.segments) {
      const left = (s.start / dur) * 100;
      const width = ((s.end - s.start) / dur) * 100;
      if (left > 100) continue;
      wrap.appendChild(el('div', {
        class: 'pt-sb-seg',
        title: SB_NAMES[s.category] || s.category,
        style: `left:${left}%;width:${Math.min(width, 100 - left)}%;background:${SB_COLORS[s.category] || '#fff'}`,
      }));
    }
    bar.appendChild(wrap);
  },
};
sb.onTime = sb.onTime.bind(sb);
sb.onDuration = () => sb.renderMarkers();

// ---------------------------------------------------------------- İndirme butonu
const DL_ICON = 'M17 18v1H6v-1h11zm-.5-6.6-.7-.7-3.8 3.7V4h-1v10.4l-3.8-3.8-.7.7 5 5 5-4.9z';
const IS_MUSIC = location.hostname === 'music.youtube.com';
let menuEl = null;
let floatingSince = 0;

function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}

// Oynatıcıda şu an yüklü olan içerik (YTM'de kullanıcı başka sayfadayken de doğru kimlik).
function playingVideoId() {
  const link = document.querySelector('#movie_player .ytp-title-link');
  if (link && link.href) {
    try { const v = new URL(link.href).searchParams.get('v'); if (v) return v; } catch { /* yoksay */ }
  }
  return currentVideoId();
}

function watchUrl() {
  const id = IS_MUSIC ? playingVideoId() : currentVideoId();
  if (!id) return null;
  return IS_MUSIC ? `https://music.youtube.com/watch?v=${id}` : `https://www.youtube.com/watch?v=${id}`;
}

function playlistUrl() {
  try {
    const list = new URL(location.href).searchParams.get('list');
    // Otomatik "Mix" (RD…) listeleri sonsuzdur, toplu indirme sunulmaz.
    if (!list || list.startsWith('RD')) return null;
    return IS_MUSIC ? `https://music.youtube.com/playlist?list=${list}` : `https://www.youtube.com/playlist?list=${list}`;
  } catch { return null; }
}

async function startDownload(url, preset, playlist) {
  closeMenu();
  try {
    const r = await ipcRenderer.invoke('pt:download', { url, preset, playlist });
    toast(r.ok ? T('İndirme sıraya eklendi') : T('İndirme başlatılamadı: {0}', T(r.error)), {
      label: T('İndirmeler'), run: () => ipcRenderer.send('pt:open-manager'),
    });
  } catch (e) { toast(T('İndirme başlatılamadı: {0}', e.message)); }
}

function openMenu(anchor) {
  if (menuEl) { closeMenu(); return; }
  const url = watchUrl();
  if (!url) return;
  const items = IS_MUSIC ? [
    ['mp3', T('Ses · MP3 (kapaklı, etiketli)')],
    ['m4a', T('Ses · M4A (AAC)')],
    ['opus', T('Ses · Opus (orijinal kalite)')],
    ['best-mp4', T('Klip · Video (MP4)')],
  ] : [
    ['best-mp4', T('Video · En iyi kalite (MP4)')],
    ['1080-mp4', T('Video · 1080p (MP4)')],
    ['720-mp4', T('Video · 720p (MP4)')],
    ['best-mkv', T('Video · En yüksek kalite (MKV)')],
    ['mp3', T('Ses · MP3')],
    ['m4a', T('Ses · M4A')],
  ];
  menuEl = el('div', { id: 'pt-dl-menu' }, [el('div', { class: 'pt-head', text: IS_MUSIC ? T('Bu şarkıyı indir') : T('Bu videoyu indir') })]);
  for (const [preset, label] of items) {
    menuEl.appendChild(el('button', { class: 'pt-item', text: label, on: { click: () => startDownload(url, preset, false) } }));
  }
  const pl = playlistUrl();
  if (pl) {
    menuEl.appendChild(el('div', { class: 'pt-sep' }));
    if (IS_MUSIC) {
      menuEl.appendChild(el('button', { class: 'pt-item', text: T('Tüm liste · MP3'), on: { click: () => startDownload(pl, 'mp3', true) } }));
      menuEl.appendChild(el('button', { class: 'pt-item', text: T('Tüm liste · M4A'), on: { click: () => startDownload(pl, 'm4a', true) } }));
    } else {
      menuEl.appendChild(el('button', { class: 'pt-item', text: T('Tüm oynatma listesi · varsayılan kalite'), on: { click: () => startDownload(pl, null, true) } }));
      menuEl.appendChild(el('button', { class: 'pt-item', text: T('Tüm oynatma listesi · MP3'), on: { click: () => startDownload(pl, 'mp3', true) } }));
    }
  }
  menuEl.appendChild(el('div', { class: 'pt-sep' }));
  menuEl.appendChild(el('button', { class: 'pt-item', text: T('Diğer seçenekler…'), on: { click: () => { closeMenu(); ipcRenderer.send('pt:open-manager', url); } } }));
  document.body.appendChild(menuEl);

  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  const left = Math.min(r.left, window.innerWidth - mw - 12);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menuEl.style.left = Math.max(8, left) + 'px';
  menuEl.style.top = top + 'px';
}

document.addEventListener('mousedown', (e) => {
  if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('#pt-dl-btn'))) closeMenu();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); }, true);

function makeButton(compact) {
  const b = el('button', { id: 'pt-dl-btn', title: T('İndir (Ctrl+S)') }, compact ? [svg(DL_ICON)] : [svg(DL_ICON), el('span', { text: T('İndir') })]);
  if (compact) b.classList.add('pt-compact');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (compact && window.__ptBarMenu) { window.__ptBarMenu(b); return; }
    openMenu(b);
  });
  return b;
}

function ensureMusicButton() {
  const btn = document.getElementById('pt-dl-btn');
  const host = document.querySelector('ytmusic-player-bar .middle-controls-buttons');
  const title = document.querySelector('ytmusic-player-bar .title');
  const hasTrack = !!playingVideoId() && !!title && !!title.textContent.trim();
  if (!host || !hasTrack) { if (btn) btn.remove(); return; }
  if (btn && btn.parentElement === host) return;
  if (btn) btn.remove();
  host.appendChild(makeButton(true));
}

function ensureButton() {
  if (IS_MUSIC) { ensureMusicButton(); return; }
  const onWatch = !!currentVideoId();
  let btn = document.getElementById('pt-dl-btn');
  if (!onWatch) {
    if (btn) btn.remove();
    floatingSince = 0;
    closeMenu();
    return;
  }
  const host = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
  if (host) {
    if (btn && btn.parentElement === host) return;
    if (btn) btn.remove();
    host.appendChild(makeButton(false));
    return;
  }
  // YouTube düzeni değişirse buton kaybolmasın: birkaç saniye sonra yüzen butona geç.
  if (!floatingSince) floatingSince = Date.now();
  if (Date.now() - floatingSince > 4000 && !btn && document.body) {
    btn = makeButton(false);
    btn.classList.add('pt-floating');
    document.body.appendChild(btn);
  }
}

// ---------------------------------------------------------------- şu an çalan → kabuk
let lastMediaKey = '';

function mediaState() {
  const v = getVideo();
  const id = playingVideoId();
  if (!v || !id || adShowing()) return null;
  const md = navigator.mediaSession && navigator.mediaSession.metadata;
  let title = md && md.title;
  let artist = md && md.artist;
  let art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : '';
  if (IS_MUSIC) {
    const bar = document.querySelector('ytmusic-player-bar');
    const t = bar && bar.querySelector('.title');
    const img = bar && bar.querySelector('img.image, img');
    title = title || (t && t.textContent.trim());
    if (!artist) { const b = bar && bar.querySelector('.byline'); artist = b ? b.textContent.split('•')[0].trim() : ''; }
    if (img && img.src && !img.src.startsWith('data:')) art = img.src;
  } else {
    title = title || (document.querySelector('ytd-watch-metadata #title') || {}).textContent || document.title.replace(/ - YouTube$/, '');
    artist = artist || ((document.querySelector('ytd-watch-metadata #owner #channel-name') || {}).textContent || '').trim();
  }
  if (!art) art = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  return {
    id,
    title: (title || '').trim(),
    artist: (artist || '').trim(),
    art,
    playing: !v.paused && !v.ended,
    current: Math.floor(v.currentTime || 0),
    duration: isFinite(v.duration) ? Math.floor(v.duration) : 0,
  };
}

function reportMedia() {
  const m = mediaState();
  // Konum her saniye değişir; yalnızca anlamlı değişiklikler ve 5 sn'de bir konum gönderilir.
  const key = m ? JSON.stringify({ ...m, current: Math.floor(m.current / 5) }) : 'null';
  if (key === lastMediaKey) return;
  lastMediaKey = key;
  ipcRenderer.send('pt:media', m);
}

function clickFirst(selectors) {
  for (const sel of selectors) {
    const b = document.querySelector(sel);
    if (b) { b.click(); return true; }
  }
  return false;
}

ipcRenderer.on('pt:media-cmd', (_e, cmd) => {
  const v = getVideo();
  if (!v) return;
  if (cmd === 'pause') { if (!v.paused) v.pause(); }
  else if (cmd === 'play') { if (v.paused) v.play().catch(() => {}); }
  else if (cmd === 'toggle') {
    if (!clickFirst(IS_MUSIC ? ['ytmusic-player-bar #play-pause-button'] : [])) {
      if (v.paused) v.play().catch(() => {}); else v.pause();
    }
  } else if (cmd === 'next') {
    clickFirst(IS_MUSIC ? ['ytmusic-player-bar .next-button'] : ['#movie_player .ytp-next-button']);
  } else if (cmd === 'prev') {
    if (IS_MUSIC) clickFirst(['ytmusic-player-bar .previous-button']);
    else v.currentTime = 0;
  } else if (cmd === 'restart') {
    v.currentTime = 0;
    v.play().catch(() => {});
  }
  setTimeout(reportMedia, 150);
});

// ---------------------------------------------------------------- ana döngü
let mediaBound = null;
function loop() {
  try {
    const id = currentVideoId() || (IS_MUSIC ? playingVideoId() : null);
    if (id && id !== sb.videoId) sb.load(id);
    const v = getVideo();
    if (v) sb.attach(v);
    if (v && mediaBound !== v) {
      mediaBound = v;
      for (const ev of ['play', 'pause', 'ended', 'loadedmetadata', 'emptied']) v.addEventListener(ev, () => setTimeout(reportMedia, 50));
    }
    if (sb.segments.length && settings.sponsorblock.showMarkers && !document.querySelector('#movie_player .pt-sb-bar')) {
      sb.renderMarkers();
    }
    ensureButton();
    reportMedia();
  } catch { /* döngü asla durmamalı */ }
}

window.addEventListener('yt-navigate-finish', loop);
document.addEventListener('yt-navigate-finish', loop);
setInterval(loop, 700);

// ================================================================ YouTube Music: Tubify kitaplığı
// YTM'nin hesap isteyen "Kaydet / Beğen / Oynatma listesine ekle" öğeleri yerine
// hesapsız çalışan kendi menülerimiz ve çalar çubuğu düğmelerimiz kullanılır.
if (IS_MUSIC) {
  const flags = { 'pt-music': true };
  const setFlag = (name, on) => { flags[name] = !!on; applyFlags(); };
  // YTM <html> class listesini sıfırlayabildiği için data-* öznitelikleri kullanılır ve düzenli yeniden uygulanır.
  function applyFlags() {
    const root = document.documentElement;
    if (!root) return; // preload anında belge henüz oluşmamış olabilir
    for (const [k, v] of Object.entries(flags)) { if (v) { if (!root.hasAttribute('data-' + k)) root.setAttribute('data-' + k, ''); } else root.removeAttribute('data-' + k); }
  }
  applyFlags();
  const ICONS = {
    heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    heartOutline: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    queue: 'M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z',
    next: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z',
    list: 'M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z',
    download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
    radio: 'M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.89 2 2 2h16c1.11 0 2-.9 2-2V8c0-1.11-.89-2-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z',
    artist: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    album: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z',
    link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    play: 'M8 5v14l11-7z',
    shuffle: 'M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
    repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
    repeatOne: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z',
    save: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',
  };

  let queueMode = { active: false, trackId: null, shuffle: false, repeat: 'off' };
  let likedNow = false;
  let likedFor = null;
  let endSentFor = null;
  let stripMode = false;

  const lib = (op, ...args) => ipcRenderer.invoke('pt:lib', op, ...args);

  // ------------------------------------------------ Spotify tarzı menü bileşeni
  let ptMenuEl = null;
  let ptSubEl = null;
  function closePtMenu() {
    if (ptSubEl) { ptSubEl.remove(); ptSubEl = null; }
    if (ptMenuEl) { ptMenuEl.remove(); ptMenuEl = null; }
  }

  // upFrom verilirse menü o noktanın ÜSTÜNE açılır (alttaki çalar çubuğu için).
  function placeMenu(m, x, y, avoidLeft, upFrom) {
    document.body.appendChild(m);
    m.style.maxHeight = Math.max(160, window.innerHeight - 16) + 'px';
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = x, top = y;
    if (left + w > window.innerWidth - 8) left = avoidLeft !== undefined ? avoidLeft - w : window.innerWidth - w - 8;
    if (upFrom !== undefined) top = upFrom - h - 8;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = Math.max(8, top) + 'px';
  }

  function menuItem(it, container) {
    if (it.sep) { container.appendChild(el('div', { class: 'ptm-sep' })); return; }
    if (it.header) { container.appendChild(el('div', { class: 'ptm-header', text: it.header })); return; }
    if (it.custom) { container.appendChild(it.custom()); return; }
    const b = el('button', { class: 'ptm-item' + (it.sub ? ' has-sub' : '') + (it.active ? ' active' : '') });
    if (it.icon) b.appendChild(svg(ICONS[it.icon] || it.icon));
    else b.appendChild(el('span', { class: 'ptm-noicon' }));
    b.appendChild(el('span', { class: 'ptm-label', text: it.label }));
    if (it.hint) b.appendChild(el('span', { class: 'ptm-hint', text: it.hint }));
    if (it.sub) b.appendChild(el('span', { class: 'ptm-arrow', text: '›' }));
    if (it.sub) {
      b.addEventListener('mouseenter', () => openSub(b, it.sub));
      b.addEventListener('click', (e) => { e.stopPropagation(); openSub(b, it.sub); });
    } else {
      b.addEventListener('mouseenter', () => { if (ptSubEl && container === ptMenuEl) { ptSubEl.remove(); ptSubEl = null; } });
      b.addEventListener('click', (e) => { e.stopPropagation(); closePtMenu(); it.run && it.run(); });
    }
    container.appendChild(b);
  }

  async function openSub(anchor, sub) {
    if (ptSubEl) ptSubEl.remove();
    const items = typeof sub === 'function' ? await sub() : sub;
    if (!ptMenuEl) return;
    ptSubEl = el('div', { class: 'ptm ptm-sub' });
    ptSubEl.addEventListener('mousedown', (e) => e.stopPropagation());
    for (const it of items) menuItem(it, ptSubEl);
    const r = anchor.getBoundingClientRect();
    placeMenu(ptSubEl, r.right + 4, r.top - 6, r.left - 4);
    // Alt menü aşağı sığmıyorsa satırın altına hizalanarak yukarı açılır.
    if (ptSubEl.offsetTop + ptSubEl.offsetHeight > window.innerHeight - 8) {
      ptSubEl.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 8) - ptSubEl.offsetHeight) + 'px';
    }
    const input = ptSubEl.querySelector('input');
    if (input) input.focus();
  }

  function openPtMenu(items, x, y, upFrom) {
    closePtMenu();
    closeMenu();
    ptMenuEl = el('div', { class: 'ptm' });
    ptMenuEl.addEventListener('mousedown', (e) => e.stopPropagation());
    for (const it of items) menuItem(it, ptMenuEl);
    placeMenu(ptMenuEl, x, y, undefined, upFrom);
  }

  // Şerit modunda görünüm yalnızca 72 px: çalar çubuğu menüleri kabukta, şeridin üstünde açılır.
  function barMenu(kind, anchor, t) {
    const r = anchor.getBoundingClientRect();
    if (stripMode) {
      ipcRenderer.send('pt:strip-menu', { kind, track: t, x: Math.round(r.left) });
      return;
    }
    const items = kind === 'download' ? downloadItems(t) : trackMenu(t);
    openPtMenu(items, r.left, r.top, r.top);
  }

  window.__ptBarMenu = (anchor) => { const t = currentTrack(); if (t) barMenu('download', anchor, t); };

  function downloadItems(t) {
    const url = `https://music.youtube.com/watch?v=${t.id}`;
    return [
      { header: T('İndir') + ' · ' + t.title },
      { icon: 'download', label: 'MP3', run: () => startDownload(url, 'mp3', false) },
      { icon: 'download', label: 'M4A (AAC)', run: () => startDownload(url, 'm4a', false) },
      { icon: 'download', label: T('Opus (orijinal)'), run: () => startDownload(url, 'opus', false) },
      { icon: 'download', label: T('Klip (MP4 video)'), run: () => startDownload(url, 'best-mp4', false) },
    ];
  }

  document.addEventListener('mousedown', () => closePtMenu());
  window.addEventListener('blur', () => closePtMenu());
  window.addEventListener('resize', () => closePtMenu());
  document.addEventListener('scroll', () => closePtMenu(), true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePtMenu(); }, true);

  // ------------------------------------------------ "Listeye ekle" alt menüsü
  function playlistSub(getTracks, doneMsg) {
    return async () => {
      const lists = await lib('playlists');
      const items = [];
      const box = () => {
        const wrap = el('div', { class: 'ptm-new' });
        const input = el('input', { type: 'text', placeholder: T('Yeni liste adı…'), maxlength: '100' });
        const create = async () => {
          const tracks = await getTracks();
          const r = await lib('create', input.value.trim(), tracks);
          closePtMenu();
          toast(T('"{0}" oluşturuldu · {1} şarkı', r.name, tracks.length), { label: T('Aç'), run: () => ipcRenderer.send('pt:open-list', r.id) });
        };
        input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') create(); if (e.key === 'Escape') closePtMenu(); });
        wrap.appendChild(svg(ICONS.add));
        wrap.appendChild(input);
        const ok = el('button', { text: T('Oluştur') });
        ok.addEventListener('click', (e) => { e.stopPropagation(); create(); });
        wrap.appendChild(ok);
        return wrap;
      };
      items.push({ custom: box });
      if (lists.length) items.push({ sep: true });
      items.push({ icon: 'heart', label: T('Beğenilen şarkılar'), run: async () => {
        const n = await lib('add', 'liked', await getTracks());
        toast(n ? T('Beğenilenlere eklendi ({0})', n) : T('Zaten beğenilenlerde'));
      } });
      for (const l of lists) {
        items.push({ icon: 'list', label: l.name, hint: String(l.count), run: async () => {
          const n = await lib('add', l.id, await getTracks());
          toast(n ? (n > 1 ? T('"{0}" listesine eklendi ({1})', l.name, n) : T('"{0}" listesine eklendi', l.name)) : T('Zaten "{0}" listesinde', l.name), { label: T('Aç'), run: () => ipcRenderer.send('pt:open-list', l.id) });
        } });
      }
      return items;
    };
  }

  // ------------------------------------------------ bağlam: şarkı / albüm / liste
  const text = (n) => (n && n.textContent || '').replace(/\s+/g, ' ').trim();
  const idFromHref = (h) => { const m = /[?&]v=([\w-]{11})/.exec(h || ''); return m ? m[1] : null; };

  function trackFromRow(row) {
    const a = [...row.querySelectorAll('a[href*="watch?v="]')][0];
    const id = a ? idFromHref(a.getAttribute('href')) : null;
    if (!id) return null;
    const title = text(row.querySelector('.title-column .title, .title')) || text(a);
    const sec = text(row.querySelector('.secondary-flex-columns yt-formatted-string, .subtitle'));
    const parts = sec.split('•').map((x) => x.trim()).filter(Boolean);
    const known = /^(Şarkı|Song|Video|Albüm|Album|Single|EP|Tekli)$/i;
    const artist = (parts.find((p) => !known.test(p) && !/dinlen|görüntü|views|plays|\d{4}$/i.test(p)) || '').trim();
    const img = row.querySelector('img');
    const dur = text(row.querySelector('.fixed-columns, .duration'));
    const secs = /^\d+:\d{2}(:\d{2})?$/.test(dur) ? dur.split(':').reduce((x, y) => x * 60 + (+y), 0) : 0;
    return {
      id, title, artist,
      art: img && img.src && img.src.startsWith('http') ? img.src : `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      duration: secs,
      artistId: (/(channel\/|browse\/)(UC[\w-]+)/.exec([...row.querySelectorAll('a[href*="channel/UC"], a[href*="browse/UC"]')].map((x) => x.getAttribute('href'))[0] || '') || [])[2],
      albumId: (/browse\/(MPRE[\w-]+)/.exec([...row.querySelectorAll('a[href*="browse/MPRE"]')].map((x) => x.getAttribute('href'))[0] || '') || [])[1],
    };
  }

  function collectionFromCard(card) {
    const a = card.querySelector('a[href*="browse/MPRE"], a[href*="playlist?list="], a[href*="browse/VL"]');
    if (!a) return null;
    const href = a.getAttribute('href');
    let browseId = null;
    const mp = /browse\/((?:MPRE|VL)[\w-]+)/.exec(href);
    const pl = /list=([\w-]+)/.exec(href);
    if (mp) browseId = mp[1]; else if (pl) browseId = 'VL' + pl[1];
    if (!browseId) return null;
    const sub = text(card.querySelector('.subtitle'));
    return { browseId, name: text(card.querySelector('.title')) || T('Liste'), artist: (sub.split('•')[1] || '').trim(), isAlbum: browseId.startsWith('MPRE') };
  }

  function collectionFromPage() {
    const u = new URL(location.href);
    let browseId = null;
    const mp = /^\/browse\/((?:MPRE|VL)[\w-]+)/.exec(u.pathname);
    if (mp) browseId = mp[1];
    else if (u.pathname === '/playlist' && u.searchParams.get('list')) browseId = 'VL' + u.searchParams.get('list');
    if (!browseId) return null;
    const h = document.querySelector('ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-editable-playlist-detail-header-renderer');
    const name = text(h && h.querySelector('h1, .title, h2')) || document.title.replace(/ - YouTube Music$/, '');
    const strap = text(h && h.querySelector('.strapline-text, .subtitle, .strapline'));
    return { browseId, name, artist: (strap.split('•')[0] || '').trim(), isAlbum: browseId.startsWith('MPRE') };
  }

  function currentTrack() {
    const m = mediaState();
    return m && m.id ? { id: m.id, title: m.title, artist: m.artist, art: m.art, duration: m.duration } : null;
  }

  // ------------------------------------------------ menüler
  function trackMenu(t) {
    const tracks = async () => [t];
    return [
      { header: t.title + (t.artist ? ' · ' + t.artist : '') },
      { icon: 'queue', label: T('Sıraya ekle'), run: async () => { await lib('enqueue', [t], false); toast(T('Sıraya eklendi')); } },
      { icon: 'next', label: T('Sonra çal'), run: async () => { await lib('enqueue', [t], true); toast(T('Sıradaki şarkı olarak eklendi')); } },
      { sep: true },
      { icon: 'heart', label: T('Beğenilenlere ekle / çıkar'), run: async () => {
        const on = await lib('toggleLike', t);
        toast(on ? T('Beğenilen şarkılara eklendi') : T('Beğenilenlerden çıkarıldı'));
        refreshLike(true);
      } },
      { icon: 'add', label: T('Listeye ekle'), sub: playlistSub(tracks) },
      { sep: true },
      { icon: 'radio', label: T('Şarkı radyosunu başlat'), run: () => ipcRenderer.send('pt:music-go', { kind: 'radio', videoId: t.id }) },
      ...(t.artistId ? [{ icon: 'artist', label: T('Sanatçıya git'), run: () => ipcRenderer.send('pt:music-go', { kind: 'browse', browseId: t.artistId }) }] : []),
      ...(t.albumId ? [{ icon: 'album', label: T('Albüme git'), run: () => ipcRenderer.send('pt:music-go', { kind: 'browse', browseId: t.albumId }) }] : []),
      { sep: true },
      { icon: 'download', label: T('İndir'), sub: [
        { label: 'MP3', run: () => startDownload(`https://music.youtube.com/watch?v=${t.id}`, 'mp3', false) },
        { label: 'M4A (AAC)', run: () => startDownload(`https://music.youtube.com/watch?v=${t.id}`, 'm4a', false) },
        { label: T('Opus (orijinal)'), run: () => startDownload(`https://music.youtube.com/watch?v=${t.id}`, 'opus', false) },
        { label: T('Klip (MP4 video)'), run: () => startDownload(`https://music.youtube.com/watch?v=${t.id}`, 'best-mp4', false) },
      ] },
      { icon: 'link', label: T('Bağlantıyı kopyala'), run: () => { navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${t.id}`).then(() => toast(T('Bağlantı kopyalandı'))); } },
    ];
  }

  function collectionMenu(c) {
    const tracks = async () => {
      toast(T('Şarkılar alınıyor…'), null, 2500);
      const r = await lib('fetchTracks', c.browseId, c.artist);
      if (!r.ok) { toast(T('Şarkılar alınamadı: {0}', T(r.error || ''))); return []; }
      return r.tracks;
    };
    return [
      { header: c.name },
      { icon: 'play', label: T('Çal'), run: () => lib('playCollection', c.browseId, c.name, false, c.artist) },
      { icon: 'shuffle', label: T('Karıştırarak çal'), run: () => lib('playCollection', c.browseId, c.name, true, c.artist) },
      { icon: 'queue', label: T('Sıraya ekle'), run: async () => { const t = await tracks(); if (t.length) { await lib('enqueue', t, false); toast(T('{0} şarkı sıraya eklendi', t.length)); } } },
      { sep: true },
      { icon: 'save', label: T('Kitaplığıma kaydet'), run: async () => {
        const r = await lib('importCollection', c.browseId, c.name, c.artist);
        if (r.ok) toast(T('"{0}" kitaplığına kaydedildi · {1} şarkı', r.name, r.count), { label: T('Aç'), run: () => ipcRenderer.send('pt:open-list', r.id) });
        else toast('Kaydedilemedi: ' + (r.error || ''));
      } },
      { icon: 'add', label: T('Listeye ekle'), sub: playlistSub(tracks) },
      { sep: true },
      { icon: 'download', label: T('Tümünü indir'), sub: [
        { label: 'MP3', run: () => lib('downloadCollection', c.browseId, c.name, 'mp3', c.artist).then((r) => toast(r.ok ? T('{0} şarkı indirme sırasına eklendi', r.count) : T('İndirilemedi: {0}', T(r.error)), { label: T('İndirmeler'), run: () => ipcRenderer.send('pt:open-manager') })) },
        { label: 'M4A (AAC)', run: () => lib('downloadCollection', c.browseId, c.name, 'm4a', c.artist).then((r) => toast(r.ok ? T('{0} şarkı indirme sırasına eklendi', r.count) : T('İndirilemedi: {0}', T(r.error)), { label: T('İndirmeler'), run: () => ipcRenderer.send('pt:open-manager') })) },
      ] },
      { icon: 'link', label: T('Bağlantıyı kopyala'), run: () => {
        const url = c.browseId.startsWith('VL') ? `https://music.youtube.com/playlist?list=${c.browseId.slice(2)}` : `https://music.youtube.com/browse/${c.browseId}`;
        navigator.clipboard.writeText(url).then(() => toast(T('Bağlantı kopyalandı')));
      } },
    ];
  }

  // Bir öğenin (satır, kart, çalar çubuğu, sayfa başlığı) bağlamını çözer.
  function contextFor(target) {
    if (target.closest('ytmusic-player-bar')) {
      const t = currentTrack();
      return t ? { kind: 'track', t } : null;
    }
    const row = target.closest('ytmusic-responsive-list-item-renderer');
    if (row) {
      const t = trackFromRow(row);
      if (t) return { kind: 'track', t };
      const c = collectionFromCard(row);
      if (c) return { kind: 'collection', c };
      return null;
    }
    const card = target.closest('ytmusic-two-row-item-renderer');
    if (card) {
      const t = trackFromRow(card);
      if (t) return { kind: 'track', t };
      const c = collectionFromCard(card);
      if (c) return { kind: 'collection', c };
      return null;
    }
    if (target.closest('ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-editable-playlist-detail-header-renderer')) {
      const c = collectionFromPage();
      if (c) return { kind: 'collection', c };
    }
    return null;
  }

  function showContext(ctx, x, y) {
    openPtMenu(ctx.kind === 'track' ? trackMenu(ctx.t) : collectionMenu(ctx.c), x, y);
  }

  // YTM'nin "Kitaplığa kaydet" (oturum isteyen) düğmesi → Tubify kitaplığına kaydet / eşitle.
  const SAVE_SEL = 'ytmusic-responsive-header-renderer ytmusic-toggle-button-renderer, ytmusic-detail-header-renderer ytmusic-toggle-button-renderer, ytmusic-editable-playlist-detail-header-renderer ytmusic-toggle-button-renderer';
  let savingNow = false;
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest(SAVE_SEL);
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const c = collectionFromPage();
    if (!c || savingNow) return;
    savingNow = true;
    btn.setAttribute('data-pt-busy', '');
    toast(T('Kitaplığına kaydediliyor…'), null, 2500);
    try {
      const r = await lib('importCollection', c.browseId, c.name, c.artist);
      if (r.ok) {
        toast(r.synced ? T('"{0}" güncellendi · {1} şarkı', r.name, r.count) : T('"{0}" kitaplığına kaydedildi · {1} şarkı', r.name, r.count),
          { label: T('Aç'), run: () => ipcRenderer.send('pt:open-list', r.id) });
        savedFor = null;
      } else toast('Kaydedilemedi: ' + (r.error || ''));
    } finally {
      savingNow = false;
      btn.removeAttribute('data-pt-busy');
      markSaved();
    }
  }, true);

  // Sayfadaki liste zaten kayıtlıysa düğme yeşil görünür.
  let savedFor = null;
  async function markSaved() {
    const btn = document.querySelector(SAVE_SEL);
    const c = btn && collectionFromPage();
    if (!btn || !c) return;
    if (savedFor === c.browseId && btn.hasAttribute('data-pt-checked')) return;
    savedFor = c.browseId;
    const saved = await lib('savedAs', c.browseId);
    btn.setAttribute('data-pt-checked', '');
    if (saved) {
      btn.setAttribute('data-pt-saved', '');
      btn.title = T('Tubify kitaplığında: "{0}" · tekrar tıklayınca güncellenir', saved.name);
    } else {
      btn.removeAttribute('data-pt-saved');
      btn.title = T('Tubify kitaplığına kaydet');
    }
  }
  ipcRenderer.on('pt:lib-changed', () => { savedFor = null; markSaved(); });

  // YTM'nin Premium isteyen "İndir" düğmeleri yerine bizim indirme menümüz.
  document.addEventListener('click', (e) => {
    const dl = e.target.closest && e.target.closest('ytmusic-download-button-renderer, [aria-label="İndir"], [aria-label="Download"]');
    if (!dl || dl.closest('#pt-dl-menu, .ptm, #pt-dl-btn')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const ctx = contextFor(dl) || (currentTrack() ? { kind: 'track', t: currentTrack() } : null);
    const r = dl.getBoundingClientRect();
    if (ctx && ctx.kind === 'track' && dl.closest('ytmusic-player-bar')) { barMenu('download', dl, ctx.t); return; }
    if (ctx && ctx.kind === 'track') {
      const url = `https://music.youtube.com/watch?v=${ctx.t.id}`;
      openPtMenu([
        { header: T('İndir') + ' · ' + ctx.t.title },
        { icon: 'download', label: 'MP3', run: () => startDownload(url, 'mp3', false) },
        { icon: 'download', label: 'M4A (AAC)', run: () => startDownload(url, 'm4a', false) },
        { icon: 'download', label: T('Opus (orijinal)'), run: () => startDownload(url, 'opus', false) },
        { icon: 'download', label: T('Klip (MP4 video)'), run: () => startDownload(url, 'best-mp4', false) },
      ], r.left, r.bottom + 4);
    } else if (ctx) showContext(ctx, r.left, r.bottom + 4);
  }, true);

  // YTM'nin ⋮ menüsü yerine bizimki.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('ytmusic-menu-renderer yt-button-shape, ytmusic-menu-renderer tp-yt-paper-icon-button, ytmusic-menu-renderer yt-icon-button, ytmusic-menu-renderer button');
    if (!btn) return;
    const ctx = contextFor(btn);
    if (!ctx) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (ctx.kind === 'track' && btn.closest('ytmusic-player-bar')) { barMenu('track', btn, ctx.t); return; }
    const r = btn.getBoundingClientRect();
    showContext(ctx, r.left, r.bottom + 4);
  }, true);

  // Sağ tık da aynı menüyü açar.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    const ctx = e.target.closest && contextFor(e.target);
    if (!ctx) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (ctx.kind === 'track' && e.target.closest('ytmusic-player-bar')) { barMenu('track', e.target, ctx.t); return; }
    showContext(ctx, e.clientX, e.clientY);
  }, true);

  // ------------------------------------------------ çalar çubuğu düğmeleri
  function barButton(id, icon, title, onClick) {
    const b = el('button', { id, class: 'pt-bar-btn', title });
    b.appendChild(svg(ICONS[icon]));
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(b, e); });
    return b;
  }

  function setIcon(b, icon) {
    const p = b.querySelector('path');
    if (p) p.setAttribute('d', ICONS[icon]);
  }

  async function refreshLike(force) {
    const t = currentTrack();
    const b = document.getElementById('pt-like-btn');
    if (!t || !b) return;
    if (!force && likedFor === t.id) return;
    likedFor = t.id;
    likedNow = await lib('isLiked', t.id);
    setIcon(b, likedNow ? 'heart' : 'heartOutline');
    b.classList.toggle('on', likedNow);
    b.title = likedNow ? T('Beğenilenlerden çıkar') : T('Beğenilen şarkılara ekle');
  }
  ipcRenderer.on('pt:lib-changed', () => refreshLike(true));

  function ensureBarControls() {
    const host = document.querySelector('ytmusic-player-bar .middle-controls-buttons');
    if (!host) return;
    const hasTrack = !!currentTrack();
    let like = document.getElementById('pt-like-btn');
    if (!hasTrack) {
      for (const id of ['pt-like-btn', 'pt-add-btn']) { const x = document.getElementById(id); if (x) x.remove(); }
      return;
    }
    if (!like || like.parentElement !== host) {
      if (like) like.remove();
      like = barButton('pt-like-btn', 'heartOutline', T('Beğenilen şarkılara ekle'), async () => {
        const t = currentTrack();
        if (!t) return;
        const on = await lib('toggleLike', t);
        toast(on ? T('Beğenilen şarkılara eklendi') : T('Beğenilenlerden çıkarıldı'));
        refreshLike(true);
      });
      host.insertBefore(like, host.firstChild);
      likedFor = null;
    }
    let add = document.getElementById('pt-add-btn');
    if (!add || add.parentElement !== host) {
      if (add) add.remove();
      add = barButton('pt-add-btn', 'add', T('Sıraya / listeye ekle'), (b) => {
        const t = currentTrack();
        if (t) barMenu('track', b, t);
      });
      like.after(add);
    }
    refreshLike(false);

    // Sıra modunda YTM'nin karıştır/tekrarla düğmeleri yerine bizimkiler.
    const right = document.querySelector('ytmusic-player-bar .right-controls-buttons');
    let sh = document.getElementById('pt-shuffle-btn');
    let rp = document.getElementById('pt-repeat-btn');
    if (!queueMode.active || !right) { if (sh) sh.remove(); if (rp) rp.remove(); return; }
    if (!sh || sh.parentElement !== right) {
      if (sh) sh.remove();
      sh = barButton('pt-shuffle-btn', 'shuffle', T('Karıştır'), () => ipcRenderer.send('pt:queue-cmd', 'shuffle'));
      right.appendChild(sh);
    }
    if (!rp || rp.parentElement !== right) {
      if (rp) rp.remove();
      rp = barButton('pt-repeat-btn', 'repeat', T('Tekrarla'), () => ipcRenderer.send('pt:queue-cmd', 'repeat'));
      right.appendChild(rp);
    }
    sh.classList.toggle('on', queueMode.shuffle);
    sh.title = queueMode.shuffle ? T('Karıştırma: açık') : T('Karıştırma: kapalı');
    rp.classList.toggle('on', queueMode.repeat !== 'off');
    setIcon(rp, queueMode.repeat === 'one' ? 'repeatOne' : 'repeat');
    rp.title = queueMode.repeat === 'one' ? T('Tekrar: tek şarkı') : queueMode.repeat === 'all' ? T('Tekrar: tüm liste') : T('Tekrar: kapalı');
  }

  // ------------------------------------------------ Tubify çalma sırası modu
  ipcRenderer.on('pt:queue-mode', (_e, q) => {
    queueMode = q || { active: false };
    setFlag('pt-queue', !!queueMode.active);
    endSentFor = null;
    ensureBarControls();
  });
  ipcRenderer.on('pt:strip', (_e, on) => { stripMode = !!on; setFlag('pt-strip', stripMode); });

  // Şarkı bitmeden hemen önce duraklat: YTM kendi sırasına geçmesin, bizimki devam etsin.
  function watchEnd() {
    const v = getVideo();
    if (!v || !queueMode.active || adShowing()) return;
    const id = playingVideoId();
    if (id !== queueMode.trackId || endSentFor === id) return;
    if (isFinite(v.duration) && v.duration > 1 && v.duration - v.currentTime < 0.45 && !v.paused) {
      endSentFor = id;
      v.pause();
      ipcRenderer.send('pt:track-ended', id);
    }
  }
  setInterval(watchEnd, 150);
  document.addEventListener('timeupdate', watchEnd, true);
  document.addEventListener('ended', () => {
    const id = playingVideoId();
    if (queueMode.active && id === queueMode.trackId && endSentFor !== id) { endSentFor = id; ipcRenderer.send('pt:track-ended', id); }
  }, true);

  // İleri/geri düğmeleri ve medya tuşları bizim sıramızı kullanır.
  document.addEventListener('click', (e) => {
    if (!queueMode.active) return;
    const nextB = e.target.closest && e.target.closest('ytmusic-player-bar .next-button');
    const prevB = e.target.closest && e.target.closest('ytmusic-player-bar .previous-button');
    if (!nextB && !prevB) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ipcRenderer.send('pt:queue-cmd', nextB ? 'next' : 'prev');
  }, true);

  function claimMediaKeys() {
    if (!queueMode.active || !navigator.mediaSession) return;
    try {
      navigator.mediaSession.setActionHandler('nexttrack', () => ipcRenderer.send('pt:queue-cmd', 'next'));
      navigator.mediaSession.setActionHandler('previoustrack', () => ipcRenderer.send('pt:queue-cmd', 'prev'));
    } catch { /* yoksay */ }
  }

  // ------------------------------------------------ YTM büyük oynatıcısı yerine Tubify "Şu an çalıyor"
  // Şarkıya tıklamak yalnızca çalar (Spotify gibi); büyük ekran ▲ düğmesi / çubuğa tıklama ile açılır
  // ve bu Tubify'ın sade ekranıdır. YTM'nin kendi ekranı yalnızca "Videoyu göster" istenince açılır.
  let allowYtPlayer = false;
  let internalToggle = false;
  const layoutState = () => { const l = document.querySelector('ytmusic-app-layout'); return l ? l.getAttribute('player-ui-state') : ''; };
  function toggleYtPlayer() {
    const b = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
    if (!b) return;
    internalToggle = true;
    try { b.click(); } finally { setTimeout(() => { internalToggle = false; }, 0); }
  }
  function enforcePlayerPage() {
    const st = layoutState();
    if (st === 'PLAYER_PAGE_OPEN' && !allowYtPlayer) toggleYtPlayer();
    else if (st !== 'PLAYER_PAGE_OPEN' && allowYtPlayer && Date.now() - allowSince > 1500) allowYtPlayer = false;
  }
  let allowSince = 0;
  ipcRenderer.on('pt:show-yt-player', () => {
    allowYtPlayer = true;
    allowSince = Date.now();
    if (layoutState() !== 'PLAYER_PAGE_OPEN') toggleYtPlayer();
  });
  const layoutObserver = new MutationObserver(enforcePlayerPage);
  (function watchLayout() {
    const l = document.querySelector('ytmusic-app-layout');
    if (!l) { setTimeout(watchLayout, 300); return; }
    layoutObserver.observe(l, { attributes: true, attributeFilter: ['player-ui-state'] });
    enforcePlayerPage();
  })();

  document.addEventListener('click', (e) => {
    if (internalToggle) return;
    const bar = e.target.closest && e.target.closest('ytmusic-player-bar');
    if (!bar) return;
    const toggle = e.target.closest('.toggle-player-page-button');
    if (!toggle && e.target.closest('button, tp-yt-paper-slider, #progress-bar, a, yt-icon-button, ytmusic-menu-renderer, input, .pt-bar-btn, #pt-dl-btn, yt-formatted-string.byline a')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // YTM ekranı "Videoyu göster" ile açıksa ▲ onu kapatır.
    if (layoutState() === 'PLAYER_PAGE_OPEN') { allowYtPlayer = false; toggleYtPlayer(); return; }
    ipcRenderer.send('pt:np-toggle');
  }, true);

  // YTM ekranındaki "Kaydet" (sıradakileri kaydet) → Tubify listesi.
  document.addEventListener('click', async (e) => {
    const chip = e.target.closest && e.target.closest('ytmusic-player-page ytmusic-chip-cloud-chip-renderer');
    if (!chip || !/^(Kaydet|Save)$/i.test((chip.textContent || '').trim())) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const r = await lib('saveQueue');
    if (r && r.id) toast(T('"{0}" oluşturuldu · {1} şarkı', r.name, r.count), { label: T('Aç'), run: () => ipcRenderer.send('pt:open-list', r.id) });
    else toast(T('Sıradakiler kaydedilemedi'));
  }, true);

  // ------------------------------------------------ müzik videolarını kapat (yalnızca kapak)
  let lastQualityFor = null;
  let lastAvSwitch = 0;
  function applyVideoOff() {
    const off = !!(settings.music && settings.music.videoOff);
    setFlag('pt-novideo', off);
    if (!off) { lastQualityFor = null; return; }
    // Varsayılan kaliteyi en düşüğe sabitle (YouTube oynatıcı tercihi); yalnızca gerekirse yazılır.
    try {
      const cur = JSON.parse(localStorage.getItem('yt-player-quality') || 'null');
      const q = cur && JSON.parse(cur.data || '{}').quality;
      if (q !== 144) {
        const now = Date.now();
        localStorage.setItem('yt-player-quality', JSON.stringify({ data: JSON.stringify({ quality: 144, previousQuality: 144 }), expiration: now + 30 * 864e5, creation: now }));
      }
    } catch { /* yoksay */ }
    // "Şarkı" sürümü varsa ona geç: YouTube Music şarkıları yalnızca ses olarak akıtır (görüntü verisi sıfır).
    const av = document.querySelector('ytmusic-av-toggle');
    if (av && av.getAttribute('is-video-playback-mode-selected') === 'true' && !av.hasAttribute('toggle-disabled') && Date.now() - lastAvSwitch > 4000) {
      const songBtn = av.querySelector('.song-button');
      if (songBtn) { lastAvSwitch = Date.now(); songBtn.click(); }
    }
    // Yalnızca klibi olan parçalarda görüntü en düşük kaliteye iner.
    const id = playingVideoId();
    if (id && id !== lastQualityFor) {
      lastQualityFor = id;
      try {
        contextBridge.executeInMainWorld({
          func: () => {
            const p = document.getElementById('movie_player');
            if (p && p.setPlaybackQualityRange) { p.setPlaybackQualityRange('tiny', 'tiny'); if (p.setPlaybackQuality) p.setPlaybackQuality('tiny'); }
          },
        });
      } catch { /* yoksay */ }
    }
  }
  function restoreQuality() {
    try {
      contextBridge.executeInMainWorld({
        func: () => {
          const p = document.getElementById('movie_player');
          if (p && p.setPlaybackQualityRange) p.setPlaybackQualityRange('auto', 'auto');
        },
      });
      localStorage.removeItem('yt-player-quality');
    } catch { /* yoksay */ }
  }
  ipcRenderer.on('pt:settings', () => {
    if (!(settings.music && settings.music.videoOff)) restoreQuality();
    applyVideoOff();
  });

  // Hesap durumu: hesapsızken YTM'nin oturum isteyen öğeleri gizlenir.
  function markGuest() {
    const guest = !/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=/.test(document.cookie);
    setFlag('pt-guest', guest);
  }

  setInterval(() => {
    try {
      markGuest();
      applyFlags();
      ensureBarControls();
      markSaved();
      enforcePlayerPage();
      applyVideoOff();
      claimMediaKeys();
    } catch { /* yoksay */ }
  }, 800);
}
