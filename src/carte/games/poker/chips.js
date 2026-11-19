// Fictional chip stacks drawn in HTML/CSS (styles in style.js). Used by Texas Hold'em and Blackjack
// through the VIEW: a pile with no cards whose `label` is this HTML, so the table renderer positions and
// slides it like any pile (bets in front of the seats, the pot, payouts). Play money only.
import { useStyle, CHIPS_CSS } from './style.js';
export const useChipStyle = () => useStyle('carte-chips-css', CHIPS_CSS);

export const DENOMS = [
  { v: 5000, c: 'cv-k5' }, { v: 1000, c: 'cv-k1' }, { v: 500, c: 'cv-h5' }, { v: 100, c: 'cv-h1' },
  { v: 50, c: 'cv-f5' }, { v: 25, c: 'cv-q' }, { v: 10, c: 'cv-d' }, { v: 5, c: 'cv-r' }, { v: 1, c: 'cv-w' },
];
export const fmtChips = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// break an amount into denominations, biggest first: [{ v, c, k }]
export function breakdown(amount) {
  const out = []; let a = Math.max(0, Math.round(amount || 0));
  for (const d of DENOMS) { const k = Math.floor(a / d.v); if (k) { out.push({ ...d, k }); a -= k * d.v; } }
  return out;
}
// HTML of a chip stack: up to `cols` columns, each at most 8 chips tall, plus the amount
export function chipStack(amount, { cols = 3, text = true, cls = '', note = '' } = {}) {
  if (!amount) return note ? `<span class="chp ${cls}"><small class="chp-n">${note}</small></span>` : '';
  const parts = breakdown(amount);
  let groups = parts.slice(0, cols);
  // fold the smaller denominations into the last column so the stack stays readable
  if (parts.length > cols) groups[cols - 1] = { ...groups[cols - 1], k: groups[cols - 1].k + parts.slice(cols).reduce((a, p) => a + Math.min(3, p.k), 0) };
  const html = groups.map((g, i) => {
    const k = Math.min(8, g.k);
    return `<i class="chp-col" style="--h:${k}">${Array.from({ length: k }, (_, j) => `<i class="chp-c ${g.c}" style="--j:${j};--d:${(i * 3 + j) * 18}ms"></i>`).join('')}</i>`;
  }).join('');
  return `<span class="chp ${cls}"><span class="chp-s">${html}</span>${text ? `<b class="chp-a">${fmtChips(amount)}</b>` : ''}${note ? `<small class="chp-n">${note}</small>` : ''}</span>`;
}
// a single chip face, for buttons
export const chipFace = (v) => { const d = DENOMS.find((x) => x.v === v) || DENOMS[DENOMS.length - 1]; return `<i class="chp-face ${d.c}"><b>${v >= 1000 ? `${v / 1000}k` : v}</b></i>`; };
