// Rally event: Shakedown → stages (prep, run with live decisions) → service → results
import { App, registerScreen, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, trackSVG } from '../ui/art.js';
import { esc, bar, fmtLong, fmtGap } from '../ui/dom.js';
import { S, saveGame, getSettings } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { playerTeam, applyRoundResults, teamDrivers, seatsPerTeam, aiFillSeats } from '../engine/season.js';
import { RallyEvent, PACE_MODES, SECTOR_TYPES, tyreFit, repairMinutes, quickMinutes, SERVICE_TIME, SERVICE_BASE, SERVICE_SETUP, SERVICE_CHECK } from '../engine/rally.js';
import '../styles/broadcast.css';
import '../styles/rally.css';
import { buildEntries, aiSetupQuality } from '../engine/race.js';
import { RALLY_TYRES, SURFACES } from '../data/categories.js';
import { genStage, TrackView, STAGE_STYLE } from '../ui/trackview.js';
import { mulberry32, clamp, rand } from '../engine/rng.js';
import { tyreBadge, teamStripe, driverChip } from './common.js';
import { sfx, engineStart, engineSet, engineStop, music } from '../ui/audio.js';
import { celebrate } from './results.js';
import { shortName } from './weekend.js';
import { DecisionHub, hubLogHTML } from './decisions.js';
import { Race3D, webglAvailable, stageGeometry, stageSampleAt } from '../ui/race3d.js';
import { saveReel } from '../engine/highlights.js';
import { openHighlights } from './highlights.js';

const RP = [
  { id: 'susp', name: 'Escursione Sospensioni', lo: 'Troppo rigida: rimbalza sulle buche', hi: 'Troppo morbida: imprecisa nei cambi di direzione' },
  { id: 'diff', name: 'Differenziali', lo: 'Troppo aperti: perde trazione', hi: 'Troppo bloccati: sottosterzo nei tornanti' },
  { id: 'height', name: 'Altezza da Terra', lo: 'Troppo bassa: picchia il fondo', hi: 'Troppo alta: rollio eccessivo' },
  { id: 'gear', name: 'Rapporti', lo: 'Corti: fuori giri sui veloci', hi: 'Lunghi: lenta in uscita' },
];
const X = window.__rx = { ev: null, view: null, raf: 0, speed: 16, paused: false, decision: null, decT: 0, uiT: 0, last: 0, choices: {}, repairs: {}, svc: {}, holding: false };
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
    if (st.quickSkip && w.phase === 'shakedown') { for (const c of Object.values(w.cars)) c.q = aiSetupQuality(st, playerTeam(st)); w.phase = 'prep'; X.ev = null; }
    if (w.phase !== 'shakedown' && !X.ev) { w.phase = 'prep'; startEvent(st); }
    if (w.phase === 'run') return runScreen(st, tr);
    const stagesStrip = ev.stages.map((s, i) => { const done = X.ev && i < X.ev.stageIdx; const cur = X.ev && i === X.ev.stageIdx; return `<div class="step ${done ? 'done' : cur ? 'cur' : ''}" style="padding:7px 12px;font-size:14px" data-tip="${esc(s.name || '')} · ${SURFACES[s.surface].name}${s.power ? ' · Power Stage' : ''}"><i style="display:inline-block;width:6px;height:14px;background:${SURFACES[s.surface].color};transform:skewX(-12deg)"></i>PS${i + 1}${s.power ? icon('bolt', 'ico', 'style="width:13px;height:13px"') : ''}</div>`; }).join('');
    return `<div class="wk-screen">
      <div class="wk-head">
        ${w.phase === 'shakedown' ? `<button class="btn icon-btn" data-a="exit" aria-label="Esci dal rally">${icon('left')}</button>` : ''}
        ${flagSVG(tr.nat, 40, 27)}<div><div class="wk-title">${esc(tr.name)}</div><div class="wk-sub">${ev.stages.length} prove speciali · ${ev.stages.reduce((a, b) => a + b.km, 0)} km cronometrati · Round ${st.round + 1}/${st.calendar.length}</div></div>
        <div class="grow"></div><div class="stepper" style="gap:3px;flex-wrap:wrap;justify-content:flex-end">${stagesStrip}</div>
      </div>
      <div class="wk-body">${w.phase === 'shakedown' ? shakedown(st, tr) : w.phase === 'prep' ? prep(st, tr) : w.phase === 'stageres' ? stageResults(st, tr) : w.phase === 'service' ? service(st) : w.phase === 'final' ? finalView(st) : ''}</div>
    </div>`;
  },
  mount() { const ph = S().weekend?.phase; if (ph === 'run') { mountRun(); coach('rallyrun', 'Prova speciale in corso', 'Guarda il <b>delta</b> sui rivali agli intermedi e cambia ritmo in diretta dal pannello a destra. Quando il copilota ti chiama hai pochi secondi per decidere (tasti <b>A</b>/<b>B</b>): rischiare fa guadagnare tempo ma può costare il rally!'); } else if (ph === 'prep') coach('rallyprep', 'Giri, gomme e note', 'Le prove sono a <b>giri</b> di due: le gomme si montano in assistenza e devono durare per tutto il giro, scorte comprese. Leggi le <b>note del copilota</b> e scegli il ritmo per ogni sezione: attaccare dove la strada è veloce paga, nelle sezioni strette costa caro.'); },
  unmount() { stopRun(); },
  onKey(e) {
    if (S().weekend?.phase !== 'run') return;
    if (e.code === 'Space') { e.preventDefault(); if (document.activeElement?.matches?.('button, [data-a]')) document.activeElement.blur(); X.paused = !X.paused; X.last = performance.now(); speedUI(); return; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'Minus' || e.code === 'NumpadSubtract') { const L = [1, 4, 8, 16, 32, 64]; const i = Math.max(0, L.indexOf(X.speed)); X.speed = L[Math.max(0, Math.min(L.length - 1, i + (e.code === 'Equal' || e.code === 'NumpadAdd' ? 1 : -1)))]; speedUI(); return; }
    // co-driver calls: A/B (or arrows) as always, plus the shared 1/2/Enter of every decision card
    const cur = X.hub?.cur;
    if (cur && (e.code === 'KeyA' || e.key === 'ArrowLeft')) { e.preventDefault(); X.hub.answer(cur.id, 0); return; }
    if (cur && (e.code === 'KeyB' || e.key === 'ArrowRight')) { e.preventDefault(); X.hub.answer(cur.id, 1); return; }
    if (X.hub?.key(e)) return;
    const sp = { Digit1: 1, Digit2: 4, Digit3: 8, Digit4: 16, Digit5: 32, Digit6: 64 }[e.code]; if (sp) { X.speed = sp; X.paused = false; speedUI(); }
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
    tyre(el) { const ch = X.choices[el.dataset.key]; if (ch.spare === ch.tyre) ch.spare = el.dataset.t; ch.tyre = el.dataset.t; App.refresh(); },
    spare(el) { X.choices[el.dataset.key].spare = el.dataset.t; App.refresh(); },
    spares(el) { X.choices[el.dataset.key].spares = +el.dataset.n; App.refresh(); },
    usespare(el) { const ch = X.choices[el.dataset.key]; ch.useSpare = !ch.useSpare; App.refresh(); },
    pace(el) { const ch = X.choices[el.dataset.key]; ch.paces = [0, 1, 2].map(() => el.dataset.p); ch.pace = el.dataset.p; App.refresh(); },
    space(el) { const ch = X.choices[el.dataset.key]; ch.paces[+el.dataset.s] = el.dataset.p; App.refresh(); },
    livepace(el) { const c = X.ev?.crews.find((x) => x.key === el.dataset.key); if (c && X.ev.setLivePace(c, el.dataset.p)) { X.choices[c.key] && (X.choices[c.key].paces = c.plan.paces.slice()); sfx.radio?.(); App.toast(el.dataset.p === 'push' ? 'Attacco!' : el.dataset.p === 'safe' ? 'Si rallenta' : 'Ritmo equilibrato', `${X.ev.driver(c).name}: ${PACE_MODES[el.dataset.p].name.toLowerCase()} fino alla fine della prova.`, el.dataset.p === 'push' ? 'bad' : ''); renderUI(true); } },
    'go-stage'() { const st = S(); X.ev.planStage(X.choices); st.weekend.phase = 'run'; App.refresh(); },
    speed(el) { X.speed = +el.dataset.v; X.paused = false; X.last = performance.now(); speedUI(); },
    pause() { X.paused = !X.paused; X.last = performance.now(); speedUI(); },
    dec(el) { X.hub?.answer(el.dataset.id, +el.dataset.i); },
    'dec-cfg'() { X.hub?.toggleCfg(); },
    'dec-mode'(el) { X.hub?.setMode(el.dataset.v); },
    'dec-minor'() { X.hub?.toggleMinor(); },
    recce(el) { X.ev?.setRecce(el.dataset.key, el.dataset.v === '1'); App.refresh(); },
    lightpod(el) { const ch = X.choices[el.dataset.key]; ch.lightPod = !ch.lightPod; App.refresh(); },
    roadside(el) { const r = X.ev?.roadsideRepair(el.dataset.key, el.dataset.c); if (r) { App.toast(r.late ? 'Riparazione riuscita, ma in ritardo' : 'Riparazione riuscita', r.text, r.late ? 'bad' : 'good'); if (r.late) sfx.bad(); else sfx.ok(); } App.refresh(); },
    rcam(el) { X.view3d = el.dataset.c; X.cam = X.view3d; rallyEnable3D(X.view3d); rallyViewBtns(); },
    rview2d() { rallyDisable3D(); rallyViewBtns(); },
    rfocus(el) { X.focus = el.dataset.key; X.userFocus = true; },
    'stage-done'() { afterStage(); },
    'skip-stage'() { skipStage(); },
    rep(el) {
      const k = el.dataset.key, comp = el.dataset.c, m = el.dataset.m;
      const full = X.repairs[k] ||= []; const o = X.svc[k] ||= {}; const q = o.quick ||= [];
      const rm = (a) => { const i = a.indexOf(comp); if (i >= 0) a.splice(i, 1); };
      rm(full); rm(q); if (m === 'full') full.push(comp); else if (m === 'quick') q.push(comp);
      App.refresh();
    },
    svcopt(el) { const o = X.svc[el.dataset.key] ||= {}; o[el.dataset.o] = !o[el.dataset.o]; App.refresh(); },
    'repair-all'(el) { const c = X.ev.crews.find((x) => x.key === el.dataset.key); X.repairs[c.key] = Object.keys(c.damage).filter((k) => c.damage[k] > 0.02); (X.svc[c.key] ||= {}).quick = []; App.refresh(); },
    'repair-fit'(el) { fitRepairs(X.ev.crews.find((x) => x.key === el.dataset.key)); App.refresh(); },
    'end-service'() { const notes = X.ev.service(X.repairs, X.svc); X.repairs = {}; X.svc = {}; notes.forEach((n) => App.toast('Assistenza', n, 'bad')); S().weekend.phase = X.ev.finished() ? 'final' : 'prep'; prepChoices(); App.refresh(); },
    'next'() { const st = S(); const w = st.weekend; if (X.ev.finished()) w.phase = 'final'; else if (X.ev.isServiceAfter(X.ev.stageIdx - 1)) w.phase = 'service'; else { w.phase = 'prep'; prepChoices(); } App.refresh(); },
    'rally-hl'(el) { const r = rallyReel(el.dataset.s != null ? +el.dataset.s : null); if (r) openHighlights(r); },
    'finish-rally'() {
      const st = S(); const res = X.ev.results(); res.track = st.weekend.trackId;
      const idx = st.round;
      try { const reel = rallyReel(); if (reel) saveReel(st, reel, idx); } catch (e) { console.warn('highlights', e); }
      X.ev = null;
      applyRoundResults(st, res); saveGame(); App.go('results', { idx });
    },
    'sim-rest'() {
      App.confirm('Simulare il resto del rally?', 'Le scelte verranno fatte automaticamente con ritmo equilibrato.', () => {
        const ev = X.ev;
        while (!ev.finished()) {
          ev.planStage({});
          let g = 0; while (!ev.allDone() && g++ < 1e5) { const r = ev.advance(2); if (r) ev.resolveDecision(r, 'b'); }
          ev.completeStage();
          if (ev.isServiceAfter(ev.stageIdx - 1)) ev.service(Object.fromEntries(ev.crews.filter((c) => c.isPlayer).map((c) => [c.key, Object.keys(c.damage).filter((k) => c.damage[k] > 0.02)])));
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
  const loopStart = ev.isLoopStart();
  const adv = ev.loopTyreAdvice();
  for (const c of ev.crews.filter((x) => x.isPlayer)) {
    const prev = X.choices[c.key] || {};
    X.choices[c.key] = loopStart ? { tyre: adv, spare: adv, spares: 2, paces: prev.paces ? prev.paces.slice() : ['normal', 'normal', 'normal'], useSpare: false, lightPod: ev.loopHasNight() }
      : { tyre: c.tyre, spare: c.spare, spares: c.spares, paces: prev.paces ? prev.paces.slice() : ['normal', 'normal', 'normal'], useSpare: false, lightPod: !!c.lightPod };
  }
}
// engineer: full repairs by severity while they fit in the time budget, patches for the rest
function fitRepairs(c) {
  const st = S(); const t = playerTeam(st); const mech = st.staff[t.staff.mechanic]?.rating || 65; const crewLvl = t.facilities.pitcrew;
  const o = X.svc[c.key] ||= {}; const full = X.repairs[c.key] = []; o.quick = [];
  let left = SERVICE_TIME - SERVICE_BASE - (o.setup ? SERVICE_SETUP : 0) - (o.check ? SERVICE_CHECK : 0);
  const dm = Object.entries(c.damage).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of dm) { const m = repairMinutes(v, mech, crewLvl); if (m <= left) { full.push(k); left -= m; } }
  for (const [k, v] of dm) { if (full.includes(k)) continue; const m = quickMinutes(v, mech, crewLvl); if (m <= left) { o.quick.push(k); left -= m; } }
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

const DMG = { engine: 'Motore', suspension: 'Sospensioni', gearbox: 'Cambio', body: 'Carrozzeria' };
const PACE_CLS = { safe: 'save', normal: '', push: 'push' };
const riskCls = (r) => (r > 0.12 ? 'bad' : r > 0.06 ? 'warn' : 'good');

function overallTable(st, limit = 14, opts = {}) {
  const ov = X.ev.overall(); const lead = ov[0];
  const before = opts.before;
  return `<table class="tbl small rx-ov"><tbody>${ov.slice(0, limit).map((c, i) => {
    const d = X.ev.driver(c);
    const was = before ? before.indexOf(c.key) : -1; const mv = was >= 0 && c.status !== 'out' ? was - i : 0;
    const prev = ov[i - 1];
    return `<tr class="${c.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${c.status === 'out' ? 'RIT' : i + 1}</td><td>${teamStripe(c.team)}</td><td>${driverChip(st, d, { size: 22 })}</td>${before ? `<td class="rx-mv ${mv > 0 ? 'good' : mv < 0 ? 'bad' : 'dim'}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + -mv : '–'}</td>` : ''}<td class="right mono">${c.status === 'out' ? '<span class="bad">Ritirato</span>' : lead.total === 0 ? '<span class="dim">—</span>' : i === 0 ? fmtLong(c.total) : fmtGap(c.total - lead.total)}</td>${opts.int ? `<td class="right mono tiny muted">${i && prev && c.status !== 'out' && lead.total ? '+' + (c.total - prev.total).toFixed(1) : ''}</td>` : ''}${c.superRally ? '<td><span class="chip warn tiny">SR</span></td>' : '<td></td>'}</tr>`;
  }).join('')}</tbody></table>`;
}

function sectorStrip(stg, paces = null) {
  return `<div class="rx-sectors">${stg.sectors.map((s, i) => { const T = SECTOR_TYPES[s]; const risk = Math.round(T.risk * 2); return `<div class="rx-sec t-${s}"><div class="rx-sec-h"><span>S${i + 1}</span><b>${T.name}</b><i class="rx-risk" data-tip="Rischio della sezione">${'<em></em>'.repeat(clamp(risk, 1, 4))}</i></div><div class="rx-sec-n">${T.note}</div>${paces ? `<div class="rx-sec-p ${PACE_CLS[paces[i]]}">${PACE_MODES[paces[i]].name}</div>` : ''}</div>`; }).join('')}</div>`;
}
function wxChip(stg, current) {
  if (stg.surface === 'snow') return `<span class="chip">${icon('cloud', 'ico', 'style="width:13px"')} Neve/Ghiaccio</span>`;
  if (current) return `<span class="chip ${stg.wet ? 'info' : ''}">${icon(stg.wet ? 'rain' : 'sun', 'ico', 'style="width:13px"')} ${stg.wet ? 'Bagnato' : 'Asciutto'}</span>`;
  return `<span class="chip ${stg.rainP >= 50 ? 'info' : ''}">${icon(stg.rainP >= 50 ? 'rain' : stg.rainP >= 25 ? 'cloud' : 'sun', 'ico', 'style="width:13px"')} Pioggia ${stg.rainP}%</span>`;
}
function fitMark(t, s, cur) {
  const wet = cur ? s.wet : s.rainP >= 50;
  const f = tyreFit(t, s, wet);
  return f >= -0.004 ? '<b class="good">✓</b>' : f > -0.03 ? '<b class="warn">~</b>' : '<b class="bad">✕</b>';
}

function prep(st, tr) {
  const ev = X.ev; const stg = ev.stage;
  const path = genStage(tr.seed + stg.idx * 101, STAGE_STYLE[tr.id]);
  const mine = ev.crews.filter((c) => c.isPlayer);
  const loop = ev.loopStages(); const loopStart = ev.isLoopStart();
  const loopN = ev.stages.filter((s, i) => ev.isLoopStart(i) && i <= stg.idx).length;
  const advice = ev.loopTyreAdvice(loop);
  return `<div class="rx-prep anim-in">
    <div class="col gap16">
      <div class="panel glow rx-hero"><div class="row between wrap gap8"><div><div class="tiny upper muted">Prova speciale ${stg.idx + 1} di ${ev.stages.length} · Giro ${loopN}${stg.power ? ' · <span class="warn">POWER STAGE (punti bonus)</span>' : ''}</div><h2 style="font-size:30px;font-style:italic">${esc(stg.name)}</h2></div>
        <div class="row wrap gap6"><span class="chip" style="border-color:${SURFACES[stg.surface].color}">${SURFACES[stg.surface].name}</span><span class="chip">${stg.km} km</span>${wxChip(stg, true)}${stg.night ? '<span class="chip warn">Notturna</span>' : ''}</div></div>
        <div class="rx-map">${trackSVG(path, { w: 640, h: 150, glow: SURFACES[stg.surface].color, color: '#e9edf3', width: 4 })}</div>
        <div class="tiny upper muted mb8">Note del copilota</div>${sectorStrip(stg)}
      </div>
      <div class="panel rx-loop"><div class="panel-head"><h3>Giro ${loopN} · ${loop.length} prove senza assistenza</h3><span class="small muted">${loopStart ? 'Scegli le gomme per tutto il giro' : 'Gomme montate in assistenza'}</span></div>
        <div class="rx-loopstages">${loop.map((s) => `<div class="rx-ls ${s.idx === stg.idx ? 'cur' : s.idx < stg.idx ? 'done' : ''}"><span class="rx-ls-n">PS${s.idx + 1}</span><b>${esc(s.name)}</b><span class="rx-surf" style="--sc:${SURFACES[s.surface].color}">${SURFACES[s.surface].name}</span><span class="small muted">${s.km} km</span>${wxChip(s, s.idx === stg.idx)}${s.night ? '<span class="chip warn tiny">Notte</span>' : ''}${s.power ? '<span class="chip warn tiny">Power</span>' : ''}</div>`).join('')}</div>
        <div class="small muted mt8">${icon('info', 'ico', 'style="width:13px;vertical-align:-2px"')} Consiglio del copilota per il giro: <b style="color:#fff">${RALLY_TYRES[advice].name}</b>${new Set(loop.map((s) => (s.surface === 'rough' ? 'gravel' : s.surface))).size > 1 ? ' · <span class="warn">superfici miste: valuta le scorte di un altro tipo</span>' : ''}</div>
      </div>
      ${mine.map((c) => crewPrep(st, c, loop, loopStart)).join('')}
      <div class="row between"><button class="btn ghost" data-a="sim-rest">${icon('ff')} Simula il resto</button><button class="btn primary xl pulse" data-a="go-stage">${icon('flag')} Via alla prova!</button></div>
    </div>
    <div class="col gap16"><div class="panel"><div class="panel-head"><h3>Classifica assoluta</h3><span class="small muted">dopo ${stg.idx} ${stg.idx === 1 ? 'prova' : 'prove'}</span></div>${overallTable(st, 14, { int: true })}</div>${stg.idx >= 2 ? `<div class="panel"><div class="panel-head"><h3>Distacchi prova dopo prova</h3></div>${gapChartSVG(ev)}</div>` : ''}</div>
  </div>`;
}

function crewPrep(st, c, loop, loopStart) {
  const ev = X.ev; const stg = ev.stage; const d = ev.driver(c); const ch = X.choices[c.key];
  const dmg = Object.entries(c.damage).filter(([, v]) => v > 0.02);
  const head = `<div class="row">${helmetSVG(d.helmet, 40)}<div class="grow"><b style="font-family:var(--display);font-size:19px;text-transform:uppercase">${esc(d.name)}</b><div class="small muted">${c.status === 'out' ? '<span class="bad">Ritirato</span>' : c.retiredLeg ? '<span class="warn">Fuori fino all’assistenza (Super Rally)</span>' : `${ev.overall().indexOf(c) + 1}° assoluto`}</div></div>${dmg.length ? `<span class="chip bad">Danni: ${dmg.map(([k, v]) => `${DMG[k].toLowerCase()} ${Math.round(v * 100)}%`).join(', ')}</span>` : '<span class="chip good">Auto integra</span>'}</div>`;
  if (c.status === 'out' || c.retiredLeg) return `<div class="panel rx-crew">${head}</div>`;
  const tyres = Object.entries(RALLY_TYRES);
  let tyreHTML;
  if (loopStart) {
    tyreHTML = `<div class="tiny upper muted mt16 mb8">Gomme montate per il giro</div><div class="rx-tyres">${tyres.map(([k, t]) => `<button class="rx-tyre ${ch.tyre === k ? 'on' : ''}" data-a="tyre" data-key="${c.key}" data-t="${k}">${tyreBadge(k)}<span>${t.name}</span><span class="rx-fit">${loop.map((s) => `<i data-tip="PS${s.idx + 1}">${fitMark(k, s, s.idx === stg.idx)}</i>`).join('')}</span></button>`).join('')}</div>
      <div class="row wrap gap8 mt8 rx-spare"><span class="tiny upper muted">Scorte</span><div class="seg" style="min-width:150px">${[1, 2].map((n) => `<div class="${ch.spares === n ? 'on' : ''}" data-a="spares" data-key="${c.key}" data-n="${n}" data-tip="${n === 2 ? 'Due ruote: puoi forare due volte o montare le scorte a metà giro, ma pesi di più (~0,15%)' : 'Una ruota: più leggero, ma alla seconda foratura si guida sul cerchio'}">${n} ${n === 1 ? 'ruota' : 'ruote'}</div>`).join('')}</div>
        <span class="tiny upper muted">Tipo</span><div class="row gap4 wrap">${tyres.map(([k]) => `<button class="btn sm ${ch.spare === k ? 'active' : ''}" style="padding:3px 6px" data-a="spare" data-key="${c.key}" data-t="${k}" data-tip="Scorte: ${RALLY_TYRES[k].name}">${tyreBadge(k)}</button>`).join('')}</div></div>`;
  } else {
    const canSwap = c.spares >= 2 && c.spare;
    tyreHTML = `<div class="rx-tyrestate mt16"><div>${tyreBadge(c.tyre)}<div><b>${RALLY_TYRES[c.tyre].name}</b><div class="tiny muted">montate in assistenza · usura ${Math.round(Math.min(1, c.tyreWear) * 100)}%</div></div><div class="rx-wear">${bar(Math.min(100, c.tyreWear * 100), c.tyreWear > 0.7 ? 'red' : c.tyreWear > 0.4 ? 'gold' : 'green')}</div><span class="rx-fitone">${fitMark(c.tyre, stg, true)}</span></div>
      <div>${c.spare ? tyreBadge(c.spare) : ''}<div><b>Scorte: ${c.spares}</b><div class="tiny muted">${c.spare ? RALLY_TYRES[c.spare].name : '—'}</div></div>${canSwap ? `<button class="btn sm ${ch.useSpare ? 'active' : ''}" data-a="usespare" data-key="${c.key}" data-tip="Nella zona di montaggio: monti le due scorte (gomme fresche o di un altro tipo), ma resti senza ruote di riserva">${ch.useSpare ? 'Scorte montate' : 'Monta le scorte'}</button>` : '<span class="tiny muted">non intercambiabili</span>'}</div></div>`;
  }
  const est = ev.paceEstimate(c, ch.paces);
  const all = (p) => ch.paces.every((x) => x === p);
  return `<div class="panel rx-crew">${head}${tyreHTML}
    <div class="row between mt16 mb8"><span class="tiny upper muted">Ritmo per sezione (note)</span><div class="row gap4">${Object.entries(PACE_MODES).map(([k, p]) => `<button class="btn sm ${all(k) ? 'active' : ''}" data-a="pace" data-key="${c.key}" data-p="${k}">Tutto ${p.name.toLowerCase()}</button>`).join('')}</div></div>
    <div class="rx-paces">${stg.sectors.map((s, i) => `<div><div class="tiny muted">S${i + 1} · ${SECTOR_TYPES[s].name}</div><div class="seg">${Object.entries(PACE_MODES).map(([k, p]) => `<div class="${ch.paces[i] === k ? 'on ' + PACE_CLS[k] : ''}" data-a="space" data-key="${c.key}" data-s="${i}" data-p="${k}">${p.name.slice(0, 4)}.</div>`).join('')}</div></div>`).join('')}</div>
    <div class="rx-est"><div><span>Tempo stimato</span><b class="${est.dt < -0.05 ? 'good' : est.dt > 0.05 ? 'warn' : ''}">${est.dt >= 0 ? '+' : '−'}${Math.abs(est.dt).toFixed(1)}s</b><small>vs equilibrato</small></div><div><span>Rischio di uscita</span><b class="${riskCls(est.risk)}">${(est.risk * 100).toFixed(0)}%</b><small>${bar(Math.min(100, est.risk * 500), est.risk > 0.12 ? 'red' : est.risk > 0.06 ? 'gold' : 'green')}</small></div><div><span>Setup</span><b>${Math.round(c.setupQ * 100)}%</b><small>fiducia assetto</small></div></div>
    ${(() => {
      const ri = ev.roadInfo(c, stg); const loose = stg.surface !== 'tarmac';
      const road = `<div class="rx-opt"><div><b>Ordine di partenza: ${ri.pos}° su ${ri.n}</b><div class="tiny muted">${loose ? (stg.wet && stg.surface !== 'snow' ? 'Fondo bagnato: chi parte dopo trova solchi e fango' : 'Chi apre la strada spazza la ghiaia (o la neve) smossa per gli altri') : 'Asfalto: i tagli portano terra in traiettoria a chi parte dopo'} · ${ev.stageIdx < 2 ? 'primo giro in ordine di campionato' : 'ordine inverso di classifica'}</div></div><span class="chip ${ri.secs > 1.5 ? 'bad' : ri.secs > 0.5 ? 'warn' : 'good'}">${ri.secs < 0.05 ? 'strada pulita' : `−${ri.secs.toFixed(1)}s`}</span></div>`;
      const notes = `<div class="rx-opt"><div><b>Note del copilota: ${c.recce > 0.78 ? 'precise' : c.recce > 0.58 ? 'buone' : 'approssimative'}</b><div class="tiny muted">Note imprecise = più rischio di uscita in ogni settore. ${ev.stageIdx === 0 ? 'Un passaggio di ricognizione in più le migliora, ma toglie tempo alla messa a punto (−5% assetto).' : 'La ricognizione si fa prima della prima prova.'}</div></div>${ev.stageIdx === 0 ? `<button class="btn sm ${c.recceDeep ? 'active' : ''}" data-a="recce" data-key="${c.key}" data-v="${c.recceDeep ? 0 : 1}">${c.recceDeep ? 'Ricognizione extra: SÌ' : 'Ricognizione extra: NO'}</button>` : `<span class="chip">${Math.round(c.recce * 100)}%</span>`}</div>`;
      const hasNight = ev.loopHasNight();
      const pod = loopStart ? `<div class="rx-opt"><div><b>Rampa fari supplementari</b><div class="tiny muted">${hasNight ? '<span class="warn">C’è una prova notturna in questo giro:</span> senza fari si perde ~3% e il rischio quasi raddoppia.' : 'Nessuna prova notturna nel giro: i fari sono solo peso e resistenza (−0,1%).'}</div></div><button class="btn sm ${ch.lightPod ? 'active' : ''}" data-a="lightpod" data-key="${c.key}">${ch.lightPod ? 'Fari montati' : 'Senza fari'}</button></div>` : (hasNight ? `<div class="rx-opt"><div><b>Rampa fari</b><div class="tiny muted">Scelta fatta in assistenza per tutto il giro.</div></div><span class="chip ${c.lightPod ? 'good' : 'bad'}">${c.lightPod ? 'Montata' : 'Non montata'}</span></div>` : '');
      return road + notes + pod;
    })()}
  </div>`;
}

function gapChartSVG(ev) {
  const done = ev.stageIdx; if (done < 2) return '';
  const ov = ev.overall().filter((c) => c.status !== 'out');
  const keys = new Set(ov.slice(0, 5).map((c) => c.key)); for (const c of ov) if (c.isPlayer) keys.add(c.key);
  const W = 520, H = 200, padL = 46, padR = 54, padB = 22;
  const series = [...keys].map((k) => { const c = ev.crews.find((x) => x.key === k); return { c, pts: ev.stages.slice(0, done).map((s, i) => [i + 1, s.gapsAfter?.[k]]).filter((p) => p[1] != null) }; });
  const maxG = Math.max(10, ...series.flatMap((s) => s.pts.map((p) => p[1]))) * 1.08;
  const x = (i) => padL + ((i - 1) / Math.max(1, done - 1)) * (W - padL - padR);
  const y = (g) => 10 + (g / maxG) * (H - padB - 14);
  let s = `<svg class="an-svg rx-gap" viewBox="0 0 ${W} ${H}">`;
  for (let i = 1; i <= done; i++) s += `<line x1="${x(i)}" x2="${x(i)}" y1="8" y2="${H - padB}" class="an-grid"/><text x="${x(i)}" y="${H - 6}" class="an-ax" text-anchor="middle">PS${i}</text>`;
  const step = maxG > 120 ? 60 : maxG > 40 ? 20 : 10;
  for (let g = 0; g <= maxG; g += step) s += `<line x1="${padL}" x2="${W - padR + 10}" y1="${y(g)}" y2="${y(g)}" class="an-grid"/><text x="${padL - 6}" y="${y(g) + 4}" class="an-ax" text-anchor="end">${g ? '+' + g + 's' : 'Leader'}</text>`;
  const labs = [];
  for (const { c, pts } of series) {
    if (!pts.length) continue;
    const col = c.team.car.livery.primary;
    s += `<g class="an-line on${c.isPlayer ? ' me' : ''}"><polyline points="${pts.map(([i, g]) => `${x(i).toFixed(1)},${y(g).toFixed(1)}`).join(' ')}" stroke="${col}"/>${pts.map(([i, g]) => `<circle cx="${x(i).toFixed(1)}" cy="${y(g).toFixed(1)}" r="3" fill="${col}"><title>${esc(ev.driver(c).name)} · PS${i}: ${g ? '+' + g.toFixed(1) + 's' : 'leader'}</title></circle>`).join('')}</g>`;
    const l = pts[pts.length - 1]; labs.push({ x: x(l[0]) + 8, y: y(l[1]) + 4, t: esc(shortName(ev.driver(c).name)) });
  }
  labs.sort((a, b) => a.y - b.y); for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 13) labs[i].y = labs[i - 1].y + 13;
  return s + labs.map((l) => `<text x="${l.x}" y="${l.y}" class="an-lab" style="font-size:12px">${l.t}</text>`).join('') + '</svg>';
}

function mountRun() {
  const st = S(); const tr = getTrack('rally', st.weekend.trackId); const stg = X.ev.stage;
  X.view = new TrackView(document.getElementById('rally-cv'), genStage(tr.seed + stg.idx * 101, STAGE_STYLE[tr.id]), { pad: 50, rally: true, surface: stg.surface, glow: SURFACES[stg.surface].color + '55' });
  X.geo = stageGeometry(tr.seed + stg.idx * 101, stg.km, STAGE_STYLE[tr.id]);
  X.focus = X.ev.crews.find((c) => c.isPlayer && c.plan)?.key || X.ev.crews.find((c) => c.isPlayer)?.key;
  X.view3d = getSettings().view3d !== false && webglAvailable() ? (X.cam || 'chase') : null;
  rallyViewBtns();
  if (X.view3d) rallyEnable3D(X.view3d);
  X.hub = new DecisionHub({
    host: () => document.getElementById('decision'), stack: () => document.getElementById('dec-stack'), unit: 'di prova', advisor: 'copilota', stage: () => X.ev?.stageIdx,
    clock: { get speed() { return X.speed; }, set speed(v) { X.speed = v; }, get paused() { return X.paused; }, set paused(v) { X.paused = v; X.last = performance.now(); }, now: () => X.t },
    onSpeed: speedUI, onOpen: (it) => { if (it.focus) { X.focus = it.focus; X.userFocus = true; } }, onClose: () => { X.last = performance.now(); },
    note: (title, text) => X.ev?.pushLog(`${title}: ${text}`, 'info', null),
    extraCfg: 'Nei rally il copilota chiama i pericoli (A/B o 1/2) e a ogni intermedio puoi cambiare ritmo dalla card rapida.',
  });
  X.hub.log = (X.decLog ||= []);
  X.t = 0; X.paused = false; X.userFocus = false; X.decision = null; X.tvN = X.ev.tvId; X.tvQ = []; X.tvCur = 0; X.last = performance.now(); X.speed = Math.max(8, Math.min(64, (getSettings().raceSpeed || 8) * 2)); X.finished = false;
  music.setMood('race');
  engineStart('rally');
  const loop = (t) => {
    const dt = Math.min(0.1, (t - X.last) / 1000); X.last = t;
    if (!X.paused && !X.finished) {
      let rem = dt * X.speed;
      // a crew waiting on a co-driver call stands still (the others keep going): the hub pauses or slows the game
      while (rem > 0) { const d = Math.min(1, rem); const req = X.ev.advance(d); X.t += d; rem -= d; if (req && offerCall(req)) break; splitCalls(); }
      if (X.ev.allDone()) { X.finished = true; X.hub?.reset(); engineStop(); sfx.notify(); renderUI(true); }
    }
    if (X.hub && !X.finished) X.hub.tick();
    if (X.r3d) rallyUpdate3D(dt);
    drawRally();
    engineSet(X.paused || X.hub?.open || X.finished ? 0 : X.r3d && X.focusSpeed != null ? X.focusSpeed / 200 : 0.5 + Math.sin(t / 700) * 0.3, { rain: X.ev.stage.wet ? 0.7 : 0, crowd: 0.2 });
    X.uiT += dt; if (X.uiT > 0.25) { X.uiT = 0; renderUI(); }
    X.raf = requestAnimationFrame(loop);
  };
  renderUI(true); speedUI();
  X.raf = requestAnimationFrame(loop);
}
function stopRun() { X.hub = null; cancelAnimationFrame(X.raf); X.view?.destroy(); X.view = null; X.r3d?.destroy(); X.r3d = null; engineStop(); }
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

function runScreen(st, tr) {
  const stg = X.ev.stage;
  return `<div class="rally-screen">
    <div class="race-top">
      <button class="btn ghost icon-btn" data-a="pause" id="btn-pause">${icon('pause')}</button>
      <div class="rt-event">${flagSVG(tr.nat, 34, 22)}<div><div class="rt-name">PS${stg.idx + 1} · ${esc(stg.name)}</div><div class="rt-circ">${SURFACES[stg.surface].name} · ${stg.km} km${stg.wet ? ' · Bagnato' : ''}${stg.power ? ' · Power Stage' : ''}</div></div></div>
      <div class="tb-stat"><b id="stagetime">0:00</b><span>Tempo prova</span></div>
      <div class="tb-stat" id="rx-delta"><b>—</b><span>Delta</span></div>
      <div class="grow"></div>
      <div class="speed-btns" id="speedbtns">${[1, 4, 8, 16, 32, 64].map((v) => `<button class="btn sm" data-a="speed" data-v="${v}">${v === 1 ? '1x LIVE' : v + 'x'}</button>`).join('')}</div>
      <button class="btn sm dec-open" data-a="dec-cfg" data-tip="Decisioni a gioco accelerato: pausa automatica, rallenta a 1x o decide il copilota">${icon('settings')} Decisioni</button>
      <button class="btn sm" data-a="skip-stage">${icon('ff')} Fine prova</button>
    </div>
    <div class="race-board" id="board"></div>
    <div class="race-view" id="race-view"><canvas id="rally-cv"></canvas><div class="view-btns" id="view-btns"></div><div class="hud3d hidden" id="hud3d"></div><div class="tvg-layer" id="tvg"></div><div class="rx-secbar" id="rx-secbar"></div><div class="dec-stack" id="dec-stack"></div><div id="decision"></div></div>
    <div class="race-side" id="side"></div>
    <div class="race-feed" id="feed"></div>
  </div>`;
}

function liveBoard(st) {
  const ev = X.ev;
  const crews = ev.crews.filter((c) => c.status !== 'out' || c.plan);
  // order: finished by time, then on stage by projected time, then waiting
  const est = (c) => c.stageResult != null ? c.stageResult : c.done ? 1e9 : c.progress > 0.02 ? c.stageT / c.progress : 1e8 + (1 - c.progress);
  const list = crews.slice().sort((a, b) => est(a) - est(b));
  const fin = crews.filter((c) => c.stageResult != null).map((c) => c.stageResult);
  const best = fin.length ? Math.min(...fin) : null;
  const bs = [1 / 3, 2 / 3].map((sp) => { const t = crews.map((c) => c.splitTimes?.[sp]).filter((v) => v != null); return t.length ? Math.min(...t) : null; });
  const cell = (t, b) => t == null ? '<span class="dim">—</span>' : t === b ? `<span class="t-purple">${fmtLong(t)}</span>` : `<span>+${(t - b).toFixed(1)}</span>`;
  return `<div class="lb-row lb-head rx-row"><span>Pos</span><span></span><span>Equipaggio</span><span class="right">Int. 1</span><span class="right">Int. 2</span><span class="right">Arrivo</span></div>` + list.map((c, i) => {
    const d = ev.driver(c);
    const run = c.plan && !c.done && !c.waiting;
    const status = c.stageResult != null ? cell(c.stageResult, best) : c.done ? '<span class="bad tiny">FERMO</span>' : !c.plan ? '<span class="dim tiny">—</span>' : c.waiting ? '<span class="tiny muted">IN PARTENZA</span>' : `<span class="mono">${fmtLong(c.stageT)}</span>`;
    return `<div class="lb-row rx-row ${c.isPlayer ? 'me' : ''} ${c.key === X.focus ? 'focus' : ''} ${run ? 'onstage' : ''}" data-a="rfocus" data-key="${c.key}" style="--rp:${Math.round((c.progress || 0) * 100)}%"><span class="pos p${i + 1}">${i + 1}</span>${teamStripe(c.team)}<span class="nm">${towerName(d.name)}</span><span class="gap rx-s">${cell(c.splitTimes?.[1 / 3], bs[0])}</span><span class="gap rx-s">${cell(c.splitTimes?.[2 / 3], bs[1])}</span><span class="gap">${status}</span></div>`;
  }).join('');
}
function towerName(n) { const p = String(n).split(' '); return p.length < 2 ? esc(n) : `<span class="ini">${esc(p[0][0])}.</span> ${esc(p.slice(1).join(' '))}`; }

function liveDelta(c) {
  if (!c?.plan || c.waiting || c.done || (c.progress || 0) < 0.03) return null;
  const ref = X.ev.refAt(c.progress);
  return ref == null ? null : c.stageT - ref;
}

function renderUI(force) {
  const st = S(); const ev = X.ev; const stg = ev.stage;
  const tt = document.getElementById('stagetime'); if (tt) tt.textContent = fmtLong(X.t);
  const b = document.getElementById('board'); if (b) b.innerHTML = liveBoard(st);
  const f = document.getElementById('feed'); if (f) f.innerHTML = ev.log.filter((l) => l.stage === ev.stageIdx).slice(0, 40).map((l) => `<div class="feed-item ${l.kind === 'crash' || l.kind === 'terminal' || l.kind === 'out' ? 'crash' : l.kind === 'good' ? 'finish' : l.kind === 'puncture' || l.kind === 'warn' || l.kind === 'major' ? 'warn' : ''} ${l.player ? 'player' : ''}"><span>${esc(l.text)}</span></div>`).join('');
  const mine = ev.crews.filter((c) => c.isPlayer);
  const fc = mine.find((c) => c.plan && !c.done && !c.waiting) || mine.find((c) => c.key === X.focus) || mine[0];
  const dl = liveDelta(fc);
  const dEl = document.getElementById('rx-delta'); if (dEl) dEl.innerHTML = `<b class="${dl == null ? '' : dl <= 0 ? 'good' : dl < 3 ? 'warn' : 'bad'}">${dl == null ? '—' : (dl <= 0 ? '−' : '+') + Math.abs(dl).toFixed(1)}</b><span>Delta ${fc ? esc(shortName(ev.driver(fc).name)) : ''}</span>`;
  const sb = document.getElementById('rx-secbar');
  if (sb && fc?.plan) { const cur = ev.sectorAt(fc.progress || 0); sb.innerHTML = stg.sectors.map((s, i) => `<div class="${i < cur ? 'done' : i === cur && !fc.waiting ? 'cur' : ''} ${PACE_CLS[fc.plan.paces[i]]}"><span>S${i + 1} ${SECTOR_TYPES[s].name}</span><b>${PACE_MODES[fc.plan.paces[i]].name}</b></div>`).join(''); }
  try { rallyTV(); } catch (e) { console.warn(e); }
  if (X.holding && !force) return;
  const side = document.getElementById('side');
  if (side) side.innerHTML = mine.map((c) => {
    const d = ev.driver(c);
    const dmg = Object.entries(c.damage).filter(([, v]) => v > 0.02);
    const cur = ev.sectorAt(c.progress || 0);
    const live = c.plan && !c.done;
    const dd = liveDelta(c);
    return `<div class="ctrl-card" style="border-top-color:${c.team.car.livery.primary}"><div class="row">${helmetSVG(d.helmet, 34)}<div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">${c.tyre ? RALLY_TYRES[c.tyre].name : ''} · usura ${Math.round(Math.min(1, c.tyreWear) * 100)}% · scorte ${c.spares}</div></div>${dd != null ? `<span class="rx-dd ${dd <= 0 ? 'good' : 'bad'}">${dd <= 0 ? '−' : '+'}${Math.abs(dd).toFixed(1)}</span>` : ''}</div>
      ${c.plan ? `<div class="rx-prog mt8"><i style="width:${(c.progress || 0) * 100}%"></i><em style="left:33.3%"></em><em style="left:66.6%"></em></div><div class="row between tiny mt8"><span>${c.waiting ? 'In attesa della partenza' : `${(stageKm() * (c.progress || 0)).toFixed(1)} / ${stageKm()} km · S${cur + 1} ${SECTOR_TYPES[stg.sectors[cur]].name}`}</span><span class="mono">${fmtLong(c.stageT)}</span></div>` : `<div class="small warn mt8">Non in prova</div>`}
      ${c.stageResult != null ? `<div class="chip good mt8">Arrivato: ${fmtLong(c.stageResult)}</div>` : ''}
      ${live ? `<div class="tiny upper muted mt8 mb8">Ritmo da S${cur + 1} in poi</div><div class="seg">${Object.entries(PACE_MODES).map(([k, p]) => `<div class="${c.plan.paces[cur] === k ? 'on ' + PACE_CLS[k] : ''}" data-a="livepace" data-key="${c.key}" data-p="${k}" data-tip="${k === 'push' ? 'Più veloce nelle sezioni rimanenti, molto più rischio' : k === 'safe' ? 'Rallenta: meno rischi per il resto della prova' : 'Ritmo bilanciato'}">${p.name}</div>`).join('')}</div>` : ''}
      ${dmg.length ? `<div class="row wrap gap4 mt8">${dmg.map(([k, v]) => `<span class="chip bad tiny">${DMG[k]} ${Math.round(v * 100)}%</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('') + `<div class="panel tight"><div class="tiny upper muted mb8">Assoluta (prima della prova)</div>${overallTable(st, 8)}</div>` + (X.finished ? `<button class="btn primary xl pulse" data-a="stage-done">${icon('chequered')} Tempi della prova</button>` : '');
}
function stageKm() { return X.ev.stage.km; }

// TV graphics for the rally: split times, stage wins, drama
function rallyTV() {
  const ev = X.ev; const el = document.getElementById('tvg'); if (!el) return;
  X.tvN ??= 0; X.tvQ ||= [];
  for (const g of ev.tv) { if (g.id <= X.tvN) continue; X.tvN = g.id; const c = ev.crews.find((x) => x.key === g.key); X.tvQ.push({ ...g, mine: !!c?.isPlayer }); }
  while (X.tvQ.length > 3) { const i = X.tvQ.findIndex((x) => !x.mine); X.tvQ.splice(i >= 0 ? i : 0, 1); }
  const now = performance.now();
  if (X.tvCur && now < X.tvCur) return;
  if (X.tvCur) { el.querySelector('.tvg')?.classList.add('out'); X.tvCur = 0; }
  const g = X.tvQ.shift(); if (!g) return;
  const c = ev.crews.find((x) => x.key === g.key); if (!c) return;
  const d = ev.driver(c); const col = c.team.car.livery.primary;
  const who = (x) => `<span class="tvg-car" style="--tc:${x.team.car.livery.primary}"><i></i><b>${esc(ev.driver(x).name.split(' ').slice(1).join(' ') || ev.driver(x).name)}</b><small>${esc(x.team.short || x.team.name)}</small></span>`;
  let html = '';
  if (g.kind === 'split') {
    const ref = g.ref && ev.crews.find((x) => x.key === g.ref);
    const cls = g.fastest ? 'purple' : g.delta < 1 ? 'good' : g.delta < 4 ? 'warn' : 'bad';
    html = `<div class="tvg split${g.mine ? ' mine' : ''}" style="--gc:${g.fastest ? 'var(--purple)' : col}"><span class="tvg-tag">${g.idx === 'F' ? (g.fastest ? 'Miglior tempo' : 'Arrivo') : 'Intermedio ' + g.idx}</span>${who(c)}<span class="tvg-big">${fmtLong(g.t)}</span>${g.delta != null ? `<span class="tvg-big ${cls}">${g.delta <= 0 ? '−' : '+'}${Math.abs(g.delta).toFixed(1)}</span>${ref ? `<span class="tvg-on">su</span>${who(ref)}` : ''}` : '<span class="tvg-txt">primo riferimento</span>'}</div>`;
    if (g.mine) { if (g.fastest || g.delta < 0) sfx.ok(); }
  } else if (g.kind === 'drama') html = `<div class="tvg retire${g.mine ? ' mine' : ''}" style="--gc:var(--bad)"><span class="tvg-tag">${esc(g.title)}</span>${who(c)}</div>`;
  else if (g.kind === 'decision') html = `<div class="tvg ${g.good ? 'restart' : 'retire'} mine" style="--gc:${g.good ? 'var(--good)' : 'var(--bad)'}"><span class="tvg-tag">${g.good ? 'Rischio pagato' : 'Errore'}</span>${who(c)}<span class="tvg-txt">${esc(g.text)}</span></div>`;
  if (!html) return;
  el.innerHTML = html; X.tvCur = now + (g.mine ? 3600 : 2600);
}

// co-driver call -> decision hub (major: pauses / slows the game; on timeout the safe line is taken)
function offerCall(crew) {
  const hub = X.hub; const dc = crew.plan?.decision; if (!hub || !dc || dc.done) return false;
  const id = `c${crew.key}|${X.ev.stageIdx}|${dc.t.id}`;
  if (hub.has(id) || dc.offered) return false;
  dc.offered = true;
  const d = X.ev.driver(crew); const sec = X.ev.sectorAt(crew.progress || 0);
  hub.offer({ id, prio: 3, who: d.name, focus: crew.key, color: 'var(--warn)', eyebrow: `Il copilota chiama · ${d.name} · S${sec + 1} ${SECTOR_TYPES[X.ev.stage.sectors[sec]].name}`, title: dc.t.text,
    text: `Scorte a bordo: ${crew.spares}. L’equipaggio è fermo sul punto della decisione: gli altri continuano a correre.`,
    options: [{ label: dc.t.a.label, desc: dc.t.a.desc }, { label: dc.t.b.label, desc: dc.t.b.desc }], def: 1, ttl: 10,
    valid: () => (dc.done || crew.done || !crew.plan ? 'la prova è andata avanti' : null),
    resolve: (i, by) => {
      const r = X.ev.resolveDecision(crew, i === 0 ? 'a' : 'b');
      X.ev.pushTV({ kind: 'decision', key: crew.key, good: r.good, text: r.gain < 0 ? `${r.gain.toFixed(1)}s` : r.good ? 'Nessun rischio' : `+${Math.round(r.gain)}s` });
      App.toast(`${by === 'player' ? '' : 'Decide il copilota · '}${r.good ? 'Ottima scelta!' : 'Problemi!'}`, r.text, r.good ? 'good' : 'bad');
      if (r.good) sfx.ok(); else sfx.bad();
      setTimeout(() => { const L = X.decLog; if (L?.length) L[L.length - 1].choice = `${L[L.length - 1].choice || ''} → ${r.text}`; }, 0);
      X.last = performance.now();
    } });
  return true;
}
// at every split the co-driver offers a pace change for the rest of the stage (minor, non-blocking card)
function splitCalls() {
  const hub = X.hub, ev = X.ev; if (!hub) return;
  for (const c of ev.crews) {
    if (!c.isPlayer || !c.plan || c.done) continue;
    const n = c.splits?.length || 0; if (n === (c._splitSeen || 0)) continue;
    c._splitSeen = n; if (n < 1 || n > 2) continue;
    const sp = n === 1 ? 1 / 3 : 2 / 3; const ref = ev.refAt(sp); const t = c.splitTimes?.[sp];
    const dl = ref != null && t != null ? t - ref : null;
    const cur = c.plan.paces[ev.sectorAt(c.progress || 0)];
    const d = ev.driver(c); const P3 = ['push', 'normal', 'safe'];
    const next = SECTOR_TYPES[ev.stage.sectors[Math.min(2, n)]];
    const left = c.pieces.slice(c.pieceIdx).reduce((a, p) => a + (p.dur < 9999 ? p.dur : 0), 0) - (c.pieceT || 0);
    hub.offer({ id: `s${c.key}|${ev.stageIdx}|${n}`, prio: 1, who: d.name, focus: c.key, color: 'var(--info)', eyebrow: 'Intermedio', title: `Intermedio ${n} · ${d.name}`,
      text: `${dl == null ? 'Primo riferimento in prova.' : dl <= 0 ? `Miglior tempo all’intermedio (${dl.toFixed(1)}s).` : `+${dl.toFixed(1)}s dal migliore.`} Prossimo settore: ${next.name.toLowerCase()} (${next.note.toLowerCase()}). Ritmo attuale: ${PACE_MODES[cur].name.toLowerCase()}.`,
      options: P3.map((p) => ({ label: PACE_MODES[p].name, desc: p === 'push' ? 'Più veloce, molto più rischio' : p === 'safe' ? 'Meno rischi, si perde tempo' : 'Compromesso' })), def: Math.max(0, P3.indexOf(cur)), ttl: 12, hardUntil: X.t + Math.max(2, Math.min(left - 3, 45 * Math.max(1, X.speed / 8))),
      valid: () => (c.done || !c.plan || (c.splits?.length || 0) !== n ? 'settore già concluso' : null),
      resolve: (i) => { const p = P3[i]; if (p !== cur && ev.setLivePace(c, p)) { X.choices[c.key] && (X.choices[c.key].paces = c.plan.paces.slice()); sfx.radio?.(); } } });
  }
}
function skipStage() {
  let g = 0;
  while (!X.ev.allDone() && g++ < 1e5) { const r = X.ev.advance(2); if (r) X.ev.resolveDecision(r, 'b'); }
  X.decision = null; X.hub?.reset(); const el = document.getElementById('decision'); if (el) el.innerHTML = '';
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
  if (mineBest === 0 && !X._cel?.[s.idx]) { (X._cel ||= {})[s.idx] = 1; setTimeout(() => celebrate(80), 100); }
  const b1 = Math.min(...ranking.map((r) => r.s1 ?? 1e9)), b2 = Math.min(...ranking.map((r) => r.s2 ?? 1e9));
  const sp = (t, b) => t == null ? '—' : t === b ? `<span class="t-purple">${fmtLong(t)}</span>` : `+${(t - b).toFixed(1)}`;
  const ov = ev.overall().filter((c) => c.status !== 'out');
  const lead = ov[0], second = ov[1];
  const moments = ev.log.filter((l) => l.stage === s.idx && (l.player || /fuori|cappotta|Guasto|ritirato|fora/i.test(l.text))).slice(0, 7);
  const mine = ev.crews.filter((c) => c.isPlayer && c.status !== 'out');
  return `<div class="rx-res anim-in">
    <div class="panel"><div class="panel-head"><h3>PS${s.idx + 1} ${esc(s.name)} · Tempi</h3>${s.power ? '<span class="chip warn">Power Stage</span>' : ''}</div>
      <table class="tbl small rx-times"><thead><tr><th></th><th></th><th>Equipaggio</th><th class="right">Int. 1</th><th class="right">Int. 2</th><th class="right">Tempo</th><th></th></tr></thead><tbody>${ranking.map((r, i) => { const c = crews[r.key]; return `<tr class="${c.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${teamStripe(c.team)}</td><td>${driverChip(st, ev.driver(c), { size: 22 })}</td><td class="right mono tiny">${sp(r.s1, b1)}</td><td class="right mono tiny">${sp(r.s2, b2)}</td><td class="right mono">${i === 0 ? fmtLong(r.time) : fmtGap(r.time - best)}</td>${s.power && i < 5 ? `<td class="warn">+${5 - i}</td>` : '<td></td>'}</tr>`; }).join('')}</tbody></table></div>
    <div class="col gap16">
      ${lead && second ? `<div class="panel rx-fight"><div class="tiny upper muted">Lotta per la vittoria</div><div class="row between mt8"><div class="rx-f">${driverChip(st, ev.driver(lead), { size: 26 })}<span class="tiny muted">leader</span></div><div class="rx-fgap"><b>${(second.total - lead.total).toFixed(1)}s</b><span class="tiny muted">${ev.finished() ? 'distacco finale' : `${ev.stages.length - ev.stageIdx} ${ev.stages.length - ev.stageIdx === 1 ? 'prova' : 'prove'} al termine`}</span></div><div class="rx-f right">${driverChip(st, ev.driver(second), { size: 26 })}<span class="tiny muted">secondo</span></div></div>
        ${mine.map((c) => { const i = ov.indexOf(c); const a = ov[i - 1], bb = ov[i + 1]; return `<div class="rx-mine mt8"><b>${esc(ev.driver(c).name)}</b> · P${i + 1}${a ? ` · <span class="warn">-${(c.total - a.total).toFixed(1)}s</span> da ${esc(shortName(ev.driver(a).name))}` : ''}${bb ? ` · <span class="good">+${(bb.total - c.total).toFixed(1)}s</span> su ${esc(shortName(ev.driver(bb).name))}` : ''}</div>`; }).join('')}</div>` : ''}
      <div class="panel"><div class="panel-head"><h3>Classifica assoluta</h3></div>${overallTable(st, 12, { before: s.before, int: true })}</div>
      ${moments.length ? `<div class="panel tight"><div class="tiny upper muted mb8">Momenti della prova</div>${moments.map((l) => `<div class="feed-item ${l.player ? 'player' : ''} ${l.kind === 'crash' || l.kind === 'out' ? 'crash' : ''}"><span>${esc(l.text)}</span></div>`).join('')}</div>` : ''}
      ${mine.filter((c) => ev.canRoadside(c)).map((c) => `<div class="panel tight rx-roadside"><div class="tiny upper muted mb8">Trasferimento · riparazione a bordo strada · ${esc(ev.driver(c).name)}</div><div class="small muted mb8">Niente assistenza prima della prossima prova: l’equipaggio può rattoppare <b>un</b> componente con gli attrezzi di bordo (circa −40% di danno). Più il danno è grave, più si rischia il ritardo al controllo orario (10s al minuto).</div><div class="row wrap gap6">${Object.entries(c.damage).filter(([, v]) => v > 0.08).map(([k, v]) => `<button class="btn sm" data-a="roadside" data-key="${c.key}" data-c="${k}">${icon('wrench')} ${DMG[k]} ${Math.round(v * 100)}%</button>`).join('')}</div></div>`).join('')}
      ${hubLogHTML((X.decLog || []).filter((d) => d.stage === s.idx), 'Decisioni della prova')}
      ${ev.hl?.clips.some((c) => c.stage.idx === s.idx) ? `<button class="btn lg" data-a="rally-hl" data-s="${s.idx}">${icon('replay')} Highlights della prova</button>` : ''}
      <button class="btn primary xl" data-a="next">${ev.finished() ? 'Classifica finale' : ev.isServiceAfter(ev.stageIdx - 1) ? 'Parco assistenza' : 'Prossima prova'} ${icon('right')}</button></div>
  </div>`;
}

function serviceMinutes(c, mech, crewLvl) {
  const sel = X.repairs[c.key] || []; const o = X.svc[c.key] || {};
  const rep = sel.reduce((s, k) => s + repairMinutes(c.damage[k], mech, crewLvl), 0);
  const quick = (o.quick || []).filter((k) => !sel.includes(k)).reduce((s, k) => s + quickMinutes(c.damage[k], mech, crewLvl), 0);
  return { base: SERVICE_BASE, rep, quick, setup: o.setup ? SERVICE_SETUP : 0, check: o.check ? SERVICE_CHECK : 0, total: SERVICE_BASE + rep + quick + (o.setup ? SERVICE_SETUP : 0) + (o.check ? SERVICE_CHECK : 0) };
}
function service(st) {
  const ev = X.ev; const t = playerTeam(st);
  const mech = st.staff[t.staff.mechanic]?.rating || 65; const crewLvl = t.facilities.pitcrew;
  const mine = ev.crews.filter((c) => c.isPlayer && c.status !== 'out');
  const next = ev.loopStages(ev.stageIdx);
  X.svc ||= {};
  return `<div class="row between mb16"><div><h2 style="font-style:italic">Parco Assistenza · ${SERVICE_TIME} minuti</h2><div class="small muted">Ogni minuto oltre il controllo orario costa 10 secondi. Cambio gomme e controlli di base: ${SERVICE_BASE} min. Riparazione completa o toppa veloce: decidi tu quanto rischiare nel prossimo giro.</div></div><button class="btn primary lg" data-a="end-service">Chiudi assistenza ${icon('right')}</button></div>
  <div class="rx-svc anim-in">${mine.map((c) => {
    const m = serviceMinutes(c, mech, crewLvl); const sel = X.repairs[c.key] || []; const o = X.svc[c.key] || {};
    const over = Math.max(0, m.total - SERVICE_TIME);
    const seg = (v, cls, lbl) => v ? `<i class="${cls}" style="width:${(v / Math.max(SERVICE_TIME, m.total)) * 100}%" data-tip="${lbl}: ${v} min"></i>` : '';
    return `<div class="panel"><div class="row">${helmetSVG(ev.driver(c).helmet, 40)}<div class="grow"><b style="font-family:var(--display);font-size:19px;text-transform:uppercase">${esc(ev.driver(c).name)}</b><div class="tiny muted">${ev.overall().indexOf(c) + 1}° assoluto${c.retiredLeg ? ' · <span class="warn">rientra con il Super Rally</span>' : ''}</div></div><div class="rx-clock ${over ? 'bad' : m.total > SERVICE_TIME - 5 ? 'warn' : 'good'}"><b>${m.total}</b><span>/ ${SERVICE_TIME} min</span></div></div>
      <div class="rx-budget mt8">${seg(m.base, 'b', 'Gomme e controlli')}${seg(m.rep, 'r', 'Riparazioni')}${seg(m.quick, 'q', 'Toppe veloci')}${seg(m.setup, 's', 'Assetto')}${seg(m.check, 'c', 'Controllo preventivo')}<em style="left:${(SERVICE_TIME / Math.max(SERVICE_TIME, m.total)) * 100}%"></em></div>
      ${over ? `<div class="small bad mt8">Ritardo di ${over} min: penalità di ${over * 10}s</div>` : `<div class="small muted mt8">Margine: ${SERVICE_TIME - m.total} min</div>`}
      <div class="tiny upper muted mt16 mb8">Danni</div>
      <div class="col gap6">${Object.entries(c.damage).map(([k, v]) => { const full = repairMinutes(v, mech, crewLvl), q = quickMinutes(v, mech, crewLvl); const isF = sel.includes(k), isQ = !isF && (o.quick || []).includes(k); return `<div class="rx-dmg"><b>${DMG[k]}</b><div>${bar(v * 100, v > 0.4 ? 'red' : 'gold')}</div>${v > 0.02 ? `<div class="seg"><div class="${!isF && !isQ ? 'on' : ''}" data-a="rep" data-key="${c.key}" data-c="${k}" data-m="none">Lascia</div><div class="${isQ ? 'on' : ''}" data-a="rep" data-key="${c.key}" data-c="${k}" data-m="quick" data-tip="Riparazione di fortuna: il danno scende al 40%">Toppa ${q}'</div><div class="${isF ? 'on' : ''}" data-a="rep" data-key="${c.key}" data-c="${k}" data-m="full">Ripara ${full}'</div></div>` : '<span class="good small right">OK</span>'}</div>`; }).join('')}</div>
      <div class="tiny upper muted mt16 mb8">Lavori extra</div>
      <div class="rx-extra"><div class="opt ${o.setup ? 'sel' : ''}" data-a="svcopt" data-key="${c.key}" data-o="setup"><div class="row between"><b>Rivedi l’assetto</b><span class="chip tiny">+${SERVICE_SETUP} min</span></div><div class="small muted mt8">Fiducia ${Math.round(c.setupQ * 100)}% → ${Math.round(Math.min(0.97, c.setupQ + (0.95 - c.setupQ) * 0.55) * 100)}% per il prossimo giro</div></div>
        <div class="opt ${o.check ? 'sel' : ''}" data-a="svcopt" data-key="${c.key}" data-o="check"><div class="row between"><b>Controllo preventivo</b><span class="chip tiny">+${SERVICE_CHECK} min</span></div><div class="small muted mt8">Dimezza il rischio di guasti meccanici nella prossima prova</div></div></div>
      <div class="row gap6 mt16"><button class="btn sm" data-a="repair-all" data-key="${c.key}">Ripara tutto</button><button class="btn sm ghost" data-a="repair-fit" data-key="${c.key}" data-tip="Scelta dell’ingegnere: il massimo restando nei ${SERVICE_TIME} minuti">${icon('wrench')} Ottimizza per il tempo</button></div></div>`;
  }).join('') || '<div class="panel">Nessun equipaggio in gara.</div>'}
  <div class="panel rx-next"><div class="panel-head"><h3>Prossimo giro</h3></div>${next.map((s) => `<div class="rx-ls"><span class="rx-ls-n">PS${s.idx + 1}</span><b>${esc(s.name)}</b><span class="rx-surf" style="--sc:${SURFACES[s.surface].color}">${SURFACES[s.surface].name}</span><span class="small muted">${s.km} km</span>${wxChip(s, false)}</div>`).join('')}<div class="small muted mt8">Gomme nuove e due scorte a ogni assistenza: le sceglierai prima della prossima prova.</div></div></div>`;
}

function finalView(st) {
  const ev = X.ev;
  const crews = Object.fromEntries(ev.crews.map((c) => [c.key, c]));
  return `<div class="rx-final anim-in"><div class="panel"><div class="panel-head"><h3>Classifica finale</h3></div>${overallTable(st, 20, { int: true })}</div>
  <div class="col gap16"><div class="finish-card" style="padding:24px 34px 18px"><div class="tiny upper muted mt8">Arrivo</div><div class="fc-t">Rally concluso</div></div>
    <div class="panel"><div class="panel-head"><h3>Vincitori di prova</h3></div><div class="rx-sw">${ev.stages.map((s, i) => { const w = crews[s.winner]; return `<div class="${w?.isPlayer ? 'me' : ''}"><span>PS${i + 1}</span><i style="background:${SURFACES[s.surface].color}"></i><b>${w ? esc(shortName(ev.driver(w).name)) : '—'}</b><small>${s.best ? fmtLong(s.best) : ''}</small></div>`; }).join('')}</div></div>
    <div class="panel"><div class="panel-head"><h3>Distacchi prova dopo prova</h3></div>${gapChartSVG(ev)}</div>
    ${ev.hl?.clips.length ? `<button class="btn lg" data-a="rally-hl">${icon('replay')} Highlights del rally</button>` : ''}
    <button class="btn primary xl pulse" data-a="finish-rally">Podio e punti ${icon('right')}</button></div></div>`;
}
// the reel of the whole rally (or of one stage)
function rallyReel(stage = null) {
  const ev = X.ev; if (!ev?.hl) return null;
  const st = S(); const tr = getTrack('rally', st.weekend.trackId);
  if (stage == null) return ev.hl.finalize({ title: tr.name, sub: `Round ${st.round + 1} · Rally` });
  const base = ev.hl.finalize({ title: `${tr.name} · PS${stage + 1}`, sub: ev.stages[stage]?.name || '' }, 0);
  return { ...base, clips: ev.hl.clips.filter((c) => c.stage.idx === stage).sort((a, b) => a.t0 - b.t0) };
}

function speedUI() {
  document.querySelectorAll('#speedbtns .btn').forEach((b) => b.classList.toggle('active', +b.dataset.v === X.speed && !X.paused));
  const p = document.getElementById('btn-pause'); if (p) p.innerHTML = icon(X.paused ? 'play' : 'pause');
}
