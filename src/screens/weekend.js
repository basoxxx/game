// Circuit race weekend: Practice (setup) → Qualifying → Race → Results
import { App, registerScreen, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge, carSVG, trackSVG } from '../ui/art.js';
import { esc, bar, fmtTime, fmtGap } from '../ui/dom.js';
import { S, saveGame, getSettings } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, teamDrivers, applyRoundResults, standings, seatsPerTeam, aiFillSeats, addMail } from '../engine/season.js';
import { buildEntries, runQualifying, makeWeatherPlan, raceLaps, CircuitSim, aiSetupQuality } from '../engine/race.js';
import { COMPOUNDS } from '../data/categories.js';
import { circuitPath, arcFrac, speedAtTimeFrac, TrackView } from '../ui/trackview.js';
import { mulberry32, clamp, chance, rand } from '../engine/rng.js';
import { tyreBadge, teamStripe, driverChip } from './common.js';
import { sfx, engineStart, engineSet, engineStop, music } from '../ui/audio.js';
import { celebrate } from './results.js';
import { hasPerk } from '../engine/progress.js';
import { Race3D, webglAvailable } from '../ui/race3d.js';
import { trackGeometry, drsZones } from '../engine/trackphys.js';
import { planOptions, stintBar, degChartSVG, drawTelemetry, breakdownHTML, openLessons } from './engineer.js';

const SETUP_PARAMS = [
  { id: 'aero', info: 'Più ala = più grip in curva ma meno velocità sul dritto.', name: 'Carico Aerodinamico', lo: 'Poco carico: la macchina scivola in curva', hi: 'Troppo carico: lenti sul dritto' },
  { id: 'susp', info: 'Rigida = reattiva, morbida = sfrutta i cordoli.', name: 'Rigidezza Sospensioni', lo: 'Troppo morbida: rollio eccessivo', hi: 'Troppo rigida: salta sui cordoli' },
  { id: 'height', info: 'Bassa = più effetto suolo, ma rischio di toccare.', name: 'Altezza da Terra', lo: 'Troppo bassa: tocca il fondo', hi: 'Troppo alta: perdiamo carico' },
  { id: 'gear', info: 'Lunghi per i rettilinei, corti per la trazione.', name: 'Rapporti Cambio', lo: 'Rapporti corti: limitatore in rettilineo', hi: 'Rapporti lunghi: poca spinta in uscita' },
  { id: 'brake', info: 'Ripartizione della frenata tra anteriore e posteriore.', name: 'Bilanciamento Freni', lo: 'Troppo dietro: il posteriore si scompone', hi: 'Troppo avanti: blocca l’anteriore' },
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
  const weather = makeWeatherPlan(tr, laps, st.forceRain);
  const sim = t.facilities.simulator;
  st.weekend = {
    trackId: tr.id, phase: 'practice', laps, sprint: !!ev.sprint && !st.quick, sprintLaps: Math.max(5, Math.round(laps * 0.36)),
    weather: { plan: weather.plan, isRain: weather.isRain, summary: weather.summary, trackTemp: weather.trackTemp },
    qualiRain: chance(tr.rain * 0.7) ? rand(0.2, 0.8) : 0,
    cars: Object.fromEntries(entries.map((e) => [e.key, { runs: 4 + Math.floor(sim / 2) + (hasPerk(st, 'data') ? 1 : 0), vals: Object.fromEntries(SETUP_PARAMS.map((p) => [p.id, 50])), fb: null, q: 0.3, laps: [], ideal: idealFor(st, e.key, tr.seed) }])),
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
    if (w.phase === 'race') return raceScreen(st);
    const tr = getTrack(st.category, w.trackId);
    const steps = [['practice', 'Prove Libere'], ['quali', st.category === 'endurance' ? 'Hyperpole' : 'Qualifiche'], ...(w.sprint ? [['sprint', 'Sprint']] : []), ['race', 'Gara']];
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
  mount() {
    const w = S().weekend;
    if (w?.phase === 'race') { mountRace(); setTimeout(() => App.cur === 'weekend' && coach('race', 'Sei al muretto box', 'Clicca un pilota in classifica per seguirlo. Usa <b>Override</b> quando sei entro 1 secondo per sorpassare, gestisci le gomme con il <b>ritmo</b> e chiama i box al giro giusto. Rispondi alle <b>chiamate radio</b>!'), 7000); }
    else if (w?.phase === 'practice') coach('practice', 'Trova l’assetto', 'Sposta un parametro alla volta e premi <b>Giro di prova</b>: il pilota ti dice se è troppo alto o troppo basso. Più verde = più veloce. Oppure lascia fare all’ingegnere.');
    else if (w?.phase === 'quali' && w.quali) coach('strategy', 'Scegli la strategia', 'Il grafico mostra quanto rallenta ogni mescola. La linea tratteggiata indica il <b>cliff</b>: fermati prima! La strategia “OTTIMA” è calcolata per la tua auto.');
  },
  unmount() { stopRace(); },
  onKey(e) {
    if (!R.sim) return;
    if (e.code === 'Space') { e.preventDefault(); R.paused = !R.paused; updateSpeedUI(); }
    const sp = { Digit1: 2, Digit2: 4, Digit3: 8, Digit4: 16, Digit5: 32 }[e.code];
    if (sp) { R.speed = sp; R.paused = false; updateSpeedUI(); }
  },
  actions: {
    exit() { App.go(S().quick ? 'quickrace' : 'hub'); },
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
      const tol = 5 + (100 - eng) / 12 + (100 - d.attrs.exp) / 25 - (hasPerk(st, 'data') ? 2 : 0);
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
    'pick-plan'(el) { const st = S(); const w = st.weekend; const tr = getTrack(st.category, w.trackId); const team = playerTeam(st); const e = buildEntries(st).find((x) => x.key === el.dataset.key); const o = planOptions(st, tr, w.laps, team, st.drivers[e.driverIds[0]], w.weather.trackTemp)[+el.dataset.i]; w.plans[el.dataset.key] = o.stints; w.startTyre[el.dataset.key] = o.stints[0].c; App.refresh(); },
    lessons() { openLessons(); },
    cam(el) { R.view3d = el.dataset.c; R.cam = R.view3d; enable3D(R.view3d); renderViewBtns(); },
    view2d() { disable3D(); renderViewBtns(); },
    focus(el) { R.focus = el.dataset.key; updateBoard(); },
    'tele-tab'(el) { R.tab = el.dataset.t; updateFeed(true); },
    'tele-car'(el) { R.teleKey = el.dataset.key; updateFeed(true); },
    'to-race'() { const w = S().weekend; w.phase = 'race'; saveGame(); App.refresh(); },
    // race controls
    mode(el) { R.sim?.setMode(el.dataset.key, el.dataset.m); updateControls(true); },
    ers(el) { R.sim?.setErs(el.dataset.key, el.dataset.m); updateControls(true); },
    orders(el) { const st = S(); R.sim?.setOrders(st.playerTeam, el.dataset.o); updateControls(true); },
    radio(el) { R.sim?.answerRadio(+el.dataset.id, el.dataset.y === '1'); sfx.radio(); updateControls(true); },
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
      <div class="mt16">${SETUP_PARAMS.map((p) => { const f = c.fb?.[p.id]; return `<div class="setup-slider"><div><div style="font-weight:600;font-size:13.5px" title="${p.info}">${p.name}</div><div class="tiny ${f && f !== 'ok' ? 'warn' : 'dim'}">${f && f !== 'ok' ? (f.endsWith('lo') ? p.lo : p.hi) : p.info}</div></div><div class="row"><span class="tiny dim">MIN</span><input type="range" min="0" max="100" value="${c.vals[p.id]}" data-input="slider" data-key="${e.key}" data-p="${p.id}"><span class="tiny dim">MAX</span><b class="mono" id="v-${e.key}-${p.id}" style="width:28px;text-align:right">${c.vals[p.id]}</b></div><div class="fb ${f || 'unk'}">${f ? fbTxt(p, f) : 'Nessun dato'}</div></div>`; }).join('')}</div>
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
      <div class="panel" style="display:flex;align-items:center;justify-content:center">${trackSVG(circuitPath(tr.cid), { w: 480, h: 320, glow: 'var(--team)' })}</div>
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
        <div class="weather-strip mt16">${forecast(st, w).map((r) => `<i style="height:${Math.max(2, r * 20)}px;opacity:${r > 0.05 ? 0.9 : 0.15}"></i>`).join('')}</div>${hasPerk(st, 'meteo') ? '<div class="tiny good">Radar preciso (abilità Meteorologo)</div>' : '<div class="tiny muted">Previsione indicativa: sblocca “Meteorologo” per il radar preciso.</div>'}<div class="row between tiny muted"><span>Giro 1</span><span>Giro ${w.laps}</span></div>
      </div>
      ${strategyPanel(st, w, tr, entries, q, C)}
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
    <div class="race-view" id="race-view"><canvas id="race-cv"></canvas><div class="view-btns" id="view-btns"></div><div class="hud3d hidden" id="hud3d"></div><div id="finish-overlay"></div></div>
    <div class="race-side" id="side"></div>
    <div class="race-feed"><div class="row gap4 mb8" id="feed-tabs"></div><div id="feed" style="height:calc(100% - 34px);overflow-y:auto"></div></div>
  </div>`;
}

function mountRace() {
  const st = S(); const w = st.weekend;
  const tr = getTrack(st.category, w.trackId);
  const setups = Object.fromEntries(Object.entries(w.cars).map(([k, c]) => [k, c.q]));
  const isSprint = w.sprint && !w.sprintDone;
  R.sim = new CircuitSim(st, tr, { grid: isSprint || !w.sprintGrid ? w.quali.grid : w.quali.grid, setups, weather: { plan: w.weather.plan, isRain: w.weather.isRain, trackTemp: w.weather.trackTemp }, laps: isSprint ? w.sprintLaps : w.laps });
  R.sim.isSprint = isSprint;
  if (isSprint) R.sim.log('⚡ SPRINT: gara breve, punti ai primi 8 (8-7-6-5-4-3-2-1).', 'start', null, true);
  for (const c of R.sim.cars) if (c.isPlayer) { c.tyre = w.startTyre[c.key] || c.tyre; c.compoundsUsed = new Set([c.tyre]); c.plan = !isSprint && w.plans?.[c.key] ? w.plans[c.key].map((x) => ({ ...x })) : null; c.planIdx = 0; c.lapTarget = R.sim.computeLap(c); R.pitSel[c.key] = defaultPitTyre(c); }
  R.speed = getSettings().raceSpeed || 8; R.paused = true; R.feedN = 0; R.done = false; R.swap = {};
  R.view = new TrackView(document.getElementById('race-cv'), circuitPath(tr.cid), { pad: 50, glow: 'rgba(255,255,255,0.12)', sectors: true, drs: st.category === 'formula' ? drsZones('formula', tr) : [] });
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
    if (!R.paused && !R.sim.finished) {
      let rem = dt * R.speed;
      while (rem > 0) { const d = Math.min(0.5, rem); R.sim.step(d); rem -= d; }
    }
    if (R.r3d) update3D(dt); else draw();
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
function stopRace() { cancelAnimationFrame(R.raf); R.view?.destroy(); R.view = null; R.r3d?.destroy(); R.r3d = null; engineStop(); }

function renderViewBtns() {
  const el = document.getElementById('view-btns'); if (!el) return;
  const can3d = webglAvailable();
  el.innerHTML = [['2d', 'Mappa 2D'], ['auto', 'Regia'], ['tv', 'TV 3D'], ['chase', 'Camera car'], ['onboard', 'Onboard'], ['heli', 'Elicottero']].map(([k, n]) => `<button class="btn sm ${((R.view3d || '2d') === k) ? 'active' : ''}" data-a="${k === '2d' ? 'view2d' : 'cam'}" data-c="${k}" ${k !== '2d' && !can3d ? 'disabled' : ''}>${n}</button>`).join('');
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
    return { key: c.key, pos: c.pos, gap: c.status === 'running' && c.inPit <= 0 ? c.gapAhead : null, s: frac * g.N, speed, inPit: c.inPit > 0, close: c.gapAhead < 1, tyreColor: COMPOUNDS[c.tyre].color, label: show ? `P${c.pos} ${shortName(sim.driver(c).name)}` : `${c.pos}` };
  });
  for (const g of sim.traffic || []) states.push({ key: g.key, s: arcFrac(sim.cat, sim.track.cid, g.dist, sim.track.lap) * g2N(sim), speed: speedAtTimeFrac(sim.cat, sim.track.cid, g.dist, g.lt, sim.track.lap) / 3.6, label: '' });
  r.focusKey = R.focus;
  r.setRain(sim.rain);
  if (sim.endurance && sim.track.night) { R.nightLvl = (R.nightLvl ?? 0) + ((sim.night ? 1 : 0) - (R.nightLvl ?? 0)) * Math.min(1, dt * 0.3); r.setNight(Math.round(R.nightLvl * 20) / 20); }
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
}

function defaultPitTyre(c) {
  const comps = R.sim.C.compounds;
  if (c.plan && c.plan[c.planIdx + 1]) return c.plan[c.planIdx + 1].c;
  return c.tyre === 'medium' ? 'hard' : comps.includes('medium') ? 'medium' : comps[0];
}

function startLights(done) {
  const ov = document.getElementById('finish-overlay');
  let n = 0;
  ov.innerHTML = `<div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:rgba(0,0,0,.8);padding:14px 20px;border-radius:14px;border:1px solid var(--line2);z-index:3" id="lights">${[0, 1, 2, 3, 4].map((i) => `<div id="l${i}" style="width:34px;height:34px;border-radius:50%;background:#222;box-shadow:inset 0 0 8px #000"></div>`).join('')}</div>`;
  const iv = setInterval(() => {
    if (n < 5) { const l = document.getElementById(`l${n}`); if (l) { l.style.background = '#ff1a1a'; l.style.boxShadow = '0 0 20px #f00'; } sfx.beep(); n++; R.r3d?.setStartLights(n, false); }
    else { clearInterval(iv); setTimeout(() => { document.querySelectorAll('#lights > div').forEach((l) => { l.style.background = '#222'; l.style.boxShadow = 'none'; }); sfx.go(); R.r3d?.setStartLights(0, true); setTimeout(() => { const L = document.getElementById('lights'); if (L) L.remove(); }, 600); done(); }, 300 + Math.random() * 900); }
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
      v.drawCar(q.x, q.y, q.ang, L.primary, L.secondary, { style, glow: car.isPlayer ? L.primary : null, outline: car.isPlayer, label: car.isPlayer || car.pos <= 3 ? `${car.pos} ${shortName(d.name)}` : null, num: R.r3d ? null : car.pos, labelBg: car.isPlayer ? L.primary : 'rgba(0,0,0,0.75)' });
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
    return `<div class="lb-row ${c.isPlayer ? 'me' : ''} ${c.status === 'dnf' ? 'dnf' : ''} ${c.inPit > 0 ? 'pit' : ''} ${c.key === R.focus ? 'focus' : ''}" data-a="focus" data-key="${c.key}">
      <span class="pos p${i + 1}" style="font-size:14px">${i + 1}</span>${teamStripe(c.team)}
      <span class="nm">${esc(d.name)} ${posDelta > 0 ? `<span class="good tiny">▲${posDelta}</span>` : posDelta < 0 ? `<span class="bad tiny">▼${-posDelta}</span>` : ''}</span>
      <span>${c.status === 'dnf' ? '' : tyreBadge(c.tyre)}</span>
      <div>${c.status === 'dnf' ? `<span class="tiny bad">${esc(c.reason || '')}</span>` : c.inPit > 0 ? '<span class="chip warn tiny">BOX</span>' : `<div class="wear"><i style="width:${Math.max(0, 1 - c.wear) * 100}%;background:${c.wear > 0.8 ? 'var(--bad)' : c.wear > 0.55 ? 'var(--warn)' : 'var(--good)'}"></i></div>`}</div>
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
    const wearTxt = Math.max(0, Math.round((1 - c.wear) * 100));
    const advice = engineerAdvice(sim, c);
    const pitSel = R.pitSel[c.key];
    return `<div class="ctrl-card" style="border-top-color:${c.team.car.livery.primary}">
      <div class="row">${helmetSVG(d.helmet, 34)}<div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">${c.status === 'dnf' ? `<span class="bad">Ritirato: ${esc(c.reason)}</span>` : c.status === 'finished' ? 'Arrivato' : `P${i + 1} · Partito P${c.grid} · Soste ${c.pitStops}`}</div></div><span class="pos p${i + 1}" style="font-size:26px">P${i + 1}</span></div>
      ${c.status === 'running' ? `
      <div class="grid2 mt8 small" style="gap:6px"><div class="muted">Davanti <b style="color:#fff" class="mono">${gA != null && gA < 60 ? '-' + Math.max(0, gA).toFixed(1) + 's' : '—'}</b></div><div class="muted right">Dietro <b style="color:#fff" class="mono">${gB != null && gB < 60 ? '+' + Math.max(0, gB).toFixed(1) + 's' : '—'}</b></div></div>
      <div class="row mt8">${tyreBadge(c.tyre)}<div class="grow"><div class="row between tiny"><span>${COMPOUNDS[c.tyre].name} · ${c.stintLap} giri</span><span class="${tempCls(sim, c)}">${Math.round(c.temp)}°C</span><span class="${c.wear > 0.75 ? 'bad' : ''}">${wearTxt}%</span></div><div class="wear" style="height:6px"><i style="width:${wearTxt}%;background:${c.wear > 0.7 ? 'var(--bad)' : c.wear > 0.45 ? 'var(--warn)' : 'var(--good)'}"></i></div></div></div>
      ${sim.endurance ? `<div class="row mt8">${icon('fuel', 'ico', 'style="width:18px"')}<div class="grow"><div class="row between tiny"><span>Carburante</span><span class="${c.fuel < 1.5 ? 'bad' : ''}">${c.fuel.toFixed(1)} giri</span></div><div class="wear" style="height:6px"><i style="width:${(c.fuel / c.fuelMax) * 100}%;background:var(--info)"></i></div></div></div><div class="tiny muted mt8">Stint pilota: ${c.stintCount + 1}${c.stintCount >= 2 ? ' <span class="warn">(affaticato)</span>' : ''}</div>` : ''}
      ${c.damage > 0.05 ? `<div class="chip bad mt8">Danni: +${c.damage.toFixed(1)}s/giro</div>` : ''}
      <div class="tiny upper muted mt8 mb8">Ritmo</div>
      <div class="seg">${[['save', 'Gestione'], ['normal', 'Normale'], ['push', 'Attacco']].map(([k, n]) => `<div class="${c.mode === k ? 'on ' + k : ''}" data-a="mode" data-key="${c.key}" data-m="${k}">${n}</div>`).join('')}</div>
      <div class="row between tiny mt8"><span class="upper muted">${sim.endurance ? 'Ibrido' : 'Batteria ERS'}</span><span class="${c.ers < 20 ? 'bad' : ''}">${Math.round(c.ers)}%</span></div>
      <div class="wear" style="height:6px;margin:4px 0 6px"><i style="width:${c.ers}%;background:linear-gradient(90deg,#7c4dff,#00e5ff)"></i></div>
      <div class="seg">${[['harvest', 'Ricarica'], ['balanced', 'Bilanciato'], ['deploy', 'Override']].map(([k, n]) => `<div class="${c.ersMode === k ? 'on ' + (k === 'deploy' ? 'push' : k === 'harvest' ? 'save' : '') : ''}" data-a="ers" data-key="${c.key}" data-m="${k}">${n}</div>`).join('')}</div>
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
  const radio = sim.radioQ.map((r) => { const c = sim.cars.find((x) => x.key === r.key); return `<div class="ctrl-card pulse" style="border-top-color:var(--warn)"><div class="tiny upper warn">📻 Radio · ${esc(sim.driver(c).name)}</div><div class="small mt8" style="font-weight:600">${esc(r.text.replace(/^[^:]+: /, ''))}</div><div class="row gap6 mt8"><button class="btn sm good grow" data-a="radio" data-id="${r.id}" data-y="1">${{ pit: 'Box, box!', pass: 'Ok, scambio', push: 'Vai, attacca!', rain: 'Box per intermedie', ers: 'Sì, ricarica' }[r.type]}</button><button class="btn sm grow" data-a="radio" data-id="${r.id}" data-y="0">${{ pit: 'Resta fuori', pass: 'Negativo', push: 'Gestisci', rain: 'Resta fuori', ers: 'No' }[r.type]}</button></div><div class="wear mt8" style="height:3px"><i style="width:${Math.max(0, (r.until - sim.time) / 40) * 100}%;background:var(--warn)"></i></div></div>`; }).join('');
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
  if (Math.abs(c.temp - (sim.cat === 'formula' ? { soft: 95, medium: 103, hard: 111 }[c.tyre] || 80 : 100)) > 14 && !comp.wet) return { text: c.temp < 90 ? 'Gomme fredde: spingi un po’ per portarle in temperatura.' : 'Gomme surriscaldate: passa in Gestione per qualche giro.' };
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
    else if (e.type === 'radio') sfx.radio?.();
    if (e.type === 'sc' && !R.lessonSC) { R.lessonSC = true; App.toast('Lezione: safety car', 'Ai box si perde circa metà del tempo: spesso conviene fermarsi ora.', ''); }
  }
  const tab = R.tab || 'feed';
  const head = document.getElementById('feed-tabs');
  if (head) head.innerHTML = [['feed', 'Cronaca'], ['tele', 'Telemetria'], ['lap', 'Analisi giro']].map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="tele-tab" data-t="${k}" style="padding:4px 12px;font-size:11px">${n}</div>`).join('') + `<div class="grow"></div><button class="btn sm ghost" data-a="lessons" style="padding:3px 10px">${icon('info')} Lezioni</button>`;
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
  if (ov) ov.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:3"><div class="panel glow" style="text-align:center;padding:30px 40px;animation:pop .4s"><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:44px">🏁 ${R.sim.isSprint ? 'SPRINT FINITA' : 'GARA FINITA'}</div><div class="muted mt8">${esc(st.drivers[res.classification[0].driverIds[0]].name)} vince · Il tuo miglior risultato: ${best === 99 ? 'Ritiro' : 'P' + best}</div><button class="btn primary xl mt16" data-a="finish-race">Vai ai risultati ${icon('right')}</button></div></div>`;
}

function finishRace() {
  const st = S();
  const sim = R.sim;
  if (!sim.finished) sim.runToEnd();
  const res = sim.results();
  const w = st.weekend;
  if (sim.isSprint) {
    const SP = [8, 7, 6, 5, 4, 3, 2, 1];
    w.sprintRes = res.classification.map((r) => ({ key: r.key, teamId: r.teamId, driverIds: r.driverIds, pos: r.pos, status: r.status, pts: r.status === 'dnf' ? 0 : SP[r.pos - 1] || 0 }));
    w.sprintDone = true;
    stopRace(); R.sim = null;
    const win = st.drivers[w.sprintRes[0].driverIds[0]];
    const mine = w.sprintRes.filter((r) => r.teamId === st.playerTeam).map((r) => `${st.drivers[r.driverIds[0]].name}: ${r.status === 'dnf' ? 'RIT' : 'P' + r.pos}${r.pts ? ` (+${r.pts})` : ''}`).join(' · ');
    saveGame();
    App.refresh();
    App.modal(`<div class="tiny upper muted" style="letter-spacing:.3em">Sprint conclusa</div><h2>⚡ Vince ${esc(win.name)}</h2><p class="muted">${esc(mine)}</p><p class="small muted">Ora il Gran Premio: la griglia è quella delle qualifiche. Gomme e carburante tornano nuovi.</p><div class="row mt16" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Vai al Gran Premio</button></div>`);
    return;
  }
  if (w.sprintRes) res.sprint = w.sprintRes;
  res.pole = st.weekend.quali ? buildEntries(st).find((e) => e.key === st.weekend.quali.grid[0])?.driverIds[0] : null;
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

function strategyPanel(st, w, tr, entries, q, C) {
  const dry = w.weather.plan[0] <= 0.2 && C.id === 'formula';
  w.plans = w.plans || {};
  const team = playerTeam(st);
  let html = `<div class="panel"><div class="panel-head"><h3>Strategia</h3><button class="btn sm ghost" data-a="lessons">${icon('info')} Lezioni</button></div>`;
  if (dry) {
    const d0 = st.drivers[entries[0].driverIds[0]];
    html += `<div class="small muted mb8">Curve di degrado previste a ${esc(tr.circuit)} (asfalto ${w.weather.trackTemp}°C, usura tracciato ×${tr.wear}).</div>${degChartSVG(st, tr, w.laps, team, d0)}`;
    for (const e of entries) {
      const d = st.drivers[e.driverIds[0]];
      const opts = planOptions(st, tr, w.laps, team, d, w.weather.trackTemp);
      if (!w.plans[e.key]) { w.plans[e.key] = opts[0].stints; w.startTyre[e.key] = opts[0].stints[0].c; }
      const cur = w.plans[e.key].map((x) => x.c).join('-');
      html += `<div class="card mt8"><div class="row"><span class="pos">P${q.grid.indexOf(e.key) + 1}</span><b class="grow">${esc(d.name)}</b><span class="tiny muted">Piano scelto</span></div><div class="col gap4 mt8">${opts.map((o, i) => `<div class="row" style="gap:8px;cursor:pointer;padding:4px;border-radius:8px;${o.stints.map((x) => x.c).join('-') === cur ? 'background:color-mix(in srgb, var(--team) 18%, transparent);outline:1px solid var(--team)' : ''}" data-a="pick-plan" data-key="${e.key}" data-i="${i}"><span class="tiny mono" style="width:56px">${i === 0 ? '<b class="good">OTTIMA</b>' : '+' + (o.time - opts[0].time).toFixed(1) + 's'}</span><div class="grow">${stintBar(o.stints, w.laps)}</div><span class="tiny muted" style="width:44px">${o.stints.length - 1} ${o.stints.length === 2 ? 'sosta' : 'soste'}</span></div>`).join('')}</div></div>`;
    }
    html += `<div class="small muted mt8">L’ingegnere ti avviserà quando arriva il giro di sosta previsto. Puoi sempre cambiare idea in gara (safety car, pioggia, undercut…). Regola: almeno due mescole diverse.</div>`;
  } else {
    html += entries.map((e) => { const d = st.drivers[e.driverIds[0]]; const pos = q.grid.indexOf(e.key) + 1; const sel = w.startTyre[e.key] || (w.weather.plan[0] > 0.55 ? 'wet' : w.weather.plan[0] > 0.2 ? (C.compounds.includes('inter') ? 'inter' : 'wet') : 'medium'); w.startTyre[e.key] = sel; return `<div class="card mb8"><div class="row"><span class="pos">P${pos}</span><b class="grow">${esc(d.name)}</b></div><div class="row gap6 mt8 wrap">${C.compounds.map((cp) => `<button class="btn sm ${sel === cp ? 'active' : ''}" data-a="start-tyre" data-key="${e.key}" data-c="${cp}">${tyreBadge(cp)} ${COMPOUNDS[cp].name}</button>`).join('')}</div></div>`; }).join('');
    html += `<div class="small muted">${C.id === 'endurance' ? 'Endurance: uno stint dura circa 45 minuti di carburante. Le gomme possono fare doppio stint; alterna i piloti per evitare la fatica.' : 'Pioggia prevista: scegli le gomme in base all’intensità (intermedie per pioggia leggera, full wet per diluvio).'}</div>`;
  }
  return html + '</div>';
}

function tempCls(sim, c) {
  const win = { soft: 95, medium: 103, hard: 111, inter: 75, wet: 65 }[c.tyre] - (sim.endurance ? 3 : 0);
  const d = Math.abs(c.temp - win);
  return d < 7 ? 'good' : d < 14 ? 'warn' : 'bad';
}

function forecast(st, w) {
  const plan = w.weather.plan.slice(0, w.laps);
  if (hasPerk(st, 'meteo')) return plan;
  if (!w._fc) { const shift = Math.round((Math.random() - 0.5) * w.laps * 0.3); w._fc = plan.map((_, i) => { const r = plan[Math.min(plan.length - 1, Math.max(0, i + shift))] || 0; return Math.max(0, Math.min(1, r * (0.6 + Math.random() * 0.7))); }); }
  return w._fc;
}

function g2N(sim) { return trackGeometry(sim.track.cid).N; }
