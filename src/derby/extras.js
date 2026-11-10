// Extra venue dressing for "Scontro Totale": Armco barriers on the tarmac figure-of-eight, supporters'
// flags and flares on every grandstand, lamp glare and light pools at night, quarry machinery.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CROWD } from './scenery.js';

const UP = new THREE.Vector3(0, 1, 0);
function softDot(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)') { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.3, mid); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }

export function buildExtras(game, stands = []) {
  const v = game.venue, tr = game.track, T = game.terrain, S = game.scene, night = game.night;
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9adb2, roughness: 0.42, metalness: 0.85 });
  // ---- Armco: W-beam on posts along both edges of the tarmac eight (not across the crossing)
  if (v.eight && v.surface === 'asphalt') {
    const seg = 5, beam = mergeGeometries([new THREE.BoxGeometry(seg + 0.06, 0.13, 0.05).translate(0, 0.62, 0.02), new THREE.BoxGeometry(seg + 0.06, 0.13, 0.05).translate(0, 0.42, 0.02), new THREE.BoxGeometry(seg + 0.06, 0.1, 0.03).translate(0, 0.52, -0.01), new THREE.BoxGeometry(0.1, 0.75, 0.12).translate(-seg / 2, 0.37, -0.07)]);
    const list = [], off = tr.width / 2 + 5.2;
    for (let i = 0; i < tr.N; i += 2) {
      if (tr.crossings.some((c) => Math.min(Math.abs(c - i), tr.N - Math.abs(c - i)) < 22)) continue;
      const p = tr.pts[i]; for (const sd of [1, -1]) { const x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off; let ok = true; for (let k = 0; k < tr.N; k += 3) { const d = Math.abs(k - i); if (Math.min(d, tr.N - d) < 30) continue; const q = tr.pts[k]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < (off + 3) ** 2) { ok = false; break; } } if (ok) list.push([x, T.heightAt(x, z), z, -p.h + (sd > 0 ? Math.PI : 0)]); }
    }
    const inst = new THREE.InstancedMesh(beam, steel, list.length), d = new THREE.Object3D();
    list.forEach(([x, y, z, yaw], i) => { d.position.set(x, y - 0.05, z); d.rotation.y = yaw; d.updateMatrix(); inst.setMatrixAt(i, d.matrix); const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 0.4, z).setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw))); const col = game.world.createCollider(RAPIER.ColliderDesc.cuboid(seg / 2 + 0.05, 0.4, 0.12).setFriction(0.3), body); game.handles.set(col.handle, { kind: 'wall' }); });
    inst.castShadow = true; inst.receiveShadow = true; S.add(inst);
  }
  // ---- supporters: waving flags above the stands, flares that burn red and green
  const flags = [], flares = [];
  for (const st of stands) {
    const n = Math.max(2, Math.round(st.len / 9));
    for (let k = 0; k < n; k++) {
      const u = (Math.random() - 0.5) * (st.len - 4), r = 1 + Math.floor(Math.random() * (st.rows - 2));
      const lx = u, ly = r * 0.55 + 1.2, lz = -r * 0.8; const cs = Math.cos(st.yaw), sn = Math.sin(st.yaw);
      const wx = st.x + lx * cs + lz * sn, wz = st.z - lx * sn + lz * cs;
      if (k % 3 === 2) flares.push([wx, st.y + ly + 0.4, wz, Math.random() < 0.6 ? 0 : 1]); else flags.push([wx, st.y + ly, wz, st.yaw + (Math.random() - 0.5) * 0.8]);
    }
  }
  if (flags.length) {
    const g = mergeGeometries([new THREE.PlaneGeometry(1.7, 1.05, 8, 2).translate(0.85, 2.2, 0), new THREE.CylinderGeometry(0.025, 0.025, 2.8, 5).translate(0, 1.4, 0)]);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => { sh.uniforms.uCrowdT = CROWD.time; sh.uniforms.uHype = CROWD.hype; sh.vertexShader = 'uniform float uCrowdT; uniform float uHype;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float fph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z; float fk = clamp(position.x, 0.0, 1.7);\n transformed.z += sin(position.x * 4.0 - uCrowdT * (5.0 + uHype * 5.0) + fph) * 0.16 * fk; transformed.y += sin(position.x * 3.0 - uCrowdT * 4.0 + fph) * 0.05 * fk;\n float sw = sin(uCrowdT * (1.6 + uHype * 2.5) + fph) * (0.25 + uHype * 0.3); transformed.x += sw * position.y * 0.3;'); };
    mat.customProgramCacheKey = () => 'dz-flag';
    const inst = new THREE.InstancedMesh(g, mat, flags.length), d = new THREE.Object3D(), c = new THREE.Color(); const cols = [0xd01818, 0xf2f2f2, 0xffd400, 0x1e5fd1, 0x1f8a3a, 0xff6a00, 0x111111];
    flags.forEach(([x, y, z, yaw], i) => { d.position.set(x, y, z); d.rotation.set(0, yaw, (Math.random() - 0.5) * 0.3); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); inst.setColorAt(i, c.setHex(cols[Math.floor(Math.random() * cols.length)])); });
    inst.frustumCulled = false; S.add(inst);
  }
  if (flares.length) {
    const pos = new Float32Array(flares.length * 3), col = new Float32Array(flares.length * 3);
    flares.forEach(([x, y, z, k], i) => { pos.set([x, y, z], i * 3); col.set(k ? [0.3, 1, 0.35] : [1, 0.22, 0.12], i * 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pm = new THREE.PointsMaterial({ map: softDot(), size: night ? 5 : 2.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true });
    const pts = new THREE.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 3; S.add(pts);
    game.flares = { list: flares, mat: pm, base: night ? 5 : 2.6 };
  }
  // ---- night: glare on every lamp head and a pool of light on the ground under it
  if (night && game.lampPos?.length) {
    const L = game.lampPos, ph = v.stadium ? 16 : 11, pos = new Float32Array(L.length * 3);
    const pool = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pm = new THREE.MeshBasicMaterial({ map: softDot('rgba(255,236,200,0.9)', 'rgba(255,225,180,0.4)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: game.look.lit ? 0.16 : 0.34, polygonOffset: true, polygonOffsetFactor: -3 });
    const inst = new THREE.InstancedMesh(pool, pm, L.length), d = new THREE.Object3D();
    L.forEach(([x, y, z, yaw], i) => { const fx = x + Math.sin(yaw) * 1.0, fz = z + Math.cos(yaw) * 1.0; pos.set([fx, y + ph - 0.3, fz], i * 3); const gx = x + Math.sin(yaw) * 7, gz = z + Math.cos(yaw) * 7; d.position.set(gx, T.heightAt(gx, gz) + 0.12, gz); d.scale.set(34, 1, 34); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
    inst.frustumCulled = false; inst.renderOrder = 1; S.add(inst);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot('rgba(255,244,220,1)', 'rgba(255,230,190,0.3)'), size: 9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); pts.frustumCulled = false; pts.renderOrder = 3; S.add(pts);
  }
  // ---- quarry machinery: an excavator and a dump truck parked on the benches
  if (v.quarry) {
    const yel = new THREE.MeshStandardMaterial({ color: 0xe0a51c, roughness: 0.6, metalness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.9 }), glass = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.1, metalness: 0.6 });
    const B = (w, h, dd, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = o.receiveShadow = true; return o; };
    const hw = tr.width / 2; let placed = 0;
    for (let a = 0; a < 60 && placed < 3; a++) {
      const i = Math.floor(((a * 0.137 + 0.05) % 1) * tr.N), p = tr.pts[i], sd = a % 2 ? 1 : -1, off = hw + 17 + (a % 5) * 2;
      const x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off, y = T.heightAt(x, z);
      if (Math.abs(T.heightAt(x + 4, z) - T.heightAt(x - 4, z)) > 1.6 || Math.abs(T.heightAt(x, z + 4) - T.heightAt(x, z - 4)) > 1.6) continue;
      if ((game.blockers || []).some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br + 8)) continue;
      let far = true; for (let k = 0; k < tr.N; k += 3) { const q = tr.pts[k]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < (hw + 12) ** 2) { far = false; break; } } if (!far) continue;
      const g = new THREE.Group();
      if (placed % 2 === 0) { // excavator
        for (const zz of [-1.3, 1.3]) g.add(B(5, 0.9, 0.7, dark, 0, 0.45, zz));
        g.add(B(4, 1.6, 2.8, yel, -0.2, 1.9, 0)); g.add(B(1.5, 1.6, 1.2, glass, 1.0, 3.0, -0.7)); g.add(B(1.8, 1.2, 2.6, dark, -1.6, 2.9, 0));
        g.add(B(6, 0.6, 0.5, yel, 3.6, 4.3, 0.6, 0.55)); g.add(B(4.2, 0.45, 0.4, yel, 7.2, 4.4, 0.6, -0.95)); g.add(B(1.4, 1.1, 1.2, dark, 8.4, 2.3, 0.6, 0.3));
      } else { // dump truck
        for (const xx of [-2.6, -1.2, 2.4]) for (const zz of [-1.3, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.6, 14).rotateX(Math.PI / 2), dark); w.position.set(xx, 0.85, zz); w.castShadow = true; g.add(w); }
        g.add(B(7.4, 0.5, 2.4, dark, 0, 1.4, 0)); g.add(B(1.9, 1.9, 2.6, yel, 3.0, 2.6, 0)); g.add(B(1.0, 0.8, 2.3, glass, 3.5, 3.1, 0)); g.add(B(5.2, 1.8, 3.0, yel, -1.1, 2.9, 0, 0.08)); g.add(B(1.6, 0.25, 3.0, yel, 2.2, 3.9, 0));
      }
      g.position.set(x, y - 0.1, z); g.rotation.y = a * 1.7; S.add(g); (game.blockers ||= []).push([x, z, 8]);
      const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 1.5, z)); const col = game.world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 3.4), body); game.handles.set(col.handle, { kind: 'wall' });
      placed++;
    }
  }
}

// additive head-lamp cones for a car at night (cheap: no real light)
let _coneMat = null;
export function headBeams(L, y, zs = [0.55, -0.55]) {
  if (!_coneMat) { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,244,215,0.75)'); gr.addColorStop(1, 'rgba(255,244,215,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); _coneMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); }
  const grp = new THREE.Group();
  for (const z of zs) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.5, 9, 12, 1, true).translate(0, -4.5, 0), _coneMat); m.rotation.z = Math.PI / 2 - 0.07; m.position.set(L, y, z); m.renderOrder = 2; grp.add(m); }
  return grp;
}
