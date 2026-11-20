// Tavolo Baso — 3D Quattro in fila: an upright frame in the wood (or stone) of the chosen table with 42 round
// windows, discs in the colours of the chosen set that drop and bounce into place, a ghost disc above the
// column under the cursor and a glow on the winning four.
import { THREE, ease, materialTexture, discGeometry } from './kit3d.js';

export const FC = 7, FR = 6;
const cx = (c) => c - 3, cy = (r) => 0.62 + r;
export class Four3D {
  constructor(stage, { theme, set }) {
    this.stage = stage; this.theme = theme; this.set = set;
    this.root = new THREE.Group(); stage.scene.add(this.root);
    this.discs = new Map(); this.win = null; this.t = 0;
    this.build(); stage.views.push(this);
  }
  build() {
    const th = this.theme, S = this.stage;
    const shape = new THREE.Shape();
    const W = 7.5, H = 6.5, x0 = -W / 2, y0 = 0.12, rr = 0.24;
    shape.moveTo(x0 + rr, y0); shape.lineTo(x0 + W - rr, y0); shape.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + rr); shape.lineTo(x0 + W, y0 + H - rr); shape.quadraticCurveTo(x0 + W, y0 + H, x0 + W - rr, y0 + H); shape.lineTo(x0 + rr, y0 + H); shape.quadraticCurveTo(x0, y0 + H, x0, y0 + H - rr); shape.lineTo(x0, y0 + rr); shape.quadraticCurveTo(x0, y0, x0 + rr, y0);
    for (let c = 0; c < FC; c++) for (let r = 0; r < FR; r++) { const h = new THREE.Path(); h.absarc(cx(c), cy(r), 0.4, 0, Math.PI * 2, true); shape.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: S.tier === 'high' ? 24 : 14 });
    const kind = th.mat === 'marble' ? 'marble' : 'wood';
    const tex = materialTexture(th.dark, kind, 512, 6); tex.repeat.set(0.18, 0.18);
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: kind === 'marble' ? 0.2 : 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 });
    for (const z of [0.2, -0.36]) { const m = new THREE.Mesh(geo, mat); m.position.z = z; m.castShadow = true; m.receiveShadow = true; this.root.add(m); }
    // side posts and feet
    const post = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.4 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 7.1, 0.8), post); p.position.set(sx * 3.88, 3.18, 0); p.castShadow = true; this.root.add(p);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 2.6), post); f.position.set(sx * 3.88, -0.24, 0); f.castShadow = true; f.receiveShadow = true; this.root.add(f);
    }
    // the bottom rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.16, 0.8), post); rail.position.set(0, 0.02, 0); this.root.add(rail);
    this.discGeo = discGeometry(S.tier === 'high' ? 40 : 24); this.discGeo.rotateX(Math.PI / 2);
    this.discMats = this.set.discs.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.1, emissive: c, emissiveIntensity: 0 }));
    this.ghost = new THREE.Mesh(this.discGeo, new THREE.MeshPhysicalMaterial({ color: this.set.discs[0], transparent: true, opacity: 0.55, roughness: 0.3 }));
    this.ghost.visible = false; this.ghost.position.set(0, cy(6) + 0.55, 0.02); this.root.add(this.ghost);
  }
  // discs: [{ id, p (1|2), c, r }]
  setDiscs(list, { instant = false } = {}) {
    const S = this.stage, jobs = [], seen = new Set();
    for (const d of list) {
      seen.add(d.id);
      if (this.discs.has(d.id)) continue;
      const m = new THREE.Mesh(this.discGeo, this.discMats[d.p - 1].clone()); m.castShadow = true; m.receiveShadow = true;
      m.position.set(cx(d.c), cy(d.r), 0.02); this.root.add(m); this.discs.set(d.id, m);
      if (!instant) {
        const y1 = cy(d.r), y0 = cy(6) + 0.6, dur = 0.28 + (6 - d.r) * 0.07;
        m.position.y = y0;
        jobs.push(S.animate(dur, (k) => { m.position.y = y0 + (y1 - y0) * k; }, ease.bounce));
      }
    }
    for (const [id, m] of this.discs) if (!seen.has(id)) { this.root.remove(m); m.material.dispose(); this.discs.delete(id); }
    S.dirty = true;
    return Promise.all(jobs);
  }
  setGhost(col, p) {
    if (col == null || col < 0) { this.ghost.visible = false; this.stage.dirty = true; return; }
    this.ghost.visible = true; this.ghost.material.color.set(this.set.discs[p - 1]); this.ghost.position.x = cx(col); this.stage.dirty = true;
  }
  setWin(cells) { this.win = cells ? cells.map(([c, r]) => `${c},${r}`) : null; this.t = 0; for (const m of this.discs.values()) { m.material.emissiveIntensity = 0; m.scale.setScalar(1); } this.stage.dirty = true; }
  setMarks() {}
  update(dt) {
    if (!this.win) return false;
    this.t += dt;
    for (const [id, m] of this.discs) {
      const k = this.win.includes(id.split(':')[1]) ? 1 : 0;
      if (!k) continue;
      m.material.emissiveIntensity = 0.25 + Math.sin(this.t * 6) * 0.2;
      m.scale.setScalar(1 + Math.sin(this.t * 6) * 0.04);
    }
    return true;
  }
  view(dur = 0) {
    const S = this.stage, port = S.h > S.w * 1.05;
    const pts = [];
    for (const x of [-4.1, 4.1]) for (const y of [-0.3, 7.6]) for (const z of [-0.4, 0.5]) pts.push(new THREE.Vector3(x, y, z));
    S.frame({ target: [0, 3.5, 0], yaw: 0, pitch: port ? 0.16 : 0.2, pts, margin: 0.95 }, dur);
  }
  setFlat() {}
  onResize() { this.view(0); }
  quads() {
    const S = this.stage, out = [];
    for (let c = 0; c < FC; c++) { const x = cx(c); out.push({ c, pts: [[x - 0.5, 7.6], [x + 0.5, 7.6], [x + 0.5, 0.1], [x - 0.5, 0.1]].map(([a, b]) => S.project(a, b, 0.3)) }); }
    return out;
  }
  afterRender() {
    const e = this.stage.camera.matrixWorld.elements, k = e.map((v) => v.toFixed(3)).join(',') + this.stage.w + 'x' + this.stage.h;
    if (k !== this.layoutKey) { this.layoutKey = k; this.onLayout?.(); }
  }
  dispose() {
    this.stage.views.splice(this.stage.views.indexOf(this), 1);
    for (const m of this.discMats) m.dispose(); this.discGeo.dispose();
    this.stage.scene.remove(this.root);
  }
}
