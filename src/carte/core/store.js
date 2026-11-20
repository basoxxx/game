// Carte Baso — saved progress: coins, cosmetics, per-game stats and records, lobby choices, the
// match in progress. One localStorage key; reads never throw.
const KEY = 'baso_carte_v1';
const fresh = () => ({ v: 1, coins: 0, back: 'rosso', table: 'verde', style: { it40: 'napoletane' }, owned: { back: ['rosso', 'blu'], table: ['verde', 'blu'] }, stats: {}, lobby: {}, saved: null, total: { played: 0, won: 0 } });
export function cbPeek() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function cbLoad() {
  const p = Object.assign(fresh(), cbPeek() || {});
  p.owned = Object.assign(fresh().owned, p.owned || {}); p.style = Object.assign(fresh().style, p.style || {});
  p.stats ||= {}; p.lobby ||= {}; p.total ||= { played: 0, won: 0 };
  return p;
}
export function cbSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { console.warn('carte: salvataggio non riuscito', e); } }
export function gameStats(p, id) {
  return (p.stats[id] ||= { played: 0, won: 0, lost: 0, drawn: 0, streak: 0, bestStreak: 0, rounds: 0, byLevel: {}, rec: {}, last: null });
}
export const STORE_KEY = KEY;
