// Spider — Carte Baso plug-in (src/carte/README.md). Rules, planner and layout in ./solitari/spider.js;
// deal numbers, daily deal, undo, timer and hints in ./solitari/common.js.
import meta from './solitari-spider.meta.js';
import * as P from './solitari/spider.js';
import { makeSolitaire, DEAL_OPTION } from './solitari/common.js';

const SUITS = { uno: 1, due: 2, quattro: 4 };
const E = {
  key: 'spider', scoreLabel: 'Punti',
  name: (eo) => `${eo.suits} ${eo.suits === 1 ? 'seme' : 'semi'}`,
  variantKey: (eo) => `s${eo.suits}`,
  opts: (o) => ({ suits: SUITS[o.variant] || 1 }),
  deal: P.deal, moves: P.moves, apply: P.apply, won: P.won, dead: P.dead, view: P.view,
  ai: (s) => P.greedy(s),
  // the planner's path towards the best position it can see (a whole solution when it finds one)
  plan(s, budget = 2500) { const r = P.plan(s, budget); return r.path.length ? r.path : null; },
  heuristic: (s) => P.greedy(s),
  // tap: onto the same suit, then onto any card, then an empty column
  tapPick(s, ms) {
    const val = (m) => {
      if (m.act) return 0; const dst = s.t[+m.to.slice(1)];
      if (!dst.length) return 5; const t = dst[dst.length - 1];
      return (t.replace(/^\d+/, '')[0] === m.card.replace(/^\d+/, '')[0] ? 50 : 20) + dst.length * 0.01;
    };
    return ms.slice().sort((a, b) => val(b) - val(a))[0];
  },
};

export default makeSolitaire(E, meta, {
  coins: 30, aiMoves: 250,
  extra: {
    desc: 'Due mazzi in dieci colonne: costruisci scale dal Re all’Asso dello stesso seme, che escono da sole dal tavolo. Con 1 seme è rilassante, con 4 è una sfida vera.',
    thumb: ['13S', '12S', '11H'],
    variants: [
      { id: 'uno', name: '1 seme', desc: 'Solo Picche: il più facile.', players: [1, 1] },
      { id: 'due', name: '2 semi', desc: 'Picche e Cuori.', players: [1, 1] },
      { id: 'quattro', name: '4 semi', desc: 'Il classico difficile.', players: [1, 1] },
    ],
    options: [DEAL_OPTION(false)],
    rules: `<h3>Scopo</h3><p>Formare otto scale complete <b>dal Re all’Asso dello stesso seme</b>: ogni scala completa esce dal tavolo da sola.</p>
<h3>Il tavolo</h3><p>104 carte (due mazzi): 54 in dieci colonne (le prime quattro con 6 carte, le altre con 5), solo l’ultima scoperta. Le altre 50 formano il mazzo, in cinque distribuzioni da dieci.</p>
<h3>Le mosse</h3><ul><li>Una carta va su una carta di valore <b>immediatamente superiore</b>, di qualsiasi seme.</li>
<li>Si possono spostare insieme più carte solo se formano una scala <b>dello stesso seme</b>.</li>
<li>In una colonna vuota va qualsiasi carta o scala.</li>
<li>Quando in cima a una colonna resta una carta coperta, si gira.</li>
<li>Tocca il mazzo per distribuire una carta su ogni colonna: si può solo se nessuna colonna è vuota.</li></ul>
<h3>Comandi</h3><p>Trascina le carte o <b>toccale</b>: vanno da sole sulla scala migliore (prima sullo stesso seme). <b>Suggerimento</b> esplora le mosse in avanti e propone la più promettente; <b>Annulla</b> non ha limiti.</p>
<h3>Punteggio</h3><p>Si parte da 500: −1 per ogni mossa (anche le distribuzioni), +100 per ogni scala completata.</p>
<h3>Partite</h3><p>Ogni partita ha un numero (sempre la stessa mescolata). <b>Del giorno</b>: la stessa partita per tutti, cambia a mezzanotte.</p>`,
  },
});
