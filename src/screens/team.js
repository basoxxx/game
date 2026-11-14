import { helmet3D } from '../ui/stage3d.js';
// Drivers, Market, Staff & Facilities, Finance & Sponsors
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge } from '../ui/art.js';
import { esc, bar, stars } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { driverOverall, salaryFor, STAFF_ROLES, FACILITIES } from '../engine/world.js';
import { cat, playerTeam, teamDrivers, standings, fmtM, freeAgents, driverInterest, buyoutCost, signDriver, releaseDriver, hireStaff, facilityCost, startFacility, seatsPerTeam, addFinance, costCap, capSpent } from '../engine/season.js';
import { driverChip, ovr, ratingBox, moraleChip, attrBars, ATTR_NAMES, teamStripe } from './common.js';
import { sfx } from '../ui/audio.js';
import { hasPerk } from '../engine/progress.js';
import { negotiate, canPrecontract, nextSeasonRoster, persona } from '../engine/market.js';
import { licencePoints, BAN_POINTS } from '../engine/stewards.js';
import { compEnabled, compSummaryText } from '../engine/components.js';
import { ensureDynasty, academyDrivers, academySlots, prospectFee, scoutedPot, signProspect, promoteJunior, releaseJunior, academyUpkeep, traitInfo, teamTrait, facilityCap, STATUS, goalText, INVEST, investState, investCost, stakeCost, investUpkeep, investSpent, startInvestment, sellStake, bonusRates, toggleJuniorRenewal, principal, relColor } from '../engine/dynasty.js';
import { lineChart, signFx } from './career-ui.js';
import { ensureDepth, formLabel, formClass, isInjured, injuryText, reserveCandidates, currentReserve, setReserve, fansInfo, fmtFans, ownerInfo, incomingStaff, buyOutLeave, prizeTable, loanTargets, loanJunior, onLoan } from '../engine/depth.js';
import '../styles/career.css';

// --------------- DRIVERS ---------------
registerScreen({
  id: 'drivers',
  render() {
    const st = S();
    const t = playerTeam(st);
    const C = cat(st);
    const s = standings(st);
    const ds = teamDrivers(st, t);
    const seats = seatsPerTeam(st);
    return `<div class="screen-title"><div><div class="sub">${esc(t.name)}</div><h1>Piloti</h1></div><button class="btn" data-a="nav" data-to="market">${icon('market')} Mercato piloti</button></div>
    <div class="grid2 anim-in">${ds.map((d, i) => {
      const pos = s.drivers.findIndex((x) => x.id === d.id) + 1;
      const pts = s.drivers.find((x) => x.id === d.id)?.pts || 0;
      return `<div class="panel drv-card"><div class="drv-bignum">${d.number}</div>
        <div class="row" style="gap:18px;align-items:flex-start">${helmet3D(d.helmet, 92)}
          <div class="grow"><div class="row">${flagSVG(d.nat, 26, 17)}<h2 style="font-size:32px;font-style:italic;font-weight:800">${esc(d.name)}</h2></div>
            <div class="row wrap mt8 gap6"><span class="chip">#${d.number}</span><span class="chip">${d.age} anni</span>${C.driversPerCar > 1 ? `<span class="chip info">Auto ${Math.floor(i / C.driversPerCar) + 1}</span>` : ''}${moraleChip(d.morale)}</div>
            <div class="row wrap mt8 gap6 small"><span class="muted">Contratto:</span><b>${d.contract} ${d.contract === 1 ? 'stagione' : 'stagioni'}</b><span class="muted">· Stipendio:</span><b>${fmtM(d.salary)}/anno</b></div>
            ${driverStatusChips(st, d, t)}
          </div>
          <div class="col" style="align-items:center;gap:4px">${ratingBox(ovr(st, d), false)}<span class="tiny muted">OVR</span></div>
        </div>
        <div class="col gap6 mt16">${attrBars(d)}</div>
        <div class="row mt16 small between"><span class="muted">Potenziale</span><span class="stars">${stars(Math.min(5, Math.max(1, (d.pot - 60) / 8)))}</span></div>
        <div class="grid4 mt16">
          <div class="kpi"><b>${pos ? pos + '°' : '-'}</b><span>Campionato</span></div><div class="kpi"><b>${pts}</b><span>Punti</span></div>
          <div class="kpi"><b>${d.stats.wins}</b><span>Vittorie carriera</span></div><div class="kpi"><b>${d.stats.titles}</b><span>Titoli</span></div>
        </div>
        <div class="card mt16"><div class="row between"><b class="small">${icon('sim', 'ico', 'style="width:14px;vertical-align:-2px"')} Sessione al simulatore</b><span class="tiny muted">${fmtM(simCost(st))} · 1 per evento</span></div>
          <div class="row wrap gap4 mt8">${Object.entries(ATTR_NAMES).filter(([k]) => k !== 'exp').map(([k, n]) => `<button class="btn sm" data-a="train" data-id="${d.id}" data-k="${k}" ${d._trained === st.round + '-' + st.season || d.attrs[k] >= Math.min(99, d.pot + 2) || t.money < simCost(st) ? 'disabled' : ''}>${n}</button>`).join('')}</div>
          <div class="tiny muted mt8">${d._trained === st.round + '-' + st.season ? 'Già allenato per questo evento.' : 'Migliora un attributo fino al potenziale del pilota. Più efficace con un Simulatore di livello alto.'}</div></div>
        <div class="row mt16 gap6"><button class="btn sm" data-a="renew" data-id="${d.id}">${icon('swap')} Rinnova</button><button class="btn sm ghost" data-a="release" data-id="${d.id}">${icon('x')} Libera</button></div>
      </div>`;
    }).join('')}
    ${Array.from({ length: Math.max(0, seats - ds.length) }, () => `<div class="panel empty" style="border-style:dashed"><div>${icon('plus', 'ico', 'style="width:36px;height:36px"')}</div><div class="mt8">Sedile libero</div><button class="btn primary mt16" data-a="nav" data-to="market">Trova un pilota</button></div>`).join('')}
    </div>
    ${reservePanel(st, t)}
    ${academyPanel(st, t)}`;
  },
  actions: {
    'acad-loan'(el) {
      const st = S(); const d = st.drivers[el.dataset.id]; const tg = loanTargets(st, d);
      if (!tg.length) { App.toast('Nessun sedile', 'Nessuna squadra è disposta a farlo correre quest’anno.', 'bad'); return; }
      App.modal(`<div class="tiny upper" style="color:var(--team)">Accademia · prestito</div><h2 style="margin-top:8px">Dove mandiamo ${esc(d.name)}?</h2><p style="color:var(--text2);line-height:1.6">Correrà tutta la stagione ${st.season} da titolare e rientrerà in accademia a fine anno. Una stagione vera vale molto più delle serie minori per la sua crescita, e la squadra che lo accoglie se ne ricorderà (rapporto +6). Finché è in prestito non puoi promuoverlo né usarlo come terzo pilota.</p>
        <div class="dyn-opts mt16">${tg.map((x) => `<div class="card click" data-a="loan-go" data-t="${x.team.id}"><div class="tiny upper muted">${overallCarRankingPos(st, x.team)}ª vettura</div><b>${esc(x.team.name)}</b><div class="small mt8" style="color:var(--text2)">Prende il posto di ${esc(x.out.name)} (OVR ${x.outOv})</div></div>`).join('')}</div><div class="row mt16" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button></div>`,
      { 'loan-go'(e2) { const r = loanJunior(st, d.id, e2.dataset.t); App.closeModal(); if (!r.ok) { App.toast('Prestito saltato', r.msg, 'bad'); return; } sfx.ok(); App.toast('Prestito concluso', `${d.name} correrà con ${r.team.name}.`, 'good'); App.refresh(); } }, 'wide');
    },
    reserve(el) { const r = setReserve(S(), el.dataset.id); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } sfx.ok(); App.toast('Terzo pilota nominato', S().drivers[el.dataset.id]?.name || '', 'good'); App.refresh(); },
    train(el) {
      const st = S(); const t = playerTeam(st); const d = st.drivers[el.dataset.id]; const k = el.dataset.k;
      const cost = simCost(st);
      if (t.money < cost) return;
      addFinance(st, `Simulatore: ${d.name}`, -cost);
      const gain = Math.random() < 0.35 + t.facilities.simulator * 0.12 + (teamTrait(st, t, 'engineer', 'mentor') ? 0.15 : 0) ? (Math.random() < 0.2 ? 2 : 1) : 0;
      d.attrs[k] = Math.min(99, d.attrs[k] + gain); d._trained = st.round + '-' + st.season;
      d.morale = Math.min(100, d.morale + 2);
      App.toast(gain ? `${d.name}: ${ATTR_NAMES[k]} +${gain}` : 'Sessione poco produttiva', gain ? 'Il lavoro al simulatore ha dato frutti.' : 'Nessun miglioramento questa volta.', gain ? 'good' : '');
      if (gain) sfx.ok(); App.refresh();
    },
    renew(el) { openContract(el.dataset.id, null, true); },
    release(el) {
      const st = S(); const d = st.drivers[el.dataset.id];
      App.confirm(`Liberare ${esc(d.name)}?`, d.standIn ? `È un ingaggio d’emergenza: nessuna penale.` : `Pagherai una penale di ${fmtM(d.salary * d.contract * 0.5)} (50% del contratto residuo).`, () => { releaseDriver(st, d, true); App.refresh(); }, 'Libera', true);
    },
    'acad-sign'(el) {
      const st = S(); const r = signProspect(st, el.dataset.id);
      if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; }
      sfx.win(); App.toast('Nuovo talento in accademia!', 'Crescerà ogni inverno: promuovilo quando è pronto.', 'good'); App.refresh();
      const nd = st.drivers[el.dataset.id]; if (nd) signFx('Accademia', nd.name, 'Nuovo talento del vivaio', nd.helmet ? helmetSVG(nd.helmet, 84) : '');
    },
    'acad-release'(el) {
      const st = S(); const d = st.drivers[el.dataset.id];
      App.confirm(`Lasciare andare ${esc(d.name)}?`, 'Il ragazzo lascerà l’accademia e diventerà un pilota svincolato.', () => { releaseJunior(st, d.id); App.refresh(); }, 'Libera', true);
    },
    'acad-promote'(el) { promoteModal(el.dataset.id); },
  },
});

export function openContract(driverId, replaceId = null, renew = false) {
  const st = S();
  const d = st.drivers[driverId];
  const t = playerTeam(st);
  persona(d);
  const ask = driverInterest(st, d, t, 1, 1).ask;
  let salary = +(ask * 1.0).toFixed(2), years = 2, no1 = false, reply = null, counter = null;
  const preOk = !renew && canPrecontract(st, d);
  let mode = renew ? 'renew' : preOk ? 'pre' : 'sign';
  const seats = seatsPerTeam(st);
  const mine = teamDrivers(st, t);
  const render = () => {
    const { score, ev } = driverInterest(st, d, t, salary, years, { no1 });
    const dem = ev.demands;
    const buy = mode === 'sign' ? buyoutCost(st, d) : 0;
    const ros = nextSeasonRoster(st);
    const needReplace = mode === 'sign' ? mine.length >= seats : mode === 'pre' ? ros.free <= 0 : false;
    const replList = mode === 'pre' ? ros.staying : mine;
    const verdict = score >= 1.12 ? ['good', 'Entusiasta'] : score >= 1 ? ['warn', 'Disponibile'] : score >= 0.9 ? ['warn', 'Ci sta pensando'] : ['bad', 'Non interessato'];
    const pat = ev.patience;
    return `<div class="row" style="gap:14px">${helmet3D(d.helmet, 64)}<div class="grow"><div class="row">${flagSVG(d.nat)}<h2 style="margin:0">${esc(d.name)}</h2></div><div class="small muted">${d.age} anni · ${d.teamId ? esc(st.teams[d.teamId].name) + ` (contratto: ${d.contract} ${d.contract === 1 ? 'stagione' : 'stagioni'})` : 'Svincolato'} · OVR ${ovr(st, d)}</div>
      <div class="row gap6 mt8 wrap"><span class="chip info" title="${esc(dem.persona.desc)}">${esc(dem.persona.name)}</span><span class="chip">Agente: ${esc(dem.agent)}</span><span class="chip ${pat <= 1 ? 'bad' : ''}">Pazienza ${'●'.repeat(Math.max(0, pat))}${'○'.repeat(Math.max(0, 4 - pat))}</span></div></div></div>
    <div class="small muted mt8">${esc(dem.persona.desc)}</div>
    ${dem.notes.length ? `<div class="row gap6 mt8 wrap">${dem.notes.map((n) => `<span class="chip warn">${esc(n)}</span>`).join('')}</div>` : ''}
    ${dem.rival ? `<div class="card mt8" style="border-color:var(--bad)"><b class="small bad">Offerta concorrente</b><div class="small">${esc(st.teams[dem.rival.teamId]?.name || '')}: ${fmtM(dem.rival.salary)}/anno per ${dem.rival.years} anni · decisione entro il round ${dem.rival.deadline + 1}</div></div>` : ''}
    <div class="col gap16 mt16">
      ${!renew && preOk ? `<div><label class="lbl">Tipo di accordo</label><div class="row gap6 mt8"><button class="btn sm ${mode === 'pre' ? 'active' : ''}" data-a="mode" data-m="pre">Precontratto dal ${st.season + 1}</button><button class="btn sm ${mode === 'sign' ? 'active' : ''}" data-a="mode" data-m="sign">Subito (clausola ${fmtM(buyoutCost(st, d))})</button></div><div class="tiny muted mt8">Il contratto di ${esc(d.name)} scade a fine anno: con un precontratto non paghi la clausola, ma arriverà solo la prossima stagione.</div></div>` : ''}
      <div><div class="row between"><label class="lbl">Stipendio annuo</label><b>${fmtM(salary)}</b></div><input type="range" min="${(ask * 0.5).toFixed(2)}" max="${(ask * 2.2).toFixed(2)}" step="0.05" value="${salary}" data-input="sal" class="mt8"><div class="tiny muted mt8">Richiesta dell’agente: circa ${fmtM(ask)}</div></div>
      <div><label class="lbl">Durata</label><div class="row gap6 mt8">${[1, 2, 3, 4].map((y) => `<button class="btn sm ${years === y ? 'active' : ''}" data-a="years" data-y="${y}">${y} ${y === 1 ? 'anno' : 'anni'}${y === dem.prefYears ? ' ★' : ''}</button>`).join('')}</div><div class="tiny muted mt8">★ durata preferita dal pilota</div></div>
      <div><label class="lbl">Ruolo in squadra</label><div class="row gap6 mt8"><button class="btn sm ${!no1 ? 'active' : ''}" data-a="no1" data-v="0">Parità con il compagno</button><button class="btn sm ${no1 ? 'active' : ''}" data-a="no1" data-v="1">Prima guida garantita</button></div><div class="tiny muted mt8">La prima guida riceve la precedenza negli ordini di scuderia: piace ai piloti ambiziosi, ma il compagno perde morale.</div></div>
      ${needReplace ? `<div><label class="lbl">${mode === 'pre' ? 'Lascerà a fine stagione' : 'Sostituisce'}</label><div class="row gap6 mt8 wrap">${replList.map((m) => `<button class="btn sm ${replaceId === m.id ? 'active' : ''}" data-a="repl" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div><div class="tiny muted mt8">${mode === 'pre' ? 'Il pilota indicato verrà liberato a fine anno (penale 50% del residuo).' : 'Il pilota sostituito verrà liberato (penale 50% del residuo).'}</div></div>` : ''}
      <div class="card"><div class="row between"><span>Interesse</span><span class="chip ${verdict[0]}">${verdict[1]}</span></div>${bar(Math.min(100, score * 80), verdict[0] === 'good' ? 'green' : verdict[0] === 'warn' ? 'gold' : 'red')}
        <div class="row between small mt8"><span class="muted">Bonus firma (25%)</span><b>${fmtM(renew ? 0 : salary * 0.25)}</b></div>
        ${buy ? `<div class="row between small"><span class="muted">Clausola rescissoria</span><b>${fmtM(buy)}</b></div>` : ''}
      </div>
      ${reply ? `<div class="card" style="border-left:3px solid var(--warn)"><div class="small">${esc(reply)}</div>${counter && counter <= ask * 2.2 ? `<button class="btn sm mt8" data-a="counter">Accetta la controproposta (${fmtM(counter)})</button>` : ''}</div>` : ''}
    </div>
    <div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button><button class="btn primary" data-a="sign" ${(needReplace && !replaceId) || ev.blocked ? 'disabled' : ''}>${renew ? 'Proponi rinnovo' : mode === 'pre' ? 'Proponi precontratto' : 'Offri contratto'}</button></div>`;
  };
  const rerender = () => { const m = document.querySelector('.modal'); if (m) m.innerHTML = render(); };
  App.modal(render(), {
    sal(el) { salary = +(+el.value).toFixed(2); rerender(); },
    years(el) { years = +el.dataset.y; rerender(); },
    repl(el) { replaceId = el.dataset.id; rerender(); },
    mode(el) { mode = el.dataset.m; replaceId = null; rerender(); },
    no1(el) { no1 = el.dataset.v === '1'; rerender(); },
    counter() { if (counter) salary = +Math.min(ask * 2.2, Math.ceil(counter * 20) / 20).toFixed(2); reply = null; counter = null; rerender(); },
    sign() {
      const r = negotiate(st, d.id, { salary, years, no1, replaceId, mode });
      if (!r.ok) { reply = r.msg; counter = r.counter || null; sfx.bad(); rerender(); return; }
      App.closeModal(); App.toast(renew ? 'Contratto rinnovato' : mode === 'pre' ? 'Precontratto firmato!' : 'Firmato!', r.msg || `${d.name} è un nuovo pilota di ${t.name}`, 'good'); sfx.win(); App.refresh();
      signFx(renew ? 'Rinnovato' : mode === 'pre' ? 'Precontratto' : 'Firmato', d.name, `${years} ${years === 1 ? 'anno' : 'anni'} · ${fmtM(salary)} a stagione`, helmetSVG(d.helmet, 84));
    },
  });
}

// --------------- MARKET ---------------
let mFilter = 'all', mSort = 'ovr';
registerScreen({
  id: 'market',
  render() {
    const st = S();
    const t = playerTeam(st);
    let list = Object.values(st.drivers).filter((d) => !d.retired && d.teamId !== t.id && !d.academy);
    if (mFilter === 'free') list = list.filter((d) => !d.teamId);
    if (mFilter === 'young') list = list.filter((d) => d.age <= 23);
    if (mFilter === 'team') list = list.filter((d) => d.teamId);
    const academy = t.facilities.academy;
    list.sort((a, b) => mSort === 'ovr' ? ovr(st, b) - ovr(st, a) : mSort === 'pot' ? b.pot - a.pot : mSort === 'age' ? a.age - b.age : a.salary - b.salary);
    const showPot = (d) => academy >= 4 || hasPerk(st, 'scout') ? d.pot : academy >= 2 ? Math.round(d.pot / 5) * 5 : null;
    const seatsFree = seatsPerTeam(st) - teamDrivers(st, t).length;
    return `<div class="screen-title"><div><div class="sub">${seatsFree > 0 ? `<span class="bad">${seatsFree} sedile/i libero/i</span>` : 'Tutti i sedili occupati'} · Budget ${fmtM(t.money)}</div><h1>Mercato Piloti</h1></div>
      <div class="row"><div class="tabs">${[['all', 'Tutti'], ['free', 'Svincolati'], ['team', 'Sotto contratto'], ['young', 'Giovani']].map(([k, n]) => `<div class="tab ${mFilter === k ? 'active' : ''}" data-a="filter" data-f="${k}">${n}</div>`).join('')}</div>
      <select data-change="sort"><option value="ovr" ${mSort === 'ovr' ? 'selected' : ''}>Ordina: Valore</option><option value="pot" ${mSort === 'pot' ? 'selected' : ''}>Potenziale</option><option value="age" ${mSort === 'age' ? 'selected' : ''}>Età</option><option value="sal" ${mSort === 'sal' ? 'selected' : ''}>Stipendio</option></select></div></div>
    <div class="panel flush anim-in"><table class="tbl"><thead><tr><th>Pilota</th><th>Squadra</th><th class="right">Età</th>${Object.values(ATTR_NAMES).map((n) => `<th class="right" title="${n}">${n.slice(0, 3)}</th>`).join('')}<th class="right">Pot.</th><th class="right">OVR</th><th class="right">Stipendio</th><th></th></tr></thead><tbody>
      ${list.slice(0, 80).map((d) => { const tm = d.teamId ? st.teams[d.teamId] : null; const p = showPot(d); return `<tr><td>${driverChip(st, d, { size: 24 })}${d.backing > 0 ? ` <span class="chip tiny good" title="Pilota pagante: sponsor personali">+${fmtM(d.backing)}/a</span>` : ''}</td><td class="small">${tm ? `<div class="row">${teamStripe(tm)}${esc(tm.short)} <span class="muted">(${d.contract}a)</span>${d.nextTeam ? ` <span class="chip tiny ${d.nextTeam === t.id ? 'good' : ''}">→ ${esc(st.teams[d.nextTeam]?.short || '')}</span>` : canPrecontract(st, d) ? ' <span class="chip tiny warn" title="Contratto in scadenza: puoi firmare un precontratto">Precontratto</span>' : ''}</div>` : `<span class="chip good">Libero</span>${d.reserveFor ? ` <span class="chip tiny">Riserva ${esc(st.teams[d.reserveFor]?.short || '')}</span>` : ''}`}</td><td class="right mono">${d.age}</td>${Object.keys(ATTR_NAMES).map((k) => `<td class="right mono ${d.attrs[k] >= 88 ? 'good' : d.attrs[k] < 70 ? 'dim' : ''}">${d.attrs[k]}</td>`).join('')}<td class="right mono">${p == null ? '<span class="dim" title="Migliora l’Accademia per vedere il potenziale">?</span>' : p}</td><td class="right">${ratingBox(ovr(st, d))}</td><td class="right mono small">${fmtM(d.salary)}</td><td class="right"><button class="btn sm ${tm ? '' : 'primary'}" data-a="offer" data-id="${d.id}">Offerta</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
  },
  actions: {
    filter(el) { mFilter = el.dataset.f; App.refresh(); },
    sort(el) { mSort = el.value; App.refresh(); },
    offer(el) { openContract(el.dataset.id); },
  },
});

// --------------- STAFF & FACILITIES ---------------
registerScreen({
  id: 'staff',
  render() {
    const st = S();
    const t = playerTeam(st);
    ensureDynasty(st);
    const cap = facilityCap(st);
    const inc = incomingStaff(st);
    const pool = (role) => Object.values(st.staff).filter((s) => s.role === role && s.id !== t.staff[role] && s.teamId !== t.id).sort((a, b) => b.rating - a.rating).slice(0, 6);
    const trait = (s) => { const ti = s && traitInfo(s.role, s.trait); return ti ? `<span class="trait" data-tip="${esc(ti.desc)}">${icon('star')} ${esc(ti.name)}</span>` : ''; };
    return `<div class="screen-title"><div><div class="sub">${esc(t.name)} · ${esc(t.hq)}</div><h1>Staff & Strutture</h1></div></div>
    <div class="panel anim-in"><div class="panel-head"><h3>Strutture</h3>${t.facilityBuild ? `<span class="chip warn">Cantiere: ${FACILITIES[t.facilityBuild.key].name} (${t.facilityBuild.racesLeft} eventi)</span>` : '<span class="chip">Un cantiere alla volta</span>'}</div>
      <div class="grid3" style="grid-template-columns:repeat(3,1fr)">${Object.entries(FACILITIES).map(([k, f]) => {
        const lvl = t.facilities[k] ?? 1; const cost = facilityCost(st, k, lvl + 1); const building = t.facilityBuild?.key === k;
        const capped = lvl < 5 && lvl + 1 > cap;
        return `<div class="card"><div class="row between">${icon(f.icon === 'star' ? 'star' : f.icon === 'wrench' ? 'wrench' : f.icon === 'sim' ? 'sim' : f.icon === 'wind' ? 'wind' : f.icon === 'money' ? 'money' : 'factory', 'ico', 'style="width:26px;height:26px;color:var(--team)"')}<span class="chip">Lv ${lvl}/5</span></div><div style="font-weight:800;margin-top:10px">${f.name}</div><div class="tiny muted mt8" style="min-height:32px">${f.desc}${k === 'academy' ? ` · ${academySlots(t)} posti` : k === 'hospitality' ? ` · +${fmtM((lvl - 1) * 0.12 * cat(st).budgetScale)}/evento` : ''}</div>
          <div class="row gap4 mt8">${[1, 2, 3, 4, 5].map((i) => `<div style="flex:1;height:6px;border-radius:3px;background:${i <= lvl ? 'var(--team)' : building && i === lvl + 1 ? 'var(--warn)' : i > cap ? 'repeating-linear-gradient(-45deg, rgba(255,255,255,.12) 0 3px, transparent 3px 6px)' : 'rgba(255,255,255,0.1)'}"></div>`).join('')}</div>
          ${lvl >= 5 ? '<div class="chip good mt16">Massimo</div>' : capped ? `<div class="chip mt16" data-tip="Il livello ${lvl + 1} si sblocca con lo status della squadra">${icon('lock')} Serve status «${STATUS[lvl + 1 >= 5 ? 3 : 1].name}»</div>` : `<button class="btn sm mt16" style="width:100%" data-a="upgrade" data-k="${k}" ${t.facilityBuild || t.money < cost ? 'disabled' : ''}>${building ? 'In costruzione…' : `Potenzia ${fmtM(cost)}`}</button>`}</div>`;
      }).join('')}</div>
    </div>
    <div class="grid3 mt16 anim-in">${Object.entries(STAFF_ROLES).map(([role, R]) => {
      const cur = st.staff[t.staff[role]];
      return `<div class="panel"><div class="panel-head"><h3>${R.name}</h3></div><div class="small muted mb16">${R.desc}</div>
        <div class="card row" style="border-color:color-mix(in srgb, var(--team) 50%, transparent)">${ratingBox(cur?.rating || 0, false)}<div class="grow"><b>${esc(cur?.name || 'Vacante')}</b><div class="tiny muted">${cur ? `${cur.age} anni · ${fmtM(cur.salary)}/anno` : ''}</div>${cur ? `<div class="mt8">${trait(cur)}</div>` : ''}</div></div>${cur && traitInfo(cur.role, cur.trait) ? `<div class="tiny muted mt8">${esc(traitInfo(cur.role, cur.trait).desc)}</div>` : ''}
        ${inc.filter((x) => x.s.role === role).map((x) => `<div class="card mt8" style="border-style:dashed"><div class="row">${ratingBox(x.s.rating)}<div class="grow"><b class="small">${esc(x.s.name)}</b><div class="tiny warn">In gardening leave: arriva tra ${x.left} ${x.left === 1 ? 'evento' : 'eventi'}</div></div><button class="btn sm" data-a="buyleave" data-id="${x.s.id}" ${t.money < x.s.salary * 0.8 ? 'disabled' : ''} data-tip="Paga il vecchio team per averlo subito">Subito · ${fmtM(x.s.salary * 0.8)}</button></div></div>`).join('')}
        <div class="tiny upper muted mt16 mb8">Disponibili</div>
        <div class="col gap6">${pool(role).map((s) => { const other = s.teamId ? st.teams[s.teamId] : null; return `<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)">${ratingBox(s.rating)}<div class="grow"><div class="row gap6" style="flex-wrap:wrap">${esc(s.name)} ${trait(s)}</div><div class="tiny muted">${other ? esc(other.short) + ' · liberatoria ' + fmtM(s.salary * 1.2) : 'Libero'} · ${fmtM(s.salary)}/a</div></div><button class="btn sm" data-a="hire" data-id="${s.id}">Ingaggia</button></div>`; }).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  },
  actions: {
    upgrade(el) { const r = startFacility(S(), el.dataset.k); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } sfx.ok(); App.toast('Cantiere aperto', FACILITIES[el.dataset.k].name, 'good'); App.refresh(); },
    hire(el) {
      const st = S(); const s = st.staff[el.dataset.id];
      App.confirm(`Ingaggiare ${esc(s.name)}?`, `Costo d’ingaggio ${fmtM(s.salary * 0.5)}${s.teamId ? ` + liberatoria ${fmtM(s.salary * 1.2)}. Arriva da un rivale: dovrà osservare un periodo di gardening leave prima di prendere servizio (puoi riscattarlo pagando)` : ''}. Stipendio ${fmtM(s.salary)}/anno.`, () => { const r = hireStaff(st, s.id); if (!r.ok) App.toast('Impossibile', r.msg, 'bad'); else { sfx.ok(); App.toast('Ingaggiato!', r.leave ? `${s.name} prenderà servizio tra ${r.leave} eventi (gardening leave).` : s.name, 'good'); } App.refresh(); });
    },
    buyleave(el) { const r = buyOutLeave(S(), el.dataset.id); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } sfx.ok(); App.toast('Gardening leave riscattato', 'Prende servizio da subito.', 'good'); App.refresh();
    },
  },
});

// --------------- FINANCE & SPONSORS ---------------
// Ledger labels → readable buckets for the "where the money goes" breakdown
function finBucket(label) {
  const L = label.toLowerCase();
  if (L.startsWith('investiment') || L.startsWith('museo') || L.startsWith('dividendi') || L.startsWith('cessione quote')) return 'Investimenti';
  if (L.startsWith('r&d') || L.startsWith('produzione') || L.startsWith('pacchetto')) return 'Sviluppo vettura';
  if (L.startsWith('cantiere')) return 'Strutture';
  if (L.includes('stipend') || L.includes('bonus firma') || L.includes('clausola') || L.includes('rescission') || L.includes('ingaggio') || L.includes('premi risultato') || L.includes('liberatoria')) return 'Piloti & staff';
  if (L.includes('sponsor') || L.startsWith('obiettivo') || L.startsWith('bonus') || L.includes('hospitality')) return 'Sponsor & commerciale';
  if (L.includes('diritti') || L.includes('montepremi') || L.includes('premio')) return 'Diritti & premi';
  if (L.includes('operativ') || L.includes('logistic')) return 'Operativi';
  if (L.includes('accademia')) return 'Accademia';
  if (L.includes('multa') || L.includes('penal')) return 'Multe';
  return 'Altro';
}
function moneyBreakdown(st) {
  const agg = {};
  for (const f of st.finance.filter((x) => x.season === st.season)) { const k = finBucket(f.label); agg[k] = (agg[k] || 0) + f.amount; }
  const rows = Object.entries(agg).filter(([, v]) => Math.abs(v) >= 0.01).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<div class="empty">${icon('money')}<b>Ancora nessun movimento</b><span>Il bilancio prende forma dopo il primo evento.</span></div>`;
  const mx = Math.max(...rows.map(([, v]) => Math.abs(v)));
  return `<div class="fin-bars">${rows.map(([k, v]) => `<div class="fb-row"><span class="fb-k">${esc(k)}</span><div class="fb-track"><i class="${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.max(2, (Math.abs(v) / mx) * 100)}%"></i></div><b class="${v >= 0 ? 'good' : 'bad'}">${v >= 0 ? '+' : ''}${fmtM(v)}</b></div>`).join('')}</div>`;
}
function cashChart(st) {
  const L = (st.dyn?.log || []).filter((x) => x.s >= st.season - 1);
  if (L.length < 2) return `<div class="empty" style="min-height:150px">${icon('chart')}<b>Grafico in arrivo</b><span>L’andamento della liquidità appare dopo due eventi.</span></div>`;
  const labels = L.map((x) => (x.s !== st.season ? `${String(x.s).slice(2)}·R${x.r + 1}` : `R${x.r + 1}`));
  return lineChart([{ name: 'Liquidità', color: 'var(--team)', values: L.map((x) => x.money), me: true }], labels, { w: 620, h: 200, area: true, fmt: (v) => fmtM(v).replace('€', '') });
}
function investPanel(st, t) {
  const I = investState(t);
  const sc = cat(st).budgetScale;
  const money = t.money;
  const isF = st.category === 'formula';
  const lvlDots = (l, max) => `<div class="inv-dots">${Array.from({ length: max }, (_, i) => `<i class="${i < l ? 'on' : I.build && i === l ? 'wip' : ''}"></i>`).join('')}</div>`;
  const card = (k, inner, state = '') => `<div class="inv-card ${state}"><div class="inv-top"><div class="inv-ic">${icon(INVEST[k].icon)}</div><div class="grow"><div class="inv-name">${esc(INVEST[k].name)}</div><div class="tiny muted">${esc(INVEST[k].desc)}</div></div></div>${inner}</div>`;
  const builds = ['tunnel', 'hq', 'museum'].map((k) => {
    const D = INVEST[k]; const l = I[k]; const wip = I.build?.key === k; const max = l >= D.max;
    const c = max ? 0 : investCost(st, k);
    const needWT = k === 'tunnel' && !max && (t.facilities.windtunnel || 1) < 3 + l;
    const eff = D.eff(Math.max(1, max ? l : l + 1));
    return card(k, `${lvlDots(l, D.max)}<div class="inv-eff ${l ? 'on' : ''}">${icon(l ? 'check' : 'plus')} ${esc(eff)}</div>
      ${wip ? `<div class="inv-wip"><span>Cantiere in corso</span><b>${I.build.racesLeft} eventi</b></div>${bar((1 - I.build.racesLeft / I.build.total) * 100, 'gold')}`
      : max ? `<div class="chip good mt8">Operativo${D.upkeep ? ` · gestione ${fmtM(D.upkeep * l * sc)}/anno` : ''}</div>`
      : needWT ? `<div class="chip mt8">${icon('lock')} Serve Galleria del Vento Lv${3 + l}</div>`
      : `<button class="btn sm ${money >= c * 1.5 ? 'primary' : ''} mt8" data-a="inv" data-k="${k}" ${I.build || money < c ? 'disabled' : ''}>${I.build ? 'Un cantiere alla volta' : `Investi ${fmtM(c)}`}</button>`}`, wip ? 'wip' : l ? 'owned' : '');
  });
  const mktLvl = I.mkt?.season === st.season ? I.mkt.lvl : 0;
  const mkt = card('marketing', `<div class="inv-eff ${mktLvl ? 'on' : ''}">${icon(mktLvl ? 'check' : 'plus')} ${esc(INVEST.marketing.eff(Math.max(1, mktLvl)))}</div><div class="inv-seg">${INVEST.marketing.levels.map((n, i) => { const lv = i + 1; const c = +(investCost(st, 'marketing', lv) - (mktLvl ? investCost(st, 'marketing', mktLvl) : 0)).toFixed(2); return `<button class="btn sm ${mktLvl >= lv ? 'active' : ''}" data-a="inv" data-k="marketing" data-v="${lv}" ${mktLvl >= lv || money < c ? 'disabled' : ''} data-tip="${esc(n)}">${mktLvl >= lv ? icon('check') : fmtM(c)}<span>${esc(['Social', 'Nazionale', 'Globale'][i])}</span></button>`; }).join('')}</div>`, mktLvl ? 'owned' : '');
  const R1 = bonusRates(st, 1), R2 = bonusRates(st, 2);
  const bonus = card('bonus', `<div class="inv-eff ${I.bonus ? 'on' : ''}">${icon(I.bonus ? 'check' : 'plus')} ${esc(INVEST.bonus.eff(Math.max(1, I.bonus)))}</div><div class="inv-seg">${INVEST.bonus.levels.map((n, i) => `<button class="btn sm ${I.bonus === i ? 'active' : ''}" data-a="inv" data-k="bonus" data-v="${i}" ${I.bonus === i ? 'disabled' : ''}>${esc(n)}<span>${i === 0 ? '—' : `vittoria ${fmtM(i === 1 ? R1.win : R2.win)}`}</span></button>`).join('')}</div>`, I.bonus ? 'owned' : '');
  const jc = investCost(st, 'junior');
  const junior = card('junior', `<div class="inv-eff ${I.juniorActive ? 'on' : ''}">${icon(I.juniorActive ? 'check' : 'plus')} ${esc(INVEST.junior.eff())}</div>${I.juniorActive ? `<div class="row between mt8"><span class="chip good">Attivo ${st.season}${I.juniorOff ? ' · non si rinnova' : ` · rinnovo ${fmtM(jc)}`}</span><button class="btn sm ghost" data-a="inv-jr">${I.juniorOff ? 'Riattiva rinnovo' : 'Disdici'}</button></div>` : `<button class="btn sm mt8" data-a="inv" data-k="junior" ${money < jc ? 'disabled' : ''}>Attiva ${fmtM(jc)}/anno</button>`}`, I.juniorActive ? 'owned' : '');
  const others = Object.values(st.teams).filter((x) => !x.isPlayer).sort((a, b) => (I.stakes[b.id] || 0) - (I.stakes[a.id] || 0) || a.rep - b.rep);
  const owned = Object.keys(I.stakes);
  const stakeRows = others.filter((x) => owned.includes(x.id) || owned.length < 2).slice(0, 4).map((x) => {
    const p = principal(st, x.id); const pct = I.stakes[x.id] || 0; const c = stakeCost(st, x.id);
    return `<div class="stake-row">${teamBadge(x, 26)}<div class="grow" style="min-width:0"><div class="small" style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}</div><div class="tiny" style="color:${p ? relColor(p.rel) : 'var(--text3)'}">${p ? esc(p.name) : ''}</div></div><div class="stake-pct">${pct}%</div><button class="btn sm" data-a="inv" data-k="stake" data-v="${x.id}" ${pct >= 30 || money < c ? 'disabled' : ''}>+10% · ${fmtM(c)}</button>${pct ? `<button class="btn sm ghost" data-a="inv-sell" data-v="${x.id}" data-tip="Cedi le quote (-20% sul valore)">${icon('x')}</button>` : ''}</div>`;
  }).join('');
  const stake = card('stake', `<div class="inv-eff ${owned.length ? 'on' : ''}">${icon(owned.length ? 'check' : 'plus')} ${esc(INVEST.stake.eff())}</div><div class="stake-grid mt8">${stakeRows}</div>`, `${owned.length ? 'owned' : ''} wide`);
  const up = investUpkeep(st, t);
  const spent = investSpent(st);
  return `<div class="panel mt16 anim-in inv-panel"><div class="panel-head"><h3>${icon('factory')} Investimenti${isF ? ' fuori budget cap' : ''}</h3><div class="row gap6"><span class="chip">Spesi ${st.season}: ${fmtM(spent)}</span>${up ? `<span class="chip">Gestione ${fmtM(up)}/anno</span>` : ''}${isF ? '<span class="chip info" data-tip="Il regolamento esclude dal budget cap le spese in conto capitale, il marketing e gli stipendi dei piloti.">Non conta nel cap</span>' : ''}</div></div>
    <div class="small muted mb16">${isF ? 'Il budget cap limita quanto puoi spendere in sviluppo, non quanto puoi investire nella squadra. ' : ''}Infrastrutture, marketing, premi e partecipazioni trasformano la liquidità in vantaggi duraturi.</div>
    <div class="inv-grid">${builds.join('')}${mkt}${bonus}${junior}${stake}</div></div>`;
}
registerScreen({
  id: 'finance',
  render() {
    const st = S();
    ensureDynasty(st);
    const t = playerTeam(st);
    const n = st.calendar.length;
    const sponsorIncome = t.sponsors.reduce((s, x) => s + x.perRace, 0);
    const salaries = teamDrivers(st, t).reduce((s, d) => s + d.salary, 0) + Object.values(t.staff).reduce((s, id) => s + (st.staff[id]?.salary || 0), 0);
    const recent = st.finance.filter((f) => f.season === st.season).slice(-40).reverse();
    const inc = st.finance.filter((f) => f.season === st.season && f.amount > 0).reduce((a, b) => a + b.amount, 0);
    const exp = st.finance.filter((f) => f.season === st.season && f.amount < 0).reduce((a, b) => a + b.amount, 0);
    const objNames = { points: 'Punti', podium: 'Podio', win: 'Vittoria', finish: 'Doppio arrivo', beat: 'Batti il rivale' };
    const isF = st.category === 'formula';
    const cap = costCap(st), spentCap = capSpent(st);
    const perEvent = t.baseBudget * 0.46 / n * (0.7 + t.rep / 300) + sponsorIncome + (t.facilities.hospitality - 1) * 0.12 * cat(st).budgetScale - salaries / n - academyUpkeep(st) / n - (t.baseBudget * 0.1 + Object.values(t.facilities).reduce((a, b) => a + b, 0) * 0.4 * cat(st).budgetScale) / n - investUpkeep(st, t) / n;
    const surplus = t.money > t.baseBudget * 0.35;
    return `<div class="screen-title"><div><div class="sub">Stagione ${st.season} · ${esc(t.name)}</div><h1>Sponsor & Finanze</h1></div>${surplus ? `<div class="chip warn" style="font-size:13px;padding:8px 12px">${icon('money')} Liquidità in eccesso: valuta gli investimenti</div>` : ''}</div>
    <div class="fin-kpis anim-in">
      <div class="panel fin-kpi hero"><span>Liquidità</span><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><em class="${perEvent >= 0 ? 'good' : 'bad'}">${perEvent >= 0 ? '+' : ''}${fmtM(perEvent)} per evento (stima)</em></div>
      <div class="panel fin-kpi"><span>Entrate stagione</span><b class="good">+${fmtM(inc)}</b><em>${fmtM(sponsorIncome)} sponsor per evento</em></div>
      <div class="panel fin-kpi"><span>Uscite stagione</span><b class="bad">${fmtM(exp)}</b><em>Saldo ${inc + exp >= 0 ? '+' : ''}${fmtM(inc + exp)}</em></div>
      ${isF ? `<div class="panel fin-kpi"><span>Budget cap</span><b class="${spentCap > cap ? 'bad' : ''}">${fmtM(spentCap)}<small> / ${fmtM(cap)}</small></b>${bar(Math.min(100, (spentCap / cap) * 100), spentCap > cap * 0.9 ? 'red' : spentCap > cap * 0.7 ? 'gold' : 'green')}</div>` : `<div class="panel fin-kpi"><span>Investimenti ${st.season}</span><b>${fmtM(investSpent(st))}</b><em>Fuori dalla gestione corrente</em></div>`}
    </div>
    ${ownerFansPanel(st, t)}
    <div class="fin-charts mt16 anim-in">
      <div class="panel"><div class="panel-head"><h3>Andamento liquidità</h3><span class="small muted">Ultime due stagioni</span></div>${cashChart(st)}</div>
      <div class="panel"><div class="panel-head"><h3>Dove vanno i soldi</h3><span class="small muted">Stagione ${st.season}</span></div>${moneyBreakdown(st)}</div>
    </div>
    ${investPanel(st, t)}
    <div class="fin-cols mt16">
      <div class="col gap16">
        <div class="panel"><div class="panel-head"><h3>Sponsor attivi (${t.sponsors.length}/3)</h3></div>
          ${t.sponsors.length ? `<div class="grid3">${t.sponsors.map((s) => `<div class="card"><div class="tiny upper muted">${s.tier === 3 ? 'Title sponsor' : s.tier === 2 ? 'Partner' : 'Fornitore'}</div><div style="font-family:var(--display);font-weight:800;font-size:18px">${esc(s.name)}</div><div class="small mt8">${fmtM(s.perRace)}/evento</div><div class="tiny muted">Bonus ${objNames[s.objective]}: ${fmtM(s.bonus)}</div><div class="tiny muted">${s.seasonsLeft} ${s.seasonsLeft === 1 ? 'stagione' : 'stagioni'} rimanenti</div>${sponsorExtra(st, s)}<button class="btn sm ghost mt8" data-a="drop-sp" data-id="${s.id}">${icon('x')} Rescindi</button></div>`).join('')}${Array.from({ length: Math.max(0, 3 - t.sponsors.length) }, () => `<div class="sp-slot">${icon('plus')}<b>Spazio libero</b><span>${st.sponsorOffers.length ? 'Firma un’offerta qui sotto: bonus subito e incassi a ogni evento' : 'Nuove offerte arrivano dopo i risultati'}</span></div>`).join('')}</div>` : `<div class="empty">${icon('money')}<b>Livrea ancora bianca</b><span>Nessuno sponsor attivo: firma una delle offerte qui sotto.</span></div>`}
        </div>
        <div class="panel"><div class="panel-head"><h3>Offerte di sponsorizzazione</h3></div>
          ${st.sponsorOffers.length ? `<div class="col gap6">${st.sponsorOffers.map((o) => `<div class="card row" style="gap:14px"><div class="grow"><div class="row"><b style="font-family:var(--display);font-size:17px">${esc(o.name)}</b><span class="stars small">${'★'.repeat(o.tier)}</span></div><div class="small muted">${o.objText}: +${fmtM(o.bonus)} · ${o.seasons} ${o.seasons === 1 ? 'stagione' : 'stagioni'}</div></div><div class="right"><div><b>${fmtM(o.perRace)}</b><span class="tiny muted">/evento</span></div><div class="tiny good">Firma: +${fmtM(o.signing)}</div></div><button class="btn sm primary" data-a="sign" data-id="${o.id}" ${t.sponsors.length >= 3 ? 'disabled' : ''}>Firma</button></div>`).join('')}</div>` : `<div class="empty">${icon('mail')}<b>Telefono muto</b><span>Nessuna offerta al momento: arriveranno con i risultati o con una campagna marketing.</span></div>`}
          ${t.sponsors.length >= 3 && st.sponsorOffers.length ? '<div class="small warn mt8">Tutti gli spazi sono occupati. Rescindi un contratto per firmarne un altro.</div>' : ''}
        </div>
      </div>
      <div class="col gap16">
        <div class="panel"><div class="panel-head"><h3>Previsione per evento</h3></div>
          <div class="col gap6 small">
            <div class="row between"><span class="muted">Diritti commerciali</span><b class="good">+${fmtM(t.baseBudget * 0.46 / n * (0.7 + t.rep / 300))}</b></div>
            <div class="row between"><span class="muted">Sponsor (base)</span><b class="good">+${fmtM(sponsorIncome)}</b></div>
            ${t.facilities.hospitality > 1 ? `<div class="row between"><span class="muted">Hospitality & marketing</span><b class="good">+${fmtM((t.facilities.hospitality - 1) * 0.12 * cat(st).budgetScale)}</b></div>` : ''}
            ${st.dyn?.goals?.list?.length ? `<div class="row between"><span class="muted">Obiettivi sponsor (se centrati)</span><b class="good">fino a +${fmtM(st.dyn.goals.list.reduce((a, g) => a + g.reward, 0))}</b></div>` : ''}
            <div class="row between"><span class="muted">Stipendi</span><b class="bad">-${fmtM(salaries / n)}</b></div>
            ${academyDrivers(st).length ? `<div class="row between"><span class="muted">Accademia giovani</span><b class="bad">-${fmtM(academyUpkeep(st) / n)}</b></div>` : ''}
            ${investUpkeep(st, t) ? `<div class="row between"><span class="muted">Gestione investimenti</span><b class="bad">-${fmtM(investUpkeep(st, t) / n)}</b></div>` : ''}
            <div class="row between"><span class="muted">Operativi</span><b class="bad">-${fmtM((t.baseBudget * 0.1 + Object.values(t.facilities).reduce((a, b) => a + b, 0) * 0.4 * cat(st).budgetScale) / n)}</b></div>
            <div class="row between fin-total"><span>Saldo previsto</span><b class="${perEvent >= 0 ? 'good' : 'bad'}">${perEvent >= 0 ? '+' : ''}${fmtM(perEvent)}</b></div>
          </div>
        </div>
        <div class="panel" style="max-height:440px;overflow-y:auto"><div class="panel-head"><h3>Movimenti</h3></div>
          ${recent.length ? `<table class="tbl small"><tbody>${recent.map((f) => `<tr><td class="muted tiny">R${f.round + 1}</td><td>${esc(f.label)}</td><td class="right mono ${f.amount >= 0 ? 'good' : 'bad'}">${f.amount >= 0 ? '+' : ''}${fmtM(f.amount)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${icon('money')}<b>Nessun movimento</b><span>Le voci compariranno durante la stagione.</span></div>`}
        </div>
      </div>
    </div>`;
  },
  actions: {
    inv(el) {
      const st = S(); const k = el.dataset.k; const v = el.dataset.v;
      const go = () => { const r = startInvestment(st, k, v); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } sfx.ok(); App.toast(INVEST[k].short, r.msg, 'good'); App.refresh(); };
      if (INVEST[k].kind === 'build') App.confirm(`${esc(INVEST[k].name)}?`, `Costo ${fmtM(investCost(st, k))}, fuori dal budget cap. ${esc(INVEST[k].eff(investState(playerTeam(st))[k] + 1))}.`, go, 'Investi');
      else if (k === 'stake') App.confirm(`Comprare il 10% di ${esc(st.teams[v].name)}?`, `Costo ${fmtM(stakeCost(st, v))}. Dividendi ogni fine stagione in base al loro piazzamento; dal 20% i tuoi junior corrono con loro.`, go, 'Compra');
      else go();
    },
    'inv-sell'(el) { const st = S(); App.confirm(`Cedere le quote di ${esc(st.teams[el.dataset.v].name)}?`, 'Le quote vengono rivendute con uno sconto del 20%.', () => { const r = sellStake(st, el.dataset.v); App.toast('Quote cedute', r.msg, 'info'); App.refresh(); }, 'Cedi', true); },
    'inv-jr'() { const off = toggleJuniorRenewal(S()); App.toast('Programma junior', off ? 'Non verrà rinnovato a fine stagione.' : 'Si rinnoverà automaticamente.', 'info'); App.refresh(); },
    'drop-sp'(el) {
      const st = S(); const t = playerTeam(st);
      const sp = t.sponsors.find((x) => x.id === el.dataset.id); if (!sp) return;
      const pen = +(sp.perRace * 2).toFixed(2);
      App.confirm(`Rescindere con ${esc(sp.name)}?`, `Penale di uscita: ${fmtM(pen)}. Lo spazio sulla livrea si libererà subito.`, () => { t.sponsors = t.sponsors.filter((x) => x !== sp); addFinance(st, `Rescissione sponsor ${sp.name}`, -pen); App.refresh(); }, 'Rescindi', true);
    },
    sign(el) {
      const st = S(); const t = playerTeam(st);
      const o = st.sponsorOffers.find((x) => x.id === el.dataset.id);
      if (!o || t.sponsors.length >= 3) return;
      t.sponsors.push({ ...o, seasonsLeft: o.seasons });
      st.sponsorOffers = st.sponsorOffers.filter((x) => x.id !== o.id);
      addFinance(st, `Bonus firma ${o.name}`, o.signing);
      sfx.win(); App.toast('Sponsor firmato!', `${o.name} appare ora sulla livrea`, 'good'); App.refresh();
      signFx('Firmato', o.name, `Bonus firma +${fmtM(o.signing)} · ${fmtM(o.perRace)} a evento`);
    },
  },
});

function overallCarRankingPos(st, team) { return Object.values(st.teams).sort((a, b) => avgPartOf(b) - avgPartOf(a)).indexOf(team) + 1; }
function avgPartOf(t) { const v = Object.entries(t.car.parts).filter(([k]) => k !== 'reliability').map(([, x]) => x); return v.reduce((a, b) => a + b, 0) / v.length; }
function reservePanel(st, t) {
  ensureDepth(st);
  if (cat(st).type === 'rally') return '';
  const cur = currentReserve(st);
  const cands = reserveCandidates(st).filter((x) => x.d.id !== cur?.id).slice(0, 6);
  return `<div class="panel mt16 anim-in"><div class="panel-head"><h3>${icon('driver', 'ico', 'style="width:16px"')} Terzo pilota</h3><span class="small muted">Sostituisce un titolare infortunato o squalificato</span></div>
    <div class="row wrap gap8" style="align-items:stretch">
      <div class="card" style="min-width:230px;max-width:340px;border-color:color-mix(in srgb, var(--team) 50%, transparent)"><div class="tiny upper muted">In carica</div>${cur ? `<div class="row mt8">${ratingBox(ovr(st, cur))}<div><b>${esc(cur.name)}</b><div class="tiny muted">${cur.age} anni${cur.academy ? ' · Accademia' : ''}</div></div></div>` : '<div class="small muted mt8">Nessuno: in caso di emergenza l’ufficio contratti chiamerà il primo svincolato disponibile, e di rado è un fenomeno.</div>'}</div>
      ${cands.map((x) => `<div class="card" style="min-width:190px"><div class="row">${ratingBox(x.ov)}<div class="grow"><b class="small">${esc(x.d.name)}</b><div class="tiny muted">${x.d.age} anni · ${x.academy ? 'Accademia' : 'Svincolato'}</div></div></div><button class="btn sm mt8" style="width:100%" data-a="reserve" data-id="${x.d.id}" ${t.money < x.fee ? 'disabled' : ''}>Nomina${x.fee ? ` · ${fmtM(x.fee)}` : ' · gratis'}</button></div>`).join('')}
    </div>
    <div class="tiny muted mt8">Gli incidenti possono costare un infortunio (da 1 a 4 eventi). Un junior dell’accademia come terzo pilota non costa nulla e fa esperienza quando viene chiamato.</div></div>`;
}

function ownerFansPanel(st, t) {
  ensureDepth(st);
  const o = ownerInfo(st); const f = fansInfo(st); const pz = prizeTable(st);
  return `<div class="grid3 mt16 anim-in">
    <div class="panel"><div class="panel-head"><h3>La proprietà</h3><span class="chip">${esc(o.name)}</span></div><div class="small" style="font-style:italic;color:var(--text2)">${esc(o.motto)}</div><div class="tiny muted mt8">${esc(o.desc)}</div>
      <div class="card mt8" style="border-left:3px solid ${o.ok ? 'var(--good)' : 'var(--warn)'}"><div class="tiny upper muted">Obiettivo della proprietà ${st.season}</div><b class="small">${esc(o.goal)}</b><div class="tiny mt8 ${o.ok ? 'good' : 'warn'}">Ora: ${esc(o.now)} · ${o.ok ? 'in linea' : 'non ancora'}</div></div>
      <div class="tiny muted mt8">A fine stagione: centrato ${fmtM(o.reward)} e fiducia +6, mancato fiducia -5.${t.money > t.baseBudget * 1.05 ? ` <span class="warn">Cassa oltre il budget di una stagione (${fmtM(t.baseBudget)}): a fine anno la proprietà preleverà il 40% dell’eccedenza (${fmtM((t.money - t.baseBudget) * 0.4)}) come dividendo.</span>` : ' La cassa oltre il budget di una stagione viene in parte prelevata come dividendo.'}</div></div>
    <div class="panel"><div class="panel-head"><h3>Tifosi e merchandising</h3><span class="chip ${f.growth >= 0 ? 'good' : 'bad'}">${f.growth >= 0 ? '+' : ''}${f.growth.toFixed(1)}% nel ${st.season}</span></div>
      <div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:34px;line-height:1">${fmtFans(f.fans)}</div><div class="tiny muted">tifosi nel mondo</div>
      <div class="row between small mt16"><span class="muted">Merchandising per evento</span><b class="good">+${fmtM(f.perRace)}</b></div><div class="row between small mt8"><span class="muted">Proiezione stagione</span><b>+${fmtM(f.season)}</b></div>
      <div class="tiny muted mt8">Vittorie e podi fanno crescere la base (+1,6% e +0,8% a evento), i weekend senza punti la erodono. Campioni in squadra, Hospitality e Museo aiutano. Il prestigio della squadra fissa il tetto.</div></div>
    <div class="panel"><div class="panel-head"><h3>Montepremi costruttori</h3><span class="chip">${pz.mul === 1 ? 'Distribuzione standard' : pz.mul < 1 ? 'Più equo' : 'Più meritocratico'}</span></div>
      <div class="col">${pz.rows.map((r) => `<div class="row between small" style="padding:4px 0;border-bottom:1px solid var(--line)${r.me ? ';color:var(--team);font-weight:700' : ''}"><span>${r.pos}°${r.me ? ' · posizione attuale' : r.tgt ? ' · obiettivo' : ''}</span><b>${fmtM(r.prize)}</b></div>`).join('')}</div>
      <div class="tiny muted mt8">Pagato a fine stagione. La Commissione può votare una distribuzione più piatta o più ripida.</div></div>
  </div>`;
}

function driverStatusChips(st, d, t) {
  const chips = [];
  persona(d);
  chips.push(`<span class="chip info" title="Personalità del pilota">${esc(({ ambizioso: 'Ambizioso', mercenario: 'Mercenario', leale: 'Uomo-squadra', emergente: 'Giovane affamato' })[d.persona] || '')}</span>`);
  if (t.number1 === d.id) chips.push('<span class="chip good">Prima guida</span>');
  if (d.nextTeam && d.nextTeam !== t.id) chips.push(`<span class="chip bad">Partirà per ${esc(st.teams[d.nextTeam]?.short || '')} a fine anno</span>`);
  else if (d.rivalOffer) chips.push(`<span class="chip bad">Corteggiato da ${esc(st.teams[d.rivalOffer.teamId]?.short || '')}: ${fmtM(d.rivalOffer.salary)}/a</span>`);
  if (d.releaseAtEnd) chips.push('<span class="chip warn">Lascerà a fine stagione</span>');
  else if (d.contract === 1 && !d.nextTeam) chips.push('<span class="chip warn">In scadenza</span>');
  const lp = licencePoints(d);
  if (lp) chips.push(`<span class="chip ${lp >= 8 ? 'bad' : 'warn'}">Superlicenza ${lp}/${BAN_POINTS}</span>`);
  if (d.ban && !d.ban.injury && d.ban.season === st.season && d.ban.round >= st.round) chips.push('<span class="chip bad">Squalificato per il prossimo evento</span>');
  if (isInjured(st, d)) chips.push(`<span class="chip bad">${esc(injuryText(st, d))}</span>`);
  if (d.form != null) chips.push(`<span class="chip ${formClass(d.form)}" data-tip="La forma segue i risultati rispetto al valore della vettura: influenza il morale e quindi il passo"><span class="form-dot ${formClass(d.form)}"></span>${formLabel(d.form)}</span>`);
  if (d.backing > 0) chips.push(`<span class="chip good" data-tip="Sponsor personali: pagati a rate finché corre per noi">Porta ${fmtM(d.backing)}/anno</span>`);
  const incoming = Object.values(st.drivers).filter((x) => x.nextTeam === t.id);
  return `<div class="row wrap mt8 gap6">${chips.join('')}</div>${compEnabled(st) ? `<div class="tiny muted mt8">${esc(compSummaryText(st, d))}</div>` : ''}${incoming.length && d === teamDrivers(st, t)[0] ? `<div class="tiny good mt8">In arrivo dal ${st.season + 1}: ${incoming.map((x) => esc(x.name)).join(', ')}</div>` : ''}`;
}

function simCost(st) { return +(0.6 * ({ formula: 1, rally: 0.35, endurance: 0.55 }[st.category] || 1)).toFixed(2); }

// --------------- SPONSOR SATISFACTION ---------------
function sponsorExtra(st, s) {
  const sat = s.sat ?? 60;
  const g = st.dyn?.goals?.list?.find((x) => x.sp === s.id);
  return `<div class="row between tiny mt8"><span class="muted">Soddisfazione</span><b style="color:${sat >= 65 ? 'var(--good)' : sat >= 35 ? 'var(--warn)' : 'var(--bad)'}">${sat}%</b></div><div class="sat-bar"><i style="width:${sat}%;background:${sat >= 65 ? 'var(--good)' : sat >= 35 ? 'var(--warn)' : 'var(--bad)'}"></i></div>${g ? `<div class="tiny mt8" style="color:var(--text2)">${icon('target', 'ico', 'style="width:12px;vertical-align:-2px"')} ${esc(goalText(st, g))} · <b class="good">+${fmtM(g.reward)}</b></div>` : ''}${s.seasonsLeft === 1 ? `<div class="tiny mt8 ${sat >= 65 ? 'good' : 'warn'}">${sat >= 65 ? 'Pronto a rinnovare con aumento' : 'Rinnova solo se lo rendi felice (65%+)'}</div>` : ''}`;
}

// --------------- YOUTH ACADEMY ---------------
function academyPanel(st, t) {
  ensureDynasty(st);
  const juniors = academyDrivers(st);
  const slots = academySlots(t);
  const pros = st.dyn.prospects?.list || [];
  const potBar = (d) => { const p = scoutedPot(st, d); const o = ovr(st, d); return `<div class="row between tiny mt8"><span class="muted">OVR ${o} · Potenziale ${p.lo === p.hi ? p.lo : `${p.lo}–${p.hi}`}</span><span class="stars">${stars(Math.min(5, Math.max(1, (((p.lo + p.hi) / 2) - 60) / 8)))}</span></div><div class="pot-range"><i style="left:${p.lo - 40}%;width:${Math.max(2, p.hi - p.lo)}%"></i><b style="left:${o - 40}%"></b></div>`; };
  const feeder = (d) => (d.feeder || []).length ? `<div class="feeder">${d.feeder.slice(-5).map((f) => `<span class="${f.pos === 1 ? 'p1' : f.pos <= 3 ? 'pod' : ''}" data-tip="Serie minori ${f.season}">${f.season % 100}: ${f.pos}°</span>`).join('')}</div>` : '<div class="tiny muted mt8">Debutto nelle serie minori a fine stagione.</div>';
  return `<div class="panel mt16 anim-in"><div class="panel-head"><h3>${icon('star')} Accademia giovani</h3><div class="row gap6"><span class="chip">Posti ${juniors.length}/${slots}</span><span class="chip">Accademia Lv${t.facilities.academy}</span>${teamTrait(st, t, 'engineer', 'coach') ? '<span class="trait">Talent coach</span>' : ''}</div></div>
    <div class="small muted mb16">I junior corrono nelle serie minori e crescono ogni inverno (più in fretta con un’Accademia di livello alto). Quando sono pronti, promuovili in prima squadra: costano poco e sono fedelissimi.</div>
    ${juniors.length ? `<div class="acad-grid mb16">${juniors.map((d) => `<div class="acad-card"><div class="row" style="gap:12px">${helmet3D(d.helmet, 54)}<div class="grow" style="min-width:0"><div class="row gap6">${flagSVG(d.nat)}<span class="nm">${esc(d.name)}</span></div><div class="tiny muted">${d.age} anni · in accademia dal ${d.joinedAge ? st.season - (d.age - d.joinedAge) : st.season}</div>${onLoan(st, d) ? `<span class="chip tiny info">In prestito a ${esc(onLoan(st, d).name)}</span>` : ''}</div>${ratingBox(ovr(st, d), false)}</div>${potBar(d)}${feeder(d)}
      <div class="row gap6 mt16"><button class="btn sm team" data-a="acad-promote" data-id="${d.id}" ${d.loan ? 'disabled' : ''}>${icon('right')} Promuovi</button><button class="btn sm" data-a="acad-loan" data-id="${d.id}" ${loanTargets(st, d).length ? '' : 'disabled'} data-tip="Un anno da titolare in una squadra minore: cresce più in fretta e torna a fine stagione">${icon('swap')} Prestito</button><button class="btn sm ghost" data-a="acad-release" data-id="${d.id}" ${d.loan ? 'disabled' : ''}>${icon('x')} Libera</button></div></div>`).join('')}</div>` : ''}
    <div class="tiny upper muted mb8">Prospetti osservati dagli scout · stagione ${st.season}</div>
    ${pros.length ? `<div class="acad-grid">${pros.map((d) => `<div class="acad-card" style="opacity:${juniors.length >= slots ? 0.55 : 1}"><div class="row" style="gap:12px">${helmet3D(d.helmet, 44)}<div class="grow" style="min-width:0"><div class="row gap6">${flagSVG(d.nat)}<span class="nm" style="font-size:17px">${esc(d.name)}</span></div><div class="tiny muted">${d.age} anni · scuola kart</div></div></div>${potBar(d)}
      <div class="row between mt16"><span class="small">Borsa di studio <b>${fmtM(prospectFee(st, d))}</b></span><button class="btn sm ${juniors.length < slots ? 'primary' : ''}" data-a="acad-sign" data-id="${d.id}" ${juniors.length >= slots || t.money < prospectFee(st, d) ? 'disabled' : ''}>Ingaggia</button></div></div>`).join('')}</div>` : '<div class="small muted">Gli scout torneranno con nuovi nomi la prossima stagione.</div>'}
  </div>`;
}

function promoteModal(id) {
  const st = S(); const t = playerTeam(st); const d = st.drivers[id];
  const mine = teamDrivers(st, t);
  const free = seatsPerTeam(st) - mine.length;
  let repl = null;
  const render = () => `<div class="row" style="gap:16px">${helmet3D(d.helmet, 72)}<div><div class="tiny upper" style="color:var(--team)">Promozione dall’accademia</div><h2 style="margin:4px 0 0">${esc(d.name)}</h2><div class="small muted">${d.age} anni · OVR ${ovr(st, d)} · contratto triennale a ${fmtM(+(salaryFor(d, st.category) * 0.65).toFixed(2))}/anno</div></div></div>
    <p class="muted mt16">Un pilota cresciuto in casa parte motivatissimo e, se vincerà il titolo, entrerà nella leggenda della tua dinastia.</p>
    ${free > 0 ? '<div class="card good">C’è un sedile libero: debutterà al prossimo evento.</div>' : `<label class="lbl">Chi lascia il posto?</label><div class="row gap6 mt8 wrap">${mine.map((m) => `<button class="btn sm ${repl === m.id ? 'active' : ''}" data-a="repl" data-id="${m.id}">${esc(m.name)} · OVR ${ovr(st, m)}</button>`).join('')}</div><div class="tiny muted mt8">Il titolare liberato riceve una penale pari al 50% del contratto residuo.</div>`}
    <div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button><button class="btn primary" data-a="go" ${free <= 0 && !repl ? 'disabled' : ''}>Promuovi in prima squadra</button></div>`;
  const rr = () => { const m = document.querySelector('.modal'); if (m) m.innerHTML = render(); };
  App.modal(render(), {
    repl(el) { repl = el.dataset.id; rr(); },
    go() { const r = promoteJunior(st, d.id, repl); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } App.closeModal(); sfx.win(); App.toast(`${d.name} in prima squadra!`, 'Il vivaio dà i suoi frutti.', 'good'); App.refresh(); },
  });
}
