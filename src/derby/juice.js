// "Scontro Totale" v7 feel layer: the things that make a hit hurt and a slide sing, kept out of
// game.js so the core loop stays readable. game.js calls in at five points:
//   juiceDrive(game, car, inp, dt)   after drive(): drift momentum (a held slide keeps its speed)
//   juiceLand(game, car, vel, up)    on touchdown: suspension squash, roof crush on a flat landing
//   juiceCrash(game, a, b, closing, J, kind)  classified car-vs-car hits: crunch, sparks, crumple, ejection
//   juiceWall(game, car, eff, wp)    heavy wall / prop blows: crunch and sparks scaled by the impulse
//   juiceSync(game, car, dt)         visuals: body squash spring, rust spread, rain spray, ejected drivers
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { dent, crackGlass } from './cars.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---------------------------------------------------------------- driving
export function juiceDrive(game, car, inp, dt) {
  const d = car.dyn; if (!d) return;
  // nobody at the wheel: the car coasts to a stop (arena: it counts as knocked out; race: back on track)
  if (car.ejected) {
    for (let i = 0; i < 4; i++) { car.vc.setWheelEngineForce(i, 0); car.vc.setWheelBrake(i, 2.5); }
    car.boost = false; car.ejT = (car.ejT || 0) + dt;
    if (game.track.arena && !game.track.park && car.hp > 0 && car.ejT > 0.6) { car.hp = 0; game.wreck(car); }
    else if (!game.track.arena && car.ejT > 2.6 && game.requestRespawn) { car.ejT = 0; game.requestRespawn(car, 'eject'); }
    return;
  }
  car.ejT = 0;
  if (car.hp <= 0 || inp.hold) return;
  // drift momentum: on the throttle in a committed slide the car carries its speed through the corner
  // (Rapier's tyres scrub a slide down hard; a Flatout slide should feel like it could go on forever)
  const sa = Math.abs(d.slideAng || 0);
  if (d.grounded >= 3 && d.speed > 10 && d.vF > 6 && sa > 0.18 && sa < 1.25 && inp.thr > 0.4) {
    const k = car.spec.mass * (car.isPlayer ? 3.4 : 1.6) * Math.min(1, (sa - 0.18) / 0.35) * inp.thr * Math.max(0, 1 - d.speed / 70);
    car.body.addForce({ x: d.fwd.x * k, y: 0, z: d.fwd.z * k }, true);
    car.driftHeld = (car.driftHeld || 0) + dt;
  } else car.driftHeld = 0;
}

// ---------------------------------------------------------------- landings
export function juiceLand(game, car, vel, up) {
  const vy = Math.max(0, -vel.y);
  // the shell drops into its springs and bounces back (visual: the wheels already follow the suspension)
  car.sqV = (car.sqV || 0) - Math.min(2.6, vy * 0.2);
  // a flat-on-the-roof or nose-first arrival crushes the cabin
  if (up && vy > 7) {
    const ud = car.mesh.userData, L = ud.dims.L;
    if (up.y < -0.2) dent(car.mesh, new THREE.Vector3(0, ud.dims.H + 0.05, 0), new THREE.Vector3(0, -1, 0), Math.min(0.32, vy * 0.025));
    else if (Math.abs(car.dyn?.fwd?.y || 0) > 0.45) { const nose = (car.dyn.fwd.y < 0 ? 1 : -1); dent(car.mesh, new THREE.Vector3(nose * L * 0.95, 0.55, 0), new THREE.Vector3(-nose, 0.2, 0), Math.min(0.3, vy * 0.02)); }
  }
}

// ---------------------------------------------------------------- crashes
export function juiceCrash(game, a, b, closing, J, kind) {
  const pa = a.body.translation(), pb = b.body.translation();
  const wp = new THREE.Vector3((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + 0.6, (pa.z + pb.z) / 2);
  const sev = Math.min(1, Math.max(0, (closing - 6) / 26));
  game.maxClosing = Math.max(game.maxClosing || 0, closing);
  const nearCam = game.camera.position.distanceToSquared(wp) < 70 * 70;
  if (nearCam) {
    // a fan of sparks squeezed out of the seam, along the two cars' mean motion; a white flash on the big ones
    const va = a.body.linvel(), vb = b.body.linvel(), mx = (va.x + vb.x) / 2, mz = (va.z + vb.z) / 2;
    const n = Math.round((10 + sev * 55) * (game.low ? 0.5 : 1));
    for (let k = 0; k < n; k++) { const s = 5 + sev * 14; game.sparks.emit(wp.x, wp.y, wp.z, mx * 0.5 + (Math.random() - 0.5) * s, Math.random() * s * 0.55, mz * 0.5 + (Math.random() - 0.5) * s, 0.25 + Math.random() * 0.5, 0.3 + sev * 0.15, 1, 0.7 + Math.random() * 0.25, 0.3); }
    if (sev > 0.35) { game.fire.emit(wp.x, wp.y, wp.z, 0, 0.2, 0, 0.09, 1.6 + sev * 2.2, 1, 0.92, 0.75, 1); game.fire.emit(wp.x, wp.y, wp.z, 0, 0.4, 0, 0.16, 0.9 + sev, 1, 0.6, 0.25, 0.8); }
    // a puff of rust and paint dust from the panels
    if (game.dust) for (let k = 0; k < 4 + sev * 8; k++) game.dust.emit(wp.x, wp.y - 0.2, wp.z, (Math.random() - 0.5) * 4, 0.4 + Math.random(), (Math.random() - 0.5) * 4, 0.8 + Math.random() * 0.6, 0.7 + sev * 0.6, 0.42, 0.34, 0.26, 0.28);
  }
  // crumple: the panel that took the blow folds in deeper than the per-contact dents (reads from the chase cam)
  if (sev > 0.15) for (const c of [a, b]) {
    const o = c === a ? b : a, op = o.body.translation(), cp = c.body.translation(), r = c.body.rotation();
    _q.set(r.x, r.y, r.z, r.w).invert(); const dl = _v.set(op.x - cp.x, 0, op.z - cp.z).applyQuaternion(_q).normalize();
    const { L, W } = c.mesh.userData.dims, sc = Math.min(L / Math.max(1e-3, Math.abs(dl.x)), W / Math.max(1e-3, Math.abs(dl.z)));
    const loc = new THREE.Vector3(dl.x * sc, 0.68, dl.z * sc);
    dent(c.mesh, loc, new THREE.Vector3(-dl.x, -0.1, -dl.z).normalize(), Math.min(0.36, 0.08 + sev * 0.28) * (c.spec.armor > 1.3 ? 0.8 : 1));
  }
  // impulse-based crunch for every heavy hit near the camera (the per-contact thump stays for the scrapes)
  if (nearCam) game.snd?.crunch?.(wp, sev, kind);
  // the gag: a monster head-on or T-bone throws the victim's driver through the windscreen
  if (closing > 25 && (kind === 'frontale' || kind === 'tbone' || kind === 'tampon')) {
    const vic = kind === 'tampon' ? (a.lastHit?.by === b ? a : b) : [a, b].sort((x, y) => x.hp - y.hp)[0];
    if (!vic.isPlayer && !vic.ejected && vic.hp < 70 && Math.random() < 0.7) ejectDriver(game, vic);
  }
}
// heavy blows against walls and big props (car-vs-car is handled above)
export function juiceWall(game, car, eff, wp) {
  if (eff < 9000 || game.time - (car._wallT ?? -9) < 0.35) return; car._wallT = game.time;
  const sev = Math.min(1, (eff - 9000) / 30000);
  if (game.camera.position.distanceToSquared(wp) < 60 * 60) game.snd?.crunch?.(wp, sev * 0.8, 'wall');
}

// ---------------------------------------------------------------- driver ejection (ragdoll-lite)
// One rigid ball for the body, the limbs flail procedurally; the driver sits up after a few
// seconds, shakes their head and gives a thumbs-up (they always walk away), then is gone.
function figure(ud) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: ud.suitColor ?? 0x2255aa, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 3, 8), suit); torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), ud.helmetMat || suit); head.position.y = 0.42; head.castShadow = true; g.add(head);
  const limb = (x, y, len, r) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 2, 6), suit); m.position.y = -len / 2 - r; m.castShadow = true; p.add(m); g.add(p); return p; };
  g.userData.limbs = [limb(0, 0.22, 0.34, 0.05), limb(0, 0.22, 0.34, 0.05), limb(0, -0.22, 0.42, 0.07), limb(0, -0.22, 0.42, 0.07)];
  g.userData.limbs.forEach((l, i) => { l.position.z = i % 2 ? -0.2 : 0.2; if (i >= 2) l.position.z *= 0.5; });
  return g;
}
export function ejectDriver(game, car) {
  const ud = car.mesh.userData; if (!ud.driver || car.ejected) return;
  car.ejected = true; ud.driver.visible = false;
  const q = car.mesh.quaternion, fwd = _v.set(1, 0, 0).applyQuaternion(q).clone();
  const p = new THREE.Vector3(ud.dims.L * 0.45, ud.dims.beltY + 0.55, 0.3).applyQuaternion(q).add(car.mesh.position);
  // out through the windscreen: the glass goes first
  if (crackGlass(car.mesh, 'front', 5)) game.snd?.glass(car.mesh.position);
  for (let k = 0; k < 40; k++) game.chips.emit(p.x, p.y, p.z, fwd.x * 6 + (Math.random() - 0.5) * 5, 2 + Math.random() * 4, fwd.z * 6 + (Math.random() - 0.5) * 5, 0.9 + Math.random() * 0.6, 0.12 + Math.random() * 0.1, 0.75, 0.86, 0.95, 0.9);
  const mesh = figure(ud); mesh.position.copy(p); game.scene.add(mesh);
  const lv = car.preV || car.body.linvel();
  const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinearDamping(0.15).setAngularDamping(0.6).setCcdEnabled(true));
  game.world.createCollider(RAPIER.ColliderDesc.ball(0.32).setMass(80).setFriction(0.9).setRestitution(0.3), body);
  const sp = Math.hypot(lv.x, lv.z), k = 0.85 + Math.random() * 0.25;
  body.setLinvel({ x: lv.x * k + fwd.x * 3, y: 5 + Math.min(6, sp * 0.18), z: lv.z * k + fwd.z * 3 }, true);
  body.setAngvel({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 14 }, true);
  (game.ejected ||= []).push({ mesh, body, t: 0, car });
  if (game.ejected.length > 3) dropEjected(game, game.ejected.shift());
  game.ejections = (game.ejections || 0) + 1;
  const by = car.lastHit?.by;
  if (by?.isPlayer) { game.award(by, 15, 'PILOTA IN ORBITA!', 300); game.callout?.('VOLA VIA!', 'gold'); }
  game.feed?.(`<i style="background:${car.color}"></i>${String(car.name).replace(/[<>&]/g, '')}<u>➶</u><em>sbalzato fuori</em>`);
  game.snd?.crowd?.(1);
}
function dropEjected(game, e) { game.scene.remove(e.mesh); try { game.world.removeRigidBody(e.body); } catch {} }
function updateEjected(game, dt) {
  const list = game.ejected; if (!list?.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]; e.t += dt;
    const t = e.body.translation(), r = e.body.rotation(), lv = e.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
    const L = e.mesh.userData.limbs;
    if (e.t < 3.2 || sp > 1.5) {
      e.mesh.position.set(t.x, t.y, t.z); e.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      // flailing: limbs windmill with the tumble, harder the faster it goes
      const f = Math.min(1, sp / 10) * 1.6 + 0.2;
      L.forEach((l, k) => { l.rotation.z = Math.sin(e.t * (13 + k * 3) + k) * f + (k < 2 ? 0.6 : 0.2) * (k % 2 ? -1 : 1); l.rotation.x = Math.cos(e.t * (11 + k * 2)) * f * 0.6; });
      e.restQ = null;
    } else {
      // up again: settle upright on the ground, a little wobble, one arm up
      if (!e.restQ) { e.restQ = true; e.body.setEnabled?.(false); e.gy = game.terrain.heightAt(t.x, t.z); e.yaw = Math.random() * 6.28; }
      const u = Math.min(1, (e.t - 3.2) / 0.8);
      e.mesh.position.set(t.x, e.gy + 0.75 * u + 0.25 * (1 - u), t.z);
      e.mesh.quaternion.setFromEuler(new THREE.Euler(Math.sin(e.t * 5) * 0.12 * u, e.yaw, (1 - u) * 1.4));
      L[0].rotation.z = Math.PI * 0.9 * u + Math.sin(e.t * 9) * 0.15; L[1].rotation.z = -0.15; L[2].rotation.z = 0.05; L[3].rotation.z = -0.05; L[0].rotation.x = L[1].rotation.x = 0;
      if (e.t > 9) { dropEjected(game, e); list.splice(i, 1); }
    }
  }
}

// ---------------------------------------------------------------- per-car visuals
export function juiceSync(game, car, dt) {
  const ud = car.mesh.userData, sh = ud.shell;
  if (ud.shellY0 == null) ud.shellY0 = sh.position.y;
  if (dt > 0) {
    // squash spring (critically under-damped: one bounce)
    car.sqV = (car.sqV || 0) + (-(car.sqY || 0) * 160 - (car.sqV || 0) * 11) * dt;
    car.sqY = Math.max(-0.2, Math.min(0.08, (car.sqY || 0) + car.sqV * dt));
    // rust spreads as the car is beaten up
    if (ud.rust && ud.rust.base > 0) ud.rust.value = ud.rust.base + Math.max(0, 1 - car.hp / 100) * 0.35;
    // rain: the tyres throw a fine spray behind the car on the wet surface
    if (game.wet > 0.3 && car.dyn && car.dyn.grounded >= 2 && car.dyn.speed > 11 && game.splash && Math.random() < 0.55 * (game.low ? 0.4 : 1)) {
      const sp = car.dyn.speed, lv = car.body.linvel(), q = car.mesh.quaternion;
      if (game.camera.position.distanceToSquared(car.mesh.position) < 50 * 50) for (const z of [0.75, -0.75]) {
        const p = _v.set(-ud.dims.L * 0.55, 0.15, z).applyQuaternion(q).add(car.mesh.position);
        game.splash.emit(p.x, p.y, p.z, lv.x * 0.25 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5 * Math.min(1, sp / 30), lv.z * 0.25 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.4, 0.55 + sp * 0.012, 0.72, 0.76, 0.8, 0.16 * game.wet);
      }
    }
  }
  sh.position.y = ud.shellY0 + (car.sqY || 0);
  if (car === game.player) {
    updateEjected(game, dt);
    // rain: drops crown on the ground and in the puddles around the camera
    if (game.rain && game.wet > 0.3 && dt > 0 && game.splash) {
      const c = game.camera.position, T = game.terrain, n = Math.round((game.low ? 3 : 9) * game.wet);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.28, r = 2 + Math.random() * 22, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = T.heightAt(x, z), pud = T.waterAt(x, z) > 0.2;
        game.splash.emit(x, y + 0.04, z, (Math.random() - 0.5) * 0.6, pud ? 1.6 + Math.random() : 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, pud ? 0.32 : 0.2, pud ? 0.2 : 0.1, 0.78, 0.82, 0.88, pud ? 0.4 : 0.22);
      }
    }
  }
}
export function juiceReset(car) { const ud = car.mesh.userData; car.ejected = false; if (ud.driver) ud.driver.visible = true; car.sqY = 0; car.sqV = 0; }
