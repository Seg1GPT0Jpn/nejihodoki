// わくせいシミュレーターの探検家：小さな星の上を歩く、跳ぶ、泳ぐ。カメラはうしろからついていく（プレイヤーがカメラと戦わない）。
// 球の上の動き：位置は単位ベクトル p、向きは接平面の f。進むと p と f を同じ回転で回す（平行移動）。高さは PWorld.groundAt で描いた地面ちょうど。
const PExplorer = (() => {
'use strict';
function create(THREE, scene, W) {
  const E = { p: new THREE.Vector3(0, 0, 1), f: new THREE.Vector3(0, 1, 0), alt: 0, vUp: 0, grounded: true, swim: false, phase: 0, speed: 0, cf: new THREE.Vector3(0, 1, 0), yawOff: 0, pitchOff: 0, walked: 0, steps: 0, r: 1 };
  // ---- the body: a little survey robot in a round helmet (original design): white shell with orange trim, a big dark glossy visor,
  // a glowing antenna, a backpack with teal light strips and a thruster that flares when it jumps. Limbs hang from pivots so they swing.
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const P = (c, sh, e) => new THREE.MeshPhongMaterial({ color: c, shininess: sh == null ? 30 : sh, specular: 0x333333, emissive: e || 0 });
  const shell = P(0xf4f1ea, 50), trim = P(0xff7a2f, 30), dark = P(0x3a3f4a, 20), glowM = new THREE.MeshBasicMaterial({ color: 0x5ff2d8 });
  const visorM = new THREE.MeshPhongMaterial({ color: 0x0f1c2e, specular: 0x9fdcff, shininess: 110, emissive: 0x06202a });
  const thrM = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 });
  const add = (parent, geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy || sx, sz || sx); parent.add(o); return o; };
  const pivot = (x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); rig.add(o); return o; };
  // torso
  const body = add(rig, new THREE.SphereGeometry(0.26, 16, 12), shell, 0, 0.5, 0, 1, 1.15, 0.92);
  add(rig, new THREE.CylinderGeometry(0.265, 0.25, 0.08, 16), trim, 0, 0.42, 0);
  add(rig, new THREE.BoxGeometry(0.14, 0.1, 0.04), trim, 0, 0.56, 0.235);
  add(rig, new THREE.SphereGeometry(0.03, 8, 6), glowM, 0.04, 0.57, 0.26);
  // head: a big round helmet with a visor that wraps the front
  const head = new THREE.Group(); head.position.set(0, 0.98, 0); rig.add(head);
  add(head, new THREE.SphereGeometry(0.34, 20, 16), shell, 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.3, 20, 14, -1.15, 2.3, 0.62, 1.35), visorM, 0, 0.0, 0.065, 1.02, 0.98, 1.0).rotation.y = Math.PI / 2;
  add(head, new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8fbff }), 0.12, 0.08, 0.31, 1, 0.6, 0.4);
  add(head, new THREE.TorusGeometry(0.2, 0.035, 8, 24), trim, 0, -0.3, 0).rotation.x = Math.PI / 2; // the collar
  add(head, new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10), trim, 0.29, 0.02, 0).rotation.z = Math.PI / 2;
  add(head, new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10), trim, -0.29, 0.02, 0).rotation.z = Math.PI / 2;
  add(head, new THREE.CylinderGeometry(0.012, 0.012, 0.26, 5), dark, 0.16, 0.36, -0.06).rotation.z = -0.25;
  const beacon = add(head, new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5ff2d8 }), 0.195, 0.49, -0.06);
  // backpack (this is what the camera sees most): rounded case, two light strips, a thruster nozzle
  add(rig, new THREE.BoxGeometry(0.34, 0.36, 0.16), shell, 0, 0.58, -0.27);
  add(rig, new THREE.CylinderGeometry(0.08, 0.08, 0.36, 10), shell, 0.17, 0.58, -0.27);
  add(rig, new THREE.CylinderGeometry(0.08, 0.08, 0.36, 10), shell, -0.17, 0.58, -0.27);
  const strips = [add(rig, new THREE.BoxGeometry(0.04, 0.22, 0.02), glowM, 0.08, 0.6, -0.36), add(rig, new THREE.BoxGeometry(0.04, 0.22, 0.02), glowM, -0.08, 0.6, -0.36)];
  add(rig, new THREE.BoxGeometry(0.3, 0.05, 0.17), trim, 0, 0.77, -0.27);
  add(rig, new THREE.CylinderGeometry(0.05, 0.07, 0.08, 10), dark, 0, 0.37, -0.29);
  const flame = add(rig, new THREE.ConeGeometry(0.06, 0.25, 10), thrM, 0, 0.22, -0.29); flame.rotation.x = Math.PI;
  // arms and legs on pivots
  const armL = pivot(-0.29, 0.62, 0), armR = pivot(0.29, 0.62, 0);
  for (const [a, s] of [[armL, -1], [armR, 1]]) { add(a, new THREE.CylinderGeometry(0.055, 0.05, 0.24, 8), shell, s * 0.02, -0.12, 0); add(a, new THREE.SphereGeometry(0.075, 10, 8), trim, s * 0.02, -0.27, 0.01); }
  const legL = pivot(-0.11, 0.3, 0), legR = pivot(0.11, 0.3, 0);
  for (const l of [legL, legR]) { add(l, new THREE.CylinderGeometry(0.07, 0.065, 0.2, 8), shell, 0, -0.1, 0); add(l, new THREE.SphereGeometry(0.09, 10, 8), dark, 0, -0.24, 0.03, 1, 0.7, 1.3); }
  const tail = { rotation: {} }; // (the old scarf; kept so the animation code stays simple)
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
    const now = performance.now() / 1000, air = !E.grounded && !E.swim, run = Math.min(1, Math.abs(E.speed) / (R * 0.06));
    // walk: legs and arms swing, the body bobs and leans into the step; jump: arms up, legs tucked, the thruster flares; idle: it breathes
    legL.rotation.x = air ? -0.6 : sw * 0.8; legR.rotation.x = air ? 0.3 : -sw * 0.8;
    armL.rotation.x = air ? -2.4 : -sw * 0.7; armR.rotation.x = air ? -2.4 : sw * 0.7; armL.rotation.z = air ? -0.3 : -0.12; armR.rotation.z = air ? 0.3 : 0.12;
    rig.position.y = Math.abs(sw) * 0.06 + (run < 0.05 && !air ? Math.sin(now * 2.2) * 0.012 : 0) - (E.swim ? 0.28 : 0);
    rig.rotation.x = run * 0.18 * Math.sign(E.speed || 1) - (air ? 0.12 : 0);
    head.rotation.z = Math.sin(E.phase) * 0.05 * run; head.rotation.x = -rig.rotation.x * 0.5;
    thrM.opacity = air && E.vUp > 0 ? 0.9 : Math.max(0, thrM.opacity - 0.08); flame.scale.y = 0.7 + 0.5 * Math.random();
    const gl = 0.55 + 0.25 * Math.sin(now * 3); beacon.material.color.setHSL(0.47, 0.85, gl); for (const st2 of strips) st2.material.color.setHSL(0.47, 0.8, 0.5 + 0.15 * Math.sin(now * 2 + 1));
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
    const fwd = tmp.copy(E.cf).applyAxisAngle(E.p, (E.lockYaw != null ? E.lockYaw : E.yawOff) + 0.28); // a little from the side, so the visor shows
    const back = scale * ((E.lockYaw != null ? 3.2 : 6.2) + 2 * Math.max(0, E.pitchOff)), hgt = scale * ((E.lockYaw != null ? 1.2 : 3.4) + 3 * E.pitchOff);
    const cpos = new THREE.Vector3().copy(E.p).multiplyScalar(E.r + hgt).addScaledVector(fwd, -back);
    // never under the ground
    const cd = cpos.clone().normalize(), cg = W.groundAt(cd.x, cd.y, cd.z); if (cpos.length() < cg + scale * 1.2) cpos.copy(cd.multiplyScalar(cg + scale * 1.2));
    cam.position.copy(cpos); cam.up.copy(E.p);
    cam.lookAt(new THREE.Vector3().copy(E.p).multiplyScalar(E.r + scale * (E.lockYaw != null ? 0.75 : 1.3)).addScaledVector(fwd, E.lockYaw != null ? 0 : scale * 2.5));
  };
  E.show = v => { g.visible = v; shadow.visible = v; };
  E.latLon = () => { const y = Math.max(-1, Math.min(1, E.p.y)); return [Math.asin(y) * 180 / Math.PI, Math.atan2(-E.p.z, E.p.x) * 180 / Math.PI]; };
  return E;
}
return { create };
})();
if (typeof window !== 'undefined') window.PExplorer = PExplorer;
