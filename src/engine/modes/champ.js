// "Campionato personalizzato" and "Team Principal a tempo": a custom season on a quick world.
// Pure racing: no finances, R&D or market (state.quick = true). Saved in its own localStorage key.
import { createWorld, driverOverall } from '../world.js';
import { setState, S } from '../state.js';
import { standings } from '../season.js';
import { TEAMS } from '../../data/teams.js';
import { TRACKS } from '../../data/tracks.js';
import { CATEGORIES } from '../../data/categories.js';
import { eventFor, weatherValue } from './launch.js';
import { load, store } from './objectives.js';

export const CHAMP_KEY = 'apexdynasty_mode_champ';
export const TP_KEY = 'apexdynasty_mode_tp';
export const keyFor = (kind) => (kind === 'tp' ? TP_KEY : CHAMP_KEY);

export const POINT_SYSTEMS = {
  modern: { name: 'Moderno', desc: '25-18-15-12-10-8-6-4-2-1', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1] },
  classic: { name: 'Anni 2000', desc: '10-8-6-5-4-3-2-1', race: [10, 8, 6, 5, 4, 3, 2, 1], sprint: [3, 2, 1] },
  vintage: { name: 'Anni ’60', desc: '9-6-4-3-2-1', race: [9, 6, 4, 3, 2, 1], sprint: [2, 1] },
  all: { name: 'Tutti a punti', desc: 'Punti a scalare per tutta la griglia', race: Array.from({ length: 30 }, (_, i) => Math.max(1, 30 - i * 1.5 | 0)), sprint: [6, 5, 4, 3, 2, 1] },
  winner: { name: 'Solo il podio', desc: '10-6-3: conta solo salire sul podio', race: [10, 6, 3], sprint: [3, 1] },
};
export const REALISM = {
  arcade: { name: 'Arcade', desc: 'Pochi guasti e incidenti', failures: 0.3, damage: 0.5, aiAggr: 0.9 },
  normal: { name: 'Realistico', desc: 'Come nella carriera', failures: 1, damage: 1, aiAggr: 1 },
  sim: { name: 'Simulazione', desc: 'Guasti, contatti e rivali aggressivi', failures: 1.6, damage: 1.5, aiAggr: 1.3 },
};
export const WEATHER = { auto: 'Realistico', dry: 'Sempre asciutto', mixed: 'Variabile', rain: 'Sempre pioggia', random: 'A sorpresa per gara' };
export const REVERSE = { off: 'No', alt: 'A gare alterne', on: 'Sempre' };
export const SPRINT = { off: 'Nessuna', classic: 'Come da calendario', all: 'In ogni weekend' };
export const TP_TOKENS = 6;

export function defaultCfg(cat = 'formula') {
  const tr = TRACKS[cat];
  return {
    cat, rounds: tr.slice(0, Math.min(5, tr.length)).map((t) => t.id), points: 'modern', fastest: true, sprint: 'classic',
    weather: 'auto', realism: 'normal', grid: TEAMS[cat].length, reverse: 'off', team: TEAMS[cat][Math.min(4, TEAMS[cat].length - 1)].id,
    driver: null, mono: false, diff: 'normal', len: 'short', format: 'race', name: '',
  };
}

export function sprintAllowed(cat) { return cat === 'formula' || cat === 'junior'; }

export function createChampionship(cfg, kind = 'champ') {
  const cat = cfg.cat;
  const st = createWorld({ playerName: 'Direttore', category: cat, teamId: cfg.team, difficulty: cfg.diff, seasonLength: 'short', raceLength: cfg.len });
  st.quick = true; st.slot = null; st.tutorialSeen = true;
  // grid size: drop AI teams (weakest-reputation first among the extras, never the player)
  const ai = Object.values(st.teams).filter((t) => !t.isPlayer);
  const drop = Math.max(0, Object.keys(st.teams).length - Math.max(3, cfg.grid || 99));
  ai.sort((a, b) => (a.rep || 0) - (b.rep || 0)).slice(0, drop).forEach((t) => {
    for (const id of t.drivers) { const d = st.drivers[id]; if (d) d.teamId = null; }
    delete st.teams[t.id];
  });
  // driver to manage: swap the chosen star into the player's last seat
  const pt = st.teams[st.playerTeam];
  if (cfg.driver) {
    const d = Object.values(st.drivers).find((x) => x.name === cfg.driver);
    if (d && d.teamId !== pt.id) {
      const out = st.drivers[pt.drivers[pt.drivers.length - 1]];
      const from = d.teamId ? st.teams[d.teamId] : null;
      if (from) from.drivers[from.drivers.indexOf(d.id)] = out.id;
      out.teamId = from?.id || null;
      pt.drivers[pt.drivers.length - 1] = d.id; d.teamId = pt.id;
    }
  }
  // monomarca: identical cars, the drivers make the difference
  if (cfg.mono) {
    const ref = {};
    for (const p of CATEGORIES[cat].parts) { const vals = Object.values(st.teams).map((t) => t.car.parts[p.id]).sort((a, b) => a - b); ref[p.id] = vals[Math.floor(vals.length / 2)]; }
    for (const t of Object.values(st.teams)) { t.car.parts = { ...ref }; t.car.concept = 'balanced'; for (const k of Object.keys(t.facilities)) t.facilities[k] = 3; }
  }
  const r = (seed) => { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
  st.calendar = cfg.rounds.map((id, i) => {
    const ev = eventFor(cat, id, i);
    if (!sprintAllowed(cat) || cfg.sprint === 'off') delete ev.sprint;
    else if (cfg.sprint === 'all') ev.sprint = true;
    ev.weatherRule = cfg.weather === 'random' ? ['dry', 'dry', 'auto', 'mixed', 'rain'][Math.floor(r(`${id}${i}${Date.now()}`) * 5)] : cfg.weather;
    ev.reverse = cat !== 'rally' && (cfg.reverse === 'on' || (cfg.reverse === 'alt' && i % 2 === 1));
    return ev;
  });
  st.modeRun = { kind, cfg: { ...cfg }, startedAt: Date.now(), tokens: kind === 'tp' ? TP_TOKENS : 0, upgrades: {}, log: [] };
  setState(st);
  saveChamp(st);
  return st;
}

export function saveChamp(st = S()) {
  if (!st?.modeRun || (st.modeRun.kind !== 'champ' && st.modeRun.kind !== 'tp')) return false;
  return store(keyFor(st.modeRun.kind), st);
}
export function loadChamp(kind = 'champ') {
  const st = load(keyFor(kind), null);
  if (!st?.modeRun || !st.teams) return null;
  return st;
}
export function deleteChamp(kind = 'champ') { try { localStorage.removeItem(keyFor(kind)); } catch {} }

// prepare the world for the next round's weekend
export function prepareRound(st) {
  const ev = st.calendar[st.round]; if (!ev) return null;
  const cfg = st.modeRun.cfg;
  st.forceRain = weatherValue(ev.weatherRule || cfg.weather);
  st.quickGrid = ev.reverse ? 'reverse' : 'quali';
  st.quickSkip = cfg.format === 'race';
  st.modeRun.sprintRound = !!ev.sprint;
  st.weekend = st.weekend && st.weekend.trackId === ev.trackId ? st.weekend : null;
  return ev;
}

// rewrite the points of a round with the championship's system (runs before the results screen)
export function applyPoints(st, ev) {
  if (!ev?.results || ev._modePts) return;
  ev._modePts = true;
  const ps = POINT_SYSTEMS[st.modeRun.cfg.points] || POINT_SYSTEMS.modern;
  const dbl = !!TRACKS[st.category].find((t) => t.id === ev.trackId)?.double;
  const res = ev.results; const rally = st.category === 'rally';
  const fl = st.modeRun.cfg.fastest && !rally ? res.fastest?.key : null;
  for (const r of res.classification) {
    const base = r.status === 'dnf' ? 0 : (ps.race[r.pos - 1] || 0) * (dbl ? 2 : 1);
    r.pts = base + (rally ? r.ps || 0 : 0) + (fl && r.key === fl && r.status !== 'dnf' && r.pos <= 10 ? 1 : 0);
    if (fl && r.key === fl && r.pos <= 10) r.fl = true;
  }
  for (const r of res.sprint || []) r.pts = r.status === 'dnf' ? 0 : ps.sprint[r.pos - 1] || 0;
}

// the summary of a completed round for the between-race screen
export function roundSummary(st, idx) {
  const ev = st.calendar[idx]; if (!ev?.results) return null;
  const cls = ev.results.classification;
  const mine = cls.filter((r) => r.teamId === st.playerTeam);
  const win = cls[0];
  return { ev, win, mine, pts: mine.reduce((a, r) => a + (r.pts || 0), 0) + (ev.results.sprint || []).filter((r) => r.teamId === st.playerTeam).reduce((a, r) => a + (r.pts || 0), 0) };
}

export function champTable(st) {
  const s = standings(st);
  const drivers = s.drivers.filter((x) => st.drivers[x.id]?.teamId && st.teams[st.drivers[x.id].teamId]);
  return { drivers, teams: s.teams.filter((t) => st.teams[t.id]) };
}

// Team Principal a tempo: spend upgrade tokens between races
export const TP_UPGRADES = {
  power: { name: 'Motore', desc: '+3 al motore', parts: ['engine'], amt: 3 },
  aero: { name: 'Aerodinamica e telaio', desc: '+2 ad aerodinamica e telaio', parts: ['aero', 'chassis'] },
  grip: { name: 'Meccanica', desc: '+2 a gomme, sospensioni, cambio, efficienza', parts: ['tyre', 'suspension', 'gearbox', 'efficiency'] },
  rel: { name: 'Affidabilità', desc: '+4 affidabilità', parts: ['reliability'], amt: 4 },
  drivers: { name: 'Simulatore', desc: '+2 al ritmo dei tuoi piloti', drivers: true },
};
export function buyUpgrade(st, id) {
  const m = st.modeRun; const u = TP_UPGRADES[id]; if (!u || m.tokens <= 0) return false;
  const pt = st.teams[st.playerTeam];
  if (u.drivers) { for (const did of pt.drivers) { const d = st.drivers[did]; if (d) d.attrs.pace = Math.min(99, d.attrs.pace + 2); } }
  else {
    let hit = 0;
    for (const p of u.parts) if (pt.car.parts[p] != null) { pt.car.parts[p] = Math.min(99, pt.car.parts[p] + (u.amt || 2)); hit++; }
    if (!hit) { const k = Object.keys(pt.car.parts).filter((x) => x !== 'reliability'); for (const p of k) pt.car.parts[p] = Math.min(99, pt.car.parts[p] + 1); }
  }
  m.tokens--; m.upgrades[id] = (m.upgrades[id] || 0) + 1;
  saveChamp(st);
  return true;
}
export function teamOverall(st, t) {
  const v = Object.entries(t.car.parts).filter(([k]) => k !== 'reliability').map(([, v]) => v);
  return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
}
export { driverOverall };
