'use strict';
// Tubify çalma sırası: yerel listeleri YouTube Music oynatıcısında sırayla çalar.
// YTM'nin kendi sırası yerine bizimki geçerlidir; karıştırma, döngü ve otomatik oynatma burada yönetilir.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { cleanTrack } = require('./library');

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Player {
  constructor(shell, store) {
    this.shell = shell;
    this.store = store;
    this.file = path.join(app.getPath('userData'), 'queue.json');
    this.queue = [];       // çalma sırasındaki şarkılar
    this.original = null;  // karıştırma kapatılınca dönülecek sıra
    this.index = -1;
    this.active = false;   // true: YTM bizim sıramızı çalıyor
    this.expectId = null;
    this.loadedAt = 0;
    this.source = null;    // { listId, name }
    const saved = this.readSaved();
    const p = store.get().player || {};
    this.shuffle = !!p.shuffle;
    this.repeat = ['off', 'all', 'one'].includes(p.repeat) ? p.repeat : 'off';
    this.autoplay = p.autoplay !== false;
    if (saved) {
      this.queue = saved.queue;
      this.index = saved.index;
      this.source = saved.source;
    }
  }

  readSaved() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const queue = (d.queue || []).map(cleanTrack).filter(Boolean);
      return { queue, index: Math.min(Math.max(-1, d.index | 0), queue.length - 1), source: d.source || null };
    } catch { return null; }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(this.file, JSON.stringify({ queue: this.queue.slice(0, 2000), index: this.index, source: this.source }));
      } catch { /* yoksay */ }
    }, 400);
  }

  current() { return this.queue[this.index] || null; }

  snapshot() {
    return {
      queue: this.queue,
      index: this.index,
      active: this.active,
      shuffle: this.shuffle,
      repeat: this.repeat,
      autoplay: this.autoplay,
      source: this.source,
    };
  }

  emit() {
    this.save();
    this.shell.send('shell:queue', this.snapshot());
    this.shell.sendToMusic('pt:queue-mode', {
      active: this.active,
      trackId: this.active && this.current() ? this.current().id : null,
      shuffle: this.shuffle,
      repeat: this.repeat,
    });
  }

  // ------------------------------------------------------------ çalma
  playTracks(tracks, startIndex = 0, { shuffle, source } = {}) {
    const list = tracks.map(cleanTrack).filter(Boolean);
    if (!list.length) return;
    if (typeof shuffle === 'boolean') this.shuffle = shuffle;
    this.source = source || null;
    startIndex = Math.max(0, Math.min(list.length - 1, startIndex | 0));
    if (this.shuffle) {
      const first = list[startIndex];
      const rest = list.filter((_, i) => i !== startIndex);
      this.original = list.slice();
      this.queue = [first, ...shuffleArr(rest)];
      this.index = 0;
    } else {
      this.original = null;
      this.queue = list;
      this.index = startIndex;
    }
    this.persistModes();
    this.load();
  }

  playAt(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.index = i;
    this.load();
  }

  load() {
    const t = this.current();
    if (!t) return;
    this.active = true;
    this.expectId = t.id;
    this.loadedAt = Date.now();
    this.shell.musicGo({ kind: 'track', videoId: t.id }, { keepPage: true });
    this.emit();
  }

  next(auto) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 'one') { this.shell.sendToMusic('pt:media-cmd', 'restart'); return; }
    if (this.index < this.queue.length - 1) { this.index++; this.load(); return; }
    // Sıranın sonu
    if (this.repeat === 'all' || (!auto && this.repeat !== 'off')) {
      if (this.shuffle) {
        const cur = this.current();
        this.queue = shuffleArr(this.queue.slice());
        if (this.queue.length > 1 && cur && this.queue[0].id === cur.id) this.queue.push(this.queue.shift());
      }
      this.index = 0;
      this.load();
      return;
    }
    if (auto && this.autoplay) {
      // Otomatik oynatma: son şarkının radyosuyla devam et (YTM önerileri).
      const last = this.current();
      this.active = false;
      this.emit();
      if (last) this.shell.musicGo({ kind: 'radio', videoId: last.id }, { keepPage: true });
      return;
    }
    if (!auto) { this.index = 0; this.load(); return; }
    this.active = false;
    this.emit();
  }

  prev() {
    if (!this.queue.length) return;
    const m = this.shell.musicMedia();
    // Spotify davranışı: 3 sn'den fazla çaldıysa başa sar.
    if (m && m.current > 3) { this.shell.sendToMusic('pt:media-cmd', 'restart'); return; }
    if (this.index > 0) { this.index--; this.load(); } else this.shell.sendToMusic('pt:media-cmd', 'restart');
  }

  // Sıraya ekle (sona) / Sonra çal (sıradaki). Sıra etkin değilse çalan şarkıdan başlatılır.
  enqueue(tracks, playNext) {
    const list = tracks.map(cleanTrack).filter(Boolean);
    if (!list.length) return 0;
    if (!this.active) {
      const m = this.shell.musicMedia();
      if (m && m.id) {
        this.queue = [cleanTrack(m)];
        this.index = 0;
        this.active = true;
        this.expectId = m.id;
        this.loadedAt = 0;
        this.source = null;
        this.original = null;
      } else {
        // Hiçbir şey çalmıyorsa doğrudan çalmaya başla.
        this.playTracks(list, 0);
        return list.length;
      }
    }
    if (playNext) this.queue.splice(this.index + 1, 0, ...list);
    else this.queue.push(...list);
    if (this.original) this.original.push(...list);
    this.emit();
    return list.length;
  }

  removeAt(i) {
    if (i < 0 || i >= this.queue.length || i === this.index) return;
    this.queue.splice(i, 1);
    if (i < this.index) this.index--;
    this.emit();
  }

  move(from, to) {
    const q = this.queue;
    if (from === to || from < 0 || to < 0 || from >= q.length || to >= q.length) return;
    const cur = q[this.index];
    const [t] = q.splice(from, 1);
    q.splice(to, 0, t);
    this.index = q.indexOf(cur);
    this.emit();
  }

  clearUpcoming() {
    this.queue = this.queue.slice(0, this.index + 1);
    this.emit();
  }

  setShuffle(on) {
    this.shuffle = !!on;
    const cur = this.current();
    if (this.queue.length > 1 && cur) {
      if (this.shuffle) {
        this.original = this.queue.slice();
        const upcoming = shuffleArr(this.queue.slice(this.index + 1));
        this.queue = [...this.queue.slice(0, this.index + 1), ...upcoming];
      } else if (this.original) {
        this.queue = this.original;
        this.index = Math.max(0, this.queue.findIndex((t) => t.id === cur.id));
        this.original = null;
      }
    }
    this.persistModes();
    this.emit();
  }

  setRepeat(mode) {
    this.repeat = ['off', 'all', 'one'].includes(mode) ? mode : 'off';
    this.persistModes();
    this.emit();
  }

  cycleRepeat() {
    this.setRepeat(this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off');
  }

  setAutoplay(on) {
    this.autoplay = !!on;
    this.persistModes();
    this.emit();
  }

  persistModes() {
    this.store.set({ player: { shuffle: this.shuffle, repeat: this.repeat, autoplay: this.autoplay } });
  }

  // ------------------------------------------------------------ YTM'den gelen olaylar
  onMedia(media) {
    if (!media || !this.active) return;
    if (media.id === this.expectId) {
      this.loadedAt = 0; // yüklendi, doğrulandı
      const cur = this.current();
      // Başlık/sanatçı/kapak çalınca netleşir.
      if (cur && media.title && (cur.title !== media.title || !cur.duration)) {
        Object.assign(cur, cleanTrack({ ...cur, title: media.title, artist: media.artist || cur.artist, art: cur.art, duration: media.duration || cur.duration }));
        this.emit();
      }
      return;
    }
    // Kullanıcı YTM'de başka bir şey başlattı: bizim sıra beklemeye alınır.
    const settling = this.loadedAt && Date.now() - this.loadedAt < 10000;
    if (!settling && media.playing) {
      this.active = false;
      this.emit();
    }
  }

  onTrackEnded(id) {
    if (!this.active || id !== this.expectId) return;
    this.next(true);
  }

  resume() {
    if (this.current()) this.load();
  }
}

module.exports = { Player };
