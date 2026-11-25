// まなびの工房：ソーシャル（ほんもののリーグ・できごとのフィード・友だちクエスト）。
// Firestore の compat 形（db.collection(c).doc(id).get()/set()/update()）だけを使う。db は呼び出し側が渡す（テストでは偽物）。
// ルールは tools/proposed-manabi-social-rules.txt（firestore.rules にマージされるまでは、書き込みが拒否されて「ひとり用」にもどる）。
// ここのコードは「ゆるい上限」のルールに合わせてあるだけで、XP のごまかしを防ぐものではない（賞品などには結びつけない）。
(function (root) {
  'use strict';
  const MAX_MEMBERS = 30, MAX_ROOMS = 99, GAP_MS = 60000, STEP = 2000, CAP = 12000, FEED_GAP_MS = 20000, FEED_MAX = 10;
  const TYPES = ['ach', 'streak', 'promo', 'lesson', 'friend'];
  const roomId = (week, tier, n) => 'w' + week + '-t' + tier + '-' + n;
  const nm = s => Array.from(String(s || '').trim()).slice(0, 12).join('') || 'ゲスト';
  const ms = t => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : 0);
  const refOf = (db, c, id) => db.collection(c).doc(id);
  const snapData = s => (s && s.exists ? s.data() : null);

  // 自分の週のリーグの組に入る。組は 1 から順にさがし、30人に満たない組に自分を足す（足せなかったら次の組）。
  async function join(db, o) {
    let retried = false;
    for (let n = 1; n <= MAX_ROOMS; n++) {
      const ref = refOf(db, 'kbLg', roomId(o.week, o.tier, n)); let d;
      try { d = snapData(await ref.get()); } catch (e) { return { ok: false, reason: 'read' }; }
      const entry = { n: nm(o.name), x: Math.max(0, Math.min(CAP, o.xp | 0)), t: o.ts() };
      if (d && d.m && d.m[o.uid]) return { ok: true, room: ref.id, n, existed: true };
      if (d && d.m && Object.keys(d.m).length >= MAX_MEMBERS) continue;
      try {
        if (!d) await ref.set({ wk: o.week, m: { [o.uid]: entry } }); else await ref.update({ ['m.' + o.uid]: entry });
        return { ok: true, room: ref.id, n, x: entry.x };
      } catch (e) {
        if (e && e.code === 'permission-denied' && !d && !retried) { retried = true; n--; continue; } // 同時に作られたかもしれない：同じ組をもう一度
        if (e && e.code === 'permission-denied') continue; // 満員・ほかの人が先に入った
        return { ok: false, reason: 'write' };
      }
    }
    return { ok: false, reason: 'full' };
  }

  // 自分の XP を書く（60秒以上あけて、1回 2000 まで。増えていなければ書かない）。
  async function push(db, o) {
    const x = Math.min(CAP, o.xp | 0, (o.prevX | 0) + STEP);
    if (x <= (o.prevX | 0)) return { ok: true, skipped: 'same' };
    if (o.now - (o.prevT || 0) < GAP_MS) return { ok: true, skipped: 'gap' };
    try { await refOf(db, 'kbLg', o.room).update({ ['m.' + o.uid]: { n: nm(o.name), x, t: o.ts() } }); return { ok: true, x, t: o.now }; } catch (e) { return { ok: false, reason: e && e.code === 'permission-denied' ? 'denied' : 'error' }; }
  }

  async function members(db, room) {
    try { const d = snapData(await refOf(db, 'kbLg', room).get()); if (!d || !d.m) return { ok: true, rows: [] }; return { ok: true, rows: Object.keys(d.m).map(uid => ({ uid, n: String(d.m[uid].n || ''), xp: d.m[uid].x | 0, t: ms(d.m[uid].t) })) }; } catch (e) { return { ok: false, reason: 'read', rows: [] }; }
  }

  // 順位表：ほんもののプレイヤー＋足りない席をボットでうめる（size 人まで。ほんものが size 人以上ならボットなし）。
  function board(real, uid, bots, size) {
    const rows = real.map(r => ({ uid: r.uid, n: r.n, xp: r.xp, me: r.uid === uid ? 1 : 0 }));
    const need = Math.max(0, (size || 10) - rows.length);
    for (let i = 0; i < need && i < bots.length; i++) rows.push({ n: bots[i].n, xp: bots[i].xp, k: bots[i].k, bot: 1 });
    rows.sort((a, b) => b.xp - a.xp || (a.me ? -1 : b.me ? 1 : 0) || (a.bot ? 1 : b.bot ? -1 : 0) || (a.uid || '') .localeCompare(b.uid || ''));
    return rows;
  }
  // 上がる人数・下がりはじめの順位（10人：上位3人・8位から。30人：上位9人・22位から）
  const zones = n => ({ up: Math.ceil(n * 0.3), dnFrom: n - Math.floor(n * 0.3) + 1 });

  // できごとのフィード
  const okEv = e => e && TYPES.includes(e.ty) && typeof e.tx === 'string' && e.tx.length >= 1 && e.tx.length <= 60 && Number.isInteger(e.at) && e.at > 0;
  async function feedPush(db, o) { // o: { uid, ev:{ty,tx,at}, now, ts }
    if (!okEv(o.ev)) return { ok: false, reason: 'bad' };
    const ref = refOf(db, 'kbFeed', o.uid); let cur = {};
    try { const d = snapData(await ref.get()); if (d) { if (o.now - ms(d.t) < FEED_GAP_MS) return { ok: true, skipped: 'gap' }; cur = d.e || {}; } } catch (e) { return { ok: false, reason: 'read' }; }
    const list = [o.ev]; for (let i = 0; i < FEED_MAX; i++) if (cur['e' + i] && okEv(cur['e' + i])) list.push({ ty: cur['e' + i].ty, tx: cur['e' + i].tx, at: cur['e' + i].at });
    const e = {}; list.slice(0, FEED_MAX).forEach((v, i) => { e['e' + i] = v; });
    try { await ref.set({ e, t: o.ts() }); return { ok: true }; } catch (err) { return { ok: false, reason: 'write' }; }
  }
  async function feedRead(db, friends) { // friends: [{uid,n}]（最大10人）
    const out = [];
    await Promise.all(friends.slice(0, 10).map(async f => {
      try { const d = snapData(await refOf(db, 'kbFeed', f.uid).get()); if (d && d.e) for (let i = 0; i < FEED_MAX; i++) { const v = d.e['e' + i]; if (okEv(v)) out.push({ uid: f.uid, n: f.n, ty: v.ty, tx: v.tx, at: v.at }); } } catch (e) { /* 読めない人は飛ばす */ }
    }));
    return out.sort((a, b) => b.at - a.at).slice(0, 20);
  }

  // 友だちクエスト（ペア文書 kbPairs/<小>_<大>）
  const pairId = (u1, u2) => (u1 < u2 ? u1 + '_' + u2 : u2 + '_' + u1);
  async function pairSync(db, o) { // o: { me, other, week, xp, ts } → { ok, mine, theirs }
    const pid = pairId(o.me, o.other), lo = pid.split('_')[0], iA = o.me === lo, mineKey = iA ? 'xa' : 'xb', otherKey = iA ? 'xb' : 'xa', ref = refOf(db, 'kbPairs', pid), x = Math.max(0, Math.min(CAP, o.xp | 0));
    try {
      const d = snapData(await ref.get());
      if (!d) { await ref.set({ a: pid.split('_')[0], b: pid.split('_')[1], wk: o.week, [mineKey]: x, [otherKey]: 0 }); return { ok: true, mine: x, theirs: 0 }; }
      if (d.wk > o.week) return { ok: true, mine: x, theirs: 0 };
      if (d.wk < o.week) { await ref.update({ wk: o.week, [mineKey]: x, [otherKey]: 0 }); return { ok: true, mine: x, theirs: 0 }; }
      const prev = d[mineKey] | 0, nx = Math.min(x, prev + STEP);
      if (nx > prev) await ref.update({ [mineKey]: nx });
      return { ok: true, mine: Math.max(prev, nx), theirs: d[otherKey] | 0 };
    } catch (e) { return { ok: false, reason: e && e.code === 'permission-denied' ? 'denied' : 'error' }; }
  }

  const api = { MAX_MEMBERS, GAP_MS, STEP, CAP, roomId, nm, join, push, members, board, zones, okEv, feedPush, feedRead, pairId, pairSync };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ManabiSocial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
