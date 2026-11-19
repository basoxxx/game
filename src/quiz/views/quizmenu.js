// Quiz — mode picker with categories and difficulty.
import { qzLoad, qzSave } from '../store.js';
import { CATS, DIFFS } from '../bank.js';
import { dateKey } from '../daily.js';
import { head, fmt, play } from '../ui.js';

export const QMODES = [
  { id: 'partita', name: 'Partita', icon: '⏱️', desc: '10 domande a tempo: più rispondi in fretta, più punti fai. Serie di risposte giuste = moltiplicatore.' },
  { id: 'sopravvivenza', name: 'Sopravvivenza', icon: '❤️', desc: 'Tre vite e domande sempre più difficili: fin dove arrivi?' },
  { id: 'sfida', name: 'Sfida 2-4 giocatori', icon: '🔔', desc: 'Sullo stesso schermo: chi prenota per primo risponde. Tastiera, controller o zone touch.' },
  { id: 'daily', name: 'Quiz del giorno', icon: '📅', desc: '10 domande uguali per tutti, una volta al giorno, con risultato da condividere.' },
];

export default {
  render() {
    const d = qzLoad(), sel = new Set(d.opts.cats || CATS.map((c) => c.id)), all = !d.opts.cats;
    const done = d.daily.key === dateKey();
    return `<div class="qz-page">
      ${head({ title: 'Quiz', sub: 'Oltre 1.300 domande originali in nove categorie e tre livelli, con la spiegazione di ogni risposta. Nessuna domanda si ripete finché non le hai viste tutte.' })}
      <div class="qz-modes">${QMODES.map((m) => `<button class="qz-mode" data-a="qz" data-do="mode" data-v="${m.id}"><span class="qz-mode-ic">${m.icon}</span><b>${m.name}</b><span>${m.desc}</span>${m.id === 'daily' && done ? '<em>Fatto oggi</em>' : ''}${m.id === 'sopravvivenza' && d.quiz.survBest ? `<em>Record ${d.quiz.survBest}</em>` : ''}${m.id === 'partita' && d.quiz.best ? `<em>Record ${fmt(d.quiz.best)}</em>` : ''}</button>`).join('')}</div>
      <section class="qz-sec"><h3>Categorie <small>${all ? 'tutte' : `${sel.size} di ${CATS.length}`}</small></h3>
        <div class="qz-chips">${CATS.map((c) => `<button class="qz-chip ${sel.has(c.id) ? 'on' : ''}" data-a="qz" data-do="cat" data-v="${c.id}" style="--c:${c.color}" aria-pressed="${sel.has(c.id)}">${c.icon} ${c.name}</button>`).join('')}<button class="qz-chip all ${all ? 'on' : ''}" data-a="qz" data-do="cat-all">Tutte</button></div>
        <p class="qz-note">Partita, Sopravvivenza e Sfida usano le categorie scelte; il Quiz del giorno le usa tutte.</p></section>
      <section class="qz-sec"><h3>Difficoltà</h3><div class="qz-seg">${DIFFS.map((x) => `<button class="${d.opts.diff === x.v ? 'on' : ''}" data-a="qz" data-do="diff" data-v="${x.v}">${x.name}</button>`).join('')}</div>
        <p class="qz-note">«Misto» parte dalle facili e sale; in Sopravvivenza il livello cresce comunque con le risposte.</p></section>
    </div>`;
  },
  mount(root) { requestAnimationFrame(() => root.querySelector('.qz-mode')?.focus({ preventScroll: true })); },
  act(n, el, ctx) {
    const d = qzLoad();
    if (n === 'mode') { const m = el.dataset.v; if (m === 'sfida') ctx.go('sfida'); else ctx.go('quizplay', { mode: m }); return; }
    if (n === 'cat') {
      const s = new Set(d.opts.cats || CATS.map((c) => c.id)), id = el.dataset.v;
      if (!d.opts.cats) { s.clear(); s.add(id); } else if (s.has(id)) { if (s.size > 1) s.delete(id); } else s.add(id);
      d.opts.cats = s.size === CATS.length ? null : CATS.map((c) => c.id).filter((x) => s.has(x));
      qzSave(d); play('select'); ctx.refresh(); refocus(`[data-do="cat"][data-v="${id}"]`); return;
    }
    if (n === 'cat-all') { d.opts.cats = null; qzSave(d); ctx.refresh(); refocus('[data-do="cat-all"]'); return; }
    if (n === 'diff') { d.opts.diff = +el.dataset.v; qzSave(d); ctx.refresh(); refocus(`[data-do="diff"][data-v="${d.opts.diff}"]`); }
  },
};
function refocus(sel) { requestAnimationFrame(() => document.querySelector(`#qz-root ${sel}`)?.focus({ preventScroll: true })); }
