// Festa Baso — the 3D party board (an island with a loop of spaces around Bastione's castle, Kart Baso karts
// parked on the beach) and the final podium. Players are Orda bean figures wearing their hats.
import { THREE, partyScene, Figures, Confetti, mesh, lambert } from '../stage.js';
import { BOARD } from '../party.js';
import { keepModel } from '../../bastione/models.js';
import { makeKart } from '../../kart/models.js';

const SPACE_COL = { blu: '#2f8cff', rosso: '#ff4d4d', evento: '#2fd36b', bonus: '#ffc21a' };
function starMesh() {
  const s = new THREE.Shape(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.45 : 1, a = (k / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; k ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }); g.center();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9a00', emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }));
}
function qTex(txt, bg) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 78px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function boardView(stage, B, ctx) {
  const scene = partyScene(stage, { sky: '#7fd0ff', ground: false, size: 40 });
  const sea = mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshLambertMaterial({ color: '#2aa8e8' }), 0, -0.4, 0, false); sea.rotation.x = -Math.PI / 2; scene.add(sea);
  const sand = mesh(new THREE.CylinderGeometry(25, 27, 0.6, 64), lambert('#f3dca0'), 0, -0.3, 0, false); sand.scale.z = 0.78; scene.add(sand);
  const grass = mesh(new THREE.CylinderGeometry(23, 24, 0.5, 64), lambert('#78cc5a'), 0, -0.1, 0, false); grass.scale.z = 0.76; scene.add(grass);
  const hill = mesh(new THREE.SphereGeometry(7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lambert('#6abf4f'), 0, -0.2, 0, false); hill.scale.y = 0.28; scene.add(hill);
  const keep = keepModel(); keep.position.y = 1.6; keep.scale.setScalar(0.9); scene.add(keep);
  // path between spaces
  const pts = BOARD.map((s) => new THREE.Vector3(s.x, 0.16, s.z)); pts.push(pts[0].clone());
  const path = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 200, 0.35, 6, true), lambert('#f6e7c4')); path.scale.y = 0.2; path.position.y = 0.12; scene.add(path);
  const tex = { evento: qTex('?', SPACE_COL.evento), bonus: qTex('+', SPACE_COL.bonus) };
  const spaces = BOARD.map((s) => {
    const m = mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.3, 24), lambert(SPACE_COL[s.type]), s.x, 0.2, s.z); scene.add(m);
    if (tex[s.type]) { const d = mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ map: tex[s.type] }), s.x, 0.36, s.z, false); d.rotation.x = -Math.PI / 2; scene.add(d); }
    return m;
  });
  for (let k = 0; k < 26; k++) { const a = k * 2.399, r = 17.5 + (k % 3) * 1.6; const x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r * 0.78; if (BOARD.some((s) => Math.hypot(s.x - x, s.z - z) < 2.2)) continue; scene.add(mesh(new THREE.ConeGeometry(0.9, 2.6, 7), lambert(k % 2 ? '#2f8a3a' : '#3fa04a'), x, 1.2, z)); }
  for (let k = 0; k < 3; k++) { const kt = makeKart(ctx.players[k % ctx.players.length].kart); kt.position.set(-6 + k * 4.5, 0.05, 22.5); kt.rotation.y = 0.4 - k * 0.3; scene.add(kt); }
  const star = starMesh(); star.castShadow = true; scene.add(star);
  const figs = new Figures(stage, scene, ctx.players, { scale: 2.3 });
  const fx = new Confetti(scene);
  const pos = ctx.players.map((p, i) => { const s = BOARD[B.players[i].pos]; return { x: s.x, z: s.z, hop: 0 }; });
  const cam = { x: 0, z: 0, d: 30 };
  return {
    scene,
    focus: -1, // player to follow (-1 overview)
    update(dt) {
      const t = stage.uTime.value, st = BOARD[B.star];
      star.position.set(st.x, 2.6 + Math.sin(t * 2) * 0.25, st.z); star.rotation.y = t * 1.6;
      B.players.forEach((p, i) => {
        const s = BOARD[p.pos], same = B.players.filter((q) => q.pos === p.pos), k = same.indexOf(p), off = same.length > 1 ? (k - (same.length - 1) / 2) * 0.8 : 0;
        const tx = s.x + off, tz = s.z + (same.length > 1 ? 0.3 * (k % 2) : 0), P = pos[i];
        const d = Math.hypot(tx - P.x, tz - P.z);
        if (d > 0.02) { const sp = Math.min(1, dt * 9); P.x += (tx - P.x) * sp; P.z += (tz - P.z) * sp; P.hop = Math.min(1, P.hop + dt * 4); } else P.hop = Math.max(0, P.hop - dt * 4);
        figs.set(i, P.x, 0.36 + Math.sin(Math.min(1, d / 2) * Math.PI) * 0.8, P.z, B.turn === i ? Math.sin(t * 2) * 0.5 : 0, d > 0.05 ? 1 : B.turn === i ? 0.4 : 0);
      });
      figs.commit(0); fx.update(dt);
      const f = this.focus >= 0 ? pos[this.focus] : null;
      const tx = f ? f.x * 0.6 : 0, tz = f ? f.z * 0.6 : 0, td = f ? 22 : 32;
      const k = Math.min(1, dt * 2.5); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k; cam.d += (td - cam.d) * k;
      const c = stage.camera, port = stage.portrait ? 1.55 : 1;
      c.position.set(cam.x, cam.d * 0.95 * port, cam.z + cam.d * 0.62 * port); c.lookAt(cam.x, 0, cam.z - 1);
    },
    burst(i, color) { const P = pos[i]; fx.burst(P.x, 1.5, P.z, color, 40, 6); },
    tags: () => pos.map((P) => [P.x, 3.6, P.z]),
  };
}

// podium: three steps, everyone on their place, confetti rain, the winner wears a crown
export function podiumView(stage, podium, ctx) {
  const scene = partyScene(stage, { sky: '#ffd6f0', ground: '#ffb3d9', size: 14 });
  const H = { 1: 2.4, 2: 1.6, 3: 1.0, 4: 0.4 }, X = { 1: 0, 2: -3.2, 3: 3.2, 4: 6.2 };
  const cols = { 1: '#ffd23f', 2: '#d6dde6', 3: '#e09a5a', 4: '#9aa3ad' };
  const used = {};
  const slots = podium.map((p) => { const pl = p.place; used[pl] = (used[pl] || 0) + 1; return { i: p.i, place: pl, x: X[Math.min(4, pl)] + (used[pl] - 1) * 1.3, h: H[Math.min(4, pl)] }; });
  for (const pl of [1, 2, 3]) if (podium.some((p) => p.place === pl)) { const m = mesh(new THREE.BoxGeometry(2.8, H[pl], 2.4), lambert(cols[pl]), X[pl], H[pl] / 2, 0); scene.add(m); }
  const players = ctx.players.map((p, i) => ({ ...p, hat: podium.find((q) => q.i === i)?.place === 1 ? 'corona' : p.hat }));
  const figs = new Figures(stage, scene, players, { scale: 2 });
  const fx = new Confetti(scene, 900); let tt = 0;
  return {
    scene,
    update(dt) {
      tt += dt;
      slots.forEach((s) => figs.set(s.i, s.x, s.h, 0.2, 0, s.place === 1 ? 1 : 0.3));
      figs.commit(0);
      if (Math.random() < dt * 6) fx.burst((Math.random() - 0.5) * 12, 9, (Math.random() - 0.5) * 4, ['#ff4d6d', '#ffd23f', '#2ec4ff', '#7ddc1f'][Math.floor(Math.random() * 4)], 6, 2);
      fx.update(dt);
      if (stage.portrait) stage.frame(0.6, 1.2, 6.8, 3.2, 0.25, 0.2); else stage.frame(4.6, 0.5, 11.5, 3.2, 0.25, 2);
    },
    tags: () => ctx.players.map((p, i) => { const s = slots.find((q) => q.i === i); return [s.x, s.h + 2.9, 0.2]; }),
  };
}
