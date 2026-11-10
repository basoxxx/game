// Dynasty layer: long-term goal loop on top of the season engine.
//  - Team status tiers (prestige) that unlock facilities, sponsors and investors
//  - Board mandate + multi-season plan, board meetings with promises
//  - Rival team principals with personalities, relations and paddock decisions
//  - Paddock press (headlines with art), season log for charts
//  - Sponsor objectives for every race, sponsor satisfaction and renewals
//  - Investors, liquidity crisis and administration
//  - Youth academy (prospects, development, promotion)
//  - Staff traits
import { TEAMS } from '../data/teams.js';
import { rand, randInt, pick, clamp, chance, shuffle, uid, gauss } from './rng.js';
import { cat, playerTeam, teamDrivers, addMail, addNews, addFinance, fmtM, standings, overallCarRanking, partName, unlock, seatsPerTeam, signDriver, releaseDriver } from './season.js';
import { getTrack, generateRookie, salaryFor, driverOverall, avgPart } from './world.js';
import { gainXP } from './progress.js';
import { physicsLap } from './trackphys.js';
import { ensureDepth, depthMaybeDecision, depthDecisionView, depthResolveDecision } from './depth.js';
import { storyMaybeDecision, storyView, storyResolve, autoHandle, noteModal, modalLoad, commit } from './career5.js';

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const scale = (st) => cat(st).budgetScale;
const lastName = (n) => String(n || '').split(' ').slice(-1)[0];

// =====================================================================================
// STATE
// =====================================================================================
export function ensureDynasty(st, opts = {}) {
  if (!st || st.quick) return st?.dyn;
  const D = (st.dyn ??= {});
  D.v ??= 1;
  D.mandate ??= 'growth';
  D.principals ??= {};
  D.log ??= [];
  D.press ??= [];
  D.promises ??= [];
  D.boardDone ??= {};
  D.red ??= 0;
  D.inv ??= {};
  D.prospects ??= null;
  D.goals ??= null;
  D.bet ??= null;
  D.pressure ??= 0;
  D.statusMax ??= statusIdx(st);
  D.stats ??= { goalsHit: 0, goalsTot: 0, betsWon: 0, betsLost: 0, promisesKept: 0, promisesBroken: 0, promoted: 0 };
  D.seasonStats0 ??= { ...D.stats };
  const order = Object.values(st.teams).slice().sort((a, b) => hash(a.id + a.principal) - hash(b.id + b.principal));
  const off = hash(st.category + (st.playerName || '')) % TP_KEYS.length;
  order.forEach((t, i) => {
    t.facilities.hospitality ??= clamp(Math.round((t.facilities.factory + t.facilities.academy) / 2), 1, 5);
    if (!t.isPlayer && !D.principals[t.id]) D.principals[t.id] = makePrincipal(st, t, TP_KEYS[(i + off) % TP_KEYS.length]);
  });
  for (const s of Object.values(st.staff)) if (!s.trait) s.trait = staffTraitFor(s.role, hash(s.id + s.name));
  for (const sp of playerTeam(st).sponsors) sp.sat ??= 60;
  // repair salaries broken by older versions (drivers rated under 60 got NaN)
  for (const d of Object.values(st.drivers)) if (!Number.isFinite(d.salary)) d.salary = salaryFor(d, st.category);
  if (!Number.isFinite(playerTeam(st).money)) playerTeam(st).money = +(playerTeam(st).baseBudget * 0.3).toFixed(1);
  for (const f of st.finance || []) if (!Number.isFinite(f.amount)) f.amount = 0;
  investState(playerTeam(st));
  if (!D.plan) D.plan = makePlan(st, D.mandate);
  if (opts.goals !== false) {
    if (!D.goals || D.goals.season !== st.season || D.goals.round !== st.round) makeRaceGoals(st);
    else syncRaceGoals(st);
  }
  if (!D.prospects || D.prospects.season !== st.season) makeProspects(st);
  try { ensureDepth(st); } catch (e) { console.warn('depth', e); }
  return D;
}

// =====================================================================================
// STATUS TIERS
// =====================================================================================
export const STATUS = [
  { name: 'Fanalino di coda', min: -1, color: '#8a93a3', perks: ['Strutture fino al livello 3', 'Sponsor locali e fornitori'], icon: 'shield' },
  { name: 'Centro gruppo', min: 0.2, color: '#3aa0ff', perks: ['Strutture fino al livello 4', 'Più proposte di sponsorizzazione'], icon: 'chart' },
  { name: 'Outsider', min: 0.45, color: '#22d37a', perks: ['Più title sponsor sul tavolo', 'I piloti forti ti ascoltano'], icon: 'speed' },
  { name: 'Contendente', min: 0.68, color: '#ffb020', perks: ['Strutture al livello 5', 'Investitori internazionali', 'Offerte sponsor +8%'], icon: 'flame' },
  { name: 'Top Team', min: 0.88, color: '#ff4f4f', perks: ['Diritti commerciali +8%', 'Offerte sponsor +12%'], icon: 'trophy' },
  { name: 'Dinastia', min: 9, color: '#ffd84a', perks: ['Leggenda del paddock: tutto il mondo ti guarda'], icon: 'star' },
];
function repRange(catId) { const r = TEAMS[catId].map((t) => t.rep); return [Math.min(...r), Math.max(...r)]; }
export function repSpan(st) { const [lo, hi] = repRange(st.category); return hi - lo; }
export function prestige(st, team = playerTeam(st)) { const [lo, hi] = repRange(st.category); return (team.rep - lo) / Math.max(1, hi - lo); }
function recentTitles(st) { return (st.career?.trophies || []).filter((t) => t.type === 'Costruttori' && t.category === st.category && t.season >= st.season - 4).length; }
export function statusIdx(st, team = playerTeam(st)) {
  const p = prestige(st, team);
  let i = 0; for (let k = 0; k < 5; k++) if (p >= STATUS[k].min) i = k;
  if (i === 4 && team.isPlayer && recentTitles(st) >= 2) i = 5;
  return i;
}
export function statusInfo(st) {
  const i = statusIdx(st); const p = prestige(st);
  const next = i < 4 ? STATUS[i + 1] : i === 4 ? STATUS[5] : null;
  const prog = i < 4 ? clamp((p - Math.max(0, STATUS[i].min)) / (STATUS[i + 1].min - Math.max(0, STATUS[i].min)), 0, 1) : i === 4 ? clamp(recentTitles(st) / 2, 0, 1) : 1;
  const [lo, hi] = repRange(st.category);
  const repFor = (k) => Math.round(lo + STATUS[k].min * (hi - lo));
  return { idx: i, ...STATUS[i], next, prog, nextNeed: i < 4 ? `Prestigio ${repFor(i + 1)}` : i === 4 ? '2 titoli costruttori in 4 stagioni' : null, rep: Math.round(playerTeam(st).rep) };
}
export function facilityCap(st) { const i = statusIdx(st); return i <= 0 ? 3 : i <= 2 ? 4 : 5; }

// =====================================================================================
// MANDATE & LONG-TERM PLAN
// =====================================================================================
export const MANDATES = {
  rebuild: { name: 'Ricostruzione', short: 'Pazienza', desc: 'Il consiglio sa che ci vuole tempo: obiettivi più morbidi per due stagioni, ma il piano chiede di diventare grandi.', budget: 1, ease: 1, easeSeasons: 2, conf: 0.6 },
  growth: { name: 'Crescita costante', short: 'Equilibrio', desc: 'Un passo alla volta: ogni stagione un gradino più in alto.', budget: 1, ease: 0, easeSeasons: 0, conf: 1 },
  win: { name: 'Vincere subito', short: 'Ambizione', desc: 'Budget extra del 15% oggi, ma il consiglio vuole trofei in fretta e perdona poco.', budget: 1.15, ease: -1, easeSeasons: 99, conf: 1.25 },
};
function planStep(st, season, kind, val) {
  const text = kind === 'status' ? `Raggiungi lo status «${STATUS[val].name}»` : kind === 'title' ? 'Vinci il titolo costruttori' : kind === 'pos' ? `Chiudi ${val === 1 ? 'primo' : `nei primi ${val}`} tra i costruttori` : '';
  return { season, kind, val, text, done: null };
}
export function makePlan(st, mandate, from = st.season) {
  const s0 = statusIdx(st);
  const steps = [];
  const stat = (dy, plus) => steps.push(s0 + plus <= 4 ? planStep(st, from + dy, 'status', Math.min(4, s0 + plus)) : planStep(st, from + dy, 'pos', Math.max(1, 3 - (s0 + plus - 5))));
  const n = Object.keys(st.teams).length;
  const tgt = clamp(st.board?.target || Math.ceil(n / 2), 1, n);
  if (mandate === 'rebuild') { steps.push(planStep(st, from, 'pos', clamp(tgt + 1, 1, n))); stat(2, 1); stat(4, 2); }
  else if (mandate === 'win') { steps.push(planStep(st, from, 'pos', Math.max(1, tgt - 1))); steps.push(planStep(st, from + 1, s0 >= 3 ? 'title' : 'pos', s0 >= 3 ? 1 : 3)); steps.push(planStep(st, from + 2, 'title', 1)); }
  else { steps.push(planStep(st, from, 'pos', tgt)); stat(1, 1); stat(3, 2); }
  for (const s of steps) if (s.kind === 'pos' && s.val === 1) s.kind = 'title';
  return { from, mandate, steps };
}
function evalPlan(st, sum) {
  const D = st.dyn; const pt = playerTeam(st);
  const M = MANDATES[D.mandate] || MANDATES.growth;
  for (const s of D.plan.steps) {
    if (s.done !== null || s.season !== st.season) continue;
    const ok = s.kind === 'status' ? statusIdx(st) >= s.val : s.kind === 'title' ? sum.st.teams[0].id === pt.id : sum.teamPos <= s.val;
    s.done = ok;
    if (ok) {
      pt.baseBudget = +(pt.baseBudget * 1.08).toFixed(2);
      st.board.confidence = clamp(st.board.confidence + 12, 0, 100);
      gainXP(st, 250, 'Piano del consiglio');
      addMail(st, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'good', subject: `Piano rispettato: ${s.text}`, body: `Il consiglio è entusiasta: la tappa ${s.season} del piano «${M.name}» è stata raggiunta.\n\nPremio: budget strutturale +8% dalla prossima stagione, fiducia +12.` });
      press(st, { kind: 'team', tone: 'good', h: `${pt.name}, il piano funziona`, t: `${s.text}: il consiglio premia il Team Principal ${st.playerName} con un aumento del budget.`, img: { k: 'team', id: pt.id }, tag: 'Consiglio' });
    } else {
      st.board.confidence = clamp(st.board.confidence - Math.round(10 * M.conf), 0, 100);
      addMail(st, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'bad', subject: `Piano mancato: ${s.text}`, body: `La tappa ${s.season} del piano «${M.name}» non è stata raggiunta. Fiducia -${Math.round(10 * M.conf)}. Il consiglio vuole vedere una reazione.` });
    }
  }
  if (D.plan.steps.every((s) => s.done !== null)) {
    const kept = D.plan.steps.filter((s) => s.done).length;
    if (kept === D.plan.steps.length) unlock(st, 'plan_done', 'Visionario', 'Completa tutte le tappe di un piano del consiglio.');
    D.plan = makePlan(st, D.mandate === 'rebuild' ? 'growth' : D.mandate, st.season + 1);
    addMail(st, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'info', subject: 'Nuovo piano pluriennale', body: `Il ciclo precedente si è chiuso (${kept}/${D.plan.steps.length} tappe). Ecco il nuovo piano:\n\n${D.plan.steps.map((s) => `• ${s.season}: ${s.text}`).join('\n')}` });
  }
}

// =====================================================================================
// TEAM PRINCIPALS
// =====================================================================================
export const TP_PERSONAS = {
  squalo: { name: 'Lo Squalo', desc: 'Aggressivo e spietato: provoca, prova a rubarti lo staff, non perdona.', color: '#ff4f4f' },
  volpe: { name: 'La Volpe', desc: 'Politico raffinato: reclami, lobby e alleanze di convenienza.', color: '#ff8a00' },
  gentiluomo: { name: 'Il Gentiluomo', desc: 'Corretto e rispettoso: stima chi vince in modo pulito.', color: '#3ddc84' },
  showman: { name: 'Lo Showman', desc: 'Ama le telecamere: sfide, scommesse e battute taglienti.', color: '#c06bff' },
  professore: { name: 'Il Professore', desc: 'Ingegnere fino al midollo: parla solo di dati e galleria del vento.', color: '#3aa0ff' },
};
const TP_KEYS = Object.keys(TP_PERSONAS);
function makePrincipal(st, t, persona) {
  const h = hash(t.id + (t.principal || ''));
  return { persona: persona || TP_KEYS[h % TP_KEYS.length], rel: ((h >> 4) % 21) - 10, name: t.principal || 'Team Principal', quote: null, met: 0 };
}
export function principal(st, teamId) { return st.dyn?.principals?.[teamId] || null; }
export function relLabel(r) { return r >= 45 ? 'Alleato' : r >= 15 ? 'Cordiale' : r > -15 ? 'Neutrale' : r > -45 ? 'Ostile' : 'Nemico giurato'; }
export function relColor(r) { return r >= 45 ? '#22d37a' : r >= 15 ? '#7ad3a0' : r > -15 ? '#9aa3b2' : r > -45 ? '#ff8a00' : '#ff3b3b'; }
function rel(st, teamId, v) { const p = principal(st, teamId); if (p) p.rel = clamp(Math.round(p.rel + v), -100, 100); }
export function adjustRel(st, teamId, v) { rel(st, teamId, v); }
// Market moves against a rival team sour the relationship (called by signings and staff raids)
export function principalReact(st, teamId, kind, who) {
  if (st.quick || !st.dyn) return;
  const p = principal(st, teamId); const t = st.teams[teamId]; if (!p || !t) return;
  const hit = { squalo: -16, volpe: -12, gentiluomo: -5, showman: -8, professore: -9 }[p.persona] ?? -8;
  rel(st, teamId, hit);
  const lines = {
    squalo: [`«Ci hanno rubato ${who}? Bene. Adesso è guerra.»`, `«${playerTeam(st).name} ha fatto la sua mossa. Io farò la mia.»`],
    volpe: [`«Verificheremo ogni clausola del contratto di ${who}. Ogni singola virgola.»`, '«Interessante operazione. I nostri avvocati la trovano… molto interessante.»'],
    gentiluomo: [`«${who} merita una grande occasione. Gli auguro il meglio, anche se mi mancherà.»`, '«È il mercato. Nessun rancore.»'],
    showman: [`«${who}? Glielo lascio volentieri. Ho già in mente un nome che vi farà cadere dalla sedia.»`, '«Ottimo, così sui giornali parleranno ancora di noi.»'],
    professore: [`«Perdere ${who} rallenterà il programma di due settimane. Le abbiamo già recuperate.»`, '«Il dato rilevante non è chi va via. È chi resta.»'],
  }[p.persona];
  const text = pick(lines);
  p.quote = { text, s: st.season, r: Math.max(0, st.round - 1) };
  press(st, { kind: 'quote', tone: 'bad', h: `${p.name} reagisce: ${kind === 'staff' ? 'raid sullo staff' : 'colpo di mercato'} di ${playerTeam(st).name}`, t: '', q: { team: teamId, text }, img: { k: 'team', id: teamId }, tag: 'Mercato' });
}

const QUOTES = {
  squalo: {
    beat: ['«{me}? Li ho visti solo nei miei specchietti. E nemmeno tanto.»', '«Oggi abbiamo dato una lezione. Se {me} vuole ripetizioni, sa dove trovarci.»', '«Il paddock è un oceano. Noi siamo quelli con i denti.»'],
    lost: ['«{me} ha avuto fortuna. La fortuna finisce, noi no.»', '«Godetevela finché dura. Ci rivediamo alla prossima.»', '«Non mi interessa chi ci ha battuto oggi. Mi interessa chi resterà in piedi a dicembre.»'],
  },
  volpe: {
    beat: ['«Un risultato meritato. Certo, se altri rispettassero le regole come noi…»', '«Abbiamo letto il regolamento con attenzione. Forse qualcuno dovrebbe fare lo stesso.»', '«Vincere è bello. Vincere senza zone grigie è ancora meglio, vero {me}?»'],
    lost: ['«Faremo qualche domanda alla Federazione sulla vettura di {me}. Pura curiosità.»', '«Complimenti a {me}. Studieremo con interesse le loro soluzioni… molto da vicino.»', '«Non commento i risultati degli altri. Commento i regolamenti.»'],
  },
  gentiluomo: {
    beat: ['«Una bella giornata per noi, ma rispetto enorme per il lavoro di {me}.»', '«Abbiamo vinto il duello, ma {me} sta crescendo: dovremo stare attenti.»', '«Lotta dura e pulita. È questo che il pubblico vuole vedere.»'],
    lost: ['«Chapeau a {me}. Oggi erano più veloci, punto.»', '«Hanno fatto un lavoro straordinario. Torneremo in fabbrica a imparare.»', '«Quando perdi contro una squadra come {me}, stringi la mano e riparti.»'],
  },
  showman: {
    beat: ['«Ditelo a {me}: offro io il caffè. Decaffeinato, così si calmano.»', '«Avete visto? Spettacolo! E il prossimo weekend sarà ancora meglio.»', '«Se {me} vuole una rivincita, organizziamo una diretta. Faremo il record di ascolti.»'],
    lost: ['«Oggi lo show l’ha fatto {me}. Mi devo preoccupare? Sì. Lo ammetterò mai? No.»', '«Va bene, applausi a {me}. Ma vi avverto: torneremo con i fuochi d’artificio.»', '«Perdere contro {me}? Almeno abbiamo fatto audience.»'],
  },
  professore: {
    beat: ['«I dati di galleria erano corretti. Il resto è statistica.»', '«Il nostro fondo lavora meglio di quello di {me} nelle curve lente. Semplice fisica.»', '«Nessuna sorpresa: il modello prevedeva un vantaggio di due decimi.»'],
    lost: ['«Il pacchetto di {me} è efficiente. Molto efficiente. Lo stiamo già studiando.»', '«C’è una discrepanza tra simulazione e pista. La risolveremo.»', '«Interessante. {me} ha trovato carico dove noi non lo cercavamo.»'],
  },
};
function quote(st, teamId, kind) {
  const p = principal(st, teamId); if (!p) return null;
  const pool = QUOTES[p.persona][kind];
  return pick(pool).replaceAll('{me}', playerTeam(st).name);
}

// =====================================================================================
// PRESS
// =====================================================================================
export function press(st, item) {
  const D = st.dyn; if (!D) return;
  D.press.unshift({ id: uid('pr'), s: st.season, r: D._pressRound ?? st.round - 1, tone: 'info', ...item });
  if (D.press.length > 90) D.press.length = 90;
}
export function pressIssues(st) {
  const by = new Map();
  for (const p of st.dyn?.press || []) { const k = `${p.s}:${p.r}`; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  return [...by.entries()].map(([k, items]) => { const [s, r] = k.split(':').map(Number); return { key: k, s, r, items }; });
}
// Italian article for an event name: "il GP di Monaco", "la 24 Ore", "il Rally di Svezia"
const evArt = (tr) => (/^\d+ Ore/.test(tr) ? 'la ' : /^(Rallye|Safari)/.test(tr) ? 'il ' : /^(GP|Rally|Gran)/.test(tr) ? 'il ' : '');
const LEAD = [
  (w, tr, tm, pl) => `${w} ${pl ? 'conquistano' : 'conquista'} ${evArt(tr)}${tr}`, (w, tr, tm, pl) => `${tm}, che giornata: ${w} ${pl ? 'dominano' : 'domina'} ${evArt(tr)}${tr}`, (w, tr) => `${tr}: parla solo ${w}`,
  (w, tr) => `Firma d’autore di ${w}: ${evArt(tr)}${tr} è suo`, (w, tr, tm, pl) => `${w} non ${pl ? 'sbagliano' : 'sbaglia'}: festa ${tm}`,
];

// =====================================================================================
// SPONSOR RACE OBJECTIVES
// =====================================================================================
// Team strength = car (lap time over a sample of this season's circuits) x its two best drivers.
let _sr = { key: '', list: [] };
export function strengthRanking(st) {
  const key = `${st.season}:${st.round}:${st.playerTeam}:${Object.values(st.teams).map((t) => t.drivers.join('')).join('|').length}:${Object.values(st.teams).reduce((a, t) => a + avgPart(t), 0).toFixed(2)}`;
  if (_sr.key === key) return _sr.list;
  const teams = Object.values(st.teams);
  const drv = (t) => { const ds = teamDrivers(st, t).map((d) => d.attrs.pace).sort((a, b) => b - a).slice(0, 2); return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 70; };
  let carF;
  if (st.category === 'rally') carF = (t) => 1 - (avgPart(t) - 85) * 0.004;
  else {
    const seen = new Set(); const tracks = [];
    for (const e of st.calendar) { if (tracks.length >= 4) break; if (seen.has(e.trackId)) continue; seen.add(e.trackId); const tr = getTrack(st.category, e.trackId); if (tr?.cid) tracks.push(tr); }
    carF = (t) => { if (!tracks.length) return 1 - (avgPart(t) - 85) * 0.004; let s = 0; for (const tr of tracks) s += physicsLap(st.category, tr, t.car.parts) / (tr.lap || 90); return s / tracks.length; };
  }
  const score = new Map(teams.map((t) => [t.id, carF(t) * (1 - (drv(t) - 80) * 0.00048 * (st.category === 'rally' ? 2.2 : 1))]));
  const list = teams.slice().sort((a, b) => score.get(a.id) - score.get(b.id)).map((t) => t.id);
  _sr = { key, list };
  return list;
}
export function expectedRank(st, team = playerTeam(st)) {
  try { return strengthRanking(st).indexOf(team.id) + 1; } catch { return overallCarRanking(st).indexOf(team.id) + 1; }
}
const GOAL_TEXT = {
  top: (g) => `Una vettura nei primi ${g.n}`,
  both: (g) => `Entrambe le vetture nei primi ${g.n}`,
  gain: (g) => `Guadagna ${g.n} posizioni in gara`,
  beat: (g, st) => `Arriva davanti a ${st.teams[g.team]?.name || 'il rivale'}`,
  finish: () => 'Entrambe le vetture al traguardo',
  fastest: () => 'Giro più veloce della gara',
  quali: (g) => `Parti dai primi ${g.n} in griglia`,
};
export function goalText(st, g) { return GOAL_TEXT[g.kind]?.(g, st) || ''; }
function goalCtx(st) {
  const pt = playerTeam(st);
  const nTeams = Object.keys(st.teams).length;
  const cars = cat(st).cars;
  const rank = expectedRank(st);
  const ranking = strengthRanking(st);
  return { pt, cars, rally: st.category === 'rally', expBest: Math.max(1, Math.round(1 + (rank - 1) * cars * 0.8)), above: st.teams[ranking[Math.max(0, rank - 2)]], below: st.teams[ranking[Math.min(nTeams - 1, rank)]] };
}
function goalFor(st, sp, used, c) {
  let opts;
  if (sp.tier >= 3) opts = ['top', 'beat', c.rally ? 'top' : 'fastest', 'both'];
  else if (sp.tier === 2) opts = ['top', 'beat', c.rally ? 'both' : 'quali', 'both'];
  else opts = ['finish', 'both', c.rally ? 'top' : 'gain', 'beat'];
  opts = shuffle(opts).filter((k) => !used.has(k));
  let kind = opts[0] || 'finish';
  if (kind === 'fastest' && c.expBest > 4) kind = 'top';
  used.add(kind);
  const g = { sp: sp.id, name: sp.name, tier: sp.tier, kind, n: 0, team: null };
  let hard = 1;
  if (kind === 'top') { const tough = sp.tier >= 3 ? 0 : randInt(1, 2); g.n = clamp(c.expBest + tough, 1, 20); hard = 1.15 - tough * 0.15; }
  if (kind === 'both') { g.n = clamp(c.expBest + c.cars + randInt(1, 3), 2, 20); hard = 1; }
  if (kind === 'gain') { g.n = randInt(2, 4); hard = 0.9; }
  if (kind === 'quali') { g.n = clamp(c.expBest + randInt(0, 2), 1, 20); hard = 1; }
  if (kind === 'beat') { const tgt = sp.tier >= 2 && c.above && c.above.id !== c.pt.id ? c.above : c.below && c.below.id !== c.pt.id ? c.below : c.above; g.team = tgt?.id; hard = tgt === c.above ? 1.3 : 0.8; }
  if (kind === 'finish') hard = 0.7;
  if (kind === 'fastest') hard = 1.6;
  g.reward = +(sp.perRace * (0.3 + hard * 0.32)).toFixed(2);
  g.text = goalText(st, g);
  return g;
}
export function makeRaceGoals(st) {
  const D = st.dyn; const pt = playerTeam(st);
  D.goals = { season: st.season, round: st.round, list: [] };
  if (st.round >= st.calendar.length) return;
  const c = goalCtx(st); const used = new Set();
  for (const sp of pt.sponsors) D.goals.list.push(goalFor(st, sp, used, c));
}
// keep goals in sync when sponsors are signed or leave between two events
export function syncRaceGoals(st) {
  const D = st.dyn; if (!D?.goals) return;
  const pt = playerTeam(st);
  D.goals.list = D.goals.list.filter((g) => pt.sponsors.some((sp) => sp.id === g.sp));
  const used = new Set(D.goals.list.map((g) => g.kind));
  const c = st.round < st.calendar.length ? goalCtx(st) : null;
  if (c) for (const sp of pt.sponsors) if (!D.goals.list.some((g) => g.sp === sp.id)) D.goals.list.push(goalFor(st, sp, used, c));
}
function evalGoal(st, g, res) {
  const pt = playerTeam(st);
  const mine = res.classification.filter((r) => r.teamId === pt.id);
  const ok = (r) => r.status !== 'dnf';
  const best = Math.min(99, ...mine.filter(ok).map((r) => r.pos));
  switch (g.kind) {
    case 'top': return best <= g.n;
    case 'both': return mine.length >= 2 && mine.every((r) => ok(r) && r.pos <= g.n);
    case 'gain': return mine.some((r) => ok(r) && r.grid && r.grid - r.pos >= g.n);
    case 'quali': return mine.some((r) => r.grid && r.grid <= g.n);
    case 'finish': return mine.length > 0 && mine.every(ok);
    case 'fastest': return !!res.fastest && mine.some((r) => r.key === res.fastest.key);
    case 'beat': { const theirs = res.classification.filter((r) => r.teamId === g.team); const tb = Math.min(99, ...theirs.filter(ok).map((r) => r.pos)); return best < tb; }
    default: return false;
  }
}

// =====================================================================================
// STAFF TRAITS
// =====================================================================================
export const STAFF_TRAITS = {
  td: [
    { id: 'aero', name: 'Mago del vento', desc: 'Progetti R&D su Aerodinamica, Telaio e Sospensioni +15%.' },
    { id: 'motor', name: 'Motorista', desc: 'Progetti R&D su Motore, Trasmissione e Consumi +15%.' },
    { id: 'prudent', name: 'Prudente', desc: 'Rischio di fallimento dei progetti R&D dimezzato.' },
    { id: 'visionary', name: 'Visionario', desc: 'Progetti per la vettura dell’anno dopo +20%.' },
  ],
  engineer: [
    { id: 'mentor', name: 'Mentore', desc: 'Sessioni al simulatore più efficaci (+15% di riuscita).' },
    { id: 'psych', name: 'Psicologo', desc: 'Il morale dei piloti sale di 1 punto a ogni evento.' },
    { id: 'coach', name: 'Talent coach', desc: 'I giovani dell’accademia crescono il 40% più in fretta.' },
  ],
  mechanic: [
    { id: 'reliab', name: 'Maniaco dell’affidabilità', desc: 'Affidabilità +0,1 a ogni evento.' },
    { id: 'saver', name: 'Risparmiatore', desc: 'Costi di riparazione dei danni -30%.' },
    { id: 'builder', name: 'Capocantiere', desc: 'I cantieri delle strutture finiscono un evento prima.' },
  ],
};
export function staffTraitFor(role, seed = Math.floor(Math.random() * 1e6)) { const l = STAFF_TRAITS[role] || []; return l.length ? l[seed % l.length].id : null; }
export function traitInfo(role, id) { return (STAFF_TRAITS[role] || []).find((t) => t.id === id) || null; }
export function teamTrait(st, team, role, id) { const s = st.staff?.[team.staff?.[role]]; return !!s && s.trait === id; }

// =====================================================================================
// ACADEMY
// =====================================================================================
export function academySlots(team) { return 1 + Math.floor((team.facilities.academy || 1) / 2) + ((team.facilities.academy || 1) >= 4 ? 1 : 0) + (team.invest?.juniorActive ? 1 : 0); }
export function academyDrivers(st) { return Object.values(st.drivers).filter((d) => d.academy === st.playerTeam && !d.retired); }
export function prospectFee(st, d) { return +((0.25 + (d.pot - 75) * 0.03) * scale(st) * 3).toFixed(2); }
export function academyUpkeep(st) { return +(academyDrivers(st).length * 0.08 * scale(st) * 3).toFixed(2); }
function makeProspect(st, boost = 0) {
  const pt = playerTeam(st);
  const lvl = pt.facilities.academy || 1;
  const d = generateRookie(st.category, 0.6);
  d.age = randInt(15, 17);
  const drop = randInt(7, 12) - Math.round(boost / 2);
  for (const k of Object.keys(d.attrs)) d.attrs[k] = clamp(d.attrs[k] - drop, 40, 80);
  d.attrs.exp = randInt(2, 12);
  d.pot = clamp(Math.round(rand(76, 90) + lvl * 1.4 + boost + (chance(0.15) ? 5 : 0)), 70, 99);
  d.prospect = true;
  return d;
}
// A wonderkid knocks on the door (paddock event): straight onto the scouts' list
export function addProspect(st, boost = 6) {
  const D = ensureDynasty(st);
  const d = makeProspect(st, boost);
  D.prospects.list.unshift(d);
  return d;
}
function makeProspects(st) {
  st.dyn.prospects = { season: st.season, list: [0, 1, 2].map(() => makeProspect(st)) };
}
export function scoutedPot(st, d) {
  const lvl = playerTeam(st).facilities.academy || 1;
  if (lvl >= 4 || st.career?.perks?.includes('scout')) return { lo: d.pot, hi: d.pot };
  const w = lvl >= 3 ? 3 : lvl >= 2 ? 6 : 9;
  const c = d.pot + ((hash(d.id) % (w + 1)) - w / 2);
  return { lo: Math.round(clamp(c - w / 2, 60, 99)), hi: Math.round(clamp(c + w / 2, 60, 99)) };
}
export function signProspect(st, id) {
  const D = ensureDynasty(st); const pt = playerTeam(st);
  const d = D.prospects?.list.find((x) => x.id === id);
  if (!d) return { ok: false, msg: 'Prospetto non disponibile.' };
  if (academyDrivers(st).length >= academySlots(pt)) return { ok: false, msg: 'Accademia piena: potenzia la struttura o libera un posto.' };
  const fee = prospectFee(st, d);
  if (pt.money < fee) return { ok: false, msg: 'Fondi insufficienti.' };
  addFinance(st, `Accademia: borsa di studio ${d.name}`, -fee);
  D.prospects.list = D.prospects.list.filter((x) => x !== d);
  delete d.prospect;
  d.academy = pt.id; d.teamId = null; d.salary = 0; d.contract = 0; d.morale = 80; d.joinedTeam = pt.id; d.joinedAge = d.age;
  d.feeder = [];
  st.drivers[d.id] = d;
  addNews(st, `${pt.name} accoglie in accademia il ${d.age}enne ${d.name}.`);
  unlock(st, 'academy_sign', 'Talent scout', 'Porta un giovane nella tua accademia.');
  return { ok: true };
}
export function releaseJunior(st, id) {
  const d = st.drivers[id]; if (!d || d.academy !== st.playerTeam || d.loan) return;
  d.academy = null; d.salary = salaryFor(d, st.category);
}
export function promoteJunior(st, id, replaceId) {
  const d = st.drivers[id]; const pt = playerTeam(st);
  if (!d || d.academy !== pt.id) return { ok: false, msg: 'Pilota non disponibile.' };
  if (d.loan) return { ok: false, msg: 'È in prestito fino a fine stagione: potrai promuoverlo quando rientra.' };
  const free = seatsPerTeam(st) - teamDrivers(st, pt).length;
  if (replaceId && !pt.drivers.includes(replaceId)) replaceId = null;
  if (free <= 0 && !replaceId) return { ok: false, msg: 'Scegli quale titolare sostituire.' };
  const sal = +(salaryFor(d, st.category) * 0.65).toFixed(2);
  d.academy = null;
  const r = signDriver(st, d.id, sal, 3, free > 0 ? null : replaceId, true);
  if (!r.ok) { d.academy = pt.id; return r; }
  d.homegrown = pt.id; d.morale = 92; d.joinedAge = d.joinedAge ?? d.age;
  st.dyn.stats.promoted++;
  press(st, { kind: 'team', tone: 'good', h: `${lastName(d.name)} promosso: il sogno diventa realtà`, t: `${pt.name} lancia in prima squadra il prodotto della sua accademia ${d.name}, ${d.age} anni. Contratto triennale.`, img: { k: 'driver', id: d.id }, tag: 'Accademia' });
  unlock(st, 'academy_grad', 'Fatto in casa', 'Promuovi un pilota dell’accademia in prima squadra.');
  return { ok: true };
}
function academySeason(st) {
  const pt = playerTeam(st);
  const lvl = pt.facilities.academy || 1;
  const coach = (teamTrait(st, pt, 'engineer', 'coach') ? 1.4 : 1) * (pt.invest?.juniorActive ? 1.35 : 1) * (satelliteSeat(pt) ? 1.2 : 1);
  for (const d of academyDrivers(st)) {
    // extra growth on top of developDriver (already applied in newSeason)
    const ov = driverOverall(d, st.category);
    const g = Math.max(0, (d.pot - ov) * 0.09 * (0.6 + lvl * 0.2) * coach);
    for (const k of ['pace', 'cons', 'race', 'wet', 'tyre']) d.attrs[k] = clamp(Math.round(d.attrs[k] + g * rand(0.6, 1.3)), 30, 99);
    if (d.age >= 24) {
      d.academy = null; d.salary = salaryFor(d, st.category);
      addMail(st, { from: 'Accademia', icon: 'star', type: 'info', subject: `${d.name} lascia l’accademia`, body: `A ${d.age} anni ${d.name} non può più restare nel programma giovani ed è ora un pilota svincolato. Puoi ancora ingaggiarlo dal Mercato.` });
    }
  }
}
function feederResults(st) {
  const out = [];
  for (const d of academyDrivers(st)) {
    if (d.loanSeason === st.season) continue; // spent the year on loan in the main series
    const ov = driverOverall(d, st.category);
    const pos = clamp(Math.round(gauss(14 - (ov - 62) * 0.55 - (d.morale - 70) * 0.03 - (satelliteSeat(playerTeam(st)) ? 1.5 : 0) - (playerTeam(st).invest?.juniorActive ? 1 : 0), 2.6)), 1, 20);
    (d.feeder ||= []).push({ season: st.season, pos });
    if (pos === 1) {
      d.pot = clamp(d.pot + randInt(1, 3), 0, 99);
      press(st, { kind: 'brief', tone: 'good', h: `${d.name} campione nella Formula Regionale`, t: `Il pupillo dell’accademia ${playerTeam(st).name} vince il titolo junior a ${d.age} anni.`, img: { k: 'driver', id: d.id }, tag: 'Accademia' });
      unlock(st, 'feeder_champ', 'Vivaio d’oro', 'Un tuo junior vince il campionato delle serie minori.');
    }
    addMail(st, { from: 'Accademia', icon: 'star', type: pos <= 3 ? 'good' : 'info', subject: `Stagione junior: ${d.name} ${pos}°`, body: `${d.name} chiude la stagione nelle serie minori al ${pos}° posto (OVR attuale ${ov}).${pos <= 3 ? ' Un risultato che fa parlare il paddock.' : ''}` });
    out.push({ id: d.id, name: d.name, pos, ov, age: d.age });
  }
  return out;
}

// =====================================================================================
// BOARD MEETINGS & PROMISES
// =====================================================================================
function boardOptions(st, phase) {
  const pt = playerTeam(st); const sc = scale(st);
  const n = st.calendar.length;
  const s = standings(st);
  const myPos = s.teams.findIndex((x) => x.id === pt.id) + 1;
  const rank = expectedRank(st);
  const ranking = s.teams.map((x) => x.id);
  const opts = [];
  const deadline = Math.min(n - 1, st.round + Math.max(3, Math.round(n * 0.35)));
  const podiums = st.calendar.some((e) => e.results?.classification.some((r) => r.teamId === pt.id && r.pos <= 3 && r.status !== 'dnf'));
  if (rank <= 6 && !podiums) opts.push({ id: 'podium', t: `Un podio entro il round ${deadline + 1}`, note: 'Fiducia +5 subito · mantenuta: +12 e premio · tradita: -14', until: deadline });
  const tgtTeam = phase === 'pre' ? strengthRanking(st)[Math.max(0, rank - 2)] : ranking[Math.max(0, myPos - 2)];
  if (tgtTeam && tgtTeam !== pt.id) opts.push({ id: 'beat', team: tgtTeam, t: `Chiuderemo davanti a ${st.teams[tgtTeam].name}`, note: 'Fiducia +4 subito · a fine anno: +10 e premio, oppure -10', until: n - 1 });
  const myPts = s.teams.find((x) => x.id === pt.id)?.pts || 0;
  const pace = phase === 'pre' ? Math.max(4, (11 - rank) * 2.2) : myPts / Math.max(1, st.round);
  const need = Math.max(3, Math.round(pace * (deadline - st.round + 1) * 1.15));
  opts.push({ id: 'points', need, start: myPts, t: `Almeno ${need} punti entro il round ${deadline + 1}`, note: 'Fiducia +3 subito · mantenuta: +9 · tradita: -10', until: deadline });
  opts.push({ id: 'profit', start: pt.money, t: 'Chiuderemo la stagione con più liquidità di oggi', note: 'Fiducia +3 subito · a fine anno: +8, oppure -8', until: n - 1 });
  opts.push({ id: 'budget', amount: +(pt.baseBudget * 0.07).toFixed(1), t: `Chiedo ${fmtM(pt.baseBudget * 0.07)} di budget extra`, note: 'Soldi subito, ma l’obiettivo stagionale sale di una posizione e la fiducia cala di 4' });
  const pick3 = shuffle(opts.filter((o) => o.id !== 'budget')).slice(0, 2);
  return [...pick3, opts.find((o) => o.id === 'budget'), { id: 'none', t: 'Nessuna promessa: parlano i risultati', note: 'Fiducia -2: il consiglio voleva garanzie' }];
}
function boardMood(st) {
  const c = st.board.confidence;
  return c >= 75 ? 'Il consiglio è entusiasta e ti ascolta con attenzione.' : c >= 50 ? 'Il clima è sereno, ma gli azionisti vogliono garanzie.' : c >= 30 ? 'Facce tese intorno al tavolo: serve una svolta.' : 'Il presidente non ti guarda nemmeno. La tua poltrona traballa.';
}
function resolveBoard(st, opt) {
  const D = st.dyn; const pt = playerTeam(st);
  const conf = (v) => (st.board.confidence = clamp(st.board.confidence + v, 0, 100));
  const p = { ...opt, season: st.season, made: st.round };
  if (opt.id === 'podium') { conf(5); D.promises.push(p); }
  if (opt.id === 'beat') { conf(4); D.promises.push(p); }
  if (opt.id === 'points') { conf(3); D.promises.push(p); }
  if (opt.id === 'profit') { conf(3); D.promises.push(p); }
  if (opt.id === 'budget') { addFinance(st, 'Budget extra dal consiglio', opt.amount); st.board.target = Math.max(1, st.board.target - 1); conf(-4); }
  if (opt.id === 'none') conf(-2);
  return opt.id === 'budget' ? `+${fmtM(opt.amount)}, obiettivo ${st.board.target}°` : opt.id === 'none' ? 'Nessun impegno' : 'Promessa registrata';
}
function promiseReward(st, p, ok) {
  const sc = scale(st);
  const conf = (v) => (st.board.confidence = clamp(st.board.confidence + v, 0, 100));
  const table = { podium: [12, -14, 2.5], beat: [10, -10, 2], points: [9, -10, 1.2], profit: [8, -8, 0] };
  const [g, b, m] = table[p.id] || [5, -5, 0];
  conf(ok ? g : b);
  if (ok && m) addFinance(st, 'Premio del consiglio (promessa mantenuta)', +(m * sc).toFixed(2));
  st.dyn.stats[ok ? 'promisesKept' : 'promisesBroken']++;
  addMail(st, { from: 'Consiglio di Amministrazione', icon: 'board', type: ok ? 'good' : 'bad', subject: ok ? `Promessa mantenuta: ${p.t}` : `Promessa tradita: ${p.t}`, body: ok ? `Il consiglio apprezza chi mantiene la parola. Fiducia +${g}${m ? `, premio ${fmtM(m * sc)}` : ''}.` : `Avevi promesso: «${p.t}». Non è successo. Fiducia ${b}.` });
  if (ok && st.dyn.stats.promisesKept >= 3) unlock(st, 'promises3', 'Uomo di parola', 'Mantieni tre promesse fatte al consiglio.');
}
function checkPromises(st, final = false) {
  const D = st.dyn; const pt = playerTeam(st);
  const s = standings(st);
  const myPts = s.teams.find((x) => x.id === pt.id)?.pts || 0;
  const doneRound = st.round - 1; // last completed round index
  D.promises = D.promises.filter((p) => {
    if (p.season !== st.season) return false;
    let ok = null;
    if (p.id === 'podium') { const hit = st.calendar.slice(p.made, doneRound + 1).some((e) => e.results?.classification.some((r) => r.teamId === pt.id && r.pos <= 3 && r.status !== 'dnf')); if (hit) ok = true; else if (doneRound >= p.until || final) ok = false; }
    if (p.id === 'points') { if (myPts - p.start >= p.need) ok = true; else if (doneRound >= p.until || final) ok = false; }
    if (p.id === 'beat' && final) { const a = s.teams.findIndex((x) => x.id === pt.id), b = s.teams.findIndex((x) => x.id === p.team); ok = a < b; }
    if (p.id === 'profit' && final) ok = pt.money >= p.start;
    if (ok === null) return true;
    promiseReward(st, p, ok);
    return false;
  });
}

// =====================================================================================
// PENDING DECISIONS (board, principals, investors) — resolved in the hub
// =====================================================================================
export function maybeDynDecision(st, opts = {}) {
  const D = ensureDynasty(st); if (!D || st.pendingDyn) return;
  const n = st.calendar.length;
  if (st.round >= n) return;
  const done = (D.boardDone[st.season] ||= []);
  // board meetings
  if (st.round === 0 && !done.includes('pre') && !st.pendingTech) { done.push('pre'); st.pendingDyn = { kind: 'board', phase: 'pre', mood: boardMood(st), opts: boardOptions(st, 'pre') }; return; }
  if (st.round >= Math.floor(n / 2) && !done.includes('mid') && st.round < n - 1) { done.push('mid'); st.pendingDyn = { kind: 'board', phase: 'mid', mood: boardMood(st), opts: boardOptions(st, 'mid') }; return; }
  // liquidity crisis → investor
  const pt = playerTeam(st);
  if (D.red >= 2 && !D.inv[`crisis${st.season}`]) {
    D.inv[`crisis${st.season}`] = 1;
    const need = Math.max(-pt.money * 1.15, pt.baseBudget * 0.15);
    st.pendingDyn = { kind: 'investor', amount: +need.toFixed(1), fund: pick(['Quadrifoglio Capital', 'Northbridge Equity', 'Fondo Aurora', 'Helios Ventures', 'Sterling & Vane']) };
    return;
  }
  // tycoon after a status promotion
  if (D.tycoon && !D.inv[`tycoon${st.season}`]) {
    D.inv[`tycoon${st.season}`] = 1; D.tycoon = false;
    st.pendingDyn = { kind: 'tycoon', amount: +(pt.baseBudget * 0.15).toFixed(1), who: pick(['Sir Reginald Ashcombe', 'Lorenzo Valmonte', 'Ingrid Halvorsen', 'Kenji Moriyama', 'Amira Al-Faris']) };
    return;
  }
  // regulation era, Commission votes, team-mate feuds (depth.js)
  if (!st.pendingTech && !st.pendingEvent) { depthMaybeDecision(st); if (st.pendingDyn) return; }
  // storylines: multi-step arcs (career5.js)
  if (!st.pendingTech && !st.pendingEvent && storyMaybeDecision(st)) return;
  if (st.round === 0 || opts.roll === false) return;
  // principals (pressure valve: no optional diplomacy right after a busy round)
  if (modalLoad(st) >= 1) return;
  if (!chance(st.pendingTech ? 0.06 : st.pendingEvent ? 0.14 : 0.3)) return;
  const pd = principalDecision(st);
  if (pd && !autoHandle(st, pd)) st.pendingDyn = pd;
}

function nearbyTeams(st) {
  const pt = playerTeam(st);
  const s = standings(st).teams.map((x) => x.id);
  const i = s.indexOf(pt.id);
  return [s[i - 1], s[i + 1], s[i - 2], s[i + 2]].filter(Boolean).map((id) => st.teams[id]);
}
function principalDecision(st) {
  const pt = playerTeam(st); const sc = scale(st);
  const near = nearbyTeams(st);
  const all = Object.values(st.teams).filter((t) => !t.isPlayer);
  const cands = [];
  const tr = getTrack(st.category, st.calendar[st.round]?.trackId);
  for (const t of near.slice(0, 3)) {
    const p = principal(st, t.id); if (!p) continue;
    if ((p.persona === 'showman' || p.persona === 'squalo') && !st.dyn.bet) cands.push(() => ({ kind: 'bet', team: t.id, stake: +(1 * sc).toFixed(2), track: tr?.name }));
    if ((p.persona === 'volpe' || (p.persona === 'squalo' && p.rel < 0)) && p.rel < 10) cands.push(() => { const part = pick(cat(st).parts.filter((x) => x.id !== 'reliability')); return { kind: 'protest', team: t.id, part: part.id }; });
  }
  for (const t of all) {
    const p = principal(st, t.id); if (!p) continue;
    if ((p.persona === 'gentiluomo' || p.persona === 'professore') && p.rel >= 15) cands.push(() => ({ kind: 'alliance', team: t.id, part: pick(cat(st).parts.filter((x) => x.id !== 'reliability')).id, cost: +(1.2 * sc).toFixed(2) }));
    if (p.persona === 'squalo' && p.rel < 20) cands.push(() => { const role = pick(['td', 'engineer', 'mechanic']); const s = st.staff[pt.staff[role]]; return s && s.rating >= 70 ? { kind: 'poach', team: t.id, role, staff: s.id } : null; });
    if (p.rel <= -45) cands.push(() => ({ kind: 'truce', team: t.id, cost: +(0.6 * sc).toFixed(2) }));
    if (avgPart(t) > avgPart(pt) + 3 && p.rel >= 0 && (p.persona === 'professore' || p.persona === 'volpe')) cands.push(() => { const part = cat(st).parts.filter((x) => x.id !== 'reliability').sort((a, b) => pt.car.parts[a.id] - pt.car.parts[b.id])[0]; return t.car.parts[part.id] > pt.car.parts[part.id] + 2 ? { kind: 'parts', team: t.id, part: part.id, cost: +(3.2 * sc).toFixed(2) } : null; });
  }
  for (const f of shuffle(cands)) { const d = f(); if (d) return d; }
  return null;
}

export function dynDecisionView(st) {
  const pd = st.pendingDyn; if (!pd) return null;
  const pt = playerTeam(st);
  if (pd.kind === 'era' || pd.kind === 'vote' || pd.kind === 'feud') return depthDecisionView(st, pd);
  if (pd.kind === 'story') return storyView(st, pd);
  const t = pd.team ? st.teams[pd.team] : null;
  const p = pd.team ? principal(st, pd.team) : null;
  if (pd.team && (!t || !p || t.isPlayer)) return null;
  const P = p ? TP_PERSONAS[p.persona] : null;
  const who = p ? `${p.name} · ${P.name} (${t.name})` : '';
  switch (pd.kind) {
    case 'board': return {
      tag: pd.phase === 'pre' ? 'Riunione di inizio stagione' : 'Riunione di metà stagione', from: 'Consiglio di Amministrazione', title: pd.phase === 'pre' ? `Stagione ${st.season}: cosa prometti al consiglio?` : 'Il consiglio vuole un impegno per il finale',
      text: `${pd.mood} Obiettivo stagionale: ${st.board.target}° tra i costruttori. Fiducia attuale ${st.board.confidence}%. Ogni promessa ti dà credito subito, ma se la tradisci la paghi cara.`,
      a: pd.opts.map((o) => ({ t: o.t, note: o.note, risk: o.id === 'podium' })) };
    case 'bet': return {
      tag: 'Sfida tra team principal', from: who, title: `${p.name} ti lancia una scommessa`, persona: p, team: t,
      text: `In diretta TV ${p.name} ti sfida: «Al ${pd.track || 'prossimo GP'} arriviamo davanti noi. Posta: ${fmtM(pd.stake)} in beneficenza da chi perde.» Le telecamere aspettano la tua risposta.`,
      a: [{ t: 'Accetto la sfida', note: `Chi arriva davanti incassa ${fmtM(pd.stake)} · reputazione in gioco` }, { t: 'Raddoppiamo la posta!', note: `Posta ${fmtM(pd.stake * 2)} · più audience, più rischio`, risk: true }, { t: 'Non scommetto con i colleghi', note: 'Lo Showman ti prenderà in giro sui giornali · rapporto -6' }] };
    case 'protest': return {
      tag: 'Guerra politica', from: who, title: `${t.name} presenta un reclamo contro di te`, persona: p, team: t,
      text: `${p.name} sostiene che la tua soluzione su ${partName(st, pd.part)} violi lo spirito del regolamento. La Federazione chiede chiarimenti prima del prossimo evento.`,
      a: [{ t: 'Difendiamo la nostra soluzione', note: `60%: assolti, rapporto -6 · 40%: multa ${fmtM(1.5 * scale(st))} e ${partName(st, pd.part)} -2`, risk: true }, { t: 'Modifichiamo il pezzo', note: `${partName(st, pd.part)} -1 · tensione rientrata` }, { t: 'Contro-reclamo sulla loro vettura', note: `45%: ${t.name} perde 2 punti su un componente · rapporto -18`, risk: true }] };
    case 'alliance': return {
      tag: 'Diplomazia tecnica', from: who, title: `${p.name} propone un’alleanza tecnica`, persona: p, team: t,
      text: `«Condividiamo i dati di correlazione galleria-pista su ${partName(st, pd.part)}. Ne guadagniamo entrambi.» Un accordo del genere rafforza i rapporti, ma aiuta anche loro.`,
      a: [{ t: 'Accordo fatto', note: `${partName(st, pd.part)} +1,8 per entrambi · ${fmtM(pd.cost)} · rapporto +15` }, { t: 'Solo uno scambio di cortesie', note: 'Rapporto +5' }, { t: 'No, i nostri dati restano nostri', note: 'Rapporto -6' }] };
    case 'poach': { const s = st.staff[pd.staff]; return {
      tag: 'Assalto allo staff', from: who, title: `${t.name} vuole ${s?.name || 'un tuo uomo'}`, persona: p, team: t,
      text: `${p.name} ha offerto a ${s?.name} (${s?.rating}) un contratto da capogiro. Puoi pareggiare l’offerta, lasciarlo andare incassando un indennizzo, o fare pressioni.`,
      a: [{ t: 'Pareggiamo l’offerta', note: `Stipendio +35% (${fmtM((s?.salary || 1) * 0.35)}/anno in più) · resta con noi` }, { t: 'Lasciamolo andare', note: `Indennizzo ${fmtM((s?.salary || 1) * 1.5)} · arriva un sostituto più debole` }, { t: 'Denunciamo il tentativo alla stampa', note: '50%: resta (rapporto -20) · 50%: se ne va comunque, senza indennizzo', risk: true }] }; }
    case 'truce': return {
      tag: 'Diplomazia', from: who, title: `Cena di pace con ${p.name}?`, persona: p, team: t,
      text: `I rapporti con ${t.name} sono ai minimi storici (${relLabel(p.rel).toLowerCase()}). Un intermediario propone una cena riservata per abbassare i toni prima che la faida diventi pericolosa.`,
      a: [{ t: 'Prenoto io il ristorante', note: `${fmtM(pd.cost)} · rapporto +30` }, { t: 'Una stretta di mano in pit lane', note: 'Rapporto +10' }, { t: 'La guerra continua', note: 'Rapporto -5 · i tuoi piloti si caricano (morale +3)' }] };
    case 'parts': return {
      tag: 'Mercato componenti', from: who, title: `${t.name} offre componenti clienti`, persona: p, team: t,
      text: `${p.name} è disposto a venderti il progetto della sua ${partName(st, pd.part)} dell’anno scorso. Saresti più competitivo subito, ma dipenderesti da un rivale.`,
      a: [{ t: 'Compriamo il pacchetto', note: `${partName(st, pd.part)} +3 · ${fmtM(pd.cost)} · rapporto +10` }, { t: 'Trattiamo sul prezzo', note: '55%: +3 a metà prezzo · 45%: salta tutto, rapporto -5', risk: true }, { t: 'Preferiamo il nostro progetto', note: 'Nessun effetto' }] };
    case 'investor': return {
      tag: 'Crisi di liquidità', from: 'Direttore Finanziario', title: 'I conti sono in rosso da troppo tempo',
      text: `Abbiamo chiuso più eventi consecutivi in negativo (${fmtM(pt.money)}). Il fondo ${pd.fund} è pronto a entrare nella società. Senza liquidità rischiamo l’amministrazione controllata, e a quel punto il consiglio ti farà fuori.`,
      a: [{ t: `Accettiamo il fondo ${pd.fund}`, note: `+${fmtM(pd.amount)} subito · il fondo trattiene il 20% dei diritti commerciali fino a fine ${st.season + 2} · fiducia -4` }, { t: 'Vendiamo pezzi del museo', note: `+${fmtM(pd.amount * 0.4)} · prestigio -2` }, { t: 'Ce la faremo da soli', note: 'Fiducia -6 · rischio amministrazione' }] };
    case 'tycoon': return {
      tag: 'Nuovo investitore', from: 'Ufficio del Presidente', title: `${pd.who} vuole investire in ${pt.name}`,
      text: `La crescita della squadra ha attirato ${pd.who}, magnate con ambizioni sportive. Offre ${fmtM(pd.amount)} subito e un aumento permanente del budget del 10%. In cambio pretende risultati: il consiglio alzerà le aspettative.`,
      a: [{ t: 'Benvenuto a bordo', note: `+${fmtM(pd.amount)} · budget +10% · obiettivi più ambiziosi per due stagioni` }, { t: 'Solo una sponsorizzazione', note: `+${fmtM(pd.amount * 0.35)} una tantum` }, { t: 'Grazie, restiamo indipendenti', note: 'Fiducia +3 dal vecchio consiglio' }] };
    default: return null;
  }
}

export function resolveDynDecision(st, i) {
  const pd = st.pendingDyn; if (!pd) return '';
  if (!dynDecisionView(st)) { st.pendingDyn = null; if (pd.kind === 'story' && st.dp?.story) st.dp.story.active = null; return ''; }
  noteModal(st);
  if (pd.kind === 'story') {
    const v = dynDecisionView(st);
    const out = storyResolve(st, pd, i);
    addMail(st, { from: v?.from || 'Paddock', icon: 'star', type: 'info', subject: v?.title || 'Storia', body: `${v?.text || ''}\n\nDecisione: ${v?.a[i]?.t || ''}. ${out}` });
    st.pendingDyn = null; commit(st);
    return out;
  }
  if (pd.kind === 'era' || pd.kind === 'vote' || pd.kind === 'feud') {
    const view0 = dynDecisionView(st);
    const out0 = depthResolveDecision(st, pd, i);
    addMail(st, { from: view0?.from || 'Paddock', icon: pd.kind === 'feud' ? 'driver' : 'rules', type: 'info', subject: view0?.title || 'Decisione', body: `${view0?.text || ''}\n\nDecisione: ${view0?.a[i]?.t || ''}. ${out0}` });
    st.pendingDyn = null; commit(st);
    return out0;
  }
  const D = st.dyn; const pt = playerTeam(st); const sc = scale(st);
  const t = pd.team ? st.teams[pd.team] : null;
  const p = pd.team ? principal(st, pd.team) : null;
  const bump = (team, part, v) => { if (team.car.parts[part] != null) team.car.parts[part] = clamp(+(team.car.parts[part] + v).toFixed(1), 30, 99.5); };
  let out = '';
  switch (pd.kind) {
    case 'board': out = resolveBoard(st, pd.opts[i]); break;
    case 'bet':
      if (i === 2) { rel(st, pd.team, -6); press(st, { kind: 'quote', tone: 'bad', h: `${p.name}: «${playerTeam(st).name} ha paura»`, t: `Il team principal di ${t.name} ironizza dopo il rifiuto della scommessa.`, img: { k: 'team', id: pd.team }, q: { team: pd.team, text: '«Gli ho offerto una scommessa amichevole e sono scappati. Diteglielo: non mordo. Quasi mai.»' }, tag: 'Paddock' }); out = 'Scommessa rifiutata'; }
      else { D.bet = { team: pd.team, stake: pd.stake * (i === 1 ? 2 : 1), season: st.season, round: st.round }; rel(st, pd.team, 4); press(st, { kind: 'quote', tone: 'info', h: `Sfida accettata: ${pt.short} contro ${t.short}${i === 1 ? ', posta raddoppiata' : ''}`, t: `${st.playerName} e ${p.name} hanno scommesso ${fmtM(D.bet.stake)} in beneficenza sul prossimo GP.`, img: { k: 'team', id: pd.team }, tag: 'Sfida' }); out = `Posta ${fmtM(D.bet.stake)}`; }
      break;
    case 'protest':
      if (i === 0) { if (chance(0.6)) { rel(st, pd.team, -6); press(st, { kind: 'brief', tone: 'good', h: `Reclamo respinto: ${pt.name} è in regola`, t: `La Federazione dà ragione a ${pt.name}. ${p.name} non la prende bene.`, img: { k: 'team', id: pt.id }, tag: 'Federazione' }); out = 'Assolti!'; } else { addFinance(st, 'Multa della Federazione', -1.5 * sc); bump(pt, pd.part, -2); rel(st, pd.team, -2); out = `Multa e ${partName(st, pd.part)} -2`; } }
      if (i === 1) { bump(pt, pd.part, -1); rel(st, pd.team, 4); out = `${partName(st, pd.part)} -1`; }
      if (i === 2) { rel(st, pd.team, -18); if (chance(0.45)) { const part = pick(cat(st).parts.filter((x) => x.id !== 'reliability')).id; bump(t, part, -2); press(st, { kind: 'brief', tone: 'good', h: `Colpo di scena: ${t.name} costretta a modificare la vettura`, t: `Il contro-reclamo di ${pt.name} va a segno: ${partName(st, part)} da rivedere.`, img: { k: 'team', id: t.id }, tag: 'Federazione' }); out = `${t.name}: ${partName(st, part)} -2`; } else out = 'Contro-reclamo respinto'; }
      break;
    case 'alliance':
      if (i === 0) { addFinance(st, `Alleanza tecnica con ${t.name}`, -pd.cost); bump(pt, pd.part, 1.8); bump(t, pd.part, 1.8); rel(st, pd.team, 15); unlock(st, 'alliance', 'Diplomatico del paddock', 'Stringi un’alleanza tecnica con un team rivale.'); out = `${partName(st, pd.part)} +1,8`; }
      if (i === 1) { rel(st, pd.team, 5); out = 'Rapporti migliorati'; }
      if (i === 2) { rel(st, pd.team, -6); out = 'Proposta respinta'; }
      break;
    case 'poach': {
      const s = st.staff[pd.staff];
      if (!s) { out = ''; break; }
      if (i === 0) { s.salary = +(s.salary * 1.35).toFixed(2); rel(st, pd.team, -4); out = `${s.name} resta`; }
      if (i === 1 || (i === 2 && chance(0.5))) {
        if (i === 1) addFinance(st, `Indennizzo per ${s.name}`, +(s.salary * 1.5).toFixed(2));
        const old = st.staff[t.staff[s.role]]; if (old) old.teamId = null;
        s.teamId = t.id; t.staff[s.role] = s.id;
        const repl = Object.values(st.staff).filter((x) => x.role === s.role && !x.teamId).sort((a, b) => b.rating - a.rating).find((x) => x.rating <= s.rating - 3) || Object.values(st.staff).filter((x) => x.role === s.role && !x.teamId)[0];
        if (repl) { repl.teamId = pt.id; pt.staff[s.role] = repl.id; }
        press(st, { kind: 'brief', tone: 'bad', h: `${t.name} strappa ${s.name} a ${pt.name}`, t: `Colpo di mercato dietro le quinte: ${p.name} si porta a casa uno degli uomini chiave di ${pt.name}.`, img: { k: 'team', id: t.id }, tag: 'Mercato' });
        out = `${s.name} se ne va${repl ? `, arriva ${repl.name}` : ''}`;
      } else if (i === 2) { rel(st, pd.team, -20); out = `${s.name} resta, guerra aperta con ${t.short}`; }
      break; }
    case 'truce':
      if (i === 0) { addFinance(st, `Cena di pace con ${p.name}`, -pd.cost); rel(st, pd.team, 30); unlock(st, 'peace', 'Calumet della pace', 'Fai pace con un team principal nemico.'); out = 'Pace fatta'; }
      if (i === 1) { rel(st, pd.team, 10); out = 'Toni più bassi'; }
      if (i === 2) { rel(st, pd.team, -5); teamDrivers(st, pt).forEach((d) => (d.morale = clamp(d.morale + 3, 10, 100))); out = 'La faida continua'; }
      break;
    case 'parts':
      if (i === 0) { addFinance(st, `Componenti clienti da ${t.name}`, -pd.cost); bump(pt, pd.part, 3); rel(st, pd.team, 10); out = `${partName(st, pd.part)} +3`; }
      if (i === 1) { if (chance(0.55)) { addFinance(st, `Componenti clienti da ${t.name}`, -pd.cost / 2); bump(pt, pd.part, 3); out = `Affare! ${partName(st, pd.part)} +3`; } else { rel(st, pd.team, -5); out = 'Trattativa saltata'; } }
      if (i === 2) out = 'Nessun acquisto';
      break;
    case 'investor':
      if (i === 0) { addFinance(st, `Ingresso del fondo ${pd.fund}`, pd.amount); D.skim = { pct: 0.2, until: st.season + 2, who: pd.fund }; st.board.confidence = clamp(st.board.confidence - 4, 0, 100); D.red = 0; unlock(st, 'saved', 'Salvataggio in extremis', 'Supera una crisi di liquidità grazie a un investitore.'); out = `+${fmtM(pd.amount)}`; }
      if (i === 1) { addFinance(st, 'Asta di cimeli del museo', +(pd.amount * 0.4).toFixed(2)); pt.rep = clamp(pt.rep - 2, 20, 100); out = `+${fmtM(pd.amount * 0.4)}`; }
      if (i === 2) { st.board.confidence = clamp(st.board.confidence - 6, 0, 100); out = 'Nessun investitore'; }
      break;
    case 'tycoon':
      if (i === 0) { addFinance(st, `Investimento di ${pd.who}`, pd.amount); pt.baseBudget = +(pt.baseBudget * 1.1).toFixed(2); D.pressure = 1; D.pressureUntil = st.season + 2; st.board.target = Math.max(1, st.board.target - 1); unlock(st, 'tycoon', 'Il magnate', 'Accetta l’investimento di un magnate.'); out = `+${fmtM(pd.amount)} e budget +10%`; }
      if (i === 1) { addFinance(st, `Sponsorizzazione di ${pd.who}`, +(pd.amount * 0.35).toFixed(2)); out = `+${fmtM(pd.amount * 0.35)}`; }
      if (i === 2) { st.board.confidence = clamp(st.board.confidence + 3, 0, 100); out = 'Indipendenti'; }
      break;
  }
  const view = dynDecisionView(st);
  addMail(st, { from: view?.from || 'Paddock', icon: pd.kind === 'board' ? 'board' : pd.kind === 'investor' || pd.kind === 'tycoon' ? 'money' : 'users', type: 'info', subject: view?.title || 'Decisione', body: `${view?.text || ''}\n\nDecisione: ${view?.a[i]?.t || ''}. ${out}` });
  st.pendingDyn = null; commit(st);
  return out;
}

// =====================================================================================
// ROUND HOOK (called by applyRoundResults after state.round++)
// =====================================================================================
export function dynPostRound(st, res, track) {
  if (st.quick) return;
  const D = ensureDynasty(st, { goals: false }); const pt = playerTeam(st); const sc = scale(st);
  const rIdx = st.round - 1;
  D._pressRound = rIdx;
  const report = { goals: [], bet: null, quotes: [], status: null };
  // ---- sponsor goals ----
  if (D.goals && D.goals.season === st.season && D.goals.round === rIdx) {
    for (const g of D.goals.list) {
      const sp = pt.sponsors.find((x) => x.id === g.sp); if (!sp) continue;
      const ok = evalGoal(st, g, res);
      g.ok = ok; D.stats.goalsTot++;
      sp.sat = clamp(Math.round((sp.sat ?? 60) + (ok ? 7 : -6) + Math.max(0, (pt.facilities.hospitality || 1) - 3)), 0, 100);
      if (ok) { addFinance(st, `Obiettivo ${sp.name}: ${g.text}`, g.reward); D.stats.goalsHit++; }
      report.goals.push({ ...g });
    }
    if (report.goals.length >= 2 && report.goals.every((g) => g.ok)) unlock(st, 'sponsor_sweep', 'Cliente perfetto', 'Centra tutti gli obiettivi sponsor in un weekend.');
    // unhappy sponsors walk out
    for (const sp of pt.sponsors.slice()) if (sp.sat <= 18) {
      pt.sponsors = pt.sponsors.filter((x) => x !== sp);
      addMail(st, { from: sp.name, icon: 'money', type: 'bad', subject: `${sp.name} rescinde il contratto`, body: `Troppi obiettivi mancati: ${sp.name} ha deciso di ritirare la sponsorizzazione. Lo spazio sulla livrea è di nuovo libero.` });
      press(st, { kind: 'brief', tone: 'bad', h: `${sp.name} abbandona ${pt.name}`, t: 'Lo sponsor lamenta risultati sotto le attese.', img: { k: 'team', id: pt.id }, tag: 'Business' });
    }
  }
  D.lastReport = report;
  // ---- bet ----
  if (D.bet && D.bet.season === st.season && D.bet.round === rIdx) {
    const ok = (r) => r.status !== 'dnf';
    const best = (id) => Math.min(99, ...res.classification.filter((r) => r.teamId === id && ok(r)).map((r) => r.pos));
    const win = best(pt.id) < best(D.bet.team);
    const t = st.teams[D.bet.team]; const p = principal(st, D.bet.team);
    addFinance(st, win ? `Scommessa vinta con ${p?.name}` : `Scommessa persa con ${p?.name} (beneficenza)`, win ? D.bet.stake : -D.bet.stake);
    st.career.reputation = clamp(st.career.reputation + (win ? 1.2 : -0.6), 0, 100);
    rel(st, D.bet.team, win ? -3 : 3);
    D.stats[win ? 'betsWon' : 'betsLost']++;
    if (win) unlock(st, 'bet_win', 'Chi la fa l’aspetti', 'Vinci una scommessa contro un team principal rivale.');
    press(st, { kind: 'quote', tone: win ? 'good' : 'bad', h: win ? `Scommessa vinta: ${p?.name} paga pegno` : `${p?.name} vince la scommessa con ${pt.name}`, t: win ? `${t.name} chiude dietro a ${pt.name}: ${fmtM(D.bet.stake)} in beneficenza a nome di ${p?.name}.` : `${pt.name} non riesce a stare davanti a ${t.name}: ${st.playerName} firma l’assegno.`, img: { k: 'team', id: win ? pt.id : t.id }, tag: 'Sfida' });
    report.bet = { team: D.bet.team, win, stake: D.bet.stake };
    D.bet = null;
  } else if (D.bet && (D.bet.season !== st.season || D.bet.round < rIdx)) D.bet = null;
  // ---- staff traits ----
  if (teamTrait(st, pt, 'engineer', 'psych')) teamDrivers(st, pt).forEach((d) => (d.morale = clamp(d.morale + 1, 10, 100)));
  investRound(st, res);
  if (teamTrait(st, pt, 'mechanic', 'reliab') && pt.car.parts.reliability != null) pt.car.parts.reliability = clamp(+(pt.car.parts.reliability + 0.1).toFixed(2), 30, 99.5);
  if (D.skim && D.skim.until >= st.season) { const comm = +(pt.baseBudget * 0.46 / st.calendar.length * (D.skim.pct || 0.1)).toFixed(2); addFinance(st, `Quota del fondo ${D.skim.who}`, -comm); }
  const hosp = +((pt.facilities.hospitality - 1) * 0.12 * sc).toFixed(2);
  if (hosp >= 0.05) addFinance(st, 'Hospitality e marketing', hosp);
  if (academyDrivers(st).length) addFinance(st, 'Accademia giovani: borse di studio', -(academyUpkeep(st) / st.calendar.length));
  // ---- liquidity ----
  D.red = pt.money < 0 ? D.red + 1 : 0;
  if (pt.money < -pt.baseBudget * 0.3 && !D.admin) {
    D.admin = st.season;
    st.board.confidence = clamp(st.board.confidence - 20, 0, 100);
    addMail(st, { from: 'Tribunale Commerciale', icon: 'money', type: 'bad', subject: 'Amministrazione controllata', body: `Il debito ha superato il ${Math.round(0.3 * 100)}% del budget annuale. La società è in amministrazione controllata: se a fine stagione i conti saranno ancora in rosso, il consiglio ti sostituirà.` });
    press(st, { kind: 'team', tone: 'bad', h: `${pt.name} in amministrazione controllata`, t: 'Crisi finanziaria nel paddock: il futuro della squadra è in bilico.', img: { k: 'team', id: pt.id }, tag: 'Business' });
  }
  if (D.admin && pt.money > 0) { D.admin = null; addMail(st, { from: 'Tribunale Commerciale', icon: 'money', type: 'good', subject: 'Fine dell’amministrazione controllata', body: 'I conti sono tornati in positivo: la società esce dall’amministrazione controllata.' }); unlock(st, 'phoenix', 'Fenice', 'Esci dall’amministrazione controllata.'); }
  // ---- principals react & press ----
  roundPress(st, res, track, report);
  // ---- promises ----
  checkPromises(st);
  // ---- status change ----
  const si = statusIdx(st);
  if (si > (D.statusMax ?? 0)) {
    D.statusMax = si; D.statusUp = si; report.status = si;
    if (si >= 3) D.tycoon = true;
    press(st, { kind: 'team', tone: 'good', h: `${pt.name} è ora ${STATUS[si].name.toLowerCase()}`, t: `Il paddock prende atto della crescita di ${pt.name}: ${STATUS[si].perks.join(', ').toLowerCase()}.`, img: { k: 'team', id: pt.id }, tag: 'Status' });
    if (si >= 2) unlock(st, 'status2', 'Fuori dall’anonimato', 'Raggiungi lo status Outsider.');
    if (si >= 3) unlock(st, 'status3', 'Si fa sul serio', 'Raggiungi lo status Contendente.');
    if (si >= 4) unlock(st, 'status4', 'Nell’Olimpo', 'Raggiungi lo status Top Team.');
    if (si >= 5) unlock(st, 'status5', 'Dinastia', 'Raggiungi lo status Dinastia.');
  }
  // ---- season log (charts) ----
  const s = standings(st);
  D.log.push({ s: st.season, r: rIdx, nat: track?.nat, tn: track?.name, pts: Object.fromEntries(s.teams.map((x) => [x.id, x.pts])), pos: s.teams.findIndex((x) => x.id === pt.id) + 1, money: +pt.money.toFixed(2), conf: st.board.confidence, car: +avgPart(pt).toFixed(1), rank: overallCarRanking(st).indexOf(pt.id) + 1, rep: +pt.rep.toFixed(1) });
  D.log = D.log.filter((x) => x.s >= st.season - 2);
  D._pressRound = null;
  if (st.round < st.calendar.length) ensureSeats(st);
  // next round
  makeRaceGoals(st);
  maybeDynDecision(st);
}

function roundPress(st, res, track, report) {
  const pt = playerTeam(st);
  const win = res.classification[0];
  const wd = st.drivers[win.driverIds[0]]; const wt = st.teams[win.teamId];
  const wName = win.driverIds.map((id) => lastName(st.drivers[id]?.name)).join(' / ');
  press(st, { kind: 'lead', tone: wt.isPlayer ? 'good' : 'info', h: pick(LEAD)(wName, track.name, wt.name, win.driverIds.length > 1), t: `${wd?.name} (${wt.name}) vince ${evArt(track.name)}${track.name}${res.wet ? ' sotto la pioggia' : ''}. ${res.classification[1] ? `Secondo ${st.drivers[res.classification[1].driverIds[0]]?.name}` : ''}${res.classification[2] ? `, terzo ${st.drivers[res.classification[2].driverIds[0]]?.name}.` : '.'}`, img: { k: 'track', id: track.id }, tag: track.name });
  const mine = res.classification.filter((r) => r.teamId === pt.id);
  const ok = (r) => r.status !== 'dnf';
  const best = mine.filter(ok).sort((a, b) => a.pos - b.pos)[0];
  if (mine.length && mine.every((r) => !ok(r))) press(st, { kind: 'team', tone: 'bad', h: `Notte fonda per ${pt.name}: doppio ritiro`, t: `Nessuna vettura al traguardo a ${track.name}. Il muretto deve dare risposte.`, img: { k: 'team', id: pt.id }, tag: pt.short });
  else if (best && best.pos === 1) press(st, { kind: 'team', tone: 'good', h: `Festa ${pt.name}: ${lastName(st.drivers[best.driverIds[0]]?.name)} sul gradino più alto`, t: `La strategia di ${st.playerName} funziona alla perfezione.`, img: { k: 'driver', id: best.driverIds[0] }, tag: pt.short });
  else if (best && best.pos <= 3) press(st, { kind: 'team', tone: 'good', h: `${pt.name} sul podio a ${track.name}`, t: `${st.drivers[best.driverIds[0]]?.name} chiude ${best.pos}°: champagne nel box.`, img: { k: 'driver', id: best.driverIds[0] }, tag: pt.short });
  else if (best && best.grid && best.grid - best.pos >= 6) press(st, { kind: 'team', tone: 'good', h: `Rimonta da applausi per ${lastName(st.drivers[best.driverIds[0]]?.name)}`, t: `Dal ${best.grid}° al ${best.pos}° posto: la gara più spettacolare del weekend.`, img: { k: 'driver', id: best.driverIds[0] }, tag: pt.short });
  // principals quotes: the teams right around us
  const near = nearbyTeams(st).slice(0, 2);
  const myBest = best ? best.pos : 99;
  for (const t of near) {
    const p = principal(st, t.id); if (!p) continue;
    const theirs = res.classification.filter((r) => r.teamId === t.id && ok(r)).map((r) => r.pos);
    const tb = theirs.length ? Math.min(...theirs) : 99;
    if (tb === 99 && myBest === 99) continue;
    const beat = tb < myBest;
    const text = quote(st, t.id, beat ? 'beat' : 'lost');
    p.quote = { text, s: st.season, r: st.round - 1 };
    if (!beat) rel(st, t.id, p.persona === 'gentiluomo' ? 1 : p.persona === 'squalo' ? -3 : p.persona === 'volpe' ? -2 : -1);
    else rel(st, t.id, p.persona === 'gentiluomo' ? 1 : 0);
    report.quotes.push({ team: t.id, text, beat });
    press(st, { kind: 'quote', tone: beat ? 'bad' : 'good', h: `${p.name}: ${beat ? 'frecciata a' : 'parole su'} ${pt.name}`, t: '', q: { team: t.id, text }, img: { k: 'team', id: t.id }, tag: TP_PERSONAS[p.persona].name });
  }
  // championship
  const s = standings(st);
  if (s.teams.length > 1 && st.round >= 3) {
    const a = s.teams[0], b = s.teams[1];
    const gap = a.pts - b.pts;
    press(st, { kind: 'champ', tone: a.id === pt.id ? 'good' : 'info', h: gap <= 10 ? `Costruttori: ${st.teams[a.id].name} e ${st.teams[b.id].name} a ${gap} punti` : `${st.teams[a.id].name} allunga: +${gap} in classifica`, t: `Dopo ${st.round} eventi il campionato costruttori vede ${st.teams[a.id].name} davanti con ${a.pts} punti.`, img: { k: 'trophy' }, tag: 'Campionato' });
  }
  // briefs from the news wire
  for (const n of st.news.filter((x) => x.season === st.season && x.round === st.round - 1).slice(0, 3)) if (!/^.+: vince /.test(n.text)) press(st, { kind: 'brief', tone: 'info', h: n.text, t: '', tag: 'Dal paddock' });
}

// =====================================================================================
// SEASON HOOKS
// =====================================================================================
export function dynEndSeason(st, sum) {
  if (st.quick) return;
  const D = ensureDynasty(st); const pt = playerTeam(st);
  const before = statusIdx(st);
  checkPromises(st, true);
  // team reputation reacts to the final standing (player and AI)
  const n = sum.st.teams.length;
  for (const t of Object.values(st.teams)) {
    const pos = sum.st.teams.findIndex((x) => x.id === t.id) + 1;
    if (t.isPlayer) {
      // reputation converges towards the prestige of the place you finished, plus a bonus for beating expectations
      const [lo, hi] = repRange(st.category);
      const repForPos = hi + (hi - lo) * 0.06 - ((pos - 1) / Math.max(1, n - 1)) * (hi - lo) * 1.05;
      const d = (repForPos - t.rep) * 0.35 + clamp(sum.target - pos, -3, 4) * (hi - lo) / 40 + (pos === 1 ? (hi - lo) * 0.05 : 0);
      t.rep = clamp(+(t.rep + d).toFixed(1), 20, 100);
    } else {
      const byRep = Object.values(st.teams).filter((x) => !x.isPlayer).sort((a, b) => b.rep - a.rep).indexOf(t) + 1;
      const base = TEAMS[st.category].find((x) => x.id === t.id)?.rep ?? t.rep;
      t.rep = clamp(+(t.rep + clamp((byRep - pos) * 0.45, -3, 3) + (base - t.rep) * 0.1).toFixed(1), 20, 100);
    }
  }
  const inv = investSeasonEnd(st, sum);
  // sponsors: renewals based on satisfaction
  for (const sp of pt.sponsors) {
    if (sp.seasonsLeft !== 1) continue;
    if ((sp.sat ?? 60) >= 65) {
      sp.seasonsLeft += randInt(1, 2); sp.perRace = +(sp.perRace * 1.08).toFixed(2); sp.sat = 60;
      addMail(st, { from: sp.name, icon: 'money', type: 'good', subject: `${sp.name} rinnova!`, body: `Soddisfatti degli obiettivi raggiunti, ${sp.name} rinnova il contratto con un aumento dell’8% (${fmtM(sp.perRace)}/evento).` });
    }
  }
  const feeder = feederResults(st);
  if (inv) inv.feeder = feeder;
  const planRefs = D.plan.steps.filter((x) => x.season === st.season);
  const mandate = D.mandate;
  evalPlan(st, sum);
  const planSteps = planRefs.map((x) => ({ ...x }));
  if (D.admin && pt.money < 0) sum.fired = true;
  const after = statusIdx(st);
  const hist = st.career.history[st.career.history.length - 1];
  if (hist && hist.season === st.season) hist.status = after;
  if (after > (D.statusMax ?? 0)) { D.statusMax = after; D.statusUp = after; if (after >= 3) D.tycoon = true; }
  D.summary = { season: st.season, goals: `${D.stats.goalsHit}/${D.stats.goalsTot}` };
  sum.dyn = { quotes: seasonQuotes(st, sum), before, after, mandate, plan: planSteps, goalsHit: D.stats.goalsHit - (D.seasonStats0?.goalsHit || 0), goalsTot: D.stats.goalsTot - (D.seasonStats0?.goalsTot || 0), betsWon: D.stats.betsWon - (D.seasonStats0?.betsWon || 0), betsLost: D.stats.betsLost - (D.seasonStats0?.betsLost || 0), kept: D.stats.promisesKept - (D.seasonStats0?.promisesKept || 0), broken: D.stats.promisesBroken - (D.seasonStats0?.promisesBroken || 0), rep: +pt.rep.toFixed(1), invRep: inv.rep, inv };

}

// End-of-season verdicts from the rival principals closest to you in the final standings
const SEASON_Q = {
  squalo: { ahead: ['«Un altro anno davanti a {me}. Mi sto quasi annoiando.»', '«Il prossimo anno li doppiamo. Scrivetelo.»'], behind: ['«{me} ci ha battuto. Me lo ricorderò per tutto l’inverno. E anche loro.»', '«Goditi l’inverno, {tp}. Sarà l’ultimo tranquillo.»'] },
  volpe: { ahead: ['«Una stagione regolare, in ogni senso. Non tutti possono dirlo.»', '«Abbiamo vinto il duello con {me}. In pista e nelle stanze giuste.»'], behind: ['«{me} è stata più brava quest’anno. Il regolamento del prossimo, però, lo stiamo leggendo con molta attenzione.»', '«Complimenti a {tp}. Ci rivediamo al tavolo della Federazione.»'] },
  gentiluomo: { ahead: ['«{me} ci ha fatto sudare fino all’ultimo. Stagione splendida per tutti.»', '«Rispetto enorme per {tp}: il prossimo anno sarà ancora più dura.»'], behind: ['«{tp} ha costruito qualcosa di speciale. Chapeau.»', '«Hanno meritato di stare davanti. Impareremo da loro.»'] },
  showman: { ahead: ['«Stagione da Oscar! {me}? Ottimi comprimari.»', '«Abbiamo vinto noi lo show. E il prossimo anno serve un palco più grande.»'], behind: ['«Va bene, {me} ha vinto la stagione. Ma noi abbiamo vinto i social.»', '«{tp}, ti offro una cena. Il conto lo paghi tu, sei più ricco di gloria.»'] },
  professore: { ahead: ['«Le correlazioni galleria-pista sono state migliori delle loro. Il resto è conseguenza.»', '«Il nostro fondo funziona. Quello di {me}, meno.»'], behind: ['«Il pacchetto di {me} era superiore del 0,3%. Lo stiamo già smontando, metaforicamente.»', '«Dati alla mano, {me} ha meritato. Ora li supereremo con dati migliori.»'] },
};
export function seasonQuotes(st, sum) {
  if (!st.dyn) return [];
  const pt = playerTeam(st);
  const order = sum.st.teams.map((x) => x.id);
  const i = order.indexOf(pt.id);
  const ids = [order[i - 1], order[i + 1], order[0] !== pt.id ? order[0] : null].filter((x, k, a) => x && a.indexOf(x) === k).slice(0, 2);
  return ids.map((id) => {
    const p = principal(st, id); if (!p) return null;
    const ahead = order.indexOf(id) < i;
    const text = pick(SEASON_Q[p.persona][ahead ? 'ahead' : 'behind']).replaceAll('{me}', pt.name).replaceAll('{tp}', st.playerName);
    return { team: id, text, ahead };
  }).filter(Boolean);
}

export function dynNewSeason(st) {
  if (st.quick) return;
  const D = ensureDynasty(st);
  const M = MANDATES[D.mandate] || MANDATES.growth;
  const yrs = st.season - (D.plan?.from ?? st.season);
  if (M.ease > 0 && st.season - (st.career.firstSeason ?? st.season) < M.easeSeasons) st.board.target = clamp(st.board.target + M.ease, 1, Object.keys(st.teams).length);
  if (M.ease < 0) st.board.target = clamp(st.board.target + M.ease, 1, Object.keys(st.teams).length);
  if (D.pressure && st.season <= (D.pressureUntil ?? st.season)) st.board.target = clamp(st.board.target - 1, 1, Object.keys(st.teams).length);
  const prevT = st.career.history[st.career.history.length - 1]?.target;
  if (prevT) st.board.target = Math.max(st.board.target, prevT - 2); // expectations never jump more than two places
  investNewSeason(st);
  academySeason(st);
  ensureSeats(st);
  st.pendingDyn = null;
  D.promises = [];
  D.bet = null;
  D.red = 0;
  D.seasonStats0 = { ...D.stats };
  for (const sp of playerTeam(st).sponsors) sp.sat ??= 60;
  makeProspects(st);
  makeRaceGoals(st);
  press(st, { kind: 'lead', tone: 'info', h: `Si alza il sipario sulla stagione ${st.season}`, t: `Presentazioni, nuove livree e grandi promesse: ${playerTeam(st).name} punta al ${st.board.target}° posto.`, img: { k: 'team', id: playerTeam(st).id }, tag: 'Pre-stagione' });
  void yrs;
}

// Never let the player start an event with an empty seat: the contracts office signs a stand-in
export function ensureSeats(st) {
  const pt = playerTeam(st);
  const need = seatsPerTeam(st) - teamDrivers(st, pt).length;
  if (need <= 0) return [];
  const C = st.category;
  const pool = Object.values(st.drivers).filter((d) => !d.teamId && !d.retired && !d.academy && !d.nextTeam).sort((a, b) => driverOverall(b, C) - driverOverall(a, C));
  const out = [];
  for (let i = 0; i < need; i++) {
    const d = pool.find((x) => !out.includes(x) && salaryFor(x, C) <= Math.max(0.5, pt.money * 0.15)) || pool.find((x) => !out.includes(x));
    if (!d) break;
    d.teamId = pt.id; d.contract = 1; d.salary = salaryFor(d, C); d.morale = 70; d._s0 = d.stats.starts; d.standIn = true;
    pt.drivers.push(d.id); out.push(d);
  }
  if (out.length) addMail(st, { from: 'Ufficio Contratti', icon: 'driver', type: 'bad', subject: 'Sedile coperto d’urgenza', body: `Avevamo un sedile vuoto: per non saltare l’evento abbiamo ingaggiato ${out.map((d) => d.name).join(' e ')} con un contratto di una stagione. Puoi sostituirl${out.length > 1 ? 'i' : 'o'} in qualsiasi momento dal Mercato, senza penali.` });
  return out;
}

export function setMandate(st, id) {
  const D = ensureDynasty(st); const pt = playerTeam(st);
  const M = MANDATES[id] || MANDATES.growth;
  D.mandate = id;
  if (M.budget > 1) { pt.money = +(pt.money * M.budget).toFixed(1); }
  if (M.ease) st.board.target = clamp(st.board.target + M.ease, 1, Object.keys(st.teams).length);
  D.plan = makePlan(st, id);
}

// Lap-time based expected ranking (more faithful than raw part averages)
export function seasonCharts(st, season = st.season) {
  const L = (st.dyn?.log || []).filter((x) => x.s === season);
  return L;
}

// =====================================================================================
// INVESTMENTS OUTSIDE THE COST CAP
// Capital projects, commercial spending and stakes: where a rich team's surplus goes when the
// cost cap (Formula Apex) or diminishing R&D returns stop it from buying lap time directly.
// State lives on the player team (team.invest) so helpers that only receive a team can read it.
// =====================================================================================
export const INVEST = {
  tunnel: { name: 'Galleria del vento di nuova generazione', short: 'Galleria NG', icon: 'wind', kind: 'build', max: 2, cost: [26, 42], build: [3, 4], upkeep: 0.7,
    desc: 'Capex separato dal budget cap: modelli in scala e flussi più fedeli alla pista.', eff: (l) => `Guadagni R&D +${l * 6}% · fallimenti -${l * 12}%` },
  hq: { name: 'Nuovo quartier generale', short: 'Nuovo HQ', icon: 'factory', kind: 'build', max: 1, cost: [40], build: [5], upkeep: 1.4,
    desc: 'Un campus moderno: reparti più grandi, ingegneri che fanno la fila per entrare.', eff: () => 'Uno slot R&D in più · +1 morale piloti a ogni evento' },
  museum: { name: 'Museo della scuderia', short: 'Museo', icon: 'trophy', kind: 'build', max: 1, cost: [16], build: [3], upkeep: 0.3,
    desc: 'Le vetture storiche in mostra: tifosi, scuole e partner in visita.', eff: () => 'Biglietteria a ogni evento · +1,2 prestigio a stagione · sponsor più fedeli' },
  junior: { name: 'Programma junior', short: 'Junior', icon: 'star', kind: 'annual', cost: [5],
    desc: 'Sedili pagati nelle serie minori, coach e test privati per l’accademia.', eff: () => '+1 posto in accademia · crescita junior +35% · un talento extra ogni anno' },
  marketing: { name: 'Campagna marketing & hospitality', short: 'Marketing', icon: 'mic', kind: 'season', max: 3, cost: [4, 9, 16], levels: ['Social & digital', 'Campagna nazionale', 'Campagna globale'],
    desc: 'Paddock club, eventi per i partner, spot TV: vale per la stagione in corso.', eff: (l) => `Sponsor +${[0, 10, 18, 28][l]} soddisfazione · prestigio +${[0, 0.6, 1.3, 2.4][l]} · nuove offerte` },
  bonus: { name: 'Premi risultato ai piloti', short: 'Premi piloti', icon: 'driver', kind: 'policy', max: 2, levels: ['Nessuno', 'Standard', 'Generosi'],
    desc: 'Premi in denaro per punti, podi e vittorie: piloti motivati e agenti più disponibili.', eff: (l) => (l ? `Morale +${l * 2} a podio · trattative più facili` : 'Nessun effetto') },
  stake: { name: 'Partecipazioni in altri team', short: 'Quote', icon: 'users', kind: 'stake', max: 30,
    desc: 'Compra quote di una squadra rivale: dividendi, un alleato al tavolo e un sedile per i tuoi junior.', eff: () => 'Dividendi a fine stagione · rapporti +12 · dal 20% sedile satellite per l’accademia' },
};
const INV_BUILD_KEYS = ['tunnel', 'hq', 'museum'];
// Formula Apex teams sit on far bigger budgets: capex, campaigns and upkeep cost more there so the
// surplus does not simply pile up (other categories keep the base prices).
const TOP_INV = { cost: 1.6, upkeep: 1.8, stake: 1.3 };
const invMul = (st, k) => (st.category === 'formula' ? TOP_INV[k] : 1);
export function investState(team) {
  const I = (team.invest ??= {});
  I.tunnel ??= 0; I.hq ??= 0; I.museum ??= 0; I.junior ??= 0; I.bonus ??= 0;
  I.stakes ??= {}; I.mkt ??= null; I.build ??= null; I.spent ??= 0;
  return I;
}
export function invLevel(team, key) { return team?.invest?.[key] || 0; }
export function investCost(st, key, lvl) {
  const I = INVEST[key]; const sc = scale(st) * invMul(st, 'cost');
  lvl ??= invLevel(playerTeam(st), key) + 1;
  if (key === 'junior') return +(I.cost[0] * sc).toFixed(2);
  return +((I.cost[lvl - 1] ?? I.cost[I.cost.length - 1]) * sc).toFixed(2);
}
export function stakeCost(st, teamId) { const t = st.teams[teamId]; return +(t.baseBudget * 0.22 * (0.7 + t.rep / 250) * invMul(st, 'stake')).toFixed(2); }
export function investUpkeep(st, team = playerTeam(st)) {
  const I = investState(team); const sc = scale(st) * invMul(st, 'upkeep');
  return +(INV_BUILD_KEYS.reduce((a, k) => a + (I[k] ? INVEST[k].upkeep * I[k] : 0), 0) * sc).toFixed(2);
}
export function bonusRates(st, lvl) { const sc = scale(st); return { pts: [0, 0.12, 0.25][lvl] * sc, pod: [0, 0.5, 1.1][lvl] * sc, win: [0, 0.8, 1.8][lvl] * sc }; }
// Total spent on investments this season (for the finance screen)
export function investSpent(st) { return -st.finance.filter((f) => f.season === st.season && f.amount < 0 && f.label.startsWith('Investimento')).reduce((a, b) => a + b.amount, 0); }

export function startInvestment(st, key, arg) {
  const pt = playerTeam(st); const I = investState(pt); const D = INVEST[key];
  if (!D) return { ok: false, msg: 'Investimento sconosciuto.' };
  const pay = (label, c) => { addFinance(st, `Investimento: ${label}`, -c); I.spent = +(I.spent + c).toFixed(2); };
  if (D.kind === 'build') {
    if (I.build) return { ok: false, msg: `C’è già un cantiere in corso (${INVEST[I.build.key].short}).` };
    if (I[key] >= D.max) return { ok: false, msg: 'Già al livello massimo.' };
    if (key === 'tunnel' && (pt.facilities.windtunnel || 1) < 3 + I.tunnel) return { ok: false, msg: `Serve prima la Galleria del Vento al livello ${3 + I.tunnel}.` };
    const c = investCost(st, key);
    if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
    pay(`${D.short}${D.max > 1 ? ' Lv' + (I[key] + 1) : ''}`, c);
    const races = Math.min(D.build[I[key]] ?? D.build[0], Math.max(1, st.calendar.length - 1));
    I.build = { key, racesLeft: races, total: races };
    return { ok: true, msg: `Lavori avviati: pronto tra ${races} eventi.` };
  }
  if (key === 'junior') {
    if (I.junior >= st.season) return { ok: false, msg: 'Il programma è già finanziato per questa stagione.' };
    const c = investCost(st, key);
    if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
    pay('Programma junior', c);
    const first = !I.junior; I.junior = st.season; I.juniorActive = true; I.juniorOff = false;
    addProspect(st, 4);
    return { ok: true, msg: first ? 'Programma attivo: gli scout hanno già un nome nuovo.' : 'Programma rinnovato: un nuovo talento in lista.' };
  }
  if (key === 'marketing') {
    const lvl = clamp(+arg || 1, 1, 3);
    const cur = I.mkt?.season === st.season ? I.mkt.lvl : 0;
    if (lvl <= cur) return { ok: false, msg: 'Hai già una campagna di questo livello in corso.' };
    const c = +(investCost(st, key, lvl) - (cur ? investCost(st, key, cur) : 0)).toFixed(2);
    if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
    pay(D.levels[lvl - 1], c);
    const gain = [0, 10, 18, 28][lvl] - [0, 10, 18, 28][cur];
    for (const sp of pt.sponsors) sp.sat = clamp(Math.round((sp.sat ?? 60) + gain), 0, 100);
    I.mkt = { season: st.season, lvl };
    if (lvl >= 2 && st.sponsorOffers.length < 6) {
      const o = campaignOffer(st, lvl);
      if (o) addMail(st, { from: 'Area Commerciale', icon: 'money', type: 'good', subject: 'La campagna funziona', body: `Dopo la campagna, ${o.name} ha chiesto un incontro: trovi la proposta nella sezione Sponsor.` });
    }
    press(st, { kind: 'brief', tone: 'good', h: `${pt.name} lancia la ${D.levels[lvl - 1].toLowerCase()}`, t: 'Spot, eventi e paddock club rinnovato: il marchio vuole farsi notare.', img: { k: 'team', id: pt.id }, tag: 'Business' });
    return { ok: true, msg: 'Campagna avviata.' };
  }
  if (key === 'bonus') {
    const nv = clamp(+arg || 0, 0, 2);
    if (nv > I.bonus) for (const d of teamDrivers(st, pt)) d.morale = clamp(d.morale + (nv - I.bonus) * 3, 10, 100);
    if (nv < I.bonus) for (const d of teamDrivers(st, pt)) d.morale = clamp(d.morale - (I.bonus - nv) * 5, 10, 100);
    I.bonus = nv;
    return { ok: true, msg: nv ? `Premi ${D.levels[nv].toLowerCase()} attivi da questo evento.` : 'Premi sospesi: i piloti non l’hanno presa bene.' };
  }
  if (key === 'stake') {
    const t = st.teams[arg];
    if (!t || t.isPlayer) return { ok: false, msg: 'Squadra non valida.' };
    const cur = I.stakes[arg] || 0;
    if (cur >= 30) return { ok: false, msg: 'Il tetto regolamentare è il 30%.' };
    if (!cur && Object.keys(I.stakes).length >= 2) return { ok: false, msg: 'La Federazione permette quote in due squadre al massimo.' };
    const p = principal(st, arg);
    if (p && p.rel <= -45) return { ok: false, msg: `${p.name} non ti venderebbe nemmeno una vite.` };
    const c = stakeCost(st, arg);
    if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
    pay(`10% di ${t.name}`, c);
    I.stakes[arg] = cur + 10;
    rel(st, arg, 12);
    press(st, { kind: 'brief', tone: 'info', h: `${pt.name} sale al ${cur + 10}% di ${t.name}`, t: `Operazione da ${fmtM(c)}.${p ? ` ${p.name} parla di «partnership strategica».` : ''}`, img: { k: 'team', id: t.id }, tag: 'Business' });
    if (cur + 10 >= 20) unlock(st, 'satellite', 'Squadra satellite', 'Arriva al 20% di un’altra squadra.');
    return { ok: true, msg: `Ora possiedi il ${cur + 10}% di ${t.name}.` };
  }
  return { ok: false, msg: 'Non disponibile.' };
}
// Sell a stake back (20% haircut)
export function sellStake(st, teamId) {
  const pt = playerTeam(st); const I = investState(pt);
  const cur = I.stakes[teamId] || 0; if (!cur) return { ok: false, msg: 'Nessuna quota.' };
  const v = +(stakeCost(st, teamId) * 0.8 * (cur / 10)).toFixed(2);
  addFinance(st, `Cessione quote ${st.teams[teamId].name}`, v);
  delete I.stakes[teamId];
  rel(st, teamId, -6);
  return { ok: true, msg: `Quote cedute per ${fmtM(v)}.` };
}
function campaignOffer(st, lvl) {
  const pt = playerTeam(st);
  const pool = ['Lumora Mobile', 'Vantix Cloud', 'Orbis Airways', 'Kestrel Watches', 'Nimbus Energy', 'Arcadia Bank'];
  const name = pick(pool.filter((n) => !pt.sponsors.some((s) => s.name === n) && !st.sponsorOffers.some((s) => s.name === n)));
  if (!name) return null;
  const perRace = +((lvl >= 3 ? 1.9 : 1.3) * (0.35 + pt.rep / 120) * scale(st) * rand(0.9, 1.15)).toFixed(2);
  const o = { id: uid('sp'), name, tier: lvl >= 3 ? 3 : 2, perRace, objective: 'points', objText: 'Bonus per ogni gara a punti', bonus: +(perRace * 0.35).toFixed(2), seasons: randInt(2, 3), signing: +(perRace * rand(1.2, 2.4)).toFixed(2) };
  st.sponsorOffers.push(o);
  return o;
}
// Per-event effects (called from dynPostRound)
function investRound(st, res) {
  const pt = playerTeam(st); const I = investState(pt); const sc = scale(st); const n = st.calendar.length;
  if (I.build && --I.build.racesLeft <= 0) {
    const k = I.build.key; I[k] = (I[k] || 0) + 1; I.build = null;
    addMail(st, { from: 'Direzione Tecnica', icon: 'factory', type: 'good', subject: `${INVEST[k].name}: inaugurazione`, body: `I lavori sono finiti. ${INVEST[k].eff(I[k])}.` });
    press(st, { kind: 'team', tone: 'good', h: k === 'museum' ? `${pt.name} apre il suo museo: code all’ingresso` : k === 'hq' ? `Taglio del nastro al nuovo quartier generale ${pt.name}` : `${pt.name} accende la nuova galleria del vento`, t: k === 'museum' ? 'Monoposto storiche, caschi e trofei: la storia della squadra diventa un’attrazione.' : 'Un investimento fuori dal budget cap che i rivali guardano con invidia.', img: { k: 'team', id: pt.id }, tag: 'Investimenti' });
    if (k === 'museum') unlock(st, 'museum', 'Memoria storica', 'Inaugura il museo della scuderia.');
    if (k === 'hq') unlock(st, 'new_hq', 'Casa nuova', 'Inaugura il nuovo quartier generale.');
  }
  const up = investUpkeep(st, pt);
  if (up > 0) addFinance(st, 'Investimenti: gestione infrastrutture', -+(up / n).toFixed(3));
  if (I.museum) {
    const titles = (st.career?.trophies || []).length;
    addFinance(st, 'Museo: biglietteria e visite', +((2 + Math.min(6, titles) * 0.35) * sc * (0.6 + pt.rep / 250) / n).toFixed(3));
    for (const sp of pt.sponsors) sp.sat = clamp(Math.round((sp.sat ?? 60) + 1), 0, 100);
  }
  if (I.hq) teamDrivers(st, pt).forEach((d) => (d.morale = clamp(d.morale + 1, 10, 100)));
  if (I.bonus && res?.classification) {
    const R = bonusRates(st, I.bonus);
    let tot = 0;
    for (const r of res.classification.filter((x) => x.teamId === pt.id && x.status !== 'dnf')) {
      const amt = r.pos === 1 ? R.win : r.pos <= 3 ? R.pod : r.pos <= 10 ? R.pts : 0;
      if (!amt) continue;
      tot += amt;
      for (const id of r.driverIds || [r.driverId]) { const d = st.drivers[id]; if (d) d.morale = clamp(d.morale + (r.pos <= 3 ? I.bonus * 2 : I.bonus), 10, 100); }
    }
    if (tot > 0) addFinance(st, 'Premi risultato ai piloti', -+tot.toFixed(2));
  }
}
// Season-end effects (dividends, prestige) — called from dynEndSeason after reputation is settled
function investSeasonEnd(st, sum) {
  const pt = playerTeam(st); const I = investState(pt);
  const n = sum.st.teams.length;
  const notes = [], divs = [];
  for (const [id, pct] of Object.entries(I.stakes)) {
    const t = st.teams[id]; if (!t) { delete I.stakes[id]; continue; }
    const pos = sum.st.teams.findIndex((x) => x.id === id) + 1;
    const div = +(t.baseBudget * 0.4 * (pct / 100) * (1.35 - pos / n)).toFixed(2);
    if (div > 0) { addFinance(st, `Dividendi ${t.name} (${pct}%)`, div); notes.push(`${t.short} ${fmtM(div)}`); divs.push({ id, name: t.name, pct, pos, amt: div }); }
  }
  let rep = 0;
  if (I.museum) rep += 1.2;
  if (I.mkt?.season === st.season) rep += [0, 0.6, 1.3, 2.4][I.mkt.lvl];
  if (rep) pt.rep = clamp(+(pt.rep + rep).toFixed(1), 20, 100);
  if (notes.length) addMail(st, { from: 'Ufficio Finanza', icon: 'money', type: 'good', subject: 'Dividendi dalle partecipazioni', body: `Le quote nelle altre squadre hanno reso: ${notes.join(', ')}.` });
  // summary for the season-end review
  const fin = (pre) => +st.finance.filter((f) => f.season === st.season && f.label.startsWith(pre)).reduce((a, b) => a + b.amount, 0).toFixed(2);
  return {
    rep: +rep.toFixed(1),
    museum: I.museum ? { rep: 1.2, income: fin('Museo') } : null,
    mkt: I.mkt?.season === st.season ? { lvl: I.mkt.lvl, name: INVEST.marketing.levels[I.mkt.lvl - 1], rep: [0, 0.6, 1.3, 2.4][I.mkt.lvl] } : null,
    divs, divTot: +divs.reduce((a, b) => a + b.amt, 0).toFixed(2),
    satellite: satelliteSeat(pt),
    junior: !!I.juniorActive,
    upkeep: -fin('Investimenti: gestione'), bonus: -fin('Premi risultato'),
    builds: INV_BUILD_KEYS.filter((k) => I[k]).map((k) => ({ key: k, short: INVEST[k].short, lvl: I[k] })),
    spent: investSpent(st),
  };
}
// Academy hooks
export function juniorProgramme(st, team = playerTeam(st)) { return (team.invest?.junior || 0) >= st.season; }
export function satelliteSeat(team) { return Object.values(team?.invest?.stakes || {}).some((p) => p >= 20); }
// Winter: the junior programme renews itself (if funds allow) unless it was cancelled
function investNewSeason(st) {
  const pt = playerTeam(st); const I = investState(pt);
  I.spent = 0;
  if (!I.juniorActive) return;
  const fee = investCost(st, 'junior');
  if (I.juniorOff || pt.money < fee) {
    I.juniorActive = false;
    addMail(st, { from: 'Accademia', icon: 'star', type: 'info', subject: 'Programma junior sospeso', body: I.juniorOff ? 'Come deciso, il programma junior non è stato rinnovato: l’accademia torna alla capienza normale.' : `Liquidità insufficiente per rinnovare il programma junior (${fmtM(fee)}). Puoi riattivarlo dalla sezione Finanze.` });
    return;
  }
  addFinance(st, 'Investimento: Programma junior (rinnovo)', -fee);
  I.junior = st.season;
  addProspect(st, 4);
}
export function toggleJuniorRenewal(st) { const I = investState(playerTeam(st)); I.juniorOff = !I.juniorOff; return I.juniorOff; }
