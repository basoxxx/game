// Baso Hub entry: Tavolo Baso (collection of classic board games: chess, Italian draughts, four in a row,
// battleships; vs the computer or two players on one device, daily puzzles). Light: metadata, a store
// read and the lazy screen. See src/hub/registry.js.
import { tvPeek } from '../../tavolo/store.js';

const go = (App, page) => App.go('tavolo', { from: 'launcher', ...(page ? { page } : {}) });
const peek = () => tvPeek() || {};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const won = (g) => peek().stats?.[g]?.won || 0;

export default {
  id: 'tavolo', order: 48, category: 'Tavolo', section: 'Tavolo', title: 'Tavolo Baso', genre: 'Giochi da tavolo · 1-2 giocatori', accent: '#d9a441',
  desc: 'Scacchi, dama italiana, Quattro in fila e battaglia navale su tavoli 3D di legno e marmo: contro il computer (dal principiante al campione) o in due sullo stesso dispositivo, con i puzzle del giorno.',
  stat: () => { const p = peek(), s = p.stats; const n = s ? ['chess', 'dama', 'four', 'navale'].reduce((a, g) => a + (s[g]?.played || 0), 0) : 0; return n ? `${n} partite · ${s.puzzles || 0} puzzle · ${(p.coins || 0).toLocaleString('it-IT')} monete` : '4 giochi classici · puzzle del giorno'; },
  cover: 'covers/tavolo.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#2a1d14"/><g transform="translate(60 40) skewX(-20)">${Array.from({ length: 36 }, (_, i) => `<rect x="${(i % 6) * 26}" y="${Math.floor(i / 6) * 18}" width="26" height="18" fill="${(i + Math.floor(i / 6)) % 2 ? '#87552e' : '#e6c99a'}"/>`).join('')}</g><path d="M150 120h20l-3-10c6-4 7-12 2-17 4-4 3-10-3-12-6 2-7 8-3 12-5 5-4 13 2 17z" fill="#f3e6cc"/><path d="M196 120h22l-3-8c4-6 2-16-6-22l-4 6-4-4c-4 8-4 18 0 20z" fill="#2a1a12" stroke="#cfc6b8" stroke-width="1.5"/></svg>`,
  play: (App) => go(App),
  modes: [
    { id: 'chess', icon: 'board', name: 'Scacchi', desc: () => (won('chess') ? `${won('chess')} vittorie · motore dal principiante al campione` : 'Regole complete, 6 livelli, orologi, PGN.'), tag: 'Classico', go: (App) => go(App, 'chess') },
    { id: 'dama', icon: 'target', name: 'Dama italiana', desc: 'Presa obbligatoria con le priorità italiane, 4 livelli.', go: (App) => go(App, 'dama') },
    { id: 'four', icon: 'chart', name: 'Quattro in fila', desc: '7×6, fai cadere i dischi e allinea quattro.', go: (App) => go(App, 'four') },
    { id: 'navale', icon: 'compass', name: 'Battaglia navale', desc: 'Schiera la flotta e affonda quella nemica, anche in due.', go: (App) => go(App, 'navale') },
    { id: 'daily', icon: 'calendar', name: 'Puzzle del giorno', desc: () => { const p = peek(), d = p.daily?.key === today() ? p.daily : null; const n = d ? ['chess', 'four', 'navale'].filter((k) => d[k]?.done).length : 0; return n ? `Oggi ${n}/3 risolti · serie ${p.stats?.streak || 0}` : 'Matto in 2, vinci in 3, flotta nascosta.'; }, go: (App) => go(App, 'daily') },
    { id: 'shop', icon: 'palette', name: 'Tavoli e pezzi', desc: () => `${(peek().coins || 0).toLocaleString('it-IT')} monete per scacchiere e set di pezzi.`, go: (App) => go(App, 'shop') },
  ],
  screens: { tavolo: () => import('../../screens/tavolo.js') },
  ownGL: ['tavolo'],
  moods: { tavolo: 'manage' },
  deepLink: 'tavolo',
};
