// Orda — menu (play next level, world map, upgrades, champions, options), the live game, pause and
// results. Extensible: other modules append tabs (ORDA_TABS / addOrdaTab), play modes shown on the
// home tab (ORDA_MODES / addOrdaMode), actions (ORDA_ACTIONS) and start any level JSON with playOrda().
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { ordaLoad, ordaSave, ordaStars } from '../orda/store.js';
import { LEVELS, levelById, bonusLevel, MAIN_LEVELS } from '../orda/levels.js';
import { UPGRADES, upCost, upEffects, CHAMPIONS, CHAMP_MAX, champCost, champById, SKINS, CANNONS, WORLDS, WORLD_STARS, CHEST_EVERY, LOGIN_REWARDS, rollChest, openChest, catchUp } from '../orda/meta.js';
import '../orda/orda.css';
import '../orda/hooks.css';
import { registerOrdaModes } from '../orda/modes-entries.js';
import { baseDesc, baseSummary } from '../orda/base/badge.js';

const V = { playing: false, game: null, from: 'launcher', tab: 'gioca', run: null, result: null };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const CH_ICON = { colosso: '💪', grillo: '🦗', matrioska: '🪆', testuggine: '🛡️' };
const starRow = (n, max = 3) => `<span class="or-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
const nextLevel = (p) => levelById(Math.min(p.next, p.next > MAIN_LEVELS && worldOpen(p, 6) ? LEVELS.length : MAIN_LEVELS)) || LEVELS[0];
// a world opens when the one before is cleared AND enough stars were collected (WORLD_STARS)
const worldOpen = (p, w) => ordaStars(p) >= (WORLD_STARS[w] || 0);
const unlocked = (p, l) => l.id <= p.next && worldOpen(p, l.world);
const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); };
// daily login calendar: claimable today? which day of the 7 is it?
function loginState(p) {
  const L = p.login || { last: '', day: -1 }, today = todayKey();
  if (L.last === today) return { claimable: false, day: L.day };
  const day = L.last === yesterdayKey() ? (L.day + 1) % LOGIN_REWARDS.length : 0;
  return { claimable: true, day };
}
// the closest thing to unlock: a champion, a world, a star cosmetic → { icon, name, how, f (0..1) }
function nextUnlock(p) {
  const stars = ordaStars(p), cleared = Math.min(p.next - 1, LEVELS.length), out = [];
  for (const C of CHAMPIONS) if (C.unlock && !p.champs.includes(C.id)) out.push({ icon: CH_ICON[C.id], name: C.name, how: `supera il livello ${C.unlock}`, f: cleared / C.unlock });
  WORLD_STARS.forEach((n, w) => { if (n > stars && WORLDS[w]) out.push({ icon: '🌍', name: WORLDS[w].name, how: `★ ${stars}/${n}`, f: stars / n }); });
  for (const s of [...SKINS, ...CANNONS]) if (s.stars && s.stars > stars) out.push({ icon: '🎨', name: s.name, how: `★ ${stars}/${s.stars}`, f: stars / s.stars });
  return out.sort((a, b) => b.f - a.f)[0] || null;
}
const unlockBar = (p) => { const u = nextUnlock(p); return u ? `<div class="or-unl"><span class="or-unl-ic">${u.icon}</span><div><div class="or-k">Prossimo sblocco</div><b>${esc(u.name)}</b><div class="or-unl-bar"><i style="width:${Math.round(Math.min(1, u.f) * 100)}%"></i></div><small>${esc(u.how)}</small></div></div>` : ''; };
const chestBar = (p) => `<div class="or-unl or-chestbar"><span class="or-unl-ic">🎁</span><div><div class="or-k">Forziere</div><b>${p.chests ? `${p.chests} da aprire!` : `${p.chestN || 0} / ${CHEST_EVERY} livelli`}</b><div class="or-unl-bar"><i style="width:${p.chests ? 100 : Math.round(((p.chestN || 0) / CHEST_EVERY) * 100)}%"></i></div>${p.chests ? `<button class="btn primary" data-a="or-chest">Apri</button>` : '<small>un premio ogni 3 livelli nuovi</small>'}</div></div>`;
function loginCard(p) {
  const L = loginState(p);
  return `<section class="or-card or-login ${L.claimable ? 'can' : ''}"><div class="or-k">Premio di ogni giorno</div><div class="or-cal">${LOGIN_REWARDS.map((r, i) => {
    const done = L.claimable ? i < L.day : i <= L.day, today = L.claimable && i === L.day;
    return `<div class="${done ? 'done' : ''} ${today ? 'today' : ''}"><small>G${i + 1}</small><b>${r.chest ? '🎁' : '🪙'}</b><span>${r.coins ? r.coins : ''}${r.coins && r.chest ? '+🎁' : r.chest ? 'forziere' : ''}</span></div>`;
  }).join('')}</div>${L.claimable ? `<button class="btn primary" data-a="or-login">${icon('coin')} Riscuoti il premio di oggi</button>` : '<span class="or-login-ok">Torna domani per il prossimo premio!</span>'}</section>`;
}

// ───────── extension registries
// a play mode on the home tab: { id, name, icon, desc, tag?, when?(p), go() } — go() usually calls
// playOrda({ level, mode, onEnd }) or navigates to its own tab
export const ORDA_MODES = [];
export function addOrdaMode(m) { if (!ORDA_MODES.some((x) => x.id === m.id)) ORDA_MODES.push(m); }
// called after every match played from this screen: fn(result, run) — e.g. missions bookkeeping
export const ORDA_END_HOOKS = [];
// Orda · 2 giocatori: local versus / co-op, its own screen (src/screens/orda-versus.js)
addOrdaMode({ id: 'versus', name: '2 giocatori', icon: 'users', tag: 'Locale', desc: 'Sfida o cooperativa sullo stesso schermo: tastiera, due controller o touch.', go: () => App.go('orda-versus', { from: 'orda' }) });
// a menu tab: { id, name, icon, render(p) → html, mount?(p) }; `before` puts it ahead of another tab
export const ORDA_TABS = [];
export function addOrdaTab(t, before = 'opzioni') { if (ORDA_TABS.some((x) => x.id === t.id)) return; const i = ORDA_TABS.findIndex((x) => x.id === before); if (i < 0) ORDA_TABS.push(t); else ORDA_TABS.splice(i, 0, t); }
// start a game with any level object (campaign, generated, raid…). onEnd(result, store) may return
// extra html for the results card; return value false skips the campaign bookkeeping.
// Base e razzie (src/orda/base): its own screen, listed with the other modes
addOrdaMode({ id: 'base', name: 'Base e razzie', icon: 'home', desc: () => baseDesc(), get tag() { return baseSummary().unread ? 'Attaccata!' : ''; }, go: () => App.go('orda-base', { from: 'orda' }) });
export function playOrda({ level, mode = 'level', onEnd = null, label = '', seed } = {}) {
  V.run = { level, mode, onEnd, label, seed }; V.playing = true; V.result = null;
  if (App.cur === 'orda') App.refresh(); else App.go('orda', { from: V.from || 'launcher' });
}

// ───────── tabs
function homeTab(p) {
  const l = nextLevel(p), w = WORLDS[l.world], done = p.next > LEVELS.length;
  const C = champById(p.champ);
  const modes = ORDA_MODES.filter((m) => !m.when || m.when(p));
  const lockedW = !done && !worldOpen(p, l.world);
  return `<div class="or-home">
    <section class="or-hero" style="--sky:${w.sky};--gr:${w.ground};--rim:${w.rim}">
      <div class="or-hero-art" aria-hidden="true"><div class="or-hero-base"></div>${Array.from({ length: 16 }, (_, i) => { const red = i % 5 === 4; return `<i class="or-bean ${red ? 'r' : ''}" style="--i:${i};left:${(red ? 40 : 34) + ((i * 37) % (red ? 20 : 32))}%;${red ? `top:${44 + (i % 3) * 5}%` : `bottom:${4 + ((i * 13) % 30)}%`}"></i>`; }).join('')}<div class="or-hero-gate">×${l.gates.find((g) => g.type === 'mul')?.value || 2}</div></div>
      <div class="or-hero-body">
        <div class="or-k">${esc(w.name)} · Livello ${l.id}${l.base.boss ? ' · <b>Fortezza</b>' : ''}</div>
        <h2>${done ? 'Campagna completata!' : esc(l.name)}</h2>
        <p>${done ? 'Hai espugnato tutte le fortezze. Rigioca i livelli per le stelle mancanti, potenzia l’orda e prova le altre modalità.' : esc(l.tip || w.sub)}</p>
        <div class="or-hero-row">${starRow(p.stars[l.id] || 0)}<span>${l.time}s · ${l.gates.length} porte${l.obstacles.length ? ` · ${l.obstacles.length} trappole` : ''}${l.base.towers.length ? ` · ${l.base.towers.length} torri` : ''}</span></div>
        ${lockedW ? `<p class="or-need">🔒 Per entrare in <b>${esc(w.name)}</b> servono <b>★ ${WORLD_STARS[l.world]}</b> (ne hai ${ordaStars(p)}): rigioca i livelli per le stelle mancanti.</p><button class="btn primary big" data-a="or-tab" data-id="livelli">${icon('map')} Livelli</button>`
          : `<button class="btn primary big" data-a="or-play" data-id="${l.id}">${icon('play')} ${done ? 'Rigioca' : 'Gioca'} livello ${l.id}</button>`}
        ${p.bonus ? `<button class="btn big or-bonus-btn" data-a="or-bonus">🎁 Livello bonus!</button>` : ''}
      </div>
    </section>
    <div class="or-home-row or-hooks">${unlockBar(p)}${chestBar(p)}</div>
    ${loginCard(p)}
    <div class="or-home-row">
      <section class="or-card or-champ-now" data-a="or-tab" data-id="campioni" tabindex="0" style="--c:${C.color}"><div class="or-cface">${CH_ICON[C.id]}</div><div><div class="or-k">Campione nel cannone</div><b>${esc(C.name)}</b><span>${esc(C.role)} · livello ${(p.clv[C.id] || 0) + 1}</span></div></section>
      <section class="or-card" data-a="or-tab" data-id="potenziamenti" tabindex="0"><div class="or-k">Potenziamenti</div><b>${UPGRADES.reduce((a, u) => a + (p.up[u.id] || 0), 0)} / ${UPGRADES.reduce((a, u) => a + u.max, 0)}</b><span>Cadenza ${upEffects(p.up).rate.toFixed(1)}/s · ${upEffects(p.up).shot.toFixed(1)} per colpo</span></section>
      <section class="or-card" data-a="or-tab" data-id="livelli" tabindex="0"><div class="or-k">Stelle</div><b>★ ${ordaStars(p)} / ${LEVELS.length * 3}</b><span>${Math.min(p.next - 1, LEVELS.length)} livelli superati su ${LEVELS.length}</span></section>
    </div>
    ${modes.length ? `<h3 class="or-h">Altre modalità</h3><div class="or-modes">${modes.map((m) => `<div class="or-mode" data-a="or-mode" data-id="${esc(m.id)}" tabindex="0">${icon(m.icon || 'star')}<div><b>${esc(m.name)}</b>${m.tag ? `<em>${esc(m.tag)}</em>` : ''}<span>${typeof m.desc === 'function' ? m.desc(p) : esc(m.desc || '')}</span></div></div>`).join('')}</div>` : ''}
    <h3 class="or-h">Come si gioca</h3>
    <div class="or-how">
      <div><b>🎯 Mira</b><span>Trascina (o muovi il mouse / <span class="kbd">←</span><span class="kbd">→</span>) per spostare il cannone; tieni premuto o <span class="kbd">Spazio</span> per sparare.</span></div>
      <div><b>✖️ Porte</b><span>Ogni figura che passa da una porta viene moltiplicata, una volta sola. Le porte rosse tolgono o dimezzano.</span></div>
      <div><b>⚔️ Scontri</b><span>Un blu e un rosso che si toccano spariscono insieme. Non farti travolgere il cannone!</span></div>
      <div><b>⭐ Campione</b><span>Quando la barra è piena premi il pulsante (o <span class="kbd">E</span>): un gigante che spiana i rossi e colpisce la base.</span></div>
    </div>
  </div>`;
}
function mapTab(p) {
  return `<div class="or-map">${WORLDS.map((w, wi) => {
    const lv = LEVELS.filter((l) => l.world === wi);
    if (!lv.length) return '';
    const open = unlocked(p, lv[0]), got = lv.reduce((a, l) => a + (p.stars[l.id] || 0), 0), need = WORLD_STARS[wi] || 0, starLock = !worldOpen(p, wi);
    return `<section class="or-world ${open ? '' : 'locked'}" style="--sky:${w.sky};--gr:${w.ground};--gr2:${w.ground2};--rim:${w.rim}">
      <div class="or-world-h"><div><div class="or-k">Mondo ${wi + 1}${wi >= 6 ? ' · segreto' : ''}</div><b>${esc(w.name)}</b><span>${esc(w.sub)}</span></div><em>${starLock ? `🔒 ★ ${ordaStars(p)}/${need}` : `★ ${got}/${lv.length * 3}`}</em></div>
      <div class="or-path">${lv.map((l, i) => { const st = p.stars[l.id] || 0, on = unlocked(p, l), cur = l.id === p.next; return `<button class="or-node ${l.base.boss ? 'boss' : ''} ${on ? '' : 'locked'} ${cur ? 'cur' : ''} ${st ? 'done' : ''}" style="--i:${i}" data-a="or-play" data-id="${l.id}" ${on ? '' : 'aria-disabled="true"'} title="${esc(l.name)}"><i>${on ? (l.base.boss ? '👑' : l.id) : '🔒'}</i><small>${esc(l.name)}</small>${starRow(st)}</button>`; }).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}
function shopTab(p) {
  const E = upEffects(p.up);
  return `<div class="or-shop">
    <div class="or-ups">${UPGRADES.map((u) => {
      const l = p.up[u.id] || 0, max = l >= u.max, c = upCost(u, l);
      return `<div class="or-up ${max ? 'max' : ''}"><div class="or-up-h">${icon(u.icon)}<b>${esc(u.name)}</b><em>Liv. ${l}/${u.max}</em></div><p>${esc(u.desc)}</p>
        <div class="or-pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
        <div class="or-up-v">${u.fmt(E[u.id])}${max ? '' : ` → <b>${u.fmt(u.eff(l + 1))}</b>`}</div>
        <button class="btn ${max ? 'ghost' : p.coins >= c ? 'primary' : ''}" data-a="or-buy" data-id="${u.id}" ${max ? 'disabled' : ''}>${max ? 'Al massimo' : `${icon('coin')} ${fmt(c)}`}</button></div>`;
    }).join('')}</div>
    <h3 class="or-h">Colori dell’orda</h3>
    <div class="or-skins">${SKINS.map((s) => { const own = p.skins.includes(s.id), lock = s.stars ? `★ ${s.stars}` : `${icon('coin')} ${s.cost}`; return `<div class="or-skin ${p.skin === s.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="or-skin" data-id="${s.id}" tabindex="0"><i class="or-bean big" style="--b:${s.css || s.color}"></i><b>${esc(s.name)}</b><span>${own ? (p.skin === s.id ? 'In uso' : 'Tuo') : lock}</span></div>`; }).join('')}</div>
    <h3 class="or-h">Cannone</h3>
    <div class="or-skins">${CANNONS.map((s) => { const own = p.cannons.includes(s.id), lock = s.stars ? `★ ${s.stars}` : `${icon('coin')} ${s.cost}`; return `<div class="or-skin ${p.cannon === s.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="or-cannon" data-id="${s.id}" tabindex="0"><i class="or-can-ic" style="--b:${s.body};--t:${s.trim};--br:${s.barrel}"></i><b>${esc(s.name)}</b><span>${own ? (p.cannon === s.id ? 'In uso' : 'Tuo') : lock}</span></div>`; }).join('')}</div>
  </div>`;
}
function champTab(p) {
  return `<div class="or-champs">${CHAMPIONS.map((C) => {
    const own = p.champs.includes(C.id), l = p.clv[C.id] || 0, st = C.stats(l), nx = l < CHAMP_MAX - 1 ? C.stats(l + 1) : null, cost = champCost(l);
    const lines = [['Resistenza', st.hp, nx?.hp], ['Danno alla base', st.dmg, nx?.dmg], ...(st.split ? [['Figure alla base', st.split, nx?.split]] : []), ...(st.slam ? [['Onda d’urto', `${st.slam.toFixed(1)} m`, nx && `${nx.slam.toFixed(1)} m`]] : []), ...(st.aura ? [['Cupola', `${st.aura.toFixed(1)} m`, nx && `${nx.aura.toFixed(1)} m`]] : [])];
    return `<section class="or-champ-card ${own ? '' : 'locked'} ${p.champ === C.id ? 'on' : ''}" style="--c:${C.color}">
      <div class="or-cface big">${own ? CH_ICON[C.id] : '🔒'}</div>
      <div class="or-k">${esc(C.role)}</div><h3>${esc(C.name)}</h3><p>${esc(C.desc)}</p>
      ${own ? `<ul>${lines.map(([k, v, n]) => `<li><span>${k}</span><b>${v}${n != null && n !== v ? ` <em>→ ${n}</em>` : ''}</b></li>`).join('')}</ul>
        <div class="or-champ-btns"><button class="btn ${p.champ === C.id ? 'ghost' : 'primary'}" data-a="or-champ" data-id="${C.id}">${p.champ === C.id ? `${icon('check')} Nel cannone` : 'Scegli'}</button>
        <button class="btn" data-a="or-champ-up" data-id="${C.id}" ${l >= CHAMP_MAX - 1 ? 'disabled' : ''}>${l >= CHAMP_MAX - 1 ? 'Livello massimo' : `Liv. ${l + 2} · ${icon('coin')} ${fmt(cost)}`}</button></div>`
      : `<div class="or-lock">Si sblocca espugnando la fortezza del livello ${C.unlock}</div>`}
    </section>`;
  }).join('')}</div>`;
}
function optTab(p) {
  const tog = (k, name, desc) => `<label class="or-opt"><input type="checkbox" data-a="or-opt" data-k="${k}" ${p.opt[k] ? 'checked' : ''}><div><b>${name}</b><span>${desc}</span></div></label>`;
  return `<div class="or-opts">
    ${tog('autofire', 'Fuoco automatico', 'Il cannone spara sempre: devi solo mirare. Comodo su telefono.')}
    ${tog('shake', 'Scossoni dello schermo', 'La visuale trema negli impatti e nei crolli.')}
    ${tog('numbers', 'Numeri a comparsa', 'Mostra +N sulle porte e i danni sulla base.')}
    ${tog('autonext', 'Livello successivo automatico', 'Dopo una vittoria il livello dopo parte da solo in pochi secondi (tocca lo schermo per fermarlo).')}
    <div class="or-opt-row"><button class="btn" data-a="nav" data-to="settings" data-back="orda">${icon('settings')} Audio, grafica e comandi</button><button class="btn ghost" data-a="or-reset">${icon('trash')} Azzera i progressi di Orda</button></div>
    <p class="or-note">Orda è un gioco originale: niente pubblicità, niente acquisti. Le monete si guadagnano solo giocando.</p>
  </div>`;
}
ORDA_TABS.push(
  { id: 'gioca', name: 'Gioca', icon: 'play', render: homeTab },
  { id: 'livelli', name: 'Livelli', icon: 'map', render: mapTab },
  { id: 'potenziamenti', name: 'Potenziamenti', icon: 'wrench', render: shopTab },
  { id: 'campioni', name: 'Campioni', icon: 'trophy', render: champTab },
  { id: 'opzioni', name: 'Opzioni', icon: 'sliders', render: optTab },
);

function menu(p) {
  const tab = ORDA_TABS.find((t) => t.id === V.tab) || ORDA_TABS[0];
  return `<div class="full-screen or-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Arcade', title: 'Orda', sub: 'Spara la tua orda di fagiolini blu, moltiplicala nelle porte e travolgi la fortezza rossa.', right: `<div class="or-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">★ ${ordaStars(p)} · ${p.wins} vittorie · ${fmt(p.sent)} figure sparate</div></div>` })}
    <nav class="or-tabs" role="tablist">${ORDA_TABS.map((t) => `<button role="tab" aria-selected="${t.id === tab.id}" class="${t.id === tab.id ? 'on' : ''}" data-a="or-tab" data-id="${t.id}">${icon(t.icon)}<span>${esc(t.name)}</span>${t.id === 'potenziamenti' && canBuy(p) ? `<em class="or-badge" title="Potenziamenti alla tua portata">${canBuy(p)}</em>` : ''}</button>`).join('')}</nav>
    <div class="or-body">${tab.render(p)}</div>
  </div>`;
}

// how many upgrades the wallet can pay for right now (badge on the tab, hint after a defeat)
const canBuy = (p) => UPGRADES.filter((u) => (p.up[u.id] || 0) < u.max && upCost(u, p.up[u.id] || 0) <= p.coins).length;
function results(r, p, extra = '') {
  const L = V.run?.level, campaign = V.run?.mode === 'level';
  let nx = campaign && r.win ? levelById((L?.id || 0) + 1) : null;
  if (nx && !unlocked(p, nx)) nx = null;
  const title = r.bonus ? 'Caveau svaligiato!' : r.win ? (L?.base?.boss ? 'Fortezza espugnata!' : 'Vittoria!') : r.why === 'time' ? 'Tempo scaduto' : 'Cannone travolto';
  return `<div class="or-res" role="dialog" aria-label="Risultati">
    <div class="or-res-card ${r.win ? 'win' : 'lose'}">
      <div class="or-k">${campaign ? `Livello ${L.id} · ${esc(L.name)}` : esc(V.run?.label || L?.name || '')}</div>
      <h2>${title}</h2>
      ${r.bonus ? `<p class="or-res-why">La tua orda ha portato <b>${fmt(r.baseDmg)}</b> figure nel caveau.</p>` : r.win ? `<div class="or-res-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}" style="--d:${i * 0.25}s">★</i>`).join('')}</div>` : `<p class="or-res-why">${r.why === 'time' ? 'La base ha resistito: prova una porta diversa o potenzia la cadenza.' : 'Troppi rossi hanno raggiunto il cannone: spostati per intercettarli.'}</p>`}
      ${r.win && L?.stars && !r.bonus ? `<ul class="or-res-goals"><li class="on">★ Base distrutta</li><li class="${r.timeMs / 1000 <= L.stars.par ? 'on' : ''}">★ Entro ${L.stars.par}s <em>${(r.timeMs / 1000).toFixed(0)}s</em></li><li class="${r.left >= L.stars.crowd ? 'on' : ''}">★ Orda finale ≥ ${L.stars.crowd} <em>${fmt(r.left)}</em></li></ul>` : ''}
      <div class="or-res-stats">
        <div><b>${fmt(r.figuresSent)}</b><span>sparate</span></div>
        <div><b>${fmt(r.cloned || 0)}</b><span>dalle porte</span></div>
        <div><b>${fmt(r.kills)}</b><span>rossi battuti</span></div>
        <div><b>${r.champions}</b><span>campioni</span></div>
        <div class="or-res-coins"><b data-count="${r.coins}">+0</b><span>monete</span></div>
      </div>
      ${campaign && !r.win && catchUp(p.up, L.id, p.fails?.[L.id]) ? `<div class="or-res-unl or-res-spinta">💪 Al prossimo tentativo l’orda ti dà una <b>spinta</b>: +${catchUp(p.up, L.id, p.fails[L.id]).levels} livelli di potenziamento per questo livello.</div>` : ''}
      ${r.combo >= 2 ? `<div class="or-res-combo">🔥 Valanga x${r.combo}: +${(r.combo - 1) * 10}% monete</div>` : ''}
      ${p.chests ? `<button class="or-res-chest" data-a="or-chest">🎁 <b>Forziere!</b> <span>Tocca per aprirlo</span></button>` : ''}
      ${p.bonus && r.win ? `<button class="or-res-chest or-res-bonus" data-a="or-bonus">💰 <b>Livello bonus!</b> <span>Solo porte, monete a pioggia</span></button>` : ''}
      <div class="or-res-hooks">${unlockBar(p)}${p.chests ? '' : chestBar(p)}</div>
      ${r.unlock ? `<div class="or-res-unl">${CH_ICON[r.unlock.id]} Nuovo campione: <b>${esc(r.unlock.name)}</b> (${esc(r.unlock.role)})</div>` : ''}
      ${r.world ? `<div class="or-res-unl">🌍 Nuovo mondo: <b>${esc(r.world)}</b></div>` : ''}
      ${extra}
      <div class="or-res-btns">
        ${nx ? `<button class="btn primary or-next" data-a="or-play" data-id="${nx.id}">${icon('play')} Livello ${nx.id} <em class="or-auto"></em></button>` : ''}
        ${r.bonus ? "" : `<button class="btn ${nx ? "" : "primary"}" data-a="or-again">${icon("replay")} ${r.win ? "Rigioca" : "Riprova"}</button>`}
        ${!r.win || canBuy(p) ? `<button class="btn" data-a="or-shop">${icon('wrench')} Potenziamenti${canBuy(p) ? ` <em class="or-badge">${canBuy(p)}</em>` : ''}</button>` : ''}
        <button class="btn ${r.bonus ? "primary" : "ghost"}" data-a="or-back">${icon("map")} Menu Orda</button>
      </div>
    </div>
  </div>`;
}

// campaign bookkeeping after a game
function record(r, run) {
  const st = ordaLoad();
  st.games++; st.sent += r.figuresSent; st.kills += r.kills; st.coins += r.coins;
  if (r.win) st.wins++;
  if (run.mode === 'bonus') st.bonus = Math.max(0, (st.bonus || 0) - 1);
  // losses in a row on a campaign level feed the catch-up boost (meta.js catchUp); a win clears them
  if (run.mode === 'level' && run.level.id && !r.quit) { if (r.win) delete st.fails[run.level.id]; else st.fails[run.level.id] = (st.fails[run.level.id] || 0) + 1; }
  if (run.mode === 'level' && r.win && run.level.id) {
    const id = run.level.id;
    if (!st.stars[id]) { // a new level: towards the next chest and the next bonus level
      st.chestN = (st.chestN || 0) + 1; if (st.chestN >= CHEST_EVERY) { st.chestN = 0; st.chests = (st.chests || 0) + 1; }
      st.bonusN = (st.bonusN || 0) + 1; if (st.bonusN >= 4) { st.bonusN = 0; st.bonus = (st.bonus || 0) + 1; }
    }
    const before = ordaStars(st);
    st.stars[id] = Math.max(st.stars[id] || 0, r.stars);
    WORLD_STARS.forEach((n, w) => { if (before < n && ordaStars(st) >= n && w > 0 && LEVELS.some((l) => l.world === w)) r.world = WORLDS[w].name; });
    st.best[id] = Math.min(st.best[id] || 1e9, +(r.timeMs / 1000).toFixed(1));
    st.next = Math.max(st.next, id + 1);
    for (const C of CHAMPIONS) if (C.unlock && C.unlock <= id && !st.champs.includes(C.id)) { st.champs.push(C.id); st.clv[C.id] = 0; r.unlock = C; }
  }
  // star-gated cosmetics
  const stars = ordaStars(st);
  for (const s of SKINS) if (s.stars && stars >= s.stars && !st.skins.includes(s.id)) st.skins.push(s.id);
  for (const s of CANNONS) if (s.stars && stars >= s.stars && !st.cannons.includes(s.id)) st.cannons.push(s.id);
  ordaSave(st);
  return st;
}

// results: the coins count up; after a win the next level starts by itself (option, any tap stops it)
function resultsFx(ov, st) {
  const c = ov.querySelector('[data-count]');
  if (c) { const n = +c.dataset.count, t0 = performance.now(); const tick = () => { const f = Math.min(1, (performance.now() - t0) / 700); c.textContent = `+${fmt(n * f)}`; if (f < 1 && c.isConnected) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  const nx = ov.querySelector('.or-next');
  clearInterval(V.autoT);
  if (!nx || !st.opt.autonext || st.chests || V.run?.mode !== 'level') return;
  let left = 4; const lab = nx.querySelector('.or-auto'); lab.textContent = `(${left})`;
  const stop = () => { clearInterval(V.autoT); lab.textContent = ''; ov.removeEventListener('pointerdown', stop, true); window.removeEventListener('keydown', stop, true); };
  V.autoT = setInterval(() => { left--; if (!nx.isConnected) return stop(); if (left <= 0) { stop(); nx.click(); } else lab.textContent = `(${left})`; }, 1000);
  setTimeout(() => { ov.addEventListener('pointerdown', stop, true); window.addEventListener('keydown', stop, true); }, 300);
}
function stopGame() { clearInterval(V.autoT); V.game?.destroy(); V.game = null; if (window.__orda) window.__orda.game = null; }
function startLevel(id) {
  const l = levelById(+id); if (!l) return;
  const p = ordaLoad(); if (!unlocked(p, l)) { sfx.bad?.(); App.toast('Livello bloccato', l.id <= p.next ? `Per «${WORLDS[l.world].name}» servono ★ ${WORLD_STARS[l.world]} (ne hai ${ordaStars(p)}).` : `Supera il livello ${p.next} per proseguire.`, 'bad'); return; }
  playOrda({ level: l, mode: 'level' });
}

registerScreen({
  id: 'orda', full: true,
  render(params) {
    if (params?.from) V.from = params.from; else if (params?.to === 'orda') V.from = 'launcher';
    if (params?.tab) { V.tab = params.tab; delete params.tab; }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; const p = ordaLoad(); V.run = { level: nextLevel(p), mode: 'level' }; V.playing = true; }
    if (params?.level && !V.playing) { const l = levelById(+params.level); delete params.level; if (l) { V.run = { level: l, mode: 'level' }; V.playing = true; } }
    if (V.playing) return `<div class="or-stage"><div class="or-root" id="or-root"><div class="or-loading">L’orda si prepara…</div></div><div class="or-over" id="or-over"></div></div>`;
    return menu(ordaLoad());
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => (document.querySelector('.or-hero .btn') || document.querySelector('.or-tabs .on'))?.focus({ preventScroll: true })); ORDA_TABS.find((t) => t.id === V.tab)?.mount?.(ordaLoad()); return; }
    const root = document.getElementById('or-root');
    const p = ordaLoad(), run = V.run;
    try { music.setMood?.('orda'); } catch {}
    const { OrdaGame } = await import('../orda/game.js');
    if (!V.playing || !root.isConnected) return;
    const s = getSettings();
    // a player stuck on a campaign level far below the upgrade curve gets a temporary boost
    const cu = run.mode === 'level' ? catchUp(p.up, run.level.id, p.fails?.[run.level.id]) : null;
    const g = V.game = new OrdaGame(root, {
      level: run.level, mode: run.mode, seed: run.seed, label: cu ? `Livello ${run.level.id} · 💪 spinta +${cu.levels}` : run.label, upgrades: cu ? cu.up : p.up, skin: p.skin, cannon: p.cannon, champion: p.champ, champLvl: p.clv[p.champ] || 0,
      prevStars: run.mode === 'level' ? p.stars[run.level.id] || 0 : 0,
      onRestart: () => { stopGame(); V.playing = true; App.refresh(); },
      tier: gfxTier(), volume: s.sound === false ? 0 : 0.6 * (s.volume ?? 0.5) / 0.5, autofire: p.opt.autofire, shake: p.opt.shake && !document.documentElement.classList.contains('reduce-motion'), numbers: p.opt.numbers,
      onPause: (on) => {
        const ov = document.getElementById('or-over'); if (!ov) return;
        const L = run.level;
        ov.innerHTML = on ? `<div class="or-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><div class="or-k">${run.mode === 'level' ? `Livello ${L.id} · ` : ''}${esc(L.name || '')}</div>
          ${L.stars ? `<ul class="or-res-goals"><li class="on">★ Distruggi la base</li><li>★ Entro ${L.stars.par}s</li><li>★ Orda finale ≥ ${L.stars.crowd}</li></ul>` : ''}
          <button class="btn primary" data-a="or-resume">${icon('play')} Riprendi</button><button class="btn" data-a="or-again">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="or-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        let extra = '';
        let st;
        const ret = run.onEnd ? run.onEnd(r, ordaLoad()) : undefined;
        if (ret === false) st = ordaLoad(); else { st = record(r, run); if (typeof ret === 'string') extra = ret; }
        V.result = r;
        for (const f of ORDA_END_HOOKS) { try { f(r, run); } catch (e) { console.warn(e); } }
        const ov = document.getElementById('or-over'); if (!ov || !V.playing) return;
        ov.innerHTML = results(r, st, extra);
        try { r.win ? sfx.win() : sfx.bad?.(); if (r.unlock || r.world) setTimeout(() => sfx.levelup?.(), 700); } catch {}
        requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
        resultsFx(ov, st);
      },
    });
    window.__orda = Object.assign(window.__orda || {}, { game: g });
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="or-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="or-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; },
  actions: ORDA_ACTIONS(),
});

// actions live in one object so other modules can add their own (ORDA_ACTIONS().myAction = …)
function ORDA_ACTIONS() {
  if (ORDA_ACTIONS.o) return ORDA_ACTIONS.o;
  const refresh = () => App.refresh();
  return (ORDA_ACTIONS.o = {
    'or-tab'(el) { V.tab = el.dataset.id; sfx.click?.(); refresh(); },
    'or-play'(el) { if (el.getAttribute('aria-disabled')) { startLevel(el.dataset.id); return; } stopGame(); startLevel(el.dataset.id); },
    'or-mode'(el) { const m = ORDA_MODES.find((x) => x.id === el.dataset.id); m?.go?.(); },
    'or-buy'(el) {
      const p = ordaLoad(), u = UPGRADES.find((x) => x.id === el.dataset.id); if (!u) return;
      const l = p.up[u.id] || 0; if (l >= u.max) return;
      const c = upCost(u, l);
      if (p.coins < c) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${fmt(c - p.coins)} monete per «${u.name}». Le guadagni giocando i livelli.`, 'bad'); return; }
      p.coins -= c; p.up[u.id] = l + 1; ordaSave(p); sfx.coin?.(); refresh();
    },
    'or-skin'(el) { buyCosmetic(el.dataset.id, SKINS, 'skins', 'skin'); },
    'or-cannon'(el) { buyCosmetic(el.dataset.id, CANNONS, 'cannons', 'cannon'); },
    'or-champ'(el) { const p = ordaLoad(); if (!p.champs.includes(el.dataset.id)) return; p.champ = el.dataset.id; ordaSave(p); sfx.ok?.(); refresh(); },
    'or-champ-up'(el) {
      const p = ordaLoad(), id = el.dataset.id, l = p.clv[id] || 0; if (!p.champs.includes(id) || l >= CHAMP_MAX - 1) return;
      const c = champCost(l);
      if (p.coins < c) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${fmt(c - p.coins)} monete.`, 'bad'); return; }
      p.coins -= c; p.clv[id] = l + 1; ordaSave(p); sfx.levelup?.(); refresh();
    },
    'or-opt'(el) { const p = ordaLoad(); p.opt[el.dataset.k] = el.checked; ordaSave(p); },
    'or-reset'() { App.confirm('Azzerare Orda?', 'Livelli, stelle, monete, potenziamenti e campioni di Orda torneranno all’inizio. Gli altri giochi non vengono toccati.', () => { ordaSave({}); localStorage.removeItem('sala_orda_v1'); refresh(); }, 'Azzera', true); },
    'or-resume'() { V.game?.togglePause(false); },
    'or-chest'(el) {
      const p = ordaLoad(); if (!p.chests) return;
      const rw = openChest(p, rollChest((p.games + 1) * 7919 + (p.wins || 0) * 31 + p.coins, p)); p.chests--; ordaSave(p);
      try { sfx.levelup?.(); } catch {}
      const host = el.closest('.or-res-card, .or-home') || document.body;
      const pop = document.createElement('div'); pop.className = 'or-chest-pop'; pop.setAttribute('role', 'dialog');
      pop.innerHTML = `<div class="or-chest-box"><div class="or-chest-ic">${rw.icon}</div><div class="or-k">Dal forziere</div><h3>${rw.kind === 'up' ? `${esc(rw.name)} +1` : rw.kind === 'coins' ? `+${fmt(rw.n)} monete` : `${rw.kind === 'skin' ? 'Colore' : 'Cannone'} «${esc(rw.name)}»`}</h3><button class="btn primary" data-a="or-chest-ok">Fantastico!</button></div>`;
      host.appendChild(pop); requestAnimationFrame(() => pop.querySelector('.btn')?.focus());
    },
    'or-chest-ok'(el) { el.closest('.or-chest-pop')?.remove(); if (!V.playing) refresh(); else { const b = document.querySelector('[data-a=or-chest]'); if (b && !ordaLoad().chests) b.remove(); } },
    'or-login'() {
      const p = ordaLoad(), L = loginState(p); if (!L.claimable) return;
      const rw = LOGIN_REWARDS[L.day]; p.login = { last: todayKey(), day: L.day };
      if (rw.coins) p.coins += rw.coins; if (rw.chest) p.chests = (p.chests || 0) + 1;
      ordaSave(p); try { sfx.coin?.(); } catch {}
      App.toast('Premio del giorno', `${rw.coins ? `+${rw.coins} monete` : ''}${rw.coins && rw.chest ? ' e ' : ''}${rw.chest ? 'un forziere' : ''}!`, 'ok');
      refresh();
    },
    'or-bonus'() { const p = ordaLoad(); if (!p.bonus) return; stopGame(); playOrda({ level: bonusLevel(p.wins + p.games), mode: 'bonus', label: 'Livello bonus' }); },
    'or-again'() { stopGame(); V.playing = true; refresh(); },
    'or-quit'() { stopGame(); V.playing = false; refresh(); },
    'or-back'() { stopGame(); V.playing = false; refresh(); },
    'or-shop'() { stopGame(); V.playing = false; V.tab = 'potenziamenti'; refresh(); },
  });
}
function buyCosmetic(id, list, ownKey, selKey) {
  const p = ordaLoad(), s = list.find((x) => x.id === id); if (!s) return;
  if (p[ownKey].includes(s.id)) { p[selKey] = s.id; ordaSave(p); sfx.ok?.(); App.refresh(); return; }
  if (s.stars) { sfx.bad?.(); App.toast('Premio a stelle', `«${s.name}» si sblocca raccogliendo ${s.stars} stelle (ne hai ${ordaStars(p)}).`, 'bad'); return; }
  if (p.coins < s.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${fmt(s.cost - p.coins)} monete per «${s.name}».`, 'bad'); return; }
  App.confirm(`Sbloccare «${s.name}»?`, `Costa ${fmt(s.cost)} monete (ne hai ${fmt(p.coins)}).`, () => { const q = ordaLoad(); q.coins -= s.cost; q[ownKey].push(s.id); q[selKey] = s.id; ordaSave(q); sfx.coin?.(); App.refresh(); });
}
export const ordaActions = ORDA_ACTIONS;

// test hook: deterministic stepping from the outside (headless WebGL is far too slow to play live)
window.__orda = Object.assign(window.__orda || {}, {
  step(dt = 1 / 60, n = 1) { const g = V.game; if (!g?.sim) return null; for (let i = 0; i < n; i++) g.step(dt); return g.debugInfo(); },
  play: (id) => startLevel(id), playLevel: (level, mode = 'level') => playOrda({ level, mode }), bonus: (n = 1) => playOrda({ level: bonusLevel(n), mode: 'bonus', label: 'Livello bonus' }), state: () => V.game?.debugInfo() || null, store: ordaLoad, save: ordaSave, levels: LEVELS,
});
Object.defineProperty(window.__orda, 'result', { get: () => V.result, configurable: true });

// extra modes — Sfida del giorno, Infinita, Missioni (src/orda/modes-entries.js, screen orda-modes)
registerOrdaModes({ App, addOrdaMode, addOrdaTab, endHooks: ORDA_END_HOOKS, actions: ORDA_ACTIONS(), refresh: () => App.refresh() });
