// Race-engineer tools: strategy planner, telemetry charts, lap-time breakdown and lessons
import { App } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, fmtTime } from '../ui/dom.js';
import { COMPOUNDS } from '../data/categories.js';
import { strategyOptions, estimateWearMult, tyreModel, degPenalty } from '../engine/tyres.js';
import { realLaps } from '../engine/race.js';
import { tyreBadge } from './common.js';

// estimation error on tyre wear unless measured with a long run in practice
export function wearError(st) {
  const w = st.weekend; if (!w) return 0;
  if (w.wearErr == null) w.wearErr = (Math.random() - 0.5) * 0.32;
  const known = Object.values(w.longRuns || {}).filter(Boolean).length;
  return w.wearErr * Math.max(0, 1 - known * 0.5);
}
export function planOptions(st, tr, laps, team, driver, trackTemp) {
  const scale = realLaps(st, tr) / laps;
  return strategyOptions(st.category, tr, laps, scale, estimateWearMult(team, driver, trackTemp) * (1 + wearError(st)), tr.pit || 21).slice(0, 5);
}

export function stintBar(stints, total) {
  return `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid var(--line)">${stints.map((s) => `<div title="${COMPOUNDS[s.c].name} · ${s.laps} giri" style="flex:${s.laps};background:${COMPOUNDS[s.c].color};color:${s.c === 'hard' || s.c === 'medium' ? '#111' : '#fff'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border-right:2px solid #000">${COMPOUNDS[s.c].short} ${s.laps}</div>`).join('')}</div>`;
}

// Degradation curves chart (SVG) for the planner
export function degChartSVG(st, tr, laps, team, driver) {
  const scale = realLaps(st, tr) / laps;
  const wm = estimateWearMult(team, driver) * tr.wear * (1 + wearError(st));
  const W = 460, H = 170, P = 30;
  const comps = ['soft', 'medium', 'hard'];
  const maxL = laps;
  let maxY = 0;
  const series = comps.map((c) => {
    const m = tyreModel(st.category, c); const life = m.life / wm;
    const pts = [];
    for (let n = 0; n <= maxL; n++) { const y = (m.pace + degPenalty(m, n * scale, life)) * tr.lap / 90; pts.push(y); maxY = Math.max(maxY, Math.min(y, 4)); }
    return { c, pts, life: life / scale };
  });
  const minY = -1;
  maxY = Math.min(4, maxY);
  const X = (n) => P + (n / maxL) * (W - P - 10), Y = (v) => H - P - ((Math.min(v, maxY) - minY) / (maxY - minY)) * (H - P - 10);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><rect x="${P}" y="10" width="${W - P - 10}" height="${H - P - 10}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)"/>
    ${[0, 1, 2, 3].map((v) => `<line x1="${P}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,0.06)"/><text x="${P - 6}" y="${Y(v) + 4}" fill="#8b95a7" font-size="10" text-anchor="end">+${v}s</text>`).join('')}
    ${series.map((s) => `<polyline fill="none" stroke="${COMPOUNDS[s.c].color}" stroke-width="2.5" points="${s.pts.map((v, n) => `${X(n)},${Y(v)}`).join(' ')}"/>${s.life < maxL ? `<line x1="${X(s.life * 0.86)}" x2="${X(s.life * 0.86)}" y1="10" y2="${H - P}" stroke="${COMPOUNDS[s.c].color}" stroke-dasharray="3 4" opacity="0.6"/>` : ''}`).join('')}
    <text x="${W / 2}" y="${H - 6}" fill="#8b95a7" font-size="10" text-anchor="middle">Giri di stint → (linee tratteggiate: inizio del "cliff")</text></svg>`;
}

export function drawTelemetry(cv, sim, keys, colors) {
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, P = 38;
  ctx.clearRect(0, 0, W, H);
  const all = keys.flatMap((k) => (sim.history[k] || []).filter((h) => !h.sc && h.lap > 1).map((h) => h.time));
  if (all.length < 2) { ctx.fillStyle = '#8b95a7'; ctx.font = '13px Titillium Web'; ctx.fillText('La telemetria apparirà dopo i primi giri…', P, H / 2); return; }
  all.sort((a, b) => a - b);
  const lo = all[0] - 0.3, hi = Math.min(all[Math.floor(all.length * 0.92)] + 0.6, all[0] + 6);
  const X = (lap) => P + ((lap - 1) / Math.max(1, sim.laps - 1)) * (W - P - 10);
  const Y = (t) => 8 + (1 - (Math.min(t, hi) - lo) / (hi - lo)) * (H - 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.fillStyle = '#5a6476'; ctx.font = '10px Titillium Web'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const t = lo + (hi - lo) * (i / 4); const y = Y(t); ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - 10, y); ctx.stroke(); ctx.fillText(fmtTime(t), P - 4, y + 3); }
  keys.forEach((k, i) => {
    const h = (sim.history[k] || []).filter((x) => x.lap > 1);
    ctx.strokeStyle = colors[i]; ctx.lineWidth = 2; ctx.beginPath();
    h.forEach((p, j) => { const x = X(p.lap), y = Y(p.time); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    for (const p of h) { ctx.fillStyle = COMPOUNDS[p.tyre]?.color || '#fff'; ctx.beginPath(); ctx.arc(X(p.lap), Y(p.time), 2.6, 0, 7); ctx.fill(); }
  });
  ctx.textAlign = 'left'; ctx.fillStyle = '#8b95a7'; ctx.fillText('Tempi sul giro (punti = mescola)', P, H - 6);
}

export function breakdownHTML(sim, c) {
  if (!c || c.status !== 'running') return '<div class="muted small">Seleziona un’auto in gara.</div>';
  const b = sim.lapBreakdown(c);
  const rows = [
    ['Passo base (auto + pilota + assetto)', b.base, 'Dalla fisica del tracciato: carico, potenza, grip meccanico.'],
    ['Mescola', b.compound, 'Le morbide sono più veloci ma durano meno.'],
    ['Degrado gomme', b.deg, `Età gomma: ${c.age.toFixed(1)} giri reali · usura ${Math.round(c.wear * 100)}%`],
    ['Temperatura gomme', b.temp, `${Math.round(c.temp)}°C · finestra ideale ${tyreModel(sim.cat, c.tyre).win}°C ±6`],
    ['Carburante', b.fuel, 'Più carburante = più peso (≈0,03 s/kg).'],
    ['Lift & coast', b.lift || 0, 'Risparmio carburante: si alza il piede prima delle staccate.'],
    ['Evoluzione pista', b.evo, 'La gomma depositata aumenta il grip.'],
    ['Meteo', b.weather, ''],
    ['Ritmo pilota', b.mode, 'Attacco: più veloce ma scalda e consuma le gomme.'],
    ['Aria (DRS / scia sporca)', b.air, c.drs ? 'DRS attivo: entro 1 secondo.' : c.dirty ? 'Aria sporca: perdita di carico in curva.' : 'Aria pulita.'],
    ['Energia (ERS)', b.ers || 0, c.ersMode === 'deploy' ? 'Override: energia elettrica extra.' : c.ersMode === 'harvest' ? 'Ricarica: si recupera energia in frenata, si perde tempo.' : 'Bilanciato.'],
    ['Danni', b.damage, ''],
  ].filter((r) => Math.abs(r[1]) > 0.004 || r[0].startsWith('Passo'));
  const total = Object.values(b).reduce((s, v) => s + v, 0);
  return `<table class="tbl small"><tbody>${rows.map(([n, v, h]) => `<tr title="${esc(h)}"><td>${n}${h ? `<div class="tiny muted">${esc(h)}</div>` : ''}</td><td class="right mono ${n.startsWith('Passo') ? '' : v > 0 ? 'bad' : 'good'}">${n.startsWith('Passo') ? fmtTime(v) : (v > 0 ? '+' : '') + v.toFixed(3)}</td></tr>`).join('')}<tr><td><b>Giro previsto</b></td><td class="right mono"><b>${fmtTime(total)}</b></td></tr></tbody></table>`;
}

export const LESSONS = [
  { t: 'Degrado e "cliff"', b: 'Ogni giro la gomma perde qualche centesimo. Superata circa l’85% della sua vita, il degrado esplode (cliff): si perdono secondi interi. Fermati PRIMA del cliff: un giro oltre può costare più di una sosta.' },
  { t: 'Undercut', b: 'Fermarsi un giro prima del rivale: con gomme nuove giri molto più veloce mentre lui è ancora su gomme usurate. Funziona quando il degrado è alto e la differenza gomme nuove/usate è grande.' },
  { t: 'Overcut', b: 'Restare fuori più a lungo del rivale: funziona quando le gomme nuove faticano a scaldarsi (giro di uscita lento) o quando sei in aria pulita mentre lui rientra nel traffico.' },
  { t: 'Finestra di temperatura', b: 'Ogni mescola lavora in una finestra (soft più fredda, hard più calda). Fuori finestra perdi grip e consumi di più. In Attacco le gomme si scaldano, in Gestione si raffreddano; con safety car si raffreddano molto.' },
  { t: 'Effetto carburante', b: 'A inizio gara la vettura pesa circa 100 kg in più: ogni chilo vale circa 3 centesimi al giro. I tempi migliorano naturalmente man mano che il serbatoio si svuota.' },
  { t: 'Safety car e VSC', b: 'In regime di safety car il pit stop costa circa metà del tempo perso normalmente (VSC circa il 65%). È spesso il momento ideale per fermarsi: un "pit stop gratis".' },
  { t: 'Aria sporca e DRS', b: 'Seguire da vicino un’altra auto riduce il carico aerodinamico (aria sporca) e rende difficile restare attaccati. Entro 1 secondo però si apre il DRS sul rettilineo, che aiuta il sorpasso.' },
  { t: 'Assetto: carico vs velocità', b: 'Più ala = più velocità in curva ma meno in rettilineo. Monza vuole poco carico, Monaco e l’Ungheria il massimo. La sensibilità del tracciato ti dice quale componente conta di più.' },
  { t: 'Regola delle due mescole', b: 'In una gara asciutta devi usare almeno due mescole diverse da asciutto. Se non lo fai ricevi 10 secondi di penalità.' },
  { t: 'Energia: ERS e Override', b: 'La batteria ibrida si scarica in Override (circa un terzo di carica a giro) e regala circa 3 decimi al giro e più possibilità di sorpasso. In Ricarica perdi qualche decimo ma ti prepari all’attacco. Usala per attaccare entro 1 secondo o per difenderti.' },
  { t: 'Ordini di scuderia', b: 'Mantenere le posizioni evita che i tuoi piloti si danneggino a vicenda. Lo scambio fa passare il pilota più veloce, ma chi cede si arrabbia. Il morale influisce sulle prestazioni.' },
  { t: 'Endurance: stint e piloti', b: 'Nelle gare di durata il serbatoio dura circa 45 minuti. Le gomme possono fare doppio stint. Dopo 3 stint di fila il pilota si stanca e rallenta: alterna i piloti!' },
];

export function openLessons() {
  App.modal(`<div class="tiny upper muted" style="letter-spacing:.3em">Accademia dell’ingegnere di pista</div><h2>Lezioni di strategia</h2>
  <div class="col gap6 mt16">${LESSONS.map((l, i) => `<details class="card" ${i === 0 ? 'open' : ''}><summary style="cursor:pointer;font-weight:700">${icon('info', 'ico', 'style="width:14px;vertical-align:-2px"')} ${l.t}</summary><div class="small muted mt8" style="line-height:1.6">${l.b}</div></details>`).join('')}</div>
  <div class="row mt16" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Chiudi</button></div>`, {}, 'wide');
}
