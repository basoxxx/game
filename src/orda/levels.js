// Orda — the campaign: 35 levels in 7 worlds (the 7th is a secret world opened with stars), a boss
// fortress every fifth level. Plain JSON on purpose: other modules generate levels of the same shape
// (daily / endless / raids).
//
// The layouts (gates, traps, the kind of defence) are hand-made here; the numbers that set the pace
// (base hit points, how many reds, the clock, the star goals) come from tools/orda-tune.mjs, which
// plays every level headlessly with the autopilot and writes src/orda/levels-tune.js. Re-run it after
// changing a layout or the simulation:  node tools/orda-tune.mjs
//
// Level shape (all distances in metres; x is lateral, y runs from the player's cannon to the base):
// {
//   id, name, world (index in WORLDS), tip?, teach?: 'drag'|'choose'|'champ' (levels 1-3: hints that
//   teach by doing), press?: red pressure as a share of the blue flow (tuner input), target?: seconds
//   the autopilot should need (tuner input),
//   w: arena width (16), len: distance cannon → base front (48-64), time: seconds,
//   stars: { par: seconds for the 2nd star, crowd: figures still on the field at the win for the 3rd },
//   charge?: champion charge needed (× CHARGE_K), redHp?: hp of one red (1), redSpeed? (6), countdown?,
//   cannon: { hp },
//   gates: [{ x, y, w?, type: 'add'|'mul'|'sub'|'div'|'split'|'rec', value, rainbow?, to? (split: lane
//             offset), move?: { amp, speed, phase? }, toggle?: { every, type, value } }],   // max 32 gates
//   obstacles: [{ type: 'wall'|'barrier'|'pit'|'spin'|'saw'|'jump'|'push', x, y, w?, d?, amp?, speed?,
//                 phase?, len?, r?, air? (jump: seconds in the air), to? (push: target x) }],
//     wall: static block w×d · barrier: wall sliding by ±amp · pit: hole w×d · spin: bar of half-length
//     `len` turning at `speed` rad/s · saw: blade of radius r sliding by ±amp · jump: pad that throws
//     the crowd over whatever follows (pits, reds) · push: lane switch, slides the crowd to x = to
//   base: { hp, w?, boss?, name?, ramp? (spawn growth per minute), bruteHp?,
//           spawners: [{ x, rate (bursts/s), count (reds per burst), spread? }],
//           waves?: { every, count }, towers: [{ x, y, hp, rate, count }], giants?: { every, hp, first? },
//           phases?: [{ at (hp fraction), wave?, brute?, bruteHp?, giant? (hp), shield? (s), rate? (spawn ×) }] },
//   bonus?: true — a bonus level: no defence, the clock runs out and every figure in the vault pays
// }
import { TUNE } from './levels-tune.js';

const mul = (x, y, value, o = {}) => ({ x, y, w: 4.6, type: 'mul', value, ...o });
const add = (x, y, value, o = {}) => ({ x, y, w: 4.6, type: 'add', value, ...o });
const sub = (x, y, value, o = {}) => ({ x, y, w: 4.6, type: 'sub', value, ...o });
const div = (x, y, value, o = {}) => ({ x, y, w: 4.6, type: 'div', value, ...o });
const split = (x, y, value = 2, o = {}) => ({ x, y, w: 4.6, type: 'split', value, to: 4, ...o });
const rec = (x, y, value, o = {}) => ({ x, y, w: 4.6, type: 'rec', value, ...o });
// the rainbow ×5: small and quick, worth chasing
const rainbow = (x, y, amp, speed = 0.55, o = {}) => ({ x, y, w: 3.2, type: 'mul', value: 5, rainbow: true, move: { amp, speed, phase: o.phase || 0 }, ...o });
const sp = (x, rate, count = 1, spread) => ({ x, rate, count, ...(spread != null ? { spread } : {}) });
const tw = (x, y, hp, rate = 0.35, count = 2) => ({ x, y, hp, rate, count });
const jump = (x, y, w = 4, o = {}) => ({ type: 'jump', x, y, w, d: 1.4, air: 1, ...o });
const push = (x, y, to, w = 4, o = {}) => ({ type: 'push', x, y, w, d: 1.6, to, ...o });
const pit = (x, y, w, d) => ({ type: 'pit', x, y, w, d });
const wall = (x, y, w, d = 1) => ({ type: 'wall', x, y, w, d });
const saw = (y, o = {}) => ({ type: 'saw', x: 0, y, r: 1.1, amp: 6, speed: 0.4, ...o });
const spin = (x, y, len, speed) => ({ type: 'spin', x, y, len, speed });
const bar = (y, w, amp, speed, o = {}) => ({ type: 'barrier', x: 0, y, w, d: 1, amp, speed, ...o });

const RAW = [
  // ───────── Mondo 1 · Prato Fiorito — the crowd explodes into the hundreds right away
  { id: 1, name: 'Primi passi', world: 0, len: 48, teach: 'drag', target: 17, press: 0.12, cannon: { hp: 30 },
    gates: [mul(-3.5, 12, 3, { w: 6.5 }), mul(-3, 26, 5, { w: 5.5 })], obstacles: [],
    base: { hp: 1, spawners: [sp(0, 1, 1)], towers: [] } },
  { id: 2, name: 'Il bivio', world: 0, len: 50, teach: 'choose', target: 19, press: 0.16, cannon: { hp: 30 },
    gates: [add(-4, 12, 5), mul(4, 12, 4), mul(0, 28, 3, { w: 9 })], obstacles: [],
    base: { hp: 1, spawners: [sp(0, 1, 2)], towers: [] } },
  { id: 3, name: 'Occhio al meno', world: 0, len: 50, teach: 'champ', target: 20, press: 0.2, charge: 9, cannon: { hp: 30 },
    gates: [sub(0, 12, 40, { w: 5 }), mul(-5, 12, 3, { w: 5 }), mul(5, 12, 3, { w: 5 }), mul(-4, 27, 3), add(4, 27, 10)], obstacles: [],
    base: { hp: 1, spawners: [sp(-2, 1, 1), sp(2, 1, 1)], waves: { every: 7, count: 10 }, towers: [] } },
  { id: 4, name: 'Porta vagabonda', world: 0, len: 52, target: 22, press: 0.22, cannon: { hp: 30 },
    tip: 'La porta ×4 si sposta: inseguila!',
    gates: [mul(0, 13, 4, { w: 4.4, move: { amp: 5, speed: 0.3 } }), add(-4, 28, 15), mul(4, 28, 3)], obstacles: [],
    base: { hp: 1, spawners: [sp(-2.5, 1, 1), sp(2.5, 1, 1)], waves: { every: 7, count: 12 }, towers: [] } },
  { id: 5, name: 'Fortino del Prato', world: 0, len: 54, target: 32, press: 0.26, cannon: { hp: 36 },
    tip: 'Prima fortezza! Arriva un gigante: travolgilo con l’orda o col campione.',
    gates: [mul(-4, 12, 3), add(4, 12, 10), mul(0, 26, 3, { w: 5.5, move: { amp: 2.5, speed: 0.25 } })], obstacles: [],
    base: { hp: 1, w: 10, boss: true, name: 'Fortino', spawners: [sp(-3, 1, 2), sp(3, 1, 2)], towers: [tw(-5, 48, 30, 0.35, 2)],
      phases: [{ at: 0.66, wave: 14, shield: 1.5 }, { at: 0.4, wave: 16, giant: 40, rate: 1.3 }] } },

  // ───────── Mondo 2 · Spiaggia Frizzante
  { id: 6, name: 'Muri di sabbia', world: 1, len: 52, target: 22, press: 0.2, cannon: { hp: 34 },
    tip: 'I muri deviano le figure ai lati.',
    gates: [mul(-4, 11, 3), mul(4, 11, 3), add(-5, 32, 8), mul(4.5, 32, 3)], obstacles: [wall(0, 20, 5, 1.2), wall(0, 38, 2.5)],
    base: { hp: 1, spawners: [sp(-2, 1, 2), sp(2, 1, 2)], waves: { every: 7, count: 14 }, towers: [] } },
  { id: 7, name: 'Arcobaleno', world: 1, len: 54, target: 23, press: 0.22, cannon: { hp: 34 },
    tip: 'La porta arcobaleno vale ×5, ma è piccola e corre veloce!',
    gates: [rainbow(0, 13, 5.5, 0.5), mul(-4, 28, 3), mul(4, 28, 3), add(0, 28, 10, { w: 3 })], obstacles: [],
    base: { hp: 1, spawners: [sp(0, 1, 3)], towers: [tw(-4, 48, 45, 0.4, 2), tw(4, 48, 45, 0.4, 2)] } },
  { id: 8, name: 'Porte ballerine', world: 1, len: 54, target: 24, press: 0.22, cannon: { hp: 34 },
    tip: 'Le porte cambiano segno a tempo: guarda il cerchio giallo.',
    gates: [mul(-4, 12, 4, { toggle: { every: 2.5, type: 'sub', value: 40 } }), mul(4, 12, 2), add(0, 30, 20, { w: 6, toggle: { every: 3, type: 'mul', value: 3 } })], obstacles: [wall(0, 20, 3)],
    base: { hp: 1, spawners: [sp(-2, 1, 2), sp(2, 1, 2)], waves: { every: 7, count: 16 }, towers: [] } },
  { id: 9, name: 'Dimezzati', world: 1, len: 56, target: 25, press: 0.24, cannon: { hp: 36 },
    tip: 'A volte conviene passare dal ÷ se dopo c’è un ×5.',
    gates: [div(-4, 11, 2), mul(4, 11, 2), mul(-4, 25, 5), add(4, 25, 12), mul(0, 38, 2, { w: 5, move: { amp: 4, speed: 0.3 } })], obstacles: [],
    base: { hp: 1, spawners: [sp(-2.5, 1, 3), sp(2.5, 1, 3)], waves: { every: 6, count: 16 }, towers: [tw(0, 50, 50, 0.4, 2)] } },
  { id: 10, name: 'Castello di Sabbia', world: 1, len: 56, target: 36, press: 0.26, cannon: { hp: 40 },
    tip: 'Il castello lancia giganti. Il campione li stende!',
    gates: [mul(-4, 11, 3), mul(4, 11, 3, { toggle: { every: 3, type: 'div', value: 2 } }), rainbow(0, 24, 5.5, 0.6), mul(-5, 36, 3), mul(5, 36, 3)], obstacles: [wall(0, 18, 4, 1.2)],
    base: { hp: 1, w: 10, boss: true, name: 'Castello di Sabbia', spawners: [sp(-3, 1, 2), sp(3, 1, 2)], towers: [tw(-5, 50, 60, 0.4, 2), tw(5, 50, 60, 0.4, 2)], giants: { every: 12, hp: 50, first: 8 },
      phases: [{ at: 0.7, wave: 20, shield: 2 }, { at: 0.4, wave: 24, giant: 60, rate: 1.25 }, { at: 0.15, wave: 30, rate: 1.2 }] } },

  // ───────── Mondo 3 · Canyon Caramello
  { id: 11, name: 'Trampolino', world: 2, len: 56, target: 24, press: 0.2, cannon: { hp: 36 },
    tip: 'Le pedane gialle fanno saltare l’orda sopra fosse e nemici.',
    gates: [mul(-4, 11, 5), mul(4, 11, 5), mul(0, 36, 6, { w: 6 })], obstacles: [jump(0, 18, 6), pit(0, 24, 7, 3), pit(-6, 30, 4, 3), pit(6, 30, 4, 3)],
    base: { hp: 1, spawners: [sp(-2, 1, 1), sp(2, 1, 1)], waves: { every: 6, count: 10 }, towers: [] } },
  { id: 12, name: 'Catena di porte', world: 2, len: 58, target: 25, press: 0.24, cannon: { hp: 36 },
    tip: '×2 dopo ×2 dopo ×2!',
    gates: [mul(-3, 10, 2), sub(4, 10, 60), mul(-3, 20, 2), div(4, 20, 2), mul(-3, 30, 2), add(4, 30, 20), mul(0, 42, 3, { w: 7 })], obstacles: [pit(1.5, 36, 3, 2.5)],
    base: { hp: 1, spawners: [sp(-2.5, 1, 6), sp(2.5, 1, 3)], towers: [tw(-5, 52, 60, 0.4, 2)] } },
  { id: 13, name: 'Porta scissa', world: 2, len: 58, target: 25, press: 0.24, cannon: { hp: 38 },
    tip: 'La porta ⇆ raddoppia e divide l’orda su due corsie.',
    gates: [split(0, 11, 2, { w: 5 }), mul(-4, 26, 5), mul(4, 26, 5), add(0, 40, 15, { w: 4 })], obstacles: [bar(18, 3, 2, 0.3), pit(0, 33, 3, 2), bar(46, 5, 3.5, 0.25, { phase: 2 })],
    base: { hp: 1, spawners: [sp(-2, 1, 3), sp(2, 1, 2)], waves: { every: 6, count: 16 }, towers: [] } },
  { id: 14, name: 'Il grande salto', world: 2, len: 58, target: 26, press: 0.24, cannon: { hp: 38 },
    tip: 'Una voragine taglia il canyon: salta o passa dal corridoio a destra.',
    gates: [mul(-4, 10, 3), mul(4, 10, 2), mul(5.5, 21, 4, { w: 3.6 }), add(-2, 36, 15), mul(3, 36, 2)], obstacles: [jump(-3, 16, 4), pit(-2, 23, 11, 4), wall(0, 42, 3)],
    base: { hp: 1, spawners: [sp(-3, 1, 4), sp(3, 1, 3)], towers: [tw(0, 52, 80, 0.45, 3)] } },
  { id: 15, name: 'Forte del Canyon', world: 2, len: 58, target: 38, press: 0.27, cannon: { hp: 44 },
    tip: 'Tre fasi, bruti corazzati e un gigante.',
    gates: [mul(-4, 10, 3), add(4, 10, 15), mul(0, 22, 4, { w: 4.2, move: { amp: 4, speed: 0.25 } }), split(-5, 36, 2, { w: 4, to: 2.5 }), div(0, 36, 2, { w: 3.5 }), mul(5, 36, 2)], obstacles: [pit(0, 29, 4, 2.5), bar(44, 4, 3.5, 0.3)],
    base: { hp: 1, w: 10, boss: true, name: 'Forte del Canyon', bruteHp: 22, spawners: [sp(-3, 1, 3), sp(3, 1, 3)], towers: [tw(-5.5, 52, 80, 0.4, 2), tw(5.5, 52, 80, 0.4, 2)],
      phases: [{ at: 0.7, wave: 24, brute: 1, shield: 2 }, { at: 0.4, wave: 30, giant: 70, rate: 1.25 }, { at: 0.15, wave: 36, brute: 2, shield: 1.5 }] } },

  // ───────── Mondo 4 · Ghiacciaio Menta
  { id: 16, name: 'Pale di ghiaccio', world: 3, len: 58, target: 26, press: 0.22, cannon: { hp: 40 },
    tip: 'La porta ♻ restituisce le figure perse nelle trappole.',
    gates: [mul(-4, 10, 3), mul(4, 10, 3), rec(0, 30, 60, { w: 5 }), mul(-5.5, 40, 2), add(5.5, 40, 20)], obstacles: [spin(0, 20, 4, 1.6)],
    base: { hp: 1, spawners: [sp(-2, 1, 3), sp(2, 1, 2)], waves: { every: 6, count: 20 }, towers: [] } },
  { id: 17, name: 'Lame sul lago', world: 3, len: 58, target: 26, press: 0.22, cannon: { hp: 40 },
    tip: 'Le seghe scivolano avanti e indietro: il ♻ ti ridà chi cade.',
    gates: [mul(0, 10, 4, { w: 6 }), mul(-4, 24, 2), mul(4, 24, 3), rec(0, 38, 80, { w: 5 })], obstacles: [saw(17, { speed: 0.35 }), saw(31, { speed: 0.45, phase: 1.6 })],
    base: { hp: 1, spawners: [sp(-3, 1, 2), sp(3, 1, 2)], towers: [tw(0, 52, 90, 0.4, 2)] } },
  { id: 18, name: 'Tormenta', world: 3, len: 58, target: 27, press: 0.22, cannon: { hp: 42 },
    tip: 'Pale, porte che cambiano e una bufera di rossi.',
    gates: [mul(-4, 10, 4, { toggle: { every: 2.5, type: 'div', value: 2 } }), mul(0, 10, 5, { w: 3.4 }), mul(4, 10, 3), rainbow(0, 33, 5, 0.7), mul(-4, 40, 2), mul(4, 40, 3, { toggle: { every: 2.5, type: 'sub', value: 80 } })], obstacles: [spin(-4, 22, 3, 2), spin(4, 22, 3, -2)],
    base: { hp: 1, spawners: [sp(-3, 1, 1), sp(3, 1, 1)], waves: { every: 5, count: 12 }, towers: [] } },
  { id: 19, name: 'Torri di brina', world: 3, len: 60, target: 28, press: 0.24, cannon: { hp: 42 },
    tip: 'Tre torri e un gigante di ghiaccio.',
    gates: [mul(-4, 10, 3), mul(4, 10, 2), mul(0, 22, 4, { w: 5 }), add(-5, 34, 20), mul(5, 34, 2)], obstacles: [saw(28, { r: 1, amp: 5, speed: 0.4 })],
    base: { hp: 1, spawners: [sp(0, 1, 5)], towers: [tw(-5, 54, 90, 0.5, 2), tw(0, 52, 110, 0.5, 3), tw(5, 54, 90, 0.5, 2)], giants: { every: 14, hp: 60, first: 10 } } },
  { id: 20, name: 'Palazzo di Ghiaccio', world: 3, len: 60, target: 40, press: 0.27, cannon: { hp: 48 },
    tip: 'Il palazzo alterna scudi, ondate e giganti.',
    gates: [mul(-4, 10, 3), mul(4, 10, 4, { move: { amp: 2, speed: 0.35 } }), rec(0, 22, 80, { w: 4.4 }), mul(-5, 38, 3), split(5, 38, 2, { w: 4, to: 2.5 }), mul(0, 44, 3, { w: 4 })], obstacles: [spin(0, 30, 3.5, 1.7), saw(16, { r: 1, speed: 0.35 })],
    base: { hp: 1, w: 11, boss: true, name: 'Palazzo di Ghiaccio', bruteHp: 20, spawners: [sp(-3, 1, 2), sp(3, 1, 2)], waves: { every: 8, count: 24 }, towers: [tw(-5.5, 54, 110, 0.45, 2), tw(5.5, 54, 110, 0.45, 2)],
      phases: [{ at: 0.75, wave: 28, shield: 2 }, { at: 0.5, wave: 30, giant: 80, rate: 1.2 }, { at: 0.25, wave: 34, brute: 2, shield: 1.5, rate: 1.2 }] } },

  // ───────── Mondo 5 · Fabbrica Ingranaggi
  { id: 21, name: 'Nastro trasportatore', world: 4, len: 60, target: 27, press: 0.22, cannon: { hp: 44 },
    tip: 'Le frecce sul nastro spostano l’orda di corsia.',
    gates: [mul(-4, 10, 3), add(4, 10, 5), mul(5, 30, 4, { w: 4 }), mul(-5, 30, 2, { w: 4 }), add(0, 42, 5, { w: 5, move: { amp: 3.5, speed: 0.25 } })], obstacles: [push(-4, 19, 5, 5), saw(36, { speed: 0.45 })],
    base: { hp: 1, spawners: [sp(-3, 1, 2), sp(3, 1, 2)], waves: { every: 6, count: 20 }, towers: [] } },
  { id: 22, name: 'Corridoio delle seghe', world: 4, len: 60, target: 28, press: 0.22, cannon: { hp: 44 },
    tip: 'Tre seghe in fila: trova il ritmo.',
    gates: [mul(-4, 10, 3), mul(4, 10, 3), mul(0, 42, 4, { w: 5 }), rec(-5.5, 42, 80, { w: 3.5 }), add(5.5, 42, 25, { w: 3.5 })], obstacles: [saw(18, { speed: 0.4 }), saw(25, { speed: 0.4, phase: 2.1 }), saw(32, { speed: 0.4, phase: 4.2 })],
    base: { hp: 1, spawners: [sp(-3, 1, 1), sp(3, 1, 1)], towers: [tw(0, 54, 120, 0.5, 3)] } },
  { id: 23, name: 'Fonderia', world: 4, len: 60, target: 28, press: 0.24, cannon: { hp: 46 },
    tip: 'Quattro torri e una fossa di metallo fuso.',
    gates: [mul(-4, 10, 3), mul(4, 10, 2), mul(-4, 24, 2), mul(4, 24, 4), rainbow(0, 36, 4.5, 0.65)], obstacles: [pit(0, 17, 3, 6), push(4, 30, -1, 4), spin(0, 44, 3, 1.7)],
    base: { hp: 1, spawners: [sp(0, 1, 4)], towers: [tw(-5.5, 52, 110, 0.5, 2), tw(-2, 55, 110, 0.5, 2), tw(2, 55, 110, 0.5, 2), tw(5.5, 52, 110, 0.5, 2)] } },
  { id: 24, name: 'La pressa', world: 4, len: 62, target: 29, press: 0.24, cannon: { hp: 46 },
    tip: 'Barriere a tenaglia, porte trappola e giganti d’acciaio.',
    gates: [mul(-4, 10, 4, { toggle: { every: 2.5, type: 'sub', value: 80 } }), mul(4, 10, 4), div(-4, 28, 2), mul(4, 28, 4), split(0, 44, 2, { w: 6, to: 3.5 })], obstacles: [bar(19, 4, 2.5, 0.45, { x: -3 }), bar(19, 4, 2.5, 0.45, { x: 3, phase: 3.14 }), saw(36, { r: 1.2, speed: 0.5 })],
    base: { hp: 1, spawners: [sp(-3, 1, 2), sp(3, 1, 2)], waves: { every: 6, count: 20 }, towers: [tw(0, 56, 130, 0.5, 3)], giants: { every: 13, hp: 70, first: 9 } } },
  { id: 25, name: 'Officina Rossa', world: 4, len: 62, target: 42, press: 0.28, cannon: { hp: 52 },
    tip: 'Il capo officina sforna bruti e giganti in serie!',
    gates: [mul(-4, 10, 3), mul(4, 10, 3, { move: { amp: 1.5, speed: 0.45 } }), mul(0, 22, 4, { w: 4.5, move: { amp: 4.5, speed: 0.25 } }), add(-5, 38, 25, { w: 3.6 }), mul(0, 38, 4, { w: 3.6 }), rec(5, 38, 100, { w: 3.6 })], obstacles: [saw(16, { r: 1, speed: 0.4 }), push(-4, 29, 0, 6), bar(46, 4, 4, 0.3)],
    base: { hp: 1, w: 11, boss: true, name: 'Officina Rossa', bruteHp: 30, spawners: [sp(-3.5, 1, 4), sp(0, 1, 1), sp(3.5, 1, 4)], waves: { every: 8, count: 30 }, towers: [tw(-5.5, 56, 140, 0.45, 2), tw(5.5, 56, 140, 0.45, 2)], giants: { every: 15, hp: 80, first: 12 },
      phases: [{ at: 0.75, wave: 30, brute: 2, shield: 2 }, { at: 0.5, wave: 34, giant: 100, rate: 1.2 }, { at: 0.25, wave: 44, brute: 4, shield: 2, rate: 1.2 }] } },

  // ───────── Mondo 6 · Vulcano Lampone
  { id: 26, name: 'Pendici bollenti', world: 5, len: 62, target: 28, press: 0.24, cannon: { hp: 48 },
    tip: 'Lava ai lati: il sentiero è stretto, ma c’è un trampolino.',
    gates: [mul(0, 10, 3, { w: 5 }), mul(-2.5, 24, 4, { w: 3.6 }), add(2.5, 24, 20, { w: 3.6 }), mul(0, 44, 3, { w: 6 })], obstacles: [pit(-6, 17, 4, 10), pit(6, 17, 4, 10), jump(0, 31, 4), pit(-6, 36, 4, 8), pit(6, 36, 4, 8), spin(0, 37, 2.6, 1.8)],
    base: { hp: 1, spawners: [sp(-3, 1, 2), sp(3, 1, 2)], waves: { every: 6, count: 20 }, towers: [] } },
  { id: 27, name: 'Cenere e lame', world: 5, len: 62, target: 29, press: 0.26, redHp: 1.6, cannon: { hp: 48 },
    tip: 'Rossi corazzati: ognuno vale quasi due figure.',
    gates: [mul(-4, 10, 3), mul(4, 10, 4, { toggle: { every: 2.5, type: 'div', value: 3 } }), mul(-4, 26, 3), add(4, 26, 25), rainbow(0, 41, 5, 0.6)], obstacles: [saw(17, { r: 1.2, speed: 0.45 }), saw(34, { r: 1.2, speed: 0.45, phase: 3 })],
    base: { hp: 1, spawners: [sp(-3, 1, 4), sp(3, 1, 4)], towers: [tw(-5, 56, 140, 0.4, 2), tw(5, 56, 140, 0.4, 2)] } },
  { id: 28, name: 'Fiume di lava', world: 5, len: 62, target: 30, press: 0.22, cannon: { hp: 50 },
    tip: 'Un ponte mobile attraversa la lava: passa insieme a lui, o salta.',
    gates: [mul(-4, 10, 3), mul(4, 10, 2), mul(0, 20, 4, { w: 4, move: { amp: 5, speed: 0.22 } }), add(-4, 40, 25), mul(4, 40, 3)], obstacles: [jump(5, 26, 3), pit(-5, 30, 6, 4), pit(5, 30, 6, 4), spin(0, 48, 3.5, 1.6)],
    base: { hp: 1, spawners: [sp(-3, 1, 1), sp(3, 1, 1)], waves: { every: 5, count: 12 }, giants: { every: 14, hp: 70, first: 10 }, towers: [] } },
  { id: 29, name: 'Il cratere', world: 5, len: 64, target: 30, press: 0.26, cannon: { hp: 52 },
    tip: 'Tutte le trappole insieme. Il campione giusto fa la differenza.',
    gates: [mul(-4, 10, 4, { toggle: { every: 2.5, type: 'sub', value: 80 } }), mul(4, 10, 3), mul(0, 22, 4, { w: 4, move: { amp: 4.5, speed: 0.3 } }), div(-5, 36, 2, { w: 3.5 }), mul(0, 36, 5, { w: 4 }), rec(5, 36, 120, { w: 3.5 })], obstacles: [saw(16, { r: 1, speed: 0.45 }), pit(0, 29, 3, 3), spin(-4, 44, 2.6, 2), spin(4, 44, 2.6, -2)],
    base: { hp: 1, spawners: [sp(-3, 1, 3), sp(3, 1, 3)], waves: { every: 6, count: 30 }, towers: [tw(0, 58, 160, 0.5, 3)] } },
  { id: 30, name: 'Cittadella Rossa', world: 5, len: 64, target: 46, press: 0.28, cannon: { hp: 58 },
    tip: 'L’ultima fortezza: quattro fasi, scudi, bruti e giganti. Buona fortuna, comandante!',
    gates: [mul(-4, 10, 3), mul(4, 10, 3, { move: { amp: 1.5, speed: 0.4 } }), mul(0, 20, 4, { w: 4.4, move: { amp: 4.5, speed: 0.25 } }), add(-5, 32, 25, { w: 3.6 }), mul(0, 32, 3, { w: 3.6, toggle: { every: 2.5, type: 'div', value: 2 } }), add(5, 32, 25, { w: 3.6 }), rainbow(0, 46, 5, 0.65)], obstacles: [saw(15, { r: 1, speed: 0.4 }), spin(0, 26, 3, 1.7), bar(39, 4, 4, 0.35), pit(-6.5, 52, 3, 3), pit(6.5, 52, 3, 3)],
    base: { hp: 1, w: 12, boss: true, name: 'Cittadella Rossa', bruteHp: 34, spawners: [sp(-4, 1, 5), sp(0, 1, 3), sp(4, 1, 5)], waves: { every: 8, count: 30 }, towers: [tw(-6, 58, 170, 0.45, 2), tw(6, 58, 170, 0.45, 2)], giants: { every: 16, hp: 90, first: 12 },
      phases: [{ at: 0.8, wave: 30, shield: 2 }, { at: 0.6, wave: 36, giant: 110, rate: 1.15 }, { at: 0.35, wave: 44, brute: 3, shield: 2, rate: 1.15 }, { at: 0.12, wave: 50, giant: 130, rate: 1.2 }] } },

  // ───────── Mondo 7 · Nuvole di Zucchero (segreto: si apre con le stelle)
  { id: 31, name: 'Zucchero filato', world: 6, len: 60, target: 30, press: 0.24, cannon: { hp: 54 },
    tip: 'Il mondo segreto! Arcobaleni in fila.',
    gates: [rainbow(0, 11, 5.5, 0.5), rainbow(0, 25, 5.5, 0.5, { phase: 1.6 }), mul(-4, 40, 2), add(4, 40, 30)], obstacles: [bar(18, 4, 4, 0.35), saw(33, { speed: 0.45 })],
    base: { hp: 1, spawners: [sp(-3, 1, 3), sp(3, 1, 3)], waves: { every: 6, count: 24 }, towers: [] } },
  { id: 32, name: 'Salti tra le nuvole', world: 6, len: 62, target: 30, press: 0.24, cannon: { hp: 54 },
    tip: 'Tre trampolini sopra il vuoto.',
    gates: [mul(-4, 10, 3), mul(4, 10, 3), mul(-4, 28, 5, { w: 4 }), mul(4, 28, 5, { w: 4 }), rec(0, 44, 150, { w: 5 })], obstacles: [jump(-4, 17, 4), jump(4, 17, 4), pit(0, 22, 16, 3), jump(0, 35, 6), pit(0, 39, 16, 2.5)],
    base: { hp: 1, spawners: [sp(-3, 1, 3), sp(3, 1, 3)], towers: [tw(-5, 56, 150, 0.5, 2), tw(5, 56, 150, 0.5, 2)] } },
  { id: 33, name: 'Gelatiera', world: 6, len: 62, target: 31, press: 0.26, cannon: { hp: 56 },
    tip: 'Corsie che si scambiano e porte che si dividono.',
    gates: [split(0, 10, 2, { w: 5, to: 4.5 }), mul(-4.5, 22, 4, { w: 4 }), mul(4.5, 22, 4, { w: 4 }), split(-4, 38, 2, { w: 4, to: 2 }), mul(4, 38, 5, { w: 4 })], obstacles: [push(4.5, 29, -4, 5), spin(0, 16, 2.2, 2), saw(45, { speed: 0.5 })],
    base: { hp: 1, spawners: [sp(-3, 1, 3), sp(3, 1, 3)], waves: { every: 6, count: 24 }, giants: { every: 12, hp: 80, first: 8 }, towers: [] } },
  { id: 34, name: 'Marea di confetti', world: 6, len: 64, target: 32, press: 0.27, cannon: { hp: 56 },
    tip: 'Giganti a ondate: tienili lontani dal cannone.',
    gates: [mul(-4, 10, 4), mul(4, 10, 3), rainbow(0, 22, 5, 0.7), rec(-5, 36, 150, { w: 4 }), mul(0, 36, 2, { w: 3.6 }), add(5, 36, 30, { w: 4 })], obstacles: [saw(16, { speed: 0.5 }), spin(0, 29, 3, 2), bar(44, 5, 3.5, 0.35)],
    base: { hp: 1, spawners: [sp(-3, 1, 3), sp(3, 1, 3)], towers: [tw(0, 58, 170, 0.5, 3)], giants: { every: 9, hp: 90, first: 6 } } },
  { id: 35, name: 'Castello di Panna', world: 6, len: 64, target: 50, press: 0.28, cannon: { hp: 62 },
    tip: 'Il castello segreto: ogni trucco che hai imparato, tutto insieme.',
    gates: [split(0, 10, 2, { w: 5, to: 4 }), mul(-4, 20, 3, { w: 4.4 }), mul(4, 20, 4, { w: 4.4, toggle: { every: 2.5, type: 'sub', value: 120 } }), rainbow(0, 32, 5, 0.7), rec(-5, 44, 200, { w: 3.6 }), mul(0, 44, 3, { w: 3.6 }), add(5, 44, 40, { w: 3.6 })], obstacles: [jump(4, 14.5, 4), saw(26, { speed: 0.45 }), push(-4, 38, 0, 5), pit(-6.5, 52, 3, 3), pit(6.5, 52, 3, 3)],
    base: { hp: 1, w: 12, boss: true, name: 'Castello di Panna', bruteHp: 40, spawners: [sp(-4, 1, 5), sp(0, 1, 3), sp(4, 1, 5)], waves: { every: 8, count: 30 }, towers: [tw(-6, 58, 180, 0.45, 2), tw(6, 58, 180, 0.45, 2)], giants: { every: 14, hp: 110, first: 10 },
      phases: [{ at: 0.8, wave: 30, shield: 2 }, { at: 0.6, wave: 40, giant: 140, rate: 1.15 }, { at: 0.35, wave: 44, brute: 4, shield: 2, rate: 1.15 }, { at: 0.12, wave: 56, giant: 160, rate: 1.2 }] } },
];

// apply the tuner's numbers (src/orda/levels-tune.js): base hp, red pressure ×k, clock and stars
export function applyTune(l, t) {
  if (!t) return { ...l, time: l.time || 90, stars: l.stars || { par: 60, crowd: 30 } };
  const k = t.k ?? 1, kh = t.kh ?? k, b = l.base; // kh: hit points of towers, brutes and giants
  const spawners = b.spawners.map((s) => { const c = s.count * k, n = Math.max(1, Math.round(c)); return { ...s, count: n, rate: +(s.rate * (c / n)).toFixed(3) }; });
  return {
    ...l, time: t.time, stars: { par: t.par, crowd: t.crowd },
    base: {
      ...b, hp: t.hp, spawners,
      ...(b.waves ? { waves: { ...b.waves, count: Math.max(2, Math.round(b.waves.count * k)) } } : {}),
      towers: b.towers.map((x) => ({ ...x, hp: Math.max(10, Math.round(x.hp * kh)) })),
      ...(b.giants ? { giants: { ...b.giants, hp: Math.max(10, Math.round(b.giants.hp * kh)) } } : {}),
      ...(b.bruteHp ? { bruteHp: Math.max(6, Math.round(b.bruteHp * kh)) } : {}),
      ...(b.phases ? { phases: b.phases.map((p) => ({ ...p, ...(p.wave ? { wave: Math.max(2, Math.round(p.wave * k)) } : {}), ...(p.bruteHp ? { bruteHp: Math.round(p.bruteHp * kh) } : {}), ...(p.giant ? { giant: Math.max(10, Math.round(p.giant * kh)) } : {}) })) } : {}),
    },
  };
}
export const RAW_LEVELS = RAW;
export const LEVELS = RAW.map((l) => applyTune(l, TUNE[l.id]));
// tests / tools: the level a number points to (generated levels pass their own object around)
export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const LEVEL_COUNT = LEVELS.length;
// the campaign that unlocks by playing; the secret world (31-35) opens with stars (WORLD_STARS)
export const MAIN_LEVELS = 30;

// ───────── bonus levels ("Caveau d'oro"): no defence, only gates; the clock runs out and every figure
// that reaches the vault pays (bonusCoins in meta.js). Seeded by their number, so a reload can't re-roll.
export function bonusLevel(n = 1) {
  let a = (n * 2654435761) >>> 0 || 7; const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[(r() * arr.length) | 0];
  const rows = [
    () => [mul(-4, 0, pick([2, 3])), add(4, 0, pick([5, 10, 15]))],
    () => [rainbow(0, 0, 5.5, 0.5 + r() * 0.3)],
    () => [split(0, 0, 2, { w: 5, to: 4 })],
    () => [mul(-5, 0, 3, { w: 4 }), mul(0, 0, 2, { w: 3.6 }), mul(5, 0, 4, { w: 3.6 })],
    () => [mul(0, 0, pick([3, 4]), { w: 4.4, move: { amp: 4.5, speed: 0.3 + r() * 0.2 } })],
  ];
  const gates = [], ys = [11, 21, 31, 40];
  ys.forEach((y, i) => { const row = (i === 0 ? rows[0] : pick(rows))(); for (const g of row) gates.push({ ...g, y }); });
  return {
    id: `bonus-${n}`, name: 'Caveau d’oro', world: 7, bonus: true, len: 52, w: 16, time: 22, countdown: 1,
    stars: { par: 22, crowd: 0 }, cannon: { hp: 99 }, gates, obstacles: r() < 0.5 ? [jump(0, 16, 4)] : [],
    base: { hp: 1e9, w: 12, name: 'Caveau', spawners: [], towers: [] },
  };
}
