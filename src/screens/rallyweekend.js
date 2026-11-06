// Rally event: Shakedown → stages (prep, run with live decisions) → service → results
import { App, registerScreen, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, trackSVG } from '../ui/art.js';
import { esc, bar, fmtLong, fmtGap } from '../ui/dom.js';
import { S, saveGame, getSettings } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { playerTeam, applyRoundResults, teamDrivers, seatsPerTeam, aiFillSeats } from '../engine/season.js';
import { RallyEvent, PACE_MODES, bestTyreFor, repairMinutes } from '../engine/rally.js';
import { buildEntries, aiSetupQuality } from '../engine/race.js';
import { RALLY_TYRES, SURFACES } from '../data/categories.js';
import { genStage, TrackView, STAGE_STYLE } from '../ui/trackview.js';
import { mulberry32, clamp, rand } from '../engine/rng.js';
import { tyreBadge, teamStripe, driverChip } from './common.js';
import { sfx, engineStart, engineSet, engineStop, music } from '../ui/audio.js';
import { celebrate } from './results.js';
import { shortName } from './weekend.js';
import { Race3D, webglAvailable, stageGeometry, stageSampleAt } from '../ui/race3d.js';

const RP = [
  { id: 'susp', name: 'Escursione Sospensioni', lo: 'Troppo rigida: rimbalza sulle buche', hi: 'Troppo morbida: imprecisa nei cambi di direzione' },
  { id: 'diff', name: 'Differenziali', lo: 'Troppo aperti: perde trazione', hi: 'Troppo bloccati: sottosterzo nei tornanti' },
  { id: 'height', name: 'Altezza da Terra', lo: 'Troppo bassa: picchia il fondo', hi: 'Troppo alta: rollio eccessivo' },
  { id: 'gear', name: 'Rapporti', lo: 'Corti: fuori giri sui veloci', hi: 'Lunghi: lenta in uscita' },
];
const X = { ev: null, view: null, raf: 0, speed: 16, paused: false, decision: null, decT: 0, uiT: 0, last: 0, choices: {}, repairs: {}, holding: false };
document.addEventListener('mousedown', () => { X.holding = true; });
document.addEventListener('mouseup', () => { setTimeout(() => { X.holding = false; }, 30); });

function quality(vals, ideal) { const m = RP.reduce((s, p) => s + Math.abs(vals[p.id] - ideal[p.id]), 0) / RP.length; return clamp(1 - (m / 40) ** 0.9, 0, 1); }

function init(st) {
  const ev = st.calendar[st.round];
  const tr = getTrack('rally', ev.trackId);
  const t = playerTeam(st);
  if (teamDrivers(st, t).length < seatsPerTeam(st)) aiFillSeats(st, t);
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  st.weekend = {
    trackId: tr.id, phase: 'shakedown',
    cars: Object.fromEntries(entries.map((e) => {
      const r = mulberry32(tr.seed * 13 + e.key.length * 7 + st.season);
      return [e.key, { runs: 3 + Math.floor(t.facilities.simulator / 2), vals: { susp: 50, diff: 50, height: 50, gear: 50 }, ideal: Object.fromEntries(RP.map((p) => [p.id, Math.round(15 + r() * 70)])), q: 0.3, fb: null, laps: [] }];
    })),
  };
}

registerScreen({
  id: 'rally', full: true,
  render() {
    const st = S();
    if (!st.weekend || !st.weekend.cars) init(st);
    const w = st.weekend;
    const ev = st.calendar[st.round];
    const tr = getTrack('rally', ev.trackId);
    if (w.phase !== 'shakedown' && !X.ev) { w.phase = 'prep'; startEvent(st); }
    if (w.phase === 'run') return runScreen(st, tr);
    const stagesStrip = ev.stages.map((s, i) => { const done = X.ev && i < X.ev.stageIdx; const cur = X.ev && i === X.ev.stageIdx; return `<div class="chip ${done ? 'good' : cur ? 'warn' : ''}" style="border-left:3px solid ${SURFACES[s.surface].color}">PS${i + 1}${s.power ? '⚡' : ''}</div>`; }).join('');
    return `<div style="position:fixed;inset:0;display:flex;flex-direction:column">
      <div class="race-top" style="height:64px">
        ${w.phase === 'shakedown' ? `<button class="btn ghost icon-btn" data-a="exit">${icon('left')}</button>` : ''}
        ${flagSVG(tr.nat, 34, 22)}<div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:22px;text-transform:uppercase;line-height:1">${esc(tr.name)}</div><div class="tiny muted upper">${ev.stages.length} prove speciali · ${ev.stages.reduce((a, b) => a + b.km, 0)} km cronometrati · Round ${st.round + 1}/${st.calendar.length}</div></div>
        <div class="grow"></div><div class="row gap4">${stagesStrip}</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px 30px">${w.phase === 'shakedown' ? shakedown(st, tr) : w.phase === 'prep' ? prep(st, tr) : w.phase === 'stageres' ? stageResults(st, tr) : w.phase === 'service' ? service(st) : w.phase === 'final' ? finalView(st) : ''}</div>
    </div>`;
  },
  mount() { const ph = S().weekend?.phase; if (ph === 'run') { mountRun(); coach('rallyrun', 'Prova speciale in corso', 'Quando il copilota ti chiama, hai pochi secondi per decidere (tasti <b>A</b>/<b>B</b>). Rischiare fa guadagnare tempo ma può costare il rally!'); } else if (ph === 'prep') coach('rallyprep', 'Gomme e ritmo', 'Scegli le gomme adatte alla superficie e al meteo. Sulle prove lunghe le morbide si consumano. Il ritmo Attacco è più veloce ma molto più rischioso.'); },
  unmount() { stopRun(); },
  onKey(e) {
    if (S().weekend?.phase !== 'run') return;
    if (e.code === 'Space') { e.preventDefault(); X.paused = !X.paused; speedUI(); }
    const sp = { Digit1: 1, Digit2: 4, Digit3: 8, Digit4: 16, Digit5: 32, Digit6: 64 }[e.code]; if (sp) { X.speed = sp; X.paused = false; speedUI(); }
    if (X.decision && (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')) decide('a');
    if (X.decision && (e.key === 'b' || e.key === 'B' || e.key === 'ArrowRight')) decide('b');
  },
  actions: {
    exit() { App.go(S().quick ? (S().challenge ? 'challenges' : 'quickrace') : 'hub'); },
    slider(el) { const c = S().weekend.cars[el.dataset.key]; c.vals[el.dataset.p] = +el.value; const l = document.getElementById(`rv-${el.dataset.key}-${el.dataset.p}`); if (l) l.textContent = el.value; },
    run(el) {
      const st = S(); const c = st.weekend.cars[el.dataset.key]; if (c.runs <= 0) return;
      const t = playerTeam(st); const eng = st.staff[t.staff.engineer]?.rating || 65;
      c.runs--; c.q = quality(c.vals, c.ideal);
      const tol = 5 + (100 - eng) / 12;
      c.fb = Object.fromEntries(RP.map((p) => { const d = c.vals[p.id] - c.ideal[p.id] + rand(-tol * 0.4, tol * 0.4); const a = Math.abs(d); return [p.id, a < tol ? 'ok' : a < tol * 2.6 ? (d > 0 ? 'hi' : 'lo') : (d > 0 ? 'vhi' : 'vlo')]; }));
      c.laps.push(180 - c.q * 4 + rand(-1, 1)); sfx.ok(); App.refresh();
    },
    autosetup(el) { const st = S(); const c = st.weekend.cars[el.dataset.key]; const q = aiSetupQuality(st, playerTeam(st)); for (const p of RP) c.vals[p.id] = Math.round(c.ideal[p.id] + (c.vals[p.id] - c.ideal[p.id]) * (1 - q)); c.q = quality(c.vals, c.ideal); c.runs = Math.max(0, c.runs - 2); App.refresh(); },
    'start-rally'() { const st = S(); st.weekend.phase = 'prep'; startEvent(st); saveGame(); App.refresh(); },
    tyre(el) { X.choices[el.dataset.key].tyre = el.dataset.t; App.refresh(); },
    pace(el) { X.choices[el.dataset.key].pace = el.dataset.p; App.refresh(); },
    'go-stage'() { const st = S(); X.ev.planStage(X.choices); st.weekend.phase = 'run'; App.refresh(); },
    speed(el) { X.speed = +el.dataset.v; X.paused = false; speedUI(); },
    pause() { X.paused = !X.paused; speedUI(); },
    decide(el) { decide(el.dataset.c); },
    rcam(el) { X.view3d = el.dataset.c; X.cam = X.view3d; rallyEnable3D(X.view3d); rallyViewBtns(); },
    rview2d() { rallyDisable3D(); rallyViewBtns(); },
    rfocus(el) { X.focus = el.dataset.key; X.userFocus = true; },
    'stage-done'() { afterStage(); },
    'skip-stage'() { skipStage(); },
    repair(el) { const k = el.dataset.key, comp = el.dataset.c; const arr = X.repairs[k] ||= []; const i = arr.indexOf(comp); if (i >= 0) arr.splice(i, 1); else arr.push(comp); App.refresh(); },
    'repair-all'(el) { const c = X.ev.crews.find((x) => x.key === el.dataset.key); X.repairs[c.key] = Object.keys(c.damage).filter((k) => c.damage[k] > 0.02); App.refresh(); },
    'end-service'() { const notes = X.ev.service(X.repairs); X.repairs = {}; notes.forEach((n) => App.toast('Assistenza', n, 'bad')); S().weekend.phase = X.ev.finished() ? 'final' : 'prep'; prepChoices(); App.refresh(); },
    'next'() { const st = S(); const w = st.weekend; if (X.ev.finished()) w.phase = 'final'; else if (X.ev.isServiceAfter(X.ev.stageIdx - 1)) w.phase = 'service'; else { w.phase = 'prep'; prepChoices(); } App.refresh(); },
    'finish-rally'() {
      const st = S(); const res = X.ev.results(); res.track = st.weekend.trackId;
      const idx = st.round; X.ev = null;
      applyRoundResults(st, res); saveGame(); App.go('results', { idx });
    },
    'sim-rest'() {
      App.confirm('Simulare il resto del rally?', 'Le scelte verranno fatte automaticamente con ritmo equilibrato.', () => {
        const ev = X.ev;
        while (!ev.finished()) {
          ev.planStage({});
          let g = 0; while (!ev.allDone() && g++ < 1e5) { const r = ev.advance(2); if (r) ev.resolveDecision(r, 'b'); }
          ev.completeStage();
          if (ev.isServiceAfter(ev.stageIdx - 1)) ev.service(Object.fromEntries(ev.crews.filter((c) => c.isPlayer).map((c) => [c.key, Object.keys(c.damage)])));
        }
        S().weekend.phase = 'final'; App.refresh();
      });
    },
  },
});

function startEvent(st) {
  const ev = st.calendar[st.round];
  const tr = getTrack('rally', ev.trackId);
  const setups = Object.fromEntries(Object.entries(st.weekend.cars).map(([k, c]) => [k, c.q]));
  X.ev = new RallyEvent(st, ev, tr, setups);
  prepChoices();
}
function prepChoices() {
  const ev = X.ev; if (!ev || ev.finished()) return;
  const stg = ev.stage;
  for (const c of ev.crews.filter((x) => x.isPlayer)) X.choices[c.key] = { tyre: X.choices[c.key]?.tyre && RALLY_TYRES[X.choices[c.key].tyre].surf === bestTyreFor(stg, stg.wet).split('_')[0] ? X.choices[c.key].tyre : bestTyreFor(stg, stg.wet), pace: X.choices[c.key]?.pace || 'normal' };
}

function shakedown(st, tr) {
  const w = st.weekend;
  const entries = buildEntries(st).filter((e) => e.isPlayer);
  const ev = st.calendar[st.round];
  const fbTxt = (f) => f === 'ok' ? 'Perfetto' : f === 'hi' ? 'Un po’ alto' : f === 'lo' ? 'Un po’ basso' : f === 'vhi' ? 'Troppo alto' : 'Troppo basso';
  const surf = [...new Set(ev.stages.map((s) => s.surface))];
  return `<div class="row between mb16"><div><h2>Shakedown · Assetto</h2><div class="small muted">Prova l’assetto nella prova shakedown. Superfici del rally: ${surf.map((s) => `<b>${SURFACES[s].name}</b>`).join(', ')}.</div></div><button class="btn primary lg" data-a="start-rally">${icon('flag')} Inizia il Rally</button></div>
  <div class="grid2 anim-in">${entries.map((e) => {
    const c = w.cars[e.key]; const d = st.drivers[e.driverIds[0]];
    return `<div class="panel"><div class="row" style="gap:12px">${helmetSVG(d.helmet, 48)}<div class="grow"><div class="tiny upper muted">Equipaggio #${d.number}</div><h3 style="font-size:19px">${esc(d.name)}</h3></div><div style="width:220px"><div class="row between small"><span class="muted">Fiducia assetto</span><b>${Math.round(c.q * 100)}%</b></div>${bar(c.q * 100, c.q > 0.8 ? 'green' : c.q > 0.55 ? 'gold' : 'red')}</div></div>
      <div class="mt16">${RP.map((p) => { const f = c.fb?.[p.id]; return `<div class="setup-slider"><div><div style="font-weight:600;font-size:13.5px">${p.name}</div>${f && f !== 'ok' ? `<div class="tiny muted">${f.endsWith('lo') ? p.lo : p.hi}</div>` : ''}</div><div class="row"><input type="range" min="0" max="100" value="${c.vals[p.id]}" data-input="slider" data-key="${e.key}" data-p="${p.id}"><b class="mono" id="rv-${e.key}-${p.id}" style="width:28px;text-align:right">${c.vals[p.id]}</b></div><div class="fb ${f || 'unk'}">${f ? fbTxt(f) : 'Nessun dato'}</div></div>`; }).join('')}</div>
      <div class="row mt16 between"><div class="row gap6"><button class="btn primary" data-a="run" data-key="${e.key}" ${c.runs <= 0 ? 'disabled' : ''}>${icon('play')} Passaggio shakedown (${c.runs})</button><button class="btn sm ghost" data-a="autosetup" data-key="${e.key}" ${c.runs < 2 ? 'disabled' : ''}>${icon('wrench')} Ingegnere</button></div><div class="small muted">${c.laps.length ? `Ultimo: <b class="mono" style="color:#fff">${fmtLong(c.laps[c.laps.length - 1])}</b>` : ''}</div></div></div>`;
  }).join('')}</div>`;
}

function overallTable(st, limit = 14) {
  const ov = X.ev.overall(); const lead = ov[0];
  return `<table class="tbl small"><tbody>${ov.slice(0, limit).map((c, i) => { const d = X.ev.driver(c); return `<tr class="${c.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${c.status === 'out' ? 'RIT' : i + 1}</td><td>${teamStripe(c.team)}</td><td>${driverChip(st, d, { size: 22 })}</td><td class="right mono">${c.status === 'out' ? '<span class="bad">Ritirato</span>' : lead.total === 0 ? '<span class="dim">—</span>' : i === 0 ? fmtLong(c.total) : fmtGap(c.total - lead.total)}</td>${c.superRally ? '<td><span class="chip warn tiny">SR</span></td>' : '<td></td>'}</tr>`; }).join('')}</tbody></table>`;
}

function prep(st, tr) {
  const ev = X.ev; const stg = ev.stage;
  const path = genStage(tr.seed + stg.idx * 101, STAGE_STYLE[tr.id]);
  const mine = ev.crews.filter((c) => c.isPlayer);
  const tyres = Object.entries(RALLY_TYRES);
  return `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px" class="anim-in">
    <div class="col gap16">
      <div class="panel glow"><div class="row between"><div><div class="tiny upper muted">Prova speciale ${stg.idx + 1} di ${ev.stages.length}${stg.power ? ' · <span class="warn">POWER STAGE (punti bonus)</span>' : ''}</div><h2 style="font-size:30px;font-style:italic">${esc(stg.name)}</h2></div>
        <div class="row"><span class="chip" style="border-color:${SURFACES[stg.surface].color}">${SURFACES[stg.surface].name}</span><span class="chip">${stg.km} km</span><span class="chip">${{ fast: 'Veloce e scorrevole', twisty: 'Tornanti di montagna', rough: 'Tecnica' }[STAGE_STYLE[tr.id] || 'rough']}</span><span class="chip ${stg.wet ? 'info' : ''}">${icon(stg.wet ? 'rain' : 'sun', 'ico', 'style="width:13px"')} ${stg.wet ? 'Bagnato' : stg.surface === 'snow' ? 'Neve/Ghiaccio' : 'Asciutto'}</span></div></div>
        <div class="mt16" style="display:flex;justify-content:center">${trackSVG(path, { w: 640, h: 220, glow: SURFACES[stg.surface].color, color: '#e9edf3', width: 4 })}</div>
      </div>
      ${mine.map((c) => { const d = ev.driver(c); const ch = X.choices[c.key]; const dmg = Object.entries(c.damage).filter(([, v]) => v > 0.02); return `<div class="panel"><div class="row">${helmetSVG(d.helmet, 40)}<div class="grow"><b>${esc(d.name)}</b><div class="small muted">${c.status === 'out' ? '<span class="bad">Ritirato</span>' : c.retiredLeg ? '<span class="warn">Fuori fino all’assistenza (Super Rally)</span>' : `${ev.overall().indexOf(c) + 1}° assoluto`}</div></div>${dmg.length ? `<span class="chip bad">Danni: ${dmg.map(([k]) => ({ engine: 'motore', suspension: 'sospensioni', gearbox: 'cambio', body: 'carrozzeria' }[k])).join(', ')}</span>` : '<span class="chip good">Auto integra</span>'}</div>
        ${c.status === 'out' || c.retiredLeg ? '' : `<div class="tiny upper muted mt16 mb8">Gomme</div><div class="row wrap gap6">${tyres.map(([k, t]) => `<button class="btn sm ${ch.tyre === k ? 'active' : ''}" data-a="tyre" data-key="${c.key}" data-t="${k}">${tyreBadge(k)} ${t.name}</button>`).join('')}</div>
        <div class="tiny upper muted mt16 mb8">Ritmo</div><div class="seg">${Object.entries(PACE_MODES).map(([k, p]) => `<div class="${ch.pace === k ? 'on ' + (k === 'push' ? 'push' : k === 'safe' ? 'save' : '') : ''}" data-a="pace" data-key="${c.key}" data-p="${k}">${p.name}</div>`).join('')}</div>
        <div class="tiny muted mt8">Consiglio del copilota: ${RALLY_TYRES[bestTyreFor(stg, stg.wet)].name}${stg.km > 18 ? ' (prova lunga: occhio all’usura)' : ''}</div>`}</div>`; }).join('')}
      <div class="row between"><button class="btn ghost" data-a="sim-rest">${icon('ff')} Simula il resto</button><button class="btn primary xl pulse" data-a="go-stage">${icon('flag')} Via alla prova!</button></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Classifica assoluta</h3></div>${overallTable(st)}</div>
  </div>`;
}

function runScreen(st, tr) {
  const stg = X.ev.stage;
  return `<div class="rally-screen">
    <div class="race-top">
      <button class="btn ghost icon-btn" data-a="pause" id="btn-pause">${icon('pause')}</button>
      ${flagSVG(tr.nat, 30, 20)}<div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:19px;text-transform:uppercase;line-height:1">PS${stg.idx + 1} · ${esc(stg.name)}</div><div class="tiny muted upper">${SURFACES[stg.surface].name} · ${stg.km} km${stg.wet ? ' · Bagnato' : ''}${stg.power ? ' · Power Stage' : ''}</div></div>
      <div class="tb-stat"><b id="stagetime">0:00</b><span>Tempo prova</span></div>
      <div class="grow"></div>
      <div class="speed-btns" id="speedbtns">${[1, 4, 8, 16, 32, 64].map((v) => `<button class="btn sm" data-a="speed" data-v="${v}">${v === 1 ? '1x LIVE' : v + 'x'}</button>`).join('')}</div>
      <button class="btn sm ghost" data-a="skip-stage">${icon('ff')} Fine prova</button>
    </div>
    <div class="race-board" id="board"></div>
    <div class="race-view" id="race-view"><canvas id="rally-cv"></canvas><div class="view-btns" id="view-btns"></div><div class="hud3d hidden" id="hud3d"></div><div id="decision"></div></div>
    <div class="race-side" id="side"></div>
    <div class="race-feed" id="feed"></div>
  </div>`;
}

function mountRun() {
  const st = S(); const tr = getTrack('rally', st.weekend.trackId); const stg = X.ev.stage;
  X.view = new TrackView(document.getElementById('rally-cv'), genStage(tr.seed + stg.idx * 101, STAGE_STYLE[tr.id]), { pad: 50, rally: true, surface: stg.surface, glow: SURFACES[stg.surface].color + '55' });
  X.geo = stageGeometry(tr.seed + stg.idx * 101, stg.km, STAGE_STYLE[tr.id]);
  X.focus = X.ev.crews.find((c) => c.isPlayer && c.plan)?.key || X.ev.crews.find((c) => c.isPlayer)?.key;
  X.view3d = getSettings().view3d !== false && webglAvailable() ? (X.cam || 'chase') : null;
  rallyViewBtns();
  if (X.view3d) rallyEnable3D(X.view3d);
  X.t = 0; X.paused = false; X.userFocus = false; X.decision = null; X.last = performance.now(); X.speed = Math.max(8, Math.min(64, (getSettings().raceSpeed || 8) * 2)); X.finished = false;
  music.setMood('race');
  engineStart('rally');
  const loop = (t) => {
    const dt = Math.min(0.1, (t - X.last) / 1000); X.last = t;
    if (!X.paused && !X.decision && !X.finished) {
      let rem = dt * X.speed;
      while (rem > 0 && !X.decision) { const d = Math.min(1, rem); const req = X.ev.advance(d); X.t += d; rem -= d; if (req) { openDecision(req); break; } }
      if (X.ev.allDone()) { X.finished = true; engineStop(); sfx.notify(); renderUI(true); }
    }
    if (X.decision) { X.decT -= dt; const bar = document.getElementById('dectimer'); if (bar) bar.style.width = `${Math.max(0, X.decT / 9) * 100}%`; if (X.decT <= 0) decide('b'); }
    if (X.r3d) rallyUpdate3D(dt);
    drawRally();
    engineSet(X.paused || X.decision || X.finished ? 0 : X.r3d && X.focusSpeed != null ? X.focusSpeed / 200 : 0.5 + Math.sin(t / 700) * 0.3, { rain: X.ev.stage.wet ? 0.7 : 0, crowd: 0.2 });
    X.uiT += dt; if (X.uiT > 0.25) { X.uiT = 0; renderUI(); }
    X.raf = requestAnimationFrame(loop);
  };
  renderUI(true); speedUI();
  X.raf = requestAnimationFrame(loop);
}
function stopRun() { cancelAnimationFrame(X.raf); X.view?.destroy(); X.view = null; X.r3d?.destroy(); X.r3d = null; engineStop(); }
function rallyViewBtns() {
  const el = document.getElementById('view-btns'); if (!el) return;
  el.innerHTML = [['2d', 'Mappa 2D'], ['chase', 'Camera car'], ['onboard', 'Onboard'], ['tv', 'TV'], ['heli', 'Elicottero']].map(([k, n]) => `<button class="btn sm ${((X.view3d || '2d') === k) ? 'active' : ''}" data-a="${k === '2d' ? 'rview2d' : 'rcam'}" data-c="${k}" ${k !== '2d' && !webglAvailable() ? 'disabled' : ''}>${n}</button>`).join('');
}
function rallyEnable3D(cam) {
  const st = S(); const stg = X.ev.stage; const rv = document.getElementById('race-view');
  if (!X.r3d) {
    const div = document.createElement('div'); div.className = 'r3d'; rv.prepend(div);
    try {
      X.r3d = new Race3D(div, { geo: X.geo, category: 'rally', surface: stg.surface, wet: stg.wet, cars: X.ev.crews.map((c) => ({ key: c.key, livery: c.team.car.livery, helmet: X.ev.driver(c).helmet.c1, tyreColor: '#888', isPlayer: c.isPlayer, number: X.ev.driver(c).number, sponsor: c.team.sponsors?.[0]?.name || c.team.short })) });
    } catch (e) { console.warn(e); div.remove(); X.view3d = null; rallyViewBtns(); return; }
  }
  X.r3d.camMode = cam; X.r3d._cut = true; rv.classList.add('mode3d');
  document.getElementById('hud3d')?.classList.remove('hidden');
  X.view?.resize();
}
function rallyDisable3D() { X.r3d?.destroy(); X.r3d = null; X.view3d = null; const rv = document.getElementById('race-view'); rv?.classList.remove('mode3d'); rv?.querySelector('.r3d')?.remove(); document.getElementById('hud3d')?.classList.add('hidden'); setTimeout(() => X.view?.resize(), 30); }
function rallyUpdate3D(dt) {
  const r = X.r3d; if (!r) return; const geo = X.geo;
  const states = X.ev.crews.map((c) => {
    if (!c.plan && c.stageResult == null) return { key: c.key, hidden: true };
    const i = stageSampleAt(geo, c.progress || 0);
    const pc = c.pieces?.[c.pieceIdx];
    const moving = !c.done && pc && pc.type === 'move';
    const speed = moving ? geo.profile.v[Math.floor(i)] * (geo.profile.lap / (c.plan?.base || geo.profile.lap)) : 0;
    return { key: c.key, s: i, speed, label: c.isPlayer || c.key === X.focus ? shortName(X.ev.driver(c).name) : '' };
  });
  // follow a car that is actually on the stage: prefer the player's, else the closest running one
  const onStage = (c) => c.plan && !c.done && !c.waiting;
  const fcur = X.ev.crews.find((c) => c.key === X.focus);
  const mineNow = X.ev.crews.find((c) => c.isPlayer && onStage(c));
  if (!X.userFocus && mineNow && fcur && !fcur.isPlayer) X.focus = mineNow.key;
  if (!X.userFocus && (!fcur || !onStage(fcur))) {
    const mine = X.ev.crews.find((c) => c.isPlayer && onStage(c));
    const any = X.ev.crews.filter(onStage).sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];
    if (mine || any) X.focus = (mine || any).key;
  }
  r.focusKey = X.focus; r.setRain(X.ev.stage.wet ? 0.6 : 0); r.update(states, dt);
  const fc = X.ev.crews.find((c) => c.key === X.focus); const hud = document.getElementById('hud3d');
  if (hud && fc) { const stt = states.find((x) => x.key === fc.key); const kmh = Math.round((stt?.speed || 0) * 3.6); X.focusSpeed = kmh; hud.innerHTML = `<span class="tiny muted upper">${esc(X.ev.driver(fc).name)}</span><span class="spd">${kmh}</span><span class="tiny muted">km/h</span><span class="tiny muted">${((fc.progress || 0) * X.ev.stage.km).toFixed(1)} / ${X.ev.stage.km} km</span>`; }
}

function drawRally() {
  const v = X.view; if (!v) return;
  v.frame(() => {
    const crews = X.ev.crews.filter((c) => c.plan || c.stageResult != null).sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const c of crews) {
      if (c.status === 'out' && !c.plan) continue;
      const q = v.pointAt(stageSampleAt(X.geo, c.progress || 0) / X.geo.N);
      const L = c.team.car.livery; const d = X.ev.driver(c);
      v.drawCar(q.x, q.y, q.ang, L.primary, L.secondary, { style: 'rally', len: 16, glow: c.isPlayer ? L.primary : null, outline: c.isPlayer, label: c.isPlayer ? shortName(d.name) : null, labelBg: L.primary });
    }
  }, { rain: X.ev.stage.wet ? 0.6 : 0 });
}

function liveBoard(st) {
  const ev = X.ev;
  const crews = ev.crews.filter((c) => c.status !== 'out' || c.plan);
  // sort by: finished time asc, then by progress-time estimate
  const est = (c) => c.stageResult != null ? c.stageResult : c.done ? 1e9 : c.progress > 0.02 ? c.stageT / c.progress : 1e8 + (1 - c.progress);
  const list = crews.slice().sort((a, b) => est(a) - est(b));
  const best = Math.min(...crews.filter((c) => c.stageResult != null).map((c) => c.stageResult));
  return `<div class="lb-row" style="color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase;grid-template-columns:30px 6px 1fr 70px 80px"><span>Pos</span><span></span><span>Equipaggio</span><span>Stato</span><span class="right">Tempo</span></div>` + list.map((c, i) => {
    const d = ev.driver(c);
    const st2 = c.stageResult != null ? `<span class="good tiny">Arrivato</span>` : c.done ? '<span class="bad tiny">Fermo</span>' : !c.plan ? '<span class="dim tiny">—</span>' : c.waiting ? '<span class="tiny muted">In partenza</span>' : `<div class="wear"><i style="width:${c.progress * 100}%;background:var(--info)"></i></div>`;
    const time = c.stageResult != null ? (c.stageResult === best ? fmtLong(c.stageResult) : fmtGap(c.stageResult - best)) : c.splitTimes?.[0.66] ? `S2 ${fmtLong(c.splitTimes[0.66])}` : c.splitTimes?.[0.33] ? `S1 ${fmtLong(c.splitTimes[0.33])}` : c.plan ? fmtLong(c.stageT) : '';
    return `<div class="lb-row ${c.isPlayer ? 'me' : ''} ${c.key === X.focus ? 'focus' : ''}" data-a="rfocus" data-key="${c.key}" style="grid-template-columns:30px 6px 1fr 70px 80px"><span class="pos p${i + 1}" style="font-size:14px">${i + 1}</span>${teamStripe(c.team)}<span class="nm">${esc(d.name)}</span><div>${st2}</div><span class="gap">${time}</span></div>`;
  }).join('');
}

function renderUI(force) {
  const st = S(); const ev = X.ev;
  const tt = document.getElementById('stagetime'); if (tt) tt.textContent = fmtLong(X.t);
  const b = document.getElementById('board'); if (b) b.innerHTML = liveBoard(st);
  const f = document.getElementById('feed'); if (f) f.innerHTML = ev.log.filter((l) => l.stage === ev.stageIdx).slice(0, 40).map((l) => `<div class="feed-item ${l.kind === 'crash' || l.kind === 'terminal' || l.kind === 'out' ? 'crash' : l.kind === 'good' ? 'finish' : ''} ${l.player ? 'player' : ''}"><span>${esc(l.text)}</span></div>`).join('');
  if (X.holding && !force) return;
  const side = document.getElementById('side');
  if (side) side.innerHTML = ev.crews.filter((c) => c.isPlayer).map((c) => {
    const d = ev.driver(c); const ch = c.choice || {};
    const dmg = Object.entries(c.damage).filter(([, v]) => v > 0.02);
    return `<div class="ctrl-card" style="border-top-color:${c.team.car.livery.primary}"><div class="row">${helmetSVG(d.helmet, 34)}<div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">${ch.tyre ? RALLY_TYRES[ch.tyre].name : ''} · ${ch.pace ? PACE_MODES[ch.pace].name : ''}</div></div></div>
      ${c.plan ? `<div class="mt8">${bar((c.progress || 0) * 100, 'blue')}</div><div class="row between tiny mt8"><span>${Math.round((c.progress || 0) * 100)}% · ${(stageKm() * (c.progress || 0)).toFixed(1)} km</span><span class="mono">${fmtLong(c.stageT)}</span></div>` : `<div class="small warn mt8">Non in prova</div>`}
      ${c.stageResult != null ? `<div class="chip good mt8">Arrivato: ${fmtLong(c.stageResult)}</div>` : ''}
      ${dmg.length ? `<div class="row wrap gap4 mt8">${dmg.map(([k, v]) => `<span class="chip bad tiny">${({ engine: 'Motore', suspension: 'Sospensioni', gearbox: 'Cambio', body: 'Carrozzeria' })[k]} ${Math.round(v * 100)}%</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('') + `<div class="panel tight"><div class="tiny upper muted mb8">Assoluta (prima della prova)</div>${overallTable(st, 8)}</div>` + (X.finished ? `<button class="btn primary xl pulse" data-a="stage-done">${icon('chequered')} Tempi della prova</button>` : '');
}
function stageKm() { return X.ev.stage.km; }

function openDecision(crew) {
  const dec = crew.plan.decision; const d = X.ev.driver(crew);
  X.decision = { crew }; X.decT = 9;
  sfx.notify();
  const el = document.getElementById('decision');
  if (el) el.innerHTML = `<div class="decision"><div class="row">${icon('alert', 'ico', 'style="width:26px;height:26px;color:var(--warn)"')}<div><div class="tiny upper warn" style="letter-spacing:.2em">Decisione live · ${esc(d.name)}</div><div style="font-size:17px;font-weight:700;margin-top:4px">${esc(dec.t.text)}</div></div></div>
    <div class="opts"><div class="opt" data-a="decide" data-c="a"><b>${esc(dec.t.a.label)}</b> <span class="kbd">A</span><div class="small muted mt8">${esc(dec.t.a.desc)}</div></div><div class="opt" data-a="decide" data-c="b"><b>${esc(dec.t.b.label)}</b> <span class="kbd">B</span><div class="small muted mt8">${esc(dec.t.b.desc)}</div></div></div>
    <div class="timer" id="dectimer" style="width:100%"></div></div>`;
}
function decide(choice) {
  if (!X.decision) return;
  const r = X.ev.resolveDecision(X.decision.crew, choice);
  X.decision = null;
  const el = document.getElementById('decision'); if (el) el.innerHTML = '';
  App.toast(r.good ? 'Ottima scelta!' : 'Problemi!', r.text, r.good ? 'good' : 'bad');
  if (r.good) sfx.ok(); else sfx.bad();
}

function skipStage() {
  let g = 0;
  while (!X.ev.allDone() && g++ < 1e5) { const r = X.ev.advance(2); if (r) X.ev.resolveDecision(r, 'b'); }
  X.decision = null; const el = document.getElementById('decision'); if (el) el.innerHTML = '';
  X.finished = true; renderUI(true);
}

function afterStage() {
  const st = S();
  stopRun();
  X.lastStage = X.ev.completeStage();
  st.weekend.phase = 'stageres';
  App.refresh();
}

function stageResults(st) {
  const ev = X.ev; const s = ev.stages[ev.stageIdx - 1];
  const ranking = s.results || [];
  const best = ranking[0]?.time;
  const crews = Object.fromEntries(ev.crews.map((c) => [c.key, c]));
  const mineBest = ranking.findIndex((r) => crews[r.key].isPlayer);
  if (mineBest === 0) setTimeout(() => celebrate(80), 100);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="anim-in">
    <div class="panel"><div class="panel-head"><h3>PS${s.idx + 1} ${esc(s.name)} · Tempi</h3>${s.power ? '<span class="chip warn">Power Stage</span>' : ''}</div>
      <table class="tbl small"><tbody>${ranking.map((r, i) => { const c = crews[r.key]; return `<tr class="${c.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${teamStripe(c.team)}</td><td>${driverChip(st, ev.driver(c), { size: 22 })}</td><td class="right mono">${i === 0 ? fmtLong(r.time) : fmtGap(r.time - best)}</td>${s.power && i < 5 ? `<td class="warn">+${5 - i}</td>` : '<td></td>'}</tr>`; }).join('')}</tbody></table></div>
    <div class="col gap16"><div class="panel"><div class="panel-head"><h3>Classifica assoluta</h3></div>${overallTable(st)}</div>
    <button class="btn primary xl" data-a="next">${ev.finished() ? 'Classifica finale' : ev.isServiceAfter(ev.stageIdx - 1) ? 'Parco assistenza' : 'Prossima prova'} ${icon('right')}</button></div>
  </div>`;
}

function service(st) {
  const ev = X.ev; const t = playerTeam(st);
  const mech = st.staff[t.staff.mechanic]?.rating || 65;
  const mine = ev.crews.filter((c) => c.isPlayer && c.status !== 'out');
  const names = { engine: 'Motore', suspension: 'Sospensioni', gearbox: 'Cambio', body: 'Carrozzeria' };
  return `<div class="row between mb16"><div><h2>Parco Assistenza · 45 minuti</h2><div class="small muted">Scegli cosa riparare. Superare i 45 minuti costa 10 secondi di penalità per ogni minuto di ritardo. Gli equipaggi ritirati per la tappa ripartono con il Super Rally.</div></div><button class="btn primary lg" data-a="end-service">Chiudi assistenza ${icon('right')}</button></div>
  <div class="grid2 anim-in">${mine.map((c) => {
    const sel = X.repairs[c.key] || [];
    const total = sel.reduce((s, k) => s + repairMinutes(c.damage[k], mech, t.facilities.pitcrew), 0);
    return `<div class="panel"><div class="row">${helmetSVG(ev.driver(c).helmet, 40)}<b class="grow">${esc(ev.driver(c).name)}</b><span class="chip ${total > 45 ? 'bad' : 'good'}">${total} / 45 min</span></div>
      ${bar(Math.min(100, (total / 45) * 100), total > 45 ? 'red' : 'green')}
      <div class="col gap6 mt16">${Object.entries(c.damage).map(([k, v]) => { const m = repairMinutes(v, mech, t.facilities.pitcrew); const on = sel.includes(k); return `<div class="card row ${v > 0.02 ? 'click' : ''} ${on ? 'sel' : ''}" ${v > 0.02 ? `data-a="repair" data-key="${c.key}" data-c="${k}"` : ''}><b class="grow">${names[k]}</b><div style="width:120px">${bar(v * 100, v > 0.4 ? 'red' : 'gold')}</div><span class="small mono" style="width:70px;text-align:right">${v > 0.02 ? m + ' min' : '<span class="good">OK</span>'}</span></div>`; }).join('')}</div>
      <button class="btn sm mt16" data-a="repair-all" data-key="${c.key}">Ripara tutto</button></div>`;
  }).join('') || '<div class="panel">Nessun equipaggio in gara.</div>'}</div>`;
}

function finalView(st) {
  return `<div class="grid2 anim-in" style="max-width:1100px;margin:0 auto"><div class="panel"><div class="panel-head"><h3>Classifica finale</h3></div>${overallTable(st, 20)}</div>
  <div class="col gap16" style="justify-content:center"><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:48px;line-height:1">🏁 RALLY CONCLUSO</div><button class="btn primary xl pulse" data-a="finish-rally">Podio e punti ${icon('right')}</button></div></div>`;
}

function speedUI() {
  document.querySelectorAll('#speedbtns .btn').forEach((b) => b.classList.toggle('active', +b.dataset.v === X.speed && !X.paused));
  const p = document.getElementById('btn-pause'); if (p) p.innerHTML = icon(X.paused ? 'play' : 'pause');
}
