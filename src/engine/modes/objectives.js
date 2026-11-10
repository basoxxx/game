// Objectives (bronze/silver/gold) and their evaluation on a race classification
import { TEAMS } from '../../data/teams.js';

export const MEDAL = [
  { id: 0, name: 'Bronzo', col: '#d98c4a', stars: 1 },
  { id: 1, name: 'Argento', col: '#c9d1dc', stars: 2 },
  { id: 2, name: 'Oro', col: '#ffcc33', stars: 3 },
];

export function objLabel(o, cat) {
  const tn = (id) => TEAMS[cat]?.find((t) => t.id === id)?.name || id;
  switch (o.t) {
    case 'pos': return o.v === 1 ? 'Vinci' : o.v === 3 ? 'Sali sul podio' : `Arriva entro la P${o.v}`;
    case 'gain': return `Guadagna almeno ${o.v} posizioni`;
    case 'both': return `Entrambe le vetture entro la P${o.v}`;
    case 'finish': return 'Porta al traguardo una vettura';
    case 'beat': return `Arriva davanti alla ${tn(o.team)}`;
    default: return '?';
  }
}
export function objShort(o) {
  return { pos: `P${o.v}`, gain: `+${o.v}`, both: `2×P${o.v}`, finish: 'Arrivo', beat: 'Davanti' }[o.t] || '';
}

// stats of the player's cars in a result
export function myStats(results, teamId) {
  const cls = results?.classification || [];
  const mine = cls.filter((r) => r.teamId === teamId);
  const fin = mine.filter((r) => r.status !== 'dnf');
  const best = fin.length ? Math.min(...fin.map((r) => r.pos)) : 99;
  const worst = mine.length && fin.length === mine.length ? Math.max(...fin.map((r) => r.pos)) : 99;
  const gain = fin.length ? Math.max(...fin.map((r) => (r.grid || r.pos) - r.pos)) : -99;
  return { cls, mine, fin, best, worst, gain };
}

export function objMet(o, results, teamId) {
  const s = myStats(results, teamId);
  switch (o.t) {
    case 'pos': return s.best <= o.v;
    case 'gain': return s.gain >= o.v;
    case 'both': return s.worst <= o.v;
    case 'finish': return s.fin.length > 0;
    case 'beat': {
      const rb = s.cls.filter((r) => r.teamId === o.team && r.status !== 'dnf').map((r) => r.pos);
      return s.best < (rb.length ? Math.min(...rb) : 99);
    }
    default: return false;
  }
}

// highest medal reached (-1 none). Tiers are cumulative by design: gold implies the medal value only.
export function evalTiers(tiers, results, teamId) {
  const met = tiers.map((o) => objMet(o, results, teamId));
  let medal = -1;
  for (let i = 0; i < met.length; i++) if (met[i]) medal = i;
  return { met, medal, ...myStats(results, teamId) };
}

// --- tiny storage helpers (each mode owns its own localStorage key) ---
export function load(key, def) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? def; } catch { return def; } }
export function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { console.warn('mode store', e); return false; } }
