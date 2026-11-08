// Procedural track geometry + canvas renderer
import { mulberry32 } from '../engine/rng.js';
import { luminance } from './art.js';

function catmull(pts, closed, samples = 14) {
  const out = [];
  const n = pts.length;
  const get = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

export function genCircuit(seed, street = 0) {
  const r = mulberry32(seed * 7919 + 13);
  const n = street > 0.5 ? 12 + Math.floor(r() * 4) : 10 + Math.floor(r() * 6);
  const harm = [2, 3, 4, 5].map((k) => ({ k, a: (0.28 / k) * (0.5 + r()) * (street > 0.5 ? 1.4 : 1), ph: r() * Math.PI * 2 }));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
    let rad = 1 + harm.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.ph), 0);
    rad = Math.max(0.38, rad + (r() - 0.5) * (street > 0.5 ? 0.3 : 0.18));
    pts.push([Math.cos(th) * rad * 1.55, Math.sin(th) * rad]);
  }
  // Add a hairpin indentation sometimes
  if (r() > 0.4) { const i = Math.floor(r() * n); pts[i] = [pts[i][0] * 0.55, pts[i][1] * 0.55]; }
  return buildPath(catmull(pts, true, street > 0.5 ? 8 : 16), true);
}

// Rally stage road. style: 'fast' (long flowing bends), 'twisty' (mountain hairpins), 'rough' (technical, medium)
export const STAGE_STYLE = { fin: 'fast', swe: 'fast', ita: 'rough', por: 'rough', ken: 'rough', gre: 'rough', chi: 'fast', gbr: 'rough', mc: 'twisty', cro: 'twisty', eur: 'twisty', jpn: 'twisty' };
export function genStage(seed, style = 'rough') {
  const r = mulberry32(seed * 104729 + 7);
  const P = { fast: { turn: 0.7, step: [1.0, 1.8], hair: 0.02, n: 24 }, rough: { turn: 1.4, step: [0.6, 1.4], hair: 0.07, n: 28 }, twisty: { turn: 1.8, step: [0.45, 1.0], hair: 0.16, n: 34 } }[style] || { turn: 1.4, step: [0.6, 1.4], hair: 0.07, n: 28 };
  const pts = [];
  let x = 0, y = 0, a = r() * 0.6 - 0.3;
  for (let i = 0; i < P.n; i++) {
    pts.push([x, y]);
    if (r() < P.hair && i > 2 && i < P.n - 3) {
      // hairpin: tight 150-180 degree turn built from short steps
      const dir = r() < 0.5 ? 1 : -1;
      for (let k = 0; k < 4; k++) { a += dir * 0.78; x += Math.cos(a) * 0.28; y += Math.sin(a) * 0.28; pts.push([x, y]); }
      continue;
    }
    a += (r() - 0.5) * P.turn;
    a = Math.max(-1.6, Math.min(1.6, a));
    const step = P.step[0] + r() * (P.step[1] - P.step[0]);
    x += Math.cos(a) * step; y += Math.sin(a) * step;
  }
  return buildPath(catmull(pts, false, 10), false);
}

function buildPath(points, closed) {
  // normalize
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of points) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const w = maxx - minx, h = maxy - miny;
  const pts = points.map(([x, y]) => [(x - minx) / w, (y - miny) / h]);
  const len = [0];
  const total = pts.length + (closed ? 0 : -1);
  for (let i = 1; i <= total; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    len.push(len[i - 1] + Math.hypot(b[0] - a[0], (b[1] - a[1]) * (h / w)));
  }
  return { pts, len, total: len[len.length - 1], closed, aspect: w / h };
}

export class TrackView {
  constructor(canvas, path, opts = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.path = path; this.opts = opts;
    this.bg = document.createElement('canvas');
    this.lbl = document.createElement('canvas'); // static labels: composited above cars, night and rain
    this.rainDrops = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() }));
    this.resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);
  }
  destroy() { this._ro?.disconnect(); }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.W = r.width; this.H = r.height; this.dpr = dpr;
    this.cv.width = r.width * dpr; this.cv.height = r.height * dpr;
    this.bg.width = this.cv.width; this.bg.height = this.cv.height;
    this.lbl.width = this.cv.width; this.lbl.height = this.cv.height;
    // the live race map uses tighter margins (labels find their own room) and keeps clear of the TV subtitles
    const live = this.opts.sectors && r.width > 420;
    const pad = live ? Math.min(this.opts.pad ?? 60, Math.max(30, Math.min(r.width, r.height) * 0.06)) : this.opts.pad ?? 60;
    const pt = this.opts.padTop || 0;
    const pb = this.opts.padBottom ?? (live && this.cv.parentElement?.querySelector('.race-sub') ? 46 : 0);
    // bands reserved for the overlaid UI: subtitles at the bottom, camera buttons at the top
    this.keepBottom = pb ? pb + 6 : 0;
    this.keepTop = live ? pt + 10 : 0;
    const aw = r.width - pad * 2, ah = r.height - pad * 2 - pb - pt;
    const asp = this.path.aspect;
    let w = aw, h = aw / asp;
    if (h > ah) { h = ah; w = ah * asp; }
    this.ox = (r.width - w) / 2; this.oy = (r.height - h) / 2 - pb / 2 + pt / 2; this.sw = w; this.sh = h;
    this.screen = this.path.pts.map(([x, y]) => [this.ox + x * w, this.oy + y * h]);
    this.drawBg();
  }
  pointAt(p) {
    const { len, total, closed } = this.path;
    let t = closed ? ((p % 1) + 1) % 1 : Math.max(0, Math.min(1, p));
    const target = t * total;
    let lo = 0, hi = len.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (len[m] <= target) lo = m; else hi = m; }
    const seg = len[hi] - len[lo] || 1;
    const f = (target - len[lo]) / seg;
    const a = this.screen[lo % this.screen.length], b = this.screen[hi % this.screen.length];
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  drawBg() {
    const c = this.bg.getContext('2d');
    const { dpr } = this;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    const surf = this.opts.surface;
    this.occ = null; this.staticRects = [];
    // ground
    const g = c.createRadialGradient(this.W / 2, this.H / 2, 50, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
    const groundA = surf === 'snow' ? '#2a3440' : surf === 'gravel' || surf === 'rough' ? '#1e1a14' : '#0f1712';
    g.addColorStop(0, groundA); g.addColorStop(1, '#06080a');
    if (!this.opts.clear) {
      c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
      // grid
      c.strokeStyle = 'rgba(255,255,255,0.025)'; c.lineWidth = 1;
      for (let x = 0; x < this.W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, this.H); c.stroke(); }
      for (let y = 0; y < this.H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(this.W, y); c.stroke(); }
    }
    const pts = this.screen;
    const trace = () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (this.path.closed) c.closePath(); };
    const tw = this.opts.width ?? Math.max(10, Math.min(22, this.sw / 45));
    c.lineJoin = 'round'; c.lineCap = 'round';
    // glow
    c.shadowColor = this.opts.glow || 'rgba(225,6,0,0.35)'; c.shadowBlur = 30;
    trace(); c.strokeStyle = '#000'; c.lineWidth = tw + 14; c.stroke();
    c.shadowBlur = 0;
    if (this.opts.rally) {
      const col = { gravel: '#8a6238', rough: '#6e4a2a', tarmac: '#3a3f48', snow: '#cfe6f5' }[surf] || '#8a6238';
      trace(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = tw + 6; c.stroke();
      trace(); c.strokeStyle = col; c.lineWidth = tw; c.stroke();
      trace(); c.setLineDash([2, 10]); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
      // split markers
      for (const sp of [0.33, 0.66]) { const p = this.pointAt(sp); c.fillStyle = '#ffb020'; c.beginPath(); c.arc(p.x, p.y, 6, 0, 7); c.fill(); c.fillStyle = '#000'; c.font = '700 10px Exo 2'; c.textAlign = 'center'; c.fillText(sp < 0.5 ? 'S1' : 'S2', p.x, p.y + 3.5); }
      const s = this.pointAt(0), e = this.pointAt(1);
      c.fillStyle = '#22d37a'; c.beginPath(); c.arc(s.x, s.y, 9, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x, e.y, 9, 0, 7); c.fill();
      c.fillStyle = '#000'; c.font = '800 9px Exo 2'; c.textAlign = 'center'; c.fillText('START', s.x, s.y - 14); c.fillStyle = '#fff'; c.fillText('FINISH', e.x, e.y - 14);
      return;
    }
    // run-off and kerbs
    trace(); c.strokeStyle = 'rgba(70,76,88,0.28)'; c.lineWidth = tw + 22; c.stroke();
    if (this.opts.sectors) { trace(); c.strokeStyle = 'rgba(235,238,245,0.55)'; c.lineWidth = tw + 3; c.stroke(); }
    else {
      trace(); c.strokeStyle = '#d8d8d8'; c.lineWidth = tw + 5; c.stroke();
      trace(); c.setLineDash([7, 7]); c.strokeStyle = '#d0181c'; c.lineWidth = tw + 5; c.stroke(); c.setLineDash([]);
    }
    // asphalt with a soft centre sheen
    trace(); c.strokeStyle = '#272b33'; c.lineWidth = tw; c.stroke();
    trace(); c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = tw * 0.45; c.stroke();
    const off = (p, o) => { const q = this.pointAt(p); return [q.x + Math.cos(q.ang + Math.PI / 2) * o, q.y + Math.sin(q.ang + Math.PI / 2) * o]; };
    const along = (a, b, o, step = 0.0015) => { c.beginPath(); for (let p = a; p <= b + 1e-9; p += step) { const [x, y] = off(p, o); p === a ? c.moveTo(x, y) : c.lineTo(x, y); } };
    // pit lane: parallel lane along the main straight, blending in and out of the track
    const PL = this.opts.pitLane ?? 0.045, po = tw + 9;
    const pitOff = (p) => { const u = (p + PL) / (2 * PL); const e = Math.min(1, Math.min(u, 1 - u) / 0.22); return po * (e * e * (3 - 2 * e)); };
    c.beginPath(); for (let p = -PL; p <= PL + 1e-9; p += 0.0015) { const [x, y] = off(p, pitOff(p)); p === -PL ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 9; c.stroke();
    c.strokeStyle = '#1b1e24'; c.lineWidth = 7; c.stroke();
    c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,176,32,0.7)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    for (let k = 0; k < 10; k++) { const p = -0.026 + k * 0.0058; const [x1, y1] = off(p, po + 4); const [x2, y2] = off(p, po + 8); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5; c.stroke(); }
    this.pitPos = (k) => { const p = -0.03 + (k % 12) * 0.005; const q = this.pointAt(p); const o = pitOff(p); return { x: q.x + Math.cos(q.ang + Math.PI / 2) * o, y: q.y + Math.sin(q.ang + Math.PI / 2) * o, ang: q.ang }; };
    // label requests: placed after all the track art by a collision-avoiding pass (see layoutStatic)
    const req = [];
    const nrm = (p) => { const q = this.pointAt(p); return { x: q.x, y: q.y, nx: Math.cos(q.ang + Math.PI / 2), ny: Math.sin(q.ang + Math.PI / 2) }; };
    if (this.opts.sectors || this.opts.labels) { const q = nrm(-PL * 0.55); const a = off(-PL * 0.55, po); req.push({ kind: 'pill', text: 'PIT', bg: '#ffb020', fg: '#000', x: a[0], y: a[1], dx: q.nx, dy: q.ny, base: 8, prio: 0 }); }
    // sectors: coloured stripe along the outside edge of each third + label pill
    const SC = ['#ff3b5c', '#3aa0ff', '#ffcc33'];
    if (this.opts.sectors) {
      SC.forEach((col, i) => {
        along(i / 3 + 0.004, (i + 1) / 3 - 0.004, -(tw / 2 + 5));
        c.strokeStyle = col; c.globalAlpha = 0.8; c.lineWidth = 2.5; c.stroke(); c.globalAlpha = 1;
        if (i) { const q = this.pointAt(i / 3); c.save(); c.translate(q.x, q.y); c.rotate(q.ang + Math.PI / 2); c.fillStyle = col; c.fillRect(-tw / 2 - 4, -1.5, tw + 8, 3); c.restore(); }
        const q = nrm(i / 3 + 1 / 6);
        req.push({ kind: 'pill', text: `S${i + 1}`, bg: col, fg: '#000', x: q.x, y: q.y, dx: -q.nx, dy: -q.ny, base: tw / 2 + 9, prio: 1, slide: 0.05, p: i / 3 + 1 / 6 });
      });
    }
    // DRS zones: translucent green band on the inside edge + label
    for (const [a, b] of this.opts.drs || []) {
      along(a, b, tw / 2 + 5); c.strokeStyle = 'rgba(34,211,122,0.28)'; c.lineWidth = 7; c.stroke();
      along(a, b, tw / 2 + 5); c.setLineDash([6, 5]); c.strokeStyle = 'rgba(34,211,122,0.95)'; c.lineWidth = 2.5; c.stroke(); c.setLineDash([]);
      const pm = a + Math.min(0.02, (b - a) / 2), q = nrm(pm);
      req.push({ kind: 'pill', text: 'DRS', bg: '#22d37a', fg: '#00170a', x: q.x, y: q.y, dx: q.nx, dy: q.ny, base: tw / 2 + 9, prio: 3, slide: Math.max(0.004, (b - a) / 2 - 0.004), p: pm });
    }
    // corner numbers (real circuits): markers OUTSIDE each corner (away from the centre of curvature)
    const geo = this.path.geo;
    if (geo?.corners?.length && (this.opts.sectors || this.opts.turns) && this.W > 420) {
      const N = this.path.pts.length;
      geo.corners.forEach((cn, k) => {
        const idx = Math.min(N - 1, Math.round(cn.i / 2)); const p = this.path.len[idx] / this.path.total;
        const q = nrm(p);
        // outward = from the midpoint of the chord (p-d, p+d) towards the apex
        let ox = 0, oy = 0;
        for (const d of [0.006, 0.012]) { const A = this.pointAt(p - d), Bp = this.pointAt(p + d); ox += q.x - (A.x + Bp.x) / 2; oy += q.y - (A.y + Bp.y) / 2; }
        const ol = Math.hypot(ox, oy);
        let dx, dy;
        if (ol > 0.4) { dx = ox / ol; dy = oy / ol; } else { dx = q.nx * cn.dir; dy = q.ny * cn.dir; }
        req.push({ kind: 'turn', text: String(k + 1), x: q.x, y: q.y, dx, dy, base: tw / 2 + 7, prio: 2 });
      });
    }
    // start / finish: chequered line + direction chevrons
    const s = this.pointAt(0);
    c.save(); c.translate(s.x, s.y); c.rotate(s.ang + Math.PI / 2);
    const sq = tw / 4;
    for (let i = -2; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#000'; c.fillRect(i * sq, j * sq - sq, sq, sq); }
    c.restore();
    for (const p of [0.012, 0.02]) { const q = this.pointAt(p); c.save(); c.translate(q.x, q.y); c.rotate(q.ang); c.beginPath(); c.moveTo(-2.5, -tw * 0.22); c.lineTo(2.5, 0); c.lineTo(-2.5, tw * 0.22); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.6; c.stroke(); c.restore(); }
    this.tw = tw;
    this.buildOcc(tw, PL, pitOff);
    const lc = this.lbl.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, this.lbl.width, this.lbl.height); lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layoutStatic(lc, req);
  }
  // label size multiplier for very large maps (1440p and up)
  uiScale() { return Math.max(1, Math.min(1.5, Math.min(this.W, this.H * 1.5) / 900)); }
  // ---- Label collision avoidance -------------------------------------------------
  // Occupancy grid (4px cells) of everything a label must not cover: asphalt + kerbs + pit lane.
  buildOcc(tw, PL, pitOff) {
    const G = 4, gw = Math.ceil(this.W / G) + 1, gh = Math.ceil(this.H / G) + 1;
    const occ = new Uint8Array(gw * gh);
    const stamp = (x, y, r) => {
      const x0 = Math.max(0, Math.floor((x - r) / G)), x1 = Math.min(gw - 1, Math.floor((x + r) / G));
      const y0 = Math.max(0, Math.floor((y - r) / G)), y1 = Math.min(gh - 1, Math.floor((y + r) / G));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const cx = i * G + G / 2 - x, cy = j * G + G / 2 - y; if (cx * cx + cy * cy <= (r + G * 0.5) ** 2) occ[j * gw + i] = 1; }
    };
    const R = tw / 2 + 5;
    const L = this.sw + this.sh;
    const step = Math.max(0.0008, 2.5 / (L * 1.6));
    for (let p = 0; p < 1; p += step) { const q = this.pointAt(p); stamp(q.x, q.y, R); }
    if (PL && pitOff) for (let p = -PL; p <= PL; p += step) { const q = this.pointAt(p); const o = pitOff(p); stamp(q.x + Math.cos(q.ang + Math.PI / 2) * o, q.y + Math.sin(q.ang + Math.PI / 2) * o, 5); }
    this.occ = { G, gw, gh, a: occ };
    this.staticRects = [];
  }
  occHits(x, y, w, h) {
    const o = this.occ; if (!o) return 0;
    const x0 = Math.max(0, Math.floor(x / o.G)), x1 = Math.min(o.gw - 1, Math.floor((x + w) / o.G));
    const y0 = Math.max(0, Math.floor(y / o.G)), y1 = Math.min(o.gh - 1, Math.floor((y + h) / o.G));
    let n = 0;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) n += o.a[j * o.gw + i];
    return n;
  }
  // Finds the best free spot for a w×h box near an anchor, preferring direction (dx,dy).
  // rects: boxes already placed [x,y,w,h]; returns { x, y } (top-left) and its score.
  findSpot(ax, ay, dx, dy, w, h, base, rects, { maxD = 40, prev = null, spread = 1.6, margin = 2, carPts = null } = {}) {
    let best = null;
    const ext = (ux, uy) => Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
    const angs = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3, 1.65, -1.65, 2.2, -2.2, Math.PI].filter((a) => Math.abs(a) <= spread + 1e-6);
    for (let d = 0; d <= maxD; d += 5) {
      for (const a of angs) {
        const ux = dx * Math.cos(a) - dy * Math.sin(a), uy = dx * Math.sin(a) + dy * Math.cos(a);
        const r = base + d + ext(ux, uy);
        const x = ax + ux * r - w / 2, y = ay + uy * r - h / 2;
        let s = d * 0.6 + Math.abs(a) * 5;
        if (x < 3 || y < 3 + (this.keepTop || 0) || x + w > this.W - 3 || y + h > this.H - 3 - (this.keepBottom || 0)) s += 4000;
        s += this.occHits(x, y, w, h) * 40;
        for (const q of rects) if (x < q[0] + q[2] + margin && x + w + margin > q[0] && y < q[1] + q[3] + margin && y + h + margin > q[1]) s += 600;
        if (carPts) for (const [cx, cy] of carPts) if (cx > x - 6 && cx < x + w + 6 && cy > y - 6 && cy < y + h + 6) s += 30;
        if (prev && Math.abs(prev.x - x) + Math.abs(prev.y - y) < 3) s -= 18; // keep tags steady between frames
        if (!best || s < best.s) best = { x, y, s, ux, uy };
        if (s < 1 && !prev) return best;
      }
    }
    return best;
  }
  layoutStatic(c, req) {
    const pill = (x, y, text, bg, fg = '#000', fs = 9) => {
      c.font = `800 ${fs}px Barlow Condensed, Exo 2, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const w = c.measureText(text).width + 10, h = fs + 6;
      c.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(c, x - w / 2 + 1, y - h / 2 + 1.5, w, h, 3); c.fill();
      c.fillStyle = bg; roundRect(c, x - w / 2, y - h / 2, w, h, 3); c.fill();
      c.fillStyle = fg; c.fillText(text, x, y + 0.5); c.textBaseline = 'alphabetic';
    };
    const rects = this.staticRects;
    const big = this.W > 900, k = this.uiScale();
    const fs = (big ? 10.5 : 9.5) * k, tr = (big ? 8.5 : 7.5) * k;
    req.sort((a, b) => a.prio - b.prio);
    for (const L of req) {
      let w, h;
      if (L.kind === 'turn') { w = h = tr * 2; }
      else { c.font = `800 ${fs}px Barlow Condensed, Exo 2, sans-serif`; w = c.measureText(L.text).width + 10; h = fs + 6; }
      let best = this.findSpot(L.x, L.y, L.dx, L.dy, w, h, L.base, rects, { maxD: L.kind === 'turn' ? 30 : 36, spread: L.kind === 'turn' ? 1.3 : 2.2 });
      // pills may also slide along the track to find a clean spot
      if (L.slide && best.s >= 1) {
        for (const f of [0.35, -0.35, 0.7, -0.7, 1, -1]) {
          const p = L.p + L.slide * f; const q = this.pointAt(p);
          const sg = (L.dx * Math.cos(q.ang + Math.PI / 2) + L.dy * Math.sin(q.ang + Math.PI / 2)) >= 0 ? 1 : -1;
          const b2 = this.findSpot(q.x, q.y, Math.cos(q.ang + Math.PI / 2) * sg, Math.sin(q.ang + Math.PI / 2) * sg, w, h, L.base, rects, { maxD: 24, spread: 2.2 });
          if (b2.s + Math.abs(f) * 4 < best.s) { best = b2; best.ax = q.x; best.ay = q.y; }
          if (best.s < 1) break;
        }
      }
      if (L.kind === 'turn' && best.s >= 600) continue; // nowhere clean: skip rather than stack on another label
      rects.push([best.x, best.y, w, h]);
      const cx = best.x + w / 2, cy = best.y + h / 2;
      const ax = best.ax ?? L.x, ay = best.ay ?? L.y;
      const far = Math.hypot(cx - ax, cy - ay) - (L.base + Math.max(w, h) / 2);
      if (far > 7) {
        // thin leader from the track edge to the label
        const ux = (cx - ax), uy = (cy - ay), ul = Math.hypot(ux, uy) || 1;
        c.beginPath(); c.moveTo(ax + ux / ul * (L.base - 2), ay + uy / ul * (L.base - 2)); c.lineTo(cx - ux / ul * (Math.min(w, h) / 2), cy - uy / ul * (Math.min(w, h) / 2));
        c.strokeStyle = L.kind === 'turn' ? 'rgba(255,255,255,0.22)' : L.bg; c.globalAlpha = L.kind === 'turn' ? 1 : 0.55; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
      }
      if (L.kind === 'turn') {
        c.beginPath(); c.arc(cx, cy, tr, 0, 7); c.fillStyle = 'rgba(10,12,16,0.9)'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.34)'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.86)'; c.font = `700 ${fs}px Barlow Condensed, Exo 2, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(L.text, cx, cy + 0.5); c.textBaseline = 'alphabetic';
      } else pill(cx, cy, L.text, L.bg, L.fg, fs);
    }
  }
  drawCar(x, y, ang, col1, col2, opts = {}) {
    const c = this.ctx;
    const L = opts.len || Math.max(10, (this.tw || 16) * 0.85);
    if (opts.dot) {
      // broadcast-style marker: team-coloured disc with the race position inside
      const r = Math.max(6.5, Math.min(9, L * 0.5));
      c.beginPath(); c.arc(x, y + 1, r + 2, 0, 7); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill();
      c.beginPath(); c.arc(x, y, r + 1.4, 0, 7); c.fillStyle = opts.num === 1 ? '#f5c542' : 'rgba(10,12,16,0.95)'; c.fill();
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = col1; c.fill();
      c.beginPath(); c.arc(x, y, r, Math.PI * 0.15, Math.PI * 0.85); c.lineWidth = 2; c.strokeStyle = col2 || '#fff'; c.stroke();
      if (opts.num != null) {
        c.font = `800 ${r > 7.5 ? 10 : 9}px Barlow Condensed, Exo 2, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        const lum = luminance(col1);
        c.fillStyle = lum > 0.55 ? '#000' : '#fff';
        c.fillText(String(opts.num), x, y + 0.5);
        c.textBaseline = 'alphabetic';
      }
      if (this._inFrame) this._cars.push([x, y]);
      return;
    }
    if (opts.outline) {
      // player car: a pulsing beacon ring under the car
      const ph = (performance.now() % 1400) / 1400;
      c.beginPath(); c.arc(x, y, L * (0.7 + ph * 0.9), 0, 7); c.strokeStyle = col1; c.globalAlpha = 0.6 * (1 - ph); c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
    }
    c.save(); c.translate(x, y); c.rotate(ang);
    if (opts.glow) { c.shadowColor = opts.glow; c.shadowBlur = 14; }
    if (opts.style === 'rally' || opts.style === 'endurance') {
      c.fillStyle = col1; roundRect(c, -L / 2, -L * 0.28, L, L * 0.56, L * 0.18); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = col2; c.fillRect(-L * 0.1, -L * 0.28, L * 0.18, L * 0.56);
      c.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(c, -L * 0.05, -L * 0.2, L * 0.28, L * 0.4, 2); c.fill();
    } else {
      c.fillStyle = '#111'; c.fillRect(-L * 0.38, -L * 0.34, L * 0.18, L * 0.68); c.fillRect(L * 0.22, -L * 0.3, L * 0.14, L * 0.6);
      c.fillStyle = col1;
      c.beginPath(); c.moveTo(L / 2, 0); c.lineTo(L * 0.1, -L * 0.17); c.lineTo(-L * 0.45, -L * 0.17); c.lineTo(-L * 0.45, L * 0.17); c.lineTo(L * 0.1, L * 0.17); c.closePath(); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = col2; c.fillRect(-L * 0.55, -L * 0.3, L * 0.12, L * 0.6); c.fillRect(L * 0.42, -L * 0.32, L * 0.1, L * 0.64);
      c.fillStyle = col2; c.beginPath(); c.arc(-L * 0.02, 0, L * 0.09, 0, 7); c.fill();
    }
    if (opts.outline) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, L * 0.75, 0, 7); c.stroke(); }
    c.restore();
    if (opts.num != null && !opts.label) {
      c.font = '800 8px Exo 2'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.75)'; c.beginPath(); c.arc(x, y - L * 0.9, 6.5, 0, 7); c.fill();
      c.strokeStyle = col1; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#fff'; c.fillText(String(opts.num), x, y - L * 0.9 + 3);
    }
    if (opts.label) {
      if (this._inFrame) this._tags.push({ x, y, L, col1, label: opts.label, me: !!opts.outline });
      else this.drawTag({ x, y, L, col1, label: opts.label, me: !!opts.outline }, []);
    }
    if (this._inFrame) this._cars.push([x, y]);
  }
  // broadcast tag: [position][team stripe] NAME, placed clear of other tags, static labels and (if possible) the track
  drawTag(T, placed) {
    const c = this.ctx;
    const m = /^(\d+)\s+(.*)$/.exec(String(T.label));
    const pos = m ? m[1] : null, name = (m ? m[2] : String(T.label)).toUpperCase();
    const big = this.W > 900, k = this.uiScale();
    const fs = (big ? 12 : 11) * k, h = Math.round((big ? 18 : 16) * k);
    c.font = `700 ${fs}px Barlow Condensed, Exo 2, sans-serif`; c.textBaseline = 'middle';
    const nw = c.measureText(name).width + 12 * k, pw = pos ? Math.round((big ? 19 : 17) * k) : 0, w = pw + 3 + nw;
    const prev = (this._tagPrev || (this._tagPrev = {}))[T.label.replace(/^\d+\s+/, '')];
    const rects = [...(this.staticRects || []), ...placed];
    const others = (this._cars || []).filter(([cx, cy]) => cx !== T.x || cy !== T.y);
    const best = this.findSpot(T.x, T.y, 0, -1, w, h, T.L * 0.55 + 3, rects, { maxD: 46, spread: Math.PI, margin: 3, prev: prev && { x: prev.x + T.x, y: prev.y + T.y }, carPts: others });
    const lx = Math.round(best.x), ly = Math.round(best.y);
    this._tagPrev[T.label.replace(/^\d+\s+/, '')] = { x: best.x - T.x, y: best.y - T.y };
    placed.push([lx, ly, w, h]);
    // leader line from the car to the nearest edge of the tag
    const ex = Math.max(lx, Math.min(lx + w, T.x)), ey = Math.max(ly, Math.min(ly + h, T.y));
    if (Math.hypot(ex - T.x, ey - T.y) > T.L * 0.6) { c.beginPath(); c.moveTo(T.x, T.y); c.lineTo(ex, ey); c.strokeStyle = T.me ? T.col1 : 'rgba(255,255,255,0.45)'; c.lineWidth = T.me ? 1.5 : 1; c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(lx + 1, ly + 2, w, h);
    if (pos) { c.fillStyle = pos === '1' ? '#f5c542' : '#f4f5f7'; c.fillRect(lx, ly, pw, h); c.fillStyle = '#000'; c.textAlign = 'center'; c.font = `800 ${fs}px Barlow Condensed, Exo 2, sans-serif`; c.fillText(pos, lx + pw / 2, ly + h / 2 + 0.5); }
    c.fillStyle = T.col1; c.fillRect(lx + pw, ly, 3, h);
    c.fillStyle = T.me ? 'rgba(18,20,26,0.96)' : 'rgba(12,14,18,0.88)'; c.fillRect(lx + pw + 3, ly, nw, h);
    if (T.me) { c.strokeStyle = T.col1; c.lineWidth = 1; c.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1); }
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `700 ${fs}px Barlow Condensed, Exo 2, sans-serif`; c.fillText(name, lx + pw + 3 + 6 * k, ly + h / 2 + 0.5);
    c.textBaseline = 'alphabetic';
  }
  frame(drawFn, { rain = 0, night = 0, t = 0 } = {}) {
    const c = this.ctx;
    if (!this.W) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._inFrame = true; this._tags = []; this._cars = [];
    try { drawFn?.(c, this); } finally { this._inFrame = false; }
    if (night > 0) { c.fillStyle = `rgba(0,5,25,${0.45 * night})`; c.fillRect(0, 0, this.W, this.H); }
    if (rain > 0.05) {
      c.strokeStyle = `rgba(170,200,255,${0.15 + rain * 0.3})`; c.lineWidth = 1;
      c.beginPath();
      const n = Math.floor(this.rainDrops.length * Math.min(1, rain * 1.3));
      for (let i = 0; i < n; i++) {
        const d = this.rainDrops[i];
        d.y += 0.012 * d.s; d.x -= 0.002 * d.s; if (d.y > 1) { d.y = 0; d.x = Math.random() * 1.1; }
        const x = d.x * this.W, y = d.y * this.H;
        c.moveTo(x, y); c.lineTo(x - 3, y + 12 * d.s);
      }
      c.stroke();
      c.fillStyle = `rgba(40,60,90,${rain * 0.18})`; c.fillRect(0, 0, this.W, this.H);
    }
    // labels stay crisp above night and rain: static labels, then the name tags (avoiding each other)
    if (this.staticRects?.length) { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.lbl, 0, 0); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    const placed = [];
    this._tags.sort((a, b) => (b.me - a.me) || (parseInt(a.label, 10) || 99) - (parseInt(b.label, 10) || 99)).forEach((T) => this.drawTag(T, placed));
  }
}
export function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// Real circuit path in TrackView format + time->arc mapping from the physics profile
import { trackGeometry, referenceProfile, sampleAtTimeFrac } from '../engine/trackphys.js';
const pathCache = {};
export function circuitPath(cid) {
  if (pathCache[cid]) return pathCache[cid];
  const g = trackGeometry(cid);
  if (!g) return genCircuit(7, 0);
  const pts = [];
  for (let i = 0; i < g.N; i += 2) pts.push([g.x[i], g.y[i]]);
  const p = buildPath(pts, true);
  p.geo = g;
  pathCache[cid] = p;
  return p;
}
// Converts a lap fraction measured in TIME into a fraction of track DISTANCE
export function arcFrac(catId, cid, timeFrac, realLap) {
  const prof = referenceProfile(catId, cid, realLap);
  const g = trackGeometry(cid);
  return sampleAtTimeFrac(prof, timeFrac) / g.N;
}
export function speedAtTimeFrac(catId, cid, timeFrac, lapTime, realLap) {
  const prof = referenceProfile(catId, cid, realLap);
  const g = trackGeometry(cid);
  const i = Math.floor(sampleAtTimeFrac(prof, timeFrac)) % g.N;
  return prof.v[i] * (prof.lap / lapTime) * 3.6;
}
