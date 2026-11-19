// Renders the Baso Hub cover for Carte Baso: node tools/carte-cover.mjs
// No preview needed: the card faces come straight from the game's procedural art (src/carte/core/art.js),
// staged on a felt table in CSS 3D (a Scopa in progress: a fan of cards in hand, the settebello landing
// on the table for a scopa, captured piles, the briscola under the stock, a French ace for the other games).
// Writes public/covers/carte.webp (1600x900).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { faceSVG, BACKS, TABLES } from '../src/carte/core/art.js';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const W = 1600, H = 900;
const uri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const back = uri(BACKS.find((b) => b.id === 'rosso').svg(0.58));
const backB = uri(BACKS.find((b) => b.id === 'baso').svg(0.58));
const felt = TABLES[0].bg;
const card = (id, x, y, rot, { w = 150, style = 'napoletane', down = false, z = 1, glow = false, lift = 0, cls = '' } = {}) =>
  `<img class="c ${cls}${glow ? ' glow' : ''}" src="${down ? (down === 'b' ? backB : back) : uri(faceSVG(id, style))}" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg) translateZ(${lift}px);z-index:${z}">`;
const html = `<!doctype html><html><head><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#06140b}
  .scene{position:absolute;inset:0;perspective:1500px;perspective-origin:50% 0%}
  .table{position:absolute;left:-200px;top:-330px;width:2000px;height:1300px;transform:rotateX(34deg);transform-origin:50% 30%;background:${felt};
    box-shadow:inset 0 0 0 26px #5a3716,inset 0 0 0 30px #8a5a2a,inset 0 0 260px rgba(0,0,0,.6);border-radius:60px;transform-style:preserve-3d}
  .c{position:absolute;border-radius:12px;box-shadow:0 3px 4px rgba(0,0,0,.35),0 12px 26px rgba(0,0,0,.35)}
  .c.glow{box-shadow:0 0 0 4px #ffd23f,0 0 40px 10px rgba(255,210,63,.7),0 18px 30px rgba(0,0,0,.4)}
  .hand{position:absolute;left:46%;bottom:-150px;width:0;height:0}
  .hand img{position:absolute;width:215px;left:-107px;bottom:0;transform-origin:50% 160%;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.55)}
  .light{position:absolute;inset:0;background:radial-gradient(60% 55% at 52% 30%,rgba(255,240,200,.18),transparent 70%),radial-gradient(120% 90% at 50% 120%,rgba(0,0,0,.55),transparent 60%);pointer-events:none}
  .coin{position:absolute;width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff2b0,#f2c12e 45%,#a36e08);box-shadow:0 6px 10px rgba(0,0,0,.45),inset 0 0 0 4px rgba(150,95,5,.6)}
</style></head><body><div class="scene"><div class="table">
  ${card('', 420, 520, -8, { down: true, w: 170, z: 2 })}${card('', 424, 516, -7, { down: true, w: 170, z: 3 })}${card('', 428, 512, -6, { down: true, w: 170, z: 4 })}
  ${card('1c', 540, 600, 82, { w: 170, z: 1 })}
  ${card('3b', 760, 440, -6, { w: 170, z: 5 })}${card('4s', 950, 430, 4, { w: 170, z: 5 })}
  ${card('7d', 860, 520, -12, { w: 182, z: 20, glow: true, lift: 60 })}
  ${card('', 1500, 430, 12, { down: 'b', w: 160, z: 2 })}${card('', 1505, 425, 14, { down: 'b', w: 160, z: 3 })}${card('10d', 1492, 470, 96, { w: 160, z: 4 })}
  ${card('1S', 1180, 640, 18, { style: 'francesi', w: 190, z: 6 })}${card('13H', 1250, 600, 28, { style: 'francesi', w: 190, z: 5 })}
  <i class="coin" style="left:640px;top:720px"></i><i class="coin" style="left:690px;top:745px"></i><i class="coin" style="left:660px;top:770px"></i>
</div><div class="light"></div>
<div class="hand">${[['9d', -24], ['8c', -12], ['6s', 0], ['10b', 12], ['1d', 24]].map(([c, r], i) => `<img src="${uri(faceSVG(c, i % 2 ? 'piacentine' : 'napoletane'))}" style="transform:rotate(${r}deg) translateY(${Math.abs(r) * 1.4}px)">`).join('')}</div>
</div></body></html>`;
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.waitForTimeout(500);
const buf = await page.screenshot({ type: 'png' });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/carte.webp', Buffer.from(out, 'base64'));
console.log('cover carte', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
