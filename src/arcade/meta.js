// Arcade Baso — catalogue: the four games, the shared cosmetics (colours + trails, bought once with the
// coins of every game), the daily challenge and the coin payouts. Pure data: the hub entry imports it.
import { hashStr, rng, todayKey } from './rng.js';

export const GAMES = {
  astro: { id: 'astro', name: 'Astro Baso', genre: 'Sparatutto verticale', icon: 'target', accent: '#36e0ff', sub: 'Tre settori di nebulose, ondate di droni e tre boss giganti. Bombe, potenziamenti e moltiplicatore combo.', two: 'coop', coins: (s) => Math.floor(s / 400) },
  rimbalzo: { id: 'rimbalzo', name: 'Rimbalzo', genre: 'Spaccamattoni', icon: 'burst', accent: '#ff4fd8', sub: 'Racchetta, pallina e 48 quadri di mattoni al neon: multipalla, laser, palla di fuoco e un generatore infinito.', two: 'alt', coins: (s) => Math.floor(s / 250) },
  corri: { id: 'corri', name: 'Corri Baso', genre: 'Corsa infinita', icon: 'speed', accent: '#ffb21f', sub: 'Tre corsie nella città notturna: salta le barriere, scivola sotto le travi, raccogli monete (una ogni quattro va nel salvadanaio) e completa le missioni.', two: 'alt', coins: (s) => Math.floor(s / 300) },
  labirinto: { id: 'labirinto', name: 'Labirinto Goloso', genre: 'Labirinto e inseguimento', icon: 'compass', accent: '#7dff5a', sub: 'Gnam divora i confetti nel labirinto della pasticceria, schiva le quattro vespe e col peperoncino le mette in fuga.', two: 'alt', coins: (s) => Math.floor(s / 250) },
};
export const GAME_IDS = Object.keys(GAMES);

// colours for every player avatar: [main, accent, glow]
export const SKINS = [
  { id: 'neon', name: 'Neon', cost: 0, c: ['#36e0ff', '#ffffff', '#36e0ff'] },
  { id: 'brace', name: 'Brace', cost: 0, c: ['#ff5a2f', '#ffd23f', '#ff7a2f'] },
  { id: 'menta', name: 'Menta', cost: 150, c: ['#3dffb0', '#0b5f4a', '#3dffb0'] },
  { id: 'ametista', name: 'Ametista', cost: 200, c: ['#a65bff', '#ffd1ff', '#c07bff'] },
  { id: 'corallo', name: 'Corallo', cost: 250, c: ['#ff5f8f', '#fff0d0', '#ff7aa8'] },
  { id: 'ghiaccio', name: 'Ghiaccio', cost: 300, c: ['#d8f4ff', '#3f8cff', '#9fdcff'] },
  { id: 'notte', name: 'Notte', cost: 350, c: ['#2a2f5a', '#7d8cff', '#5d6bff'] },
  { id: 'oro', name: 'Oro', cost: 600, c: ['#ffcc1a', '#fff6c8', '#ffd84d'] },
  { id: 'arcobaleno', name: 'Arcobaleno', cost: 900, c: ['#ff3b6b', '#ffd23f', '#36e0ff'], rainbow: true },
];
export const TRAILS = [
  { id: 'scintille', name: 'Scintille', cost: 0, desc: 'Scia di scintille del tuo colore' },
  { id: 'stelle', name: 'Stelline', cost: 180, desc: 'Piccole stelle dorate' },
  { id: 'cuori', name: 'Cuoricini', cost: 220, desc: 'Scia rosa e calda' },
  { id: 'fiamme', name: 'Fiamme', cost: 320, desc: 'Lingue di fuoco arancioni' },
  { id: 'prisma', name: 'Prisma', cost: 500, desc: 'Tutti i colori dello spettro' },
];
export const skinOf = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
export const trailOf = (id) => TRAILS.find((s) => s.id === id) || TRAILS[0];
export const trailColor = (trail, skin, k) => {
  switch (trail) {
    case 'stelle': return '#ffe27a';
    case 'cuori': return k % 2 ? '#ff6fa8' : '#ffb0d0';
    case 'fiamme': return ['#ff3b1f', '#ff8a1f', '#ffd23f'][k % 3];
    case 'prisma': return ['#ff3b6b', '#ffd23f', '#3dffb0', '#36e0ff', '#a65bff'][k % 5];
    default: return skinOf(skin).c[2];
  }
};

// The daily challenge: one game per day (rotating), a seed and a twist, the same for everybody.
export const TWISTS = {
  astro: [
    { id: 'unavita', name: 'Una vita sola', desc: 'una sola nave, punti x2', opts: { lives: 1, scoreMul: 2 } },
    { id: 'tempesta', name: 'Tempesta di proiettili', desc: 'nemici più aggressivi, punti x1,5', opts: { aggro: 1.35, scoreMul: 1.5 } },
    { id: 'arsenale', name: 'Arsenale pieno', desc: 'parti con l’arma al massimo e 5 bombe', opts: { weapon: 4, bombs: 5 } },
  ],
  rimbalzo: [
    { id: 'multi', name: 'Pioggia di palline', desc: 'si parte con tre palline', opts: { startBalls: 3 } },
    { id: 'veloce', name: 'Palla nervosa', desc: 'palla più veloce, punti x1,5', opts: { speedMul: 1.2, scoreMul: 1.5 } },
    { id: 'fuoco', name: 'Fuoco amico', desc: 'molte più capsule', opts: { dropMul: 2 } },
  ],
  corri: [
    { id: 'turbo', name: 'Turbo', desc: 'si parte già veloci, punti x1,5', opts: { startSpeed: 1.35, scoreMul: 1.5 } },
    { id: 'oro', name: 'Monete d’oro', desc: 'ogni moneta vale doppio', opts: { coinMul: 2 } },
    { id: 'ostacoli', name: 'Cantiere aperto', desc: 'più ostacoli, punti x1,5', opts: { density: 1.3, scoreMul: 1.5 } },
  ],
  labirinto: [
    { id: 'sciame', name: 'Sciame', desc: 'una vespa in più', opts: { extraEnemy: 1, scoreMul: 1.5 } },
    { id: 'piccante', name: 'Peperoncino lungo', desc: 'il peperoncino dura il doppio', opts: { powerMul: 2 } },
    { id: 'svelto', name: 'Gnam svelto', desc: 'tutti più veloci, punti x1,5', opts: { speedMul: 1.18, scoreMul: 1.5 } },
  ],
};
export function dailySpec(d = new Date()) {
  const key = todayKey(d), h = hashStr('arcade-baso:' + key), r = rng(h);
  const dayN = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const game = GAME_IDS[dayN % GAME_IDS.length];
  const twist = r.pick(TWISTS[game]);
  return { key, game, seed: h, twist, reward: 80 };
}
