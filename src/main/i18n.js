'use strict';
// Arayüz dili. Kaynak metinler Türkçedir; İngilizce karşılıkları src/i18n/en.js sözlüğündedir.
// Dil süreç başında bir kez belirlenir (değişiklik yeniden başlatmayla uygulanır).
const DICTS = { en: require('../i18n/en') };
const LANGS = ['tr', 'en'];

let lang = 'tr';

function setLang(l) { lang = LANGS.includes(l) ? l : 'tr'; }
function getLang() { return lang; }

// t('{0} şarkı', 3) → "3 songs". Sözlük değeri [tekil, çoğul] olabilir; seçim ilk sayısal argümana göre yapılır.
function translate(dict, s, args) {
  let v = dict && Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s;
  if (Array.isArray(v)) v = Number(args[0]) === 1 ? v[0] : v[1];
  return args.length ? String(v).replace(/\{(\d)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : v;
}

function t(s, ...args) { return translate(DICTS[lang], s, args); }

// Belirli bir dilde çeviri (ör. dil değiştirme onayını seçilen dilde göstermek için).
function tIn(l, s, ...args) { return translate(DICTS[l], s, args); }

// Sandbox'lı pencerelere gönderilen yük.
function payload() { return { lang, dict: DICTS[lang] || {} }; }

module.exports = { t, tIn, setLang, getLang, payload, LANGS };
