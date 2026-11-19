// Builds the Quiz e Parole question bank: src/quiz/questions/<cat>.txt -> src/quiz/data/q/<cat>.json
//   node tools/quiz-build.mjs
// Source line: difficulty|question|right answer|wrong|wrong|wrong|explanation   ('#' lines are comments)
// The four options are shuffled with a seed taken from the question text, so the JSON is stable between builds
// and the right answer is not always the first one (the game shuffles again at runtime anyway).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/quiz/questions', OUT = 'src/quiz/data/q';
mkdirSync(OUT, { recursive: true });
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let total = 0, bad = 0;
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.txt')).sort()) {
  const cat = f.replace(/\.txt$/, '');
  const out = [];
  readFileSync(join(SRC, f), 'utf8').split(/\r?\n/).forEach((line, n) => {
    if (!line.trim() || line.startsWith('#')) return;
    const p = line.split('|').map((s) => s.trim());
    if (p.length !== 7 || !/^[123]$/.test(p[0])) { console.error(`${f}:${n + 1} formato non valido (${p.length} campi)`); bad++; return; }
    const [d, q, right, ...rest] = p; const e = rest.pop();
    const opts = [right, ...rest];
    const r = rng(hash(`${q}|${right}`));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    out.push({ id: `${cat}-${(hash(`${q}|${right}`) % 1e8).toString(36)}`, d: +d, q, a: opts, c: opts.indexOf(right), e });
  });
  writeFileSync(join(OUT, `${cat}.json`), JSON.stringify(out));
  total += out.length;
  console.log(`${cat.padEnd(12)} ${out.length}`);
}
console.log(`totale ${total}${bad ? ` · ${bad} righe con errori` : ''}`);
if (bad) process.exit(1);
