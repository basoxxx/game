// Impiccato, in a friendly version: a hot-air balloon tied to the meadow with seven sandbags. Each wrong
// letter drops a sandbag and the balloon rises; lose them all and it floats away into the clouds. Guess the
// word and the balloon lands for a picnic. Categories with a hint per word; a sandbag can be spent to reveal a letter.
import { qzLoad, qzSave } from '../store.js';
import { HANGMAN } from '../data/hangman.js';
import { fold } from '../daily.js';
import { bar, esc, play, coinBurst, updateWallet, vibrate } from '../ui.js';

const BAGS = 7;
const KB = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
let G = null, root = null;

function pickWord(catId) {
  const cats = catId === 'tutte' ? HANGMAN : HANGMAN.filter((c) => c.id === catId);
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const recent = G?.recent || [];
  const pool = cat.words.filter((w) => !recent.includes(w.w));
  const w = (pool.length ? pool : cat.words)[Math.floor(Math.random() * (pool.length || cat.words.length))];
  return { cat, word: w.w, hint: w.h };
}
function newRound(catId) {
  const p = pickWord(catId);
  const recent = [...(G?.recent || []), p.word].slice(-30);
  G = { catId, ...p, guessed: new Set(), wrong: 0, hinted: false, spent: 0, done: false, won: false, streak: G?.streak || 0, round: (G?.round || 0) + 1, coins: 0, recent };
}
const letters = () => [...new Set(G.word.replace(/[^A-Z]/g, ''))];
const solved = () => letters().every((l) => G.guessed.has(l));

function balloon() {
  const lost = G.wrong, rise = lost * 14 + (G.done && !G.won ? 400 : 0), land = G.done && G.won;
  const bags = Array.from({ length: BAGS }, (_, i) => {
    const gone = i < lost, x = -27 + i * 9, y = 60 + (i % 2) * 6;
    return `<g class="qz-bag ${gone ? 'gone' : ''}" style="--x:${x}px;--d:${(i % 3) * 40}ms"><line x1="${x + 3}" y1="44" x2="${x + 3}" y2="${y}" stroke="#7a5230" stroke-width="1"/><rect x="${x}" y="${y}" width="7" height="9" rx="2.5" fill="#d8b075" stroke="#9b7444" stroke-width="1"/></g>`;
  }).join('');
  return `<svg class="qz-hm-svg ${land ? 'land' : ''} ${G.done && !G.won ? 'away' : ''}" viewBox="-120 -150 240 260" aria-hidden="true">
    <defs><linearGradient id="hm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--qz-sky1)"/><stop offset="1" stop-color="var(--qz-sky2)"/></linearGradient>
    <linearGradient id="hm-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5f6d"/><stop offset=".5" stop-color="#ffc371"/><stop offset="1" stop-color="#ff5f6d"/></linearGradient></defs>
    <rect x="-120" y="-150" width="240" height="260" fill="url(#hm-sky)"/>
    <g class="qz-cloud c1"><ellipse cx="-70" cy="-110" rx="26" ry="10" fill="#fff" opacity=".85"/><ellipse cx="-55" cy="-116" rx="16" ry="9" fill="#fff" opacity=".85"/></g>
    <g class="qz-cloud c2"><ellipse cx="72" cy="-80" rx="30" ry="11" fill="#fff" opacity=".8"/><ellipse cx="88" cy="-86" rx="16" ry="9" fill="#fff" opacity=".8"/></g>
    <path d="M-120 92 Q-60 70 0 86 T120 80 L120 110 L-120 110Z" fill="#6cc46a"/><path d="M-120 100 Q-40 88 30 98 T120 96 L120 110 L-120 110Z" fill="#4fa94f"/>
    <g transform="translate(78 64)"><rect x="-12" y="0" width="24" height="18" fill="#fff3d6"/><path d="M-15 1 L0 -12 L15 1Z" fill="#d9534f"/><rect x="-4" y="7" width="8" height="11" fill="#8a5a3b"/></g>
    <g transform="translate(-74 84)"><circle cx="0" cy="-16" r="5" fill="#ffd2a6"/><rect x="-5" y="-11" width="10" height="13" rx="4" fill="#2f8cff"/><path d="M-5 -6 L-12 ${G.done && G.won ? -16 : -2}" stroke="#ffd2a6" stroke-width="3" stroke-linecap="round"/><path d="M5 -6 L12 ${G.done && G.won ? -16 : -2}" stroke="#ffd2a6" stroke-width="3" stroke-linecap="round"/></g>
    ${land ? '' : `<path class="qz-rope" d="M0 ${48 - rise} Q 8 ${70 - rise / 2} 0 92" stroke="#8a6a4a" stroke-width="1.2" fill="none" ${G.done && !G.won ? 'opacity="0"' : ''}/><rect x="-3" y="88" width="6" height="6" fill="#6b4b2b"/>`}
    <g class="qz-hm-b" style="transform:translateY(${land ? 34 : -rise}px)">
      <path d="M0 -112 C 46 -112 54 -60 30 -22 L 12 4 L -12 4 L -30 -22 C -54 -60 -46 -112 0 -112Z" fill="url(#hm-b)" stroke="#c0392b" stroke-width="1.5"/>
      <path d="M0 -112 C 18 -100 18 -30 6 4 M0 -112 C -18 -100 -18 -30 -6 4" stroke="#c0392b" stroke-width="1" fill="none" opacity=".6"/>
      <path d="M-12 4 L-10 30 M12 4 L10 30" stroke="#7a5230" stroke-width="1.2"/>
      <rect x="-12" y="30" width="24" height="16" rx="3" fill="#a06a3a" stroke="#7a4a22" stroke-width="1"/>
      <circle cx="-3" cy="25" r="4" fill="#ffd2a6"/><circle cx="6" cy="26" r="3.5" fill="#ffd2a6"/>
      <path d="M-7 22 Q-3 17 1 22" fill="#5a3b1b"/>
      ${bags}
    </g></svg>`;
}
function wordHtml() {
  return [...G.word].map((ch) => (ch === ' ' ? '<span class="qz-hm-sp"></span>' : !/[A-Z]/.test(ch) ? `<span class="qz-hm-l show">${ch}</span>` : `<span class="qz-hm-l ${G.guessed.has(ch) || G.done ? 'show' : ''} ${G.done && !G.guessed.has(ch) ? 'miss' : ''}">${G.guessed.has(ch) || G.done ? ch : ''}</span>`)).join('');
}
function kbHtml() {
  return KB.map((row) => `<div class="qz-kb-row">${[...row].map((k) => { const L = k.toUpperCase(), used = G.guessed.has(L), ok = used && G.word.includes(L); return `<button class="qz-key ${used ? (ok ? 'hit' : 'miss') : ''}" data-a="qz" data-do="key" data-k="${L}" ${used || G.done ? 'disabled' : ''}>${L}</button>`; }).join('')}</div>`).join('');
}
function draw() {
  const el = root.querySelector('.qz-hm'); if (!el) return;
  el.querySelector('.qz-hm-art').innerHTML = balloon();
  el.querySelector('.qz-hm-cat').innerHTML = `${G.cat.icon} ${esc(G.cat.name)} · ${G.word.replace(/[^A-Z]/g, '').length} lettere${G.word.includes(' ') ? ` in ${G.word.split(' ').length} parole` : ''}`;
  el.querySelector('.qz-hm-word').innerHTML = wordHtml();
  el.querySelector('.qz-hm-hint').innerHTML = G.hinted || G.done ? `💡 ${esc(G.hint)}` : '';
  el.querySelector('.qz-hm-left').innerHTML = `${'<i class="on"></i>'.repeat(BAGS - G.wrong)}${'<i></i>'.repeat(G.wrong)}<span>${BAGS - G.wrong} sacchetti</span>`;
  el.querySelector('.qz-kb').innerHTML = kbHtml();
  el.querySelector('.qz-hm-tools').innerHTML = G.done ? `<div class="qz-hm-res ${G.won ? 'ok' : 'ko'}"><b>${G.won ? 'Atterraggio perfetto!' : 'La mongolfiera è volata via!'}</b><span>${G.won ? `${G.coins ? `<span class="qz-gain"><span class="qz-coin"></span> +${G.coins}</span> · ` : ''}serie ${G.streak}` : `La parola era ${esc(G.word)}`}</span><button class="btn primary" data-a="qz" data-do="next">Prossima parola <kbd>Invio</kbd></button></div>`
    : `<button class="btn sm" data-a="qz" data-do="hint" ${G.hinted ? 'disabled' : ''}>💡 Indizio</button><button class="btn sm" data-a="qz" data-do="reveal" ${G.wrong >= BAGS - 1 ? 'disabled' : ''} title="Costa un sacchetto di sabbia">🎒 Svela una lettera</button>`;
  root.querySelector('.qz-bar-r').innerHTML = `<span class="qz-streak ${G.streak >= 2 ? 'on' : ''}">🔥 ${G.streak}</span><span class="qz-num">Parola ${G.round}</span>`;
  if (G.done) requestAnimationFrame(() => el.querySelector('.qz-hm-res .btn')?.focus({ preventScroll: true }));
}
function guess(L) {
  if (!G || G.done) return;
  L = fold(L).toUpperCase(); if (!/^[A-Z]$/.test(L) || G.guessed.has(L)) return;
  G.guessed.add(L);
  if (G.word.includes(L)) { play('ok'); if (solved()) end(true); }
  else { G.wrong++; play('bad'); vibrate(40); if (G.wrong >= BAGS) end(false); }
  draw();
}
function reveal() {
  if (!G || G.done || G.wrong >= BAGS - 1) return;
  const hidden = letters().filter((l) => !G.guessed.has(l)); if (!hidden.length) return;
  G.wrong++; G.spent++;
  const L = hidden[Math.floor(Math.random() * hidden.length)];
  G.guessed.add(L); play('select');
  if (solved()) end(true);
  draw();
}
function end(won) {
  G.done = true; G.won = won;
  const d = qzLoad(), h = d.hang;
  h.played++;
  if (won) { h.won++; G.streak++; h.streak = G.streak; h.best = Math.max(h.best, G.streak); G.coins = 5 + (BAGS - G.wrong) + (G.hinted ? 0 : 2); d.coins += G.coins; }
  else { G.streak = 0; h.streak = 0; }
  qzSave(d);
  setTimeout(() => { if (won) { play('win'); coinBurst(root, G.coins); updateWallet(root); } else play('notify'); }, 250);
}

export default {
  render() {
    const d = qzLoad(), cat = d.opts.hmCat || 'tutte';
    return `<div class="qz-play qz-hm">${bar('Impiccato · la mongolfiera')}
      <div class="qz-hm-cats">${[{ id: 'tutte', name: 'Tutte', icon: '🎲' }, ...HANGMAN].map((c) => `<button class="qz-chip ${cat === c.id ? 'on' : ''}" data-a="qz" data-do="cat" data-v="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
      <div class="qz-hm-main"><div class="qz-hm-art"></div>
        <div class="qz-hm-side"><div class="qz-hm-cat"></div><div class="qz-hm-word" aria-live="polite"></div><div class="qz-hm-hint"></div><div class="qz-hm-left" aria-label="Sacchetti rimasti"></div><div class="qz-hm-tools"></div><div class="qz-kb"></div></div></div></div>`;
  },
  mount(r) { root = r; const d = qzLoad(); if (!G || G.catId !== (d.opts.hmCat || 'tutte') || G.done) newRound(d.opts.hmCat || 'tutte'); draw(); },
  unmount() {},
  onKey(e, ctx) {
    if (!G || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); ctx.back(); return; }
    if (e.key === 'Enter' && G.done) { e.preventDefault(); this.act('next'); return; }
    if (e.key.length === 1 && /\p{L}/u.test(e.key)) { e.preventDefault(); guess(e.key); }
  },
  act(n, el, ctx) {
    if (n === 'exit') { ctx.back(); return; }
    if (n === 'key') guess(el.dataset.k);
    else if (n === 'hint') { if (G && !G.done) { G.hinted = true; play('select'); draw(); } }
    else if (n === 'reveal') reveal();
    else if (n === 'next') { newRound(G.catId); draw(); requestAnimationFrame(() => root.querySelector('.qz-key')?.focus({ preventScroll: true })); }
    else if (n === 'cat') { const d = qzLoad(); d.opts.hmCat = el.dataset.v; qzSave(d); const s = G?.streak || 0; G = { streak: s, recent: G?.recent || [], round: G?.round || 0 }; ctx.refresh(); requestAnimationFrame(() => document.querySelector(`.qz-hm-cats [data-v="${el.dataset.v}"]`)?.focus()); }
  },
  get state() { return G && { word: G.word, wrong: G.wrong, done: G.done, won: G.won, guessed: [...G.guessed], streak: G.streak }; },
  test: { guess: (l) => guess(l) },
};
