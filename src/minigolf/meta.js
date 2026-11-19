// Minigolf Baso — cosmetics (balls, hats, trails bought with coins: no ads, no real money), rewards,
// score names and the daily hole. No three.js here: the menus use it.
import { ALL_HOLES, COURSES } from './courses.js';

export const BALLS = [
  { id: 'bianca', name: 'Classica', cost: 0, css: '#f4f4f0' },
  { id: 'arancio', name: 'Arancio', cost: 40, css: '#ff8a1f' },
  { id: 'menta', name: 'Menta', cost: 40, css: '#4fe0b0' },
  { id: 'anguria', name: 'Anguria', cost: 120, css: 'repeating-linear-gradient(90deg,#2f9e44 0 6px,#8ce99a 6px 10px)' },
  { id: 'calcio', name: 'Pallone', cost: 150, css: 'radial-gradient(circle at 50% 50%,#111 0 4px,#fff 5px)' },
  { id: 'pianeta', name: 'Pianeta', cost: 200, css: 'repeating-linear-gradient(0deg,#d9a066 0 4px,#b5651d 4px 7px,#f2d0a4 7px 10px)' },
  { id: 'arcobaleno', name: 'Arcobaleno', cost: 260, css: 'linear-gradient(90deg,#ff4d4d,#ffb84d,#fff04d,#4dff88,#4db8ff,#b84dff)' },
  { id: 'disco', name: 'Discoteca', cost: 320, css: 'conic-gradient(#ccc,#fff,#9ad,#fff,#ccc,#fff,#d9a,#fff,#ccc)' },
  { id: 'oro', name: 'Oro', cost: 500, css: 'radial-gradient(circle at 35% 30%,#fff6c2,#f5c542 45%,#a87a12)' },
];
export const HATS = [
  { id: 'nessuno', name: 'Nessuno', cost: 0, emoji: '—' },
  { id: 'cappellino', name: 'Cappellino', cost: 60, emoji: '🧢' },
  { id: 'party', name: 'Festa', cost: 90, emoji: '🎉' },
  { id: 'cilindro', name: 'Cilindro', cost: 140, emoji: '🎩' },
  { id: 'elica', name: 'Elica', cost: 180, emoji: '🌀' },
  { id: 'vichingo', name: 'Vichingo', cost: 220, emoji: '⚔️' },
  { id: 'corona', name: 'Corona', cost: 400, emoji: '👑' },
  { id: 'aureola', name: 'Aureola', cost: 450, emoji: '😇' },
];
export const TRAILS = [
  { id: 'nessuna', name: 'Nessuna', cost: 0, css: 'transparent' },
  { id: 'bianca', name: 'Nuvola', cost: 50, css: '#ffffff' },
  { id: 'neon', name: 'Neon', cost: 110, css: '#3fffd2' },
  { id: 'fuoco', name: 'Fuoco', cost: 170, css: 'linear-gradient(90deg,#ff3b1f,#ffc928)' },
  { id: 'bolle', name: 'Bolle', cost: 200, css: '#8fd8ff' },
  { id: 'stelle', name: 'Stelle', cost: 260, css: '#ffe27a' },
  { id: 'arcobaleno', name: 'Arcobaleno', cost: 340, css: 'linear-gradient(90deg,#ff4d4d,#ffb84d,#fff04d,#4dff88,#4db8ff,#b84dff)' },
];
export const SHOP = { ball: BALLS, hat: HATS, trail: TRAILS };
export const PLAYER_COLORS = ['#ffffff', '#ff5a5f', '#3fa7ff', '#ffd23f'];
export const PLAYER_BALLS = ['bianca', 'rossa', 'blu', 'gialla'];

export function scoreName(strokes, par) {
  if (strokes === 1) return 'Buca in uno!';
  const d = strokes - par;
  return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Doppio bogey' : `+${d}`;
}
export function holeCoins(strokes, par) {
  if (strokes === 1) return 25;
  const d = strokes - par;
  return d <= -1 ? 12 : d === 0 ? 6 : d === 1 ? 3 : 1;
}
export const COURSE_BONUS = 30, DAILY_BONUS = 40, MAX_STROKES = 10;

// the daily hole: a built-in hole picked by the date, mirrored on some days (only holes whose pieces
// are symmetric — checked solvable both ways by tools/minigolf-check.mjs)
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const canMirror = (h) => !/[OTUtu]/.test(h.rows.join(''));
export function mirrorHole(h) {
  const sw = { '<': '>', '>': '<', 6: '4', 4: '6' };
  return { ...h, rows: h.rows.map((r) => [...r.padEnd(Math.max(...h.rows.map((x) => x.length)), '.')].reverse().map((c) => sw[c] || c).join('')), h: h.h ? h.h.map((r) => [...r].reverse().join('')) : undefined, mirror: true };
}
export function dailyHole(key = dayKey()) {
  const x = hash('minigolf:' + key);
  const base = ALL_HOLES[x % ALL_HOLES.length];
  const mir = canMirror(base) && (x >>> 8) % 2 === 1;
  const h = mir ? mirrorHole(base) : { ...base };
  return { ...h, id: 'daily-' + key, daily: key, baseId: base.id, name: `${base.name}${mir ? ' (specchiata)' : ''}` };
}
export const courseUnlocked = (p, i) => i === 0 || !!p.courses[COURSES[i - 1].id]?.done;
