'use strict';
// YouTube Music kitaplığı: kullanıcının listeleri, albümleri, sanatçıları.
// Sorgular müzik sayfasının kendi oturumu ve yapılandırmasıyla (InnerTube) sayfa içinden yapılır.

// Sayfanın ana dünyasında çalışır; tek bir ifade olmalı ve dış değişken kullanmamalıdır.
const PAGE_API = String.raw`(async (op, arg) => {
  const cfg = window.ytcfg;
  if (!cfg || !cfg.get) return { ok: false, error: 'not-ready' };
  const loggedIn = !!cfg.get('LOGGED_IN');
  if (!loggedIn && (op === 'library' || op === 'create')) return { ok: true, loggedIn: false };

  async function authHeaders() {
    const origin = location.origin;
    const cookie = (name) => { const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-.$]/g, '\\$&') + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; };
    const sapisid = cookie('SAPISID') || cookie('__Secure-3PAPISID');
    const h = {
      'Content-Type': 'application/json',
      'X-Origin': origin,
      'X-Goog-AuthUser': String(cfg.get('SESSION_INDEX') || 0),
      'X-Youtube-Client-Name': String(cfg.get('INNERTUBE_CONTEXT_CLIENT_NAME') || 67),
      'X-Youtube-Client-Version': String(cfg.get('INNERTUBE_CLIENT_VERSION') || ''),
    };
    if (cfg.get('VISITOR_DATA')) h['X-Goog-Visitor-Id'] = cfg.get('VISITOR_DATA');
    if (cfg.get('DELEGATED_SESSION_ID')) h['X-Goog-PageId'] = cfg.get('DELEGATED_SESSION_ID');
    if (sapisid) {
      const ts = Math.floor(Date.now() / 1000);
      const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(ts + ' ' + sapisid + ' ' + origin));
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      h.Authorization = 'SAPISIDHASH ' + ts + '_' + hex;
    }
    return h;
  }

  async function call(endpoint, body) {
    const key = cfg.get('INNERTUBE_API_KEY');
    const res = await fetch('/youtubei/v1/' + endpoint + '?prettyPrint=false' + (key ? '&key=' + key : ''), {
      method: 'POST', credentials: 'include', headers: await authHeaders(),
      body: JSON.stringify(Object.assign({ context: cfg.get('INNERTUBE_CONTEXT') }, body)),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const text = (x) => !x ? '' : x.simpleText || (x.runs ? x.runs.map((r) => r.text).join('') : '');
  const bestThumb = (list) => {
    if (!list || !list.length) return '';
    const sorted = list.slice().sort((a, b) => (a.width || 0) - (b.width || 0));
    const pick = sorted.find((t) => (t.width || 0) >= 120) || sorted[sorted.length - 1];
    return pick.url.startsWith('//') ? 'https:' + pick.url : pick.url;
  };

  function collect(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) collect(n, out); return; }
    for (const k of Object.keys(node)) {
      if (k === 'musicTwoRowItemRenderer' || k === 'musicResponsiveListItemRenderer') out.push([k, node[k]]);
      else if (k !== 'frameworkUpdates') collect(node[k], out);
    }
  }

  function toItem([kind, r]) {
    let title, subtitle, thumbs, nav;
    if (kind === 'musicTwoRowItemRenderer') {
      title = text(r.title);
      subtitle = text(r.subtitle);
      thumbs = r.thumbnailRenderer && r.thumbnailRenderer.musicThumbnailRenderer && r.thumbnailRenderer.musicThumbnailRenderer.thumbnail.thumbnails;
      nav = r.navigationEndpoint;
    } else {
      const cols = (r.flexColumns || []).map((c) => text(c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text));
      title = cols[0] || '';
      subtitle = cols.slice(1).filter(Boolean).join(' • ');
      thumbs = r.thumbnail && r.thumbnail.musicThumbnailRenderer && r.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails;
      nav = r.navigationEndpoint;
    }
    const be = nav && nav.browseEndpoint;
    if (!be || !be.browseId || !title) return null;
    const cfgs = be.browseEndpointContextSupportedConfigs;
    const pageType = cfgs && cfgs.browseEndpointContextMusicConfig && cfgs.browseEndpointContextMusicConfig.pageType || '';
    return { id: be.browseId, title, subtitle, thumb: bestThumb(thumbs), pageType };
  }

  async function browseList(browseId) {
    const data = await call('browse', { browseId });
    const raw = [];
    collect(data.contents, raw);
    const seen = new Set();
    return raw.map(toItem).filter((i) => i && !seen.has(i.id) && seen.add(i.id));
  }

  // Albüm / liste sayfasındaki şarkılar (hesap gerekmez; herkese açık listeler için çalışır).
  function trackFrom(r) {
    const vid = (r.playlistItemData && r.playlistItemData.videoId) ||
      (JSON.stringify(r.overlay || r.navigationEndpoint || {}).match(/"videoId":"([\w-]{11})"/) || [])[1];
    if (!vid) return null;
    const cols = (r.flexColumns || []).map((c) => c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text);
    const runs = [].concat(...cols.slice(1).map((c) => (c && c.runs) || []));
    // Sanatçılar: sanatçı kanalına (UC…) giden bağlantılar.
    const artistRuns = runs.filter((x) => { const b = x.navigationEndpoint && x.navigationEndpoint.browseEndpoint; return b && /^UC/.test(b.browseId || ''); });
    let artist = artistRuns.map((x) => x.text).join(', ');
    if (!artist) {
      const parts = text(cols[1]).split(' • ').map((x) => x.trim());
      artist = parts.find((x) => x && !/^(Şarkı|Song|Video|Albüm|Album|Single|EP|Tekli|Bölüm|Episode)$/i.test(x) && !/^\d+:\d{2}/.test(x)) || '';
    }
    const fixed = (r.fixedColumns || []).map((c) => text(c.musicResponsiveListItemFixedColumnRenderer && c.musicResponsiveListItemFixedColumnRenderer.text));
    const durText = fixed.concat(runs.map((x) => x.text)).find((x) => /^\d+:\d{2}(:\d{2})?$/.test((x || '').trim())) || '';
    const dur = durText ? durText.trim().split(':').reduce((a, b) => a * 60 + (+b), 0) : 0;
    const thumbs = r.thumbnail && r.thumbnail.musicThumbnailRenderer && r.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails;
    return { id: vid, title: text(cols[0]), artist: artist.trim(), art: bestThumb(thumbs), duration: dur };
  }

  async function listTracks(browseId) {
    let data = await call('browse', { browseId });
    const albumArt = (() => { const m = JSON.stringify(data.header || data.contents || {}).match(/"thumbnails":\[(\{[^\]]+\})\]/); try { return bestThumb(JSON.parse('[' + m[1] + ']')); } catch (e) { return ''; } })();
    const out = [];
    const seen = new Set();
    const take = (node) => {
      const raw = [];
      collect(node, raw);
      for (const [kind, r] of raw) {
        if (kind !== 'musicResponsiveListItemRenderer') continue;
        const t = trackFrom(r);
        if (t && !seen.has(t.id)) { if (!t.art) t.art = albumArt || ('https://i.ytimg.com/vi/' + t.id + '/mqdefault.jpg'); seen.add(t.id); out.push(t); }
      }
    };
    take(data.contents);
    // Uzun listeler parça parça gelir.
    for (let page = 0; page < 40; page++) {
      const token = (JSON.stringify(data).match(/"continuationCommand":\{"token":"([^"]+)"/) || JSON.stringify(data).match(/"nextContinuationData":\{"continuation":"([^"]+)"/) || [])[1];
      if (!token) break;
      data = await call('browse', { continuation: token });
      const before = out.length;
      take(data);
      if (out.length === before) break;
    }
    return { tracks: out };
  }

  try {
    if (op === 'search') {
      const q = String(arg || '').trim();
      if (!q) return { ok: true, tracks: [] };
      const grab = (data) => {
        const raw = [];
        collect(data.contents, raw);
        const seen = new Set();
        return raw.filter(([k]) => k === 'musicResponsiveListItemRenderer').map(([, r]) => trackFrom(r))
          .filter((t) => t && t.title && !seen.has(t.id) && seen.add(t.id))
          .map((t) => Object.assign(t, { art: t.art || 'https://i.ytimg.com/vi/' + t.id + '/mqdefault.jpg' }));
      };
      // Yalnızca şarkılar filtresi; sonuç gelmezse genel arama.
      let tracks = grab(await call('search', { query: q, params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==' }));
      if (!tracks.length) tracks = grab(await call('search', { query: q }));
      return { ok: true, tracks: tracks.slice(0, 25) };
    }
    if (op === 'tracks') {
      const r = await listTracks(String(arg));
      return { ok: true, tracks: r.tracks };
    }
    if (op === 'library') {
      const [playlists, albums, artists] = await Promise.all([
        browseList('FEmusic_liked_playlists').catch(() => null),
        browseList('FEmusic_liked_albums').catch(() => null),
        browseList('FEmusic_library_corpus_track_artists').catch(() => null),
      ]);
      if (!playlists && !albums && !artists) return { ok: false, error: 'Kitaplık alınamadı' };
      let account = null;
      try {
        const a = await call('account/account_menu', {});
        const header = JSON.stringify(a).match(/"accountName":\{"runs":\[\{"text":"([^"]+)"/);
        const photo = JSON.stringify(a).match(/"accountPhoto":\{"thumbnails":\[\{"url":"([^"]+)"/);
        account = { name: header ? header[1] : '', photo: photo ? photo[1] : '' };
      } catch (e) { /* isteğe bağlı */ }
      return {
        ok: true, loggedIn: true, account,
        playlists: (playlists || []).filter((p) => p.id !== 'VLLM'),
        albums: albums || [],
        artists: artists || [],
      };
    }
    if (op === 'create') {
      const r = await call('playlist/create', { title: String(arg).slice(0, 150), privacyStatus: 'PRIVATE' });
      return { ok: !!r.playlistId, playlistId: r.playlistId };
    }
    return { ok: false, error: 'bilinmeyen işlem' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
})`;

// Sayfa yenilenmeden (çalan müzik kesilmeden) uygulama içi gezinme.
const NAVIGATE = String.raw`((endpoint) => {
  const app = document.querySelector('ytmusic-app');
  if (!app || typeof app.handleNavigationEndpoint !== 'function') return false;
  app.handleNavigationEndpoint(endpoint);
  return true;
})`;

function endpointFor(target) {
  if (target.kind === 'track') return { watchEndpoint: { videoId: target.videoId } };
  if (target.kind === 'radio') return { watchEndpoint: { videoId: target.videoId, playlistId: 'RDAMVM' + target.videoId } };
  if (target.kind === 'play') return { watchPlaylistEndpoint: { playlistId: target.playlistId } };
  if (target.kind === 'shuffle') return { watchPlaylistEndpoint: { playlistId: target.playlistId, params: 'wAEB8gECKAE%3D' } };
  return { browseEndpoint: { browseId: target.browseId } };
}

function urlFor(target) {
  const base = 'https://music.youtube.com/';
  if (target.kind === 'track') return `${base}watch?v=${encodeURIComponent(target.videoId)}`;
  if (target.kind === 'radio') return `${base}watch?v=${encodeURIComponent(target.videoId)}&list=RDAMVM${encodeURIComponent(target.videoId)}`;
  if (target.kind === 'play' || target.kind === 'shuffle') return `${base}watch?list=${encodeURIComponent(target.playlistId)}`;
  const id = target.browseId;
  if (id === 'FEmusic_home') return base;
  if (id === 'FEmusic_explore') return base + 'explore';
  if (id === 'FEmusic_library_landing') return base + 'library';
  if (id.startsWith('VL')) return `${base}playlist?list=${encodeURIComponent(id.slice(2))}`;
  if (id.startsWith('UC')) return `${base}channel/${encodeURIComponent(id)}`;
  return `${base}browse/${encodeURIComponent(id)}`;
}

// YTM'nin kendi "Sıradaki" listesi (oynatıcıdaki gerçek sıra), sayfanın ana dünyasından okunur.
const READ_QUEUE = String.raw`(() => {
  const text = (x) => !x ? '' : x.simpleText || (x.runs ? x.runs.map((r) => r.text).join('') : '');
  const items = [...document.querySelectorAll('ytmusic-player-queue ytmusic-player-queue-item')];
  const out = [];
  const seen = new Set();
  items.forEach((el, i) => {
    const d = el.data || {};
    const id = d.videoId;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const th = (d.thumbnail && d.thumbnail.thumbnails) || [];
    const len = text(d.lengthText);
    out.push({
      i, id,
      title: text(d.title),
      artist: text(d.shortBylineText) || text(d.longBylineText).split(' • ')[0],
      duration: /^\d+:\d{2}(:\d{2})?$/.test(len) ? len.split(':').reduce((a, b) => a * 60 + (+b), 0) : 0,
      art: th.length ? th[th.length - 1].url : 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      selected: el.hasAttribute('selected'),
      automix: el.hasAttribute('is-automix'),
    });
  });
  return out;
})()`;

const PLAY_QUEUE_ITEM = String.raw`((i) => {
  const el = document.querySelectorAll('ytmusic-player-queue ytmusic-player-queue-item')[i];
  if (!el) return false;
  const target = el.querySelector('.song-info') || el.querySelector('.song-title') || el;
  target.click();
  return true;
})`;

async function readQueue(wc) {
  try { return await wc.executeJavaScript(READ_QUEUE, true) || []; } catch { return []; }
}

async function playQueueItem(wc, i) {
  try { return await wc.executeJavaScript(`${PLAY_QUEUE_ITEM}(${Number(i) | 0})`, true); } catch { return false; }
}

async function navigate(wc, target) {
  try {
    const ok = await wc.executeJavaScript(`${NAVIGATE}(${JSON.stringify(endpointFor(target))})`, true);
    if (ok) return;
  } catch { /* sayfa hazır değil: tam yüklemeye düş */ }
  wc.loadURL(urlFor(target));
}

async function run(wc, op, arg) {
  try {
    return await wc.executeJavaScript(`${PAGE_API}(${JSON.stringify(op)}, ${JSON.stringify(arg ?? null)})`, true);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const LOGIN_URL = 'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=' +
  encodeURIComponent('https://www.youtube.com/signin?action_handle_signin=true&app=desktop&next=' + encodeURIComponent('https://music.youtube.com/'));

module.exports = { navigate, run, readQueue, playQueueItem, LOGIN_URL };
