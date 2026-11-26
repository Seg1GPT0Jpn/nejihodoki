// 麻雀工房：リーチ麻雀のルールエンジン（DOM なし・node でも動く・同じ seed なら同じ展開）
// ---------------------------------------------------------------------------------------------------------------------
// 牌：34種類（kind）× 4枚 = 136枚（id = kind*4 + 0..3）。kind 0-8 萬子 / 9-17 筒子 / 18-26 索子 / 27-30 東南西北 / 31-33 白發中。
//     赤ドラ（cfg.aka）は id 16（赤五萬）・52（赤五筒）・88（赤五索）。
// 状態 st は JSON にできる。手は legal(st, seat) が返す形：
//   { t:'discard', tile, riichi? } | { t:'tsumo' } | { t:'ankan', kind } | { t:'kakan', tile } | { t:'kyuushu' }
//   { t:'ron' } | { t:'pon', use:[id,id] } | { t:'chii', use:[id,id] } | { t:'daiminkan' } | { t:'pass' }
// apply(st, seat, act) → null（できない手）| { ev: [出来事…] }。局が終わると st.phase === 'end'、nextRound(st) で次の局へ。
// 実装していないルール：責任払い（パオ）・人和・流し満貫以外の特殊流局・切り上げ満貫・ダブル役満の細かい設定（cfg で切替できるのは下の既定を参照）。
(function (root) {
  'use strict';

  // ================================================================= 牌の基本
  const NK = 34;
  const isHonor = k => k >= 27;
  const isYao = k => k >= 27 || k % 9 === 0 || k % 9 === 8;
  const isTermNum = k => k < 27 && (k % 9 === 0 || k % 9 === 8);
  const suitOf = k => (k < 27 ? (k / 9) | 0 : 3);
  const GREEN = [19, 20, 21, 23, 25, 32];
  const kindOf = id => id >> 2;
  const isRed = id => id === 16 || id === 52 || id === 88;
  const WIND_JA = ['東', '南', '西', '北'], DRAGON_JA = ['白', '發', '中'];
  const WIND_EN = ['East', 'South', 'West', 'North'], DRAGON_EN = ['White', 'Green', 'Red'];
  function kindName(k, en) {
    if (k < 27) return (k % 9 + 1) + (en ? ['m', 'p', 's'][(k / 9) | 0] : ['萬', '筒', '索'][(k / 9) | 0]);
    if (k < 31) return en ? WIND_EN[k - 27] : WIND_JA[k - 27];
    return en ? DRAGON_EN[k - 31] : DRAGON_JA[k - 31];
  }
  // '123m456p789s1122z' → kinds（z：1-4 東南西北、5-7 白發中。0 の五は赤だが kind は 5）
  function parseKinds(s) {
    const out = []; let pend = [];
    for (const ch of String(s).replace(/\s+/g, '')) {
      if (ch >= '0' && ch <= '9') pend.push(+ch);
      else {
        const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
        if (base == null) throw new Error('bad hand string: ' + s);
        for (const n of pend) out.push(ch === 'z' ? base + n - 1 : base + (n === 0 ? 5 : n) - 1);
        pend = [];
      }
    }
    return out;
  }
  const toCounts = kinds => { const c = new Array(NK).fill(0); for (const k of kinds) c[k]++; return c; };
  const countsOf = ids => { const c = new Array(NK).fill(0); for (const id of ids) c[id >> 2]++; return c; };
  const handStr = kinds => {
    let o = '', cur = -1, digs = '';
    const flush = () => { if (digs) { o += digs + 'mpsz'[cur]; digs = ''; } };
    for (const k of kinds.slice().sort((a, b) => a - b)) { const s = suitOf(k); if (s !== cur) { flush(); cur = s; } digs += (s === 3 ? k - 26 : k % 9 + 1); }
    flush(); return o;
  };

  // ================================================================= 乱数・牌山
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffledWall(seed) { const r = mulberry32(seed >>> 0), w = []; for (let i = 0; i < 136; i++) w.push(i); for (let i = 135; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = w[i]; w[i] = w[j]; w[j] = t; } return w; }
  const roundSeed = (seed, n) => (Math.imul((seed >>> 0) ^ 0x9E3779B9, 2654435761) + Math.imul(n + 1, 0x85EBCA6B)) >>> 0;
  const doraOf = k => (k < 27 ? (k % 9 === 8 ? k - 8 : k + 1) : k < 31 ? (k === 30 ? 27 : k + 1) : (k === 33 ? 31 : k + 1));

  // ================================================================= 向聴数
  // 一般形の向聴数：色ごとに（面子の数 m・ターツの数 t・雀頭 p）の組み合わせを数えて（色ごとの表は覚えておく）、4色を足し合わせる
  const SUIT_MEMO = new Map();
  function suitCombos(cnt, off, honor) {
    let key = ''; for (let i = 0; i < 9; i++) key += (cnt[off + i] || 0); key += honor ? 'h' : '';
    let r = SUIT_MEMO.get(key); if (r) return r;
    const seen = new Set(), c = []; for (let i = 0; i < 9; i++) c.push(cnt[off + i] || 0);
    let m = 0, t = 0, p = 0;
    (function dfs(i) {
      while (i < 9 && c[i] === 0) i++;
      if (i >= 9) { seen.add(m * 100 + t * 10 + p); return; }
      if (c[i] >= 3) { c[i] -= 3; m++; dfs(i); m--; c[i] += 3; }
      if (!honor && i <= 6 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; m++; dfs(i); m--; c[i]++; c[i + 1]++; c[i + 2]++; }
      if (!p && c[i] >= 2) { c[i] -= 2; p = 1; dfs(i); p = 0; c[i] += 2; }
      if (c[i] >= 2) { c[i] -= 2; t++; dfs(i); t--; c[i] += 2; }
      if (!honor && i <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; t++; dfs(i); t--; c[i]++; c[i + 1]++; }
      if (!honor && i <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; t++; dfs(i); t--; c[i]++; c[i + 2]++; }
      c[i]--; dfs(i); c[i]++;
    })(0);
    const all = [...seen].map(k => [(k / 100) | 0, ((k / 10) | 0) % 10, k % 10]);
    r = all.filter(a => !all.some(b => b !== a && b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2] && (b[0] > a[0] || b[1] > a[1] || b[2] > a[2])));
    SUIT_MEMO.set(key, r); return r;
  }
  function shantenStd(c, nm) {
    let states = new Set([(nm || 0) * 100]);
    for (let su = 0; su < 4; su++) {
      const opts = su < 3 ? suitCombos(c, su * 9, false) : suitCombos(c, 27, true), next = new Set();
      for (const k of states) {
        const m = (k / 100) | 0, t = ((k / 10) | 0) % 10, p = k % 10;
        for (const o of opts) { const p2 = p + o[2]; if (p2 > 1) continue; next.add(Math.min(4, m + o[0]) * 100 + Math.min(4, t + o[1]) * 10 + p2); }
      }
      states = next;
    }
    let best = 8;
    for (const k of states) { const m = (k / 100) | 0, t = ((k / 10) | 0) % 10, p = k % 10; const v = 8 - 2 * m - Math.min(t, 4 - m) - p; if (v < best) best = v; }
    return best;
  }
  function shantenChiitoi(c) { let p = 0, k = 0; for (let i = 0; i < NK; i++) { if (c[i] >= 1) k++; if (c[i] >= 2) p++; } return 6 - p + Math.max(0, 7 - k); }
  const YAO = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function shantenKokushi(c) { let k = 0, p = 0; for (const i of YAO) { if (c[i]) k++; if (c[i] >= 2) p = 1; } return 13 - k - p; }
  // 4つ目の引数 mode: 'all'（既定）| 'std' | 'chiitoi' | 'kokushi'
  const SH_CACHE = new Map();
  function shanten(c, nm) {
    nm = nm || 0;
    const key = c.join('') + nm, hit = SH_CACHE.get(key);
    if (hit !== undefined) return hit;
    const v = shantenRaw(c, nm);
    if (SH_CACHE.size > 60000) SH_CACHE.clear();
    SH_CACHE.set(key, v);
    return v;
  }
  function shantenRaw(c, nm) {
    let s = shantenStd(c, nm);
    if (nm === 0) { const a = shantenChiitoi(c); if (a < s) s = a; const b = shantenKokushi(c); if (b < s) s = b; }
    return s;
  }

  // ================================================================= 和了の形
  // 4面子（mentsu）1雀頭の全分解。c は手の中（副露を除く）の枚数。
  function decompose(c) {
    const out = [], cc = c.slice(); let n = 0; for (const x of c) n += x;
    if (n % 3 !== 2) return out;
    const need = (n - 2) / 3;
    for (let p = 0; p < NK; p++) {
      if (cc[p] < 2) continue;
      cc[p] -= 2;
      const sets = [];
      (function rec(i) {
        while (i < NK && cc[i] === 0) i++;
        if (i >= NK) { if (sets.length === need) out.push({ pair: p, sets: sets.map(s => ({ t: s.t, k: s.k })) }); return; }
        if (cc[i] >= 3) { cc[i] -= 3; sets.push({ t: 'k', k: i }); rec(i); sets.pop(); cc[i] += 3; }
        if (i < 27 && i % 9 <= 6 && cc[i + 1] && cc[i + 2]) { cc[i]--; cc[i + 1]--; cc[i + 2]--; sets.push({ t: 's', k: i }); rec(i); sets.pop(); cc[i]++; cc[i + 1]++; cc[i + 2]++; }
      })(0);
      cc[p] += 2;
    }
    return out;
  }
  const isKokushi = c => { if (c.reduce((a, b) => a + b, 0) !== 14) return false; let p = 0; for (let i = 0; i < NK; i++) { if (!isYao(i)) { if (c[i]) return false; } else { if (!c[i]) return false; if (c[i] === 2) p++; else if (c[i] > 2) return false; } } return p === 1; };
  const isChiitoi = c => { let p = 0; for (let i = 0; i < NK; i++) { if (c[i] === 2) p++; else if (c[i]) return false; } return p === 7; };
  function isComplete(c, nm) {
    let n = 0; for (const x of c) n += x;
    if (n !== 14 - 3 * (nm || 0)) return false;
    if (!nm) { if (isChiitoi(c) || isKokushi(c)) return true; }
    return decompose(c).length > 0;
  }
  // 13枚（3n+1）の手の待ち（形としてのあがり牌。役の有無は見ない）
  function waits(c, nm) {
    const out = [];
    for (let k = 0; k < NK; k++) {
      if (c[k] >= 4) continue;
      c[k]++; if (isComplete(c, nm)) out.push(k); c[k]--;
    }
    return out;
  }

  // ================================================================= 役・符・点
  const YAKU = {
    riichi: { ja: 'リーチ', en: 'Riichi' }, wriichi: { ja: 'ダブルリーチ', en: 'Double Riichi' }, ippatsu: { ja: '一発', en: 'Ippatsu' },
    tsumo: { ja: 'メンゼン自摸', en: 'Menzen Tsumo' }, tanyao: { ja: 'タンヤオ', en: 'Tanyao' }, pinfu: { ja: 'ピンフ', en: 'Pinfu' },
    iipeikou: { ja: '一盃口', en: 'Iipeikou' }, ryanpeikou: { ja: '二盃口', en: 'Ryanpeikou' },
    haku: { ja: '役牌 白', en: 'Yakuhai: White' }, hatsu: { ja: '役牌 發', en: 'Yakuhai: Green' }, chun: { ja: '役牌 中', en: 'Yakuhai: Red' },
    seat: { ja: '自風牌', en: 'Seat wind' }, round: { ja: '場風牌', en: 'Round wind' },
    rinshan: { ja: '嶺上開花', en: 'Rinshan Kaihou' }, chankan: { ja: '搶槓', en: 'Chankan' }, haitei: { ja: '海底摸月', en: 'Haitei' }, houtei: { ja: '河底撈魚', en: 'Houtei' },
    sanshoku: { ja: '三色同順', en: 'Sanshoku Doujun' }, ittsu: { ja: '一気通貫', en: 'Ittsu' }, chanta: { ja: '混全帯么九', en: 'Chanta' }, junchan: { ja: '純全帯么九', en: 'Junchan' },
    chiitoi: { ja: '七対子', en: 'Chiitoitsu' }, toitoi: { ja: '対々和', en: 'Toitoi' }, sanankou: { ja: '三暗刻', en: 'Sanankou' }, sandoukou: { ja: '三色同刻', en: 'Sanshoku Doukou' },
    sankantsu: { ja: '三槓子', en: 'Sankantsu' }, shousangen: { ja: '小三元', en: 'Shousangen' }, honroutou: { ja: '混老頭', en: 'Honroutou' }, honitsu: { ja: '混一色', en: 'Honitsu' }, chinitsu: { ja: '清一色', en: 'Chinitsu' },
    dora: { ja: 'ドラ', en: 'Dora' }, ura: { ja: '裏ドラ', en: 'Ura dora' }, aka: { ja: '赤ドラ', en: 'Red fives' },
    kokushi: { ja: '国士無双', en: 'Kokushi Musou' }, kokushi13: { ja: '国士無双十三面', en: 'Kokushi 13-wait' }, suuankou: { ja: '四暗刻', en: 'Suuankou' }, suuankouT: { ja: '四暗刻単騎', en: 'Suuankou Tanki' },
    daisangen: { ja: '大三元', en: 'Daisangen' }, shousuushi: { ja: '小四喜', en: 'Shousuushi' }, daisuushi: { ja: '大四喜', en: 'Daisuushi' }, tsuuiisou: { ja: '字一色', en: 'Tsuuiisou' },
    chinroutou: { ja: '清老頭', en: 'Chinroutou' }, ryuuiisou: { ja: '緑一色', en: 'Ryuuiisou' }, chuuren: { ja: '九蓮宝燈', en: 'Chuuren Poutou' }, chuuren9: { ja: '純正九蓮宝燈', en: 'Junsei Chuuren' },
    suukantsu: { ja: '四槓子', en: 'Suukantsu' }, tenhou: { ja: '天和', en: 'Tenhou' }, chiihou: { ja: '地和', en: 'Chiihou' },
  };
  // 初心者モード（ミニ麻雀）で数える役
  const MINI_YAKU = { riichi: 1, tsumo: 1, tanyao: 1, pinfu: 1, haku: 1, hatsu: 1, chun: 1, seat: 1, round: 1, chiitoi: 1, dora: 1 };

  const seqKinds = s => [s.k, s.k + 1, s.k + 2];
  function setHasYao(s) { return s.t === 'k' ? isYao(s.k) : (s.k % 9 === 0 || s.k % 9 === 6); }

  // ctx: { closed: counts（手の中・あがり牌を含む）, melds: [{type:'chi'|'pon'|'daiminkan'|'ankan'|'kakan', kind, open}], win: kind, tsumo, riichi: 0|1|2, ippatsu, haitei, houtei, rinshan, chankan,
  //        tenhou, chiihou, seatWind: 0-3, roundWind: 0-3, dora, ura, aka（枚数）, cfg }
  // → { han, fu, yaku: [{id, han}], yakuman: 倍数, ... } | null（役なし）
  function evaluate(ctx) {
    const cfg = ctx.cfg || {};
    const closed = ctx.closed, melds = ctx.melds || [], nm = melds.length;
    const menzen = melds.every(m => !m.open);
    const win = ctx.win;
    let best = null;
    const consider = r => { if (!r) return; if (!best || r.score > best.score) best = r; };
    const mini = !!cfg.mini;

    const base = { menzen, win };
    // ---- 国士 ----
    if (nm === 0 && isKokushi(closed)) {
      const dbl = closed[win] === 2;
      consider(finish([{ id: dbl ? 'kokushi13' : 'kokushi', han: dbl && cfg.doubleYakuman !== false ? 26 : 13 }], 0, 25, true, ctx, dbl && cfg.doubleYakuman !== false ? 2 : 1));
    }
    // ---- 七対子 ----
    if (nm === 0 && isChiitoi(closed)) {
      const ks = []; for (let i = 0; i < NK; i++) if (closed[i]) ks.push(i);
      const y = [];
      if (ks.every(isHonor)) return finish([{ id: 'tsuuiisou', han: 13 }], 0, 25, true, ctx, 1);
      y.push({ id: 'chiitoi', han: 2 });
      common(y, ctx, ks, ks.filter(k => k < 27).map(suitOf), null);
      if (ks.every(k => !isYao(k)) && (cfg.kuitan !== false || menzen)) y.push({ id: 'tanyao', han: 1 });
      if (ks.every(isYao)) y.push({ id: 'honroutou', han: 2 });
      const su = new Set(ks.filter(k => k < 27).map(suitOf));
      if (su.size === 1) y.push(ks.some(isHonor) ? { id: 'honitsu', han: 3 } : { id: 'chinitsu', han: 6 });
      consider(finish(y, 0, 25, false, ctx, 0));
    }
    // ---- 一般形 ----
    const decs = decompose(closed);
    for (const d of decs) {
      const fixed = melds.map(m => ({ t: m.type === 'chi' ? 's' : 'k', k: m.kind, open: !!m.open, kan: m.type === 'daiminkan' || m.type === 'ankan' || m.type === 'kakan' }));
      // あがり牌の入り方（待ちの形）を全部ためす
      const slots = [];
      if (d.pair === win) slots.push({ pair: true, wait: 'tan' });
      d.sets.forEach((s, i) => {
        if (s.t === 'k' && s.k === win) slots.push({ i, wait: 'sha' });
        if (s.t === 's' && win >= s.k && win <= s.k + 2) {
          const pos = win - s.k;
          const w = pos === 1 ? 'kan' : (pos === 0 && s.k % 9 === 6) || (pos === 2 && s.k % 9 === 0) ? 'pen' : 'ryan';
          slots.push({ i, wait: w });
        }
      });
      const seen = new Set();
      for (const sl of slots) {
        const key = sl.pair ? 'p' : d.sets[sl.i].t + d.sets[sl.i].k + sl.wait;
        if (seen.has(key)) continue; seen.add(key);
        const sets = d.sets.map((s, i) => ({ t: s.t, k: s.k, open: s.t === 'k' && !ctx.tsumo && !sl.pair && sl.i === i ? true : false, kan: false, fromRon: !sl.pair && sl.i === i && !ctx.tsumo })).concat(fixed);
        consider(evalStd(ctx, { sets, pair: d.pair, wait: sl.wait, menzen }));
      }
    }
    return best;
  }

  function common(y, ctx, kinds, suits, extra) {
    const cfg = ctx.cfg || {};
    if (ctx.riichi === 2) y.push({ id: 'wriichi', han: 2 }); else if (ctx.riichi === 1) y.push({ id: 'riichi', han: 1 });
    if (ctx.riichi && ctx.ippatsu && cfg.ippatsu !== false && !cfg.mini) y.push({ id: 'ippatsu', han: 1 });
    if (ctx.tsumo && !(ctx.melds || []).some(m => m.open)) y.push({ id: 'tsumo', han: 1 });
    if (ctx.rinshan) y.push({ id: 'rinshan', han: 1 });
    if (ctx.chankan) y.push({ id: 'chankan', han: 1 });
    if (ctx.haitei) y.push({ id: 'haitei', han: 1 });
    if (ctx.houtei) y.push({ id: 'houtei', han: 1 });
  }

  function evalStd(ctx, I) {
    const cfg = ctx.cfg || {};
    const sets = I.sets, pair = I.pair, menzen = I.menzen, tsumo = !!ctx.tsumo;
    const sw = 27 + (ctx.seatWind || 0), rw = 27 + (ctx.roundWind || 0);
    const tris = sets.filter(s => s.t === 'k'), seqs = sets.filter(s => s.t === 's');
    const concealed = tris.filter(s => !s.open).length;   // 暗刻（ロンであがった刻子は含めない）
    const kans = sets.filter(s => s.kan).length;
    const allKinds = [pair, pair]; sets.forEach(s => { if (s.t === 'k') allKinds.push(s.k, s.k, s.k); else allKinds.push(...seqKinds(s)); });
    const allSuits = new Set(allKinds.filter(k => k < 27).map(suitOf));
    const hasHonor = allKinds.some(isHonor);
    // ---- 役満 ----
    const ym = [];
    if (concealed === 4) ym.push(I.wait === 'tan' && cfg.doubleYakuman !== false ? { id: 'suuankouT', han: 26, n: 2 } : { id: 'suuankou', han: 13, n: 1 });
    const drTri = tris.filter(s => s.k >= 31).length;
    if (drTri === 3) ym.push({ id: 'daisangen', han: 13, n: 1 });
    const wTri = tris.filter(s => s.k >= 27 && s.k <= 30).length;
    if (wTri === 4) ym.push({ id: 'daisuushi', han: cfg.doubleYakuman !== false ? 26 : 13, n: cfg.doubleYakuman !== false ? 2 : 1 });
    else if (wTri === 3 && pair >= 27 && pair <= 30) ym.push({ id: 'shousuushi', han: 13, n: 1 });
    if (allKinds.every(isHonor)) ym.push({ id: 'tsuuiisou', han: 13, n: 1 });
    if (allKinds.every(isTermNum)) ym.push({ id: 'chinroutou', han: 13, n: 1 });
    if (allKinds.every(k => GREEN.indexOf(k) >= 0)) ym.push({ id: 'ryuuiisou', han: 13, n: 1 });
    if (kans === 4) ym.push({ id: 'suukantsu', han: 13, n: 1 });
    if (menzen && allSuits.size === 1 && !hasHonor && (ctx.melds || []).length === 0) {
      // 九蓮宝燈：手の中（あがり牌を含む）が 1112345678999 + 1枚
      const su = [...allSuits][0], c = ctx.closed, need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      let ok = (ctx.melds || []).length === 0, ext = -1;
      if (ok) { for (let i = 0; i < 9; i++) { const d = c[su * 9 + i] - need[i]; if (d < 0) ok = false; else if (d > 0) { if (ext >= 0) ok = false; ext = i; } } }
      if (ok && ext >= 0) { const pure = ctx.win === su * 9 + ext; ym.push(pure && cfg.doubleYakuman !== false ? { id: 'chuuren9', han: 26, n: 2 } : { id: 'chuuren', han: 13, n: 1 }); }
    }
    if (ctx.tenhou) ym.push({ id: 'tenhou', han: 13, n: 1 });
    if (ctx.chiihou) ym.push({ id: 'chiihou', han: 13, n: 1 });
    if (ym.length) { const n = ym.reduce((a, b) => a + b.n, 0); return finish(ym.map(q => ({ id: q.id, han: q.han })), 0, 30, true, ctx, n); }

    const y = [];
    common(y, ctx, allKinds, allSuits, null);
    // ---- 1翻・2翻… ----
    if (allKinds.every(k => !isYao(k)) && (cfg.kuitan !== false || menzen)) y.push({ id: 'tanyao', han: 1 });
    const pairIsYakuhai = pair >= 31 || pair === sw || pair === rw;
    let pinfu = false;
    if (menzen && tris.length === 0 && I.wait === 'ryan' && !pairIsYakuhai) { pinfu = true; y.push({ id: 'pinfu', han: 1 }); }
    if (menzen) {
      const key = s => s.k; const ks = seqs.filter(s => !s.open).map(key).sort((a, b) => a - b);
      let pe = 0; const cnt = {}; for (const k of ks) cnt[k] = (cnt[k] || 0) + 1;
      for (const k in cnt) pe += (cnt[k] / 2) | 0;
      if (pe >= 2) y.push({ id: 'ryanpeikou', han: 3 }); else if (pe === 1) y.push({ id: 'iipeikou', han: 1 });
    }
    for (const s of tris) {
      if (s.k >= 31) y.push({ id: ['haku', 'hatsu', 'chun'][s.k - 31], han: 1 });
      else if (s.k >= 27) { if (s.k === sw) y.push({ id: 'seat', han: 1 }); if (s.k === rw) y.push({ id: 'round', han: 1 }); }
    }
    // 三色同順・一気通貫
    const hasSeq = (su, a) => seqs.some(s => suitOf(s.k) === su && s.k % 9 === a);
    for (let a = 0; a < 7; a++) if (hasSeq(0, a) && hasSeq(1, a) && hasSeq(2, a)) { y.push({ id: 'sanshoku', han: menzen ? 2 : 1 }); break; }
    for (let su = 0; su < 3; su++) if (hasSeq(su, 0) && hasSeq(su, 3) && hasSeq(su, 6)) { y.push({ id: 'ittsu', han: menzen ? 2 : 1 }); break; }
    // 三色同刻
    for (let a = 0; a < 9; a++) if (tris.some(s => s.k === a) && tris.some(s => s.k === 9 + a) && tris.some(s => s.k === 18 + a)) { y.push({ id: 'sandoukou', han: 2 }); break; }
    if (tris.length === 4) y.push({ id: 'toitoi', han: 2 });
    if (concealed === 3) y.push({ id: 'sanankou', han: 2 });
    if (kans === 3) y.push({ id: 'sankantsu', han: 2 });
    if (drTri === 2 && pair >= 31) y.push({ id: 'shousangen', han: 2 });
    const allYao = sets.every(setHasYao) && isYao(pair);
    if (allKinds.every(isYao)) y.push({ id: 'honroutou', han: 2 });
    else if (allYao && seqs.length) {
      if (hasHonor) y.push({ id: 'chanta', han: menzen ? 2 : 1 }); else y.push({ id: 'junchan', han: menzen ? 3 : 2 });
    }
    if (allSuits.size === 1) y.push(hasHonor ? { id: 'honitsu', han: menzen ? 3 : 2 } : { id: 'chinitsu', han: menzen ? 6 : 5 });
    // ---- 符（内訳つき）----
    const det = [['base', 20]];
    let raw = 20;
    const add = (id, f, x) => { det.push([id, f, x]); raw += f; };
    if (pinfu) { if (!tsumo) add('menzenRon', 10); }
    else {
      if (menzen && !tsumo) add('menzenRon', 10);
      if (tsumo) add('tsumo', 2);
      for (const s of tris) {
        let f = (s.k >= 27 || isTermNum(s.k)) ? 4 : 2;
        if (!s.open) f *= 2;
        if (s.kan) f *= 4;
        add('set', f, { k: s.k, open: !!s.open, kan: !!s.kan });
      }
      if (pair >= 31 || pair === sw || pair === rw) add('pair', pair === sw && pair === rw ? 4 : 2, { k: pair });
      if (I.wait === 'kan' || I.wait === 'pen' || I.wait === 'tan') add('wait', 2, I.wait);
      if (!menzen && raw === 20) add('openMin', 10);
    }
    let fu = Math.ceil(raw / 10) * 10;
    if (fu !== raw) det.push(['round', fu - raw]);
    return finish(y, 0, fu, false, ctx, 0, det);
  }

  // ドラを足して、点数のための han を決める
  function finish(yaku, _x, fu, isYm, ctx, ymN, det) {
    const cfg = ctx.cfg || {};
    if (cfg.mini) { if (isYm) return null; yaku = yaku.filter(q => MINI_YAKU[q.id]); }
    if (isYm) return { han: 13 * ymN, fu, yaku, yakuman: ymN, dora: 0, ura: 0, aka: 0, score: 1000 + ymN };
    let han = yaku.reduce((a, b) => a + b.han, 0);
    if (han === 0) return null;
    const d = ctx.dora | 0, u = ctx.ura | 0, a = ctx.aka | 0;
    const out = yaku.slice();
    if (d) { han += d; out.push({ id: 'dora', han: d }); }
    if (u) { han += u; out.push({ id: 'ura', han: u }); }
    if (a) { han += a; out.push({ id: 'aka', han: a }); }
    // 比較用の値：点数が高いほど大きい
    const pts = basePoints(han, fu, 0, cfg);
    return { han, fu, fuDetail: det || [['base', fu]], yaku: out, yakuman: 0, dora: d, ura: u, aka: a, score: pts * 1000 + han * 10 + fu / 10 };
  }

  function basePoints(han, fu, ym, cfg) {
    if (ym) return 8000 * ym;
    if (han >= 13) return (cfg && cfg.kazoe === false) ? 6000 : 8000;
    if (han >= 11) return 6000;
    if (han >= 8) return 4000;
    if (han >= 6) return 3000;
    if (han >= 5) return 2000;
    return Math.min(2000, fu * Math.pow(2, han + 2));
  }
  const up100 = x => Math.ceil(x / 100) * 100;
  function limitName(han, fu, ym, cfg) {
    if (ym) return ym >= 2 ? 'double-yakuman' : 'yakuman';
    if (han >= 13) return (cfg && cfg.kazoe === false) ? 'sanbaiman' : 'kazoe';
    if (han >= 11) return 'sanbaiman'; if (han >= 8) return 'baiman'; if (han >= 6) return 'haneman';
    return basePoints(han, fu, 0, cfg) >= 2000 ? 'mangan' : '';
  }
  // 点数：{ base, ron, tsumoOya（子があがった時の親の支払い）, tsumoKo（子の支払い）, tsumoAll（親があがった時の全員の支払い） }
  function points(han, fu, ym, dealer, cfg) {
    const base = basePoints(han, fu, ym, cfg);
    const r = { base, limit: limitName(han, fu, ym, cfg) };
    if (dealer) { r.ron = up100(base * 6); r.tsumoAll = up100(base * 2); r.total = r.tsumoAll * 3; }
    else { r.ron = up100(base * 4); r.tsumoOya = up100(base * 2); r.tsumoKo = up100(base); r.total = r.tsumoOya + r.tsumoKo * 2; }
    return r;
  }

  // ================================================================= ゲーム
  const DEFAULTS = { mode: 'hanchan', mini: false, aka: true, ura: true, ippatsu: true, kuitan: true, kazoe: true, doubleYakuman: true, tobi: true, agariyame: true, west: true,
    start: 25000, ret: 30000, uma: '10-20', oka: true, multiRon: true };
  const UMA = { '10-20': [20, 10, -10, -20], '5-10': [10, 5, -5, -10], 'none': [0, 0, 0, 0] };
  const clone = o => JSON.parse(JSON.stringify(o));
  const seatWind = (st, s) => (s - st.dealer + 4) % 4;
  const remaining = st => st.liveEnd - st.wp;
  const sortIds = a => a.sort((x, y) => x - y);

  function create(o) {
    o = o || {};
    const cfg = Object.assign({}, DEFAULTS, o.cfg || {});
    if (cfg.mini) Object.assign(cfg, { mode: 'mini', aka: false, ura: false, ippatsu: false, tobi: false, west: false });
    if (o.mode) cfg.mode = o.mode;
    const seed = (o.seed == null ? 1 : o.seed) >>> 0;
    const st = { v: 1, cfg, seed, humans: o.humans ? o.humans.slice() : [0], levels: o.levels ? o.levels.slice() : [2, 2, 2, 2],
      scores: [cfg.start, cfg.start, cfg.start, cfg.start], dealer: 0, roundWind: 0, kyoku: 0, honba: 0, kyotaku: 0, roundNo: 0, over: false, customWall: o.wall ? o.wall.slice() : null, log: [] };
    if (o.dummyCpu) st.dummyCpu = true;
    startRound(st);
    return st;
  }

  function startRound(st, wallOverride) {
    const cfg = st.cfg;
    let wall;
    if (wallOverride) wall = wallOverride.slice();
    else if (st.customWall && st.roundNo === 0) wall = st.customWall.slice();
    else wall = shuffledWall(roundSeed(st.seed, st.roundNo));
    st.wall = wall; st.wp = 0; st.liveEnd = 122; st.dead = wall.slice(122); st.rin = 0; st.kans = 0; st.doraN = 1; st.pendingDora = 0;
    st.hands = [[], [], [], []]; st.melds = [[], [], [], []]; st.rivers = [[], [], [], []];
    // 配牌：親から 4枚ずつ×3、1枚ずつ
    const order = [0, 1, 2, 3].map(i => (st.dealer + i) % 4);
    for (let r = 0; r < 3; r++) for (const s of order) for (let i = 0; i < 4; i++) st.hands[s].push(st.wall[st.wp++]);
    for (const s of order) st.hands[s].push(st.wall[st.wp++]);
    st.hands.forEach(sortIds);
    st.safe = [[], [], [], []]; st.riichi = [0, 0, 0, 0]; st.riichiAt = [-1, -1, -1, -1]; st.ippatsu = [false, false, false, false];
    st.furi = [false, false, false, false]; st.tmpFuri = [false, false, false, false];
    st.noCalls = true; st.turn = st.dealer; st.drawn = -1; st.phase = 'discard'; st.rinshanDraw = false; st.kuikae = [];
    st.riichiPending = -1; st.call = null; st.result = null; st.discards = 0; st.lastDiscard = null; st.afterKan = false; st.nagashiOut = [false, false, false, false];
    st.ev = [];
    drawFor(st, st.dealer, false);
    st.first = true;
    return st;
  }

  function drawFor(st, seat, rinshan) {
    let id;
    if (rinshan) { id = st.dead[st.rin++]; st.liveEnd--; } else id = st.wall[st.wp++];
    st.hands[seat].push(id); sortIds(st.hands[seat]);
    st.drawn = id; st.rinshanDraw = !!rinshan; st.turn = seat; st.phase = 'discard';
    return id;
  }

  const closedCounts = (st, s) => countsOf(st.hands[s]);
  const meldCount = (st, s) => st.melds[s].length;
  const isMenzen = (st, s) => st.melds[s].every(m => !m.open);
  const riverKinds = (st, s) => st.rivers[s].map(r => r.t >> 2);

  function waitsOf(st, s, c) { return waits(c, meldCount(st, s)); }
  function furitenState(st, s, handCounts) {
    // 'perm' | 'temp' | 'river' | ''（手が13枚のときの、自分の待ちに対して）
    if (!handCounts && st.hands[s].length % 3 === 2) return st.furi[s] ? 'riichi' : st.tmpFuri[s] ? 'temp' : '';   // 14枚のとき（自分の番）は、旗だけ
    const w = handCounts ? waits(handCounts, meldCount(st, s)) : waitsOf(st, s, closedCounts(st, s));
    if (!w.length) return '';
    if (st.furi[s]) return 'riichi';
    if (st.tmpFuri[s]) return 'temp';
    const rk = new Set(riverKinds(st, s));
    return w.some(k => rk.has(k)) ? 'river' : '';
  }

  function doraList(st) { const out = []; for (let i = 0; i < st.doraN; i++) out.push(st.dead[4 + 2 * i] >> 2); return out; }
  function uraList(st) { const out = []; for (let i = 0; i < st.doraN; i++) out.push(st.dead[5 + 2 * i] >> 2); return out; }
  function countDora(st, s, ids, withUra) {
    const all = ids.concat(...st.melds[s].map(m => m.tiles));
    let d = 0, u = 0, a = 0;
    for (const ind of doraList(st)) { const k = doraOf(ind); d += all.filter(id => id >> 2 === k).length; }
    if (withUra) for (const ind of uraList(st)) { const k = doraOf(ind); u += all.filter(id => id >> 2 === k).length; }
    if (st.cfg.aka) a = all.filter(isRed).length;
    return { dora: d, ura: u, aka: a };
  }

  // あがりの評価：seat が winTile で（ロンなら他家の牌、ツモなら手の牌）あがれるか
  function agariInfo(st, seat, tsumo, tile, flags) {
    flags = flags || {};
    const ids = tsumo ? st.hands[seat].slice() : st.hands[seat].concat([tile]);
    const closed = countsOf(ids);
    const nm = st.melds[seat].length;
    if (!isComplete(closed, nm)) return null;
    const dr = countDora(st, seat, ids, !!st.riichi[seat] && st.cfg.ura);
    const live = remaining(st);
    const first = st.noCalls && st.rivers[seat].length === 0;
    const ctx = { closed, melds: st.melds[seat].map(m => ({ type: m.type, kind: m.kind, open: m.open })), win: tile >> 2, tsumo,
      riichi: st.riichi[seat], ippatsu: st.ippatsu[seat], haitei: tsumo && !st.rinshanDraw && live === 0, houtei: !tsumo && !flags.chankan && live === 0,
      rinshan: tsumo && st.rinshanDraw, chankan: !!flags.chankan,
      tenhou: tsumo && seat === st.dealer && first && st.noCalls && st.discards === 0, chiihou: tsumo && seat !== st.dealer && first && st.noCalls,
      seatWind: seatWind(st, seat), roundWind: st.roundWind, dora: dr.dora, ura: dr.ura, aka: dr.aka, cfg: st.cfg };
    const r = evaluate(ctx);
    if (!r) return null;
    r.seat = seat; r.tsumo = tsumo; r.win = tile;
    return r;
  }

  // ---------------------------------------------------------------- 手の選択肢
  function riichiOptions(st, seat) {
    // 捨てるとテンパイになる牌（手牌14枚のとき）
    const out = [];
    if (st.riichi[seat] || !isMenzen(st, seat) || st.scores[seat] < 1000 || remaining(st) < 4) return out;
    const c = closedCounts(st, seat), seen = {};
    for (const id of st.hands[seat]) {
      const k = id >> 2; if (seen[k]) { if (seen[k].ok) out.push(id); continue; }
      c[k]--; const w = waits(c, meldCount(st, seat)); c[k]++;
      seen[k] = { ok: w.length > 0 }; if (w.length) out.push(id);
    }
    return out;
  }
  function ankanOptions(st, seat) {
    const out = [], c = closedCounts(st, seat);
    if (remaining(st) <= 0 || st.kans >= 4 || st.cfg.mini) return out;
    for (let k = 0; k < NK; k++) {
      if (c[k] < 4) continue;
      if (st.riichi[seat]) {
        // リーチ後は、待ちが変わらず、引いた牌の暗槓だけ
        if (st.drawn >> 2 !== k) continue;
        const a = c.slice(); a[k]--; const before = waits(a, meldCount(st, seat));
        const b = c.slice(); b[k] -= 4; const after = waits(b, meldCount(st, seat) + 1);
        if (!before.length || before.join() !== after.join()) continue;
        // 4枚を面子（刻子）として使って待ちが同じかを雑に確かめる：待ちに k が入らない
        if (before.indexOf(k) >= 0) continue;
      }
      out.push(k);
    }
    return out;
  }
  function kakanOptions(st, seat) {
    const out = [];
    if (remaining(st) <= 0 || st.kans >= 4 || st.cfg.mini) return out;
    for (const m of st.melds[seat]) if (m.type === 'pon') { const id = st.hands[seat].find(x => x >> 2 === m.kind); if (id != null) out.push(id); }
    return out;
  }
  function kyuushuOk(st, seat) {
    if (st.cfg.mini || !st.noCalls || st.rivers[seat].length !== 0 || st.drawn < 0 || st.rinshanDraw) return false;
    const ks = new Set(st.hands[seat].map(x => x >> 2).filter(isYao));
    return ks.size >= 9;
  }

  function legal(st, seat) {
    const out = [];
    if (st.phase === 'discard' && seat === st.turn) {
      const h = st.hands[seat];
      if (st.riichi[seat]) out.push({ t: 'discard', tile: st.drawn });
      else for (const id of h) { if (st.kuikae.indexOf(id >> 2) >= 0) continue; if (out.some(a => a.tile >> 2 === id >> 2 && isRed(a.tile) === isRed(id))) continue; out.push({ t: 'discard', tile: id }); }
      if (!out.length) for (const id of h) out.push({ t: 'discard', tile: id });
      if (st.drawn >= 0) { const ro = riichiOptions(st, seat); for (const a of out.slice()) if (ro.some(id => id >> 2 === a.tile >> 2)) out.push({ t: 'discard', tile: a.tile, riichi: true }); }
      if (st.drawn >= 0 && agariInfo(st, seat, true, st.drawn)) out.push({ t: 'tsumo' });
      if (st.drawn >= 0) {
        for (const k of ankanOptions(st, seat)) out.push({ t: 'ankan', kind: k });
        for (const id of kakanOptions(st, seat)) out.push({ t: 'kakan', tile: id });
        if (kyuushuOk(st, seat)) out.push({ t: 'kyuushu' });
      }
    } else if (st.phase === 'call' && st.call && st.call.opts[seat] && st.call.resp[seat] == null) {
      const o = st.call.opts[seat];
      if (o.ron) out.push({ t: 'ron' });
      for (const u of o.pon || []) out.push({ t: 'pon', use: u });
      for (const u of o.chii || []) out.push({ t: 'chii', use: u });
      if (o.kan) out.push({ t: 'daiminkan' });
      out.push({ t: 'pass' });
    }
    return out;
  }
  const waiting = st => (st.phase === 'discard' ? [st.turn] : st.phase === 'call' && st.call ? [0, 1, 2, 3].filter(s => st.call.opts[s] && st.call.resp[s] == null) : []);
  const sameAct = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------------------------------------------------------------- 手の実行
  function apply(st, seat, act) {
    if (st.phase === 'end' || st.over) return null;
    if (!act || typeof act.t !== 'string') return null;
    st.ev = [];
    const ev = st.ev;
    if (st.phase === 'discard') {
      if (seat !== st.turn) return null;
      switch (act.t) {
        case 'discard': {
          if (!st.hands[seat].includes(act.tile)) return null;
          const L = legal(st, seat);
          if (!L.some(a => a.t === 'discard' && a.tile >> 2 === act.tile >> 2 && (!!a.riichi) === (!!act.riichi))) return null;
          doDiscard(st, seat, act.tile, !!act.riichi); break;
        }
        case 'tsumo': {
          const r = agariInfo(st, seat, true, st.drawn); if (!r) return null;
          endWithAgari(st, [r], seat, seat); break;
        }
        case 'ankan': {
          if (ankanOptions(st, seat).indexOf(act.kind) < 0) return null;
          // 国士の暗槓ロン（搶槓）：国士だけ
          const ids = st.hands[seat].filter(x => x >> 2 === act.kind);
          st.melds[seat].push({ type: 'ankan', kind: act.kind, tiles: ids, open: false, from: seat, called: -1 });
          st.hands[seat] = st.hands[seat].filter(x => x >> 2 !== act.kind);
          ev.push({ t: 'ankan', s: seat, kind: act.kind });
          const ch = chankanOpts(st, seat, ids[0], true);
          st.noCalls = false; st.ippatsu = [false, false, false, false];
          if (ch) { st.call = { kind: 'ankan', tile: ids[0], from: seat, opts: ch, resp: {}, meld: true }; st.phase = 'call'; st.drawn = -1; break; }
          finishKan(st, seat, true); break;
        }
        case 'kakan': {
          if (kakanOptions(st, seat).indexOf(act.tile) < 0) return null;
          const m = st.melds[seat].find(x => x.type === 'pon' && x.kind === act.tile >> 2);
          st.hands[seat].splice(st.hands[seat].indexOf(act.tile), 1);
          ev.push({ t: 'kakan', s: seat, kind: m.kind, tile: act.tile });
          st.noCalls = false; st.ippatsu = [false, false, false, false];
          const ch = chankanOpts(st, seat, act.tile, false);
          m.pending = act.tile;
          if (ch) { st.call = { kind: 'kakan', tile: act.tile, from: seat, opts: ch, resp: {} }; st.phase = 'call'; st.drawn = -1; break; }
          finishKan(st, seat, false); break;
        }
        case 'kyuushu': {
          if (!kyuushuOk(st, seat)) return null;
          drawEnd(st, 'kyuushu', seat); break;
        }
        default: return null;
      }
      return { ev: st.ev };
    }
    if (st.phase === 'call' && st.call) {
      const L = legal(st, seat);
      if (!L.length) return null;
      let a = L.find(x => x.t === act.t && (act.t !== 'pon' && act.t !== 'chii' || sameAct(x.use, act.use)));
      if (!a && (act.t === 'pon' || act.t === 'chii') && !act.use) a = L.find(x => x.t === act.t);
      if (!a) return null;
      st.call.resp[seat] = a;
      if (a.t === 'pass' && st.call.opts[seat].ron) {
        st.tmpFuri[seat] = true; if (st.riichi[seat]) st.furi[seat] = true;
        ev.push({ t: 'furiten', s: seat });
      }
      if (waiting(st).length === 0) resolveCall(st);
      return { ev: st.ev };
    }
    return null;
  }

  function chankanOpts(st, from, tile, ankan) {
    const opts = {}; let any = false;
    for (let s = 0; s < 4; s++) {
      if (s === from) continue;
      const c = closedCounts(st, s); c[tile >> 2]++;
      if (!isComplete(c, meldCount(st, s))) continue;
      if (ankan && !(meldCount(st, s) === 0 && isKokushi(c))) continue;
      if (furitenState(st, s)) continue;
      const r = agariInfo(st, s, false, tile, { chankan: true });
      if (r) { opts[s] = { ron: true }; any = true; }
    }
    return any ? opts : null;
  }

  // 食い替え禁止：チーでもらった牌と、同じ形の反対側の牌は、そのターンに捨てられない
  function chiForbid(kk, ks) {
    const out = [kk], n = kk % 9;
    if (ks[0] === kk && n + 3 <= 8) out.push(kk + 3);
    if (ks[2] === kk && n - 3 >= 0) out.push(kk - 3);
    return out;
  }
  function doDiscard(st, seat, tile, riichi) {
    const ev = st.ev;
    st.hands[seat].splice(st.hands[seat].indexOf(tile), 1);
    const tsumogiri = tile === st.drawn;
    const firstDiscard = st.rivers[seat].length === 0;
    st.rivers[seat].push({ t: tile, riichi: false, tsumogiri, called: false });
    st.lastDiscard = { seat, tile, idx: st.rivers[seat].length - 1 };
    st.discards++;
    st.tmpFuri[seat] = false; st.kuikae = [];
    st.ippatsu[seat] = false;
    if (riichi) {
      st.riichiPending = seat; st.rivers[seat][st.rivers[seat].length - 1].riichi = true;
      st.riichi[seat] = (st.noCalls && firstDiscard) ? 2 : 1; st.riichiAt[seat] = st.rivers[seat].length - 1;
    }
    st.drawn = -1; st.rinshanDraw = false;
    for (let o = 0; o < 4; o++) if (o !== seat && st.riichi[o] && st.safe[o].indexOf(tile >> 2) < 0) st.safe[o].push(tile >> 2);   // 立直者に通った牌（現物と同じ扱い）
    ev.push({ t: 'discard', s: seat, tile, riichi, tsumogiri });
    // カンドラ（大明槓・加槓）は打牌のあとにめくる
    if (st.pendingDora) { st.doraN += st.pendingDora; ev.push({ t: 'dora', n: st.doraN }); st.pendingDora = 0; }
    // 他家の反応
    const opts = {}; let any = false;
    const last = remaining(st) === 0;
    for (let k = 1; k < 4; k++) {
      const s = (seat + k) % 4, o = {}; let has = false;
      const c = closedCounts(st, s); c[tile >> 2]++;
      if (isComplete(c, meldCount(st, s)) && !furitenState(st, s)) {
        const r = agariInfo(st, s, false, tile);
        if (r) { o.ron = true; has = true; }
      }
      if (!st.riichi[s] && !last && !st.cfg.mini) {
        const hk = countsOf(st.hands[s]); const kk = tile >> 2;
        const ids = st.hands[s].filter(x => x >> 2 === kk);
        if (hk[kk] >= 2) {
          const us = []; const nr = ids.filter(x => !isRed(x)), rd = ids.filter(isRed);
          const pool = nr.concat(rd);
          us.push([pool[0], pool[1]]);
          if (st.cfg.aka && rd.length && nr.length >= 2 && ids.length >= 3) us.push([nr[0], rd[0]]);
          o.pon = us.filter((u, i, a) => a.findIndex(v => sameAct(v, u)) === i); has = true;
          if (hk[kk] >= 3 && st.kans < 4 && remaining(st) > 0) { o.kan = true; }
        }
        if (k === 1 && kk < 27) {
          const n = kk % 9, us = [];
          for (const [a, b] of [[-2, -1], [-1, 1], [1, 2]]) {
            if (n + a < 0 || n + b > 8) continue;
            const la = st.hands[s].filter(x => x >> 2 === kk + a), lb = st.hands[s].filter(x => x >> 2 === kk + b);
            if (!la.length || !lb.length) continue;
            const na = la.filter(x => !isRed(x)), ra = la.filter(isRed), nb = lb.filter(x => !isRed(x)), rb = lb.filter(isRed);
            const variants = [[na.length ? na[0] : ra[0], nb.length ? nb[0] : rb[0]]];
            if (st.cfg.aka) { if (na.length && ra.length) variants.push([ra[0], variants[0][1]]); if (nb.length && rb.length) variants.push([variants[0][0], rb[0]]); }
            const forb = chiForbid(kk, [kk + a, kk + b, kk].sort((x, y) => x - y));
            for (const u of variants) if (st.hands[s].some(x => x !== u[0] && x !== u[1] && forb.indexOf(x >> 2) < 0)) us.push(u);
          }
          if (us.length) { o.chii = us.filter((u, i, arr) => arr.findIndex(v => sameAct(v, u)) === i); has = true; }
        }
      }
      if (has) { opts[s] = o; any = true; }
    }
    if (any) { st.call = { kind: 'discard', tile, from: seat, opts, resp: {} }; st.phase = 'call'; return; }
    afterDiscardSettled(st, seat);
  }

  // 打牌が誰にも鳴かれなかった・ロンされなかったとき：リーチ成立 → 流局判定 → 次の人のツモ
  function afterDiscardSettled(st, seat) {
    const ev = st.ev;
    st.call = null;
    if (st.riichiPending >= 0) {
      const r = st.riichiPending; st.riichiPending = -1;
      st.scores[r] -= 1000; st.kyotaku++; st.ippatsu[r] = true; ev.push({ t: 'riichi', s: r });
      if (st.riichi.every(x => x) && st.rivers.every(rv => rv.length > 0)) { drawEnd(st, 'suucha', seat); return; }
    }
    // 四風連打
    if (st.noCalls && st.rivers.every(rv => rv.length === 1)) {
      const k = st.rivers[0][0].t >> 2;
      if (k >= 27 && k <= 30 && st.rivers.every(rv => rv[0].t >> 2 === k)) { drawEnd(st, 'suufon', seat); return; }
    }
    if (st.kans === 4 && !st.melds.some(ms => ms.filter(x => x.type === 'daiminkan' || x.type === 'ankan' || x.type === 'kakan').length === 4)) { drawEnd(st, 'suukan', seat); return; }
    if (remaining(st) <= 0) { drawEnd(st, 'exhaust', seat); return; }
    nextDraw(st, (seat + 1) % 4);
  }
  function nextDraw(st, seat) { st.call = null; st.kuikae = []; drawFor(st, seat, false); st.ev.push({ t: 'draw', s: seat }); }

  function resolveCall(st) {
    const c = st.call, ev = st.ev;
    const resp = c.resp;
    const rons = [0, 1, 2, 3].filter(s => resp[s] && resp[s].t === 'ron');
    // 順番：捨てた人の次から
    rons.sort((a, b) => ((a - c.from + 4) % 4) - ((b - c.from + 4) % 4));
    if (rons.length) {
      if (rons.length === 3) { for (const s of rons) { } drawEnd(st, 'sanchahou', c.from); return; }
      const use = st.cfg.multiRon ? rons : [rons[0]];
      const res = use.map(s => agariInfo(st, s, false, c.tile, { chankan: c.kind !== 'discard' }));
      endWithAgari(st, res, c.from, use[0]); return;
    }
    // 鳴き（ポン・カンが先）
    const pon = [0, 1, 2, 3].find(s => resp[s] && (resp[s].t === 'pon' || resp[s].t === 'daiminkan'));
    const chii = [0, 1, 2, 3].find(s => resp[s] && resp[s].t === 'chii');
    if (c.kind === 'kakan' || c.kind === 'ankan') {
      // 搶槓されなかった → カンの完成
      const k = c.from;
      if (c.kind === 'kakan') finishKan(st, k, false); else finishKan(st, k, true);
      return;
    }
    const caller = pon != null ? pon : chii;
    if (caller != null) { doCall(st, caller, resp[caller], c); return; }
    afterDiscardSettled(st, c.from);
  }

  function doCall(st, s, a, c) {
    const ev = st.ev, from = c.from, tile = c.tile, kind = tile >> 2;
    // 捨て牌を「鳴かれた」にする
    const rv = st.rivers[from]; rv[rv.length - 1].called = true;
    if (st.riichiPending >= 0) {
      // 鳴かれたら、リーチは成立する（捨て牌がロンされなかった）
      const r = st.riichiPending; st.riichiPending = -1; st.scores[r] -= 1000; st.kyotaku++; ev.push({ t: 'riichi', s: r });
    }
    st.noCalls = false; st.ippatsu = [false, false, false, false];
    st.call = null; st.drawn = -1; st.kuikae = [];
    if (a.t === 'chii') {
      const ids = a.use.concat([tile]);
      const ks = ids.map(x => x >> 2).sort((x, y) => x - y);
      for (const u of a.use) st.hands[s].splice(st.hands[s].indexOf(u), 1);
      st.melds[s].push({ type: 'chi', kind: ks[0], tiles: ids.sort((x, y) => x - y), open: true, from, called: tile });
      st.kuikae = chiForbid(kind, ks);
      ev.push({ t: 'chii', s, from, tile, use: a.use });
      st.turn = s; st.phase = 'discard'; st.drawn = -1; st.rinshanDraw = false;
    } else if (a.t === 'pon') {
      for (const u of a.use) st.hands[s].splice(st.hands[s].indexOf(u), 1);
      st.melds[s].push({ type: 'pon', kind, tiles: a.use.concat([tile]).sort((x, y) => x - y), open: true, from, called: tile });
      st.kuikae = [kind];
      ev.push({ t: 'pon', s, from, tile, use: a.use });
      st.turn = s; st.phase = 'discard'; st.drawn = -1; st.rinshanDraw = false;
    } else {
      const ids = st.hands[s].filter(x => x >> 2 === kind);
      st.hands[s] = st.hands[s].filter(x => x >> 2 !== kind);
      st.melds[s].push({ type: 'daiminkan', kind, tiles: ids.concat([tile]).sort((x, y) => x - y), open: true, from, called: tile });
      ev.push({ t: 'daiminkan', s, from, tile });
      st.kans++; st.pendingDora++;
      kanDraw(st, s);
    }
  }

  function finishKan(st, s, ankan) {
    const ev = st.ev;
    if (!ankan) {
      const m = st.melds[s].find(x => x.pending != null);
      m.type = 'kakan'; m.added = m.pending; m.tiles.push(m.pending); m.tiles.sort((x, y) => x - y); delete m.pending;
      st.pendingDora++;
    } else st.doraN++, ev.push({ t: 'dora', n: st.doraN });
    st.kans++; st.call = null;
    kanDraw(st, s);
  }
  function kanDraw(st, s) {
    st.ev.push({ t: 'rinshan', s });
    drawFor(st, s, true);
    st.kuikae = [];
  }

  // ---------------------------------------------------------------- 局の終わり
  function endWithAgari(st, results, from, headSeat) {
    const ev = st.ev, cfg = st.cfg;
    const delta = [0, 0, 0, 0];
    const winners = [];
    let first = true;
    for (const r of results) {
      const s = r.seat, dealer = s === st.dealer;
      const p = points(r.han, r.fu, r.yakuman, dealer, cfg);
      const w = { seat: s, han: r.han, fu: r.fu, yaku: r.yaku, yakuman: r.yakuman, tsumo: r.tsumo, win: r.win, limit: p.limit, pay: {}, total: 0, base: p.base };
      const hon = first ? st.honba : 0;
      if (r.tsumo) {
        for (let o = 0; o < 4; o++) {
          if (o === s) continue;
          const x = (dealer ? p.tsumoAll : (o === st.dealer ? p.tsumoOya : p.tsumoKo)) + hon * 100;
          delta[o] -= x; delta[s] += x; w.pay[o] = x; w.total += x;
        }
      } else {
        const x = p.ron + hon * 300; delta[from] -= x; delta[s] += x; w.pay[from] = x; w.total = x;
      }
      w.honba = hon; w.hand = st.hands[s].slice(); w.melds = clone(st.melds[s]);
      w.dora = doraList(st).map(k => k); w.ura = st.riichi[s] && cfg.ura ? uraList(st) : [];
      winners.push(w);
      first = false;
    }
    // リーチ棒は、いちばん近い人（ツモなら本人）へ
    delta[results[0].seat] += st.kyotaku * 1000;
    winners[0].sticks = st.kyotaku;
    for (let s = 0; s < 4; s++) st.scores[s] += delta[s];
    const dealerWon = winners.some(w => w.seat === st.dealer);
    st.result = { type: results[0].tsumo ? 'tsumo' : 'ron', from, winners, delta, dealerWon, renchan: dealerWon, resetHonba: !dealerWon, sticksTaken: st.kyotaku };
    st.kyotaku = 0;
    ev.push({ t: 'agari', result: st.result });
    st.phase = 'end'; st.call = null;
    st.riichiPending = -1;
  }

  function tenpaiOf(st, s) { return waits(closedCounts(st, s), meldCount(st, s)).length > 0; }
  function nagashi(st, s) { return st.rivers[s].length > 0 && st.rivers[s].every(r => isYao(r.t >> 2) && !r.called); }

  function drawEnd(st, why, seat) {
    const ev = st.ev;
    const delta = [0, 0, 0, 0];
    let tenpai = [false, false, false, false], nag = [];
    let renchan = true;
    st.riichiPending = -1;
    if (why === 'exhaust') {
      for (let s = 0; s < 4; s++) tenpai[s] = st.riichi[s] ? true : tenpaiOf(st, s);
      for (let s = 0; s < 4; s++) if (nagashi(st, s)) nag.push(s);
      if (nag.length) {
        for (const s of nag) for (let o = 0; o < 4; o++) { if (o === s) continue; const x = s === st.dealer ? 2000 : (o === st.dealer ? 2000 : 1000); delta[o] -= x; delta[s] += x; }
      } else {
        const t = tenpai.filter(x => x).length;
        if (t > 0 && t < 4) for (let s = 0; s < 4; s++) delta[s] += tenpai[s] ? 3000 / t : -3000 / (4 - t);
      }
      renchan = tenpai[st.dealer];
    }
    for (let s = 0; s < 4; s++) st.scores[s] += delta[s];
    st.result = { type: 'draw', why, tenpai, nagashi: nag, delta, renchan, resetHonba: false, hands: st.hands.map(h => h.slice()), melds: clone(st.melds), seat };
    ev.push({ t: 'draw-end', why, result: st.result });
    st.phase = 'end'; st.call = null;
  }

  // ---------------------------------------------------------------- 次の局・ゲームの終わり
  function nextRound(st) {
    if (st.phase !== 'end' || st.over) return false;
    const r = st.result, cfg = st.cfg;
    st.log.push({ n: st.roundNo, wind: st.roundWind, kyoku: st.kyoku, honba: st.honba, type: r.type, delta: r.delta.slice() });
    const lastWind = cfg.mode === 'east' ? 0 : 1, maxS = Math.max(...st.scores);
    let over = cfg.mode === 'mini';
    if (cfg.tobi && st.scores.some(x => x < 0)) over = true;
    const dealerTop = st.scores[st.dealer] === maxS && maxS >= 30000;
    if (!over && st.roundWind > lastWind && maxS >= 30000) over = true;            // 西入：30000点に届いたら終わり
    if (!over && r.renchan) {
      const finishedDealer = r.type !== 'draw' ? r.dealerWon : (r.why === 'exhaust' && r.tenpai[st.dealer]);
      if (st.roundWind === lastWind && st.kyoku === 3 && cfg.agariyame && finishedDealer && dealerTop) over = true;   // あがりやめ
      if (st.roundWind > lastWind && st.kyoku === 3 && cfg.agariyame && finishedDealer && dealerTop) over = true;
    }
    if (!over && !r.renchan && st.kyoku === 3) {
      if (st.roundWind >= lastWind + 1) over = true;                                  // 西4局まで
      else if (st.roundWind === lastWind && (!cfg.west || cfg.mode === 'east' || maxS >= 30000)) over = true;
    }
    if (over) { st.over = true; st.final = finalScores(st); return true; }
    if (r.type === 'draw' || r.dealerWon) st.honba++; else st.honba = 0;
    if (!r.renchan) { st.dealer = (st.dealer + 1) % 4; st.kyoku++; if (st.kyoku > 3) { st.kyoku = 0; st.roundWind++; } }
    st.roundNo++;
    startRound(st);
    return true;
  }

  function finalScores(st) {
    const cfg = st.cfg, uma = UMA[cfg.uma] || UMA['10-20'];
    const order = [0, 1, 2, 3].sort((a, b) => st.scores[b] - st.scores[a] || a - b);
    const rank = [0, 0, 0, 0]; order.forEach((s, i) => { rank[s] = i + 1; });
    const ret = cfg.oka ? cfg.ret : cfg.start, oka = cfg.oka ? (cfg.ret - cfg.start) * 4 / 1000 : 0;
    const pts = [0, 0, 0, 0];
    order.forEach((s, i) => { pts[s] = Math.round(((st.scores[s] - ret) / 1000 + uma[i] + (i === 0 ? oka : 0)) * 10) / 10; });
    return { order, rank, pts, scores: st.scores.slice(), uma: cfg.uma };
  }

  // 棋譜の再生：その局の始まりの状態（牌山・親・点数・本場・供託）から、手を1つずつ当てはめる
  function restoreRound(info) {
    const st = create({ cfg: info.cfg, seed: info.seed, levels: info.levels, humans: info.humans, wall: info.wall });
    st.dealer = info.dealer; st.roundWind = info.roundWind; st.kyoku = info.kyoku; st.honba = info.honba; st.kyotaku = info.kyotaku; st.scores = info.scores.slice(); st.roundNo = info.roundNo;
    st.customWall = null; startRound(st, info.wall); return st;
  }
  function roundInfo(st) { return { cfg: clone(st.cfg), seed: st.seed, levels: st.levels.slice(), humans: st.humans.slice(), wall: st.wall.slice(), dealer: st.dealer, roundWind: st.roundWind, kyoku: st.kyoku, honba: st.honba, kyotaku: st.kyotaku, scores: st.scores.slice(), roundNo: st.roundNo }; }

  // ================================================================= AI やUI のための補助
  // seat から見える牌の枚数（自分の手・全員の河・副露・ドラ表示牌）
  function visibleCounts(st, seat) {
    const c = countsOf(st.hands[seat]);
    for (let s = 0; s < 4; s++) {
      for (const r of st.rivers[s]) c[r.t >> 2]++;
      for (const m of st.melds[s]) { for (const t of m.tiles) c[t >> 2]++; if (m.called >= 0) c[m.called >> 2]--; }
    }
    for (const k of doraList(st)) c[k]++;
    return c;
  }
  function doraIndicators(st) { return st.dead.filter((x, i) => i >= 4 && i % 2 === 0 && (i - 4) / 2 < st.doraN); }
  function uraIndicators(st) { return st.dead.filter((x, i) => i >= 5 && i % 2 === 1 && (i - 5) / 2 < st.doraN); }
  const reasonText = why => ({ exhaust: ['荒牌平局', 'Exhaustive draw'], kyuushu: ['九種九牌', 'Nine different terminals/honors'], suufon: ['四風連打', 'Four winds'], suucha: ['四家立直', 'Four riichi'], suukan: ['四開槓', 'Four kans'], sanchahou: ['三家和', 'Triple ron'] }[why] || [why, why]);


  // ================================================================= 牌山を決めてつくる（テスト・?debug 用）
  // spec: { hands: [席0..3 の配牌13枚（'123m456p…'。0 は赤五）], draws: 'ツモる牌の順（親の最初のツモから。全員ぶんを順に）', dora: '表示牌', ura: '裏表示牌', rin: '嶺上牌の順', dealer: 0 }
  // → 136枚の山（id の配列）。st = create({ wall }) に渡す。足りないところは残りの牌でうめる（シードつきでシャッフル）。
  function tilesOf(str) {
    const out = []; let pend = [];
    for (const ch of String(str || '').replace(/\s+/g, '')) {
      if (ch >= '0' && ch <= '9') pend.push(+ch);
      else { const base = { m: 0, p: 9, s: 18, z: 27 }[ch]; if (base == null) throw new Error('bad tiles: ' + str); for (const n of pend) out.push({ k: ch === 'z' ? base + n - 1 : base + (n === 0 ? 5 : n) - 1, red: n === 0 && ch !== 'z' }); pend = []; }
    }
    return out;
  }
  function rigWall(spec) {
    const wall = new Array(136).fill(-1), used = new Set(), dealer = spec.dealer || 0;
    const take = t => {
      if (t.red) { const id = t.k * 4; if (used.has(id)) throw new Error('red five used twice'); used.add(id); return id; }
      for (let c = (isRed(t.k * 4) ? 1 : 0); c < 4; c++) { const id = t.k * 4 + c; if (!used.has(id)) { used.add(id); return id; } }
      for (let c = 0; c < 4; c++) { const id = t.k * 4 + c; if (!used.has(id)) { used.add(id); return id; } }
      throw new Error('too many ' + kindName(t.k, true));
    };
    // 赤だけ先に確保（普通の五に取られないように）
    const all = []; const push = (arr, pos) => arr.forEach((t, i) => all.push({ t, pos: pos(i) }));
    const order = [0, 1, 2, 3].map(i => (dealer + i) % 4);
    (spec.hands || []).forEach((hs, seat) => {
      if (!hs) return;
      const ts = tilesOf(hs), oi = order.indexOf(seat);
      if (ts.length !== 13) throw new Error('a dealt hand needs 13 tiles: seat ' + seat + ' has ' + ts.length);
      ts.forEach((t, i) => { const r = i < 12 ? (i / 4) | 0 : 3, j = i < 12 ? i % 4 : 0; all.push({ t, pos: r < 3 ? r * 16 + oi * 4 + j : 48 + oi }); });
    });
    tilesOf(spec.draws).forEach((t, i) => all.push({ t, pos: 52 + i }));
    tilesOf(spec.rin).forEach((t, i) => all.push({ t, pos: 122 + i }));
    tilesOf(spec.dora).forEach((t, i) => all.push({ t, pos: 126 + 2 * i }));
    tilesOf(spec.ura).forEach((t, i) => all.push({ t, pos: 127 + 2 * i }));
    all.sort((a, b) => (b.t.red ? 1 : 0) - (a.t.red ? 1 : 0));
    for (const a of all) { if (wall[a.pos] >= 0) throw new Error('wall position used twice ' + a.pos); wall[a.pos] = take(a.t); }
    const rest = []; for (let i = 0; i < 136; i++) if (!used.has(i)) rest.push(i);
    const r = mulberry32(spec.fill == null ? 12345 : spec.fill); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    for (let i = 0; i < 136; i++) if (wall[i] < 0) wall[i] = rest.pop();
    return wall;
  }

  const API = { restoreRound, roundInfo, rigWall, tilesOf, NK, DEFAULTS, UMA, YAKU, MINI_YAKU, GREEN, isHonor, isYao, isTermNum, suitOf, kindOf, isRed, kindName, parseKinds, toCounts, countsOf, handStr, mulberry32, shuffledWall, roundSeed, doraOf,
    shantenStd, shantenChiitoi, shantenKokushi, shanten, decompose, isKokushi, isChiitoi, isComplete, waits, evaluate, basePoints, points, up100,
    create, startRound, legal, apply, waiting, nextRound, finalScores, remaining, seatWind, closedCounts, riverKinds, doraList, uraList, doraIndicators, uraIndicators, countDora,
    agariInfo, furitenState, tenpaiOf, riichiOptions, visibleCounts, reasonText, isMenzen, nagashi, clone };
  root.MahjongEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
