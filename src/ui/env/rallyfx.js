// Rally stage effects that run every frame: dust clouds kicked up on gravel, rooster tails of snow,
// mud flung off a wet stage, water mist on wet tarmac and swirling powder on icy patches.
// One shared particle system (a single draw) chained onto the renderer's per-frame env tick.
import * as THREE from 'three';

// colour, start / end size (m), life (s), gravity, drag, rate per m/s of speed, lift
const LOOK = {
  gravel: { col: [0.66, 0.55, 0.42], s0: 0.9, s1: 7.5, life: 3.4, grav: -0.05, drag: 1.6, rate: 1.1, up: 1.4, a: 0.4 },
  rough: { col: [0.74, 0.58, 0.42], s0: 1.0, s1: 9, life: 4.2, grav: -0.03, drag: 1.4, rate: 1.2, up: 1.6, a: 0.42 },
  snow: { col: [0.96, 0.97, 1.0], s0: 0.5, s1: 4.2, life: 1.6, grav: 2.6, drag: 1.1, rate: 1.3, up: 3.2, a: 0.6 },
  mud: { col: [0.3, 0.24, 0.18], s0: 0.3, s1: 1.3, life: 1.1, grav: 7, drag: 0.6, rate: 1.1, up: 3.4, a: 0.85 },
  mist: { col: [0.78, 0.8, 0.84], s0: 0.6, s1: 4.5, life: 1.3, grav: 0, drag: 2, rate: 0.7, up: 0.8, a: 0.2 },
};

export function installRallyFx(r3, { surface = 'gravel', ice = 0, wet = false } = {}) {
  if (!r3.open || r3._rallyFx) return;
  const kind = surface === 'snow' ? 'snow' : surface === 'tarmac' ? (ice > 0.02 ? 'snow' : wet ? 'mist' : null) : wet ? 'mud' : surface;
  if (!kind) return;
  const L = LOOK[kind] || LOOK.gravel;
  // icy tarmac: powder only where the car crosses a snowy patch (share of the time = ice)
  const share = surface === 'tarmac' && ice > 0.02 ? Math.min(1, ice * 1.1) : 1;
  const M = r3.low ? 500 : 2600;
  const pos = new Float32Array(M * 3), age = new Float32Array(M).fill(1), seed = new Float32Array(M);
  for (let i = 0; i < M; i++) { seed[i] = Math.random(); pos[i * 3 + 1] = -1e5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAge', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPx: { value: 600 }, uCol: { value: new THREE.Color().setRGB(...L.col) }, uS0: { value: L.s0 }, uS1: { value: L.s1 }, uA: { value: L.a }, uLight: { value: 1 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 } },
    vertexShader: `attribute float aAge; attribute float aSeed; varying float vA; varying float vS; varying float vF; uniform float uPx; uniform float uS0; uniform float uS1; uniform float uFogD;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float t = clamp(aAge, 0.0, 1.0);
        float size = mix(uS0, uS1, 1.0 - pow(1.0 - t, 2.2)) * (0.75 + 0.5 * aSeed);
        gl_PointSize = aAge >= 1.0 ? 0.0 : clamp(size * uPx / max(0.5, -mv.z), 1.0, 420.0);
        vA = smoothstep(0.0, 0.06, t) * pow(1.0 - t, 1.4); vS = aSeed;
        float d = -mv.z; vF = 1.0 - exp(-uFogD * uFogD * d * d);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `varying float vA; varying float vS; varying float vF; uniform vec3 uCol; uniform float uA; uniform float uLight; uniform vec3 uFogC;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
        // lumpy puff: a soft disc broken up by a cheap angular ripple
        float ang = atan(p.y, p.x); float rim = 0.82 + 0.12 * sin(ang * 5.0 + vS * 30.0) + 0.06 * sin(ang * 11.0 + vS * 70.0);
        float a = (1.0 - smoothstep(rim * 0.35, rim, d)) * vA * uA;
        if (a < 0.004) discard;
        vec3 c = uCol * uLight * (0.85 + 0.3 * (0.5 - p.y));
        gl_FragColor = vec4(mix(c, uFogC, vF), a);
      }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6;
  r3.scene.add(pts);
  const vel = new Float32Array(M * 3), life = new Float32Array(M).fill(1);
  let head = 0;
  const N = r3.geo.N;
  const fx = r3._rallyFx = { pts, kind, emit: 0 };
  const tick = (dt) => {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const cam = r3.camera.position, inCar = r3.camMode === 'onboard' || r3.camMode === 'cockpit';
    mat.uniforms.uPx.value = (r3.H || 720) / (2 * Math.tan(r3.camera.fov * Math.PI / 360));
    // dust follows the light: darker at night (headlights only), a little greyer in the rain
    mat.uniforms.uLight.value = r3.night ? 0.22 : 1 - 0.25 * (r3.wet || 0);
    const fog = r3.scene.fog; if (fog) { mat.uniforms.uFogC.value.copy(fog.color); mat.uniforms.uFogD.value = fog.density ?? 0; }
    // spawn behind every moving car near the camera
    for (const car of r3.cars.values()) {
      const m = car.mesh; if (!m.visible) continue;
      const sp = car._v || 0; if (sp < 5) continue;
      const d2 = m.position.distanceToSquared(cam); if (d2 > (r3.low ? 160 : 320) ** 2) continue;
      if (share < 1) { const i = Math.floor(car.state?.s || 0); const n = Math.sin(i * 0.071 + 1.3) * 0.5 + Math.sin(i * 0.023 + 4.1) * 0.5; if ((n * 0.5 + 0.5) > share) continue; }
      const ry = m.rotation.y, fX = Math.cos(ry), fZ = -Math.sin(ry), rX = -fZ, rZ = fX;
      // corners throw more (sliding), the car the camera rides in throws nothing into the lens
      const ii = Math.min(N - 1, Math.max(0, Math.floor(car.state?.s || 0))), corner = Math.min(1, Math.abs(r3.geo.k[ii] || 0) * 40);
      car._fxAcc = (car._fxAcc || 0) + dt * sp * L.rate * (1 + corner * 1.2) * (r3.low ? 0.35 : 1) * (inCar && car === r3._camCar ? 0.3 : 1);
      while (car._fxAcc >= 1) {
        car._fxAcc -= 1;
        const k = head = (head + 1) % M;
        const side = Math.random() < 0.5 ? -1 : 1, back = 1.6 + Math.random() * 0.6;
        pos[k * 3] = m.position.x - fX * back + rX * side * 0.8; pos[k * 3 + 1] = m.position.y + 0.25; pos[k * 3 + 2] = m.position.z - fZ * back + rZ * side * 0.8;
        // thrown backwards and outwards from the tyres, the slide in a corner pushes it sideways
        const out = (Math.random() - 0.5) * 2 + side * 0.8 + (r3.geo.k[ii] > 0 ? -1 : 1) * corner * 3;
        vel[k * 3] = -fX * sp * (0.12 + Math.random() * 0.18) + rX * out; vel[k * 3 + 1] = L.up * (0.5 + Math.random()); vel[k * 3 + 2] = -fZ * sp * (0.12 + Math.random() * 0.18) + rZ * out;
        age[k] = 0; life[k] = L.life * (0.7 + Math.random() * 0.6) * (1 + corner * 0.4);
      }
    }
    // integrate: drag towards a slow drift (wind), gravity for snow / mud, settle on the ground
    const wx = 0.6, wz = 0.3, dr = Math.exp(-L.drag * dt);
    for (let k = 0; k < M; k++) {
      if (age[k] >= 1) continue;
      age[k] += dt / life[k];
      if (age[k] >= 1) { age[k] = 1; pos[k * 3 + 1] = -1e5; continue; }
      vel[k * 3] = wx + (vel[k * 3] - wx) * dr; vel[k * 3 + 2] = wz + (vel[k * 3 + 2] - wz) * dr;
      vel[k * 3 + 1] = vel[k * 3 + 1] * dr - L.grav * dt + (kind === 'gravel' || kind === 'rough' ? 0.25 * dt : 0);
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
    }
    g.attributes.position.needsUpdate = true; g.attributes.aAge.needsUpdate = true;
  };
  const prev = r3._envTick; r3._envTick = (dt) => { prev?.(dt); tick(dt); };
  return fx;
}
