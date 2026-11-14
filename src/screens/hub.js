import { carImg, helmet3D, mountStage, liveBackdrop } from '../ui/stage3d.js';
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, flagSVG, helmetSVG, trackSVG, teamBadge } from '../ui/art.js';
import { esc, bar, countUp } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, teamDrivers, standings, partRanking, fmtM, rdSlots, RD_TIERS, partName, freeAgents, seatsPerTeam } from '../engine/season.js';
import { genStage, circuitPath, STAGE_STYLE } from '../ui/trackview.js';
import { partSensitivity, trackStats, physicsLap } from '../engine/trackphys.js';
import { teamBaseLap } from '../engine/race.js';
import { ensureProgress } from '../engine/progress.js';
import { resolvePaddockEvent } from '../engine/events.js';
import { rivalryList, heatLabel, heatColor } from '../engine/rivalry.js';
import { maybeTechDecision, resolveTechDecision } from '../engine/techdecisions.js';
import { sfx } from '../ui/audio.js';
import { SURFACES } from '../data/categories.js';
import { driverChip, ovr, ratingBox, moraleChip, teamStripe } from './common.js';
import './paddock.js';
import { ensureDynasty, statusInfo, maybeDynDecision, dynDecisionView, resolveDynDecision, STATUS, MANDATES, pressIssues, academyDrivers, academySlots } from '../engine/dynasty.js';
import { pressArt, portraitSVG, statusEmblem, teamCol, boardTable, objectiveRow, ring } from './career-ui.js';
import { seasonStats, xpForLevel } from '../engine/progress.js';
import { celebrate } from './results.js';
import { strategyBadge } from '../engine/career5.js';

export function nextEventInfo(st) {
  const ev = st.calendar[st.round];
  if (!ev) return null;
  const tr = getTrack(st.category, ev.trackId);
  return { ev, tr };
}

function rivalPanel(st) {
  let list = [];
  try { list = rivalryList(st).filter((r) => r.heat >= 12).slice(0, 4); } catch { return ''; }
  if (!list.length) return '';
  return `<div class="panel"><div class="panel-head"><h3>${icon('flame')} Tensione tra piloti</h3></div><div>${list.map((r) => { const a = st.drivers[r.a], b = st.drivers[r.b]; const c = heatColor(r.heat); return `<div class="rival-row ${r.mine ? 'mine' : ''}"><div class="row between"><b style="font-family:var(--display);font-size:18px;text-transform:uppercase">${esc(a.name.split(' ').slice(-1)[0])} <span class="dim">vs</span> ${esc(b.name.split(' ').slice(-1)[0])}</b><span style="font-family:var(--display);font-size:13px;letter-spacing:.1em;color:${c};font-weight:800">${heatLabel(r.heat).toUpperCase()}</span></div><div class="heat"><i style="width:${Math.round(r.heat)}%;background:${c}"></i></div><div class="small muted">${r.mates && !/^compagni di squadra/i.test(r.why || '') ? 'Compagni di squadra · ' : ''}${esc(r.why)}</div></div>`; }).join('')}</div></div>`;
}

let hubStage = null;
let hubSeenDone = null;
// "Da fare": everything that needs the player's attention, most urgent first.
// [level, text, 'screen' | 'screen:tab'] — also drives the sidebar badges.
export function computeTodo(st) {
  ensureDynasty(st);
  const t = playerTeam(st);
  const s = standings(st);
  const myDrivers = teamDrivers(st, t);
    const sponsorSlots = 3 - t.sponsors.length;
    const todo = [];
    if (st.pendingTech || st.pendingEvent || st.pendingDyn) todo.push(['bad', 'Una decisione ti aspetta: rispondi prima del weekend', 'hub']);
    if (myDrivers.length < seatsPerTeam(st)) todo.push(['bad', 'Sedili vuoti! Ingaggia un pilota', 'market']);
    if (sponsorSlots > 0 && st.sponsorOffers.length) todo.push(['warn', sponsorSlots === 1 ? '1 spazio sponsor libero' : `${sponsorSlots} spazi sponsor liberi`, 'finance']);
    if (t.projects.length < rdSlots(t, st)) todo.push(['warn', rdSlots(t, st) - t.projects.length === 1 ? '1 slot R&D inattivo' : `${rdSlots(t, st) - t.projects.length} slot R&D inattivi`, 'car']);
    if (st.round === 0 && t.car.concept === 'balanced' && !st._conceptSeen) todo.push(['info', 'Scegli il concetto della nuova vettura', 'car']);
    const unread = st.inbox.filter((m) => !m.read).length;
    if (st.career.points) todo.push(['good', `${st.career.points} punti abilità da spendere`, 'career']);
    if (t.money > t.baseBudget * 0.45 && !t.invest?.build) todo.push(['good', `${fmtM(t.money)} in cassa: investi nella squadra${st.category === 'formula' ? ' (fuori cap)' : ''}`, 'finance']);
    if (unread) todo.push(['info', unread === 1 ? '1 messaggio non letto' : `${unread} messaggi non letti`, 'inbox']);
    if (st.ultimatum?.season === st.season) { const my = s.teams.find((x) => x.id === t.id)?.pts || 0; todo.unshift(['bad', `Ultimatum del consiglio: ${Math.max(0, my - st.ultimatum.start)}/${st.ultimatum.need} punti entro il round ${st.ultimatum.until}`, 'standings']); }
    if (st.dyn) {
      const D = st.dyn;
      if (D.bet && D.bet.season === st.season && D.bet.round === st.round) { const bt = st.teams[D.bet.team]; todo.unshift(['warn', `Sfida in corso: arriva davanti a ${bt?.name} (${fmtM(D.bet.stake)} in palio)`, 'paddock:tp']); }
      for (const p of D.promises) if (p.until != null && p.until - st.round <= 2 && p.until >= st.round) todo.unshift(['bad', `Promessa al consiglio in scadenza: ${p.t}`, 'paddock:board']);
      if (D.prospects?.list?.length && academyDrivers(st).length < academySlots(t) && st.round <= 2) todo.push(['info', `Gli scout segnalano ${D.prospects.list.length} giovani talenti per l’accademia`, 'drivers']);
      const ready = academyDrivers(st).find((j) => myDrivers.some((m) => ovr(st, j) >= ovr(st, m)));
      if (ready) todo.push(['good', `${ready.name} è pronto per la prima squadra`, 'drivers']);
    }
    for (const d of myDrivers) { if (d.rivalOffer) todo.unshift(['bad', `${d.name} ha un’offerta da ${st.teams[d.rivalOffer.teamId]?.name}: rinnova o lo perderai`, 'drivers']); else if (d.nextTeam && d.nextTeam !== t.id) todo.push(['warn', `${d.name} partirà a fine anno: trova un sostituto`, 'market']); }

  // Sala strategica (Centro Tecnico): open choices and an active storyline
  const sb = strategyBadge(st);
  if (sb?.count) for (const it of sb.items) todo.push([sb.warn ? 'warn' : 'info', `Sala strategica: ${esc(it.text)}`, it.screen === 'car' && it.params?.tab ? `car:${it.params.tab}` : it.screen || 'car:plan']);
  if (sb?.count > sb?.items.length) todo.push(['info', `Sala strategica: altre ${sb.count - sb.items.length} scelte aperte`, 'car:plan']);
  if (sb?.story) todo.push(['info', `Storia in corso: ${esc(sb.story.name)}${sb.story.inRounds != null ? ` (tra ${sb.story.inRounds} round)` : ''}`, 'car:plan']);
  const rank = { bad: 0, warn: 1, good: 2, info: 3 };
  return todo.map((x, i) => [x, i]).sort((a, b) => rank[a[0][0]] - rank[b[0][0]] || a[1] - b[1]).map((x) => x[0]);
}
App.todoProvider = computeTodo;
const TODO_DEST = { hub: ['home', 'Decisione'], market: ['market', 'Mercato'], finance: ['money', 'Finanze'], car: ['car', 'Centro Tecnico'], career: ['star', 'Carriera'], inbox: ['mail', 'Posta'], standings: ['chart', 'Classifiche'], paddock: ['news', 'Paddock'], drivers: ['users', 'Piloti'] };
const TODO_IC = { bad: 'alert', warn: 'bell', good: 'star', info: 'info' };
// Season goals: the board target, the three season objectives and the manager level, always in view
function seasonGoals(st, s, tpos) {
  ensureProgress(st);
  const t = playerTeam(st); const target = st.board.target; const n = st.calendar.length; const r = Math.min(st.round, n);
  const myPts = s.teams.find((x) => x.id === t.id)?.pts || 0;
  const onTrack = tpos <= target;
  const gap = onTrack ? myPts - (s.teams[target]?.pts ?? 0) : (s.teams[target - 1]?.pts || 0) - myPts;
  const boardLine = !st.round ? `Chiudi almeno <b>${target}°</b> tra i costruttori`
    : onTrack ? `In linea con l’obiettivo${s.teams[target] ? ` · <b class="good">+${gap} pt</b> di margine` : ''}`
    : `<b class="bad">${gap} pt</b> dal ${target}° posto`;
  const col = !st.round ? 'var(--team)' : onTrack ? 'var(--good)' : tpos - target <= 2 ? 'var(--warn)' : 'var(--bad)';
  const stats = seasonStats(st);
  const objs = st.objectives || [];
  const doneN = objs.filter((o) => o.done).length;
  const c = st.career; const need = xpForLevel(c.level || 1); const xp = c.xp || 0;
  const pips = st.calendar.map((ev, i) => {
    if (i >= r) return `<i class="${i === r ? 'now' : ''}"></i>`;
    const mine = ev.results?.classification.filter((x) => x.teamId === t.id) || [];
    const best = Math.min(99, ...mine.map((x) => (x.status === 'dnf' ? 99 : x.pos)));
    return `<i class="${best === 1 ? 'win' : best <= 3 ? 'pod' : mine.some((x) => x.pts > 0) ? 'pts' : 'done'}" title="R${i + 1}: ${best === 99 ? 'ritiro' : 'P' + best}"></i>`;
  }).join('');
  return `<section class="season-goals">
    <div class="sg-board" data-a="nav" data-to="standings" role="button" aria-label="Classifica costruttori">
      ${ring(st.round ? Math.max(0.06, 1 - (tpos - 1) / Math.max(1, s.teams.length - 1)) : 0, { size: 92, stroke: 8, color: col, label: st.round ? `${tpos}°` : '—', sub: `su ${s.teams.length}` })}
      <div style="min-width:0"><div class="sg-k">Obiettivo del consiglio</div><div class="sg-v">${target}° posto</div><div class="sg-s">${boardLine}</div></div>
    </div>
    <div class="sg-objs"><div class="sg-k sg-head"><span>Obiettivi stagionali</span><span class="sg-count">${doneN}/${objs.length}</span></div>${objs.map((o) => objectiveRow(o, stats, { money: false })).join('')}</div>
    <div class="sg-side">
      <div class="sg-season"><div class="sg-head"><span class="sg-k">Stagione ${st.season}</span><span class="sg-big">${r}<small>/${n}</small></span></div><div class="sg-pips" aria-label="Eventi disputati: ${r} su ${n}">${pips}</div><div class="sg-s">${n - r === 0 ? 'Calendario concluso' : `${n - r} ${n - r === 1 ? 'evento' : 'eventi'} al termine`}</div></div>
      <div class="sg-lvl" data-a="nav" data-to="career" role="button" aria-label="Carriera manager"><div class="sg-head"><span class="sg-k">Manager · Livello ${c.level || 1}</span><span class="tiny muted mono">${xp}/${need} XP</span></div>${bar((xp / need) * 100, 'gold')}${c.points ? `<div class="sg-pts">${icon('star')} ${c.points} ${c.points === 1 ? 'punto abilità' : 'punti abilità'} da spendere</div>` : ''}</div>
    </div>
  </section>`;
}

function todoPanel(todo) {
  const urgent = todo.filter((x) => x[0] === 'bad').length;
  const head = `<div class="panel-head"><h3>${icon('check')} Da fare</h3>${todo.length ? `<span class="todo-count ${urgent ? 'urgent' : ''}">${urgent ? `${urgent} ${urgent === 1 ? 'urgente' : 'urgenti'} · ` : ''}${todo.length}</span>` : ''}</div>`;
  if (!todo.length) return `<div class="panel todo-panel">${head}<div class="todo-empty">${icon('check')}<div><b>Tutto in ordine</b><span>Nessuna questione aperta: puoi andare al weekend di gara.</span></div></div></div>`;
  return `<div class="panel todo-panel">${head}<div class="todo-list">${todo.map(([cls, txt, to]) => { const [scr, tab] = to.split(':'); const d = TODO_DEST[scr] || ['right', '']; return `<div class="todo t-${cls}" data-a="nav" data-to="${scr}"${tab ? ` data-tab="${tab}"` : ''}><span class="todo-ic">${icon(TODO_IC[cls] || 'info')}</span><span class="grow">${txt}</span>${d[1] ? `<span class="todo-dest">${d[1]}</span>` : ''}${icon('right')}</div>`; }).join('')}</div></div>`;
}

registerScreen({
  id: 'hub',
  render() {
    const st = S();
    ensureDynasty(st);
    const t = playerTeam(st);
    const C = cat(st);
    const info = nextEventInfo(st);
    const s = standings(st);
    const tpos = s.teams.findIndex((x) => x.id === t.id) + 1;
    const myDrivers = teamDrivers(st, t);
    const todo = computeTodo(st);
    let hero = '';
    const myD0 = myDrivers[0];
    const live = liveBackdrop();
    const heroCar = live ? '' : carImg(st.category, t.car.livery, { number: myD0?.number, sponsor: t.sponsors[0]?.name, helmet: myD0?.helmet.c1 }, 900, 400, carSVG(st.category, t.car.livery, { number: myD0?.number, sponsor: t.sponsors[0]?.name || t.short }));
    const stage = live ? '<div class="hh-stage" id="hub-stage" aria-hidden="true"></div><div class="hh-scrim"></div>' : '';
    if (info) {
      const { ev, tr } = info;
      const path = st.category === 'rally' ? genStage(tr.seed, STAGE_STYLE[tr.id]) : circuitPath(tr.cid);
      const sub = st.category === 'rally' ? `${ev.stages.length} prove speciali · ${ev.stages.reduce((a, b) => a + b.km, 0)} km` : `${tr.circuit}${tr.hours ? ` · ${tr.hours} ore` : ''}`;
      const fact = (v, l, cls = '') => `<div class="${cls}"><b>${v}</b><span>${l}</span></div>`;
      let facts = '';
      if (st.category === 'rally') {
        facts = [...new Set(ev.stages.map((x) => x.surface))].map((x) => fact(`<i style="display:inline-block;width:10px;height:16px;margin-right:6px;background:${SURFACES[x].color};transform:skewX(-12deg)"></i>${SURFACES[x].name}`, 'Fondo')).join('');
      } else {
        const sens = partSensitivity(st.category, tr);
        const ts = trackStats(st.category, tr);
        const key = Object.entries(sens).sort((a, b) => b[1] - a[1])[0][0];
        facts = fact(`${(ts.len / 1000).toFixed(3)}<small>km</small>`, 'Lunghezza') + fact(ts.corners, 'Curve') + fact(`${Math.round(ts.vmax)}<small>km/h</small>`, 'Velocità max') + fact(partName(st, key), 'Fattore chiave', 'key');
      }
      facts += fact(`${Math.round(tr.rain * 100)}<small>%</small>`, 'Rischio pioggia') + (tr.ovt != null ? fact(tr.ovt > 0.6 ? 'Facili' : tr.ovt > 0.3 ? 'Medi' : 'Difficili', 'Sorpassi', 'f-opt') : '');
      const tags = `${ev.sprint ? `<span class="tag">${icon('bolt')} Sprint</span>` : ''}${tr.night ? `<span class="tag dark">${icon('moon')} Notturna</span>` : ''}${tr.double ? '<span class="tag">Punti doppi</span>' : ''}`;
      hero = `<section class="hub-hero ${live ? 'live' : ''}">${stage}
        <div class="hh-info">
          <div class="hh-eyebrow">Prossimo evento · Round ${ev.round} / ${st.calendar.length} ${tags}</div>
          <div class="hh-name">${flagSVG(tr.nat, 48, 32)}<span>${esc(tr.name)}</span></div>
          <div class="hh-circ">${esc(sub)}</div>
          <div class="hh-facts">${facts}</div>
          <div class="hh-cta"><button class="btn primary xl" data-a="continue">${st.weekend ? 'Riprendi il Weekend' : 'Vai al Weekend'} ${icon('right')}</button></div>
        </div>
        <div class="hh-visual">${live ? `<div class="hh-map" data-a="nav" data-to="calendar" data-tip="Apri il calendario"><div class="hm-k">${st.category === 'rally' ? 'Prova speciale' : 'Tracciato'}</div>${trackSVG(path, { w: 220, h: 130, glow: null, color: '#fff', width: 3.5, under: 'rgba(0,0,0,.5)' })}</div>` : `<div class="hh-track">${trackSVG(path, { w: 520, h: 300, glow: null, color: 'rgba(255,255,255,.85)', width: 4, under: 'rgba(0,0,0,.35)' })}</div><div class="hh-car">${heroCar}</div>`}</div>
      </section>`;
    } else hero = `<section class="hub-hero ${live ? 'live' : ''}">${stage}<div class="hh-info"><div class="hh-eyebrow">Stagione ${st.season}</div><div class="hh-name">Stagione conclusa</div><div class="hh-circ">Tutti gli eventi sono stati disputati.</div><div class="hh-cta" style="margin-top:28px"><button class="btn primary xl" data-a="continue">Bilancio di fine stagione ${icon('right')}</button></div></div><div class="hh-visual"><div class="hh-car">${heroCar}</div></div></section>`;

    const parts = C.parts.map((p) => {
      const rank = partRanking(st, p.id).indexOf(t.id) + 1;
      return `<div class="stat" style="grid-template-columns:120px 1fr 40px 34px"><span style="color:var(--text2)">${p.name}</span>${bar(t.car.parts[p.id])}<b class="right mono">${Math.round(t.car.parts[p.id])}</b><span class="rank ${rank <= 3 ? 'good' : rank > 7 ? 'bad' : 'muted'}">${rank}°</span></div>`;
    }).join('');
    const myPts = s.teams.find((x) => x.id === t.id)?.pts || 0;
    const leaderPts = s.teams[0]?.pts || 0;
    const conf = st.board.confidence;
    const ss = seasonStats(st);

    return `<div class="screen-title"><div><div class="sub">${esc(C.full)} · Stagione ${st.season}</div><h1>Panoramica</h1></div></div>
      <div class="col gap16 anim-in">
        ${hero}
        <div class="hub-kpis">
          <div><b>${ss.wins}<small>${ss.podiums} ${ss.podiums === 1 ? 'podio' : 'podi'}${ss.poles ? ` · ${ss.poles} pole` : ''}</small></b><span>Vittorie in stagione</span></div>
          <div><b>${myPts}${leaderPts > myPts ? `<small>−${leaderPts - myPts} dal leader</small>` : myPts ? '<small>in testa</small>' : ''}</b><span>Punti squadra</span></div>
          <div><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><span>Budget disponibile</span></div>
          <div><b style="color:${conf < 30 ? 'var(--bad)' : conf > 65 ? 'var(--good)' : 'var(--warn)'}">${conf}%</b><span>Fiducia del consiglio</span>${bar(conf, conf < 30 ? 'red' : conf > 65 ? 'green' : 'gold')}</div>
        </div>
        ${seasonGoals(st, s, tpos)}
        ${dynastyStrip(st)}
        <div class="hub-grid">
          <div class="col gap16">
            <div class="panel"><div class="panel-head"><h3>I tuoi piloti</h3><button class="btn sm ghost" data-a="nav" data-to="drivers">Dettagli ${icon('right')}</button></div>
              ${myDrivers.map((d) => { const p = s.drivers.findIndex((x) => x.id === d.id) + 1; const pts = s.drivers.find((x) => x.id === d.id)?.pts || 0; return `<div class="drv-row"><div class="row" style="gap:12px"><span class="drv-num">${d.number}</span>${helmet3D(d.helmet, 52)}</div><div style="min-width:0"><div class="row" style="gap:8px">${flagSVG(d.nat)}<span class="drv-name">${esc(d.name)}</span></div><div class="drv-meta">${p}° in classifica · ${pts} pt · ${d.age} anni</div><div class="mt8">${moraleChip(d.morale)}</div></div>${ratingBox(ovr(st, d), false)}</div>`; }).join('') || '<div class="muted">Nessun pilota</div>'}
            </div>
            ${info && st.category !== 'rally' ? insightPanel(st, info.tr, t) : ''}
            <div class="panel"><div class="panel-head"><h3>La vettura</h3><button class="btn sm ghost" data-a="nav" data-to="car">Centro Tecnico ${icon('right')}</button></div>
              <div class="col" style="gap:12px">${parts}</div>
              ${t.projects.length ? `<div class="row wrap mt16 gap6">${t.projects.map((p) => `<span class="chip info">${icon('rd')} ${partName(st, p.part)} · ${RD_TIERS[p.tier].name} · ${p.racesLeft} ${p.racesLeft === 1 ? 'evento' : 'eventi'}</span>`).join('')}</div>` : ''}
            </div>
            ${pressPanel(st)}
          </div>
          <div class="col gap16">
            ${todoPanel(todo)}
            ${goalsPanel(st)}
            <div class="panel"><div class="panel-head"><h3>Classifica piloti</h3><button class="btn sm ghost" data-a="nav" data-to="standings">Tutte ${icon('right')}</button></div>
              <table class="tbl"><tbody>${s.drivers.slice(0, 6).map((x, i) => { const d = st.drivers[x.id]; const tm = st.teams[d.teamId]; return `<tr class="${d.teamId === t.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td style="width:8px;padding-left:0;padding-right:0">${tm ? teamStripe(tm) : ''}</td><td>${driverChip(st, d, { helmet: false })}</td><td class="right mono"><b>${x.pts}</b></td></tr>`; }).join('')}</tbody></table>
            </div>
            <div class="panel"><div class="panel-head"><h3>Posta recente</h3><button class="btn sm ghost" data-a="nav" data-to="inbox">Apri ${icon('right')}</button></div>
              <div style="margin:-6px -20px -20px">${st.inbox.slice(0, 4).map((m) => `<div class="mail ${m.read ? '' : 'unread'} ${m.type}" data-a="nav" data-to="inbox" data-mail="${m.id}"><div class="ic">${icon(m.icon || 'mail')}</div><div class="grow" style="min-width:0"><div class="subj" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.subject)}</div><div class="tiny muted">${esc(m.from)}</div></div></div>`).join('') || '<div class="muted small" style="padding:14px 20px">Nessun messaggio</div>'}</div>
            </div>
            ${rivalPanel(st)}
          </div>
        </div>
      </div>`;
  },
  mount() {
    const st = S();
    countUp(document.querySelectorAll('.hub-kpis > div > b'), 'hub');
    // a season objective completed since the last visit: its row flashes once
    const done = (st.objectives || []).filter((o) => o.done).map((o) => o.id).join(',');
    if (hubSeenDone != null && hubSeenDone !== done) document.querySelectorAll('.sg-objs .objp.done').forEach((el) => el.classList.add('flash'));
    hubSeenDone = done;
    {
      const host = document.getElementById('hub-stage');
      if (host) { const t = playerTeam(st), d0 = teamDrivers(st, t)[0]; hubStage = mountStage(host, { id: 'hub', mode: 'hero', shift: host.clientWidth < 1150 ? 0.25 : 0.17, angle: 0.66, pitch: 0.05, dist: 8.4, fov: 22, target: [0.1, 0.72, 0], category: st.category, livery: t.car.livery, number: d0?.number, sponsor: t.sponsors[0]?.name || t.short, helmet: d0?.helmet.c1, team: { name: t.name, short: t.short }, series: cat(st).full, box: d0?.number || 1 }); }
    }
    ensureProgress(st);
    if (st.tutorialSeen && !st.quick) maybeTechDecision(st);
    if (st.pendingTech && st.tutorialSeen) {
      const pt = st.pendingTech;
      App.modal(`<div class="tiny upper" style="color:var(--team)">Decisione tecnica · ${esc(pt.tag || '')} · ${esc(pt.from)}</div><h2 style="margin-top:8px">${esc(pt.title)}</h2><p>${esc(pt.text)}</p>
        <div class="tech-grid mt16">${pt.a.map((a, i) => `<div class="card click tech-opt ${a.risk ? 'risk' : ''}" data-a="choose" data-i="${i}"><div class="tiny upper ${a.risk ? 'warn' : 'muted'}">Opzione ${i + 1}${a.risk ? ' · rischio' : ''}</div><b style="display:block;font-family:var(--display);font-size:20px;text-transform:uppercase;line-height:1.1;margin-top:6px">${esc(a.t)}</b><div class="small mt8" style="color:var(--text2)">${esc(a.note)}</div></div>`).join('')}</div>`,
        { choose(el) { const out = resolveTechDecision(st, +el.dataset.i); sfx.ok(); App.closeModal(); App.toast?.('Decisione tecnica', out); App.refresh(); } }, 'locked');
      return;
    }
    if (st.pendingEvent && st.tutorialSeen) {
      const pe = st.pendingEvent;
      App.modal(`<div class="tiny upper warn">Decisione dal paddock · ${esc(pe.from)}</div><h2 style="margin-top:8px">${esc(pe.title)}</h2><p>${esc(pe.text)}</p>
        <div class="col gap6 mt16">${pe.a.map((a, i) => `<div class="card click" data-a="choose" data-i="${i}"><b style="font-family:var(--display);font-size:19px;text-transform:uppercase">${esc(a.t)}</b><div class="small muted mt8">${esc(a.note)}</div></div>`).join('')}</div>`,
        { choose(el) { resolvePaddockEvent(st, +el.dataset.i); sfx.ok(); App.closeModal(); App.refresh(); } }, 'locked');
      return;
    }
    if (st.tutorialSeen && st.dyn?.statusUp != null) {
      const i = st.dyn.statusUp; st.dyn.statusUp = null; const S0 = STATUS[i];
      App.modal(`<div class="status-up" style="--stc:${S0.color}"><div class="tiny upper muted" style="letter-spacing:.3em">Nuovo status della squadra</div>${statusEmblem(i, 140)}<h2>${esc(S0.name)}</h2><p class="muted">Il paddock ora guarda ${esc(playerTeam(st).name)} con occhi diversi.</p><div class="col gap6 mt16" style="max-width:420px;margin:16px auto 0">${S0.perks.map((p) => `<div class="card row small">${icon('check', 'ico', 'style="width:16px;color:var(--good)"')}${esc(p)}</div>`).join('')}</div><div class="row mt24" style="justify-content:center"><button class="btn primary lg" data-a="close-modal">Avanti ${icon('right')}</button></div></div>`);
      celebrate(200); sfx.win();
      return;
    }
    if (st.tutorialSeen && !st.quick && !st.pendingTech && !st.pendingEvent) maybeDynDecision(st, { roll: false });
    if (st.pendingDyn && st.tutorialSeen) { openDynDecision(st); return; }
    if (!st.tutorialSeen) {
      st.tutorialSeen = true;
      const C = cat(st);
      App.modal(`<div class="tiny upper" style="color:var(--team)">Benvenuto, Team Principal</div><h2 style="font-size:40px;margin-top:6px">La tua prima stagione</h2>
      <div class="col gap16 mt16">
        ${[['car', 'Centro Tecnico', 'Scegli il concetto dell’auto (solo in pre-stagione!), la livrea e avvia i progetti R&D.'], ['money', 'Sponsor & Finanze', 'Hai 3 spazi sponsor: firmali subito per avere entrate ad ogni evento.'], ['users', 'Piloti & Mercato', 'Controlla morale e contratti. Il mercato è sempre aperto, ma i top driver costano.'], ['mic', 'Paddock & Consiglio', 'Leggi il giornale, sfida i team principal rivali e mantieni le promesse fatte al consiglio: il piano pluriennale fa crescere lo status della squadra.'], ['flag', 'Weekend di gara', C.type === 'rally' ? 'Shakedown per l’assetto, poi gomme e ritmo per ogni prova. Rispondi alle chiamate del copilota!' : 'Prove libere per l’assetto, qualifiche, poi in gara gestisci ritmo, gomme e pit stop.']].map(([ic, t, d]) => `<div class="row" style="align-items:flex-start;gap:16px"><div class="rating" style="flex:none;background:var(--team);color:#fff">${icon(ic)}</div><div><b style="font-family:var(--display);font-size:19px;text-transform:uppercase">${t}</b><div class="small" style="color:var(--text2)">${d}</div></div></div>`).join('')}
      </div>
      <div class="card mt24" style="box-shadow:inset 4px 0 0 var(--warn)">Obiettivo del consiglio: <b>${st.board.target}° posto</b> tra i costruttori. Se la fiducia scende troppo... potresti essere licenziato!</div>
      <div class="row mt24" style="justify-content:flex-end"><button class="btn primary lg" data-a="close-modal">Al lavoro! ${icon('right')}</button></div>`);
    }
  },
  unmount() { hubStage?.destroy(); hubStage = null; },
  actions: {},
});

function insightPanel(st, tr, t) {
  const laps = Object.values(st.teams).map((x) => ({ t: x, lap: teamBaseLap(st, x, tr) })).sort((a, b) => a.lap - b.lap);
  const myI = laps.findIndex((x) => x.t.id === t.id);
  const gap = laps[myI].lap - laps[0].lap;
  const sens = partSensitivity(st.category, tr);
  const maxS = Math.max(...Object.values(sens));
  const rows = laps.slice(0, Math.min(laps.length, 11)).map((x, i) => `<div class="insight-row ${x.t.id === t.id ? 'me' : ''}"><span class="mono muted">${i + 1}</span><span class="teamstripe" style="background:${x.t.colors[0]};height:16px"></span><span class="${x.t.id === t.id ? '' : 'muted'}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.t.name)}</span><span class="mono ${i ? '' : 'good'}">${i ? '+' + (x.lap - laps[0].lap).toFixed(3) : 'Rif.'}</span></div>`).join('');
  return `<div class="panel"><div class="panel-head"><h3>Analisi ingegneri · ${esc(tr.circuit)}</h3><span class="chip ${myI < 3 ? 'good' : myI < 6 ? 'warn' : 'bad'}">Passo previsto: ${myI + 1}ª forza (+${gap.toFixed(2)}s)</span></div>
    <div class="grid2" style="gap:28px"><div><div class="tiny upper muted mb8">Simulazione giro (vettura, asciutto)</div><div>${rows}</div></div>
    <div><div class="tiny upper muted mb8">Cosa conta su questa pista (+5 punti valgono…)</div>${Object.entries(sens).map(([k, v]) => `<div class="stat" style="grid-template-columns:110px 1fr 62px;margin-bottom:10px"><span style="color:var(--text2)">${partName(st, k)}</span>${bar((v / maxS) * 100, 'gold')}<b class="right mono">-${v.toFixed(2)}s</b></div>`).join('')}
    <div class="small mt16" style="line-height:1.5;color:var(--text2)">Suggerimento: sviluppa <b style="color:#fff">${partName(st, Object.entries(sens).sort((a, b) => b[1] - a[1])[0][0])}</b> per il prossimo GP. I valori vengono dalla fisica del tracciato reale.</div></div></div></div>`;
}

// ---------------- DYNASTY FRAGMENTS ----------------
function dynastyStrip(st) {
  const D = st.dyn; if (!D) return '';
  const si = statusInfo(st);
  const M = MANDATES[D.mandate] || MANDATES.growth;
  const steps = D.plan.steps;
  return `<section class="dyn-strip" style="--stc:${si.color}">
    <div class="dyn-status" data-a="nav" data-to="paddock" data-tab="board" style="cursor:pointer">${statusEmblem(si.idx, 66)}<div class="grow"><div class="k">Status della squadra</div><div class="v">${esc(si.name)}</div>${si.next ? `<div class="tiny muted mt8">Prossimo: <b style="color:${si.next.color}">${esc(si.next.name)}</b> · ${esc(si.nextNeed)}</div>${bar(si.prog * 100, 'gold')}` : '<div class="tiny good mt8">Vetta del paddock</div>'}</div></div>
    <div class="dyn-plan"><div class="row between"><div class="tiny upper muted" style="letter-spacing:.14em">Piano del consiglio · <b style="color:var(--text)">${esc(M.name)}</b></div><button class="btn sm ghost" data-a="nav" data-to="paddock" data-tab="board">Consiglio ${icon('right')}</button></div>
      <div class="plan-tl">${steps.map((x) => `<div class="plan-step ${x.done === true ? 'ok' : x.done === false ? 'ko' : x.season === st.season ? 'now' : ''}"><div class="y">${x.season}</div><div class="t">${esc(x.text)}</div>${x.done === true ? `<span class="s">${icon('check', 'ico', 'style="width:16px;color:var(--good)"')}</span>` : x.done === false ? `<span class="s">${icon('x', 'ico', 'style="width:16px;color:var(--bad)"')}</span>` : ''}</div>`).join('')}</div>
      ${D.promises.length ? `<div class="row wrap gap6 mt8">${D.promises.map((p) => `<span class="chip warn">${icon('board')} ${esc(p.t)}</span>`).join('')}</div>` : ''}
    </div>
  </section>`;
}

function goalsPanel(st) {
  const D = st.dyn; const t = playerTeam(st);
  if (!D?.goals || st.round >= st.calendar.length) return '';
  if (!t.sponsors.length) return `<div class="panel sp-goals"><div class="panel-head"><h3>${icon('target')} Obiettivi sponsor del weekend</h3></div><div class="small muted">Nessuno sponsor firmato: ogni sponsor ti assegna un obiettivo diverso a ogni evento, con un premio extra.</div><button class="btn sm mt16" data-a="nav" data-to="finance">Firma uno sponsor ${icon('right')}</button></div>`;
  const tot = D.goals.list.reduce((a, g) => a + g.reward, 0);
  return `<div class="panel sp-goals"><div class="panel-head"><h3>${icon('target')} Obiettivi sponsor del weekend</h3><span class="chip good">Fino a +${fmtM(tot)}</span></div>
    ${D.goals.list.map((g) => { const sp = t.sponsors.find((x) => x.id === g.sp); const sat = sp?.sat ?? 60; return `<div class="goal-row"><div class="goal-tier t${g.tier}">${'★'.repeat(g.tier)}</div><div style="min-width:0"><div class="gt">${esc(g.text)}</div><div class="gs">${esc(g.name)} · soddisfazione ${sat}%</div><div class="sat-bar"><i style="width:${sat}%;background:${sat >= 65 ? 'var(--good)' : sat >= 35 ? 'var(--warn)' : 'var(--bad)'}"></i></div></div><div class="gr">+${fmtM(g.reward)}</div></div>`; }).join('')}
    <div class="tiny muted mt8">Sponsor soddisfatti rinnovano con un aumento; quelli scontenti possono andarsene.</div></div>`;
}

function pressPanel(st) {
  const iss = pressIssues(st)[0];
  if (!iss) return st.news.length ? `<div class="panel"><div class="panel-head"><h3>Dal paddock</h3></div><div>${st.news.slice(0, 5).map((n) => `<div class="news-item"><span>${esc(n.text)}</span></div>`).join('')}</div></div>` : '';
  const lead = iss.items.find((x) => x.kind === 'lead') || iss.items[0];
  const q = iss.items.find((x) => x.kind === 'quote' && x.q);
  const qt = q ? st.teams[q.q.team] : null; const qp = q ? st.dyn.principals[q.q.team] : null;
  return `<div class="panel"><div class="panel-head"><h3>${icon('mic')} Il Paddock</h3><button class="btn sm ghost" data-a="nav" data-to="paddock" data-tab="paper">Leggi il giornale ${icon('right')}</button></div>
    <div class="press-teaser" data-a="nav" data-to="paddock" data-tab="paper">${pressArt(st, lead.img, 360, 210)}<div style="min-width:0"><span class="tag ${lead.tone === 'bad' ? 'red' : ''}">${esc(lead.tag || 'Paddock')}</span><h4>${esc(lead.h)}</h4><div class="small muted" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(lead.t || '')}</div></div></div>
    ${q && qt && qp ? `<div class="row mt16" style="gap:12px;align-items:flex-start">${portraitSVG(qp, qt, 46)}<div class="tp-quote" style="--tc:${teamCol(qt)};margin:0;flex:1">${esc(q.q.text)}<div class="tiny muted mt8" style="font-style:normal">${esc(qp.name)} · ${esc(qt.name)}</div></div></div>` : ''}
    <div class="mt8">${iss.items.filter((x) => x.kind === 'brief').slice(0, 3).map((n) => `<div class="news-item"><span>${esc(n.h)}</span></div>`).join('')}</div>
  </div>`;
}

function openDynDecision(st) {
  const v = dynDecisionView(st); if (!v) { st.pendingDyn = null; return; }
  const pd = st.pendingDyn;
  const head = v.persona && v.team ? `<div class="dyn-head">${portraitSVG(v.persona, v.team, 96)}<div class="grow"><div class="tiny upper">${esc(v.tag)} · ${esc(v.from)}</div><h2 style="margin-top:6px">${esc(v.title)}</h2></div></div>`
    : `<div class="tiny upper" style="color:var(--team)">${esc(v.tag)} · ${esc(v.from)}</div><h2 style="margin-top:8px">${esc(v.title)}</h2>`;
  const board = pd.kind === 'board' ? `<div class="mt8">${boardTable(st)}</div>` : '';
  App.modal(`${head}${board}<p style="color:var(--text2);line-height:1.6">${esc(v.text)}</p>
    <div class="dyn-opts mt16">${v.a.map((a, i) => `<div class="card click ${a.risk ? 'risk' : ''}" data-a="choose" data-i="${i}"><div class="tiny upper ${a.risk ? 'warn' : 'muted'}">Opzione ${i + 1}${a.risk ? ' · rischio' : ''}</div><b>${esc(a.t)}</b><div class="small mt8" style="color:var(--text2)">${esc(a.note)}</div></div>`).join('')}</div>`,
  { choose(el) { const out = resolveDynDecision(st, +el.dataset.i); sfx.ok(); App.closeModal(); if (out) App.toast(v.title, out); App.refresh(); } }, 'locked wide');
}
