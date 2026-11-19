// Festa Baso — characters and hats. The party guests are the Kart Baso drivers (same names and colours,
// src/kart/data.js) drawn as Orda's bean figures; the hats are Serpentone's (src/serpentone/looks.js).
// Pure data: the hub entry, the screens and the tests read it.
import { CHARACTERS } from '../kart/data.js';

const COST = { gino: 250, mimi: 300, rocco: 350, nonna: 450 };
export const CHARS = CHARACTERS.map((c) => ({ id: c.id, name: c.name, tag: c.tag, color: c.color, skin: c.skin, accent: c.hat, cost: COST[c.id] || 0, kart: c }));
export const charById = (id) => CHARS.find((c) => c.id === id) || CHARS[0];
export const HATS = [
  { id: 'nessuno', name: 'Nessuno', cost: 0 },
  { id: 'festa', name: 'Cappello da festa', cost: 0 },
  { id: 'berretto', name: 'Berretto', cost: 60 },
  { id: 'fiocco', name: 'Fiocco', cost: 90 },
  { id: 'cilindro', name: 'Cilindro', cost: 120 },
  { id: 'elica', name: 'Elica', cost: 160 },
  { id: 'vichingo', name: 'Elmo vichingo', cost: 220 },
  { id: 'aureola', name: 'Aureola', cost: 300 },
  { id: 'corona', name: 'Corona', cost: 400 },
];
export const hatById = (id) => HATS.find((h) => h.id === id) || HATS[0];
export const DEFAULT_CHARS = ['baso', 'lella', 'pina', 'tito'];
