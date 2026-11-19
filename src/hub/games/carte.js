// Baso Hub entry: Carte Baso, the card-games collection. Light on purpose: only the tiny
// src/carte/games/<id>.meta.js of each plug-in is read here (never the rules or the AI), a store read
// for the stat line, the lazy screen. One hub tile per card game + Statistiche.
import { cbPeek } from '../../carte/core/store.js';

const metas = Object.values(import.meta.glob('../../carte/games/*.meta.js', { eager: true, import: 'default' }))
  .filter((m) => m && m.id).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const peek = () => cbPeek() || {};
const go = (App, params) => App.go('carte', { from: 'launcher', ...params });
const card = (x, y, r, fill, txt, col = '#2a1f1a') => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-28" y="-46" width="56" height="92" rx="6" fill="#fbf6ea" stroke="#9a6a08" stroke-width="1.2"/>${fill}<text x="-20" y="-30" font-family="Georgia,serif" font-weight="700" font-size="14" fill="${col}">${txt}</text></g>`;

export default {
  id: 'carte', order: 50, category: 'Carte', section: 'Carte', title: 'Carte Baso', genre: 'Carte · 1-4 giocatori', accent: '#2f8a4e',
  desc: 'Il tavolo da gioco di casa: Scopa, Scopone scientifico, Briscola e gli altri classici con carte napoletane, piacentine e francesi, contro la CPU o a turno con gli amici.',
  stat: () => { const p = peek(), t = p.total; return t?.played ? `${t.played} partite · ${t.won} vinte · ${(p.coins || 0).toLocaleString('it-IT')} monete` : `${metas.length} giochi di carte · CPU a 3 livelli`; },
  cover: 'covers/carte.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="cbf" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#2f8a4e"/><stop offset="1" stop-color="#0f3f22"/></radialGradient></defs><rect width="320" height="180" fill="url(#cbf)"/>
    ${card(120, 100, -14, '<circle r="16" fill="#e8b52c" stroke="#9a6a08" stroke-width="2"/><circle r="6" fill="#b8262c"/>', '7')}
    ${card(160, 92, 0, '<path d="M-12 -14h24q0 14-9 18v8l6 4h-18l6-4v-8q-9-4-9-18z" fill="#e8b52c" stroke="#9a6a08" stroke-width="1.5"/>', '1')}
    ${card(200, 100, 14, '<path d="M0 -30l4 6v34h-8v-34z" fill="#6f9be0" stroke="#22427a"/><rect x="-10" y="8" width="20" height="4" fill="#e8b52c"/>', '3')}</svg>`,
  play: (App) => go(App),
  modes: [
    ...metas.map((m) => ({ id: m.id, icon: m.icon || 'play', name: m.name, desc: m.short || '', tag: m.tag || '', go: (App) => go(App, { game: m.id }) })),
    { id: 'stats', icon: 'chart', name: 'Statistiche', desc: () => { const t = peek().total; return t?.played ? `${t.played} partite giocate, ${t.won} vinte: record e serie per ogni gioco.` : 'Partite, vittorie, serie e record per ogni gioco.'; }, go: (App) => go(App, { page: 'stats' }) },
  ],
  screens: { carte: () => import('../../screens/carte.js') },
  moods: { carte: 'menu' },
  deepLink: 'carte',
};
