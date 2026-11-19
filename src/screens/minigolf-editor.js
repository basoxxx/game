// Minigolf Baso — course editor: paint pieces on a grid (2D, works on phones), raise and lower tiles,
// test the hole in 3D, save it locally and share it as a code string.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx } from '../ui/audio.js';
import { mgLoad, mgSave } from '../minigolf/store.js';
import { THEMES } from '../minigolf/courses.js';
import { TILE_NAMES } from '../minigolf/holes.js';
import { encode, decode, validate, normalize, MAX_W, MAX_H } from '../minigolf/code.js';
import '../minigolf/minigolf.css';

const DRAFT = 'sala_minigolf_draft';
const PAL = [
  ['_', 'Prato'], ['S', 'Partenza'], ['H', 'Buca'], ['.', 'Vuoto'], ['^', 'Rampa'], ['s', 'Sabbia'], ['i', 'Ghiaccio'], ['w', 'Acqua'], ['l', 'Lava'],
  ['g', 'Gravità bassa'], ['8', 'Nastro'], ['B', 'Respingente'], ['M', 'Mulino'], ['Z', 'Cancello'], ['O', 'Giro della morte'], ['T', 'Teletrasporto'], ['t', 'Uscita'], ['U', 'Teletr. 2'], ['u', 'Uscita 2'], ['X', 'Blocco'],
];
const ROT = { '^': '>', '>': 'v', v: '<', '<': '^', 8: '6', 6: '2', 2: '4', 4: '8' };
const ARROW = { '^': '↑', '>': '→', v: '↓', '<': '←', 8: '⇡', 6: '⇢', 2: '⇣', 4: '⇠' };
const E = { tool: '_', dir: 0, from: 'minigolf', h: null, verified: false };

function blank() { return { name: 'La mia buca', par: 3, theme: 'giardino', g: 1, rows: ['.........', '..._____.', '..._____.', '..._H___.', '..._____.', '..._____.', '..._____.', '..._____.', '...__S__.', '.........'].map((r) => r.slice(0, 9)), h: null }; }
function load() { try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (d?.rows) return normalize(d); } catch {} return normalize(blank()); }
function save() { try { localStorage.setItem(DRAFT, JSON.stringify(E.h)); } catch {} }
const W = () => E.h.rows[0].length, Hh = () => E.h.rows.length;
const heights = () => E.h.h || E.h.rows.map((r) => '0'.repeat(r.length));
function setCell(x, y, ch) { const r = [...E.h.rows[y]]; r[x] = ch; E.h.rows[y] = r.join(''); }
function setH(x, y, v) { const h = heights().slice(); const r = [...h[y]]; r[x] = String(Math.max(0, Math.min(9, v))); h[y] = r.join(''); E.h.h = h; }
function toolChar() { const t = E.tool; if (t === '^') return ['^', '>', 'v', '<'][E.dir]; if (t === '8') return ['8', '6', '2', '4'][E.dir]; return t; }

function paint(x, y, how) {
  if (x < 0 || y < 0 || x >= W() || y >= Hh()) return;
  if (how === 'up' || how === 'down') { setH(x, y, +heights()[y][x] + (how === 'up' ? 1 : -1)); }
  else if (how === 'rot') { const c = E.h.rows[y][x]; if (ROT[c]) setCell(x, y, ROT[c]); }
  else {
    const ch = toolChar();
    // unique pieces move instead of multiplying
    if ('SHTtUu'.includes(ch)) E.h.rows.forEach((r, yy) => { const i = r.indexOf(ch); if (i >= 0) setCell(i, yy, '_'); });
    setCell(x, y, ch);
  }
  E.verified = false; save();
}
function resize(dw, dh) {
  const w = Math.max(3, Math.min(MAX_W, W() + dw)), h = Math.max(3, Math.min(MAX_H, Hh() + dh));
  const hs = heights();
  const rows = [], hh = [];
  for (let y = 0; y < h; y++) { rows.push((E.h.rows[y] || '').padEnd(w, '.').slice(0, w)); hh.push((hs[y] || '').padEnd(w, '0').slice(0, w)); }
  E.h.rows = rows; E.h.h = hh; E.verified = false; save();
}

function draw() {
  const cv = document.getElementById('mge-cv'); if (!cv) return;
  const box = cv.parentElement.getBoundingClientRect();
  const w = W(), h = Hh();
  const s = Math.floor(Math.max(18, Math.min((box.width - 4) / w, (Math.max(260, box.height) - 4) / h, 54)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * s * dpr; cv.height = h * s * dpr; cv.style.width = `${w * s}px`; cv.style.height = `${h * s}px`;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const th = THEMES[E.h.theme] || THEMES.giardino, hs = heights();
  E.cell = s;
  g.fillStyle = '#0d0f14'; g.fillRect(0, 0, w * s, h * s);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = E.h.rows[y][x], lv = +hs[y][x];
    const X = x * s, Y = y * s;
    if (c === '.') { g.strokeStyle = 'rgba(255,255,255,.06)'; g.strokeRect(X + 0.5, Y + 0.5, s - 1, s - 1); continue; }
    const base = { w: th.water, l: '#ff6a1f', s: '#f1d48a', i: '#cfefff', X: '#6b6878', g: '#8e6cff' }[c] || ((x + y) % 2 ? th.felt2 : th.felt);
    g.fillStyle = base; g.fillRect(X, Y, s, s);
    if (lv) { g.fillStyle = `rgba(255,255,255,${Math.min(0.35, lv * 0.08)})`; g.fillRect(X, Y, s, s); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X, Y + s - 2, s, 2); g.fillRect(X + s - 2, Y, 2, s);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(s * 0.5)}px system-ui, sans-serif`;
    const ink = (t, col = '#fff') => { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(t, X + s / 2 + 1, Y + s / 2 + 1); g.fillStyle = col; g.fillText(t, X + s / 2, Y + s / 2); };
    if (c === 'H') { g.fillStyle = '#111'; g.beginPath(); g.arc(X + s / 2, Y + s / 2, s * 0.18, 0, 7); g.fill(); g.fillStyle = '#ff3b30'; g.fillRect(X + s / 2, Y + s * 0.15, s * 0.28, s * 0.16); }
    else if (c === 'S') { g.fillStyle = '#fff'; g.beginPath(); g.arc(X + s / 2, Y + s / 2, s * 0.16, 0, 7); g.fill(); }
    else if (ARROW[c]) { if (/[2468]/.test(c)) { g.fillStyle = '#2b2f3a'; g.fillRect(X + 2, Y + 2, s - 4, s - 4); ink(ARROW[c], '#ffd23f'); } else ink(ARROW[c]); }
    else if (c === 'B') { g.fillStyle = '#ff3fa4'; g.beginPath(); g.arc(X + s / 2, Y + s / 2, s * 0.22, 0, 7); g.fill(); }
    else if ('MZOTtUu'.includes(c)) ink({ M: '✣', Z: '⇔', O: '➰', T: 'T', t: 't', U: 'U', u: 'u' }[c], 'TU'.includes(c) ? '#ff8a1f' : 'tu'.includes(c) ? '#5ff2ff' : '#fff');
    if (lv) { g.font = `700 ${Math.round(s * 0.28)}px system-ui`; g.fillStyle = '#000'; g.fillText(lv, X + s * 0.82, Y + s * 0.2); }
  }
}
function status() {
  const err = validate(E.h);
  return err ? `<span class="mge-bad">${icon('alert')} ${esc(err)}</span>` : E.verified ? `<span class="mge-ok">${icon('check')} Provata: si può fare!</span>` : `<span>${icon('info')} Pronta: provala per verificarla.</span>`;
}
function view() {
  const p = mgLoad();
  return `<div class="full-screen mg-menu mge">
    ${pageHead({ back: E.from, eyebrow: 'Minigolf Baso · Editor', title: 'Editor di buche', sub: 'Dipingi i pezzi sulla griglia, prova la buca in 3D, salvala e condividila con un codice.' })}
    <div class="mge-wrap">
      <aside class="mge-pal" aria-label="Pezzi">${PAL.map(([c, n]) => `<button class="mge-t ${E.tool === c ? 'on' : ''}" data-a="mge-tool" data-t="${c}" title="${esc(TILE_NAMES[c] || n)}"><i class="mge-ti mge-ti-${c === '.' ? 'void' : c === '^' ? 'ramp' : c === '8' ? 'belt' : c}">${c === '^' ? ARROW[['^', '>', 'v', '<'][E.dir]] : c === '8' ? ARROW[['8', '6', '2', '4'][E.dir]] : ''}</i><span>${esc(n)}</span></button>`).join('')}
        <button class="mge-t ${E.tool === 'up' ? 'on' : ''}" data-a="mge-tool" data-t="up"><i class="mge-ti">▲</i><span>Alza</span></button>
        <button class="mge-t ${E.tool === 'down' ? 'on' : ''}" data-a="mge-tool" data-t="down"><i class="mge-ti">▼</i><span>Abbassa</span></button>
        <button class="mge-t ${E.tool === 'rot' ? 'on' : ''}" data-a="mge-tool" data-t="rot"><i class="mge-ti">⟳</i><span>Ruota</span></button>
        <button class="mge-t" data-a="mge-dir" title="Direzione di rampe e nastri (R)"><i class="mge-ti">${ARROW[['^', '>', 'v', '<'][E.dir]]}</i><span>Direzione</span></button>
      </aside>
      <div class="mge-grid"><canvas id="mge-cv" aria-label="Griglia della buca"></canvas></div>
      <aside class="mge-side">
        <label>Nome<input id="mge-name" maxlength="28" value="${esc(E.h.name)}"></label>
        <div class="mge-row"><label>Par<select id="mge-par">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${E.h.par === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Tema<select id="mge-theme">${Object.entries(THEMES).map(([id, t]) => `<option value="${id}" ${E.h.theme === id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label>Gravità<select id="mge-g">${[[1, 'Normale'], [0.6, 'Bassa'], [0.45, 'Lunare']].map(([v, n]) => `<option value="${v}" ${+E.h.g === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="mge-row mge-size"><span>Larghezza ${W()}</span><button class="btn sm" data-a="mge-size" data-w="-1">−</button><button class="btn sm" data-a="mge-size" data-w="1">+</button><span>Altezza ${Hh()}</span><button class="btn sm" data-a="mge-size" data-h="-1">−</button><button class="btn sm" data-a="mge-size" data-h="1">+</button></div>
        <div class="mge-status">${status()}</div>
        <div class="mge-btns"><button class="btn primary" data-a="mge-test">${icon('play')} Prova</button><button class="btn" data-a="mge-save">${icon('save')} Salva</button><button class="btn" data-a="mge-share">${icon('upload')} Condividi</button><button class="btn" data-a="mge-import">${icon('download')} Importa codice</button><button class="btn ghost" data-a="mge-new">${icon('plus')} Nuova</button></div>
        <h3>Le mie buche</h3>
        <ul class="mge-list">${p.custom.length ? p.custom.map((c, i) => `<li><b>${esc(c.name)}</b><span>Par ${c.par}${c.verified ? ' · provata' : ''}</span><button class="btn sm" data-a="mge-play" data-i="${i}" aria-label="Gioca">${icon('play')}</button><button class="btn sm" data-a="mge-edit" data-i="${i}" aria-label="Modifica">${icon('wrench')}</button><button class="btn sm ghost" data-a="mge-del" data-i="${i}" aria-label="Elimina">${icon('trash')}</button></li>`).join('') : '<li class="muted">Nessuna buca salvata.</li>'}</ul>
        <p class="muted small">Tocca o trascina per dipingere. Rampe: la cifra di altezza è il lato basso, salgono di un livello verso la freccia. Una rampa che finisce nel vuoto o su un livello più basso è un trampolino. T porta a t, U porta a u.</p>
      </aside>
    </div></div>`;
}

let keyH = null, ro = null;
registerScreen({
  id: 'minigolf-editor', full: true,
  render(params) {
    if (params?.from && params.from !== 'minigolf-editor') E.from = params.from;
    if (!E.h) E.h = load();
    if (params?.tested != null) { E.verified = true; delete params.tested; }
    return view();
  },
  mount() {
    const cv = document.getElementById('mge-cv');
    draw();
    ro?.disconnect(); ro = new ResizeObserver(() => draw()); ro.observe(cv.parentElement);
    let down = false, last = '';
    const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / E.cell), Math.floor((e.clientY - r.top) / E.cell)]; };
    const act = (e) => { const [x, y] = at(e); const k = `${x},${y}`; if (k === last) return; last = k; const how = E.tool === 'up' || E.tool === 'down' || E.tool === 'rot' ? E.tool : 'paint'; paint(x, y, how); draw(); };
    cv.addEventListener('pointerdown', (e) => { down = true; last = ''; cv.setPointerCapture(e.pointerId); act(e); try { sfx.tick(); } catch {} });
    cv.addEventListener('pointermove', (e) => { if (down && E.tool !== 'up' && E.tool !== 'down' && E.tool !== 'rot') act(e); });
    const up = () => { if (down) { down = false; const s = document.querySelector('.mge-status'); if (s) s.innerHTML = status(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const sync = () => { E.h.name = document.getElementById('mge-name').value.trim() || 'La mia buca'; E.h.par = +document.getElementById('mge-par').value; E.h.theme = document.getElementById('mge-theme').value; E.h.g = +document.getElementById('mge-g').value; save(); draw(); };
    for (const id of ['mge-name', 'mge-par', 'mge-theme', 'mge-g']) document.getElementById(id).addEventListener('change', sync);
    if (keyH) window.removeEventListener('keydown', keyH);
    keyH = (e) => { if (App.cur !== 'minigolf-editor' || e.target.closest('input, select, textarea') || document.querySelector('.modal-wrap')) return; if (e.code === 'KeyR') { E.dir = (E.dir + 1) % 4; App.refresh(); } };
    window.addEventListener('keydown', keyH);
  },
  unmount() { ro?.disconnect(); ro = null; if (keyH) window.removeEventListener('keydown', keyH); keyH = null; },
  actions: {
    'mge-tool'(el) { E.tool = el.dataset.t; App.refresh(); },
    'mge-dir'() { E.dir = (E.dir + 1) % 4; App.refresh(); },
    'mge-size'(el) { resize(+(el.dataset.w || 0), +(el.dataset.h || 0)); App.refresh(); },
    'mge-test'() {
      const err = validate(E.h); if (err) { sfx.bad?.(); App.toast('Buca non giocabile', err, 'bad'); return; }
      const p = mgLoad();
      App.go('minigolf', { play: { kind: 'custom', test: true, holes: [{ ...normalize(E.h), id: 'custom-test', course: 'custom', n: 0 }], players: [{ name: 'Tu', color: '#fff', skin: p.ball, hat: p.hat, trail: p.trail }], title: E.h.name } });
    },
    'mge-save'() {
      const err = validate(E.h); if (err) { sfx.bad?.(); App.toast('Non salvata', err, 'bad'); return; }
      const p = mgLoad(), code = encode(E.h);
      const i = p.custom.findIndex((c) => c.name === E.h.name);
      const rec = { name: E.h.name, par: E.h.par, code, verified: E.verified, at: Date.now() };
      if (i >= 0) p.custom[i] = rec; else p.custom.unshift(rec);
      p.custom = p.custom.slice(0, 40); mgSave(p); sfx.ok?.();
      App.toast('Buca salvata', `«${esc(E.h.name)}» è tra le tue buche.`, 'good'); App.refresh();
    },
    'mge-share'() {
      const err = validate(E.h); if (err) { sfx.bad?.(); App.toast('Non condivisibile', err, 'bad'); return; }
      const code = encode(E.h);
      App.modal(`<h2>Condividi la buca</h2><p class="muted">Copia il codice e mandalo a chi vuoi: lo incolla in «Importa codice».${E.verified ? '' : ' <b>Consiglio:</b> provala prima, per essere sicuro che si possa fare.'}</p><textarea class="mge-code" readonly rows="4">${esc(code)}</textarea><div class="row mt16" style="gap:8px;justify-content:flex-end"><button class="btn" data-a="close-modal">Chiudi</button><button class="btn primary" data-a="mge-copy">${icon('check')} Copia</button></div>`, {
        'mge-copy'() { const t = document.querySelector('.mge-code'); t.select(); try { navigator.clipboard?.writeText(code); } catch {} try { document.execCommand?.('copy'); } catch {} App.toast('Codice copiato', '', 'good'); },
      });
    },
    'mge-import'() {
      App.modal(`<h2>Importa una buca</h2><p class="muted">Incolla un codice MG1-…</p><textarea class="mge-code" id="mge-in" rows="4" placeholder="MG1-..."></textarea><div class="row mt16" style="gap:8px;justify-content:flex-end"><button class="btn" data-a="close-modal">Annulla</button><button class="btn primary" data-a="mge-do-import">Importa</button></div>`, {
        'mge-do-import'() { const h = decode(document.getElementById('mge-in').value); if (!h) { sfx.bad?.(); App.toast('Codice non valido', 'Controlla di averlo copiato per intero.', 'bad'); return; } E.h = h; E.verified = false; save(); App.closeModal(); App.refresh(); App.toast('Buca importata', `«${esc(h.name)}»`, 'good'); },
      });
    },
    'mge-new'() { App.confirm('Nuova buca?', 'La buca che stai modificando verrà sostituita (quelle salvate restano).', () => { E.h = normalize(blank()); E.verified = false; save(); App.refresh(); }); },
    'mge-edit'(el) { const c = mgLoad().custom[+el.dataset.i]; const h = c && decode(c.code); if (!h) return; E.h = h; E.verified = !!c.verified; save(); App.refresh(); },
    'mge-play'(el) { const p = mgLoad(), c = p.custom[+el.dataset.i]; const h = c && decode(c.code); if (!h) return; App.go('minigolf', { play: { kind: 'custom', holes: [{ ...h, id: 'custom-' + el.dataset.i, course: 'custom', n: 0 }], players: [{ name: 'Tu', color: '#fff', skin: p.ball, hat: p.hat, trail: p.trail }], title: h.name } }); },
    'mge-del'(el) { const i = +el.dataset.i; App.confirm('Eliminare la buca?', 'Non si può annullare (se l’hai condivisa, il codice continua a funzionare).', () => { const p = mgLoad(); p.custom.splice(i, 1); mgSave(p); App.refresh(); }, 'Elimina', true); },
  },
});
