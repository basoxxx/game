// Draw-call reduction: merge the static meshes below `root` that share a material into one mesh
// per material (geometry baked into root space). Meshes in `skip` (and their subtrees) are kept.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function clean(g) {
  let out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.morphAttributes = {}; out.clearGroups();
  return out;
}
export function mergeStatic(root, skip = new Set(), { castShadow = true, receiveShadow = true } = {}) {
  root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
  const buckets = new Map(), victims = [];
  const visit = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !o.material.transparent && o.visible) {
      const g = clean(o.geometry); _m.multiplyMatrices(_inv, o.matrixWorld); g.applyMatrix4(_m);
      if (_m.determinant() < 0) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); } }
      const key = o.material.uuid; if (!buckets.has(key)) buckets.set(key, { mat: o.material, list: [], shadow: false });
      const b = buckets.get(key); b.list.push(g); b.shadow ||= o.castShadow; victims.push(o);
    }
    for (const c of [...o.children]) visit(c);
  };
  for (const c of [...root.children]) visit(c);
  for (const o of victims) { o.parent?.remove(o); }
  // drop now-empty groups (but keep anything that still holds a kept object)
  const prune = (o) => { for (const c of [...o.children]) prune(c); if (o !== root && !o.isMesh && !o.isInstancedMesh && !o.isLight && !o.children.length && !skip.has(o) && o.type === 'Group') o.parent?.remove(o); };
  prune(root);
  const merged = [];
  for (const { mat, list, shadow } of buckets.values()) {
    const g = list.length === 1 ? list[0] : mergeGeometries(list, false); if (!g) continue;
    const m = new THREE.Mesh(g, mat); m.castShadow = castShadow && shadow; m.receiveShadow = receiveShadow; root.add(m); merged.push(m);
  }
  return merged;
}
