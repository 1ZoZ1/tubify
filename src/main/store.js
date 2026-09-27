'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SB_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'];

function defaults() {
  return {
    window: { width: 1320, height: 840, x: undefined, y: undefined, maximized: false },
    zoom: 0,
    ui: { mode: 'video', sidebarCollapsed: false, theme: 'dark', closeToTray: true, trayHintShown: false, lang: null, setupDone: false },
    player: { shuffle: false, repeat: 'off', autoplay: true },
    music: { videoOff: false },
    adblock: true,
    sponsorblock: {
      enabled: true,
      notify: true,
      showMarkers: true,
      categories: {
        sponsor: true, selfpromo: true, interaction: true, intro: false,
        outro: false, preview: false, music_offtopic: true, filler: false,
      },
    },
    download: {
      dir: path.join(app.getPath('downloads'), 'Tubify'),
      preset: 'best-mp4',
      musicPreset: 'mp3',
      concurrency: 2,
      embedThumbnail: true,
      embedChapters: true,
      subtitles: false,
      subLangs: 'tr,en',
      sponsorblockRemove: false,
      cookies: 'auto', // auto | always | never
      notify: true,
    },
    tools: { channel: 'stable', lastUpdateCheck: 0 },
    adblockLastUpdate: 0,
  };
}

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function merge(base, over) {
  const out = { ...base };
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    if (isObj(base[k]) && isObj(over[k])) out[k] = merge(base[k], over[k]);
    else if (over[k] !== undefined) out[k] = over[k];
  }
  return out;
}

class Store {
  constructor(file) {
    this.file = file;
    this.listeners = new Set();
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* ilk çalıştırma ya da bozuk dosya */ }
    this.data = merge(defaults(), saved);
  }

  get() { return this.data; }

  set(patch) {
    this.data = merge(this.data, patch);
    this.save();
    for (const fn of this.listeners) { try { fn(this.data); } catch { /* yoksay */ } }
    return this.data;
  }

  onChange(fn) { this.listeners.add(fn); }

  save() {
    // Atomik yazım: yarım kalmış yazma ayar dosyasını bozamaz.
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) { require('./log').error('Ayarlar kaydedilemedi', e); }
  }
}

module.exports = { Store, SB_CATEGORIES };
