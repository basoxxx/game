// Scontro Totale — cheap regression checks on a running preview (the race is stepped by hand with the GPU draw
// stubbed, the AI drives the player's car):
//   · long jump: three valid attempts of equal length (nitro refilled, damage patched, no dead stop on the kicker)
//   · time trial outside the bronze: bonus objectives shown but not paid
//   · detached parts ignore the cars for a moment (they used to wedge under their own chassis)
//   · results card on a phone in landscape (844x390): standings and buttons on screen without scrolling
//   · no console errors
//   npx vite preview --port 4691   then   node tools/derby-check.mjs [baseUrl]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4691/').replace(/\/?$/, '/');
const IGNORE = /GPU stall|GL Driver|WebGL|AudioContext|favicon|403 \(Forbidden\)/i;
const errors = []; let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok' : '!!'} ${msg}`); if (!c) fails++; };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
async function open(w, h, touch = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage(); p.setDefaultTimeout(240000);
  p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem('dzc')) { sessionStorage.setItem('dzc', '1'); localStorage.clear(); localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfx: 'low', gfxTier: 'low' })); } });
  await p.goto(BASE + '?game=derby' + (touch ? '&touch' : ''));
  await p.waitForSelector('.dz-menu', { timeout: 90000 });
  return p;
}
const click = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error('missing ' + s); el.click(); }, sel).then(() => p.waitForTimeout(120));
async function start(p, venue, mode) {
  await click(p, '[data-a="dz-tab"][data-id="libero"]'); await click(p, `[data-a="dz-venue"][data-id="${venue}"]`); await click(p, `[data-a="dz-mode"][data-id="${mode}"]`); await click(p, '[data-a="dz-go"]');
  await p.waitForFunction(() => ['countdown', 'race'].includes(window.__derby?.state), null, { timeout: 180000 });
  await p.evaluate(() => { const g = window.__derby; cancelAnimationFrame(g.raf); g.renderer.render = () => {}; if (g.composer) g.composer.render = () => {}; g.o.autoReplay = false; g.autopilot(true); });
}
const runToEnd = (p, setup = '') => p.evaluate((setup) => { const g = window.__derby; if (setup) new Function('g', setup)(g); let n = 0; while (g.state !== 'finished' && n < 60 * 400) { g.frame(1 / 60); n++; } return g.state; }, setup);
const result = async (p) => { await p.waitForFunction(() => window.__derby?.result, null, { timeout: 20000 }); return p.evaluate(() => { const r = window.__derby.result; return { medal: r.medal, bonus: r.bonus, score: r.score, kills: r.kills, objectives: r.objectives, dists: r.dists, targets: r.targets, time: r.time }; }); };
const quit = async (p) => { await click(p, '.dz-root [data-a="dz-quit"]'); await p.waitForSelector('.dz-menu'); };

const p = await open(1280, 800);
// long jump
await start(p, 'rampa', 'stunt');
ok(await runToEnd(p) === 'finished', 'salto in lungo: tre tentativi fino ai risultati');
{ const r = await result(p); const d = r.dists; ok(d.length === 3 && d.every((x) => x > 0) && Math.min(...d) > Math.max(...d) * 0.93, `salto: tre tentativi validi e simili (${d.join(' / ')} m, medaglie a ${r.targets.join(' / ')})`); }
await quit(p);
// time trial too slow for a medal: objectives not paid
await start(p, 'otto', 'time');
await runToEnd(p, 'g.player.paceMul = 0.62;');
{ const r = await result(p); const done = r.objectives.filter((o) => o.done); const paid = Math.min(6000, (r.kills || 0) * 1000 + Math.round((r.score || 0) / 20) * 10);
  ok(r.medal === 0 && done.every((o) => o.unpaid) && r.bonus === paid, `contro il tempo senza medaglia (${r.time?.toFixed(1)} s): obiettivi ${done.map((o) => o.id).join(',') || '-'} non pagati, bonus ${r.bonus}`); }
await quit(p);
// detached parts: no collisions with the cars at birth
await start(p, 'cava', 'race');
{ const g = await p.evaluate(() => { const g = window.__derby; for (let i = 0; i < 60; i++) g.frame(1 / 60); const pt = g.player.mesh.userData.parts[0]; g.detach(g.player, pt); const d = g.debris[g.debris.length - 1]; const at0 = d.body.collider(0).collisionGroups(); for (let i = 0; i < 70; i++) g.frame(1 / 60); return { at0, after: d.body.collider(0).collisionGroups() }; });
  ok(((g.at0 >>> 0) & 0xffff & 0x0002) === 0 && (g.after >>> 0) === 0xffffffff, `pezzi staccati: ignorano le auto alla nascita, poi tornano solidi (${(g.at0 >>> 0).toString(16)} -> ${(g.after >>> 0).toString(16)})`); }
await quit(p);
await p.context().close();
// results on a phone in landscape
const m = await open(844, 390, true);
await start(m, 'cava', 'race');
await runToEnd(m); await result(m); await m.waitForTimeout(900);
{ const r = await m.evaluate(() => { const c = document.querySelector('.dzx-results .dzx-card'), cr = c.getBoundingClientRect(), me = c.querySelector('tr.me')?.getBoundingClientRect(), b = [...c.querySelectorAll('.dzx-btns .btn')].map((x) => x.getBoundingClientRect()); return { over: c.scrollHeight - c.clientHeight, me: me && me.bottom <= cr.bottom && me.top >= cr.top, btns: b.every((x) => x.bottom <= innerHeight && x.top >= 0), touch: getComputedStyle(document.querySelector('.dzt')).display }; });
  ok(r.over <= 12 && r.me && r.btns, `risultati 844x390: classifica e pulsanti visibili senza scorrere (eccesso ${r.over}px)`);
  ok(r.touch === 'none', 'comandi touch nascosti sotto i risultati'); }
await browser.close();
ok(!errors.length, `nessun errore in console${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);
