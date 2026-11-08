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
  facile: { name: 'Facile', desc: 'Avversari più lenti e prudenti, la tua auto incassa di più', aiPace: 0.955, aiAggr: 0.6, dmgTaken: 0.7, prize: 0.8 },
  normale: { name: 'Normale', desc: 'La sfida pensata per lo Scontro Totale', aiPace: 1, aiAggr: 1, dmgTaken: 1, prize: 1 },
  difficile: { name: 'Spietato', desc: 'Avversari velocissimi e cattivi, lamiere fragili: premi più ricchi', aiPace: 1.025, aiAggr: 1.35, dmgTaken: 1.2, prize: 1.3 },
};

// ---------------------------------------------------------------- event types
export const MODES = {
  race: { name: 'Gara', icon: 'flag', desc: 'Corsa a contatto: arriva primo, con ogni mezzo.' },
  elim: { name: 'Eliminazione', icon: 'alert', desc: 'A ogni giro l’ultimo della fila viene eliminato. Resta in piedi fino alla fine.' },
  time: { name: 'Contro il tempo', icon: 'hourglass', desc: 'Pista tutta per te: batti i tempi per le medaglie.' },
  caccia: { name: 'Caccia alla Lepre', icon: 'target', desc: 'La Lepre dorata scappa in testa al gruppo: speronala fino a demolirla.' },
  derby: { name: 'Demolition derby', icon: 'burst', desc: 'Arena chiusa: l’ultima auto che si muove vince.' },
  stunt: { name: 'Salto in lungo', icon: 'speed', desc: 'Tre tentativi sul trampolino: vola più lontano che puoi.' },
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
    { id: 'l4', name: 'Volo d’angelo', mode: 'stunt', venue: 'rampa', prize: 7000, targets: [70, 88, 100] },
    { id: 'l5', name: 'Fossa dei leoni', mode: 'derby', venue: 'fossa', opponents: 7, prize: 11000 },
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
    { id: 'g3', name: 'Salto nel vuoto', mode: 'stunt', venue: 'rampa', prize: 15000, targets: [85, 100, 112] },
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
export const VENUE_STARS = { porto: 8, fossa: 8 };
export function venueUnlocked(id, p = prog()) { return starsOf(p) >= (VENUE_STARS[id] || 0); }
export function carBuyable(id, p = prog()) { return starsOf(p) >= (CAR_STARS[id] || 0); }

// medal for a finished event: game result -> 0..3
export function medalFor(mode, r) {
  if (mode === 'time') { const t = r.time, T = r.targets || []; if (!t) return 0; return t <= T[2] ? 3 : t <= T[1] ? 2 : t <= T[0] ? 1 : 0; }
  if (mode === 'stunt') { const d = r.distance || 0, T = r.targets || []; return d >= T[2] ? 3 : d >= T[1] ? 2 : d >= T[0] ? 1 : 0; }
  if (mode === 'caccia') { const d = r.huntDmg || 0; return r.huntWreck || d >= 100 ? 3 : d >= 50 ? 2 : d >= 20 ? 1 : 0; }
  return r.pos === 1 ? 3 : r.pos === 2 ? 2 : r.pos === 3 ? 1 : 0;
}
// payout for an event result (career events pay their own purse; free play pays by medal/position)
export function payout(ev, medal, r, diff = 'normale') {
  const k = DIFFICULTY[diff]?.prize || 1;
  if (ev) { const base = ev.prize; return Math.round((medal === 3 ? base : medal === 2 ? base * 0.6 : medal === 1 ? base * 0.35 : 400) * k / 50) * 50; }
  const byMedal = [500, 3000, 6000, 10000][medal];
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
