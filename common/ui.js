// ひまつぶし工房：共通の UI 部品（KoboUI）
// 読み込み：theme.css・ui.css のあと、i18n.js と audio.js のあと（i18n.js がなくても日本語で動く。audio.js がなければ音の行は出さない）。
//   <link rel="stylesheet" href="../common/theme.css"><link rel="stylesheet" href="../common/ui.css">
//   <script src="../common/i18n.js"></script><script src="../common/audio.js"></script><script src="../common/ui.js"></script>
// テーマ：localStorage 'kobo.theme' = 'system' | 'light' | 'dark'（初期値 system。PRD C-4）。
//   読み込んだときに html[data-kb-theme] を付ける（system のときは外し、CSS の prefers-color-scheme に任せる）。
//   html[data-kb-theme-pref] には選んだ値、meta[name=theme-color] には今の背景色を入れる。
// 部品：KoboUI.header / button / iconButton / icon / card / badge / listRow / list / toggle / segmented / slider / tabs /
//       sheet / modal / confirm / toast / settingsPanel / openSettings / pauseMenu / theme
(function () {
  'use strict';
  const I = window.KoboI18n;
  const T = (s, v) => (I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s));
  if (I) I.add({ en: {
    '戻る': 'Back', 'ホーム': 'Home', 'とじる': 'Close', '設定': 'Settings', 'メニュー': 'Menu',
    '言語': 'Language', 'テーマ': 'Theme', '自動': 'Auto', 'ライト': 'Light', 'ダーク': 'Dark',
    '全体の音量': 'Master volume', '効果音': 'Sound effects', 'BGM': 'Music', 'ミュート': 'Mute',
    'すべての音を止める（全ゲーム共通）': 'Silence all sounds (all games)',
    '音の設定は全ゲームで共通です': 'Sound settings are shared by all games',
    '言語を変えるとページを読み込み直します': 'Changing the language reloads the page',
    '一時停止': 'Paused', 'つづける': 'Resume', 'はじめから': 'Restart', 'ホームへ戻る': 'Back to Home',
    'はじめからやり直しますか？': 'Start over from the beginning?', '今の進み具合は消えます。': 'Your current progress will be lost.',
    'やり直す': 'Restart', 'やめる': 'Cancel', 'OK': 'OK', 'キャンセル': 'Cancel',
    'オン': 'On', 'オフ': 'Off', '音を出す': 'Sound on', '音を消す': 'Sound off', 'ヘルプ': 'Help', '遊び方': 'How to play',
  } });

  // ---------- 小さな道具 ----------
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids == null ? [] : kids)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  let uid = 0; const nid = p => 'kb-' + (p || 'x') + '-' + (++uid);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- アイコン（線の SVG。色は currentColor） ----------
  const P = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    theme: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = P[name] || '';
    return s;
  }

  // ---------- テーマ ----------
  const THEME_KEY = 'kobo.theme', PREFS = ['system', 'light', 'dark'];
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  const themeSubs = new Set();
  function readPref() {
    let v = store.get(THEME_KEY);
    if (v && v[0] === '"') { try { v = JSON.parse(v); } catch (e) {} }
    return PREFS.indexOf(v) >= 0 ? v : 'system';
  }
  function resolved(pref) { pref = pref || readPref(); return pref === 'system' ? (mq && mq.matches ? 'light' : 'dark') : pref; }
  function applyTheme() {
    const pref = readPref(), r = document.documentElement;
    r.setAttribute('data-kb-theme-pref', pref);
    if (pref === 'system') r.removeAttribute('data-kb-theme'); else r.setAttribute('data-kb-theme', pref);
    const color = resolved(pref) === 'light' ? '#f4f1ea' : '#1d2a35';
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m && document.head) { m = el('meta', { name: 'theme-color' }); document.head.appendChild(m); }
    if (m) m.setAttribute('content', color);
    return pref;
  }
  function setTheme(pref) {
    if (PREFS.indexOf(pref) < 0) return readPref();
    store.set(THEME_KEY, pref); applyTheme();
    themeSubs.forEach(f => { try { f(pref, resolved(pref)); } catch (e) {} });
    return pref;
  }
  const theme = {
    KEY: THEME_KEY, prefs: PREFS.slice(),
    get: readPref, set: setTheme, resolved: () => resolved(), apply: applyTheme,
    onChange(f) { themeSubs.add(f); return () => themeSubs.delete(f); },
  };
  applyTheme();
  if (mq) { const h = () => { applyTheme(); themeSubs.forEach(f => { try { f(readPref(), resolved()); } catch (e) {} }); }; mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener && mq.addListener(h); }
  window.addEventListener('storage', e => { if (e.key === THEME_KEY) { applyTheme(); themeSubs.forEach(f => { try { f(readPref(), resolved()); } catch (x) {} }); } });

  // ---------- ボタン ----------
  // button({ label, variant:'primary'|'ghost'|'danger', icon, href, block, lg, onClick, attrs })
  function button(o) {
    o = o || {};
    const cls = ['kb-btn', o.variant && 'kb-btn--' + o.variant, o.block && 'kb-btn--block', o.lg && 'kb-btn--lg', o.className].filter(Boolean).join(' ');
    const b = el(o.href ? 'a' : 'button', Object.assign({ class: cls, type: o.href ? null : 'button', href: o.href || null }, o.attrs || {}));
    if (o.icon) b.append(icon(o.icon));
    if (o.label != null) b.append(el('span', { text: o.label }));
    if (o.onClick) b.addEventListener('click', o.onClick);
    return b;
  }
  // iconButton({ icon, label, onClick, pressed, showLabel })：label は aria-label（showLabel で下に小さく表示）
  function iconButton(o) {
    const b = el('button', { type: 'button', class: 'kb-btn ' + (o.showLabel ? 'kb-btn--labeled' : 'kb-btn--icon') + (o.className ? ' ' + o.className : ''), 'aria-label': o.showLabel ? null : o.label, title: o.showLabel ? null : o.label });
    b.append(icon(o.icon));
    if (o.showLabel) b.append(el('span', { text: o.label }));
    if (o.pressed != null) b.setAttribute('aria-pressed', String(!!o.pressed));
    if (o.onClick) b.addEventListener('click', o.onClick);
    return b;
  }
  // header({ title, back:'../', backLabel, center, sticky, actions:[iconButton options | Element] })
  function header(o) {
    o = o || {};
    const bar = el('header', { class: 'kb-bar kb-ui' + (o.sticky ? ' kb-bar--sticky' : '') });
    if (o.back !== false) {
      const a = el('a', { class: 'kb-back', href: o.back || '../' });
      a.append(icon('back'), el('span', { text: o.backLabel || T('ホーム') }));
      bar.append(a);
    }
    bar.append(el('h1', { class: 'kb-bar__title' + (o.center ? ' kb-bar__title--center' : ''), text: o.title || '' }));
    const acts = el('div', { class: 'kb-bar__actions' });
    for (const a of o.actions || []) acts.append(a.nodeType ? a : iconButton(a));
    bar.append(acts);
    return bar;
  }
  function card(o) {
    o = o || {};
    const c = el(o.href ? 'a' : 'div', { class: 'kb-card' + (o.href ? ' kb-card--link' : '') + (o.accent ? ' kb-card--accent' : ''), href: o.href || null });
    if (o.title) c.append(el('h3', { class: 'kb-card__title', text: o.title }));
    if (o.text) c.append(el('p', { class: 'kb-card__text', text: o.text }));
    if (o.body) c.append(o.body);
    return c;
  }
  function badge(text, variant) { return el('span', { class: 'kb-badge' + (variant ? ' kb-badge--' + variant : ''), text: variant === 'dot' ? null : text, 'aria-label': variant === 'dot' ? text : null, role: variant === 'dot' ? 'img' : null }); }
  // listRow({ title, sub, lead (text | {icon}), end (text | Element), href, onClick, chevron })
  function listRow(o) {
    const tag = o.href ? 'a' : o.onClick ? 'button' : 'div';
    const r = el(tag, { class: 'kb-list__row', href: o.href || null, type: tag === 'button' ? 'button' : null });
    if (o.lead != null) { const l = el('span', { class: 'kb-list__lead', 'aria-hidden': 'true' }); l.append(o.lead.icon ? icon(o.lead.icon) : String(o.lead)); r.append(l); }
    const m = el('span', { class: 'kb-list__main' }, [el('span', { class: 'kb-list__title', text: o.title || '' })]);
    if (o.sub) m.append(el('span', { class: 'kb-list__sub', text: o.sub }));
    r.append(m);
    const end = el('span', { class: 'kb-list__end' });
    if (o.end != null) end.append(o.end.nodeType ? o.end : String(o.end));
    if (o.chevron !== false && (o.href || o.onClick)) { const c = icon('chevron'); c.setAttribute('class', 'kb-list__chev'); end.append(c); }
    if (end.childNodes.length) r.append(end);
    if (o.onClick) r.addEventListener('click', o.onClick);
    return r;
  }
  function list(rows, label) { const u = el('ul', { class: 'kb-list kb-ui', 'aria-label': label || null }); for (const r of rows) u.append(el('li', null, [r.nodeType ? r : listRow(r)])); return u; }

  // ---------- 入力の部品 ----------
  // toggle({ label, checked, onChange })：role=switch。label は aria-label（見える見出しは設定の行が持つ）
  function toggle(o) {
    const b = el('button', { type: 'button', class: 'kb-switch', role: 'switch', 'aria-checked': String(!!o.checked), 'aria-label': o.label || null, 'aria-labelledby': o.labelledBy || null });
    b.append(el('span', { class: 'kb-switch__track' }, [el('span', { class: 'kb-switch__thumb' })]));
    const api = { el: b, get checked() { return b.getAttribute('aria-checked') === 'true'; }, set checked(v) { b.setAttribute('aria-checked', String(!!v)); } };
    b.addEventListener('click', () => { api.checked = !api.checked; o.onChange && o.onChange(api.checked); });
    b.kb = api; return b;
  }
  // segmented({ label, options:[{ value, label }], value, onChange, block })：role=radiogroup、矢印キーで移動
  function segmented(o) {
    const g = el('div', { class: 'kb-seg' + (o.block ? ' kb-seg--block' : ''), role: 'radiogroup', 'aria-label': o.label || null, 'aria-labelledby': o.labelledBy || null });
    const btns = o.options.map(op => el('button', { type: 'button', class: 'kb-seg__opt', role: 'radio', 'data-value': op.value, text: op.label, lang: op.lang || null }));
    let value = o.value;
    function draw() { btns.forEach(b => { const on = b.dataset.value === String(value); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); if (!btns.some(b => b.tabIndex === 0) && btns[0]) btns[0].tabIndex = 0; }
    function pick(v, focus) { if (String(v) === String(value)) return; value = v; draw(); if (focus) btns.find(b => b.dataset.value === String(v)).focus(); o.onChange && o.onChange(v); }
    btns.forEach((b, i) => {
      b.addEventListener('click', () => pick(o.options[i].value));
      b.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return; e.preventDefault(); const j = (i + d + btns.length) % btns.length; pick(o.options[j].value, true);
      });
      g.append(b);
    });
    draw();
    g.kb = { get value() { return value; }, set value(v) { value = v; draw(); } };
    return g;
  }
  // slider({ label, value 0..1, onInput(v), onChange(v), disabled })：0〜100% で表示
  function slider(o) {
    const id = o.id || nid('sl');
    const wrap = el('div', { class: 'kb-slider' });
    const inp = el('input', { type: 'range', id, min: '0', max: '100', step: '5', 'aria-label': o.labelledBy ? null : o.label || null, 'aria-labelledby': o.labelledBy || null });
    const out = el('output', { for: id, 'aria-hidden': 'true' });
    const draw = () => { const v = Number(inp.value); out.textContent = v + '%'; inp.style.setProperty('--kb-fill', v + '%'); inp.setAttribute('aria-valuetext', v + '%'); };
    const setV = v => { inp.value = String(Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100)); draw(); };
    setV(o.value);
    inp.disabled = !!o.disabled;
    inp.addEventListener('input', () => { draw(); o.onInput && o.onInput(Number(inp.value) / 100); });
    inp.addEventListener('change', () => { o.onChange && o.onChange(Number(inp.value) / 100); });
    wrap.append(inp, out);
    wrap.kb = { input: inp, get value() { return Number(inp.value) / 100; }, set value(v) { setV(v); }, set disabled(d) { inp.disabled = !!d; } };
    return wrap;
  }
  // tabs({ label, tabs:[{ id, label, panel: Element }], value, onChange })
  function tabs(o) {
    const root = el('div', { class: 'kb-tabset kb-ui' });
    const bar = el('div', { class: 'kb-tabs', role: 'tablist', 'aria-label': o.label || null });
    const base = nid('tab');
    let value = o.value || o.tabs[0].id;
    const items = o.tabs.map(t => {
      const b = el('button', { type: 'button', class: 'kb-tab', role: 'tab', id: base + '-' + t.id, 'aria-controls': base + '-p-' + t.id, text: t.label });
      const p = el('div', { class: 'kb-tabpanel', role: 'tabpanel', id: base + '-p-' + t.id, 'aria-labelledby': base + '-' + t.id, tabindex: '0' }, [t.panel || null]);
      bar.append(b); return { t, b, p };
    });
    function draw() { items.forEach(({ t, b, p }) => { const on = t.id === value; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; p.hidden = !on; }); }
    function pick(id, focus) { value = id; draw(); const it = items.find(x => x.t.id === id); if (focus) it.b.focus(); o.onChange && o.onChange(id); }
    items.forEach(({ t, b }, i) => {
      b.addEventListener('click', () => pick(t.id));
      b.addEventListener('keydown', e => {
        let j = -1;
        if (e.key === 'ArrowRight') j = (i + 1) % items.length; else if (e.key === 'ArrowLeft') j = (i - 1 + items.length) % items.length;
        else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = items.length - 1;
        if (j >= 0) { e.preventDefault(); pick(items[j].t.id, true); }
      });
    });
    root.append(bar); items.forEach(x => root.append(x.p)); draw();
    root.kb = { get value() { return value; }, select: id => pick(id) };
    return root;
  }

  // ---------- 重ねる画面（シート・モーダル） ----------
  const stack = [];
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function visibleFocusables(n) { return Array.from(n.querySelectorAll(FOCUSABLE)).filter(x => !x.closest('[hidden]') && x.getClientRects().length); }
  document.addEventListener('keydown', e => {
    const top = stack[stack.length - 1]; if (!top) return;
    if (e.key === 'Escape') {
      if (top.o.onEscape) { e.preventDefault(); top.o.onEscape(top); }
      else if (top.o.dismissible !== false) { e.preventDefault(); top.close('escape'); }
      return;
    }
    if (e.key === 'Tab') {
      const f = visibleFocusables(top.panel); if (!f.length) { e.preventDefault(); top.panel.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!top.panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  // layer(kind, { title, body, actions:[button options | Element], closeButton, dismissible, onClose, initialFocus, className })
  // actions の最後の primary がいちばん下に固定される「主な操作」。中身が長いときは本文だけがスクロールする。
  function layer(kind, o) {
    o = o || {};
    const titleId = nid('t');
    const root = el('div', { class: 'kb-layer kb-layer--' + kind + (o.className ? ' ' + o.className : ''), hidden: true });
    const panel = el('div', { class: 'kb-panel kb-ui', role: o.role || 'dialog', 'aria-modal': 'true', 'aria-labelledby': o.title ? titleId : null, 'aria-label': o.title ? null : o.label || null, tabindex: '-1' });
    const head = el('div', { class: 'kb-panel__head' });
    if (o.title) head.append(el('h2', { class: 'kb-panel__title', id: titleId, text: o.title }));
    const api = { el: root, panel, body: null, foot: null, isOpen: false, o };
    if (o.closeButton !== false && o.dismissible !== false) head.append(iconButton({ icon: 'close', label: T('とじる'), onClick: () => api.close('button'), className: 'kb-panel__x' }));
    if (head.childNodes.length) panel.append(head);
    const body = el('div', { class: 'kb-panel__body' });
    if (o.body) body.append(o.body.nodeType ? o.body : el('p', { text: String(o.body) }));
    panel.append(body); api.body = body;
    if (o.actions && o.actions.length) {
      const foot = el('div', { class: 'kb-panel__foot' });
      for (const a of o.actions) foot.append(a.nodeType ? a : button(Object.assign({}, a, { onClick: e => { const r = a.onClick && a.onClick(e, api); if (a.close !== false && r !== false) api.close(a.value || 'action'); } })));
      panel.append(foot); api.foot = foot;
    }
    root.append(panel);
    root.addEventListener('click', e => { if (e.target === root && o.dismissible !== false) api.close('backdrop'); });
    let returnTo = null;
    api.open = () => {
      if (api.isOpen) return api;
      returnTo = document.activeElement;
      if (!root.parentNode) document.body.appendChild(root);
      root.hidden = false; api.isOpen = true; stack.push(api);
      document.body.classList.add('kb-lock');
      const target = (typeof o.initialFocus === 'string' ? panel.querySelector(o.initialFocus) : o.initialFocus) ||
        (api.foot && api.foot.querySelector('.kb-btn--primary')) || visibleFocusables(body)[0] || panel;
      try { target.focus({ preventScroll: true }); } catch (e) {}
      return api;
    };
    api.close = (why) => {
      if (!api.isOpen) return;
      api.isOpen = false; root.hidden = true;
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove('kb-lock');
      if (o.destroyOnClose !== false) root.remove();
      if (returnTo && returnTo.focus && document.contains(returnTo)) { try { returnTo.focus({ preventScroll: true }); } catch (e) {} }
      o.onClose && o.onClose(why);
    };
    return api;
  }
  const sheet = o => layer('sheet', o);
  const modal = o => layer('modal', o);
  // confirm({ title, message, ok, cancel, danger }) → Promise<boolean>
  function confirm(o) {
    o = o || {};
    return new Promise(res => {
      let done = false; const fin = v => { if (!done) { done = true; res(v); } };
      modal({ title: o.title, body: o.message, role: 'alertdialog', closeButton: false,
        actions: [{ label: o.cancel || T('キャンセル'), variant: 'ghost', onClick: () => fin(false) },
                  { label: o.ok || T('OK'), variant: o.danger ? 'danger' : 'primary', className: 'kb-btn--primary-slot', onClick: () => fin(true) }],
        initialFocus: o.danger ? '.kb-btn--ghost' : '.kb-btn--primary-slot',
        onClose: () => fin(false) }).open();
    });
  }

  // ---------- トースト ----------
  let toastBox = null;
  // toast(message, { type:'ok'|'danger'|'accent', ms, bottom })
  function toast(msg, o) {
    o = o || {};
    if (!toastBox || !document.body.contains(toastBox)) {
      toastBox = el('div', { class: 'kb-toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastBox);
    }
    toastBox.classList.toggle('kb-toasts--bottom', !!o.bottom);
    const t = el('div', { class: 'kb-toast' + (o.type ? ' kb-toast--' + o.type : ''), text: msg });
    toastBox.append(t);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    const ms = o.ms || Math.min(6000, 1800 + String(msg).length * 45);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); }, ms);
    return t;
  }

  // ---------- 設定のまとまり ----------
  function setRow(label, sub, control, stack) {
    const id = nid('k');
    const k = el('div', { class: 'kb-set__k', id }, [label]);
    if (sub) k.append(el('small', { text: sub }));
    const row = el('div', { class: 'kb-set__row' + (stack ? ' kb-set__row--stack' : '') }, [k, el('div', { class: 'kb-set__v' }, [control])]);
    return { row, id };
  }
  // settingsPanel({ language, theme, audio, extra:[Element] }) → Element。各項目は false で出さない。
  // 音の行は KoboAudio があるときだけ出す（BGM の行は hidden で用意だけする：オーナーの決定 7）。
  function settingsPanel(o) {
    o = o || {};
    const box = el('div', { class: 'kb-set kb-ui' });
    const cleanup = [];
    if (o.language !== false && I && I.langs) {
      const seg = segmented({ options: I.langs.map(l => ({ value: l.id, label: l.name, lang: l.id })), value: I.lang, block: true, onChange: v => I.set(v) });
      const r = setRow(I.lang === 'ja' ? '言語 / Language' : T('言語'), T('言語を変えるとページを読み込み直します'), seg, true);
      seg.setAttribute('aria-labelledby', r.id); box.append(r.row);
    }
    if (o.theme !== false) {
      const seg = segmented({ options: [{ value: 'system', label: T('自動') }, { value: 'light', label: T('ライト') }, { value: 'dark', label: T('ダーク') }], value: theme.get(), block: true, onChange: v => theme.set(v) });
      const r = setRow(T('テーマ'), null, seg, true);
      seg.setAttribute('aria-labelledby', r.id); box.append(r.row);
      cleanup.push(theme.onChange(p => { seg.kb.value = p; }));
    }
    const A = window.KoboAudio;
    if (o.audio !== false && A) {
      const s = A.get();
      const mute = toggle({ checked: s.mute, onChange: v => A.set({ mute: v }) });
      const rm = setRow(T('ミュート'), T('すべての音を止める（全ゲーム共通）'), mute);
      mute.setAttribute('aria-labelledby', rm.id);
      const mk = (key, label, hide) => {
        const sl = slider({ value: s[key], disabled: s.mute, onInput: v => A.set({ [key]: v }), onChange: v => { A.set({ [key]: v }); if (key === 'se' || key === 'master') A.sfx('tap'); } });
        const r = setRow(label, null, sl, true);
        sl.kb.input.setAttribute('aria-labelledby', r.id);
        if (hide) { r.row.hidden = true; r.row.setAttribute('data-kb-reserved', 'bgm'); }
        return { r, sl, key };
      };
      const rows = [mk('master', T('全体の音量')), mk('se', T('効果音')), mk('bgm', T('BGM'), true)];
      box.append(rows[0].r.row, rows[1].r.row, rows[2].r.row, rm.row);
      box.append(el('p', { class: 'kb-dim', style: 'margin:4px 0 0;font-size:var(--kb-fs-xs)', text: T('音の設定は全ゲームで共通です') }));
      cleanup.push(A.onChange(c => { mute.kb.checked = c.mute; rows.forEach(x => { x.sl.kb.value = c[x.key]; x.sl.kb.disabled = c.mute; }); }));
    }
    for (const x of o.extra || []) box.append(x);
    box.kbDispose = () => cleanup.forEach(f => f());
    return box;
  }
  // openSettings({ title, ...settingsPanel options }) → sheet api
  function openSettings(o) {
    o = o || {};
    const panel = settingsPanel(o);
    const s = sheet({ title: o.title || T('設定'), body: panel, actions: [{ label: T('とじる'), variant: 'primary', block: true }],
      onClose: why => { panel.kbDispose(); o.onClose && o.onClose(why); } });
    return s.open();
  }
  // pauseMenu({ title, onResume, onRestart, confirmRestart, home, onSettings, extra:[button options], onOpen }) → { open, close, isOpen }
  // 「つづける」を押すまで閉じない（背景を押しても閉じない。Esc は「つづける」と同じ）。
  function pauseMenu(o) {
    o = o || {};
    let m = null;
    function open() {
      if (m && m.isOpen) return api;
      const body = el('div', { class: 'kb-pause' });
      let resumed = false;
      if (o.onRestart) body.append(button({ label: T('はじめから'), icon: 'restart', variant: 'ghost', block: true, onClick: async () => {
        if (o.confirmRestart !== false) {
          const ok = await confirm({ title: T('はじめからやり直しますか？'), message: T('今の進み具合は消えます。'), ok: T('やり直す'), cancel: T('やめる'), danger: true });
          if (!ok) return;
        }
        resumed = true; m.close('restart'); o.onRestart();
      } }));
      if (o.onSettings !== false) body.append(button({ label: T('設定'), icon: 'settings', variant: 'ghost', block: true, onClick: () => (typeof o.onSettings === 'function' ? o.onSettings() : openSettings(o.settings)) }));
      for (const x of o.extra || []) body.append(x.nodeType ? x : button(Object.assign({ variant: 'ghost', block: true }, x)));
      if (o.home !== false) body.append(button({ label: T('ホームへ戻る'), icon: 'home', variant: 'ghost', block: true, href: o.home || '../' }));
      m = modal({ title: o.title || T('一時停止'), body, closeButton: false, dismissible: false, className: 'kb-layer--pause',
        onEscape: () => m.foot.querySelector('.kb-btn--primary').click(),
        actions: [{ label: T('つづける'), icon: 'play', variant: 'primary', lg: true, onClick: () => { resumed = true; } }],
        onClose: why => { if (resumed && why !== 'restart') o.onResume && o.onResume(); } });
      m.open(); o.onOpen && o.onOpen();
      return api;
    }
    const api = { open, close: () => m && m.close('api'), get isOpen() { return !!(m && m.isOpen); } };
    return api;
  }

  window.KoboUI = {
    el, icon, icons: Object.keys(P), t: T, theme,
    header, button, iconButton, card, badge, listRow, list,
    toggle, segmented, slider, tabs,
    sheet, modal, confirm, toast,
    settingsPanel, openSettings, pauseMenu,
  };
})();
