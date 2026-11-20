// Tavolo Baso — 2D Battaglia navale (Bassa quality / no WebGL): same API as Sea3D on a canvas.
import { shipCells } from '../navale/core.js';
const N = 10;
const reduce = () => document.documentElement.classList.contains('reduce-motion');
export class Sea2D {
  constructor(canvas, { theme }) {
    this.canvas = canvas; this.g = canvas.getContext('2d'); this.theme = theme;
    this.ships = [[], []]; this.shots = [new Int8Array(100), new Int8Array(100)]; this.fxs = []; this.mode = 'battle'; this.cursor = null;
    this.w = 0; this.h = 0; this.dirty = true; this.stage = { dirty: false };
    this.loop = this.loop.bind(this); this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
  }
  vis(gi) { return this.mode === 'battle' || (this.mode === 'place' ? gi === 0 : gi === 1); }
  geo(gi) {
    const port = this.h > this.w * 1.05, two = this.mode === 'battle';
    const cols = two && !port ? 2 : 1, rows = two && port ? 2 : 1;
    const s = Math.floor(Math.min(this.w / (cols * 11.4), this.h / (rows * 11.4)));
    const slot = two ? (port ? (gi === 1 ? 0 : 1) : gi) : 0;
    const bw = s * 11.2, gapX = (this.w - cols * bw) / (cols + 1), gapY = (this.h - rows * bw) / (rows + 1);
    const ox = gapX + (port ? 0 : slot) * (bw + gapX) + s * 0.6, oy = gapY + (port ? slot : 0) * (bw + gapY) + s * 0.6;
    return { s, ox, oy };
  }
  resize() { const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1, dpr = Math.min(2, devicePixelRatio || 1); if (w === this.w && h === this.h) return false; this.w = w; this.h = h; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); this.g.setTransform(dpr, 0, 0, dpr, 0, 0); this.dirty = true; return true; }
  setLayout(mode) { this.mode = mode; this.dirty = true; this.onLayout?.(); }
  view() {} setFlat() {}
  setShips(gi, list) { this.ships[gi] = list.map((s) => ({ ...s })); this.dirty = true; }
  setShots(gi, shots) { this.shots[gi] = shots.slice(); this.dirty = true; }
  fx(gi, x, y, kind) { if (reduce()) return; this.fxs.push({ gi, x, y, kind, t: 0 }); this.dirty = true; }
  setMarks({ cursor = null } = {}) { this.cursor = cursor; this.dirty = true; }
  flush() { this.fxs = []; this.dirty = true; }
  quads() {
    const out = [];
    for (const gi of [0, 1]) { if (!this.vis(gi)) continue; const { s, ox, oy } = this.geo(gi); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = ox + x * s, b = oy + y * s; out.push({ id: `${gi}:${x},${y}`, pts: [[a, b], [a + s, b], [a + s, b + s], [a, b + s]] }); } }
    return out;
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.25, (now - this.last) / 1000); this.last = now;
    if (this.resize()) this.onLayout?.();
    if (this.fxs.length) { this.dirty = true; for (const f of this.fxs) f.t += dt; this.fxs = this.fxs.filter((f) => f.t < 0.7); }
    if (!this.dirty) return; this.dirty = false; this.draw();
  }
  draw() {
    const g = this.g, th = this.theme;
    g.fillStyle = th.table; g.fillRect(0, 0, this.w, this.h);
    for (const gi of [0, 1]) {
      if (!this.vis(gi)) continue;
      const { s, ox, oy } = this.geo(gi);
      g.fillStyle = th.frame; g.fillRect(ox - s * 0.6, oy - s * 0.6, s * 11.2, s * 11.2);
      const gr = g.createLinearGradient(ox, oy, ox + s * 10, oy + s * 10); gr.addColorStop(0, gi ? '#1b5a86' : '#1d6f8c'); gr.addColorStop(1, '#0f3a5e');
      g.fillStyle = gr; g.fillRect(ox, oy, s * 10, s * 10);
      g.strokeStyle = 'rgba(191,230,255,.3)'; g.lineWidth = 1;
      for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(ox + i * s, oy); g.lineTo(ox + i * s, oy + N * s); g.stroke(); g.beginPath(); g.moveTo(ox, oy + i * s); g.lineTo(ox + N * s, oy + i * s); g.stroke(); }
      g.fillStyle = th.ink; g.font = `600 ${Math.round(s * 0.36)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < N; i++) { g.fillText(String(i + 1), ox + (i + 0.5) * s, oy - s * 0.3); g.fillText('ABCDEFGHIJ'[i], ox - s * 0.3, oy + (i + 0.5) * s); }
      for (const sh of this.ships[gi]) {
        const c = shipCells(sh), [x0, y0] = c[0], w = sh.dir ? 1 : sh.len, h = sh.dir ? sh.len : 1;
        g.fillStyle = sh.ghost ? (sh.bad ? 'rgba(255,110,110,.6)' : 'rgba(150,230,255,.6)') : sh.sunk ? '#3b3f44' : '#9aa4ae';
        const r = s * 0.35, x = ox + x0 * s + s * 0.12, y = oy + y0 * s + s * 0.12, W = w * s - s * 0.24, H = h * s - s * 0.24;
        g.beginPath(); g.roundRect ? g.roundRect(x, y, W, H, r) : g.rect(x, y, W, H); g.fill();
        if (!sh.ghost) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + W * 0.35, y + H * 0.35, W * 0.3, H * 0.3); }
        if (sh.sel) { g.strokeStyle = '#ffe066'; g.lineWidth = 3; g.stroke(); }
      }
      const sh = this.shots[gi];
      for (let i = 0; i < N * N; i++) {
        const v = sh[i]; if (!v) continue;
        const x = ox + (i % N + 0.5) * s, y = oy + (((i / N) | 0) + 0.5) * s;
        g.fillStyle = v === 1 ? '#f4f4f0' : v === 2 ? '#ff3b30' : '#7a1a14';
        g.beginPath(); g.arc(x, y, s * (v === 1 ? 0.14 : 0.2), 0, Math.PI * 2); g.fill();
        if (v >= 2) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.stroke(); }
      }
      if (this.cursor?.startsWith(gi + ':')) { const [x, y] = this.cursor.split(':')[1].split(',').map(Number); g.strokeStyle = '#ffe066'; g.lineWidth = 3; g.strokeRect(ox + x * s + 2, oy + y * s + 2, s - 4, s - 4); }
      for (const f of this.fxs) if (f.gi === gi) { const k = f.t / 0.7; g.strokeStyle = f.kind === 'miss' ? `rgba(220,245,255,${1 - k})` : `rgba(255,170,60,${1 - k})`; g.lineWidth = 3; g.beginPath(); g.arc(ox + (f.x + 0.5) * s, oy + (f.y + 0.5) * s, s * (0.2 + k * 0.9), 0, Math.PI * 2); g.stroke(); }
    }
  }
  dispose() { cancelAnimationFrame(this.raf); }
}
