'use strict';
// Gezinme politikası ve adres yardımcıları.
const { shell } = require('electron');

const HOME = 'https://www.youtube.com/';
const MUSIC_HOME = 'https://music.youtube.com/';

// Google, "Electron" içeren tarayıcı kimliklerinde girişi engeller; standart Chrome kimliği kullanılır.
const CHROME_MAJOR = process.versions.chrome.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
// Google hesap sayfaları gömülü Chromium'u tespit edip girişi reddedebildiği için orada Firefox kimliği kullanılır.
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0';

function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function isYouTube(u) { return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(hostOf(u)); }
function isMusic(u) { return hostOf(u) === 'music.youtube.com'; }
function isGoogleAuth(u) {
  const h = hostOf(u);
  return /(^|\.)google\.[a-z.]+$/.test(h) || h === 'accounts.youtube.com' || /(^|\.)gstatic\.com$/.test(h);
}
function isAccountsHost(u) { return /^accounts\.google\./.test(hostOf(u)); }

// youtube.com/redirect?q=… bağlantılarını doğrudan hedefe çevirir.
function externalTarget(u) {
  try {
    const url = new URL(u);
    if (isYouTube(u) && url.pathname === '/redirect') return url.searchParams.get('q') || null;
  } catch { /* yoksay */ }
  return null;
}

function openExternal(u) {
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) shell.openExternal(u).catch(() => {});
}

function videoIdFromUrl(u) {
  try {
    const url = new URL(u);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1, 12) || null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const m = url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}

function urlFromArgv(argv) {
  for (const a of argv.slice(1)) if (/^https?:\/\//i.test(a) && isYouTube(a)) return a;
  return null;
}

module.exports = {
  HOME, MUSIC_HOME, CHROME_UA, FIREFOX_UA,
  hostOf, isYouTube, isMusic, isGoogleAuth, isAccountsHost, externalTarget, openExternal, videoIdFromUrl, urlFromArgv,
};
