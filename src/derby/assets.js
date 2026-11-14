// Scanned CC0 assets for "Scontro Totale" (public/assets/derby, see public/assets/CREDITS.txt):
// dirt and mud ground colour maps, glTF barrel and tyre props (webp textures, 512 px) and an
// overcast sky for the rain. The procedural fallbacks stay in place until (and unless) these load;
// the low graphics tier keeps the light procedural props and the flat rain sky.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadTex } from '../ui/gfx.js';

// racing-surface colour map (the ground shader also reads its relief from it) and the tint that
// suits it; null = keep the shared gravel / asphalt set
export function surfaceTex(v) {
  if (v.surface === 'mud') return { map: loadTex('derby/mud_diff.webp'), tint: '0.6,0.48,0.36' };
  if (v.surface === 'dirt') return { map: loadTex('derby/dirt_diff.webp'), tint: v.stadium ? '0.98,0.86,0.74' : '1.06,0.98,0.88' };
  return null;
}

let gltfP = null;
function loadGltf() {
  if (gltfP) return gltfP;
  const L = new GLTFLoader(), get = (n) => new Promise((res) => L.load('./assets/derby/' + n + '.gltf', (g) => res(g), undefined, () => res(null)));
  return (gltfP = Promise.all([get('barrel'), get('tyre')]));
}
function firstMesh(g) { let m = null; g?.scene.traverse((o) => { if (!m && o.isMesh) m = o; }); return m; }
function propMat(src, tint) {
  const m = src.material.clone(); if (tint) m.color.set(tint);
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) m[k].anisotropy = 4;
  m.envMapIntensity = 0.9; return m;
}

// swaps the geometry and material of the instanced barrel and tyre-stack props for the scanned models
export async function upgradeProps(game) {
  if (game.low) return false; // the medium tier keeps the procedural tyre stacks (see the vertex budget below)
  const [barrel, tyre] = await loadGltf();
  if (game.dead) return false;
  const T = game.propTypes;
  const bm = firstMesh(barrel);
  if (bm && T.barrel) {
    const g = bm.geometry.clone(); g.computeBoundingBox(); const bb = g.boundingBox, h = bb.max.y - bb.min.y;
    g.translate(0, -(bb.max.y + bb.min.y) / 2, 0); g.scale(0.9 / h * 1.02, 0.9 / h, 0.9 / h * 1.02);
    swap(T.barrel, g, propMat(bm));
  }
  const tm = firstMesh(tyre);
  if (tm && T.tyres) {
    // a stack of three tyres, axis vertical, each turned a little (radius 0.43 m like the collider)
    const one = tm.geometry.clone(); one.computeBoundingBox(); const bb = one.boundingBox, r = (bb.max.x - bb.min.x) / 2;
    one.rotateX(Math.PI / 2); const s = 0.43 / r; one.scale(s, s * 1.05, s);
    const parts = [0, 1, 2].map((k) => one.clone().rotateY(k * 1.9).translate(0, -0.26 + k * 0.26, 0));
    for (const p of parts) for (const n of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(n)) p.deleteAttribute(n);
    const g = mergeGeometries(parts);
    // vertex budget: a scanned stack is ~6k vertices; venues lined with a hundred stacks keep the light ones
    if (g && T.tyres.list.length * g.attributes.position.count <= 420000 && !game.med) swap(T.tyres, g, propMat(tm));
  }
  return true;
}
function swap(P, geo, mat) { P.geo = geo; P.mat = mat; if (P.inst) { P.inst.geometry = geo; P.inst.material = mat; } }

// overcast sky for rain (background and reflections); resolves to false when it cannot load
let rainSky = null;
export function overcastSky() {
  return (rainSky ||= new Promise((res) => new RGBELoader().setDataType(THREE.HalfFloatType).load('./assets/derby/overcast_soil_puresky_1k.hdr', (t) => { t.mapping = THREE.EquirectangularReflectionMapping; res(t); }, undefined, () => res(null))));
}
