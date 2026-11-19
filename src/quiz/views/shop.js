// Quiz e Parole — cosmetic themes bought with the coins earned by playing (no ads, no real money).
import { qzLoad, qzSave } from '../store.js';
import { THEMES, head, fmt, esc, play } from '../ui.js';

export default {
  render() {
    const d = qzLoad();
    return `<div class="qz-page">
      ${head({ title: 'Temi', sub: 'Ogni tema cambia colori e atmosfera di tutti e quattro i giochi. Le monete si guadagnano solo giocando: risposte giuste, parole indovinate, mongolfiere atterrate, anagrammi trovati.' })}
      <div class="qz-themes">${THEMES.map((t) => { const own = d.owned.includes(t.id), on = d.theme === t.id; return `<button class="qz-theme qz-t-${t.id} ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-a="qz" data-do="theme" data-v="${t.id}">
        <div class="qz-theme-prev"><i></i><i></i><i></i><b>Aa</b></div><b>${esc(t.name)}</b><span>${esc(t.desc)}</span><em>${on ? 'In uso' : own ? 'Usa' : `<span class="qz-coin"></span> ${fmt(t.cost)}`}</em></button>`; }).join('')}</div>
    </div>`;
  },
  mount(root) { requestAnimationFrame(() => root.querySelector('.qz-theme.on')?.focus({ preventScroll: true })); },
  act(n, el, ctx) {
    if (n !== 'theme') return;
    const id = el.dataset.v, t = THEMES.find((x) => x.id === id), d = qzLoad(); if (!t) return;
    const focus = () => requestAnimationFrame(() => document.querySelector(`.qz-theme[data-v="${id}"]`)?.focus({ preventScroll: true }));
    if (d.owned.includes(id)) { d.theme = id; qzSave(d); play('select'); ctx.refresh(); focus(); return; }
    if (d.coins < t.cost) { play('bad'); ctx.App.toast('Monete insufficienti', `Ti servono ancora ${fmt(t.cost - d.coins)} monete per «${t.name}».`, 'bad'); return; }
    ctx.App.confirm(`Sbloccare «${esc(t.name)}»?`, `Costa ${fmt(t.cost)} monete (ne hai ${fmt(d.coins)}).`, () => { const q = qzLoad(); if (q.coins < t.cost) return; q.coins -= t.cost; q.owned.push(id); q.theme = id; qzSave(q); play('coin'); ctx.refresh(); focus(); });
  },
};
