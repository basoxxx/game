// Baso Hub entry: Ingorgo (traffic-jam puzzle). Light on purpose: metadata, a store read, lazy screens.
import { igLoad, nextLevel, totalStars } from '../../ingorgo/store.js';

const TOTAL = 60, PER = 10;
const lv = (n) => `${Math.floor((n - 1) / PER) + 1}-${((n - 1) % PER) + 1}`;
const art = () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><linearGradient id="igsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#cfefff"/></linearGradient></defs>
  <rect width="320" height="180" fill="url(#igsky)"/><rect x="70" y="40" width="180" height="128" rx="10" fill="#5b6272"/>
  ${[[82, 52, 58, 26, '#3aa0ff'], [150, 52, 26, 58, '#ffc928'], [186, 52, 26, 86, '#3fe0b0'], [82, 120, 86, 26, '#9b5cff'], [220, 96, 26, 58, '#ff8a3d']].map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${c}" stroke="#fff" stroke-width="2"/>`).join('')}
  <rect x="88" y="88" width="56" height="26" rx="7" fill="#ff3b3b" stroke="#fff" stroke-width="2.5"/><circle cx="134" cy="96" r="3.5" fill="#fff"/><circle cx="134" cy="106" r="3.5" fill="#fff"/>
  <path d="M256 92h30l-8-8M286 92l-8 8" stroke="#ffe14a" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;

export default {
  id: 'ingorgo', order: 40, category: 'Puzzle', section: 'Ingorgo', title: 'Ingorgo', genre: 'Puzzle · traffico', accent: '#ff5a4e',
  desc: 'Parcheggi intasati, auto con gli occhi e clacson impazienti: sposta i veicoli nell’ordine giusto e libera l’uscita.',
  stat: () => { const p = igLoad(); const n = nextLevel(p, TOTAL); return p.solved ? `Livello ${n > TOTAL ? 'completato' : lv(n)} · ★ ${totalStars(p)} · ${p.solved} puzzle risolti` : '60 livelli in 6 mondi, sfide infinite e il puzzle del giorno'; },
  cover: 'covers/ingorgo.webp',
  art,
  play: (App) => App.go('ingorgo', { from: 'launcher', tab: 'home' }),
  modes: [
    { id: 'gioca', icon: 'play', name: 'Gioca', desc: () => { const p = igLoad(), n = nextLevel(p, TOTAL); return n > TOTAL ? 'Campagna completata: rigioca per le tre stelle.' : `Livello ${lv(n)}: continua la campagna.`; }, go: (App) => App.go('ingorgo', { from: 'launcher', quick: 1 }), tag: 'Via!' },
    { id: 'livelli', icon: 'map', name: 'Livelli', desc: '6 mondi e 400 sfide generate, tutte con soluzione garantita.', go: (App) => App.go('ingorgo', { from: 'launcher', tab: 'livelli' }) },
    { id: 'daily', icon: 'calendar', name: 'Puzzle del giorno', desc: () => { const p = igLoad(); return p.streak > 1 ? `Stesso puzzle per tutti · serie di ${p.streak} giorni` : 'Lo stesso puzzle per tutti, ogni giorno: confronta le mosse.'; }, go: (App) => App.go('ingorgo', { from: 'launcher', tab: 'daily', daily: 1 }) },
    { id: 'zen', icon: 'sun', name: 'Zen', desc: 'Puzzle infiniti, senza cronometro: solo relax.', go: (App) => App.go('ingorgo', { from: 'launcher', tab: 'zen' }) },
  ],
  screens: { ingorgo: () => import('../../screens/ingorgo.js') },
  ownGL: ['ingorgo'],
  moods: { ingorgo: 'manage' },
  deepLink: 'ingorgo',
};
