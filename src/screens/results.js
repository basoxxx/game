import { carImg, helmet3D } from '../ui/stage3d.js';
import { App, registerScreen, trackName, teamColor } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge, carSVG } from '../ui/art.js';
import { esc, fmtTime, fmtGap, fmtLong, pageHead } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, standings } from '../engine/season.js';
import { driverChip, teamStripe, tyreBadge } from './common.js';
import { pressQuestion } from '../engine/events.js';
import { recordChallenge, CHALLENGES } from './challenges.js';
import { sfx } from '../ui/audio.js';
import { fmtM } from '../engine/season.js';
import { principal, TP_PERSONAS } from '../engine/dynasty.js';
import { portraitSVG, teamCol } from './career-ui.js';
import { hasReel } from '../engine/highlights.js';
import { openSavedHighlights } from './highlights.js';

export function celebrate(n = 150) {
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#ffcc33', '#e10600', '#ffffff', '#22d37a', '#3aa0ff', getComputedStyle(document.documentElement).getPropertyValue('--team').trim() || '#fff'];
  const ps = Array.from({ length: n }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)], w: 6 + Math.random() * 6, h: 3 + Math.random() * 5 }));
  let f = 0;
  const loop = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
    if (f++ < 260) requestAnimationFrame(loop); else cv.remove();
  };
  loop();
}

registerScreen({
  id: 'results', full: true,
  render(params) {
    const st = S();
    const ev = st.calendar[params?.idx ?? st.round - 1];
    if (!ev?.results) return `<div class="full-screen">${pageHead({ backAction: 'done', title: 'Risultati' })}<div class="empty">Nessun risultato</div></div>`;
    const tr = getTrack(st.category, ev.trackId);
    const res = ev.results;
    const pt = playerTeam(st);
    const C = cat(st);
    const top3 = res.classification.slice(0, 3);
    const s = standings(st);
    const rally = st.category === 'rally';
    const pod = (r, cls) => {
      const d = st.drivers[r.driverIds[0]]; const tm = st.teams[r.teamId];
      return `<div class="pd ${cls}"><div>${helmet3D(d.helmet, 46)}</div><div class="pd-name">${esc(r.driverIds.map((id) => st.drivers[id].name.split(' ').slice(-1)[0]).join(' / '))}</div><div class="pd-team">${esc(tm.name)}</div><div class="block">${r.pos}</div></div>`;
    };
    const mine = res.classification.filter((r) => r.teamId === pt.id);
    const w0 = top3[0]; const wd = st.drivers[w0.driverIds[0]]; const wt = st.teams[w0.teamId];
    const wcol = teamColor(wt.car.livery);
    return `<div class="full-screen" style="--pc:${wcol}">
      ${pageHead({ backAction: 'done', eyebrow: `Risultati · Round ${ev.round} · ${esc(C.name)}`, title: esc(tr.name), right: `${hasReel(st, params?.idx ?? st.round - 1) ? `<button class="btn lg hl-open" data-a="highlights" data-tip="Rivedi i momenti migliori ${rally ? 'del rally' : 'della gara'} con la regia TV">${icon('replay')} Highlights</button>` : ''}<button class="btn primary xl" data-a="done">${S().quick ? 'Nuova gara rapida' : 'Continua'} ${icon('right')}</button>` })}
      <section class="res-hero" style="--wc:${wcol}">
        <div class="rh-info">
          <div class="hh-eyebrow">${flagSVG(tr.nat, 30, 20)} ${rally ? 'Vincitore del rally' : 'Vincitore'}</div>
          <div class="rh-win">${esc(w0.driverIds.map((id) => st.drivers[id].name).join(' / '))}</div>
          <div class="hh-circ">${esc(wt.name)}${rally ? '' : w0.bestLap ? ` · giro migliore ${fmtTime(w0.bestLap)}` : ''}</div>
          <div class="podium">${top3[1] ? pod(top3[1], 'p2') : ''}${pod(top3[0], 'p1')}${top3[2] ? pod(top3[2], 'p3') : ''}</div>
        </div>
        <div class="rh-car">${carImg(st.category, wt.car.livery, { number: wd.number, sponsor: wt.sponsors[0]?.name }, 900, 400, carSVG(st.category, wt.car.livery, { number: wd.number, sponsor: wt.sponsors[0]?.name || wt.short }))}</div>
      </section>
      <div class="res-grid">
        <div class="panel flush"><table class="tbl"><thead><tr><th>Pos</th><th></th><th>${C.driversPerCar > 1 ? 'Equipaggio' : 'Pilota'}</th><th>Team</th>${rally ? '<th class="right">PS vinte</th><th class="right">Tempo</th>' : '<th class="right">Griglia</th><th>Gomme</th><th class="right">Soste</th><th class="right">Best</th>'}<th class="right">Distacco</th><th class="right">Pt</th></tr></thead><tbody>
          ${res.classification.map((r) => { const tm = st.teams[r.teamId]; const d = st.drivers[r.driverIds[0]]; return `<tr class="${tm.isPlayer ? 'me' : ''}"><td class="pos p${r.pos}">${r.status === 'dnf' ? 'RIT' : r.pos}</td><td style="width:8px;padding-left:0;padding-right:0">${teamStripe(tm)}</td><td>${C.driversPerCar > 1 ? `<div class="small"><b>${r.driverIds.map((id) => esc(st.drivers[id].name)).join(' / ')}</b></div>` : driverChip(st, d, { size: 22 })}</td><td class="small muted">${esc(tm.name)}</td>${rally ? `<td class="right mono">${r.stageWins || 0}</td><td class="right mono small">${r.time ? fmtLong(r.time) : '-'}</td>` : `<td class="right mono">${r.grid}</td><td><div class="row gap4">${(r.tyres || []).map((t) => tyreBadge(t)).join('')}</div></td><td class="right mono">${r.pitStops}</td><td class="right mono small ${res.fastest?.key === r.key ? 'fastest' : ''}"${res.fastest?.key === r.key ? ' data-tip="Giro più veloce della gara"' : ''}>${fmtTime(r.bestLap)}</td>`}<td class="right mono small">${r.status === 'dnf' ? `<span class="bad">${esc(r.reason || 'Ritiro')}</span>` : r.pos === 1 ? (rally ? '' : 'Vincitore') : rally ? fmtGap(r.gap) : fmtGap(r.gap)}</td><td class="right mono"><b>${r.pts || ''}</b>${r.ps ? `<span class="tiny warn"> (+${r.ps} PS)</span>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="col gap16">
          ${weekendReport(st, ev)}
          <div class="panel"><div class="panel-head"><h3>La tua squadra</h3><span class="row" style="gap:8px">${teamBadge(pt, 24)}<span class="small muted">${esc(pt.name)}</span></span></div>${mine.map((r) => { const d = st.drivers[r.driverIds[0]]; return `<div class="res-mine">${helmet3D(d.helmet, 44)}<div class="grow"><div class="drv-name">${esc(r.driverIds.map((id) => st.drivers[id].name).join(' / '))}</div><div class="drv-meta">${r.status === 'dnf' ? `Ritirato (${esc(r.reason || '')})` : `Arrivato ${r.pos}°${rally ? '' : ` · partito ${r.grid}°`}${r.pts ? ` · +${r.pts} punti` : ''}`}</div></div><div class="rm-pos pos p${r.pos}">${r.status === 'dnf' ? '—' : 'P' + r.pos}</div></div>`; }).join('')}</div>
          ${(res.penalties || []).length ? `<div class="panel"><div class="panel-head"><h3>${icon('scales')} Decisioni dei commissari</h3></div><table class="tbl small"><tbody>${res.penalties.map((p) => `<tr class="${p.teamId === pt.id ? 'me' : ''}"><td class="muted tiny">G${p.lap || '-'}</td><td>${esc(st.drivers[p.driverId]?.name || '')}</td><td class="small">${esc(p.text)}</td><td class="right mono tiny ${p.pts ? 'bad' : 'dim'}">${p.pts ? '+' + p.pts + ' pt' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${res.sprint ? `<div class="panel"><div class="panel-head"><h3>${icon('bolt')} Sprint</h3></div><table class="tbl small"><tbody>${res.sprint.filter((r) => r.pts > 0).map((r) => `<tr class="${r.teamId === pt.id ? 'me' : ''}"><td class="pos p${r.pos}">${r.pos}</td><td>${esc(st.drivers[r.driverIds[0]]?.name || '')}</td><td class="right mono"><b>+${r.pts}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
          ${rally && res.stages ? `<div class="panel"><div class="panel-head"><h3>Prove speciali</h3></div><table class="tbl small"><tbody>${res.stages.map((sg, i) => { const w = res.classification.find((c) => c.key === sg.winner); return `<tr><td class="muted">PS${i + 1}</td><td>${esc(sg.name)}${sg.power ? ' <span class="chip warn tiny">Power</span>' : ''}</td><td>${w ? esc(st.drivers[w.driverIds[0]].name) : '-'}</td><td class="right mono">${sg.best ? fmtLong(sg.best) : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
          <div class="panel"><div class="panel-head"><h3>Campionato</h3></div><table class="tbl small"><tbody>${s.drivers.slice(0, 8).map((x, i) => { const d = st.drivers[x.id]; return `<tr class="${d.teamId === pt.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${driverChip(st, d, { helmet: false })}</td><td class="right mono"><b>${x.pts}</b></td></tr>`; }).join('')}</tbody></table></div>
        </div>
      </div>
    </div>`;
  },
  mount() {
    const st = S();
    const ev = st.calendar[App.params?.idx ?? st.round - 1];
    const mine = ev?.results?.classification.filter((r) => r.teamId === st.playerTeam) || [];
    if (mine.some((r) => r.pos === 1 && r.status !== 'dnf')) celebrate(220);
    if (st.challenge && ev?.results && !st._chDone) {
      st._chDone = true;
      const r = recordChallenge(st, ev.results); const ch = CHALLENGES.find((c) => c.id === st.challenge);
      const M = [['ORO', '#ffcc33', 'D’ORO'], ['ARGENTO', '#c9d1dc', 'D’ARGENTO'], ['BRONZO', '#d98c4a', 'DI BRONZO']];
      setTimeout(() => App.modal(`<div style="text-align:center"><div class="tiny upper muted" style="letter-spacing:.3em">Sfida · ${esc(ch.title)}</div>${r.medal >= 0 ? `${medalSVG(M[r.medal][1])}<h2 style="color:${M[r.medal][1]}">Medaglia ${M[r.medal][2]}</h2>` : `<div style="margin:14px auto 8px;width:84px;height:84px;display:flex;align-items:center;justify-content:center;background:var(--s3);color:var(--muted)">${icon('x', 'ico', 'style="width:44px;height:44px"')}</div><h2>Sfida non superata</h2>`}<p class="muted">Miglior risultato: ${r.best === 99 ? 'ritiro' : 'P' + r.best} · Obiettivi: ${ch.medals.map((p, i) => M[i][0] + ' P' + p).join(' · ')}</p><div class="row mt16 center gap6"><button class="btn" data-a="close-modal">Chiudi</button><button class="btn primary" data-a="again">Altre sfide</button></div></div>`, { again() { App.closeModal(); App.go('challenges'); } }), 1500);
      return;
    }
    if (st.pressPending && ev?.results) {
      st.pressPending = false;
      const pq = pressQuestion(st, ev.results);
      if (pq) setTimeout(() => {
        if (App.cur !== 'results') { st.pressPending = true; return; }
        App.modal(`<div class="tiny upper" style="color:var(--team);display:flex;align-items:center;gap:8px">${icon('mic', 'ico', 'style="width:16px;height:16px"')} Conferenza stampa · ${esc(pq.journalist)}</div><h2 style="margin-top:8px">«${esc(pq.q)}»</h2>
          <div class="col gap6 mt16">${pq.a.map((a, i) => `<div class="card click" data-a="answer" data-i="${i}"><b style="font-size:16px">«${esc(a.t)}»</b><div class="small muted mt8">${esc(a.note)}</div></div>`).join('')}</div>`,
          { answer(el) { pq.a[+el.dataset.i].fx(); sfx.ok(); App.closeModal(); App.toast('Dichiarazione rilasciata', pq.a[+el.dataset.i].note, 'good'); } }, 'locked');
      }, 1200);
    }
  },
  actions: {
    highlights() { const st = S(); openSavedHighlights(st, App.params?.idx ?? st.round - 1); },
    done() {
      const st = S();
      if (st.quick) { App.go(st.challenge ? 'challenges' : 'quickrace'); return; }
      if (st.round >= st.calendar.length) App.go('seasonend'); else App.go('hub');
    },
  },
});

function medalSVG(col) {
  return `<svg class="medal-big" viewBox="0 0 120 120"><path d="M38 6h18l10 30H48z" fill="#c8102e"/><path d="M82 6H64L54 36h18z" fill="#1d3f8f"/><circle cx="60" cy="74" r="38" fill="${col}"/><circle cx="60" cy="74" r="29" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="3"/><path d="M60 54l6 13 14 1.5-10.5 9.5 3 14L60 85l-12.5 7 3-14L40 68.5 54 67z" fill="rgba(0,0,0,.28)"/></svg>`;
}

// Sponsor objectives, bets and the rival principals' reactions for the race just run
function weekendReport(st, ev) {
  const R = st.dyn?.lastReport;
  if (!R || st.quick || ev !== st.calendar[st.round - 1]) return '';
  if (!R.goals.length && !R.bet && !R.quotes.length) return '';
  const pt = playerTeam(st);
  const earned = R.goals.filter((g) => g.ok).reduce((a, g) => a + g.reward, 0) + (R.bet ? (R.bet.win ? R.bet.stake : -R.bet.stake) : 0);
  return `<div class="panel"><div class="panel-head"><h3>${icon('target')} Bilancio del weekend</h3>${earned ? `<span class="chip ${earned > 0 ? 'good' : 'bad'}">${earned > 0 ? '+' : ''}${fmtM(earned)}</span>` : ''}</div>
    ${R.goals.map((g) => `<div class="goal-row ${g.ok ? 'ok' : 'ko'}"><div class="goal-tier t${g.tier}">${'★'.repeat(g.tier)}</div><div style="min-width:0"><div class="gt">${esc(g.text)}</div><div class="gs">${esc(g.name)}</div></div><div class="gr">${g.ok ? '+' : ''}${fmtM(g.reward)}</div></div>`).join('')}
    ${R.bet ? (() => { const t = st.teams[R.bet.team]; const p = principal(st, R.bet.team); return `<div class="card mt8 row" style="box-shadow:inset 3px 0 0 ${R.bet.win ? 'var(--good)' : 'var(--bad)'}">${p && t ? portraitSVG(p, t, 40) : ''}<div class="grow"><b>${R.bet.win ? 'Scommessa vinta' : 'Scommessa persa'}</b><div class="tiny muted">contro ${esc(p?.name || '')} (${esc(t?.short || '')}) · ${R.bet.win ? '+' : '-'}${fmtM(R.bet.stake)}</div></div></div>`; })() : ''}
    ${R.quotes.map((q) => { const t = st.teams[q.team]; const p = principal(st, q.team); if (!t || !p) return ''; return `<div class="row mt8" style="gap:10px;align-items:flex-start">${portraitSVG(p, t, 40)}<div class="tp-quote" style="--tc:${teamCol(t)};margin:0;flex:1;font-size:14px;padding:8px 12px">${esc(q.text)}<div class="tiny muted" style="font-style:normal;margin-top:4px">${esc(p.name)} · ${esc(TP_PERSONAS[p.persona].name)}</div></div></div>`; }).join('')}
  </div>`;
}
