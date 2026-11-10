// Graphics quality tiers (Alta / Media / Bassa) and a one-off GPU probe on first run.
// The probe runs on a tiny throw-away WebGL canvas for at most ~1 s, off the critical path
// (the menu is already on screen), and its context is released straight after.
import { getSettings, setSettings, SETTINGS_KEY } from '../engine/state.js';

export const TIERS = [
  ['high', 'Alta', 'Ombre, riflessi, profondità di campo e sfondi 3D animati.'],
  ['med', 'Media', 'Sfondi 3D animati con effetti alleggeriti: equilibrio tra resa e fluidità.'],
  ['low', 'Bassa', 'Niente sfondi 3D nei menu, gare 3D alleggerite: per computer datati e portatili.'],
];
export const tierLabel = (t) => TIERS.find((x) => x[0] === t)?.[1] || 'Alta';

export function gfxTier() {
  const s = getSettings();
  return s.gfxTier || (s.gfx === 'low' ? 'low' : 'high');
}
// 3D modules only know gfx 'high' | 'low': Media keeps the full scenes but drops the costly extras
export function setTier(tier, auto = false, extra = {}) {
  const patch = { gfxTier: tier, gfx: tier === 'low' ? 'low' : 'high', gfxAuto: auto, ...extra };
  if (tier !== 'high') { patch.gfxGrain = false; patch.gfxSharpen = false; }
  setSettings(patch);
  document.documentElement.dataset.gfx = tier;
}

function rawSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; } }

let probing = null;
// Resolves to the tier in use. Probes the GPU only when the player never chose a quality.
export function ensureQuality() {
  const raw = rawSettings();
  if (raw.gfxTier) { document.documentElement.dataset.gfx = raw.gfxTier; return Promise.resolve(raw.gfxTier); }
  if (raw.gfx) { setTier(raw.gfx === 'low' ? 'low' : 'high', false); return Promise.resolve(gfxTier()); }
  return (probing ||= probeGPU().then((r) => { setTier(r.tier, true, { gfxProbe: { renderer: r.renderer, ms: r.ms, at: Date.now() } }); return r.tier; }));
}
export function redetect() { probing = null; return probeGPU().then((r) => { setTier(r.tier, true, { gfxProbe: { renderer: r.renderer, ms: r.ms, at: Date.now() } }); return r; }); }

const FRAG = `precision mediump float; uniform float t; varying vec2 v;
void main(){ vec2 p=v*6.0; float a=0.0; for(int i=0;i<64;i++){ float fi=float(i); p=vec2(p.x*0.98-p.y*0.17+sin(p.y+t+fi*0.1), p.y*0.98+p.x*0.17+cos(p.x-t)); a+=sin(p.x*p.y*0.01+fi)*0.015; } gl_FragColor=vec4(a,a*0.5,1.0-a,1.0); }`;
const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v=p; gl_Position=vec4(p,0.0,1.0); }';

export function probeGPU() {
  return new Promise((resolve) => {
    const done = (tier, renderer = '', ms = 0, gl = null) => { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} resolve({ tier, renderer, ms: Math.round(ms * 100) / 100 }); };
    let gl = null, renderer = '';
    try {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      // a browser that falls back to software rendering refuses this context outright
      gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: true, antialias: false, preserveDrawingBuffer: false });
      if (!gl) {
        const sw = c.getContext('webgl');
        if (!sw) return done('low', 'nessuna WebGL');
        const i = sw.getExtension('WEBGL_debug_renderer_info');
        return done('low', (i && sw.getParameter(i.UNMASKED_RENDERER_WEBGL)) || 'rendering software', 0, sw);
      }
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      if (/swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(renderer)) return done('low', renderer, 0, gl);
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return done('med', renderer, 0, gl);
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const ut = gl.getUniformLocation(pr, 't'); const px = new Uint8Array(4);
      const samples = []; const t0 = performance.now();
      const step = () => {
        if (gl.isContextLost()) return done('med', renderer, 0);
        const a = performance.now();
        for (let k = 0; k < 4; k++) { gl.uniform1f(ut, a * 0.001 + k); gl.drawArrays(gl.TRIANGLES, 0, 3); }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // waits for the GPU
        samples.push((performance.now() - a) / 4);
        if (performance.now() - t0 < 1000 && samples.length < 40) { requestAnimationFrame(step); return; }
        samples.shift(); // first frame pays for the shader compile
        samples.sort((x, y) => x - y);
        const ms = samples[Math.floor(samples.length / 2)] ?? 99;
        // one heavy 512² pass: a discrete GPU does it in well under 2 ms, an old iGPU in 6+
        done(ms < 2.2 ? 'high' : ms < 7 ? 'med' : 'low', renderer, ms, gl);
      };
      requestAnimationFrame(step);
    } catch (e) { done('med', renderer, 0, gl); }
  });
}
