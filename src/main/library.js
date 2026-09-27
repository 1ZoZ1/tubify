'use strict';
// Yerel müzik kitaplığı: hesap gerektirmeyen beğeniler, çalma listeleri, dinleme geçmişi.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, net } = require('electron');
const log = require('./log');
const { t: T } = require('./i18n');

const MAX_TRACKS = 5000;
const HISTORY = 200;

function cleanTrack(t) {
  if (!t || !/^[\w-]{11}$/.test(String(t.id || ''))) return null;
  return {
    id: String(t.id),
    title: String(t.title || '').slice(0, 300) || T('Bilinmeyen şarkı'),
    artist: String(t.artist || '').slice(0, 200),
    art: /^https:\/\//.test(t.art || '') ? String(t.art).slice(0, 1000) : `https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`,
    duration: Number.isFinite(+t.duration) ? Math.max(0, Math.round(+t.duration)) : 0,
  };
}

class Library {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'library.json');
    this.listeners = new Set();
    this.data = { liked: [], playlists: [], history: [] };
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        liked: Array.isArray(d.liked) ? d.liked.map(cleanTrack).filter(Boolean) : [],
        playlists: Array.isArray(d.playlists) ? d.playlists.filter((p) => p && p.id).map((p) => ({
          id: String(p.id), name: String(p.name || T('Liste')), createdAt: p.createdAt || Date.now(),
          sourceId: p.sourceId ? String(p.sourceId) : undefined,
          tracks: (p.tracks || []).map(cleanTrack).filter(Boolean),
        })) : [],
        history: Array.isArray(d.history) ? d.history.map(cleanTrack).filter(Boolean) : [],
      };
    } catch { /* ilk çalıştırma */ }
  }

  onChange(fn) { this.listeners.add(fn); }

  changed() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
    for (const fn of this.listeners) { try { fn(this.data); } catch { /* yoksay */ } }
  }

  flush() {
    clearTimeout(this.timer);
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { log.error('Kitaplık kaydedilemedi', e); }
  }

  get() { return this.data; }

  playlist(id) { return this.data.playlists.find((p) => p.id === id); }

  // Liste kimliği "liked" ise beğenilenler döner.
  tracksOf(listId) {
    if (listId === 'liked') return this.data.liked;
    const p = this.playlist(listId);
    return p ? p.tracks : null;
  }

  isLiked(id) { return this.data.liked.some((t) => t.id === id); }

  setLiked(track, liked) {
    const t = cleanTrack(track);
    if (!t) return false;
    this.data.liked = this.data.liked.filter((x) => x.id !== t.id);
    if (liked) this.data.liked.unshift(t);
    this.data.liked = this.data.liked.slice(0, MAX_TRACKS);
    this.changed();
    return liked;
  }

  createPlaylist(name, tracks = [], sourceId) {
    const p = {
      id: crypto.randomUUID(),
      sourceId: sourceId ? String(sourceId) : undefined,
      name: String(name || '').trim().slice(0, 100) || T('Çalma listem #{0}', this.data.playlists.length + 1),
      createdAt: Date.now(),
      tracks: tracks.map(cleanTrack).filter(Boolean),
    };
    this.data.playlists.unshift(p);
    this.changed();
    return p;
  }

  bySource(sourceId) { return this.data.playlists.find((p) => p.sourceId && p.sourceId === sourceId); }

  // Kaydedilmiş YouTube listesini güncel haliyle eşitler (yerel adı korunur).
  syncPlaylist(id, tracks) {
    const p = this.playlist(id);
    if (!p) return 0;
    p.tracks = tracks.map(cleanTrack).filter(Boolean).slice(0, MAX_TRACKS);
    this.changed();
    return p.tracks.length;
  }

  renamePlaylist(id, name) {
    const p = this.playlist(id);
    if (!p) return;
    p.name = String(name || '').trim().slice(0, 100) || p.name;
    this.changed();
  }

  deletePlaylist(id) {
    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    this.changed();
  }

  // Aynı şarkı bir listeye iki kez eklenmez; eklenen sayıyı döner.
  addTracks(listId, tracks) {
    const list = this.tracksOf(listId);
    if (!list) return 0;
    const have = new Set(list.map((t) => t.id));
    let added = 0;
    for (const raw of tracks) {
      const t = cleanTrack(raw);
      if (!t || have.has(t.id)) continue;
      if (listId === 'liked') list.unshift(t); else list.push(t);
      have.add(t.id);
      added++;
    }
    if (list.length > MAX_TRACKS) list.length = MAX_TRACKS;
    if (added) this.changed();
    return added;
  }

  removeTrack(listId, trackId) {
    if (listId === 'liked') { this.data.liked = this.data.liked.filter((t) => t.id !== trackId); this.changed(); return; }
    const p = this.playlist(listId);
    if (!p) return;
    p.tracks = p.tracks.filter((t) => t.id !== trackId);
    this.changed();
  }

  moveTrack(listId, from, to) {
    const list = this.tracksOf(listId);
    if (!list || from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
    const [t] = list.splice(from, 1);
    list.splice(to, 0, t);
    this.changed();
  }

  // Çalınan şarkı bilgisi, listedeki kayıtları da günceller (başlık/kapak sonradan netleşebilir).
  touch(track) {
    const t = cleanTrack(track);
    if (!t) return;
    this.data.history = [t, ...this.data.history.filter((x) => x.id !== t.id)].slice(0, HISTORY);
    let dirty = false;
    for (const list of [this.data.liked, ...this.data.playlists.map((p) => p.tracks)]) {
      for (const x of list) {
        if (x.id === t.id && t.title && (x.title !== t.title || (!x.duration && t.duration))) {
          x.title = t.title;
          if (t.artist) x.artist = t.artist;
          if (t.duration) x.duration = t.duration;
          dirty = true;
        }
      }
    }
    if (dirty) this.changed(); else { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 2000); }
  }
}

// Yalnızca kimliği bilinen şarkılar için başlık / sanatçı (sağ tık menüsünden eklemelerde).
async function lookupTrack(id, fallbackTitle) {
  const base = { id, title: fallbackTitle || '', artist: '', art: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, duration: 0 };
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
    const res = await net.fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return base;
    const d = await res.json();
    return { ...base, title: d.title || base.title, artist: (d.author_name || '').replace(/ - Topic$/, '') };
  } catch { return base; }
}

module.exports = { Library, cleanTrack, lookupTrack };
