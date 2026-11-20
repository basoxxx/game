// Piramide — Carte Baso plug-in (src/carte/README.md). Rules, solver and layout in
// ./solitari/pyramid.js; deal numbers, daily deal, undo, timer and hints in ./solitari/common.js.
import meta from './solitari-piramide.meta.js';
import * as P from './solitari/pyramid.js';
import { makeSolitaire, DEAL_OPTION } from './solitari/common.js';

const E = {
  key: 'piramide', scoreLabel: 'Punti',
  name: (eo) => `${eo.passes} ${eo.passes === 1 ? 'giro' : 'giri'} del mazzo`,
  variantKey: (eo) => `p${eo.passes}`,
  opts: (o) => ({ passes: +o.giri || 3 }),
  deal: P.deal, moves: P.moves, apply: P.apply, won: P.won, dead: P.dead, view: P.view, bonus: P.bonus,
  pick: (no, eo) => P.pick(no, eo, 3000),
  ai: (s) => P.greedy(s),
  plan(s, budget = 8000) { const r = P.solve(s, budget); return r.ok ? r.path : null; },
  heuristic: (s) => P.greedy(s),
  // tap: a king or a card with a single partner goes; with several partners the player picks one
  tapPick(s, ms) { return ms.length === 1 ? ms[0] : null; },
};

export default makeSolitaire(E, meta, {
  coins: 25,
  extra: {
    desc: 'Una piramide di 28 carte da smontare a coppie che fanno 13: il Re se ne va da solo, la Donna con l’Asso, il Fante con il Due. Aiutati con il mazzo, ma i giri sono contati.',
    thumb: ['13H', '12S', '1D'],
    variants: [],
    options: [DEAL_OPTION(true), { id: 'giri', name: 'Giri del mazzo', values: [{ v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3' }], default: 3 }],
    rules: `<h3>Scopo</h3><p>Togliere tutte le 28 carte della <b>piramide</b>.</p>
<h3>Le mosse</h3><ul><li>Si tolgono <b>coppie di carte libere che sommano 13</b>: Asso = 1, Fante = 11, Donna = 12. Quindi Donna + Asso, Fante + 2, 10 + 3, 9 + 4, 8 + 5, 7 + 6.</li>
<li>Il <b>Re</b> vale 13 e si toglie da solo.</li>
<li>Una carta della piramide è libera quando non ha più carte appoggiate sopra (le due della fila sotto).</li>
<li>Tocca il mazzo per girare una carta sugli scarti: la carta in cima agli scarti è libera e fa coppia con quelle della piramide.</li>
<li>Finito il mazzo lo si può rigirare, fino al numero di giri scelto (1, 2 o 3).</li></ul>
<h3>Comandi</h3><p>Trascina una carta sulla sua compagna, oppure tocca la prima e poi la seconda (se ha una sola compagna possibile la coppia si toglie subito). <b>Suggerimento</b> usa il risolutore; <b>Annulla</b> non ha limiti.</p>
<h3>Punteggio</h3><p>+10 per ogni coppia, +5 per ogni Re, +100 per la piramide sgombra più 10 per ogni carta rimasta nel mazzo e 25 per ogni giro non usato.</p>
<h3>Partite</h3><p><b>Casuale</b>: molte piramidi non si possono vincere. <b>Solo vincibili</b>: il risolutore la controlla prima. <b>Del giorno</b>: la stessa partita vincibile per tutti, cambia a mezzanotte.</p>`,
  },
});
