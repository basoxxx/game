// Baso Hub entry for Serpentone (snake arena). Light: metadata, a store read, lazy screen.
import { spLoad } from '../../serpentone/store.js';
import { dailySpec, MODES, ARENAS } from '../../serpentone/meta.js';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const go = (App, extra = {}) => App.go('serpentone', { from: 'launcher', ...extra });

export default {
  id: 'serpentone', order: 40, category: 'Arcade', section: 'Serpentone', title: 'Serpentone', genre: 'Arcade · serpenti', accent: '#7ddc1f',
  desc: 'Serpenti cartoon in arene colorate: mangia le palline luminose, allungati e fai schiantare le rivali contro il tuo corpo.',
  stat: () => { const p = spLoad(); return p.games ? `Record ${fmt(p.bestLen)} · ${p.wins} vittorie · ${fmt(p.coins)} monete` : '4 arene, 4 modalità, cappelli e colori da sbloccare'; },
  cover: 'covers/serpentone.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#2f7d2a"/><path d="M30 130 C 80 60, 140 160, 190 90 S 270 60, 280 100" stroke="#7ddc1f" stroke-width="26" fill="none" stroke-linecap="round"/><path d="M30 130 C 80 60, 140 160, 190 90 S 270 60, 280 100" stroke="#c6f432" stroke-width="26" fill="none" stroke-linecap="round" stroke-dasharray="10 18"/><circle cx="284" cy="98" r="18" fill="#7ddc1f"/><circle cx="290" cy="90" r="6" fill="#fff"/><circle cx="292" cy="90" r="3" fill="#111"/></svg>`,
  play: (App) => go(App),
  modes: [
    { id: 'quick', icon: 'play', name: 'Gioca subito', desc: () => { const p = spLoad(); return `${MODES[p.mode]?.name || 'Classica'} · ${ARENAS[p.arena]?.name || 'Giardino'}`; }, go: (App) => go(App, { quick: 1 }), tag: 'Via!' },
    { id: 'classica', icon: 'trophy', name: 'Classica', desc: '3 minuti contro 11 serpenti: chiudi in testa alla classifica.', go: (App) => go(App, { mode: 'classica', quick: 1 }) },
    { id: 'sopravvivenza', icon: 'shield', name: 'Sopravvivenza', desc: () => { const p = spLoad(); return p.bestSurvive ? `Una vita sola · record ${Math.floor(p.bestSurvive / 60)}:${String(p.bestSurvive % 60).padStart(2, '0')}` : 'Una vita sola, rivali sempre più numerose.'; }, go: (App) => go(App, { mode: 'sopravvivenza', quick: 1 }) },
    { id: 'battaglia', icon: 'burst', name: 'Battaglia reale', desc: 'L’arena si stringe, nessuna rinascita: resta l’ultimo.', go: (App) => go(App, { mode: 'battaglia', quick: 1 }) },
    { id: 'duo', icon: 'users', name: '2 giocatori', desc: 'Schermo diviso: tastiera, due controller o tablet.', go: (App) => go(App, { mode: 'duo' }) },
    { id: 'daily', icon: 'calendar', name: 'Arena del giorno', desc: () => { const d = dailySpec(); return `${MODES[d.mode].name} · ${ARENAS[d.arena].name} · ${d.twist.name}`; }, get tag() { const p = spLoad(); return p.daily?.key === dailySpec().key && p.daily.done ? '' : 'Nuova'; }, go: (App) => go(App, { daily: 1 }) },
    { id: 'look', icon: 'palette', name: 'Colori e cappelli', desc: () => `${fmt(spLoad().coins)} monete da spendere`, go: (App) => go(App, { tab: 'skin' }) },
  ],
  screens: { serpentone: () => import('../../screens/serpentone.js') },
  ownGL: ['serpentone'],
  moods: { serpentone: 'voragine' },
  deepLink: 'serpentone',
};
