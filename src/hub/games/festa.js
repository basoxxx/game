// Baso Hub entry: Festa Baso (local party game, 15 minigames built from the other Baso Hub games).
// Light on purpose: metadata, a progress line from the store and the lazy screen. See src/hub/registry.js.
import { fePeek } from '../../festa/store.js';

const go = (App, page) => App.go('festa', { from: 'launcher', ...(page ? { page } : {}) });
const peek = () => fePeek() || {};

export default {
  id: 'festa', order: 45, category: 'Party', section: 'Festa', title: 'Festa Baso', genre: 'Party · 2-4 giocatori', accent: '#ff4d6d',
  desc: 'Il party game del Baso Hub: tabellone con dado, monete e stelle, 15 minigiochi lampo presi da Orda, Kart, Voragine, Serpentone, Minigolf, Ingorgo, Bastione e gli altri, per 2-4 giocatori sullo stesso schermo.',
  stat: () => { const p = peek(), s = p.stats; return s?.minis ? `${s.boards || 0} feste · ${s.kings || 0} corone · ${(p.coins || 0).toLocaleString('it-IT')} monete` : '15 minigiochi · tabellone, torneo, allenamento'; },
  cover: 'covers/festa.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#7fd0ff"/><ellipse cx="160" cy="150" rx="150" ry="40" fill="#78cc5a"/>
    ${['#2f8cff', '#ff4d4d', '#2fd36b', '#ffc21a', '#2f8cff', '#2f8cff'].map((c, i) => `<ellipse cx="${50 + i * 44}" cy="${148 - Math.sin(i) * 8}" rx="16" ry="6" fill="${c}"/>`).join('')}
    ${['#18c1b0', '#ffc928', '#ff3b3b', '#ff8a1f'].map((c, i) => `<g transform="translate(${92 + i * 46} ${112 - (i % 2) * 10})"><rect x="-12" y="-26" width="24" height="30" rx="12" fill="${c}"/><circle cx="-4" cy="-14" r="3.5" fill="#fff"/><circle cx="4" cy="-14" r="3.5" fill="#fff"/></g>`).join('')}
    <path d="M160 18 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2z" fill="#ffd23f"/></svg>`,
  play: (App) => go(App),
  modes: [
    { id: 'board', icon: 'board', name: 'Tabellone', desc: 'Dado, caselle, monete e stelle: un minigioco a ogni turno e il podio finale.', tag: 'Festa!', go: (App) => go(App, 'board') },
    { id: 'torneo', icon: 'trophy', name: 'Torneo', desc: () => `Scegli i minigiochi, il primo a ${peek().opts?.target || 3} vittorie è campione.`, go: (App) => go(App, 'torneo') },
    { id: 'train', icon: 'target', name: 'Allenamento', desc: 'Qualsiasi minigioco, anche da solo contro la CPU.', go: (App) => go(App, 'train') },
    { id: 'chars', icon: 'palette', name: 'Personaggi', desc: () => `${(peek().coins || 0).toLocaleString('it-IT')} monete per personaggi e cappelli.`, go: (App) => go(App, 'chars') },
  ],
  screens: { festa: () => import('../../screens/festa.js') },
  ownGL: ['festa'],
  moods: { festa: 'voragine' },
  deepLink: 'festa',
};
