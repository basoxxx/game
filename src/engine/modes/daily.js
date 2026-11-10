// "Sfida del giorno": one deterministic scenario per calendar day, built from the date only.
import { TEAMS } from '../../data/teams.js';
import { TRACKS } from '../../data/tracks.js';
import { mulberry32 } from '../rng.js';
import { load, store, MEDAL } from './objectives.js';

export const DAILY_KEY = 'apexdynasty_mode_daily';

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function fmtDay(k, opts = { weekday: 'long', day: 'numeric', month: 'long' }) { return keyToDate(k).toLocaleDateString('it-IT', opts); }
function seedOf(k) { let h = 2166136261; for (const c of `apex-daily-${k}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

const TWISTS = [
  { id: 'back', name: 'Rimonta dal fondo', text: 'Partite ultimi dopo una penalità in griglia.', setup: { gridPos: 'last' }, kind: 'gain' },
  { id: 'rain', name: 'Pioggia in arrivo', text: 'Il radar prevede un acquazzone a metà gara.', setup: { rainFrom: 5, rainLevel: 0.6 }, weather: 'dry' },
  { id: 'sc', name: 'Safety car', text: 'Un incidente al via porterà la safety car in pista nei primi giri.', setup: { scLap: 3 } },
  { id: 'worn', name: 'Gomme usate', text: 'Avete finito i set nuovi: si parte con gomme già consumate.', setup: { myWear: 0.45 } },
  { id: 'damage', name: 'Ala danneggiata', text: 'Un contatto nel giro di formazione ha piegato l’ala: si perde tempo a ogni giro.', setup: { myDamage: 0.6 } },
  { id: 'wet', name: 'Diluvio', text: 'Pioggia battente dal primo all’ultimo giro.', weather: 'rain', setup: {} },
  { id: 'front', name: 'In testa', text: 'Partite davanti a tutti: ora bisogna restarci.', setup: { gridPos: 1 }, kind: 'hold' },
];
const RALLY_TWISTS = [
  { id: 'chase', name: 'Inseguimento', text: 'Ultime due prove, 10 secondi da recuperare.', setup: { rally: { stagesKeep: 2, rallyGap: 10 } } },
  { id: 'nospare', name: 'Senza scorta', text: 'Ultima prova a 3 secondi dal leader, senza ruote di scorta.', setup: { rally: { stagesKeep: 1, rallyGap: 3, spares: 0 } } },
  { id: 'night', name: 'Notturna', text: 'Tre prove al buio: fari supplementari e nervi saldi.', setup: { rally: { stagesKeep: 3, rallyGap: 15 } }, night: true },
];

export function dailyFor(k = dayKey()) {
  const r = mulberry32(seedOf(k));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const cat = pick(['formula', 'formula', 'formula', 'junior', 'endurance', 'rally']);
  const teams = TEAMS[cat].slice().sort((a, b) => b.base - a.base);
  const ti = Math.min(teams.length - 1, 1 + Math.floor(r() * (teams.length - 1)));
  const team = teams[ti];
  const track = pick(TRACKS[cat]);
  const tw = cat === 'rally' ? pick(RALLY_TWISTS) : pick(TWISTS);
  const n = teams.length * 2;
  const exp = Math.min(n, ti * 2 + 2); // where the car "should" finish
  let tiers;
  if (cat === 'rally') { const e = Math.max(1, Math.min(teams.length * 2, ti + 1)); tiers = [{ t: 'pos', v: Math.min(e + 3, 12) }, { t: 'pos', v: Math.max(2, e) }, { t: 'pos', v: Math.max(1, e - 2) }]; }
  else if (tw.kind === 'gain') tiers = [{ t: 'gain', v: Math.max(3, Math.round(n * 0.25)) }, { t: 'gain', v: Math.max(5, Math.round(n * 0.45)) }, { t: 'pos', v: Math.max(1, exp) }];
  else if (tw.kind === 'hold') tiers = [{ t: 'pos', v: Math.max(3, Math.min(6, exp)) }, { t: 'pos', v: 2 }, { t: 'pos', v: 1 }];
  else tiers = [{ t: 'pos', v: Math.min(n, exp + 3) }, { t: 'pos', v: Math.max(2, exp) }, { t: 'pos', v: Math.max(1, exp - 3) }];
  const laps = cat === 'endurance' ? 8 : cat === 'junior' ? 10 : 14;
  const gp = tw.setup.gridPos ?? (cat === 'rally' ? null : Math.max(1, Math.min(n, exp + Math.floor(r() * 5) - 1)));
  return {
    id: `daily:${k}`, day: k, cat, team: team.id, track: track.id, weather: tw.weather || pick(['auto', 'auto', 'dry', 'mixed']),
    title: `${tw.name} · ${track.name}`, twist: tw, night: !!tw.night,
    story: `${tw.text} Al volante della ${team.name}, sul tracciato di ${track.circuit || track.name}.`,
    setup: { ...tw.setup, ...(cat !== 'rally' ? { gridPos: gp, laps } : {}), seed: seedOf(k) },
    tiers,
  };
}

// history: { [day]: { official: {medal,best}|null, best: {medal,best}, tries } }
export function dailyHistory() { return load(DAILY_KEY, {}) || {}; }
export function recordDaily(day, out) {
  const h = dailyHistory();
  const e = h[day] ||= { official: null, best: null, tries: 0 };
  e.tries++;
  const r = { medal: out.medal, best: out.best, at: Date.now() };
  // only a run of today's challenge, played today, can be the official attempt
  const first = !e.official && day === dayKey();
  if (first) e.official = r;
  if (!e.best || r.medal > e.best.medal || (r.medal === e.best.medal && r.best < e.best.best)) e.best = r;
  store(DAILY_KEY, h);
  return { entry: e, first };
}
export function streak(today = dayKey()) {
  const h = dailyHistory();
  let n = 0; const d = keyToDate(today);
  // today does not break the streak if not played yet
  if (!h[today]?.official) d.setDate(d.getDate() - 1);
  while (h[dayKey(d)]?.official) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function shareText(day, e, sc) {
  const m = e?.official?.medal ?? -1;
  const stars = [0, 1, 2].map((i) => (i <= m ? '★' : '☆')).join('');
  const pos = e?.official?.best == null || e.official.best >= 99 ? 'ritiro' : `P${e.official.best}`;
  return `Apex Dynasty · Sfida del giorno ${keyToDate(day).toLocaleDateString('it-IT')}\n${sc.title}\n${stars} ${m >= 0 ? MEDAL[m].name : 'Nessuna medaglia'} · ${pos}${e?.tries > 1 ? ` · ${e.tries} tentativi` : ''}\nSerie: ${streak(day)} giorni`;
}
