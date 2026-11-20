// Texas Hold'em — 2 to 6 seats, Sit & Go (blinds rising, last one standing wins) or cash table (fixed
// blinds, automatic rebuy of fake chips). Plug-in for Carte Baso (interface: src/carte/README.md).
// One framework ROUND = one hand. Chip stacks travel between hands in the match totals
// (totals[p] = stack - starting stack); the button, rebuys and the short hand history travel in the
// opaque `dealer` value that nextDealer() returns (see carryOf). PLAY MONEY ONLY: fictional chips.
import meta from './poker.meta.js';
import { clone, rng, cardShort } from '../core/cards.js';
import * as E from './poker/engine.js';
import { decide, STYLES, STYLE_ORDER, equity, preflopEquity } from './poker/ai.js';
import { evalIds, handName } from './poker/eval.js';
import { chipStack, fmtChips, useChipStyle } from './poker/chips.js';
import { useStyle } from './poker/style.js';
import { POKER_CSS } from './poker/poker-style.js';

export const SPEED = { turbo: 5, normale: 8, lenta: 12 };
const startStack = (mode) => E.START[mode] || 1500;
const modeOf = (variant) => (variant === 'cash' ? 'cash' : 'torneo');
// carry between hands (framework `dealer` value): { btn, rb: rebuys per seat, hist: [{ h, d, t }] }
export function carryOf(d, n) {
  if (d && typeof d === 'object') return { btn: d.btn || 0, rb: (d.rb || []).slice(), hist: (d.hist || []).slice(), elim: (d.elim || []).slice() };
  return { btn: typeof d === 'number' ? d % Math.max(1, n) : 0, rb: Array(n).fill(0), hist: [], elim: [] };
}
export function blindsFor(mode, round, speed = 'normale') {
  if (mode === 'cash') return { level: 0, sb: E.CASH_BLINDS[0], bb: E.CASH_BLINDS[1], next: 0 };
  const per = SPEED[speed] || SPEED.normale, level = Math.floor(round / per);
  const [sb, bb] = E.blindsAt(level);
  return { level, sb, bb, next: per - (round % per), per };
}

function setup(seed, opts) {
  const n = opts.n || 2, mode = modeOf(opts.variant), C = carryOf(opts.dealer, n), round = opts.round || 0;
  const start = startStack(mode), totals = opts.totals || [];
  const before = Array.from({ length: n }, (_, i) => start + (totals[i] || 0));
  const stacks = before.slice(), rebuy = Array(n).fill(0);
  if (mode === 'cash') for (let i = 0; i < n; i++) if (stacks[i] <= 0) { stacks[i] = start; rebuy[i] = start - Math.max(0, before[i]); }
  const B = blindsFor(mode, round, opts.velocita);
  const s = E.newHand({ n, seed, stacks, btn: C.btn, sb: B.sb, bb: B.bb });
  const base = (seed - round * 7919) >>> 0;
  Object.assign(s, {
    mode, hand: round, level: B.level, nextLevel: B.next, before, rebuy, carry: C, teams: Array.from({ length: n }, (_, i) => [i]),
    styles: Array.from({ length: n }, (_, p) => STYLE_ORDER[(p + (base % 6)) % STYLE_ORDER.length]),
    levelUp: mode === 'torneo' && round > 0 && B.next === B.per, aiuto: opts.aiuto === true || opts.aiuto === 'si',
  });
  return s;
}
const legalMoves = (s, p) => E.menu(s, p);
function apply(s, m) {
  const t = clone(s); t.say = null;
  E.act(t, m);
  if (t.levelUp && !t.levelShown && !t.say) { t.say = { text: `Blind ${fmtChips(t.sb)}/${fmtChips(t.bb)}`, cls: 'blue' }; }
  t.levelShown = true;
  return t;
}
function steps(s, m) { const f = []; const t = clone(s); E.act(t, m, f); return f; }
const ai = (s, p, level, r = Math.random) => decide(s, p, level, r, s.styles?.[p]);
const isOver = (s) => !!s.over;

// ---------------------------------------------------------------- results and history
const short = (c) => cardShort(c);
const A_TXT = { sb: 'SB', bb: 'BB', fold: 'lascia', check: 'passa', call: 'vede', bet: 'punta', raise: 'rilancia a' };
export function actText(e) { if (e.allin) return e.a === 'call' ? `vede ${fmtChips(e.amt)} (all-in)` : `all-in ${fmtChips(e.amt)}`; return `${A_TXT[e.a] || e.a}${e.amt != null && e.a !== 'fold' && e.a !== 'check' ? ` ${fmtChips(e.amt)}` : ''}`; }
function winText(s) {
  const r = s.result; if (!r) return '';
  if (r.uncontested) return `Gli altri lasciano: piatto di ${fmtChips(r.pots[0]?.amount)} senza showdown.`;
  return r.pots.map((pt, i) => `${i ? `Piatto laterale ${i}` : 'Piatto'} ${fmtChips(pt.amount)}: ${pt.winners.length > 1 ? 'diviso, ' : ''}${r.names[pt.winners[0]]}`).join(' · ');
}
function scores(s) {
  const n = s.n, r = s.result || { won: Array(n).fill(0), shown: [], names: {} };
  const points = Array.from({ length: n }, (_, p) => s.stacks[p] - s.before[p]);
  const rows = [];
  rows.push({ label: 'Carte', values: Array.from({ length: n }, (_, p) => (r.shown.includes(p) ? s.hole[p].map(short).join(' ') : s.out[p] ? '' : '—')) });
  if (r.shown.length) rows.push({ label: 'Punto', values: Array.from({ length: n }, (_, p) => (r.shown.includes(p) ? r.names[p] : '')) });
  for (let st = 0; st < 4; st++) {
    const ev = s.log.filter((e) => e.st === st); if (!ev.length) continue;
    const cards = st === 1 ? s.board.slice(0, 3) : st === 2 ? s.board.slice(3, 4) : st === 3 ? s.board.slice(4, 5) : [];
    rows.push({ label: `${E.STREETS[st]}${cards.length ? ` ${cards.map(short).join(' ')}` : ''}`, values: Array.from({ length: n }, (_, p) => ev.filter((e) => e.p === p).map(actText).join(', ')) });
  }
  if (s.allinRun && s.board.length) rows.push({ label: `Tavolo ${s.board.map(short).join(' ')}`, values: Array(n).fill('') });
  const best = r.pots?.[0]?.winners || [];
  rows.push({ label: 'Vincita', values: r.won.map((v) => (v ? `+${fmtChips(v)}` : '')), best: best.length === 1 ? best[0] : undefined });
  if (s.rebuy.some((x) => x > 0)) rows.push({ label: 'Ricarica (fiches finte)', values: s.rebuy.map((x) => (x ? `+${fmtChips(x)}` : '')) });
  rows.push({ label: 'Fiches', values: s.stacks.map((v, p) => (s.mode === 'torneo' && v <= 0 ? (s.before[p] > 0 ? 'Eliminato' : '—') : fmtChips(v))) });
  for (const h of (s.carry?.hist || []).slice(-4).reverse()) rows.push({ label: `Mano ${h.h + 1}: ${h.t}`, values: h.d.map((v) => (v ? `${v > 0 ? '+' : ''}${fmtChips(v)}` : '')) });
  const pot = (r.pots || []).reduce((a, x) => a + x.amount, 0);
  return {
    points, rows,
    records: { piatto: r.won[0] || 0, fiches: s.stacks[0], _rb: s.rebuy.slice() },
    coins: 0,
    note: `${winText(s)}${pot ? '' : ''} Fiches finte, solo per gioco.`,
  };
}
function nextDealer(s, d) {
  const C = carryOf(d ?? s.carry, s.n);
  const alive = (p) => s.mode === 'cash' || s.stacks[p] > 0;
  C.btn = E.nextFrom(s, s.btn, alive); if (C.btn < 0) C.btn = s.btn;
  C.rb = Array.from({ length: s.n }, (_, p) => (C.rb[p] || 0) + (s.rebuy[p] || 0));
  const r = s.result, w = r?.pots?.[0]?.winners || [];
  const t = !r ? '' : r.uncontested ? `G${w[0] + 1} senza showdown` : `${w.length > 1 ? 'diviso' : `G${w[0] + 1}`}, ${r.names[w[0]]}`;
  C.hist.push({ h: s.hand, d: s.stacks.map((v, p) => v - s.before[p] - (s.rebuy[p] || 0)), t });
  if (C.hist.length > 12) C.hist.shift();
  for (let p = 0; p < s.n; p++) if (s.mode === 'torneo' && s.before[p] > 0 && s.stacks[p] <= 0) C.elim.push(p);
  return C;
}
// match end: Sit & Go = last player with chips (or every human busted, or the hand limit);
// cash = the hand limit (profit net of rebuys)
function matchOver(totals, cfg, rounds) {
  const mode = modeOf(cfg.variant), start = startStack(mode), n = totals.length;
  const stacks = totals.map((t) => start + t);
  const humans = (cfg.seats || []).map((x, i) => (x?.kind === 'human' ? i : -1)).filter((i) => i >= 0);
  const leader = (vals) => { const mx = Math.max(...vals), ls = vals.map((v, i) => (v === mx ? i : -1)).filter((i) => i >= 0); return ls.length === 1 ? ls[0] : 'draw'; };
  const limit = cfg.target > 0 ? cfg.target : 400;
  if (mode === 'torneo') {
    const alive = stacks.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    if (alive.length <= 1) return alive[0] ?? 'draw';
    if (humans.length && humans.every((h) => stacks[h] <= 0)) return leader(stacks);
    if (rounds.length >= limit) return leader(stacks);
    return -1;
  }
  if (rounds.length >= limit) {
    const rb = Array(n).fill(0);
    for (const r of rounds) (r.records?._rb || []).forEach((v, i) => { rb[i] += v || 0; });
    return leader(totals.map((t, i) => t - rb[i]));
  }
  return -1;
}

// ---------------------------------------------------------------- view
const REL = { 1: ['b'], 2: ['b', 't'], 3: ['b', 'r', 'l'], 4: ['b', 'r', 't', 'l'], 5: ['b', 'r', 'tr', 'tl', 'l'], 6: ['b', 'r', 'tr', 't', 'tl', 'l'] };
const BET = { b: [0.5, 0.8], t: [0.5, 0.13], l: [0.1, 0.5], r: [0.9, 0.5], tl: [0.2, 0.15], tr: [0.8, 0.15] };
const BTN = { b: [0.63, 0.8], t: [0.37, 0.13], l: [0.1, 0.33], r: [0.9, 0.67], tl: [0.08, 0.2], tr: [0.92, 0.2] };
const relOf = (n, viewer, p) => (REL[n] || REL[6])[(((p - viewer) % n) + n) % n];
const DECO = ['1J~7', '2J~7', '1J~8'];
const eqCache = new Map();
function myEquity(s, p) {
  const opp = s.out.reduce((a, o, q) => a + (q !== p && E.live(s, q) ? 1 : 0), 0);
  if (!opp || !s.hole[p]?.length) return null;
  const key = `${s.hole[p].join()}|${s.board.join()}|${opp}`;
  if (!eqCache.has(key)) { if (eqCache.size > 200) eqCache.clear(); eqCache.set(key, s.board.length ? equity(s.hole[p], s.board, opp, 900, rng(key)) : preflopEquity(s.hole[p], opp)); }
  return eqCache.get(key);
}
function view(s, viewer, ctx = {}) {
  useChipStyle(); useStyle('carte-poker-css', POKER_CSS);
  const n = s.n, P = !!ctx.portrait, bs = P ? (n > 4 ? 0.62 : 0.68) : 0.8;
  const human = (p) => !ctx.seats || ctx.seats[p]?.kind === 'human';
  const piles = [];
  const rel = (p) => relOf(n, viewer, p);
  const at = (p, T) => T[rel(p)] || [0.5, 0.5];
  const boardY = P ? 0.42 : 0.4;
  piles.push({ id: 'deck', x: 0.5, y: boardY, ox: -3.25 * (bs / 0.8) * (P ? 0.92 : 1), scale: bs * 0.86, layout: 'stack', up: false, source: true, z: 5, cards: DECO });
  piles.push({ id: 'board', cls: 'pk-tbl', outline: true, x: 0.5, y: boardY, layout: 'row', gap: 1.06, scale: bs, z: 20, w: P ? 0.98 : 0.6, cards: s.board.map((c) => ({ id: c, up: true })) });
  piles.push({ id: 'muck', x: 0.5, y: boardY, ox: -3.25 * (bs / 0.8) * (P ? 0.92 : 1), oy: 0.04, scale: bs * 0.8, layout: 'stack', up: false, z: 4, cards: [...s.muck, ...s.burn].map((c) => ({ id: c, rot: ((c.charCodeAt(0) * 37 + c.length * 11) % 30) - 15 })) });
  const showAll = s.over && !s.result?.uncontested;
  for (let p = 0; p < n; p++) {
    if (s.out[p]) continue;
    const up = (p === viewer && human(p)) || (showAll && s.result.shown.includes(p));
    piles.push({ id: `h${p}`, seat: p, slot: 'hand', gap: p === viewer ? 0.7 : 0.5, cards: s.folded[p] ? [] : s.hole[p].map((c) => ({ id: c, up })) });
  }
  // bets in front of the seats; while collecting they slide into the pot
  const potY = 0.5 * bs + 0.42;
  for (let p = 0; p < n; p++) {
    if (!s.bets[p]) continue;
    const [x, y] = s.collecting ? [0.5, boardY] : at(p, BET);
    piles.push({ id: `bet${p}`, cls: 'chips', x, y, oy: s.collecting ? potY : 0, z: 60, cards: [], label: chipStack(s.bets[p], { cols: 2 }) });
  }
  const r = s.result;
  if (s.over && r) {
    // payouts slide from the pot to each winner
    r.won.forEach((v, p) => { if (!v) return; const [x, y] = at(p, BET); piles.push({ id: p === r.pots[0]?.winners[0] ? 'pot' : `win${p}`, cls: 'chips', x, y, z: 70, cards: [], label: chipStack(v, { cls: 'pot win big' }) }); });
  } else {
    const coll = E.collected(s);
    if (coll > 0) {
      const live = s.contrib.map((c, p) => c - s.bets[p]);
      const pots = E.buildPots(live, s.folded, s.out);
      const label = pots.length > 1
        ? `<span class="pk-pots">${pots.map((pt, i) => chipStack(pt.amount, { cls: i ? 'side' : 'pot big', note: i ? `laterale ${i}` : 'piatto', cols: i ? 1 : 3 })).join('')}</span>`
        : chipStack(coll, { cls: 'pot big', note: 'piatto' });
      piles.push({ id: 'pot', cls: 'chips', x: 0.5, y: boardY, oy: potY, z: 70, cards: [], label });
    }
  }
  piles.push({ id: 'note', cls: 'marker', x: 0.5, y: boardY, oy: -(0.5 * bs + 0.32), z: 1, cards: [], label: '<span class="tbl-note">Fiches finte, solo per gioco</span>' });
  if (!s.out[s.btn]) { const [x, y] = at(s.btn, BTN); piles.push({ id: 'dbtn', cls: 'marker', x, y, z: 65, cards: [], label: '<i class="pk-dbtn" title="Bottone del mazziere">D</i>' }); }
  const seats = Array.from({ length: n }, (_, p) => {
    if (s.out[p]) return { sub: '<span class="pk-a fold">Eliminato</span>' };
    const last = [...s.log].reverse().find((e) => e.p === p && (e.st === s.street || s.over));
    let tag = '';
    if (s.over && r?.won[p]) tag = `<em class="pk-a win">+${fmtChips(r.won[p])}</em>`;
    else if (s.folded[p]) tag = '<em class="pk-a fold">Lascia</em>';
    else if (E.isAllIn(s, p)) tag = '<em class="pk-a allin">All-in</em>';
    else if (last && last.a !== 'sb' && last.a !== 'bb') tag = `<em class="pk-a ${last.a}">${actText(last)}</em>`;
    const pos = p === s.btn ? 'D' : p === s.sbSeat ? 'SB' : p === s.bbSeat ? 'BB' : '';
    const sty = !human(p) && s.styles?.[p] ? `<i class="pk-sty">${STYLES[s.styles[p]].name}</i>` : (pos ? `<i class="pk-sty">${pos}</i>` : '');
    return { sub: `<b class="pk-st">${fmtChips(s.stacks[p])}</b>${tag}${sty}` };
  });
  const hl = s.over && r && !r.uncontested ? r.best : [];
  return { piles, hl, seats, mine: `h${viewer}` };
}
function status(s, viewer) {
  const parts = [`Mano ${s.hand + 1}`, `Blind ${fmtChips(s.sb)}/${fmtChips(s.bb)}`];
  if (s.mode === 'torneo') parts.push(s.nextLevel === 1 ? 'salgono alla prossima mano' : `livello ${s.level + 1}, salgono tra ${s.nextLevel} mani`);
  if (s.rebuy?.[viewer] && !s.over) parts.push(`ricarica di ${fmtChips(s.rebuy[viewer])} fiches finte`);
  if (!s.out[viewer] && !s.folded[viewer] && s.hole[viewer]?.length === 2 && !s.over) {
    if (s.board.length >= 3) parts.push(`Hai: ${handName(evalIds([...s.hole[viewer], ...s.board]))}`);
    if (s.aiuto) { const e = myEquity(s, viewer); if (e != null) parts.push(`equity ${Math.round(e * 100)}%`); }
  }
  return parts.join(' · ');
}

const RULES = `
<p><b>Fiches finte, solo per gioco.</b> Non si compra nulla, non si vince nulla di reale: le fiches sono numeri del tavolo e non diventano monete.</p>
<h3>Lo scopo</h3><p>Ogni giocatore riceve due carte coperte; sul tavolo escono cinque carte comuni. Vince il piatto chi forma la combinazione migliore di <b>cinque carte</b> usando le sue due e le cinque comuni, oppure chi resta l’ultimo in gioco perché gli altri hanno lasciato.</p>
<h3>Le combinazioni (dalla più alta)</h3><ul>
<li><b>Scala reale</b>: A K Q J 10 dello stesso seme</li><li><b>Scala colore</b>: cinque carte in sequenza dello stesso seme</li>
<li><b>Poker</b>: quattro carte uguali</li><li><b>Full</b>: un tris e una coppia</li><li><b>Colore</b>: cinque carte dello stesso seme</li>
<li><b>Scala</b>: cinque carte in sequenza (l’Asso può essere alto o basso: A-2-3-4-5 è la scala minima)</li>
<li><b>Tris</b>: tre carte uguali</li><li><b>Doppia coppia</b></li><li><b>Coppia</b></li><li><b>Carta alta</b></li></ul>
<p>A parità di combinazione contano le carte più alte (i <i>kicker</i>); a parità perfetta il piatto si divide.</p>
<h3>Il giro di puntate</h3><p>Il bottone <b>D</b> gira a ogni mano. I due giocatori alla sua sinistra mettono il <b>piccolo</b> e il <b>grande buio</b> (in due, il bottone mette il piccolo buio). Si gioca in quattro fasi: <b>preflop</b>, <b>flop</b> (tre carte), <b>turn</b> e <b>river</b> (una carta ciascuno). A turno puoi <b>lasciare</b>, <b>passare</b> se nessuno ha puntato, <b>vedere</b> la puntata, <b>puntare</b> o <b>rilanciare</b>, oppure andare <b>all-in</b>.</p>
<p>Il rilancio minimo è pari all’ultimo rilancio completo (almeno il grande buio). Un all-in più corto di un rilancio completo non riapre il giro a chi aveva già parlato.</p>
<h3>All-in e piatti laterali</h3><p>Chi va all-in può vincere solo quanto ha messo da ciascun avversario: il resto forma un <b>piatto laterale</b> che si contendono gli altri. La puntata che nessuno ha visto torna al proprietario.</p>
<h3>Modalità</h3><ul><li><b>Sit &amp; Go</b>: tutti partono con 1.500 fiches, i bui salgono ogni poche mani (Turbo 5, Normale 8, Lenta 12). Vince l’ultimo con le fiches; se vieni eliminato la partita finisce.</li>
<li><b>Tavolo cash</b>: bui fissi 10/20 e 2.000 fiches; chi resta senza viene ricaricato automaticamente (sempre fiches finte). Alla fine della sessione vince chi ha guadagnato di più, ricariche escluse.</li></ul>
<h3>Gli avversari</h3><p>Ogni CPU ha uno stile: <b>Roccia</b> (stretto e passivo), <b>Squalo</b> (stretto e aggressivo), <b>Maniaco</b> (largo e aggressivo), <b>Pescatore</b> (largo e passivo). Stimano la forza della mano simulando migliaia di carte possibili, valutano il rapporto piatto/puntata e la posizione, e ogni tanto bluffano. A Difficile simulano di più e leggono meglio i rilanci.</p>
<h3>Con gli amici</h3><p>Imposta più posti come umani: il dispositivo passa di mano e le carte coperte si vedono solo quando chi tocca è pronto. Lo storico di ogni mano appare a fine mano.</p>`;

export default {
  ...meta,
  desc: 'Due carte coperte, cinque in tavola e un piatto da conquistare: Sit & Go con bui che salgono o tavolo cash con ricarica. Da 2 a 6 giocatori. Fiches finte, solo per gioco.',
  players: [2, 6], decks: ['fr52'],
  thumb: ['1S', '1H', '13S'],
  variants: [
    { id: 'torneo', name: 'Sit & Go', desc: 'Bui che salgono, vince l’ultimo con le fiches.', players: [2, 6], teams: false },
    { id: 'cash', name: 'Tavolo cash', desc: 'Bui fissi 10/20, ricarica automatica di fiches finte.', players: [2, 6], teams: false },
  ],
  options: [
    { id: 'velocita', name: 'Bui', when: (o) => o.variant !== 'cash', values: [{ v: 'turbo', label: 'Turbo (5 mani)' }, { v: 'normale', label: 'Normale (8)' }, { v: 'lenta', label: 'Lenta (12)' }], default: 'normale' },
    { id: 'aiuto', name: 'Mostra la tua equity', values: [{ v: false, label: 'No' }, { v: true, label: 'Sì' }], default: false },
  ],
  targets: [{ v: 30, label: '30 mani' }, { v: 60, label: '60 mani' }, { v: 0, label: 'Senza limite' }],
  defaultTarget: 30,
  records: { piatto: 'Piatto più grande vinto', fiches: 'Fiches massime (finte)' },
  undo: false,
  roundWord: 'Mano',
  setup, legalMoves, apply, steps, ai, isOver, scores, view, status, nextDealer, matchOver, rules: RULES,
};
export { E as engine };
