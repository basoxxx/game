// Per-circuit environment profiles: what the land around each circuit looks like.
//   amp    mid-distance terrain relief (m) around / inside the circuit (0 = flat city)
//   hill   multiplier of the far hills; rock = rocky / snowy tops; hillCol / rockCol tints
//   grass  ground albedo tint, dry = dry-patch tint and amount
//   trees  vegetation mix [[kind, weight]...] (kinds: conifer, broad, bush, desert), dens = density
//   sea    { a: direction of the open water in degrees, w: half-width in degrees }
//   tod    default time of day when the round does not set one (golden-hour rounds)
//   haze   fog density multiplier, fog = fog / horizon tint blended over the HDRI horizon
//   cone   a single volcano on the horizon (Fuji)
//   camp   spectator campsites / motorhomes on the hills, parks = car parks
const BASE = { amp: 9, hill: 1, rock: false, grass: 0x8db86a, dry: 0xd8c27a, dryAmt: 0.4, trees: [['conifer', 0.4], ['broad', 0.45], ['bush', 0.15]], dens: 1, sea: null, tod: null, haze: 1, fog: null, camp: 1, parks: 1, hillCol: 0x2c4424, rockCol: 0x8a8478 };
const P = {
  ardennes: { amp: 16, hill: 1.35, grass: 0x7fae62, trees: [['conifer', 0.7], ['broad', 0.25], ['bush', 0.05]], dens: 1.6, haze: 1.05, hillCol: 0x223a20, camp: 1.6 },
  alpine: { amp: 20, hill: 1.9, rock: true, grass: 0x86b866, trees: [['conifer', 0.8], ['broad', 0.15], ['bush', 0.05]], dens: 1.3, hillCol: 0x27432a, rockCol: 0x9a968c, camp: 1.3 },
  parkland: { amp: 6, hill: 0.55, grass: 0x86b565, trees: [['broad', 0.75], ['conifer', 0.1], ['bush', 0.15]], dens: 1.1, camp: 0.6 },
  british: { amp: 4, hill: 0.35, grass: 0x7fb45f, dryAmt: 0.25, trees: [['broad', 0.7], ['bush', 0.3]], dens: 0.6, haze: 1.2, camp: 1.8, parks: 1.6 },
  medit: { amp: 12, hill: 1.15, grass: 0xa3b36c, dry: 0xd9b872, dryAmt: 0.6, trees: [['broad', 0.5], ['bush', 0.35], ['conifer', 0.15]], dens: 0.8, hillCol: 0x4a5a30, rockCol: 0xa89878 },
  desert: { amp: 7, hill: 0.75, grass: 0xc9b98a, dry: 0xe2c896, dryAmt: 0.5, trees: [['desert', 0.4], ['bush', 0.45], ['broad', 0.15]], dens: 0.3, hillCol: 0x9a7650, rockCol: 0x8c6a4a, haze: 1.5, fog: 0xd9c4a0, camp: 0.2, parks: 1.4 },
  texas: { amp: 13, hill: 0.6, grass: 0xa7ad6a, dry: 0xcdb070, dryAmt: 0.65, trees: [['broad', 0.5], ['bush', 0.5]], dens: 0.55, hillCol: 0x55602f, camp: 1.2, parks: 1.5 },
  tropical: { amp: 12, hill: 1.1, grass: 0x6fae55, dryAmt: 0.2, trees: [['broad', 0.7], ['desert', 0.15], ['bush', 0.15]], dens: 1.2, haze: 1.5, hillCol: 0x1f4a26 },
  japan: { amp: 15, hill: 1.5, grass: 0x7db060, trees: [['conifer', 0.55], ['broad', 0.4], ['bush', 0.05]], dens: 1.5, haze: 1.3, hillCol: 0x1f4028 },
  dunes: { amp: 11, hill: 0.3, grass: 0xa9b579, dry: 0xe0cf9a, dryAmt: 0.7, trees: [['bush', 0.7], ['conifer', 0.3]], dens: 0.45, hillCol: 0x7d8a52, camp: 1.2 },
  city: { amp: 0, hill: 1.1, grass: 0x8db86a, trees: [['broad', 1]], dens: 1, camp: 0, parks: 0 },
  highland: { amp: 6, hill: 1.5, rock: true, grass: 0x9aa864, dry: 0xcbb07a, dryAmt: 0.55, trees: [['broad', 0.6], ['bush', 0.4]], dens: 0.5, haze: 1.6, hillCol: 0x5a5a3a, rockCol: 0x8a7f72, camp: 0.3 },
};
const C = {
  aus: { ...P.parkland, sea: { a: 200, w: 55 }, tod: 'afternoon' },
  chn: { ...P.parkland, amp: 3, hill: 0.25, haze: 1.7, fog: 0xc9ccd0 },
  jpn: { ...P.japan, sea: { a: 100, w: 30 } },
  bhr: { ...P.desert },
  ksa: { ...P.city, ...{ sea: { a: 180, w: 80 }, hill: 0.4, hillCol: 0x9a7650, rockCol: 0x8c6a4a, fog: 0xd9c4a0 } },
  mia: { ...P.parkland, amp: 2, hill: 0.15, trees: [['desert', 0.55], ['broad', 0.3], ['bush', 0.15]], sea: { a: 60, w: 40 }, tod: 'afternoon', parks: 2 },
  can: { ...P.parkland, amp: 3, hill: 0.4, sea: { a: 0, w: 60 }, trees: [['broad', 0.6], ['conifer', 0.3], ['bush', 0.1]] },
  mon: { ...P.city, hill: 2.2, rock: true, sea: { a: 135, w: 75 }, hillCol: 0x4a5a30, rockCol: 0xb0a590 },
  esp: { ...P.medit },
  aut: { ...P.alpine },
  gbr: { ...P.british },
  bel: { ...P.ardennes },
  hun: { ...P.medit, amp: 17, hill: 0.8, grass: 0x98b267, dens: 0.9 },
  ned: { ...P.dunes, sea: { a: 300, w: 60 } },
  ita: { ...P.parkland, dens: 1.9, amp: 3, hill: 0.9, tod: 'afternoon', camp: 0.8, hillCol: 0x25452a },
  mad: { ...P.medit, amp: 5, hill: 0.6, dens: 0.5 },
  aze: { ...P.city, hill: 0.9, sea: { a: 250, w: 70 }, hillCol: 0x8a7a55, rockCol: 0x9a8a70, tod: 'afternoon' },
  sgp: { ...P.city, hill: 0.3, sea: { a: 30, w: 70 } },
  usa: { ...P.texas, tod: 'afternoon' },
  mex: { ...P.highland },
  bra: { ...P.tropical, amp: 18, tod: 'afternoon' },
  lvg: { ...P.city, hill: 1.3, hillCol: 0x8a6a50, rockCol: 0x7c5a48 },
  qat: { ...P.desert, amp: 3, hill: 0.3 },
  abu: { ...P.desert, amp: 3, hill: 0.3, sea: { a: 320, w: 65 }, parks: 1 },
  imo: { ...P.medit, amp: 15, grass: 0x8fb466, dryAmt: 0.35, trees: [['broad', 0.75], ['conifer', 0.1], ['bush', 0.15]], dens: 1.3, hillCol: 0x34502c },
  lem: { ...P.parkland, amp: 5, hill: 0.4, trees: [['conifer', 0.45], ['broad', 0.5], ['bush', 0.05]], dens: 1.6, camp: 2.2, parks: 2 },
  fuj: { ...P.japan, hill: 1.2, cone: { a: 250, h: 1500 } },
};
export function biomeOf(cid) { return { ...BASE, ...(C[cid] || {}) }; }

// rally surfaces: terrain relief beyond the verges, ground tints, rocks and props
export const RALLY_LOOK = {
  gravel: { relief: 20, ground: 0xa9bd8c, tint: 0xb9a070, tintAmt: 0.4, rock: 0x8d8a80, rocks: 1, logs: 1, huts: 1 },
  rough: { relief: 30, ground: 0xdcc493, tint: 0xc98f55, tintAmt: 0.6, rock: 0xb08a62, rocks: 2.4, logs: 0, huts: 0.7 },
  tarmac: { relief: 26, ground: 0xa8c98c, tint: 0xc9b27a, tintAmt: 0.35, rock: 0x97948c, rocks: 0.7, logs: 0.4, huts: 1.6 },
  snow: { relief: 22, ground: 0xffffff, tint: 0xdfe8f0, tintAmt: 0.45, rock: 0x6f7580, rocks: 0.6, logs: 0.8, huts: 1 },
};
