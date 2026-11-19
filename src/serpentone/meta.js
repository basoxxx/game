// Serpentone — light game data shared by the menu, the Baso Hub entry and the game (no three.js, no
// DOM): modes, arenas, difficulty, AI personalities, skins / patterns / hats, missions, daily arena.

// small seeded PRNG (mulberry32): the daily arena and the tests are reproducible
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const MODES = {
  classica: { name: 'Classica', icon: 'trophy', sub: '3 minuti: chiudi in testa alla classifica. Se vieni mangiato rinasci piccolo.', time: 180, rivals: 11, respawn: true },
  sopravvivenza: { name: 'Sopravvivenza', icon: 'shield', sub: 'Una vita sola. Le rivali arrivano sempre più numerose e furbe: resisti.', time: 0, rivals: 7, respawn: false },
  battaglia: { name: 'Battaglia reale', icon: 'burst', sub: '12 serpenti, nessuna rinascita, l’arena si stringe. Resta l’ultimo.', time: 0, rivals: 11, respawn: false, ring: true },
  duo: { name: '2 giocatori', icon: 'users', sub: 'Schermo diviso sullo stesso dispositivo: tastiera, due controller o touch.', time: 180, rivals: 8, respawn: true, duo: true },
};

// pal: food colours · ground: shader preset · sky: background · border: rim style
export const ARENAS = {
  giardino: { name: 'Giardino', sub: 'Prato all’inglese, siepi e fiori', sky: '#9fd8ff', fog: '#cfeeff', ground: 0, a: '#5fbf4a', b: '#4aa83c', c: '#2f7d2a', rim: '#3f8f33', glow: 0.15, sun: '#fff4dc', amb: 0.95, pal: ['#ff4d6d', '#ffd23f', '#ff8fd8', '#ffffff', '#ff9f1c', '#b388ff'] },
  spiaggia: { name: 'Spiaggia', sub: 'Sabbia calda, conchiglie e onde', sky: '#7fd3ff', fog: '#d9f5ff', ground: 1, a: '#f3d9a4', b: '#e8c98a', c: '#d4ad6a', rim: '#8b5a2b', glow: 0.18, sun: '#fff1d0', amb: 1.0, pal: ['#ff5d8f', '#00c2d1', '#ffbe0b', '#fb5607', '#8338ec', '#3a86ff'] },
  neon: { name: 'Città neon', sub: 'Notte, griglie luminose e insegne', sky: '#0b0620', fog: '#1c0b3a', ground: 2, a: '#120a2a', b: '#1b0f3d', c: '#ff2bd6', rim: '#00e5ff', glow: 0.9, sun: '#b79cff', amb: 0.55, night: true, pal: ['#ff2bd6', '#00e5ff', '#fff34f', '#7cff6b', '#ff7a1a', '#a46bff'] },
  spazio: { name: 'Stazione spaziale', sub: 'Pannelli in orbita, stelle e pianeti', sky: '#02030a', fog: '#05081a', ground: 3, a: '#3a4352', b: '#2c3442', c: '#58d0ff', rim: '#ff9f1c', glow: 0.7, sun: '#dfe8ff', amb: 0.7, night: true, pal: ['#58d0ff', '#ffe66d', '#ff6b9a', '#9bff8a', '#c9a0ff', '#ffffff'] },
};

export const DIFFS = {
  facile: { name: 'Facile', react: 0.4, look: 0.6, caution: 0.65, aggro: 0.3, smart: 0.35, boost: 0.4 },
  normale: { name: 'Normale', react: 0.18, look: 1, caution: 1, aggro: 0.6, smart: 0.75, boost: 0.8 },
  difficile: { name: 'Difficile', react: 0.07, look: 1.4, caution: 1.25, aggro: 0.95, smart: 0.95, boost: 1 },
};

// AI personalities: weights on food, hunting, caution, boosting
export const PERSONAS = {
  goloso: { name: 'Goloso', food: 1.4, hunt: 0.3, caution: 1, boost: 0.5, circle: 0 },
  cacciatore: { name: 'Cacciatore', food: 0.8, hunt: 1.5, caution: 0.9, boost: 1.2, circle: 0.2 },
  prudente: { name: 'Prudente', food: 1, hunt: 0.2, caution: 1.6, boost: 0.3, circle: 0 },
  spericolato: { name: 'Spericolato', food: 1, hunt: 0.9, caution: 0.6, boost: 1.8, circle: 0 },
  avvolgente: { name: 'Avvolgente', food: 0.9, hunt: 1.1, caution: 1.1, boost: 0.8, circle: 1 },
};
export const AI_NAMES = ['Spaghetto', 'Biscia Bice', 'Anguilla', 'Sibilo', 'Zigzag', 'Lombrico', 'Nastrino', 'Serpilla', 'Codalunga', 'Vermicello', 'Fusillo', 'Bisciolo', 'Sinuosa', 'Boa Bea', 'Cobretto', 'Liquirizia', 'Tagliatella', 'Mamba Mia', 'Pitone Pino', 'Slinky', 'Ciambella', 'Spirale', 'Elastico', 'Zuzzurellone'];

// Colour sets (body A, body B, belly/accent). cost in coins; 0 = owned from the start.
export const SKINS = [
  { id: 'lime', name: 'Lime', c: ['#7ddc1f', '#c6f432', '#fff7a8'], cost: 0 },
  { id: 'fragola', name: 'Fragola', c: ['#ff3b5c', '#ff8aa0', '#ffe2e8'], cost: 0 },
  { id: 'oceano', name: 'Oceano', c: ['#1e88ff', '#55d6ff', '#e0f7ff'], cost: 60 },
  { id: 'mango', name: 'Mango', c: ['#ff9a1c', '#ffd23f', '#fff1c2'], cost: 90 },
  { id: 'uva', name: 'Uva', c: ['#8e44ff', '#d18bff', '#f1e0ff'], cost: 120 },
  { id: 'menta', name: 'Menta', c: ['#14d9a4', '#9bffe0', '#eafff9'], cost: 160 },
  { id: 'corallo', name: 'Corallo', c: ['#ff6f61', '#ffd1a8', '#fff3e6'], cost: 200 },
  { id: 'notte', name: 'Notte', c: ['#25305a', '#5b7cff', '#cfd8ff'], cost: 260 },
  { id: 'lava', name: 'Lava', c: ['#d1140f', '#ffb000', '#ffe28a'], cost: 340 },
  { id: 'oro', name: 'Oro', c: ['#e0a100', '#fff07a', '#fffbe0'], cost: 480 },
  { id: 'arcobaleno', name: 'Arcobaleno', c: ['#ff3d7f', '#2ee6a6', '#ffffff'], cost: 650, rainbow: true },
  { id: 'galassia', name: 'Galassia', c: ['#3a1c8f', '#ff6ad5', '#9be7ff'], cost: 800, rainbow: true, hue: [0.68, 0.95] },
];
// body patterns: computed per segment (i = index from the head, n = segments)
export const PATTERNS = [
  { id: 'tinta', name: 'Tinta unita', cost: 0 },
  { id: 'strisce', name: 'Strisce', cost: 0 },
  { id: 'anelli', name: 'Anelli', cost: 70 },
  { id: 'sfumato', name: 'Sfumato', cost: 110 },
  { id: 'pois', name: 'Pois', cost: 150 },
  { id: 'scacchi', name: 'Scacchi', cost: 220 },
  { id: 'tigre', name: 'Tigre', cost: 300 },
];
export const HATS = [
  { id: 'nessuno', name: 'Nessuno', cost: 0 },
  { id: 'berretto', name: 'Berretto', cost: 80 },
  { id: 'festa', name: 'Cappello da festa', cost: 120 },
  { id: 'cilindro', name: 'Cilindro', cost: 180 },
  { id: 'elica', name: 'Elica', cost: 240 },
  { id: 'fiocco', name: 'Fiocco', cost: 200 },
  { id: 'corona', name: 'Corona', cost: 400 },
  { id: 'vichingo', name: 'Elmo vichingo', cost: 520 },
  { id: 'aureola', name: 'Aureola', cost: 700 },
];

export const POWERS = {
  magnet: { name: 'Calamita', color: '#ff4d6d', dur: 9, desc: 'attira il cibo vicino' },
  ghost: { name: 'Fantasma', color: '#b8c7ff', dur: 6, desc: 'attraversi i corpi' },
  speed: { name: 'Turbo', color: '#2ee6a6', dur: 7, desc: 'scatto gratis e più veloce' },
  double: { name: 'Cibo x2', color: '#ffc928', dur: 10, desc: 'ogni boccone vale doppio' },
};

// pattern colour for segment i of n: returns [r,g,b] 0..1 into out
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
function hsl(h, s, l, out) {
  const k = (n) => (n + h * 12) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  out[0] = f(0); out[1] = f(8); out[2] = f(4); return out;
}
export function skinColors(skinId) { const s = SKINS.find((x) => x.id === skinId) || SKINS[0]; return { ...s, rgb: s.c.map(hex) }; }
export function patternColor(skin, pattern, i, n, out) {
  const A = skin.rgb[0], B = skin.rgb[1];
  let t = 0;
  switch (pattern) {
    case 'strisce': t = (i % 6) < 3 ? 0 : 1; break;
    case 'anelli': t = (i % 9) < 2 ? 1 : 0; break;
    case 'sfumato': t = 0.5 + 0.5 * Math.sin(i * 0.12); break;
    case 'pois': t = (i % 5) === 2 ? 1 : 0; break;
    case 'scacchi': t = ((i >> 2) & 1) ? 1 : 0; break;
    case 'tigre': t = (i % 7) < 2 ? -1 : 0; break;
    default: t = 0;
  }
  if (skin.rainbow) {
    const [h0, h1] = skin.hue || [0, 1];
    hsl(h0 + (h1 - h0) * (0.5 + 0.5 * Math.sin(i * 0.09 + (t ? 1.4 : 0))) , 0.85, 0.58, out);
    if (t === -1) { out[0] *= 0.35; out[1] *= 0.35; out[2] *= 0.35; }
    return out;
  }
  if (t === -1) { out[0] = A[0] * 0.25; out[1] = A[1] * 0.2; out[2] = A[2] * 0.2; return out; }
  out[0] = A[0] + (B[0] - A[0]) * t; out[1] = A[1] + (B[1] - A[1]) * t; out[2] = A[2] + (B[2] - A[2]) * t;
  return out;
}

// ---- missions: three per match
const MISSIONS = [
  { id: 'eat', text: 'Mangia {n} bocconi', ns: [80, 150, 250], coins: [10, 16, 24] },
  { id: 'mass', text: 'Raggiungi lunghezza {n}', ns: [150, 300, 600], coins: [12, 20, 32] },
  { id: 'kill', text: 'Fai schiantare {n} serpenti', ns: [1, 3, 5], coins: [14, 24, 36], not: [] },
  { id: 'power', text: 'Raccogli {n} potenziamenti', ns: [2, 4, 6], coins: [10, 16, 22] },
  { id: 'boost', text: 'Scatta per {n} secondi', ns: [10, 20, 35], coins: [8, 12, 18] },
  { id: 'survive', text: 'Sopravvivi {n} secondi', ns: [60, 120, 200], coins: [12, 20, 30], only: ['sopravvivenza', 'battaglia'] },
  { id: 'top', text: 'Arriva tra i primi {n}', ns: [3], coins: [20], only: ['classica', 'battaglia'] },
  { id: 'nodeath', text: 'Chiudi la partita senza mai essere mangiato', ns: [1], coins: [24], only: ['classica'] },
];
export function pickMissions(rand, mode, diff = 'normale') {
  const pool = MISSIONS.filter((m) => !m.only || m.only.includes(mode));
  const out = [];
  const lvl = diff === 'facile' ? 0 : diff === 'difficile' ? 2 : 1;
  while (out.length < 3 && pool.length) {
    const m = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    const k = Math.min(m.ns.length - 1, Math.max(0, lvl - (rand() < 0.4 ? 1 : 0)));
    const n = m.ns[k];
    out.push({ id: m.id, n, coins: m.coins[k], text: m.text.replace('{n}', n), have: 0, done: false });
  }
  return out;
}

// ---- daily arena: same seed, arena, mode and twist for everyone today
const TWISTS = [
  { id: 'festa', name: 'Festa del cibo', desc: 'il doppio del cibo nell’arena', food: 2 },
  { id: 'giganti', name: 'Giganti', desc: 'tutti partono già lunghi', start: 120 },
  { id: 'scatto', name: 'Scatto libero', desc: 'lo scatto non consuma lunghezza', freeBoost: true },
  { id: 'poteri', name: 'Pioggia di poteri', desc: 'potenziamenti tre volte più frequenti', powers: 3 },
  { id: 'mini', name: 'Arena mini', desc: 'arena più piccola, scontri continui', arena: 0.65 },
];
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dailySpec(d = new Date()) {
  const key = dayKey(d), r = rng(hashStr('serpentone:' + key));
  const arenas = Object.keys(ARENAS), modes = ['classica', 'sopravvivenza', 'battaglia'];
  return { key, seed: hashStr(key) & 0xffffff, arena: arenas[Math.floor(r() * arenas.length)], mode: modes[Math.floor(r() * modes.length)], diff: 'normale', twist: TWISTS[Math.floor(r() * TWISTS.length)], reward: 40 };
}

// coins from a match: length, kills, position, missions (no ads, no purchases: only playing)
export function matchCoins(r) {
  let c = Math.floor(r.best / 25) + r.kills * 4 + (r.missions || []).filter((m) => m.done).reduce((a, m) => a + m.coins, 0);
  if (r.pos === 1) c += 25; else if (r.pos <= 3) c += 10;
  if (r.mode === 'sopravvivenza') c += Math.floor(r.time / 15);
  return Math.max(1, c);
}
export function matchStars(r) {
  if (r.mode === 'sopravvivenza') return r.time >= 240 ? 3 : r.time >= 120 ? 2 : r.time >= 45 ? 1 : 0;
  return r.pos === 1 ? 3 : r.pos <= 3 ? 2 : r.pos <= 6 ? 1 : 0;
}
