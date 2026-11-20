// Renders the Baso Hub cover for Quiz e Parole with the game's own styles: node tools/quiz-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4684). Writes public/covers/quiz.webp (1600x900).
// Key art: the title, a quiz card with the right answer lighting up, a Parolina row, the hot-air balloon
// of the Impiccato and the seven Anagrammi letters, on the "Classico" theme.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4684/').replace(/\/?$/, '/');
const W = 1600, H = 900;
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => { localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false })); localStorage.setItem('baso_quiz_v1', JSON.stringify({ v: 1, theme: 'classico' })); });
await page.goto(BASE + '?game=quiz');
await page.waitForSelector('#qz-root', { timeout: 30000 });
// the impiccato view draws the balloon: grab its SVG from the real game
await page.evaluate(() => window.__quiz.ctx.go('impiccato'));
await page.waitForSelector('.qz-hm-svg', { timeout: 10000 });
const balloon = await page.evaluate(() => document.querySelector('.qz-hm-svg').outerHTML);
await page.evaluate((balloon) => {
  document.querySelectorAll('.toasts, .wipe').forEach((x) => x.remove());
  const app = document.getElementById('app');
  const tile = (ch, c, i) => `<div class="qz-pr-t done ${c}" style="--tile:86px;transform:rotate(${(i - 2) * 2}deg)">${ch}</div>`;
  app.innerHTML = `<div class="qz-root qz-t-classico" style="position:fixed;inset:0;overflow:hidden">
    <div style="position:absolute;inset:0;background:radial-gradient(900px 620px at 78% 30%, rgba(79,124,255,.45), transparent 65%), radial-gradient(700px 500px at 10% 100%, rgba(255,200,69,.28), transparent 60%)"></div>
    <div style="position:absolute;left:-60px;top:-80px;width:1800px;height:1100px;opacity:.07;background:repeating-linear-gradient(115deg,#fff 0 2px,transparent 2px 46px)"></div>
    <div style="position:absolute;right:70px;top:-30px;width:430px;height:470px;border-radius:40px;overflow:hidden;transform:rotate(6deg);box-shadow:0 30px 60px rgba(0,0,0,.45)">${balloon.replace('class="qz-hm-svg', 'style="width:100%;height:100%" class="qz-hm-svg')}</div>
    <div style="position:absolute;left:84px;top:96px;font-family:var(--qz-font);color:#fff">
      <div style="font-size:26px;letter-spacing:.32em;font-weight:800;color:var(--qz-acc);text-transform:uppercase">Baso Hub · Quiz</div>
      <div style="font-size:150px;line-height:.86;font-weight:900;font-style:italic;text-transform:uppercase;text-shadow:0 10px 30px rgba(0,0,0,.4)">Quiz<br><span style="color:var(--qz-acc)">e Parole</span></div>
      <div style="margin-top:22px;font-size:30px;font-weight:700;letter-spacing:.04em;color:#cfd6ff">1.300+ domande · Parolina · Impiccato · Anagrammi</div>
    </div>
    <div class="qz-stage" style="position:absolute;left:96px;top:470px;width:760px;padding:22px 26px;border-radius:26px;background:rgba(20,26,58,.92);border:2px solid rgba(255,255,255,.16);box-shadow:0 30px 70px rgba(0,0,0,.5);transform:rotate(-2.5deg)">
      <div class="qz-qhead"><span class="qz-catpill" style="--c:#ff3b3b">🏁 Motori e Formula</span><span class="qz-stars">★★<i>★</i></span><span class="qz-num">3/10</span></div>
      <div class="qz-timer"><i style="transform:scaleX(.62)"></i></div>
      <h2 class="qz-q" style="font-size:32px;animation:none">Chi fu il primo campione del mondo di Formula 1?</h2>
      <div class="qz-answers">${['Juan Manuel Fangio', 'Giuseppe Farina', 'Alberto Ascari', 'Tazio Nuvolari'].map((a, i) => `<div class="qz-ans ${i === 1 ? 'right' : ''}" style="animation:none;font-size:21px"><kbd>${'ABCD'[i]}</kbd><span>${a}</span></div>`).join('')}</div>
    </div>
    <div style="position:absolute;right:120px;top:520px;display:flex;flex-direction:column;gap:10px;transform:rotate(3deg)">
      <div style="display:flex;gap:10px">${[['P', 'hit'], ['A', 'near'], ['R', 'hit'], ['T', 'hit'], ['O', 'near']].map(([c, k], i) => tile(c, k, i)).join('')}</div>
      <div style="display:flex;gap:10px">${[['P', 'hit'], ['O', 'hit'], ['R', 'hit'], ['T', 'hit'], ['A', 'hit']].map(([c, k], i) => tile(c, k, i)).join('')}</div>
    </div>
    <div style="position:absolute;left:830px;top:200px;width:200px;height:200px;transform:rotate(-8deg)">${'ANAGRAM'.split('').map((c, i) => { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; return `<div class="qz-an-tile" style="position:absolute;left:${70 + Math.cos(a) * 78}px;top:${70 + Math.sin(a) * 78}px;width:58px;height:58px;font-size:28px;display:grid;place-items:center">${c}</div>`; }).join('')}</div>
    ${[[1480, 470, 40], [930, 70, 30], [1010, 820, 46], [60, 820, 34], [1530, 840, 28]].map(([x, y, s]) => `<span class="qz-coin" style="position:absolute;left:${x}px;top:${y}px;font-size:${s}px"></span>`).join('')}
  </div>`;
}, balloon);
await page.waitForTimeout(1200);
const buf = await page.screenshot({ type: 'png' });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/quiz.webp', Buffer.from(out, 'base64'));
console.log('cover quiz', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
