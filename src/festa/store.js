// Festa Baso — saved progress: coins (earned by playing, no ads), unlocked characters and hats, the four
// seats (character, hat, device), options and personal stats. Tiny and synchronous; safe without storage.
import { DEFAULT_CHARS } from './roster.js';

const KEY = 'baso_festa_v1';
const fresh = () => ({
  v: 1, coins: 0, owned: { chars: ['baso', 'lella', 'pina', 'tito'], hats: ['nessuno', 'festa'] },
  seats: DEFAULT_CHARS.map((c, i) => ({ char: c, hat: i === 0 ? 'festa' : 'nessuno', dev: null })),
  opts: { n: 2, rounds: 8, target: 3, diff: 1, flat: false, minis: null },
  stats: { boards: 0, kings: 0, tourneys: 0, champs: 0, minis: 0, miniWins: 0, coinsEarned: 0, stars: 0, best: {}, perMini: {} },
});
export function feLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || d.v !== 1) return fresh();
    const f = fresh();
    return { ...f, ...d, owned: { ...f.owned, ...d.owned }, opts: { ...f.opts, ...d.opts }, stats: { ...f.stats, ...d.stats }, seats: f.seats.map((s, i) => ({ ...s, ...(d.seats?.[i] || {}) })) };
  } catch { return fresh(); }
}
export function feSave(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
export function fePeek() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
// per-minigame record for the human seats: played / won / best place
export function noteMini(d, id, place, human = true) {
  if (!human) return;
  const s = (d.stats.perMini[id] ||= { played: 0, won: 0 });
  s.played++; if (place === 1) s.won++;
  d.stats.minis++; if (place === 1) d.stats.miniWins++;
}
// a board party in progress, saved between turns (one slot): { v, cfg, B, seed, miniCount, earned, at }
const BKEY = 'baso_festa_board_v1';
export function feSaveBoard(o) { try { localStorage.setItem(BKEY, JSON.stringify({ v: 1, ...o, at: Date.now() })); } catch {} }
export function feLoadBoard() { try { const o = JSON.parse(localStorage.getItem(BKEY) || 'null'); return o && o.v === 1 && o.B && o.cfg ? o : null; } catch { return null; } }
export function feClearBoard() { try { localStorage.removeItem(BKEY); } catch {} }
