import { CATEGORIES, DIFFICULTY } from '../data/categories.js';
import { TEAMS, ENGINE_SUPPLIERS, STAFF_NAMES } from '../data/teams.js';
import { NAME_POOLS, NATS } from '../data/names.js';
import { TRACKS, SEASON_LENGTH, SPONSORS, STAGE_NAMES } from '../data/tracks.js';
import { rand, randInt, pick, clamp, shuffle, uid, gauss, mulberry32 } from './rng.js';

const HELMET_COLORS = ['#ff2d2d', '#ffd400', '#00d2be', '#1e90ff', '#ff8000', '#ffffff', '#111111', '#9b30ff', '#00c853', '#ff4fa3', '#c0c0c0', '#0a2a66', '#ffb400', '#00e5ff'];
export function randomHelmet() {
  return { c1: pick(HELMET_COLORS), c2: pick(HELMET_COLORS), c3: pick(HELMET_COLORS), pattern: randInt(0, 5) };
}

export function driverOverall(d, cat) {
  const a = d.attrs;
  if (cat === 'rally') return Math.round(a.pace * 0.45 + a.cons * 0.25 + a.wet * 0.1 + a.exp * 0.1 + a.race * 0.05 + a.tyre * 0.05);
  if (cat === 'endurance') return Math.round(a.pace * 0.35 + a.cons * 0.25 + a.tyre * 0.12 + a.wet * 0.08 + a.race * 0.1 + a.exp * 0.1);
  return Math.round(a.pace * 0.45 + a.race * 0.15 + a.cons * 0.15 + a.wet * 0.08 + a.tyre * 0.1 + a.exp * 0.07);
}

export function makeDriver([name, nat, age, pace, cons, race, wet, tyre, exp, pot]) {
  return {
    id: uid('d'), name, nat, age,
    attrs: { pace, cons, race, wet, tyre, exp },
    pot: Math.max(pot, pace), morale: 70, teamId: null, salary: 0, contract: 0,
    helmet: randomHelmet(), number: 0,
    stats: { starts: 0, wins: 0, podiums: 0, poles: 0, titles: 0, points: 0, dnfs: 0 },
    history: [],
  };
}

export function generateRookie(cat, quality = 1) {
  const nat = pick(NATS);
  const pool = NAME_POOLS[nat];
  const age = randInt(17, 22);
  const base = clamp(gauss(70, 4) * (0.97 + quality * 0.03), 58, 84);
  const v = () => Math.round(clamp(base + gauss(0, 4), 50, 90));
  const pot = Math.round(clamp(base + rand(6, 24), 70, 99));
  return makeDriver([`${pick(pool.f)} ${pick(pool.l)}`, nat, age, v(), v() - 3, v(), v(), v() - 2, randInt(5, 30), pot]);
}

export function generateVeteranFreeAgent(cat) {
  const nat = pick(NATS);
  const pool = NAME_POOLS[nat];
  const age = randInt(25, 36);
  const base = clamp(gauss(76, 4), 66, 86);
  const v = () => Math.round(clamp(base + gauss(0, 3.5), 55, 92));
  return makeDriver([`${pick(pool.f)} ${pick(pool.l)}`, nat, age, v(), v(), v(), v(), v(), randInt(40, 85), Math.round(base + rand(0, 3))]);
}

export function makeStaff(role, rating, teamId = null) {
  const r = Math.round(clamp(rating, 30, 99));
  return { id: uid('s'), name: `${pick(STAFF_NAMES.first)} ${pick(STAFF_NAMES.last)}`, role, rating: r, age: randInt(32, 62), teamId, salary: +(0.3 + (r / 100) ** 3 * 3.5).toFixed(2) };
}

export const STAFF_ROLES = {
  td: { name: 'Direttore Tecnico', desc: 'Velocità e successo dei progetti R&D' },
  engineer: { name: 'Ingegnere di Pista', desc: 'Feedback assetto e strategia' },
  mechanic: { name: 'Capo Meccanico', desc: 'Pit stop e riparazioni' },
};

export const FACILITIES = {
  factory: { name: 'Fabbrica', desc: 'Più progetti R&D in parallelo', icon: 'factory' },
  windtunnel: { name: 'Galleria del Vento', desc: 'Guadagni R&D più alti', icon: 'wind' },
  simulator: { name: 'Simulatore', desc: 'Assetti migliori e crescita piloti', icon: 'sim' },
  pitcrew: { name: 'Centro Pit Crew', desc: 'Pit stop e assistenze più rapide', icon: 'wrench' },
  academy: { name: 'Accademia Giovani', desc: 'Scouting e crescita talenti', icon: 'star' },
};

export function salaryFor(d, cat) {
  const o = driverOverall(d, cat);
  const scale = CATEGORIES[cat].budgetScale;
  return +(Math.max(0.3, ((o - 60) / 38) ** 3.2 * 42) * scale + 0.25).toFixed(2);
}

export function makeSponsorOffers(rep, cat, n = 4) {
  const scale = CATEGORIES[cat].budgetScale;
  const out = [];
  const pool = shuffle(SPONSORS);
  for (let i = 0; i < n; i++) {
    const s = pool[i];
    const tierMult = s.tier === 3 ? 2.4 : s.tier === 2 ? 1.4 : 0.7;
    if (s.tier === 3 && rep < 70 && Math.random() < 0.7) continue;
    const perRace = +(tierMult * (0.5 + rep / 80) * scale * rand(0.75, 1.25)).toFixed(2);
    const objectives = [
      { id: 'points', text: 'Bonus per ogni gara a punti', bonus: +(perRace * 0.35).toFixed(2) },
      { id: 'podium', text: 'Bonus per ogni podio', bonus: +(perRace * 1.6).toFixed(2) },
      { id: 'win', text: 'Bonus per ogni vittoria', bonus: +(perRace * 3).toFixed(2) },
      { id: 'finish', text: 'Bonus se entrambe le auto arrivano', bonus: +(perRace * 0.3).toFixed(2) },
      { id: 'beat', text: 'Bonus battendo il rivale diretto', bonus: +(perRace * 0.6).toFixed(2) },
    ];
    const obj = rep > 85 ? pick(objectives.slice(1, 3)) : rep > 70 ? pick(objectives.slice(0, 2)) : pick([objectives[0], objectives[3], objectives[4]]);
    out.push({ id: uid('sp'), name: s.name, tier: s.tier, perRace, objective: obj.id, objText: obj.text, bonus: obj.bonus, seasons: randInt(1, 3), signing: +(perRace * rand(1, 3)).toFixed(2) });
  }
  return out;
}

function trackLap(t) {
  const r = mulberry32(t.seed)();
  return 76 + r * 26;
}

export function buildCalendar(cat, length) {
  const n = SEASON_LENGTH[cat][length] ?? SEASON_LENGTH[cat].normal;
  const all = TRACKS[cat];
  let chosen;
  if (n >= all.length) chosen = all.slice();
  else {
    // keep calendar order but pick subset (always keep iconic events)
    const iconic = new Set(['mon', 'ita', 'gbr', 'bel', 'lem', 'mc', 'fin', 'swe', 'abu']);
    const must = all.filter((t) => iconic.has(t.id));
    const rest = shuffle(all.filter((t) => !iconic.has(t.id))).slice(0, Math.max(0, n - must.length));
    const set = new Set([...must, ...rest].map((t) => t.id));
    chosen = all.filter((t) => set.has(t.id)).slice(0, n);
  }
  return chosen.map((t, i) => {
    const ev = { trackId: t.id, round: i + 1, done: false, weather: null, results: null };
    if (cat === 'rally') {
      const r = mulberry32(t.seed + i);
      const names = shuffle(STAGE_NAMES);
      ev.stages = t.surfaces.map((s, si) => ({ name: names[si], surface: s, km: Math.round(8 + r() * 18 + (si === 2 ? 8 : 0)), power: si === t.surfaces.length - 1 }));
    }
    return ev;
  });
}

export function getTrack(cat, id) {
  const t = TRACKS[cat].find((x) => x.id === id);
  return t ? { ...t, lap: t.lap || trackLap(t) } : null;
}

function teamFromData(td, cat, diff, isPlayer) {
  const C = CATEGORIES[cat];
  const parts = {};
  for (const p of C.parts) {
    parts[p.id] = Math.round(clamp(td.base + (td.bias?.[p.id] || 0) + rand(-1.5, 1.5), 40, 98));
  }
  if (cat === 'formula') {
    const sup = ENGINE_SUPPLIERS.find((e) => e.id === td.engine);
    if (sup) parts.engine = Math.round(clamp(sup.power + (td.bias?.engine || 0) + rand(-1, 1), 40, 98));
  }
  const fac = {};
  const lvl = td.base > 86 ? 4 : td.base > 80 ? 3 : td.base > 74 ? 2 : 2;
  for (const k of Object.keys(FACILITIES)) fac[k] = clamp(lvl + randInt(-1, 1), 1, 5);
  let budget = td.budget; // budgets are already in category scale
  if (isPlayer) budget *= DIFFICULTY[diff].budget;
  return {
    id: td.id, name: td.name, short: td.short, colors: td.colors.slice(), engine: td.engine || null, works: !!td.works,
    rep: td.rep, money: Math.round(budget * 0.55 * 10) / 10, baseBudget: td.budget, principal: td.principal, hq: td.hq,
    car: { parts, concept: 'balanced', livery: { pattern: randInt(0, 4), primary: td.colors[0], secondary: td.colors[1], accent: td.colors[2], number: 0 } },
    projects: [], facilities: fac, facilityBuild: null,
    staff: {}, drivers: [], sponsors: [], lastPos: null, aggression: rand(0.3, 0.8),
  };
}

export function createWorld({ playerName, category, teamId, difficulty, seasonLength, raceLength, customTeam }) {
  const cat = category;
  const C = CATEGORIES[cat];
  const state = {
    version: 1, playerName, category: cat, difficulty, seasonLength, raceLength,
    season: 2026, round: 0, phase: 'preseason',
    teams: {}, drivers: {}, staff: {}, playerTeam: null,
    calendar: buildCalendar(cat, seasonLength),
    inbox: [], news: [], finance: [], sponsorOffers: [],
    career: { reputation: 50, trophies: [], history: [], seasonsManaged: 0, firstSeason: 2026 },
    board: { target: 5, confidence: 70 }, achievements: {},
    created: Date.now(), weekend: null, dayCounter: 0,
  };

  const teamsData = TEAMS[cat].map((t) => ({ ...t }));
  if (customTeam) {
    // Custom team replaces the weakest team on the grid
    const weakest = teamsData.slice().sort((a, b) => a.base - b.base)[0];
    const idx = teamsData.indexOf(weakest);
    teamsData[idx] = {
      ...weakest, id: 'custom', name: customTeam.name, short: customTeam.short.toUpperCase().slice(0, 3),
      colors: customTeam.colors, rep: 55, base: weakest.base - 2, budget: weakest.budget * 0.9, principal: playerName, hq: customTeam.hq || 'Italia',
      engine: cat === 'formula' ? (customTeam.engine || 'ferrani') : null, works: false,
      d: [],
    };
    teamId = 'custom';
  }

  const usedNumbers = new Set();
  const nextNumber = () => { let n; do { n = randInt(2, 99); } while (usedNumbers.has(n)); usedNumbers.add(n); return n; };

  for (const td of teamsData) {
    const t = teamFromData(td, cat, difficulty, td.id === teamId);
    state.teams[t.id] = t;
    for (const dd of td.d) {
      const d = makeDriver(dd);
      d.teamId = t.id; d.contract = randInt(1, 3); d.salary = salaryFor(d, cat); d.number = nextNumber();
      state.drivers[d.id] = d; t.drivers.push(d.id);
    }
    // staff
    const q = td.base + 2;
    for (const role of Object.keys(STAFF_ROLES)) {
      const s = makeStaff(role, q + gauss(0, 5), t.id);
      state.staff[s.id] = s; t.staff[role] = s.id;
    }
    // sponsors for AI teams (abstracted)
    const offers = makeSponsorOffers(t.rep, cat, 3);
    t.sponsors = offers.slice(0, 2).map((o) => ({ ...o, seasonsLeft: o.seasons }));
  }

  // Free agents and rookies
  for (let i = 0; i < 8; i++) { const d = generateRookie(cat); d.number = nextNumber(); state.drivers[d.id] = d; }
  for (let i = 0; i < 6; i++) { const d = generateVeteranFreeAgent(cat); d.number = nextNumber(); state.drivers[d.id] = d; }
  for (const d of Object.values(state.drivers)) if (!d.teamId) d.salary = salaryFor(d, cat);
  // Free staff pool
  for (const role of Object.keys(STAFF_ROLES)) for (let i = 0; i < 4; i++) { const s = makeStaff(role, rand(55, 92)); state.staff[s.id] = s; }

  const pt = state.teams[teamId];
  state.playerTeam = teamId;
  pt.isPlayer = true;
  pt.principal = playerName;
  pt.sponsors = [];
  // Fill custom team seats with free agents
  const seats = C.cars * C.driversPerCar;
  if (pt.drivers.length < seats) {
    const free = Object.values(state.drivers).filter((d) => !d.teamId).sort((a, b) => driverOverall(b, cat) - driverOverall(a, cat));
    const pickList = [free[3], free[6], free[1], free[9]].filter(Boolean);
    while (pt.drivers.length < seats && pickList.length) {
      const d = pickList.shift(); d.teamId = pt.id; d.contract = 2; d.salary = salaryFor(d, cat); pt.drivers.push(d.id);
    }
  }
  if (customTeam) {
    pt.car.livery = { pattern: customTeam.pattern ?? 1, primary: customTeam.colors[0], secondary: customTeam.colors[1], accent: customTeam.colors[2], number: 0 };
  }
  state.sponsorOffers = makeSponsorOffers(pt.rep, cat, 5);
  state.career.reputation = Math.round(clamp(pt.rep * 0.6, 30, 70));

  // Board expectation based on car ranking
  const ranking = Object.values(state.teams).sort((a, b) => avgPart(b) - avgPart(a)).map((t) => t.id);
  state.board.target = Math.min(ranking.length, ranking.indexOf(teamId) + 1 + (difficulty === 'easy' ? 1 : 0));
  state.board.confidence = 70;
  return state;
}

export function avgPart(team) {
  const v = Object.entries(team.car.parts).filter(([k]) => k !== 'reliability').map(([, v]) => v);
  return v.reduce((a, b) => a + b, 0) / v.length;
}
