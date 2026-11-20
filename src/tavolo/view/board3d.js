// Tavolo Baso — 3D 8x8 board for chess and draughts: inlaid board on a wooden table, turned pieces, square
// marks (last move, selection, targets, check, hint, cursor), smooth hops and slides, captured pieces lined
// up beside the board, drag with the pointer and a camera that turns to the side to move or looks from above.
import { THREE, ease, boardTopTexture, materialTexture, radialTexture, ringTexture, chessGeometry, damaGeometry, pieceMaterial, paintMaterial } from './kit3d.js';

const SQ = (f, r) => [f - 3.5, 3.5 - r];
const MARK_COL = { last: ['#ffd23f', 0.32], sel: ['#3fc8ff', 0.5], hint: ['#41e08a', 0.5], from: ['#3fc8ff', 0.3] };
function squareOutline() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 12; g.strokeRect(8, 8, 112, 112);
  return new THREE.CanvasTexture(c);
}
let DOT = null;
function dotTexture() {
  if (DOT) return DOT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  return (DOT = new THREE.CanvasTexture(c));
}
export class Board3D {
  constructor(stage, { kind = 'chess', theme, set, coords = true, flat = false, side = 0 }) {
    this.stage = stage; this.kind = kind; this.theme = theme; this.set = set; this.coords = coords; this.flat = flat; this.side = side;
    this.root = new THREE.Group(); stage.scene.add(this.root);
    this.pieces = new Map(); this.geo = {}; this.mats = []; this.marks = []; this.trays = [0, 0];
    this.seg = stage.tier === 'high' ? 40 : stage.tier === 'med' ? 28 : 18;
    this.markGeo = new THREE.PlaneGeometry(1, 1); this.markGeo.rotateX(-Math.PI / 2);
    this.outlineTex = squareOutline();
    this.buildBoard(); this.buildMaterials();
    stage.views.push(this);
    this.layoutKey = '';
  }
  buildBoard() {
    const th = this.theme, border = 0.6, tot = 8 + border * 2;
    const top = boardTopTexture(th, { coords: this.coords, darkOnly: this.kind === 'dama', size: this.stage.tier === 'low' ? 512 : 1024 });
    const side = new THREE.MeshStandardMaterial({ map: materialTexture(th.frame, th.mat === 'marble' ? 'marble' : 'wood', 256, 4), roughness: th.mat === 'marble' ? 0.25 : 0.5 });
    const topM = new THREE.MeshPhysicalMaterial({ map: top, roughness: th.mat === 'marble' ? 0.18 : th.mat === 'flat' ? 0.55 : 0.32, clearcoat: th.mat === 'flat' ? 0 : 0.6, clearcoatRoughness: 0.18 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(tot, 0.34, tot), [side, side, topM, side, side, side]);
    box.position.y = -0.17; box.receiveShadow = true; box.castShadow = true;
    this.root.add(box); this.board = box;
    // a felt underlay a little larger than the board
    const felt = new THREE.Mesh(new THREE.BoxGeometry(tot + 0.3, 0.02, tot + 0.3), new THREE.MeshStandardMaterial({ color: th.felt, roughness: 0.95 }));
    felt.position.y = -0.345; this.root.add(felt);
  }
  buildMaterials() {
    for (const m of this.mats) m.dispose();
    this.mats = [pieceMaterial(this.set, 0, this.stage.tier), pieceMaterial(this.set, 1, this.stage.tier)];
    this.shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,.6)'), transparent: true, depthWrite: false, opacity: 0.8 });
  }
  geom(t) {
    if (this.geo[t]) return this.geo[t];
    return (this.geo[t] = this.kind === 'dama' ? damaGeometry(this.seg) : chessGeometry(t, this.seg));
  }
  makePiece(p) {
    const g = new THREE.Group();
    const add = (y = 0) => { const m = new THREE.Mesh(this.geom(this.kind === 'dama' ? 'm' : p.t), this.mats[p.c]); m.castShadow = true; m.receiveShadow = true; m.position.y = y; g.add(m); return m; };
    add();
    if (this.kind === 'dama' && p.t === 'k') add(0.125);
    if (this.kind === 'chess' && p.t === 'N') g.children[0].rotation.y = p.c ? Math.PI * 0.25 : -Math.PI * 0.75;
    const sh = new THREE.Mesh(this.markGeo, this.shadowMat); sh.scale.setScalar(this.kind === 'dama' ? 1.05 : 0.95); sh.position.y = 0.003; sh.renderOrder = 1; g.add(sh);
    g.userData = { ...p };
    this.root.add(g);
    return g;
  }
  rebuildPiece(g, p) {
    // type changed (promotion, crowning): rebuild the meshes inside the same group
    for (const ch of [...g.children]) if (ch.material !== this.shadowMat) g.remove(ch);
    const m = new THREE.Mesh(this.geom(this.kind === 'dama' ? 'm' : p.t), this.mats[p.c]); m.castShadow = true; g.add(m);
    if (this.kind === 'chess' && p.t === 'N') m.rotation.y = p.c ? Math.PI * 0.25 : -Math.PI * 0.75;
    if (this.kind === 'dama' && p.t === 'k') { const m2 = new THREE.Mesh(this.geom('m'), this.mats[p.c]); m2.castShadow = true; m2.position.y = 0.125; g.add(m2); return m2; }
    return m;
  }
  // list: [{ id, t, c, s:[f,r] }]; anim: { paths: { id: [[f,r]...] }, instant }
  setPieces(list, { paths = {}, instant = false } = {}) {
    const S = this.stage, seen = new Set(), jobs = [];
    let moverDur = 0;
    for (const p of list) {
      seen.add(p.id);
      let g = this.pieces.get(p.id);
      const [x, z] = SQ(p.s[0], p.s[1]);
      if (!g) {
        g = this.makePiece(p); this.pieces.set(p.id, g); g.position.set(x, 0, z);
        if (!instant) { g.scale.setScalar(0.01); jobs.push(S.animate(0.3, (k) => g.scale.setScalar(Math.max(0.01, k)), ease.out)); }
        continue;
      }
      const u = g.userData, moved = u.s[0] !== p.s[0] || u.s[1] !== p.s[1] || g.position.y > 0.01 || u.tray;
      const typeChanged = u.t !== p.t;
      if (u.tray) { u.tray = false; this.trays[u.c] = Math.max(0, this.trays[u.c] - 1); g.scale.setScalar(1); }
      if (moved && !instant) {
        const path = (paths[p.id] || [u.s, p.s]).map(([f, r]) => SQ(f, r));
        path[0] = [g.position.x, g.position.z];
        const knight = p.t === 'N';
        const segs = path.length - 1, per = this.kind === 'dama' ? 0.3 : knight ? 0.42 : Math.min(0.5, 0.22 + Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) * 0.04);
        const y0 = g.position.y, total = per * segs;
        moverDur = Math.max(moverDur, total);
        jobs.push(S.animate(total, (k) => {
          const fk = k * segs, i = Math.min(segs - 1, Math.floor(fk)), t = fk - i, a = path[i], b = path[i + 1];
          const e = ease.io(t), dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
          g.position.x = a[0] + (b[0] - a[0]) * e; g.position.z = a[1] + (b[1] - a[1]) * e;
          const arc = this.kind === 'dama' ? 0.55 : knight ? 0.9 : 0.12 + dist * 0.05;
          g.position.y = (i === 0 ? y0 * (1 - t) : 0) + Math.sin(t * Math.PI) * arc;
        }, ease.lin).then(() => { g.position.set(x, 0, z); }));
      } else g.position.set(x, 0, z);
      if (typeChanged) {
        const delay = instant ? 0 : moverDur;
        const doIt = () => { const m = this.rebuildPiece(g, p); if (!instant) { m.scale.setScalar(0.01); S.animate(0.35, (k) => m.scale.setScalar(Math.max(0.01, k)), ease.out); } };
        if (delay) setTimeout(doIt, delay * 1000); else doIt();
      }
      g.userData = { ...p };
    }
    // captured: off to the tray beside the board
    for (const [id, g] of this.pieces) {
      if (seen.has(id) || g.userData.tray) continue;
      const c = g.userData.c, n = this.trays[c]++, side = c === 1 ? 1 : -1;
      const tx = side * (5.4 + Math.floor(n / 8) * 0.62), tz = side * (3.6 - (n % 8) * 0.9) * (this.kind === 'dama' ? 0.95 : 1);
      g.userData.tray = true;
      const sx = g.position.x, sz = g.position.z, sc = this.kind === 'dama' ? 0.8 : 0.62;
      if (instant) { g.position.set(tx, -0.34, tz); g.scale.setScalar(sc); continue; }
      const wait = moverDur * 0.6;
      jobs.push(new Promise((res) => setTimeout(res, wait * 1000)).then(() => S.animate(0.5, (k) => {
        g.position.x = sx + (tx - sx) * k; g.position.z = sz + (tz - sz) * k; g.position.y = Math.sin(k * Math.PI) * 1.2 + (-0.34) * k;
        g.scale.setScalar(1 + (sc - 1) * k);
      })));
    }
    S.dirty = true;
    return Promise.all(jobs);
  }
  clearTrays() { for (const [id, g] of this.pieces) if (g.userData.tray) { this.root.remove(g); this.pieces.delete(id); } this.trays = [0, 0]; }
  reset() { for (const g of this.pieces.values()) this.root.remove(g); this.pieces.clear(); this.trays = [0, 0]; this.stage.dirty = true; }
  // marks: { last:[[f,r],[f,r]], sel:[f,r], moves:[[f,r]], caps:[[f,r]], check:[f,r], hint:[[f,r],[f,r]], cursor:[f,r] }
  setMarks(m = {}) {
    for (const x of this.marks) { this.root.remove(x); x.material.dispose(); }
    this.marks = [];
    const add = (f, r, opts) => {
      const [x, z] = SQ(f, r);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...opts.mat });
      const me = new THREE.Mesh(this.markGeo, mat); me.position.set(x, opts.y || 0.002, z); me.scale.setScalar(opts.s || 1); me.renderOrder = 2;
      this.root.add(me); this.marks.push(me);
    };
    const fill = (sq, key) => sq && add(sq[0], sq[1], { mat: { color: MARK_COL[key][0], opacity: MARK_COL[key][1] } });
    for (const s of m.last || []) fill(s, 'last');
    for (const s of m.hint || []) fill(s, 'hint');
    if (m.sel) fill(m.sel, 'sel');
    if (m.check) add(m.check[0], m.check[1], { mat: { map: radialTexture('rgba(255,40,40,.95)', 'rgba(255,40,40,0)'), opacity: 1 }, s: 1.05 });
    for (const s of m.moves || []) add(s[0], s[1], { mat: { map: dotTexture(), color: '#16222c', opacity: 0.55 }, s: 0.36, y: 0.004 });
    for (const s of m.caps || []) add(s[0], s[1], { mat: { map: ringTexture('#1d2a36'), opacity: 0.6 }, s: 0.98, y: 0.004 });
    for (const s of m.from || []) fill(s, 'from');
    if (m.cursor) add(m.cursor[0], m.cursor[1], { mat: { map: this.outlineTex, color: '#ffe066', opacity: 0.95 }, y: 0.006 });
    this.stage.dirty = true;
  }
  view(dur = 0.9) {
    const S = this.stage, port = S.h > S.w * 1.1;
    const pitch = this.flat ? Math.PI / 2 - 0.001 : port ? 1.12 : 0.92;
    const pts = [];
    for (const x of [-4.7, 4.7]) for (const z of [-4.7, 4.7]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x * 0.95, 1.0, z * 0.95)); }
    S.frame({ target: [0, 0, this.flat ? 0 : 0.25], yaw: this.side ? Math.PI : 0, pitch, pts, margin: port ? 0.97 : 0.94 }, dur);
  }
  setSide(side, dur = 0.9) { this.side = side; this.view(dur); }
  setFlat(f) { this.flat = f; this.view(0.6); }
  onResize() { this.view(0); }
  // projected quads of the 64 squares (screen px within the canvas)
  quads() {
    const S = this.stage, out = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const [x, z] = SQ(f, r);
      out.push({ f, r, pts: [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]].map(([a, b]) => S.project(a, 0, b)) });
    }
    return out;
  }
  afterRender() {
    const e = this.stage.camera.matrixWorld.elements, k = e.map((v) => v.toFixed(3)).join(',') + this.stage.w + 'x' + this.stage.h;
    if (k !== this.layoutKey) { this.layoutKey = k; this.onLayout?.(); }
  }
  // the square of the piece under the pointer (pieces stick up out of their squares)
  pick(cx, cy) {
    const S = this.stage, r = S.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), S.camera);
    const meshes = []; for (const g of this.pieces.values()) if (!g.userData.tray) for (const ch of g.children) if (ch.material !== this.shadowMat) meshes.push(ch);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const g = hit.object.parent; return g.userData.s;
  }
  lift(id) { const g = this.pieces.get(id); if (!g) return; this.drag = g; }
  dragTo(cx, cy) {
    const g = this.drag; if (!g) return;
    const p = this.stage.pointOnPlane(cx, cy, 0.35);
    g.position.set(Math.max(-4.4, Math.min(4.4, p.x)), 0.35, Math.max(-4.4, Math.min(4.4, p.z))); this.stage.dirty = true;
  }
  drop() {
    const g = this.drag; this.drag = null; if (!g) return;
    const [x, z] = SQ(g.userData.s[0], g.userData.s[1]), sx = g.position.x, sz = g.position.z, sy = g.position.y;
    if (sy < 0.01) return;
    this.stage.animate(0.18, (k) => { g.position.set(sx + (x - sx) * k, sy * (1 - k), sz + (z - sz) * k); }, ease.out);
  }
  dispose() {
    this.stage.views.splice(this.stage.views.indexOf(this), 1);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of this.mats) m.dispose();
    this.markGeo.dispose(); this.outlineTex.dispose();
    this.stage.scene.remove(this.root);
  }
}
void paintMaterial;
