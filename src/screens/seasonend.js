import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, teamBadge, carSVG, flagSVG } from '../ui/art.js';
import { esc, bar, pageHead } from '../ui/dom.js';
import { S, setState, saveGame } from '../engine/state.js';
import { createWorld } from '../engine/world.js';
import { cat, playerTeam, endSeason, newSeason, jobOffers, fmtM, addMail, unlock } from '../engine/season.js';
import { CATEGORIES } from '../data/categories.js';
import { STAFF_NAMES } from '../data/teams.js';
import { celebrate } from './results.js';
import { sfx } from '../ui/audio.js';
import { getTrack } from '../engine/world.js';
import { STATUS, MANDATES } from '../engine/dynasty.js';
import { lineChart, chartLegend, statusEmblem, teamCol } from './career-ui.js';

let summary = null, offers = null;

registerScreen({
  id: 'seasonend', full: true,
  render() {
    const st = S();
    if (!summary || summary.season !== st.season) {
      const sum = endSeason(st);
      summary = { season: st.season, ...sum };
      offers = jobOffers(st);
      saveGame();
    }
    const sm = summary;
    const pt = playerTeam(st);
    const ok = sm.teamPos <= sm.target;
    const champMine = sm.champ.teamId === pt.id;
    const consMine = sm.st.teams[0].id === pt.id;
    return `<div class="full-screen" style="--pc:${ok ? 'var(--gold)' : 'var(--accent)'}">
      ${pageHead({ back: null, eyebrow: esc(cat(st).full), title: `Fine stagione ${sm.season}`, right: `<div class="kpi" style="text-align:right"><b class="${ok ? 'good' : 'bad'}" style="font-size:48px;font-style:italic">${sm.teamPos}°</b><span>Costruttori · obiettivo ${sm.target}°</span></div>` })}
      <div class="grid3 anim-in">
        <div class="panel ${champMine ? 'glow' : ''}"><div class="tiny upper muted">Campione Piloti</div><div class="row mt8" style="gap:14px">${helmetSVG(sm.champ.helmet, 64)}<div><div style="font-family:var(--display);font-weight:900;font-size:22px">${esc(sm.champ.name)}</div><div class="muted">${esc(sm.champTeam.name)} · ${sm.st.drivers[0].pts} punti</div></div></div></div>
        <div class="panel ${consMine ? 'glow' : ''}"><div class="tiny upper muted">Campione Costruttori</div><div class="row mt8" style="gap:14px">${teamBadge(sm.constructors, 60)}<div><div style="font-family:var(--display);font-weight:900;font-size:22px">${esc(sm.constructors.name)}</div><div class="muted">${sm.st.teams[0].pts} punti</div></div></div></div>
        <div class="panel"><div class="tiny upper muted">La tua stagione</div><div style="font-family:var(--display);font-weight:900;font-size:44px;font-style:italic" class="${ok ? 'good' : 'bad'}">${sm.teamPos}°</div><div class="muted">Obiettivo: ${sm.target}° · Premio: <b>${fmtM(sm.prize)}</b></div>${sm.legacy ? `<div class="small mt8">Eredità: <b>${sm.legacy.score}</b>${sm.legacy.gained > 0 ? ` <span class="good">(+${sm.legacy.gained})</span>` : ''} · ${esc(sm.legacy.tier)}</div>` : ''}</div>
      </div>
      ${sm.awards?.length ? `<div class="panel mt16 anim-in"><div class="panel-head"><h3>Gala di fine stagione · Premi</h3></div><div class="grid4">${sm.awards.map((a, i) => `<div class="card" style="text-align:center;animation:rise .5s ${0.2 + i * 0.15}s both">${icon(a.icon, 'ico', 'style="width:34px;height:34px;color:var(--gold)"')}<div class="tiny upper muted mt8">${esc(a.name)}</div><div style="font-family:var(--display);font-weight:900;font-size:18px">${esc(a.who)}</div><div class="small muted">${esc(a.team || '')}${a.note ? ' · ' + esc(a.note) : ''}</div></div>`).join('')}</div></div>` : ''}
      ${reviewPanel(st, sm)}
      <div class="panel mt16 ${sm.fired ? '' : ''}"><div class="panel-head"><h3>Verdetto del Consiglio</h3><span class="chip ${st.board.confidence < 30 ? 'bad' : st.board.confidence > 65 ? 'good' : 'warn'}">Fiducia ${st.board.confidence}%</span></div>
        <div style="font-size:16px">${sm.fired ? `<span class="bad"><b>Sei stato licenziato.</b></span> Il consiglio ha perso la fiducia nel tuo lavoro. Scegli una nuova squadra tra le offerte ricevute.` : ok ? (consMine || champMine ? 'Una stagione leggendaria! Il consiglio è entusiasta e ti rinnova la piena fiducia.' : 'Obiettivo raggiunto. Il consiglio è soddisfatto del lavoro svolto.') : 'Obiettivo mancato. Il consiglio si aspetta un netto miglioramento la prossima stagione.'}</div>
        ${bar(st.board.confidence, st.board.confidence < 30 ? 'red' : st.board.confidence > 65 ? 'green' : 'gold')}
      </div>
      <div class="panel mt16"><div class="panel-head"><h3>Offerte di lavoro</h3><span class="small muted">Reputazione manager: ${Math.round(st.career.reputation)}</span></div>
        <div class="grid4">${offers.map((o, i) => `<div class="card click" data-a="take" data-i="${i}" style="border-top:3px solid ${CATEGORIES[o.category].color}"><div class="tiny upper" style="color:${CATEGORIES[o.category].color}">${CATEGORIES[o.category].name}${o.category !== st.category ? ' · Nuova categoria!' : ''}</div><div class="row mt8">${teamBadge({ short: o.teamId.slice(0, 3).toUpperCase(), colors: o.colors }, 34)}<b>${esc(o.name)}</b></div><div class="small muted mt8">Prestigio ${o.rep}</div></div>`).join('') || '<div class="muted">Nessuna offerta.</div>'}</div>
        ${sm.fired ? '' : `<div class="row mt16" style="justify-content:flex-end"><button class="btn primary xl" data-a="stay">Resta con ${esc(pt.name)} ${icon('right')}</button></div>`}
      </div>
    </div>`;
  },
  mount() { const st = S(); if (summary && (summary.champ.teamId === st.playerTeam || summary.st.teams[0].id === st.playerTeam)) { celebrate(300); sfx.win(); } },
  actions: {
    stay() { const st = S(); newSeason(st); summary = null; saveGame(); sfx.ok(); App.go('hub'); },
    take(el) {
      const st = S(); const o = offers[+el.dataset.i];
      App.confirm(`Firmare con ${esc(o.name)}?`, `${o.category !== st.category ? `Passerai al campionato ${CATEGORIES[o.category].name}. ` : ''}Inizierai la stagione ${st.season + 1} con la nuova squadra.`, () => {
        if (o.category === st.category) {
          const old = playerTeam(st); old.isPlayer = false; old.principal = `${STAFF_NAMES.first[Math.floor(Math.random() * STAFF_NAMES.first.length)]} ${STAFF_NAMES.last[Math.floor(Math.random() * STAFF_NAMES.last.length)]}`;
          const nt = st.teams[o.teamId]; nt.isPlayer = true; nt.principal = st.playerName; st.playerTeam = nt.id;
          st.board.confidence = 65;
          if (st.dyn) { st.dyn.plan = null; st.dyn.statusMax = null; st.dyn.promises = []; st.dyn.mandate = 'growth'; delete st.dyn.principals[nt.id]; }
          newSeason(st);
        } else {
          const career = st.career; const ach = st.achievements;
          const ns = createWorld({ playerName: st.playerName, category: o.category, teamId: o.teamId, difficulty: st.difficulty, seasonLength: st.seasonLength, raceLength: st.raceLength });
          ns.season = st.season + 1; ns.career = career; ns.achievements = ach; ns.slot = st.slot;
          addMail(ns, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'info', subject: `Benvenuto in ${ns.teams[o.teamId].name}`, body: `Una nuova sfida in ${CATEGORIES[o.category].full}! Il consiglio si aspetta il ${ns.board.target}° posto.` });
          setState(ns);
          unlock(ns, 'switch', 'Giramondo', 'Cambia categoria durante la carriera.');
        }
        summary = null; saveGame(); sfx.win(); App.go('hub');
      });
    },
  },
});

// ---------- season review: charts, status and plan ----------
function reviewPanel(st, sm) {
  const L = (st.dyn?.log || []).filter((x) => x.s === sm.season);
  if (!L.length) return '';
  const pt = playerTeam(st);
  const labels = L.map((x) => x.nat || '');
  const final = L[L.length - 1].pts;
  const top = Object.keys(final).sort((a, b) => final[b] - final[a]).slice(0, 5);
  if (!top.includes(pt.id)) top.push(pt.id);
  const series = top.map((id) => ({ name: st.teams[id]?.name || id, color: id === pt.id ? '#ffffff' : teamCol(st.teams[id]), values: L.map((x) => x.pts[id] ?? 0), me: id === pt.id }));
  const pos = [{ name: 'Posizione costruttori', color: 'var(--gold)', values: L.map((x) => x.pos), me: true }];
  const money = [{ name: 'Liquidità', color: 'var(--good)', values: L.map((x) => x.money), me: true }];
  const n = Object.keys(st.teams).length;
  const d = sm.dyn;
  const S0 = d ? STATUS[d.before] : null, S1 = d ? STATUS[d.after] : null;
  return `<div class="panel mt16 anim-in"><div class="panel-head"><h3>${icon('chart')} La stagione in grafici</h3><span class="small muted">${L.length} eventi</span></div>
    <div class="review-grid">
      <div><div class="tiny upper muted mb8">Corsa al titolo costruttori</div>${lineChart(series, labels, { h: 280 })}${chartLegend(series)}</div>
      <div class="col gap16">
        <div><div class="tiny upper muted mb8">La tua posizione round dopo round</div>${lineChart(pos, labels, { w: 520, h: 150, invert: true, min: 1, max: n, fmt: (v) => Math.round(v) + '°' })}</div>
        <div><div class="tiny upper muted mb8">Liquidità</div>${lineChart(money, labels, { w: 520, h: 150, area: true, fmt: (v) => fmtM(v) })}</div>
      </div>
    </div>
    ${d ? `<div class="grid4 mt16">
      <div class="card row" style="gap:14px;--stc:${S1.color}">${statusEmblem(d.after, 58)}<div><div class="tiny upper muted">Status</div><b style="font-family:var(--display);font-size:22px;text-transform:uppercase;color:${S1.color}">${esc(S1.name)}</b><div class="tiny ${d.after > d.before ? 'good' : d.after < d.before ? 'bad' : 'muted'}">${d.after > d.before ? `Promossi da ${esc(S0.name)}!` : d.after < d.before ? `Scesi da ${esc(S0.name)}` : 'Stabile'} · prestigio ${d.rep}</div></div></div>
      <div class="card"><div class="tiny upper muted">Obiettivi sponsor</div><div class="kpi"><b>${d.goalsHit}/${d.goalsTot}</b></div>${bar(d.goalsTot ? (d.goalsHit / d.goalsTot) * 100 : 0, 'green')}</div>
      <div class="card"><div class="tiny upper muted">Promesse al consiglio</div><div class="kpi"><b><i class="good" style="font-style:normal">${d.kept}</i> <i class="dim" style="font-style:normal">/</i> <i class="bad" style="font-style:normal">${d.broken}</i></b></div><div class="tiny muted">mantenute / tradite</div></div>
      <div class="card"><div class="tiny upper muted">Sfide tra team principal</div><div class="kpi"><b><i class="good" style="font-style:normal">${d.betsWon}</i> <i class="dim" style="font-style:normal">/</i> <i class="bad" style="font-style:normal">${d.betsLost}</i></b></div><div class="tiny muted">vinte / perse</div></div>
    </div>
    ${reportCards(st, sm)}
    ${d.plan.length ? `<div class="mt16"><div class="tiny upper muted mb8">Piano del consiglio · ${esc((MANDATES[d.mandate] || MANDATES.growth).name)}</div><div class="plan-tl">${d.plan.map((x) => `<div class="plan-step ${x.done ? 'ok' : 'ko'}"><div class="y">${x.season}</div><div class="t">${esc(x.text)}</div><span class="s chip tiny ${x.done ? 'good' : 'bad'}">${x.done ? 'Raggiunto' : 'Mancato'}</span></div>`).join('')}</div></div>` : ''}` : ''}
  </div>`;
}

// ---------- driver report cards ("pagelle") ----------
function reportCards(st, sm) {
  const pt = playerTeam(st);
  const rows = [];
  const ids = new Set();
  for (const ev of st.calendar) for (const r of ev.results?.classification || []) if (r.teamId === pt.id) r.driverIds.forEach((id) => ids.add(id));
  for (const id of ids) {
    const d = st.drivers[id]; if (!d) continue;
    const res = st.calendar.map((ev) => ev.results?.classification.find((r) => r.driverIds.includes(id))).filter(Boolean);
    if (!res.length) continue;
    const fin = res.filter((r) => r.status !== 'dnf');
    const avg = fin.length ? fin.reduce((a, r) => a + r.pos, 0) / fin.length : 25;
    const pts = res.reduce((a, r) => a + (r.pts || 0), 0);
    const best = fin.length ? Math.min(...fin.map((r) => r.pos)) : null;
    const pos = sm.st.drivers.findIndex((x) => x.id === id) + 1;
    const exp = 1 + (sm.teamPos - 1) * 2;
    const score = (exp - avg) + (res.length - fin.length) * -0.8 + (best === 1 ? 2 : 0);
    const grade = score >= 4 ? ['10', 'Leggenda'] : score >= 2 ? ['9', 'Fenomenale'] : score >= 0.5 ? ['8', 'Ottimo'] : score >= -1 ? ['7', 'Solido'] : score >= -3 ? ['6', 'Sufficiente'] : score >= -5 ? ['5', 'Deludente'] : ['4', 'Da rivedere'];
    rows.push({ d, pts, best, pos, grade, races: res.length });
  }
  if (!rows.length) return '';
  return `<div class="mt16"><div class="tiny upper muted mb8">Le pagelle dei tuoi piloti</div><div class="grid4">${rows.slice(0, 4).map((x) => `<div class="card row" style="gap:12px">${helmetSVG(x.d.helmet, 46)}<div class="grow" style="min-width:0"><b style="font-family:var(--display);font-size:17px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${esc(x.d.name)}</b><div class="tiny muted">${x.pos ? x.pos + '° · ' : ''}${x.pts} pt · migliore ${x.best ? 'P' + x.best : '—'}</div><div class="tiny" style="color:${+x.grade[0] >= 8 ? 'var(--good)' : +x.grade[0] >= 6 ? 'var(--warn)' : 'var(--bad)'};font-weight:700">${x.grade[1]}</div></div><div class="verdict-big" style="font-size:46px;color:${+x.grade[0] >= 8 ? 'var(--good)' : +x.grade[0] >= 6 ? 'var(--text)' : 'var(--bad)'}">${x.grade[0]}</div></div>`).join('')}</div></div>`;
}
