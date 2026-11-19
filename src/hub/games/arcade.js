// Baso Hub entry for Arcade Baso (a collection of four arcade games). Light: metadata, a store read,
// the lazy screen. See src/hub/registry.js.
import { arLoad, best } from '../../arcade/store.js';
import { GAMES, GAME_IDS, dailySpec } from '../../arcade/meta.js';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const go = (App, extra = {}) => App.go('arcade', { from: 'launcher', ...extra });
const ICON = { astro: 'target', rimbalzo: 'burst', corri: 'speed', labirinto: 'compass' };

export default {
  id: 'arcade', order: 42, category: 'Arcade', section: 'Arcade', title: 'Arcade Baso', genre: 'Arcade · 4 classici', accent: '#36e0ff',
  desc: 'Quattro classici da sala giochi al neon: lo sparatutto Astro Baso, lo spaccamattoni Rimbalzo, la corsa infinita Corri Baso e il Labirinto Goloso. Record, sfida del giorno, monete e colori.',
  stat: () => { const p = arLoad(); const top = GAME_IDS.map((g) => best(p, g)).filter(Boolean).length; return p.games ? `${p.games} partite · ${top}/4 record · ${fmt(p.coins)} monete` : '4 giochi · sfida del giorno · 1-2 giocatori'; },
  cover: 'covers/arcade.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#07051a"/><g stroke="#ff4fd8" stroke-opacity=".3">${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 32} 100 L${160 + (i - 5) * 90} 180"/>`).join('')}</g>
    <path d="M150 40 l10 -24 l10 24 l14 8 l-14 2 l-10 8 l-10 -8 l-14 -2z" fill="#36e0ff"/>${Array.from({ length: 7 }, (_, c) => `<rect x="${60 + c * 30}" y="70" width="26" height="10" rx="2" fill="${['#ff4f8b', '#ff7a3d', '#ffd23f', '#3dffb0', '#36e0ff', '#7d8cff', '#a65bff'][c]}"/>`).join('')}
    <circle cx="96" cy="138" r="14" fill="#7dff5a"/><circle cx="91" cy="134" r="3.5" fill="#fff"/><circle cx="101" cy="134" r="3.5" fill="#fff"/><ellipse cx="226" cy="136" rx="11" ry="13" fill="#ff3b4f"/><rect x="215" y="135" width="22" height="4" fill="#16101e"/></svg>`,
  play: (App) => go(App, { page: 'home' }),
  modes: [
    ...GAME_IDS.map((id) => ({ id, icon: ICON[id], name: GAMES[id].name, desc: () => { const b = best(arLoad(), id); return `${GAMES[id].genre}${b ? ` · record ${fmt(b)}` : ''}`; }, go: (App) => go(App, { game: id }) })),
    { id: 'daily', icon: 'calendar', name: 'Sfida del giorno', desc: () => { const d = dailySpec(); return `${GAMES[d.game].name} · ${d.twist.name}`; }, get tag() { const p = arLoad(); return p.daily?.key === dailySpec().key && p.daily.done ? '' : 'Nuova'; }, go: (App) => go(App, { daily: 1 }) },
  ],
  screens: { arcade: () => import('../../screens/arcade.js') },
  ownGL: ['arcade'],
  moods: { arcade: 'orda' },
  deepLink: 'arcade',
};
