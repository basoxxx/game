// Kart Baso — game data: characters, kart parts, paints, items, speed classes, cups, tracks and
// battle arenas. Pure data (no three.js): the launcher entry, the menu and the headless tests read it.
//
// Track format: `pts` are closed Catmull-Rom control points [x, z, y?, width?]. Features are placed
// with `u`, a control-point index (1.5 = halfway between points 1 and 2). `lat` is a lateral offset in
// half-widths (-1 left edge … 1 right edge). Cuts (shortcuts) are open paths from main `from` to `to`.

export const CHARACTERS = [
  { id: 'baso', name: 'Baso', tag: 'Il padrone di casa', color: '#18c1b0', skin: '#f6c69a', hat: '#2457d6', look: 'beanie', st: { spd: 3, acc: 3, wgt: 3, han: 3 }, free: true },
  { id: 'lella', name: 'Lella Lampo', tag: 'Scatta come un fulmine', color: '#ffc928', skin: '#ffd9b8', hat: '#ff7a1a', look: 'ponytail', st: { spd: 2, acc: 5, wgt: 1, han: 4 }, free: true },
  { id: 'pina', name: 'Pina Pomodoro', tag: 'Rossa, rotonda, testarda', color: '#ff3b3b', skin: '#ff4a3a', hat: '#2fbf4a', look: 'tomato', st: { spd: 3, acc: 4, wgt: 2, han: 3 }, free: true },
  { id: 'tito', name: 'Tito Tartufo', tag: 'Fiuta le scorciatoie', color: '#ff8a1f', skin: '#c98a4b', hat: '#6b3f1f', look: 'dog', st: { spd: 3, acc: 3, wgt: 3, han: 4 }, free: true },
  { id: 'gino', name: 'Gino Granito', tag: 'Duro come la roccia', color: '#8d6e52', skin: '#9aa0a8', hat: '#5b616b', look: 'rock', st: { spd: 5, acc: 1, wgt: 5, han: 2 }, cup: 0, cost: 600 },
  { id: 'mimi', name: 'Mimì Micia', tag: 'Curve a fil di baffo', color: '#ff6fb5', skin: '#fff1e4', hat: '#ff6fb5', look: 'cat', st: { spd: 2, acc: 4, wgt: 2, han: 5 }, cup: 1, cost: 900 },
  { id: 'rocco', name: 'Rocco Robot', tag: 'Ottimizzato al millimetro', color: '#4aa8ff', skin: '#c9d6e6', hat: '#4aa8ff', look: 'robot', st: { spd: 4, acc: 3, wgt: 4, han: 3 }, cup: 2, cost: 1200 },
  { id: 'nonna', name: 'Nonna Turbo', tag: 'Ottant’anni di pedale', color: '#9b5cff', skin: '#f3c9a8', hat: '#ffffff', look: 'granny', st: { spd: 5, acc: 2, wgt: 4, han: 2 }, cup: 3, cost: 1500 },
];

// kart parts: stat deltas (spd, acc, wgt, han) plus off-road grip (off) and drift (dft)
export const BODIES = [
  { id: 'classico', name: 'Classico', d: { spd: 0, acc: 0, wgt: 0, han: 0 }, cost: 0, desc: 'Equilibrato in tutto.' },
  { id: 'saetta', name: 'Saetta', d: { spd: 1, acc: -1, wgt: 0, han: 0 }, cost: 450, desc: 'Muso lungo: più punta, meno spunto.' },
  { id: 'bisonte', name: 'Bisonte', d: { spd: 1, acc: -1, wgt: 2, han: -1 }, cost: 650, desc: 'Pesante: vince gli spintoni.' },
  { id: 'piuma', name: 'Piuma', d: { spd: -1, acc: 2, wgt: -1, han: 1 }, cost: 500, desc: 'Leggerissimo: riparte subito.' },
];
export const WHEELS = [
  { id: 'standard', name: 'Standard', d: { spd: 0, acc: 0, han: 0 }, off: 0, cost: 0, desc: 'Vanno bene ovunque.' },
  { id: 'slick', name: 'Lisce', d: { spd: 1, acc: 0, han: -1 }, off: -0.08, cost: 400, desc: 'Velocissime sull’asfalto, scivolano fuori.' },
  { id: 'tassellate', name: 'Tassellate', d: { spd: 0, acc: -1, han: 0 }, off: 0.16, cost: 400, desc: 'Erba, sabbia e neve non le fermano.' },
  { id: 'morbide', name: 'Morbide', d: { spd: -1, acc: 1, han: 1 }, off: 0.04, cost: 450, desc: 'Tanta presa, derapate strette.' },
];
export const PAINTS = [
  { id: 'auto', name: 'Del pilota', color: null, cost: 0 },
  { id: 'bianco', name: 'Bianco latte', color: '#f4f5f7', cost: 0 },
  { id: 'nero', name: 'Nero lucido', color: '#22252b', cost: 0 },
  { id: 'menta', name: 'Menta', color: '#3ee6b0', cost: 150 },
  { id: 'lampone', name: 'Lampone', color: '#e5145f', cost: 150 },
  { id: 'cielo', name: 'Cielo', color: '#49b6ff', cost: 150 },
  { id: 'limone', name: 'Limone', color: '#f8f04a', cost: 150 },
  { id: 'lavanda', name: 'Lavanda', color: '#b28bff', cost: 200 },
  { id: 'oro', name: 'Oro', color: '#f5c542', metal: true, cost: 400 },
  { id: 'cromo', name: 'Cromo', color: '#d6dde6', metal: true, cost: 400 },
  { id: 'arcobaleno', name: 'Arcobaleno', color: '#ff4d6d', rainbow: true, cost: 900 },
  { id: 'notte', name: 'Notte stellata', color: '#24206b', metal: true, cost: 600 },
];

// stat block → physics numbers
export function kartStats(charId, bodyId = 'classico', wheelId = 'standard') {
  const c = CHARACTERS.find((x) => x.id === charId) || CHARACTERS[0];
  const b = BODIES.find((x) => x.id === bodyId) || BODIES[0];
  const w = WHEELS.find((x) => x.id === wheelId) || WHEELS[0];
  const cl = (v) => Math.max(1, Math.min(6, v));
  const spd = cl(c.st.spd + b.d.spd + w.d.spd), acc = cl(c.st.acc + b.d.acc + w.d.acc), wgt = cl(c.st.wgt + b.d.wgt), han = cl(c.st.han + b.d.han + w.d.han);
  return {
    spd, acc, wgt, han,
    top: 25.5 + (spd - 3) * 0.75,             // m/s on tarmac (≈ 92 km/h)
    accel: 11 + (acc - 3) * 1.6,              // m/s² from standstill
    mass: 1 + (wgt - 3) * 0.22,
    turn: 2.05 + (han - 3) * 0.13,            // rad/s
    grip: 9 + (han - 3) * 0.7,
    off: 0.55 + w.off,                        // top-speed factor off the road
  };
}

export const CLASSES = [
  { id: 'facile', name: 'Facile', cc: '50 cc', mult: 0.88, ai: 0.35, rubber: 0.08 },
  { id: 'normale', name: 'Normale', cc: '100 cc', mult: 1, ai: 0.62, rubber: 0.05 },
  { id: 'esperto', name: 'Esperto', cc: '150 cc', mult: 1.1, ai: 0.9, rubber: 0.03 },
];

// Items. `w` = roulette weights by race standing: [front, middle, back]; `bw` = battle weight
export const ITEMS = {
  peperoncino: { name: 'Peperoncino', desc: 'Turbo piccante', w: [6, 18, 14], bw: 10, color: '#ff3b2f' },
  tris: { name: 'Tris di peperoncini', desc: 'Tre turbo', w: [0, 6, 22], bw: 0, color: '#ff6a2f', uses: 3, as: 'peperoncino' },
  olio: { name: 'Chiazza d’olio', desc: 'Fa girare chi ci passa sopra', w: [30, 16, 4], bw: 18, color: '#3a2f4a' },
  bomba: { name: 'Bomba Rimbalzina', desc: 'Rimbalza ed esplode', w: [16, 18, 10], bw: 22, color: '#2b2d42' },
  ricciolo: { name: 'Ricciolo', desc: 'Fusillo a ricerca: insegue chi ti precede', w: [10, 24, 14], bw: 24, color: '#ffd23f' },
  scudo: { name: 'Scudo Bolla', desc: 'Para un colpo', w: [24, 6, 2], bw: 14, color: '#4ad6ff' },
  calamita: { name: 'Calamita', desc: 'Ti tira verso chi sta davanti e gli ruba l’oggetto', w: [0, 12, 18], bw: 12, color: '#ff4d6d' },
  moka: { name: 'Super Moka', desc: 'Invincibile e velocissimo', w: [0, 2, 14], bw: 0, color: '#c08457' },
  monete: { name: 'Sacchetto di monete', desc: '+3 monete', w: [14, 6, 2], bw: 0, color: '#f5c542' },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

// ───────── tracks
// themes: sky gradient, fog, ground (off-road), road, kerb colours, scenery kit, off-road surface
export const THEMES = {
  prato: { sky: ['#4fb8ff', '#d4f1ff'], fog: '#cfe9ff', ground: '#5cc24a', ground2: '#7ad65a', road: '#5d6270', line: '#ffffff', kerb: ['#ff3b3b', '#ffffff'], wall: ['#ff5a3c', '#ffffff'], off: 'grass', props: 'meadow', sun: '#fff4d6', hemi: ['#dff1ff', '#4a8a3a'] },
  spiaggia: { sky: ['#30b4ff', '#c9f6ff'], fog: '#bdeeff', ground: '#f3d99a', ground2: '#ffe8b0', road: '#8c7f6a', line: '#fff6d8', kerb: ['#22b8ff', '#ffffff'], wall: ['#ff9a3c', '#ffffff'], off: 'sand', props: 'beach', sea: '#1aa6d9', sun: '#fff8e0', hemi: ['#e8fbff', '#c9a56a'] },
  canyon: { sky: ['#ff9a5a', '#ffe0b0'], fog: '#ffd2a0', ground: '#d9884a', ground2: '#e8a060', road: '#6b5446', line: '#ffe2a8', kerb: ['#ffffff', '#c2410c'], wall: ['#7c3a1a', '#f0b070'], off: 'sand', props: 'desert', sun: '#ffd9a0', hemi: ['#ffe2c4', '#8a4a20'] },
  porto: { sky: ['#2a3a8a', '#ff9a6a'], fog: '#c2779a', ground: '#4c5866', ground2: '#5c6878', road: '#3c414c', line: '#ffd23f', kerb: ['#ffd23f', '#222222'], wall: ['#ffd23f', '#222222'], off: 'grass', props: 'harbor', sea: '#164a7a', sun: '#ffb38a', hemi: ['#ffb8c8', '#2a3550'], dusk: true },
  neve: { sky: ['#7cc8ff', '#f0f8ff'], fog: '#e6f2ff', ground: '#f4f8ff', ground2: '#ffffff', road: '#7d8aa0', line: '#ffffff', kerb: ['#ff3b6b', '#ffffff'], wall: ['#3b82f6', '#ffffff'], off: 'snow', props: 'snow', sun: '#ffffff', hemi: ['#ffffff', '#9fb4d0'] },
  biscotti: { sky: ['#ff9ed2', '#ffe6f4'], fog: '#ffd6ec', ground: '#8a4a2a', ground2: '#a35a34', road: '#f0d2a8', line: '#ff5fa2', kerb: ['#ff5fa2', '#ffffff'], wall: ['#ffffff', '#ff5fa2'], off: 'choco', props: 'candy', sun: '#fff0f8', hemi: ['#fff0fa', '#8a4a2a'] },
  vulcano: { sky: ['#3a1428', '#ff6a3a'], fog: '#8a3a2a', ground: '#5a4040', ground2: '#6a4a44', road: '#4a4048', line: '#ff9a3c', kerb: ['#ff9a3c', '#2a2a2a'], wall: ['#4a3a3a', '#ff6a2a'], off: 'lava', props: 'volcano', sun: '#ffb070', hemi: ['#ffb08a', '#5a2a20'], dusk: true },
  cometa: { sky: ['#06061a', '#2a1a6a'], fog: '#1a1440', ground: '#000000', road: '#1a1a3a', line: '#5ef2ff', kerb: ['#ff4dd2', '#5ef2ff'], wall: ['#5ef2ff', '#ff4dd2'], off: 'void', props: 'space', sun: '#c8b8ff', hemi: ['#8a7aff', '#1a1040'], night: true },
};

export const TRACKS = [
  { id: 'prato', name: 'Prato Baso', cup: 0, theme: 'prato', w: 17, shoulder: 9,
    sub: 'Un anello facile tra mucche e girasoli: impara a derapare.',
    pts: [[0, 0, 0], [60, -4, 0], [120, 0, 0], [168, 22, 1], [184, 70, 2], [164, 116, 3], [118, 130, 3], [88, 108, 2], [56, 96, 1], [28, 122, 1], [-6, 152, 2], [-56, 158, 2], [-96, 128, 1], [-108, 78, 0], [-92, 30, 0], [-48, 4, 0]],
    feats: [
      { k: 'items', u: 1.9 }, { k: 'jump', u: 2.6, h: 1.6, len: 9 }, { k: 'coins', u: 0.6, lat: -0.4, n: 6 }, { k: 'coins', u: 4.4, lat: 0.3, n: 5 },
      { k: 'boost', u: 1.2, lat: 0.35 }, { k: 'items', u: 6.6 }, { k: 'bumper', u: 9.6, amp: 0.65, period: 5.5, mesh: 'cow' }, { k: 'mud', u: 12.1, lat: -0.4, r: 4.5 },
      { k: 'items', u: 11.2 }, { k: 'coins', u: 13.3, lat: 0.2, n: 6 }, { k: 'boost', u: 14.4, lat: -0.3 },
    ],
    cuts: [{ from: 3.35, to: 4.75, via: [[150, 70]], w: 7, surf: 'dirt', items: true }],
  },
  { id: 'spiaggia', name: 'Spiaggia Bassa', cup: 0, theme: 'spiaggia', w: 17, shoulder: 10,
    sub: 'Sabbia, ombrelloni e un pontile pieno di monete.',
    pts: [[0, 0, 0], [70, 0, 0], [132, -14, 0], [172, -52, 0], [176, -102, 0], [142, -134, 0], [94, -126, 0], [62, -96, 0], [22, -96, 0], [-14, -128, 0], [-66, -138, 0], [-112, -104, 0], [-118, -52, 0], [-84, -14, 0], [-40, -2, 0]],
    feats: [
      { k: 'items', u: 1.5 }, { k: 'coins', u: 2.4, lat: 0.4, n: 6 }, { k: 'boost', u: 3.6, lat: -0.3 }, { k: 'bumper', u: 5.2, amp: 0.6, period: 4.5, mesh: 'ball' },
      { k: 'items', u: 6.8 }, { k: 'mud', u: 8.2, lat: 0.35, r: 5, mesh: 'puddle' }, { k: 'jump', u: 10.5, h: 1.8, len: 9 }, { k: 'coins', u: 11.6, lat: -0.3, n: 6 },
      { k: 'items', u: 12.4 }, { k: 'boost', u: 13.6, lat: 0.3 }, { k: 'bumper', u: 0.5, amp: 0.55, period: 6, mesh: 'ball' },
    ],
    cuts: [{ from: 7.3, to: 8.9, via: [[40, -125]], w: 7, surf: 'dirt', items: false, coins: 4 }],
    sea: { side: 'south', z: -175 },
  },
  { id: 'canyon', name: 'Canyon Ruggine', cup: 1, theme: 'canyon', w: 16, shoulder: 7,
    sub: 'Salti enormi sopra le gole e massi che rotolano.',
    pts: [[0, 0, 0], [80, 0, 2], [140, 22, 6], [162, 72, 9], [132, 112, 11], [72, 112, 11], [38, 142, 9], [58, 192, 6], [20, 232, 4], [-42, 222, 3], [-74, 172, 2], [-62, 112, 1], [-92, 62, 0], [-62, 16, 0]],
    feats: [
      { k: 'items', u: 1.2 }, { k: 'jump', u: 1.8, h: 2.4, len: 11 }, { k: 'coins', u: 2.5, lat: 0, n: 6 }, { k: 'bumper', u: 4.5, amp: 0.7, period: 4.2, mesh: 'boulder' },
      { k: 'items', u: 5.6 }, { k: 'jump', u: 7.4, h: 2.8, len: 12 }, { k: 'boost', u: 8.4, lat: 0.3 }, { k: 'items', u: 9.6 },
      { k: 'mud', u: 10.6, lat: 0.4, r: 5 }, { k: 'coins', u: 11.4, lat: -0.3, n: 6 }, { k: 'boost', u: 12.6, lat: -0.3 }, { k: 'jump', u: 13.3, h: 1.6, len: 8 },
    ],
    cuts: [{ from: 9.35, to: 10.9, via: [[-40, 170]], w: 7, surf: 'dirt', items: true }],
  },
  { id: 'porto', name: 'Porto Lanterna', cup: 1, theme: 'porto', w: 16, shoulder: 6,
    sub: 'Banchine al tramonto, casse che scorrono e curve a gomito.',
    pts: [[0, 0, 0], [90, 0, 0], [132, 12, 0], [142, 52, 0], [112, 74, 0], [102, 112, 0], [132, 142, 0], [122, 184, 0], [70, 194, 0], [20, 172, 0], [-10, 132, 0], [-60, 130, 0], [-102, 100, 0], [-104, 42, 0], [-62, 6, 0]],
    feats: [
      { k: 'items', u: 0.7 }, { k: 'boost', u: 1.3, lat: 0 }, { k: 'bumper', u: 3.6, amp: 0.7, period: 3.6, mesh: 'crate' }, { k: 'coins', u: 4.6, lat: 0, n: 5 },
      { k: 'items', u: 5.5 }, { k: 'mud', u: 7.4, lat: -0.35, r: 4, mesh: 'oil' }, { k: 'jump', u: 8.5, h: 1.4, len: 8 }, { k: 'items', u: 10.5 },
      { k: 'bumper', u: 11.5, amp: 0.7, period: 4, mesh: 'crate' }, { k: 'coins', u: 12.6, lat: 0.3, n: 6 }, { k: 'boost', u: 13.5, lat: -0.3 },
    ],
    cuts: [{ from: 3.3, to: 6.6, via: [[150, 96]], w: 6.5, surf: 'dirt', items: false, coins: 5 }],
    sea: { side: 'east', x: 200 },
  },
  { id: 'neve', name: 'Picco Sorbetto', cup: 2, theme: 'neve', w: 16, shoulder: 8,
    sub: 'Si sale fra i pini innevati: attento al ghiaccio e alle palle di neve.',
    pts: [[0, 0, 0], [70, 10, 3], [120, 50, 7], [112, 102, 11], [62, 112, 13], [32, 152, 15], [-20, 172, 15], [-72, 152, 12], [-82, 102, 8], [-122, 72, 5], [-112, 20, 2], [-60, -10, 0]],
    feats: [
      { k: 'items', u: 0.8 }, { k: 'coins', u: 1.5, lat: 0.3, n: 6 }, { k: 'mud', u: 2.6, lat: 0, r: 6, mesh: 'ice', ice: true }, { k: 'items', u: 3.7 },
      { k: 'bumper', u: 5.5, amp: 0.7, period: 4.4, mesh: 'snowball' }, { k: 'boost', u: 6.3, lat: 0.3 }, { k: 'jump', u: 7.4, h: 2.2, len: 10 }, { k: 'items', u: 8.6 },
      { k: 'geyser', u: 9.6, lat: -0.35, period: 4 }, { k: 'mud', u: 10.4, lat: 0.4, r: 5, mesh: 'ice', ice: true }, { k: 'coins', u: 10.8, lat: -0.3, n: 6 }, { k: 'boost', u: 11.5, lat: 0 },
    ],
    cuts: [{ from: 8.25, to: 10.2, via: [[-95, 62]], w: 7, surf: 'snow', items: true }],
  },
  { id: 'biscotti', name: 'Fabbrica Biscotti', cup: 2, theme: 'biscotti', w: 15, shoulder: 5,
    sub: 'Nastri trasportatori, presse per biscotti e laghi di cioccolato.',
    pts: [[0, 0, 0], [80, 0, 0], [112, 30, 0], [92, 62, 0], [112, 92, 0], [152, 102, 0], [162, 152, 0], [112, 172, 0], [52, 152, 0], [20, 172, 0], [-30, 170, 0], [-62, 130, 0], [-42, 90, 0], [-82, 60, 0], [-72, 15, 0], [-35, 0, 0]],
    feats: [
      { k: 'items', u: 0.7 }, { k: 'boost', u: 1.2, lat: -0.3, belt: true }, { k: 'boost', u: 1.35, lat: 0.3, belt: true }, { k: 'bumper', u: 3.2, amp: 0.6, period: 3.4, mesh: 'press' },
      { k: 'coins', u: 4.5, lat: 0, n: 6 }, { k: 'items', u: 5.6 }, { k: 'jump', u: 6.5, h: 1.6, len: 9 }, { k: 'mud', u: 8.2, lat: 0.3, r: 4.5, mesh: 'choco' },
      { k: 'items', u: 9.7 }, { k: 'bumper', u: 11.6, amp: 0.6, period: 3.8, mesh: 'press' }, { k: 'boost', u: 13.3, lat: 0, belt: true }, { k: 'coins', u: 14.4, lat: 0.3, n: 6 },
    ],
    cuts: [{ from: 10.4, to: 13.5, via: [[-40, 100], [-70, 64]], w: 6, surf: 'choco', items: false, coins: 5 }],
  },
  { id: 'vulcano', name: 'Vulcano Bollente', cup: 3, theme: 'vulcano', w: 16, shoulder: 3.5,
    sub: 'Lava ai bordi, geyser di fuoco e un salto sopra il cratere.',
    pts: [[0, 0, 0], [62, -20, 2], [122, -10, 4], [152, 40, 6], [132, 100, 8], [82, 130, 10], [22, 122, 12], [-20, 152, 10], [-80, 142, 7], [-122, 92, 4], [-112, 30, 2], [-60, 0, 0]],
    feats: [
      { k: 'items', u: 0.8 }, { k: 'geyser', u: 1.6, lat: 0.3, period: 3.5 }, { k: 'coins', u: 2.4, lat: -0.3, n: 6 }, { k: 'boost', u: 3.3, lat: 0 },
      { k: 'items', u: 4.6 }, { k: 'bumper', u: 5.5, amp: 0.65, period: 4, mesh: 'boulder' }, { k: 'jump', u: 6.6, h: 2.6, len: 11 }, { k: 'geyser', u: 7.6, lat: -0.3, period: 3.2 },
      { k: 'items', u: 8.6 }, { k: 'coins', u: 9.5, lat: 0.3, n: 6 }, { k: 'boost', u: 10.5, lat: -0.25 }, { k: 'geyser', u: 11.3, lat: 0.35, period: 4.5 },
    ],
    cuts: [{ from: 2.6, to: 4.4, via: [[118, 52]], w: 6, surf: 'dirt', items: true }],
  },
  { id: 'cometa', name: 'Anello Cometa', cup: 3, theme: 'cometa', w: 15, shoulder: 0, void: true,
    sub: 'Una strada di luce sospesa tra le stelle. Senza bordi.',
    pts: [[0, 0, 20], [80, 0, 22], [150, 30, 26], [182, 90, 30], [152, 152, 28], [92, 162, 24], [60, 122, 20], [0, 112, 18], [-50, 152, 22], [-110, 142, 26], [-152, 92, 24], [-132, 30, 22], [-70, 0, 20]],
    rails: [[0, 1.4], [3.6, 5.2], [6.4, 7.6], [9.5, 10.8], [12.3, 13]],
    feats: [
      { k: 'items', u: 0.6 }, { k: 'boost', u: 1.6, lat: 0 }, { k: 'coins', u: 2.4, lat: 0.3, n: 6 }, { k: 'jump', u: 2.9, h: 2, len: 10 },
      { k: 'items', u: 4.4 }, { k: 'boost', u: 5.6, lat: -0.3 }, { k: 'bumper', u: 6.9, amp: 0.6, period: 3.8, mesh: 'planet' }, { k: 'items', u: 8.4 },
      { k: 'coins', u: 9.2, lat: -0.3, n: 6 }, { k: 'jump', u: 10.2, h: 2.2, len: 10 }, { k: 'items', u: 11.6 }, { k: 'boost', u: 12.4, lat: 0.3 },
    ],
    cuts: [],
  },
];
// Four cups of four races: the cup's two home tracks, then both again run backwards ("rovescio":
// same scenery, mirrored flow, features and shortcuts moved to match). Tracks open with their cup.
export const CUPS = [
  { id: 'basilico', name: 'Coppa Basilico', color: '#2fbf4a', races: ['prato', 'spiaggia', 'prato:r', 'spiaggia:r'] },
  { id: 'peperoncino', name: 'Coppa Peperoncino', color: '#ff3b2f', races: ['canyon', 'porto', 'canyon:r', 'porto:r'] },
  { id: 'ghiacciolo', name: 'Coppa Ghiacciolo', color: '#4ad6ff', races: ['neve', 'biscotti', 'neve:r', 'biscotti:r'] },
  { id: 'cometa', name: 'Coppa Cometa', color: '#b28bff', races: ['vulcano', 'cometa', 'vulcano:r', 'cometa:r'] },
];

// "prato:r" → the track definition run backwards
export function trackDef(key) {
  const [id, r] = String(key).split(':');
  const t = TRACKS.find((x) => x.id === id) || TRACKS[0];
  if (r !== 'r') return { ...t, key: t.id };
  const n = t.pts.length, U = (u) => (n - u + n) % n;
  return {
    ...t, key: t.id + ':r', rev: true, name: t.name + ' (rovescio)',
    pts: [t.pts[0], ...t.pts.slice(1).reverse()],
    feats: t.feats.map((f) => ({ ...f, u: U(f.u), lat: f.lat != null ? -f.lat : f.lat })),
    cuts: (t.cuts || []).map((c) => ({ ...c, from: U(c.to), to: U(c.from), via: [...c.via].reverse() })),
    rails: t.rails?.map(([a, b]) => { const x = U(b), y = a === 0 ? n : U(a); return [x, y]; }),
  };
}
export const trackName = (key) => trackDef(key).name;

export const ARENAS = [
  { id: 'cortile', name: 'Cortile Baso', theme: 'prato', size: 62, sub: 'Un cortile quadrato con fontana e rampe.', pillars: [[0, 0, 7], [-30, -30, 3.5], [30, -30, 3.5], [-30, 30, 3.5], [30, 30, 3.5]], ramps: [[-46, 0, 0], [46, 0, Math.PI], [0, -46, Math.PI / 2], [0, 46, -Math.PI / 2]] },
  { id: 'cratere', name: 'Cratere Lunare', theme: 'cometa', size: 66, round: true, sub: 'Un cratere tondo sotto le stelle.', pillars: [[0, 0, 5], [-26, 14, 4], [26, 14, 4], [0, -30, 4], [-34, -22, 3], [34, -22, 3]], ramps: [[0, 40, -Math.PI / 2], [-40, 0, 0], [40, 0, Math.PI]] },
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
export const arenaById = (id) => ARENAS.find((t) => t.id === id) || ARENAS[0];
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
export const cupById = (id) => CUPS.find((c) => c.id === id) || CUPS[0];
