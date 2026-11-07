// Live practice and qualifying screens: session clock, cars on track (2D map + 3D),
// timing tower with sectors, garage panel to send each car out with its own programme.
import { App, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG } from '../ui/art.js';
import { esc, bar, fmtTime } from '../ui/dom.js';
import { S, saveGame, getSettings } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { playerTeam } from '../engine/season.js';
import { buildEntries, aiSetupQuality, SETUP_BIAS, finalizeQualifying, weatherForecast } from '../engine/race.js';
import { SessionSim, PRACTICE_DUR, qualiFormat, initSets, newSetsLeft, usedSets, limitedComp, fuelModel } from '../engine/session.js';
import { compEnabled, compStatus, fitComponent, prepareComponents } from '../engine/components.js';
import { licencePoints, BAN_POINTS } from '../engine/stewards.js';
import { COMPOUNDS } from '../data/categories.js';
import { circuitPath, arcFrac, speedAtTimeFrac, TrackView } from '../ui/trackview.js';
import { tyreBadge, teamStripe } from './common.js';
import { sfx, engineStart, engineSet, engineStop, music } from '../ui/audio.js';
import { Race3D, webglAvailable } from '../ui/race3d.js';
import { trackGeometry, drsZones } from '../engine/trackphys.js';
import { SETUP_PARAMS, setupQuality, setupFeedback, fbTxt, trackSetupBase } from './setup.js';
import { wearError } from './engineer.js';
import { clamp, rand } from '../engine/rng.js';

const P = window.__sess = { sim: null, id: null, view: null, r3d: null, raf: 0, speed: 8, paused: false, last: 0, uiT: 0, sel: null, tab: 'setup', spec: {}, focus: null, view3d: null, feedN: 0, sideSig: '', done: false };
let holding = false;
document.addEventListener('mousedown', () => { holding = true; });
document.addEventListener('mouseup', () => { setTimeout(() => { holding = false; }, 30); });

const shortName = (n) => { const p = n.split(' '); return (p[p.length - 1] || n).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const MODES = { save: 'Gestione', normal: 'Spinta', push: 'Al limite' };

export function isLiveSession(w) { return w && (w.phase === 'practice' || (w.phase === 'quali' && !w.quali)); }

// ---------------- SESSION LIFECYCLE ----------------
function sessionId(st) { const w = st.weekend; return `${st.season}|${st.round}|${st.calendar[st.round]?.trackId}|${w.phase}|${w.qs?.idx ?? 0}|${w.nonce ?? 0}`; }
function ensureSim(st) {
  const w = st.weekend; const id = sessionId(st);
  if (P.sim && P.id === id) return P.sim;
  const tr = getTrack(st.category, w.trackId);
  const setups = Object.fromEntries(Object.entries(w.cars).map(([k, c]) => [k, c.q]));
  let sim;
  w.lrData ??= {}; w.fpRuns ??= {};
  if (w.phase === 'practice') {
    w.sets = initSets(st); w.longRuns = {}; w.lrData = {}; w.fpRuns = {};
    w.fpRain ??= chanceRain(tr);
    sim = new SessionSim(st, tr, { kind: 'practice', name: 'Prove Libere', duration: PRACTICE_DUR, rain: w.fpRain, rubber: 0.02, setups, sets: w.sets, trackTemp: sessTemp(w, w.fpRain, -4) });
  } else {
    const fmt = qualiFormat(st);
    w.qs ??= { idx: 0, parts: [], rubber: clamp((w.fp?.rubber ?? 0.4) + 0.14, 0.55, 0.82) };
    if (!w.sets) w.sets = initSets(st);
    if (!w.qs.compDone) {
      const notes = prepareComponents(st, tr, buildEntries(st));
      w.qs.compNotes = notes.map((n) => ({ driverId: n.d.id, type: n.type, pen: n.pen, forced: n.forced }));
      w.qs.compDone = true;
      for (const n of w.qs.compNotes) App.toast(`${n.type === 'ice' ? 'Power unit' : 'Cambio'} sostituito d’ufficio`, `${st.drivers[n.driverId]?.name}: componente rotto${n.pen ? `, penalità di ${n.pen} posizioni` : ''}`, n.pen ? 'bad' : '');
    }
    const part = fmt[w.qs.idx];
    const prev = w.qs.parts[w.qs.idx - 1];
    const keys = prev ? prev.results.slice(0, fmt[w.qs.idx - 1].adv).map((r) => r.key) : null;
    sim = new SessionSim(st, tr, { kind: 'quali', name: part.name, duration: part.dur, adv: part.adv, keys, rain: w.qualiRain || 0, rubber: w.qs.rubber, setups, sets: w.sets, trackTemp: sessTemp(w, w.qualiRain, -2) });
  }
  sim.onRunEnd = (c, run) => onRunEnd(st, sim, c, run);
  P.sim = sim; P.id = id; P.feedN = 0; P.done = false; P.spec = {}; P.sideSig = ''; P.subN = 0;
  const mine = sim.cars.filter((c) => c.isPlayer);
  P.sel = mine[0]?.key || null; P.focus = P.sel || sim.cars[0]?.key;
  P.paused = false;
  return sim;
}
function sessTemp(w, rain, d) { const t = w.weather.trackTemp + d; return rain > 0.2 ? Math.min(t, 15 + Math.round((1 - rain) * 9)) : t; }
function chanceRain(tr) { return Math.random() < (tr.rain || 0) * 0.45 ? +rand(0.22, 0.7).toFixed(2) : 0; }

function onRunEnd(st, sim, c, run) {
  if (!c.isPlayer) return;
  const w = st.weekend;
  const wc = w.cars[c.key]; const d = sim.driver(c); const team = playerTeam(st);
  const valid = run.times.filter((t) => t.valid);
  const best = valid.length ? Math.min(...valid.map((t) => t.t)) : null;
  const first = d.name.split(' ')[0];
  if (!sim.isQuali && wc && valid.length) {
    wc.fb = setupFeedback(st, team, wc, d, valid.length);
    wc.laps.push(best);
    const bad = SETUP_PARAMS.map((p) => [p, wc.fb[p.id]]).filter(([, f]) => f !== 'ok').sort((a, b) => (b[1].startsWith('v') ? 1 : 0) - (a[1].startsWith('v') ? 1 : 0));
    const msg = bad.length ? `${bad[0][1].endsWith('lo') ? bad[0][0].lo : bad[0][0].hi}${bad.length > 1 ? `, e anche ${bad[1][0].short.toLowerCase()} da sistemare` : ''}.` : 'La macchina è perfetta, non toccate niente!';
    sim.log(`📻 ${first}: «${msg}»`, 'radio', c.key, true);
  }
  if (!sim.isQuali) {
    const clean = valid.filter((t) => !t.err && !t.notes.length);
    const rec = { comp: run.comp, n: valid.length, best, avg: clean.length ? clean.reduce((a, t) => a + t.t, 0) / clean.length : null, mode: run.mode, fuel: run.startFuel, deg: null, start: run.start, driver: d.name };
    if (clean.length >= 4) {
      // tyre degradation net of the fuel burn (each lap ~1 lap of fuel lighter)
      const n = clean.length; const xs = clean.map((_, i) => i); const ys = clean.map((t) => t.t);
      const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
      rec.deg = num / den + sim.fm.perLap;
    }
    (w.fpRuns[c.key] ||= []).push(rec);
    if (valid.length >= 6 && run.mode !== 'push' && ['soft', 'medium', 'hard'].includes(run.comp)) {
      const had = w.longRuns[run.comp];
      w.longRuns[run.comp] = true;
      w.lrData[run.comp] = rec;
      if (!had) App.toast('Long run completato', `Dati di degrado della ${COMPOUNDS[run.comp].name} misurati${rec.deg != null ? `: ${rec.deg >= 0 ? '+' : ''}${rec.deg.toFixed(3)} s/giro` : ''}. La strategia è più precisa.`, 'good');
    }
  } else if (best != null) {
    const pos = sim.position(c);
    const safe = sim.adv ? pos <= sim.adv : true;
    sim.log(`📻 ${first}: «${pos === 1 ? 'Sììì, siamo davanti a tutti!' : safe ? `P${pos}, ci siamo.` : `Solo P${pos}... siamo fuori se non miglioro!`}»`, 'radio', c.key, true);
  }
  P.sideSig = '';
}

function onSessionEnd(st, sim) {
  const w = st.weekend;
  if (sim.kind === 'practice') {
    w.fp = { done: true, rubber: sim.rubber, results: sim.results().map((r) => ({ ...r })) };
  } else {
    w.qs.parts[w.qs.idx] = { name: sim.name, results: sim.results().map((r) => ({ key: r.key, time: r.time })) };
    w.qs.rubber = sim.rubber;
  }
  saveGame();
  music.setMood?.('manage');
  sfx.win?.();
  showEndCard(st, sim);
}

function finishQualifying(st) {
  const w = st.weekend; const fmt = qualiFormat(st); const parts = w.qs.parts;
  const order = []; const times = {};
  for (let i = parts.length - 1; i >= 0; i--) {
    const res = parts[i].results.slice(i === parts.length - 1 ? 0 : fmt[i].adv);
    for (const r of res) if (!times[r.key] && !order.includes(r.key)) { order.push(r.key); times[r.key] = r.time; }
  }
  const q = { sessions: parts.map((p) => ({ name: p.name, results: p.results.filter((r) => r.time != null) })), grid: order, times, live: true };
  finalizeQualifying(st, buildEntries(st), q, w.qs.compNotes || [], w.qualiRain || 0, w.sets);
  w.quali = q; w.qualiAnim = false;
}

// ---------------- RENDER ----------------
export function sessionRender(st) {
  const w = st.weekend; const tr = getTrack(st.category, w.trackId);
  const fmt = qualiFormat(st);
  const name = w.phase === 'practice' ? 'Prove Libere' : fmt[w.qs?.idx ?? 0]?.name || 'Qualifica';
  const speeds = [1, 2, 4, 8, 16, 32, 64];
  return `<div class="race-screen ss-screen">
    <div class="race-top">
      <button class="btn ghost icon-btn" data-a="exit" aria-label="Esci" data-tip="Torna alla gestione">${icon('left')}</button>
      <button class="btn ghost icon-btn" data-a="ss-pause" id="ss-pause" data-tip="Pausa / riprendi (Spazio)">${icon('pause')}</button>
      <div class="rt-event">${flagSVG(tr.nat, 34, 22)}<div><div class="rt-name">${esc(tr.name)}</div><div class="rt-circ">${esc(tr.circuit)}</div></div></div>
      <div class="tb-stat ss-sname"><b>${esc(name)}</b><span>${w.phase === 'practice' ? 'Venerdì' : 'Sabato'}</span></div>
      <div class="tb-stat"><b id="ss-clock" class="ss-clock">--:--</b><span>Tempo rimasto</span></div>
      <div id="ss-flag"></div>
      <div class="tb-stat ss-hide-sm" id="ss-rubber"><b>—</b><span>Gommatura pista</span></div>
      <div class="tb-stat ss-hide-sm" id="ss-wx"><b>—</b><span>Meteo</span></div>
      <div class="grow"></div>
      <div class="speed-btns" id="ss-speeds">${speeds.map((v, i) => `<button class="btn sm" data-a="ss-speed" data-v="${v}" data-tip="${v === 1 ? 'Tempo reale' : `Velocità ${v}x`}${i < 7 ? ' · tasto ' + (i + 1) : ''}">${v === 1 ? '1x' : v + 'x'}</button>`).join('')}</div>
      <button class="btn sm" data-a="ss-simulate" data-tip="Simula il resto della sessione: l’ingegnere gestisce i tuoi piloti">${icon('ff')} ${w.phase === 'practice' ? 'Simula il resto' : 'Simula sessione'}</button>
      ${w.phase !== 'practice' && fmt.length > 1 ? `<button class="btn sm" data-a="ss-simq" data-tip="Simula tutte le fasi rimaste della qualifica e vai alla griglia">${icon('ff')} Simula qualifica</button>` : ''}
      <div class="race-prog"><i id="ss-progbar"></i></div>
    </div>
    <div class="race-board" id="ss-board"></div>
    <div class="race-view" id="race-view"><canvas id="race-cv"></canvas><div class="view-btns" id="ss-viewbtns"></div><div class="hud3d hidden" id="hud3d"></div><div class="race-sub" id="race-sub"></div><div class="ss-banner" id="ss-banner"></div><div id="finish-overlay"></div></div>
    <div class="race-side ss-side" id="ss-side"><div id="ss-cars"></div><div id="ss-panel"></div></div>
    <div class="race-feed"><div class="row gap4 mb8" id="feed-tabs"><div class="tab active">Cronaca della sessione</div><div class="grow"></div><span class="tiny muted" id="ss-feedinfo"></span></div><div id="ss-feed" style="height:calc(100% - 46px);overflow-y:auto"></div></div>
  </div>`;
}

export function sessionMount() {
  const st = S(); const w = st.weekend;
  sessionStop();
  const sim = ensureSim(st);
  const tr = sim.track;
  P.view = new TrackView(document.getElementById('race-cv'), circuitPath(tr.cid), { pad: 50, padTop: 40, glow: 'rgba(255,255,255,0.12)', sectors: true, drs: st.category === 'formula' || st.category === 'junior' ? drsZones('formula', tr) : [] });
  P.speed = getSettings().sessSpeed || 8;
  P.view3d = getSettings().view3d !== false && webglAvailable() ? (P.cam || 'auto') : null;
  renderViewBtns();
  if (P.view3d) enable3D(P.view3d);
  P.last = performance.now(); P.uiT = 1;
  music.setMood?.('race');
  engineStart(st.category);
  updateUI(true);
  updateSpeedUI();
  if (sim.finished) showEndCard(st, sim);
  const loop = (t) => {
    const dt = Math.min(0.1, (t - P.last) / 1000); P.last = t;
    if (!P.paused && !sim.finished) {
      let rem = dt * P.speed;
      while (rem > 0 && !sim.finished) { const d = Math.min(0.5, rem); sim.step(d); rem -= d; }
    }
    if (P.r3d) update3D(dt);
    draw();
    P.uiT += dt;
    if (P.uiT > 0.25) { P.uiT = 0; updateUI(); }
    if (sim.finished && !P.done) { P.done = true; updateUI(true); onSessionEnd(st, sim); }
    const fc = sim.car(P.focus);
    engineSet(P.paused || sim.finished || !fc || fc.state !== 'run' ? 0.05 : (P.focusSpeed != null ? P.focusSpeed / 345 : 0.6), { rain: sim.rain, crowd: 0.25 });
    P.raf = requestAnimationFrame(loop);
  };
  P.raf = requestAnimationFrame(loop);
  setTimeout(() => App.cur === 'weekend' && coach(sim.isQuali ? 'quali' : 'practice', sim.isQuali ? 'Qualifica dal vivo' : 'Prove libere dal vivo', sim.isQuali
    ? 'Scegli gomme e numero di tentativi, poi premi <b>Esci dal box</b> quando vuoi: la pista migliora verso la fine, ma tutti escono negli ultimi minuti e c’è <b>traffico</b>. Le ultime posizioni vengono eliminate.'
    : 'Scegli gomme, benzina e programma e premi <b>Esci dal box</b>. Dopo ogni run il pilota ti dà il <b>feedback sull’assetto</b>: modifica i parametri tra un run e l’altro. Un <b>long run</b> (6+ giri) misura il degrado delle gomme per la strategia.'), 1500);
}

export function sessionStop() {
  cancelAnimationFrame(P.raf); P.raf = 0;
  P.view?.destroy(); P.view = null;
  P.r3d?.destroy(); P.r3d = null;
  try { engineStop(); } catch {}
}
export function hasSession() { return !!P.sim && App.cur === 'weekend' && !!P.raf; }

// ---------------- VIEW (2D / 3D) ----------------
function renderViewBtns() {
  const el = document.getElementById('ss-viewbtns'); if (!el) return;
  const can3d = webglAvailable();
  el.innerHTML = [['2d', 'Mappa 2D'], ['auto', 'Regia'], ['tv', 'TV 3D'], ['chase', 'Camera car'], ['onboard', 'Onboard'], ...(['formula', 'junior'].includes(S().category) ? [['cockpit', 'Pilota']] : []), ['heli', 'Elicottero']].map(([k, n]) => `<button class="btn sm ${((P.view3d || '2d') === k) ? 'active' : ''}" data-a="${k === '2d' ? 'ss-view2d' : 'ss-cam'}" data-c="${k}" ${k !== '2d' && !can3d ? 'disabled' : ''}>${n}</button>`).join('');
}
function enable3D(cam) {
  const st = S(); const sim = P.sim;
  const rv = document.getElementById('race-view'); if (!rv) return;
  if (!P.r3d) {
    const div = document.createElement('div'); div.className = 'r3d'; rv.prepend(div);
    try {
      P.r3d = new Race3D(div, { cid: sim.track.cid, street: sim.track.street || 0, night: !!sim.track.night && sim.cat !== 'endurance', category: st.category,
        cars: sim.cars.map((c) => ({ key: c.key, livery: c.team.car.livery, helmet: sim.driver(c).helmet.c1, tyreColor: COMPOUNDS[c.tyre || 'medium'].color, isPlayer: c.isPlayer, number: sim.driver(c).number, sponsor: c.team.sponsors?.[0]?.name || c.team.short })) });
      P.r3d.setRain?.(sim.rain);
    } catch (e) { console.warn('3D non disponibile', e); div.remove(); P.r3d = null; P.view3d = null; renderViewBtns(); return; }
  }
  const r = P.r3d;
  r.director = cam === 'auto'; r.camMode = cam === 'auto' ? 'tv' : cam; r.dirT = 0; r.focusKey = P.focus; r._cut = true;
  rv.classList.add('mode3d');
  document.getElementById('hud3d')?.classList.remove('hidden');
  P.view?.resize();
}
function disable3D() {
  P.r3d?.destroy(); P.r3d = null; P.view3d = null;
  const rv = document.getElementById('race-view'); rv?.classList.remove('mode3d'); rv?.querySelector('.r3d')?.remove();
  document.getElementById('hud3d')?.classList.add('hidden');
  setTimeout(() => P.view?.resize(), 30);
}
function lapTimeOf(c, sim) { return c.lap ? c.lap.sec[0] + c.lap.sec[1] + c.lap.sec[2] : sim.track.lap; }
function update3D(dt) {
  const sim = P.sim, r = P.r3d; if (!r) return;
  const g = trackGeometry(sim.track.cid);
  const order = sim.order();
  const states = sim.cars.map((c) => {
    if (c.state === 'crashed') return { key: c.key, hidden: true };
    const inPit = c.state === 'garage';
    const d = inPit ? Math.round(c.dist) : c.dist;
    const frac = arcFrac(sim.cat, sim.track.cid, d, sim.track.lap);
    const speed = inPit ? 0 : speedAtTimeFrac(sim.cat, sim.track.cid, d, lapTimeOf(c, sim), sim.track.lap) / 3.6;
    const pos = order.indexOf(c) + 1;
    const show = c.isPlayer || c.key === P.focus;
    return { key: c.key, pos, s: frac * g.N, speed, inPit, close: false, tyreColor: COMPOUNDS[c.tyre || 'medium'].color, label: inPit ? '' : show ? `${shortName(sim.driver(c).name)}` : '' };
  });
  // keep the camera on a car that is actually running
  let fk = P.focus;
  const fcar = sim.car(fk);
  if (!fcar || fcar.state !== 'run') { const alt = sim.cars.find((c) => c.isPlayer && c.state === 'run') || sim.cars.find((c) => c.state === 'run' && c.lap?.type === 'timed') || sim.cars.find((c) => c.state === 'run'); if (alt) fk = alt.key; }
  r.focusKey = fk;
  r.setRain(sim.rain);
  r.update(states, dt);
  const fc = sim.car(r.director && r.dirFocus ? r.dirFocus : fk);
  const hud = document.getElementById('hud3d');
  if (hud && fc) {
    const s = states.find((x) => x.key === fc.key);
    const kmh = Math.round((s?.speed || 0) * 3.6);
    const gear = kmh < 5 ? 'N' : Math.min(8, 1 + Math.floor(kmh / 42));
    const lt = fc.lap?.type;
    hud.innerHTML = `<span class="tiny muted upper">${esc(sim.driver(fc).name)}</span><span class="chip ${lt === 'timed' ? 'good' : ''}">${lt === 'timed' ? 'Giro lanciato' : lt === 'out' ? 'Giro di uscita' : lt === 'in' ? 'Rientro' : lt === 'cool' ? 'Raffreddamento' : 'Box'}</span><span class="spd">${kmh}</span><span class="tiny muted">km/h</span><span style="font-size:22px;font-weight:900">${gear}</span>${fc.tyre ? tyreBadge(fc.tyre) : ''}`;
    P.focusSpeed = kmh;
  }
}
function draw() {
  const v = P.view; if (!v) return;
  const sim = P.sim;
  const style = sim.cat === 'endurance' ? 'endurance' : 'formula';
  const order = sim.order();
  v.frame(() => {
    let pitIdx = 0;
    const cars = sim.cars.filter((x) => x.state !== 'crashed').sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const car of cars) {
      const L = car.team.car.livery;
      const q = car.state === 'garage' && v.pitPos ? v.pitPos(pitIdx++) : v.pointAt(arcFrac(sim.cat, sim.track.cid, car.dist, sim.track.lap));
      const d = sim.driver(car);
      const pos = order.indexOf(car) + 1;
      const onT = car.state === 'run';
      v.drawCar(q.x, q.y, q.ang, L.primary, L.secondary, { style, glow: car.isPlayer && onT ? L.primary : null, outline: car.isPlayer, label: car.isPlayer && onT ? shortName(d.name) : null, num: P.r3d ? null : pos, dot: !(car.isPlayer && onT), labelBg: car.isPlayer ? L.primary : 'rgba(0,0,0,0.75)', len: car.state === 'garage' ? 8 : undefined });
    }
  }, { rain: sim.rain, night: sim.track.night && sim.cat !== 'endurance' ? 1 : 0 });
}

// ---------------- UI UPDATE ----------------
function updateUI(force) { updateTop(); updateBoard(); updateSide(force); updateFeed(force); updateBanner(); }

function updateTop() {
  const sim = P.sim;
  const el = document.getElementById('ss-clock'); if (el) { el.textContent = sim.chequered ? '0:00' : mmss(sim.remaining); el.classList.toggle('low', sim.remaining < 120 && !sim.chequered); }
  const pg = document.getElementById('ss-progbar'); if (pg) pg.style.width = `${Math.min(100, sim.clock / sim.duration * 100).toFixed(2)}%`;
  const fs = document.getElementById('ss-flag');
  if (fs) {
    const h = sim.red ? `<span class="flagplate red"><i></i>Bandiera rossa</span>` : sim.chequered ? '<span class="flagplate end"><i></i>Bandiera a scacchi</span>' : sim.yellow ? `<span class="flagplate yellow"><i></i>Gialla S${sim.yellow.k + 1}</span>` : '<span class="flagplate green"><i></i>Pista libera</span>';
    if (fs.innerHTML !== h) fs.innerHTML = h;
  }
  const rb = document.getElementById('ss-rubber'); if (rb) rb.innerHTML = `<b>${Math.round(sim.rubber * 100)}%</b><span>Gommatura pista</span>`;
  const wx = document.getElementById('ss-wx'); if (wx) { const r = sim.rain; wx.innerHTML = `<b class="${r > 0.2 ? 'info' : ''}">${r < 0.05 ? 'Asciutto' : r < 0.3 ? 'Umido' : r < 0.6 ? 'Bagnato' : 'Diluvio'} · ${Math.round(sim.trackTemp)}°C</b><span>Meteo · asfalto</span>`; }
}

function sectorBars(c) {
  const live = c.state === 'run' && c.lap?.type === 'timed';
  return [0, 1, 2].map((k) => {
    let cls = '';
    if (live) cls = c.secCls[k] ? c.secCls[k] : k === c.secIdx ? 'cur' : '';
    else if (c.lastLap && c.lastSec) cls = '';
    return `<i class="${cls}"></i>`;
  }).join('');
}
function statusTag(sim, c) {
  if (c.state === 'crashed') return '<span class="ss-tag bad">KO</span>';
  if (c.state === 'garage') return c.pending ? '<span class="ss-tag warn">MECC</span>' : '<span class="ss-tag">BOX</span>';
  const t = c.lap?.type;
  if (t === 'out') return '<span class="ss-tag info">OUT</span>';
  if (t === 'in') return '<span class="ss-tag">IN</span>';
  if (t === 'cool') return '<span class="ss-tag">LENTO</span>';
  return '';
}
function updateBoard() {
  const sim = P.sim; const st = S();
  const order = sim.order(); const best = order[0]?.best;
  const cut = sim.adv && sim.adv < order.length ? sim.adv : 0;
  const rows = order.map((c, i) => {
    const d = sim.driver(c);
    const live = c.state === 'run' && c.lap?.type === 'timed';
    const gap = c.best == null ? '' : i === 0 ? '' : `+${(c.best - best).toFixed(3)}`;
    const elim = cut && i >= cut;
    const tag = statusTag(sim, c);
    return `<div class="lb-row ss-row ${c.isPlayer ? 'me' : ''} ${elim ? 'elim' : ''} ${c.key === P.focus ? 'focus' : ''} ${c.state !== 'run' ? 'inbox' : ''} ${cut && i === cut ? 'cutline' : ''}" data-a="ss-focus" data-key="${c.key}">
      <span class="pos p${i + 1}">${i + 1}</span>${teamStripe(c.team)}
      <span class="nm" data-tip="${esc(d.name)}">${esc(d.name.split(' ').slice(1).join(' ') || d.name)}</span>
      <span>${c.tyre ? tyreBadge(c.tyre) : c.bestTyre ? tyreBadge(c.bestTyre) : ''}</span>
      <span class="ss-secs">${live ? sectorBars(c) : tag || sectorBars(c)}</span>
      <span class="ss-t ${c.best != null && sim.best?.key === c.key ? 't-purple' : ''}">${c.best != null ? fmtTime(c.best) : '<span class="muted">—</span>'}</span>
      <span class="gap">${gap}</span><span class="ss-laps">${c.totalLaps}</span></div>`;
  }).join('');
  const b = document.getElementById('ss-board');
  if (b && !(holding && b.matches(':hover'))) b.innerHTML = `<div class="lb-row lb-head ss-row"><span>Pos</span><span></span><span>Pilota</span><span></span><span data-tip="Settori del giro lanciato: viola = migliore assoluto, verde = record personale, giallo = più lento">Sett.</span><span class="ss-t">Tempo</span><span class="gap">Gap</span><span class="ss-laps">Giri</span></div>${rows}<div class="lb-foot muted">${sim.adv ? `<span class="ss-cutkey"></span>Zona eliminazione: dalla P${sim.adv + 1}` : ''}${sim.best ? `<span style="margin-left:auto"><i class="fl" style="display:inline-block;width:9px;height:9px;background:var(--purple)"></i> <b style="color:#fff">${esc(sim.driver(sim.car(sim.best.key)).name)}</b> <span class="lap-t">${fmtTime(sim.best.time)}</span></span>` : ''}</div>`;
}

function stateText(sim, c) {
  const w = S().weekend;
  if (c.state === 'crashed') return sim.isQuali ? '<span class="bad">Incidente: sessione finita</span>' : `<span class="bad">Incidente · riparazione ${mmss((c.repairAt ?? sim.clock) - sim.clock)}</span>`;
  if (c.state === 'garage') {
    if (c.pending) return `<span class="warn">Meccanici al lavoro · esce tra ${mmss(c.workUntil - sim.time)}</span>`;
    if (sim.time < c.workUntil) return `<span class="warn">Nel box · lavoro ${mmss(c.workUntil - sim.time)}</span>`;
    return 'Nel box';
  }
  const L = c.lap; const r = c.run;
  const timedIdx = r ? r.seq.slice(0, r.i + 1).filter((x) => x === 'timed').length : 0;
  const timedTot = r ? r.seq.filter((x) => x === 'timed').length : 0;
  if (L.type === 'out') return '<span class="info">Giro di uscita</span>';
  if (L.type === 'in') return 'Giro di rientro ai box';
  if (L.type === 'cool') return L.aborted ? 'Giro abortito · rientra' : 'Giro di raffreddamento';
  return `<span class="good">Giro lanciato ${timedIdx}/${timedTot}</span> · ${MODES[r.mode]}`;
}

function carCard(sim, c) {
  const d = sim.driver(c); const order = sim.order(); const pos = order.indexOf(c) + 1;
  const best = order[0]?.best;
  const live = c.state === 'run' && c.lap?.type === 'timed';
  const wear = sim.wear(c);
  const secs = [0, 1, 2].map((k) => {
    const v = live ? c.curSec[k] : c.lastSec?.[k];
    const cls = live ? (c.secCls[k] || (k === c.secIdx ? 'cur' : '')) : '';
    return `<div class="ss-sec ${cls}"><span>S${k + 1}</span><b>${v != null ? v.toFixed(3) : live && k === c.secIdx ? '···' : '—'}</b></div>`;
  }).join('');
  const elim = sim.adv && pos > sim.adv;
  const btns = c.state === 'run'
    ? `<div class="row gap4 mt8">${c.lap.type === 'timed' && sim.isQuali ? `<button class="btn sm danger grow" data-a="ss-abort" data-key="${c.key}">${icon('x')} Abortisci giro</button>` : ''}${!sim.isQuali && c.lap.type !== 'in' ? `<button class="btn sm ghost" data-a="ss-extend" data-key="${c.key}" data-d="-1" data-tip="Un giro lanciato in meno">−1 giro</button><button class="btn sm ghost" data-a="ss-extend" data-key="${c.key}" data-d="1" data-tip="Un giro lanciato in più">+1 giro</button>` : ''}${c.lap.type !== 'in' && !c.callIn ? `<button class="btn sm grow" data-a="ss-callin" data-key="${c.key}">${icon('pit')} Rientra ai box</button>` : c.callIn ? '<span class="chip warn grow" style="justify-content:center">Rientro confermato</span>' : ''}</div>`
    : c.pending ? `<button class="btn sm ghost mt8" style="width:100%" data-a="ss-cancel" data-key="${c.key}">Annulla uscita</button>` : '';
  return `<div class="ctrl-card ss-car ${P.sel === c.key ? 'sel' : ''}" style="border-top-color:${c.team.car.livery.primary}" data-a="ss-sel" data-key="${c.key}">
    <div class="row">${helmetSVG(d.helmet, 32)}<div class="grow" style="min-width:0"><b>${esc(d.name)}</b><div class="tiny muted">${stateText(sim, c)}</div></div><span class="pos ${elim ? 'bad' : ''}" style="font-size:26px">${c.best != null ? 'P' + pos : '—'}</span></div>
    <div class="ss-sec3 mt8">${secs}</div>
    <div class="timing"><div><span>Ultimo</span><b class="${c.lastCls === 'p' ? 't-purple' : c.lastCls === 'g' ? 't-green' : c.lastCls === 'x' ? 'bad' : c.lastLap ? 't-yellow' : ''}">${c.lastLap ? fmtTime(c.lastLap) : '—'}</b></div><div><span>Migliore</span><b class="${sim.best?.key === c.key ? 't-purple' : c.best ? 't-green' : ''}">${fmtTime(c.best)}</b></div><div><span>${sim.adv ? 'Taglio' : 'Distacco'}</span><b>${c.best == null ? '—' : sim.adv && order[sim.adv - 1]?.best != null && order[sim.adv]?.best != null ? (pos <= sim.adv ? '+' + Math.max(0, order[sim.adv].best - c.best).toFixed(3) : '−' + (c.best - order[sim.adv - 1].best).toFixed(3)) : pos === 1 ? 'Primo' : '+' + (c.best - best).toFixed(3)}</b></div></div>
    ${c.tyre ? `<div class="row mt8">${tyreBadge(c.tyre)}<div class="grow"><div class="row between tiny"><span>${COMPOUNDS[c.tyre].name} · ${(c.set?.age ?? 0).toFixed(1)} giri</span><span class="${wear > 0.75 ? 'bad' : ''}">${Math.max(0, Math.round((1 - wear) * 100))}%</span></div><div class="wear" style="height:5px"><i style="width:${Math.max(0, 1 - wear) * 100}%;background:${wear > 0.7 ? 'var(--bad)' : wear > 0.45 ? 'var(--warn)' : 'var(--good)'}"></i></div></div><span class="tiny muted" style="width:72px;text-align:right">${icon('fuel', 'ico', 'style="width:12px;vertical-align:-2px"')} ${c.state === 'run' ? c.fuel.toFixed(1) + ' giri' : '—'}</span></div>` : ''}
    ${btns}
  </div>`;
}

function tabState(sim, c) {
  if (c.state === 'crashed') return '<span class="bad">KO</span>';
  if (c.state === 'garage') return c.pending ? '<span class="warn">Meccanici</span>' : `Box${c.best ? ' · ' + fmtTime(c.best) : ''}`;
  const t = c.lap?.type;
  return t === 'timed' ? '<span class="good">Giro lanciato</span>' : t === 'out' ? '<span class="info">Uscita</span>' : t === 'in' ? 'Rientro' : 'Lento';
}
function runPanel(st, sim, c) {
  const r = c.run; if (!r) return '';
  const timed = r.seq.filter((x) => x === 'timed').length;
  const done = r.times.length;
  return `<div class="panel tight ss-prog"><div class="row between"><b class="ss-h">Run in corso</b><span class="tiny muted">uscito a ${mmss(sim.duration - r.start)}</span></div>
    <div class="row gap6 mt8 small">${tyreBadge(r.comp)}<span>${COMPOUNDS[r.comp].name} ${r.startAge > 0.5 ? `usate (${r.startAge.toFixed(1)} giri)` : 'nuove'}</span><span class="muted">·</span><span>${r.startFuel.toFixed(0)} giri di benzina</span></div>
    <div class="small mt8">${done}/${timed} giri lanciati · ritmo <b>${MODES[r.mode]}</b></div>
    ${r.times.length ? `<div class="ss-laplist mt8">${r.times.map((t, i) => `<span class="${!t.valid ? 'bad' : t.t === c.best ? 't-green' : ''}" data-tip="${t.valid ? '' : 'Giro cancellato'}">${i + 1}. ${fmtTime(t.t)}</span>`).join('')}</div>` : ''}
    <div class="tiny muted mt8">Il prossimo programma si prepara quando l’auto rientra al box.</div></div>`;
}
function defSpec(sim, c) {
  if (P.spec[c.key]) return P.spec[c.key];
  const wet = sim.wetComp();
  const q = sim.isQuali;
  return (P.spec[c.key] = { c: wet || (q ? 'soft' : 'medium'), setId: null, laps: q ? 1 : 4, mode: q ? 'push' : 'normal', pattern: 'single', fuel: q ? 3.4 : 8, driverIdx: c.driverIdx || 0 });
}

function progPanel(st, sim, c) {
  const w = st.weekend; const sp = defSpec(sim, c);
  const list = sim.setsOf(c.key);
  const fm = sim.fm; const ls = sim.ls;
  const comps = sim.C.compounds;
  const onTrack = c.state !== 'garage';
  const dis = onTrack || c.pending ? 'disabled' : '';
  const compBtn = (cp) => { const n = newSetsLeft(st, list, cp); const u = usedSets(list, cp).length; return `<button class="btn sm ss-comp ${sp.c === cp ? 'active' : ''}" data-a="ss-spec" data-key="${c.key}" data-f="c" data-v="${cp}" ${dis} data-tip="${COMPOUNDS[cp].name}: ${n === Infinity ? 'set disponibili' : `${n} set nuovi, ${u} usati`}">${tyreBadge(cp)}<span class="tiny">${n === Infinity ? '∞' : n}${u ? `<em>+${u}</em>` : ''}</span></button>`; };
  const used = usedSets(list, sp.c);
  const nNew = newSetsLeft(st, list, sp.c);
  if (sp.setId != null && !used.some((x) => x.id === sp.setId)) sp.setId = null;
  const setChips = `<button class="btn sm ${sp.setId == null ? 'active' : ''}" data-a="ss-spec" data-key="${c.key}" data-f="setId" data-v="" ${dis || (nNew <= 0 ? 'disabled' : '')}>Nuovo${nNew !== Infinity ? ` (${nNew})` : ''}</button>${used.slice(0, 4).map((x) => `<button class="btn sm ${sp.setId === x.id ? 'active' : ''}" data-a="ss-spec" data-key="${c.key}" data-f="setId" data-v="${x.id}" ${dis}>Usato · ${x.age.toFixed(1)} g</button>`).join('')}`;
  const fuelKg = sp.fuel * fm.kgPerLap;
  const fuelPen = sp.fuel * fm.perLap;
  const lapsNeed = (sim.isQuali ? (sp.pattern === 'double' ? 3 : 1.6) : sp.laps + 1.3);
  const est = sim.track.lap * 1.02;
  const runT = sim.isQuali ? est * (1.24 + 1.16 + (sp.pattern === 'double' ? 2.3 : 1)) + 10 : est * (1.13 + 1.16 + sp.laps) + 10;
  const presets = sim.isQuali ? '' : `<div class="ss-presets">${[['install', 'Installazione'], ['setup', 'Prova assetto'], ['qsim', 'Sim. qualifica'], ['long', 'Long run']].map(([k, n]) => `<button class="btn sm ghost" data-a="ss-preset" data-key="${c.key}" data-p="${k}" ${dis}>${n}</button>`).join('')}</div>`;
  const d = sim.driver(c);
  const goLabel = c.pending ? `Meccanici al lavoro… ${mmss(c.workUntil - sim.time)}` : onTrack ? 'In pista' : sim.chequered ? 'Sessione finita' : sim.red ? 'Pit lane chiusa' : 'Esci dal box';
  const changed = !sim.isQuali ? changedParams(w.cars[c.key]) : 0;
  const late = sim.isQuali && sim.remaining < est * 1.24 + 8;
  return `<div class="panel tight ss-prog">
    <div class="row between"><b class="ss-h">Programma · ${esc(d.name.split(' ').pop())}</b><span class="tiny muted">${sim.isQuali ? 'Parco chiuso' : 'Garage'}</span></div>
    ${presets}
    <div class="ss-lbl">Gomme <span class="muted">set nuovi rimasti</span></div>
    <div class="row gap4 wrap">${comps.map(compBtn).join('')}</div>
    <div class="row gap4 wrap mt8">${setChips}</div>
    ${!sim.isQuali ? `<div class="ss-lbl">Carburante</div>
    <div class="ss-step"><button class="btn sm" data-a="ss-spec" data-key="${c.key}" data-f="fuel" data-v="-1" ${dis}>−</button><div class="grow"><b>${sp.fuel.toFixed(0)} giri</b> <span class="muted">· ${fuelKg.toFixed(0)} kg · +${fuelPen.toFixed(2)} s/giro</span></div><button class="btn sm" data-a="ss-spec" data-key="${c.key}" data-f="fuel" data-v="1" ${dis}>+</button></div>
    ${sp.fuel < lapsNeed ? `<div class="tiny warn">Benzina scarsa per ${sp.laps} giri lanciati: il run verrà accorciato.</div>` : ''}
    <div class="ss-lbl">Giri lanciati e ritmo</div>
    <div class="ss-step"><button class="btn sm" data-a="ss-spec" data-key="${c.key}" data-f="laps" data-v="-1" ${dis}>−</button><div class="grow"><b>${sp.laps} ${sp.laps === 1 ? 'giro' : 'giri'}</b> <span class="muted">· ~${Math.round(runT / 60)} min${sp.laps >= 6 && sp.mode !== 'push' ? ' · <span class="good">long run</span>' : ''}</span></div><button class="btn sm" data-a="ss-spec" data-key="${c.key}" data-f="laps" data-v="1" ${dis}>+</button></div>` : `<div class="ss-lbl">Tentativi</div><div class="seg">${[['single', '1 giro lanciato'], ['double', '2 giri (con lento in mezzo)']].map(([k, n]) => `<div class="${sp.pattern === k ? 'on' : ''}" data-a="ss-spec" data-key="${c.key}" data-f="pattern" data-v="${k}">${n}</div>`).join('')}</div>`}
    <div class="seg mt8">${Object.entries(MODES).filter(([k]) => !sim.isQuali || k !== 'save').map(([k, n]) => `<div class="${sp.mode === k ? 'on ' + (k === 'push' ? 'push' : k === 'save' ? 'save' : '') : ''}" data-a="ss-spec" data-key="${c.key}" data-f="mode" data-v="${k}" data-tip="${k === 'push' ? 'Al limite: circa 0,15s più veloce, ma più errori e track limits' : k === 'save' ? 'Gestione: passo gara, consuma meno le gomme' : 'Spinta: giro veloce pulito'}">${n}</div>`).join('')}</div>
    ${c.driverIds.length > 1 ? `<div class="ss-lbl">Pilota al volante</div><div class="seg">${c.driverIds.map((id, i) => `<div class="${(sp.driverIdx || 0) === i ? 'on' : ''}" data-a="ss-spec" data-key="${c.key}" data-f="driverIdx" data-v="${i}">${esc(st.drivers[id].name.split(' ').pop())}</div>`).join('')}</div>` : ''}
    ${changed ? `<div class="tiny warn mt8">${icon('wrench', 'ico', 'style="width:12px;vertical-align:-2px"')} Assetto modificato (${changed} ${changed === 1 ? 'parametro' : 'parametri'}): i meccanici impiegano ${mmss(mechTime(changed))}.</div>` : ''}
    ${late ? '<div class="tiny bad mt8">Non c’è più tempo per un giro lanciato.</div>' : ''}
    <button class="btn primary lg mt8 ss-go ${!dis && !sim.chequered && !sim.red ? 'pulse-soft' : ''}" data-a="ss-go" data-key="${c.key}" ${dis || sim.chequered || sim.red || late ? 'disabled' : ''}>${icon('play')} ${goLabel}</button>
  </div>`;
}

function changedParams(wc) { if (!wc?.lastVals) return 0; return SETUP_PARAMS.filter((p) => Math.abs((wc.lastVals[p.id] ?? 50) - wc.vals[p.id]) >= 1).length; }
function mechTime(n) { return n ? 50 + n * 35 : 0; }

function setupPanel(st, sim, c) {
  const w = st.weekend; const wc = w.cars[c.key]; if (!wc) return '';
  const locked = sim.isQuali || c.state !== 'garage' || !!c.pending;
  const tr = sim.track;
  const sb = trackSetupBase(st, tr);
  const hint = sb ? `${sb.aero > 60 ? 'pista da <b>alto carico</b>' : sb.aero < 40 ? 'pista veloce: <b>ali scariche</b>' : 'carico <b>medio</b>'}, ${sb.gear > 55 ? '<b>rapporti lunghi</b>' : 'rapporti <b>corti</b>'}.` : '';
  const other = Object.keys(w.cars).find((k) => k !== c.key);
  return `<div class="row between"><span class="small muted">Fiducia assetto</span><b>${Math.round(wc.q * 100)}%</b></div>${bar(wc.q * 100, wc.q > 0.8 ? 'green' : wc.q > 0.55 ? 'gold' : 'red')}
    ${hint && !sim.isQuali ? `<div class="tiny muted mt8">${icon('info', 'ico', 'style="width:12px;vertical-align:-2px"')} Ingegnere: ${hint}</div>` : ''}
    ${locked ? `<div class="tiny ${sim.isQuali ? 'info' : 'warn'} mt8">${sim.isQuali ? 'Parco chiuso: l’assetto è bloccato fino alla gara.' : 'L’auto è in pista: modifiche possibili solo al box.'}</div>` : ''}
    <div class="ss-setup">${SETUP_PARAMS.map((p) => { const f = wc.fb?.[p.id]; return `<div class="ss-sl"><div class="row between"><span class="ss-pn" data-tip="${esc(p.info)}">${p.name}</span><span class="fb ${f || 'unk'}">${f ? fbTxt(f) : '—'}</span></div><div class="row gap6"><input type="range" min="0" max="100" value="${wc.vals[p.id]}" data-input="ss-slider" data-key="${c.key}" data-p="${p.id}" ${locked ? 'disabled' : ''}><b class="mono" id="ssv-${c.key.replace('#', '_')}-${p.id}" style="width:26px;text-align:right">${wc.vals[p.id]}</b></div>${f && f !== 'ok' ? `<div class="tiny warn">${f.endsWith('lo') ? p.lo : p.hi}</div>` : ''}</div>`; }).join('')}</div>
    ${!sim.isQuali ? `<div class="row gap4 mt8"><button class="btn sm ghost grow" data-a="ss-autosetup" data-key="${c.key}" ${locked ? 'disabled' : ''} data-tip="L’ingegnere propone un assetto (i meccanici impiegano qualche minuto)">${icon('wrench')} Ingegnere</button>${other ? `<button class="btn sm ghost grow" data-a="ss-copy" data-from="${other}" data-to="${c.key}" ${locked ? 'disabled' : ''}>${icon('swap')} Copia compagno</button>` : ''}</div>` : ''}
    ${biasCard(st, w, c.key, sim.isQuali)}`;
}

export function biasCard(st, w, key, locked = !!w.quali) {
  if (st.category === 'rally') return '';
  const b = w.bias?.[key] || 'balanced';
  return `<div class="card mt8"><div class="row between"><b class="small">${icon('wrench', 'ico', 'style="width:14px;vertical-align:-2px"')} Orientamento · parco chiuso</b><span class="tiny muted">${locked ? 'Bloccato' : 'Si blocca in qualifica'}</span></div>
    <div class="seg mt8">${Object.entries(SETUP_BIAS).map(([k, x]) => `<div class="${b === k ? 'on' : ''}" data-a="${locked ? '' : 'bias'}" data-key="${key}" data-v="${k}">${x.name}</div>`).join('')}</div>
    <div class="tiny muted mt8">${SETUP_BIAS[b].desc}.</div></div>`;
}
export function compCard(st, d) {
  if (!compEnabled(st)) return '';
  const cs = compStatus(st, d);
  const lp = licencePoints(d);
  const fitted = d.gridPen && d.gridPen.season === st.season && d.gridPen.round === st.round ? d.gridPen : null;
  return `<div class="card mt8"><div class="row between"><b class="small">${icon('car', 'ico', 'style="width:14px;vertical-align:-2px"')} Componenti power unit</b>${fitted ? `<span class="chip bad">Penalità griglia: ${fitted.places >= 15 ? 'fondo griglia' : '-' + fitted.places + ' posizioni'}</span>` : ''}</div>
    ${Object.values(cs).map((x) => `<div class="row mt8 small" style="gap:10px"><span style="width:86px">${x.name}</span><span class="mono ${x.over ? 'bad' : ''}" style="width:42px">${x.used}/${x.pool}</span><div class="grow">${bar(Math.min(100, x.wear * 100), x.destroyed || x.wear > 1 ? 'red' : x.wear > 0.75 ? 'gold' : 'green')}</div><span class="tiny mono" style="width:44px">${x.destroyed ? 'ROTTO' : Math.round(x.wear * 100) + '%'}</span><button class="btn sm ${x.destroyed ? 'primary' : 'ghost'}" data-a="fit-comp" data-id="${d.id}" data-t="${x.type}" ${x.wear < 0.05 ? 'disabled' : ''}>Nuovo${x.nextPenalty ? ` (−${x.nextPenalty})` : ''}</button></div>`).join('')}
    <div class="tiny muted mt8">Una PU usurata perde potenza e si rompe più facilmente. Oltre l’allocazione stagionale: 10 posizioni (prima PU extra), poi 5 per ogni elemento. Da 15 posizioni in su si parte in fondo.${lp ? ` · <span class="${lp >= 8 ? 'bad' : 'warn'}">Superlicenza: ${lp}/${BAN_POINTS} punti</span>` : ''}</div></div>`;
}

function dataPanel(st, sim, c) {
  const w = st.weekend;
  const runs = sim.isQuali ? c.runs.map((r) => ({ comp: r.comp, n: r.times.filter((t) => t.valid).length, best: Math.min(...r.times.filter((t) => t.valid).map((t) => t.t), Infinity), avg: null, deg: null, mode: r.mode })) : (w.fpRuns?.[c.key] || []);
  const lr = ['soft', 'medium', 'hard'].filter((x) => sim.C.compounds.includes(x));
  const we = Math.abs(wearError(st)); const known = Object.values(w.longRuns || {}).filter(Boolean).length;
  const fc = weatherForecast(st, w, sim.track);
  return `<div class="tiny upper muted mb8">Run completati</div>
    ${runs.length ? `<table class="tbl small ss-runs"><thead><tr><th></th><th></th><th>Giri</th><th>Migliore</th><th>Media</th><th data-tip="Degrado gomme al giro, al netto del carburante">Degr.</th></tr></thead><tbody>${runs.map((r, i) => `<tr><td class="mono muted">${i + 1}</td><td>${tyreBadge(r.comp)}</td><td class="nowrap">${r.n}g</td><td class="mono">${isFinite(r.best) && r.best ? fmtTime(r.best) : '—'}</td><td class="mono muted" data-tip="Media dei giri puliti">${r.avg ? '⌀ ' + fmtTime(r.avg) : ''}</td><td class="mono ${r.deg > 0.12 ? 'bad' : ''}">${r.deg != null ? (r.deg >= 0 ? '+' : '') + r.deg.toFixed(3) : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted">Nessun run ancora.</div>'}
    ${!sim.isQuali ? `<div class="tiny upper muted mt16 mb8">Long run · degrado misurato</div>
    <div class="ss-lr">${lr.map((cp) => { const d = w.lrData?.[cp]; return `<div class="${d ? 'ok' : ''}">${tyreBadge(cp)}<div><b>${d ? (d.deg != null ? (d.deg >= 0 ? '+' : '') + d.deg.toFixed(3) + ' s/g' : 'misurato') : 'non misurato'}</b><span>${d ? `${d.n} giri · media ${d.avg ? fmtTime(d.avg) : '—'}` : 'serve un run di 6+ giri'}</span></div></div>`; }).join('')}</div>
    <div class="tiny ${known ? 'good' : 'warn'} mt8">Degrado per la strategia: ${known >= 2 ? 'misurato, stima precisa' : known ? `misurato su ${known} mescola, errore residuo ±${Math.round(we * 100 + 2)}%` : `solo stimato, errore possibile ±${Math.round(Math.abs(S().weekend.wearErr ?? 0.1) * 100 + 4)}%`}</div>` : ''}
    <div class="tiny upper muted mt16 mb8">Previsioni per la gara</div>
    <div class="row small">${icon(fc.prob >= 50 ? 'rain' : 'sun', 'ico', 'style="width:26px;height:26px;flex:none;color:var(--warn)"')}<div><b>${esc(fc.summary)}</b><div class="tiny muted">Pioggia ${fc.prob}% · affidabilità ${fc.perfect ? 'radar preciso' : fc.acc + '%'}${w.qualiRain ? ' · <span class="info">qualifiche bagnate</span>' : ''}</div></div></div>`;
}

function updateSide(force) {
  const sim = P.sim; const st = S();
  const mine = sim.cars.filter((c) => c.isPlayer);
  const carsEl = document.getElementById('ss-cars'); const panel = document.getElementById('ss-panel');
  if (!carsEl || !panel) return;
  if (!mine.length) {
    const h = `<div class="panel tight"><b class="ss-h">I tuoi piloti sono stati eliminati</b><div class="small muted mt8">Segui la sessione o premi <b>Simula il resto</b>.</div></div>`;
    if (carsEl.innerHTML !== h) carsEl.innerHTML = h; panel.innerHTML = '';
    return;
  }
  if (!mine.some((c) => c.key === P.sel)) P.sel = mine[0].key;
  const busy = holding && document.getElementById('ss-side')?.matches(':hover');
  if (!busy || force) {
    const order = sim.order();
    const tabs = mine.length > 1 ? `<div class="ss-cartabs">${mine.map((x) => { const pos = order.indexOf(x) + 1; const elim = sim.adv && pos > sim.adv; return `<div class="${x.key === P.sel ? 'on' : ''}" data-a="ss-sel" data-key="${x.key}" style="--tc:${x.team.car.livery.primary}"><span class="ct-n">${esc(sim.driver(x).name.split(' ').pop())}</span><span class="ct-s"><b class="${elim ? 'bad' : ''}">P${pos}</b> ${tabState(sim, x)}</span></div>`; }).join('')}</div>` : '';
    const h = tabs + carCard(sim, sim.car(P.sel));
    if (carsEl.innerHTML !== h) carsEl.innerHTML = h;
  }
  const c = sim.car(P.sel);
  const sig = [P.sel, P.tab, c.state, c.run?.times.length ?? -1, !!c.pending, c.pending ? Math.ceil((c.workUntil - sim.time) / 5) : 0, sim.chequered, !!sim.red, JSON.stringify(P.spec[c.key] || {}), c.runs.length, sim.isQuali && sim.remaining < 140 ? Math.floor(sim.remaining / 10) : 0, JSON.stringify(st.weekend.cars[c.key]?.fb || {}), st.weekend.bias?.[c.key]].join('|');
  if (sig === P.sideSig && !force) return;
  if (document.activeElement?.matches?.('#ss-panel input[type=range]')) return;
  if (busy && !force) return;
  P.sideSig = sig;
  const tabs = [['setup', 'Assetto'], ['data', 'Dati'], ...(compEnabled(st) && !sim.isQuali ? [['comp', 'Componenti']] : [])];
  if (!tabs.some((t) => t[0] === P.tab)) P.tab = 'setup';
  const d = sim.driver(c);
  panel.innerHTML = `${c.state === 'run' ? runPanel(st, sim, c) : progPanel(st, sim, c)}
    <div class="panel tight mt8"><div class="tabs ss-tabs">${tabs.map(([k, n]) => `<div class="tab ${P.tab === k ? 'active' : ''}" data-a="ss-tab" data-t="${k}">${n}</div>`).join('')}</div>
    <div class="mt8">${P.tab === 'setup' ? setupPanel(st, sim, c) : P.tab === 'data' ? dataPanel(st, sim, c) : compCard(st, d)}</div></div>`;
}

function updateFeed(force) {
  const sim = P.sim; const evs = sim.events;
  const f = document.getElementById('ss-feed'); if (!f) return;
  if (evs.length === P.feedN && !force) return;
  for (const e of evs.slice(P.feedN)) {
    if (e.type === 'crash') sfx.crash?.();
    else if (e.type === 'red') sfx.notify?.();
    else if (e.type === 'fast' && e.important) sfx.overtake?.();
    if (e.type === 'radio' && e.key && sim.car(e.key)?.isPlayer) showSub(e);
  }
  P.feedN = evs.length;
  const mine = new Set(sim.cars.filter((c) => c.isPlayer).map((c) => c.key));
  f.innerHTML = evs.slice(-70).reverse().map((e) => `<div class="feed-item ${feedCls(e.type)} ${e.key && mine.has(e.key) ? 'player' : ''}"><span class="lap">${mmss(sim.duration - e.t)}</span><span>${esc(e.text)}</span></div>`).join('');
  const inf = document.getElementById('ss-feedinfo');
  if (inf) inf.textContent = `${sim.cars.filter((c) => c.state === 'run').length} auto in pista · ${sim.cars.reduce((a, c) => a + c.totalLaps, 0)} giri totali`;
}
const feedCls = (t) => ({ fast: 'ss-fast', red: 'crash', crash: 'crash', yellow: 'sc', green: 'finish', finish: 'finish', radio: 'radio', pit: 'pit', lap: 'info', warn: 'sc' }[t] || '');
function showSub(e) {
  const el = document.getElementById('race-sub'); if (!el) return;
  const now = performance.now();
  el.insertAdjacentHTML('afterbegin', `<div class="sub radio" data-t="${now}" style="--sc:var(--team)"><span class="sub-tag">RADIO</span>${esc(e.text.replace(/^(🎙|📻)\s*/u, ''))}</div>`);
  [...el.children].forEach((x, i) => { if (i > 1) { x.classList.add('out'); setTimeout(() => x.remove(), 400); } });
  setTimeout(() => { el.querySelectorAll('.sub').forEach((x) => { if (now - +x.dataset.t > 6500) { x.classList.add('out'); setTimeout(() => x.remove(), 400); } }); }, 7000);
}
function updateBanner() {
  const sim = P.sim; const el = document.getElementById('ss-banner'); if (!el) return;
  let h = '';
  if (sim.red) h = `<div class="ss-flagbar red">Bandiera rossa · sessione sospesa · ripresa tra ${mmss(sim.red.until - sim.time)}</div>`;
  else if (!sim.chequered && sim.remaining < 180 && sim.remaining > 0) h = `<div class="ss-flagbar last">Ultimi minuti · ${mmss(sim.remaining)}</div>`;
  if (el.innerHTML !== h) el.innerHTML = h;
}

function updateSpeedUI() {
  document.querySelectorAll('#ss-speeds .btn').forEach((b) => b.classList.toggle('active', +b.dataset.v === P.speed && !P.paused));
  const p = document.getElementById('ss-pause'); if (p) p.innerHTML = icon(P.paused ? 'play' : 'pause');
}

function showEndCard(st, sim) {
  const ov = document.getElementById('finish-overlay'); if (!ov) return;
  document.getElementById('race-sub')?.replaceChildren();
  const w = st.weekend; const fmt = qualiFormat(st);
  const order = sim.order();
  const best = order[0]?.best;
  const last = !sim.isQuali || w.qs.idx >= fmt.length - 1;
  const mine = order.filter((c) => c.isPlayer).map((c) => { const p = order.indexOf(c) + 1; const out = sim.adv && p > sim.adv; return `<div class="row between small"><span>${esc(sim.driver(c).name)}</span><b class="${out ? 'bad' : 'good'}">P${p}${c.best ? ' · ' + fmtTime(c.best) : ''}${out ? ' · eliminato' : sim.adv ? ' · passa' : ''}</b></div>`; }).join('');
  const elim = sim.adv ? order.slice(sim.adv) : [];
  const title = sim.isQuali ? `${sim.name} conclusa` : 'Prove libere concluse';
  const next = !sim.isQuali ? `${st.category === 'endurance' ? 'Hyperpole' : 'Qualifiche'}` : last ? 'Griglia e strategia' : `Avvia ${fmt[w.qs.idx + 1].name}`;
  ov.innerHTML = `<div class="ss-end"><div class="finish-card ss-endcard"><div class="tiny upper muted mt8">${esc(sim.name)} · bandiera a scacchi</div><div class="fc-t">${title}</div>
    <div class="mt16" style="color:var(--text2)">Il più veloce: <b style="color:#fff">${order[0] ? esc(sim.driver(order[0]).name) : '—'}</b> ${best ? `<span class="lap-t">${fmtTime(best)}</span>` : ''}</div>
    <div class="col gap4 mt16" style="text-align:left;min-width:340px">${mine}</div>
    ${elim.length ? `<div class="tiny upper muted mt16" style="text-align:left">Eliminati</div><div class="small muted" style="text-align:left">${elim.map((c) => esc(sim.driver(c).name)).join(' · ')}</div>` : ''}
    ${!sim.isQuali ? `<div class="small muted mt16" style="text-align:left">Pista gommata al ${Math.round(sim.rubber * 100)}%. ${Object.keys(w.longRuns || {}).length ? 'Degrado misurato per: ' + Object.keys(w.longRuns).map((x) => COMPOUNDS[x].name).join(', ') + '.' : 'Nessun long run: il degrado per la strategia è solo stimato.'}</div>` : ''}
    <button class="btn primary xl mt24" data-a="ss-next">${esc(next)} ${icon('right')}</button></div></div>`;
}

// ---------------- ACTIONS ----------------
// simulated practice: the engineer works on the setup of the player's cars
function engineerSetups(st, sim) {
  const w = st.weekend;
  for (const c of sim.cars) {
    const wc = w.cars[c.key]; if (!c.isPlayer || !wc) continue;
    const q = aiSetupQuality(st, playerTeam(st));
    if (wc.q >= q) continue;
    for (const p of SETUP_PARAMS) wc.vals[p.id] = Math.round(clamp(wc.ideal[p.id] + (wc.vals[p.id] - wc.ideal[p.id]) * (1 - q), 0, 100));
    wc.q = Math.max(wc.q, setupQuality(wc.vals, wc.ideal)); c.sq = wc.q; wc.lastVals = { ...wc.vals };
  }
}
function refreshSide() { P.sideSig = ''; updateSide(true); }
function applyPreset(sim, c, p) {
  const sp = defSpec(sim, c); const wet = sim.wetComp();
  const list = sim.setsOf(c.key);
  const usedOf = (cp) => usedSets(list, cp)[0]?.id ?? null;
  const hard = sim.C.compounds.includes('hard') ? 'hard' : 'medium';
  if (p === 'install') Object.assign(sp, { c: wet || 'medium', setId: usedOf(wet || 'medium'), laps: 1, mode: 'normal', fuel: 4 });
  if (p === 'setup') Object.assign(sp, { c: wet || 'medium', setId: usedOf(wet || 'medium'), laps: 4, mode: 'normal', fuel: 8 });
  if (p === 'qsim') Object.assign(sp, { c: wet || 'soft', setId: null, laps: 2, mode: 'push', fuel: 4 });
  if (p === 'long') Object.assign(sp, { c: wet || (newSetsLeft(S(), list, 'medium') > 1 ? 'medium' : hard), setId: null, laps: 10, mode: 'normal', fuel: 14 });
  if (newSetsLeft(S(), list, sp.c) <= 0 && sp.setId == null) sp.setId = usedOf(sp.c);
}
export const sessionActions = {
  'ss-pause'() { P.paused = !P.paused; P.last = performance.now(); updateSpeedUI(); },
  'ss-speed'(el) { P.speed = +el.dataset.v; P.paused = false; updateSpeedUI(); },
  'ss-focus'(el) { P.focus = el.dataset.key; if (P.r3d) { P.r3d.director = false; P.r3d.camMode = P.r3d.camMode === 'tv' ? 'chase' : P.r3d.camMode; P.r3d._cut = true; P.view3d = P.r3d.camMode; renderViewBtns(); } updateBoard(); },
  'ss-sel'(el) { P.sel = el.dataset.key; P.focus = el.dataset.key; refreshSide(); },
  'ss-tab'(el) { P.tab = el.dataset.t; refreshSide(); },
  'ss-cam'(el) { P.view3d = el.dataset.c; P.cam = P.view3d; enable3D(P.view3d); renderViewBtns(); },
  'ss-view2d'() { disable3D(); renderViewBtns(); },
  'ss-spec'(el) {
    const sim = P.sim; const c = sim.car(el.dataset.key); if (!c) return;
    const sp = defSpec(sim, c); const f = el.dataset.f; const v = el.dataset.v;
    if (f === 'c') { sp.c = v; sp.setId = null; if (newSetsLeft(S(), sim.setsOf(c.key), v) <= 0) sp.setId = usedSets(sim.setsOf(c.key), v)[0]?.id ?? null; }
    else if (f === 'setId') sp.setId = v === '' ? null : +v;
    else if (f === 'fuel') sp.fuel = clamp(sp.fuel + +v * (sp.fuel >= 20 ? 2 : 1), 2, Math.floor(sim.fm.tank));
    else if (f === 'laps') { sp.laps = clamp(sp.laps + +v, 1, 30); if (sp.fuel < sp.laps + 1.5) sp.fuel = Math.min(Math.floor(sim.fm.tank), Math.ceil(sp.laps + 2)); }
    else if (f === 'mode' || f === 'pattern') sp[f] = v;
    else if (f === 'driverIdx') sp.driverIdx = +v;
    refreshSide();
  },
  'ss-preset'(el) { const sim = P.sim; const c = sim.car(el.dataset.key); applyPreset(sim, c, el.dataset.p); refreshSide(); },
  'ss-go'(el) {
    const st = S(); const w = st.weekend; const sim = P.sim; const key = el.dataset.key; const c = sim.car(key); if (!c) return;
    const sp = { ...defSpec(sim, c) };
    if (sim.isQuali) sp.fuel = sp.pattern === 'double' ? 4.4 : 3.2, sp.laps = sp.pattern === 'double' ? 2 : 1;
    let delay = 0;
    const wc = w.cars[key];
    if (!sim.isQuali && wc) { const n = changedParams(wc); delay = mechTime(n) + (wc._autoWork || 0); wc._autoWork = 0; wc.q = setupQuality(wc.vals, wc.ideal); c.sq = wc.q; wc.lastVals = { ...wc.vals }; }
    if (sim.isQuali && newSetsLeft(st, sim.setsOf(key), sp.c) <= 0 && sp.setId == null && limitedComp(st, sp.c)) App.toast('Set nuovi finiti', `Nessun set nuovo di ${COMPOUNDS[sp.c].name}: esci con il meno usato.`, '');
    const err = delay > 0 ? sim.queueOut(key, sp, delay) : sim.sendOut(key, sp);
    if (err) { App.toast('Non si può uscire', err, 'bad'); return; }
    if (delay > 0) sim.log(`🔧 Meccanici al lavoro sull’auto di ${sim.driver(c).name} (${mmss(delay)}).`, 'pit', key, true);
    if (P.paused) { P.paused = false; updateSpeedUI(); }
    P.focus = key; if (P.r3d && !P.r3d.director) P.r3d._cut = true;
    sfx.ok?.(); refreshSide(); updateBoard();
  },
  'ss-cancel'(el) { const c = P.sim.car(el.dataset.key); if (c) { c.pending = null; c.workUntil = P.sim.time; const wc = S().weekend.cars[c.key]; } refreshSide(); },
  'ss-callin'(el) { P.sim.callIn(el.dataset.key); refreshSide(); },
  'ss-abort'(el) { P.sim.abortLap(el.dataset.key); sfx.radio?.(); refreshSide(); },
  'ss-extend'(el) { P.sim.extendRun(el.dataset.key, +el.dataset.d); refreshSide(); },
  'ss-slider'(el) {
    const w = S().weekend; const wc = w.cars[el.dataset.key]; if (!wc) return;
    wc.lastVals ??= { ...wc.vals };
    wc.vals[el.dataset.p] = +el.value;
    const lab = document.getElementById(`ssv-${el.dataset.key.replace('#', '_')}-${el.dataset.p}`); if (lab) lab.textContent = el.value;
  },
  'ss-autosetup'(el) {
    const st = S(); const wc = st.weekend.cars[el.dataset.key];
    wc.lastVals ??= { ...wc.vals };
    const q = aiSetupQuality(st, playerTeam(st));
    for (const p of SETUP_PARAMS) wc.vals[p.id] = Math.round(clamp(wc.ideal[p.id] + (wc.vals[p.id] - wc.ideal[p.id]) * (1 - q) + rand(-6, 6) * (1 - q), 0, 100));
    wc.fb = null; wc._autoWork = 120;
    App.toast('Assetto dell’ingegnere', 'Valori impostati: i meccanici li monteranno alla prossima uscita.', '');
    refreshSide();
  },
  'ss-copy'(el) { const w = S().weekend; const from = w.cars[el.dataset.from]; const to = w.cars[el.dataset.to]; to.lastVals ??= { ...to.vals }; to.vals = { ...from.vals }; to.fb = null; refreshSide(); },
  'ss-simulate'() {
    const sim = P.sim;
    App.confirm('Simulare il resto della sessione?', `L’ingegnere gestirà i tuoi piloti fino alla bandiera a scacchi${sim.isQuali ? ' (le fasi successive della qualifica restano giocabili)' : ''}.`, () => {
      if (!sim.isQuali) engineerSetups(S(), sim);
      for (const c of sim.cars) if (c.isPlayer) sim.autoPilot(c.key);
      sim.runToEnd();
      updateUI(true);
    });
  },
  'ss-simq'() {
    App.confirm('Simulare tutta la qualifica?', 'L’ingegnere gestisce i tuoi piloti in tutte le fasi rimaste. Vai direttamente alla griglia di partenza.', () => {
      const st = S(); const sim = P.sim;
      if (sim && !sim.finished) { for (const c of sim.cars) if (c.isPlayer) sim.autoPilot(c.key); }
      simulateQualifying(st);
      saveGame(); App.refresh();
    });
  },
  'ss-next'() {
    const st = S(); const w = st.weekend; const sim = P.sim;
    if (sim && !sim.finished) return;
    sessionStop(); P.sim = null; P.id = null;
    if (w.phase === 'practice') { w.phase = 'quali'; w.qs = null; }
    else {
      const fmt = qualiFormat(st);
      if (w.qs.idx < fmt.length - 1) w.qs.idx++;
      else finishQualifying(st);
    }
    saveGame();
    App.refresh();
  },
};
export function sessionKey(e) {
  if (!P.sim || !P.raf) return false;
  if (e.code === 'Space') { e.preventDefault(); sessionActions['ss-pause'](); return true; }
  const sp = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8, Digit5: 16, Digit6: 32, Digit7: 64 }[e.code];
  if (sp) { P.speed = sp; P.paused = false; updateSpeedUI(); return true; }
  return false;
}
// skip the live sessions entirely (quick race "solo gara" or simulated weekend)
export function simulateQualifying(st) {
  const w = st.weekend; const fmt = qualiFormat(st);
  const tr = getTrack(st.category, w.trackId);
  w.qs ??= { idx: 0, parts: [], rubber: clamp((w.fp?.rubber ?? 0.4) + 0.14, 0.55, 0.82) };
  if (!w.sets) w.sets = initSets(st);
  if (!w.qs.compDone) { const notes = prepareComponents(st, tr, buildEntries(st)); w.qs.compNotes = notes.map((n) => ({ driverId: n.d.id, type: n.type, pen: n.pen, forced: n.forced })); w.qs.compDone = true; }
  const setups = Object.fromEntries(Object.entries(w.cars).map(([k, c]) => [k, c.q]));
  for (let i = w.qs.idx; i < fmt.length; i++) {
    w.qs.idx = i;
    const prev = w.qs.parts[i - 1];
    const keys = prev ? prev.results.slice(0, fmt[i - 1].adv).map((r) => r.key) : null;
    const sim = (P.sim && P.id === sessionId(st)) ? P.sim : new SessionSim(st, tr, { kind: 'quali', name: fmt[i].name, duration: fmt[i].dur, adv: fmt[i].adv, keys, rain: w.qualiRain || 0, rubber: w.qs.rubber, setups, sets: w.sets, trackTemp: sessTemp(w, w.qualiRain, -2) });
    for (const c of sim.cars) if (c.isPlayer) sim.autoPilot(c.key);
    sim.runToEnd();
    w.qs.parts[i] = { name: sim.name, results: sim.results().map((r) => ({ key: r.key, time: r.time })) };
    w.qs.rubber = sim.rubber;
  }
  sessionStop(); P.sim = null; P.id = null;
  finishQualifying(st);
}
