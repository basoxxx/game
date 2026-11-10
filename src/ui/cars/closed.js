// Closed-wheel cars: Le Mans hypercar prototype, GT3-style coupé and Rally1 hatchback.
// Each has one continuous body shell with real wheel-arch openings (see hull() arches), a
// glasshouse painted on the cabin shell, arch flares, aero kit, lamps and running gear.
import * as THREE from 'three';
import { MAT, mesh, far, at, box, cyl, sph, rod, blade, finishOf, endPanel, plate, slab, decalPlate, hull, shell, mouth, archFlare, sweptWing, spanSamples } from './core.js';
import { liveryTexture, endplateMat, finMat, greenhouseMat, panelMat } from './livery.js';
import { wheel } from './wheels.js';

const HEAD = () => MAT.light('#f4fbff', 3), TAIL = () => MAT.light('#ff2020', 3);
// lamp lens: glowing ellipsoid sunk into the bodywork
function lens(car, x, y, z, sx, sy, sz, m, ry = 0, rz = 0, n = 2) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, ry, rz);
  g.add(sph(1, MAT.glass(), { ws: 12, hs: 8, sx, sy, sz }));
  for (let k = 0; k < n; k++) g.add(far(box(sx * 1.25, sy * 0.5, sz * 0.2, m, 0, sy * 0.84, n === 1 ? 0 : (k / (n - 1) - 0.5) * sz * 1.05)));
  car.add(g); return g;
}
// door mirror on a stalk
function mirror(car, x, y, z, s, m, cf) {
  car.add(blade([x - 0.02, y - 0.07, z - s * 0.1], [x, y, z], 0.05, 0.016, cf));
  car.add(at(sph(1, m, { ws: 12, hs: 8, sx: 0.07, sy: 0.045, sz: 0.085 }), x, y + 0.01, z + s * 0.03));
  const gl = new THREE.Mesh(sph(1, MAT.mirror(), { ws: 8, hs: 6 }).geometry, MAT.mirror()); gl.scale.set(0.02, 0.036, 0.07); gl.position.set(x - 0.055, y + 0.01, z + s * 0.03); car.add(gl);
}
// swan-neck wing mount: rises behind the trailing edge and hooks over the top of the wing
function swanNeck(xb, yb, xw, yw, m, z, t = 0.022) {
  return plate([[xb + 0.14, yb], [xb - 0.1, yb], [xw - 0.43, yw + 0.01], [xw - 0.38, yw + 0.1], [xw - 0.08, yw + 0.085], [xw - 0.08, yw + 0.055], [xw - 0.32, yw + 0.05]], t, m, z);
}

// ---------------- Le Mans Hypercar ----------------
export function hypercar(L, opts) {
  const car = new THREE.Group();
  const X0 = -2.45, X1 = 2.55, U = (x) => (x - X0) / (X1 - X0);
  const paint = liveryTexture(L, {
    ...opts, kind: 'endurance', details: {
      side: ({ seam, fill, vents }) => {
        seam([[U(0.62), -0.08], [U(0.6), -1]]); seam([[U(-0.42), -0.08], [U(-0.36), -1]]); seam([[U(-0.42), -0.08], [U(0.62), -0.08]]);
        fill([[U(0.72), -0.16], [U(1.1), -0.3], [U(1.1), -0.82], [U(0.84), -0.82]], 'rgba(5,5,7,0.95)'); vents(U(0.76), U(1.08), -0.3, -0.78, 4, 0.004);
        fill([[U(-1.14), -0.3], [U(-0.84), -0.2], [U(-0.92), -0.75], [U(-1.14), -0.8]], 'rgba(5,5,7,0.95)');
        seam([[U(-2.2), -0.5], [U(-2.05), -0.5]], 0.4);
      },
      top: ({ seam, fill }) => {
        for (const s of [1, -1]) { seam([[U(0.95), s * 0.3], [U(2.2), s * 0.3]]); seam([[U(-0.5), s * 0.36], [U(-2.3), s * 0.36]], 0.35); }
        seam([[U(2.2), -0.3], [U(2.25), 0], [U(2.2), 0.3]]);
      },
    },
  });
  const pri = MAT.paint(L.primary, finishOf(L)), acc = MAT.paint(L.accent, finishOf(L)), cf = MAT.carbon(), cg = MAT.carbonGloss(), blk = MAT.rubber(), dark = MAT.dark();
  const XF = 1.55, XR = -1.6, R = 0.355, TZ = 0.825;
  // main body: low nose between the fenders, side pods, rising tail deck
  const body = [
    { x: -2.45, top: 0.74, bot: 0.17, belt: 0.22, w: 0.94, wt: 0.88, wb: 0.9, n: 4.5 },
    { x: -2.2, top: 0.77, bot: 0.1, belt: 0.14, w: 0.985, wt: 0.9, wb: 0.94, n: 4.5 },
    { x: -1.6, top: 0.75, bot: 0.08, belt: 0.11, w: 0.995, wt: 0.88, wb: 0.96, n: 4.5 },
    { x: -0.9, top: 0.62, bot: 0.07, belt: 0.1, w: 0.975, wt: 0.82, wb: 0.95, n: 4.2 },
    { x: 0.0, top: 0.53, bot: 0.07, belt: 0.1, w: 0.95, wt: 0.74, wb: 0.94, n: 4 },
    { x: 0.8, top: 0.5, bot: 0.07, belt: 0.1, w: 0.965, wt: 0.66, wb: 0.95, n: 4 },
    { x: 1.55, top: 0.45, bot: 0.07, belt: 0.1, w: 0.995, wt: 0.62, wb: 0.97, n: 4 },
    { x: 2.3, top: 0.3, bot: 0.08, belt: 0.11, w: 0.95, wt: 0.66, wb: 0.93, n: 3.4 },
    { x: 2.55, top: 0.19, bot: 0.1, belt: 0.13, w: 0.8, wt: 0.6, wb: 0.8, n: 3 },
  ], bodyO = { u0: 0, u1: 1, seg: 64, around: 48, capRear: false, arches: [{ x: XF, y: R, r: 0.425, zin: 0.62 }, { x: XR, y: R, r: 0.425, zin: 0.62 }] };
  car.add(shell(body, bodyO, paint));
  // tail: full-width light bar over the open diffuser exit, sponsor between
  car.add(endPanel(body, bodyO, false, panelMat(L, { lamps: [[0.03, 0.83, 0.97, 0.9, 3]], grille: [[0.09, 0.0, 0.91, 0.6, 18]], text: [0.5, 0.72, 46], seams: [[0, 0.8, 1, 0.8]] }, opts.sponsor), 0.035));
  // fenders standing proud of the body: pontoons over the wheels with open arches
  const ff = [
    { x: 0.6, top: 0.5, bot: 0.3, w: 0.1, wt: 0.06, wb: 0.1, n: 3 },
    { x: 1.0, top: 0.75, bot: 0.3, w: 0.2, wt: 0.14, wb: 0.2, n: 3.4 },
    { x: 1.55, top: 0.835, bot: 0.3, w: 0.225, wt: 0.16, wb: 0.225, n: 3.6 },
    { x: 2.0, top: 0.76, bot: 0.24, w: 0.225, wt: 0.15, wb: 0.225, n: 3.4 },
    { x: 2.36, top: 0.5, bot: 0.14, w: 0.21, wt: 0.12, wb: 0.21, n: 3.2 },
    { x: 2.54, top: 0.3, bot: 0.11, w: 0.16, wt: 0.1, wb: 0.16, n: 3 },
  ], rf = [
    { x: -2.45, top: 0.84, bot: 0.3, w: 0.215, wt: 0.17, wb: 0.2, n: 4 },
    { x: -2.2, top: 0.875, bot: 0.3, w: 0.225, wt: 0.17, wb: 0.22, n: 3.8 },
    { x: -1.6, top: 0.885, bot: 0.3, w: 0.225, wt: 0.16, wb: 0.225, n: 3.6 },
    { x: -0.95, top: 0.8, bot: 0.3, w: 0.2, wt: 0.13, wb: 0.2, n: 3.4 },
    { x: -0.35, top: 0.58, bot: 0.3, w: 0.1, wt: 0.06, wb: 0.1, n: 3 },
  ];
  for (const s of [1, -1]) {
    const z = s * 0.775;
    car.add(shell(ff, { u0: U(0.6), u1: U(2.54), seg: 36, around: 28, arches: [{ x: XF, y: R, r: 0.42, zin: -0.1, sgn: s }] }, paint, z));
    car.add(shell(rf, { u0: U(-2.45), u1: U(-0.35), seg: 36, around: 28, arches: [{ x: XR, y: R, r: 0.42, zin: -0.1, sgn: s }] }, paint, z));
    // louvres over the front wheels, mirrors, headlamp strips and running lights
    for (let k = 0; k < 6; k++) car.add(at(box(0.035, 0.012, 0.26, dark), 1.28 + k * 0.085, 0.826 - Math.abs(k - 3) * 0.008 - (k > 3 ? (k - 3) * 0.012 : 0), z, 0, 0, -0.1 + (k > 3 ? -0.12 : 0)));
    mirror(car, 0.95, 0.83, s * 0.84, s, pri, cg);
    lens(car, 2.3, 0.53, z, 0.16, 0.03, 0.13, HEAD(), 0, -0.98, 3);
    car.add(at(box(0.014, 0.16, 0.022, TAIL()), -2.49, 0.6, s * 0.905)); car.add(far(at(box(0.014, 0.018, 0.86, TAIL()), -2.49, 0.665, s * 0.45)));
    // dive planes
    for (const [y, a] of [[0.3, 0.28], [0.42, 0.34]]) { const d = plate([[0.2, 0], [-0.12, 0.01], [-0.14, 0.03], [0.18, 0.018]], 0.1, cg, 0, 0.002); d.position.set(2.2, y, s * 1.0); d.rotation.set(0, s * 0.2, a); car.add(d); }
  }
  // cockpit: teardrop canopy with wrap-around screen, roof scoop, fin
  car.add(shell([
    { x: -2.2, top: 0.8, bot: 0.66, w: 0.1, wt: 0.05, n: 3 },
    { x: -1.7, top: 0.87, bot: 0.6, w: 0.24, wt: 0.12, n: 3 },
    { x: -1.1, top: 0.99, bot: 0.5, w: 0.4, wt: 0.24, n: 3 },
    { x: -0.5, top: 1.06, bot: 0.46, w: 0.5, wt: 0.33, n: 3.1 },
    { x: 0.0, top: 1.045, bot: 0.44, w: 0.52, wt: 0.35, n: 3.1 },
    { x: 0.5, top: 0.9, bot: 0.42, w: 0.5, wt: 0.33, n: 3 },
    { x: 1.1, top: 0.5, bot: 0.4, w: 0.4, wt: 0.3, n: 3 },
  ], { seg: 40, around: 36 }, greenhouseMat(L, { ws: 0.69, side: [0.5, 0.79], split: 0.645, rw: 0, wrap: 0.4, sill: 0.42, rake: 0.09, rq: 0.05, strip: 0.03, wfront: 0.975 }, opts.sponsor)));
  const scoop = [{ x: -1.3, top: 1.03, bot: 0.9, w: 0.05, n: 2.6 }, { x: -0.8, top: 1.13, bot: 0.95, w: 0.12, n: 3 }, { x: -0.3, top: 1.15, bot: 1.02, w: 0.13, n: 3.2 }], scO = { seg: 12, around: 20, capFront: false };
  car.add(mesh(hull(scoop, scO), pri)); car.add(mouth(scoop, scO, true, dark, 0.02));
  for (const s of [1, -1]) car.add(far(decalPlate([[-1.0, 1.02], [-2.3, 1.03], [-2.42, 0.8], [-1.5, 0.84]], 0.008, finMat(L, opts.number, opts.driver, s < 0), s * 0.0045, s < 0)));
  car.add(rod([-0.1, 1.05, 0.2], [-0.16, 1.2, 0.2], 0.005, blk)); car.add(at(sph(0.035, blk, { ws: 8, hs: 6, sy: 0.5 }), 0.25, 1.0, -0.15));
  car.add(blade([0.92, 0.58, 0.02], [0.55, 0.86, 0.2], 0.025, 0.012, blk)); // wiper
  // rear wing: full-width plane with gurney on swan necks, tall end plates down to the fenders
  const wX = -2.05, wY = 1.0;
  car.add(sweptWing(spanSamples(0.96, 16, (u) => ({ x: wX, y: wY + u * u * 0.015, c: 0.36, a: -0.13, t: 0.05 })), cg, 3));
  car.add(far(at(box(0.012, 0.03, 1.92, acc), wX - 0.355, wY + 0.075, 0)));
  for (const s of [1, -1]) {
    car.add(far(decalPlate([[-1.9, 0.86], [-1.95, 1.1], [-2.5, 1.1], [-2.5, 0.8], [-2.3, 0.8]], 0.014, endplateMat(L, opts.sponsor), s * 0.97, s < 0)));
    car.add(far(swanNeck(-1.9, 0.76, wX, wY, cg, s * 0.36)));
    car.add(at(box(0.01, 0.2, 0.012, TAIL()), -2.505, 0.96, s * 0.97));
  }
  // splitter with end fences, flat floor edge, diffuser tunnel with strakes
  const sp = [[2.72, 0.5], [2.66, 0.86], [2.5, 1.0], [2.0, 1.0]];
  car.add(far(slab([...sp, ...sp.slice().reverse().map(([x, z]) => [x, -z])], 0.022, cf, 0.055)));
  for (const s of [1, -1]) { car.add(plate([[2.52, 0.06], [2.05, 0.06], [2.05, 0.2], [2.4, 0.14]], 0.012, cg, s * 1.0)); car.add(at(box(2.1, 0.03, 0.05, cf), -0.05, 0.075, s * 0.975)); }
  car.add(far(plate([[-1.95, 0.06], [-2.5, 0.3], [-2.5, 0.33], [-1.95, 0.085]], 1.5, cf, 0, 0)));
  for (const z of [-0.74, -0.45, -0.15, 0.15, 0.45, 0.74]) car.add(plate([[-1.95, 0.06], [-2.5, 0.08], [-2.5, 0.3], [-2.05, 0.1]], 0.012, cg, z, 0.002));
  for (const s of [1, -1]) { car.add(at(cyl(0.05, 0.05, 0.1, MAT.exhaust(), { seg: 12, axis: 'x', open: true }), -2.44, 0.5, s * 0.2)); car.add(at(cyl(0.044, 0.044, 0.02, dark, { seg: 12, axis: 'x' }), -2.44, 0.5, s * 0.2)); }
  car.add(at(box(0.03, 0.05, 0.1, TAIL()), -2.5, 0.36, 0)); // rain light
  // wheels (hidden deep in the arches: dark liners behind them)
  const wheels = [];
  for (const [x, z, w] of [[XF, TZ, 0.31], [XF, -TZ, 0.31], [XR, TZ, 0.34], [XR, -TZ, 0.34]]) {
    const s = Math.sign(z);
    const wh = wheel(R, w, opts.tyre, { kind: 'hyper', rim: '#17181b', rimFrac: 0.69, side: s, caliper: L.accent }); wh.position.set(x, R, z); car.add(wh); wheels.push(wh);
    car.add(at(box(0.6, 0.4, 0.02, dark), x, R + 0.06, s * 0.6));
  }
  car.userData.wheels = wheels;
  car.userData.lamps = { head: [[2.4, 0.48, 0.775], [2.4, 0.48, -0.775]], tail: [[-2.5, 0.665, 0.8], [-2.5, 0.665, -0.8], [-2.5, 0.665, 0.3], [-2.5, 0.665, -0.3]] };
  return car;
}

// shared running gear for the production-based cars
function addWheels(car, pos, R, w, tyre, o, liner) {
  const wheels = [];
  for (const [x, z] of pos) {
    const s = Math.sign(z);
    const wh = wheel(R, w, tyre, { ...o, side: s }); wh.position.set(x, R, z); car.add(wh); wheels.push(wh);
    car.add(at(box(liner[0], liner[1], 0.02, MAT.dark()), x, R + 0.1, s * (Math.abs(z) - w / 2 - 0.1)));
  }
  car.userData.wheels = wheels;
}

// ---------------- GT3-style coupé ----------------
export function gt(L, opts) {
  const car = new THREE.Group();
  const X0 = -2.25, X1 = 2.35, U = (x) => (x - X0) / (X1 - X0);
  const paint = liveryTexture(L, {
    ...opts, kind: 'gt', details: {
      side: ({ seam, fill, vents }) => {
        seam([[U(0.6), -0.07], [U(0.66), -0.5], [U(0.56), -1]]); seam([[U(-0.62), -0.07], [U(-0.56), -1]]); seam([[U(-0.62), -0.07], [U(0.6), -0.07]]);
        fill([[U(0.78), -0.3], [U(0.98), -0.36], [U(0.98), -0.86], [U(0.82), -0.86]], 'rgba(5,5,7,0.95)'); vents(U(0.8), U(0.98), -0.4, -0.82, 3, 0.003);
        fill([[U(-0.9), -0.34], [U(-0.68), -0.28], [U(-0.7), -0.66], [U(-0.9), -0.72]], 'rgba(5,5,7,0.95)');
        seam([[U(-0.42), -0.6], [U(-0.3), -0.6]], 0.6, 5); // door pull
      },
      top: ({ seam, fill, vents }) => {
        seam([[U(0.78), -0.36], [U(2.0), -0.34], [U(2.12), 0], [U(2.0), 0.34], [U(0.78), 0.36]]);
        for (const s of [1, -1]) vents(U(1.25), U(1.72), s * 0.21, s * 0.33, 6, 0.004);
        seam([[U(-1.72), -0.36], [U(-2.2), -0.36]], 0.4); seam([[U(-1.72), 0.36], [U(-2.2), 0.36]], 0.4); vents(U(-2.15), U(-1.8), -0.2, 0.2, 5);
      },
    },
  });
  const pri = MAT.paint(L.primary, finishOf(L)), cf = MAT.carbon(), cg = MAT.carbonGloss(), blk = MAT.rubber(), dark = MAT.dark();
  const XF = 1.42, XR = -1.28, R = 0.345, TZ = 0.83;
  const body = [
    { x: -2.25, top: 0.87, bot: 0.32, belt: 0.4, w: 0.88, wt: 0.8, wb: 0.8, n: 4 },
    { x: -2.0, top: 0.91, bot: 0.22, belt: 0.34, w: 0.95, wt: 0.84, wb: 0.86, n: 4.5 },
    { x: -1.28, top: 0.91, bot: 0.16, belt: 0.3, w: 0.985, wt: 0.84, wb: 0.9, n: 5.5 },
    { x: -0.2, top: 0.83, bot: 0.15, belt: 0.29, w: 0.93, wt: 0.82, wb: 0.9, n: 5 },
    { x: 0.7, top: 0.81, bot: 0.15, belt: 0.29, w: 0.935, wt: 0.8, wb: 0.9, n: 5 },
    { x: 1.42, top: 0.8, bot: 0.15, belt: 0.29, w: 0.97, wt: 0.82, wb: 0.9, n: 5.5 },
    { x: 2.1, top: 0.64, bot: 0.16, belt: 0.3, w: 0.9, wt: 0.72, wb: 0.88, n: 4 },
    { x: 2.35, top: 0.5, bot: 0.2, belt: 0.31, w: 0.78, wt: 0.6, wb: 0.76, n: 3.6 },
  ], bodyO = { u0: 0, u1: 1, seg: 64, around: 48, capRear: false, capFront: false, arches: [{ x: XF, y: R, r: 0.39, zin: 0.6 }, { x: XR, y: R, r: 0.395, zin: 0.6 }] };
  car.add(shell(body, bodyO, paint));
  // tail: lamp clusters joined by a light bar, diffuser opening; nose: honeycomb grille, side intakes
  car.add(endPanel(body, bodyO, false, panelMat(L, { lamps: [[0.03, 0.7, 0.36, 0.88, 6], [0.64, 0.7, 0.97, 0.88, 6], [0.36, 0.77, 0.64, 0.81, 2]], grille: [[0.1, 0.0, 0.9, 0.34, 14]], text: [0.5, 0.56, 50], hooks: [[0.84, 0.42]], seams: [[0.02, 0.4, 0.98, 0.4]] }, opts.sponsor), 0.03));
  car.add(endPanel(body, bodyO, true, panelMat(L, { grille: [[0.2, 0.12, 0.8, 0.72, 34], [0.02, 0.1, 0.15, 0.5, 16], [0.85, 0.1, 0.98, 0.5, 16]], dark: [[0.0, 0.0, 1.0, 0.07, 0]], hooks: [[0.12, 0.62]] }), 0.07));
  // glasshouse
  car.add(shell([
    { x: -1.75, top: 0.93, bot: 0.85, belt: 0.88, w: 0.72, wt: 0.6, wb: 0.76, n: 4 },
    { x: -1.0, top: 1.16, bot: 0.83, belt: 0.87, w: 0.74, wt: 0.55, wb: 0.8, n: 4.2 },
    { x: -0.4, top: 1.23, bot: 0.8, belt: 0.83, w: 0.75, wt: 0.56, wb: 0.8, n: 4.5 },
    { x: 0.2, top: 1.17, bot: 0.78, belt: 0.82, w: 0.76, wt: 0.56, wb: 0.8, n: 4.2 },
    { x: 0.9, top: 0.84, bot: 0.76, belt: 0.79, w: 0.78, wt: 0.7, wb: 0.8, n: 4 },
  ], { seg: 36, around: 36 }, greenhouseMat(L, { ws: 0.72, side: [0.3, 0.77], split: 0.53, rw: 0.27, rake: 0.1, rq: 0.1, sill: 0.16 }, opts.sponsor)));
  for (const s of [1, -1]) {
    car.add(at(archFlare(0.39, 0.04, 0.028, cg, { side: s, a0: -0.12, a1: Math.PI + 0.1 }), XF, R, s * 0.955)); car.add(at(archFlare(0.395, 0.04, 0.03, cg, { side: s, a0: -0.1, a1: Math.PI + 0.12 }), XR, R, s * 0.97));
    mirror(car, 0.62, 0.9, s * 0.93, s, pri, cg);
    car.add(far(at(box(1.75, 0.09, 0.07, cf), 0.07, 0.19, s * 0.94))); // side skirt
    // lamps: slim LED headlamps on the wings, strip tail lamps
    lens(car, 2.06, 0.645, s * 0.66, 0.17, 0.03, 0.12, HEAD(), s * 0.45, -0.3);
    car.add(far(at(box(0.02, 0.05, 0.42, TAIL()), -2.288, 0.76, s * 0.55)));
    // dive planes and splitter fences
    for (const [y, a] of [[0.33, 0.26], [0.45, 0.34]]) { const d = plate([[0.18, 0], [-0.1, 0.012], [-0.12, 0.03], [0.16, 0.018]], 0.1, cg, 0, 0.002); d.position.set(2.12, y, s * 0.93); d.rotation.set(0, s * 0.3, a); car.add(d); }
    car.add(at(cyl(0.045, 0.045, 0.1, MAT.exhaust(), { seg: 12, open: true }), -0.55, 0.2, s * 0.95)); // side exhaust
    car.add(at(box(0.05, 0.06, 0.012, MAT.band('#e10600')), s > 0 ? 2.36 : -2.26, 0.34, s * 0.3)); // tow strap
  }
  // front intake, splitter, bonnet pins, rear panel, diffuser
  const sp = [[2.52, 0.5], [2.46, 0.84], [2.3, 0.95], [1.85, 0.95]];
  car.add(far(slab([...sp, ...sp.slice().reverse().map(([x, z]) => [x, -z])], 0.022, cf, 0.13)));
  car.add(far(plate([[-1.75, 0.14], [-2.32, 0.34], [-2.32, 0.37], [-1.75, 0.165]], 1.5, cf, 0, 0)));
  for (const z of [-0.6, -0.2, 0.2, 0.6]) car.add(plate([[-1.75, 0.13], [-2.3, 0.15], [-2.3, 0.33], [-1.85, 0.17]], 0.012, cg, z, 0.002));
  // rear wing on swan necks
  const wX = -1.9, wY = 1.2;
  car.add(sweptWing(spanSamples(0.9, 14, () => ({ x: wX, y: wY, c: 0.38, a: -0.12, t: 0.05 })), cg, 3));
  car.add(far(at(box(0.012, 0.028, 1.8, cf), wX - 0.375, wY + 0.075, 0)));
  for (const s of [1, -1]) {
    car.add(far(decalPlate([[wX + 0.06, wY - 0.1], [wX + 0.04, wY + 0.12], [wX - 0.46, wY + 0.16], [wX - 0.46, wY - 0.12], [wX - 0.2, wY - 0.16]], 0.012, endplateMat(L, opts.sponsor), s * 0.91, s < 0)));
    car.add(far(swanNeck(-1.86, 0.9, wX, wY, cg, s * 0.4)));
  }
  car.add(rod([-0.7, 1.22, 0.25], [-0.78, 1.38, 0.25], 0.005, blk)); car.add(at(sph(0.04, blk, { ws: 8, hs: 6, sy: 0.45 }), -0.2, 1.23, 0));
  car.add(blade([0.84, 0.86, 0.05], [0.4, 1.06, 0.3], 0.025, 0.012, blk));
  addWheels(car, [[XF, TZ], [XF, -TZ], [XR, TZ], [XR, -TZ]], R, 0.3, opts.gtTyre || '#ffd400', { kind: 'gt', rim: '#23262b', rimFrac: 0.71, caliper: L.accent }, [0.6, 0.36]);
  car.userData.lamps = { head: [[2.14, 0.6, 0.66], [2.14, 0.6, -0.66]], tail: [[-2.3, 0.76, 0.55], [-2.3, 0.76, -0.55]] };
  return car;
}

// ---------------- Rally1 hatchback ----------------
export function rally(L, opts) {
  const car = new THREE.Group();
  const X0 = -1.9, X1 = 2.15, U = (x) => (x - X0) / (X1 - X0);
  const paint = liveryTexture(L, {
    ...opts, kind: 'rally', details: {
      side: ({ seam, fill, vents }) => {
        seam([[U(0.72), -0.05], [U(0.76), -0.6], [U(0.7), -1]]); seam([[U(-0.3), -0.05], [U(-0.3), -1]]); seam([[U(-0.86), -0.05], [U(-0.8), -0.45], [U(-0.98), -1]]); seam([[U(-0.86), -0.05], [U(0.72), -0.05]]);
        vents(U(0.8), U(0.92), -0.5, -0.86, 2, 0.003);
        seam([[U(-0.1), -0.72], [U(0.02), -0.72]], 0.6, 5); seam([[U(-0.72), -0.72], [U(-0.6), -0.72]], 0.6, 5);
        g2(fill, U(-1.62), -0.7);
      },
      top: ({ seam, fill, vents }) => {
        seam([[U(0.8), -0.4], [U(1.9), -0.37], [U(1.98), 0], [U(1.9), 0.37], [U(0.8), 0.4]]);
        for (const s of [1, -1]) vents(U(1.2), U(1.6), s * 0.2, s * 0.32, 4, 0.004);
      },
    },
  });
  function g2(fill, u, y) { fill([[u - 0.008, y - 0.07], [u + 0.008, y - 0.07], [u + 0.008, y + 0.07], [u - 0.008, y + 0.07]], 'rgba(10,10,12,0.8)'); } // fuel flap
  const pri = MAT.paint(L.primary, finishOf(L)), acc = MAT.paint(L.accent, finishOf(L)), cf = MAT.carbon(), cg = MAT.carbonGloss(), blk = MAT.rubber(), dark = MAT.dark();
  const XF = 1.35, XR = -1.25, R = 0.335, TZ = 0.8;
  const body = [
    { x: -1.9, top: 1.0, bot: 0.42, belt: 0.52, w: 0.84, wt: 0.77, wb: 0.78, n: 4.5 },
    { x: -1.75, top: 1.03, bot: 0.33, belt: 0.47, w: 0.9, wt: 0.8, wb: 0.83, n: 4.5 },
    { x: -1.25, top: 1.03, bot: 0.27, belt: 0.42, w: 0.92, wt: 0.82, wb: 0.86, n: 4.5 },
    { x: -0.3, top: 1.01, bot: 0.26, belt: 0.4, w: 0.88, wt: 0.8, wb: 0.86, n: 5 },
    { x: 0.75, top: 0.99, bot: 0.26, belt: 0.4, w: 0.88, wt: 0.78, wb: 0.86, n: 5 },
    { x: 1.35, top: 0.92, bot: 0.26, belt: 0.4, w: 0.91, wt: 0.78, wb: 0.86, n: 4.5 },
    { x: 1.95, top: 0.79, bot: 0.28, belt: 0.41, w: 0.85, wt: 0.7, wb: 0.82, n: 4 },
    { x: 2.15, top: 0.69, bot: 0.34, belt: 0.44, w: 0.74, wt: 0.6, wb: 0.72, n: 3.6 },
  ], bodyO = { u0: 0, u1: 1, seg: 64, around: 48, capRear: false, capFront: false, arches: [{ x: XF, y: R, r: 0.425, zin: 0.58 }, { x: XR, y: R, r: 0.425, zin: 0.58 }] };
  car.add(shell(body, bodyO, paint));
  // tailgate: tall lamp clusters, rally plate, diffuser; nose: big grille with the front plate
  car.add(endPanel(body, bodyO, false, panelMat(L, { lamps: [[0.02, 0.58, 0.15, 0.98, 6], [0.85, 0.58, 0.98, 0.98, 6]], grille: [[0.14, 0.0, 0.86, 0.3, 12]], plate: [0.5, 0.5, 0.34], text: [0.5, 0.8, 44], hooks: [[0.1, 0.4]], seams: [[0.16, 0.66, 0.84, 0.66]] }, opts.sponsor, opts.number), 0.05));
  car.add(endPanel(body, bodyO, true, panelMat(L, { grille: [[0.14, 0.32, 0.86, 0.8, 26], [0.05, 0.05, 0.3, 0.26, 10], [0.7, 0.05, 0.95, 0.26, 10]], plate: [0.5, 0.15, 0.3], hooks: [[0.86, 0.5]] }, '', opts.number), 0.06));
  const crew = [String(opts.driver || 'M. ROSSI').toUpperCase().slice(0, 12), String(opts.codriver || 'L. BIANCHI').toUpperCase().slice(0, 12)];
  car.add(shell([
    { x: -1.84, top: 1.27, bot: 0.99, belt: 1.02, w: 0.73, wt: 0.6, wb: 0.77, n: 4.5 },
    { x: -1.6, top: 1.41, bot: 0.99, belt: 1.02, w: 0.735, wt: 0.58, wb: 0.79, n: 5 },
    { x: -0.5, top: 1.43, bot: 0.97, belt: 1.0, w: 0.74, wt: 0.58, wb: 0.8, n: 5 },
    { x: 0.25, top: 1.36, bot: 0.95, belt: 0.98, w: 0.74, wt: 0.56, wb: 0.8, n: 4.5 },
    { x: 0.85, top: 1.01, bot: 0.93, belt: 0.96, w: 0.76, wt: 0.68, wb: 0.8, n: 4 },
  ], { seg: 36, around: 36 }, greenhouseMat(L, { ws: 0.77, side: [0.13, 0.8], split: 0.5, rw: 0.1, rake: 0.09, rq: 0.05, sill: 0.14, names: crew }, opts.sponsor)));
  for (const s of [1, -1]) {
    // boxy arch extensions, skirts, mud flaps
    car.add(at(archFlare(0.425, 0.06, 0.13, cg, { side: s, a0: -0.2, a1: Math.PI + 0.2 }), XF, R, s * 0.9)); car.add(at(archFlare(0.425, 0.06, 0.14, cg, { side: s, a0: -0.2, a1: Math.PI + 0.2 }), XR, R, s * 0.91));
    car.add(far(at(box(1.72, 0.1, 0.07, cf), 0.05, 0.3, s * 0.9)));
    for (const x of [XF - 0.47, XR - 0.47]) car.add(at(box(0.012, 0.26, 0.3, MAT.matte('#17181b')), x, 0.21, s * 0.8, 0, 0, 0.14));
    mirror(car, 0.72, 1.06, s * 0.9, s, pri, cg);
    lens(car, 1.96, 0.775, s * 0.6, 0.13, 0.035, 0.15, MAT.light('#f6fbff', 2.4), s * 0.45, -0.3);
    car.add(far(at(box(0.02, 0.24, 0.08, TAIL()), -1.925, 0.88, s * 0.74)));
    // hybrid cooling scoops on the rear doors
    const sc = [{ x: -1.3, top: 1.18, bot: 1.06, w: 0.02, n: 3 }, { x: -1.08, top: 1.23, bot: 1.06, w: 0.05, n: 3.4 }, { x: -0.86, top: 1.24, bot: 1.07, w: 0.055, n: 3.6 }], scO = { seg: 8, around: 16, capFront: false };
    car.add(at(mesh(hull(sc, scO), cg), 0, 0, s * 0.8)); car.add(at(mouth(sc, scO, true, dark, 0.015), 0, 0, s * 0.8));
    car.add(at(box(0.012, 0.16, 0.05, cf), 2.0, 0.44, s * 0.8)); // bumper canard fence
  }
  // bumper intakes, splitter, sump guard, rear bumper cut-out, exhaust
  const sp = [[2.3, 0.4], [2.25, 0.76], [2.12, 0.86], [1.8, 0.86]];
  car.add(far(slab([...sp, ...sp.slice().reverse().map(([x, z]) => [x, -z])], 0.03, cf, 0.3)));
  car.add(at(box(0.9, 0.012, 1.2, MAT.metal('#8b8e94', 0.5)), 1.5, 0.245, 0));
  car.add(at(cyl(0.055, 0.055, 0.16, MAT.exhaust(), { seg: 12, axis: 'x', open: true }), -1.92, 0.56, 0)); car.add(at(cyl(0.048, 0.048, 0.02, dark, { seg: 12, axis: 'x' }), -1.92, 0.56, 0));
  // roof: scoop, antennas
  const rs = [{ x: -0.5, top: 1.5, bot: 1.4, w: 0.1, n: 3 }, { x: -0.1, top: 1.53, bot: 1.4, w: 0.16, n: 3.4 }, { x: 0.2, top: 1.5, bot: 1.36, w: 0.17, n: 3.6 }], rsO = { seg: 10, around: 20, capFront: false };
  car.add(far(mesh(hull(rs, rsO), acc))); car.add(mouth(rs, rsO, true, dark, 0.015));
  car.add(rod([-1.0, 1.42, 0.2], [-1.12, 1.66, 0.2], 0.005, blk)); car.add(rod([-1.0, 1.42, -0.2], [-1.08, 1.56, -0.2], 0.005, blk));
  car.add(blade([0.8, 1.0, 0.0], [0.4, 1.24, 0.28], 0.025, 0.012, blk));
  // towering rear wing: two elements between big end plates, central fins, tailgate struts
  const wX = -1.6, wY = 1.52;
  car.add(sweptWing(spanSamples(0.86, 12, () => ({ x: wX, y: wY, c: 0.34, a: -0.16, t: 0.05 })), acc, 3));
  car.add(sweptWing(spanSamples(0.86, 12, () => ({ x: wX - 0.2, y: wY - 0.2, c: 0.26, a: -0.3, t: 0.04 })), cg, 3));
  for (const s of [1, -1]) {
    car.add(far(decalPlate([[wX + 0.08, wY - 0.32], [wX + 0.06, wY + 0.1], [wX - 0.44, wY + 0.16], [wX - 0.5, wY - 0.3]], 0.014, endplateMat(L, opts.sponsor), s * 0.87, s < 0)));
    car.add(far(plate([[-1.5, 1.38], [-1.84, 1.22], [-1.9, 1.24], [wX - 0.3, wY - 0.02], [wX - 0.04, wY - 0.02]], 0.03, cg, s * 0.45)));
    car.add(plate([[wX + 0.02, wY + 0.02], [wX - 0.36, wY + 0.12], [wX - 0.36, wY - 0.24], [wX - 0.1, wY - 0.22]], 0.01, cg, s * 0.2));
  }
  // light pod for night stages
  if (opts.night) {
    car.add(far(at(box(0.16, 0.2, 0.86, cf), 1.92, 0.92, 0, 0, 0, -0.25)));
    for (const z of [-0.3, -0.1, 0.1, 0.3]) { car.add(far(at(cyl(0.085, 0.085, 0.03, MAT.light('#f6fbff', 2.4), { seg: 16, axis: 'x' }), 2.0, 0.93, z, 0, 0, -0.25 - Math.PI / 2))); }
  }
  addWheels(car, [[XF, TZ], [XF, -TZ], [XR, TZ], [XR, -TZ]], R, 0.24, opts.rallyTyre || '#c9c9c9', { kind: 'rally', rim: '#eceef0', rimFrac: 0.6, tread: 'rally', caliper: '#c8102e' }, [0.6, 0.4]);
  car.userData.lamps = { head: [[2.05, 0.72, 0.6], [2.05, 0.72, -0.6], ...(opts.night ? [[2.05, 0.93, 0.2], [2.05, 0.93, -0.2]] : [])], tail: [[-1.94, 0.88, 0.74], [-1.94, 0.88, -0.74]] };
  return car;
}
