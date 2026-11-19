// Territorio — light game data shared by the menu, the game and the tests (no three.js, no DOM):
// modes, arenas (with their obstacle layouts), colours, vehicles, trails, rivals, missions, rewards
// and the daily arena.
import { rng, hashStr, PERSONAS } from './sim.js';

export const MODES = {
  classica: { name: 'Classica', icon: 'target', sub: 'Una vita sola: conquista il 50% dell’arena prima che ti taglino la scia.', size: 96, rivals: 7, time: 0, target: 0.5, respawn: { human: false, ai: true } },
  battaglia: { name: 'Battaglia a tempo', icon: 'hourglass', sub: '3 minuti. Chi viene eliminato rinasce piccolo: allo scadere vince chi ha più terreno.', size: 104, rivals: 7, time: 180, respawn: { human: true, ai: true } },
  squadre: { name: 'Squadre', icon: 'users', sub: 'Rossi contro Blu, 4 contro 4: il terreno è di squadra, le scie dei compagni non si tagliano.', size: 112, rivals: 7, time: 180, teams: true, respawn: { human: true, ai: true } },
  eliminazione: { name: 'Ultimo in piedi', icon: 'burst', sub: 'Niente rinascite: resta l’ultimo (o l’ultima squadra) sull’arena.', size: 90, rivals: 5, time: 0, respawn: { human: false, ai: false }, lastStanding: true, mpOnly: true },
};
export const DIFFS = { facile: { name: 'Facile' }, normale: { name: 'Normale' }, difficile: { name: 'Difficile' } };

// arenas: palette for the board and the surroundings, obstacle style and layout generator
export const MAPS = {
  prato: { name: 'Prato', sub: 'Aperto, qualche masso: per imparare.', a: '#8fd46a', b: '#84c95f', line: '#76b955', edge: '#e9f7d8', ground: '#5c9e44', sky: '#9fd8ff', fog: '#cdeeff', obst: 'rock', obstC: '#9a9aa6', decor: ['#3fa34d', '#7bc043', '#2e8b57', '#f4c430', '#ff8fab'] },
  laghi: { name: 'Laghetti', sub: 'Stagni da aggirare: le scorciatoie costano.', a: '#f3e2b3', b: '#ecd9a6', line: '#e0ca8f', edge: '#fff8e6', ground: '#d8b978', sky: '#ffd6a0', fog: '#ffe9cc', obst: 'water', obstC: '#1f8fa8', decor: ['#6aa84f', '#e69138', '#f1c232', '#93c47d'] },
  cantiere: { name: 'Cantiere', sub: 'Muri di casse e corridoi stretti.', a: '#c9d1dc', b: '#bec7d3', line: '#aeb8c6', edge: '#f2f5fa', ground: '#7e8a9a', sky: '#b9c6ff', fog: '#dfe5ff', obst: 'crate', obstC: '#e0a23a', decor: ['#ff7b1c', '#ff9a3c'] },
  ciambella: { name: 'Ciambella', sub: 'Un vulcano al centro: si gira intorno.', a: '#f7c6d9', b: '#f1b9cf', line: '#e7a8c1', edge: '#fff0f6', ground: '#c77fa0', sky: '#c9b6ff', fog: '#efe6ff', obst: 'pillar', obstC: '#7c5cff', decor: ['#c27ba0', '#8e7cc3', '#f6b26b', '#ff8fab'] },
  notte: { name: 'Neon', sub: 'Arena notturna: le scie brillano al buio.', a: '#272b45', b: '#22263e', line: '#363c62', edge: '#9aa4ff', ground: '#151729', sky: '#0b0d1c', fog: '#1a1d36', obst: 'pillar', obstC: '#ff3df0', night: true, decor: ['#ff3df0', '#3df0ff', '#9a6bff'] },
};

// obstacle layout for an arena: Uint8Array(w*h) with 1 = blocked. Never near the spawn ring centre lines.
export function buildObstacles(map, w, h, seed) {
  const o = new Uint8Array(w * h), r = rng(seed + 77);
  const put = (i, j) => { if (i >= 2 && j >= 2 && i < w - 2 && j < h - 2) o[j * w + i] = 1; };
  const disc = (cx, cy, rad) => { for (let j = Math.floor(cy - rad); j <= cy + rad; j++) for (let i = Math.floor(cx - rad); i <= cx + rad; i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= rad * rad) put(i, j); };
  const blob = (cx, cy, rad) => { disc(cx, cy, rad); for (let k = 0; k < 3; k++) disc(cx + (r() - 0.5) * rad * 1.6, cy + (r() - 0.5) * rad * 1.6, rad * (0.5 + r() * 0.4)); };
  const cx = w / 2, cy = h / 2;
  if (map === 'prato') {
    for (let k = 0; k < 9; k++) { const a = r() * Math.PI * 2, d = 8 + r() * (w * 0.42); blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + r() * 1.3); }
  } else if (map === 'laghi') {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r() * 0.5, d = w * (0.2 + r() * 0.2); blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + r() * 2.5); }
    blob(cx, cy, 4);
  } else if (map === 'cantiere') {
    for (let k = 0; k < 14; k++) {
      const x = 8 + r() * (w - 16), y = 8 + r() * (h - 16), len = 5 + r() * 9, hor = r() < 0.5;
      for (let t = 0; t < len; t++) put(Math.floor(hor ? x + t : x), Math.floor(hor ? y : y + t));
      if (r() < 0.4) for (let t = 0; t < len * 0.5; t++) put(Math.floor(hor ? x : x + t), Math.floor(hor ? y + t : y));
    }
  } else if (map === 'ciambella' || map === 'notte') {
    disc(cx, cy, map === 'notte' ? 3.2 : 6.5);
    for (let k = 0; k < (map === 'notte' ? 16 : 8); k++) { const a = (k / (map === 'notte' ? 16 : 8)) * Math.PI * 2, d = map === 'notte' ? w * (k % 2 ? 0.2 : 0.4) : w * 0.27; disc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, map === 'notte' ? 1.2 : 1.8); }
  }
  return o;
}

// colours: your land, trail and vehicle (cost in coins, 0 = owned from the start)
export const COLORS = [
  { id: 'corallo', name: 'Corallo', color: '#ff4d6d', cost: 0 },
  { id: 'mare', name: 'Mare', color: '#2f9bff', cost: 0 },
  { id: 'lime', name: 'Lime', color: '#7ad13a', cost: 60 },
  { id: 'mandarino', name: 'Mandarino', color: '#ff8a1f', cost: 60 },
  { id: 'lavanda', name: 'Lavanda', color: '#a77bff', cost: 90 },
  { id: 'menta', name: 'Menta', color: '#1fd1a5', cost: 90 },
  { id: 'limone', name: 'Limone', color: '#ffd21f', cost: 120 },
  { id: 'fucsia', name: 'Fucsia', color: '#ff3fbf', cost: 150 },
  { id: 'notte', name: 'Mezzanotte', color: '#3b4bd8', cost: 200 },
  { id: 'cioccolato', name: 'Cacao', color: '#9b5b34', cost: 220 },
];
export const VEHICLES = [
  { id: 'cubo', name: 'Cubetto', sub: 'Il classico, con due occhi curiosi.', cost: 0 },
  { id: 'ape', name: 'Motocarro', sub: 'Tre ruote e un cassone.', cost: 120 },
  { id: 'ufo', name: 'Disco', sub: 'Un piccolo disco volante.', cost: 180 },
  { id: 'trottola', name: 'Trottola', sub: 'Gira gira sul terreno.', cost: 240 },
  { id: 'razzo', name: 'Razzo', sub: 'Con la fiammella dietro.', cost: 320 },
  { id: 'papera', name: 'Paperella', sub: 'Galleggia anche sull’asciutto.', cost: 400 },
];
// trail styles: drawn by the board shader (style id), plus optional particles
export const TRAILS = [
  { id: 'liscia', name: 'Liscia', style: 0, cost: 0 },
  { id: 'puntini', name: 'Puntini', style: 1, cost: 80 },
  { id: 'zebra', name: 'Zebra', style: 2, cost: 120 },
  { id: 'neon', name: 'Neon', style: 3, cost: 180 },
  { id: 'arcobaleno', name: 'Arcobaleno', style: 4, cost: 300 },
];

export const RIVAL_COLORS = ['#ffb000', '#2ec4b6', '#c77dff', '#80ed99', '#ff7b00', '#f15bb5', '#00bbf9', '#fee440', '#ff5252', '#5e7bff', '#a3e635'];
export const RIVAL_NAMES = ['Zolla', 'Recinto', 'Mattonella', 'Picchetto', 'Aiuola', 'Confine', 'Staccionata', 'Pennello', 'Rullo', 'Quadretto', 'Gessetto', 'Trattore', 'Ruspa', 'Tosaerba'];
export const TEAM_COLORS = ['#ff4d5e', '#3a86ff'];
export const TEAM_NAMES = ['Rossi', 'Blu'];
export const PLAYER_COLORS = ['#ff4d6d', '#2f9bff', '#7ad13a', '#ffd21f']; // local multiplayer defaults
export const PERSONA_IDS = Object.keys(PERSONAS);

// ---- local multiplayer: controls offered to each player slot
export const CONTROLS = {
  wasd: { name: 'W A S D', short: 'WASD' },
  frecce: { name: 'Frecce', short: '← ↑ → ↓' },
  ijkl: { name: 'I J K L', short: 'IJKL' },
  numpad: { name: 'Tastierino 8 4 5 6', short: 'Num 8456' },
  pad1: { name: 'Controller 1', short: 'Pad 1' },
  pad2: { name: 'Controller 2', short: 'Pad 2' },
  pad3: { name: 'Controller 3', short: 'Pad 3' },
  pad4: { name: 'Controller 4', short: 'Pad 4' },
  touch: { name: 'Tocco (zona dello schermo)', short: 'Tocco' },
};
export const DEFAULT_CONTROLS = ['wasd', 'frecce', 'ijkl', 'numpad'];

// ---- missions: three per match
const MP = [
  { id: 'pct', text: 'Conquista il {n}% dell’arena', ns: [8, 14, 22], coins: [12, 20, 32] },
  { id: 'kills', text: 'Elimina {n} rivali', text1: 'Elimina un rivale', ns: [1, 2, 4], coins: [12, 20, 34], vs: true },
  { id: 'loop', text: 'Chiudi un giro da {n} caselle', ns: [60, 120, 220], coins: [10, 18, 30] },
  { id: 'loops', text: 'Chiudi {n} giri', ns: [8, 15, 25], coins: [10, 16, 26] },
  { id: 'power', text: 'Raccogli {n} potenziamenti', text1: 'Raccogli un potenziamento', ns: [1, 2, 4], coins: [8, 14, 24] },
  { id: 'survive', text: 'Resta in gioco {n} secondi senza farti eliminare', ns: [45, 75, 110], coins: [12, 18, 28] },
];
export function pickMissions(rand, mode) {
  const pool = MP.filter((m) => !(m.id === 'survive' && mode === 'classica'));
  const out = [];
  while (out.length < 3 && pool.length) {
    const t = pool.splice((rand() * pool.length) | 0, 1)[0], i = (rand() * t.ns.length) | 0, n = t.ns[i];
    out.push({ id: t.id, n, text: (n === 1 && t.text1 ? t.text1 : t.text).replace('{n}', n), coins: t.coins[i], have: 0, done: false });
  }
  return out;
}
// value of a mission for a player in a running sim (stats tracked by the game)
export function missionValue(m, p, st) {
  if (m.id === 'pct') return st.bestPct;
  if (m.id === 'kills') return p.kills;
  if (m.id === 'loop') return p.bigLoop;
  if (m.id === 'loops') return p.loops;
  if (m.id === 'power') return p.powers;
  if (m.id === 'survive') return st.bestLife;
  return 0;
}

// ---- rewards
export function matchCoins(r) {
  return Math.round(r.bestPct * 1.6 + r.kills * 6 + (r.win ? 25 : 0) + (r.stars || 0) * 5);
}
export function starsFor(mode, r) {
  if (mode === 'classica') return r.bestPct >= 50 ? 3 : r.bestPct >= 25 ? 2 : r.bestPct >= 10 ? 1 : 0;
  if (mode === 'squadre') return r.win ? (r.teamPct >= 55 ? 3 : 2) : r.teamPct >= 30 ? 1 : 0;
  return r.pos === 1 ? 3 : r.pos <= 3 ? 2 : r.bestPct >= 8 ? 1 : 0;
}

// ---- daily arena: same map, rivals and seed for everybody on a given day
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dailySpec(d = new Date()) {
  const key = dayKey(d), h = hashStr('territorio:' + key);
  const maps = Object.keys(MAPS), modes = ['battaglia', 'classica', 'battaglia'];
  return { key, seed: (h % 900000) + 1000, map: maps[h % maps.length], mode: modes[(h >>> 8) % modes.length], diff: 'normale', reward: 50 };
}

// rivals for a match: deterministic for a seed
export function makeRivals(rand, n, taken = []) {
  const names = RIVAL_NAMES.slice(), cols = RIVAL_COLORS.filter((c) => !taken.includes(c)), out = [];
  for (let i = 0; i < n; i++) {
    const name = names.splice((rand() * names.length) | 0, 1)[0] || `Rivale ${i + 1}`;
    out.push({ name, color: cols[i % cols.length], persona: PERSONA_IDS[(i + ((rand() * 5) | 0)) % PERSONA_IDS.length] });
  }
  return out;
}
