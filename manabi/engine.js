// まなびの工房：中身（純粋なロジック。ブラウザでも node でも動く。DOM・通信・時計に触らない（getQuiz の通信だけ別））
// ---------------------------------------------------------------------------------
// ・問題の本文（LaTeX の $…$ / $$…$$ と [[u:…]] [[blank:…]] [[mark:…]]）を分ける：tokenize
// ・答え合わせ（型ごと）：check(q, input) → { ok, ... }。数値は許容誤差・分数・√・×10^n・単位、短答は全角半角・かな・別解の正規化
// ・ライトナー式の復習：箱 0（まだ）・1〜5。1問3文字（箱＋最後にやった日）で、単元ごとの文字列にする（問題ごとのオブジェクトは持たない）
// ・レッスンの組み立て：種つき乱数・むずかしさの調整・まちがいは同じレッスンの中で戻ってくる（Lesson）
// ・XP・毎日の目標・連続日数（ストリーク。ゆるい：休んでも罰はなく、数がもどるだけ）・保存の形（defSave / normSave / recordLesson）
// ・他のページから使う窓口 window.KoboManabi.getQuiz({ n, subjects, levels })（「勉強ガード」用。今はどこからも呼ばれない）
//
// 保存（localStorage の kusoge.manabi.save。同期する。大きさは数 KB〜最大でも 50KB ほど）：
//   { v:1, xp, d:[日番号…（直近120日）], g:{ 日番号: その日のXP（直近14日）}, goal:20, b:{ <単元セットの id>: "<ハッシュ>:<箱の文字列>" },
//     st:{ q（答えた数）, ok（正解）, ls（レッスン数）, mk（模試の数）, best（連続日数の最高）}, mk:{ <模試の id>: 最高の正答率% }, set:{ cr, sub, g }, tut }
// ---------------------------------------------------------------------------------
(function (root) {
  'use strict';

  // ================================================================= 文字の正規化
  const nfkc = s => String(s == null ? '' : s).normalize('NFKC');
  const kata2hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const isKana = s => /^[ぁ-ゖァ-ヶー]+$/.test(s);

  // [[u:x]] → x、[[blank:x]] → （空白）、[[mark:(1):x]] → x
  function stripMarkup(s) {
    return String(s == null ? '' : s)
      .replace(/\[\[mark:[^:\]]*:([^\]]*)\]\]/g, '$1').replace(/\[\[blank:[^\]]*\]\]/g, '＿').replace(/\[\[u:([^\]]*)\]\]/g, '$1');
  }

  // 本文のトークン分け：{ k:'t', v } 文字／{ k:'m', v, d } 数式（d=true は別行）／{ k:'u', v } 下線／{ k:'b', v } 空欄／{ k:'k', m, v } 傍線（番号つき）
  function tokenize(src) {
    const s = String(src == null ? '' : src), out = [];
    let buf = '', i = 0;
    const flush = () => { if (buf) { out.push({ k: 't', v: buf }); buf = ''; } };
    while (i < s.length) {
      const c = s[i];
      if (c === '\\' && s[i + 1] === '$') { buf += '$'; i += 2; continue; }
      if (c === '[' && s[i + 1] === '[') {
        const e = s.indexOf(']]', i + 2);
        if (e > 0) {
          const body = s.slice(i + 2, e);
          let m;
          if ((m = /^u:([\s\S]*)$/.exec(body))) { flush(); out.push({ k: 'u', v: m[1] }); i = e + 2; continue; }
          if ((m = /^blank:([\s\S]*)$/.exec(body))) { flush(); out.push({ k: 'b', v: m[1] }); i = e + 2; continue; }
          if ((m = /^mark:([^:]*):([\s\S]*)$/.exec(body))) { flush(); out.push({ k: 'k', m: m[1], v: m[2] }); i = e + 2; continue; }
        }
      }
      if (c === '$') {
        if (s[i + 1] === '$') {
          const e = s.indexOf('$$', i + 2);
          if (e > 0) { flush(); out.push({ k: 'm', v: s.slice(i + 2, e).trim(), d: true }); i = e + 2; continue; }
        } else {
          let e = i + 1;
          while (e < s.length && !(s[e] === '$' && s[e - 1] !== '\\')) e++;
          if (e < s.length && e > i + 1) { flush(); out.push({ k: 'm', v: s.slice(i + 1, e), d: false }); i = e + 1; continue; }
        }
      }
      buf += c; i++;
    }
    flush();
    return out;
  }

  // 短答の文字の正規化（全角半角・大文字小文字・空白・句読点・かな）
  function normText(s) {
    let t = nfkc(stripMarkup(s)).toLowerCase();
    t = t.replace(/\$/g, '');
    t = t.replace(/[‘’ʼ´`]/g, "'").replace(/[“”]/g, '"');
    t = t.replace(/[‐-―−ー]/g, c => (c === 'ー' ? c : '-'));
    t = t.replace(/\(\d+\)|[①-⑳]/g, ''); // (1) ① などの番号
    t = t.replace(/[\s　。、，,．.!！?？「」『』()（）［］\[\]｛｝{}"“”:：;；…・･〜~]+/g, '');
    return t;
  }
  function sameText(a, b) {
    const x = normText(a), y = normText(b);
    if (!x && !y) return false;
    if (x === y) return true;
    // かなだけの答えは、ひらがなとカタカナのちがいを許す（漢字とかなは同じにしない）
    if (isKana(x) && isKana(y) && kata2hira(x) === kata2hira(y)) return true;
    return false;
  }

  // ---------------------------------------------------------------- 数式の正規形（LaTeX でも手入力でも同じ形にする）
  // 中かっこの対応をとって { … } の中身を返す
  function brace(s, i) { // s[i] === '{'。→ [中身, 次の位置] / null
    if (s[i] !== '{') return null;
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}' && --d === 0) return [s.slice(i + 1, j), j + 1];
    }
    return null;
  }
  function eatSpace(s, i) { while (s[i] === ' ') i++; return i; }
  function replaceCmd(s, name, argc, fn) {
    const key = '\\' + name;
    let out = '', i = 0;
    while (i < s.length) {
      const at = s.indexOf(key, i);
      if (at < 0) break;
      const after = s[at + key.length];
      if (after && /[A-Za-z]/.test(after)) { out += s.slice(i, at + key.length); i = at + key.length; continue; }
      let p = at + key.length, args = [], ok = true, opt = null;
      if (name === 'sqrt' && s[eatSpace(s, p)] === '[') { const e = s.indexOf(']', p); if (e > 0) { opt = s.slice(eatSpace(s, p) + 1, e); p = e + 1; } }
      for (let a = 0; a < argc; a++) {
        p = eatSpace(s, p);
        if (s[p] === '{') { const b = brace(s, p); if (!b) { ok = false; break; } args.push(b[0]); p = b[1]; }
        else if (p < s.length) { args.push(s[p]); p++; } else { ok = false; break; }
      }
      if (!ok) { out += s.slice(i, at + key.length); i = at + key.length; continue; }
      out += s.slice(i, at) + fn(args, opt); i = p;
    }
    return out + s.slice(i);
  }
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', omega: 'ω', phi: 'φ', Delta: 'Δ', Omega: 'Ω', infty: '∞' };
  function canonMath(src) {
    let t = nfkc(stripMarkup(src));
    t = t.replace(/\$/g, '').replace(/\\displaystyle|\\left|\\right|\\!|\\,|\\;|\\:|\\quad|\\qquad|\\ /g, '');
    t = t.replace(/\\(?:dfrac|tfrac)/g, '\\frac');
    for (let k = 0; k < 6; k++) { // 入れ子の \frac・\sqrt
      const before = t;
      t = replaceCmd(t, 'frac', 2, ([a, b]) => '(' + a + ')/(' + b + ')');
      t = replaceCmd(t, 'sqrt', 1, ([a], n) => (n ? '(' + a + ')^(1/' + n + ')' : '√(' + a + ')'));
      t = replaceCmd(t, 'mathrm', 1, ([a]) => a); t = replaceCmd(t, 'text', 1, ([a]) => a); t = replaceCmd(t, 'mathbf', 1, ([a]) => a);
      t = replaceCmd(t, 'vec', 1, ([a]) => 'vec(' + a + ')'); t = replaceCmd(t, 'overline', 1, ([a]) => 'bar(' + a + ')');
      if (t === before) break;
    }
    t = t.replace(/\\(cdot|times)/g, '*').replace(/\\div/g, '/').replace(/×|·|⋅/g, '*').replace(/÷/g, '/')
      .replace(/\\(leqq|leqslant|le|leq)\b/g, '<=').replace(/\\(geqq|geqslant|ge|geq)\b/g, '>=').replace(/≦|≤|⩽/g, '<=').replace(/≧|≥|⩾/g, '>=')
      .replace(/\\(neq|ne)\b/g, '≠').replace(/\\pm\b/g, '±').replace(/\\mp\b/g, '∓')
      .replace(/\^\s*\{?\s*\\circ\s*\}?|\\circ|°|゜/g, '°').replace(/\\ldots|\\cdots|\\dots|…|⋯/g, '...')
      .replace(/\\([A-Za-z]+)/g, (m, n) => GREEK[n] || n);
    t = t.replace(/[‐-―−ー]/g, '-').replace(/[\s　]+/g, '');
    t = t.replace(/[、，]/g, ',').replace(/[。]/g, '.');
    // 中かっこ → かっこ、1語だけのかっこは外す（(3)/(5) → 3/5、^{2} → ^2）
    t = t.replace(/[{}]/g, m => (m === '{' ? '(' : ')'));
    for (let k = 0; k < 4; k++) t = t.replace(/\(([A-Za-z0-9.π°]+)\)/g, '$1').replace(/\^\(([^()]+)\)/g, (m, a) => (/^[A-Za-z0-9.-]+$/.test(a) ? '^' + a : m));
    t = t.replace(/\*(?=[A-Za-zπ√(])/g, m => m); // 係数の * はそのまま（2*x と 2x はちがう形として扱う）
    t = t.replace(/(\d)\*([A-Za-zπ√])/g, '$1$2').replace(/([A-Za-z])\*(\d)/g, '$1*$2');
    return t;
  }

  // ---------------------------------------------------------------- 数式を数にする（安全な小さな評価器。eval は使わない）
  function evalMath(src) {
    let t = canonMath(src);
    if (!t) return null;
    t = t.replace(/(\d),(?=\d{3}(\D|$))/g, '$1').replace(/°/g, '').replace(/%/g, '');
    if (/[^0-9+\-*/^().π√]/.test(t)) return null;
    let i = 0;
    const peek = () => t[i];
    function num() {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(t.slice(i));
      if (!m) return NaN; i += m[0].length; return parseFloat(m[0]);
    }
    function atom() {
      const c = peek();
      if (c === '(') { i++; const v = expr(); if (peek() !== ')') return NaN; i++; return v; }
      if (c === 'π') { i++; return Math.PI; }
      if (c === '√') { i++; const v = atom(); return v < 0 ? NaN : Math.sqrt(v); }
      return num();
    }
    function power() {
      const b = atom();
      if (peek() === '^') { i++; const e = unary(); return Math.pow(b, e); }
      return b;
    }
    function unary() {
      if (peek() === '-') { i++; return -unary(); }
      if (peek() === '+') { i++; return unary(); }
      return power();
    }
    function term() {
      let v = unary();
      for (;;) {
        const c = peek();
        if (c === '*') { i++; v *= unary(); }
        else if (c === '/') { i++; v /= unary(); }
        else if (c && (c === '(' || c === 'π' || c === '√' || /\d/.test(c))) v *= power(); // 2√3・2π・3(…)
        else return v;
      }
    }
    function expr() {
      let v = term();
      for (;;) {
        const c = peek();
        if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v;
      }
    }
    const v = expr();
    if (i !== t.length || !isFinite(v)) return null;
    return v;
  }

  // ---------------------------------------------------------------- 単位
  const canonUnit = s => nfkc(s).toLowerCase().replace(/\s+/g, '').replace(/\^2|²/g, '2').replace(/\^3|³/g, '3').replace(/[·・⋅*]/g, '').replace(/\$|\\mathrm|[{}]|\\,/g, '').replace(/\\/g, '');
  const UNIT_TAIL = /[A-Za-zµμΩ℃°%ぁ-ゖァ-ヶ一-鿿/²³^0-9]*$/;
  // 入力から単位らしい末尾を分ける：{ body, unit }
  function splitUnit(raw, expectUnit) {
    let s = nfkc(raw).trim();
    s = s.replace(/^[A-Za-zͰ-Ͽ]{1,3}\s*=\s*/, ''); // x= など
    if (expectUnit) {
      const eu = nfkc(expectUnit).replace(/\s+/g, '');
      const ss = s.replace(/\s+/g, '');
      if (ss.toLowerCase().endsWith(eu.toLowerCase()) && ss.length > eu.length) {
        const cut = ss.slice(0, ss.length - eu.length);
        if (/[\d)π√}]$/.test(cut)) return { body: cut, unit: eu };
      }
    }
    const m = /^(.*?[\d)π√}])\s*([^\d\s)π√}+\-*/^.,=][\s\S]*)$/.exec(s);
    if (m && !/^[×x*]/.test(m[2]) && !/^\^/.test(m[2])) {
      const u = m[2].trim();
      if (/^[A-Za-zµμΩ℃°%ぁ-ゖァ-ヶ一-鿿/²³^0-9\s]+$/.test(u)) return { body: m[1], unit: u };
    }
    return { body: s, unit: '' };
  }

  // 数値の答え合わせ：expected（文字列）と入力。tol は相対誤差
  function checkNumeric(q, input, tol) {
    tol = tol == null ? 1e-6 : tol;
    const raw = String(input == null ? '' : input);
    if (!raw.trim()) return { ok: false, empty: true };
    const cands = [q.a].concat(q.x || []);
    const eu = q.un || '';
    const sp = splitUnit(raw, eu);
    const eval1 = String(sp.body);
    const u = sp.unit;
    let unitOk = true;
    if (u && eu) unitOk = canonUnit(u) === canonUnit(eu);
    for (const c of cands) {
      const ev = evalMath(c), uv = evalMath(eval1);
      if (ev != null && uv != null) {
        if (Math.abs(uv - ev) <= Math.max(1e-9, Math.abs(ev) * (Number.isInteger(ev) ? 1e-12 : tol))) return unitOk ? { ok: true } : { ok: false, unit: true };
      } else if (canonMath(c) === canonMath(raw) || canonMath(c) === canonMath(eval1)) return { ok: true };
    }
    // 単位つきの答えに、単位を入れなかったのは正解（入れたときだけ単位を見る）。数にならない答え（x=2 など）は文字として比べる
    if (cands.some(c => evalMath(c) == null)) { const r = checkShort(q, raw); if (r.ok) return r; }
    return { ok: false };
  }

  // 短答：別解も含めて、文字（かな・全角半角・空白・句読点）または数式として同じならOK
  function checkShort(q, input) {
    const raw = String(input == null ? '' : input);
    if (!raw.trim()) return { ok: false, empty: true };
    const cands = [q.a].concat(q.x || []);
    if (q.d) cands.push(q.d);
    const mathy = c => /\\|\$|\^|[=<>≠±√]/.test(String(c));
    for (const c of cands) {
      if (sameText(c, raw)) return { ok: true };
      if (mathy(c) || mathy(raw)) {
        const a = canonMath(c), b = canonMath(raw);
        if (a && a === b) return { ok: true };
        const ea = evalMath(c), eb = evalMath(raw);
        if (ea != null && eb != null && Math.abs(ea - eb) <= Math.max(1e-9, Math.abs(ea) * 1e-6)) return { ok: true };
        // 「x=2」と「2」、「y=…」と右辺だけ
        const strip = z => z.replace(/^[A-Za-z]\(?[A-Za-z]?\)?=/, '');
        if (a && b && strip(a) === strip(b) && (strip(a) !== a || strip(b) !== b) && strip(a).length > 0) return { ok: true };
      }
    }
    return { ok: false };
  }

  // ---- 新しい型（つなぐ・タイル・表）
  function checkPairs(q, input) {
    if (!Array.isArray(input) || input.length !== q.pairs.length) return { ok: false };
    return { ok: q.pairs.every(p => input.some(x => x[0] === p[0] && x[1] === p[1])) };
  }
  const tnorm = s => String(s).toLowerCase().replace(/[.?!,]/g, '');
  function tileTexts(q, ids) { return ids.map(id => { const w = q.w.find(x => x.id === id); return w ? w.t : null; }); }
  function checkTiles(q, input) {
    if (!Array.isArray(input) || !input.length) return { ok: false };
    const got = tileTexts(q, input); if (got.includes(null)) return { ok: false };
    const f = q.norm ? tnorm : String, g = got.map(f).join('\u0001');
    const want = [tileTexts(q, q.a)].concat((q.alt || []).map(a => a)).map(a => a.map(f).join('\u0001'));
    return { ok: want.includes(g) };
  }
  function checkTable(q, input) {
    if (!input || typeof input !== 'object') return { ok: false };
    let ok = true, any = false;
    q.cells.forEach((c, i) => { if (!c || !c.ask) return; any = true; const v = input[i]; if (v == null || !c.v.some(x => sameText(x, v))) ok = false; });
    return { ok: ok && any };
  }
  const SELF = { de: 1, pr: 1 };
  const isSelfGrade = q => !!SELF[q.t];
  const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const setEq = (a, b) => a.length === b.length && a.every(v => b.indexOf(v) >= 0);

  // 答え合わせ：入力の形は、mc＝ラベルの文字列／ms＝ラベルの配列（順不同）／or＝ラベルの配列（順番どおり）／nu・sa＝文字列。
  // de・pr（自己採点）は、ここでは決めない：{ self: true }
  function check(q, input) {
    switch (q.t) {
      case 'mc': return { ok: input === q.a };
      case 'ms': return Array.isArray(input) ? { ok: setEq(input, q.a) } : { ok: false };
      case 'or': return Array.isArray(input) ? { ok: arrEq(input, q.a) } : { ok: false };
      case 'mp': return checkPairs(q, input);
      case 'wb': return checkTiles(q, input);
      case 'tt': return Array.isArray(input) ? { ok: setEq(input.map(Number), q.a) } : { ok: false };
      case 'hs': return { ok: input === q.a };
      case 'ft': return checkTable(q, input);
      case 'nu': return checkNumeric(q, input);
      case 'sa': return checkShort(q, input);
      default: return { self: true, ok: false };
    }
  }
  // 正答の表示
  function answerText(q) {
    if (q.t === 'mp') return q.pairs.map(p => p[0] + ' ＝ ' + p[1]);
    if (q.t === 'wb') return [tileTexts(q, q.a).join(q.norm ? ' ' : '')];
    if (q.t === 'tt') return [q.a.map(i => q.tk[i]).join('・')];
    if (q.t === 'hs') return [q.rg[q.a]];
    if (q.t === 'ft') return [q.e];
    if (q.t === 'mc' || q.t === 'ms' || q.t === 'or') {
      const lab = Array.isArray(q.a) ? q.a : [q.a];
      return lab.map(l => { const c = (q.c || []).find(x => x[0] === l); return c ? l + '　' + c[1] : l; });
    }
    let a = q.d || q.a;
    if (q.un && q.t === 'nu' && !String(a).includes(q.un)) a = a + ' ' + q.un;
    return [a];
  }

  // ================================================================= ライトナーの箱
  const INTERVALS = [0, 1, 3, 7, 14, 30]; // 箱 b の問題は、最後にやった日から INTERVALS[b] 日たつと「復習の時期」
  const EPOCH = Date.UTC(2026, 0, 1) / 86400000; // 日の数え方：この日を 0 にする（1問のしるしを 2 文字で持つ）
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const dayNum = d => { d = d || new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }; // 端末の暦の日
  const encDay = n => { n = Math.max(0, Math.min(4095, Math.round(n - EPOCH))); return B64[n >> 6] + B64[n & 63]; };
  const decDay = s => B64.indexOf(s[0]) * 64 + B64.indexOf(s[1]) + EPOCH;
  const hashIds = ids => { let h = 5381; const s = ids.join(','); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

  // 保存の中身は "<ハッシュ>:<箱の文字列>"。ハッシュは問題の並び（id）のもの。データが変わって合わなくなったら、その単元だけ捨てる
  function parseBoxes(entry, setHash, n) {
    if (typeof entry === 'string') {
      const k = entry.indexOf(':');
      if (k > 0 && entry.slice(0, k) === setHash && entry.length - k - 1 === n * 3) return entry.slice(k + 1);
    }
    return '000'.repeat(n);
  }
  function packBoxes(setHash, str) { return setHash + ':' + str; }
  function card(str, i) {
    const o = i * 3, box = str.charCodeAt(o) - 48;
    return { box: box >= 0 && box <= 5 ? box : 0, day: box > 0 ? decDay(str.slice(o + 1, o + 3)) : -1 };
  }
  function setCard(str, i, box, day) {
    const o = i * 3;
    return str.slice(0, o) + String(box) + (box > 0 ? encDay(day) : 'AA') + str.slice(o + 3);
  }
  const isDue = (c, today) => c.box > 0 && today - c.day >= INTERVALS[c.box];
  const dueIn = (c, today) => (c.box > 0 ? c.day + INTERVALS[c.box] - today : 0); // マイナスなら遅れた日数
  // 1回の結果で箱を動かす。res: 'first'（1回めで正解）／'retry'（まちがえたあと正解）／'miss'（まちがい）／'ok'（できた：自己採点）／'unsure'（あやしい）／'no'（できなかった）
  function nextBox(box, res) {
    switch (res) {
      case 'first': case 'ok': return box === 0 ? 2 : Math.min(5, box + 1);
      case 'retry': case 'unsure': return Math.max(1, box === 0 ? 1 : box);
      default: return 1; // miss・no：箱1に戻る（あしたもう一度）
    }
  }
  function applyResults(boxStr, results, today) { // results: [{ i, res }]
    let s = boxStr;
    for (const r of results) { const c = card(s, r.i); s = setCard(s, r.i, nextBox(c.box, r.res), today); }
    return s;
  }
  function boxStats(str, n, today) {
    const o = { n, fresh: 0, due: 0, learning: 0, mastered: 0 };
    for (let i = 0; i < n; i++) {
      const c = card(str, i);
      if (!c.box) o.fresh++; else { if (c.box >= 4) o.mastered++; else o.learning++; if (isDue(c, today)) o.due++; }
    }
    return o;
  }

  // ================================================================= 種つき乱数
  function rng(seed) {
    let a = seed >>> 0;
    const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return f;
  }
  const seedOf = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ================================================================= レッスン
  const LESSON_SIZE = 8;
  const MAX_SELF = 2;    // 自己採点の問題は1レッスンに最大2つ
  const MAX_RETRY = 2;   // まちがえた問題がもどってくる回数の上限（それでも×なら「あとで復習」にまわす）
  const RETRY_GAP = 3;   // まちがえてから、ほかの問題を何問はさんで戻すか
  // 力のめやす（1〜5）：箱3以上の問題のむずかしさの平均＋少し。何もなければ 2
  function ability(qs, boxStr) {
    let s = 0, n = 0;
    for (let i = 0; i < qs.length; i++) { const c = card(boxStr, i); if (c.box >= 3) { s += qs[i].df; n++; } }
    return n ? Math.max(1.5, Math.min(4.5, s / n + 0.5)) : 2;
  }

  // opts: { qs（単元の問題。chunk の q）, boxes（箱の文字列）, today, seed, size, only（問題の位置の配列：復習モードなどで候補を限る）, target }
  function createLesson(opts) {
    const qs = opts.qs, today = opts.today | 0, size = opts.size || LESSON_SIZE, r = rng(seedOf(String(opts.seed == null ? 'x' : opts.seed)));
    const boxes = opts.boxes || '000'.repeat(qs.length);
    const only = opts.only ? new Set(opts.only) : null;
    const cand = [];
    for (let i = 0; i < qs.length; i++) {
      if (only && !only.has(i)) continue;
      const c = card(boxes, i);
      cand.push({ i, q: qs[i], box: c.box, due: isDue(c, today), late: c.box ? today - c.day - INTERVALS[c.box] : 0 });
    }
    let target = opts.target != null ? opts.target : ability(qs, boxes);
    const L = {
      qs, size, today, target, cand, r, boxes,
      used: new Set(), picked: [], queue: [], retry: [], miss: {}, firstOk: {}, resolved: 0, selfCount: 0, results: [], streak: 0, cur: null, over: false, asked: 0,
    };
    L.mode = opts.mode || 'practice';
    return nextQuestion(L), L;
  }
  const MAX_DUE = 3;
  function score(L, e) {
    // 目標のむずかしさに近いほど良い。復習の時期のものは優先。ゆらぎは種から
    let s = Math.abs(e.q.df - L.target) + L.r() * 0.9;
    if (e.due) s -= 1.2 + Math.min(1, e.late / 10);
    else if (e.box > 0) s += 0.8 + e.box * 0.25;        // 練習ずみの問題は、新しい問題よりあと
    if (L.mode === 'review' && e.box > 0) s -= 0.6 + (6 - e.box) * 0.15; // 復習モードでは箱の低いものを先に
    if (isSelfGrade(e.q) && L.selfCount >= MAX_SELF) s += 99;
    if (L.lastType && e.q.t === L.lastType) s += 0.15;
    return s;
  }
  function nextQuestion(L) {
    // もどってくる問題（まちがえた問題）
    const rt = L.retry.find(x => x.wait <= 0);
    if (rt || (L.picked.length >= L.size && L.retry.length)) {
      const x = rt || L.retry[0];
      L.retry.splice(L.retry.indexOf(x), 1);
      L.cur = { e: x.e, retry: true, tries: x.tries };
      L.asked++; return L.cur;
    }
    if (L.picked.length >= L.size) { L.over = true; L.cur = null; return null; }
    let best = null, bs = Infinity, dueNow = L.picked.filter(e => e.due).length;
    for (const e of L.cand) {
      if (L.used.has(e.i)) continue;
      if (e.due && dueNow >= MAX_DUE) continue;
      const sc = score(L, e);
      if (sc < bs) { bs = sc; best = e; }
    }
    if (!best) { // 候補が足りないとき：復習の時期でない問題・上限で外した問題も使う
      for (const e of L.cand) if (!L.used.has(e.i)) { const sc = score(L, e); if (sc < bs) { bs = sc; best = e; } }
    }
    if (!best) {
      if (L.retry.length) { const x = L.retry.shift(); L.cur = { e: x.e, retry: true, tries: x.tries }; L.asked++; return L.cur; }
      L.over = true; L.cur = null; return null;
    }
    L.used.add(best.i); L.picked.push(best); L.lastType = best.q.t;
    if (isSelfGrade(best.q)) L.selfCount++;
    L.cur = { e: best, retry: false, tries: 0 }; L.asked++;
    return L.cur;
  }
  // 答えを記録して次へ。kind: 'ok' | 'miss'（自動採点）／ 'sg-ok' | 'sg-unsure' | 'sg-no'（自己採点）
  function answer(L, kind) {
    const c = L.cur; if (!c) return null;
    const e = c.e, firstTry = !c.retry;
    const good = kind === 'ok' || kind === 'sg-ok';
    const soft = kind === 'sg-unsure';
    let res;
    if (firstTry) {
      res = kind === 'ok' ? 'first' : kind === 'miss' ? 'miss' : kind === 'sg-ok' ? 'ok' : soft ? 'unsure' : 'no';
      L.results.push({ i: e.i, res }); L.firstOk[e.i] = good || soft;
    }
    const xp = firstTry ? (good ? 2 : soft ? 1 : 0) : (good ? 1 : 0);
    L.streak = good ? L.streak + 1 : 0;
    // 目標のむずかしさ：2連続正解でひとつ上、まちがいでひとつ下
    if (good && L.streak >= 2) L.target = Math.min(5, L.target + 0.5); else if (!good && !soft) L.target = Math.max(1, L.target - 0.7);
    for (const x of L.retry) x.wait--;
    let again = false;
    if (!good && !soft) {
      if (firstTry) L.miss[e.i] = true;
      const tries = (c.tries || 0) + 1;
      if (!isSelfGrade(e.q) && tries <= MAX_RETRY) { L.retry.push({ e, tries, wait: RETRY_GAP }); again = true; }
    }
    if (!again) L.resolved++;
    const out = { kind, ok: good, xp, again, firstTry };
    L.cur = null;
    nextQuestion(L);
    if (!L.cur) L.over = true;
    return out;
  }
  // レッスンの結果（XP・正答率・箱の更新ぶん）
  function lessonSummary(L, xpGained) {
    const first = L.results.length, ok = L.results.filter(r => r.res === 'first' || r.res === 'ok').length;
    const perfect = first > 0 && ok === first;
    return { n: first, ok, acc: first ? ok / first : 0, perfect, bonus: 3 + (perfect ? 2 : 0), xp: xpGained + 3 + (perfect ? 2 : 0), results: L.results.slice(), missed: Object.keys(L.miss).map(Number) };
  }
  const progressOf = L => Math.min(1, L.resolved / L.size);

  // ================================================================= 保存・XP・ストリーク
  const KEEP_DAYS = 120, KEEP_XP_DAYS = 14;
  function defSave() { return { v: 1, xp: 0, d: [], g: {}, goal: 20, b: {}, st: { q: 0, ok: 0, ls: 0, mk: 0, best: 0 }, mk: {}, set: {}, gm: 0, fz: 0, hm: 0, hr: 5, cw: {}, ds: { d: 0 }, dq: { d: 0, c: [0, 0, 0] }, lg: { w: 0, t: 0 }, sk: 0, mm: [] }; }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  function normSave(raw) {
    const s = defSave();
    if (!raw || typeof raw !== 'object') return s;
    s.xp = Math.max(0, num(raw.xp, 0));
    if (Array.isArray(raw.d)) s.d = [...new Set(raw.d.filter(x => Number.isInteger(x) && x > 0))].sort((a, b) => a - b).slice(-KEEP_DAYS);
    if (raw.g && typeof raw.g === 'object') for (const k of Object.keys(raw.g)) if (/^\d+$/.test(k) && num(raw.g[k], 0) > 0) s.g[k] = raw.g[k];
    s.goal = [10, 20, 30, 50].includes(raw.goal) ? raw.goal : 20;
    if (raw.b && typeof raw.b === 'object') for (const k of Object.keys(raw.b)) if (typeof raw.b[k] === 'string' && /^[a-z0-9]+:[0-5A-Za-z0-9_-]*$/.test(raw.b[k])) s.b[k] = raw.b[k];
    if (raw.st && typeof raw.st === 'object') for (const k of Object.keys(s.st)) s.st[k] = Math.max(0, num(raw.st[k], 0));
    if (raw.mk && typeof raw.mk === 'object') for (const k of Object.keys(raw.mk)) if (num(raw.mk[k], -1) >= 0) s.mk[k] = Math.min(100, raw.mk[k]);
    if (raw.set && typeof raw.set === 'object') s.set = { cr: raw.set.cr === 'HS' ? 'HS' : 'JH', sub: typeof raw.set.sub === 'string' ? raw.set.sub.slice(0, 16) : undefined, g: [0, 1, 2, 3].includes(raw.set.g) ? raw.set.g : 0 };
    if (raw.tut) s.tut = 1;
    s.gm = Math.max(0, Math.min(1e6, Math.floor(num(raw.gm, 0)))); s.fz = Math.max(0, Math.min(2, Math.floor(num(raw.fz, 0))));
    s.hm = raw.hm ? 1 : 0; s.hr = Math.max(0, Math.min(5, Math.floor(num(raw.hr, 5))));
    if (raw.cw && typeof raw.cw === 'object') for (const k of Object.keys(raw.cw)) if (/^[A-Z]\d{1,2}$/.test(k)) s.cw[k] = Math.max(0, Math.min(5, Math.floor(num(raw.cw[k], 0))));
    if (raw.ds && typeof raw.ds === 'object') { s.ds = { d: Math.floor(num(raw.ds.d, 0)) }; for (const k of ['xp', 'ls', 'ok', 'perfect', 'rev', 'sp']) if (raw.ds[k]) s.ds[k] = Math.max(0, Math.floor(num(raw.ds[k], 0))); }
    if (raw.dq && typeof raw.dq === 'object') s.dq = { d: Math.floor(num(raw.dq.d, 0)), c: [0, 1, 2].map(i => (raw.dq.c && raw.dq.c[i] ? 1 : 0)) };
    if (raw.lg && typeof raw.lg === 'object') s.lg = { w: Math.floor(num(raw.lg.w, 0)), t: Math.max(0, Math.min(5, Math.floor(num(raw.lg.t, 0)))) };
    s.sk = Math.max(0, Math.min(5, Math.floor(num(raw.sk, 0))));
    if (Array.isArray(raw.mm)) s.mm = raw.mm.filter(x => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && x[0].length < 40 && x[1].length < 60).slice(-60).map(x => [x[0], x[1]]);
    // 古い日のXPを捨てる
    const keys = Object.keys(s.g).map(Number).sort((a, b) => a - b);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_XP_DAYS))) delete s.g[k];
    return s;
  }
  const weekOf = d => Math.floor((d + 3) / 7); // 月曜はじまりの週番号（1970-01-01 は木曜）
  const xpToday = (s, today) => s.g[today] || 0;
  const goalMet = (s, today) => xpToday(s, today) >= s.goal;
  // 連続日数：今日か昨日までつながっている日の数（今日まだなら昨日までを数える）
  function streakOf(days, today) {
    const set = new Set(days);
    let d = set.has(today) ? today : today - 1, n = 0;
    while (set.has(d)) { n++; d--; }
    return n;
  }
  // レッスン（や模試）をやった記録：save を書き換えて返す
  function recordLesson(save, o) { // o: { unitKey, setHash, boxes（新しい文字列）, xp, n, ok, today }
    const s = normSave(save);
    s.xp += o.xp | 0;
    if (!s.d.includes(o.today)) { s.d.push(o.today); s.d = s.d.slice(-KEEP_DAYS); }
    s.g[o.today] = (s.g[o.today] || 0) + (o.xp | 0);
    const keys = Object.keys(s.g).map(Number).sort((a, b) => a - b);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_XP_DAYS))) delete s.g[k];
    if (o.unitKey && o.boxes) s.b[o.unitKey] = packBoxes(o.setHash, o.boxes);
    s.st.q += o.n | 0; s.st.ok += o.ok | 0; if (o.kind === 'mock') s.st.mk++; else s.st.ls++;
    s.st.best = Math.max(s.st.best, streakOf(s.d, o.today));
    return s;
  }

  // ================================================================= 復習（単元をまたぐ）
  // save.b と index の単元から、復習の時期の問題数を数える（問題のファイルは読まない）：[{ key, set, n, due, learning }]
  function reviewSummary(save, setsMeta, today) {
    const out = [];
    for (const m of setsMeta) {
      const raw = save.b[m.id]; if (!raw) continue;
      const boxes = parseBoxes(raw, m.h, m.n);
      const st = boxStats(boxes, m.n, today);
      if (st.due) out.push({ id: m.id, due: st.due, learning: st.learning, meta: m });
    }
    return out.sort((a, b) => b.due - a.due || (a.id < b.id ? -1 : 1));
  }

  // ================================================================= 模試
  // answers: { <問題 id>: 入力 }、selfGrades: { <id>: 'ok'|'unsure'|'no' }。配点 p（なければ1）。自己採点は ok=満点・unsure=半分
  function scoreExam(exam, answers, selfGrades) {
    let got = 0, total = 0; const rows = [];
    for (const q of exam.q) {
      const p = q.p || 1; total += p;
      let frac = 0, res = null;
      if (isSelfGrade(q)) { const g = (selfGrades || {})[q.i]; frac = g === 'ok' ? 1 : g === 'unsure' ? 0.5 : 0; res = g || null; }
      else { const a = (answers || {})[q.i]; res = a == null || (typeof a === 'string' && !a.trim()) || (Array.isArray(a) && !a.length) ? null : check(q, a).ok; frac = res === true ? 1 : 0; }
      got += p * frac; rows.push({ i: q.i, p, frac, res });
    }
    return { got, total, pct: total ? Math.round(1000 * got / total) / 10 : 0, rows };
  }

  // ================================================================= 他のページから使う窓口（勉強ガード用）
  // KoboManabi.getQuiz({ n: 3, subjects: ['math','english'], levels: ['JH','HS'], types?: [...], base?: 'data/の場所', fetch?, random? })
  //   → Promise<{ questions: [{ id, type, stem, choices, unit, subject, level, difficulty, stimulus?, figure?, table?, unitText } …], check(question|id, answer) → { ok, correctText[], explanation }, n }>
  //   answer の形：mc＝選択肢のラベル／ms・or＝ラベルの配列／nu・sa＝文字列。自己採点の型（de・pr）は含まない（types で入れたときは check が { self: true }）。
  //   問題を取り出すとき、正答は返す問題オブジェクトに入れない（check の中だけで持つ）。
  const MAX_CHUNKS = 8; // 開いたままのデータは最大8つ（メモリを使いすぎない）
  const cache = { index: null, chunks: {} };
  let myBase = '';
  try { if (root.document && root.document.currentScript && root.document.currentScript.src) myBase = new URL('data/', root.document.currentScript.src).href; } catch (e) {}
  async function getJson(url, fetchFn) {
    const f = fetchFn || (root.fetch && root.fetch.bind(root));
    if (!f) throw new Error('no fetch');
    const r = await f(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return r.json();
  }
  async function loadIndex(base, fetchFn) {
    base = base || myBase;
    const key = base + 'index.json';
    if (!cache.index || cache.index.key !== key) cache.index = { key, p: getJson(key, fetchFn).catch(e => { cache.index = null; throw e; }) };
    return cache.index.p;
  }
  async function loadChunk(base, file, fetchFn) {
    base = base || myBase;
    const key = base + file;
    if (cache.chunks[key]) { const v = cache.chunks[key]; delete cache.chunks[key]; cache.chunks[key] = v; } // 使ったものを最後に（いちばん使っていないものから捨てる）
    else cache.chunks[key] = getJson(key, fetchFn).catch(e => { delete cache.chunks[key]; throw e; });
    const ks = Object.keys(cache.chunks); for (const k of ks.slice(0, Math.max(0, ks.length - MAX_CHUNKS))) delete cache.chunks[k];
    return cache.chunks[key];
  }
  async function getQuiz(o) {
    o = o || {};
    const n = Math.max(1, Math.min(50, o.n | 0 || 3));
    const levels = (o.levels && o.levels.length ? o.levels : ['JH', 'HS']).map(String);
    const subjects = o.subjects && o.subjects.length ? o.subjects : null;
    const types = o.types && o.types.length ? o.types : ['mc', 'ms', 'or', 'nu', 'sa'];
    const rand = o.random || Math.random;
    const base = o.base || myBase;
    const index = await loadIndex(base, o.fetch);
    const units = [];
    for (const c of index.courses) if (levels.includes(c.id)) for (const s of c.subjects) if (!subjects || subjects.includes(s.id)) for (const u of s.units) units.push(Object.assign({ course: c.id, subject: s.id }, u));
    if (!units.length) return { questions: [], check: () => ({ ok: false }), n: 0 };
    const chosen = [];
    const pool = units.slice();
    while (chosen.length < Math.min(pool.length, Math.max(1, Math.min(n, 3))) && pool.length) { // 1〜3 単元からまぜる
      let t = pool.reduce((a, u) => a + u.n, 0) * rand(), k = 0;
      for (; k < pool.length - 1; k++) { t -= pool[k].n; if (t <= 0) break; }
      chosen.push(pool.splice(k, 1)[0]);
    }
    const all = [];
    for (const u of chosen) for (const set of u.sets) {
      const ch = await loadChunk(base, set.f, o.fetch);
      for (const q of ch.q) if (types.includes(q.t)) all.push({ q, S: ch.S, u });
    }
    const picked = [];
    const arr = all.slice();
    while (picked.length < n && arr.length) picked.push(arr.splice(Math.floor(rand() * arr.length), 1)[0]);
    const answers = {};
    const questions = picked.map(({ q, S, u }) => {
      answers[q.i] = q;
      const st = q.st ? S[q.st] : null;
      return { id: q.i, type: q.t, stem: q.q, choices: q.c || null, unit: u.id, unitText: u.ti, subject: u.subject, level: u.course, difficulty: q.df, stimulus: st || null, figure: q.f || null, table: q.tb || null, unitSuffix: q.un || '' };
    });
    const find = x => answers[typeof x === 'string' ? x : x && x.id];
    return {
      n: questions.length, questions,
      check(x, input) {
        const q = find(x); if (!q) return { ok: false, unknown: true };
        const r = check(q, input);
        return Object.assign({}, r, { correctText: answerText(q), explanation: q.e || '' });
      },
    };
  }
  const KoboManabi = { getQuiz, version: 1 };
  root.KoboManabi = Object.assign(root.KoboManabi || {}, KoboManabi);

  const api = {
    // 文字
    tokenize, stripMarkup, normText, sameText, canonMath, evalMath, splitUnit, canonUnit, kata2hira,
    // 答え合わせ
    check, checkNumeric, checkShort, answerText, isSelfGrade,
    // ライトナー
    INTERVALS, EPOCH, dayNum, encDay, decDay, hashIds, parseBoxes, packBoxes, card, setCard, isDue, dueIn, nextBox, applyResults, boxStats,
    // 乱数・レッスン
    rng, seedOf, shuffle, LESSON_SIZE, MAX_RETRY, RETRY_GAP, MAX_SELF, ability, createLesson, answer, lessonSummary, progressOf, nextQuestion,
    // 保存
    defSave, normSave, weekOf, xpToday, goalMet, streakOf, recordLesson, reviewSummary, scoreExam,
    // 窓口・読み込み
    getQuiz, loadIndex, loadChunk, _cache: cache,
  };
  root.ManabiEngine = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
