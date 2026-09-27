'use strict';
const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, session, ipcMain, shell, clipboard, dialog, nativeTheme, Notification,
} = require('electron');

app.setName('Tubify');
const APP_ID = 'com.tubify.desktop';
app.setAppUserModelId(APP_ID);

const log = require('./log');
const i18n = require('./i18n');
const { t: T } = i18n;
const { Store, SB_CATEGORIES } = require('./store');
const { Tools } = require('./tools');
const { DownloadManager, PRESETS } = require('./downloads');
const { AdBlock } = require('./adblock');
const { AppTray } = require('./tray');
const { runSetup } = require('./setup');
const { Shell } = require('./shell');
const { Library, lookupTrack } = require('./library');
const { Player } = require('./player');
const music = require('./music');
const sponsorblock = require('./sponsorblock');
const nav = require('./nav');

process.on('uncaughtException', (e) => log.error('uncaughtException', e));
process.on('unhandledRejection', (e) => {
  // Reklam filtresi scriptlet'lerinin kasıtlı hataları gürültü yaratmasın.
  if (e && /Script failed to execute/.test(e.message || '')) return;
  log.error('unhandledRejection', e);
});

// Yalnızca geliştirme/test: PT_DEBUG_PORT ayarlıysa uzaktan hata ayıklama açılır.
if (process.env.PT_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.PT_DEBUG_PORT);
if (process.env.PT_USER_DATA) app.setPath('userData', process.env.PT_USER_DATA);

// Arayüz dili süreç başında belirlenir; YouTube'un kendi dili de Chromium'un --lang anahtarıyla aynı dile ayarlanır.
// Bu yüzden ayar dosyası pencereler açılmadan (ve Store'dan önce) doğrudan okunur.
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const rawSettings = (() => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return null; } })();
// İlk açılış sihirbazından önceki sürümlerden gelen kullanıcı: ayar dosyası var ama setupDone alanı yok → Türkçe, sihirbazsız.
const legacyUser = !!rawSettings && !(rawSettings.ui && 'setupDone' in rawSettings.ui);
const startLang = (rawSettings && rawSettings.ui && i18n.LANGS.includes(rawSettings.ui.lang) && rawSettings.ui.lang) || (legacyUser ? 'tr' : null);
const LOCALES = { tr: 'tr-TR', en: 'en-US' };
if (startLang) app.commandLine.appendSwitch('lang', LOCALES[startLang]);
i18n.setLang(startLang || 'tr');
ipcMain.on('i18n:get', (e) => { e.returnValue = i18n.payload(); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.userAgentFallback = nav.CHROME_UA;

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, '..', 'build', 'icon.png');
// Windows görev çubuğu / bildirim alanı çok boyutlu .ico ister; tek PNG küçültülünce bulanık görünür.
const WIN_ICON = process.platform === 'win32' ? path.join(ROOT, '..', 'build', 'icon.ico') : ICON;

let store, tools, downloads, adblock, mainShell, library, player, tray;
let managerWin = null;

// ------------------------------------------------------------------ indirme / ayarlar penceresi
function openManager(tab = 'downloads', url = '') {
  if (managerWin && !managerWin.isDestroyed()) {
    managerWin.webContents.send('pt:navigate', { tab, url });
    if (managerWin.isMinimized()) managerWin.restore();
    managerWin.show();
    managerWin.focus();
    return;
  }
  managerWin = new BrowserWindow({
    width: 940,
    height: 700,
    minWidth: 640,
    minHeight: 440,
    title: T('Tubify · İndirmeler'),
    icon: WIN_ICON,
    backgroundColor: '#08080b',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#08080b', symbolColor: '#e8e8ee', height: 56 },
    webPreferences: {
      preload: path.join(ROOT, 'preload', 'ui.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  managerWin.loadFile(path.join(ROOT, 'ui', 'manager.html'), { query: { tab, url } });
  managerWin.once('ready-to-show', () => managerWin.show());
  managerWin.webContents.on('will-navigate', (e) => e.preventDefault());
  managerWin.webContents.setWindowOpenHandler(({ url: u }) => { nav.openExternal(u); return { action: 'deny' }; });
  managerWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'Escape' || (input.control && input.key.toLowerCase() === 'w'))) {
      e.preventDefault();
      managerWin.close();
    }
  });
  managerWin.on('closed', () => { managerWin = null; });
}

async function refreshFilters() {
  const wc = mainShell && mainShell.activeWc();
  try {
    await adblock.refresh();
    if (wc) wc.send('pt:toast', T('Reklam filtreleri güncellendi'));
  } catch (e) {
    if (wc) wc.send('pt:toast', T('Filtreler güncellenemedi: {0}', e.message));
  }
}

function setTheme(theme) {
  store.set({ ui: { theme } });
}

// Dil değişikliği yeniden başlatmayla uygulanır (arayüz metinleri ve YouTube'un --lang dili süreç başında belirlenir).
async function changeLanguage(lang, parent) {
  if (!i18n.LANGS.includes(lang)) return false;
  store.set({ ui: { lang } });
  if (lang === i18n.getLang()) return true;
  const win = parent && !parent.isDestroyed() ? parent : mainShell.win;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', title: 'Tubify', buttons: [i18n.tIn(lang, 'Şimdi yeniden başlat'), i18n.tIn(lang, 'Sonra')], defaultId: 0, cancelId: 1,
    message: i18n.tIn(lang, 'Dil değişikliği için Tubify yeniden başlatılsın mı?'),
  });
  if (response === 0) mainShell.quitApp({ relaunch: true });
  return true;
}

function applyTheme() {
  const t = store.get().ui.theme;
  nativeTheme.themeSource = t === 'light' ? 'light' : t === 'system' ? 'system' : 'dark';
}

function pageSettings() {
  const s = store.get();
  return { sponsorblock: s.sponsorblock, adblock: s.adblock, music: s.music };
}

function downloadSummary() {
  const list = downloads.list();
  const active = list.filter((i) => ['queued', 'preparing', 'downloading', 'processing'].includes(i.status)).length;
  return { active, progress: downloads.aggregateProgress() };
}

// ------------------------------------------------------------------ yerel kitaplık yardımcıları
function listSummary() {
  return library.get().playlists.map((p) => ({ id: p.id, name: p.name, count: p.tracks.length }));
}

async function fetchCollection(browseId, artist) {
  const m = mainShell.ensureView('music');
  const r = await music.run(m.view.webContents, 'tracks', String(browseId));
  if (!r.ok) return { ok: false, error: r.error || 'bilinmeyen hata' };
  const tracks = (r.tracks || []).map((t) => ({ ...t, artist: t.artist || artist || '' }));
  if (!tracks.length) return { ok: false, error: T('Listede çalınabilir şarkı bulunamadı') };
  return { ok: true, tracks };
}

function downloadTracks(tracks, folder, preset) {
  const p = PRESETS[preset] ? preset : 'mp3';
  tracks.forEach((t, i) => downloads.add({
    url: `https://music.youtube.com/watch?v=${t.id}`, preset: p, folder, index: i + 1, title: t.title,
  }));
  return tracks.length;
}

function trackList(listId) {
  return library.tracksOf(String(listId)) || [];
}

function listName(listId) {
  if (listId === 'liked') return T('Beğenilen şarkılar');
  const p = library.playlist(listId);
  return p ? p.name : T('Liste');
}

async function libOp(op, ...a) {
  switch (op) {
    case 'playlists': return listSummary();
    case 'isLiked': return library.isLiked(String(a[0]));
    case 'toggleLike': {
      const t = a[0];
      return library.setLiked(t, !library.isLiked(t && t.id));
    }
    case 'add': return library.addTracks(String(a[0]), Array.isArray(a[1]) ? a[1] : []);
    case 'create': {
      const p = library.createPlaylist(a[0], Array.isArray(a[1]) ? a[1] : []);
      return { id: p.id, name: p.name };
    }
    case 'enqueue': return player.enqueue(Array.isArray(a[0]) ? a[0] : [], !!a[1]);
    case 'fetchTracks': return fetchCollection(a[0], a[1]);
    case 'playCollection': {
      const r = await fetchCollection(a[0], a[3]);
      if (r.ok) player.playTracks(r.tracks, 0, { shuffle: !!a[2], source: { name: String(a[1] || '') } });
      return { ok: r.ok, error: r.error };
    }
    case 'importCollection': {
      const r = await fetchCollection(a[0], a[2]);
      if (!r.ok) return r;
      const existing = library.bySource(String(a[0]));
      if (existing) {
        const count = library.syncPlaylist(existing.id, r.tracks);
        return { ok: true, id: existing.id, name: existing.name, count, synced: true };
      }
      const p = library.createPlaylist(a[1], r.tracks, String(a[0]));
      return { ok: true, id: p.id, name: p.name, count: p.tracks.length };
    }
    case 'saveQueue': {
      const m = mainShell.views.music;
      const tracks = m ? await music.readQueue(m.view.webContents) : [];
      if (!tracks.length) return null;
      const cur = tracks.find((t) => t.selected) || tracks[0];
      const p = library.createPlaylist(T('{0} · sıradakiler', cur.title), tracks);
      return { id: p.id, name: p.name, count: p.tracks.length };
    }
    case 'savedAs': {
      const p = library.bySource(String(a[0]));
      return p ? { id: p.id, name: p.name } : null;
    }
    case 'downloadCollection': {
      const r = await fetchCollection(a[0], a[3]);
      if (!r.ok) return r;
      return { ok: true, count: downloadTracks(r.tracks, a[1] || T('Liste'), a[2]) };
    }
    default: return null;
  }
}

function playerCmd(cmd, arg) {
  switch (cmd) {
    case 'next': player.next(false); break;
    case 'prev': player.prev(); break;
    case 'toggle':
      if (!player.active && player.current() && !(mainShell.musicMedia() && mainShell.musicMedia().id)) player.resume();
      else mainShell.mediaCommand('music', 'toggle');
      break;
    case 'shuffle': player.setShuffle(typeof arg === 'boolean' ? arg : !player.shuffle); break;
    case 'repeat': if (arg) player.setRepeat(arg); else player.cycleRepeat(); break;
    case 'autoplay': player.setAutoplay(typeof arg === 'boolean' ? arg : !player.autoplay); break;
    case 'jump': player.playAt(arg | 0); break;
    case 'remove': player.removeAt(arg | 0); break;
    case 'move': if (Array.isArray(arg)) player.move(arg[0] | 0, arg[1] | 0); break;
    case 'clear': player.clearUpcoming(); break;
    case 'resume': player.resume(); break;
    default: break;
  }
}

// ------------------------------------------------------------------ IPC
function registerIpc() {
  // Müzik görünümü → yerel kitaplık / sıra
  ipcMain.handle('pt:lib', (_e, op, ...a) => libOp(String(op), ...a));
  ipcMain.on('pt:music-go', (_e, target) => {
    if (!target) return;
    mainShell.musicGo({
      kind: ['browse', 'radio', 'track'].includes(target.kind) ? target.kind : 'browse',
      browseId: String(target.browseId || 'FEmusic_home'),
      videoId: String(target.videoId || ''),
    });
  });
  ipcMain.on('pt:open-list', (_e, id) => {
    mainShell.setMode('music');
    mainShell.send('shell:open-list', String(id));
  });
  ipcMain.on('pt:strip-expand', () => { mainShell.setPage(false); mainShell.send('shell:close-page'); });
  ipcMain.on('pt:strip-menu', (_e, m) => {
    if (!m || !m.track) return;
    mainShell.send('shell:strip-menu', { kind: m.kind === 'download' ? 'download' : 'track', track: m.track, x: m.x | 0, left: mainShell.sidebarWidth() + 8 });
  });
  ipcMain.on('pt:np-toggle', () => mainShell.send('shell:np-toggle'));
  ipcMain.handle('np:upnext', async () => {
    const m = mainShell.views.music;
    return m ? music.readQueue(m.view.webContents) : [];
  });
  ipcMain.on('np:play-item', async (_e, i) => {
    const m = mainShell.views.music;
    if (m) await music.playQueueItem(m.view.webContents, i);
  });
  ipcMain.handle('np:save-tracks', (_e, name, tracks) => {
    const p = library.createPlaylist(name, Array.isArray(tracks) ? tracks : []);
    return { id: p.id, name: p.name, count: p.tracks.length };
  });
  ipcMain.on('np:video-off', (_e, on) => store.set({ music: { videoOff: !!on } }));
  ipcMain.on('np:show-video', () => {
    mainShell.setPage(false);
    mainShell.send('shell:close-page');
    mainShell.sendToMusic('pt:show-yt-player');
  });
  ipcMain.on('pt:track-ended', (_e, id) => player.onTrackEnded(String(id)));
  ipcMain.on('pt:queue-cmd', (_e, cmd) => playerCmd(cmd));

  // Kabuk → yerel kitaplık / sıra
  ipcMain.handle('lib:state', () => ({ library: library.get(), queue: player.snapshot() }));
  ipcMain.handle('lib:create', (_e, name) => { const p = library.createPlaylist(name); return { id: p.id, name: p.name }; });
  ipcMain.on('lib:rename', (_e, id, name) => library.renamePlaylist(String(id), name));
  ipcMain.handle('lib:delete', async (_e, id) => {
    const p = library.playlist(String(id));
    if (!p) return false;
    const { response } = await dialog.showMessageBox(mainShell.win, {
      type: 'warning', buttons: [T('Vazgeç'), T('Sil')], defaultId: 0, cancelId: 0,
      message: T('"{0}" silinsin mi?', p.name), detail: T('{0} şarkı listeden kaldırılacak. Bu işlem geri alınamaz.', p.tracks.length),
    });
    if (response !== 1) return false;
    library.deletePlaylist(p.id);
    return true;
  });
  ipcMain.on('lib:remove-track', (_e, listId, trackId) => library.removeTrack(String(listId), String(trackId)));
  ipcMain.on('lib:move', (_e, listId, from, to) => library.moveTrack(String(listId), from | 0, to | 0));
  ipcMain.on('lib:like', (_e, track, on) => library.setLiked(track, !!on));
  ipcMain.on('lib:add', (_e, listId, tracks) => library.addTracks(String(listId), Array.isArray(tracks) ? tracks : []));
  ipcMain.on('lib:play', (_e, listId, index, shuffle) => {
    const tracks = listId === 'history' ? library.get().history : trackList(listId);
    player.playTracks(tracks, index | 0, {
      shuffle: typeof shuffle === 'boolean' ? shuffle : undefined,
      source: { listId, name: listId === 'history' ? T('Son çalınanlar') : listName(listId) },
    });
  });
  ipcMain.on('lib:play-tracks', (_e, tracks, index) => player.playTracks(Array.isArray(tracks) ? tracks.slice(0, 500) : [], index | 0, { source: { name: T('Arama sonuçları') } }));
  ipcMain.on('lib:enqueue', (_e, tracks, next) => player.enqueue(Array.isArray(tracks) ? tracks : [], !!next));
  ipcMain.handle('lib:download', (_e, listId, preset) => {
    const tracks = listId === 'history' ? library.get().history : trackList(listId);
    if (!tracks.length) return 0;
    return downloadTracks(tracks, listId === 'history' ? T('Son çalınanlar') : listName(listId), preset);
  });
  ipcMain.handle('lib:download-tracks', (_e, tracks, preset) => {
    const list = Array.isArray(tracks) ? tracks : [];
    list.forEach((t) => downloads.add({ url: `https://music.youtube.com/watch?v=${t.id}`, preset: PRESETS[preset] ? preset : 'mp3', title: t.title }));
    return list.length;
  });
  ipcMain.handle('lib:lookup', (_e, id, title) => lookupTrack(String(id), title));
  ipcMain.on('player:cmd', (_e, cmd, arg) => playerCmd(cmd, arg));
  ipcMain.on('shell:page', (_e, open) => mainShell.setPage(open));
  ipcMain.handle('lib:search', async (_e, q) => {
    const m = mainShell.ensureView('music');
    return music.run(m.view.webContents, 'search', String(q || '').slice(0, 200));
  });

  // YouTube / Müzik görünümlerinin preload'u
  ipcMain.on('pt:boot', (e) => {
    try {
      const frameUrl = (e.senderFrame && e.senderFrame.url) || e.sender.getURL() || '';
      const isYouTube = !frameUrl || frameUrl === 'about:blank' || nav.isYouTube(frameUrl);
      e.returnValue = { isYouTube, settings: pageSettings(), i18n: isYouTube ? i18n.payload() : null };
    } catch (err) {
      log.error('boot', err);
      e.returnValue = null;
    }
  });
  ipcMain.handle('pt:sb-segments', (_e, id, cats) => sponsorblock.getSegments(String(id), (cats || []).filter((c) => SB_CATEGORIES.includes(c))));
  ipcMain.on('pt:sb-viewed', (_e, uuid) => sponsorblock.reportViewed(String(uuid)));
  ipcMain.handle('pt:download', (_e, { url, preset, playlist }) => {
    try {
      const item = downloads.add({ url, preset, playlist });
      return { ok: true, id: item.id };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.on('pt:open-manager', (_e, url) => openManager('downloads', typeof url === 'string' ? url : ''));
  ipcMain.on('pt:media', (e, media) => mainShell && mainShell.onMedia(e.sender, media));

  // Kabuk (üst çubuk + yan panel)
  ipcMain.handle('shell:init', () => ({
    version: app.getVersion(),
    ui: store.get().ui,
    music: store.get().music,
    downloads: downloadSummary(),
  }));
  ipcMain.on('shell:mode', (_e, mode) => mainShell.setMode(mode));
  ipcMain.on('shell:nav', (_e, action) => mainShell.go(action));
  ipcMain.on('shell:sidebar', (_e, collapsed) => mainShell.setSidebar(collapsed));
  ipcMain.on('shell:open-manager', (_e, tab) => openManager(tab === 'settings' ? 'settings' : 'downloads'));
  ipcMain.on('shell:menu', () => mainShell.moreMenu());
  ipcMain.on('shell:media-cmd', (_e, kind, cmd) => mainShell.mediaCommand(kind, cmd));
  ipcMain.on('shell:music-go', (_e, target) => {
    if (!target || typeof target !== 'object') return;
    const safe = {
      kind: ['browse', 'play', 'shuffle', 'login'].includes(target.kind) ? target.kind : 'browse',
      browseId: String(target.browseId || 'FEmusic_home').slice(0, 200),
      playlistId: String(target.playlistId || '').slice(0, 200),
    };
    mainShell.musicGo(safe);
  });
  ipcMain.on('shell:library-refresh', () => mainShell.refreshLibrary());
  ipcMain.handle('shell:create-playlist', (_e, title) => mainShell.createPlaylist(String(title || '').trim() || T('Yeni çalma listesi')));
  ipcMain.on('shell:download-media', (_e, kind) => {
    mainShell.setMode(kind);
    mainShell.downloadCurrent();
  });

  // İndirme / ayarlar penceresi
  ipcMain.handle('ui:init', () => ({
    downloads: downloads.list(),
    settings: store.get(),
    presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])),
    sbCategories: SB_CATEGORIES,
    version: app.getVersion(),
  }));
  ipcMain.handle('ui:add', (_e, opts) => {
    try { downloads.add(opts); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.on('ui:cancel', (_e, id) => downloads.cancel(id));
  ipcMain.on('ui:retry', (_e, id) => downloads.retry(id));
  ipcMain.on('ui:remove', (_e, id) => downloads.remove(id));
  ipcMain.on('ui:clear', () => downloads.clearFinished());
  ipcMain.on('ui:open-file', (_e, id) => {
    const it = downloads.list().find((i) => i.id === id);
    const f = it && it.files.find((x) => fs.existsSync(x));
    if (f) shell.openPath(f); else if (it) shell.openPath(store.get().download.dir);
  });
  ipcMain.on('ui:show-file', (_e, id) => {
    const it = downloads.list().find((i) => i.id === id);
    const f = it && it.files.find((x) => fs.existsSync(x));
    if (f) shell.showItemInFolder(f); else shell.openPath(store.get().download.dir);
  });
  ipcMain.on('ui:open-in-app', (_e, url) => { if (nav.isYouTube(url)) mainShell.openUrl(url); });
  ipcMain.handle('ui:clipboard', () => clipboard.readText());
  ipcMain.handle('ui:set-lang', (_e, lang) => changeLanguage(String(lang), managerWin));
  ipcMain.handle('ui:set-settings', (_e, patch) => store.set(sanitizeSettings(patch)));
  ipcMain.handle('ui:choose-dir', async () => {
    const r = await dialog.showOpenDialog(managerWin || mainShell.win, {
      properties: ['openDirectory', 'createDirectory'], defaultPath: store.get().download.dir,
    });
    if (r.canceled || !r.filePaths[0]) return null;
    store.set({ download: { dir: r.filePaths[0] } });
    return r.filePaths[0];
  });
  ipcMain.handle('ui:tools', () => tools.versions());
  ipcMain.handle('ui:update-tools', async () => {
    try { await tools.update(); return { ok: true, versions: await tools.versions() }; } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('ui:refresh-filters', async () => {
    try { await adblock.refresh(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.on('ui:open-folder', () => { fs.mkdirSync(store.get().download.dir, { recursive: true }); shell.openPath(store.get().download.dir); });
  ipcMain.handle('ui:clear-data', async () => {
    const { response } = await dialog.showMessageBox(managerWin || mainShell.win, {
      type: 'warning', buttons: [T('Vazgeç'), T('Oturumu kapat ve verileri sil')], defaultId: 0, cancelId: 0,
      message: T('Tüm çerezler, oturum ve önbellek silinecek.'),
    });
    if (response !== 1) return false;
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    for (const e of Object.values(mainShell.views)) e.view.webContents.reload();
    mainShell.library = { loading: false, loggedIn: null };
    mainShell.send('shell:library', mainShell.library);
    return true;
  });
}

function sanitizeSettings(p) {
  const out = {};
  if (typeof p.adblock === 'boolean') out.adblock = p.adblock;
  if (p.sponsorblock) {
    out.sponsorblock = {};
    for (const k of ['enabled', 'notify', 'showMarkers']) if (typeof p.sponsorblock[k] === 'boolean') out.sponsorblock[k] = p.sponsorblock[k];
    if (p.sponsorblock.categories) {
      out.sponsorblock.categories = {};
      for (const c of SB_CATEGORIES) if (typeof p.sponsorblock.categories[c] === 'boolean') out.sponsorblock.categories[c] = p.sponsorblock.categories[c];
    }
  }
  if (p.download) {
    const d = p.download;
    out.download = {};
    if (d.preset && PRESETS[d.preset]) out.download.preset = d.preset;
    if (d.musicPreset && PRESETS[d.musicPreset]) out.download.musicPreset = d.musicPreset;
    if (Number.isInteger(d.concurrency)) out.download.concurrency = Math.max(1, Math.min(5, d.concurrency));
    for (const k of ['embedThumbnail', 'embedChapters', 'subtitles', 'sponsorblockRemove', 'notify']) if (typeof d[k] === 'boolean') out.download[k] = d[k];
    if (typeof d.subLangs === 'string') out.download.subLangs = d.subLangs.replace(/[^\w,.\-]/g, '').slice(0, 60) || 'tr,en';
    if (['auto', 'always', 'never'].includes(d.cookies)) out.download.cookies = d.cookies;
  }
  if (p.tools && ['stable', 'nightly'].includes(p.tools.channel)) out.tools = { channel: p.tools.channel };
  if (p.music && typeof p.music.videoOff === 'boolean') out.music = { videoOff: p.music.videoOff };
  if (p.ui) {
    const ui = {};
    if (['dark', 'system', 'light'].includes(p.ui.theme)) ui.theme = p.ui.theme;
    if (typeof p.ui.closeToTray === 'boolean') ui.closeToTray = p.ui.closeToTray;
    if (i18n.LANGS.includes(p.ui.lang)) ui.lang = p.ui.lang;
    if (Object.keys(ui).length) out.ui = ui;
  }
  return out;
}

function broadcastWindows(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}

function notify(title, body, onClick) {
  if (!store.get().download.notify || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON, silent: false });
  if (onClick) n.on('click', onClick);
  n.show();
}

// Windows bildirimlerde uygulama adını, aynı AppUserModelID'yi taşıyan Başlat menüsü kısayolundan okur.
// Kısayol yoksa bildirimde "com.tubify.desktop" yazar; bu yüzden eksikse oluşturulur ya da düzeltilir.
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Tubify.lnk');
  const want = { target: process.execPath, appUserModelId: APP_ID, icon: process.execPath, iconIndex: 0, description: 'Tubify' };
  try {
    if (!fs.existsSync(lnk)) { shell.writeShortcutLink(lnk, 'create', want); return; }
    const cur = shell.readShortcutLink(lnk);
    if (cur.appUserModelId !== APP_ID || path.resolve(cur.target) !== path.resolve(process.execPath)) shell.writeShortcutLink(lnk, 'update', want);
  } catch (e) { log.warn('Başlat menüsü kısayolu', e.message); }
}

// ------------------------------------------------------------------ uygulama yaşam döngüsü
app.on('second-instance', (_e, argv) => {
  if (!mainShell) return;
  mainShell.focus();
  const url = nav.urlFromArgv(argv);
  if (url) mainShell.openUrl(url);
});

app.whenReady().then(async () => {
  store = new Store(SETTINGS_FILE);
  ensureStartMenuShortcut();

  // İlk açılış: dil + indirme klasörü. Eski sürümlerden gelenler sihirbazı görmez (Türkçe devam eder).
  if (legacyUser && !store.get().ui.setupDone) store.set({ ui: { setupDone: true, lang: store.get().ui.lang || 'tr' } });
  if (!store.get().ui.setupDone) {
    const r = await runSetup({ root: ROOT, icon: WIN_ICON, defaultDir: store.get().download.dir });
    if (!r) { app.quit(); return; }
    store.set({ ui: { lang: r.lang, setupDone: true }, download: { dir: r.dir } });
    // Seçilen dil, sürecin başladığı dilden (--lang ya da sistem dili) farklıysa yeniden başlat: YouTube da o dilde açılsın.
    const locale = (app.getLocale() || '').toLowerCase();
    const running = startLang || (locale.startsWith('tr') ? 'tr' : locale.startsWith('en') ? 'en' : null);
    if (running !== r.lang) { app.relaunch(); app.exit(0); return; }
  }
  i18n.setLang(store.get().ui.lang || 'tr');
  applyTheme();
  tools = new Tools(store);
  downloads = new DownloadManager(store, tools);
  const ses = session.defaultSession;
  adblock = new AdBlock(store, ses);
  registerIpc();

  // Google hesap sayfalarında tutarlı Firefox kimliği (istemci ipuçları başlıkları kaldırılır).
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*', 'https://accounts.google.com.tr/*'] }, (details, cb) => {
    const h = details.requestHeaders;
    h['User-Agent'] = nav.FIREFOX_UA;
    for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k)) delete h[k];
    cb({ requestHeaders: h });
  });

  // Bildirim, konum, kamera/mikrofon vb. hiçbir siteye verilmez; oynatma için gerekenler serbest.
  const DENIED = ['notifications', 'geolocation', 'media', 'midi', 'midiSysex', 'hid', 'serial', 'usb', 'openExternal', 'idle-detection', 'display-capture'];
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(!DENIED.includes(permission)));

  // Reklam filtreleri pencere açılmadan hazır olsun (önbellekten ~100 ms), en fazla 4 sn bekle.
  await Promise.race([adblock.init(), new Promise((r) => setTimeout(r, 4000))]);

  mainShell = new Shell({
    store, downloads, openManager, refreshFilters, setTheme, setLang: (l) => changeLanguage(l),
    root: ROOT,
    icon: WIN_ICON,
    css: fs.readFileSync(path.join(ROOT, 'inject', 'youtube.css'), 'utf8'),
  });
  library = new Library();
  player = new Player(mainShell, store);
  mainShell.player = player;
  mainShell.localLib = library;
  mainShell.create(nav.urlFromArgv(process.argv));
  tray = new AppTray({
    shell: mainShell, store, icon: ICON, trayIcon: WIN_ICON, openManager, playerCmd,
    quit: () => mainShell.quitApp(),
  });
  mainShell.tray = tray;
  library.onChange((d) => {
    mainShell.send('shell:local-lib', d);
    mainShell.sendToMusic('pt:lib-changed');
  });

  let lastTheme = store.get().ui.theme;
  store.onChange((s) => {
    mainShell.broadcastToViews('pt:settings', pageSettings());
    mainShell.send('shell:settings', { music: s.music });
    broadcastWindows('ui:settings', s);
    if (s.adblock) adblock.enable(); else adblock.disable();
    if (s.ui.theme !== lastTheme) { lastTheme = s.ui.theme; applyTheme(); }
    if (tray) tray.update();
  });

  downloads.onUpdate((item) => {
    broadcastWindows('ui:download', item);
    const summary = downloadSummary();
    mainShell.send('shell:downloads', summary);
    if (mainShell.win && !mainShell.win.isDestroyed()) mainShell.win.setProgressBar(summary.progress);
    const wc = mainShell.activeWc();
    if (item.status === 'done' && !item.notified) {
      item.notified = true;
      notify(T('İndirme tamamlandı'), item.title || item.url, () => {
        const f = item.files.find((x) => fs.existsSync(x));
        if (f) shell.showItemInFolder(f); else shell.openPath(store.get().download.dir);
      });
      if (wc) wc.send('pt:toast', T('İndirildi: {0}', item.title || 'video'));
    } else if (item.status === 'error' && !item.notified) {
      item.notified = true;
      notify(T('İndirme başarısız'), `${item.title || item.url}\n${T(item.error)}`, () => openManager('downloads'));
    }
    if (item.status === 'queued' || item.status === 'preparing') item.notified = false;
  });

  tools.onStatus((status, text) => broadcastWindows('ui:tools-status', { status, text }));
  tools.init();
});

app.on('before-quit', () => {
  if (mainShell) mainShell.quitting = true;
  if (tray) tray.destroy();
  if (library) library.flush();
  if (downloads) downloads.killAll();
});

app.on('window-all-closed', () => app.quit());

// Tanılama: beklenmedik alt süreç çökmeleri
app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') log.warn('Alt süreç kapandı', d); });
