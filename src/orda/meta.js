// Orda — progression data: upgrades, champions, skins, worlds, rewards. No three.js here: the menu
// screen, the launcher and the headless balance script all read it.

// ---- cannon / crowd upgrades (levels 0..max). eff(l) is what the simulation reads.
export const UPGRADES = [
  { id: 'rate', name: 'Cadenza', icon: 'speed', desc: 'Il cannone spara più figure al secondo.', max: 10, base: 40, eff: (l) => 4.5 + 0.4 * l, fmt: (v) => `${v.toFixed(1)} colpi/s` },
  { id: 'shot', name: 'Raffica', icon: 'users', desc: 'Più figure per ogni colpo.', max: 6, base: 90, eff: (l) => 1 + 0.2 * l, fmt: (v) => `${v.toFixed(2)} per colpo` },
  { id: 'hp', name: 'Tempra', icon: 'shield', desc: 'Le tue figure resistono di più negli scontri.', max: 8, base: 60, eff: (l) => 1 + 0.12 * l, fmt: (v) => `forza ×${v.toFixed(2)}` },
  { id: 'speed', name: 'Passo', icon: 'flag', desc: 'Le figure corrono più veloci verso la base.', max: 8, base: 45, eff: (l) => 6 + 0.4 * l, fmt: (v) => `${v.toFixed(1)} m/s` },
  { id: 'charge', name: 'Carica', icon: 'bolt', desc: 'Il campione si carica prima.', max: 8, base: 55, eff: (l) => 1 - 0.06 * l, fmt: (v) => `carica ×${(1 / v).toFixed(2)}` },
  { id: 'armor', name: 'Bastione', icon: 'wrench', desc: 'Il cannone regge più nemici prima di cadere.', max: 6, base: 50, eff: (l) => 1 + 0.2 * l, fmt: (v) => `difesa ×${v.toFixed(1)}` },
];
export const upCost = (u, l) => Math.round((u.base * Math.pow(1.47, l)) / 5) * 5;
export const upEffects = (up = {}) => Object.fromEntries(UPGRADES.map((u) => [u.id, u.eff(Math.min(u.max, up[u.id] || 0))]));

// ---- champions: big characters launched when the charge meter is full
// hp: how much red they can take · dmg: damage on the base · spd: walk speed · r: body radius
export const CHAMPIONS = [
  { id: 'colosso', name: 'Colosso', role: 'Gigante', color: '#2f6bff', unlock: 0, desc: 'Lento e enorme: spiana le folle rosse e colpisce la base fortissimo.', stats: (l) => ({ hp: 60 + 15 * l, dmg: 45 + 12 * l, spd: 3.1, r: 1.25 }) },
  { id: 'grillo', name: 'Grillo', role: 'Saltatore', color: '#21c7a8', unlock: 5, desc: 'Salta muri, fosse e lame. A ogni atterraggio un’onda d’urto.', stats: (l) => ({ hp: 26 + 6 * l, dmg: 28 + 8 * l, spd: 5.6, r: 0.85, slam: 2.3 + 0.15 * l }) },
  { id: 'matrioska', name: 'Matrioska', role: 'Divisore', color: '#ff8a1f', unlock: 10, desc: 'Alla base si apre in tante figure. Le porte moltiplicano anche lei!', stats: (l) => ({ hp: 30 + 6 * l, dmg: 10 + 3 * l, spd: 4.4, r: 1.0, split: 10 + 3 * l }) },
  { id: 'testuggine', name: 'Testuggine', role: 'Scudiero', color: '#8b5cff', unlock: 15, desc: 'Avanza con una cupola: i nemici che la toccano svaniscono.', stats: (l) => ({ hp: 70 + 20 * l, dmg: 18 + 6 * l, spd: 3.4, r: 1.05, aura: 3.0 + 0.2 * l }) },
];
export const CHAMP_MAX = 5;
export const champCost = (l) => Math.round((140 * Math.pow(1.6, l)) / 10) * 10;
export const champById = (id) => CHAMPIONS.find((c) => c.id === id) || CHAMPIONS[0];

// ---- cosmetics. A skin colours your figures; a cannon skin colours the cannon.
// cost: coins · stars: unlocked by total stars instead
export const SKINS = [
  { id: 'azzurro', name: 'Azzurro', color: '#2f80ff', cost: 0 },
  { id: 'menta', name: 'Menta', color: '#20d6a0', cost: 150 },
  { id: 'uva', name: 'Uva', color: '#8b5cff', cost: 200 },
  { id: 'limone', name: 'Limone', color: '#ffd23f', cost: 250 },
  { id: 'notte', name: 'Notte', color: '#28348f', cost: 300 },
  { id: 'cielo', name: 'Cielo', color: '#6fd3ff', stars: 30 },
  { id: 'oro', name: 'Oro', color: '#f5c542', stars: 60 },
  { id: 'arcobaleno', name: 'Arcobaleno', color: '#2f80ff', rainbow: true, stars: 85, css: 'conic-gradient(#ff4d6d,#ffb000,#ffe066,#2ee6a6,#2f80ff,#8b5cff,#ff4d6d)' },
];
export const CANNONS = [
  { id: 'classico', name: 'Classico', body: '#2f80ff', trim: '#ffffff', barrel: '#dfe8ff', cost: 0 },
  { id: 'caramella', name: 'Caramella', body: '#ff6fb1', trim: '#ffffff', barrel: '#ffd1e6', cost: 200 },
  { id: 'bosco', name: 'Bosco', body: '#8a5a2b', trim: '#f2d29b', barrel: '#5b3b1d', cost: 250 },
  { id: 'robot', name: 'Robot', body: '#9aa7b8', trim: '#2ee6a6', barrel: '#5d6878', cost: 350 },
  { id: 'reale', name: 'Reale', body: '#f5c542', trim: '#8b5cff', barrel: '#fff1b8', stars: 45 },
];

// ---- worlds: 5 levels each, the fifth is a boss fortress
export const WORLDS = [
  { id: 'prato', name: 'Prato Fiorito', sub: 'Le prime porte, i primi rossi.', sky: '#9fe3ff', fog: '#d9f6ff', ground: '#7fd36b', ground2: '#6cc35a', lane: '#f4f1d0', rim: '#ffffff', deco: ['#ff7aa8', '#ffd23f', '#ffffff'] },
  { id: 'spiaggia', name: 'Spiaggia Frizzante', sub: 'Muri di sabbia e torri rosse.', sky: '#8fd8ff', fog: '#fff3d1', ground: '#ffe2a1', ground2: '#ffd486', lane: '#fff8e6', rim: '#5ec8e5', deco: ['#2ec4b6', '#ff9f43', '#ffffff'] },
  { id: 'canyon', name: 'Canyon Caramello', sub: 'Fosse e barriere in movimento.', sky: '#ffcf9e', fog: '#ffe6c9', ground: '#e9a868', ground2: '#dc9757', lane: '#ffe1b8', rim: '#a8552c', deco: ['#c0623a', '#ffd23f', '#7a4b2b'] },
  { id: 'ghiaccio', name: 'Ghiacciaio Menta', sub: 'Barre rotanti e lame di ghiaccio.', sky: '#bfe9ff', fog: '#ecfbff', ground: '#cdf3ee', ground2: '#b9ebe4', lane: '#ffffff', rim: '#62b6d9', deco: ['#9be7ff', '#ffffff', '#5ec8e5'] },
  { id: 'fabbrica', name: 'Fabbrica Ingranaggi', sub: 'Tutto si muove, tutto taglia.', sky: '#c7c9ff', fog: '#e7e8ff', ground: '#b9bfd0', ground2: '#a8afc2', lane: '#ffe066', rim: '#5d6878', deco: ['#ffb000', '#5d6878', '#2f80ff'] },
  { id: 'vulcano', name: 'Vulcano Lampone', sub: 'L’ultima cittadella rossa.', sky: '#ffb3c1', fog: '#ffd9e0', ground: '#8f6a7a', ground2: '#806070', lane: '#ffc2d1', rim: '#ff4d6d', deco: ['#ff4d6d', '#ffb000', '#3a2a35'] },
];

// ---- rewards
export function starsFor(level, r) {
  if (!r.win) return 0;
  const S = level.stars || {};
  return 1 + (r.time <= (S.par ?? 60) ? 1 : 0) + (r.left >= (S.crowd ?? 30) ? 1 : 0);
}
// coins: replays pay half; new stars always pay their bonus
export function coinsFor(level, stars, prevStars, win) {
  const n = Number.isFinite(+level.id) && +level.id > 0 ? +level.id : 10, boss = !!level.base?.boss;
  if (!win) return 5 + Math.floor(n / 2);
  let c = 12 + n * 3 + stars * 5;
  if (prevStars > 0) c = Math.round(c / 2); else c += boss ? 40 : 10;
  c += Math.max(0, stars - prevStars) * 8;
  return c;
}
