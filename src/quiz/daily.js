// Quiz e Parole — deterministic helpers shared by the game and the node tests (no DOM, no Vite imports).
// The "day" is the player's local calendar date, so everybody playing on the same date gets the same
// Parola del giorno and the same Quiz del giorno.
export const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(list, r = Math.random) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// day 1 = 1 January 2026 (the first Parolina)
const EPOCH = Date.UTC(2026, 0, 1);
export function dayNumber(d = new Date()) { return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000) + 1; }
export function keyToDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); }

// Parola del giorno: a fixed shuffle of the answer list, walked one word per day (no repeats for years)
const permCache = new Map();
export function dailyWord(answers, day) {
  let perm = permCache.get(answers);
  if (!perm) { perm = shuffle(answers.map((_, i) => i), rng(hash('parolina-v1'))); permCache.set(answers, perm); }
  const n = ((day - 1) % answers.length + answers.length) % answers.length;
  return answers[perm[n]];
}

// Quiz del giorno: 10 questions, one or two per category, difficulty rising (easy → hard)
export const DAILY_PLAN = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
export function dailyQuestions(bank, day) {
  const r = rng(hash(`quiz-del-giorno-${day}`));
  const cats = shuffle(Object.keys(bank).sort(), r);
  const used = new Set(), out = [];
  DAILY_PLAN.forEach((d, i) => {
    const cat = cats[i % cats.length];
    let pool = bank[cat].filter((q) => q.d === d && !used.has(q.id));
    if (!pool.length) pool = bank[cat].filter((q) => !used.has(q.id));
    const sorted = pool.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const q = sorted[Math.floor(r() * sorted.length)];
    used.add(q.id); out.push({ cat, id: q.id });
  });
  return out;
}

// Anagrammi del giorno uses the same idea: a seed word picked from the list for that date
export function dailyPick(list, day, salt) { const sorted = list.slice().sort(); return sorted[hash(`${salt}-${day}`) % sorted.length]; }

// Parolina scoring of one guess against the answer: 2 = right place, 1 = in the word, 0 = absent.
// Repeated letters are handled like the classic game (greens first, then yellows left to right).
export function scoreGuess(guess, answer) {
  const res = Array(guess.length).fill(0), left = {};
  for (let i = 0; i < answer.length; i++) { if (guess[i] === answer[i]) res[i] = 2; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < guess.length; i++) if (res[i] !== 2 && left[guess[i]] > 0) { res[i] = 1; left[guess[i]]--; }
  return res;
}
// letters typed with accents count as the plain letter (è → e, à → a…)
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// can `word` be built from the multiset of `letters`?
export function canBuild(word, letters) {
  const c = {}; for (const ch of letters) c[ch] = (c[ch] || 0) + 1;
  for (const ch of word) { if (!c[ch]) return false; c[ch]--; }
  return true;
}
