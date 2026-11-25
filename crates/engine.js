// はこはこ運送（crates）：倉庫の荷運びパズルの中身。node でもブラウザでも動く（window.CratesEngine）。乱数は generator だけ（種つき）。
// ルール：プレイヤー（はこびやさん）は上下左右に1マス歩く。前に箱があれば、その先が空いているときだけ押せる（引けない・2つは押せない）。
// すべての箱を、ゴールのマスに乗せればクリア。ひねり（後半のパック）：
//   ~ すべる床   … 箱がのると、押した向きにすべって、床が終わる（次が壁・箱・床でない）まで止まらない。人は普通に歩く。
//   ^ > v <     … 一方通行の床。その向きにだけ入れる（人も箱も）。出るのは自由。
//   1 2 3       … ワープ台（同じ数字が2つで1組）。箱が止まったとき台の上なら、相手の台へとぶ（相手が空いているときだけ。人は素通り）。
// 地図の文字：# 壁  ' ' か _ 床  . ゴール  $ 箱  * ゴール上の箱  @ 人  + ゴール上の人  ~ すべる床  ^ > v < 一方通行  1 2 3 ワープ台。
// 外側（壁で囲まれていない空白）は、人の位置からのつながりで自動で「そと」になる。
(function (root) {
  'use strict';

  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];       // 0=上 1=右 2=下 3=左
  const DCH = 'urdl', PCH = 'URDL';
  const T = { VOID: 0, FLOOR: 1, GOAL: 2, ICE: 3, ONE: 4 /* 4..7 = 向き */, PAD: 8 };
  const INF = 1e9;

  // ---------------------------------------------------------------- 地図を読む
  function normRows(src) {
    let rows = Array.isArray(src) ? src.slice() : String(src).split(/\r?\n|\//);
    rows = rows.map(r => String(r).replace(/\s+$/, ''));
    while (rows.length && !rows[0].trim()) rows.shift();
    while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
    return rows;
  }
  // parse(rows) → レベル。変な地図は Error を投げる
  function parse(src, meta) {
    const rows = normRows(src);
    const H0 = rows.length; let W0 = 0; for (const r of rows) W0 = Math.max(W0, r.length);
    if (!H0 || !W0) throw new Error('empty level');
    if (W0 > 40 || H0 > 40) throw new Error('too big');
    const w = W0 + 2, h = H0 + 2, n = w * h;
    const ch = new Array(n).fill('#');         // まわりに壁の枠をつける
    for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) { const c = rows[y][x] || ' '; ch[(y + 1) * w + x + 1] = c === '_' ? ' ' : c; }
    const ALLOWED = ' #.$*@+~^>v<123456789';
    let player = -1, np = 0;
    for (let i = 0; i < n; i++) {
      const c = ch[i];
      if (ALLOWED.indexOf(c) < 0) throw new Error('bad char ' + JSON.stringify(c));
      if (c === '@' || c === '+') { player = i; np++; }
    }
    if (np !== 1) throw new Error('need exactly one player');
    // 人の位置から、壁でないマスをたどった範囲が「中」
    const inside = new Uint8Array(n); const q = [player]; inside[player] = 1;
    const padCells = {};
    for (let i = 0; i < n; i++) if (ch[i] >= '1' && ch[i] <= '9') (padCells[ch[i]] = padCells[ch[i]] || []).push(i);
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (let d = 0; d < 4; d++) { const m = c + DX[d] + DY[d] * w; if (ch[m] !== '#' && !inside[m] && m >= 0 && m < n) { inside[m] = 1; q.push(m); } }
      // ワープ台の相手のマスの側（人は行けないが、箱はとんでいける部屋）も「中」にする
      if (ch[c] >= '1' && ch[c] <= '9') for (const o of padCells[ch[c]]) if (!inside[o]) { inside[o] = 1; q.push(o); }
    }
    const t = new Uint8Array(n), goals = [], boxes = [], padAt = {};
    for (let i = 0; i < n; i++) {
      const c = ch[i];
      if (c === '#') continue;
      if (!inside[i]) { if (c !== ' ') throw new Error('item outside the room'); continue; }
      let ty = T.FLOOR;
      if (c === '.' || c === '*' || c === '+') { ty = T.GOAL; goals.push(i); }
      else if (c === '~') ty = T.ICE;
      else if (c === '^') ty = T.ONE + 0; else if (c === '>') ty = T.ONE + 1; else if (c === 'v') ty = T.ONE + 2; else if (c === '<') ty = T.ONE + 3;
      else if (c >= '1' && c <= '9') { ty = T.PAD; (padAt[c] = padAt[c] || []).push(i); }
      t[i] = ty;
      if (c === '$' || c === '*') boxes.push(i);
    }
    const padTo = new Int32Array(n).fill(-1);
    for (const k of Object.keys(padAt)) {
      if (padAt[k].length !== 2) throw new Error('teleport pad ' + k + ' needs exactly two');
      padTo[padAt[k][0]] = padAt[k][1]; padTo[padAt[k][1]] = padAt[k][0];
    }
    if (!boxes.length) throw new Error('no boxes');
    if (boxes.length !== goals.length) throw new Error('boxes (' + boxes.length + ') and goals (' + goals.length + ') differ');
    for (const b of boxes) if (t[b] !== T.FLOOR && t[b] !== T.GOAL) throw new Error('a box starts on a special tile');
    boxes.sort((a, b) => a - b);
    const L = {
      w, h, W: W0, H: H0, n, t, goals, padTo, D: [-w, 1, w, -1], start: { p: player, b: boxes }, nb: boxes.length,
      special: { ice: false, one: false, pad: false }, rows: rows.map(r => r.replace(/_/g, ' ')), meta: meta || null,
    };
    for (let i = 0; i < n; i++) { if (t[i] === T.ICE) L.special.ice = true; else if (t[i] >= 4 && t[i] <= 7) L.special.one = true; else if (t[i] === T.PAD) L.special.pad = true; }
    L.an = analyze(L);
    return L;
  }
  // いまの盤（人と箱の位置）を文字の地図にする（ワープ台の番号は、小さいマスの組から 1,2,3…）
  function toRows(L, st) {
    st = st || L.start; const out = [], bs = new Set(st.b);
    const order = []; for (let k = 0; k < L.n; k++) if (L.t[k] === T.PAD && L.padTo[k] > k) order.push(k);
    for (let y = 0; y < L.H; y++) {
      let s = '';
      for (let x = 0; x < L.W; x++) {
        const i = (y + 1) * L.w + x + 1, ty = L.t[i], isB = bs.has(i), isP = st.p === i;
        let c;
        if (ty === T.VOID) c = L.rows[y] && L.rows[y][x] === '#' ? '#' : ' ';
        else if (ty === T.GOAL) c = isB ? '*' : isP ? '+' : '.';
        else if (ty === T.ICE) c = '~';
        else if (ty >= 4 && ty <= 7) c = '^>v<'[ty - 4];
        else if (ty === T.PAD) c = String(order.indexOf(Math.min(i, L.padTo[i])) + 1);
        else c = isB ? '$' : isP ? '@' : ' ';
        s += c;
      }
      out.push(s.replace(/\s+$/, ''));
    }
    return out;
  }
  const cellXY = (L, i) => ({ x: (i % L.w) - 1, y: Math.floor(i / L.w) - 1 });
  const cellAt = (L, x, y) => (y + 1) * L.w + x + 1;

  // ---------------------------------------------------------------- 1手の動き
  const enter = (L, c, d) => { const ty = L.t[c]; if (ty === T.VOID) return false; if (ty >= 4 && ty <= 7 && ty - 4 !== d) return false; return true; };
  // 箱 c を向き d に押したとき、止まるマス（できないなら -1）。occ は箱のいるマス（c 自身を含む）。人は押したあと c に来る
  function pushTarget(L, occ, c, d) {
    const n = c + L.D[d];
    if (!enter(L, n, d) || occ[n]) return -1;
    let f = n;
    if (L.t[f] === T.ICE) {
      for (;;) { const m = f + L.D[d]; if (!enter(L, m, d) || occ[m]) break; f = m; if (L.t[f] !== T.ICE) break; }
    }
    if (L.t[f] === T.PAD) { const qd = L.padTo[f]; if (!occ[qd] && qd !== c) f = qd; }
    return f;
  }
  function occOf(L, boxes) { const o = new Uint8Array(L.n); for (let i = 0; i < boxes.length; i++) o[boxes[i]] = 1; return o; }
  const withBox = (boxes, from, to) => { const a = boxes.slice(); a[a.indexOf(from)] = to; return a.sort((x, y) => x - y); };

  // step(L, st, d) → null（動けない）か { st, push, from, to }
  function step(L, st, d) {
    const n = st.p + L.D[d];
    if (!enter(L, n, d)) return null;
    const bi = st.b.indexOf(n);
    if (bi < 0) return { st: { p: n, b: st.b }, push: false, from: -1, to: -1 };
    const occ = occOf(L, st.b), f = pushTarget(L, occ, n, d);
    if (f < 0) return null;
    return { st: { p: n, b: withBox(st.b, n, f) }, push: true, from: n, to: f };
  }
  const isWon = (L, st) => { for (let i = 0; i < st.b.length; i++) if (L.t[st.b[i]] !== T.GOAL) return false; return true; };
  const boxesOnGoal = (L, st) => { let k = 0; for (const b of st.b) if (L.t[b] === T.GOAL) k++; return k; };

  // 人が歩ける範囲（押さずに）。dist（Int32Array、行けないは -1）を返す。dist を渡すと使いまわす
  function reach(L, st, dist, occ) {
    dist = dist || new Int32Array(L.n); dist.fill(-1);
    occ = occ || occOf(L, st.b);
    const q = [st.p]; dist[st.p] = 0;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (let d = 0; d < 4; d++) { const m = c + L.D[d]; if (dist[m] < 0 && !occ[m] && enter(L, m, d)) { dist[m] = dist[c] + 1; q.push(m); } }
    }
    return dist;
  }
  // 人を target のマスまで歩かせる道（'urdl'）。押さない。行けなければ null
  function pathTo(L, st, target) {
    if (target === st.p) return '';
    const occ = occOf(L, st.b), prev = new Int32Array(L.n).fill(-1), pd = new Int8Array(L.n);
    const q = [st.p]; prev[st.p] = st.p;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (let d = 0; d < 4; d++) {
        const m = c + L.D[d];
        if (prev[m] < 0 && !occ[m] && enter(L, m, d)) { prev[m] = c; pd[m] = d; if (m === target) { let s = ''; for (let x = m; x !== st.p; x = prev[x]) s = DCH[pd[x]] + s; return s; } q.push(m); }
      }
    }
    return null;
  }
  const dirOf = ch => DCH.indexOf(String(ch).toLowerCase());

  // ---------------------------------------------------------------- 解析：行き止まりのマス・ゴールまでの下限
  // 箱1つだけ・人はどこにでも立てるとして、押してゴールに着ける見込みがないマス（dead）と、ゴールまでの押す回数の下限（hd）。
  // すべる床は途中で止まれる（ほかの箱が止めてくれる）、ワープは行ける・行けないのどちらもある、として広めに見る＝「行き止まり」と言い切れるマスだけが dead。
  function analyze(L) {
    const n = L.n, rev = Array.from({ length: n }, () => []);
    for (let c = 0; c < n; c++) {
      if (L.t[c] === T.VOID) continue;
      for (let d = 0; d < 4; d++) {
        const behind = c - L.D[d], m = c + L.D[d];
        if (L.t[behind] === T.VOID || !enter(L, m, d)) continue;
        const stops = [m]; let f = m;
        if (L.t[f] === T.ICE) for (;;) { const m2 = f + L.D[d]; if (!enter(L, m2, d)) break; f = m2; stops.push(f); if (L.t[f] !== T.ICE) break; }
        for (const s of stops.slice()) if (L.t[s] === T.PAD && L.padTo[s] >= 0) stops.push(L.padTo[s]);
        for (const s of stops) if (s !== c) rev[s].push(c);
      }
    }
    const hd = new Int32Array(n).fill(INF), q = [];
    for (const g of L.goals) { hd[g] = 0; q.push(g); }
    for (let k = 0; k < q.length; k++) { const c = q[k]; for (const p of rev[c]) if (hd[p] === INF) { hd[p] = hd[c] + 1; q.push(p); } }
    const dead = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (L.t[c] !== T.VOID && hd[c] === INF) dead[c] = 1;
    return { dead, hd };
  }

  // ---------------------------------------------------------------- 行き止まり（もう解けない）の検出。「解ける盤をまちがって行き止まりと言わない」ことだけを約束する
  function deadlocked(L, boxes, occ) {
    const A = L.an; occ = occ || occOf(L, boxes);
    for (let i = 0; i < boxes.length; i++) if (A.dead[boxes[i]]) return true;
    const memo = new Map();
    const wallLike = c => L.t[c] === T.VOID;
    // 軸 ax（0=たて 1=よこ）にそって動かせないか
    function blocked(c, ax, stack) {
      const a = c + (ax ? -1 : -L.w), b = c + (ax ? 1 : L.w);
      if (wallLike(a) || wallLike(b)) return true;
      if (A.dead[a] && A.dead[b] && L.t[a] !== T.ICE && L.t[b] !== T.ICE && L.t[a] !== T.PAD && L.t[b] !== T.PAD) return true;
      if (occ[a] && frozen(a, stack)) return true;
      if (occ[b] && frozen(b, stack)) return true;
      return false;
    }
    function frozen(c, stack) {
      if (stack.indexOf(c) >= 0) return true;
      if (memo.has(c) && stack.length === 0) return memo.get(c);
      stack.push(c);
      const r = blocked(c, 1, stack) && blocked(c, 0, stack);
      stack.pop();
      if (stack.length === 0) memo.set(c, r);
      return r;
    }
    for (let i = 0; i < boxes.length; i++) { const c = boxes[i]; if (L.t[c] !== T.GOAL && frozen(c, [])) return true; }
    // ゴールの上でも、凍りついた箱が別の箱を凍らせている場合は上の再帰で見ている
    return false;
  }
  // 押したあとの検出（箱 f を押したところ）：新しく行き止まりになりうるのは、f と、そのとなりの箱だけ（それ以外は押す前と同じ）
  function deadlockedPush(L, boxes, occ, f) {
    const A = L.an; if (A.dead[f]) return true;
    const w = L.w, memoDone = [];
    const wallLike = c => L.t[c] === T.VOID;
    function blocked(c, ax, stack) {
      const a = c + (ax ? -1 : -w), b = c + (ax ? 1 : w);
      if (wallLike(a) || wallLike(b)) return true;
      if (A.dead[a] && A.dead[b] && L.t[a] !== T.ICE && L.t[b] !== T.ICE && L.t[a] !== T.PAD && L.t[b] !== T.PAD) return true;
      if (occ[a] && frozen(a, stack)) return true;
      if (occ[b] && frozen(b, stack)) return true;
      return false;
    }
    function frozen(c, stack) {
      if (stack.indexOf(c) >= 0) return true;
      stack.push(c); const r = blocked(c, 1, stack) && blocked(c, 0, stack); stack.pop(); return r;
    }
    void memoDone;
    if (L.t[f] !== T.GOAL && frozen(f, [])) return true;
    for (let d = 0; d < 4; d++) { const n = f + L.D[d]; if (occ[n] && L.t[n] !== T.GOAL && frozen(n, [])) return true; }
    return false;
  }
  const isDeadlock = (L, st) => !isWon(L, st) && deadlocked(L, st.b);
  // 行き止まりになっている箱のマス（画面で赤く縁どる）
  function deadBoxes(L, st) {
    const out = [];
    if (isWon(L, st)) return out;
    for (const c of st.b) {
      if (L.an.dead[c]) { out.push(c); continue; }
    }
    if (!out.length && deadlocked(L, st.b)) {
      // どの箱が凍っているかを探す：1つずつ取り除いて、行き止まりが消えるか
      for (const c of st.b) { const rest = st.b.filter(x => x !== c); if (!deadlocked(L, rest) && L.t[c] !== T.GOAL) out.push(c); }
      if (!out.length) for (const c of st.b) if (L.t[c] !== T.GOAL) out.push(c);
    }
    return out;
  }

  // ---------------------------------------------------------------- 解く（A*）。mode 'pushes'：押す回数が最小／'moves'：歩数（押す手も1手）が最小
  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(); const n = k.length;
      if (n) {
        let i = 0;
        for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
  }
  function hsum(L, boxes) { let s = 0; const hd = L.an.hd; for (let i = 0; i < boxes.length; i++) { const v = hd[boxes[i]]; if (v >= INF) return INF; s += v; } return s; }

  // solve(L, st, { mode, maxNodes }) → { status: 'solved'|'unsolvable'|'limit', pushes, moves, seq, nodes }
  //   seq は 'urdl'（歩き）と 'URDL'（押し）の並び。pushes モードの moves は、その解の歩数（最小とは限らない）
  function solve(L, st, o) {
    o = o || {}; st = st || L.start;
    const mode = o.mode === 'moves' ? 'moves' : 'pushes', maxNodes = o.maxNodes || 400000;
    if (isWon(L, st)) return { status: 'solved', pushes: 0, moves: 0, seq: '', nodes: 1 };
    if (deadlocked(L, st.b)) return { status: 'unsolvable', nodes: 1 };
    const nodesB = [], nodesP = [], par = [], pmove = [], gs = [];       // 節点ごと：箱・人・親・押した（箱の元の位置と向き）・費用
    const index = new Map(), dist = new Int32Array(L.n), heap = new Heap();
    const keyOf = (boxes, p) => boxes.join(',') + '|' + p;
    // 'pushes' では人の居場所を「歩ける範囲でいちばん小さいマス」にそろえる
    const stamp = new Int32Array(L.n), nq = new Int32Array(L.n), occN = new Uint8Array(L.n); let stampN = 0;
    function norm(boxes, p) {
      if (mode === 'moves') return p;
      for (let i = 0; i < boxes.length; i++) occN[boxes[i]] = 1;
      stampN++; let mn = p, qn = 0; nq[qn++] = p; stamp[p] = stampN;
      for (let k = 0; k < qn; k++) {
        const c = nq[k];
        for (let d = 0; d < 4; d++) { const m = c + L.D[d]; if (stamp[m] !== stampN && !occN[m] && enter(L, m, d)) { stamp[m] = stampN; if (m < mn) mn = m; nq[qn++] = m; } }
      }
      for (let i = 0; i < boxes.length; i++) occN[boxes[i]] = 0;
      return mn;
    }
    function add(boxes, p, parent, mv, g) {
      const key = keyOf(boxes, norm(boxes, p));
      const old = index.get(key);
      if (old !== undefined) {
        if (g >= gs[old]) return;
        gs[old] = g; par[old] = parent; pmove[old] = mv; nodesP[old] = p;           // より安い道が見つかった
        heap.push((g + hsum(L, boxes)) * 100000 - g, old); return;
      }
      const id = nodesB.length; nodesB.push(boxes); nodesP.push(p); par.push(parent); pmove.push(mv); gs.push(g); index.set(key, id);
      heap.push((g + hsum(L, boxes)) * 100000 - g, id);
    }
    add(st.b.slice(), st.p, -1, null, 0);
    const closed = [], occ = new Uint8Array(L.n);
    let expanded = 0, goalId = -1, goalG = -1;
    while (heap.size) {
      const id = heap.pop(), g = gs[id];
      // 古い（より高い費用で入れた）エントリーは捨てる
      if (closed[id] === g) continue;
      const boxes = nodesB[id];
      { let won = true; for (let i = 0; i < boxes.length; i++) if (L.t[boxes[i]] !== T.GOAL) { won = false; break; } if (won) { goalId = id; goalG = g; break; } }
      closed[id] = g;
      if (++expanded > maxNodes) return { status: 'limit', nodes: expanded };
      for (let i = 0; i < boxes.length; i++) occ[boxes[i]] = 1;
      const p = nodesP[id];
      reach(L, { p, b: boxes }, dist, occ);
      for (let bi = 0; bi < boxes.length; bi++) {
        const c = boxes[bi];
        for (let d = 0; d < 4; d++) {
          const behind = c - L.D[d];
          if (dist[behind] < 0 || !enter(L, c, d)) continue;
          const f = pushTarget(L, occ, c, d);
          if (f < 0 || L.an.dead[f]) continue;
          const nb = withBox(boxes, c, f);
          occ[c] = 0; occ[f] = 1; const dl = deadlockedPush(L, nb, occ, f); occ[f] = 0; occ[c] = 1;
          if (dl) continue;
          add(nb, c, id, [c, d], g + (mode === 'moves' ? dist[behind] + 1 : 1));
        }
      }
      for (let i = 0; i < boxes.length; i++) occ[boxes[i]] = 0;
    }
    if (goalId < 0) return { status: 'unsolvable', nodes: expanded };
    // 押す列を取り出して、本当の歩きに直す
    const pushesSeq = []; for (let id = goalId; par[id] >= 0; id = par[id]) pushesSeq.push(pmove[id]);
    pushesSeq.reverse();
    let cur = { p: st.p, b: st.b.slice() }, seq = '';
    for (const [c, d] of pushesSeq) {
      const behind = c - L.D[d]; const walk = pathTo(L, cur, behind);
      if (walk === null) throw new Error('solver path broke');
      seq += walk; for (const wc of walk) cur = step(L, cur, dirOf(wc)).st;
      const r = step(L, cur, d); if (!r || !r.push) throw new Error('solver push broke');
      seq += PCH[d]; cur = r.st;
    }
    const pushes = pushesSeq.length;
    return { status: 'solved', pushes, moves: seq.length, seq, nodes: expanded, cost: goalG };
  }

  // ひとやすみ：いまの盤から、次の1押し（と、そこまでの歩き）を教える
  function hint(L, st, o) {
    const r = solve(L, st, Object.assign({ mode: 'pushes', maxNodes: 200000 }, o || {}));
    if (r.status !== 'solved') return { status: r.status };
    if (!r.seq) return { status: 'solved', done: true };
    let i = 0; while (i < r.seq.length && r.seq[i] === r.seq[i].toLowerCase()) i++;
    const walk = r.seq.slice(0, i), d = dirOf(r.seq[i]);
    let cur = st; for (const ch of walk) cur = step(L, cur, dirOf(ch)).st;
    const box = cur.p + L.D[d], res = step(L, cur, d);
    return { status: 'solved', walk, dir: d, box, to: res.to, left: r.pushes, seq: r.seq };
  }

  // ---------------------------------------------------------------- ゲームの1回分（もどす・やり直しは何回でも）
  function newGame(L) {
    return { L, cur: { st: L.start, moves: 0, pushes: 0, log: '' }, hist: [], redo: [], over: false };
  }
  // play(g, d) → { ok, push, won } 動けなければ ok:false
  function play(g, d) {
    if (g.over) return { ok: false, push: false, won: true };
    const r = step(g.L, g.cur.st, d); if (!r) return { ok: false, push: false, won: false };
    g.hist.push(g.cur); g.redo.length = 0;
    g.cur = { st: r.st, moves: g.cur.moves + 1, pushes: g.cur.pushes + (r.push ? 1 : 0), log: g.cur.log + (r.push ? PCH[d] : DCH[d]) };
    const won = isWon(g.L, g.cur.st); g.over = won;
    return { ok: true, push: r.push, won, from: r.from, to: r.to };
  }
  function undo(g) { if (!g.hist.length) return false; g.redo.push(g.cur); g.cur = g.hist.pop(); g.over = isWon(g.L, g.cur.st); return true; }
  function redo(g) { if (!g.redo.length) return false; g.hist.push(g.cur); g.cur = g.redo.pop(); g.over = isWon(g.L, g.cur.st); return true; }
  // やり直し：最初の盤に戻す。これも「もどす」で取り消せる
  function restart(g) { if (!g.hist.length && !g.cur.log) return false; g.hist.push(g.cur); g.redo.length = 0; g.cur = { st: g.L.start, moves: 0, pushes: 0, log: '' }; g.over = false; return true; }
  // 手の列を最初からたどった盤の列（リプレイ用）。1手でも動かない文字があれば null
  function replay(L, log) {
    const out = [{ st: L.start, moves: 0, pushes: 0 }]; let cur = L.start, pu = 0;
    for (let i = 0; i < log.length; i++) {
      const d = dirOf(log[i]); if (d < 0) return null;
      const r = step(L, cur, d); if (!r) return null;
      cur = r.st; if (r.push) pu++;
      out.push({ st: cur, moves: i + 1, pushes: pu, push: r.push, from: r.from, to: r.to, dir: d });
    }
    return out;
  }
  function loadGame(L, log) {
    const g = newGame(L); const rp = replay(L, log || ''); if (!rp) return null;
    for (let i = 1; i < rp.length; i++) { g.hist.push(g.cur); g.cur = { st: rp[i].st, moves: i, pushes: rp[i].pushes, log: log.slice(0, i) }; }
    g.over = isWon(L, g.cur.st); return g;
  }

  // ---------------------------------------------------------------- 星：最短の歩数（par）との差
  // 星3：最短の歩数 +15%（どんなに短くても +2 まで）以内／星2：+60%（+4 まで）以内／クリアで星1
  function thresholds(parMoves) { return [parMoves + Math.max(2, Math.ceil(parMoves * 0.15)), parMoves + Math.max(4, Math.ceil(parMoves * 0.6))]; }
  function starsOf(parMoves, moves) { const t = thresholds(parMoves); return moves <= t[0] ? 3 : moves <= t[1] ? 2 : 1; }

  // ---------------------------------------------------------------- 乱数（種つき）
  function mulberry32(a) { a = a >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash32 = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

  // ---------------------------------------------------------------- ステージのつくりかた：ゴールに箱を置いて、逆向きに引いてかきまぜる → 解いて確かめる
  const DIFFS = [null, { id: 1, name: { ja: 'やさしい', en: 'Easy' } }, { id: 2, name: { ja: 'ふつう', en: 'Normal' } }, { id: 3, name: { ja: 'むずかしい', en: 'Hard' } }];
  function genParams(size, diff) {
    size = Math.max(5, Math.min(12, size | 0)); diff = Math.max(1, Math.min(3, diff | 0));
    const boxes = Math.min(diff === 1 ? (size >= 9 ? 3 : 2) : diff === 2 ? (size >= 11 ? 4 : 3) : 4, Math.max(2, Math.floor((size - 2) * (size - 2) / 4.5)));
    const minPush = Math.round(boxes * (1.4 + diff * 1.5));
    const cap = diff === 3 ? 14000 : 12000, budget = diff === 3 ? 40000 : 24000;
    return { size, diff, boxes, minPush, cap, budget };
  }
  function buildCandidate(seed, P) {
    const rnd = mulberry32(seed), W = P.size, H = Math.max(5, P.size - (rnd() < 0.35 ? 1 : 0));
    const w = W, h = H, idx = (x, y) => y * w + x, wall = new Uint8Array(w * h).fill(1);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) wall[idx(x, y)] = 0;
    const connected = () => {
      let start = -1, free = 0; for (let i = 0; i < wall.length; i++) if (!wall[i]) { free++; if (start < 0) start = i; }
      const seen = new Uint8Array(wall.length), q = [start]; seen[start] = 1;
      for (let k = 0; k < q.length; k++) { const c = q[k], x = c % w, y = (c / w) | 0; for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const m = idx(x + dx, y + dy); if (!wall[m] && !seen[m]) { seen[m] = 1; q.push(m); } } }
      return q.length === free;
    };
    const blocks = Math.round((w - 2) * (h - 2) * (0.07 + 0.03 * P.diff));
    for (let k = 0, tries = 0; k < blocks && tries < 200; tries++) {
      const x = 1 + Math.floor(rnd() * (w - 2)), y = 1 + Math.floor(rnd() * (h - 2)), i = idx(x, y);
      if (wall[i]) continue;
      wall[i] = 1;
      if (!connected()) { wall[i] = 0; continue; }
      k++;
    }
    const floor = []; for (let i = 0; i < wall.length; i++) if (!wall[i]) floor.push(i);
    if (floor.length < P.boxes * 3 + 2) return null;
    const pick = () => floor.splice(Math.floor(rnd() * floor.length), 1)[0];
    const goals = []; for (let k = 0; k < P.boxes; k++) goals.push(pick());
    let boxes = goals.slice(), player = pick();
    const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const pulls = P.boxes * (5 + 4 * P.diff) + Math.floor(rnd() * 4);
    let lastBox = -1, lastDir = -1;
    for (let k = 0; k < pulls; k++) {
      // 人が歩ける範囲
      const occ = new Uint8Array(w * h); for (const b of boxes) occ[b] = 1;
      const seen = new Uint8Array(w * h), q = [player]; seen[player] = 1;
      for (let a = 0; a < q.length; a++) { const c = q[a], x = c % w, y = (c / w) | 0; for (const [dx, dy] of D4) { const m = idx(x + dx, y + dy); if (!wall[m] && !occ[m] && !seen[m]) { seen[m] = 1; q.push(m); } } }
      const cand = [];
      for (const b of boxes) {
        const bx = b % w, by = (b / w) | 0;
        for (let d = 0; d < 4; d++) {
          const y1 = idx(bx - D4[d][0], by - D4[d][1]), z = idx(bx - 2 * D4[d][0], by - 2 * D4[d][1]);   // 人が y1 に立って引くと、箱は y1 へ、人は z へ
          if (bx - 2 * D4[d][0] < 0 || bx - 2 * D4[d][0] >= w || by - 2 * D4[d][1] < 0 || by - 2 * D4[d][1] >= h) continue;
          if (!wall[y1] && seen[y1] && !wall[z] && !occ[z]) cand.push([b, y1, z, d]);
        }
      }
      if (!cand.length) break;
      // 同じ箱を同じ向きに続けて引きやすく／すぐ戻す引き方は避ける（長い解になりやすい）
      let pool = cand.filter(c => !(c[0] === lastBox && (c[3] + 2) % 4 === lastDir));
      if (!pool.length) pool = cand;
      const same = pool.filter(c => c[0] === lastBox && c[3] === lastDir);
      const [b, y1, z, d] = (same.length && rnd() < 0.4) ? same[Math.floor(rnd() * same.length)] : pool[Math.floor(rnd() * pool.length)];
      boxes = boxes.map(x => x === b ? y1 : x); player = z; lastBox = y1; lastDir = d;
    }
    boxes.sort((a, b) => a - b);
    const gs = new Set(goals), bs = new Set(boxes);
    if (boxes.filter(b => gs.has(b)).length >= P.boxes) return null;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        if (wall[i]) { s += '#'; continue; }
        const g = gs.has(i), b = bs.has(i), p = player === i;
        s += b ? (g ? '*' : '$') : p ? (g ? '+' : '@') : g ? '.' : ' ';
      }
      rows.push(s);
    }
    return rows;
  }
  // generate({ seed, size, diff }) → { rows, code, level, pushes, moves, exact, attempts } ／ 作れなかったら null（ふつうは起こらない）
  function generate(o) {
    const P = genParams(o.size, o.diff), seed0 = (o.seed >>> 0);
    let best = null, spent = 0;
    for (let a = 0; a < 60 && !(best && spent > P.budget); a++) {
      const seed = (seed0 + Math.imul(a, 0x9E3779B1)) >>> 0;
      const rows = buildCandidate(seed, P); if (!rows) continue;
      let L; try { L = parse(rows); } catch (e) { continue; }
      if (L.nb !== P.boxes) continue;
      const r = solve(L, L.start, { mode: 'pushes', maxNodes: P.cap });
      spent += r.nodes || 0;
      if (r.status !== 'solved') continue;
      if (!best || r.pushes > best.pushes) best = { rows, L, pushes: r.pushes, seq: r.seq, attempts: a + 1 };
      if (r.pushes >= P.minPush) break;
    }
    if (!best) return null;
    let moves = best.seq.length, exact = false;
    const m = solve(best.L, best.L.start, { mode: 'moves', maxNodes: P.cap * 2 });
    if (m.status === 'solved') { moves = m.moves; exact = true; }
    return { rows: best.rows, code: P.size + '-' + P.diff + '-' + seed0, level: best.L, pushes: best.pushes, moves, exact, attempts: best.attempts, seed: seed0, size: P.size, diff: P.diff };
  }
  // 「サイズ-むずかしさ-番号」の合言葉。例：8-2-12345
  function parseCode(s) {
    const m = /^\s*(\d{1,2})\s*[-.\s]\s*([1-3])\s*[-.\s]\s*(\d{1,10})\s*$/.exec(String(s || ''));
    if (!m) return null;
    const size = +m[1], diff = +m[2], seed = +m[3];
    if (size < 5 || size > 12 || seed > 4294967295) return null;
    return { size, diff, seed };
  }
  // きょうのステージ：日付から決まる種（platform.dailySeed）で、みんな同じ
  function dailyParams(seed) { seed = seed >>> 0; return { seed, size: 7 + (seed >>> 5) % 3, diff: 2 }; }

  // エディター用：地図 ⇔ 合言葉（CR1:段を / でつなぐ）
  function encodeLevel(rows) { return 'CR1:' + normRows(rows).map(r => r.replace(/ /g, '_')).join('/'); }
  function decodeLevel(code) {
    const m = /^\s*CR1:([^\s]+)\s*$/.exec(String(code || '')); if (!m) return null;
    const rows = m[1].split('/').map(r => r.replace(/_/g, ' '));
    try { parse(rows); } catch (e) { return null; }
    return rows;
  }

  const api = {
    DX, DY, DCH, PCH, T, INF, parse, toRows, cellXY, cellAt, enter, pushTarget, occOf, step, isWon, boxesOnGoal, reach, pathTo, dirOf,
    analyze, deadlocked, deadlockedPush, isDeadlock, deadBoxes, solve, hint, newGame, play, undo, redo, restart, replay, loadGame, thresholds, starsOf,
    mulberry32, hash32, DIFFS, genParams, generate, parseCode, dailyParams, encodeLevel, decodeLevel, normRows,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CratesEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
