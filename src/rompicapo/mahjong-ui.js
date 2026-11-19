// Rompicapo · Mahjong solitario — the live table on a canvas: stacked tiles with original faces,
// free-tile shading, selection, hints that keep the game solvable, undo, solvable shuffles, combos.
// Input: tap/click, keyboard (frecce scelgono una tessera libera, Invio la prende, H, Z, M) and gamepad.
import { deal, LAYOUT, FACES, isFree, moves, matches, hintMove, reshuffle, updatePlan, freeList } from './mahjong.js';
import { Shell, Clock } from './shell.js';
import { snd } from './sound.js';
import { padPoll, rm } from './fx.js';
import { THEME } from './meta.js';
import { fmtT } from './util.js';
import { ico } from './sudoku-ui.js';

const DEPTH = 0.11; // layer lift, in tile widths
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ------------------------------------------------------------------ face art (drawn once per size)
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]], 7: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]], 8: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]], 9: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] };
const SUITC = { sole: ['#ff9d1c', '#e0441b'], goccia: ['#3aa0ff', '#1a4fb8'], foglia: ['#46c35a', '#1d7a3a'] };
function sun(g, x, y, r, c) { g.fillStyle = c[0]; g.strokeStyle = c[1]; g.lineWidth = Math.max(1, r * 0.25); g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.moveTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05); g.lineTo(x + Math.cos(a) * r * 1.55, y + Math.sin(a) * r * 1.55); } g.stroke(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff6'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fill(); }
function drop(g, x, y, r, c) { const gr = g.createLinearGradient(x, y - r * 1.5, x, y + r); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr; g.beginPath(); g.moveTo(x, y - r * 1.55); g.bezierCurveTo(x + r * 0.5, y - r * 0.6, x + r * 1.05, y - r * 0.1, x + r * 1.05, y + r * 0.25); g.arc(x, y + r * 0.25, r * 1.05, 0, Math.PI); g.bezierCurveTo(x - r * 1.05, y - r * 0.1, x - r * 0.5, y - r * 0.6, x, y - r * 1.55); g.fill(); g.fillStyle = '#fff8'; g.beginPath(); g.ellipse(x - r * 0.4, y + r * 0.1, r * 0.22, r * 0.38, -0.4, 0, Math.PI * 2); g.fill(); }
function leaf(g, x, y, r, c, rot = -0.6) { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c[0]; g.beginPath(); g.moveTo(0, -r * 1.4); g.quadraticCurveTo(r * 1.2, 0, 0, r * 1.4); g.quadraticCurveTo(-r * 1.2, 0, 0, -r * 1.4); g.fill(); g.strokeStyle = c[1]; g.lineWidth = Math.max(1, r * 0.18); g.beginPath(); g.moveTo(0, -r * 1.2); g.lineTo(0, r * 1.5); g.stroke(); g.restore(); }
function gem(g, x, y, r, c) { g.fillStyle = c[0]; g.beginPath(); g.moveTo(x - r, y - r * 0.4); g.lineTo(x - r * 0.5, y - r); g.lineTo(x + r * 0.5, y - r); g.lineTo(x + r, y - r * 0.4); g.lineTo(x, y + r * 1.1); g.closePath(); g.fill(); g.fillStyle = c[1]; g.beginPath(); g.moveTo(x - r, y - r * 0.4); g.lineTo(x + r, y - r * 0.4); g.lineTo(x, y + r * 1.1); g.closePath(); g.fill(); g.fillStyle = '#fff9'; g.beginPath(); g.moveTo(x - r * 0.5, y - r); g.lineTo(x - r * 0.1, y - r * 0.4); g.lineTo(x - r * 0.75, y - r * 0.4); g.closePath(); g.fill(); }
function flower(g, x, y, r, c1, c2) { g.fillStyle = c1; for (let k = 0; k < 5; k++) { const a = (k * 2 * Math.PI) / 5 - Math.PI / 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.55, r * 0.38, a, 0, Math.PI * 2); g.fill(); } g.fillStyle = c2; g.beginPath(); g.arc(x, y, r * 0.42, 0, Math.PI * 2); g.fill(); }
function snow(g, x, y, r) { g.strokeStyle = '#3aa8e0'; g.lineWidth = Math.max(1.2, r * 0.18); g.lineCap = 'round'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; const ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r; g.moveTo(x, y); g.lineTo(ex, ey); const bx = x + Math.cos(a) * r * 0.6, by = y + Math.sin(a) * r * 0.6; g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + 0.7) * r * 0.3, by + Math.sin(a + 0.7) * r * 0.3); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a - 0.7) * r * 0.3, by + Math.sin(a - 0.7) * r * 0.3); } g.stroke(); }
export function drawFace(g, f, w, h) {
  const F = FACES[f], font = 'system-ui, sans-serif';
  if (F.kind === 'suit') {
    const c = SUITC[F.suit], cols = 3, cw = (w * 0.78) / cols, ch = (h * 0.74) / 3, r = Math.min(cw, ch) * (F.n === 1 ? 0.62 : 0.3);
    const pts = PIPS[F.n];
    for (const [px, py] of pts) {
      const x = w * 0.11 + cw * (px + 0.5), y = h * 0.16 + ch * (py + 0.5);
      if (F.suit === 'sole') sun(g, x, y, r * (F.n === 1 ? 0.75 : 1), c); else if (F.suit === 'goccia') drop(g, x, y + r * 0.2, r * 0.95, c); else leaf(g, x, y, r * 1.05, c, F.n === 1 ? -0.4 : (px - 1) * 0.5);
    }
    g.fillStyle = c[1]; g.font = `800 ${Math.round(h * 0.2)}px ${font}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(String(F.n), w * 0.07, h * 0.04);
  } else if (F.kind === 'vento') {
    const cx = w / 2, cy = h * 0.54, r = Math.min(w, h) * 0.34;
    g.strokeStyle = '#33405e'; g.lineWidth = Math.max(1, r * 0.08); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.save(); g.translate(cx, cy); g.rotate((F.n * Math.PI) / 2);
    g.fillStyle = '#d23a3a'; g.beginPath(); g.moveTo(0, -r * 0.95); g.lineTo(r * 0.3, 0); g.lineTo(-r * 0.3, 0); g.closePath(); g.fill();
    g.fillStyle = '#33405e'; g.beginPath(); g.moveTo(0, r * 0.95); g.lineTo(r * 0.3, 0); g.lineTo(-r * 0.3, 0); g.closePath(); g.fill(); g.restore();
    g.fillStyle = '#d23a3a'; g.font = `900 ${Math.round(h * 0.2)}px ${font}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('NESO'[F.n], w * 0.07, h * 0.04);
  } else if (F.kind === 'gemma') {
    const c = [['#ff4d6d', '#b3123a'], ['#2fd36b', '#13834a'], ['#3a7bff', '#1a3fae']][F.n];
    gem(g, w / 2, h * 0.5, Math.min(w, h) * 0.32, c);
  } else if (F.kind === 'fiore') {
    const c = [['#ff5d8f', '#ffd23f'], ['#f5f0ff', '#ffb02e'], ['#ffc928', '#7a4a1a'], ['#b35cff', '#ffe36b']][F.n];
    g.strokeStyle = '#2f9a48'; g.lineWidth = Math.max(1.5, w * 0.05); g.beginPath(); g.moveTo(w / 2, h * 0.5); g.quadraticCurveTo(w * 0.55, h * 0.72, w / 2, h * 0.9); g.stroke();
    leaf(g, w * 0.62, h * 0.74, w * 0.09, ['#46c35a', '#1d7a3a'], 0.9);
    flower(g, w / 2, h * 0.42, Math.min(w, h) * 0.26, c[0], c[1]);
    if (F.n === 1) { g.strokeStyle = '#d8cfe8'; g.lineWidth = 1; g.beginPath(); g.arc(w / 2, h * 0.42, Math.min(w, h) * 0.3, 0, Math.PI * 2); g.stroke(); }
  } else {
    const cx = w / 2, cy = h * 0.5, r = Math.min(w, h) * 0.3;
    if (F.n === 0) { flower(g, cx, cy - r * 0.1, r * 0.75, '#ffb3d1', '#ffd23f'); leaf(g, cx - r * 0.7, cy + r * 0.9, r * 0.35, ['#7fdc5a', '#3a9a2a'], -0.9); }
    else if (F.n === 1) sun(g, cx, cy, r * 0.75, ['#ffd23f', '#ff8a1c']);
    else if (F.n === 2) leaf(g, cx, cy, r * 0.95, ['#ff8a3d', '#a8431a'], 0.6);
    else snow(g, cx, cy, r);
    g.fillStyle = ['#d64d8a', '#e08a12', '#b3521f', '#2a7fb8'][F.n]; g.font = `800 ${Math.round(h * 0.15)}px ${font}`; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('PEAI'[F.n], w * 0.93, h * 0.97);
  }
}

export class MahjongGame {
  constructor(root, o) {
    this.o = o; const P = o.params;
    this.theme = THEME[o.theme] || THEME.notte;
    const L = LAYOUT[P.layout] || LAYOUT.quadrato; this.L = L;
    this.sh = new Shell(root, { game: 'mahjong', title: P.title || `Mahjong · ${L.name}`, sub: P.sub || `${L.n} tessere`, theme: o.theme, onPause: (on) => this.onPause(on) });
    const d = deal(L.id, P.seed || 1); this.d = d; this.pos = d.pos; this.topo = d.topo; this.seed = P.seed || 1;
    if (P.resume) { this.faces = P.resume.faces.slice(); this.present = P.resume.present.slice(); this.hints = P.resume.hints; this.shuffles = P.resume.shuffles; this.clock = new Clock(P.resume.time || 0); this.plan = null; }
    else { this.faces = d.faces.slice(); this.present = d.pos.map(() => true); this.hints = 0; this.shuffles = 0; this.clock = new Clock(0); this.plan = d.order.slice(); }
    this.sel = -1; this.undoStack = []; this.flying = []; this.hintPair = null; this.hintT = 0; this.combo = 0; this.lastMatch = 0; this.kfocus = -1; this.done = false; this.nope = new Map();
    this.order = this.pos.map((_, i) => i).sort((a, b) => this.pos[a][2] - this.pos[b][2] || this.pos[a][0] - this.pos[b][0] || this.pos[a][1] - this.pos[b][1]);
    this.build();
  }
  build() {
    const sh = this.sh;
    sh.wrap.innerHTML = '<canvas class="mj-cv" aria-label="Tavolo del mahjong"></canvas>';
    sh.side.innerHTML = `<div class="mj-tools">
      <button type="button" class="rp-tool" data-t="undo" aria-label="Annulla (Z)">${ico('undo')}<span>Annulla</span></button>
      <button type="button" class="rp-tool" data-t="hint" aria-label="Aiuto (H)">${ico('bulb')}<span>Aiuto</span></button>
      <button type="button" class="rp-tool" data-t="shuffle" aria-label="Mescola (M)">${ico('shuffle')}<span>Mescola</span></button></div>
      <p class="mj-how">Togli coppie di tessere uguali e <b>libere</b>: niente sopra e almeno un lato (destro o sinistro) aperto. Fiori e stagioni vanno in coppia tra loro.</p>`;
    this.cv = sh.wrap.querySelector('canvas'); this.g = this.cv.getContext('2d');
    this.cv.addEventListener('pointerdown', (e) => { const i = this.hit(e.clientX, e.clientY); this.tap(i); });
    sh.side.addEventListener('click', (e) => { const t = e.target.closest('.rp-tool'); if (!t) return; ({ undo: () => this.undo(), hint: () => this.hint(), shuffle: () => this.shuffle() })[t.dataset.t]?.(); });
    sh.onResize = () => this.fit();
    this.fit(); this.hud();
  }
  fit() {
    const r = this.sh.wrap.getBoundingClientRect(), L = this.L, d = Math.min(2, devicePixelRatio || 1);
    const cols = L.w / 2 + L.depth * DEPTH + 0.25, rows = L.h / 2;
    // tile aspect 3:4 (w:h); the lift is DEPTH*tw on both axes
    const tw = Math.max(14, Math.min(r.width / cols, (r.height - 6) / (rows * 1.32 + L.depth * DEPTH + 0.25)));
    this.tw = tw; this.th = tw * 1.32; this.lift = tw * DEPTH; this.thick = tw * 0.13; this.dpr = d;
    const W = Math.ceil(cols * tw + 4), Hh = Math.ceil(rows * this.th + (L.depth * DEPTH + 0.25) * tw + 4);
    this.cv.width = W * d; this.cv.height = Hh * d; this.cv.style.width = `${W}px`; this.cv.style.height = `${Hh}px`;
    this.ox = L.depth * this.lift + 2; this.oy = L.depth * this.lift + 2;
    this.faceCache = new Map(); this.draw();
  }
  start() {
    this.clock.start();
    this.unpad = padPoll((b, down) => this.pad(b, down));
    this.t0 = performance.now(); this.raf = requestAnimationFrame((t) => this.loop(t));
    this.tick = setInterval(() => this.hud(), 500);
    window.__rompicapo = this;
    if (!this.o.params.resume) { this.intro = 0; }
  }
  rect(i) { const [x, y, z] = this.pos[i]; return { x: this.ox + (x / 2) * this.tw - z * this.lift, y: this.oy + (y / 2) * this.th - z * this.lift, w: this.tw, h: this.th }; }
  hit(cx, cy) {
    const b = this.cv.getBoundingClientRect(), x = cx - b.left, y = cy - b.top;
    for (let k = this.order.length - 1; k >= 0; k--) { const i = this.order[k]; if (!this.present[i]) continue; const r = this.rect(i); if (x >= r.x && x <= r.x + r.w + this.thick && y >= r.y && y <= r.y + r.h + this.thick) return i; }
    return -1;
  }
  free(i) { return isFree(this.topo, this.present, i); }
  // ---------------------------------------------------------------- actions
  tap(i) {
    if (this.done || this.sh.paused || i < 0) { if (i < 0 && this.sel >= 0) { this.sel = -1; } return; }
    if (!this.free(i)) { snd.nope(); this.nope.set(i, 0.3); return; }
    if (this.sel === i) { this.sel = -1; snd.select(); return; }
    if (this.sel >= 0 && matches(this.faces[this.sel], this.faces[i])) { this.take(this.sel, i); return; }
    this.sel = i; snd.clack(); this.kfocus = i;
  }
  take(a, b) {
    this.undoStack.push({ k: 'pair', a, b, plan: this.plan });
    this.present[a] = this.present[b] = false; this.sel = -1; this.hintPair = null;
    this.plan = updatePlan(this.topo, this.present, this.faces, this.plan, a, b);
    const now = performance.now(); this.combo = now - this.lastMatch < 4000 ? this.combo + 1 : 0; this.lastMatch = now;
    snd.match(this.combo);
    const cb = this.cv.getBoundingClientRect();
    for (const i of [a, b]) { const r = this.rect(i); this.flying.push({ i, f: this.faces[i], r, t: 0 }); this.sh.fx.burst(cb.left + r.x + r.w / 2, cb.top + r.y + r.h / 2, [this.theme.v.acc, this.theme.v.acc2, '#fff'], 12, { speed: 180, size: 3, kind: 'star' }); }
    if (this.combo >= 2) { const r = this.rect(b); this.sh.fx.float(cb.left + r.x + r.w / 2, cb.top + r.y, `Combo ×${this.combo + 1}`, 'big'); }
    this.hud(); this.save(); this.check();
  }
  check() {
    const left = this.present.filter(Boolean).length;
    if (!left) { this.win(); return; }
    if (!moves(this.topo, this.present, this.faces).length) { this.sh.msg('Nessuna coppia libera: mescola le tessere rimaste o annulla.', 'bad', 6000); this.sh.side.querySelector('[data-t="shuffle"]').classList.add('blink'); try { this.o.sfx?.bad(); } catch {} }
  }
  undo() {
    if (this.done) return; const u = this.undoStack.pop(); if (!u) { snd.nope(); return; }
    if (u.k === 'pair') { this.present[u.a] = this.present[u.b] = true; this.plan = u.plan; }
    else { this.faces = u.faces; this.plan = u.plan; }
    this.sel = -1; this.hintPair = null; snd.clack(); this.hud(); this.save();
    this.sh.side.querySelector('[data-t="shuffle"]').classList.remove('blink');
  }
  hint() {
    if (this.done) return;
    const h = hintMove(this.topo, this.present, this.faces, this.plan);
    if (!h) { this.sh.msg('Nessuna coppia libera: mescola le tessere.', 'bad'); snd.nope(); return; }
    if (h.plan) this.plan = h.plan;
    this.hints++; this.hintPair = h.pair; this.hintT = 0; this.sel = -1; snd.sparkle(1); this.hud(); this.save();
    if (h.safe === false) this.sh.msg('Questa è l’unica via d’uscita che trovo: potrebbe servire un rimescolamento.', 'tip');
  }
  shuffle() {
    if (this.done) return;
    const r = reshuffle(this.topo, this.present, this.faces, this.seed + 101 * (this.shuffles + 1) + this.present.filter(Boolean).length);
    if (!r) { snd.nope(); return; }
    this.undoStack.push({ k: 'shuffle', faces: this.faces.slice(), plan: this.plan });
    this.faces = r.faces; this.plan = r.plan; this.shuffles++; this.sel = -1; this.hintPair = null;
    snd.shuffle(); this.spin = 0.5; this.hud(); this.save();
    this.sh.side.querySelector('[data-t="shuffle"]').classList.remove('blink');
    this.sh.msg('Tessere rimescolate: ora c’è di nuovo una soluzione.', '', 2200);
  }
  win() {
    this.done = true; this.clock.stop(); clearInterval(this.tick); this.sh.end(); this.o.onSave?.(null);
    setTimeout(() => this.sh.fx.confetti(160), 200);
    const pen = this.hints + this.shuffles, stars = pen === 0 ? 3 : pen <= 2 ? 2 : 1;
    setTimeout(() => this.o.onEnd({ win: true, time: this.clock.sec, hints: this.hints, shuffles: this.shuffles, stars, tiles: this.L.n, layout: this.L.id }), 1200);
  }
  hud() {
    const left = this.present.filter(Boolean).length, mv = moves(this.topo, this.present, this.faces).length;
    this.sh.chip('t', 'Tempo', fmtT(this.clock.sec));
    this.sh.chip('l', 'Tessere', left);
    this.sh.chip('m', 'Coppie libere', mv, mv ? '' : 'warn');
    this.sh.side.querySelector('[data-t="undo"]').disabled = !this.undoStack.length;
  }
  save() { if (this.done) return; this.o.onSave?.({ layout: this.L.id, seed: this.seed, faces: this.faces.slice(), present: this.present.slice(), hints: this.hints, shuffles: this.shuffles, time: Math.round(this.clock.sec), kind: this.o.params.kind, n: this.o.params.n, key: this.o.params.key }); }
  // ---------------------------------------------------------------- keyboard / pad: hop between free tiles
  hop(dx, dy) {
    const F = freeList(this.topo, this.present); if (!F.length) return;
    const cur = this.kfocus >= 0 && this.present[this.kfocus] ? this.kfocus : -1;
    if (cur < 0) { this.kfocus = F[0]; snd.select(); return; }
    const c = this.rect(cur); let best = -1, bs = Infinity;
    for (const i of F) { if (i === cur) continue; const r = this.rect(i), vx = r.x - c.x, vy = r.y - c.y; const along = vx * dx + vy * dy; if (along <= 2) continue; const side = Math.abs(vx * dy) + Math.abs(vy * dx); const s = along + side * 2.2; if (s < bs) { bs = s; best = i; } }
    if (best >= 0) { this.kfocus = best; snd.select(); }
  }
  onKey(e) {
    if (this.done) return; const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); this.sh.pause(!this.sh.paused); return; }
    if (this.sh.paused) return;
    const ar = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (ar[k]) { e.preventDefault(); this.hop(...ar[k]); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (this.kfocus < 0) this.hop(1, 0); else this.tap(this.kfocus); return; }
    if (k === 'h' || k === 'H') { e.preventDefault(); this.hint(); return; }
    if (k === 'z' || k === 'Z' || k === 'Backspace') { e.preventDefault(); this.undo(); return; }
    if (k === 'm' || k === 'M') { e.preventDefault(); this.shuffle(); }
  }
  pad(b, down) {
    if (!down || this.done) return;
    if (b === 'start') { this.sh.pause(!this.sh.paused); return; }
    if (this.sh.paused) return;
    const ar = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    if (ar[b]) this.hop(...ar[b]); else if (b === 'a') { if (this.kfocus < 0) this.hop(1, 0); else this.tap(this.kfocus); } else if (b === 'y') this.hint(); else if (b === 'b' || b === 'sel') this.undo(); else if (b === 'x') this.shuffle();
  }
  // ---------------------------------------------------------------- drawing
  face(f) {
    let c = this.faceCache.get(f); if (c) return c;
    const d = this.dpr, w = Math.round(this.tw * 0.9 * d), h = Math.round(this.th * 0.9 * d);
    c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    drawFace(g, f, w, h); this.faceCache.set(f, c); return c;
  }
  loop(t) {
    const dt = Math.min(0.05, (t - this.t0) / 1000); this.t0 = t;
    this.flying = this.flying.filter((f) => (f.t += dt) < 0.45);
    for (const [k, v] of this.nope) { if (v - dt <= 0) this.nope.delete(k); else this.nope.set(k, v - dt); }
    this.hintT += dt; if (this.spin) this.spin = Math.max(0, this.spin - dt);
    if (this.intro != null) { this.intro += dt; if (this.intro > 1.4) this.intro = null; }
    this.draw();
    this.raf = requestAnimationFrame((x) => this.loop(x));
  }
  tile(i, r, f, o = {}) {
    const g = this.g, v = this.theme.v, th = this.thick, rad = this.tw * 0.14;
    g.globalAlpha = o.a ?? 1;
    // body (sides) then face
    g.fillStyle = v.back; rr(g, r.x + th * 0.2, r.y + th * 0.2, r.w + th * 0.8, r.h + th * 0.8, rad); g.fill();
    g.fillStyle = v.side; rr(g, r.x, r.y, r.w + th * 0.45, r.h + th * 0.45, rad); g.fill();
    const gr = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h); gr.addColorStop(0, v.face); gr.addColorStop(1, shade(v.face, -0.08));
    g.fillStyle = gr; rr(g, r.x, r.y, r.w, r.h, rad); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.stroke();
    const fc = this.face(f); g.drawImage(fc, r.x + r.w * 0.05, r.y + r.h * 0.05, r.w * 0.9, r.h * 0.9);
    if (o.dim) { g.fillStyle = 'rgba(20,24,40,.22)'; rr(g, r.x, r.y, r.w, r.h, rad); g.fill(); }
    if (o.ring) { g.strokeStyle = o.ring; g.lineWidth = Math.max(2.5, this.tw * 0.08); rr(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad); g.stroke(); }
    if (o.glow) { g.fillStyle = o.glow; rr(g, r.x, r.y, r.w, r.h, rad); g.fill(); }
    g.globalAlpha = 1;
  }
  draw() {
    const g = this.g, d = this.dpr; if (!this.tw) return;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
    const v = this.theme.v, pulse = 0.5 + 0.5 * Math.sin(this.hintT * 7);
    for (const i of this.order) {
      if (!this.present[i]) continue;
      let r = this.rect(i);
      const free = this.free(i);
      if (this.intro != null && !rm()) { const k = Math.min(1, Math.max(0, (this.intro - this.pos[i][2] * 0.12 - (this.pos[i][0] + this.pos[i][1]) * 0.012) / 0.35)); if (k <= 0) continue; r = { ...r, y: r.y - (1 - k) ** 2 * this.th * 0.8 }; }
      if (this.nope.has(i) && !rm()) r = { ...r, x: r.x + Math.sin(this.nope.get(i) * 60) * 3 };
      if (this.spin && !rm()) r = { ...r, y: r.y + Math.sin(this.spin * 20 + i) * 2 };
      const sel = i === this.sel, hint = this.hintPair && this.hintPair.includes(i), kf = i === this.kfocus;
      if (sel) r = { ...r, y: r.y - this.tw * 0.06 };
      this.tile(i, r, this.faces[i], { dim: !free, ring: sel ? v.acc : hint ? `rgba(255,210,63,${0.5 + pulse * 0.5})` : kf ? v.acc2 : null, glow: sel ? 'rgba(255,255,255,.12)' : hint ? `rgba(255,220,90,${0.12 * pulse})` : null });
    }
    for (const f of this.flying) { const p = f.t / 0.45; this.tile(f.i, { ...f.r, y: f.r.y - p * this.th * 0.7, x: f.r.x }, f.f, { a: 1 - p }); }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  onPause(on) { if (on) this.clock.stop(); else this.clock.start(); this.o.onPause?.(on); this.save(); }
  togglePause(on) { this.sh.pause(on); }
  // test hooks
  solveStep() { const h = hintMove(this.topo, this.present, this.faces, this.plan); return h && h.pair; }
  screenOf(i) { const b = this.cv.getBoundingClientRect(), r = this.rect(i); return { x: b.left + r.x + r.w / 2, y: b.top + r.y + r.h / 2 }; }
  destroy() { cancelAnimationFrame(this.raf); clearInterval(this.tick); this.unpad?.(); this.sh.destroy(); if (window.__rompicapo === this) window.__rompicapo = null; }
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; }
