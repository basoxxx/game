import { carImg } from '../ui/garage3d.js';
import { App, registerScreen, trackName } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge, carSVG } from '../ui/art.js';
import { esc, fmtTime, fmtGap, fmtLong } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, standings } from '../engine/season.js';
import { driverChip, teamStripe, tyreBadge } from './common.js';
import { pressQuestion } from '../engine/events.js';
import { recordChallenge, CHALLENGES } from './challenges.js';
import { sfx } from '../ui/audio.js';

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
    if (!ev?.results) return `<div class="empty">Nessun risultato</div>`;
    const tr = getTrack(st.category, ev.trackId);
    const res = ev.results;
    const pt = playerTeam(st);
    const C = cat(st);
    const top3 = res.classification.slice(0, 3);
    const s = standings(st);
    const rally = st.category === 'rally';
    const pod = (r, cls) => {
      const d = st.drivers[r.driverIds[0]]; const tm = st.teams[r.teamId];
      return `<div class="pd ${cls}"><div>${helmetSVG(d.helmet, 70)}</div><div style="font-weight:800;margin-top:6px">${esc(r.driverIds.map((id) => st.drivers[id].name).join(' / '))}</div><div class="small muted mb8">${esc(tm.name)}</div><div style="padding:0 10px;margin-bottom:-8px;position:relative;z-index:1">${carImg(st.category, tm.car.livery, { number: d.number, sponsor: tm.sponsors[0]?.name })}</div><div class="block">${r.pos}</div></div>`;
    };
    const mine = res.classification.filter((r) => r.teamId === pt.id);
    return `<div style="position:fixed;inset:0;overflow-y:auto;padding:30px 40px">
      <div class="row between"><div class="row" style="gap:14px">${flagSVG(tr.nat, 40, 26)}<div><div class="tiny upper muted" style="letter-spacing:.3em">Risultati · Round ${ev.round}</div><h1 style="font-size:38px">${esc(tr.name)}</h1></div></div><button class="btn primary xl" data-a="done">${S().quick ? 'Nuova gara rapida' : 'Continua'} ${icon('right')}</button></div>
      <div class="podium">${top3[1] ? pod(top3[1], 'p2') : ''}${pod(top3[0], 'p1')}${top3[2] ? pod(top3[2], 'p3') : ''}</div>
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px">
        <div class="panel flush"><table class="tbl"><thead><tr><th>Pos</th><th></th><th>${C.driversPerCar > 1 ? 'Equipaggio' : 'Pilota'}</th><th>Team</th>${rally ? '<th class="right">PS vinte</th><th class="right">Tempo</th>' : '<th class="right">Griglia</th><th>Gomme</th><th class="right">Soste</th><th class="right">Best</th>'}<th class="right">Distacco</th><th class="right">Pt</th></tr></thead><tbody>
          ${res.classification.map((r) => { const tm = st.teams[r.teamId]; const d = st.drivers[r.driverIds[0]]; return `<tr class="${tm.isPlayer ? 'me' : ''}"><td class="pos p${r.pos}">${r.status === 'dnf' ? 'RIT' : r.pos}</td><td>${teamStripe(tm)}</td><td>${C.driversPerCar > 1 ? `<div class="small"><b>${r.driverIds.map((id) => esc(st.drivers[id].name)).join(' / ')}</b></div>` : driverChip(st, d, { size: 22 })}</td><td class="small muted">${esc(tm.name)}</td>${rally ? `<td class="right mono">${r.stageWins || 0}</td><td class="right mono small">${r.time ? fmtLong(r.time) : '-'}</td>` : `<td class="right mono">${r.grid}</td><td><div class="row gap4">${(r.tyres || []).map((t) => tyreBadge(t)).join('')}</div></td><td class="right mono">${r.pitStops}</td><td class="right mono small ${res.fastest?.key === r.key ? 'fastest' : ''}"${res.fastest?.key === r.key ? ' data-tip="Giro più veloce della gara"' : ''}>${fmtTime(r.bestLap)}</td>`}<td class="right mono small">${r.status === 'dnf' ? `<span class="bad">${esc(r.reason || 'Ritiro')}</span>` : r.pos === 1 ? (rally ? '' : 'Vincitore') : rally ? fmtGap(r.gap) : fmtGap(r.gap)}</td><td class="right mono"><b>${r.pts || ''}</b>${r.ps ? `<span class="tiny warn"> (+${r.ps} PS)</span>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="col gap16">
          <div class="panel"><div class="panel-head"><h3>La tua squadra</h3></div>${mine.map((r) => { const d = st.drivers[r.driverIds[0]]; return `<div class="card row mb8">${helmetSVG(d.helmet, 40)}<div class="grow"><b>${esc(r.driverIds.map((id) => st.drivers[id].name).join(' / '))}</b><div class="small muted">${r.status === 'dnf' ? `Ritirato (${esc(r.reason || '')})` : `Arrivato ${r.pos}°${rally ? '' : ` · partito ${r.grid}°`}`}</div></div><div class="pos p${r.pos}" style="font-size:28px">${r.status === 'dnf' ? '—' : 'P' + r.pos}</div></div>`; }).join('')}</div>
          ${(res.penalties || []).length ? `<div class="panel"><div class="panel-head"><h3>⚖ Decisioni dei commissari</h3></div><table class="tbl small"><tbody>${res.penalties.map((p) => `<tr class="${p.teamId === pt.id ? 'me' : ''}"><td class="muted tiny">G${p.lap || '-'}</td><td>${esc(st.drivers[p.driverId]?.name || '')}</td><td class="small">${esc(p.text)}</td><td class="right mono tiny ${p.pts ? 'bad' : 'dim'}">${p.pts ? '+' + p.pts + ' pt' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${res.sprint ? `<div class="panel"><div class="panel-head"><h3>⚡ Sprint</h3></div><table class="tbl small"><tbody>${res.sprint.filter((r) => r.pts > 0).map((r) => `<tr class="${r.teamId === pt.id ? 'me' : ''}"><td class="pos p${r.pos}">${r.pos}</td><td>${esc(st.drivers[r.driverIds[0]]?.name || '')}</td><td class="right mono"><b>+${r.pts}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
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
      setTimeout(() => App.modal(`<div style="text-align:center"><div class="tiny upper muted" style="letter-spacing:.3em">Sfida · ${esc(ch.title)}</div>${r.medal >= 0 ? `<div style="font-size:70px;margin:10px 0">🏅</div><h2 style="color:${M[r.medal][1]}">MEDAGLIA ${M[r.medal][2]}</h2>` : '<div style="font-size:60px;margin:10px 0">😤</div><h2>Sfida non superata</h2>'}<p class="muted">Miglior risultato: ${r.best === 99 ? 'ritiro' : 'P' + r.best} · Obiettivi: ${ch.medals.map((p, i) => M[i][0] + ' P' + p).join(' · ')}</p><div class="row mt16 center gap6"><button class="btn" data-a="close-modal">Chiudi</button><button class="btn primary" data-a="again">Altre sfide</button></div></div>`, { again() { App.closeModal(); App.go('challenges'); } }), 1500);
      return;
    }
    if (st.pressPending && ev?.results) {
      st.pressPending = false;
      const pq = pressQuestion(st, ev.results);
      if (pq) setTimeout(() => {
        App.modal(`<div class="tiny upper muted" style="letter-spacing:.3em">Conferenza stampa · ${esc(pq.journalist)}</div><h2 style="margin-top:6px">🎤 «${esc(pq.q)}»</h2>
          <div class="col gap6 mt16">${pq.a.map((a, i) => `<div class="card click" data-a="answer" data-i="${i}"><b>«${esc(a.t)}»</b><div class="tiny muted mt8">${esc(a.note)}</div></div>`).join('')}</div>`,
          { answer(el) { pq.a[+el.dataset.i].fx(); sfx.ok(); App.closeModal(); App.toast('Dichiarazione rilasciata', pq.a[+el.dataset.i].note, 'good'); } }, 'locked');
      }, 1200);
    }
  },
  actions: {
    done() {
      const st = S();
      if (st.quick) { App.go(st.challenge ? 'challenges' : 'quickrace'); return; }
      if (st.round >= st.calendar.length) App.go('seasonend'); else App.go('hub');
    },
  },
});
