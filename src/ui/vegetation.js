// Photoreal vegetation impostors. Poly Haven CC0 tree models were rendered offline from
// 8 directions into an atlas (public/assets/veg/trees.webp). In game each tree is a single
// camera-facing quad that shows the baked view matching the camera direction.
import * as THREE from 'three';
import META from '../../public/assets/veg/trees.json';
import { gfxTier } from './quality.js';

const BASE = './assets/veg/';
let atlas = null, atlasHi = null;
function atlasTex() {
  const hi = gfxTier() === 'high';
  if (atlas && atlasHi === hi) return atlas;
  atlasHi = hi;
  // 4096x2048 RGBA is ~45 MB of GPU memory with mipmaps: Media / Bassa take the half-size atlas
  // (same layout, normalised uvs), which also downloads ~30% less
  atlas = new THREE.TextureLoader().load(BASE + (hi ? 'trees.webp' : 'trees_half.webp'));
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  atlas.generateMipmaps = true;
  return atlas;
}

export const VEG = META;
export function vegOfKind(kinds) { return META.filter((m) => kinds.includes(m.kind)); }

const VERT = /* glsl */`
  attribute vec3 iPos; attribute float iScale; attribute float iSlot; attribute float iRot; attribute vec3 iTint;
  uniform vec3 sunDir;
  varying vec2 vUv; varying vec3 vTint; varying float vShade; varying float vTop;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec3 toCam = cameraPosition - iPos;
    vec2 d = normalize(toCam.xz + vec2(1e-4));
    vec3 right = vec3(d.y, 0.0, -d.x);
    // tilt the quad slightly towards high cameras so trees do not look paper-thin from above
    float up = clamp(toCam.y / max(1.0, length(toCam.xz)), 0.0, 1.5);
    vec3 fwd = vec3(d.x, 0.0, d.y);
    vec3 wp = iPos + right * position.x * iScale + vec3(0.0, position.y * iScale, 0.0) + fwd * position.y * iScale * up * 0.35;
    float a = atan(d.x, d.y) - iRot;
    float f = mod(floor(a / 6.2831853 * 8.0 + 0.5), 8.0);
    float vc = mod(f, 4.0), vr = floor(f / 4.0);
    float col = mod(iSlot, 4.0), row = floor(iSlot / 4.0);
    float px = col * 1024.0 + vc * 256.0 + (position.x + 0.5) * 256.0;
    float pyTop = row * 512.0 + vr * 256.0 + (1.0 - position.y) * 256.0;
    vUv = vec2(px / 4096.0, 1.0 - pyTop / 2048.0);
    vTint = iTint;
    // seen from high above the side view gives way to the crown seen from the top (canopy mesh)
    vTop = smoothstep(0.4, 0.72, toCam.y / max(1.0, length(toCam)));
    // lit from the sun side: the half of the crown facing the sun is brighter, the top catches more light
    float sl = dot(right.xz, normalize(sunDir.xz + vec2(1e-4)));
    vShade = (0.7 + 0.3 * position.y) * (1.0 + 0.34 * sl * position.x * 2.0);
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  uniform sampler2D map; uniform float light; uniform float gain;
  varying vec2 vUv; varying vec3 vTint; varying float vShade; varying float vTop;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec4 c = texture2D(map, vUv);
    // keep thin foliage alive in the distance: mip levels average alpha down, so boost it
    vec2 tx = vUv * vec2(ATLAS_W, ATLAS_W * 0.5);
    float lod = log2(max(1.0, max(length(dFdx(tx)), length(dFdy(tx)))));
    float a = c.a * (1.0 + lod * 0.7);
    if (a < 0.42) discard;
    #ifdef CANOPY
      if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) < vTop) discard;
    #endif
    gl_FragColor = vec4(c.rgb * vTint * vShade * light * gain, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

// Crown seen from above (helicopter shots): a low dome per tree with procedural leaf clumps,
// shaded by the sun, cross-faded (screen-space dither) with the side impostor by view elevation.
const KIND_I = { conifer: 0, broad: 1, bush: 2, desert: 3 };
const CROWN = [[0.2, 0.55], [0.34, 0.62], [0.46, 0.5], [0.3, 0.62]]; // radius, centre height (x tree height)
const CAN_VERT = /* glsl */`
  attribute vec3 iPos; attribute float iH; attribute float iKind; attribute vec3 iTint; attribute float iRot;
  uniform vec3 sunDir; uniform vec4 kR, kY;
  varying vec2 vP; varying vec3 vTint; varying float vShade; varying float vTop; varying float vKind;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    int k = int(iKind + 0.5);
    float R = (k == 0 ? kR.x : k == 1 ? kR.y : k == 2 ? kR.z : kR.w) * iH, Y = (k == 0 ? kY.x : k == 1 ? kY.y : k == 2 ? kY.z : kY.w) * iH;
    vec2 p = position.xy; float r2 = dot(p, p);
    float c = cos(iRot), s = sin(iRot); p = mat2(c, -s, s, c) * p;
    vec3 wp = iPos + vec3(p.x * R, Y + (1.0 - r2) * R * 0.45, p.y * R);
    vec3 n = normalize(vec3(p.x, 1.2 * (1.0 - r2) + 0.3, p.y));
    vShade = 0.55 + 0.55 * max(0.0, dot(n, normalize(sunDir)));
    vec3 toCam = cameraPosition - wp;
    vTop = smoothstep(0.4, 0.72, toCam.y / max(1.0, length(toCam)));
    vP = position.xy * (R * 0.9) + iPos.xz * 0.37; vTint = iTint; vKind = iKind;
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;
const CAN_FRAG = /* glsl */`
  uniform float light; uniform vec3 kc0, kc1, kc2, kc3;
  varying vec2 vP; varying vec3 vTint; varying float vShade; varying float vTop; varying float vKind;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  float ch(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  // leaf clumps: distance to jittered points of a cell grid
  float clumps(vec2 p) { vec2 i = floor(p), f = fract(p); float d = 1.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 q = o + vec2(ch(i + o), ch(i + o + 7.1)) - f; d = min(d, dot(q, q)); } return sqrt(d); }
  void main() {
    #include <logdepthbuf_fragment>
    if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) >= vTop) discard;
    float cl = clumps(vP * 0.9), cl2 = clumps(vP * 2.3 + 3.0);
    int k = int(vKind + 0.5);
    vec3 base = k == 0 ? kc0 : k == 1 ? kc1 : k == 2 ? kc2 : kc3;
    float lum = (1.0 - cl * 0.8) * 0.75 + (1.0 - cl2) * 0.35;
    gl_FragColor = vec4(base * vTint * vShade * (0.45 + 0.75 * lum) * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
function makeCanopy(items, mat) {
  const n = items.length;
  const base = new THREE.CircleGeometry(1, 14);
  // ragged rim: push the outer vertices in and out a little
  const pa = base.attributes.position; for (let i = 1; i < pa.count; i++) { const k = 0.85 + 0.25 * Math.abs(Math.sin(i * 2.7)); pa.setXY(i, pa.getX(i) * k, pa.getY(i) * k); }
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position;
  const P = new Float32Array(n * 3), H = new Float32Array(n), K = new Float32Array(n), R = new Float32Array(n), T = new Float32Array(n * 3);
  items.forEach((it, i) => { P.set([it.x, it.y || 0, it.z], i * 3); H[i] = it.h; K[i] = KIND_I[it.meta.kind] ?? 1; R[i] = it.rot || 0; T.set(it.tint || [1, 1, 1], i * 3); });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3)); g.setAttribute('iH', new THREE.InstancedBufferAttribute(H, 1)); g.setAttribute('iKind', new THREE.InstancedBufferAttribute(K, 1));
  g.setAttribute('iRot', new THREE.InstancedBufferAttribute(R, 1)); g.setAttribute('iTint', new THREE.InstancedBufferAttribute(T, 3));
  g.instanceCount = n;
  const cm = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      kR: { value: new THREE.Vector4(...CROWN.map((c) => c[0])) }, kY: { value: new THREE.Vector4(...CROWN.map((c) => c[1])) },
      kc0: { value: new THREE.Color(0x2c4426) }, kc1: { value: new THREE.Color(0x48662e) }, kc2: { value: new THREE.Color(0x56703a) }, kc3: { value: new THREE.Color(0x6b6f40) },
    }]),
    vertexShader: CAN_VERT, fragmentShader: CAN_FRAG, fog: true, side: THREE.DoubleSide,
  });
  // shared with the impostors: night dimming and the sun direction follow the forest material
  cm.uniforms.light = mat.uniforms.light; cm.uniforms.sunDir = mat.uniforms.sunDir;
  const mesh = new THREE.Mesh(g, cm); mesh.frustumCulled = false;
  return mesh;
}

// items: [{x, y, z, h (target height m), meta (entry of VEG), rot, tint:[r,g,b]}]
// opts.canopy: add the crown-from-above mesh (circuits' helicopter shots)
export function makeForest(items, opts = {}) {
  const n = items.length;
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const P = new Float32Array(n * 3), S = new Float32Array(n), SL = new Float32Array(n), R = new Float32Array(n), T = new Float32Array(n * 3);
  items.forEach((it, i) => {
    P.set([it.x, it.y || 0, it.z], i * 3);
    // the tile spans S x S metres at bake scale; it.h is the height we want in game
    const m = it.meta; S[i] = m.S * (it.h / m.h); SL[i] = m.slot; R[i] = it.rot || 0;
    T.set(it.tint || [1, 1, 1], i * 3);
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('iScale', new THREE.InstancedBufferAttribute(S, 1));
  g.setAttribute('iSlot', new THREE.InstancedBufferAttribute(SL, 1));
  g.setAttribute('iRot', new THREE.InstancedBufferAttribute(R, 1));
  g.setAttribute('iTint', new THREE.InstancedBufferAttribute(T, 3));
  g.instanceCount = n;
  const map = atlasTex();
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, light: { value: 1 }, gain: { value: 1.4 }, sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.45) } }]),
    vertexShader: VERT, fragmentShader: FRAG.replace(/ATLAS_W/g, atlasHi ? '4096.0' : '2048.0'), fog: true, side: THREE.DoubleSide,
  });
  mat.uniforms.map.value = map;
  if (opts.canopy) mat.defines = { CANOPY: 1 };
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  if (opts.canopy) mesh.add(makeCanopy(items, mat));
  return mesh;
}

// soft dark contact patches under trees (fake ambient occlusion / shadow)
export function makeTreeShadows(items, sunDir = new THREE.Vector3(0.45, 1, 0.3)) {
  const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c; })());
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const inst = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D();
  const sx = -sunDir.x / sunDir.y, sz = -sunDir.z / sunDir.y;
  items.forEach((it, i) => {
    const w = Math.max(2, it.h * (it.meta.kind === 'conifer' ? 0.5 : 0.8));
    d.position.set(it.x + sx * it.h * 0.25, (it.y || 0) + 0.05, it.z + sz * it.h * 0.25);
    d.scale.set(w * 1.3, 1, w); d.rotation.y = Math.atan2(sx, sz); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
  });
  inst.renderOrder = -1;
  return inst;
}
