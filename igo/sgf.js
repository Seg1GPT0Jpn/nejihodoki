// 囲碁工房：棋譜（SGF）の書き出しと読みこみ。枝わかれ（変化）つき。DOM は使わず、node でも動く。
// 木：{ mv: [マス, 色] | null（根）, kids: [], par, c（コメント）}。マス -1 はパス。座標は SGF の 'aa'（列・行、左上が aa）。
(function (root) {
  'use strict';
  const L = 'abcdefghijklmnopqrs';
  const enc = (c, n) => (c < 0 ? '' : L[c % n] + L[(c / n) | 0]);
  const dec = (s, n) => { if (!s || (s === 'tt' && n <= 19)) return -1; if (s.length !== 2) return null; const x = L.indexOf(s[0]), y = L.indexOf(s[1]); if (x < 0 || y < 0) return null; if (x >= n || y >= n) return n <= 19 && s === 'tt' ? -1 : null; return y * n + x; };
  const esc = s => String(s).replace(/[\]\\]/g, m => '\\' + m);
  const RULE = { jp: 'Japanese', cn: 'Chinese' };

  function node(mv, par) { return { mv, kids: [], par: par || null, c: '' }; }
  // 手のならびから、1本道の木を作る
  function linear(moves) { const r = node(null); let p = r; for (const m of moves) { const k = node([m[0], m[1]], p); p.kids.push(k); p = k; } return r; }
  const pathOf = nd => { const out = []; for (let x = nd; x && x.mv; x = x.par) out.push(x.mv); return out.reverse(); };
  // meta: { n, komi, rule, hc, setup（[[マス,色]…] 置き石）, pl, black, white, result, date, root（木）| moves }
  function write(meta) {
    const n = meta.n, root = meta.root || linear(meta.moves || []);
    let s = '(;GM[1]FF[4]CA[UTF-8]AP[Igo Workshop]SZ[' + n + ']KM[' + (meta.komi != null ? meta.komi : 6.5) + ']RU[' + (RULE[meta.rule] || 'Japanese') + ']';
    if (meta.hc >= 2) s += 'HA[' + meta.hc + ']';
    const ab = (meta.setup || []).filter(x => x[1] === 1).map(x => '[' + enc(x[0], n) + ']').join(''), aw = (meta.setup || []).filter(x => x[1] === 2).map(x => '[' + enc(x[0], n) + ']').join('');
    if (ab) s += 'AB' + ab; if (aw) s += 'AW' + aw;
    if (meta.pl === 1 || meta.pl === 2) s += 'PL[' + (meta.pl === 1 ? 'B' : 'W') + ']';
    if (meta.black) s += 'PB[' + esc(meta.black) + ']'; if (meta.white) s += 'PW[' + esc(meta.white) + ']';
    if (meta.date) s += 'DT[' + esc(meta.date) + ']'; if (meta.result) s += 'RE[' + esc(meta.result) + ']';
    if (root.c) s += 'C[' + esc(root.c) + ']';
    const seq = (nd) => {
      let out = '';
      const kids = nd.kids;
      if (!kids.length) return out;
      if (kids.length === 1) { const k = kids[0]; out += ';' + (k.mv[1] === 1 ? 'B' : 'W') + '[' + enc(k.mv[0], n) + ']' + (k.c ? 'C[' + esc(k.c) + ']' : ''); return out + seq(k); }
      for (const k of kids) out += '(;' + (k.mv[1] === 1 ? 'B' : 'W') + '[' + enc(k.mv[0], n) + ']' + (k.c ? 'C[' + esc(k.c) + ']' : '') + seq(k) + ')';
      return out;
    };
    return s + seq(root) + ')';
  }
  // 読みこみ。戻り値 { ok, n, komi, rule, hc, setup, pl, black, white, result, root } か { ok:false, why }
  function parse(text) {
    const src = String(text || ''); let i = 0; const len = src.length;
    const ws = () => { while (i < len && /\s/.test(src[i])) i++; };
    function props() {
      const o = {};
      for (;;) {
        ws(); let id = '';
        while (i < len && /[A-Za-z]/.test(src[i])) id += src[i++];
        if (!id) break;
        id = id.replace(/[a-z]/g, '');
        const vals = [];
        for (;;) {
          ws(); if (src[i] !== '[') break; i++; let v = '';
          while (i < len && src[i] !== ']') { if (src[i] === '\\' && i + 1 < len) { i++; } v += src[i++]; }
          i++; vals.push(v);
        }
        o[id] = (o[id] || []).concat(vals);
      }
      return o;
    }
    // 枝：; のノードと ( ) の変化がつづく
    let nodes = 0;
    function branch(parent, sz) {
      let cur = parent;
      for (;;) {
        ws();
        if (src[i] === ';') {
          i++; const p = props(); nodes++; if (nodes > 20000) throw new Error('too big');
          if (p.B || p.W) {
            const col = p.B ? 1 : 2, c = dec((p.B || p.W)[0], sz.n);
            if (c === null) throw new Error('bad coordinate');
            const nd = node([c, col], cur); nd.props = p; if (p.C) nd.c = p.C[0];
            cur.kids.push(nd); cur = nd;
          } else if (p.C && cur.mv) cur.c = (cur.c ? cur.c + '\n' : '') + p.C[0];
        } else if (src[i] === '(') { i++; branch(cur, sz); ws(); if (src[i] === ')') i++; }
        else break;
      }
    }
    try {
      const at = src.indexOf('(;'); if (at < 0) return { ok: false, why: 'not-sgf' };
      i = at + 2; const rootN = node(null), sz = { n: 19 };
      rootN.props = props(); if (rootN.props.C) rootN.c = rootN.props.C[0];
      if (rootN.props.SZ) sz.n = parseInt(rootN.props.SZ[0], 10) || 19;
      if (!(sz.n >= 2 && sz.n <= 19)) return { ok: false, why: 'size' };
      branch(rootN, sz);
      const P = rootN.props || {}, n = sz.n;
      const list = k => (P[k] || []);
      const cells = k => { const out = []; for (const v of list(k)) { if (/^[a-s]{2}:[a-s]{2}$/.test(v)) { const a = dec(v.slice(0, 2), n), b = dec(v.slice(3), n); if (a == null || b == null || a < 0 || b < 0) continue; for (let y = (a / n) | 0; y <= ((b / n) | 0); y++) for (let x = a % n; x <= b % n; x++) out.push(y * n + x); } else { const c = dec(v, n); if (c != null && c >= 0) out.push(c); } } return out; };
      const setup = []; for (const c of cells('AB')) setup.push([c, 1]); for (const c of cells('AW')) setup.push([c, 2]);
      const km = parseFloat((P.KM || [''])[0]); const rule = /chin|area|aga|ing/i.test((P.RU || [''])[0]) ? 'cn' : 'jp';
      const hc = parseInt((P.HA || ['0'])[0], 10) || 0;
      if (!rootN.kids.length && !setup.length) return { ok: false, why: 'no-moves' };
      const pl = (P.PL || [''])[0] === 'B' ? 1 : (P.PL || [''])[0] === 'W' ? 2 : 0;
      return { ok: true, n, komi: isFinite(km) ? km : null, rule, hc: hc >= 2 && hc <= 9 ? hc : 0, setup, pl, black: (P.PB || [''])[0], white: (P.PW || [''])[0], result: (P.RE || [''])[0], root: rootN };
    } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
  }
  const API = { enc, dec, write, parse, linear, pathOf, node };
  root.IgoSGF = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
