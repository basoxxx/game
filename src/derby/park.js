// Static stunt furniture for "Scontro Totale" (v5): kicker ramps, a loop-the-loop and concrete
// blocks, each a fixed Rapier trimesh / cuboid with a matching mesh. Used by the free-roam
// "Parco giochi" and by the Catino d'Acciaio arena. Layout coordinates are relative to the arena
// centre (T.cx, T.cz); the park keeps a clear 24 m corridor along z = 0 for the spawn and for the
// physics telemetry harness (scripted launch / braking / slalom runs).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const conc = tex(256, 256, (g, w, h) => { g.fillStyle = '#8d8a84'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.fillStyle = '#e8b400'; for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32 - 24, 24); g.lineTo(x - 24, 24); g.fill(); } g.fillStyle = '#151515'; g.fillRect(0, 24, w, 4); });
  const steel = tex(256, 64, (g, w, h) => { g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 2, h); } g.fillStyle = '#d22'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); });
  MATS = {
    ramp: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.85, side: THREE.DoubleSide }),
    loop: new THREE.MeshStandardMaterial({ map: steel, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }),
    block: new THREE.MeshStandardMaterial({ color: 0xb9b5ac, roughness: 0.9 }),
  };
  return MATS;
}

function fixedMesh(game, geo, mat, x, y, z, yaw) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = -yaw; m.castShadow = true; m.receiveShadow = true; game.scene.add(m);
  geo.computeBoundingBox();
  const pos = geo.attributes.position.array, idx = geo.index ? geo.index.array : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)));
  const col = game.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx)).setFriction(1.0).setRestitution(0.02), body);
  game.handles.set(col.handle, { kind: 'wall' });
  return m;
}

// kicker: a curved lip rising to height h over length len (along local +x), solid sides and back
export function ramp(game, x, z, yaw, len = 12, w = 6, h = 2.2, curve = 1.6) {
  const n = 10, P = [], I = [];
  for (let k = 0; k <= n; k++) { const u = k / n, px = u * len, py = h * u ** curve; P.push(px, py, -w / 2, px, py, w / 2, px, 0, -w / 2, px, 0, w / 2); }
  for (let k = 0; k < n; k++) { const a = k * 4, b = a + 4; I.push(a, b, a + 1, a + 1, b, b + 1); I.push(a, a + 2, b, b, a + 2, b + 2); I.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
  const e = n * 4; I.push(e, e + 2, e + 1, e + 1, e + 2, e + 3); // back face
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  const uv = []; for (let k = 0; k <= n; k++) uv.push(0, k / n * len / 6, 1, k / n * len / 6, 0, k / n * len / 6, 1, k / n * len / 6); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const y = game.terrain.heightAt(x, z) - 0.02;
  return fixedMesh(game, g, mats().ramp, x, y, z, yaw);
}

// loop-the-loop of radius R, entered along local +x; a lateral twist keeps entry and exit apart
export function loop(game, x, z, yaw, R = 9, w = 6) {
  const n = 64, lead = 10, P = [], I = [], UV = [];
  const pts = [];
  for (let k = 0; k <= 4; k++) pts.push([-lead + (k / 4) * lead, 0, 0]);
  for (let k = 1; k <= n; k++) { const th = (k / n) * Math.PI * 2; pts.push([R * Math.sin(th), R * (1 - Math.cos(th)), (w + 1.2) * (k / n)]); }
  for (let k = 1; k <= 4; k++) pts.push([(k / 4) * lead, 0, w + 1.2]);
  pts.forEach(([px, py, pz], i) => { P.push(px, py, pz - w / 2, px, py, pz + w / 2); UV.push(0, i * 0.25, 1, i * 0.25); });
  for (let k = 0; k < pts.length - 1; k++) { const a = k * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
  const y = game.terrain.heightAt(x, z) + 0.03;
  // support pillars under the top of the loop
  const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, R * 2, 8), mats().block); const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const lz of [-w / 2 - 0.6, w * 1.5 + 1.8]) { const p = pil.clone(); p.position.set(x + 0 * c - lz * s, y + R, z + 0 * s + lz * c); p.castShadow = true; game.scene.add(p); }
  return fixedMesh(game, g, mats().loop, x, y, z, yaw);
}

// a concrete block (jersey barrier sized), fixed
export function block(game, x, z, yaw, L = 3, H = 1.0, W = 0.8) {
  const y = game.terrain.heightAt(x, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), mats().block); m.position.set(x, y + H / 2, z); m.rotation.y = -yaw; m.castShadow = m.receiveShadow = true; game.scene.add(m);
  const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + H / 2, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)));
  const col = game.world.createCollider(RAPIER.ColliderDesc.cuboid(L / 2, H / 2, W / 2).setFriction(0.6).setRestitution(0.05), body);
  game.handles.set(col.handle, { kind: 'wall' });
}

// furniture per venue; returns the list of places the props builder should fill ({type,x,z,...})
export const PARK = {
  // kicker for the jump telemetry: approach along +x on z = 40 from x = -95, lip at x = -18
  jumpLip: [-18, 40],
  loopAt: [55, -45],
};
export function buildFurniture(game) {
  const v = game.venue, T = game.terrain, cx = T.cx, cz = T.cz;
  if (!v.ramps) return;
  if (v.kind === 'park') {
    ramp(game, cx - 32, cz + 40, 0, 14, 7, 2.4);                       // telemetry kicker (lip at x = -18)
    ramp(game, cx + 10, cz + 72, Math.PI, 16, 8, 3.6, 1.8);           // the big one, towards the barrel pyramid
    ramp(game, cx - 70, cz - 30, Math.PI / 2, 10, 6, 1.4);            // small hop
    ramp(game, cx + 70, cz + 30, -Math.PI / 2, 10, 6, 1.4);
    // a pair of facing kickers: jump the gap
    ramp(game, cx - 40, cz - 78, 0, 12, 7, 2.6); ramp(game, cx + 4, cz - 78, Math.PI, 12, 7, 2.6);
    loop(game, cx + PARK.loopAt[0], cz + PARK.loopAt[1], Math.PI, 9, 6);
    for (let k = 0; k < 8; k++) block(game, cx - 95 + k * 3.2, cz - 100, 0);
  } else {
    // Catino: four kickers around the bowl, a ring of blocks in the middle
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4, r = 30; ramp(game, cx + Math.cos(a) * r, cz + Math.sin(a) * r, a + Math.PI / 2, 10, 6, 1.9); }
    for (let k = 0; k < 12; k += 2) { const a = (k / 12) * Math.PI * 2 + 0.26, r = 19; block(game, cx + Math.cos(a) * r, cz + Math.sin(a) * r, a + Math.PI / 2); }
  }
}
