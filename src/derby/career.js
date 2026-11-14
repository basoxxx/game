// "Scontro Totale" progression: credits, owned cars, garage upgrades and looks, difficulty and the
// career ladder of cups. Everything lives in localStorage 'apexdynasty_derby' next to the older
// fields (money, wins, races, owned, best, champ), which keep their meaning: old saves load as-is.
import { BANGERS, UPGRADES } from './cars.js';

const KEY = 'apexdynasty_derby';
const BASE = () => ({ money: 0, wins: 0, races: 0, owned: ['berlina', 'utilitaria'], best: {} });
export function prog() {
  let p; try { p = { ...BASE(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { p = BASE(); }
  if (!Array.isArray(p.owned)) p.owned = ['berlina', 'utilitaria'];
  p.best ||= {}; p.garage ||= {}; p.looks ||= {}; p.career ||= { res: {} }; p.career.res ||= {}; p.stats ||= {};
  p.diff ||= 'normale';
  return p;
}
export function saveProg(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export const PRICES = { berlina: 0, utilitaria: 0, familiare: 12000, muscle: 20000, furgone: 28000, pickup: 35000, rally: 45000, hotrod: 60000 };
// stars needed before a car can be bought (career gates the wildest machines)
export const CAR_STARS = { rally: 10, hotrod: 22 };

export const DIFFICULTY = {
  facile: { name: 'Facile', desc: 'Avversari più lenti e prudenti, la tua auto incassa di più', aiPace: 0.955, aiAggr: 0.6, dmgTaken: 0.7, prize: 0.8, rubber: 1.3 },
  normale: { name: 'Normale', desc: 'La sfida pensata per lo Scontro Totale', aiPace: 1, aiAggr: 1, dmgTaken: 1, prize: 1, rubber: 1 },
  difficile: { name: 'Spietato', desc: 'Avversari velocissimi e cattivi, lamiere fragili: premi più ricchi', aiPace: 1.025, aiAggr: 1.35, dmgTaken: 1.2, prize: 1.3, rubber: 0.45 },
};

// ---------------------------------------------------------------- event types
export const MODES = {
  race: { name: 'Gara', icon: 'flag', desc: 'Corsa a contatto: arriva primo, con ogni mezzo.' },
  elim: { name: 'Eliminazione', icon: 'alert', desc: 'A ogni giro l’ultimo della fila viene eliminato. Resta in piedi fino alla fine.' },
  time: { name: 'Contro il tempo', icon: 'hourglass', desc: 'Pista tutta per te: batti i tempi per le medaglie.' },
  caccia: { name: 'Caccia alla Lepre', icon: 'target', desc: 'La Lepre dorata scappa in testa al gruppo: speronala fino a demolirla.' },
  derby: { name: 'Demolition derby', icon: 'burst', desc: 'Arena chiusa: l’ultima auto che si muove vince.' },
  stunt: { name: 'Salto in lungo', icon: 'speed', desc: 'Tre tentativi sul trampolino: vola più lontano che puoi.' },
  squadre: { name: 'Derby a squadre', icon: 'shield', desc: 'Rossi contro Blu nell’arena: l’ultima squadra con un’auto in moto vince. Il fuoco amico fa poco male.' },
  re: { name: 'Re della collina', icon: 'trophy', desc: 'Tieni da solo il cerchio al centro: 45 secondi di corona e hai vinto. Tutti daranno la caccia al re.' },
  ondate: { name: 'Sopravvivenza', icon: 'alert', desc: 'Ondate sempre più grosse di demolitori, tutti contro di te. Ogni ondata respinta ripara un po’ l’auto.' },
  distruzione: { name: 'Demolizione a tempo', icon: 'hourglass', desc: 'Pista sbarrata da muri di casse e barili: ogni oggetto distrutto toglie tempo al cronometro.' },
  parco: { name: 'Giro libero', icon: 'play', desc: 'Nessuna regola: salti, giro della morte, muri di casse. Esci dalla pausa quando vuoi.' },
};
export const MEDALS = ['Nessuna', 'Bronzo', 'Argento', 'Oro'];
export const MEDAL_COLORS = ['#555', '#c9803f', '#c9ced6', '#ffcf3a'];

// ---------------------------------------------------------------- career ladder
// stars: medal-stars needed to unlock the cup. prize: payout for gold (silver 60%, bronze 35%).
export const CUPS = [
  { id: 'ferraglia', name: 'Coppa Ferraglia', sub: 'Il debutto: quattro chiacchiere e tanta polvere', stars: 0, color: '#c9803f', events: [
    { id: 'f1', name: 'Battesimo di polvere', mode: 'race', venue: 'cava', opponents: 5, prize: 6000 },
    { id: 'f2', name: 'Giro secco', mode: 'time', venue: 'otto', laps: 2, prize: 4000 },
    { id: 'f3', name: 'Prima mischia', mode: 'derby', venue: 'arena', opponents: 5, prize: 6000 },
    { id: 'f4', name: 'Il primo volo', mode: 'stunt', venue: 'rampa', prize: 4000, targets: [55, 75, 90] },
    { id: 'f5', name: 'La Lepre del pantano', mode: 'caccia', venue: 'fattoria', opponents: 3, prize: 6500 },
  ] },
  { id: 'lamiera', name: 'Coppa Lamiera', sub: 'Si alza il livello: eliminazioni e notti al porto', stars: 8, color: '#c9ced6', events: [
    { id: 'l1', name: 'Fuori l’ultimo', mode: 'elim', venue: 'otto', opponents: 5, prize: 9000 },
    { id: 'l2', name: 'Pineta selvaggia', mode: 'race', venue: 'pineta', opponents: 7, prize: 10000 },
    { id: 'l3', name: 'Tra i container', mode: 'race', venue: 'porto', opponents: 7, prize: 11000 },
    { id: 'l4', name: 'Volo d’angelo', mode: 'stunt', venue: 'rampa', prize: 7000, targets: [70, 86, 98] },
    { id: 'l5', name: 'Fossa dei leoni', mode: 'derby', venue: 'fossa', opponents: 7, prize: 11000 },
  ] },
  // v5: the new event types and venues
  { id: 'caos', name: 'Coppa Caos', sub: 'Squadre, corone, ondate e muri di casse: regole nuove, stesse lamiere', stars: 14, color: '#3ddc84', events: [
    { id: 'c1', name: 'Gomme e ghiaia', mode: 'race', venue: 'discarica', opponents: 7, prize: 12000 },
    { id: 'c2', name: 'Rossi contro Blu', mode: 'squadre', venue: 'arena', opponents: 7, prize: 12000 },
    { id: 'c3', name: 'La corona di ferro', mode: 're', venue: 'catino', opponents: 5, prize: 13000 },
    { id: 'c4', name: 'Ondata dopo ondata', mode: 'ondate', venue: 'fossa', prize: 13000 },
    { id: 'c5', name: 'Rottama il cronometro', mode: 'distruzione', venue: 'cava', laps: 2, prize: 10000 },
  ] },
  { id: 'inferno', name: 'Coppa Inferno', sub: 'Sotto i riflettori, senza pietà', stars: 20, color: '#ff6a1a', events: [
    { id: 'i1', name: 'Notte di ferro', mode: 'race', venue: 'stadio', opponents: 7, prize: 14000 },
    { id: 'i2', name: 'Molo dei dannati', mode: 'elim', venue: 'porto', opponents: 6, prize: 14000 },
    { id: 'i3', name: 'Lepre sotto i fari', mode: 'caccia', venue: 'stadio', opponents: 4, prize: 15000 },
    { id: 'i4', name: 'Cronometro nel bosco', mode: 'time', venue: 'pineta', laps: 2, prize: 10000 },
    { id: 'i5', name: 'Arena rovente', mode: 'derby', venue: 'arena', opponents: 7, prize: 15000, aiBoost: 1.02 },
  ] },
  { id: 'finale', name: 'Gran Premio Rottame', sub: 'La finale: diventa il re delle lamiere', stars: 34, color: '#ffcf3a', events: [
    { id: 'g1', name: 'Il re della cava', mode: 'race', venue: 'cava', opponents: 7, prize: 20000, aiBoost: 1.02 },
    { id: 'g2', name: 'Ultimo in piedi', mode: 'elim', venue: 'fattoria', opponents: 6, prize: 20000 },
    { id: 'g3', name: 'Salto nel vuoto', mode: 'stunt', venue: 'rampa', prize: 15000, targets: [85, 98, 108] },
    { id: 'g4', name: 'Caccia al porto', mode: 'caccia', venue: 'porto', opponents: 4, prize: 20000, aiBoost: 1.02 },
    { id: 'g5', name: 'La resa dei conti', mode: 'derby', venue: 'fossa', opponents: 7, prize: 25000, aiBoost: 1.03 },
  ] },
];
export const ALL_EVENTS = CUPS.flatMap((c) => c.events.map((e) => ({ ...e, cup: c.id })));
export const eventById = (id) => ALL_EVENTS.find((e) => e.id === id) || null;

export function starsOf(p = prog()) { return Object.values(p.career.res).reduce((s, r) => s + (r.medal || 0), 0); }
export function cupUnlocked(cup, p = prog()) { return starsOf(p) >= cup.stars; }
export function cupStars(cup, p = prog()) { return cup.events.reduce((s, e) => s + (p.career.res[e.id]?.medal || 0), 0); }
// venues that need career progress before free play
export const VENUE_STARS = { porto: 8, fossa: 8, discarica: 12, catino: 14 };
export function venueUnlocked(id, p = prog()) { return starsOf(p) >= (VENUE_STARS[id] || 0); }
export function carBuyable(id, p = prog()) { return starsOf(p) >= (CAR_STARS[id] || 0); }

// medal for a finished event: game result -> 0..3
export function medalFor(mode, r) {
  if (mode === 'time') { const t = r.time, T = r.targets || []; if (!t) return 0; return t <= T[2] ? 3 : t <= T[1] ? 2 : t <= T[0] ? 1 : 0; }
  if (mode === 'stunt') { const d = r.distance || 0, T = r.targets || []; return d >= T[2] ? 3 : d >= T[1] ? 2 : d >= T[0] ? 1 : 0; }
  if (mode === 'caccia') { const d = r.huntDmg || 0; return r.huntWreck || d >= 100 ? 3 : d >= 40 ? 2 : d >= 15 ? 1 : 0; }
  if (mode === 'distruzione') return medalFor('time', r);
  if (mode === 'squadre') return r.teamWon ? (r.alive ? 3 : 2) : (r.kills || 0) >= 1 ? 1 : 0;
  if (mode === 'ondate') { const w = r.waves || 0; return w >= 6 ? 3 : w >= 4 ? 2 : w >= 2 ? 1 : 0; }
  if (mode === 'parco') return 0;
  return r.pos === 1 ? 3 : r.pos === 2 ? 2 : r.pos === 3 ? 1 : 0;
}
// payout for an event result (career events pay their own purse; free play pays by medal/position)
export function payout(ev, medal, r, diff = 'normale') {
  const k = DIFFICULTY[diff]?.prize || 1;
  // early cups pay a little more (the first upgrades come sooner); a run without a medal still covers the fuel
  if (ev) { const base = ev.prize * (ev.cup === 'ferraglia' ? 1.2 : 1); return Math.round((medal === 3 ? base : medal === 2 ? base * 0.6 : medal === 1 ? base * 0.38 : 600) * k / 50) * 50; }
  const byMedal = [400, 2000, 3500, 5500][medal];
  return Math.round(byMedal * k / 50) * 50;
}
// record a career result; returns { medal, improved, prev, newCups:[...] }
export function recordCareer(evId, medal, extra = {}) {
  const p = prog(); const before = starsOf(p); const prev = p.career.res[evId]?.medal || 0;
  const cur = p.career.res[evId] || {};
  p.career.res[evId] = { ...cur, medal: Math.max(prev, medal), runs: (cur.runs || 0) + 1, ...(extra.best != null ? { best: cur.best == null ? extra.best : extra.better(cur.best, extra.best) } : {}) };
  saveProg(p);
  const after = starsOf(p);
  const newCups = CUPS.filter((c) => c.stars > before && c.stars <= after).map((c) => c.name);
  const newVenues = Object.entries(VENUE_STARS).filter(([, s]) => s > before && s <= after).map(([v]) => v);
  const newCars = Object.entries(CAR_STARS).filter(([, s]) => s > before && s <= after).map(([c]) => BANGERS.find((b) => b.id === c)?.name);
  return { medal, prev, improved: medal > prev, newCups, newVenues, newCars, stars: after };
}

// ---------------------------------------------------------------- challenges (one-off, paid once)
// check(r, p): r = event result (mode, pos, medal, kills, car, minHp, props, distance, huntWreck...), p = progress
export const CHALLENGES = [
  { id: 'primo', name: 'Prima vittoria', desc: 'Vinci un evento qualsiasi', prize: 2000, icon: 'trophy', check: (r) => r.pos === 1 && !['time', 'stunt'].includes(r.mode) },
  { id: 'tris', name: 'Tris di lamiere', desc: 'Demolisci 3 avversari nello stesso evento', prize: 5000, icon: 'burst', check: (r) => r.kills >= 3 },
  { id: 'macellaio', name: 'Il macellaio', desc: 'Demolisci 25 avversari in carriera', prize: 9000, icon: 'burst', check: (r, p) => (p.stats.wrecks || 0) >= 25 },
  { id: 'cento', name: 'Oltre i centocinquanta', desc: 'Salta più di 150 metri dalla Rampa del Diavolo', prize: 6000, icon: 'speed', check: (r) => r.mode === 'stunt' && r.distance >= 150 }, // v7: faster run-up again (v5: 100 m, v6: 130 m)
  { id: 'lepre', name: 'Lepre in salmì', desc: 'Demolisci la Lepre dorata', prize: 6000, icon: 'target', check: (r) => r.mode === 'caccia' && r.huntWreck },
  { id: 'ultimo', name: 'Ultimo uomo in piedi', desc: 'Vinci un’eliminazione', prize: 5000, icon: 'alert', check: (r) => r.mode === 'elim' && r.pos === 1 },
  { id: 'gladiatore', name: 'Gladiatore', desc: 'Vinci un demolition derby', prize: 5000, icon: 'shield', check: (r) => r.mode === 'derby' && r.pos === 1 },
  { id: 'lancette', name: 'Lancette d’oro', desc: 'Medaglia d’oro in un contro il tempo', prize: 3000, icon: 'hourglass', check: (r) => r.mode === 'time' && r.medal === 3 },
  { id: 'immacolato', name: 'Senza un graffio', desc: 'Vinci una gara chiudendo con il telaio sopra il 75%', prize: 6000, icon: 'check', check: (r) => r.mode === 'race' && r.pos === 1 && r.minHp >= 75 },
  { id: 'ruspa', name: 'Ruspa umana', desc: 'Distruggi 60 oggetti in un solo evento', prize: 4000, icon: 'bolt', check: (r) => (r.props || 0) >= 60 },
  { id: 'trasloco', name: 'Trasloco espresso', desc: 'Vinci una gara con il Bestione Van', prize: 7000, icon: 'car', check: (r) => r.car === 'furgone' && r.pos === 1 && ['race', 'elim'].includes(r.mode) },
  { id: 'formica', name: 'Formica atomica', desc: 'Vinci un derby con la Grillo GT', prize: 7000, icon: 'car', check: (r) => r.car === 'utilitaria' && r.pos === 1 && r.mode === 'derby' },
  { id: 'meccanico', name: 'Mani di grasso', desc: 'Porta un potenziamento al livello massimo', prize: 3000, icon: 'wrench', check: (r, p) => Object.values(p.garage || {}).some((t) => Object.values(t).some((l) => l >= 3)) },
  { id: 'collezione', name: 'Collezionista', desc: 'Possiedi 5 auto', prize: 8000, icon: 'factory', check: (r, p) => p.owned.length >= 5 },
  { id: 'ferraglia', name: 'Re della ferraglia', desc: 'Tutti gli ori nella Coppa Ferraglia', prize: 8000, icon: 'medal', check: (r, p) => CUPS[0].events.every((e) => p.career.res[e.id]?.medal === 3) },
  { id: 'campione', name: 'Campione del Rottame', desc: 'Tutti gli ori nel Gran Premio Rottame', prize: 30000, icon: 'trophy', check: (r, p) => CUPS.find((c) => c.id === 'finale').events.every((e) => p.career.res[e.id]?.medal === 3) },
];
// evaluate after an event: marks and pays new challenges, returns the list completed now
export function checkChallenges(r) {
  const p = prog(); p.ach ||= {}; const got = [];
  for (const c of CHALLENGES) { if (p.ach[c.id]) continue; let ok = false; try { ok = !!c.check(r, p); } catch {} if (ok) { p.ach[c.id] = Date.now(); p.money += c.prize; got.push(c); } }
  if (got.length) saveProg(p);
  return got;
}

// ---------------------------------------------------------------- garage
export const UP_PRICES = [3000, 7500, 15000];
export function upgradePrice(carId, lvl) { const f = (PRICES[carId] || 0) >= 40000 ? 1.4 : (PRICES[carId] || 0) >= 20000 ? 1.2 : 1; return lvl >= 3 ? null : Math.round(UP_PRICES[lvl] * f / 100) * 100; }
export function tuneOf(carId, p = prog()) { const t = p.garage[carId] || {}; return { eng: t.eng || 0, arm: t.arm || 0, tyr: t.tyr || 0, nit: t.nit || 0 }; }
const DEF_LIVERY = { rally: 'tricolore', hotrod: 'fiamme', muscle: 'strisce', furgone: 'classica' };
export function lookOf(carId, p = prog()) {
  const b = BANGERS.find((x) => x.id === carId) || BANGERS[0];
  const l = p.looks[carId] || {};
  return { color: l.color || b.color, livery: l.livery || DEF_LIVERY[carId] || 'classica', num: l.num || 1, accent: l.accent || '#f2efe6', stickers: l.stickers !== false };
}
export { UPGRADES };

// ---------------------------------------------------------------- v7: long-jump classes
// Long-jump medal distances scale with what the car can do on the run-up: measured AI jumps on the
// Rampa del Diavolo relative to the Torpedo 78 (a hot rod flies ~35% further than a saloon, a van
// ~15% shorter). Engine upgrades (top speed) scale the distances too, so a tuned car earns its gold.
export const JUMP_CLASS = { berlina: 1, utilitaria: 0.93, muscle: 1.22, pickup: 0.92, familiare: 0.94, furgone: 0.86, rally: 1.16, hotrod: 1.34 };
export function jumpFactor(carId, tunedTop = null) {
  const b = BANGERS.find((x) => x.id === carId); const k = JUMP_CLASS[carId] ?? 1;
  return k * (b && tunedTop ? Math.min(1.25, (tunedTop / b.top) ** 2) : 1);
}
// the targets the game will actually use (base targets x the faster run-up x the car class), to the metre
export function stuntTargets(base, carId, tunedTop = null, pace = 1) { return (base || [60, 80, 95]).map((t) => Math.round(t * pace * jumpFactor(carId, tunedTop))); }

// ---------------------------------------------------------------- v7: the daily event
// One event a day, the same for everybody on that date (seeded by the date): a venue, a mode, a
// weather twist and a car from the yard (a loaner: you drive it even if you do not own it).
// The first medal of the day pays a bonus (upgrading the medal pays the difference); a streak of
// days with a medal is kept for the card.
const DAILY_POOL = [
  { mode: 'race', venue: 'cava', opponents: 7 }, { mode: 'race', venue: 'pineta', opponents: 7 }, { mode: 'race', venue: 'discarica', opponents: 7 },
  { mode: 'elim', venue: 'otto', opponents: 6 }, { mode: 'derby', venue: 'arena', opponents: 7 }, { mode: 'derby', venue: 'fossa', opponents: 7 },
  { mode: 'caccia', venue: 'fattoria', opponents: 4 }, { mode: 'stunt', venue: 'rampa', targets: [62, 80, 94] }, { mode: 're', venue: 'catino', opponents: 5 },
  { mode: 'ondate', venue: 'arena' }, { mode: 'race', venue: 'porto', opponents: 7 }, { mode: 'race', venue: 'stadio', opponents: 7 }, { mode: 'distruzione', venue: 'cava', laps: 2 },
];
const DAILY_WX = [['auto', ''], ['pioggia', 'sotto la pioggia'], ['notte', 'di notte'], ['tramonto', 'al tramonto'], ['auto', '']];
const DAILY_NAMES = ['Lunedì di lamiera', 'Martedì matto', 'Mercoledì di fuoco', 'Giovedì grasso', 'Venerdì nero', 'Sabato sfascio', 'Domenica bestiale'];
const DAILY_PAY = [0, 2500, 4500, 7500];
export function todayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function dailyEvent(d = new Date()) {
  const key = todayKey(d); let h = 2166136261; for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const R = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296; };
  const base = DAILY_POOL[Math.floor(R() * DAILY_POOL.length)];
  const wx = base.mode === 'stunt' ? DAILY_WX[0] : DAILY_WX[Math.floor(R() * DAILY_WX.length)];
  const car = BANGERS[Math.floor(R() * BANGERS.length)].id;
  return { ...base, id: 'daily', daily: key, name: DAILY_NAMES[(d.getDay() + 6) % 7], weather: wx[0], wxName: wx[1], car, prize: 6000, pay: DAILY_PAY };
}
export function dailyState(p = prog()) { const ev = dailyEvent(); const st = p.daily?.key === ev.daily ? { ...p.daily } : { key: ev.daily, medal: 0, runs: 0, paid: 0 }; return { ev, st, streak: p.dailyStreak?.n || 0 }; }
// record a run of today's event (the bonus is added to the prize by the caller); returns a career-like block for the results
export function recordDaily(medal) {
  const p = prog(); const { st } = dailyState(p); const prev = st.medal || 0;
  const bonus = Math.max(0, DAILY_PAY[medal] - DAILY_PAY[st.paid || 0]); if (bonus) st.paid = medal; // paid by the caller with the prize
  st.medal = Math.max(prev, medal); st.runs = (st.runs || 0) + 1; p.daily = st; p.dailyStreak ||= { last: '', n: 0 };
  if (medal > 0 && p.dailyStreak.last !== st.key) { const y = new Date(); y.setDate(y.getDate() - 1); p.dailyStreak.n = p.dailyStreak.last === todayKey(y) ? p.dailyStreak.n + 1 : 1; p.dailyStreak.last = st.key; }
  saveProg(p);
  return { medal, prev, improved: medal > prev, bonus, streak: p.dailyStreak.n, newCups: [], newVenues: [], newCars: [], stars: starsOf(p), daily: true };
}

// ---------------------------------------------------------------- v7: what to aim for next
// the next milestones of the career, nearest first: cups, arenas and cars that unlock with stars,
// then the cheapest car you could buy. Each: { kind, text, have, need, icon }
const VENUE_NAMES = { porto: 'Porto Vecchio', fossa: 'Fossa dei Leoni', discarica: 'Cimitero delle Gomme', catino: 'Catino d’Acciaio' };
export function careerGoals(p = prog()) {
  const s = starsOf(p), out = [];
  const cup = CUPS.find((c) => c.stars > s); if (cup) out.push({ kind: 'cup', text: cup.name, have: s, need: cup.stars, icon: 'trophy' });
  for (const [id, n] of Object.entries(CAR_STARS)) if (n > s && !p.owned.includes(id)) { const b = BANGERS.find((x) => x.id === id); out.push({ kind: 'car', text: `${b.name} in vendita`, have: s, need: n, icon: 'car' }); }
  for (const [id, n] of Object.entries(VENUE_STARS)) if (n > s) out.push({ kind: 'venue', text: `${VENUE_NAMES[id] || id} libera`, have: s, need: n, icon: 'flag' });
  out.sort((a, b) => a.need - b.need);
  const buy = BANGERS.filter((b) => !p.owned.includes(b.id) && carBuyable(b.id, p)).sort((a, b) => PRICES[a.id] - PRICES[b.id])[0];
  const res = out.slice(0, 2);
  if (buy) res.push({ kind: 'money', text: `${buy.name} in garage`, have: Math.min(p.money, PRICES[buy.id]), need: PRICES[buy.id], icon: 'coin', money: true });
  return res;
}
