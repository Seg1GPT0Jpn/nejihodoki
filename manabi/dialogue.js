// まなびの工房：会話（ロールプレイ）の決まりごと（純粋なロジック。ブラウザでも node でも動く）
// ・場面（scene）の形と検査 validate：どの選択肢もどこかに続く／ぜんぶの道が終わりに着く（ぐるぐる回らない）／あなたの番には正しい選択肢がちょうど1つ
// ・声に出して答える：scoreSpeech（聞き取った文字と、正しい文を、ゆるく比べて 0〜100 点）
// 形：{ id, title, lang:'en'|'ja'|'kobun', level:1|2|3, partner:{ name, who }, start:'n1', nodes:{ n1:{ say, ja?, next? }, n2:{ say?, ja?, choices:[{ text, ja?, ok?, fb?, next }] }, nX:{ end:true, say?, ja? } } }
//   say＝相手のせりふ（英語なら読み上げる）。choices のある番＝あなたの番。ok:true が自然な答え。まちがい（ok なし）は fb で理由を言って、次へ進む。
(function (root) {
  'use strict';
  const E = root.ManabiEngine || (typeof require === 'function' ? require('./engine.js') : null);

  function validate(sc) {
    const err = [], N = sc && sc.nodes;
    const bad = m => err.push(m);
    if (!sc || typeof sc !== 'object') return ['not an object'];
    if (!/^[a-z0-9-]+$/.test(sc.id || '')) bad('id');
    if (!sc.title) bad('title');
    if (!['en', 'ja', 'kobun'].includes(sc.lang)) bad('lang');
    if (![1, 2, 3].includes(sc.level)) bad('level');
    if (!N || typeof N !== 'object' || !Object.keys(N).length) return err.concat('no nodes');
    if (!N[sc.start]) bad('start missing');
    const ids = Object.keys(N);
    let turns = 0, ends = 0;
    for (const id of ids) {
      const n = N[id];
      if (!n || typeof n !== 'object') { bad(id + ' not an object'); continue; }
      if (n.end) { ends++; if (n.choices || n.next) bad(id + ' end node has next/choices'); if (!n.say) bad(id + ' end needs say'); continue; }
      if (n.choices) {
        turns++;
        if (!Array.isArray(n.choices) || n.choices.length < 2 || n.choices.length > 4) bad(id + ' needs 2-4 choices');
        else {
          if (n.choices.filter(c => c.ok).length !== 1) bad(id + ' needs exactly one ok choice');
          const txt = n.choices.map(c => String(c.text || '').trim());
          if (txt.some(t => !t) || new Set(txt).size !== txt.length) bad(id + ' empty or duplicate choice text');
          for (const c of n.choices) { if (!N[c.next]) bad(id + ' choice leads nowhere: ' + c.next); if (!c.ok && !c.fb) bad(id + ' wrong choice needs fb'); }
        }
        if (n.next) bad(id + ' has both choices and next');
      } else {
        if (!n.say) bad(id + ' needs say');
        if (!N[n.next]) bad(id + ' next leads nowhere: ' + n.next);
      }
    }
    if (!ends) bad('no end node');
    if (turns < 3 || turns > 8) bad('3-8 player turns expected, got ' + turns);
    // 到達できる・ぐるぐる回らない・かならず終わる（深さ優先）
    const state = {}; let cyc = false;
    const out = n => (n.end ? [] : n.choices ? n.choices.map(c => c.next) : [n.next]);
    (function dfs(id, depth) {
      if (!N[id] || cyc) return;
      if (state[id] === 1) { cyc = true; return; } if (state[id] === 2) return;
      state[id] = 1; for (const nx of out(N[id])) dfs(nx, depth + 1); state[id] = 2;
    })(sc.start, 0);
    if (cyc) bad('cycle');
    for (const id of ids) if (!state[id]) bad(id + ' unreachable');
    // どの道も終わりに着く
    const memo = {}; const reachEnd = id => { if (memo[id] != null) return memo[id]; memo[id] = false; const n = N[id]; const r = !n ? false : n.end ? true : out(n).every(reachEnd); memo[id] = r; return r; };
    if (N[sc.start] && !reachEnd(sc.start)) bad('some path does not end');
    return err;
  }
  // いちばん長い道（あなたの番の数）
  function maxTurns(sc) { const memo = {}; const f = id => { if (memo[id] != null) return memo[id]; const n = sc.nodes[id]; let v = 0; if (n && !n.end) v = Math.max(...(n.choices ? n.choices.map(c => c.next) : [n.next]).map(f)) + (n.choices ? 1 : 0); return (memo[id] = v); }; return f(sc.start); }

  // ---- 声に出して答える：聞き取った文字と正しい文を比べる（単語ごとの編集距離。大文字小文字・句読点は無視）
  const words = s => E.normTextWords ? E.normTextWords(s) : String(s).normalize('NFKC').toLowerCase().replace(/[.,!?;:"“”]/g, ' ').replace(/['’]/g, "'").split(/\s+/).filter(Boolean);
  function lev(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0))); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function scoreSpeech(target, heard, lang) {
    if (lang === 'ja' || lang === 'kobun') { const a = E.normText(target), b = E.normText(heard); if (!a || !b) return 0; return Math.max(0, Math.round(100 * (1 - lev([...a], [...b]) / Math.max(a.length, b.length)))); }
    const a = words(target), b = words(heard); if (!a.length || !b.length) return 0;
    // 単語ごとに、つづりが近ければ部分点（聞き取りのまちがいをゆるす）
    let got = 0; const used = new Set();
    for (const w of a) { let best = 0, bi = -1; b.forEach((x, i) => { if (used.has(i)) return; const s = 1 - lev([...w], [...x]) / Math.max(w.length, x.length); if (s > best) { best = s; bi = i; } }); if (best >= 0.5) { got += best >= 0.99 ? 1 : best; used.add(bi); } }
    const extra = b.length - used.size;
    return Math.max(0, Math.min(100, Math.round(100 * (got - 0.25 * extra) / a.length)));
  }
  const PASS = 70;
  const speechSupported = () => !!(root.SpeechRecognition || root.webkitSpeechRecognition);

  const api = { validate, maxTurns, scoreSpeech, speechSupported, PASS };
  root.ManabiDlg = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
