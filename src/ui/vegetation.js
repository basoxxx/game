// Photoreal vegetation impostors. Poly Haven CC0 tree models were rendered offline from
// 8 directions into an atlas (public/assets/veg/trees.webp). In game each tree is a single
// camera-facing quad that shows the baked view matching the camera direction.
import * as THREE from 'three';
import META from '../../public/assets/veg/trees.json';

const BASE = './assets/veg/';
let atlas = null;
function atlasTex() {
  if (atlas) return atlas;
  atlas = new THREE.TextureLoader().load(BASE + 'trees.webp');
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
  varying vec2 vUv; varying vec3 vTint; varying float vShade;
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
  varying vec2 vUv; varying vec3 vTint; varying float vShade;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec4 c = texture2D(map, vUv);
    // keep thin foliage alive in the distance: mip levels average alpha down, so boost it
    vec2 tx = vUv * vec2(4096.0, 2048.0);
    float lod = log2(max(1.0, max(length(dFdx(tx)), length(dFdy(tx)))));
    float a = c.a * (1.0 + lod * 0.7);
    if (a < 0.42) discard;
    gl_FragColor = vec4(c.rgb * vTint * vShade * light * gain, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

// items: [{x, y, z, h (target height m), meta (entry of VEG), rot, tint:[r,g,b]}]
export function makeForest(items) {
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
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, light: { value: 1 }, gain: { value: 1.4 }, sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.45) } }]),
    vertexShader: VERT, fragmentShader: FRAG, fog: true, side: THREE.DoubleSide,
  });
  mat.uniforms.map.value = atlasTex();
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
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
