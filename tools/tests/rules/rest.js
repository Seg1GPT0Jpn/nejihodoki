// ルールのテスト用の小さな REST クライアント（node の fetch だけ。npm のパッケージは使わない）
// 本番（--live）とエミュレーターのどちらにも同じ呼び方で送る。
'use strict';

const LIVE = {
  name: 'live',
  apiKey: 'AIzaSyAajs1PtJiv5csAIo5ANSdHYBMyqKApjBY', // firebase-config.js と同じ公開の値
  project: 'neji-5913a',
  authBase: 'https://identitytoolkit.googleapis.com',
  rtdbBase: 'https://neji-5913a-default-rtdb.asia-southeast1.firebasedatabase.app',
  rtdbNs: null,
  fsBase: 'https://firestore.googleapis.com',
};
function emulatorTarget(ports) {
  return {
    name: 'emulator',
    apiKey: 'fake-api-key',
    project: 'demo-kobo',
    authBase: `http://127.0.0.1:${ports.auth}/identitytoolkit.googleapis.com`,
    rtdbBase: `http://127.0.0.1:${ports.database}`,
    rtdbNs: 'neji-5913a-default-rtdb',
    fsBase: `http://127.0.0.1:${ports.firestore}`,
  };
}

// 匿名ログイン（本番では本物の匿名アカウントができる。ゲームの対戦と同じ）
async function signUp(T) {
  const r = await fetch(`${T.authBase}/v1/accounts:signUp?key=${T.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}',
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('signUp failed: ' + JSON.stringify(j).slice(0, 200));
  return { uid: j.localId, token: j.idToken };
}

// ---------------------------------------------------------------- Realtime Database
// 戻り値：{ ok, status, body }。ok は「ルールで許された」（HTTP 2xx）
async function rtdb(T, method, path, body, user) {
  const q = new URLSearchParams();
  if (user) q.set('auth', user.token);
  if (T.rtdbNs) q.set('ns', T.rtdbNs);
  const url = `${T.rtdbBase}/${path.replace(/^\//, '')}.json?${q}`;
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { j = text; }
  return { ok: r.ok, status: r.status, body: j };
}
const TS = { '.sv': 'timestamp' };

// ---------------------------------------------------------------- Firestore
const SERVER_TIME = { __serverTime: true };
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  throw new Error('cannot encode ' + v);
}
function encFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) if (!(v && v.__serverTime)) f[k] = enc(v);
  return f;
}
function dec(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = dec(x); return o; }
  return v;
}
const docName = (T, p) => `projects/${T.project}/databases/(default)/documents/${p}`;
const fsUrl = (T, rest) => `${T.fsBase}/v1/projects/${T.project}/databases/(default)/documents${rest}`;
async function fsReq(T, method, url, body, user) {
  const h = { 'Content-Type': 'application/json' };
  if (user) h.Authorization = 'Bearer ' + user.token;
  const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { j = text; }
  return { ok: r.ok, status: r.status, body: j };
}
// SDK の set(data) / set(data, { merge: true }) と同じ書き込み。値に SERVER_TIME を入れると serverTimestamp()
async function fsSet(T, path, data, user, opt = {}) {
  const transforms = [];
  (function walk(o, pre) {
    for (const [k, v] of Object.entries(o)) {
      if (v && v.__serverTime) transforms.push({ fieldPath: pre + k, setToServerValue: 'REQUEST_TIME' });
      else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) walk(v, pre + k + '.');
    }
  })(data, '');
  const w = { update: { name: docName(T, path), fields: encFields(data) } };
  if (opt.merge) {
    // merge: 書いたフィールド（map は中の葉まで）だけを変える
    const paths = [];
    (function walk(o, pre) {
      for (const [k, v] of Object.entries(o)) {
        if (v && v.__serverTime) continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length) walk(v, pre + '`' + k + '`.');
        else paths.push(pre + '`' + k + '`');
      }
    })(data, '');
    w.updateMask = { fieldPaths: paths };
  }
  if (transforms.length) w.updateTransforms = transforms;
  return fsReq(T, 'POST', fsUrl(T, ':commit'), { writes: [w] }, user);
}
async function fsDelete(T, path, user) {
  return fsReq(T, 'POST', fsUrl(T, ':commit'), { writes: [{ delete: docName(T, path) }] }, user);
}
async function fsGet(T, path, user) {
  const r = await fsReq(T, 'GET', fsUrl(T, '/' + path), undefined, user);
  if (r.ok && r.body && r.body.fields) r.data = dec({ mapValue: { fields: r.body.fields } });
  return r;
}
// list（コレクションのクエリ）。limit を省くと上限なし。orderBy は 's' の降順など
async function fsList(T, parent, collection, user, opt = {}) {
  const sq = { from: [{ collectionId: collection }] };
  if (opt.limit) sq.limit = opt.limit;
  if (opt.orderBy) sq.orderBy = [{ field: { fieldPath: opt.orderBy }, direction: 'DESCENDING' }];
  const url = fsUrl(T, (parent ? '/' + parent : '') + ':runQuery');
  const r = await fsReq(T, 'POST', url, { structuredQuery: sq }, user);
  // runQuery はエラーを配列の中で返すことがある
  if (r.ok && Array.isArray(r.body) && r.body.some(x => x.error)) r.ok = false;
  return r;
}

module.exports = { LIVE, emulatorTarget, signUp, rtdb, TS, SERVER_TIME, fsSet, fsDelete, fsGet, fsList };
