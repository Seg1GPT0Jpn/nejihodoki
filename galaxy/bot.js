// ぐるぐる星わたり：ミッションごとの道すじ（route）にそって、本物のエンジンへ「入力だけ」を送るボット。window.GalaxyBot
// ミッションが「ボットでクリアできる」ことの証明に使う（proofs.js に入力の記録を残す）。遊ぶときの「おまかせ」ではない。
//   const r = GalaxyBot.run(L, 'g1m1');   // → { ok, S, rec（入力を packして並べた配列）, frames, fail }
// route の1歩：'id'（ものの id か、pts の名前）／{ to, j（この距離でジャンプ）, tol, once, launch:1（はっしゃ→着地まで）, fly（ジャンプおしっぱなしで飛ぶ）, boss:1 }
(function (root) {
  'use strict';
  const E = root.GalaxyEngine || require('./engine.js');
  const V = E.vec, B = E.B, K = E.K;
  const norm1 = s => (typeof s === 'string' ? { to: s } : s);

  function create(L, mid) {
    const m = L.missions[mid], route = (m.route || []).map(norm1);
    const bot = { i: 0, sf: 0, jh: 0, jumped: false, launched: false, fail: null, ssp: 0 };
    const pt = (S, sp) => (Array.isArray(sp) ? sp : V.add(S.xf[typeof sp.b === 'string' ? L.idx[sp.b] : sp.b].p, V.mv(S.xf[typeof sp.b === 'string' ? L.idx[sp.b] : sp.b].R, sp.l)));
    function target(S, st) {
      const k = st.to || st.fly; if (m.pts && m.pts[k]) { const sp = m.pts[k]; return { p: pt(S, sp), i: -1, bi: Array.isArray(sp) ? -1 : (typeof sp.b === 'string' ? L.idx[sp.b] : sp.b) }; }
      const i = L.eidx[k]; if (i == null) throw new Error('route: no such thing ' + k);
      return { p: S.ep[i] || V.add([0, 0, 0], S.h.x), i, gone: !!S.e[i] || S.lit.indexOf(i) >= 0 };
    }
    // 世界の向き → スティック（カメラの向き基準。エンジンの camFrame と同じ）
    function stick(S, w, mag) {
      const fr = E.camFrame(S), t = V.sub(w, V.mul(S.h.up, V.dot(w, S.h.up))), l = V.len(t); if (l < 1e-6) return { sx: 0, sy: 0 };
      const d = V.mul(t, 1 / l); return { sx: V.dot(d, fr.r) * mag, sy: V.dot(d, fr.f) * mag };
    }
    function go(S, p, o) {
      o = o || {}; const h = S.h, d = V.sub(p, h.x), up = h.up, t = V.sub(d, V.mul(up, V.dot(d, up))), l = V.len(t);
      if (l < (o.stop || 0.12)) return { sx: 0, sy: 0 };
      const fast = o.mag == null ? 1 : o.mag; let mag = Math.min(fast, Math.max(0.4, l / 1.5)); if (h.on >= 0 && L.bodies[h.on].fr < 0.5) mag = Math.min(mag, l < 4 ? 0.5 : 1);
      return stick(S, t, mag);
    }
    function reflex(S, inp) {
      const h = S.h; if (h.dead || h.lau) return;
      for (const i of S.act) { const e = L.ents[i]; if ((e.k !== 'walker' && e.k !== 'crate') || S.e[i] || !S.ep[i]) continue; if (V.len(V.sub(S.ep[i], h.x)) < 2.5 && h.scd <= 0 && !(S.pb & B.S) && h.inv <= 0) { inp.b |= B.S; return; } }
    }
    function bossAct(S) {
      const bo = S.boss, h = S.h, e = L.ents[bo.i], bi = e.bi, c = S.xf[bi].p, R = L.bodies[bi].r, inp = { sx: 0, sy: 0, b: 0 };
      const bp = E.bossPos(S), hq = V.norm(V.mtv(S.xf[bi].R, V.sub(h.x, c))), rr = V.len(V.sub(h.x, c)), dist = E.geod(bo.d, hq) * rr, dd = V.len(V.sub(bp, h.x));
      if (bo.st === 'stun') {
        const o = go(S, bp, { stop: 0.5 }); inp.sx = o.sx; inp.sy = o.sy;
        if (dd < 3.1 && h.scd <= 0 && !(S.pb & B.S)) inp.b |= B.S;
      } else if (bo.st === 'dead' || bo.st === 'gone') { /* wait for the shard */ }
      else if (bo.st === 'aim' || bo.st === 'charge') {
        const side = V.norm(V.cross(h.up, V.norm(V.sub(bp, h.x)))); const sg = V.dot(side, V.sub(h.x, c)) >= 0 ? 1 : -1; const o = go(S, V.add(h.x, V.mul(side, 7 * sg)), { stop: 0.1 }); inp.sx = o.sx; inp.sy = o.sy;
      } else {
        // にげる（ボスのいる向きと逆）
        let away = V.sub(h.x, bp); if (bo.st === 'jump') away = V.sub(h.x, V.add(c, V.mv(S.xf[bi].R, V.mul(bo.tg, R))));
        let ta = V.sub(away, V.mul(h.up, V.dot(away, h.up))); if (V.len(ta) < 0.4) away = E.perp(h.up); const run = V.add(h.x, V.mul(V.norm(away), 6)); const o = go(S, run, { stop: 0.1 }); inp.sx = o.sx; inp.sy = o.sy;
        let near = false; for (let k = 0; k < (bo.nr || 1); k++) if (Math.abs(dist - (bo.ring - 5 * k)) < 3.1) near = true;
        if (bo.st === 'land' && bo.ring > 0 && h.on >= 0 && near) { if (!(S.pb & B.J)) inp.b |= B.J; }
      }
      return inp;
    }
    // ひこう：目ざす点へ むけて、スティックで 曲がる・上下する
    const aeroSteer = (S, inp, tp) => { const h = S.h, up = [0, 1, 0]; const d = h.fd ? V.norm(h.fd) : V.norm(h.fw), dh = V.norm(E.projT(d, up)), tv = V.sub(tp, h.x), th = V.len(E.projT(tv, up)) > 0.05 ? V.norm(E.projT(tv, up)) : dh;
      const s = V.dot(V.cross(dh, th), up), c = V.dot(dh, th); inp.sx = Math.max(-1, Math.min(1, -(c < 0 ? (s >= 0 ? 1 : -1) : s) * 7)); const err = V.dot(V.norm(tv), up) - V.dot(d, up); inp.sy = Math.max(-1, Math.min(1, -err * 7)); return inp; };
    bot.act = function (S) {
      const h = S.h, inp = { sx: 0, sy: 0, b: 0 };
      if (S.over || h.dead) return inp;
      if (bot.i >= route.length) return inp;
      const st = route[bot.i]; bot.sf++;
      if (st.wait != null) { if (bot.sf <= st.wait) return inp; bot.i++; bot.sf = 0; return bot.act(S); }
      if (bot.sf > (st.max || 2400)) { bot.fail = 'stuck at step ' + bot.i + ' ' + JSON.stringify(st) + ' pos ' + h.x.map(v => v.toFixed(1)); return inp; }
      const nextStep = () => { bot.i++; bot.sf = 0; bot.jumped = false; bot.launched = false; bot.jh = 0; };
      if (st.boss) {
        if (S.flag.boss) { nextStep(); return inp; }
        const o = bossAct(S); reflex(S, o); return o;
      }
      if (st.melt) {
        const i = L.eidx[st.melt]; if (S.e[i]) { nextStep(); return inp; }
        const p = S.ep[i], d = V.len(V.sub(p, h.x)); const o = go(S, p, { stop: 0.1 }); if (d > (st.at || 2.6)) { inp.sx = o.sx; inp.sy = o.sy; } else if (h.scd <= 0 && !(S.pb & B.S)) inp.b |= B.S; return inp;
      }
      if (st.fish) { // つり：さかなの いちへ およいで、ちかづいたら スピン
        const i = L.eidx[st.fish]; if (S.e[i]) { nextStep(); return inp; } const p = S.ep[i], d = V.len(V.sub(p, h.x)); const o = go(S, p, { stop: 0.1 }); inp.sx = o.sx; inp.sy = o.sy;
        const above = V.dot(V.sub(p, h.x), h.up), vu = V.dot(h.v, h.up); if (h.on >= 0 && !(S.pb & B.J)) inp.b |= B.J; else if (h.sw && above > -0.3 && vu < 1.2 && !(S.pb & B.J)) inp.b |= B.J;
        if (d < 2.3 && h.scd <= 0 && !(S.pb & B.S)) inp.b |= B.S; return inp;
      }
      if (st.golf) { // ミニゴルフ：ボールの うしろに まわって スピンで うつ
        const i = L.eidx[st.golf]; if (S.e[i]) { nextStep(); return inp; } const bl = S.bl && S.bl[i]; if (!bl) return inp; const H = pt(S, m.pts[st.hole]); let dx = H[0] - bl.p[0], dz = H[2] - bl.p[2]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        if (Math.hypot(bl.v[0], bl.v[1]) > 0.8) return inp; const stand = [bl.p[0] - dx * 1.5, h.x[1], bl.p[2] - dz * 1.5], dd = V.len(V.sub(stand, h.x)); const o = go(S, stand, { stop: 0.08 }); if (dd > 0.35) { inp.sx = o.sx; inp.sy = o.sy; return inp; }
        const o2 = go(S, [bl.p[0], h.x[1], bl.p[2]], { stop: 0.05 }); inp.sx = o2.sx * 0.3; inp.sy = o2.sy * 0.3; if (h.scd <= 0 && !(S.pb & B.S)) inp.b |= B.S; return inp;
      }
      const tg = target(S, st);
      if (st.launch) {
        // はっしゃ台まで歩き、飛んで、着地するまで
        if (h.lau) { bot.launched = true; return inp; }
        if (bot.launched) { if (h.on >= 0 || h.air > 0.4) { if (h.on >= 0) { nextStep(); } } return Object.assign(inp, go(S, h.x)); }
        const o = go(S, tg.p, { stop: 0.2 }); inp.sx = o.sx; inp.sy = o.sy; reflex(S, inp);
        if (st.j != null && h.on >= 0 && V.len(V.sub(tg.p, h.x)) < st.j && !(S.pb & B.J) && !bot.jumped) { bot.jh = 18; bot.jumped = true; }
        if (bot.jh > 0) { bot.jh--; inp.b |= B.J; }
        return inp;
      }
      if (st.fly) {
        if (tg.gone) { nextStep(); return inp; }
        const o = go(S, tg.p, { stop: 0.1 }); inp.sx = o.sx; inp.sy = o.sy;
        if (st.aero) { if (h.fl) return aeroSteer(S, inp, tg.p); if (h.on >= 0 && !(S.pb & B.J)) inp.b |= B.J; return inp; }
        if (st.swim) { const above = V.dot(V.sub(tg.p, h.x), h.up), vu = V.dot(h.v, h.up); if ((h.on >= 0 || (h.sw && above > -0.2 && vu < 1.2)) && !(S.pb & B.J)) inp.b |= B.J; return inp; }
        if (h.pw && h.pw.k === 'kite') { const tb = tg.i >= 0 ? L.ents[tg.i].bi : -1; if (h.on >= 0) { if (!(S.pb & B.J)) inp.b |= B.J; } else if (tb < 0 || h.gb !== tb) inp.b |= B.J; }
        return inp;
      }
      // ふつうの：そこまで行く
      // 動く足場：出ていない（または出ている時間が足りない）ときは、ようすを見て立ちどまる
      if (tg.bi != null && tg.bi >= 0 && h.on >= 0 && !(L.bodies[h.on] && L.bodies[h.on].cr) && (!E.bodyActive(S, tg.bi) || E.bodyWindow(S, tg.bi) < (st.win || 0.2))) { const dd = V.len(V.sub(tg.p, h.x)); if (dd < 14) return inp; }
      const dist = V.len(V.sub(tg.p, h.x));
      if (!tg.gone) bot.lastP = tg.p;
      if (tg.i >= 0 ? tg.gone : dist < (st.tol || 1.0)) {
        if (st.land && (h.on < 0 || bot.jh > 0)) { const o = go(S, bot.lastP, { stop: 0.1 }); inp.sx = o.sx; inp.sy = o.sy; if (bot.jh > 0) { bot.jh--; inp.b |= B.J; } else if (st.hold && h.on < 0) inp.b |= B.J; return inp; }
        nextStep(); return bot.act(S);
      }
      const o = go(S, tg.p, { stop: 0.15 }); inp.sx = o.sx; inp.sy = o.sy;
      if (st.aero && h.fl) return aeroSteer(S, inp, tg.p);
      if (st.swim && h.sw) { const above = V.dot(V.sub(tg.p, h.x), h.up), vu = V.dot(h.v, h.up); if (above > -0.2 && vu < 1.2 && !(S.pb & B.J)) inp.b |= B.J; return inp; }
      if (st.bounce) { if (!(S.pb & B.J)) inp.b |= B.J; return inp; }
      if (st.dash && h.pw && h.pw.k === 'dash' && h.on < 0 && (h.aj | 0) < 1 && V.dot(h.v, h.up) < 1.5 && !(S.pb & B.J)) inp.b |= B.J;
      if (st.j != null && h.on >= 0 && dist < st.j && !(S.pb & B.J) && !(st.once && bot.jumped)) { bot.jh = 18; bot.jumped = true; }
      if (bot.jh > 0) { bot.jh--; if (!(bot.jh === 17 && (S.pb & B.J))) inp.b |= B.J; }
      else if (st.hold && bot.jumped && h.on < 0) inp.b |= B.J;
      reflex(S, inp); return inp;
    };
    return bot;
  }
  // skill: { delay（反応のおくれ・フレーム）, noise（スティックのぶれ）, miss（ジャンプを押しそこなう確率）, seed } で「へたなプレイヤー」をまねる
  function run(L, mid, opt) {
    opt = opt || {}; const S = E.create(L, mid, opt), bot = create(L, mid), rec = [], max = opt.max || 9000, sk = opt.skill; const q = []; let rs = ((sk && sk.seed) || 1) >>> 0; const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    while (!S.over && S.f < max && !bot.fail) {
      let inp = bot.act(S);
      if (sk) { q.push(inp); const d = q.length > sk.delay ? q.shift() : { sx: 0, sy: 0, b: 0 }; inp = { sx: d.sx + (rnd() - 0.5) * 2 * sk.noise, sy: d.sy + (rnd() - 0.5) * 2 * sk.noise, b: d.b }; if ((inp.b & B.J) && rnd() < sk.miss) inp.b &= ~B.J; if ((inp.b & B.S) && rnd() < sk.miss * 0.5) inp.b &= ~B.S; }
      if (opt.naive) inp.b &= ~(B.S | B.P); // 「走ってジャンプ」だけのプレイヤー
      inp = E.quant(inp); rec.push(E.pack(inp)); E.step(S, E.unpack(rec[rec.length - 1])); if (opt.strip && S.h.pw) S.h.pw = null; // スーツなし
    }
    return { ok: !!(S.res && S.res.ok), S, rec, frames: S.f, fail: bot.fail || (S.res && !S.res.ok ? S.res.why : S.over ? '' : 'timeout'), step: bot.i };
  }
  const GalaxyBot = { create, run };
  if (typeof module !== 'undefined' && module.exports) module.exports = GalaxyBot; else root.GalaxyBot = GalaxyBot;
})(typeof window !== 'undefined' ? window : globalThis);
