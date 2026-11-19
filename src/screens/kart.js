// Kart Baso — menu (Gioca: modes and their setup; Garage; Coppe e record; Comandi), the live race,
// pause and results (single race, Grand Prix standings, time trial with ghost, battle, multiplayer).
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { CHARACTERS, BODIES, WHEELS, PAINTS, CLASSES, CUPS, TRACKS, ARENAS, THEMES, ITEMS, POINTS, kartStats, trackDef, charById } from '../kart/data.js';
import { kartLoad, kartSave, ghostLoad, ghostSave, cupOpen, trackOpen, trophyOf, autoUnlocks, ttTargets, PRIZE, clsMult, homeCup } from '../kart/store.js';
import { itemIcon, fmtT, PCOL } from '../kart/hud.js';
import '../kart/kart.css';

const V = { playing: false, game: null, from: 'launcher', tab: 'gioca', page: 'home', run: null, preview: null };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const MEDAL = ['', 'Bronzo', 'Argento', 'Oro'];
const medalChip = (m) => (m ? `<i class="kt-medal m${m}" title="${MEDAL[m]}">${m === 3 ? '★' : m === 2 ? '●' : '▲'}</i>` : '');
const trackGrad = (t) => { const T = THEMES[t.theme]; return `--a:${T.sky[0]};--b:${T.ground};--c:${T.road}`; };
const clsName = (id) => CLASSES.find((c) => c.id === id)?.name || id;
const INPUTS = [{ kb: 'kb1', pad: 0, label: 'Tastiera WASD + controller 1' }, { kb: 'kb2', pad: 1, label: 'Tastiera frecce + controller 2' }, { kb: null, pad: 2, label: 'Controller 3' }, { kb: null, pad: 3, label: 'Controller 4' }];
const PAGES = {
  gp: { icon: 'trophy', name: 'Gran Premio', desc: 'Quattro gare, punti e trofei: vinci le coppe per sbloccare piloti e piste.' },
  race: { icon: 'flag', name: 'Gara singola', desc: 'Una gara su qualsiasi pista sbloccata, anche al rovescio.' },
  tt: { icon: 'hourglass', name: 'Prova a tempo', desc: 'Solo tu, tre peperoncini e il fantasma del tuo record.' },
  battle: { icon: 'target', name: 'Battaglia', desc: 'Tre palloncini a testa nell’arena: l’ultimo che resta vince.' },
  multi: { icon: 'users', name: 'Multigiocatore', desc: 'Da 2 a 4 giocatori sullo stesso schermo: tastiera e controller.' },
};

// ───────── small pieces
function statBars(st) { return `<div class="kt-stats">${[['Velocità', st.spd], ['Accelerazione', st.acc], ['Peso', st.wgt], ['Maneggevolezza', st.han]].map(([n, v]) => `<div><span>${n}</span><i><b style="width:${Math.min(100, (v / 6) * 100)}%"></b></i></div>`).join('')}</div>`; }
function seg(action, list, cur) { return `<div class="kt-seg">${list.map(([id, label]) => `<button class="${String(cur) === String(id) ? 'on' : ''}" data-a="${action}" data-id="${id}">${label}</button>`).join('')}</div>`; }
function trackCards(p, sel, action, extra = () => '') {
  return `<div class="kt-tracks">${TRACKS.map((t) => { const open = trackOpen(p, t.id); return `<div class="kt-track ${sel === t.id ? 'on' : ''} ${open ? '' : 'locked'}" data-a="${action}" data-id="${t.id}" tabindex="0" style="${trackGrad(t)}"><i class="kt-track-art"></i><b>${esc(t.name)}</b><span>${open ? esc(t.sub) : `${icon('lock')} ${esc(CUPS[homeCup(t.id)].name)}`}</span>${extra(t)}</div>`; }).join('')}</div>`;
}
function wallet(p) { return `<div class="kt-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.games} gare · ${p.wins} vittorie · ${CUPS.filter((c) => trophyOf(p, c.id) > 0).length}/4 coppe</div></div>`; }

// ───────── tabs
function homeTab(p) {
  if (V.page !== 'home' && PAGES[V.page]) return setupPage(p);
  const ch = charById(p.sel.char);
  const gp = p.gp;
  return `<div class="kt-home">
    <section class="kt-hero" style="--c:${ch.color}">
      <div class="kt-hero-art"><canvas class="kt-preview" aria-label="Il tuo kart"></canvas></div>
      <div class="kt-hero-body">
        <div class="kt-k">Il tuo pilota</div><h2>${esc(ch.name)}</h2><p>${esc(ch.tag)} · ${esc(BODIES.find((b) => b.id === p.sel.body).name)} · ruote ${esc(WHEELS.find((w) => w.id === p.sel.wheels).name.toLowerCase())}</p>
        ${statBars(kartStats(p.sel.char, p.sel.body, p.sel.wheels))}
        <div class="kt-hero-btns">${gp ? `<button class="btn primary big" data-a="kt-gp-continue">${icon('play')} Continua ${esc(CUPS.find((c) => c.id === gp.cup).name)} · gara ${gp.round + 1}/4</button>` : `<button class="btn primary big" data-a="kt-page" data-id="gp">${icon('trophy')} Gran Premio</button>`}<button class="btn" data-a="kt-tab" data-id="garage">${icon('wrench')} Garage</button></div>
      </div>
    </section>
    <h3 class="kt-h">Modalità</h3>
    <div class="kt-modes">${Object.entries(PAGES).map(([id, m]) => `<div class="kt-mode" data-a="kt-page" data-id="${id}" tabindex="0">${icon(m.icon)}<div><b>${m.name}</b><span>${m.desc}</span></div></div>`).join('')}</div>
    <h3 class="kt-h">Oggetti</h3>
    <div class="kt-items">${Object.entries(ITEMS).map(([id, it]) => `<div class="kt-itm">${itemIcon(id, 40)}<div><b>${esc(it.name)}</b><span>${esc(it.desc)}</span></div></div>`).join('')}</div>
  </div>`;
}
function setupPage(p) {
  const m = PAGES[V.page];
  let body = '', go = '';
  if (V.page === 'gp') {
    body = `<section><h3 class="kt-h">Cilindrata</h3>${seg('kt-cls', CLASSES.map((c) => [c.id, `${c.name} <small>${c.cc}</small>`]), p.cls)}</section>
      <section><h3 class="kt-h">Coppa</h3><div class="kt-cups">${CUPS.map((c, i) => { const open = cupOpen(p, i); const tr = p.trophies[c.id] || {}; return `<div class="kt-cup ${p.cup === c.id ? 'on' : ''} ${open ? '' : 'locked'}" data-a="kt-cup" data-id="${c.id}" tabindex="0" style="--cc:${c.color}"><div class="kt-cup-ic">${icon(open ? 'trophy' : 'lock')}</div><b>${esc(c.name)}</b><ol>${c.races.map((r) => `<li>${esc(trackDef(r).name)}</li>`).join('')}</ol><div class="kt-cup-tr">${CLASSES.map((cl) => `<span title="${cl.name}">${tr[cl.id] ? medalChip(tr[cl.id]) : '<i class="kt-medal m0">·</i>'}</span>`).join('')}</div>${open ? '' : `<em>Vinci un trofeo nella ${esc(CUPS[i - 1].name)}</em>`}</div>`; }).join('')}</div></section>`;
    go = `<button class="btn primary big" data-a="kt-go-gp">${icon('play')} Via al Gran Premio</button>`;
  } else if (V.page === 'race') {
    body = `<section><h3 class="kt-h">Pista</h3>${trackCards(p, p.track, 'kt-track', (t) => (p.races[t.id] ? `<em>Miglior piazzamento ${p.races[t.id]}°</em>` : ''))}</section>
      <section class="kt-row3"><div><h3 class="kt-h">Verso</h3>${seg('kt-rev', [[0, 'Normale'], [1, 'Rovescio']], p.rev ? 1 : 0)}</div><div><h3 class="kt-h">Cilindrata</h3>${seg('kt-cls', CLASSES.map((c) => [c.id, c.name]), p.cls)}</div><div><h3 class="kt-h">Giri</h3>${seg('kt-laps', [[1, '1'], [3, '3'], [5, '5']], p.laps)}</div></section>`;
    go = `<button class="btn primary big" data-a="kt-go-race">${icon('play')} Via!</button>`;
  } else if (V.page === 'tt') {
    const key = p.track + (p.rev ? ':r' : '');
    const rec = p.tt[key], tg = ttTargets(key);
    body = `<section><h3 class="kt-h">Pista</h3>${trackCards(p, p.track, 'kt-track', (t) => { const r = p.tt[t.id]; return r ? `<em>${medalChip(r.medal)} ${fmtT(r.best)}</em>` : ''; })}</section>
      <section class="kt-row3"><div><h3 class="kt-h">Verso</h3>${seg('kt-rev', [[0, 'Normale'], [1, 'Rovescio']], p.rev ? 1 : 0)}</div>
      <div><h3 class="kt-h">Fantasma</h3>${seg('kt-ghost', [[1, 'Sì'], [0, 'No']], p.opt.ghost ? 1 : 0)}</div>
      <div><h3 class="kt-h">Medaglie · ${esc(trackDef(key).name)}</h3><div class="kt-targets"><span>${medalChip(3)} ${fmtT(tg.gold)}</span><span>${medalChip(2)} ${fmtT(tg.silver)}</span><span>${medalChip(1)} ${fmtT(tg.bronze)}</span></div>${rec ? `<div class="kt-rec">Record: <b>${fmtT(rec.best)}</b> · giro ${fmtT(rec.lap)}</div>` : ''}</div></section>`;
    go = `<button class="btn primary big" data-a="kt-go-tt">${icon('play')} Parti</button>`;
  } else if (V.page === 'battle') {
    body = `<section><h3 class="kt-h">Arena</h3><div class="kt-tracks two">${ARENAS.map((a) => `<div class="kt-track ${p.arena === a.id ? 'on' : ''}" data-a="kt-arena" data-id="${a.id}" tabindex="0" style="--a:${THEMES[a.theme].sky[0]};--b:${THEMES[a.theme].ground};--c:${THEMES[a.theme].wall[0]}"><i class="kt-track-art arena"></i><b>${esc(a.name)}</b><span>${esc(a.sub)}</span></div>`).join('')}</div></section>
      <section class="kt-row3"><div><h3 class="kt-h">Avversari</h3>${seg('kt-rivals', [[3, '3'], [5, '5']], p.rivals)}</div><div><h3 class="kt-h">Regole</h3><p class="kt-note">3 palloncini a testa, 2:30 di tempo. Ogni colpo ne fa scoppiare uno; speronare con un turbo lo ruba.</p></div></section>`;
    go = `<button class="btn primary big" data-a="kt-go-battle">${icon('play')} In arena</button>`;
  } else if (V.page === 'multi') {
    const M = p.mp;
    const rows = Array.from({ length: M.n }, (_, i) => { const c = charById(M.chars[i]); return `<div class="kt-mp-row" style="--pc:${PCOL[i]}"><b class="kt-mp-tag">G${i + 1}</b><button class="btn icon-btn sm" data-a="kt-mp-char" data-i="${i}" data-d="-1" aria-label="Pilota precedente">${icon('left')}</button><div class="kt-mp-ch" style="--c:${c.color}"><i></i><b>${esc(c.name)}</b></div><button class="btn icon-btn sm" data-a="kt-mp-char" data-i="${i}" data-d="1" aria-label="Pilota successivo">${icon('right')}</button><span class="kt-mp-in">${icon(INPUTS[i].kb ? 'keyboard' : 'gamepad')} ${INPUTS[i].label}</span></div>`; }).join('');
    body = `<section class="kt-row3"><div><h3 class="kt-h">Giocatori</h3>${seg('kt-mp-n', [[2, '2'], [3, '3'], [4, '4']], M.n)}</div><div><h3 class="kt-h">Modalità</h3>${seg('kt-mp-mode', [['race', 'Gara'], ['gp', 'Gran Premio'], ['battle', 'Battaglia']], M.mode)}</div><div><h3 class="kt-h">Cilindrata</h3>${seg('kt-mp-cls', CLASSES.map((c) => [c.id, c.name]), M.cls)}</div></section>
      <section><h3 class="kt-h">Piloti e comandi</h3><div class="kt-mp">${rows}</div><p class="kt-note">Collega i controller prima di partire (premi un tasto per farli riconoscere). Schermo diviso: i karts degli altri giocatori sono guidati dal computer fino a 8 in gara.</p></section>
      <section><h3 class="kt-h">${M.mode === 'battle' ? 'Arena' : M.mode === 'gp' ? 'Coppa' : 'Pista'}</h3>${M.mode === 'battle' ? `<div class="kt-tracks two">${ARENAS.map((a) => `<div class="kt-track ${M.arena === a.id ? 'on' : ''}" data-a="kt-mp-arena" data-id="${a.id}" tabindex="0" style="--a:${THEMES[a.theme].sky[0]};--b:${THEMES[a.theme].ground};--c:${THEMES[a.theme].wall[0]}"><i class="kt-track-art arena"></i><b>${esc(a.name)}</b><span>${esc(a.sub)}</span></div>`).join('')}</div>` : M.mode === 'gp' ? `<div class="kt-cups">${CUPS.map((c, i) => `<div class="kt-cup ${M.cup === c.id ? 'on' : ''} ${cupOpen(p, i) ? '' : 'locked'}" data-a="kt-mp-cup" data-id="${c.id}" tabindex="0" style="--cc:${c.color}"><div class="kt-cup-ic">${icon(cupOpen(p, i) ? 'trophy' : 'lock')}</div><b>${esc(c.name)}</b><ol>${c.races.map((r) => `<li>${esc(trackDef(r).name)}</li>`).join('')}</ol></div>`).join('')}</div>` : trackCards(p, M.track, 'kt-mp-track')}</section>`;
    go = `<button class="btn primary big" data-a="kt-go-mp">${icon('play')} Via con ${M.n} giocatori</button>`;
  }
  return `<div class="kt-setup">
    <div class="kt-setup-h"><button class="btn ghost sm" data-a="kt-page" data-id="home">${icon('left')} Modalità</button><div>${icon(m.icon)}<b>${m.name}</b><span>${m.desc}</span></div></div>
    ${body}
    <div class="kt-go">${go}</div>
  </div>`;
}
function garageTab(p) {
  const st = kartStats(p.sel.char, p.sel.body, p.sel.wheels);
  const priced = (owned, cost) => (owned ? '' : `<em>${icon('coin')} ${cost}</em>`);
  return `<div class="kt-garage">
    <section class="kt-gar-prev"><canvas class="kt-preview" aria-label="Anteprima del kart"></canvas>${statBars(st)}</section>
    <div class="kt-gar-opts">
      <section><h3 class="kt-h">Pilota</h3><div class="kt-chars">${CHARACTERS.map((c) => { const own = p.chars.includes(c.id); return `<div class="kt-char ${p.sel.char === c.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="kt-char" data-id="${c.id}" tabindex="0" style="--c:${c.color}"><i class="kt-face kt-face-${c.look}" style="--s:${c.skin};--h:${c.hat}"></i><b>${esc(c.name)}</b><span>${own ? esc(c.tag) : `${icon('lock')} ${esc(CUPS[c.cup].name)} o ${c.cost} monete`}</span></div>`; }).join('')}</div></section>
      <section><h3 class="kt-h">Telaio</h3><div class="kt-parts">${BODIES.map((b) => { const own = p.bodies.includes(b.id); return `<div class="kt-part ${p.sel.body === b.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="kt-body" data-id="${b.id}" tabindex="0"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>${priced(own, b.cost)}</div>`; }).join('')}</div></section>
      <section><h3 class="kt-h">Ruote</h3><div class="kt-parts">${WHEELS.map((w) => { const own = p.wheels.includes(w.id); return `<div class="kt-part ${p.sel.wheels === w.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="kt-wheels" data-id="${w.id}" tabindex="0"><b>${esc(w.name)}</b><span>${esc(w.desc)}</span>${priced(own, w.cost)}</div>`; }).join('')}</div></section>
      <section><h3 class="kt-h">Vernice</h3><div class="kt-paints">${PAINTS.map((c) => { const own = p.paints.includes(c.id); const col = c.color || charById(p.sel.char).color; return `<button class="kt-paint ${p.sel.paint === c.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="kt-paint" data-id="${c.id}" title="${esc(c.name)}${own ? '' : ` · ${c.cost} monete`}" style="--p:${c.rainbow ? 'linear-gradient(90deg,#ff4d6d,#ffd23f,#3ee6b0,#49b6ff,#b28bff)' : col}"><i></i><span>${esc(c.name)}</span>${own ? '' : `<em>${c.cost}</em>`}</button>`; }).join('')}</div></section>
    </div>
  </div>`;
}
function cupsTab(p) {
  return `<div class="kt-records">
    <section><h3 class="kt-h">Trofei</h3><table class="kt-table"><thead><tr><th>Coppa</th>${CLASSES.map((c) => `<th>${c.name}<small>${c.cc}</small></th>`).join('')}</tr></thead><tbody>${CUPS.map((c, i) => `<tr class="${cupOpen(p, i) ? '' : 'locked'}"><td><b style="color:${c.color}">${esc(c.name)}</b></td>${CLASSES.map((cl) => `<td>${p.trophies[c.id]?.[cl.id] ? `${medalChip(p.trophies[c.id][cl.id])} ${MEDAL[p.trophies[c.id][cl.id]]}` : cupOpen(p, i) ? '—' : icon('lock')}</td>`).join('')}</tr>`).join('')}</tbody></table></section>
    <section><h3 class="kt-h">Prova a tempo</h3><table class="kt-table"><thead><tr><th>Pista</th><th>Normale</th><th>Rovescio</th></tr></thead><tbody>${TRACKS.map((t) => `<tr><td>${esc(t.name)}</td>${[t.id, t.id + ':r'].map((k) => `<td>${p.tt[k] ? `${medalChip(p.tt[k].medal)} ${fmtT(p.tt[k].best)}` : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></section>
    <section><h3 class="kt-h">Statistiche</h3><div class="kt-nums"><div><b>${p.games}</b><span>gare</span></div><div><b>${p.wins}</b><span>vittorie</span></div><div><b>${p.podiums}</b><span>podi</span></div><div><b>${p.battleWins}/${p.battles}</b><span>battaglie vinte</span></div><div><b>${fmt(p.itemsUsed)}</b><span>oggetti usati</span></div><div><b>${fmt(p.coinsTotal)}</b><span>monete raccolte</span></div></div></section>
  </div>`;
}
function controlsTab(p) {
  const k = (s) => s.split(' ').map((x) => `<span class="kbd">${x}</span>`).join(' ');
  return `<div class="kt-ctrl">
    <section><h3 class="kt-h">Tastiera · 1 giocatore</h3><dl><dt>${k('W ↑')}</dt><dd>Accelera</dd><dt>${k('S ↓')}</dt><dd>Frena / retromarcia (e lancia all’indietro)</dd><dt>${k('A D ← →')}</dt><dd>Sterza</dd><dt>${k('Spazio Shift')}</dt><dd>Salto e derapata (tienilo premuto in curva)</dd><dt>${k('E F Q Invio')}</dt><dd>Usa l’oggetto</dd><dt>${k('Esc P')}</dt><dd>Pausa</dd></dl></section>
    <section><h3 class="kt-h">Tastiera · 2 giocatori</h3><dl><dt>G1</dt><dd>${k('W A S D')} · derapata ${k('Spazio')} · oggetto ${k('E')}</dd><dt>G2</dt><dd>${k('← ↑ → ↓')} · derapata ${k('Shift')} destro / ${k('.')} · oggetto ${k('Invio')} / ${k('-')}</dd></dl></section>
    <section><h3 class="kt-h">Controller</h3><dl><dt>Stick / croce</dt><dd>Sterza</dd><dt>A · RT</dt><dd>Accelera</dd><dt>B · LT</dt><dd>Frena</dd><dt>RB</dt><dd>Salto e derapata</dd><dt>LB · X</dt><dd>Oggetto (stick giù: all’indietro)</dd><dt>Start</dt><dd>Pausa</dd></dl></section>
    <section><h3 class="kt-h">Touch</h3><p class="kt-note">A sinistra trascina per sterzare; a destra <b>Derapa</b>, <b>Oggetto</b> e <b>Freno</b>. Il gas è automatico (si può spegnere in gara).</p>
      <h3 class="kt-h mt16">Opzioni</h3>${seg('kt-autogas', [[1, 'Gas automatico sul touch'], [0, 'Gas manuale']], p.opt.autoGas ? 1 : 0)}</section>
    <section><h3 class="kt-h">Trucchi da pilota</h3><ul class="kt-tips"><li><b>Mini-turbo</b>: tieni la derapata in curva finché le scintille diventano azzurre, poi arancioni e viola; rilascia per lo scatto.</li><li><b>Partenza a razzo</b>: premi il gas quando si accende la seconda luce.</li><li><b>Acrobazia</b>: premi derapata appena sali da un trampolino: turbo all’atterraggio.</li><li><b>Monete</b>: ognuna aumenta un poco la velocità massima (fino a 10). Un colpo te ne fa perdere.</li><li><b>Scorciatoie</b>: sterrate e più lente, ma con un peperoncino si vola.</li></ul></section>
  </div>`;
}

function menu(p) {
  const tabs = [['gioca', 'play', 'Gioca'], ['garage', 'wrench', 'Garage'], ['coppe', 'trophy', 'Coppe e record'], ['comandi', 'gamepad', 'Comandi']];
  const body = V.tab === 'garage' ? garageTab(p) : V.tab === 'coppe' ? cupsTab(p) : V.tab === 'comandi' ? controlsTab(p) : homeTab(p);
  return `<div class="full-screen kt-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Corse', title: 'Kart Baso', sub: 'Derapate, peperoncini e ricciolini: le corse più pazze del quartiere.', right: wallet(p) })}
    <nav class="kt-tabs" role="tablist">${tabs.map(([id, ic, n]) => `<button role="tab" aria-selected="${V.tab === id}" class="${V.tab === id ? 'on' : ''}" data-a="kt-tab" data-id="${id}">${icon(ic)} ${n}</button>`).join('')}</nav>
    <div class="kt-body">${body}</div>
  </div>`;
}

// ───────── start a game
function playerSel(p, i = 0, char) { return { char: char || p.sel.char, body: i === 0 ? p.sel.body : 'classico', wheels: i === 0 ? p.sel.wheels : 'standard', paint: i === 0 ? p.sel.paint : 'auto', input: { ...INPUTS[i] } }; }
export function playKart(run) {
  V.run = run; V.playing = true; V.result = null;
  if (App.cur === 'kart') App.refresh(); else App.go('kart', { from: V.from || 'launcher' });
}
function seedNow() { return (Date.now() % 100000) + 1; }
function startGP(p, multi) {
  const n = multi ? p.mp.n : 1;
  const players = multi ? Array.from({ length: n }, (_, i) => playerSel(p, i, p.mp.chars[i])) : [playerSel(p, 0)];
  if (!multi) players[0].input = { kb: 'all', pad: 0 };
  const cup = multi ? p.mp.cup : p.cup;
  const used = new Set(players.map((x) => x.char));
  const rivals = CHARACTERS.filter((c) => !used.has(c.id)).slice(0, 8 - n).map((c, i) => ({ char: c.id, body: BODIES[(i * 3) % BODIES.length].id, wheels: WHEELS[(i * 5 + 1) % WHEELS.length].id, paint: 'auto', human: -1 }));
  const field = [...rivals, ...players.map((x, i) => ({ char: x.char, body: x.body, wheels: x.wheels, paint: x.paint, human: i, name: n > 1 ? `G${i + 1} · ${charById(x.char).name}` : charById(x.char).name }))].map((k, i) => ({ ...k, fid: i }));
  p.gp = { cup, cls: multi ? p.mp.cls : p.cls, round: 0, pts: {}, field, players, multi: !!multi };
  kartSave(p);
  nextGP(p);
}
function nextGP(p) {
  const G = p.gp; if (!G) return;
  const race = CUPS.find((c) => c.id === G.cup).races[G.round];
  // grid: worst in the standings at the front, the leader at the back
  const field = G.field.slice().sort((a, b) => (G.pts[a.fid] || 0) - (G.pts[b.fid] || 0) || b.fid - a.fid);
  playKart({ mode: 'race', track: race, laps: 3, cls: G.cls, players: G.players, field, gp: true, seed: seedNow() });
}
function stopGame() { V.game?.destroy(); V.game = null; window.__kart = null; }

// ───────── results
function resultsHtml(r, p, extra) {
  const S = r.order, me = r.players[0];
  const multi = r.players.length > 1;
  let title, k = '';
  if (r.mode === 'battle') { title = multi ? `Vince ${S[0].name}!` : me.place === 1 ? 'Sei l’ultimo in piedi!' : me.out ? 'Palloncini finiti!' : `${me.place}° posto`; k = `Battaglia · ${esc(ARENAS.find((a) => a.id === r.track)?.name || '')}`; }
  else if (r.mode === 'tt') { title = extra.record ? 'Nuovo record!' : 'Prova completata'; k = `Prova a tempo · ${esc(trackDef(r.track).name)}`; }
  else { title = multi ? `Vince ${S[0].name}!` : me.place === 1 ? 'Vittoria!' : me.place <= 3 ? `Podio: ${me.place}° posto!` : `${me.place}° posto`; k = `${r.gp ? `${esc(CUPS.find((c) => c.id === p.gp?.cup || extra.cup)?.name || '')} · gara ${extra.round}/4 · ` : ''}${esc(trackDef(r.track).name)} · ${clsName(r.cls)}`; }
  const rows = S.map((x) => `<li class="${x.human >= 0 ? 'me' : ''}" style="--c:${charById(x.char).color}${x.human >= 0 && multi ? `;--pc:${PCOL[x.human]}` : ''}"><span>${x.place}</span><i></i><b>${esc(x.name)}</b>${r.mode === 'battle' ? `<em>${x.out ? 'fuori' : '●'.repeat(x.balloons)} · ${x.hits} colpi</em>` : `<em>${x.est ? '~' : ''}${fmtT(x.time)}</em>`}${extra.gain?.[x.i] != null ? `<strong>+${extra.gain[x.i]}</strong>` : ''}</li>`).join('');
  const tt = r.mode === 'tt' ? `<div class="kt-res-tt"><div class="kt-res-big">${fmtT(me.time)}</div><div class="kt-res-laps">${me.laps.map((l, i) => `<span>Giro ${i + 1} <b>${fmtT(l)}</b></span>`).join('')}</div>${extra.medal ? `<div class="kt-res-medal">${medalChip(extra.medal)} Medaglia d’${MEDAL[extra.medal].toLowerCase()}${extra.newMedal ? ' · nuova!' : ''}</div>` : `<div class="kt-res-medal">Bronzo a ${fmtT(extra.targets.bronze)}</div>`}</div>` : '';
  const standings = extra.standings ? `<h3 class="kt-h">Classifica del Gran Premio</h3><ol class="kt-res-rank gp">${extra.standings.map((x, i) => `<li class="${x.human >= 0 ? 'me' : ''}" style="--c:${charById(x.char).color}"><span>${i + 1}</span><i></i><b>${esc(x.name || charById(x.char).name)}</b><em>${x.pts} pt</em></li>`).join('')}</ol>` : '';
  const btns = extra.gpNext ? `<button class="btn primary" data-a="kt-gp-next">${icon('play')} Gara ${extra.round + 1}/4: ${esc(trackDef(extra.gpNext).name)}</button><button class="btn ghost" data-a="kt-gp-quit">${icon('x')} Abbandona il GP</button>`
    : `<button class="btn primary" data-a="kt-again">${icon('replay')} ${r.mode === 'battle' ? 'Rivincita' : r.gp ? 'Nuovo GP' : 'Riprova'}</button><button class="btn" data-a="kt-back">${icon('left')} Menu Kart</button><button class="btn ghost" data-a="kt-hall">${icon('gamepad')} Baso Hub</button>`;
  return `<div class="kt-res" role="dialog" aria-label="Risultati"><div class="kt-res-card ${extra.trophy ? 'trophy' : ''}">
    <div class="kt-res-k">${k}</div><h2>${title}</h2>
    ${extra.trophy ? `<div class="kt-trophy t${extra.trophy}">${icon('trophy')}<b>Trofeo ${MEDAL[extra.trophy].toLowerCase()}</b><span>${esc(CUPS.find((c) => c.id === extra.cup).name)} · ${clsName(extra.cls)}</span></div>` : ''}
    ${tt}
    ${r.mode !== 'tt' ? `<ol class="kt-res-rank">${rows}</ol>` : ''}
    ${standings}
    <div class="kt-res-coins">${icon('coin')} <b>+${extra.coins}</b> monete${extra.coinsWhy ? ` <small>${extra.coinsWhy}</small>` : ''}</div>
    ${extra.unlocks?.length ? `<div class="kt-res-unl">${extra.unlocks.map((u) => `<span>${icon('star')} Sbloccato: <b>${esc(u)}</b></span>`).join('')}</div>` : ''}
    <div class="kt-res-btns">${btns}</div>
  </div></div>`;
}
function onEnd(res) {
  const p = kartLoad(), run = V.run || {};
  const extra = { coins: 0, unlocks: [], gain: {} };
  const me = res.players[0];
  const multi = res.players.length > 1;
  const best = res.players.reduce((a, b) => (b.place < a.place ? b : a), me);
  p.games++;
  p.itemsUsed += res.players.reduce((a, x) => a + (x.stats?.items || 0), 0);
  p.coinsTotal += res.players.reduce((a, x) => a + (x.coins || 0), 0);
  if (res.mode === 'battle') {
    p.battles++; if (best.place === 1) p.battleWins++;
    extra.coins = (best.place === 1 ? 60 : best.place === 2 ? 25 : 10) + 10 * res.players.reduce((a, x) => a + x.hits, 0);
    extra.coinsWhy = 'piazzamento e colpi';
  } else if (res.mode === 'tt') {
    const key = res.track, tg = extra.targets = ttTargets(key), rec = p.tt[key];
    const t = me.time; const medal = t <= tg.gold ? 3 : t <= tg.silver ? 2 : t <= tg.bronze ? 1 : 0;
    extra.medal = medal; extra.newMedal = medal > (rec?.medal || 0);
    extra.record = !rec || t < rec.best;
    if (extra.newMedal) extra.coins += [0, 50, 90, 150][medal] - [0, 50, 90, 150][rec?.medal || 0];
    extra.coins += Math.min(10, me.coins);
    p.tt[key] = { best: Math.min(rec?.best ?? Infinity, t), lap: Math.min(rec?.lap ?? Infinity, me.best || Infinity), medal: Math.max(medal, rec?.medal || 0) };
    if (extra.record && res.trace?.length) ghostSave(key, res.trace);
    extra.coinsWhy = extra.newMedal ? 'nuova medaglia' : 'monete raccolte';
  } else {
    const m = clsMult(res.cls);
    extra.coins = Math.round(PRIZE[best.place - 1] * m) + res.players.reduce((a, x) => a + Math.min(10, x.coins), 0);
    extra.coinsWhy = 'premio e monete raccolte';
    if (best.place === 1) p.wins++; if (best.place <= 3) p.podiums++;
    if (!multi) p.races[res.track] = Math.min(p.races[res.track] || 99, me.place);
    if (run.gp && p.gp) {
      const G = p.gp;
      const fidOf = (kartI) => run.field[kartI]?.fid;
      res.order.forEach((x) => { const f = fidOf(x.i); const pts = POINTS[x.place - 1] || 0; G.pts[f] = (G.pts[f] || 0) + pts; extra.gain[x.i] = pts; });
      G.round++;
      extra.round = G.round; extra.cup = G.cup; extra.cls = G.cls;
      extra.standings = G.field.map((f) => ({ ...f, pts: G.pts[f.fid] || 0 })).sort((a, b) => b.pts - a.pts || (b.human - a.human));
      const races = CUPS.find((c) => c.id === G.cup).races;
      if (G.round < races.length) extra.gpNext = races[G.round];
      else {
        // cup over: trophy for the best human in the final standings
        const pos = extra.standings.findIndex((x) => x.human >= 0) + 1;
        const tr = pos === 1 ? 3 : pos === 2 ? 2 : pos === 3 ? 1 : 0;
        if (tr) {
          extra.trophy = tr;
          p.trophies[G.cup] = { ...(p.trophies[G.cup] || {}) };
          const prev = p.trophies[G.cup][G.cls] || 0;
          if (tr > prev) { p.trophies[G.cup][G.cls] = tr; extra.coins += Math.round([0, 120, 200, 300][tr] * m); }
          const before = CUPS.map((_, i) => cupOpen(p, i));
          for (const c of autoUnlocks(p)) extra.unlocks.push(c.name);
          CUPS.forEach((c, i) => { if (!before[i] && cupOpen(p, i)) extra.unlocks.push(`${c.name} e le sue piste`); });
        }
        p.gp = null;
      }
    }
  }
  p.coins += extra.coins;
  kartSave(p);
  V.result = { res, extra };
  const ov = document.getElementById('kt-over'); if (!ov || !V.playing) return;
  ov.innerHTML = resultsHtml({ ...res, gp: run.gp }, p, extra);
  try { (me.place === 1 || extra.record || extra.trophy) ? sfx.win() : sfx.ok(); } catch {}
  requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
}

// ───────── preview turntable
async function mountPreview() {
  V.preview?.destroy(); V.preview = null;
  const cv = document.querySelector('.kt-preview'); if (!cv) return;
  if (gfxTier() === 'low' && V.tab !== 'garage') return;
  try { const { KartPreview } = await import('../kart/preview.js'); if (!cv.isConnected) return; V.preview = new KartPreview(cv); V.preview.set(kartLoad().sel); } catch (e) { console.warn('kart preview', e); }
}

registerScreen({
  id: 'kart', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.page && !V.playing) { if (PAGES[params.page]) { V.tab = 'gioca'; V.page = params.page; } delete params.page; }
    if (params?.tab) { V.tab = params.tab; delete params.tab; }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; const p = kartLoad(); if (p.gp) setTimeout(() => nextGP(kartLoad())); else { V.tab = 'gioca'; V.page = 'gp'; } }
    if (V.playing) return `<div class="kt-stage dz-root" id="kt-root"><div class="kt-loading"><b>Kart Baso</b><span>Si scaldano i motori…</span></div></div><div class="kt-over" id="kt-over"></div>`;
    return menu(kartLoad());
  },
  async mount() {
    if (!V.playing) { mountPreview(); requestAnimationFrame(() => (document.querySelector('.kt-go .btn, .kt-hero .btn.primary'))?.focus({ preventScroll: true })); return; }
    V.preview?.destroy(); V.preview = null;
    const root = document.getElementById('kt-root');
    const run = V.run;
    try { music.setMood?.('derby'); } catch {}
    const { KartGame } = await import('../kart/game.js');
    if (!V.playing || !root.isConnected) return;
    const s = getSettings(), p = kartLoad();
    const ghost = run.mode === 'tt' && p.opt.ghost ? ghostLoad(run.track) : null;
    const g = V.game = new KartGame(root, {
      ...run, tier: gfxTier(), ghost, autoGas: p.opt.autoGas, volume: s.sound === false ? 0 : 1,
      onPause: (on) => {
        const ov = document.getElementById('kt-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="kt-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p>${esc(run.mode === 'battle' ? ARENAS.find((a) => a.id === run.track)?.name : trackDef(run.track).name)}</p><button class="btn primary" data-a="kt-resume">${icon('play')} Riprendi</button><button class="btn" data-a="kt-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="kt-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => onEnd(r),
    });
    window.__kart = { game: g, get sim() { return g.sim; }, step: (n) => g.step(n), summary: () => g.sim.summary(), pause: (on) => g.togglePause(on) };
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="kt-loading"><b>Impossibile avviare la gara</b><span>${esc(e.message || String(e))}</span><button class="btn mt16" data-a="kt-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; V.preview?.destroy(); V.preview = null; },
  actions: {
    'kt-tab'(el) { V.tab = el.dataset.id; if (V.tab === 'gioca') V.page = 'home'; App.refresh(); },
    'kt-page'(el) { V.tab = 'gioca'; V.page = el.dataset.id; App.refresh(); },
    'kt-cls'(el) { const p = kartLoad(); p.cls = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-laps'(el) { const p = kartLoad(); p.laps = +el.dataset.id; kartSave(p); App.refresh(); },
    'kt-rev'(el) { const p = kartLoad(); p.rev = el.dataset.id === '1'; kartSave(p); App.refresh(); },
    'kt-ghost'(el) { const p = kartLoad(); p.opt.ghost = el.dataset.id === '1'; kartSave(p); App.refresh(); },
    'kt-autogas'(el) { const p = kartLoad(); p.opt.autoGas = el.dataset.id === '1'; kartSave(p); App.refresh(); },
    'kt-rivals'(el) { const p = kartLoad(); p.rivals = +el.dataset.id; kartSave(p); App.refresh(); },
    'kt-arena'(el) { const p = kartLoad(); p.arena = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-cup'(el) { const p = kartLoad(), i = CUPS.findIndex((c) => c.id === el.dataset.id); if (!cupOpen(p, i)) { sfx.bad?.(); App.toast('Coppa bloccata', `Vinci un trofeo nella ${CUPS[i - 1].name} per aprirla.`, 'bad'); return; } p.cup = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-track'(el) { const p = kartLoad(); if (!trackOpen(p, el.dataset.id)) { sfx.bad?.(); App.toast('Pista bloccata', `Si apre con la ${CUPS[homeCup(el.dataset.id)].name}.`, 'bad'); return; } p.track = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-go-race'() { const p = kartLoad(); playKart({ mode: 'race', track: p.track + (p.rev ? ':r' : ''), laps: p.laps, cls: p.cls, players: [{ ...playerSel(p), input: { kb: 'all', pad: 0 } }], seed: seedNow() }); },
    'kt-go-tt'() { const p = kartLoad(); playKart({ mode: 'tt', track: p.track + (p.rev ? ':r' : ''), laps: 3, cls: 'normale', players: [{ ...playerSel(p), input: { kb: 'all', pad: 0 } }], seed: 1 }); },
    'kt-go-battle'() { const p = kartLoad(); playKart({ mode: 'battle', track: p.arena, cls: p.cls, n: p.rivals + 1, players: [{ ...playerSel(p), input: { kb: 'all', pad: 0 } }], seed: seedNow() }); },
    'kt-go-gp'() { const p = kartLoad(); if (p.gp) { App.confirm('Nuovo Gran Premio?', 'Il Gran Premio in corso verrà abbandonato.', () => startGP(kartLoad(), false)); return; } startGP(p, false); },
    'kt-gp-continue'() { nextGP(kartLoad()); },
    'kt-gp-next'() { stopGame(); nextGP(kartLoad()); },
    'kt-gp-quit'() { const p = kartLoad(); p.gp = null; kartSave(p); stopGame(); V.playing = false; App.refresh(); },
    'kt-go-mp'() {
      const p = kartLoad(), M = p.mp;
      if (M.mode === 'gp') { if (!cupOpen(p, CUPS.findIndex((c) => c.id === M.cup))) { App.toast('Coppa bloccata', 'Sbloccala nel Gran Premio a un giocatore.', 'bad'); return; } startGP(p, true); return; }
      const players = Array.from({ length: M.n }, (_, i) => playerSel(p, i, M.chars[i]));
      if (M.mode === 'battle') playKart({ mode: 'battle', track: M.arena, cls: M.cls, n: Math.max(4, M.n + 2), players, seed: seedNow() });
      else playKart({ mode: 'race', track: M.track, laps: 3, cls: M.cls, players, seed: seedNow() });
    },
    'kt-mp-n'(el) { const p = kartLoad(); p.mp.n = +el.dataset.id; kartSave(p); App.refresh(); },
    'kt-mp-mode'(el) { const p = kartLoad(); p.mp.mode = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-mp-cls'(el) { const p = kartLoad(); p.mp.cls = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-mp-arena'(el) { const p = kartLoad(); p.mp.arena = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-mp-cup'(el) { const p = kartLoad(); p.mp.cup = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-mp-track'(el) { const p = kartLoad(); if (!trackOpen(p, el.dataset.id)) { sfx.bad?.(); App.toast('Pista bloccata', `Si apre con la ${CUPS[homeCup(el.dataset.id)].name}.`, 'bad'); return; } p.mp.track = el.dataset.id; kartSave(p); App.refresh(); },
    'kt-mp-char'(el) {
      const p = kartLoad(), i = +el.dataset.i, d = +el.dataset.d, list = p.chars;
      let j = list.indexOf(p.mp.chars[i]);
      for (let t = 0; t < list.length; t++) { j = (j + d + list.length) % list.length; if (!p.mp.chars.slice(0, p.mp.n).some((c, q) => q !== i && c === list[j])) break; }
      p.mp.chars[i] = list[j]; kartSave(p); App.refresh();
    },
    'kt-char'(el) {
      const p = kartLoad(), c = CHARACTERS.find((x) => x.id === el.dataset.id); if (!c) return;
      if (p.chars.includes(c.id)) { p.sel.char = c.id; kartSave(p); App.refresh(); return; }
      if (p.coins < c.cost) { sfx.bad?.(); App.toast('Pilota bloccato', `${c.name} arriva vincendo la ${CUPS[c.cup].name}, oppure con ${c.cost} monete (ne hai ${p.coins}).`, 'bad'); return; }
      App.confirm(`Ingaggiare ${c.name}?`, `Costa ${c.cost} monete (ne hai ${p.coins}).`, () => { const q = kartLoad(); q.coins -= c.cost; q.chars.push(c.id); q.sel.char = c.id; kartSave(q); sfx.coin?.(); App.refresh(); });
    },
    'kt-body'(el) { buyPart('bodies', 'body', BODIES, el.dataset.id, 'telaio'); },
    'kt-wheels'(el) { buyPart('wheels', 'wheels', WHEELS, el.dataset.id, 'ruote'); },
    'kt-paint'(el) { buyPart('paints', 'paint', PAINTS, el.dataset.id, 'vernice'); },
    'kt-resume'() { V.game?.togglePause(false); },
    'kt-restart'() { const run = V.run; stopGame(); V.playing = true; V.run = { ...run, seed: seedNow() }; App.refresh(); },
    'kt-again'() {
      const run = V.run; stopGame();
      if (run.gp) { const p = kartLoad(); startGP(p, (run.players || []).length > 1); return; }
      V.playing = true; V.run = { ...run, seed: seedNow() }; App.refresh();
    },
    'kt-quit'() { stopGame(); V.playing = false; App.refresh(); },
    'kt-back'() { stopGame(); V.playing = false; App.refresh(); },
    'kt-hall'() { stopGame(); V.playing = false; App.go('launcher'); },
  },
});
function buyPart(listKey, selKey, list, id, what) {
  const p = kartLoad(), it = list.find((x) => x.id === id); if (!it) return;
  if (p[listKey].includes(id)) { p.sel[selKey] = id; kartSave(p); App.refresh(); return; }
  if (p.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${it.name}».`, 'bad'); return; }
  App.confirm(`Comprare ${what} «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = kartLoad(); q.coins -= it.cost; q[listKey].push(id); q.sel[selKey] = id; kartSave(q); sfx.coin?.(); App.refresh(); });
}
// tests and tools can start any configuration directly
if (typeof window !== 'undefined') window.__kartPlay = (run) => playKart({ players: [{ char: 'baso', input: { kb: 'all', pad: 0 } }], laps: 3, cls: 'normale', seed: 1, ...run });
