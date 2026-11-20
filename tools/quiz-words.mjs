// Builds the Parolina / Impiccato / Anagrammi word lists from an open Italian word list.
//   node tools/quiz-words.mjs <dir with the downloaded sources>   (curated lists: src/quiz/words-src/escluse.txt, aggiunte.txt)
// Sources (MIT licence, credited in public/assets/CREDITS.txt):
//   napolux/paroleitaliane: 280000_parole_italiane.txt, 60000_parole_italiane.txt, lista_badwords.txt, 9000_nomi_propri.txt
//   hermitdave/FrequencyWords: it_50k.txt (only used to RANK words by how common they are, nothing is copied)
// Output: src/quiz/data/words/{answers,valid,anagram}.json
//   answers  ~2,000 common 5-letter words (no accents, no proper names, no offensive words) for Parolina
//   valid    every 5-letter word of the big list (accents folded: città -> citta) accepted as a guess
//   anagram  3-7 letter common words used to build and check the Anagrammi rounds
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [dir, blockFile = 'src/quiz/words-src/escluse.txt', extraFile = 'src/quiz/words-src/aggiunte.txt'] = process.argv.slice(2);
if (!dir) { console.error('uso: node tools/quiz-words.mjs <cartella sorgenti> [blocklist] [extra]'); process.exit(1); }
const lines = (f) => readFileSync(f, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const fold = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '');
const big = lines(join(dir, '280000_parole_italiane.txt'));
const common = new Set(lines(join(dir, '60000_parole_italiane.txt')));
const bad = new Set(lines(join(dir, 'lista_badwords.txt')).map((w) => w.toLowerCase()));
const names = new Set(lines(join(dir, '9000_nomi_propri.txt')).map((w) => w.toLowerCase()));
const rank = new Map(); lines(join(dir, 'it_50k.txt')).forEach((l, i) => { const w = l.split(' ')[0]; if (!rank.has(w)) rank.set(w, i); });
const block = new Set(blockFile ? readFileSync(blockFile, 'utf8').split(/\s+/).filter(Boolean) : []);
const extra = extraFile ? readFileSync(extraFile, 'utf8').split(/\s+/).filter(Boolean) : [];
const bigSet = new Set(big);
const clean = (w) => /^[a-z]+$/.test(w) && !bad.has(w) && !block.has(w) && !/[jkwxy]/.test(w) && !/(.)\1\1/.test(w);
const okName = (w) => common.has(w) || !names.has(w);
// offensive stems also catch inflected forms the bad-word list misses
const BAD_STEM = /^(cazz|fott|merd|stronz|troi|puttan|vaffa|cogli|minch|figa|fica|culo|culi|negr|froc|ricchion|bastard|porc[aoi]|pompin|sega|segh|tetta|tette|zoccol|sbirr|drog|nazi|frocio|cretin|stupid|idiot|scem|deficient|imbecill|puzz)/;

const isWordle = (w) => w.length === 5 && clean(w) && okName(w) && /[aeiou]$/.test(w) && !BAD_STEM.test(w);
let answers = big.filter((w) => isWordle(w) && rank.has(w)).sort((a, b) => rank.get(a) - rank.get(b));
const set = new Set(answers);
for (const w of extra) if (w.length === 5 && bigSet.has(w) && isWordle(w) && !set.has(w)) { answers.push(w); set.add(w); }
answers = [...new Set(answers)].slice(0, 2100).sort();
const valid = [...new Set(big.map(fold).filter((w) => w.length === 5 && /^[a-z]+$/.test(w) && !bad.has(w)))].sort();
for (const w of answers) if (!valid.includes(w)) valid.push(w);
valid.sort();
const anagram = big.filter((w) => w.length >= 3 && w.length <= 7 && clean(w) && okName(w) && !BAD_STEM.test(w) && common.has(w) && rank.has(w) && /[aeiou]$/.test(w)).sort();
const out = 'src/quiz/data/words';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'answers.json'), JSON.stringify(answers));
writeFileSync(join(out, 'valid.json'), JSON.stringify(valid.filter((w) => !set.has(w))));
// anagram seeds: common 7-letter words (lemma-like, frequent) that hide at least 14 shorter words
const anaWords = [...new Set(anagram)];
const canBuild = (w, letters) => { const c = {}; for (const ch of letters) c[ch] = (c[ch] || 0) + 1; for (const ch of w) { if (!c[ch]) return false; c[ch]--; } return true; };
const seeds = anaWords.filter((w) => w.length === 7 && rank.get(w) < 15000 && /[aeo]$/.test(w) && new Set(w).size >= 5 && !/r(lo|la|li|le|mi|ti|ci|vi|ne|si)$/.test(w))
  .filter((w) => anaWords.filter((x) => x.length >= 3 && canBuild(x, w)).length >= 14).sort();
writeFileSync(join(out, 'anagram.json'), JSON.stringify({ words: anaWords, seeds }));
console.log(`answers ${answers.length} · valid guesses ${valid.length} · anagram words ${anaWords.length} · seeds ${seeds.length}`);
