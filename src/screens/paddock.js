// Paddock: newspaper, rival team principals, board & dynasty plan
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { teamBadge } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, standings, fmtM } from '../engine/season.js';
import { ensureDynasty, pressIssues, TP_PERSONAS, STATUS, MANDATES, statusInfo, relLabel, relColor, principal, strengthRanking, statusIdx } from '../engine/dynasty.js';
import { ensureDepth, eraInfo, rulesInForce, voteHistory, worldEvents, rumourList, rumourStat, aiTrend, setPolicy, sourceStats, RUMOUR_SOURCES } from '../engine/depth.js';
import { setIronman, isIronman, diffOf, storyInfo } from '../engine/career5.js';
import { legacyInfo } from '../engine/legacy.js';
import { sfx } from '../ui/audio.js';
import { avgPart } from '../engine/world.js';
import { pressArt, portraitSVG, principalCard, relMeter, statusEmblem, statusLadder, teamCol, boardTable } from './career-ui.js';

let tab = 'paper', issueKey = null;

registerScreen({
  id: 'paddock',
  render(params) {
    const st = S();
    ensureDynasty(st);
    if (params?.tab) { tab = params.tab; params.tab = null; }
    const tabs = [['paper', 'Il Giornale'], ['tp', 'Team Principal'], ['world', 'Commissione'], ['board', 'Consiglio & Dinastia']];
    return `<div class="screen-title"><div><div class="sub">${esc(cat(st).full)} · Stagione ${st.season}</div><h1>Paddock</h1></div><div class="tabs">${tabs.map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="ptab" data-t="${k}">${n}</div>`).join('')}</div></div>
    <div class="anim-in">${tab === 'paper' ? paperTab(st) : tab === 'tp' ? tpTab(st) : tab === 'world' ? worldTab(st) : boardTab(st)}</div>`;
  },
  actions: {
    ptab(el) { tab = el.dataset.t; App.refresh(); },
    issue(el) { issueKey = el.dataset.k; App.refresh(); },
    wpol(el) { const st = S(); setPolicy(st, el.dataset.k, !st.dp.pol[el.dataset.k]); App.refresh(); },
    ironman() {
      App.confirm('Attivare la modalità Ironman?', 'Un solo salvataggio, scritto dopo ogni decisione e ogni evento: non potrai più ricaricare per cambiare una scelta. È irreversibile per questa carriera.', () => { const r = setIronman(S()); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; } sfx.ok(); App.toast('Ironman attivo', 'Ogni scelta ora è definitiva.', 'good'); App.refresh(); }, 'Attiva Ironman', true);
    },
  },
});

// ---------------- COMMISSION & WORLD ----------------
function worldTab(st) {
  const P = ensureDepth(st); const e = eraInfo(st); const pt = playerTeam(st);
  const n = st.calendar.length;
  const nextVote = [Math.floor(n * 0.3), Math.floor(n * 0.7)].find((r) => r > st.round && r < n - 1);
  const votes = voteHistory(st);
  const teams = Object.values(st.teams).sort((a, b) => avgPart(b) - avgPart(a));
  const s = standings(st).teams.map((x) => x.id);
  const rum = rumourList(st).slice(0, 12); const rs = rumourStat(st);
  const w = worldEvents(st);
  const allies = teams.filter((t) => !t.isPlayer && (principal(st, t.id)?.rel || 0) >= 15).length;
  const foes = teams.filter((t) => !t.isPlayer && (principal(st, t.id)?.rel || 0) <= -15).length;
  return `<div class="grid2">
    <div class="col gap16">
      <div class="panel"><div class="panel-head"><h3>${icon('rules', 'ico', 'style="width:16px"')} La Commissione</h3><span class="chip">${nextVote != null ? `Prossimo voto dopo il round ${nextVote}` : 'Nessun voto in programma quest’anno'}</span></div>
        <div class="small muted" style="line-height:1.55">Due volte a stagione le squadre votano una proposta di modifica alle regole. Ogni team vota secondo il proprio interesse: i piccoli vogliono tetti di spesa e premi più equi, chi insegue vuole rimescolare le carte, chi vince vuole stabilità. Con la lobby puoi chiedere un favore ai team principal in buoni rapporti.</div>
        <div class="row gap8 mt16"><div class="kpi"><b class="good">${allies}</b><span>Alleati e cordiali</span></div><div class="kpi"><b class="bad">${foes}</b><span>Ostili e nemici</span></div><div class="kpi"><b>${e.next}</b><span>Nuovo regolamento</span></div></div>
        <div class="tiny upper muted mt16 mb8">Regole in vigore</div>
        ${rulesInForce(st).map((r) => `<div class="vote-row"><span class="muted">${r.k}</span><b class="${r.mod ? 'info' : ''}">${esc(r.v)}</b></div>`).join('')}
        <div class="vote-row"><div><b class="small">Delega il voto</b><div class="tiny muted">Il delegato vota secondo l’interesse della squadra, senza lobby: nessuna finestra di decisione.</div></div><button class="btn sm ${P.pol.autoVote ? 'active' : ''}" data-a="wpol" data-k="autoVote">${P.pol.autoVote ? 'Attiva' : 'Disattiva'}</button></div>
        <div class="tiny upper muted mt16 mb8">Ultime votazioni</div>
        ${votes.length ? votes.slice(0, 6).map((v) => `<div class="vote-row"><div><b class="small">${esc(v.title)}</b><div class="tiny muted">${v.season} · abbiamo votato ${v.my === 'yes' ? 'sì' : 'no'}${v.lobby ? ` con lobby (${v.swung} voti spostati)` : ''}</div></div><span class="chip ${v.pass === (v.my === 'yes') ? 'good' : 'bad'}">${v.pass ? 'Approvata' : 'Bocciata'} ${v.yes}-${v.total - v.yes}</span></div>`).join('') : '<div class="small muted">Nessuna votazione finora.</div>'}
      </div>
      <div class="panel"><div class="panel-head"><h3>Voci di mercato</h3><span class="chip" data-tip="Quante voci dell’anno prima si sono rivelate vere">${rs.tot ? `Attendibilità storica ${Math.round((rs.ok / rs.tot) * 100)}%` : 'Attendibilità: da verificare'}</span></div>
        <div class="row wrap gap6 mb8">${Object.values(sourceStats(st)).map((x) => `<span class="chip tiny" data-tip="Voci verificate di questa fonte">${esc(x.name)}: ${x.pct == null ? 'attendibilità ' + x.rel.toLowerCase() : x.pct + '% vere su ' + x.n}</span>`).join('')}</div>
        ${rum.length ? rum.map((r) => `<div class="world-item"><span class="yr">${r.s}</span><span class="grow">${esc(r.name)} <span class="muted">(${esc(r.from)})</span> → <b>${esc(r.toName)}</b>${r.src ? ` <span class="tiny muted">· ${esc(RUMOUR_SOURCES.find((x) => x.id === r.src)?.name || '')}</span>` : ''}</span>${r.ok == null ? '<span class="chip tiny">In attesa</span>' : r.ok ? '<span class="chip tiny good">Confermata</span>' : '<span class="chip tiny bad">Bufala</span>'}</div>`).join('') : '<div class="small muted">Il mercato dorme: le voci iniziano a girare da metà stagione.</div>'}
        <div class="tiny muted mt8">Alcune voci nascono da trattative vere, altre sono fumo: le fonti interne ci prendono quasi sempre, i tabloid raramente. A inizio stagione scopri quali erano fondate.</div>
      </div>
    </div>
    <div class="col gap16">
      <div class="panel flush"><div class="panel-head" style="padding:14px 16px 0"><h3>Stato delle squadre</h3><span class="small muted">Valore vettura, classifica e tendenza</span></div>
        <table class="tbl small"><thead><tr><th>Team</th><th class="right">Vettura</th><th class="right">Class.</th><th class="right">Budget</th><th>Tendenza</th></tr></thead><tbody>
        ${teams.map((t) => { const tr = aiTrend(st, t.id); return `<tr class="${t.id === pt.id ? 'me' : ''}"><td><div class="row">${teamBadge(t, 22)}<div><b>${esc(t.name)}</b>${t.formerNames?.length ? `<div class="tiny muted">ex ${esc(t.formerNames[t.formerNames.length - 1].name)}</div>` : ''}</div></div></td><td class="right mono">${avgPart(t).toFixed(1)}</td><td class="right mono">${s.indexOf(t.id) + 1}°</td><td class="right mono">${fmtM(t.baseBudget)}</td><td class="tiny ${t.isPlayer ? 'muted' : tr.cls}">${t.isPlayer ? '—' : `${tr.arrow} ${tr.label}`}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="tiny muted" style="padding:10px 16px 14px">La tendenza riassume slancio tecnico, budget e stabilità della dirigenza: una squadra in ascesa sviluppa più in fretta, una in crisi cambia direttore tecnico o team principal, e a volte proprietà.</div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Cronache del paddock</h3><span class="small muted">Cambi di proprietà, esoneri, scandali</span></div>
        ${w.length ? w.slice(0, 12).map((x) => `<div class="world-item"><span class="yr">${x.s}</span><span>${esc(x.text)}</span></div>`).join('') : '<div class="small muted">Nessun terremoto, per ora. Le novità arrivano soprattutto d’inverno.</div>'}
      </div>
    </div>
  </div>`;
}

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
      ${careerCard(st)}
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

// Manager career: reputation that follows you between teams and categories, difficulty, Ironman
function careerCard(st) {
  const L = legacyInfo(st); const c = st.career || {}; const D = diffOf(st);
  const rep = Math.round(c.reputation || 0);
  const titles = (c.trophies || []).length;
  const teamsRun = new Set((c.history || []).map((h) => `${h.category}:${h.teamId}`)).size;
  const S = storyInfo(st);
  return `<div class="panel"><div class="panel-head"><h3>${icon('trophy')} La tua carriera</h3><span class="chip">${esc(L.tier)}</span></div>
    <div class="grid3"><div class="kpi"><b>${rep}</b><span>Reputazione manager</span></div><div class="kpi"><b>${titles}</b><span>Titoli</span></div><div class="kpi"><b>${teamsRun || 1}</b><span>Squadre guidate</span></div></div>
    <div class="tiny muted mt8">La reputazione viaggia con te: decide le offerte di lavoro a fine stagione, anche in altre categorie. Punteggio eredità ${L.score}${L.next ? ` · prossimo rango «${esc(L.next.name)}» a ${L.next.min}` : ''}.</div>
    ${S.fx.length ? `<div class="tiny upper muted mt16">Eredità delle storie</div>${S.fx.slice(0, 3).map((f) => `<div class="tiny">• ${esc(f.text)} <span class="muted">(${f.s})</span></div>`).join('')}` : ''}
    <div class="vote-row mt8"><div><b class="small">Difficoltà: ${esc(D.name)}</b><div class="tiny muted">Sviluppo AI ×${D.ai.toFixed(2)} · premi e diritti ×${D.econ.toFixed(2)} · obiettivi ${D.target < 0 ? 'più alti' : D.target > 0 ? 'più bassi' : 'standard'}</div></div></div>
    <div class="vote-row"><div><b class="small">Modalità Ironman</b><div class="tiny muted">${isIronman(st) ? `Attiva dal ${st.ironman.since}: un solo salvataggio, scritto dopo ogni scelta.` : 'Un solo salvataggio, aggiornato dopo ogni decisione: nessun ripensamento. Si attiva in pre-stagione.'}</div></div>${isIronman(st) ? '<span class="chip good">Attiva</span>' : `<button class="btn sm" data-a="ironman" ${st.round === 0 ? '' : 'disabled'}>Attiva</button>`}</div>
  </div>`;
}
