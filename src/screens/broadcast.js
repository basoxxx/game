// TV-broadcast layer for circuit races: lower-third graphics, interval tracker,
// live strategy chart, live championship and the post-race analysis (lap chart, gaps, stints, pace).
import '../styles/broadcast.css';
import { esc, fmtTime } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { COMPOUNDS } from '../data/categories.js';
import { tyreBadge, teamStripe } from './common.js';
import { standings, pointsFor } from '../engine/season.js';

const short3 = (n) => { const p = String(n).split(' '); return (p[p.length - 1] || n).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); };
const lastName = (n) => { const p = String(n).split(' '); return p.slice(1).join(' ') || n; };
const R3D = () => !!window.__race?.r3d;
const PRIO = { sc: 3, vsc: 3, issue: 3, night: 3, wxcall: 2, lead: 2, restart: 2, weather: 2, retire: 2, fastest: 1, pit: 1, pass: 1 };

// ---------------- LOWER THIRDS ----------------
export function tvUpdate(sim, R) {
  const el = document.getElementById('tvg'); if (!el || !sim) return;
  R.tvN ??= 0; R.tvQ ||= [];
  const mineKeys = new Set(sim.cars.filter((c) => c.isPlayer).map((c) => c.key));
  for (const g of sim.tv) {
    if (g.id <= R.tvN) continue;
    R.tvN = g.id;
    const mine = mineKeys.has(g.key) || mineKeys.has(g.other);
    if (g.kind === 'pass' && !mine && g.pos > 3) continue;
    if (g.kind === 'pit' && !mine && g.pos > 5) continue;
    if (g.kind === 'fastest' && !mine && sim.time - g.t > 2 && R.tvQ.length) continue;
    R.tvQ.push({ ...g, mine, prio: (PRIO[g.kind] || 1) + (mine ? 2 : 0) });
  }
  // keep the queue short when the race runs fast: drop stale, low-priority items first
  while (R.tvQ.length > 3) { let k = 0; R.tvQ.forEach((x, i) => { if (x.prio < R.tvQ[k].prio) k = i; }); R.tvQ.splice(k, 1); }
  const now = performance.now();
  if (R.tvCur && now < R.tvCur.until) return;
  if (R.tvCur) { el.querySelector('.tvg')?.classList.add('out'); R.tvCur = null; }
  const g = R.tvQ.shift(); if (!g) return;
  const html = tvHTML(sim, g); if (!html) return;
  R.tvCur = { g, until: now + (g.prio >= 3 ? 4200 : 3200) };
  el.innerHTML = html;
}
function carBits(sim, key) {
  const c = sim.cars.find((x) => x.key === key); if (!c) return null;
  return { c, d: sim.driver(c), col: c.team.car.livery.primary };
}
function tvHTML(sim, g) {
  const a = g.key ? carBits(sim, g.key) : null;
  const who = (x) => x ? `<span class="tvg-car" style="--tc:${x.col}"><i></i><b>${esc(lastName(x.d.name))}</b><small>${esc(x.c.team.short || x.c.team.name)}</small></span>` : '';
  const wrap = (cls, tag, body, col) => `<div class="tvg ${cls}${g.mine ? ' mine' : ''}" style="--gc:${col || 'var(--accent)'}"><span class="tvg-tag">${tag}</span>${body}</div>`;
  switch (g.kind) {
    case 'pass': { const b = carBits(sim, g.other); return wrap('pass', 'Sorpasso', `<span class="tvg-pos">P${g.pos}</span>${who(a)}<span class="tvg-on">su</span>${who(b)}${g.err ? '<em class="tvg-flag err">Errore</em>' : g.drs ? '<em class="tvg-flag drs">DRS</em>' : g.ers ? '<em class="tvg-flag ers">Override</em>' : ''}${R3D() && g.mine ? '<em class="tvg-flag rp">R · Replay</em>' : ''}`, a?.col); }
    case 'fastest': return wrap('fastest', 'Giro più veloce', `${who(a)}<span class="tvg-big purple">${fmtTime(g.time)}</span>`, 'var(--purple)');
    case 'pit': return wrap('pit', 'Pit stop', `<span class="tvg-pos">P${g.pos}</span>${who(a)}<span class="tvg-tyres">${tyreBadge(g.from)}${g.to ? `<span class="tvg-arrow">›</span>${tyreBadge(g.to)}` : ''}</span><span class="tvg-big ${g.stat < (sim.endurance ? 27 : 2.6) ? 'good' : g.stat < (sim.endurance ? 32 : 3.6) ? 'warn' : 'bad'}">${g.stat.toFixed(2)}<small>s</small></span>`, a?.col);
    case 'retire': return wrap('retire', g.title || 'Ritiro', `${who(a)}<span class="tvg-txt">${esc(String(g.text || '').split(' · ').slice(1).join(' · '))}</span>`, 'var(--bad)');
    case 'lead': return wrap('lead', 'Nuovo leader', `<span class="tvg-pos p1">P1</span>${who(a)}`, a?.col);
    case 'issue': return wrap('issue', 'Problema tecnico', `${g.pos ? `<span class="tvg-pos">P${g.pos}</span>` : ''}${who(a)}<span class="tvg-txt">${esc(g.title)}</span>${g.choice ? `<em class="tvg-flag call">${esc(g.choice)}</em>` : ''}`, 'var(--warn)');
    case 'wxcall': return wrap('wxcall', g.first ? (g.toWet ? 'Primo sul bagnato' : 'Primo sulle slick') : 'Scelta meteo', `<span class="tvg-pos">P${g.pos}</span>${who(a)}<span class="tvg-tyres">${tyreBadge(g.from)}<span class="tvg-arrow">›</span>${tyreBadge(g.to)}</span>${g.first ? '<em class="tvg-flag err">Scommessa</em>' : ''}`, g.toWet ? 'var(--info)' : 'var(--gold)');
    case 'sc': case 'vsc': return wrap('sc', g.title, `<span class="tvg-txt">${esc(g.text)}</span>`, '#ffd23a');
    case 'restart': return wrap('restart', g.title, `<span class="tvg-txt">${esc(g.text)}</span>`, 'var(--good)');
    case 'night': return wrap('weather', g.title, `${icon(g.title === 'Alba' ? 'sun' : 'moon', 'ico', 'style="width:18px;height:18px"')}<span class="tvg-txt">${esc(g.text)}</span>`, g.title === 'Alba' ? 'var(--gold)' : '#7c8cff');
    case 'weather': return wrap('weather', g.title, `${icon('rain', 'ico', 'style="width:18px;height:18px"')}<span class="tvg-txt">${esc(g.text)}</span>`, 'var(--info)');
  }
  return '';
}

// ---------------- INTERVAL TRACKER (battle forecast) ----------------
export function trackerUpdate(sim, R) {
  const el = document.getElementById('tvtrack'); if (!el || !sim) return;
  const c = sim.cars.find((x) => x.key === R.focus);
  const off = () => { if (el.innerHTML) el.innerHTML = ''; };
  if (!c || c.status !== 'running' || sim.sc || sim.vsc || c.inPit > 0 || c.dist < 0.5) return off();
  const cls = sim.classification(); const i = cls.indexOf(c); const a = cls[i - 1];
  if (!a || a.status !== 'running' || a.inPit > 0) return off();
  const gap = (a.dist - c.dist) * sim.track.lap;
  R.ivh ||= {};
  const pk = a.key + '>' + c.key;
  let h = R.ivh[c.key];
  if (!h || h.pk !== pk) h = R.ivh[c.key] = { pk, pts: [] };
  const lap = Math.floor(c.dist);
  if (!h.pts.length || h.pts[h.pts.length - 1].lap !== lap) h.pts.push({ lap, v: gap }); else h.pts[h.pts.length - 1].v = gap;
  if (h.pts.length > 8) h.pts.shift();
  if (gap > 6) return off();
  const n = Math.min(3, h.pts.length - 1);
  const rate = n ? (h.pts[h.pts.length - 1 - n].v - gap) / n : 0; // s gained per lap
  const da = sim.driver(a), dc = sim.driver(c);
  const lapsLeft = sim.laps - c.dist;
  let verdict, cls2 = '';
  if (gap < 1) { verdict = c.drs ? 'In zona DRS: attacco possibile' : 'Entro un secondo: pressione massima'; cls2 = 'hot'; }
  else if (rate > 0.04) {
    const laps = (gap - 0.9) / rate;
    if (laps < lapsLeft) { verdict = `Aggancio previsto in ${Math.max(1, Math.round(laps))} ${Math.round(laps) <= 1 ? 'giro' : 'giri'} · giro ${Math.min(sim.laps, lap + 1 + Math.max(1, Math.round(laps)))}`; cls2 = 'warm'; }
    else verdict = `Recupera ${rate.toFixed(2)}s/giro, ma mancano solo ${lapsLeft.toFixed(0)} giri`;
  } else if (rate < -0.04) verdict = `${esc(lastName(da.name))} allunga di ${(-rate).toFixed(2)}s al giro`;
  else verdict = n ? 'Distacco stabile' : 'Rilevamento del passo in corso…';
  const pts = h.pts.map((p) => p.v);
  const mx = Math.max(1.2, ...pts), W = 120, H = 30;
  const poly = pts.map((v, k) => `${(k / Math.max(1, pts.length - 1) * (W - 4) + 2).toFixed(1)},${(2 + (v / mx) * (H - 4)).toFixed(1)}`).join(' ');
  const one = (2 + (1 / mx) * (H - 4)).toFixed(1);
  const side = (x, d) => `<div class="ivt-car" style="--tc:${x.team.car.livery.primary}"><span class="ivt-p">P${x.pos}</span><b>${esc(short3(d.name))}</b>${tyreBadge(x.tyre)}<small>${x.stintLap}g · ${Math.round(x.wear * 100)}%</small></div>`;
  el.innerHTML = `<div class="ivt ${cls2}"><div class="ivt-h">Interval tracker</div><div class="ivt-row">${side(a, da)}<div class="ivt-gap"><b>${gap.toFixed(2)}</b><small>${rate > 0.005 ? `−${rate.toFixed(2)}` : rate < -0.005 ? `+${(-rate).toFixed(2)}` : '±0.00'} /giro</small></div>${side(c, dc)}</div>
    <div class="ivt-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${one}" y2="${one}" class="ivt-one"/><polyline points="${poly}"/></svg><span>${verdict}</span></div></div>`;
}

// ---------------- STINT DATA ----------------
export function stintsOf(sim, c) {
  const stops = sim.stopsLog.filter((s) => s.key === c.key).sort((a, b) => a.lap - b.lap);
  const end = c.status === 'finished' ? c.finishLap : c.status === 'dnf' ? Math.max(0, c.dist) : c.dist;
  const out = []; let start = 0;
  for (const s of stops) { out.push({ c: s.from, a: start, b: s.lap, stat: s.stat, sc: s.sc }); start = s.lap; }
  out.push({ c: c.tyre, a: start, b: Math.max(start, end), cur: c.status === 'running', dnf: c.status === 'dnf' });
  return out;
}
export function stintChartSVG(sim, cars, opt = {}) {
  const L = sim.laps, rowH = opt.rowH || 18, labW = opt.labW || 92, W = opt.w || 640, plotW = W - labW - 10;
  const H = cars.length * rowH + 22;
  const x = (l) => labW + (Math.min(L, l) / L) * plotW;
  let s = `<svg class="stint-svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-height:${opt.maxH || 'none'}">`;
  for (let l = 0; l <= L; l += Math.max(1, Math.round(L / 10))) s += `<line x1="${x(l)}" x2="${x(l)}" y1="0" y2="${H - 18}" class="sc-grid"/><text x="${x(l)}" y="${H - 5}" class="sc-ax" text-anchor="middle">${l || 1}</text>`;
  cars.forEach((c, i) => {
    const y = i * rowH + 2; const d = sim.driver(c);
    s += `<g class="sc-row${c.isPlayer ? ' me' : ''}"><title>${esc(d.name)} · ${stintsOf(sim, c).map((t) => `${COMPOUNDS[t.c]?.short || '?'} ${Math.round(t.b - t.a)}g`).join(' › ')}</title>`;
    if (c.isPlayer) s += `<rect x="0" y="${y - 1}" width="${W}" height="${rowH}" class="sc-me"/>`;
    s += `<text x="4" y="${y + rowH * 0.62}" class="sc-lab">${c.status === 'dnf' ? 'RIT' : 'P' + c.pos}</text><rect x="34" y="${y + 3}" width="3" height="${rowH - 8}" fill="${c.team.car.livery.primary}"/><text x="42" y="${y + rowH * 0.62}" class="sc-name">${esc(short3(d.name))}</text>`;
    for (const t of stintsOf(sim, c)) {
      const x0 = x(t.a) + 1, x1 = Math.max(x0 + 2, x(t.b) - 1);
      const col = COMPOUNDS[t.c]?.color || '#888';
      s += `<rect x="${x0.toFixed(1)}" y="${y + 3}" width="${(x1 - x0).toFixed(1)}" height="${rowH - 8}" rx="2" fill="${col}" fill-opacity="${t.cur ? 0.55 : 0.9}"/>`;
      if (x1 - x0 > 16) s += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${y + rowH * 0.62}" class="sc-c" text-anchor="middle">${COMPOUNDS[t.c]?.short || ''}${x1 - x0 > 40 ? ' ' + Math.round(t.b - t.a) : ''}</text>`;
      if (t.dnf) s += `<text x="${x1 + 4}" y="${y + rowH * 0.62}" class="sc-dnf">✕</text>`;
    }
    s += '</g>';
  });
  return s + '</svg>';
}

// ---------------- LIVE CHAMPIONSHIP ----------------
export function liveStandingsHTML(st, sim) {
  if (st.quick) return '<div class="muted small" style="padding:10px">Il campionato live è disponibile in modalità Carriera.</div>';
  const base = standings(st);
  const pre = Object.fromEntries(base.drivers.map((d, i) => [d.id, { pts: d.pts, pos: i + 1 }]));
  const add = {};
  const cls = sim.classification();
  if (!sim.isSprint) cls.forEach((c, i) => { if (c.status === 'dnf') return; for (const id of c.driverIds) add[id] = (add[id] || 0) + pointsFor(i + 1, !!sim.track.double); });
  else { const SP = [8, 7, 6, 5, 4, 3, 2, 1]; cls.forEach((c, i) => { if (c.status !== 'dnf') for (const id of c.driverIds) add[id] = (add[id] || 0) + (SP[i] || 0); }); }
  for (const r of st.weekend?.sprintRes || []) for (const id of r.driverIds) add[id] = (add[id] || 0) + (r.pts || 0);
  const live = Object.keys(pre).map((id) => ({ id, pts: pre[id].pts + (add[id] || 0), add: add[id] || 0, was: pre[id].pos })).sort((a, b) => b.pts - a.pts || a.was - b.was);
  const lead = live[0]?.pts || 0;
  const started = base.drivers.some((d) => d.pts > 0);
  const mine = new Set(sim.cars.filter((c) => c.isPlayer).flatMap((c) => c.driverIds));
  const rows = live.map((r, i) => ({ ...r, pos: i + 1 })).filter((r, i) => i < 10 || mine.has(r.id));
  return `<div class="live-champ"><div class="lc-h"><span>Mondiale piloti se finisse ora</span><span class="muted">${sim.isSprint ? 'Sprint' : 'Gara'} · giro ${Math.min(sim.laps, Math.floor(sim.progress * sim.laps) + 1)}</span></div>${rows.map((r) => {
    const d = st.drivers[r.id]; const t = st.teams[d?.teamId]; const mv = started ? r.was - r.pos : 0;
    return `<div class="lc-row ${mine.has(r.id) ? 'me' : ''}"><span class="lc-pos">${r.pos}</span>${t ? teamStripe(t) : '<span></span>'}<span class="lc-nm">${esc(d?.name || r.id)}</span><span class="lc-mv ${mv > 0 ? 'good' : mv < 0 ? 'bad' : 'dim'}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + -mv : '–'}</span><span class="lc-add">${r.add ? '+' + r.add : ''}</span><b class="lc-pts">${r.pts}</b><span class="lc-gap">${r.pos === 1 || lead === r.pts ? '' : '-' + (lead - r.pts)}</span></div>`;
  }).join('')}</div>`;
}

// ---------------- POST-RACE / LIVE ANALYSIS ----------------
const AN_TABS = [['lap', 'Lap chart'], ['gap', 'Distacchi'], ['strat', 'Strategie'], ['pace', 'Passo gara'], ['story', 'Momenti'], ['why', 'Bilancio tempi'], ['dec', 'Decisioni']];
// decision log: what was asked, who answered (you, the engineer, a standing order), what happened next
const BY_LBL = { player: 'Tu', engineer: 'Ingegnere', policy: 'Ordine perm.', expired: 'Ritirata' };
function decisionsHTML(sim) {
  const list = sim.decisions || [];
  if (!list.length) return '<div class="muted" style="padding:30px">Nessuna decisione registrata finora.</div>';
  const name = (k) => { const c = sim.cars.find((x) => x.key === k); return c ? esc(lastName(sim.driver(c).name)) : ''; };
  const outTxt = (d) => {
    const o = d.out; if (!o) return '<span class="muted">in corso…</span>';
    if (o.end === 'dnf') return `<span class="bad">Ritiro${o.reason ? ': ' + esc(o.reason) : ''}</span>`;
    if (o.pos == null || d.pos0 == null) return '';
    const dl = d.pos0 - o.pos;
    return `P${d.pos0} → <b class="${dl > 0 ? 'good' : dl < 0 ? 'bad' : ''}">P${o.pos}</b> <span class="muted">${o.end === 'flag' ? 'all’arrivo' : 'dopo 3 giri'}</span>`;
  };
  const n = { player: 0, engineer: 0, policy: 0, expired: 0 }; for (const d of list) n[d.by] = (n[d.by] || 0) + 1;
  return `<div class="tiny muted mb8">${list.length} decisioni · ${n.player} prese da te · ${n.engineer} dall’ingegnere (tempo scaduto o modalità automatica) · ${n.policy} da ordini permanenti · ${n.expired} ritirate perché non più attuali</div>
    <div class="an-dec">${list.slice().reverse().map((d) => `<div class="an-dec-row ${d.by}"><span class="an-ev-lap">G${d.lap}</span><span><span class="chip tiny ${d.by === 'player' ? 'good' : d.by === 'expired' ? '' : 'warn'}">${BY_LBL[d.by] || d.by}</span></span><div><b>${esc(d.title)}</b>${d.keys?.length ? ` <span class="muted tiny">${d.keys.map(name).join(', ')}</span>` : ''}<div class="q">${esc(d.asked || '')}</div><div class="mt8">${d.choice ? `→ <b>${esc(d.choice)}</b>${d.by !== 'player' && d.def && d.def !== d.choice ? ` <span class="muted tiny">(consiglio: ${esc(d.def)})</span>` : ''}` : `<span class="muted">Ritirata: ${esc(d.why || '')}</span>`}</div></div><div class="out">${outTxt(d)}</div></div>`).join('')}</div>`;
}
// time ledger: where each of your cars spent (or gained) its seconds, and the comparison with the car that finished ahead
const LEDGER = [['pit', 'Soste ai box'], ['deg', 'Degrado gomme'], ['dirty', 'Aria sporca'], ['traffic', 'Doppiaggi e traffico'], ['temp', 'Gomme fuori finestra'], ['tyre', 'Graining / spiattellate'], ['damage', 'Danni e guasti'], ['err', 'Errori del pilota'], ['pen', 'Penalità'], ['lift', 'Lift & coast'], ['mode', 'Ritmo (attacco/gestione)'], ['ers', 'Uso batteria'], ['eng', 'Mappa motore'], ['drs', 'DRS']];
function ledgerHTML(sim, cls) {
  const mine = cls.filter((c) => c.isPlayer && c.ledger);
  if (!mine.length) return '<div class="muted" style="padding:30px">Nessun dato.</div>';
  const fin = cls.filter((c) => c.status !== 'dnf');
  return `<div class="tiny muted mb8">Secondi persi (rosso) o guadagnati (verde) da inizio gara per ogni voce, esclusi i giri dietro la safety car. Il confronto in basso spiega il distacco da chi ti precede.</div><div class="an-led">${mine.map((c) => {
    const L = c.ledger; const d = sim.driver(c);
    const max = Math.max(5, ...LEDGER.map(([k]) => Math.abs(L[k] || 0)));
    const rows = LEDGER.filter(([k]) => Math.abs(L[k] || 0) >= 0.3).sort((a, b) => Math.abs(L[b[0]]) - Math.abs(L[a[0]])).map(([k, n]) => { const v = L[k]; return `<div class="an-led-row"><span>${n}${k === 'pit' ? ` (${L.stops})` : ''}</span><div class="an-led-bar"><i class="${v < 0 ? 'gain' : ''}" style="left:0;width:${(Math.abs(v) / max * 100).toFixed(1)}%"></i></div><b class="mono right ${v < 0 ? 'good' : ''}">${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}s</b></div>`; }).join('');
    const i = fin.indexOf(c); const r = i > 0 ? fin[i - 1] : fin[1];
    let cmp = '';
    if (r && r.ledger && c.status !== 'dnf') {
      const diffs = LEDGER.map(([k, n]) => ({ n, v: (L[k] || 0) - (r.ledger[k] || 0) })).filter((x) => Math.abs(x.v) >= 0.8).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4);
      const g = sim.gapToLeader(c, cls[0]), gr = sim.gapToLeader(r, cls[0]);
      const gap = typeof g === 'number' && typeof gr === 'number' ? Math.abs(g - gr) : null;
      cmp = `<div class="an-led-cmp">Rispetto a <b>${esc(sim.driver(r).name)}</b> (P${r.pos}${gap != null ? `, ${i > 0 ? 'davanti' : 'dietro'} di ${gap.toFixed(1)}s` : ''}): ${diffs.length ? diffs.map((x) => `<span class="${x.v > 0 ? 'bad' : 'good'}">${x.v > 0 ? 'hai perso' : 'hai guadagnato'} ${Math.abs(x.v).toFixed(1)}s in ${x.n.toLowerCase()}</span>`).join(' · ') : 'gara molto simile: la differenza l’hanno fatta passo puro e posizione in pista'}.</div>`;
    } else if (c.status === 'dnf') cmp = `<div class="an-led-cmp bad">Ritirato: ${esc(c.reason || '')}</div>`;
    { const ps = sim.positionStory?.(c);
      if (ps) { const sg = (v) => `<b class="${v > 0 ? 'good' : v < 0 ? 'bad' : 'muted'}">${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}</b>`;
        const parts = [`Partenza ${sg(ps.start)}`, `Sorpassi ${sg(ps.made)} / ${sg(-ps.lost)}`, `Soste ${sg(ps.pit)}`];
        if (ps.sc) parts.push(`Ripartenze ${sg(ps.sc)}`);
        if (ps.other) parts.push(`<span data-tip="Soste e ritiri degli altri, errori, penalità">Altro ${sg(ps.other)}</span>`);
        cmp += `<div class="an-led-cmp"><span class="tiny upper muted">Posizioni</span> P${ps.grid} → ${ps.end ? 'P' + ps.end : 'RIT'}${ps.total != null ? ` (${sg(ps.total)})` : ''}: ${parts.join(' · ')}${ps.dec.length ? `<div class="tiny mt8">Decisioni che hanno pesato: ${ps.dec.map((x) => `G${x.lap} ${esc(x.title.replace(/^[^\wÀ-ÿ]+/, ''))} → «${esc(x.choice)}» ${sg(x.delta)}`).join(' · ')}</div>` : ''}</div>`; } }
    return `<div class="an-led-card"><div class="row between"><b>${esc(d.name)}</b><span class="muted small">${c.status === 'dnf' ? 'RIT' : 'P' + c.pos} · partito P${c.grid}</span></div><div class="mt8">${rows || '<span class="muted small">Ancora nessuna voce significativa.</span>'}</div>${cmp}</div>`;
  }).join('')}</div>`;
}
export function analysisHTML(sim, st, tab = 'lap', sel = null) {
  const cls = sim.classification();
  const keys = sel || defaultSel(sim);
  const body = tab === 'lap' ? lapChart(sim, cls, keys) : tab === 'gap' ? gapChart(sim, cls, keys) : tab === 'strat' ? `<div class="an-strat">${stintChartSVG(sim, cls, { w: 980, rowH: 21, labW: 96 })}</div>${pitTable(sim)}` : tab === 'story' ? storyHTML(sim) : tab === 'dec' ? decisionsHTML(sim) : tab === 'why' ? ledgerHTML(sim, cls) : paceChart(sim, cls, keys);
  const lsAll = lineStyles(sim, keys);
  const picker = tab === 'strat' || tab === 'story' || tab === 'dec' || tab === 'why' ? '' : `<div class="an-pick">${cls.map((c) => `<button class="an-chip ${keys.includes(c.key) ? 'on' : ''}" data-a="an-sel" data-key="${c.key}" style="--tc:${lsAll[c.key]?.col || c.team.car.livery.primary}">${esc(short3(sim.driver(c).name))}${lsAll[c.key] ? `<svg class="an-swatch" viewBox="0 0 22 6"><line x1="1" x2="21" y1="3" y2="3" stroke="${lsAll[c.key].col}" stroke-width="2.5"${dashAttr(lsAll[c.key])}/></svg>` : ''}</button>`).join('')}</div>`;
  return `<div class="an-panel"><div class="an-head"><div><div class="an-eyebrow">${sim.finished ? 'Analisi post-gara' : `Analisi live · giro ${Math.min(sim.laps, Math.floor(sim.progress * sim.laps) + 1)}/${sim.laps}`}</div><div class="an-title">${esc(sim.track.name)}</div></div>
    <div class="tabs">${AN_TABS.map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="an-tab" data-t="${k}">${n}</div>`).join('')}</div><button class="btn icon-btn" data-a="an-close" aria-label="Chiudi analisi">${icon('x')}</button></div>
    ${picker}<div class="an-body">${body}</div>${summary(sim, cls)}</div>`;
}
export function defaultSel(sim) {
  const cls = sim.classification();
  const s = new Set(cls.slice(0, 3).map((c) => c.key));
  for (const c of sim.cars) if (c.isPlayer) s.add(c.key);
  return [...s];
}
// Line styles for the selected cars: team colour, plus a dash pattern whenever the colour is too close
// to one already used (team-mates always share a livery), so every line stays tellable apart.
const DASH = ['', '8 4', '2 4', '12 4 2 4', '4 2'];
function hexRgb(h) { const m = String(h).replace('#', ''); const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.padEnd(6, '0'); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0); }
function lineStyles(sim, keys) {
  const used = []; const out = {};
  const ordered = sim.classification().filter((c) => keys.includes(c.key));
  for (const c of ordered) {
    let col = c.team.car.livery.primary;
    // near-black liveries vanish on the dark chart: use the secondary colour
    if (hexRgb(col).reduce((a, b) => a + b, 0) < 110) col = c.team.car.livery.secondary || '#9aa3b2';
    const rgb = hexRgb(col);
    const clash = used.filter((u) => Math.hypot(u.rgb[0] - rgb[0], u.rgb[1] - rgb[1], u.rgb[2] - rgb[2]) < 95).length;
    out[c.key] = { col, dash: DASH[clash % DASH.length] };
    used.push({ rgb });
  }
  return out;
}
const dashAttr = (st) => (st?.dash ? ` stroke-dasharray="${st.dash}"` : '');
function chartFrame(W, H, padL, padB, xLabels, yLabels) {
  let g = '';
  for (const [x, t] of xLabels) g += `<line x1="${x}" x2="${x}" y1="10" y2="${H - padB}" class="an-grid"/><text x="${x}" y="${H - padB + 16}" class="an-ax" text-anchor="middle">${t}</text>`;
  for (const [y, t] of yLabels) g += `<line x1="${padL}" x2="${W - 10}" y1="${y}" y2="${y}" class="an-grid"/><text x="${padL - 8}" y="${y + 4}" class="an-ax" text-anchor="end">${t}</text>`;
  return g;
}
function lapTicks(L, x) { const st = Math.max(1, Math.round(L / 12)); const out = []; for (let l = 0; l <= L; l += st) out.push([x(l).toFixed(1), l === 0 ? 'Via' : l]); return out; }
function lapChart(sim, cls, keys) {
  const labels = [];
  const W = 980, H = 430, padL = 40, padB = 26, padR = 70;
  const N = sim.cars.length, L = sim.laps;
  const x = (l) => padL + (l / L) * (W - padL - padR);
  const y = (p) => 14 + ((p - 1) / Math.max(1, N - 1)) * (H - padB - 24);
  let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}">` + chartFrame(W, H, padL, padB, lapTicks(L, x), [1, 5, 10, 15, 20, 25, 30].filter((p) => p <= N).map((p) => [y(p).toFixed(1), 'P' + p]));
  const order = cls.slice().sort((a, b) => (keys.includes(a.key) ? 1 : 0) - (keys.includes(b.key) ? 1 : 0));
  const ls = lineStyles(sim, keys);
  for (const c of order) {
    const h = sim.history[c.key] || [];
    const pts = [[0, c.grid], ...h.map((e) => [e.lap, e.pos])];
    const on = keys.includes(c.key); const col = on ? ls[c.key].col : c.team.car.livery.primary;
    const d = pts.map(([l, p]) => `${x(l).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
    s += `<g class="an-line ${on ? 'on' : ''}${c.isPlayer ? ' me' : ''}"><title>${esc(sim.driver(c).name)}: dalla P${c.grid} alla ${c.status === 'dnf' ? 'ritiro' : 'P' + c.pos}</title>${on ? `<polyline points="${d}" class="an-halo"/>` : ''}<polyline points="${d}" stroke="${col}"${on ? dashAttr(ls[c.key]) : ''}/>`;
    const last = pts[pts.length - 1];
    if (on) s += `<circle cx="${x(last[0])}" cy="${y(last[1])}" r="4" fill="${col}" stroke="#0a0b0e" stroke-width="1.5"/>${lab(labels, x(last[0]) + 8, y(last[1]) + 4, `${esc(short3(sim.driver(c).name))}${c.status === 'dnf' ? ' ✕' : ''}`, col)}`;
    s += '</g>';
  }
  for (const st of sim.stopsLog) { if (!keys.includes(st.key)) continue; const h = sim.history[st.key]?.find((e) => e.lap === st.lap); if (h) s += `<rect x="${x(st.lap) - 3}" y="${y(h.pos) - 3}" width="6" height="6" class="an-pit"><title>Pit stop giro ${st.lap}</title></rect>`; }
  return s + labelsSVG(labels) + '</svg><div class="an-note"><span class="an-key pit"></span> pit stop · seleziona i piloti da evidenziare qui sopra</div>';
}
// end-of-line labels, pushed apart vertically so they never overlap
function lab(arr, x, y, t, col) { arr.push({ x: +x, y: +y, y0: +y, t, col }); return ''; }
function labelsSVG(arr) {
  arr.sort((a, b) => a.y - b.y);
  for (let i = 1; i < arr.length; i++) if (arr[i].y - arr[i - 1].y < 15) arr[i].y = arr[i - 1].y + 15;
  // a colour tick ties each (possibly pushed) label back to the end of its line
  return arr.map((l) => `${l.col ? `<line x1="${l.x - 6}" y1="${(l.y0 - 4).toFixed(1)}" x2="${l.x - 1}" y2="${(l.y - 4).toFixed(1)}" stroke="${l.col}" stroke-width="1.5"/><rect x="${l.x}" y="${(l.y - 9).toFixed(1)}" width="4" height="10" fill="${l.col}"/>` : ''}<text x="${l.x + (l.col ? 7 : 0)}" y="${l.y.toFixed(1)}" class="an-lab">${l.t}</text>`).join('');
}
function cumTimes(sim) {
  const cum = {};
  for (const c of sim.cars) { let t = 0; cum[c.key] = [0]; for (const e of sim.history[c.key] || []) { t += e.time; cum[c.key][e.lap] = t; } }
  return cum;
}
function gapChart(sim, cls, keys) {
  const labels = [];
  const W = 980, H = 430, padL = 50, padB = 26, padR = 70, L = sim.laps;
  const cum = cumTimes(sim);
  const lead = []; for (let l = 1; l <= L; l++) { let m = Infinity; for (const k in cum) if (cum[k][l] != null && cum[k][l] < m) m = cum[k][l]; lead[l] = m; }
  const series = keys.map((k) => { const c = sim.cars.find((x) => x.key === k); const pts = []; for (let l = 1; l <= L; l++) if (cum[k][l] != null && isFinite(lead[l])) pts.push([l, cum[k][l] - lead[l]]); return { c, pts }; });
  const maxG = Math.min(120, Math.max(5, ...series.flatMap((s) => s.pts.map((p) => p[1])))) * 1.05;
  const x = (l) => padL + (l / L) * (W - padL - padR);
  const y = (g) => 14 + (Math.min(g, maxG) / maxG) * (H - padB - 24);
  const step = maxG > 60 ? 20 : maxG > 25 ? 10 : maxG > 10 ? 5 : 2;
  const yl = []; for (let g = 0; g <= maxG; g += step) yl.push([y(g).toFixed(1), g ? `+${g}s` : 'Leader']);
  let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}">` + chartFrame(W, H, padL, padB, lapTicks(L, x), yl);
  // neutralised laps (safety car) shading
  const scLaps = new Set(Object.values(sim.history).flat().filter((e) => e.sc).map((e) => e.lap));
  for (const l of scLaps) s += `<rect x="${x(l - 1)}" y="10" width="${(x(l) - x(l - 1)).toFixed(1)}" height="${H - padB - 10}" class="an-sc"><title>Safety car / VSC</title></rect>`;
  const ls = lineStyles(sim, keys);
  for (const { c, pts } of series) {
    if (!pts.length) continue;
    const col = ls[c.key].col; const pp = pts.map(([l, g]) => `${x(l).toFixed(1)},${y(g).toFixed(1)}`).join(' ');
    s += `<g class="an-line on${c.isPlayer ? ' me' : ''}"><title>${esc(sim.driver(c).name)}</title><polyline points="${pp}" class="an-halo"/><polyline points="${pp}" stroke="${col}"${dashAttr(ls[c.key])}/>`;
    const last = pts[pts.length - 1];
    s += `<circle cx="${x(last[0])}" cy="${y(last[1])}" r="4" fill="${col}" stroke="#0a0b0e" stroke-width="1.5"/>${lab(labels, x(last[0]) + 8, y(last[1]) + 4, `${esc(short3(sim.driver(c).name))} ${last[1] > 0.05 ? '+' + last[1].toFixed(1) : ''}`, col)}</g>`;
  }
  return s + labelsSVG(labels) + `</svg><div class="an-note"><span class="an-key sc"></span> safety car / VSC · distacco dal leader alla fine di ogni giro${maxG >= 120 ? ' (scala limitata a 2 minuti)' : ''}</div>`;
}
function paceChart(sim, cls, keys) {
  const labels = [];
  const W = 980, H = 430, padL = 60, padB = 26, padR = 70, L = sim.laps;
  const series = keys.map((k) => { const c = sim.cars.find((x) => x.key === k); const pit = new Set(sim.stopsLog.filter((s) => s.key === k).flatMap((s) => [s.lap, s.lap + 1])); return { c, pts: (sim.history[k] || []).filter((e) => !e.sc && !pit.has(e.lap) && e.lap > 1) }; });
  const all = series.flatMap((s) => s.pts.map((p) => p.time)).sort((a, b) => a - b);
  if (!all.length) return '<div class="muted" style="padding:30px">Servono almeno un paio di giri lanciati.</div>';
  const lo = all[0] - 0.3, hi = Math.min(all[all.length - 1], all[Math.floor(all.length * 0.5)] * 1.04) + 0.3;
  const x = (l) => padL + (l / L) * (W - padL - padR);
  const y = (t) => 14 + ((Math.min(t, hi) - lo) / (hi - lo)) * (H - padB - 24);
  const yl = []; const st = (hi - lo) > 6 ? 2 : (hi - lo) > 2.5 ? 1 : 0.5; for (let t = Math.ceil(lo / st) * st; t <= hi; t += st) yl.push([y(t).toFixed(1), fmtTime(t).replace(/\.\d+$/, (m) => m.slice(0, 2))]);
  let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}">` + chartFrame(W, H, padL, padB, lapTicks(L, x), yl);
  const ls = lineStyles(sim, keys);
  for (const { c, pts } of series) {
    if (!pts.length) continue;
    const col = ls[c.key].col; const pp = pts.map((e) => `${x(e.lap).toFixed(1)},${y(e.time).toFixed(1)}`).join(' ');
    s += `<g class="an-line on${c.isPlayer ? ' me' : ''}"><polyline points="${pp}" class="an-halo"/><polyline points="${pp}" stroke="${col}"${dashAttr(ls[c.key])}/>`;
    for (const e of pts) s += `<circle cx="${x(e.lap).toFixed(1)}" cy="${y(e.time).toFixed(1)}" r="3.4" fill="${COMPOUNDS[e.tyre]?.color || col}" stroke="#0a0b0e" stroke-width="1.2"><title>${esc(sim.driver(c).name)} · giro ${e.lap} · ${fmtTime(e.time)} · ${COMPOUNDS[e.tyre]?.name || ''}</title></circle>`;
    const last = pts[pts.length - 1];
    s += `${lab(labels, x(last.lap) + 8, y(last.time) + 4, `${esc(short3(sim.driver(c).name))}`, col)}</g>`;
  }
  return s + labelsSVG(labels) + '</svg><div class="an-note">Tempi sul giro esclusi giri di sosta e safety car · il colore del punto indica la mescola · più in alto = più veloce</div>';
}
function pitTable(sim) {
  const stops = sim.stopsLog.filter((s) => !s.red).sort((a, b) => a.stat - b.stat).slice(0, 6);
  if (!stops.length) return '';
  return `<div class="an-pits"><div class="an-eyebrow">Pit stop più rapidi</div>${stops.map((s, i) => { const c = sim.cars.find((x) => x.key === s.key); return `<div class="an-pitrow ${c.isPlayer ? 'me' : ''}"><span>${i + 1}</span>${teamStripe(c.team)}<b>${esc(sim.driver(c).name)}</b><span class="muted">giro ${s.lap}</span>${tyreBadge(s.from)}<span class="muted">›</span>${s.to ? tyreBadge(s.to) : '<span class="muted tiny">benzina</span>'}<b class="mono">${s.stat.toFixed(2)}s</b></div>`; }).join('')}</div>`;
}
function summary(sim, cls) {
  const mover = cls.filter((c) => c.status !== 'dnf').map((c) => ({ c, g: c.grid - c.pos })).sort((a, b) => b.g - a.g)[0];
  const fl = sim.fastest.key && sim.cars.find((c) => c.key === sim.fastest.key);
  const bestStop = sim.stopsLog.filter((s) => !s.red).sort((a, b) => a.stat - b.stat)[0];
  const tile = (v, l, sub = '') => `<div class="an-tile"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="an-tiles">${tile(mover && mover.g > 0 ? '+' + mover.g : '—', 'Rimonta migliore', mover && mover.g > 0 ? esc(sim.driver(mover.c).name) : '')}${tile(fl ? fmtTime(sim.fastest.time) : '—', 'Giro più veloce', fl ? esc(sim.driver(fl).name) : '')}${tile(bestStop ? bestStop.stat.toFixed(2) + 's' : '—', 'Pit stop migliore', bestStop ? esc(sim.driver(sim.cars.find((c) => c.key === bestStop.key)).name) : '')}${tile(sim.stopsLog.filter((s) => !s.red).length, 'Pit stop totali')}${tile(sim.scCount, 'Safety car')}${tile(cls.filter((c) => c.status === 'dnf').length, 'Ritiri')}</div>`;
}

// race story: the key moments of the race as a lap-by-lap timeline
function storyHTML(sim) {
  const mine = new Set(sim.cars.filter((c) => c.isPlayer).map((c) => c.key));
  const items = sim.tv.filter((g) => ['lead', 'retire', 'sc', 'vsc', 'restart', 'issue', 'weather', 'night', 'wxcall'].includes(g.kind) || (g.kind === 'pass' && (mine.has(g.key) || mine.has(g.other) || g.pos <= 2)) || (g.kind === 'pit' && mine.has(g.key)));
  if (!items.length) return '<div class="muted" style="padding:30px">Gara tranquilla: nessun momento chiave da segnalare.</div>';
  const name = (k) => { const c = sim.cars.find((x) => x.key === k); return c ? esc(sim.driver(c).name) : ''; };
  const ico = { lead: 'trophy', retire: 'alert', sc: 'flag', vsc: 'flag', restart: 'flag', issue: 'wrench', weather: 'rain', wxcall: 'rain', night: 'moon', pass: 'swap', pit: 'pit' };
  const txt = (g) => {
    switch (g.kind) {
      case 'lead': return `<b>${name(g.key)}</b> passa al comando`;
      case 'retire': return `<b>${esc(g.title)}</b>: ${esc(g.text)}`;
      case 'pass': return `<b>${name(g.key)}</b> ${g.err ? 'approfitta dell’errore di' : 'supera'} ${name(g.other)} per la P${g.pos}`;
      case 'pit': return `Pit stop di <b>${name(g.key)}</b>: ${g.stat.toFixed(2)}s${g.to ? ` · ${COMPOUNDS[g.from]?.short || ''} › ${COMPOUNDS[g.to]?.short || ''}` : ''}`;
      case 'issue': return `<b>${esc(g.title)}</b> per ${esc(g.text)}${g.choice ? ` · scelta: ${esc(g.choice.toLowerCase())}` : ''}`;
      case 'wxcall': return `<b>${name(g.key)}</b> passa alle ${esc(COMPOUNDS[g.to]?.name || '')}${g.first ? ' <b>per primo</b>' : ''} (P${g.pos})`;
      default: return `<b>${esc(g.title)}</b> · ${esc(g.text || '')}`;
    }
  };
  return `<div class="an-story">${items.slice(-60).map((g) => `<div class="an-ev k-${g.kind} ${mine.has(g.key) || mine.has(g.other) ? 'me' : ''}"><span class="an-ev-lap">G${g.lap}</span><i>${icon(ico[g.kind] || 'flag')}</i><span>${txt(g)}</span></div>`).join('')}</div>`;
}
