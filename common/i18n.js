// ひまつぶし工房：全ゲーム共通の言語設定
// 使い方：<head> で <script src="../common/i18n.js"></script> を読み込み、
//   KoboI18n.add({ en: { '日本語の文': 'English text', ... } });
//   画面の文字は t('日本語の文')、{n} のような差し込みは t('{n} 日目', { n: 3 })。
//   HTML の要素は data-i18n（中身の文字）/ data-i18n-attr="placeholder,aria-label,title" で自動翻訳。
// 原文（日本語）がそのまま辞書の見出しなので、訳が無い文は日本語のまま出る。
(function () {
  'use strict';
  const KEY = 'kobo.lang';
  const LANGS = [{ id: 'ja', name: '日本語' }, { id: 'en', name: 'English' }];
  const dict = { ja: {}, en: {} };
  let lang = 'ja';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some(l => l.id === saved)) lang = saved;
    else if (!saved && !/^ja\b/i.test(navigator.language || 'ja')) lang = 'en';
  } catch (e) {}
  document.documentElement.lang = lang;

  function fill(s, vars) { return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s; }
  function t(ja, vars) {
    if (lang === 'ja') return fill(ja, vars);
    const v = dict[lang][ja];
    return fill(v == null ? ja : v, vars);
  }
  function add(more) { for (const [l, d] of Object.entries(more || {})) { dict[l] = dict[l] || {}; Object.assign(dict[l], d); } }
  function apply(root) {
    root = root || document;
    if (lang === 'ja') return;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      if (!el.dataset.i18nJa) el.dataset.i18nJa = el.dataset.i18n || el.textContent.trim();
      el.textContent = t(el.dataset.i18nJa);
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      if (!el.dataset.i18nJa) el.dataset.i18nJa = el.innerHTML.trim();
      const v = dict[lang][el.dataset.i18nJa]; if (v != null) el.innerHTML = v;
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      for (const a of el.dataset.i18nAttr.split(',')) { const k = 'i18nJa' + a.replace(/\W/g, ''); if (!el.dataset[k]) el.dataset[k] = el.getAttribute(a) || ''; el.setAttribute(a, t(el.dataset[k])); }
    });
    if (document.title && dict[lang][document.title]) document.title = dict[lang][document.title];
  }
  function set(l) { try { localStorage.setItem(KEY, l); } catch (e) {} location.reload(); }
  // a small language switcher (select element) for menus
  function picker(el) {
    if (!el) return;
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Language / 言語');
    for (const l of LANGS) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; if (l.id === lang) o.selected = true; sel.appendChild(o); }
    sel.onchange = () => set(sel.value);
    el.appendChild(sel);
    return sel;
  }
  // ---- fit one-screen games to the area that is really visible ----
  // Some browsers (in-app browsers such as LINE, some Android/iOS toolbars) report a height that
  // includes their bottom toolbar, so CSS 100% / 100dvh can put bottom buttons behind it.
  // Measure the visible height and pin the page to it. Scrolling pages (hub, ranking) are left alone.
  (function fitViewport() {
    if (!/\/(neji|blocks|drop|raft|gates|n59049|water|parking|hole)\//.test(location.pathname)) return;
    const root = document.documentElement;
    const st = document.createElement('style');
    st.textContent = 'html,body{height:var(--kobo-h,100%)!important;min-height:0!important;max-height:var(--kobo-h,100%)!important;overflow:hidden!important}' +
      'body{top:0!important;bottom:auto!important}';
    (document.head || root).appendChild(st);
    let last = 0;
    function measure() {
      const vv = window.visualViewport;
      // the smaller of the reported heights is what the user can actually see
      let h = Math.min(window.innerHeight || 1e9, vv ? vv.height * (vv.scale || 1) : 1e9, root.clientHeight || 1e9);
      if (!isFinite(h) || h < 200) h = window.innerHeight || 600;
      h = Math.round(h);
      if (h !== last) {
        last = h; root.style.setProperty('--kobo-h', h + 'px');
        // let canvases and 3D views re-layout
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      }
      if (window.scrollY) window.scrollTo(0, 0);
    }
    measure();
    window.addEventListener('resize', () => setTimeout(measure, 0));
    window.addEventListener('orientationchange', () => setTimeout(measure, 300));
    if (window.visualViewport) visualViewport.addEventListener('resize', measure);
    document.addEventListener('DOMContentLoaded', measure);
    window.addEventListener('load', () => { measure(); setTimeout(measure, 500); setTimeout(measure, 1500); });
  })();

  window.KoboI18n = { get lang() { return lang; }, langs: LANGS, t, add, apply, set, picker };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply()); else apply();
})();
