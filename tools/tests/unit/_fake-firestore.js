// P3 の単体テスト用の偽の Firestore（compat の形）。firestore.rules の次の部分を、書いてあるとおりにまねる：
//   nejiUsers/{uid}            read, delete: 本人だけ / create, update: 本人だけ
//   kusogeRanks/{uid}          read: だれでも / delete: 本人だけ
//   kbBoards/{b}/e/{uid}       get: だれでも / list: limit ≤ 50 / delete: 本人だけ / set: 本人だけ（形は見ない）
//   kbProfiles/{uid}           get: だれでも / list: limit ≤ 50 / delete: 本人だけ / set: 本人だけ
//   kbCodes/{code}             get: だれでも / list: 拒否 / create: ログイン中・コードの形・{ u: 自分, t: サーバーの時刻 } だけ・まだないとき
//                              delete: resource.data.u が自分（文書がないときは resource が null なので拒否）
//   ほかのパス                 すべて拒否
// 読み取りは数える（get は1件、クエリは返した件数、0件でも1）。
'use strict';
const ST = { __serverTime: true };
const CODE = /^[2-9A-HJ-NP-Z]{8}$/;
function denied() { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; }

class FakeFirestore {
  constructor() { this.docs = new Map(); this.uid = null; this.reads = 0; this.writes = 0; this.denied = 0; this.log = []; }
  collection(name) { return new Coll(this, name); }
  deny() { this.denied++; throw denied(); }
  canRead(p, list, q) {
    const s = p.split('/');
    if (s[0] === 'nejiUsers') return !list && s[1] === this.uid && !!this.uid;
    if (s[0] === 'kusogeRanks') return true;
    if (s[0] === 'kbBoards') return s[2] === 'e' && (!list || (q && q.limit > 0 && q.limit <= 50));
    if (s[0] === 'kbProfiles') return !list || (q && q.limit > 0 && q.limit <= 50);
    if (s[0] === 'kbCodes') return !list;
    return false;
  }
  setDoc(p, data, opt) {
    const s = p.split('/'), old = this.docs.get(p), me = this.uid;
    this.writes++; this.log.push(['set', p]);
    let ok = false;
    if (s[0] === 'nejiUsers' || s[0] === 'kbProfiles' || s[0] === 'kusogeRanks') ok = !!me && s[1] === me && s.length === 2;
    else if (s[0] === 'kbBoards') ok = s.length === 4 && s[2] === 'e' && s[3] === me && data.u === me;
    else if (s[0] === 'kbCodes') {
      const keys = Object.keys(data).sort().join(',');
      ok = !!me && !old && CODE.test(s[1]) && keys === 't,u' && data.u === me && data.t === ST;
    }
    if (!ok) this.deny();
    const v = Object.assign({}, opt && opt.merge && old ? old : {}, data);
    for (const k of Object.keys(v)) if (v[k] === ST) v[k] = 1000;
    this.docs.set(p, v);
  }
  delDoc(p) {
    const s = p.split('/'), me = this.uid, old = this.docs.get(p);
    this.writes++; this.log.push(['delete', p]);
    let ok = false;
    if (s[0] === 'nejiUsers' || s[0] === 'kbProfiles' || s[0] === 'kusogeRanks') ok = !!me && s.length === 2 && s[1] === me;
    else if (s[0] === 'kbBoards') ok = !!me && s.length === 4 && (s[2] === 'e' || s[2] === 'r') && s[3] === me;
    else if (s[0] === 'kbCodes') ok = !!me && !!old && old.u === me; // resource == null → the rule errors → denied
    if (!ok) this.deny();
    this.docs.delete(p);
  }
  getDoc(p) {
    this.reads++;
    if (!this.canRead(p, false)) this.deny();
    return snap(p, this.docs.get(p));
  }
  query(coll, q) {
    if (!this.canRead(coll + '/x', true, q)) { this.reads++; this.deny(); }
    const pre = coll + '/';
    let rows = [...this.docs.entries()].filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/'));
    for (const [f, op, v] of q.where) {
      if (op === 'in') { if (!Array.isArray(v) || v.length > 30) throw Object.assign(new Error('in: max 30'), { code: 'invalid-argument' }); rows = rows.filter(([, d]) => v.includes(d[f])); }
      else rows = rows.filter(([, d]) => d[f] === v);
    }
    if (q.order) rows.sort((a, b) => b[1][q.order] - a[1][q.order]);
    if (q.limit) rows = rows.slice(0, q.limit);
    this.reads += Math.max(1, rows.length);
    const docs = rows.map(([k, v]) => snap(k, v));
    return { size: docs.length, docs, empty: !docs.length };
  }
}
function snap(p, d) { const data = d ? Object.assign({}, d) : undefined; return { id: p.split('/').pop(), exists: !!d, data: () => data }; }
class Coll {
  constructor(db, p, q) { this.db = db; this.p = p; this.q = q || { where: [], order: null, limit: 0 }; }
  doc(id) { return new Doc(this.db, this.p + '/' + id); }
  where(f, op, v) { return new Coll(this.db, this.p, Object.assign({}, this.q, { where: this.q.where.concat([[f, op, v]]) })); }
  orderBy(f) { return new Coll(this.db, this.p, Object.assign({}, this.q, { order: f })); }
  limit(n) { return new Coll(this.db, this.p, Object.assign({}, this.q, { limit: n })); }
  async get() { return this.db.query(this.p, this.q); }
}
class Doc {
  constructor(db, p) { this.db = db; this.p = p; }
  collection(n) { return new Coll(this.db, this.p + '/' + n); }
  async set(d, opt) { return this.db.setDoc(this.p, d, opt); }
  async get() { return this.db.getDoc(this.p); }
  async delete() { return this.db.delDoc(this.p); }
}
// 偽の KoboCloud（user / me / ensureGuest / ready）
function fakeCloud(db, uid) {
  let user = uid ? { uid, isAnonymous: false, name: 'X' } : null;
  db.uid = uid || null;
  const c = {
    guests: 0,
    user: () => user, me: () => (user ? user.uid : null), ready: async () => true,
    ensureGuest: async () => { if (!user) { c.guests++; user = { uid: 'guest' + c.guests, isAnonymous: true }; db.uid = user.uid; } return user; },
    switchUser(u) { user = u ? { uid: u, isAnonymous: true } : null; db.uid = u || null; },
  };
  return c;
}
module.exports = { FakeFirestore, fakeCloud, ST, denied };
