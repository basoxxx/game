// Orda · La tua base — the 3D isometric base view (three.js). Cartoon toon-shaded buildings built from
// primitives (every level changes the model: taller, extra parts, new materials), an island with the
// attack lane in front, a few idle figures, a placement ghost and drag/tap/pinch controls.
// Used for the player's base (editable, blue) and for previewing rival bases (read-only, red).
//
//   const v = new BaseView(container, { tier, theme, editable, canPlace(t,x,y,skipId), onTap(cell,b), onPlace(t,x,y), onMove(id,x,y), onFrame() })
//   v.setLayout(layout)   v.arm(type|null)   v.select(id|null)   v.cellAt(clientX, clientY)   v.toScreen(x, y, h)   v.destroy()
import * as THREE from 'three';
import { GRID, BUILDINGS, gateLabel } from './data.js';
import { pixelRatio } from '../../ui/quality.js';

const TEAM = { blue: { main: '#2f7cf6', dark: '#1d4fb8', light: '#9cc6ff' }, red: { main: '#ef4444', dark: '#b91c1c', light: '#fca5a5' } };
const HALF = GRID / 2;
const cx = (x, s = 1) => x + s / 2 - HALF, cz = (y, s = 1) => HALF - (y + s / 2); // grid → world (row 0 = front = +z)

let gradTex = null;
function toonGradient() {
  if (gradTex) return gradTex;
  const d = new Uint8Array([90, 170, 255]);
  gradTex = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  return gradTex;
}

export class BaseView {
  constructor(container, opts = {}) {
    this.el = container; this.o = opts; this.themeName = opts.theme || 'blue'; this.theme = TEAM[this.themeName]; this.tier = opts.tier || 'high';
    this.mats = new Map(); this.geos = new Map(); this.objs = new Map(); this.disposed = false;
    this.layout = { b: [] }; this.armed = null; this.sel = null; this.drag = null; this.t = 0;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.tier !== 'low', alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(this.tier === 'high' ? 2 : 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = this.tier !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'ob-cv';
    container.appendChild(r.domElement);
    const sc = this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.zoom = 1; this.pan = new THREE.Vector2(0, 0); this.yaw = Math.PI / 4;
    sc.add(new THREE.HemisphereLight('#dff1ff', '#6b8f4e', 1.25));
    const sun = this.sun = new THREE.DirectionalLight('#fff3dc', 1.9);
    sun.position.set(-6, 12, 7); sun.castShadow = this.tier !== 'low';
    sun.shadow.mapSize.set(this.tier === 'high' ? 2048 : 1024, this.tier === 'high' ? 2048 : 1024);
    const sh = sun.shadow.camera; sh.left = sh.bottom = -9; sh.right = sh.top = 9; sh.near = 1; sh.far = 40; sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
    sc.add(sun);
    this.world = new THREE.Group(); sc.add(this.world);
    this.bGroup = new THREE.Group(); this.world.add(this.bGroup);
    this.ground();
    this.ghost = new THREE.Group(); this.ghost.visible = false; this.world.add(this.ghost);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.95, depthWrite: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.position.y = 0.03; this.selRing.visible = false; this.world.add(this.selRing);
    this.range = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
    this.range.rotation.x = -Math.PI / 2; this.range.position.y = 0.04; this.range.visible = false; this.world.add(this.range);
    this.rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, depthWrite: false }));
    this.rangeFill.rotation.x = -Math.PI / 2; this.rangeFill.position.y = 0.035; this.rangeFill.visible = false; this.world.add(this.rangeFill);
    this.figures();
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bind();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.resize();
    this.loop = this.loop.bind(this); this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- materials / geometry caches
  mat(color, opts = {}) {
    const k = `${color}|${opts.emissive || ''}|${opts.basic ? 1 : 0}|${opts.opacity ?? 1}`;
    let m = this.mats.get(k);
    if (!m) {
      m = opts.basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
      if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 0.6; }
      if (opts.opacity != null) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = false; }
      this.mats.set(k, m);
    }
    return m;
  }
  geo(key, make) { let g = this.geos.get(key); if (!g) { g = make(); this.geos.set(key, g); } return g; }
  box(w, h, d) { return this.geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); }
  cyl(rt, rb, h, n = 12) { return this.geo(`c${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n)); }
  mesh(g, m, x = 0, y = 0, z = 0, cast = true) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast && this.tier !== 'low'; o.receiveShadow = this.tier !== 'low'; return o; }

  ground() {
    const g = new THREE.Group();
    // island: a rounded grassy slab with a dirt rim
    const shape = new THREE.Shape(); const R = HALF + 1.4, rr = 1.2;
    shape.moveTo(-R + rr, -R); shape.lineTo(R - rr, -R); shape.quadraticCurveTo(R, -R, R, -R + rr); shape.lineTo(R, R - rr); shape.quadraticCurveTo(R, R, R - rr, R); shape.lineTo(-R + rr, R); shape.quadraticCurveTo(-R, R, -R, R - rr); shape.lineTo(-R, -R + rr); shape.quadraticCurveTo(-R, -R, -R + rr, -R);
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.2, bevelSegments: 2, curveSegments: 10 });
    slab.rotateX(Math.PI / 2); slab.translate(0, -0.24, 0);
    const dirt = new THREE.Mesh(slab, this.mat('#9a6b43')); dirt.receiveShadow = true; g.add(dirt);
    const topG = new THREE.ShapeGeometry(shape, 10); topG.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(topG, this.mat('#7cc95a')); top.position.y = 0.005; top.receiveShadow = true; g.add(top);
    // checker tiles of the grid
    const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient() }), GRID * GRID);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x; m4.makeTranslation(cx(x), 0.012, cz(y)); tiles.setMatrixAt(i, m4);
      c.set((x + y) % 2 ? '#8fd468' : '#86cc60'); if (y < 2) c.lerp(new THREE.Color('#d9c48f'), 0.35); tiles.setColorAt(i, c);
    }
    tiles.receiveShadow = true; g.add(tiles); this.tiles = tiles;
    // the attack lane in front (sand path) and the cannon spot
    const lane = this.mesh(this.box(2.2, 0.05, 2.6), this.mat('#e7cf94'), 0, 0.02, HALF + 1.9, false); g.add(lane);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 3), this.mat(this.theme.main === TEAM.blue.main ? '#ef4444' : '#2f7cf6'));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.25, HALF + 1.2); this.arrow = arrow; g.add(arrow);
    // decor: trees and rocks around the rim
    const rnd = (i) => { const s = Math.sin(i * 91.7) * 43758.5; return s - Math.floor(s); };
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, rr2 = HALF + 0.75 + rnd(i) * 0.4;
      const x = Math.cos(a) * rr2 * 1.05, z = Math.sin(a) * rr2 * 1.05;
      if (z > HALF - 0.2 && Math.abs(x) < 1.6) continue; // keep the lane clear
      if (Math.abs(x) > R - 0.3 || Math.abs(z) > R - 0.3) continue;
      if (rnd(i + 7) < 0.65) {
        const t = new THREE.Group();
        t.add(this.mesh(this.cyl(0.06, 0.08, 0.35, 6), this.mat('#7a4e2d'), 0, 0.17, 0));
        t.add(this.mesh(this.geo('tree', () => new THREE.IcosahedronGeometry(0.3, 0)), this.mat(rnd(i + 3) < 0.5 ? '#3f9e46' : '#58b84a'), 0, 0.5, 0));
        t.position.set(x, 0, z); t.scale.setScalar(0.8 + rnd(i + 5) * 0.6); g.add(t);
      } else g.add(this.mesh(this.geo('rock', () => new THREE.DodecahedronGeometry(0.18, 0)), this.mat('#a7a9ad'), x, 0.1, z));
    }
    // water around
    const water = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), this.mat('#5ec8f2'));
    water.position.y = -0.9; g.add(water);
    this.world.add(g);
  }

  // a handful of idle little figures wandering around the base (team colour)
  figures() {
    const n = this.tier === 'low' ? 6 : 14;
    const body = new THREE.CapsuleGeometry(0.07, 0.1, 3, 6); body.translate(0, 0.12, 0);
    this.figs = new THREE.InstancedMesh(body, this.mat(this.theme.main), n);
    this.figs.castShadow = this.tier !== 'low';
    this.figData = Array.from({ length: n }, (_, i) => ({ x: (Math.sin(i * 12.9) * 0.5) * GRID * 0.9, z: (Math.cos(i * 7.3) * 0.5) * GRID * 0.9, a: i, sp: 0.4 + (i % 4) * 0.1, ph: i }));
    this.world.add(this.figs);
  }

  // ---------- building models: one Group per building, rebuilt when its level changes
  model(t, l, team = this.theme, ghost = false) {
    const g = new THREE.Group(), B = BUILDINGS[t];
    const M = (c, o) => (ghost ? this.mat(c, { opacity: 0.55 }) : this.mat(c, o));
    const add = (geo, m, x, y, z) => { const o = this.mesh(geo, m, x, y, z, !ghost); g.add(o); return o; };
    const pips = (h) => { // level pips: little gold studs on top-front
      for (let i = 0; i < l; i++) add(this.geo('pip', () => new THREE.SphereGeometry(0.035, 6, 4)), M('#ffd23f'), -0.2 + i * (0.4 / Math.max(1, B.max - 1)), h, 0.36);
    };
    if (t === 'hq') {
      const h = 0.75 + l * 0.14, w = 1.3;
      add(this.box(w, h, w), M(l >= 4 ? '#e9e3d6' : '#d8cdb8'), 0, h / 2, 0);
      add(this.box(w + 0.08, 0.1, w + 0.08), M(team.dark), 0, h * 0.55, 0);
      // crenellations
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i === 0 || j === 0 || i === 3 || j === 3) add(this.box(0.18, 0.16, 0.18), M('#cfc3ab'), -w / 2 + 0.09 + i * ((w - 0.18) / 3), h + 0.08, -w / 2 + 0.09 + j * ((w - 0.18) / 3));
      const roof = add(this.geo(`hqr${l}`, () => new THREE.ConeGeometry(0.62, 0.55 + l * 0.05, 4)), M(team.main), 0, h + 0.35 + l * 0.025, 0); roof.rotation.y = Math.PI / 4;
      add(this.box(0.34, 0.42, 0.06), M('#6b4226'), 0, 0.21, w / 2 + 0.01); // door
      if (l >= 2) for (const s of [-1, 1]) add(this.box(0.16, 0.16, 0.05), M('#ffe9a8', { emissive: '#ffcc55', ei: 0.4 }), s * 0.36, h * 0.72, w / 2 + 0.01);
      if (l >= 3) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        add(this.cyl(0.17, 0.19, h + 0.25, 10), M('#d2c6ae'), sx * w / 2, (h + 0.25) / 2, sz * w / 2);
        add(this.geo('tcone', () => new THREE.ConeGeometry(0.22, 0.32, 10)), M(team.dark), sx * w / 2, h + 0.4, sz * w / 2);
      }
      const poleH = h + 0.9 + l * 0.05;
      add(this.cyl(0.02, 0.02, 0.6, 5), M('#5b5b5b'), 0, poleH, 0);
      const flag = add(this.box(0.3, 0.18, 0.02), M(team.main), 0.16, poleH + 0.18, 0); flag.userData.flag = true;
      if (l >= 5) add(this.geo('crown', () => new THREE.TorusGeometry(0.16, 0.04, 6, 12)), M('#ffd23f', { emissive: '#ffb300', ei: 0.35 }), 0, h + 0.62 + l * 0.05, 0).rotation.x = Math.PI / 2;
      if (l >= 6) add(this.geo('gem', () => new THREE.OctahedronGeometry(0.1, 0)), M('#7df9ff', { emissive: '#36e2ff', ei: 0.8 }), 0, h + 0.78 + l * 0.05, 0).userData.spin = true;
    } else if (t === 'muro') {
      const h = 0.32 + l * 0.07;
      const col = ['#c69a6a', '#c9c3b6', '#b8b1a3', '#c0573f', '#a8492f', '#7f93a8'][l - 1];
      add(this.box(0.9, h, 0.9), M(col), 0, h / 2, 0);
      if (l === 1) for (let i = 0; i < 3; i++) add(this.box(0.9, 0.03, 0.02), M('#8a643f'), 0, 0.1 + i * 0.1, 0.46); // planks
      else for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i === 0 || j === 0 || i === 3 || j === 3) if ((i + j) % 2 === 0) add(this.box(0.18, 0.14, 0.18), M(col), -0.36 + i * 0.24, h + 0.07, -0.36 + j * 0.24);
      if (l >= 5) add(this.box(0.92, 0.06, 0.92), M('#ffd23f'), 0, h * 0.5, 0); // gold band
      if (l >= 6) add(this.geo('spike', () => new THREE.ConeGeometry(0.06, 0.2, 5)), M('#dfe7ee'), 0, h + 0.22, 0);
    } else if (t === 'gelo') {
      const h = 0.55 + l * 0.12;
      add(this.cyl(0.26, 0.34, h, 10), M('#e8f4ff'), 0, h / 2, 0);
      for (let i = 0; i < l; i++) add(this.geo('ring', () => new THREE.TorusGeometry(0.3, 0.025, 5, 16)), M('#7dd3fc'), 0, 0.15 + i * (h / (l + 0.5)), 0).rotation.x = Math.PI / 2;
      const c = add(this.geo('crys', () => new THREE.OctahedronGeometry(0.22, 0)), M('#7dd3fc', { emissive: '#38bdf8', ei: 0.7 }), 0, h + 0.3, 0); c.scale.set(1, 1.6, 1); c.userData.spin = true; c.userData.bob = h + 0.3;
      if (l >= 3) for (const s of [-1, 1]) add(this.geo('crys2', () => new THREE.OctahedronGeometry(0.09, 0)), M('#bae6fd', { emissive: '#7dd3fc', ei: 0.6 }), s * 0.22, h + 0.08, 0);
    } else if (t === 'mortaio') {
      const h = 0.35 + l * 0.06;
      add(this.cyl(0.38, 0.42, h, 12), M('#8b8f99'), 0, h / 2, 0);
      add(this.cyl(0.4, 0.4, 0.06, 12), M(team.dark), 0, h, 0);
      const nb = l >= 4 ? 3 : l >= 2 ? 2 : 1;
      for (let i = 0; i < nb; i++) { const b = add(this.cyl(0.1, 0.13, 0.5, 10), M('#3b3f47'), (i - (nb - 1) / 2) * 0.22, h + 0.22, -0.05); b.rotation.x = -0.5; }
      if (l >= 3) add(this.geo('ball', () => new THREE.SphereGeometry(0.07, 8, 6)), M('#222'), 0.3, h + 0.06, 0.25);
      if (l >= 5) add(this.box(0.85, 0.08, 0.85), M('#ffd23f'), 0, 0.06, 0);
    } else if (t === 'cecchino') {
      const h = 0.9 + l * 0.2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(this.cyl(0.035, 0.05, h, 5), M('#8a5a35'), sx * 0.24, h / 2, sz * 0.24);
      add(this.box(0.62, 0.08, 0.62), M('#a7724a'), 0, h, 0);
      add(this.box(0.3, 0.26, 0.3), M(team.main), 0, h + 0.17, 0);
      const gun = add(this.cyl(0.03, 0.03, 0.55 + l * 0.05, 6), M('#333'), 0, h + 0.2, 0.25); gun.rotation.x = Math.PI / 2;
      if (l >= 3) add(this.geo('roofc', () => new THREE.ConeGeometry(0.42, 0.28, 4)), M(team.dark), 0, h + 0.45, 0).rotation.y = Math.PI / 4;
      if (l >= 4) add(this.geo('scope', () => new THREE.SphereGeometry(0.05, 6, 4)), M('#ff3b3b', { emissive: '#ff0000', ei: 0.9 }), 0, h + 0.28, 0.53);
    } else if (t === 'caserma') {
      const fl = Math.min(3, Math.ceil(l / 2)), h = 0.32 * fl + 0.12;
      add(this.box(0.78, h, 0.7), M('#f5ead7'), 0, h / 2, 0);
      const roof = add(this.geo('prism', () => { const s = new THREE.CylinderGeometry(0.5, 0.5, 0.86, 3); s.rotateZ(Math.PI / 2); return s; }), M('#ef4444'), 0, h + 0.15, 0); roof.scale.set(1, 0.65, 1);
      add(this.box(0.2, 0.28, 0.04), M('#7a4a2a'), 0, 0.14, 0.36);
      for (let f = 0; f < fl; f++) for (const s of [-1, 1]) add(this.box(0.13, 0.12, 0.04), M('#ffd27a', { emissive: '#ffb84d', ei: 0.3 }), s * 0.24, 0.22 + f * 0.32, 0.36);
      add(this.cyl(0.015, 0.015, 0.5, 4), M('#555'), 0.33, h + 0.3, -0.25);
      const fg = add(this.box(0.2, 0.12, 0.015), M('#ef4444'), 0.44, h + 0.48, -0.25); fg.userData.flag = true;
      if (l >= 4) add(this.box(0.16, 0.16, 0.16), M('#c0392b'), -0.3, 0.08, 0.42);
    } else if (t === 'porta') {
      const h = 0.75 + l * 0.05;
      for (const s of [-1, 1]) add(this.box(0.12, h, 0.14), M('#9a1b30'), s * 0.4, h / 2, 0);
      add(this.box(0.96, 0.32, 0.12), M('#f43f5e'), 0, h - 0.05, 0);
      const sign = new THREE.Mesh(this.geo('sgn', () => new THREE.PlaneGeometry(0.86, 0.28)), this.signMat(gateLabel(B.op(l)), ghost));
      sign.position.set(0, h - 0.05, 0.065); g.add(sign);
      const s2 = sign.clone(); s2.rotation.y = Math.PI; s2.position.z = -0.065; g.add(s2);
      add(this.box(0.84, 0.01, 0.8), M('#f43f5e', { opacity: 0.25 }), 0, 0.02, 0);
      if (l >= 3) for (const s of [-1, 1]) add(this.geo('spike', () => new THREE.ConeGeometry(0.06, 0.2, 5)), M('#e5e7eb'), s * 0.4, h + 0.1, 0);
    } else if (t === 'miniera') {
      add(this.geo('mound', () => { const d = new THREE.DodecahedronGeometry(0.42, 0); d.scale(1, 0.62, 1); return d; }), M('#8d8f94'), 0, 0.2, -0.05);
      add(this.box(0.3, 0.3, 0.06), M('#2b2118'), 0, 0.17, 0.3);
      add(this.box(0.38, 0.06, 0.08), M('#7a4e2d'), 0, 0.34, 0.31);
      for (let i = 0; i < l + 1; i++) add(this.geo('nug', () => new THREE.IcosahedronGeometry(0.07, 0)), M('#ffd23f', { emissive: '#ffb300', ei: 0.4 }), Math.cos(i * 2.3) * 0.28, 0.3 + (i % 3) * 0.06, Math.sin(i * 2.3) * 0.2 - 0.05);
      if (l >= 2) { add(this.box(0.24, 0.12, 0.18), M('#6b6f78'), 0.32, 0.1, 0.3); add(this.geo('nugpile', () => new THREE.IcosahedronGeometry(0.09, 0)), M('#ffd23f', { emissive: '#ffb300', ei: 0.4 }), 0.32, 0.2, 0.3); }
      if (l >= 4) add(this.cyl(0.02, 0.02, 0.5, 4), M('#7a4e2d'), -0.3, 0.45, 0.25);
    } else if (t === 'fornace') {
      const ch = 0.45 + l * 0.12;
      add(this.box(0.72, 0.42, 0.62), M('#c2553e'), 0, 0.21, 0.05);
      add(this.geo('dome', () => new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), M('#b4472f'), 0, 0.42, 0.05);
      add(this.box(0.24, 0.18, 0.04), M('#ff8a3d', { emissive: '#ff6a00', ei: 0.9 }), 0, 0.14, 0.37);
      add(this.cyl(0.08, 0.1, ch, 8), M('#8f3b2b'), 0.22, 0.42 + ch / 2, -0.15);
      for (let i = 0; i < Math.min(l, 4); i++) add(this.box(0.16, 0.08, 0.1), M('#d9775e'), -0.38 + (i % 2) * 0.17, 0.04 + Math.floor(i / 2) * 0.08, 0.38);
      g.userData.smoke = [0.22, 0.42 + ch + 0.05, -0.15];
    } else if (t === 'scudo') {
      add(this.cyl(0.3, 0.36, 0.3, 10), M('#64748b'), 0, 0.15, 0);
      add(this.cyl(0.08, 0.1, 0.4 + l * 0.08, 8), M('#94a3b8'), 0, 0.5 + l * 0.04, 0);
      const orb = add(this.geo('orb', () => new THREE.SphereGeometry(0.16, 12, 8)), M('#22d3ee', { emissive: '#06b6d4', ei: 0.9 }), 0, 0.75 + l * 0.08, 0); orb.userData.bob = 0.75 + l * 0.08;
      const dome = new THREE.Mesh(this.geo(`dome${l}`, () => new THREE.SphereGeometry(0.42 + l * 0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), this.mat('#67e8f9', { opacity: ghost ? 0.15 : 0.22 }));
      g.add(dome);
      for (let i = 0; i < l; i++) add(this.geo('sring', () => new THREE.TorusGeometry(0.14, 0.015, 4, 14)), M('#a5f3fc'), 0, 0.42 + i * 0.1, 0).rotation.x = Math.PI / 2;
    }
    if (t !== 'hq') pips(t === 'cecchino' ? 0.06 : 0.04);
    return g;
  }
  signMat(text, ghost) {
    const k = `sign|${text}|${ghost}`; let m = this.mats.get(k);
    if (!m) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 84; const x = c.getContext('2d');
      x.fillStyle = '#f43f5e'; x.fillRect(0, 0, 256, 84); x.fillStyle = '#fff'; x.font = 'bold 60px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 46);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.MeshBasicMaterial({ map: tx, transparent: ghost, opacity: ghost ? 0.6 : 1 }); m.userData.tex = tx; this.mats.set(k, m);
    }
    return m;
  }

  // ---------- layout sync: (re)build only what changed
  setLayout(layout, extra = {}) {
    this.layout = layout; this.dead = new Set(extra.destroyed || []);
    const seen = new Set();
    for (const b of layout.b) {
      const key = `${b.t}:${b.l}:${this.dead.has(b.id) ? 'x' : ''}`;
      let o = this.objs.get(b.id);
      if (o && o.userData.key !== key) { this.bGroup.remove(o); o = null; }
      if (!o) {
        o = this.dead.has(b.id) ? this.rubble(b) : this.model(b.t, b.l);
        o.userData.key = key; o.userData.id = b.id; o.userData.pop = this.ready ? 0 : 1;
        this.objs.set(b.id, o); this.bGroup.add(o);
      }
      const s = BUILDINGS[b.t].size;
      o.position.set(cx(b.x, s), 0, cz(b.y, s));
      seen.add(b.id);
    }
    for (const [id, o] of this.objs) if (!seen.has(id)) { this.bGroup.remove(o); this.objs.delete(id); }
    this.ready = true;
    this.updateSel();
  }
  rubble(b) {
    const g = new THREE.Group(), s = BUILDINGS[b.t].size;
    for (let i = 0; i < 5 * s; i++) g.add(this.mesh(this.geo('rub', () => new THREE.DodecahedronGeometry(0.12, 0)), this.mat('#8a8379'), (Math.sin(i * 3.1) * 0.35) * s, 0.06, (Math.cos(i * 2.3) * 0.35) * s));
    return g;
  }
  // blue = the player's base, red = a rival's: models are rebuilt in the new colours
  setTheme(name) {
    if (this.themeName === name || !TEAM[name]) return;
    this.themeName = name; this.theme = TEAM[name];
    for (const o of this.objs.values()) this.bGroup.remove(o);
    this.objs.clear(); this.ready = false; this._ghostKey = null;
    if (this.figs) this.figs.material = this.mat(this.theme.main);
    if (this.arrow) this.arrow.material = this.mat(name === 'blue' ? '#ef4444' : '#2f7cf6');
  }
  select(id) { this.sel = id; this.updateSel(); }
  updateSel() {
    const b = this.layout.b.find((q) => q.id === this.sel);
    this.selRing.visible = !!b; this.range.visible = this.rangeFill.visible = false;
    if (!b) return;
    const s = BUILDINGS[b.t].size;
    this.selRing.position.set(cx(b.x, s), 0.03, cz(b.y, s)); this.selRing.scale.setScalar(s * 1.05);
    const B = BUILDINGS[b.t];
    const r = B.range ? B.range(b.l) : b.t === 'caserma' ? 3.5 : 0;
    if (r) for (const m of [this.range, this.rangeFill]) { m.visible = true; m.position.x = cx(b.x, s); m.position.z = cz(b.y, s); m.scale.setScalar(r); m.material.color.set(B.color); }
  }

  // ---------- placement ghost
  arm(type) {
    this.armed = type;
    this.ghost.clear(); this.ghost.visible = false;
    if (type) { this.ghost.add(this.model(type, 1, this.theme, true)); this.ghostTile = new THREE.Mesh(this.box(1, 0.02, 1), this.mat('#22c55e', { opacity: 0.45 })); this.ghost.add(this.ghostTile); }
  }
  showGhost(type, x, y, ok, level = 1) {
    if (!type) { this.ghost.visible = false; return; }
    if (this._ghostKey !== `${type}:${level}`) { this.ghost.clear(); this.ghost.add(this.model(type, level, this.theme, true)); this.ghostTile = new THREE.Mesh(this.box(1, 0.02, 1), this.mat('#22c55e', { opacity: 0.45 })); this.ghost.add(this.ghostTile); this._ghostKey = `${type}:${level}`; }
    const s = BUILDINGS[type].size;
    this.ghost.visible = x != null; if (x == null) return;
    this.ghost.position.set(cx(x, s), 0, cz(y, s));
    this.ghostTile.scale.set(s, 1, s); this.ghostTile.material = this.mat(ok ? '#22c55e' : '#ef4444', { opacity: 0.45 });
  }

  // ---------- input
  cellAt(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    const x = Math.floor(p.x + HALF), y = Math.floor(HALF - p.z);
    return { x, y, inside: x >= 0 && y >= 0 && x < GRID && y < GRID, fx: p.x + HALF, fy: HALF - p.z };
  }
  buildingAt(c) {
    if (!c?.inside) return null;
    return this.layout.b.find((b) => { const s = BUILDINGS[b.t].size; return c.x >= b.x && c.x < b.x + s && c.y >= b.y && c.y < b.y + s; }) || null;
  }
  // grid cell for a building of size s whose centre follows the pointer
  anchor(c, t) { const s = BUILDINGS[t].size; return s === 1 ? [c.x, c.y] : [Math.round(c.fx - s / 2), Math.round(c.fy - s / 2)]; }
  bind() {
    const el = this.renderer.domElement, pts = new Map();
    let start = null, pinch = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, pan: this.pan.clone() }; start = null; this.drag = null; this.showGhost(null); return; }
      const c = this.cellAt(e.clientX, e.clientY), b = this.buildingAt(c);
      start = { x: e.clientX, y: e.clientY, c, b, pan: this.pan.clone(), moved: false, btn: e.button };
      if (this.armed && c) { const [ax, ay] = this.anchor(c, this.armed); this.showGhost(this.armed, ax, ay, this.o.canPlace?.(this.armed, ax, ay)); }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) {
        if (this.armed && e.pointerType === 'mouse') { const c = this.cellAt(e.clientX, e.clientY); if (c?.inside) { const [ax, ay] = this.anchor(c, this.armed); this.showGhost(this.armed, ax, ay, this.o.canPlace?.(this.armed, ax, ay)); } else this.showGhost(this.armed, null); }
        return;
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = Math.max(0.7, Math.min(2.6, pinch.z * (d / Math.max(1, pinch.d))));
        this.panBy(pinch.pan, (a.x + b.x) / 2 - pinch.mx, (a.y + b.y) / 2 - pinch.my);
        this.resize(); return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) > 8) start.moved = true;
      if (!start.moved) return;
      const c = this.cellAt(e.clientX, e.clientY);
      if (this.armed) { if (c?.inside) { const [ax, ay] = this.anchor(c, this.armed); this.showGhost(this.armed, ax, ay, this.o.canPlace?.(this.armed, ax, ay)); } else this.showGhost(this.armed, null); return; }
      // drag an existing building (editable views), else pan
      if (this.o.editable && start.b && start.btn === 0 && start.b.t !== undefined) {
        if (!this.drag) { this.drag = { id: start.b.id, t: start.b.t, l: start.b.l }; const o = this.objs.get(start.b.id); if (o) o.visible = false; this.select(start.b.id); this.selRing.visible = false; this.range.visible = this.rangeFill.visible = false; }
        if (c?.inside) { const [ax, ay] = this.anchor(c, this.drag.t); this.drag.x = ax; this.drag.y = ay; this.drag.ok = this.o.canPlace?.(this.drag.t, ax, ay, this.drag.id); this.showGhost(this.drag.t, ax, ay, this.drag.ok, this.drag.l); }
        return;
      }
      this.panBy(start.pan, dx, dy);
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; start = null; return; }
      const s = start; start = null; if (!s) return;
      if (this.drag) {
        const d = this.drag; this.drag = null; this.showGhost(null);
        const o = this.objs.get(d.id); if (o) o.visible = true;
        if (d.ok && d.x != null) this.o.onMove?.(d.id, d.x, d.y); else this.updateSel();
        return;
      }
      const c = this.cellAt(e.clientX, e.clientY);
      if (this.armed) {
        if (c?.inside) { const [ax, ay] = this.anchor(c, this.armed); if (this.o.canPlace?.(this.armed, ax, ay)) { this.o.onPlace?.(this.armed, ax, ay); return; } }
        if (!s.moved) this.o.onTap?.(c, this.buildingAt(c));
        return;
      }
      if (!s.moved) this.o.onTap?.(c, this.buildingAt(c));
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); start = null; pinch = null; if (this.drag) { const o = this.objs.get(this.drag.id); if (o) o.visible = true; this.drag = null; this.showGhost(null); } });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && this.armed && !pts.size) this.showGhost(this.armed, null); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.7, Math.min(2.6, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); this.resize(); }, { passive: false });
  }
  panBy(from, dx, dy) {
    const r = this.renderer.domElement.getBoundingClientRect(); const k = (this.viewH / this.zoom) / Math.max(1, r.height);
    // screen drag → world pan along the camera's ground axes
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const wx = -dx * k, wz = -dy * k * 1.6;
    this.pan.set(Math.max(-6, Math.min(6, from.x + wx * c + wz * s)), Math.max(-6, Math.min(6, from.y - wx * s + wz * c)));
    this.placeCam();
  }
  resetView() { this.zoom = 1; this.pan.set(0, 0); this.resize(); }

  resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false);
    const a = w / h;
    // fit the island: the diagonal of the grid is ~GRID·√2 wide on screen
    // landscape: the whole island fits; portrait: the grid fits (the rim decor may be cropped)
    const small = w < 640 || h < 420;
    const needW = small ? 13 : a >= 1 ? 17.5 : 14.2, needH = small ? 9 : a >= 1 ? 12.2 : 10.5;
    this.viewH = Math.max(needH, needW / a);
    const vh = this.viewH / this.zoom, vw = vh * a;
    Object.assign(this.cam, { left: -vw / 2, right: vw / 2, top: vh / 2, bottom: -vh / 2 });
    this.cam.updateProjectionMatrix();
    this.placeCam();
  }
  placeCam() {
    const d = 20, tilt = 0.62;
    const t = new THREE.Vector3(this.pan.x, 0, this.pan.y);
    this.cam.position.set(t.x + Math.sin(this.yaw) * d * Math.cos(tilt), d * Math.sin(tilt), t.z + Math.cos(this.yaw) * d * Math.cos(tilt));
    this.cam.lookAt(t);
  }
  // grid position (+ height) → CSS px inside the container
  toScreen(x, y, h = 0.8, s = 1) {
    const v = new THREE.Vector3(cx(x, s), h, cz(y, s)).project(this.cam);
    return { x: (v.x + 1) / 2 * this.el.clientWidth, y: (1 - v.y) / 2 * this.el.clientHeight };
  }

  loop(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    if (this.tier === 'low' && now - this.last < 30) return;
    this.last = now; this.t += dt;
    if (document.hidden) return;
    const T = this.t;
    for (const o of this.objs.values()) {
      if (o.userData.pop < 1) { o.userData.pop = Math.min(1, o.userData.pop + dt * 3.5); const p = o.userData.pop; o.scale.setScalar(p < 1 ? 1 + Math.sin(p * Math.PI) * 0.25 - (1 - p) * 0.6 : 1); }
      o.traverse((c) => {
        if (c.userData.spin) c.rotation.y = T * 1.5;
        if (c.userData.bob) c.position.y = c.userData.bob + Math.sin(T * 2.2 + o.position.x) * 0.05;
        if (c.userData.flag) c.rotation.y = Math.sin(T * 4 + o.position.z) * 0.25;
      });
    }
    if (this.selRing.visible) { const s = this.selRing.scale.x; this.selRing.material.opacity = 0.65 + Math.sin(T * 5) * 0.3; this.selRing.scale.setScalar(s); }
    if (this.arrow) this.arrow.position.y = 0.25 + Math.sin(T * 3) * 0.06;
    // idle figures wander inside the island, avoiding nothing in particular (they are tiny)
    if (this.figs) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      this.figData.forEach((f, i) => {
        f.a += Math.sin(T * 0.3 + f.ph) * dt * 0.8;
        f.x += Math.cos(f.a) * f.sp * dt; f.z += Math.sin(f.a) * f.sp * dt;
        const lim = HALF + 0.6;
        if (Math.abs(f.x) > lim || Math.abs(f.z) > lim) { f.a += Math.PI; f.x = Math.max(-lim, Math.min(lim, f.x)); f.z = Math.max(-lim, Math.min(lim, f.z)); }
        p.set(f.x, Math.abs(Math.sin(T * 9 + i)) * 0.04, f.z); e.set(0, -f.a + Math.PI / 2, 0); q.setFromEuler(e);
        m4.compose(p, q, sc); this.figs.setMatrixAt(i, m4);
      });
      this.figs.instanceMatrix.needsUpdate = true;
    }
    this.o.onFrame?.(T);
    this.renderer.render(this.scene, this.cam);
  }

  destroy() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.ro?.disconnect();
    this.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose?.(); });
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) { m.userData?.tex?.dispose?.(); m.dispose(); }
    this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.renderer.domElement.remove();
  }
}
