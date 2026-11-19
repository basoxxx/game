// Orda · La tua base — persistent state in localStorage. Tiny on purpose (no three.js, no DOM):
// the Orda menu and the hub read it for badges without pulling the base editor in.
import { starterLayout } from './logic.js';
import { RAID_TOKENS, BUILDINGS } from './data.js';

export const BASE_KEY = 'sala_orda_base_v1';

const prodSince = (s, now) => { for (const b of s.layout.b) if (BUILDINGS[b.t]?.kind === 'prod' && !(b.since > 0)) b.since = now; return s; };
export function freshBase(now = Date.now()) {
  return prodSince({
    v: 1, seed: (Math.floor(Math.random() * 1e9) + 1) >>> 0, created: now,
    layout: starterLayout(),
    bricks: 120, coins: 0, // coins: only used when no shared wallet is plugged in (tests)
    stats: { produced: {}, raids: 0, raidWins: 0, stars: 0, attacked: 0, defended: 0, looted: { coins: 0, bricks: 0 }, revenges: 0 },
    raids: { tokens: RAID_TOKENS, tokenAt: now, listN: 0, listAt: now, done: {}, best: {} },
    defense: { lastSeen: now, checkedUntil: now, shieldUntil: 0, reports: [] },
  }, now);
}

export function baseLoad(now = Date.now()) {
  try {
    const d = JSON.parse(localStorage.getItem(BASE_KEY) || 'null');
    if (d && typeof d === 'object' && d.layout && Array.isArray(d.layout.b)) {
      const f = freshBase(now);
      return prodSince({
        ...f, ...d, layout: { b: d.layout.b.filter((b) => BUILDINGS[b.t]), nid: d.layout.nid || 0 },
        stats: { ...f.stats, ...(d.stats || {}), looted: { ...f.stats.looted, ...(d.stats?.looted || {}) }, produced: { ...(d.stats?.produced || {}) } },
        raids: { ...f.raids, ...(d.raids || {}), done: { ...(d.raids?.done || {}) }, best: { ...(d.raids?.best || {}) } },
        defense: { ...f.defense, ...(d.defense || {}), reports: Array.isArray(d.defense?.reports) ? d.defense.reports : [] },
      }, now);
    }
  } catch {}
  return freshBase(now);
}
export function baseSave(s) { try { localStorage.setItem(BASE_KEY, JSON.stringify(s)); } catch {} return s; }
// for the hub / Orda menu badges: unread defence reports
export function baseBadge() {
  try { const d = JSON.parse(localStorage.getItem(BASE_KEY) || 'null'); return d ? (d.defense?.reports || []).filter((r) => !r.seen).length : 0; } catch { return 0; }
}
