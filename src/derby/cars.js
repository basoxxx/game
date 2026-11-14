// Demolition "bangers": old saloons, muscle cars, pick-ups and hatchbacks with rusty, dirty paint.
// Bodies are unique (non-shared) geometries so they can be dented vertex by vertex; bumpers,
// bonnet, boot lid and spoiler are separate meshes that can be torn off and thrown into the world.
// The visible body sits in a "shell" group that leans with weight transfer; wheels stay on the root.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStatic } from './merge.js';

// Handling fields (all optional for the menu): steer = max lock (rad), steerRate (rad/s),
// drive = 'rwd'|'fwd'|'awd', gears, engine (synth preset), comY (centre of mass height), roll (visual lean),
// rearGrip / frontGrip (balance), powerOver (rear grip lost under throttle), hbYaw (handbrake rotation help).
export const BANGERS = [
  { id: 'berlina', name: 'Torpedo 78', desc: 'Berlina anni ’70: pesante, robusta, prevedibile.', mass: 1450, power: 1.0, top: 1.0, armor: 1.25, grip: 1.0, color: '#7a1f1f',
    cls: 'Berlina · trazione posteriore', drive: 'rwd', steer: 0.58, steerRate: 3.0, gears: 4, engine: 'endurance', comY: -0.28, roll: 1.0, frontGrip: 1.0, rearGrip: 1.0, powerOver: 0.04, hbYaw: 1.0, susp: 26, travel: 0.33 },
  { id: 'muscle', name: 'Bisonte V8', desc: 'Muscle car: tanta potenza, coda nervosa.', mass: 1500, power: 1.28, top: 1.12, armor: 1.0, grip: 0.92, color: '#1f3f7a',
    cls: 'Muscle · V8 posteriore', drive: 'rwd', steer: 0.56, steerRate: 3.2, gears: 4, engine: 'endurance', comY: -0.3, roll: 1.1, frontGrip: 1.04, rearGrip: 0.93, powerOver: 0.12, hbYaw: 1.2, susp: 28, travel: 0.31 },
  { id: 'pickup', name: 'Mulo 4x4', desc: 'Pick-up a trazione integrale: un ariete.', mass: 1750, power: 1.08, top: 0.92, armor: 1.5, grip: 1.08, awd: true, color: '#5b6b2b',
    cls: 'Pick-up · integrale', drive: 'awd', steer: 0.52, steerRate: 2.6, gears: 5, engine: 'endurance', comY: -0.18, roll: 1.45, frontGrip: 0.97, rearGrip: 1.1, powerOver: 0.05, hbYaw: 0.8, susp: 29, travel: 0.4 },
  { id: 'utilitaria', name: 'Grillo GT', desc: 'Utilitaria leggera e agile, ma fragile.', mass: 1050, power: 0.84, top: 0.98, armor: 0.75, grip: 1.12, color: '#c99a12',
    cls: 'Utilitaria · trazione anteriore', drive: 'fwd', steer: 0.66, steerRate: 4.0, gears: 5, engine: 'rally', comY: -0.26, roll: 0.9, frontGrip: 1.0, rearGrip: 0.97, powerOver: 0, hbYaw: 1.35, susp: 31, travel: 0.3 },
  { id: 'familiare', name: 'Carovana SW', desc: 'Station wagon da famiglia numerosa: lunga, pesante, una corazzata con il portapacchi.', mass: 1600, power: 0.98, top: 0.97, armor: 1.4, grip: 0.98, color: '#2c5a4a',
    cls: 'Station wagon · posteriore', drive: 'rwd', steer: 0.55, steerRate: 2.8, gears: 4, engine: 'endurance', comY: -0.25, roll: 1.15, frontGrip: 1.0, rearGrip: 1.0, powerOver: 0.03, hbYaw: 0.95, susp: 25, travel: 0.33 },
  { id: 'furgone', name: 'Bestione Van', desc: 'Furgone delle consegne: alto, lento a girare, ma è un muro che cammina.', mass: 1900, power: 1.06, top: 0.88, armor: 1.75, grip: 0.95, color: '#d9d4c5',
    cls: 'Furgone · posteriore', drive: 'rwd', steer: 0.5, steerRate: 2.5, gears: 4, engine: 'endurance', comY: -0.08, roll: 1.6, frontGrip: 1.0, rearGrip: 1.02, powerOver: 0.03, hbYaw: 0.75, susp: 27, travel: 0.32 },
  { id: 'rally', name: 'Saetta HF', desc: 'Compatta da rally a trazione integrale: incollata al fango, scatta come un fulmine.', mass: 1150, power: 1.12, top: 1.04, armor: 0.85, grip: 1.18, color: '#e8e4d8',
    cls: 'Rally · integrale', drive: 'awd', steer: 0.64, steerRate: 3.8, gears: 5, engine: 'rally', comY: -0.3, roll: 0.9, frontGrip: 1.0, rearGrip: 1.0, powerOver: 0.02, hbYaw: 1.3, susp: 33, travel: 0.38 },
  { id: 'hotrod', name: 'Diavolaccio', desc: 'Hot rod col motore all’aria e il compressore cromato: potenza brutale, telaio di carta velina.', mass: 1250, power: 1.42, top: 1.18, armor: 0.7, grip: 0.95, color: '#8a1010',
    cls: 'Hot rod · V8 compressore', drive: 'rwd', steer: 0.58, steerRate: 3.4, gears: 4, engine: 'endurance', comY: -0.3, roll: 1.0, frontGrip: 1.05, rearGrip: 0.95, powerOver: 0.14, hbYaw: 1.25, susp: 32, travel: 0.28 },
];
export const AI_COLORS = ['#9b2c2c', '#2c5d9b', '#3d7a3a', '#b8761c', '#6b3d8f', '#2b8a8a', '#8f8f8f', '#c7c2b0', '#3a3a3a', '#a33b6b', '#47602b'];

// Garage upgrades: level 0..3 for each system. Applied to a copy of the spec (see tuneSpec).
export const UPGRADES = [
  { id: 'eng', name: 'Motore', desc: 'Più cavalli e velocità massima', icon: 'bolt' },
  { id: 'arm', name: 'Corazza', desc: 'Lamiere rinforzate: incassi meglio (un po’ più pesante)', icon: 'shield' },
  { id: 'tyr', name: 'Gomme', desc: 'Mescola tassellata: più aderenza su ogni fondo', icon: 'tyre' },
  { id: 'nit', name: 'Nitro', desc: 'Bombola più grande e spinta più forte', icon: 'flame' },
];
export function tuneSpec(spec, tune = {}) {
  const e = tune.eng || 0, a = tune.arm || 0, t = tune.tyr || 0, n = tune.nit || 0;
  if (!e && !a && !t && !n) return spec;
  return { ...spec, power: spec.power * (1 + 0.07 * e), top: spec.top * (1 + 0.035 * e), armor: spec.armor * (1 + 0.15 * a), mass: spec.mass * (1 + 0.03 * a), grip: spec.grip * (1 + 0.045 * t), nitroDrain: 1 - 0.12 * n, nitroBoost: 1 + 0.1 * n, nitroStart: 10 * n };
}
export const LIVERIES = [
  { id: 'classica', name: 'Rottame' }, { id: 'strisce', name: 'Strisce' }, { id: 'fiamme', name: 'Fiamme' }, { id: 'scacchi', name: 'Scacchi' },
  { id: 'saetta', name: 'Saetta' }, { id: 'mimetica', name: 'Mimetica' }, { id: 'tricolore', name: 'Tricolore' },
];

// ---------- helpers ----------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.ctx = g; return t; }
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PRIMERS = ['#8a8d90', '#6d6f66', '#9a9283', '#4f5a62', '#7b3f2a'];
const SPONSORS = ['RICAMBI RUGGINE', 'OLIO GRASSINI', 'GOMME TONDE', 'BIRRA SCHIUMA', 'PNEUS POLPO', 'FERRAMENTA FULMINE', 'DEMOLIZIONI ZANZA', 'CARROZZERIA BOTTA'];
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = (t) => Math.max(0, Math.min(1, t)), sstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// Paint shader patch: mud rising from the sills as uDirt grows (0..1, object-space height) and
// scraped paint from the per-vertex attribute aScr: a ring of primer, then bare shiny metal.
function paintPatch(mat, uni, rust = { value: 0 }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = uni; sh.uniforms.uRust = rust;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aScr; varying float vScr; varying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vScr = aScr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vOP; varying float vScr; uniform float uDirt; uniform float uRust;
      float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float dn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float sN = dn(vOP * 9.0) * 0.6 + dn(vOP * vec3(21.0, 34.0, 21.0)) * 0.4;
        float sP = smoothstep(0.16, 0.42, vScr + (sN - 0.5) * 0.4);
        float sM = smoothstep(0.42, 0.8, vScr + (sN - 0.5) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.37, 0.38) * (0.75 + sN * 0.4), sP * 0.92);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.66, 0.67, 0.70), vec3(0.42, 0.22, 0.10), smoothstep(0.62, 0.9, dn(vOP * 7.0))), sM);
        // rust: blooms along the sills, wheel arches and panel edges, and creeps out of the scraped metal
        float rN = dn(vOP * 5.3) * 0.55 + dn(vOP * 17.0) * 0.3 + dn(vOP * 41.0) * 0.15;
        float rLow = smoothstep(0.62, 0.2, vOP.y) * 0.55 + sM * 0.9 + sP * 0.25;
        float rAmt = smoothstep(1.02 - uRust * 0.75, 1.2 - uRust * 0.75, rN + rLow * 0.45) * step(0.01, uRust);
        vec3 rustC = mix(vec3(0.33, 0.13, 0.05), vec3(0.55, 0.27, 0.1), dn(vOP * 29.0)) * (0.7 + rN * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, rustC, clamp(rAmt, 0.0, 0.95));
        float dN = dn(vOP * 3.1) * 0.6 + dn(vOP * 9.0) * 0.4;
        float dLine = 0.35 + uDirt * 1.25 + dN * 0.35;
        float dAmt = smoothstep(dLine, dLine - 0.35, vOP.y) * clamp(uDirt * 1.6, 0.0, 1.0);
        dAmt = max(dAmt, uDirt * 0.35 * smoothstep(0.55, 0.85, dN));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.235, 0.16) * (0.75 + dN * 0.4), clamp(dAmt, 0.0, 0.92));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.85, sP), 0.32, sM); roughnessFactor = mix(roughnessFactor, 0.92, clamp(rAmt, 0.0, 1.0)); roughnessFactor = mix(roughnessFactor, 1.0, clamp(dAmt, 0.0, 1.0));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.95, sM * (1.0 - clamp(dAmt, 0.0, 1.0))); metalnessFactor *= 1.0 - clamp(rAmt, 0.0, 1.0) * 0.8;');
  };
  mat.customProgramCacheKey = () => 'dzpaint3';
  return mat;
}

// ---------- paint texture ----------
// 1024x1024 atlas: bottom quarter = left flank (x along the car, y up, 160 px/m), next quarter =
// right flank (mirrored so both start at the nose), top half = plan view (x along, z across, 256 px/m).
function bangerPaint(S, color, number, seed, look = {}) {
  const R = rand(seed * 977 + 13), L = S.L;
  const livery = look.livery || 'classica', accent = look.accent || '#f2efe6', stickers = look.stickers !== false;
  return canvasTex(1024, 1024, (g, W, H) => {
    const sx = W / (2 * L);
    let flip = 1, yUp = true;
    const sideL = (fn) => { g.save(); g.beginPath(); g.rect(0, 768, W, 256); g.clip(); g.setTransform(sx, 0, 0, -160, L * sx, 1024); flip = 1; yUp = true; fn('l'); g.restore(); };
    const sideR = (fn) => { g.save(); g.beginPath(); g.rect(0, 512, W, 256); g.clip(); g.setTransform(-sx, 0, 0, -160, L * sx, 768); flip = -1; yUp = true; fn('r'); g.restore(); };
    const sides = (fn) => { sideL(fn); sideR(fn); };
    const top = (fn) => { g.save(); g.beginPath(); g.rect(0, 0, W, 512); g.clip(); g.setTransform(sx, 0, 0, 256, L * sx, 256); flip = 1; yUp = false; fn(); g.restore(); };
    // text in metres inside the current frame (never mirrored / upside down)
    const txt = (s, x, y, size, col, { font = '900', rot = 0, stroke = null, align = 'center' } = {}) => { g.save(); g.translate(x, y); g.scale(flip * size / 100, (yUp ? -1 : 1) * size / 100); g.rotate(rot); g.font = `${font} 100px "Exo 2", Impact, Arial, sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; if (stroke) { g.lineWidth = 14; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, 0, 0); } g.fillStyle = col; g.fillText(s, 0, 4); g.restore(); };
    const base = new THREE.Color(color);
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    // subtle panel-to-panel shade differences (resprays), sun-bleached horizontal surfaces
    top(() => { const gr = g.createLinearGradient(-L, 0, L, 0); gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.13)'); gr.addColorStop(1, 'rgba(255,255,255,0.04)'); g.fillStyle = gr; g.fillRect(-L, -1, 2 * L, 2); });
    if (livery === 'mimetica') {
      const shades = [base.clone().multiplyScalar(0.55), base.clone().lerp(new THREE.Color('#8a7a52'), 0.5), base.clone().lerp(new THREE.Color('#2a2f1e'), 0.6)];
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 110; i++) { g.fillStyle = '#' + shades[i % 3].getHexString(); g.beginPath(); const x = R() * W, y = R() * H, r = 18 + R() * 44; for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2, rr = r * (0.6 + R() * 0.6); k ? g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr); } g.fill(); }
      g.restore();
    }
    // scrapyard replacement panels: a door or a wing in primer or in another car's colour
    const swaps = livery === 'classica' ? 1 + Math.floor(R() * 2) : R() < 0.5 ? 1 : 0;
    for (let i = 0; i < (look.clean ? Math.min(1, swaps) : swaps); i++) {
      const col = R() < 0.6 ? PRIMERS[Math.floor(R() * PRIMERS.length)] : `hsl(${Math.floor(R() * 360)},45%,${30 + R() * 20}%)`;
      const which = Math.floor(R() * 3), right = R() < 0.5;
      const [a, b] = which === 0 ? S.door : which === 1 ? [S.door[1] + 0.02, L] : [-L, S.door[0] - 0.02];
      (right ? sideR : sideL)(() => { g.fillStyle = col; g.fillRect(a, 0, b - a, 1.6); });
      if (which === 1 && R() < 0.5) top(() => { g.fillStyle = col; g.fillRect(S.cabF + 0.05, -1, L, 2); });
    }
    // livery artwork
    const flame = (x0, len, y0, h) => {
      const gr = g.createLinearGradient(x0, 0, x0 - len, 0); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.25, '#ffc21a'); gr.addColorStop(0.6, '#ff6a00'); gr.addColorStop(1, '#c81000');
      g.fillStyle = gr; g.strokeStyle = 'rgba(20,10,0,0.75)'; g.lineWidth = 0.015; g.beginPath(); g.moveTo(x0, y0 - h * 0.5);
      const n = 5; for (let k = 0; k < n; k++) { const yy = y0 - h * 0.5 + (h * (k + 0.5)) / n, l = len * (0.55 + 0.45 * Math.sin(k * 1.7 + 1) ** 2); g.quadraticCurveTo(x0 - l * 0.6, yy - h / n * 0.9, x0 - l, yy); g.quadraticCurveTo(x0 - l * 0.55, yy + h / n * 0.2, x0 - len * 0.12, y0 - h * 0.5 + (h * (k + 1)) / n); }
      g.lineTo(x0, y0 + h * 0.5); g.closePath(); g.fill(); g.stroke();
    };
    const yM = (S.y0 + S.belt) / 2 + 0.04; // mid height of the flank
    if (livery === 'classica') { if (R() < 0.65) top(() => { g.fillStyle = R() < 0.5 ? '#f2efe6' : '#141414'; g.fillRect(-L, -0.2, 2 * L, 0.4); }); }
    else if (livery === 'strisce') { top(() => { g.fillStyle = accent; g.fillRect(-L, -0.26, 2 * L, 0.17); g.fillRect(-L, 0.09, 2 * L, 0.17); }); sides(() => { g.fillStyle = accent; g.fillRect(-L, S.y0 + 0.08, 2 * L, 0.07); g.fillRect(-L, S.y0 + 0.18, 2 * L, 0.025); }); }
    else if (livery === 'tricolore') { top(() => { [['#1f8a3a', -1.5], ['#f4f1e8', -0.5], ['#d0101e', 0.5]].forEach(([c, k]) => { g.fillStyle = c; g.fillRect(-L, k * 0.16, 2 * L, 0.16); }); }); sides(() => { [['#d0101e', 0], ['#f4f1e8', 1], ['#1f8a3a', 2]].forEach(([c, k]) => { g.fillStyle = c; g.fillRect(-L, yM - 0.1 + k * 0.065, 2 * L, 0.065); }); }); }
    else if (livery === 'fiamme') { sides(() => flame(L, L * 1.25, yM, S.belt - S.y0 - 0.1)); top(() => flame(L, L * 0.8, 0, 1.3)); }
    else if (livery === 'scacchi') { const s = 0.11; sides(() => { for (let x = -L, i = 0; x < L; x += s, i++) for (let r = 0; r < 2; r++) { g.fillStyle = (i + r) % 2 ? '#111' : '#f4f1e8'; g.fillRect(x, S.y0 + 0.06 + r * s, s + 0.002, s + 0.002); } }); top(() => { for (let x = S.cabF + 0.1, i = 0; x < L; x += 0.16, i++) for (let r = -2; r < 2; r++) { g.fillStyle = (i + r + 8) % 2 ? '#111' : '#f4f1e8'; g.fillRect(x, r * 0.16, 0.162, 0.162); } }); }
    else if (livery === 'saetta') { sides(() => { g.fillStyle = accent; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.015; g.beginPath(); const P = [[0.96, 0.75], [0.25, 0.55], [0.33, 0.38], [-0.85, 0.15], [-0.1, 0.5], [-0.2, 0.66], [0.96, 0.82]]; P.forEach(([u, v], i) => { const x = u * L, y = S.y0 + v * (S.belt - S.y0); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); g.stroke(); }); top(() => { g.fillStyle = accent; g.fillRect(-L, -0.07, 2 * L, 0.14); }); }
    // panel gaps: doors, bonnet and boot shut lines
    sides(() => { g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.012; for (const x of [S.door[0], S.door[1], ...(S.gaps || [])]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1.6); g.stroke(); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-L, S.belt - 0.012, 2 * L, 0.012); });
    // rust: bubbling along the sills and the arch lips, streaks below the trim, random scabs
    sides(() => {
      for (let i = 0; i < (look.clean ? 8 : 34); i++) { const x = (R() * 2 - 1) * L, y = S.y0 + R() ** 2.2 * 0.5, r = 0.03 + R() * 0.1; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(96,44,16,0.95)'); rg.addColorStop(0.6, 'rgba(120,62,24,0.7)'); rg.addColorStop(1, 'rgba(120,62,24,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, 7); g.fill(); }
      for (const a of S.arch) for (let k = 0; k < (look.clean ? 3 : 9); k++) { const an = R() * Math.PI, rr = a.Ra + 0.02 + R() * 0.05, x = a.x + Math.cos(an) * rr, y = a.y + Math.sin(an) * rr, r = 0.02 + R() * 0.05; g.fillStyle = `rgba(${90 + R() * 40},${40 + R() * 20},14,0.85)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      if (!look.clean) for (let i = 0; i < 14; i++) { const x = (R() * 2 - 1) * L, y = S.belt - R() * 0.1; const gr = g.createLinearGradient(0, y, 0, y - 0.3); gr.addColorStop(0, 'rgba(110,54,20,0.6)'); gr.addColorStop(1, 'rgba(110,54,20,0)'); g.fillStyle = gr; g.fillRect(x, y - 0.3, 0.012 + R() * 0.02, 0.3); }
    });
    top(() => { for (let i = 0; i < (look.clean ? 4 : 16); i++) { const x = (R() * 2 - 1) * L, z = (R() * 2 - 1) * 0.8, r = 0.04 + R() * 0.16; const rg = g.createRadialGradient(x, z, 0, x, z, r); const rust = R() < 0.6; rg.addColorStop(0, rust ? 'rgba(110,52,20,0.9)' : 'rgba(120,124,128,0.9)'); rg.addColorStop(0.6, rust ? 'rgba(92,44,18,0.6)' : 'rgba(110,112,116,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(x, z, r * 1.5, r, R() * 3, 0, 7); g.fill(); } });
    // sponsor stickers
    if (stickers) {
      sides(() => { const sp = SPONSORS[Math.floor(R() * SPONSORS.length)], x = S.door[0] - 0.62, y = yM + 0.04; g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.08); g.fillStyle = R() < 0.5 ? '#f3e14a' : '#f4f1e8'; g.fillRect(-0.5, -0.075, 1.0, 0.15); g.restore(); txt(sp, x, y, 0.085, '#111', { font: 'italic 900' }); const s2 = SPONSORS[Math.floor(R() * SPONSORS.length)]; txt(s2, S.door[1] + 0.5, S.belt - 0.12, 0.06, 'rgba(255,255,255,0.85)', { font: 'italic 800' }); });
    }
    // hand-painted race numbers: door roundels (brush edges, a drip or two) and a big one on the roof
    const dc = (S.door[0] + S.door[1]) / 2;
    sides(() => { const y = yM + 0.02, r = Math.min(0.27, (S.belt - S.y0) * 0.42); g.fillStyle = '#f4f1e8'; g.beginPath(); for (let k = 0; k <= 24; k++) { const a = (k / 24) * 6.2832, rr = r * (0.94 + 0.08 * Math.sin(k * 2.3 + seed)); k ? g.lineTo(dc + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(dc + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); g.fillRect(dc - r * 0.5, y - r * 1.35, 0.018, r * 0.5); g.fillRect(dc + r * 0.2, y - r * 1.2, 0.012, r * 0.3); txt(String(number), dc, y, r * 1.35, '#111', { rot: (R() - 0.5) * 0.12 }); });
    top(() => { const cx = S.roofC; txt(String(number), cx, 0, S.roofN, 'rgba(244,241,232,0.95)', { rot: Math.PI / 2, stroke: 'rgba(0,0,0,0.5)' }); if (!S.hotrod && !S.van) txt(String(number), (S.cabF + L) / 2 - 0.05, 0, 0.5, 'rgba(244,241,232,0.9)', { rot: Math.PI / 2 }); });
    // road grime along the bottom of the flanks, scratches
    sides(() => { const m = g.createLinearGradient(0, S.y0, 0, S.y0 + 0.3); m.addColorStop(0, 'rgba(70,52,34,0.9)'); m.addColorStop(1, 'rgba(70,52,34,0)'); g.fillStyle = m; g.fillRect(-L, 0, 2 * L, S.y0 + 0.3); g.strokeStyle = 'rgba(230,230,230,0.35)'; g.lineWidth = 0.004; for (let i = 0; i < (look.clean ? 10 : 40); i++) { const x = (R() * 2 - 1) * L, y = S.y0 + R() * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 0.7, y + (R() - 0.5) * 0.05); g.stroke(); } });
  });
}

const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.16, metalness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.5, metalness: 0.8 }),
  cage: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.45, metalness: 0.7 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x232120, roughness: 0.9, side: THREE.DoubleSide }),
  seat: new THREE.MeshStandardMaterial({ color: 0x1b1c22, roughness: 0.7 }),
  belt: new THREE.MeshStandardMaterial({ color: 0xb01414, roughness: 0.8 }),
  net: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  engine: new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.55, metalness: 0.7 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff7a00, emissiveIntensity: 0.25, roughness: 0.3 }),
};
const HELMETS = ['#f2f2f2', '#e10600', '#ffd400', '#1e90ff', '#2e2e2e', '#ff7a00'];
const RIMS = [[0x8a8d92, 0.8], [0xe8e6de, 0.2], [0xb01a14, 0.3], [0x1c1c1e, 0.5], [0xc9a23a, 0.9], [0xcfd3d8, 1]];
const _rimMats = new Map();
function rimMat(i) { if (!_rimMats.has(i)) _rimMats.set(i, new THREE.MeshStandardMaterial({ color: RIMS[i][0], metalness: RIMS[i][1], roughness: 0.42 })); return _rimMats.get(i); }
let _tyreMat = null;
function tyreMat() {
  if (_tyreMat) return _tyreMat;
  const t = canvasTex(512, 128, (g, W, H) => {
    g.fillStyle = '#171717'; g.fillRect(0, 0, W, H);
    // tread blocks in the middle band, lettering on both sidewalls
    g.fillStyle = '#0c0c0c'; for (let x = 0; x < W; x += 16) { g.fillRect(x, H * 0.36, 7, H * 0.28); g.fillRect(x + 8, H * 0.42, 4, H * 0.16); }
    g.fillStyle = '#242424'; g.fillRect(0, H * 0.49, W, 3);
    g.font = '900 15px Arial'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(225,225,215,0.8)';
    for (const y of [H * 0.17, H * 0.83]) for (let k = 0; k < 2; k++) g.fillText('POLPO  GRIP 70', 20 + k * 256, y);
    g.fillStyle = 'rgba(120,95,70,0.25)'; for (let i = 0; i < 200; i++) g.fillRect(Math.random() * W, Math.random() * H, 3, 2);
  });
  t.wrapS = THREE.RepeatWrapping;
  return (_tyreMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }));
}

function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }
function box(w, h, d, m, x, y, z) { const o = mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; }
function tube(a, b, r, m, seg = 6) { const d = new THREE.Vector3().subVectors(b, a); const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const _wheelCache = new Map();
function wheel(r, w, style = 0, rim = 0) {
  const grp = new THREE.Group(), spin = new THREE.Group(); grp.add(spin);
  const key = r + ':' + w + ':' + style;
  if (!_wheelCache.has(key)) {
    const prof = []; const rr = w * 0.3, rimR = r * 0.62;
    prof.push(new THREE.Vector2(rimR, -w / 2 + 0.01));
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
    for (let k = 0; k <= 5; k++) { const a = (k / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
    prof.push(new THREE.Vector2(rimR, w / 2 - 0.01));
    const tg = new THREE.LatheGeometry(prof, 24); tg.rotateX(Math.PI / 2);
    { const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2); }
    // rim: a dished disc on both faces, with slots (steel) or five spokes, wheel nuts and a hub cap
    const bits = [];
    for (const sg of [1, -1]) {
      const dish = new THREE.LatheGeometry([new THREE.Vector2(rimR * 0.2, w * 0.2), new THREE.Vector2(rimR * 0.55, w * 0.24), new THREE.Vector2(rimR * 0.86, w * 0.36), new THREE.Vector2(rimR, w * 0.47), new THREE.Vector2(rimR * 1.04, w * 0.47)], 20);
      dish.rotateX(sg * Math.PI / 2); bits.push(dish.toNonIndexed());
      if (style === 1) for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const sp = new THREE.BoxGeometry(rimR * 0.78, rimR * 0.2, 0.03); sp.translate(rimR * 0.52, 0, sg * w * 0.33); sp.rotateZ(a); bits.push(sp.toNonIndexed()); }
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.3; const n = new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6); n.rotateX(Math.PI / 2); n.translate(Math.cos(a) * rimR * 0.36, Math.sin(a) * rimR * 0.36, sg * w * 0.24); bits.push(n.toNonIndexed()); }
      const hub = new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.24, 0.07, 12); hub.rotateX(Math.PI / 2); hub.translate(0, 0, sg * w * 0.24); bits.push(hub.toNonIndexed());
    }
    const drum = new THREE.CylinderGeometry(rimR * 0.9, rimR * 0.9, w * 0.5, 14); drum.rotateX(Math.PI / 2);
    _wheelCache.set(key, { tg, rim: mergeGeometries(bits.map((b) => { b.deleteAttribute('uv'); return b; })), drum });
  }
  const { tg, rim: rg, drum } = _wheelCache.get(key);
  spin.add(mesh(tg, tyreMat())); const rm = mesh(rg, rimMat(rim)); rm.material.side = THREE.DoubleSide; spin.add(rm); const dr = mesh(drum, M.dark); dr.castShadow = false; spin.add(dr);
  grp.userData.spin = spin; grp.userData.r = r; grp.userData.w = w; grp.userData.bent = 0; grp.userData.toe = 0; return grp;
}
export function makeWheel(r, w) { return wheel(r, w); }

// Body proportions per model. L/W = half length/width, roof/belt = roof and shoulder heights,
// cabR..cabF = greenhouse span (rear screen base .. windscreen base), ws/rs = windscreen / rear
// screen run, y0 = sill height, door = [rear, front] edge of the (detachable) front doors,
// wins = side window openings, wr/ww = wheel radius/width (wrF/wwF fronts when different).
const SHAPES = {
  berlina: { L: 2.3, W: 0.92, roof: 1.42, belt: 0.93, cabR: -1.55, cabF: 0.92, ws: 0.6, rs: 0.55, y0: 0.3, tumble: 0.15, door: [-0.4, 0.78], wins: [[-0.98, -0.44], [-0.36, 0.7]], gaps: [-1.12], wr: 0.34, ww: 0.24, boot: true, grille: 'bars', lamps: 'round2', rim: 0, deck: 0.03, nose: 0.1 },
  muscle: { L: 2.3, W: 0.92, roof: 1.3, belt: 0.9, cabR: -1.7, cabF: 0.62, ws: 0.62, rs: 0.85, y0: 0.29, tumble: 0.17, door: [-0.62, 0.52], wins: [[-0.95, 0.45]], wr: 0.35, ww: 0.27, boot: true, scoop: true, spoiler: true, grille: 'split', lamps: 'round4', rim: 1, deck: 0.03, nose: 0.07, hip: 0.05 },
  pickup: { L: 2.45, W: 0.92, roof: 1.64, belt: 1.02, cabR: -0.2, cabF: 1.1, ws: 0.45, rs: 0.1, y0: 0.44, tumble: 0.1, door: [-0.12, 0.98], wins: [[-0.05, 0.88]], wr: 0.4, ww: 0.3, bed: true, bullbar: true, grille: 'egg', lamps: 'rect', rim: 0, deck: 0.0, nose: 0.06 },
  utilitaria: { L: 1.8, W: 0.82, roof: 1.44, belt: 0.92, cabR: -1.72, cabF: 0.82, ws: 0.52, rs: 0.34, y0: 0.3, tumble: 0.13, door: [-0.52, 0.6], wins: [[-1.28, -0.56], [-0.48, 0.58]], wr: 0.32, ww: 0.22, hatch: true, spoiler2: true, grille: 'slot', lamps: 'rect', rim: 0, deck: 0.02, nose: 0.12, tailgate: true },
  familiare: { L: 2.42, W: 0.92, roof: 1.46, belt: 0.93, cabR: -2.32, cabF: 0.92, ws: 0.6, rs: 0.22, y0: 0.3, tumble: 0.14, door: [-0.4, 0.78], wins: [[-2.0, -1.2], [-1.12, -0.44], [-0.36, 0.7]], gaps: [-1.16], wr: 0.34, ww: 0.25, rack: true, tailgate: true, grille: 'bars', lamps: 'round4', rim: 0, deck: 0.02, nose: 0.1, woody: true },
  furgone: { L: 2.35, W: 0.97, roof: 2.06, belt: 1.08, cabR: -2.3, cabF: 1.78, ws: 0.5, rs: 0.06, y0: 0.4, tumble: 0.08, door: [0.34, 1.14], wins: [[0.42, 1.22]], gaps: [-0.7, -2.0], wr: 0.36, ww: 0.26, van: true, tailgate: true, grille: 'slot', lamps: 'round2', rim: 1, deck: 0.0, nose: 0.12 },
  rally: { L: 1.95, W: 0.86, roof: 1.4, belt: 0.9, cabR: -1.84, cabF: 0.78, ws: 0.55, rs: 0.5, y0: 0.27, tumble: 0.15, door: [-0.5, 0.72], wins: [[-1.2, -0.54], [-0.46, 0.6]], wr: 0.33, ww: 0.25, wing: true, pod: true, scoopRoof: true, tailgate: true, hatch: true, grille: 'slot', lamps: 'rect', rim: 4, rimStyle: 1, deck: 0.02, nose: 0.1, flare: 0.045 },
  hotrod: { L: 2.2, W: 0.78, roof: 1.26, belt: 0.86, cabR: -1.5, cabF: 0.0, ws: 0.22, rs: 0.3, y0: 0.34, tumble: 0.06, door: [-0.88, -0.1], wins: [[-0.85, -0.22]], wrF: 0.3, wwF: 0.18, wr: 0.43, ww: 0.36, boot: true, hotrod: true, wzF: 0.98, wzR: 0.86, grille: 'shell', lamps: 'bucket', rim: 5, rimStyle: 1, deck: 0.0, nose: 0.04, taperF: [0.4, 2.0] },
};
for (const S of Object.values(SHAPES)) {
  S.wx = S.L - 0.72; const wzF = S.wzF ?? S.W - 0.12, wzR = S.wzR ?? S.W - 0.12, wrF = S.wrF ?? S.wr;
  S.arch = []; if (!S.hotrod) S.arch.push({ x: S.wx, y: wrF, Ra: wrF + 0.09 }); S.arch.push({ x: -S.wx + 0.05, y: S.wr, Ra: S.wr + 0.09 });
  S.roofC = S.van ? 0 : (S.cabR + S.rs + S.cabF - S.ws) / 2; S.roofN = Math.min(0.85, (S.cabF - S.ws - S.cabR - S.rs) * 0.7);
  S.wzF = wzF; S.wzR = wzR;
}
export const SHAPE_OF = (type) => SHAPES[type] || SHAPES.berlina;

// smoothed piecewise-linear profile through [x, y] control points
function profile(pts, blur = 3) {
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0], n = Math.ceil((x1 - x0) / 0.02) + 1; let a = new Float32Array(n);
  for (let i = 0, k = 0; i < n; i++) { const x = Math.min(x1, x0 + i * 0.02); while (k < pts.length - 2 && pts[k + 1][0] < x) k++; a[i] = lerp(pts[k][1], pts[k + 1][1], clamp01((x - pts[k][0]) / ((pts[k + 1][0] - pts[k][0]) || 1))); }
  for (let pass = 0; pass < 2; pass++) { const b = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -blur; k <= blur; k++) { const j = Math.max(0, Math.min(n - 1, i + k)); s += a[j]; c++; } b[i] = s / c; } a = b; }
  return (x) => { const f = Math.max(0, Math.min(n - 1.001, (x - x0) / 0.02)), i = Math.floor(f); return a[i] + (a[i + 1] - a[i]) * (f - i); };
}

const RING = 27;
// One lofted shell per car, cut into the fixed body, the detachable panels (bonnet, boot, doors)
// and the glass. Ring layout per station (left = +z): 0..4 flank (sill to shoulder), 5..12 top
// half (shoulder, pillar x2, roof edge, 4 across), 13 centre line, then mirrored.
function buildShell(S) {
  const { L, W } = S, crownB = 0.045;
  const deckY = S.belt + S.deck, backT = S.hatch || S.van || S.tailgate ? S.belt + 0.02 : deckY;
  const P = [[-L, S.belt - 0.08], [-L + 0.06, S.bed ? S.belt + 0.02 : backT]];
  if (S.bed) P.push([S.cabR - 0.02, S.belt + 0.02]); else if (S.cabR > -L + 0.3) P.push([S.cabR, deckY + 0.02]);
  P.push([S.cabR + S.rs, S.roof - (S.hotrod ? 0 : 0.02)], [(S.cabR + S.rs + S.cabF - S.ws) / 2, S.roof], [S.cabF - S.ws, S.roof - 0.025], [S.cabF, S.belt + 0.07], [L - 0.14, S.belt + 0.05 - S.nose * 0.6], [L, S.belt - S.nose - 0.05]);
  const top = profile(P.sort((a, b) => a[0] - b[0]));
  const beltLine = (x) => S.belt + (S.hip ? S.hip * Math.exp(-(((x + S.wx - 0.2) / 0.55) ** 2)) : 0) - 0.02 * sstep((x - L + 0.9) / 0.9);
  const [tfA, tfL] = S.taperF || [0.1, 0.6];
  const width = (x) => { let w = W * (1 - tfA * sstep((x - (L - tfL)) / tfL) ** 1.5 - 0.09 * sstep((-x - (L - 0.6)) / 0.6) ** 1.5); const e = (Math.abs(x) - (L - 0.14)) / 0.14; if (e > 0) w -= 0.07 * e * e; return w; };
  const ylow = (x, sh) => { const e = clamp01((Math.abs(x) - (L - 0.45)) / 0.45); let y = S.y0 + 0.09 * e * e, arch = false; for (const a of S.arch) { const dx = x - a.x; if (Math.abs(dx) < a.Ra) { const ya = Math.min(a.y + Math.sqrt(a.Ra * a.Ra - dx * dx), sh - 0.09); if (ya > y) { y = ya; arch = true; } } } return [y, arch]; };
  // stations: 7 cm apart, plus the exact arch ends so wheel openings start cleanly
  let xs = []; for (let x = -L; x < L - 0.02; x += 0.07) xs.push(x); xs.push(L);
  for (const a of S.arch) xs.push(a.x - a.Ra, a.x + a.Ra, a.x - a.Ra * 0.94, a.x + a.Ra * 0.94);
  xs = xs.filter((x) => x >= -L && x <= L).sort((a, b) => a - b).filter((x, i, A) => !i || x - A[i - 1] > 0.018);
  const N = xs.length, pos = new Float32Array(N * RING * 3), uv = new Float32Array(N * RING * 2);
  const zG = 1; // glass half width reference for uv
  const ghAt = new Float32Array(N), shAt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = xs[i], t = top(x), w = width(x), crown = crownB;
    const sh = Math.min(beltLine(x), t - crown - 0.02), g = sstep((t - sh - 0.12) / 0.3);
    ghAt[i] = g; shAt[i] = sh;
    const [yl, arch] = ylow(x, sh), h = sh - yl, lip = arch ? (S.flare || 0.022) : 0;
    const zE = Math.max(0.1, w - 0.13 - S.tumble * g), yE = Math.max(sh + 0.015, t - crown - 0.02 * g);
    const half = [[w - 0.07 + lip * 1.4, yl], [w - 0.012 + lip, yl + h * 0.22], [w, yl + h * 0.55], [w - 0.008, yl + h * 0.86], [w - 0.04, sh],
      [w - 0.04, sh], [lerp(w - 0.05, zE, 0.36) + 0.012 * g, lerp(sh, yE, 0.34)], [lerp(w - 0.05, zE, 0.7) + 0.012 * g, lerp(sh, yE, 0.7)], [zE, yE]];
    for (let k = 1; k <= 4; k++) { const z = zE * (1 - k / 5); half.push([z, yE + (t - yE) * (1 - (z / zE) ** 2.2)]); }
    const put = (j, z, y, side) => { const o = (i * RING + j) * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; const u = (i * RING + j) * 2; if (side === 1) { uv[u] = (x + L) / (2 * L); uv[u + 1] = clamp01(y / 1.6) * 0.25; } else if (side === -1) { uv[u] = (L - x) / (2 * L); uv[u + 1] = 0.25 + clamp01(y / 1.6) * 0.25; } else { uv[u] = (x + L) / (2 * L); uv[u + 1] = 0.75 - 0.25 * Math.max(-1, Math.min(1, z)); } };
    for (let j = 0; j < 13; j++) { const [z, y] = half[j]; put(j, z, y, j < 5 ? 1 : 0); put(26 - j, -z, y, j < 5 ? -1 : 0); }
    put(13, 0, t, 0);
  }
  // normals of the whole loft (welded across the uv seam at the shoulder)
  const allIdx = []; for (let i = 0; i < N - 1; i++) for (let j = 0; j < RING - 1; j++) { if (j === 4 || j === 21) continue; const a = i * RING + j, b = a + RING; allIdx.push(a, b, a + 1, b, b + 1, a + 1); }
  const full = new THREE.BufferGeometry(); full.setAttribute('position', new THREE.BufferAttribute(pos, 3)); full.setIndex(allIdx); full.computeVertexNormals();
  const nor = full.attributes.normal.array;
  for (let i = 0; i < N; i++) for (const [a, b] of [[4, 5], [21, 22]]) { const p = (i * RING + a) * 3, q = (i * RING + b) * 3; const n = V(nor[p] + nor[q], nor[p + 1] + nor[q + 1], nor[p + 2] + nor[q + 2]).normalize(); nor[p] = nor[q] = n.x; nor[p + 1] = nor[q + 1] = n.y; nor[p + 2] = nor[q + 2] = n.z; }
  const inR = (x, [a, b]) => x > a && x < b;
  const cls = (i, j) => {
    const xm = (xs[i] + xs[i + 1]) / 2, g = (ghAt[i] + ghAt[i + 1]) / 2;
    if (j >= 8 && j <= 17) {
      if (j >= 9 && j <= 16 && g > 0.05) { if (xm > S.cabF - S.ws + 0.03 && xm < S.cabF - 0.04) return 'glassF'; if (S.rs > 0.15 && xm > S.cabR + 0.05 && xm < S.cabR + S.rs - 0.02) return 'glassR'; }
      if (xm > S.cabF + 0.05 && xm < L - 0.1) return S.hotrod ? null : 'bonnet';
      if (S.boot && xm < S.cabR - 0.04 && xm > -L + 0.1) return 'boot';
      if (S.bed && xm < S.cabR - 0.1 && xm > -L + 0.12) return null;
      return 'shell';
    }
    if ((j >= 5 && j <= 7) || (j >= 18 && j <= 20)) { if (g > 0.6 && S.wins.some((r) => inR(xm, r))) return null; return 'shell'; }
    if (inR(xm, S.door)) return j < 4 ? 'left' : 'right';
    return 'shell';
  };
  const buckets = {};
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < RING - 1; j++) { if (j === 4 || j === 21) continue; const c = cls(i, j); if (!c) continue; const a = i * RING + j, b = a + RING; (buckets[c] ||= []).push(a, b, a + 1, b, b + 1, a + 1); }
  const sub = (idx, extra) => {
    const map = new Map(), p = [], n = [], u = [], out = [];
    for (const k of idx) { let m = map.get(k); if (m == null) { m = p.length / 3; map.set(k, m); p.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); n.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]); u.push(uv[k * 2], uv[k * 2 + 1]); } out.push(m); }
    if (extra) extra(p, n, u, out);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setAttribute('aScr', new THREE.Float32BufferAttribute(new Float32Array(p.length / 3), 1)); g.setIndex(out);
    g.userData.orig = Float32Array.from(p); return g;
  };
  // end caps (nose and tail panels) belong to the fixed shell
  const caps = (p, n, u, out) => {
    for (const [i, sg] of [[0, -1], [N - 1, 1]]) {
      const base = p.length / 3; let cy = 0;
      for (let j = 0; j < RING; j++) { const k = (i * RING + j) * 3; p.push(pos[k] + sg * 0.004, pos[k + 1], pos[k + 2]); n.push(sg, 0, 0); u.push(sg > 0 ? 0.99 : 0.01, 0.75 - 0.25 * pos[k + 2]); cy += pos[k + 1]; }
      p.push(xs[i] + sg * 0.004, cy / RING, 0); n.push(sg, 0, 0); u.push(sg > 0 ? 0.99 : 0.01, 0.75);
      for (let j = 0; j < RING - 1; j++) sg > 0 ? out.push(base + RING, base + j + 1, base + j) : out.push(base + RING, base + j, base + j + 1);
    }
  };
  const geos = {}; for (const k of Object.keys(buckets)) if (!k.startsWith('glass')) geos[k] = sub(buckets[k], k === 'shell' ? caps : null);
  // glass: own uv atlas (front screen in the left half, rear in the right half) for the crack texture
  const gIdx = [...(buckets.glassF || []), ...(buckets.glassR || [])];
  if (gIdx.length) {
    const nF = (buckets.glassF || []).length;
    const g = sub(gIdx); const P2 = g.attributes.position, U = g.attributes.uv; g.deleteAttribute('aScr');
    // vertices are shared between the two screens only if they touch (they never do)
    const seen = new Set(); const ix = g.index.array;
    for (let q = 0; q < ix.length; q++) { const v = ix[q]; if (seen.has(v)) continue; seen.add(v); const front = q < nF; const x = P2.getX(v), z = P2.getZ(v); const zz = 0.5 - z / (2 * zG); if (front) U.setXY(v, 0.02 + 0.46 * zz, clamp01((x - (S.cabF - S.ws)) / S.ws)); else U.setXY(v, 0.52 + 0.46 * zz, clamp01((x - S.cabR) / S.rs)); }
    geos.glass = g;
  }
  const iAt = (x) => { let b = 0; for (let i = 0; i < N; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[b] - x)) b = i; return b; };
  return { geos, top, width, sh: (x) => shAt[iAt(x)], zE: (x) => { const i = iAt(x); return pos[(i * RING + 8) * 3 + 2]; }, roofEdgeY: (x) => { const i = iAt(x); return pos[(i * RING + 8) * 3 + 1]; } };
}

function grilleTex(kind) {
  return canvasTex(256, 64, (g, W, H) => {
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
    if (kind === 'bars') { g.fillStyle = '#c9cdd2'; for (let y = 6; y < H; y += 11) g.fillRect(4, y, W - 8, 4); g.fillRect(W / 2 - 3, 0, 6, H); }
    else if (kind === 'split') { g.fillStyle = '#c9cdd2'; g.fillRect(W / 2 - 10, 0, 20, H); g.strokeStyle = '#8b8f94'; g.lineWidth = 2; for (let y = 8; y < H; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
    else if (kind === 'egg') { g.strokeStyle = '#b9bdc2'; g.lineWidth = 3; for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } g.lineWidth = 8; g.strokeRect(0, 0, W, H); }
    else if (kind === 'shell') { g.fillStyle = '#d7dadf'; g.fillRect(0, 0, W, H); g.fillStyle = '#0b0b0c'; g.fillRect(14, 8, W - 28, H - 16); g.fillStyle = '#c9cdd2'; for (let x = 22; x < W - 20; x += 12) g.fillRect(x, 8, 3, H - 16); }
    else { g.fillStyle = '#1c1c1e'; for (let y = 8; y < H; y += 12) g.fillRect(6, y, W - 12, 6); }
  });
}
const _gt = {};
function grilleMat(kind) { return (_gt[kind] ||= new THREE.MeshStandardMaterial({ map: grilleTex(kind), roughness: 0.4, metalness: 0.6 })); }
let _plateMat = null, _tailTex = null;
function tailTex() { return (_tailTex ||= canvasTex(64, 32, (g, W, H) => { g.fillStyle = '#d0140c'; g.fillRect(0, 0, W, H); g.fillStyle = '#ff9a1a'; g.fillRect(0, 0, W * 0.28, H); g.fillStyle = '#f2f2f2'; g.fillRect(W * 0.78, H * 0.5, W * 0.22, H * 0.5); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2); for (let x = 4; x < W; x += 6) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 2, H); } })); }
function plateMat() { return (_plateMat ||= new THREE.MeshStandardMaterial({ map: canvasTex(128, 32, (g, W, H) => { g.fillStyle = '#f1efe6'; g.fillRect(0, 0, W, H); g.fillStyle = '#1b3fa0'; g.fillRect(0, 0, 12, H); g.fillStyle = '#111'; g.font = '900 24px Arial'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('SC 404 TO', W / 2 + 6, H / 2 + 2); }), roughness: 0.6 })); }

// curved chrome bumper bar following the plan shape of the nose / tail
function bumperGeo(w, bend, h = 0.15, d = 0.11) {
  const g = new THREE.BoxGeometry(d, h, w * 2, 2, 3, 12); const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const z = P.getZ(i) / w, y = P.getY(i) / (h / 2); const e = Math.max(0, Math.abs(z) - 0.72) / 0.28; P.setX(i, P.getX(i) * (1 - 0.35 * y * y) - bend * z * z - 0.16 * e * e); if (Math.abs(z) > 0.98) P.setX(i, P.getX(i) - 0.1); }
  g.computeVertexNormals(); return g;
}

// returns THREE.Group with userData { wheels[], shell, body (fixed deformable shell), cab (glass), parts[] (detachables),
// deform[] (every dentable mesh), wheelPos[], wrs[], dims, dirt, glass, lights }.  look: { livery, accent, stickers, clean }
export function buildBanger(type, color, number = 7, seed = 1, look = {}) {
  const car = new THREE.Group(), shell = new THREE.Group(); car.add(shell);
  const R = rand(seed * 131 + 7);
  const dirt = { value: 0 };
  // rust: old bangers carry it from the start (clean looks none), it spreads with the damage (see juice.js)
  const rust = { value: look.clean ? 0 : look.rust ?? 0.25 + R() * 0.45, base: 0 }; rust.base = rust.value;
  const S = SHAPE_OF(type), L = S.L, Wd = S.W, roofY = S.roof, beltY = S.belt;
  const paintTex = bangerPaint(S, color, number, seed, look);
  const paint = paintPatch(new THREE.MeshPhysicalMaterial({ map: paintTex, roughness: look.clean ? 0.36 : 0.55, metalness: 0.3, clearcoat: look.clean ? 0.8 : 0.35, clearcoatRoughness: look.clean ? 0.18 : 0.42, side: THREE.DoubleSide }), dirt, rust);
  const pm = paintPatch(new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0.3, clearcoat: 0.3, side: THREE.DoubleSide }), dirt, rust);
  const B = buildShell(S), G = B.geos;
  const body = mesh(G.shell, paint); shell.add(body);
  const deform = [body];
  const parts = [];
  const part = (o, zone, hp, kind = '') => { o.userData.zone = zone; o.userData.hp = o.userData.hp0 = hp; o.userData.kind = kind; o.userData.ph = R() * 6.28; shell.add(o); parts.push(o); return o; };
  // hinged panel: pivot group at the hinge, mesh kept in shell coordinates
  const hinged = (geo, hx, hy, hz, zone, hp, kind) => { const piv = new THREE.Group(); piv.position.set(hx, hy, hz); const m = mesh(geo, paint); m.position.set(-hx, -hy, -hz); piv.add(m); deform.push(m); piv.userData.panel = m; return part(piv, zone, hp, kind); };
  const cabR = S.cabR, cabF = S.cabF, shF = B.sh(L - 0.3), shR = B.sh(-L + 0.3), shM = B.sh((S.door[0] + S.door[1]) / 2);
  let bonnet = null;
  if (G.bonnet) { bonnet = hinged(G.bonnet, cabF + 0.05, B.top(cabF + 0.05) - 0.03, 0, 'front', 34, 'bonnet'); bonnet.userData.bonnet = true; }
  if (G.boot) hinged(G.boot, cabR - 0.04, B.top(cabR - 0.04) - 0.03, 0, 'rear', 30, 'boot');
  if (G.left) hinged(G.left, S.door[1], 0.6, B.width(S.door[1]) - 0.01, 'left', 30, 'door').userData.side = 1;
  if (G.right) hinged(G.right, S.door[1], 0.6, -B.width(S.door[1]) + 0.01, 'right', 30, 'door').userData.side = -1;
  // glass (front and rear screens; side windows are removed: derby rules)
  const WIN = { front: [0, 0.5, 0, 1], rear: [0.5, 1, 0, 1] };
  const winTex = canvasTex(512, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    for (const x0 of [0, W / 2]) {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(22,34,44,0.62)'); gr.addColorStop(1, 'rgba(12,18,24,0.42)'); g.fillStyle = gr; g.fillRect(x0, 0, W / 2, H);
      g.fillStyle = 'rgba(205,225,240,0.10)'; g.beginPath(); g.moveTo(x0 + 40, 0); g.lineTo(x0 + 110, 0); g.lineTo(x0 + 60, H); g.lineTo(x0 + 10, H); g.fill();
      const m = g.createLinearGradient(0, H, 0, H * 0.55); m.addColorStop(0, 'rgba(90,70,48,0.55)'); m.addColorStop(1, 'rgba(90,70,48,0)'); g.fillStyle = m; g.fillRect(x0, H * 0.5, W / 2, H * 0.5);
    }
    if (look.stickers !== false) { g.fillStyle = 'rgba(244,241,232,0.92)'; g.fillRect(0, 0, W / 2, 34); g.fillStyle = '#111'; g.font = 'italic 900 26px "Exo 2", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SPONSORS[Math.floor(R() * SPONSORS.length)], W / 4, 18, W / 2 - 16); }
  });
  const glassMat = new THREE.MeshPhysicalMaterial({ map: winTex, transparent: true, roughness: 0.06, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.05 });
  const cab = G.glass ? mesh(G.glass, glassMat) : mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)), glassMat);
  cab.castShadow = false; cab.renderOrder = 1; cab.geometry.userData.orig ||= Float32Array.from(cab.geometry.attributes.position.array); shell.add(cab); deform.push(cab);
  // ---- lights (own materials so brake / head lamps can be driven per car)
  const headM = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 0.55, roughness: 0.2 });
  const tailM = new THREE.MeshStandardMaterial({ map: tailTex(), emissiveMap: tailTex(), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.3 });
  const wN = B.width(L - 0.02), wT = B.width(-L + 0.02), noseY = B.top(L) - 0.02, gy = (noseY + S.y0 + 0.2) / 2 + 0.04;
  const lamp = (x, y, z, r, rect) => {
    if (rect) { shell.add(box(0.05, 0.14, 0.26, headM, x, y, z)); const fr = box(0.04, 0.18, 0.3, M.chrome, x - 0.012, y, z); shell.add(fr); return; }
    const hl = mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), headM); hl.rotation.z = -Math.PI / 2; hl.position.set(x, y, z); shell.add(hl);
    const ring = mesh(new THREE.TorusGeometry(r + 0.008, 0.016, 6, 18), M.chrome); ring.rotation.y = Math.PI / 2; ring.position.set(x + 0.005, y, z); shell.add(ring);
  };
  if (S.hotrod) {
    // exposed V8 with a chrome supercharger, velocity stacks and headers; tall chrome grille shell; bucket lamps
    const eng = new THREE.Group(), ex = 0.95;
    eng.add(box(0.95, 0.4, 0.5, M.engine, ex, beltY - 0.14, 0));
    for (const z of [0.2, -0.2]) { const hd = box(0.8, 0.14, 0.2, M.chrome, ex, beltY + 0.06, z); hd.rotation.x = z > 0 ? -0.5 : 0.5; eng.add(hd); }
    eng.add(box(0.62, 0.2, 0.3, M.chrome, ex, beltY + 0.2, 0));
    for (let k = 0; k < 3; k++) { const st = mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.2, 12), M.chrome); st.position.set(ex - 0.2 + k * 0.2, beltY + 0.4, 0); eng.add(st); }
    for (const z of [1, -1]) for (let k = 0; k < 4; k++) { eng.add(tube(V(ex - 0.3 + k * 0.2, beltY - 0.02, z * 0.3), V(ex - 0.42 + k * 0.2, 0.42, z * 0.5), 0.032, M.chrome)); }
    for (const z of [1, -1]) eng.add(tube(V(ex - 0.5, 0.4, z * 0.5), V(ex - 1.7, 0.36, z * 0.56), 0.05, M.chrome, 8));
    const gs = mesh(new THREE.PlaneGeometry(0.62, 0.56), grilleMat('shell')); gs.rotation.y = Math.PI / 2; gs.position.set(L + 0.012, beltY - 0.2, 0); eng.add(gs);
    eng.add(box(0.07, 0.6, 0.66, M.chrome, L - 0.03, beltY - 0.2, 0));
    eng.traverse((o) => { if (o.isMesh) o.castShadow = true; }); part(eng, 'front', 44, 'engine');
    for (const z of [0.5, -0.5]) { lamp(L - 0.1, beltY - 0.02, z, 0.12); shell.add(tube(V(L - 0.2, beltY - 0.02, z), V(L - 0.3, 0.5, z * 0.7), 0.02, M.chrome)); }
    // axle, radius rods and cycle wings over the skinny front wheels
    shell.add(tube(V(S.wx, S.wrF, -S.wzF), V(S.wx, S.wrF, S.wzF), 0.035, M.steel));
    for (const z of [1, -1]) { shell.add(tube(V(S.wx, S.wrF, z * 0.6), V(0.5, 0.45, z * 0.4), 0.02, M.chrome)); const fd = mesh(new THREE.CylinderGeometry(S.wrF + 0.07, S.wrF + 0.07, 0.24, 18, 1, true, Math.PI * 0.62, Math.PI * 0.8), pm); fd.rotation.x = Math.PI / 2; fd.position.set(S.wx, S.wrF, z * S.wzF); shell.add(fd); }
  } else {
    const gw = wN * 2 - (S.lamps === 'round4' ? 0.2 : 0.62);
    const gr = mesh(new THREE.PlaneGeometry(gw, 0.2), grilleMat(S.grille)); gr.rotation.y = Math.PI / 2; gr.position.set(L + 0.012, gy, 0); gr.castShadow = false; shell.add(gr);
    const fr = box(0.02, 0.24, gw + 0.05, M.chrome, L + 0.002, gy, 0); shell.add(fr);
    if (S.lamps === 'round2') for (const z of [1, -1]) lamp(L + 0.012, gy, z * (wN - 0.16), 0.1);
    else if (S.lamps === 'round4') for (const z of [1, -1]) for (const k of [0, 1]) lamp(L + 0.022, gy, z * (wN - 0.14 - k * 0.2), 0.075);
    else for (const z of [1, -1]) lamp(L + 0.012, gy, z * (wN - 0.19), 0, true);
    for (const z of [1, -1]) shell.add(box(0.03, 0.06, 0.16, M.amber, L + 0.005, gy - 0.18, z * (wN - 0.2)));
    // engine bay under the bonnet: block, rocker cover, air filter, radiator
    shell.add(box(L - cabF - 0.3, 0.3, Wd * 1.2, M.dark, (L + cabF) / 2, shF - 0.36, 0));
    shell.add(box(0.62, 0.3, 0.44, M.engine, (L + cabF) / 2 - 0.05, shF - 0.18, 0));
    shell.add(box(0.5, 0.06, 0.2, pm, (L + cabF) / 2 - 0.05, shF - 0.0, 0));
    const af = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 14), M.chrome); af.position.set((L + cabF) / 2 + 0.05, shF + 0.0, 0.0); shell.add(af);
    shell.add(box(0.05, 0.34, Wd * 1.1, M.steel, L - 0.14, shF - 0.2, 0));
    if (S.scoop && bonnet) { const sc = box(0.55, 0.11, 0.42, M.dark, (L + cabF) / 2 - 0.1 - bonnet.position.x, 0.1, 0); sc.castShadow = true; bonnet.add(sc); const bl = box(0.3, 0.16, 0.3, M.chrome, (L + cabF) / 2 - 0.1 - bonnet.position.x, 0.14, 0); bonnet.add(bl); }
    if (S.pod) { const pod = new THREE.Group(); pod.add(box(0.1, 0.2, 1.0, M.dark, L + 0.02, shF + 0.1, 0)); for (let k = 0; k < 4; k++) { const z = -0.36 + k * 0.24; const lm = mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.07, 14), headM); lm.rotation.z = Math.PI / 2; lm.position.set(L + 0.08, shF + 0.1, z); pod.add(lm); const rg = mesh(new THREE.TorusGeometry(0.097, 0.014, 6, 16), M.dark); rg.rotation.y = Math.PI / 2; rg.position.set(L + 0.115, shF + 0.1, z); pod.add(rg); } part(pod, 'front', 10, 'pod'); }
  }
  // ---- bumpers (detachable, they hang by one bracket before flying off), number plate
  const bumper = (front) => {
    const g = new THREE.Group(), w = (front ? wN : wT) + 0.05, sg = front ? 1 : -1, y = S.y0 + 0.16;
    const bar = mesh(bumperGeo(w, 0.05), M.chrome); if (!front) bar.rotation.y = Math.PI; g.add(bar);
    if (!S.van && !S.bed) for (const z of [0.3, -0.3]) g.add(box(0.07, 0.2, 0.07, M.chrome, sg * 0.06, 0.02, z * (front ? 1 : 1.2)));
    const pl = mesh(new THREE.PlaneGeometry(0.44, 0.11), plateMat()); pl.rotation.y = sg * Math.PI / 2; pl.position.set(sg * 0.062, front ? 0 : 0.0, 0); pl.castShadow = false; g.add(pl);
    g.position.set(sg * (L + 0.05), y, 0); return part(g, front ? 'front' : 'rear', 26, 'bumper');
  };
  if (!S.hotrod) bumper(true); else part((() => { const g = new THREE.Group(); g.add(tube(V(0, 0, -0.55), V(0, 0, 0.55), 0.035, M.chrome, 8)); g.position.set(L + 0.1, 0.4, 0); return g; })(), 'front', 18, 'bumper');
  bumper(false);
  // ---- tail: lamps, exhaust, mud flaps
  const ty = S.van || S.tailgate && !S.hatch ? shR - 0.1 : shR - 0.14;
  for (const z of [1, -1]) { const tl = box(0.04, S.van ? 0.3 : 0.12, S.van ? 0.12 : 0.3, tailM, -L - 0.004, ty, z * (wT - 0.2)); tl.castShadow = false; shell.add(tl); shell.add(box(0.03, (S.van ? 0.3 : 0.12) + 0.03, (S.van ? 0.12 : 0.3) + 0.03, M.chrome, -L + 0.004, ty, z * (wT - 0.2))); }
  if (S.tailgate && !S.hatch && !S.van) shell.add(box(0.02, 0.05, 0.3, M.chrome, -L - 0.01, shR - 0.02, 0));
  const flapM = S.pod ? (M.flapRed ||= new THREE.MeshStandardMaterial({ color: 0xd01010, roughness: 0.8 })) : M.rubber;
  for (const z of [1, -1]) shell.add(box(0.02, 0.2, 0.24, flapM, -S.wx + 0.05 - S.wr - 0.1, S.y0 + 0.02, z * (S.wzR)));
  const exh = (z, r) => { const ex = mesh(new THREE.CylinderGeometry(r, r, 0.34, 10, 1, true), M.chrome); ex.material.side = THREE.DoubleSide; ex.rotation.z = Math.PI / 2; ex.position.set(-L - 0.06, S.y0 + 0.03, z); shell.add(ex); };
  exh(-0.5, 0.045); if (S.scoop || S.hotrod) exh(0.5, 0.045);
  // ---- floor pan, wheel tubs and the dark inside of the boot
  shell.add(box(L * 2 - 0.5, 0.05, Wd * 2 - 0.5, M.dark, 0, S.y0 + 0.04, 0));
  for (const a of S.arch) { const tub = new THREE.Mesh(new THREE.CylinderGeometry(a.Ra + 0.03, a.Ra + 0.03, Wd * 2 - 0.34, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), (M.tub ||= new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1, side: THREE.DoubleSide }))); tub.position.set(a.x, a.y, 0); tub.receiveShadow = true; shell.add(tub); }
  if (S.boot) shell.add(box(Math.abs(-L + 0.2 - (cabR - 0.1)), 0.3, Wd * 1.5, M.dark, (-L + 0.2 + cabR - 0.1) / 2, shR - 0.3, 0)); 
  if (S.bed) { shell.add(box(cabR - 0.1 + L - 0.1, 0.05, Wd * 2 - 0.2, M.dark, (cabR - L) / 2, beltY - 0.42, 0)); shell.add(box(0.06, 0.6, Wd * 2 - 0.3, pm, cabR - 0.12, beltY - 0.1, 0)); const spare = wheel(0.36, 0.24); spare.rotation.x = Math.PI / 2; spare.position.set(-1.3, beltY - 0.26, 0.2); shell.add(spare); for (let k = 0; k < 2; k++) { const d = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 12), new THREE.MeshStandardMaterial({ color: k ? 0x2a6fb0 : 0xb3261e, roughness: 0.6, metalness: 0.4 })); d.position.set(-0.75 - k * 1.2, beltY - 0.12, -0.45 + k * 0.1); shell.add(d); } }
  // ---- interior: floor, seats, dash, wheel, roll cage, driver with helmet and harness, window net
  const flatA = cabR + S.rs, flatB = cabF - S.ws, cw = Wd - 0.2;
  const dX = Math.min(flatB - 0.35, (S.door[0] + S.door[1]) / 2 + 0.05), dZ = 0.34, seatY = S.y0 + 0.2;
  const iF = cabF - 0.05, iR = S.van ? dX - 0.7 : Math.max(cabR + 0.1, S.bed ? cabR : -L + 0.5);
  shell.add(box(iF - iR, 0.04, cw * 2, M.interior, (iF + iR) / 2, S.y0 + 0.09, 0));
  shell.add(box(0.05, shM - S.y0 - 0.1, cw * 2, M.interior, iR, (shM + S.y0) / 2, 0)); // rear bulkhead
  shell.add(box(0.05, shM - S.y0 - 0.1, cw * 2, M.interior, iF, (shM + S.y0) / 2, 0)); // firewall
  shell.add(box(0.28, 0.16, cw * 2 - 0.04, M.dark, cabF - 0.2, shM - 0.04, 0)); // dashboard
  const seat = (z, m) => { shell.add(box(0.46, 0.1, 0.44, m, dX, seatY + 0.05, z)); const bk = box(0.1, 0.62, 0.44, m, dX - 0.26, seatY + 0.36, z); bk.rotation.z = 0.14; shell.add(bk); shell.add(box(0.09, 0.16, 0.24, m, dX - 0.32, seatY + 0.74, z)); for (const s of [1, -1]) shell.add(box(0.36, 0.14, 0.05, m, dX - 0.02, seatY + 0.13, z + s * 0.22)); };
  seat(dZ, M.seat);
  const drv = new THREE.Group(); drv.name = 'driver'; shell.add(drv);
  const suit = new THREE.MeshStandardMaterial({ color: HELMETS[Math.floor(R() * HELMETS.length)], roughness: 0.7 });
  const torso = mesh(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), suit); torso.scale.set(0.85, 1, 1.15); torso.position.set(dX - 0.14, seatY + 0.42, dZ); torso.rotation.z = 0.12; drv.add(torso);
  for (const s of [1, -1]) { drv.add(tube(V(dX - 0.12, seatY + 0.56, dZ + s * 0.19), V(dX + 0.12, seatY + 0.42, dZ + s * 0.2), 0.05, suit, 8)); drv.add(tube(V(dX + 0.12, seatY + 0.42, dZ + s * 0.2), V(dX + 0.36, seatY + 0.52, dZ + s * 0.13), 0.045, suit, 8)); drv.add(tube(V(dX - 0.08, seatY + 0.12, dZ + s * 0.1), V(dX + 0.3, seatY + 0.14, dZ + s * 0.12), 0.07, suit, 8)); shell.add(box(0.03, 0.34, 0.05, M.belt, dX - 0.06, seatY + 0.5, dZ + s * 0.07)); }
  const helmet = mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshPhysicalMaterial({ color: HELMETS[Math.floor(R() * HELMETS.length)], roughness: 0.22, clearcoat: 1 })); helmet.scale.set(1.08, 1, 0.95); helmet.position.set(dX - 0.1, seatY + 0.79, dZ); drv.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.153, 14, 8, -0.95, 1.9, 1.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.08, metalness: 0.9 })); visor.scale.copy(helmet.scale); visor.position.copy(helmet.position); drv.add(visor);
  shell.add(box(0.1, 0.07, 0.14, M.dark, dX - 0.0, seatY + 0.7, dZ));
  const sw = mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 18), M.dark); sw.rotation.y = Math.PI / 2; sw.position.set(dX + 0.38, seatY + 0.52, dZ); shell.add(sw);
  shell.add(tube(V(dX + 0.38, seatY + 0.52, dZ), V(cabF - 0.2, shM - 0.06, dZ), 0.02, M.steel));
  shell.add(box(0.2, 0.2, 0.2, (M.ext ||= new THREE.MeshStandardMaterial({ color: 0xc81010, roughness: 0.5 })), dX + 0.1, S.y0 + 0.2, -0.2)); // extinguisher box
  const cy0 = S.y0 + 0.1, cy1 = Math.min(roofY - 0.1, B.roofEdgeY((flatA + flatB) / 2) - 0.03), cr = 0.024;
  const cr0 = Math.max(flatA + 0.02, dX - 0.45), cf0 = flatB - 0.04, zt = Math.max(0.2, B.zE((flatA + flatB) / 2) - 0.07);
  for (const z of [1, -1]) {
    shell.add(tube(V(cr0, cy0, z * cw), V(cr0, cy1, z * zt), cr, M.cage));
    shell.add(tube(V(cabF - 0.12, cy0, z * cw), V(cf0, cy1, z * zt), cr, M.cage));
    shell.add(tube(V(cr0, cy1, z * zt), V(cf0, cy1, z * zt), cr, M.cage));
    shell.add(tube(V(cr0, S.y0 + 0.42, z * (cw + 0.02)), V(cabF - 0.14, S.y0 + 0.36, z * (cw + 0.02)), cr, M.cage));
    shell.add(tube(V(cr0, S.y0 + 0.2, z * (cw + 0.02)), V(cabF - 0.14, S.y0 + 0.58, z * (cw + 0.02)), cr, M.cage));
  }
  shell.add(tube(V(cr0, cy1, -zt), V(cr0, cy1, zt), cr, M.cage)); shell.add(tube(V(cf0, cy1, -zt), V(cf0, cy1, zt), cr, M.cage));
  shell.add(tube(V(cr0, cy0, cw), V(cr0, cy1, -zt), cr, M.cage)); shell.add(tube(V(cr0, cy0, -cw), V(cr0, cy1, zt), cr, M.cage));
  shell.add(tube(V(cr0, seatY + 0.55, -cw), V(cr0, seatY + 0.55, cw), cr, M.cage));
  if (!S.bed && !S.van && cr0 - 0.7 > iR) for (const z of [1, -1]) shell.add(tube(V(cr0, cy1, z * zt), V(Math.max(iR + 0.1, cr0 - 1.0), cy0 + 0.1, z * (cw - 0.1)), cr, M.cage));
  const net = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.8, (flatB - flatA) * 0.5), (cy1 - shM) * 0.75), M.net); net.position.set(dX + 0.05, shM + (cy1 - shM) * 0.5, Wd - 0.13 - S.tumble * 0.5); net.rotation.x = -0.25; shell.add(net);
  // ---- roof sign with the race number (both faces)
  const signTex = canvasTex(256, 128, (g, W, H) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H); g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeRect(5, 5, W - 10, H - 10); g.fillStyle = '#111'; g.font = '900 96px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), W / 2, H / 2 + 6); });
  const signX = S.van ? flatB - 0.6 : (flatA + flatB) / 2 - 0.1;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.34), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, side: THREE.DoubleSide })); sign.position.set(signX, B.top(signX) + 0.22, 0); sign.castShadow = true; shell.add(sign);
  for (const z of [0.3, -0.3]) shell.add(box(0.03, 0.08, 0.03, M.steel, signX, B.top(signX) + 0.03, z));
  // ---- trim: side mouldings, drip rails, door handles, mirrors, wipers, filler cap
  for (const z of [1, -1]) {
    if (!S.hotrod && !S.pod) for (const [a, b] of [[-S.wx + 0.05 + S.wr + 0.16, S.door[0] - 0.02], [S.door[1] + 0.02, S.wx - (S.wrF ?? S.wr) - 0.16]]) if (b - a > 0.15) shell.add(box(b - a, 0.03, 0.02, M.chrome, (a + b) / 2, S.y0 + (shM - S.y0) * 0.52, z * (Wd + 0.008)));
    shell.add(box(flatB - flatA + 0.1, 0.02, 0.02, M.chrome, (flatA + flatB) / 2, B.roofEdgeY((flatA + flatB) / 2) - 0.0, z * (B.zE((flatA + flatB) / 2) + 0.012)));
    const mz = z * (B.width(cabF - 0.3) + 0.06); const mg = new THREE.Group(); mg.add(box(0.04, 0.03, 0.12, M.chrome, cabF - 0.32, shM + 0.07, z * (B.width(cabF - 0.3) - 0.0))); mg.add(box(0.03, 0.1, 0.15, M.chrome, cabF - 0.34, shM + 0.1, mz)); part(mg, z > 0 ? 'left' : 'right', 8, 'mirror');
  }
  for (const pt of parts) if (pt.userData.kind === 'door') { const sd = pt.userData.side; const hd = box(0.14, 0.025, 0.03, M.chrome, S.door[0] + 0.14 - pt.position.x, shM - 0.1 - pt.position.y, sd * (Wd + 0.012) - pt.position.z); pt.add(hd); if (!S.hotrod && !S.pod) pt.add(box(S.door[1] - S.door[0] - 0.04, 0.03, 0.02, M.chrome, (S.door[0] + S.door[1]) / 2 - pt.position.x, S.y0 + (shM - S.y0) * 0.52 - pt.position.y, sd * (Wd + 0.008) - pt.position.z)); const inner = box(S.door[1] - S.door[0] - 0.06, shM - S.y0 - 0.14, 0.03, M.interior, (S.door[0] + S.door[1]) / 2 - pt.position.x, (shM + S.y0) / 2 - pt.position.y, sd * (Wd - 0.1) - pt.position.z); inner.castShadow = false; pt.add(inner); }
  if (!S.hotrod) for (const z of [0.28, -0.22]) { const wp = tube(V(cabF - 0.02, B.top(cabF) + 0.01, z), V(cabF - 0.2, B.top(cabF - 0.2) + 0.012, z + 0.3), 0.008, M.dark, 4); wp.castShadow = false; shell.add(wp); }
  if (S.woody) for (const z of [1, -1]) shell.add(box(L * 1.5, 0.22, 0.012, (M.wood ||= new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 })), -0.25, S.y0 + (shM - S.y0) * 0.66, z * (Wd + 0.004)));
  // ---- model specific furniture
  if (S.bullbar) { const bb = new THREE.Group(), x = L + 0.2; for (const z of [0.5, -0.5]) bb.add(tube(V(x, S.y0, z), V(x, shF + 0.06, z * 0.8), 0.04, M.steel, 8)); bb.add(tube(V(x, shF + 0.06, -0.4), V(x, shF + 0.06, 0.4), 0.04, M.steel, 8)); bb.add(tube(V(x, S.y0 + 0.3, -0.7), V(x, S.y0 + 0.3, 0.7), 0.04, M.steel, 8)); for (const z of [0.5, -0.5]) bb.add(tube(V(x, S.y0 + 0.3, z), V(L - 0.1, S.y0 + 0.2, z), 0.03, M.steel)); part(bb, 'front', 60, 'bar'); }
  if (S.van) { const pb = new THREE.Group(), x = L + 0.17; for (const z of [-0.6, 0.6]) pb.add(tube(V(x, S.y0 - 0.05, z), V(x, shF - 0.05, z * 0.9), 0.045, M.dark, 8)); pb.add(tube(V(x, S.y0 + 0.25, -0.75), V(x, S.y0 + 0.25, 0.75), 0.05, M.dark, 8)); part(pb, 'front', 55, 'bar'); const lad = new THREE.Group(); for (const z of [0.28, -0.28]) lad.add(box(2.4, 0.04, 0.04, M.steel, -0.7, roofY + 0.09, z)); for (let k = 0; k < 8; k++) lad.add(box(0.04, 0.03, 0.56, M.steel, -1.8 + k * 0.32, roofY + 0.09, 0)); part(lad, 'rear', 12, 'rack'); for (const z of [1, -1]) shell.add(box(0.02, 0.9, 0.012, M.dark, -0.7, 1.2, z * (Wd + 0.001))); }
  if (S.rack) { for (const z of [0.55, -0.55]) shell.add(box(1.9, 0.03, 0.03, M.chrome, -1.1, roofY + 0.08, z)); for (const x of [-1.9, -1.1, -0.3]) shell.add(box(0.03, 0.03, 1.1, M.chrome, x, roofY + 0.08, 0)); const lug = new THREE.Group(); lug.add(box(0.9, 0.28, 0.7, new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }), -1.4, roofY + 0.24, 0.1)); lug.add(box(0.5, 0.2, 0.4, new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: 0.8 }), -1.4, roofY + 0.48, 0.0)); const sp = wheel(0.32, 0.2); sp.rotation.x = Math.PI / 2; sp.position.set(-0.55, roofY + 0.2, 0); lug.add(sp); part(lug, 'rear', 10, 'rack'); }
  if (S.spoiler) { const sp = new THREE.Group(); sp.add(box(0.3, 0.035, Wd * 2 - 0.2, M.dark, -L + 0.2, shR + 0.2, 0)); for (const z of [0.6, -0.6]) sp.add(box(0.12, 0.16, 0.03, M.dark, -L + 0.22, shR + 0.11, z)); part(sp, 'rear', 14, 'wing'); }
  if (S.spoiler2) part(box(0.26, 0.03, Wd * 2 - 0.4, M.dark, cabR + S.rs - 0.05, roofY + 0.0, 0), 'rear', 14, 'wing');
  if (S.wing) { const wg = new THREE.Group(), x = cabR + 0.12, y = B.top(x); wg.add(box(0.34, 0.035, Wd * 2 - 0.06, M.dark, x - 0.1, y + 0.3, 0)); for (const z of [1, -1]) { wg.add(box(0.36, 0.14, 0.02, M.dark, x - 0.1, y + 0.3, z * (Wd - 0.03))); wg.add(tube(V(x, y, z * 0.45), V(x - 0.08, y + 0.3, z * 0.45), 0.02, M.dark)); } part(wg, 'rear', 14, 'wing'); }
  if (S.scoopRoof) shell.add(box(0.36, 0.09, 0.3, M.dark, flatB - 0.2, roofY + 0.03, 0));
  // ---- wheels (on the root, not the shell)
  const wrF = S.wrF ?? S.wr, wwF = S.wwF ?? S.ww, wx = S.wx;
  const rimI = look.clean ? S.rim : (R() < 0.6 ? S.rim : Math.floor(R() * 4));
  const wheels = [], wheelPos = [], wrs = [];
  for (const [x, z, r, w] of [[wx, S.wzF, wrF, wwF], [wx, -S.wzF, wrF, wwF], [-wx + 0.05, S.wzR, S.wr, S.ww], [-wx + 0.05, -S.wzR, S.wr, S.ww]]) { const wl = wheel(r, w, S.rimStyle || 0, !look.clean && R() < 0.2 ? Math.floor(R() * 4) : rimI); wl.position.set(x, r, z); car.add(wl); wheels.push(wl); wheelPos.push([x, z]); wrs.push(r); }
  // one mesh per material for everything that never moves on its own (cage, trims, interior, lights...);
  // each detachable part is merged the same way so a bumper or a rack costs one or two draw calls
  mergeStatic(shell, new Set([body, cab, drv, ...parts])); mergeStatic(drv);
  for (const pt of parts) if (pt.isGroup && pt.children.length > 1) mergeStatic(pt, new Set(pt.userData.panel ? [pt.userData.panel] : []));
  car.userData = { wheels, wheelPos, wr: S.wr, wrs, ww: S.ww, shell, body, cab, parts, deform, dims: { L, W: Wd, H: roofY, beltY }, paint, dirt, glass: { tex: winTex, WIN, cracked: {} }, driver: drv, suitColor: suit.color.getHex(), helmetMat: helmet.material, rust, sign, lights: { head: headM, tail: tailM }, shape: S };
  return car;
}
// Dent the body around a local-space point. dir: local direction of the push. amount in metres.
// Tight falloff for a localised crater, a crease noise so panels look crumpled, and the paint
// is scraped off where the metal moved (aScr -> primer, then bare metal in the shader).
export function dent(car, local, dir, amount) {
  const ud = car.userData, R = 0.38 + amount * 1.5, R2 = R * R; local = { x: local.x, y: local.y - ud.shell.position.y, z: local.z };
  for (const m of ud.deform) {
    if (!m.parent) continue;
    const g = m.geometry, P = g.attributes.position, A = P.array, O = g.userData.orig, SC = g.attributes.aScr;
    let touched = false;
    for (let i = 0; i < P.count; i++) {
      const ix = i * 3, dx = A[ix] - local.x, dy = A[ix + 1] - local.y, dz = A[ix + 2] - local.z;
      const d2 = dx * dx + dy * dy + dz * dz; if (d2 > R2) continue;
      const d = Math.sqrt(d2), fo = 1 - d / R;
      const crease = 0.75 + 0.5 * Math.sin(A[ix] * 23.1 + A[ix + 1] * 17.3 + A[ix + 2] * 11.7);
      const f = fo * fo * (3 - 2 * fo) * amount * crease;
      let nx = A[ix] + dir.x * f, ny = A[ix + 1] + dir.y * f * 0.6 - f * 0.1, nz = A[ix + 2] + dir.z * f;
      if (O) { const ox = O[ix], oy = O[ix + 1], oz = O[ix + 2]; const dd = Math.hypot(nx - ox, ny - oy, nz - oz); if (dd > 0.6) { const k = 0.6 / dd; nx = ox + (nx - ox) * k; ny = oy + (ny - oy) * k; nz = oz + (nz - oz) * k; } }
      A[ix] = nx; A[ix + 1] = ny; A[ix + 2] = nz;
      if (SC) SC.array[i] = Math.min(1, SC.array[i] + fo * (0.25 + amount * 3.2));
      touched = true;
    }
    if (touched) { P.needsUpdate = true; if (SC) SC.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
  }
}
// scrape the paint without denting (sliding along walls, roof slides)
export function scrape(car, local, amount = 0.2, radius = 0.5) {
  local = { x: local.x, y: local.y - car.userData.shell.position.y, z: local.z };
  for (const m of car.userData.deform) {
    const g = m.geometry, SC = g.attributes.aScr; if (!SC || !m.parent) continue; const A = g.attributes.position.array; let t = false;
    for (let i = 0; i < SC.count; i++) { const dx = A[i * 3] - local.x, dy = A[i * 3 + 1] - local.y, dz = A[i * 3 + 2] - local.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < radius * radius) { SC.array[i] = Math.min(1, SC.array[i] + amount * (1 - Math.sqrt(d2) / radius)); t = true; } }
    if (t) SC.needsUpdate = true;
  }
}

// Loose panels: a damaged bonnet flutters in the airflow and slams under braking, doors swing
// with the lateral load, the boot lid bounces, bumpers hang by one bracket. st = { speed, accF, accL, t }
export function updateParts(car, dt, st) {
  for (const p of car.userData.parts) {
    const u = p.userData; if (!u.loose) continue;
    const sp = st.speed, fl = Math.sin(st.t * 19 + u.ph) * 0.5 + Math.sin(st.t * 31 + u.ph * 2) * 0.5;
    let tg = 0;
    if (u.kind === 'bonnet') { tg = Math.min(1.25, 0.14 + sp * 0.035) + fl * Math.min(0.12, sp * 0.006) - Math.max(0, -st.accF - 4) * 0.08; u.ang = (u.ang || 0) + (Math.max(0.05, tg) - (u.ang || 0)) * Math.min(1, dt * 7); p.rotation.z = u.ang; }
    else if (u.kind === 'boot') { tg = 0.25 + Math.abs(fl) * Math.min(0.5, 0.1 + sp * 0.02) + Math.max(0, st.accF) * 0.03; u.ang = (u.ang || 0) + (tg - (u.ang || 0)) * Math.min(1, dt * 8); p.rotation.z = -u.ang; }
    else if (u.kind === 'door') { tg = Math.max(0.1, 0.75 - sp * 0.022) + Math.max(-0.3, Math.min(0.7, st.accL * u.side * 0.07)) + fl * 0.06; u.ang = (u.ang || 0) + (Math.max(0.06, tg) - (u.ang || 0)) * Math.min(1, dt * 5); p.rotation.y = u.side * u.ang; }
    else if (u.kind === 'bumper') { if (!u.hung) { u.hung = true; u.hs = Math.random() < 0.5 ? 1 : -1; } p.rotation.x = u.hs * (0.16 + fl * 0.03); p.rotation.y = u.hs * 0.07; }
    else if (u.kind === 'wing' || u.kind === 'rack' || u.kind === 'mirror' || u.kind === 'pod') { p.rotation.z = 0.06 + fl * 0.04; p.rotation.x = fl * 0.03; }
  }
}

// Crack a windscreen ('front' | 'rear') on the glass texture. Returns true when it shattered now.
export function crackGlass(car, zone, severity = 1) {
  const gl = car.userData.glass; if (!gl || !gl.WIN[zone]) return false;
  const st = (gl.cracked[zone] || 0) + severity; gl.cracked[zone] = st;
  const g = gl.tex.userData.ctx, W = g.canvas.width, H = g.canvas.height;
  const [u0, u1, v0, v1] = gl.WIN[zone];
  g.save(); g.beginPath(); g.rect(u0 * W, H - v1 * H, (u1 - u0) * W, (v1 - v0) * H); g.clip();
  if (st >= 2.2) {
    if (gl.gone?.[zone]) { g.restore(); return false; }
    // shattered: the screen is gone, jagged shards stay in the rubber
    g.clearRect(u0 * W, H - v1 * H, (u1 - u0) * W, (v1 - v0) * H);
    g.fillStyle = 'rgba(200,220,235,0.5)'; const x0 = u0 * W, w = (u1 - u0) * W;
    for (let k = 0; k < 26; k++) { const e = Math.floor(Math.random() * 4), t = Math.random(), l = 8 + Math.random() * 26, s = 6 + Math.random() * 12; g.beginPath(); if (e === 0) { g.moveTo(x0 + t * w - s, 0); g.lineTo(x0 + t * w + s, 0); g.lineTo(x0 + t * w, l); } else if (e === 1) { g.moveTo(x0 + t * w - s, H); g.lineTo(x0 + t * w + s, H); g.lineTo(x0 + t * w, H - l); } else if (e === 2) { g.moveTo(x0, t * H - s); g.lineTo(x0, t * H + s); g.lineTo(x0 + l, t * H); } else { g.moveTo(x0 + w, t * H - s); g.lineTo(x0 + w, t * H + s); g.lineTo(x0 + w - l, t * H); } g.fill(); }
    g.restore(); gl.tex.needsUpdate = true; (gl.gone ||= {})[zone] = true; return true;
  }
  const cx = (u0 + (u1 - u0) * (0.25 + Math.random() * 0.5)) * W, cy = H - (v0 + (v1 - v0) * (0.25 + Math.random() * 0.5)) * H;
  g.fillStyle = 'rgba(225,235,245,0.22)'; g.beginPath(); g.arc(cx, cy, 20 + severity * 10, 0, 7); g.fill();
  g.strokeStyle = 'rgba(232,240,248,0.85)'; g.lineWidth = 1.5;
  for (let k = 0; k < 11; k++) { const a = Math.random() * 6.28; let x = cx, y = cy; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += Math.cos(a + (Math.random() - 0.5) * 0.7) * 16; y += Math.sin(a + (Math.random() - 0.5) * 0.7) * 16; g.lineTo(x, y); } g.stroke(); }
  for (const r of [7, 15, 26, 40]) { g.beginPath(); for (let k = 0; k <= 12; k++) { const a = (k / 12) * 6.2832, rr = r * (0.85 + Math.random() * 0.3); k ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.stroke(); }
  g.restore(); gl.tex.needsUpdate = true; return false;
}
