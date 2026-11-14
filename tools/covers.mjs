// Renders the Baso Hub covers from the games themselves: node tools/covers.mjs [baseUrl] [only]
// Needs a running preview (npx vite preview). Writes public/covers/<game>.webp (1600x900).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://127.0.0.1:4417/';
const ONLY = process.argv[3] || '';
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const W = 1600, H = 900;
async function shot(page, name) {
  const buf = await page.screenshot({ type: 'png', timeout: 240000 });
  const out = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, buf.toString('base64'));
  writeFileSync(`public/covers/${name}.webp`, Buffer.from(out, 'base64'));
  console.log('cover', name, Math.round(out.length * 0.75 / 1024), 'KB');
}
const settings = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false, reduceMotion: false });

// ---- Voragine: a big hole swallowing a downtown block at dusk
if (!ONLY || ONLY === 'voragine') {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript((s) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_voragine_v1', JSON.stringify({ mode: 'classica', city: 'notte', diff: 'normale', skin: 'notte', owned: ['notte'] })); }, settings);
  await page.goto(BASE + '?game=voragine'); await page.click('[data-a=vg-play]');
  await page.waitForFunction(() => window.__voragine?.me, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__voragine; g.count = 0; g.paused = true; g.me.player = false;
    for (let i = 0; i < 30 * 30; i++) g.step(1 / 30);
    // park the hero hole next to the tallest thing around and let it start falling
    const tall = g.objs.filter((o) => o.st === 0 && (o.k.id === 'tower' || o.k.id === 'office')).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const me = g.me; me.pts = 1500; me.r = 1.6 + 0.25 * Math.sqrt(1500); me.x = tall.x + me.r * 0.15; me.z = tall.z + me.r * 0.1; g.applyHoleSize(me);
    for (let i = 0; i < 9; i++) { g.eat(); g.updateFalling(1 / 30); g.updateDust(1 / 30); g.animateMovers(1 / 30); }
    document.querySelector('.vg-hud').style.display = 'none';
    g.camOverride = (cam) => { cam.position.set(me.x - me.r * 2.6, me.r * 2.4 + 18, me.z + me.r * 3.4); cam.fov = 40; cam.updateProjectionMatrix(); cam.lookAt(me.x, me.r * 0.6, me.z); };
  });
  await page.waitForTimeout(2500);
  await shot(page, 'voragine');
  await page.close();
}
// ---- Flatout (Scontro Totale): a staged T-bone in the arena at sunset. The physics runs without drawing
// (software WebGL crawls), the cars are placed on a collision course, the sim is stepped to the frame
// just after the impact (sparks, crumpled door, glass, a driver on the way out) and photo mode frames it
// low and wide, with a car flying over the pile and another sliding sideways in the dust behind.
// Tweak with COVER_* env vars: COVER_AFTER (frames after contact), COVER_YAW, COVER_DIST, COVER_PITCH, COVER_FOV
if (!ONLY || ONLY === 'derby') {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript((s) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('apexdynasty_derby', JSON.stringify({ money: 0, owned: ['berlina', 'utilitaria', 'muscle'], looks: { muscle: { color: '#e8a10c', livery: 'fiamme', num: 7 } } })); }, settings);
  await page.goto(BASE + '?game=derby'); await page.waitForSelector('.dz-menu');
  await page.click('.dz-tab[data-id=libero]'); await page.waitForTimeout(400);
  await page.click('.dz-venue[data-id=arena]'); await page.waitForTimeout(300);
  await page.click('.dz-mode[data-id=derby]'); await page.click(`[data-a=dz-weather][data-v=${process.env.COVER_WX || 'tramonto'}]`); await page.click('.dz-car[data-id=muscle]'); await page.waitForTimeout(300);
  await page.click('[data-a=dz-go]');
  await page.waitForFunction(() => window.__derby?.state === 'countdown', null, { timeout: 120000 });
  const env = { after: +(process.env.COVER_AFTER || 5), yaw: +(process.env.COVER_YAW || 3.75), dist: +(process.env.COVER_DIST || 13), pitch: +(process.env.COVER_PITCH || 0.12), fov: +(process.env.COVER_FOV || 44) };
  const info = await page.evaluate(async (E) => {
    const g = window.__derby, render = g.render.bind(g); g.render = () => {}; cancelAnimationFrame(g.raf);
    g.countdown = 0.02; for (let i = 0; i < 30; i++) g.frame(1 / 60);
    const T = g.terrain, P = g.player, [V, A, C, ...rest] = g.cars.filter((c) => c !== P);
    const place = (car, x, z, yaw, v, { vy = 0, lift = 0, av = null, slide = 0 } = {}) => {
      car.body.setTranslation({ x, y: T.heightAt(x, z) + 0.75 + lift, z }, true);
      car.body.setRotation({ x: 0, y: Math.sin(-yaw / 2), z: 0, w: Math.cos(-yaw / 2) }, true);
      const vd = yaw + slide; car.body.setLinvel({ x: Math.cos(vd) * v, y: vy, z: Math.sin(vd) * v }, true); car.body.setAngvel(av || { x: 0, y: 0, z: 0 }, true);
    };
    const x0 = T.cx + 6, z0 = T.cz - 4;
    // clear the loose props off the set (bales and crates would hide the hit)
    for (const k of Object.keys(g.propTypes)) for (const b of g.propTypes[k].list) { const t = b.translation(), dx = t.x - x0, dz = t.z - z0, d = Math.hypot(dx, dz); if (d < 22) b.setTranslation({ x: x0 + dx / (d || 1) * 30, y: t.y, z: z0 + dz / (d || 1) * 30 }, true); }
    for (const k of Object.keys(g.propTypes)) g.syncProps(k, true);
    place(V, x0, z0, 0, 7); V.hp = 55;                                    // the victim, rolling across
    place(P, x0 + 4.2, z0 - 17, Math.PI / 2, 29); P.boost = true;          // the hero, flat out into its door
    place(A, x0 + 14, z0 + 16, -2.0, 15, { vy: 8.5, lift: 1.2, av: { x: 2.6, y: 0.4, z: 1.2 } }); // off the pile, mid-air behind
    place(C, x0 + 24, z0 + 6, Math.PI + 0.4, 15, { slide: 0.9 });     // sliding sideways in the dust
    rest.forEach((c, i) => place(c, T.cx - 30 + i * 9, T.cz + 34 - i * 6, -1.2 + i * 0.5, 6));
    const drive = { thr: 1, brk: 0, st: 0, hb: 0, nitro: 0 };
    g.aiInput = (car) => (car === C ? { thr: 1, brk: 0, st: 1, hb: 1, nitro: 0 } : drive); g.readInput = () => ({ ...drive, nitro: 1 });
    let hit = -1, i = 0;
    for (; i < 240; i++) {
      g.frame(1 / 60);
      const a = P.body.translation(), b = V.body.translation();
      if (hit < 0 && (Math.hypot(a.x - b.x, a.z - b.z) < 3.0 || V.lastHit?.by === P)) hit = i;
      if (hit >= 0 && i >= hit + E.after) break;
    }
    // sync the meshes and the particles with an almost frozen clock, then freeze in photo mode
    g.render = render; g.slowT = 0; g.timeScale = 1;
    const a = P.body.translation(), b = V.body.translation(), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, gy = T.heightAt(mx, mz);
    // the arena floor goes up: a ring of dust around the pile, a rooster tail behind the hero, a last fan of sparks
    for (let k = 0; k < 70; k++) { const an = Math.random() * 6.28, r = 1.5 + Math.random() * 4; g.dust.emit(mx + Math.cos(an) * r, gy + 0.3, mz + Math.sin(an) * r, Math.cos(an) * 2.5, 0.6 + Math.random() * 1.4, Math.sin(an) * 2.5, 2 + Math.random() * 1.5, 1.8 + Math.random() * 1.6, 0.62, 0.48, 0.34, 0.22); }
    for (let k = 0; k < 40; k++) g.dust.emit(a.x + (Math.random() - 0.5) * 2, gy + 0.3, a.z - 3 - Math.random() * 7, (Math.random() - 0.5) * 2, 0.8 + Math.random(), -2 - Math.random() * 3, 2.2, 1.6 + Math.random() * 1.8, 0.6, 0.47, 0.33, 0.25);
    for (let k = 0; k < 70; k++) g.sparks.emit(mx, gy + 0.9, mz, (Math.random() - 0.3) * 16, Math.random() * 9, (Math.random() - 0.2) * 14, 0.4 + Math.random() * 0.5, 0.45, 1, 0.75, 0.35);
    for (let k = 0; k < 3; k++) g.render(1 / 50, false, null, 1 / 50);
    g.photoMode(true); g.hud.root.classList.add('photo-clean');
    Object.assign(g.photo, { tx: (a.x + b.x) / 2 + 3.5, ty: Math.max(a.y, b.y) + 1.4, tz: (a.z + b.z) / 2 + 2.5, yaw: E.yaw, pitch: E.pitch, dist: E.dist, fov: E.fov, roll: -0.04 });
    g.photoFrame(1 / 60);
    return { hit, i, ej: g.ejections || 0, vhp: Math.round(V.hp), air: Math.round(A.body.translation().y - T.heightAt(A.body.translation().x, A.body.translation().z)) };
  }, env);
  console.log('derby stage', JSON.stringify(info));
  await page.waitForTimeout(5000);
  await shot(page, 'derby');
  await page.close();
}
// ---- Manager (Apex Dynasty): a TV shot from the highlights of a simulated Grand Prix
if (!ONLY || ONLY === 'apex') {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript((s) => localStorage.setItem('apexdynasty_settings', s), settings);
  await page.goto(BASE + '?nointro&game=apex'); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 60000 });
  await page.evaluate(() => window.__apex.App.go('newgame')); await page.waitForTimeout(800);
  await page.click('[data-a="next"]'); await page.locator('[data-a="pick-team"]').first().click(); await page.click('[data-a="next"]'); await page.click('[data-a="start"]');
  await page.waitForFunction(() => window.__apex.App.cur === 'hub' && window.__apex.ready, null, { timeout: 60000 });
  await page.evaluate(() => { document.querySelector('.tour-mask')?.remove(); window.__apex.simRound(); });
  await page.evaluate(() => window.__apex.highlights(0, {}));
  await page.waitForSelector('.hl-wrap', { timeout: 400000 });
  // first clip is the start: the whole grid bunched up. Take over the camera: low chase behind the pack
  await page.waitForFunction(() => window.__hl?.cur?.r3d?._ready, null, { timeout: 600000 });
  await page.evaluate(() => {
    const hv = window.__hl.cur, r = hv.r3d;
    hv._coverCam = setInterval(() => { r.director = false; r.camMode = process?.env?.x || 'chase'; r.replay = true; }, 200);
  }).catch(() => page.evaluate(() => { const hv = window.__hl.cur, r = hv.r3d; hv._coverCam = setInterval(() => { r.director = false; r.camMode = 'chase'; r.replay = true; }, 200); }));
  await page.waitForTimeout(Number(process.env.COVER_WAIT || 25000));
  await page.evaluate(() => { window.__hl.cur.paused = true; for (const s of ['.hl-bug', '.hl-top-r', '.hl-tower', '.hl-replay', '.hl-lower', '.hl-letter', '.hl-ctrl', '.hl-bar', '.hl-chapters', '.hl-end', '.hl-seg', '.tip']) document.querySelectorAll(s).forEach((e) => (e.style.display = 'none')); document.querySelectorAll('.hl-wrap > *:not(.hl-stage)').forEach((e) => (e.style.display = 'none')); });
  await page.waitForTimeout(4000);
  await shot(page, 'apex');
  await page.close();
}
await browser.close();
