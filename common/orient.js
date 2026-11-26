/* KoboOrient — 画面のむき（じどう / よこ きょうせい / たて きょうせい）
 *
 * スマホが横向きにならない（自動回転オフ・ホーム画面のアプリ・iOS が manifest の orientation を無視する）ときのために、
 * ゲームの画面ぜんたいを 90°まわして出す。やりかたは「ふくろ（シェル）の中に、同じページを iframe で開いて、iframe をまわす」。
 *   ・iframe の中は、ほんとうに横長のブラウザ画面になる → CSS の @media (orientation)・vh・vw・safe-area が、そのまま正しく動く
 *   ・タッチ／マウスの座標は、ブラウザが iframe の中の座標に直してから渡してくれる（clientX/clientY が、見えている向きのまま）
 *   ・ページ側で座標の計算はいらない（mapPoint は、試験とほかの使いかた用）
 *
 * つかいかた（ゲームのページ）:
 *   <head> のいちばん上で（<script src> は、common/orient-shell.html と同じフォルダの orient.js）:
 *     <script src="../common/orient.js"></script>
 *     <script>KoboOrient.boot({ key: 'kusoge.brawl.ori' });</script>   // 「まわす」設定ならここでシェルに入れかわる（このあとの <script> は動かない）
 *   設定の画面: KoboOrient.get() → 'auto' | 'land' | 'port'、KoboOrient.set('land')（かわったらページを読みなおす）
 *   はじめのタップで: KoboOrient.tryLock()（Android Chrome は全画面 ＋ screen.orientation.lock('landscape') をためす。だめでもだまって何もしない）
 *
 * API
 *   KoboOrient.MODES                        ['auto','land','port']
 *   KoboOrient.boot({ key, dir })           → true ならシェル（common/orient-shell.html）へ移った。key は localStorage のキー。dir は 'cw'（既定）か 'ccw'（まわす向き）
 *   KoboOrient.shell()                      シェルのページから呼ぶ（orient-shell.html がやる）
 *   KoboOrient.get() / set(mode)            ほぞん（localStorage、この端末だけ）。set はシェルが要る／いらないが変わるときだけ、ページを読みなおす
 *   KoboOrient.state()                      { mode, shell（シェルの中か）, inFrame, rotated（いま まわっているか）, dir }
 *   KoboOrient.tryLock()                    はじめのタップの中で呼ぶ。mode が 'land'/'port' のときだけ
 *   KoboOrient.mapPoint(x, y, o)            画面（端末）の座標 → まわした中の座標。o = { dir:'cw'|'ccw', W, H }（W,H は端末の画面の幅と高さ）
 *   KoboOrient.unmapPoint(x, y, o)          まわした中の座標 → 画面の座標
 *   KoboOrient.needRotate(mode, W, H)       いま まわす？（'land' で縦長、'port' で横長のとき true）
 *   KoboOrient.insetsFor(ins, dir)          端末の safe-area {t,r,b,l} → まわした中の safe-area
 *   KoboOrient.apply(rootEl, o)             （かんたんなページ用）シェルを使わず、rootEl に直接 transform をかける。メディアクエリ・vh は直らない。解除の関数を返す
 *   iframe の中のページには、親が safe-area を --kb-test-sat/sab/sal/sar として入れてくれる（theme.css の --kb-sat などがそれを読む）
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KoboOrient = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const MODES = ['auto', 'land', 'port'];
  let KEY = 'kusoge.orient', DIR = 'cw', SHELL = false;
  const ls = { get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} } };
  const inFrame = () => { try { return root.top !== root.self; } catch (e) { return true; } };

  const needRotate = (mode, W, H) => (mode === 'land' && W < H) || (mode === 'port' && W >= H);
  // 端末の画面 (X,Y) → まわした中 (x,y)。cw: 中の上が端末の右がわ。W,H は端末の画面の幅と高さ（まわす前）
  function mapPoint(X, Y, o) { const W = o.W; return o.dir === 'ccw' ? { x: o.H - Y, y: X } : { x: Y, y: W - X }; }
  function unmapPoint(x, y, o) { const W = o.W; return o.dir === 'ccw' ? { x: y, y: o.H - x } : { x: W - y, y: x }; }
  // 端末の safe-area → まわした中の safe-area（上＝t, 右＝r, 下＝b, 左＝l）
  function insetsFor(i, dir) { return dir === 'ccw' ? { t: i.l, r: i.t, b: i.r, l: i.b } : { t: i.r, r: i.b, b: i.l, l: i.t }; }
  const cssRot = (dir, W, H) => dir === 'ccw' ? 'translate(0px,' + H + 'px) rotate(-90deg)' : 'translate(' + W + 'px,0px) rotate(90deg)';

  function get(key) { const v = ls.get(key || KEY); return MODES.indexOf(v) >= 0 ? v : 'auto'; }
  function set(mode, key) {
    if (MODES.indexOf(mode) < 0) return false;
    const before = get(key); ls.set(key || KEY, mode);
    if ((before === 'auto') !== (mode === 'auto')) { try { (root.top || root).location.reload(); } catch (e) { try { root.location.reload(); } catch (e2) {} } }
    else if (inFrame() && before !== mode) { try { root.parent.postMessage({ koOrient: 'mode', mode }, '*'); } catch (e) {} }
    return true;
  }

  // ---- シェル（親のページ）。この関数は文字にして、新しいドキュメントの中で動かす
  function shellMain(cfg) {
    const f = document.getElementById('ko'), pr = document.getElementById('pr');
    function insets() { const s = getComputedStyle(pr); return { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 }; }
    function lay() {
      const vv = window.visualViewport, W = Math.round(window.innerWidth), H = Math.round(window.innerHeight);
      void vv;
      const rot = (cfg.mode === 'land' && W < H) || (cfg.mode === 'port' && W >= H);
      let ins = insets();
      if (!rot) { f.style.width = W + 'px'; f.style.height = H + 'px'; f.style.transform = 'none'; }
      else {
        f.style.width = H + 'px'; f.style.height = W + 'px';
        f.style.transform = cfg.dir === 'ccw' ? 'translate(0px,' + H + 'px) rotate(-90deg)' : 'translate(' + W + 'px,0px) rotate(90deg)';
        ins = cfg.dir === 'ccw' ? { t: ins.l, r: ins.t, b: ins.r, l: ins.b } : { t: ins.r, r: ins.b, b: ins.l, l: ins.t };
      }
      document.documentElement.dataset.rot = rot ? cfg.dir : '';
      try { f.contentWindow.postMessage({ koOrient: 'insets', ins, rot, dir: cfg.dir }, '*'); } catch (e) {}
    }
    window.addEventListener('resize', lay); window.addEventListener('orientationchange', function () { setTimeout(lay, 150); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', lay);
    window.addEventListener('message', function (e) {
      const d = e.data; if (!d || typeof d !== 'object' || e.source !== f.contentWindow) return;
      if (d.koOrient === 'ready') lay();
      else if (d.koOrient === 'mode') { if (d.mode === 'auto') location.replace(cfg.src); else { cfg.mode = d.mode; lay(); } }
    });
    f.addEventListener('load', function () { try { document.title = f.contentDocument.title || document.title; } catch (e) {} lay(); try { f.contentWindow.focus(); } catch (e) {} });
    window.addEventListener('focus', function () { try { f.contentWindow.focus(); } catch (e) {} });
    f.src = cfg.src; lay();
  }

  // ゲームのページの <head> から呼ぶ。「まわす」設定なら、シェル（common/orient-shell.html）へ移る（location.replace：もどるボタンの履歴は増えない）
  function boot(o) {
    o = o || {}; KEY = o.key || KEY; DIR = o.dir === 'ccw' ? 'ccw' : 'cw';
    if (inFrame()) { listen(); return false; }
    if (typeof document === 'undefined' || get() === 'auto') return false;
    const cs = document.currentScript, base = cs && cs.src ? cs.src.replace(/orient\.js(\?.*)?$/, '') : root.location.origin + '/common/';
    const u = root.location.pathname + root.location.search + root.location.hash;
    try { document.documentElement.style.visibility = 'hidden'; } catch (e) {}
    root.location.replace(base + 'orient-shell.html?u=' + encodeURIComponent(u) + '&k=' + encodeURIComponent(KEY) + '&d=' + DIR);
    return true;
  }

  // ---- シェルのページ（common/orient-shell.html が呼ぶ）：同じページを iframe で開き、必要なら 90°まわす
  function shell() {
    const q = new URLSearchParams(root.location.search); let u = q.get('u') || '/';
    if (u.charAt(0) !== '/' || u.charAt(1) === '/') u = '/';
    KEY = q.get('k') || KEY; DIR = q.get('d') === 'ccw' ? 'ccw' : 'cw'; SHELL = true;
    const mode = get();
    if (mode === 'auto') { root.location.replace(u); return; }
    const d = root.document; d.documentElement.dataset.shell = '1';
    d.body.innerHTML = '<div id="pr"></div><iframe id="ko" allow="fullscreen; autoplay; gamepad; clipboard-write; accelerometer; gyroscope"></iframe>';
    shellMain({ mode, dir: DIR, src: u });
  }

  // ---- iframe の中のページ：親から safe-area を受けとる
  let listening = false;
  function listen() {
    if (listening || typeof root.addEventListener !== 'function') return; listening = true;
    root.addEventListener('message', function (e) {
      const d = e.data; if (!d || d.koOrient !== 'insets' || e.source !== root.parent) return;
      const s = root.document.documentElement.style, i = d.ins || {};
      s.setProperty('--kb-test-sat', (+i.t || 0) + 'px'); s.setProperty('--kb-test-sab', (+i.b || 0) + 'px'); s.setProperty('--kb-test-sal', (+i.l || 0) + 'px'); s.setProperty('--kb-test-sar', (+i.r || 0) + 'px');
      root.document.documentElement.dataset.koRot = d.rot ? d.dir : '';
    });
    try { root.parent.postMessage({ koOrient: 'ready' }, '*'); } catch (e) {}
    root.addEventListener('load', function () { try { root.parent.postMessage({ koOrient: 'ready' }, '*'); } catch (e) {} });
  }

  // はじめのタップの中で：Android Chrome は全画面にしてから向きをロック。ほかは何も起きない（失敗はだまって）
  let tried = false;
  function tryLock() {
    const mode = get(); if (mode === 'auto' || tried) return; tried = true;
    try {
      const top = (function () { try { return root.top.document ? root.top : root; } catch (e) { return root; } })();
      const el = top.document.documentElement, o = top.screen && top.screen.orientation;
      if (!o || !o.lock || /iPad|iPhone|iPod/.test(root.navigator.userAgent || '')) return;
      const want = mode === 'land' ? 'landscape' : 'portrait';
      const go = () => { try { const r = o.lock(want); if (r && r.catch) r.catch(function () {}); } catch (e) {} };
      if (!top.document.fullscreenElement && el.requestFullscreen) { const r = el.requestFullscreen(); if (r && r.then) r.then(go, function () {}); else go(); } else go();
    } catch (e) {}
  }

  // シェルを使わない かんたんな使いかた（メディアクエリ・vh は直らない）
  function apply(el, o) {
    o = o || {}; const dir = o.dir === 'ccw' ? 'ccw' : 'cw', mode = o.mode || get();
    const st = el.style, keep = { position: st.position, left: st.left, top: st.top, width: st.width, height: st.height, transform: st.transform, transformOrigin: st.transformOrigin };
    function lay() {
      const W = root.innerWidth, H = root.innerHeight;
      if (needRotate(mode, W, H)) { st.position = 'fixed'; st.left = '0px'; st.top = '0px'; st.width = H + 'px'; st.height = W + 'px'; st.transformOrigin = '0 0'; st.transform = cssRot(dir, W, H); }
      else Object.assign(st, keep);
    }
    root.addEventListener('resize', lay); root.addEventListener('orientationchange', lay); lay();
    return function () { root.removeEventListener('resize', lay); root.removeEventListener('orientationchange', lay); Object.assign(st, keep); };
  }

  function state() { const W = root.innerWidth || 0, H = root.innerHeight || 0, mode = get(); return { mode, shell: SHELL, inFrame: inFrame(), rotated: !!(root.document && root.document.documentElement.dataset.koRot) || (SHELL && needRotate(mode, W, H)), dir: DIR }; }

  return { MODES, boot, shell, get, set, state, tryLock, mapPoint, unmapPoint, needRotate, insetsFor, apply };
});
