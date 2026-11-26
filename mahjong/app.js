// 麻雀工房：画面と進行（solo / チュートリアル / 入門 / 本格 / オンラインのクライアント）
// 依存：engine.js（ルール）・ai.js（CPU・ヒント）・art.js（牌の絵）・text.js（説明）・online.js（オンラインのアダプター）
(function () {
'use strict';
const E = window.MahjongEngine, AI = window.MahjongAI, ART = window.MahjongArt, TX = window.MahjongText;
const PF = window.KoboPlatform || null, A = window.KoboAudio || null, UI = window.KoboUI || null;
const KG = () => window.KoboGame || null;
const T = KoboI18n.t;
const EN = KoboI18n.lang === 'en';
const L = (ja, en) => (EN ? en : ja);
const GAME = 'mahjong';
const SAVE_KEY = 'kusoge.mahjong.save', RUN_KEY = 'kusoge.mahjong.run', HOWTO_KEY = 'kusoge.mahjong.howto';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => Math.round(Number(n) || 0).toLocaleString(EN ? 'en-US' : 'ja-JP');
const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return { matches: false }; } })();
function emit(type, p) { const g = KG(); if (g) g.emit(type, p); }
function sfx(name, a) { if (A) A.sfx(name, a); }
const rndSeed = () => (Math.floor(Math.random() * 4294967295) + 1) >>> 0;

// ---------------------------------------------------------------- 言葉
KoboI18n.add({ en: {
  '麻雀工房': 'Mahjong Workshop', 'ゲーム一覧へ戻る': 'Back to games', 'メニュー': 'Menu', '麻雀卓': 'Mahjong table', '手牌': 'Hand', 'サウンド': 'Sound',
} });
const WINDS = ['東', '南', '西', '北'];
const WIND_EN = ['East', 'South', 'West', 'North'];
const NAMES = [L('あなた', 'You'), L('モカ', 'Mocha'), L('ココ', 'Coco'), L('ハル', 'Haru')];
const LV_NAME = { 1: L('よわい', 'Easy'), 2: L('ふつう', 'Normal'), 3: L('つよい', 'Hard') };
const kn = (k, red) => (EN ? ART.NAMES_EN[k] : ART.NAMES_JA[k]).replace(/^/, red ? L('赤', 'Red ') : '');
const yn = id => { const y = E.YAKU[id]; if (!y) return id; return EN ? y.en + ' (' + y.ja + ')' : y.ja; };
const yShort = id => { const y = E.YAKU[id]; return y ? (EN ? y.en : y.ja) : id; };
const roundName = st => (st.cfg.mode === 'mini' ? L('入門 ミニ麻雀', 'Beginner mini') : (EN ? WIND_EN[st.roundWind] + ' ' + (st.kyoku + 1) : WINDS[st.roundWind] + (st.kyoku + 1) + '局'));
const limitName = id => (EN ? TX.LIMIT_EN : TX.LIMIT_JA)[id] || '';

// ---------------------------------------------------------------- 保存（記録・設定。同期するのは kusoge.mahjong.save だけ）
function newSave() {
  return { v: 1, best: 0, g: {}, stats: {}, y: {}, set: { lv: 2, mode: 'east', aka: 1, ura: 1, ippatsu: 1, kuitan: 1, tobi: 1, west: 1, oka: 1, uma: '10-20', hint: 1, shanten: 1, onetap: 0, fast: 0, mini: 0 }, tut: 0 };
}
function readSave() {
  let o = null;
  try { o = JSON.parse(store.get(SAVE_KEY) || 'null'); } catch (e) {}
  const s = newSave();
  if (o && typeof o === 'object') {
    s.best = Math.max(0, Math.floor(Number(o.best) || 0));
    if (o.g && typeof o.g === 'object') for (const k of ['mini', 'east', 'hanchan']) if (o.g[k] && typeof o.g[k] === 'object') {
      const g = o.g[k]; s.g[k] = { p: Math.max(0, g.p | 0), w: Math.max(0, g.w | 0), r1: Math.max(0, g.r1 | 0), r2: Math.max(0, g.r2 | 0), r3: Math.max(0, g.r3 | 0), r4: Math.max(0, g.r4 | 0), b: Math.max(0, Math.floor(Number(g.b) || 0)) };
    }
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(o.stats)) { const v = Number(o.stats[k]); if (isFinite(v) && v >= 0) s.stats[k] = v; }
    if (o.y && typeof o.y === 'object') for (const k of Object.keys(o.y)) { const v = Number(o.y[k]); if (isFinite(v) && v >= 0 && E.YAKU[k]) s.y[k] = v; }
    if (o.set && typeof o.set === 'object') {
      const q = o.set, d = s.set;
      d.lv = clamp(Math.round(q.lv) || 2, 1, 3); d.mode = q.mode === 'hanchan' ? 'hanchan' : 'east';
      for (const k of ['aka', 'ura', 'ippatsu', 'kuitan', 'tobi', 'west', 'oka', 'hint', 'shanten', 'onetap', 'fast', 'mini']) if (k in q) d[k] = q[k] ? 1 : 0;
      d.uma = ['10-20', '5-10', 'none'].indexOf(q.uma) >= 0 ? q.uma : '10-20';
    }
    s.tut = o.tut ? 1 : 0;
  }
  return s;
}
let save = readSave();
function writeSave() { try { store.set(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const bump = (k, n) => { save.stats[k] = (save.stats[k] || 0) + (n == null ? 1 : n); };
const bumpY = id => { save.y[id] = (save.y[id] || 0) + 1; };

// ---------------------------------------------------------------- 牌の見た目
function tileHTML(id, cls, attrs) {
  const k = id >> 2, red = E.isRed(id);
  return '<span class="tl' + (red ? ' red' : '') + (cls ? ' ' + cls : '') + '"' + (attrs || '') + ' data-id="' + id + '" data-k="' + k + '"><span class="f">' + ART.face(k, red) + '</span></span>';
}
function kindHTML(k, cls) { return '<span class="tl' + (cls ? ' ' + cls : '') + '" data-k="' + k + '"><span class="f">' + ART.face(k, false) + '</span></span>'; }
function backHTML(cls) { return '<span class="tl bk' + (cls ? ' ' + cls : '') + '"><span class="f">' + ART.back + '</span></span>'; }
function tileBtn(id, cls, label) {
  const k = id >> 2, red = E.isRed(id);
  return '<button type="button" class="tl' + (red ? ' red' : '') + (cls ? ' ' + cls : '') + '" data-id="' + id + '" data-k="' + k + '" aria-label="' + esc(label || kn(k, red)) + '"><span class="f">' + ART.face(k, red) + '</span></button>';
}
function meldHTML(m, owner) {
  // 副露：横向きの牌は「鳴いた牌」（誰から鳴いたかで位置が変わる）。暗槓は両はしが伏せ
  const ids = m.tiles.slice();
  if (m.type === 'ankan') return '<span class="m">' + backHTML() + tileHTML(ids[0]) + tileHTML(ids[1]) + backHTML() + '</span>';
  const rel = (m.from - owner + 4) % 4, called = m.called;
  const rest = ids.filter(x => x !== called && x !== m.added);
  const pos = rel === 3 ? 0 : rel === 2 ? 1 : rest.length;   // 上家 = 左、対面 = まんなか、下家 = 右
  const out = rest.map(x => tileHTML(x));
  const side = [tileHTML(called, 'sw')]; if (m.added != null) side.push(tileHTML(m.added, 'sw'));
  out.splice(Math.min(pos, out.length), 0, ...side);
  return '<span class="m">' + out.join('') + '</span>';
}

// ---------------------------------------------------------------- ゲーム（G）
let G = null;
const boardEl = $('board');
let hw = 22, bw = 300;
const myLegal = () => (!G ? [] : G.net ? (G.netLegal || []) : (G.view ? [] : E.legal(G.st, G.me)));
const humanSeat = s => (G && !G.view && (G.net ? s === G.me : s === G.me));
const relOf = s => (s - G.me + 4) % 4;
const seatName = s => (G.names && G.names[s]) || NAMES[s];

// 画面の大きさに合わせる：卓は正方形、手牌は14枚が1行に入る大きさ
function measure() {
  const main = $('main'), r = main.getBoundingClientRect();
  const W = Math.max(200, r.width - 16), H = r.height;
  const land = window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  if (land) {
    bw = clamp(Math.min(H - 40, W * 0.52), 150, 520);
    const lowW = W - bw - 8; hw = clamp(Math.floor((lowW - 8) / 7.8), 20, 40);
  } else {
    hw = clamp(Math.floor((W - 6) / 14.9), 18, 46);
    const lowH = 50 + hw * 1.36 + 16 + 28 + 52 + 20;
    bw = clamp(Math.min(W, H - 44 - lowH), 180, 560);
  }
  document.documentElement.style.setProperty('--bw', Math.round(bw) + 'px');
  document.documentElement.style.setProperty('--hw', hw + 'px');
  boardEl.style.setProperty('--bw', Math.round(bw) + 'px');
  $('scores').style.width = Math.round(land ? bw : Math.min(W, Math.max(bw, 280))) + 'px';
  $('scores').style.margin = '0 auto';
}

function riverHTML(s, n, ofs) {
  const st = G.st, rv = st.rivers[s], len = rv.length, rel = relOf(s);
  const cols = len > 18 ? 8 : 6, f = len > 18 ? 0.78 : 1, tw = bw * 0.064 * f, th = tw * 1.36;
  const rows = Math.max(1, Math.ceil(len / cols)), W = cols * tw, H = rows * th;
  let left, top, rot;
  if (rel === 0) { left = bw / 2 - W / 2; top = bw * 0.685; rot = 0; }
  else if (rel === 2) { left = bw / 2 - W / 2; top = bw * 0.315 - H; rot = 180; }
  else if (rel === 1) { left = bw * 0.685 + H / 2 - W / 2; top = bw / 2 - H / 2; rot = -90; }
  else { left = bw * 0.315 - H / 2 - W / 2; top = bw / 2 - H / 2; rot = 90; }
  let h = '<div class="rv" data-s="' + s + '" style="left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) + 'px;width:' + W.toFixed(1) + 'px;height:' + H.toFixed(1) + 'px;grid-template-columns:repeat(' + cols + ',' + tw.toFixed(2) + 'px);grid-auto-rows:' + th.toFixed(2) + 'px;--rtw:' + tw.toFixed(2) + 'px;transform:rotate(' + rot + 'deg)">';
  rv.forEach((r, i) => {
    const last = G.lastD && G.lastD.s === s && G.lastD.i === i;
    h += tileHTML(r.t, (r.riichi ? 'rc ' : '') + (r.called ? 'cl ' : '') + (last ? 'nw' : ''));
  });
  return h + '</div>';
}
function handBackHTML(s) {
  const st = G.st, n = st.hands[s].length - (st.drawn >= 0 && st.turn === s && st.phase === 'discard' ? 1 : 0), rel = relOf(s);
  const tw = bw * 0.036, W = (n + (st.drawn >= 0 && st.turn === s && st.phase === 'discard' ? 0.6 : 0)) * (tw + 1) + 1, th = tw * 1.36;
  let left, top, rot;
  if (rel === 2) { left = bw / 2 - W / 2; top = bw * 0.012; rot = 180; }
  else if (rel === 1) { left = bw - bw * 0.012 - th / 2 - W / 2 - 2; top = bw / 2 - th / 2; rot = -90; }
  else { left = bw * 0.012 + th / 2 - W / 2 + 2; top = bw / 2 - th / 2; rot = 90; }
  let h = '<div class="hb" style="left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) + 'px;gap:1px;transform:rotate(' + rot + 'deg)">';
  for (let i = 0; i < st.hands[s].length; i++) { const dr = i === st.hands[s].length - 1 && st.drawn >= 0 && st.turn === s && st.phase === 'discard'; h += backHTML(dr ? 'dr' : '').replace('class="tl bk dr"', 'class="tl bk" style="margin-left:' + (tw * 0.5).toFixed(1) + 'px"'); }
  return h + '</div>';
}
function oppMeldsHTML(s) {
  const st = G.st, ms = st.melds[s]; if (!ms.length) return '';
  const rel = relOf(s);
  const pos = rel === 2 ? 'left:2%;top:7.5%;' : rel === 3 ? 'right:2%;top:7.5%;justify-content:flex-end;' : 'right:2%;bottom:2%;justify-content:flex-end;';
  return '<div class="ml" style="' + pos + 'width:28%">' + ms.map(m => meldHTML(m, s)).join('') + '</div>';
}
function renderBoard() {
  const st = G.st;
  let h = '';
  for (let s = 0; s < 4; s++) { h += riverHTML(s); if (s !== G.me) { h += handBackHTML(s); h += oppMeldsHTML(s); } }
  // 中央：局・ドラ表示牌・残り枚数
  const ind = E.doraIndicators(st).filter(x => x >= 0), n = st.doraN;
  let dr = '';
  for (let i = 0; i < 5; i++) dr += i < n && st.dead[4 + 2 * i] >= 0 ? tileHTML(st.dead[4 + 2 * i]) : backHTML();
  const wd = [0, 1, 2, 3].map(r => '<span class="wd w' + r + '">' + (EN ? WIND_EN[E.seatWind(st, (G.me + r) % 4)][0] : WINDS[E.seatWind(st, (G.me + r) % 4)]) + '</span>').join('');
  h += '<div id="center">' + wd + '<div class="rd">' + esc(roundName(st)) + '</div><div class="dr" aria-label="' + esc(L('ドラ表示牌', 'Dora indicators')) + '">' + dr + '</div>' +
    '<div class="sub">' + esc(L('残り', 'Wall')) + ' ' + E.remaining(st) + ' · ' + st.honba + esc(L('本場', ' honba')) + (st.kyotaku ? ' · ' + esc(L('供託', 'stick')) + st.kyotaku : '') + '</div></div>';
  boardEl.innerHTML = h;
  boardEl.classList.toggle('mine', isMyDecision());
}
function renderScores() {
  const st = G.st; let h = '';
  const on = new Set(E.waiting(st));
  for (let r = 0; r < 4; r++) {
    const s = (G.me + r) % 4, w = E.seatWind(st, s);
    h += '<div class="sc' + (s === st.dealer ? ' dealer' : '') + (on.has(s) && st.phase !== 'end' ? ' on' : '') + '" data-s="' + s + '"><div class="nm"><i>' + (EN ? WIND_EN[w][0] : WINDS[w]) + '</i>' + esc(seatName(s)) + (G.net && G.sl && G.sl[s] === 'c' ? '<i>CPU</i>' : '') + '</div><div class="pt">' + fmtN(st.scores[s]) + (st.riichi[s] ? ' <span class="rch" title="' + esc(L('リーチ', 'Riichi')) + '"></span>' : '') + '</div></div>';
  }
  $('scores').innerHTML = h;
}

// ---------------------------------------------------------------- 手牌
const isMyDecision = () => !!G && !G.view && G.st.phase === 'discard' && G.st.turn === G.me && !G.over && !G.menu && !G.busy;
function validDiscardKinds() { const o = new Set(); myLegal().forEach(a => { if (a.t === 'discard' && !!a.riichi === !!G.riichiMode) o.add(a.tile >> 2); }); return o; }
function hintTile() { return G && G.hint && G.hint.tile != null ? G.hint.tile : -1; }
function renderHand() {
  const st = G.st, me = G.me, hand = st.hands[me].slice();
  const decide = isMyDecision();
  const valid = decide ? validDiscardKinds() : null;
  const drawn = decide && st.drawn >= 0 ? st.drawn : -1;
  const rest = hand.filter(x => x !== drawn);
  const hot = G.coachTile != null ? G.coachTile : (G.hintOn && G.hint && decide && !G.coach && G.hint.tile != null ? G.hint.tile : -1);
  const mk = id => {
    let cls = '';
    if (id === drawn) cls += 'dr ';
    if (G.sel === id) cls += 'sel ';
    if (decide && valid && !valid.has(id >> 2)) cls += 'dim ';
    if (decide && hot === id) cls += 'hot ';
    return tileBtn(id, cls.trim(), kn(id >> 2, E.isRed(id)));
  };
  let h = rest.map(mk).join('');
  if (drawn >= 0) h += mk(drawn);
  $('hand').innerHTML = h;
  $('hand').classList.toggle('mine', decide);
  $('mymelds').innerHTML = st.melds[me].map(m => meldHTML(m, me)).join('');
}

// ---------------------------------------------------------------- ヒントの言葉
function shantenText(s) {
  if (s < 0) return L('あがり形', 'Complete hand');
  if (s === 0) return L('テンパイ', 'Tenpai (ready)');
  return L('あと' + (s + 1) + '枚でテンパイ（' + s + 'シャンテン）', s + '-shanten (' + (s + 1) + ' good tiles from tenpai)');
}
function shantenShort(s) { return s < 0 ? L('あがり', 'Win') : s === 0 ? L('テンパイ', 'Tenpai') : s + L('シャンテン', '-shanten'); }
function listTiles(list, max) { return list.slice(0, max || 8).map(x => kindHTML(x.k) ).join(''); }
function hintHTML(h) {
  if (!h) return '';
  if (h.type === 'tsumo') return '<b>' + esc(L('ツモ！ あがれます。「ツモ」を押そう', 'Tsumo! You can win. Press "Tsumo".')) + '</b>';
  if (h.type === 'ron') return '<b>' + esc(L('ロン！ あがれます', 'Ron! You can win.')) + '</b>';
  if (h.type === 'kyuushu') return '<b>' + esc(L('九種九牌：流局にもできます', 'Nine kinds of terminals/honors: you may abort the hand.')) + '</b>';
  if (h.type === 'ankan') return '<b>' + esc(L('カンをするとよさそうです', 'A kan looks good here.')) + '</b>';
  if (h.type === 'pon' || h.type === 'chii' || h.type === 'daiminkan') return '<b>' + esc(h.type === 'pon' ? L('ポン', 'Pon') : h.type === 'chii' ? L('チー', 'Chii') : L('カン', 'Kan')) + '</b> ' + esc(L('で手が進みます', 'speeds up your hand.'));
  if (h.type === 'pass') return '<b>' + esc(L('パス', 'Pass')) + '</b> <span class="why">' + esc(L('鳴かないほうがよさそうです', 'Better not to call.')) + '</span>';
  if (h.tile == null) return '';
  const k = h.kind, red = E.isRed(h.tile);
  let why = [];
  why.push(shantenText(h.shanten));
  if (h.ukeire && h.shanten >= 0) why.push(L('進む牌 ', 'Useful tiles: ') + h.ukeire + L('枚', ''));
  const rs = h.reason || [];
  if (rs.indexOf('lonely-honor') >= 0) why.push(L('役にならない字牌は使いにくい', 'A lone non-scoring honor rarely helps'));
  else if (rs.indexOf('lonely-terminal') >= 0) why.push(L('端の牌は つながりにくい', 'Edge tiles connect poorly'));
  else if (rs.indexOf('isolated') >= 0) why.push(L('まわりに仲間がいない牌', 'This tile has no neighbors'));
  if (rs.indexOf('safe') >= 0) why.push(L('リーチした人に通りやすい（安全）', 'Safe against the riichi player'));
  if (rs.indexOf('danger') >= 0) why.push(L('少しあぶないが 手が良いので押す', 'Slightly risky, but your hand is worth pushing'));
  let alt = '';
  if (h.alt && h.alt.length && !G.mini) alt = ' <span class="why">' + esc(L('他の候補', 'Other options')) + ': ' + h.alt.map(a => kindHTML(a.kind) + '(' + a.ukeire + ')').join(' ') + '</span>';
  const lead = h.riichi ? L('リーチして ', 'Riichi, then discard ') : L('この牌を切ろう：', 'Discard ');
  return esc(lead) + '<b>' + kindHTML(k, red ? 'red' : '') + esc(kn(k, red)) + '</b> <span class="why">' + esc(why.join(' / ')) + '</span>' + alt + (h.shanten === 0 && h.list && h.list.length ? '<span class="why"> ' + esc(L('待ち', 'Waits')) + ': ' + listTiles(h.list, 6) + '</span>' : '');
}
function refreshHint() {
  if (!G || G.view) { G && ($('hint').innerHTML = ''); return; }
  const st = G.st;
  G.hint = null;
  if (G.net && !G.netHintOk) { $('hint').innerHTML = ''; $('hint').classList.remove('you'); return; }
  const decide = (isMyDecision() || (st.phase === 'call' && myLegal().length && !G.over)) && !G.coach;
  let h = null;
  if (decide && (G.hintOn || G.mini)) { try { h = AI.hint(st, G.me); } catch (e) { h = null; } }
  G.hint = h;
  let html = '';
  if (G.coachMsg) html = G.coachMsg + (G.coachOk ? ' <button type="button" class="act go" data-coach="1" style="flex:none;min-height:36px;min-width:64px">OK</button>' : '');
  else if (h && G.hintOn) html = hintHTML(h);
  else if (G.showShanten && st.phase !== 'end' && !G.over) {
    // シャンテンと受け入れの表示（ヒントなし）
    const info = AI.handInfo(st, G.me);
    html = '<b>' + esc(shantenShort(info.shanten)) + '</b> <span class="why">' + (info.shanten >= 0 ? esc(L('進む牌 ', 'Useful: ') + info.ukeire + L('枚', '')) + ' ' + listTiles(info.list, 7) : '') + '</span>';
    const fu = furitenMsg(); if (fu) html += ' <span class="why">' + esc(fu) + '</span>';
  }
  $('hint').innerHTML = html;
  $('hint').classList.toggle('you', !!html && isMyDecision());
}
function furitenMsg() {
  if (!G || G.net) return '';
  const st = G.st; if (st.hands[G.me].length % 3 === 2 && !(st.furi[G.me] || st.tmpFuri[G.me])) {
    // 14枚のとき：打つとテンパイになる形のフリテンは出さない
    return '';
  }
  const f = E.furitenState(st, G.me);
  if (!f) return '';
  return f === 'riichi' ? L('フリテン：リーチ後に見逃したので、ツモだけあがれます', 'Furiten: you passed a winning tile after riichi; only Tsumo wins.')
    : f === 'temp' ? L('フリテン：見逃したので、次の自分の番まで ロンできません', 'Furiten: you passed a win, so no Ron until your next discard.')
      : L('フリテン：待ち牌を前に自分で捨てたので、ロンできません（ツモはOK）', 'Furiten: a winning tile is in your own discards, so no Ron (Tsumo is fine).');
}
function statusText() {
  const st = G.st;
  if (G.over) return '';
  if (G.coachMsg) return '';
  if (st.phase === 'end') return L('局が終わりました', 'The hand is over');
  if (G.view) return '';
  if (isMyDecision()) {
    if (G.riichiMode) return L('リーチで切る牌を選んでください', 'Pick the tile to discard with riichi');
    return L('あなたの番：切る牌をタップ（もう一度タップで捨てる）', 'Your turn: tap a tile, then tap again to discard');
  }
  if (st.phase === 'call' && myLegal().length) return L('鳴きますか？', 'Call?');
  const w = E.waiting(st)[0];
  return w != null ? L(seatName(w) + 'の番', seatName(w) + "'s turn") : '';
}

// ---------------------------------------------------------------- 操作ボタン
function actBtn(id, label, cls, small, html) { return '<button type="button" class="act ' + (cls || '') + '" data-id="' + id + '">' + (html || esc(label)) + (small ? '<small>' + esc(small) + '</small>' : '') + '</button>'; }
function renderCtl() {
  const ctl = $('ctl'); const st = G.st;
  let h = '';
  if (G.view && G.replay) {
    const R = G.replay;
    ctl.innerHTML = actBtn('rp-first', '|<', '', L('はじめ', 'start')) + actBtn('rp-prev', '<', '', L('1手前', 'back')) + actBtn('rp-next', '>', 'go', R.n + ' / ' + R.acts.length) + actBtn('rp-close', L('とじる', 'Close'));
    return;
  }
  if (G.pickHTML) { ctl.innerHTML = G.pickHTML; return; }
  const L0 = myLegal();
  if (!G.over && !G.menu && !G.view) {
    if (st.phase === 'discard' && st.turn === G.me) {
      if (L0.some(a => a.t === 'tsumo')) h += actBtn('tsumo', L('ツモ', 'Tsumo'), 'go hot', L('あがり', 'win'));
      if (L0.some(a => a.t === 'discard' && a.riichi)) h += '<button type="button" class="act' + (G.riichiMode ? ' on' : '') + (G.coachBtn === 'riichi' ? ' hot' : '') + '" data-id="riichi" aria-pressed="' + !!G.riichiMode + '">' + esc(L('リーチ', 'Riichi')) + '<small>' + esc(G.riichiMode ? L('とりけす', 'cancel') : L('宣言', 'declare')) + '</small></button>';
      const ak = L0.filter(a => a.t === 'ankan' || a.t === 'kakan');
      if (ak.length) h += actBtn('kan', L('カン', 'Kan'), '', ak.some(a => a.t === 'kakan') && !ak.some(a => a.t === 'ankan') ? L('加槓', 'add') : L('暗槓', 'closed'));
      if (L0.some(a => a.t === 'kyuushu')) h += actBtn('kyuushu', L('流局', 'Abort'), '', L('九種九牌', 'nine kinds'));
    } else if (st.phase === 'call' && L0.length) {
      if (L0.some(a => a.t === 'ron')) h += actBtn('ron', L('ロン', 'Ron'), 'go hot', L('あがり', 'win'));
      const pons = L0.filter(a => a.t === 'pon'), chis = L0.filter(a => a.t === 'chii');
      if (pons.length) h += actBtn('pon', L('ポン', 'Pon'), '', pons.length > 1 ? L('赤を使う/使わない', 'red or not') : L('3枚そろえる', 'triplet'));
      if (chis.length) h += actBtn('chii', L('チー', 'Chii'), '', L('順子にする', 'sequence'));
      if (L0.some(a => a.t === 'daiminkan')) h += actBtn('daiminkan', L('カン', 'Kan'), '', L('4枚そろえる', 'quad'));
      h += actBtn('pass', L('パス', 'Pass'), '', L('鳴かない', 'skip'));
    }
    if (G.practice && !G.net && !G.tut && G.hist && G.hist.length > 1) h += actBtn('undo', L('もどす', 'Undo'), '', L('れんしゅう', 'practice'));
  }
  ctl.innerHTML = h;
}
function renderInfo() {
  const st = G.st;
  $('iGame').textContent = G.title || roundName(st);
  const pr = $('iPrac'); pr.hidden = !(G.practice && !G.net); pr.textContent = L('れんしゅう', 'Practice');
  $('iBest').textContent = L('最高 ', 'Best ') + fmtN(save.best);
}
function render() {
  if (!G) return;
  measure();
  renderScores(); renderBoard(); renderHand();
  renderInfo();
  refreshHint(); renderCtl();
  const s = $('status'); s.textContent = statusText(); s.classList.toggle('you', isMyDecision());
  const live = $('live'); if (live && G.liveMsg) { live.textContent = G.liveMsg; G.liveMsg = ''; }
}
function bubble(s, text, hot) {
  const el = document.createElement('div'); el.className = 'bubble' + (hot ? ' hot' : ''); el.textContent = text;
  const r = relOf(s), pos = [[50, 76], [80, 50], [50, 22], [20, 50]][r];
  el.style.left = pos[0] + '%'; el.style.top = pos[1] + '%'; boardEl.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ---------------------------------------------------------------- 進行
let cpuDelayMul = (() => { try { return DEBUG && /[?&]speed=([\d.]+)/.test(location.search) ? parseFloat(RegExp.$1) : 1; } catch (e) { return 1; } })();
const ms = n => Math.round(n * cpuDelayMul * (save.set.fast ? 0.4 : 1));
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function cfgFromSave(mode) {
  const s = save.set;
  return { mode: mode === 'mini' ? 'mini' : mode, mini: mode === 'mini', aka: !!s.aka, ura: !!s.ura, ippatsu: !!s.ippatsu, kuitan: !!s.kuitan, tobi: !!s.tobi, west: !!s.west, oka: !!s.oka, uma: s.uma };
}
function newGame(o) {
  o = o || {};
  const mode = o.mode || (save.set.mini ? 'mini' : save.set.mode);
  const lv = o.level || save.set.lv, mini = mode === 'mini';
  const levels = o.levels || [0, lv, lv, lv];
  const seed = o.seed || rndSeed();
  const cfg = Object.assign(cfgFromSave(mode), o.cfg || {});
  const st = E.create({ seed, levels: levels.map(x => x || 2), cfg, wall: o.wall || null, dummyCpu: !!o.dummy });
  if (o.dealer != null) { st.dealer = o.dealer; E.startRound(st, o.wall || undefined); }
  G = { st, mode, mini, practice: !!o.practice || !!o.tutorial, tutorial: !!o.tutorial, dummy: !!o.dummy, levels, me: 0, rng: E.mulberry32(seed ^ 0x5bd1e995), names: NAMES.slice(),
    kifu: [], hist: [], sel: null, riichiMode: false, hintOn: !!(o.hint != null ? o.hint : (mini || o.tutorial || o.practice) ? save.set.hint : 0), showShanten: !!(o.shanten != null ? o.shanten : (mini || save.set.shanten)), over: false, menu: false, t0: Date.now(), rec: { hands: 0, wins: 0, lastWinKind: '' }, net: false, title: '' };
  G.cur = { info: E.roundInfo(st), acts: [] }; G.kifu.push(G.cur);
  G.title = (mini ? L('入門・ミニ麻雀', 'Beginner mini mahjong') : mode === 'east' ? L('東風戦', 'Tonpuusen (East)') : L('東南戦', 'Hanchan (East+South)')) + (G.practice && !G.tutorial ? '' : '');
  if (o.tutorial) { G.title = L('チュートリアル', 'Tutorial'); G.tut = { step: 0, intro: 0 }; }
  hideOverlays(); document.body.classList.remove('thumb');
  emit('play_start', { mode: G.net ? 'versus' : 'solo' });
  render(); loop();
  return G;
}
function persist() {
  if (!G || G.net || G.over || G.view || G.tutorial) return;
  try { store.set(RUN_KEY, JSON.stringify({ v: 1, mode: G.mode, practice: G.practice, levels: G.levels, st: G.st, cur: G.cur, kifu: G.kifu.slice(-3), rec: G.rec, t: Date.now() })); } catch (e) {}
}
function readRun() { try { const r = JSON.parse(store.get(RUN_KEY) || 'null'); return r && r.v === 1 && r.st && r.st.v === 1 ? r : null; } catch (e) { return null; } }
function resumeGame() {
  const r = readRun(); if (!r) return false;
  const st = r.st;
  G = { st, mode: r.mode, mini: r.mode === 'mini', practice: !!r.practice, tutorial: false, dummy: false, levels: r.levels, me: 0, rng: E.mulberry32(rndSeed()), names: NAMES.slice(), kifu: r.kifu || [], hist: [], sel: null, riichiMode: false,
    hintOn: !!(r.mode === 'mini' || r.practice) && !!save.set.hint, showShanten: r.mode === 'mini' || !!save.set.shanten, over: false, menu: false, t0: Date.now(), rec: r.rec || { hands: 0, wins: 0 }, net: false,
    title: r.mode === 'mini' ? L('入門・ミニ麻雀', 'Beginner mini mahjong') : r.mode === 'east' ? L('東風戦', 'Tonpuusen (East)') : L('東南戦', 'Hanchan (East+South)') };
  G.cur = r.cur || { info: E.roundInfo(st), acts: [] }; if (!G.kifu.length || G.kifu[G.kifu.length - 1] !== G.cur) G.kifu.push(G.cur);
  hideOverlays(); emit('play_start', { mode: 'solo' }); render(); loop();
  return true;
}
function hideOverlays() { ['ovTitle', 'ovResult', 'ovInfo'].forEach(i => { const e = $(i); if (e) e.hidden = true; }); }

// ---- 1手
function handleEvents(evs, by) {
  const st = G.st;
  for (const e of evs || []) {
    switch (e.t) {
      case 'discard': G.lastD = { s: e.s, i: st.rivers[e.s].length - 1 }; sfx(e.s === G.me ? 'tap' : 'move'); G.liveMsg = L(seatName(e.s) + 'が' + kn(e.tile >> 2, E.isRed(e.tile)) + 'を切りました', seatName(e.s) + ' discarded ' + kn(e.tile >> 2, E.isRed(e.tile))); break;
      case 'riichi': bubble(e.s, L('リーチ！', 'Riichi!'), true); sfx('coin'); G.rec.riichi = (G.rec.riichi || 0) + (e.s === G.me ? 1 : 0); break;
      case 'pon': bubble(e.s, L('ポン！', 'Pon!')); sfx('pop'); break;
      case 'chii': bubble(e.s, L('チー！', 'Chii!')); sfx('pop'); break;
      case 'daiminkan': case 'ankan': case 'kakan': bubble(e.s, L('カン！', 'Kan!'), true); sfx('pop'); break;
      case 'dora': sfx('select'); break;
      case 'agari': {
        const r = e.result;
        r.winners.forEach(w => bubble(w.seat, r.type === 'tsumo' ? L('ツモ！', 'Tsumo!') : L('ロン！', 'Ron!'), true));
        sfx(r.winners.some(w => w.seat === G.me) ? 'win' : 'fail'); break;
      }
      case 'draw-end': sfx('over'); break;
      case 'furiten': if (e.s === G.me) { bubble(e.s, L('フリテン', 'Furiten')); } break;
      default: break;
    }
  }
}
function act(seat, a, opt) {
  if (!G || G.over) return false;
  const st = G.st;
  const wasHuman = seat === G.me;
  if (wasHuman && G.practice && G.hist && !opt) { /* 手を打つ前の状態は humanPoint で保存済み */ }
  const r = E.apply(st, seat, a);
  if (!r) { sfx('error'); return false; }
  G.cur.acts.push([seat, a]);
  if (wasHuman) { G.rec.acts = (G.rec.acts || 0) + 1; if (a.t === 'pon' || a.t === 'chii') bump('calls'); if (a.t === 'daiminkan' || a.t === 'ankan' || a.t === 'kakan') bump('kan'); }
  G.sel = null; G.riichiMode = false; G.pickHTML = ''; G.hint = null; G.coachTile = null; G.coachBtn = null;
  handleEvents(r.ev);
  persist();
  if (G.tut) tutAfter(a);
  render(); loop();
  return true;
}
function dummyAct(st, seat) {
  const L0 = E.legal(st, seat);
  if (st.phase === 'discard') { const d = L0.find(a => a.t === 'discard' && (a.tile >> 2) === (st.drawn >> 2) && !a.riichi); return d ? { t: 'discard', tile: st.drawn } : L0.find(a => a.t === 'discard' && !a.riichi); }
  return { t: 'pass' };
}
function cpuAct(seat) {
  if (!G || G.over || G.menu || G.st.phase === 'end') return;
  const st = G.st;
  if (!E.waiting(st).includes(seat)) { loop(); return; }
  let a;
  if (G.dummy) a = dummyAct(st, seat);
  else {
    const t0 = performance.now();
    try { a = AI.decide(st, seat, G.levels[seat] || 2, G.rng); } catch (e) { a = AI.auto(st, seat); }
    G.maxAi = Math.max(G.maxAi || 0, performance.now() - t0);
  }
  if (!a || !E.legal(st, seat).some(x => x.t === a.t && (a.t !== 'discard' || (x.tile >> 2 === a.tile >> 2 && !!x.riichi === !!a.riichi)) && (a.t !== 'ankan' || x.kind === a.kind))) a = AI.auto(st, seat);
  act(seat, a);
}
function loop() {
  if (!G || G.over || G.menu || G.view || G.net) return;
  clearTimeout(G.timer);
  const st = G.st;
  if (st.phase === 'end') { G.timer = setTimeout(showRoundResult, ms(st.result && st.result.type !== 'draw' ? 900 : 700)); return; }
  const w = E.waiting(st);
  const cpu = w.find(s => s !== G.me);
  if (cpu != null && !(st.phase === 'discard' && w[0] === G.me)) {
    G.timer = setTimeout(() => cpuAct(cpu), ms(st.phase === 'discard' ? 480 + Math.floor(G.rng() * 260) : 60));
    return;
  }
  if (w.includes(G.me)) humanPoint();
}
function humanPoint() {
  if (!G.practice || G.net) { render(); return; }
  const snap = JSON.stringify({ st: G.st, n: G.cur.acts.length, cur: G.cur.info });
  if (!G.hist.length || G.hist[G.hist.length - 1] !== snap) { G.hist.push(snap); if (G.hist.length > 80) G.hist.shift(); }
  if (G.tut) tutBefore();
  render();
}
function undo() {
  if (!G || !G.practice || G.hist.length < 2) { sfx('error'); return; }
  G.hist.pop(); const prev = G.hist[G.hist.length - 1];
  const o = JSON.parse(prev);
  G.st = o.st; G.cur.acts.length = o.n; G.sel = null; G.riichiMode = false; G.pickHTML = ''; G.lastD = null; G.hint = null;
  bump('undos'); sfx('select');
  render(); loop();
}

// ---- 人の操作
function userDiscard(id) {
  if (!isMyDecision()) return;
  const k = id >> 2;
  const a = myLegal().find(x => x.t === 'discard' && (x.tile >> 2) === k && !!x.riichi === !!G.riichiMode);
  if (!a) { sfx('error'); return; }
  if (G.tut && !tutAllow('discard', id)) { sfx('error'); return; }
  if (G.net) return netSend({ t: 'discard', tile: id, riichi: !!a.riichi });
  act(G.me, { t: 'discard', tile: id, riichi: !!a.riichi });
}
function onHandClick(e) {
  const b = e.target.closest && e.target.closest('.tl'); if (!b || !b.dataset.id) return;
  if (!isMyDecision()) return;
  const id = +b.dataset.id;
  if (G.sel === id || save.set.onetap) { userDiscard(id); return; }
  if (!validDiscardKinds().has(id >> 2)) { sfx('error'); return; }
  G.sel = id; sfx('select'); renderHand(); refreshHint();
}
$('hand').addEventListener('click', onHandClick);
function pickPanel(title, opts, onPick) {
  G.pickHTML = '<div class="pick" role="group" aria-label="' + esc(title) + '">' + opts.map((o, i) => '<button type="button" data-pick="' + i + '" aria-label="' + esc(o.label) + '">' + o.html + '</button>').join('') + '<button type="button" data-pick="x">' + esc(L('やめる', 'Cancel')) + '</button></div>';
  G.pickFn = onPick; renderCtl();
}
function sendOrAct(a) { if (G.net) return netSend(a); return act(G.me, a); }
function onCtl(e) {
  if (G && G.view && G.replay) {
    const b = e.target.closest && e.target.closest('.act'); if (!b) return;
    const id = b.dataset.id;
    if (id === 'rp-first') replayTo(0); else if (id === 'rp-prev') replayTo(G.replay.n - 1); else if (id === 'rp-next') replayTo(G.replay.n + 1); else if (id === 'rp-close') exitReplay();
    return;
  }
  const pk = e.target.closest && e.target.closest('[data-pick]');
  if (pk) { const fn = G.pickFn; G.pickHTML = ''; G.pickFn = null; if (pk.dataset.pick === 'x') { renderCtl(); return; } if (fn) fn(+pk.dataset.pick); return; }
  const b = e.target.closest && e.target.closest('.act'); if (!b || b.disabled) return;
  const id = b.dataset.id, L0 = myLegal();
  if (G.tut && !tutAllow('btn', id)) { sfx('error'); return; }
  switch (id) {
    case 'tsumo': sendOrAct({ t: 'tsumo' }); break;
    case 'ron': sendOrAct({ t: 'ron' }); break;
    case 'pass': sendOrAct({ t: 'pass' }); break;
    case 'riichi': G.riichiMode = !G.riichiMode; G.sel = null; sfx('select'); if (G.tut) tutAfterToggle(); render(); break;
    case 'kyuushu': sendOrAct({ t: 'kyuushu' }); break;
    case 'daiminkan': sendOrAct({ t: 'daiminkan' }); break;
    case 'undo': undo(); break;
    case 'kan': {
      const ks = L0.filter(a => a.t === 'ankan' || a.t === 'kakan');
      if (ks.length === 1) sendOrAct(ks[0]);
      else pickPanel(L('カンする牌', 'Kan tile'), ks.map(a => ({ label: kn(a.kind != null ? a.kind : a.tile >> 2), html: kindHTML(a.kind != null ? a.kind : a.tile >> 2) })), i => sendOrAct(ks[i]));
      break;
    }
    case 'pon': case 'chii': {
      const os = L0.filter(a => a.t === id);
      if (os.length === 1) sendOrAct(os[0]);
      else pickPanel(id === 'pon' ? L('ポン', 'Pon') : L('チー', 'Chii'), os.map(a => ({ label: a.use.map(x => kn(x >> 2, E.isRed(x))).join('+'), html: a.use.map(x => tileHTML(x)).join('') + tileHTML(G.st.call ? G.st.call.tile : (G.netTile || a.use[0])) })), i => sendOrAct(os[i]));
      break;
    }
    default: break;
  }
}
$('ctl').addEventListener('click', onCtl);
// キーボード：←→ で選ぶ、Enter/Space で切る、T=ツモ R=リーチ O=ロン P=ポン C=チー K=カン N=パス H=ヒント U=もどす
document.addEventListener('keydown', e => {
  if (!G || G.over || G.menu || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.overlay:not([hidden]):not(.coach)')) return;
  const k = e.key;
  const clickBtn = id => { const b = document.querySelector('#ctl .act[data-id="' + id + '"]'); if (b) { b.click(); e.preventDefault(); return true; } return false; };
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (!isMyDecision()) return;
    const ids = Array.from(document.querySelectorAll('#hand .tl')).map(b => +b.dataset.id); if (!ids.length) return;
    let i = G.sel == null ? (k === 'ArrowLeft' ? ids.length : -1) : ids.indexOf(G.sel);
    i = clamp(i + (k === 'ArrowLeft' ? -1 : 1), 0, ids.length - 1); G.sel = ids[i]; sfx('select'); renderHand(); refreshHint(); e.preventDefault();
  } else if (k === 'Enter' || k === ' ') { if (isMyDecision() && G.sel != null) { userDiscard(G.sel); e.preventDefault(); } }
  else if (k === 'Escape') { if (G.pickHTML) { G.pickHTML = ''; renderCtl(); } else if (G.riichiMode) { G.riichiMode = false; render(); } }
  else {
    const key = k.toLowerCase();
    if (key === 't') { clickBtn('tsumo') || clickBtn('ron'); } else if (key === 'o') clickBtn('ron');
    else if (key === 'r') clickBtn('riichi'); else if (key === 'p') clickBtn('pon'); else if (key === 'c') clickBtn('chii');
    else if (key === 'k') clickBtn('kan') || clickBtn('daiminkan'); else if (key === 'n') clickBtn('pass'); else if (key === 'u') clickBtn('undo');
    else if (key === 'h') { G.hintOn = !G.hintOn; render(); }
  }
});

// ---------------------------------------------------------------- 記録
function recordRound(res) {
  if (!G || G.practice || G.net || G.tutorial) return;
  const me = G.me;
  bump('hands'); G.rec.hands++;
  if (G.mini) bump('miniHands');
  if (res.type === 'draw') {
    bump('draws'); if (res.tenpai && res.tenpai[me]) bump('tenpaiDraw'); if (res.nagashi && res.nagashi.indexOf(me) >= 0) bump('nagashi');
    return;
  }
  for (const w of res.winners) {
    const mine = w.seat === me;
    if (!mine) { if (res.type === 'ron' && res.from === me) bump('deal'); continue; }
    bump('agari'); G.rec.wins++; if (G.mini) bump('miniWins');
    bump(res.type === 'tsumo' ? 'tsumo' : 'ron');
    if (w.seat === G.st.dealer) bump('dealerWin');
    const ids = w.yaku.map(y => y.id);
    ids.forEach(id => bumpY(id));
    if (ids.indexOf('riichi') >= 0 || ids.indexOf('wriichi') >= 0) bump('riichiWin');
    if (w.yakuman) bump('yakuman'); else if (w.limit === 'mangan') bump('mangan'); else if (w.limit === 'haneman') bump('haneman'); else if (w.limit === 'baiman' || w.limit === 'sanbaiman' || w.limit === 'kazoe') bump('baiman');
    if (w.han >= 5 && !w.yakuman) bump('mangan+');
    if (w.melds && w.melds.length) bump('openWin');
    if (res.type === 'ron' && ids.indexOf('chankan') >= 0) bump('chankan');
    save.stats.maxHan = Math.max(save.stats.maxHan || 0, w.yakuman ? 13 * w.yakuman : w.han);
    save.stats.maxPts = Math.max(save.stats.maxPts || 0, res.delta[me]);
  }
  writeSave();
}
function recordGame(fin) {
  if (!G || G.practice || G.net || G.tutorial) return;
  const me = G.me, mode = G.mode, g = save.g[mode] = save.g[mode] || { p: 0, w: 0, r1: 0, r2: 0, r3: 0, r4: 0, b: 0 };
  g.p++; const rank = fin.rank[me]; g['r' + rank]++; if (rank === 1) g.w++;
  bump('games'); if (rank === 1) bump('top');
  if (!G.mini) {
    const sc = Math.round(G.st.scores[me]); g.b = Math.max(g.b || 0, sc); save.best = Math.max(save.best || 0, sc);
    if (rank === 1 && G.levels.slice(1).every(l => l === 3)) bump('hardTop');
    if (rank === 1 && G.levels.slice(1).every(l => l >= 2)) bump('normalTop');
    if (G.st.scores.some((x, i) => i !== me && x < 0)) bump('tobiMade');
    if (G.st.scores[me] < 0) bump('tobiHit');
  }
  writeSave();
}

// ---------------------------------------------------------------- 結果の画面
function handShowHTML(w, st) {
  const hand = w.hand.slice();
  const wi = hand.indexOf(w.win); if (wi >= 0) hand.splice(wi, 1);
  let h = '<div class="hand-show">' + hand.map(x => tileHTML(x)).join('');
  h += '<span class="gap"></span>' + tileHTML(w.win, 'win');
  for (const m of w.melds || []) h += meldHTML(m, w.seat);
  return h + '</div>';
}
function fuLines(w) {
  if (!w.fuDetail) return '';
  const map = EN ? TX.FU_EN : TX.FU_JA; let h = '<div class="rows fu">';
  for (const d of w.fuDetail) {
    let label = map[d[0]] || d[0], extra = '';
    if (d[0] === 'set' && d[2]) { const k = d[2].k; extra = ' ' + kn(k) + (d[2].open ? L('（明）', ' (open)') : L('（暗）', ' (closed)')) + (d[2].kan ? L(' カン', ' kan') : ''); }
    if (d[0] === 'pair' && d[2]) extra = ' ' + kn(d[2].k);
    if (d[0] === 'wait') extra = ' ' + ({ kan: L('嵌張', 'kanchan'), pen: L('辺張', 'penchan'), tan: L('単騎', 'tanki') })[d[2]];
    h += '<div class="r"><span>' + esc(label + extra) + '</span><span>+' + d[1] + L('符', ' fu') + '</span></div>';
  }
  return h + '</div>';
}
function winnerHTML(w, res, idx) {
  const st = G.st; let h = '';
  const who = seatName(w.seat);
  h += '<div class="tip" style="text-align:center"><b>' + esc(who) + '</b> ' + esc(res.type === 'tsumo' ? L('のツモあがり', ' won by Tsumo') : L('のロンあがり（' + seatName(res.from) + 'が放銃）', ' won by Ron off ' + seatName(res.from))) + '</div>';
  h += handShowHTML(w, st);
  // ドラ表示牌
  const ind = E.doraIndicators(st).filter(x => x >= 0);
  h += '<div class="hand-show" aria-label="dora">' + esc(L('ドラ表示牌', 'Dora')) + ' ' + ind.map(x => tileHTML(x)).join('') + (w.ura && w.ura.length ? ' &nbsp;' + esc(L('裏', 'Ura')) + ' ' + E.uraIndicators(st).slice(0, st.doraN).map(x => tileHTML(x)).join('') : '') + '</div>';
  h += '<div class="rows">';
  for (const y of w.yaku) {
    const info = TX.BY[y.id], big = y.han >= 13 && info && info.closed >= 13;
    h += '<div class="r"><span>' + esc(yn(y.id)) + (G.mini && info && y.id !== 'dora' ? '<small>' + esc(EN ? info.en : info.ja) + '</small>' : '') + '</span><span>' + (big ? esc(L('役満', 'Yakuman')) : y.han + L('翻', ' han')) + '</span></div>';
  }
  h += '</div>';
  const lim = limitName(w.limit);
  h += '<div class="total">' + (w.yakuman ? esc(L('役満', 'Yakuman') + (w.yakuman > 1 ? ' x' + w.yakuman : '')) : esc(w.han + L('翻 ', ' han ') + w.fu + L('符', ' fu'))) + (lim && !w.yakuman ? ' · ' + esc(lim) : '') + '<small>' + esc(fmtN(w.total + (w.sticks ? w.sticks * 1000 : 0)) + L('点', ' pts')) + (w.honba ? esc(L('（' + w.honba + '本場を含む）', ' (incl. ' + w.honba + ' honba)')) : '') + (w.sticks ? esc(L(' ＋供託' + w.sticks + '本', ' + ' + w.sticks + ' riichi stick(s)')) : '') + '</small></div>';
  if (!w.yakuman) h += '<details' + (G.mini ? ' open' : '') + '><summary style="cursor:pointer;font-size:12px;font-weight:800;color:var(--kb-dim);padding:4px 0">' + esc(L('符の計算', 'How the fu add up')) + ' (' + w.fu + L('符', ' fu') + ')</summary>' + fuLines(w) + '</details>';
  if (G.mini) h += miniExplain(w, res);
  return h;
}
function miniExplain(w, res) {
  const ids = w.yaku.map(y => y.id).filter(i => i !== 'dora');
  let h = '<div class="tip"><b>' + esc(L('この手のポイント', 'Why this wins')) + '</b><br>';
  h += esc(L('4つの組＋頭がそろいました。', 'Four sets plus a pair — complete.')) + '<br>';
  for (const id of ids.slice(0, 4)) { const i = TX.BY[id]; if (i) h += '・<b>' + esc(yShort(id)) + '</b>：' + esc(EN ? i.en : i.ja) + '<br>'; }
  if (w.yaku.some(y => y.id === 'dora')) h += '・<b>' + esc(L('ドラ', 'Dora')) + '</b>：' + esc(L('持っているだけで翻がふえる牌です。', 'Bonus tiles add han just for holding them.')) + '<br>';
  h += esc(L('点数は「翻」と「符」で決まります。翻が多いほど高い点になります。', 'Points depend on han and fu — more han means a much bigger win.')) + '</div>';
  return h;
}
function deltaHTML(res) {
  let h = '<div class="delta">';
  for (let r = 0; r < 4; r++) { const s = (G.me + r) % 4, d = res.delta[s]; h += '<div class="' + (d > 0 ? 'up' : d < 0 ? 'dn' : '') + '">' + esc(seatName(s)) + '<b>' + (d > 0 ? '+' : '') + fmtN(d) + '</b>' + fmtN(G.st.scores[s]) + '</div>'; }
  return h + '</div>';
}
function drawHTML(res) {
  const st = G.st; let h = '<p class="lead" style="font-weight:800;color:var(--kb-ink)">' + esc(EN ? E.reasonText(res.why)[1] : E.reasonText(res.why)[0]) + '</p>';
  if (res.why === 'exhaust') {
    for (let r = 0; r < 4; r++) {
      const s = (G.me + r) % 4;
      h += '<div style="margin:4px 0"><b style="font-size:12.5px">' + esc(seatName(s)) + '</b> <span class="why" style="font-size:12px;color:var(--kb-dim)">' + (res.nagashi && res.nagashi.indexOf(s) >= 0 ? esc(L('流し満貫！', 'Nagashi mangan!')) : res.tenpai[s] ? esc(L('テンパイ', 'Tenpai')) : esc(L('ノーテン', 'Noten'))) + '</span>';
      if (res.tenpai[s]) h += '<div class="hand-show">' + res.hands[s].map(x => tileHTML(x)).join('') + (res.melds[s] || []).map(m => meldHTML(m, s)).join('') + '</div>';
      h += '</div>';
    }
  }
  return h;
}
function showRoundResult() {
  if (!G || G.over || G.st.phase !== 'end') return;
  const st = G.st, res = st.result;
  clearTimeout(G.timer);
  if (G.shownRound === G.st.roundNo + ':' + G.cur.acts.length) return;
  G.shownRound = G.st.roundNo + ':' + G.cur.acts.length;
  G.cur.result = { type: res.type, why: res.why, winners: (res.winners || []).map(w => ({ seat: w.seat, han: w.han, fu: w.fu, total: w.total })), delta: res.delta };
  recordRound(res);
  let html = '';
  const mine = res.type !== 'draw' && res.winners.some(w => w.seat === G.me);
  let title;
  if (res.type === 'draw') title = EN ? E.reasonText(res.why)[1] : E.reasonText(res.why)[0];
  else title = mine ? L('あがり！おめでとう', 'You win!') : res.winners.some(w => true) ? (res.type === 'ron' && res.from === G.me ? L('放銃…', 'You dealt in...') : L(seatName(res.winners[0].seat) + 'のあがり', seatName(res.winners[0].seat) + ' wins')) : '';
  if (res.type === 'draw') html += drawHTML(res); else res.winners.forEach((w, i) => { html += winnerHTML(w, res, i); });
  html += deltaHTML(res);
  if (G.tut) html += '<div class="tip"><b>' + esc(L('チュートリアル完了！', 'Tutorial complete!')) + '</b> ' + esc(L('これが麻雀の基本の流れです。次は「入門」でCPUと1局やってみよう。', 'That is the basic flow. Next, try a beginner mini game against the CPUs.')) + '</div>';
  $('rTitle').textContent = title; $('rBody').innerHTML = html; $('rBody').scrollTop = 0;
  const b = $('rBtns'); b.innerHTML = '';
  const add = (id, label, cls) => { const e = document.createElement('button'); e.type = 'button'; e.className = 'btn ' + (cls || ''); e.id = id; e.textContent = label; b.appendChild(e); return e; };
  if (G.tut) {
    add('rMini', L('入門で1局あそぶ', 'Play a beginner game')).onclick = () => { hideOverlays(); store.set(HOWTO_KEY, '1'); save.tut = 1; writeSave(); bump('tutDone'); writeSave(); newGame({ mode: 'mini', level: 1 }); };
    add('rTitleBtn', L('タイトルへ', 'Title'), 'sub').onclick = () => { save.tut = 1; bump('tutDone'); writeSave(); showTitle(); };
  } else if (G.mini) {
    add('rAgain', L('もう1局', 'Play again')).onclick = () => { hideOverlays(); newGame({ mode: 'mini', level: G.levels[1] }); };
    const row = document.createElement('div'); row.className = 'row2'; b.appendChild(row);
    const k = document.createElement('button'); k.className = 'btn sub'; k.type = 'button'; k.textContent = L('牌譜', 'Replay'); k.onclick = () => showKifu(); row.appendChild(k);
    const t = document.createElement('button'); t.className = 'btn sub'; t.type = 'button'; t.textContent = L('タイトルへ', 'Title'); t.onclick = () => { finishMini(); showTitle(); }; row.appendChild(t);
    finishMini(true);
  } else {
    const next = add('rNext', L('つぎへ', 'Next'));
    next.onclick = () => nextHand();
    const row = document.createElement('div'); row.className = 'row2'; b.appendChild(row);
    const k = document.createElement('button'); k.className = 'btn sub'; k.type = 'button'; k.textContent = L('棋譜', 'Kifu'); k.onclick = () => showKifu(); row.appendChild(k);
    const t = document.createElement('button'); t.className = 'btn sub'; t.type = 'button'; t.textContent = L('タイトルへ', 'Title'); t.onclick = () => { showTitle(); }; row.appendChild(t);
  }
  hideOverlays(); $('ovResult').hidden = false;
  try { (b.querySelector('.btn') || $('ovResult')).focus({ preventScroll: true }); } catch (e) {}
}
let miniDone = false;
function finishMini(done) {
  if (!G || !G.mini || G.practice || miniDone === G.cur) return;
  miniDone = G.cur;
  const g = save.g.mini = save.g.mini || { p: 0, w: 0, r1: 0, r2: 0, r3: 0, r4: 0, b: 0 };
  g.p++; if (G.st.result && G.st.result.type !== 'draw' && G.st.result.winners.some(w => w.seat === G.me)) g.w++;
  bump('games'); writeSave();
  emit('play_end', { mode: 'solo', score: 0, durationMs: Date.now() - G.t0, reason: 'clear' });
  store.del(RUN_KEY);
}
function nextHand() {
  hideOverlays();
  if (!E.nextRound(G.st)) return;
  if (G.st.over) { showFinal(); return; }
  G.cur = { info: E.roundInfo(G.st), acts: [] }; G.kifu.push(G.cur);
  G.sel = null; G.riichiMode = false; G.lastD = null; G.hist = []; G.shownRound = null; G.pickHTML = '';
  persist(); render(); loop();
}
function showFinal() {
  const st = G.st, fin = st.final;
  G.over = true; clearTimeout(G.timer);
  recordGame(fin);
  const me = G.me, rank = fin.rank[me];
  const newBest = !G.practice && !G.mini && Math.round(st.scores[me]) >= save.best && Math.round(st.scores[me]) > 0 && rank === 1;
  store.del(RUN_KEY);
  emit('play_end', { mode: 'solo', score: G.practice ? 0 : Math.max(0, Math.round(st.scores[me])), durationMs: Date.now() - G.t0, reason: rank === 1 ? 'clear' : 'over' });
  sfx(rank === 1 ? 'win' : 'over');
  $('rTitle').textContent = rank === 1 ? L('1位！おめでとう', '1st place!') : L(rank + '位', 'Place ' + rank);
  let h = '<p>' + esc(G.title) + (G.practice ? ' · ' + esc(L('れんしゅう', 'Practice')) : '') + '</p><ol class="rank">';
  fin.order.forEach((s, i) => { h += '<li class="' + (s === me ? 'me' : '') + '"><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(seatName(s)) + '</span><span class="sc2">' + fmtN(st.scores[s]) + '<br>' + (fin.pts[s] > 0 ? '+' : '') + fin.pts[s].toFixed(1) + ' pt</span></li>'; });
  h += '</ol><p>' + esc(L('「pt」はウマ・オカをふくめたゲーム内の成績です（賭けではありません）', '"pt" includes uma/oka as an in-game score only — no betting.')) + '</p>';
  if (newBest) h += '<div class="newrec">' + esc(L('最高スコア更新！', 'New best score!')) + '</div>';
  $('rBody').innerHTML = h;
  const b = $('rBtns'); b.innerHTML = '';
  const add = (label, cls, fn) => { const e = document.createElement('button'); e.type = 'button'; e.className = 'btn ' + (cls || ''); e.textContent = label; e.onclick = fn; b.appendChild(e); return e; };
  add(L('もう一度', 'Play again'), '', () => { hideOverlays(); newGame({ mode: G.mode, level: G.levels[1], practice: G.practice }); }).id = 'rAgain';
  const row = document.createElement('div'); row.className = 'row2'; b.appendChild(row);
  const k = document.createElement('button'); k.className = 'btn sub'; k.type = 'button'; k.textContent = L('棋譜', 'Kifu'); k.onclick = () => showKifu(); row.appendChild(k);
  const t = document.createElement('button'); t.className = 'btn sub'; t.type = 'button'; t.id = 'rTitleBtn'; t.textContent = L('タイトルへ', 'Title'); t.onclick = () => showTitle(); row.appendChild(t);
  hideOverlays(); $('ovResult').hidden = false;
  render();
}

// ---------------------------------------------------------------- チュートリアル
const TUT_SPEC = { hands: ['234m567p345s68m69p', '147m258p369s1234z', '258m369p147s1234z', '369m147p258s1234z'], draws: '6p5z6z7z2z5z6z7z7m', dora: '1m', ura: '4s' };
function tutBefore() {
  const st = G.st, t = G.tut;
  if (st.phase !== 'discard' || st.turn !== G.me) return;
  const n = st.rivers[G.me].length;
  G.coachTile = null; G.coachBtn = null; G.coachMsg = ''; G.coachOk = false;
  const b = s => '<b>' + esc(s) + '</b>';
  if (!st.riichi[G.me]) {
    if (n === 0) {
      if (t.intro === 0) { G.coachMsg = b(L('麻雀へようこそ！', 'Welcome to mahjong!')) + ' ' + esc(L('14枚の牌を「3枚の組」4つと「同じ牌2枚（頭）」にそろえるとあがりです。', 'Arrange 14 tiles into four sets of three plus a pair to win.')); G.coachOk = true; }
      else if (t.intro === 1) { G.coachMsg = esc(L('下が あなたの手牌。右はしにはなれているのが、いまひいた牌です。数字がつながる3枚（順子）や、同じ牌3枚（刻子）が「組」です。', 'Your hand is below; the separated tile on the right is the one you just drew. Three in a row (sequence) or three of a kind (triplet) make a set.')); G.coachOk = true; }
      else {
        const p9 = st.hands[G.me].find(x => (x >> 2) === E.parseKinds('9p')[0]);
        G.coachTile = p9; G.coachMsg = esc(L('6筒が2枚そろって「頭」ができました。いらない牌は9筒。', 'The two 6-dots make your pair. The 9-dots is the one you do not need.')) + ' ' + b(L('9筒をタップして選び、もう一度タップして捨てよう', 'Tap the 9-dots to select it, then tap again to discard.'));
      }
    } else if (!G.riichiMode) {
      G.coachBtn = 'riichi'; G.coachMsg = b(L('テンパイ！', 'Tenpai!')) + ' ' + esc(L('あと1枚、7萬が来ればあがりです（待ち牌）。鳴かずにテンパイしたので「リーチ」ができます。リーチボタンを押そう。', 'One more tile — the 7-characters — wins. Your hand is closed, so you can declare Riichi. Press the Riichi button.'));
    } else {
      G.coachTile = st.drawn; G.coachMsg = esc(L('リーチをかけたら、ひいた牌をそのまま切ります。', 'After riichi you just discard what you draw.')) + ' ' + b(L('光っている牌を捨てよう', 'Discard the highlighted tile.'));
    }
  } else {
    G.coachBtn = 'tsumo';
    G.coachMsg = b(L('7萬が来た！', 'The 7-characters!')) + ' ' + esc(L('「ツモ」を押してあがろう。', 'Press Tsumo to win.'));
  }
}
function tutAfter() { G.coachMsg = ''; G.coachOk = false; G.coachTile = null; G.coachBtn = null; }
function tutAfterToggle() { tutBefore(); }
function tutAllow(kind, p) {
  const st = G.st, t = G.tut; if (!t) return true;
  const n = st.rivers[G.me].length;
  if (!st.riichi[G.me]) {
    if (n === 0) { if (t.intro < 2) return false; return kind === 'discard' && (p >> 2) === E.parseKinds('9p')[0]; }
    if (!G.riichiMode) return kind === 'btn' && p === 'riichi';
    return (kind === 'discard' && p === st.drawn) || (kind === 'btn' && p === 'riichi');
  }
  return kind === 'btn' && p === 'tsumo';
}
$('hint').addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-coach]'); if (!b || !G || !G.tut) return;
  G.tut.intro++; sfx('select'); tutBefore(); render();
});

// ---------------------------------------------------------------- 棋譜・再生
function actText(st, seat, a) {
  const nm = seatName(seat);
  switch (a.t) {
    case 'discard': return nm + ' ' + L('切', 'discard') + ' ' + kn(a.tile >> 2, E.isRed(a.tile)) + (a.riichi ? L('（リーチ）', ' (riichi)') : '');
    case 'tsumo': return nm + ' ' + L('ツモ', 'Tsumo');
    case 'ron': return nm + ' ' + L('ロン', 'Ron');
    case 'pon': return nm + ' ' + L('ポン', 'Pon');
    case 'chii': return nm + ' ' + L('チー', 'Chii');
    case 'daiminkan': return nm + ' ' + L('大明槓', 'Daiminkan');
    case 'ankan': return nm + ' ' + L('暗槓', 'Ankan') + ' ' + kn(a.kind);
    case 'kakan': return nm + ' ' + L('加槓', 'Kakan');
    case 'kyuushu': return nm + ' ' + L('九種九牌', 'Kyuushu');
    case 'pass': return null;
    default: return nm + ' ' + a.t;
  }
}
function kifuLines(rr) {
  const st = E.restoreRound(rr.info), out = [];
  for (const [s, a] of rr.acts) {
    const tx = actText(st, s, a); if (tx) out.push(tx);
    E.apply(st, s, a);
  }
  return out;
}
function showKifu() {
  if (!G) return;
  const rounds = G.kifu.filter(r => r.acts && r.acts.length);
  let h = '<p>' + esc(L('各局の棋譜です。「再生」で盤面を1手ずつ見られます（あなたの手牌だけ見えます）。', 'Each hand is logged. "Replay" steps through the board one move at a time (only your tiles are shown).')) + '</p>';
  rounds.forEach((r, i) => {
    const info = r.info, nm = info.cfg.mode === 'mini' ? L('入門', 'Mini') : (EN ? WIND_EN[info.roundWind] + ' ' + (info.kyoku + 1) : WINDS[info.roundWind] + (info.kyoku + 1) + '局');
    const res = r.result ? (r.result.type === 'draw' ? (EN ? E.reasonText(r.result.why)[1] : E.reasonText(r.result.why)[0]) : (r.result.type === 'tsumo' ? L('ツモ', 'Tsumo') : L('ロン', 'Ron')) + ' ' + seatName(r.result.winners[0].seat)) : L('（途中）', '(unfinished)');
    h += '<details class="kfd"' + (i === rounds.length - 1 ? ' open' : '') + '><summary style="cursor:pointer;font-weight:800;font-size:13px;padding:6px 0">' + esc(nm + ' ' + info.honba + L('本場', ' honba') + ' — ' + res) + '</summary><div class="kf">' + kifuLines(r).map((x, j) => '<div>' + (j + 1) + '. ' + esc(x) + '</div>').join('') + '</div><button type="button" class="btn sub" data-replay="' + G.kifu.indexOf(r) + '">' + esc(L('盤面で再生', 'Replay on the board')) + '</button></details>';
  });
  if (!rounds.length) h += '<p>' + esc(L('まだ手がありません。', 'Nothing yet.')) + '</p>';
  showInfo(L('棋譜', 'Kifu (game record)'), h, true);
  $('iBody').querySelectorAll('[data-replay]').forEach(b => b.addEventListener('click', () => startReplay(+b.dataset.replay)));
}
function startReplay(idx) {
  const rr = G.kifu[idx]; if (!rr) return;
  const G0 = G;
  const st = E.restoreRound(rr.info);
  G = Object.assign({}, G0, { st, view: true, replay: { idx, n: 0, acts: rr.acts, info: rr.info, G0 }, over: false, menu: false, timer: null, sel: null, hint: null, pickHTML: '', coachMsg: '', lastD: null, mini: false });
  hideOverlays(); render();
}
function replayTo(n) {
  const R = G.replay; n = clamp(n, 0, R.acts.length);
  const st = E.restoreRound(R.info);
  for (let i = 0; i < n; i++) E.apply(st, R.acts[i][0], R.acts[i][1]);
  G.st = st; R.n = n; G.lastD = null;
  const last = st.lastDiscard; if (last && n > 0) G.lastD = { s: last.seat, i: last.idx };
  render();
}
function exitReplay() { const G0 = G.replay.G0; G = G0; render(); showKifu(); loop(); }

// ---------------------------------------------------------------- 画面：ルール・役一覧・記録
function showInfo(title, html, keepOverlays) {
  $('iTitle').textContent = title; $('iBody').innerHTML = html; $('iBody').scrollTop = 0;
  const from = !$('ovTitle').hidden ? 'title' : !$('ovResult').hidden ? 'result' : 'game';
  $('ovInfo').dataset.from = from; $('iClose').textContent = L('とじる', 'Close');
  if (G && !G.view) G.menu = true;
  if (!keepOverlays) hideOverlays(); else { $('ovTitle').hidden = true; $('ovResult').hidden = true; }
  $('ovInfo').hidden = false; try { $('iClose').focus({ preventScroll: true }); } catch (e) {}
}
$('iClose').addEventListener('click', () => {
  const from = $('ovInfo').dataset.from; $('ovInfo').hidden = true;
  if (G && !G.view) G.menu = false;
  if (from === 'title') showTitle(); else if (from === 'result' && G && (G.st.phase === 'end' || G.over)) { $('ovResult').hidden = false; } else if (G) { render(); loop(); }
});
function yakuListHTML(onlyMini) {
  let h = '';
  const rows = TX.YAKU.filter(r => !onlyMini || r[5]);
  for (const r of rows) {
    const id = r[0], y = E.YAKU[id];
    const han = r[1] >= 13 ? L('役満', 'Yakuman') : r[1] + L('翻', ' han') + (r[2] == null ? L('（門前のみ）', ' (closed only)') : r[2] !== r[1] ? ' / ' + r[2] + L('翻（鳴き）', ' open') : '');
    h += '<div class="yk"><b>' + esc(EN ? y.en + ' ' + y.ja : y.ja) + '</b><em>' + esc(han) + '</em><span>' + esc(EN ? r[4] : r[3]) + '</span></div>';
  }
  return h;
}
function scoreTableHTML() {
  const fus = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110], hans = [1, 2, 3, 4];
  let h = '<h3>' + esc(L('子のロン あがりの点数', 'Non-dealer ron payments')) + '</h3><table><tr><th>' + esc(L('符＼翻', 'fu\\han')) + '</th>' + hans.map(x => '<th>' + x + '</th>').join('') + '</tr>';
  for (const f of fus) h += '<tr><th>' + f + '</th>' + hans.map(x => '<td>' + ((f === 20 && x === 1) || (f === 25 && x === 1) ? '-' : fmtN(E.points(x, f, 0, false, {}).ron)) + '</td>').join('') + '</tr>';
  h += '</table><p>' + esc(L('5翻以上：満貫 8000／跳満(6-7) 12000／倍満(8-10) 16000／三倍満(11-12) 24000／役満 32000（親は1.5倍）', '5+ han: mangan 8000 / haneman (6-7) 12000 / baiman (8-10) 16000 / sanbaiman (11-12) 24000 / yakuman 32000 (dealer x1.5)')) + '</p>';
  return h;
}
function rulesHTML() {
  return (EN ? TX.BASICS.en : TX.BASICS.ja) + '<h3>' + esc(L('役の一覧', 'Yaku list')) + '</h3>' + yakuListHTML(false) + scoreTableHTML() + (EN ? TX.FULL.en : TX.FULL.ja) + '<h3>' + esc(L('操作', 'Controls')) + '</h3><ul><li>' + esc(L('牌をタップで選び、もう一度タップで捨てます。', 'Tap a tile to select it, tap again to discard.')) + '</li><li>' + esc(L('キーボード：← → で選ぶ／Enter で切る／T ツモ・ロン／R リーチ／P ポン／C チー／K カン／N パス／H ヒント／U もどす（れんしゅう）', 'Keyboard: arrows select, Enter discards, T tsumo/ron, R riichi, P pon, C chii, K kan, N pass, H hint, U undo (practice).')) + '</li></ul>';
}
function showRules() { showInfo(L('ルール・役一覧', 'Rules and yaku'), rulesHTML()); }
function recordsHTML() {
  const s = save.stats, ms = [['mini', L('入門（ミニ麻雀）', 'Beginner mini')], ['east', L('東風戦', 'East game')], ['hanchan', L('東南戦', 'Hanchan')]];
  let h = '<h3>' + esc(L('対局の成績', 'Game results')) + '</h3><table><tr><th></th><th>' + esc(L('回', 'Played')) + '</th><th>1</th><th>2</th><th>3</th><th>4</th><th>' + esc(L('最高', 'Best')) + '</th></tr>';
  for (const [k, n] of ms) { const g = save.g[k]; h += '<tr><th style="text-align:left">' + esc(n) + '</th>' + (g ? '<td>' + g.p + '</td>' + [g.r1, g.r2, g.r3, g.r4].map(x => '<td>' + x + '</td>').join('') + '<td>' + (k === 'mini' ? '-' : fmtN(g.b)) + '</td>' : '<td colspan="6">-</td>') + '</tr>'; }
  h += '</table><h3>' + esc(L('あがり・できごと', 'Wins and events')) + '</h3><table>';
  const rows = [['hands', L('局数', 'Hands played')], ['agari', L('あがり', 'Wins')], ['tsumo', L('ツモ', 'Tsumo')], ['ron', L('ロン', 'Ron')], ['deal', L('放銃', 'Dealt in')], ['riichiWin', L('リーチであがり', 'Riichi wins')], ['mangan+', L('満貫以上', 'Mangan or better')], ['yakuman', L('役満', 'Yakuman')], ['calls', L('鳴き', 'Calls')], ['kan', L('カン', 'Kans')], ['tenpaiDraw', L('流局でテンパイ', 'Tenpai at draw')], ['hints', L('ヒントを見た回数', 'Hints used')], ['undos', L('もどす', 'Undos')], ['maxHan', L('最高の翻', 'Highest han')]];
  for (const [k, n] of rows) h += '<tr><th style="text-align:left">' + esc(n) + '</th><td>' + fmtN(s[k] || 0) + '</td></tr>';
  h += '</table><h3>' + esc(L('そろえた役', 'Yaku made')) + '</h3>';
  const ys = Object.keys(save.y).sort((a, b) => save.y[b] - save.y[a]);
  h += ys.length ? ys.map(id => '<div class="yk"><b>' + esc(yShort(id)) + '</b><em>' + save.y[id] + '</em></div>').join('') : '<p>' + esc(L('まだありません', 'None yet')) + '</p>';
  return h;
}

// ---------------------------------------------------------------- タイトル・設定
function segHTML(id, val, opts) { return '<div class="seg" role="group" data-seg="' + id + '">' + opts.map(o => '<button type="button" class="opt" data-v="' + o[0] + '" aria-pressed="' + (String(o[0]) === String(val)) + '">' + esc(o[1]) + (o[2] ? '<small>' + esc(o[2]) + '</small>' : '') + '</button>').join('') + '</div>'; }
function togHTML(id, on, label, sub) { return '<button type="button" class="tog" role="switch" data-tog="' + id + '" aria-checked="' + !!on + '"><span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><i aria-hidden="true"></i></button>'; }
function showTitle() {
  hideOverlays();
  if (G && !G.view) { clearTimeout(G.timer); G.menu = true; persist(); }
  const s = save.set, run = readRun();
  let h = '';
  h += '<button class="qm" id="tMini" type="button"><span><b>' + esc(L('麻雀入門', 'Beginner mahjong')) + '</b><small>' + esc(L('ミニ麻雀：1局・かんたんな役だけ・ヒントとシャンテン表示つき', 'Mini mahjong: one hand, simple yaku, hints and shanten display')) + '</small></span><span class="go" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></button>';
  h += '<button class="qm" id="tFull" type="button"><span><b>' + esc(L('本格麻雀', 'Full mahjong')) + '</b><small id="tFullSub">' + esc(s.mode === 'east' ? L('東風戦（東1〜4局）・全役・鳴き・カン', 'East game (E1-E4) · all yaku, calls and kans') : L('東南戦（8局＋）・全役・鳴き・カン', 'Hanchan (8+ hands) · all yaku, calls and kans')) + '</small></span><span class="go" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></button>';
  if (window.KoboTurnRoom && window.MahjongOnline) h += '<button class="qm b2" id="tOnline" type="button"><span><b>' + esc(L('オンライン対戦', 'Online match')) + '</b><small>' + esc(L('4人（足りない席はCPU）・記録のみ（ランキングなし）', '4 seats (CPUs fill empty seats) · stats only, no ranking')) + '</small></span></button>';
  if (run) h += '<button class="qm b2" id="tResume" type="button"><span><b>' + esc(L('つづきから', 'Resume')) + '</b><small>' + esc((run.mode === 'mini' ? L('入門', 'Beginner') : run.mode === 'east' ? L('東風戦', 'East game') : L('東南戦', 'Hanchan')) + ' · ' + roundName(run.st)) + '</small></span></button>';
  h += '<div class="og"><div class="ol">' + esc(L('CPUの強さ', 'CPU level')) + '</div>' + segHTML('lv', s.lv, [[1, L('よわい', 'Easy'), L('はじめて', 'new')], [2, L('ふつう', 'Normal')], [3, L('つよい', 'Hard'), L('守りも攻めも', 'pushes and folds')]]) + '</div>';
  h += '<div class="og"><div class="ol">' + esc(L('本格麻雀の長さ', 'Game length')) + '</div>' + segHTML('mode', s.mode, [['east', L('東風戦', 'East'), L('東1〜4局', '4 hands')], ['hanchan', L('東南戦', 'Hanchan'), L('8局〜', '8+ hands')]]) + '</div>';
  h += '<div class="row2" style="margin-top:6px"><button class="btn sub" id="tPrac" type="button">' + esc(L('れんしゅう', 'Practice')) + '<small style="font-weight:500;font-size:10px"> ' + esc(L('ヒント・もどす', 'hints, undo')) + '</small></button><button class="btn sub" id="tTut" type="button">' + esc(L('チュートリアル', 'Tutorial')) + '</button></div>';
  h += '<div class="row2"><button class="btn sub" id="tRules" type="button">' + esc(L('ルール・役一覧', 'Rules & yaku')) + '</button><button class="btn sub" id="tRec" type="button">' + esc(L('記録', 'Records')) + '</button></div>';
  h += '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:800;font-size:13px;padding:8px 2px">' + esc(L('せってい・ルール', 'Settings and rule options')) + '</summary>';
  h += togHTML('hint', s.hint, L('ヒントを自動で出す', 'Show hints automatically'), L('入門・れんしゅうで、切る牌のおすすめと理由', 'Discard advice with reasons (beginner and practice)'));
  h += togHTML('shanten', s.shanten, L('シャンテンと受け入れを出す', 'Show shanten and useful tiles'), L('テンパイまでの歩数と、進む牌', 'Steps to tenpai and tiles that help'));
  h += togHTML('onetap', s.onetap, L('1回のタップで捨てる', 'Discard with one tap'), L('ふだんは「選んで、もう一度タップ」', 'Normally tap to select, tap again to discard'));
  h += togHTML('fast', s.fast, L('CPUをはやくする', 'Faster CPUs'));
  h += '<div class="og"><div class="ol">' + esc(L('本格麻雀のルール', 'Rules for the full game')) + '</div></div>';
  h += togHTML('aka', s.aka, L('赤ドラ', 'Red fives'), L('赤い五が各色1枚。1翻', 'One red five per suit, +1 han'));
  h += togHTML('ura', s.ura, L('裏ドラ', 'Ura dora'));
  h += togHTML('ippatsu', s.ippatsu, L('一発', 'Ippatsu'));
  h += togHTML('kuitan', s.kuitan, L('喰いタン', 'Open tanyao'), L('鳴いてもタンヤオ', 'Tanyao counts after calls'));
  h += togHTML('tobi', s.tobi, L('トビ（0点未満で終了）', 'Tobi (game ends below 0)'));
  h += togHTML('west', s.west, L('西入（東南戦で30000点に届かないとき）', 'West extension (hanchan, nobody at 30000)'));
  h += togHTML('oka', s.oka, L('オカ（25000点持ち・30000点返し）', 'Oka (25000 start, 30000 return)'));
  h += '<div class="og"><div class="ol">' + esc(L('ウマ', 'Uma')) + '</div>' + segHTML('uma', s.uma, [['10-20', '10-20'], ['5-10', '5-10'], ['none', L('なし', 'None')]]) + '</div>';
  h += '</details><div class="langrow"><span>' + esc(L('言語 / Language', 'Language / 言語')) + '</span><span id="langSlot"></span></div>';
  $('tBody').innerHTML = h;
  $('tHome').textContent = L('ゲーム一覧へ', 'Back to games');
  try { KoboI18n.picker($('langSlot')); } catch (e) {}
  const w = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
  w('tMini', () => { hideOverlays(); if (G) G.menu = false; newGame({ mode: 'mini', level: s.lv }); });
  w('tFull', () => { hideOverlays(); newGame({ mode: s.mode, level: s.lv }); });
  w('tPrac', () => { hideOverlays(); newGame({ mode: s.mode, level: s.lv, practice: true, hint: s.hint }); });
  w('tTut', () => { hideOverlays(); startTutorial(); });
  w('tRules', () => showRules()); w('tRec', () => showInfo(L('記録', 'Records'), recordsHTML()));
  w('tResume', () => { resumeGame(); });
  w('tOnline', () => openOnline());
  $('tBody').querySelectorAll('[data-seg]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('.opt'); if (!b) return; const id = g.dataset.seg; const v = b.dataset.v;
    save.set[id] = (id === 'lv') ? +v : v; writeSave(); sfx('select'); showTitle();
  }));
  $('tBody').querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.tog; save.set[id] = save.set[id] ? 0 : 1; writeSave(); sfx('select'); b.setAttribute('aria-checked', String(!!save.set[id])); }));
  $('ovTitle').hidden = false;
  if (G) { render(); }
  else { renderIdle(); }
  try { $('tMini').focus({ preventScroll: true }); } catch (e) {}
}
function renderIdle() {
  // ゲームが始まる前の卓（空の卓）
  const st = E.create({ seed: 1 });
  G = { st, me: 0, view: true, idle: true, names: NAMES.slice(), mode: 'east', levels: [0, 2, 2, 2], hist: [], kifu: [], over: false, menu: true, rec: {} };
  G.st.hands = [[], [], [], []]; G.st.drawn = -1; G.st.rivers = [[], [], [], []];
  render();
}
function startTutorial() {
  const wall = E.rigWall(TUT_SPEC);
  newGame({ mode: 'east', tutorial: true, dummy: true, wall, practice: true, level: 1, cfg: { aka: false, tobi: false }, hint: 0, shanten: 1 });
  G.hintOn = false;
}

// ---------------------------------------------------------------- メニュー・音・テーマ
function renderSound() {
  const b = $('sndBtn'), muted = A ? A.muted : true;
  b.setAttribute('aria-pressed', String(!muted)); b.setAttribute('aria-label', T(muted ? 'サウンド オフ' : 'サウンド オン'));
  b.innerHTML = !muted
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  if (!A) b.hidden = true;
}
KoboI18n.add({ en: { 'サウンド オフ': 'Sound off', 'サウンド オン': 'Sound on' } });
$('sndBtn').addEventListener('click', () => { if (!A) return; A.toggleMute(); if (!A.muted) sfx('ok'); });
if (A) A.onChange(renderSound);
function themeColor() {
  const m = document.querySelector('meta[name="theme-color"]'); if (!m) return;
  m.setAttribute('content', UI && UI.theme && UI.theme.resolved() === 'light' ? '#eaf2ee' : '#10382c');
}
if (UI && UI.theme) UI.theme.onChange(() => setTimeout(() => { themeColor(); }, 0));
let pm = null;
function giveUp() { if (G && !G.net && !G.over && !G.idle) { emit('play_end', { mode: 'solo', score: 0, durationMs: Date.now() - G.t0, reason: 'quit' }); store.del(RUN_KEY); G.over = true; } }
function openMenu() {
  if (!UI) { showTitle(); return; }
  if (pm && pm.isOpen) return;
  const on = !!(G && !G.over && !G.idle && !G.view);
  const extra = [{ label: L('ルール・役一覧', 'Rules & yaku'), icon: 'help', onClick: () => { pm.close(); showRules(); } }];
  if (on) {
    extra.push({ label: L('棋譜', 'Kifu'), icon: 'menu', onClick: () => { pm.close(); showKifu(); } });
    extra.push({ label: G.hintOn ? L('ヒントを消す', 'Hints off') : L('ヒントを出す', 'Hints on'), icon: 'star', onClick: () => { pm.close(); G.hintOn = !G.hintOn; if (G.hintOn) bump('hints'); render(); } });
    extra.push({ label: G.net ? L('試合を出る', 'Leave the match') : L('あきらめる', 'Give up'), icon: 'close', onClick: () => { pm.close(); if (G.net) askLeaveOnline(); else { giveUp(); showTitle(); } } });
  }
  if (!(on && G.net)) extra.push({ label: L('タイトルへ', 'Title'), icon: 'menu', onClick: () => { pm.close(); showTitle(); } });
  pm = UI.pauseMenu({
    title: T(on ? 'ひとやすみ' : 'メニュー'), home: '../', extra,
    onResume: () => { if (G && !G.view) G.menu = false; const g = KG(); if (g) g.menuClosed(); if (G && !G.over && !G.view) loop(); },
    onRestart: on && !G.net && !G.tutorial ? () => { const c = { mode: G.mode, level: G.levels[1], practice: G.practice }; giveUp(); newGame(c); } : undefined,
    onOpen: () => { if (G && !G.view) G.menu = true; const g = KG(); if (g) g.menuOpened(); persist(); },
  });
  pm.open();
}
KoboI18n.add({ en: { 'ひとやすみ': 'Paused', 'メニュー': 'Menu' } });
$('menuBtn').addEventListener('click', openMenu);
window.addEventListener('keydown', e => { if (e.key === 'm' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) { /* reserved */ } });
if (KG()) KG().register({
  id: GAME,
  pause() {}, resume() {},
  save() { persist(); },
  isIdle: () => !G || G.over || G.idle || G.view,
  dispose() { if (G) clearTimeout(G.timer); },
});
window.addEventListener('pagehide', () => { if (G) persist(); });
window.addEventListener('resize', () => { if (G) render(); });
window.addEventListener('orientationchange', () => setTimeout(() => G && render(), 200));
window.addEventListener('storage', e => { if (e.key === SAVE_KEY && (!G || G.over || G.idle)) { save = readSave(); renderInfo2(); } });
function renderInfo2() { if (!$('ovTitle').hidden) showTitle(); }

// ---------------------------------------------------------------- オンライン（common/turnroom.js ＋ online.js）
let TR = null, netCtx = null;
const CPU_NAMES = [L('モカ', 'Mocha'), L('ココ', 'Coco'), L('ハル', 'Haru'), L('ミント', 'Mint')];
function ensureTR() {
  if (window.MahjongOnline) window.MahjongOnline.getCfg = () => cfgFromSave(save.set.mode);
  if (TR || !window.KoboTurnRoom || !window.MahjongOnline) return TR;
  TR = KoboTurnRoom.create({
    game: GAME, host: MahjongOnline.host, turnSec: 30, seats: [4], seatsMax: 4, dealMs: 1500,
    cpuNames: k => CPU_NAMES[k % 4],
    getOpts: () => ({ n: 4 }), onOpts: () => {},
    getCpu: () => save.set.lv, cpuLabel: lv => LV_NAME[lv],
    onModel: onNetModel, onTick: onNetTick,
    onClose: () => showTitle(),
    onIdleClose: () => { if (G && G.net) { G.over = true; } hideOverlays(); showTitle(); },
  });
  return TR;
}
function openOnline() {
  if (!ensureTR()) { sfx('error'); return; }
  if (G && !G.net && !G.over && !G.idle) { persist(); }
  hideOverlays(); if (G) G.menu = true;
  TR.open({ n: 4 });
}
function leaveOnline() { if (TR) TR.leave(); if (G && G.net) { G.over = true; } showTitle(); }
async function askLeaveOnline() {
  const ok = UI ? await UI.confirm({ title: T('出ると、あなたの席はCPUに代わります。出ますか？'), ok: T('出る'), cancel: T('やめる'), danger: true }) : true;
  if (ok) leaveOnline(); else if (G) G.menu = false;
}
KoboI18n.add({ en: { '出ると、あなたの席はCPUに代わります。出ますか？': 'If you leave, a CPU takes your seat. Leave?', '出る': 'Leave', 'やめる': 'Cancel', '試合を出る': 'Leave the match' } });
function netSend(a) {
  if (!TR) return false;
  const w = MahjongOnline.toWire(a);
  if (!TR.submit(w)) { sfx('error'); return false; }
  G.netBusy = Date.now(); G.sel = null; G.riichiMode = false; G.pickHTML = '';
  setTimeout(() => { if (G && G.net && G.netBusy && Date.now() - G.netBusy >= 2400) { G.netBusy = 0; render(); } }, 2500);
  return true;
}
function onNetModel(m) {
  if (!ensureTR()) return;
  if (m.me < 0 || (m.replaced && (!G || !G.net))) {
    if (UI) UI.toast(m.me < 0 ? T('ゲームに入れませんでした') : T('席がCPUに交代しました'), { type: 'danger' });
    TR.leave(); showTitle(); return;
  }
  const v = MahjongOnline.view(m);
  const fresh = m.fresh || !G || !G.net || G.gn !== m.gn;
  if (fresh) {
    hideOverlays(); document.body.classList.remove('thumb');
    G = { st: v.st, me: m.me, net: true, gn: m.gn, mode: v.mode, mini: false, practice: false, names: m.names.slice(), sl: m.sl, levels: [2, 2, 2, 2], kifu: [], hist: [], sel: null, riichiMode: false, hintOn: false, showShanten: false, over: false, menu: false, t0: Date.now(), rec: {}, title: L('オンライン対戦', 'Online match'), netLegal: v.legal, netHintOk: false, shownRound: null };
    emit('play_start', { mode: 'versus' });
  } else {
    G.st = v.st; G.names = m.names.slice(); G.sl = m.sl; G.netLegal = v.legal; G.netBusy = 0; G.sel = null; if (!G.netLegal.some(a => a.t === 'discard' && a.riichi)) G.riichiMode = false; G.pickHTML = '';
  }
  G.model = m;
  if (m.replaced && !G.over) { G.over = true; if (UI) UI.toast(T('席がCPUに交代しました'), { type: 'danger' }); TR.leave(); showTitle(); return; }
  handleNetEvents(m, v);
  render();
  if (v.st.phase === 'end') { G.timer = setTimeout(showNetRound, 1000); }
  else if (G.netShown && v.st.phase !== 'end') { G.netShown = false; $('ovResult').hidden = true; }
  if (m.ph === 'over' && !G.over) showNetFinal(m);
}
function handleNetEvents(m, v) {
  for (const e of m.ev || []) {
    const s = e.s;
    switch (e.t) {
      case 'dc': G.lastD = { s, i: G.st.rivers[s].length - 1 }; sfx(s === G.me ? 'tap' : 'move'); if (e.d) { bubble(s, L('リーチ！', 'Riichi!'), true); sfx('coin'); } break;
      case 'po': bubble(s, L('ポン！', 'Pon!')); sfx('pop'); break;
      case 'ci': bubble(s, L('チー！', 'Chii!')); sfx('pop'); break;
      case 'dk': case 'ak': case 'kk': bubble(s, L('カン！', 'Kan!'), true); sfx('pop'); break;
      case 'ag': bubble(s, e.d ? L('ツモ！', 'Tsumo!') : L('ロン！', 'Ron!'), true); sfx(s === G.me ? 'win' : 'fail'); break;
      case 'dw': sfx('over'); break;
      default: break;
    }
  }
}
function onNetTick(m) {
  if (!G || !G.net || !m) return;
  const sec = Math.ceil(Math.max(0, m.dl ? m.left : 0) / 1000);
  if (G.tsec !== sec) { G.tsec = sec; const tm = $('status'); if (tm && isMyDecision()) tm.textContent = statusText() + (sec ? '  ⏱' + sec : ''); }
}
function showNetRound() {
  if (!G || !G.net || G.st.phase !== 'end' || G.netShown) return;
  const res = G.st.result; if (!res) return;
  G.netShown = true;
  let html = '';
  if (res.type === 'draw') html += drawHTML(res); else res.winners.forEach(w => { html += winnerHTML(w, res, 0); });
  html += deltaHTML(res);
  $('rTitle').textContent = res.type === 'draw' ? (EN ? E.reasonText(res.why)[1] : E.reasonText(res.why)[0]) : (res.winners.some(w => w.seat === G.me) ? L('あがり！', 'You win!') : res.type === 'ron' && res.from === G.me ? L('放銃…', 'You dealt in...') : L(seatName(res.winners[0].seat) + 'のあがり', seatName(res.winners[0].seat) + ' wins'));
  $('rBody').innerHTML = html; $('rBody').scrollTop = 0;
  const b = $('rBtns'); b.innerHTML = '';
  const nx = document.createElement('button'); nx.type = 'button'; nx.className = 'btn'; nx.id = 'rNext'; nx.textContent = L('つぎへ', 'Next');
  nx.onclick = () => { nx.disabled = true; nx.textContent = L('みんなを待っています…', 'Waiting for the others…'); netSend({ t: 'nx' }); };
  b.appendChild(nx);
  hideOverlays(); $('ovResult').hidden = false; try { nx.focus({ preventScroll: true }); } catch (e) {}
}
function showNetFinal(m) {
  G.over = true; clearTimeout(G.timer);
  const rs = m.rs || { r: [], w: -1, y: 'w' }, ranks = MahjongOnline.arr(rs.r), me = m.me >= 0 ? m.me : 0, st = G.st;
  const ok = rs.y === 'w', rank = ranks[me] || 1;
  if (ok) { bump('onl'); if (rank === 1) bump('onw'); bump('hands', G.rec.hands || 0); writeSave(); }
  emit('play_end', { mode: 'versus', score: 0, durationMs: Date.now() - G.t0, reason: rank === 1 && ok ? 'clear' : 'over' });
  sfx(ok && rank === 1 ? 'win' : 'over');
  const order = [0, 1, 2, 3].sort((a, b) => ranks[a] - ranks[b]);
  $('rTitle').textContent = !ok ? T('オンライン対戦が終わりました') : rank === 1 ? L('1位！おめでとう', '1st place!') : L(rank + '位', 'Place ' + rank);
  let h = '<p>' + esc(L('オンライン', 'Online') + ' · ' + L('4人', '4 players') + (m.replaced ? ' · ' + T('席がCPUに交代しました') : '')) + '</p><ol class="rank">';
  order.forEach((s, i) => { h += '<li class="' + (s === me ? 'me' : '') + '"><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(seatName(s)) + '</span><span class="sc2">' + fmtN(st.scores[s]) + '</span></li>'; });
  h += '</ol><p>' + esc(rs.y === 'hl' ? T('ホストが退出したので、ここで終了です') : rs.y === 'hg' ? T('ホストとの接続が切れたので、ここで終了です') : T('オンライン対戦は記録だけで、ランキングには入りません')) + '</p>';
  $('rBody').innerHTML = h;
  const b = $('rBtns'); b.innerHTML = '';
  const ag = document.createElement('button'); ag.type = 'button'; ag.className = 'btn'; ag.id = 'rAgain'; ag.textContent = T('もう一度'); ag.disabled = !ok || !!m.replaced;
  ag.onclick = () => { if (TR && TR.rematch()) { ag.disabled = true; ag.textContent = T('もう一度を待っています'); } };
  b.appendChild(ag);
  const t = document.createElement('button'); t.type = 'button'; t.className = 'btn sub'; t.id = 'rTitleBtn'; t.textContent = L('タイトルへ', 'Title'); t.onclick = () => { if (TR) TR.leave(); showTitle(); }; b.appendChild(t);
  hideOverlays(); $('ovResult').hidden = false;
}
KoboI18n.add({ en: { 'ゲームに入れませんでした': 'You could not join this game', '席がCPUに交代しました': 'Your seat was taken over by a CPU', 'オンライン対戦が終わりました': 'The online match is over', 'もう一度': 'Play again', 'もう一度を待っています': 'Waiting for a rematch',
  'ホストが退出したので、ここで終了です': 'The host left, so the match ends here', 'ホストとの接続が切れたので、ここで終了です': 'Lost the host, so the match ends here', 'オンライン対戦は記録だけで、ランキングには入りません': 'Online matches count for stats only, not the ranking' } });

// ---------------------------------------------------------------- 起動
renderSound(); themeColor(); measure();
$('iGame').textContent = L('麻雀工房', 'Mahjong Workshop'); $('iBest').textContent = L('最高 ', 'Best ') + fmtN(save.best);
{
  const first = store.get(HOWTO_KEY) == null && !save.tut;
  if (first) { store.set(HOWTO_KEY, '1'); showTitle(); showInfo(L('はじめに：麻雀のしくみ', 'Welcome: how mahjong works'), (EN ? TX.BASICS.en : TX.BASICS.ja) + '<p>' + esc(L('まずは「チュートリアル」か「麻雀入門」から。', 'Try the Tutorial or Beginner mahjong first.')) + '</p>', true); $('ovInfo').dataset.from = 'title'; }
  else showTitle();
}

// ---------------------------------------------------------------- テスト用（?debug のときだけ）
if (DEBUG) {
  const sel = a => (a.sel);
  const api = {
    ready: () => true,
    state: () => {
      const st = G && G.st;
      return {
        started: !!(G && !G.idle), mode: G ? G.mode : '', over: !!(G && G.over), practice: !!(G && G.practice), tutorial: !!(G && G.tutorial), net: !!(G && G.net), replay: !!(G && G.replay),
        phase: st ? st.phase : '', turn: st ? st.turn : -1, human: !!(G && isMyDecision()), callable: !!(G && !G.view && st && st.phase === 'call' && myLegal().length), title: !$('ovTitle').hidden, result: !$('ovResult').hidden, info: !$('ovInfo').hidden,
        hand: st && G ? st.hands[G.me].slice() : [], drawn: st ? st.drawn : -1, scores: st ? st.scores.slice() : [], riichi: st ? st.riichi.slice() : [], melds: st ? st.melds.map(m => m.length) : [],
        round: st ? roundName(st) : '', roundNo: st ? st.roundNo : 0, honba: st ? st.honba : 0, kyotaku: st ? st.kyotaku : 0, dealer: st ? st.dealer : 0, remaining: st && !G.net ? E.remaining(st) : 0,
        legal: G && !G.view ? myLegal().map(a => a.t + (a.riichi ? '+r' : '')) : [], hintOn: !!(G && G.hintOn), hint: G && G.hint ? G.hint.type : '', sel: G ? G.sel : null, coach: G ? (G.coachMsg || '') : '',
        status: $('status').textContent, hintText: $('hint').textContent, save: JSON.parse(JSON.stringify(save)), maxAi: G ? G.maxAi || 0 : 0,
        res: st && st.result ? { type: st.result.type, why: st.result.why || '', winners: (st.result.winners || []).map(w => ({ seat: w.seat, han: w.han, fu: w.fu, yaku: w.yaku.map(y => y.id), total: w.total })), delta: st.result.delta } : null,
        gameOver: !!(st && st.over), final: st && st.final ? st.final : null, sl: G && G.sl ? G.sl : '', names: G ? G.names.slice() : [],
      };
    },
  };
  window.__kb = Object.assign(window.__kb || {}, api);
  window.__mahjong = {
    api, E, AI, ART, get G() { return G; }, get save() { return save; },
    start(o) { hideOverlays(); newGame(o || {}); return api.state(); },
    rig(spec, o) { hideOverlays(); newGame(Object.assign({ wall: E.rigWall(spec), dummy: false }, o || {})); return api.state(); },
    title: showTitle, setSpeed(m) { cpuDelayMul = m; }, resume() { return resumeGame(); }, openMenu, tutorial: startTutorial,
    // 次に「どこを押すか」だけを返す。押すのはテスト側の本物のマウス操作
    plan() {
      if (!G || G.over || G.view) return [];
      const st = G.st;
      if (!$('ovResult').hidden) return [{ sel: '#rBtns .btn' }];
      if (st.phase === 'end') return [];
      if (G.tut) return [];
      const Lg = myLegal();
      if (isMyDecision()) {
        if (Lg.some(a => a.t === 'tsumo')) return [{ sel: '#ctl [data-id="tsumo"]' }];
        let h = null; try { h = AI.hint(st, G.me); } catch (e) {}
        if (!h) return [];
        if (h.type === 'ankan') return [{ sel: '#ctl [data-id="kan"]' }];
        if (h.type === 'kyuushu') return [{ sel: '#ctl [data-id="kyuushu"]' }];
        const tile = h.action && h.action.tile != null ? h.action.tile : st.drawn;
        const steps = [];
        if (h.action && h.action.riichi) steps.push({ sel: '#ctl [data-id="riichi"]' });
        steps.push({ sel: '#hand .tl[data-id="' + tile + '"]' }); steps.push({ sel: '#hand .tl[data-id="' + tile + '"]' });
        return steps;
      }
      if (st.phase === 'call' && Lg.length) {
        if (Lg.some(a => a.t === 'ron')) return [{ sel: '#ctl [data-id="ron"]' }];
        const h = AI.hint(st, G.me), t = h && h.type;
        if (t === 'pon' || t === 'chii' || t === 'daiminkan') return [{ sel: '#ctl [data-id="' + t + '"]' }];
        return [{ sel: '#ctl [data-id="pass"]' }];
      }
      return [];
    },
    thumbScene() { // 卓の途中（4人・中盤）：ハブのサムネイル用
      store.set(HOWTO_KEY, '1'); document.body.classList.add('thumb'); hideOverlays();
      let st = null;
      for (let seed = 11; seed < 400 && !st; seed++) {
        const c = E.create({ seed, levels: [2, 2, 2, 2], cfg: { mode: 'east' } }); const rnd = E.mulberry32(seed);
        for (let i = 0; i < 400 && c.phase !== 'end'; i++) {
          const s = E.waiting(c)[0]; const a = AI.decide(c, s, 2, rnd); E.apply(c, s, a);
          if (c.rivers[0].length >= 9 && c.turn === 0 && c.phase === 'discard') break;
        }
        if (c.phase === 'discard' && c.turn === 0 && c.rivers.every(r => r.length >= 7) && c.rivers[0].length >= 9) { st = c; }
      }
      G = { st, me: 0, view: true, idle: true, thumb: true, names: NAMES.slice(), mode: 'east', levels: [0, 2, 2, 2], hist: [], kifu: [], over: false, menu: true, rec: {}, hintOn: false, showShanten: false };
      st.riichi[2] = 1;
      render();
      return !!st;
    },
    state: api.state,
  };
}
})();
