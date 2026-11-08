// Circuit race weekend: Practice (setup) → Qualifying → Race → Results
import { App, registerScreen, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge, carSVG, trackSVG } from '../ui/art.js';
import { esc, bar, fmtTime, fmtGap } from '../ui/dom.js';
import { S, saveGame, getSettings } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { applyRaceRivalry } from '../engine/rivalry.js';
import { cat, playerTeam, teamDrivers, applyRoundResults, standings, seatsPerTeam, aiFillSeats, addMail } from '../engine/season.js';
import { buildEntries, runQualifying, makeWeatherPlan, raceLaps, CircuitSim, aiSetupQuality, weatherForecast, SETUP_BIAS } from '../engine/race.js';
import { compEnabled, compStatus, fitComponent } from '../engine/components.js';
import { licencePoints, BAN_POINTS } from '../engine/stewards.js';
import { COMPOUNDS } from '../data/categories.js';
import { circuitPath, arcFrac, speedAtTimeFrac, TrackView } from '../ui/trackview.js';
import { mulberry32, clamp, chance, rand } from '../engine/rng.js';
import { tyreBadge, teamStripe, driverChip } from './common.js';
import { sfx, engineStart, engineSet, engineStop, music } from '../ui/audio.js';
import { celebrate } from './results.js';
import { hasPerk } from '../engine/progress.js';
import { Race3D, webglAvailable } from '../ui/race3d.js';
import { trackGeometry, drsZones, partSensitivity, trackStats } from '../engine/trackphys.js';
import { planOptions, stintBar, degChartSVG, drawTelemetry, breakdownHTML, openLessons, wearError } from './engineer.js';
import { SETUP_PARAMS, idealFor, setupQuality } from './setup.js';
import { isLiveSession, sessionRender, sessionMount, sessionStop, sessionActions, sessionKey, simulateQualifying } from './sessions.js';
import { plannerPanel, plannerActions, raceStrategyHTML, adviceHTML, ensurePlan, isDryPlan } from './planner.js';
import { optimise, normalizePlan } from '../engine/strategy.js';
import { tvUpdate, trackerUpdate, stintChartSVG, liveStandingsHTML, analysisHTML, defaultSel } from './broadcast.js';

function shortName(n) { const p = n.split(' '); return (p[p.length - 1] || n).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); }
export { shortName };

function initWeekend(st) {
  const ev = st.calendar[st.round];
  const tr = getTrack(st.category, ev.trackId);
  const t = playerTeam(st);
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  const laps = raceLaps(st, tr);
  const weather = makeWeatherPlan(tr, laps, st.forceRain);
  const sim = t.facilities.simulator;
  st.weekend = {
    trackId: tr.id, phase: 'practice', laps, sprint: !!ev.sprint && !st.quick, sprintLaps: Math.max(5, Math.round(laps * 0.36)),
    weather: { plan: weather.plan, isRain: weather.isRain, summary: weather.summary, trackTemp: weather.trackTemp },
    qualiRain: chance(tr.rain * 0.7) ? rand(0.2, 0.8) : 0,
    cars: Object.fromEntries(entries.map((e) => [e.key, { runs: 4 + Math.floor(sim / 2) + (hasPerk(st, 'data') ? 1 : 0), vals: Object.fromEntries(SETUP_PARAMS.map((p) => [p.id, 50])), fb: null, q: 0.3, laps: [], ideal: idealFor(st, e.key, tr.seed, tr) }])),
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
    if (st.quickSkip && w.phase === 'practice') { for (const c of Object.values(w.cars)) c.q = aiSetupQuality(st, playerTeam(st)); w.phase = 'quali'; }
    if (st.quickSkip && w.phase === 'quali' && !w.quali) simulateQualifying(st);
    if (w.phase === 'race') return raceScreen(st);
    if (isLiveSession(w)) return sessionRender(st);
    const tr = getTrack(st.category, w.trackId);
    const steps = [['practice', 'Prove Libere'], ['quali', st.category === 'endurance' ? 'Hyperpole' : 'Qualifiche'], ...(w.sprint ? [['sprint', 'Sprint']] : []), ['race', 'Gara']];
    const idx = steps.findIndex((s) => s[0] === w.phase);
    return `<div class="wk-screen">
      <div class="wk-head">
        <button class="btn icon-btn" data-a="exit" aria-label="Esci dal weekend" data-tip="Torna alla gestione">${icon('left')}</button>
        ${flagSVG(tr.nat, 40, 27)}<div><div class="wk-title">${esc(tr.name)}</div><div class="wk-sub">${esc(tr.circuit)} · ${w.laps} giri · Round ${st.round + 1}/${st.calendar.length}</div></div>
        <div class="wk-track">${trackSVG(circuitPath(tr.cid), { w: 220, h: 96, glow: null, color: '#fff', width: 3, start: false })}</div>
        <div class="grow"></div>
        <div class="stepper">${steps.map((s, i) => `<div class="step ${i < idx ? 'done' : i === idx ? 'cur' : ''}"><span class="n">${i < idx ? icon('check', 'ico', 'style="width:15px;height:15px"') : i + 1}</span>${s[1]}</div>`).join('')}</div>
      </div>
      <div class="wk-body">${qualiView(st, tr)}</div>
    </div>`;
  },
  mount() {
    const w = S().weekend;
    if (isLiveSession(w)) { sessionMount(); return; }
    if (w?.phase === 'race') { mountRace(); setTimeout(() => App.cur === 'weekend' && coach('race', 'Sei al muretto box', 'Clicca un pilota in classifica per seguirlo. Usa <b>Override</b> quando sei entro 1 secondo per sorpassare, gestisci le gomme con il <b>ritmo</b> e chiama i box al giro giusto. Rispondi alle <b>chiamate radio</b>!'), 7000); }
    else if (w?.phase === 'quali' && w.quali) coach('strategy', 'Pianifica la gara', 'Scegli <b>quante soste</b>, la mescola di ogni stint e il <b>giro del box</b> con i tasti − / +. Il tempo previsto ti dice quanto perdi rispetto al piano migliore. In gara potrai cambiare tutto dal pannello <b>Strategia</b>.');
  },
  unmount() { stopRace(); sessionStop(); },
  onKey(e) {
    if (sessionKey(e)) return;
    if (!R.sim) return;
    if (R.an) { if (e.key === 'Escape' || e.code === 'KeyA') { e.preventDefault(); closeAnalysis(); } return; }
    if (e.code === 'KeyA' && !R.moment) { openAnalysis(); return; }
    if (R.moment && /^Digit[1-3]$/.test(e.code)) { resolveMomentUI(+e.code.slice(5) - 1); return; }
    if (e.code === 'Space') { e.preventDefault(); R.paused = !R.paused; updateSpeedUI(); }
    const sp = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8, Digit5: 16, Digit6: 32, Digit0: 1 }[e.code];
    if (sp) { R.speed = sp; R.paused = false; updateSpeedUI(); }
    if (e.code === 'KeyR' && R.r3d) { if (R.replay) stopReplay(); else startReplay(R.lastHighlight && R.sim.time - R.lastHighlight.t < 12 ? R.lastHighlight.key : R.focus); }
  },
  actions: {
    ...sessionActions,
    ...plannerActions(App, S, getTrack, buildEntries),
    'ctab'(el) { R.ctab[el.dataset.key] = el.dataset.t; updateControls(true); },
    'rs-lap'(el) { const c = rc(el); if (!c?.plan) return; const i = c.planIdx; const d = +el.dataset.d; if (c.plan[i].laps + d <= c.stintLap || c.plan[i + 1].laps - d < 1) return; c.plan[i].laps += d; c.plan[i + 1].laps -= d; normalizePlan(c.plan, R.sim.laps); updateControls(true); },
    'rs-comp'(el) { const c = rc(el); if (!c?.plan?.[c.planIdx + 1]) return; c.plan[c.planIdx + 1].c = el.dataset.c; R.pitSel[c.key] = el.dataset.c; if (c.pitReq) c.pitReq.compound = el.dataset.c; updateControls(true); },
    'rs-auto'(el) { const c = rc(el); if (c) c.planAuto = c.planAuto === false; updateControls(true); },
    'rs-stops'(el) { const c = rc(el); if (!c) return; const n = +el.dataset.n; const best = R.sim.replan(c, n < 0 ? null : n); if (!best) { App.toast('Piano non possibile', 'Non ci sono abbastanza giri per queste soste.', 'bad'); return; } R.sim.applyRemaining(c, best.stints); if (best.stints[0].laps <= 1 && best.stints[1]) c.pitReq = { compound: best.stints[1].c, fuel: true, crew: c.crew, repair: c.repair !== false }; R.pitSel[c.key] = defaultPitTyre(c); sfx.radio?.(); updateControls(true); },
    'rs-crew'(el) { const c = rc(el); if (!c) return; c.crew = el.dataset.v; if (c.pitReq) c.pitReq.crew = c.crew; updateControls(true); },
    'rs-repair'(el) { const c = rc(el); if (!c) return; c.repair = c.repair === false; if (c.pitReq) c.pitReq.repair = c.repair; updateControls(true); },
    'rs-lift'(el) { const c = rc(el); if (!c) return; R.sim.setFuelSave(c.key, !c.fuelSave); updateControls(true); },
    'rs-end'(el) { const c = rc(el); if (!c) return; c.endPlan ||= { fuelFrac: 1, tyreEvery: 1, swapEvery: 1, comp: null }; c.endPlan[el.dataset.f] = +el.dataset.v; updateControls(true); },
    'rs-accept'(el) { const a = R.sim?.acceptAdvice(el.dataset.key); if (a) { sfx.radio?.(); const c = R.sim.cars.find((x) => x.key === el.dataset.key); R.pitSel[c.key] = c.pitReq?.compound || defaultPitTyre(c); } updateControls(true); },
    exit() { App.go(S().quick ? (S().challenge ? 'challenges' : 'quickrace') : 'hub'); },
    'to-quali'() { S().weekend.phase = 'quali'; App.refresh(); },
    bias(el) { const w = S().weekend; if (w.quali) return; (w.bias ||= {})[el.dataset.key] = el.dataset.v; App.refresh(); },
    'fit-comp'(el) {
      const st = S(); const d = st.drivers[el.dataset.id]; const type = el.dataset.t;
      const x = compStatus(st, d)[type];
      const doIt = () => { const pen = fitComponent(st, d, type); sfx.ok(); App.toast(`${x.name} nuovo montato`, pen ? `${d.name}: penalità di ${pen} posizioni in griglia` : `${d.name}: elemento n.${x.used + 1} di ${x.pool}`, pen ? 'bad' : 'good'); App.refresh(); };
      if (x.nextPenalty) App.confirm(`Montare un nuovo ${x.name}?`, `${esc(d.name)} supererebbe l’allocazione stagionale (${x.used}/${x.pool}): penalità di <b>${x.nextPenalty} posizioni</b> in griglia. In cambio: componente fresco, più potenza e molto meno rischio di guasto.`, doIt, 'Monta e accetta la penalità', true);
      else doIt();
    },
    'start-tyre'(el) { S().weekend.startTyre[el.dataset.key] = el.dataset.c; App.refresh(); },
    lessons() { openLessons(); },
    cam(el) { R.view3d = el.dataset.c; R.cam = R.view3d; enable3D(R.view3d); renderViewBtns(); },
    view2d() { disable3D(); renderViewBtns(); },
    replay() { if (R.replay) stopReplay(); else { if (!R.r3d) { R.view3d = 'chase'; enable3D('chase'); renderViewBtns(); } startReplay(R.lastHighlight && R.sim.time - R.lastHighlight.t < 12 ? R.lastHighlight.key : R.focus); } },
    focus(el) { R.focus = el.dataset.key; updateBoard(); },
    gapmode() { R.gapMode = R.gapMode === 'int' ? 'lead' : 'int'; updateBoard(); },
    'tele-tab'(el) { R.tab = el.dataset.t; updateFeed(true); },
    'tele-car'(el) { R.teleKey = el.dataset.key; updateFeed(true); },
    'to-race'() { const w = S().weekend; w.phase = 'race'; saveGame(); App.refresh(); },
    // race controls
    mode(el) { R.sim?.setMode(el.dataset.key, el.dataset.m); updateControls(true); },
    ers(el) { R.sim?.setErs(el.dataset.key, el.dataset.m); updateControls(true); },
    orders(el) { const st = S(); R.sim?.setOrders(st.playerTeam, el.dataset.o); updateControls(true); },
    moment(el) { resolveMomentUI(+el.dataset.i); },
    'moments-off'() { if (R.sim) { R.sim.momentsOn = false; R.sim.moments = []; } document.getElementById('moment')?.remove(); R.moment = null; R.last = performance.now(); },
    radio(el) { R.sim?.answerRadio(+el.dataset.id, el.dataset.y === '1'); sfx.radio(); updateControls(true); },
    pitsel(el) { R.pitSel[el.dataset.key] = el.dataset.c; updateControls(true); },
    pit(el) { const k = el.dataset.key; const c = R.sim.cars.find((x) => x.key === k); if (c.pitReq) R.sim.cancelPit(k); else R.sim.requestPit(k, R.sim.endurance ? { ...R.sim.endPitReq(c), compound: R.pitSel[k] === 'none' ? null : R.pitSel[k], swap: !!R.swap[k] } : { compound: (c.plan?.[c.planIdx + 1]?.c && R.ctab?.[k] === 'strat') ? c.plan[c.planIdx + 1].c : R.pitSel[k] === 'none' ? null : R.pitSel[k], fuel: true, swap: !!R.swap[k], crew: c.crew, repair: c.repair !== false }); updateControls(true); },
    swap(el) { R.swap[el.dataset.key] = !R.swap[el.dataset.key]; const c = R.sim.cars.find((x) => x.key === el.dataset.key); if (c.pitReq) c.pitReq.swap = R.swap[el.dataset.key]; updateControls(true); },
    auto(el) { const c = R.sim.cars.find((x) => x.key === el.dataset.key); c.auto = !c.auto; updateControls(true); },
    speed(el) { R.speed = +el.dataset.v; R.paused = false; updateSpeedUI(); },
    pause() { R.paused = !R.paused; updateSpeedUI(); },
    'sim-end'() { App.confirm('Simulare fino alla fine?', 'La strategia dei tuoi piloti passerà all’ingegnere.', () => { R.sim.cars.forEach((c) => { if (c.isPlayer) c.auto = true; }); R.sim.momentsOn = false; R.sim.moments = []; document.getElementById('moment')?.remove(); R.moment = null; R.sim.runToEnd(); }); },
    'finish-race'() { finishRace(); },
    'an-open'() { openAnalysis(); },
    'an-close'() { closeAnalysis(); },
    'an-tab'(el) { if (!R.an) return; R.an.tab = el.dataset.t; renderAnalysis(); },
    'an-sel'(el) { if (!R.an) return; const k = el.dataset.key; const s = R.an.sel; const i = s.indexOf(k); if (i >= 0) { if (s.length > 1) s.splice(i, 1); } else s.push(k); renderAnalysis(); },
  },
});

// ---------------- QUALIFYING ----------------
function qualiView(st, tr) {
  const w = st.weekend;
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  const q = w.quali;
  const entriesAll = buildEntries(st);
  const C = cat(st);
  return `<div class="grid-plan anim-in">
    <div class="panel"><div class="panel-head"><h3>Griglia di partenza</h3></div><table class="tbl"><tbody>${q.grid.map((k, i) => {
      const e = entriesAll.find((x) => x.key === k); const tm = st.teams[e.teamId]; const d = st.drivers[e.driverIds[0]];
      const gp = (q.gridPens || []).find((p) => p.key === k);
      const best = q.times[(q.qualiOrder || q.grid)[0]];
      const qt = q.times[k];
      return `<tr class="${tm.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${teamStripe(tm)}</td><td>${driverChip(st, d, { size: 22 })}${gp ? ` <span class="chip bad tiny" title="${esc(gp.items.join(', '))}">${gp.back ? 'Fondo griglia' : '-' + gp.places + ' pos.'}</span>` : ''}</td><td class="small muted">${esc(tm.short || tm.name)}</td><td class="right mono">${fmtTime(qt)}</td><td class="right mono small muted">${qt == null ? 'NT' : qt > best ? '+' + (qt - best).toFixed(3) : 'POLE'}</td></tr>`;
    }).join('')}</tbody></table>${(q.gridPens || []).length ? `<div class="tiny muted mt8" style="padding:0 12px 10px">Penalità in griglia: ${q.gridPens.map((p) => `${esc(st.drivers[p.driverId]?.name || '')} (${esc(p.items.join(', '))}: dalla P${p.from} alla P${p.to})`).join(' · ')}</div>` : ''}</div>
    <div class="col gap16">
      <div class="panel"><div class="panel-head"><h3>Meteo gara</h3></div><div class="row">${(() => { const fc = weatherForecast(st, w, tr); return `${icon(fc.prob >= 50 ? 'rain' : 'sun', 'ico', 'style="width:36px;height:36px"')}<div><b>${fc.summary}</b><div class="small muted">Probabilità di pioggia stimata: ${fc.prob}% · affidabilità ${fc.perfect ? '100' : fc.acc}%</div></div>`; })()}</div>
        <div class="weather-strip mt16">${forecast(st, w).map((r) => `<i style="height:${Math.max(2, r * 20)}px;opacity:${r > 0.05 ? 0.9 : 0.15}"></i>`).join('')}</div>${hasPerk(st, 'meteo') ? '<div class="tiny good">Radar preciso (abilità Meteorologo)</div>' : '<div class="tiny muted">Previsione indicativa: sblocca “Meteorologo” per il radar preciso.</div>'}<div class="row between tiny muted"><span>Giro 1</span><span>Giro ${w.laps}</span></div>
      </div>
      ${plannerPanel(st, w, tr, entries, q, C)}
      <button class="btn primary xl pulse" data-a="to-race">${icon('flag')} Vai in griglia</button>
    </div>
  </div>`;
}

// ---------------- RACE ----------------
document.addEventListener('mousedown', () => { R.holding = true; });
document.addEventListener('mouseup', () => { setTimeout(() => { R.holding = false; }, 30); });
const R = window.__race = { sim: null, view: null, raf: 0, speed: 8, paused: false, last: 0, uiT: 0, pitSel: {}, swap: {}, feedN: 0, lastEvt: 0 };

function raceScreen(st) {
  const tr = getTrack(st.category, st.weekend.trackId);
  return `<div class="race-screen">
    <div class="race-top">
      <button class="btn ghost icon-btn" data-a="pause" id="btn-pause" data-tip="Pausa / riprendi (Spazio)">${icon('pause')}</button>
      <div class="rt-event">${flagSVG(tr.nat, 34, 22)}<div><div class="rt-name">${esc(tr.name)}</div><div class="rt-circ">${esc(tr.circuit)}</div></div></div>
      <div class="tb-stat"><b id="lapcount">1/${st.weekend.laps}</b><span>Giro</span></div>
      <div class="tb-stat"><b id="racetime">0:00</b><span>Tempo</span></div>
      <div class="tb-stat" id="wx"><b>—</b><span>Meteo</span></div>
      <div id="flagstatus"></div>
      <div class="grow"></div>
      <div class="speed-btns" id="speedbtns">${[1, 2, 4, 8, 16, 32].map((v, i) => `<button class="btn sm" data-a="speed" data-v="${v}" data-tip="${v === 1 ? 'Tempo reale' : `Velocità ${v}x`} · tasto ${i + 1}">${v === 1 ? '1x LIVE' : v + 'x'}</button>`).join('')}</div>
      <button class="btn sm an-open" data-a="an-open" data-tip="Lap chart, distacchi, strategie e passo gara (A)">${icon('chart')} Analisi</button>
      <button class="btn sm" data-a="sim-end" data-tip="Simula il resto della gara: le decisioni passano all’ingegnere">${icon('ff')} Fine gara</button>
      <span class="kbd-help" data-a="shortcuts" data-tip="Scorciatoie: Spazio pausa · 1-6 velocità · R replay · A analisi">?</span>
      <div class="race-prog"><i id="race-prog"></i></div>
    </div>
    <div class="race-board" id="board"></div>
    <div class="race-view" id="race-view"><canvas id="race-cv"></canvas><div class="view-btns" id="view-btns"></div><div class="hud3d hidden" id="hud3d"></div><div class="race-sub" id="race-sub"></div><div class="battle" id="battle"></div><div class="tvg-layer" id="tvg"></div><div class="ivt-layer" id="tvtrack"></div><div id="finish-overlay"></div></div>
    <div class="race-side" id="side"></div>
    <div class="race-feed"><div class="row gap4 mb8" id="feed-tabs"></div><div id="feed" style="height:calc(100% - 46px);overflow-y:auto"></div></div>
  </div>`;
}

function mountRace() {
  const st = S(); const w = st.weekend;
  const tr = getTrack(st.category, w.trackId);
  const setups = Object.fromEntries(Object.entries(w.cars).map(([k, c]) => [k, c.q]));
  const isSprint = w.sprint && !w.sprintDone;
  R.sim = new CircuitSim(st, tr, { grid: isSprint || !w.sprintGrid ? w.quali.grid : w.quali.grid, setups, weather: { plan: w.weather.plan, isRain: w.weather.isRain, trackTemp: w.weather.trackTemp }, laps: isSprint ? w.sprintLaps : w.laps });
  R.sim.isSprint = isSprint;
  R.sim.onPit = (c, stat) => {
    if (!c.isPlayer) return;
    sfx.pit();
    const ov = document.getElementById('finish-overlay'); if (!ov) return;
    document.getElementById('pit-ov')?.remove();
    const col = stat < 2.6 ? 'var(--good)' : stat < 3.5 ? 'var(--warn)' : 'var(--bad)';
    ov.insertAdjacentHTML('beforeend', `<div id="pit-ov" class="pit-ov" style="--pc:${col}"><div class="tiny upper muted">Pit stop · ${esc(R.sim.driver(c).name)}</div><div class="pt">${stat.toFixed(2)}s</div><div class="small muted">${c.tyre ? COMPOUNDS[c.tyre].name : ''}</div></div>`);
    setTimeout(() => document.getElementById('pit-ov')?.remove(), 3500);
  };
  if (isSprint) R.sim.log('⚡ SPRINT: gara breve, punti ai primi 8 (8-7-6-5-4-3-2-1).', 'start', null, true);
  for (const c of R.sim.cars) if (c.isPlayer) {
    R.sim.setStartTyre(c, w.startTyre[c.key] || c.tyre); c.compoundsUsed = new Set([c.tyre]);
    c.plan = !isSprint && w.plans?.[c.key] && isDryPlan(st, w) ? normalizePlan(w.plans[c.key].map((x) => ({ ...x })), R.sim.laps) : null; c.planIdx = 0;
    if (c.plan && c.plan[0].c !== c.tyre) c.plan[0].c = c.tyre;
    if (!R.sim.endurance && w.fuel?.[c.key] != null && !isSprint) R.sim.setFuelLoad(c, w.fuel[c.key]);
    if (R.sim.endurance && w.endPlan?.[c.key]) R.sim.setEndPlan(c, w.endPlan[c.key]);
    c.lapTarget = R.sim.computeLap(c); R.pitSel[c.key] = defaultPitTyre(c);
  }
  R.ctab = {}; R.tvN = 0; R.tvQ = []; R.tvCur = null; R.ivh = {}; R.an = null;
  R.speed = getSettings().raceSpeed || 8; R.paused = true; R.feedN = 0; R.done = false; R.swap = {}; R.gh = {};
  R.view = new TrackView(document.getElementById('race-cv'), circuitPath(tr.cid), { pad: 50, padTop: 40, glow: 'rgba(255,255,255,0.12)', sectors: true, drs: st.category === 'formula' || st.category === 'junior' ? drsZones('formula', tr) : [] });
  R.last = performance.now(); R.uiT = 0;
  R.focus = R.sim.cars.find((c) => c.isPlayer)?.key;
  R.view3d = getSettings().view3d !== false && webglAvailable() ? (R.cam || 'auto') : null;
  renderViewBtns();
  if (R.view3d) enable3D(R.view3d);
  updateAll(true);
  // start lights
  music.setMood('race');
  startLights(() => { R.paused = false; R.last = performance.now(); updateSpeedUI(); engineStart(st.category); });
  const loop = (t) => {
    const dt = Math.min(0.1, (t - R.last) / 1000); R.last = t;
    if (!R.paused && !R.sim.finished && !R.replay && !R.moment) {
      let rem = dt * R.speed;
      while (rem > 0 && !R.sim.moments.length) { const d = Math.min(0.5, rem); R.sim.step(d); rem -= d; }
      if (R.sim.moments.length) showMoment(R.sim.moments[0]);
    }
    if (R.replay) playReplay(dt); else if (R.r3d) update3D(dt); else draw();
    if (R.r3d) draw();
    R.uiT += dt;
    if (R.uiT > 0.25) { R.uiT = 0; updateAll(); }
    if (R.sim.finished && !R.done) { R.done = true; updateAll(true); onRaceFinished(); }
    engineSet(R.paused || R.sim.finished ? 0 : R.r3d && R.focusSpeed != null ? R.focusSpeed / 345 : 0.55 + Math.sin(t / 900) * 0.35, { rain: R.sim.rain, crowd: 0.5 });
    R.raf = requestAnimationFrame(loop);
  };
  R.raf = requestAnimationFrame(loop);
  updateSpeedUI();
}
function stopRace() { closeAnalysis(true); R.moment = null; R.replay = null; R.rbuf = []; cancelAnimationFrame(R.raf); R.view?.destroy(); R.view = null; R.r3d?.destroy(); R.r3d = null; engineStop(); }

function renderViewBtns() {
  const el = document.getElementById('view-btns'); if (!el) return;
  const can3d = webglAvailable();
  el.innerHTML = (can3d ? `<button class="btn sm" data-a="replay" title="Rivedi gli ultimi 10 secondi">${icon('replay')} Replay</button>` : '') + [['2d', 'Mappa 2D'], ['auto', 'Regia'], ['tv', 'TV 3D'], ['chase', 'Camera car'], ['onboard', 'Onboard'], ...(['formula', 'junior'].includes(S().category) ? [['cockpit', 'Pilota']] : []), ['heli', 'Elicottero']].map(([k, n]) => `<button class="btn sm ${((R.view3d || '2d') === k) ? 'active' : ''}" data-a="${k === '2d' ? 'view2d' : 'cam'}" data-c="${k}" ${k !== '2d' && !can3d ? 'disabled' : ''}>${n}</button>`).join('');
}
function enable3D(cam) {
  const st = S(); const sim = R.sim;
  const rv = document.getElementById('race-view');
  if (!R.r3d) {
    const div = document.createElement('div'); div.className = 'r3d'; rv.prepend(div);
    try {
      R.r3d = new Race3D(div, { cid: sim.track.cid, street: sim.track.street || 0, night: !!sim.track.night && !sim.endurance, category: st.category,
        cars: [...sim.cars.map((c) => ({ key: c.key, livery: c.team.car.livery, helmet: sim.driver(c).helmet.c1, tyreColor: COMPOUNDS[c.tyre].color, isPlayer: c.isPlayer, number: sim.driver(c).number, sponsor: c.team.sponsors?.[0]?.name || c.team.short })), ...(sim.traffic || []).map((g) => ({ key: g.key, livery: { primary: g.colors[0], secondary: g.colors[1], accent: '#111111' }, tyreColor: '#ffd400', number: g.num, sponsor: 'LMGT3', category: 'rally' }))] });
      if (sim.time < 1) R.r3d.startIntro(4.5);
    } catch (e) { console.warn('3D non disponibile', e); div.remove(); R.view3d = null; renderViewBtns(); return; }
  }
  R.r3d.director = cam === 'auto'; R.r3d.camMode = cam === 'auto' ? 'tv' : cam; R.r3d.dirT = 0; R.r3d.focusKey = R.focus; R.r3d._cut = true;
  rv.classList.add('mode3d');
  document.getElementById('hud3d')?.classList.remove('hidden');
  R.view?.resize();
}
function disable3D() {
  R.r3d?.destroy(); R.r3d = null; R.view3d = null;
  const rv = document.getElementById('race-view'); rv?.classList.remove('mode3d'); rv?.querySelector('.r3d')?.remove();
  document.getElementById('hud3d')?.classList.add('hidden');
  setTimeout(() => R.view?.resize(), 30);
}
function update3D(dt) {
  const sim = R.sim, r = R.r3d; if (!r) return;
  const g = trackGeometry(sim.track.cid);
  const states = sim.cars.map((c) => {
    if (c.status === 'dnf') return { key: c.key, hidden: true };
    const d = c.status === 'finished' ? c.finishLap + (sim.time - c.finishTime) / sim.track.lap * 0.3 : c.dist;
    const frac = arcFrac(sim.cat, sim.track.cid, d, sim.track.lap);
    const speed = c.inPit > 0 ? 0 : speedAtTimeFrac(sim.cat, sim.track.cid, d, c.lapTarget, sim.track.lap) / 3.6;
    const show = c.isPlayer || c.key === R.focus || c.pos <= 3;
    return { key: c.key, pos: c.pos, gap: c.status === 'running' && c.inPit <= 0 ? c.gapAhead : null, s: frac * g.N, speed, inPit: c.inPit > 0, pitting: !!c.pitReq, close: c.gapAhead < 1, tyreColor: COMPOUNDS[c.tyre].color, label: show ? `P${c.pos} ${shortName(sim.driver(c).name)}` : `${c.pos}` };
  });
  for (const g of sim.traffic || []) states.push({ key: g.key, s: arcFrac(sim.cat, sim.track.cid, g.dist, sim.track.lap) * g2N(sim), speed: speedAtTimeFrac(sim.cat, sim.track.cid, g.dist, g.lt, sim.track.lap) / 3.6, label: '' });
  r.focusKey = R.focus;
  r.setRain(sim.rain);
  if (sim.endurance && sim.track.night) { R.nightLvl = (R.nightLvl ?? 0) + ((sim.night ? 1 : 0) - (R.nightLvl ?? 0)) * Math.min(1, dt * 0.3); r.setNight(Math.round(R.nightLvl * 20) / 20); }
  // replay buffer (last ~14s of race time)
  if (!R.replay) {
    R.rbuf = R.rbuf || [];
    const last = R.rbuf[R.rbuf.length - 1];
    if (!last || sim.time - last.t > 0.05 || R.rbuf.length < 3) R.rbuf.push({ t: sim.time, st: states.map((x) => ({ ...x })) });
    while (R.rbuf.length && sim.time - R.rbuf[0].t > 14) R.rbuf.shift();
  }
  r.update(states, dt);
  const fc = sim.cars.find((c) => c.key === (r.director && r.dirFocus ? r.dirFocus : R.focus));
  const hud = document.getElementById('hud3d');
  if (hud && fc) {
    const st = states.find((x) => x.key === fc.key);
    const kmh = Math.round((st?.speed || 0) * 3.6);
    const gear = kmh < 5 ? 'N' : Math.min(8, 1 + Math.floor(kmh / 42));
    hud.innerHTML = `<span class="tiny muted upper">${esc(sim.driver(fc).name)}</span><span class="pos">P${fc.pos}</span><span class="spd">${kmh}</span><span class="tiny muted">km/h</span><span style="font-size:22px;font-weight:900">${gear}</span>${fc.drs ? '<span class="chip good">DRS</span>' : ''}${tyreBadge(fc.tyre)}`;
    R.focusSpeed = kmh;
  }
  // TV battle graphic: focused car within a second of the car ahead
  const bt = document.getElementById('battle');
  if (bt && fc) {
    const ahead = sim.cars.find((c) => c.pos === fc.pos - 1 && c.status === 'running');
    const behind = sim.cars.find((c) => c.pos === fc.pos + 1 && c.status === 'running');
    let a = null, b = null;
    if (ahead && fc.gapAhead < 1.0 && fc.inPit <= 0 && ahead.inPit <= 0) { a = ahead; b = fc; } else if (behind && behind.gapAhead < 1.0 && behind.inPit <= 0 && fc.inPit <= 0) { a = fc; b = behind; }
    if (a && b && !sim.sc) {
      const side = (c) => `<div class="bt-car" style="--tc:${c.team.car.livery.primary}"><span class="bt-pos">P${c.pos}</span><span class="bt-name">${esc(shortName(sim.driver(c).name))}</span>${tyreBadge(c.tyre)}<span class="tiny muted">${Math.round(c.wear * 100)}%</span></div>`;
      bt.innerHTML = `${side(a)}<div class="bt-gap">${b.gapAhead.toFixed(1)}s${b.drs ? '<span class="bt-drs">DRS</span>' : ''}</div>${side(b)}`;
      bt.classList.add('on');
    } else bt.classList.remove('on');
  }
}

function rc(el) { return R.sim?.cars.find((x) => x.key === el.dataset.key && x.status === 'running'); }
function defaultPitTyre(c) {
  const comps = R.sim.C.compounds;
  if (c.plan && c.plan[c.planIdx + 1]) return c.plan[c.planIdx + 1].c;
  return c.tyre === 'medium' ? 'hard' : comps.includes('medium') ? 'medium' : comps[0];
}

function startLights(done) {
  const ov = document.getElementById('finish-overlay');
  let n = 0;
  ov.innerHTML = `<div class="start-lights" id="lights">${[0, 1, 2, 3, 4].map((i) => `<div id="l${i}"></div>`).join('')}</div>`;
  const iv = setInterval(() => {
    if (n < 5) { const l = document.getElementById(`l${n}`); if (l) { l.style.background = '#ff1a1a'; l.style.boxShadow = '0 0 20px #f00'; } sfx.beep(); n++; R.r3d?.setStartLights(n, false); }
    else { clearInterval(iv); setTimeout(() => { document.querySelectorAll('#lights > div').forEach((l) => { l.style.background = '#1b1d21'; l.style.boxShadow = 'inset 0 0 8px #000'; }); sfx.go(); R.r3d?.setStartLights(0, true); setTimeout(() => { const L = document.getElementById('lights'); if (L) L.remove(); }, 600); done(); }, 300 + Math.random() * 900); }
  }, 520);
}

function draw() {
  const v = R.view; if (!v) return;
  const sim = R.sim;
  const style = sim.C.id === 'endurance' ? 'endurance' : 'formula';
  v.frame((c) => {
    let pitIdx = 0;
    for (const g of sim.traffic || []) { const q = v.pointAt(arcFrac(sim.cat, sim.track.cid, g.dist, sim.track.lap)); v.drawCar(q.x, q.y, q.ang, g.colors[0], g.colors[1], { style, len: 9 }); }
    const cars = sim.cars.filter((x) => x.status !== 'dnf').sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const car of cars) {
      const L = car.team.car.livery;
      let q;
      if (car.inPit > 0 && v.pitPos) q = v.pitPos(pitIdx++);
      else q = v.pointAt(arcFrac(sim.cat, sim.track.cid, car.status === 'finished' ? car.finishLap : car.dist, sim.track.lap));
      const d = sim.driver(car);
      v.drawCar(q.x, q.y, q.ang, L.primary, L.secondary, { style, glow: car.isPlayer ? L.primary : null, outline: car.isPlayer, label: car.isPlayer || car.pos <= 3 ? `${car.pos} ${shortName(d.name)}` : null, num: R.r3d ? null : car.pos, dot: !(car.isPlayer || car.pos <= 3), labelBg: car.isPlayer ? L.primary : 'rgba(0,0,0,0.75)' });
    }
  }, { rain: sim.rain, night: sim.night });
}

function updateAll(force) { updateBoard(); updateTop(); updateControls(force); updateFeed(); updateSub(); try { tvUpdate(R.sim, R); trackerUpdate(R.sim, R); } catch (e) { console.warn(e); } }

// TV-style subtitles: latest commentary line and driver radio outbursts
function updateSub() {
  const sim = R.sim, el = document.getElementById('race-sub'); if (!sim || !el) return;
  const now = performance.now();
  for (const [k, cls] of [['lastRadio', 'radio'], ['lastComm', 'comm']]) {
    const m = sim[k];
    if (m && m !== R['_sub' + k]) {
      R['_sub' + k] = m;
      const c = m.key && sim.cars.find((x) => x.key === m.key);
      const col = c ? c.team.car.livery.primary : 'var(--accent)';
      el.insertAdjacentHTML('afterbegin', `<div class="sub ${cls}${m.angry ? ' angry' : ''}" data-t="${now}" style="--sc:${col}">${cls === 'radio' ? '<span class="sub-tag">RADIO</span>' : '<span class="sub-tag">LIVE</span>'}${esc(m.text.replace(/^(🎙|📻)\s*/u, ''))}</div>`);
      if (cls === 'radio' && c) try { sfx.radio?.(); } catch {}
    }
  }
  const items = [...el.children];
  items.forEach((x, i) => { if (i > 1 || now - +x.dataset.t > 7000) { x.classList.add('out'); setTimeout(() => x.remove(), 400); } });
}

function updateTop() {
  const sim = R.sim;
  const leader = sim.classification()[0];
  const lap = Math.min(sim.laps, Math.max(1, Math.floor(leader.status === 'finished' ? sim.laps : leader.dist) + 1));
  const el = document.getElementById('lapcount'); if (el) el.textContent = `${lap}/${sim.laps}`;
  const pg = document.getElementById('race-prog'); if (pg) pg.style.width = `${Math.min(100, (leader.status === 'finished' ? 1 : leader.dist / sim.laps) * 100).toFixed(2)}%`;
  const tt = document.getElementById('racetime'); if (tt) { const s = Math.floor(sim.time); tt.textContent = `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  const wx = document.getElementById('wx'); const r = sim.rain;
  if (wx) wx.innerHTML = `<b class="${r > 0.2 ? 'info' : ''}">${r < 0.05 ? 'Asciutto' : r < 0.3 ? 'Pioviggine' : r < 0.6 ? 'Pioggia' : 'Diluvio'}${sim.night ? ' · Notte' : ''}</b><span>Meteo ${Math.round(r * 100)}%</span>`;
  const fs = document.getElementById('flagstatus');
  if (fs) { const h = sim.sc ? '<span class="flagplate sc"><i></i>Safety car</span>' : sim.finished ? '<span class="flagplate end"><i></i>Bandiera a scacchi</span>' : '<span class="flagplate green"><i></i>Bandiera verde</span>'; if (fs.innerHTML !== h) fs.innerHTML = h; }
}

// "Charles Leclair" -> "C. Leclair" so the tower stays readable on narrow screens
function towerName(n) {
  const p = String(n).split(' ');
  if (p.length < 2) return esc(n);
  return `<span class="ini">${esc(p[0][0])}.</span> ${esc(p.slice(1).join(' '))}`;
}
function updateBoard() {
  const sim = R.sim;
  const cls = sim.classification(); const leader = cls[0];
  const interval = R.gapMode === 'int';
  let prevGap = 0;
  const html = cls.map((c, i) => {
    const d = sim.driver(c);
    const gl = i ? sim.gapToLeader(c, leader) : 0;
    let gap, gcls = '';
    if (c.status === 'dnf') gap = 'RIT';
    else if (i === 0) gap = c.status === 'finished' ? 'Arrivo' : 'Leader';
    else if (interval && typeof gl === 'number' && typeof prevGap === 'number') {
      const iv = Math.max(0, gl - prevGap);
      gap = `+${iv.toFixed(iv < 10 ? 3 : 1)}`;
      gcls = c.drs || iv < 1 ? 'drs' : iv < 2 ? 'close' : '';
    } else gap = fmtGap(gl);
    if (c.status !== 'dnf') prevGap = gl;
    const posDelta = c.grid - (i + 1);
    const fl = sim.fastest.key === c.key;
    return `<div class="lb-row ${c.isPlayer ? 'me' : ''} ${c.status === 'dnf' ? 'dnf' : ''} ${c.inPit > 0 ? 'pit' : ''} ${c.key === R.focus ? 'focus' : ''}" data-a="focus" data-key="${c.key}">
      <span class="pos p${i + 1}">${i + 1}</span>${teamStripe(c.team)}
      <span class="nm">${towerName(d.name)}${fl ? '<i class="fl" data-tip="Giro più veloce"></i>' : ''} ${posDelta > 0 ? `<span class="good tiny">▲${posDelta}</span>` : posDelta < 0 ? `<span class="bad tiny">▼${-posDelta}</span>` : ''}</span>
      <span>${c.status === 'dnf' ? '' : tyreBadge(c.tyre)}</span>
      <div>${c.status === 'dnf' ? `<span class="tiny bad">${esc(c.reason || '')}</span>` : c.inPit > 0 ? '<span class="chip warn tiny">BOX</span>' : `<div class="wear" data-tip="Gomme ${COMPOUNDS[c.tyre]?.name || ''}: ${Math.max(0, Math.round((1 - c.wear) * 100))}% · ${c.stintLap ?? 0} giri"><i style="width:${Math.max(0, 1 - c.wear) * 100}%;background:${c.wear > 0.8 ? 'var(--bad)' : c.wear > 0.55 ? 'var(--warn)' : 'var(--good)'}"></i></div>`}</div>
      <span class="gap ${gcls}">${gap}</span></div>`;
  }).join('');
  const b = document.getElementById('board');
  const fk = sim.fastest.key && sim.cars.find((c) => c.key === sim.fastest.key);
  if (b) b.innerHTML = `<div class="lb-row lb-head"><span>Pos</span><span></span><span>Pilota</span><span>Gom</span><span>Usura</span><span class="gapmode" data-a="gapmode" data-tip="Clicca per alternare distacco dal leader / intervallo con chi precede">${interval ? 'Interv.' : 'Gap'}</span></div>${html}<div class="lb-foot muted"><i class="fl" style="display:inline-block;width:9px;height:9px;background:var(--purple)"></i>Giro veloce: ${fk ? `<b style="color:#fff">${esc(sim.driver(fk).name)}</b> <span class="lap-t">${fmtTime(sim.fastest.time)}</span>` : '—'}</div>`;
}

// Gap to the car ahead, sampled once per lap, for the sparkline in the control card
function gapHistory(sim, c, gA) {
  R.gh ||= {};
  const h = (R.gh[c.key] ||= []);
  const lap = Math.floor(c.dist);
  if (gA == null || gA > 60 || c.status !== 'running') return h;
  if (!h.length || h[h.length - 1].lap !== lap) h.push({ lap, v: gA }); else h[h.length - 1].v = gA;
  if (h.length > 16) h.shift();
  return h;
}
function sparkline(vals, w = 120, h = 24) {
  if (vals.length < 2) return '';
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(2 + (1 - (v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`);
  const last = vals[vals.length - 1], first = vals[0];
  const col = last < first - 0.15 ? 'var(--good)' : last > first + 0.15 ? 'var(--bad)' : 'var(--text2)';
  const one = (1 - (1 - min) / (max - min || 1)) * (h - 4) + 2;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${max >= 1 ? `<line x1="0" x2="${w}" y1="${one.toFixed(1)}" y2="${one.toFixed(1)}" stroke="rgba(34,211,122,.45)" stroke-dasharray="3 3" stroke-width="1"/>` : ''}<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="2.4" fill="${col}"/></svg>`;
}
function lapCls(sim, c) {
  if (!c.lastLap || !isFinite(c.lastLap)) return '';
  if (sim.fastest.key === c.key && Math.abs(sim.fastest.time - c.lastLap) < 1e-6) return 't-purple';
  if (c.bestLap && c.lastLap <= c.bestLap + 1e-6) return 't-green';
  return 't-yellow';
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
    const wearTxt = Math.max(0, Math.round((1 - c.wear) * 100));
    const advice = engineerAdvice(sim, c);
    const pitSel = R.pitSel[c.key];
    const tab = R.ctab?.[c.key] || 'drive';
    const tabs = c.status === 'running' ? `<div class="ctabs"><div class="${tab === 'drive' ? 'on' : ''}" data-a="ctab" data-key="${c.key}" data-t="drive">Pilota</div><div class="${tab === 'strat' ? 'on' : ''}" data-a="ctab" data-key="${c.key}" data-t="strat">Strategia${(() => { const a = sim.advise(c); return a?.urgent && a.act ? ' <i class="ctab-dot"></i>' : ''; })()}</div></div>` : '';
    if (c.status === 'running' && tab === 'strat') return `<div class="ctrl-card" style="border-top-color:${c.team.car.livery.primary}">
      <div class="row">${helmetSVG(d.helmet, 34)}<div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">P${i + 1} · ${COMPOUNDS[c.tyre].name} ${c.stintLap} giri · usura ${Math.round(c.wear * 100)}% · soste ${c.pitStops}</div></div><span class="pos p${i + 1}" style="font-size:26px">P${i + 1}</span></div>${tabs}
      ${raceStrategyHTML(sim, c, R)}
      <button class="btn ${c.pitReq ? 'danger' : 'team'} mt8" style="width:100%" data-a="pit" data-key="${c.key}">${c.pitReq ? `Annulla box (${c.pitReq.compound ? COMPOUNDS[c.pitReq.compound].short : 'benzina'})` : `${icon('pit')} Box ora`}</button>
    </div>`;
    return `<div class="ctrl-card" style="border-top-color:${c.team.car.livery.primary}">
      <div class="row">${helmetSVG(d.helmet, 34)}<div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">${c.status === 'dnf' ? `<span class="bad">Ritirato: ${esc(c.reason)}</span>` : c.status === 'finished' ? 'Arrivato' : `P${i + 1} · Partito P${c.grid} · Soste ${c.pitStops}`}</div></div><span class="pos p${i + 1}" style="font-size:26px">P${i + 1}</span></div>${tabs}
      ${c.status === 'running' ? `
      <div class="grid2 mt8 small" style="gap:6px"><div class="muted">Davanti <b style="color:#fff" class="mono">${gA != null && gA < 60 ? '-' + Math.max(0, gA).toFixed(1) + 's' : '—'}</b></div><div class="muted right">Dietro <b style="color:#fff" class="mono">${gB != null && gB < 60 ? '+' + Math.max(0, gB).toFixed(1) + 's' : '—'}</b></div></div>
      <div class="row mt8">${tyreBadge(c.tyre)}<div class="grow"><div class="row between tiny"><span>${COMPOUNDS[c.tyre].name} · ${c.stintLap} giri</span><span class="${tempCls(sim, c)}">${Math.round(c.temp)}°C</span><span class="${c.wear > 0.75 ? 'bad' : ''}">${wearTxt}%</span></div><div class="wear" style="height:6px"><i style="width:${wearTxt}%;background:${c.wear > 0.7 ? 'var(--bad)' : c.wear > 0.45 ? 'var(--warn)' : 'var(--good)'}"></i></div></div></div>
      ${sim.endurance ? `<div class="row mt8">${icon('fuel', 'ico', 'style="width:18px"')}<div class="grow"><div class="row between tiny"><span>Carburante</span><span class="${c.fuel < 1.5 ? 'bad' : ''}">${c.fuel.toFixed(1)} giri</span></div><div class="wear" style="height:6px"><i style="width:${(c.fuel / c.fuelMax) * 100}%;background:var(--info)"></i></div></div></div><div class="tiny muted mt8">Stint pilota: ${c.stintCount + 1}${c.stintCount >= 2 ? ' <span class="warn">(affaticato)</span>' : ''}</div>` : ''}
      ${c.damage > 0.05 ? `<div class="chip bad mt8">Danni: +${c.damage.toFixed(1)}s/giro</div>` : ''}
      ${(() => { const h = gapHistory(sim, c, gA); return h.length >= 3 ? `<div class="gapline" data-tip="Distacco da chi precede negli ultimi giri. Sotto la linea verde (1s) puoi attaccare con DRS/Override."><div><div class="gl-lbl">Gap avanti</div><div class="gl-v">${gA != null && gA < 60 ? Math.max(0, gA).toFixed(2) + 's' : '—'}</div></div>${sparkline(h.map((x) => x.v))}</div>` : ''; })()}
      <div class="tiny upper muted mt8 mb8">Ritmo</div>
      <div class="seg">${[['save', 'Gestione', 'Gestione: più lento ma risparmia gomme (e carburante).'], ['normal', 'Normale', 'Normale: equilibrio tra passo e usura.'], ['push', 'Attacco', 'Attacco: più veloce, ma consuma le gomme e le surriscalda.']].map(([k, n, tip]) => `<div class="${c.mode === k ? 'on ' + k : ''}" data-a="mode" data-key="${c.key}" data-m="${k}" data-tip="${tip}">${n}</div>`).join('')}</div>
      <div class="row between tiny mt8"><span class="upper muted">${sim.endurance ? 'Ibrido' : 'Batteria ERS'}</span><span class="${c.ers < 20 ? 'bad' : ''}">${Math.round(c.ers)}%</span></div>
      <div class="wear" style="height:6px;margin:4px 0 6px"><i style="width:${c.ers}%;background:linear-gradient(90deg,#7c4dff,#00e5ff)"></i></div>
      <div class="seg">${[['harvest', 'Ricarica', 'Ricarica: perdi un po’ di passo ma riempi la batteria.'], ['balanced', 'Bilanciato', 'Bilanciato: usa e recupera energia in modo neutro.'], ['deploy', 'Override', 'Override: massima potenza elettrica. Usalo entro 1s da chi precede per sorpassare.']].map(([k, n, tip]) => `<div class="${c.ersMode === k ? 'on ' + (k === 'deploy' ? 'push' : k === 'harvest' ? 'save' : '') : ''}" data-a="ers" data-key="${c.key}" data-m="${k}" data-tip="${tip}">${n}</div>`).join('')}</div>
      <div class="tiny upper muted mt8 mb8">Pit stop</div>
      <div class="row gap4 wrap">${sim.C.compounds.map((cp) => `<button class="btn sm ${pitSel === cp ? 'active' : ''}" style="padding:4px 6px" data-a="pitsel" data-key="${c.key}" data-c="${cp}" data-tip="Monta ${COMPOUNDS[cp].name} alla prossima sosta">${tyreBadge(cp)}</button>`).join('')}${sim.endurance ? `<button class="btn sm ${pitSel === 'none' ? 'active' : ''}" style="padding:4px 8px" data-a="pitsel" data-key="${c.key}" data-c="none">${icon('fuel')} Solo benzina</button>` : ''}</div>
      ${sim.endurance && c.driverIds.length > 1 ? `<button class="btn sm mt8 ${R.swap[c.key] ? 'active' : ''}" style="width:100%" data-a="swap" data-key="${c.key}">${icon('swap')} Cambio pilota → ${esc(st.drivers[c.driverIds[(c.driverIdx + 1) % c.driverIds.length]].name.split(' ').pop())}</button>` : ''}
      <button class="btn ${c.pitReq ? 'danger' : 'team'} mt8 ${advice?.urgent && !c.pitReq ? 'pulse' : ''}" style="width:100%" data-a="pit" data-key="${c.key}">${c.pitReq ? `Annulla box (${c.pitReq.compound ? COMPOUNDS[c.pitReq.compound].short : 'benzina'})` : `${icon('pit')} Chiama ai box`}</button>
      ${(() => { const a = sim.advise(c); if (a?.urgent && a.act) return adviceHTML(a, c, true); return advice ? `<div class="small mt8 ${advice.urgent ? 'warn' : 'muted'}">${icon('info', 'ico', 'style="width:13px;vertical-align:-2px"')} ${advice.text}</div>` : ''; })()}
      ${!sim.endurance && sim.fuelMargin(c) < 0.2 ? `<div class="row between tiny mt8"><span class="${sim.fuelMargin(c) < 0 ? 'bad' : 'warn'}">${icon('fuel', 'ico', 'style="width:12px;vertical-align:-2px"')} Benzina ${sim.fuelMargin(c) >= 0 ? '+' : ''}${sim.fuelMargin(c).toFixed(1)} giri</span><button class="btn sm ${c.fuelSave ? 'active' : ''}" data-a="rs-lift" data-key="${c.key}">Lift &amp; coast ${c.fuelSave ? 'ON' : 'OFF'}</button></div>` : ''}
      <div class="row between mt8 tiny"><span class="muted">Strategia automatica (ingegnere)</span><button class="btn sm ${c.auto ? 'active' : ''}" data-a="auto" data-key="${c.key}" data-tip="L’ingegnere decide ritmo e pit stop al posto tuo">${c.auto ? 'ON' : 'OFF'}</button></div>
      <div class="timing" data-tip="Viola: giro più veloce della gara · Verde: record personale · Giallo: più lento del tuo migliore"><div><span>Ultimo</span><b class="${lapCls(sim, c)}">${fmtTime(c.lastLap)}</b></div><div><span>Migliore</span><b class="${sim.fastest.key === c.key ? 't-purple' : c.bestLap ? 't-green' : ''}">${fmtTime(c.bestLap)}</b></div><div><span>Giri rim.</span><b>${lapsLeft.toFixed(1)}</b></div></div>` : ''}
    </div>`;
  }).join('');
  const plan = R.sim.weather.plan;
  const curLap = Math.floor(R.sim.progress * R.sim.laps);
  const wxHtml = `<div class="panel tight"><div class="row between tiny upper muted mb8"><span>Radar meteo</span><span>${R.sim.weather.isRain ? 'Pioggia prevista' : 'Asciutto'}</span></div><div class="weather-strip">${plan.slice(0, R.sim.laps).map((r, i) => `<i style="height:${Math.max(2, r * 20)}px;opacity:${i < curLap ? 0.25 : r > 0.05 ? 0.95 : 0.15};${i === curLap ? 'background:#fff' : ''}"></i>`).join('')}</div></div>`;
  const radio = sim.radioQ.map((r) => { const c = sim.cars.find((x) => x.key === r.key); return `<div class="ctrl-card radio-card"><div class="rc-h">${icon('radio')} Radio · ${esc(sim.driver(c).name)}</div><div class="mt8" style="font-weight:600;font-size:15px">${esc(r.text.replace(/^[^:]+: /, ''))}</div><div class="row gap6 mt8"><button class="btn sm good grow" data-a="radio" data-id="${r.id}" data-y="1">${{ pit: 'Box, box!', pass: 'Ok, scambio', push: 'Vai, attacca!', rain: 'Box per intermedie', ers: 'Sì, ricarica' }[r.type]}</button><button class="btn sm grow" data-a="radio" data-id="${r.id}" data-y="0">${{ pit: 'Resta fuori', pass: 'Negativo', push: 'Gestisci', rain: 'Resta fuori', ers: 'No' }[r.type]}</button></div><div class="wear mt8" style="height:3px"><i style="width:${Math.max(0, (r.until - sim.time) / 40) * 100}%;background:var(--warn)"></i></div></div>`; }).join('');
  const myTeam = mine[0]?.teamId;
  const orders = mine.length > 1 && mine.every((c) => c.status === 'running') ? `<div class="panel tight"><div class="tiny upper muted mb8">Ordini di scuderia</div><div class="seg">${[['free', 'Libera lotta'], ['hold', 'Mantenere'], ['swap', 'Scambio']].map(([k, n]) => `<div class="${(sim.teamOrders[myTeam] || 'free') === k ? 'on' : ''}" data-a="orders" data-o="${k}">${n}</div>`).join('')}</div></div>` : '';
  const full = radio + html + orders + wxHtml + (R.sim.finished ? `<button class="btn primary xl pulse" data-a="finish-race">${icon('chequered')} Risultati</button>` : '');
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
  if (c.wear > 0.95 && lapsLeft > 2) return { text: 'Siamo nel cliff delle gomme: perdiamo secondi ogni giro!', urgent: true };
  if ((sim.sc || sim.vsc) && c.wear > 0.35 && lapsLeft > 4) return { text: `${sim.sc ? 'Safety car' : 'VSC'}: la sosta costa meno, è il momento ideale per fermarsi!`, urgent: true };
  if (!sim.endurance && !sim.weather.isRain && [...c.compoundsUsed].filter((x) => !COMPOUNDS[x].wet).length < 2 && lapsLeft < 6) return { text: 'Regolamento: devi ancora montare una seconda mescola!', urgent: true };
  if (c.plan && !comp.wet && c.plan[c.planIdx + 1]) {
    const st = c.plan[c.planIdx]; const left = st.laps - c.stintLap;
    if (left <= 1) return { text: `Piano: box ADESSO per ${COMPOUNDS[c.plan[c.planIdx + 1].c].name}.`, urgent: true };
    if (left <= 4) return { text: `Piano: sosta tra ${left} giri (${COMPOUNDS[c.plan[c.planIdx + 1].c].name}). Valuta l’undercut sul rivale davanti.` };
  }
  if (c.wear > 0.75 && lapsLeft > 3) return { text: 'Usura alta: siamo vicini al cliff, finestra di pit aperta.' };
  if (Math.abs(c.temp - (sim.cat !== 'endurance' ? { soft: 95, medium: 103, hard: 111 }[c.tyre] || 80 : 100)) > 14 && !comp.wet) return { text: c.temp < 90 ? 'Gomme fredde: spingi un po’ per portarle in temperatura.' : 'Gomme surriscaldate: passa in Gestione per qualche giro.' };
  if (c.drs) return { text: 'DRS disponibile: siamo entro un secondo, attacca!' };
  return null;
}

function updateFeed(force) {
  const sim = R.sim;
  const evs = sim.events;
  const changed = evs.length !== R.feedN;
  const newOnes = evs.slice(R.feedN);
  R.feedN = evs.length;
  for (const e of newOnes) {
    if (e.type === 'crash') sfx.crash();
    else if (e.type === 'pit' && e.important) sfx.pit();
    else if (e.type === 'sc') sfx.notify();
    else if (e.type === 'overtake' && e.important) sfx.overtake();
    if ((e.type === 'overtake' || e.type === 'crash') && e.key) R.lastHighlight = { key: e.key, t: e.t };
    else if (e.type === 'radio') sfx.radio?.();
    if (e.type === 'sc' && !R.lessonSC) { R.lessonSC = true; App.toast('Lezione: safety car', 'Ai box si perde circa metà del tempo: spesso conviene fermarsi ora.', ''); }
  }
  const tab = R.tab || 'feed';
  const head = document.getElementById('feed-tabs');
  if (head) head.innerHTML = [['feed', 'Cronaca'], ['tele', 'Telemetria'], ['lap', 'Analisi giro'], ['strat', 'Strategie'], ...(S().quick ? [] : [['champ', 'Mondiale live']])].map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="tele-tab" data-t="${k}">${n}</div>`).join('') + `<div class="grow"></div><button class="btn sm ghost" data-a="lessons" style="padding:3px 10px">${icon('info')} Lezioni</button>`;
  const f = document.getElementById('feed');
  if (!f) return;
  if (tab === 'feed') {
    if (!changed && !force && f.dataset.mode === 'feed') return;
    f.dataset.mode = 'feed';
    f.innerHTML = evs.slice(-60).reverse().map((e) => `<div class="feed-item ${e.type} ${e.key && sim.cars.find((c) => c.key === e.key)?.isPlayer ? 'player' : ''}"><span class="lap">G${e.lap}</span><span>${esc(e.text)}</span></div>`).join('');
  } else if (tab === 'tele') {
    if (f.dataset.mode !== 'tele') { f.dataset.mode = 'tele'; f.innerHTML = '<canvas id="tele-cv" style="width:100%;height:100%"></canvas>'; }
    const mine = sim.cars.filter((c) => c.isPlayer);
    const leader = sim.classification()[0];
    const keys = [...mine.map((c) => c.key), ...(leader.isPlayer ? [] : [leader.key])];
    const cols = [...mine.map((c, i) => (i ? '#ffffff' : c.team.car.livery.primary)), '#ffcc33'];
    drawTelemetry(document.getElementById('tele-cv'), sim, keys, cols);
  } else if (tab === 'strat') {
    if (!force && f.dataset.mode === 'strat' && performance.now() - (R._stratT || 0) < 1500) return;
    R._stratT = performance.now(); f.dataset.mode = 'strat';
    f.innerHTML = `<div class="feed-strat">${stintChartSVG(sim, sim.classification(), { w: Math.max(520, f.clientWidth - 8), rowH: 17, labW: 86 })}</div>`;
  } else if (tab === 'champ') {
    if (!force && f.dataset.mode === 'champ' && performance.now() - (R._champT || 0) < 1500) return;
    R._champT = performance.now(); f.dataset.mode = 'champ';
    f.innerHTML = liveStandingsHTML(S(), sim);
  } else {
    f.dataset.mode = 'lap';
    const mine = sim.cars.filter((c) => c.isPlayer);
    const sel = mine.find((c) => c.key === R.teleKey) || mine[0];
    f.innerHTML = `<div class="row gap6 mb8">${mine.map((c) => `<button class="btn sm ${c === sel ? 'active' : ''}" data-a="tele-car" data-key="${c.key}">${esc(sim.driver(c).name)}</button>`).join('')}<span class="tiny muted">Come l’ingegnere calcola il prossimo giro</span></div>${breakdownHTML(sim, sel)}`;
  }
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
  if (best <= 3) { sfx.win(); celebrate(best === 1 ? 260 : 120); music.setMood('win'); }
  const ov = document.getElementById('finish-overlay');
  if (ov) ov.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:3"><div class="finish-card"><div class="tiny upper muted mt8">Bandiera a scacchi</div><div class="fc-t">${R.sim.isSprint ? 'Sprint finita' : 'Gara finita'}</div><div class="mt16" style="color:var(--text2);font-size:16px"><b style="color:#fff">${esc(st.drivers[res.classification[0].driverIds[0]].name)}</b> vince · il tuo miglior risultato: <b style="color:#fff">${best === 99 ? 'Ritiro' : 'P' + best}</b></div><div class="row mt24" style="justify-content:center;gap:10px"><button class="btn lg" data-a="an-open">${icon('chart')} Analisi gara</button><button class="btn primary xl" data-a="finish-race">Vai ai risultati ${icon('right')}</button></div></div></div>`;
}

function finishRace() {
  const st = S();
  const sim = R.sim;
  if (!sim.finished) sim.runToEnd();
  const res = sim.results();
  const w = st.weekend;
  if (!st.quick) try { applyRaceRivalry(st, sim); } catch (e) { console.warn(e); }
  if (sim.isSprint) {
    const SP = [8, 7, 6, 5, 4, 3, 2, 1];
    w.sprintRes = res.classification.map((r) => ({ key: r.key, teamId: r.teamId, driverIds: r.driverIds, pos: r.pos, status: r.status, pts: r.status === 'dnf' ? 0 : SP[r.pos - 1] || 0 }));
    w.sprintDone = true;
    stopRace(); R.sim = null;
    const win = st.drivers[w.sprintRes[0].driverIds[0]];
    const mine = w.sprintRes.filter((r) => r.teamId === st.playerTeam).map((r) => `${st.drivers[r.driverIds[0]].name}: ${r.status === 'dnf' ? 'RIT' : 'P' + r.pos}${r.pts ? ` (+${r.pts})` : ''}`).join(' · ');
    saveGame();
    App.refresh();
    App.modal(`<div class="tiny upper" style="color:var(--team)">Sprint conclusa</div><h2 class="mt8">Vince ${esc(win.name)}</h2><p class="muted">${esc(mine)}</p><p class="small muted">Ora il Gran Premio: la griglia è quella delle qualifiche. Gomme e carburante tornano nuovi.</p><div class="row mt16" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Vai al Gran Premio</button></div>`);
    return;
  }
  if (w.sprintRes) res.sprint = w.sprintRes;
  res.pole = st.weekend.quali ? buildEntries(st).find((e) => e.key === (st.weekend.quali.qualiOrder || st.weekend.quali.grid)[0])?.driverIds[0] : null;
  res.track = st.weekend.trackId;
  res.wet = sim.weather.isRain;
  const evIdx = st.round;
  stopRace();
  R.sim = null;
  applyRoundResults(st, res);
  st.lastRace = { idx: evIdx };
  saveGame();
  App.go('results', { idx: evIdx });
  if (st.quick) st.quickDone = true;
}

function tempCls(sim, c) {
  const win = { soft: 95, medium: 103, hard: 111, inter: 75, wet: 65 }[c.tyre] - (sim.endurance ? 3 : 0);
  const d = Math.abs(c.temp - win);
  return d < 7 ? 'good' : d < 14 ? 'warn' : 'bad';
}

function forecast(st, w) {
  const tr = getTrack(st.category, w.trackId);
  if (tr) return weatherForecast(st, w, tr).laps;
  const plan = w.weather.plan.slice(0, w.laps);
  if (hasPerk(st, 'meteo')) return plan;
  if (!w._fc) { const shift = Math.round((Math.random() - 0.5) * w.laps * 0.3); w._fc = plan.map((_, i) => { const r = plan[Math.min(plan.length - 1, Math.max(0, i + shift))] || 0; return Math.max(0, Math.min(1, r * (0.6 + Math.random() * 0.7))); }); }
  return w._fc;
}

function g2N(sim) { return trackGeometry(sim.track.cid).N; }

// ---------------- REPLAY ----------------
function startReplay(focusKey) {
  const r = R.r3d; if (!r || !R.rbuf || R.rbuf.length < 3) { App.toast('Replay non disponibile', 'Attiva la vista 3D e lascia scorrere la gara qualche secondo.', ''); return; }
  const t1 = R.rbuf[R.rbuf.length - 1].t, t0 = Math.max(R.rbuf[0].t, t1 - 10);
  R.replay = { t0, t1, t: t0, focus: focusKey || R.focus, prevCam: r.camMode, prevDir: r.director, wasPaused: R.paused };
  r.director = false; r.camMode = 'chase'; r._cut = true; r.focusKey = R.replay.focus;
  const ov = document.getElementById('finish-overlay');
  if (ov) ov.insertAdjacentHTML('beforeend', `<div id="replay-badge" class="replay-badge"><span class="tag red">${icon('replay')} Replay · <span id="rp-cam">camera car</span></span></div>`);
}
function stopReplay() {
  const r = R.r3d, rp = R.replay; if (!rp) return;
  if (r) { r.camMode = rp.prevCam; r.director = rp.prevDir; r._cut = true; r.focusKey = R.focus; }
  R.replay = null; document.getElementById('replay-badge')?.remove();
  R.last = performance.now();
}
function playReplay(dt) {
  const rp = R.replay, r = R.r3d; if (!r) { R.replay = null; return; }
  rp.t += dt * 1.0; // real-time playback of race time
  const k = (rp.t - rp.t0) / (rp.t1 - rp.t0);
  const cams = ['chase', 'tv', 'heli', 'onboard'];
  const ci = Math.min(cams.length - 1, Math.floor(k * cams.length));
  if (r.camMode !== cams[ci]) { r.camMode = cams[ci]; r._cut = true; const lab = document.getElementById('rp-cam'); if (lab) lab.textContent = { chase: 'camera car', tv: 'TV', heli: 'elicottero', onboard: 'onboard' }[cams[ci]]; }
  if (rp.t >= rp.t1) { stopReplay(); return; }
  const buf = R.rbuf; let i = 1; while (i < buf.length - 1 && buf[i].t < rp.t) i++;
  const a = buf[i - 1], b = buf[i]; const f = Math.max(0, Math.min(1, (rp.t - a.t) / ((b.t - a.t) || 1)));
  const N = trackGeometry(R.sim.track.cid).N;
  const states = a.st.map((sa) => { const sb = b.st.find((x) => x.key === sa.key) || sa; if (sa.hidden) return sa; let ds = sb.s - sa.s; if (ds < -N / 2) ds += N; if (ds > N / 2) ds -= N; return { ...sa, s: (sa.s + ds * f + N) % N, speed: sa.speed + (sb.speed - sa.speed) * f }; });
  r.focusKey = rp.focus;
  r.update(states, dt);
}

// ---------------- KEY MOMENTS ----------------
function showMoment(m) {
  if (R.moment) return;
  R.moment = m;
  sfx.notify();
  if (m.key && m.key !== 'all') { R.focus = m.key; if (R.r3d) { R.r3d.director = false; R.r3d.camMode = m.type === 'sc' ? 'heli' : 'chase'; R.r3d._cut = true; R.r3d.focusKey = m.key; } }
  const ov = document.getElementById('finish-overlay'); if (!ov) return;
  const col = { sc: 'var(--warn)', rain: 'var(--info)', front: 'var(--info)', attack: 'var(--bad)', defend: 'var(--bad)', undercut: 'var(--warn)', issue: 'var(--warn)', restart: 'var(--good)', mates: 'var(--team)' }[m.type] || 'var(--team)';
  const eyebrow = { issue: 'Problema tecnico', restart: 'Ripartenza', front: 'Radar meteo', mates: 'Ordini di scuderia' }[m.type] || 'Momento chiave';
  ov.insertAdjacentHTML('beforeend', `<div id="moment" class="decision" style="border-top-color:${col};width:min(660px,92%)"><div class="m-eyebrow" style="color:${col}">${eyebrow} · gara in pausa</div>
    <div class="m-title">${esc(m.title)}</div>
    <div class="mt8" style="line-height:1.55;color:var(--text2)">${esc(m.text)}</div>
    <div class="col gap6 mt16">${m.options.map((o, i) => `<div class="opt" data-a="moment" data-i="${i}"><div class="row between"><b>${esc(o.label)}</b><span class="kbd">${i + 1}</span></div><div class="small muted mt8">${esc(o.desc)}</div></div>`).join('')}</div>
    <div class="row between mt16"><span class="small muted">Puoi disattivare queste pause nelle impostazioni del muretto.</span><button class="btn sm ghost" data-a="moments-off">Non chiedere più in questa gara</button></div></div>`);
}
function resolveMomentUI(i) {
  const m = R.moment; if (!m) return;
  R.sim.resolveMoment(m.id, i);
  document.getElementById('moment')?.remove();
  R.moment = null;
  sfx.radio?.();
  if (R.r3d && R.view3d === 'auto') R.r3d.director = true;
  R.last = performance.now();
  updateControls(true);
}

// ---------------- ANALYSIS OVERLAY ----------------
function openAnalysis() {
  if (!R.sim || R.an) return;
  R.an = { tab: 'lap', sel: defaultSel(R.sim), wasPaused: R.paused };
  R.paused = true; updateSpeedUI();
  const w = document.createElement('div'); w.className = 'an-wrap'; w.id = 'analysis';
  w.addEventListener('mousedown', (e) => { if (e.target === w) closeAnalysis(); });
  document.body.appendChild(w);
  renderAnalysis();
}
function renderAnalysis() { const w = document.getElementById('analysis'); if (w && R.sim && R.an) w.innerHTML = analysisHTML(R.sim, S(), R.an.tab, R.an.sel); }
function closeAnalysis(silent) {
  document.getElementById('analysis')?.remove();
  if (R.an && !silent) { R.paused = R.an.wasPaused; R.last = performance.now(); updateSpeedUI(); }
  R.an = null;
}
