// Rompicapo — the collection: games, cosmetic themes, daily challenges and rewards. Pure data.
import { hashStr, dayKey, dayNumber } from './util.js';

export const GAMES = [
  { id: 'sudoku', name: 'Sudoku', icon: 'board', color: '#3aa0ff', tag: 'Logica', pitch: 'Nove righe, nove colonne, nove riquadri: ogni cifra una volta sola.' },
  { id: 'unisci', name: 'Unisci', icon: 'plus', color: '#ffb02e', tag: 'Numeri', pitch: 'Fai scorrere le tessere, unisci le uguali e raddoppia fino al 2048.' },
  { id: 'mattoncini', name: 'Mattoncini', icon: 'chart', color: '#ff4d6d', tag: 'Riflessi', pitch: 'Pezzi che cadono, linee da completare, velocità che cresce.' },
  { id: 'mahjong', name: 'Mahjong', icon: 'target', color: '#2fd3a0', tag: 'Abbinamenti', pitch: 'Coppie di tessere libere a strati: sgombra il tavolo.' },
];
export const GAME = Object.fromEntries(GAMES.map((g) => [g.id, g]));

// Cosmetic themes: palettes for every puzzle (bought with coins, never with money)
export const THEMES = [
  { id: 'notte', name: 'Notte', cost: 0, dark: true, v: { bg: '#0e1424', bg2: '#17213a', panel: '#1a2440', line: '#2b3a62', ink: '#eaf0ff', ink2: '#9fb0d6', acc: '#4cc3ff', acc2: '#ffcf4a', cell: '#141d34', given: '#eaf0ff', user: '#6fd0ff', sel: '#27406e', same: '#21365e', bad: '#ff5d73', face: '#f6f1e4', side: '#c9b98f', back: '#3a7d6a' },
    tiles: ['#2a3557', '#3d5a99', '#3f7fd6', '#24a7e0', '#1fc7b6', '#36d17c', '#9bd23c', '#ffd23f', '#ffa83a', '#ff7a3d', '#ff4d6d', '#d94dff', '#8a5cff'], blocks: ['#3fe0f0', '#3a7bff', '#ff9b2e', '#ffd23f', '#3fdc6e', '#b35cff', '#ff4d5e'] },
  { id: 'carta', name: 'Carta', cost: 150, dark: false, v: { bg: '#f3ecdc', bg2: '#e8dcc2', panel: '#fbf6ea', line: '#d6c7a6', ink: '#3b2f22', ink2: '#7c6a52', acc: '#c0582d', acc2: '#2d7fc0', cell: '#fffaf0', given: '#3b2f22', user: '#2d6fb0', sel: '#f3d9a8', same: '#efe2c4', bad: '#d23c3c', face: '#fffdf6', side: '#d9c79c', back: '#a8452c' },
    tiles: ['#e4d6b8', '#eed9a6', '#f2c27a', '#f2a65a', '#ee8545', '#e2623b', '#cf4a3e', '#b9475d', '#8e4d7c', '#5d5b98', '#3d78a8', '#2f95a0', '#3aa37a'], blocks: ['#3a9bb0', '#3d62a8', '#d9822b', '#e0b43a', '#5aa04a', '#8a55a8', '#c94a3d'] },
  { id: 'menta', name: 'Menta', cost: 250, dark: false, v: { bg: '#e6f6ef', bg2: '#cdeedd', panel: '#f5fcf8', line: '#b4dcc7', ink: '#17392b', ink2: '#4f7a66', acc: '#14a37f', acc2: '#ff8a5b', cell: '#ffffff', given: '#17392b', user: '#0f8f6f', sel: '#bfeedd', same: '#dcf3e8', bad: '#e04b5a', face: '#ffffff', side: '#a9d8c2', back: '#14a37f' },
    tiles: ['#cfeee1', '#a8e6cf', '#7fd8b6', '#56c9a0', '#2fb98c', '#1fa587', '#24908a', '#2b7a8c', '#ff9f80', '#ff8066', '#ff6b6b', '#e8578a', '#b05cc9'], blocks: ['#3cc7c0', '#4a8fe0', '#ff9a5a', '#f5c84a', '#46c27a', '#9b6be0', '#f2647a'] },
  { id: 'tramonto', name: 'Tramonto', cost: 350, dark: true, v: { bg: '#231334', bg2: '#4a1f45', panel: '#2f1a43', line: '#5b3170', ink: '#fff0e6', ink2: '#e0aac4', acc: '#ff8a4c', acc2: '#ffd36e', cell: '#2a1640', given: '#fff0e6', user: '#ffb27a', sel: '#5a2d63', same: '#43244f', bad: '#ff4f6a', face: '#fff3e2', side: '#e0a66e', back: '#b6386b' },
    tiles: ['#3b2150', '#5b2a6b', '#7d3380', '#a33d8a', '#c9478c', '#e85a7f', '#ff7270', '#ff8f5c', '#ffad4f', '#ffc94f', '#ffe36b', '#fff28f', '#ffffff'], blocks: ['#ff9ad1', '#9b7bff', '#ff8a4c', '#ffd36e', '#7ee3a4', '#d46bff', '#ff4f6a'] },
  { id: 'oceano', name: 'Oceano', cost: 400, dark: true, v: { bg: '#061d2b', bg2: '#0a3446', panel: '#0d2d40', line: '#16506a', ink: '#e6fbff', ink2: '#86c3d6', acc: '#2fe0d0', acc2: '#ffd166', cell: '#0a2535', given: '#e6fbff', user: '#5ff2e0', sel: '#13506a', same: '#0f3d52', bad: '#ff6b6b', face: '#eefcff', side: '#8fc8d4', back: '#1b6f8a' },
    tiles: ['#123a52', '#14506e', '#176a8c', '#1a86a6', '#20a2b8', '#2fbfc0', '#4fd6bd', '#7fe6b6', '#ffd166', '#ffb35c', '#ff8f5c', '#ff6b6b', '#e05ca8'], blocks: ['#5ff2e0', '#3a8bff', '#ffb35c', '#ffd166', '#5fe08a', '#a07bff', '#ff6b6b'] },
  { id: 'bosco', name: 'Bosco', cost: 300, dark: true, v: { bg: '#141d12', bg2: '#22321c', panel: '#1d2a19', line: '#3a5330', ink: '#f1f6e6', ink2: '#a9bf95', acc: '#9ad14b', acc2: '#ffb347', cell: '#18231a', given: '#f1f6e6', user: '#b9e86f', sel: '#33502a', same: '#283e22', bad: '#ff6150', face: '#f5f0dc', side: '#b89f6a', back: '#5e7d2e' },
    tiles: ['#2b3a24', '#3b5230', '#4d6b39', '#62873f', '#7ca545', '#9ac04f', '#c3d35a', '#e6d46a', '#e8b25a', '#d98c4c', '#c06a43', '#9c4f3d', '#7a3d3a'], blocks: ['#7fd6c0', '#5c8fd6', '#e8a04a', '#e6d46a', '#9ad14b', '#b07ad6', '#e0604f'] },
  { id: 'caramella', name: 'Caramella', cost: 450, dark: false, v: { bg: '#fdeef6', bg2: '#f7d9ec', panel: '#fff7fb', line: '#f0c2dc', ink: '#4a2140', ink2: '#9a5d86', acc: '#ff5fa8', acc2: '#6c8cff', cell: '#ffffff', given: '#4a2140', user: '#d63f8a', sel: '#ffd0e6', same: '#ffe6f2', bad: '#e0304a', face: '#fffafd', side: '#f0b8d4', back: '#ff7fb6' },
    tiles: ['#ffe0ef', '#ffc6e2', '#ffa8d2', '#ff8bc2', '#ff6fb0', '#f0589c', '#c86cff', '#9d84ff', '#7aa0ff', '#5cc1ff', '#4fdcd6', '#6fe8a0', '#ffd86f'], blocks: ['#7fd8ff', '#9d84ff', '#ffa36f', '#ffd86f', '#7fe0a0', '#d77cff', '#ff6f9a'] },
  { id: 'neon', name: 'Neon', cost: 500, dark: true, v: { bg: '#05050c', bg2: '#120a24', panel: '#0e0c1c', line: '#2e2350', ink: '#f4f0ff', ink2: '#9c8fd0', acc: '#39ffb4', acc2: '#ff3bd4', cell: '#0a0916', given: '#f4f0ff', user: '#39ffb4', sel: '#2a1f55', same: '#1c1640', bad: '#ff3b6b', face: '#e9e4ff', side: '#7a6cc9', back: '#ff3bd4' },
    tiles: ['#1a1636', '#2a1f66', '#3b25a8', '#5a2ee0', '#8a35ff', '#c13bff', '#ff3bd4', '#ff3b8a', '#ff5a3b', '#ffb03b', '#e8ff3b', '#7bff3b', '#39ffb4'], blocks: ['#3bf7ff', '#3b7bff', '#ff9b3b', '#fff03b', '#39ff8a', '#c13bff', '#ff3b6b'] },
];
export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const themeVars = (id) => { const t = THEME[id] || THEMES[0]; return Object.entries(t.v).map(([k, v]) => `--rp-${k}:${v}`).join(';') + `;color-scheme:${t.dark ? 'dark' : 'light'}`; };

// ------------------------------------------------------------------ daily challenges (same for everyone)
const SD_WEEK = ['esperto', 'facile', 'medio', 'medio', 'difficile', 'difficile', 'esperto']; // Sun … Sat
const MJ_ROT = ['quadrato', 'piramide', 'fortezza', 'farfalla', 'ponte', 'piramide', 'fortezza'];
export function dailyInfo(d = new Date()) {
  const key = dayKey(d), num = dayNumber(d), wd = d.getDay(), weekend = wd === 0 || wd === 6;
  const seed = (g) => hashStr(`rompicapo:${g}:${key}`);
  return {
    key, num, featured: GAMES[((num % 4) + 4) % 4].id,
    sudoku: { seed: seed('sudoku') % 1e9, diff: SD_WEEK[wd] },
    unisci: { seed: seed('unisci'), size: 4, goal: weekend ? 512 : 256 },
    mattoncini: { seed: seed('mattoncini'), mode: 'ultra' },
    mahjong: { seed: seed('mahjong') % 1e9, layout: MJ_ROT[wd] },
  };
}
export const dailyDesc = (g, info) => ({
  sudoku: () => `Sudoku ${info.sudoku.diff} · uguale per tutti`,
  unisci: () => `Arriva al ${info.unisci.goal} con meno mosse possibile`,
  mattoncini: () => 'Ultra 2 minuti con la stessa sequenza di pezzi per tutti',
  mahjong: () => `Mahjong «${info.mahjong.layout[0].toUpperCase() + info.mahjong.layout.slice(1)}» · stessa smazzata per tutti`,
}[g]());
export const DAILY_REWARD = 30, DAILY_ALL_BONUS = 60;
