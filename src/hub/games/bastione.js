// Baso Hub entry — Bastione (tower defense). Light: only the progress store; the game is lazy.
import { bsLoad, bsStars, bsNext } from '../../bastione/store.js';

const N = 24;
const dayNum = () => { const d = new Date(); return Math.max(1, Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 10, 1)) / 864e5) + 1); };
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const art = () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#79c95a"/><path d="M-10 120 H90 V50 H200 V130 H330" fill="none" stroke="#c9a76a" stroke-width="30" stroke-linejoin="round"/><path d="M-10 120 H90 V50 H200 V130 H330" fill="none" stroke="#ecd59a" stroke-width="22" stroke-linejoin="round"/>
  <g transform="translate(262 92)"><rect x="-22" y="-10" width="44" height="34" fill="#f2eee6"/><rect x="-30" y="-24" width="14" height="48" fill="#f2eee6"/><rect x="16" y="-24" width="14" height="48" fill="#f2eee6"/><path d="M-33 -24 L-23 -42 L-13 -24Z M13 -24 L23 -42 L33 -24Z" fill="#2f7cf6"/><rect x="-6" y="8" width="12" height="16" fill="#5b3a1e"/></g>
  <g transform="translate(140 96)"><path d="M-14 22 L-10 6 H10 L14 22Z" fill="#cfc8bb"/><rect x="-9" y="-12" width="18" height="18" fill="#7a6aa6"/><circle cy="-18" r="8" fill="#a78bfa"/></g>
  <g transform="translate(46 80)"><path d="M-14 22 L-10 6 H10 L14 22Z" fill="#cfc8bb"/><circle cy="-2" r="10" fill="#5b6577"/><rect x="-3" y="-20" width="7" height="16" fill="#2f3542" transform="rotate(30)"/></g>
  ${[[20, 112], [36, 116], [104, 70], [112, 58], [190, 80]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-6" y="-9" width="12" height="16" rx="6" fill="#ff4256"/><circle cx="-2.5" cy="-4" r="2" fill="#fff"/><circle cx="2.5" cy="-4" r="2" fill="#fff"/></g>`).join('')}
  <g transform="translate(220 126)"><rect x="-7" y="-10" width="14" height="18" rx="7" fill="#2f7cf6"/><path d="M-7 -6 Q0 -16 7 -6Z" fill="#cbd5e1"/></g></svg>`;

export default {
  id: 'bastione', order: 40, category: 'Strategia', section: 'Bastione', title: 'Bastione', genre: 'Strategia · tower defense', accent: '#22a35a',
  desc: 'Costruisci e potenzia torri, guida l’eroe e ferma le ondate di fagiolini rossi prima che raggiungano il tuo castello.',
  stat: () => { const p = bsLoad(), n = bsNext(p, N); return p.games ? `Livello ${Math.min(n, N)} · ★ ${bsStars(p)}/${N * 3} · ${p.wins} vittorie` : '24 livelli in 4 mondi, 9 torri, 4 eroi'; },
  cover: 'covers/bastione.webp',
  art,
  play: (App) => App.go('bastione', { from: 'launcher' }),
  modes: [
    { id: 'campagna', icon: 'play', name: 'Campagna', tag: 'Via!', desc: () => { const n = bsNext(bsLoad(), N); return n > N ? 'Campagna completata: punta alle tre stelle.' : `Livello ${n}: continua la difesa.`; }, go: (App) => App.go('bastione', { from: 'launcher', quick: 1 }) },
    { id: 'sfida', icon: 'calendar', name: 'Sfida del giorno', desc: () => { const r = bsLoad().daily[dayKey()]; return r?.won ? `#${dayNum()} vinta · torna domani` : `#${dayNum()} · una regola speciale, stessa mappa per tutti`; }, get tag() { return bsLoad().daily[dayKey()]?.won ? '' : 'Nuova'; }, go: (App) => App.go('bastione', { from: 'launcher', daily: 1 }) },
    { id: 'infinita', icon: 'hourglass', name: 'Infinita', desc: () => { const b = Math.max(0, ...Object.values(bsLoad().endless)); return b ? `Record: ondata ${b}` : 'Ondate senza fine su una mappa a scelta'; }, go: (App) => App.go('bastione', { from: 'launcher', tab: 'modalita' }) },
    { id: 'potenziamenti', icon: 'wrench', name: 'Potenziamenti ed eroi', desc: () => { const p = bsLoad(); return `${p.coins.toLocaleString('it-IT')} monete · ${p.gems} gemme`; }, go: (App) => App.go('bastione', { from: 'launcher', tab: 'potenziamenti' }) },
  ],
  screens: { bastione: () => import('../../screens/bastione.js') },
  ownGL: ['bastione'],
  moods: { bastione: 'orda' },
  deepLink: 'bastione',
};
