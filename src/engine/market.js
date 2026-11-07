// Driver market: personalities and agents, contract demands and negotiation, rival offers for
// expiring contracts, pre-contracts, aging curves and the AI "silly season" between seasons.
import { rand, randInt, pick, clamp, chance } from './rng.js';
import { driverOverall, salaryFor, generateRookie, generateVeteranFreeAgent } from './world.js';
import { hasPerk } from './progress.js';

// Late-bound helpers from season.js (avoids an import cycle)
let H = null;
export function bindMarket(helpers) { H = helpers; }

export const PERSONAS = {
  ambizioso: { name: 'Ambizioso', desc: 'Vuole una macchina da vittoria: la competitività conta più dei soldi.', money: 0.35, car: 0.55, loyal: 0.04, no1: 0.12 },
  mercenario: { name: 'Mercenario', desc: 'Segue l’offerta più ricca. La fedeltà ha un prezzo.', money: 0.8, car: 0.15, loyal: 0.0, no1: 0.04 },
  leale: { name: 'Uomo-squadra', desc: 'Legato alla squadra: rinnova volentieri se si sente apprezzato.', money: 0.5, car: 0.25, loyal: 0.2, no1: 0.04 },
  emergente: { name: 'Giovane affamato', desc: 'Vuole un sedile e spazio per crescere; diffida dei contratti lunghi.', money: 0.42, car: 0.3, loyal: 0.04, no1: 0.1 },
};
const AGENTS = ['Rossi Management', 'Apex Talent', 'Velocity Sports', 'Grid Partners', 'Paddock Agency', 'Monza Group', 'Lionheart Mgmt', 'Nordic Racing Mgmt'];

export function persona(d) {
  if (!d.persona || !PERSONAS[d.persona]) {
    const ov = driverOverall(d, 'formula');
    d.persona = d.age <= 22 && chance(0.55) ? 'emergente' : ov >= 86 && chance(0.55) ? 'ambizioso' : pick(['ambizioso', 'mercenario', 'leale', 'leale', 'mercenario', 'emergente']);
  }
  d.agent ??= pick(AGENTS);
  return PERSONAS[d.persona];
}

function carScore(state, team) {
  const ranking = Object.values(state.teams).sort((a, b) => H.avgPart(b) - H.avgPart(a)).map((t) => t.id);
  return 1 - ranking.indexOf(team.id) / Math.max(1, ranking.length);
}
function teammateOf(state, d, team) {
  return team.drivers.map((id) => state.drivers[id]).filter((x) => x && x.id !== d.id);
}

// What the driver (through the agent) asks for
export function driverDemands(state, d, team) {
  const P = persona(d);
  const C = state.category;
  const ov = driverOverall(d, C);
  const form = clamp((d.morale - 60) / 400, -0.06, 0.08);
  let ask = salaryFor(d, C) * (d.teamId && d.teamId !== team.id ? 1.15 : 1) * (1 + form) * (P === PERSONAS.mercenario ? 1.12 : 1) * (hasPerk(state, 'negotiator') ? 0.9 : 1);
  const mates = teammateOf(state, d, team);
  const bestMate = Math.max(0, ...mates.map((m) => driverOverall(m, C)));
  const wantsNo1 = (P === PERSONAS.ambizioso || ov >= 88) && ov >= bestMate - 1 && ov >= 80;
  const prefYears = d.age >= 32 ? 3 : P === PERSONAS.emergente && d.pot > ov + 6 ? 1 : P === PERSONAS.ambizioso && carScore(state, team) < 0.5 ? 1 : 2;
  const notes = [];
  if (wantsNo1) notes.push('Pretende lo status di prima guida');
  if (prefYears === 1) notes.push('Preferisce un contratto breve');
  if (prefYears === 3) notes.push('Cerca stabilità: contratto lungo gradito');
  if (P === PERSONAS.ambizioso && carScore(state, team) < 0.45) notes.push('Dubita della competitività della vettura');
  if (d.teamId === team.id && d.morale < 40) notes.push('Il rapporto con la squadra è logoro');
  return { ask: +ask.toFixed(2), persona: P, personaId: d.persona, agent: d.agent, wantsNo1, prefYears, notes, rival: d.rivalOffer && d.rivalOffer.teamId !== team.id ? d.rivalOffer : null };
}

// Score of an offer from the driver's point of view (>= threshold → accepted)
export function offerScore(state, d, team, salary, years, opts = {}) {
  const dem = driverDemands(state, d, team);
  const P = dem.persona;
  const ov = driverOverall(d, state.category);
  const ambition = clamp((ov - 70) / 30, 0, 1);
  const cs = carScore(state, team);
  const ratio = salary / dem.ask;
  // money above the ask has diminishing returns (mercenaries feel it more)
  let score = (ratio <= 1 ? ratio : 1 + (ratio - 1) * (0.4 + P.money * 0.5)) * (0.4 + P.money * 0.3);
  score += cs * (0.15 + ambition * 0.25 + P.car * 0.3);
  if (P === PERSONAS.ambizioso && cs < 0.5 && ov >= 82) score -= (0.5 - cs) * 0.4;
  score += (team.rep / 100) * 0.22;
  if (d.teamId === team.id) score += 0.1 + P.loyal + clamp((d.morale - 60) / 300, -0.15, 0.1);
  if (d.age < 23) score += 0.06;
  score -= Math.abs(years - dem.prefYears) * 0.035;
  if (opts.no1) score += P.no1 + 0.04; else if (dem.wantsNo1) score -= 0.08;
  if (team.number1 && team.number1 !== d.id && state.drivers[team.number1]?.teamId === team.id) score -= 0.06;
  return score;
}

export function acceptThreshold(state, d, team) {
  let th = 0.82;
  const r = d.rivalOffer;
  if (r && r.teamId !== team.id && state.teams[r.teamId]) th = Math.max(th, offerScore(state, d, state.teams[r.teamId], r.salary, r.years) + 0.03);
  return +th.toFixed(3);
}

export function patience(state, d) {
  const key = `${state.season}-${state.round}`;
  if (!d.talks || d.talks.k !== key) d.talks = { k: key, left: d.persona === 'leale' ? 4 : d.persona === 'mercenario' ? 2 : 3 };
  return d.talks.left;
}

// Full evaluation used by the contract screen
export function evaluateOffer(state, d, team, salary, years, opts = {}) {
  const dem = driverDemands(state, d, team);
  const score = offerScore(state, d, team, salary, years, opts);
  const th = acceptThreshold(state, d, team);
  // salary needed to reach the threshold (inverse of the diminishing money curve)
  let needSalary = salary;
  if (score < th) { let lo = salary, hi = dem.ask * 4; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (offerScore(state, d, team, mid, years, opts) >= th) hi = mid; else lo = mid; } needSalary = hi; }
  return { score, threshold: th, ok: score >= th, ask: dem.ask, needSalary: +needSalary.toFixed(2), demands: dem, patience: patience(state, d), blocked: patience(state, d) <= 0 };
}

export function agentReply(state, d, ev, salary) {
  const first = d.name.split(' ')[0];
  if (ev.blocked) return `${d.agent}: «Abbiamo già perso abbastanza tempo. Ne riparliamo dopo il prossimo evento.»`;
  if (ev.ok) return `${d.agent}: «${first} è pronto a firmare.»`;
  if (ev.needSalary > ev.ask * 2.1) return `${d.agent}: «Non è una questione di soldi: ${first} vuole un progetto vincente${ev.demands.wantsNo1 ? ' e lo status di prima guida' : ''}.»`;
  if (ev.demands.rival) return `${d.agent}: «${state.teams[ev.demands.rival.teamId]?.name} offre ${H.fmtM(ev.demands.rival.salary)} a stagione. Per restare servono almeno ${H.fmtM(ev.needSalary)}.»`;
  return `${d.agent}: «Per meno di ${H.fmtM(ev.needSalary)} a stagione non firmiamo.»`;
}

// Pre-contract: a driver whose contract expires at the end of this season can be signed for next year
export function canPrecontract(state, d) {
  const n = state.calendar.length;
  return !!(d.teamId && d.teamId !== state.playerTeam && d.contract === 1 && !d.nextTeam && state.round >= Math.floor(n * 0.5) && state.round < n);
}

// Seats the player has already filled for next season
export function nextSeasonRoster(state) {
  const pt = state.teams[state.playerTeam];
  const staying = pt.drivers.map((id) => state.drivers[id]).filter((d) => d && d.contract > 1 && !d.nextTeam && !d.releaseAtEnd);
  const incoming = Object.values(state.drivers).filter((d) => d.nextTeam === pt.id);
  return { staying, incoming, free: H.seatsPerTeam(state) - staying.length - incoming.length };
}

// Single entry point for the contract screen: renew / sign now / pre-contract
export function negotiate(state, driverId, { salary, years, no1 = false, replaceId = null, mode = 'sign' }) {
  const d = state.drivers[driverId];
  const t = state.teams[state.playerTeam];
  if (!d) return { ok: false, msg: 'Pilota non trovato.' };
  if (mode === 'renew' && d.nextTeam && d.nextTeam !== t.id) return { ok: false, msg: `${d.name} ha già firmato con ${state.teams[d.nextTeam]?.name} per la prossima stagione.` };
  const ev = evaluateOffer(state, d, t, salary, years, { no1 });
  if (ev.blocked) return { ok: false, msg: agentReply(state, d, ev, salary), ev };
  if (!ev.ok) {
    d.talks.left--;
    const msg = agentReply(state, d, ev, salary);
    if (d.talks.left <= 0) return { ok: false, msg: `${msg} L’agente ha interrotto le trattative fino al prossimo evento.`, ev, counter: ev.needSalary };
    return { ok: false, msg, ev, counter: ev.needSalary };
  }
  const setNo1 = () => { if (no1) { t.number1 = d.id; for (const m of teammateOf(state, d, t)) m.morale = clamp(m.morale - 8, 10, 100); } };
  if (mode === 'renew') {
    d.salary = +salary.toFixed(2); d.contract = years; d.morale = clamp(d.morale + 8, 10, 100); d.rivalOffer = null; d.releaseAtEnd = false;
    setNo1();
    H.addNews(state, `${d.name} rinnova con ${t.name} fino al ${state.season + years - 1}.`);
    return { ok: true, msg: `${d.name} resta con noi fino al ${state.season + years - 1}.` };
  }
  if (mode === 'pre') {
    if (!canPrecontract(state, d)) return { ok: false, msg: 'Precontratto non disponibile per questo pilota.' };
    const ros = nextSeasonRoster(state);
    if (ros.free <= 0 && !replaceId) return { ok: false, msg: 'Nessun sedile libero per la prossima stagione: indica chi sostituirà.' };
    const signing = +(salary * 0.25).toFixed(2);
    if (t.money < signing) return { ok: false, msg: 'Fondi insufficienti per il bonus firma.' };
    H.addFinance(state, `Bonus firma (precontratto) ${d.name}`, -signing);
    if (ros.free <= 0 && replaceId) { const r = state.drivers[replaceId]; if (r) r.releaseAtEnd = true; }
    d.nextTeam = t.id; d.nextSalary = +salary.toFixed(2); d.nextYears = years; d.nextNo1 = no1; d.rivalOffer = null;
    H.addNews(state, `Colpo di mercato: ${d.name} lascerà ${state.teams[d.teamId]?.name} e correrà con ${t.name} dal ${state.season + 1}!`);
    H.unlock(state, 'signing', 'Colpo di mercato', 'Ingaggia un nuovo pilota.');
    return { ok: true, msg: `${d.name} correrà per noi dal ${state.season + 1}.` };
  }
  const r = H.signDriver(state, d.id, salary, years, replaceId, true);
  if (r.ok) setNo1();
  return r;
}

// ---------- in-season market activity (called after every round) ----------
export function marketTick(state) {
  if (state.quick) return;
  const n = state.calendar.length;
  const r = state.round; // already incremented: number of rounds completed
  const pt = state.teams[state.playerTeam];
  const C = state.category;
  const mine = pt.drivers.map((id) => state.drivers[id]).filter(Boolean);
  // contract reminder
  if (r === Math.floor(n * 0.45)) {
    const exp = mine.filter((d) => d.contract === 1);
    if (exp.length) H.addMail(state, { from: 'Ufficio Contratti', icon: 'driver', type: 'info', subject: 'Contratti in scadenza', body: `${exp.map((d) => d.name).join(' e ')} ${exp.length > 1 ? 'sono' : 'è'} in scadenza a fine stagione. Da metà campionato le altre squadre possono presentare offerte: rinnova in tempo dalla schermata Piloti, oppure firma un precontratto con un pilota di un altro team dal Mercato.` });
  }
  // rival offers for the player's expiring drivers
  if (r >= Math.floor(n * 0.5) && r <= n - 2) {
    for (const d of mine) {
      if (d.contract !== 1 || d.nextTeam || d.rivalOffer || d._offerSeason === state.season) continue;
      persona(d);
      const ov = driverOverall(d, C);
      if (!chance(clamp(0.18 + (ov - 74) / 45, 0.08, 0.6))) continue;
      const suitors = Object.values(state.teams).filter((t) => !t.isPlayer && t.id !== d.teamId && t.drivers.some((id) => { const x = state.drivers[id]; return x && x.contract === 1 && driverOverall(x, C) < ov; }));
      if (!suitors.length) continue;
      const suitor = suitors.sort((a, b) => b.rep - a.rep + rand(-12, 12))[0];
      const offer = { teamId: suitor.id, salary: +(salaryFor(d, C) * rand(1.08, 1.45) * clamp(suitor.baseBudget / pt.baseBudget, 0.85, 1.25)).toFixed(2), years: randInt(2, 3), deadline: r + 2 };
      d.rivalOffer = offer; d._offerSeason = state.season;
      H.addMail(state, { from: d.agent || 'Agente del pilota', icon: 'driver', type: 'bad', subject: `${suitor.name} vuole ${d.name}`, body: `${suitor.name} ha offerto a ${d.name} ${H.fmtM(offer.salary)} a stagione per ${offer.years} anni a partire dal ${state.season + 1}. Il pilota deciderà entro ${offer.deadline - r === 1 ? 'il prossimo evento' : `${offer.deadline - r} eventi`}. Se vuoi trattenerlo, presenta un rinnovo competitivo dalla schermata Piloti.` });
    }
  }
  // deadlines
  for (const d of mine) {
    const o = d.rivalOffer;
    if (!o || r < o.deadline) continue;
    const rival = state.teams[o.teamId];
    d.rivalOffer = null;
    if (d.contract > 1 || !rival) continue;
    const stay = offerScore(state, d, pt, d.salary, 2);
    const go = offerScore(state, d, rival, o.salary, o.years);
    if (go > stay - 0.02 || chance(0.25)) {
      d.nextTeam = rival.id; d.nextSalary = o.salary; d.nextYears = o.years;
      H.addMail(state, { from: 'Ufficio Contratti', icon: 'driver', type: 'bad', subject: `${d.name} ci lascerà`, body: `${d.name} ha firmato un precontratto con ${rival.name}: a fine stagione lascerà la squadra. Cerca un sostituto sul Mercato (puoi firmare precontratti con i piloti in scadenza degli altri team).` });
      H.addNews(state, `Mercato: ${d.name} passerà a ${rival.name} dal ${state.season + 1}.`);
      d.morale = clamp(d.morale - 3, 10, 100);
    } else H.addMail(state, { from: d.agent || 'Agente del pilota', icon: 'driver', type: 'good', subject: `${d.name} rifiuta ${rival.name}`, body: `${d.name} ha respinto l’offerta di ${rival.name}: vuole prima ascoltare la nostra proposta. Non aspettare troppo.` });
  }
  // headline AI pre-contracts (silly season)
  if (r === Math.floor(n * 0.7)) aiPrecontracts(state);
}

function aiPrecontracts(state) {
  const C = state.category;
  const ov = (d) => driverOverall(d, C);
  const stars = Object.values(state.drivers).filter((d) => d.teamId && !state.teams[d.teamId]?.isPlayer && d.contract === 1 && !d.nextTeam && ov(d) >= 80).sort((a, b) => ov(b) - ov(a)).slice(0, 3);
  for (const d of stars) {
    if (!chance(0.55)) continue;
    const cur = state.teams[d.teamId];
    const cands = Object.values(state.teams).filter((t) => !t.isPlayer && t.id !== cur.id && t.drivers.some((id) => { const x = state.drivers[id]; return x && x.contract === 1 && !x.nextTeam && ov(x) < ov(d) - 2; }) && !Object.values(state.drivers).some((x) => x.nextTeam === t.id));
    if (!cands.length) continue;
    const t = cands.sort((a, b) => carScore(state, b) - carScore(state, a) + rand(-0.2, 0.2))[0];
    if (offerScore(state, d, t, salaryFor(d, C) * 1.1, 2) < offerScore(state, d, cur, d.salary, 2) - 0.05) continue;
    d.nextTeam = t.id; d.nextSalary = +(salaryFor(d, C) * rand(1.05, 1.3)).toFixed(2); d.nextYears = randInt(2, 3);
    H.addNews(state, `Silly season: ${d.name} firma con ${t.name} per il ${state.season + 1}, lascerà ${cur.name}.`);
  }
}

// ---------- aging curve & development (season change) ----------
export function developDriver(state, d) {
  const catId = state.category;
  const a = d.attrs;
  const ov = driverOverall(d, catId);
  const team = d.teamId ? state.teams[d.teamId] : null;
  const academy = team ? (team.facilities.academy - 3) * 0.3 : 0;
  const sim = team ? (team.facilities.simulator - 3) * 0.2 : 0;
  const starts = d.stats.starts - (d._s0 ?? d.stats.starts - (team ? 10 : 0));
  const seat = starts >= 6 ? 1 : team ? 0.8 : 0.55;
  const mood = d.morale > 80 ? 0.25 : d.morale < 35 ? -0.35 : 0;
  const age = d.age;
  const cl = (k, v) => { a[k] = clamp(Math.round(v), 30, 99); };
  let note = null;
  if (age <= 28 && d.pot > ov) {
    const f = age <= 21 ? 0.36 : age <= 24 ? 0.3 : age <= 26 ? 0.2 : 0.1;
    const g = (d.pot - ov) * f * rand(0.55, 1.45) * seat + academy + sim + mood;
    for (const k of Object.keys(a)) if (k !== 'exp') cl(k, a[k] + g * rand(0.6, 1.3));
    cl('exp', a.exp + randInt(5, 12) + (starts > 10 ? 2 : 0));
    if (age >= 20 && age <= 26 && chance(0.05)) { d.pot = clamp(d.pot + randInt(3, 8), 0, 99); note = 'breakout'; }
    else if (chance(0.04)) { d.pot = Math.max(driverOverall(d, catId), d.pot - randInt(3, 6)); note = 'stall'; }
  } else if (age >= 32) {
    const dec = 0.3 * (age - 31) ** 1.3 * rand(0.5, 1.5);
    cl('pace', a.pace - dec);
    cl('wet', a.wet - dec * 0.6);
    if (age >= 34) cl('race', a.race - dec * 0.4);
    cl('cons', age <= 35 ? a.cons + rand(-0.3, 1.2) : a.cons - dec * 0.3);
    cl('tyre', a.tyre + rand(-0.2, 0.9));
    cl('exp', a.exp + randInt(1, 4));
  } else {
    cl('exp', a.exp + randInt(3, 8));
    for (const k of ['pace', 'cons', 'race', 'tyre']) cl(k, a[k] + rand(-1, 1.4) + mood * 0.5);
  }
  if (age >= 28) d.pot = Math.max(driverOverall(d, catId), d.pot - (age >= 32 ? 2 : 1));
  d.pot = Math.max(d.pot, a.pace);
  d._s0 = d.stats.starts;
  return note;
}

// ---------- between seasons: contracts, transfers and AI signings ----------
export function seasonMarket(state) {
  const C = state.category;
  const seats = H.seatsPerTeam(state);
  const pt = state.teams[state.playerTeam];
  const ov = (d) => driverOverall(d, C);
  const arrivals = [];
  // 1) contracts tick down
  for (const d of Object.values(state.drivers)) if (d.teamId && !d.retired) d.contract--;
  // 2) pre-contract transfers
  for (const d of Object.values(state.drivers)) {
    if (!d.nextTeam || d.retired) { d.nextTeam = null; continue; }
    const to = state.teams[d.nextTeam];
    if (!to) { d.nextTeam = null; continue; }
    const from = d.teamId ? state.teams[d.teamId] : null;
    if (from) { from.drivers = from.drivers.filter((x) => x !== d.id); if (from.number1 === d.id) from.number1 = null; }
    d.teamId = to.id; d.contract = d.nextYears || 2; d.salary = d.nextSalary || salaryFor(d, C); d.morale = 75;
    if (d.nextNo1) to.number1 = d.id;
    to.drivers.push(d.id); arrivals.push(d);
    if (to.isPlayer) { d.joinedTeam = to.id; d.joinedAge = d.age; }
    if (to.isPlayer) H.addMail(state, { from: 'Ufficio Contratti', icon: 'driver', type: 'good', subject: `Benvenuto ${d.name}`, body: `${d.name} è ufficialmente un nostro pilota: contratto di ${d.contract} ${d.contract === 1 ? 'stagione' : 'stagioni'} a ${H.fmtM(d.salary)}/anno.` });
    d.nextTeam = null; d.nextSalary = null; d.nextYears = null; d.nextNo1 = null; d.rivalOffer = null;
  }
  // 3) player's scheduled releases
  for (const id of pt.drivers.slice()) {
    const d = state.drivers[id];
    if (d?.releaseAtEnd) { d.releaseAtEnd = false; H.releaseDriver(state, d, d.contract > 0); H.addMail(state, { from: 'Ufficio Contratti', icon: 'driver', type: 'info', subject: `${d.name} lascia la squadra`, body: `Come concordato, ${d.name} lascia il team per fare spazio al nuovo arrivo.` }); }
  }
  // 4) expired contracts
  for (const t of Object.values(state.teams)) {
    for (const id of t.drivers.slice()) {
      const d = state.drivers[id]; if (!d || d.contract > 0) continue;
      if (t.isPlayer) {
        t.drivers = t.drivers.filter((x) => x !== d.id); d.teamId = null; d.salary = salaryFor(d, C);
        if (t.number1 === d.id) t.number1 = null;
        H.addMail(state, { from: 'Ufficio Contratti', icon: 'driver', type: 'bad', subject: `Contratto scaduto: ${d.name}`, body: `${d.name} non è più sotto contratto. Il sedile è libero: ingaggia un pilota dal Mercato prima del primo evento.` });
        continue;
      }
      const mates = t.drivers.map((x) => state.drivers[x]).filter((x) => x && x.id !== d.id);
      const mateOv = Math.max(0, ...mates.map(ov));
      const keepWanted = ov(d) >= 74 || ov(d) >= mateOv - 2 || (d.age <= 23 && d.pot >= ov(d) + 6);
      const leaves = persona(d) === PERSONAS.ambizioso && ov(d) >= 84 && carScore(state, t) < 0.4 && chance(0.6);
      if (keepWanted && !leaves && chance(0.8)) { d.contract = d.age >= 33 ? 1 : randInt(1, 3); d.salary = salaryFor(d, C); }
      else { t.drivers = t.drivers.filter((x) => x !== d.id); d.teamId = null; d.salary = salaryFor(d, C); if (t.number1 === d.id) t.number1 = null; }
    }
    // over capacity (arrivals): AI teams drop their weakest
    while (!t.isPlayer && t.drivers.length > seats) {
      const worst = t.drivers.map((x) => state.drivers[x]).filter(Boolean).filter((x) => !arrivals.includes(x)).sort((a, b) => ov(a) - ov(b))[0] || state.drivers[t.drivers[0]];
      t.drivers = t.drivers.filter((x) => x !== worst.id); worst.teamId = null; worst.contract = 0; worst.salary = salaryFor(worst, C);
    }
  }
  // 5) fresh blood
  for (let i = 0; i < 6; i++) { const d = generateRookie(C, rand(0.9, 1.1)); d.salary = salaryFor(d, C); d.number = randInt(2, 99); state.drivers[d.id] = d; }
  if (H.freeAgents(state).length < 12) for (let i = 0; i < 4; i++) { const d = generateVeteranFreeAgent(C); d.salary = salaryFor(d, C); d.number = randInt(2, 99); state.drivers[d.id] = d; }
  // 6) AI teams fill seats, best teams choose first
  const teams = Object.values(state.teams).filter((t) => !t.isPlayer).sort((a, b) => b.rep - a.rep);
  for (const t of teams) aiSignings(state, t, true);
}

// AI team fills its empty seats by valuing the free-agent pool
export function aiSignings(state, team, news = false) {
  const C = state.category;
  const seats = H.seatsPerTeam(state);
  const ov = (d) => driverOverall(d, C);
  let guard = 0;
  while (team.drivers.length < seats && guard++ < 8) {
    const pool = H.freeAgents(state).filter((d) => !d.nextTeam);
    if (!pool.length) { const r = generateRookie(C); r.salary = salaryFor(r, C); state.drivers[r.id] = r; pool.push(r); }
    const youth = 0.25 + (1 - team.rep / 100) * 0.4; // smaller teams gamble more on youth
    const value = (d) => ov(d) + (d.age <= 23 ? (d.pot - ov(d)) * youth : 0) - (d.age >= 35 ? (d.age - 34) * 1.5 : 0) + rand(0, 3) - (salaryFor(d, C) > team.baseBudget * 0.25 ? 6 : 0);
    const ranked = pool.sort((a, b) => value(b) - value(a));
    let chosen = null;
    for (let i = 0; i < Math.min(ranked.length, 6); i++) {
      const d = ranked[i];
      const cs = carScore(state, team);
      const pRefuse = ov(d) >= 84 ? clamp(0.55 - cs, 0, 0.5) * (persona(d) === PERSONAS.ambizioso ? 1.4 : 0.8) : 0;
      if (i < 5 && chance(pRefuse)) continue;
      chosen = d; break;
    }
    chosen ||= ranked[0];
    const from = chosen.reserveFor;
    chosen.teamId = team.id; chosen.contract = chosen.age >= 33 ? randInt(1, 2) : randInt(1, 3); chosen.salary = salaryFor(chosen, C); chosen.morale = 72;
    if (from) { const rt = state.teams[from]; if (rt?.reserve === chosen.id) rt.reserve = null; chosen.reserveFor = null; }
    team.drivers.push(chosen.id);
    if (news && (ov(chosen) >= 78 || chosen.age <= 21)) H.addNews(state, `Mercato: ${chosen.name}${chosen.age <= 21 ? ` (${chosen.age} anni)` : ''} firma con ${team.name}.`);
  }
}

