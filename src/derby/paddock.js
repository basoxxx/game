// "Scontro Totale" v7 venue dressing: the paddock. Little camps of the bangers' crews off the
// racing surface: a spare car under a dusty tarp, gas bottles and jerrycans, a work light at night.
// Scanned CC0 models from Poly Haven (covered_car, propane_tank, metal_jerrycan_green; textures
// re-compressed to 512 px webp, see public/assets/CREDITS.txt). The spots are picked synchronously
// (so the trees keep clear of them), the models stream in afterwards; skipped on the low tier.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let modelsP = null;
function loadModels() {
  if (modelsP) return modelsP;
  const L = new GLTFLoader(), get = (n) => new Promise((res) => L.load('./assets/derby/' + n + '.gltf', (g) => res(g), undefined, () => res(null)));
  return (modelsP = Promise.all([get('wreck'), get('propane'), get('jerrycan')]));
}
// one geometry per material of a glTF scene (node transforms baked in), ready for instancing
function flatten(gltf) {
  if (!gltf) return null;
  const byMat = new Map(); gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    const k = o.material.uuid; if (!byMat.has(k)) byMat.set(k, { mat: o.material, list: [] }); byMat.get(k).list.push(g);
  });
  const out = []; for (const { mat, list } of byMat.values()) { const g = mergeGeometries(list); if (g) { g.computeBoundingBox(); mat.envMapIntensity = 0.8; out.push({ g, mat }); } }
  // sit the model on y = 0
  const minY = Math.min(...out.map((o) => o.g.boundingBox.min.y)); for (const o of out) o.g.translate(0, -minY, 0);
  return out;
}

// pick up to `n` flat spots away from the racing surface and from everything already placed
function spots(game, n) {
  const tr = game.track, T = game.terrain, out = [], bl = game.blockers || [];
  const flat = (x, z) => Math.abs(T.heightAt(x + 4, z) - T.heightAt(x - 4, z)) < 0.9 && Math.abs(T.heightAt(x, z + 4) - T.heightAt(x, z - 4)) < 0.9 && T.waterAt(x, z) < 0.1;
  const free = (x, z, r) => !bl.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br + r) && !out.some((s) => Math.hypot(s.x - x, s.z - z) < 30);
  for (let a = 0; a < 90 && out.length < n; a++) {
    let x, z, face;
    if (tr.arena) { const ang = a * 2.39996 + 0.4, r = tr.R + 9 + (a % 3) * 2.5; x = T.cx + Math.cos(ang) * r; z = T.cz + Math.sin(ang) * r; face = Math.atan2(T.cz - z, T.cx - x); }
    else {
      const i = Math.floor(((a * 0.618034 + 0.11) % 1) * tr.N), p = tr.pts[i], sd = a % 2 ? 1 : -1, off = tr.width / 2 + 13 + (a % 4) * 2;
      x = p.x - Math.sin(p.h) * sd * off; z = p.z + Math.cos(p.h) * sd * off; face = Math.atan2(p.z - z, p.x - x);
      let far = true; for (let k = 0; k < tr.N; k += 3) { const q = tr.pts[k]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < (tr.width / 2 + 10) ** 2) { far = false; break; } } if (!far) continue;
    }
    if (!flat(x, z) || !free(x, z, 7)) continue;
    out.push({ x, z, face, seed: a });
  }
  return out;
}

export function buildPaddock(game) {
  if (game.low || game.o.thumb || game.track.stunt || game.track.arena) return Promise.resolve(false); // the arenas sit in a bowl: no flat ground outside the wall
  const list = spots(game, game.track.arena ? 3 : 4); game.paddockN = list.length; if (!list.length) return Promise.resolve(false);
  for (const s of list) (game.blockers ||= []).push([s.x, s.z, 9]);
  // the tarp-covered spare car is solid (a wall), the bottles and cans are dressing only
  for (const s of list) {
    const T = game.terrain, y = T.heightAt(s.x, s.z), yaw = s.face + Math.PI / 2 + (s.seed % 3 - 1) * 0.35;
    s.car = { x: s.x, y, z: s.z, yaw };
    const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, y + 0.7, s.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));
    const col = game.world.createCollider(RAPIER.ColliderDesc.cuboid(2.3, 0.7, 1.0), body); game.handles.set(col.handle, { kind: 'wall' });
  }
  return loadModels().then(([wreck, propane, jerry]) => {
    if (game.dead) return false;
    const W = flatten(wreck), P = flatten(propane), J = flatten(jerry), T = game.terrain, d = new THREE.Object3D();
    const place = (parts, mats) => { if (!parts || !mats.length) return; for (const { g, mat } of parts) { const inst = new THREE.InstancedMesh(g, mat, mats.length); mats.forEach((m, i) => inst.setMatrixAt(i, m)); inst.castShadow = true; inst.receiveShadow = true; game.scene.add(inst); } };
    const mW = [], mP = [], mJ = [];
    // scale the covered car to a 4.6 m saloon whatever the source units
    const wl = W ? Math.max(...W.map((o) => o.g.boundingBox.max.x - o.g.boundingBox.min.x), ...W.map((o) => o.g.boundingBox.max.z - o.g.boundingBox.min.z)) : 1;
    const longX = W ? Math.max(...W.map((o) => o.g.boundingBox.max.x - o.g.boundingBox.min.x)) >= Math.max(...W.map((o) => o.g.boundingBox.max.z - o.g.boundingBox.min.z)) : true;
    for (const s of list) {
      const { x, y, z, yaw } = s.car;
      d.position.set(x, y - 0.03, z); d.rotation.set(0, yaw + (longX ? 0 : Math.PI / 2), 0); d.scale.setScalar(4.6 / wl); d.updateMatrix(); mW.push(d.matrix.clone());
      const R = (k) => { const v = Math.sin(s.seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      const fx = Math.cos(yaw), fz = -Math.sin(yaw), sx = -fz, sz = fx; // car's long axis and its side
      for (let k = 0; k < 3; k++) { const a = 1.8 + k * 0.62, b = 2.2 + R(k) * 0.5; const px = x + fx * (a - 2.4) * 1.0 + sx * b, pz = z + fz * (a - 2.4) + sz * b; d.position.set(px, T.heightAt(px, pz) - 0.02, pz); d.rotation.set(0, R(k + 9) * 6.28, 0); d.scale.setScalar(1); d.updateMatrix(); mP.push(d.matrix.clone()); }
      for (let k = 0; k < 4; k++) { const ang = R(k + 20) * 6.28, r = 3 + R(k + 30) * 1.5; const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r; d.position.set(px, T.heightAt(px, pz) - 0.01, pz); d.rotation.set(0, R(k + 40) * 6.28, k === 3 ? Math.PI / 2 : 0); if (k === 3) d.position.y += 0.12; d.updateMatrix(); mJ.push(d.matrix.clone()); }
    }
    place(W, mW); place(P, mP); place(J, mJ);
    game.paddock = list;
    return true;
  }).catch((e) => { console.warn('paddock', e); return false; });
}
