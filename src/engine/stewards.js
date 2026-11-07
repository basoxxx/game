// Stewards: superlicence penalty points, race bans, reserve drivers and fines.
// In-race penalties are decided by CircuitSim (track limits, collisions, unsafe release,
// pit-lane speeding, jump starts) and arrive here in results.penalties.
import { generateRookie, salaryFor, driverOverall } from './world.js';

export const BAN_POINTS = 12;
export const POINTS_LIFE = 12; // events a penalty point stays on the licence

export function licencePoints(d) { return (d?.licence || []).reduce((a, x) => a + x.pts, 0); }

export function isBanned(state, d) { return !!(d?.ban && d.ban.season === state.season && d.ban.round === state.round); }

// Reserve driver for a team (kept on standby, unpaid until called up)
export function reserveFor(state, team) {
  let r = team.reserve ? state.drivers[team.reserve] : null;
  if (r && (r.teamId || r.retired)) r = null;
  if (!r) {
    const taken = new Set(Object.values(state.teams).map((t) => t.reserve).filter(Boolean));
    const pool = Object.values(state.drivers).filter((d) => !d.teamId && !d.retired && !taken.has(d.id) && !d.nextTeam).sort((a, b) => driverOverall(b, state.category) - driverOverall(a, state.category));
    r = pool[Math.min(pool.length - 1, 2 + Math.floor(Math.random() * 4))];
    if (!r) { r = generateRookie(state.category); r.salary = salaryFor(r, state.category); r.number = 40 + Math.floor(Math.random() * 59); state.drivers[r.id] = r; }
    team.reserve = r.id;
  }
  r.reserveFor = team.id;
  return r;
}

// Substitute banned drivers in an entry's driver list
export function substituteBanned(state, team, driverIds) {
  return driverIds.map((id) => {
    const d = state.drivers[id];
    if (!isBanned(state, d)) return id;
    return reserveFor(state, team).id;
  });
}

// Process the stewards' decisions after a round: penalty points, bans, fines, mails
export function processStewards(state, results, helpers) {
  const { addMail, addNews, addFinance, playerTeam } = helpers;
  const pt = playerTeam(state);
  // age existing points
  for (const d of Object.values(state.drivers)) {
    if (!d.licence?.length) continue;
    for (const x of d.licence) x.left--;
    d.licence = d.licence.filter((x) => x.left > 0);
  }
  const pens = results.penalties || [];
  const mine = [];
  let fines = 0;
  for (const p of pens) {
    const d = state.drivers[p.driverId]; if (!d) continue;
    if (p.pts > 0) { (d.licence ||= []).push({ pts: p.pts, left: POINTS_LIFE, why: p.type, season: state.season }); }
    if (p.teamId === pt.id) { mine.push(p); if (p.fine) fines += p.fine; }
    if (p.grid && state.round + 1 < state.calendar.length) d.stewardGrid = { season: state.season, round: state.round + 1, places: p.grid, why: 'penalità commissari' };
    if (licencePoints(d) >= BAN_POINTS && !d.ban) {
      const nextRound = state.round + 1;
      d.ban = nextRound >= state.calendar.length ? { season: state.season + 1, round: 0 } : { season: state.season, round: nextRound };
      d.licence = [];
      addNews(state, `⚖ ${d.name} raggiunge ${BAN_POINTS} punti sulla superlicenza: squalificato per un evento!`);
      if (p.teamId === pt.id) addMail(state, { from: 'Commissari Sportivi', icon: 'rules', type: 'bad', subject: `${d.name} squalificato per un evento`, body: `${d.name} ha accumulato ${BAN_POINTS} punti di penalità sulla superlicenza e salterà il prossimo evento. Al suo posto correrà il pilota di riserva ${reserveFor(state, pt).name}. I punti vengono azzerati dopo la squalifica.` });
    }
  }
  if (fines > 0) addFinance(state, 'Multe dei commissari', -fines);
  if (mine.length) {
    const lines = mine.map((p) => `• ${state.drivers[p.driverId]?.name}: ${p.text}${p.pts ? ` (+${p.pts} pt superlicenza, totale ${licencePoints(state.drivers[p.driverId])})` : ''}`);
    addMail(state, { from: 'Commissari Sportivi', icon: 'rules', type: 'bad', subject: `Decisioni dei commissari${results.track ? '' : ''}`, body: `${lines.join('\n')}${fines ? `\n\nMulta alla squadra: €${(fines * 1000).toFixed(0)}k.` : ''}\n\nRicorda: a ${BAN_POINTS} punti scatta la squalifica per un evento. I punti scadono dopo ${POINTS_LIFE} eventi.` });
  }
  // warning when close to a ban
  for (const id of pt.drivers) {
    const d = state.drivers[id]; const lp = licencePoints(d);
    if (lp >= 9 && !d._banWarn) { d._banWarn = true; addMail(state, { from: 'Ufficio Legale', icon: 'rules', type: 'bad', subject: `${d.name} a rischio squalifica`, body: `${d.name} ha ${lp} punti sulla superlicenza: ancora ${BAN_POINTS - lp} e salterà una gara. Valuta un approccio più prudente nei duelli (ritmo Gestione, niente attacchi al limite).` }); }
    if (lp < 7) d._banWarn = false;
  }
}

export function penaltyLabel(type) {
  return { tl: 'Track limits', col: 'Collisione', unsafe: 'Rilascio non sicuro', speed: 'Eccesso di velocità in pit lane', jump: 'Partenza anticipata', defend: 'Cambio di traiettoria in frenata', tyre: 'Regola delle mescole' }[type] || type;
}

