'use strict';
// Bildirim alanı simgesi: pencere kapatılınca uygulama burada çalışmaya devam eder.
const { Tray, Menu, nativeImage } = require('electron');
const { t: T } = require('./i18n');

class AppTray {
  constructor(ctx) {
    this.ctx = ctx; // { shell, store, icon, trayIcon, openManager, playerCmd, quit }
    this.tray = new Tray(ctx.trayIcon); // Windows .ico: her DPI için keskin boyut seçilir
    this.tray.on('click', () => this.toggleWindow());
    this.tray.on('double-click', () => this.ctx.shell.focus());
    this.update();
  }

  get shell() { return this.ctx.shell; }

  toggleWindow() {
    const w = this.shell.win;
    if (!w || w.isDestroyed()) return;
    if (w.isVisible() && !w.isMinimized() && w.isFocused()) w.hide();
    else this.shell.focus();
  }

  nowPlaying() {
    const kind = this.shell.playingKind();
    const media = kind ? this.shell.views[kind].media : (this.shell.musicMedia() || (this.shell.views.video && this.shell.views.video.media));
    return media && media.id ? { kind: kind || (this.shell.musicMedia() === media ? 'music' : 'video'), media } : null;
  }

  media(cmd) {
    const np = this.nowPlaying();
    const kind = np ? np.kind : this.shell.mode;
    const q = this.shell.player;
    if (kind === 'music' && (cmd === 'next' || cmd === 'prev') && q && q.active) this.ctx.playerCmd(cmd);
    else if (kind === 'music' && cmd === 'toggle') this.ctx.playerCmd('toggle');
    else this.shell.mediaCommand(kind, cmd);
  }

  update() {
    if (!this.tray || this.tray.isDestroyed()) return;
    const np = this.nowPlaying();
    const title = np ? `${np.media.title}${np.media.artist ? ' · ' + np.media.artist : ''}` : '';
    const tip = title ? `Tubify\n${np.media.playing ? '▶' : '❚❚'} ${title}` : 'Tubify';
    this.tray.setToolTip(tip.length > 127 ? tip.slice(0, 126) + '…' : tip);

    const key = JSON.stringify([title, np && np.media.playing, this.ctx.store.get().ui.closeToTray]);
    if (key === this.menuKey) return;
    this.menuKey = key;
    const short = title.length > 48 ? title.slice(0, 47) + '…' : title;
    const template = [
      { label: T('Tubify\'ı göster'), click: () => this.shell.focus() },
      { type: 'separator' },
    ];
    if (np) template.push({ label: short, enabled: false });
    template.push(
      { label: np && np.media.playing ? T('Duraklat') : T('Oynat'), enabled: !!np, click: () => this.media('toggle') },
      { label: T('Sonraki'), enabled: !!np, click: () => this.media('next') },
      { label: T('Önceki'), enabled: !!np, click: () => this.media('prev') },
      { type: 'separator' },
      { label: T('İndirmeler'), click: () => this.ctx.openManager('downloads') },
      { label: T('Ayarlar'), click: () => this.ctx.openManager('settings') },
      {
        label: T('Kapatınca bildirim alanına küçült'), type: 'checkbox', checked: this.ctx.store.get().ui.closeToTray,
        click: (item) => this.ctx.store.set({ ui: { closeToTray: item.checked } }),
      },
      { type: 'separator' },
      { label: T('Tubify\'dan tamamen çık'), click: () => this.ctx.quit() },
    );
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  // Pencere ilk kez bildirim alanına gizlendiğinde kullanıcıya bir kez haber verilir.
  hintOnce() {
    const ui = this.ctx.store.get().ui;
    if (ui.trayHintShown) return;
    this.ctx.store.set({ ui: { trayHintShown: true } });
    this.tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(this.ctx.icon),
      title: T('Tubify arka planda çalışıyor'),
      content: T('Müzik ve indirmeler devam ediyor. Açmak için simgeye tıklayın, tamamen çıkmak için sağ tıklayıp "Tamamen çık"ı seçin.'),
    });
  }

  destroy() {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
  }
}

module.exports = { AppTray };
