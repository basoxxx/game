// Rendering helpers: PBR textures (Poly Haven, CC0), HDRI lighting, post-processing
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

const BASE = './assets/';
const texLoader = new THREE.TextureLoader();
const cache = new Map();

function load(url, srgb) {
  const key = url + (srgb ? ':s' : '');
  if (cache.has(key)) return cache.get(key);
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// PBR material from a Poly Haven texture set. repeat = [u, v]
export function pbr(id, { repeat = [1, 1], color = 0xffffff, normalScale = 1, roughness = 1, metalness = 0 } = {}) {
  const map = load(`${BASE}tex/${id}_diff_1k.jpg`, true).clone();
  const nor = load(`${BASE}tex/${id}_nor_gl_1k.jpg`).clone();
  const rough = load(`${BASE}tex/${id}_rough_1k.jpg`).clone();
  for (const t of [map, nor, rough]) { t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; }
  return new THREE.MeshStandardMaterial({ map, normalMap: nor, roughnessMap: rough, roughness, metalness, color, normalScale: new THREE.Vector2(normalScale, normalScale) });
}

const HDRIS = { day: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', dusk: 'qwantani_dusk_2_puresky_1k.hdr', night: 'moonless_golf_1k.hdr' };
const hdrCache = {};
export function applyHDRI(renderer, scene, kind = 'day', { background = true, intensity = 1 } = {}) {
  return new Promise((resolve) => {
    const done = (tex) => {
      if (!tex) return resolve(false);
      scene.environment = tex;
      scene.environmentIntensity = intensity;
      if (background) { scene.background = tex; scene.backgroundIntensity = kind === 'night' ? 0.35 : 1; scene.backgroundBlurriness = 0; }
      resolve(true);
    };
    if (hdrCache[kind]) return done(hdrCache[kind]);
    new RGBELoader().load(BASE + 'hdri/' + HDRIS[kind], (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      hdrCache[kind] = t;
      done(t);
    }, undefined, () => done(null));
  });
}

export function makeComposer(renderer, scene, camera, { bloom = 0.22, low = false, ao = false } = {}) {
  if (low) return null;
  try {
    const size0 = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size0.x * renderer.getPixelRatio(), size0.y * renderer.getPixelRatio(), { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    rt.depthTexture = new THREE.DepthTexture(size0.x, size0.y, THREE.FloatType);
    const comp = new EffectComposer(renderer, rt);
    comp.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    if (ao) {
      try {
        const g = new GTAOPass(scene, camera, size.x, size.y);
        g.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.6, thickness: 2, scale: 1, samples: 12 });
        g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        g.blendIntensity = 0.85;
        comp.addPass(g); comp.ao = g;
      } catch (e) { console.warn('AO off', e); }
    }
    const b = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloom, 0.55, 0.88);
    comp.addPass(b);
    comp.addPass(new OutputPass());
    comp.addPass(new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio()));
    comp.bloom = b;
    return comp;
  } catch (e) { console.warn('postprocessing off', e); return null; }
}
