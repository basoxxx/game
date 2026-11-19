// Orda · Base e razzie — headless checks and balance tables (no browser, no three.js).
//   node tools/orda-base-check.mjs          → assertions (rules, accrual, determinism, conversion) + tables
//   node tools/orda-base-check.mjs raids    → also plays generated raids with the game's autopilot (slow)
import { BUILDINGS, PALETTE, GRID, HOUR, RAID_TOKENS } from '../src/orda/base/data.js';
import * as G from '../src/orda/base/logic.js';
import { simulateAttack, defenceRating } from '../src/orda/base/sim.js';
import { genRival, rivalList, playerDiff } from '../src/orda/base/rivals.js';
import { layoutToLevel, destroyedPct, raidLoot, eqLevel } from '../src/orda/base/convert.js';
import { checkAttacks, scheduled } from '../src/orda/base/defense.js';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const { freshBase } = await import('../src/orda/base/store.js');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };
const T0 = Date.UTC(2026, 0, 1);

console.log('Regole della base');
{
  const st = freshBase(T0); st.seed = 1;
  const prog = { lvl: 0 };
  ok(G.hqLevel(st.layout) === 1 && G.countOf(st.layout, 'muro') === 4, 'base iniziale: QG 1 e 4 muri');
  ok(!G.canBuild(st, 'gelo', prog).ok && G.canBuild(st, 'gelo', prog).locked, 'Torre Gelo bloccata a inizio campagna');
  ok(G.canBuild(st, 'muro', prog).ok, 'un muro si può costruire subito');
  ok(!G.build(st, 'muro', 3, GRID - 3, prog, T0), 'non si costruisce sopra il QG');
  const b = G.build(st, 'muro', 0, 0, prog, T0); ok(!!b && st.bricks === 110, 'muro costruito, 10 mattoni spesi');
  ok(!G.canUpgrade(st, G.hqOf(st.layout), prog).ok, 'QG 2 richiede il livello 4 della campagna');
  st.bricks = 1e5; st.coins = 1e5;
  ok(!!G.upgrade(st, 1, { lvl: 4 }, T0) && G.hqLevel(st.layout) === 2, 'QG 2 con campagna livello 4');
  ok(!!G.move(st, b.id, 8, 0) && !G.move(st, b.id, 3, GRID - 3), 'spostamento: libero sì, sul QG no');
  for (let i = 0; i < 20; i++) G.build(st, 'muro', i % GRID, 1 + Math.floor(i / GRID), prog, T0);
  ok(G.countOf(st.layout, 'muro') === 12, 'limite muri con QG 2 = 12');
  const refund = G.demolish(st, b.id); ok(refund === 5, 'demolire restituisce metà mattoni');
}
console.log('Produzione offline');
{
  const st = freshBase(T0); const f = st.layout.b.find((b) => b.t === 'fornace');
  ok(G.stored(f, T0 + 3 * HOUR) === 42, 'fornace liv. 1: 14 mattoni/ora');
  ok(G.stored(f, T0 + 100 * HOUR) === 14 * 8, 'deposito pieno a 8 ore (accumulo offline limitato)');
  const r = G.collect(st, f.id, T0 + 2.5 * HOUR); ok(r.n === 35 && G.stored(f, T0 + 2.5 * HOUR) === 0, 'raccolta: 35 mattoni, deposito svuotato');
  ok(G.stored(f, T0 + 3.5 * HOUR) === 14, 'la frazione non va persa');
}
console.log('Gettoni razzia');
{
  const st = freshBase(T0); G.spendToken(st, T0); G.spendToken(st, T0); G.spendToken(st, T0);
  ok(!G.spendToken(st, T0), 'senza gettoni niente razzia');
  ok(G.tokens(st, T0 + 1.6 * HOUR).n === 1 && G.tokens(st, T0 + 10 * HOUR).n === RAID_TOKENS, 'un gettone ogni 90 minuti, massimo 3');
}
console.log('Simulazione difesa');
{
  const L = genRival(77, 5).layout;
  const a = simulateAttack(L, { figures: 400, seed: 9 }), b = simulateAttack(L, { figures: 400, seed: 9 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'deterministica');
  ok(simulateAttack(L, { figures: 30, seed: 1 }).stars === 0, 'un’orda piccola viene respinta');
  ok(simulateAttack(L, { figures: 3000, seed: 1 }).stars >= 2, 'un’orda enorme abbatte il QG');
  ok(defenceRating(L) > defenceRating(G.starterLayout()), 'una base sviluppata regge più della base iniziale');
}
console.log('Attacchi mentre sei via');
{
  const st = freshBase(T0); st.seed = 99; const prog = { lvl: 10 };
  const st2 = structuredClone(st);
  const r1 = checkAttacks(st, prog, T0 + 60 * HOUR), r2 = checkAttacks(st2, prog, T0 + 60 * HOUR);
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'stesso seme, stesso esito');
  ok(r1.length <= 2, 'al massimo 2 attacchi per ritorno');
  ok(checkAttacks(freshBase(T0), { lvl: 1 }, T0 + 60 * HOUR).length === 0, 'nessun attacco prima del livello 3 della campagna');
  ok(checkAttacks(st, prog, T0 + 60 * HOUR + 30 * 60e3).length === 0, 'nessun attacco se sei stato via meno di un’ora');
  const s3 = freshBase(T0); s3.seed = 5; s3.defense.shieldUntil = T0 + 1000 * HOUR;
  ok(checkAttacks(s3, prog, T0 + 200 * HOUR).length === 0, 'lo scudo blocca gli attacchi');
  ok(r1.every((r) => r.lost.coins >= 0 && r.shieldUntil > r.at), 'ogni attacco lascia uno scudo');
  const n = scheduled(42, T0, T0 + 30 * 24 * HOUR).length; ok(n > 20 && n < 70, `frequenza: ${n} attacchi pianificati in 30 giorni`);
}
console.log('Rivale → livello Orda');
{
  for (const d of [1, 4, 7, 10]) {
    const rv = genRival(1234 + d, d), L = layoutToLevel(rv);
    const okShape = L.base.hp > 0 && L.len >= 60 && L.gates.length <= 32 && L.gates.every((g) => Math.abs(g.x) + (g.w || 4.6) / 2 <= 8.01) && L.obstacles.every((o) => o.type === 'wall' && o.y < L.len) && L.base.spawners.length >= 2;
    ok(okShape, `diff ${d}: ${rv.name} → livello eq. ${L.id}, base ${L.base.hp} PV, ${L.gates.length} porte, ${L.obstacles.length} muri, ${L.base.towers.length} torri`);
  }
  const rv = genRival(5, 5), L = layoutToLevel(rv);
  ok(destroyedPct({ win: true }, L) === 1 && destroyedPct({ win: false, baseHp: L.base.hp, baseMax: L.base.hp, towers: 0 }, L) === 0, 'percentuale distrutta da risultato');
  const half = raidLoot(rv, 0.5), rev = raidLoot(rv, 0.5, { revenge: true });
  ok(half.bricks === Math.round(rv.loot.bricks * 0.5) && rev.bricks > half.bricks, 'bottino proporzionale, ×1.5 in vendetta');
  const s = freshBase(T0); s.seed = 3; const a = rivalList(s, { lvl: 10 }, 2), b = rivalList(s, { lvl: 10 }, 2);
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length === 4, 'lista rivali stabile');
}

console.log('\nTabella rivali (diff → valutazione difesa, bottino)');
for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const r = genRival(1000 + d, d);
  console.log(`  d${String(d).padStart(2)} eq.liv ${String(eqLevel(d)).padStart(2)} QG${r.hq} ${String(r.layout.b.length).padStart(2)} edifici · regge ~${String(defenceRating(r.layout)).padStart(4)} figurine · bottino ${r.loot.bricks} mattoni / ${r.loot.coins} monete · ${r.name}`);
}
console.log('\nCosti edifici (liv. 1 → max)');
for (const t of ['hq', ...PALETTE]) { const B = BUILDINGS[t]; console.log(`  ${B.name.padEnd(20)} ${Array.from({ length: B.max }, (_, i) => { const c = B.cost(i + 1); return `${c.bricks}${c.coins ? `+${c.coins}c` : ''}`; }).join(' · ')}  (campagna ${B.unlock})`); }

if (process.argv[2] === 'raids') {
  const { Sim, autopilot } = await import('../src/orda/sim.js');
  const { UPGRADES } = await import('../src/orda/meta.js');
  const play = (level, up, seed) => { const s = new Sim(level, { up, champ: 'colosso', champLvl: 1, seed, countdown: 0 }); s.state = 'play'; let f = 0; while (s.state === 'play' && f < 30 * 400) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); f++; } return s.result(); };
  console.log('\nRazzie giocate dall’autopilota (potenziamenti ≈ campagna/4)');
  for (const P of [3, 8, 14, 20, 26, 30]) {
    const hq = Math.min(6, 1 + Math.floor(P / 6)), up = Object.fromEntries(UPGRADES.map((u) => [u.id, Math.min(u.max, Math.round(P / 4))]));
    const base = playerDiff({ lvl: P }, hq);
    const row = [-1.2, -0.3, 0.6, 1.6, 2.4].map((dd) => {
      const diff = Math.max(1, Math.min(10, base + dd)); let w = 0, pc = 0;
      for (let s = 1; s <= 2; s++) { const rv = genRival(1000 * P + s * 17 + Math.round(dd * 10), diff), L = layoutToLevel(rv), r = play(L, up, s); w += r.win ? 1 : 0; pc += destroyedPct(r, L); }
      return `d${diff.toFixed(1)} ${w}/2 ${Math.round(pc * 50)}%`;
    });
    console.log(`  campagna ${String(P).padStart(2)} QG${hq}: ${row.join(' | ')}`);
  }
}
console.log(fails ? `\n${fails} controlli FALLITI` : '\nTutti i controlli superati');
process.exitCode = fails ? 1 : 0;
