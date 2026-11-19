// Serpentone — persistent progress (records, coins, owned looks, choices, daily arena). Tiny on purpose:
// the Baso Hub entry reads it without pulling in three.js or the game.
const KEY = 'baso_serpentone_v1';
const DEF = () => ({
  coins: 0, games: 0, wins: 0, kills: 0, eaten: 0, bestLen: 0, bestSurvive: 0, best: {},
  mode: 'classica', arena: 'giardino', diff: 'normale', touch: 'joy',
  skin: 'lime', pattern: 'strisce', hat: 'nessuno', skin2: 'fragola',
  owned: { skin: ['lime', 'fragola'], pattern: ['tinta', 'strisce'], hat: ['nessuno'] },
  daily: {},
});
export function spLoad() {
  const d = DEF();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      const o = s.owned || {};
      return { ...d, ...s, best: { ...(s.best || {}) }, daily: { ...(s.daily || {}) }, owned: { skin: [...new Set([...d.owned.skin, ...(o.skin || [])])], pattern: [...new Set([...d.owned.pattern, ...(o.pattern || [])])], hat: [...new Set([...d.owned.hat, ...(o.hat || [])])] } };
    }
  } catch {}
  return d;
}
export function spSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
