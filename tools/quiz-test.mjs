// Quiz e Parole data and logic tests (no browser): node tools/quiz-test.mjs
// Question bank schema, no duplicates, valid answer index, balanced categories and difficulties; word lists
// (lengths, characters, no offensive words, answers ⊂ valid guesses); daily determinism; Parolina scoring;
// Impiccato and Anagrammi data.
import { readFileSync, readdirSync } from 'node:fs';
import { dailyWord, dailyQuestions, dailyPick, dayNumber, dateKey, scoreGuess, fold, canBuild, hash, rng, shuffle } from '../src/quiz/daily.js';
import { HANGMAN } from '../src/quiz/data/hangman.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('✗ ' + msg); } };
const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

// ── question bank
const CATS = ['motori', 'cultura', 'geografia', 'storia', 'scienza', 'sport', 'cinema', 'lingua', 'tecnologia'];
const files = readdirSync(new URL('../src/quiz/data/q/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
ok(JSON.stringify(files) === JSON.stringify([...CATS].sort()), `categorie: ${files}`);
const bank = {}; let total = 0;
const ids = new Set(), texts = new Map();
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
for (const c of CATS) {
  const list = bank[c] = json(`src/quiz/data/q/${c}.json`);
  total += list.length;
  const diffs = [0, 0, 0, 0];
  for (const q of list) {
    const where = `${c}/${q.id}`;
    ok(typeof q.id === 'string' && q.id.startsWith(`${c}-`), `${where}: id`);
    ok(!ids.has(q.id), `${where}: id duplicato`); ids.add(q.id);
    ok([1, 2, 3].includes(q.d), `${where}: difficoltà ${q.d}`); diffs[q.d]++;
    ok(typeof q.q === 'string' && q.q.length >= 10 && q.q.length <= 200 && /[?…»:]$/.test(q.q.trim()), `${where}: testo domanda «${q.q}»`);
    ok(Array.isArray(q.a) && q.a.length === 4 && q.a.every((x) => typeof x === 'string' && x.trim().length > 0 && x.length <= 90), `${where}: 4 risposte`);
    ok(new Set(q.a.map((x) => x.trim().toLowerCase())).size === 4, `${where}: risposte ripetute ${q.a}`);
    ok(Number.isInteger(q.c) && q.c >= 0 && q.c < 4, `${where}: indice risposta ${q.c}`);
    ok(typeof q.e === 'string' && q.e.length >= 10 && q.e.length <= 260, `${where}: spiegazione`);
    ok(!/[|]/.test(q.q + q.a.join('') + q.e), `${where}: separatore nel testo`);
    const k = `${norm(q.q)}|${q.a.map(norm).sort().join('|')}`;
    ok(!texts.has(k), `${where}: domanda duplicata di ${texts.get(k)} «${q.q}»`); texts.set(k, where);
  }
  ok(list.length >= 110, `${c}: solo ${list.length} domande`);
  for (const d of [1, 2, 3]) ok(diffs[d] >= 25, `${c}: difficoltà ${d} con ${diffs[d]} domande`);
}
ok(total >= 1200, `domande totali ${total} < 1200`);
const sizes = CATS.map((c) => bank[c].length);
ok(Math.max(...sizes) <= 2 * Math.min(...sizes), `categorie sbilanciate ${sizes}`);
// the right answer is spread over the four positions (no "always A")
const pos = [0, 0, 0, 0]; for (const c of CATS) for (const q of bank[c]) pos[q.c]++;
ok(Math.min(...pos) > total * 0.15, `posizione risposta giusta sbilanciata ${pos}`);

// ── word lists
const answers = json('src/quiz/data/words/answers.json');
const valid = new Set([...json('src/quiz/data/words/valid.json'), ...answers]);
const { words: ana, seeds } = json('src/quiz/data/words/anagram.json');
ok(answers.length >= 1800 && answers.length <= 2200, `parole soluzione ${answers.length}`);
ok(answers.every((w) => /^[a-z]{5}$/.test(w)), 'soluzioni: 5 lettere a-z senza accenti');
ok(new Set(answers).size === answers.length, 'soluzioni duplicate');
ok(valid.size >= 5000, `tentativi validi ${valid.size}`);
ok([...valid].every((w) => /^[a-z]{5}$/.test(w)), 'tentativi: 5 lettere a-z');
const BAD = /^(cazz|fott|merd|stronz|troi|puttan|vaffa|minch|culo|negr|froc|porc[aoi]|zoccol|porno|sesso|droga|cacca|cretin)/;
ok(!answers.some((w) => BAD.test(w)), `soluzioni offensive: ${answers.filter((w) => BAD.test(w))}`);
ok(!ana.some((w) => BAD.test(w)), 'anagrammi: parole offensive');
for (const w of ['carta', 'porta', 'mondo', 'tempo', 'amico', 'acqua', 'pizza']) ok(valid.has(w), `manca la parola comune ${w}`);
ok(ana.every((w) => /^[a-z]{3,7}$/.test(w)), 'anagrammi: 3-7 lettere a-z');
ok(seeds.length >= 300 && seeds.every((s) => s.length === 7 && ana.includes(s)), `semi anagrammi ${seeds.length}`);
for (const s of seeds.slice(0, 60)) ok(ana.filter((w) => canBuild(w, s)).length >= 14, `seme ${s} con poche parole`);

// ── daily determinism
const d1 = dailyWord(answers, 100), d2 = dailyWord(answers.slice(), 100);
ok(d1 === d2, 'parola del giorno non deterministica');
const yearWords = Array.from({ length: 365 }, (_, i) => dailyWord(answers, i + 1));
ok(new Set(yearWords).size === 365, 'parola del giorno ripetuta entro un anno');
const q1 = dailyQuestions(bank, 42), q2 = dailyQuestions(JSON.parse(JSON.stringify(bank)), 42);
ok(JSON.stringify(q1) === JSON.stringify(q2), 'quiz del giorno non deterministico');
ok(q1.length === 10 && new Set(q1.map((x) => x.id)).size === 10, 'quiz del giorno: 10 domande diverse');
ok(JSON.stringify(dailyQuestions(bank, 43)) !== JSON.stringify(q1), 'quiz del giorno uguale tra due giorni');
const lv = q1.map((x) => bank[x.cat].find((q) => q.id === x.id).d);
ok(lv.join() === '1,1,1,2,2,2,2,3,3,3', `quiz del giorno: difficoltà ${lv}`);
ok(new Set(q1.map((x) => x.cat)).size >= 8, 'quiz del giorno: poche categorie');
ok(dailyPick(seeds, 7, 'anagrammi') === dailyPick(seeds.slice().reverse(), 7, 'anagrammi'), 'anagramma del giorno non deterministico');
ok(dayNumber(new Date(2026, 0, 1)) === 1 && dayNumber(new Date(2026, 0, 31, 23, 59)) === 31 && dayNumber(new Date(2027, 0, 1)) === 366, 'numerazione dei giorni');
ok(dateKey(new Date(2026, 2, 5)) === '2026-03-05', 'chiave data');
const r1 = rng(hash('x')), r2 = rng(hash('x')); ok(r1() === r2() && r1() === r2(), 'rng deterministico');
ok(shuffle([1, 2, 3, 4, 5], rng(1)).sort().join() === '1,2,3,4,5', 'shuffle');

// ── Parolina scoring (classic rules with repeated letters)
const sg = (g, a) => scoreGuess(g, a).join('');
ok(sg('carta', 'carta') === '22222', 'tutte verdi');
ok(sg('aarco', 'carta') === '12210', `doppie: ${sg('aarco', 'carta')}`);
ok(sg('lalla', 'palla') === '02222', `doppie 2: ${sg('lalla', 'palla')}`);
ok(sg('aaaaa', 'carta') === '02002', `doppie 3: ${sg('aaaaa', 'carta')}`);
ok(sg('mondo', 'tempo') === '10002', `assenti: ${sg('mondo', 'tempo')}`);
ok(fold('perché') === 'perche' && fold('È') === 'e', 'lettere accentate');

// ── Impiccato
ok(HANGMAN.length >= 8, 'impiccato: categorie');
const hw = new Set();
for (const c of HANGMAN) {
  ok(c.words.length >= 20, `impiccato ${c.id}: ${c.words.length} parole`);
  for (const w of c.words) {
    ok(/^[A-Z][A-Z ]{1,20}[A-Z]$/.test(w.w), `impiccato: parola «${w.w}»`);
    ok(w.h && w.h.length >= 6 && !w.h.toUpperCase().includes(w.w), `impiccato: indizio di ${w.w}`);
    ok(!hw.has(`${c.id}:${w.w}`), `impiccato duplicato ${w.w}`); hw.add(`${c.id}:${w.w}`);
  }
}

console.log(`${checks} controlli · ${total} domande (${CATS.map((c, i) => `${c} ${sizes[i]}`).join(', ')}) · ${answers.length} soluzioni · ${valid.size} tentativi validi · ${ana.length} parole anagrammi`);
if (fails) { console.error(`${fails} controlli falliti`); process.exit(1); }
console.log('Quiz e Parole: tutti i test superati');
