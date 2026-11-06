import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, flagSVG, helmetSVG, trackSVG, teamBadge } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, teamDrivers, standings, partRanking, fmtM, rdSlots, RD_TIERS, partName, freeAgents, seatsPerTeam } from '../engine/season.js';
import { genStage, circuitPath, STAGE_STYLE } from '../ui/trackview.js';
import { partSensitivity, trackStats } from '../engine/trackphys.js';
import { ensureProgress } from '../engine/progress.js';
import { resolvePaddockEvent } from '../engine/events.js';
import { sfx } from '../ui/audio.js';
import { SURFACES } from '../data/categories.js';
import { driverChip, ovr, ratingBox, moraleChip, teamStripe } from './common.js';

export function nextEventInfo(st) {
  const ev = st.calendar[st.round];
  if (!ev) return null;
  const tr = getTrack(st.category, ev.trackId);
  return { ev, tr };
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

    let hero = '';
    if (info) {
      const { ev, tr } = info;
      const path = st.category === 'rally' ? genStage(tr.seed, STAGE_STYLE[tr.id]) : circuitPath(tr.cid);
      const sub = st.category === 'rally' ? `${ev.stages.length} prove speciali · ${ev.stages.reduce((a, b) => a + b.km, 0)} km` : `${tr.circuit}${tr.hours ? ` · ${tr.hours} ore` : ''}`;
      const surfaces = st.category === 'rally' ? [...new Set(ev.stages.map((x) => x.surface))].map((x) => `<span class="chip" style="border-color:${SURFACES[x].color}">${SURFACES[x].name}</span>`).join('') : '';
      let traits = '';
      if (st.category !== 'rally') {
        const sens = partSensitivity(st.category, tr);
        const ts = trackStats(st.category, tr);
        const key = Object.entries(sens).sort((a, b) => b[1] - a[1])[0][0];
        traits = `<span class="chip">${(ts.len / 1000).toFixed(3)} km · ${ts.corners} curve</span><span class="chip">V. max ${Math.round(ts.vmax)} km/h</span><span class="chip warn">Chiave: ${partName(st, key)}</span>`;
      }
      hero = `<div class="hero">
        <div>
          <div class="row"><span class="chip">Round ${ev.round} di ${st.calendar.length}</span>${tr.night ? `<span class="chip info">${icon('moon', 'ico', 'style="width:13px"')} Notturna</span>` : ''}${tr.double ? '<span class="chip warn">Punti doppi</span>' : ''}</div>
          <div class="row mt16" style="gap:14px">${flagSVG(tr.nat, 46, 30)}<div class="evname">${esc(tr.name)}</div></div>
          <div class="muted mt8 upper small">${esc(sub)}</div>
          <div class="row wrap mt16 gap6">${surfaces}${traits}<span class="chip ${tr.rain > 0.35 ? 'info' : ''}">${icon(tr.rain > 0.35 ? 'rain' : 'sun', 'ico', 'style="width:13px"')} Pioggia ${Math.round(tr.rain * 100)}%</span>${tr.ovt != null ? `<span class="chip">Sorpassi: ${tr.ovt > 0.6 ? 'facili' : tr.ovt > 0.3 ? 'medi' : 'difficili'}</span>` : ''}</div>
          <div class="row mt24"><button class="btn primary xl" data-a="continue">${st.weekend ? 'Riprendi il Weekend' : 'Vai al Weekend'} ${icon('right')}</button></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center">${trackSVG(path, { w: 420, h: 220, glow: 'var(--team)', color: '#e9edf3' })}</div>
      </div>`;
    } else hero = `<div class="hero"><div><div class="evname">Stagione conclusa</div><div class="muted mt8">Tutti gli eventi sono stati disputati.</div><div class="row mt24"><button class="btn primary xl" data-a="continue">Bilancio di fine stagione ${icon('right')}</button></div></div></div>`;

    const parts = C.parts.map((p) => {
      const rank = partRanking(st, p.id).indexOf(t.id) + 1;
      return `<div class="stat" style="grid-template-columns:120px 1fr 34px 34px"><span class="muted">${p.name}</span>${bar(t.car.parts[p.id])}<b class="right mono">${Math.round(t.car.parts[p.id])}</b><span class="rank small ${rank <= 3 ? 'good' : rank > 7 ? 'bad' : 'muted'}">${rank}°</span></div>`;
    }).join('');

    return `<div class="screen-title"><div><div class="sub">${esc(C.full)} · Stagione ${st.season}</div><h1>Panoramica</h1></div></div>
      <div class="col gap24 anim-in">
        ${hero}
        <div class="grid4">
          <div class="panel"><div class="kpi"><b>${tpos}°</b><span>Costruttori (obiettivo ${st.board.target}°)</span></div></div>
          <div class="panel"><div class="kpi"><b>${s.teams.find((x) => x.id === t.id)?.pts || 0}</b><span>Punti squadra</span></div></div>
          <div class="panel"><div class="kpi"><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><span>Budget disponibile</span></div></div>
          <div class="panel"><div class="kpi"><b>${st.board.confidence}%</b><span>Fiducia del consiglio</span></div>${bar(st.board.confidence, st.board.confidence < 30 ? 'red' : st.board.confidence > 65 ? 'green' : 'gold')}</div>
        </div>
        <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px">
          <div class="col gap16">
            <div class="panel"><div class="panel-head"><h3>I tuoi piloti</h3><button class="btn sm ghost" data-a="nav" data-to="drivers">Dettagli ${icon('right')}</button></div>
              <div class="grid2">${myDrivers.map((d) => { const p = s.drivers.findIndex((x) => x.id === d.id) + 1; const pts = s.drivers.find((x) => x.id === d.id)?.pts || 0; return `<div class="card row" style="gap:12px">${helmetSVG(d.helmet, 54)}<div class="grow"><div class="row">${flagSVG(d.nat)}<b>${esc(d.name)}</b></div><div class="small muted mt8">#${d.number} · ${d.age} anni · ${p}° (${pts} pt)</div><div class="mt8">${moraleChip(d.morale)}</div></div>${ratingBox(ovr(st, d), false)}</div>`; }).join('') || '<div class="muted">Nessun pilota</div>'}</div>
            </div>
            <div class="panel"><div class="panel-head"><h3>La vettura</h3><button class="btn sm ghost" data-a="nav" data-to="car">Centro Tecnico ${icon('right')}</button></div>
              <div style="display:grid;grid-template-columns:1fr 1.1fr;gap:18px;align-items:center"><div class="car-stage" style="min-height:160px"><div class="grid-floor"></div>${carSVG(st.category, t.car.livery, { number: myDrivers[0]?.number, sponsor: t.sponsors[0]?.name, helmet: myDrivers[0]?.helmet.c1 })}</div><div class="col gap6">${parts}</div></div>
              ${t.projects.length ? `<div class="row wrap mt16 gap6">${t.projects.map((p) => `<span class="chip info">${icon('rd', 'ico', 'style="width:13px"')} ${partName(st, p.part)} · ${RD_TIERS[p.tier].name} · ${p.racesLeft} ${p.racesLeft === 1 ? 'evento' : 'eventi'}</span>`).join('')}</div>` : ''}
            </div>
          </div>
          <div class="col gap16">
            ${st.objectives?.length ? `<div class="panel"><div class="panel-head"><h3>Obiettivi stagionali</h3><span class="chip">Lv ${st.career.level || 1}</span></div><div class="col gap6">${st.objectives.map((o) => `<div class="row small">${icon(o.done ? 'check' : 'target', 'ico', `style="width:16px;color:${o.done ? 'var(--good)' : 'var(--muted)'}"`)}<span class="grow ${o.done ? 'good' : ''}">${esc(o.text)}</span><span class="tiny muted">${o.xp} XP</span></div>`).join('')}</div></div>` : ''}
            ${todo.length ? `<div class="panel"><div class="panel-head"><h3>Da fare</h3></div><div class="col gap6">${todo.map(([cls, txt, to]) => `<div class="card click row" data-a="nav" data-to="${to}" style="padding:10px 12px"><span class="chip ${cls}" style="width:10px;height:10px;padding:0"></span><span class="grow small">${txt}</span>${icon('right', 'ico', 'style="width:14px;opacity:.5"')}</div>`).join('')}</div></div>` : ''}
            <div class="panel"><div class="panel-head"><h3>Classifica piloti</h3><button class="btn sm ghost" data-a="nav" data-to="standings">Tutte ${icon('right')}</button></div>
              <table class="tbl"><tbody>${s.drivers.slice(0, 6).map((x, i) => { const d = st.drivers[x.id]; const tm = st.teams[d.teamId]; return `<tr class="${d.teamId === t.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${tm ? teamStripe(tm) : ''}</td><td>${driverChip(st, d, { helmet: false })}</td><td class="right mono"><b>${x.pts}</b></td></tr>`; }).join('')}</tbody></table>
            </div>
            <div class="panel"><div class="panel-head"><h3>Posta recente</h3><button class="btn sm ghost" data-a="nav" data-to="inbox">Apri ${icon('right')}</button></div>
              <div class="col gap4">${st.inbox.slice(0, 4).map((m) => `<div class="mail ${m.read ? '' : 'unread'} ${m.type}" data-a="nav" data-to="inbox" data-mail="${m.id}"><div class="ic">${icon(m.icon || 'mail')}</div><div class="grow" style="min-width:0"><div class="subj small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.subject)}</div><div class="tiny muted">${esc(m.from)}</div></div></div>`).join('') || '<div class="muted small">Nessun messaggio</div>'}</div>
            </div>
            ${st.news.length ? `<div class="panel"><div class="panel-head"><h3>Dal paddock</h3></div><div class="col gap6 small">${st.news.slice(0, 5).map((n) => `<div class="row" style="align-items:flex-start"><span class="dim">●</span><span>${esc(n.text)}</span></div>`).join('')}</div></div>` : ''}
          </div>
        </div>
      </div>`;
  },
  mount() {
    const st = S();
    ensureProgress(st);
    if (st.pendingEvent && st.tutorialSeen) {
      const pe = st.pendingEvent;
      App.modal(`<div class="tiny upper warn" style="letter-spacing:.3em">Decisione dal paddock · ${esc(pe.from)}</div><h2 style="margin-top:6px">${esc(pe.title)}</h2><p class="muted" style="line-height:1.6">${esc(pe.text)}</p>
        <div class="col gap6 mt16">${pe.a.map((a, i) => `<div class="card click" data-a="choose" data-i="${i}"><b>${esc(a.t)}</b><div class="tiny muted mt8">${esc(a.note)}</div></div>`).join('')}</div>`,
        { choose(el) { resolvePaddockEvent(st, +el.dataset.i); sfx.ok(); App.closeModal(); App.refresh(); } }, 'locked');
      return;
    }
    if (!st.tutorialSeen) {
      st.tutorialSeen = true;
      const C = cat(st);
      App.modal(`<div class="tiny upper muted" style="letter-spacing:.3em">Benvenuto, Team Principal</div><h2 style="font-size:28px;font-style:italic">La tua prima stagione</h2>
      <div class="col gap16 mt16">
        ${[['car', 'Centro Tecnico', 'Scegli il concetto dell’auto (solo in pre-stagione!), la livrea e avvia i progetti R&D.'], ['money', 'Sponsor & Finanze', 'Hai 3 spazi sponsor: firmali subito per avere entrate ad ogni evento.'], ['users', 'Piloti & Mercato', 'Controlla morale e contratti. Il mercato è sempre aperto, ma i top driver costano.'], ['flag', 'Weekend di gara', C.type === 'rally' ? 'Shakedown per l’assetto, poi gomme e ritmo per ogni prova. Rispondi alle chiamate del copilota!' : 'Prove libere per l’assetto, qualifiche, poi in gara gestisci ritmo, gomme e pit stop.']].map(([ic, t, d]) => `<div class="row" style="align-items:flex-start;gap:14px"><div class="rating" style="flex:none">${icon(ic)}</div><div><b>${t}</b><div class="small muted">${d}</div></div></div>`).join('')}
      </div>
      <div class="card mt16 small">Obiettivo del consiglio: <b>${st.board.target}° posto</b> tra i costruttori. Se la fiducia scende troppo... potresti essere licenziato!</div>
      <div class="row mt24" style="justify-content:flex-end"><button class="btn primary lg" data-a="close-modal">Al lavoro! ${icon('right')}</button></div>`);
    }
  },
  actions: {},
});
