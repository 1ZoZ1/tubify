'use strict';
// yt-dlp, deno (yt-dlp'nin YouTube imza çözümü için gerekli JS motoru) ve ffmpeg yönetimi.
// yt-dlp ve deno ilk açılışta indirilir, yt-dlp günde bir kez kendini günceller.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { app, net } = require('electron');
const log = require('./log');
const { t: T } = require('./i18n');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const DENO_URL = 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip';
const DAY = 24 * 60 * 60 * 1000;

class Tools {
  constructor(store) {
    this.store = store;
    this.binDir = path.join(app.getPath('userData'), 'bin');
    fs.mkdirSync(this.binDir, { recursive: true });
    this.ytdlp = path.join(this.binDir, 'yt-dlp.exe');
    this.deno = path.join(this.binDir, 'deno.exe');
    this.ffmpeg = resolveFfmpeg();
    this.status = 'idle'; // idle | installing | updating | ready | error
    this.statusText = '';
    this.listeners = new Set();
    this.busy = null; // yt-dlp exe'si değişirken indirmeler bu sözü bekler
  }

  onStatus(fn) { this.listeners.add(fn); }

  setStatus(status, text = '') {
    this.status = status;
    this.statusText = text;
    for (const fn of this.listeners) { try { fn(status, text); } catch { /* yoksay */ } }
  }

  // Açılışta çağrılır: eksik araçları kurar, gerekiyorsa yt-dlp'yi günceller.
  init() {
    this.busy = this._init().finally(() => { this.busy = null; });
    return this.busy;
  }

  async _init() {
    try {
      if (!exists(this.ytdlp)) {
        this.setStatus('installing', T('yt-dlp indiriliyor…'));
        await download(YTDLP_URL, this.ytdlp);
        this.store.set({ tools: { lastUpdateCheck: Date.now() } });
      }
      if (!exists(this.deno)) {
        this.setStatus('installing', T('Deno (JS motoru) indiriliyor…'));
        await this.installDeno();
      }
      const t = this.store.get().tools;
      if (Date.now() - (t.lastUpdateCheck || 0) > DAY) await this._update();
      this.setStatus('ready');
    } catch (e) {
      log.error('Araç kurulumu başarısız', e);
      this.setStatus('error', T('Araçlar kurulamadı: {0}', e.message));
    }
  }

  async installDeno() {
    const zip = path.join(this.binDir, 'deno.zip');
    await download(DENO_URL, zip);
    await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', this.binDir]);
    fs.rmSync(zip, { force: true });
    if (!exists(this.deno)) throw new Error('deno.exe arşivden çıkarılamadı');
  }

  // Kullanıcı ya da hata sonrası otomatik tetiklenen güncelleme.
  update() {
    if (this.busy) return this.busy.then(() => this.update());
    this.busy = (async () => {
      try {
        if (!exists(this.ytdlp)) await download(YTDLP_URL, this.ytdlp);
        await this._update();
        if (!exists(this.deno)) await this.installDeno();
        this.setStatus('ready');
      } catch (e) {
        log.error('Güncelleme başarısız', e);
        this.setStatus('error', T('Güncelleme başarısız: {0}', e.message));
        throw e;
      }
    })().finally(() => { this.busy = null; });
    return this.busy;
  }

  async _update() {
    const channel = this.store.get().tools.channel === 'nightly' ? 'nightly' : 'stable';
    this.setStatus('updating', T('yt-dlp güncelleniyor…'));
    try {
      const out = await run(this.ytdlp, ['--update-to', channel], 120000);
      log.info('yt-dlp güncelleme:', out.trim().split('\n').pop());
    } catch (e) {
      // Kendi kendini güncelleme başarısız olursa en güncel sürümü doğrudan indir.
      log.warn('yt-dlp -U başarısız, yeniden indiriliyor', e.message);
      await download(channel === 'nightly'
        ? 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe'
        : YTDLP_URL, this.ytdlp);
    }
    this.store.set({ tools: { lastUpdateCheck: Date.now() } });
  }

  async ready() {
    if (this.busy) await this.busy;
    if (!exists(this.ytdlp)) await this.init();
    if (!exists(this.ytdlp)) throw new Error(this.statusText || 'yt-dlp kurulu değil');
  }

  async versions() {
    const v = async (file, args) => {
      if (!exists(file)) return T('kurulu değil');
      try { return (await run(file, args, 20000)).trim().split(/\r?\n/)[0]; } catch { return T('çalıştırılamadı'); }
    };
    return {
      ytdlp: await v(this.ytdlp, ['--version']),
      deno: await v(this.deno, ['--version']),
      ffmpeg: (await v(this.ffmpeg, ['-version'])).replace(/ Copyright.*/, ''),
      status: this.status,
      statusText: this.statusText,
    };
  }
}

function resolveFfmpeg() {
  let p = require('ffmpeg-static');
  // Paketlenmiş uygulamada ikili dosya app.asar.unpacked altındadır.
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function exists(f) {
  try { return fs.statSync(f).size > 0; } catch { return false; }
}

async function download(url, dest) {
  log.info('İndiriliyor', url);
  const res = await net.fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100 * 1024) throw new Error('İndirilen dosya eksik görünüyor');
  const tmp = dest + '.download';
  fs.writeFileSync(tmp, buf);
  fs.rmSync(dest, { force: true });
  fs.renameSync(tmp, dest);
}

function run(file, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.message += '\n' + (stderr || ''); reject(err); } else resolve(stdout.toString());
    });
  });
}

module.exports = { Tools, run, spawn };
