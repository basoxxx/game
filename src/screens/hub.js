import { carImg } from '../ui/garage3d.js';
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, flagSVG, helmetSVG, trackSVG, teamBadge } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
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
  return `<div class="panel"><div class="panel-head"><h3>${icon('flame')} Tensione tra piloti</h3></div><div>${list.map((r) => { const a = st.drivers[r.a], b = st.drivers[r.b]; const c = heatColor(r.heat); return `<div class="rival-row ${r.mine ? 'mine' : ''}"><div class="row between"><b style="font-family:var(--display);font-size:18px;text-transform:uppercase">${esc(a.name.split(' ').slice(-1)[0])} <span class="dim">vs</span> ${esc(b.name.split(' ').slice(-1)[0])}</b><span style="font-family:var(--display);font-size:13px;letter-spacing:.1em;color:${c};font-weight:800">${heatLabel(r.heat).toUpperCase()}</span></div><div class="heat"><i style="width:${Math.round(r.heat)}%;background:${c}"></i></div><div class="small muted">${r.mates ? 'Compagni di squadra · ' : ''}${esc(r.why)}</div></div>`; }).join('')}</div></div>`;
}

registerScreen({
  id: 'hub',
  render() {
    const st = S();
    const t = playerTeam(st);
    const C = cat(st);
    const info = nextEventInfo(st);
    const s = standings(st);
    const tpos = s.teams.findIndex((x) => x.id === t.id) + 1;
    const myDrivers = teamDrivers(st, t);
    const sponsorSlots = 3 - t.sponsors.length;
    const todo = [];
    if (myDrivers.length < seatsPerTeam(st)) todo.push(['bad', 'Sedili vuoti! Ingaggia un pilota', 'market']);
    if (sponsorSlots > 0 && st.sponsorOffers.length) todo.push(['warn', sponsorSlots === 1 ? '1 spazio sponsor libero' : `${sponsorSlots} spazi sponsor liberi`, 'finance']);
    if (t.projects.length < rdSlots(t, st)) todo.push(['warn', rdSlots(t, st) - t.projects.length === 1 ? '1 slot R&D inattivo' : `${rdSlots(t, st) - t.projects.length} slot R&D inattivi`, 'car']);
    if (st.round === 0 && t.car.concept === 'balanced' && !st._conceptSeen) todo.push(['info', 'Scegli il concetto della nuova vettura', 'car']);
    const unread = st.inbox.filter((m) => !m.read).length;
    if (st.career.points) todo.push(['good', `${st.career.points} punti abilità da spendere`, 'career']);
    if (unread) todo.push(['info', unread === 1 ? '1 messaggio non letto' : `${unread} messaggi non letti`, 'inbox']);
    if (st.ultimatum?.season === st.season) { const my = s.teams.find((x) => x.id === t.id)?.pts || 0; todo.unshift(['bad', `Ultimatum del consiglio: ${Math.max(0, my - st.ultimatum.start)}/${st.ultimatum.need} punti entro il round ${st.ultimatum.until}`, 'standings']); }
    for (const d of myDrivers) { if (d.rivalOffer) todo.unshift(['bad', `${d.name} ha un’offerta da ${st.teams[d.rivalOffer.teamId]?.name}: rinnova o lo perderai`, 'drivers']); else if (d.nextTeam && d.nextTeam !== t.id) todo.push(['warn', `${d.name} partirà a fine anno: trova un sostituto`, 'market']); }

    let hero = '';
    const myD0 = myDrivers[0];
    const heroCar = carImg(st.category, t.car.livery, { number: myD0?.number, sponsor: t.sponsors[0]?.name, helmet: myD0?.helmet.c1 }, 900, 400);
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
      hero = `<section class="hub-hero">
        <div class="hh-info">
          <div class="hh-eyebrow">Prossimo evento · Round ${ev.round} / ${st.calendar.length} ${tags}</div>
          <div class="hh-name">${flagSVG(tr.nat, 48, 32)}<span>${esc(tr.name)}</span></div>
          <div class="hh-circ">${esc(sub)}</div>
          <div class="hh-facts">${facts}</div>
          <div class="hh-cta"><button class="btn primary xl" data-a="continue">${st.weekend ? 'Riprendi il Weekend' : 'Vai al Weekend'} ${icon('right')}</button></div>
        </div>
        <div class="hh-visual"><div class="hh-track">${trackSVG(path, { w: 520, h: 300, glow: null, color: 'rgba(255,255,255,.85)', width: 4, under: 'rgba(0,0,0,.35)' })}</div><div class="hh-car">${heroCar}</div></div>
      </section>`;
    } else hero = `<section class="hub-hero"><div class="hh-info"><div class="hh-eyebrow">Stagione ${st.season}</div><div class="hh-name">Stagione conclusa</div><div class="hh-circ">Tutti gli eventi sono stati disputati.</div><div class="hh-cta" style="margin-top:28px"><button class="btn primary xl" data-a="continue">Bilancio di fine stagione ${icon('right')}</button></div></div><div class="hh-visual"><div class="hh-car">${heroCar}</div></div></section>`;

    const parts = C.parts.map((p) => {
      const rank = partRanking(st, p.id).indexOf(t.id) + 1;
      return `<div class="stat" style="grid-template-columns:120px 1fr 40px 34px"><span style="color:var(--text2)">${p.name}</span>${bar(t.car.parts[p.id])}<b class="right mono">${Math.round(t.car.parts[p.id])}</b><span class="rank ${rank <= 3 ? 'good' : rank > 7 ? 'bad' : 'muted'}">${rank}°</span></div>`;
    }).join('');
    const myPts = s.teams.find((x) => x.id === t.id)?.pts || 0;
    const leaderPts = s.teams[0]?.pts || 0;
    const conf = st.board.confidence;

    return `<div class="screen-title"><div><div class="sub">${esc(C.full)} · Stagione ${st.season}</div><h1>Panoramica</h1></div></div>
      <div class="col gap16 anim-in">
        ${hero}
        <div class="hub-kpis">
          <div><b class="${tpos <= st.board.target ? '' : 'bad'}">${tpos}°<small>obiettivo ${st.board.target}°</small></b><span>Campionato costruttori</span></div>
          <div><b>${myPts}${leaderPts > myPts ? `<small>−${leaderPts - myPts} dal leader</small>` : myPts ? '<small>in testa</small>' : ''}</b><span>Punti squadra</span></div>
          <div><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><span>Budget disponibile</span></div>
          <div><b style="color:${conf < 30 ? 'var(--bad)' : conf > 65 ? 'var(--good)' : 'var(--warn)'}">${conf}%</b><span>Fiducia del consiglio</span>${bar(conf, conf < 30 ? 'red' : conf > 65 ? 'green' : 'gold')}</div>
        </div>
        <div class="hub-grid">
          <div class="col gap16">
            <div class="panel"><div class="panel-head"><h3>I tuoi piloti</h3><button class="btn sm ghost" data-a="nav" data-to="drivers">Dettagli ${icon('right')}</button></div>
              ${myDrivers.map((d) => { const p = s.drivers.findIndex((x) => x.id === d.id) + 1; const pts = s.drivers.find((x) => x.id === d.id)?.pts || 0; return `<div class="drv-row"><div class="row" style="gap:12px"><span class="drv-num">${d.number}</span>${helmetSVG(d.helmet, 52)}</div><div style="min-width:0"><div class="row" style="gap:8px">${flagSVG(d.nat)}<span class="drv-name">${esc(d.name)}</span></div><div class="drv-meta">${p}° in classifica · ${pts} pt · ${d.age} anni</div><div class="mt8">${moraleChip(d.morale)}</div></div>${ratingBox(ovr(st, d), false)}</div>`; }).join('') || '<div class="muted">Nessun pilota</div>'}
            </div>
            ${info && st.category !== 'rally' ? insightPanel(st, info.tr, t) : ''}
            <div class="panel"><div class="panel-head"><h3>La vettura</h3><button class="btn sm ghost" data-a="nav" data-to="car">Centro Tecnico ${icon('right')}</button></div>
              <div class="col" style="gap:12px">${parts}</div>
              ${t.projects.length ? `<div class="row wrap mt16 gap6">${t.projects.map((p) => `<span class="chip info">${icon('rd')} ${partName(st, p.part)} · ${RD_TIERS[p.tier].name} · ${p.racesLeft} ${p.racesLeft === 1 ? 'evento' : 'eventi'}</span>`).join('')}</div>` : ''}
            </div>
          </div>
          <div class="col gap16">
            ${todo.length ? `<div class="panel"><div class="panel-head"><h3>Da fare</h3><span class="small muted">${todo.length}</span></div><div>${todo.map(([cls, txt, to]) => `<div class="todo t-${cls}" data-a="nav" data-to="${to}"><span class="grow">${txt}</span>${icon('right')}</div>`).join('')}</div></div>` : ''}
            ${st.objectives?.length ? `<div class="panel"><div class="panel-head"><h3>Obiettivi stagionali</h3><span class="small muted">Manager Lv ${st.career.level || 1}</span></div><div>${st.objectives.map((o) => `<div class="obj-row">${icon(o.done ? 'check' : 'target', 'ico', `style="width:18px;height:18px;flex:none;color:${o.done ? 'var(--good)' : 'var(--dim)'}"`)}<span class="grow ${o.done ? 'good' : ''}">${esc(o.text)}</span><span class="small muted mono">${o.xp} XP</span></div>`).join('')}</div></div>` : ''}
            <div class="panel"><div class="panel-head"><h3>Classifica piloti</h3><button class="btn sm ghost" data-a="nav" data-to="standings">Tutte ${icon('right')}</button></div>
              <table class="tbl"><tbody>${s.drivers.slice(0, 6).map((x, i) => { const d = st.drivers[x.id]; const tm = st.teams[d.teamId]; return `<tr class="${d.teamId === t.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td style="width:8px;padding-left:0;padding-right:0">${tm ? teamStripe(tm) : ''}</td><td>${driverChip(st, d, { helmet: false })}</td><td class="right mono"><b>${x.pts}</b></td></tr>`; }).join('')}</tbody></table>
            </div>
            <div class="panel"><div class="panel-head"><h3>Posta recente</h3><button class="btn sm ghost" data-a="nav" data-to="inbox">Apri ${icon('right')}</button></div>
              <div style="margin:-6px -20px -20px">${st.inbox.slice(0, 4).map((m) => `<div class="mail ${m.read ? '' : 'unread'} ${m.type}" data-a="nav" data-to="inbox" data-mail="${m.id}"><div class="ic">${icon(m.icon || 'mail')}</div><div class="grow" style="min-width:0"><div class="subj" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.subject)}</div><div class="tiny muted">${esc(m.from)}</div></div></div>`).join('') || '<div class="muted small" style="padding:14px 20px">Nessun messaggio</div>'}</div>
            </div>
            ${rivalPanel(st)}
            ${st.news.length ? `<div class="panel"><div class="panel-head"><h3>Dal paddock</h3></div><div>${st.news.slice(0, 5).map((n) => `<div class="news-item"><span>${esc(n.text)}</span></div>`).join('')}</div></div>` : ''}
          </div>
        </div>
      </div>`;
  },
  mount() {
    const st = S();
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
    if (!st.tutorialSeen) {
      st.tutorialSeen = true;
      const C = cat(st);
      App.modal(`<div class="tiny upper" style="color:var(--team)">Benvenuto, Team Principal</div><h2 style="font-size:40px;margin-top:6px">La tua prima stagione</h2>
      <div class="col gap16 mt16">
        ${[['car', 'Centro Tecnico', 'Scegli il concetto dell’auto (solo in pre-stagione!), la livrea e avvia i progetti R&D.'], ['money', 'Sponsor & Finanze', 'Hai 3 spazi sponsor: firmali subito per avere entrate ad ogni evento.'], ['users', 'Piloti & Mercato', 'Controlla morale e contratti. Il mercato è sempre aperto, ma i top driver costano.'], ['flag', 'Weekend di gara', C.type === 'rally' ? 'Shakedown per l’assetto, poi gomme e ritmo per ogni prova. Rispondi alle chiamate del copilota!' : 'Prove libere per l’assetto, qualifiche, poi in gara gestisci ritmo, gomme e pit stop.']].map(([ic, t, d]) => `<div class="row" style="align-items:flex-start;gap:16px"><div class="rating" style="flex:none;background:var(--team);color:#fff">${icon(ic)}</div><div><b style="font-family:var(--display);font-size:19px;text-transform:uppercase">${t}</b><div class="small" style="color:var(--text2)">${d}</div></div></div>`).join('')}
      </div>
      <div class="card mt24" style="box-shadow:inset 4px 0 0 var(--warn)">Obiettivo del consiglio: <b>${st.board.target}° posto</b> tra i costruttori. Se la fiducia scende troppo... potresti essere licenziato!</div>
      <div class="row mt24" style="justify-content:flex-end"><button class="btn primary lg" data-a="close-modal">Al lavoro! ${icon('right')}</button></div>`);
    }
  },
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
