// Formula single-seaters: the 2022+ ground-effect car (wheel covers, wake deflectors,
// multi-element wings) and the simpler junior-formula car (opts.jr).
import * as THREE from 'three';
import { MAT, mesh, far, at, box, cyl, sph, rod, blade, finishOf, tube, plate, slab, decalPlate, hull, shell, mouth, sweptWing, spanSamples, memo, canvas, canvasTex, cached } from './core.js';
import { liveryTexture, endplateMat, finMat, helmetMat } from './livery.js';
import { wheel } from './wheels.js';

// steering wheel with gloves and a dash display (seen in the cockpit camera)
export function steeringWheel(cf, glove) {
  const sw = new THREE.Group();
  sw.add(box(0.03, 0.12, 0.25, cf));
  for (const z of [-0.135, 0.135]) { sw.add(at(cyl(0.022, 0.022, 0.14, MAT.rubber(), { seg: 8, axis: 'y' }), 0, -0.005, z)); const gl = sph(0.036, glove, { ws: 10, hs: 8, sx: 1.25, sy: 1.1, sz: 0.85 }); gl.position.set(-0.02, 0.005, z); sw.add(gl); sw.add(rod([-0.03, 0, z], [-0.26, -0.1, z * 1.25], 0.03, glove, 8)); }
  const disp = new THREE.Mesh(memo('dash', 0, () => new THREE.PlaneGeometry(0.1, 0.05)), cached('dashMat', () => {
    const [dc, dx] = canvas(128, 64);
    dx.fillStyle = '#05070a'; dx.fillRect(0, 0, 128, 64); dx.fillStyle = '#18e06a'; dx.font = 'bold 34px monospace'; dx.textAlign = 'center'; dx.fillText('7', 64, 44); dx.font = 'bold 12px monospace'; dx.fillStyle = '#ffd400'; dx.fillText('-0.142', 26, 58); dx.fillStyle = '#4fc3ff'; dx.fillText('ERS 78%', 100, 58);
    for (let k = 0; k < 10; k++) { dx.fillStyle = k < 4 ? '#18e06a' : k < 7 ? '#ff3030' : '#4f7dff'; dx.fillRect(10 + k * 11, 4, 8, 6); }
    return new THREE.MeshBasicMaterial({ map: canvasTex(dc) });
  }));
  disp.position.set(-0.016, 0.012, 0); disp.rotation.y = -Math.PI / 2; sw.add(disp);
  for (const [z, c] of [[-0.085, '#e10600'], [0.085, '#18e06a'], [-0.085, '#ffd400'], [0.085, '#4fc3ff']].entries()) { const b = box(0.012, 0.014, 0.014, MAT.band(c[1])); b.position.set(-0.018, z < 2 ? 0.03 : -0.03, c[0]); sw.add(b); }
  return sw;
}
export function helmet(car, x, y, z, base, L, number, r = 0.125) {
  const h = mesh(memo('helm', 0, () => new THREE.SphereGeometry(1, 28, 18)), helmetMat(base || '#ffd400', L, number)); h.position.set(x, y, z); h.scale.set(r * 1.16, r, r); car.add(h);
  // visor faces forward (+x): sphere phi = pi points along +x
  const v = mesh(memo('visor', 0, () => new THREE.SphereGeometry(1.03, 22, 10, Math.PI - 0.95, 1.9, 1.2, 0.44)), MAT.visor()); v.position.copy(h.position); v.scale.copy(h.scale); car.add(v);
  car.userData.helmetParts = [h, v];
  return h;
}

export function formula(L, opts) {
  const jr = !!opts.jr;
  const car = new THREE.Group();
  const U = { m: (x) => 0.6 + 0.4 * (x + 1.0) / 3.88, s: (x) => 0.3 + 0.3 * (x + 1.95) / 2.57, e: (x) => 0.3 * (x + 2.3) / 1.74 };
  const paint = liveryTexture(L, {
    ...opts, kind: 'formula', details: {
      side: ({ seam, vents }) => {
        seam([[U.m(1.92), 0], [U.m(1.92), -1]]); seam([[U.m(0.5), -0.1], [U.m(0.5), -1]]);
        seam([[U.s(0.3), -0.05], [U.s(0.3), -1]]); seam([[U.s(-0.9), -0.05], [U.s(-0.9), -1]]); seam([[U.s(-1.7), -0.6], [U.s(0.5), -0.6]], 0.3);
        seam([[U.e(-1.0), 0], [U.e(-1.0), -1]]); seam([[U.e(-2.2), -0.45], [U.e(-0.7), -0.45]], 0.3);
        vents(U.e(-1.75), U.e(-1.25), -0.2, -0.38, 6, 0.006);
      },
      top: ({ seam, vents }) => {
        seam([[U.m(1.92), -0.5], [U.m(1.92), 0.5]]);
        for (const s of [1, -1]) { vents(U.s(-1.05), U.s(-0.35), s * 0.2, s * 0.36, 7, 0.008); seam([[U.s(-1.6), s * 0.12], [U.s(0.55), s * 0.12]], 0.3); }
      },
    },
  });
  const pri = MAT.paint(L.primary, finishOf(L)), sec = MAT.paint(L.secondary, finishOf(L)), acc = MAT.paint(L.accent, finishOf(L)), cf = MAT.carbon(), cg = MAT.carbonGloss(), blk = MAT.rubber(), dark = MAT.dark();
  const XF = 1.8, XR = -1.8;
  // survival cell + nose
  car.add(shell([
    { x: -1.0, top: 0.66, bot: 0.06, w: 0.3, wt: 0.26, wb: 0.26, n: 3 },
    { x: -0.3, top: 0.68, bot: 0.06, w: 0.33, wt: 0.28, wb: 0.3, n: 3 },
    { x: 0.3, top: 0.665, bot: 0.07, w: 0.32, wt: 0.25, wb: 0.3, n: 3 },
    { x: 1.0, top: 0.62, bot: 0.15, w: 0.25, wt: 0.19, wb: 0.22, n: 2.9 },
    { x: 1.8, top: 0.52, bot: 0.21, w: 0.17, wt: 0.13, wb: 0.15, n: 2.7 },
    { x: 2.35, top: 0.375, bot: 0.2, w: 0.125, wt: 0.1, wb: 0.11, n: 2.6 },
    { x: 2.75, top: 0.26, bot: 0.17, w: 0.095, wt: 0.08, wb: 0.085, n: 2.5 },
    { x: 2.88, top: 0.215, bot: 0.17, w: 0.06, wt: 0.05, wb: 0.05, n: 2.3 },
  ], { u0: 0.6, u1: 1, seg: 56, around: 32 }, paint));
  // sidepods: high letterbox inlets, deep undercut, downwash ramp into the coke bottle
  const pod = [
    { x: -1.95, top: 0.25, bot: 0.11, belt: 0.16, w: 0.24, wt: 0.18, wb: 0.22, n: 3 },
    { x: -1.4, top: 0.36, bot: 0.1, belt: 0.19, w: 0.45, wt: 0.34, wb: 0.38, n: 3.2 },
    { x: -0.9, top: 0.5, bot: 0.1, belt: 0.25, w: 0.67, wt: 0.53, wb: 0.44, n: 3.4 },
    { x: -0.3, top: 0.6, bot: 0.12, belt: 0.31, w: 0.78, wt: 0.66, wb: 0.44, n: 3.8, nb: 3 },
    { x: 0.3, top: 0.615, bot: 0.22, belt: 0.38, w: 0.77, wt: 0.68, wb: 0.46, n: 4.2, nb: 3 },
    { x: 0.62, top: 0.6, bot: 0.4, belt: 0.47, w: 0.71, wt: 0.65, wb: 0.6, n: 4.4, nb: 3.4 },
  ], podO = { u0: 0.3, u1: 0.6, seg: 44, around: 40, capFront: false };
  car.add(shell(pod, podO, paint)); car.add(mouth(pod, podO, true, dark, 0.035));
  // engine cover, airbox and roll hoop
  const cover = [
    { x: -2.3, top: 0.46, bot: 0.3, w: 0.07, wt: 0.04, n: 2.6 },
    { x: -1.9, top: 0.6, bot: 0.28, w: 0.17, wt: 0.08, n: 2.8 },
    { x: -1.4, top: 0.8, bot: 0.3, w: 0.26, wt: 0.12, n: 3 },
    { x: -0.9, top: 0.95, bot: 0.4, w: 0.24, wt: 0.13, n: 3 },
    { x: -0.56, top: 0.975, bot: 0.66, w: 0.16, wt: 0.11, n: 2.8 },
  ], coverO = { u0: 0, u1: 0.3, seg: 40, around: 32, capFront: false };
  car.add(shell(cover, coverO, paint)); car.add(mouth(cover, coverO, true, dark, 0.03));
  // roll hoop splitter in the airbox mouth, T-camera (black on one car, yellow on the other)
  car.add(box(0.05, 0.3, 0.02, cf, -0.59, 0.82, 0));
  const tc = MAT.paint((opts.number || 0) % 2 ? '#ffd400' : '#101012');
  car.add(far(box(0.16, 0.045, 0.035, tc, -0.66, 1.0, 0))); car.add(box(0.09, 0.03, 0.2, tc, -0.66, 1.0, 0));
  // engine cover fin with the race number and driver code
  for (const s of [1, -1]) car.add(far(decalPlate([[-0.95, 0.93], [-2.12, 0.72], [-2.12, 0.6], [-1.35, 0.78]], 0.006, finMat(L, opts.number, opts.driver, s < 0), s * 0.0035, s < 0)));
  // cockpit: dark opening, padded surround, driver
  car.add(mesh(hull([{ x: -0.62, top: 0.7, bot: 0.6, w: 0.19, n: 2.6 }, { x: -0.2, top: 0.705, bot: 0.6, w: 0.225, n: 2.8 }, { x: 0.26, top: 0.69, bot: 0.6, w: 0.13, n: 2.6 }], { seg: 12, around: 20 }), dark));
  car.add(tube([[0.12, 0.69, 0.17], [-0.2, 0.715, 0.235], [-0.5, 0.75, 0.2], [-0.62, 0.79, 0], [-0.5, 0.75, -0.2], [-0.2, 0.715, -0.235], [0.12, 0.69, -0.17]], 0.036, blk, { seg: 28, rad: 8 }));
  car.add(at(sph(0.2, MAT.matte(L.primary), { ws: 14, hs: 10, sx: 0.8, sy: 0.5, sz: 1 }), -0.36, 0.66, 0));
  helmet(car, -0.3, 0.775, 0, opts.helmet, L, opts.number);
  const sw = steeringWheel(cf, MAT.matte(L.primary === '#ffffff' ? '#202226' : L.secondary)); sw.position.set(0.02, 0.705, 0); sw.rotation.z = 0.4; car.add(sw);
  // halo with its centre strut
  car.add(far(tube([[-0.66, 0.7, 0.275], [-0.42, 0.865, 0.275], [-0.08, 0.9, 0.2], [0.2, 0.875, 0], [-0.08, 0.9, -0.2], [-0.42, 0.865, -0.275], [-0.66, 0.7, -0.275]], 0.028, cg, { seg: 44, rad: 10 })));
  car.add(blade([0.2, 0.875, 0], [0.4, 0.655, 0], 0.07, 0.034, cg));
  // mirrors on stays
  for (const s of [1, -1]) {
    const z = s * 0.57;
    car.add(blade([0.3, 0.6, s * 0.44], [0.44, 0.735, z], 0.03, 0.012, cg)); car.add(blade([0.44, 0.735, z], [0.46, 0.62, s * 0.66], 0.03, 0.01, cg));
    car.add(at(sph(1, pri, { ws: 14, hs: 10, sx: 0.05, sy: 0.027, sz: 0.085 }), 0.45, 0.75, z));
    const gl = new THREE.Mesh(memo('mglass', 0, () => new THREE.PlaneGeometry(0.15, 0.058)), MAT.mirror()); gl.position.set(0.39, 0.75, z); gl.rotation.y = -Math.PI / 2; car.add(gl);
  }
  // floor with raised leading edge, edge wings and tunnel fences, diffuser
  const fl = [[1.28, 0.26], [1.12, 0.62], [0.82, 0.9], [0.3, 0.955], [-0.95, 0.955], [-1.3, 0.9], [-1.44, 0.6], [-2.12, 0.56]];
  car.add(far(slab([...fl, ...fl.slice().reverse().map(([x, z]) => [x, -z])], 0.02, cf, 0.05)));
  for (const s of [1, -1]) {
    car.add(at(plate([[0.25, 0.075], [-0.92, 0.075], [-0.98, 0.13], [0.1, 0.12]], 0.01, cg), 0, 0, s * 0.955));
    for (const [z, ry, h] of [[0.36, 0.1, 0.11], [0.52, 0.2, 0.13], [0.7, 0.34, 0.13], [0.86, 0.5, 0.11]]) { const f = plate([[0.3, 0], [-0.1, 0], [-0.06, h], [0.2, h * 0.7]], 0.008, cg); f.position.set(0.82, 0.06, s * z); f.rotation.y = -s * ry; car.add(f); }
  }
  car.add(far(plate([[XR + 0.1, 0.055], [-2.05, 0.11], [-2.33, 0.25], [-2.33, 0.27], [-2.05, 0.13], [XR + 0.1, 0.075]], 1.04, cf, 0, 0)));
  for (const z of [-0.52, -0.2, 0.2, 0.52]) car.add(plate([[XR + 0.05, 0.05], [-2.33, 0.07], [-2.33, 0.25], [-2.05, 0.11], [XR, 0.07]], 0.01, cg, z, 0.002));
  // front wing: elements sweep back and up towards the end plates
  const NE = jr ? 3 : 4, fwX = 2.95;
  const fw = (k) => spanSamples(0.955, 22, (u) => {
    const out = Math.max(0, (u - 0.16) / 0.84), tip = Math.max(0, (u - 0.8) / 0.2);
    return { x: fwX - 0.035 - k * 0.135 - out * out * (0.16 - k * 0.02), y: 0.085 + k * 0.047 + out * (0.012 * k) - tip * tip * k * 0.03, c: (0.225 - k * 0.02) * (1 - out * 0.12), a: -0.05 - k * (jr ? 0.2 : 0.16) + tip * 0.1 * k, t: 0.03 - k * 0.003 };
  });
  const fwM = jr ? [cg, pri, acc] : [cg, pri, pri, sec];
  for (let k = 0; k < NE; k++) car.add(sweptWing(fw(k), fwM[k], 4));
  for (const s of [1, -1]) {
    const ep = far(plate([[fwX - 0.12, 0.045], [fwX - 0.75, 0.045], [fwX - 0.8, 0.3], [fwX - 0.62, 0.345], [fwX - 0.3, 0.2], [fwX - 0.14, 0.11]], 0.012, pri)); ep.position.z = s * 0.972; ep.rotation.y = s * 0.05; car.add(ep);
    car.add(at(plate([[fwX - 0.3, 0.2], [fwX - 0.62, 0.22], [fwX - 0.62, 0.235], [fwX - 0.32, 0.215]], 0.09, cg), 0, 0, s * 1.0));
  }
  // nose cameras, pitot tubes, antennas
  for (const s of [1, -1]) car.add(at(sph(1, cf, { ws: 10, hs: 8, sx: 0.07, sy: 0.022, sz: 0.035 }), 2.3, 0.33, s * 0.15));
  car.add(rod([1.4, 0.58, 0.05], [1.37, 0.72, 0.05], 0.004, blk)); car.add(rod([1.37, 0.72, 0.05], [1.44, 0.725, 0.05], 0.004, blk));
  car.add(rod([-1.15, 0.86, 0], [-1.22, 1.0, 0], 0.005, blk));
  // rear wing: main plane and flap between rounded end plates, swan-neck pylon, beam wing
  const rs = jr ? 0.47 : 0.52, rwT = jr ? 0.88 : 0.94;
  car.add(sweptWing(spanSamples(rs, 14, (u) => ({ x: -2.07, y: rwT - 0.16 + u * u * 0.045, c: 0.34, a: -0.14 - (1 - u * u) * 0.06, t: 0.045 })), pri, 3));
  car.add(sweptWing(spanSamples(rs, 14, (u) => ({ x: -2.37, y: rwT - 0.055 + u * u * 0.01, c: 0.21, a: -0.62, t: 0.03 })), acc, 3));
  const epP = jr ? [[-2.0, 0.42], [-1.98, rwT + 0.02], [-2.64, rwT + 0.02], [-2.62, 0.56], [-2.42, 0.42]] : [[-2.03, 0.36], [-1.985, 0.68], [-2.03, rwT - 0.1], [-2.14, rwT - 0.02], [-2.62, rwT + 0.015], [-2.67, rwT - 0.04], [-2.62, 0.52], [-2.46, 0.36]];
  for (const s of [1, -1]) car.add(far(decalPlate(epP, 0.012, endplateMat(L, opts.sponsor), s * rs, s < 0)));
  car.add(at(sph(1, cg, { ws: 10, hs: 8, sx: 0.11, sy: 0.022, sz: 0.03 }), -2.3, rwT - 0.045, 0)); // DRS actuator
  car.add(far(plate([[-1.98, 0.45], [-2.12, 0.45], [-2.3, rwT - 0.15], [-2.2, rwT - 0.15]], 0.028, cg)));
  car.add(sweptWing(spanSamples(rs - 0.02, 8, () => ({ x: -2.12, y: 0.4, c: 0.2, a: -0.12, t: 0.025 })), cg, 2));
  car.add(sweptWing(spanSamples(rs - 0.02, 8, () => ({ x: -2.28, y: 0.47, c: 0.15, a: -0.4, t: 0.02 })), cg, 2));
  // gearbox / crash structure, exhaust, rain light
  car.add(mesh(hull([{ x: -2.46, top: 0.4, bot: 0.33, w: 0.035, n: 2.5 }, { x: -2.2, top: 0.42, bot: 0.3, w: 0.07, n: 2.5 }, { x: -1.7, top: 0.44, bot: 0.16, w: 0.15, n: 2.8 }], { seg: 8, around: 16 }), cf));
  car.add(at(cyl(0.052, 0.052, 0.3, MAT.metal('#5c5148', 0.4), { seg: 14, axis: 'x', open: true }), -2.26, 0.475, 0)); car.add(at(cyl(0.046, 0.046, 0.02, dark, { seg: 14, axis: 'x' }), -2.38, 0.475, 0));
  car.add(box(0.03, 0.06, 0.11, MAT.light('#ff2020', 3), -2.47, 0.365, 0));
  // suspension (push-rod front, pull-rod rear) in aero-profiled carbon, uprights, wheels
  const wheels = [];
  const WH = [[XF, 0.81, 0.36, 0.305, true], [XF, -0.81, 0.36, 0.305, true], [XR, 0.79, 0.36, 0.405, false], [XR, -0.79, 0.36, 0.405, false]];
  for (const [x, z, r, w, front] of WH) {
    const s = Math.sign(z);
    const wh = wheel(r, w, opts.tyre, { kind: jr ? 'jr' : 'f1', rim: jr ? '#1b1d21' : L.accent, cover: '#15171b', rimFrac: 0.635, side: s, caliper: L.accent }); wh.position.set(x, r, z); car.add(wh); wheels.push(wh);
    const zo = z - s * (w / 2 + 0.01), ch = 0.075, th = 0.016;
    if (front) {
      car.add(blade([x + 0.25, 0.47, s * 0.13], [x, 0.5, zo], ch, th, cg)); car.add(blade([x - 0.33, 0.52, s * 0.17], [x, 0.5, zo], ch, th, cg));
      car.add(blade([x + 0.24, 0.245, s * 0.12], [x, 0.21, zo], ch, th, cg)); car.add(blade([x - 0.36, 0.24, s * 0.16], [x, 0.21, zo], ch, th, cg));
      car.add(blade([x - 0.02, 0.23, zo], [x - 0.1, 0.5, s * 0.15], 0.045, 0.014, cg)); car.add(blade([x + 0.13, 0.37, s * 0.13], [x + 0.1, 0.36, zo], 0.04, 0.012, cg));
    } else {
      car.add(blade([x + 0.3, 0.42, s * 0.14], [x, 0.5, zo], ch, th, cg)); car.add(blade([x - 0.22, 0.42, s * 0.08], [x, 0.5, zo], ch, th, cg));
      car.add(blade([x + 0.34, 0.2, s * 0.15], [x, 0.21, zo], ch, th, cg)); car.add(blade([x - 0.24, 0.2, s * 0.09], [x, 0.21, zo], ch, th, cg));
      car.add(blade([x + 0.02, 0.48, zo], [x + 0.2, 0.22, s * 0.14], 0.045, 0.014, cg)); car.add(rod([x, 0.34, s * 0.1], [x, 0.36, zo], 0.022, MAT.metal('#3b3d42', 0.45), 8));
    }
    // upright / brake drum and the cooling scoop
    car.add(at(cyl(r * 0.5, r * 0.56, 0.05, cf, { seg: 18 }), x, r, zo - s * 0.01));
    car.add(at(plate([[0.14, -0.16], [0.24, -0.2], [0.24, 0.16], [0.12, 0.2], [-0.04, 0.12], [-0.04, -0.1]], 0.05, cf), x, r, zo - s * 0.045));
    if (front && !jr) { const wl = sweptWing(spanSamples(0.115, 4, (u, zz) => ({ x: x + 0.24, y: r * 2 + 0.035 - (zz * s > 0 ? u * 0.05 : 0), c: 0.36, a: 0.1, t: 0.03 })), cg); wl.position.z = z - s * 0.12; car.add(wl); car.add(blade([x + 0.02, r * 2 + 0.03, z - s * 0.2], [x + 0.02, r + 0.1, zo - s * 0.03], 0.1, 0.01, cg)); }
  }
  car.userData.wheels = wheels;
  // lamp positions (car-local) for the race view's glow / beam effects
  car.userData.lamps = { head: [], tail: [[-2.5, 0.365, 0]], rain: true };
  return car;
}
