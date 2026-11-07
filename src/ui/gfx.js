// Rendering helpers: PBR textures (Poly Haven, CC0), HDRI lighting, post-processing
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
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
export function loadTex(path, srgb = true) { return load(BASE + path, srgb); }

// PBR material from a Poly Haven texture set. repeat = [u, v]
export function pbr(id, { repeat = [1, 1], color = 0xffffff, normalScale = 1, roughness = 1, metalness = 0 } = {}) {
  const map = load(`${BASE}tex/${id}_diff_1k.jpg`, true).clone();
  const nor = load(`${BASE}tex/${id}_nor_gl_1k.jpg`).clone();
  const rough = load(`${BASE}tex/${id}_rough_1k.jpg`).clone();
  // clones share the image source: the upload happens once the original finishes loading
  for (const t of [map, nor, rough]) t.repeat.set(repeat[0], repeat[1]);
  return new THREE.MeshStandardMaterial({ map, normalMap: nor, roughnessMap: rough, roughness, metalness, color, normalScale: new THREE.Vector2(normalScale, normalScale) });
}

// ---- surface detail shader patch -------------------------------------------------------
// Breaks texture tiling (second rotated sample blended by world-space noise), adds macro
// colour variation and, for the racing surface, rain wetness with puddles (mirror-like
// patches with flattened normals). WET is shared by every patched material.
export const WET = { value: 0 };
const NOISE_GLSL = /* glsl */`
  varying vec3 vWPos;
  uniform float uWet;
  float dh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float dvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dh21(i), dh21(i + vec2(1.0, 0.0)), f.x), mix(dh21(i + vec2(0.0, 1.0)), dh21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float dfbm(vec2 p) { return dvn(p) * 0.5 + dvn(p * 2.03 + 17.1) * 0.3 + dvn(p * 4.07 + 3.7) * 0.2; }
`;
export function detailPatch(mat, { antiTile = true, macro = 0.18, macroScale = 0.02, tint = null, tintAmt = 0, wet = false, rough = null, key = '' } = {}) {
  const tintV = new THREE.Color(tint ?? 0xffffff);
  mat.userData.wetPatch = wet;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = WET;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const f = (n) => n.toFixed(4);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE_GLSL);
    fs = fs.replace('#include <map_fragment>', /* glsl */`
      float pud = 0.0;
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        ${antiTile ? `vec4 s2 = texture2D(map, vec2(vMapUv.y, -vMapUv.x) * 0.43 + 0.37);
        sampledDiffuseColor = mix(sampledDiffuseColor, s2, smoothstep(0.3, 0.7, dfbm(vWPos.xz * 0.035 + 5.0)));` : ''}
        diffuseColor *= sampledDiffuseColor;
      #endif
      float mN = dfbm(vWPos.xz * ${f(macroScale)});
      diffuseColor.rgb *= 1.0 + (mN - 0.5) * ${f(macro * 2)};
      ${tintAmt ? `diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(${f(tintV.r)}, ${f(tintV.g)}, ${f(tintV.b)}), smoothstep(0.45, 0.75, dfbm(vWPos.xz * ${f(macroScale * 0.6)} + 31.0)) * ${f(tintAmt)});` : ''}
      ${wet ? `pud = smoothstep(0.56, 0.7, dfbm(vWPos.xz * 0.11 + 11.0)) * smoothstep(0.25, 0.8, uWet);
      diffuseColor.rgb *= 1.0 - 0.38 * uWet - 0.2 * pud;` : ''}
    `);
    if (rough) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = ${f(rough[0])} + ${f(rough[1] - rough[0])} * roughnessFactor;`);
    if (wet) {
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, uWet * 0.7); roughnessFactor = mix(roughnessFactor, 0.03, pud);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize(vNormal) * faceDirection, max(pud, uWet * 0.5)));');
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `detail|${antiTile}|${macro}|${macroScale}|${tintAmt}|${tintV.getHex()}|${wet}|${rough}|${key}`;
  return mat;
}

const HDRIS = { day: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', dusk: 'qwantani_dusk_2_puresky_1k.hdr', night: 'moonless_golf_1k.hdr' };
const hdrCache = {};
// direction of the brightest pixel (the sun) in three.js equirect convention
function findSun(tex) {
  const { data, width: W, height: H } = tex.image;
  if (!data || !(data instanceof Float32Array)) return null;
  let best = -1, bi = 0;
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; const l = data[k] * 0.2126 + data[k + 1] * 0.7152 + data[k + 2] * 0.0722; if (l > best) { best = l; bi = y * W + x; } }
  const px = bi % W, py = Math.floor(bi / W);
  const u = (px + 0.5) / W, v = 1 - (py + 0.5) / H; // flipY
  const el = (v - 0.5) * Math.PI, az = (u - 0.5) * 2 * Math.PI;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
}
// average linear colour of the sky just above the horizon (used as fog colour)
function findHorizon(tex) {
  const { data, width: W, height: H } = tex.image;
  if (!data || !(data instanceof Float32Array)) return null;
  const s = [0, 0, 0]; let n = 0;
  for (let y = Math.floor(H * 0.42); y < H * 0.49; y++) for (let x = 0; x < W; x += 2) { const k = (y * W + x) * 4; s[0] += Math.min(4, data[k]); s[1] += Math.min(4, data[k + 1]); s[2] += Math.min(4, data[k + 2]); n++; }
  return new THREE.Color().setRGB(s[0] / n, s[1] / n, s[2] / n, THREE.LinearSRGBColorSpace);
}
export function hdriSun(kind = 'day') { return hdrCache[kind]?.userData.sun || null; }
export function hdriHorizon(kind = 'day') { return hdrCache[kind]?.userData.horizon || null; }
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
    new RGBELoader().setDataType(THREE.FloatType).load(BASE + 'hdri/' + HDRIS[kind], (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      try { t.userData.sun = findSun(t); t.userData.horizon = findHorizon(t); } catch { t.userData.sun = null; }
      hdrCache[kind] = t;
      done(t);
    }, undefined, () => done(null));
  });
}

// final colour grade in display space: gentle S-curve contrast, saturation, warm highlights /
// cool shadows split-toning and a soft vignette
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uCon: { value: 1.08 }, uSat: { value: 1.08 }, uVig: { value: 0.32 }, uWarm: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uCon, uSat, uVig, uWarm; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec3 s = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb);
      c.rgb = mix(c.rgb, s, uCon - 1.0);
      c.rgb += uWarm * vec3(1.0, 0.35, -0.6) * smoothstep(0.45, 1.0, l) + uWarm * vec3(-0.4, 0.0, 0.5) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = vUv - 0.5; d.x *= 1.25;
      c.rgb *= mix(1.0, smoothstep(0.95, 0.25, length(d)), uVig);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
};

export function makeComposer(renderer, scene, camera, { bloom = 0.22, low = false, ao = false, grade = true } = {}) {
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
    if (grade) { const gp = new ShaderPass(GradeShader); comp.addPass(gp); comp.grade = gp; }
    comp.addPass(new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio()));
    comp.bloom = b;
    return comp;
  } catch (e) { console.warn('postprocessing off', e); return null; }
}
