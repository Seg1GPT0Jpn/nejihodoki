// あてっこ (Guess-Along) — pure logic. Runs in the page and in node (tools/tests/unit/akin-*.test.js). Nothing here touches the DOM, Math.random or Date:
// every function that needs randomness takes a rand() argument, so the same seed gives the same game.
//   - NUMBER mode: the computer thinks of yes/no questions (bigger than…, even?, a multiple of…, last digit…, has the digit…) over the set of numbers
//     that are still possible, and always picks the question that splits that set most evenly (= the most information, binary entropy).
//   - THEME mode: curated attribute tables (akin/data/*.js call AkinEngine.addTheme). The computer keeps a probability for every item, asks the question
//     with the largest expected information gain (mutual information between the item and a 4-way answer: yes / probably / probably not / no),
//     tolerates wrong answers (no single answer rules an item out), skips "don't know", and can go back.
//   - SAVE helpers for the compact synced save `kusoge.akin.save` and the device-only learned items `kusoge.akin.custom`.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- random
  function hash32(str) { let h = 2166136261 >>> 0; str = String(str); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16; return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const H2 = p => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));

  // ---------------------------------------------------------------- NUMBER mode: question families
  const isPrime = n => { if (n < 2) return false; if (n % 2 === 0) return n === 2; for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; };
  const isSquare = n => { const r = Math.round(Math.sqrt(n)); return r * r === n; };
  const dsum = n => { let s = 0; while (n > 0) { s += n % 10; n = Math.floor(n / 10); } return s; };
  const ndig = n => String(n).length;
  // lvl 0 = easy for anybody, lvl 1 = only when "math lover" questions are on. kind groups the types so that the computer varies them.
  const FAM = {
    gt: { kind: 'size', lvl: 0, ev: (n, p) => n > p.k, ja: p => `${fmt(p.k)}より大きい？`, en: p => `Is it greater than ${fmt(p.k)}?` },
    even: { kind: 'div', lvl: 0, ev: n => n % 2 === 0, ja: () => '偶数（2でわりきれる数）？', en: () => 'Is it even?' },
    mult: { kind: 'div', lvl: 0, ev: (n, p) => n % p.k === 0, ja: p => `${p.k}でわりきれる（${p.k}の倍数）？`, en: p => `Is it a multiple of ${p.k}?` },
    last: { kind: 'digit', lvl: 0, ev: (n, p) => n % 10 === p.d, ja: p => `いちばん右（一の位）の数字は${p.d}？`, en: p => `Is the last digit ${p.d}?` },
    first: { kind: 'digit', lvl: 0, ev: (n, p) => +String(n)[0] === p.d, ja: p => `いちばん左の数字は${p.d}？`, en: p => `Is the first digit ${p.d}?` },
    digits: { kind: 'digit', lvl: 0, ev: (n, p) => ndig(n) === p.d, ja: p => `${p.d}けたの数？`, en: p => `Does it have ${p.d} digits?` },
    has: { kind: 'digit', lvl: 0, ev: (n, p) => String(n).indexOf(String(p.d)) >= 0, ja: p => `数字の${p.d}がふくまれている？`, en: p => `Does it contain the digit ${p.d}?` },
    prime: { kind: 'special', lvl: 1, ev: n => isPrime(n), ja: () => '素数（1と自分でしかわれない数）？', en: () => 'Is it a prime number?' },
    square: { kind: 'special', lvl: 1, ev: n => isSquare(n), ja: () => '平方数（1, 4, 9, 16, 25…）？', en: () => 'Is it a perfect square (1, 4, 9, 16, 25…)?' },
    dsum: { kind: 'special', lvl: 1, ev: (n, p) => dsum(n) >= p.s, ja: p => `各けたの数をたすと${p.s}以上？`, en: p => `Do its digits add up to ${p.s} or more?` },
  };
  const qKey = q => q.f + (q.p ? ':' + Object.keys(q.p).sort().map(k => q.p[k]).join(',') : '');
  const qText = (q, lang) => (lang === 'en' ? FAM[q.f].en(q.p || {}) : FAM[q.f].ja(q.p || {}));
  const evalQ = (q, n) => !!FAM[q.f].ev(n, q.p || {});

  // the candidate questions that make sense for the numbers still possible (thresholds follow the candidates' own distribution)
  function genQuestions(cands, hard) {
    const n = cands.length, out = [], seen = new Set();
    const add = (f, p) => { const q = { f, p }; const k = qKey(q); if (!seen.has(k)) { seen.add(k); out.push(q); } };
    const at = x => cands[Math.max(0, Math.min(n - 1, Math.floor(x * n)))];
    for (const x of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875, 0.45, 0.55, 0.4, 0.6]) add('gt', { k: at(x) });
    add('even');
    for (let k = 3; k <= 12; k++) add('mult', { k });
    for (let d = 0; d <= 9; d++) { add('last', { d }); add('has', { d }); if (d >= 1) add('first', { d }); }
    for (let d = 1; d <= 7; d++) add('digits', { d });
    if (hard) {
      add('prime'); add('square');
      for (let s = 3; s <= 40; s += 1) add('dsum', { s });
      for (const k of [13, 15, 16, 20, 25, 30, 50, 100]) add('mult', { k });
    }
    return out;
  }
  function splitOf(cands, q, sampleMax) {
    const n = cands.length, f = FAM[q.f].ev, p = q.p || {}, step = n > sampleMax ? n / sampleMax : 1; let y = 0, t = 0;
    for (let x = 0; x < n; x += step) { t++; if (f(cands[Math.floor(x)], p)) y++; }
    return { y, t, p: y / t };
  }
  // rank questions by how evenly they split the candidates (binary entropy, 1 bit = a perfect halving); returns [{q, score, p}] best first
  function rankQuestions(cands, hard, asked) {
    const res = [];
    for (const q of genQuestions(cands, hard)) {
      if (asked && asked.has(qKey(q))) continue;
      const s = splitOf(cands, q, 4000); if (s.y === 0 || s.y === s.t) continue;
      res.push({ q, score: H2(s.p), p: s.p });
    }
    res.sort((a, b) => b.score - a.score || (qKey(a.q) < qKey(b.q) ? -1 : 1));
    return res;
  }

  function rangeCands(lo, hi) { const a = new Int32Array(hi - lo + 1); for (let i = 0; i < a.length; i++) a[i] = lo + i; return a; }
  function filterCands(cands, q, ans) { const out = new Int32Array(cands.length); let k = 0; const f = FAM[q.f].ev, p = q.p || {}; for (let i = 0; i < cands.length; i++) if (!!f(cands[i], p) === ans) out[k++] = cands[i]; return out.slice(0, k); }
  const numPar = size => Math.max(1, Math.ceil(Math.log2(Math.max(2, size))));

  // One round of number guessing. history entries: { t:'q', q, a: true|false|null (null = "don't know") } | { t:'g', n, a: bool }.
  // The computer asks until at most two numbers are possible, then guesses. Every answered question and every guess counts as one question.
  class NumRound {
    constructor(lo, hi, opt) {
      opt = opt || {}; this.lo = lo | 0; this.hi = hi | 0; this.hard = !!opt.hard; this.rand = opt.rand || Math.random;
      this.base = rangeCands(this.lo, this.hi); this.hist = []; this.snaps = []; this.done = false; this.pend = null; this.lastKinds = [];
      this.plan();
    }
    get size() { return this.hi - this.lo + 1; }
    get par() { return numPar(this.size); }
    get cands() { return this.snaps.length ? this.snaps[this.snaps.length - 1] : this.base; }
    get count() { return this.hist.filter(h => h.t === 'g' || h.a !== null).length; }
    get skipped() { return this.hist.filter(h => h.t === 'q' && h.a === null).length; }
    get won() { return this.done; }
    askedSet() { return new Set(this.hist.filter(h => h.t === 'q').map(h => qKey(h.q))); }
    plan() {
      const last = this.hist[this.hist.length - 1];
      if (last && last.t === 'g' && last.a) { this.done = true; this.pend = null; return; }
      this.done = false;
      const c = this.cands;
      if (c.length === 0) { this.pend = { kind: 'contra' }; return; }
      if (c.length <= 2) { this.pend = { kind: 'guess', n: c[Math.floor(this.rand() * c.length) % c.length] }; return; }
      const ranked = rankQuestions(c, this.hard, this.askedSet());
      if (!ranked.length) { this.pend = { kind: 'guess', n: c[Math.floor(this.rand() * c.length) % c.length] }; return; }
      const best = ranked[0].score, tol = c.length > 300 ? 0.1 : c.length > 40 ? 0.05 : 0.0005;
      const pool = ranked.filter(r => r.score >= best - tol);
      const w = pool.map(r => (this.lastKinds.indexOf(FAM[r.q.f].kind) >= 0 ? 1 : 4) * (0.5 + r.score));
      let x = this.rand() * w.reduce((a, b) => a + b, 0), i = 0; for (; i < w.length - 1; i++) { x -= w[i]; if (x < 0) break; }
      this.pend = { kind: 'q', q: pool[i].q, p: pool[i].p, est: Math.round(pool[i].p * c.length) };
    }
    state() {
      const c = this.cands, p = this.pend;
      return { phase: this.done ? 'won' : p.kind === 'contra' ? 'contra' : p.kind === 'guess' ? 'guess' : 'ask', left: c.length, min: c.length ? c[0] : null, max: c.length ? c[c.length - 1] : null, count: this.count, par: this.par, q: p && p.kind === 'q' ? p.q : null, guess: p && p.kind === 'guess' ? p.n : null };
    }
    // ans: true / false / null ("don't know" — the question is dropped, nothing is learned, and it does not count)
    answer(ans) {
      if (this.done || !this.pend || this.pend.kind !== 'q') return false;
      const q = this.pend.q; this.hist.push({ t: 'q', q, a: ans });
      this.snaps.push(ans === null ? this.cands : filterCands(this.cands, q, ans));
      if (ans !== null) { this.lastKinds.push(FAM[q.f].kind); if (this.lastKinds.length > 2) this.lastKinds.shift(); }
      this.plan(); return true;
    }
    // the player says whether the computer's guess was right
    guessResult(ok) {
      if (this.done || !this.pend || this.pend.kind !== 'guess') return false;
      const n = this.pend.n; this.hist.push({ t: 'g', n, a: !!ok });
      this.snaps.push(ok ? this.cands : this.cands.filter(x => x !== n));
      this.plan(); return true;
    }
    // rebuild a saved round from its history (the next question is chosen again)
    restore(hist) {
      this.hist = []; this.snaps = []; this.lastKinds = [];
      for (const h of Array.isArray(hist) ? hist : []) {
        if (h && h.t === 'q' && h.q && FAM[h.q.f] && (h.a === null || typeof h.a === 'boolean')) { this.hist.push({ t: 'q', q: { f: h.q.f, p: h.q.p || undefined }, a: h.a }); this.snaps.push(h.a === null ? this.cands : filterCands(this.cands, h.q, h.a)); if (h.a !== null) { this.lastKinds.push(FAM[h.q.f].kind); if (this.lastKinds.length > 2) this.lastKinds.shift(); } }
        else if (h && h.t === 'g' && Number.isInteger(h.n)) { this.hist.push({ t: 'g', n: h.n, a: !!h.a }); this.snaps.push(h.a ? this.cands : this.cands.filter(x => x !== h.n)); }
      }
      this.plan(); return this;
    }
    // go back: keep the first `len` history entries
    rewind(len) {
      len = Math.max(0, Math.min(this.hist.length, len | 0)); this.hist.length = len; this.snaps.length = len;
      this.lastKinds = this.hist.filter(h => h.t === 'q' && h.a !== null).slice(-2).map(h => FAM[h.q.f].kind);
      this.plan();
    }
    back() { if (!this.hist.length) return false; this.rewind(this.hist.length - 1); return true; }
    // after a contradiction, or when the computer gives up: which answers disagree with the real number?
    mismatches(n) { const out = []; this.hist.forEach((h, i) => { if (h.t === 'q' && h.a !== null && evalQ(h.q, n) !== h.a) out.push(i); }); return out; }
  }

  // ---------------------------------------------------------------- THEME mode
  // answer codes: y yes, p probably yes, q probably not, n no, u don't know (skipped)
  const CODES = ['y', 'p', 'q', 'n'];
  // P(answer | the item's value for that attribute): rows = value 1 / 0.5 ("it depends") / 0 / unknown (-1); columns = y p q n. The off-diagonal weights
  // are the noise tolerance: a wrong answer shrinks the right item by about 13x but never removes it.
  const LIK = { 1: [0.66, 0.22, 0.07, 0.05], 0.5: [0.2, 0.3, 0.3, 0.2], 0: [0.05, 0.07, 0.22, 0.66], '-1': [0.25, 0.25, 0.25, 0.25] };
  const LROW = v => (v < 0 ? LIK['-1'] : v >= 0.99 ? LIK[1] : v <= 0.01 ? LIK[0] : LIK[0.5]);
  const HROW = Object.fromEntries(Object.entries(LIK).map(([k, r]) => [k, -r.reduce((a, p) => a + p * Math.log2(p), 0)]));
  const HOF = v => HROW[v < 0 ? '-1' : v >= 0.99 ? 1 : v <= 0.01 ? 0 : 0.5];
  const ANS_VAL = { y: 1, p: 0.75, q: 0.25, n: 0 };

  const THEMES = [];
  function addTheme(def) { const i = THEMES.findIndex(t => t.id === def.id); if (i >= 0) THEMES[i] = def; else THEMES.push(def); return def; }

  // def = { id, ja, en, icon, attrs: ['tag|質問|Question', …], items: ['名前|Name|tag tag ~tag', …] }   (a tag = 1, ~tag = 0.5 "it depends", missing = 0)
  // custom = [{ n, a }] with a = one char per attribute: 1 yes, 0 no, 5 depends, - unknown
  function compileTheme(def, custom) {
    const attrs = def.attrs.map(s => { const [id, ja, en] = s.split('|'); return { id, q: { ja, en } }; });
    const idx = Object.fromEntries(attrs.map((a, i) => [a.id, i]));
    const errors = [], items = [];
    def.items.forEach(s => {
      const [ja, en, tags] = s.split('|'); const v = new Float32Array(attrs.length);
      for (const tg of (tags || '').split(/\s+/).filter(Boolean)) {
        const half = tg[0] === '~', id = half ? tg.slice(1) : tg;
        if (!(id in idx)) { errors.push(`${ja}: unknown tag ${id}`); continue; }
        v[idx[id]] = half ? 0.5 : 1;
      }
      items.push({ ja, en, v, custom: false, ci: -1 });
    });
    (custom || []).forEach((c, ci) => {
      const v = new Float32Array(attrs.length).fill(-1);
      for (let i = 0; i < attrs.length; i++) { const ch = (c.a || '')[i]; v[i] = ch === '1' ? 1 : ch === '0' ? 0 : ch === '5' ? 0.5 : -1; }
      items.push({ ja: c.n, en: c.n, v, custom: true, ci });
    });
    return { id: def.id, ja: def.ja, en: def.en, icon: def.icon, attrs, items, errors, nBuiltin: def.items.length };
  }
  const itemName = (it, lang) => (lang === 'en' ? it.en : it.ja);

  // entries of the log: { t:'q', a: attribute index, c: 'y'|'p'|'q'|'n'|'u' } | { t:'g', i: item index, ok: bool }
  class ThemeRound {
    constructor(theme, opt) {
      opt = opt || {}; this.th = theme; this.rand = opt.rand || Math.random;
      this.thr = opt.thr != null ? opt.thr : 0.72; this.soft = opt.soft != null ? opt.soft : 14; this.maxQ = opt.maxQ || 24; this.maxWrong = opt.maxWrong || 3;
      this.log = []; this.done = false; this.gaveUp = false; this.pend = null; this.w = null; this.plan();
    }
    get n() { return this.th.items.length; }
    get answered() { return this.log.filter(e => e.t === 'q' && e.c !== 'u').length; }
    get wrong() { return this.log.filter(e => e.t === 'g' && !e.ok).length; }
    get count() { return this.answered + this.log.filter(e => e.t === 'g').length; }
    get skipped() { return this.log.filter(e => e.t === 'q' && e.c === 'u').length; }
    askedAttrs() { return new Set(this.log.filter(e => e.t === 'q').map(e => e.a)); }
    // posterior over the items given the log (rejected guesses are removed)
    posterior() {
      const its = this.th.items, w = new Float64Array(its.length).fill(1);
      for (const e of this.log) {
        if (e.t === 'g') { if (!e.ok) w[e.i] = 0; continue; }
        if (e.c === 'u') continue;
        const ci = CODES.indexOf(e.c); let s = 0;
        for (let i = 0; i < its.length; i++) { if (w[i] > 0) w[i] *= LROW(its[i].v[e.a])[ci]; s += w[i]; }
        if (s > 0) for (let i = 0; i < its.length; i++) w[i] /= s;
      }
      let s = 0; for (let i = 0; i < w.length; i++) s += w[i];
      if (s > 0) for (let i = 0; i < w.length; i++) w[i] /= s;
      return w;
    }
    // expected information gain (bits) of asking attribute a
    gain(w, a) {
      const its = this.th.items, P = [0, 0, 0, 0]; let hc = 0;
      for (let i = 0; i < its.length; i++) { if (w[i] <= 0) continue; const r = LROW(its[i].v[a]); for (let k = 0; k < 4; k++) P[k] += w[i] * r[k]; hc += w[i] * HOF(its[i].v[a]); }
      let h = 0; for (let k = 0; k < 4; k++) if (P[k] > 0) h -= P[k] * Math.log2(P[k]);
      return h - hc;
    }
    ranked(w) {
      const asked = this.askedAttrs(), out = [];
      for (let a = 0; a < this.th.attrs.length; a++) if (!asked.has(a)) out.push({ a, g: this.gain(w, a) });
      out.sort((x, y) => y.g - x.g || x.a - y.a);
      return out;
    }
    top(w, k) { const o = []; for (let i = 0; i < w.length; i++) if (w[i] > 0) o.push({ i, p: w[i] }); o.sort((a, b) => b.p - a.p || a.i - b.i); return o.slice(0, k || 3); }
    plan() {
      const last = this.log[this.log.length - 1];
      this.done = !!(last && last.t === 'g' && last.ok); this.gaveUp = false;
      const w = this.w = this.posterior();
      if (this.done) { this.pend = null; return; }
      const live = Array.from(w).filter(x => x > 0).length;
      const top = this.top(w, 3), best = top[0];
      const rk = this.ranked(w), g0 = rk.length ? rk[0].g : 0;
      if (!best || live === 0 || this.wrong >= this.maxWrong || (this.count >= this.maxQ + this.wrong)) { this.gaveUp = true; this.pend = { kind: 'giveup' }; return; }
      const a = this.answered;
      const sure = best.p >= this.thr && a >= 3, weary = a >= this.soft && best.p >= 0.3, noInfo = g0 < 0.04 || a >= this.maxQ - 2;
      if (sure || weary || noInfo || live === 1) { this.pend = { kind: 'guess', i: best.i, p: best.p }; return; }
      // a little randomness among near-equal questions so the same item is not always met with the same order
      const pool = rk.filter(r => r.g >= g0 - 0.03).slice(0, 4);
      this.pend = { kind: 'q', a: pool[Math.floor(this.rand() * pool.length) % pool.length].a, gain: g0 };
    }
    state() {
      const p = this.pend, w = this.w;
      return { phase: this.done ? 'won' : !p ? 'won' : p.kind === 'giveup' ? 'giveup' : p.kind === 'guess' ? 'guess' : 'ask', count: this.count, answered: this.answered, wrong: this.wrong, a: p && p.kind === 'q' ? p.a : null, guess: p && p.kind === 'guess' ? p.i : null, conf: this.top(w, 1)[0] ? this.top(w, 1)[0].p : 0 };
    }
    answer(c) {
      if (this.done || !this.pend || this.pend.kind !== 'q') return false;
      this.log.push({ t: 'q', a: this.pend.a, c }); this.plan(); return true;
    }
    guessResult(ok) {
      if (this.done || !this.pend || this.pend.kind !== 'guess') return false;
      this.log.push({ t: 'g', i: this.pend.i, ok: !!ok }); this.plan(); return true;
    }
    rewind(len) { this.log.length = Math.max(0, Math.min(this.log.length, len | 0)); this.plan(); }
    restore(log) {
      const n = this.th.attrs.length, m = this.th.items.length;
      this.log = (Array.isArray(log) ? log : []).filter(e => e && ((e.t === 'q' && Number.isInteger(e.a) && e.a >= 0 && e.a < n && ('ypqnu').indexOf(e.c) >= 0 && e.c.length === 1) || (e.t === 'g' && Number.isInteger(e.i) && e.i >= 0 && e.i < m))).map(e => (e.t === 'q' ? { t: 'q', a: e.a, c: e.c } : { t: 'g', i: e.i, ok: !!e.ok }));
      this.plan(); return this;
    }
    back() { if (!this.log.length) return false; this.rewind(this.log.length - 1); return true; }
    // the string of attribute values this game learned: 1 / 0 / 5 / - (used when the player teaches a new item)
    learned() {
      const s = new Array(this.th.attrs.length).fill('-');
      for (const e of this.log) { if (e.t !== 'q' || e.c === 'u') continue; s[e.a] = e.c === 'y' ? '1' : e.c === 'n' ? '0' : '5'; }
      return s.join('');
    }
    // which answers disagree with what we know about item i (for the "what was it?" screen): [{ a, c, v }]
    mismatches(i) {
      const v = this.th.items[i].v, out = [];
      for (const e of this.log) { if (e.t !== 'q' || e.c === 'u' || v[e.a] < 0) continue; const x = ANS_VAL[e.c]; if (v[e.a] >= 0.99 ? x < 0.5 : v[e.a] <= 0.01 ? x > 0.5 : false) out.push({ a: e.a, c: e.c, v: v[e.a] }); }
      return out;
    }
    probabilityOf(i) { return this.w ? this.w[i] : 0; }
  }

  // the answer a careful player gives for value v (used by the simulated players in the tests): y/n for 1/0, p or q for "it depends"
  function simAnswer(v, rand, noise) {
    if (v < 0) return 'u';
    if (noise && rand() < noise) return v >= 0.99 ? 'n' : v <= 0.01 ? 'y' : (rand() < 0.5 ? 'y' : 'n');
    if (v >= 0.99) return rand() < 0.85 ? 'y' : 'p';
    if (v <= 0.01) return rand() < 0.85 ? 'n' : 'q';
    return rand() < 0.5 ? 'p' : 'q';
  }
  // plays one whole themed round against item `target` with a simulated player; returns { found, count, guesses, round }
  function simulateTheme(theme, target, seed, noise, opt) {
    const rand = rng(seed >>> 0), ans = rng((seed ^ 0x9e3779b9) >>> 0);
    const r = new ThemeRound(theme, Object.assign({ rand }, opt || {}));
    for (let guard = 0; guard < 80; guard++) {
      const s = r.state();
      if (s.phase === 'won' || s.phase === 'giveup') break;
      if (s.phase === 'guess') r.guessResult(s.guess === target); else r.answer(simAnswer(theme.items[target].v[s.a], ans, noise));
    }
    return { found: r.done, count: r.count, answered: r.answered, wrong: r.wrong, round: r };
  }
  // pairs of items that differ in fewer than `min` attributes (too close to tell apart fairly)
  function closePairs(theme, min) {
    const out = [], its = theme.items;
    for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
      let d = 0; for (let a = 0; a < theme.attrs.length; a++) if (Math.abs(its[i].v[a] - its[j].v[a]) > 0.01) d++;
      if (d < min) out.push([i, j, d]);
    }
    return out;
  }

  // ---------------------------------------------------------------- results: titles and flavour
  // how the computer did: a rank 0..4 and its label
  function numRank(count, par) { const d = count - (par + 1); return d <= 0 ? 4 : d <= 1 ? 3 : d <= 3 ? 2 : d <= 6 ? 1 : 0; }
  function themeRank(count) { return count <= 7 ? 4 : count <= 10 ? 3 : count <= 13 ? 2 : count <= 17 ? 1 : 0; }
  const RANK_TEXT = [
    { ja: 'ねばりづよく当てた！', en: 'Got there in the end!' }, { ja: 'なかなか手ごわかった', en: 'A tough one' }, { ja: 'いい勝負だった', en: 'A fair fight' },
    { ja: 'するどい推理！', en: 'Sharp deduction!' }, { ja: 'ズバリ名推理！', en: 'Spot-on!' },
  ];

  // ---------------------------------------------------------------- SAVE (kusoge.akin.save) and learned items (kusoge.akin.custom)
  const SAVE_KEY = 'kusoge.akin.save', CUSTOM_KEY = 'kusoge.akin.custom', MAX_CUSTOM = 150, MAX_RANK = 100000;
  const NUM_KEYS = ['r100', 'r1k', 'r1m', 'cust'];
  const num0 = (v, d) => { v = Number(v); return isFinite(v) ? v : d || 0; };
  const defSave = () => ({ v: 1, rk: 0, num: {}, th: {}, stats: {}, set: { hard: 0, peek: 1, sc: 3 }, tut: 0 });
  function normalizeSave(o) {
    const s = defSave(); if (!o || typeof o !== 'object') return s;
    s.rk = Math.max(0, Math.min(MAX_RANK, Math.floor(num0(o.rk)))); s.tut = o.tut ? 1 : 0;
    for (const grp of ['num', 'th']) {
      const src = o[grp]; if (!src || typeof src !== 'object') continue;
      for (const k of Object.keys(src).slice(0, 40)) { const r = src[k]; if (!r || typeof r !== 'object') continue; s[grp][k] = { p: Math.max(0, num0(r.p) | 0), w: Math.max(0, num0(r.w) | 0), b: Math.max(0, num0(r.b) | 0) }; }
    }
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(o.stats).slice(0, 40)) s.stats[k] = Math.max(0, Math.floor(num0(o.stats[k])));
    if (o.set && typeof o.set === 'object') { s.set.hard = o.set.hard ? 1 : 0; s.set.peek = o.set.peek === 0 ? 0 : 1; s.set.sc = Math.max(1, Math.min(6, Math.floor(num0(o.set.sc, 3)))); }
    return s;
  }
  // r = { kind: 'num'|'th', key, won, count, par, hard, back, idk, learned, lost2 } — one finished round (the computer won or was stumped)
  function recordRound(save, r) {
    const grp = r.kind === 'num' ? 'num' : 'th', st = save.stats, add = (k, n) => { st[k] = (st[k] || 0) + (n === undefined ? 1 : n); };
    const e = save[grp][r.key] || (save[grp][r.key] = { p: 0, w: 0, b: 0 });
    e.p++; add('plays');
    if (r.won) {
      e.w++; save.rk = Math.min(MAX_RANK, save.rk + 1); add('wins'); add(r.kind === 'num' ? 'nw' : 'tw');
      if (!e.b || r.count < e.b) e.b = r.count;
      if (r.kind === 'num' && r.key === 'r100' && r.count <= 7) add('fast');
      if (r.kind === 'num' && r.key === 'r1m') add('m1');
      if (r.kind === 'num' && r.key === 'cust') add('cust');
      if (r.kind === 'th' && r.count <= 8) add('quick');
      if (r.recovered) add('recover');
    } else add('losses');
    if (r.learned) add('learn', r.learned);
    if (r.back) add('back', r.back);
    if (r.idk) add('idk', r.idk);
    return save;
  }
  function readCustom(o) {
    const out = { v: 1, t: {} }; if (!o || typeof o !== 'object' || !o.t) return out;
    for (const id of Object.keys(o.t).slice(0, 20)) { const a = Array.isArray(o.t[id]) ? o.t[id] : []; out.t[id] = a.filter(c => c && typeof c.n === 'string' && c.n.trim() && typeof c.a === 'string').slice(0, MAX_CUSTOM).map(c => ({ n: c.n.trim().slice(0, 24), a: c.a.replace(/[^015-]/g, '-').slice(0, 80) })); }
    return out;
  }
  // teach the computer an item: adds it, or fills in what is still unknown (a disagreement becomes "it depends")
  function learnItem(custom, themeId, name, vec) {
    name = String(name || '').trim().slice(0, 24); if (!name) return null;
    const list = custom.t[themeId] || (custom.t[themeId] = []), key = name.toLowerCase();
    let c = list.find(x => x.n.toLowerCase() === key);
    if (!c) { if (list.length >= MAX_CUSTOM) list.shift(); c = { n: name, a: vec }; list.push(c); return { item: c, added: true }; }
    let a = ''; for (let i = 0; i < vec.length; i++) { const o = c.a[i] || '-', n = vec[i]; a += n === '-' ? o : o === '-' ? n : o === n ? o : '5'; }
    c.a = a; return { item: c, added: false };
  }

  const SYNC_RULE = { fields: { rk: 'max', num: { each: { fields: { p: 'max', w: 'max', b: 'minPos' }, rest: 'max' } }, th: { each: { fields: { p: 'max', w: 'max', b: 'minPos' }, rest: 'max' } }, stats: { each: 'max' }, set: 'newest', tut: 'max' }, rest: 'newest' };

  const Akin = {
    hash32, rng, fmt, H2, FAM, qKey, qText, evalQ, genQuestions, rankQuestions, rangeCands, filterCands, numPar, NumRound,
    CODES, LIK, ANS_VAL, THEMES, addTheme, compileTheme, itemName, ThemeRound, simAnswer, simulateTheme, closePairs,
    numRank, themeRank, RANK_TEXT, SAVE_KEY, CUSTOM_KEY, MAX_CUSTOM, MAX_RANK, NUM_KEYS, defSave, normalizeSave, recordRound, readCustom, learnItem, SYNC_RULE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Akin;
  root.AkinEngine = Akin;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
