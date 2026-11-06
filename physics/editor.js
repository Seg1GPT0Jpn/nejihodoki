// ころころ工房 — the stage editor (「つくる」). Pieces are placed, moved, turned and resized on the same board with the same
// gestures as the game: drag from the palette (or tap it), drag a piece to move it, the round handle or two fingers to turn it,
// the floating tools for ⟲ ⟳, size, type, copy and 🗑, undo. The level itself is a "def" of physics/codec.js; the page
// (index.html) owns the test-play, the share codes and the list of my levels. This file only edits one def.
(function (root) {
  'use strict';
  var KIND_NAME = { ball: '玉', goal: 'かご', wall: '壁', board: '板', ice: '氷', rubber: 'ゴム', glass: 'ガラス', gear: '歯車', rope: 'ロープ', spin: '羽根車', crate: '木箱',
    spring: 'ばね台', fan: '送風機', belt: 'ベルト', magnet: '磁石', seesaw: 'シーソー', weight: 'おもり' };
  // the palette: id → the new piece
  var PALETTE = [
    { id: 'ball', it: { k: 'ball', b: 0 } },
    { id: 'board', it: { k: 'wall', w: 3, h: 0.24, a: 0 } },
    { id: 'wall', it: { k: 'wall', w: 3, h: 0.4, a: 90 } },
    { id: 'ice', it: { k: 'ice', w: 3, h: 0.3, a: 0 } },
    { id: 'rubber', it: { k: 'rubber', w: 2, h: 0.3, a: 0 } },
    { id: 'glass', it: { k: 'glass', w: 2, h: 2 } },
    { id: 'gear', it: { k: 'gear' } },
    { id: 'rope', it: { k: 'rope', w: 2, a: 0 } },
    { id: 'spin', it: { k: 'spin', w: 3, a: 0, s: 0 } },
    { id: 'crate', it: { k: 'crate', w: 0.8, a: 0 } },
    { id: 'spring', it: { k: 'spring', a: 0 } }, { id: 'fan', it: { k: 'fan', a: 0 } }, { id: 'belt', it: { k: 'belt', a: 0 } },
    { id: 'magnet', it: { k: 'magnet', a: 0 } }, { id: 'seesaw', it: { k: 'seesaw', a: 0 } }, { id: 'weight', it: { k: 'weight' } },
  ];
  var ROT = { wall: 1, ice: 1, rubber: 1, spin: 1, crate: 1, rope: 1, spring: 1, fan: 1, belt: 1, magnet: 1, seesaw: 1 };
  var SZW = { wall: 1, ice: 1, rubber: 1, glass: 1, spin: 1, crate: 1, rope: 1 }, SZH = { wall: 1, ice: 1, rubber: 1, glass: 1 };
  var TEMPLATE = { title: '', items: [{ k: 'wall', x: 6, y: 0.2, w: 12, h: 0.4, a: 0 }, { k: 'ball', x: 1.5, y: 10.5, b: 0 }, { k: 'goal', x: 10.5, y: 0.4 }], parts: { plank: 2 }, par: 2 };

  function create(H) {
    var PE = H.PE, ART = H.ART, C = H.C, T = H.T, $ = H.$;
    var items = [], meta = { title: '', parts: {}, par: 1 }, sel = -1, undo = [], drag = null, active = false, seq = 0, level = null;
    var pointers = new Map();
    var round2 = function (v) { return Math.round(v * 100) / 100; };
    var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    var snapStep = function () { return H.grid() ? 0.25 : 0.05; };
    function snapXY(p) { var s = snapStep(); p.x = round2(Math.max(0, Math.min(PE.BW, Math.round(p.x / s) * s))); p.y = round2(Math.max(0, Math.min(PE.BH, Math.round(p.y / s) * s))); return p; }
    function snapAng(a) { a = ((Math.round(a) % 360) + 540) % 360 - 180; return H.grid() ? Math.round(a / 15) * 15 : a; }
    function count(k) { var n = 0; for (var i = 0; i < items.length; i++) if (items[i].k === k) n++; return n; }
    var CAP = { ball: C.LIMITS.balls, gear: C.LIMITS.gears, glass: C.LIMITS.glass, goal: 1 };
    function left(k) { var room = C.LIMITS.items - items.length; return CAP[k] != null ? Math.min(room, CAP[k] - count(k)) : room; }
    function nameOf(it) { return it.k === 'wall' ? (it.h <= 0.3 ? KIND_NAME.board : KIND_NAME.wall) : KIND_NAME[it.k]; }

    // ------------------------------------------------------------------ the def and the scene
    function def() { return C.normalize({ title: meta.title, items: items, parts: meta.parts, par: meta.par }); }
    function rebuild(extra) {
      var d = C.normalize({ title: meta.title, items: extra ? items.concat([extra]) : items, parts: meta.parts, par: meta.par });
      level = C.compile(d, 'edit' + (++seq));
      H.setScene(PE.build(level, []));
      H.redraw(); placeTools(); renderPalette();
    }
    function changed() { rebuild(); H.onChange(def()); }
    function snapshot() { undo.push(JSON.stringify({ items: items, meta: meta })); if (undo.length > 80) undo.shift(); }
    function restore(s) { var o = JSON.parse(s); items = o.items; meta = o.meta; }

    // ------------------------------------------------------------------ shapes of a piece (hit test, outline)
    function bodies(it) {
      var out = [];
      if (it.k === 'ball') out.push({ x: it.x, y: it.y, r: 0.3 });
      else if (it.k === 'goal') PE.goalShapes(it).forEach(function (o) { out.push(o); });
      else if (it.k === 'gear') out.push({ x: it.x, y: it.y, r: PE.GEAR_R });
      else if (it.k === 'glass') out.push({ x: it.x, y: it.y, wd: it.w, ht: it.h });
      else {
        var L = C.compile({ title: '', items: [C.normItem(it)], parts: {}, par: 1 }, 'probe');
        L.objs.forEach(function (ob) { if (ob[0] !== 'rope') PE.objShapes(ob).forEach(function (o) { out.push(o); }); });
        if (it.k === 'rope') out.push({ x: it.x, y: it.y, r: 0.22 });
      }
      return out.map(function (o) { return new PE.Body(o, -1); });
    }
    function hit(x, y) {
      var probe = new PE.Body({ x: x, y: y, r: 0.25 }, -1);
      for (var pass = 0; pass < 2; pass++) {
        for (var i = items.length - 1; i >= 0; i--) {
          if ((items[i].k === 'glass') !== (pass === 1)) continue;
          var bs = bodies(items[i]);
          for (var k = 0; k < bs.length; k++) if (PE.overlaps(probe, bs[k], -0.001)) return i;
        }
      }
      return -1;
    }
    function halfLen(it) { return it.w != null && it.k !== 'rope' ? (it.k === 'crate' ? it.w * 0.7 : it.w / 2) : PE.PARTS[it.k] ? (PE.PARTS[it.k].w || 1) / 2 : 0.5; }
    // the round handle: beyond the right end along the piece (the left end when that is off the board); a rope's is past its crate
    function handlePos(it) {
      var r = it.a * Math.PI / 180;
      if (it.k === 'rope') { var d0 = it.w + 0.75; return { x: it.x + Math.sin(r) * d0, y: it.y - Math.cos(r) * d0, flip: false }; }
      var d = halfLen(it) + 0.75, x = it.x + Math.cos(r) * d, y = it.y + Math.sin(r) * d;
      if (x < 0.2 || x > PE.BW - 0.2 || y < 0.2 || y > PE.BH - 0.2) return { x: it.x - Math.cos(r) * d, y: it.y - Math.sin(r) * d, flip: true };
      return { x: x, y: y, flip: false };
    }

    // ------------------------------------------------------------------ drawing on top of the scene
    function draw(ctx) {
      if (!active) return;
      var s = H.view.s;
      ctx.save();
      if (sel >= 0 && items[sel]) {
        var it = items[sel];
        ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3; ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 8;
        if (it.k === 'glass') ctx.setLineDash([6, 4]);
        bodies(it).forEach(function (b) {
          ctx.beginPath();
          if (b.circle) ctx.arc(H.wx(b.x), H.wy(b.y), b.r * s + 3, 0, 6.283);
          else { for (var k = 0; k < b.n; k++) { var X = H.wx(b.wv[2 * k]), Y = H.wy(b.wv[2 * k + 1]); if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.closePath(); }
          ctx.stroke();
        });
        ctx.setLineDash([]); ctx.shadowBlur = 0;
        if (ROT[it.k]) {
          var h = handlePos(it);
          ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(H.wx(it.x), H.wy(it.y)); ctx.lineTo(H.wx(h.x), H.wy(h.y)); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#ffd36b'; ctx.strokeStyle = '#5a3a0c';
          ctx.beginPath(); ctx.arc(H.wx(h.x), H.wy(h.y), Math.max(10, s * 0.32), 0, 6.283); ctx.fill(); ctx.stroke();
          ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(H.wx(h.x), H.wy(h.y), Math.max(5, s * 0.16), -2.4, 1.2); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ------------------------------------------------------------------ palette (the tray of the editor)
    var iconCache = {};
    function icon(id) {
      var it = null; PALETTE.forEach(function (p) { if (p.id === id) it = p.it; });
      if (PE.PARTS[it.k]) return ART.partIcon(it.k, 48);
      var key = id + ':' + H.dark(); if (iconCache[key]) return iconCache[key];
      var c = document.createElement('canvas'); c.width = 96; c.height = 96;
      var x = c.getContext('2d'); x.scale(2, 2); x.lineJoin = 'round';
      var box = function (w, h, a, fill, line) { x.save(); x.translate(24, 24); x.rotate(a); x.fillStyle = fill; x.strokeStyle = line; x.lineWidth = 1.6; x.beginPath(); x.rect(-w / 2, -h / 2, w, h); x.fill(); x.stroke(); x.restore(); };
      switch (id) {
        case 'ball': x.fillStyle = '#e86a8a'; x.strokeStyle = '#7a2038'; x.lineWidth = 1.6; x.beginPath(); x.arc(24, 24, 12, 0, 6.283); x.fill(); x.stroke();
          x.strokeStyle = '#b8385a'; x.beginPath(); x.moveTo(15, 19); x.quadraticCurveTo(24, 26, 33, 18); x.moveTo(14, 28); x.quadraticCurveTo(24, 22, 34, 29); x.stroke(); break;
        case 'board': box(36, 6, -0.2, '#e3b475', '#3a210c'); break;
        case 'wall': box(8, 34, 0, '#a8743f', '#2a1708'); break;
        case 'ice': box(36, 8, 0, '#bfe6fb', '#5c9bc2'); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(10, 22); x.lineTo(18, 21); x.stroke(); break;
        case 'rubber': box(32, 8, 0, '#d0453a', '#6a1a12'); break;
        case 'glass': x.fillStyle = 'rgba(120,180,220,.35)'; x.fillRect(8, 8, 32, 32); x.strokeStyle = '#4a8cbc'; x.lineWidth = 1.5; x.setLineDash([4, 3]); x.strokeRect(8.5, 8.5, 31, 31); x.setLineDash([]);
          x.beginPath(); for (var k = 0; k < 4; k++) { x.moveTo(8 + k * 10, 40); x.lineTo(18 + k * 10, 8); } x.stroke(); break;
        case 'gear': if (ART.drawGear) ART.drawGear(x, 24, 24, 12, 0.3, 1); break;
        case 'rope': x.strokeStyle = '#8a6a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(24, 6); x.lineTo(24, 26); x.stroke(); x.fillStyle = '#d8a83a'; x.beginPath(); x.arc(24, 6, 3, 0, 6.283); x.fill();
          box(16, 16, 0, '#b07a42', '#3a210c'); x.save(); x.translate(0, 10); box(16, 16, 0, '#b07a42', '#3a210c'); x.restore(); break;
        case 'spin': box(36, 6, 0.5, '#c99554', '#3a210c'); box(36, 6, -0.5 + 1.571, '#c99554', '#3a210c'); x.fillStyle = '#d8a83a'; x.beginPath(); x.arc(24, 24, 4, 0, 6.283); x.fill(); break;
        case 'crate': box(26, 26, 0, '#b07a42', '#3a210c'); x.strokeStyle = '#3a210c'; x.beginPath(); x.moveTo(12, 12); x.lineTo(36, 36); x.moveTo(36, 12); x.lineTo(12, 36); x.stroke(); break;
      }
      return (iconCache[key] = c.toDataURL());
    }
    var palKey = '';
    function renderPalette() {
      var box = $('mtray'); if (!box) return;
      var counts = PALETTE.map(function (p) { return left(p.it.k); });
      var key = counts.join() + '|' + H.lang() + '|' + H.dark();
      if (key === palKey) return; palKey = key;
      box.innerHTML = '';
      PALETTE.forEach(function (p, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'tp'; b.dataset.piece = p.id;
        var n = counts[i], capped = CAP[p.it.k] != null;
        var img = document.createElement('img'); img.alt = ''; img.src = icon(p.id); b.appendChild(img);
        if (capped) { var bb = document.createElement('b'); bb.textContent = String(Math.max(0, n)); b.appendChild(bb); }
        var sp = document.createElement('span'); sp.textContent = T(KIND_NAME[p.id] || KIND_NAME[p.it.k]); b.appendChild(sp);
        b.setAttribute('aria-label', T(KIND_NAME[p.id] || KIND_NAME[p.it.k]));
        b.disabled = n <= 0;
        b.addEventListener('pointerdown', function (e) { palDown(e, p, b); });
        box.appendChild(b);
      });
    }

    // ------------------------------------------------------------------ the floating tools of the selected piece
    function placeTools() {
      var pt = $('mtools'); if (!pt) return;
      if (!active || sel < 0 || !items[sel] || (drag && drag.kind !== 'none')) { pt.hidden = true; return; }
      var it = items[sel], k = it.k;
      pt.hidden = false;
      var show = function (id, on) { $(id).hidden = !on; };
      show('mRotL', ROT[k]); show('mRotR', ROT[k]);
      show('mWm', SZW[k]); show('mWp', SZW[k]); show('mHm', SZH[k]); show('mHp', SZH[k]);
      show('mKind', k === 'ball' || k === 'spin');
      show('mDup', k !== 'goal'); show('mDel', k !== 'goal' && !(k === 'ball' && count('ball') <= 1));
      $('mDup').disabled = left(k) <= 0;
      if (k === 'ball') { $('mKind').textContent = it.b ? T('毛糸') : T('鈴'); $('mKind').setAttribute('aria-label', T('玉の種類')); }
      if (k === 'spin') { $('mKind').textContent = it.s ? '⟳' : '⟲'; $('mKind').setAttribute('aria-label', T('回る向き')); }
      var v = H.view, w = pt.offsetWidth || 200, h = pt.offsetHeight || 50;
      var px = v.left + H.wx(it.x), py = v.top + H.wy(it.y);
      var ext = (k === 'glass' ? it.h / 2 : k === 'goal' ? 0.9 : k === 'rope' ? 0.4 : 0.6) * v.s + 18;
      var y = py - ext - h; if (y < v.top + 4) y = py + ext + (k === 'rope' ? it.w * v.s : 0);
      var x = px - w / 2; x = Math.max(v.left + 4, Math.min(v.left + v.W - w - 4, x));
      y = Math.max(v.top + 4, Math.min(v.top + v.H - h - 4, y));
      pt.style.left = Math.round(x) + 'px'; pt.style.top = Math.round(y) + 'px';
    }
    function edit(fn) { if (sel < 0 || !items[sel]) return; var before = JSON.stringify({ items: items, meta: meta }); var it = clone(items[sel]); fn(it); it = C.normItem(it); if (JSON.stringify(it) === JSON.stringify(items[sel])) { H.sfx('error'); return; } undo.push(before); items[sel] = it; H.sfx('tap'); changed(); }
    function rotate(d) { edit(function (it) { if (ROT[it.k]) it.a = snapAng(it.a + d); }); }
    function size(f, d) { edit(function (it) { it[f] = round2(it[f] + d); }); }
    function toggle() { edit(function (it) { if (it.k === 'ball') it.b = it.b ? 0 : 1; else if (it.k === 'spin') it.s = it.s ? 0 : 1; }); }
    function remove(i) {
      var it = items[i]; if (!it || it.k === 'goal' || (it.k === 'ball' && count('ball') <= 1)) { H.sfx('error'); return; }
      snapshot(); items.splice(i, 1); sel = -1; H.sfx('pop'); changed();
    }
    function dup() {
      var it = items[sel]; if (!it || it.k === 'goal' || left(it.k) <= 0) { H.sfx('error'); return; }
      snapshot(); var n = clone(it); n.x = round2(Math.min(PE.BW, n.x + 0.5)); n.y = round2(Math.max(0, n.y - 0.5)); items.push(n); sel = items.length - 1; H.sfx('drop'); changed();
    }
    function doUndo() { if (!undo.length) return false; restore(undo.pop()); sel = -1; H.sfx('tap'); changed(); return true; }
    function bind(id, fn) { var b = $(id); if (b) b.addEventListener('click', function () { if (active) fn(); }); }
    bind('mRotL', function () { rotate(15); }); bind('mRotR', function () { rotate(-15); });
    bind('mWm', function () { size('w', -0.25); }); bind('mWp', function () { size('w', 0.25); });
    bind('mHm', function () { size('h', -0.1); }); bind('mHp', function () { size('h', 0.1); });
    bind('mKind', toggle); bind('mDup', dup); bind('mDel', function () { remove(sel); });

    // ------------------------------------------------------------------ pointer input on the board
    var cv = H.cv;
    function evWorld(e) { var r = cv.getBoundingClientRect(); return H.toWorld(e.clientX - r.left, e.clientY - r.top); }
    cv.addEventListener('pointerdown', function (e) {
      if (!active) return;
      H.ctx();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      var w = evWorld(e);
      if (pointers.size === 2 && sel >= 0 && ROT[items[sel].k]) {
        var ps = Array.from(pointers.values());
        drag = { kind: 'pinch', ang0: Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x), a0: items[sel].a, snap: JSON.stringify({ items: items, meta: meta }) };
        placeTools(); return;
      }
      if (pointers.size > 1) return;
      if (sel >= 0 && items[sel] && ROT[items[sel].k]) {
        var h = handlePos(items[sel]);
        if (Math.hypot(w.x - h.x, w.y - h.y) < Math.max(0.55, 22 / H.view.s)) { drag = { kind: 'rot', i: sel, flip: h.flip, id: e.pointerId, snap: JSON.stringify({ items: items, meta: meta }) }; placeTools(); return; }
      }
      var i = hit(w.x, w.y);
      if (i >= 0) {
        drag = { kind: 'move', i: i, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: items[i].x - w.x, dy: items[i].y - w.y, snap: JSON.stringify({ items: items, meta: meta }), moved: false };
        sel = i; H.sfx('tap'); H.redraw(); placeTools();
      } else drag = { kind: 'none', id: e.pointerId };
    });
    cv.addEventListener('pointermove', function (e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!active || !drag) return;
      if (drag.kind === 'pinch' && pointers.size >= 2) {
        var ps = Array.from(pointers.values());
        var an = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
        items[sel] = Object.assign({}, items[sel], { a: snapAng(drag.a0 - (an - drag.ang0) * 180 / Math.PI) });
        rebuild(); return;
      }
      if (e.pointerId !== drag.id) return;
      var w = evWorld(e);
      if (drag.kind === 'rot') {
        var it = items[drag.i], a;
        if (it.k === 'rope') a = Math.atan2(w.x - it.x, -(w.y - it.y)) * 180 / Math.PI;
        else a = Math.atan2(w.y - it.y, w.x - it.x) * 180 / Math.PI + (drag.flip ? 180 : 0);
        items[drag.i] = Object.assign({}, it, { a: snapAng(a) });
        rebuild();
      } else if (drag.kind === 'move') {
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        drag.moved = true;
        var lift = e.pointerType === 'touch' ? 0.35 : 0;
        items[drag.i] = snapXY(Object.assign({}, items[drag.i], { x: w.x + drag.dx, y: w.y + drag.dy + lift }));
        rebuild();
      }
    });
    function endDrag(e) {
      pointers.delete(e.pointerId);
      if (!active || !drag) return;
      if (drag.kind === 'pinch') { if (pointers.size > 0) return; finish(drag); drag = null; placeTools(); return; }
      if (e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (d.kind === 'none') { if (sel >= 0) { sel = -1; H.redraw(); } placeTools(); return; }
      if (d.kind === 'move' && !d.moved) { placeTools(); return; }
      finish(d);
    }
    function finish(d) {
      if (JSON.stringify({ items: items, meta: meta }) !== d.snap) { undo.push(d.snap); if (undo.length > 80) undo.shift(); H.sfx(d.kind === 'move' ? 'drop' : 'tap'); changed(); }
      else { rebuild(); }
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', function (e) { if (drag && drag.snap && drag.kind !== 'none') { restore(drag.snap); drag = null; rebuild(); } endDrag(e); });

    // dragging a new piece from the palette
    var pal = null;
    function palDown(e, p, btn) {
      if (!active || btn.disabled) return;
      H.ctx(); e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (x) {}
      pal = { p: p, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, touch: e.pointerType === 'touch', it: null };
      sel = -1; placeTools();
    }
    function newItem(p, x, y) { return snapXY(Object.assign(clone(p.it), { x: x, y: y })); }
    window.addEventListener('pointermove', function (e) {
      if (!pal || e.pointerId !== pal.id) return;
      if (!pal.moved && Math.hypot(e.clientX - pal.x0, e.clientY - pal.y0) < 8) return;
      pal.moved = true;
      var r = cv.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 10 && e.clientY <= r.bottom + (pal.touch ? 40 : 0);
      if (!inside) { pal.it = null; H.ghost(icon(pal.p.id), e.clientX, e.clientY); rebuild(); return; }
      H.ghost(null);
      var w = evWorld(e);
      pal.it = newItem(pal.p, w.x, w.y + (pal.touch ? 0.9 : 0));
      rebuild(C.normItem(pal.it));
    });
    function palUp(e, cancel) {
      if (!pal || e.pointerId !== pal.id) return;
      var d = pal; pal = null; H.ghost(null);
      if (cancel) { rebuild(); return; }
      var it = !d.moved ? newItem(d.p, 6, 6.5) : d.it;
      if (!it) { rebuild(); return; }
      add(it);
    }
    window.addEventListener('pointerup', function (e) { palUp(e); });
    window.addEventListener('pointercancel', function (e) { palUp(e, true); });
    function add(it) {
      if (left(it.k) <= 0) { H.sfx('error'); rebuild(); return false; }
      snapshot(); items.push(C.normItem(it)); sel = items.length - 1; H.sfx('drop'); H.vibrate(10); changed(); return true;
    }

    // ------------------------------------------------------------------ the settings (the solver's tray, the target, the title)
    function renderSettings() {
      var body = $('msBody'); body.innerHTML = '';
      var mk = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
      var lab = mk('label', 'fld', T('レベルの名前')); lab.setAttribute('for', 'msTitle');
      var inp = mk('input', 'fin'); inp.id = 'msTitle'; inp.maxLength = C.LIMITS.title; inp.value = meta.title; inp.placeholder = T('名前なし'); inp.autocomplete = 'off'; inp.setAttribute('enterkeyhint', 'done');
      inp.addEventListener('input', function () { meta.title = C.cleanText(inp.value, C.LIMITS.title); });
      body.appendChild(lab); body.appendChild(inp);
      body.appendChild(mk('p', 'msHead', T('とく人が使える部品')));
      var total = C.partTotal({ parts: meta.parts });
      var grid = mk('div', 'msParts');
      PE.PART_IDS.forEach(function (t) {
        var n = meta.parts[t] || 0, row = mk('div', 'msRow' + (n ? ' on' : ''));
        row.dataset.part = t;
        var img = mk('img'); img.alt = ''; img.src = ART.partIcon(t, 48); row.appendChild(img);
        row.appendChild(mk('span', 'msName', T(H.partName(t))));
        var minus = mk('button', 'msBtn', '−'); minus.type = 'button'; minus.dataset.d = '-1'; minus.setAttribute('aria-label', T(H.partName(t)) + ' −'); minus.disabled = n <= 0;
        var num = mk('b', 'msNum', String(n));
        var plus = mk('button', 'msBtn', '+'); plus.type = 'button'; plus.dataset.d = '1'; plus.setAttribute('aria-label', T(H.partName(t)) + ' +'); plus.disabled = n >= C.LIMITS.partEach || total >= C.LIMITS.partTotal;
        [minus, plus].forEach(function (b) { b.addEventListener('click', function () { setPart(t, n + (+b.dataset.d)); }); });
        row.appendChild(minus); row.appendChild(num); row.appendChild(plus);
        grid.appendChild(row);
      });
      body.appendChild(grid);
      var pr = mk('div', 'msRow msPar');
      pr.appendChild(mk('span', 'msName', T('目標の部品の数（★）')));
      var pm = mk('button', 'msBtn', '−'); pm.type = 'button'; pm.id = 'msParM'; pm.setAttribute('aria-label', T('目標の部品の数（★）') + ' −'); pm.disabled = meta.par <= 1;
      var pn = mk('b', 'msNum', String(meta.par)); pn.id = 'msParN';
      var pp = mk('button', 'msBtn', '+'); pp.type = 'button'; pp.id = 'msParP'; pp.setAttribute('aria-label', T('目標の部品の数（★）') + ' +'); pp.disabled = meta.par >= Math.max(1, total);
      pm.addEventListener('click', function () { setPar(meta.par - 1); }); pp.addEventListener('click', function () { setPar(meta.par + 1); });
      pr.appendChild(pm); pr.appendChild(pn); pr.appendChild(pp);
      body.appendChild(pr);
      body.appendChild(mk('p', 'msNote', T('部品 {n} 個（最大 {m} 個）', { n: total, m: C.LIMITS.partTotal })));
    }
    function setPart(t, n) {
      snapshot();
      var p = Object.assign({}, meta.parts); if (n > 0) p[t] = n; else delete p[t];
      meta.parts = C.normalize({ items: [{ k: 'goal', x: 1, y: 1 }, { k: 'ball', x: 1, y: 1 }], parts: p, par: 1 }).parts;
      var tot = C.partTotal({ parts: meta.parts }); meta.par = Math.max(1, Math.min(meta.par, tot || 1));
      if (n > 0 && meta.par < 1) meta.par = 1;
      H.sfx('tap'); renderSettings(); changed();
    }
    function setPar(n) { var tot = C.partTotal({ parts: meta.parts }); n = Math.max(1, Math.min(Math.max(1, tot), n)); if (n === meta.par) return; snapshot(); meta.par = n; H.sfx('tap'); renderSettings(); changed(); }
    function openSettings() { if (!active) return; sel = -1; placeTools(); H.redraw(); renderSettings(); H.showOverlay('ovMakeSet'); }
    function closeSettings() { H.hideOverlay('ovMakeSet'); changed(); }

    // ------------------------------------------------------------------ open / close
    function open(d) {
      var n = C.normalize(d || TEMPLATE);
      items = clone(n.items); meta = { title: n.title, parts: Object.assign({}, n.parts), par: n.par };
      sel = -1; undo = []; drag = null; pal = null; active = true; palKey = '';
      rebuild();
    }
    function close() { var box = $('mtray'); if (box) box.textContent = ''; palKey = ''; active = false; sel = -1; drag = null; pal = null; pointers.clear(); placeTools(); H.ghost(null); }
    function key(e) {
      if (!active) return false;
      if (sel >= 0 && (e.key === 'q' || e.key === 'Q')) rotate(15);
      else if (sel >= 0 && (e.key === 'e' || e.key === 'E')) rotate(-15);
      else if (sel >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) remove(sel);
      else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) doUndo();
      else if (e.key === 'Escape' && sel >= 0) { sel = -1; H.redraw(); placeTools(); }
      else return false;
      return true;
    }
    function pagePoint(x, y) { var r = cv.getBoundingClientRect(); return { x: r.left + H.wx(x), y: r.top + H.wy(y) }; }
    return {
      open: open, close: close, def: def, draw: draw, key: key, placeTools: placeTools, renderPalette: function () { palKey = ''; if (active) renderPalette(); },
      undo: doUndo, canUndo: function () { return undo.length > 0; }, openSettings: openSettings, closeSettings: closeSettings, renderSettings: renderSettings,
      get active() { return active; }, get sel() { return sel; }, deselect: function () { sel = -1; placeTools(); H.redraw(); },
      TEMPLATE: TEMPLATE, PALETTE: PALETTE, KIND_NAME: KIND_NAME, nameOf: nameOf,
      state: function () { return { items: clone(items), sel: sel, undo: undo.length, title: meta.title, parts: Object.assign({}, meta.parts), par: meta.par, tools: !$('mtools').hidden }; },
      itemPoint: function (i) { return pagePoint(items[i].x, items[i].y); },
      handlePoint: function (i) { var h = handlePos(items[i == null ? sel : i]); return pagePoint(h.x, h.y); },
      palettePoint: function (id) { var b = document.querySelector('#mtray .tp[data-piece="' + id + '"]'); if (!b) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
      pagePoint: pagePoint, find: function (k) { for (var i = items.length - 1; i >= 0; i--) if (items[i].k === k) return i; return -1; },
    };
  }
  root.PhysicsEditor = { create: create, PALETTE: PALETTE, TEMPLATE: TEMPLATE };
})(typeof window !== 'undefined' ? window : globalThis);
