// 画面の中を調べる補助（page.evaluate の中で動く）
//  - 見えている操作できる要素が、画面の中にあるか、スクロールできる入れ物の中で届くか
//  - 開いているオーバーレイの主なボタンが、スクロールしなくても見えていて、押せるか
//  - 横スクロールが出ていないか
//  - 英語のときに日本語が残っていないか
'use strict';

function layoutProbe() {
  const W = document.documentElement.clientWidth || innerWidth, H = innerHeight, de = document.documentElement, body = document.body;
  const TOL = 1;
  const out = { W, H, hscroll: 0, docScroll: false, offscreen: [], primary: [], small: [], overlays: 0, controls: 0 };
  out.hscroll = Math.max(de.scrollWidth, body ? body.scrollWidth : 0) - de.clientWidth;
  const ov = el => getComputedStyle(el);
  const docScrollY = de.scrollHeight > H + TOL && ov(de).overflowY !== 'hidden' && (!body || ov(body).overflowY !== 'hidden');
  out.docScroll = docScrollY;
  const desc = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    const t = (el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return t ? s + ' "' + t + '"' : s;
  };
  const visible = el => {
    if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    // overflow:hidden の親の外に完全に出ているもの（しまってあるパネル）は見えていない
    for (let p = el.parentElement; p && p !== body && p !== de; p = p.parentElement) {
      const cs = ov(p);
      if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) {
        const q = p.getBoundingClientRect();
        if (r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom) return false;
      }
    }
    return true;
  };
  const scroller = (el, axis) => {
    for (let p = el.parentElement; p && p !== body && p !== de; p = p.parentElement) {
      const cs = ov(p);
      const o = axis === 'y' ? cs.overflowY : cs.overflowX;
      const can = axis === 'y' ? p.scrollHeight > p.clientHeight + TOL : p.scrollWidth > p.clientWidth + TOL;
      if (/auto|scroll|overlay/.test(o) && can) return p;
    }
    return null;
  };
  const inView = r => r.left >= -TOL && r.top >= -TOL && r.right <= W + TOL && r.bottom <= H + TOL;
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [tabindex]:not([tabindex="-1"])';
  const controls = [...document.querySelectorAll(SEL)].filter(el => !el.disabled && visible(el));
  out.controls = controls.length;
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (inView(r)) continue;
    // 縦にはみ出し：ページ全体か、入れ物がスクロールできれば届く
    const yOut = r.top < -TOL || r.bottom > H + TOL, xOut = r.left < -TOL || r.right > W + TOL;
    let ok = true, why = [];
    if (yOut) {
      const sc = scroller(el, 'y');
      const fixedAnc = (() => { for (let p = el; p && p !== body; p = p.parentElement) if (ov(p).position === 'fixed') return p; return null; })();
      if (sc) { const q = sc.getBoundingClientRect(); if (q.top < -TOL || q.bottom > H + TOL + 1 && !docScrollY) { ok = false; why.push('scroll box itself off-screen'); } }
      else if (!(docScrollY && !fixedAnc)) { ok = false; why.push(r.top < 0 ? 'above top' : 'below bottom'); }
    }
    if (xOut) { if (!scroller(el, 'x')) { ok = false; why.push(r.left < 0 ? 'left of screen' : 'right of screen'); } }
    if (!ok) out.offscreen.push(desc(el) + ' [' + why.join(',') + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ']');
  }
  // 小さすぎる操作（44px 未満）
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 44 && el.tagName !== 'A' || (el.tagName === 'A' && r.height < 32)) out.small.push(desc(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  // 開いているオーバーレイ：画面の多くを覆う fixed/absolute の要素で、ボタンを含み、いちばん上にあるもの
  const cands = [...document.querySelectorAll('body *')].filter(el => {
    const cs = ov(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < W * H * 0.5) return false;
    if (!visible(el)) return false;
    // ゲームの土台（#app など）ではなく、オーバーレイらしいもの
    const name = (el.id + ' ' + el.className + ' ' + (el.getAttribute('role') || '')).toString();
    const looks = /overlay|modal|dialog|sheet|popup|backdrop|screen/i.test(name) || /(^|\s)(ov|scr)([A-Z]|\s|$)/.test(name) || el.getAttribute('aria-modal') === 'true';
    if (!looks) return false;
    return !!el.querySelector('button, a.btn, [role=button]');
  });
  const tops = cands.filter(el => !cands.some(o => o !== el && el.contains(o)));
  for (const o of tops) {
    const r = o.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(W - 1, Math.max(0, r.left + r.width / 2)), Math.min(H - 1, Math.max(0, r.top + r.height / 2)));
    if (!hit || !(o === hit || o.contains(hit))) continue; // 下に隠れている
    out.overlays++;
    const btns = [...o.querySelectorAll('button, a.btn, [role=button]')].filter(b => !b.disabled && visible(b));
    const isSecondary = b => /\b(sub|ghost|close|x|icon|small|link|secondary|ibtn)\b/.test(b.className) || /close|閉じ|とじる/i.test(b.getAttribute('aria-label') || '');
    // 主なボタン：補助のボタン（.sub など）と、対戦の入口（versus.js の .kvs-entry）以外の最初のもの。
    // ないとき（「タップでスタート」のオーバーレイ）は調べない
    const prim = btns.find(b => !isSecondary(b) && !b.classList.contains('kvs-entry'));
    if (!prim) { out.primary.push({ overlay: desc(o).slice(0, 40), button: '(tap anywhere)', problems: [], h: 99, w: 99 }); continue; }
    const pr = prim.getBoundingClientRect();
    const cx = pr.left + pr.width / 2, cy = pr.top + pr.height / 2;
    const problems = [];
    if (!inView(pr)) problems.push('not fully on screen [' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round).join(',') + ']');
    else { const h = document.elementFromPoint(cx, cy); if (!h || !(h === prim || prim.contains(h))) problems.push('covered by ' + (h ? desc(h) : 'nothing')); }
    out.primary.push({ overlay: desc(o).slice(0, 40), button: desc(prim), problems, h: Math.round(pr.height), w: Math.round(pr.width) });
  }
  return out;
}

// 日本語の文字（ひらがな・カタカナ・漢字）が残っているか。visibleOnly=false のときは、隠れている要素や属性も見る
function jpScan(visibleOnly) {
  const JP = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
  // 英語でもわざと残すもの：言語の選択肢と、「言語 / Language」のような両方の言語で書いた見出し
  const ALLOW = [/^日本語$/, /Language/i];
  const found = new Map();
  const add = (s, where) => { s = s.replace(/\s+/g, ' ').trim(); if (!s || !JP.test(s) || ALLOW.some(re => re.test(s))) return; if (!found.has(s)) found.set(s, where); };
  const skipTag = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/;
  const seen = el => !visibleOnly || (el.checkVisibility && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    const p = n.parentElement; if (!p || skipTag.test(p.tagName)) continue;
    if (p.closest('[lang="ja"], option:not(:checked), [data-kbt-allow-ja]')) continue;
    if (!seen(p)) continue;
    if (visibleOnly) { const r = p.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue; }
    add(n.nodeValue, p.id ? '#' + p.id : p.tagName.toLowerCase());
  }
  for (const el of document.querySelectorAll('[placeholder], [title], [aria-label], [alt], input[type=button][value], input[type=submit][value]')) {
    if (el.closest('[lang="ja"], [data-kbt-allow-ja]') || !seen(el)) continue;
    for (const a of ['placeholder', 'title', 'aria-label', 'alt', 'value']) { const v = el.getAttribute(a); if (v) add(v, (el.id ? '#' + el.id : el.tagName.toLowerCase()) + '@' + a); }
  }
  if (!visibleOnly) add(document.title, 'document.title');
  return [...found.entries()].map(([s, w]) => w + ': ' + s.slice(0, 60));
}

module.exports = { layoutProbe, jpScan };
