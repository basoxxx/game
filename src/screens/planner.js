// Pre-race strategy planner (stops, compounds, pit laps, starting fuel / endurance fuel plan)
// and the in-race strategy panel helpers.
import { icon } from '../ui/icons.js';
import { esc, fmtTime } from '../ui/dom.js';
import { COMPOUNDS, CATEGORIES } from '../data/categories.js';
import { playerTeam } from '../engine/season.js';
import { realLaps, teamBaseLap, driverFactor, SETUP_BIAS, setupBias, weatherForecast } from '../engine/race.js';
import { getTrack } from '../engine/world.js';
import { estimateWearMult, tyreModel } from '../engine/tyres.js';
import { optimise, predictLaps, normalizePlan, pitLaps, fuelSaveLaps, planKey, crossoverPlan, wxLapCost } from '../engine/strategy.js';
import { fuelModel } from '../engine/session.js';
import { tyreBadge } from './common.js';
import { stintBar, degChartSVG, wearError } from './engineer.js';
import { clamp } from '../engine/rng.js';

const DRY = ['soft', 'medium', 'hard'];

export function planCtx(st, tr, laps, team, d, key) {
  const w = st.weekend;
  const bias = SETUP_BIAS[setupBias(st, key, tr)]?.wear ?? 1;
  return { cat: st.category, track: tr, scale: realLaps(st, tr) / laps, wm: estimateWearMult(team, d, w.weather.trackTemp) * (1 + wearError(st)) * bias, pitLoss: (tr.pit || 21) + 2.4, comps: DRY };
}
const mustTwo = (st, w) => circuit(st) && !wxOutlook(st, w).wet; // the forecast decides the plan (the real weather is unknown)
const circuit = (st) => st.category === 'formula' || st.category === 'junior';
// Rain the team expects lap by lap: the forecast, except the start, which everyone can see from the grid.
export function wxRain(st, w, tr) {
  const fc = weatherForecast(st, w, tr).laps.slice(0, w.laps);
  if (fc.length) fc[0] = w.weather.plan[0] || 0;
  return fc;
}
// Weather phases for the race (cached): crossover laps between slicks, intermediates and full wets
export function wxOutlook(st, w, tr = getTrack(st.category, w.trackId)) {
  const rain = wxRain(st, w, tr);
  const k = rain.map((r) => r.toFixed(2)).join(',');
  if (w._wxo?.k === k) return w._wxo;
  const hasInter = (CATEGORIES[st.category]?.compounds || DRY).includes('inter');
  const ctx = { cat: st.category, track: tr, scale: realLaps(st, tr) / w.laps, wm: 1, pitLoss: (tr.pit || 21) + 2.4, comps: DRY };
  const cp = crossoverPlan(ctx, rain, { base: tr.lap, hasInter });
  w._wxo = { k, rain, hasInter, phases: cp.phases, crossovers: cp.crossovers, wet: cp.wet };
  return w._wxo;
}
export function isDryPlan(st, w) { return circuit(st) && !wxOutlook(st, w).wet; }
const FAM = { dry: 'Slick', inter: 'Intermedie', wet: 'Full wet' };

function baseLap(st, tr, team, d, w, key) { return teamBaseLap(st, team, tr) * (1 - (w.cars[key]?.q ?? 0.6) * 0.005) * driverFactor(d, 0, st); }

function wxPlanFor(st, w, tr, e) {
  const team = playerTeam(st); const d = st.drivers[e.driverIds[0]];
  const o = wxOutlook(st, w, tr);
  const ctx = planCtx(st, tr, w.laps, team, d, e.key);
  return crossoverPlan(ctx, o.rain, { base: baseLap(st, tr, team, d, w, e.key), hasInter: o.hasInter, mustTwo: true });
}
export function ensurePlan(st, w, tr, e) {
  const team = playerTeam(st); const d = st.drivers[e.driverIds[0]];
  w.plans ||= {}; w.fuel ||= {}; w.endPlan ||= {}; w.wxPolicy ||= {};
  if (circuit(st) && !isDryPlan(st, w) && (!w.plans[e.key] || !w.plans[e.key].some((s) => s.wx))) {
    const cp = wxPlanFor(st, w, tr, e);
    w.plans[e.key] = cp.stints; w.startTyre[e.key] = cp.stints[0].c;
    w.fuel[e.key] ??= 0.98;
  }
  if (isDryPlan(st, w) && (!w.plans[e.key] || w.plans[e.key].some((s) => s.wx))) {
    const ctx = planCtx(st, tr, w.laps, team, d, e.key);
    const best = optimise(ctx, { L: w.laps, maxStops: 3, mustTwo: mustTwo(st, w) })[0];
    if (best) { w.plans[e.key] = best.stints; w.startTyre[e.key] = best.stints[0].c; }
  }
  w.fuel[e.key] ??= 1.01;
  if (st.category === 'endurance') w.endPlan[e.key] ??= { fuelFrac: 1, tyreEvery: 2, swapEvery: 1, comp: 'medium' };
}

function planSVG(series, laps) {
  const W = 520, H = 150, P = 34;
  const all = series.flatMap((s) => s.pred.laps.map((x) => x.t));
  if (!all.length) return '';
  const lo = Math.min(...all) - 0.2, hi = Math.min(Math.max(...all), lo + 7) + 0.2;
  const X = (l) => P + ((l - 1) / Math.max(1, laps - 1)) * (W - P - 10), Y = (t) => 10 + (1 - (Math.min(t, hi) - lo) / (hi - lo)) * (H - P - 10);
  const grid = [0, 0.5, 1].map((f) => { const t = lo + (hi - lo) * f; return `<line x1="${P}" x2="${W - 10}" y1="${Y(t)}" y2="${Y(t)}" stroke="rgba(255,255,255,0.07)"/><text x="${P - 4}" y="${Y(t) + 3}" fill="#8b95a7" font-size="9.5" text-anchor="end">${fmtTime(t).replace(/^1:/, '1:')}</text>`; }).join('');
  const lines = series.map((s) => {
    const pts = s.pred.laps.map((x) => `${X(x.lap).toFixed(1)},${Y(x.t).toFixed(1)}`).join(' ');
    const dots = s.pred.laps.map((x) => `<circle cx="${X(x.lap).toFixed(1)}" cy="${Y(x.t).toFixed(1)}" r="2.2" fill="${COMPOUNDS[x.c].color}"/>`).join('');
    const pits = s.pred.pits.map((l) => `<line x1="${X(l + 0.5)}" x2="${X(l + 0.5)}" y1="10" y2="${H - P}" stroke="${s.col}" stroke-dasharray="3 4" opacity=".7"/><text x="${X(l + 0.5) + 3}" y="20" fill="${s.col}" font-size="9.5">BOX ${l}</text>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.col}" stroke-width="2" opacity=".9"/>${dots}${pits}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="plan-svg"><rect x="${P}" y="10" width="${W - P - 10}" height="${H - P - 10}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)"/>${grid}${lines}<text x="${(W + P) / 2}" y="${H - 8}" fill="#8b95a7" font-size="10" text-anchor="middle">Tempo sul giro previsto (carburante, degrado, evoluzione pista) · giro 1 → ${laps}</text></svg>`;
}

function wearAtEnd(ctx, s, age0 = 0) {
  const m = tyreModel(ctx.cat, s.c); const life = m.life / (ctx.track.wear * ctx.wm);
  return (age0 + s.laps * ctx.scale * ctx.track.wear * ctx.wm) / life;
}

// Lap-time cost of slicks / intermediates / full wets over the forecast: where the lines cross, the tyre changes
function crossoverSVG(o, base, laps) {
  const W = 520, H = 170, P = 34, B = 30;
  const fams = o.hasInter ? ['dry', 'inter', 'wet'] : ['dry', 'wet'];
  const col = { dry: COMPOUNDS.medium.color, inter: COMPOUNDS.inter?.color || '#2ecc71', wet: COMPOUNDS.wet.color };
  const vals = o.rain.map((r) => Object.fromEntries(fams.map((f) => [f, wxLapCost(f, r, base)])));
  const hi = Math.min(16, Math.max(4, ...vals.map((v) => Math.min(...Object.values(v)) + 4)));
  const X = (l) => P + ((l - 0.5) / laps) * (W - P - 10), Y = (t) => 10 + (Math.min(t, hi) / hi) * (H - B - 10);
  let g = '';
  for (const t of [0, hi / 2, hi]) g += `<line x1="${P}" x2="${W - 10}" y1="${Y(t)}" y2="${Y(t)}" stroke="rgba(255,255,255,0.07)"/><text x="${P - 4}" y="${Y(t) + 3}" fill="#8b95a7" font-size="9.5" text-anchor="end">+${t.toFixed(0)}s</text>`;
  // forecast rain bars
  o.rain.forEach((r, i) => { if (r > 0.03) g += `<rect x="${(X(i + 1) - (W - P - 10) / laps / 2 + 0.5).toFixed(1)}" y="${(H - B - r * 24).toFixed(1)}" width="${Math.max(1, (W - P - 10) / laps - 1).toFixed(1)}" height="${(r * 24).toFixed(1)}" fill="#3aa0ff" opacity=".28"/>`; });
  // best tyre band
  o.phases.forEach((p) => { g += `<rect x="${X(p.from) - (W - P - 10) / laps / 2}" y="${H - B + 3}" width="${(W - P - 10) / laps * p.laps}" height="6" fill="${col[p.f]}"/>`; });
  for (const f of fams) g += `<polyline points="${vals.map((v, i) => `${X(i + 1).toFixed(1)},${Y(v[f]).toFixed(1)}`).join(' ')}" fill="none" stroke="${col[f]}" stroke-width="2.2" ${f === 'wet' ? 'stroke-dasharray="6 3"' : f === 'inter' ? 'stroke-dasharray="2 2"' : ''}/><text x="${W - 8}" y="${Y(vals[vals.length - 1][f]) - 3}" fill="${col[f]}" font-size="10" font-weight="700" text-anchor="end">${FAM[f]}</text>`;
  for (const x of o.crossovers) g += `<line x1="${X(x.lap) - (W - P - 10) / laps / 2}" x2="${X(x.lap) - (W - P - 10) / laps / 2}" y1="10" y2="${H - B + 9}" stroke="#fff" stroke-dasharray="3 3" opacity=".75"/><text x="${X(x.lap) - (W - P - 10) / laps / 2 + 3}" y="20" fill="#fff" font-size="9.5" font-weight="700">G${x.lap} → ${FAM[x.to]}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="plan-svg"><rect x="${P}" y="10" width="${W - P - 10}" height="${H - B - 10}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)"/>${g}<text x="${(W + P) / 2}" y="${H - 6}" fill="#8b95a7" font-size="10" text-anchor="middle">Tempo perso per tipo di gomma con la pioggia prevista (barre blu) · giro 1 → ${laps}</text></svg>`;
}
function wxPhaseText(o) {
  if (!o.crossovers.length) return `${FAM[o.phases[0].f]} per tutta la gara.`;
  return `Via con le ${FAM[o.phases[0].f].toLowerCase()}, ${o.crossovers.map((x) => `al giro <b>${x.lap}</b> ${FAM[x.to].toLowerCase()}`).join(', poi ')}.`;
}
function wxPanel(st, w, tr, entries, q, C) {
  const team = playerTeam(st);
  const o = wxOutlook(st, w, tr);
  const fc = weatherForecast(st, w, tr);
  let html = `<div class="wx-brief mb8"><div class="row gap6">${icon('rain', 'ico', 'style="width:22px;height:22px;flex:none"')}<div><b>Gara bagnata o mista</b><div class="small muted">${wxPhaseText(o)} Previsione affidabile al ${fc.perfect ? 100 : fc.acc}%: in gara il meteo vero può anticipare, ritardare o saltare il cambio.</div></div></div></div>`;
  for (const [ei, e] of entries.entries()) {
    const d = st.drivers[e.driverIds[0]];
    const plan = w.plans[e.key];
    const pol = w.wxPolicy[e.key] || 'auto';
    const sel = w.startTyre[e.key] || plan[0].c;
    const load = w.fuel[e.key];
    const col = ei ? '#ffffff' : team.car.livery.primary;
    const rec = plan[0].c;
    let lap = 1;
    const rows = plan.map((s, i) => { const from = lap; lap += s.laps; const wx = COMPOUNDS[s.c].wet; const prev = plan[i - 1]; const cross = prev && !!COMPOUNDS[prev.c].wet !== wx; return `<div class="wx-stint"><span class="tiny upper muted">Stint ${i + 1}</span>${tyreBadge(s.c)}<b class="small">${COMPOUNDS[s.c].name}</b><span class="small mono muted">G ${from}–${from + s.laps - 1}</span>${i ? `<span class="chip tiny ${cross ? 'info' : ''}">${cross ? 'crossover meteo' : 'sosta pianificata'}</span>` : '<span class="chip tiny">partenza</span>'}</div>`; }).join('');
    html += `<div class="card mt8 plan-card" style="border-left:3px solid ${col}">
      <div class="row"><span class="pos">P${q.grid.indexOf(e.key) + 1}</span><b class="grow drv-name" style="font-size:19px">${esc(d.name)}</b></div>
      <div class="mt8">${stintBar(plan, w.laps)}</div>
      <div class="col gap4 mt8">${rows}</div>
      <div class="ss-lbl">Gomme al via</div><div class="row gap4 wrap">${C.compounds.map((cp) => `<button class="btn sm ${sel === cp ? 'active' : ''}" data-a="start-tyre" data-key="${e.key}" data-c="${cp}">${tyreBadge(cp)} ${COMPOUNDS[cp].name}${cp === rec ? ' ★' : ''}</button>`).join('')}</div>
      ${sel !== rec ? `<div class="tiny warn mt8">L’ingegnere consiglia di partire con le ${COMPOUNDS[rec].name}.</div>` : ''}
      <div class="ss-lbl">Cambi gomme per il meteo</div><div class="seg">${[['auto', 'Automatici (ingegnere)'], ['manual', 'Decido io in gara']].map(([k, n]) => `<div class="${pol === k ? 'on' : ''}" data-a="pl-wxpol" data-key="${e.key}" data-v="${k}">${n}</div>`).join('')}</div>
      <div class="tiny muted mt8">${pol === 'auto' ? 'L’ingegnere chiama il box quando la pioggia vera supera il punto di crossover (alle prime gocce o appena la traiettoria si asciuga): nessuna pausa, nessun giro perso.' : 'Ogni cambio di meteo mette la gara in pausa e scegli tu: puoi anticipare tutti o scommettere sulle slick.'}</div>
      <div class="fuel-row mt8"><span class="tiny upper muted">Benzina al via</span><div class="row gap4"><button class="btn sm" data-a="pl-fuel" data-key="${e.key}" data-d="-0.01">−</button><b class="mono">${Math.round(load * 100)} kg</b><button class="btn sm" data-a="pl-fuel" data-key="${e.key}" data-d="0.01">+</button></div><span class="tiny muted">Sul bagnato si consuma circa il 10% in meno: si può partire più leggeri.</span></div>
    </div>`;
  }
  html += `<div class="mt16">${crossoverSVG(o, tr.lap, w.laps)}</div>`;
  html += `<div class="small muted mt8">Le linee mostrano quanto si perde al giro con ogni gomma: dove si incrociano conviene cambiare. Il cambio costa una sosta (~${Math.round((tr.pit || 21) + 2.4)}s), per questo un breve piovasco a volte si affronta con le slick.</div>`;
  return html;
}

export function plannerPanel(st, w, tr, entries, q, C) {
  const team = playerTeam(st);
  entries.forEach((e) => ensurePlan(st, w, tr, e));
  const dry = isDryPlan(st, w);
  let html = `<div class="panel planner"><div class="panel-head"><h3>Strategia di gara</h3><button class="btn sm ghost" data-a="lessons">${icon('info')} Lezioni</button></div>`;
  const we = Math.abs(wearError(st)); const known = Object.values(w.longRuns || {}).filter(Boolean).length;
  if (dry) {
    const series = [];
    html += `<div class="small muted mb8">${esc(tr.circuit)} · ${w.laps} giri · asfalto ${w.weather.trackTemp}°C · usura tracciato ×${tr.wear}. <span class="${known ? 'good' : 'warn'}">${known ? `Degrado misurato con ${known} long run.` : `Degrado solo stimato (errore fino al ±${Math.round(Math.abs(w.wearErr ?? 0.1) * 100 + 4)}%): fai un long run in prova.`}</span></div>`;
    { const o = wxOutlook(st, w, tr); const wl = o.rain.map((r, i) => (r > 0.12 ? i + 1 : 0)).filter(Boolean);
      if (wl.length) html += `<div class="wx-brief mb8"><div class="row gap6">${icon('rain', 'ico', 'style="width:22px;height:22px;flex:none"')}<div><b>Qualche goccia prevista (giri ${wl[0]}–${wl[wl.length - 1]})</b><div class="small muted">Troppo poca per cambiare gomme secondo l’ingegnere: si resta sulle slick. Se in gara la pioggia aumenta, sarai chiamato a decidere.</div></div></div></div>`; }
    for (const [ei, e] of entries.entries()) {
      const d = st.drivers[e.driverIds[0]];
      const ctx = planCtx(st, tr, w.laps, team, d, e.key);
      const plan = normalizePlan(w.plans[e.key], w.laps);
      const opts = optimise(ctx, { L: w.laps, maxStops: 3, mustTwo: mustTwo(st, w) });
      const best = opts[0];
      const load = w.fuel[e.key];
      const saveLaps = fuelSaveLaps(load, w.laps);
      const base = baseLap(st, tr, team, d, w, e.key);
      const pred = predictLaps(ctx, plan, { base, laps: w.laps, fuelLoad: load, fuelSaveLaps: saveLaps });
      const bestPred = predictLaps(ctx, best.stints, { base, laps: w.laps, fuelLoad: 1.01, fuelSaveLaps: 0 });
      const col = ei ? '#ffffff' : team.car.livery.primary;
      series.push({ pred, col });
      const ns = q.sets?.[e.key];
      const pl = pitLaps(plan);
      const two = new Set(plan.map((s) => s.c)).size >= 2;
      const fm = fuelModel(st, tr);
      const delta = pred.total - bestPred.total;
      const stops = plan.length - 1;
      html += `<div class="card mt8 plan-card" style="border-left:3px solid ${col}">
        <div class="row"><span class="pos">P${q.grid.indexOf(e.key) + 1}</span><b class="grow drv-name" style="font-size:19px">${esc(d.name)}</b>${ns ? `<span class="tiny muted" data-tip="Set nuovi rimasti per la gara">Set nuovi: ${DRY.map((cp) => `${tyreBadge(cp)}<b class="${ns[cp] ? '' : 'bad'}">${ns[cp]}</b>`).join(' ')}</span>` : ''}</div>
        <div class="row mt8 gap6 wrap"><span class="tiny upper muted">Soste</span><div class="seg" style="min-width:150px">${[1, 2, 3].map((n) => `<div class="${stops === n ? 'on' : ''}" data-a="pl-stops" data-key="${e.key}" data-n="${n}">${n}</div>`).join('')}</div><button class="btn sm" data-a="pl-opt" data-key="${e.key}" data-tip="Distribuisce i giri nel modo più veloce con queste soste">${icon('target')} Ottimizza</button><button class="btn sm ghost" data-a="pl-best" data-key="${e.key}" data-tip="Il piano più veloce in assoluto">${icon('star')} Piano dell’ingegnere</button></div>
        <div class="col gap4 mt8">${plan.map((s, i) => { const wr = wearAtEnd(ctx, s); const nth = plan.slice(0, i + 1).filter((x) => x.c === s.c).length; const usedSet = ns && ns[s.c] != null && nth > ns[s.c]; const from = plan.slice(0, i).reduce((a, x) => a + x.laps, 0) + 1; return `<div class="stint-row"><span class="tiny upper muted">Stint ${i + 1}</span><div class="row gap4">${DRY.map((cp) => `<button class="btn sm ${s.c === cp ? 'active' : ''}" style="padding:3px 6px" data-a="pl-comp" data-key="${e.key}" data-i="${i}" data-c="${cp}">${tyreBadge(cp)}</button>`).join('')}</div><span class="small mono">G ${from}–${from + s.laps - 1}${usedSet ? ' <span class="chip warn tiny" data-tip="Set nuovi di questa mescola esauriti: verrà montato un treno usato">usato</span>' : ''}</span><span class="tiny ${wr > 1 ? 'bad' : wr > 0.86 ? 'warn' : 'muted'}" data-tip="Usura gomma a fine stint (oltre il 100% sei nel cliff)">usura ${Math.round(wr * 100)}%</span>${i < plan.length - 1 ? `<div class="row gap4 sr-box"><button class="btn sm" data-a="pl-lap" data-key="${e.key}" data-i="${i}" data-d="-1">−</button><b class="mono">BOX ${pl[i]}</b><button class="btn sm" data-a="pl-lap" data-key="${e.key}" data-i="${i}" data-d="1">+</button></div>` : '<span class="tiny muted sr-box">fino alla bandiera</span>'}</div>`; }).join('')}</div>
        <div class="mt8">${stintBar(plan, w.laps)}</div>
        <div class="row between mt8 small"><span class="muted">Tempo gara previsto <b class="mono" style="color:#fff">${fmtTime(pred.total)}</b></span><span class="${delta < 0.5 ? 'good' : delta < 6 ? 'warn' : 'bad'}">${delta < 0.5 ? 'Piano ottimale' : `+${delta.toFixed(1)}s dal piano migliore`}</span></div>
        ${!two && mustTwo(st, w) ? '<div class="tiny bad mt8">Regola: servono almeno due mescole diverse (altrimenti +10s).</div>' : ''}
        ${!C.refuel ? `<div class="fuel-row mt8"><span class="tiny upper muted">Benzina al via</span><div class="row gap4"><button class="btn sm" data-a="pl-fuel" data-key="${e.key}" data-d="-0.01">−</button><b class="mono">${Math.round(load * 100)} kg</b><button class="btn sm" data-a="pl-fuel" data-key="${e.key}" data-d="0.01">+</button></div><span class="tiny ${saveLaps > 0 ? 'warn' : 'muted'}">${load >= 1 ? `Margine +${((load - 1) * w.laps).toFixed(1)} giri · ${(load - 1) * 3.1 * tr.lap / 90 > 0.005 ? '+' + ((load - 1) * 3.1 * tr.lap / 90).toFixed(2) + 's/giro di zavorra' : 'pieno giusto'}` : `−${((1 - load) * 100).toFixed(0)} kg: più veloce di ${((1 - load) * 3.1 * tr.lap / 90).toFixed(2)}s al giro, ma ~${Math.ceil(saveLaps)} giri di lift &amp; coast (senza safety car)`}</span></div>` : ''}
        <details class="mt8"><summary class="tiny upper muted" style="cursor:pointer">Alternative calcolate</summary><div class="col gap4 mt8">${opts.slice(0, 6).map((o, i) => `<div class="row plan-opt ${planKey(o.stints) === planKey(plan) && o.stints.every((s, j) => s.laps === plan[j]?.laps) ? 'on' : ''}" data-a="pl-pick" data-key="${e.key}" data-i="${i}"><span class="tiny mono" style="width:56px">${i === 0 ? '<b class="good">OTTIMA</b>' : '+' + (o.time - opts[0].time).toFixed(1) + 's'}</span><div class="grow">${stintBar(o.stints, w.laps)}</div><span class="tiny muted" style="width:52px">${o.stints.length - 1} ${o.stints.length === 2 ? 'sosta' : 'soste'}</span></div>`).join('')}</div></details>
      </div>`;
    }
    html += `<div class="mt16">${planSVG(series, w.laps)}</div>`;
    html += `<details class="mt8"><summary class="tiny upper muted" style="cursor:pointer">Curve di degrado delle mescole</summary><div class="mt8">${degChartSVG(st, tr, w.laps, team, st.drivers[entries[0].driverIds[0]])}</div></details>`;
    html += `<div class="small muted mt8">In gara l’ingegnere chiama il box al giro pianificato (puoi disattivarlo). Dal pannello <b>Strategia</b> puoi cambiare mescola, spostare la sosta o passare a più/meno soste in qualsiasi momento.</div>`;
  } else if (C.refuel) {
    // endurance: fuel per stop, tyre double stints, driver rotation
    { const o = wxOutlook(st, w, tr); if (o.wet) html += `<div class="wx-brief mb8"><div class="row gap6">${icon('rain', 'ico', 'style="width:22px;height:22px;flex:none"')}<div><b>Pioggia prevista</b><div class="small muted">${wxPhaseText(o)} Le soste per il meteo si decidono in gara: scegli con cura le gomme al via.</div></div></div></div>`; }
    html += `<div class="small muted mb8">Endurance: un pieno dura circa ${Math.round(2700 / 60)} minuti. Meno benzina per sosta = soste più brevi e auto più leggera, ma più soste. Le gomme possono fare doppio stint.</div>`;
    for (const e of entries) {
      const d = st.drivers[e.driverIds[0]];
      const p = w.endPlan[e.key];
      const sel = w.startTyre[e.key] || (w.weather.plan[0] > 0.2 ? 'wet' : p.comp || 'medium'); w.startTyre[e.key] = sel;
      const tank = 2700 / tr.lap / (realLaps(st, tr) / w.laps);
      const stintL = Math.max(1, tank * p.fuelFrac);
      const stops = Math.max(0, Math.ceil(w.laps / stintL) - 1);
      const stopT = (26 - 14 * (1 - p.fuelFrac)) + (tr.pit || 30);
      html += `<div class="card mt8 plan-card"><div class="row"><span class="pos">P${q.grid.indexOf(e.key) + 1}</span><b class="grow drv-name" style="font-size:19px">${esc(e.driverIds.map((id) => st.drivers[id].name.split(' ').pop()).join(' / '))}</b></div>
        <div class="ss-lbl">Gomme al via</div><div class="row gap4 wrap">${C.compounds.map((cp) => `<button class="btn sm ${sel === cp ? 'active' : ''}" data-a="start-tyre" data-key="${e.key}" data-c="${cp}">${tyreBadge(cp)} ${COMPOUNDS[cp].name}</button>`).join('')}</div>
        <div class="ss-lbl">Benzina per sosta</div><div class="seg">${[0.5, 0.65, 0.8, 1].map((f) => `<div class="${Math.abs(p.fuelFrac - f) < 0.01 ? 'on' : ''}" data-a="pl-end" data-key="${e.key}" data-f="fuelFrac" data-v="${f}">${Math.round(f * 100)}%</div>`).join('')}</div>
        <div class="ss-lbl">Cambio gomme</div><div class="seg">${[[1, 'Ogni sosta'], [2, 'Doppio stint'], [3, 'Triplo stint']].map(([v, n]) => `<div class="${p.tyreEvery === v ? 'on' : ''}" data-a="pl-end" data-key="${e.key}" data-f="tyreEvery" data-v="${v}">${n}</div>`).join('')}</div>
        <div class="ss-lbl">Mescola alle soste</div><div class="row gap4">${DRY.map((cp) => `<button class="btn sm ${p.comp === cp ? 'active' : ''}" data-a="pl-end" data-key="${e.key}" data-f="comp" data-v="${cp}">${tyreBadge(cp)}</button>`).join('')}</div>
        ${e.driverIds.length > 1 ? `<div class="ss-lbl">Cambio pilota</div><div class="seg">${[[1, 'Ogni sosta'], [2, 'Ogni 2 soste'], [3, 'Ogni 3 soste']].map(([v, n]) => `<div class="${p.swapEvery === v ? 'on' : ''}" data-a="pl-end" data-key="${e.key}" data-f="swapEvery" data-v="${v}">${n}</div>`).join('')}</div>` : ''}
        <div class="row between mt8 small"><span class="muted">Stint da ~${stintL.toFixed(1)} giri</span><b>${stops} soste previste · ~${stopT.toFixed(0)}s l’una</b></div>
        ${p.swapEvery >= 3 ? '<div class="tiny warn mt8">Dopo 3 stint di fila il pilota si stanca e rallenta.</div>' : ''}</div>`;
    }
  } else if (circuit(st)) {
    html += wxPanel(st, w, tr, entries, q, C);
  } else {
    html += entries.map((e) => { const d = st.drivers[e.driverIds[0]]; const pos = q.grid.indexOf(e.key) + 1; const sel = w.startTyre[e.key] || (w.weather.plan[0] > 0.55 ? 'wet' : w.weather.plan[0] > 0.2 ? (C.compounds.includes('inter') ? 'inter' : 'wet') : 'medium'); w.startTyre[e.key] = sel; const load = w.fuel[e.key]; return `<div class="card mb8"><div class="row"><span class="pos">P${pos}</span><b class="grow drv-name" style="font-size:19px">${esc(d.name)}</b></div><div class="row gap6 mt8 wrap">${C.compounds.map((cp) => `<button class="btn sm ${sel === cp ? 'active' : ''}" data-a="start-tyre" data-key="${e.key}" data-c="${cp}">${tyreBadge(cp)} ${COMPOUNDS[cp].name}</button>`).join('')}</div><div class="fuel-row mt8"><span class="tiny upper muted">Benzina al via</span><div class="row gap4"><button class="btn sm" data-a="pl-fuel" data-key="${e.key}" data-d="-0.01">−</button><b class="mono">${Math.round(load * 100)} kg</b><button class="btn sm" data-a="pl-fuel" data-key="${e.key}" data-d="0.01">+</button></div><span class="tiny muted">Sul bagnato si consuma meno: un pieno ridotto è meno rischioso.</span></div></div>`; }).join('');
    html += `<div class="small muted">Pioggia prevista: scegli le gomme in base all’intensità (intermedie per pioggia leggera, full wet per diluvio). In gara l’ingegnere ti proporrà quando tornare alle slick.</div>`;
  }
  return html + '</div>';
}

export function plannerActions(App, S, getTrack, buildEntries) {
  const ctxOf = (key) => {
    const st = S(); const w = st.weekend; const tr = getTrack(st.category, w.trackId);
    const e = buildEntries(st).find((x) => x.key === key);
    return { st, w, tr, e, ctx: planCtx(st, tr, w.laps, playerTeam(st), st.drivers[e.driverIds[0]], key) };
  };
  const setPlan = (w, key, plan) => { w.plans[key] = normalizePlan(plan, w.laps); w.startTyre[key] = w.plans[key][0].c; App.refresh(); };
  return {
    'pl-stops'(el) { const { st, w, ctx } = ctxOf(el.dataset.key); const o = optimise(ctx, { L: w.laps, stops: +el.dataset.n, mustTwo: mustTwo(st, w) })[0]; if (o) setPlan(w, el.dataset.key, o.stints); },
    'pl-opt'(el) {
      const { st, w, ctx } = ctxOf(el.dataset.key); const cur = w.plans[el.dataset.key];
      const o = optimise(ctx, { L: w.laps, stops: cur.length - 1, mustTwo: mustTwo(st, w) }).find((x) => planKey(x.stints) === planKey(cur)) || optimise(ctx, { L: w.laps, stops: cur.length - 1, mustTwo: mustTwo(st, w) })[0];
      if (o) setPlan(w, el.dataset.key, o.stints);
    },
    'pl-best'(el) { const { st, w, ctx } = ctxOf(el.dataset.key); const o = optimise(ctx, { L: w.laps, maxStops: 3, mustTwo: mustTwo(st, w) })[0]; if (o) setPlan(w, el.dataset.key, o.stints); },
    'pl-pick'(el) { const { st, w, ctx } = ctxOf(el.dataset.key); const o = optimise(ctx, { L: w.laps, maxStops: 3, mustTwo: mustTwo(st, w) })[+el.dataset.i]; if (o) setPlan(w, el.dataset.key, o.stints); },
    'pl-comp'(el) { const { w } = ctxOf(el.dataset.key); const p = w.plans[el.dataset.key].map((s) => ({ ...s })); p[+el.dataset.i].c = el.dataset.c; setPlan(w, el.dataset.key, p); },
    'pl-lap'(el) {
      const { w } = ctxOf(el.dataset.key); const p = w.plans[el.dataset.key].map((s) => ({ ...s })); const i = +el.dataset.i; const dd = +el.dataset.d;
      if (p[i].laps + dd < 1 || p[i + 1].laps - dd < 1) return;
      p[i].laps += dd; p[i + 1].laps -= dd; setPlan(w, el.dataset.key, p);
    },
    'pl-fuel'(el) { const w = S().weekend; w.fuel[el.dataset.key] = +clamp((w.fuel[el.dataset.key] ?? 1.01) + +el.dataset.d, 0.9, 1.06).toFixed(2); App.refresh(); },
    'pl-wxpol'(el) { const w = S().weekend; (w.wxPolicy ||= {})[el.dataset.key] = el.dataset.v; App.refresh(); },
    'pl-end'(el) { const w = S().weekend; const p = w.endPlan[el.dataset.key]; const f = el.dataset.f; p[f] = f === 'comp' ? el.dataset.v : +el.dataset.v; App.refresh(); },
  };
}

// What a player car takes into the race from the planner: a dry plan, or (wet / mixed race)
// the dry stints before the first weather change plus the crossover policy.
export function racePlan(st, w, key, laps) {
  const p = w.plans?.[key]; if (!p?.length) return { plan: null, wxAuto: false };
  const wx = p.some((s) => COMPOUNDS[s.c].wet);
  const auto = (w.wxPolicy?.[key] || 'auto') === 'auto';
  if (!wx) return { plan: normalizePlan(p.map((x) => ({ c: x.c, laps: x.laps })), laps), wxAuto: auto && !isDryPlan(st, w) };
  const lead = []; for (const s of p) { if (COMPOUNDS[s.c].wet) break; lead.push({ c: s.c, laps: s.laps }); }
  return { plan: lead.length ? normalizePlan(lead, laps) : null, wxAuto: auto, wxPlan: p.map((x) => ({ c: x.c, laps: x.laps })) };
}

// ---------------- IN-RACE STRATEGY PANEL ----------------
export function raceStrategyHTML(sim, c, R) {
  if (c.status !== 'running') return '';
  const adv = sim.advise(c);
  const lapsLeft = Math.max(0, sim.laps - c.dist);
  let html = '';
  if (sim.endurance) {
    const p = c.endPlan || { fuelFrac: 1, tyreEvery: 1, swapEvery: 1, comp: null };
    html += `<div class="tiny upper muted mt8 mb8">Piano soste endurance</div>
      <div class="ss-lbl">Benzina alla prossima sosta</div><div class="seg">${[0.5, 0.65, 0.8, 1].map((f) => `<div class="${Math.abs((p.fuelFrac ?? 1) - f) < 0.01 ? 'on' : ''}" data-a="rs-end" data-key="${c.key}" data-f="fuelFrac" data-v="${f}">${Math.round(f * 100)}%</div>`).join('')}</div>
      <div class="ss-lbl">Gomme</div><div class="seg">${[[1, 'Ogni sosta'], [2, 'Doppio stint'], [3, 'Triplo']].map(([v, n]) => `<div class="${(p.tyreEvery || 1) === v ? 'on' : ''}" data-a="rs-end" data-key="${c.key}" data-f="tyreEvery" data-v="${v}">${n}</div>`).join('')}</div>
      ${c.driverIds.length > 1 ? `<div class="ss-lbl">Cambio pilota</div><div class="seg">${[[1, 'Ogni sosta'], [2, 'Ogni 2'], [3, 'Ogni 3']].map(([v, n]) => `<div class="${(p.swapEvery || 1) === v ? 'on' : ''}" data-a="rs-end" data-key="${c.key}" data-f="swapEvery" data-v="${v}">${n}</div>`).join('')}</div>` : ''}
      <div class="tiny muted mt8">Prossima sosta tra ~${Math.max(0, c.fuel - 1).toFixed(1)} giri (benzina).</div>`;
  } else if (c.plan && !COMPOUNDS[c.tyre].wet) {
    const pl = pitLaps(c.plan);
    const next = c.plan[c.planIdx + 1];
    const tgt = pl[c.planIdx];
    const marker = (c.dist / sim.laps) * 100;
    html += `<div class="tiny upper muted mt8 mb8">Piano gara</div><div class="rs-bar">${stintBar(c.plan, sim.laps)}<i style="left:${Math.min(100, marker).toFixed(1)}%"></i></div>`;
    if (next) {
      const inL = tgt - c.lap;
      html += `<div class="ss-step mt8"><button class="btn sm" data-a="rs-lap" data-key="${c.key}" data-d="-1" data-tip="Anticipa la sosta di un giro">−</button><div class="grow"><b>Box al giro ${tgt}</b> <span class="muted">· ${inL <= 0 ? 'questo giro' : `tra ${inL} ${inL === 1 ? 'giro' : 'giri'}`}</span></div><button class="btn sm" data-a="rs-lap" data-key="${c.key}" data-d="1" data-tip="Posticipa la sosta di un giro">+</button></div>
        <div class="row gap4 mt8"><span class="tiny muted" style="width:70px">Mescola</span>${sim.C.compounds.filter((x) => !COMPOUNDS[x].wet).map((cp) => `<button class="btn sm ${next.c === cp ? 'active' : ''}" style="padding:3px 6px" data-a="rs-comp" data-key="${c.key}" data-c="${cp}">${tyreBadge(cp)}</button>`).join('')}<span class="grow"></span><span class="tiny muted">Box auto</span><button class="btn sm ${c.planAuto !== false ? 'active' : ''}" data-a="rs-auto" data-key="${c.key}" data-tip="L’ingegnere chiama il box al giro pianificato">${c.planAuto !== false ? 'ON' : 'OFF'}</button></div>`;
    } else html += `<div class="small muted mt8">Ultimo stint: ${COMPOUNDS[c.tyre].name} fino alla bandiera (${lapsLeft.toFixed(1)} giri).</div>`;
    const rem = c.plan.length - 1 - c.planIdx;
    html += `<div class="row gap4 mt8"><span class="tiny muted" style="width:70px">Soste rim.</span><div class="seg grow">${[0, 1, 2, 3].map((n) => `<div class="${rem === n ? 'on' : ''}" data-a="rs-stops" data-key="${c.key}" data-n="${n}">${n}</div>`).join('')}</div></div>`;
  } else if (!COMPOUNDS[c.tyre].wet) {
    html += `<div class="small muted mt8">Nessun piano attivo.</div><button class="btn sm mt8" style="width:100%" data-a="rs-stops" data-key="${c.key}" data-n="-1">${icon('target')} Calcola il piano migliore da qui</button>`;
  } else html += `<div class="small muted mt8">Gomme da bagnato: ${c.wxAuto ? 'l’ingegnere chiamerà il box per le slick appena la pista si asciuga.' : 'quando la pista si asciuga deciderai tu quando tornare alle slick.'}</div>`;
  if (!sim.endurance) html += `<div class="row between mt8 small"><span class="muted" data-tip="Con il crossover automatico l’ingegnere cambia gomme (slick, intermedie, bagnato) seguendo la pioggia reale">Crossover meteo automatico</span><button class="btn sm ${c.wxAuto ? 'active' : ''}" data-a="rs-wx" data-key="${c.key}">${c.wxAuto ? 'ON' : 'OFF'}</button></div>`;
  // crew & fuel
  html += `<div class="ss-lbl">Istruzioni meccanici</div><div class="seg">${[['normal', 'Sosta normale'], ['fast', 'Cambio rapido']].map(([k, n]) => `<div class="${(c.crew || 'normal') === k ? 'on ' + (k === 'fast' ? 'push' : '') : ''}" data-a="rs-crew" data-key="${c.key}" data-v="${k}" data-tip="${k === 'fast' ? 'Circa 0,3s più veloce, ma più rischio di dado lento e rilascio non sicuro' : 'Sosta sicura'}">${n}</div>`).join('')}</div>`;
  if (c.damage > 0.05) html += `<div class="row between mt8 small"><span class="bad">Danni +${c.damage.toFixed(1)}s/giro</span><button class="btn sm ${c.repair !== false ? 'active' : ''}" data-a="rs-repair" data-key="${c.key}" data-tip="Cambio ala/riparazione alla prossima sosta (+${(c.damage * 12).toFixed(0)}s)">${c.repair !== false ? 'Ripara ala: SÌ' : 'Ripara ala: NO'}</button></div>`;
  if (!sim.endurance) {
    const m = sim.fuelMargin(c);
    html += `<div class="row mt8">${icon('fuel', 'ico', 'style="width:16px"')}<div class="grow"><div class="row between tiny"><span>Benzina ${Math.round(Math.max(0, c.fuel) * 100)} kg</span><span class="${m < 0 ? 'bad' : m < 0.4 ? 'warn' : 'good'}">${m >= 0 ? '+' : ''}${m.toFixed(1)} giri</span></div></div><button class="btn sm ${c.fuelSave ? 'active' : ''}" data-a="rs-lift" data-key="${c.key}" data-tip="Lift &amp; coast: −12% di consumo, circa 0,4s più lento al giro">Lift &amp; coast ${c.fuelSave ? 'ON' : 'OFF'}</button></div>`;
  }
  html += forecastHTML(sim, c);
  html += adviceHTML(adv, c);
  return html;
}
// live strategy tools: tyre life with its uncertainty, reliability to the flag, what the rivals around are likely to do
export function forecastHTML(sim, c) {
  if (c.status !== 'running') return '';
  let h = '';
  const fc = sim.tyreForecast?.(c);
  if (fc) {
    const left = Math.max(0, sim.laps - c.dist);
    const pct = (x) => Math.max(0, Math.min(100, (x / Math.max(left, fc.hi, 1)) * 100));
    h += `<div class="ss-lbl" data-tip="Giri prima che il set sia finito al ritmo attuale. La fascia è l’incertezza: si stringe man mano che lo stint mostra il degrado reale; spingere o gomme fuori temperatura la accorciano">Vita gomme stimata</div>
      <div class="rs-fc"><div class="rs-fc-bar"><i class="band" style="left:${pct(fc.lo).toFixed(1)}%;width:${(pct(fc.hi) - pct(fc.lo)).toFixed(1)}%"></i><i class="mid" style="left:${pct(fc.laps).toFixed(1)}%"></i><i class="flag" style="left:${pct(left).toFixed(1)}%"></i></div>
      <div class="row between tiny"><span><b>~${Math.round(fc.laps)} giri</b> <span class="muted">(${fc.lo}–${fc.hi})</span></span><span class="${fc.toFlag ? 'good' : fc.lo < 2 ? 'bad' : 'muted'}">${fc.toFlag ? 'arrivano in fondo' : `ne mancano ${Math.ceil(left)}`}</span></div></div>`;
  }
  const rl = sim.reliability?.(c);
  if (rl) h += `<div class="row between tiny mt8" data-tip="Probabilità di ritiro per guasto da qui alla bandiera, con mappa motore, ritmo e usura dei componenti attuali. La mappa Risparmio la riduce"><span class="muted">Rischio guasto al traguardo</span><span class="${rl.risk > 0.12 ? 'bad' : rl.risk > 0.06 ? 'warn' : 'good'}">${(rl.risk * 100).toFixed(rl.risk < 0.1 ? 1 : 0)}%${c.eng !== 'low' ? ` <span class="muted">(Risparmio ${(rl.nurse * 100).toFixed(1)}%)</span>` : ''}</span></div>`;
  const rv = sim.rivalGuess?.(c, 2) || [];
  if (rv.length && !sim.endurance) {
    h += `<div class="ss-lbl" data-tip="Quello che il muretto vede dei rivali vicini: gomme, giri dello stint e sosta probabile (stima: il loro piano è segreto). Ultima colonna: il loro ultimo giro rispetto al tuo">Rivali vicini · strategia probabile</div><div class="rs-riv">${rv.map((x) => `<div class="rs-riv-row"><span class="mono">P${x.pos}</span><span class="grow ell">${esc(x.name.split(' ').pop())}</span><span class="mono">${x.gap > 0 ? '-' : '+'}${Math.abs(x.gap).toFixed(1)}s</span><span class="mono">${COMPOUNDS[x.tyre].short}·${x.age}</span><span class="mono ${x.stopIn != null && x.stopIn <= 2 ? 'warn' : 'muted'}">${x.stopIn == null ? 'no stop?' : x.stopIn <= 0 ? 'box ora?' : `box g.${x.stopLap}?`}</span><span class="mono ${x.pace == null ? 'muted' : x.pace < 0 ? 'bad' : 'good'}">${x.pace == null ? '' : (x.pace > 0 ? '+' : '') + x.pace.toFixed(1)}</span></div>`).join('')}</div>`;
  }
  return h;
}
export function adviceHTML(adv, c, compact = false) {
  if (!adv) return '';
  return `<div class="rs-adv ${adv.urgent ? 'urgent' : ''} mt8"><div class="row gap6">${icon('radio', 'ico', 'style="width:14px;flex:none"')}<span class="${compact ? 'tiny' : 'small'} grow">${esc(adv.text)}</span></div>${adv.act ? `<button class="btn sm ${adv.urgent ? 'primary' : 'team'} mt8" style="width:100%" data-a="rs-accept" data-key="${c.key}">${icon('check')} Accetta consiglio</button>` : ''}</div>`;
}
