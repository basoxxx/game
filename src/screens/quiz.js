// Quiz e Parole — one Baso Hub screen for the whole collection. The screen keeps the current view
// (home, quiz menu/play, sfida, parolina, impiccato, anagrammi, negozio) and hands it render / mount /
// keys / actions. Views live in src/quiz/views and keep their own state.
import { App, registerScreen } from '../app.js';
import { music } from '../ui/audio.js';
import { qzLoad } from '../quiz/store.js';
import { VIEWS } from '../quiz/views/index.js';
import '../quiz/quiz.css';

const V = { name: 'home', params: {}, inst: null, from: 'launcher', stack: [] };
const ctx = {
  App,
  go(name, params = {}, { replace = false } = {}) { if (!replace && V.name !== name) V.stack.push(V.name); V.name = name; V.params = params; App.refresh(); },
  back(to) { V.name = to || V.stack.pop() || 'home'; V.params = {}; if (to) V.stack = []; App.refresh(); },
  exitHub() { V.inst?.unmount?.(); V.inst = null; V.name = 'home'; V.stack = []; App.go(V.from === 'launcher' ? 'launcher' : V.from); },
  refresh() { App.refresh(); },
  get root() { return document.getElementById('qz-root'); },
};
// test hook (e2e): the current view and its state
window.__quiz = { ctx, get view() { return V.name; }, get inst() { return V.inst; } };

registerScreen({
  id: 'quiz', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.page) { const { page, ...rest } = params; delete params.page; V.name = VIEWS[page] ? page : 'home'; V.params = rest; V.stack = page === 'home' ? [] : ['home']; }
    V.inst?.unmount?.();
    const view = VIEWS[V.name] || VIEWS.home; V.inst = view;
    const d = qzLoad();
    let body;
    try { body = view.render(V.params, ctx); } catch (e) { console.error(e); body = `<div class="qz-panel"><h2>Qualcosa non va</h2><p>${String(e.message || e)}</p><button class="btn" data-a="qz-back" data-v="home">Torna al menu</button></div>`; }
    return `<div class="full-screen qz-root qz-t-${d.theme}" id="qz-root" data-view="${V.name}">${body}</div>`;
  },
  mount() {
    try { music.setMood?.('menu'); } catch {}
    const root = document.getElementById('qz-root');
    V.inst?.mount?.(root, V.params, ctx);
  },
  unmount() { V.inst?.unmount?.(); V.inst = null; },
  onKey(e) { V.inst?.onKey?.(e, ctx); },
  actions: {
    qz(el, e) {
      const n = el.dataset.do;
      if (n === 'go') { ctx.go(el.dataset.v, { ...el.dataset }); return; }
      if (n === 'exit' && !V.inst?.act) { ctx.back('home'); return; }
      V.inst?.act?.(n, el, ctx, e);
    },
    'qz-back'(el) { const to = el.dataset.v; if (to === 'hub') { ctx.exitHub(); return; } ctx.back(to || 'home'); },
  },
});
