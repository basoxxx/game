// Power unit / gearbox pool per driver (Formula Apex only).
// Each driver has a limited number of components per season. Components wear race after race:
// a worn PU loses a little power and is much more likely to fail. Fitting an extra element over
// the allocation costs grid places (10 for the first extra PU, 5 for each further element).
import { clamp, rand, chance } from './rng.js';
import { puWearMult } from './depth.js';

export const COMP_TYPES = {
  ice: { name: 'Power Unit', short: 'PU', basePool: 4, pen1: 10, penN: 5, perf: true },
  gb: { name: 'Cambio', short: 'CAMBIO', basePool: 4, pen1: 5, penN: 5, perf: false },
};
export const DESTROYED = 9;

export function compEnabled(state) { return state?.category === 'formula' && !state.quick; }

export function compPool(state, type) {
  const n = state.calendar?.length || 24;
  return Math.max(2, Math.round(COMP_TYPES[type].basePool * n / 24));
}
// races a single unit is designed to last (a little more than an even split of the season)
export function compLife(state, type) {
  return (state.calendar?.length || 24) / compPool(state, type) * (type === 'gb' ? 1.08 : 1.0);
}

export function ensureComp(state, d) {
  if (!d) return null;
  if (!d.comp || d.comp.season !== state.season) d.comp = { season: state.season, ice: { used: 1, wear: 0 }, gb: { used: 1, wear: 0 } };
  return d.comp;
}

export function compStatus(state, d) {
  const c = ensureComp(state, d);
  const out = {};
  for (const type of Object.keys(COMP_TYPES)) {
    const pool = compPool(state, type);
    const x = c[type];
    out[type] = { ...COMP_TYPES[type], type, used: x.used, pool, wear: x.wear, destroyed: x.wear >= DESTROYED, over: x.used > pool, nextPenalty: nextPenalty(state, d, type) };
  }
  return out;
}

function nextPenalty(state, d, type) {
  const c = ensureComp(state, d); const pool = compPool(state, type); const T = COMP_TYPES[type];
  if (c[type].used + 1 <= pool) return 0;
  return c[type].used + 1 === pool + 1 ? T.pen1 : T.penN;
}

// Fit a fresh element. Returns grid places lost (0 if within the pool).
export function fitComponent(state, d, type, why = '') {
  const c = ensureComp(state, d);
  const pen = nextPenalty(state, d, type);
  c[type].used++; c[type].wear = 0; c[type].warned = false;
  if (pen > 0) {
    const gp = d.gridPen && d.gridPen.season === state.season && d.gridPen.round === state.round ? d.gridPen : (d.gridPen = { season: state.season, round: state.round, places: 0, items: [] });
    gp.places += pen; gp.items.push(`${COMP_TYPES[type].short} n.${c[type].used}${why ? ' (' + why + ')' : ''}`);
  }
  return pen;
}

// Lap time multiplier from PU freshness: fresh ~ -0.1%, at end of life ~ +0.15%, beyond ~ +0.3%
export function compLapFactor(state, d) {
  if (!compEnabled(state) || !d) return 1;
  const w = ensureComp(state, d).ice.wear;
  const ww = w >= DESTROYED ? 1.3 : clamp(w, 0, 1.4);
  return 1 + (ww - 0.42) * 0.0025;
}

// Mechanical failure multiplier from component age
export function compFailMult(state, d) {
  if (!compEnabled(state) || !d) return 1;
  const c = ensureComp(state, d);
  const f = (w, k) => (w >= DESTROYED ? 4 : w < 0.7 ? 0.8 : 0.8 + (w - 0.7) * k);
  return f(c.ice.wear, 3.2) * 0.65 + f(c.gb.wear, 2.4) * 0.35;
}
// When a car breaks down, which component did it kill? (weighted by wear)
export function failureComponent(state, d) {
  const c = ensureComp(state, d);
  const wi = 0.6 + c.ice.wear, wg = 0.35 + c.gb.wear * 0.8;
  return Math.random() * (wi + wg) < wi ? 'ice' : 'gb';
}

// Wear accumulated over a race weekend
export function weekendWear(state, team, track, sprint) {
  const parts = team.car.parts;
  const rel = parts.reliability ?? 75;
  const engW = track?.w?.engine ?? 1;
  return { ice: (0.85 + engW * 0.15) * (1.32 - rel / 250) * rand(0.88, 1.12) * (sprint ? 1.22 : 1) * puWearMult(state, team), gb: (1.3 - rel / 280) * rand(0.85, 1.15) * (sprint ? 1.15 : 1) };
}

// Before qualifying: AI teams (and the player's team when simulated) decide whether to fit new parts.
// For the player's team in an interactive weekend only destroyed parts are replaced automatically.
export function prepareComponents(state, track, entries) {
  if (!compEnabled(state)) return [];
  const notes = [];
  for (const e of entries) {
    const team = state.teams[e.teamId];
    const manual = team.isPlayer && state.weekend;
    for (const did of e.driverIds) {
      const d = state.drivers[did]; if (!d) continue;
      const st = compStatus(state, d);
      for (const type of Object.keys(COMP_TYPES)) {
        const s = st[type];
        let fit = s.destroyed;
        if (!manual && !fit) {
          const lim = type === 'ice' ? 1.0 : 1.08;
          if (s.wear >= lim) fit = true;
          // already taking a penalty this weekend? stack fresh parts while at it
          else if (d.gridPen?.season === state.season && d.gridPen?.round === state.round && s.wear > 0.55) fit = true;
          // strategic: over the pool anyway, take it where overtaking is easy
          else if (s.used >= s.pool && s.wear > 0.8 && (track.ovt ?? 0.4) > 0.55 && chance(0.5)) fit = true;
        }
        if (fit) {
          const pen = fitComponent(state, d, type, s.destroyed ? 'dopo il guasto' : '');
          if (team.isPlayer) notes.push({ d, type, pen, forced: s.destroyed });
        }
      }
    }
  }
  return notes;
}

// Reorder a qualifying grid applying grid-place penalties. Returns { grid, pens }
export function applyGridPenalties(state, grid, entriesByKey) {
  const pens = [];
  const n = grid.length;
  const keyed = grid.map((key, i) => {
    const e = entriesByKey[key];
    let places = 0, items = [];
    for (const did of e?.driverIds || []) {
      const d = state.drivers[did];
      const gp = d?.gridPen;
      if (gp && gp.season === state.season && gp.round === state.round) { places += gp.places; items.push(...gp.items); d.gridPen = null; }
      const sp = d?.stewardGrid;
      if (sp && sp.season === state.season && sp.round === state.round) { places += sp.places; items.push(sp.why); d.stewardGrid = null; }
    }
    if (places > 0) pens.push({ key, driverId: e.driverIds[0], places, back: places >= 15, items, from: i + 1 });
    return { key, sortKey: places >= 15 ? n + 1 + i / 100 : places > 0 ? i + places + 0.5 : i };
  });
  keyed.sort((a, b) => a.sortKey - b.sortKey);
  const out = keyed.map((x) => x.key);
  for (const p of pens) p.to = out.indexOf(p.key) + 1;
  return { grid: out, pens };
}

// After the race: wear every component, destroy the ones that failed
export function postRaceComponents(state, results, track) {
  if (!compEnabled(state)) return;
  const sprint = !!results.sprint;
  for (const r of results.classification) {
    const team = state.teams[r.teamId]; if (!team) continue;
    const w = weekendWear(state, team, track, sprint);
    for (const did of r.driverIds) {
      const d = state.drivers[did]; if (!d) continue;
      const c = ensureComp(state, d);
      const frac = r.status === 'dnf' ? 0.7 : 1;
      for (const type of Object.keys(COMP_TYPES)) if (c[type].wear < DESTROYED) c[type].wear = +(c[type].wear + w[type] * frac / compLife(state, type)).toFixed(3);
      const f = results.compFails?.[r.key];
      if (f) c[f].wear = DESTROYED;
      if (results.compDamage?.[r.key]) c.ice.wear = Math.min(DESTROYED - 1, +(c.ice.wear + results.compDamage[r.key]).toFixed(3));
      if (team.isPlayer) {
        const bad = Object.keys(COMP_TYPES).filter((type) => c[type].wear >= DESTROYED || (c[type].wear >= 0.88 && !c[type].warned));
        if (bad.length) {
          for (const type of bad) c[type].warned = true;
          const txt = bad.map((type) => `${COMP_TYPES[type].name}: ${c[type].wear >= DESTROYED ? 'distrutto' : `usura ${Math.round(c[type].wear * 100)}%`} (${c[type].used}/${compPool(state, type)} usati)`).join('\n');
          state.inbox.unshift({ id: `cmp_${d.id}_${state.season}_${state.round}`, from: 'Reparto Motori', icon: 'rd', type: 'bad', subject: `Componenti a fine vita: ${d.name}`, body: `${txt}\n\nUn componente oltre la vita utile perde potenza e rischia il guasto. Nelle prove libere puoi montarne uno nuovo: se superi l’allocazione stagionale scatta la penalità in griglia. Conviene farlo su una pista dove si sorpassa facilmente.`, read: false, season: state.season, round: state.round });
        }
      }
    }
  }
}

export function compSummaryText(state, d) {
  const s = compStatus(state, d);
  return Object.values(s).map((x) => `${x.short} ${x.used}/${x.pool}${x.destroyed ? ' (rotto)' : ` · usura ${Math.round(x.wear * 100)}%`}`).join(' · ');
}

