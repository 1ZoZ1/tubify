'use strict';
// Katman 1: uBlock Origin + EasyList + EasyPrivacy filtre listeleri (Ghostery motoru).
// Listeler günde bir güncellenir; ağ yoksa önbellekteki motor kullanılır.
const fs = require('fs');
const path = require('path');
const { app, net } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const log = require('./log');

const DAY = 24 * 60 * 60 * 1000;

class AdBlock {
  constructor(store, ses) {
    this.store = store;
    this.session = ses;
    this.cache = path.join(app.getPath('userData'), 'adblock-engine.bin');
    this.blocker = null;
    this.enabled = false;
  }

  fetchImpl() {
    return (url, init) => net.fetch(url, init);
  }

  // Ghostery scriptlet'leri sayfa yüklendikten SONRA enjekte ettiği için YouTube'da işe yaramaz,
  // üstelik toString vekillerini üst üste bindirip sayfa kodunu bozabilir. YouTube reklamlarını
  // preload'daki erken katman ayıkladığından burada yalnızca ağ engelleme ve CSS gizleme kullanılır.
  static tame(blocker) {
    const orig = blocker.getCosmeticsFilters.bind(blocker);
    blocker.getCosmeticsFilters = (opts) => ({ ...orig(opts), scripts: [] });
    return blocker;
  }

  async init() {
    try {
      const cacheOk = fs.existsSync(this.cache);
      this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(this.fetchImpl(), {
        path: this.cache,
        read: fs.promises.readFile,
        write: fs.promises.writeFile,
      });
      AdBlock.tame(this.blocker);
      if (!cacheOk) this.store.set({ adblockLastUpdate: Date.now() });
      if (this.store.get().adblock) this.enable();
      log.info('Reklam engelleyici hazır');
      // Önbellek eskiyse arka planda yenile.
      if (Date.now() - (this.store.get().adblockLastUpdate || 0) > DAY) this.refresh().catch(() => {});
    } catch (e) {
      log.error('Reklam engelleyici başlatılamadı (oynatıcı katmanı yine çalışır)', e);
      fs.rmSync(this.cache, { force: true });
    }
  }

  async refresh() {
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(this.fetchImpl());
    fs.writeFileSync(this.cache, fresh.serialize());
    const wasEnabled = this.enabled;
    if (wasEnabled) this.disable();
    this.blocker = AdBlock.tame(fresh);
    if (wasEnabled) this.enable();
    this.store.set({ adblockLastUpdate: Date.now() });
    log.info('Filtre listeleri güncellendi');
  }

  enable() {
    if (!this.blocker || this.enabled) return;
    this.blocker.enableBlockingInSession(this.session);
    this.enabled = true;
  }

  disable() {
    if (!this.blocker || !this.enabled) return;
    this.blocker.disableBlockingInSession(this.session);
    this.enabled = false;
  }
}

module.exports = { AdBlock };
