// Ingorgo — worlds, cosmetics, rewards. Pure data (the Baso Hub entry and the node tests import it).
import { CAMPAIGN } from './campaign.js';
import { decodeLevel } from './core.js';

export const WORLDS = [
  { id: 'parcheggio', name: 'Il Parcheggio', mech: 'classico', icon: 'car', color: '#ff5a4e', rule: 'Fai uscire l’auto rossa: trascina i veicoli avanti e indietro per liberarle la strada.', short: 'Libera l’uscita' },
  { id: 'cortile', name: 'Il Cortile', mech: 'tutti', icon: 'users', color: '#ffb020', rule: 'Tutti fuori! Ogni veicolo esce solo dal muso: scegli l’ordine giusto.', short: 'Tutti fuori' },
  { id: 'centro', name: 'Centro Storico', mech: 'sensi', icon: 'right', color: '#3ecf6e', rule: 'Sensi unici: sulle frecce si va solo nel verso indicato (chi attraversa passa).', short: 'Sensi unici' },
  { id: 'incroci', name: 'Gli Incroci', mech: 'semafori', icon: 'alert', color: '#2fb5ff', rule: 'I semafori cambiano a ogni mossa: col rosso non si entra nella casella.', short: 'Semafori' },
  { id: 'porto', name: 'Il Porto', mech: 'porto', icon: 'globe', color: '#3a6bff', rule: 'Un canale taglia il piazzale: sposta il traghetto per attraversarlo (si muove solo vuoto).', short: 'Traghetto' },
  { id: 'punta', name: 'Ora di Punta', mech: 'punta', icon: 'hourglass', color: '#c54bff', rule: 'Tutto insieme e contro il tempo: esci prima che scada il cronometro.', short: 'A tempo' },
];
export const MECH_NAME = { classico: 'Parcheggio', tutti: 'Tutti fuori', sensi: 'Sensi unici', semafori: 'Semafori', porto: 'Traghetto', punta: 'Ora di punta' };
export const MECH_RULE = Object.fromEntries(WORLDS.map((w) => [w.mech, w.rule]));
export const PER_WORLD = 10;
export const TOTAL = WORLDS.length * PER_WORLD;

const _cache = new Map();
// campaign level n (1-based)
export function campaignLevel(n) {
  if (_cache.has(n)) return _cache.get(n);
  const L = decodeLevel(CAMPAIGN[n - 1]);
  const w = Math.floor((n - 1) / PER_WORLD);
  L.id = `c${n}`; L.n = n; L.world = w; L.mech = WORLDS[w].mech;
  _cache.set(n, L);
  return L;
}
export const levelName = (n) => `${Math.floor((n - 1) / PER_WORLD) + 1}-${((n - 1) % PER_WORLD) + 1}`;

// ---------------------------------------------------------------- cosmetics (coins only, no ads)
export const PAINTS = [
  { id: 'rosso', name: 'Rosso corsa', color: '#ff3b3b', cost: 0 },
  { id: 'giallo', name: 'Giallo sole', color: '#ffc928', cost: 60 },
  { id: 'menta', name: 'Menta', color: '#3fe0b0', cost: 60 },
  { id: 'azzurro', name: 'Azzurro', color: '#3aa0ff', cost: 80 },
  { id: 'viola', name: 'Viola', color: '#9b5cff', cost: 100 },
  { id: 'rosa', name: 'Rosa confetto', color: '#ff7ac8', cost: 120 },
  { id: 'nero', name: 'Nero lucido', color: '#2a2d36', cost: 150 },
  { id: 'oro', name: 'Oro', color: '#f5c542', cost: 400, metal: true },
];
export const MODELS = [
  { id: 'utilitaria', name: 'Utilitaria', cost: 0, desc: 'Piccola, simpatica, sempre in coda.' },
  { id: 'bolla', name: 'Bollicina', cost: 150, desc: 'Tonda come una bolla di sapone.' },
  { id: 'sportiva', name: 'Sportiva', cost: 250, desc: 'Bassa, con alettone: fretta di uscire.' },
  { id: 'ape', name: 'Treruote', cost: 300, desc: 'Il motocarro di paese, con il cassone.' },
];
export const HORN_LIST = [
  { id: 'classico', name: 'Clacson classico', cost: 0 },
  { id: 'doppio', name: 'Doppio colpo', cost: 40 },
  { id: 'trombetta', name: 'Trombetta', cost: 60 },
  { id: 'paperella', name: 'Paperella', cost: 80 },
  { id: 'bici', name: 'Campanello', cost: 80 },
  { id: 'melodia', name: 'Arpeggio', cost: 160 },
];
export const THEMES = [
  { id: 'giorno', name: 'Mezzogiorno', cost: 0, sky: '#8fd3ff', fog: '#cfefff', ground: '#8fd16a', sun: 1.25, hemi: ['#ffffff', '#6a8a5a'], css: 'linear-gradient(180deg,#8fd3ff,#cfefff)' },
  { id: 'tramonto', name: 'Tramonto', cost: 120, sky: '#ff9a6b', fog: '#ffc79a', ground: '#b9b56a', sun: 1.05, sunColor: '#ffc08a', hemi: ['#ffd2b0', '#5a4a6a'], css: 'linear-gradient(180deg,#ff8a6b,#ffd29a)' },
  { id: 'neve', name: 'Neve', cost: 180, sky: '#bcd6ee', fog: '#e8f1fa', ground: '#f3f7fb', sun: 1.1, hemi: ['#ffffff', '#8aa0b8'], css: 'linear-gradient(180deg,#bcd6ee,#f3f7fb)', snow: true },
  { id: 'notte', name: 'Notte', cost: 220, sky: '#141a3a', fog: '#1b2350', ground: '#2c4a3a', sun: 0.45, sunColor: '#8aa6ff', hemi: ['#6a7aff', '#1a1a2a'], css: 'linear-gradient(180deg,#141a3a,#2b3570)', night: true },
];
export const SHOP = { paint: PAINTS, model: MODELS, horn: HORN_LIST, theme: THEMES };

// coins: first clear 10 + 5 per star, each extra star later +5; generated packs a bit less; zen 3
export function rewardFor(kind, stars, prevStars = 0) {
  if (kind === 'zen') return 3;
  const per = kind === 'pack' ? 3 : 5, base = kind === 'pack' ? 6 : 10;
  if (!prevStars) return base + per * stars;
  return Math.max(0, stars - prevStars) * per + 1;
}
