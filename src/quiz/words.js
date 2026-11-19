// Quiz e Parole — the word lists (lazy chunks): Parolina answers and valid guesses, Anagrammi dictionary.
let P = null, A = null;
export async function loadParole() {
  if (P) return P;
  const [ans, val] = await Promise.all([import('./data/words/answers.json'), import('./data/words/valid.json')]);
  const answers = ans.default, valid = new Set([...val.default, ...answers]);
  return (P = { answers, valid });
}
export async function loadAnagram() {
  if (A) return A;
  const m = await import('./data/words/anagram.json');
  const { words, seeds } = m.default;
  return (A = { words, set: new Set(words), seeds });
}
