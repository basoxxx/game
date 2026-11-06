// Drivers, Market, Staff & Facilities, Finance & Sponsors
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, flagSVG, teamBadge } from '../ui/art.js';
import { esc, bar, stars } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { driverOverall, salaryFor, STAFF_ROLES, FACILITIES } from '../engine/world.js';
import { cat, playerTeam, teamDrivers, standings, fmtM, freeAgents, driverInterest, buyoutCost, signDriver, releaseDriver, hireStaff, facilityCost, startFacility, seatsPerTeam, addFinance } from '../engine/season.js';
import { driverChip, ovr, ratingBox, moraleChip, attrBars, ATTR_NAMES, teamStripe } from './common.js';
import { sfx } from '../ui/audio.js';
import { hasPerk } from '../engine/progress.js';

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
      return `<div class="panel">
        <div class="row" style="gap:18px;align-items:flex-start">${helmetSVG(d.helmet, 92)}
          <div class="grow"><div class="row">${flagSVG(d.nat, 26, 17)}<h2>${esc(d.name)}</h2></div>
            <div class="row wrap mt8 gap6"><span class="chip">#${d.number}</span><span class="chip">${d.age} anni</span>${C.driversPerCar > 1 ? `<span class="chip info">Auto ${Math.floor(i / C.driversPerCar) + 1}</span>` : ''}${moraleChip(d.morale)}</div>
            <div class="row wrap mt8 gap6 small"><span class="muted">Contratto:</span><b>${d.contract} ${d.contract === 1 ? 'stagione' : 'stagioni'}</b><span class="muted">· Stipendio:</span><b>${fmtM(d.salary)}/anno</b></div>
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
    </div>`;
  },
  actions: {
    train(el) {
      const st = S(); const t = playerTeam(st); const d = st.drivers[el.dataset.id]; const k = el.dataset.k;
      const cost = simCost(st);
      if (t.money < cost) return;
      addFinance(st, `Simulatore: ${d.name}`, -cost);
      const gain = Math.random() < 0.35 + t.facilities.simulator * 0.12 ? (Math.random() < 0.2 ? 2 : 1) : 0;
      d.attrs[k] = Math.min(99, d.attrs[k] + gain); d._trained = st.round + '-' + st.season;
      d.morale = Math.min(100, d.morale + 2);
      App.toast(gain ? `${d.name}: ${ATTR_NAMES[k]} +${gain}` : 'Sessione poco produttiva', gain ? 'Il lavoro al simulatore ha dato frutti.' : 'Nessun miglioramento questa volta.', gain ? 'good' : '');
      if (gain) sfx.ok(); App.refresh();
    },
    renew(el) { openContract(el.dataset.id, null, true); },
    release(el) {
      const st = S(); const d = st.drivers[el.dataset.id];
      App.confirm(`Liberare ${esc(d.name)}?`, `Pagherai una penale di ${fmtM(d.salary * d.contract * 0.5)} (50% del contratto residuo).`, () => { releaseDriver(st, d, true); App.refresh(); }, 'Libera', true);
    },
  },
});

export function openContract(driverId, replaceId = null, renew = false) {
  const st = S();
  const d = st.drivers[driverId];
  const t = playerTeam(st);
  const ask = driverInterest(st, d, t, 1, 1).ask;
  let salary = +(ask * 1.0).toFixed(2), years = 2;
  const seats = seatsPerTeam(st);
  const mine = teamDrivers(st, t);
  const needReplace = !renew && mine.length >= seats && !replaceId;
  const render = () => {
    const { score } = driverInterest(st, d, t, salary, years);
    const buy = renew ? 0 : buyoutCost(st, d);
    const verdict = score >= 1 ? ['good', 'Entusiasta'] : score >= 0.82 ? ['warn', 'Disponibile'] : ['bad', 'Non interessato'];
    return `<div class="row" style="gap:14px">${helmetSVG(d.helmet, 64)}<div class="grow"><div class="row">${flagSVG(d.nat)}<h2 style="margin:0">${esc(d.name)}</h2></div><div class="small muted">${d.age} anni · ${d.teamId ? esc(st.teams[d.teamId].name) : 'Svincolato'} · OVR ${ovr(st, d)}</div></div></div>
    <div class="col gap16 mt24">
      <div><div class="row between"><label class="lbl">Stipendio annuo</label><b>${fmtM(salary)}</b></div><input type="range" min="${(ask * 0.5).toFixed(2)}" max="${(ask * 2).toFixed(2)}" step="0.05" value="${salary}" data-input="sal" class="mt8"><div class="tiny muted mt8">Richiesta del pilota: circa ${fmtM(ask)}</div></div>
      <div><label class="lbl">Durata</label><div class="row gap6 mt8">${[1, 2, 3, 4].map((y) => `<button class="btn sm ${years === y ? 'active' : ''}" data-a="years" data-y="${y}">${y} ${y === 1 ? 'anno' : 'anni'}</button>`).join('')}</div></div>
      ${needReplace ? `<div><label class="lbl">Sostituisce</label><div class="row gap6 mt8 wrap">${mine.map((m) => `<button class="btn sm ${replaceId === m.id ? 'active' : ''}" data-a="repl" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div><div class="tiny muted mt8">Il pilota sostituito verrà liberato (penale 50% del residuo).</div></div>` : ''}
      <div class="card"><div class="row between"><span>Interesse</span><span class="chip ${verdict[0]}">${verdict[1]}</span></div>${bar(Math.min(100, score * 80), verdict[0] === 'good' ? 'green' : verdict[0] === 'warn' ? 'gold' : 'red')}
        <div class="row between small mt8"><span class="muted">Bonus firma (25%)</span><b>${fmtM(renew ? 0 : salary * 0.25)}</b></div>
        ${buy ? `<div class="row between small"><span class="muted">Clausola rescissoria</span><b>${fmtM(buy)}</b></div>` : ''}
      </div>
    </div>
    <div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button><button class="btn primary" data-a="sign" ${needReplace && !replaceId ? 'disabled' : ''}>${renew ? 'Rinnova' : 'Offri contratto'}</button></div>`;
  };
  const rerender = () => { const m = document.querySelector('.modal'); if (m) m.innerHTML = render(); };
  App.modal(render(), {
    sal(el) { salary = +(+el.value).toFixed(2); rerender(); },
    years(el) { years = +el.dataset.y; rerender(); },
    repl(el) { replaceId = el.dataset.id; rerender(); },
    sign() {
      if (renew) {
        const { score } = driverInterest(st, d, t, salary, years);
        if (score < 0.82) { App.toast('Rinnovo rifiutato', `${d.name} vuole di più.`, 'bad'); sfx.bad(); return; }
        d.salary = salary; d.contract = years; d.morale = Math.min(100, d.morale + 8);
        App.closeModal(); App.toast('Contratto rinnovato', `${d.name} fino al ${st.season + years}`, 'good'); sfx.ok(); App.refresh(); return;
      }
      const r = signDriver(st, d.id, salary, years, replaceId);
      if (!r.ok) { App.toast('Offerta respinta', r.msg, 'bad'); sfx.bad(); return; }
      App.closeModal(); App.toast('Firmato!', `${d.name} è un nuovo pilota di ${t.name}`, 'good'); sfx.win(); App.refresh();
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
    let list = Object.values(st.drivers).filter((d) => !d.retired && d.teamId !== t.id);
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
      ${list.slice(0, 80).map((d) => { const tm = d.teamId ? st.teams[d.teamId] : null; const p = showPot(d); return `<tr><td>${driverChip(st, d, { size: 24 })}</td><td class="small">${tm ? `<div class="row">${teamStripe(tm)}${esc(tm.short)} <span class="muted">(${d.contract}a)</span></div>` : '<span class="chip good">Libero</span>'}</td><td class="right mono">${d.age}</td>${Object.keys(ATTR_NAMES).map((k) => `<td class="right mono ${d.attrs[k] >= 88 ? 'good' : d.attrs[k] < 70 ? 'dim' : ''}">${d.attrs[k]}</td>`).join('')}<td class="right mono">${p == null ? '<span class="dim" title="Migliora l’Accademia per vedere il potenziale">?</span>' : p}</td><td class="right">${ratingBox(ovr(st, d))}</td><td class="right mono small">${fmtM(d.salary)}</td><td class="right"><button class="btn sm ${tm ? '' : 'primary'}" data-a="offer" data-id="${d.id}">Offerta</button></td></tr>`; }).join('')}
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
    const pool = (role) => Object.values(st.staff).filter((s) => s.role === role && s.id !== t.staff[role]).sort((a, b) => b.rating - a.rating).slice(0, 6);
    return `<div class="screen-title"><div><div class="sub">${esc(t.name)} · ${esc(t.hq)}</div><h1>Staff & Strutture</h1></div></div>
    <div class="panel anim-in"><div class="panel-head"><h3>Strutture</h3>${t.facilityBuild ? `<span class="chip warn">Cantiere: ${FACILITIES[t.facilityBuild.key].name} (${t.facilityBuild.racesLeft} eventi)</span>` : '<span class="chip">Un cantiere alla volta</span>'}</div>
      <div class="grid3" style="grid-template-columns:repeat(5,1fr)">${Object.entries(FACILITIES).map(([k, f]) => {
        const lvl = t.facilities[k]; const cost = facilityCost(st, k, lvl + 1); const building = t.facilityBuild?.key === k;
        return `<div class="card"><div class="row between">${icon(f.icon === 'star' ? 'star' : f.icon === 'wrench' ? 'wrench' : f.icon === 'sim' ? 'sim' : f.icon === 'wind' ? 'wind' : 'factory', 'ico', 'style="width:26px;height:26px;color:var(--team)"')}<span class="chip">Lv ${lvl}/5</span></div><div style="font-weight:800;margin-top:10px">${f.name}</div><div class="tiny muted mt8" style="min-height:32px">${f.desc}</div>
          <div class="row gap4 mt8">${[1, 2, 3, 4, 5].map((i) => `<div style="flex:1;height:6px;border-radius:3px;background:${i <= lvl ? 'var(--team)' : building && i === lvl + 1 ? 'var(--warn)' : 'rgba(255,255,255,0.1)'}"></div>`).join('')}</div>
          ${lvl < 5 ? `<button class="btn sm mt16" style="width:100%" data-a="upgrade" data-k="${k}" ${t.facilityBuild || t.money < cost ? 'disabled' : ''}>${building ? 'In costruzione…' : `Potenzia ${fmtM(cost)}`}</button>` : '<div class="chip good mt16">Massimo</div>'}</div>`;
      }).join('')}</div>
    </div>
    <div class="grid3 mt16 anim-in">${Object.entries(STAFF_ROLES).map(([role, R]) => {
      const cur = st.staff[t.staff[role]];
      return `<div class="panel"><div class="panel-head"><h3>${R.name}</h3></div><div class="small muted mb16">${R.desc}</div>
        <div class="card row" style="border-color:color-mix(in srgb, var(--team) 50%, transparent)">${ratingBox(cur?.rating || 0, false)}<div class="grow"><b>${esc(cur?.name || 'Vacante')}</b><div class="tiny muted">${cur ? `${cur.age} anni · ${fmtM(cur.salary)}/anno` : ''}</div></div></div>
        <div class="tiny upper muted mt16 mb8">Disponibili</div>
        <div class="col gap6">${pool(role).map((s) => { const other = s.teamId ? st.teams[s.teamId] : null; return `<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)">${ratingBox(s.rating)}<div class="grow"><div>${esc(s.name)}</div><div class="tiny muted">${other ? esc(other.short) + ' · liberatoria ' + fmtM(s.salary * 1.2) : 'Libero'} · ${fmtM(s.salary)}/a</div></div><button class="btn sm" data-a="hire" data-id="${s.id}">Ingaggia</button></div>`; }).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  },
  actions: {
    upgrade(el) { const r = startFacility(S(), el.dataset.k); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } sfx.ok(); App.toast('Cantiere aperto', FACILITIES[el.dataset.k].name, 'good'); App.refresh(); },
    hire(el) {
      const st = S(); const s = st.staff[el.dataset.id];
      App.confirm(`Ingaggiare ${esc(s.name)}?`, `Costo d’ingaggio ${fmtM(s.salary * 0.5)}${s.teamId ? ` + liberatoria ${fmtM(s.salary * 1.2)}` : ''}. Stipendio ${fmtM(s.salary)}/anno.`, () => { const r = hireStaff(st, s.id); if (!r.ok) App.toast('Impossibile', r.msg, 'bad'); else { sfx.ok(); App.toast('Ingaggiato!', s.name, 'good'); } App.refresh(); });
    },
  },
});

// --------------- FINANCE & SPONSORS ---------------
registerScreen({
  id: 'finance',
  render() {
    const st = S();
    const t = playerTeam(st);
    const n = st.calendar.length;
    const sponsorIncome = t.sponsors.reduce((s, x) => s + x.perRace, 0);
    const salaries = teamDrivers(st, t).reduce((s, d) => s + d.salary, 0) + Object.values(t.staff).reduce((s, id) => s + (st.staff[id]?.salary || 0), 0);
    const recent = st.finance.filter((f) => f.season === st.season).slice(-40).reverse();
    const inc = st.finance.filter((f) => f.season === st.season && f.amount > 0).reduce((a, b) => a + b.amount, 0);
    const exp = st.finance.filter((f) => f.season === st.season && f.amount < 0).reduce((a, b) => a + b.amount, 0);
    const objNames = { points: 'Punti', podium: 'Podio', win: 'Vittoria', finish: 'Doppio arrivo', beat: 'Batti il rivale' };
    return `<div class="screen-title"><div><div class="sub">Stagione ${st.season}</div><h1>Sponsor & Finanze</h1></div></div>
    <div class="grid4 anim-in">
      <div class="panel"><div class="kpi"><b class="${t.money < 0 ? 'bad' : ''}">${fmtM(t.money)}</b><span>Liquidità</span></div></div>
      <div class="panel"><div class="kpi"><b class="good">+${fmtM(inc)}</b><span>Entrate stagione</span></div></div>
      <div class="panel"><div class="kpi"><b class="bad">${fmtM(exp)}</b><span>Uscite stagione</span></div></div>
      <div class="panel"><div class="kpi"><b>${fmtM(sponsorIncome)}</b><span>Sponsor per evento</span></div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px" class="mt16">
      <div class="col gap16">
        <div class="panel"><div class="panel-head"><h3>Sponsor attivi (${t.sponsors.length}/3)</h3></div>
          ${t.sponsors.length ? `<div class="grid3">${t.sponsors.map((s) => `<div class="card"><div class="tiny upper muted">${s.tier === 3 ? 'Title sponsor' : s.tier === 2 ? 'Partner' : 'Fornitore'}</div><div style="font-family:var(--display);font-weight:800;font-size:18px">${esc(s.name)}</div><div class="small mt8">${fmtM(s.perRace)}/evento</div><div class="tiny muted">Bonus ${objNames[s.objective]}: ${fmtM(s.bonus)}</div><div class="tiny muted">${s.seasonsLeft} ${s.seasonsLeft === 1 ? 'stagione' : 'stagioni'} rimanenti</div></div>`).join('')}</div>` : '<div class="muted small">Nessuno sponsor attivo. Firmane uno dalle offerte!</div>'}
        </div>
        <div class="panel"><div class="panel-head"><h3>Offerte di sponsorizzazione</h3></div>
          ${st.sponsorOffers.length ? `<div class="col gap6">${st.sponsorOffers.map((o) => `<div class="card row" style="gap:14px"><div class="grow"><div class="row"><b style="font-family:var(--display);font-size:17px">${esc(o.name)}</b><span class="stars small">${'★'.repeat(o.tier)}</span></div><div class="small muted">${o.objText}: +${fmtM(o.bonus)} · ${o.seasons} ${o.seasons === 1 ? 'stagione' : 'stagioni'}</div></div><div class="right"><div><b>${fmtM(o.perRace)}</b><span class="tiny muted">/evento</span></div><div class="tiny good">Firma: +${fmtM(o.signing)}</div></div><button class="btn sm primary" data-a="sign" data-id="${o.id}" ${t.sponsors.length >= 3 ? 'disabled' : ''}>Firma</button></div>`).join('')}</div>` : '<div class="muted small">Nessuna offerta al momento. Arriveranno con i risultati!</div>'}
          ${t.sponsors.length >= 3 ? '<div class="small warn mt8">Tutti gli spazi sono occupati. Rescindi un contratto per firmarne un altro.</div>' : ''}
        </div>
      </div>
      <div class="col gap16">
        <div class="panel"><div class="panel-head"><h3>Previsione per evento</h3></div>
          <div class="col gap6 small">
            <div class="row between"><span class="muted">Diritti commerciali</span><b class="good">+${fmtM(t.baseBudget * 0.55 / n * (0.7 + t.rep / 300))}</b></div>
            <div class="row between"><span class="muted">Sponsor (base)</span><b class="good">+${fmtM(sponsorIncome)}</b></div>
            <div class="row between"><span class="muted">Stipendi</span><b class="bad">-${fmtM(salaries / n)}</b></div>
            <div class="row between"><span class="muted">Operativi</span><b class="bad">-${fmtM((t.baseBudget * 0.1 + Object.values(t.facilities).reduce((a, b) => a + b, 0) * 0.4 * cat(st).budgetScale) / n)}</b></div>
          </div>
        </div>
        <div class="panel" style="max-height:520px;overflow-y:auto"><div class="panel-head"><h3>Movimenti</h3></div>
          <table class="tbl small"><tbody>${recent.map((f) => `<tr><td class="muted tiny">R${f.round + 1}</td><td>${esc(f.label)}</td><td class="right mono ${f.amount >= 0 ? 'good' : 'bad'}">${f.amount >= 0 ? '+' : ''}${fmtM(f.amount)}</td></tr>`).join('') || '<tr><td class="muted">Nessun movimento</td></tr>'}</tbody></table>
        </div>
      </div>
    </div>`;
  },
  actions: {
    sign(el) {
      const st = S(); const t = playerTeam(st);
      const o = st.sponsorOffers.find((x) => x.id === el.dataset.id);
      if (!o || t.sponsors.length >= 3) return;
      t.sponsors.push({ ...o, seasonsLeft: o.seasons });
      st.sponsorOffers = st.sponsorOffers.filter((x) => x.id !== o.id);
      addFinance(st, `Bonus firma ${o.name}`, o.signing);
      sfx.win(); App.toast('Sponsor firmato!', `${o.name} appare ora sulla livrea`, 'good'); App.refresh();
    },
  },
});

function simCost(st) { return +(0.6 * ({ formula: 1, rally: 0.35, endurance: 0.55 }[st.category] || 1)).toFixed(2); }
