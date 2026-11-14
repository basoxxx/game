// Voragine — light game data shared by the menu and the game (no three.js here): modes, skins, trails,
// the progression track, per-match missions and the daily challenge.
export const MODES = {
  classica: { name: 'Classica', sub: '2 minuti contro 7 voragini rivali. Vince la più grande.', icon: 'trophy', time: 120, rivals: 7, respawn: true },
  battaglia: { name: 'Battaglia', sub: 'Chi viene inghiottito è fuori. Resta l’ultima voragine.', icon: 'burst', time: 150, rivals: 7, respawn: false },
  solitaria: { name: 'Solitaria', sub: 'Solo tu e la città: inghiottisci più che puoi in 2 minuti.', icon: 'target', time: 120, rivals: 0, respawn: false },
};
export const DIFFS = {
  facile: { name: 'Facile', speed: 0.84, smart: 0.42, aggro: 0.3, react: 0.75 },
  normale: { name: 'Normale', speed: 0.93, smart: 0.7, aggro: 0.6, react: 0.55 },
  difficile: { name: 'Difficile', speed: 0.97, smart: 0.9, aggro: 0.8, react: 0.4 },
};
// cost: coins in the shop · track: unlocked by the progression track only
export const SKINS = [
  { id: 'notte', name: 'Notte Viola', color: '#8b5cff', cost: 0 },
  { id: 'menta', name: 'Menta', color: '#2ee6a6', cost: 80 },
  { id: 'lava', name: 'Lava', color: '#ff5a1f', cost: 160 },
  { id: 'abisso', name: 'Abisso', color: '#1e90ff', cost: 260 },
  { id: 'oro', name: 'Oro Zecchino', color: '#ffc928', cost: 400 },
  { id: 'arcobaleno', name: 'Arcobaleno', color: '#ff3d7f', cost: 700, rainbow: true, css: 'conic-gradient(#ff3d7f,#ffc928,#2ee6a6,#1e90ff,#8b5cff,#ff3d7f)' },
  { id: 'smeraldo', name: 'Smeraldo', color: '#00d68f', track: 4 },
  { id: 'ghiaccio', name: 'Ghiaccio', color: '#9be7ff', track: 7 },
  { id: 'magma', name: 'Magma', color: '#ff2d55', track: 10 },
  { id: 'galassia', name: 'Galassia', color: '#c77dff', track: 14, rainbow: true, hue: [0.72, 0.95], css: 'conic-gradient(#5b2bff,#c77dff,#ff6ad5,#5b2bff)' },
];
// particle trails behind the player's hole (add = additive glow)
export const TRAILS = [
  { id: 'nessuna', name: 'Nessuna', colors: [] },
  { id: 'polvere', name: 'Polvere', colors: ['#cdbb9c', '#a8977b', '#e0d3bb'], track: 2 },
  { id: 'scintille', name: 'Scintille', colors: ['#ffd34a', '#ff9a1c', '#fff2b0'], add: true, track: 5 },
  { id: 'bolle', name: 'Bolle', colors: ['#9be7ff', '#cfe9ff', '#6fc3ff'], add: true, float: true, track: 8 },
  { id: 'stelle', name: 'Stelle', colors: ['#ffffff', '#fff2b0', '#cfe0ff'], add: true, twinkle: true, track: 11 },
  { id: 'fiamme', name: 'Fiamme', colors: ['#ff4d1f', '#ffb000', '#ff7b00'], add: true, float: true, track: 13 },
  { id: 'arcobaleno', name: 'Arcobaleno', colors: ['#ff3d7f', '#ffc928', '#2ee6a6', '#1e90ff', '#8b5cff'], add: true, track: 15 },
];
// progression track: XP from every match; each level gives coins or unlocks a skin / a trail
export const TRACK_MAX = 15;
export const xpNeed = (lvl) => 150 + lvl * 50; // XP to go from lvl to lvl+1
export function trackLevel(xp = 0) {
  let lvl = 1, left = xp;
  while (lvl < TRACK_MAX && left >= xpNeed(lvl)) { left -= xpNeed(lvl); lvl++; }
  return { lvl, into: left, need: lvl >= TRACK_MAX ? 0 : xpNeed(lvl) };
}
export function trackReward(lvl) {
  const skin = SKINS.find((s) => s.track === lvl); if (skin) return { type: 'skin', id: skin.id, name: `Voragine ${skin.name}`, color: skin.color };
  const trail = TRAILS.find((t) => t.track === lvl); if (trail) return { type: 'trail', id: trail.id, name: `Scia ${trail.name}`, color: trail.colors[0] };
  return { type: 'coins', n: 40 + lvl * 15, name: `${40 + lvl * 15} monete` };
}
export const matchXp = (r) => Math.round(Math.sqrt(Math.max(0, r.score)) * 1.0 + r.stars * 15 + (r.missions || []).filter((m) => m.done).length * 20);

// ---- missions: three per match, picked from the templates that make sense in this city and mode
const M = (id, text, kinds, ns, coins, text1) => ({ id, type: 'eat', text, kinds, ns, coins, text1 });
export const MISSION_POOL = [
  M('pedoni', 'Inghiotti {n} pedoni', ['person'], [30, 50, 80], [12, 18, 25]),
  M('auto', 'Inghiotti {n} auto', ['car', 'taxi'], [8, 14, 20], [15, 20, 28]),
  M('bus', 'Inghiotti {n} autobus', ['bus'], [1, 2, 3], [15, 25, 35], 'Inghiotti un autobus'),
  M('alberi', 'Inghiotti {n} alberi', ['tree', 'pine', 'snowpine', 'xtree'], [10, 18, 28], [12, 18, 25]),
  M('case', 'Inghiotti {n} case', ['house', 'chalet'], [4, 8, 14], [15, 22, 30]),
  M('palazzi', 'Inghiotti {n} palazzi o uffici', ['apartment', 'office'], [2, 4, 7], [20, 28, 38]),
  M('grattacielo', 'Inghiotti un grattacielo', ['tower'], [1], [35]),
  M('lampioni', 'Inghiotti {n} lampioni', ['lamp'], [15, 25, 40], [12, 16, 22]),
  M('fontane', 'Inghiotti {n} fontane', ['fountain'], [1, 2], [15, 25], 'Inghiotti una fontana'),
  M('container', 'Inghiotti {n} container', ['container', 'stack', 'stack2'], [5, 10, 16], [15, 22, 30]),
  M('barche', 'Inghiotti {n} barche', ['boat', 'yacht'], [2, 4], [18, 28]),
  M('gru', 'Inghiotti una gru del porto', ['crane'], [1], [35]),
  M('pupazzi', 'Inghiotti {n} pupazzi di neve', ['snowman'], [5, 10, 16], [12, 18, 25]),
  M('negozi', 'Inghiotti {n} negozi', ['shop', 'kiosk'], [3, 6, 10], [15, 22, 30]),
  { id: 'rivale', type: 'rival', text: 'Divora {n} voragini rivali', text1: 'Divora una voragine rivale', ns: [1, 2, 3], coins: [20, 32, 45], vs: true },
  { id: 'combo', type: 'combo', text: 'Fai una combo x{n}', ns: [30, 60, 90], coins: [12, 20, 30] },
  { id: 'livello', type: 'level', text: 'Raggiungi il livello {n}', ns: [7, 8, 9], coins: [15, 22, 32] },
  { id: 'potere', type: 'power', text: 'Raccogli {n} potenziamenti', text1: 'Raccogli un potenziamento', ns: [1, 2, 3], coins: [10, 18, 26] },
  { id: 'citta', type: 'pct', text: 'Divora il {n}% della città', ns: [35, 50, 65], coins: [15, 25, 40], solo: true },
];
// kindCounts: { kindId: n } present in the city; rand: () => [0,1)
export function pickMissions(rand, kindCounts, mode, landmark) {
  const ok = MISSION_POOL.filter((t) => {
    if (t.vs && mode === 'solitaria') return false;
    if (t.solo && mode !== 'solitaria') return false;
    if (t.type !== 'eat') return true;
    const have = t.kinds.reduce((a, k) => a + (kindCounts[k] || 0), 0);
    return have >= t.ns[0] * 1.6;
  });
  const out = [];
  if (landmark && kindCounts[landmark] && rand() < 0.35) out.push({ id: 'monumento', type: 'eat', kinds: [landmark], n: 1, text: landmark === 'ship' ? 'Inghiotti la nave in porto' : landmark === 'bell' ? 'Inghiotti il campanile' : 'Inghiotti il monumento in piazza', coins: 40, have: 0 });
  while (out.length < 3 && ok.length) {
    const t = ok.splice((rand() * ok.length) | 0, 1)[0];
    const have = t.type === 'eat' ? t.kinds.reduce((a, k) => a + (kindCounts[k] || 0), 0) : Infinity;
    const tiers = t.ns.map((n, i) => i).filter((i) => t.ns[i] <= have * 0.6 || t.type !== 'eat');
    const i = tiers.length ? tiers[(rand() * tiers.length) | 0] : 0, n = t.ns[i];
    out.push({ id: t.id, type: t.type, kinds: t.kinds, n, text: (n === 1 && t.text1 ? t.text1 : t.text).replace('{n}', n), coins: t.coins[i], have: 0 });
  }
  return out;
}

// ---- daily challenge: the same city layout, rivals and missions for everybody on a given day
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dailySpec(d = new Date()) {
  const key = dayKey(d);
  let h = 2166136261; for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const cities = ['centro', 'giardino', 'notte', 'porto', 'neve'], modes = ['classica', 'solitaria', 'classica', 'battaglia'];
  return { key, seed: h % 100000 + 1000, city: cities[h % cities.length], mode: modes[(h >>> 8) % modes.length], diff: 'normale', reward: 60 };
}
