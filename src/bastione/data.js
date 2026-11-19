// Bastione — game data: towers (3 tiers + 2 specialisations each), enemies, heroes, spells, worlds,
// difficulty levels and the permanent upgrade tree. Pure data + tiny helpers: the headless sim, the
// balance tool (node) and the menus all read it; no DOM, no three.js.

// ───────── towers
// Every tower: base cost, then tiers[0..2] (build = tier 1, two upgrades) and spec[A|B] (tier 4).
// Fields of a tier/spec: dmg, rate (shots/s), range, splash (radius), kind (projectile look),
// dtype: 'phys' (armour reduces) | 'magic' (magic resistance reduces) | 'true', air (can hit flyers),
// plus effect fields: slow {f, t}, chain {n, fall}, poison {dps, t}, burn, stun, pierce, etc.
// cost of a tier = what you pay to reach it (tiers[0].cost = the build price).
export const TOWERS = [
  {
    id: 'balestra', name: 'Balestra', short: 'Rapida, colpisce anche i volanti', color: '#3fae5a', key: '1', air: true, target: 'first',
    tiers: [
      { cost: 70, dmg: 9, rate: 1.5, range: 6.2, dtype: 'phys', kind: 'arrow' },
      { cost: 60, dmg: 15, rate: 1.65, range: 6.6, dtype: 'phys', kind: 'arrow' },
      { cost: 90, dmg: 23, rate: 1.8, range: 7.0, dtype: 'phys', kind: 'arrow' },
    ],
    spec: [
      { id: 'elite', name: 'Arcieri scelti', desc: 'Due archi, colpi critici (x2) una volta su quattro.', cost: 170, dmg: 30, rate: 2.6, range: 7.6, dtype: 'phys', kind: 'arrow', crit: 0.25 },
      { id: 'fuoco', name: 'Frecce di fuoco', desc: 'Le frecce incendiano: 14 danni al secondo per 3 s, ignorano l’armatura.', cost: 160, dmg: 26, rate: 1.8, range: 7.2, dtype: 'phys', kind: 'firearrow', burn: { dps: 14, t: 3 } },
    ],
  },
  {
    id: 'cannone', name: 'Cannone', short: 'Danno ad area sui gruppi a terra', color: '#5b6577', key: '2', air: false, target: 'first',
    tiers: [
      { cost: 110, dmg: 20, rate: 0.6, range: 5.6, splash: 1.6, dtype: 'phys', kind: 'ball' },
      { cost: 90, dmg: 36, rate: 0.62, range: 5.9, splash: 1.75, dtype: 'phys', kind: 'ball' },
      { cost: 140, dmg: 58, rate: 0.65, range: 6.2, splash: 1.9, dtype: 'phys', kind: 'ball' },
    ],
    spec: [
      { id: 'bombarda', name: 'Bombarda', desc: 'Palle enormi: danno altissimo e onda d’urto più larga.', cost: 240, dmg: 120, rate: 0.55, range: 6.6, splash: 2.5, dtype: 'phys', kind: 'bigball', stun: 0.35 },
      { id: 'mitraglia', name: 'Mitraglia', desc: 'Raffica di palle piccole, tre volte più veloce.', cost: 220, dmg: 40, rate: 1.9, range: 6.2, splash: 1.3, dtype: 'phys', kind: 'ball' },
    ],
  },
  {
    id: 'gelo', name: 'Torre del Gelo', short: 'Rallenta i nemici, colpisce i volanti', color: '#46b8f0', key: '3', air: true, target: 'first',
    tiers: [
      { cost: 90, dmg: 5, rate: 1.0, range: 5.4, splash: 1.2, dtype: 'magic', kind: 'frost', slow: { f: 0.35, t: 2 } },
      { cost: 70, dmg: 9, rate: 1.0, range: 5.7, splash: 1.35, dtype: 'magic', kind: 'frost', slow: { f: 0.45, t: 2.2 } },
      { cost: 110, dmg: 14, rate: 1.05, range: 6.0, splash: 1.5, dtype: 'magic', kind: 'frost', slow: { f: 0.52, t: 2.4 } },
    ],
    spec: [
      { id: 'glaciale', name: 'Cuore glaciale', desc: 'Un colpo su cinque congela del tutto per 1,5 s.', cost: 190, dmg: 26, rate: 1.1, range: 6.3, splash: 1.6, dtype: 'magic', kind: 'frost', slow: { f: 0.6, t: 2.6 }, freeze: { p: 0.2, t: 1.5 } },
      { id: 'tormenta', name: 'Tormenta', desc: 'Una bufera continua: rallenta e ferisce tutti nel raggio.', cost: 200, dmg: 9, rate: 4, range: 5.2, dtype: 'magic', kind: 'aura', aura: true, slow: { f: 0.5, t: 0.6 } },
    ],
  },
  {
    id: 'tesla', name: 'Tesla', short: 'Fulmine a catena, colpisce i volanti', color: '#8b5cf6', key: '4', air: true, target: 'first',
    tiers: [
      { cost: 130, dmg: 22, rate: 0.7, range: 5.0, dtype: 'magic', kind: 'zap', chain: { n: 3, fall: 0.75, r: 2.6 } },
      { cost: 100, dmg: 36, rate: 0.72, range: 5.3, dtype: 'magic', kind: 'zap', chain: { n: 4, fall: 0.78, r: 2.8 } },
      { cost: 150, dmg: 55, rate: 0.75, range: 5.6, dtype: 'magic', kind: 'zap', chain: { n: 5, fall: 0.8, r: 3 } },
    ],
    spec: [
      { id: 'bobina', name: 'Super bobina', desc: 'La scarica salta fino a 9 nemici senza perdere forza.', cost: 250, dmg: 80, rate: 0.8, range: 6.0, dtype: 'magic', kind: 'zap', chain: { n: 9, fall: 0.92, r: 3.4 } },
      { id: 'globulare', name: 'Fulmine globulare', desc: 'Colpi più forti che stordiscono per mezzo secondo.', cost: 230, dmg: 120, rate: 0.75, range: 5.8, dtype: 'magic', kind: 'zap', chain: { n: 4, fall: 0.8, r: 3 }, stun: 0.5 },
    ],
  },
  {
    id: 'mortaio', name: 'Mortaio', short: 'Gittata enorme, esplosioni larghe', color: '#a8643a', key: '5', air: false, target: 'first',
    tiers: [
      { cost: 140, dmg: 38, rate: 0.33, range: 9.0, min: 2.6, splash: 2.2, dtype: 'phys', kind: 'shell' },
      { cost: 110, dmg: 64, rate: 0.34, range: 9.5, min: 2.6, splash: 2.35, dtype: 'phys', kind: 'shell' },
      { cost: 160, dmg: 100, rate: 0.35, range: 10, min: 2.6, splash: 2.5, dtype: 'phys', kind: 'shell' },
    ],
    spec: [
      { id: 'obice', name: 'Obice', desc: 'Granate devastanti con un raggio enorme.', cost: 270, dmg: 210, rate: 0.32, range: 11, min: 2.6, splash: 3, dtype: 'phys', kind: 'bigshell' },
      { id: 'napalm', name: 'Napalm', desc: 'Lascia a terra fiamme per 4 s (30 danni al secondo).', cost: 250, dmg: 120, rate: 0.35, range: 10, min: 2.6, splash: 2.5, dtype: 'phys', kind: 'shell', fire: { dps: 30, t: 4, r: 2.2 } },
    ],
  },
  {
    id: 'cecchino', name: 'Cecchino', short: 'Lunghissima gittata, perfora l’armatura', color: '#c9a227', key: '6', air: true, target: 'strong',
    tiers: [
      { cost: 120, dmg: 48, rate: 0.4, range: 10, dtype: 'phys', kind: 'bullet', pierce: 0.5 },
      { cost: 100, dmg: 82, rate: 0.42, range: 10.5, dtype: 'phys', kind: 'bullet', pierce: 0.5 },
      { cost: 150, dmg: 130, rate: 0.44, range: 11, dtype: 'phys', kind: 'bullet', pierce: 0.6 },
    ],
    spec: [
      { id: 'scelto', name: 'Tiratore scelto', desc: 'Colpi enormi; uno su otto abbatte all’istante (non i capi).', cost: 260, dmg: 240, rate: 0.42, range: 12.5, dtype: 'phys', kind: 'bullet', pierce: 0.8, exec: 0.125 },
      { id: 'raffica', name: 'Fucile a raffica', desc: 'Spara più del doppio dei colpi.', cost: 240, dmg: 112, rate: 1.0, range: 11, dtype: 'phys', kind: 'bullet', pierce: 0.6 },
    ],
  },
  {
    id: 'veleno', name: 'Veleno', short: 'Nube tossica: ignora ogni armatura', color: '#7cc93a', key: '7', air: false, target: 'first',
    tiers: [
      { cost: 100, dmg: 2, rate: 0.8, range: 5.4, splash: 1.4, dtype: 'true', kind: 'goo', poison: { dps: 9, t: 4 } },
      { cost: 80, dmg: 4, rate: 0.8, range: 5.7, splash: 1.5, dtype: 'true', kind: 'goo', poison: { dps: 15, t: 4 } },
      { cost: 120, dmg: 6, rate: 0.85, range: 6.0, splash: 1.6, dtype: 'true', kind: 'goo', poison: { dps: 23, t: 4 } },
    ],
    spec: [
      { id: 'peste', name: 'Peste', desc: 'Veleno fortissimo che contagia i vicini quando un nemico cade.', cost: 210, dmg: 10, rate: 0.9, range: 6.2, splash: 1.8, dtype: 'true', kind: 'goo', poison: { dps: 40, t: 4.5 }, spread: true },
      { id: 'acido', name: 'Acido', desc: 'Scioglie le armature: i colpiti perdono armatura e resistenza.', cost: 200, dmg: 10, rate: 0.9, range: 6.2, splash: 1.7, dtype: 'true', kind: 'goo', poison: { dps: 30, t: 4 }, corrode: 0.6 },
    ],
  },
  {
    id: 'caserma', name: 'Caserma', short: '3 difensori blu sbarrano il sentiero', color: '#2f7cf6', key: '8', air: false, barracks: true,
    tiers: [
      { cost: 90, men: 3, hp: 90, dmg: 6, rate: 1, range: 4.2, respawn: 10, armor: 0.1 },
      { cost: 80, men: 3, hp: 150, dmg: 10, rate: 1, range: 4.4, respawn: 9, armor: 0.2 },
      { cost: 120, men: 3, hp: 230, dmg: 15, rate: 1.05, range: 4.6, respawn: 8, armor: 0.3 },
    ],
    spec: [
      { id: 'guardia', name: 'Guardia reale', desc: 'Cavalieri corazzati che si curano tra uno scontro e l’altro.', cost: 210, men: 3, hp: 420, dmg: 26, rate: 1.05, range: 4.8, respawn: 9, armor: 0.5, regen: 12 },
      { id: 'ronda', name: 'Arcieri di ronda', desc: 'Difensori che tirano frecce anche da lontano (e ai volanti).', cost: 200, men: 3, hp: 260, dmg: 18, rate: 1.1, range: 4.8, respawn: 8, armor: 0.3, shoot: { dmg: 16, range: 4.5, rate: 1 } },
    ],
  },
  {
    id: 'miniera', name: 'Miniera d’oro', short: 'Produce oro durante le ondate', color: '#f5b400', key: '9', air: false, mine: true,
    tiers: [
      { cost: 120, gold: 5, every: 5 },
      { cost: 100, gold: 8, every: 5 },
      { cost: 140, gold: 12, every: 5 },
    ],
    spec: [
      { id: 'banca', name: 'Banca', desc: 'Il doppio dell’oro e un interesse a fine ondata (2% del tesoro).', cost: 220, gold: 18, every: 5, interest: 0.02 },
      { id: 'forziere', name: 'Forziere del re', desc: 'Oro e coraggio: le torri vicine fanno il 20% di danni in più.', cost: 200, gold: 12, every: 5, buff: { dmg: 0.2, r: 6 } },
    ],
  },
];
export const towerById = (id) => TOWERS.find((t) => t.id === id);
// stats of a tower at tier (0..2) or spec ('A' → 3, 'B' → 4 as tier index 3/4)
export function towerStats(def, tier, spec = -1) { return spec >= 0 ? def.spec[spec] : def.tiers[tier]; }
export function investCost(def, tier, spec = -1) { let c = 0; for (let i = 0; i <= Math.min(tier, 2); i++) c += def.tiers[i].cost; if (spec >= 0) c += def.spec[spec].cost; return c; }
export const SELL_BACK = 0.6;

// ───────── enemies (red figures). hp/speed at hp multiplier 1. threat = cost in the wave budget.
// armor: physical damage taken x(1-armor) · mres: magic damage x(1-mres) · lives: what a leak costs
export const ENEMIES = {
  fante: { name: 'Fante', desc: 'Il fagiolino rosso di base.', hp: 60, speed: 1.55, armor: 0, mres: 0, gold: 5, lives: 1, threat: 1, dps: 5, scale: 1, color: '#ff4256' },
  lesto: { name: 'Lesto', desc: 'Corre il doppio: tienilo d’occhio.', hp: 42, speed: 2.9, armor: 0, mres: 0, gold: 5, lives: 1, threat: 0.95, dps: 4, scale: 0.85, color: '#ff8a3d', hat: 'band' },
  scudato: { name: 'Scudato', desc: 'Lo scudo assorbe metà dei colpi fisici: usa magia o veleno.', hp: 120, speed: 1.3, armor: 0.55, mres: 0, gold: 9, lives: 1, threat: 1.9, dps: 7, scale: 1.05, color: '#e0303f', shield: true, hat: 'helmet' },
  bruto: { name: 'Bruto', desc: 'Grosso, lento, durissimo. Costa 2 vite.', hp: 340, speed: 0.95, armor: 0.2, mres: 0.15, gold: 18, lives: 2, threat: 5, dps: 16, scale: 1.55, color: '#b8192d' },
  volante: { name: 'Volante', desc: 'Vola sopra i difensori: solo alcune torri lo colpiscono.', hp: 70, speed: 1.85, armor: 0, mres: 0, gold: 8, lives: 1, threat: 1.5, dps: 0, scale: 0.95, color: '#ff5fa0', fly: true },
  gemello: { name: 'Gemello', desc: 'Quando cade si divide in due piccoli rossi veloci.', hp: 150, speed: 1.4, armor: 0.1, mres: 0.1, gold: 6, lives: 1, threat: 2.6, dps: 6, scale: 1.2, color: '#ff2e6e', split: { type: 'mini', n: 2 }, hat: 'dot' },
  mini: { name: 'Gemellino', desc: 'Nato da un Gemello.', hp: 40, speed: 2.2, armor: 0, mres: 0, gold: 2, lives: 1, threat: 0.5, dps: 3, scale: 0.7, color: '#ff6b8a' },
  sciamano: { name: 'Sciamano', desc: 'Cura i rossi vicini. Resiste alla magia.', hp: 130, speed: 1.3, armor: 0, mres: 0.6, gold: 12, lives: 1, threat: 2.3, dps: 4, scale: 1.05, color: '#d6336c', heal: { hp: 8, r: 2.6, every: 1.2 }, hat: 'hood' },
  // bosses (one per world)
  re: { name: 'Re Rosso', desc: 'Calpesta i difensori. Costa 10 vite.', hp: 4200, speed: 0.75, armor: 0.3, mres: 0.2, gold: 250, lives: 10, threat: 50, dps: 60, scale: 2.5, color: '#d1122e', boss: true, stomp: { every: 6, r: 2.5, dmg: 60 }, hat: 'crown' },
  golem: { name: 'Golem di Rame', desc: 'Pelle di metallo: armatura altissima.', hp: 5200, speed: 0.7, armor: 0.65, mres: 0, gold: 300, lives: 10, threat: 60, dps: 80, scale: 2.6, color: '#c2410c', boss: true, stomp: { every: 7, r: 2.6, dmg: 80 }, hat: 'crown' },
  drago: { name: 'Drago di Brina', desc: 'Vola: servono torri contraeree.', hp: 4600, speed: 0.95, armor: 0.25, mres: 0.35, gold: 320, lives: 10, threat: 60, dps: 0, scale: 2.4, color: '#e11d74', boss: true, fly: true, hat: 'crown' },
  tiranno: { name: 'Tiranno del Vulcano', desc: 'Evoca rinforzi rossi mentre avanza.', hp: 9000, speed: 0.7, armor: 0.35, mres: 0.35, gold: 400, lives: 20, threat: 90, dps: 100, scale: 2.9, color: '#9f1239', boss: true, stomp: { every: 6, r: 2.8, dmg: 90 }, summon: { type: 'lesto', n: 3, every: 8 }, hat: 'crown' },
};

// ───────── heroes
export const HEROES = [
  { id: 'capitano', name: 'Capitano Blu', role: 'Corpo a corpo · blocca 2 nemici', desc: 'Robusto e coraggioso: ferma i rossi sul sentiero e li stordisce.', gems: 0, color: '#2f7cf6', hp: 420, dmg: 20, rate: 1, range: 0.9, melee: true, block: 2, speed: 3.2, armor: 0.3,
    ab: [{ id: 'carica', name: 'Carica', desc: 'Stordisce i nemici vicini per 2 s e li ferisce (80).', cd: 16, r: 2.6 }, { id: 'stendardo', name: 'Stendardo', desc: 'Le torri vicine sparano il 40% più veloce per 8 s.', cd: 28, r: 6 }] },
  { id: 'arciera', name: 'Arciera Lina', role: 'A distanza · colpisce i volanti', desc: 'Agile e precisa: bersaglia anche i nemici in volo.', gems: 15, color: '#22c55e', hp: 260, dmg: 24, rate: 1.25, range: 5.5, melee: false, block: 0, speed: 3.8, armor: 0.1, air: true,
    ab: [{ id: 'pioggia', name: 'Pioggia di frecce', desc: 'Una raffica su un’area: 10 frecce da 45.', cd: 14, r: 2.6 }, { id: 'rete', name: 'Rete', desc: 'Blocca sul posto i nemici in un’area per 3 s.', cd: 22, r: 2.4 }] },
  { id: 'mago', name: 'Mago Fosco', role: 'Magia ad area', desc: 'Lento ma devastante: palle di fuoco che esplodono.', gems: 30, color: '#a855f7', hp: 240, dmg: 32, rate: 0.8, range: 4.8, melee: false, block: 0, speed: 2.9, armor: 0, splash: 1.3, magic: true, air: true,
    ab: [{ id: 'cometa', name: 'Cometa', desc: 'Una cometa enorme: 260 danni in un’ampia area.', cd: 24, r: 3 }, { id: 'portale', name: 'Portale', desc: 'Rispedisce indietro di 8 m i nemici in un’area.', cd: 30, r: 2.4 }] },
  { id: 'orso', name: 'Brunone l’Orso', role: 'Tank · blocca 3 nemici', desc: 'Un orso gigante in armatura blu: non lo sposta nessuno.', gems: 50, color: '#1e40af', hp: 900, dmg: 30, rate: 0.9, range: 1.1, melee: true, block: 3, speed: 2.6, armor: 0.45, splash: 1.1,
    ab: [{ id: 'terremoto', name: 'Terremoto', desc: 'Ferisce (120) e rallenta tutti in un’area ampia.', cd: 18, r: 3.4 }, { id: 'ruggito', name: 'Ruggito', desc: 'I nemici vicini scappano all’indietro per 2,5 s.', cd: 26, r: 3 }] },
];
export const heroById = (id) => HEROES.find((h) => h.id === id) || HEROES[0];
export const HERO_MAX = 6; // hero levels bought with coins: +12% hp and damage each
export const heroCost = (l) => 120 + l * 110;

// ───────── spells (global, with cooldowns)
export const SPELLS = [
  { id: 'meteore', name: 'Pioggia di meteore', desc: 'Tre meteore su un’area: 110 danni ciascuna.', cd: 40, r: 2.6, gems: 0, key: 'Q' },
  { id: 'rinforzi', name: 'Rinforzi', desc: 'Due miliziani blu per 20 s dove vuoi.', cd: 18, r: 1.2, gems: 0, key: 'W' },
  { id: 'glaciazione', name: 'Glaciazione', desc: 'Congela tutti i nemici in un’area per 3 s.', cd: 45, r: 3.4, gems: 20, key: 'E' },
];

// ───────── worlds (look of the maps) and difficulty
export const WORLDS = [
  { id: 'valle', name: 'Valle Verde', sub: 'Prati, mulini e i primi fagiolini rossi', ground: '#79c95a', ground2: '#5fae47', path: '#ecd59a', pathEdge: '#c9a76a', sky: '#9fe3ff', fog: '#cdefff', deco: ['#3f9f45', '#57b84f', '#2f8a3a'], rock: '#a9a9b8', water: '#4cb8f0', boss: 're' },
  { id: 'canyon', name: 'Canyon Ramato', sub: 'Sabbia, cactus e scudati coriacei', ground: '#e8b46c', ground2: '#d49a52', path: '#f6dcae', pathEdge: '#bf8040', sky: '#ffd9a0', fog: '#ffe8c4', deco: ['#4f9d4a', '#6bb556', '#3d8a3a'], rock: '#c46a3c', water: '#3fb6c9', boss: 'golem' },
  { id: 'ghiacci', name: 'Picchi Gelati', sub: 'Neve, abeti e nemici che volano', ground: '#eaf4ff', ground2: '#cfe2f5', path: '#b9d3ec', pathEdge: '#8fb0d4', sky: '#bfe3ff', fog: '#e8f4ff', deco: ['#2f7a5a', '#3e8f6a', '#276b4f'], rock: '#9fb4cc', water: '#7fd3ff', boss: 'drago' },
  { id: 'vulcano', name: 'Vulcano Cupo', sub: 'Lava, cenere e il Tiranno finale', ground: '#6b5366', ground2: '#56404f', path: '#b08a6e', pathEdge: '#7a5a48', sky: '#ff9a6a', fog: '#d08a7a', deco: ['#3b2a35', '#4a3340', '#2e2029'], rock: '#3a2c36', water: '#ff6a1f', boss: 'tiranno' },
];
export const DIFFS = [
  { id: 'facile', name: 'Facile', desc: 'Nemici più fragili e più oro.', hp: 0.72, gold: 1.15, coins: 0.75 },
  { id: 'normale', name: 'Normale', desc: 'L’esperienza pensata.', hp: 1, gold: 1, coins: 1 },
  { id: 'difficile', name: 'Difficile', desc: 'Rossi più duri: per veri strateghi.', hp: 1.35, gold: 0.95, coins: 1.4 },
];
export const diffById = (id) => DIFFS.find((d) => d.id === id) || DIFFS[1];
export const LIVES = 20;
// stars from the lives left (out of 20): 3 → lost at most 2, 2 → kept at least half
export const starsFor = (lives, max = LIVES) => (lives <= 0 ? 0 : lives >= max - 2 ? 3 : lives >= max / 2 ? 2 : 1);

// ───────── permanent upgrade tree (coins). Each node up to `max` levels; `req` = node needed first.
export const TREE = [
  { id: 'frecce', branch: 'Tiratori', name: 'Punte d’acciaio', desc: '+8% danni di Balestra e Cecchino per livello.', max: 3, base: 80 },
  { id: 'mirino', branch: 'Tiratori', name: 'Cannocchiali', desc: '+6% gittata di Balestra e Cecchino per livello.', max: 3, base: 110, req: 'frecce' },
  { id: 'polvere', branch: 'Artiglieria', name: 'Polvere fine', desc: '+8% danni di Cannone e Mortaio per livello.', max: 3, base: 90 },
  { id: 'schegge', branch: 'Artiglieria', name: 'Schegge', desc: '+10% raggio delle esplosioni per livello.', max: 3, base: 120, req: 'polvere' },
  { id: 'arcano', branch: 'Magia', name: 'Cristalli arcani', desc: '+8% danni di Gelo, Tesla e Veleno per livello.', max: 3, base: 90 },
  { id: 'brina', branch: 'Magia', name: 'Brina eterna', desc: '+15% durata dei rallentamenti e del veleno per livello.', max: 3, base: 110, req: 'arcano' },
  { id: 'reclute', branch: 'Fortezza', name: 'Addestramento', desc: '+12% vita e danni dei difensori per livello.', max: 3, base: 80 },
  { id: 'tesoro', branch: 'Fortezza', name: 'Tesoro di guerra', desc: '+25 oro iniziale per livello.', max: 3, base: 100, req: 'reclute' },
  { id: 'sconto', branch: 'Fortezza', name: 'Mastri muratori', desc: '-4% sul costo di costruzione per livello.', max: 3, base: 140, req: 'tesoro' },
  { id: 'fuoco', branch: 'Incantesimi', name: 'Meteore ardenti', desc: '+20% danni delle meteore e -10% ricarica per livello.', max: 3, base: 100 },
  { id: 'milizia', branch: 'Incantesimi', name: 'Milizia scelta', desc: 'Rinforzi più forti (+25% vita e danni) per livello.', max: 3, base: 100 },
  { id: 'eroismo', branch: 'Incantesimi', name: 'Eroismo', desc: 'Abilità dell’eroe: -10% ricarica per livello.', max: 3, base: 130, req: 'milizia' },
];
export const BRANCHES = ['Tiratori', 'Artiglieria', 'Magia', 'Fortezza', 'Incantesimi'];
export const treeCost = (n, l) => Math.round(n.base * (1 + l * 0.9));
// the multipliers the sim applies, from the node levels
export function treeEffects(up = {}) {
  const l = (k) => up[k] || 0;
  return {
    dmg: { balestra: 1 + 0.08 * l('frecce'), cecchino: 1 + 0.08 * l('frecce'), cannone: 1 + 0.08 * l('polvere'), mortaio: 1 + 0.08 * l('polvere'), gelo: 1 + 0.08 * l('arcano'), tesla: 1 + 0.08 * l('arcano'), veleno: 1 + 0.08 * l('arcano') },
    range: { balestra: 1 + 0.06 * l('mirino'), cecchino: 1 + 0.06 * l('mirino') },
    splash: 1 + 0.1 * l('schegge'), dur: 1 + 0.15 * l('brina'),
    men: 1 + 0.12 * l('reclute'), gold0: 25 * l('tesoro'), discount: 1 - 0.04 * l('sconto'),
    meteor: 1 + 0.2 * l('fuoco'), meteorCd: 1 - 0.1 * l('fuoco'), militia: 1 + 0.25 * l('milizia'), heroCd: 1 - 0.1 * l('eroismo'),
  };
}
