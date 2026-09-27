'use strict';
// Ana pencere: modern kabuk (üst çubuk + müzik yan paneli) ve iki canlı görünüm (Video / Müzik).
const fs = require('fs');
const path = require('path');
const {
  BrowserWindow, WebContentsView, Menu, clipboard, dialog, screen, app, shell: eShell,
} = require('electron');
const log = require('./log');
const { t: T, getLang } = require('./i18n');
const nav = require('./nav');
const music = require('./music');

const TOPBAR = 56;
const STRIP = 72; // liste sayfaları açıkken altta görünen YTM çalar çubuğu
const GAP = 8;
const SIDEBAR = { expanded: 300, collapsed: 84 };
const BG = '#08080b';

class Shell {
  constructor(ctx) {
    this.ctx = ctx; // { store, downloads, openManager, root, icon, css }
    this.win = null;
    this.views = {}; // video | music -> { view, media }
    this.mode = 'video';
    this.fullscreenView = null;
    this.library = { loading: false, loggedIn: null };
    this.pageOpen = false; // müzik modunda kendi sayfamız (liste, beğenilenler, sıra) açık mı
    this.player = null;    // main.js tarafından atanır
    this.localLib = null;
    this.libraryTimer = null;
    this.quitting = false;
  }

  get store() { return this.ctx.store; }

  // ---------------------------------------------------------------- oluşturma
  create(startUrl) {
    const s = this.store.get();
    const w = s.window;
    const opts = {
      width: w.width,
      height: w.height,
      minWidth: 760,
      minHeight: 480,
      title: 'Tubify',
      icon: this.ctx.icon,
      backgroundColor: BG,
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: BG, symbolColor: '#e8e8ee', height: TOPBAR },
      webPreferences: {
        preload: path.join(this.ctx.root, 'preload', 'shell.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    };
    if (w.x !== undefined && w.y !== undefined && onScreen(w)) { opts.x = w.x; opts.y = w.y; }
    this.win = new BrowserWindow(opts);
    Menu.setApplicationMenu(null);
    if (w.maximized) this.win.maximize();
    this.win.once('ready-to-show', () => this.win.show());

    const shellWc = this.win.webContents;
    shellWc.loadFile(path.join(this.ctx.root, 'shell', 'shell.html'));
    shellWc.on('will-navigate', (e) => e.preventDefault());
    shellWc.setWindowOpenHandler(() => ({ action: 'deny' }));
    shellWc.on('before-input-event', (e, input) => this.onKey(e, input));
    shellWc.on('did-finish-load', () => this.pushState());

    const startMode = startUrl ? (nav.isMusic(startUrl) ? 'music' : 'video') : (s.ui.mode === 'music' ? 'music' : 'video');
    this.mode = startMode;
    this.ensureView('video', startUrl && startMode === 'video' ? startUrl : nav.HOME);
    if (startMode === 'music') this.ensureView('music', startUrl || nav.MUSIC_HOME);
    this.applyVisibility();

    this.win.on('resize', () => { this.layout(); this.saveBounds(); });
    this.win.on('move', () => this.saveBounds());
    this.win.on('maximize', () => { this.layout(); this.saveBounds(); });
    this.win.on('unmaximize', () => { this.layout(); this.saveBounds(); });
    this.win.on('enter-full-screen', () => this.layout());
    this.win.on('leave-full-screen', () => {
      if (this.fullscreenView) this.fullscreenView = null;
      this.layout();
      this.pushState();
    });
    this.win.on('app-command', (_e, cmd) => {
      if (cmd === 'browser-backward') this.go('back');
      if (cmd === 'browser-forward') this.go('forward');
      if (cmd === 'media-play-pause') this.mediaCommand(this.playingKind() || this.mode, 'toggle');
    });
    this.win.on('close', (e) => this.onClose(e));
    this.win.on('session-end', () => { this.quitting = true; }); // Windows kapanırken tray'e gizlenip kapanmayı engellemesin
    this.layout();
    return this.win;
  }

  ensureView(kind, url) {
    if (this.views[kind]) return this.views[kind];
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(this.ctx.root, 'preload', 'youtube.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false, // arka planda / diğer moddayken oynatma kesilmesin
        spellcheck: false,
      },
    });
    view.setBackgroundColor('#0f0f0f');
    if (typeof view.setBorderRadius === 'function') view.setBorderRadius(14);
    this.win.contentView.addChildView(view);
    const entry = { view, kind, media: null, loggedIn: null };
    this.views[kind] = entry;
    this.wireView(entry);
    view.webContents.setZoomLevel(this.store.get().zoom || 0);
    view.webContents.loadURL(url || (kind === 'music' ? nav.MUSIC_HOME : nav.HOME));
    this.layout();
    return entry;
  }

  wireView(entry) {
    const wc = entry.view.webContents;
    const { kind } = entry;
    wc.setMaxListeners(50);

    wc.on('dom-ready', () => { wc.insertCSS(this.ctx.css).catch(() => {}); });
    wc.on('will-navigate', (e, url) => this.guard(e, url, kind));
    wc.on('will-redirect', (e, url) => this.guard(e, url, kind));
    wc.on('did-start-navigation', (_e, url, _inPage, isMainFrame) => {
      if (isMainFrame) wc.setUserAgent(nav.isAccountsHost(url) ? nav.FIREFOX_UA : nav.CHROME_UA);
    });
    wc.on('did-navigate', () => this.pushState());
    wc.on('did-navigate-in-page', () => this.pushState());
    wc.on('page-title-updated', () => this.updateTitle());

    wc.setWindowOpenHandler(({ url }) => {
      const ext = nav.externalTarget(url);
      if (ext) { nav.openExternal(ext); return { action: 'deny' }; }
      if (nav.isYouTube(url)) { this.openUrl(url); return { action: 'deny' }; }
      if (nav.isGoogleAuth(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, icon: this.ctx.icon, parent: this.win },
        };
      }
      nav.openExternal(url);
      return { action: 'deny' };
    });

    wc.on('render-process-gone', (_e, d) => {
      log.error(`${kind} görünümü kapandı`, d);
      if (d.reason !== 'clean-exit' && !this.quitting) setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 1000);
    });
    wc.on('unresponsive', async () => {
      log.warn(`${kind} görünümü yanıt vermiyor`);
      const { response } = await dialog.showMessageBox(this.win, {
        type: 'warning', buttons: [T('Bekle'), T('Sayfayı yeniden yükle')], defaultId: 0,
        message: T('Sayfa yanıt vermiyor.'),
      });
      if (response === 1 && !wc.isDestroyed()) wc.forcefullyCrashRenderer();
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      log.warn('Yükleme hatası', kind, code, desc, url);
      wc.loadFile(path.join(this.ctx.root, 'ui', 'offline.html'), { query: { url, desc, lang: getLang() } }).catch(() => {});
    });

    wc.on('context-menu', (_e, p) => this.contextMenu(wc, p));
    wc.on('before-input-event', (e, input) => this.onKey(e, input));

    wc.on('enter-html-full-screen', () => {
      this.fullscreenView = entry.view;
      this.win.setFullScreen(true);
      this.layout();
      this.pushState();
    });
    wc.on('leave-html-full-screen', () => {
      this.fullscreenView = null;
      if (this.win.isFullScreen()) this.win.setFullScreen(false);
      this.layout();
      this.pushState();
    });

    if (kind === 'music') {
      wc.on('did-finish-load', () => {
        if (nav.isMusic(wc.getURL())) setTimeout(() => this.refreshLibrary(), 800);
        // Yeniden yüklenen sayfa, sıra ve şerit durumunu yeniden öğrensin.
        if (this.player) this.player.emit();
        wc.send('pt:strip', this.pageOpen);
      });
      clearInterval(this.libraryTimer);
      this.libraryTimer = setInterval(() => { if (this.mode === 'music') this.refreshLibrary(true); }, 4 * 60 * 1000);
    }
  }

  // ---------------------------------------------------------------- yerleşim
  sidebarWidth() {
    return this.store.get().ui.sidebarCollapsed ? SIDEBAR.collapsed : SIDEBAR.expanded;
  }

  layout() {
    if (!this.win || this.win.isDestroyed()) return;
    const [width, height] = this.win.getContentSize();
    for (const [kind, entry] of Object.entries(this.views)) {
      const v = entry.view;
      if (this.fullscreenView === v) {
        v.setBounds({ x: 0, y: 0, width, height });
        if (v.setBorderRadius) v.setBorderRadius(0);
        continue;
      }
      if (v.setBorderRadius) v.setBorderRadius(this.win.isFullScreen() ? 0 : 14);
      const left = kind === 'music' ? this.sidebarWidth() + GAP : GAP;
      if (kind === 'music' && this.pageOpen) {
        // Kendi sayfamız açıkken YTM yalnızca alttaki çalar çubuğu kadar görünür.
        v.setBounds({ x: left, y: height - GAP - STRIP, width: Math.max(100, width - left - GAP), height: STRIP });
        continue;
      }
      v.setBounds({
        x: left,
        y: TOPBAR,
        width: Math.max(100, width - left - GAP),
        height: Math.max(100, height - TOPBAR - GAP),
      });
    }
  }

  applyVisibility() {
    for (const [kind, entry] of Object.entries(this.views)) {
      let visible = this.fullscreenView ? this.fullscreenView === entry.view : kind === this.mode;
      if (kind === 'music' && visible && this.pageOpen && !this.fullscreenView && !(entry.media && entry.media.id)) visible = false;
      entry.view.setVisible(visible);
    }
    const active = this.views[this.mode];
    if (active && this.win.isFocused()) active.view.webContents.focus();
    this.updateTitle();
  }

  setMode(mode) {
    if (!['video', 'music'].includes(mode) || !this.win) return;
    if (this.fullscreenView) return;
    this.mode = mode;
    this.ensureView(mode);
    this.applyVisibility();
    this.layout();
    this.store.set({ ui: { mode } });
    this.pushState();
    if (mode === 'music' && this.library.loggedIn === null) this.refreshLibrary();
  }

  setSidebar(collapsed) {
    this.store.set({ ui: { sidebarCollapsed: !!collapsed } });
    this.layout();
    this.pushState();
  }

  // ---------------------------------------------------------------- durum → kabuk
  activeWc() {
    const e = this.views[this.mode];
    return e ? e.view.webContents : null;
  }

  send(channel, payload) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  pushState() {
    const wc = this.activeWc();
    const m = this.views.music;
    this.send('shell:state', {
      mode: this.mode,
      canBack: !!wc && wc.navigationHistory.canGoBack(),
      canForward: !!wc && wc.navigationHistory.canGoForward(),
      musicUrl: m ? m.view.webContents.getURL() : '',
      sidebarCollapsed: !!this.store.get().ui.sidebarCollapsed,
      fullscreen: !!this.fullscreenView,
      pageOpen: this.pageOpen,
      strip: this.pageOpen && !!(m && m.media && m.media.id),
    });
  }

  setPage(open) {
    open = !!open;
    if (this.pageOpen === open) return;
    this.pageOpen = open;
    this.sendToMusic('pt:strip', open);
    this.applyVisibility();
    this.layout();
    this.pushState();
    if (!open && this.mode === 'music' && this.views.music) this.views.music.view.webContents.focus();
  }

  sendToMusic(channel, payload) {
    const m = this.views.music;
    if (m && !m.view.webContents.isDestroyed()) m.view.webContents.send(channel, payload);
  }

  musicMedia() {
    return this.views.music ? this.views.music.media : null;
  }

  updateTitle() {
    const wc = this.activeWc();
    if (!wc || !this.win) return;
    const t = (wc.getTitle() || '').replace(/ - YouTube( Music)?$/, '');
    this.win.setTitle(t && !/^(YouTube|YouTube Music)$/.test(t) ? `${t} · Tubify` : 'Tubify');
  }

  // ---------------------------------------------------------------- medya
  kindOf(wc) {
    for (const [kind, e] of Object.entries(this.views)) if (e.view.webContents === wc) return kind;
    return null;
  }

  onMedia(wc, media) {
    const kind = this.kindOf(wc);
    if (!kind) return;
    const entry = this.views[kind];
    const wasPlaying = entry.media && entry.media.playing;
    const hadMedia = !!(entry.media && entry.media.id);
    const prevId = entry.media && entry.media.id;
    entry.media = media;
    if (kind === 'music') {
      if (this.player) this.player.onMedia(media);
      if (media && media.id && media.id !== prevId && media.title && this.localLib) this.localLib.touch(media);
      // Şerit modunda çalan bir şey belirince/kaybolunca görünürlük güncellenir.
      if (this.pageOpen && hadMedia !== !!(media && media.id)) { this.applyVisibility(); this.layout(); this.pushState(); }
    }
    // Aynı anda tek ses: bir mod çalmaya başlarsa diğeri duraklatılır.
    if (media && media.playing && !wasPlaying) {
      for (const [k, e] of Object.entries(this.views)) {
        if (k !== kind && e.media && e.media.playing) this.mediaCommand(k, 'pause');
      }
    }
    this.send('shell:media', { video: this.views.video && this.views.video.media, music: this.views.music && this.views.music.media });
    if (this.tray) this.tray.update();
  }

  playingKind() {
    for (const [k, e] of Object.entries(this.views)) if (e.media && e.media.playing) return k;
    return null;
  }

  mediaCommand(kind, cmd) {
    const e = this.views[kind];
    if (e) e.view.webContents.send('pt:media-cmd', cmd);
  }

  // ---------------------------------------------------------------- müzik kitaplığı
  async refreshLibrary(silent) {
    const m = this.views.music;
    if (!m || this.library.loading) return;
    const wc = m.view.webContents;
    if (!nav.isMusic(wc.getURL())) return;
    this.library.loading = true;
    if (!silent) this.send('shell:library', { ...this.library });
    let r = await music.run(wc, 'library');
    if (!r.ok && r.error === 'not-ready') {
      await new Promise((res) => setTimeout(res, 1500));
      r = await music.run(wc, 'library');
    }
    this.library.loading = false;
    if (r.ok) {
      const wasLogged = this.library.loggedIn;
      this.library = { loading: false, loggedIn: !!r.loggedIn, account: r.account || null, playlists: r.playlists || [], albums: r.albums || [], artists: r.artists || [], updatedAt: Date.now() };
      // Müzikte giriş yapıldıysa video görünümü de oturumu görsün (çalmıyorsa yenile).
      if (wasLogged === false && r.loggedIn && this.views.video && !(this.views.video.media && this.views.video.media.playing)) {
        this.views.video.view.webContents.reload();
      }
    } else {
      this.library = { ...this.library, loading: false, error: r.error };
      log.warn('Kitaplık alınamadı', r.error);
    }
    this.send('shell:library', this.library);
  }

  async musicGo(target, opts = {}) {
    const m = this.ensureView('music');
    if (this.mode !== 'music') this.setMode('music');
    if (!opts.keepPage && this.pageOpen) { this.setPage(false); this.send('shell:close-page'); }
    if (target.kind === 'login') { m.view.webContents.loadURL(music.LOGIN_URL); return; }
    await music.navigate(m.view.webContents, target);
  }

  async createPlaylist(title) {
    const m = this.views.music;
    if (!m) return { ok: false, error: T('Müzik açık değil') };
    const r = await music.run(m.view.webContents, 'create', title);
    if (r.ok) {
      await this.refreshLibrary(true);
      this.musicGo({ kind: 'browse', browseId: 'VL' + r.playlistId });
    }
    return r;
  }

  // ---------------------------------------------------------------- gezinme
  guard(e, url, kind) {
    if (/^(about|chrome-error|devtools|file):/i.test(url)) return;
    const ext = nav.externalTarget(url);
    if (ext) { e.preventDefault(); nav.openExternal(ext); return; }
    // Video görünümünden YouTube Music'e giden bağlantılar Müzik moduna geçer (ve tersi).
    if (kind === 'video' && nav.isMusic(url)) { e.preventDefault(); this.openUrl(url); return; }
    if (kind === 'music' && nav.isYouTube(url) && !nav.isMusic(url) && !/\/signin|\/logout|ServiceLogin/.test(url) && nav.hostOf(url) !== 'accounts.youtube.com') {
      e.preventDefault(); this.openUrl(url); return;
    }
    if (nav.isYouTube(url) || nav.isGoogleAuth(url)) return;
    e.preventDefault();
    nav.openExternal(url);
  }

  openUrl(url) {
    const kind = nav.isMusic(url) ? 'music' : 'video';
    const existed = !!this.views[kind];
    const e = this.ensureView(kind, url);
    if (existed) e.view.webContents.loadURL(url);
    this.setMode(kind);
    this.focus();
  }

  go(action) {
    const wc = this.activeWc();
    if (!wc) return;
    const h = wc.navigationHistory;
    if (action === 'back' && h.canGoBack()) h.goBack();
    else if (action === 'forward' && h.canGoForward()) h.goForward();
    else if (action === 'reload') wc.reload();
    else if (action === 'hard-reload') wc.reloadIgnoringCache();
    else if (action === 'home') {
      if (this.mode === 'music') this.musicGo({ kind: 'browse', browseId: 'FEmusic_home' });
      else wc.loadURL(nav.HOME);
    }
  }

  focus() {
    if (!this.win || this.win.isDestroyed()) return;
    if (this.win.isMinimized()) this.win.restore();
    this.win.show();
    this.win.focus();
  }

  setZoom(delta, absolute) {
    const cur = this.store.get().zoom || 0;
    const level = absolute ? delta : Math.max(-3, Math.min(4, cur + delta));
    for (const e of Object.values(this.views)) e.view.webContents.setZoomLevel(level);
    this.store.set({ zoom: level });
  }

  // ---------------------------------------------------------------- indirme kısayolları
  downloadCurrent(preset) {
    const wc = this.activeWc();
    if (!wc) return;
    const url = wc.getURL();
    const id = nav.videoIdFromUrl(url);
    if (!id) { wc.send('pt:toast', T('İndirmek için önce bir video / şarkı açın.')); return; }
    const isMusic = nav.isMusic(url);
    const target = isMusic ? `https://music.youtube.com/watch?v=${id}` : `https://www.youtube.com/watch?v=${id}`;
    const cfg = this.store.get().download;
    this.ctx.downloads.add({ url: target, preset: preset || (isMusic ? cfg.musicPreset : cfg.preset) });
    wc.send('pt:toast', T('İndirme sıraya eklendi'));
  }

  openFromClipboard() {
    const text = clipboard.readText().trim();
    try {
      if (nav.isYouTube(text)) { this.openUrl(text); return; }
    } catch { /* yoksay */ }
    const wc = this.activeWc();
    if (wc) wc.send('pt:toast', T('Panoda YouTube bağlantısı yok.'));
  }

  // ---------------------------------------------------------------- klavye
  onKey(e, input) {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase();
    const c = input.control || input.meta;
    const s = input.shift;
    const a = input.alt;
    let handled = true;
    if (c && !s && k === '1') this.setMode('video');
    else if (c && !s && k === '2') this.setMode('music');
    else if (c && k === 'tab') this.setMode(this.mode === 'video' ? 'music' : 'video');
    else if (a && k === 'arrowleft') this.go('back');
    else if (a && k === 'arrowright') this.go('forward');
    else if (a && k === 'home') this.go('home');
    else if (k === 'f5' && c) this.go('hard-reload');
    else if (k === 'f5' || (c && !s && k === 'r')) this.go('reload');
    else if (k === 'f11') this.win.setFullScreen(!this.win.isFullScreen());
    else if (c && !s && k === 'j') this.ctx.openManager('downloads');
    else if (c && !s && k === ',') this.ctx.openManager('settings');
    else if (c && !s && k === 's') this.downloadCurrent();
    else if (c && s && k === 's') this.downloadCurrent('mp3');
    else if (c && s && k === 'v') this.openFromClipboard();
    else if (c && s && k === 'c') { const wc = this.activeWc(); if (wc) clipboard.writeText(wc.getURL()); }
    else if (c && !s && k === 'b' && this.mode === 'music') this.setSidebar(!this.store.get().ui.sidebarCollapsed);
    else if (c && (k === '=' || k === '+')) this.setZoom(0.5);
    else if (c && k === '-') this.setZoom(-0.5);
    else if (c && k === '0') this.setZoom(0, true);
    else if (c && s && k === 'i') { const wc = this.activeWc(); if (wc) wc.toggleDevTools(); }
    else if (c && !s && k === 'q') this.quitApp();
    else handled = false;
    if (handled) e.preventDefault();
  }

  // ---------------------------------------------------------------- menüler
  moreMenu() {
    const { store } = this;
    const onTop = this.win.isAlwaysOnTop();
    const theme = store.get().ui.theme;
    const lang = store.get().ui.lang || getLang();
    const template = [
      { label: T('İndirmeler'), accelerator: 'Ctrl+J', click: () => this.ctx.openManager('downloads') },
      { label: T('Ayarlar'), accelerator: 'Ctrl+,', click: () => this.ctx.openManager('settings') },
      { type: 'separator' },
      { label: T('Bu içeriği indir'), accelerator: 'Ctrl+S', click: () => this.downloadCurrent() },
      { label: T('MP3 olarak indir'), accelerator: 'Ctrl+Shift+S', click: () => this.downloadCurrent('mp3') },
      { label: T('İndirme klasörünü aç'), click: () => { fs.mkdirSync(store.get().download.dir, { recursive: true }); eShell.openPath(store.get().download.dir); } },
      { type: 'separator' },
      { label: T('Panodaki bağlantıyı aç'), accelerator: 'Ctrl+Shift+V', click: () => this.openFromClipboard() },
      { label: T('Sayfa adresini kopyala'), accelerator: 'Ctrl+Shift+C', click: () => { const wc = this.activeWc(); if (wc) clipboard.writeText(wc.getURL()); } },
      { label: T('Tarayıcıda aç'), click: () => { const wc = this.activeWc(); if (wc) nav.openExternal(wc.getURL()); } },
      { type: 'separator' },
      {
        label: 'Dil / Language',
        submenu: [
          { label: 'Türkçe', type: 'radio', checked: lang === 'tr', click: () => this.ctx.setLang('tr') },
          { label: 'English', type: 'radio', checked: lang === 'en', click: () => this.ctx.setLang('en') },
        ],
      },
      {
        label: T('YouTube teması'),
        submenu: [
          { label: T('Koyu'), type: 'radio', checked: theme === 'dark', click: () => this.ctx.setTheme('dark') },
          { label: T('Sistem'), type: 'radio', checked: theme === 'system', click: () => this.ctx.setTheme('system') },
          { label: T('Açık'), type: 'radio', checked: theme === 'light', click: () => this.ctx.setTheme('light') },
        ],
      },
      { label: T('Her zaman üstte'), type: 'checkbox', checked: onTop, click: () => this.win.setAlwaysOnTop(!onTop) },
      { label: T('Tam ekran'), accelerator: 'F11', click: () => this.win.setFullScreen(!this.win.isFullScreen()) },
      {
        label: T('Yakınlaştırma'),
        submenu: [
          { label: T('Yakınlaştır'), accelerator: 'Ctrl+=', click: () => this.setZoom(0.5) },
          { label: T('Uzaklaştır'), accelerator: 'Ctrl+-', click: () => this.setZoom(-0.5) },
          { label: T('Gerçek boyut'), accelerator: 'Ctrl+0', click: () => this.setZoom(0, true) },
        ],
      },
      { type: 'separator' },
      {
        label: T('Yardım'),
        submenu: [
          { label: T('Reklam filtrelerini şimdi güncelle'), click: () => this.ctx.refreshFilters() },
          { label: T('Önbelleği atlayarak yenile'), accelerator: 'Ctrl+F5', click: () => this.go('hard-reload') },
          { label: T('Geliştirici araçları'), accelerator: 'Ctrl+Shift+I', click: () => { const wc = this.activeWc(); if (wc) wc.toggleDevTools(); } },
          { type: 'separator' },
          { label: T('Günlük dosyalarını aç'), click: () => eShell.openPath(log.dir()) },
          { label: T('Veri klasörünü aç'), click: () => eShell.openPath(app.getPath('userData')) },
          { type: 'separator' },
          { label: T('Klavye kısayolları'), click: () => this.showShortcuts() },
          { label: T('Hakkında'), click: () => this.about() },
        ],
      },
      { type: 'separator' },
      { label: T('Tamamen çık'), accelerator: 'Ctrl+Q', click: () => this.quitApp() },
    ];
    Menu.buildFromTemplate(template).popup({ window: this.win });
  }

  showShortcuts() {
    dialog.showMessageBox(this.win, {
      type: 'info', title: T('Klavye kısayolları'), message: T('Klavye kısayolları'),
      detail: [
        ['Ctrl+1 / Ctrl+2 / Ctrl+Tab', T('Video / Müzik / Mod değiştir')],
        ['Alt+← / Alt+→', T('Geri / İleri')],
        ['F5 · Ctrl+F5', T('Yenile · Önbelleksiz yenile')],
        ['Ctrl+S · Ctrl+Shift+S', T('İndir · MP3 indir')],
        ['Ctrl+J · Ctrl+,', T('İndirmeler · Ayarlar')],
        ['Ctrl+B', T('Müzik yan panelini daralt/genişlet')],
        ['Ctrl+Shift+V', T('Panodaki bağlantıyı aç')],
        ['F11', T('Tam ekran')],
        ['Ctrl+= / Ctrl+- / Ctrl+0', T('Yakınlaştırma')],
      ].map(([k, v]) => `${k}\t${T(v)}`).join('\n'),
    });
  }

  about() {
    dialog.showMessageBox(this.win, {
      type: 'info', title: 'Tubify', icon: this.ctx.icon,
      message: `Tubify ${app.getVersion()}`,
      detail: T('Reklamsız, SponsorBlock destekli, indirme yöneticili masaüstü YouTube ve YouTube Music istemcisi.') + '\n\n' +
        `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}\n` +
        [T('Reklam filtreleri: uBlock Origin, EasyList, EasyPrivacy'), T('Segment verisi: SponsorBlock'), T('İndirme motoru: yt-dlp + FFmpeg')].join('\n'),
    });
  }

  contextMenu(wc, p) {
    const items = [];
    const link = p.linkURL;
    const downloads = this.ctx.downloads;
    const cfg = this.store.get().download;
    if (link) {
      const target = nav.externalTarget(link) || link;
      if (nav.isYouTube(target) && /\/watch\?|\/shorts\/|youtu\.be\/|\/playlist\?/.test(target)) {
        const isList = /\/playlist\?/.test(target);
        const isMusic = nav.isMusic(target);
        const add = (preset) => { downloads.add({ url: target, preset, playlist: isList }); wc.send('pt:toast', T('İndirme sıraya eklendi')); };
        items.push(
          { label: isList ? T('Oynatma listesini indir') : (isMusic ? T('Şarkıyı indir') : T('Bu videoyu indir')), click: () => add(isMusic ? cfg.musicPreset : cfg.preset) },
          { label: isList ? T('Oynatma listesini MP3 indir') : T('MP3 olarak indir'), click: () => add('mp3') },
          { label: T('Diğer seçeneklerle indir…'), click: () => this.ctx.openManager('downloads', target) },
          { type: 'separator' },
        );
        if (nav.isMusic(target) !== (this.kindOf(wc) === 'music')) {
          items.push({ label: isMusic ? T('Müzik modunda aç') : T('Video modunda aç'), click: () => this.openUrl(target) }, { type: 'separator' });
        }
      }
      items.push(
        { label: T('Bağlantıyı kopyala'), click: () => clipboard.writeText(target) },
        { label: T('Bağlantıyı tarayıcıda aç'), click: () => nav.openExternal(target) },
        { type: 'separator' },
      );
    }
    if (p.isEditable) {
      items.push(
        { label: T('Kes'), role: 'cut', enabled: p.editFlags.canCut },
        { label: T('Kopyala'), role: 'copy', enabled: p.editFlags.canCopy },
        { label: T('Yapıştır'), role: 'paste', enabled: p.editFlags.canPaste },
        { label: T('Tümünü seç'), role: 'selectAll' },
        { type: 'separator' },
      );
    } else if (p.selectionText) {
      items.push({ label: T('Kopyala'), role: 'copy' }, { type: 'separator' });
    }
    items.push(
      { label: T('Geri'), enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: T('İleri'), enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: T('Yenile'), click: () => wc.reload() },
    );
    Menu.buildFromTemplate(items).popup({ window: this.win });
  }

  // ---------------------------------------------------------------- pencere durumu
  saveBounds() {
    clearTimeout(this.boundsTimer);
    this.boundsTimer = setTimeout(() => {
      const w = this.win;
      if (!w || w.isDestroyed() || w.isMinimized() || w.isFullScreen()) return;
      const maximized = w.isMaximized();
      const b = maximized ? this.store.get().window : w.getBounds();
      this.store.set({ window: { width: b.width, height: b.height, x: b.x, y: b.y, maximized } });
    }, 600);
  }

  onClose(e) {
    if (this.quitting) return;
    // Kapat düğmesi: bildirim alanına küçült (müzik ve indirmeler sürer). Tamamen çıkış tray menüsünden ya da Ctrl+Q ile.
    if (this.tray && this.store.get().ui.closeToTray) {
      e.preventDefault();
      if (this.win.isFullScreen()) this.win.setFullScreen(false);
      this.win.hide();
      this.tray.hintOnce();
      return;
    }
    e.preventDefault();
    this.quitApp();
  }

  // opts.relaunch: çıkıştan sonra yeniden başlat (ör. dil değişikliği). İndirme onayında vazgeçilirse yeniden başlatma da iptal olur.
  quitApp(opts = {}) {
    if (this.quitting) return;
    const pending = this.ctx.downloads.pendingCount();
    if (pending > 0) {
      if (!this.win.isVisible()) this.focus();
      const r = dialog.showMessageBoxSync(this.win, {
        type: 'question', buttons: [T('İndirmeler bitsin, bekle'), T('Yine de çık')], defaultId: 0, cancelId: 0,
        message: T('{0} indirme devam ediyor.', pending),
        detail: T('Çıkarsanız yarım kalan indirmeler daha sonra "Tekrar dene" ile kaldığı yerden sürdürülebilir.'),
      });
      if (r === 0) return;
    }
    this.quitting = true;
    clearInterval(this.libraryTimer);
    if (opts.relaunch) app.relaunch();
    app.quit();
  }

  broadcastToViews(channel, payload) {
    for (const e of Object.values(this.views)) {
      if (!e.view.webContents.isDestroyed()) e.view.webContents.send(channel, payload);
    }
  }
}

function onScreen(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y >= a.y - 10 && b.y < a.y + a.height - 50;
  });
}

module.exports = { Shell };
