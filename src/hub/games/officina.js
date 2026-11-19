// Baso Hub entry: Officina (merge & upgrade motorsport garage). Light on purpose: metadata, a progress line
// from the tiny store and lazy screens. See src/hub/registry.js for the entry format.
import { ofPeek } from '../../officina/store.js';

const go = (App, panel) => App.go('officina', { from: 'launcher', ...(panel ? { panel } : {}) });

export default {
  id: 'officina', order: 40, category: 'Gestionali', section: 'Officina', title: 'Officina', genre: 'Gestionale · merge e corse', accent: '#ff7a1a',
  desc: 'Unisci ricambi e auto uguali per costruire bolidi sempre più veloci, dal kart alla Formula: incassa sulla pista di prova, vinci le gare contro le scuderie di Apex Dynasty e fonda una dinastia.',
  stat: () => { const p = ofPeek(); return p ? `Stagione ${p.season} · auto migliore liv. ${p.best} · ${p.trophies} trofei` : '30 auto da costruire, 42 gare, 7 garage'; },
  cover: 'covers/officina.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="of-g" cx=".55" cy=".5"><stop offset="0" stop-color="#ffd23f" stop-opacity=".8"/><stop offset=".5" stop-color="#ff7a1a" stop-opacity=".35"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs>
    <rect width="320" height="180" fill="#15181e"/><g stroke="rgba(255,255,255,.12)">${[0, 1, 2, 3].map((i) => `<rect x="${70 + i * 48}" y="58" width="42" height="42" rx="6" fill="none"/>`).join('')}${[0, 1, 2, 3].map((i) => `<rect x="${70 + i * 48}" y="106" width="42" height="42" rx="6" fill="none"/>`).join('')}</g>
    <circle cx="190" cy="102" r="70" fill="url(#of-g)"/>
    <g transform="translate(150 86)"><path d="M0 22 L12 8 L46 4 L70 12 L84 22 L80 30 L4 30Z" fill="#ff3b3b"/><circle cx="18" cy="30" r="8" fill="#111"/><circle cx="66" cy="30" r="8" fill="#111"/></g>
    <g transform="translate(86 112)"><path d="M0 18 L9 7 L30 4 L44 10 L52 18 L50 24 L2 24Z" fill="#2f80ff"/><circle cx="12" cy="24" r="6" fill="#111"/><circle cx="42" cy="24" r="6" fill="#111"/></g>
    <text x="232" y="64" font-family="Barlow Condensed, sans-serif" font-weight="900" font-style="italic" font-size="34" fill="#ffd23f">+1</text></svg>`,
  play: (App) => go(App),
  modes: [
    { id: 'garage', icon: 'wrench', name: 'Officina', desc: () => { const p = ofPeek(); return p ? `Stagione ${p.season}: riprendi a unire e potenziare.` : 'Due kart ti aspettano: uniscili e parti.'; }, tag: 'Via!', go: (App) => go(App) },
    { id: 'gare', icon: 'flag', name: 'Gare', desc: 'Accelerazione, giro secco e testa a testa: medaglie e trofei.', go: (App) => go(App, 'gare') },
    { id: 'ricerca', icon: 'bulb', name: 'Ricerca', desc: 'Albero tecnico: incasso, consegne, capo officina, prestazioni.', go: (App) => go(App, 'ricerca') },
    { id: 'missioni', icon: 'calendar', name: 'Missioni del giorno', desc: () => { const p = ofPeek(); return p?.missionsDone ? `${p.missionsDone} da riscuotere! Gettoni per i boost.` : 'Tre obiettivi al giorno, gettoni per i boost.'; }, get tag() { return ofPeek()?.missionsDone ? 'Premio' : ''; }, go: (App) => go(App, 'missioni') },
    { id: 'stagione', icon: 'trophy', name: 'Nuova stagione', desc: 'Ricomincia con i punti dinastia: bonus permanenti.', go: (App) => go(App, 'stagione') },
  ],
  screens: { officina: () => import('../../screens/officina.js') },
  ownGL: ['officina'],
  moods: { officina: 'manage' },
  deepLink: 'officina',
};
