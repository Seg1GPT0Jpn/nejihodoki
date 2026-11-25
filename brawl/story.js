// おもちゃ大乱闘 ストーリー「サビの工房」：地図・たたかい・ごほうび・ボード・チャームの「データ」と、まっすぐな関数だけ（node でもブラウザでも動く：window.BrawlStory）。
// ぜんぶオリジナル。たたかいはデータ（相手・ステージ・ルール・ごほうび）。試合そのものは engine.js（決まった結果）。ここは乱数・時刻を使わない。
// 保存の形（kusoge.brawl.save の sv）：{ v:1, d:'16進のビット列'（おわったたたかい）, b:ねじ, u:[こうげき,ぼうぎょ,はやさ,もどり], c:['s','j'…]（持っているチャーム）, e:[…]（つけているチャーム）, h:'robo'（主役）, r:すすんだ地方 }
(function (root) {
  'use strict';
  const T = (ja, en) => ({ ja, en });
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------------------------------------------------------------- 地方（5つ。第1弾は 1 だけ中身がある）
  const REGIONS = [
    { id: 1, name: T('おもちゃだな', 'The Toy Shelf'), soon: false,
      intro: [T('夜の工房。ごみ箱から、オレンジ色の「サビ」がじわじわ広がってきた。', 'A night in the workshop. A creeping orange Rust is oozing out of the scrap bin.'),
        T('サビにつかまったおもちゃは、さびたネジ缶にとじこめられて、ケンカをはじめてしまう。', 'Toys it touches get sealed in rusty screw tins, and they start picking fights.'),
        T('まだ元気なきみは、おもちゃだなから出発。みんなのネジ缶をあけて、助けよう！', 'You are still shiny. Start at the toy shelf, open the tins, and free everyone!')],
      outro: [T('だなのおもちゃは、みんな元気になった。「つぎは、さいほうかごへ！」', 'The shelf is awake again. "Next stop: the sewing basket!"')] },
    { id: 2, name: T('さいほうかご', 'The Sewing Basket'), soon: true, intro: [], outro: [] },
    { id: 3, name: T('オルゴールのひろま', 'Music Box Hall'), soon: true, intro: [], outro: [] },
    { id: 4, name: T('だいどころ', 'The Kitchen'), soon: true, intro: [], outro: [] },
    { id: 5, name: T('ガラクタやま', 'The Scrap Heap'), soon: true, intro: [], outro: [] },
  ];

  // ---------------------------------------------------------------- たたかい
  // foes：ch＝おもちゃ lvl＝CPU の強さ 1〜3 stk＝残機 size＝大きさ（1より大きいと大きい） pal＝色の番号（なくてもよい）
  // me：{ stk 残機, hp はじめのダメージ% } rules：{ time（秒。あれば時間制）, g（重力。1より小さいとふわふわ） }
  // reward：{ bolts 初回のねじ, free 助けるおもちゃ, charm チャーム } needs：先におわらせるたたかい（なければ前のたたかい）
  const BATTLES = [
    { id: 'r1b1', region: 1, at: [9, 70], name: T('サビついた ロボ', 'The Rusty Robot'), say: T('ガガガ… ネジが… ゆるんで… いる…', 'Grr-gzz… my screws… are loose…'),
      stage: 'bench', foes: [{ ch: 'robo', lvl: 1, stk: 2 }], me: { stk: 3 }, rules: {}, reward: { bolts: 3 } },
    { id: 'r1b2', region: 1, at: [22, 38], name: T('おさんぽ アヒル', 'The Stroll Duck'), say: T('クワッ！ わたしの さんぽみちを あけなさい！', 'Quack! Clear my walking path!'),
      stage: 'box', foes: [{ ch: 'duck', lvl: 1, stk: 2 }], me: { stk: 3 }, rules: {}, reward: { bolts: 3 } },
    { id: 'r1b3', region: 1, at: [36, 68], name: T('ブリキの たいちょう', 'The Tin Captain'), say: T('ラッパが ならない… サビの せいだ！', 'My bugle will not blow… it is the Rust!'),
      stage: 'bench', foes: [{ ch: 'tin', lvl: 2, stk: 2 }], me: { stk: 3 }, rules: {}, reward: { bolts: 3, free: 'tin' } },
    { id: 'r1b4', region: 1, at: [50, 34], name: T('ふわふわ だな', 'The Floaty Shelf'), say: T('ここだけ、なぜか からだが かるいぞ！', 'Everything feels light up here!'),
      stage: 'shelf', foes: [{ ch: 'balloon', lvl: 2, stk: 3 }], me: { stk: 3 }, rules: { g: 0.6 }, reward: { bolts: 4 } },
    { id: 'r1b5', region: 1, at: [62, 66], name: T('こまの たいかい', 'The Spinning Meet'), say: T('くるくる くるくる！ とまれないよ！', 'Round and round! I cannot stop!'),
      stage: 'track', foes: [{ ch: 'top', lvl: 2, stk: 3 }], me: { stk: 3 }, rules: {}, reward: { bolts: 4, free: 'top' } },
    { id: 'r1b6', region: 1, at: [74, 36], name: T('ふたり がかり', 'Two Against One'), say: T('せめるなら ふたりまとめて かかってこい！', 'Come on, take both of us on!'),
      stage: 'bench', foes: [{ ch: 'bear', lvl: 2, stk: 2 }, { ch: 'duck', lvl: 1, stk: 2, pal: 3 }], me: { stk: 3 }, rules: {}, reward: { bolts: 5, charm: 's' } },
    { id: 'r1b7', region: 1, at: [86, 64], name: T('びっくり ばこ', 'The Jack-in-the-Box'), say: T('ポンッ！ ふたをあけたら、ケンカだよ！', 'Pop! Open the lid and it is a brawl!'),
      stage: 'box', foes: [{ ch: 'jack', lvl: 2, stk: 3 }], me: { stk: 3 }, rules: { time: 90 }, reward: { bolts: 4, free: 'jack' } },
    { id: 'r1b8', region: 1, at: [90, 30], name: T('ぼうしの ネコ', 'The Capped Cat'), say: T('はんでを あげるよ。それでも ぼくが かつけどね！', 'I will give you a handicap. I will win anyway!'),
      stage: 'house', foes: [{ ch: 'cat', lvl: 2, stk: 3 }], me: { stk: 3, hp: 40 }, rules: {}, reward: { bolts: 5, free: 'cat' } },
    { id: 'r1b9', region: 1, at: [74, 12], name: T('おおきな クマ', 'The Big Bear'), say: T('ぼくは ふとったんじゃない、サビで ふくらんだんだ！', 'I am not fat, the Rust puffed me up!'),
      stage: 'bench', foes: [{ ch: 'bear', lvl: 2, stk: 3, size: 1.35, pal: 2 }], me: { stk: 3 }, rules: {}, reward: { bolts: 6, charm: 'j' } },
    { id: 'r1b10', region: 1, at: [52, 10], name: T('だなの サビ番', 'The Shelf Rust-Guard'), say: T('ここを通りたければ、わたしたちを たおしていけ！', 'If you want to pass, get through us!'),
      stage: 'shelf', foes: [{ ch: 'tank', lvl: 3, stk: 2 }, { ch: 'wiz', lvl: 2, stk: 2 }], me: { stk: 3 }, rules: {}, reward: { bolts: 8, free: 'ninja', charm: 'p' }, boss: 1 },
  ];

  // ---------------------------------------------------------------- チャーム（2つまで。1つにつき、ルールを1つだけ変える）と ボード
  const CHARMS = [
    { id: 's', name: T('ながもち バリア', 'Long Barrier'), desc: T('まもりが、へりにくくなる', 'Your shield wears down slower') },
    { id: 'j', name: T('もうひとつ ジャンプ', 'One More Jump'), desc: T('空中ジャンプが 1回ふえる', 'One extra air jump') },
    { id: 'p', name: T('たまよけ ぬいぐるみ', 'Shot-Proof Plush'), desc: T('飛び道具のダメージが 20% へる', 'Projectiles hurt 20% less') },
    { id: 'h', name: T('どっしり おもり', 'Heavy Weight'), desc: T('ふっとびが 8% 小さくなる', 'You fly 8% less far') },
  ];
  const BOARD = { slots: 10, max: 5, stats: ['a', 'd', 's', 'r'], names: { a: T('こうげき', 'Attack'), d: T('ぼうぎょ', 'Defense'), s: T('はやさ', 'Speed'), r: T('もどり', 'Recovery') },
    desc: { a: T('ダメージ +4% / レベル', 'Damage +4% per level'), d: T('ふっとび -4% / レベル', 'Knockback taken -4% per level'), s: T('走る・空中の速さ +3% / レベル', 'Run and air speed +3% per level'), r: T('上とくぎの高さ +5% / レベル', 'Up-special height +5% per level') } };
  const CHARM_SLOTS = 2;

  // ---------------------------------------------------------------- 保存（sv）の読み書き・進み具合
  const defSv = () => ({ v: 1, d: '', b: 0, u: [0, 0, 0, 0], c: [], e: [], h: '', r: 1 });
  const index = id => BATTLES.findIndex(b => b.id === id);
  const toBits = hex => { const out = []; for (let i = 0; i < hex.length; i++) { const v = parseInt(hex[i], 16) || 0; for (let k = 3; k >= 0; k--) out.push((v >> k) & 1); } return out; };
  const toHex = bits => { let s = ''; for (let i = 0; i < bits.length; i += 4) { let v = 0; for (let k = 0; k < 4; k++) v = v * 2 + (bits[i + k] ? 1 : 0); s += v.toString(16); } return s.replace(/0+$/, ''); };
  const isDone = (sv, id) => { const i = index(id); return i >= 0 && toBits(sv.d || '')[i] === 1; };
  function setDone(sv, id) { const i = index(id); if (i < 0) return; const b = toBits(sv.d || ''); while (b.length < BATTLES.length + 3) b.push(0); b[i] = 1; sv.d = toHex(b); }
  // たたかいが開いているか：先のたたかい（needs か、同じ地方の1つ前）がおわっている、または最初
  function isOpen(sv, b) { const prev = BATTLES[index(b.id) - 1], needs = b.needs || (prev && prev.region === b.region ? [prev.id] : []); return needs.every(id => isDone(sv, id)); }
  const doneCount = (sv, region) => BATTLES.filter(b => (!region || b.region === region) && isDone(sv, b.id)).length;
  const regionDone = (sv, region) => BATTLES.filter(b => b.region === region).every(b => isDone(sv, b.id));
  const cost = lv => lv; // レベル n にするのに n 個のねじ
  const spent = u => u.reduce((a, l) => a + l * (l + 1) / 2, 0);
  const slotsUsed = u => u.reduce((a, l) => a + l, 0);
  const canUpgrade = (sv, k) => sv.u[k] < BOARD.max && slotsUsed(sv.u) < BOARD.slots && sv.b >= cost(sv.u[k] + 1);
  function upgrade(sv, k) { if (!canUpgrade(sv, k)) return false; sv.b -= cost(sv.u[k] + 1); sv.u[k]++; return true; }
  function downgrade(sv, k) { if (sv.u[k] <= 0) return false; sv.b += cost(sv.u[k]); sv.u[k]--; return true; } // もどすと、つかったねじが かえってくる
  function resetBoard(sv) { sv.b += spent(sv.u); sv.u = [0, 0, 0, 0]; }
  function toggleCharm(sv, id) { const i = sv.e.indexOf(id); if (i >= 0) { sv.e.splice(i, 1); return true; } if (sv.c.indexOf(id) < 0 || sv.e.length >= CHARM_SLOTS) return false; sv.e.push(id); return true; }
  // 読みこんだ sv を、きちんとした形にする（こわれた保存でも落ちない）
  function clean(x, ids) {
    const o = defSv(); if (!x || typeof x !== 'object' || Array.isArray(x)) return o;
    o.d = typeof x.d === 'string' && /^[0-9a-f]*$/.test(x.d) && x.d.length <= 64 ? x.d : ''; o.b = clamp(Math.floor(+x.b) || 0, 0, 99999);
    if (Array.isArray(x.u)) for (let k = 0; k < 4; k++) o.u[k] = clamp(Math.floor(+x.u[k]) || 0, 0, BOARD.max);
    while (slotsUsed(o.u) > BOARD.slots) { const k = o.u.indexOf(Math.max.apply(null, o.u)); o.u[k]--; }
    const cids = CHARMS.map(c => c.id); o.c = Array.isArray(x.c) ? x.c.filter((c, i, a) => cids.indexOf(c) >= 0 && a.indexOf(c) === i) : [];
    o.e = Array.isArray(x.e) ? x.e.filter((c, i, a) => o.c.indexOf(c) >= 0 && a.indexOf(c) === i).slice(0, CHARM_SLOTS) : [];
    o.h = typeof x.h === 'string' && (!ids || ids.indexOf(x.h) >= 0) ? x.h : ''; o.r = clamp(Math.floor(+x.r) || 1, 1, REGIONS.length);
    return o;
  }
  // たたかいに勝ったときの、ごほうび（sv を書きかえて、何が増えたかを返す）。2回目からは、ねじ1つ
  function award(sv, b) {
    const first = !isDone(sv, b.id), r = b.reward || {}, out = { first, bolts: first ? (r.bolts | 0) : 1, free: null, charm: null, region: false };
    sv.b += out.bolts;
    if (first) { setDone(sv, b.id); if (r.free) out.free = r.free; if (r.charm && sv.c.indexOf(r.charm) < 0) { sv.c.push(r.charm); out.charm = r.charm; } if (b.boss && sv.r <= b.region && b.region < REGIONS.length) { sv.r = b.region + 1; out.region = true; } }
    return out;
  }
  // たたかいの試合の作り方：E.create に渡す形（主役にボード・チャーム、相手に大きさ）。E は BrawlEngine
  function matchOpts(E, b, sv, seed) {
    const cm = {}; for (const id of sv.e) cm[id] = 1;
    const fighters = [{ ch: sv.h || 'robo', lvl: 0, stk: (b.me && b.me.stk) || 3, up: sv.u.slice(), cm }];
    for (const f of b.foes) fighters.push({ ch: f.size && f.size !== 1 ? E.makeVariant(f.ch, f.size) : f.ch, lvl: f.lvl, stk: f.stk });
    const o = { seed, stage: b.stage, fighters, mode: b.rules && b.rules.time ? 'time' : 'stock', stocks: (b.me && b.me.stk) || 3, time: b.rules && b.rules.time ? b.rules.time : 180 };
    if (b.rules && b.rules.g) o.mods = { g: b.rules.g };
    if (b.me && b.me.hp) o.hp = [b.me.hp].concat(b.foes.map(() => 0));
    return o;
  }
  // データのまちがい探し（テストが使う）。E は BrawlEngine。問題があれば、文の配列
  function validate(E) {
    const bad = [], ids = new Set(), stages = new Set(E.STAGE_IDS);
    for (const b of BATTLES) {
      const w = b.id + ': ';
      if (ids.has(b.id)) bad.push(w + 'duplicate id'); ids.add(b.id);
      if (!REGIONS.some(r => r.id === b.region && !r.soon)) bad.push(w + 'region');
      if (!b.name || !b.name.ja || !b.name.en || !b.say || !b.say.ja || !b.say.en) bad.push(w + 'text');
      if (!stages.has(b.stage)) bad.push(w + 'stage ' + b.stage);
      if (!Array.isArray(b.at) || b.at[0] < 0 || b.at[0] > 100 || b.at[1] < 0 || b.at[1] > 100) bad.push(w + 'map position');
      if (!b.foes || b.foes.length < 1 || b.foes.length > 3) bad.push(w + 'foes 1-3');
      for (const f of b.foes || []) { if (!E.CH[f.ch] || E.CH[f.ch].boss) bad.push(w + 'foe toy ' + f.ch); if (!(f.lvl >= 1 && f.lvl <= 3)) bad.push(w + 'lvl'); if (!(f.stk >= 1 && f.stk <= 9)) bad.push(w + 'stk'); if (f.size && !(f.size >= 0.6 && f.size <= 1.6)) bad.push(w + 'size'); if (f.pal != null && !(f.pal >= 0 && f.pal < E.K.PAL_N)) bad.push(w + 'pal'); }
      if (!(b.me && b.me.stk >= 1 && b.me.stk <= 9)) bad.push(w + 'me.stk'); if (b.me && b.me.hp != null && !(b.me.hp >= 0 && b.me.hp <= 150)) bad.push(w + 'me.hp');
      const r = b.rules || {}; if (r.g != null && !(r.g >= 0.3 && r.g <= 2)) bad.push(w + 'gravity'); if (r.time != null && !(r.time >= 30 && r.time <= 600)) bad.push(w + 'time');
      for (const k of Object.keys(r)) if (['g', 'time'].indexOf(k) < 0) bad.push(w + 'unknown rule ' + k);
      const rw = b.reward || {}; if (!(rw.bolts >= 1 && rw.bolts <= 20)) bad.push(w + 'bolts'); if (rw.free && (!E.CH[rw.free] || E.CH[rw.free].boss)) bad.push(w + 'free toy ' + rw.free); if (rw.charm && !CHARMS.some(c => c.id === rw.charm)) bad.push(w + 'charm');
      for (const n of b.needs || []) if (index(n) < 0 || index(n) >= index(b.id)) bad.push(w + 'needs ' + n);
    }
    for (const r of REGIONS) if (!r.soon) { if (!r.intro.length || !r.outro.length) bad.push('region ' + r.id + ' text'); if (!BATTLES.some(b => b.region === r.id && b.boss)) bad.push('region ' + r.id + ' has no boss'); }
    for (const c of CHARMS) if (!c.name.ja || !c.name.en || !c.desc.ja || !c.desc.en || ['s', 'j', 'p', 'h'].indexOf(c.id) < 0) bad.push('charm ' + c.id);
    return bad;
  }

  const api = { REGIONS, BATTLES, CHARMS, BOARD, CHARM_SLOTS, defSv, index, isDone, setDone, isOpen, doneCount, regionDone, cost, spent, slotsUsed, canUpgrade, upgrade, downgrade, resetBoard, toggleCharm, clean, award, matchOpts, validate, toBits, toHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BrawlStory = api;
})(typeof window !== 'undefined' ? window : globalThis);
