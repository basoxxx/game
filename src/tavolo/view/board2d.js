// Tavolo Baso — 2D fallback of the 8x8 board (Bassa quality or WebGL missing): a canvas with the same API as
// Board3D (setPieces with animated slides and hops, marks, side, quads for the cell overlay, drag), vector
// piece silhouettes drawn in the colours of the chosen set.
export const SIL = {
  P: 'M50 18a13 13 0 0 1 9 22.5c6 3 9 8 9 12.5h-8c1 9 6 17 14 24v7H26v-7c8-7 13-15 14-24h-8c0-4.5 3-9.5 9-12.5A13 13 0 0 1 50 18z',
  R: 'M27 20h10v8h7v-8h12v8h7v-8h10v18l-8 6v26l8 7v6H27v-6l8-7V44l-8-6z',
  B: 'M50 12a6 6 0 0 1 4 10.5c10 6 16 16 14 27-1 6-5 10-9 12 3 6 8 11 15 15v7H26v-7c7-4 12-9 15-15-4-2-8-6-9-12-2-11 4-21 14-27A6 6 0 0 1 50 12zm-2 20v8h-6v5h6v8h5v-8h6v-5h-6v-8z',
  N: 'M30 83v-7c3-6 8-10 10-16-6 2-12 5-16 3-4-2-5-7-3-11 6-9 12-17 17-24l2-8 6 5c13 0 26 8 29 26 2 11 0 22-2 32z',
  Q: 'M50 10a6 6 0 1 1 0 12 6 6 0 1 1 0-12zM18 30a5 5 0 1 1 0 10 5 5 0 1 1 0-10zm64 0a5 5 0 1 1 0 10 5 5 0 1 1 0-10zM33 24a5 5 0 1 1 0 10 5 5 0 1 1 0-10zm34 0a5 5 0 1 1 0 10 5 5 0 1 1 0-10zM20 40l10 30h40l10-30-14 14-6-24-10 22-10-22-6 24zM28 72h44v6H28zm-4 7h52v6H24z',
  K: 'M47 8h6v7h7v6h-7v8c13 1 26 7 26 19 0 9-6 17-11 22H32c-5-5-11-13-11-22 0-12 13-18 26-19v-8h-7v-6h7zM28 74h44v5H28zm-4 6h52v6H24z',
};
const P2D = {};
const path = (t) => (P2D[t] ||= new Path2D(SIL[t]));
const reduce = () => document.documentElement.classList.contains('reduce-motion');
const lighten = (hex, k) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k); return `rgb(${r},${g},${b})`; };
const darken = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round((n >> 16) * (1 - k))},${Math.round(((n >> 8) & 255) * (1 - k))},${Math.round((n & 255) * (1 - k))})`; };

export function drawPiece2D(g, kind, t, c, x, y, s, set) {
  const col = c ? set.b.c : set.w.c, edge = c ? lighten(col, 0.45) : darken(col, 0.55);
  if (kind === 'dama') {
    const rr = s * 0.4, layers = t === 'k' ? 2 : 1;
    for (let i = 0; i < layers; i++) {
      const yy = y - i * s * 0.1;
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, yy + s * 0.06, rr, rr * 0.92, 0, 0, Math.PI * 2); g.fill();
      const gr = g.createRadialGradient(x - rr * 0.3, yy - rr * 0.3, rr * 0.1, x, yy, rr); gr.addColorStop(0, lighten(col, 0.25)); gr.addColorStop(1, col);
      g.fillStyle = gr; g.beginPath(); g.arc(x, yy, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = edge; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
      g.beginPath(); g.arc(x, yy, rr * 0.66, 0, Math.PI * 2); g.stroke();
    }
    if (t === 'k') { g.fillStyle = edge; g.font = `700 ${Math.round(s * 0.34)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♛', x, y - s * 0.1); }
    return;
  }
  g.save(); g.translate(x - s * 0.5, y - s * 0.5); g.scale(s / 100, s / 100);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.save(); g.translate(3, 4); g.fill(path(t), 'evenodd'); g.restore();
  const gr = g.createLinearGradient(20, 10, 80, 90); gr.addColorStop(0, lighten(col, c ? 0.12 : 0.3)); gr.addColorStop(1, col);
  g.fillStyle = gr; g.fill(path(t), 'evenodd');
  g.strokeStyle = edge; g.lineWidth = 3.2; g.lineJoin = 'round'; g.stroke(path(t));
  if (t === 'N') { g.fillStyle = edge; g.beginPath(); g.arc(48, 38, 3.2, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

export class Board2D {
  constructor(canvas, { kind = 'chess', theme, set, coords = true, side = 0, flat = false }) {
    this.canvas = canvas; this.g = canvas.getContext('2d'); this.kind = kind; this.theme = theme; this.set = set; this.coords = coords; this.side = side; this.flat = flat;
    this.pieces = new Map(); this.marks = {}; this.anims = []; this.dirty = true; this.w = 0; this.h = 0;
    this.loop = this.loop.bind(this); this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
    this.stage = { dirty: false, flush: () => this.flush() };
  }
  geometry() {
    const w = this.w, h = this.h, s = Math.floor(Math.min(w, h) / 8.9), ox = Math.round((w - s * 8) / 2), oy = Math.round((h - s * 8) / 2);
    return { s, ox, oy };
  }
  // board square → canvas px (top-left of the square)
  xy(f, r) { const { s, ox, oy } = this.geometry(); const vf = this.side ? 7 - f : f, vr = this.side ? r : 7 - r; return [ox + vf * s, oy + vr * s]; }
  resize() {
    const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1, dpr = Math.min(2, devicePixelRatio || 1);
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); this.g.setTransform(dpr, 0, 0, dpr, 0, 0); this.dirty = true;
    return true;
  }
  setPieces(list, { paths = {}, instant = false } = {}) {
    const seen = new Set(), jobs = [];
    let moverDur = 0;
    for (const p of list) {
      seen.add(p.id);
      const cur = this.pieces.get(p.id);
      if (!cur) { this.pieces.set(p.id, { ...p, x: p.s[0], y: p.s[1], a: instant ? 1 : 0 }); if (!instant) jobs.push(this.animate(0.25, (k) => { this.pieces.get(p.id).a = k; })); continue; }
      const from = [cur.x, cur.y];
      const pts = (paths[p.id] || [cur.s, p.s]).map((q) => q.slice()); pts[0] = from;
      Object.assign(cur, { t: p.t, c: p.c, s: p.s, gone: false });
      if (!instant && (from[0] !== p.s[0] || from[1] !== p.s[1])) {
        const segs = pts.length - 1, dur = 0.24 * segs + 0.06; moverDur = Math.max(moverDur, dur);
        jobs.push(this.animate(dur, (k) => { const fk = k * segs, i = Math.min(segs - 1, Math.floor(fk)), t = fk - i, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; cur.x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * e; cur.y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * e; cur.lift = Math.sin(t * Math.PI) * 0.15; }).then(() => { cur.x = p.s[0]; cur.y = p.s[1]; cur.lift = 0; }));
      } else { cur.x = p.s[0]; cur.y = p.s[1]; }
    }
    for (const [id, q] of this.pieces) {
      if (seen.has(id)) continue;
      if (instant) { this.pieces.delete(id); continue; }
      q.gone = true;
      jobs.push(new Promise((r) => setTimeout(r, moverDur * 600)).then(() => this.animate(0.25, (k) => { q.a = 1 - k; })).then(() => { if (q.gone) this.pieces.delete(id); }));
    }
    this.dirty = true;
    return Promise.all(jobs);
  }
  reset() { this.pieces.clear(); this.dirty = true; }
  clearTrays() {}
  setMarks(m = {}) { this.marks = m; this.dirty = true; }
  setSide(side) { this.side = side; this.dirty = true; this.onLayout?.(); }
  setFlat(f) { this.flat = f; }
  view() {}
  animate(dur, fn) {
    if (reduce()) dur = Math.min(dur, 0.1);
    return new Promise((res) => { this.anims.push({ t: 0, dur, fn, res }); this.dirty = true; });
  }
  flush() { for (const a of this.anims.splice(0)) { a.fn(1); a.res(); } this.dirty = true; }
  quads() {
    const { s } = this.geometry(), out = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const [x, y] = this.xy(f, r); out.push({ f, r, pts: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]] }); }
    return out;
  }
  pick() { return null; }
  lift(id) { this.drag = this.pieces.get(id) || null; }
  dragTo(cx, cy) {
    const q = this.drag; if (!q) return;
    const r = this.canvas.getBoundingClientRect(), { s, ox, oy } = this.geometry();
    let vf = (cx - r.left - ox) / s - 0.5, vr = (cy - r.top - oy) / s - 0.5;
    q.x = this.side ? 7 - vf : vf; q.y = this.side ? vr : 7 - vr; q.lift = 0.12; this.dirty = true;
  }
  drop() { const q = this.drag; this.drag = null; if (!q) return; const fx = q.x, fy = q.y; this.animate(0.12, (k) => { q.x = fx + (q.s[0] - fx) * k; q.y = fy + (q.s[1] - fy) * k; q.lift = 0.12 * (1 - k); }); }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.resize()) this.onLayout?.();
    if (this.anims.length) { this.dirty = true; for (const a of this.anims.slice()) { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k); if (k >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); } } }
    if (!this.dirty) return;
    this.dirty = false; this.draw();
  }
  draw() {
    const g = this.g, th = this.theme, { s, ox, oy } = this.geometry(), b = s * 0.42;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = th.table; g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = th.frame; g.fillRect(ox - b, oy - b, s * 8 + b * 2, s * 8 + b * 2);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(ox - b, oy - b, s * 8 + b * 2, s * 8 + b * 2);
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const [x, y] = this.xy(f, r), dark = this.kind === 'dama' ? ((f + r) & 1) === 1 : ((f + r) & 1) === 0;
      g.fillStyle = dark ? th.dark : th.light; g.fillRect(x, y, s, s);
    }
    if (this.coords) {
      g.fillStyle = th.ink; g.font = `600 ${Math.round(b * 0.62)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) { const [x] = this.xy(i, 0), [, y] = this.xy(0, i); g.fillText('abcdefgh'[i], x + s / 2, oy + s * 8 + b / 2); g.fillText(String(i + 1), ox - b / 2, y + s / 2); }
    }
    const M = this.marks, sqFill = (sq, col) => { if (!sq) return; const [x, y] = this.xy(sq[0], sq[1]); g.fillStyle = col; g.fillRect(x, y, s, s); };
    for (const q of M.last || []) sqFill(q, 'rgba(255,210,63,.42)');
    for (const q of M.hint || []) sqFill(q, 'rgba(65,224,138,.55)');
    for (const q of M.from || []) sqFill(q, 'rgba(63,200,255,.35)');
    sqFill(M.sel, 'rgba(63,200,255,.55)');
    if (M.check) { const [x, y] = this.xy(M.check[0], M.check[1]); const gr = g.createRadialGradient(x + s / 2, y + s / 2, 0, x + s / 2, y + s / 2, s * 0.6); gr.addColorStop(0, 'rgba(255,40,40,.95)'); gr.addColorStop(1, 'rgba(255,40,40,0)'); g.fillStyle = gr; g.fillRect(x, y, s, s); }
    const list = [...this.pieces.values()].sort((a, c) => (this.side ? a.y - c.y : c.y - a.y));
    for (const q of list) {
      if (q.a <= 0.01) continue;
      const vf = this.side ? 7 - q.x : q.x, vr = this.side ? q.y : 7 - q.y;
      g.globalAlpha = Math.max(0, Math.min(1, q.a));
      drawPiece2D(g, this.kind, q.t, q.c, ox + (vf + 0.5) * s, oy + (vr + 0.5 - (q.lift || 0)) * s, s * 0.92, this.set);
      g.globalAlpha = 1;
    }
    for (const q of M.moves || []) { const [x, y] = this.xy(q[0], q[1]); g.fillStyle = 'rgba(20,30,40,.45)'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.14, 0, Math.PI * 2); g.fill(); }
    for (const q of M.caps || []) { const [x, y] = this.xy(q[0], q[1]); g.strokeStyle = 'rgba(20,30,40,.55)'; g.lineWidth = s * 0.07; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.43, 0, Math.PI * 2); g.stroke(); }
    if (M.cursor) { const [x, y] = this.xy(M.cursor[0], M.cursor[1]); g.strokeStyle = '#ffe066'; g.lineWidth = Math.max(3, s * 0.07); g.strokeRect(x + 2, y + 2, s - 4, s - 4); }
  }
  dispose() { cancelAnimationFrame(this.raf); }
}
