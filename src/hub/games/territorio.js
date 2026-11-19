// Baso Hub entry for Territorio (territory capture arcade). Light: metadata, a store read, lazy screen.
import { trLoad, trBest } from '../../territorio/store.js';

const pct = (x) => `${(+x || 0).toFixed(1).replace('.', ',')}%`;
export default {
  id: 'territorio', order: 40, category: 'Arcade', section: 'Territorio', title: 'Territorio', genre: 'Arcade · conquista', accent: '#16c79a',
  desc: 'Esci dal tuo terreno, traccia una scia e richiudila per conquistare l’arena. Taglia le scie dei rivali, ma proteggi la tua.',
  stat: () => { const p = trLoad(); const b = trBest(p); return p.games ? `${b > 0 ? `Record ${pct(b)} · ` : ''}${p.games} partite · ${p.wins} vittorie` : '8 veicoli in arena, una sola scia da difendere'; },
  cover: 'covers/territorio.webp',
  play: (App) => App.go('territorio', { from: 'launcher' }),
  modes: [
    { id: 'quick', icon: 'play', name: 'Gioca subito', desc: () => { const p = trLoad(); return `Ultima scelta: ${({ classica: 'Classica', battaglia: 'Battaglia a tempo', squadre: 'Squadre' })[p.mode] || 'Classica'}`; }, go: (App) => App.go('territorio', { from: 'launcher', quick: 1 }), tag: 'Via!' },
    { id: 'classica', icon: 'target', name: 'Classica', desc: 'Una vita sola: conquista il 50% dell’arena.', go: (App) => App.go('territorio', { from: 'launcher', mode: 'classica' }) },
    { id: 'battaglia', icon: 'hourglass', name: 'Battaglia a tempo', desc: '3 minuti, si rinasce: vince chi ha più terreno.', go: (App) => App.go('territorio', { from: 'launcher', mode: 'battaglia' }) },
    { id: 'squadre', icon: 'flag', name: 'Squadre', desc: 'Rossi contro Blu, 4 contro 4.', go: (App) => App.go('territorio', { from: 'launcher', mode: 'squadre' }) },
    { id: 'multi', icon: 'users', name: '2–4 giocatori', desc: 'Schermo diviso o condiviso, tastiera, controller e tocco.', go: (App) => App.go('territorio', { from: 'launcher', tab: 'multi' }) },
    { id: 'daily', icon: 'calendar', name: 'Arena del giorno', desc: () => { const p = trLoad(), d = new Date(), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return p.daily?.key === k && p.daily.done ? `Oggi: ${pct(p.daily.best)} · riprova` : 'Stessa arena per tutti, bonus monete.'; }, go: (App) => App.go('territorio', { from: 'launcher', daily: 1 }) },
    { id: 'garage', icon: 'palette', name: 'Garage', desc: 'Colori, veicoli e scie da sbloccare con le monete.', go: (App) => App.go('territorio', { from: 'launcher', tab: 'garage' }) },
  ],
  screens: { territorio: () => import('../../screens/territorio.js') },
  ownGL: ['territorio'],
  moods: { territorio: 'voragine' },
  deepLink: 'territorio',
};
