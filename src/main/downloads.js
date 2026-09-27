'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { app, session } = require('electron');
const log = require('./log');

const PRESETS = {
  'best-mp4': { label: 'En iyi kalite (MP4)', kind: 'video', height: 0, container: 'mp4' },
  '2160-mp4': { label: '4K / 2160p (MP4)', kind: 'video', height: 2160, container: 'mp4' },
  '1440-mp4': { label: '1440p (MP4)', kind: 'video', height: 1440, container: 'mp4' },
  '1080-mp4': { label: '1080p (MP4)', kind: 'video', height: 1080, container: 'mp4' },
  '720-mp4': { label: '720p (MP4)', kind: 'video', height: 720, container: 'mp4' },
  '480-mp4': { label: '480p (MP4)', kind: 'video', height: 480, container: 'mp4' },
  '360-mp4': { label: '360p (MP4)', kind: 'video', height: 360, container: 'mp4' },
  'best-mkv': { label: 'En yüksek kalite (MKV, AV1/VP9)', kind: 'video', height: 0, container: 'mkv' },
  'mp3': { label: 'Sadece ses (MP3)', kind: 'audio', format: 'mp3' },
  'm4a': { label: 'Sadece ses (M4A)', kind: 'audio', format: 'm4a' },
  'opus': { label: 'Sadece ses (Opus, orijinal)', kind: 'audio', format: 'opus' },
};

// Bu hatalar çoğunlukla YouTube değişikliğinden kaynaklanır: yt-dlp'yi güncelleyip tekrar denenir.
const UPDATE_ERRORS = /unable to extract|nsig|signature|n challenge|js ?runtime|player|HTTP Error 403|Requested format is not available|unsupported url|some formats may be missing|PO ?Token/i;
// Bu hatalar oturum çerezi ile çözülür.
const COOKIE_ERRORS = /sign in|age|members|private video|login|cookies|confirm you|inappropriate/i;

class DownloadManager {
  constructor(store, tools) {
    this.store = store;
    this.tools = tools;
    this.file = path.join(app.getPath('userData'), 'downloads.json');
    this.items = [];
    this.procs = new Map();
    this.listeners = new Set();
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      this.items = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const it of this.items) {
        if (['queued', 'preparing', 'downloading', 'processing'].includes(it.status)) {
          it.status = 'error';
          it.error = 'Uygulama kapatıldığı için yarım kaldı. "Tekrar dene" kaldığı yerden sürdürür.';
        }
      }
    } catch { this.items = []; }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.items.slice(0, 500)));
        fs.renameSync(tmp, this.file);
      } catch (e) { log.error('İndirme listesi kaydedilemedi', e); }
    }, 500);
  }

  onUpdate(fn) { this.listeners.add(fn); }

  emit(item) {
    this.save();
    for (const fn of this.listeners) { try { fn(item); } catch { /* yoksay */ } }
  }

  list() { return this.items; }

  activeCount() {
    return this.items.filter((i) => ['preparing', 'downloading', 'processing'].includes(i.status)).length;
  }

  pendingCount() {
    return this.items.filter((i) => ['queued', 'preparing', 'downloading', 'processing'].includes(i.status)).length;
  }

  add({ url, preset, playlist = false, folder = null, index = null, title = '' }) {
    url = normalizeUrl(url);
    if (!url) throw new Error('Geçerli bir YouTube bağlantısı değil');
    if (!PRESETS[preset]) preset = this.store.get().download.preset;
    const item = {
      id: crypto.randomUUID(),
      url,
      videoId: videoIdOf(url),
      preset,
      presetLabel: PRESETS[preset].label,
      playlist: !!playlist,
      folder: folder ? safeName(folder) : null,
      index: Number.isInteger(index) ? index : null,
      status: 'queued',
      title: String(title || ''),
      progress: 0,
      speed: '',
      eta: '',
      part: 0,
      plIndex: null,
      plCount: null,
      files: [],
      error: '',
      createdAt: Date.now(),
      attempts: { update: false, cookies: false },
    };
    this.items.unshift(item);
    this.emit(item);
    this.pump();
    return item;
  }

  pump() {
    const max = Math.max(1, Math.min(5, Number(this.store.get().download.concurrency) || 2));
    while (this.activeCount() < max) {
      const next = [...this.items].reverse().find((i) => i.status === 'queued');
      if (!next) break;
      this.start(next);
    }
  }

  async start(item, opts = {}) {
    item.status = 'preparing';
    item.error = '';
    item.progress = 0;
    this.emit(item);
    try {
      await this.tools.ready();
    } catch (e) {
      return this.fail(item, e.message);
    }
    if (item.status !== 'preparing') return; // bu arada iptal edildi

    const cfg = this.store.get().download;
    const useCookies = opts.cookies || cfg.cookies === 'always';
    let cookieFile = null;
    if (useCookies) cookieFile = await exportCookies();

    const sbCats = Object.entries(this.store.get().sponsorblock.categories).filter(([, v]) => v).map(([k]) => k);
    const args = buildArgs(item, cfg, this.tools, cookieFile, sbCats);
    try { fs.mkdirSync(cfg.dir, { recursive: true }); } catch (e) { return this.fail(item, 'İndirme klasörü oluşturulamadı: ' + e.message); }

    log.info('yt-dlp başlıyor', item.url, item.preset);
    const proc = spawn(this.tools.ytdlp, args, {
      windowsHide: true,
      cwd: cfg.dir,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    this.procs.set(item.id, proc);
    const errLines = [];
    let lastEmit = 0;

    const onLine = (line) => {
      line = line.trim();
      if (!line) return;
      if (line.startsWith('PT|')) {
        const [, status, done, total, estimate, speed, eta] = line.split('|');
        const tot = num(total) || num(estimate);
        if (status === 'downloading') {
          if (item.status !== 'downloading') { item.status = 'downloading'; item.part = (item.part || 0) + 1; }
          item.progress = tot ? Math.min(1, num(done) / tot) : item.progress;
          item.speed = num(speed) ? fmtBytes(num(speed)) + '/sn' : '';
          item.eta = num(eta) ? fmtTime(num(eta)) : '';
          item.size = tot ? fmtBytes(tot) : item.size;
        } else if (status === 'finished') {
          item.progress = 1;
          item.status = 'preparing'; // sıradaki parça (ses) ya da birleştirme
        }
        const now = Date.now();
        if (now - lastEmit > 250 || status === 'finished') { lastEmit = now; this.emit(item); }
      } else if (line.startsWith('TI|')) {
        const [, title, idx, count] = line.split('|');
        item.title = title;
        item.plIndex = num(idx) || null;
        item.plCount = num(count) || null;
        item.part = 0;
        this.emit(item);
      } else if (line.startsWith('PP|')) {
        item.status = 'processing';
        item.speed = '';
        item.eta = '';
        this.emit(item);
      } else if (line.startsWith('FP|')) {
        const f = line.slice(3);
        if (f && !item.files.includes(f)) item.files.push(f);
        this.emit(item);
      }
    };

    splitLines(proc.stdout, onLine);
    splitLines(proc.stderr, (l) => {
      if (!l.trim()) return;
      errLines.push(l.trim());
      if (errLines.length > 40) errLines.shift();
    });

    proc.on('error', (e) => { errLines.push(e.message); });
    proc.on('close', async (code) => {
      this.procs.delete(item.id);
      if (cookieFile) fs.rm(cookieFile, { force: true }, () => {});
      if (item.status === 'canceled') { this.pump(); return; }

      if (code === 0) {
        item.status = 'done';
        item.progress = 1;
        item.speed = '';
        item.eta = '';
        item.finishedAt = Date.now();
        log.info('İndirme tamamlandı', item.title);
        this.emit(item);
        this.pump();
        return;
      }

      const errText = errLines.filter((l) => /ERROR/i.test(l)).join('\n') || errLines.slice(-5).join('\n') || `yt-dlp çıkış kodu ${code}`;
      log.warn('İndirme hatası', item.url, errText);

      // Otomatik kurtarma 1: oturum çerezleriyle tekrar dene (yaş sınırı, üyelik, bot doğrulaması).
      if (!item.attempts.cookies && cfg.cookies !== 'never' && !useCookies && COOKIE_ERRORS.test(errText) && await hasLogin()) {
        item.attempts.cookies = true;
        log.info('Oturum çerezleriyle yeniden deneniyor');
        return this.start(item, { cookies: true });
      }
      // Otomatik kurtarma 2: yt-dlp'yi güncelle ve tekrar dene.
      if (!item.attempts.update && UPDATE_ERRORS.test(errText)) {
        item.attempts.update = true;
        item.status = 'preparing';
        item.error = '';
        this.emit(item);
        try { await this.tools.update(); } catch { /* güncelleme olmasa da tekrar dene */ }
        return this.start(item, { cookies: useCookies });
      }
      this.fail(item, friendlyError(errText));
    });
  }

  fail(item, message) {
    item.status = 'error';
    item.error = message;
    item.speed = '';
    item.eta = '';
    this.emit(item);
    this.pump();
  }

  cancel(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    const wasQueued = item.status === 'queued' || item.status === 'preparing';
    item.status = 'canceled';
    item.speed = '';
    item.eta = '';
    const proc = this.procs.get(id);
    if (proc) killTree(proc.pid);
    this.emit(item);
    if (wasQueued) this.pump();
  }

  retry(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item || !['error', 'canceled', 'done'].includes(item.status)) return;
    item.status = 'queued';
    item.error = '';
    item.attempts = { update: false, cookies: false };
    this.emit(item);
    this.pump();
  }

  remove(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (this.procs.has(id)) this.cancel(id);
    this.items = this.items.filter((i) => i.id !== id);
    this.emit({ id, removed: true });
  }

  clearFinished() {
    const removed = this.items.filter((i) => ['done', 'error', 'canceled'].includes(i.status));
    this.items = this.items.filter((i) => !removed.includes(i));
    for (const r of removed) this.emit({ id: r.id, removed: true });
  }

  killAll() {
    for (const [id, proc] of this.procs) {
      const it = this.items.find((i) => i.id === id);
      if (it) { it.status = 'error'; it.error = 'Uygulama kapatıldığı için yarım kaldı. "Tekrar dene" kaldığı yerden sürdürür.'; }
      killTree(proc.pid);
    }
    clearTimeout(this.saveTimer);
    try { fs.writeFileSync(this.file, JSON.stringify(this.items.slice(0, 500))); } catch { /* yoksay */ }
  }

  // Görev çubuğu ilerleme çubuğu için toplam ilerleme (-1 = gizle).
  aggregateProgress() {
    const active = this.items.filter((i) => ['preparing', 'downloading', 'processing', 'queued'].includes(i.status));
    if (!active.length) return -1;
    return active.reduce((s, i) => s + (i.progress || 0), 0) / active.length;
  }
}

function buildArgs(item, cfg, tools, cookieFile, sbCats) {
  const p = PRESETS[item.preset];
  const args = [
    item.url,
    '--encoding', 'utf-8',
    '--newline', '--progress', '--color', 'never',
    '--no-simulate',
    '--ffmpeg-location', tools.ffmpeg,
    '--retries', '15', '--fragment-retries', '15', '--extractor-retries', '5',
    '--concurrent-fragments', '4',
    '--no-mtime',
    '--windows-filenames',
    '--progress-template', 'download:PT|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '--progress-template', 'postprocess:PP|%(progress.postprocessor)s',
    '--print', 'before_dl:TI|%(title)s|%(playlist_index)s|%(playlist_count)s',
    '--print', 'after_move:FP|%(filepath)s',
  ];
  if (fs.existsSync(tools.deno)) args.push('--js-runtimes', `deno:${tools.deno}`);
  args.push(item.playlist ? '--yes-playlist' : '--no-playlist');
  const isMusic = /^https:\/\/music\.youtube\.com\//.test(item.url);
  if (item.folder) {
    // Tubify yerel listesi: Müzik/<Liste>/<NNN> - Sanatçı - Şarkı
    const folder = item.folder.replace(/%/g, '%%');
    const num = item.index ? String(item.index).padStart(3, '0') + ' - ' : '';
    const name = p.kind === 'audio' ? '%(artist,creator,uploader).80B - %(track,title).120B' : '%(title).150B';
    args.push('-o', `Müzik/${folder}/${num}${name}.%(ext)s`);
  } else if (isMusic && p.kind === 'audio') {
    // YouTube Music: "Sanatçı - Şarkı" adlandırma, ayrı Müzik klasörü.
    const name = '%(artist,creator,uploader).80B - %(track,title).120B';
    args.push('-o', item.playlist
      ? `Müzik/%(playlist_title).80B/%(playlist_index)03d - ${name}.%(ext)s`
      : `Müzik/${name}.%(ext)s`);
  } else {
    args.push('-o', item.playlist
      ? '%(playlist_title).80B/%(playlist_index)03d - %(title).150B [%(id)s].%(ext)s'
      : '%(title).180B [%(id)s].%(ext)s');
  }
  args.push('-P', cfg.dir);

  if (p.kind === 'video') {
    const sort = [p.height ? `res:${p.height}` : 'res'];
    if (p.container === 'mp4') sort.push('vcodec:h264', 'acodec:aac');
    args.push('-f', 'bv*+ba/b', '-S', sort.join(','), '--merge-output-format', p.container);
    if (cfg.subtitles) args.push('--write-subs', '--write-auto-subs', '--sub-langs', cfg.subLangs || 'tr,en', '--embed-subs');
  } else {
    const fmt = p.format === 'm4a' ? 'ba[ext=m4a]/ba/b' : p.format === 'opus' ? 'ba[acodec=opus]/ba/b' : 'ba/b';
    args.push('-f', fmt, '-x', '--audio-format', p.format, '--audio-quality', '0');
  }
  args.push('--embed-metadata');
  if (cfg.embedThumbnail) {
    args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg');
    // Şarkılarda kapak resmini albüm kapağı gibi kare kırp.
    if (isMusic && p.kind === 'audio') {
      args.push('--ppa', `ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -qmin 1 -qscale:v 1 -vf crop="'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"`);
    }
  }
  if (cfg.embedChapters) args.push('--embed-chapters');
  if (cfg.sponsorblockRemove && sbCats.length) args.push('--sponsorblock-remove', sbCats.join(','));
  if (cookieFile) args.push('--cookies', cookieFile);
  return args;
}

async function hasLogin() {
  try {
    const c = await session.defaultSession.cookies.get({ domain: 'youtube.com' });
    return c.some((x) => /SAPISID|__Secure-3PSID|LOGIN_INFO/.test(x.name));
  } catch { return false; }
}

// Uygulama oturumundaki YouTube/Google çerezlerini Netscape formatında geçici dosyaya yazar.
async function exportCookies() {
  try {
    const all = await session.defaultSession.cookies.get({});
    const rel = all.filter((c) => /(^|\.)(youtube\.com|google\.com)$/.test(c.domain.replace(/^\./, '')) || /youtube\.com|google\.com/.test(c.domain));
    const lines = ['# Netscape HTTP Cookie File'];
    for (const c of rel) {
      const domain = c.hostOnly ? c.domain : (c.domain.startsWith('.') ? c.domain : '.' + c.domain);
      lines.push([
        domain, domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE',
        c.expirationDate ? Math.floor(c.expirationDate) : 0, c.name, c.value,
      ].join('\t'));
    }
    const file = path.join(app.getPath('temp'), `pt-cookies-${crypto.randomUUID()}.txt`);
    fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
    return file;
  } catch (e) {
    log.warn('Çerezler dışa aktarılamadı', e.message);
    return null;
  }
}

function safeName(n) {
  return String(n).replace(/[<>:"/\|?* -]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Liste';
}

function friendlyError(t) {
  if (/Private video/i.test(t)) return 'Bu video özel (gizli).';
  if (/Video unavailable|This video is unavailable/i.test(t)) return 'Video kullanılamıyor ya da kaldırılmış.';
  if (/Sign in to confirm your age|age-restricted|inappropriate/i.test(t)) return 'Yaş sınırlı video: uygulamada YouTube hesabınıza giriş yapıp tekrar deneyin.';
  if (/members/i.test(t)) return 'Sadece kanal üyelerine açık video.';
  if (/not a bot|confirm you/i.test(t)) return 'YouTube bot doğrulaması istedi: uygulamada hesabınıza giriş yapıp tekrar deneyin.';
  if (/No space left|Errno 28/i.test(t)) return 'Diskte yer kalmadı.';
  if (/Permission denied|Errno 13/i.test(t)) return 'İndirme klasörüne yazma izni yok.';
  if (/getaddrinfo|Unable to download webpage|timed out|Connection/i.test(t)) return 'Bağlantı hatası: internet bağlantınızı kontrol edip tekrar deneyin.';
  if (/live event will begin|Premieres in/i.test(t)) return 'Canlı yayın/prömiyer henüz başlamadı.';
  return t.replace(/^ERROR:\s*/gm, '').slice(0, 600);
}

function normalizeUrl(u) {
  if (!u) return null;
  u = String(u).trim();
  if (/^[\w-]{11}$/.test(u)) return `https://www.youtube.com/watch?v=${u}`;
  try {
    const url = new URL(u);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function videoIdOf(u) {
  try {
    const url = new URL(u);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1, 12);
    const v = url.searchParams.get('v');
    if (v) return v;
    const m = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}

function splitLines(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (d) => {
    buf += d;
    const parts = buf.split(/\r?\n|\r/);
    buf = parts.pop();
    for (const p of parts) onLine(p);
  });
  stream.on('end', () => { if (buf) onLine(buf); });
}

function killTree(pid) {
  if (!pid) return;
  execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtBytes(b) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}

function fmtTime(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

module.exports = { DownloadManager, PRESETS, normalizeUrl, videoIdOf };
