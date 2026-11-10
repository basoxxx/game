// Command palette (Ctrl+K): type to jump to any screen, tab or common action.
import { icon } from './icons.js';
import { esc } from './dom.js';
import { sfx } from './audio.js';
import { S } from '../engine/state.js';

// entries: [label, keywords, icon, run(App) | {to, tab}, group, needsCareer]
function entries(App) {
  const st = S();
  const go = (to, extra = {}) => () => App.go(to, extra);
  const list = [];
  const add = (label, kw, ic, run, group, career = false) => { if (!career || st) list.push({ label, kw: `${label} ${kw}`.toLowerCase(), ic, run, group }); };
  // career screens (with the sections people look for by name)
  add('Panoramica', 'hub home sede da fare inbox decisioni', 'home', go('hub'), 'Sede', true);
  add('Posta', 'messaggi mail email', 'mail', go('inbox'), 'Sede', true);
  add('Centro Tecnico · Sviluppo R&D', 'auto vettura progetti sviluppo rd car', 'car', go('car', { tab: 'dev' }), 'Squadra', true);
  add('Centro Tecnico · Regolamento & PU', 'regolamento regole power unit motore fornitore', 'rules', go('car', { tab: 'regs' }), 'Squadra', true);
  add('Centro Tecnico · Progetto & Livrea', 'livrea colori concetto design', 'palette', go('car', { tab: 'design' }), 'Squadra', true);
  add('Centro Tecnico · Confronto', 'confronto rivali prestazioni', 'chart', go('car', { tab: 'compare' }), 'Squadra', true);
  add('Piloti & Accademia', 'piloti contratti morale accademia giovani drivers', 'users', go('drivers'), 'Squadra', true);
  add('Mercato piloti', 'mercato ingaggi svincolati trasferimenti market', 'market', go('market'), 'Squadra', true);
  add('Staff & Strutture', 'staff ingegneri strutture fabbrica', 'factory', go('staff'), 'Squadra', true);
  add('Sponsor & Finanze', 'sponsor soldi budget finanze investimenti', 'money', go('finance'), 'Squadra', true);
  add('Paddock · Il Giornale', 'giornale stampa notizie paddock', 'news', go('paddock', { tab: 'paper' }), 'Campionato', true);
  add('Paddock · Team Principal', 'rivali sfide scommesse team principal', 'mic', go('paddock', { tab: 'tp' }), 'Campionato', true);
  add('Paddock · Commissione', 'commissione regolamenti voto mondo', 'scales', go('paddock', { tab: 'world' }), 'Campionato', true);
  add('Paddock · Consiglio & Dinastia', 'consiglio cda dinastia promesse status mandato', 'board', go('paddock', { tab: 'board' }), 'Campionato', true);
  add('Classifiche', 'classifica punti piloti costruttori standings', 'chart', go('standings'), 'Campionato', true);
  add('Calendario', 'calendario gare round eventi', 'calendar', go('calendar'), 'Campionato', true);
  add('Carriera manager', 'carriera livello abilità punti xp', 'star', go('career'), 'Carriera', true);
  add('Albo d’oro', 'albo oro campioni storia hall of fame', 'trophy', go('halloffame'), 'Carriera', true);
  if (st) add(st.round >= st.calendar.length ? 'Fine stagione' : st.weekend ? 'Torna al weekend' : 'Weekend di gara', 'gara weekend corsa continua', 'flag', () => { App.go('hub'); setTimeout(() => document.querySelector('.continue-btn')?.click(), 0); }, 'Azioni', true);
  if (st) add('Salvataggio rapido', 'salva save', 'save', () => document.querySelector('[data-a="quick-save"]')?.click() || App.toast('Usa Ctrl+S', ''), 'Azioni', true);
  // everywhere
  add('Impostazioni', 'opzioni grafica qualità audio testo accessibilità daltonici', 'settings', go('settings', { back: App.cur }), 'Generale');
  add('Come si gioca', 'guida tutorial aiuto help manuale', 'book', go('howto', { back: App.cur }), 'Generale');
  add('Comandi tastiera e controller', 'scorciatoie tasti shortcut gamepad', 'gamepad', () => App.shortcuts(), 'Generale');
  add('Audio', 'volume musica suoni mixer', 'volume', () => App.audioMixer(), 'Generale');
  add('Menu principale', 'esci home menu', 'logout', () => (st ? document.querySelector('[data-a="to-menu"]')?.click() || App.go('menu') : App.go('menu')), 'Generale');
  if (!st) {
    add('Nuova Carriera', 'nuova partita inizia', 'flag', go('newgame'), 'Gioca');
    add('Gara Rapida', 'gara veloce singola', 'speed', go('quickrace'), 'Gioca');
    add('Scontro Totale', 'derby distruzione guida', 'steering', go('derby'), 'Gioca');
    add('Sfide', 'scenari medaglie obiettivi', 'target', go('challenges'), 'Gioca');
  }
  return list;
}

// subsequence fuzzy score: every typed char in order; word starts and runs score higher
function score(q, s) {
  if (!q) return 1;
  let i = 0, sc = 0, run = 0;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) { i++; run++; sc += 1 + run * 2 + (j === 0 || s[j - 1] === ' ' ? 6 : 0); } else run = 0;
  }
  return i === q.length ? sc - s.length * 0.01 : 0;
}

export function openPalette(App) {
  if (document.querySelector('.palette-wrap')) return;
  if (['weekend', 'rally', 'derby', 'intro'].includes(App.cur)) return; // live sessions own the screen
  const all = entries(App);
  const w = document.createElement('div');
  w.className = 'palette-wrap'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Vai a');
  w.innerHTML = `<div class="palette"><div class="pal-in">${icon('compass')}<input type="text" placeholder="Cerca una schermata o un’azione…" aria-label="Cerca" aria-controls="pal-list" autocomplete="off" spellcheck="false"><span class="kbd">Esc</span></div><div class="pal-list" id="pal-list" role="listbox"></div><div class="pal-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> scegli</span><span><span class="kbd">Invio</span> vai</span><span><span class="kbd">Esc</span> chiudi</span></div></div>`;
  document.body.appendChild(w);
  const inp = w.querySelector('input'), box = w.querySelector('.pal-list');
  let shown = [], sel = 0;
  const prevFocus = document.activeElement;
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    shown = all.map((e) => ({ e, s: Math.max(score(q, e.label.toLowerCase()) * 1.5, score(q, e.kw)) })).filter((x) => x.s > 0).sort((a, b) => (q ? b.s - a.s : 0)).map((x) => x.e).slice(0, 12);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let lastG = '';
    box.innerHTML = shown.length ? shown.map((e, i) => { const g = !q && e.group !== lastG ? `<div class="pal-g">${esc((lastG = e.group))}</div>` : ''; return `${g}<div class="pal-item ${i === sel ? 'on' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(e.ic)}<span>${esc(e.label)}</span>${i === sel ? icon('right') : ''}</div>`; }).join('') : `<div class="pal-empty">${icon('info')} Nessun risultato per «${esc(inp.value)}»</div>`;
    box.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { w.remove(); document.removeEventListener('keydown', key, true); if (prevFocus?.isConnected) prevFocus.focus?.({ preventScroll: true }); };
  const run = (i) => { const e = shown[i]; if (!e) return; close(); sfx.click(); e.run(App); };
  const key = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); sfx.close?.(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); draw(); sfx.hover?.(); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); run(sel); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); ev.stopPropagation(); }
    ev.stopPropagation(); // typing must not trigger the game shortcuts
  };
  document.addEventListener('keydown', key, true);
  inp.addEventListener('input', () => { sel = 0; draw(); });
  box.addEventListener('mousemove', (e) => { const it = e.target.closest('.pal-item'); if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; draw(); } });
  box.addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it) run(+it.dataset.i); });
  w.addEventListener('mousedown', (e) => { if (e.target === w) close(); });
  draw(); inp.focus();
  sfx.open?.();
  return w;
}
