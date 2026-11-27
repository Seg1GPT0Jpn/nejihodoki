// ぽかぽか島スポーツ：3D の島を描く小さな WebGL の描画器（自作。外部ライブラリなし）。window.SportsGL
// 高さの地図（world.js）を、色つきの三角形にして描く。空・霧・波の海・雲・木・ランドマーク・飛行機。時間帯と天気で光が変わる。
// 画質は自動でさがる（解像度のスケール・描く距離）。GL がなければ create() は null を返す。
(function (root) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  // ---------- 行列 ----------
  const M = {
    persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2), r = new Float32Array(16); r[0] = t / a; r[5] = t; r[10] = (fa + n) / (n - fa); r[11] = -1; r[14] = 2 * fa * n / (n - fa); return r; },
    mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    ident() { const r = new Float32Array(16); r[0] = r[5] = r[10] = r[15] = 1; return r; },
    // 位置・向き（yaw 北=+z から右へ、pitch 上向き正、roll 右バンク正）・大きさ から モデル行列
    model(x, y, z, yaw, pitch, roll, s) { s = s == null ? 1 : s; const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      // R = Ry(yaw) * Rx(-pitch) * Rz(-roll)  （前は +z）
      const r00 = cy * cr + sy * sp * sr, r01 = -cy * sr + sy * sp * cr, r02 = sy * cp, r10 = cp * sr, r11 = cp * cr, r12 = sp, r20 = -sy * cr + cy * sp * sr, r21 = sy * sr + cy * sp * cr, r22 = cy * cp;
      const m = new Float32Array(16); m[0] = r00 * s; m[1] = r10 * s; m[2] = r20 * s; m[4] = r01 * s; m[5] = r11 * s; m[6] = r21 * s; m[8] = r02 * s; m[9] = r12 * s; m[10] = r22 * s; m[12] = x; m[13] = y; m[14] = z; m[15] = 1; return m; },
  };
  // カメラの向き：yaw と pitch から forward/right/up
  function basis(yaw, pitch, roll) { const cp = Math.cos(pitch), f = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp]; let r = [Math.cos(yaw), 0, -Math.sin(yaw)]; let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; // up = right x forward の逆向きにならないよう
    u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]]; if (u[1] < 0) u = u.map(v => -v);
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll), r2 = r.map((v, i) => v * c + u[i] * s), u2 = u.map((v, i) => v * c - r[i] * s); r = r2; u = u2; } return { f, r, u }; }
  function view(cam) { const b = basis(cam.yaw, cam.pitch, cam.roll || 0), e = [cam.x, cam.y, cam.z], v = new Float32Array(16); const d = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    v[0] = b.r[0]; v[4] = b.r[1]; v[8] = b.r[2]; v[12] = -d(b.r, e); v[1] = b.u[0]; v[5] = b.u[1]; v[9] = b.u[2]; v[13] = -d(b.u, e); v[2] = -b.f[0]; v[6] = -b.f[1]; v[10] = -b.f[2]; v[14] = d(b.f, e); v[15] = 1; return { v, b }; }

  // ---------- メッシュを作る ----------
  function MB() { this.p = []; this.n = []; this.c = []; }
  MB.prototype.tri = function (a, b, c, col) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); } };
  MB.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  MB.prototype.box = function (x, y, z, w, h, d, col, rot) { const hw = w / 2, hd = d / 2, co = rot ? Math.cos(rot) : 1, si = rot ? Math.sin(rot) : 0; const P = (dx, dy, dz) => [x + dx * co - dz * si, y + dy, z + dx * si + dz * co];
    const v = [P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), P(-hw, 0, hd), P(-hw, h, -hd), P(hw, h, -hd), P(hw, h, hd), P(-hw, h, hd)];
    this.quad(v[4], v[7], v[6], v[5], col); this.quad(v[0], v[1], v[2], v[3], col); this.quad(v[0], v[4], v[5], v[1], col); this.quad(v[2], v[6], v[7], v[3], col); this.quad(v[1], v[5], v[6], v[2], col); this.quad(v[3], v[7], v[4], v[0], col); };
  MB.prototype.cone = function (x, y, z, r, h, col, seg, r2) { seg = seg || 7; r2 = r2 || 0; for (let i = 0; i < seg; i++) { const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU; const A = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], B = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], T0 = [x + Math.cos(a0) * r2, y + h, z + Math.sin(a0) * r2], T1 = [x + Math.cos(a1) * r2, y + h, z + Math.sin(a1) * r2];
    if (r2 > 0) { this.quad(A, T0, T1, B, col); this.tri([x, y + h, z], T1, T0, col); } else this.tri(A, [x, y + h, z], B, col); this.tri([x, y, z], B, A, col); } };
  MB.prototype.ell = function (x, y, z, rx, ry, rz, col, la, lo) { la = la || 5; lo = lo || 8; const pt = (i, j) => { const a = i / la * Math.PI, b = j / lo * TAU; return [x + Math.sin(a) * Math.cos(b) * rx, y + Math.cos(a) * ry, z + Math.sin(a) * Math.sin(b) * rz]; };
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1); if (i > 0) this.tri(a, d, c, col); if (i < la - 1) this.tri(a, c, b, col); if (i === 0) this.tri(a, d, c, col); } };
  MB.prototype.disk = function (x, y, z, r, col, seg) { seg = seg || 14; for (let i = 0; i < seg; i++) this.tri([x, y, z], [x + Math.cos((i + 1) / seg * TAU) * r, y, z + Math.sin((i + 1) / seg * TAU) * r], [x + Math.cos(i / seg * TAU) * r, y, z + Math.sin(i / seg * TAU) * r], col); };
  const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // 地面の色
  const CSAND = hex('#f1d896'), CSAND2 = hex('#d9b974'), CG0 = hex('#6fc766'), CG1 = hex('#3f9a4f'), CG2 = hex('#2c7a43'), CROCK = hex('#8d8478'), CASH = hex('#4a4543'), CLAVA = hex('#c4492a'), CSNOW = hex('#f4f4f2');
  function groundColor(h, sl, j) { let c; if (h < 1) c = CSAND2; else if (h < 5) c = mix(CSAND2, CSAND, clamp((h - 1) / 4, 0, 1)); else if (h < 9) c = mix(CSAND, CG0, clamp((h - 5) / 4, 0, 1)); else if (h < 50) c = mix(CG0, CG1, clamp((h - 9) / 40, 0, 1)); else if (h < 110) c = mix(CG1, CG2, clamp((h - 50) / 60, 0, 1)); else c = mix(CG2, CROCK, clamp((h - 110) / 40, 0, 1)); if (sl > 0.9) c = mix(c, CROCK, clamp((sl - 0.9) * 1.4, 0, 0.8)); if (h > 150) c = mix(c, CASH, clamp((h - 150) / 30, 0, 1)); if (h > 195) c = mix(c, CLAVA, clamp((h - 195) / 25, 0, 0.7)); const k = 0.94 + j * 0.1; return [c[0] * k, c[1] * k, c[2] * k]; }

  // ランドマークの見た目（すべてオリジナルの小さな建物・道具）
  const SPOTCOL = { archery: '#e5484d', disc: '#f5a524', bowling: '#7c5cff', kendo: '#2fb67c', hoops: '#ff7a33', golf: '#3aa655', canoe: '#1aa7c8', pingpong: '#e6567a', cycling: '#8a6bd6', jump: '#0b9be6', tennis: '#9ac12b' };
  function buildSpot(mb, m, w) {
    const x = m.x, z = m.z, y = m.y, col = hex(SPOTCOL[m.id] || '#ffffff'), wh = hex('#ffffff'), wd = hex('#b9824a'), dk = hex('#3a4a5a'), red = hex('#e5484d');
    if (SPOTCOL[m.id]) { mb.disk(x, y + 0.2, z, 30, mix(col, wh, 0.55)); mb.disk(x, y + 0.3, z, 22, mix(col, wh, 0.3)); mb.box(x + 22, y, z, 1.2, 22, 1.2, wh); mb.quad([x + 22, y + 22, z], [x + 22, y + 22, z + 8], [x + 22, y + 17, z + 8], [x + 22, y + 17, z], col); mb.quad([x + 22, y + 22, z], [x + 22, y + 17, z], [x + 22, y + 17, z + 8], [x + 22, y + 22, z + 8], col); }
    switch (m.id) {
      case 'archery': for (let i = 0; i < 3; i++) { mb.box(x - 10 + i * 10, y + 0.3, z - 14, 1, 5, 1, wd); mb.disk(x - 10 + i * 10, y + 5.5, z - 14.6, 3, red, 10); } break;
      case 'disc': mb.ell(x, y + 1, z, 10, 2, 10, hex('#7fdc79')); mb.ell(x + 4, y + 3, z - 3, 2.2, 1, 2.2, hex('#ff7a6b')); break;
      case 'bowling': mb.box(x, y, z, 26, 8, 14, hex('#ffffff')); mb.box(x, y + 8, z, 28, 2.4, 16, col); for (let i = 0; i < 3; i++) mb.cone(x - 6 + i * 6, y + 10.4, z, 1.4, 5, wh, 8); break;
      case 'kendo': mb.box(x, y, z, 22, 6, 16, wd); mb.cone(x, y + 6, z, 16, 8, hex('#c14b4b'), 4, 5); break;
      case 'hoops': mb.box(x - 6, y, z, 1, 11, 1, dk); mb.box(x - 6, y + 10, z, 0.5, 4, 6, wh); mb.box(x - 6.5, y + 10.4, z, 2.4, 0.4, 2.4, hex('#ff7a33')); mb.box(x + 6, y, z, 1, 11, 1, dk); break;
      case 'golf': mb.disk(x, y + 0.4, z, 16, hex('#58c868')); mb.box(x, y, z, 0.3, 9, 0.3, wh); mb.box(x + 1.2, y + 7, z, 2.4, 1.6, 0.2, red); break;
      case 'canoe': mb.box(x, y - 2.6, z, 4, 3, 36, wd); mb.ell(x + 8, y - 2, z + 14, 1.8, 0.8, 5, col); mb.ell(x + 12, y - 2, z + 14, 1.8, 0.8, 5, hex('#ffd24d')); break;
      case 'pingpong': mb.box(x, y + 2.6, z, 9, 0.5, 5, hex('#1d6fb5')); for (const [a, b] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) mb.box(x + a, y, z + b, 0.5, 2.6, 0.5, dk); mb.cone(x, y + 6, z, 12, 6, mix(col, wh, 0.3), 6, 0.5); break;
      case 'cycling': for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, a2 = (i + 1) / 14 * TAU; mb.quad([x + Math.cos(a) * 26, y + 0.6, z + Math.sin(a) * 16], [x + Math.cos(a2) * 26, y + 0.6, z + Math.sin(a2) * 16], [x + Math.cos(a2) * 21, y + 0.6, z + Math.sin(a2) * 12], [x + Math.cos(a) * 21, y + 0.6, z + Math.sin(a) * 12], i % 2 ? hex('#9aa4ad') : hex('#a8b1b9')); } break;
      case 'jump': mb.quad([x - 14, y, z - 5], [x - 14, y, z + 5], [x + 6, y + 8, z + 5], [x + 6, y + 8, z - 5], wd); mb.box(x + 4, y, z, 4, 7.6, 10, hex('#8a5a2b')); break;
      case 'tennis': mb.box(x, y + 0.3, z, 40, 0.3, 20, hex('#d98648')); mb.box(x, y + 0.6, z, 0.3, 1.4, 20, wh); break;
      case 'town': { const cs = ['#ffd9a8', '#ff9a8a', '#a8d8ff', '#fff1a8', '#c8f0b0']; for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 12 + (i % 5) * 11 + i * 1.1, bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, hh = 7 + (i * 7 % 9); mb.box(bx, y, bz, 9, hh, 9, hex(cs[i % 5]), a); mb.cone(bx, y + hh, bz, 7, 4, hex(i % 2 ? '#d9573f' : '#3a7ab8'), 4, 0.4); } mb.box(x, y, z, 6, 22, 6, wh); mb.cone(x, y + 22, z, 5, 7, red, 6); break; }
      case 'lighthouse': mb.cone(x, y, z, 7, 34, wh, 10, 4); for (let i = 0; i < 3; i++) mb.cone(x, y + 6 + i * 10, z, 6.4 - i * 0.9, 4, red, 10, 6 - i * 0.9); mb.box(x, y + 34, z, 8, 5, 8, hex('#fff7b0')); mb.cone(x, y + 39, z, 6, 5, red, 8); break;
      case 'harbor': mb.box(x, y - 0.4, z, 12, 1, 80, wd); mb.box(x + 20, y - 0.4, z - 16, 50, 1, 8, wd); for (let i = 0; i < 3; i++) { mb.ell(x + 8 + i * 6, y - 1.6, z + 20 + i * 6, 2.2, 1.2, 6, hex(i % 2 ? '#fff' : '#ff7a6b')); mb.box(x + 8 + i * 6, y - 1, z + 20 + i * 6, 0.3, 8, 0.3, dk); } mb.box(x - 14, y, z - 10, 14, 7, 10, hex('#ffd9a8')); mb.cone(x - 14, y + 7, z - 10, 11, 4, red, 4, 0.5); break;
      case 'airstrip': { const c = Math.cos(m.hdg), s = Math.sin(m.hdg), L = 80, Wd = 14; const P = (a, b) => [x + a * s + b * c, y + 0.5, z + a * c - b * s]; mb.quad(P(-L, -Wd), P(-L, Wd), P(L, Wd), P(L, -Wd), hex('#4a525a')); for (let i = -7; i <= 7; i++) mb.quad(P(i * 10 - 2, -0.6), P(i * 10 - 2, 0.6), P(i * 10 + 2, 0.6), P(i * 10 + 2, -0.6), wh); mb.box(x + 22 * c + 8 * s, y, z - 22 * s + 8 * c, 14, 6, 10, hex('#e8eef2'), m.hdg); mb.cone(x + 22 * c + 8 * s, y + 6, z - 22 * s + 8 * c, 10, 3, red, 4, 0.5); break; }
      case 'volcano': break;
    }
  }
  function buildTree(mb, t) { const s = t.s; if (t.k === 0) { mb.cone(t.x, t.y, t.z, 0.5 * s, 3 * s, hex('#7a4a24'), 5, 0.4 * s); mb.ell(t.x, t.y + 4 * s, t.z, 2.6 * s, 2.6 * s, 2.6 * s, hex('#3f9a4f'), 4, 6); } else { mb.cone(t.x, t.y, t.z, 0.5 * s, 2 * s, hex('#7a4a24'), 5, 0.4 * s); mb.cone(t.x, t.y + 1.6 * s, t.z, 3 * s, 5 * s, hex('#2c7a43'), 6); mb.cone(t.x, t.y + 4.4 * s, t.z, 2.2 * s, 4 * s, hex('#37894d'), 6); } }
  function buildPalm(mb, t) { const s = t.s; mb.cone(t.x, t.y, t.z, 0.45 * s, 7 * s, hex('#9a6a3a'), 5, 0.3 * s); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, x1 = t.x + Math.cos(a) * 3.6 * s, z1 = t.z + Math.sin(a) * 3.6 * s; mb.tri([t.x, t.y + 7 * s, t.z], [x1, t.y + 6 * s, z1], [t.x + Math.cos(a + 0.5) * 1.4 * s, t.y + 7.4 * s, t.z + Math.sin(a + 0.5) * 1.4 * s], hex('#2f8f4a')); } }

  // ---------- 描画器 ----------
  const VS = 'attribute vec3 aPos,aNor,aCol;uniform mat4 uVP,uModel;uniform vec3 uCam;uniform float uFogN,uFogF;varying vec3 vCol,vNor;varying float vFog;void main(){vec4 w=uModel*vec4(aPos,1.);vNor=mat3(uModel)*aNor;vCol=aCol;vFog=clamp((length(w.xyz-uCam)-uFogN)/(uFogF-uFogN),0.,1.);gl_Position=uVP*w;}';
  const FS = 'precision mediump float;varying vec3 vCol,vNor;varying float vFog;uniform vec3 uSun,uSunC,uAmb,uFogC,uTint;void main(){vec3 n=normalize(vNor);float l=max(dot(n,uSun),0.);float hemi=0.5+0.5*n.y;vec3 c=vCol*uTint*(uAmb*hemi+uSunC*l);gl_FragColor=vec4(mix(c,uFogC,vFog),1.);}';
  const WVS = 'attribute vec2 aXZ;uniform mat4 uVP;uniform vec3 uCam;uniform float uT,uFogN,uFogF,uAmp;varying vec3 vW;varying float vFog;varying float vH;void main(){vec3 p=vec3(aXZ.x+uCam.x,0.,aXZ.y+uCam.z);float h=sin(p.x*0.045+uT*1.3)*0.7+sin(p.z*0.06-uT*1.1)*0.6+sin((p.x+p.z)*0.11+uT*2.1)*0.3;p.y=h*uAmp;vH=h;vW=p;vFog=clamp((length(p-uCam)-uFogN)/(uFogF-uFogN),0.,1.);gl_Position=uVP*vec4(p,1.);}';
  const WFS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec3 vW;varying float vFog,vH;uniform vec3 uCam,uSun,uSunC,uAmb,uFogC;void main(){vec3 v=normalize(uCam-vW);vec3 n=normalize(vec3(-vH*0.25,1.,vH*0.2));float fr=pow(1.-max(v.y,0.),3.);vec3 deep=vec3(0.06,0.42,0.62),shal=vec3(0.18,0.75,0.82);vec3 base=mix(deep,shal,clamp(0.35+vH*0.25,0.,1.));vec3 r=reflect(-uSun,n);float sp=pow(max(dot(r,v),0.),60.)*1.3;vec3 c=base*(uAmb*1.2+uSunC*0.35)+vec3(fr)*uFogC*0.5+uSunC*sp;gl_FragColor=vec4(mix(c,uFogC,vFog),mix(0.82,0.95,fr));}';
  const SVS = 'attribute vec2 aP;varying vec2 vP;void main(){vP=aP;gl_Position=vec4(aP,.9999,1.);}';
  const SFS = 'precision mediump float;varying vec2 vP;uniform vec3 uF,uR,uU,uSun,uTop,uHor,uSunC;uniform float uTan,uAsp,uNight;void main(){vec3 d=normalize(uF+uR*vP.x*uTan*uAsp+uU*vP.y*uTan);float k=pow(clamp(1.-max(d.y,0.),0.,1.),2.5);vec3 c=mix(uTop,uHor,k);float s=max(dot(d,uSun),0.);c+=uSunC*(pow(s,600.)*3.+pow(s,12.)*0.25);float st=step(0.995,fract(sin(dot(floor(d.xz/(d.y+1.2)*140.),vec2(12.9898,78.233)))*43758.5453));c+=vec3(st)*uNight*max(d.y,0.);gl_FragColor=vec4(c,1.);}';

  function create(canvas, world, opt) {
    opt = opt || {}; let gl = null; try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; };
    let P, PW, PS; try { P = prog(VS, FS); PW = prog(WVS, WFS); PS = prog(SVS, SFS); } catch (e) { if (root.console) console.warn('SportsGL', e); return null; }
    const upload = mb => { const o = { n: mb.p.length / 3 }; const mk = a => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); return b; }; o.bp = mk(mb.p); o.bn = mk(mb.n); o.bc = mk(mb.c); return o; };
    // 地形のタイル（16×16 マス）と、そこにある木・ランドマーク
    const W = world, TN = 16, NT = W.N / TN, tiles = [];
    const slope = (i, j) => { const k = (a, b) => W.H[clamp(b, 0, W.N) * (W.N + 1) + clamp(a, 0, W.N)]; return Math.hypot(k(i + 1, j) - k(i - 1, j), k(i, j + 1) - k(i, j - 1)) / (2 * W.CELL); };
    const tileOf = (x, z) => clamp(Math.floor((x + W.HALF) / (TN * W.CELL)), 0, NT - 1) + clamp(Math.floor((z + W.HALF) / (TN * W.CELL)), 0, NT - 1) * NT;
    const tb = []; for (let t = 0; t < NT * NT; t++) tb.push({ g: new MB(), p: new MB() });
    for (let tj = 0; tj < NT; tj++) for (let ti = 0; ti < NT; ti++) { const g = tb[tj * NT + ti].g; for (let j = tj * TN; j < (tj + 1) * TN; j++) for (let i = ti * TN; i < (ti + 1) * TN; i++) {
      const X = a => a * W.CELL - W.HALF, h = (a, b) => W.H[b * (W.N + 1) + a], v = [[X(i), h(i, j), X(j)], [X(i + 1), h(i + 1, j), X(j)], [X(i + 1), h(i + 1, j + 1), X(j + 1)], [X(i), h(i, j + 1), X(j + 1)]]; const ah = (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4, sl = slope(i, j), jt = ((i * 7 + j * 13) % 10) / 10 - 0.5;
      const cxm = (v[0][0] + v[2][0]) / 2, czm = (v[0][2] + v[2][2]) / 2, c = W.colorAt ? W.colorAt(cxm, czm, ah, sl, jt) : groundColor(ah, sl, jt); g.tri(v[0], v[3], v[2], c); g.tri(v[0], v[2], v[1], W.colorAt ? W.colorAt(cxm, czm, ah, sl, -jt) : groundColor(ah, sl, -jt)); } }
    for (const t of W.trees) buildTree(tb[tileOf(t.x, t.z)].p, t); for (const t of W.palms || []) buildPalm(tb[tileOf(t.x, t.z)].p, t);
    for (const m of W.marks || []) buildSpot(tb[tileOf(m.x, m.z)].p, m, W);
    for (let t = 0; t < tb.length; t++) { const ti = t % NT, tj = Math.floor(t / NT); tiles.push({ cx: (ti + 0.5) * TN * W.CELL - W.HALF, cz: (tj + 0.5) * TN * W.CELL - W.HALF, g: upload(tb[t].g), p: tb[t].p.p.length ? upload(tb[t].p) : null }); }
    // 雲・飛行機・リング・風船・目印の柱
    const cm = new MB(); const cw = [1, 1, 1]; for (let i = 0; i < 6; i++) cm.ell((i - 2.5) * 0.7 + Math.sin(i * 2) * 0.3, Math.cos(i * 1.3) * 0.25, Math.sin(i * 1.7) * 0.5, 0.75 + (i % 3) * 0.15, 0.4, 0.6, cw, 4, 7); const cloudM = upload(cm);
    const pm = new MB(), wh = hex('#ffffff'), co = hex('#ff7a6b'), yl = hex('#ffd24d'), dk = hex('#2b3a4a'); pm.box(0, -0.5, -2.2, 1.1, 1.1, 5.2, wh); pm.cone(0, -0.5, 2.9, 0.55, 2.2, co, 6, 0.1); pm.box(0, 0.4, -0.2, 0.9, 0.5, 1.6, mix(wh, dk, 0.5)); pm.box(0, -0.2, -0.4, 9, 0.15, 1.5, co); pm.box(0, 0, -2.6, 3.2, 0.12, 1, wh); pm.box(0, 0, -2.6, 0.12, 1.5, 1, co); pm.box(0, -0.4, 2.6, 0.2, 2, 0.2, yl); pm.box(0, -0.4, 2.7, 2, 0.2, 0.1, yl); const planeM = upload(pm);
    const rm = new MB(), rc = hex('#ffd24d'), rc2 = hex('#ff7a6b'); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, x = Math.cos(a), y = Math.sin(a); const m2 = new MB(); rm.box(0, 0, 0, 0, 0, 0, rc); rm.p.length = rm.p.length; const bx = x * 1, by = y * 1; rm.box(bx, by - 0.09, 0, 0.2, 0.2, 0.18, i % 2 ? rc : rc2); void m2; } const ringM = upload(rm);
    const bm = new MB(); bm.ell(0, 0, 0, 1, 1.3, 1, hex('#ffffff'), 6, 9); bm.box(0, -2.2, 0, 0.5, 0.4, 0.5, hex('#8a5a2b')); const balM = upload(bm);
    const fm = new MB(); fm.box(0, 0, 0, 0.06, 2.6, 0.06, hex('#f4f4f4')); fm.quad([0, 2.6, 0], [0, 2.6, 0.9], [0, 2.0, 0.45], [0, 2.0, 0], hex('#e5484d')); fm.quad([0, 2.6, 0], [0, 2.0, 0], [0, 2.0, 0.45], [0, 2.6, 0.9], hex('#e5484d')); fm.disk(0, 0.02, 0, 0.11, hex('#1a1a1a'), 10); const flagM = upload(fm);
    const bl = new MB(); bl.ell(0, 0, 0, 1, 1, 1, hex('#ffffff'), 4, 6); const ballM = upload(bl);
    const pillM = (() => { const b = new MB(); b.cone(0, 0, 0, 1, 1, hex('#ffffff'), 4, 0.15); return upload(b); })();
    // 水（カメラのまわりの格子）
    const wv = []; const WN = 56, WR = 2600; for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) { const f = (a, b) => { const u = (a / WN * 2 - 1), v = (b / WN * 2 - 1); const s = k => Math.sign(k) * Math.pow(Math.abs(k), 2.2); return [s(u) * WR, s(v) * WR]; }; const a = f(i, j), b = f(i + 1, j), c = f(i + 1, j + 1), d = f(i, j + 1); wv.push(a[0], a[1], b[0], b[1], c[0], c[1], a[0], a[1], c[0], c[1], d[0], d[1]); }
    const wbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, wbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wv), gl.STATIC_DRAW); const wcount = wv.length / 2;
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

    // 時間帯と天気
    const L = { sun: [0, 1, 0], sunC: [1, 1, 1], amb: [0.5, 0.5, 0.5], fog: [0.7, 0.85, 0.95], top: [0.3, 0.6, 0.95], hor: [0.75, 0.9, 1], night: 0 };
    function setTime(h, wx) { h = ((h % 24) + 24) % 24; const el = Math.sin((h - 6) / 24 * TAU), az = (h - 6) / 24 * TAU; const day = clamp(el * 2.5 + 0.35, 0, 1), dusk = clamp(1 - Math.abs(el) * 3.2, 0, 1), cl = wx === 1 ? 0.65 : wx === 2 ? 0.8 : 1;
      L.sun = norm([Math.cos(az) * 0.8, Math.max(el, -0.2) + 0.06, 0.55]); const warm = mix([1, 0.97, 0.9], [1, 0.58, 0.3], dusk); L.sunC = warm.map(v => v * day * 0.95 * cl); const nightAmb = [0.12, 0.16, 0.28], dayAmb = [0.5, 0.56, 0.62];
      L.amb = mix(nightAmb, mix(dayAmb, [0.62, 0.5, 0.48], dusk * 0.6), day).map(v => v * (wx === 1 ? 0.9 : 1)); const topD = mix([0.25, 0.55, 0.95], [0.45, 0.45, 0.75], dusk), horD = mix([0.72, 0.9, 1], [1, 0.62, 0.42], dusk);
      L.top = mix([0.02, 0.04, 0.12], topD, day); L.hor = mix([0.07, 0.1, 0.22], horD, day); if (wx === 1) { L.top = mix(L.top, [0.55, 0.6, 0.66], 0.55 * day); L.hor = mix(L.hor, [0.74, 0.78, 0.82], 0.6 * day); } if (wx === 2) { L.hor = mix(L.hor, [0.85, 0.82, 0.74], 0.5 * day); }
      L.fog = L.hor.slice(); L.night = 1 - day; }
    const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const st = { w: 300, h: 200, scale: 1, q: 2, drawDist: 2400, fogK: 1, ema: 16, t: 0, vp: M.ident(), cam: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, aspect: 1, fov: 1.0, tris: 0, snap: null, lowPower: !!opt.lowPower, fixed: !!opt.lowPower };
    function applyQ() { const Q = [{ s: 0.5, d: 1000, wv: 0.4 }, { s: 0.75, d: 1700, wv: 0.7 }, { s: 1, d: 2500, wv: 1 }][st.q]; st.scale = Q.s; st.drawDist = Q.d; st.amp = Q.wv * (W.waveAmp == null ? 1 : W.waveAmp); resize(st.cw, st.ch); }
    function resize(cssW, cssH) { st.cw = cssW; st.ch = cssH; const dpr = Math.min(root.devicePixelRatio || 1, 2) * st.scale; st.w = Math.max(64, Math.round(cssW * dpr)); st.h = Math.max(64, Math.round(cssH * dpr)); if (canvas.width !== st.w || canvas.height !== st.h) { canvas.width = st.w; canvas.height = st.h; } gl.viewport(0, 0, st.w, st.h); st.aspect = st.w / st.h; }
    st.cw = 300; st.ch = 200; st.amp = 1;
    function setQuality(q, fixed) { st.q = clamp(q, 0, 2); if (fixed != null) st.fixed = fixed; applyQ(); }
    const bindMesh = m => { gl.bindBuffer(gl.ARRAY_BUFFER, m.bp); gl.vertexAttribPointer(P.a.pos, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, m.bn); gl.vertexAttribPointer(P.a.nor, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, m.bc); gl.vertexAttribPointer(P.a.col, 3, gl.FLOAT, false, 0, 0); };
    P.a = { pos: gl.getAttribLocation(P.p, 'aPos'), nor: gl.getAttribLocation(P.p, 'aNor'), col: gl.getAttribLocation(P.p, 'aCol') }; PW.a = { xz: gl.getAttribLocation(PW.p, 'aXZ') }; PS.a = { p: gl.getAttribLocation(PS.p, 'aP') };
    const IDM = M.ident(); const draw = (m, model, tint) => { gl.uniformMatrix4fv(P.u.uModel, false, model || IDM); gl.uniform3fv(P.u.uTint, tint || [1, 1, 1]); bindMesh(m); gl.drawArrays(gl.TRIANGLES, 0, m.n); st.tris += m.n / 3; };
    function render(cam, dyn, dt) {
      const t0 = root.performance ? performance.now() : 0; st.t += dt || 0.016; st.tris = 0; st.cam = cam; const fov = cam.fov || 1.0; st.fov = fov;
      const vw = view(cam), fogF = Math.min(st.drawDist * 0.95, 2300) * (L.night > 0.7 ? 0.8 : 1) * (dyn && dyn.wx === 1 ? 0.7 : 1), fogN = fogF * 0.35; const proj = M.persp(fov, st.aspect, 1.5, st.drawDist + 400); st.vp = M.mul(proj, vw.v); st.vw = vw;
      gl.clearColor(L.hor[0], L.hor[1], L.hor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      // 空
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(PS.p); const u = PS.u; gl.uniform3fv(u.uF, vw.b.f); gl.uniform3fv(u.uR, vw.b.r); gl.uniform3fv(u.uU, vw.b.u); gl.uniform3fv(u.uSun, L.sun); gl.uniform3fv(u.uTop, L.top); gl.uniform3fv(u.uHor, L.hor); gl.uniform3fv(u.uSunC, L.sunC.map(v => v * 0.7 + 0.05)); gl.uniform1f(u.uTan, Math.tan(fov / 2)); gl.uniform1f(u.uAsp, st.aspect); gl.uniform1f(u.uNight, L.night);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.enableVertexAttribArray(PS.a.p); gl.vertexAttribPointer(PS.a.p, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.disableVertexAttribArray(PS.a.p);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      // 地形・木・建物
      gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, st.vp); gl.uniform3fv(P.u.uCam, [cam.x, cam.y, cam.z]); gl.uniform1f(P.u.uFogN, fogN); gl.uniform1f(P.u.uFogF, fogF); gl.uniform3fv(P.u.uSun, L.sun); gl.uniform3fv(P.u.uSunC, L.sunC); gl.uniform3fv(P.u.uAmb, L.amb); gl.uniform3fv(P.u.uFogC, L.fog);
      gl.enableVertexAttribArray(P.a.pos); gl.enableVertexAttribArray(P.a.nor); gl.enableVertexAttribArray(P.a.col);
      const f = vw.b.f, rad = TN * W.CELL * 0.75; for (const tl of tiles) { const dx = tl.cx - cam.x, dz = tl.cz - cam.z, d = Math.hypot(dx, dz); if (d > fogF + rad) continue; if (d > rad * 1.5 && (dx * f[0] + dz * f[2]) / d < -0.35 - rad / d * 0.5 + (fov > 1.2 ? -0.3 : 0.2) - 0.2) continue; draw(tl.g); if (tl.p && d < (st.q === 0 ? 700 : fogF)) draw(tl.p); }
      // 雲
      if (st.q > 0 || !dyn || dyn.clouds !== false) for (const c of W.clouds) { const wx = ((c.x + st.t * 6 + W.HALF * 1.6) % (W.HALF * 3.2)) - W.HALF * 1.6; const dd = Math.hypot(wx - cam.x, c.z - cam.z); if (dd > fogF) continue; draw(cloudM, M.model(wx, c.y, c.z, 0, 0, 0, c.s), [L.night > 0.6 ? 0.45 : 1.45, L.night > 0.6 ? 0.48 : 1.45, L.night > 0.6 ? 0.6 : 1.5]); }
      if (dyn) {
        for (const o of dyn.list || []) { if (o.kind === 'plane') draw(planeM, M.model(o.x, o.y, o.z, o.yaw, o.pitch, o.roll, o.s || 1)); else if (o.kind === 'ring') draw(ringM, M.model(o.x, o.y, o.z, o.yaw || 0, 0, 0, o.r), o.tint); else if (o.kind === 'balloon') draw(balM, M.model(o.x, o.y + Math.sin(st.t * 1.5 + o.x) * 1.5, o.z, 0, 0, 0, o.s || 7), o.tint); else if (o.kind === 'flag') draw(flagM, M.model(o.x, o.y, o.z, o.yaw || 0, 0, 0, 1)); else if (o.kind === 'ball') draw(ballM, M.model(o.x, o.y, o.z, 0, 0, 0, o.s || 0.12), o.tint); else if (o.kind === 'pillar') draw(pillM, M.model(o.x, o.y, o.z, st.t * 0.5, 0, 0, 1).map((v, i) => (i === 5 ? o.h : (i === 0 || i === 10) ? v * o.r : v)), o.tint); }
      }
      gl.disableVertexAttribArray(P.a.pos); gl.disableVertexAttribArray(P.a.nor); gl.disableVertexAttribArray(P.a.col);
      // 水
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.useProgram(PW.p); const w2 = PW.u; gl.uniformMatrix4fv(w2.uVP, false, st.vp); gl.uniform3fv(w2.uCam, [cam.x, 0, cam.z]); gl.uniform3fv(w2.uSun, L.sun); gl.uniform3fv(w2.uSunC, L.sunC); gl.uniform3fv(w2.uAmb, L.amb); gl.uniform3fv(w2.uFogC, L.fog); gl.uniform1f(w2.uT, st.t); gl.uniform1f(w2.uFogN, fogN); gl.uniform1f(w2.uFogF, fogF); gl.uniform1f(w2.uAmp, st.amp);
      gl.uniform3fv(w2.uCam, [cam.x, cam.y, cam.z]); gl.bindBuffer(gl.ARRAY_BUFFER, wbuf); gl.enableVertexAttribArray(PW.a.xz); gl.vertexAttribPointer(PW.a.xz, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, wcount); gl.disableVertexAttribArray(PW.a.xz); gl.depthMask(true); gl.disable(gl.BLEND);
      if (st.snap) { const cb = st.snap; st.snap = null; try { cb(canvas); } catch (e) {} }
      const ms = root.performance ? performance.now() - t0 : 0; st.ms = ms;
    }
    // 画質を、フレームの間隔（実測）にあわせて自動でさげる／あげる
    function adapt(frameMs) { if (st.fixed) return; st.ema = st.ema * 0.92 + frameMs * 0.08; st.cool = (st.cool || 0) + 1; if (st.cool < 45) return; if (st.ema > (st.lowTarget ? 40 : 28) && st.q > 0) { st.q--; st.cool = 0; applyQ(); } else if (st.ema < 17.5 && st.q < 2 && st.cool > 240) { st.q++; st.cool = 0; applyQ(); } }
    function project(x, y, z) { const m = st.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (w <= 0.1) return null; const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w; return { x: (nx * 0.5 + 0.5) * st.cw, y: (1 - (ny * 0.5 + 0.5)) * st.ch, w }; }
    function free() { const dl = m => { if (!m) return; for (const k of ['bp', 'bn', 'bc']) gl.deleteBuffer(m[k]); }; for (const t of tiles) { dl(t.g); dl(t.p); } dl(cloudM); dl(planeM); dl(ringM); dl(balM); dl(pillM); dl(flagM); dl(ballM); gl.deleteBuffer(wbuf); gl.deleteBuffer(qb); }
    function dispose() { try { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (x) {} }
    st.q = opt.quality != null ? opt.quality : 2; applyQ(); setTime(opt.hour == null ? 10 : opt.hour, W.weather);
    return { resize, render, setTime, setQuality, adapt, project, dispose, free, state: st, gl, M, basis, canvas };
  }
  root.SportsGL = { create, M, basis, hex };
})(typeof window !== 'undefined' ? window : globalThis);
