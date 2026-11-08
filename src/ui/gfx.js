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
import { getSettings } from '../engine/state.js';

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
// track: { halfW, uScale } turns on the racing-surface model. The mesh then carries an
// attribute aTrk = (lateral offset m, racing-line offset m, cornerness 0..1) and uv.y * uScale
// = distance along the track: rubbered racing line, marbles off-line in corners, dusty
// unused edges, repair patches with seams, and a drying line in the rain.
// mow: { uScale } adds mowing stripes (uv.y * uScale = metres along the track) and clumpy
// grass variation for verges.
export function detailPatch(mat, { antiTile = true, macro = 0.18, macroScale = 0.02, tint = null, tintAmt = 0, wet = false, rough = null, key = '', track = null, mow = null } = {}) {
  const tintV = new THREE.Color(tint ?? 0xffffff);
  mat.userData.wetPatch = wet;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = WET;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;' + (track ? '\nattribute vec3 aTrk; varying vec3 vTrk;' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;' + (track ? '\nvTrk = aTrk;' : ''));
    const f = (n) => n.toFixed(4);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE_GLSL + (track ? '\nvarying vec3 vTrk;' : ''));
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
      float rub = 0.0, wetL = uWet;
      ${track && track.ruts ? `#ifdef USE_MAP
      {
        // loose-surface stage: two compacted wheel ruts along the driving line (darker, smoother;
        // icy on snow), loose gravel ridges between them and along the edges, scattered stones
        float lat = vTrk.x, along = vMapUv.y * ${f(track.uScale)};
        float dl = lat - vTrk.y + 0.25 * sin(along * 0.031) * (1.0 - vTrk.z);
        float rr = abs(abs(dl) - 0.85 - 0.06 * sin(along * 0.11));
        rub = (1.0 - smoothstep(0.16, 0.52, rr)) * (0.7 + 0.3 * dvn(vec2(lat * 5.0, along * 0.12)));
        diffuseColor.rgb *= 1.0 - ${track.snow ? '0.1' : '0.26'} * rub;
        ${track.snow ? 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.86, 0.95), rub * 0.8);' : ''}
        float ridge = (1.0 - smoothstep(0.0, 0.35, abs(dl))) * 0.6 + smoothstep(${f(track.halfW - 1.5)}, ${f(track.halfW - 0.1)}, abs(lat));
        float stone = step(0.7, dh21(floor(vWPos.xz * 14.0))) * (0.4 + 0.6 * dvn(vWPos.xz * 3.0));
        diffuseColor.rgb *= 1.0 + ridge * (0.1 + 0.22 * stone) - 0.08 * stone * (1.0 - rub);
        // the corners get swept clean towards the outside: wider, darker driven area
        diffuseColor.rgb *= 1.0 - 0.08 * vTrk.z * (1.0 - smoothstep(1.5, 2.6, abs(dl)));
        wetL = uWet * (0.7 + 0.6 * rub);
      }
      #endif` : track ? `#ifdef USE_MAP
      {
        float lat = vTrk.x, along = vMapUv.y * ${f(track.uScale)};
        float dl = abs(lat - vTrk.y);
        // rubbered racing line: two dark tyre bands that merge, streaky along the track
        float streak = dvn(vec2(lat * 3.1, along * 0.04)) * 0.6 + dvn(vWPos.xz * 0.35) * 0.4;
        rub = (1.0 - smoothstep(0.5, 2.3, dl)) * (0.7 + 0.3 * streak);
        diffuseColor.rgb *= 1.0 - 0.34 * rub;
        // marbles: rubber pick-up granules just off the line in corners
        float mb = smoothstep(2.4, 3.4, dl) * (1.0 - smoothstep(4.6, 6.4, dl)) * vTrk.z;
        float gran = step(0.72, dh21(floor(vWPos.xz * 26.0))) * (0.5 + 0.5 * dvn(vWPos.xz * 1.7));
        diffuseColor.rgb *= 1.0 - mb * (0.12 + 0.55 * gran);
        // unused edges: dustier, lighter, slightly warmer
        float edge = smoothstep(${f(track.halfW - 2.6)}, ${f(track.halfW - 0.2)}, abs(lat)) * (0.6 + 0.4 * dvn(vWPos.xz * 0.6));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.12, 1.04), edge * 0.6);
        // repair patches (fresh darker or old faded asphalt) with tar-sealed seams
        vec2 pc = vec2(along / 17.0, (lat + ${f(track.halfW)}) / 4.4);
        vec2 ci = floor(pc), cf = fract(pc);
        float ph = dh21(ci + 7.3);
        if (ph > 0.9) {
          vec2 lo = vec2(dh21(ci + 1.1), dh21(ci + 2.7)) * 0.3, hi = 1.0 - vec2(dh21(ci + 3.9), dh21(ci + 5.2)) * 0.3;
          float inP = step(lo.x, cf.x) * step(cf.x, hi.x) * step(lo.y, cf.y) * step(cf.y, hi.y);
          vec2 dd = min(cf - lo, hi - cf) * vec2(17.0, 4.4);
          float seam = inP * (1.0 - smoothstep(0.02, 0.08, min(dd.x, dd.y)));
          diffuseColor.rgb *= mix(1.0, ph > 0.95 ? 0.8 : 1.12, inP) * (1.0 - 0.55 * seam);
        }
        // crack sealing lines (thin dark meandering tar)
        float ck = abs(dvn(vec2(along * 0.09, lat * 0.35) + 40.0) - 0.5);
        diffuseColor.rgb *= 1.0 - 0.2 * (1.0 - smoothstep(0.003, 0.009, ck)) * step(0.72, dvn(vec2(along * 0.02, 3.0)));
        // the racing line dries first
        wetL = uWet * (1.0 - 0.5 * rub * smoothstep(0.9, 0.35, uWet));
      }
      #endif` : ''}
      ${mow ? `#ifdef USE_MAP
      {
        float along = vMapUv.y * ${f(mow.uScale)};
        float band = step(0.5, fract(along / 9.0 + 0.04 * sin(along * 0.05)));
        diffuseColor.rgb *= mix(0.9, 1.08, band);
        float clump = dfbm(vWPos.xz * 1.3 + 7.0), fine = dvn(vWPos.xz * 6.0);
        diffuseColor.rgb *= 0.82 + 0.26 * clump + 0.08 * (fine - 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.02, 0.7), smoothstep(0.62, 0.8, dfbm(vWPos.xz * 0.08 + 3.0)) * 0.5);
      }
      #endif` : ''}
      ${wet ? `pud = smoothstep(0.5, 0.66, dfbm(vWPos.xz * 0.11 + 11.0)) * smoothstep(0.25, 0.8, wetL)${track ? ` * (0.45 + 0.9 * smoothstep(${f(track.halfW - 3.5)}, ${f(track.halfW)}, abs(vTrk.x)))` : ''};
      diffuseColor.rgb *= 1.0 - 0.38 * wetL - 0.2 * pud;` : ''}
    `);
    // remap first, then wetness (so puddles can still reach mirror-like roughness)
    const rr = (rough ? `\nroughnessFactor = ${f(rough[0])} + ${f(rough[1] - rough[0])} * roughnessFactor;` : '') + (track && track.ruts ? `\nroughnessFactor *= 1.0 - ${track.snow ? '0.55' : '0.25'} * rub;` : '') + (wet ? '\nroughnessFactor *= 1.0 - 0.12 * rub; roughnessFactor = mix(roughnessFactor, 0.16, wetL * 0.75); roughnessFactor = mix(roughnessFactor, 0.03, pud);' : '');
    if (rr) fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + rr);
    if (wet) {
      fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize(vNormal) * faceDirection, max(pud, wetL * 0.5)));');
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `detail|${antiTile}|${macro}|${macroScale}|${tintAmt}|${tintV.getHex()}|${wet}|${rough}|${key}|${track ? track.halfW + ',' + track.uScale + ',' + !!track.ruts + !!track.snow : ''}|${mow ? mow.uScale : ''}`;
  return mat;
}

const HDRIS = { day: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', afternoon: 'qwantani_late_afternoon_puresky_1k.hdr', dusk: 'qwantani_dusk_2_puresky_1k.hdr', night: 'moonless_golf_1k.hdr' };
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
      // some skies store a sun brighter than half-float range: the PMREM (half float) would turn
      // it into Inf/NaN and black out every reflection, so clamp the peak
      try { const a = t.image.data; if (a instanceof Float32Array) { let hit = false; for (let i = 0; i < a.length; i++) if (a[i] > 20000) { a[i] = 20000; hit = true; } if (hit) t.needsUpdate = true; } } catch {}
      // the night sky (a golf course near a town) carries a bright orange light-pollution band
      // along the horizon: pull it down and tint it toward a cold, deep blue so the night
      // circuits get a dark sky with only a faint glow low down
      if (kind === 'night') try {
        const { data: a, width: W, height: H } = t.image;
        if (a instanceof Float32Array) {
          for (let y = 0; y < H; y++) {
            const el = 0.5 - (y + 0.5) / H; // +0.5 = zenith (flipY data: row 0 at the top)
            const h = Math.min(1, Math.max(0, el / 0.4)), k = 0.1 + 0.9 * (h * h * (3 - 2 * h)) ** 1.5;
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4, r = a[i], g = a[i + 1], b = a[i + 2], l = r * 0.2126 + g * 0.7152 + b * 0.0722;
              const m = Math.min(1, 0.3 + 0.7 * h), lk = Math.min(l, 0.6) * k;
              a[i] = (r * m + l * (1 - m) * 0.55) * k * 0.8; a[i + 1] = (g * m + l * (1 - m) * 0.75) * k * 0.9; a[i + 2] = (b * m + l * (1 - m) * 1.25) * k + lk * 0.05;
              // the floodlights of the golf course near the horizon: squash them to a dim smudge
              const cap = 0.012 + 0.3 * h * h, l2 = a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722;
              if (l2 > cap) { const f = (cap + (l2 - cap) / (1 + (l2 - cap) * 8)) / l2; a[i] *= f; a[i + 1] *= f; a[i + 2] *= f; }
            }
          }
          t.needsUpdate = true;
        }
      } catch {}
      try { t.userData.sun = findSun(t); t.userData.horizon = findHorizon(t); } catch { t.userData.sun = null; }
      hdrCache[kind] = t;
      done(t);
    }, undefined, () => done(null));
  });
}

// depth of field (HDR, right after the scene render): circle of confusion from the linear depth
// (logarithmic depth buffer decoded), 24-tap disc gather; samples nearer than the pixel only
// count when they are blurred themselves, so sharp foreground edges do not bleed outwards.
// uFocus = focus distance (m), uRange = in-focus depth band (m), uMax = max radius (px).
const DofShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uFocus: { value: 10 }, uRange: { value: 4 }, uMax: { value: 6 }, uLogF: { value: Math.log2(6001) }, uNear: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`uniform sampler2D tDiffuse, tDepth; uniform vec2 uTexel; uniform float uFocus, uRange, uMax, uLogF, uNear; varying vec2 vUv;
    float linZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return exp2(d * uLogF) - 1.0; }
    float coc(float z) { float c = (z - uFocus) / uRange; return clamp(c > 0.0 ? c * 0.5 : -c * uNear, 0.0, 1.0); }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float z = linZ(vUv), c = coc(z);
      vec3 acc = base.rgb; float wsum = 1.0;
      for (int i = 0; i < 24; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 24.0), a = fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * r * uMax * uTexel;
        vec2 suv = vUv + o * max(c, 0.0);
        float sz = linZ(suv), sc = coc(sz);
        float w = sz < z - 0.5 ? sc : 1.0;
        w *= step(r * 0.98, max(c, sc) + 0.02);
        acc += texture2D(tDiffuse, suv).rgb * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`,
};

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

// ---- visual filters (player-selectable colour grading) -------------------------------
// Final pass after anti-aliasing, in display space: preset grade (vibrance, clarity,
// teal-orange, warm glow, haze), contrast-adaptive sharpening, film grain, vignette and
// colour-blind daltonisation. Settings keys: gfxFilter, gfxSharpen, gfxGrain, gfxVignette,
// gfxColorblind. 'naturale' with every toggle at its default disables the pass (no cost).
export const FILTER_PRESETS = {
  naturale: { label: 'Naturale', desc: 'Resa fedele, nessun filtro' },
  vivido: { label: 'Vivido', desc: 'Colori più vivaci e contrasto locale', sat: 1.04, vib: 0.4, con: 1.05, local: 0.22 },
  cinematico: { label: 'Cinematico', desc: 'Toni ottanio-arancio, vignettatura e grana pellicola', sat: 0.9, con: 1.1, teal: 0.6, lift: 0.025, vig: 0.42, grain: 0.035, tint: [1.0, 0.99, 0.97] },
  retro: { label: 'Retrò', desc: 'Look dei racing game anni 2000: bagliore caldo, colori saturi, foschia', sat: 1.28, vib: 0.15, con: 0.97, bloom: [2.2, 0.72, 0.85], haze: 0.07, hazeCol: [0.98, 0.9, 0.78], tint: [1.05, 1.0, 0.9], vig: 0.12 },
  contrasto: { label: 'Alto contrasto', desc: 'Massima leggibilità: chiarezza, contrasto e nitidezza', sat: 1.06, con: 1.12, local: 0.35, sharp: 0.45 },
};
export const COLORBLIND_MODES = { off: 'Disattivata', deuter: 'Deuteranopia', protan: 'Protanopia', tritan: 'Tritanopia' };

// colour-vision-deficiency simulation (Machado et al. 2009, severity 1, linear RGB)
const CVD = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuter: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};
// daltonisation: out = c + K (c - sim(c)) -> one 3x3 matrix (row-major); K moves the lost
// information into the channels the viewer can still tell apart
export function colorblindMatrix(mode) {
  const S = CVD[mode]; if (!S) return null;
  const K = mode === 'tritan' ? [0, 0, 0.7, 0, 0, 0.7, 0, 0, 0] : [0, 0, 0, 0.7, 0, 0, 0.7, 0, 0];
  const E = [1 - S[0], -S[1], -S[2], -S[3], 1 - S[4], -S[5], -S[6], -S[7], 1 - S[8]];
  const M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let v = 0; for (let k = 0; k < 3; k++) v += K[r * 3 + k] * E[k * 3 + c]; M[r * 3 + c] += v; }
  return M;
}

const FilterShader = {
  uniforms: {
    tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uTime: { value: 0 },
    pSat: { value: 1 }, pVib: { value: 0 }, pCon: { value: 1 }, pLocal: { value: 0 }, pTeal: { value: 0 },
    pHaze: { value: 0 }, pHazeCol: { value: new THREE.Color(1, 1, 1) }, pLift: { value: 0 }, pTint: { value: new THREE.Vector3(1, 1, 1) },
    pVig: { value: 0 }, pGrain: { value: 0 }, pSharp: { value: 0 }, uCB: { value: new THREE.Matrix3() }, uCBOn: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uTime;
    uniform float pSat, pVib, pCon, pLocal, pTeal, pHaze, pLift, pVig, pGrain, pSharp, uCBOn;
    uniform vec3 pHazeCol, pTint; uniform mat3 uCB;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 tap(vec2 o) { return texture2D(tDiffuse, vUv + o * uTexel).rgb; }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      // contrast-adaptive sharpening (after AMD FidelityFX CAS)
      if (pSharp > 0.0) {
        vec3 a = tap(vec2(0.0, -1.0)), b = tap(vec2(-1.0, 0.0)), d = tap(vec2(1.0, 0.0)), e = tap(vec2(0.0, 1.0));
        vec3 mn = min(c, min(min(a, b), min(d, e))), mx = max(c, max(max(a, b), max(d, e)));
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
        vec3 w = -amp * 0.2 * clamp(pSharp, 0.0, 1.0);
        c = clamp((c + (a + b + d + e) * w) / (1.0 + 4.0 * w), 0.0, 1.0);
      }
      float l = luma(c);
      // clarity: local contrast on luminance against a two-ring neighbourhood average
      if (pLocal > 0.0) {
        float lb = 0.0;
        for (int i = 0; i < 8; i++) {
          float an = float(i) * 0.7853982;
          vec2 o = vec2(cos(an), sin(an));
          lb += luma(tap(o * 4.0)) + luma(tap(vec2(o.y - o.x, o.x + o.y) * 6.5));
        }
        lb *= 0.0625;
        float det = clamp(l - lb, -0.15, 0.15) * pLocal * 6.4 * l * (1.0 - l);
        c *= (l + det) / max(l, 1e-3);
        l = luma(c);
      }
      // contrast (S-curve around mid grey; < 1 flattens)
      c = clamp(c, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), clamp((pCon - 1.0) * 2.5, -1.0, 1.0));
      l = luma(c);
      // saturation + vibrance (boosts muted colours more than already saturated ones)
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(vec3(l), c, pSat * (1.0 + pVib * (1.0 - sat)));
      // teal shadows / orange highlights
      if (pTeal > 0.0) c = mix(c, c * mix(vec3(0.84, 1.0, 1.12), vec3(1.1, 1.0, 0.86), smoothstep(0.12, 0.72, l)), pTeal);
      c *= pTint;
      c = mix(c, pHazeCol, pHaze * (1.0 - 0.5 * l));
      c = c * (1.0 - pLift) + pLift;
      if (uCBOn > 0.5) { vec3 lin = pow(max(c, 0.0), vec3(2.2)); lin = uCB * lin; c = pow(max(lin, 0.0), vec3(1.0 / 2.2)); }
      if (pVig > 0.0) { vec2 dv = vUv - 0.5; dv.x *= 1.3; c *= mix(1.0, smoothstep(0.9, 0.22, length(dv)), pVig); }
      if (pGrain > 0.0) {
        vec2 px = floor(vUv / uTexel);
        float n = hash(px + fract(uTime * 7.31) * 913.0) + hash(px * 1.37 + fract(uTime * 3.17) * 411.0) - 1.0;
        c += n * pGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
      }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
};

export function filterSettings() {
  const s = getSettings();
  return {
    filter: FILTER_PRESETS[s.gfxFilter] ? s.gfxFilter : 'naturale',
    sharpen: !!s.gfxSharpen, grain: !!s.gfxGrain, vignette: s.gfxVignette !== false,
    colorblind: COLORBLIND_MODES[s.gfxColorblind] ? s.gfxColorblind : 'off',
  };
}

// CSS fallback for views without post-processing (low quality, garage showroom): preset
// approximated with CSS filters, daltonisation exactly via an SVG feColorMatrix
const CSS_PRESET = { naturale: '', vivido: 'saturate(1.2) contrast(1.05)', cinematico: 'contrast(1.08) saturate(0.88) sepia(0.1)', retro: 'saturate(1.32) sepia(0.14) brightness(1.04) contrast(0.95)', contrasto: 'contrast(1.18) saturate(1.06)' };
function cbSvgFilter(mode) {
  const id = 'apex-cb-' + mode;
  if (typeof document === 'undefined' || document.getElementById(id)) return id;
  const M = colorblindMatrix(mode);
  const vals = [0, 1, 2].map((r) => `${M[r * 3]} ${M[r * 3 + 1]} ${M[r * 3 + 2]} 0 0`).join(' ') + ' 0 0 0 1 0';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute'; svg.style.pointerEvents = 'none';
  svg.innerHTML = `<filter id="${id}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${vals}"/></filter>`;
  document.body.appendChild(svg);
  return id;
}
export function filterCSS(fs = filterSettings()) {
  const parts = [];
  if (CSS_PRESET[fs.filter]) parts.push(CSS_PRESET[fs.filter]);
  if (fs.colorblind !== 'off') parts.push(`url(#${cbSvgFilter(fs.colorblind)})`);
  return parts.join(' ');
}

const liveTargets = new Set();
function setUniforms(comp, fs) {
  const P = FILTER_PRESETS[fs.filter] || {};
  const u = comp.filter.uniforms;
  u.pSat.value = P.sat ?? 1; u.pVib.value = P.vib ?? 0; u.pCon.value = P.con ?? 1; u.pLocal.value = P.local ?? 0;
  u.pTeal.value = P.teal ?? 0; u.pHaze.value = P.haze ?? 0; u.pLift.value = P.lift ?? 0;
  u.pHazeCol.value.setRGB(...(P.hazeCol || [1, 1, 1])); u.pTint.value.set(...(P.tint || [1, 1, 1]));
  u.pVig.value = fs.vignette ? (P.vig ?? 0) : 0;
  u.pGrain.value = (P.grain ?? 0) + (fs.grain ? 0.04 : 0);
  u.pSharp.value = Math.min(1, (P.sharp ?? 0) + (fs.sharpen ? 0.5 : 0));
  const M = colorblindMatrix(fs.colorblind);
  u.uCBOn.value = M ? 1 : 0; if (M) u.uCB.value.set(...M);
  if (comp.grade) comp.grade.uniforms.uVig.value = fs.vignette ? (comp.grade.userData?.vig ?? 0.32) : 0;
  comp.filter.enabled = fs.filter !== 'naturale' || fs.sharpen || fs.grain || fs.colorblind !== 'off';
  const b = comp.bloom, bd = b?.userData;
  if (bd?.strength != null) {
    const [sm, th, ra] = P.bloom || [1, bd.threshold, bd.radius];
    b.strength = bd.strength * sm; b.threshold = th; b.radius = ra;
  }
}
// Apply the current filter settings. target: a composer from makeComposer, a DOM element
// (CSS fallback) or nothing = every live view registered by an earlier call.
export function applyFilterSettings(target) {
  const fs = filterSettings();
  const one = (t) => {
    if (t.filter?.uniforms) setUniforms(t, fs);
    else if (t.style) t.style.filter = filterCSS(fs);
  };
  if (target) {
    if (![...liveTargets].some((r) => r.deref() === target)) liveTargets.add(new WeakRef(target));
    one(target); return;
  }
  for (const ref of [...liveTargets]) { const t = ref.deref(); if (!t) liveTargets.delete(ref); else one(t); }
}

// ---- subtle sun glare and lens flare ----------------------------------------------------
// Display-space pass. Occlusion is tested in the vertex shader (3 vertices) by sampling the
// frame around the sun: geometry in front of the sun darkens those taps. A sun just outside
// the frame still leaves a faint veiling glare on the nearest edge.
const FlareShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 1.4) }, uAmt: { value: 0 }, uAspect: { value: 16 / 9 }, uTint: { value: new THREE.Color(1, 0.93, 0.8) } },
  vertexShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt;
    varying vec2 vUv; varying float vVis;
    void main() {
      vUv = uv;
      float vis = 0.0;
      bool on = uSun.x > 0.0 && uSun.x < 1.0 && uSun.y > 0.0 && uSun.y < 1.0;
      if (uAmt > 0.0 && on) {
        for (int i = 0; i < 9; i++) {
          vec2 o = vec2(float(i - (i / 3) * 3) - 1.0, float(i / 3) - 1.0) * 0.006;
          vec3 c = texture2D(tDiffuse, uSun + o).rgb;
          vis += smoothstep(0.82, 0.97, dot(c, vec3(0.2126, 0.7152, 0.0722)));
        }
        vis /= 9.0;
      } else if (uAmt > 0.0) vis = 0.35;
      vVis = vis * uAmt;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAspect; uniform vec3 uTint;
    varying vec2 vUv; varying float vVis;
    float disc(vec2 p, vec2 c, float r, float soft) { vec2 d = p - c; d.x *= uAspect; return 1.0 - smoothstep(r * (1.0 - soft), r, length(d)); }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (vVis > 0.001) {
        vec2 d = vUv - uSun; d.x *= uAspect; float r = length(d);
        float edge = smoothstep(1.6, 0.0, length(uSun - 0.5) * 2.0);
        vec3 add = uTint * (exp(-r * 9.0) * 0.12 + exp(-r * 2.5) * 0.035) * edge;
        add += uTint * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.4) * 0.07 * edge;   // anamorphic streak
        bool on = uSun.x > 0.0 && uSun.x < 1.0 && uSun.y > 0.0 && uSun.y < 1.0;
        if (on) {
          vec2 axis = vec2(0.5) - uSun;
          add += vec3(0.55, 0.75, 1.0) * disc(vUv, uSun + axis * 1.35, 0.035, 0.7) * 0.05;
          add += vec3(1.0, 0.6, 0.35) * disc(vUv, uSun + axis * 1.75, 0.07, 0.5) * 0.035;
          add += vec3(0.6, 1.0, 0.7) * disc(vUv, uSun + axis * 0.65, 0.022, 0.6) * 0.05;
          vec2 rp = vUv - (uSun + axis * 2.2); rp.x *= uAspect; float rr = length(rp);
          add += vec3(0.7, 0.8, 1.0) * smoothstep(0.02, 0.0, abs(rr - 0.16)) * 0.025;   // faint halo ring
        }
        col.rgb += add * vVis * (1.0 - 0.6 * dot(col.rgb, vec3(0.333)));
      }
      gl_FragColor = col;
    }`,
};
// ---- light shafts (screen-space radial blur towards the sun) ------------------------------
// Bright sky pixels are smeared along the line to the sun, so the gaps between trees, stands
// and buildings throw visible shafts at low sun. Display space, 24 taps, only while the sun
// is near the frame.
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 0 }, uTint: { value: new THREE.Color(1, 0.85, 0.62) }, uAspect: { value: 16 / 9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt, uAspect; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 dl = (uSun - vUv); float len = length(dl * vec2(uAspect, 1.0));
      vec2 stepv = dl * (0.92 / 24.0);
      vec2 p = vUv; float acc = 0.0, w = 1.0;
      float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      p += stepv * j;
      for (int i = 0; i < 24; i++) {
        vec3 s = texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb;
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        acc += smoothstep(0.8, 1.0, l) * w; w *= 0.95; p += stepv;
      }
      acc /= 24.0;
      float fall = exp(-len * 2.2);
      col.rgb += uTint * acc * fall * uAmt * (1.0 - 0.5 * dot(col.rgb, vec3(0.333)));
      gl_FragColor = col;
    }`,
};
export function updateGodRays(composer, camera, sunDir, amount = 1) {
  const r = composer?.rays; if (!r) return;
  if (!sunDir || amount <= 0.001) { r.enabled = false; return; }
  _sv.copy(sunDir).normalize();
  const facing = _sv.dot(camera.getWorldDirection(new THREE.Vector3()));
  _sv.multiplyScalar(1000).add(camera.position).project(camera);
  const u = _sv.x * 0.5 + 0.5, v = _sv.y * 0.5 + 0.5;
  const amt = amount * THREE.MathUtils.smoothstep(facing, 0.15, 0.6);
  r.enabled = amt > 0.01 && _sv.z < 1 && u > -0.6 && u < 1.6 && v > -0.6 && v < 1.6;
  r.uniforms.uSun.value.set(u, v); r.uniforms.uAmt.value = amt; r.uniforms.uAspect.value = camera.aspect;
}

const _sv = new THREE.Vector3();
// Place the flare for this frame: sunDir = world direction towards the sun (or null/off).
// amount scales the effect (e.g. 0 at night or under heavy cloud).
export function updateSunFlare(composer, camera, sunDir, amount = 1) {
  const f = composer?.flare; if (!f) return;
  if (!sunDir || amount <= 0.001) { f.enabled = false; return; }
  _sv.copy(sunDir).normalize();
  const facing = _sv.dot(camera.getWorldDirection(new THREE.Vector3()));
  _sv.multiplyScalar(1000).add(camera.position).project(camera);
  const u = _sv.x * 0.5 + 0.5, v = _sv.y * 0.5 + 0.5;
  const amt = amount * THREE.MathUtils.smoothstep(facing, 0.2, 0.75);
  f.enabled = amt > 0.01 && _sv.z < 1 && u > -0.5 && u < 1.5 && v > -0.5 && v < 1.5;
  f.uniforms.uSun.value.set(u, v); f.uniforms.uAmt.value = amt; f.uniforms.uAspect.value = camera.aspect;
}

export function makeComposer(renderer, scene, camera, { bloom = 0.22, low = false, ao = false, grade = true, filter = true, flare = false, rays = false, dof = false } = {}) {
  if (low) { if (filter) applyFilterSettings(renderer.domElement); return null; }
  try {
    const size0 = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size0.x * renderer.getPixelRatio(), size0.y * renderer.getPixelRatio(), { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    rt.depthTexture = new THREE.DepthTexture(size0.x, size0.y, THREE.FloatType);
    const comp = new EffectComposer(renderer, rt);
    // the clone shares the depth texture's GPU source: give the second buffer its own so the depth
    // of field can read one while writing the other
    if (dof) comp.renderTarget2.depthTexture = new THREE.DepthTexture(rt.width, rt.height, THREE.FloatType);
    const rpass = new RenderPass(scene, camera);
    comp.addPass(rpass);
    const size = renderer.getSize(new THREE.Vector2());
    if (dof) {
      // reads the colour + depth of the target the scene was just drawn into, writes the other one
      const dp = new ShaderPass(DofShader); dp.enabled = false;
      const r0 = dp.render.bind(dp);
      dp.render = (rd, wb, rb, ...a) => { dp.uniforms.tDepth.value = rb.depthTexture; dp.uniforms.uLogF.value = Math.log2(camera.far + 1); r0(rd, wb, rb, ...a); };
      dp.setSize = (w, h) => dp.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
      comp.addPass(dp); comp.dof = dp;
    }
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
    if (rays) { const rp = new ShaderPass(RaysShader); rp.enabled = false; comp.addPass(rp); comp.rays = rp; }
    if (flare) { const fl = new ShaderPass(FlareShader); fl.enabled = false; comp.addPass(fl); comp.flare = fl; }
    if (grade) { const gp = new ShaderPass(GradeShader); gp.userData = { vig: GradeShader.uniforms.uVig.value }; comp.addPass(gp); comp.grade = gp; }
    comp.addPass(new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio()));
    comp.bloom = b; b.userData = { strength: b.strength, threshold: b.threshold, radius: b.radius };
    if (filter) {
      const fp = new ShaderPass(FilterShader);
      const pr = renderer.getPixelRatio();
      fp.uniforms.uTexel.value.set(1 / Math.max(1, size.x * pr), 1 / Math.max(1, size.y * pr));
      fp.setSize = (w, h) => fp.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
      const r0 = fp.render.bind(fp);
      fp.render = (...a) => { fp.uniforms.uTime.value = (performance.now() / 1000) % 1000; r0(...a); };
      comp.addPass(fp); comp.filter = fp;
      applyFilterSettings(comp);
    }
    return comp;
  } catch (e) { console.warn('postprocessing off', e); return null; }
}

