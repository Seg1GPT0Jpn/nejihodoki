// わくせいシミュレーターの探検家：小さな星の上を歩く、跳ぶ、泳ぐ。カメラはうしろからついていく（プレイヤーがカメラと戦わない）。
// 球の上の動き：位置は単位ベクトル p、向きは接平面の f。進むと p と f を同じ回転で回す（平行移動）。高さは PWorld.groundAt で描いた地面ちょうど。
const PExplorer = (() => {
'use strict';
function create(THREE, scene, W) {
  const E = { p: new THREE.Vector3(0, 0, 1), f: new THREE.Vector3(0, 1, 0), alt: 0, vUp: 0, grounded: true, swim: false, phase: 0, speed: 0, cf: new THREE.Vector3(0, 1, 0), yawOff: 0, pitchOff: 0, walked: 0, steps: 0, r: 1 };
  // ---- the body: a round surveyor in a cream suit, a teal visor, a backpack beacon and a red scarf (original design) ----
  const g = new THREE.Group(), L = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0 });
  const suit = L(0xf3e6cf), dark = L(0x3b3a46), scarf = L(0xe2513c), visor = new THREE.MeshLambertMaterial({ color: 0x3fd6c4, emissive: 0x0d5a52 });
  const mesh = (geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy || sx, sz || sx); g.add(o); return o; };
  const body = mesh(new THREE.SphereGeometry(0.32, 12, 10), suit, 0, 0.52, 0, 1, 1.1, 0.95);
  const head = mesh(new THREE.SphereGeometry(0.3, 14, 10), suit, 0, 1.02, 0);
  mesh(new THREE.SphereGeometry(0.22, 12, 8, -0.9, 1.8, 0.7, 1.2), visor, 0, 1.03, 0.1, 1.05, 1, 1.12).rotation.y = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 14), scarf, 0, 0.8, 0, 1, 1, 1).rotation.x = Math.PI / 2;
  const tail = mesh(new THREE.BoxGeometry(0.08, 0.28, 0.04), scarf, -0.2, 0.7, -0.18);
  mesh(new THREE.BoxGeometry(0.3, 0.36, 0.18), dark, 0, 0.6, -0.3);
  mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), dark, 0.08, 1.0, -0.33);
  const beacon = mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b }), 0.08, 1.22, -0.33);
  const legL = mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.3, 6), dark, -0.12, 0.17, 0);
  const legR = mesh(legL.geometry, dark, 0.12, 0.17, 0);
  const armL = mesh(new THREE.SphereGeometry(0.08, 8, 6), suit, -0.33, 0.55, 0, 1, 1.6, 1), armR = mesh(armL.geometry, suit, 0.33, 0.55, 0, 1, 1.6, 1);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  scene.add(shadow); scene.add(g); g.visible = false; shadow.visible = false;
  E.group = g; E.shadow = shadow;
  const SIZE = 0.013; // height as a fraction of the planet's radius
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), tmp = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  function tangentize() { E.f.addScaledVector(E.p, -E.f.dot(E.p)); if (E.f.lengthSq() < 1e-8) { E.f.set(0, 1, 0).addScaledVector(E.p, -E.p.y); if (E.f.lengthSq() < 1e-8) E.f.set(1, 0, 0); } E.f.normalize(); }
  E.place = (dir, heading) => { E.p.copy(dir).normalize(); E.f.copy(heading || new THREE.Vector3(0, 1, 0)); tangentize(); E.cf.copy(E.f); E.alt = 0; E.vUp = 0; E.yawOff = 0; E.pitchOff = 0; E.r = W.groundAt(E.p.x, E.p.y, E.p.z); };
  E.gravity = () => 9.5 * (W.st && W.st.p.size < 0.6 ? 0.28 : 1); // a tiny moon: big jumps
  // input: { x: -1..1 (turn), y: -1..1 (forward), jump }
  E.update = (dt, inp) => {
    const R = W.R, scale = R * SIZE, ground = W.groundAt(E.p.x, E.p.y, E.p.z), fr = W.hasFluid() && W.fluid.kind === 'water' ? W.R : 0;
    E.swim = fr > ground + scale * 0.45;
    // turning and moving (speed in planet radii per second)
    const turn = (inp.x || 0) * 2.4 * dt; if (turn) { q.setFromAxisAngle(E.p, -turn); E.f.applyQuaternion(q); }
    let want = (inp.y || 0) * R * (E.swim ? 0.045 : 0.085);
    E.speed += (want - E.speed) * Math.min(1, dt * (E.grounded || E.swim ? 8 : 1.5));
    if (Math.abs(E.speed) > 1e-6) {
      const ang = E.speed * dt / R;
      // steep uphill slows down
      const ahead = tmp.copy(E.p).addScaledVector(E.f, Math.sign(ang) * 0.01).normalize(), ga = W.groundAt(ahead.x, ahead.y, ahead.z);
      const slope = (ga - ground) / (R * 0.01); let k = E.grounded && slope > 0.9 && !E.swim ? Math.max(0.1, 1 - (slope - 0.9) * 1.2) : 1;
      if (W.fluid.kind === 'lava' && ga < W.R + scale * 0.1) k = 0; // never walk into lava
      side.crossVectors(E.p, E.f).normalize(); q.setFromAxisAngle(side, ang * k); E.p.applyQuaternion(q).normalize(); E.f.applyQuaternion(q); tangentize();
      E.walked += Math.abs(ang * k); E.phase += Math.abs(E.speed) * dt / scale * 1.6;
    }
    // jumping and falling
    if (inp.jump && (E.grounded || E.swim)) { E.vUp = scale * (E.swim ? 4 : 7.5); E.grounded = false; E.jumped = (E.jumped || 0) + 1; if (E.onJump) E.onJump(); }
    const g2 = W.groundAt(E.p.x, E.p.y, E.p.z), base = E.swim ? Math.max(g2, fr - scale * 0.55) : g2;
    E.alt += E.vUp * dt; E.vUp -= E.gravity() * scale * dt;
    if (E.alt <= 0) { if (!E.grounded && E.vUp < -scale * 3 && E.onLand) E.onLand(); E.alt = 0; E.vUp = 0; E.grounded = true; } else E.grounded = false;
    E.r = base + E.alt;
    // the body
    up.copy(E.p); side.crossVectors(up, E.f).normalize(); m.makeBasis(side, up, E.f); g.quaternion.setFromRotationMatrix(m);
    g.position.copy(E.p).multiplyScalar(E.r); g.scale.setScalar(scale);
    const sw = Math.sin(E.phase) * Math.min(1, Math.abs(E.speed) / (R * 0.03));
    legL.rotation.x = sw * 0.7; legR.rotation.x = -sw * 0.7; armL.rotation.x = -sw * 0.6; armR.rotation.x = sw * 0.6;
    body.position.y = 0.52 + Math.abs(sw) * 0.04 - (E.swim ? 0.2 : 0); head.position.y = 1.02 + Math.abs(sw) * 0.04 - (E.swim ? 0.2 : 0);
    tail.rotation.x = 0.4 + sw * 0.3 + (E.grounded ? 0 : 0.6);
    beacon.material.color.setHSL(0.12, 1, 0.55 + 0.2 * Math.sin(performance.now() / 300));
    shadow.position.copy(E.p).multiplyScalar(g2 + scale * 0.02); shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), E.p); shadow.scale.setScalar(scale * (1 - Math.min(0.6, E.alt / (scale * 3))));
    shadow.visible = g.visible && !E.swim;
    // footstep ticks
    const st = Math.floor(E.phase / Math.PI); if (st !== E.steps) { E.steps = st; if (E.grounded && !E.swim && E.onStep) E.onStep(); }
  };
  // the camera follows from behind; a drag turns it for a moment, then it swings back
  E.camera = (cam, dt, look) => {
    const R = W.R, scale = R * SIZE;
    E.cf.lerp(E.f, Math.min(1, dt * 2.2)); E.cf.addScaledVector(E.p, -E.cf.dot(E.p)).normalize();
    if (!(look && look.held)) { E.yawOff *= Math.exp(-dt * 1.2); E.pitchOff *= Math.exp(-dt * 1.2); }
    const fwd = tmp.copy(E.cf).applyAxisAngle(E.p, E.yawOff);
    const back = scale * (6.2 + 2 * Math.max(0, E.pitchOff)), hgt = scale * (3.4 + 3 * E.pitchOff);
    const cpos = new THREE.Vector3().copy(E.p).multiplyScalar(E.r + hgt).addScaledVector(fwd, -back);
    // never under the ground
    const cd = cpos.clone().normalize(), cg = W.groundAt(cd.x, cd.y, cd.z); if (cpos.length() < cg + scale * 1.2) cpos.copy(cd.multiplyScalar(cg + scale * 1.2));
    cam.position.copy(cpos); cam.up.copy(E.p);
    cam.lookAt(new THREE.Vector3().copy(E.p).multiplyScalar(E.r + scale * 1.3).addScaledVector(fwd, scale * 2.5));
  };
  E.show = v => { g.visible = v; shadow.visible = v; };
  E.latLon = () => { const y = Math.max(-1, Math.min(1, E.p.y)); return [Math.asin(y) * 180 / Math.PI, Math.atan2(-E.p.z, E.p.x) * 180 / Math.PI]; };
  return E;
}
return { create };
})();
if (typeof window !== 'undefined') window.PExplorer = PExplorer;
