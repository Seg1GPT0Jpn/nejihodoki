#!/usr/bin/env node
// osm-city.js: builds the real-map city data of あなぼこシティ (hole/cities/<id>.json) from OpenStreetMap + GSI elevation.
//
//   node tools/osm-city.js [id ...] [--cache DIR] [--refetch] [--list]
//
// Sources (fetched once, cached under --cache, default $OSM_CACHE or ./.osm-cache):
//   - OpenStreetMap API 0.6 /map (tiles of about 0.01° x 0.008°)    © OpenStreetMap contributors, ODbL 1.0
//   - GSI elevation tiles dem5a_png z15 (fallback dem_png z14)     国土地理院 標高タイル
// Output (one compact JSON per city, loaded on demand by hole/index.html):
//   { v, id, name, src, c:[lat,lon], q, r:[x0,z0,x1,z1], hg:{x0,z0,s,nx,nz,d}, b:[...], rd:[...], rl:[...], ar:[...], wl:[...], tr:[...], lb:[...], en:[...] }
//   coordinates: metres east (x) and south (z) of the centre, quantised to q metres (integers), polylines delta coded.
//   b  building   [kind, height dm, min_height dm, flags, n, x0, z0, dx, dz, ...]      flags: 1 roof only (canopy), 8 dome / sphere
//   rd road       [class, width dm, layer, n, x0, z0, dx, dz, ...]
//   rl railway    [class (+10 service track), layer (-1 tunnel, 0, 1 bridge), operator (1 JR, 2 Odakyu, 3 Enoden, 4 Keikyu, 5 Sotetsu, 6 Yokohama subway), n, pts...]
//   ar area       [class, n, pts...]            (outer rings only; holes are dropped, the converter splits nothing)
//   wl waterway   [width dm, n, pts...]
//   tr trees      [x, z, x, z, ...]
//   lb labels     [[name, x, z, kind]]          (public names only: stations, schools, rivers, parks, public buildings)
//   en points     [[x, z, kind, angle, (width dm)]]  kind 1 subway entrance, 2 station entrance, 3 bus stop, 4 traffic signal, 5 zebra crossing
//   hg elevation  grid of nx * nz heights in dm, row-major from (x0,z0) every s metres, delta coded along rows
// The other cities can be redone with the same tool: add an entry to CITIES below.
'use strict';
const fs = require('fs'), path = require('path'), https = require('https'), zlib = require('zlib');

const CITIES = {
  fujisawa: { name: '藤沢', c: [35.33867, 139.48760], R: 1000 },
  // overrides: the building whose centroid is nearest to [x, z] (within 25 m) gets these values
  // 湘南台文化センター: the hall around the globe is about 3 floors (the globe dome rises above it)
  shonandai: { name: '湘南台', c: [35.39655, 139.46680], R: 1000, fix: [{ at: [267, -121], h: 13 }] },
  kamiooka: { name: '上大岡', c: [35.40880, 139.59630], R: 1200, fix: [{ at: [8, 76], h: 120, kind: 4 }] },
  // the school and the commuting route to 藤沢本町駅 (box: west/east/north/south metres from the centre)
  shonanhs: { name: '湘南高校付近', c: [35.34610, 139.47470], box: [-650, -700, 650, 600] },
};
const Q = 0.5; // metres per unit in the output

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const CACHE = opt('--cache') || process.env.OSM_CACHE || path.join(process.cwd(), '.osm-cache');
const REFETCH = argv.includes('--refetch');
const OUT = path.join(__dirname, '..', 'hole', 'cities');
const want = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--c'));

// ---------------------------------------------------------------- fetching (cached)
function get(url, bin) {
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'nejihodoki-osm-city/1.0 (game map converter)' }, timeout: 120000 }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return res(get(r.headers.location, bin)); }
      const ch = []; r.on('data', d => ch.push(d)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(ch) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function cached(file, url) {
  if (!REFETCH && fs.existsSync(file)) return fs.readFileSync(file);
  for (let k = 0; k < 5; k++) {
    try {
      const r = await get(url);
      if (r.status === 200) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, r.body); return r.body; }
      if (r.status === 404) return null;
      console.warn('  http', r.status, url);
    } catch (e) { console.warn('  ' + e.message, url); }
    await sleep(2000 * (k + 1));
  }
  throw new Error('fetch failed: ' + url);
}

// ---------------------------------------------------------------- tiny OSM XML parser
function parseOsm(xml, D) {
  const s = xml.toString('utf8');
  const re = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  const attr = (a, k) => { const m = new RegExp('\\b' + k + '="([^"]*)"').exec(a); return m ? m[1] : null; };
  const unesc = t => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let m;
  while ((m = re.exec(s))) {
    const type = m[1], a = m[2], body = m[4] || '', id = attr(a, 'id');
    const tags = {}; let t; const tre = /<tag k="([^"]*)" v="([^"]*)"\s*\/>/g;
    while ((t = tre.exec(body))) tags[unesc(t[1])] = unesc(t[2]);
    if (type === 'node') D.nodes.set(id, { lat: +attr(a, 'lat'), lon: +attr(a, 'lon'), tags });
    else if (type === 'way') { const nd = []; const nre = /<nd ref="(\d+)"/g; while ((t = nre.exec(body))) nd.push(t[1]); D.ways.set(id, { nd, tags }); }
    else { const mem = []; const mre = /<member type="(\w+)" ref="(\d+)" role="([^"]*)"/g; while ((t = mre.exec(body))) mem.push({ type: t[1], ref: t[2], role: t[3] }); D.rels.set(id, { mem, tags }); }
  }
}

// ---------------------------------------------------------------- PNG (8-bit RGB / RGBA) decoder for the elevation tiles
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8) throw new Error('png depth'); }
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0; if (!bpp) throw new Error('png colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), st = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], src = y * (st + 1) + 1, dst = y * st;
    for (let i = 0; i < st; i++) {
      const x = raw[src + i], a = i >= bpp ? out[dst + i - bpp] : 0, b = y ? out[dst - st + i] : 0, c = y && i >= bpp ? out[dst - st + i - bpp] : 0;
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

// ---------------------------------------------------------------- geometry helpers
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], az = pts[a][1], dx = pts[b][0] - ax, dz = pts[b][1] - az, L = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
function simplifyRing(pts, tol) {
  // ring without the closing point; split at the farthest point pair so both halves simplify well
  if (pts.length < 5) return pts;
  let far = 0, fd = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = simplify(pts.slice(0, far + 1), tol), b = simplify(pts.slice(far).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
const area = pts => { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return s / 2; };
const centroid = pts => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
function clipPoly(pts, x0, z0, x1, z1) {
  const edge = (P, inside, inter) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(inter(a, b)); } return out; };
  const lx = (a, b, x) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])], lz = (a, b, z) => [a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]), z];
  let P = pts;
  P = edge(P, p => p[0] >= x0, (a, b) => lx(a, b, x0)); if (P.length < 3) return [];
  P = edge(P, p => p[0] <= x1, (a, b) => lx(a, b, x1)); if (P.length < 3) return [];
  P = edge(P, p => p[1] >= z0, (a, b) => lz(a, b, z0)); if (P.length < 3) return [];
  P = edge(P, p => p[1] <= z1, (a, b) => lz(a, b, z1)); return P.length < 3 ? [] : P;
}
function clipLine(pts, x0, z0, x1, z1) {
  // split a polyline into the runs inside the box (segments clipped exactly)
  const runs = []; let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    let [ax, az] = pts[i], [bx, bz] = pts[i + 1], t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az; let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { cur = null; continue; }
    const A = [ax + dx * t0, az + dz * t0], Bp = [ax + dx * t1, az + dz * t1];
    if (!cur || t0 > 0) { cur = [A]; runs.push(cur); }
    cur.push(Bp); if (t1 < 1) cur = null;
  }
  return runs.filter(r => r.length >= 2);
}
// join way node lists into closed rings (multipolygon members)
function rings(lists) {
  const out = [], L = lists.map(l => l.slice());
  while (L.length) {
    let r = L.shift();
    for (let guard = 0; guard < 500 && r[0] !== r[r.length - 1]; guard++) {
      const end = r[r.length - 1]; let k = L.findIndex(l => l[0] === end || l[l.length - 1] === end);
      if (k < 0) break;
      let l = L.splice(k, 1)[0]; if (l[0] !== end) l = l.reverse(); r = r.concat(l.slice(1));
    }
    if (r[0] === r[r.length - 1] && r.length >= 4) out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- classification
const ROAD = { // class id, default width (m)
  motorway: [1, 14], trunk: [1, 13], primary: [1, 12], secondary: [2, 10], tertiary: [3, 8], unclassified: [4, 5.5], residential: [4, 5],
  living_street: [4, 4.2], service: [5, 3.8], pedestrian: [6, 6], footway: [7, 2.2], path: [7, 1.8], steps: [8, 2.2], cycleway: [7, 2.2], track: [5, 3],
  motorway_link: [2, 7], trunk_link: [2, 7], primary_link: [2, 7], secondary_link: [3, 6], tertiary_link: [3, 5.5],
};
// building kinds (index): 0 generic, 1 house, 2 apartments, 3 commercial / retail, 4 office, 5 station, 6 school, 7 public (civic, hall, hospital),
// 8 industrial / warehouse, 9 temple / shrine, 10 garage / shed, 11 roof (canopy)
function bkind(t) {
  const b = t.building || t['building:part'] || 'yes';
  if (b === 'house' || b === 'detached' || b === 'semidetached_house' || b === 'terrace') return 1;
  if (b === 'apartments' || b === 'residential' || b === 'dormitory') return 2;
  if (b === 'commercial' || b === 'retail' || b === 'supermarket' || b === 'hotel' || t.shop) return 3;
  if (b === 'office') return 4;
  if (b === 'train_station' || b === 'station' || t.railway === 'station' || t.public_transport === 'station') return 5;
  if (b === 'school' || b === 'university' || b === 'college' || b === 'kindergarten' || t.amenity === 'school') return 6;
  if (b === 'public' || b === 'civic' || b === 'government' || b === 'hospital' || b === 'townhall' || t.amenity === 'townhall' || t.amenity === 'community_centre' || t.amenity === 'hospital' || t.amenity === 'library' || t.amenity === 'arts_centre') return 7;
  if (b === 'industrial' || b === 'warehouse' || b === 'factory') return 8;
  if (b === 'temple' || b === 'shrine' || b === 'church' || t.amenity === 'place_of_worship') return 9;
  if (b === 'garage' || b === 'garages' || b === 'shed' || b === 'hut' || b === 'carport' || b === 'kiosk') return 10;
  if (b === 'roof') return 11;
  return 0;
}
function parseLen(v) { if (!v) return null; const m = /^\s*([\d.]+)/.exec(v); return m ? +m[1] : null; }
// deterministic per-id noise
function hash(id) { let h = 2166136261; for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }
function bheight(t, kind, a, id, inLanduse) {
  const h = parseLen(t.height), lv = parseLen(t['building:levels']), rh = parseLen(t['roof:height']) || 0;
  if (h) return h;
  if (lv) return lv * 3.2 + (kind === 1 ? 1.6 : 0.8) + rh;
  const r = hash(id);
  switch (kind) {
    case 1: return 6.5 + r * 2;
    case 2: return a > 500 ? 15 + r * 12 : a > 200 ? 10 + r * 6 : 7 + r * 3;
    case 3: return a > 2000 ? 18 + r * 10 : a > 400 ? 10 + r * 8 : 7 + r * 5;
    case 4: return a > 600 ? 24 + r * 16 : 12 + r * 8;
    case 5: return 13;
    case 6: return 14 + r * 3;
    case 7: return a > 1000 ? 16 + r * 6 : 10 + r * 4;
    case 8: return 8 + r * 4;
    case 9: return 7 + r * 2;
    case 10: return 2.6 + r * 0.6;
    case 11: return 4.5;
  }
  // generic "yes": by footprint size and surroundings (the imported Japanese footprints have no levels)
  if (a < 30) return 2.8 + r;
  if (a < 160) return inLanduse === 'commercial' || inLanduse === 'retail' ? 8 + r * 6 : 6.2 + r * 2.2;
  if (a < 500) return inLanduse === 'commercial' || inLanduse === 'retail' ? 12 + r * 10 : 8 + r * 5;
  if (a < 2000) return 12 + r * 10;
  return 15 + r * 12;
}
const AREA = { // class ids for ground areas
  park: 1, garden: 1, playground: 1, pitch: 2, grass: 3, village_green: 3, meadow: 3, wood: 4, forest: 4, scrub: 4, water: 5, reservoir: 5, basin: 5,
  school: 6, university: 6, college: 6, kindergarten: 6, parking: 7, railway: 8, pedestrian: 9, platform: 10, cemetery: 11, farmland: 12, orchard: 12,
  commercial: 13, retail: 13, residential: 14, industrial: 15, construction: 16, sand: 17, beach: 17, track: 2, sports_centre: 2, stadium: 2, golf_course: 3,
};
function areaClass(t) {
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.water) return AREA.water;
  if (t.landuse === 'reservoir' || t.landuse === 'basin') return AREA.water;
  if (t.leisure && AREA[t.leisure]) return AREA[t.leisure];
  if (t.amenity === 'school' || t.amenity === 'university' || t.amenity === 'college' || t.amenity === 'kindergarten') return AREA.school;
  if (t.amenity === 'parking' && t.parking !== 'underground' && t.parking !== 'multi-storey') return AREA.parking;
  if (t.amenity === 'grave_yard') return AREA.cemetery;
  if (t.railway === 'platform' || t.public_transport === 'platform') return AREA.platform;
  if (t.highway === 'pedestrian' || t['area:highway'] === 'pedestrian' || t['area:highway'] === 'footway' || t.place === 'square') return AREA.pedestrian;
  if (t['area:highway']) return 18; // carriageway areas
  if (t.natural && AREA[t.natural]) return AREA[t.natural];
  if (t.landuse && AREA[t.landuse]) return AREA[t.landuse];
  if (t.landuse === 'grass' || t.landuse === 'recreation_ground') return AREA.grass;
  return 0;
}

// ---------------------------------------------------------------- one city
async function build(id) {
  const C = CITIES[id];
  const [lat0, lon0] = C.c, KX = 111320 * Math.cos(lat0 * Math.PI / 180), KZ = 110950;
  const box = C.box || [-C.R, -C.R, C.R, C.R];
  const M = 60; // fetch margin (m)
  const la1 = lat0 - (box[1] - M) / KZ, la0 = lat0 - (box[3] + M) / KZ, lo0 = lon0 + (box[0] - M) / KX, lo1 = lon0 + (box[2] + M) / KX;
  const D = { nodes: new Map(), ways: new Map(), rels: new Map() };
  const TW = 0.01, TH = 0.008;
  const tiles = [];
  for (let la = Math.floor(la0 / TH) * TH; la < la1; la += TH) for (let lo = Math.floor(lo0 / TW) * TW; lo < lo1; lo += TW) tiles.push([+lo.toFixed(4), +la.toFixed(4), +(lo + TW).toFixed(4), +(la + TH).toFixed(4)]);
  console.log(id + ': ' + tiles.length + ' OSM tiles');
  for (const t of tiles) {
    const f = path.join(CACHE, 'osm', t.join('_') + '.xml');
    const xml = await cached(f, 'https://api.openstreetmap.org/api/0.6/map?bbox=' + t.join(','));
    parseOsm(xml, D);
  }
  const P = n => [(n.lon - lon0) * KX, (lat0 - n.lat) * KZ];
  const wayPts = w => { const out = []; for (const r of w.nd) { const n = D.nodes.get(r); if (n) out.push(P(n)); } return out; };
  const [X0, Z0, X1, Z1] = box;
  const inBox = (x, z, m) => x >= X0 - (m || 0) && x <= X1 + (m || 0) && z >= Z0 - (m || 0) && z <= Z1 + (m || 0);
  const qv = v => Math.round(v / Q);
  const enc = pts => { const o = [pts.length]; let px = 0, pz = 0; for (const p of pts) { const x = qv(p[0]), z = qv(p[1]); o.push(x - px, z - pz); px = x; pz = z; } return o; };
  const dedupe = pts => { const o = []; for (const p of pts) { const l = o[o.length - 1]; if (!l || qv(l[0]) !== qv(p[0]) || qv(l[1]) !== qv(p[1])) o.push(p); } return o; };

  // ---- area polygons (ways + multipolygon relations), collected first: buildings look up their landuse
  const areas = [], landuseOf = [];
  const relWays = new Set();
  for (const [rid, r] of D.rels) {
    if (r.tags.type !== 'multipolygon') continue;
    const outer = r.mem.filter(m => m.type === 'way' && m.role !== 'inner').map(m => D.ways.get(m.ref)).filter(Boolean);
    for (const m of r.mem) if (m.type === 'way') relWays.add(m.ref);
    const rr = rings(outer.map(w => w.nd));
    for (const ring of rr) {
      const pts = ring.slice(0, -1).map(k => D.nodes.get(k)).filter(Boolean).map(P);
      if (pts.length >= 3) areas.push({ tags: r.tags, pts, id: 'r' + rid });
    }
  }
  for (const [wid, w] of D.ways) {
    if (w.nd.length < 4 || w.nd[0] !== w.nd[w.nd.length - 1]) continue;
    const t = w.tags; if (!Object.keys(t).length) continue;
    const pts = wayPts(w).slice(0, -1); if (pts.length < 3) continue;
    areas.push({ tags: t, pts, id: wid, way: true });
  }
  function pointIn(pts, x, z) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  for (const a of areas) if (a.tags.landuse && !a.tags.building) landuseOf.push(a);

  // ---- buildings
  const B = [], stats = { b: 0, rd: 0, rl: 0, ar: 0 };
  const lmIds = new Set();
  for (const a of areas) {
    const t = a.tags;
    if (!(t.building || t['building:part'])) continue;
    if (t.building === 'no' || t['building:part'] === 'no') continue;
    if (t.location === 'underground' || t['building:part'] === 'roof' && false) continue;
    const c = centroid(a.pts); if (!inBox(c[0], c[1])) continue;
    let pts = simplifyRing(dedupe(a.pts), 0.35);
    if (pts.length < 3) continue;
    let A = area(pts); if (Math.abs(A) < 6) continue;
    if (A < 0) pts = pts.slice().reverse(); // counter-clockwise in x/z (z = south)
    A = Math.abs(A);
    const kind = bkind(t);
    let lu = null; for (const L of landuseOf) if (pointIn(L.pts, c[0], c[1])) { lu = L.tags.landuse; break; }
    let h = bheight(t, kind, A, a.id, lu);
    let mh = parseLen(t.min_height) || (parseLen(t['building:min_level']) ? parseLen(t['building:min_level']) * 3.2 : 0);
    let flags = kind === 11 ? 1 : 0;
    if (kind === 11 && !t.height) { mh = mh || 3.6; h = mh + 0.6; }
    if (t['building:part'] && !t.building) flags |= 4;
    // a station building over the tracks (橋上駅舎, layer 1): lift it so the trains run underneath
    if (kind === 5 && parseLen(t.layer) >= 1 && !t.min_height) { mh = 6.5; h = Math.max(h, 15); }
    if (t.amenity === 'planetarium' || t['roof:shape'] === 'dome' || t.building === 'dome') flags |= 8;
    B.push({ kind, h, mh, flags, pts, A, id: a.id, tags: t });
  }
  // a building that has building:part pieces inside it is drawn by its parts (drop the outline when parts cover it)
  const parts = B.filter(b => b.flags & 4);
  const outB = B.filter(b => {
    if (b.flags & 4) return true;
    if (!parts.length) return true;
    const c = centroid(b.pts); let cov = 0;
    for (const p of parts) { const pc = centroid(p.pts); if (pointIn(b.pts, pc[0], pc[1])) cov += p.A; }
    return cov < b.A * 0.6;
  });
  for (const f of C.fix || []) {
    let best = null, bd = 25; for (const b of outB) { const c = centroid(b.pts), d = Math.hypot(c[0] - f.at[0], c[1] - f.at[1]); if (d < bd) { bd = d; best = b; } }
    if (best) { if (f.h != null) best.h = f.h; if (f.kind != null) best.kind = f.kind; if (f.mh != null) best.mh = f.mh; } else console.warn('  fix not found', f.at);
  }
  outB.sort((a, b) => (a.pts[0][1] - b.pts[0][1]) || (a.pts[0][0] - b.pts[0][0]));
  const bOut = [];
  for (const b of outB) { bOut.push([b.kind, Math.round(b.h * 10), Math.round(b.mh * 10), b.flags & 11, ...enc(b.pts)]); stats.b++; }

  // ---- roads, railways, waterways, trees
  const rd = [], rl = [], wl = [];
  for (const [wid, w] of D.ways) {
    const t = w.tags;
    if (t.highway && ROAD[t.highway] && t.area !== 'yes') {
      if (t.tunnel === 'yes' || t.tunnel === 'building_passage' && false) continue;
      if (t.access === 'private' && t.highway === 'service' && false) continue;
      const [cls, dw] = ROAD[t.highway];
      let wdt = parseLen(t.width) || (t.lanes ? Math.max(dw, +t.lanes * 3.1) : dw);
      if (cls >= 7 && t.footway === 'sidewalk') continue; // the sidewalks are drawn with the roads
      if (cls >= 7 && t.footway === 'crossing') continue;
      wdt = Math.min(30, Math.max(1, wdt));
      const layer = t.bridge && t.bridge !== 'no' ? Math.max(1, parseLen(t.layer) || 1) : 0;
      for (const run of clipLine(simplify(dedupe(wayPts(w)), 0.6), X0, Z0, X1, Z1)) { if (run.length < 2) continue; rd.push([cls, Math.round(wdt * 10), layer, ...enc(run)]); stats.rd++; }
      if (t.highway === 'footway' || t.highway === 'path' || t.highway === 'steps') w.__foot = 1;
    } else if (t.railway && /^(rail|light_rail|subway|monorail|tram|narrow_gauge)$/.test(t.railway)) {
      const cls = { rail: 1, light_rail: 1, narrow_gauge: 1, tram: 2, subway: 3, monorail: 4 }[t.railway];
      const layer = t.tunnel && t.tunnel !== 'no' || parseLen(t.layer) < 0 && t.railway === 'subway' ? -1 : (t.bridge && t.bridge !== 'no') || +t.layer >= 1 ? 1 : 0;
      const sv = t.service ? 1 : 0, nm = (t.name || '') + (t.operator || '');
      const op = /東海道|東日本旅客/.test(nm) ? 1 : /小田急/.test(nm) ? 2 : /江ノ島電鉄|江ノ電/.test(nm) ? 3 : /京急|京浜急行/.test(nm) ? 4 : /相鉄|相模鉄道/.test(nm) ? 5 : /横浜市|ブルーライン/.test(nm) ? 6 : 0;
      for (const run of clipLine(simplify(dedupe(wayPts(w)), 0.4), X0, Z0, X1, Z1)) { rl.push([cls + sv * 10, layer, op, ...enc(run)]); stats.rl++; }
    } else if (t.waterway && /^(river|stream|canal|drain|ditch)$/.test(t.waterway) && t.tunnel !== 'culvert' && t.tunnel !== 'yes') {
      const wdt = parseLen(t.width) || { river: 12, canal: 8, stream: 3, drain: 2, ditch: 1.5 }[t.waterway];
      for (const run of clipLine(simplify(dedupe(wayPts(w)), 1), X0, Z0, X1, Z1)) wl.push([Math.round(wdt * 10), ...enc(run)]);
    }
  }
  // ---- ground areas
  const ar = [];
  for (const a of areas) {
    const t = a.tags; if (t.building || t['building:part']) continue;
    let cls = areaClass(t); if (!cls) continue;
    if (t.location === 'underground' || t.tunnel === 'yes' || t.layer && +t.layer < 0) continue;
    if (cls === AREA.parking && (t.parking === 'multi-storey' || t.parking === 'rooftop')) continue;
    const pts = clipPoly(simplifyRing(dedupe(a.pts), cls === AREA.platform || cls === AREA.pedestrian || cls === 18 ? 0.3 : 0.9), X0, Z0, X1, Z1);
    if (pts.length < 3 || Math.abs(area(pts)) < 8) continue;
    let layer = t.bridge === 'yes' || (+t.layer > 0 && (cls === AREA.pedestrian || cls === 18)) ? 1 : 0;
    if (cls === AREA.platform && t.covered === 'yes') layer = 2; // platform with a roof
    ar.push([cls + layer * 100, ...enc(area(pts) < 0 ? pts.slice().reverse() : pts)]); stats.ar++;
  }
  // big areas first (drawn under the small ones)
  ar.sort((a, b) => Math.abs(dArea(b)) - Math.abs(dArea(a)));
  function dArea(rec) { const pts = []; let x = 0, z = 0; for (let i = 2; i < rec.length; i += 2) { x += rec[i]; z += rec[i + 1]; pts.push([x, z]); } return area(pts); }
  const tr = [];
  for (const [nid, n] of D.nodes) {
    if (n.tags.natural !== 'tree') continue; const [x, z] = P(n); if (!inBox(x, z)) continue; tr.push(qv(x), qv(z));
  }
  for (const [wid, w] of D.ways) {
    if (w.tags.natural !== 'tree_row') continue;
    const pts = wayPts(w); for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); for (let s = 0; s < L; s += 8) { const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * s / L, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s / L; if (inBox(x, z)) tr.push(qv(x), qv(z)); } }
  }
  // ---- labels (public names) and subway entrances
  const lb = [], en = [], seenL = new Set();
  const hwOf = new Map(); // node id -> a highway way through it (for the direction of crossings)
  for (const [wid, w] of D.ways) if (w.tags.highway && ROAD[w.tags.highway] && ROAD[w.tags.highway][0] <= 6) for (let i = 0; i < w.nd.length; i++) if (!hwOf.has(w.nd[i])) hwOf.set(w.nd[i], [w, i]);
  const dirAt = nid => { const e = hwOf.get(nid); if (!e) return null; const [w, i] = e; const a = D.nodes.get(w.nd[Math.max(0, i - 1)]), b = D.nodes.get(w.nd[Math.min(w.nd.length - 1, i + 1)]); if (!a || !b || a === b) return null; const pa = P(a), pb = P(b); return [Math.atan2(pb[1] - pa[1], pb[0] - pa[0]), ROAD[w.tags.highway][1], w.tags]; };
  const addL = (name, x, z, kind) => { if (!name || !inBox(x, z) || seenL.has(name + kind)) return; seenL.add(name + kind); lb.push([name, Math.round(x), Math.round(z), kind]); };
  for (const [nid, n] of D.nodes) {
    const t = n.tags, [x, z] = P(n);
    if (t.railway === 'station' && t.name) addL(t.name.replace(/駅$/, '') + '駅', x, z, 'station');
    if (!inBox(x, z)) continue;
    if (t.railway === 'subway_entrance' || t.entrance === 'subway' || (t.railway === 'train_station_entrance')) en.push([Math.round(x), Math.round(z), t.railway === 'subway_entrance' ? 1 : 2, 0]);
    else if (t.highway === 'bus_stop') { const d = dirAt(nid); en.push([Math.round(x), Math.round(z), 3, d ? +d[0].toFixed(2) : 0]); }
    else if (t.highway === 'traffic_signals') { const d = dirAt(nid); en.push([Math.round(x), Math.round(z), 4, d ? +d[0].toFixed(2) : 0]); }
    else if (t.highway === 'crossing' || t.crossing === 'zebra' || t.crossing === 'marked' || t.crossing === 'traffic_signals') { const d = dirAt(nid); if (d && t.crossing !== 'unmarked') en.push([Math.round(x * 2) / 2, Math.round(z * 2) / 2, 5, +d[0].toFixed(2), Math.round((parseLen(d[2].width) || (d[2].lanes ? +d[2].lanes * 3.1 : d[1])) * 10)]); }
  }
  for (const a of areas) {
    const t = a.tags, c = centroid(a.pts);
    if (!t.name) continue;
    if (t.amenity === 'school' || t.amenity === 'university') addL(t.name, c[0], c[1], 'school');
    else if (t.leisure === 'park') addL(t.name, c[0], c[1], 'park');
    else if (t.amenity === 'townhall' || t.amenity === 'community_centre' || t.amenity === 'arts_centre' || t.amenity === 'library' || t.building === 'civic' || t.building === 'public' || t.amenity === 'hospital') addL(t.name, c[0], c[1], 'public');
    else if (t.amenity === 'place_of_worship') addL(t.name, c[0], c[1], 'shrine');
    else if (t.building === 'train_station' || t.railway === 'station') addL(t.name, c[0], c[1], 'stationb');
  }
  for (const [wid, w] of D.ways) {
    const t = w.tags; if (!t.name) continue;
    if (t.waterway === 'river' || t.waterway === 'canal') { const p = wayPts(w); const m = p[p.length >> 1]; if (m) addL(t.name, m[0], m[1], 'river'); }
  }
  // ---- elevation (GSI): dem5a z15, falling back to dem z14
  const S = 20, hx0 = Math.floor(X0 / S) * S - S, hz0 = Math.floor(Z0 / S) * S - S, nx = Math.ceil((X1 - hx0) / S) + 2, nz = Math.ceil((Z1 - hz0) / S) + 2;
  const tileCache = new Map();
  async function demTile(z, x, y, kind) {
    const k = kind + z + '/' + x + '/' + y; if (tileCache.has(k)) return tileCache.get(k);
    const buf = await cached(path.join(CACHE, 'dem', kind, z + '_' + x + '_' + y + '.png'), 'https://cyberjapandata.gsi.go.jp/xyz/' + kind + '/' + z + '/' + x + '/' + y + '.png');
    const img = buf ? decodePng(buf) : null; tileCache.set(k, img); return img;
  }
  async function elev(lat, lon) {
    for (const [kind, z] of [['dem5a_png', 15], ['dem_png', 14]]) {
      const n = 2 ** z, fx = (lon + 180) / 360 * n, lr = lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
      const tx = Math.floor(fx), ty = Math.floor(fy), img = await demTile(z, tx, ty, kind); if (!img) continue;
      const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256)), o = (py * 256 + px) * img.bpp;
      const v = img.data[o] * 65536 + img.data[o + 1] * 256 + img.data[o + 2];
      if (v === 8388608) continue;
      return (v < 8388608 ? v : v - 16777216) * 0.01;
    }
    return null;
  }
  const hv = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = hx0 + i * S, z = hz0 + j * S;
    hv.push(await elev(lat0 - z / KZ, lon0 + x / KX));
  }
  // holes in the data (water, missing tiles): nearest valid neighbour average
  for (let it = 0; it < 50 && hv.some(v => v == null); it++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (hv[k] != null) continue; let s = 0, c = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const v = hv[jj * nx + ii]; if (v != null) { s += v; c++; } }
      if (c) hv[k] = s / c;
    }
  }
  const base = Math.min(...hv.map(v => v == null ? 1e9 : v));
  const hd = []; for (let j = 0; j < nz; j++) { let p = 0; for (let i = 0; i < nx; i++) { const v = Math.round(((hv[j * nx + i] == null ? base : hv[j * nx + i]) - base) * 10); hd.push(v - p); p = v; } }

  const out = { v: 1, id, name: C.name, src: '© OpenStreetMap contributors (ODbL), 国土地理院 標高タイル', c: C.c, q: Q, r: box,
    hg: { x0: hx0, z0: hz0, s: S, nx, nz, base: Math.round(base * 10) / 10, d: hd }, b: bOut, rd, rl, ar, wl, tr, lb, en };
  fs.mkdirSync(OUT, { recursive: true });
  const js = JSON.stringify(out);
  fs.writeFileSync(path.join(OUT, id + '.json'), js);
  const gz = zlib.gzipSync(js, { level: 9 }).length;
  console.log(`${id}: buildings ${stats.b}, roads ${stats.rd}, rails ${stats.rl}, areas ${stats.ar}, trees ${tr.length / 2}, labels ${lb.length}, entrances ${en.length}, ` +
    `elev ${nx}x${nz} (${base.toFixed(1)}..${Math.max(...hv).toFixed(1)} m) → ${(js.length / 1024).toFixed(0)} KB (${(gz / 1024).toFixed(0)} KB gz)`);
  return out;
}

(async () => {
  if (argv.includes('--list')) { for (const k in CITIES) console.log(k, CITIES[k].name, CITIES[k].c.join(','), CITIES[k].R || CITIES[k].box); return; }
  const ids = want.length ? want : Object.keys(CITIES);
  for (const id of ids) { if (!CITIES[id]) throw new Error('unknown city ' + id); await build(id); }
})().catch(e => { console.error(e); process.exit(1); });
