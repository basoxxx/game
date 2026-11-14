// Display-space effects of "Scontro Totale", one extra pass in the shared composer: radial motion
// blur at speed / under nitro, speed lines, chromatic fringing, heat haze behind the nitro flames, a shockwave
// ripple on explosions, lens dirt lit by bright areas, the per-venue colour grade and a red pulse
// when the player's car takes a heavy hit.
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const DerbyShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uBlur: { value: 0 }, uCA: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.45) },
    uHeat: { value: 0 }, uHeatPos: { value: new THREE.Vector2(0.5, 0.3) }, uHeatR: { value: 150 }, uShockT: { value: 0 }, uShockPos: { value: new THREE.Vector2(0.5, 0.5) },
    uDirt: { value: 0.5 }, uTintLo: { value: new THREE.Vector3(1, 1, 1) }, uTintHi: { value: new THREE.Vector3(1, 1, 1) }, uHurt: { value: 0 }, uLift: { value: 0 }, uLines: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAspect, uBlur, uCA, uHeat, uHeatR, uShockT, uDirt, uHurt, uLift, uLines;
    uniform vec2 uCenter, uHeatPos, uShockPos; uniform vec3 uTintLo, uTintHi; varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    // out-of-focus specks on the front element
    float spots(vec2 uv, float sc) { vec2 g = uv * vec2(uAspect, 1.0) * sc, i = floor(g), f = fract(g); float a = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); float r = h21(i + o); vec2 c = o + vec2(h21(i + o + 7.1), h21(i + o + 3.7)); float rad = 0.12 + r * 0.34; a += smoothstep(rad, rad * 0.55, length(f - c)) * step(0.55, r) * (0.4 + r * 0.6); }
      return a; }
    void main() {
      vec2 uv = vUv;
      if (uHeat > 0.002) { vec2 d = (uv - uHeatPos) * vec2(uAspect, 1.0); d.y *= 0.6; float f = exp(-dot(d, d) * uHeatR) * uHeat; uv += f * 0.0028 * vec2(sin(uv.y * 150.0 + uTime * 33.0) + sin(uv.y * 61.0 - uTime * 21.0), cos(uv.x * 130.0 + uTime * 27.0)); }
      if (uShockT > 0.0 && uShockT < 1.0) { vec2 d = (uv - uShockPos) * vec2(uAspect, 1.0); float r = length(d), ring = uShockT * 0.9; float w = exp(-pow((r - ring) / 0.045, 2.0)); uv += normalize(d + 1e-5) / vec2(uAspect, 1.0) * w * 0.028 * (1.0 - uShockT); }
      vec3 c;
      if (uBlur > 0.002) {
        vec2 dir = uv - uCenter; float l = length(dir * vec2(uAspect, 1.0)); float k = uBlur * smoothstep(0.12, 0.75, l);
        float j = h21(vUv * 913.0 + uTime) / 8.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) { float t = (float(i) + j * 8.0) / 8.0; acc += texture2D(tDiffuse, uv - dir * k * t).rgb; }
        c = acc / 8.0;
      } else c = texture2D(tDiffuse, uv).rgb;
      if (uCA > 0.002) { vec2 o = (uv - 0.5) * uCA * 0.014 * length(uv - 0.5) * 2.0; c.r = texture2D(tDiffuse, uv + o).r * 0.7 + c.r * 0.3; c.b = texture2D(tDiffuse, uv - o).b * 0.7 + c.b * 0.3; }
      if (uDirt > 0.002) {
        vec3 gl = texture2D(tDiffuse, mix(vUv, vec2(0.5), 0.12)).rgb + texture2D(tDiffuse, mix(vUv, vec2(0.5, 0.75), 0.3)).rgb;
        float b = smoothstep(0.62, 1.0, luma(gl) * 0.5);
        c += (spots(vUv, 5.0) + spots(vUv + 3.3, 11.0) * 0.6) * b * gl * 0.05 * uDirt;
      }
      // speed lines: thin bright streaks rushing out of the vanishing point at the edges of the frame (nitro / very high speed)
      if (uLines > 0.002) {
        vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0); float r = length(d), a = atan(d.y, d.x) * 38.0;
        float id = floor(a), fa = fract(a), rnd = h21(vec2(id, 3.1)), on = step(0.62, rnd);
        float seg = fract(r * 1.6 - uTime * (2.2 + rnd * 2.5) + rnd * 7.0);
        float line = on * smoothstep(0.5, 0.0, abs(fa - 0.5) * (3.0 + rnd * 3.0)) * smoothstep(0.0, 0.25, seg) * smoothstep(0.75, 0.3, seg);
        c += line * smoothstep(0.32, 0.85, r) * uLines * 0.22 * (0.6 + luma(c));
      }
      float l = luma(c);
      c *= mix(uTintLo, uTintHi, smoothstep(0.0, 0.75, l));
      c = c * (1.0 - uLift) + uLift;
      if (uHurt > 0.002) { vec2 d = vUv - 0.5; c = mix(c, vec3(0.55, 0.02, 0.0) + c * 0.25, uHurt * smoothstep(0.25, 0.85, length(d) * 1.25)); }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

// adds the pass to a composer made by ui/gfx.js makeComposer, right before the base grade pass
export function addDerbyPost(comp) {
  if (!comp) return null;
  const p = new ShaderPass(DerbyShader);
  const at = comp.grade ? comp.passes.indexOf(comp.grade) : comp.passes.length;
  comp.passes.splice(at < 0 ? comp.passes.length : at, 0, p);
  const sz = new THREE.Vector2(); comp.renderer.getSize(sz); p.setSize(sz.x, sz.y);
  return p;
}
