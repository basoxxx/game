// Bastione — the 24 campaign maps (4 worlds x 6), their build spots and waves; generators for the
// endless mode and the daily challenge. Pure data + deterministic generators (node friendly).
//
// Map space: x in [-18, 18] (left → right), z in [-12, 12] (top → bottom on screen in landscape).
// A path is a polyline from an entry (off the map edge) to the keep (the last point of path 0).
// Extra paths join the first one; enemies pick a path per group.
// Level JSON (generated levels use the same shape):
//   { id, world, name, tip, paths: [[[x,z]...], ...], slots: n, waves: n, pow, hp, gold, roster: {type: weight},
//     boss?: type, intro?: type }
// buildLevel(def) adds: slotsXY [[x,z]...] (build spots), waveList [[{type, n, gap, delay, path}]], keep [x,z]
import { ENEMIES, WORLDS } from './data.js';

export const MAP_W = 36, MAP_H = 24;

// the hand-made campaign. pow = wave budget multiplier, hp = enemy hp multiplier (tuned with
// tools/bastione-balance.mjs), gold = starting gold
const C = [
  // ── Valle Verde
  { name: 'Il ponte del mulino', tip: 'Tocca una piazzola per costruire. Le Balestre colpiscono tutto, le Caserme sbarrano la strada.', paths: [[[-20, 0], [-6, 0], [-6, -6], [6, -6], [6, 4], [15, 4]]], slots: 8, waves: 6, roster: { fante: 1 }, late: { lesto: 0.5 } },
  { name: 'Campi di grano', tip: 'I Lesti corrono: rallentali con il Gelo o fermali con una Caserma.', paths: [[[-20, -8], [-10, -8], [-10, 6], [0, 6], [0, -4], [10, -4], [10, 5], [15, 5]]], slots: 9, waves: 7, roster: { fante: 1, lesto: 0.6 } },
  { name: 'Il guado', tip: 'Gli Scudati parano i colpi fisici: Tesla, Gelo e Veleno li sciolgono.', paths: [[[-20, 7], [-12, 7], [-12, -7], [-2, -7], [-2, 3], [8, 3], [8, -8], [15, -8]]], slots: 10, waves: 8, roster: { fante: 1, lesto: 0.5, scudato: 0.5 } },
  { name: 'Bosco dei sussurri', tip: 'Un sentiero lungo e tortuoso: le torri al centro coprono più curve.', paths: [[[-20, -9], [12, -9], [12, -3], [-10, -3], [-10, 3], [12, 3], [12, 8], [-6, 8]]], slots: 11, waves: 8, roster: { fante: 1, lesto: 0.5, scudato: 0.6, bruto: 0.25 } },
  { name: 'Due sentieri', tip: 'Arrivano da due lati! Costruisci vicino all’incrocio.', paths: [[[-20, -6], [-6, -6], [-6, 2], [15, 2]], [[4, -13], [4, 2], [15, 2]]], slots: 10, waves: 9, roster: { fante: 1, lesto: 0.6, scudato: 0.6, bruto: 0.35 } },
  { name: 'Il trono rosso', tip: 'Il Re Rosso calpesta i difensori: tienilo lontano dal Bastione con Cannoni e Cecchini.', paths: [[[-20, -2], [-10, -2], [-10, -9], [2, -9], [2, 0], [-4, 0], [-4, 8], [10, 8], [10, -1], [15, -1]]], slots: 12, waves: 10, roster: { fante: 1, lesto: 0.6, scudato: 0.7, bruto: 0.4 }, boss: 're' },
  // ── Canyon Ramato
  { name: 'Gola di rame', tip: 'Arrivano i Gemelli: quando cadono si dividono in due.', paths: [[[-20, 5], [-8, 5], [-8, -8], [8, -8], [8, 8], [15, 8]]], slots: 10, waves: 9, roster: { fante: 0.8, lesto: 0.5, scudato: 0.8, gemello: 0.7 } },
  { name: 'Scalinata del sole', tip: 'Il Mortaio arriva lontanissimo ma non colpisce chi gli sta sotto.', paths: [[[-20, -10], [-12, -10], [-12, -2], [-4, -2], [-4, 6], [4, 6], [4, -4], [12, -4], [12, 6], [16, 6]]], slots: 11, waves: 10, roster: { fante: 0.8, lesto: 0.6, scudato: 0.8, gemello: 0.6, bruto: 0.4 } },
  { name: 'Il crocevia', tip: 'Gli Sciamani curano chi gli sta vicino: colpiscili per primi (Cecchino).', paths: [[[-20, -6], [0, -6], [0, 0], [15, 0]], [[-20, 7], [0, 7], [0, 0], [15, 0]]], slots: 11, waves: 10, roster: { fante: 0.8, lesto: 0.6, scudato: 0.8, gemello: 0.5, sciamano: 0.5 } },
  { name: 'La spirale', tip: 'Una spirale lunghissima: le torri al centro lavorano su tre giri.', paths: [[[-20, -10], [14, -10], [14, 9], [-14, 9], [-14, -4], [8, -4], [8, 3], [-7, 3]]], slots: 12, waves: 11, roster: { fante: 0.7, lesto: 0.6, scudato: 0.9, gemello: 0.6, sciamano: 0.4, bruto: 0.5 } },
  { name: 'Mesa dei venti', tip: 'Due ingressi: dividi le difese.', paths: [[[-20, -3], [-8, -3], [-8, -9], [6, -9], [6, 3], [15, 3]], [[-4, 13], [-4, 3], [6, 3], [15, 3]]], slots: 12, waves: 11, roster: { fante: 0.7, lesto: 0.6, scudato: 0.9, gemello: 0.6, sciamano: 0.5, bruto: 0.5 } },
  { name: 'Fonderia del Golem', tip: 'Il Golem ha un’armatura quasi totale: magia, veleno e Cecchini!', paths: [[[-20, 0], [-12, 0], [-12, 8], [-2, 8], [-2, -8], [8, -8], [8, 6], [15, 6]]], slots: 12, waves: 12, roster: { fante: 0.6, lesto: 0.5, scudato: 1, gemello: 0.6, sciamano: 0.5, bruto: 0.6 }, boss: 'golem' },
  // ── Picchi Gelati
  { name: 'Valico innevato', tip: 'I Volanti passano sopra i difensori: Balestre, Gelo, Tesla e Cecchini li colpiscono.', paths: [[[-20, -8], [-6, -8], [-6, 0], [4, 0], [4, -8], [12, -8], [12, 6], [15, 6]]], slots: 11, waves: 11, roster: { fante: 0.7, lesto: 0.6, scudato: 0.6, volante: 0.8, gemello: 0.4 } },
  { name: 'Lago ghiacciato', tip: 'Due rotte che si uniscono al centro del lago.', paths: [[[-20, -9], [-10, -9], [-10, -2], [2, -2], [15, -2]], [[-20, 9], [2, 9], [2, -2], [15, -2]]], slots: 12, waves: 12, roster: { fante: 0.7, lesto: 0.6, scudato: 0.7, volante: 0.8, sciamano: 0.4, bruto: 0.4 } },
  { name: 'Serpentina dei pini', tip: 'Quattro tornanti: il Mortaio e la Tesla adorano le curve.', paths: [[[-14, -13], [-14, 8], [-6, 8], [-6, -8], [2, -8], [2, 8], [10, 8], [10, -6], [15, -6]]], slots: 13, waves: 12, roster: { fante: 0.7, lesto: 0.7, scudato: 0.7, volante: 0.7, gemello: 0.6, bruto: 0.5 } },
  { name: 'Tenaglia di ghiaccio', tip: 'Dall’alto e dal basso: si incontrano poco prima del Bastione.', paths: [[[-10, -13], [-10, -5], [1, -5], [1, 0], [15, 0]], [[-10, 13], [-10, 5], [1, 5], [1, 0], [15, 0]]], slots: 12, waves: 13, roster: { fante: 0.6, lesto: 0.7, scudato: 0.8, volante: 0.8, gemello: 0.5, sciamano: 0.5, bruto: 0.5 } },
  { name: 'Cresta del vento', tip: 'Strada lunghissima: una Miniera d’oro all’inizio si ripaga.', paths: [[[-20, 4], [-12, 4], [-12, -9], [-2, -9], [-2, 9], [8, 9], [8, -9], [14, -9], [14, 3]]], slots: 13, waves: 13, roster: { fante: 0.6, lesto: 0.7, scudato: 0.8, volante: 0.9, gemello: 0.6, sciamano: 0.5, bruto: 0.6 } },
  { name: 'Nido del Drago', tip: 'Il Drago di Brina vola: prepara tante torri contraeree.', paths: [[[-20, -6], [-8, -6], [-8, 6], [4, 6], [4, -6], [15, -6]], [[4, 13], [4, 6], [4, -6], [15, -6]]], slots: 13, waves: 14, roster: { fante: 0.6, lesto: 0.6, scudato: 0.8, volante: 1, gemello: 0.5, sciamano: 0.5, bruto: 0.5 }, boss: 'drago' },
  // ── Vulcano Cupo
  { name: 'Cenere e brace', tip: 'Il vulcano rende tutto più difficile: usa le specializzazioni (livello 4).', paths: [[[-20, -10], [-4, -10], [-4, -2], [-14, -2], [-14, 6], [6, 6], [6, -4], [15, -4]]], slots: 12, waves: 13, roster: { fante: 0.6, lesto: 0.7, scudato: 0.9, volante: 0.6, gemello: 0.6, sciamano: 0.5, bruto: 0.6 } },
  { name: 'Fiume di lava', tip: 'Due colate di nemici: il punto d’incontro è la chiave.', paths: [[[-20, -8], [-6, -8], [-6, 0], [6, 0], [6, -7], [15, -7]], [[-20, 8], [-6, 8], [-6, 0], [6, 0], [6, -7], [15, -7]]], slots: 12, waves: 14, roster: { fante: 0.6, lesto: 0.7, scudato: 0.9, volante: 0.7, gemello: 0.6, sciamano: 0.6, bruto: 0.6 } },
  { name: 'Tre bocche', tip: 'Tre ingressi! Le Caserme nei punti giusti valgono oro.', paths: [[[-20, -6], [-6, -6], [-6, 0], [14, 0]], [[-20, 6], [-6, 6], [-6, 0], [14, 0]], [[4, -13], [4, 0], [14, 0]]], slots: 12, waves: 14, roster: { fante: 0.6, lesto: 0.7, scudato: 0.9, volante: 0.7, gemello: 0.6, sciamano: 0.6, bruto: 0.7 } },
  { name: 'Il serpente di fuoco', tip: 'Un serpentone infinito: c’è tempo per colpire, ma arrivano a frotte.', paths: [[[-20, -10], [14, -10], [14, -4], [-14, -4], [-14, 2], [14, 2], [14, 8], [-10, 8]]], slots: 14, waves: 15, roster: { fante: 0.6, lesto: 0.8, scudato: 0.9, volante: 0.7, gemello: 0.7, sciamano: 0.6, bruto: 0.7 } },
  { name: 'Forgia oscura', tip: 'Ultima prova prima del Tiranno: tutto quello che hai imparato.', paths: [[[-20, -9], [-10, -9], [-10, 9], [0, 9], [0, -9], [10, -9], [10, 3], [15, 3]], [[10, -13], [10, -9], [10, 3], [15, 3]]], slots: 13, waves: 15, roster: { fante: 0.5, lesto: 0.8, scudato: 1, volante: 0.8, gemello: 0.7, sciamano: 0.6, bruto: 0.8 } },
  { name: 'Cuore del vulcano', tip: 'Il Tiranno evoca rinforzi mentre avanza. Ferma l’ultima ondata e la valle è salva!', paths: [[[-20, -8], [-8, -8], [-8, 8], [4, 8], [4, -4], [15, -4]], [[-2, 13], [-2, 8], [4, 8], [4, -4], [15, -4]], [[4, -13], [4, -4], [15, -4]]], slots: 14, waves: 16, roster: { fante: 0.5, lesto: 0.8, scudato: 1, volante: 0.8, gemello: 0.7, sciamano: 0.7, bruto: 0.9 }, boss: 'tiranno' },
];
// per level tuning: [budget multiplier, enemy hp multiplier, starting gold, boss hp multiplier]
// (tools/bastione-balance.mjs searches these so that the campaign autopilot wins every level)
const TUNE = [
  [1, 1.45, 300], [1.05, 1.85, 320], [1.1, 1.2, 340], [1.15, 2.15, 360], [1.2, 1.3, 380], [1.25, 2.1, 420, 0.5],
  [1.25, 2, 420], [1.3, 2.35, 440], [1.35, 1.7, 460], [1.4, 2.2, 480], [1.45, 1.85, 500], [1.5, 1.85, 540, 0.5],
  [1.5, 1.4, 540], [1.55, 1.15, 560], [1.6, 1.45, 580], [1.65, 1.45, 600], [1.7, 1.6, 620], [1.75, 1.65, 660, 0.8],
  [1.75, 2.25, 660], [1.8, 3, 680], [1.85, 2.5, 700], [1.9, 3, 720], [1.95, 1.6, 740], [2, 1.8, 800, 1.6],
];
export const LEVELS = C.map((c, i) => ({ ...c, id: i + 1, world: Math.floor(i / 6), pow: TUNE[i][0], hp: TUNE[i][1], gold: TUNE[i][2], bossHp: TUNE[i][3] || 1 }));
export const levelById = (id) => LEVELS.find((l) => l.id === +id) || null;
export const LEVELS_PER_WORLD = 6;

// ───────── seeded RNG + hashing
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ───────── geometry helpers
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  const qx = ax + t * dx, qz = az + t * dz; return Math.hypot(px - qx, pz - qz);
}
export function pathDist(px, pz, pts) { let m = 1e9; for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return m; }
// samples every `step` along a path: [{x, z, d}]
export function samplePath(pts, step = 0.5) {
  const out = []; let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < L; s += step) out.push({ x: ax + ((bx - ax) * s) / L, z: az + ((bz - az) * s) / L, d: d + s });
    d += L;
  }
  const e = pts[pts.length - 1]; out.push({ x: e[0], z: e[1], d });
  return out;
}
const inMap = (x, z, m = 0) => x > -MAP_W / 2 + m && x < MAP_W / 2 - m && z > -MAP_H / 2 + m && z < MAP_H / 2 - m;

// Build spots: candidates on a grid, between 2 and 3.6 m from the road, away from the keep and
// the entries; scored by how much road they cover (6 m), picked greedily with 3.4 m spacing.
export function makeSlots(paths, n, seed = 1) {
  const keep = paths[0][paths[0].length - 1];
  const samples = paths.flatMap((p) => samplePath(p, 0.5)).filter((s) => inMap(s.x, s.z, -1));
  const cand = [];
  const R = rng(seed);
  for (let x = -16.5; x <= 16.5; x += 0.75) for (let z = -10.5; z <= 10.5; z += 0.75) {
    const d = Math.min(...paths.map((p) => pathDist(x, z, p)));
    if (d < 2.1 || d > 3.6) continue;
    if (Math.hypot(x - keep[0], z - keep[1]) < 4) continue;
    if (paths.some((p) => Math.hypot(x - p[0][0], z - p[0][1]) < 3)) continue;
    let cover = 0; for (const s of samples) if ((s.x - x) ** 2 + (s.z - z) ** 2 < 36) cover++;
    cand.push({ x, z, cover: cover + R() * 0.5 });
  }
  const out = [];
  while (out.length < n && cand.length) {
    cand.sort((a, b) => b.cover - a.cover);
    const c = cand.shift(); out.push([+c.x.toFixed(2), +c.z.toFixed(2)]);
    for (let i = cand.length - 1; i >= 0; i--) if (Math.hypot(cand[i].x - c.x, cand[i].z - c.z) < 3.4) cand.splice(i, 1);
    // spread along the road: candidates near an existing spot lose a bit of score
    for (const k of cand) if (Math.hypot(k.x - c.x, k.z - c.z) < 7) k.cover *= 0.82;
  }
  return out;
}

// ───────── waves
// a wave = groups: { type, n, gap (s between spawns), delay (s from the wave start), path }
const pickW = (R, w) => { const e = Object.entries(w).filter(([, v]) => v > 0); let s = e.reduce((a, [, v]) => a + v, 0) * R(); for (const [k, v] of e) { s -= v; if (s <= 0) return k; } return e[0][0]; };
export function makeWaves(L, seed = L.id || 1) {
  const R = rng(seed * 7919 + 13), N = L.waves, out = [];
  const np = L.paths.length;
  for (let w = 0; w < N; w++) {
    const budget = (5 + 2.5 * w + 0.07 * w * w) * (L.pow || 1);
    // newer / tougher types appear from the second third of the level
    const roster = { ...L.roster };
    if (L.late && w >= N / 2) Object.assign(roster, L.late);
    for (const k of Object.keys(roster)) { const t = ENEMIES[k].threat; if ((t >= 1.8 && w < Math.min(2, N / 3)) || (w === 0 && k !== 'fante' && k !== 'lesto')) roster[k] = 0; }
    if (!Object.values(roster).some((v) => v > 0)) roster.fante = 1;
    const groups = [], ng = 1 + (w >= 2 ? 1 : 0) + (w >= 5 && R() < 0.6 ? 1 : 0) + (w >= 9 && R() < 0.5 ? 1 : 0);
    let delay = 0;
    for (let g = 0; g < ng; g++) {
      const type = pickW(R, roster), E = ENEMIES[type];
      const b = budget / ng, n = Math.max(1, Math.round(b / E.threat));
      const gap = Math.max(0.35, 1.25 / E.speed) * (0.8 + R() * 0.4);
      groups.push({ type, n, gap: +gap.toFixed(2), delay: +delay.toFixed(1), path: np > 1 ? (w + g) % np : 0 });
      delay += n * gap * (0.45 + R() * 0.3) + 1;
    }
    if (L.boss && w === N - 1) groups.push({ type: L.boss, n: 1, gap: 1, delay: +(delay + 2).toFixed(1), path: 0, boss: true });
    // a brute every few waves on long levels (a "mini boss")
    if (!L.boss && w > 0 && w % 4 === 3 && (L.roster.bruto || 0) > 0) groups.push({ type: 'bruto', n: 1 + Math.floor(w / 8), gap: 2.5, delay: +(delay * 0.5).toFixed(1), path: np > 1 ? 1 % np : 0 });
    out.push(groups);
  }
  return out;
}

// hp scaling inside a level: later waves a bit tougher
export const waveHp = (L, w) => (L.hp || 1) * (1 + 0.035 * w);

// complete a level definition with build spots and waves (memoised on the object)
export function buildLevel(L) {
  if (L._built) return L;
  L.slotsXY = L.slotsXY || makeSlots(L.paths, L.slots, (L.id && +L.id) || hashStr(String(L.id || L.name)));
  L.waveList = L.waveList || makeWaves(L, typeof L.id === 'number' ? L.id : hashStr(String(L.id)));
  L.keep = L.paths[0][L.paths[0].length - 1];
  L._built = true;
  return L;
}

// ───────── endless: one of the unlocked maps, waves forever (generated on demand by the sim)
export function endlessLevel(mapId) {
  const base = levelById(mapId) || LEVELS[0];
  const L = { ...base, id: `inf-${base.id}`, mapId: base.id, name: base.name, tip: 'Ondate senza fine: quante ne reggi?', endless: true, waves: 999, hp: 1, pow: 1, gold: 450, boss: null,
    roster: { fante: 0.7, lesto: 0.7, scudato: 0.8, volante: 0.6, gemello: 0.6, sciamano: 0.5, bruto: 0.5 } };
  L.slotsXY = makeSlots(base.paths, Math.max(base.slots, 12), base.id);
  L.waveList = [];
  L.keep = base.paths[0][base.paths[0].length - 1]; L._built = true;
  return L;
}
// one endless wave (index w, 0-based): budget and hp keep growing; a boss every 10 waves
export function endlessWave(L, w) {
  const R = rng(9000 + w * 31 + (L.mapId || 1));
  const np = L.paths.length, budget = 5 + 2.4 * w + 0.1 * w * w, hp = 1 + 0.07 * w + 0.004 * w * w;
  const groups = [], ng = Math.min(5, 1 + Math.floor(w / 3));
  let delay = 0;
  const roster = { ...L.roster }; if (w < 3) { roster.bruto = 0; roster.sciamano = 0; } if (w < 5) roster.volante = 0;
  for (let g = 0; g < ng; g++) {
    const type = pickW(R, roster), E = ENEMIES[type], n = Math.max(1, Math.round(budget / ng / E.threat)), gap = Math.max(0.3, 1.2 / E.speed);
    groups.push({ type, n, gap, delay, path: (w + g) % np }); delay += n * gap * 0.5 + 1;
  }
  if (w % 10 === 9) groups.push({ type: ['re', 'golem', 'drago', 'tiranno'][Math.floor(w / 10) % 4], n: 1, gap: 1, delay: delay + 2, path: 0, hpMul: 0.35 + w * 0.02 });
  return { groups, hp };
}

// ───────── daily challenge: same map, rules and waves for everybody on a given day
export const DAILY_RULES = [
  { id: 'nessuna', name: 'Classica', desc: 'Nessuna regola speciale.' },
  { id: 'veloci', name: 'Di corsa', desc: 'Tutti i nemici sono il 25% più veloci.', speed: 1.25 },
  { id: 'poveri', name: 'Tasche vuote', desc: 'Si parte con metà dell’oro.', gold: 0.5 },
  { id: 'magia', name: 'Solo magia', desc: 'Si possono costruire solo Gelo, Tesla, Veleno e Caserme.', only: ['gelo', 'tesla', 'veleno', 'caserma'] },
  { id: 'artiglieria', name: 'Artiglieria pesante', desc: 'Solo Cannoni, Mortai, Caserme e Miniere.', only: ['cannone', 'mortaio', 'caserma', 'miniera'] },
  { id: 'corazzati', name: 'Corazzati', desc: 'I nemici hanno +30% di armatura.', armor: 0.3 },
  { id: 'senzaeroe', name: 'Senza eroe', desc: 'L’eroe resta al castello: solo torri e incantesimi.', noHero: true },
  { id: 'cielo', name: 'Cielo affollato', desc: 'Molti più nemici volanti.', roster: { volante: 2 } },
];
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const BASTIONE_EPOCH = Date.UTC(2026, 10, 1);
export function dailyInfo(d = new Date()) {
  const key = dayKey(d), seed = hashStr(`bastione:${key}`), R = rng(seed);
  const num = Math.max(1, Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - BASTIONE_EPOCH) / 864e5) + 1);
  const map = 1 + Math.floor(R() * LEVELS.length), rule = DAILY_RULES[1 + Math.floor(R() * (DAILY_RULES.length - 1))];
  return { key, num, seed, map, rule, gems: 5 };
}
export function dailyLevel(d = new Date()) {
  const info = dailyInfo(d), base = levelById(info.map), R = rng(info.seed + 1);
  const roster = { fante: 0.7, lesto: 0.7, scudato: 0.8, volante: 0.5, gemello: 0.6, sciamano: 0.5, bruto: 0.5, ...(info.rule.roster || {}) };
  const L = { ...base, id: `daily-${info.key}`, mapId: base.id, name: `${base.name}`, daily: info.num, rule: info.rule, tip: `Regola del giorno: ${info.rule.name}. ${info.rule.desc}`,
    waves: 12, pow: 1.35, hp: 1.35 + R() * 0.25, gold: Math.round(520 * (info.rule.gold || 1)), roster, boss: null, late: null, _built: false, waveList: null };
  return buildLevel(L);
}

export const worldOf = (L) => WORLDS[L.world || 0] || WORLDS[0];
