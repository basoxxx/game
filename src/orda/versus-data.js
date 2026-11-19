// Orda · 2 giocatori — data: champions, arenas, co-op tuning and the level expander. No three.js
// here: the setup screen reads it without loading the game.
import { CHAMPIONS } from './meta.js';
// Champions available in 2-player mode. Ids follow the core where they exist ('colosso' is the
// core's first champion); stats here are tuned for the versus sim.
export const VS_CHAMPIONS = {
  colosso: { name: 'Colosso', desc: 'Lento e enorme: travolge le file nemiche.', hp: 34, speed: 0.62, dmg: 14, scale: 2.3, charge: 15, icon: '⛰' },
  grillo: { name: 'Grillo', desc: 'Salta veloce: a ogni atterraggio un’onda d’urto.', hp: 10, speed: 1.55, dmg: 9, scale: 1.6, charge: 12, slam: 2.3, icon: '⚡' },
  matrioska: { name: 'Matrioska', desc: 'Quando cade si apre in tante figure. Le porte la moltiplicano!', hp: 10, speed: 1.0, dmg: 5, scale: 1.9, charge: 12, split: 12, icon: '❂' },
  testuggine: { name: 'Testuggine', desc: 'Avanza sotto una cupola: chi la tocca svanisce.', hp: 40, speed: 0.72, dmg: 8, scale: 1.9, charge: 14, aura: 2.4, icon: '⛨' },
};
// names and colours come from the core's champion list (single source for the shared ids)
for (const [id, C] of Object.entries(VS_CHAMPIONS)) { const K = CHAMPIONS.find((x) => x.id === id); if (K) { C.name = K.name; C.color = K.color; C.role = K.role; } }
export const VS_CHAMP_IDS = Object.keys(VS_CHAMPIONS);

// Arenas. Gates and obstacles are written for the half of player 1 (z > 0, the bottom / left of the
// screen); with mirror: true each one gets a twin reflected across the centre line (same x) for player 2,
// so both crowds use the same lanes and meet head-on.
// Gates with z = 0 sit on the centre line and are shared; the others work only for the crowd of
// the half they stand in (the other crowd walks through them). Gate types follow the core's levels:
// 'mul' ×value, 'add' +value, 'sub' swallows up to `value` figures (per round) and then breaks.
// z is the distance from the centre line toward player 1 (core levels call their forward axis y;
// `y` is accepted here as an alias).
export const VS_ARENAS = [
  {
    id: 'prato', name: 'Prato', desc: 'Il campo classico: porte larghe e una x3 che scivola al centro.',
    arena: { w: 20, l: 50, ground: '#7ccf5b', path: '#e9d9a6', side: '#4c9a3a' }, mirror: true,
    gates: [
      { x: -4.6, z: 14, w: 6.2, type: 'mul', value: 2 }, { x: 4.6, z: 14, w: 6.2, type: 'add', value: 4 },
      { x: 3.5, z: 7, w: 4.6, type: 'sub', value: 14 },
      { x: 0, z: 0, w: 6, type: 'mul', value: 3, move: { amp: 5.5, speed: 0.55 } },
    ],
    obstacles: [{ x: -6.5, z: 6.5, r: 1.1 }],
    base: { hp: 420 }, timer: 90,
  },
  {
    id: 'ponte', name: 'Ponte', desc: 'Il centro è un ponte stretto: chi lo controlla vince.',
    arena: { w: 20, l: 50, ground: '#6fc3e8', path: '#d9c39a', side: '#3d86b0', water: true }, mirror: true,
    gates: [
      { x: -5, z: 15, w: 6, type: 'add', value: 6 }, { x: 5, z: 15, w: 6, type: 'mul', value: 2 },
      { x: 0, z: 8, w: 7, type: 'mul', value: 2, move: { amp: 3.5, speed: 0.8 } },
      { x: 0, z: 0, w: 5.5, type: 'mul', value: 2 },
    ],
    obstacles: [{ x: -6.9, z: 2.2, r: 2.6 }, { x: 6.9, z: 2.2, r: 2.6 }],
    base: { hp: 440 }, timer: 90,
  },
  {
    id: 'giostra', name: 'Giostra', desc: 'Tutte le porte si muovono: tempismo e mira.',
    arena: { w: 20, l: 50, ground: '#f2b8d6', path: '#fff1c9', side: '#c46a9c' }, mirror: true,
    gates: [
      { x: 0, z: 15, w: 5, type: 'mul', value: 2, move: { amp: 6.5, speed: 0.9 } },
      { x: 0, z: 9, w: 4.4, type: 'add', value: 5, move: { amp: 6.5, speed: -0.7 } },
      { x: 0, z: 0, w: 4.6, type: 'mul', value: 3, move: { amp: 6.6, speed: 1.1 } },
    ],
    obstacles: [{ x: -4, z: 4, r: 0.9 }, { x: 4, z: 4.5, r: 0.9 }],
    base: { hp: 420 }, timer: 90,
  },
];
export const VS_COOP = { hp: [420, 1300], aiRate: { facile: 3.4, normale: 4.6, difficile: 5.8 } };

// ---------- level: expand mirrored gates / obstacles into the full list
export function expandLevel(L) {
  const lv = JSON.parse(JSON.stringify(L || VS_ARENAS[0]));
  lv.arena = { w: 20, l: 50, ground: '#7ccf5b', path: '#e9d9a6', side: '#4c9a3a', ...(lv.arena || {}) };
  const gates = [], obs = [];
  for (const g of lv.gates || []) {
    if (g.z == null && g.y != null) g.z = g.y;
    gates.push({ ...g, side: g.z === 0 ? -1 : 0 }); // -1: shared centre gate
    if (lv.mirror && g.z !== 0 && g.mirror !== false) gates.push({ ...g, z: -g.z, side: 1, twin: true });
  }
  for (const o of lv.obstacles || []) {
    if (o.z == null && o.y != null) o.z = o.y;
    obs.push({ ...o });
    if (lv.mirror && o.mirror !== false && o.z !== 0) obs.push({ ...o, z: -o.z });
  }
  gates.forEach((g, i) => { g.i = i; g.x0 = g.x; g.ph = g.move?.phase || 0; });
  lv.gates = gates.slice(0, 31); lv.obstacles = obs;
  return lv;
}

