// Baso Hub — the first screen: pick a game (Manager, Flatout, Voragine) and jump straight into any of
// its modes. Kept small: it is part of the first paint, every game behind it is code-split.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { sfx } from '../ui/audio.js';
import { listSaves } from '../engine/state.js';
import { introSeen } from './intro-flag.js';
import { vgLoad, vgBestOverall } from '../voragine/store.js';
import '../styles/launcher.css';

const LAST = 'sala_last_game';
const lastGame = () => { try { return localStorage.getItem(LAST) || ''; } catch { return ''; } };
const setLast = (id) => { try { localStorage.setItem(LAST, id); } catch {} };
const derbyProg = () => { try { return JSON.parse(localStorage.getItem('apexdynasty_derby') || 'null'); } catch { return null; } };
const lastSave = () => listSaves().filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];

function continueCareer() {
  const s = lastSave();
  const fail = () => App.toast('Caricamento non riuscito', 'Il file di salvataggio è illeggibile. Se esiste un backup puoi ripristinarlo dal menu Carica.', 'bad');
  if (!s) { fail(); return; }
  import('../ui/savesafe.js').then((m) => m.loadWithBackup(s.slot)).then((ok) => { if (ok) App.go('hub'); else fail(); }, (e) => { console.warn('load', e); fail(); });
}

// Key art rendered from the games themselves (tools/covers.mjs → public/covers). SVG art is the fallback.
export const COVERS = { apex: 'covers/apex.webp', voragine: 'covers/voragine.webp', derby: 'covers/derby.webp' };
const coverOf = (id) => (COVERS[id] ? `<img class="bh-cover-img" src="./${COVERS[id]}" alt="" decoding="async" onerror="this.remove()">` : '');
const ART = {
  apex: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><linearGradient id="lg-a" x1="0" x2="1"><stop offset="0" stop-color="#e5141b"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient><filter id="lg-g"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <path d="M30 130 C 60 40, 120 40, 150 90 S 230 150, 260 70 S 300 30, 300 30" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="22" stroke-linecap="round"/>
    <path class="lg-trace" d="M30 130 C 60 40, 120 40, 150 90 S 230 150, 260 70 S 300 30, 300 30" fill="none" stroke="url(#lg-a)" stroke-width="4" stroke-linecap="round" filter="url(#lg-g)"/>
    <path class="lg-trace" d="M30 130 C 60 40, 120 40, 150 90 S 230 150, 260 70 S 300 30, 300 30" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <g transform="translate(18 140)">${Array.from({ length: 16 }, (_, i) => `<rect x="${(i % 8) * 8}" y="${Math.floor(i / 8) * 8}" width="8" height="8" fill="${(i + Math.floor(i / 8)) % 2 ? '#fff' : '#111'}"/>`).join('')}</g></svg>`,
  derby: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="lg-b"><stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#ffb000"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient></defs>
    <circle class="lg-burst" cx="162" cy="96" r="58" fill="url(#lg-b)"/>
    <g transform="translate(58 82) rotate(-8)"><path d="M0 34 L10 14 L44 8 L66 18 L92 20 L100 36 L96 46 L4 46Z" fill="#c8102e"/><path d="M18 16 L42 11 L58 19 L20 22Z" fill="#1d2633"/><circle cx="22" cy="46" r="10" fill="#111"/><circle cx="80" cy="46" r="10" fill="#111"/></g>
    <g transform="translate(266 100) rotate(14) scale(-1 1)"><path d="M0 34 L10 14 L44 8 L66 18 L92 20 L100 36 L96 46 L4 46Z" fill="#1f6feb"/><path d="M18 16 L42 11 L58 19 L20 22Z" fill="#1d2633"/><circle cx="22" cy="46" r="10" fill="#111"/><circle cx="80" cy="46" r="10" fill="#111"/></g>
    ${[[150, 60, -40], [176, 54, 20], [186, 120, 60], [140, 128, 200], [196, 84, 0], [130, 88, 160]].map(([x, y, r]) => `<rect class="lg-spark" x="${x}" y="${y}" width="14" height="3" rx="1.5" fill="#ffe27a" transform="rotate(${r} ${x} ${y})"/>`).join('')}</svg>`,
  voragine: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="lg-h" cx=".5" cy=".42"><stop offset="0" stop-color="#000"/><stop offset=".75" stop-color="#05030c"/><stop offset="1" stop-color="#8b5cff"/></radialGradient></defs>
    <g stroke="rgba(255,255,255,.07)" stroke-width="1">${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40 - 60}" y2="180"/><line x1="0" y1="${i * 24}" x2="320" y2="${i * 24 - 20}"/>`).join('')}</g>
    <ellipse cx="160" cy="112" rx="78" ry="34" fill="url(#lg-h)"/><ellipse cx="160" cy="112" rx="78" ry="34" fill="none" stroke="#b79bff" stroke-width="2.5"/>
    <g class="lg-fall"><rect x="128" y="62" width="22" height="34" fill="#ffcf5a" transform="rotate(-18 139 79)"/><rect x="170" y="70" width="16" height="16" fill="#38d39f" transform="rotate(24 178 78)"/><circle cx="196" cy="96" r="7" fill="#ff6b8b"/></g>
    <rect x="40" y="40" width="34" height="58" fill="#2a2f45"/><rect x="246" y="30" width="40" height="70" fill="#232842"/>${[0, 1, 2, 3].map((r) => `<rect x="46" y="${48 + r * 12}" width="8" height="6" fill="#ffd36a" opacity=".7"/><rect x="254" y="${38 + r * 14}" width="9" height="6" fill="#9fd1ff" opacity=".6"/>`).join('')}</svg>`,
};

// Games in the hub, each with its modes. Add one: append an entry and a screen.
//   mode: { id, icon, name, desc, go(), when?(), tag? }
export const GAMES = [
  {
    id: 'apex', section: 'Manager', title: 'Apex Dynasty', genre: 'Gestionale motorsport', accent: '#e5141b',
    desc: 'Guida la tua scuderia in Formula, Formula Apex 2, Rally ed Endurance: vettura, piloti, sponsor e strategia di gara.',
    stat: () => { const s = lastSave(); return s ? `${esc(s.team || 'Carriera')} · Stagione ${s.season}` : 'Nessuna carriera ancora: inizia la tua dinastia'; },
    play: () => App.go(introSeen() ? 'menu' : 'intro'),
    modes: [
      { id: 'continue', icon: 'play', name: 'Continua carriera', desc: () => { const s = lastSave(); return s ? `${esc(s.team || '')} · Stagione ${s.season} · Round ${Math.min(s.round + 1, s.total)}/${s.total}` : ''; }, when: () => !!lastSave(), go: continueCareer, tag: 'Riprendi' },
      { id: 'newgame', icon: 'flag', name: 'Nuova carriera', desc: 'Formula, Formula Apex 2, Rally o Endurance: scegli o fonda una squadra.', go: () => App.go('newgame') },
      { id: 'quickrace', icon: 'speed', name: 'Gara rapida', desc: 'Un weekend singolo, qualsiasi squadra e pista.', go: () => App.go('quickrace') },
      { id: 'challenges', icon: 'target', name: 'Sfide', desc: 'Scenari storici con obiettivi e medaglie.', go: () => App.go('challenges') },
      { id: 'champ', icon: 'trophy', name: 'Campionato personalizzato', desc: 'Piste, punteggi, sprint, meteo e griglia a tua scelta.', go: () => App.go('mode-champ') },
      { id: 'daily', icon: 'calendar', name: 'Sfida del giorno', desc: 'Una sfida nuova ogni giorno, uguale per tutti.', go: () => App.go('mode-daily') },
      { id: 'tp', icon: 'hourglass', name: 'Team Principal a tempo', desc: 'Mini-stagione di 3 gare con gettoni sviluppo.', go: () => App.go('mode-tp') },
    ],
  },
  {
    id: 'derby', section: 'Flatout', title: 'Scontro Totale', genre: 'Guida · corse a contatto', accent: '#ffb000',
    desc: 'Prendi il volante: corse a contatto, salti, lamiere che volano e il derby della distruzione.',
    stat: () => { const p = derbyProg(); return p?.races ? `${p.wins || 0} vittorie su ${p.races} eventi` : 'Fisica vera, auto che si ammaccano'; },
    play: () => App.go('derby', { from: 'launcher' }),
    modes: [
      { id: 'carriera', icon: 'star', name: 'Carriera', desc: 'Coppe in sequenza: medaglie, crediti e nuove auto.', go: () => App.go('derby', { from: 'launcher', tab: 'carriera' }) },
      { id: 'libero', icon: 'flag', name: 'Evento libero', desc: 'Scegli arena, modalità, avversari e meteo.', go: () => App.go('derby', { from: 'launcher', tab: 'libero' }) },
      { id: 'campionato', icon: 'trophy', name: 'Campionato', desc: 'Più eventi di fila, classifica a punti.', go: () => App.go('derby', { from: 'launcher', tab: 'campionato' }) },
      { id: 'garage', icon: 'wrench', name: 'Garage', desc: 'Potenziamenti, livree e nuove auto.', go: () => App.go('derby', { from: 'launcher', tab: 'garage' }) },
    ],
  },
  {
    id: 'voragine', section: 'Voragine', title: 'Voragine', genre: 'Arcade · città', accent: '#8b5cff',
    desc: 'Sei una voragine che si apre in città: inghiotti tutto ciò che è più piccolo di te, cresci e divora le voragini rivali.',
    stat: () => { const p = vgLoad(); const b = vgBestOverall(p); return b ? `Record ${b.toLocaleString('it-IT')} punti · ${p.games} partite` : '2 minuti, una città intera da divorare'; },
    play: () => App.go('voragine', { from: 'launcher' }),
    modes: [
      { id: 'quick', icon: 'play', name: 'Gioca subito', desc: () => { const p = vgLoad(); return `Ultima scelta: ${({ classica: 'Classica', battaglia: 'Battaglia', solitaria: 'Solitaria' })[p.mode] || 'Classica'}`; }, go: () => App.go('voragine', { from: 'launcher', quick: 1 }), tag: 'Via!' },
      { id: 'classica', icon: 'trophy', name: 'Classica', desc: '2 minuti contro 7 voragini rivali.', go: () => App.go('voragine', { from: 'launcher', mode: 'classica' }) },
      { id: 'battaglia', icon: 'burst', name: 'Battaglia', desc: 'Chi viene inghiottito è fuori. Resta l’ultima.', go: () => App.go('voragine', { from: 'launcher', mode: 'battaglia' }) },
      { id: 'solitaria', icon: 'target', name: 'Solitaria', desc: 'Divora la città da sola: percentuale e stelle.', go: () => App.go('voragine', { from: 'launcher', mode: 'solitaria' }) },
    ],
  },
];

let keyH = null, sel = null;
const cur = () => GAMES.find((g) => g.id === sel) || GAMES.find((g) => g.id === lastGame()) || GAMES[0];

function panel(g) {
  const modes = g.modes.filter((m) => !m.when || m.when());
  return `<section class="bh-panel" style="--acc:${g.accent}" aria-label="${esc(g.title)}">
    <div class="bh-hero">
      <div class="lg-art bh-cover">${ART[g.id]()}${coverOf(g.id)}<div class="bh-cover-shade"></div></div>
      <div class="bh-hero-body">
        <div class="lg-tags"><span class="lg-genre">${esc(g.genre)}</span>${g.id === lastGame() ? '<span class="lg-lastp">Ultimo giocato</span>' : ''}</div>
        <h2>${esc(g.title)}</h2>
        <p>${esc(g.desc)}</p>
        <div class="lg-stat">${icon('star')}<span>${g.stat()}</span></div>
        <button class="btn primary bh-play" data-a="lg-play" data-id="${g.id}">${icon('play')} Apri ${esc(g.title)}</button>
      </div>
    </div>
    <h3 class="bh-modes-h">Modalità</h3>
    <div class="bh-modes">${modes.map((m) => { const d = typeof m.desc === 'function' ? m.desc() : m.desc; return `<div class="bh-mode" data-a="bh-mode" data-g="${g.id}" data-m="${m.id}" tabindex="0">${icon(m.icon)}<div><b>${esc(m.name)}</b>${m.tag ? `<em>${esc(m.tag)}</em>` : ''}<span>${d}</span></div></div>`; }).join('')}</div>
  </section>`;
}

registerScreen({
  id: 'launcher', full: true,
  render() {
    const g = cur();
    return `<div class="lg-screen bh">
      <div class="lg-bg" aria-hidden="true"><i></i><i></i><i></i></div>
      <header class="lg-head bh-head">
        <div class="bh-logo"><span class="bh-mark">B</span><div><div class="bh-word">Baso<span>Hub</span></div><div class="lg-eyebrow">Manager · Flatout · Voragine</div></div></div>
        <nav class="bh-tabs" role="tablist" aria-label="Giochi">${GAMES.map((x, i) => `<div class="bh-tab ${x.id === g.id ? 'on' : ''}" role="tab" aria-selected="${x.id === g.id}" data-a="bh-game" data-id="${x.id}" style="--acc:${x.accent}${COVERS[x.id] ? `;--thumb:url(./${COVERS[x.id]})` : ''}" tabindex="0"><span class="kbd">${i + 1}</span><b>${esc(x.section)}</b><small>${esc(x.title)}</small></div>`).join('')}</nav>
      </header>
      ${panel(g)}
      <footer class="lg-foot">
        <span class="ver-badge">v${__APP_VERSION__}</span>
        <button class="btn ghost sm" data-a="nav" data-to="settings" data-back="launcher">${icon('settings')} Impostazioni</button>
        ${window.apex?.quit ? `<button class="btn ghost sm" data-a="lg-quit">${icon('logout')} Esci</button>` : ''}
        <span class="lg-note">1-3 o Q/E per cambiare gioco · Invio per giocare · Giochi di fantasia: nomi e marchi sono inventati</span>
      </footer>
    </div>`;
  },
  mount() {
    requestAnimationFrame(() => (document.querySelector('.bh-mode') || document.querySelector('.bh-play'))?.focus({ preventScroll: true }));
    if (keyH) window.removeEventListener('keydown', keyH, true);
    keyH = (e) => {
      if (App.cur !== 'launcher' || document.querySelector('.modal-wrap') || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = GAMES.indexOf(cur());
      const d = /^Digit([1-9])$/.exec(e.code);
      let n = null;
      if (d && GAMES[+d[1] - 1]) n = +d[1] - 1;
      else if (e.code === 'KeyE' || e.code === 'PageDown') n = (i + 1) % GAMES.length;
      else if (e.code === 'KeyQ' || e.code === 'PageUp') n = (i - 1 + GAMES.length) % GAMES.length;
      if (n !== null) { e.preventDefault(); e.stopPropagation(); if (n !== i) { sel = GAMES[n].id; sfx.hover(); App.refresh(); } }
    };
    window.addEventListener('keydown', keyH, true);
    // controller shoulders switch game
    let prev = [false, false];
    const poll = () => {
      if (App.cur !== 'launcher') return;
      const p = [...(navigator.getGamepads?.() || [])].find(Boolean);
      if (p) {
        const now = [!!p.buttons[4]?.pressed, !!p.buttons[5]?.pressed];
        if ((now[0] && !prev[0]) || (now[1] && !prev[1])) { const i = GAMES.indexOf(cur()); sel = GAMES[(i + (now[1] ? 1 : -1) + GAMES.length) % GAMES.length].id; sfx.hover(); App.refresh(); }
        prev = now;
      }
      this._pad = requestAnimationFrame(poll);
    };
    cancelAnimationFrame(this._pad); this._pad = requestAnimationFrame(poll);
  },
  unmount() { window.removeEventListener('keydown', keyH, true); keyH = null; cancelAnimationFrame(this._pad); },
  actions: {
    'bh-game'(el) { if (sel !== el.dataset.id) { sel = el.dataset.id; App.refresh(); } },
    'bh-mode'(el) { const g = GAMES.find((x) => x.id === el.dataset.g), m = g?.modes.find((x) => x.id === el.dataset.m); if (!m) return; setLast(g.id); sel = g.id; sfx.ok?.(); m.go(); },
    'lg-play'(el) { const g = GAMES.find((x) => x.id === el.dataset.id); if (!g) return; setLast(g.id); sel = g.id; sfx.ok?.(); g.play(); },
    'lg-quit'() { App.confirm('Uscire?', 'Il gioco verrà chiuso.', () => window.apex?.quit?.()); },
  },
});

// Deep links: ?game=apex|derby|voragine skips the hub (handy for shortcuts and tests)
export function launchTarget() {
  const g = new URLSearchParams(location.search).get('game');
  if (g === 'apex') return 'menu';
  if (g === 'derby' || g === 'voragine') return g;
  return null;
}
