// Orda · Razzie — procedural rival bases. A rival is fully described by (seed, difficulty): name,
// leader, colour, layout and the loot in its storage are all generated from them, so a rival list
// stores only a handful of numbers and the same rival always looks the same.
import { GRID, BUILDINGS, limitOf, maxLevelAt } from './data.js';
import { rng, hash, fits, power, baseValue } from './logic.js';

const PLACES = ['Rocca', 'Fortino', 'Bastione', 'Cittadella', 'Torrione', 'Accampamento', 'Castelletto', 'Ridotta', 'Trincea', 'Fortezza', 'Baluardo', 'Presidio'];
const OF = ['dei Bulloni', 'di Pastafrolla', 'del Gomitolo', 'dei Calzini Spaiati', 'del Vento Storto', 'di Mattoncino', 'delle Ciabatte', 'del Lunedì', 'dei Coriandoli', 'del Sugo', 'della Grattugia', 'dei Bottoni', 'del Fischietto', 'delle Ortiche', 'del Tamburello', 'dei Pigiami', 'della Nebbiolina', 'del Merluzzo'];
const LEADERS = ['Capitan Ruggine', 'Generale Brontolo', 'Baronessa Pepe', 'Duca Scodella', 'Madama Trottola', 'Sergente Bigodino', 'Conte Mestolo', 'Zia Catapulta', 'Ammiraglio Muffin', 'Lady Grandine', 'Mastro Ciottolo', 'Marchesa Ventola', 'Caporale Gnocco', 'Signor Bullone', 'Regina Puntina'];
const COLORS = ['#ef4444', '#f97316', '#e11d48', '#dc2626', '#be123c', '#ea580c', '#b91c1c', '#f43f5e'];
const STYLES = ['anello', 'linee', 'labirinto', 'sparso'];
export const STYLE_NAMES = { anello: 'Anello di mura', linee: 'Doppia linea', labirinto: 'Labirinto', sparso: 'Avamposti sparsi' };

export const DIFF_LABEL = (d) => (d <= 2 ? 'Facile' : d <= 4.5 ? 'Media' : d <= 8 ? 'Difficile' : 'Leggendaria');

// diff: 1..10 (fractional ok)
export function genRival(seed, diff, opts = {}) {
  const R = rng(hash('rival', seed, Math.round(diff * 10)));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const style = opts.style || pick(STYLES);
  const hqL = Math.max(1, Math.min(6, Math.round(1 + (diff - 1) * 0.55)));
  const b = [];
  let nid = 0;
  const L = { b, nid: 0 };
  const put = (t, x, y, l) => {
    if (!fits(L, t, x, y)) return false;
    if (b.filter((q) => q.t === t).length >= limitOf(t, hqL)) return false;
    b.push({ id: ++nid, t, x, y, l: Math.max(1, Math.min(l, maxLevelAt(t, hqL))) }); L.nid = nid;
    return true;
  };
  // building level for this difficulty, with some spread
  const lvl = (t) => Math.max(1, Math.round(maxLevelAt(t, hqL) * (0.45 + diff * 0.045 + R() * 0.25)));
  // HQ in the back half
  const hx = 1 + Math.floor(R() * (GRID - 3)), hy = GRID - 2 - Math.floor(R() * 2);
  put('hq', hx, hy, hqL);
  // production in the back corners (this is what you steal)
  put('fornace', R() < 0.5 ? 0 : GRID - 1, GRID - 1, lvl('fornace'));
  put('miniera', R() < 0.5 ? 0 : GRID - 1, GRID - 2, lvl('miniera'));
  if (diff > 4) put('fornace', Math.floor(R() * GRID), GRID - 1, lvl('fornace'));
  // walls
  const wallBudget = Math.round(limitOf('muro', hqL) * Math.min(1, 0.45 + diff * 0.06));
  let walls = 0;
  const wall = (x, y) => { if (walls < wallBudget && put('muro', x, y, lvl('muro'))) walls++; };
  if (style === 'anello') {
    const r = 2;
    for (let x = hx - r + 1; x <= hx + r; x++) { wall(x, hy - r + 1); }
    for (let y = hy - r + 2; y <= Math.min(GRID - 1, hy + 1); y++) { wall(hx - r + 1, y); wall(hx + r, y); }
  } else if (style === 'linee') {
    const y1 = 3 + Math.floor(R() * 2), gap = Math.floor(R() * GRID);
    for (let x = 0; x < GRID; x++) if (Math.abs(x - gap) > 0) wall(x, y1);
    const gap2 = (gap + 3 + Math.floor(R() * 3)) % GRID;
    for (let x = 0; x < GRID; x++) if (Math.abs(x - gap2) > 0) wall(x, y1 + 2);
  } else if (style === 'labirinto') {
    for (let y = 2; y < GRID - 3; y += 2) { const gap = Math.floor(R() * GRID); for (let x = 0; x < GRID; x++) if (x !== gap && R() < 0.8) wall(x, y); }
  } else {
    for (let i = 0; i < 40 && walls < wallBudget; i++) { const x = Math.floor(R() * GRID), y = 2 + Math.floor(R() * (GRID - 4)); wall(x, y); if (R() < 0.6) wall(x + 1, y); }
  }
  // defences behind the walls, nearer to the HQ the stronger the base
  const defs = [];
  if (diff >= 1.5) defs.push('caserma');
  if (diff >= 2.5) defs.push('porta');
  if (diff >= 3) defs.push('gelo');
  if (diff >= 4) defs.push('mortaio');
  if (diff >= 5) defs.push('cecchino', 'caserma');
  if (diff >= 6) defs.push('porta', 'gelo');
  if (diff >= 7) defs.push('scudo', 'mortaio');
  if (diff >= 8.5) defs.push('cecchino', 'porta', 'caserma');
  for (const t of defs) {
    for (let tries = 0; tries < 30; tries++) {
      const front = t === 'porta';
      const x = Math.floor(R() * GRID);
      const y = front ? 1 + Math.floor(R() * 3) : Math.max(2, Math.min(GRID - 1, hy - 3 + Math.floor(R() * 4)));
      if (put(t, x, y, lvl(t))) break;
    }
  }
  const layout = { b, nid };
  const rr = rng(hash('loot', seed));
  const loot = { coins: Math.round((12 + diff * 8) * (0.85 + rr() * 0.3)), bricks: Math.round((70 + diff * 55) * (0.85 + rr() * 0.3)) };
  return {
    seed, diff: +diff.toFixed(1), style,
    name: `${pick(PLACES)} ${pick(OF)}`, leader: pick(LEADERS), color: pick(COLORS),
    layout, loot, power: power(layout), value: baseValue(layout), hq: hqL,
  };
}

// Difficulty that matches the player: campaign progress + own HQ, three bands (easy / fair / hard)
export const DIFF_MAX = 12;
export function playerDiff(prog, hq) { return Math.max(1, Math.min(DIFF_MAX - 2, 0.6 + (prog?.lvl || 0) * 0.22 + (hq - 1) * 0.6)); }
export function rivalList(state, prog, hq, n = 4) {
  const base = playerDiff(prog, hq), R = rng(hash('list', state.seed, state.raids.listN));
  const bands = [-1.2, -0.3, 0.7, 1.8, 2.8].slice(0, n);
  return bands.map((d, i) => ({ seed: (hash('rv', state.seed, state.raids.listN, i) % 1e9) + 1, diff: +Math.max(1, Math.min(DIFF_MAX, base + d + (R() - 0.5) * 0.5)).toFixed(1) }));
}
