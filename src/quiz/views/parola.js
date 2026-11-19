// Parolina — guess the 5-letter Italian word in 6 tries. Parola del giorno (the same for everybody on that
// date) and free play, hard mode (revealed hints must be reused), stats and streaks, shareable emoji grid.
// Accented letters typed on a physical keyboard count as the plain letter (è = e); answers have no accents.
import { qzLoad, qzSave } from '../store.js';
import { dateKey, dayNumber, dailyWord, scoreGuess, fold } from '../daily.js';
import { loadParole } from '../words.js';
import { bar, fmt, esc, play, coinBurst, updateWallet, share, vibrate, reduced } from '../ui.js';

const ROWS = 6, LEN = 5;
const KB = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'];
let W = null, root = null, G = null, busy = false, ctxRef = null;

function game(mode) {
  const d = qzLoad(), p = d.parola;
  if (mode === 'daily') {
    const key = dateKey();
    if (!p.day || p.day.key !== key) { p.day = { key, n: dayNumber(), answer: dailyWord(W.answers, dayNumber()), guesses: [], done: false, won: false, hard: d.opts.hard }; qzSave(d); }
    return p.day;
  }
  if (!p.free || !W.answers.includes(p.free.answer)) { p.free = { answer: W.answers[Math.floor(Math.random() * W.answers.length)], guesses: [], done: false, won: false, hard: d.opts.hard }; qzSave(d); }
  return p.free;
}
function keyState(g) {
  const st = {};
  for (const w of g.guesses) scoreGuess(w, g.answer).forEach((s, i) => { const ch = w[i]; st[ch] = Math.max(st[ch] ?? -1, s); });
  return st;
}
const CLS = ['miss', 'near', 'hit'];
function renderBoard(g, cur = '') {
  let h = '';
  for (let r = 0; r < ROWS; r++) {
    const w = g.guesses[r], sc = w ? scoreGuess(w, g.answer) : null, typing = !w && r === g.guesses.length && !g.done;
    h += `<div class="qz-pr-row" data-r="${r}">`;
    for (let i = 0; i < LEN; i++) {
      const ch = w ? w[i] : typing ? cur[i] || '' : '';
      h += `<div class="qz-pr-t ${sc ? `${CLS[sc[i]]} done` : ch ? 'fill' : ''}" style="--i:${i}">${ch ? ch.toUpperCase() : ''}</div>`;
    }
    h += '</div>';
  }
  return h;
}
function renderKb(g) {
  const st = keyState(g);
  return KB.map((row) => `<div class="qz-kb-row">${[...row].map((k) => {
    if (k === '⏎') return '<button class="qz-key wide" data-a="qz" data-do="enter" aria-label="Invio">INVIO</button>';
    if (k === '⌫') return '<button class="qz-key wide" data-a="qz" data-do="del" aria-label="Cancella">⌫</button>';
    const s = st[k];
    return `<button class="qz-key ${s != null ? CLS[s] : ''}" data-a="qz" data-do="key" data-k="${k}">${k.toUpperCase()}</button>`;
  }).join('')}</div>`).join('');
}
function draw() {
  const g = G.g, el = root.querySelector('.qz-pr');
  if (!el) return;
  el.querySelector('.qz-pr-board').innerHTML = renderBoard(g, G.cur);
  el.querySelector('.qz-kb').innerHTML = renderKb(g);
  const hd = root.querySelector('.qz-pr-hard');
  if (hd) { hd.classList.toggle('on', !!g.hard); hd.disabled = g.guesses.length > 0 || g.done; }
  el.querySelector('.qz-pr-end').innerHTML = g.done ? endBox(g) : '';
}
function msg(text, ms = 1600) {
  const m = root.querySelector('.qz-pr-msg'); if (!m) return;
  m.textContent = text; m.classList.add('on'); clearTimeout(msg.t); msg.t = setTimeout(() => m.classList.remove('on'), ms);
}
function shake() { const row = root.querySelector(`.qz-pr-row[data-r="${G.g.guesses.length}"]`); if (!row || reduced()) return; row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
function typeKey(ch) {
  if (busy || G.g.done) return;
  ch = fold(ch); if (!/^[a-z]$/.test(ch) || G.cur.length >= LEN) return;
  G.cur += ch; play('tick');
  const t = root.querySelectorAll(`.qz-pr-row[data-r="${G.g.guesses.length}"] .qz-pr-t`)[G.cur.length - 1];
  if (t) { t.textContent = ch.toUpperCase(); t.classList.add('fill', 'pop'); setTimeout(() => t.classList.remove('pop'), 120); }
}
function del() {
  if (busy || G.g.done || !G.cur) return;
  const t = root.querySelectorAll(`.qz-pr-row[data-r="${G.g.guesses.length}"] .qz-pr-t`)[G.cur.length - 1];
  G.cur = G.cur.slice(0, -1); if (t) { t.textContent = ''; t.classList.remove('fill'); }
}
// hard mode: every green must stay in place and every yellow must be used
function hardViolation(g, w) {
  for (const prev of g.guesses) {
    const sc = scoreGuess(prev, g.answer);
    for (let i = 0; i < LEN; i++) if (sc[i] === 2 && w[i] !== prev[i]) return `La ${i + 1}ª lettera deve essere ${prev[i].toUpperCase()}`;
    const need = {}; for (let i = 0; i < LEN; i++) if (sc[i] >= 1) need[prev[i]] = (need[prev[i]] || 0) + 1;
    for (const [ch, n] of Object.entries(need)) if ([...w].filter((x) => x === ch).length < n) return `La parola deve contenere ${ch.toUpperCase()}`;
  }
  return null;
}
function submit() {
  if (busy || G.g.done) return;
  const g = G.g, w = G.cur;
  if (w.length < LEN) { msg('Servono cinque lettere'); shake(); play('bad'); return; }
  if (!W.valid.has(w)) { msg('Parola non in elenco'); shake(); play('bad'); vibrate(40); return; }
  if (g.hard) { const v = hardViolation(g, w); if (v) { msg(v); shake(); play('bad'); return; } }
  g.guesses.push(w); G.cur = '';
  const won = w === g.answer, lost = !won && g.guesses.length >= ROWS;
  if (won || lost) finish(won);
  qzSave();
  // flip animation: draw the revealed row, then the keyboard after the tiles have turned
  busy = true;
  const r = g.guesses.length - 1, row = root.querySelector(`.qz-pr-row[data-r="${r}"]`), sc = scoreGuess(w, g.answer);
  if (row) row.querySelectorAll('.qz-pr-t').forEach((t, i) => { t.textContent = w[i].toUpperCase(); t.classList.add('flip'); t.style.setProperty('--i', i); setTimeout(() => { t.classList.add(CLS[sc[i]], 'done'); t.classList.remove('fill'); }, reduced() ? 0 : 160 + i * 230); });
  sc.forEach((s, i) => setTimeout(() => play(s === 2 ? 'select' : 'tick'), reduced() ? 0 : 160 + i * 230));
  setTimeout(() => {
    busy = false;
    draw();
    if (won) { const rr = root.querySelector(`.qz-pr-row[data-r="${r}"]`); rr?.classList.add('win'); msg(['Geniale!', 'Magnifico!', 'Splendido!', 'Ottimo!', 'Bene!', 'Per un pelo!'][r] || 'Bravo!', 2200); play('win'); coinBurst(root, G.coins); updateWallet(root); setTimeout(() => statsModal(true), 1400); }
    else if (lost) { msg(`La parola era ${g.answer.toUpperCase()}`, 4000); play('bad'); setTimeout(() => statsModal(true), 1600); }
  }, reduced() ? 0 : 160 + LEN * 230 + 120);
}
function finish(won) {
  const d = qzLoad(), p = d.parola, g = G.g;
  g.done = true; g.won = won;
  p.played++;
  if (won) { p.won++; p.dist[g.guesses.length - 1]++; }
  let coins = 0;
  if (G.mode === 'daily') {
    const y = new Date(); y.setDate(y.getDate() - 1); const yk = dateKey(y);
    if (won) { p.streak = p.lastWinKey === yk ? p.streak + 1 : p.lastWinKey === g.key ? p.streak : 1; p.lastWinKey = g.key; p.maxStreak = Math.max(p.maxStreak, p.streak); coins = 15 + (ROWS - g.guesses.length) * 4 + (g.hard ? 5 : 0); }
    else p.streak = 0;
  } else if (won) coins = 8 + (ROWS - g.guesses.length) * 2 + (g.hard ? 3 : 0);
  d.coins += coins; G.coins = coins; g.coins = coins;
  qzSave(d);
}
function grid(g) { return g.guesses.map((w) => scoreGuess(w, g.answer).map((s) => ['⬛', '🟨', '🟩'][s]).join('')).join('\n'); }
function shareText(g, daily) { return `Parolina${daily ? ` n° ${g.n}` : ' (partita libera)'} ${g.won ? g.guesses.length : 'X'}/6${g.hard ? '*' : ''}\n${grid(g)}`; }
function endBox(g) {
  return `<div class="qz-pr-res ${g.won ? 'ok' : 'ko'}"><b>${g.won ? `Indovinata in ${g.guesses.length}!` : `Era «${g.answer.toUpperCase()}»`}</b>${g.coins ? `<span class="qz-gain"><span class="qz-coin"></span> +${g.coins}</span>` : ''}
    <div class="qz-pr-btns"><button class="btn primary" data-a="qz" data-do="share">Condividi</button><button class="btn" data-a="qz" data-do="stats">Statistiche</button>${G.mode === 'daily' ? '<button class="btn" data-a="qz" data-do="free">Partita libera</button>' : '<button class="btn" data-a="qz" data-do="again">Nuova parola</button>'}</div></div>`;
}
function nextIn() { const n = new Date(); const t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); const s = Math.max(0, Math.floor((t - n) / 1000)); return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`; }
function statsModal(after = false) {
  const p = qzLoad().parola, max = Math.max(1, ...p.dist), g = G?.g;
  ctxRef.App.modal(`<div class="qz-modal"><h2>Statistiche Parolina</h2>
    <div class="qz-pr-stats">${[[p.played, 'giocate'], [p.played ? Math.round((p.won / p.played) * 100) : 0, '% vinte'], [p.streak, 'serie attuale'], [p.maxStreak, 'serie record']].map(([v, l]) => `<div><b>${fmt(v)}</b><span>${l}</span></div>`).join('')}</div>
    <h3>Tentativi</h3><div class="qz-pr-dist">${p.dist.map((n, i) => `<div><span>${i + 1}</span><i style="width:${Math.max(6, (n / max) * 100)}%" class="${g?.done && g.won && g.guesses.length === i + 1 ? 'cur' : ''}">${n}</i></div>`).join('')}</div>
    ${G?.mode === 'daily' && g?.done ? `<p class="qz-note">Nuova parola del giorno tra ${nextIn()}.</p>` : ''}
    <p class="qz-note">La serie conta solo le parole del giorno indovinate in giorni consecutivi.</p>
    <div class="row mt24" style="justify-content:flex-end;gap:8px">${g?.done ? '<button class="btn primary" data-a="qz-share">Condividi</button>' : ''}<button class="btn ${g?.done ? '' : 'primary'}" data-a="close-modal">${after ? 'Chiudi' : 'Ok'}</button></div></div>`, {
    'qz-share': () => share(ctxRef.App, 'Parolina', shareText(G.g, G.mode === 'daily')),
  });
}
function help() {
  ctxRef.App.modal(`<div class="qz-modal"><h2>Come si gioca</h2><p>Indovina la parola italiana di <b>cinque lettere</b> in sei tentativi. Ogni tentativo deve essere una parola valida.</p>
    <div class="qz-pr-ex"><div class="qz-pr-t hit">M</div><div class="qz-pr-t">A</div><div class="qz-pr-t">R</div><div class="qz-pr-t">E</div><div class="qz-pr-t">A</div></div><p><b>Verde</b>: lettera giusta al posto giusto.</p>
    <div class="qz-pr-ex"><div class="qz-pr-t">P</div><div class="qz-pr-t near">I</div><div class="qz-pr-t">A</div><div class="qz-pr-t">N</div><div class="qz-pr-t">O</div></div><p><b>Giallo</b>: la lettera c’è, ma in un altro posto.</p>
    <div class="qz-pr-ex"><div class="qz-pr-t">S</div><div class="qz-pr-t">E</div><div class="qz-pr-t">D</div><div class="qz-pr-t miss">I</div><div class="qz-pr-t">A</div></div><p><b>Grigio</b>: la lettera non c’è.</p>
    <p>Le parole non hanno accenti: se scrivi «è» conta come «e». In <b>modalità difficile</b> gli indizi trovati vanno usati nei tentativi successivi. Ogni giorno c’è una nuova Parola del giorno, uguale per tutti; con la partita libera giochi quanto vuoi.</p>
    <div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Ho capito</button></div></div>`);
}

export default {
  render(params) {
    const mode = params.mode === 'free' ? 'free' : 'daily';
    return `<div class="qz-play qz-pr" data-mode="${mode}">${bar(mode === 'daily' ? `Parolina · parola del giorno n° ${dayNumber()}` : 'Parolina · partita libera', `<button class="btn sm qz-pr-hard" data-a="qz" data-do="hard" title="Modalità difficile">Difficile</button><button class="btn sm icon-btn" data-a="qz" data-do="stats" aria-label="Statistiche">📊</button><button class="btn sm icon-btn" data-a="qz" data-do="help" aria-label="Come si gioca">?</button>`)}
      <div class="qz-pr-tabs"><button class="${mode === 'daily' ? 'on' : ''}" data-a="qz" data-do="daily">Parola del giorno</button><button class="${mode === 'free' ? 'on' : ''}" data-a="qz" data-do="free">Partita libera</button></div>
      <div class="qz-pr-msg" role="status" aria-live="polite"></div>
      <div class="qz-pr-board" aria-label="Griglia"><div class="qz-ready"><b>Carico il dizionario…</b></div></div>
      <div class="qz-pr-end"></div>
      <div class="qz-kb"></div></div>`;
  },
  async mount(r, params, ctx) {
    root = r; ctxRef = ctx; busy = false;
    const mode = params.mode === 'free' ? 'free' : 'daily';
    W = await loadParole();
    if (!root?.isConnected) return;
    G = { mode, g: game(mode), cur: '' };
    draw();
    if (!qzLoad().parola.played && !G.g.guesses.length && !sessionStorageFlag()) help();
  },
  unmount() { G = null; },
  onKey(e, ctx) {
    if (!G || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); ctx.back(); return; }
    if (e.key === 'Enter') { if (document.activeElement?.matches?.('.qz-pr-end .btn, .qz-bar .btn, .qz-pr-tabs button, .qz-exit')) return; e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); del(); return; }
    if (e.key.length === 1 && /\p{L}/u.test(e.key)) { e.preventDefault(); typeKey(e.key); }
  },
  act(n, el, ctx) {
    if (n === 'exit') { ctx.back(); return; }
    if (!G) return;
    if (n === 'key') typeKey(el.dataset.k);
    else if (n === 'del') del();
    else if (n === 'enter') submit();
    else if (n === 'stats') statsModal();
    else if (n === 'help') help();
    else if (n === 'share') share(ctx.App, 'Parolina', shareText(G.g, G.mode === 'daily'));
    else if (n === 'daily' && G.mode !== 'daily') ctx.go('parola', { mode: 'daily' }, { replace: true });
    else if (n === 'free') { if (G.mode !== 'free') ctx.go('parola', { mode: 'free' }, { replace: true }); else if (G.g.done) this.act('again', el, ctx); }
    else if (n === 'again') { const d = qzLoad(); d.parola.free = null; qzSave(d); G.g = game('free'); G.cur = ''; draw(); }
    else if (n === 'hard') {
      if (G.g.guesses.length || G.g.done) { msg('Si cambia solo prima del primo tentativo'); return; }
      const d = qzLoad(); d.opts.hard = !G.g.hard; G.g.hard = d.opts.hard; qzSave(d); draw(); msg(G.g.hard ? 'Modalità difficile attiva' : 'Modalità normale');
    }
  },
  get state() { return G && { mode: G.mode, answer: G.g.answer, guesses: G.g.guesses.slice(), done: G.g.done, won: G.g.won, cur: G.cur, hard: !!G.g.hard }; },
  test: { type: (w) => { for (const ch of w) typeKey(ch); }, submit: () => submit(), valid: (w) => W?.valid.has(w) },
};
function sessionStorageFlag() { try { if (sessionStorage.getItem('qz-pr-help')) return true; sessionStorage.setItem('qz-pr-help', '1'); } catch {} return false; }
