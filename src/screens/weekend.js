// Circuit race weekend: Practice (setup) → Qualifying → Race → Results
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge, carSVG, trackSVG } from '../ui/art.js';
import { esc, bar, fmtTime, fmtGap } from '../ui/dom.js';
import { S, saveGame, getSettings } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, teamDrivers, applyRoundResults, standings, seatsPerTeam, aiFillSeats, addMail } from '../engine/season.js';
import { buildEntries, runQualifying, makeWeatherPlan, raceLaps, CircuitSim, aiSetupQuality } from '../engine/race.js';
import { COMPOUNDS } from '../data/categories.js';
import { genCircuit, TrackView } from '../ui/trackview.js';
import { mulberry32, clamp, chance, rand } from '../engine/rng.js';
import { tyreBadge, teamStripe, driverChip } from './common.js';
import { sfx, engineStart, engineSet, engineStop } from '../ui/audio.js';
import { celebrate } from './results.js';

const SETUP_PARAMS = [
  { id: 'aero', name: 'Carico Aerodinamico', lo: 'Poco carico: la macchina scivola in curva', hi: 'Troppo carico: lenti sul dritto' },
  { id: 'susp', name: 'Rigidezza Sospensioni', lo: 'Troppo morbida: rollio eccessivo', hi: 'Troppo rigida: salta sui cordoli' },
  { id: 'height', name: 'Altezza da Terra', lo: 'Troppo bassa: tocca il fondo', hi: 'Troppo alta: perdiamo carico' },
  { id: 'gear', name: 'Rapporti Cambio', lo: 'Rapporti corti: limitatore in rettilineo', hi: 'Rapporti lunghi: poca spinta in uscita' },
  { id: 'brake', name: 'Bilanciamento Freni', lo: 'Troppo dietro: il posteriore si scompone', hi: 'Troppo avanti: blocca l’anteriore' },
];

function shortName(n) { const p = n.split(' '); return (p[p.length - 1] || n).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); }
export { shortName };

function idealFor(st, key, trackSeed) {
  const r = mulberry32((trackSeed * 31 + key.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 17 + st.season) >>> 0);
  return Object.fromEntries(SETUP_PARAMS.map((p) => [p.id, Math.round(15 + r() * 70)]));
}
function setupQuality(vals, ideal) {
  const diffs = SETUP_PARAMS.map((p) => Math.abs(vals[p.id] - ideal[p.id]));
  const m = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return clamp(1 - (m / 40) ** 0.9, 0, 1);
}

function initWeekend(st) {
  const ev = st.calendar[st.round];
  const tr = getTrack(st.category, ev.trackId);
  const t = playerTeam(st);
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  const laps = raceLaps(st, tr);
  const weather = makeWeatherPlan(tr, laps);
  const sim = t.facilities.simulator;
  st.weekend = {
    trackId: tr.id, phase: 'practice', laps,
    weather: { plan: weather.plan, isRain: weather.isRain, summary: weather.summary },
    qualiRain: chance(tr.rain * 0.7) ? rand(0.2, 0.8) : 0,
    cars: Object.fromEntries(entries.map((e) => [e.key, { runs: 4 + Math.floor(sim / 2), vals: Object.fromEntries(SETUP_PARAMS.map((p) => [p.id, 50])), fb: null, q: 0.3, laps: [], ideal: idealFor(st, e.key, tr.seed) }])),
    risk: {}, startTyre: {}, quali: null,
  };
}

function ensureSeats(st) {
  const t = playerTeam(st);
  if (teamDrivers(st, t).length < seatsPerTeam(st)) {
    aiFillSeats(st, t);
    addMail(st, { from: 'Ufficio Contratti', icon: 'driver', type: 'bad', subject: 'Pilota di riserva chiamato', body: 'Avevamo un sedile libero: abbiamo ingaggiato d’urgenza un pilota disponibile. Puoi sostituirlo dal Mercato.' });
  }
}

registerScreen({
  id: 'weekend', full: true,
  render() {
    const st = S();
    if (!st.weekend) { ensureSeats(st); initWeekend(st); }
    const w = st.weekend;
    if (w.phase === 'race') return raceScreen(st);
    const tr = getTrack(st.category, w.trackId);
    const steps = [['practice', 'Prove Libere'], ['quali', st.category === 'endurance' ? 'Hyperpole' : 'Qualifiche'], ['race', 'Gara']];
    const idx = steps.findIndex((s) => s[0] === w.phase);
    return `<div style="position:fixed;inset:0;display:flex;flex-direction:column">
      <div class="race-top" style="height:64px">
        <button class="btn ghost icon-btn" data-a="exit">${icon('left')}</button>
        ${flagSVG(tr.nat, 34, 22)}<div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:22px;text-transform:uppercase;line-height:1">${esc(tr.name)}</div><div class="tiny muted upper">${esc(tr.circuit)} · ${w.laps} giri · Round ${st.round + 1}/${st.calendar.length}</div></div>
        <div class="grow"></div>
        <div class="stepper">${steps.map((s, i) => `${i ? '<div class="step-line"></div>' : ''}<div class="step ${i < idx ? 'done' : i === idx ? 'cur' : ''}"><div class="n">${i < idx ? '✓' : i + 1}</div>${s[1]}</div>`).join('')}</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px 30px">${w.phase === 'practice' ? practiceView(st, tr) : qualiView(st, tr)}</div>
    </div>`;
  },
  mount() { if (S().weekend?.phase === 'race') mountRace(); },
  unmount() { stopRace(); },
  onKey(e) {
    if (!R.sim) return;
    if (e.code === 'Space') { e.preventDefault(); R.paused = !R.paused; updateSpeedUI(); }
    const sp = { Digit1: 2, Digit2: 4, Digit3: 8, Digit4: 16, Digit5: 32 }[e.code];
    if (sp) { R.speed = sp; R.paused = false; updateSpeedUI(); }
  },
  actions: {
    exit() { App.go('hub'); },
    slider(el) {
      const st = S(); const c = st.weekend.cars[el.dataset.key];
      c.vals[el.dataset.p] = +el.value;
      const lab = document.getElementById(`v-${el.dataset.key}-${el.dataset.p}`); if (lab) lab.textContent = el.value;
    },
    run(el) {
      const st = S(); const w = st.weekend; const key = el.dataset.key; const c = w.cars[key];
      if (c.runs <= 0) return;
      const team = playerTeam(st);
      const tr = getTrack(st.category, w.trackId);
      const eng = st.staff[team.staff.engineer]?.rating || 65;
      const car = buildEntries(st).find((e) => e.key === key);
      const d = st.drivers[car.driverIds[0]];
      c.runs--;
      c.q = setupQuality(c.vals, c.ideal);
      const tol = 5 + (100 - eng) / 12 + (100 - d.attrs.exp) / 25;
      c.fb = Object.fromEntries(SETUP_PARAMS.map((p) => {
        const diff = c.vals[p.id] - c.ideal[p.id];
        const noisy = diff + rand(-tol * 0.4, tol * 0.4);
        const a = Math.abs(noisy);
        return [p.id, a < tol ? 'ok' : a < tol * 2.6 ? (noisy > 0 ? 'hi' : 'lo') : (noisy > 0 ? 'vhi' : 'vlo')];
      }));
      const lap = tr.lap - (c.q * 0.45) + rand(-0.15, 0.15) + 0.9 - (d.attrs.pace - 80) * 0.04;
      c.laps.push(lap);
      sfx.ok(); App.refresh();
    },
    autosetup(el) {
      const st = S(); const c = st.weekend.cars[el.dataset.key];
      const team = playerTeam(st);
      const q = aiSetupQuality(st, team);
      // move values toward ideal proportionally to engineer quality
      for (const p of SETUP_PARAMS) c.vals[p.id] = Math.round(c.ideal[p.id] + (c.vals[p.id] - c.ideal[p.id]) * (1 - q) + rand(-6, 6) * (1 - q));
      c.q = setupQuality(c.vals, c.ideal); c.runs = Math.max(0, c.runs - 2); c.fb = null;
      App.refresh();
    },
    copy(el) {
      const st = S(); const w = st.weekend; const from = w.cars[el.dataset.from]; const to = w.cars[el.dataset.to];
      to.vals = { ...from.vals }; to.q = setupQuality(to.vals, to.ideal); to.fb = null; App.refresh();
    },
    'to-quali'() { S().weekend.phase = 'quali'; App.refresh(); },
    risk(el) { S().weekend.risk[el.dataset.key] = el.dataset.v; App.refresh(); },
    'run-quali'() {
      const st = S(); const w = st.weekend;
      const tr = getTrack(st.category, w.trackId);
      const setups = Object.fromEntries(Object.entries(w.cars).map(([k, c]) => [k, c.q]));
      const q = runQualifying(st, tr, setups, w.qualiRain, w.risk);
      w.quali = q; w.qualiAnim = true;
      App.refresh();
      animateQuali(st, q);
    },
    'skip-quali'() { const w = S().weekend; w.qualiAnim = false; App.refresh(); },
    'start-tyre'(el) { S().weekend.startTyre[el.dataset.key] = el.dataset.c; App.refresh(); },
    'to-race'() { const w = S().weekend; w.phase = 'race'; saveGame(); App.refresh(); },
    // race controls
    mode(el) { R.sim?.setMode(el.dataset.key, el.dataset.m); updateControls(true); },
    pitsel(el) { R.pitSel[el.dataset.key] = el.dataset.c; updateControls(true); },
    pit(el) { const k = el.dataset.key; const c = R.sim.cars.find((x) => x.key === k); if (c.pitReq) R.sim.cancelPit(k); else R.sim.requestPit(k, { compound: R.pitSel[k] === 'none' ? null : R.pitSel[k], fuel: true, swap: !!R.swap[k] }); updateControls(true); },
    swap(el) { R.swap[el.dataset.key] = !R.swap[el.dataset.key]; const c = R.sim.cars.find((x) => x.key === el.dataset.key); if (c.pitReq) c.pitReq.swap = R.swap[el.dataset.key]; updateControls(true); },
    auto(el) { const c = R.sim.cars.find((x) => x.key === el.dataset.key); c.auto = !c.auto; updateControls(true); },
    speed(el) { R.speed = +el.dataset.v; R.paused = false; updateSpeedUI(); },
    pause() { R.paused = !R.paused; updateSpeedUI(); },
    'sim-end'() { App.confirm('Simulare fino alla fine?', 'La strategia dei tuoi piloti passerà all’ingegnere.', () => { R.sim.cars.forEach((c) => { if (c.isPlayer) c.auto = true; }); R.sim.runToEnd(); }); },
    'finish-race'() { finishRace(); },
  },
});

// ---------------- PRACTICE ----------------
function practiceView(st, tr) {
  const w = st.weekend;
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  const team = playerTeam(st);
  const keys = Object.keys(w.cars);
  const fbTxt = (p, f) => f === 'ok' ? 'Perfetto' : f === 'hi' ? 'Un po’ alto' : f === 'lo' ? 'Un po’ basso' : f === 'vhi' ? 'Troppo alto' : 'Troppo basso';
  return `<div class="row between mb16"><div><h2>Prove Libere · Assetto</h2><div class="small muted">Regola i parametri e manda il pilota in pista: ascolta il feedback per avvicinarti all’assetto ideale. Un buon assetto vale fino a mezzo secondo al giro.</div></div>
    <div class="row"><div class="panel tight row small" style="gap:14px">${icon(w.weather.isRain ? 'rain' : 'sun')}<div><b>Previsioni gara</b><div class="muted">${w.weather.summary}</div></div>${w.qualiRain ? `<span class="chip info">Qualifiche bagnate</span>` : ''}</div><button class="btn primary lg" data-a="to-quali">${st.category === 'endurance' ? 'Hyperpole' : 'Qualifiche'} ${icon('right')}</button></div></div>
  <div class="grid2 anim-in">${entries.map((e, i) => {
    const c = w.cars[e.key]; const d = st.drivers[e.driverIds[0]];
    const other = keys.find((k) => k !== e.key);
    return `<div class="panel">
      <div class="row" style="gap:12px">${helmetSVG(d.helmet, 48)}<div class="grow"><div class="tiny upper muted">Auto #${d.number}${e.driverIds.length > 1 ? ' · ' + e.driverIds.map((id) => st.drivers[id].name.split(' ').pop()).join(' / ') : ''}</div><h3 style="font-size:19px">${esc(d.name)}</h3></div>
        <div style="width:220px"><div class="row between small"><span class="muted">Fiducia assetto</span><b>${Math.round(c.q * 100)}%</b></div>${bar(c.q * 100, c.q > 0.8 ? 'green' : c.q > 0.55 ? 'gold' : 'red')}</div></div>
      <div class="mt16">${SETUP_PARAMS.map((p) => { const f = c.fb?.[p.id]; return `<div class="setup-slider"><div><div style="font-weight:600;font-size:13.5px">${p.name}</div>${f && f !== 'ok' ? `<div class="tiny muted">${f.endsWith('lo') ? p.lo : p.hi}</div>` : ''}</div><div class="row"><span class="tiny dim">MIN</span><input type="range" min="0" max="100" value="${c.vals[p.id]}" data-input="slider" data-key="${e.key}" data-p="${p.id}"><span class="tiny dim">MAX</span><b class="mono" id="v-${e.key}-${p.id}" style="width:28px;text-align:right">${c.vals[p.id]}</b></div><div class="fb ${f || 'unk'}">${f ? fbTxt(p, f) : 'Nessun dato'}</div></div>`; }).join('')}</div>
      <div class="row mt16 between"><div class="row gap6"><button class="btn primary" data-a="run" data-key="${e.key}" ${c.runs <= 0 ? 'disabled' : ''}>${icon('play')} Giro di prova (${c.runs})</button><button class="btn sm ghost" data-a="autosetup" data-key="${e.key}" ${c.runs < 2 ? 'disabled' : ''} title="L’ingegnere imposta un assetto (costa 2 giri)">${icon('wrench')} Ingegnere</button>${other ? `<button class="btn sm ghost" data-a="copy" data-from="${other}" data-to="${e.key}" title="Copia l’assetto del compagno">${icon('swap')} Copia</button>` : ''}</div>
      <div class="small muted">${c.laps.length ? `Ultimo: <b class="mono" style="color:#fff">${fmtTime(c.laps[c.laps.length - 1])}</b> · Best ${fmtTime(Math.min(...c.laps))}` : 'Nessun giro'}</div></div>
    </div>`;
  }).join('')}</div>`;
}

// ---------------- QUALIFYING ----------------
let qTimer = null;
function animateQuali(st, q) {
  clearInterval(qTimer);
  let si = 0, ri = 0;
  const w = st.weekend;
  w.qReveal = { si: 0, ri: 0 };
  qTimer = setInterval(() => {
    if (!w.qualiAnim || App.cur !== 'weekend') { clearInterval(qTimer); return; }
    const ses = q.sessions[si];
    ri += 1;
    if (ri > ses.results.length) { si++; ri = 0; if (si >= q.sessions.length) { w.qualiAnim = false; clearInterval(qTimer); sfx.win(); App.refresh(); return; } }
    w.qReveal = { si, ri };
    sfx.click();
    const box = document.getElementById('qbox'); if (box) box.innerHTML = qualiTable(st, q, si, ri);
  }, 110);
}
function qualiTable(st, q, si, ri) {
  const ses = q.sessions[si];
  const shown = ses.results.slice(0, ri).slice().sort((a, b) => a.time - b.time);
  const best = shown[0]?.time;
  const n = ses.results.length;
  const cut = si === 0 && q.sessions.length > 1 ? n - Math.round(n * 0.27) : si === 1 ? 10 : n;
  return `<div class="row between mb8"><h3>${ses.name}</h3><span class="small muted">${ri}/${n} tempi</span></div><table class="tbl"><tbody>${shown.map((r, i) => {
    const [tid] = r.key.split('#'); const tm = st.teams[tid]; const e = buildEntries(st).find((x) => x.key === r.key); const d = st.drivers[e.driverIds[0]];
    return `<tr class="${tm.isPlayer ? 'me' : ''}" style="${i === cut ? 'border-top:2px solid var(--bad)' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${teamStripe(tm)}</td><td>${driverChip(st, d, { size: 22 })}</td><td class="small muted">${tm.short}</td><td class="right mono"><b>${fmtTime(r.time)}</b></td><td class="right mono small muted">${i ? '+' + (r.time - best).toFixed(3) : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function qualiView(st, tr) {
  const w = st.weekend;
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  if (!w.quali) {
    return `<div class="grid2 anim-in" style="max-width:1100px;margin:0 auto">
      <div class="panel"><div class="panel-head"><h3>Approccio alla qualifica</h3></div>
        ${entries.map((e) => { const d = st.drivers[e.driverIds[0]]; const r = w.risk[e.key] || 'normal'; return `<div class="card mb8"><div class="row">${helmetSVG(d.helmet, 34)}<b class="grow">${esc(d.name)}</b><span class="chip">Assetto ${Math.round(w.cars[e.key].q * 100)}%</span></div><div class="seg mt8">${[['safe', 'Prudente'], ['normal', 'Normale'], ['push', 'Al limite']].map(([k, n]) => `<div class="${r === k ? 'on ' + (k === 'push' ? 'push' : k === 'safe' ? 'save' : '') : ''}" data-a="risk" data-key="${e.key}" data-v="${k}">${n}</div>`).join('')}</div></div>`; }).join('')}
        <div class="small muted">Al limite: tempi migliori ma più rischio di errore. ${w.qualiRain ? '<span class="info">Pista bagnata in qualifica!</span>' : ''}</div>
        <button class="btn primary xl mt16" style="width:100%" data-a="run-quali">${icon('play')} Avvia ${st.category === 'endurance' ? 'Hyperpole' : 'Qualifiche'}</button>
      </div>
      <div class="panel" style="display:flex;align-items:center;justify-content:center">${trackSVG(genCircuit(tr.seed, tr.street || 0), { w: 480, h: 320, glow: 'var(--team)' })}</div>
    </div>`;
  }
  const q = w.quali;
  if (w.qualiAnim) return `<div class="panel" style="max-width:900px;margin:0 auto"><div id="qbox">${qualiTable(st, q, w.qReveal?.si || 0, w.qReveal?.ri || 0)}</div><div class="row mt16" style="justify-content:flex-end"><button class="btn" data-a="skip-quali">Salta ${icon('ff')}</button></div></div>`;
  const entriesAll = buildEntries(st);
  const C = cat(st);
  return `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px" class="anim-in">
    <div class="panel"><div class="panel-head"><h3>Griglia di partenza</h3></div><table class="tbl"><tbody>${q.grid.map((k, i) => {
      const e = entriesAll.find((x) => x.key === k); const tm = st.teams[e.teamId]; const d = st.drivers[e.driverIds[0]];
      return `<tr class="${tm.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${teamStripe(tm)}</td><td>${driverChip(st, d, { size: 22 })}</td><td class="small muted">${esc(tm.name)}</td><td class="right mono">${fmtTime(q.times[k])}</td><td class="right mono small muted">${i ? '+' + (q.times[k] - q.times[q.grid[0]]).toFixed(3) : 'POLE'}</td></tr>`;
    }).join('')}</tbody></table></div>
    <div class="col gap16">
      <div class="panel"><div class="panel-head"><h3>Meteo gara</h3></div><div class="row">${icon(w.weather.isRain ? 'rain' : 'sun', 'ico', 'style="width:36px;height:36px"')}<div><b>${w.weather.summary}</b><div class="small muted">Probabilità di pioggia stimata: ${w.weather.isRain ? Math.round(60 + Math.random() * 30) : Math.round(tr.rain * 40)}%</div></div></div>
        <div class="weather-strip mt16">${w.weather.plan.slice(0, w.laps).map((r) => `<i style="height:${Math.max(2, r * 20)}px;opacity:${r > 0.05 ? 0.9 : 0.15}"></i>`).join('')}</div><div class="row between tiny muted"><span>Giro 1</span><span>Giro ${w.laps}</span></div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Gomme di partenza</h3></div>
        ${entries.map((e) => { const d = st.drivers[e.driverIds[0]]; const pos = q.grid.indexOf(e.key) + 1; const sel = w.startTyre[e.key] || (w.weather.plan[0] > 0.55 ? 'wet' : w.weather.plan[0] > 0.2 ? (C.compounds.includes('inter') ? 'inter' : 'wet') : 'medium'); w.startTyre[e.key] = sel; return `<div class="card mb8"><div class="row"><span class="pos">P${pos}</span><b class="grow">${esc(d.name)}</b></div><div class="row gap6 mt8">${C.compounds.map((cp) => `<button class="btn sm ${sel === cp ? 'active' : ''}" data-a="start-tyre" data-key="${e.key}" data-c="${cp}">${tyreBadge(cp)} ${COMPOUNDS[cp].name}</button>`).join('')}</div></div>`; }).join('')}
        <div class="small muted">${C.id === 'formula' ? 'Regola: in gara asciutta devi usare almeno due mescole diverse.' : 'In endurance gestisci carburante, gomme e cambi pilota.'}</div>
      </div>
      <button class="btn primary xl pulse" data-a="to-race">${icon('flag')} Vai in griglia</button>
    </div>
  </div>`;
}

// ---------------- RACE ----------------
document.addEventListener('mousedown', () => { R.holding = true; });
document.addEventListener('mouseup', () => { setTimeout(() => { R.holding = false; }, 30); });
const R = { sim: null, view: null, raf: 0, speed: 8, paused: false, last: 0, uiT: 0, pitSel: {}, swap: {}, feedN: 0, lastEvt: 0 };

function raceScreen(st) {
  const tr = getTrack(st.category, st.weekend.trackId);
  return `<div class="race-screen">
    <div class="race-top">
      <button class="btn ghost icon-btn" data-a="pause" id="btn-pause">${icon('pause')}</button>
      ${flagSVG(tr.nat, 30, 20)}<div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:19px;text-transform:uppercase;line-height:1">${esc(tr.name)}</div><div class="tiny muted upper">${esc(tr.circuit)}</div></div>
      <div class="tb-stat"><b id="lapcount">1/${st.weekend.laps}</b><span>Giro</span></div>
      <div class="tb-stat"><b id="racetime">0:00</b><span>Tempo</span></div>
      <div class="tb-stat" id="wx"><b>—</b><span>Meteo</span></div>
      <div id="flagstatus"></div>
      <div class="grow"></div>
      <div class="speed-btns" id="speedbtns">${[2, 4, 8, 16, 32].map((v) => `<button class="btn sm" data-a="speed" data-v="${v}">${v}x</button>`).join('')}</div>
      <button class="btn sm ghost" data-a="sim-end">${icon('ff')} Fine gara</button>
    </div>
    <div class="race-board" id="board"></div>
    <div class="race-view"><canvas id="race-cv"></canvas><div id="finish-overlay"></div></div>
    <div class="race-side" id="side"></div>
    <div class="race-feed" id="feed"></div>
  </div>`;
}

function mountRace() {
  const st = S(); const w = st.weekend;
  const tr = getTrack(st.category, w.trackId);
  const setups = Object.fromEntries(Object.entries(w.cars).map(([k, c]) => [k, c.q]));
  R.sim = new CircuitSim(st, tr, { grid: w.quali.grid, setups, weather: { plan: w.weather.plan, isRain: w.weather.isRain }, laps: w.laps });
  for (const c of R.sim.cars) if (c.isPlayer) { c.tyre = w.startTyre[c.key] || c.tyre; c.compoundsUsed = new Set([c.tyre]); c.lapTarget = R.sim.computeLap(c); R.pitSel[c.key] = defaultPitTyre(c); }
  R.speed = getSettings().raceSpeed || 8; R.paused = true; R.feedN = 0; R.done = false; R.swap = {};
  R.view = new TrackView(document.getElementById('race-cv'), genCircuit(tr.seed, tr.street || 0), { pad: 50, glow: 'rgba(255,255,255,0.12)' });
  R.last = performance.now(); R.uiT = 0;
  updateAll(true);
  // start lights
  startLights(() => { R.paused = false; R.last = performance.now(); updateSpeedUI(); engineStart(); });
  const loop = (t) => {
    const dt = Math.min(0.1, (t - R.last) / 1000); R.last = t;
    if (!R.paused && !R.sim.finished) {
      let rem = dt * R.speed;
      while (rem > 0) { const d = Math.min(0.5, rem); R.sim.step(d); rem -= d; }
    }
    draw();
    R.uiT += dt;
    if (R.uiT > 0.25) { R.uiT = 0; updateAll(); }
    if (R.sim.finished && !R.done) { R.done = true; updateAll(true); onRaceFinished(); }
    engineSet(R.paused || R.sim.finished ? 0 : Math.min(1, R.speed / 16) * 0.6 + 0.3 + Math.sin(t / 300) * 0.05);
    R.raf = requestAnimationFrame(loop);
  };
  R.raf = requestAnimationFrame(loop);
  updateSpeedUI();
}
function stopRace() { cancelAnimationFrame(R.raf); R.view?.destroy(); R.view = null; engineStop(); }

function defaultPitTyre(c) {
  const comps = R.sim.C.compounds;
  return c.tyre === 'medium' ? 'hard' : comps.includes('medium') ? 'medium' : comps[0];
}

function startLights(done) {
  const ov = document.getElementById('finish-overlay');
  let n = 0;
  ov.innerHTML = `<div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:rgba(0,0,0,.8);padding:14px 20px;border-radius:14px;border:1px solid var(--line2);z-index:3" id="lights">${[0, 1, 2, 3, 4].map((i) => `<div id="l${i}" style="width:34px;height:34px;border-radius:50%;background:#222;box-shadow:inset 0 0 8px #000"></div>`).join('')}</div>`;
  const iv = setInterval(() => {
    if (n < 5) { const l = document.getElementById(`l${n}`); if (l) { l.style.background = '#ff1a1a'; l.style.boxShadow = '0 0 20px #f00'; } sfx.beep(); n++; }
    else { clearInterval(iv); setTimeout(() => { document.querySelectorAll('#lights > div').forEach((l) => { l.style.background = '#222'; l.style.boxShadow = 'none'; }); sfx.go(); setTimeout(() => { const L = document.getElementById('lights'); if (L) L.remove(); }, 600); done(); }, 300 + Math.random() * 900); }
  }, 520);
}

function draw() {
  const v = R.view; if (!v) return;
  const sim = R.sim;
  const style = sim.C.id === 'endurance' ? 'endurance' : 'formula';
  v.frame((c) => {
    let pitIdx = 0;
    const cars = sim.cars.filter((x) => x.status !== 'dnf').sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const car of cars) {
      const L = car.team.car.livery;
      let q;
      if (car.inPit > 0 && v.pitPos) q = v.pitPos(pitIdx++);
      else q = v.pointAt(car.status === 'finished' ? car.finishLap : car.dist);
      const d = sim.driver(car);
      v.drawCar(q.x, q.y, q.ang, L.primary, L.secondary, { style, glow: car.isPlayer ? L.primary : null, outline: car.isPlayer, label: car.isPlayer || car.pos <= 3 ? `${car.pos} ${shortName(d.name)}` : null, labelBg: car.isPlayer ? L.primary : 'rgba(0,0,0,0.75)' });
    }
  }, { rain: sim.rain, night: sim.night });
}

function updateAll(force) { updateBoard(); updateTop(); updateControls(force); updateFeed(); }

function updateTop() {
  const sim = R.sim;
  const leader = sim.classification()[0];
  const lap = Math.min(sim.laps, Math.max(1, Math.floor(leader.status === 'finished' ? sim.laps : leader.dist) + 1));
  const el = document.getElementById('lapcount'); if (el) el.textContent = `${lap}/${sim.laps}`;
  const tt = document.getElementById('racetime'); if (tt) { const s = Math.floor(sim.time); tt.textContent = `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  const wx = document.getElementById('wx'); const r = sim.rain;
  if (wx) wx.innerHTML = `<b class="${r > 0.2 ? 'info' : ''}">${r < 0.05 ? 'Asciutto' : r < 0.3 ? 'Pioviggine' : r < 0.6 ? 'Pioggia' : 'Diluvio'}${sim.night ? ' · Notte' : ''}</b><span>Meteo ${Math.round(r * 100)}%</span>`;
  const fs = document.getElementById('flagstatus');
  if (fs) fs.innerHTML = sim.sc ? '<span class="chip warn pulse" style="font-weight:800">🚨 SAFETY CAR</span>' : sim.finished ? '<span class="chip good">🏁 FINITA</span>' : '<span class="chip good">🟢 Bandiera verde</span>';
}

function updateBoard() {
  const sim = R.sim; const st = S();
  const cls = sim.classification(); const leader = cls[0];
  const html = cls.map((c, i) => {
    const d = sim.driver(c);
    const gap = c.status === 'dnf' ? 'RIT' : i === 0 ? (c.status === 'finished' ? '🏁' : 'Leader') : fmtGap(sim.gapToLeader(c, leader));
    const comp = COMPOUNDS[c.tyre];
    const posDelta = c.grid - (i + 1);
    return `<div class="lb-row ${c.isPlayer ? 'me' : ''} ${c.status === 'dnf' ? 'dnf' : ''} ${c.inPit > 0 ? 'pit' : ''}">
      <span class="pos p${i + 1}" style="font-size:14px">${i + 1}</span>${teamStripe(c.team)}
      <span class="nm">${esc(d.name)} ${posDelta > 0 ? `<span class="good tiny">▲${posDelta}</span>` : posDelta < 0 ? `<span class="bad tiny">▼${-posDelta}</span>` : ''}</span>
      <span>${c.status === 'dnf' ? '' : tyreBadge(c.tyre)}</span>
      <div>${c.status === 'dnf' ? `<span class="tiny bad">${esc(c.reason || '')}</span>` : c.inPit > 0 ? '<span class="chip warn tiny">BOX</span>' : `<div class="wear"><i style="width:${(1 - c.wear) * 100}%;background:${c.wear > 0.7 ? 'var(--bad)' : c.wear > 0.45 ? 'var(--warn)' : 'var(--good)'}"></i></div>`}</div>
      <span class="gap">${gap}</span></div>`;
  }).join('');
  const b = document.getElementById('board');
  if (b) b.innerHTML = `<div class="lb-row" style="color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase"><span>Pos</span><span></span><span>Pilota</span><span>Gom</span><span>Usura</span><span class="right">Distacco</span></div>${html}<div class="small muted" style="padding:10px">Giro veloce: ${sim.fastest.key ? `<b>${esc(sim.driver(sim.cars.find((c) => c.key === sim.fastest.key)).name)}</b> ${fmtTime(sim.fastest.time)}` : '—'}</div>`;
}

let lastCtrlHTML = '';
function updateControls(force) {
  const sim = R.sim; const st = S();
  const cls = sim.classification();
  const mine = sim.cars.filter((c) => c.isPlayer);
  const html = mine.map((c) => {
    const d = sim.driver(c);
    const i = cls.indexOf(c);
    const ahead = cls[i - 1], behind = cls[i + 1];
    const gA = ahead && c.status === 'running' ? (ahead.dist - c.dist) * sim.track.lap : null;
    const gB = behind && behind.status === 'running' && c.status === 'running' ? (c.dist - behind.dist) * sim.track.lap : null;
    const lapsLeft = Math.max(0, sim.laps - c.dist);
    const wearTxt = Math.round((1 - c.wear) * 100);
    const advice = engineerAdvice(sim, c);
    const pitSel = R.pitSel[c.key];
    return `<div class="ctrl-card" style="border-top-color:${c.team.car.livery.primary}">
      <div class="row">${helmetSVG(d.helmet, 34)}<div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">${c.status === 'dnf' ? `<span class="bad">Ritirato: ${esc(c.reason)}</span>` : c.status === 'finished' ? 'Arrivato' : `P${i + 1} · Partito P${c.grid} · Soste ${c.pitStops}`}</div></div><span class="pos p${i + 1}" style="font-size:26px">P${i + 1}</span></div>
      ${c.status === 'running' ? `
      <div class="grid2 mt8 small" style="gap:6px"><div class="muted">Davanti <b style="color:#fff" class="mono">${gA != null && gA < 60 ? '-' + Math.max(0, gA).toFixed(1) + 's' : '—'}</b></div><div class="muted right">Dietro <b style="color:#fff" class="mono">${gB != null && gB < 60 ? '+' + Math.max(0, gB).toFixed(1) + 's' : '—'}</b></div></div>
      <div class="row mt8">${tyreBadge(c.tyre)}<div class="grow"><div class="row between tiny"><span>${COMPOUNDS[c.tyre].name}</span><span class="${c.wear > 0.7 ? 'bad' : ''}">${wearTxt}%</span></div><div class="wear" style="height:6px"><i style="width:${wearTxt}%;background:${c.wear > 0.7 ? 'var(--bad)' : c.wear > 0.45 ? 'var(--warn)' : 'var(--good)'}"></i></div></div></div>
      ${sim.endurance ? `<div class="row mt8">${icon('fuel', 'ico', 'style="width:18px"')}<div class="grow"><div class="row between tiny"><span>Carburante</span><span class="${c.fuel < 1.5 ? 'bad' : ''}">${c.fuel.toFixed(1)} giri</span></div><div class="wear" style="height:6px"><i style="width:${(c.fuel / c.fuelMax) * 100}%;background:var(--info)"></i></div></div></div><div class="tiny muted mt8">Stint pilota: ${c.stintCount + 1}${c.stintCount >= 2 ? ' <span class="warn">(affaticato)</span>' : ''}</div>` : ''}
      ${c.damage > 0.05 ? `<div class="chip bad mt8">Danni: +${c.damage.toFixed(1)}s/giro</div>` : ''}
      <div class="tiny upper muted mt8 mb8">Ritmo</div>
      <div class="seg">${[['save', 'Gestione'], ['normal', 'Normale'], ['push', 'Attacco']].map(([k, n]) => `<div class="${c.mode === k ? 'on ' + k : ''}" data-a="mode" data-key="${c.key}" data-m="${k}">${n}</div>`).join('')}</div>
      <div class="tiny upper muted mt8 mb8">Pit stop</div>
      <div class="row gap4 wrap">${sim.C.compounds.map((cp) => `<button class="btn sm ${pitSel === cp ? 'active' : ''}" style="padding:4px 6px" data-a="pitsel" data-key="${c.key}" data-c="${cp}" title="${COMPOUNDS[cp].name}">${tyreBadge(cp)}</button>`).join('')}${sim.endurance ? `<button class="btn sm ${pitSel === 'none' ? 'active' : ''}" style="padding:4px 8px" data-a="pitsel" data-key="${c.key}" data-c="none">Solo ⛽</button>` : ''}</div>
      ${sim.endurance && c.driverIds.length > 1 ? `<button class="btn sm mt8 ${R.swap[c.key] ? 'active' : ''}" style="width:100%" data-a="swap" data-key="${c.key}">${icon('swap')} Cambio pilota → ${esc(st.drivers[c.driverIds[(c.driverIdx + 1) % c.driverIds.length]].name.split(' ').pop())}</button>` : ''}
      <button class="btn ${c.pitReq ? 'danger' : 'team'} mt8 ${advice?.urgent && !c.pitReq ? 'pulse' : ''}" style="width:100%" data-a="pit" data-key="${c.key}">${c.pitReq ? `Annulla box (${c.pitReq.compound ? COMPOUNDS[c.pitReq.compound].short : '⛽'})` : `${icon('wrench')} Chiama ai box`}</button>
      ${advice ? `<div class="small mt8 ${advice.urgent ? 'warn' : 'muted'}">${icon('info', 'ico', 'style="width:13px;vertical-align:-2px"')} ${advice.text}</div>` : ''}
      <div class="row between mt8 tiny"><span class="muted">Strategia automatica (ingegnere)</span><button class="btn sm ${c.auto ? 'active' : ''}" data-a="auto" data-key="${c.key}">${c.auto ? 'ON' : 'OFF'}</button></div>
      <div class="tiny muted mt8">Giri rimanenti: ${lapsLeft.toFixed(1)} · Ultimo ${fmtTime(c.lastLap)} · Best ${fmtTime(c.bestLap)}</div>` : ''}
    </div>`;
  }).join('');
  const plan = R.sim.weather.plan;
  const curLap = Math.floor(R.sim.progress * R.sim.laps);
  const wxHtml = `<div class="panel tight"><div class="row between tiny upper muted mb8"><span>Radar meteo</span><span>${R.sim.weather.isRain ? 'Pioggia prevista' : 'Asciutto'}</span></div><div class="weather-strip">${plan.slice(0, R.sim.laps).map((r, i) => `<i style="height:${Math.max(2, r * 20)}px;opacity:${i < curLap ? 0.25 : r > 0.05 ? 0.95 : 0.15};${i === curLap ? 'background:#fff' : ''}"></i>`).join('')}</div></div>`;
  const full = html + wxHtml + (R.sim.finished ? `<button class="btn primary xl pulse" data-a="finish-race">${icon('chequered')} Risultati</button>` : '');
  if (R.holding && !force) return;
  if (force || full !== lastCtrlHTML) {
    // avoid re-rendering while hovering buttons too frequently: only update if changed
    const side = document.getElementById('side');
    if (side) side.innerHTML = full;
    lastCtrlHTML = full;
  }
}

function engineerAdvice(sim, c) {
  const comp = COMPOUNDS[c.tyre]; const r = sim.rain; const lapsLeft = sim.laps - c.dist;
  if (c.pitReq) return { text: 'Box confermato: rientra al prossimo passaggio.' };
  if (!comp.wet && r > 0.3) return { text: 'Pioggia forte! Servono gomme da bagnato SUBITO.', urgent: true };
  if (comp.wet && r < 0.1 && lapsLeft > 2) return { text: 'La pista si asciuga: valuta le slick.', urgent: true };
  if (sim.endurance && c.fuel < 2.2 && lapsLeft > 1) return { text: `Carburante per ${c.fuel.toFixed(1)} giri: prepara la sosta.`, urgent: c.fuel < 1.4 };
  if (c.wear > 0.72 && lapsLeft > 2) return { text: 'Gomme finite, stiamo perdendo molto tempo.', urgent: true };
  if (sim.sc && c.wear > 0.35 && lapsLeft > 4) return { text: 'Safety car: è il momento ideale per fermarsi!', urgent: true };
  if (!sim.endurance && !sim.weather.isRain && c.compoundsUsed.size < 2 && lapsLeft < 6) return { text: 'Regolamento: devi ancora montare una seconda mescola!', urgent: true };
  if (c.wear > 0.55 && lapsLeft > 3) return { text: 'Degrado in aumento: finestra di pit stop aperta.' };
  return null;
}

function updateFeed() {
  const sim = R.sim;
  const evs = sim.events;
  if (evs.length === R.feedN) return;
  const newOnes = evs.slice(R.feedN);
  R.feedN = evs.length;
  for (const e of newOnes) {
    if (e.type === 'crash') sfx.crash();
    else if (e.type === 'sc') sfx.notify();
    else if (e.type === 'overtake' && e.important) sfx.overtake();
  }
  const f = document.getElementById('feed');
  if (f) f.innerHTML = evs.slice(-60).reverse().filter((e) => e.important || e.type !== 'overtake' || Math.random() < 1).map((e) => `<div class="feed-item ${e.type} ${e.key && sim.cars.find((c) => c.key === e.key)?.isPlayer ? 'player' : ''}"><span class="lap">G${e.lap}</span><span>${esc(e.text)}</span></div>`).join('');
}

function updateSpeedUI() {
  document.querySelectorAll('#speedbtns .btn').forEach((b) => b.classList.toggle('active', +b.dataset.v === R.speed && !R.paused));
  const p = document.getElementById('btn-pause'); if (p) p.innerHTML = icon(R.paused ? 'play' : 'pause');
}

function onRaceFinished() {
  engineStop();
  const st = S();
  const res = R.sim.results();
  const mine = res.classification.filter((r) => r.teamId === st.playerTeam);
  const best = Math.min(...mine.map((r) => (r.status === 'dnf' ? 99 : r.pos)));
  if (best <= 3) { sfx.win(); celebrate(best === 1 ? 260 : 120); }
  const ov = document.getElementById('finish-overlay');
  if (ov) ov.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:3"><div class="panel glow" style="text-align:center;padding:30px 40px;animation:pop .4s"><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:44px">🏁 GARA FINITA</div><div class="muted mt8">${esc(st.drivers[res.classification[0].driverIds[0]].name)} vince · Il tuo miglior risultato: ${best === 99 ? 'Ritiro' : 'P' + best}</div><button class="btn primary xl mt16" data-a="finish-race">Vai ai risultati ${icon('right')}</button></div></div>`;
}

function finishRace() {
  const st = S();
  const sim = R.sim;
  if (!sim.finished) sim.runToEnd();
  const res = sim.results();
  res.pole = st.weekend.quali ? buildEntries(st).find((e) => e.key === st.weekend.quali.grid[0])?.driverIds[0] : null;
  res.track = st.weekend.trackId;
  const evIdx = st.round;
  stopRace();
  R.sim = null;
  applyRoundResults(st, res);
  st.lastRace = { idx: evIdx };
  saveGame();
  App.go('results', { idx: evIdx });
}
