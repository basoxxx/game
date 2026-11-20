// Orda · Base e razzie — the screen: your base (3D editor, production, upgrades), raids on rival bases
// (played with OrdaGame in mode 'raid'), defence reports with «Vendetta». Registered as 'orda-base'.
// The 3D view lives for as long as the screen: tabs and panels update in place (no App.refresh), so the
// WebGL context is never rebuilt while you click around.
import { App, registerScreen, hasScreen } from '../../app.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/dom.js';
import { sfx, music } from '../../ui/audio.js';
import { gfxTier } from '../../ui/quality.js';
import { getSettings } from '../../engine/state.js';
import { ordaLoad, ordaSave, ordaStars } from '../store.js';
import { BUILDINGS, PALETTE, HOUR, GRID, limitOf, maxLevelAt, typeUnlocked, HQ_UNLOCK, RAID_TOKENS, RIVAL_REFRESH_H, RIVAL_REROLL_COINS, REVENGE_BONUS, gateLabel } from './data.js';
import * as G from './logic.js';
import { baseLoad, baseSave } from './store.js';
import { checkAttacks, shielded } from './defense.js';
import { genRival, rivalList, DIFF_LABEL, STYLE_NAMES } from './rivals.js';
import { layoutToLevel, destroyedPct, raidLoot, raidStars } from './convert.js';
import { defenceRating } from './sim.js';
import '../orda.css'; // the game's HUD (raids run OrdaGame inside this screen)
import './base.css';
// the Orda game chunk (glob: resolves to nothing instead of failing the build if it is ever missing)
const GAME = import.meta.glob('../game.js');

const fmt = (n) => Math.round(n).toLocaleString('it-IT');
export function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'meno di 1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r ? `${h} h ${r} min` : `${h} h`;
  return `${Math.floor(h / 24)} g ${h % 24} h`;
}
const ago = (t, now = Date.now()) => (now - t < 60000 ? 'adesso' : `${fmtDur(now - t)} fa`);
const BRICK = '<i class="ob-brick" aria-hidden="true"></i>';
const costHtml = (c) => [c.bricks ? `${BRICK}${fmt(c.bricks)}` : '', c.coins ? `${icon('coin')}${fmt(c.coins)}` : ''].filter(Boolean).join(' ') || 'Gratis';

// campaign progress drives the unlocks: lvl = campaign levels cleared
export function progress() { const p = ordaLoad(); return { lvl: Math.max(0, (p.next || 1) - 1), stars: ordaStars(p) }; }
// coins are the Orda wallet shared with the campaign
G.setWallet(() => ordaLoad().coins || 0, (_s, n) => { const p = ordaLoad(); p.coins = Math.max(0, (p.coins || 0) + n); ordaSave(p); });

const V = { tab: 'base', st: null, view: null, sel: null, armed: null, rival: null, report: null, from: 'launcher', timer: 0, playing: null, game: null, rating: null, ratingKey: '' };
const save = () => { V.st.defense.lastSeen = Date.now(); baseSave(V.st); };
const sel = () => V.st.layout.b.find((b) => b.id === V.sel) || null;

// ---------------------------------------------------------------- header / tabs
function header() {
  const st = V.st, now = Date.now(), tk = G.tokens(st, now), sh = shielded(st, now), unread = st.defense.reports.filter((r) => !r.seen).length;
  return `<div class="ob-res">
      <span class="ob-chip" title="Mattoni: servono a costruire e potenziare">${BRICK}<b>${fmt(st.bricks)}</b></span>
      <span class="ob-chip" title="Monete del portafoglio di Orda (le stesse della campagna)">${icon('coin')}<b>${fmt(G.coinsOf(st))}</b></span>
      <span class="ob-chip ${tk.n ? '' : 'dim'}" title="Razzie disponibili: una nuova ogni ${D_REGEN}">${icon('flag')}<b>${tk.n}/${RAID_TOKENS}</b>${tk.next ? `<small>+1 tra ${fmtDur(tk.next)}</small>` : ''}</span>
      ${sh ? `<span class="ob-chip shield" title="Nessuno può attaccarti finché lo scudo è attivo">${icon('shield')}<b>${fmtDur(sh)}</b></span>` : ''}
    </div>
    <nav class="ob-tabs" role="tablist">
      ${[['base', 'home', 'La tua base'], ['raid', 'flag', 'Razzie'], ['def', 'shield', 'Difesa']].map(([id, ic, nm]) => `<button role="tab" aria-selected="${V.tab === id}" class="ob-tab ${V.tab === id ? 'on' : ''}" data-a="ob-tab" data-id="${id}">${icon(ic)}<span>${nm}</span>${id === 'def' && unread ? `<em>${unread}</em>` : ''}${id === 'raid' && tk.n ? `<em class="ok">${tk.n}</em>` : ''}</button>`).join('')}
    </nav>`;
}
const D_REGEN = '90 minuti';

// ---------------------------------------------------------------- base tab panel
function rating() {
  const key = JSON.stringify(V.st.layout.b.map((b) => [b.t, b.x, b.y, b.l]));
  if (key !== V.ratingKey) { V.ratingKey = key; V.rating = defenceRating(V.st.layout); }
  return V.rating;
}
function palette() {
  const st = V.st, prog = progress(), hq = G.hqLevel(st.layout), now = Date.now();
  const pend = G.pending(st, now), rate = G.ratePerHour(st);
  return `<div class="ob-sec">
      <div class="ob-prod">
        <div><small>Produzione</small><b>${BRICK}${fmt(rate.bricks)}/h · ${icon('coin')}${fmt(rate.coins)}/h</b></div>
        <button class="btn sm ${pend.bricks + pend.coins ? 'primary' : ''}" data-a="ob-collect-all" ${pend.bricks + pend.coins ? '' : 'disabled'}>Raccogli ${pend.bricks ? `${BRICK}${fmt(pend.bricks)}` : ''} ${pend.coins ? `${icon('coin')}${fmt(pend.coins)}` : ''}</button>
      </div>
      <div class="ob-rating" title="Stima dalla simulazione: l’orda più grande che la base respinge senza perdere stelle">${icon('shield')} La difesa respinge circa <b>${fmt(rating())}</b> figurine</div>
    </div>
    <h3 class="ob-h">Costruisci <small>QG livello ${hq}</small></h3>
    ${V.armed ? `<div class="ob-arm">${icon('info')} <span>Tocca una casella libera per piazzare: <b>${esc(BUILDINGS[V.armed].name)}</b></span><button class="btn sm ghost" data-a="ob-disarm">Annulla</button></div>` : ''}
    <div class="ob-pal">${PALETTE.map((t) => {
      const B = BUILDINGS[t], c = G.canBuild(st, t, prog), n = G.countOf(st.layout, t), lim = limitOf(t, hq), unl = typeUnlocked(t, prog);
      return `<button class="ob-card ${c.ok ? '' : 'no'} ${unl ? '' : 'locked'} ${V.armed === t ? 'on' : ''}" data-a="ob-arm" data-t="${t}" data-drag="${t}" style="--c:${B.color}" title="${esc(B.desc)}">
        <i class="ob-ic">${B.icon}</i><b>${esc(B.name)}</b>
        <span>${unl ? `${costHtml(B.cost(1))}` : `${icon('lock')} Campagna liv. ${B.unlock}`}</span>
        ${unl ? `<small>${n}/${lim}</small>` : ''}</button>`;
    }).join('')}</div>
    <p class="ob-hint">Trascina un edificio sulla griglia o toccalo e poi tocca una casella. Trascina gli edifici già piazzati per spostarli (o selezionali e usa le frecce). Gli attacchi arrivano dalla pista di sabbia.</p>`;
}
function detail(b) {
  const st = V.st, prog = progress(), B = BUILDINGS[b.t], now = Date.now();
  const up = G.canUpgrade(st, b, prog), next = b.l < B.max ? b.l + 1 : null;
  const cur = B.stat(b.l), nx = next ? B.stat(next) : null;
  const store = B.kind === 'prod' ? G.stored(b, now) : 0;
  const capN = B.kind === 'prod' ? B.rate(b.l) * B.capH(b.l) : 0;
  const hq = G.hqLevel(st.layout);
  return `<div class="ob-det" style="--c:${B.color}">
      <div class="ob-det-h"><i class="ob-ic">${B.icon}</i><div><b>${esc(B.name)}</b><span>Livello ${b.l}/${B.max}${b.t !== 'hq' ? ` · max ${maxLevelAt(b.t, hq)} con QG ${hq}` : ''}</span></div><button class="btn icon-btn ghost sm" data-a="ob-desel" aria-label="Chiudi">${icon('x')}</button></div>
      <p>${esc(B.desc)}</p>
      <table class="ob-stats">${cur.map(([k, v], i) => `<tr><td>${esc(k)}</td><td><b>${esc(String(v))}</b>${nx && String(nx[i][1]) !== String(v) ? ` <em>→ ${esc(String(nx[i][1]))}</em>` : ''}</td></tr>`).join('')}</table>
      ${B.kind === 'prod' ? `<div class="ob-store"><div class="ob-bar"><i style="width:${Math.min(100, (store / capN) * 100)}%"></i></div><span>${B.res === 'coins' ? icon('coin') : BRICK}${fmt(store)} / ${fmt(capN)}${G.isFull(b, now) ? ' · <b>pieno!</b>' : ` · pieno tra ${fmtDur(((capN - store) / B.rate(b.l)) * HOUR)}`}</span><button class="btn sm primary" data-a="ob-collect" ${store ? '' : 'disabled'}>Raccogli</button></div>` : ''}
      <div class="ob-det-btns">
        ${next ? `<button class="btn primary" data-a="ob-upgrade" ${up.ok ? '' : 'disabled'}>${icon('plus')} Potenzia a liv. ${next} · ${costHtml(B.cost(next))}</button>${up.ok ? '' : `<div class="ob-why">${esc(up.why)}</div>`}` : '<div class="ob-why good">Livello massimo raggiunto</div>'}
        ${b.t !== 'hq' ? `<button class="btn ghost sm" data-a="ob-demolish">${icon('trash')} Demolisci</button>` : `<div class="ob-why">${next && HQ_UNLOCK[next] ? `QG liv. ${next}: livello ${HQ_UNLOCK[next]} della campagna` : ''}</div>`}
      </div>
    </div>`;
}
function basePanel() { const b = sel(); return b ? detail(b) : palette(); }

// ---------------------------------------------------------------- raids tab
function ensureRivals(now = Date.now()) {
  const r = V.st.raids;
  if (now - r.listAt >= RIVAL_REFRESH_H * HOUR) { r.listN++; r.listAt = now; r.done = {}; save(); }
}
function rivalsNow() {
  const st = V.st, prog = progress(), hq = G.hqLevel(st.layout), now = Date.now();
  ensureRivals(now);
  const list = rivalList(st, prog, hq).map((x) => ({ ...genRival(x.seed, x.diff), kind: 'rival' }));
  const rev = st.defense.reports.filter((r) => !r.revenge.done && r.revenge.until > now && r.stars > 0)
    .map((r) => ({ ...genRival(r.attacker.seed, r.attacker.diff), kind: 'revenge', rep: r.id, until: r.revenge.until }));
  // two generated names can collide: the later one becomes «… II»
  const seen = new Set();
  return [...rev, ...list].map((r) => { let n = r.name; while (seen.has(n)) n += ' II'; seen.add(n); return n === r.name ? r : { ...r, name: n }; });
}
function rivalCard(rv, now) {
  const done = V.st.raids.done[rv.seed];
  const on = V.rival?.seed === rv.seed;
  const lootK = (rv.kind === 'revenge' ? REVENGE_BONUS : 1) * Math.max(0, 1 - (done?.taken || 0));
  return `<div class="ob-rv ${on ? 'on' : ''} ${rv.kind} ${done ? 'done' : ''}" data-a="ob-rival" data-seed="${rv.seed}" tabindex="0" style="--c:${rv.color}">
    <div class="ob-rv-h"><i class="ob-flag"></i><div><b>${esc(rv.name)}</b><span>${esc(rv.leader)} · ${esc(STYLE_NAMES[rv.style] || '')}</span></div>
      <em class="ob-diff d${rv.diff <= 2 ? 1 : rv.diff <= 4.5 ? 2 : rv.diff <= 8 ? 3 : 4}">${rv.kind === 'revenge' ? 'Vendetta' : DIFF_LABEL(rv.diff)}</em></div>
    <div class="ob-rv-s"><span title="Forza della base">${icon('shield')} ${fmt(rv.power)}</span><span title="QG">QG ${rv.hq}</span><span title="Bottino ancora nel deposito">${BRICK}${fmt(rv.loot.bricks * lootK)} ${icon('coin')}${fmt(rv.loot.coins * lootK)}</span>
      ${done ? `<span class="ob-stars">${'★'.repeat(done.stars)}${'☆'.repeat(3 - done.stars)} ${Math.round(done.pct * 100)}%</span>${done.taken >= 0.999 ? '<span class="ob-ttl">Deposito vuoto</span>' : ''}` : ''}
      ${rv.kind === 'revenge' ? `<span class="ob-ttl">${icon('hourglass')} ${fmtDur(rv.until - now)}</span>` : ''}</div>
  </div>`;
}
function raidPanel() {
  const st = V.st, now = Date.now(), list = rivalsNow(), tk = G.tokens(st, now);
  if (!V.rival || !list.some((r) => r.seed === V.rival.seed)) V.rival = list[0] || null;
  const free = now - st.raids.listAt >= RIVAL_REFRESH_H * HOUR;
  const rv = V.rival;
  return `<div class="ob-sec ob-raidbar"><div>${icon('flag')} <b>${tk.n}/${RAID_TOKENS}</b> razzie${tk.next ? ` · la prossima tra ${fmtDur(tk.next)}` : ''}</div>
      <button class="btn sm ghost" data-a="ob-reroll">${icon('replay')} Nuovi rivali ${free ? '' : `· ${icon('coin')}${RIVAL_REROLL_COINS}`}</button></div>
    <div class="ob-rvs">${list.map((r) => rivalCard(r, now)).join('')}</div>
    <p class="ob-hint">Nuovi rivali gratis tra ${fmtDur(st.raids.listAt + RIVAL_REFRESH_H * HOUR - now)}. Il bottino dipende da quanta base distruggi.</p>
    ${rv ? `<div class="ob-go"><div><small>Bersaglio</small><b>${esc(rv.name)}</b></div><button class="btn primary big" data-a="ob-attack" ${tk.n ? '' : 'disabled'}>${icon('play')} ${rv.kind === 'revenge' ? 'Vendetta!' : 'Attacca'}</button></div>` : ''}`;
}

// ---------------------------------------------------------------- defence tab
function miniMap(rep) {
  const L = V.st.layout, dead = new Set();
  // the report lists destroyed types; the current layout is drawn and the first n of each type greyed
  const left = { ...rep.destroyed };
  for (const b of L.b) if (left[b.t] > 0) { left[b.t]--; dead.add(b.id); }
  const cells = [];
  for (let y = GRID - 1; y >= 0; y--) for (let x = 0; x < GRID; x++) {
    const b = L.b.find((q) => x >= q.x && x < q.x + G.sizeOf(q.t) && y >= q.y && y < q.y + G.sizeOf(q.t));
    cells.push(`<i class="${b ? (dead.has(b.id) ? 'x' : 'b') : ''}" style="${b ? `--c:${BUILDINGS[b.t].color}` : ''}"></i>`);
  }
  return `<div class="ob-mini" style="--n:${GRID}">${cells.join('')}</div>`;
}
function defPanel() {
  const st = V.st, now = Date.now(), reps = st.defense.reports, sh = shielded(st, now);
  const stats = st.stats;
  return `<div class="ob-sec ob-defsum">
      <div><small>Attacchi subiti</small><b>${stats.attacked || 0}</b></div><div><small>Respinti</small><b>${stats.defended || 0}</b></div>
      <div><small>Scudo</small><b>${sh ? fmtDur(sh) : 'spento'}</b></div></div>
    ${reps.length ? `<div class="ob-reps">${reps.map((r) => {
      const ok = r.stars === 0, rev = !r.revenge.done && r.revenge.until > now && !ok;
      const lost = Object.entries(r.destroyed).map(([t, n]) => `${n}× ${BUILDINGS[t]?.name || t}`).join(', ');
      return `<div class="ob-rep ${ok ? 'ok' : 'bad'} ${r.seen ? '' : 'new'} ${V.report === r.id ? 'on' : ''}" data-a="ob-report" data-id="${r.id}" tabindex="0" style="--c:${r.attacker.color}">
        <div class="ob-rep-h"><b>${ok ? 'Attacco respinto!' : r.hqDown ? 'QG abbattuto' : 'Base saccheggiata'}</b><span>${ago(r.at, now)}</span></div>
        <div class="ob-rep-a">${esc(r.attacker.leader)} da <b>${esc(r.attacker.name)}</b> con ${fmt(r.figures)} figurine</div>
        <div class="ob-rep-b">${miniMap(r)}<div>
          <div class="ob-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} · ${Math.round(r.pct * 100)}% distrutto</div>
          <div class="small">Fermate: ${fmt(r.killed.towers)} dalle torri · ${fmt(r.killed.red)} dalle figurine rosse · ${fmt(r.killed.gates)} dalle porte trappola</div>
          ${lost ? `<div class="small">Abbattuti: ${esc(lost)} <em>(ricostruiti gratis)</em></div>` : ''}
          <div class="small">${ok ? `Premio difesa: ${BRICK}+${fmt(r.bonus)}` : `Persi: ${BRICK}${fmt(r.lost.bricks)} ${icon('coin')}${fmt(r.lost.coins)}`} · scudo ${r.shieldH} h</div>
        </div></div>
        ${rev ? `<button class="btn sm primary" data-a="ob-revenge" data-id="${r.id}">${icon('burst')} Vendetta · bottino ×${REVENGE_BONUS} · ${fmtDur(r.revenge.until - now)}</button>` : r.revenge.done ? '<div class="ob-why good">Vendetta compiuta</div>' : ''}
      </div>`;
    }).join('')}</div>` : `<div class="ob-empty">${icon('shield')}<b>Nessun attacco, per ora.</b><span>Mentre sei via, altri comandanti possono attaccare la tua base: la simulazione usa le tue difese. Dopo un attacco arriva lo scudo.${progress().lvl < 3 ? ' Gli attacchi iniziano dopo il livello 3 della campagna.' : ''}</span></div>`}`;
}

// ---------------------------------------------------------------- render / update in place
function panelHtml() { return V.tab === 'base' ? basePanel() : V.tab === 'raid' ? raidPanel() : defPanel(); }
// the header ticks every second (raid timer): replace only the parts that changed, so the tab buttons
// are not swapped under a click / keyboard focus
function patchHead(h, html) {
  const t = document.createElement('div'); t.innerHTML = html;
  if (h.children.length !== t.children.length) { h.innerHTML = html; return; }
  [...t.children].forEach((n, i) => { const o = h.children[i]; if (o.outerHTML !== n.outerHTML) o.replaceWith(n); });
}
function update(what = 'all') {
  const root = document.querySelector('.ob'); if (!root) return;
  if (what === 'all' || what === 'head') { const h = root.querySelector('#ob-head'); if (h) patchHead(h, header()); }
  if (what === 'all' || what === 'panel') { const p = root.querySelector('#ob-panel'); if (p) { const sc = p.scrollTop; p.innerHTML = panelHtml(); p.scrollTop = sc; } }
  root.dataset.tab = V.tab;
  syncView();
}
function syncView() {
  const v = V.view; if (!v) return;
  if (V.tab === 'raid' && V.rival) { v.setTheme('red'); v.setLayout(V.rival.layout); v.select(null); v.arm(null); }
  else if (V.tab === 'def') {
    v.setTheme('blue');
    const r = V.st.defense.reports.find((q) => q.id === V.report);
    const dead = []; if (r) { const left = { ...r.destroyed }; for (const b of V.st.layout.b) if (left[b.t] > 0) { left[b.t]--; dead.push(b.id); } }
    v.setLayout(V.st.layout, { destroyed: dead }); v.select(null); v.arm(null);
  } else { v.setTheme('blue'); v.setLayout(V.st.layout); v.select(V.sel); v.arm(V.armed); }
  const cap = document.querySelector('#ob-cap');
  if (cap) cap.innerHTML = V.tab === 'raid' && V.rival ? `<b>${esc(V.rival.name)}</b><span>Anteprima della base rivale · l’orda arriva dal basso</span>` : V.tab === 'def' ? `<b>La tua base</b><span>${V.report ? 'Le macerie mostrano cosa è stato abbattuto (già ricostruito)' : 'Le tue difese'}</span>` : '';
}

// production bubbles over the forge / mine, positioned every frame
function bubbles() {
  const box = document.getElementById('ob-bubbles'), v = V.view; if (!box || !v) return;
  if (V.tab !== 'base') { if (box.childElementCount) box.innerHTML = ''; return; }
  const now = Date.now();
  const prods = V.st.layout.b.filter((b) => BUILDINGS[b.t].kind === 'prod');
  if (box.childElementCount !== prods.length || box.dataset.k !== prods.map((b) => b.id).join(',')) {
    box.dataset.k = prods.map((b) => b.id).join(',');
    box.innerHTML = prods.map((b) => `<button class="ob-bub" data-a="ob-bubble" data-id="${b.id}" aria-label="Raccogli"></button>`).join('');
  }
  prods.forEach((b, i) => {
    const el = box.children[i], n = G.stored(b, now), B = BUILDINGS[b.t];
    const p = v.toScreen(b.x, b.y, 1.25);
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    el.hidden = n < 1;
    el.classList.toggle('full', G.isFull(b, now));
    const txt = `${B.res === 'coins' ? icon('coin') : BRICK}${fmt(n)}`;
    if (el._t !== txt) { el._t = txt; el.innerHTML = txt; }
  });
}

function onTap(c, b) {
  if (V.tab !== 'base') return;
  if (V.armed) { if (!b) { sfx.bad?.(); } else { V.armed = null; V.sel = b.id; sfx.select?.(); update('panel'); } return; }
  if (b && BUILDINGS[b.t].kind === 'prod' && G.stored(b, Date.now()) > 0 && V.sel === b.id) { doCollect(b.id); return; }
  V.sel = b ? b.id : null; if (b) sfx.select?.();
  update('panel');
}
function doPlace(t, x, y) {
  const b = G.build(V.st, t, x, y, progress(), Date.now()); if (!b) { sfx.bad?.(); return; }
  save(); sfx.ok?.();
  // walls are usually laid in rows: stay armed while another one can be built
  if (!(t === 'muro' && G.canBuild(V.st, t, progress()).ok)) { V.armed = null; V.sel = b.id; }
  update();
}
function doMove(id, x, y) { if (G.move(V.st, id, x, y)) { save(); sfx.select?.(); V.sel = id; update('panel'); } }
function doCollect(id) {
  const r = G.collect(V.st, id, Date.now()); if (!r?.n) return;
  save(); sfx.coin?.();
  App.toast(r.res === 'coins' ? `+${r.n} monete` : `+${r.n} mattoni`, r.res === 'coins' ? 'Dalla miniera d’oro' : 'Dalla fornace');
  update();
}

// ---------------------------------------------------------------- drag from the palette onto the grid
function bindPaletteDrag(root) {
  let d = null;
  root.addEventListener('pointerdown', (e) => {
    const card = e.target.closest?.('[data-drag]'); if (!card || V.tab !== 'base' || !V.view) return;
    d = { t: card.dataset.drag, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  });
  const move = (e) => {
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) {
      if (!G.canBuild(V.st, d.t, progress()).ok) { d = null; return; }
      d.moved = true; V.armed = d.t; V.sel = null; V.view.arm(d.t); document.body.classList.add('ob-dragging');
    }
    if (!d.moved) return;
    const c = V.view.cellAt(e.clientX, e.clientY);
    if (c?.inside) { const [ax, ay] = V.view.anchor(c, d.t); V.view.showGhost(d.t, ax, ay, G.fits(V.st.layout, d.t, ax, ay)); } else V.view.showGhost(d.t, null);
  };
  const up = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dd = d; d = null; document.body.classList.remove('ob-dragging');
    if (!dd.moved) return; // a click: handled by the data-a action
    const c = V.view.cellAt(e.clientX, e.clientY);
    V.view.showGhost(dd.t, null);
    if (c?.inside) { const [ax, ay] = V.view.anchor(c, dd.t); if (G.fits(V.st.layout, dd.t, ax, ay)) { V.armed = null; doPlace(dd.t, ax, ay); V._eatClick = true; setTimeout(() => { V._eatClick = false; }, 0); return; } }
    V.armed = null; V.view.arm(null); V._eatClick = true; setTimeout(() => { V._eatClick = false; }, 0); update('panel');
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
}

// ---------------------------------------------------------------- the 3D view
async function startView() {
  const el = document.getElementById('ob-view'); if (!el) return;
  try {
    const { BaseView } = await import('./view3d.js');
    if (!el.isConnected || V.playing) return;
    V.view?.destroy();
    V.view = new BaseView(el, {
      tier: gfxTier(), theme: 'blue', editable: true,
      canPlace: (t, x, y, skip) => V.tab === 'base' && G.fits(V.st.layout, t, x, y, skip ?? null),
      onTap, onPlace: doPlace, onMove: doMove, onFrame: bubbles,
    });
    el.closest('.ob-stage')?.classList.add('ready');
    syncView();
  } catch (e) {
    console.warn('orda base view', e);
    el.innerHTML = `<div class="ob-noview">${icon('alert')} Vista 3D non disponibile su questo dispositivo. Puoi comunque gestire la base dal pannello.</div>`;
  }
}
function stopView() { V.view?.destroy(); V.view = null; }

// ---------------------------------------------------------------- welcome back: offline attacks + production
function welcomeBack(reps, away) {
  if (!reps.length) return;
  const now = Date.now(), pend = G.pending(V.st, now);
  App.modal(`<div class="ob-wb">
    <div class="tiny upper muted" style="letter-spacing:.3em">Mentre eri via · ${fmtDur(away)}</div>
    <h2>${reps.length === 1 ? 'La tua base è stata attaccata' : `${reps.length} attacchi alla tua base`}</h2>
    ${reps.map((r) => `<div class="ob-wb-r ${r.stars ? 'bad' : 'ok'}"><b>${r.stars ? `${'★'.repeat(r.stars)} ${Math.round(r.pct * 100)}% distrutto` : 'Respinto!'}</b>
      <span>${esc(r.attacker.leader)} (${esc(r.attacker.name)}) · ${fmt(r.figures)} figurine · ${ago(r.at, now)}</span>
      <span>${r.stars ? `Persi ${BRICK}${fmt(r.lost.bricks)} ${icon('coin')}${fmt(r.lost.coins)} · scudo ${r.shieldH} h` : `Premio difesa ${BRICK}+${fmt(r.bonus)}`}</span></div>`).join('')}
    ${pend.bricks + pend.coins ? `<p class="muted">Nei depositi ti aspettano ${BRICK}${fmt(pend.bricks)} e ${icon('coin')}${fmt(pend.coins)}.</p>` : ''}
    <div class="row mt16" style="justify-content:flex-end;gap:8px">${reps.some((r) => r.stars) ? `<button class="btn" data-a="wb-rev">${icon('burst')} Vendetta</button>` : ''}<button class="btn" data-a="wb-rep">Rapporto</button><button class="btn primary" data-a="close-modal">Alla base</button></div></div>`,
  { 'wb-rep': () => { App.closeModal(); setTab('def'); }, 'wb-rev': () => { App.closeModal(); const r = reps.find((q) => q.stars); revenge(r.id); } }, 'ob-wb-modal');
}
function returnCheck() {
  const st = V.st, last = st.defense.lastSeen, now = Date.now();
  const reps = checkAttacks(st, progress(), now);
  baseSave(st);
  if (reps.length) { sfx.notify?.(); welcomeBack(reps, now - last); }
  return reps;
}

function setTab(t) {
  V.tab = t; V.armed = null;
  if (t !== 'base') V.sel = null;
  if (t === 'def') { const r = V.st.defense.reports[0]; V.report = V.report || r?.id || null; }
  update();
  if (t === 'def') setTimeout(() => { let ch = false; for (const r of V.st.defense.reports) if (!r.seen) { r.seen = true; ch = true; } if (ch) { save(); update('head'); } }, 1500);
}
function revenge(id) {
  const r = V.st.defense.reports.find((q) => q.id === id); if (!r) return;
  V.tab = 'raid'; V.rival = { ...genRival(r.attacker.seed, r.attacker.diff), kind: 'revenge', rep: r.id, until: r.revenge.until };
  update();
}

// ---------------------------------------------------------------- raids: play with OrdaGame
async function attack() {
  const st = V.st, rv = V.rival; if (!rv || V.playing) return;
  if (!G.tokens(st).n) { sfx.bad?.(); App.toast('Nessuna razzia disponibile', `Ne arriva una nuova ogni ${D_REGEN}.`, 'bad'); return; }
  G.spendToken(st); save();
  const revengeOn = rv.kind === 'revenge';
  const level = layoutToLevel(rv, { revenge: revengeOn });
  V.playing = { rv, level, revenge: revengeOn };
  stopView();
  const ov = document.getElementById('ob-play');
  ov.hidden = false;
  ov.innerHTML = `<div class="ob-play-root or-root" id="ob-play-root"><div class="ob-loading">L’orda si prepara…</div></div><div class="ob-play-over" id="ob-play-over"></div>`;
  const root = document.getElementById('ob-play-root');
  try { music.setMood?.('orda'); } catch {}
  try {
    const load = GAME['../game.js']; if (!load) throw new Error('il gioco Orda non è incluso in questa versione');
    const mod = await load();
    if (!V.playing || !root.isConnected) return;
    const p = ordaLoad(), s = getSettings();
    const g = V.game = new mod.OrdaGame(root, {
      level, mode: 'raid', seed: rv.seed % 100000, players: 1,
      upgrades: p.up, skin: p.skin, cannon: p.cannon, champion: p.champ, champLvl: (p.clv || {})[p.champ] || 0, prevStars: 0,
      tier: gfxTier(), volume: s.sound === false ? 0 : 0.6 * (s.volume ?? 0.5) / 0.5,
      autofire: !!p.opt?.autofire, shake: p.opt?.shake !== false && !document.documentElement.classList.contains('reduce-motion'), numbers: p.opt?.numbers !== false,
      onPause: (on) => {
        const o = document.getElementById('ob-play-over'); if (!o) return;
        o.innerHTML = on ? `<div class="ob-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p>${esc(rv.name)}</p><button class="btn primary" data-a="ob-resume">${icon('play')} Riprendi</button><button class="btn ghost" data-a="ob-retreat">${icon('left')} Ritirata</button></div>` : '';
      },
      onEnd: (r) => raidEnd(r),
    });
    window.__ordaRaid = g;
    await g.start?.();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="ob-loading">Impossibile avviare la razzia: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="ob-raid-back">Torna alla base</button></div>`;
    // the ticket is given back when the game could not even start
    st.raids.tokens = Math.min(RAID_TOKENS, st.raids.tokens + 1); save();
  }
}
// applies a raid result (also used by tests with a fake result) → summary
export function applyRaid(st, rv, level, r, opts = {}) {
  // a base raided again only has what is left in its storage
  const prev = st.raids.done[rv.seed], left = Math.max(0, 1 - (prev?.taken || 0));
  const pct = destroyedPct(r, level), full = raidLoot(rv, pct, opts), stars = raidStars(r);
  const loot = { coins: Math.round(full.coins * left), bricks: Math.round(full.bricks * left) };
  st.bricks += loot.bricks; G.addCoins(st, loot.coins);
  st.stats.raids++; if (r.win) st.stats.raidWins++; st.stats.stars += stars;
  st.stats.looted.coins += loot.coins; st.stats.looted.bricks += loot.bricks;
  st.raids.done[rv.seed] = { pct: Math.max(pct, prev?.pct || 0), stars: Math.max(stars, prev?.stars || 0), taken: Math.min(1, (prev?.taken || 0) + Math.min(1, pct) * left) };
  if (opts.revenge) { const rep = st.defense.reports.find((q) => q.attacker.seed === rv.seed); if (rep) rep.revenge.done = true; st.stats.revenges++; }
  return { pct, loot, stars, win: !!r.win };
}
function raidEnd(r) {
  const P = V.playing; if (!P || P.ended) return; P.ended = true;
  const sum = applyRaid(V.st, P.rv, P.level, r || {}, { revenge: P.revenge });
  save();
  setTimeout(() => {
    const o = document.getElementById('ob-play-over'); if (!o) return;
    o.innerHTML = `<div class="ob-result" role="dialog" aria-label="Esito della razzia"><div class="ob-res-card">
      <div class="ob-res-k">${P.revenge ? 'Vendetta' : 'Razzia'} · ${esc(P.rv.name)}</div>
      <h2>${sum.win ? 'Base rasa al suolo!' : sum.pct >= 0.5 ? 'Razzia riuscita' : sum.pct > 0 ? 'Ritirata' : 'Respinti'}</h2>
      <div class="ob-res-stars">${[1, 2, 3].map((i) => `<i class="${i <= sum.stars ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="ob-res-pct"><div class="ob-bar big"><i style="width:${Math.round(sum.pct * 100)}%"></i></div><b>${Math.round(sum.pct * 100)}%</b> della base distrutta</div>
      <div class="ob-res-loot"><span>${BRICK}<b>+${fmt(sum.loot.bricks)}</b> mattoni</span><span>${icon('coin')}<b>+${fmt(sum.loot.coins)}</b> monete</span></div>
      <div class="ob-res-btns"><button class="btn primary" data-a="ob-raid-back">${icon('home')} Torna alla base</button></div>
    </div></div>`;
    try { sum.win ? sfx.win() : sfx.ok(); } catch {}
    requestAnimationFrame(() => o.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }, 700);
}
function endRaidView() {
  V.game?.destroy?.(); V.game = null; window.__ordaRaid = null; V.playing = null;
  const ov = document.getElementById('ob-play'); if (ov) { ov.hidden = true; ov.innerHTML = ''; }
  update(); startView();
}

// ---------------------------------------------------------------- screen
registerScreen({
  id: 'orda-base', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.tab && ['base', 'raid', 'def'].includes(params.tab)) { V.tab = params.tab; delete params.tab; }
    V.st = V.st || baseLoad();
    return `<div class="full-screen ob" data-tab="${V.tab}">
      <header class="ob-top">
        <button class="btn icon-btn ph-back" data-a="ob-back" aria-label="Indietro">${icon('left')}</button>
        <div class="ob-title"><div class="ob-eye">Orda · ${progress().lvl ? `campagna liv. ${progress().lvl}` : 'inizia la campagna per sbloccare tutto'}</div><h1>Base e razzie</h1></div>
        <div class="ob-head" id="ob-head">${header()}</div>
      </header>
      <div class="ob-body">
        <div class="ob-stage"><div class="ob-view" id="ob-view"></div><div class="ob-bubbles" id="ob-bubbles"></div><div class="ob-cap" id="ob-cap"></div>
          <div class="ob-tools"><button class="btn icon-btn sm ghost" data-a="ob-recenter" aria-label="Ricentra la vista" title="Ricentra">${icon('target')}</button></div></div>
        <aside class="ob-panel" id="ob-panel">${panelHtml()}</aside>
      </div>
      <div class="ob-play" id="ob-play" hidden></div>
    </div>`;
  },
  mount(root) {
    // App.refresh() re-renders without unmount: drop a view whose canvas left the page
    if (V.view && !V.view.el.isConnected) stopView();
    V.st = baseLoad();
    if (V.offDrag) V.offDrag();
    V.offDrag = bindPaletteDrag(root.querySelector('.ob'));
    const first = !V.mounted; V.mounted = true;
    if (first) returnCheck();
    startView();
    clearInterval(V.timer);
    let tick = 0;
    V.timer = setInterval(() => {
      if (App.cur !== 'orda-base' || !V.st) return;
      tick++;
      if (!V.playing) update('head');
      if (V.tab === 'base' && !V.playing && sel() && BUILDINGS[sel().t].kind === 'prod' && tick % 2 === 0) update('panel');
      if (tick % 30 === 0) save(); // heartbeat: you are «around», no attacks
    }, 1000);
    V.onVis = () => {
      if (document.hidden) save();
      else if (!V.playing) { const reps = returnCheck(); if (reps.length) update(); }
    };
    document.addEventListener('visibilitychange', V.onVis);
    V.onKey = (e) => {
      if (App.cur !== 'orda-base' || V.playing || document.querySelector('.modal-wrap')) return;
      if (e.key === 'Escape' && (V.armed || V.sel)) { e.preventDefault(); e.stopPropagation(); V.armed = null; V.sel = null; update('panel'); return; }
      // keyboard: arrows nudge the selected building one cell (row 0 = front = down on screen)
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key], b = sel();
      if (d && b && V.tab === 'base' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
        e.preventDefault(); e.stopPropagation();
        if (G.move(V.st, b.id, b.x + d[0], b.y + d[1])) { save(); V.view?.setLayout(V.st.layout); V.view?.select(b.id); } else sfx.bad?.();
      }
    };
    window.addEventListener('keydown', V.onKey, true);
  },
  unmount() {
    if (V.st) save();
    stopView(); V.game?.destroy?.(); V.game = null; V.playing = null; V.mounted = false;
    clearInterval(V.timer); V.offDrag?.(); V.offDrag = null;
    document.removeEventListener('visibilitychange', V.onVis); window.removeEventListener('keydown', V.onKey, true);
  },
  actions: {
    'ob-back'() { App.go(V.from !== 'launcher' && hasScreen(V.from) ? V.from : 'launcher'); },
    'ob-tab'(el) { setTab(el.dataset.id); sfx.select?.(); },
    'ob-arm'(el) {
      if (V._eatClick) return;
      const t = el.dataset.t, c = G.canBuild(V.st, t, progress());
      if (!c.ok) { sfx.bad?.(); App.toast(BUILDINGS[t].name, c.why, 'bad'); return; }
      V.armed = V.armed === t ? null : t; V.sel = null; update('panel'); V.view?.arm(V.armed);
    },
    'ob-disarm'() { V.armed = null; V.view?.arm(null); update('panel'); },
    'ob-desel'() { V.sel = null; update('panel'); },
    'ob-upgrade'() {
      const b = sel(); if (!b) return;
      const r = G.upgrade(V.st, b.id, progress(), Date.now());
      if (!r) { sfx.bad?.(); return; }
      save(); sfx.levelup?.(); App.toast(`${BUILDINGS[b.t].name} · livello ${r.l}`, '', 'good'); update();
    },
    'ob-demolish'() {
      const b = sel(); if (!b) return;
      App.confirm(`Demolire ${BUILDINGS[b.t].name}?`, 'Riavrai metà dei mattoni spesi. Le monete non tornano indietro.', () => { const n = G.demolish(V.st, b.id); V.sel = null; save(); App.toast('Demolito', `+${n} mattoni`); update(); }, 'Demolisci', true);
    },
    'ob-collect'() { const b = sel(); if (b) doCollect(b.id); },
    'ob-bubble'(el) { doCollect(+el.dataset.id); },
    'ob-collect-all'() { const g = G.collectAll(V.st, Date.now()); if (!g.coins && !g.bricks) return; save(); sfx.coin?.(); App.toast('Raccolto!', `${g.bricks ? `+${g.bricks} mattoni ` : ''}${g.coins ? `+${g.coins} monete` : ''}`, 'good'); update(); },
    'ob-recenter'() { V.view?.resetView(); },
    'ob-rival'(el) { const s = +el.dataset.seed; const r = rivalsNow().find((q) => q.seed === s); if (r) { V.rival = r; sfx.select?.(); update('panel'); syncView(); } },
    'ob-reroll'() {
      const st = V.st, now = Date.now(), free = now - st.raids.listAt >= RIVAL_REFRESH_H * HOUR;
      const go = () => { st.raids.listN++; st.raids.listAt = now; st.raids.done = {}; V.rival = null; save(); update(); };
      if (free) { go(); return; }
      if (G.coinsOf(st) < RIVAL_REROLL_COINS) { sfx.bad?.(); App.toast('Monete insufficienti', `Servono ${RIVAL_REROLL_COINS} monete, oppure aspetta ${fmtDur(st.raids.listAt + RIVAL_REFRESH_H * HOUR - now)}.`, 'bad'); return; }
      App.confirm('Nuovi rivali?', `Costa ${RIVAL_REROLL_COINS} monete. Gratis tra ${fmtDur(st.raids.listAt + RIVAL_REFRESH_H * HOUR - now)}.`, () => { G.addCoins(st, -RIVAL_REROLL_COINS); go(); });
    },
    'ob-attack'() { attack(); },
    'ob-report'(el, e) { if (e?.target?.closest('[data-a="ob-revenge"]')) return; V.report = el.dataset.id; update('panel'); syncView(); },
    'ob-revenge'(el) { revenge(el.dataset.id); },
    'ob-resume'() { V.game?.togglePause?.(false); },
    'ob-retreat'() {
      // retreat: the damage done so far counts
      const g = V.game; let r = null;
      try { r = g?.result || g?.sim?.result?.() || null; } catch {}
      raidEnd({ ...(r || {}), win: false });
      V.game?.destroy?.(); V.game = null;
    },
    'ob-raid-back'() { endRaidView(); },
  },
});

// test / dev hook
window.__ordaBase = { V, G, progress, applyRaid, layoutToLevel, genRival, update, setTab };
export { gateLabel };
