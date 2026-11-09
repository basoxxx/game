import { helmet3D } from '../ui/garage3d.js';
// Shared UI fragments
import { helmetSVG, flagSVG, teamBadge } from '../ui/art.js';
import { esc, ratingClass, bar } from '../ui/dom.js';
import { driverOverall } from '../engine/world.js';
import { COMPOUNDS, RALLY_TYRES } from '../data/categories.js';

export function driverChip(st, d, opts = {}) {
  const t = d.teamId ? st.teams[d.teamId] : null;
  return `<div class="row" style="gap:8px;min-width:0">${opts.helmet !== false ? helmet3D(d.helmet, opts.size || 28) : ''}${flagSVG(d.nat)}<span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.name)}</span>${opts.team && t ? `<span class="tiny muted">${t.short}</span>` : ''}</div>`;
}
export function ovr(st, d) { return driverOverall(d, st.category); }
export function ratingBox(v, sm = true) { return `<div class="rating ${sm ? 'sm' : ''} ${ratingClass(v)}">${Math.round(v)}</div>`; }
export function teamStripe(t) { return `<span class="teamstripe" style="background:${t.colors[0]};box-shadow:inset 0 -6px 0 ${t.colors[1]}"></span>`; }
export function tyreBadge(id) {
  const c = COMPOUNDS[id] || RALLY_TYRES[id];
  if (!c) return '';
  return `<span class="tyre" style="color:${c.color}" title="${c.name}">${c.short}</span>`;
}
export const ATTR_NAMES = { pace: 'Velocità', cons: 'Costanza', race: 'Duelli', wet: 'Bagnato', tyre: 'Gestione Gomme', exp: 'Esperienza' };
export function attrBars(d, potential) {
  return Object.entries(ATTR_NAMES).map(([k, n]) => `<div class="stat"><span class="muted">${n}</span>${bar(d.attrs[k], d.attrs[k] >= 88 ? 'gold' : d.attrs[k] >= 80 ? 'green' : '')}<b class="right mono">${d.attrs[k]}</b></div>`).join('');
}
export function moraleChip(m) {
  const cls = m >= 75 ? 'good' : m >= 45 ? 'warn' : 'bad';
  const t = m >= 75 ? 'Motivato' : m >= 45 ? 'Tranquillo' : 'Scontento';
  return `<span class="chip ${cls}">${t} ${m}</span>`;
}
export { teamBadge };
