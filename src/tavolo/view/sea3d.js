// Tavolo Baso — 3D Battaglia navale: two sea plates framed in the table's wood (yours and the enemy's), grey
// ships with bows and superstructures that bob on the water, white and red pegs, splashes and explosions.
// Layouts: 'place' (only your sea), 'battle' (both: side by side in landscape, stacked in portrait), 'solo'.
import { THREE, ease, materialTexture, radialTexture } from './kit3d.js';
import { shipCells } from '../navale/core.js';

const N = 10;
function seaTexture(theme, own) {
  const c = document.createElement('canvas'), S = 640, u = S / 11.2; c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, own ? '#1d6f8c' : '#1b5a86'); gr.addColorStop(1, own ? '#0f4560' : '#0f3a5e');
  g.fillStyle = theme.frame; g.fillRect(0, 0, S, S);
  const o = u * 0.6; g.fillStyle = gr; g.fillRect(o, o, u * 10, u * 10);
  // soft wave streaks
  g.globalAlpha = 0.07; g.strokeStyle = '#fff'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const y = o + Math.random() * u * 10, x = o + Math.random() * u * 9; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + u * 0.4, y - u * 0.12, x + u * 0.8, y); g.stroke(); }
  g.globalAlpha = 0.35; g.strokeStyle = '#bfe6ff'; g.lineWidth = 1.5;
  for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(o + i * u, o); g.lineTo(o + i * u, o + 10 * u); g.stroke(); g.beginPath(); g.moveTo(o, o + i * u); g.lineTo(o + 10 * u, o + i * u); g.stroke(); }
  g.globalAlpha = 0.9; g.fillStyle = theme.ink; g.font = `600 ${Math.round(u * 0.36)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) { g.fillText(String(i + 1), o + (i + 0.5) * u, o / 2); g.fillText('ABCDEFGHIJ'[i], o / 2, o + (i + 0.5) * u); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function shipGeometry(len) {
  const L = len * 0.94, W = 0.62, s = new THREE.Shape();
  s.moveTo(-L / 2, -W / 2 * 0.8); s.lineTo(L / 2 - 0.55, -W / 2); s.quadraticCurveTo(L / 2 - 0.05, -W / 4, L / 2, 0); s.quadraticCurveTo(L / 2 - 0.05, W / 4, L / 2 - 0.55, W / 2); s.lineTo(-L / 2, W / 2 * 0.8); s.closePath();
  const hull = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  hull.rotateX(-Math.PI / 2); hull.translate(0, -0.06, 0);
  return hull;
}
export class Sea3D {
  constructor(stage, { theme }) {
    this.stage = stage; this.theme = theme; this.root = new THREE.Group(); stage.scene.add(this.root);
    this.grids = [0, 1].map((i) => this.buildGrid(i));
    this.ships = [new Map(), new Map()]; this.pegs = [new Map(), new Map()]; this.fxs = []; this.t = 0; this.mode = 'battle';
    this.hullGeo = {}; this.hullMat = new THREE.MeshStandardMaterial({ color: '#8e98a3', roughness: 0.55, metalness: 0.35 });
    this.deckMat = new THREE.MeshStandardMaterial({ color: '#6b5847', roughness: 0.8 });
    this.sunkMat = new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: 0.9 });
    this.pegGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.42, 12); this.pegGeo.translate(0, 0.21, 0);
    this.headGeo = new THREE.SphereGeometry(0.15, 14, 10); this.headGeo.translate(0, 0.45, 0);
    this.pegMats = { 1: new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.4 }), 2: new THREE.MeshStandardMaterial({ color: '#e8322a', roughness: 0.35, emissive: '#ff2a10', emissiveIntensity: 0.4 }), 3: new THREE.MeshStandardMaterial({ color: '#7a1a14', roughness: 0.5 }) };
    this.markGeo = new THREE.PlaneGeometry(1, 1); this.markGeo.rotateX(-Math.PI / 2);
    this.marks = [];
    stage.views.push(this);
  }
  buildGrid(i) {
    const g = new THREE.Group(), th = this.theme;
    const top = new THREE.MeshPhysicalMaterial({ map: seaTexture(th, i === 0), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.08 });
    const side = new THREE.MeshStandardMaterial({ map: materialTexture(th.frame, th.mat === 'marble' ? 'marble' : 'wood', 256, 7 + i), roughness: 0.5 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.3, 11.2), [side, side, top, side, side, side]);
    box.position.set(0, -0.15, 0); box.receiveShadow = true; box.castShadow = true; g.add(box);
    this.root.add(g); return g;
  }
  cellPos(gi, x, y) { const g = this.grids[gi]; return [g.position.x + x - 4.5, g.position.z + y - 4.5]; }
  gridPlace(mode) {
    const S = this.stage, port = S.h > S.w * 1.05;
    if (mode === 'place' || mode === 'solo') { const i = mode === 'solo' ? 1 : 0; this.grids[i].position.set(0, 0, 0); this.grids[i].visible = true; this.grids[1 - i].visible = false; this.grids[1 - i].position.set(40, 0, 0); return; }
    this.grids.forEach((g) => { g.visible = true; });
    if (port) { this.grids[1].position.set(0, 0, -6.1); this.grids[0].position.set(0, 0, 6.1); }
    else { this.grids[0].position.set(-6.1, 0, 0); this.grids[1].position.set(6.1, 0, 0); }
  }
  setLayout(mode, dur = 0) { this.mode = mode; this.gridPlace(mode); this.refreshAll(); this.view(dur); }
  refreshAll() { for (const gi of [0, 1]) { for (const [, m] of this.ships[gi]) this.placeShipMesh(gi, m); for (const [k, m] of this.pegs[gi]) { const [x, y] = k.split(',').map(Number); const [px, pz] = this.cellPos(gi, x, y); m.position.x = px; m.position.z = pz; } } this.stage.dirty = true; }
  view(dur = 0) {
    const S = this.stage, pts = [];
    for (const g of this.grids) { if (!g.visible) continue; for (const x of [-5.7, 5.7]) for (const z of [-5.7, 5.7]) pts.push(new THREE.Vector3(g.position.x + x, 0, g.position.z + z)); }
    if (!pts.length) return;
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    S.frame({ target: [c.x, 0, c.z + 0.4], yaw: 0, pitch: this.mode === 'battle' ? 1.12 : 1.0, pts, margin: 0.95 }, dur);
  }
  onResize() { this.gridPlace(this.mode); this.refreshAll(); this.view(0); }
  makeShip(s) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(this.hullGeo[s.len] ||= shipGeometry(s.len), this.hullMat); hull.castShadow = true; g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(s.len * 0.94 - 0.7, 0.04, 0.42), this.deckMat); deck.position.set(-0.15, 0.27, 0); g.add(deck);
    const tower = (x, w, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), this.hullMat); m.position.set(x, 0.27 + h / 2, 0); m.castShadow = true; g.add(m); };
    const gun = (x) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 12), this.hullMat); b.position.set(x, 0.34, 0); g.add(b); const p = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.05), this.hullMat); p.position.set(x + 0.2, 0.37, 0); g.add(p); };
    if (s.len === 5) { const fd = new THREE.Mesh(new THREE.BoxGeometry(s.len * 0.94, 0.06, 0.7), this.deckMat); fd.position.y = 0.3; g.add(fd); tower(0.6, 0.6, 0.45); }
    else if (s.len === 4) { tower(-0.1, 0.7, 0.35); gun(1.05); gun(-1.15); }
    else if (s.len === 3 && s.id === 'sottomarino') { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, s.len * 0.94 - 0.6, 6, 12), this.hullMat); c.rotation.z = Math.PI / 2; c.position.y = 0.1; g.remove(hull); g.remove(deck); g.add(c); tower(0, 0.4, 0.3); }
    else if (s.len === 3) { tower(0.1, 0.55, 0.3); gun(0.75); }
    else { tower(-0.1, 0.4, 0.22); }
    g.userData = { ...s };
    this.root.add(g); return g;
  }
  placeShipMesh(gi, g) {
    const s = g.userData, cells = shipCells(s);
    const [ax, az] = this.cellPos(gi, cells[0][0], cells[0][1]), [bx, bz] = this.cellPos(gi, cells[cells.length - 1][0], cells[cells.length - 1][1]);
    g.position.set((ax + bx) / 2, s.sunk ? -0.12 : 0.02, (az + bz) / 2);
    g.rotation.set(0, s.dir ? -Math.PI / 2 : 0, s.sunk ? 0.18 : 0);
    g.visible = this.grids[gi].visible;
    const ghost = !!s.ghost, bad = !!s.bad;
    g.traverse((o) => { if (o.isMesh) { o.material = s.sunk ? this.sunkMat : o.userData.base || o.material; if (!o.userData.base) o.userData.base = o.material; if (ghost) { o.material = bad ? this.badMat() : this.ghostMat(); } else if (!s.sunk) o.material = o.userData.base; } });
  }
  ghostMat() { return (this._gm ||= new THREE.MeshStandardMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.55, emissive: '#2fa8ff', emissiveIntensity: 0.4 })); }
  badMat() { return (this._bm ||= new THREE.MeshStandardMaterial({ color: '#ff7a7a', transparent: true, opacity: 0.55, emissive: '#ff2a2a', emissiveIntensity: 0.4 })); }
  // ships: [{ id, len, x, y, dir, sunk, ghost, bad, sel }]
  setShips(gi, list) {
    const map = this.ships[gi], seen = new Set();
    for (const s of list) {
      const key = s.id + (s.ghost ? ':g' : '');
      seen.add(key);
      let g = map.get(key);
      if (!g || g.userData.len !== s.len) { if (g) this.root.remove(g); g = this.makeShip(s); map.set(key, g); }
      g.userData = { ...s };
      this.placeShipMesh(gi, g);
    }
    for (const [k, g] of map) if (!seen.has(k)) { this.root.remove(g); map.delete(k); }
    this.stage.dirty = true;
  }
  // shots: Int8Array(100) 0 unknown, 1 miss, 2 hit, 3 sunk
  setShots(gi, shots, { animate = null } = {}) {
    const map = this.pegs[gi];
    for (let i = 0; i < N * N; i++) {
      const v = shots[i], k = `${i % N},${(i / N) | 0}`;
      let m = map.get(k);
      if (!v) { if (m) { this.root.remove(m); map.delete(k); } continue; }
      if (!m) {
        m = new THREE.Group(); m.add(new THREE.Mesh(this.pegGeo)); m.add(new THREE.Mesh(this.headGeo));
        m.children.forEach((c) => { c.castShadow = true; });
        const [x, y] = k.split(',').map(Number), [px, pz] = this.cellPos(gi, x, y); m.position.set(px, 0, pz);
        m.visible = this.grids[gi].visible;
        this.root.add(m); map.set(k, m);
        if (animate === i) { m.position.y = 3; this.stage.animate(0.35, (t) => { m.position.y = 3 * (1 - t); }, ease.out); }
      }
      for (const c of m.children) c.material = this.pegMats[v];
    }
    this.stage.dirty = true;
  }
  fx(gi, x, y, kind) {
    const [px, pz] = this.cellPos(gi, x, y), n = kind === 'miss' ? 14 : 26;
    const col = kind === 'miss' ? '#d8f3ff' : '#ffae3a';
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false });
    const geo = new THREE.SphereGeometry(kind === 'miss' ? 0.07 : 0.1, 6, 4);
    const parts = Array.from({ length: n }, () => { const m = new THREE.Mesh(geo, mat); m.position.set(px, 0.1, pz); this.root.add(m); const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.6; return { m, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2.5 + Math.random() * 2.5 }; });
    const ring = new THREE.Mesh(this.markGeo, new THREE.MeshBasicMaterial({ map: radialTexture(kind === 'miss' ? 'rgba(220,245,255,.9)' : 'rgba(255,170,60,.95)'), transparent: true, depthWrite: false }));
    ring.position.set(px, 0.03, pz); this.root.add(ring);
    this.stage.animate(0.9, (k, raw) => {
      const t = raw * 0.9;
      for (const p of parts) { p.m.position.set(px + p.vx * t, 0.1 + p.vy * t - 4.9 * t * t, pz + p.vz * t); p.m.visible = p.m.position.y > -0.05; }
      mat.opacity = 1 - raw; ring.scale.setScalar(0.5 + raw * 2.2); ring.material.opacity = 1 - raw;
    }, ease.lin).then(() => { for (const p of parts) this.root.remove(p.m); this.root.remove(ring); geo.dispose(); mat.dispose(); ring.material.dispose(); });
  }
  setMarks({ cursor = null } = {}) {
    for (const m of this.marks) { this.root.remove(m); m.material.dispose(); } this.marks = [];
    if (cursor) {
      const [gi, xy] = cursor.split(':'), [x, y] = xy.split(',').map(Number), [px, pz] = this.cellPos(+gi, x, y);
      const m = new THREE.Mesh(this.markGeo, new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.45, depthWrite: false })); m.position.set(px, 0.012, pz); m.scale.setScalar(0.94); this.root.add(m); this.marks.push(m);
    }
    this.stage.dirty = true;
  }
  update(dt) {
    this.t += dt;
    let live = false;
    for (const gi of [0, 1]) for (const g of this.ships[gi].values()) { if (!g.visible || g.userData.sunk) continue; g.position.y = 0.02 + Math.sin(this.t * 1.4 + g.userData.x + g.userData.y * 1.7) * 0.025; live = true; }
    for (const m of this.pegs[1].values()) if (m.children[0].material === this.pegMats[2]) { this.pegMats[2].emissiveIntensity = 0.35 + Math.sin(this.t * 5) * 0.2; live = true; break; }
    return live;
  }
  quads() {
    const S = this.stage, out = [];
    for (const gi of [0, 1]) {
      if (!this.grids[gi].visible) continue;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [px, pz] = this.cellPos(gi, x, y); out.push({ id: `${gi}:${x},${y}`, pts: [[px - 0.5, pz - 0.5], [px + 0.5, pz - 0.5], [px + 0.5, pz + 0.5], [px - 0.5, pz + 0.5]].map(([a, b]) => S.project(a, 0, b)) }); }
    }
    return out;
  }
  afterRender() {
    const e = this.stage.camera.matrixWorld.elements, k = e.map((v) => v.toFixed(3)).join(',') + this.stage.w + 'x' + this.stage.h + this.mode;
    if (k !== this.layoutKey) { this.layoutKey = k; this.onLayout?.(); }
  }
  dispose() { this.stage.views.splice(this.stage.views.indexOf(this), 1); this.stage.scene.remove(this.root); }
}
