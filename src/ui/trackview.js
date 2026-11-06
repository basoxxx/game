// Procedural track geometry + canvas renderer
import { mulberry32 } from '../engine/rng.js';

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

export function genStage(seed) {
  const r = mulberry32(seed * 104729 + 7);
  const pts = [];
  let x = 0, y = 0, a = r() * 0.6 - 0.3;
  const n = 26;
  for (let i = 0; i < n; i++) {
    pts.push([x, y]);
    a += (r() - 0.5) * 1.5;
    a = Math.max(-1.3, Math.min(1.3, a));
    const step = 0.6 + r() * 0.8;
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
    const pad = this.opts.pad ?? 60;
    const aw = r.width - pad * 2, ah = r.height - pad * 2 - (this.opts.padBottom || 0);
    const asp = this.path.aspect;
    let w = aw, h = aw / asp;
    if (h > ah) { h = ah; w = ah * asp; }
    this.ox = (r.width - w) / 2; this.oy = (r.height - h) / 2 - (this.opts.padBottom || 0) / 2; this.sw = w; this.sh = h;
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
    // ground
    const g = c.createRadialGradient(this.W / 2, this.H / 2, 50, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
    const groundA = surf === 'snow' ? '#2a3440' : surf === 'gravel' || surf === 'rough' ? '#1e1a14' : '#0f1712';
    g.addColorStop(0, groundA); g.addColorStop(1, '#06080a');
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
    // grid
    c.strokeStyle = 'rgba(255,255,255,0.025)'; c.lineWidth = 1;
    for (let x = 0; x < this.W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, this.H); c.stroke(); }
    for (let y = 0; y < this.H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(this.W, y); c.stroke(); }
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
    // kerbs
    trace(); c.strokeStyle = '#d8d8d8'; c.lineWidth = tw + 5; c.stroke();
    trace(); c.setLineDash([7, 7]); c.strokeStyle = '#d0181c'; c.lineWidth = tw + 5; c.stroke(); c.setLineDash([]);
    trace(); c.strokeStyle = '#2b2f37'; c.lineWidth = tw; c.stroke();
    trace(); c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = tw * 0.3; c.stroke();
    // pit lane
    const pl = [];
    for (let p = -0.04; p <= 0.04; p += 0.004) { const q = this.pointAt(p); pl.push([q.x + Math.cos(q.ang + Math.PI / 2) * (tw + 10), q.y + Math.sin(q.ang + Math.PI / 2) * (tw + 10)]); }
    c.beginPath(); pl.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = '#1e2128'; c.lineWidth = 8; c.stroke();
    c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,176,32,0.5)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    this.pitPos = (k) => { const q = this.pointAt(-0.03 + (k % 12) * 0.005); return { x: q.x + Math.cos(q.ang + Math.PI / 2) * (tw + 10), y: q.y + Math.sin(q.ang + Math.PI / 2) * (tw + 10), ang: q.ang }; };
    // start line (chequered)
    const s = this.pointAt(0);
    c.save(); c.translate(s.x, s.y); c.rotate(s.ang + Math.PI / 2);
    const sq = tw / 4;
    for (let i = -2; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#000'; c.fillRect(i * sq, j * sq - sq, sq, sq); }
    c.restore();
    this.tw = tw;
  }
  drawCar(x, y, ang, col1, col2, opts = {}) {
    const c = this.ctx;
    const L = opts.len || Math.max(10, (this.tw || 16) * 0.85);
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
    if (opts.label) {
      c.font = '800 10.5px Exo 2'; c.textAlign = 'center';
      const tw = c.measureText(opts.label).width + 8;
      c.fillStyle = opts.labelBg || 'rgba(0,0,0,0.75)'; roundRect(c, x - tw / 2, y - L - 14, tw, 14, 4); c.fill();
      c.fillStyle = '#fff'; c.fillText(opts.label, x, y - L - 3.5);
    }
  }
  frame(drawFn, { rain = 0, night = 0, t = 0 } = {}) {
    const c = this.ctx;
    if (!this.W) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawFn?.(c, this);
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
