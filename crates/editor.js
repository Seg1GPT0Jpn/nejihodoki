// はこはこ運送：ステージエディター（描く → 解けるかしらべる → ためしに遊ぶ → 合言葉で書き出す／読みこむ）。
// 地図の文字と合言葉（CR1:…）は engine.js と同じ。解けるかどうかは engine.js の solve（A*）でしらべる。
(function (root) {
  'use strict';
  const DRAFT = 'kusoge.crates.draft';
  const TOOLS = [
    ['wall', '壁', 'Wall'], ['erase', 'けす', 'Erase'], ['goal', 'ゴール', 'Goal'], ['box', '箱', 'Crate'], ['me', '人', 'Me'], ['ice', '氷', 'Ice'],
    ['a0', '↑', '↑'], ['a1', '→', '→'], ['a2', '↓', '↓'], ['a3', '←', '←'], ['p1', '渦1', 'Pad1'], ['p2', '渦2', 'Pad2'], ['p3', '渦3', 'Pad3'],
  ];
  const ARROW = '^>v<';
  let H = null, el = null, built = false;
  let W = 8, HT = 7, base = [], box = [], me = -1, tool = 'wall', verified = '', last = '', cv = null, ctx = null, cell = 24, painting = false, lastCell = -1, msg = '';
  const E = () => H.E;
  const idx = (x, y) => y * W + x;

  function blank(w, h) { base = new Array(w * h).fill(' '); box = new Array(w * h).fill(0); me = -1; }
  function resize(w, h) {
    const ob = base, obx = box, oW = W, oH = HT, om = me; W = w; HT = h; blank(w, h);
    for (let y = 0; y < Math.min(h, oH); y++) for (let x = 0; x < Math.min(w, oW); x++) { base[idx(x, y)] = ob[y * oW + x]; box[idx(x, y)] = obx[y * oW + x]; }
    if (om >= 0) { const mx = om % oW, my = Math.floor(om / oW); me = mx < w && my < h ? idx(mx, my) : -1; }
  }
  function rows() {
    const out = [];
    for (let y = 0; y < HT; y++) {
      let s = '';
      for (let x = 0; x < W; x++) {
        const i = idx(x, y), b = base[i];
        if (b === '#') { s += '#'; continue; }
        const isB = box[i], isP = me === i;
        s += b === '.' ? (isB ? '*' : isP ? '+' : '.') : b === ' ' ? (isB ? '$' : isP ? '@' : ' ') : b;
      }
      out.push(s);
    }
    return out;
  }
  function load(rs) {
    const h = rs.length, w = Math.max(...rs.map(r => r.length)); W = Math.min(12, w); HT = Math.min(12, h); blank(W, HT);
    for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
      const c = (rs[y] || '')[x] || ' ', i = idx(x, y);
      if (c === '#') base[i] = '#'; else if (c === '.' || c === '*' || c === '+') base[i] = '.'; else if (c === '~' || ARROW.indexOf(c) >= 0 || (c >= '1' && c <= '3')) base[i] = c; else base[i] = ' ';
      if (c === '$' || c === '*') box[i] = 1; if (c === '@' || c === '+') me = i;
    }
    // 外側（人がたどりつけない空白）は壁にそろえて見せる
  }
  const save = () => { try { H.store.set(DRAFT, H.E.encodeLevel(rows())); } catch (e) {} };
  function draft() { try { const c = H.store.get(DRAFT); const r = c && H.E.decodeLevel(c); if (r) return r; } catch (e) {} return null; }

  // 描画用の「かりのレベル」（ふつうの parse は途中の絵だとエラーになるので）
  function pseudo() {
    const w = W + 2, h = HT + 2, n = w * h, t = new Uint8Array(n);
    for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
      const b = base[idx(x, y)], i = (y + 1) * w + x + 1;
      t[i] = b === '#' ? 0 : b === '.' ? 2 : b === '~' ? 3 : ARROW.indexOf(b) >= 0 ? 4 + ARROW.indexOf(b) : (b >= '1' && b <= '3') ? 8 : 1;
    }
    return { w, h, W, H: HT, n, t, special: { ice: true, one: true, pad: true }, goals: [], padTo: null };
  }
  function draw() {
    if (!cv) return; const L = pseudo(), dpr = Math.min(devicePixelRatio || 1, 3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    const pads = {}, c1 = {}; for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) { const b = base[idx(x, y)]; if (b >= '1' && b <= '3') pads[(y + 1) * L.w + x + 1] = +b - 1; void c1; }
    const boxes = []; for (let i = 0; i < box.length; i++) if (box[i]) boxes.push({ x: i % W, y: Math.floor(i / W), i: 0 });
    const pl = me >= 0 ? { x: me % W, y: Math.floor(me / W), dir: 2 } : { x: -3, y: -3, dir: 2 };
    // 壁にする部分も見えるように、まず枠ごと下地を塗る
    H.ART.draw(ctx, L, { p: 0, b: [] }, { s: cell, ox: 0, oy: 0, dark: H.themeIsDark(), t: 0, pl, boxes, pads });
    // 外側の空白は壁
    ctx.strokeStyle = 'rgba(128,128,128,.25)'; ctx.lineWidth = 1; for (let y = 0; y <= HT; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell + .5); ctx.lineTo(W * cell, y * cell + .5); ctx.stroke(); } for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * cell + .5, 0); ctx.lineTo(x * cell + .5, HT * cell); ctx.stroke(); }
  }
  function layout() {
    if (!cv) return; const st = el.querySelector('.edstage'), r = st.getBoundingClientRect();
    cell = Math.floor(Math.max(14, Math.min((r.width - 12) / W, (r.height - 8) / HT, 56))); const dpr = Math.min(devicePixelRatio || 1, 3);
    cv.style.width = cell * W + 'px'; cv.style.height = cell * HT + 'px'; cv.width = Math.round(cell * W * dpr); cv.height = Math.round(cell * HT * dpr); draw();
  }
  function say(t, cls) { const s = el.querySelector('#edst'); s.textContent = t; s.className = cls || ''; }
  function counts() { let g = 0, b = 0; for (let i = 0; i < base.length; i++) { if (base[i] === '.') g++; if (box[i]) b++; } return { g, b }; }
  function friendly(e) {
    const m = String(e && e.message || e), L = H.L;
    if (/exactly one player/.test(m)) return L('人（はこびやさん）をひとり置いてね', 'Place exactly one courier');
    if (/no boxes/.test(m)) return L('箱を置いてね', 'Place at least one crate');
    let r = /boxes \((\d+)\) and goals \((\d+)\)/.exec(m); if (r) return L('箱 ' + r[1] + ' こ・ゴール ' + r[2] + ' こ：同じ数にしてね', 'Crates ' + r[1] + ' / goals ' + r[2] + ': make them equal');
    if (/teleport pad/.test(m)) return L('渦は同じ数字を2つずつ置いてね', 'Each pad number needs exactly two');
    if (/special tile/.test(m)) return L('箱は、ふつうの床かゴールの上に置いてね', 'Crates must start on plain floor or a goal');
    if (/outside/.test(m)) return L('人が行けない場所に、ものがあります', 'Something sits where the courier cannot reach');
    return L('このステージはまだ形がととのっていません', 'This level is not complete yet');
  }
  function check() {
    const rs = rows(); let Lv; try { Lv = E().parse(rs); } catch (e) { say(friendly(e), 'warn'); return null; }
    return Lv;
  }
  let busy = false;
  function solveCheck() {
    const Lv = check(); if (!Lv || busy) return; busy = true; say(H.L('しらべています…', 'Checking…'));
    setTimeout(() => {
      const a = E().solve(Lv, Lv.start, { mode: 'pushes', maxNodes: 300000 });
      if (a.status === 'solved') {
        const b = E().solve(Lv, Lv.start, { mode: 'moves', maxNodes: 300000 });
        verified = E().encodeLevel(rs0());
        say(b.status === 'solved' ? H.L('解けます！ 最短は ' + a.pushes + ' 押し・' + b.moves + ' 歩', 'Solvable! Shortest: ' + a.pushes + ' pushes, ' + b.moves + ' moves') : H.L('解けます！ 最短は ' + a.pushes + ' 押し', 'Solvable! Fewest pushes: ' + a.pushes), 'good');
        if (!H.save.stats.edit || last !== verified) { H.save.stats.edit = (H.save.stats.edit || 0) + 1; H.writeSave(); }
        last = verified; H.sfx('ok');
      } else if (a.status === 'unsolvable') { verified = ''; say(H.L('解けません。置き場所を見直そう', 'No solution. Rethink the layout'), 'warn'); H.sfx('fail'); }
      else { verified = ''; say(H.L('大きすぎて、しらべきれませんでした', 'Too big to check completely'), 'warn'); }
      busy = false; refresh();
    }, 30);
  }
  const rs0 = () => rows();
  function refresh() {
    const c = counts(); el.querySelector('#edInfo').textContent = H.L('箱 ' + c.b + ' ・ゴール ' + c.g + ' ・' + W + '×' + HT, 'Crates ' + c.b + ' · goals ' + c.g + ' · ' + W + '×' + HT) + (verified && verified === H.E.encodeLevel(rows()) ? H.L(' ・確認ずみ', ' · verified') : '');
    el.querySelectorAll('.tl').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === tool)));
    el.querySelector('#edW').textContent = W; el.querySelector('#edH').textContent = HT;
  }
  function paint(i, first) {
    const b = base[i];
    switch (tool) {
      case 'wall': base[i] = '#'; box[i] = 0; if (me === i) me = -1; break;
      case 'erase': base[i] = ' '; box[i] = 0; if (me === i) me = -1; break;
      case 'goal': if (first) base[i] = base[i] === '.' ? ' ' : '.'; else base[i] = '.'; if (base[i] === '.') { /* 箱や人は残してよい */ } break;
      case 'ice': base[i] = '~'; box[i] = 0; if (me === i) { /* 人は氷の上でも歩ける */ } break;
      case 'box': if (!first) return; if (b === '#') return; if (b !== ' ' && b !== '.') base[i] = ' '; box[i] = box[i] ? 0 : 1; if (me === i) me = -1; break;
      case 'me': if (!first) return; if (b === '#') return; me = i; box[i] = 0; break;
      case 'p1': case 'p2': case 'p3': {
        if (!first) return; const ch = tool[1]; if (b === ch) { base[i] = ' '; break; }
        const have = []; for (let k = 0; k < base.length; k++) if (base[k] === ch) have.push(k);
        if (have.length >= 2) base[have[0]] = ' ';
        base[i] = ch; box[i] = 0; break;
      }
      default: if (tool[0] === 'a') { base[i] = ARROW[+tool[1]]; box[i] = 0; }
    }
    if (me >= 0 && base[me] === '#') me = -1;
  }
  function cellAt(e) {
    const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
    return x < 0 || y < 0 || x >= W || y >= HT ? -1 : idx(x, y);
  }
  function listHtml() {
    const l = H.save.ed || [];
    if (!l.length) return '<p>' + H.esc(H.L('まだ保存したステージはありません', 'No saved levels yet')) + '</p>';
    return l.map((c, k) => { const r = H.E.decodeLevel(c) || []; return '<div class="edrow"><span>' + (k + 1) + '. ' + (r[0] ? r[0].length : 0) + '×' + r.length + '</span><button class="edb" data-open="' + k + '" type="button">' + H.esc(H.L('ひらく', 'Open')) + '</button><button class="edb" data-del="' + k + '" type="button">' + H.esc(H.L('消す', 'Delete')) + '</button></div>'; }).join('');
  }
  function build() {
    const L = H.L, esc = H.esc;
    el.innerHTML = '<style>' +
      '#editor .edh{flex:none;display:flex;align-items:center;gap:6px;padding:4px 6px}#editor .edh b{flex:1;min-width:0;font:400 16px var(--kb-font-display);color:var(--kb-accent-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media (max-width:480px){#editor .edh b{display:none}#editor .edh .edsz:first-of-type{margin-left:auto}}' +
      '#editor .edtools{flex:none;display:flex;flex-wrap:wrap;gap:4px;padding:2px 8px}#editor .tl{min-width:44px;min-height:44px;padding:2px 4px;border-radius:12px;border:1px solid var(--kb-line);background:var(--cr-key);color:var(--kb-ink);font:800 12.5px var(--kb-font-body);cursor:pointer;flex:1 1 44px;white-space:nowrap}' +
      '#editor .tl[aria-pressed="true"]{box-shadow:inset 0 0 0 2px var(--kb-accent);background:var(--kb-surface)}' +
      '#editor .edstage{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:4px}#editor canvas{display:block;touch-action:none;border-radius:8px;box-shadow:0 3px 14px rgba(0,0,0,.35)}' +
      '#editor .edsz{display:flex;align-items:center;gap:3px;font-size:12px;font-weight:800;color:var(--kb-dim);white-space:nowrap}#editor .edsz button{width:40px;height:40px;border-radius:10px;border:1px solid var(--kb-line);background:var(--cr-key);color:var(--kb-ink);font:800 16px var(--kb-font-body);cursor:pointer;padding:0}' +
      '#editor #edInfo{flex:none;text-align:center;font-size:11.5px;color:var(--kb-dim);padding:2px 8px}#editor #edst{flex:none;min-height:30px;margin:0 8px;padding:4px 10px;border-radius:12px;background:var(--cr-panel);border:1px solid var(--kb-line);font-size:12.5px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center}' +
      '#editor #edst.warn{color:var(--cr-bad);border-color:var(--cr-bad)}#editor #edst.good{border-color:var(--cr-good)}' +
      '#editor .edacts{flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:4px 8px 8px}#editor .edacts .act{min-height:44px;font-size:12.5px;padding:2px 4px}' +
      '#editor .edpanel{position:absolute;inset:0;z-index:5;background:var(--kb-scrim);display:flex;align-items:center;justify-content:center;padding:12px}#editor .edpanel .panel{max-height:100%}' +
      '#editor textarea{width:100%;box-sizing:border-box;min-height:90px;border-radius:12px;border:1px solid var(--kb-line);background:var(--kb-bg);color:var(--kb-ink);font:700 13px ui-monospace,Menlo,Consolas,monospace;padding:8px;user-select:text;-webkit-user-select:text}' +
      '#editor .edrow{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:13px;font-weight:800;text-align:left}#editor .edrow span{flex:1}#editor .edb{min-height:40px;min-width:60px;border-radius:10px;border:1px solid var(--kb-line);background:var(--cr-key);color:var(--kb-ink);font:800 13px var(--kb-font-body);cursor:pointer}' +
      '</style>' +
      '<div class="edh"><button class="icon" id="edBack" type="button" aria-label="' + esc(L('もどる', 'Back')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><b>' + esc(L('ステージをつくる', 'Level editor')) + '</b>' +
      '<span class="edsz">' + esc(L('よこ', 'W')) + ' <button id="edWm" type="button" aria-label="' + esc(L('よこをへらす', 'Narrower')) + '">−</button><span id="edW">8</span><button id="edWp" type="button" aria-label="' + esc(L('よこをふやす', 'Wider')) + '">+</button></span>' +
      '<span class="edsz">' + esc(L('たて', 'H')) + ' <button id="edHm" type="button" aria-label="' + esc(L('たてをへらす', 'Shorter')) + '">−</button><span id="edH">7</span><button id="edHp" type="button" aria-label="' + esc(L('たてをふやす', 'Taller')) + '">+</button></span></div>' +
      '<div class="edtools" role="group" aria-label="' + esc(L('道具', 'Tools')) + '">' + TOOLS.map(t => '<button class="tl" type="button" data-t="' + t[0] + '" aria-pressed="false">' + esc(L(t[1], t[2])) + '</button>').join('') + '</div>' +
      '<div class="edstage"><canvas id="edcv" aria-label="' + esc(L('エディターの盤', 'Editor board')) + '"></canvas></div>' +
      '<div id="edInfo"></div><div id="edst" role="status" aria-live="polite"></div>' +
      '<div class="edacts"><button class="act" id="edSolve" type="button">' + esc(L('解けるか調べる', 'Check')) + '</button><button class="act" id="edPlay" type="button">' + esc(L('ためしに遊ぶ', 'Test play')) + '</button><button class="act" id="edCode" type="button">' + esc(L('合言葉', 'Share code')) + '</button>' +
      '<button class="act" id="edSave" type="button">' + esc(L('保存', 'Save')) + '</button><button class="act" id="edList" type="button">' + esc(L('保存した一覧', 'Saved')) + '</button><button class="act" id="edClear" type="button">' + esc(L('まっさらに', 'Clear')) + '</button></div>';
    cv = el.querySelector('#edcv'); ctx = cv.getContext('2d');
    el.querySelectorAll('.tl').forEach(b => { b.onclick = () => { tool = b.dataset.t; refresh(); }; });
    const chg = (dw, dh) => () => { const w = Math.max(4, Math.min(12, W + dw)), h = Math.max(4, Math.min(12, HT + dh)); resize(w, h); verified = ''; save(); refresh(); layout(); };
    el.querySelector('#edWm').onclick = chg(-1, 0); el.querySelector('#edWp').onclick = chg(1, 0); el.querySelector('#edHm').onclick = chg(0, -1); el.querySelector('#edHp').onclick = chg(0, 1);
    cv.addEventListener('pointerdown', e => { e.preventDefault(); const i = cellAt(e); if (i < 0) return; painting = true; lastCell = i; try { cv.setPointerCapture(e.pointerId); } catch (x) {} paint(i, true); verified = ''; save(); refresh(); draw(); });
    cv.addEventListener('pointermove', e => { if (!painting) return; const i = cellAt(e); if (i < 0 || i === lastCell) return; lastCell = i; paint(i, false); save(); refresh(); draw(); });
    const up = () => { painting = false; lastCell = -1; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    el.querySelector('#edBack').onclick = () => { save(); H.onClose(); };
    el.querySelector('#edSolve').onclick = solveCheck;
    el.querySelector('#edPlay').onclick = () => { const Lv = check(); if (!Lv) return; save(); H.startTest(rows()); };
    el.querySelector('#edClear').onclick = () => { blank(W, HT); verified = ''; save(); refresh(); draw(); say(''); };
    el.querySelector('#edSave').onclick = () => {
      if (!check()) return; const c = H.E.encodeLevel(rows()), l = H.save.ed = H.save.ed || [];
      if (l.indexOf(c) >= 0) { say(L('もう保存されています', 'Already saved')); return; }
      if (l.length >= 12) { say(L('保存は12こまで。一覧から消してね', 'You can save up to 12. Delete one first'), 'warn'); return; }
      l.push(c); H.writeSave(); say(L('保存しました（' + l.length + '/12）', 'Saved (' + l.length + '/12)'), 'good');
    };
    const panel = html => { const p = document.createElement('div'); p.className = 'edpanel'; p.innerHTML = '<div class="panel">' + html + '</div>'; el.appendChild(p); return p; };
    el.querySelector('#edList').onclick = () => {
      const p = panel('<h2>' + esc(L('保存した一覧', 'Saved levels')) + '</h2><div class="scroll" id="edLs">' + listHtml() + '</div><button class="btn sub" id="edLx" type="button">' + esc(L('とじる', 'Close')) + '</button>');
      const wire = () => { p.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => { const r = H.E.decodeLevel(H.save.ed[+b.dataset.open]); if (r) { load(r); verified = ''; save(); refresh(); layout(); p.remove(); } }; });
        p.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { H.save.ed.splice(+b.dataset.del, 1); H.writeSave(); p.querySelector('#edLs').innerHTML = listHtml(); wire(); }; }); };
      wire(); p.querySelector('#edLx').onclick = () => p.remove();
    };
    el.querySelector('#edCode').onclick = () => {
      const code = H.E.encodeLevel(rows()), ok = !!check();
      const p = panel('<h2>' + esc(L('合言葉', 'Share code')) + '</h2><p>' + esc(L('書き出した合言葉は、読みこみで同じステージに戻せます。', 'Paste a code into the box below to load that level.')) + '</p><div class="scroll"><textarea id="edTa" aria-label="' + esc(L('合言葉', 'Code')) + '" spellcheck="false">' + esc(ok ? code : '') + '</textarea><p class="err" id="edErr" role="alert"></p></div>' +
        '<div class="row2"><button class="btn sub" id="edCp" type="button">' + esc(L('コピー', 'Copy')) + '</button><button class="btn" id="edLd" type="button">' + esc(L('読みこむ', 'Load')) + '</button></div><button class="btn link" id="edCx" type="button">' + esc(L('とじる', 'Close')) + '</button>');
      const ta = p.querySelector('#edTa'); if (!ok) p.querySelector('#edErr').textContent = L('まだ完成していないので、書き出せません。読みこみはできます。', 'Not complete yet, so nothing to export. You can still paste a code to load.');
      p.querySelector('#edCp').onclick = () => { try { navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); try { document.execCommand('copy'); } catch (x) {} } H.toast(L('コピーしました', 'Copied')); };
      p.querySelector('#edLd').onclick = () => { const r = H.E.decodeLevel(ta.value); if (!r) { p.querySelector('#edErr').textContent = L('合言葉が読めません（CR1: で始まる形）', 'That code cannot be read (it starts with CR1:)'); return; } load(r); verified = ''; save(); refresh(); layout(); p.remove(); say(L('読みこみました', 'Loaded'), 'good'); };
      p.querySelector('#edCx').onclick = () => p.remove();
    };
    window.addEventListener('resize', () => { if (!el.hidden) layout(); });
    built = true;
  }
  function open(host) {
    H = host; el = document.getElementById('editor');
    if (!built || el.dataset.lang !== document.documentElement.lang) { built = false; build(); el.dataset.lang = document.documentElement.lang; }
    const d = draft(); if (d) load(d); else { W = 8; HT = 7; blank(W, HT); }
    el.hidden = false; say(''); refresh(); layout();
  }
  function hide() { if (el) el.hidden = true; }
  // ためしに遊んでクリアしたとき（index.html から）
  function testDone(S) {
    verified = H.E.encodeLevel(rows()); H.save.stats.edit = (H.save.stats.edit || 0) + (last === verified ? 0 : 1); last = verified; H.writeSave();
    el.hidden = false; refresh(); layout(); say(H.L('クリアできました！ このステージは遊べます（' + S.result.moves + '手）', 'You cleared it! This level is playable (' + S.result.moves + ' moves)'), 'good'); H.sfx('win');
  }
  const API = { open, hide, testDone, get state() { return { W, H: HT, rows: rows(), verified, tool }; }, _load: r => { load(r); }, _rows: rows };
  root.CratesEditor = API;
})(typeof window !== 'undefined' ? window : globalThis);
