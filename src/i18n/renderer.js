'use strict';
// Pencereler için ortak çeviri yardımcısı. Preload'un sunduğu { lang, dict } yükünü kullanır;
// sayfanın asıl betiğinden önce yüklenir ve statik HTML metinlerini çevirir. Global adı T()'dir
// (t sayfa betiklerinde parça değişkeni olarak sık kullanılıyor).
(() => {
  const src = (window.shell && window.shell.i18n) || (window.pt && window.pt.i18n) || (window.setup && window.setup.i18n) || {};
  let dict = src.dict || {};
  let lang = src.lang || 'tr';

  function t(s, ...args) {
    let v = Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s;
    if (Array.isArray(v)) v = Number(args[0]) === 1 ? v[0] : v[1];
    return args.length ? String(v).replace(/\{(\d)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : v;
  }

  const ATTRS = ['title', 'placeholder', 'aria-label'];
  function translateDom(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const n of texts) {
      const k = n.nodeValue.trim();
      if (k && Object.prototype.hasOwnProperty.call(dict, k)) n.nodeValue = n.nodeValue.replace(k, t(k));
    }
    for (const e of (root || document).querySelectorAll('[title],[placeholder],[aria-label]')) {
      for (const a of ATTRS) {
        const v = e.getAttribute(a);
        if (v && Object.prototype.hasOwnProperty.call(dict, v)) e.setAttribute(a, t(v));
      }
    }
    const title = document.title;
    if (Object.prototype.hasOwnProperty.call(dict, title)) document.title = t(title);
    document.documentElement.lang = lang;
  }

  // Dil değiştirilince (ör. kurulum sihirbazı) sözlük yenilenir.
  function setDict(d, l) { dict = d || {}; lang = l || lang; }

  window.T = t;
  window.i18n = { t, translateDom, setDict, get lang() { return lang; } };
  if (document.body) translateDom(document.body);
  else document.addEventListener('DOMContentLoaded', () => translateDom(document.body));
})();
