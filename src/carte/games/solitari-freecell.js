// FreeCell — Carte Baso plug-in (src/carte/README.md). Rules, solver and layout in
// ./solitari/freecell.js; deal numbers, daily deal, undo, timer and hints in ./solitari/common.js.
import meta from './solitari-freecell.meta.js';
import * as F from './solitari/freecell.js';
import { makeSolitaire } from './solitari/common.js';

const E = {
  key: 'freecell', scoreLabel: 'Punti',
  name: (eo) => (eo.classic ? 'Numerazione classica' : 'FreeCell'),
  variantKey: (eo) => (eo.classic ? 'classica' : ''),
  opts: (o) => ({ classic: o.numeri === 'classica' }),
  deal: F.deal, moves: F.moves, apply: F.apply, won: F.won, auto: F.auto, canFinish: F.canFinish, finish: F.finish, dead: F.dead, view: F.view,
  pick: (no, eo) => F.pick(no, eo, 12000),
  bonus: (s) => Math.max(0, 1000 - s.moves * 5) + (s.el > 30000 ? Math.round(300000 / (s.el / 1000)) : 300),
  ai: (s, r) => F.greedy(s, r),
  plan(s, budget = 30000) { const r = F.solve(s, budget); return r.ok ? F.planUI(s, r.path) : null; },
  heuristic: (s) => F.greedy(s, () => 0),
  // tap: foundation, then building on a column, then an empty column, then a free cell
  tapPick(s, ms) {
    const val = (m) => { const k = m.to[0]; if (k === 'f') return 100; if (k === 't') return s.t[+m.to.slice(1)].length ? 60 : 30; return 10 - +m.to.slice(1); };
    return ms.slice().sort((a, b) => val(b) - val(a))[0];
  },
};

export default makeSolitaire(E, meta, {
  coins: 25, alwaysPick: true,
  extra: {
    desc: 'Tutte le 52 carte sono scoperte in otto colonne: con l’aiuto di quattro celle libere bisogna portarle sulle fondazioni. Le partite numerate sono controllate dal risolutore: si possono vincere tutte.',
    thumb: ['1S', '13H', '12C'],
    options: [
      { id: 'partita', name: 'Partita', values: [{ v: 'casuale', label: 'Casuale (vincibile)' }, { v: 'giorno', label: 'Del giorno' }], default: 'casuale' },
      { id: 'numeri', name: 'Numerazione', values: [{ v: 'baso', label: 'Baso' }, { v: 'classica', label: 'Classica (Windows)' }], default: 'baso' },
    ],
    rules: `<h3>Scopo</h3><p>Portare tutte le carte sulle quattro <b>fondazioni</b> (a destra in alto), una per seme, dall’Asso al Re.</p>
<h3>Il tavolo</h3><p>Le 52 carte sono distribuite scoperte in otto colonne. In alto a sinistra ci sono quattro <b>celle libere</b>: ognuna può tenere una carta qualsiasi.</p>
<h3>Le mosse</h3><ul><li>Si sposta una carta alla volta: dall’ultima di una colonna o da una cella.</li>
<li>Nelle colonne si costruisce in <b>scala discendente a colori alterni</b>; in una colonna vuota va qualsiasi carta.</li>
<li>Una scala si può spostare tutta insieme se ci sono abbastanza celle e colonne vuote per farlo carta per carta: al massimo (celle libere + 1) × 2<sup>colonne vuote</sup> carte (metà se la destinazione è una colonna vuota).</li>
<li>Le carte che non servono più a nessuno vanno da sole sulle fondazioni; quando tutte le colonne sono in ordine il gioco si completa da solo.</li></ul>
<h3>Comandi</h3><p>Trascina le carte o <b>toccale</b>: vanno da sole nel posto migliore (fondazione, poi una colonna, poi una cella). <b>Suggerimento</b> usa il risolutore; <b>Annulla</b> non ha limiti.</p>
<h3>Partite</h3><p>Con la numerazione <b>Baso</b> ogni numero da 1 a 1.000.000 è una partita verificata dal risolutore: tutte vincibili. Con la numerazione <b>classica</b> le partite sono quelle storiche del FreeCell di Windows: la n° 11982 è la famosa partita impossibile (e con lei poche altre nel primo milione), che le partite casuali evitano. <b>Del giorno</b>: la stessa partita per tutti, cambia a mezzanotte.</p>
<h3>Punteggio</h3><p>+10 per ogni carta in fondazione; alla vittoria un bonus per le poche mosse e la velocità.</p>`,
  },
});
