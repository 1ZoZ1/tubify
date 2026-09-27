'use strict';
/* global setup */
// İlk açılış sihirbazı. Metinler data-k anahtarlarından seçilen dile göre her adımda yeniden yazılır.
const $ = (s) => document.querySelector(s);
const S = { lang: 'tr', dir: '', dicts: {}, page: 'lang' };

function T(s, ...args) {
  const d = S.dicts[S.lang] || {};
  let v = Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s;
  if (Array.isArray(v)) v = Number(args[0]) === 1 ? v[0] : v[1];
  return args.length ? String(v).replace(/\{(\d)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : v;
}

function render() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-k]').forEach((e) => { e.textContent = T(e.dataset.k); });
  $('#close').setAttribute('aria-label', T('Kapat'));
  document.querySelectorAll('.lang').forEach((b) => {
    const on = b.dataset.lang === S.lang;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  $('#page-lang').hidden = S.page !== 'lang';
  $('#page-dir').hidden = S.page !== 'dir';
  $('#step').textContent = T('Adım {0} / {1}', S.page === 'lang' ? 1 : 2, 2);
  $('#dir').textContent = S.dir;
  $('#dir').title = S.dir;
}

document.querySelectorAll('.lang').forEach((b) => {
  b.onclick = () => { S.lang = b.dataset.lang; render(); };
  b.ondblclick = () => { S.lang = b.dataset.lang; S.page = 'dir'; render(); };
});
$('#next').onclick = () => { S.page = 'dir'; render(); };
$('#back').onclick = () => { S.page = 'lang'; render(); };
$('#choose').onclick = async () => { S.dir = await setup.chooseDir(); render(); };
$('#finish').onclick = () => { $('#finish').disabled = true; setup.finish(S.lang); };
$('#close').onclick = () => setup.close();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') (S.page === 'lang' ? $('#next') : $('#finish')).click();
  if (e.key === 'Escape' && S.page === 'dir') $('#back').click();
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && S.page === 'lang') { S.lang = S.lang === 'tr' ? 'en' : 'tr'; render(); }
});

(async () => {
  const init = await setup.init();
  S.lang = init.lang;
  S.dir = init.dir;
  S.dicts = init.dicts || {};
  render();
})();
