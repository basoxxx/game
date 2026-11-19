// Officina — merge & upgrade motorsport garage: the 3D grid (drag & drop merges), the HUD (wallet, shop,
// selection card), the panels (races, research, missions & boosts, new season, collection, help), the race
// view and the offline earnings. The rules live in src/officina/core.js (pure), the 3D in garage3d/race3d.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { gfxTier } from '../ui/quality.js';
import * as C from '../officina/core.js';
import { CARS, CAR_MAX, CLASSES, PART_KINDS, PART_IDS, PART_MAX, REGIONS, RESEARCH, BRANCHES, PERKS, BOOSTS, RACE_TYPES, GRADES, TIER_COLORS, carDef, classOf, partName, partKind, rivalOf } from '../officina/data.js';
import { carPerf, simulateRace } from '../officina/race.js';
import { ofRaw, ofWrite } from '../officina/store.js';
import '../officina/officina.css';

const V = { s: null, g: null, race: null, from: 'launcher', panel: null, sel: -1, cursor: 0, timer: 0, lastT: 0, saveT: 0, regTab: 0, raceCar: -1, pops: 0, popT: 0, chance: new Map(), dirty: true };
const fmt = C.fmtN;
const now = () => Date.now();
const S = () => V.s;
function save() { const s = S(); if (!s) return; s.lastSeen = now(); ofWrite(s); }

// ───────── small html helpers
// update a container without detaching the buttons that did not change (a click that lands while the HUD
// refreshes must not be lost, hover and focus stay where they are)
function patch(el, html) {
  if (!el || el._html === html) return;
  el._html = html;
  const t = document.createElement('template'); t.innerHTML = html;
  morphKids(el, t.content);
}
function morphKids(o, n) {
  const a = o.childNodes, b = n.childNodes;
  if (a.length !== b.length) { o.replaceChildren(...[...b].map((x) => x.cloneNode(true))); return; }
  for (let i = 0; i < b.length; i++) {
    const x = a[i], y = b[i];
    if (x.nodeType !== y.nodeType || (x.nodeType === 1 && x.tagName !== y.tagName)) { x.replaceWith(y.cloneNode(true)); continue; }
    if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType !== 1) continue;
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.tagName === 'svg' || x.tagName === 'SVG') { if (x.innerHTML !== y.innerHTML) x.innerHTML = y.innerHTML; continue; }
    morphKids(x, y);
  }
}
const coin = (n) => `<span class="of-coin">${icon('coin')}${fmt(n)}</span>`;
const rp = (n) => `<span class="of-rp">◆ ${fmt(n)}</span>`;
const tok = (n) => `<span class="of-tok">⬢ ${fmt(n)}</span>`;
const carName = (t) => esc(carDef(t).name);
const tierDot = (t) => `<i class="of-dot" style="--c:${TIER_COLORS[(t - 1) % TIER_COLORS.length]}"></i>`;
const NAV = [
  ['gare', 'flag', 'Gare'], ['ricerca', 'bulb', 'Ricerca'], ['missioni', 'calendar', 'Missioni'], ['stagione', 'trophy', 'Stagione'], ['collezione', 'book', 'Collezione'], ['aiuto', 'help', 'Aiuto'],
];

function shell() {
  return `<div class="of-root" id="of-root">
    <div class="of-stage" id="of-stage"><div class="of-loading">Si accendono le luci dell’officina…</div></div>
    <div class="of-hud">
      <header class="of-top">
        <button class="of-back" data-a="of-back" aria-label="Torna al Baso Hub" title="Baso Hub (Esc)">${icon('left')}</button>
        <div class="of-title"><b>Officina</b><span id="of-garage"></span></div>
        <div class="of-wallet" id="of-wallet"></div>
      </header>
      <div class="of-coach" id="of-coach"></div>
      <aside class="of-card" id="of-card"></aside>
      <footer class="of-bot" id="of-bot"></footer>
    </div>
    <div class="of-panel" id="of-panel" role="dialog" aria-modal="false"></div>
    <div class="of-race" id="of-race"></div>
    <div class="of-pops" id="of-pops" aria-hidden="true"></div>
  </div>`;
}

// ───────── HUD
function drawWallet() {
  const s = S(), el = document.getElementById('of-wallet'); if (!el || !s) return;
  const D = C.derived(s), rate = C.incomeRate(s, now(), D), b = C.boostMult(s, now());
  el.innerHTML = `<div class="of-chip big" title="Monete e incasso al secondo">${coin(s.coins)}<small>${fmt(rate)}/s${b > 1 ? ` <em>×${b}</em>` : ''}</small></div>
    <div class="of-chip" title="Punti telemetria (ricerca)">${rp(s.rp)}<small>${C.rpRate(s, D).toFixed(1).replace('.', ',')}/s</small></div>
    <div class="of-chip" title="Gettoni (boost)">${tok(s.tokens)}</div>
    <div class="of-chip" title="Trofei della stagione">${icon('trophy')}<b>${s.trophies}</b></div>`;
  const gn = document.getElementById('of-garage'); if (gn) gn.textContent = `${REGIONS[s.region].name} · Stagione ${s.season}`;
}
function drawBottom() {
  const s = S(), el = document.getElementById('of-bot'); if (!el || !s) return;
  const D = C.derived(s), t = D.shopMax, cost = C.carCost(s, t, D), pc = C.partCost(s, D), full = C.freeSlot(s) < 0;
  const pairs = !!C.findPair(s) || s.grid.some((x) => x?.k === 'crate');
  const adr = s.adrUntil > now(), boost = s.boostUntil > now();
  patch(el, `<div class="of-shop">
      <button class="of-buy ${s.coins >= cost && !full ? 'ok' : ''}" data-a="of-buy" title="Compra un’auto (B)">${tierDot(t)}<span><b>Compra · liv. ${t}</b><small>${carName(t)}</small></span><em>${coin(cost)}</em></button>
      <button class="of-buy part ${s.coins >= pc && !full ? 'ok' : ''}" data-a="of-part" title="Cassa ricambi (P)">${icon('wrench')}<span><b>Ricambi · liv. ${D.partTier}</b><small>motore, aero, gomme o telaio</small></span><em>${coin(pc)}</em></button>
    </div>
    <div class="of-tools">
      <button class="of-tool ${pairs ? 'ok' : ''}" data-a="of-mergeall" title="Unisci tutte le coppie (M)" ${D.mergeEvery || s.stats.merges >= 10 ? '' : 'disabled'}>${icon('swap')}<span>Unisci</span></button>
      <button class="of-tool adr ${s.charge >= 1 ? 'ok' : ''} ${adr ? 'live' : ''}" data-a="of-adr" title="Adrenalina: incasso ×2 (A)" style="--p:${Math.round((adr ? (s.adrUntil - now()) / (D.adrDur * 1000) : s.charge) * 100)}%">${icon('bolt')}<span>${adr ? C.fmtTime((s.adrUntil - now()) / 1000) : boost ? 'Turbo ' + C.fmtTime((s.boostUntil - now()) / 1000) : 'Adrenalina'}</span></button>
      <div class="of-scrap" data-a="of-scrap" title="Trascina qui per rottamare (X)" tabindex="0">${icon('trash')}<span>Rottama</span></div>
    </div>
    <nav class="of-nav">${NAV.map(([id, ic, nm]) => `<button class="${V.panel === id ? 'on' : ''}" data-a="of-panel" data-id="${id}" title="${nm}">${icon(ic)}<span>${nm}</span>${id === 'missioni' && missionsReady(s) ? '<i class="of-badge"></i>' : ''}${id === 'gare' && racesHint(s) ? '<i class="of-badge"></i>' : ''}</button>`).join('')}</nav>`);
  const h = el.offsetHeight; if (h && h !== V.botH) { V.botH = h; document.getElementById('of-root')?.style.setProperty('--ofb', `${h}px`); }
}
const missionsReady = (s) => (s.missions?.list || []).some((m) => m.done && !m.claimed);
function racesHint(s) { const c = bestCarIdx(s); if (c < 0) return false; return C.eventsOf(s.region).some((e) => C.eventGrade(s, e.id) < 3 && rivalOf(e, C.eventGrade(s, e.id) + 1).t <= s.grid[c].t); }
function drawCard() {
  const s = S(), el = document.getElementById('of-card'); if (!el || !s) return;
  const it = s.grid[V.sel];
  if (!it) {
    const D = C.derived(s), cap = REGIONS[s.region].cap, nx = REGIONS[s.region + 1];
    let tip = '';
    if (s.best >= cap) tip = nx ? ((nx.season || 1) > s.season ? `Questo garage non costruisce oltre il livello ${cap}. Il ${esc(nx.name)} apre dalla stagione ${nx.season}: avvia una <b>nuova stagione</b>.` : `Il garage arriva al livello ${cap}: vinci <b>${D.trophyNeed(s.region + 1) - s.trophies} trofei</b> per il ${esc(nx.name)}.`) : '';
    el.className = 'of-card' + (tip ? ' tip' : ''); el.innerHTML = tip ? `<div class="of-tipc">${icon('info')}<span>${tip}</span></div>` : '';
    return;
  }
  const D = C.derived(s);
  let html = '';
  if (it.k === 'car') {
    const d = carDef(it.t), P = carPerf(it, D.raceBonus), on = C.trackCars(s, D).includes(V.sel);
    html = `<div class="of-ch" style="--c:${d.livery.primary};--c2:${d.livery.secondary}"><b>${esc(d.name)}</b><span>${esc(d.team)} · ${esc(classOf(it.t).name)} · liv. ${it.t}</span></div>
      <div class="of-stats"><div><b>${P.pi}</b><span>indice</span></div><div><b>${P.kmh}</b><span>km/h</span></div><div><b>${fmt(C.itemIncome(it) * D.mult)}</b><span>${on ? 'monete/s' : 'se in pista'}</span></div></div>
      <div class="of-sockets">${PART_KINDS.map((k) => { const v = it.parts[k.id]; return `<div class="${v ? 'on' : ''}" style="--c:${v ? TIER_COLORS[(v - 1) % TIER_COLORS.length] : '#555'}">${icon(k.icon)}<span>${k.short}</span><b>${v || '–'}</b></div>`; }).join('')}</div>
      <p class="of-hint">${on ? '🟢 Gira in pista e guadagna.' : 'In garage: in pista vanno le tue ' + D.lanes + ' auto migliori.'} Trascina un ricambio sull’auto per montarlo.</p>
      <div class="of-cbtn"><button class="btn primary" data-a="of-race-with">${icon('flag')} Gareggia</button><button class="btn ghost" data-a="of-sell">${icon('trash')} ${fmt(C.sellValue(s, it))}</button></div>`;
  } else if (it.k === 'part') {
    const K = partKind(it.p);
    html = `<div class="of-ch" style="--c:${TIER_COLORS[(it.t - 1) % TIER_COLORS.length]};--c2:#222"><b>${esc(partName(it.p, it.t))}</b><span>${esc(K.name)} · livello ${it.t}/${PART_MAX}</span></div>
      <p class="of-hint">${esc(K.desc)} Uniscilo a un pezzo uguale per salire di livello, oppure trascinalo su un’auto per montarlo (se ha già lo stesso livello, si fondono).</p>
      <div class="of-cbtn"><button class="btn ghost" data-a="of-sell">${icon('trash')} ${fmt(C.sellValue(s, it))}</button></div>`;
  } else html = `<div class="of-ch"><b>Cassa ${it.c === 'part' ? 'ricambi' : 'consegna'}</b><span>Tocca per aprirla</span></div>`;
  el.className = 'of-card on'; el.innerHTML = html;
}
function drawCoach() {
  const s = S(), el = document.getElementById('of-coach'); if (!el || !s) return;
  const steps = [
    'Trascina un kart sull’altro kart uguale per unirli in uno di livello superiore.',
    'Compra nuove auto con il pulsante in basso e uniscile: le migliori girano in pista e guadagnano.',
    'Ogni tanto arriva una cassa gratis: toccala per aprirla.',
    'Le gare (bandiera) danno trofei: servono per aprire nuovi garage.',
  ];
  const k = s.tut | 0;
  el.innerHTML = k < steps.length ? `<span>${steps[k]}</span><button data-a="of-coach-x" aria-label="Chiudi suggerimento">×</button>` : '';
  el.className = 'of-coach' + (k < steps.length && !V.race ? ' on' : '');
}
function advanceTut(step) { const s = S(); if ((s.tut | 0) === step) { s.tut = step + 1; drawCoach(); } }
function hudAll() { drawWallet(); drawBottom(); drawCard(); drawCoach(); if (V.panel) drawPanel(); }

// ───────── panels
function drawPanel() {
  const el = document.getElementById('of-panel'); if (!el) return;
  const s = S();
  if (!V.panel || !s) { el.className = 'of-panel'; el.innerHTML = ''; el.dataset.id = ''; return; }
  const body = { gare: panelRaces, ricerca: panelResearch, missioni: panelMissions, stagione: panelSeason, collezione: panelCollection, aiuto: panelHelp }[V.panel]?.(s) || '';
  const title = NAV.find((n) => n[0] === V.panel)?.[2] || '';
  el.className = 'of-panel on';
  if (el.dataset.id !== V.panel || !el.querySelector('.of-pbody')) { el.dataset.id = V.panel; el.innerHTML = `<div class="of-ph"><h2>${title}</h2><button class="of-x" data-a="of-close" aria-label="Chiudi">${icon('x')}</button></div><div class="of-pbody"></div>`; }
  patch(el.querySelector('.of-pbody'), body);
}
function bestCarIdx(s) { let b = -1, bp = -1; s.grid.forEach((it, i) => { if (it?.k === 'car') { const p = carPerf(it).pi; if (p > bp) { bp = p; b = i; } } }); return b; }
function raceCarIdx(s) { const i = V.raceCar; return s.grid[i]?.k === 'car' ? i : bestCarIdx(s); }
// win chance with this car (a few simulated races with a decent driver), cached per car+event+grade
function chance(s, carIt, ev, grade) {
  const D = C.derived(s), key = `${C.partSum(carIt)}:${carIt.t}:${PART_IDS.map((p) => carIt.parts[p]).join('')}:${ev.id}:${grade}:${D.raceBonus}:${D.ers}`;
  if (V.chance.has(key)) return V.chance.get(key);
  let w = 0; const n = 6;
  for (let k = 0; k < n; k++) if (simulateRace({ ev, grade, car: carIt, bonus: D.raceBonus, ers: D.ers, ersDur: D.ersDur, seed: 1000 + k * 77, skill: 'good' }).win) w++;
  const c = w / n; V.chance.set(key, c); return c;
}
const chanceTag = (c) => (c >= 0.99 ? ['Facile', 'easy'] : c >= 0.6 ? ['Favorevole', 'good'] : c >= 0.3 ? ['Equilibrata', 'even'] : c > 0 ? ['Difficile', 'hard'] : ['Fuori portata', 'no']);
function panelRaces(s) {
  const D = C.derived(s), ci = raceCarIdx(s), car = s.grid[ci];
  V.regTab = Math.min(V.regTab, s.region);
  const cars = s.grid.map((it, i) => ({ it, i })).filter((x) => x.it?.k === 'car').sort((a, b) => carPerf(b.it).pi - carPerf(a.it).pi).slice(0, 8);
  const tabs = REGIONS.map((r, i) => i <= s.region ? `<button class="${i === V.regTab ? 'on' : ''}" data-a="of-regtab" data-id="${i}">${esc(r.name)}</button>` : i === s.region + 1 ? `<button class="locked" disabled title="Servono ${D.trophyNeed(i)} trofei${(r.season || 1) > s.season ? ` e la stagione ${r.season}` : ''}">${icon('lock')} ${esc(r.name)} · ${D.trophyNeed(i)} ${icon('trophy')}${(r.season || 1) > s.season ? ` · stag. ${r.season}` : ''}</button>` : '').join('');
  const evs = C.eventsOf(V.regTab);
  return `<div class="of-racecar">${car ? `<span>Auto in gara</span><div class="of-carsel">${cars.map(({ it, i }) => `<button class="${i === ci ? 'on' : ''}" data-a="of-racecar" data-id="${i}" title="${carName(it.t)}">${tierDot(it.t)}<b>${it.t}</b><small>${carPerf(it, D.raceBonus).pi}</small></button>`).join('')}</div><em>${carName(car.t)} · indice ${carPerf(car, D.raceBonus).pi}</em>` : '<span>Nessuna auto in garage.</span>'}</div>
    <div class="of-regtabs">${tabs}</div>
    <div class="of-events">${evs.map((ev) => {
      const got = C.eventGrade(s, ev.id), next = Math.min(3, got + 1), rv = rivalOf(ev, next), T = RACE_TYPES[ev.type];
      const c = car ? chance(s, car, ev, next) : 0, [ct, cc] = chanceTag(c);
      return `<div class="of-ev">
        <div class="of-ev-h">${icon(T.icon)}<div><b>${esc(ev.name)}</b><span>${esc(T.name)} · ${ev.track.startsWith('drag') ? ev.track.slice(4) + ' m' : 'circuito'}</span></div>
          <div class="of-medals">${GRADES.map((g) => `<i class="${got >= g.id ? 'on' : ''}" style="--c:${g.color}" title="${g.name}${got >= g.id ? ': vinta' : ''}"></i>`).join('')}</div></div>
        <div class="of-ev-r"><span>Rivale ${GRADES[next - 1].name}: <b>${carName(rv.t)}</b> · ${esc(carDef(rv.t).team)} · liv. ${rv.t}${rv.parts.motore ? ` · ricambi ${rv.parts.motore}` : ''}</span><em class="of-ch-${cc}">${ct}</em></div>
        <div class="of-ev-b">${got >= 3 ? `<span class="of-done">Tutte le medaglie!</span>` : `<span>Premio: ${icon('trophy')} 1 · ${coin(Math.ceil(Math.max(C.baseIncome(s, D), C.carIncome(rv.t) * 3) * 60 * next * D.raceReward))}${next === 3 ? ' · ⬢ 2' : ''}</span>`}
          <button class="btn ${got >= 3 ? 'ghost' : 'primary'}" data-a="of-race" data-id="${ev.id}" data-g="${next}" ${car ? '' : 'disabled'}>${icon('play')} ${got >= 3 ? 'Rigioca' : 'Corri'}</button></div>
      </div>`;
    }).join('')}</div>
    <p class="of-note">Vinci il Bronzo, poi l’Argento e l’Oro: ogni medaglia nuova vale un trofeo. Le gare ripetute danno monete e telemetria. Nell’accelerazione cambia marcia quando l’indicatore è nel verde; sui circuiti usa il boost nei rettilinei.</p>`;
}
function panelResearch(s) {
  const D = C.derived(s);
  return `<p class="of-note">La telemetria si accumula a ogni giro delle auto in pista e vincendo le gare. Le ricerche valgono per la stagione in corso.</p>
    <div class="of-tree">${Object.entries(BRANCHES).map(([br, nm]) => `<section><h3>${nm}</h3>${RESEARCH.filter((r) => r.br === br).map((r) => {
      const st = C.researchState(s, r.id), can = !st.max && !st.locked && s.rp >= st.cost;
      const req = r.req && C.RESEARCH.find((x) => x.id === r.req[0]);
      return `<div class="of-node ${st.max ? 'max' : st.locked ? 'locked' : can ? 'can' : ''}">
        <div class="of-node-h"><b>${esc(r.name)}</b><span>${st.lvl}/${r.max}</span></div>
        <div class="of-lv">${Array.from({ length: r.max }, (_, k) => `<i class="${k < st.lvl ? 'on' : ''}"></i>`).join('')}</div>
        <p>${esc(r.desc)}</p>
        ${st.max ? '<em>Completata</em>' : st.locked ? `<em>${icon('lock')} Serve ${esc(req.name)} ${r.req[1]}</em>` : `<button class="btn ${can ? 'primary' : ''}" data-a="of-research" data-id="${r.id}" ${can ? '' : 'disabled'}>${rp(st.cost)}</button>`}
      </div>`;
    }).join('')}</section>`).join('')}</div>`;
}
function panelMissions(s) {
  C.ensureMissions(s, now());
  const M = s.missions, adr = s.adrUntil > now();
  return `<h3 class="of-h">Missioni del giorno</h3>
    <div class="of-miss">${M.list.map((m, i) => `<div class="of-m ${m.claimed ? 'claimed' : m.done ? 'done' : ''}"><div><b>${esc(C.missionText(m))}</b><div class="of-pb"><i style="width:${(m.have / m.n) * 100}%"></i></div><span>${fmt(m.have)} / ${fmt(m.n)}</span></div>
      ${m.claimed ? `<em>${icon('check')} Riscossa</em>` : `<button class="btn ${m.done ? 'primary' : ''}" data-a="of-claim" data-id="${i}" ${m.done ? '' : 'disabled'}>⬢ ${m.tokens}</button>`}</div>`).join('')}
      <div class="of-m bonus ${M.bonus ? 'claimed' : ''}"><div><b>Tutte e tre</b><span>Bonus: ⬢ 6 gettoni</span></div>${M.bonus ? `<em>${icon('check')}</em>` : ''}</div></div>
    <p class="of-note">Missioni nuove ogni giorno, uguali per tutti. I gettoni si guadagnano solo giocando: missioni, medaglie d’oro e nuovi modelli scoperti.</p>
    <h3 class="of-h">Boost ${tok(s.tokens)}</h3>
    <div class="of-boosts">${BOOSTS.map((b) => `<div class="of-boost">${icon(b.icon)}<div><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div><button class="btn ${s.tokens >= b.cost ? 'primary' : ''}" data-a="of-boost" data-id="${b.id}" ${s.tokens >= b.cost ? '' : 'disabled'}>⬢ ${b.cost}</button></div>`).join('')}
      <div class="of-boost">${icon('bolt')}<div><b>Adrenalina</b><span>Ogni unione e ogni vittoria caricano la barra: piena, vale incasso ×2 per ${Math.round(C.derived(s).adrDur)} secondi. Gratis.</span></div><button class="btn ${s.charge >= 1 ? 'primary' : ''}" data-a="of-adr" ${s.charge >= 1 && !adr ? '' : 'disabled'}>${Math.floor((s.charge || 0) * 100)}%</button></div></div>`;
}
function panelSeason(s) {
  const g = C.prestigeGain(s), D = C.derived(s);
  return `<div class="of-season">
      <div class="of-big"><span>Stagione</span><b>${s.season}</b></div>
      <div class="of-big"><span>Punti dinastia</span><b>${s.dp}</b><small>${s.dpEarned} guadagnati in tutto · +${Math.round(C.K.dpIncome * 100 * s.dpEarned)}% incasso</small></div>
      <div class="of-big"><span>Questa stagione</span><b>${fmt(s.seasonEarned)}</b><small>monete guadagnate · ${s.trophies} trofei</small></div>
    </div>
    <div class="of-prest ${g ? 'ok' : ''}">
      <p>Una <b>nuova stagione</b> riparte dal primo garage: monete, auto, ricerche e trofei della stagione si azzerano. In cambio ricevi <b>punti dinastia</b> che aumentano per sempre l’incasso (+${Math.round(C.K.dpIncome * 100)}% ciascuno) e si spendono nei vantaggi qui sotto. I garage più prestigiosi aprono solo alle dinastie con più stagioni alle spalle.</p>
      ${g ? `<button class="btn primary big" data-a="of-prestige">${icon('trophy')} Nuova stagione · +${g} punti</button>` : `<em>${icon('lock')} Disponibile dal 3° garage (${esc(REGIONS[C.PRESTIGE_REGION].name)}).</em>`}
    </div>
    <h3 class="of-h">Vantaggi della dinastia</h3>
    <div class="of-perks">${PERKS.map((p) => { const lvl = s.perks[p.id] || 0, max = lvl >= p.max, c = p.cost[lvl]; return `<div class="of-perk ${max ? 'max' : ''}"><div><b>${esc(p.name)}</b><span>${esc(p.desc)}</span><div class="of-lv">${Array.from({ length: p.max }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</div></div>${max ? `<em>${icon('check')}</em>` : `<button class="btn ${s.dp >= c ? 'primary' : ''}" data-a="of-perk" data-id="${p.id}" ${s.dp >= c ? '' : 'disabled'}>${c} pt</button>`}</div>`; }).join('')}</div>
    <h3 class="of-h">Garage</h3>
    <div class="of-regions">${REGIONS.map((r, i) => `<div class="of-reg ${i <= s.region ? 'on' : ''}" style="--c:${r.accent}"><b>${esc(r.name)}</b><span>${r.dims[0] * r.dims[1]} posti · ${r.lanes} in pista · incasso ×${r.mult} · fino al liv. ${r.cap}</span><em>${i <= s.region ? 'Aperto' : `${D.trophyNeed(i)} trofei${(r.season || 1) > 1 ? ` · stagione ${r.season}` : ''}`}</em></div>`).join('')}</div>`;
}
function panelCollection(s) {
  return `<p class="of-note">${s.seen.length} modelli scoperti su ${CAR_MAX} · miglior auto di sempre: livello ${s.bestEver}. Ogni nuovo modello vale un gettone.</p>
    ${CLASSES.map((c) => `<h3 class="of-h">${esc(c.name)}</h3><div class="of-coll">${CARS.filter((d) => d.cls === c.id).map((d) => { const seen = s.seen.includes(d.t); const P = carPerf({ t: d.t }); return `<div class="of-cc ${seen ? '' : 'unk'}" style="--c:${d.livery.primary};--c2:${d.livery.secondary};--c3:${d.livery.accent}"><i class="of-livery"></i><b>${seen ? esc(d.name) : '???'}</b><span>${seen ? esc(d.team) : 'Da scoprire'}</span><em>liv. ${d.t}${seen ? ` · ${P.kmh} km/h` : ''}</em></div>`; }).join('')}</div>`).join('')}
    <h3 class="of-h">Ricambi migliori</h3><div class="of-coll parts">${PART_KINDS.map((k) => `<div class="of-cc"><b>${esc(k.name)}</b><span>${s.seenParts[k.id] ? esc(partName(k.id, s.seenParts[k.id])) : 'Nessuna unione ancora'}</span><em>liv. ${s.seenParts[k.id] || 0}/${PART_MAX}</em></div>`).join('')}</div>
    <h3 class="of-h">Statistiche</h3><div class="of-statl">${[['Unioni', s.stats.merges], ['Auto comprate', s.stats.bought], ['Casse aperte', s.stats.crates], ['Ricambi montati', s.stats.installs], ['Gare', `${s.stats.wins} vinte su ${s.stats.races}`], ['Giri in pista', s.stats.laps], ['Trofei di sempre', s.trophiesAll], ['Monete guadagnate', fmt(s.stats.earned)], ['Tempo di gioco', C.fmtTime(s.stats.play)], ['Stagioni', s.season]].map(([a, b]) => `<div><span>${a}</span><b>${typeof b === 'number' ? fmt(b) : b}</b></div>`).join('')}</div>`;
}
function panelHelp() {
  return `<div class="of-help">
    <div><b>${icon('swap')} Unisci</b><span>Trascina un’auto su un’auto <i>identica</i> (stesso livello): diventano una sola auto del livello successivo, dal kart fino alla Formula. Lo stesso vale per i ricambi dello stesso tipo e livello. Puoi anche toccare due oggetti uno dopo l’altro.</span></div>
    <div><b>${icon('wrench')} Ricambi</b><span>Motore, aerodinamica, gomme e telaio si montano trascinandoli su un’auto: migliorano le prestazioni in gara e un po’ l’incasso. Unendo due auto, la nuova tiene i ricambi migliori.</span></div>
    <div><b>${icon('coin')} Pista di prova</b><span>Le tue auto migliori girano sull’anello attorno all’officina e incassano monete e telemetria, anche mentre sei via (con un limite di ore).</span></div>
    <div><b>${icon('flag')} Gare</b><span>Accelerazione, giro secco e testa a testa contro le scuderie di Apex Dynasty. Le medaglie danno trofei, i trofei aprono nuovi garage più grandi.</span></div>
    <div><b>${icon('trophy')} Stagioni</b><span>Dal terzo garage puoi ricominciare con una nuova stagione: guadagni punti dinastia, bonus permanenti.</span></div>
    <div><b>${icon('keyboard')} Tastiera</b><span><span class="kbd">←↑→↓</span> scegli il posto · <span class="kbd">Invio</span> prendi / posa · <span class="kbd">B</span> compra · <span class="kbd">P</span> ricambi · <span class="kbd">M</span> unisci tutto · <span class="kbd">A</span> adrenalina · <span class="kbd">X</span> rottama · <span class="kbd">G</span> gare · <span class="kbd">Esc</span> chiudi / esci</span></div>
  </div>`;
}

// ───────── game actions
function afterChange() { const s = S(); V.g?.setTrack(C.trackCars(s).map((i) => s.grid[i].t)); V.g?.drawLabels(); hudAll(); }
function toast(t, x, kind = 'good') { try { App.toast(t, x, kind); } catch {} }
function reactMove(res, to) {
  const s = S();
  if (res.type === 'merge') {
    advanceTut(0);
    try { res.newBest ? sfx.levelup() : sfx.ok(); } catch {}
    if (res.newModel) { const d = carDef(res.item.t); toast(`Nuovo modello: ${d.name}`, `${d.team} · ${classOf(d.t).name}. +1 gettone.`); }
    else if (res.newPart) toast(`${partName(res.item.p, res.item.t)}`, 'Nuovo livello di ricambio raggiunto!');
    if (res.item.k === 'car' && s.tut === 1 && res.item.t >= 2) {}
  } else if (res.type === 'install') { try { sfx.pit?.(); } catch {} toast(res.fused ? 'Ricambio potenziato' : 'Ricambio montato', `${partKind(res.kind).name} livello ${res.item.parts[res.kind]} su ${carDef(res.item.t).name}.`); }
  else if (res.type === 'reject') {
    try { sfx.bad(); } catch {}
    V.g?.shake(to);
    if (res.why === 'cap') { const nx = REGIONS[s.region + 1]; toast('Garage al limite', nx ? `Il ${REGIONS[s.region].name} costruisce fino al livello ${REGIONS[s.region].cap}. ${(nx.season || 1) > s.season ? `Il ${nx.name} apre dalla stagione ${nx.season}.` : `Vinci trofei per aprire il ${nx.name}.`}` : '', 'bad'); }
    else if (res.why === 'part-low') toast('Ricambio peggiore', 'L’auto monta già un pezzo migliore di questo tipo.', 'bad');
  } else if (res.type === 'move' || res.type === 'swap') { try { sfx.tick?.(); } catch {} }
}
function doMove(from, to) {
  const s = S();
  const res = C.move(s, from, to);
  V.g?.applyMove(from, to, res, s.grid, true);
  reactMove(res, to);
  if (res.type === 'merge' || res.type === 'move' || res.type === 'swap' || res.type === 'install') V.sel = res.type === 'reject' ? V.sel : -1;
  V.g?.setSelected(V.sel);
  afterChange();
  return res;
}
function openCrateAt(i) {
  const s = S(); const r = C.openCrate(s, i);
  if (!r) return;
  advanceTut(2);
  try { sfx.open?.(); } catch {}
  V.g?.sync(s.grid); V.g?.burst?.(V.g.pos(i), r.item, 0.6);
  if (r.newModel) { const d = carDef(r.item.t); toast(`Nuovo modello: ${d.name}`, `${d.team}. +1 gettone.`); }
  afterChange();
}
function tap(i) {
  const s = S(); if (V.race) return;
  if (i < 0 || i >= s.grid.length) { V.sel = -1; V.g?.setSelected(-1); drawCard(); return; }
  V.cursor = i; V.g?.setCursor(i);
  const it = s.grid[i];
  if (it?.k === 'crate') { openCrateAt(i); return; }
  if (V.sel >= 0 && V.sel !== i && s.grid[V.sel]) { doMove(V.sel, i); return; }
  if (V.sel === i || !it) { V.sel = -1; } else { V.sel = i; V.g?.nudge(i); try { sfx.select?.(); } catch {} }
  V.g?.setSelected(V.sel); drawCard();
}
function scrap(i, ask = true) {
  const s = S(), it = s.grid[i]; if (!it || it.k === 'crate') return;
  const v = C.sellValue(s, it);
  const go = () => { const r = C.sell(s, i); if (!r.ok) return; try { sfx.coin(); } catch {} V.sel = -1; V.g?.sync(s.grid); V.g?.setSelected(-1); afterChange(); toast('Rottamato', `+${fmt(r.value)} monete`); };
  const precious = it.k === 'car' && (it.t >= s.best - 1 || C.partSum(it) > 0);
  if (ask && precious) App.confirm('Rottamare quest’auto?', `${carDef(it.t).name}${C.partSum(it) ? ' con i suoi ricambi' : ''}: ricevi ${fmt(v)} monete.`, go, 'Rottama', true);
  else go();
}
function buy() {
  const s = S(); const r = C.buyCar(s);
  if (!r.ok) { try { sfx.bad(); } catch {} if (r.why === 'full') toast('Officina piena', 'Unisci le auto uguali o rottama quelle che non servono.', 'bad'); return; }
  try { sfx.coin(); } catch {}
  advanceTut(1);
  V.g?.sync(s.grid); afterChange();
}
function buyPartCrate() {
  const s = S(); const r = C.buyPart(s);
  if (!r.ok) { try { sfx.bad(); } catch {} if (r.why === 'full') toast('Officina piena', 'Libera un posto per il ricambio.', 'bad'); return; }
  try { sfx.coin(); } catch {}
  V.g?.sync(s.grid); afterChange();
}
function mergeAll() {
  const s = S();
  for (let i = 0; i < s.grid.length; i++) if (s.grid[i]?.k === 'crate') C.openCrate(s, i);
  V.g?.sync(s.grid);
  const done = C.mergeAll(s);
  done.forEach((r, k) => setTimeout(() => { if (V.g && !V.g.dead) { V.g.applyMove(r.from, r.to, r, s.grid); } }, k * 90));
  if (done.length) { try { sfx.ok(); } catch {} const nb = done.filter((r) => r.newModel); for (const r of nb) toast(`Nuovo modello: ${carDef(r.item.t).name}`, '+1 gettone.'); }
  setTimeout(() => { V.g?.sync(s.grid); afterChange(); }, done.length * 90 + 400);
  afterChange();
}
function onRegion(r) {
  const R = REGIONS[r];
  try { sfx.win(); } catch {}
  V.g?.setRegion(r, S().grid);
  App.modal(`<div class="of-modal"><div class="of-mk">Nuovo garage</div><h2>${esc(R.name)}</h2><p>${esc(R.sub)}</p>
    <ul><li>${R.dims[0] * R.dims[1]} posti in officina</li><li>${R.lanes} auto in pista</li><li>Incasso ×${R.mult}</li><li>Auto fino al livello ${R.cap}</li><li>6 nuove gare</li></ul>
    <button class="btn primary" data-a="close-modal">Entra in officina</button></div>`);
  save();
}
function startRace(evId, grade) {
  const s = S(), ev = C.EVENTS.find((e) => e.id === evId), ci = raceCarIdx(s);
  if (!ev || ci < 0 || !V.g) return;
  const D = C.derived(s);
  V.panel = null; drawPanel();
  document.getElementById('of-root')?.classList.add('racing');
  const hud = document.getElementById('of-race'); hud.innerHTML = '<div class="of-race-hud"></div>';
  const car = JSON.parse(JSON.stringify(s.grid[ci]));
  V.lastRace = { evId, grade };
  import('../officina/race3d.js').then(({ RaceView }) => {
    if (!V.g || V.g.dead) return;
    V.race = new RaceView(V.g, { ev, grade, car, bonus: D.raceBonus, ers: D.ers, ersDur: D.ersDur, seed: (now() & 0xffff) + grade, hud: hud.firstChild, onEnd: (res) => endRace(ev, grade, car, res) });
    window.__officina.race = V.race;
    drawCoach();
  }).catch((e) => { console.error(e); stopRace(); });
}
function endRace(ev, grade, car, res) {
  const s = S();
  const out = C.raceReward(s, ev, grade, res.win, now());
  advanceTut(3);
  try { res.win ? sfx.win() : sfx.bad(); } catch {}
  const hud = document.getElementById('of-race');
  const G = GRADES[grade - 1];
  const res2 = `<div class="of-res ${res.win ? 'win' : 'lose'}" role="dialog" aria-label="Risultato">
    <div class="of-mk">${esc(ev.name)} · ${esc(RACE_TYPES[ev.type].name)} · <span style="color:${G.color}">${G.name}</span></div>
    <h2>${res.win ? (out.trophy ? 'Medaglia vinta!' : 'Vittoria!') : 'Sconfitta'}</h2>
    <div class="of-times"><div><span>Tu</span><b>${isFinite(res.me) ? res.me.toFixed(2).replace('.', ',') + ' s' : '—'}</b><small>${carName(car.t)}</small></div><div><span>Rivale</span><b>${isFinite(res.rival) ? res.rival.toFixed(2).replace('.', ',') + ' s' : '—'}</b><small>${carName(rivalOf(ev, grade).t)}</small></div></div>
    ${ev.type === 'drag' && res.shifts.length ? `<p class="of-shifts">Cambi: ${res.shifts.map((q) => `<i class="${q}">${{ perfect: 'perfetto', good: 'buono', early: 'presto', auto: 'automatico' }[q]}</i>`).join('')}</p>` : ''}
    <div class="of-rew">${out.trophy ? `<span>${icon('trophy')} +1 trofeo</span>` : ''}<span>${coin(out.coins)}</span>${out.rp ? `<span>${rp(out.rp)}</span>` : ''}${out.tokens ? `<span>${tok(out.tokens)}</span>` : ''}</div>
    ${res.win ? '' : `<p class="of-note">${res.gap > 0 && res.gap < 0.6 ? 'Per un soffio! ' : ''}Migliora l’auto: unisci per salire di livello o monta ricambi migliori${ev.type === 'drag' ? ', e cambia marcia nel verde' : ', e usa il boost nei rettilinei'}.</p>`}
    <div class="of-cbtn"><button class="btn primary" data-a="of-race-again">${icon('replay')} ${res.win ? (grade < 3 ? 'Prossima medaglia' : 'Rigioca') : 'Riprova'}</button><button class="btn" data-a="of-race-close">${icon('left')} Officina</button></div></div>`;
  if (V.race) { V.race.destroy(); V.race = null; }
  hud.innerHTML = res2;
  requestAnimationFrame(() => hud.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  if (out.region !== undefined) setTimeout(() => onRegion(out.region), 400);
  save(); afterChange();
}
function stopRace() {
  if (V.race) { V.race.destroy(); V.race = null; }
  const h = document.getElementById('of-race'); if (h) h.innerHTML = '';
  document.getElementById('of-root')?.classList.remove('racing');
  drawCoach();
}

// ───────── main loop: economy ticks, deliveries, auto-merge, laps, autosave
function step() {
  const s = S(); if (!s) return;
  const t = now(), dt = (t - V.lastT) / 1000; V.lastT = t;
  if (dt > 60) { s.lastSeen = t - dt * 1000; const o = C.applyOffline(s, t); if (o) welcomeBack(o); }
  else if (dt > 0) {
    const ev = C.tick(s, dt, t);
    for (const e of ev) {
      if (e.type === 'delivery') { V.g?.sync(s.grid); try { sfx.notify?.(); } catch {} }
      if (e.type === 'automerge' && e.res?.type === 'merge') { V.g?.applyMove(e.from, e.to, e.res, s.grid); if (e.res.newModel) toast(`Nuovo modello: ${carDef(e.res.item.t).name}`, 'Il capo officina ha unito due auto. +1 gettone.'); afterChange(); }
      if (e.type === 'region') onRegion(e.region);
    }
  }
  drawWallet();
  if ((V.tickN = (V.tickN || 0) + 1) % 5 === 0) { drawBottom(); if (V.panel === 'missioni' || V.panel === 'ricerca') drawPanel(); }
  if (t - V.saveT > 5000) { V.saveT = t; save(); }
}
function welcomeBack(o) {
  if (!o || o.coins <= 0) return;
  App.modal(`<div class="of-modal"><div class="of-mk">Bentornato in officina</div><h2>${coin(o.coins)}</h2>
    <p>Sei stato via ${C.fmtTime(o.away)}: le auto in pista hanno girato per ${C.fmtTime(o.secs)}${o.capped ? ` (massimo ${C.fmtTime(o.cap)}: aumentalo con la ricerca «Turni di notte»)` : ''} al ${Math.round(o.eff * 100)}% del ritmo.</p>
    ${o.rp ? `<p>Telemetria: ${rp(o.rp)}</p>` : ''}<button class="btn primary" data-a="close-modal">${icon('coin')} Riscuoti</button></div>`);
  try { sfx.coin(); } catch {}
}
function lapPop(t, p) {
  const s = S(); if (!s || !s.opt.numbers || V.race || document.hidden) return;
  const tm = now(); if (tm - V.popT < 220) return; V.popT = tm;
  const el = document.getElementById('of-pops'); if (!el || el.childElementCount > 6) return;
  const D = C.derived(s), v = C.carIncome(t) * D.mult * C.lapTime(t) * C.boostMult(s, tm);
  const d = document.createElement('div'); d.className = 'of-pop'; d.style.left = `${p.x}px`; d.style.top = `${p.y}px`; d.textContent = `+${fmt(v)}`;
  el.appendChild(d); setTimeout(() => d.remove(), 1300);
}

registerScreen({
  id: 'officina', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.panel) { V.panel = params.panel; delete params.panel; }
    return shell();
  },
  async mount() {
    const stage = document.getElementById('of-stage'); if (!stage) return;
    if (V.g) { V.g.destroy(); V.g = null; }
    clearInterval(V.timer);
    V.s = C.normalize(ofRaw(), now());
    const s = V.s;
    C.ensureMissions(s, now());
    const off = C.applyOffline(s, now());
    try { music.setMood?.('manage'); } catch {}
    hudAll();
    window.__officina = { get s() { return V.s; }, get g() { return V.g; }, C, V, tap, doMove, startRace, save, buy, mergeAll };
    try {
      const { Garage3D } = await import('../officina/garage3d.js');
      if (!stage.isConnected) return;
      stage.innerHTML = '';
      const hudH = (sel) => () => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height + 10 : 80; };
      V.g = new Garage3D(stage, {
        tier: gfxTier(), lapTime: (t) => C.lapTime(t), trackIdx: () => C.trackCars(S()),
        hudTop: hudH('.of-top'), hudBottom: hudH('.of-bot'),
        canDrop: (a, b) => { const x = S().grid[a], y = S().grid[b]; if (!y) return 'move'; const r = C.mergeResult(x, y, REGIONS[S().region].cap); return r ? r.type : 'swap'; },
        onDrop: (from, to, x, y) => {
          if (to < 0) {
            const el = document.elementFromPoint(x, y);
            if (el?.closest?.('.of-scrap')) { V.g.applyMove(from, from, { type: 'none' }, S().grid); scrap(from); return; }
            V.g.applyMove(from, from, { type: 'none' }, S().grid); return;
          }
          if (to === from) { V.g.applyMove(from, from, { type: 'none' }, S().grid); tap(from); return; }
          doMove(from, to);
        },
        onDragStart: (i) => { V.sel = -1; V.g.setSelected(-1); document.getElementById('of-root')?.classList.add('dragging'); try { sfx.select?.(); } catch {} },
        onDragMove: (i, x, y) => { const el = document.elementFromPoint(x, y); document.querySelector('.of-scrap')?.classList.toggle('hot', !!el?.closest?.('.of-scrap')); },
        onTap: (i) => tap(i),
        onLap: (t, p) => lapPop(t, p),
      });
      const root = document.getElementById('of-root');
      const endDrag = () => { root?.classList.remove('dragging'); document.querySelector('.of-scrap')?.classList.remove('hot'); };
      stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
      V.g.setRegion(s.region, s.grid);
      afterChange();
      V.g.setCursor(V.cursor);
    } catch (e) {
      console.error(e);
      stage.innerHTML = `<div class="of-loading">Impossibile avviare la grafica 3D: ${esc(e.message || String(e))}</div>`;
    }
    V.lastT = now(); V.saveT = now();
    V.timer = setInterval(step, 200);
    V.onHide = () => { if (document.hidden) save(); else V.lastT = Math.min(V.lastT, now()); };
    document.addEventListener('visibilitychange', V.onHide);
    window.addEventListener('pagehide', save);
    if (off) welcomeBack(off);
    drawPanel();
  },
  unmount() {
    save();
    clearInterval(V.timer); V.timer = 0;
    document.removeEventListener('visibilitychange', V.onHide); window.removeEventListener('pagehide', save);
    if (V.race) { V.race.destroy(); V.race = null; }
    V.g?.destroy(); V.g = null; V.sel = -1;
    window.__officina = null;
  },
  onKey(e) {
    const s = S(); if (!s || V.race) return;
    if (document.querySelector('.modal-wrap')) return;
    const k = e.key, tgt = e.target, onCanvas = !tgt || tgt === document.body || tgt.classList?.contains('of-canvas');
    if (k === 'Escape') { e.preventDefault(); if (document.querySelector('#of-race .of-res')) { stopRace(); return; } if (V.panel) { V.panel = null; drawPanel(); drawBottom(); return; } if (V.sel >= 0) { V.sel = -1; V.g?.setSelected(-1); drawCard(); return; } App.go(V.from === 'launcher' ? 'launcher' : V.from || 'launcher'); return; }
    if (V.panel && !k.startsWith('F')) { if (/^[a-z]$/i.test(k) && !e.ctrlKey && !e.metaKey) { /* letters still work below */ } else return; }
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (dir && !V.panel && onCanvas) { e.preventDefault(); V.cursor = V.g ? V.g.neighbor(Math.max(0, V.cursor), dir) : V.cursor; V.g?.setCursor(V.cursor); try { sfx.hover(); } catch {} return; }
    if ((k === 'Enter' || k === ' ') && onCanvas && !V.panel) { e.preventDefault(); tap(V.cursor); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const L = k.toLowerCase();
    const act = { b: buy, p: buyPartCrate, m: mergeAll, a: () => { if (C.activateAdrenaline(s, now())) { try { sfx.go?.(); } catch {} drawBottom(); } }, x: () => V.sel >= 0 && scrap(V.sel), delete: () => V.sel >= 0 && scrap(V.sel), g: () => openPanel('gare'), r: () => openPanel('ricerca') }[L];
    if (act) { e.preventDefault(); act(); }
  },
  actions: {
    'of-back'() { App.go(V.from === 'launcher' ? 'launcher' : V.from || 'launcher'); },
    'of-buy'() { buy(); },
    'of-part'() { buyPartCrate(); },
    'of-mergeall'() { mergeAll(); },
    'of-adr'() { const s = S(); if (C.activateAdrenaline(s, now())) { try { sfx.go?.(); } catch {} toast('Adrenalina!', `Incasso ×2 per ${Math.round(C.derived(s).adrDur)} secondi.`); hudAll(); } else if (s.charge < 1) toast('Adrenalina in carica', `${Math.floor(s.charge * 100)}%: unisci auto e vinci gare per riempire la barra.`, 'bad'); },
    'of-scrap'() { if (V.sel >= 0) scrap(V.sel); else toast('Rottama', 'Trascina qui un’auto o un ricambio (o selezionalo e premi X).', 'bad'); },
    'of-sell'() { if (V.sel >= 0) scrap(V.sel); },
    'of-panel'(el) { openPanel(el.dataset.id); },
    'of-close'() { V.panel = null; drawPanel(); drawBottom(); },
    'of-coach-x'() { const s = S(); s.tut = 99; drawCoach(); },
    'of-regtab'(el) { V.regTab = +el.dataset.id; drawPanel(); },
    'of-racecar'(el) { V.raceCar = +el.dataset.id; drawPanel(); },
    'of-race-with'() { V.raceCar = V.sel; openPanel('gare'); },
    'of-race'(el) { startRace(el.dataset.id, +el.dataset.g); },
    'of-race-again'() { const L = V.lastRace; stopRace(); if (!L) return; const s = S(); const g = Math.min(3, Math.max(L.grade, C.eventGrade(s, L.evId) + 1)); startRace(L.evId, g); },
    'of-race-close'() { stopRace(); openPanel('gare'); },
    'of-research'(el) { const s = S(); if (C.doResearch(s, el.dataset.id)) { try { sfx.levelup(); } catch {} V.chance.clear(); afterChange(); save(); } },
    'of-claim'(el) { const s = S(); const r = C.claimMission(s, +el.dataset.id); if (r) { try { sfx.coin(); } catch {} toast('Missione completata', `+${r.tokens} gettoni, +${r.rp} telemetria${r.bonus ? ` e bonus di ${r.bonus} gettoni!` : ''}`); hudAll(); save(); } },
    'of-boost'(el) {
      const s = S(), r = C.useBoost(s, el.dataset.id, now());
      if (!r) return; if (r.fail === 'full') { toast('Officina piena', 'Libera qualche posto prima.', 'bad'); return; }
      try { sfx.go?.(); } catch {}
      if (r.coins) toast('Straordinario', `+${fmt(r.coins)} monete`);
      V.g?.sync(s.grid); afterChange(); save();
    },
    'of-prestige'() {
      const s = S(), g = C.prestigeGain(s); if (!g) return;
      App.confirm(`Iniziare la stagione ${s.season + 1}?`, `Officina, monete, ricerche e trofei della stagione ripartono da zero. Ricevi ${g} punti dinastia (+${Math.round(C.K.dpIncome * 100 * g)}% incasso per sempre).`, () => {
        C.prestige(s, now()); V.sel = -1; V.chance.clear(); V.regTab = 0; try { sfx.win(); } catch {}
        V.g?.setRegion(0, s.grid); afterChange(); save();
        toast(`Stagione ${s.season}`, 'Una nuova stagione per la tua dinastia. Spendi i punti nei vantaggi!');
      }, 'Nuova stagione');
    },
    'of-perk'(el) { const s = S(); if (C.buyPerk(s, el.dataset.id)) { try { sfx.levelup(); } catch {} afterChange(); save(); } },
  },
});
function openPanel(id) {
  V.panel = V.panel === id ? null : id;
  if (V.panel === 'missioni') C.ensureMissions(S(), now());
  drawPanel(); drawBottom();
  if (V.panel) requestAnimationFrame(() => document.querySelector('#of-panel .of-x')?.focus({ preventScroll: true }));
}
