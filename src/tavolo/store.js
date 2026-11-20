// Tavolo Baso — saved progress: coins (earned by playing, no ads), owned cosmetic sets, options per game,
// stats, the daily puzzles and games in progress. Tiny and synchronous; safe without storage.
const KEY = 'baso_tavolo_v1';
export const GAMES = ['chess', 'dama', 'four', 'navale'];
const stat = () => ({ played: 0, won: 0, lost: 0, drawn: 0, best: -1 });
const fresh = () => ({
  v: 1, coins: 0,
  owned: { boards: ['noce'], pieces: ['bosso'] }, board: 'noce', pieces: 'bosso',
  opts: {
    view: '3d', flat: false, sound: true,
    chess: { mode: 'cpu', level: 2, color: 'w', clock: 0, hints: true, rotate: true, coords: true },
    dama: { mode: 'cpu', level: 1, color: 'w', rotate: true },
    four: { mode: 'cpu', level: 1, first: 1 },
    navale: { mode: 'cpu', level: 2, noTouch: true, again: false },
  },
  stats: { chess: stat(), dama: stat(), four: stat(), navale: { ...stat(), bestShots: 0 }, puzzles: 0, streak: 0, lastDay: '' },
  daily: { key: '', chess: null, four: null, navale: null },
  saved: {},
});
export function tvLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || d.v !== 1) return fresh();
    const f = fresh();
    const opts = { ...f.opts, ...d.opts }; for (const g of GAMES) opts[g] = { ...f.opts[g], ...(d.opts?.[g] || {}) };
    const stats = { ...f.stats, ...d.stats }; for (const g of GAMES) stats[g] = { ...f.stats[g], ...(d.stats?.[g] || {}) };
    return { ...f, ...d, owned: { ...f.owned, ...d.owned }, opts, stats, daily: { ...f.daily, ...d.daily }, saved: { ...(d.saved || {}) } };
  } catch { return fresh(); }
}
export function tvSave(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
export function tvPeek() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function dayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function dayNumber(d = new Date()) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
// the daily block resets itself at midnight
export function daily(d) { const k = dayKey(); if (d.daily.key !== k) d.daily = { key: k, chess: null, four: null, navale: null }; return d.daily; }
export function addCoins(d, n) { n = Math.max(0, Math.round(n)); d.coins += n; return n; }
// a puzzle of the day solved: streak of consecutive days
export function notePuzzleDay(d) {
  const k = dayKey(); if (d.stats.lastDay === k) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  d.stats.streak = d.stats.lastDay === dayKey(y) ? d.stats.streak + 1 : 1; d.stats.lastDay = k;
}
