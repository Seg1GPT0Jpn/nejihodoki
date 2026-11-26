// 麻雀工房：CPU と「ヒント」（牌効率・受け入れ・守り）。DOM なし。1回の判断は 150ms 以内（ふつうは 10〜30ms）。
// 強さ 1 よわい：向聴数が下がる打牌をえらぶだけ（守りなし・ヤクハイ以外は鳴かない）。
//      2 ふつう：受け入れ枚数（ukeire）が最大の打牌・筋と現物で守る・役がある形なら鳴く・テンパイでリーチ。
//      3 つよい：牌の危険度を数え、押し引き（手の価値と向聴数）を決め、ダマ・リーチを選び、安全な暗槓もする。
// どれも見えている情報（自分の手・河・副露・ドラ表示牌・リーチ者への現物）だけを使う。他家の手牌は読まない。
(function (root) {
  'use strict';
  const E = root.MahjongEngine || (typeof require === 'function' ? require('./engine.js') : null);

  const TUNE = { dama: true, fold3: true, tileValue: 1.2, slip2: 0.07 };
  const leftCounts = (st, seat) => E.visibleCounts(st, seat).map(x => Math.max(0, 4 - x));

  // 受け入れ：13枚の手（c）が向聴数を進める牌の一覧
  function ukeire(c, nm, left) {
    const s0 = E.shanten(c, nm), list = []; let total = 0;
    for (let j = 0; j < 34; j++) {
      if (left[j] <= 0) continue;
      c[j]++; const s1 = E.shanten(c, nm); c[j]--;
      if (s1 < s0) { list.push({ k: j, n: left[j] }); total += left[j]; }
    }
    return { shanten: s0, list, total };
  }

  // 危険度（0 = 安全、大きいほど危ない）。opp が立直しているとして kind を切るときの目安
  function danger(st, opp, k, left) {
    if (st.safe[opp].indexOf(k) >= 0 || E.riverKinds(st, opp).indexOf(k) >= 0) return 0;
    const rv = new Set(E.riverKinds(st, opp).concat(st.safe[opp]));
    let d;
    if (k >= 27) {
      const l = left[k];   // 見えていない枚数（自分の手も数えない）
      d = l <= 0 ? 0.5 : l === 1 ? 2 : l === 2 ? 4 : 6;
      if (k >= 31 || k === 27 + E.seatWind(st, opp) || k === 27 + st.roundWind) d += l >= 3 ? 1.5 : 0.5;
    } else {
      const n = k % 9, base = k - n, has = x => x >= 0 && x <= 8 && rv.has(base + x);
      const lo = n >= 3 ? has(n - 3) : null, hi = n <= 5 ? has(n + 3) : null;
      if (n <= 2) d = hi ? 2.5 : n === 0 ? 5 : n === 1 ? 6.5 : 7.5;
      else if (n >= 6) d = lo ? 2.5 : n === 8 ? 5 : n === 7 ? 6.5 : 7.5;
      else d = lo && hi ? 2 : (lo || hi) ? 7 : 10.5 + (n === 4 ? 1 : 0);
      if (n >= 3 && n <= 5 && !(lo && hi) && (lo || hi)) d = 6.5;
      // その牌の周りが見えているほど安全
      d -= Math.max(0, Math.min(2, (4 - left[k] - 1) * 0.6));
    }
    if (st.riichi[opp] && st.rivers[opp].length > 12) d += 0.5;
    return Math.max(0.5, d);
  }
  function threats(st, seat) { const o = []; for (let s = 0; s < 4; s++) if (s !== seat && st.riichi[s]) o.push(s); return o; }
  function dangerOf(st, seat, k, left, thr) { let d = 0; for (const o of thr) d = Math.max(d, danger(st, o, k, left)); return d; }

  // ---- 手の見かけの価値（ドラ・役牌・タンヤオなど）。大きいほど手に残したい
  function tileValue(st, seat, k, id, lv) {
    let v = 0;
    const dora = E.doraList(st).map(E.doraOf);
    if (dora.indexOf(k) >= 0) v += 30; if (E.isRed(id)) v += 30;
    if (E.isHonor(k)) {
      const yaku = k >= 31 || k === 27 + E.seatWind(st, seat) || k === 27 + st.roundWind;
      if (yaku) v += 12; else v -= 6;
    } else {
      const n = k % 9;
      if (n === 0 || n === 8) v -= 5; else if (n === 1 || n === 7) v -= 1; else v += 2;
    }
    return v;
  }

  // ---- 打牌の分析（手牌14枚のとき）→ [{ tile, kind, shanten, ukeire, list, danger, score }]（よい順）
  function analyze(st, seat, lv) {
    lv = lv || 2;
    const h = st.hands[seat], nm = st.melds[seat].length, left = leftCounts(st, seat);
    const c = E.closedCounts(st, seat), thr = lv >= 2 ? threats(st, seat) : [];
    const cand = [], seen = {};
    const legalTiles = E.legal(st, seat).filter(a => a.t === 'discard' && !a.riichi).map(a => a.tile);
    for (const id of legalTiles) {
      const k = id >> 2; if (seen[k] != null && !(E.isRed(id) === false && false)) continue; seen[k] = 1;
      // 同じ種類が複数あるとき：赤でない牌を先に出す
      const pick = h.filter(x => (x >> 2) === k && legalTiles.indexOf(x) >= 0).sort((a, b) => (E.isRed(a) ? 1 : 0) - (E.isRed(b) ? 1 : 0))[0];
      c[k]--; const s = E.shanten(c, nm); c[k]++;
      cand.push({ tile: pick, kind: k, shanten: s, ukeire: 0, list: [], danger: 0, score: 0 });
    }
    if (!cand.length) return [];
    const best = Math.min(...cand.map(x => x.shanten));
    for (const x of cand) {
      if (x.shanten === best || (lv >= 3 && x.shanten === best + 1 && best >= 1)) {
        c[x.kind]--; const u = ukeire(c, nm, left); c[x.kind]++;
        x.ukeire = u.total; x.list = u.list;
      }
      x.danger = thr.length ? dangerOf(st, seat, x.kind, left, thr) : 0;
      x.safe = thr.length ? thr.every(o => st.safe[o].indexOf(x.kind) >= 0 || E.riverKinds(st, o).indexOf(x.kind) >= 0) : false;
    }
    for (const x of cand) {
      x.value = tileValue(st, seat, x.kind, x.tile, lv);
      x.score = -x.shanten * 1000 + x.ukeire * (lv >= 2 ? 10 : 0) - x.value * (lv >= 3 ? TUNE.tileValue : 0) + (x.tile === st.drawn ? 0.5 : 0);
    }
    cand.sort((a, b) => b.score - a.score || a.kind - b.kind);
    return cand;
  }

  // 手の価値の見積もり（テンパイ時にあがれたらの点数。リーチ・ダマ・押し引きに使う）
  function handHan(st, seat) {
    // 14枚の手のうち、いまの手がテンパイなら待ちにあたる牌ごとの評価の最大
    return null;
  }
  function tenpaiValue(st, seat, c13, riichi) {
    const nm = st.melds[seat].length, w = E.waits(c13, nm); let best = 0, tot = 0; const left = leftCounts(st, seat);
    for (const k of w) {
      tot += left[k];
      const ids = st.hands[seat].slice(); const fake = k * 4;   // 判定用の仮の牌
      const closed = c13.slice(); closed[k]++;
      const dr = E.countDora(st, seat, ids.concat([fake]), false);
      const r = E.evaluate({ closed, melds: st.melds[seat].map(m => ({ type: m.type, kind: m.kind, open: m.open })), win: k, tsumo: false, riichi: riichi ? 1 : 0, seatWind: E.seatWind(st, seat), roundWind: st.roundWind, dora: dr.dora, aka: dr.aka, cfg: st.cfg });
      if (r) best = Math.max(best, r.han);
    }
    return { waits: w, left: tot, han: best };
  }

  // ---- 打牌の決定 ----
  function decideDiscard(st, seat, lv, rnd) {
    const L = E.legal(st, seat);
    const tsumo = L.find(a => a.t === 'tsumo'); if (tsumo) return tsumo;
    const nm = st.melds[seat].length;
    if (st.riichi[seat]) {
      const ak = L.find(a => a.t === 'ankan' && lv >= 3); if (ak) return ak;
      return { t: 'discard', tile: st.drawn };
    }
    const ky = L.find(a => a.t === 'kyuushu');
    if (ky && lv >= 2) return ky;
    const an = analyze(st, seat, lv);
    if (!an.length) return L.find(a => a.t === 'discard');
    let pick = an[0];
    const thr = lv >= 2 ? threats(st, seat) : [];
    const best = pick.shanten;
    if (lv === 2 && an.length > 2 && rnd() < TUNE.slip2) pick = an[1 + Math.floor(rnd() * 2)];   // ふつうのCPUは、ときどき2番目・3番目の牌を切る
    if (lv === 1) {
      const ties = an.filter(x => x.shanten === best); pick = ties[Math.floor(rnd() * ties.length)];
      // 弱いCPUは、ときどき見落とす
      if (rnd() < 0.08) pick = an[Math.floor(rnd() * an.length)];
    } else if (thr.length) {
      const dc = E.closedCounts(st, seat);
      let push = false;
      if (lv === 2) push = best <= 1;
      else {
        const nmenzen = st.melds[seat].every(m => !m.open);
        const dora = E.countDora(st, seat, st.hands[seat], false);
        const hv = dora.dora + dora.aka;
        push = TUNE.fold3 ? (best === 0 || (best === 1 && (hv >= 2 || nmenzen && E.remaining(st) > 30)) || (best === 2 && hv >= 4)) : best <= 1;
        if (best === 0) { const dd = Math.max(...an.filter(x => x.shanten === 0).slice(0, 1).map(x => x.danger)); if (dd > 10 && E.remaining(st) < 10) push = false; }
      }
      if (push) {
        // 効率のよい打牌のうち、危険すぎるものは避ける
        const okTop = an.filter(x => x.shanten <= best + (lv >= 3 ? 0 : 0) && x.danger < (best === 0 ? 11 : 8.5));
        pick = okTop.length ? okTop[0] : an.slice().sort((a, b) => a.danger - b.danger || b.score - a.score)[0];
      } else {
        // 降りる：いちばん安全な牌（同じなら効率のよいもの）
        pick = an.slice().sort((a, b) => a.danger - b.danger || b.score - a.score)[0];
      }
    }
    // リーチ
    const rc = L.find(a => a.t === 'discard' && a.riichi && a.tile >> 2 === pick.kind);
    if (rc && pick.shanten === 0 && st.scores[seat] >= 1000 && !(thr.length && lv < 3 && false)) {
      let go = true;
      if (lv >= 2 && (lv === 2 || TUNE.dama)) {
        const c13 = E.closedCounts(st, seat); c13[pick.kind]--;
        const tv = tenpaiValue(st, seat, c13, false);
        if (lv === 2) go = tv.left >= 1;
        else {
          const dama = tv.han >= 4;                       // ダマで満貫に近い
          const poor = tv.left <= 2;                      // 待ちが悪い
          const late = E.remaining(st) < 8;
          const topLead = st.scores[seat] >= 40000 && st.dealer !== seat;
          go = !(dama && tv.left >= 3) && !(poor && tv.han >= 2) && !late && !(topLead && tv.han >= 2 && thr.length === 0 && false);
          if (tv.han === 0) go = true;                    // 役がなければリーチしかない
        }
      }
      if (go) return rc;
    }
    // 暗槓（強いCPU）：向聴数が下がらない形のみ
    if (lv >= 3 && !thr.length) {
      const ak = L.find(a => a.t === 'ankan');
      if (ak) { const c = E.closedCounts(st, seat); const s0 = E.shanten(c, nm); const before = s0; c[ak.kind] -= 4; const s1 = E.shanten(c, nm + 1); if (s1 <= before && before <= 1) return ak; }
    }
    return { t: 'discard', tile: pick.tile };
  }

  // ---- 鳴き・ロンの決定 ----
  function simpleHand(st, seat, ids, melds) {
    return ids.every(x => !E.isYao(x >> 2)) && melds.every(m => m.tiles.every(x => !E.isYao(x >> 2)));
  }
  function suitFlush(ids, melds) {
    const ks = ids.map(x => x >> 2).concat(...melds.map(m => m.tiles.map(x => x >> 2))), suits = new Set(ks.filter(k => k < 27).map(E.suitOf));
    return suits.size === 1 && ks.filter(k => k < 27).length >= ks.length - 4;
  }
  function decideCall(st, seat, lv, rnd) {
    const L = E.legal(st, seat), pass = { t: 'pass' };
    const ron = L.find(a => a.t === 'ron'); if (ron) return ron;
    if (st.riichi[seat] || lv <= 0) return pass;
    const tile = st.call.tile, k = tile >> 2, nm = st.melds[seat].length;
    const yakuhai = k >= 31 || k === 27 + E.seatWind(st, seat) || k === 27 + st.roundWind;
    const pons = L.filter(a => a.t === 'pon'), chiis = L.filter(a => a.t === 'chii');
    if (!pons.length && !chiis.length) return pass;
    if (lv === 1) return pons.length && yakuhai && rnd() < 0.8 ? pons[0] : pass;
    const left = leftCounts(st, seat), c = E.closedCounts(st, seat);
    const before = E.shanten(c, nm);
    const thr = threats(st, seat);
    let bestA = null, bestS = before;
    const evalCall = a => {
      const cc = c.slice(); for (const u of a.use) cc[u >> 2]--;
      const ids = st.hands[seat].filter(x => a.use.indexOf(x) < 0);
      // あとで1枚切る：切ったあとの最小の向聴数
      let s = 9; for (let q = 0; q < 34; q++) if (cc[q]) { if (a.t === 'chii' && false) continue; cc[q]--; const v = E.shanten(cc, nm + 1); cc[q]++; if (v < s) s = v; }
      const newMeld = { tiles: a.use.concat([tile]), type: a.t === 'chii' ? 'chi' : 'pon', kind: k };
      const melds = st.melds[seat].concat([newMeld]);
      return { s, ids, melds };
    };
    for (const a of pons.concat(chiis)) {
      const r = evalCall(a);
      const hasYaku = (a.t === 'pon' && yakuhai) || melds_have_yakuhai(st, seat) || (lv >= 2 && simpleHand(st, seat, r.ids, r.melds)) || (lv >= 2 && suitFlush(r.ids, r.melds));
      if (!hasYaku) continue;
      if (thr.length && r.s > 1 && lv >= 2) continue;
      const gain = before - r.s;
      if (gain > 0 || (a.t === 'pon' && yakuhai && r.s <= before && lv >= 2)) {
        if (lv === 2 && a.t === 'chii' && gain < 1) continue;
        if (r.s < bestS || (r.s === bestS && !bestA)) { bestS = r.s; bestA = a; }
        else if (!bestA) bestA = a;
      }
    }
    return bestA || pass;
  }
  function melds_have_yakuhai(st, seat) { return st.melds[seat].some(m => m.kind >= 31 || m.kind === 27 + E.seatWind(st, seat) || m.kind === 27 + st.roundWind); }

  // 1手の判断（盤面 st で seat が動く番）
  function decide(st, seat, lv, rnd) {
    rnd = rnd || Math.random; lv = lv || (st.levels && st.levels[seat]) || 2;
    if (st.phase === 'discard') return decideDiscard(st, seat, lv, rnd);
    if (st.phase === 'call') return decideCall(st, seat, lv, rnd);
    return null;
  }
  // 時間切れの代わりの手：あがれるならあがる、それ以外はツモ切り（鳴きはパス）
  function auto(st, seat) {
    const L = E.legal(st, seat);
    if (st.phase === 'discard') { const t = L.find(a => a.t === 'tsumo'); if (t) return t; { const d = L.find(a => a.t === 'discard' && (a.tile >> 2) === (st.drawn >> 2) && !a.riichi); if (d) return { t: 'discard', tile: st.drawn }; return L.find(a => a.t === 'discard' && !a.riichi); } }
    return L.find(a => a.t === 'ron') || { t: 'pass' };
  }

  // ---- ヒント ----
  // 自分の番：{ type, action, tile, shanten, ukeire, list, danger, threatened, alt:[…], reason:[…] }
  function hint(st, seat) {
    const L = E.legal(st, seat), lv = 3;
    if (st.phase === 'discard' && seat === st.turn) {
      const tsumo = L.find(a => a.t === 'tsumo'); if (tsumo) return { type: 'tsumo', action: tsumo };
      const an = analyze(st, seat, 3);
      const act = st.riichi[seat] ? { t: 'discard', tile: st.drawn } : decideDiscard(st, seat, 3, () => 0.5);
      if (act.t === 'kyuushu') return { type: 'kyuushu', action: act };
      if (act.t === 'ankan') return { type: 'ankan', action: act, kind: act.kind };
      const k = act.tile >> 2, row = an.find(x => x.kind === k) || an[0] || { shanten: 8, ukeire: 0, list: [] };
      const thr = threats(st, seat);
      const reasons = [];
      const nm = st.melds[seat].length, c = E.closedCounts(st, seat);
      const alts = an.filter(x => x.kind !== k).slice(0, 2).map(x => ({ tile: x.tile, kind: x.kind, shanten: x.shanten, ukeire: x.ukeire }));
      if (thr.length) reasons.push(row.danger <= 1 ? 'safe' : 'danger');
      if (E.isHonor(k) && !(k >= 31 || k === 27 + E.seatWind(st, seat) || k === 27 + st.roundWind) && c[k] === 1) reasons.push('lonely-honor');
      else if (c[k] === 1 && E.isYao(k)) reasons.push('lonely-terminal');
      else if (c[k] === 1) reasons.push('isolated');
      if (row.shanten === 0 && row.list.length) reasons.push('tenpai');
      return { type: act.riichi ? 'riichi' : 'discard', action: act, tile: act.tile, kind: k, shanten: row.shanten, ukeire: row.ukeire, list: row.list, danger: row.danger || 0, threatened: thr.length > 0, alt: alts, reason: reasons, riichi: !!act.riichi };
    }
    if (st.phase === 'call' && L.length) {
      const act = decideCall(st, seat, 3, () => 0.5);
      return { type: act.t, action: act };
    }
    return null;
  }
  // いまの手の向聴数と受け入れ（手牌13枚または14枚）
  function handInfo(st, seat) {
    const nm = st.melds[seat].length, c = E.closedCounts(st, seat), left = leftCounts(st, seat);
    const n = st.hands[seat].length;
    if (n % 3 === 2) { const an = analyze(st, seat, 2); const s = an.length ? an[0].shanten : E.shanten(c, nm); return { shanten: s, ukeire: an[0] ? an[0].ukeire : 0, list: an[0] ? an[0].list : [] }; }
    const u = ukeire(c, nm, left); return { shanten: u.shanten, ukeire: u.total, list: u.list };
  }

  const API = { TUNE, analyze, decide, decideDiscard, decideCall, auto, hint, handInfo, ukeire, danger, tenpaiValue, leftCounts, threats };
  root.MahjongAI = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
