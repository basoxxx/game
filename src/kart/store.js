// Kart Baso — persistent progress: wallet, garage, trophies, time-trial records and ghosts, options.
// Light on purpose (no three.js): the Baso Hub entry reads it for the progress line.
import { CHARACTERS, BODIES, WHEELS, PAINTS, CUPS, TRACKS, CLASSES, trackDef } from './data.js';

const KEY = 'sala_kart_v1';
const GHOST = 'sala_kart_ghost_';
const DEF = {
  coins: 0, games: 0, wins: 0, podiums: 0, battles: 0, battleWins: 0, itemsUsed: 0, coinsTotal: 0,
  chars: CHARACTERS.filter((c) => c.free).map((c) => c.id), bodies: ['classico'], wheels: ['standard'], paints: ['auto', 'bianco', 'nero'],
  sel: { char: 'baso', body: 'classico', wheels: 'standard', paint: 'auto' },
  cls: 'normale', cup: 'basilico', track: 'prato', rev: false, arena: 'cortile', rivals: 5, laps: 3,
  trophies: {},   // cupId -> { classId: 1 bronze | 2 silver | 3 gold }
  tt: {},         // trackKey -> { best, lap, medal }
  races: {},      // trackKey -> best place
  mp: { n: 2, mode: 'race', chars: ['baso', 'lella', 'pina', 'tito'], track: 'prato', arena: 'cortile', cls: 'normale', cup: 'basilico' },
  opt: { autoGas: true, ghost: true },
  gp: null,       // Grand Prix in progress
};
const clone = (o) => JSON.parse(JSON.stringify(o));
export function kartLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      const p = { ...clone(DEF), ...d };
      p.sel = { ...DEF.sel, ...(d.sel || {}) }; p.mp = { ...clone(DEF.mp), ...(d.mp || {}) }; p.opt = { ...DEF.opt, ...(d.opt || {}) };
      for (const k of ['chars', 'bodies', 'wheels', 'paints']) if (!Array.isArray(p[k]) || !p[k].length) p[k] = clone(DEF[k]);
      for (const k of ['trophies', 'tt', 'races']) p[k] = { ...(d[k] || {}) };
      if (!p.chars.includes(p.sel.char)) p.sel.char = p.chars[0];
      if (!p.bodies.includes(p.sel.body)) p.sel.body = 'classico';
      if (!p.wheels.includes(p.sel.wheels)) p.sel.wheels = 'standard';
      if (!p.paints.includes(p.sel.paint)) p.sel.paint = 'auto';
      if (!CLASSES.some((c) => c.id === p.cls)) p.cls = 'normale';
      p.coins = Math.max(0, Math.floor(+p.coins || 0));
      return p;
    }
  } catch {}
  return clone(DEF);
}
export function kartSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const KART_KEY = KEY;

export function ghostLoad(key) { try { const g = JSON.parse(localStorage.getItem(GHOST + key) || 'null'); return Array.isArray(g) ? g : null; } catch { return null; } }
export function ghostSave(key, trace) { try { localStorage.setItem(GHOST + key, JSON.stringify(trace)); } catch {} }

// ───────── unlocks
export const cupIndex = (id) => Math.max(0, CUPS.findIndex((c) => c.id === id));
export const trophyOf = (p, cupId) => Math.max(0, ...Object.values(p.trophies[cupId] || {}));
export const cupOpen = (p, i) => i === 0 || trophyOf(p, CUPS[i - 1].id) > 0;
export const homeCup = (trackId) => CUPS.findIndex((c) => c.races.includes(trackId));
export const trackOpen = (p, trackId) => cupOpen(p, Math.max(0, homeCup(String(trackId).split(':')[0])));
export const charOpen = (p, id) => p.chars.includes(id);
export function autoUnlocks(p) {
  // characters tied to a cup join the roster when that cup gets any trophy
  const got = [];
  for (const c of CHARACTERS) if (c.cup != null && !p.chars.includes(c.id) && trophyOf(p, CUPS[c.cup].id) > 0) { p.chars.push(c.id); got.push(c); }
  return got;
}
// time-trial medal targets (s, 3 laps) from the lap length
export function ttTargets(key) {
  const t = TRACKS.find((x) => x.id === String(key).split(':')[0]);
  const len = approxLen(trackDef(key).pts);
  const f = t?.void ? 1.04 : 1;
  return { gold: (len * 3) / 26.6 * f, silver: (len * 3) / 25.2 * f, bronze: (len * 3) / 23.6 * f };
}
function approxLen(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s * 1.08; }
export const PRIZE = [40, 30, 24, 18, 14, 10, 6, 4];
export const clsMult = (cls) => ({ facile: 0.8, normale: 1, esperto: 1.35 }[cls] || 1);
export function kartProgress(p = kartLoad()) {
  const cups = CUPS.filter((c) => trophyOf(p, c.id) > 0).length;
  return { cups, chars: p.chars.length, games: p.games, coins: p.coins };
}
export const PARTS = { bodies: BODIES, wheels: WHEELS, paints: PAINTS };
