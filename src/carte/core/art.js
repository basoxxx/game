// Carte Baso — procedural card art (original SVG drawings, no scans): Napoletane and Piacentine
// Italian faces, French faces with jokers, card backs and table felts. Every face is an SVG string,
// turned into a cached data: URL (an <img> is rasterised once and composites cheaply on phones).
import { rank, suit, base, deckOf } from './cards.js';

const INK = '#2a1f1a', GOLD = '#e8b52c', GOLD2 = '#9a6a08', RED = '#b8262c', BLUE = '#2a5aa8', GREEN = '#3c8a3a', WOOD = '#8a5428', SKIN = '#f3c9a0', CREAM = '#fbf6ea';
const f1 = (n) => +n.toFixed(1);

// ------------------------------------------------------------------ Italian suit symbols (unit ~ 30 px tall, centred)
function denaro(sc = 1, st = 'n') {
  const petals = Array.from({ length: 8 }, (_, i) => `<ellipse cx="0" cy="-7.2" rx="2.1" ry="3.6" transform="rotate(${i * 45})" fill="${st === 'p' ? '#c0392b' : RED}"/>`).join('');
  return `<g transform="scale(${sc})"><circle r="14" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1.6"/><circle r="11.2" fill="none" stroke="${GOLD2}" stroke-width=".8" stroke-dasharray="1.6 1.4"/>${petals}<circle r="3.4" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1"/><circle r="1.3" fill="${st === 'p' ? BLUE : GREEN}"/></g>`;
}
function coppa(sc = 1, st = 'n') {
  const a = st === 'p' ? '#d8442e' : RED;
  return `<g transform="scale(${sc})"><path d="M-12 -13 h24 q0 12 -8 16 q-2.4 1.2 -2.4 3.4 v4 q0 1.6 3.4 3 l4 3 h-22 l4 -3 q3.4 -1.4 3.4 -3 v-4 q0 -2.2 -2.4 -3.4 q-8 -4 -8 -16z" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M-12 -13 h24 q-.4 3 -1.2 5 h-21.6 q-.8 -2 -1.2 -5z" fill="${a}"/><rect x="-3.6" y="5.4" width="7.2" height="2.6" rx="1.2" fill="${BLUE}"/><ellipse cx="0" cy="-13" rx="12" ry="2.4" fill="#fff3c4" stroke="${GOLD2}" stroke-width="1"/></g>`;
}
function spada(sc = 1, st = 'n') {
  // napoletane: curved scimitar blade; piacentine: straight blade
  const blade = st === 'p'
    ? '<path d="M-2.6 -6 L-2.6 -30 L0 -35 L2.6 -30 L2.6 -6 z" fill="#cfd8e6" stroke="#5a6a85" stroke-width="1"/><path d="M0 -8 V-32" stroke="#8a9ab5" stroke-width=".8"/>'
    : '<path d="M-2.4 -6 Q-6 -20 -1 -35 Q4 -26 3 -6 z" fill="#6f9be0" stroke="#22427a" stroke-width="1"/><path d="M0.4 -8 Q-1.8 -20 -0.6 -31" stroke="#c5dcff" stroke-width=".9" fill="none"/>';
  return `<g transform="scale(${sc})">${blade}<rect x="-9.5" y="-7" width="19" height="3.6" rx="1.8" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1"/>
    <rect x="-2.2" y="-3.6" width="4.4" height="12" rx="1.6" fill="${st === 'p' ? WOOD : RED}" stroke="${INK}" stroke-width=".7"/><circle cy="10.6" r="3" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1"/></g>`;
}
function bastone(sc = 1, st = 'n') {
  const g = st === 'p' ? '#7a4a1e' : GREEN, g2 = st === 'p' ? '#4f2e10' : '#245a22';
  return `<g transform="scale(${sc})"><path d="M-3 16 Q-5 0 -3.6 -14 Q-3 -22 0 -24 Q4 -22 4.4 -14 Q5 0 3 16 q0 2 -3 2 q-3 0 -3 -2z" fill="${g}" stroke="${g2}" stroke-width="1.2"/>
    ${[[-4.4, -8], [4.8, -1], [-4.6, 6], [4.2, 11]].map(([x, y]) => `<path d="M${x} ${y} q${x > 0 ? 4 : -4} -1 ${x > 0 ? 4.4 : -4.4} -4.2" stroke="${g2}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`).join('')}
    <path d="M-1 -18 Q0 -4 -.6 12" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.2" fill="none"/><rect x="-4.4" y="15" width="8.8" height="3.4" rx="1.4" fill="${GOLD}"/></g>`;
}
const IT_SYM = { d: denaro, c: coppa, s: spada, b: bastone };
const itSym = (s, x, y, sc = 1, rot = 0, st = 'n') => `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${rot})">${IT_SYM[s](sc, st)}</g>`;

// pip layouts for 1..7 in a 116 x 200 card
const IT_PIPS = {
  1: [[58, 100]],
  2: [[58, 62], [58, 138]],
  3: [[58, 50], [58, 100], [58, 150]],
  4: [[36, 64], [80, 64], [36, 136], [80, 136]],
  5: [[36, 58], [80, 58], [58, 100], [36, 142], [80, 142]],
  6: [[36, 50], [80, 50], [36, 100], [80, 100], [36, 150], [80, 150]],
  7: [[36, 48], [80, 48], [58, 74], [36, 104], [80, 104], [36, 152], [80, 152]],
};
// robe colours of the court figures
const ROBE = { d: ['#c8372d', '#f2c12e'], c: ['#2f62b5', '#d93a2b'], s: ['#3a4f9e', '#9fb9e8'], b: ['#3c8a3a', '#e3a63a'] };

function figure(s, kind, st) {
  // a stylised standing court figure, ~ 70 x 120, origin at the feet centre
  const [r1, r2] = ROBE[s];
  const crown = kind === 10
    ? `<path d="M-11 -98 l3 -10 4 6 4 -9 4 9 4 -6 3 10z" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1"/><circle cx="0" cy="-104" r="1.6" fill="${RED}"/>`
    : `<path d="M-12 -97 q12 -16 24 0 q-4 -3 -12 -3 q-8 0 -12 3z" fill="${r2}" stroke="${INK}" stroke-width=".8"/><path d="M9 -101 q8 -6 12 2" stroke="${RED}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const beard = kind === 10 ? '<path d="M-7 -82 q7 12 14 0 q-2 6 -7 7 q-5 -1 -7 -7z" fill="#e7e2d6" stroke="#9a9488" stroke-width=".6"/>' : '';
  const robe = `<path d="M-17 -72 q17 -8 34 0 l8 66 q-25 9 -50 0z" fill="${r1}" stroke="${INK}" stroke-width="1"/>
    <path d="M-5 -74 l5 70 l5 -70" fill="${r2}" opacity=".85"/><path d="M-25 -6 q25 9 50 0 l-1 6 h-48z" fill="${r2}" stroke="${INK}" stroke-width=".8"/>
    <path d="M-17 -72 q-8 10 -9 30 q4 3 8 0 q1 -14 5 -22z" fill="${r1}" stroke="${INK}" stroke-width=".8"/><circle cx="-22" cy="-40" r="3.6" fill="${SKIN}" stroke="${INK}" stroke-width=".6"/>`;
  const head = `<circle cx="0" cy="-86" r="10.5" fill="${SKIN}" stroke="${INK}" stroke-width="1"/><circle cx="-3.6" cy="-87" r="1.2" fill="${INK}"/><circle cx="3.6" cy="-87" r="1.2" fill="${INK}"/><path d="M-3 -81.5 q3 2 6 0" stroke="${INK}" stroke-width=".9" fill="none"/>${beard}${crown}`;
  // the suit object held up in the right hand
  const held = `<path d="M17 -72 q8 6 10 20" stroke="${r1}" stroke-width="7" stroke-linecap="round" fill="none"/><circle cx="26" cy="-52" r="3.6" fill="${SKIN}" stroke="${INK}" stroke-width=".6"/>${itSym(s, 30, s === 's' || s === 'b' ? -70 : -64, s === 's' || s === 'b' ? 0.9 : 0.75, s === 's' ? 10 : 0, st)}`;
  return `${robe}${head}${held}`;
}
function horse(s, st) {
  // the Cavallo: a knight on a horse, origin at the hooves' centre
  const [r1, r2] = ROBE[s], coat = st === 'p' ? '#f2eee4' : '#e9dcc4', mane = st === 'p' ? '#6b4a2b' : '#8a5a2b';
  return `<path d="M-30 -30 q-4 -26 20 -30 h22 q14 0 18 -10 l8 -16 q4 -6 10 -2 l2 8 q4 2 2 8 l-8 8 q-4 22 -14 30 q-12 8 -30 8 q-22 0 -28 -4z" fill="${coat}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M34 -84 q-8 2 -12 14 l-6 14" stroke="${mane}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="37" cy="-76" r="1.4" fill="${INK}"/>
    ${[[-24, 0], [-12, 2], [8, 2], [20, 0]].map(([x, y], i) => `<path d="M${x} -30 l${i % 2 ? 2 : -2} ${30 + y}" stroke="${coat}" stroke-width="5.6" stroke-linecap="round"/><path d="M${x + (i % 2 ? 2 : -2)} ${y - 1} h4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`).join('')}
    <path d="M-30 -36 q-14 4 -16 20" stroke="${mane}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M-14 -60 q14 -4 26 0 l2 18 q-15 5 -30 0z" fill="${r2}" stroke="${INK}" stroke-width=".8"/>
    <path d="M-8 -60 q8 -30 16 0z" fill="${r1}" stroke="${INK}" stroke-width="1"/><circle cx="0" cy="-94" r="8.5" fill="${SKIN}" stroke="${INK}" stroke-width="1"/>
    <circle cx="-2.6" cy="-95" r="1" fill="${INK}"/><circle cx="2.6" cy="-95" r="1" fill="${INK}"/><path d="M-9 -100 q9 -12 18 0z" fill="${r2}" stroke="${INK}" stroke-width=".8"/>
    <path d="M6 -78 q10 -2 14 -14" stroke="${r1}" stroke-width="5" stroke-linecap="round" fill="none"/>${itSym(s, 22, -102, 0.62, s === 's' ? 20 : 0, st)}`;
}
const IT_FACE = { 8: 'Fante', 9: 'Cavallo', 10: 'Re' };

function italianFace(c, style) {
  const r = rank(c), s = suit(c), st = style === 'piacentine' ? 'p' : 'n';
  const W = 116, H = 200;
  const corner = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><text x="0" y="0" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="17" text-anchor="middle" fill="${st === 'p' ? RED : INK}">${r}</text>${st === 'p' ? `<g transform="translate(0 12)">${IT_SYM[s](0.32, st)}</g>` : ''}</g>`;
  let body = '';
  if (r <= 7) {
    const big = r === 1;
    body = IT_PIPS[r].map(([x, y], i) => {
      let rot = 0;
      if (s === 's' || s === 'b') rot = r === 1 ? 0 : (i % 2 ? 18 : -18) * (y > 100 ? -1 : 1);
      return itSym(s, x, y, big ? (s === 'd' ? 2.4 : 2.2) : (r >= 6 ? 0.98 : 1.1), rot, st);
    }).join('');
    if (big) body = `<circle cx="58" cy="100" r="44" fill="none" stroke="${st === 'p' ? RED : GOLD2}" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>${body}`;
  } else {
    const inner = r === 9 ? horse(s, st) : figure(s, r, st);
    if (st === 'p') {
      // piacentine: half-length figure mirrored top / bottom, like a classic double-headed court card
      body = `<clipPath id="hc"><rect x="14" y="22" width="88" height="78"/></clipPath><clipPath id="hc2"><rect x="14" y="100" width="88" height="78"/></clipPath>
        <rect x="14" y="22" width="88" height="156" fill="#fff6df" stroke="${RED}" stroke-width="1"/>
        <g clip-path="url(#hc)"><g transform="translate(58 ${r === 9 ? 128 : 150}) scale(${r === 9 ? 0.78 : 0.95})">${inner}</g></g>
        <g clip-path="url(#hc2)"><g transform="rotate(180 58 100)"><g transform="translate(58 ${r === 9 ? 128 : 150}) scale(${r === 9 ? 0.78 : 0.95})">${inner}</g></g></g>
        <path d="M14 100 h88" stroke="${RED}" stroke-width="1.2"/>`;
    } else {
      body = `<rect x="12" y="24" width="92" height="152" rx="6" fill="${s === 'd' ? '#fff2cf' : s === 'c' ? '#ffe9dc' : s === 's' ? '#e6eefc' : '#e8f4df'}" stroke="${GOLD2}" stroke-width="1"/>
        <g transform="translate(58 ${r === 9 ? 170 : 170}) scale(${r === 9 ? 0.98 : 1.18})">${inner}</g>`;
    }
    body += `<text x="58" y="${st === 'p' ? 196 : 189}" font-family="Georgia,serif" font-size="9" font-style="italic" text-anchor="middle" fill="${INK}" opacity=".7">${st === 'p' ? '' : IT_FACE[r]}</text>`;
  }
  const frame = st === 'p'
    ? `<rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="7" fill="none" stroke="${RED}" stroke-width="1.4"/><rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="5" fill="none" stroke="${BLUE}" stroke-width=".7"/>`
    : `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="none" stroke="${GOLD2}" stroke-width=".8" opacity=".5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="10" fill="${CREAM}"/>${frame}${body}${corner(st === 'p' ? 18 : 15, 24, 0)}${corner(W - (st === 'p' ? 18 : 15), H - 24, 180)}</svg>`;
}

// ------------------------------------------------------------------ French
const FR_PATH = {
  H: 'M0,9 C-3,6 -11,1 -11,-4 C-11,-9 -6,-11 -3,-10 C-1.5,-9.5 -.5,-8 0,-7 C.5,-8 1.5,-9.5 3,-10 C6,-11 11,-9 11,-4 C11,1 3,6 0,9Z',
  D: 'M0,-11 C2.4,-7 5,-3 8,0 C5,3 2.4,7 0,11 C-2.4,7 -5,3 -8,0 C-5,-3 -2.4,-7 0,-11Z',
  S: 'M0,-10 C-3,-6 -11,-2 -11,3 C-11,8 -5,9 -1.8,6 C-2,8 -3,10 -5,11 L5,11 C3,10 2,8 1.8,6 C5,9 11,8 11,3 C11,-2 3,-6 0,-10Z',
  C: 'M0,-10 a4.8,4.8 0 0 1 3.6,8 a4.8,4.8 0 1 1 .8,8.6 C3.6,8 4,10 5,11 L-5,11 C-4,10 -3.6,8 -4.4,6.6 a4.8,4.8 0 1 1 .8,-8.6 A4.8,4.8 0 0 1 0,-10Z',
};
const frCol = (s) => (s === 'H' || s === 'D' ? '#c8202f' : '#15161c');
const frSym = (s, x, y, sc = 1, rot = 0) => `<path d="${FR_PATH[s]}" transform="translate(${f1(x)} ${f1(y)}) rotate(${rot}) scale(${sc})" fill="${frCol(s)}"/>`;
const FR_PIPS = {
  2: [[70, 42], [70, 158]], 3: [[70, 42], [70, 100], [70, 158]],
  4: [[44, 42], [96, 42], [44, 158], [96, 158]], 5: [[44, 42], [96, 42], [70, 100], [44, 158], [96, 158]],
  6: [[44, 42], [96, 42], [44, 100], [96, 100], [44, 158], [96, 158]],
  7: [[44, 42], [96, 42], [70, 71], [44, 100], [96, 100], [44, 158], [96, 158]],
  8: [[44, 42], [96, 42], [70, 71], [44, 100], [96, 100], [70, 129], [44, 158], [96, 158]],
  9: [[44, 42], [96, 42], [44, 81], [96, 81], [70, 100], [44, 119], [96, 119], [44, 158], [96, 158]],
  10: [[44, 42], [96, 42], [70, 61], [44, 81], [96, 81], [44, 119], [96, 119], [70, 139], [44, 158], [96, 158]],
};
const FR_LBL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
function frCourt(s, r) {
  const col = frCol(s), a = s === 'H' || s === 'D' ? '#2c5bb0' : '#c8202f', b = '#f2c12e';
  const hat = r === 13 ? `<path d="M-12 -40 l3 -11 4 6 5 -9 5 9 4 -6 3 11z" fill="${b}" stroke="${INK}" stroke-width=".8"/>`
    : r === 12 ? `<path d="M-12 -40 q12 -16 24 0 l-3 -6 -4 4 -5 -7 -5 7 -4 -4z" fill="${b}" stroke="${INK}" stroke-width=".8"/><path d="M-12 -38 q-6 12 -2 22 M12 -38 q6 12 2 22" stroke="#7a3f1a" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : `<path d="M-13 -40 q13 -12 26 0 q-13 -4 -26 0z" fill="${a}" stroke="${INK}" stroke-width=".8"/><path d="M8 -44 q8 -8 14 -4" stroke="${b}" stroke-width="2" fill="none"/>`;
  const face = `<circle cx="0" cy="-30" r="10" fill="${SKIN}" stroke="${INK}" stroke-width=".9"/><circle cx="-3.5" cy="-31" r="1.1" fill="${INK}"/><circle cx="3.5" cy="-31" r="1.1" fill="${INK}"/><path d="M-3 -25.5 q3 2 6 0" stroke="${INK}" stroke-width=".8" fill="none"/>${r === 13 ? '<path d="M-7 -26 q7 12 14 0 q-2 5 -7 6 q-5 -1 -7 -6z" fill="#d8cfbd"/>' : ''}`;
  const body = `<path d="M-22 0 q0 -16 22 -18 q22 2 22 18z" fill="${col}" stroke="${INK}" stroke-width=".9"/><path d="M-6 -18 l6 18 l6 -18" fill="${b}"/><path d="M-22 0 h44" stroke="${INK}" stroke-width=".9"/>`;
  const prop = `<g transform="translate(17 -16)">${frSym(s, 0, 0, 0.7)}</g>`;
  return `<g>${body}${face}${hat}${prop}</g>`;
}
function frenchFace(c) {
  const r = rank(c), s = suit(c), W = 140, H = 200;
  if (s === 'J') {
    const col = r === 1 ? '#c8202f' : '#15161c';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="11" fill="${CREAM}"/>
      <text x="13" y="26" font-family="Georgia,serif" font-size="13" font-weight="700" fill="${col}" writing-mode="tb" letter-spacing="1">JOLLY</text>
      <g transform="translate(70 112)"><path d="M-26 40 q0 -34 26 -38 q26 4 26 38z" fill="${r === 1 ? '#c8202f' : '#2c2c3a'}" stroke="${INK}"/>
      <path d="M-26 -10 q-10 -34 14 -40 l12 18 l12 -18 q24 6 14 40 q-26 -12 -52 0z" fill="${r === 1 ? '#f2c12e' : '#7a7f92'}" stroke="${INK}"/>
      <circle cx="-30" cy="-12" r="4.6" fill="${r === 1 ? '#2c5bb0' : '#c8202f'}"/><circle cx="30" cy="-12" r="4.6" fill="${r === 1 ? '#2c5bb0' : '#c8202f'}"/><circle cx="0" cy="-36" r="4.6" fill="${r === 1 ? '#c8202f' : '#f2c12e'}"/>
      <circle cx="0" cy="-12" r="13" fill="${SKIN}" stroke="${INK}"/><circle cx="-4.4" cy="-14" r="1.6" fill="${INK}"/><circle cx="4.4" cy="-14" r="1.6" fill="${INK}"/><path d="M-6 -6 q6 6 12 0" stroke="${INK}" stroke-width="1.4" fill="none"/></g>
      <path d="M70 30 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z" fill="${col}"/></svg>`;
  }
  const lbl = FR_LBL[r] || String(r);
  const corner = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><text x="0" y="0" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${lbl === '10' ? 17 : 19}" text-anchor="middle" fill="${frCol(s)}">${lbl}</text>${frSym(s, 0, 13, 0.62)}</g>`;
  let body;
  if (r === 1) body = frSym(s, 70, 100, 2.9);
  else if (r <= 10) body = FR_PIPS[r].map(([x, y]) => frSym(s, x, y, 1.12, y > 100 ? 180 : 0)).join('');
  else {
    const fig = frCourt(s, r);
    body = `<clipPath id="fc"><rect x="24" y="30" width="92" height="70"/></clipPath><clipPath id="fc2"><rect x="24" y="100" width="92" height="70"/></clipPath>
      <rect x="24" y="30" width="92" height="140" fill="#fff8e8" stroke="${frCol(s)}" stroke-width="1.2"/>
      <g clip-path="url(#fc)"><g transform="translate(70 100) scale(1.32)">${fig}</g></g>
      <g clip-path="url(#fc2)"><g transform="rotate(180 70 100)"><g transform="translate(70 100) scale(1.32)">${fig}</g></g></g>
      <path d="M24 100 h92" stroke="${frCol(s)}" stroke-width="1"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="11" fill="${CREAM}"/>${body}${corner(14, 22, 0)}${corner(W - 14, H - 22, 180)}</svg>`;
}

// ------------------------------------------------------------------ backs (cosmetics)
// Each back: id, name, cost (coins; 0 = owned from the start), svg(aspect)
const backSvg = (bg, ink, deco, frame = '#ffffff') => (aspect) => {
  const W = Math.round(200 * aspect), H = 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="${Math.round(W * 0.09)}" fill="${frame}"/>
    <clipPath id="bk"><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="${Math.round(W * 0.06)}"/></clipPath><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="${Math.round(W * 0.06)}" fill="${bg}"/><g clip-path="url(#bk)">${deco(W, H, ink)}</g>
    <rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="${Math.round(W * 0.045)}" fill="none" stroke="${ink}" stroke-width="1.4" opacity=".75"/></svg>`;
};
const lattice = (W, H, ink) => { let s = ''; for (let i = -H; i < W + H; i += 14) s += `<path d="M${i} 0 L${i + H} ${H} M${i} ${H} L${i + H} 0" stroke="${ink}" stroke-width="1.1" opacity=".55"/>`; return `${s}<circle cx="${W / 2}" cy="${H / 2}" r="${W * 0.2}" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="${W / 2}" cy="${H / 2}" r="${W * 0.12}" fill="${ink}" opacity=".7"/>`; };
const dots = (W, H, ink) => { let s = ''; for (let y = 18; y < H - 12; y += 12) for (let x = 18 + ((y / 12) % 2) * 6; x < W - 12; x += 12) s += `<circle cx="${x}" cy="${y}" r="2.2" fill="${ink}" opacity=".5"/>`; return s; };
const emblem = (W, H, ink) => `${dots(W, H, ink)}<g transform="translate(${W / 2} ${H / 2})"><circle r="${W * 0.27}" fill="${ink}"/><text y="${W * 0.1}" font-family="Georgia,serif" font-size="${W * 0.32}" font-weight="700" font-style="italic" text-anchor="middle" fill="#2b1846">B</text></g>`;
const sun = (W, H, ink) => { let s = ''; for (let i = 0; i < 24; i++) s += `<path d="M${W / 2} ${H / 2} L${W / 2 + Math.cos(i / 24 * 6.283) * W} ${H / 2 + Math.sin(i / 24 * 6.283) * W}" stroke="${ink}" stroke-width="${i % 2 ? 1 : 2.4}" opacity=".5"/>`; return `${s}<circle cx="${W / 2}" cy="${H / 2}" r="${W * 0.18}" fill="${ink}"/><circle cx="${W / 2}" cy="${H / 2}" r="${W * 0.11}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6"/>`; };
const stars = (W, H, ink) => { let s = ''; let k = 7; for (let i = 0; i < 40; i++) { k = (k * 9301 + 49297) % 233280; const x = 12 + (k / 233280) * (W - 24); k = (k * 9301 + 49297) % 233280; const y = 12 + (k / 233280) * (H - 24); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(i % 3) * 0.6 + 0.6}" fill="${ink}"/>`; } return `${s}<path d="M${W / 2 + 14} ${H / 2 - 16} a18 18 0 1 0 0 32 a14 14 0 1 1 0 -32z" fill="${ink}"/>`; };
const waves = (W, H, ink) => { let s = ''; for (let y = 16; y < H; y += 10) s += `<path d="M0 ${y} q${W / 8} -7 ${W / 4} 0 t${W / 4} 0 t${W / 4} 0 t${W / 4} 0" stroke="${ink}" stroke-width="1.6" fill="none" opacity=".55"/>`; return s; };
const pizza = (W, H, ink) => `${dots(W, H, '#fff3c4')}<g transform="translate(${W / 2} ${H / 2})"><circle r="${W * 0.3}" fill="#f2c25a"/><circle r="${W * 0.25}" fill="#d8402a"/>${[[-8, -10], [10, -6], [-4, 9], [9, 12], [-14, 4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff6dc"/>`).join('')}<path d="M-3 -3 q4 -6 8 -2 q-4 4 -8 2z" fill="#3c8a3a"/></g>`;
export const BACKS = [
  { id: 'rosso', name: 'Rosso classico', cost: 0, svg: backSvg('#a81f2a', '#ffd6d6', lattice) },
  { id: 'blu', name: 'Blu classico', cost: 0, svg: backSvg('#1f3f8f', '#cfe0ff', lattice) },
  { id: 'baso', name: 'Baso', cost: 150, svg: backSvg('#5b2a91', '#ffd23f', emblem) },
  { id: 'sole', name: 'Sole di Sicilia', cost: 250, svg: backSvg('#e0792a', '#fff1c4', sun) },
  { id: 'mare', name: 'Mare', cost: 250, svg: backSvg('#11788c', '#d8fbff', waves) },
  { id: 'notte', name: 'Notte stellata', cost: 400, svg: backSvg('#141a3a', '#ffe9a8', stars, '#d8c07a') },
  { id: 'pizza', name: 'Margherita', cost: 500, svg: backSvg('#2f7a3a', '#ffffff', pizza) },
  { id: 'oro', name: 'Oro zecchino', cost: 900, svg: backSvg('#2a1a08', '#f2c12e', sun, '#f2c12e') },
];
// table felts: CSS backgrounds for the play surface
export const TABLES = [
  { id: 'verde', name: 'Panno verde', cost: 0, bg: 'radial-gradient(120% 90% at 50% 40%, #2f8a4e 0%, #1d6a3a 55%, #0f3f22 100%)', rim: '#5a3716' },
  { id: 'blu', name: 'Panno blu', cost: 0, bg: 'radial-gradient(120% 90% at 50% 40%, #2f6aa8 0%, #1b4a80 55%, #0c2547 100%)', rim: '#3c2a1a' },
  { id: 'bordeaux', name: 'Bordeaux', cost: 200, bg: 'radial-gradient(120% 90% at 50% 40%, #8e2a3a 0%, #6a1a28 55%, #380a14 100%)', rim: '#2a1a10' },
  { id: 'osteria', name: 'Tavolo d’osteria', cost: 350, bg: 'repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 2px, transparent 2px 64px), radial-gradient(120% 90% at 50% 40%, #b97a42 0%, #8a5428 60%, #4f2c12 100%)', rim: '#3a2210' },
  { id: 'tovaglia', name: 'Tovaglia a quadri', cost: 450, bg: 'radial-gradient(130% 100% at 50% 40%, transparent 50%, rgba(0,0,0,.45)), repeating-conic-gradient(#c8323a 0 25%, #f4efe6 0 50%) 0 0 / 64px 64px', rim: '#7a2a1a' },
  { id: 'notte', name: 'Bisca di notte', cost: 600, bg: 'radial-gradient(70% 60% at 50% 45%, #3a3550 0%, #1a1826 60%, #08070d 100%)', rim: '#111' },
];

// ------------------------------------------------------------------ cached URLs
const cache = new Map();
const url = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
// faceURL('7d', 'napoletane'), faceURL('12H') — copies ('7H~2') share the art of their base card
export function faceURL(c, style) {
  const b = base(c), d = deckOf(b), st = d === 'it40' ? (style === 'piacentine' ? 'piacentine' : 'napoletane') : 'francesi';
  const k = `${st}:${b}`;
  let u = cache.get(k);
  if (!u) { u = url(d === 'it40' ? italianFace(b, st) : frenchFace(b)); cache.set(k, u); }
  return u;
}
export function faceSVG(c, style) { const b = base(c); return deckOf(b) === 'it40' ? italianFace(b, style === 'piacentine' ? 'piacentine' : 'napoletane') : frenchFace(b); }
export function backURL(id = 'rosso', aspect = 0.58) {
  const k = `back:${id}:${aspect}`;
  let u = cache.get(k);
  if (!u) { const B = BACKS.find((b) => b.id === id) || BACKS[0]; u = url(B.svg(aspect)); cache.set(k, u); }
  return u;
}
export const tableOf = (id) => TABLES.find((t) => t.id === id) || TABLES[0];
