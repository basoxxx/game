// Procedural liveries painted on canvas: paint schemes, sponsors, numbers, panel gaps,
// vents and lamps drawn straight on the body texture, plus the small printed parts
// (wing end plates, fins, helmets, glasshouses).
import * as THREE from 'three';
import { cached, canvas, canvasTex, luma, hashStr, rng, FONT, MAT, paintProps, coat, finishOf } from './core.js';

export const SPONSORS = ['PETRONIX', 'ROLEXA', 'DHX', 'ORACLO', 'BREMBI', 'LAVAZZO', 'PUMO', 'LENOVA', 'MONSTRO', 'SANTANDOR', 'CRYPTO.CAM', 'ARAMCORE', 'TAG HEUERR', 'VELOXA', 'KAPPA-ONE', 'NORDLINK'];
const inkOn = (hex) => (luma(hex) > 0.6 ? '#0b0b0d' : '#ffffff');
function fitText(g, txt, maxW, size0, style = 'italic 900') {
  let size = size0; g.font = `${style} ${size}px ${FONT}`;
  while (g.measureText(txt).width > maxW && size > 8) { size -= 2; g.font = `${style} ${size}px ${FONT}`; }
  return size;
}
function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }

// Texture layout (see hull() in core.js): v 0 .. .20 right side (belt -> shoulder), .20 .. .70
// top, .70 .. .90 left side (shoulder -> belt), .90 .. 1 underside. Everything below is drawn
// in "region space": x = u * W (rear -> front); side regions: y = 0 at the belt, -SH at the
// shoulder (both sides are true mirror images); top region: y = -TH/2 .. TH/2 across the car.
// Logical canvas 2048 x 1024 (hero cars); the field gets a half-size texture.
const W = 2048, H = 1024, SH = H * 0.2, TH = H * 0.5;

// ---- paint schemes ----
// region: 'side' | 'top'
function scheme(g, p, L, region, seed) {
  const side = region === 'side', S = side ? SH : TH, sec = L.secondary, acc = L.accent;
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * S) : g.moveTo(x * W, y * S))); g.closePath(); g.fill(); };
  const rect = (x0, x1, y0, y1, col) => { g.fillStyle = col; g.fillRect(x0 * W, Math.min(y0, y1) * S, (x1 - x0) * W, Math.abs(y1 - y0) * S); };
  const Y0 = side ? 0 : 0.5, Y1 = side ? -1 : -0.5; // bottom / top of the region
  switch (p) {
    case 0: // twin pinstripes along the shoulder and over the top
      if (side) { rect(0, 1, -0.9, -0.8, sec); rect(0, 1, -0.76, -0.735, acc); } else { rect(0, 1, -0.05, 0.05, sec); rect(0, 1, -0.085, -0.068, acc); rect(0, 1, 0.068, 0.085, acc); }
      break;
    case 1: // racing stripe over the car, flash along the flanks
      if (side) { rect(0, 1, -0.36, -0.16, sec); rect(0, 1, -0.4, -0.375, acc); rect(0, 1, -0.145, -0.12, acc); } else { rect(0, 1, -0.14, 0.14, sec); rect(0, 1, -0.185, -0.16, acc); rect(0, 1, 0.16, 0.185, acc); }
      break;
    case 2: // two-tone: front half in the second colour, slanted split
      if (side) { poly([[0.5, 0], [0.56, -1], [1, -1], [1, 0]], sec); poly([[0.492, 0], [0.552, -1], [0.56, -1], [0.5, 0]], acc); } else { poly([[0.56, -0.5], [0.62, 0], [0.56, 0.5], [1, 0.5], [1, -0.5]], sec); poly([[0.552, -0.5], [0.612, 0], [0.552, 0.5], [0.56, 0.5], [0.62, 0], [0.56, -0.5]], acc); }
      break;
    case 3: // three chevrons raked over the flanks
      for (let i = 0; i < 3; i++) { const x = 0.32 + i * 0.05, c = i === 1 ? acc : sec; if (side) poly([[x, 0], [x + 0.05, -1], [x + 0.08, -1], [x + 0.03, 0]], c); else poly([[x + 0.05, -0.5], [x + 0.09, 0], [x + 0.05, 0.5], [x + 0.08, 0.5], [x + 0.12, 0], [x + 0.08, -0.5]], c); }
      break;
    case 4: { // fade from the second to the first colour with halftone dots
      const gr = g.createLinearGradient(W * 0.2, 0, W * 0.85, 0); gr.addColorStop(0, sec); gr.addColorStop(1, L.primary); g.fillStyle = gr; g.fillRect(0, Y1 * S, W, (Y0 - Y1) * S);
      const rnd = rng(seed + (side ? 1 : 2)); g.fillStyle = sec;
      for (let i = 0; i < (side ? 260 : 600); i++) { const x = 0.45 + rnd() * 0.5, r = (1 - (x - 0.45) / 0.5) * 9 + 1; g.beginPath(); g.arc(x * W, (Y1 + rnd() * (Y0 - Y1)) * S, r, 0, 7); g.fill(); }
      if (side) rect(0, 1, -0.1, -0.06, acc);
      break;
    }
    case 5: // flash growing along the sills and sweeping up over the tail
      if (side) {
        g.fillStyle = sec; g.beginPath(); g.moveTo(0.97 * W, -0.06 * S); g.bezierCurveTo(0.6 * W, -0.18 * S, 0.3 * W, -0.3 * S, 0.12 * W, -1 * S); g.lineTo(0, -1 * S); g.lineTo(0, 0); g.lineTo(0.97 * W, 0); g.closePath(); g.fill();
        g.strokeStyle = acc; g.lineWidth = 8; g.beginPath(); g.moveTo(0.97 * W, -0.11 * S); g.bezierCurveTo(0.6 * W, -0.24 * S, 0.31 * W, -0.36 * S, 0.135 * W, -1 * S); g.stroke();
      } else { rect(0, 0.12, -0.5, 0.5, sec); rect(0.12, 0.127, -0.5, 0.5, acc); }
      break;
    case 6: // split: second colour above a wavy shoulder line
      if (side) {
        g.fillStyle = sec; g.beginPath(); g.moveTo(0, -1 * S); g.lineTo(W, -1 * S); g.lineTo(W, -0.62 * S);
        for (let k = 40; k >= 0; k--) g.lineTo((k / 40) * W, (-0.52 - 0.1 * Math.sin(k * 0.4)) * S);
        g.closePath(); g.fill();
        g.strokeStyle = acc; g.lineWidth = 7; g.beginPath(); for (let k = 0; k <= 40; k++) { const x = (k / 40) * W, y = (-0.46 - 0.1 * Math.sin(k * 0.4)) * S; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      } else rect(0, 1, -0.5, 0.5, sec);
      break;
    case 7: { // digital blocks breaking up towards the tail
      const rnd = rng(seed + (side ? 3 : 4));
      for (let i = 0; i < (side ? 90 : 160); i++) { const x = rnd() ** 1.8 * 0.55, w = 0.008 + rnd() * 0.03, y = Y1 + rnd() * (Y0 - Y1), h = (0.06 + rnd() * 0.16) * (side ? 1 : 0.4); rect(x, x + w, y, Math.max(Y1, y - h), rnd() < 0.2 ? acc : sec); }
      rect(0, 0.03, Y0, Y1, sec);
      break;
    }
    case 8: // sweeping arc from the nose down low to the top of the tail
      if (side) {
        g.strokeStyle = sec; g.lineWidth = 0.4 * S; g.beginPath(); g.moveTo(1.0 * W, 0.05 * S); g.quadraticCurveTo(0.45 * W, -0.1 * S, 0.08 * W, -1.1 * S); g.stroke();
        g.strokeStyle = acc; g.lineWidth = 8; g.beginPath(); g.moveTo(1.0 * W, -0.2 * S); g.quadraticCurveTo(0.5 * W, -0.36 * S, 0.15 * W, -1.1 * S); g.stroke();
      } else { poly([[0, -0.5], [0.14, -0.5], [0.1, 0], [0.14, 0.5], [0, 0.5]], sec); poly([[0.14, -0.5], [0.1, 0], [0.14, 0.5], [0.148, 0.5], [0.108, 0], [0.148, -0.5]], acc); }
      break;
    default: // 9: three bands wrapped over the haunches
      for (let i = 0; i < 3; i++) { const x = 0.2 + i * 0.035, c = i === 1 ? acc : sec; if (side) poly([[x, 0], [x + 0.03, -1], [x + 0.06, -1], [x + 0.03, 0]], c); else rect(x + 0.03, x + 0.06, -0.5, 0.5, c); }
  }
}

// per body type: where the art goes. u along the car; t = height on the side (0 belt .. 1
// shoulder); size in px of the 205 px tall side band; asp = horizontal squeeze that undoes
// the texture stretch of that panel; top art: rot (rad), asp
const SPEC = {
  formula: { num: { u: 0.93, t: 0.5, size: 120, asp: 0.5 }, title: { u: 0.475, t: 0.5, maxW: 330, size: 120, asp: 0.55 }, s2: { u: 0.19, t: 0.42, maxW: 250, size: 84 }, s3: { u: 0.72, t: 0.72, maxW: 110, size: 44, asp: 0.5 }, tech: { u: 0.79, du: 0.034, t: 0.5, size: 32, asp: 0.5 }, topNum: { u: 0.945, size: 84, rot: -Math.PI / 2, asp: 3.4 }, topTitle: { u: 0.835, size: 120, maxW: 210, asp: 0.26, rot: 0 }, low: 'paint' },
  endurance: { num: { u: 0.575, t: 0.5, size: 128, asp: 0.8, mode: 'box', cls: '#d3101e' }, title: { u: 0.37, t: 0.5, maxW: 330, size: 96, asp: 0.8 }, s2: { u: 0.115, t: 0.6, maxW: 200, size: 64 }, s3: { u: 0.885, t: 0.5, maxW: 130, size: 46 }, tech: { u: 0.455, du: 0.028, t: 0.2, size: 26 }, topNum: { u: 0.83, size: 130, rot: -Math.PI / 2, asp: 1, mode: 'box', cls: '#d3101e' }, topTitle: { u: 0.2, size: 84, maxW: 320, rot: -Math.PI / 2 }, low: 'dark' },
  gt: { num: { u: 0.49, t: 0.56, size: 132, asp: 0.9, mode: 'box', cls: '#14a04a' }, title: { u: 0.49, t: 0.15, maxW: 380, size: 50 }, s2: { u: 0.33, t: 0.6, maxW: 150, size: 60 }, s3: { u: 0.645, t: 0.62, maxW: 150, size: 50, boxed: true }, tech: { u: 0.61, du: 0.03, t: 0.3, size: 26 }, topNum: { u: 0.8, size: 150, rot: -Math.PI / 2, asp: 1, mode: 'box', cls: '#14a04a' }, topTitle: { u: 0.705, size: 70, maxW: 300, rot: -Math.PI / 2 }, low: 'dark' },
  rally: { num: { u: 0.5, t: 0.52, size: 112, asp: 1.1, mode: 'plate' }, title: { u: 0.5, t: 0.14, maxW: 400, size: 46 }, s2: { u: 0.29, t: 0.55, maxW: 190, size: 64 }, s3: { u: 0.655, t: 0.66, maxW: 130, size: 44, boxed: true }, tech: { u: 0.6, du: 0.03, t: 0.32, size: 24 }, topNum: null, topTitle: { u: 0.84, size: 100, maxW: 330, rot: -Math.PI / 2 }, low: 'dark' },
};

export function liveryTexture(L, { number, sponsor, pattern = L.pattern ?? 1, kind = 'formula', dirt = 0, hq = false, details = null }) {
  const key = ['liv', kind, L.primary, L.secondary, L.accent, pattern, number, sponsor, dirt, hq, L.finish].join('|');
  return cached(key, () => {
    const SC = hq ? 1 : 0.5, [c, g] = canvas(W * SC, H * SC); g.scale(SC, SC);
    const sp = SPEC[kind] || SPEC.formula, p = ((pattern | 0) % 10 + 10) % 10, seed = hashStr(L.primary + L.secondary + (sponsor || ''));
    const title = String(sponsor || 'APEX').toUpperCase();
    const pick = (k) => { const s = SPONSORS[(seed + k * 7) % SPONSORS.length]; return s === title ? SPONSORS[(seed + k * 7 + 3) % SPONSORS.length] : s; };
    g.fillStyle = L.primary; g.fillRect(0, 0, W, H);
    // region transforms
    const region = (name, fn) => { g.save(); if (name === 'R') g.translate(0, H); else if (name === 'L') { g.translate(0, H * 0.1); g.scale(1, -1); } else g.translate(0, H * 0.55); g.beginPath(); g.rect(0, name === 'T' ? -TH / 2 : -SH, W, name === 'T' ? TH : SH); g.clip(); fn(name === 'T' ? 'top' : 'side'); g.restore(); };
    // upright art at (u, t) on a side ('R' / 'L') or on top (t = -0.5 .. 0.5 across)
    const stamp = (name, u, t, fn, rot = 0, asp = 1) => { g.save(); if (name === 'R') g.translate(u * W, H - t * SH); else if (name === 'L') { g.translate(u * W, H * 0.1 + t * SH); g.rotate(Math.PI); } else g.translate(u * W, H * 0.55 + t * TH); if (rot) g.rotate(rot); if (asp !== 1) g.scale(asp, 1); fn(); g.restore(); };
    for (const r of ['R', 'L', 'T']) region(r, (kindR) => scheme(g, p, L, kindR, seed));
    // underside: sills in body colour (open-wheelers) or carbon, dark floor
    if (sp.low === 'paint') {
      if (p === 2) { g.fillStyle = L.secondary; g.fillRect(W * 0.5, 0, W * 0.5, H * 0.1); } else if (p === 4) { const gr = g.createLinearGradient(W * 0.2, 0, W * 0.85, 0); gr.addColorStop(0, L.secondary); gr.addColorStop(1, L.primary); g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.1); }
      const sh = g.createLinearGradient(0, 0, 0, H * 0.1); sh.addColorStop(0, 'rgba(8,8,10,0)'); sh.addColorStop(0.24, 'rgba(8,8,10,0.92)'); sh.addColorStop(0.76, 'rgba(8,8,10,0.92)'); sh.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, H * 0.1);
    } else { g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, W, H * 0.1); g.fillStyle = L.accent; g.fillRect(0, 0, W, 3); g.fillRect(0, H * 0.1 - 3, W, 3); }
    const img = g.getImageData(0, 0, c.width, c.height).data;
    const ink = (u, t, name) => { // text colour that contrasts with what is painted under it
      const x = Math.max(0, Math.min(c.width - 1, Math.round(u * W * SC))), y = Math.max(0, Math.min(c.height - 1, Math.round((name === 'R' ? H - t * SH : name === 'L' ? H * 0.1 + t * SH : H * 0.55 + t * TH) * SC))), i = (y * c.width + x) * 4;
      return (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]) / 255 > 0.6 ? '#0b0b0d' : '#ffffff';
    };
    const text = (name, txt, o, { boxed = null, t = o.t } = {}) => stamp(name, o.u, t, () => {
      const size = fitText(g, txt, (o.maxW || 200) / (o.asp || 1), o.size), tw = g.measureText(txt).width;
      if (boxed) { g.fillStyle = boxed; rr(g, -tw / 2 - size * 0.3, -size * 0.62, tw + size * 0.6, size * 1.24, size * 0.16); g.fill(); }
      g.fillStyle = boxed ? inkOn(boxed) : ink(o.u, t, name); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, size * 0.04);
    }, o.rot || 0, o.asp || 1);
    const numArt = (name, o, t = o.t) => stamp(name, o.u, t, () => {
      const txt = String(number), size = o.size, mode = o.mode;
      g.font = `italic 900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = Math.max(size * 0.9, g.measureText(txt).width + size * 0.35);
      if (mode === 'box' && o.cls) { // endurance number panel in the class colour, white edge and digits
        g.fillStyle = '#f4f4f4'; rr(g, -tw / 2 - size * 0.06, -size * 0.62, tw + size * 0.12, size * 1.24, size * 0.16); g.fill();
        g.fillStyle = o.cls; rr(g, -tw / 2, -size * 0.56, tw, size * 1.12, size * 0.12); g.fill();
        g.fillStyle = '#ffffff'; g.fillText(txt, 0, size * 0.02);
      } else if (mode === 'box') { g.fillStyle = '#f4f4f4'; rr(g, -tw / 2, -size * 0.56, tw, size * 1.12, size * 0.12); g.fill(); g.fillStyle = L.accent; g.fillRect(-tw / 2 + size * 0.06, size * 0.4, tw - size * 0.12, size * 0.1); g.fillStyle = '#0b0b0d'; g.fillText(txt, 0, -size * 0.04); }
      else if (mode === 'plate') { // rally door plate: number box + event plate
        g.fillStyle = '#f4f4f4'; rr(g, -tw / 2, -size * 0.56, tw, size * 1.12, size * 0.1); g.fill(); g.fillStyle = '#0b0b0d'; g.fillText(txt, 0, size * 0.02);
        g.fillStyle = '#0b0b0d'; rr(g, -tw / 2, -size * 1.0, tw, size * 0.38, 6); g.fill(); g.fillStyle = '#ffd400'; g.font = `900 ${size * 0.2}px ${FONT}`; g.fillText('RALLY APEX', 0, -size * 0.8);
      } else { const colN = ink(o.u, t, name); g.lineWidth = size * 0.1; g.strokeStyle = luma(L.accent) > 0.6 ? '#0b0b0d' : L.accent; g.lineJoin = 'round'; if (colN === '#ffffff') g.strokeText(txt, 0, 0); g.fillStyle = colN; g.fillText(txt, 0, 0); }
    }, o.rot || 0, o.asp || 1);
    for (const s of ['R', 'L']) {
      if (number != null && sp.num) numArt(s, sp.num);
      text(s, title, sp.title);
      text(s, pick(1), sp.s2);
      text(s, pick(2), sp.s3, { boxed: sp.s3.boxed ? L.secondary : null });
      for (let k = 0; k < 3; k++) text(s, pick(5 + k), { ...sp.tech, u: sp.tech.u + k * sp.tech.du, maxW: sp.tech.du * W * 0.8 }, { boxed: k % 2 ? '#f4f4f4' : '#101012' });
    }
    if (number != null && sp.topNum) numArt('T', sp.topNum, 0);
    text('T', kind === 'rally' ? title : pick(1), sp.topTitle, { t: 0 });
    // body details (panel gaps, vents, lamps...) supplied by the car builder
    if (details) {
      let S = SH;
      const seam = (pts, a = 0.5, w = 2.4) => { g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * S) : g.moveTo(x * W, y * S))); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1.2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W + 2, y * S + 2) : g.moveTo(x * W + 2, y * S + 2))); g.stroke(); };
      const fill = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * S) : g.moveTo(x * W, y * S))); g.closePath(); g.fill(); };
      const vents = (x0, x1, y0, y1, n, slant = 0) => { for (let k = 0; k < n; k++) { const x = x0 + ((x1 - x0) * (k + 0.5)) / n, w = ((x1 - x0) / n) * 0.45; fill([[x - w / 2 + slant, y0], [x + w / 2 + slant, y0], [x + w / 2, y1], [x - w / 2, y1]], 'rgba(5,5,7,0.94)'); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect((x + w / 2) * W, Math.min(y0, y1) * S, 1.5, Math.abs(y1 - y0) * S); } };
      const api = { g, W, seam, fill, vents, L, ink: inkOn(L.primary), get S() { return S; } };
      for (const r of ['R', 'L']) region(r, () => { S = SH; details.side?.(api); });
      region('T', () => { S = TH; details.top?.(api); });
    }
    if (dirt > 0) {
      // mud and dust caked on the lower flanks and the tail, speckled spray above
      const rnd = rng(5); const mc = (a) => `rgba(${118 + rnd() * 30},${90 + rnd() * 20},${58 + rnd() * 16},${a})`;
      for (const r of ['R', 'L']) region(r, () => {
        const gr = g.createLinearGradient(0, 0, 0, -SH * 0.7); gr.addColorStop(0, `rgba(116,90,60,${0.85 * dirt})`); gr.addColorStop(1, 'rgba(116,90,60,0)'); g.fillStyle = gr; g.fillRect(0, -SH, W, SH);
        for (let i = 0; i < 1500 * dirt; i++) { g.fillStyle = mc(0.2 + rnd() * 0.5); g.fillRect(rnd() * W, -(rnd() ** 2) * SH * 0.8, 2 + rnd() * 12, 2 + rnd() * 5); }
      });
      const rear = g.createLinearGradient(0, 0, W * 0.16, 0); rear.addColorStop(0, `rgba(120,92,60,${0.65 * dirt})`); rear.addColorStop(1, 'rgba(120,92,60,0)'); g.fillStyle = rear; g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(150,128,100,${0.12 * dirt})`; g.fillRect(0, 0, W, H);
    }
    const t = canvasTex(c, { aniso: hq ? 16 : 8 });
    const fin = finishOf(L), pp = paintProps(fin);
    const lm = coat({ map: t, ...pp, roughness: pp.roughness + (dirt > 0 ? 0.04 + dirt * 0.35 : 0), clearcoat: pp.clearcoat * (1 - dirt * 0.6), clearcoatRoughness: pp.clearcoatRoughness + dirt * 0.4 });
    lm.userData.livery = true; lm.userData.finish = fin; return lm;
  });
}

// Printed end panel (tail / nose of the closed cars, see endPanel() in core.js). Panel space:
// u 0..1 left -> right as seen from that end, v 0..1 bottom -> top. spec:
//   band: [v0, v1] secondary-colour band (+ accent pin line), grille / dark: [[u0, v0, u1, v1, r]]
//   honeycomb openings, lamps: [[u0, v0, u1, v1]] smoked lamp housings, text: [u, v, size],
//   plate: [u, v, w] number plate, hooks: [[u, v]] tow-hook loops, seams: [[u0, v0, u1, v1]]
export function panelMat(L, spec, sponsor = '', number = null) {
  const fin = finishOf(L);
  const m = MAT.decal(['pan', L.primary, L.secondary, L.accent, JSON.stringify(spec), sponsor, number].join('|'), (g, w, h) => {
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    const R = (q, col, r = 0) => { g.fillStyle = col; rr(g, X(q[0]), Y(q[3]), X(q[2]) - X(q[0]), Y(q[1]) - Y(q[3]), r ?? 0); g.fill(); };
    g.fillStyle = L.primary; g.fillRect(0, 0, w, h);
    if (spec.band) { R([0, spec.band[0], 1, spec.band[1]], L.secondary); g.fillStyle = L.accent; g.fillRect(0, Y(spec.band[1]) - 4, w, 4); }
    // honeycomb mesh behind the openings
    const honey = (q, r) => {
      g.save(); rr(g, X(q[0]), Y(q[3]), X(q[2]) - X(q[0]), Y(q[1]) - Y(q[3]), r); g.clip();
      g.fillStyle = '#060607'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,72,78,0.85)'; g.lineWidth = 2; const s = 9;
      for (let y = Y(q[3]) - s; y < Y(q[1]) + s; y += s * 1.5) for (let x = X(q[0]) - s, k = 0; x < X(q[2]) + s; x += s * 1.732, k++) { const cx = x + ((Math.round(y / (s * 1.5)) % 2) ? s * 0.866 : 0); g.beginPath(); for (let a = 0; a < 6; a++) { const an = Math.PI / 6 + a * Math.PI / 3; g.lineTo(cx + Math.cos(an) * s * 0.62, y + Math.sin(an) * s * 0.62); } g.closePath(); g.stroke(); }
      const sh = g.createLinearGradient(0, Y(q[3]), 0, Y(q[1])); sh.addColorStop(0, 'rgba(0,0,0,0.65)'); sh.addColorStop(0.5, 'rgba(0,0,0,0.1)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 5; rr(g, X(q[0]), Y(q[3]), X(q[2]) - X(q[0]), Y(q[1]) - Y(q[3]), r); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.5; rr(g, X(q[0]) - 3, Y(q[3]) - 3, X(q[2]) - X(q[0]) + 6, Y(q[1]) - Y(q[3]) + 6, r + 3); g.stroke();
    };
    for (const q of spec.dark || []) R(q, '#0a0a0c', q[4] || 6);
    for (const q of spec.grille || []) honey(q, q[4] ?? 10);
    for (const q of spec.lamps || []) { R(q, '#1a0406', q[4] ?? 4); const gr = g.createLinearGradient(0, Y(q[3]), 0, Y(q[1])); gr.addColorStop(0, 'rgba(255,90,90,0.35)'); gr.addColorStop(0.5, 'rgba(120,0,0,0.1)'); gr.addColorStop(1, 'rgba(255,60,60,0.25)'); g.fillStyle = gr; g.fill(); g.strokeStyle = '#050505'; g.lineWidth = 3; g.stroke(); }
    for (const s of spec.seams || []) { g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(s[0]), Y(s[1])); g.lineTo(X(s[2]), Y(s[3])); g.stroke(); }
    if (spec.text && sponsor) { const [u, v, size] = spec.text, txt = String(sponsor).toUpperCase(); fitText(g, txt, w * 0.36, size); g.fillStyle = inkOn(spec.band && v >= spec.band[0] && v <= spec.band[1] ? L.secondary : L.primary); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, X(u), Y(v)); }
    if (spec.plate) { const [u, v, pw] = spec.plate, x0 = X(u - pw / 2), ww = pw * w, hh = ww * 0.24; g.fillStyle = '#f2f2f2'; rr(g, x0, Y(v) - hh / 2, ww, hh, 6); g.fill(); g.fillStyle = '#123a9a'; g.fillRect(x0, Y(v) - hh / 2, ww * 0.1, hh); g.fillStyle = '#0b0b0d'; g.font = `900 ${hh * 0.62}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(number != null ? `AP ${String(number).padStart(3, '0')} RX` : 'APEX', x0 + ww * 0.55, Y(v) + 2); }
    for (const [u, v] of spec.hooks || []) { g.strokeStyle = '#e10600'; g.lineWidth = 7; g.beginPath(); g.arc(X(u), Y(v), 11, 0, 7); g.stroke(); }
    // soft occlusion towards the panel outline
    const vg = g.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, w * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }, 1024, 384, false, fin);
  m.userData.farColor = L.primary; return m;
}

const tagFar = (L, m) => { m.userData.farColor ||= L.primary; return m; };
// end-plate artwork: team colour field, big sponsor name, small partner logos and stripes
export function endplateMat(L, sponsor) {
  return tagFar(L, MAT.decal(['ep', L.primary, L.secondary, L.accent, sponsor].join('|'), (g, w, h) => {
    g.fillStyle = L.primary; g.fillRect(0, 0, w, h);
    g.fillStyle = L.secondary; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.78); g.lineTo(w, h * 0.62); g.lineTo(w, h); g.closePath(); g.fill();
    g.strokeStyle = L.accent; g.lineWidth = h * 0.025; g.beginPath(); g.moveTo(0, h * 0.76); g.lineTo(w, h * 0.6); g.stroke();
    const txt = String(sponsor || 'APEX').toUpperCase();
    fitText(g, txt, w * 0.8, 110); g.fillStyle = inkOn(L.primary); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w * 0.5, h * 0.36);
    const h0 = hashStr(L.primary + txt);
    g.font = `italic 900 24px ${FONT}`; g.fillStyle = inkOn(L.secondary);
    g.fillText(SPONSORS[h0 % SPONSORS.length], w * 0.72, h * 0.88);
  }, 512, 256, false, finishOf(L)));
}
// shark fin / engine cover fin: big race number and the driver's three-letter code
export function finMat(L, number, driver, flip) {
  const code = String(driver || '').replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase();
  return tagFar(L, MAT.decal(['fin', L.primary, L.secondary, L.accent, number, code].join('|'), (g, w, h) => {
    g.fillStyle = L.primary; g.fillRect(0, 0, w, h);
    g.fillStyle = L.accent; g.fillRect(0, h * 0.9, w, h * 0.1);
    g.fillStyle = inkOn(L.primary); g.textAlign = 'center'; g.textBaseline = 'middle';
    if (number != null) { g.font = `italic 900 ${h * 0.5}px ${FONT}`; g.fillText(String(number), w * (code ? 0.3 : 0.42), h * 0.5); }
    if (code) { g.font = `italic 900 ${h * 0.2}px ${FONT}`; g.fillText(code, w * 0.56, h * 0.4); }
  }, 512, 256, flip, finishOf(L)));
}
// helmet livery on the sphere UVs (u = around, u .5 faces forward; v = 0 bottom .. 1 top):
// base colour, crown design, side stripes in the team colours, number on the back
// base: a colour, or the game's helmet data { c1, c2, c3, pattern } (the driver's own design:
// c1 shell, c2 crown / main stripe, c3 accents) - then the team colours stay off the helmet
export function helmetMat(helm, L, number) {
  const D = helm && typeof helm === 'object' ? helm : null, base = D ? D.c1 || '#ffd400' : helm || '#ffd400';
  return cached(['helm', base, D ? [D.c2, D.c3, D.pattern].join() : '', L.primary, L.secondary, L.accent, number].join('|'), () => {
    const w = 512, h = 256, [c, g] = canvas(w, h);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const a1 = D ? D.c2 || '#ffffff' : L.primary.toLowerCase() === String(base).toLowerCase() ? L.secondary : L.primary;
    if (D) L = { ...L, accent: D.c3 || '#111111' };
    if (D && D.pattern % 2) { // alternative design: halo ring around the crown and a chin stripe
      g.fillStyle = a1; g.fillRect(0, h * 0.2, w, h * 0.09); g.fillStyle = L.accent; g.fillRect(0, h * 0.3, w, h * 0.02); g.fillRect(0, h * 0.72, w, h * 0.05);
    }
    g.fillStyle = a1; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.16);
    for (let k = 8; k >= 0; k--) { const x = (k / 8) * w; g.lineTo(x, h * (0.16 + 0.14 * Math.abs(Math.sin(k * 0.785 + 0.4)))); }
    g.closePath(); g.fill();
    for (const [col, y0, th] of [[L.accent, 0.42, 0.05], [a1, 0.5, 0.08], [L.accent, 0.6, 0.03]]) {
      g.fillStyle = col; g.beginPath();
      g.moveTo(w * 0.62, h * y0); g.bezierCurveTo(w * 0.8, h * (y0 - 0.1), w * 0.95, h * (y0 + 0.1), w, h * y0); g.lineTo(w, h * (y0 + th)); g.bezierCurveTo(w * 0.95, h * (y0 + th + 0.1), w * 0.8, h * (y0 + th - 0.1), w * 0.62, h * (y0 + th)); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w * 0.38, h * y0); g.bezierCurveTo(w * 0.2, h * (y0 - 0.1), w * 0.05, h * (y0 + 0.1), 0, h * y0); g.lineTo(0, h * (y0 + th)); g.bezierCurveTo(w * 0.05, h * (y0 + th + 0.1), w * 0.2, h * (y0 + th - 0.1), w * 0.38, h * (y0 + th)); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h * 0.82, w, h * 0.18);
    if (number != null) { g.fillStyle = inkOn(base); g.font = `italic 900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 1, h * 0.36); g.fillText(String(number), w, h * 0.36); }
    return coat({ map: canvasTex(c), roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 });
  });
}

// Glasshouse for the closed cars, painted on the cabin hull (same UV layout as the body):
// windscreen wrapping into the A-pillars, side windows with the roll cage showing through,
// rear screen, sun strip with the team's sponsor. spec: { ws: u where the screen starts,
// rw: u where the rear screen ends, side: [u0, u1], split: B-pillar u, ... }
export function greenhouseMat(L, spec, banner = '', pattern = L.pattern ?? 1) {
  const p = ((pattern | 0) % 10 + 10) % 10;
  return cached(['gh', L.primary, L.secondary, L.accent, JSON.stringify(spec), banner, p].join('|'), () => {
    const [c, g] = canvas(W / 2, H / 2); g.scale(0.5, 0.5);
    g.fillStyle = spec.roof || L.primary; g.fillRect(0, 0, W, H);
    // stripe schemes carry on over the roof
    if (p === 0 || p === 1 || p === 6) { g.save(); g.translate(0, H * 0.55); scheme(g, p, L, 'top', 0); g.restore(); }
    let S = SH;
    const glass = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * S) : g.moveTo(x * W, y * S))); g.closePath(); g.fillStyle = 'rgb(4,5,7)'; g.strokeStyle = 'rgb(4,5,7)'; g.lineWidth = 14; g.lineJoin = 'round'; g.fill(); g.stroke(); };
    const sheen = (x0, x1, y0, y1) => { const gr = g.createLinearGradient(0, y0 * S, 0, y1 * S); gr.addColorStop(0, 'rgba(120,150,180,0.22)'); gr.addColorStop(0.6, 'rgba(120,150,180,0.03)'); gr.addColorStop(1, 'rgba(120,150,180,0.10)'); g.fillStyle = gr; g.fillRect(x0 * W, Math.min(y0, y1) * S, (x1 - x0) * W, Math.abs(y1 - y0) * S); };
    const [s0, s1] = spec.side, sb = spec.split, ws = spec.ws, rw = spec.rw, rake = spec.rake ?? 0.07, t0 = spec.sill ?? 0.14, rq = spec.rq ?? 0.06;
    const sideFn = () => {
      const top = -0.92, bot = -t0;
      g.save();
      g.beginPath(); g.moveTo((s0 + rq) * W, top * S); g.lineTo((s1 - rake) * W, top * S); g.lineTo(s1 * W, bot * S); g.lineTo(s0 * W, bot * S); g.closePath(); g.save(); g.clip();
      g.fillStyle = 'rgb(4,5,7)'; g.fillRect(s0 * W, top * S, (s1 - s0) * W, (bot - top) * S);
      // roll cage behind the glass, then the reflection
      g.strokeStyle = 'rgba(96,102,110,0.6)'; g.lineWidth = 9; g.beginPath(); g.moveTo((sb - 0.03) * W, bot * S); g.lineTo((s0 + rq + 0.03) * W, top * S); g.moveTo((sb + 0.03) * W, bot * S); g.lineTo((s1 - rake - 0.05) * W, top * S); g.moveTo(s0 * W, (top + 0.13) * S); g.lineTo(s1 * W, (top + 0.13) * S); g.stroke();
      sheen(s0, s1, top, bot);
      g.restore();
      // B-pillar and window frame
      g.fillStyle = '#0c0d10'; g.fillRect((sb - 0.008) * W, top * S, 0.016 * W, (bot - top) * S);
      g.strokeStyle = '#0c0d10'; g.lineWidth = 7; g.lineJoin = 'round'; g.beginPath(); g.moveTo((s0 + rq) * W, top * S); g.lineTo((s1 - rake) * W, top * S); g.lineTo(s1 * W, bot * S); g.lineTo(s0 * W, bot * S); g.closePath(); g.stroke();
      g.restore();
    };
    g.save(); g.translate(0, H); sideFn(); g.restore();
    g.save(); g.translate(0, H * 0.1); g.scale(1, -1); sideFn(); g.restore();
    // crew names on the rear side windows (upright on each side)
    if (spec.names) for (const [ty, rot] of [[H - 0.55 * SH, 0], [H * 0.1 + 0.55 * SH, Math.PI]]) { g.save(); g.translate((s0 + (sb - s0) * 0.55) * W, ty); g.rotate(rot); g.fillStyle = '#f2f2f2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 26px ${FONT}`; g.fillText(spec.names[0], 0, -16); g.fillText(spec.names[1], 0, 16); g.restore(); }
    // windscreen and rear screen on the top region, wrapping down towards the pillars
    g.save(); g.translate(0, H * 0.55); S = TH;
    const wrap = spec.wrap ?? 0.44, wf = spec.wfront ?? 0.985;
    glass([[ws + 0.04, -wrap], [wf - 0.01, -wrap * 0.96], [wf, 0], [wf - 0.01, wrap * 0.96], [ws + 0.04, wrap], [ws, wrap * 0.6], [ws, -wrap * 0.6]]);
    sheen(ws, wf, -wrap, wrap);
    // sun strip
    const st = spec.strip ?? 0.045;
    g.fillStyle = L.secondary; g.beginPath(); g.moveTo((ws + 0.04) * W, -wrap * S - 7); g.lineTo((ws + 0.04 + st) * W, -wrap * S - 7); g.lineTo((ws + st) * W, -wrap * 0.6 * S); g.lineTo((ws + st) * W, wrap * 0.6 * S); g.lineTo((ws + 0.04 + st) * W, wrap * S + 7); g.lineTo((ws + 0.04) * W, wrap * S + 7); g.lineTo(ws * W - 7, wrap * 0.6 * S); g.lineTo(ws * W - 7, -wrap * 0.6 * S); g.closePath(); g.fill();
    if (banner) { g.save(); g.translate((ws + st * 0.55) * W, 0); g.rotate(-Math.PI / 2); g.scale(spec.basp ?? 2, 1); fitText(g, banner.toUpperCase(), (TH * wrap * 1.1) / (spec.basp ?? 2), st * W * 0.7); g.fillStyle = inkOn(L.secondary); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(banner.toUpperCase(), 0, 0); g.restore(); }
    if (rw > 0.02) { const rwr = spec.rwrap ?? 0.36; glass([[0.012, -rwr], [rw - 0.03, -rwr], [rw, -rwr * 0.5], [rw, rwr * 0.5], [rw - 0.03, rwr], [0.012, rwr]]); sheen(0.01, rw, -rwr, rwr); }
    g.restore();
    const m = coat({ map: canvasTex(c, { aniso: 8 }), roughness: 0.2, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 });
    m.userData.livery = true; return m;
  });
}
