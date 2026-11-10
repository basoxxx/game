// Accessibility settings applied to the whole document:
//  textScale 90–130 (%) · subScale 80–160 (%) race subtitles · safeColors: colour-blind-safe status colours
import { getSettings } from '../engine/state.js';

export const TEXT_SCALES = [90, 100, 110, 120, 130];
export const SUB_SCALES = [[85, 'Piccoli'], [100, 'Normali'], [125, 'Grandi'], [150, 'Molto grandi']];

export function applyAccessibility(s = getSettings()) {
  const el = document.documentElement;
  const k = Math.max(90, Math.min(130, +s.textScale || 100));
  el.style.setProperty('--ui-zoom', String(k / 100));
  el.classList.toggle('ui-zoomed', k !== 100);
  el.style.setProperty('--sub-scale', String(Math.max(0.8, Math.min(1.6, (+s.subScale || 100) / 100))));
  // status colours follow the 3D colour-blind mode unless set on their own
  const safe = s.safeColors ?? (s.gfxColorblind && s.gfxColorblind !== 'off');
  el.classList.toggle('cb-safe', !!safe);
  if (s.gfxTier) el.dataset.gfx = s.gfxTier;
}
