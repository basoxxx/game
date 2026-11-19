// Blackjack basic strategy for a multi-deck shoe (4-8 decks), dealer stands or hits soft 17, double after
// split allowed or not, late surrender allowed or not. Codes: H hit, S stand, D double (else hit),
// X double (else stand), P split, R surrender (else hit; for hard 17 vs A in H17: else stand).
// Columns: dealer up card 2 3 4 5 6 7 8 9 10 A.
import { rank } from '../../core/cards.js';

export const cardValue = (c) => { const r = rank(c); return r === 1 ? 11 : r >= 10 ? 10 : r; };
// { total, soft } with aces counted as 11 when possible
export function handValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const r = rank(c); if (r === 1) { aces++; t += 1; } else t += r >= 10 ? 10 : r; }
  const soft = aces > 0 && t + 10 <= 21;
  return { total: soft ? t + 10 : t, soft };
}
export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

const HARD_S17 = {
  8: 'HHHHHHHHHH', 9: 'HDDDDHHHHH', 10: 'DDDDDDDDHH', 11: 'DDDDDDDDDH', 12: 'HHSSSHHHHH',
  13: 'SSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHRH', 16: 'SSSSSHHRRR', 17: 'SSSSSSSSSS',
};
const HARD_H17 = { ...HARD_S17, 11: 'DDDDDDDDDD', 15: 'SSSSSHHHRR', 17: 'SSSSSSSSSR' };
const SOFT_S17 = {
  13: 'HHHDDHHHHH', 14: 'HHHDDHHHHH', 15: 'HHDDDHHHHH', 16: 'HHDDDHHHHH', 17: 'HDDDDHHHHH',
  18: 'SXXXXSSHHH', 19: 'SSSSSSSSSS', 20: 'SSSSSSSSSS', 21: 'SSSSSSSSSS',
};
const SOFT_H17 = { ...SOFT_S17, 18: 'XXXXXSSHHH', 19: 'SSSSXSSSSS' };
const PAIRS_DAS = { 2: 'PPPPPPHHHH', 3: 'PPPPPPHHHH', 4: 'HHHPPHHHHH', 6: 'PPPPPHHHHH', 7: 'PPPPPPHHHH', 8: 'PPPPPPPPPP', 9: 'PPPPPSPPSS', 10: 'SSSSSSSSSS', 11: 'PPPPPPPPPP' };
const PAIRS_NODAS = { ...PAIRS_DAS, 2: 'HHPPPPHHHH', 3: 'HHPPPPHHHH', 4: 'HHHHHHHHHH', 6: 'HPPPPHHHHH' };
const col = (up) => { const v = cardValue(up); return v === 11 ? 9 : v - 2; };

// the raw table entry, before checking what is allowed
export function tableCode(cards, up, { h17 = false, das = true } = {}) {
  const c = col(up), { total, soft } = handValue(cards);
  if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])) {
    const pv = cardValue(cards[0]);
    const row = (das ? PAIRS_DAS : PAIRS_NODAS)[pv];
    if (row && row[c] === 'P') return 'P';
    // 8,8 vs A in H17 with surrender is a surrender spot in some charts; we keep the split (simpler and close)
  }
  if (soft && total === 12) return 'H';
  if (soft && total <= 21 && total >= 13) return (h17 ? SOFT_H17 : SOFT_S17)[total][c];
  if (total <= 8) return 'H';
  if (total >= 18) return 'S';
  return (h17 ? HARD_H17 : HARD_S17)[total][c];
}
// what to do given what the table allows right now: returns 'H' | 'S' | 'D' | 'P' | 'R'
export function basic(cards, up, rules = {}, allowed = { double: true, split: true, surrender: true }) {
  let code = tableCode(cards, up, rules);
  if (code === 'P' && !allowed.split) code = noSplit(cards, up, rules);
  if (code === 'R') { if (allowed.surrender && rules.surrender !== false) return 'R'; return handValue(cards).total >= 17 ? 'S' : 'H'; }
  if (code === 'D') return allowed.double ? 'D' : 'H';
  if (code === 'X') return allowed.double ? 'D' : 'S';
  return code;
}
// a pair that cannot be split is played as its total
function noSplit(cards, up, rules) {
  const { total, soft } = handValue(cards), c = col(up);
  if (soft && total === 12) return 'H';
  if (soft && total >= 13) return (rules.h17 ? SOFT_H17 : SOFT_S17)[total][c];
  if (total <= 8) return 'H'; if (total >= 18) return 'S';
  return (rules.h17 ? HARD_H17 : HARD_S17)[total][c];
}
export const ADVICE = { H: 'Chiedi carta', S: 'Stai', D: 'Raddoppia', P: 'Dividi', R: 'Arrenditi' };

// Hi-Lo card counting: 2-6 = +1, 7-9 = 0, 10-A = -1
export const hiLo = (c) => { const v = cardValue(c); return v <= 6 ? 1 : v >= 10 ? -1 : 0; };
export const runningCount = (cards) => cards.reduce((a, c) => a + hiLo(c), 0);
