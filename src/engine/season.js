import { CATEGORIES, POINTS_STD } from '../data/categories.js';
import { ENGINE_SUPPLIERS, TEAMS } from '../data/teams.js';
import { rand, randInt, pick, clamp, chance, shuffle, uid, gauss } from './rng.js';
import { gainXP, checkObjectives, ensureProgress, makeObjectives, hasPerk } from './progress.js';
import { driverOverall, salaryFor, generateRookie, generateVeteranFreeAgent, makeSponsorOffers, buildCalendar, getTrack, makeStaff, STAFF_ROLES, FACILITIES, avgPart } from './world.js';

export const fmtM = (v) => `${v < 0 ? '-' : ''}€${Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1)}M`;

export function cat(state) { return CATEGORIES[state.category]; }
export function playerTeam(state) { return state.teams[state.playerTeam]; }
export function teamDrivers(state, team) { return team.drivers.map((id) => state.drivers[id]).filter(Boolean); }

export function addMail(state, { from, subject, body, type = 'info', icon }) {
  state.inbox.unshift({ id: uid('m'), from, subject, body, type, icon, read: false, season: state.season, round: state.round });
  if (state.inbox.length > 80) state.inbox.length = 80;
}
export function addNews(state, text) {
  state.news.unshift({ text, season: state.season, round: state.round });
  if (state.news.length > 40) state.news.length = 40;
}
export function addFinance(state, label, amount) {
  const t = playerTeam(state);
  t.money = +(t.money + amount).toFixed(3);
  state.finance.push({ season: state.season, round: state.round, label, amount: +amount.toFixed(3) });
  if (state.finance.length > 400) state.finance.splice(0, state.finance.length - 400);
}

// ---------- Car performance ----------
export function carPerf(state, team, track, extraWeights) {
  const C = cat(state);
  const w = { ...(track?.w || {}), ...(extraWeights || {}) };
  let sum = 0, ws = 0;
  for (const p of C.parts) {
    if (p.id === 'reliability') continue;
    let wt = w[p.id] ?? (p.id === 'tyre' || p.id === 'efficiency' ? 0.35 : 1);
    sum += team.car.parts[p.id] * wt; ws += wt;
  }
  return sum / ws;
}

export function partRanking(state, partId) {
  return Object.values(state.teams).sort((a, b) => b.car.parts[partId] - a.car.parts[partId]).map((t) => t.id);
}
export function overallCarRanking(state) {
  return Object.values(state.teams).sort((a, b) => avgPart(b) - avgPart(a)).map((t) => t.id);
}

// ---------- R&D ----------
export const RD_TIERS = {
  base: { name: 'Aggiornamento', races: 1, cost: 2.2, gain: [1.2, 2.6], fail: 0.02, desc: 'Piccolo passo avanti, rapido e sicuro.' },
  major: { name: 'Pacchetto Evolutivo', races: 2, cost: 5.5, gain: [2.8, 5.2], fail: 0.08, desc: 'Nuovo pacchetto, buon rapporto costo/beneficio.' },
  revolution: { name: 'Progetto Rivoluzionario', races: 3, cost: 11, gain: [5, 10.5], fail: 0.22, desc: 'Grande salto, ma può fallire.' },
};
export function rdSlots(team, state) { return 1 + Math.floor(team.facilities.factory / 2) + (team.isPlayer && hasPerk(state, 'rd_slot') ? 1 : 0); }
export function rdCost(state, tier) { return +(RD_TIERS[tier].cost * cat(state).budgetScale * (hasPerk(state, 'rd_cost') ? 0.88 : 1)).toFixed(2); }
function diminish(val) { return clamp((102 - val) / 24, 0.18, 1.35); }

export function startProject(state, partId, tier) {
  const t = playerTeam(state);
  const T = RD_TIERS[tier];
  if (t.projects.length >= rdSlots(t, state)) return { ok: false, msg: 'Nessuno slot R&D libero: potenzia la Fabbrica.' };
  if (t.projects.some((p) => p.part === partId)) return { ok: false, msg: 'C’è già un progetto attivo su questo componente.' };
  const cost = rdCost(state, tier);
  if (t.money < cost) return { ok: false, msg: 'Fondi insufficienti.' };
  const td = state.staff[t.staff.td];
  const races = Math.max(1, T.races - (td && td.rating > 88 && tier !== 'base' ? 1 : 0) - (t.facilities.factory >= 5 && tier === 'revolution' ? 1 : 0));
  addFinance(state, `R&D: ${T.name} (${partName(state, partId)})`, -cost);
  t.projects.push({ id: uid('p'), part: partId, tier, racesLeft: races, total: races });
  return { ok: true };
}
export function partName(state, id) { return cat(state).parts.find((p) => p.id === id)?.name || id; }

function completeProject(state, team, proj) {
  const T = RD_TIERS[proj.tier];
  const td = state.staff[team.staff.td];
  const tdF = 0.8 + (td?.rating || 60) / 250;
  const wtF = 1 + (team.facilities.windtunnel - 1) * 0.06;
  const failP = T.fail * (1.3 - (td?.rating || 60) / 160);
  const cur = team.car.parts[proj.part];
  let gain;
  if (chance(failP)) gain = rand(-0.5, 1);
  else gain = rand(T.gain[0], T.gain[1]) * tdF * wtF * diminish(cur);
  if (team.isPlayer && gain > 0) {
    if (hasPerk(state, 'rd_gain')) gain *= 1.1;
    if (hasPerk(state, 'reverse')) { const vals = Object.values(state.teams).map((t) => t.car.parts[proj.part]).sort((a, b) => a - b); if (cur < vals[Math.floor(vals.length / 2)]) gain *= 1.2; }
  }
  gain = +gain.toFixed(1);
  team.car.parts[proj.part] = clamp(+(cur + gain).toFixed(1), 30, 99.5);
  return gain;
}

function aiDevelopment(state, team) {
  const diff = { easy: 0.8, normal: 1, hard: 1.25 }[state.difficulty] || 1;
  const C = cat(state);
  const td = state.staff[team.staff.td];
  const all = Object.values(state.teams);
  const avgB = all.reduce((s, t) => s + t.baseBudget, 0) / all.length;
  const budgetF = Math.sqrt(team.baseBudget / avgB);
  const total = rand(0.9, 2.6) * diff * clamp(budgetF, 0.75, 1.25) * (0.8 + (td?.rating || 70) / 250) * (1 + (team.facilities.windtunnel - 3) * 0.05);
  // distribute
  const parts = C.parts.map((p) => p.id);
  let remaining = total;
  const n = randInt(1, 3);
  for (let i = 0; i < n; i++) {
    const p = pick(parts);
    const g = i === n - 1 ? remaining : remaining * rand(0.3, 0.7);
    remaining -= g;
    team.car.parts[p] = clamp(+(team.car.parts[p] + g * diminish(team.car.parts[p])).toFixed(1), 30, 99.5);
  }
}

export function facilityCost(state, key, level) { return +(6 * level * cat(state).budgetScale * (key === 'windtunnel' ? 1.3 : 1)).toFixed(1); }
export function startFacility(state, key) {
  const t = playerTeam(state);
  if (t.facilityBuild) return { ok: false, msg: 'C’è già un cantiere in corso.' };
  const lvl = t.facilities[key];
  if (lvl >= 5) return { ok: false, msg: 'Livello massimo raggiunto.' };
  const cost = facilityCost(state, key, lvl + 1);
  if (t.money < cost) return { ok: false, msg: 'Fondi insufficienti.' };
  addFinance(state, `Cantiere: ${FACILITIES[key].name} Lv${lvl + 1}`, -cost);
  t.facilityBuild = { key, racesLeft: 2 + Math.floor(lvl / 2), total: 2 + Math.floor(lvl / 2) };
  return { ok: true };
}

// ---------- Standings ----------
export function standings(state) {
  const dp = {}, tp = {}, dWins = {}, tWins = {}, dBest = {};
  for (const d of Object.values(state.drivers)) if (d.teamId) dp[d.id] = 0;
  for (const t of Object.values(state.teams)) tp[t.id] = 0;
  for (const ev of state.calendar) {
    if (!ev.results) continue;
    for (const r of ev.results.classification) {
      for (const did of r.driverIds) {
        dp[did] = (dp[did] || 0) + r.pts;
        if (r.pos === 1) dWins[did] = (dWins[did] || 0) + 1;
        if (r.status !== 'dnf') dBest[did] = Math.min(dBest[did] || 99, r.pos);
      }
      tp[r.teamId] = (tp[r.teamId] || 0) + r.pts;
      if (r.pos === 1) tWins[r.teamId] = (tWins[r.teamId] || 0) + 1;
    }
  }
  const drivers = Object.keys(dp).map((id) => ({ id, pts: dp[id], wins: dWins[id] || 0, best: dBest[id] || 99 }))
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.best - b.best);
  const teams = Object.keys(tp).map((id) => ({ id, pts: tp[id], wins: tWins[id] || 0 }))
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  return { drivers, teams };
}

export function pointsFor(pos, double) {
  const p = POINTS_STD[pos - 1] || 0;
  return double ? p * 2 : p;
}

// ---------- Round processing ----------
export function seatsPerTeam(state) { const C = cat(state); return C.cars * C.driversPerCar; }

export function applyRoundResults(state, results) {
  const ev = state.calendar[state.round];
  const C = cat(state);
  const track = getTrack(state.category, ev.trackId);
  ev.results = results; ev.done = true;
  const pt = playerTeam(state);

  // driver stats
  for (const r of results.classification) {
    for (const did of r.driverIds) {
      const d = state.drivers[did]; if (!d) continue;
      d.stats.starts++;
      d.stats.points += r.pts;
      if (r.pos === 1 && r.status !== 'dnf') d.stats.wins++;
      if (r.pos <= 3 && r.status !== 'dnf') d.stats.podiums++;
      if (r.status === 'dnf') d.stats.dnfs++;
      // morale
      const team = state.teams[d.teamId];
      const expected = team ? 1 + overallCarRanking(state).indexOf(team.id) * 2 : 10;
      const delta = r.status === 'dnf' ? -4 : clamp((expected - r.pos) * 1.2, -8, 10);
      d.morale = clamp(Math.round(d.morale + delta + (team?.isPlayer && hasPerk(state, 'motivator') ? 2 : 0)), 10, 100);
    }
  }
  if (results.pole) { const d = state.drivers[results.pole]; if (d) d.stats.poles++; }

  // ----- finances for player -----
  const n = state.calendar.length;
  const repF = 0.7 + pt.rep / 300;
  const commercial = +(pt.baseBudget * 0.62 / n * repF).toFixed(2);
  addFinance(state, `Diritti commerciali – ${track.name}`, commercial);
  const myRes = results.classification.filter((r) => r.teamId === pt.id);
  const bestPos = Math.min(...myRes.map((r) => (r.status === 'dnf' ? 99 : r.pos)));
  for (const sp of pt.sponsors) {
    addFinance(state, `Sponsor ${sp.name}`, sp.perRace * (hasPerk(state, 'brand') ? 1.1 : 1));
    let hit = 0;
    if (sp.objective === 'points') hit = myRes.filter((r) => r.pts > 0).length;
    if (sp.objective === 'podium') hit = myRes.filter((r) => r.pos <= 3 && r.status !== 'dnf').length;
    if (sp.objective === 'win') hit = myRes.filter((r) => r.pos === 1 && r.status !== 'dnf').length;
    if (sp.objective === 'finish') hit = myRes.every((r) => r.status !== 'dnf') ? 1 : 0;
    if (sp.objective === 'beat') {
      const rival = rivalTeam(state);
      const rb = Math.min(...results.classification.filter((r) => r.teamId === rival?.id).map((r) => (r.status === 'dnf' ? 99 : r.pos)), 99);
      hit = bestPos < rb ? 1 : 0;
    }
    if (hit > 0) addFinance(state, `Bonus ${sp.name}`, +(sp.bonus * hit).toFixed(2));
  }
  const salaries = teamDrivers(state, pt).reduce((s, d) => s + d.salary, 0) + Object.values(pt.staff).reduce((s, id) => s + (state.staff[id]?.salary || 0), 0);
  addFinance(state, 'Stipendi piloti e staff', -(salaries / n));
  const fac = Object.values(pt.facilities).reduce((a, b) => a + b, 0);
  addFinance(state, 'Costi operativi e logistica', -((pt.baseBudget * 0.1 + fac * 0.4 * C.budgetScale) / n));
  if (results.damageCost) addFinance(state, 'Riparazioni danni', -results.damageCost);

  // ----- R&D progress -----
  for (const team of Object.values(state.teams)) {
    if (team.isPlayer) {
      for (const proj of team.projects) proj.racesLeft--;
      const done = team.projects.filter((p) => p.racesLeft <= 0);
      team.projects = team.projects.filter((p) => p.racesLeft > 0);
      for (const p of done) {
        const g = completeProject(state, team, p);
        state.career.rdDone = (state.career.rdDone || 0) + 1;
        if (state.career.rdDone >= 5) unlock(state, 'rd5', 'Fabbrica a pieno regime', 'Completa 5 progetti R&D.');
        addMail(state, {
          from: state.staff[team.staff.td]?.name || 'Direttore Tecnico', type: g > 0.9 ? 'good' : 'bad', icon: 'rd',
          subject: g > 0.9 ? `R&D completato: ${partName(state, p.part)} +${g}` : `R&D deludente su ${partName(state, p.part)}`,
          body: g > 0.9 ? `Il ${RD_TIERS[p.tier].name.toLowerCase()} su ${partName(state, p.part)} ha portato un guadagno di +${g} punti. Ora siamo a ${team.car.parts[p.part].toFixed(1)}. Il componente è già montato sulle vetture.`
            : `Purtroppo il ${RD_TIERS[p.tier].name.toLowerCase()} su ${partName(state, p.part)} non ha dato i risultati sperati (${g >= 0 ? '+' : ''}${g}). I dati della galleria non hanno trovato riscontro in pista.`,
        });
      }
      if (team.facilityBuild) {
        team.facilityBuild.racesLeft--;
        if (team.facilityBuild.racesLeft <= 0) {
          const k = team.facilityBuild.key;
          team.facilities[k]++;
          addMail(state, { from: 'Ufficio Infrastrutture', type: 'good', icon: 'factory', subject: `${FACILITIES[k].name} portata al livello ${team.facilities[k]}`, body: `I lavori sono terminati. ${FACILITIES[k].desc}.` });
          team.facilityBuild = null;
        }
      }
    } else aiDevelopment(state, team);
  }

  // ----- board confidence -----
  const st = standings(state);
  const myTeamPos = st.teams.findIndex((t) => t.id === pt.id) + 1;
  const delta = clamp((state.board.target - myTeamPos) * 1.5 + (bestPos <= 3 ? 3 : 0) - (myRes.every((r) => r.status === 'dnf') ? 4 : 0), -7, 7);
  state.board.confidence = clamp(Math.round(state.board.confidence + (delta < 0 && hasPerk(state, 'diplomat') ? delta / 2 : delta)), 0, 100);

  // reputation
  pt.rep = clamp(+(pt.rep + (bestPos <= 3 ? 0.8 : bestPos <= 10 ? 0.15 : -0.2)).toFixed(1), 20, 100);
  state.career.reputation = clamp(+(state.career.reputation + (bestPos === 1 ? 1.5 : bestPos <= 3 ? 0.8 : bestPos <= 10 ? 0.2 : -0.3)).toFixed(1), 0, 100);

  // news
  const win = results.classification[0];
  const wd = win.driverIds.map((id) => state.drivers[id]?.name).join(' / ');
  addNews(state, `${track.name}: vince ${wd} (${state.teams[win.teamId].name})`);

  // achievements
  if (myRes.some((r) => r.pos === 1 && r.status !== 'dnf')) unlock(state, 'first_win', 'Prima vittoria!', 'Vinci una gara.');
  if (myRes.some((r) => r.pos <= 3 && r.status !== 'dnf')) unlock(state, 'first_podium', 'Champagne!', 'Ottieni un podio.');
  if (myRes.filter((r) => r.pos <= 2 && r.status !== 'dnf').length >= 2) unlock(state, 'one_two', 'Doppietta', 'Primo e secondo posto nella stessa gara.');
  if (results.pole && state.drivers[results.pole]?.teamId === pt.id) unlock(state, 'pole', 'Pole Position', 'Conquista una pole.');
  if (results.wet && myRes.some((r) => r.pos === 1 && r.status !== 'dnf')) unlock(state, 'rain_win', 'Re della pioggia', 'Vinci una gara bagnata.');
  if (myRes.some((r) => r.pos === 1 && r.status !== 'dnf' && r.grid >= 10)) unlock(state, 'from_back', 'Rimonta epica', 'Vinci partendo dalla decima posizione o peggio.');
  if (pt.sponsors.length >= 3) unlock(state, 'sponsor3', 'Vetrina piena', 'Firma tre sponsor.');
  if (state.quick) unlock(state, 'quick', 'Pilota della domenica', 'Completa una gara rapida.');

  // XP & objectives
  ensureProgress(state);
  const myPts = myRes.reduce((a, r) => a + r.pts, 0);
  let xp = 20 + myPts * 2.5 + myRes.filter((r) => r.pos <= 3 && r.status !== 'dnf').length * 40 + (myRes.some((r) => r.pos === 1 && r.status !== 'dnf') ? 80 : 0);
  if (results.pole && state.drivers[results.pole]?.teamId === pt.id) xp += 30;
  if (myTeamPos <= state.board.target) xp += 15;
  gainXP(state, xp, track.name);
  for (const o of checkObjectives(state)) {
    gainXP(state, o.xp, o.text);
    addFinance(state, `Obiettivo stagionale: ${o.text}`, o.money);
    addMail(state, { from: 'Consiglio di Amministrazione', icon: 'target', type: 'good', subject: `Obiettivo raggiunto: ${o.text}`, body: `Complimenti! Premio: ${fmtM(o.money)} e ${o.xp} XP.` });
    state._toast = { title: '🎯 Obiettivo stagionale completato', text: o.text };
  }
  postRoundMail(state, results, track, myTeamPos);
  state.round++;
  state.weekend = null;
  if (pt.money < 0) addMail(state, { from: 'Direttore Finanziario', type: 'bad', icon: 'money', subject: 'Conti in rosso!', body: 'Il nostro bilancio è negativo. Il consiglio è preoccupato: riduci le spese di sviluppo o trova nuovi sponsor.' });
  if (pt.money < 0) state.board.confidence = clamp(state.board.confidence - 4, 0, 100);
}

export function unlock(state, id, name, desc) {
  if (state.achievements[id]) return;
  state.achievements[id] = { name, desc, season: state.season };
  state._toast = { title: `🏆 Obiettivo sbloccato: ${name}`, text: desc };
}

export function rivalTeam(state) {
  const ranking = overallCarRanking(state);
  const i = ranking.indexOf(state.playerTeam);
  const j = i === 0 ? 1 : i - 1;
  return state.teams[ranking[j]];
}

function postRoundMail(state, results, track, myTeamPos) {
  const pt = playerTeam(state);
  const mine = results.classification.filter((r) => r.teamId === pt.id);
  const lines = mine.map((r) => `• ${r.driverIds.map((id) => state.drivers[id].name).join(' / ')}: ${r.status === 'dnf' ? 'Ritirato' + (r.reason ? ` (${r.reason})` : '') : `P${r.pos}`}${r.pts ? ` – ${r.pts} punti` : ''}`);
  addMail(state, {
    from: 'Ufficio Stampa', icon: 'flag', type: mine.some((r) => r.pos <= 3 && r.status !== 'dnf') ? 'good' : 'info',
    subject: `Rapporto gara: ${track.name}`,
    body: `${lines.join('\n')}\n\nSiamo ${myTeamPos}° nel campionato costruttori. Obiettivo del consiglio: ${state.board.target}°.`,
  });
  // random driver/staff events
  if (chance(0.22)) {
    const d = pick(teamDrivers(state, pt));
    if (d && d.morale < 45) addMail(state, { from: d.name, icon: 'driver', type: 'bad', subject: 'Non sono contento', body: `Capo, la situazione non mi soddisfa. Mi serve una macchina migliore o inizierò a guardarmi intorno. (Morale: ${d.morale})` });
    else if (d && d.morale > 80) addMail(state, { from: d.name, icon: 'driver', type: 'good', subject: 'Grande lavoro del team', body: `Il feeling con la macchina è fantastico. Continuiamo così! (Morale: ${d.morale})` });
  }
  if (chance(0.12) && state.sponsorOffers.length < 6) {
    state.sponsorOffers.push(...makeSponsorOffers(pt.rep, state.category, 1));
    addMail(state, { from: 'Area Commerciale', icon: 'money', type: 'info', subject: 'Nuova proposta di sponsorizzazione', body: 'Un nuovo marchio è interessato a comparire sulla nostra livrea. Controlla la sezione Sponsor.' });
  }
}

// ---------- Contracts & market ----------
export function freeAgents(state) { return Object.values(state.drivers).filter((d) => !d.teamId && !d.retired); }

export function driverInterest(state, d, team, salary, years) {
  const C = state.category;
  const ask = salaryFor(d, C) * (d.teamId ? 1.15 : 1) * (hasPerk(state, 'negotiator') ? 0.9 : 1);
  const ranking = overallCarRanking(state);
  const carScore = 1 - ranking.indexOf(team.id) / ranking.length; // 0..1
  const ov = driverOverall(d, C);
  const ambition = (ov - 70) / 30; // top drivers care about cars
  let score = (salary / ask) * 0.55 + carScore * (0.25 + ambition * 0.35) + team.rep / 100 * 0.25 + (years >= 2 && d.age > 32 ? 0.08 : 0) + (d.age < 23 ? 0.1 : 0);
  if (d.teamId === team.id) score += 0.15;
  return { score, ask: +ask.toFixed(2) };
}

export function buyoutCost(state, d) {
  if (!d.teamId) return 0;
  return +(d.salary * Math.max(1, d.contract) * 0.8).toFixed(2);
}

export function signDriver(state, driverId, salary, years, replaceId) {
  const d = state.drivers[driverId];
  const t = playerTeam(state);
  const { score } = driverInterest(state, d, t, salary, years);
  if (score < 0.82) return { ok: false, msg: `${d.name} ha rifiutato l’offerta.` };
  const buy = buyoutCost(state, d);
  const signing = +(salary * 0.25).toFixed(2);
  if (t.money < buy + signing) return { ok: false, msg: 'Fondi insufficienti per clausola e bonus firma.' };
  if (buy > 0) {
    const old = state.teams[d.teamId];
    old.drivers = old.drivers.filter((x) => x !== d.id);
    addFinance(state, `Clausola rescissoria ${d.name}`, -buy);
    // AI team replaces
    aiFillSeats(state, old);
  }
  addFinance(state, `Bonus firma ${d.name}`, -signing);
  if (replaceId) {
    const r = state.drivers[replaceId];
    releaseDriver(state, r, true);
    const idx = t.drivers.indexOf(replaceId);
    t.drivers[idx] = d.id;
  } else t.drivers.push(d.id);
  d.teamId = t.id; d.salary = salary; d.contract = years; d.morale = 80;
  addNews(state, `${d.name} firma con ${t.name}!`);
  unlock(state, 'signing', 'Colpo di mercato', 'Ingaggia un nuovo pilota.');
  return { ok: true };
}

export function releaseDriver(state, d, payout) {
  if (payout && d.contract > 0 && d.teamId === state.playerTeam) addFinance(state, `Rescissione ${d.name}`, -(d.salary * d.contract * 0.5));
  const t = state.teams[d.teamId];
  if (t) t.drivers = t.drivers.filter((x) => x !== d.id);
  d.teamId = null; d.contract = 0; d.salary = salaryFor(d, state.category);
}

export function aiFillSeats(state, team) {
  const need = seatsPerTeam(state) - team.drivers.length;
  for (let i = 0; i < need; i++) {
    const pool = freeAgents(state).sort((a, b) => driverOverall(b, state.category) - driverOverall(a, state.category));
    // stronger teams pick better drivers, weaker teams pick randomly from the middle
    const r = 1 - team.rep / 100;
    const d = pool[Math.min(pool.length - 1, Math.floor(r * 4 * Math.random()))] || generateRookie(state.category);
    if (!state.drivers[d.id]) state.drivers[d.id] = d;
    d.teamId = team.id; d.contract = randInt(1, 3); d.salary = salaryFor(d, state.category);
    team.drivers.push(d.id);
  }
}

export function hireStaff(state, staffId) {
  const s = state.staff[staffId];
  const t = playerTeam(state);
  const fee = +(s.salary * 0.5).toFixed(2);
  if (t.money < fee) return { ok: false, msg: 'Fondi insufficienti.' };
  if (s.teamId && s.teamId !== t.id) {
    const other = state.teams[s.teamId];
    const extra = +(s.salary * 1.2).toFixed(2);
    if (t.money < fee + extra) return { ok: false, msg: 'Fondi insufficienti per liberarlo dal contratto.' };
    addFinance(state, `Liberatoria ${s.name}`, -extra);
    const repl = makeStaff(s.role, s.rating - rand(4, 12), other.id);
    state.staff[repl.id] = repl; other.staff[s.role] = repl.id;
  }
  const old = state.staff[t.staff[s.role]];
  if (old) old.teamId = null;
  addFinance(state, `Ingaggio ${s.name}`, -fee);
  s.teamId = t.id; t.staff[s.role] = s.id;
  return { ok: true };
}

// ---------- Season end ----------
export function seasonSummary(state) {
  const st = standings(state);
  const pt = playerTeam(state);
  const teamPos = st.teams.findIndex((t) => t.id === pt.id) + 1;
  const champ = st.drivers[0];
  const champD = state.drivers[champ.id];
  const myDriverPos = Math.min(...pt.drivers.map((id) => st.drivers.findIndex((x) => x.id === id) + 1).filter((x) => x > 0));
  return { st, teamPos, champ: champD, champTeam: state.teams[champD.teamId], myDriverPos, target: state.board.target, constructors: state.teams[st.teams[0].id] };
}

export function endSeason(state) {
  const C = cat(state);
  const sum = seasonSummary(state);
  const pt = playerTeam(state);
  const n = Object.keys(state.teams).length;
  // prize money
  const prize = +(Math.max(1, C.prizeTop - (sum.teamPos - 1) * C.prizeStep)).toFixed(1);
  addFinance(state, `Montepremi costruttori (${sum.teamPos}°)`, prize);
  // titles
  sum.champ.stats.titles++;
  if (sum.champ.teamId === pt.id) { state.career.trophies.push({ season: state.season, category: state.category, type: 'Piloti', name: sum.champ.name }); unlock(state, 'driver_title', 'Campione del Mondo', 'Vinci il titolo piloti.'); }
  if (sum.st.teams[0].id === pt.id) { state.career.trophies.push({ season: state.season, category: state.category, type: 'Costruttori', name: pt.name }); unlock(state, 'team_title', 'Dinastia', 'Vinci il titolo costruttori.'); }
  state.career.history.push({ season: state.season, category: state.category, team: pt.name, teamId: pt.id, pos: sum.teamPos, target: sum.target, colors: pt.colors });
  state.career.seasonsManaged++;
  // board verdict
  const diff = sum.target - sum.teamPos;
  state.board.confidence = clamp(state.board.confidence + diff * 8, 0, 100);
  for (const t of Object.values(state.teams)) t.lastPos = sum.st.teams.findIndex((x) => x.id === t.id) + 1;
  sum.prize = prize;
  sum.fired = state.board.confidence < 15;
  gainXP(state, 200 + Math.max(0, diff) * 120 + (sum.st.teams[0].id === pt.id ? 900 : 0) + (sum.champ.teamId === pt.id ? 700 : 0), `Stagione ${state.season}`);
  state.lastSummary = { season: state.season, teamPos: sum.teamPos, target: sum.target, champ: sum.champ.name, champTeam: sum.champTeam.name, constructors: sum.constructors.name, prize, fired: sum.fired };
  return sum;
}

export function jobOffers(state) {
  // Offers from teams in all categories based on career reputation
  const rep = state.career.reputation;
  const offers = [];
  for (const catId of Object.keys(CATEGORIES)) {
    const teams = catId === state.category ? Object.values(state.teams).map((t) => ({ id: t.id, name: t.name, rep: t.rep, colors: t.colors })) : null;
    let pool = teams;
    if (!pool) pool = TEAMS[catId].map((t) => ({ id: t.id, name: t.name, rep: t.rep, colors: t.colors }));
    const others = pool.filter((t) => t.id !== state.playerTeam || catId !== state.category);
    let suitable = others.filter((t) => t.rep <= rep + 30 + (catId !== state.category ? 10 : 0));
    if (suitable.length < 2) suitable = others.slice().sort((a, b) => a.rep - b.rep).slice(0, 2);
    const chosen = shuffle(suitable).slice(0, 2);
    for (const t of chosen) offers.push({ category: catId, teamId: t.id, name: t.name, colors: t.colors, rep: t.rep });
  }
  return offers;
}

export function newSeason(state) {
  const C = cat(state);
  const catId = state.category;
  state.season++;
  state.round = 0;
  state.phase = 'preseason';
  // age & development
  for (const d of Object.values(state.drivers)) {
    if (d.retired) continue;
    d.history.push({ season: state.season - 1, team: d.teamId ? state.teams[d.teamId]?.short : '-', pts: 0 });
    d.age++;
    const ov = driverOverall(d, catId);
    const a = d.attrs;
    const academy = d.teamId ? (state.teams[d.teamId].facilities.academy - 3) * 0.3 : 0;
    const sim = d.teamId ? (state.teams[d.teamId].facilities.simulator - 3) * 0.2 : 0;
    if (d.age <= 27 && d.pot > ov) {
      const g = (d.pot - ov) * rand(0.15, 0.4) + academy + sim;
      for (const k of Object.keys(a)) a[k] = clamp(Math.round(a[k] + g * rand(0.6, 1.3)), 30, 99);
      a.exp = clamp(a.exp + randInt(6, 14), 0, 99);
    } else if (d.age >= 33) {
      const dec = (d.age - 32) * rand(0.3, 0.9);
      a.pace = clamp(Math.round(a.pace - dec), 30, 99);
      a.cons = clamp(Math.round(a.cons - dec * 0.3 + rand(-0.5, 1)), 30, 99);
      a.exp = clamp(a.exp + randInt(1, 4), 0, 99);
    } else {
      a.exp = clamp(a.exp + randInt(3, 8), 0, 99);
      for (const k of ['pace', 'cons', 'race', 'tyre']) a[k] = clamp(Math.round(a[k] + rand(-1, 1.4)), 30, 99);
    }
    // retirement
    const retireAge = catId === 'endurance' ? 44 : catId === 'rally' ? 42 : 39;
    if (d.age >= retireAge && chance(0.25 + (d.age - retireAge) * 0.2) && !(d.teamId === state.playerTeam && d.contract > 1)) {
      if (d.teamId) { const t = state.teams[d.teamId]; t.drivers = t.drivers.filter((x) => x !== d.id); }
      d.teamId = null; d.retired = true;
      addNews(state, `${d.name} annuncia il ritiro a ${d.age} anni. Leggenda.`);
      continue;
    }
    if (d.teamId) {
      d.contract--;
      if (d.contract <= 0) {
        const t = state.teams[d.teamId];
        const ov2 = driverOverall(d, catId);
        if (!t.isPlayer && ov2 > 74 && chance(0.6)) { d.contract = randInt(1, 3); d.salary = salaryFor(d, catId); }
        else if (!t.isPlayer) { t.drivers = t.drivers.filter((x) => x !== d.id); d.teamId = null; d.salary = salaryFor(d, catId); }
        else if (t.isPlayer) { t.drivers = t.drivers.filter((x) => x !== d.id); d.teamId = null; d.salary = salaryFor(d, catId); addMail(state, { from: 'Ufficio Contratti', icon: 'driver', type: 'bad', subject: `Contratto scaduto: ${d.name}`, body: `${d.name} non è più sotto contratto. Il sedile è libero: ingaggia un pilota dal Mercato prima del primo evento.` }); }
      }
    }
  }
  // new rookies
  for (let i = 0; i < 6; i++) { const d = generateRookie(catId); d.salary = salaryFor(d, catId); d.number = randInt(2, 99); state.drivers[d.id] = d; }
  if (freeAgents(state).length < 10) for (let i = 0; i < 4; i++) { const d = generateVeteranFreeAgent(catId); d.salary = salaryFor(d, catId); d.number = randInt(2, 99); state.drivers[d.id] = d; }
  // AI market: big teams poach
  for (const t of Object.values(state.teams)) if (!t.isPlayer) aiFillSeats(state, t);
  // prune retired drivers with no team older than 3 seasons
  for (const [id, d] of Object.entries(state.drivers)) if (d.retired && !d.teamId && d.age > 48) delete state.drivers[id];

  // cars: regression + regulation change
  const reg = chance(0.3) ? pick(C.parts.filter((p) => p.id !== 'reliability')) : null;
  for (const t of Object.values(state.teams)) {
    for (const p of C.parts) {
      let v = t.car.parts[p.id];
      // remove concept mods before regression
      const cm = C.concepts.find((c) => c.id === t.car.concept)?.mods?.[p.id] || 0;
      v -= cm;
      v = v * 0.82 + 76 * 0.18 + rand(-1.5, 1.5);
      if (reg && reg.id === p.id) v = v * 0.85 + 70 * 0.15 + rand(-4, 4);
      t.car.parts[p.id] = clamp(+v.toFixed(1), 35, 97);
    }
    t.car.concept = 'balanced';
    t.projects = [];
    // AI picks a concept
    if (!t.isPlayer) {
      const c = pick(C.concepts);
      applyConcept(state, t, c.id);
    }
    t.sponsors = t.sponsors.map((s) => ({ ...s, seasonsLeft: s.seasonsLeft - 1 })).filter((s) => s.seasonsLeft > 0);
  }
  if (reg) addMail(state, { from: 'Federazione Internazionale', icon: 'rules', type: 'info', subject: `Nuovo regolamento: ${reg.name}`, body: `La Federazione ha introdotto modifiche sostanziali al regolamento su: ${reg.name}. Tutti i team perdono parte del vantaggio accumulato: è il momento di recuperare!` });
  const pt = playerTeam(state);
  for (const s of pt.sponsors) if (s.seasonsLeft === 1) addMail(state, { from: 'Area Commerciale', icon: 'money', type: 'info', subject: `Ultima stagione con ${s.name}`, body: `Il contratto con ${s.name} scade a fine anno.` });
  state.sponsorOffers = makeSponsorOffers(pt.rep, catId, 5);
  // staff aging pool
  for (const role of Object.keys(STAFF_ROLES)) { const s = makeStaff(role, rand(55, 93)); state.staff[s.id] = s; }
  state.calendar = buildCalendar(catId, state.seasonLength);
  // new board target
  const ranking = overallCarRanking(state);
  const last = pt.lastPos || ranking.indexOf(pt.id) + 1;
  const prevTarget = state.board.target;
  const base = Math.round((last + ranking.indexOf(pt.id) + 1) / 2);
  state.board.target = clamp(base - (last <= prevTarget && last > 1 ? 1 : 0) + (state.difficulty === 'easy' ? 1 : 0), 1, ranking.length);
  if (state.board.confidence < 30) state.board.confidence = 30;
  state.objectives = makeObjectives(state);
  addMail(state, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'info', subject: `Obiettivi stagione ${state.season}`, body: `Benvenuto nella stagione ${state.season}. Il consiglio si aspetta almeno il ${state.board.target}° posto nel campionato costruttori. Progetta la nuova vettura nel Centro Tecnico prima del primo evento.` });
}

export function applyConcept(state, team, conceptId) {
  const C = cat(state);
  const old = C.concepts.find((c) => c.id === team.car.concept);
  const nw = C.concepts.find((c) => c.id === conceptId);
  for (const p of C.parts) {
    const delta = (nw.mods[p.id] || 0) - (old?.mods[p.id] || 0);
    team.car.parts[p.id] = clamp(+(team.car.parts[p.id] + delta).toFixed(1), 30, 99.5);
  }
  team.car.concept = conceptId;
}

export function changeEngine(state, team, supId) {
  const old = ENGINE_SUPPLIERS.find((e) => e.id === team.engine);
  const nw = ENGINE_SUPPLIERS.find((e) => e.id === supId);
  if (!nw || team.works) return;
  team.car.parts.engine = clamp(+(team.car.parts.engine + nw.power - old.power).toFixed(1), 30, 99.5);
  team.car.parts.reliability = clamp(+(team.car.parts.reliability + (nw.rel - old.rel) * 0.5).toFixed(1), 30, 99.5);
  team.engine = supId;
}
