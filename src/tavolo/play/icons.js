// Tavolo Baso — small inline SVG pieces for the HUD (captured material, promotion choice, menus).
import { SIL } from '../view/board2d.js';

export function pieceIcon(t, c, set, cls = '') {
  const col = c ? set.b.c : set.w.c, edge = c ? '#cfc6b8' : '#3a2a1c';
  return `<svg class="tv-pi ${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${SIL[t]}" fill="${col}" stroke="${edge}" stroke-width="4" stroke-linejoin="round" fill-rule="evenodd"/></svg>`;
}
export function damaIcon(king, c, set, cls = '') {
  const col = c ? set.b.c : set.w.c, edge = c ? '#cfc6b8' : '#3a2a1c';
  const disc = (y) => `<ellipse cx="50" cy="${y + 8}" rx="38" ry="14" fill="${edge}"/><ellipse cx="50" cy="${y}" rx="38" ry="14" fill="${col}" stroke="${edge}" stroke-width="3"/><ellipse cx="50" cy="${y}" rx="24" ry="8" fill="none" stroke="${edge}" stroke-width="2" opacity=".6"/>`;
  return `<svg class="tv-pi ${cls}" viewBox="0 0 100 100" aria-hidden="true">${disc(62)}${king ? disc(44) : ''}</svg>`;
}
