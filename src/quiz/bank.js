// Quiz e Parole — question bank: category metadata, lazy loading of the JSON files (one chunk per
// category) and the no-repeat picker (a category's questions all come round before any repeats).
import { qzLoad, qzSave } from './store.js';
import { shuffle } from './daily.js';

export const CATS = [
  { id: 'motori', name: 'Motori e Formula', short: 'Motori', icon: '🏁', color: '#ff3b3b' },
  { id: 'cultura', name: 'Cultura generale', short: 'Cultura', icon: '🎭', color: '#a66bff' },
  { id: 'geografia', name: 'Geografia', short: 'Geografia', icon: '🌍', color: '#1fb6ff' },
  { id: 'storia', name: 'Storia', short: 'Storia', icon: '🏛️', color: '#e0a526' },
  { id: 'scienza', name: 'Scienza', short: 'Scienza', icon: '🔬', color: '#2fd39a' },
  { id: 'sport', name: 'Sport', short: 'Sport', icon: '⚽', color: '#ff8a1f' },
  { id: 'cinema', name: 'Cinema e musica', short: 'Cinema', icon: '🎬', color: '#ff5fa2' },
  { id: 'lingua', name: 'Lingua italiana', short: 'Lingua', icon: '📖', color: '#5b8cff' },
  { id: 'tecnologia', name: 'Tecnologia', short: 'Tech', icon: '💡', color: '#14c8c8' },
];
export const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];
export const DIFFS = [{ v: 0, name: 'Misto' }, { v: 1, name: 'Facile' }, { v: 2, name: 'Medio' }, { v: 3, name: 'Difficile' }];

const loaders = import.meta.glob('./data/q/*.json', { import: 'default' });
const loaded = {};
export async function loadCat(id) {
  if (loaded[id]) return loaded[id];
  const f = loaders[`./data/q/${id}.json`]; if (!f) throw new Error(`Categoria sconosciuta: ${id}`);
  loaded[id] = (await f()).map((q) => ({ ...q, cat: id }));
  return loaded[id];
}
export async function loadCats(ids) { const out = {}; await Promise.all(ids.map(async (id) => { out[id] = await loadCat(id); })); return out; }
export const loadAll = () => loadCats(CATS.map((c) => c.id));
export function countLoaded() { return Object.values(loaded).reduce((n, l) => n + l.length, 0); }

// next question for a category: unseen first; when a category (at that difficulty) is used up its history
// is cleared and it starts over. `avoid` keeps one game free of duplicates whatever happens.
export function pickFrom(bank, cat, diff, avoid) {
  const d = qzLoad(); const seen = new Set(d.seen[cat] || []);
  const all = bank[cat].filter((q) => !avoid.has(q.id));
  const byDiff = diff ? all.filter((q) => q.d === diff) : all;
  let pool = byDiff.filter((q) => !seen.has(q.id));
  if (!pool.length) {
    // pool exhausted: forget the ones of this difficulty and start again
    const drop = new Set(byDiff.map((q) => q.id));
    d.seen[cat] = (d.seen[cat] || []).filter((id) => !drop.has(id)); qzSave(d);
    pool = byDiff.length ? byDiff : all;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  return q;
}
export function markSeen(q) {
  const d = qzLoad(); const l = (d.seen[q.cat] ||= []);
  if (!l.includes(q.id)) l.push(q.id);
  qzSave(d);
}
// a randomised copy of a question (options in a new order, `c` follows the right answer)
export function dealQuestion(q) {
  const order = shuffle([0, 1, 2, 3]);
  return { ...q, a: order.map((i) => q.a[i]), c: order.indexOf(q.c) };
}
export function seenCount(cat) { return (qzLoad().seen[cat] || []).length; }
