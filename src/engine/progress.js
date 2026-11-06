// Manager progression: XP, levels, perk tree, seasonal objectives
import { pick, shuffle, randInt } from './rng.js';

export const PERKS = {
  strategy: {
    name: 'Strategia', icon: 'flag', color: '#3aa0ff',
    perks: [
      { id: 'tyre_reader', name: 'Lettura gomme', desc: 'Le gomme delle tue auto durano il 6% in più.', cost: 1 },
      { id: 'data', name: 'Analisi dati', desc: '+1 giro di prova e feedback di assetto più precisi.', cost: 1 },
      { id: 'meteo', name: 'Meteorologo', desc: 'Radar meteo preciso al giro (senza: previsioni imprecise).', cost: 1 },
      { id: 'outlap', name: 'Maestro dell’undercut', desc: 'Le gomme nuove entrano in temperatura molto prima.', cost: 2 },
      { id: 'fast_crew', name: 'Muretto lampo', desc: 'Pit stop più rapidi di 0,3 secondi.', cost: 2 },
    ],
  },
  tech: {
    name: 'Tecnica', icon: 'rd', color: '#22d37a',
    perks: [
      { id: 'rd_cost', name: 'R&D efficiente', desc: 'Progetti di sviluppo il 12% più economici.', cost: 1 },
      { id: 'rd_gain', name: 'Laboratorio avanzato', desc: 'Guadagni dei progetti R&D +10%.', cost: 1 },
      { id: 'reliable', name: 'Cultura dell’affidabilità', desc: 'Guasti meccanici in gara -20%.', cost: 1 },
      { id: 'reverse', name: 'Ingegneria inversa', desc: '+20% di guadagno sui componenti sotto la media del gruppo.', cost: 2 },
      { id: 'rd_slot', name: 'Turno notturno', desc: '+1 slot R&D sempre disponibile.', cost: 3 },
    ],
  },
  business: {
    name: 'Commerciale', icon: 'money', color: '#ffb020',
    perks: [
      { id: 'brand', name: 'Brand globale', desc: 'Pagamenti degli sponsor +10%.', cost: 1 },
      { id: 'negotiator', name: 'Negoziatore', desc: 'I piloti chiedono il 10% in meno.', cost: 1 },
      { id: 'motivator', name: 'Motivatore', desc: 'Il morale dei tuoi piloti cresce più in fretta.', cost: 1 },
      { id: 'scout', name: 'Talent scout', desc: 'Vedi sempre il potenziale esatto dei piloti.', cost: 1 },
      { id: 'diplomat', name: 'Diplomatico', desc: 'Il consiglio perde fiducia la metà più lentamente.', cost: 2 },
    ],
  },
};

export function hasPerk(state, id) { return !!state?.career?.perks?.includes(id); }
export function xpForLevel(l) { return 120 + l * 80; }

export function ensureProgress(state) {
  const c = state.career;
  c.level ??= 1; c.xp ??= 0; c.points ??= 1; c.perks ??= [];
  if (!state.objectives) state.objectives = makeObjectives(state);
}

export function gainXP(state, amount, reason) {
  ensureProgress(state);
  const c = state.career;
  c.xp += Math.round(amount);
  let leveled = false;
  while (c.xp >= xpForLevel(c.level) && c.level < 60) { c.xp -= xpForLevel(c.level); c.level++; c.points++; leveled = true; }
  if (leveled) {
    state._levelUp = c.level;
    if (c.level >= 5 && !state.achievements.level5) state.achievements.level5 = { name: 'Manager affermato', season: state.season };
    if (c.level >= 10 && !state.achievements.level10) state.achievements.level10 = { name: 'Stratega leggendario', season: state.season };
  }
  (state._xpLog ||= []).push({ amount: Math.round(amount), reason });
}

export function buyPerk(state, id) {
  ensureProgress(state);
  const all = Object.values(PERKS).flatMap((b) => b.perks);
  const p = all.find((x) => x.id === id);
  if (!p || state.career.perks.includes(id)) return { ok: false, msg: 'Non disponibile' };
  // must own previous perks of the branch? Perks unlock in order within a branch
  const branch = Object.values(PERKS).find((b) => b.perks.includes(p));
  const idx = branch.perks.indexOf(p);
  if (idx > 0 && !state.career.perks.includes(branch.perks[idx - 1].id)) return { ok: false, msg: 'Sblocca prima l’abilità precedente.' };
  if (state.career.points < p.cost) return { ok: false, msg: 'Punti abilità insufficienti.' };
  state.career.points -= p.cost;
  state.career.perks.push(id);
  return { ok: true };
}

const OBJ = [
  { id: 'win', text: 'Vinci almeno una gara', check: (s) => s.wins >= 1, xp: 300, money: 6 },
  { id: 'podiums3', text: 'Conquista 3 podi', check: (s) => s.podiums >= 3, xp: 250, money: 5 },
  { id: 'podium', text: 'Conquista un podio', check: (s) => s.podiums >= 1, xp: 150, money: 3 },
  { id: 'points10', text: 'Vai a punti in 10 gare', check: (s) => s.pointsRaces >= 10, xp: 200, money: 4 },
  { id: 'points5', text: 'Vai a punti in 5 gare', check: (s) => s.pointsRaces >= 5, xp: 120, money: 2 },
  { id: 'pole', text: 'Ottieni una pole position', check: (s) => s.poles >= 1, xp: 200, money: 3 },
  { id: 'double', text: 'Porta entrambe le auto a punti nella stessa gara', check: (s) => s.doublePoints >= 1, xp: 150, money: 3 },
  { id: 'nodnf5', text: '5 gare consecutive senza ritiri', check: (s) => s.bestNoDnfStreak >= 5, xp: 180, money: 3 },
  { id: 'onetwo', text: 'Ottieni una doppietta', check: (s) => s.oneTwos >= 1, xp: 400, money: 8 },
];
export function makeObjectives(state) {
  const team = state.teams[state.playerTeam];
  const strong = team.rep >= 88;
  const pool = strong ? OBJ.filter((o) => ['win', 'podiums3', 'pole', 'onetwo', 'double'].includes(o.id)) : team.rep >= 75 ? OBJ.filter((o) => ['podium', 'points10', 'double', 'nodnf5', 'win'].includes(o.id)) : OBJ.filter((o) => ['points5', 'double', 'nodnf5', 'podium'].includes(o.id));
  return shuffle(pool).slice(0, 3).map((o) => ({ id: o.id, text: o.text, xp: o.xp, money: +(o.money * (state.category === 'formula' ? 1 : state.category === 'rally' ? 0.4 : 0.6)).toFixed(1), done: false }));
}

export function seasonStats(state) {
  const st = { wins: 0, podiums: 0, poles: 0, pointsRaces: 0, doublePoints: 0, oneTwos: 0, bestNoDnfStreak: 0 };
  let streak = 0;
  for (const ev of state.calendar) {
    if (!ev.results) continue;
    const mine = ev.results.classification.filter((r) => r.teamId === state.playerTeam);
    if (mine.some((r) => r.pos === 1 && r.status !== 'dnf')) st.wins++;
    st.podiums += mine.filter((r) => r.pos <= 3 && r.status !== 'dnf').length;
    if (mine.some((r) => r.pts > 0)) st.pointsRaces++;
    if (mine.length >= 2 && mine.every((r) => r.pts > 0)) st.doublePoints++;
    if (mine.filter((r) => r.pos <= 2 && r.status !== 'dnf').length >= 2) st.oneTwos++;
    if (ev.results.pole && state.drivers[ev.results.pole]?.teamId === state.playerTeam) st.poles++;
    if (mine.some((r) => r.status === 'dnf')) streak = 0; else streak++;
    st.bestNoDnfStreak = Math.max(st.bestNoDnfStreak, streak);
  }
  return st;
}

export function checkObjectives(state) {
  ensureProgress(state);
  const s = seasonStats(state);
  const done = [];
  for (const o of state.objectives) {
    if (o.done) continue;
    const def = OBJ.find((x) => x.id === o.id);
    if (def?.check(s)) { o.done = true; done.push(o); }
  }
  return done;
}
