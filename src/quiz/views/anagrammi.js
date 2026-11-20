// Anagrammi a tempo — seven letters, 90 seconds (+2 per word found): build as many Italian words of 3-7
// letters as possible. Using all seven letters is the «parolone». Free rounds and a daily round.
import { qzLoad, qzSave } from '../store.js';
import { loadAnagram } from '../words.js';
import { dateKey, dayNumber, dailyPick, canBuild, shuffle, fold } from '../daily.js';
import { bar, fmt, play, coinBurst, updateWallet, countdown, vibrate } from '../ui.js';

const PTS = { 3: 10, 4: 20, 5: 35, 6: 55, 7: 100 };
const TIME = 90;
let A = null, G = null, root = null, raf = 0;

function newRound(daily) {
  const seed = daily ? dailyPick(A.seeds, dayNumber(), 'anagrammi') : A.seeds[Math.floor(Math.random() * A.seeds.length)];
  const letters = [...seed];
  const all = A.words.filter((w) => w.length >= 3 && canBuild(w, letters)).sort((a, b) => b.length - a.length || a.localeCompare(b));
  G = { daily, seed, letters: shuffle(letters), all, found: [], pick: [], score: 0, t0: 0, extra: 0, ph: 'ready', paused: 0, pauseAt: 0 };
}
const left = () => Math.max(0, TIME + G.extra - (performance.now() - G.t0 - G.paused) / 1000);
const cur = () => G.pick.map((i) => G.letters[i]).join('');

function draw() {
  const el = root.querySelector('.qz-an'); if (!el) return;
  const byLen = {}; for (const w of G.all) byLen[w.length] = (byLen[w.length] || 0) + 1;
  const fl = {}; for (const w of G.found) fl[w.length] = (fl[w.length] || 0) + 1;
  el.querySelector('.qz-an-tiles').innerHTML = G.letters.map((ch, i) => `<button class="qz-an-tile ${G.pick.includes(i) ? 'used' : ''}" data-a="qz" data-do="tile" data-i="${i}" ${G.ph !== 'play' ? 'disabled' : ''}>${ch.toUpperCase()}</button>`).join('');
  el.querySelector('.qz-an-cur').innerHTML = cur() ? [...cur()].map((c) => `<span>${c.toUpperCase()}</span>`).join('') : '<em>Tocca le lettere o scrivi</em>';
  el.querySelector('.qz-an-lens').innerHTML = [3, 4, 5, 6, 7].filter((n) => byLen[n]).map((n) => `<span class="${fl[n] === byLen[n] ? 'full' : ''}">${n} lettere <b>${fl[n] || 0}/${byLen[n]}</b></span>`).join('');
  el.querySelector('.qz-an-found').innerHTML = G.found.slice().reverse().map((w) => `<span class="l${w.length}">${w.toUpperCase()}</span>`).join('') || '<em>Nessuna parola ancora</em>';
  root.querySelector('.qz-bar-r').innerHTML = `<span class="qz-num">${G.found.length}/${G.all.length}</span><span class="qz-score"><b>${fmt(G.score)}</b> punti</span>`;
}
function tap(i) {
  if (!G || G.ph !== 'play' || G.pick.includes(i)) return;
  G.pick.push(i); play('tick'); draw();
}
function typeCh(ch) {
  ch = fold(ch); if (!/^[a-z]$/.test(ch)) return;
  const i = G.letters.findIndex((c, k) => c === ch && !G.pick.includes(k));
  if (i >= 0) tap(i); else flash('bad');
}
function back() { if (G?.ph === 'play' && G.pick.length) { G.pick.pop(); draw(); } }
function clear() { if (G?.ph === 'play') { G.pick = []; draw(); } }
function mix() { if (G?.ph !== 'play') return; const w = cur(); G.letters = shuffle(G.letters); G.pick = []; for (const ch of w) { const i = G.letters.findIndex((c, k) => c === ch && !G.pick.includes(k)); if (i >= 0) G.pick.push(i); } play('whoosh'); draw(); }
function flash(kind, text) {
  const c = root.querySelector('.qz-an-cur'); if (!c) return;
  c.classList.remove('good', 'bad', 'same'); void c.offsetWidth; c.classList.add(kind);
  const m = root.querySelector('.qz-an-msg'); if (m && text) { m.textContent = text; m.classList.add('on'); clearTimeout(flash.t); flash.t = setTimeout(() => m.classList.remove('on'), 1300); }
}
function submit() {
  if (!G || G.ph !== 'play') return;
  const w = cur();
  if (w.length < 3) { flash('bad', 'Almeno tre lettere'); play('bad'); return; }
  if (G.found.includes(w)) { flash('same', 'Già trovata'); play('tick'); G.pick = []; draw(); return; }
  if (!A.set.has(w) || !G.all.includes(w)) { flash('bad', 'Non è nel dizionario'); play('bad'); vibrate(40); return; }
  const pts = PTS[w.length] + (w.length === 7 ? 50 : 0);
  G.found.push(w); G.score += pts; G.extra += 2; G.pick = [];
  play(w.length === 7 ? 'win' : 'ok');
  draw(); flash('good', w.length === 7 ? `Parolone! +${pts}` : `+${pts}`);
  if (G.found.length === G.all.length) end();
}
function loop() {
  cancelAnimationFrame(raf);
  const tick = () => {
    if (!G || G.ph !== 'play' || !root?.isConnected) return;
    if (document.querySelector('.modal-wrap')) { if (!G.pauseAt) G.pauseAt = performance.now(); raf = requestAnimationFrame(tick); return; }
    if (G.pauseAt) { G.paused += performance.now() - G.pauseAt; G.pauseAt = 0; }
    const l = left(), t = root.querySelector('.qz-timer');
    if (t) { t.querySelector('i').style.transform = `scaleX(${Math.min(1, l / TIME)})`; t.classList.toggle('low', l < 10); const b = t.querySelector('b'); const s = String(Math.ceil(l)); if (b.textContent !== s) { b.textContent = s; if (l < 6 && l > 0) play('tick'); } }
    if (l <= 0) { end(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function end() {
  if (!G || G.ph === 'end') return;
  G.ph = 'end'; cancelAnimationFrame(raf);
  const d = qzLoad(), a = d.ana;
  a.played++; a.words += G.found.length; a.best = Math.max(a.best, G.score);
  if (G.found.some((w) => w.length === 7)) a.pangrams++;
  const coins = Math.floor(G.score / 25) + (G.daily ? 5 : 0);
  d.coins += coins;
  if (G.daily) a.day = { key: dateKey(), score: G.score, found: G.found.length, total: G.all.length };
  qzSave(d);
  play('notify');
  const missed = G.all.filter((w) => !G.found.includes(w));
  const el = root.querySelector('.qz-an-play');
  el.innerHTML = `<div class="qz-end"><div class="qz-end-h"><small>Anagrammi${G.daily ? ` · sfida del giorno n° ${dayNumber()}` : ''}</small><h2>${G.found.length >= G.all.length * 0.6 ? 'Vocabolario d’oro!' : G.found.length >= 8 ? 'Ottimo lavoro!' : 'Tempo scaduto!'}</h2>
    <div class="qz-end-score"><b>${fmt(G.score)}</b><span>punti</span></div>
    <div class="qz-end-row"><span>📝 ${G.found.length}/${G.all.length} parole</span><span>Parolone: <b>${G.all.filter((w) => w.length === 7).map((w) => w.toUpperCase()).join(', ') || '—'}</b></span><span class="qz-gain"><span class="qz-coin"></span> +${coins}</span></div></div>
    <div class="qz-end-btns"><button class="btn primary" data-a="qz" data-do="again">Nuove lettere</button>${G.daily ? '' : '<button class="btn" data-a="qz" data-do="daily">Sfida del giorno</button>'}<button class="btn" data-a="qz" data-do="exit">Menu</button></div>
    <h3>Trovate</h3><div class="qz-an-found">${G.found.map((w) => `<span class="l${w.length}">${w.toUpperCase()}</span>`).join('') || '<em>Nessuna</em>'}</div>
    <h3>Ti sono sfuggite <small>(${missed.length})</small></h3><div class="qz-an-found miss">${missed.slice(0, 80).map((w) => `<span class="l${w.length}">${w.toUpperCase()}</span>`).join('')}${missed.length > 80 ? `<em>…e altre ${missed.length - 80}</em>` : ''}</div></div>`;
  coinBurst(root, coins); updateWallet(root);
  requestAnimationFrame(() => el.querySelector('.btn.primary')?.focus({ preventScroll: true }));
}
function playHtml() {
  return `<div class="qz-timer"><i></i><b>${TIME}</b></div>
    <div class="qz-an-msg" role="status" aria-live="polite"></div>
    <div class="qz-an-cur"></div>
    <div class="qz-an-tiles"></div>
    <div class="qz-an-btns"><button class="btn sm" data-a="qz" data-do="back">⌫ Cancella</button><button class="btn sm" data-a="qz" data-do="mix">↻ Mescola <kbd>Spazio</kbd></button><button class="btn sm primary" data-a="qz" data-do="send">Invia <kbd>Invio</kbd></button></div>
    <div class="qz-an-lens"></div>
    <div class="qz-an-found"></div>`;
}
async function begin(daily) {
  newRound(daily);
  const el = root.querySelector('.qz-an-play');
  const dd = qzLoad().ana.day;
  if (daily && dd?.key === dateKey()) {
    el.innerHTML = `<div class="qz-ready"><b>Sfida del giorno già giocata</b><span>${fmt(dd.score)} punti · ${dd.found}/${dd.total} parole. Torna domani!</span><button class="btn primary" data-a="qz" data-do="again">Gioca lettere nuove</button></div>`;
    G = null; return;
  }
  el.innerHTML = playHtml(); draw();
  await countdown(root);
  if (!G || !root?.isConnected) return;
  G.ph = 'play'; G.t0 = performance.now(); draw(); loop();
  requestAnimationFrame(() => root.querySelector('.qz-an-tile')?.focus({ preventScroll: true }));
}

export default {
  render(params) {
    return `<div class="qz-play qz-an" data-daily="${params.daily ? 1 : 0}">${bar(params.daily ? `Anagrammi · sfida del giorno n° ${dayNumber()}` : 'Anagrammi a tempo')}
      <div class="qz-an-play"><div class="qz-ready"><b>Carico il dizionario…</b></div></div></div>`;
  },
  async mount(r, params) {
    root = r;
    A = await loadAnagram();
    if (!root?.isConnected) return;
    const el = root.querySelector('.qz-an-play');
    if (!params.go) {
      const a = qzLoad().ana, dd = a.day?.key === dateKey();
      el.innerHTML = `<div class="qz-an-intro"><h2>Sette lettere, novanta secondi</h2><p>Componi parole italiane di 3-7 lettere usando le lettere date (ognuna una volta sola). Ogni parola vale punti e regala 2 secondi; con tutte e sette fai il <b>parolone</b>.</p>
        <div class="qz-an-pts">${Object.entries(PTS).map(([n, p]) => `<span><b>${n}</b> lettere · ${p}</span>`).join('')}<span><b>7</b> lettere · +50 bonus</span></div>
        <div class="qz-end-btns"><button class="btn primary big" data-a="qz" data-do="start">Gioca</button><button class="btn big" data-a="qz" data-do="daily" ${dd ? 'disabled' : ''}>${dd ? `Sfida del giorno: ${fmt(a.day.score)} punti` : 'Sfida del giorno'}</button></div>
        <p class="qz-note">Record ${fmt(a.best)} punti · ${fmt(a.words)} parole trovate in ${a.played} partite. Tastiera: lettere, <kbd>Invio</kbd>, <kbd>⌫</kbd>, <kbd>Spazio</kbd> mescola.</p></div>`;
      requestAnimationFrame(() => el.querySelector('.btn.primary')?.focus({ preventScroll: true }));
      return;
    }
    begin(!!params.daily);
  },
  unmount() { cancelAnimationFrame(raf); G = null; },
  onKey(e, ctx) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); this.act('exit', null, ctx); return; }
    if (!G || G.ph !== 'play') return;
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
    if (e.key === ' ') { e.preventDefault(); mix(); return; }
    if (e.key === 'Delete') { e.preventDefault(); clear(); return; }
    if (e.key.length === 1 && /\p{L}/u.test(e.key)) { e.preventDefault(); typeCh(e.key); }
  },
  act(n, el, ctx) {
    if (n === 'exit') {
      if (G?.ph === 'play') { ctx.App.confirm('Interrompere il round?', 'Le parole trovate finora non verranno contate.', () => { cancelAnimationFrame(raf); G = null; ctx.back(); }, 'Esci', true); return; }
      G = null; ctx.back(); return;
    }
    if (n === 'start' || n === 'again') { ctx.go('anagrammi', { go: 1 }, { replace: true }); return; }
    if (n === 'daily') { ctx.go('anagrammi', { go: 1, daily: 1 }, { replace: true }); return; }
    if (n === 'tile') tap(+el.dataset.i);
    else if (n === 'back') back();
    else if (n === 'mix') mix();
    else if (n === 'send') submit();
  },
  get state() { return G && { ph: G.ph, seed: G.seed, letters: G.letters.join(''), all: G.all.length, found: G.found.slice(), score: G.score }; },
  test: { type: (w) => { for (const ch of w) typeCh(ch); }, submit: () => submit(), words: () => G?.all.slice(), end: () => end(), clear: () => clear() },
};
