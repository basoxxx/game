// Baso Hub entry: Rompicapo (a collection of four quick puzzles). Light on purpose: metadata, a store
// read for the progress line and the daily, lazy screen. See src/hub/registry.js.
import { rpLoad } from '../../rompicapo/store.js';
import { dailyInfo } from '../../rompicapo/meta.js';

const go = (App, extra = {}) => App.go('rompicapo', { from: 'launcher', ...extra });
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const doneToday = () => { const p = rpLoad(), k = dailyInfo().key; return p.daily?.key === k ? Object.keys(p.daily.done || {}).length : 0; };

export default {
  id: 'rompicapo', order: 42, category: 'Puzzle', section: 'Rompicapo', title: 'Rompicapo', genre: 'Puzzle · collezione', accent: '#4cc3ff',
  desc: 'Quattro rompicapo veloci in una scatola: Sudoku, Unisci, Mattoncini e Mahjong, con le sfide del giorno, statistiche e temi da sbloccare.',
  stat: () => { const p = rpLoad(), n = p.sudoku.won + p.mahjong.won + p.unisci.played + p.mattoncini.played; return n ? `${n} partite · ${fmt(p.coins)} monete · sfide di oggi ${doneToday()}/4${p.streak > 1 ? ` · serie ${p.streak}` : ''}` : 'Sudoku, Unisci, Mattoncini, Mahjong e la sfida del giorno'; },
  cover: 'covers/rompicapo.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#0e1424"/>
    <g transform="translate(18 26)">${Array.from({ length: 9 }, (_, i) => `<rect x="${(i % 3) * 38}" y="${Math.floor(i / 3) * 38}" width="36" height="36" rx="4" fill="#1a2440" stroke="#2b3a62"/>`).join('')}<text x="57" y="70" font-size="30" font-weight="800" fill="#6fd0ff" text-anchor="middle">7</text></g>
    <g transform="translate(150 30)">${[['#ffd23f', 2], ['#ff7a3d', 8], ['#ff4d6d', 32], ['#8a5cff', 128]].map(([c, v], i) => `<rect x="${(i % 2) * 52}" y="${Math.floor(i / 2) * 52}" width="48" height="48" rx="9" fill="${c}"/><text x="${(i % 2) * 52 + 24}" y="${Math.floor(i / 2) * 52 + 32}" font-size="20" font-weight="800" fill="#fff" text-anchor="middle">${v}</text>`).join('')}</g>
    <g transform="translate(266 40)">${[[0, 0, '#3fe0f0'], [0, 22, '#3fe0f0'], [0, 44, '#3fe0f0'], [0, 66, '#3fe0f0'], [22, 66, '#b35cff'], [22, 44, '#b35cff']].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="20" height="20" rx="4" fill="${c}"/>`).join('')}</g></svg>`,
  play: (App) => go(App),
  modes: [
    { id: 'sudoku', icon: 'board', name: 'Sudoku', desc: () => { const s = rpLoad().sudoku; return s.save ? 'Hai un sudoku in corso: riprendilo.' : s.won ? `${s.won} risolti · 4 difficoltà con soluzione unica` : '4 difficoltà, note, aiuti ragionati, soluzione unica.'; }, go: (App) => go(App, { tab: 'sudoku' }), tag: 'Logica' },
    { id: 'unisci', icon: 'plus', name: 'Unisci', desc: () => { const b = rpLoad().unisci.best; return b[4] ? `Record 4×4: ${fmt(b[4])} punti` : 'Fai scorrere e unisci i numeri fino al 2048: 4×4, 5×5, 6×6.'; }, go: (App) => go(App, { tab: 'unisci' }) },
    { id: 'mattoncini', icon: 'chart', name: 'Mattoncini', desc: () => { const b = rpLoad().mattoncini.best; return b.maratona ? `Record maratona: ${fmt(b.maratona)}` : 'Pezzi che cadono: Maratona, Sprint 40 linee, Ultra 2 minuti.'; }, go: (App) => go(App, { tab: 'mattoncini' }) },
    { id: 'mahjong', icon: 'target', name: 'Mahjong', desc: () => { const s = rpLoad().mahjong; return s.won ? `${s.won} tavoli sgombrati` : 'Coppie di tessere libere su 6 disposizioni a strati.'; }, go: (App) => go(App, { tab: 'mahjong' }) },
    { id: 'daily', icon: 'calendar', name: 'Rompicapo del giorno', desc: () => { const n = doneToday(); return n ? `${n}/4 sfide fatte oggi · le stesse per tutti` : 'Quattro sfide al giorno, uguali per tutti: una per gioco.'; }, get tag() { return doneToday() < 4 ? 'Nuova' : ''; }, go: (App) => go(App, { tab: 'daily' }) },
  ],
  screens: { rompicapo: () => import('../../screens/rompicapo.js') },
  ownGL: ['rompicapo'],
  moods: { rompicapo: 'manage' },
  deepLink: 'rompicapo',
};
