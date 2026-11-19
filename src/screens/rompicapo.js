// Rompicapo — the collection's menus (home, one page per puzzle, daily, themes), the live puzzle
// host, pause and results. The puzzles live in src/rompicapo/*-ui.js, their logic in pure modules.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { rpLoad, rpSave } from '../rompicapo/store.js';
import { GAMES, GAME, THEMES, THEME, themeVars, dailyInfo, dailyDesc, DAILY_REWARD, DAILY_ALL_BONUS } from '../rompicapo/meta.js';
import { DIFFS, DIFF } from '../rompicapo/sudoku.js';
import { VARIANTS } from '../rompicapo/merge.js';
import { MODES } from '../rompicapo/blocks.js';
import { LAYOUTS, LAYOUT } from '../rompicapo/mahjong.js';
import { hashStr, fmt, fmtT, fmtMs, dayKey } from '../rompicapo/util.js';
import { setVolume, snd } from '../rompicapo/sound.js';
import '../rompicapo/rompicapo.css';

const G = { view: 'home', from: 'launcher', play: null, game: null, sdDiff: null, mjLayout: null };
const LV = 100; // numbered puzzles per sudoku difficulty / per mahjong layout
const volume = () => { const s = getSettings(); return s.sound === false ? 0 : 0.7 * (s.volume ?? 0.5) / 0.5; };
const starsHtml = (n, max = 3) => `<span class="rp-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
const sdSeed = (diff, n) => (hashStr(`sd:${diff}`) % 100000) * 1000 + n;
const mjSeed = (layout, n) => (hashStr(`mj:${layout}`) % 100000) * 1000 + n;
const nextOf = (solved, prefix) => { let n = 1; while (solved[`${prefix}-${n}`]) n++; return n; };
const todayDaily = (p) => { const info = dailyInfo(); if (p.daily?.key !== info.key) p.daily = { key: info.key, done: {}, bonus: false }; return info; };

// ---------------------------------------------------------------- CSS art for the four puzzles
function art(id, cls = '') {
  if (id === 'sudoku') {
    const v = '5.3.7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
    return `<div class="rp-art a-sudoku ${cls}" aria-hidden="true"><div class="ar-sd">${[...v].map((c, i) => `<i class="${c !== '.' ? 'g' : ''} ${i === 40 ? 's' : ''}">${c === '.' ? (i === 40 ? '5' : '') : c}</i>`).join('')}</div></div>`;
  }
  if (id === 'unisci') return `<div class="rp-art a-unisci ${cls}" aria-hidden="true"><div class="ar-mg">${[2, 4, 8, 0, 16, 32, 0, 4, 64, 128, 2, 0, 256, 512, 1024, 2048].map((v, i) => `<i class="${v ? 'v' : ''}" style="--k:${v ? Math.log2(v) : 0};--d:${i * 0.07}s">${v || ''}</i>`).join('')}</div></div>`;
  if (id === 'mattoncini') {
    const rows = ['..........', '....TT....', '.....T....', '..........', 'I......Z..', 'I.....ZZ..', 'IJ...LZ.OO', 'IJJJ.LLLOO', 'SS.TTTZZ.O', 'SSSTZZLLLL'];
    const col = { I: 0, J: 1, L: 2, O: 3, S: 4, T: 5, Z: 6 };
    return `<div class="rp-art a-blocks ${cls}" aria-hidden="true"><div class="ar-bk">${rows.map((r, y) => [...r].map((c) => `<i class="${c !== '.' ? 'b' : ''} ${y < 3 && c !== '.' ? 'fall' : ''}" style="--c:${c !== '.' ? ['#3fe0f0', '#3a7bff', '#ff9b2e', '#ffd23f', '#3fdc6e', '#b35cff', '#ff4d5e'][col[c]] : 'transparent'}"></i>`).join('')).join('')}</div></div>`;
  }
  const tiles = [['☀', 0, 0, 0], ['💧', 1, 0, 0], ['🍃', 2, 0, 0], ['❀', 0, 1, 0], ['◆', 1, 1, 0], ['☀', 2, 1, 0], ['🍃', 0.5, 0.5, 1], ['❀', 1.5, 0.5, 1], ['◆', 1, 0.5, 2]];
  return `<div class="rp-art a-mahjong ${cls}" aria-hidden="true"><div class="ar-mj">${tiles.map(([s, x, y, z], i) => `<i style="--x:${x};--y:${y};--z:${z};--d:${i * 0.12}s"><b>${s}</b></i>`).join('')}</div></div>`;
}

function wallet(p) { return `<div class="rp-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">Tema «${esc(THEME[p.theme]?.name)}»${p.streak ? ` · serie ${p.streak} ${p.streak === 1 ? 'giorno' : 'giorni'}` : ''}</div></div>`; }
const TABS = [['home', 'home', 'Rompicapo'], ['sudoku', 'board', 'Sudoku'], ['unisci', 'plus', 'Unisci'], ['mattoncini', 'chart', 'Mattoncini'], ['mahjong', 'target', 'Mahjong'], ['daily', 'calendar', 'Del giorno'], ['temi', 'palette', 'Temi']];

function statLine(id, p) {
  if (id === 'sudoku') { const s = p.sudoku; return s.won ? `${s.won} risolti${s.best.esperto ? ` · esperto ${fmtT(s.best.esperto)}` : s.best.medio ? ` · medio ${fmtT(s.best.medio)}` : ''}` : '4 difficoltà, note, aiuti ragionati'; }
  if (id === 'unisci') { const s = p.unisci; return s.played ? `Record ${fmt(s.best[4] || 0)} · tessera max ${fmt(Math.max(0, ...Object.values(s.maxTile)))}` : 'Tavole 4×4, 5×5 e 6×6'; }
  if (id === 'mattoncini') { const s = p.mattoncini; return s.played ? `Maratona ${fmt(s.best.maratona || 0)} · Sprint ${s.best.sprint ? fmtMs(s.best.sprint) : '—'}` : 'Maratona, Sprint 40, Ultra 2 minuti'; }
  const s = p.mahjong; return s.won ? `${s.won} tavoli sgombrati · ${s.pairs} coppie` : `${LAYOUTS.length} disposizioni a strati`;
}
function homeView(p) {
  const info = todayDaily(p), done = p.daily.done, nDone = Object.keys(done).length;
  return `<section class="rp-games">${GAMES.map((g) => `<article class="rp-gcard" style="--gc:${g.color}" data-a="rp-tab" data-v="${g.id}" tabindex="0" aria-label="${esc(g.name)}">
      ${art(g.id)}
      <div class="rp-gc-b"><div class="rp-k">${esc(g.tag)}${info.featured === g.id ? ' · <em>in vetrina oggi</em>' : ''}</div><h2>${esc(g.name)}</h2><p>${esc(g.pitch)}</p><small>${esc(statLine(g.id, p))}</small></div>
      <button class="btn primary" data-a="rp-quick" data-g="${g.id}" aria-label="Gioca subito a ${esc(g.name)}">${icon('play')} Gioca</button>
    </article>`).join('')}</section>
    <section class="rp-dstrip" data-a="rp-tab" data-v="daily" tabindex="0">
      <div>${icon('calendar')}<b>Rompicapo del giorno #${info.num}</b><span>Quattro sfide uguali per tutti, una per gioco. ${nDone}/4 completate oggi${p.streak ? ` · serie di ${p.streak}` : ''}.</span></div>
      <div class="rp-dots">${GAMES.map((g) => `<i class="${done[g.id] ? 'on' : ''}" style="--gc:${g.color}" title="${esc(g.name)}">${done[g.id] ? '✓' : ''}</i>`).join('')}</div>
    </section>
    <p class="rp-note">Monete per ogni partita, temi da sbloccare per tutti i giochi. Niente pubblicità, niente acquisti: si gioca e basta.</p>`;
}
function head(g, p, extra = '') {
  return `<section class="rp-ghero" style="--gc:${GAME[g].color}">${art(g, 'big')}<div class="rp-gh-b"><div class="rp-k">${esc(GAME[g].tag)}</div><h2>${esc(GAME[g].name)}</h2><p>${esc(GAME[g].pitch)}</p>${extra}</div></section>`;
}
const seg = (act, list, cur, label = (x) => x.name, key = (x) => x.id, sub = () => '') => `<div class="rp-seg" role="radiogroup">${list.map((x) => `<button class="${key(x) === cur ? 'on' : ''}" role="radio" aria-checked="${key(x) === cur}" data-a="${act}" data-id="${key(x)}">${label(x)}${sub(x) ? `<small>${sub(x)}</small>` : ''}</button>`).join('')}</div>`;
function statsBox(rows) { return `<div class="rp-stats">${rows.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>`; }
function dailyBtn(g, p) {
  const info = todayDaily(p), d = p.daily.done[g];
  return `<div class="rp-dcard" style="--gc:${GAME[g].color}">${icon('calendar')}<div><b>Sfida del giorno</b><span>${esc(dailyDesc(g, info))}${d ? ' · <em>fatta!</em>' : ` · +${DAILY_REWARD * (info.featured === g ? 2 : 1)} monete`}</span></div><button class="btn" data-a="rp-daily" data-g="${g}">${icon(d ? 'replay' : 'play')} ${d ? 'Rigioca' : 'Gioca'}</button></div>`;
}

function sudokuView(p) {
  const s = p.sudoku, diff = G.sdDiff || s.lastDiff || 'facile', D = DIFF[diff], n = nextOf(s.solved, diff);
  const save = s.save && !(s.save.kind === 'daily' && s.save.key !== dayKey()) ? s.save : null;
  const tiles = []; for (let k = 1; k <= LV; k++) { const st = s.solved[`${diff}-${k}`] || 0, open = k <= n; tiles.push(`<button class="rp-lv ${st ? 'done' : ''} ${open ? '' : 'locked'} ${k === n ? 'next' : ''}" data-a="rp-sd-lv" data-n="${k}" ${open ? '' : 'aria-disabled="true"'} aria-label="Sudoku ${D.name} ${k}">${k}${st ? `<i>${'★'.repeat(st)}</i>` : ''}</button>`); }
  return `${head('sudoku', p, `<div class="rp-btns">${save ? `<button class="btn primary big" data-a="rp-sd-resume">${icon('play')} Continua</button>` : ''}<button class="btn ${save ? '' : 'primary big'}" data-a="rp-sd-lv" data-n="${n}">${icon(save ? 'plus' : 'play')} ${D.name} n. ${n}</button></div>${save ? `<p class="rp-note">In corso: ${esc(DIFF[save.diff]?.name || '')}${save.kind === 'daily' ? ' del giorno' : save.n ? ` n. ${save.n}` : ''} · ${fmtT(save.time)} · ${save.v.split('').filter((c) => c !== '0').length}/81 cifre</p>` : ''}`)}
    <h3 class="rp-h">Difficoltà</h3>
    ${seg('rp-sd-diff', DIFFS, diff, (x) => `<span class="dot" style="--c:${x.color}"></span>${x.name}`, (x) => x.id, (x) => `${Object.keys(s.solved).filter((k) => k.startsWith(x.id + '-')).length} risolti${s.best[x.id] ? ` · ${fmtT(s.best[x.id])}` : ''}`)}
    <p class="rp-note">${esc({ facile: 'Bastano i singoli: in ogni casella o riquadro un solo posto possibile.', medio: 'Meno numeri dati, sempre risolvibile coi singoli: serve più occhio.', difficile: 'Servono candidati bloccati e coppie: le note diventano preziose.', esperto: 'Triple, X-Wing, Y-Wing e Swordfish: per chi ama i rompicapo veri.' }[diff])} Ogni sudoku ha una sola soluzione, verificata.</p>
    <h3 class="rp-h">Opzioni</h3>
    <div class="rp-opts">${[['limit', 'Limite di 3 errori'], ['auto', 'Togli le note in automatico'], ['hl', 'Evidenzia righe e cifre uguali']].map(([k, l]) => `<button class="rp-opt ${s.opts[k] ? 'on' : ''}" data-a="rp-sd-opt" data-k="${k}" aria-pressed="${!!s.opts[k]}"><i></i>${l}</button>`).join('')}</div>
    ${dailyBtn('sudoku', p)}
    <h3 class="rp-h">Livelli · ${esc(D.name)}</h3><div class="rp-lvs">${tiles.join('')}</div>
    <h3 class="rp-h">Statistiche</h3>${statsBox([['partite', s.played], ['risolti', s.won], ['aiuti usati', s.hints], ['errori', s.mistakes], ...DIFFS.map((x) => [`record ${x.name.toLowerCase()}`, s.best[x.id] ? fmtT(s.best[x.id]) : '—'])])}
    ${how([['board', 'Tocca e scrivi', 'Scegli una casella e poi la cifra. Le cifre già usate 9 volte si spengono.'], ['bulb', 'Aiuto ragionato', 'L’aiuto ti dice la tecnica (singolo nascosto, coppia…) e scrive la cifra. Se hai sbagliato, ti segna l’errore.'], ['keyboard', 'Tastiera', '<span class="kbd">←↑↓→</span> muovi · <span class="kbd">1-9</span> scrivi · <span class="kbd">N</span> note · <span class="kbd">Z</span> annulla · <span class="kbd">H</span> aiuto'], ['gamepad', 'Controller', 'Croce muovi · A scrivi · LB/RB cambia cifra · X note · Y aiuto · B cancella']])}`;
}
function unisciView(p) {
  const s = p.unisci, size = s.size || 4, V = VARIANTS.find((v) => v.id === size), save = s.save?.[size];
  return `${head('unisci', p, `<div class="rp-btns">${save ? `<button class="btn primary big" data-a="rp-mg" data-resume="1">${icon('play')} Continua</button>` : ''}<button class="btn ${save ? '' : 'primary big'}" data-a="rp-mg">${icon(save ? 'plus' : 'play')} Nuova partita ${V.name}</button></div>${save ? `<p class="rp-note">In corso: ${fmt(save.b.score)} punti · tessera ${fmt(save.b.max)}</p>` : ''}`)}
    <h3 class="rp-h">Tavola</h3>${seg('rp-mg-size', VARIANTS, size, (x) => x.name, (x) => x.id, (x) => `record ${fmt(s.best[x.id] || 0)}`)}
    <p class="rp-note">${esc(V.desc)} Una mossa si può sempre annullare.</p>
    ${dailyBtn('unisci', p)}
    <h3 class="rp-h">Statistiche</h3>${statsBox([['partite', s.played], ['mosse totali', fmt(s.moves)], ...VARIANTS.map((v) => [`record ${v.name}`, fmt(s.best[v.id] || 0)]), ...VARIANTS.map((v) => [`tessera max ${v.name}`, fmt(s.maxTile[v.id] || 0)])])}
    ${how([['swap', 'Scorri', 'Tutte le tessere scivolano nella direzione scelta: due uguali che si scontrano diventano una sola, doppia.'], ['star', 'Punti', 'Ogni unione vale il nuovo numero. Tieni la tessera più alta in un angolo.'], ['replay', 'Annulla', 'Hai sempre un passo indietro: usalo bene.'], ['keyboard', 'Comandi', '<span class="kbd">←↑↓→</span> o <span class="kbd">WASD</span> · <span class="kbd">Z</span> annulla · scorri col dito · croce del controller']])}`;
}
function blocksView(p) {
  const s = p.mattoncini, mode = s.mode || 'maratona';
  return `${head('mattoncini', p, `<div class="rp-btns"><button class="btn primary big" data-a="rp-bk">${icon('play')} Gioca · ${esc(MODES[mode].name)}</button></div>`)}
    <h3 class="rp-h">Modalità</h3>${seg('rp-bk-mode', Object.values(MODES), mode, (x) => x.name, (x) => x.id, (x) => (x.id === 'sprint' ? (s.best.sprint ? fmtMs(s.best.sprint) : '—') : fmt(s.best[x.id] || 0)))}
    <p class="rp-note">${esc(MODES[mode].desc)}</p>
    ${mode === 'maratona' || mode === 'zen' ? `<h3 class="rp-h">Livello di partenza</h3>${seg('rp-bk-level', [1, 3, 5, 8, 10], s.level || 1, (x) => `Livello ${x}`, (x) => x)}` : ''}
    ${dailyBtn('mattoncini', p)}
    <h3 class="rp-h">Statistiche</h3>${statsBox([['partite', s.played], ['linee', fmt(s.lines)], ['quadruple', s.quad], ['T-spin', s.tspin], ['record maratona', fmt(s.best.maratona || 0)], ['record sprint', s.best.sprint ? fmtMs(s.best.sprint) : '—'], ['record ultra', fmt(s.best.ultra || 0)], ['record infinita', fmt(s.best.zen || 0)]])}
    ${how([['keyboard', 'Tastiera', '<span class="kbd">←→</span> muovi · <span class="kbd">↓</span> giù · <span class="kbd">Spazio</span> caduta · <span class="kbd">↑</span>/<span class="kbd">X</span> ruota · <span class="kbd">Z</span> ruota indietro · <span class="kbd">C</span> tieni'], ['steering', 'Tocco', 'Trascina per spostare, tocca per ruotare, scatto verso il basso per la caduta, verso l’alto per tenere. Oppure i tasti sullo schermo.'], ['gamepad', 'Controller', 'Croce muovi (su = caduta) · A/B ruota · X/LB tieni · Start pausa'], ['star', 'Punti', 'Quadruple, T-spin e combo consecutive valgono molto di più. Ogni 10 linee si sale di livello.']])}`;
}
function mahjongView(p) {
  const s = p.mahjong, lay = G.mjLayout || s.layout || 'quadrato', L = LAYOUT[lay], n = nextOf(s.solved, lay);
  const save = s.save && !(s.save.kind === 'daily' && s.save.key !== dayKey()) ? s.save : null;
  const tiles = []; for (let k = 1; k <= 60; k++) { const st = s.solved[`${lay}-${k}`] || 0, open = k <= n; tiles.push(`<button class="rp-lv ${st ? 'done' : ''} ${open ? '' : 'locked'} ${k === n ? 'next' : ''}" data-a="rp-mj-lv" data-n="${k}" ${open ? '' : 'aria-disabled="true"'} aria-label="${esc(L.name)} ${k}">${k}${st ? `<i>${'★'.repeat(st)}</i>` : ''}</button>`); }
  return `${head('mahjong', p, `<div class="rp-btns">${save ? `<button class="btn primary big" data-a="rp-mj-resume">${icon('play')} Continua</button>` : ''}<button class="btn ${save ? '' : 'primary big'}" data-a="rp-mj-lv" data-n="${n}">${icon(save ? 'plus' : 'play')} ${esc(L.name)} n. ${n}</button></div>${save ? `<p class="rp-note">In corso: ${esc(LAYOUT[save.layout]?.name || '')} · ${save.present.filter(Boolean).length} tessere rimaste · ${fmtT(save.time)}</p>` : ''}`)}
    <h3 class="rp-h">Disposizione</h3>${seg('rp-mj-layout', LAYOUTS, lay, (x) => x.name, (x) => x.id, (x) => `${x.n} tessere${s.best[x.id] ? ` · ${fmtT(s.best[x.id])}` : ''}`)}
    <p class="rp-note">${esc(L.desc)} Ogni smazzata è costruita giocando la partita al contrario: una soluzione c’è sempre.</p>
    ${dailyBtn('mahjong', p)}
    <h3 class="rp-h">Livelli · ${esc(L.name)}</h3><div class="rp-lvs">${tiles.join('')}</div>
    <h3 class="rp-h">Statistiche</h3>${statsBox([['partite', s.played], ['vinte', s.won], ['coppie', fmt(s.pairs)], ...LAYOUTS.map((x) => [`record ${x.name.toLowerCase()}`, s.best[x.id] ? fmtT(s.best[x.id]) : '—'])])}
    ${how([['target', 'Tessere libere', 'Una tessera è libera se non ha niente sopra e ha libero il lato sinistro o destro. Le tessere bloccate sono più scure.'], ['bulb', 'Aiuto', 'L’aiuto indica una coppia che lascia la partita risolvibile.'], ['swap', 'Mescola', 'Senza coppie libere, mescola: le tessere rimaste vengono ridistribuite con una soluzione garantita.'], ['keyboard', 'Comandi', '<span class="kbd">←↑↓→</span> scegli · <span class="kbd">Invio</span> prendi · <span class="kbd">H</span> aiuto · <span class="kbd">Z</span> annulla · <span class="kbd">M</span> mescola']])}`;
}
function how(list) { return `<section class="rp-how"><h3 class="rp-h">Come si gioca</h3><div class="rp-how-g">${list.map(([ic, b, t]) => `<div>${icon(ic)}<b>${b}</b><span>${t}</span></div>`).join('')}</div></section>`; }
function dailyResult(g, d) {
  if (!d) return '';
  if (g === 'sudoku') return `${fmtT(d.time)} · ${d.mistakes} errori · ${d.hints} aiuti`;
  if (g === 'unisci') return `${d.moves} mosse · ${fmt(d.score)} punti`;
  if (g === 'mattoncini') return `${fmt(d.score)} punti · ${d.lines} linee`;
  return `${fmtT(d.time)} · ${d.hints} aiuti · ${d.shuffles} mescolate`;
}
function shareText(p, info) {
  const d = p.daily.done;
  return [`Rompicapo del giorno #${info.num} 🧩 ${Object.keys(d).length}/4`, ...GAMES.map((g) => `${d[g.id] ? '✅' : '⬜'} ${g.name}${d[g.id] ? ': ' + dailyResult(g.id, d[g.id]) : ''}`), p.streak > 1 ? `🔥 serie di ${p.streak} giorni` : ''].filter(Boolean).join('\n');
}
function dailyView(p) {
  const info = todayDaily(p), d = p.daily.done, dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const all = Object.keys(d).length === 4;
  return `<section class="rp-daily"><div class="rp-k">${icon('calendar')} ${esc(dt)}</div><h2>Rompicapo del giorno #${info.num}</h2>
    <p>Quattro sfide, le stesse per tutti: una per gioco. Ognuna vale <b>${DAILY_REWARD}</b> monete la prima volta, il doppio per il gioco in vetrina; tutte e quattro danno un bonus di <b>${DAILY_ALL_BONUS}</b>.</p>
    <div class="rp-streak">${icon('flame')} Serie: <b>${p.streak || 0}</b> giorni · migliore ${p.bestStreak || 0} · ${p.dailies || 0} sfide completate</div></section>
    <div class="rp-dlist">${GAMES.map((g) => `<article class="rp-ditem ${d[g.id] ? 'done' : ''} ${info.featured === g.id ? 'feat' : ''}" style="--gc:${g.color}">${art(g.id, 'mini')}<div><div class="rp-k">${esc(g.name)}${info.featured === g.id ? ' · <em>in vetrina: monete ×2</em>' : ''}</div><b>${esc(dailyDesc(g.id, info))}</b><span>${d[g.id] ? `Fatta: ${esc(dailyResult(g.id, d[g.id]))}` : 'Da giocare'}</span></div>
      <button class="btn ${d[g.id] ? '' : 'primary'}" data-a="rp-daily" data-g="${g.id}">${icon(d[g.id] ? 'replay' : 'play')} ${d[g.id] ? 'Rigioca' : 'Gioca'}</button></article>`).join('')}</div>
    ${Object.keys(d).length ? `<pre class="rp-share" id="rp-share">${esc(shareText(p, info))}</pre><div class="rp-btns"><button class="btn" data-a="rp-share">${icon('upload')} Copia i risultati</button>${all ? '<span class="rp-note">Tutte e quattro: complimenti!</span>' : ''}</div>` : ''}`;
}
function themesView(p) {
  return `<p class="rp-note">I temi cambiano i colori di tutti e quattro i rompicapo: griglie, tessere, mattoncini e tavolo. Si sbloccano con le monete guadagnate giocando.</p>
    <div class="rp-themes">${THEMES.map((t) => { const own = p.owned.includes(t.id), on = p.theme === t.id; return `<button class="rp-theme ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-a="rp-theme" data-id="${t.id}" style="${themeVars(t.id)}" aria-label="Tema ${esc(t.name)}">
      <div class="th-prev"><div class="th-sd">${[5, 0, 3, 0, 7, 0, 6, 0, 1].map((v, i) => `<i class="${i === 4 ? 's' : ''}">${v || ''}</i>`).join('')}</div><div class="th-mg">${t.tiles.slice(0, 8).map((c, i) => `<i style="background:${c}">${2 ** (i + 1)}</i>`).join('')}</div><div class="th-bk">${t.blocks.map((c) => `<i style="background:${c}"></i>`).join('')}</div></div>
      <b>${esc(t.name)}</b><small>${on ? 'In uso' : own ? 'Usa' : `${icon('coin')} ${t.cost}`}</small></button>`; }).join('')}</div>`;
}

function menu(p) {
  const views = { home: homeView, sudoku: sudokuView, unisci: unisciView, mattoncini: blocksView, mahjong: mahjongView, daily: dailyView, temi: themesView };
  const g = GAME[G.view];
  return `<div class="full-screen rp-menu" style="${themeVars(p.theme)};--gc:${g?.color || '#4cc3ff'}">
    ${pageHead({ back: G.from, eyebrow: `Baso Hub · Puzzle${g ? ' · Rompicapo' : ''}`, title: g ? esc(g.name) : 'Rompicapo', sub: g ? esc(g.pitch) : 'Sudoku, Unisci, Mattoncini e Mahjong: quattro rompicapo veloci, con sfide del giorno, statistiche e temi.', right: wallet(p) })}
    <nav class="rp-tabs" role="tablist">${TABS.map(([id, ic, name]) => `<button role="tab" aria-selected="${G.view === id}" class="${G.view === id ? 'on' : ''}" data-a="rp-tab" data-v="${id}" style="--gc:${GAME[id]?.color || 'var(--rp-acc)'}">${icon(ic)}<span>${name}</span></button>`).join('')}</nav>
    <div class="rp-body">${(views[G.view] || homeView)(p)}</div>
  </div>`;
}

// ---------------------------------------------------------------- playing
function stopGame() { G.game?.destroy(); G.game = null; }
function startPlay(play) { stopGame(); G.play = play; App.refresh(); }
function playParams(P, p) {
  const info = dailyInfo();
  if (P.game === 'sudoku') {
    if (P.kind === 'daily') return { diff: info.sudoku.diff, seed: info.sudoku.seed, kind: 'daily', key: info.key, title: `Sudoku del giorno #${info.num}`, sub: DIFF[info.sudoku.diff].name, resume: P.resume, ...p.sudoku.opts, limit: P.resume ? true : p.sudoku.opts.limit };
    return { diff: P.diff, seed: sdSeed(P.diff, P.n), n: P.n, kind: 'level', sub: `Puzzle n. ${P.n}`, resume: P.resume, ...p.sudoku.opts };
  }
  if (P.game === 'unisci') {
    if (P.kind === 'daily') return { size: 4, seed: info.unisci.seed, goal: info.unisci.goal, kind: 'daily', title: `Unisci del giorno #${info.num}`, sub: `Arriva al ${info.unisci.goal}` };
    return { size: P.size, seed: (Math.random() * 2 ** 31) | 0, kind: 'free', best: p.unisci.best[P.size] || 0, resume: P.resume };
  }
  if (P.game === 'mattoncini') {
    if (P.kind === 'daily') return { mode: 'ultra', seed: info.mattoncini.seed, kind: 'daily', title: `Mattoncini del giorno #${info.num}`, sub: 'Ultra 2 minuti · stessi pezzi per tutti' };
    return { mode: P.mode, level: P.level, kind: 'free', best: p.mattoncini.best[P.mode] || 0 };
  }
  if (P.kind === 'daily') return { layout: info.mahjong.layout, seed: info.mahjong.seed, kind: 'daily', key: info.key, title: `Mahjong del giorno #${info.num}`, sub: LAYOUT[info.mahjong.layout].name, resume: P.resume };
  return { layout: P.layout, seed: mjSeed(P.layout, P.n), n: P.n, kind: 'level', sub: `${LAYOUT[P.layout].name} n. ${P.n}`, resume: P.resume };
}
function overlay(html) { const ov = document.getElementById('rp-over'); if (!ov) return; ov.innerHTML = html; if (html) requestAnimationFrame(() => (ov.querySelector('.btn.primary') || ov.querySelector('.btn'))?.focus({ preventScroll: true })); }
const TIPS = {
  sudoku: 'Cerca prima i singoli nascosti: in un riquadro, dove può andare il 7?',
  unisci: 'Tieni la tessera più grande in un angolo e non muoverla da lì.',
  mattoncini: 'Lascia una colonna libera sul bordo e aspetta il pezzo lungo per la quadrupla.',
  mahjong: 'Libera prima le tessere che ne bloccano tante e le pile alte.',
};
function onPause(on, why) {
  const P = G.play; if (!P) return;
  if (!on) { overlay(''); return; }
  if (why === 'limit') {
    overlay(`<div class="rp-pause" role="dialog" aria-label="Troppi errori"><h2>Tre errori</h2><p class="rp-note">Hai raggiunto il limite. Puoi continuare senza limite (al massimo una stella) o ricominciare.</p>
      <button class="btn primary" data-a="rp-nolimit">${icon('play')} Continua senza limite</button><button class="btn" data-a="rp-again">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="rp-quit">${icon('left')} Esci</button></div>`);
    return;
  }
  overlay(`<div class="rp-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p class="rp-note">${esc(TIPS[P.game])}</p>
    <button class="btn primary" data-a="rp-resume">${icon('play')} Riprendi</button><button class="btn" data-a="rp-again">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="rp-quit">${icon('left')} ${P.game === 'sudoku' || P.game === 'unisci' || P.game === 'mahjong' ? 'Salva ed esci' : 'Esci'}</button></div>`);
}
function onSave(state) {
  const P = G.play; if (!P) return;
  const p = rpLoad();
  if (P.game === 'sudoku') p.sudoku.save = state;
  else if (P.game === 'unisci') { if (state) p.unisci.save[state.size] = state; else delete p.unisci.save[P.size]; }
  else if (P.game === 'mahjong') p.mahjong.save = state;
  rpSave(p);
}
// daily completion bookkeeping, returns coins earned
function dailyDone(p, g, res) {
  const info = todayDaily(p);
  if (p.daily.done[g]) return { coins: 0, first: false };
  p.daily.done[g] = res;
  let coins = DAILY_REWARD * (info.featured === g ? 2 : 1);
  if (Object.keys(p.daily.done).length === 1) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    p.streak = p.lastDaily === dayKey(y) ? (p.streak || 0) + 1 : p.lastDaily === info.key ? p.streak : 1;
    p.lastDaily = info.key; p.bestStreak = Math.max(p.bestStreak || 0, p.streak);
    coins += Math.min(40, (p.streak - 1) * 5);
  }
  p.dailies = (p.dailies || 0) + 1;
  if (Object.keys(p.daily.done).length === 4 && !p.daily.bonus) { p.daily.bonus = true; coins += DAILY_ALL_BONUS; }
  return { coins, first: true };
}
function onEnd(r) {
  const P = G.play; if (!P) return;
  const p = rpLoad(), x = { coins: 0, rows: [], title: '', sub: '', stars: null, record: false, fail: false };
  const daily = P.kind === 'daily';
  if (P.game === 'sudoku') {
    const s = p.sudoku, D = DIFF[G.game.diff.id]; s.played++; s.hints += r.hints; s.mistakes += r.mistakes;
    s.won++; s.save = null;
    x.coins = Math.round(D.reward * [0, 0.4, 0.7, 1][r.stars]);
    if (!r.limitHit && (!s.best[D.id] || r.time < s.best[D.id])) { x.record = !!s.best[D.id]; s.best[D.id] = Math.round(r.time); }
    if (P.kind === 'level') { const k = `${D.id}-${P.n}`; s.solved[k] = Math.max(s.solved[k] || 0, r.stars); s.lastDiff = D.id; }
    x.title = 'Sudoku risolto!'; x.stars = r.stars; x.sub = `${D.name}${P.kind === 'level' ? ` · n. ${P.n}` : ' · del giorno'}`;
    x.rows = [[fmtT(r.time), 'tempo'], [r.mistakes, 'errori'], [r.hints, 'aiuti']];
    if (daily) Object.assign(x, { daily: dailyDone(p, 'sudoku', { time: Math.round(r.time), mistakes: r.mistakes, hints: r.hints }) });
  } else if (P.game === 'unisci') {
    const s = p.unisci, n = r.size; s.played++; s.moves += r.moves;
    if (!daily) { x.record = r.score > (s.best[n] || 0) && (s.best[n] || 0) > 0; s.best[n] = Math.max(s.best[n] || 0, r.score); s.maxTile[n] = Math.max(s.maxTile[n] || 0, r.max); delete s.save[n]; }
    x.coins = Math.min(250, Math.floor(r.score / 200)) + (r.reached && !daily ? 40 : 0);
    x.title = daily ? (r.win ? `Hai fatto ${fmt(r.goal)}!` : 'Niente più mosse') : r.reached ? 'Che partita!' : 'Niente più mosse'; x.fail = daily && !r.win;
    x.sub = daily ? `Unisci del giorno · obiettivo ${fmt(r.goal)}` : `Unisci ${n}×${n}`;
    x.rows = [[fmt(r.score), 'punti'], [fmt(r.max), 'tessera max'], [r.moves, 'mosse']];
    if (daily && r.win) Object.assign(x, { daily: dailyDone(p, 'unisci', { moves: r.moves, score: r.score }) });
  } else if (P.game === 'mattoncini') {
    const s = p.mattoncini; s.played++; s.lines += r.lines; s.quad += r.quad; s.tspin += r.tspin;
    const m = r.mode;
    if (!daily) {
      if (m === 'sprint') { if (r.won && (!s.best.sprint || r.time < s.best.sprint)) { x.record = !!s.best.sprint; s.best.sprint = Math.round(r.time); } }
      else if (r.score > (s.best[m] || 0)) { x.record = (s.best[m] || 0) > 0; s.best[m] = r.score; }
    }
    x.coins = Math.min(300, Math.floor(r.lines * 1.2) + r.quad * 4 + r.tspin * 3 + (m === 'sprint' && r.won ? 25 : 0) + (m === 'maratona' && r.won ? 100 : 0));
    x.title = m === 'sprint' ? (r.won ? '40 linee!' : 'Pila troppo alta') : m === 'ultra' ? 'Tempo scaduto!' : r.won ? 'Maratona completata!' : 'Fine partita'; x.fail = m === 'sprint' && !r.won;
    x.sub = daily ? 'Mattoncini del giorno · Ultra 2 minuti' : `Mattoncini · ${MODES[m].name}`;
    x.rows = m === 'sprint' ? [[fmtMs(r.time), 'tempo'], [r.lines, 'linee'], [r.pieces, 'pezzi']] : [[fmt(r.score), 'punti'], [r.lines, 'linee'], [r.level, 'livello']];
    if (r.quad || r.tspin) x.rows.push([`${r.quad}/${r.tspin}`, 'quadruple / T-spin']);
    if (daily) Object.assign(x, { daily: dailyDone(p, 'mattoncini', { score: r.score, lines: r.lines }) });
  } else {
    const s = p.mahjong; s.played++; s.won++; s.pairs += r.tiles / 2; s.save = null;
    x.coins = Math.round((r.tiles / 3) * [0, 0.5, 0.75, 1][r.stars]);
    if (!s.best[r.layout] || r.time < s.best[r.layout]) { x.record = !!s.best[r.layout]; s.best[r.layout] = Math.round(r.time); }
    if (P.kind === 'level') { const k = `${r.layout}-${P.n}`; s.solved[k] = Math.max(s.solved[k] || 0, r.stars); s.layout = r.layout; }
    x.title = 'Tavolo sgombrato!'; x.stars = r.stars; x.sub = `${LAYOUT[r.layout].name}${P.kind === 'level' ? ` · n. ${P.n}` : ' · del giorno'}`;
    x.rows = [[fmtT(r.time), 'tempo'], [r.hints, 'aiuti'], [r.shuffles, 'mescolate']];
    if (daily) Object.assign(x, { daily: dailyDone(p, 'mahjong', { time: Math.round(r.time), hints: r.hints, shuffles: r.shuffles }) });
  }
  if (x.daily) x.coins += x.daily.coins;
  p.coins += x.coins; p.earned = (p.earned || 0) + x.coins;
  rpSave(p);
  if (daily) x.share = shareText(p, dailyInfo());
  showResults(x);
}
function showResults(x) {
  const P = G.play;
  const next = P.kind === 'level' ? `<button class="btn primary" data-a="rp-next">${icon('play')} Prossimo</button>` : P.kind === 'free' ? `<button class="btn primary" data-a="rp-again">${icon('replay')} Ancora</button>` : '';
  overlay(`<div class="rp-res" role="dialog" aria-label="Risultati"><div class="rp-res-card ${x.fail ? 'fail' : ''}">
    <div class="rp-k">${esc(x.sub)}</div><h2>${esc(x.title)}</h2>
    ${x.stars != null ? `<div class="rp-res-stars">${[1, 2, 3].map((i) => `<i class="${i <= x.stars ? 'on' : ''}" style="--d:${i * 0.18}s">★</i>`).join('')}</div>` : ''}
    <div class="rp-res-stats">${x.rows.map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}${x.coins ? `<div class="gold"><b>+${x.coins}</b><span>monete</span></div>` : ''}</div>
    ${x.record ? '<p class="rp-note"><b>Nuovo record!</b></p>' : ''}${x.daily?.first ? '<p class="rp-note">Sfida del giorno completata.</p>' : x.daily ? '<p class="rp-note">Sfida del giorno già fatta: questa era un allenamento.</p>' : ''}
    ${x.share ? `<pre class="rp-share" id="rp-share">${esc(x.share)}</pre>` : ''}
    <div class="rp-btns">${next}${x.share ? `<button class="btn ${next ? '' : 'primary'}" data-a="rp-share">${icon('upload')} Copia</button>` : ''}
      ${P.kind !== 'free' ? `<button class="btn ${next || x.share ? '' : 'primary'}" data-a="rp-again">${icon('replay')} Rigioca</button>` : ''}
      <button class="btn ghost" data-a="rp-quit">${icon('left')} Menu</button><button class="btn ghost" data-a="rp-hall">${icon('gamepad')} Baso Hub</button></div>
  </div></div>`);
  try { (x.fail ? sfx.bad : x.stars === 3 || x.record ? sfx.win : sfx.ok)(); if (x.coins) setTimeout(() => sfx.coin(), 600); } catch {}
}
const VIEWS = ['home', 'sudoku', 'unisci', 'mattoncini', 'mahjong', 'daily', 'temi'];
registerScreen({
  id: 'rompicapo', full: true,
  render(params) {
    if (params?.from) G.from = params.from;
    if (params?.tab) { G.view = VIEWS.includes(params.tab) ? params.tab : 'home'; stopGame(); G.play = null; delete params.tab; }
    if (params?.daily && !G.dailyDone) { G.dailyDone = true; const g = GAME[params.daily] ? params.daily : dailyInfo().featured; G.play = { game: g, kind: 'daily' }; }
    if (params?.quick && !G.quickDone) { G.quickDone = true; G.play = quickPlay(params.quick); }
    if (G.play) return `<div class="rp-stage-root"><div class="rp-root" id="rp-root"></div><div class="rp-over" id="rp-over"></div></div>`;
    return menu(rpLoad());
  },
  async mount() {
    setVolume(volume());
    if (!G.play) { requestAnimationFrame(() => document.querySelector('.rp-tabs .on')?.focus({ preventScroll: true })); return; }
    const P = G.play, root = document.getElementById('rp-root'), p = rpLoad();
    try { music.setMood?.('manage'); } catch {}
    const mod = await ({ sudoku: () => import('../rompicapo/sudoku-ui.js'), unisci: () => import('../rompicapo/merge-ui.js'), mattoncini: () => import('../rompicapo/blocks-ui.js'), mahjong: () => import('../rompicapo/mahjong-ui.js') })[P.game]();
    if (G.play !== P || !root.isConnected) return;
    const Cls = { sudoku: mod.SudokuGame, unisci: mod.MergeGame, mattoncini: mod.BlocksGame, mahjong: mod.MahjongGame }[P.game];
    try {
      G.game = new Cls(root, { params: playParams(P, p), theme: p.theme, sfx, onPause, onSave, onEnd, onRestart: () => App.confirm('Nuova partita?', 'La partita in corso verrà persa.', () => { onSave(null); startPlay({ ...P, resume: null }); }) });
      G.game.start();
    } catch (e) { console.error(e); root.innerHTML = `<div class="rp-loading">Impossibile avviare il rompicapo: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="rp-quit">Indietro</button></div>`; }
  },
  unmount() { stopGame(); G.play = null; G.quickDone = G.dailyDone = false; },
  onKey(e) { if (G.play && G.game && !document.querySelector('#rp-over .rp-res, #rp-over .rp-pause')) G.game.onKey(e); else if (G.play && G.game && e.key === 'Escape' && document.querySelector('#rp-over .rp-pause')) { e.preventDefault(); G.game.togglePause(false); } },
  actions: {
    'rp-tab'(el) { G.view = el.dataset.v; sfx.click?.(); App.refresh(); requestAnimationFrame(() => document.querySelector('.full-screen')?.scrollTo?.({ top: 0 })); },
    'rp-quick'(el, ev) { ev?.stopPropagation?.(); startPlay(quickPlay(el.dataset.g)); },
    'rp-daily'(el) { const g = el.dataset.g, p = rpLoad(); const sv = g === 'sudoku' ? p.sudoku.save : g === 'mahjong' ? p.mahjong.save : null; startPlay({ game: g, kind: 'daily', resume: sv?.kind === 'daily' && sv.key === dayKey() ? sv : null }); },
    'rp-sd-diff'(el) { G.sdDiff = el.dataset.id; const p = rpLoad(); p.sudoku.lastDiff = el.dataset.id; rpSave(p); App.refresh(); },
    'rp-sd-opt'(el) { const p = rpLoad(); p.sudoku.opts[el.dataset.k] = !p.sudoku.opts[el.dataset.k]; rpSave(p); App.refresh(); },
    'rp-sd-lv'(el) { const p = rpLoad(), diff = G.sdDiff || p.sudoku.lastDiff || 'facile', n = +el.dataset.n; if (n > nextOf(p.sudoku.solved, diff)) { sfx.bad?.(); App.toast('Livello bloccato', 'Risolvi prima quello precedente.', 'bad'); return; } const go = () => startPlay({ game: 'sudoku', kind: 'level', diff, n }); if (p.sudoku.save) App.confirm('Iniziare un nuovo sudoku?', 'Quello in corso verrà perso.', () => { onSaveClear('sudoku'); go(); }); else go(); },
    'rp-sd-resume'() { const s = rpLoad().sudoku.save; if (!s) return; startPlay({ game: 'sudoku', kind: s.kind || 'level', diff: s.diff, n: s.n, resume: s }); },
    'rp-mg-size'(el) { const p = rpLoad(); p.unisci.size = +el.dataset.id; rpSave(p); App.refresh(); },
    'rp-mg'(el) { const p = rpLoad(), size = p.unisci.size || 4, sv = p.unisci.save?.[size]; if (el.dataset.resume && sv) { startPlay({ game: 'unisci', kind: 'free', size, resume: sv }); return; } const go = () => startPlay({ game: 'unisci', kind: 'free', size }); if (sv) App.confirm('Nuova partita?', 'Quella in corso su questa tavola verrà persa.', () => { const q = rpLoad(); delete q.unisci.save[size]; rpSave(q); go(); }); else go(); },
    'rp-bk-mode'(el) { const p = rpLoad(); p.mattoncini.mode = el.dataset.id; rpSave(p); App.refresh(); },
    'rp-bk-level'(el) { const p = rpLoad(); p.mattoncini.level = +el.dataset.id; rpSave(p); App.refresh(); },
    'rp-bk'() { const p = rpLoad(); startPlay({ game: 'mattoncini', kind: 'free', mode: p.mattoncini.mode || 'maratona', level: p.mattoncini.mode === 'maratona' || p.mattoncini.mode === 'zen' ? p.mattoncini.level || 1 : 1 }); },
    'rp-mj-layout'(el) { G.mjLayout = el.dataset.id; const p = rpLoad(); p.mahjong.layout = el.dataset.id; rpSave(p); App.refresh(); },
    'rp-mj-lv'(el) { const p = rpLoad(), lay = G.mjLayout || p.mahjong.layout || 'quadrato', n = +el.dataset.n; if (n > nextOf(p.mahjong.solved, lay)) { sfx.bad?.(); App.toast('Livello bloccato', 'Sgombra prima il tavolo precedente.', 'bad'); return; } const go = () => startPlay({ game: 'mahjong', kind: 'level', layout: lay, n }); if (p.mahjong.save) App.confirm('Iniziare un nuovo tavolo?', 'Quello in corso verrà perso.', () => { onSaveClear('mahjong'); go(); }); else go(); },
    'rp-mj-resume'() { const s = rpLoad().mahjong.save; if (!s) return; startPlay({ game: 'mahjong', kind: s.kind || 'level', layout: s.layout, n: s.n, resume: s }); },
    'rp-theme'(el) {
      const p = rpLoad(), t = THEME[el.dataset.id]; if (!t) return;
      if (p.owned.includes(t.id)) { p.theme = t.id; rpSave(p); sfx.select?.(); App.refresh(); return; }
      if (p.coins < t.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${t.cost - p.coins} monete per il tema «${t.name}». Le guadagni giocando.`, 'bad'); return; }
      App.confirm(`Sbloccare il tema «${t.name}»?`, `Costa ${t.cost} monete (ne hai ${p.coins}).`, () => { const q = rpLoad(); q.coins -= t.cost; q.owned.push(t.id); q.theme = t.id; rpSave(q); sfx.coin?.(); App.refresh(); });
    },
    async 'rp-share'() {
      const t = document.getElementById('rp-share')?.textContent || ''; let ok = false;
      try { if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text: t }); ok = true; } } catch {}
      if (!ok) try { await navigator.clipboard.writeText(t); ok = true; } catch {}
      App.toast(ok ? 'Risultati copiati' : 'Copia non riuscita', ok ? 'Incollali dove vuoi per sfidare gli amici.' : 'Seleziona il testo e copialo a mano.', ok ? 'good' : 'bad');
    },
    'rp-resume'() { G.game?.togglePause(false); },
    'rp-nolimit'() { overlay(''); G.game?.continueNoLimit?.(); },
    'rp-again'() { const P = G.play; if (!P) return; onSave(null); startPlay({ ...P, resume: null }); },
    'rp-next'() { const P = G.play; if (!P) return; startPlay({ ...P, n: P.n + 1, resume: null }); },
    'rp-quit'() { const P = G.play; G.game?.save?.(); stopGame(); G.play = null; G.view = P?.kind === 'daily' && G.view === 'daily' ? 'daily' : P?.game || G.view; App.refresh(); },
    'rp-hall'() { stopGame(); G.play = null; App.go('launcher'); },
  },
});
function onSaveClear(g) { const p = rpLoad(); if (g === 'sudoku') p.sudoku.save = null; if (g === 'mahjong') p.mahjong.save = null; rpSave(p); }
function quickPlay(g) {
  const p = rpLoad();
  if (g === 'sudoku') { const s = p.sudoku.save; if (s && !(s.kind === 'daily' && s.key !== dayKey())) return { game: 'sudoku', kind: s.kind || 'level', diff: s.diff, n: s.n, resume: s }; const diff = p.sudoku.lastDiff || 'facile'; return { game: 'sudoku', kind: 'level', diff, n: nextOf(p.sudoku.solved, diff) }; }
  if (g === 'unisci') { const size = p.unisci.size || 4; return { game: 'unisci', kind: 'free', size, resume: p.unisci.save?.[size] || null }; }
  if (g === 'mattoncini') { const m = p.mattoncini.mode || 'maratona'; return { game: 'mattoncini', kind: 'free', mode: m, level: m === 'maratona' || m === 'zen' ? p.mattoncini.level || 1 : 1 }; }
  const s = p.mahjong.save; if (s && !(s.kind === 'daily' && s.key !== dayKey())) return { game: 'mahjong', kind: s.kind || 'level', layout: s.layout, n: s.n, resume: s };
  const lay = p.mahjong.layout || 'quadrato'; return { game: 'mahjong', kind: 'level', layout: lay, n: nextOf(p.mahjong.solved, lay) };
}
