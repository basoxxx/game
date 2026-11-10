// Shared bits for the game-mode screens
import '../../styles/modes.css';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/dom.js';
import { MEDAL, objLabel, objShort } from '../../engine/modes/objectives.js';

export function stars(n, max = 3) {
  return `<span class="md-stars" aria-label="${n} stelle su ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
}
export function medalTag(m) {
  if (m == null || m < 0) return '';
  return `<span class="tag" style="background:${MEDAL[m].col}">${icon('medal')} ${MEDAL[m].name}</span>`;
}
export function tierList(tiers, cat, met = null) {
  return `<div class="md-tiers">${tiers.map((o, i) => `<div class="md-tier ${met ? (met[i] ? 'ok' : 'ko') : ''}" style="--mc:${MEDAL[i].col}">
    <span class="md-tier-m">${MEDAL[i].name}</span><span class="md-tier-t">${esc(objLabel(o, cat))}</span>${met ? `<span class="md-tier-s">${met[i] ? icon('check') : icon('x')}</span>` : `<span class="md-tier-s mono">${esc(objShort(o))}</span>`}</div>`).join('')}</div>`;
}
// collapsible "how it works" explainer shown at the top of every mode
export function explainer(title, points, open = true) {
  return `<details class="md-explain" ${open ? 'open' : ''}><summary>${icon('info')} ${esc(title)}</summary><ol>${points.map((p) => `<li>${p}</li>`).join('')}</ol></details>`;
}
export function medalSVG(col) {
  return `<svg class="medal-big" viewBox="0 0 120 120" aria-hidden="true"><path d="M38 6h18l10 30H48z" fill="#c8102e"/><path d="M82 6H64L54 36h18z" fill="#1d3f8f"/><circle cx="60" cy="74" r="38" fill="${col}"/><circle cx="60" cy="74" r="29" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="3"/><path d="M60 54l6 13 14 1.5-10.5 9.5 3 14L60 85l-12.5 7 3-14L40 68.5 54 67z" fill="rgba(0,0,0,.28)"/></svg>`;
}
export const WX_LABEL = { auto: 'Meteo realistico', dry: 'Asciutto', mixed: 'Variabile', rain: 'Pioggia' };
