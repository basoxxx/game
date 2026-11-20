// Tavolo Baso — helpers shared by the game controllers: building the 3D or 2D view (with fallback), the
// coins and stats for a finished game, the results dialog and the pause dialog.
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/dom.js';
import { tvLoad, tvSave, addCoins } from '../store.js';

export async function makeView(shell, kind, factory3d, factory2d) {
  if (shell.use3d) {
    try {
      const { Stage3D } = await import('../view/kit3d.js');
      const stage = new Stage3D(shell.canvas, { tier: shell.tier, theme: shell.theme });
      const v = await factory3d(stage);
      v.view?.(0);
      return v;
    } catch (e) {
      console.warn('[tavolo] 3D non disponibile, uso il 2D', e);
      const c = document.createElement('canvas'); c.className = 'tv-canvas'; shell.canvas.replaceWith(c); shell.canvas = c; shell.use3d = false;
    }
  }
  return factory2d(shell.canvas);
}
const BASE = { chess: [15, 25, 40, 60, 85, 120], dama: [20, 40, 65, 95], four: [12, 25, 45, 70], navale: [15, 30, 50, 75] };
// outcome: 'win' | 'loss' | 'draw' from the point of view of the human (vs CPU), or '2p'
export function award(game, outcome, { level = 0, mode = 'cpu', bonus = 0 } = {}) {
  const d = tvLoad(), st = d.stats[game];
  st.played++;
  let coins = 0, record = false;
  if (mode === 'cpu') {
    if (outcome === 'win') { st.won++; coins = BASE[game][level] || 20; if (level > st.best) { st.best = level; record = true; coins += 25; } }
    else if (outcome === 'draw') { st.drawn++; coins = Math.round((BASE[game][level] || 20) / 3); }
    else { st.lost++; coins = 3; }
  } else coins = 10;
  coins = addCoins(d, coins + bonus);
  tvSave(d);
  return { coins, record, total: d.coins };
}
export function resultCard({ title, sub = '', coins = 0, record = false, extra = '', buttons = [] }) {
  return `<div class="tv-res-k">${sub}</div><h2>${esc(title)}</h2>
    ${coins ? `<div class="tv-res-coins">${icon('coin')} +${coins} monete${record ? ' <em>nuovo traguardo!</em>' : ''}</div>` : ''}
    ${extra}
    <div class="tv-dbtns">${buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : b.ghost ? 'ghost' : ''}" data-tv="${b.id}">${b.ic ? icon(b.ic) : ''} ${esc(b.label)}</button>`).join('')}</div>`;
}
export function pauseCard({ title = 'Pausa', lines = [], buttons = [] }) {
  return `<h2>${esc(title)}</h2>${lines.map((l) => `<p class="tv-note">${l}</p>`).join('')}<div class="tv-dbtns col">${buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : b.ghost ? 'ghost' : ''}" data-tv="${b.id}">${b.ic ? icon(b.ic) : ''} ${esc(b.label)}</button>`).join('')}</div>`;
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
