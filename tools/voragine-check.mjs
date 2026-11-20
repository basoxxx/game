// Voragine — cheap regression checks on a running preview (the match is stepped with window.__voragine.step):
//   · every mode to the results with the autopilot: coins in the save = the coins on the card (+ track rewards)
//   · Battaglia: eaten, then "Ricomincia" at once: the old match must not end later (no stray results card,
//     no extra game counted or coins paid), and eaten while paused waits for the game clock
//   · no console errors
//   npx vite preview --port 4691   then   node tools/voragine-check.mjs [baseUrl]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4691/').replace(/\/?$/, '/');
const IGNORE = /GPU stall|GL Driver|WebGL|AudioContext|favicon|403 \(Forbidden\)/i;
const errors = []; let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok' : '!!'} ${msg}`); if (!c) fails++; };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage(); p.setDefaultTimeout(240000);
p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(m.text()); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
await p.addInitScript(() => { if (!sessionStorage.getItem('vgc')) { sessionStorage.setItem('vgc', '1'); localStorage.clear(); localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfx: 'low', gfxTier: 'low' })); } });
await p.goto(BASE + '?game=voragine');
await p.waitForSelector('.vg-menu', { timeout: 90000 });
const click = (sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error('missing ' + s); el.click(); }, sel).then(() => p.waitForTimeout(150));
const save = () => p.evaluate(() => JSON.parse(localStorage.getItem('sala_voragine_v1') || '{}'));
const begin = async () => { await p.waitForFunction(() => window.__voragine?.me, null, { timeout: 120000 }); await p.evaluate(() => { const g = window.__voragine; cancelAnimationFrame(g.raf); g.raf = 0; g.autopilot = true; }); };

for (const mode of ['classica', 'battaglia', 'solitaria']) {
  await click(`[data-a="vg-mode"][data-id="${mode}"]`);
  const before = await save();
  await click('[data-a="vg-play"]'); await begin();
  await p.evaluate(() => { const g = window.__voragine; let n = 0; while (!g.over && n < 60 * 200) { g.step(1 / 60); n++; } });
  await p.waitForSelector('.vg-res', { timeout: 20000 });
  const after = await save(); const card = await p.evaluate(() => +document.querySelectorAll('.vg-res-stats > div')[4].querySelector('b').textContent.replace(/\D/g, ''));
  const unl = await p.evaluate(() => [...document.querySelectorAll('.vg-res-unl span')].map((s) => s.textContent));
  const track = unl.reduce((a, t) => a + (+(/(\d+) monete/.exec(t)?.[1] || 0)), 0);
  ok((after.coins || 0) - (before.coins || 0) === card + track && after.games === (before.games || 0) + 1, `${mode}: monete salvate +${(after.coins || 0) - (before.coins || 0)} = scheda +${card} + percorso ${track}`);
  await click('[data-a="vg-back"]'); await p.waitForSelector('.vg-menu');
}
// eaten in Battaglia, then restart within the beat
await click('[data-a="vg-mode"][data-id="battaglia"]');
await click('[data-a="vg-play"]'); await begin();
const before = await save();
await p.evaluate(() => { const g = window.__voragine; g.count = 0; const big = g.h.find((h) => !h.player); big.r = g.me.r * 3; g.swallowHole(big, g.me); g.togglePause(true); });
await p.waitForTimeout(1700);
ok(await p.evaluate(() => !window.__voragine.over), 'inghiottito in pausa: la partita aspetta il tempo di gioco');
await click('#vg-over [data-a="vg-restart"]');
await begin();
await p.waitForTimeout(2200);
const after = await save();
ok(!(await p.$('.vg-res')) && after.games === before.games && after.coins === before.coins, `Ricomincia subito dopo essere inghiottito: nessun risultato fantasma (partite ${before.games} -> ${after.games})`);
await browser.close();
ok(!errors.length, `nessun errore in console${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);
