// Scontro Totale — medal balance of the time trial and the long jump, measured with the AI driving
// the player's car (headless WebGL is ~1 fps, so the race is stepped by hand with the renderer off).
//   npx vite preview --port 4691   then   node tools/derby-balance.mjs [baseUrl] [tt|jump|tt,jump]
// The time-trial gold is meant to sit at the pace of a strong AI (the target is built from the AI's
// racing-line profile): the AI's time / gold should land near 1.0 on every venue and car, with the
// bronze (x1.16) always within reach. The long jump: the AI's best jump should reach silver-gold
// with every car class (the targets scale with the car's run-up). Exit code 1 when a venue or a car is
// out of the band.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4691/').replace(/\/?$/, '/');
const ONLY = new Set((process.argv[3] || 'tt,jump').split(','));
const IGNORE = /GPU stall|GL Driver|WebGL|AudioContext|favicon|403 \(Forbidden\)/i;
const errors = []; let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok' : '!!'} ${msg}`); if (!c) fails++; };
const CARS = ['berlina', 'utilitaria', 'familiare', 'muscle', 'furgone', 'pickup', 'rally', 'hotrod'];
const store = { apexdynasty_derby: JSON.stringify({ money: 0, owned: CARS, career: { res: Object.fromEntries(['f1', 'f2', 'f3', 'f4', 'f5', 'l1', 'l2', 'l3', 'l4', 'l5', 'c1', 'c2', 'c3'].map((id) => [id, { medal: 3, runs: 1 }])) } }) };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage(); p.setDefaultTimeout(300000);
p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(m.text()); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
await p.addInitScript(([s]) => { if (!sessionStorage.getItem('bal')) { sessionStorage.setItem('bal', '1'); localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfx: 'low', gfxTier: 'low' })); } }, [store]);
await p.goto(BASE + '?game=derby');
await p.waitForSelector('.dz-menu', { timeout: 90000 });
const click = async (sel) => { await p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error('missing ' + s); el.click(); }, sel); await p.waitForTimeout(120); };
async function run(venue, mode, car) {
  await click('[data-a="dz-tab"][data-id="libero"]');
  await click(`[data-a="dz-venue"][data-id="${venue}"]`);
  await click(`[data-a="dz-mode"][data-id="${mode}"]`);
  await click(`.dz-cars [data-a="dz-car"][data-id="${car}"]`);
  await click('[data-a="dz-go"]');
  await p.waitForFunction(() => ['countdown', 'race'].includes(window.__derby?.state), null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    const g = window.__derby; cancelAnimationFrame(g.raf); g.render = () => {}; g.o.autoReplay = false; g.autopilot(true);
    let n = 0; while (g.state !== 'finished' && n < 60 * 400) { g.frame(1 / 60); n++; }
    const done = g.state === 'finished'; if (!done) { g.finishOrder = [g.player]; g.finish(); }
    return { done, prog: +(g.player.lap + (g.player.prog || 0)).toFixed(2), state: g.state, time: g.player.time, targets: g.targets, dists: g.stunt?.dists, best: g.stunt?.best, resp: g.simStats.respawn };
  });
  await p.waitForFunction(() => window.__derby?.result, null, { timeout: 20000 });
  r.medal = await p.evaluate(() => window.__derby.result.medal);
  if (!r.done) console.log('   (non arrivato al traguardo)', JSON.stringify(r));
  await click('.dz-root [data-a="dz-quit"]');
  await p.waitForSelector('.dz-menu');
  return r;
}
if (ONLY.has('tt')) {
  const venues = (process.env.TT_VENUES || 'cava,otto,pineta,fattoria,stadio,porto,discarica').split(',');
  const cars = (process.env.TT_CARS || 'berlina,muscle,furgone').split(',');
  for (const v of venues) {
    const ratios = [];
    for (const c of cars) {
      const r = await run(v, 'time', c);
      const k = r.time / r.targets[2]; ratios.push(k);
      console.log(`   tt ${v} ${c}: ${r.time.toFixed(1)} s · oro ${r.targets[2]} argento ${r.targets[1]} bronzo ${r.targets[0]} · x${k.toFixed(3)} · medaglia ${r.medal} · respawn ${r.resp}`);
    }
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    ok(avg > 0.93 && avg < 1.09, `tempo ${v}: AI / oro in media x${avg.toFixed(3)} (banda 0.93-1.09)`);
  }
}
if (ONLY.has('jump')) {
  for (const c of (process.env.JUMP_CARS || CARS.join(',')).split(',')) {
    const r = await run('rampa', 'stunt', c);
    const k = r.best / r.targets[2];
    ok(r.best >= r.targets[0] && k < 1.15, `salto ${c}: migliore ${r.best} m (${r.dists.join(' / ')}) · bronzo ${r.targets[0]} argento ${r.targets[1]} oro ${r.targets[2]} · x${k.toFixed(3)} · medaglia ${r.medal}`);
  }
}
ok(!errors.length, `nessun errore in console${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
