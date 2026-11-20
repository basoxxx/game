// Blackjack — one player against the dealer on a 6-deck shoe with a cut card. Plug-in for Carte Baso
// (interface: src/carte/README.md). One framework ROUND = one hand. The bankroll travels in the match
// totals (totals[0] = bank - 1.000); the shoe (number + position), the last bet and the session
// statistics travel in the opaque `dealer` value that nextDealer() returns. The shoe itself is rebuilt
// from the match seed, so the Hi-Lo count is exact across hands. PLAY MONEY ONLY: fictional chips.
import meta from './blackjack.meta.js';
import { clone, cardShort } from '../core/cards.js';
import * as B from './blackjack/engine.js';
import { handValue, basic, ADVICE } from './blackjack/strategy.js';
import { chipStack, chipFace, fmtChips, useChipStyle } from './poker/chips.js';
import { useStyle } from './poker/style.js';

const STAT0 = () => ({ hands: 0, won: 0, lost: 0, push: 0, bj: 0, dbl: 0, spl: 0, sur: 0, hints: 0, hintOk: 0, quizN: 0, quizOk: 0, best: 0, peak: B.START_BANK });
export function carryOf(d) {
  if (d && typeof d === 'object') return { shoeNo: d.shoeNo || 0, pos: d.pos || 0, lastBet: d.lastBet || 0, st: { ...STAT0(), ...(d.st || {}) } };
  return { shoeNo: 0, pos: 0, lastBet: 0, st: STAT0() };
}
function setup(seed, opts) {
  const C = carryOf(opts.dealer), round = opts.round || 0;
  const base = (seed - round * 7919) >>> 0;
  const bank = B.START_BANK + (opts.totals?.[0] || 0);
  const s = B.newRound({ seed, base, bank, shoeNo: C.shoeNo, pos: C.pos, lastBet: C.lastBet, rules: { h17: opts.banco === 'h17', surrender: opts.resa !== false, das: true }, count: opts.conta || 'off', stats: C.st });
  s.hand = round;
  return s;
}
const legalMoves = (s, p) => (p === 0 ? B.moves(s) : []);
function apply(s, m) { const t = clone(s); B.act(t, m); return t; }
function steps(s, m) { const f = []; B.act(clone(s), m, f); return f; }
// the "CPU" plays for the tests and the soak: flat bet, basic strategy, answers the quiz correctly
function ai(s) {
  const ms = B.moves(s), has = (a) => ms.find((m) => m.a === a);
  if (s.phase === 'bet') {
    if (s.quiz && !s.quiz.asked) return ms.find((m) => m.a === 'guess' && m.v === s.quiz.answer);
    if (s.bet < 20 && ms.some((m) => m.a === 'chip' && m.v === 10)) return { a: 'chip', v: 10 };
    return has('deal') || ms[0];
  }
  if (s.phase === 'ins') return { a: 'ins', yes: false };
  const c = B.advice(s);
  return has({ H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' }[c]) || has('stand');
}
const isOver = (s) => !!s.over;

function tally(s) {
  const st = { ...STAT0(), ...(s.stats || {}) };
  if (!s.hands.length) return st;
  st.hands += s.hands.length;
  for (const h of s.hands) {
    if (h.res === 'win' || h.res === 'bj') st.won++; else if (h.res === 'push') st.push++; else st.lost++;
    if (h.res === 'bj') st.bj++; if (h.doubled) st.dbl++; if (h.res === 'sur') st.sur++;
  }
  st.spl += s.hands.length - 1; st.hints += s.hints; st.hintOk += s.hintOk;
  if (s.quiz?.asked) { st.quizN++; if (s.quiz.ok) st.quizOk++; }
  st.best = Math.max(st.best, s.bank - s.bank0); st.peak = Math.max(st.peak, s.bank);
  return st;
}
function scores(s) {
  const net = s.bank - s.bank0, d = handValue(s.dealer);
  const rows = s.hands.map((h, i) => ({ label: `${s.hands.length > 1 ? `Mano ${i + 1}` : 'La tua mano'}: ${h.cards.map(cardShort).join(' ')} (${handValue(h.cards).total})`, values: [`${B.RES_TXT[h.res] || ''} ${h.pay - h.bet >= 0 ? '+' : ''}${fmtChips(h.pay - h.bet)}`] }));
  rows.unshift({ label: `Banco: ${s.dealer.map(cardShort).join(' ')} (${d.total > 21 ? 'sballa' : d.total})`, values: [''] });
  if (s.ins) rows.push({ label: 'Assicurazione', values: [s.insWon ? `+${fmtChips(s.ins * 2)}` : `−${fmtChips(s.ins)}`] });
  const st = tally(s);
  rows.push({ label: `Sessione: ${st.hands} mani, ${st.won} vinte, ${st.push} pari, ${st.lost} perse, ${st.bj} blackjack${st.hints ? ` · consigli seguiti ${st.hintOk}/${st.hints}` : ''}`, values: [`${fmtChips(s.bank)} fiches`] });
  if (s.count !== 'off') rows.push({ label: `Hi-Lo: conteggio ${sg(B.seenCount(s))}, vero ${sg1(B.trueCount(s))} (${B.decksLeft(s).toFixed(1)} mazzi)${st.quizN ? ` · quiz ${st.quizOk}/${st.quizN}` : ''}`, values: [''] });
  return {
    points: [net], rows,
    records: { banco: s.bank, vincita: Math.max(0, net), ...(st.quizN ? { quiz: st.quizOk } : {}) },
    coins: 0,
    note: `${s.hands.map((h) => B.RES_TXT[h.res]).join(', ')}: ${net >= 0 ? '+' : '−'}${fmtChips(Math.abs(net))}. Fiches finte, solo per gioco.`,
  };
}
const sg = (v) => `${v > 0 ? '+' : ''}${v}`;
const sg1 = (v) => `${v > 0 ? '+' : ''}${(Math.round(v * 10) / 10).toFixed(1)}`;
function nextDealer(s) { return { shoeNo: s.shoeNo, pos: s.pos, lastBet: s.lastBet, st: tally(s) }; }
// session: the chosen number of hands, or until the bankroll cannot cover the minimum bet
function matchOver(totals, cfg, rounds) {
  const bank = B.START_BANK + (totals[0] || 0);
  const done = bank < B.MIN_BET || (cfg.target > 0 && rounds.length >= cfg.target) || rounds.length >= 1000;
  if (!done) return -1;
  return totals[0] > 0 ? 0 : totals[0] === 0 ? 'draw' : 1;
}

// ---------------------------------------------------------------- view
const DECO = ['1J~7', '2J~7', '1J~8', '2J~8'];
const BJ_CSS = `
.ct-root:has(.bj-tbl) .ct-acts { flex-wrap: wrap; justify-content: center; width: min(calc(100% - 16px), 760px); gap: 6px; bottom: 16px; }
.ct-root:has(.bj-tbl) .ct-acts .btn { min-height: 42px; box-shadow: 0 4px 12px rgba(0,0,0,.45); }
.ct-root:has(.bj-tbl) .ct-acts .btn:has(.chp-face) { padding: 2px; min-height: 0; border-radius: 50%; background: transparent; border: 0; box-shadow: none; }
.ct-root:has(.bj-tbl) .ct-acts .btn:has(.chp-face) .chp-face { --cs: 46px; }
.ct-root:has(.bj-tbl) .ct-acts .btn:has(.chp-face):hover .chp-face { transform: translateY(-3px); box-shadow: 0 6px 10px rgba(0,0,0,.5), 0 0 0 2px #ffd23f; }
.ct-root:has(.bj-tbl) .ct-acts .btn:has(.chp-face) .chp-face b { font-size: 13px; }
.bj-felt { display: block; width: min(86vw, 640px); white-space: normal; text-align: center; font: 800 calc(var(--cw) * .16)/1.2 var(--display, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: rgba(255,230,160,.55); white-space: nowrap; }
.bj-felt small { display: block; font: 600 11px/1.4 var(--body, sans-serif); letter-spacing: .06em; color: rgba(255,255,255,.55); text-transform: none; }
.bj-tot { display: inline-block; min-width: 26px; padding: 1px 8px; border-radius: 12px; background: rgba(0,0,0,.6); color: #fff; font: 800 14px/1.4 var(--display, sans-serif); text-align: center; }
.bj-tot.soft { background: rgba(30,90,160,.8); } .bj-tot.bust { background: #b3202a; } .bj-tot.bj { background: #c99a10; color: #111; }
.bj-res { display: block; margin-top: 3px; font: 800 12px/1.3 var(--display, sans-serif); text-transform: uppercase; letter-spacing: .06em; text-align: center; color: #fff; text-shadow: 0 1px 2px #000; }
.bj-res.win, .bj-res.bj { color: #7dff9a; } .bj-res.lose, .bj-res.bust { color: #ff8a8a; } .bj-res.push, .bj-res.sur { color: #ffd23f; }
.bj-lab { display: inline-flex; flex-direction: column; align-items: center; gap: 3px; }
.ct-root:has(.bj-tbl) .ct-pile.bj-act .ct-lbl .bj-tot { box-shadow: 0 0 0 2px #ffd23f; }
.bj-spot { display: grid; place-items: center; width: calc(var(--cw) * .95); height: calc(var(--cw) * .95); border-radius: 50%; border: 2px dashed rgba(255,230,160,.45); color: rgba(255,230,160,.7); font: 700 12px/1.1 var(--display, sans-serif); text-transform: uppercase; letter-spacing: .08em; }
.bj-count { padding: 3px 10px; border-radius: 4px; background: rgba(0,0,0,.55); color: #c7f0ff; font: 700 12px/1.4 var(--display, sans-serif); letter-spacing: .04em; white-space: nowrap; }
@media (max-height: 560px) and (min-aspect-ratio: 4/3) {
  .ct-root:has(.bj-tbl) .ct-acts { left: auto; right: 10px; transform: none; bottom: 10px; width: min(40vw, 360px); justify-content: flex-end; }
  .ct-root:has(.bj-tbl) .ct-acts .btn { min-height: 34px; padding: 6px 10px; font-size: 12.5px; }
  .ct-root:has(.bj-tbl) .ct-acts .btn:has(.chp-face) .chp-face { --cs: 38px; }
  .bj-felt small { display: none; } .bj-felt { width: 40vw; font-size: 12px; }
}
`;
function totLabel(cards, { final = false } = {}) {
  if (!cards.length) return '';
  const v = handValue(cards), bj = cards.length === 2 && v.total === 21;
  const cls = v.total > 21 ? 'bust' : bj && final !== 'split' ? 'bj' : v.soft ? 'soft' : '';
  return `<span class="bj-tot ${cls}">${v.total > 21 ? `${v.total} · sballa` : v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : v.total}</span>`;
}
function view(s, viewer, ctx = {}) {
  useChipStyle(); useStyle('carte-bj-css', BJ_CSS);
  const P = !!ctx.portrait, piles = [];
  const k = s.hands.length, sc = P ? (k >= 3 ? 0.62 : 0.78) : k >= 3 ? 0.75 : 0.9;
  const handY = P ? 0.64 : 0.66, dealerY = P ? 0.24 : 0.22;
  piles.push({ id: 'shoe', anchor: 'table', x: P ? 0.86 : 0.88, y: P ? 0.1 : 0.14, rot: -8, scale: 0.62, layout: 'stack', up: false, source: true, cards: DECO, label: `${Math.max(0, B.SHOE - s.pos)} carte` });
  // the dealer
  const dealerCards = s.dealer.map((c, i) => ({ id: c, up: i === 0 || s.holeUp }));
  piles.push({ id: 'dealer', cls: 'bj-tbl', anchor: 'table', x: 0.5, y: dealerY, layout: 'row', gap: 0.58, scale: P ? 0.8 : 0.9, w: 0.8, cards: dealerCards,
    outline: !s.dealer.length, label: s.dealer.length ? totLabel(s.holeUp ? s.dealer : s.dealer.slice(0, 1)) : '' });
  // felt print
  const rules = `${s.rules.h17 ? 'Il banco chiede carta sul 17 soft' : 'Il banco sta su tutti i 17'} · Blackjack paga 3:2 · Assicurazione 2:1`;
  piles.push({ id: 'felt', cls: 'marker', anchor: 'table', x: 0.5, y: P ? 0.43 : 0.44, cards: [], label: `<span class="bj-felt">Blackjack paga 3 a 2<small>${rules}</small><small>Fiches finte, solo per gioco</small></span>` });
  // the player's hands
  if (s.phase === 'bet') {
    piles.push({ id: 'spot', cls: 'chips', anchor: 'table', x: 0.5, y: handY, cards: [], label: s.bet ? chipStack(s.bet, { cls: 'pot big', note: 'puntata' }) : '<i class="bj-spot">Punta</i>' });
  } else {
    s.hands.forEach((h, i) => {
      const x = 0.5 + (i - (k - 1) / 2) * (P ? 0.31 : 0.22) * (k >= 3 && P ? 0.85 : 1);
      const active = s.phase === 'play' && i === s.cur;
      const res = h.res && s.over ? `<span class="bj-res ${h.res}">${B.RES_TXT[h.res]}${h.pay - h.bet ? ` ${h.pay - h.bet > 0 ? '+' : '−'}${fmtChips(Math.abs(h.pay - h.bet))}` : ''}</span>` : h.res === 'bust' ? '<span class="bj-res bust">Sballata</span>' : '';
      piles.push({ id: `hand${i}`, cls: active ? 'bj-act' : '', anchor: 'table', x, y: handY, layout: 'row', gap: 0.5, scale: sc, cards: h.cards.map((c) => ({ id: c, up: true })), label: `<span class="bj-lab">${totLabel(h.cards, { final: h.split ? 'split' : false })}${res}</span>` });
      piles.push({ id: i ? `bet${i}` : 'spot', cls: 'chips', anchor: 'table', x, y: handY, oy: 0.5 * sc + 0.42, cards: [], label: chipStack(s.over ? h.pay : h.bet, { cols: 2, cls: s.over && h.pay > h.bet ? 'win' : '' }) });
    });
    if (s.ins) piles.push({ id: 'ins', cls: 'chips', anchor: 'table', x: 0.5, y: P ? 0.51 : 0.53, cards: [], label: chipStack(s.insWon ? s.ins * 3 : s.ins, { cls: 'side', note: s.insWon ? 'assicurazione pagata' : 'assicurazione' }) });
  }
  if (s.count === 'mostra' || (s.count === 'quiz' && (s.quiz?.asked || s.phase !== 'bet'))) {
    piles.push({ id: 'count', cls: 'marker', anchor: 'table', x: P ? 0.2 : 0.13, y: P ? 0.1 : 0.14, cards: [], label: `<span class="bj-count">RC ${sg(B.seenCount(s))} · TC ${sg1(B.trueCount(s))}</span>` });
  }
  const hl = s.phase === 'play' && k > 1 ? s.hands[s.cur].cards : [];
  const st = s.stats || STAT0();
  return { piles, hl, seats: [{ sub: `<b class="pk-st">${fmtChips(s.bank)}</b>&nbsp;fiches finte · ${st.hands} mani` }], mine: 'hand0' };
}
function status(s) {
  const parts = [`Mano ${s.hand + 1}`, `banco ${fmtChips(s.bank)}`];
  if (s.phase === 'bet') parts.push(s.quiz && !s.quiz.asked ? 'quanto vale il conteggio Hi-Lo?' : `puntata ${fmtChips(s.bet)} (min ${B.MIN_BET}, max ${fmtChips(B.MAX_BET)})`);
  if (s.phase === 'ins') parts.push('il banco mostra un Asso: assicurazione?');
  if (s.phase === 'play' && s.hands.length > 1) parts.push(`mano ${s.cur + 1} di ${s.hands.length}`);
  if (s.fresh && s.phase === 'bet') parts.push('sabot nuovo, mescolato');
  return parts.join(' · ');
}
// chips as round buttons in the bet phase
function decorate(moves) { return moves.map((m) => (m.a === 'chip' ? { ...m, label: chipFace(m.v) } : m)); }

const RULES = `
<p><b>Fiches finte, solo per gioco.</b> Il banco iniziale è di 1.000 fiches finte: non si comprano, non si convertono, servono solo a giocare.</p>
<h3>Lo scopo</h3><p>Batti il banco avvicinandoti a <b>21</b> senza superarlo. Le figure valgono 10, l’Asso 1 o 11, le altre carte il loro numero. Asso più una carta da 10 nelle prime due carte è <b>blackjack</b> e paga <b>3 a 2</b>.</p>
<h3>Il giro</h3><p>Punta con le fiches (minimo 10, massimo 1.000) e premi <b>Distribuisci</b>. Ricevi due carte scoperte, il banco una scoperta e una coperta. Poi puoi:</p>
<ul><li><b>Carta</b>: chiedi un’altra carta</li><li><b>Stai</b>: ti fermi</li><li><b>Raddoppia</b>: raddoppi la puntata e ricevi una sola carta</li>
<li><b>Dividi</b>: con due carte dello stesso valore fai due mani (fino a quattro). Gli Assi divisi ricevono una carta sola ciascuno e non si ridividono; 21 dopo una divisione non è blackjack. Il raddoppio dopo la divisione è permesso.</li>
<li><b>Resa</b> (se attiva): con le prime due carte rinunci e riprendi metà della puntata</li></ul>
<p>Con un Asso scoperto il banco offre l’<b>assicurazione</b> (metà puntata, paga 2 a 1 se il banco ha blackjack). Con un Asso o un 10 scoperto il banco controlla subito se ha blackjack.</p>
<h3>Il banco</h3><p>Il banco gioca da regolamento: chiede carta fino a 16 e sta su 17. Con l’opzione <b>H17</b> chiede carta anche sul 17 <i>soft</i> (con un Asso contato 11). Si gioca con un <b>sabot da 6 mazzi</b> e la carta di taglio: quando esce, a fine mano si rimescola.</p>
<h3>Consiglio e conteggio</h3><p><b>Consiglio</b> mostra la mossa della strategia base per le regole del tavolo. L’allenamento al conteggio usa il metodo <b>Hi-Lo</b>: 2-6 valgono +1, 7-9 zero, 10 e Assi −1. Il conteggio vero è il conteggio diviso per i mazzi rimasti. Con il quiz, prima di ogni mano scegli il conteggio giusto.</p>`;

export default {
  ...meta,
  desc: 'Tu contro il banco con un sabot da 6 mazzi: raddoppio, divisione, assicurazione e resa. Consiglio della strategia base e allenamento al conteggio Hi-Lo. Fiches finte, solo per gioco.',
  players: [1, 1], decks: ['fr52'],
  thumb: ['1S', '13H', '10C'],
  options: [
    { id: 'banco', name: 'Il banco sul 17 soft', values: [{ v: 's17', label: 'Sta (S17)' }, { v: 'h17', label: 'Chiede (H17)' }], default: 's17' },
    { id: 'resa', name: 'Resa', values: [{ v: true, label: 'Sì' }, { v: false, label: 'No' }], default: true },
    { id: 'conta', name: 'Conteggio Hi-Lo', values: [{ v: 'off', label: 'No' }, { v: 'mostra', label: 'Mostra' }, { v: 'quiz', label: 'Allenamento (quiz)' }], default: 'off' },
  ],
  targets: [{ v: 20, label: '20 mani' }, { v: 50, label: '50 mani' }, { v: 0, label: 'Finché ho fiches' }],
  defaultTarget: 20,
  records: { banco: 'Banco massimo (finto)', vincita: 'Vincita in una mano', quiz: 'Quiz di conteggio giusti' },
  undo: false,
  setup, legalMoves: (s, p) => decorate(legalMoves(s, p)), apply, steps, ai, isOver, scores, view, status, nextDealer, matchOver, rules: RULES,
};
export { B as engine };
