// Solitario Klondike — Carte Baso plug-in (src/carte/README.md). Rules, solver and layout live in
// ./solitari/klondike.js; ./solitari/common.js adds deal numbers, daily deal, undo, timer, hints.
import meta from './solitari-klondike.meta.js';
import * as K from './solitari/klondike.js';
import { makeSolitaire, DEAL_OPTION } from './solitari/common.js';

const E = {
  key: 'klondike', scoreLabel: 'Punti',
  name: (eo) => (eo.draw === 3 ? 'Pesca 3' : 'Pesca 1'),
  variantKey: (eo) => `d${eo.draw}`,
  opts: (o) => ({ draw: o.variant === 'tre' ? 3 : 1 }),
  deal: K.deal, moves: K.moves, apply: K.apply, won: K.won, canFinish: K.canFinish, finish: K.finish, bonus: K.bonus, view: K.view,
  pick: (no, eo) => K.pick(no, eo, 8000),
  ai: (s) => K.greedy(s),
  // the solver's whole plan from here (UI moves), or null when it finds none within the budget
  plan(s, budget = 20000) { for (const b of [budget, budget * 4]) { const r = K.solve(K.toSolver(s), s.draw, b); if (r.ok) return K.planUI(s, r.path); if (r.exhausted) break; } return null; },
  heuristic: (s) => K.greedy(s),
  // the destination of a tapped card: foundation first, then a column (building on a card beats an
  // empty column), back from the foundation only when nothing else is possible
  tapPick(s, ms) {
    const val = (m) => {
      if (m.act) return 1; if (m.to[0] === 'f') return 100;
      const L = K.locate(s, m.card); if (L[0] === 'f') return -50;
      const dst = s.t[+m.to.slice(1)]; return dst.length ? 50 + dst.length : 10;
    };
    return ms.slice().sort((a, b) => val(b) - val(a))[0];
  },
};

export default makeSolitaire(E, meta, {
  coins: 25,
  extra: {
    desc: 'Il solitario per eccellenza: sette colonne da ordinare in scala alternando rosso e nero, quattro pile da completare dall’Asso al Re. Pesca una carta alla volta o tre, con annullamento illimitato, suggerimenti del risolutore e completamento automatico.',
    thumb: ['13S', '12H', '1D'],
    variants: [
      { id: 'uno', name: 'Pesca 1', desc: 'Si gira una carta alla volta dal mazzo.', players: [1, 1] },
      { id: 'tre', name: 'Pesca 3', desc: 'Si girano tre carte: si gioca solo quella in cima.', players: [1, 1] },
    ],
    options: [DEAL_OPTION(true)],
    rules: `<h3>Scopo</h3><p>Portare tutte le 52 carte sulle quattro <b>fondazioni</b>, una per seme, in ordine dall’Asso al Re.</p>
<h3>Il tavolo</h3><p>Sette colonne: la prima ha una carta, la settima sette; solo l’ultima di ogni colonna è scoperta. Le altre 24 carte formano il <b>mazzo</b>.</p>
<h3>Le mosse</h3><ul><li>Nelle colonne si costruisce in <b>scala discendente a colori alterni</b> (un 6 nero su un 7 rosso).</li>
<li>Si può spostare una carta scoperta insieme a tutte quelle sopra di essa.</li>
<li>In una colonna vuota può andare solo un <b>Re</b> (anche con la sua scala).</li>
<li>Quando in cima a una colonna resta una carta coperta, si gira.</li>
<li>Tocca il mazzo per girare una carta (<b>Pesca 1</b>) o tre (<b>Pesca 3</b>: si gioca solo quella in vista). Quando il mazzo finisce, toccalo per rigirare gli scarti: i giri sono illimitati.</li>
<li>Si può riprendere una carta dalla fondazione e rimetterla in colonna.</li></ul>
<h3>Comandi</h3><p>Trascina le carte, oppure <b>tocca</b> una carta: va da sola nel posto migliore (prima la fondazione). <b>Suggerimento</b> chiede la prossima mossa al risolutore; <b>Annulla</b> non ha limiti. Quando tutte le carte sono scoperte e il mazzo è finito, il gioco si completa da solo.</p>
<h3>Punteggio (standard, non Vegas)</h3><ul><li>Scarto → colonna: +5 · in fondazione: +10 · carta girata in colonna: +5</li><li>Dalla fondazione alla colonna: −15 · rigirare il mazzo: −100 (Pesca 1) o −20 (Pesca 3)</li><li>Alla vittoria, bonus tempo: 700.000 ÷ secondi di gioco (oltre i 30 secondi).</li></ul>
<h3>Partite</h3><p><b>Casuale</b>: qualsiasi mescolata (circa 8 su 10 si possono vincere). <b>Solo vincibili</b>: il risolutore controlla la partita prima di dartela. <b>Del giorno</b>: la stessa partita vincibile per tutti, cambia a mezzanotte. Ogni partita ha un numero: puoi rigiocarla o sceglierne una dal menu ⋯.</p>`,
  },
});
