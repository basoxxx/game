// Bastione — persistent progress. Tiny on purpose: the Baso Hub entry reads it without pulling in the
// game. Coins buy the upgrade tree and hero levels; gems (stars, daily challenge, endless records)
// unlock heroes and the third spell. Everything is earned by playing: no ads, no purchases.
const KEY = 'sala_bastione_v1';
const DEF = {
  stars: {},            // levelId -> best stars (0-3), per difficulty in starsD[diff][id]
  starsD: {},
  coins: 0, gems: 0,
  tree: {},             // upgrade tree node -> level
  heroes: ['capitano'], hero: 'capitano', hlv: {},
  spells: ['meteore', 'rinforzi'],
  diff: 'normale',
  endless: {},          // mapId -> best wave
  daily: {},            // dayKey -> { won, stars, wave, gems }
  games: 0, wins: 0, kills: 0, coinsEarned: 0,
  opt: { shake: true, numbers: true, speed: 1, ranges: true, autoWave: false },
  seen: {},             // enemy types already introduced
};
const clone = (o) => JSON.parse(JSON.stringify(o));
export function bsLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      const p = { ...clone(DEF), ...d };
      for (const k of ['stars', 'starsD', 'tree', 'hlv', 'endless', 'daily', 'seen']) p[k] = { ...(d[k] || {}) };
      p.opt = { ...DEF.opt, ...(d.opt || {}) };
      for (const k of ['heroes', 'spells']) if (!Array.isArray(p[k]) || !p[k].length) p[k] = clone(DEF[k]);
      if (!p.heroes.includes(p.hero)) p.hero = p.heroes[0];
      return p;
    }
  } catch {}
  return clone(DEF);
}
export function bsSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const bsStars = (p = bsLoad()) => Object.values(p.stars || {}).reduce((a, s) => a + (+s || 0), 0);
// first campaign level not cleared yet (1-based); 25 = all done
export function bsNext(p = bsLoad(), n = 24) { for (let i = 1; i <= n; i++) if (!p.stars[i]) return i; return n + 1; }
export const BASTIONE_KEY = KEY;
// coins for a match: more for later levels, stars and harder difficulties; a share on a defeat
export function coinsFor(L, r, prevStars = 0, diff = 'normale') {
  const k = { facile: 0.75, normale: 1, difficile: 1.4 }[diff] || 1;
  const base = 30 + 5 * (typeof L.id === 'number' ? L.id : 12);
  if (!r.win) return Math.round(base * 0.35 * k * Math.min(1, (r.wave || 0) / Math.max(1, r.waves || 1)));
  const fresh = Math.max(0, r.stars - prevStars);
  return Math.round((base * (0.6 + 0.2 * r.stars) + fresh * 25) * k);
}
