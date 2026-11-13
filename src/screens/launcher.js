// Sala Giochi — the first screen: pick which game to play.
// Apex Dynasty (manager), Scontro Totale (driving) and Voragine (swallow-the-city arcade).
// Kept small: it is part of the first paint, every game behind it is code-split.
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

// Games in the hall. Add one: append an entry and a screen with that id.
export const GAMES = [
  {
    id: 'apex', title: 'Apex Dynasty', genre: 'Gestionale motorsport', accent: '#e5141b',
    desc: 'Guida la tua scuderia in Formula, Rally ed Endurance: vettura, piloti, sponsor e strategia di gara.',
    stat: () => { const s = listSaves().filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0]; return s ? `${esc(s.team || 'Carriera')} · Stagione ${s.season}` : 'Nessuna carriera ancora: inizia la tua dinastia'; },
    go: () => App.go(introSeen() ? 'menu' : 'intro'),
    art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><linearGradient id="lg-a" x1="0" x2="1"><stop offset="0" stop-color="#e5141b"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient><filter id="lg-g"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <path d="M30 130 C 60 40, 120 40, 150 90 S 230 150, 260 70 S 300 30, 300 30" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="22" stroke-linecap="round"/>
      <path class="lg-trace" d="M30 130 C 60 40, 120 40, 150 90 S 230 150, 260 70 S 300 30, 300 30" fill="none" stroke="url(#lg-a)" stroke-width="4" stroke-linecap="round" filter="url(#lg-g)"/>
      <path class="lg-trace" d="M30 130 C 60 40, 120 40, 150 90 S 230 150, 260 70 S 300 30, 300 30" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <g transform="translate(18 140)">${Array.from({ length: 16 }, (_, i) => `<rect x="${(i % 8) * 8}" y="${Math.floor(i / 8) * 8}" width="8" height="8" fill="${(i + Math.floor(i / 8)) % 2 ? '#fff' : '#111'}"/>`).join('')}</g></svg>`,
  },
  {
    id: 'derby', title: 'Scontro Totale', genre: 'Guida · demolition derby', accent: '#ffb000',
    desc: 'Prendi il volante: corse a contatto, salti, lamiere che volano e il derby della distruzione.',
    stat: () => { const p = derbyProg(); return p?.races ? `${p.wins || 0} vittorie su ${p.races} eventi` : 'Fisica vera, auto che si ammaccano'; },
    go: () => App.go('derby', { from: 'launcher' }),
    art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="lg-b"><stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#ffb000"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient></defs>
      <circle class="lg-burst" cx="162" cy="96" r="58" fill="url(#lg-b)"/>
      <g transform="translate(58 82) rotate(-8)"><path d="M0 34 L10 14 L44 8 L66 18 L92 20 L100 36 L96 46 L4 46Z" fill="#c8102e"/><path d="M18 16 L42 11 L58 19 L20 22Z" fill="#1d2633"/><circle cx="22" cy="46" r="10" fill="#111"/><circle cx="80" cy="46" r="10" fill="#111"/></g>
      <g transform="translate(266 100) rotate(14) scale(-1 1)"><path d="M0 34 L10 14 L44 8 L66 18 L92 20 L100 36 L96 46 L4 46Z" fill="#1f6feb"/><path d="M18 16 L42 11 L58 19 L20 22Z" fill="#1d2633"/><circle cx="22" cy="46" r="10" fill="#111"/><circle cx="80" cy="46" r="10" fill="#111"/></g>
      ${[[150, 60, -40], [176, 54, 20], [186, 120, 60], [140, 128, 200], [196, 84, 0], [130, 88, 160]].map(([x, y, r]) => `<rect class="lg-spark" x="${x}" y="${y}" width="14" height="3" rx="1.5" fill="#ffe27a" transform="rotate(${r} ${x} ${y})"/>`).join('')}</svg>`,
  },
  {
    id: 'voragine', title: 'Voragine', genre: 'Arcade · città', accent: '#8b5cff', fresh: true,
    desc: 'Sei una voragine che si apre in città: inghiotti tutto ciò che è più piccolo di te, cresci e divora le voragini rivali.',
    stat: () => { const p = vgLoad(); const b = vgBestOverall(p); return b ? `Record ${b.toLocaleString('it-IT')} punti · ${p.games} partite` : '2 minuti, una città intera da divorare'; },
    go: () => App.go('voragine', { from: 'launcher' }),
    art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="lg-h" cx=".5" cy=".42"><stop offset="0" stop-color="#000"/><stop offset=".75" stop-color="#05030c"/><stop offset="1" stop-color="#8b5cff"/></radialGradient></defs>
      <g stroke="rgba(255,255,255,.07)" stroke-width="1">${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40 - 60}" y2="180"/><line x1="0" y1="${i * 24}" x2="320" y2="${i * 24 - 20}"/>`).join('')}</g>
      <ellipse cx="160" cy="112" rx="78" ry="34" fill="url(#lg-h)"/><ellipse cx="160" cy="112" rx="78" ry="34" fill="none" stroke="#b79bff" stroke-width="2.5"/>
      <g class="lg-fall"><rect x="128" y="62" width="22" height="34" fill="#ffcf5a" transform="rotate(-18 139 79)"/><rect x="170" y="70" width="16" height="16" fill="#38d39f" transform="rotate(24 178 78)"/><circle cx="196" cy="96" r="7" fill="#ff6b8b"/></g>
      <rect x="40" y="40" width="34" height="58" fill="#2a2f45"/><rect x="246" y="30" width="40" height="70" fill="#232842"/>${[0, 1, 2, 3].map((r) => `<rect x="46" y="${48 + r * 12}" width="8" height="6" fill="#ffd36a" opacity=".7"/><rect x="254" y="${38 + r * 14}" width="9" height="6" fill="#9fd1ff" opacity=".6"/>`).join('')}</svg>`,
  },
];

let keyH = null;
registerScreen({
  id: 'launcher', full: true,
  render() {
    const last = lastGame();
    return `<div class="lg-screen">
      <div class="lg-bg" aria-hidden="true"><i></i><i></i><i></i></div>
      <header class="lg-head">
        <div class="lg-eyebrow">${icon('gamepad')} Sala Giochi</div>
        <h1 class="lg-title">Scegli a cosa <span>giocare</span></h1>
        <p class="lg-sub">Tre giochi, un’unica sala. Frecce o controller per scegliere, Invio per giocare.</p>
      </header>
      <div class="lg-cards" role="list">
        ${GAMES.map((g, i) => `<div class="lg-card ${g.id === last ? 'last' : ''}" role="listitem" style="--acc:${g.accent};--i:${i}" data-a="lg-play" data-id="${g.id}" tabindex="0" aria-label="${esc(g.title)}: ${esc(g.desc)}">
          <div class="lg-art">${g.art()}</div>
          <div class="lg-body">
            <div class="lg-tags"><span class="lg-genre">${esc(g.genre)}</span>${g.fresh ? '<span class="lg-new">Nuovo</span>' : ''}${g.id === last ? '<span class="lg-lastp">Ultimo giocato</span>' : ''}</div>
            <h2>${esc(g.title)}</h2>
            <p>${esc(g.desc)}</p>
            <div class="lg-stat">${icon('star')}<span>${g.stat()}</span></div>
          </div>
          <div class="lg-cta">${icon('play')}<span>Gioca</span></div>
        </div>`).join('')}
      </div>
      <footer class="lg-foot">
        <span class="ver-badge">v${__APP_VERSION__}</span>
        <button class="btn ghost sm" data-a="nav" data-to="settings" data-back="launcher">${icon('settings')} Impostazioni</button>
        ${window.apex?.quit ? `<button class="btn ghost sm" data-a="lg-quit">${icon('logout')} Esci</button>` : ''}
        <span class="lg-note">Giochi di fantasia: nomi e marchi sono inventati</span>
      </footer>
    </div>`;
  },
  mount() {
    const cards = [...document.querySelectorAll('.lg-card')];
    const last = cards.find((c) => c.classList.contains('last')) || cards[0];
    requestAnimationFrame(() => last?.focus({ preventScroll: true }));
    keyH = (e) => {
      if (App.cur !== 'launcher' || document.querySelector('.modal-wrap')) return;
      const i = cards.indexOf(document.activeElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation();
        const n = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + cards.length) % cards.length;
        cards[n].focus(); cards[n].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); sfx.hover();
      }
      const d = /^Digit([1-9])$/.exec(e.code);
      if (d && cards[+d[1] - 1]) { e.preventDefault(); cards[+d[1] - 1].click(); }
    };
    window.addEventListener('keydown', keyH, true);
  },
  unmount() { window.removeEventListener('keydown', keyH, true); keyH = null; },
  actions: {
    'lg-play'(el) { const g = GAMES.find((x) => x.id === el.dataset.id); if (!g) return; setLast(g.id); sfx.ok?.(); g.go(); },
    'lg-quit'() { App.confirm('Uscire?', 'Il gioco verrà chiuso.', () => window.apex?.quit?.()); },
  },
});

// Deep links: ?game=apex|derby|voragine skips the hall (handy for shortcuts and tests)
export function launchTarget() {
  const g = new URLSearchParams(location.search).get('game');
  if (g === 'apex') return 'menu';
  if (g === 'derby' || g === 'voragine') return g;
  return null;
}
