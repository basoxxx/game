import { icon } from './ui/icons.js';
import { teamBadge, logoMark, luminance, flagSVG, trackSVG } from './ui/art.js';
import { esc } from './ui/dom.js';
import { sfx, music, setAudioScene, AUDIO_BUSES, applyVolumes } from './ui/audio.js';
import { S, saveGame, getSettings, setSettings } from './engine/state.js';
import { initGamepad, moveFocus, rumble } from './ui/gamepad.js';
import { maybeTour } from './ui/tour.js';
import { fmtM, playerTeam, cat } from './engine/season.js';
import { trackArt } from './ui/trackart.js';
import { disposeStage, freezeStage } from './ui/stage3d.js';
import { installSaveGuard, rescueSnapshot } from './ui/savesafe.js';
import { openPalette } from './ui/palette.js';
import { applyAccessibility } from './ui/a11y.js';

const screens = {};
export function registerScreen(s) { screens[s.id] = s; }
export const hasScreen = (id) => !!screens[id];

// ---- code-split screens: id -> () => import(...). Registered by main.js.
const loaders = {};
export function lazyScreens(map) { Object.assign(loaders, map); }
const loadAll = () => Promise.all([...new Set(Object.values(loaders))].map((f) => f()));
export function loadScreen(id) { return screens[id] ? Promise.resolve() : (loaders[id] || loadAll)(); }
// warm the chunks one after the other so they never fight the player for the main thread
export function preloadScreens(ids) { return ids.reduce((p, id) => p.then(() => (screens[id] ? null : loaders[id]?.())), Promise.resolve()); }

// Sidebar: flat order = number shortcuts (1…0), groups only add headings.
export const NAV_GROUPS = [
  ['Sede', ['hub', 'inbox']],
  ['Squadra', ['car', 'drivers', 'market', 'staff', 'finance']],
  ['Campionato', ['paddock', 'standings', 'calendar']],
  ['Carriera', ['career', 'halloffame']],
];
export const NAV = [
  { id: 'hub', name: 'Panoramica', icon: 'home' },
  { id: 'inbox', name: 'Posta', icon: 'mail' },
  { id: 'car', name: 'Centro Tecnico', icon: 'car' },
  { id: 'drivers', name: 'Piloti', icon: 'users' },
  { id: 'market', name: 'Mercato', icon: 'market' },
  { id: 'staff', name: 'Staff & Strutture', icon: 'factory' },
  { id: 'finance', name: 'Sponsor & Finanze', icon: 'money' },
  { id: 'paddock', name: 'Paddock', icon: 'news' },
  { id: 'standings', name: 'Classifiche', icon: 'chart' },
  { id: 'calendar', name: 'Calendario', icon: 'calendar' },
  { id: 'career', name: 'Carriera', icon: 'star' },
  { id: 'halloffame', name: 'Albo d’oro', icon: 'trophy' },
];

export const App = {
  cur: null, params: {}, modalActions: null,
  root: null,
  init() {
    this.root = document.getElementById('app');
    document.addEventListener('click', (e) => this.onEvent(e, 'click'));
    document.addEventListener('input', (e) => this.onEvent(e, 'input'));
    document.addEventListener('change', (e) => this.onEvent(e, 'change'));
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest?.('.menu-item, .nav, .qr-track, .dz-venue, .dz-car, .cat-card, .team-card, .ch-card');
      if (b && b !== this._lastHover) { this._lastHover = b; sfx.hover(); if (b.classList.contains('menu-item') && document.activeElement !== b) b.focus({ preventScroll: true }); }
    });
    initTooltips();
    initGamepad(this);
    try { if (JSON.parse(localStorage.getItem('apexdynasty_settings') || '{}').reduceMotion) document.documentElement.classList.add('reduce-motion'); } catch {}
    applyAccessibility();
    // big moments are felt on the controller too
    for (const [k, a, ms] of [['win', 0.8, 420], ['levelup', 0.5, 260], ['error', 0.6, 160]]) { const f = sfx[k]; if (f) sfx[k] = (...x) => { rumble(a, ms); return f(...x); }; }
    installSaveGuard({ saved: () => this.savePulse(), full: () => this.toast('Memoria piena', 'Non c’è più spazio per i salvataggi: esporta la partita o elimina uno slot dal menu Carica.', 'bad') });
    // error boundary: anything uncaught gets a friendly recover dialog (the save on disk is never touched)
    window.addEventListener('error', (e) => { if (e.error || e.message) this.crash(e.error || e.message); });
    window.addEventListener('unhandledrejection', (e) => this.crash(e.reason));
    // the 3D backdrop rests while the game is in the background
    window.addEventListener('blur', () => freezeStage(true));
    window.addEventListener('focus', () => freezeStage(false));
  },
  // ---- autosave indicator: a small pill that pulses whenever a save slot is written
  savePulse() {
    let el = document.querySelector('.save-pill');
    if (!el) { el = document.createElement('div'); el.className = 'save-pill'; el.setAttribute('role', 'status'); el.innerHTML = `${icon('save')}<span>Salvato</span>`; document.body.appendChild(el); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._saveT); this._saveT = setTimeout(() => el.classList.remove('on'), 1600);
  },
  // ---- global error boundary
  crash(err) {
    const msg = String(err?.message || err || 'Errore sconosciuto');
    if (/ResizeObserver loop|Script error\.?$/i.test(msg)) return;
    console.warn('[apex] errore intercettato', err);
    const now = Date.now();
    if (this._crashAt && now - this._crashAt < 4000) return; // one dialog for a burst of errors
    this._crashAt = now; this.crashed = true;
    const rescued = rescueSnapshot();
    document.querySelector('.load-screen')?.remove(); document.querySelector('.busy-veil')?.remove();
    const stack = esc(String(err?.stack || msg).split('\n').slice(0, 6).join('\n'));
    this.modal(`<div class="crash">
      <div class="crash-ic">${icon('alert')}</div>
      <div class="tiny upper muted" style="letter-spacing:.3em">Bandiera rossa</div>
      <h2>Qualcosa è andato storto</h2>
      <p class="muted">Il gioco ha incontrato un errore imprevisto. ${S() ? `I salvataggi sul disco non sono stati toccati${rescued ? ' e una copia di emergenza della partita in corso è stata messa al sicuro' : ''}.` : 'Nessun salvataggio è stato modificato.'}</p>
      <details class="crash-details"><summary>Dettagli tecnici</summary><pre>${stack}</pre></details>
      <div class="row mt24 crash-actions">
        <button class="btn ghost" data-a="crash-retry">${icon('replay')} Riprova</button>
        ${S() ? `<button class="btn" data-a="crash-menu">${icon('save')} Salva e torna al menu</button>` : `<button class="btn" data-a="crash-menu">${icon('home')} Menu principale</button>`}
        <button class="btn primary" data-a="crash-reload">${icon('reset')} Ricarica il gioco</button>
      </div></div>`, {
      'crash-retry': () => { this.crashed = false; this.closeModal(); try { this.render(); } catch (e) { this.crash(e); } },
      'crash-menu': () => { this.crashed = false; this.closeModal(); try { if (S()) saveGame(); } catch {} this.go('menu'); },
      'crash-reload': () => location.reload(),
    }, 'crash-modal');
    try { sfx.error?.(); } catch {}
  },
  onKeyDown(e) {
    const modal = document.querySelector('.modal-wrap');
    if (document.querySelector('.tour-mask')) return; // the guided tour owns the keyboard
    const np = document.querySelector('.notes-panel');
    if (e.key === 'Escape' && np) { np.remove(); return; }
    if (e.key === 'Escape' && modal) { if (!modal.querySelector('.modal.locked')) this.closeModal(); return; }
    // keep Tab inside an open dialog
    if (e.key === 'Tab' && modal) {
      const f = [...modal.querySelectorAll('button:not([disabled]), [data-a], input, select, [tabindex="0"]')].filter((x) => x.offsetParent);
      if (f.length) { const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } else if (i < 0) { e.preventDefault(); f[0].focus(); } }
      return;
    }
    if (e.key === 'Escape' && !modal) { const back = document.querySelector('.ph-back'); if (back) { e.preventDefault(); back.click(); return; } if (S() && !screens[this.cur]?.full && this.cur !== 'hub' && !e.target?.closest?.('input, textarea, select')) { e.preventDefault(); this.back(); return; } }
    if (e.key === 'F11' && window.apex?.toggleFullscreen) { e.preventDefault(); window.apex.toggleFullscreen(); return; }
    // command palette: jump anywhere
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !modal && this.cur !== 'intro') { e.preventDefault(); openPalette(this); return; }
    const tgt = e.target;
    const typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable);
    // Keyboard activation of clickable non-button elements (cards, tabs, nav items...)
    if (!typing && (e.key === 'Enter' || e.key === ' ') && tgt?.matches?.('[data-a]:not(button):not(input):not(select)')) { e.preventDefault(); tgt.click(); return; }
    // Arrow navigation in vertical menus
    if (!typing && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const list = [...document.querySelectorAll(modal ? '.modal-wrap .card.click, .modal-wrap .menu-item' : '.menu-list .menu-item:not(.disabled)')];
      if (list.length) {
        e.preventDefault();
        const i = list.indexOf(document.activeElement);
        const n = i < 0 ? (e.key === 'ArrowDown' ? 0 : list.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        list[n].focus(); sfx.hover();
        return;
      }
    }
    // spatial arrow navigation between buttons/cards (not while driving, not inside sliders)
    const spatial = (k) => !typing && k.startsWith('Arrow') && !document.querySelector('.dz-root canvas') && document.activeElement && document.activeElement !== document.body && tgt?.type !== 'range';
    if (modal) { if (spatial(e.key) && !e.altKey) { e.preventDefault(); moveFocus(e.key.slice(5).toLowerCase()); } return; }
    if (typing) return;
    const s = screens[this.cur];
    s?.onKey?.(e);
    if (e.defaultPrevented) return;
    if (spatial(e.key) && !e.altKey && !e.ctrlKey && document.activeElement?.matches?.('button, [data-a], [tabindex="0"]')) { if (moveFocus(e.key.slice(5).toLowerCase())) { e.preventDefault(); return; } }
    if (e.key === 'F1') { e.preventDefault(); if (this.cur !== 'howto') this.go('howto', { back: this.cur }); return; }
    if (e.key === '?') { e.preventDefault(); this.shortcuts(); return; }
    // Management shell shortcuts
    if (S() && !s?.full) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); globalActions['quick-save'](); return; }
      if ((e.altKey && e.key === 'ArrowLeft') || e.key === 'Backspace') { e.preventDefault(); this.back(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const m = /^Digit(\d)$/.exec(e.code);
      if (m) { const n = NAV[(+m[1] + 9) % 10]; if (n && n.id !== this.cur) { sfx.click(); this.go(n.id); } return; }
      if (e.key === 'Enter' && !tgt?.closest?.('button, [data-a]')) { sfx.click(); globalActions.continue(); }
    }
  },
  shortcuts() {
    const k = (x) => x.split('+').map((p) => `<span class="kbd">${p}</span>`).join(' + ');
    const rows = (list) => list.map(([a, b]) => `<div class="row between small" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="muted">${b}</span><span>${a.split(' / ').map(k).join(' <span class="dim">/</span> ')}</span></div>`).join('');
    this.modal(`<div class="tiny upper muted" style="letter-spacing:.3em">Comandi rapidi</div><h2 style="font-style:italic">Tastiera e controller</h2>
      <div class="grid2 mt16" style="gap:28px;align-items:start">
        <div><h3 class="mb8" style="font-size:13px">Gestione</h3>${rows([['1 / 2 / … / 0', 'Sezioni del menu laterale'], ['Invio', 'Vai al weekend di gara'], ['Ctrl+S', 'Salvataggio rapido'], ['Ctrl+K', 'Cerca e vai a qualsiasi schermata'], ['Backspace / Alt+←', 'Indietro'], ['Tab / Invio', 'Muoviti e attiva senza mouse'], ['↑ / ↓', 'Scorri le voci del menu'], ['Esc', 'Chiudi finestra'], ['?', 'Mostra questo pannello']])}</div>
        <div><h3 class="mb8" style="font-size:13px">In gara</h3>${rows([['Spazio', 'Pausa / riprendi'], ['1 / 2 / 3', 'Velocità 1x · 2x · 4x'], ['4 / 5 / 6', 'Velocità 8x · 16x · 32x'], ['R', 'Replay dell’ultima azione (3D)'], ['1 / 2 / 3', 'Scelta nei momenti chiave'], ['F1', 'Guida “Come si gioca”']])}</div>
      </div>
      <h3 class="mb8 mt24" style="font-size:13px">${icon('gamepad')} Controller</h3>
      <div class="pad-map">${[['A', 'Seleziona'], ['B', 'Indietro / chiudi'], ['X', 'Pausa in gara'], ['Y', 'Questo pannello'], ['LB RB', 'Sezione precedente / successiva'], ['Start', 'Continua al weekend'], ['Croce / Stick', 'Muovi la selezione'], ['Stick destro', 'Scorri la pagina']].map(([k, d]) => `<div><span class="pad-btn">${k}</span><span class="muted small">${d}</span></div>`).join('')}</div>
      <div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Ho capito</button></div>`, {}, 'wide');
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
    // code-split screen not here yet: keep the current one on screen until its chunk arrives
    if (!screens[id]) {
      this._want = id;
      let veil = null; const t = setTimeout(() => { veil = this.busy('Caricamento'); }, 140);
      const end = () => { clearTimeout(t); veil?.(); };
      loadScreen(id).then(() => {
        end();
        if (this._want !== id) return;
        this._want = null;
        if (screens[id]) this.go(id, params); else this.crash(new Error(`Schermata sconosciuta: ${id}`));
      }, (e) => { end(); this._want = null; this.crash(e); });
      return;
    }
    this._want = null;
    const prev = screens[this.cur];
    // history for Indietro (Backspace / Alt+←): management screens only
    if (prev && !prev.full && prev.id !== id && !params._back) { this.history.push({ id: prev.id, params: this.params }); if (this.history.length > 30) this.history.shift(); }
    if (screens[id]?.full) this.history.length = 0;
    prev?.unmount?.();
    // the live race views own a WebGL context of their own: hand ours back before they start
    if (id === 'weekend' || id === 'rally' || id === 'derby' || id === 'voragine') disposeStage();
    this.cur = id; this.params = params;
    this.closeModal();
    document.querySelector('.coach')?.remove();
    setAudioScene(id);
    const mood = { intro: 'menu', menu: 'menu', newgame: 'menu', howto: S() ? 'manage' : 'menu', settings: S() ? 'manage' : 'menu', weekend: null, rally: null, results: 'win', seasonend: 'win', quickrace: 'menu', challenges: 'menu', derby: 'derby', launcher: 'menu', voragine: 'derby' }[id];
    if (mood !== null) music.setMood(mood || 'manage');
    else if (music.mood === 'menu' || music.mood === 'win') music.setMood('manage'); // paddock before the lights go out
    if (prev && prev.id !== id) this.wipe();
    this.render();
  },
  // Visual screen wipe: a slanted livery slab sweeps across. Never blocks input or delays rendering.
  wipe() {
    if (document.documentElement.classList.contains('reduce-motion')) return;
    document.querySelector('.wipe')?.remove();
    const w = document.createElement('div');
    w.className = 'wipe'; w.innerHTML = '<i></i><i></i>';
    document.body.appendChild(w);
    try { sfx.whoosh?.(); } catch {}
    setTimeout(() => w.remove(), 700);
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
    const scroller = () => this.root.querySelector('.main') || this.root.querySelector('.full-screen');
    const scrollY = scroller()?.scrollTop || 0;
    const same = this._lastRendered === this.cur;
    let body;
    try { body = s.render(this.params); } catch (e) {
      // a screen that cannot draw itself shows a deliberate error state instead of a blank page
      console.warn('[apex] render', this.cur, e);
      body = `<div class="state-box state-error">${icon('alert')}<h2>Impossibile mostrare questa schermata</h2><p class="muted">Si è verificato un errore durante il disegno di «${esc(this.cur)}». La partita è al sicuro.</p><div class="row mt16" style="justify-content:center"><button class="btn" data-a="nav" data-to="${S() ? 'hub' : 'menu'}">${icon('home')} ${S() ? 'Panoramica' : 'Menu principale'}</button><button class="btn primary" data-a="crash-reload-now">${icon('reset')} Ricarica</button></div></div>`;
      setTimeout(() => this.crash(e));
    }
    if (s.full) this.root.innerHTML = `<div class="bg-layer"></div>${s.full && body.startsWith('<div class="state-box') ? `<div class="full-screen">${body}</div>` : body}`;
    else {
      try { this.root.innerHTML = `<div class="bg-layer"></div>${this.shell(body)}`; } catch (e) { console.warn('[apex] shell', e); this.root.innerHTML = `<div class="bg-layer"></div><div class="full-screen">${body}</div>`; }
    }
    if (same) { const m = scroller(); if (m) m.scrollTop = scrollY; }
    else {
      // entrance animation only when the screen actually changes (never on refresh)
      const m = this.root.querySelector('.main');
      if (m) m.classList.add('enter');
      else this.root.children[1]?.classList.add('screen-enter');
      document.querySelector('.tip')?.classList.remove('on');
    }
    this._lastRendered = this.cur;
    makeFocusable(this.root);
    try { s.mount?.(this.root, this.params); } catch (e) { console.warn('[apex] mount', this.cur, e); this.crash(e); }
    if (!same) { try { maybeTour(this.cur); } catch (e) { console.warn(e); } }
    if (st?._toast) { this.toast(st._toast.title, st._toast.text, 'good'); sfx.win(); st._toast = null; }
    if (st?._levelUp) { this.toast(`Livello manager ${st._levelUp}!`, 'Hai ottenuto un punto abilità: spendilo in Carriera.', 'good'); sfx.levelup(); st._levelUp = null; }
  },
  refresh() { this.render(); },
  history: [],
  back() {
    const h = this.history.pop();
    if (h) { sfx.click(); this.go(h.id, { ...h.params, _back: 1 }); return true; }
    if (S() && this.cur !== 'hub' && !screens[this.cur]?.full) { sfx.click(); this.go('hub', { _back: 1 }); return true; }
    return false;
  },
  // To-do items for the hub inbox and the sidebar badges ([level, text, 'screen' | 'screen:tab']).
  // The career chunk installs the provider; the shell only counts.
  todoProvider: null,
  todo(st = S()) { try { return (st && this.todoProvider?.(st)) || []; } catch (e) { console.warn('todo', e); return []; } },
  shell(content) {
    const st = S();
    const t = playerTeam(st);
    const C = cat(st);
    const unread = st.inbox.filter((m) => !m.read).length;
    const ev = st.calendar[st.round];
    const seasonOver = st.round >= st.calendar.length;
    const conf = st.board.confidence;
    const tr = ev ? getTrack(st.category, ev.trackId) : null;
    const confCol = conf < 30 ? 'var(--bad)' : conf > 70 ? 'var(--good)' : 'var(--warn)';
    const navKey = (i) => (i < 10 ? `<span class="nav-key" aria-hidden="true">${(i + 1) % 10}</span>` : '');
    // sidebar badges from the to-do list: count per screen, coloured by the most urgent item
    const rank = { bad: 3, warn: 2, good: 1, info: 0 };
    const badges = {};
    for (const [lvl, , to] of this.todo(st)) { const id = String(to).split(':')[0]; const b = (badges[id] ||= [0, 'info']); b[0]++; if (rank[lvl] > rank[b[1]]) b[1] = lvl; }
    const here = NAV.find((n) => n.id === this.cur), grp = NAV_GROUPS.find(([, ids]) => ids.includes(this.cur))?.[0];
    const crumbs = `<nav class="crumbs" aria-label="Percorso">
      ${this.history.length || (this.cur !== 'hub' && here) ? `<button class="crumb-back" data-a="go-back" aria-label="Indietro" data-tip="Indietro (Backspace)">${icon('left')}</button>` : ''}
      ${grp ? `<span class="crumb" data-a="nav" data-to="${NAV_GROUPS.find((g) => g[0] === grp)[1][0]}">${grp}</span><i>/</i>` : ''}<b>${esc(here?.name || this.cur)}</b>
      <span class="grow"></span>
      <button class="crumb-search" data-a="palette" aria-label="Cerca e vai a… (Ctrl+K)">${icon('compass')}<span>Vai a…</span><span class="kbd">Ctrl</span><span class="kbd">K</span></button>
    </nav>`;
    let mini = '';
    if (tr && st.category !== 'rally') { try { mini = trackSVG(circuitPath(tr.cid), { w: 120, h: 80, glow: null, color: '#fff', width: 4, start: false }); } catch {} }
    return `<div class="shell">
      <div class="topbar">
        <div class="tb-livery"></div>
        <div class="brand">${logoMark(28)}<div>Apex Dynasty<small>${esc(C.name)}</small></div></div>
        <div class="tb-team" data-tip="${esc(t.name)} · ${esc(C.full || C.name)}">${teamBadge(t, 36)}<div><b>${esc(t.name)}</b><span class="tb-sub">${esc(st.playerName)} · Team Principal</span></div></div>
        <div class="tb-stats">
          <div class="tb-stat tb-opt"><b>${st.season}</b><span>Stagione</span></div>
          <div class="tb-stat" data-tip="Evento attuale del calendario"><b>${seasonOver ? 'Fine' : `${st.round + 1}<small style="font-size:15px;color:var(--muted)">/${st.calendar.length}</small>`}</b><span>Round</span></div>
          <div class="tb-stat" data-tip="Liquidità della squadra. Entrate: diritti commerciali, sponsor e premi. Uscite: stipendi, logistica, R&amp;D e strutture."><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><span>Budget</span></div>
          <div class="tb-stat" data-tip="Fiducia del consiglio (obiettivo: ${st.board.target}° tra i costruttori). Se crolla rischi il licenziamento."><b style="color:${confCol}">${conf}%</b><span>Fiducia CdA</span><div class="tb-meter"><i style="width:${conf}%;background:${confCol}"></i></div></div>
          <div class="tb-stat" style="cursor:pointer" data-a="nav" data-to="career" data-tip="Livello manager: guadagni XP con risultati e obiettivi.${st.career.points ? ` Hai ${st.career.points} punti abilità da spendere!` : ''}"><b>Lv ${st.career.level || 1}${st.career.points ? ` <span class="badge">+${st.career.points}</span>` : ''}</b><span>Manager</span></div>
        </div>
        <div class="grow"></div>
        <div class="tb-actions">
          <button class="btn icon-btn ghost tb-notes" data-a="notes" data-tip="Centro notifiche" aria-label="Notifiche">${icon('bell')}${this.unreadNotes() ? `<span class="badge">${this.unreadNotes()}</span>` : ''}</button>
          <button class="btn icon-btn ghost" data-a="mixer" data-tip="Audio: musica, motori, effetti" aria-label="Audio">${icon(getSettings().sound === false && getSettings().music === false ? 'mute' : 'volume')}</button>
          <button class="btn icon-btn ghost" data-a="nav" data-to="howto" data-back="${this.cur}" data-tip="Come si gioca: guida e tour (F1)" aria-label="Guida">${icon('help')}</button>
          <button class="btn icon-btn ghost" data-a="shortcuts" data-tip="Comandi: tastiera e controller (?)" aria-label="Comandi">${icon('gamepad')}</button>
          <button class="btn icon-btn ghost" data-a="quick-save" data-tip="Salvataggio rapido (Ctrl+S)" aria-label="Salva">${icon('save')}</button>
          <button class="btn icon-btn ghost" data-a="nav" data-to="settings" data-back="${this.cur}" data-tip="Impostazioni" aria-label="Impostazioni">${icon('settings')}</button>
        </div>
        <button class="btn primary lg continue-btn" data-a="continue" data-tip="Scorciatoia: Invio">${seasonOver ? 'Fine Stagione' : st.weekend ? 'Torna al Weekend' : 'Weekend di Gara'} ${icon('right')}</button>
      </div>
      <div class="sidebar">
        ${NAV_GROUPS.map(([g, ids]) => `<div class="nav-group" role="group" aria-label="${g}"><div class="nav-gh">${g}</div>${ids.map((id) => {
          const i = NAV.findIndex((x) => x.id === id), n = NAV[i]; if (!n) return '';
          const b = id === 'inbox' ? (unread ? [unread, 'info'] : null) : badges[id];
          const bl = b ? ` (${b[0]} ${b[0] === 1 ? 'cosa' : 'cose'} da fare)` : '';
          return `<div class="nav ${this.cur === n.id ? 'active' : ''}" data-a="nav" data-to="${n.id}" aria-label="${esc(n.name)}${bl}"${this.cur === n.id ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.name}</span>${b ? `<span class="badge nb-${b[1]}">${b[0] > 9 ? '9+' : b[0]}</span>` : ''}${navKey(i)}</div>`;
        }).join('')}</div>`).join('')}
        <div class="nav-sep"></div>
        <div class="nav" data-a="to-menu">${icon('logout')}<span>Menu Principale</span></div>
        <div class="grow"></div>
        ${ev && tr ? `<div class="nav-event" data-a="continue" data-tip="Vai al weekend di gara (Invio)">${mini ? `<div class="ne-track">${mini}</div>` : ''}<div class="ne-k">Prossimo evento</div><div class="ne-name">${flagSVG(tr.nat, 24, 16)}<span>${esc(trackName(st, ev))}</span></div><div class="ne-meta"><span>Round ${st.round + 1}/${st.calendar.length}</span><span>${[tr.night && 'Notturna', ev.sprint && 'Sprint'].filter(Boolean).join(' · ')}</span></div></div>` : ''}
      </div>
      <div class="main">${crumbs}${content}</div>
    </div>`;
  },
  modal(html, actions = {}, cls = '') {
    const had = !!document.querySelector('.modal-wrap');
    const prevFocus = had ? this._modalReturn : document.activeElement;
    this.closeModal(true);
    this.modalActions = actions;
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
    w.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    w.addEventListener('mousedown', (e) => { if (e.target === w && !cls.includes('locked')) this.closeModal(); });
    document.body.appendChild(w);
    const h = w.querySelector('h2, h1'); if (h) { h.id = h.id || 'modal-title'; w.setAttribute('aria-labelledby', h.id); }
    makeFocusable(w);
    this._modalReturn = prevFocus;
    if (!had) sfx.open();
    actions.mount?.(w);
    // move focus into the dialog (primary action first) so keyboard and controller users land in it
    requestAnimationFrame(() => {
      if (!w.isConnected || w.contains(document.activeElement)) return;
      const f = w.querySelector('.btn.primary:not([disabled])') || w.querySelector('button:not([disabled]), [data-a], input, select');
      f?.focus({ preventScroll: true });
    });
    return w;
  },
  closeModal(silent = false) {
    const open = document.querySelectorAll('.modal-wrap');
    open.forEach((m) => m.remove());
    this.modalActions = null;
    if (open.length && silent !== true) {
      sfx.close();
      const r = this._modalReturn; this._modalReturn = null;
      if (r?.isConnected) r.focus?.({ preventScroll: true });
    }
  },
  toast(title, text = '', type = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    title = String(title).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
    this.notes.unshift({ title, text: String(text || ''), type, at: Date.now(), screen: this.cur, read: false });
    if (this.notes.length > 60) this.notes.length = 60;
    this.updateNotesBadge();
    t.setAttribute('role', type === 'bad' ? 'alert' : 'status');
    if (type === 'good') rumble(0.25, 90, 0.4);
    t.innerHTML = `<div class="t-ic">${icon(type === 'bad' ? 'alert' : type === 'good' ? 'check' : 'info')}</div><b>${title}</b><div class="small muted">${text}</div><i class="t-bar"></i>`;
    while (box.children.length >= 4) box.firstElementChild.remove();
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .4s, transform .4s'; t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; }, 3600);
    setTimeout(() => t.remove(), 4100);
  },
  // ---- Loading veil for slow operations: const done = App.busy('Carico la pista'); … done();
  busy(label = 'Caricamento') {
    const v = document.createElement('div');
    v.className = 'busy-veil'; v.setAttribute('role', 'status');
    v.innerHTML = `<span class="loader">${esc(label)}</span>`;
    document.body.appendChild(v);
    return () => v.remove();
  },
  // ---- Full-screen loading card (track art + a tip) shown while a heavy screen builds.
  // run() is called once the card has painted; the card leaves after `min` ms at the earliest.
  loading({ eyebrow = 'Caricamento', title = '', sub = '', art = '', tip = '' } = {}, run, min = 650) {
    document.querySelector('.load-screen')?.remove();
    const v = document.createElement('div');
    v.className = 'load-screen'; v.setAttribute('role', 'status'); v.setAttribute('aria-live', 'polite');
    v.innerHTML = `<div class="ls-art">${art}</div><div class="ls-info"><div class="ls-eyebrow">${esc(eyebrow)}</div><div class="ls-title">${title}</div>${sub ? `<div class="ls-sub">${esc(sub)}</div>` : ''}<div class="ls-bar"><i></i></div>${tip ? `<div class="ls-tip"><span>${icon('bulb')} Lo sapevi?</span>${esc(tip)}</div>` : ''}</div>`;
    document.body.appendChild(v);
    const t0 = performance.now();
    const done = () => { const left = Math.max(0, min - (performance.now() - t0)); setTimeout(() => { v.classList.add('out'); setTimeout(() => v.remove(), 320); }, left); };
    requestAnimationFrame(() => setTimeout(() => { try { run?.(); } finally { done(); } }, 30));
  },
  // ---- Notification centre: every toast is kept here for the session
  notes: [],
  unreadNotes() { return this.notes.filter((n) => !n.read).length; },
  updateNotesBadge() {
    const b = document.querySelector('.tb-notes'); if (!b) return;
    const n = this.unreadNotes();
    let badge = b.querySelector('.badge');
    if (!n) { badge?.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; b.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : n;
  },
  openNotes() {
    const old = document.querySelector('.notes-panel'); if (old) { old.remove(); return; }
    const p = document.createElement('div');
    p.className = 'notes-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Centro notifiche');
    const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ora' : m < 60 ? `${m} min fa` : `${Math.round(m / 60)} h fa`; };
    p.innerHTML = `<div class="np-head"><span>${icon('bell')} Notifiche</span>${this.notes.length ? '<button class="btn sm ghost" data-np="clear">Svuota</button>' : ''}</div>
      <div class="np-list">${this.notes.length ? this.notes.map((n) => `<div class="np-item ${n.type} ${n.read ? '' : 'new'}"><i class="np-dot"></i><div><b>${n.title}</b>${n.text ? `<div class="small">${n.text}</div>` : ''}<div class="np-time">${ago(n.at)}</div></div></div>`).join('') : `<div class="np-empty">${icon('check')}<div>Nessuna notifica in questa sessione.</div></div>`}</div>`;
    document.body.appendChild(p);
    this.notes.forEach((n) => (n.read = true)); this.updateNotesBadge();
    sfx.open();
    p.addEventListener('click', (e) => { if (e.target.closest('[data-np="clear"]')) { this.notes = []; p.remove(); this.openNotes(); } });
    const off = (e) => { if (!p.contains(e.target) && !e.target.closest('.tb-notes')) { p.remove(); document.removeEventListener('mousedown', off, true); } };
    setTimeout(() => document.addEventListener('mousedown', off, true));
  },
  // ---- Audio mixer (per-bus volumes, works from any screen)
  audioMixer() {
    const s = getSettings();
    const tg = (k, label, on) => `<div class="mx-row"><span>${label}</span><button class="btn sm ${on ? 'active' : ''}" data-a="mx-toggle" data-k="${k}" aria-pressed="${on}">${on ? 'ON' : 'OFF'}</button></div>`;
    const sl = (b) => { const v = s[b.key] ?? b.def; return `<label class="mx-slider"><span>${b.label}</span><input type="range" min="0" max="1" step="0.05" value="${v}" data-input="mx-vol" data-k="${b.key}" aria-label="${b.label}"><b class="mono">${Math.round(v * 100)}</b></label>`; };
    this.modal(`<div class="tiny upper muted" style="letter-spacing:.3em">Mixer</div><h2>Audio</h2>
      <div class="mx-grid">
        <div class="col gap8">${AUDIO_BUSES.map(sl).join('')}</div>
        <div class="col gap8">${tg('sound', 'Effetti, motori e ambiente', s.sound !== false)}${tg('music', 'Colonna sonora', s.music !== false)}${tg('engineSound', 'Rombo motori in gara', s.engineSound !== false)}
          <div class="mx-test"><button class="btn sm" data-a="mx-test" data-t="ok">${icon('play')} Prova effetti</button><button class="btn sm" data-a="mx-test" data-t="win">${icon('trophy')} Fanfara</button></div>
          <div class="small muted" style="line-height:1.5">Colonna sonora generativa: un tema per menu, gestione, gara, podio e Scontro Totale, con dissolvenze tra le scene.</div>
        </div>
      </div>
      <div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Fatto</button></div>`, {
      'mx-vol'(el) { setSettings({ [el.dataset.k]: +el.value }); applyVolumes(); const b = el.parentElement.querySelector('b'); if (b) b.textContent = Math.round(el.value * 100); },
      'mx-toggle'(el) { const k = el.dataset.k; const on = !(getSettings()[k] ?? true); setSettings({ [k]: on }); applyVolumes(); el.classList.toggle('active', on); el.textContent = on ? 'ON' : 'OFF'; el.setAttribute('aria-pressed', on); if (k === 'music' && on) music.kick(); },
      'mx-test'(el) { sfx[el.dataset.t]?.(); },
    }, 'mixer');
  },
  confirm(title, text, onYes, yesLabel = 'Conferma', danger = false) {
    this.modal(`<h2>${title}</h2><p class="muted">${text}</p><div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${yesLabel}</button></div>`, { yes: () => { this.closeModal(); onYes(); } });
  },
};

import { getTrack } from './engine/world.js';
import { circuitPath } from './ui/trackview.js';
export function trackName(st, ev) { return getTrack(st.category, ev.trackId)?.name || ev.trackId; }

const globalActions = {
  shortcuts() { App.shortcuts(); },
  palette() { openPalette(App); },
  'go-back'() { App.back(); },
  'crash-reload-now'() { location.reload(); },
  notes() { App.openNotes(); },
  mixer() { App.audioMixer(); },
  'quick-save'() { if (saveGame()) { App.toast('Partita salvata', `Slot ${S().slot}`, 'good'); sfx.ok(); } else App.toast('Salvataggio fallito', '', 'bad'); },
  'to-menu'() { App.confirm('Tornare al menu?', 'La partita verrà salvata automaticamente.', () => { saveGame(); App.go('menu'); }); },
  continue() {
    const st = S();
    if (st.round >= st.calendar.length) { App.go('seasonend'); return; }
    const to = st.category === 'rally' ? 'rally' : 'weekend';
    const ev = st.calendar[st.round], tr = ev ? getTrack(st.category, ev.trackId) : null;
    if (document.querySelector('.load-screen')) return; // already on its way
    if (!tr || App.cur === to) { App.go(to); return; }
    let art = '';
    try { art = trackArt(st.category, tr, { w: 760, h: 520, accent: teamColor(playerTeam(st).car.livery), legend: false }); } catch {}
    App.loading({ eyebrow: `Round ${st.round + 1} / ${st.calendar.length} · ${st.weekend ? 'Si torna in pista' : 'Weekend di gara'}`, title: `${flagSVG(tr.nat, 54, 36)}<span>${esc(tr.name)}</span>`, sub: tr.circuit || (ev.stages ? `${ev.stages.length} prove speciali` : ''), art, tip: LOAD_TIPS[(st.round * 7 + st.season) % LOAD_TIPS.length] }, () => App.go(to));
  },
};

const LOAD_TIPS = [
  'Le prove libere servono a trovare l’assetto: più giri completi, più il feedback dei piloti diventa preciso.',
  'Un pit stop anticipato (undercut) funziona meglio sulle piste dove le gomme nuove guadagnano molto nel primo giro.',
  'Il fattore chiave del circuito indica il componente che pesa di più sul tempo sul giro: sviluppalo prima degli eventi che lo premiano.',
  'Con il rischio pioggia alto conviene tenere un treno di intermedie pronto e non impegnare tutte le gomme da asciutto in qualifica.',
  'La fiducia del consiglio sale con i risultati rispetto all’obiettivo, non in assoluto: un quinto posto può valere più di un podio atteso.',
  'I progetti R&D aggressivi rendono di più ma possono fallire: usali quando hai margine di budget e di tempo.',
  'Un pilota con il morale alto commette meno errori sotto pressione. Rinnovi e promesse mantenute contano.',
  'Sulle piste dove i sorpassi sono difficili la posizione in griglia vale doppio: spingi in qualifica.',
  'Gli sponsor assegnano un obiettivo diverso a ogni evento: centrarlo paga un premio extra.',
  'Nel Centro Tecnico passa sui componenti per vederli evidenziati sulla vettura nel box.',
];

export function teamColor(L) {
  const ok = (c) => { const l = luminance(c); return l > 0.16 && l < 0.82; };
  for (const c of [L.primary, L.secondary, L.accent]) if (c && ok(c)) return c;
  return '#e10600';
}

// Contextual coaching tips (shown once per player)
export function coach(id, title, text) {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('apexdynasty_tips') || '{}'); } catch {}
  if (seen[id] || seen.__off) return;
  seen[id] = 1;
  try { localStorage.setItem('apexdynasty_tips', JSON.stringify(seen)); } catch {}
  document.querySelector('.coach')?.remove();
  const el = document.createElement('div');
  el.className = 'coach'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="coach-h">${icon('bulb')} Consiglio dell’ingegnere</div><b style="display:block;margin-top:6px">${title}</b><div class="small mt8" style="line-height:1.55;color:var(--text2)">${text}</div><div class="row mt16" style="justify-content:space-between"><button class="btn sm ghost" data-coach="off">Non mostrare più consigli</button><button class="btn sm" data-coach="ok">Ho capito</button></div><i class="coach-t"></i>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-coach]'); if (!b) return;
    if (b.dataset.coach === 'off') { try { const t = JSON.parse(localStorage.getItem('apexdynasty_tips') || '{}'); t.__off = 1; localStorage.setItem('apexdynasty_tips', JSON.stringify(t)); } catch {} App.toast('Consigli disattivati', 'Puoi rivederli dalla guida “Come si gioca”.'); }
    el.remove();
  });
  document.body.appendChild(el);
  sfx.notify();
  setTimeout(() => el.remove(), 20000);
}

// ---------------------------------------------------------------------------
// Accessibility: every clickable element is reachable with Tab and activated with Enter/Space
export function makeFocusable(root) {
  root.querySelectorAll('[data-a]:not(button):not(input):not(select):not([tabindex])').forEach((el) => {
    if (el.classList.contains('disabled')) return;
    el.tabIndex = 0; el.setAttribute('role', 'button');
  });
}

// Styled tooltips: any [data-tip] (or legacy [title]) shows a game-styled tooltip after a short delay
function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let cur = null, timer = 0, watch = 0, mx = 0, my = 0;
  // live screens (race) re-render every few frames: re-find the element under the pointer with the same tip
  const resolve = () => {
    if (cur?.isConnected) return cur;
    const txt = cur?.getAttribute('data-tip');
    const el = document.elementFromPoint(mx, my)?.closest?.('[data-tip]');
    return (cur = el && el.getAttribute('data-tip') === txt ? el : null);
  };
  const hide = () => { clearTimeout(timer); clearInterval(watch); cur = null; tip.classList.remove('on'); };
  const place = (el) => {
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 8;
    if (y + th > innerHeight - 8) y = r.top - th - 8;
    x = Math.max(8, Math.min(innerWidth - tw - 8, x));
    tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(Math.max(8, y))}px`;
  };
  const show = () => {
    const el = resolve();
    const txt = el?.getAttribute('data-tip');
    if (!txt) return;
    tip.textContent = txt;
    place(el); tip.classList.add('on');
    clearInterval(watch);
    watch = setInterval(() => { if (!resolve()) hide(); }, 200);
  };
  document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  document.addEventListener('mouseover', (e) => {
    mx = e.clientX; my = e.clientY;
    const el = e.target.closest?.('[data-tip], [title]');
    if (!el) { if (cur) hide(); return; }
    if (el.hasAttribute('title')) { const t = el.getAttribute('title'); if (t && !el.hasAttribute('data-tip')) el.setAttribute('data-tip', t); el.removeAttribute('title'); }
    if (el === cur || (cur && !cur.isConnected && cur.getAttribute('data-tip') === el.getAttribute('data-tip'))) { cur = el; return; }
    const wasOn = tip.classList.contains('on');
    hide(); cur = el;
    timer = setTimeout(show, wasOn ? 40 : 380);
  });
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('wheel', hide, { passive: true, capture: true });
  document.addEventListener('keydown', hide, true);
  // keyboard users: show tooltip on focus
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el && el.matches(':focus-visible')) { hide(); cur = el; timer = setTimeout(show, 300); } });
  document.addEventListener('focusout', hide);
}
