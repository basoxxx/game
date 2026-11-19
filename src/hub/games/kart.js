// Baso Hub entry for Kart Baso (src/kart, src/screens/kart.js). Light: metadata, a direct read of the
// saved progress for the stat line, lazy screen import.
const read = () => { try { return JSON.parse(localStorage.getItem('sala_kart_v1') || 'null') || {}; } catch { return {}; } };
const cups = (p) => Object.values(p.trophies || {}).filter((t) => Object.values(t || {}).some((v) => v > 0)).length;
const go = (page) => (App) => App.go('kart', { from: 'launcher', page });

export default {
  id: 'kart', order: 10, category: 'Corse', section: 'Kart', title: 'Kart Baso', genre: 'Corse arcade', accent: '#ff3b6b',
  desc: 'Kart cartoon con derapate e mini-turbo, peperoncini, ricciolini a ricerca e bombe rimbalzine: 8 piloti, 8 piste, 4 coppe e battaglie fino a 4 giocatori.',
  stat: () => { const p = read(); return p.games ? `${cups(p)}/4 coppe · ${p.wins || 0} vittorie · ${(p.coins || 0).toLocaleString('it-IT')} monete` : '8 piloti, 8 piste, 4 coppe, battaglia'; },
  cover: 'covers/kart.webp',
  art: () => '<svg viewBox="0 0 320 180" aria-hidden="true"><defs><linearGradient id="kbs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb8ff"/><stop offset="1" stop-color="#d4f1ff"/></linearGradient></defs><rect width="320" height="180" fill="url(#kbs)"/><path d="M0 120 Q160 80 320 120 V180 H0z" fill="#5cc24a"/><path d="M60 180 Q160 100 260 180" fill="#5d6270"/><rect x="138" y="118" width="44" height="22" rx="8" fill="#ff3b6b"/><circle cx="160" cy="108" r="12" fill="#f6c69a"/><circle cx="142" cy="142" r="8" fill="#22252b"/><circle cx="178" cy="142" r="8" fill="#22252b"/></svg>',
  play: (App) => App.go('kart', { from: 'launcher' }),
  modes: [
    { id: 'gp', icon: 'trophy', name: 'Gran Premio', desc: () => { const p = read(); return p.gp ? `Gran Premio in corso: gara ${(p.gp.round || 0) + 1} di 4.` : 'Quattro gare, punti e trofei: vinci le coppe.'; }, go: go('gp'), get tag() { return read().gp ? 'In corso' : ''; } },
    { id: 'race', icon: 'flag', name: 'Gara singola', desc: 'Una gara su qualsiasi pista sbloccata, anche al rovescio.', go: go('race') },
    { id: 'tt', icon: 'hourglass', name: 'Prova a tempo', desc: 'Contro il fantasma del tuo record, per le medaglie.', go: go('tt') },
    { id: 'battle', icon: 'target', name: 'Battaglia', desc: 'Palloncini e oggetti nell’arena: resta l’ultimo.', go: go('battle') },
    { id: 'multi', icon: 'users', name: 'Multigiocatore', desc: 'Schermo diviso da 2 a 4 giocatori, tastiera e controller.', go: go('multi'), tag: 'Locale' },
  ],
  screens: { kart: () => import('../../screens/kart.js') },
  ownGL: ['kart'],
  moods: { kart: 'derby' },
  deepLink: 'kart',
};
