import { icon } from './ui/icons.js';
import { teamBadge, logoMark, luminance } from './ui/art.js';
import { esc } from './ui/dom.js';
import { sfx } from './ui/audio.js';
import { S, saveGame } from './engine/state.js';
import { fmtM, playerTeam, cat } from './engine/season.js';

const screens = {};
export function registerScreen(s) { screens[s.id] = s; }

const NAV = [
  { id: 'hub', name: 'Panoramica', icon: 'home' },
  { id: 'inbox', name: 'Posta', icon: 'mail' },
  { id: 'car', name: 'Centro Tecnico', icon: 'car' },
  { id: 'drivers', name: 'Piloti', icon: 'users' },
  { id: 'market', name: 'Mercato', icon: 'market' },
  { id: 'staff', name: 'Staff & Strutture', icon: 'factory' },
  { id: 'finance', name: 'Sponsor & Finanze', icon: 'money' },
  { id: 'standings', name: 'Classifiche', icon: 'trophy' },
  { id: 'calendar', name: 'Calendario', icon: 'calendar' },
  { id: 'career', name: 'Carriera', icon: 'star' },
];

export const App = {
  cur: null, params: {}, modalActions: null,
  root: null,
  init() {
    this.root = document.getElementById('app');
    document.addEventListener('click', (e) => this.onEvent(e, 'click'));
    document.addEventListener('input', (e) => this.onEvent(e, 'input'));
    document.addEventListener('change', (e) => this.onEvent(e, 'change'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('.modal-wrap')) this.closeModal();
      const s = screens[this.cur];
      s?.onKey?.(e);
      if (e.key === 'F11' && window.apex?.toggleFullscreen) { e.preventDefault(); window.apex.toggleFullscreen(); }
    });
    document.addEventListener('mouseover', (e) => { const b = e.target.closest?.('.menu-item, .nav'); if (b && b !== this._lastHover) { this._lastHover = b; sfx.hover(); } });
  },
  onEvent(e, type) {
    const attr = type === 'click' ? 'data-a' : type === 'input' ? 'data-input' : 'data-change';
    const el = e.target.closest?.(`[${attr}]`);
    if (!el) return;
    const name = el.getAttribute(attr);
    if (type === 'click') sfx.click();
    if (name === 'nav') { this.go(el.dataset.to, { ...el.dataset }); return; }
    if (name === 'close-modal') { this.closeModal(); return; }
    const handlers = (document.querySelector('.modal-wrap') && this.modalActions) || screens[this.cur]?.actions || {};
    const fn = handlers[name] || screens[this.cur]?.actions?.[name] || globalActions[name];
    if (fn) fn.call(screens[this.cur], el, e);
  },
  go(id, params = {}) {
    const prev = screens[this.cur];
    prev?.unmount?.();
    this.cur = id; this.params = params;
    this.closeModal();
    this.render();
  },
  render() {
    const s = screens[this.cur];
    if (!s) return;
    const st = S();
    if (st) {
      const t = playerTeam(st);
      document.documentElement.style.setProperty('--team', teamColor(t.car.livery));
      document.documentElement.style.setProperty('--team2', t.car.livery.secondary);
    }
    const scrollY = this.root.querySelector('.main')?.scrollTop || 0;
    const same = this._lastRendered === this.cur;
    if (s.full) this.root.innerHTML = `<div class="bg-layer"></div>${s.render(this.params)}`;
    else this.root.innerHTML = `<div class="bg-layer"></div>${this.shell(s.render(this.params))}`;
    if (same) { const m = this.root.querySelector('.main'); if (m) m.scrollTop = scrollY; }
    this._lastRendered = this.cur;
    s.mount?.(this.root, this.params);
    if (st?._toast) { this.toast(st._toast.title, st._toast.text, 'good'); sfx.win(); st._toast = null; }
  },
  refresh() { this.render(); },
  shell(content) {
    const st = S();
    const t = playerTeam(st);
    const C = cat(st);
    const unread = st.inbox.filter((m) => !m.read).length;
    const ev = st.calendar[st.round];
    const seasonOver = st.round >= st.calendar.length;
    const conf = st.board.confidence;
    return `<div class="shell">
      <div class="topbar">
        <div class="brand">${logoMark(30)}<div>Apex Dynasty<small>${esc(C.name)}</small></div></div>
        <div class="tb-team">${teamBadge(t, 30)}<div><b style="font-family:var(--display)">${esc(t.name)}</b><div class="tiny muted">${esc(st.playerName)} · Team Principal</div></div></div>
        <div class="tb-stat"><b>${st.season}</b><span>Stagione</span></div>
        <div class="tb-stat"><b>${seasonOver ? 'Fine' : `${st.round + 1}/${st.calendar.length}`}</b><span>Round</span></div>
        <div class="tb-stat"><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><span>Budget</span></div>
        <div class="tb-stat"><b class="${conf < 30 ? 'bad' : conf > 70 ? 'good' : ''}">${conf}%</b><span>Fiducia CdA</span></div>
        <div class="grow"></div>
        <button class="btn icon-btn ghost" data-a="quick-save" title="Salva">${icon('save')}</button>
        <button class="btn icon-btn ghost" data-a="nav" data-to="settings" title="Impostazioni">${icon('settings')}</button>
        <button class="btn primary lg ${seasonOver || st.phase === 'preseason' ? '' : ''}" data-a="continue">${seasonOver ? 'Fine Stagione' : st.weekend ? 'Torna al Weekend' : 'Weekend di Gara'} ${icon('right')}</button>
      </div>
      <div class="sidebar">
        ${NAV.map((n) => `<div class="nav ${this.cur === n.id ? 'active' : ''}" data-a="nav" data-to="${n.id}">${icon(n.icon)}<span>${n.name}</span>${n.id === 'inbox' && unread ? `<span class="badge">${unread}</span>` : ''}</div>`).join('')}
        <div class="nav-sep"></div>
        <div class="nav" data-a="to-menu">${icon('logout')}<span>Menu Principale</span></div>
        <div class="grow"></div>
        ${ev ? `<div class="panel tight small" style="margin-top:10px"><div class="tiny muted upper">Prossimo evento</div><div style="font-weight:700;margin-top:4px">${esc(trackName(st, ev))}</div></div>` : ''}
      </div>
      <div class="main">${content}</div>
    </div>`;
  },
  modal(html, actions = {}, cls = '') {
    this.closeModal();
    this.modalActions = actions;
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    w.addEventListener('mousedown', (e) => { if (e.target === w && !cls.includes('locked')) this.closeModal(); });
    document.body.appendChild(w);
    actions.mount?.(w);
    return w;
  },
  closeModal() { document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()); this.modalActions = null; },
  toast(title, text = '', type = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<b>${title}</b><div class="small muted">${text}</div>`;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .4s, transform .4s'; t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; }, 3600);
    setTimeout(() => t.remove(), 4100);
  },
  confirm(title, text, onYes, yesLabel = 'Conferma', danger = false) {
    this.modal(`<h2>${title}</h2><p class="muted">${text}</p><div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${yesLabel}</button></div>`, { yes: () => { this.closeModal(); onYes(); } });
  },
};

import { getTrack } from './engine/world.js';
export function trackName(st, ev) { return getTrack(st.category, ev.trackId)?.name || ev.trackId; }

const globalActions = {
  'quick-save'() { if (saveGame()) { App.toast('Partita salvata', `Slot ${S().slot}`, 'good'); sfx.ok(); } else App.toast('Salvataggio fallito', '', 'bad'); },
  'to-menu'() { App.confirm('Tornare al menu?', 'La partita verrà salvata automaticamente.', () => { saveGame(); App.go('menu'); }); },
  continue() {
    const st = S();
    if (st.round >= st.calendar.length) { App.go('seasonend'); return; }
    App.go(st.category === 'rally' ? 'rally' : 'weekend');
  },
};

export function teamColor(L) {
  const ok = (c) => { const l = luminance(c); return l > 0.16 && l < 0.82; };
  for (const c of [L.primary, L.secondary, L.accent]) if (c && ok(c)) return c;
  return '#e10600';
}
