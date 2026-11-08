// Paddock: newspaper, rival team principals, board & dynasty plan
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { teamBadge } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, standings, fmtM } from '../engine/season.js';
import { ensureDynasty, pressIssues, TP_PERSONAS, STATUS, MANDATES, statusInfo, relLabel, relColor, principal, strengthRanking, statusIdx } from '../engine/dynasty.js';
import { pressArt, portraitSVG, principalCard, relMeter, statusEmblem, statusLadder, teamCol, boardTable } from './career-ui.js';

let tab = 'paper', issueKey = null;

registerScreen({
  id: 'paddock',
  render(params) {
    const st = S();
    ensureDynasty(st);
    if (params?.tab) { tab = params.tab; params.tab = null; }
    const tabs = [['paper', 'Il Giornale'], ['tp', 'Team Principal'], ['board', 'Consiglio & Dinastia']];
    return `<div class="screen-title"><div><div class="sub">${esc(cat(st).full)} · Stagione ${st.season}</div><h1>Paddock</h1></div><div class="tabs">${tabs.map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="ptab" data-t="${k}">${n}</div>`).join('')}</div></div>
    <div class="anim-in">${tab === 'paper' ? paperTab(st) : tab === 'tp' ? tpTab(st) : boardTab(st)}</div>`;
  },
  actions: {
    ptab(el) { tab = el.dataset.t; App.refresh(); },
    issue(el) { issueKey = el.dataset.k; App.refresh(); },
  },
});

// ---------------- NEWSPAPER ----------------
function paperTab(st) {
  const issues = pressIssues(st);
  if (!issues.length) return `<div class="panel"><div class="empty">${icon('mic')}<b>Le rotative sono ferme</b><span>Il primo numero uscirà dopo il prossimo evento.</span></div></div>`;
  let iss = issues.find((x) => x.key === issueKey) || issues[0];
  const items = iss.items;
  const lead = items.find((x) => x.kind === 'lead') || items[0];
  const teamStories = items.filter((x) => x !== lead && (x.kind === 'team' || x.kind === 'champ'));
  const quotes = items.filter((x) => x.kind === 'quote' && x.q);
  const briefs = items.filter((x) => x !== lead && (x.kind === 'brief' || (x.kind === 'quote' && !x.q)));
  const ev = iss.r >= 0 ? st.calendar[iss.r] : null;
  const tr = ev && iss.s === st.season ? getTrack(st.category, ev.trackId) : null;
  const kick = (x) => `<span class="kick ${x.tone === 'good' ? 'good' : x.tone === 'bad' ? 'bad' : ''}">${esc(x.tag || 'Paddock')}</span>`;
  return `<div class="row between mb16" style="align-items:flex-end"><div class="issue-list">${issues.slice(0, 10).map((x) => `<button class="btn sm ${x.key === iss.key ? 'active' : ''}" data-a="issue" data-k="${x.key}">${x.s !== st.season ? x.s + ' · ' : ''}${x.r < 0 ? 'Pre' : 'R' + (x.r + 1)}</button>`).join('')}</div><span class="small muted">${issues.length} numeri in archivio</span></div>
  <div class="paper">
    <div class="paper-mast"><div><div class="tiny upper" style="letter-spacing:.3em;color:#5b584f">Il quotidiano del motorsport</div><h2>Il Paddock<span>.</span></h2></div><div class="ed">Stagione ${iss.s} · ${iss.r < 0 ? 'Speciale pre-stagione' : `Numero ${iss.r + 1}`}<br>${tr ? `Dopo: ${esc(tr.name)}` : 'Edizione speciale'}<br>€ 2,50</div></div>
    <div class="paper-body">
      <div class="paper-main">
        ${kick(lead)}
        <div class="lead-h">${esc(lead.h)}</div>
        <div class="art-wrap">${pressArt(st, lead.img, 760, 300)}</div>
        ${lead.t ? `<div class="lead-t">${esc(lead.t)}</div>` : ''}
        ${teamStories.length ? `<div class="sec">${teamStories.slice(0, 4).map((x) => `<div class="story">${pressArt(st, x.img, 380, 170)}<div class="mt8">${kick(x)}</div><h4>${esc(x.h)}</h4>${x.t ? `<p>${esc(x.t)}</p>` : ''}</div>`).join('')}</div>` : ''}
      </div>
      <div class="paper-side">
        <div class="side-h">Le voci del muretto</div>
        ${quotes.length ? quotes.map((x) => { const t = st.teams[x.q.team]; const p = principal(st, x.q.team); return `<div class="q">${p && t ? portraitSVG(p, t, 54) : ''}<div><blockquote>${esc(x.q.text)}</blockquote><div class="who">${esc(p?.name || '')} · ${esc(t?.short || '')}</div></div></div>`; }).join('') : '<div class="small muted">Nessuna dichiarazione in questo numero.</div>'}
        <div class="side-h mt24">In breve</div>
        ${briefs.length ? briefs.slice(0, 8).map((x) => `<div class="brief"><b>${esc(x.tag || 'Paddock')}</b>${esc(x.h)}</div>`).join('') : '<div class="small muted">Nessuna notizia breve.</div>'}
      </div>
    </div>
  </div>`;
}

// ---------------- PRINCIPALS ----------------
function tpTab(st) {
  const pt = playerTeam(st);
  const s = standings(st);
  const teams = s.teams.map((x) => st.teams[x.id]).filter((t) => !t.isPlayer);
  const persona = Object.entries(TP_PERSONAS).map(([k, P]) => `<div class="card"><span class="tp-persona" style="--pc:${P.color}">${esc(P.name)}</span><div class="small mt8" style="color:var(--text2)">${esc(P.desc)}</div></div>`).join('');
  return `<div class="panel mb16"><div class="panel-head"><h3>${icon('users')} I tuoi colleghi</h3><span class="small muted">Ogni team principal ha un carattere: reagisce ai risultati, alle tue scelte e alle provocazioni.</span></div><div class="grid4" style="grid-template-columns:repeat(5,1fr)">${persona}</div></div>
  <div class="tp-grid">${teams.map((t) => {
    const p = principal(st, t.id); if (!p) return '';
    const pos = s.teams.findIndex((x) => x.id === t.id) + 1;
    const pts = s.teams.find((x) => x.id === t.id)?.pts || 0;
    return `<div class="tp-big" style="--tc:${teamCol(t)}">${principalCard(st, t.id, `<div class="col" style="align-items:flex-end;gap:2px">${teamBadge(t, 34)}<span class="tiny muted">${pos}° · ${pts} pt</span><span class="tiny" style="color:${STATUS[statusIdx(st, t)].color};font-weight:700">${esc(STATUS[statusIdx(st, t)].name)}</span></div>`)}
      <div><div class="row between tiny upper muted"><span>Rapporto con te</span><span style="color:${relColor(p.rel)}">${p.rel > 0 ? '+' : ''}${p.rel}</span></div>${relMeter(p.rel)}</div>
      ${p.quote ? `<div class="tp-quote">${esc(p.quote.text)}<div class="tiny muted mt8" style="font-style:normal">Stagione ${p.quote.s}, dopo il round ${p.quote.r + 1}</div></div>` : '<div class="tp-quote" style="opacity:.6">Non ha ancora parlato di te. Per ora.</div>'}
    </div>`;
  }).join('')}</div>`;
}

// ---------------- BOARD & DYNASTY ----------------
function boardTab(st) {
  const D = st.dyn; const pt = playerTeam(st);
  const si = statusInfo(st);
  const M = MANDATES[D.mandate] || MANDATES.growth;
  const conf = st.board.confidence;
  const L = D.log.filter((x) => x.s === st.season);
  const sRank = strengthRanking(st).indexOf(pt.id) + 1;
  return `<div class="grid2" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start">
    <div class="col gap16">
      <div class="panel" style="--stc:${si.color}"><div class="panel-head"><h3>${icon('star')} Status della squadra</h3><span class="small muted">Prestigio ${si.rep}</span></div>
        <div class="row" style="gap:18px">${statusEmblem(si.idx, 92)}<div class="grow"><div class="tiny upper muted">${esc(pt.name)} è</div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:42px;line-height:1;text-transform:uppercase;color:${si.color}">${esc(si.name)}</div>${si.next ? `<div class="small mt8 muted">Prossimo: <b style="color:${si.next.color}">${esc(si.next.name)}</b> · ${esc(si.nextNeed)}</div>${bar(si.prog * 100, 'gold')}` : '<div class="small mt8 good">Hai raggiunto la vetta del paddock.</div>'}</div></div>
        <div class="mt16">${statusLadder(st)}</div>
        <div class="grid2 mt16">${si.perks.map((p) => `<div class="card row small">${icon('check', 'ico', 'style="width:16px;color:var(--good)"')}${esc(p)}</div>`).join('')}${si.next ? si.next.perks.map((p) => `<div class="card row small" style="opacity:.5">${icon('lock', 'ico', 'style="width:16px"')}${esc(p)}</div>`).join('') : ''}</div>
        <div class="tiny muted mt16">Il prestigio cresce con i risultati: a fine stagione si avvicina a quello della posizione conquistata nel costruttori, con un bonus quando superi le attese del consiglio.</div>
      </div>
      <div class="panel"><div class="panel-head"><h3>${icon('board')} Il piano del consiglio</h3><span class="chip">${esc(M.name)}</span></div>
        <div class="small" style="color:var(--text2)">${esc(M.desc)}</div>
        <div class="col gap6 mt16">${D.plan.steps.map((s) => `<div class="plan-step ${s.done === true ? 'ok' : s.done === false ? 'ko' : s.season === st.season ? 'now' : ''}"><div class="y">${s.season}</div><div class="t">${esc(s.text)}</div><span class="s chip tiny ${s.done === true ? 'good' : s.done === false ? 'bad' : s.season === st.season ? 'warn' : ''}">${s.done === true ? 'Raggiunto' : s.done === false ? 'Mancato' : s.season === st.season ? 'In corso' : 'Futuro'}</span></div>`).join('')}</div>
        <div class="tiny muted mt16">Ogni tappa raggiunta: budget strutturale +8% e fiducia +12. Ogni tappa mancata costa fiducia.</div>
      </div>
    </div>
    <div class="col gap16">
      <div class="panel"><div class="panel-head"><h3>Il consiglio di amministrazione</h3><span class="chip ${conf < 30 ? 'bad' : conf > 65 ? 'good' : 'warn'}">Fiducia ${conf}%</span></div>
        ${boardTable(st)}
        <div class="grid3 mt16"><div class="kpi"><b>${st.board.target}°</b><span>Obiettivo stagione</span></div><div class="kpi"><b>${sRank}ª</b><span>Forza prevista</span></div><div class="kpi"><b class="${pt.money < 0 ? 'bad' : ''}">${fmtM(pt.money)}</b><span>Liquidità</span></div></div>
        ${D.admin ? '<div class="card mt16" style="box-shadow:inset 4px 0 0 var(--bad)"><b class="bad">Amministrazione controllata</b><div class="small muted">Se a fine stagione i conti saranno ancora in rosso verrai sostituito.</div></div>' : ''}
        ${D.skim ? `<div class="card mt16 small" style="box-shadow:inset 4px 0 0 var(--warn)">Il fondo <b>${esc(D.skim.who)}</b> trattiene il ${Math.round((D.skim.pct || 0.1) * 100)}% dei diritti commerciali fino a fine ${D.skim.until}.</div>` : ''}
      </div>
      <div class="panel"><div class="panel-head"><h3>Promesse in corso</h3><span class="small muted">Mantenute ${D.stats.promisesKept} · tradite ${D.stats.promisesBroken}</span></div>
        ${D.promises.length ? D.promises.map((p) => `<div class="card mb8" style="box-shadow:inset 3px 0 0 var(--warn)"><b>${esc(p.t)}</b><div class="tiny muted">${p.until != null ? `Scadenza: round ${p.until + 1}` : 'Fine stagione'}</div></div>`).join('') : '<div class="small muted">Nessuna promessa attiva. Il consiglio ti convoca a inizio e a metà stagione.</div>'}
      </div>
      <div class="panel"><div class="panel-head"><h3>Andamento della fiducia</h3></div>${L.length ? sparkline(L.map((x) => x.conf), 0, 100, 'var(--warn)') : '<div class="small muted">Disponibile dopo il primo evento.</div>'}</div>
    </div>
  </div>`;
}

function sparkline(vals, lo, hi, col) {
  const w = 520, h = 90;
  const n = Math.max(2, vals.length);
  const pts = vals.map((v, i) => `${(i / (n - 1)) * w},${h - ((v - lo) / (hi - lo)) * (h - 8) - 4}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="chart"><line x1="0" x2="${w}" y1="${h - (50 / 100) * (h - 8) - 4}" y2="${h - (50 / 100) * (h - 8) - 4}" class="ch-grid"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
