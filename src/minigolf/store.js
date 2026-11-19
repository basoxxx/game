// Minigolf Baso — saved progress. Tiny on purpose: the Baso Hub reads it without loading the game.
const KEY = 'sala_minigolf_v1';
const DEF = () => ({
  coins: 0, best: {}, courses: {}, ball: 'bianca', hat: 'nessuno', trail: 'nessuna',
  owned: { ball: ['bianca'], hat: ['nessuno'], trail: ['nessuna'] }, daily: {}, streak: 0, lastDaily: '',
  custom: [], players: ['Giocatore 1', 'Giocatore 2', 'Giocatore 3', 'Giocatore 4'], np: 2,
  stats: { holes: 0, aces: 0, shots: 0, rounds: 0 }, course: 'giardino', next: {},
});
export function mgLoad() {
  const d = DEF();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      const o = { ...d, ...s, best: { ...(s.best || {}) }, courses: { ...(s.courses || {}) }, daily: { ...(s.daily || {}) }, stats: { ...d.stats, ...(s.stats || {}) }, next: { ...(s.next || {}) } };
      o.owned = { ball: [...new Set(['bianca', ...(s.owned?.ball || [])])], hat: [...new Set(['nessuno', ...(s.owned?.hat || [])])], trail: [...new Set(['nessuna', ...(s.owned?.trail || [])])] };
      o.custom = Array.isArray(s.custom) ? s.custom.filter((c) => c && typeof c.code === 'string') : [];
      o.players = Array.isArray(s.players) && s.players.length === 4 ? s.players.map((x) => String(x || '').slice(0, 14)) : d.players;
      o.coins = Math.max(0, Math.floor(+o.coins || 0));
      return o;
    }
  } catch {}
  return d;
}
export function mgSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
// stars for a hole: 3 at least one under par, 2 at par, 1 when holed
export const holeStars = (strokes, par) => (!strokes ? 0 : strokes <= par - 1 ? 3 : strokes <= par ? 2 : 1);
export function totalStars(p = mgLoad(), holes) { return holes.reduce((a, h) => a + holeStars(p.best[h.id], h.par), 0); }
