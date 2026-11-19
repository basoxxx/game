// Orda — persistent progress (level reached, stars, coins, upgrades, champions, skins, settings).
// Tiny on purpose: the Baso Hub launcher reads it without pulling in three.js or the game.
// Other modules (base building, daily/endless, versus) may keep their own keys or add fields under
// `ext` ({ [moduleId]: {...} }): ordaLoad() keeps unknown fields untouched.
const KEY = 'sala_orda_v1';
const UPS = { rate: 0, shot: 0, hp: 0, speed: 0, charge: 0, armor: 0 };
const DEF = {
  next: 1,            // first level not yet cleared (1-based)
  stars: {},          // levelId -> best stars (0-3)
  best: {},           // levelId -> best time (s)
  coins: 0, games: 0, wins: 0, sent: 0, kills: 0,
  up: UPS,            // upgrade levels
  champs: ['colosso'], champ: 'colosso', clv: { colosso: 0 }, // owned champions, the one in the cannon, their levels
  skins: ['azzurro'], skin: 'azzurro', cannons: ['classico'], cannon: 'classico',
  opt: { autofire: false, shake: true, numbers: true },
  ext: {},
};
const clone = (o) => JSON.parse(JSON.stringify(o));
export function ordaLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      const p = { ...clone(DEF), ...d };
      p.up = { ...UPS, ...(d.up || {}) }; p.opt = { ...DEF.opt, ...(d.opt || {}) };
      p.stars = { ...(d.stars || {}) }; p.best = { ...(d.best || {}) }; p.clv = { ...(d.clv || {}) }; p.ext = { ...(d.ext || {}) };
      for (const k of ['champs', 'skins', 'cannons']) if (!Array.isArray(p[k]) || !p[k].length) p[k] = clone(DEF[k]);
      if (!p.champs.includes(p.champ)) p.champ = p.champs[0];
      if (!p.skins.includes(p.skin)) p.skin = p.skins[0];
      if (!p.cannons.includes(p.cannon)) p.cannon = p.cannons[0];
      p.next = Math.max(1, p.next | 0);
      return p;
    }
  } catch {}
  return clone(DEF);
}
export function ordaSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const ordaStars = (p = ordaLoad()) => Object.values(p.stars || {}).reduce((a, s) => a + (+s || 0), 0);
export const ORDA_KEY = KEY;
