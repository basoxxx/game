// Tavolo Baso · Battaglia navale — 10x10 grids, a fleet of five ships, placement rules (optionally ships may
// not touch, not even at the corners), shots and the computer admiral: random, hunt/target, and probability
// density over every placement of the remaining ships still consistent with what is known. Pure (no DOM).
export const SIZE = 10;
export const FLEET = [
  { id: 'portaerei', name: 'Portaerei', len: 5 },
  { id: 'corazzata', name: 'Corazzata', len: 4 },
  { id: 'incrociatore', name: 'Incrociatore', len: 3 },
  { id: 'sottomarino', name: 'Sottomarino', len: 3 },
  { id: 'torpediniera', name: 'Torpediniera', len: 2 },
];
export const cellName = (x, y) => 'ABCDEFGHIJ'[y] + (x + 1);
export const shipCells = (s) => Array.from({ length: s.len }, (_, k) => (s.dir ? [s.x, s.y + k] : [s.x + k, s.y]));
export function rng(seed) { let x = (seed >>> 0) || 0x2545f491; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }

// can `ship` go there, given the other ships? (ignores a ship with the same id)
export function canPlace(ships, ship, noTouch = true) {
  for (const [x, y] of shipCells(ship)) if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  const occ = new Set();
  for (const o of ships) {
    if (o.id === ship.id) continue;
    for (const [x, y] of shipCells(o)) {
      occ.add(x + y * SIZE);
      if (noTouch) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) occ.add((x + dx) + (y + dy) * SIZE + (x + dx < 0 || x + dx >= SIZE ? 1e6 : 0));
    }
  }
  return shipCells(ship).every(([x, y]) => !occ.has(x + y * SIZE));
}
export function randomFleet(rnd = Math.random, noTouch = true) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = []; let ok = true;
    for (const f of FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const s = { id: f.id, len: f.len, dir: rnd() < 0.5 ? 0 : 1, x: 0, y: 0 };
        s.x = Math.floor(rnd() * (SIZE - (s.dir ? 0 : s.len - 1))); s.y = Math.floor(rnd() * (SIZE - (s.dir ? s.len - 1 : 0)));
        if (canPlace(ships, s, noTouch)) { ships.push(s); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('flotta impossibile');
}
export function fleetValid(ships, noTouch = true) {
  if (ships.length !== FLEET.length) return false;
  return ships.every((s) => canPlace(ships, s, noTouch));
}
// a sea: the ships of one player and the shots received. shots[i]: 0 unknown, 1 miss, 2 hit, 3 sunk
export function newSea(ships) { return { ships: ships.map((s) => ({ ...s, hits: 0, sunk: false })), shots: new Int8Array(SIZE * SIZE), count: 0 }; }
export function shipAt(sea, x, y) { return sea.ships.find((s) => shipCells(s).some(([a, b]) => a === x && b === y)) || null; }
export function fire(sea, x, y) {
  const i = x + y * SIZE;
  if (sea.shots[i]) return { result: 'again' };
  sea.count++;
  const s = shipAt(sea, x, y);
  if (!s) { sea.shots[i] = 1; return { result: 'miss' }; }
  sea.shots[i] = 2; s.hits++;
  if (s.hits >= s.len) { s.sunk = true; for (const [a, b] of shipCells(s)) sea.shots[a + b * SIZE] = 3; return { result: 'sunk', ship: s }; }
  return { result: 'hit', ship: s };
}
export const allSunk = (sea) => sea.ships.every((s) => s.sunk);
// what the shooter knows about a sea: 0 unknown, 1 miss/empty, 2 hit, 3 sunk (+ sunk ships list)
export function viewOf(sea) { return { shots: sea.shots.slice(), sunk: sea.ships.filter((s) => s.sunk).map((s) => ({ ...s })), left: sea.ships.filter((s) => !s.sunk).map((s) => s.len) }; }

export const NAV_LEVELS = [
  { id: 0, name: 'Mozzo', sub: 'spara un po’ a caso' },
  { id: 1, name: 'Marinaio', sub: 'caccia e bersaglio' },
  { id: 2, name: 'Capitano', sub: 'scacchiera + bersaglio intelligente' },
  { id: 3, name: 'Ammiraglio', sub: 'densità di probabilità' },
];
// known-empty cells: misses, plus (no-touch rule) the ring around sunk ships
function knownEmpty(v, noTouch) {
  const e = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) if (v.shots[i] === 1) e[i] = 1;
  if (noTouch) for (const s of v.sunk) for (const [x, y] of shipCells(s)) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= SIZE || b >= SIZE) continue; const i = a + b * SIZE; if (!v.shots[i]) e[i] = 1;
  }
  return e;
}
// probability density: how many placements of the remaining ships cover each unknown cell
export function density(v, noTouch = true) {
  const d = new Float64Array(SIZE * SIZE), empty = knownEmpty(v, noTouch);
  const hits = []; for (let i = 0; i < SIZE * SIZE; i++) if (v.shots[i] === 2) hits.push(i);
  const target = hits.length > 0;
  for (const len of v.left) for (let dir = 0; dir < 2; dir++) for (let y = 0; y < SIZE - (dir ? len - 1 : 0); y++) for (let x = 0; x < SIZE - (dir ? 0 : len - 1); x++) {
    let ok = true, cover = 0;
    for (let k = 0; k < len; k++) {
      const i = (x + (dir ? 0 : k)) + (y + (dir ? k : 0)) * SIZE, s = v.shots[i];
      if (empty[i] || s === 3 || s === 1) { ok = false; break; }
      if (s === 2) cover++;
    }
    if (!ok) continue;
    if (target && !cover) continue; // while a wounded ship is afloat, only placements through it count
    const w = target ? Math.pow(30, cover) : 1;
    for (let k = 0; k < len; k++) { const i = (x + (dir ? 0 : k)) + (y + (dir ? k : 0)) * SIZE; if (!v.shots[i]) d[i] += w; }
  }
  return d;
}
const neighbours = (i) => { const x = i % SIZE, y = (i / SIZE) | 0; return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < SIZE && b < SIZE).map(([a, b]) => a + b * SIZE); };
// the computer's next shot on a sea it can only see through v (viewOf)
export function aiShot(v, level = 2, rnd = Math.random, noTouch = true) {
  const free = []; const empty = knownEmpty(v, noTouch);
  for (let i = 0; i < SIZE * SIZE; i++) if (!v.shots[i] && (level === 0 || !empty[i])) free.push(i);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const toXY = (i) => [i % SIZE, (i / SIZE) | 0];
  if (!free.length) { for (let i = 0; i < SIZE * SIZE; i++) if (!v.shots[i]) return toXY(i); return [0, 0]; }
  if (level === 0) {
    // follows up a hit only sometimes
    const hits = []; for (let i = 0; i < SIZE * SIZE; i++) if (v.shots[i] === 2) hits.push(i);
    if (hits.length && rnd() < 0.5) { const n = hits.flatMap(neighbours).filter((i) => !v.shots[i]); if (n.length) return toXY(pick(n)); }
    return toXY(pick(free));
  }
  if (level >= 3) {
    const d = density(v, noTouch); let best = -1, list = [];
    for (const i of free) { if (d[i] > best + 1e-9) { best = d[i]; list = [i]; } else if (Math.abs(d[i] - best) < 1e-9) list.push(i); }
    return toXY(pick(list.length ? list : free));
  }
  const hits = []; for (let i = 0; i < SIZE * SIZE; i++) if (v.shots[i] === 2) hits.push(i);
  if (hits.length) {
    // target: extend a line of two or more hits, else try around a hit
    if (level >= 2 && hits.length >= 2) {
      const ends = [];
      for (const h of hits) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const x = h % SIZE, y = (h / SIZE) | 0, o = (x + dx) + (y + dy) * SIZE;
        if (x + dx < SIZE && y + dy < SIZE && v.shots[o] === 2) {
          // walk both ways along the line
          for (const k of [-1, 1]) { let a = x, b = y; while (a >= 0 && b >= 0 && a < SIZE && b < SIZE && v.shots[a + b * SIZE] === 2) { a += dx * k; b += dy * k; } if (a >= 0 && b >= 0 && a < SIZE && b < SIZE && !v.shots[a + b * SIZE] && !empty[a + b * SIZE]) ends.push(a + b * SIZE); }
        }
      }
      if (ends.length) return toXY(pick(ends));
    }
    const n = [...new Set(hits.flatMap(neighbours))].filter((i) => !v.shots[i] && !empty[i]);
    if (n.length) return toXY(pick(n));
  }
  // hunt: checkerboard parity (the smallest ship left is >= 2 long)
  if (level >= 2) { const minLen = Math.min(...v.left, 5); const par = free.filter((i) => ((i % SIZE) + ((i / SIZE) | 0)) % Math.max(2, minLen) === 0); if (par.length) return toXY(pick(par)); }
  return toXY(pick(free));
}
