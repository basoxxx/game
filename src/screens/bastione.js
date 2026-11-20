// Bastione — menu (campaign map, modes, upgrade tree, heroes & spells, guide, options), the live game
// (src/bastione/game.js) and the results. Progress in src/bastione/store.js.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { bsLoad, bsSave, bsStars, bsNext, coinsFor } from '../bastione/store.js';
import { LEVELS, levelById, endlessLevel, dailyLevel, dailyInfo } from '../bastione/levels.js';
import { TOWERS, ENEMIES, HEROES, heroById, HERO_MAX, heroCost, SPELLS, WORLDS, DIFFS, diffById, TREE, BRANCHES, treeCost, catchUp } from '../bastione/data.js';
import { TOWER_ICON, ENEMY_ICON, HERO_ICON, SPELL_ICON, ABILITY_ICON, ICON_COIN, ICON_GEM } from '../bastione/icons.js';
import '../bastione/bastione.css';

const V = { playing: false, game: null, from: 'launcher', tab: 'campagna', run: null, result: null, endMap: null };
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const N = LEVELS.length;
const starRow = (n, max = 3) => `<span class="bs-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
const unlocked = (p, l) => l.id <= bsNext(p, N);
const coin = (n) => `<span class="bs-cur">${ICON_COIN}${fmt(n)}</span>`;
const gem = (n) => `<span class="bs-cur gem">${ICON_GEM}${fmt(n)}</span>`;

export function playBastione({ level, mode = 'level', label = '' } = {}) {
  V.run = { level, mode, label }; V.playing = true; V.result = null;
  if (App.cur === 'bastione') App.refresh(); else App.go('bastione', { from: V.from || 'launcher' });
}

// ───────── tabs
function campaignTab(p) {
  const next = Math.min(bsNext(p, N), N), l = levelById(next), w = WORLDS[l.world], done = bsNext(p, N) > N;
  return `<section class="bs-hero-card" style="--g1:${w.ground};--g2:${w.ground2};--sky:${w.sky}">
      <div class="bs-hero-art" aria-hidden="true">${mapThumb(l)}</div>
      <div class="bs-hero-body">
        <div class="bs-k">${esc(w.name)} · Livello ${l.id}${l.boss ? ' · <b>Capo</b>' : ''}</div>
        <h2>${done ? 'Campagna completata!' : esc(l.name)}</h2>
        <p>${done ? 'Hai salvato tutte le valli. Rigioca a Difficile per le monete extra, prova Infinita e la Sfida del giorno.' : esc(l.tip)}</p>
        <div class="bs-meta">${starRow(p.stars[l.id] || 0)}<span>${l.waves} ondate · ${l.slots} piazzole${l.paths.length > 1 ? ` · ${l.paths.length} ingressi` : ''}</span></div>
        <div class="bs-diff" role="radiogroup" aria-label="Difficoltà">${DIFFS.map((d) => `<button role="radio" aria-checked="${p.diff === d.id}" class="${p.diff === d.id ? 'on' : ''}" data-a="bs-diff" data-id="${d.id}" title="${esc(d.desc)}">${esc(d.name)}</button>`).join('')}</div>
        <button class="btn primary big" data-a="bs-play" data-id="${l.id}">${icon('play')} ${done ? 'Rigioca' : 'Gioca'} il livello ${l.id}</button>
      </div>
    </section>
    <div class="bs-worlds">${WORLDS.map((wd, wi) => {
      const lv = LEVELS.filter((x) => x.world === wi), open = unlocked(p, lv[0]), got = lv.reduce((a, x) => a + (p.stars[x.id] || 0), 0);
      return `<section class="bs-world ${open ? '' : 'locked'}" style="--g1:${wd.ground};--g2:${wd.ground2};--pe:${wd.pathEdge}">
        <div class="bs-world-h"><div><div class="bs-k">Mondo ${wi + 1}</div><b>${esc(wd.name)}</b><span>${esc(wd.sub)}</span></div><em>★ ${got}/${lv.length * 3}</em></div>
        <div class="bs-nodes">${lv.map((x) => { const st = p.stars[x.id] || 0, on = unlocked(p, x), cur = x.id === bsNext(p, N); return `<button class="bs-node ${x.boss ? 'boss' : ''} ${on ? '' : 'locked'} ${cur ? 'cur' : ''} ${st ? 'done' : ''}" data-a="bs-play" data-id="${x.id}" ${on ? '' : 'aria-disabled="true"'} title="${esc(x.name)}"><i>${on ? (x.boss ? ENEMY_ICON[x.boss] : x.id) : icon('lock')}</i><small>${esc(x.name)}</small>${starRow(st)}</button>`; }).join('')}</div>
      </section>`;
    }).join('')}</div>`;
}
// a tiny SVG of the map: the roads and the keep
function mapThumb(l) {
  const w = WORLDS[l.world], X = (x) => (x + 20) * 8, Z = (z) => (z + 14) * 8;
  const roads = l.paths.map((pts) => `M${pts.map(([x, z]) => `${X(x)} ${Z(z)}`).join(' L')}`).join(' ');
  const k = l.paths[0][l.paths[0].length - 1];
  return `<svg viewBox="0 0 320 224" preserveAspectRatio="xMidYMid slice"><rect width="320" height="224" fill="${w.ground}"/><path d="${roads}" fill="none" stroke="${w.pathEdge}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/><path d="${roads}" fill="none" stroke="${w.path}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>
    <g transform="translate(${X(k[0])} ${Z(k[1])})"><rect x="-14" y="-12" width="28" height="22" fill="#f2eee6"/><path d="M-18 -10 L-10 -26 L-2 -10Z M2 -10 L10 -26 L18 -10Z" fill="#2f7cf6"/></g>
    ${l.paths.map((pts) => { const [x, z] = pts[0]; return `<circle cx="${Math.max(10, Math.min(310, X(x)))}" cy="${Math.max(10, Math.min(214, Z(z)))}" r="10" fill="#e0303f"/>`; }).join('')}</svg>`;
}
function modesTab(p) {
  const info = dailyInfo(), rec = p.daily[info.key], base = levelById(info.map);
  const maps = LEVELS.filter((l) => unlocked(p, l));
  const sel = V.endMap && unlocked(p, levelById(V.endMap)) ? V.endMap : maps[maps.length - 1].id;
  return `<div class="bs-modes">
    <section class="bs-card bs-daily">
      <div class="bs-k">Sfida del giorno #${info.num}</div>
      <h3>${esc(base.name)} · <em>${esc(info.rule.name)}</em></h3>
      <p>${esc(info.rule.desc)} Stessa mappa, stesse ondate e stessa regola per tutti, per un giorno. 12 ondate a Normale.</p>
      <div class="bs-meta">${rec ? (rec.won ? `Vinta ${starRow(rec.stars)}` : `Tentata: ondata ${rec.wave}/12`) : 'Non ancora giocata'} · premio ${gem(info.gems)} alla prima vittoria</div>
      <button class="btn primary" data-a="bs-daily">${icon('calendar')} ${rec?.won ? 'Rigioca' : 'Gioca la sfida'}</button>
    </section>
    <section class="bs-card bs-endless">
      <div class="bs-k">Infinita</div>
      <h3>Ondate senza fine</h3>
      <p>Scegli una mappa che hai sbloccato e resisti il più possibile: un capo ogni 10 ondate. 1 gemma ogni 5 ondate del tuo nuovo record.</p>
      <div class="bs-maps">${maps.map((l) => `<button class="bs-map ${l.id === sel ? 'on' : ''}" data-a="bs-endmap" data-id="${l.id}" title="${esc(l.name)}">${mapThumb(l)}<b>${l.id}. ${esc(l.name)}</b><small>${p.endless[l.id] ? `Record: ondata ${p.endless[l.id]}` : 'Nessun record'}</small></button>`).join('')}</div>
      <button class="btn primary" data-a="bs-endless" data-id="${sel}">${icon('hourglass')} Gioca su «${esc(levelById(sel).name)}»</button>
    </section>
  </div>`;
}
function treeTab(p) {
  return `<div class="bs-tree">${BRANCHES.map((br) => `<section class="bs-branch"><h3>${esc(br)}</h3>${TREE.filter((n) => n.branch === br).map((n) => {
    const l = p.tree[n.id] || 0, max = l >= n.max, c = treeCost(n, l), lock = n.req && !p.tree[n.req];
    return `<div class="bs-tnode ${max ? 'max' : ''} ${lock ? 'locked' : ''}"><b>${esc(n.name)}</b><p>${esc(n.desc)}</p><div class="bs-pips">${Array.from({ length: n.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn ${max || lock ? 'ghost' : p.coins >= c ? 'primary' : ''}" data-a="bs-tree" data-id="${n.id}" ${max || lock ? 'disabled' : ''}>${max ? 'Completo' : lock ? `Prima: ${esc(TREE.find((x) => x.id === n.req).name)}` : coin(c)}</button></div>`;
  }).join('')}</section>`).join('')}</div>`;
}
function heroesTab(p) {
  return `<h3 class="bs-h">Eroi</h3><div class="bs-heroes">${HEROES.map((H) => {
    const own = p.heroes.includes(H.id), l = p.hlv[H.id] || 0, k = 1 + 0.12 * l;
    return `<section class="bs-card bs-herocard ${own ? '' : 'locked'} ${p.hero === H.id ? 'on' : ''}" style="--c:${H.color}">
      <div class="bs-face">${HERO_ICON[H.id]}</div><div class="bs-k">${esc(H.role)}</div><h3>${esc(H.name)}</h3><p>${esc(H.desc)}</p>
      <ul class="bs-st"><li><span>Vita</span><b>${fmt(H.hp * k)}</b></li><li><span>Danni</span><b>${fmt(H.dmg * k)}</b></li><li><span>Livello</span><b>${l + 1}/${HERO_MAX + 1}</b></li></ul>
      <div class="bs-abs">${H.ab.map((a) => `<div>${ABILITY_ICON[a.id]}<span><b>${esc(a.name)}</b><small>${esc(a.desc)} Ricarica ${a.cd}s.</small></span></div>`).join('')}</div>
      ${own ? `<div class="bs-btns"><button class="btn ${p.hero === H.id ? 'ghost' : 'primary'}" data-a="bs-hero" data-id="${H.id}">${p.hero === H.id ? `${icon('check')} In campo` : 'Scegli'}</button>
        <button class="btn" data-a="bs-hlv" data-id="${H.id}" ${l >= HERO_MAX ? 'disabled' : ''}>${l >= HERO_MAX ? 'Livello massimo' : `Allena · ${coin(heroCost(l))}`}</button></div>`
      : `<button class="btn ${p.gems >= H.gems ? 'primary' : ''}" data-a="bs-hero-buy" data-id="${H.id}">Sblocca · ${gem(H.gems)}</button>`}
    </section>`;
  }).join('')}</div>
  <h3 class="bs-h">Incantesimi</h3><div class="bs-spellcards">${SPELLS.map((s) => { const own = p.spells.includes(s.id); return `<section class="bs-card bs-spellcard ${own ? '' : 'locked'}"><div class="bs-face sm">${SPELL_ICON[s.id]}</div><div><b>${esc(s.name)}</b><p>${esc(s.desc)} Ricarica ${s.cd}s · tasto ${s.key}.</p></div>${own ? `<em>${icon('check')}</em>` : `<button class="btn ${p.gems >= s.gems ? 'primary' : ''}" data-a="bs-spell-buy" data-id="${s.id}">Sblocca · ${gem(s.gems)}</button>`}</section>`; }).join('')}</div>`;
}
function guideTab(p) {
  const st = (o) => [o.dmg != null && !o.men ? `${fmt(o.dmg)} danni` : '', o.rate ? `${o.rate}/s` : '', o.range ? `${o.range} m` : '', o.men ? `${o.men}×${o.hp} vita` : '', o.gold ? `+${o.gold} oro/${o.every}s` : ''].filter(Boolean).join(' · ');
  return `<h3 class="bs-h">Torri · 3 livelli e 2 specializzazioni ciascuna</h3><div class="bs-guide">${TOWERS.map((t, i) => `<section class="bs-card bs-gt" style="--c:${t.color}"><div class="bs-gt-h"><span class="bs-face sm">${TOWER_ICON[t.id]}</span><div><b>${esc(t.name)}</b><small>${esc(t.short)} · tasto ${i + 1}${t.air ? ' · contraerea' : ''}</small></div></div>
      <ol>${t.tiers.map((x, k) => `<li><span>Liv. ${k + 1}</span><b>${st(x)}</b><em>${coin(x.cost)}</em></li>`).join('')}</ol>
      <div class="bs-gspec">${t.spec.map((s) => `<div><b>${esc(s.name)}</b><small>${esc(s.desc)}</small><em>${coin(s.cost)}</em></div>`).join('')}</div></section>`).join('')}</div>
    <h3 class="bs-h">Nemici</h3><div class="bs-bestiary">${Object.entries(ENEMIES).filter(([k]) => k !== 'mini').map(([k, E]) => { const seen = p.seen[k]; return `<div class="bs-card bs-foe ${seen ? '' : 'unseen'}"><span class="bs-face sm">${ENEMY_ICON[k]}</span><div><b>${seen ? esc(E.name) : '???'}</b><small>${seen ? esc(E.desc) : 'Non ancora incontrato.'}</small>${seen ? `<em>${E.fly ? 'Volante · ' : ''}${E.armor ? `armatura ${Math.round(E.armor * 100)}% · ` : ''}${E.mres ? `resistenza magica ${Math.round(E.mres * 100)}% · ` : ''}${E.lives} ${E.lives > 1 ? 'vite' : 'vita'}</em>` : ''}</div></div>`; }).join('')}</div>
    <h3 class="bs-h">Comandi</h3><div class="bs-card bs-how">
      <div><b>Tocco / mouse</b><span>Tocca una piazzola per costruire, una torre per potenziarla o venderla. Trascina per spostare la vista, pizzica o usa la rotella per lo zoom. Tocca il sentiero per mandare l’eroe.</span></div>
      <div><b>Tastiera</b><span><span class="kbd">1</span>–<span class="kbd">9</span> torri · <span class="kbd">Tab</span> scorri le piazzole · <span class="kbd">U</span> potenzia · <span class="kbd">V</span> vendi · <span class="kbd">T</span> bersaglio · <span class="kbd">N</span> prossima ondata · <span class="kbd">Spazio</span> pausa · <span class="kbd">F</span> velocità · <span class="kbd">H</span> eroe · <span class="kbd">Z</span> <span class="kbd">X</span> abilità · <span class="kbd">Q</span> <span class="kbd">W</span> <span class="kbd">E</span> incantesimi · frecce e <span class="kbd">+</span> <span class="kbd">-</span> per la vista</span></div>
      <div><b>Controller</b><span>Levetta sinistra: cursore · A: azione · B: annulla · X: prossima ondata · Y: eroe · LB/RB: incantesimi · grilletti: zoom · levetta destra: vista · Start: menu · Select: velocità</span></div>
      <div><b>Stelle</b><span>★ vinci · ★★ con almeno 10 vite · ★★★ perdendo al massimo 2 vite. Le stelle nuove valgono gemme; le monete premiano ogni partita.</span></div>
    </div>`;
}
function optTab(p) {
  const tog = (k, name, desc) => `<label class="bs-opt"><input type="checkbox" data-a="bs-opt" data-k="${k}" ${p.opt[k] ? 'checked' : ''}><div><b>${name}</b><span>${desc}</span></div></label>`;
  return `<div class="bs-opts">
    ${tog('shake', 'Scossoni dello schermo', 'La visuale trema con le esplosioni e i capi.')}
    ${tog('numbers', 'Numeri a comparsa', 'Mostra l’oro guadagnato sopra i nemici abbattuti.')}
    ${tog('ranges', 'Gittate al passaggio', 'Mostra il raggio d’azione delle torri mentre scegli.')}
    <div class="bs-opt"><div><b>Velocità iniziale</b><span>La velocità del gioco a inizio partita (la cambi sempre con F o il pulsante x1).</span></div><div class="bs-diff">${[1, 2, 3].map((s) => `<button class="${p.opt.speed === s ? 'on' : ''}" data-a="bs-speed" data-v="${s}">x${s}</button>`).join('')}</div></div>
    <div class="bs-row"><button class="btn" data-a="nav" data-to="settings" data-back="bastione">${icon('settings')} Audio, grafica e comandi</button><button class="btn ghost" data-a="bs-reset">${icon('trash')} Azzera i progressi di Bastione</button></div>
    <p class="bs-note">Bastione è un gioco originale: niente pubblicità, niente acquisti. Monete e gemme si guadagnano solo giocando.</p>
  </div>`;
}
const TABS = [
  { id: 'campagna', name: 'Campagna', icon: 'map', render: campaignTab },
  { id: 'modalita', name: 'Modalità', icon: 'star', render: modesTab },
  { id: 'potenziamenti', name: 'Potenziamenti', icon: 'wrench', render: treeTab },
  { id: 'eroi', name: 'Eroi', icon: 'shield', render: heroesTab },
  { id: 'guida', name: 'Guida', icon: 'book', render: guideTab },
  { id: 'opzioni', name: 'Opzioni', icon: 'sliders', render: optTab },
];
function menu(p) {
  const tab = TABS.find((t) => t.id === V.tab) || TABS[0];
  return `<div class="full-screen bs-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Strategia', title: 'Bastione', sub: 'Costruisci torri, guida l’eroe e ferma le ondate di fagiolini rossi prima che arrivino al tuo castello.', right: `<div class="bs-wallet"><div class="w-k">Tesoro</div><b>${coin(p.coins)} ${gem(p.gems)}</b><div class="w-s">★ ${bsStars(p)} / ${N * 3} · ${p.wins} vittorie</div></div>` })}
    <nav class="bs-tabs" role="tablist">${TABS.map((t) => `<button role="tab" aria-selected="${t.id === tab.id}" class="${t.id === tab.id ? 'on' : ''}" data-a="bs-tab" data-id="${t.id}">${icon(t.icon)}<span>${esc(t.name)}</span></button>`).join('')}</nav>
    <div class="bs-body">${tab.render(p)}</div>
  </div>`;
}

// ───────── results
function results(r, info) {
  const run = V.run, L = run.level, camp = run.mode === 'level';
  const nx = camp && r.win ? levelById(L.id + 1) : null;
  const title = run.mode === 'endless' ? `Ondata ${r.wave}` : r.win ? (L.boss ? 'Capo sconfitto!' : 'Vittoria!') : 'Il Bastione è caduto';
  return `<div class="bs-res" role="dialog" aria-label="Risultati"><div class="bs-res-card ${r.win || run.mode === 'endless' ? 'win' : 'lose'}">
    <div class="bs-k">${camp ? `Livello ${L.id} · ${esc(L.name)} · ${esc(diffById(bsLoad().diff).name)}` : esc(run.label || L.name)}</div>
    <h2>${title}</h2>
    ${r.win ? `<div class="bs-res-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}" style="--d:${i * 0.25}s">★</i>`).join('')}</div>` : run.mode === 'endless' ? `<p class="bs-why">${info.record ? 'Nuovo record!' : `Record: ondata ${info.best}`}</p>` : `<p class="bs-why">Prova un’altra combinazione di torri, usa gli incantesimi e potenzia il castello nel menu.</p>`}
    <div class="bs-res-stats">
      <div><b>${r.lives}/${r.maxLives}</b><span>vite</span></div>
      <div><b>${r.wave}${run.mode === 'endless' ? '' : `/${r.waves}`}</b><span>ondate</span></div>
      <div><b>${fmt(r.kills)}</b><span>abbattuti</span></div>
      <div><b>${coin(info.coins)}</b><span>monete</span></div>
      ${info.gems ? `<div><b>${gem(info.gems)}</b><span>gemme</span></div>` : ''}
    </div>
    <div class="bs-res-btns">
      ${nx ? `<button class="btn primary" data-a="bs-play" data-id="${nx.id}">${icon('play')} Livello ${nx.id}</button>` : ''}
      <button class="btn ${nx ? '' : 'primary'}" data-a="bs-again">${icon('replay')} ${r.win ? 'Rigioca' : 'Riprova'}</button>
      ${!r.win && camp ? `<button class="btn" data-a="bs-shop">${icon('wrench')} Potenziamenti</button>` : ''}
      <button class="btn ghost" data-a="bs-back">${icon('map')} Menu</button>
    </div></div></div>`;
}
function record(r, run) {
  const st = bsLoad(), L = run.level, info = { coins: 0, gems: 0 };
  st.games++; st.kills += r.kills; if (r.win) st.wins++;
  if (run.mode === 'level') {
    const prevAll = st.stars[L.id] || 0, sd = (st.starsD[st.diff] ||= {}), prevD = sd[L.id] || 0;
    info.coins = coinsFor(L, r, prevD, st.diff);
    if (r.win) { st.stars[L.id] = Math.max(prevAll, r.stars); sd[L.id] = Math.max(prevD, r.stars); info.gems = Math.max(0, r.stars - prevAll); }
  } else if (run.mode === 'endless') {
    const id = L.mapId, best = st.endless[id] || 0; info.best = best;
    info.coins = Math.round(20 + r.wave * 7);
    if (r.wave > best) { info.record = true; info.gems = Math.floor(r.wave / 5) - Math.floor(best / 5); st.endless[id] = r.wave; }
  } else if (run.mode === 'daily') {
    const key = run.key, rec = st.daily[key] || { won: false, stars: 0, wave: 0 };
    info.coins = Math.round(coinsFor({ id: 14 }, r, 3, 'normale') * 0.8);
    if (r.win && !rec.won) info.gems = run.gems;
    st.daily[key] = { won: rec.won || r.win, stars: Math.max(rec.stars, r.stars), wave: Math.max(rec.wave, r.wave) };
  }
  st.coins += info.coins; st.gems += info.gems; st.coinsEarned += info.coins;
  bsSave(st);
  return info;
}

function stopGame() { V.game?.destroy(); V.game = null; }
function startLevel(id) {
  const l = levelById(+id); if (!l) return;
  const p = bsLoad(); if (!unlocked(p, l)) { sfx.bad?.(); App.toast('Livello bloccato', `Supera il livello ${bsNext(p, N)} per proseguire.`, 'bad'); return; }
  playBastione({ level: l, mode: 'level' });
}

registerScreen({
  id: 'bastione', full: true,
  render(params) {
    if (params?.from) V.from = params.from; else if (params?.to === 'bastione') V.from = 'launcher';
    if (params?.tab) { V.tab = params.tab; delete params.tab; }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; const p = bsLoad(); V.run = { level: levelById(Math.min(bsNext(p, N), N)), mode: 'level' }; V.playing = true; }
    if (params?.level && !V.playing) { const l = levelById(+params.level); delete params.level; if (l) { V.run = { level: l, mode: 'level' }; V.playing = true; } }
    if (params?.daily && !V.playing) { delete params.daily; startDaily(true); }
    if (V.playing) return `<div class="bs-stage"><div class="bs-root" id="bs-root"><div class="bs-loading">Si alzano i ponti levatoi…</div></div><div class="bs-over" id="bs-over"></div></div>`;
    return menu(bsLoad());
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => (document.querySelector('.bs-hero-card .btn.primary') || document.querySelector('.bs-tabs .on'))?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('bs-root');
    const p = bsLoad(), run = V.run;
    try { music.setMood?.('orda'); } catch {}
    const { BastioneGame } = await import('../bastione/game.js');
    if (!V.playing || !root?.isConnected) return;
    const s = getSettings();
    const g = V.game = new BastioneGame(root, {
      level: run.level, mode: run.mode, label: run.label, diff: run.mode === 'level' ? p.diff : 'normale', tree: p.tree, hero: p.hero, heroLvl: p.hlv[p.hero] || 0, spells: p.spells, seed: run.seed,
      ...(run.mode === 'level' ? (({ gold, boss }) => ({ aid: gold, aidBoss: boss }))(catchUp(run.level, p.tree, p.hlv[p.hero] || 0)) : {}),
      tier: gfxTier(), volume: s.sound === false ? 0 : 0.6, shake: p.opt.shake && !document.documentElement.classList.contains('reduce-motion'), numbers: p.opt.numbers, ranges: p.opt.ranges, speed: p.opt.speed || 1,
      seen: { ...p.seen }, onSeen: (t) => { const q = bsLoad(); q.seen[t] = 1; bsSave(q); },
      onSpeed: () => {},
      onQuit: () => { stopGame(); V.playing = false; App.refresh(); },
      onRestart: () => { stopGame(); V.playing = true; App.refresh(); },
      onEnd: (r) => {
        const info = record(r, run); V.result = r;
        const ov = document.getElementById('bs-over'); if (!ov || !V.playing) return;
        ov.innerHTML = results(r, info);
        try { if (r.win) { sfx.win(); if (info.gems) setTimeout(() => sfx.levelup?.(), 700); } else sfx.bad?.(); } catch {}
        requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
      },
    });
    window.__bastione.game = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="bs-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="bs-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; },
  actions: {
    'bs-tab'(el) { V.tab = el.dataset.id; sfx.click?.(); App.refresh(); },
    'bs-play'(el) { stopGame(); startLevel(el.dataset.id); },
    'bs-diff'(el) { const p = bsLoad(); p.diff = el.dataset.id; bsSave(p); sfx.select?.(); App.refresh(); },
    'bs-daily'() { startDaily(); },
    'bs-endmap'(el) { V.endMap = +el.dataset.id; sfx.select?.(); App.refresh(); },
    'bs-endless'(el) { const L = endlessLevel(+el.dataset.id); playBastione({ level: L, mode: 'endless', label: 'Infinita' }); },
    'bs-tree'(el) {
      const p = bsLoad(), n = TREE.find((x) => x.id === el.dataset.id); if (!n) return;
      const l = p.tree[n.id] || 0; if (l >= n.max || (n.req && !p.tree[n.req])) return;
      const c = treeCost(n, l);
      if (p.coins < c) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${fmt(c - p.coins)} monete per «${n.name}». Le guadagni giocando.`, 'bad'); return; }
      p.coins -= c; p.tree[n.id] = l + 1; bsSave(p); sfx.coin?.(); App.refresh();
    },
    'bs-hero'(el) { const p = bsLoad(); if (!p.heroes.includes(el.dataset.id)) return; p.hero = el.dataset.id; bsSave(p); sfx.ok?.(); App.refresh(); },
    'bs-hero-buy'(el) { buyGems(heroById(el.dataset.id), 'heroes', (p) => { p.hero = el.dataset.id; }); },
    'bs-spell-buy'(el) { buyGems(SPELLS.find((s) => s.id === el.dataset.id), 'spells'); },
    'bs-hlv'(el) {
      const p = bsLoad(), id = el.dataset.id, l = p.hlv[id] || 0; if (!p.heroes.includes(id) || l >= HERO_MAX) return;
      const c = heroCost(l);
      if (p.coins < c) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${fmt(c - p.coins)} monete.`, 'bad'); return; }
      p.coins -= c; p.hlv[id] = l + 1; bsSave(p); sfx.levelup?.(); App.refresh();
    },
    'bs-opt'(el) { const p = bsLoad(); p.opt[el.dataset.k] = el.checked; bsSave(p); },
    'bs-speed'(el) { const p = bsLoad(); p.opt.speed = +el.dataset.v; bsSave(p); sfx.select?.(); App.refresh(); },
    'bs-reset'() { App.confirm('Azzerare Bastione?', 'Livelli, stelle, monete, gemme, potenziamenti ed eroi di Bastione torneranno all’inizio. Gli altri giochi non vengono toccati.', () => { localStorage.removeItem('sala_bastione_v1'); App.refresh(); }, 'Azzera', true); },
    'bs-again'() { stopGame(); V.playing = true; App.refresh(); },
    'bs-back'() { stopGame(); V.playing = false; App.refresh(); },
    'bs-shop'() { stopGame(); V.playing = false; V.tab = 'potenziamenti'; App.refresh(); },
  },
});
function startDaily(silent) {
  const info = dailyInfo(), L = dailyLevel();
  V.run = { level: L, mode: 'daily', label: `Sfida #${info.num}`, key: info.key, gems: info.gems, seed: info.seed }; V.playing = true;
  if (!silent) { if (App.cur === 'bastione') App.refresh(); else App.go('bastione', { from: V.from || 'launcher' }); }
}
function buyGems(item, key, extra) {
  if (!item) return;
  const p = bsLoad(); if (p[key].includes(item.id)) return;
  if (p.gems < item.gems) { sfx.bad?.(); App.toast('Gemme insufficienti', `Servono ${item.gems} gemme (ne hai ${p.gems}). Le guadagni con le stelle nuove, la Sfida del giorno e i record in Infinita.`, 'bad'); return; }
  App.confirm(`Sbloccare «${item.name}»?`, `Costa ${item.gems} gemme (ne hai ${p.gems}).`, () => { const q = bsLoad(); q.gems -= item.gems; q[key].push(item.id); extra?.(q); bsSave(q); sfx.levelup?.(); App.refresh(); });
}

// test hook: deterministic stepping from the outside (headless WebGL is far too slow to play live)
window.__bastione = Object.assign(window.__bastione || {}, {
  step(dt = 1 / 60, n = 1) { const g = V.game; if (!g?.sim) return null; for (let i = 0; i < n; i++) g.step(dt); return g.debugInfo(); },
  play: (id) => startLevel(id), playLevel: (level, mode = 'level') => playBastione({ level, mode }), daily: () => startDaily(), endless: (id) => playBastione({ level: endlessLevel(id), mode: 'endless', label: 'Infinita' }),
  state: () => V.game?.debugInfo() || null, store: bsLoad, save: bsSave, levels: LEVELS,
  autoplay: (on = true) => V.game?.autoplay(on),
});
Object.defineProperty(window.__bastione, 'result', { get: () => V.result, configurable: true });
