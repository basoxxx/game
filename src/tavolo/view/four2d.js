// Tavolo Baso — 2D Quattro in fila (Bassa quality / no WebGL): same API as Four3D on a canvas.
const reduce = () => document.documentElement.classList.contains('reduce-motion');
export class Four2D {
  constructor(canvas, { theme, set }) {
    this.canvas = canvas; this.g = canvas.getContext('2d'); this.theme = theme; this.set = set;
    this.discs = new Map(); this.anims = []; this.ghost = null; this.win = null; this.t = 0; this.w = 0; this.h = 0; this.dirty = true;
    this.stage = { dirty: false }; this.loop = this.loop.bind(this); this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
  }
  geo() { const s = Math.floor(Math.min(this.w / 7.6, this.h / 7.4)); return { s, ox: Math.round((this.w - s * 7) / 2), oy: Math.round((this.h - s * 6) / 2 + s * 0.45) }; }
  pos(c, r) { const { s, ox, oy } = this.geo(); return [ox + (c + 0.5) * s, oy + (5 - r + 0.5) * s]; }
  resize() { const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1, dpr = Math.min(2, devicePixelRatio || 1); if (w === this.w && h === this.h) return false; this.w = w; this.h = h; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); this.g.setTransform(dpr, 0, 0, dpr, 0, 0); this.dirty = true; return true; }
  animate(dur, fn) { if (reduce()) dur = 0.08; return new Promise((res) => { this.anims.push({ t: 0, dur, fn, res }); this.dirty = true; }); }
  flush() { for (const a of this.anims.splice(0)) { a.fn(1); a.res(); } this.dirty = true; }
  setDiscs(list, { instant = false } = {}) {
    const jobs = [], seen = new Set();
    for (const d of list) {
      seen.add(d.id); if (this.discs.has(d.id)) continue;
      const q = { ...d, y: d.r }; this.discs.set(d.id, q);
      if (!instant) { q.y = 6.6; const dur = 0.25 + (6 - d.r) * 0.06; jobs.push(this.animate(dur, (k) => { const n = 7.5625, dd = 2.75; let e; let t = k; if (t < 1 / dd) e = n * t * t; else if (t < 2 / dd) e = n * (t -= 1.5 / dd) * t + 0.75; else if (t < 2.5 / dd) e = n * (t -= 2.25 / dd) * t + 0.9375; else e = n * (t -= 2.625 / dd) * t + 0.984375; q.y = 6.6 + (d.r - 6.6) * e; })); }
    }
    for (const id of [...this.discs.keys()]) if (!seen.has(id)) this.discs.delete(id);
    this.dirty = true; return Promise.all(jobs);
  }
  setGhost(col, p) { this.ghost = col == null || col < 0 ? null : { col, p }; this.dirty = true; }
  setWin(cells) { this.win = cells ? cells.map(([c, r]) => `${c},${r}`) : null; this.dirty = true; }
  setMarks() {}
  view() {} setFlat() {}
  quads() { const { s, ox, oy } = this.geo(), out = []; for (let c = 0; c < 7; c++) { const x = ox + c * s; out.push({ c, pts: [[x, oy - s * 1.2], [x + s, oy - s * 1.2], [x + s, oy + s * 6], [x, oy + s * 6]] }); } return out; }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.25, (now - this.last) / 1000); this.last = now;
    if (this.resize()) this.onLayout?.();
    if (this.anims.length) { this.dirty = true; for (const a of this.anims.slice()) { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k); if (k >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); } } }
    if (this.win) { this.t += dt; this.dirty = true; }
    if (!this.dirty) return; this.dirty = false; this.draw();
  }
  draw() {
    const g = this.g, { s, ox, oy } = this.geo(), th = this.theme;
    g.fillStyle = th.table; g.fillRect(0, 0, this.w, this.h);
    const disc = (x, y, col, a = 1, glow = 0) => { g.globalAlpha = a; const r = s * 0.42; const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); gr.addColorStop(0, '#ffffff55'); gr.addColorStop(0.25, col); gr.addColorStop(1, col); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * (1 + glow * 0.05), 0, Math.PI * 2); g.fill(); if (glow) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); } g.globalAlpha = 1; };
    if (this.ghost) { const [x] = this.pos(this.ghost.col, 0); disc(x, oy - s * 0.6, this.set.discs[this.ghost.p - 1], 0.5); }
    for (const q of this.discs.values()) { const [x] = this.pos(q.c, 0), y = oy + (5 - q.y + 0.5) * s; const w = this.win?.includes(`${q.c},${q.r}`); disc(x, y, this.set.discs[q.p - 1], 1, w ? 1 + Math.sin(this.t * 6) : 0); }
    // the frame with holes drawn over the discs
    g.save(); g.beginPath(); g.rect(ox - s * 0.25, oy - s * 0.1, s * 7.5, s * 6.2);
    for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) { const [x, y] = this.pos(c, r); g.moveTo(x + s * 0.42, y); g.arc(x, y, s * 0.42, 0, Math.PI * 2, true); }
    g.fillStyle = th.frame; g.fill('nonzero'); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.stroke(); g.restore();
  }
  dispose() { cancelAnimationFrame(this.raf); }
}
