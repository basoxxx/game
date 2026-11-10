// Depth layer: the long-career mechanics that keep a 10+ season save alive.
//  - Regulation eras (announced a season ahead, "when do we switch?" policy, pecking-order reset)
//  - Winter convergence (rivals copy the leader) and AI team momentum, takeovers and rebrands
//  - Wind tunnel/track correlation, suspect upgrades (revert or insist), homologation tokens
//  - Track kits (low/high downforce) and power unit modes, as temporary car modifiers
//  - Power unit supply deals (customer/partner/works) with suppliers that evolve every winter
//  - Budget cap audits with points deductions, also for AI teams
//  - Driver form, injuries with reserve drivers, team-mate feuds, paying drivers
//  - Fan base and merchandise, owner identity objectives, the F-Commission votes with lobbying
//  - Rumour mill, hall of fame and all-time records, comeback plan after bad seasons
import { TEAMS, ENGINE_SUPPLIERS, STAFF_NAMES } from '../data/teams.js';
import { rand, randInt, pick, clamp, chance, shuffle, uid, gauss } from './rng.js';
import { cat, playerTeam, teamDrivers, addMail, addNews, addFinance, fmtM, standings, partName, overallCarRanking, seatsPerTeam, prizeFor } from './season.js';
import { getTrack, driverOverall, avgPart, salaryFor } from './world.js';
import { press, principal, adjustRel, statusIdx, invLevel, TP_PERSONAS, relLabel } from './dynasty.js';
import { heatOf, addHeat } from './rivalry.js';
import { reserveFor } from './stewards.js';
import { diffOf, hasFacPerk } from './career5.js';

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const scale = (st) => cat(st).budgetScale;
const last = (n) => String(n || '').split(' ').slice(-1)[0];
const perfParts = (st) => cat(st).parts.filter((p) => p.id !== 'reliability');
const bump = (t, id, v) => { if (t.car.parts[id] != null) t.car.parts[id] = clamp(+(t.car.parts[id] + v).toFixed(1), 30, 99.5); };
const tdOf = (st, t) => st.staff[t.staff?.td]?.rating || 70;
const corrMin = (st) => (hasFacPerk(st.teams?.[st.playerTeam], 'windtunnel', 5) ? 0.82 : 0.6);

// =====================================================================================
// DATA
// =====================================================================================
export const ERAS = {
  formula: [
    { name: 'Era dell’effetto suolo', focus: ['aero', 'chassis'], txt: 'fondo a canali Venturi, ali semplificate e ruote da 18 pollici' },
    { name: 'Era delle power unit sostenibili', focus: ['engine', 'tyre'], txt: 'nuove power unit con carburanti sintetici e metà della potenza dall’elettrico' },
    { name: 'Era dell’aerodinamica attiva', focus: ['aero', 'engine'], txt: 'ali mobili su entrambi gli assi e resistenza all’avanzamento dimezzata' },
    { name: 'Era delle monoposto compatte', focus: ['chassis', 'tyre'], txt: 'passo corto, peso minimo ridotto e gomme più strette' },
  ],
  junior: [
    { name: 'Nuova monoposto di serie', focus: ['aero', 'chassis'], txt: 'un telaio di nuova generazione uguale per tutti' },
    { name: 'Nuovo motore turbo di serie', focus: ['engine', 'tyre'], txt: 'un nuovo propulsore turbo e gomme più larghe' },
  ],
  endurance: [
    { name: 'Era dell’idrogeno', focus: ['engine', 'efficiency'], txt: 'prototipi a idrogeno ammessi nella classe regina' },
    { name: 'Nuova piattaforma aerodinamica', focus: ['aero', 'tyre'], txt: 'carico limitato da una finestra di prestazione unica' },
    { name: 'Ibrido di seconda generazione', focus: ['efficiency', 'engine'], txt: 'recupero di energia sui due assi e stint più lunghi' },
  ],
  rally: [
    { name: 'Era delle Rally ibride', focus: ['engine', 'gearbox'], txt: 'unità ibrida comune e trasmissione semplificata' },
    { name: 'Telai tubolari leggeri', focus: ['chassis', 'suspension'], txt: 'scocche tubolari più leggere e corsa delle sospensioni ridotta' },
    { name: 'Ritorno al termico', focus: ['engine', 'suspension'], txt: 'addio all’ibrido: motori più semplici e vetture meno costose' },
  ],
};
export const ERA_POLICY = {
  late: { name: 'Tutto sul presente', share: 0.25, dev: 1, desc: 'Sviluppo attuale al 100%. Arriverai al nuovo regolamento in ritardo.' },
  bal: { name: 'Transizione graduale', share: 0.55, dev: 0.88, desc: 'Sviluppo attuale -12%. Preparazione nella media.' },
  early: { name: 'Cambio anticipato', share: 0.95, dev: 0.7, desc: 'Sviluppo attuale -30%. Grande vantaggio alla partenza della nuova era.' },
};
export const KITS = {
  low: { name: 'Pacchetto basso carico', part: 'engine', gain: 2.2, desc: 'Ali scariche per i circuiti veloci: +2,2 velocità di punta dove serve.' },
  high: { name: 'Pacchetto alto carico', part: 'aero', gain: 2.2, desc: 'Massimo carico per i cittadini e i tracciati lenti: +2,2 aerodinamica dove serve.' },
};
export const PU_MODES = {
  safe: { name: 'Conservativa', mods: { engine: -1.5, reliability: 5 }, wear: 0.85, desc: 'Motore -1,5 · Affidabilità +5 · usura componenti -15%' },
  std: { name: 'Standard', mods: {}, wear: 1, desc: 'La mappatura consigliata dal costruttore.' },
  push: { name: 'Spinta', mods: { engine: 1.5, reliability: -6 }, wear: 1.25, desc: 'Motore +1,5 · Affidabilità -6 · usura componenti +25%' },
};
export const PU_TIERS = {
  customer: { name: 'Cliente', cost: 1, power: 0, rel: 0, dev: 0.5, desc: 'Specifica dell’anno precedente aggiornata. Sviluppo motore al 50%: la power unit non è tua.' },
  partner: { name: 'Partner tecnico', cost: 1.45, power: 1.5, rel: 2, dev: 0.75, desc: 'Ultima specifica (+1,5 potenza, +2 affidabilità), ingegneri in sede. Sviluppo motore al 75%.' },
};
const OWNERS = {
  gloria: { name: 'Proprietà storica', motto: '«Qui si corre per vincere.»', desc: 'La proprietà vive di trofei: pretende podi e vittorie, perdona i conti in rosso.' },
  bilancio: { name: 'Fondo d’investimento', motto: '«Ogni euro deve tornare indietro.»', desc: 'La proprietà guarda il bilancio: vuole chiudere la stagione senza bruciare cassa.' },
  vivaio: { name: 'Squadra-vivaio', motto: '«I campioni si costruiscono in casa.»', desc: 'La proprietà vuole giovani in pista: almeno un pilota titolare di 23 anni o meno, o cresciuto nell’accademia.' },
  tecnica: { name: 'Casa costruttrice', motto: '«La macchina è il nostro biglietto da visita.»', desc: 'La proprietà vuole una vettura di riferimento: conta la classifica tecnica, non solo i punti.' },
  spettacolo: { name: 'Marchio globale', motto: '«Contano i tifosi, e le magliette vendute.»', desc: 'La proprietà vuole visibilità: la base di tifosi deve crescere ogni anno.' },
};
const OWNER_BY_TEAM = { ferrani: 'gloria', mercator: 'tecnica', redbison: 'spettacolo', mclarsen: 'tecnica', astonmarvin: 'bilancio', williamson: 'gloria', alpinea: 'vivaio', haasen: 'bilancio', torobisonte: 'vivaio', audex: 'tecnica', cadillon: 'spettacolo', toyoda: 'tecnica', porscha: 'tecnica', premia: 'vivaio', arte: 'vivaio' };
const REBRAND_A = ['Aurora', 'Vulcano', 'Kestrel', 'Meridian', 'Borealis', 'Tempesta', 'Orizon', 'Falco', 'Nordkap', 'Solaris', 'Zefiro', 'Titanio', 'Obsidian', 'Maestrale', 'Andromeda', 'Scirocco', 'Lynx', 'Cobalto'];
const REBRAND_B = { formula: ['Grand Prix', 'F-Team', 'Racing', 'Corse'], junior: ['Racing', 'Motorsport', 'Junior Team'], endurance: ['Endurance', 'Hypercar Team', 'Racing'], rally: ['Rally Team', 'Motorsport', 'Rally Sport'] };
const REBRAND_COL = [['#7b2ff7', '#f5f5f5', '#111111'], ['#00b894', '#0b0b0b', '#ffffff'], ['#ff5e3a', '#1a1a2e', '#ffffff'], ['#f9c80e', '#101010', '#ea3546'], ['#2ec4b6', '#011627', '#ff9f1c'], ['#e84393', '#2d3436', '#ffffff'], ['#0984e3', '#dfe6e9', '#2d3436'], ['#a3cb38', '#1e272e', '#ffffff']];
const TYCOONS = ['il fondo Helios Ventures', 'la holding Nakamura', 'il magnate Lorenzo Valmonte', 'il consorzio Northbridge', 'la famiglia Al-Faris', 'l’imprenditrice Ingrid Halvorsen', 'il gruppo Sterling & Vane'];
const INJURIES = ['frattura al polso', 'commozione cerebrale', 'costola incrinata', 'distorsione alla caviglia', 'contusione alla schiena', 'frattura alla clavicola'];
const CRASH_RE = /Incidente|Contatto|barriere|Testacoda|muro/i;

// =====================================================================================
// STATE
// =====================================================================================
export function ensureDepth(st) {
  if (!st || st.quick || !st.teams?.[st.playerTeam]) return null;
  const P = (st.dp ??= {});
  const pt = playerTeam(st);
  P.v ??= 1;
  if (!P.era) { P.era = { n: 1, start: st.season, next: st.season + 3 + (hash(st.playerName + st.category) % 2), tpl: -1, name: 'Regolamento attuale', policy: 'bal', prep: 0, hist: [] }; planEra(st, P.era); }
  P.era.hist ??= [];
  P.corr ??= clamp(0.8 + (pt.facilities.windtunnel || 1) * 0.02, corrMin(st), 0.97);
  P.suspects ??= [];
  P.pol ??= {};
  P.pol.autoRevert ??= true; P.pol.autoVote ??= false; P.pol.autoKit ??= false;
  if (!P.kits || P.kits.season !== st.season) P.kits = { season: st.season, low: false, high: false };
  P.mode ??= 'std';
  if (!P.tokens || P.tokens.season !== st.season) P.tokens = { season: st.season, used: 0 };
  P.rules ??= {};
  P.rules.capMul ??= 1; P.rules.atrSlope ??= 0.43; P.rules.prizeMul ??= 1; P.rules.tokens ??= 6; P.rules.freeze ??= 0;
  P.votes ??= { done: {}, hist: [] };
  P.ai ??= {};
  for (const t of Object.values(st.teams)) if (!t.isPlayer) P.ai[t.id] ??= { mom: +(gauss(0, 0.3)).toFixed(2), reb: 0 };
  P.fans ??= Math.round(150 + pt.rep * pt.rep * 0.22);
  P.fans0 ??= { season: st.season, v: P.fans };
  P.owner ??= { type: OWNER_BY_TEAM[pt.id] || Object.keys(OWNERS)[hash(pt.id + st.category) % 5], money0: pt.money, season: st.season };
  P.rum ??= []; P.rumStat ??= { ok: 0, tot: 0 };
  P.hof ??= []; P.teamRec ??= {};
  P.incoming ??= [];
  P.world ??= [];
  P.ptsPen ??= {};
  if (st.category === 'formula') {
    if (!P.sup) { P.sup = {}; for (const e of ENGINE_SUPPLIERS) P.sup[e.id] = { power: e.power, rel: e.rel, trend: 0 }; }
    if (!P.pu && !pt.works && pt.engine) P.pu = { sup: pt.engine, tier: 'customer', until: st.season + 1 };
  }
  for (const d of Object.values(st.drivers)) { if (d.backing == null) d.backing = backingFor(st.category, d, hash(d.id + d.name)); d.form ??= 0; }
  return P;
}
function planEra(st, era) {
  const list = ERAS[st.category] || ERAS.formula;
  const i = (era.tpl + 1 + (hash(st.playerName + era.n) % Math.max(1, list.length - 1))) % list.length;
  const ids = cat(st).parts.map((p) => p.id);
  era.nextTpl = i; era.nextName = list[i].name; era.nextTxt = list[i].txt; era.nextFocus = list[i].focus.filter((f) => ids.includes(f));
}
export function backingFor(catId, d, seed = Math.floor(Math.random() * 1e6)) {
  const ov = driverOverall(d, catId);
  if (ov >= 82 || seed % 100 >= 24) return 0;
  const sc = catId === 'junior' ? 0.3 : cat({ category: catId }).budgetScale;
  return +((1.5 + (seed % 17) / 4) * sc * clamp((84 - ov) / 14, 0.3, 1.2)).toFixed(2);
}
export function setPolicy(st, key, val) { const P = ensureDepth(st); P.pol[key] = !!val; return P.pol; }

// =====================================================================================
// REGULATION ERAS
// =====================================================================================
export function eraInfo(st) {
  const P = ensureDepth(st); const e = P.era;
  const left = e.next - st.season; // 0 never visible (reset happens at newSeason); 1 = last season of the era
  const pol = ERA_POLICY[e.policy] || ERA_POLICY.bal;
  const n = st.calendar.length;
  const proj = clamp(e.prep + pol.share * Math.max(0, n - st.round) / n, 0, 1); // projected preparation at season end
  const swing = +((proj - 0.5) * 6).toFixed(1);
  return { ...e, left, announced: left <= 1, pol, proj, swing, focusNames: (e.nextFocus || []).map((f) => partName(st, f)), canSet: left === 1 && st.round < Math.floor(n * 0.7) };
}
export function setEraPolicy(st, id) {
  const P = ensureDepth(st);
  if (!ERA_POLICY[id]) return { ok: false, msg: 'Scelta non valida.' };
  if (P.era.next - st.season !== 1) return { ok: false, msg: 'Nessun cambio regolamentare alle porte.' };
  if (st.round >= Math.floor(st.calendar.length * 0.7)) return { ok: false, msg: 'Troppo tardi: la fabbrica ha già pianificato il resto della stagione.' };
  P.era.policy = id; P.era.asked = true;
  return { ok: true };
}
// multiplier on the current-car development of a team in the last season of an era
export function eraDevMult(st, team) {
  const P = st.dp; if (!P || P.era.next - st.season !== 1) return 1;
  if (team.isPlayer) return (ERA_POLICY[P.era.policy] || ERA_POLICY.bal).dev;
  return 1.12 - (P.ai[team.id]?.prep ?? 0.5) * 0.4;
}
function eraRound(st) {
  const P = st.dp; const e = P.era;
  if (e.next - st.season !== 1) return;
  e.prep = clamp(+(e.prep + (ERA_POLICY[e.policy] || ERA_POLICY.bal).share / st.calendar.length).toFixed(3), 0, 1);
}
// Structural level of a team: where its car "naturally" sits. Budget, factory/wind tunnel/simulator and the
// technical director set it; R&D pushes the car above it during a season, every winter pulls it back towards it.
export function techBase(st, t) {
  const teams = Object.values(st.teams);
  const bs = teams.map((x) => x.baseBudget); const lo = Math.min(...bs), hi = Math.max(...bs);
  const bud = (t.baseBudget - lo) / Math.max(1e-6, hi - lo);
  const fac = ((t.facilities.factory || 1) + (t.facilities.windtunnel || 1) + (t.facilities.simulator || 1) - 3) / 12;
  const td = clamp((tdOf(st, t) - 60) / 35, 0, 1);
  const res = clamp(bud * 0.4 + fac * 0.32 + td * 0.28 + (t.isPlayer ? invLevel(t, 'tunnel') * 0.03 + invLevel(t, 'hq') * 0.03 : (st.dp?.ai?.[t.id]?.mom || 0) * 0.1), 0, 1.1);
  const span = st.category === 'junior' ? 5 : 17;
  return +((st.category === 'junior' ? 78 : 73) + span * res).toFixed(1);
}
// Winter car update. Replaces the plain regression of the old engine. Returns a report for the mails.
export function winterCars(st) {
  const P = ensureDepth(st); const C = cat(st); const e = P.era;
  const teams = Object.values(st.teams);
  const isEra = st.season >= e.next;
  const focus = isEra ? (e.nextFocus || []) : [];
  const diffK = diffOf(st).winter;
  const avgB = teams.reduce((s, t) => s + t.baseBudget, 0) / teams.length;
  const before = Object.fromEntries(teams.map((t) => [t.id, avgPart(t)]));
  // 1) remove concept modifiers, then regression (or era compression)
  for (const t of teams) for (const p of C.parts) { const cm = C.concepts.find((c) => c.id === t.car.concept)?.mods?.[p.id] || 0; t.car.parts[p.id] -= cm; }
  const anchors = Object.fromEntries(teams.map((t) => [t.id, techBase(st, t)]));
  const luck = Object.fromEntries(teams.map((t) => [t.id, t.isPlayer ? 0 : gauss(0, 1.1)])); // a winter project can simply be right or wrong
  for (const p of C.parts) {
    const mean = teams.reduce((s, t) => s + t.car.parts[p.id], 0) / teams.length;
    for (const t of teams) {
      let v = t.car.parts[p.id];
      const anchor = anchors[t.id];
      if (!isEra) { const w = t.isPlayer ? 0.18 + dominance(st) * 0.04 : 0.28; v = v * (1 - w) + anchor * w + rand(-1.5, 1.5) + luck[t.id]; }
      else if (p.id === 'reliability') v = mean - 3 + (v - mean) * 0.7 + rand(-2, 2);
      else {
        const f = focus.includes(p.id);
        v = (mean - (f ? 3 : 1.2) + (v - mean) * (f ? 0.3 : 0.6)) * 0.62 + anchor * 0.38;
        const q = (tdOf(st, t) - 76) * 0.06 + (Math.sqrt(t.baseBudget / avgB) - 1) * 3;
        if (t.isPlayer) v += gauss(0, f ? 1.4 : 0.7) + 0.6 + q + (e.prep - 0.5) * (f ? 6 : 2.5) + (P.corr - 0.85) * 4;
        else v += (gauss(0, f ? 3 : 1.4) + q + ((P.ai[t.id]?.prep ?? 0.5) - 0.5) * (f ? 5 : 2)) * (t.isPlayer ? 1 : 1) + (diffK - 1) * 2;
      }
      t.car.parts[p.id] = clamp(+v.toFixed(1), 38, 97);
    }
  }
  // 2) next-year work (diminishing near the ceiling: you cannot bank a perfect car) and AI winter gains
  for (const t of teams) {
    if (t.nextYear) {
      for (const [k, raw] of Object.entries(t.nextYear)) {
        if (t.car.parts[k] == null) continue;
        const v = t.car.parts[k]; const b = clamp(raw, -9, 9);
        t.car.parts[k] = clamp(+(v + (b > 0 ? b * clamp((100 - v) / 15, 0.15, 1) : b)).toFixed(1), 38, 98.5);
      }
      t.nextYear = null;
    }
    if (!t.isPlayer) {
      const mom = P.ai[t.id]?.mom || 0;
      for (const p of C.parts) t.car.parts[p.id] = clamp(+(t.car.parts[p.id] + rand(0, 2.2) * (t.baseBudget / 120) * (1 + mom * 0.5) * diffK).toFixed(1), 38, 98.5);
    }
  }
  // 3) convergence: solutions get copied over the winter. The leader's edge shrinks, chasers close in
  if (!isEra) for (const p of perfParts(st)) {
    const vals = teams.map((t) => t.car.parts[p.id]).sort((a, b) => b - a);
    const jr = st.category === 'junior'; // spec series: the organiser equalises the cars every winter
    const ref = (vals[1] ?? vals[0]) + (jr ? 0.3 : 1); const best = vals[0];
    for (const t of teams) {
      const v = t.car.parts[p.id];
      if (v > ref) t.car.parts[p.id] = +(v - (v - ref) * (jr ? 0.75 : 0.4)).toFixed(1);
      else if (t.isPlayer && best - v > 4) t.car.parts[p.id] = +(v + (best - v - 4) * 0.22).toFixed(1); // copying is easier than inventing
      else if (best - v > 7) t.car.parts[p.id] = +(v + (best - v - 7) * 0.12 * diffK).toFixed(1);
    }
  }
  // 3b) Formula Apex 2 is a spec series: the organiser re-homologates every car close to the field average
  if (st.category === 'junior') for (const p of C.parts) {
    const mean = teams.reduce((a, t) => a + t.car.parts[p.id], 0) / teams.length;
    for (const t of teams) t.car.parts[p.id] = +(mean + (t.car.parts[p.id] - mean) * 0.6).toFixed(1);
  }
  // 4) the Federation trims performance every winter: keeps the scale stable over long careers (no cars piling up at the ceiling)
  const top3 = teams.map((t) => avgPart(t)).sort((a, b) => b - a).slice(0, 3);
  const over = top3.reduce((a, b) => a + b, 0) / top3.length - (st.category === 'junior' ? 84 : 91);
  if (over > 0) for (const t of teams) for (const p of perfParts(st)) t.car.parts[p.id] = clamp(+(t.car.parts[p.id] - over * 0.85).toFixed(1), 38, 98.5);
  const out = { era: isEra, name: e.nextName, focus: focus.slice() };
  if (isEra) {
    const rankB = Object.entries(before).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const rankA = teams.slice().sort((a, b) => avgPart(b) - avgPart(a)).map((t) => t.id);
    out.moves = rankA.map((id, i) => ({ id, from: rankB.indexOf(id) + 1, to: i + 1 }));
    e.hist.push({ n: e.n, name: e.name, from: e.start, to: st.season - 1 });
    e.n++; e.start = st.season; e.name = e.nextName; e.tpl = e.nextTpl; e.next = st.season + randInt(3, 5); e.policy = 'bal'; e.prep = 0; e.asked = false; e.told = false;
    planEra(st, e);
    P.corr = clamp(+(P.corr - 0.1).toFixed(2), corrMin(st), 0.97);
    for (const a of Object.values(P.ai)) a.prep = null;
  }
  return out;
}

// =====================================================================================
// DEVELOPMENT: correlation, forecasts, suspects, tokens
// =====================================================================================
export function tokenParts(st) { return st.category === 'junior' ? [] : ['engine']; }
export function tokenCost(tier) { return { base: 1, major: 2, revolution: 3 }[tier] || 1; }
export function tokenInfo(st) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  const total = P.rules.tokens + (pt.works ? 2 : 0) + (st.category !== 'formula' ? 0 : 0);
  return { used: P.tokens.used, total, left: total - P.tokens.used, parts: tokenParts(st), frozen: P.rules.freeze === st.season };
}
export function tokenCheck(st, partId, tier, nextYear) {
  if (nextYear || !tokenParts(st).includes(partId)) return { ok: true };
  const T = tokenInfo(st);
  if (T.frozen) return { ok: false, msg: `Sviluppo ${partName(st, partId)} congelato per questa stagione dal voto della Commissione. Puoi lavorare solo sulla vettura del prossimo anno.` };
  if (T.left < tokenCost(tier)) return { ok: false, msg: `Gettoni di omologazione insufficienti (${T.left} rimasti, ne servono ${tokenCost(tier)}). Il componente è omologato: lavora sulla vettura del prossimo anno.` };
  return { ok: true, use: tokenCost(tier) };
}
export function tokenSpend(st, n) { const P = ensureDepth(st); P.tokens.used += n; }
// part development factor from the PU deal (customers cannot develop somebody else's engine)
export function puDevFactor(st, team, partId) {
  if (st.category !== 'formula' || partId !== 'engine' || !team.isPlayer || team.works) return 1;
  return (PU_TIERS[st.dp?.pu?.tier] || PU_TIERS.customer).dev;
}
// "uncharted territory": the further ahead of the second best car, the harder it is to find more
export function leaderDrag(st, team, partId) {
  const vals = Object.values(st.teams).filter((t) => t.id !== team.id).map((t) => t.car.parts[partId]).filter(Number.isFinite).sort((a, b) => b - a);
  if (!vals.length) return 1;
  return clamp(1 - (team.car.parts[partId] - vals[0] - 2) / 10, 0.4, 1);
}
export function corrRoll(st) { const c = st.dp?.corr ?? 0.9; return clamp(gauss(c + 0.07, (1 - c) * 0.55), 0.25, 1.12); }
export function corrCost(st) { return +(3.5 * scale(st) * (hasFacPerk(playerTeam(st), 'windtunnel', 4) ? 0.7 : 1)).toFixed(2); }
export function corrCampaign(st) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  if (P.corrRound === `${st.season}:${st.round}`) return { ok: false, msg: 'La campagna di correlazione di questo evento è già stata fatta.' };
  if (P.corr >= 0.96) return { ok: false, msg: 'La correlazione è già eccellente.' };
  const c = corrCost(st);
  if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
  addFinance(st, 'Produzione: campagna di correlazione galleria-pista', -c);
  const g = +(rand(0.05, 0.1) + invLevel(pt, 'tunnel') * 0.01).toFixed(2);
  P.corr = clamp(+(P.corr + g).toFixed(2), corrMin(st), 0.97); P.corrRound = `${st.season}:${st.round}`;
  return { ok: true, gain: g };
}
export function corrLabel(c) { return c >= 0.93 ? 'Eccellente' : c >= 0.86 ? 'Buona' : c >= 0.78 ? 'Incerta' : 'Scarsa'; }
// Called by season.completeProject after the base gain is computed. Mutates the car.
export function afterProject(st, team, proj, gain, before) {
  if (!team.isPlayer || proj.next) return null;
  const P = ensureDepth(st);
  if (proj.failed) P.corr = clamp(+(P.corr - 0.03).toFixed(2), corrMin(st), 0.97); else P.corr = clamp(+(P.corr + 0.008).toFixed(3), corrMin(st), 0.97);
  if (gain < 0) {
    if (P.pol.autoRevert) { team.car.parts[proj.part] = before; proj.reverted = true; return { reverted: true }; }
    P.suspects.push({ id: uid('su'), part: proj.part, loss: gain, exp: proj.exp || 2, season: st.season, round: st.round, state: 'new' });
    return { suspect: true };
  }
  return null;
}
export function suspectList(st) { const P = ensureDepth(st); return P.suspects.filter((s) => s.season === st.season); }
export function revertSuspect(st, id) {
  const P = ensureDepth(st); const s = P.suspects.find((x) => x.id === id); if (!s) return { ok: false, msg: 'Pacchetto non trovato.' };
  bump(playerTeam(st), s.part, -s.loss); P.suspects = P.suspects.filter((x) => x !== s);
  return { ok: true, msg: `${partName(st, s.part)}: tornati alla vecchia specifica (${s.loss > 0 ? '' : '+'}${(-s.loss).toFixed(1)}).` };
}
export function insistSuspect(st, id) {
  const P = ensureDepth(st); const s = P.suspects.find((x) => x.id === id); if (!s) return { ok: false, msg: 'Pacchetto non trovato.' };
  if (s.state === 'insist') return { ok: false, msg: 'Gli ingegneri ci stanno già lavorando: risposta dopo il prossimo evento.' };
  s.state = 'insist';
  return { ok: true, msg: `Teniamo il pacchetto in macchina: ${Math.round(insistChance(st) * 100)}% di farlo funzionare al prossimo evento.` };
}
export function insistChance(st) { return clamp(0.2 + (st.dp?.corr ?? 0.85) * 0.4 + (hasFacPerk(playerTeam(st), 'simulator', 5) ? 0.1 : 0), 0.3, 0.7); }
function suspectsRound(st) {
  const P = st.dp; const pt = playerTeam(st);
  for (const s of P.suspects.slice()) {
    if (s.season !== st.season) { P.suspects = P.suspects.filter((x) => x !== s); continue; }
    if (s.state !== 'insist') { if (st.round - s.round >= 2) { revertSuspect(st, s.id); addMail(st, { from: 'Direttore Tecnico', icon: 'rd', type: 'info', subject: `Pacchetto ritirato: ${partName(st, s.part)}`, body: `Dopo due eventi senza risposte abbiamo smontato il pacchetto difettoso su ${partName(st, s.part)}: la vettura torna alla specifica precedente.` }); } continue; }
    P.suspects = P.suspects.filter((x) => x !== s);
    if (chance(insistChance(st))) {
      const g = +(s.exp * rand(0.5, 0.8)).toFixed(1);
      bump(pt, s.part, -s.loss + g); P.corr = clamp(+(P.corr + 0.03).toFixed(2), corrMin(st), 0.97);
      addMail(st, { from: 'Direttore Tecnico', icon: 'rd', type: 'good', subject: `Capito il pacchetto: ${partName(st, s.part)} +${g}`, body: `Avevi ragione a insistere. I dati raccolti in pista hanno spiegato il problema: ora il pacchetto su ${partName(st, s.part)} funziona (+${g}) e la correlazione galleria-pista è migliorata.` });
    } else {
      bump(pt, s.part, -s.loss); P.corr = clamp(+(P.corr - 0.02).toFixed(2), corrMin(st), 0.97);
      addMail(st, { from: 'Direttore Tecnico', icon: 'rd', type: 'bad', subject: `Pacchetto bocciato: ${partName(st, s.part)}`, body: `Abbiamo corso un evento in più con il pacchetto difettoso su ${partName(st, s.part)} senza venirne a capo. Torniamo alla vecchia specifica: nessun guadagno, e un weekend perso.` });
    }
  }
}

// =====================================================================================
// TRACK KITS & POWER UNIT MODE (temporary car modifiers, removed before every recalculation)
// =====================================================================================
export function kitsEnabled(st) { const ids = cat(st).parts.map((p) => p.id); return cat(st).type !== 'rally' && ids.includes('aero') && ids.includes('engine'); }
export function kitFit(track) {
  if (!track) return null;
  const s = track.street || 0, o = track.ovt ?? 0.5;
  if (s >= 0.8 || o <= 0.3) return 'high';
  if (o >= 0.68 && s <= 0.5) return 'low';
  return null;
}
export function kitCost(st) { return +(2.6 * scale(st) * (hasFacPerk(playerTeam(st), 'pitcrew', 5) ? 0.7 : 1)).toFixed(2); }
export function kitTracks(st, k) { return st.calendar.filter((ev) => !ev.done && kitFit(getTrack(st.category, ev.trackId)) === k).map((ev) => getTrack(st.category, ev.trackId)); }
export function buyKit(st, k) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  if (!KITS[k] || !kitsEnabled(st)) return { ok: false, msg: 'Non disponibile in questa categoria.' };
  if (P.kits[k]) return { ok: false, msg: 'Pacchetto già in magazzino per questa stagione.' };
  const c = kitCost(st);
  if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
  addFinance(st, `Produzione: ${KITS[k].name}`, -c);
  P.kits[k] = true; applyTrackMods(st);
  return { ok: true };
}
export function setPuMode(st, m) { const P = ensureDepth(st); if (!PU_MODES[m]) return { ok: false }; P.mode = m; applyTrackMods(st); return { ok: true }; }
export function puWearMult(st, team) { return team?.isPlayer ? (PU_MODES[st.dp?.mode] || PU_MODES.std).wear : 1; }
export function clearTrackMods(st) {
  for (const t of Object.values(st.teams)) {
    if (!t.car.tmod) continue;
    for (const [k, v] of Object.entries(t.car.tmod)) if (t.car.parts[k] != null) t.car.parts[k] = +(t.car.parts[k] - v).toFixed(1);
    t.car.tmod = null;
  }
}
export function applyTrackMods(st) {
  const P = st.dp; if (!P) return;
  clearTrackMods(st);
  const ev = st.calendar[st.round]; if (!ev) return;
  const fit = kitsEnabled(st) ? kitFit(getTrack(st.category, ev.trackId)) : null;
  const teams = Object.values(st.teams);
  const avgB = teams.reduce((s, t) => s + t.baseBudget, 0) / teams.length;
  for (const t of teams) {
    const m = {};
    if (fit) { const has = t.isPlayer ? P.kits[fit] : (t.baseBudget >= avgB * 0.9 || hash(t.id + st.season + fit) % 3 === 0); if (has) m[KITS[fit].part] = KITS[fit].gain; }
    if (t.isPlayer) for (const [k, v] of Object.entries((PU_MODES[P.mode] || PU_MODES.std).mods)) m[k] = (m[k] || 0) + v;
    const applied = {};
    for (const [k, v] of Object.entries(m)) { if (t.car.parts[k] == null || !v) continue; const nv = clamp(+(t.car.parts[k] + v).toFixed(1), 30, 99.5); applied[k] = +(nv - t.car.parts[k]).toFixed(1); t.car.parts[k] = nv; }
    if (Object.keys(applied).length) t.car.tmod = applied;
  }
}
// car value without the temporary modifiers (for honest comparisons in the UI)
export function basePart(team, id) { return +(team.car.parts[id] - (team.car.tmod?.[id] || 0)).toFixed(1); }

// =====================================================================================
// POWER UNIT SUPPLY (Formula Apex)
// =====================================================================================
export function supplierList(st) {
  const P = ensureDepth(st); if (!P?.sup) return [];
  return ENGINE_SUPPLIERS.map((e) => ({ ...e, power: +P.sup[e.id].power.toFixed(1), rel: +P.sup[e.id].rel.toFixed(1), trend: P.sup[e.id].trend, teams: Object.values(st.teams).filter((t) => t.engine === e.id).map((t) => t.short), works: Object.values(st.teams).find((t) => t.engine === e.id && t.works)?.name || null }));
}
export function puSeasonCost(st, supId, tier = 'customer') { const e = ENGINE_SUPPLIERS.find((x) => x.id === supId); return +((e?.cost || 16) * 0.5 * PU_TIERS[tier].cost).toFixed(1); }
export function puDeal(st) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  if (st.category !== 'formula') return null;
  if (pt.works) return { works: true, sup: pt.engine };
  const d = P.pu || (P.pu = { sup: pt.engine, tier: 'customer', until: st.season });
  return { ...d, cost: puSeasonCost(st, d.sup, d.tier), left: d.until - st.season + 1, T: PU_TIERS[d.tier] };
}
export function puBreakFee(st) { const d = puDeal(st); if (!d || d.works) return 0; return +(Math.max(0, d.until - st.season) * d.cost * 0.5).toFixed(1); }
export function signPuDeal(st, supId, tier, years) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  if (st.category !== 'formula' || pt.works) return { ok: false, msg: 'Sei un costruttore ufficiale: la power unit è tua.' };
  if (st.round > 0) return { ok: false, msg: 'I contratti di fornitura si firmano solo in pre-stagione.' };
  const sup = P.sup[supId]; if (!sup || !PU_TIERS[tier]) return { ok: false, msg: 'Fornitore non valido.' };
  const cur = puDeal(st);
  const fee = cur.sup !== supId ? puBreakFee(st) : 0;
  if (tier === 'partner' && statusIdx(st) < 2 && pt.rep < 78) return { ok: false, msg: 'Il costruttore concede la partnership tecnica solo a squadre con status Outsider o superiore.' };
  if (pt.money < fee) return { ok: false, msg: 'Fondi insufficienti per la penale di uscita.' };
  if (fee > 0) addFinance(st, 'Penale rescissione fornitura power unit', -fee);
  // remove the old deal's effect, apply the new one
  clearTrackMods(st);
  const oldS = P.sup[cur.sup], oldT = PU_TIERS[cur.tier], nwT = PU_TIERS[tier];
  bump(pt, 'engine', (sup.power + nwT.power) - (oldS.power + oldT.power));
  bump(pt, 'reliability', ((sup.rel + nwT.rel) - (oldS.rel + oldT.rel)) * 0.5);
  pt.engine = supId; P.pu = { sup: supId, tier, until: st.season + clamp(years, 1, 4) - 1 };
  applyTrackMods(st);
  addNews(st, `${pt.name} firma con ${ENGINE_SUPPLIERS.find((e) => e.id === supId)?.name} (${PU_TIERS[tier].name.toLowerCase()}) fino al ${P.pu.until}.`);
  return { ok: true, fee };
}
function suppliersWinter(st, isEra, focus) {
  const P = st.dp; if (!P.sup) return;
  const pt = playerTeam(st);
  const engEra = isEra && focus.includes('engine');
  const lines = [];
  for (const e of ENGINE_SUPPLIERS) {
    const s = P.sup[e.id];
    const mean = 87;
    const d = +(clamp(gauss(0, engEra ? 2.6 : 1.1) + (mean - s.power) * 0.12 + (s.trend || 0) * 0.5, -5, 5)).toFixed(1);
    const dr = +(clamp(gauss(0, engEra ? 2.5 : 1.2) + (83 - s.rel) * 0.15, -5, 5)).toFixed(1);
    s.power = clamp(+(s.power + d).toFixed(1), 78, 95); s.rel = clamp(+(s.rel + dr).toFixed(1), 70, 93); s.trend = d > 0.8 ? 1 : d < -0.8 ? -1 : 0;
    for (const t of Object.values(st.teams)) if (t.engine === e.id) { bump(t, 'engine', d * 0.8); bump(t, 'reliability', dr * 0.4); }
    if (Math.abs(d) >= 1.2) lines.push(`${e.name} ${d > 0 ? 'trova cavalli' : 'perde terreno'} (${d > 0 ? '+' : ''}${d})`);
  }
  if (lines.length) press(st, { kind: 'brief', tone: 'info', h: `Power unit ${st.season}: ${lines.join(', ')}`, t: '', tag: 'Motori' });
  // expired deal: auto-renew one season as customer (the player can renegotiate in pre-season)
  if (P.pu && !pt.works && P.pu.until < st.season) {
    if (P.pu.tier === 'partner') { clearTrackMods(st); bump(pt, 'engine', -PU_TIERS.partner.power); bump(pt, 'reliability', -PU_TIERS.partner.rel * 0.5); }
    P.pu = { sup: P.pu.sup, tier: 'customer', until: st.season };
    addMail(st, { from: 'Reparto Motori', icon: 'rd', type: 'info', subject: 'Fornitura power unit scaduta', body: `Il contratto di fornitura è scaduto: per non restare senza motore abbiamo prolungato di un anno come cliente con ${ENGINE_SUPPLIERS.find((e) => e.id === P.pu.sup)?.name}. In pre-stagione puoi rinegoziare o cambiare fornitore dal Centro Tecnico → Regolamento & PU.` });
  }
}

// =====================================================================================
// PEOPLE: form, injuries, reserve, feuds, paying drivers
// =====================================================================================
export function formLabel(f) { return f >= 1.6 ? 'Stato di grazia' : f >= 0.6 ? 'In forma' : f > -0.6 ? 'Forma regolare' : f > -1.6 ? 'In calo' : 'In crisi'; }
export function formClass(f) { return f >= 0.6 ? 'good' : f > -0.6 ? '' : f > -1.6 ? 'warn' : 'bad'; }
export function isInjured(st, d) { return !!(d?.injury && d.injury.season === st.season && st.round < d.injury.until); }
export function injuryText(st, d) { if (!isInjured(st, d)) return ''; const n = d.injury.until - st.round; return `Infortunato (${d.injury.what}): fuori per ${n} ${n === 1 ? 'evento' : 'eventi'}`; }
function peopleRound(st, res) {
  const pt = playerTeam(st); const C = st.category;
  const order = overallCarRanking(st);
  for (const r of res.classification) {
    const team = st.teams[r.teamId];
    const exp = team ? 1 + order.indexOf(team.id) * 2 : 10;
    for (const did of r.driverIds) {
      const d = st.drivers[did]; if (!d) continue;
      const delta = r.status === 'dnf' ? -0.5 : clamp((exp + 1 - r.pos) / 4, -1, 1.2);
      d.form = clamp(+((d.form || 0) * 0.72 + delta).toFixed(2), -3, 3);
      // form feeds morale (the race engine reads morale): hot streaks and slumps are real
      if (Math.abs(d.form) >= 1.2) d.morale = clamp(Math.round(d.morale + Math.sign(d.form)), 10, 100);
      // paying driver income
      if (team?.isPlayer && d.backing > 0 && d.teamId === pt.id) addFinance(st, `Sponsor personale di ${d.name}`, +(d.backing / st.calendar.length).toFixed(3));
      // injuries (circuit categories: the reserve driver steps in)
      if (cat(st).type !== 'rally' && r.status === 'dnf' && CRASH_RE.test(r.reason || '') && !isInjured(st, d) && st.round < st.calendar.length && chance(team?.isPlayer ? 0.07 : 0.05)) {
        const k = pick([1, 1, 1, 2, 2, 3, 4]);
        d.injury = { season: st.season, until: Math.min(st.calendar.length, st.round + k), what: pick(INJURIES) };
        if (team?.isPlayer) {
          const rs = reserveFor(st, team);
          addMail(st, { from: 'Centro Medico', icon: 'driver', type: 'bad', subject: `${d.name} infortunato: ${d.injury.what}`, body: `Dopo l’incidente i medici hanno fermato ${d.name}: ${d.injury.what}, salterà ${k === 1 ? 'il prossimo evento' : `i prossimi ${k} eventi`}.\n\nAl suo posto correrà il terzo pilota ${rs.name} (OVR ${driverOverall(rs, C)}). Puoi nominare un altro terzo pilota dalla schermata Piloti.` });
          press(st, { kind: 'team', tone: 'bad', h: `${last(d.name)} si ferma: ${d.injury.what}`, t: `${pt.name} dovrà fare a meno di ${d.name} per ${k} ${k === 1 ? 'evento' : 'eventi'}. Tocca a ${rs.name}.`, img: { k: 'driver', id: d.id }, tag: 'Infermeria' });
        } else if (driverOverall(d, C) >= 80) press(st, { kind: 'brief', tone: 'info', h: `${d.name} (${team?.short}) infortunato: ${d.injury.what}, salta ${k} ${k === 1 ? 'evento' : 'eventi'}`, t: '', tag: 'Infermeria' });
      }
    }
  }
  // sidelined drivers lose a bit of rhythm, bans implement the absence in the race engine
  for (const d of Object.values(st.drivers)) {
    if (d.ban && !(d.ban.season > st.season || (d.ban.season === st.season && d.ban.round >= st.round))) d.ban = null;
    if (isInjured(st, d)) d.ban = { season: st.season, round: st.round, injury: true };
    else if (d.injury && d.injury.season === st.season && st.round === d.injury.until && d.teamId === pt.id) { addMail(st, { from: 'Centro Medico', icon: 'driver', type: 'good', subject: `${d.name} è di nuovo abile`, body: `${d.name} ha superato le visite: torna in macchina dal prossimo evento.` }); d.injury = null; }
  }
}
export function reserveCandidates(st) {
  const C = st.category;
  const acad = Object.values(st.drivers).filter((d) => d.academy === st.playerTeam && !d.retired && !d.teamId);
  const free = Object.values(st.drivers).filter((d) => !d.teamId && !d.retired && !d.academy && !d.nextTeam && (!d.reserveFor || d.reserveFor === st.playerTeam)).sort((a, b) => driverOverall(b, C) - driverOverall(a, C)).slice(0, 8);
  return [...acad, ...free].map((d) => ({ d, ov: driverOverall(d, C), fee: d.academy ? 0 : +(salaryFor(d, C) * 0.08).toFixed(2), academy: !!d.academy }));
}
export function onLoan(st, d) { return d?.loan ? st.teams[d.loan.to] : null; }
export function currentReserve(st) { const pt = playerTeam(st); const r = pt.reserve ? st.drivers[pt.reserve] : null; return r && !r.teamId && !r.retired ? r : null; }
export function setReserve(st, id) {
  const pt = playerTeam(st); const d = st.drivers[id];
  if (!d || d.teamId || d.retired) return { ok: false, msg: 'Pilota non disponibile.' };
  const fee = d.academy ? 0 : +(salaryFor(d, st.category) * 0.08).toFixed(2);
  if (pt.money < fee) return { ok: false, msg: 'Fondi insufficienti per il gettone.' };
  const old = currentReserve(st); if (old) old.reserveFor = null;
  if (fee) addFinance(st, `Gettone terzo pilota ${d.name}`, -fee);
  pt.reserve = d.id; d.reserveFor = pt.id;
  return { ok: true };
}

// ---- loans: an academy junior races a season for a smaller team and comes back grown ----
export function loanTargets(st, d) {
  const C = st.category; const ov = driverOverall(d, C);
  if (!d || d.academy !== st.playerTeam || d.teamId || d.loan) return [];
  if (st.round > Math.floor(st.calendar.length * (hasFacPerk(playerTeam(st), 'academy', 5) ? 0.6 : 0.4))) return [];
  const taken = new Set(Object.values(st.drivers).filter((x) => x.loan).map((x) => x.teamId));
  return Object.values(st.teams).filter((t) => !t.isPlayer && !taken.has(t.id)).map((t) => {
    const ds = t.drivers.map((id) => st.drivers[id]).filter((x) => x && !isInjured(st, x)).sort((a, b) => driverOverall(a, C) - driverOverall(b, C));
    const w = ds[0]; const rel = principal(st, t.id)?.rel || 0;
    return w && driverOverall(w, C) <= ov + 2 + (rel >= 15 ? 2 : 0) && rel > -45 ? { team: t, out: w, outOv: driverOverall(w, C) } : null;
  }).filter(Boolean).sort((a, b) => avgPart(b.team) - avgPart(a.team)).slice(0, 3);
}
export function loanJunior(st, id, teamId) {
  const d = st.drivers[id]; const pt = playerTeam(st);
  const tg = loanTargets(st, d).find((x) => x.team.id === teamId) || null;
  if (!tg) return { ok: false, msg: 'Nessuna squadra disposta a dargli un sedile: deve valere almeno quanto il loro pilota più debole, e i prestiti si chiudono entro il 40% della stagione.' };
  const t = tg.team; const w = tg.out;
  t.drivers = t.drivers.filter((x) => x !== w.id); if (t.number1 === w.id) t.number1 = null;
  w.teamId = null; w.contract = 0; w.salary = salaryFor(w, st.category);
  if (pt.reserve === d.id) { pt.reserve = null; d.reserveFor = null; }
  d.teamId = t.id; d.contract = 1; d.salary = 0; d.morale = 85; d._s0 = d.stats.starts; d.loan = { from: pt.id, to: t.id, season: st.season };
  t.drivers.push(d.id);
  adjustRel(st, t.id, 6);
  addNews(st, `${d.name} (accademia ${pt.name}) in prestito a ${t.name} per la stagione ${st.season}.`);
  press(st, { kind: 'brief', tone: 'good', h: `Prestito: ${d.name} da ${pt.short} a ${t.name}`, t: '', tag: 'Mercato' });
  return { ok: true, team: t };
}
function loansReturn(st) {
  const pt = playerTeam(st);
  for (const d of Object.values(st.drivers)) {
    if (!d.loan) continue;
    const t = st.teams[d.teamId];
    if (t && !t.isPlayer) { t.drivers = t.drivers.filter((x) => x !== d.id); if (t.number1 === d.id) t.number1 = null; }
    const races = d.stats.starts - (d._s0 ?? d.stats.starts);
    const best = Math.min(99, ...st.calendar.flatMap((ev) => (ev.results?.classification || []).filter((r) => r.driverIds.includes(d.id) && r.status !== 'dnf').map((r) => r.pos)));
    if (d.teamId !== pt.id) { d.teamId = null; d.contract = 0; d.salary = 0; }
    d.nextTeam = null; d.nextSalary = null; d.nextYears = null; d.rivalOffer = null;
    d.attrs.exp = clamp(d.attrs.exp + Math.min(8, races), 0, 99);
    addMail(st, { from: 'Accademia', icon: 'star', type: 'good', subject: `${d.name} rientra dal prestito`, body: `${d.name} ha chiuso la stagione con ${t?.name || 'la squadra che lo ospitava'}: ${races} gare disputate${best < 99 ? `, miglior risultato ${best}°` : ''}. Un anno da titolare vale più di uno nelle serie minori: quest’inverno crescerà a pieno ritmo. È di nuovo a disposizione dell’accademia.` });
    d.loanSeason = st.season; d.loan = null;
  }
}

// =====================================================================================
// FANS, OWNER
// =====================================================================================
export function fansInfo(st) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  const perRace = merchPerRace(st);
  return { fans: P.fans, start: P.fans0.v, growth: (P.fans / Math.max(1, P.fans0.v) - 1) * 100, perRace, season: +(perRace * st.calendar.length).toFixed(2), rank: Object.values(st.teams).filter((t) => t.rep > pt.rep).length + 1 };
}
function merchPerRace(st) { const P = st.dp; const pt = playerTeam(st); return +(P.fans / 1000 * 0.11 * scale(st) * (1 + invLevel(pt, 'museum') * 0.15) * (hasFacPerk(pt, 'hospitality', 4) ? 1.1 : 1) * 20 / Math.max(6, st.calendar.length)).toFixed(3); }
export function fmtFans(k) { return k >= 1000 ? `${(k / 1000).toFixed(2).replace('.', ',')} mln` : `${Math.round(k)} mila`; }
function fansRound(st, res) {
  const P = st.dp; const pt = playerTeam(st);
  const mine = res.classification.filter((r) => r.teamId === pt.id && r.status !== 'dnf');
  const best = mine.length ? Math.min(...mine.map((r) => r.pos)) : 99;
  const stars = teamDrivers(st, pt).reduce((a, d) => a + (d.stats.titles > 0 ? 0.3 : 0) + (driverOverall(d, st.category) >= 88 ? 0.2 : 0), 0);
  const g = (best === 1 ? 1.6 : best <= 3 ? 0.8 : best <= 10 ? 0.15 : -0.35) + stars * 0.15 + (pt.facilities.hospitality - 3) * 0.05;
  const cap = 600 + pt.rep * pt.rep * 0.55; // a team's reach is bounded by its prestige
  P.fans = Math.max(80, Math.round(P.fans * (1 + g / 100 * (g > 0 && hasFacPerk(pt, 'hospitality', 5) ? 1.25 : 1) * clamp(1.4 - P.fans / cap, 0.15, 1.2))));
  const m = merchPerRace(st);
  if (m >= 0.005) addFinance(st, 'Merchandising e tifosi', m);
}
export function ownerInfo(st) {
  const P = ensureDepth(st); const pt = playerTeam(st); const O = OWNERS[P.owner.type] || OWNERS.gloria;
  const s = standings(st); const n = Object.keys(st.teams).length;
  let goal = '', now = '', ok = false;
  const myRes = st.calendar.flatMap((ev) => (ev.results?.classification || []).filter((r) => r.teamId === pt.id && r.status !== 'dnf'));
  if (P.owner.type === 'gloria') { const needWin = st.board.target <= 3; const k = myRes.filter((r) => r.pos <= (needWin ? 1 : 3)).length; goal = needWin ? 'Almeno una vittoria in stagione' : 'Almeno un podio in stagione'; now = `${k} ${needWin ? 'vittorie' : 'podi'}`; ok = k >= 1; }
  if (P.owner.type === 'bilancio') { const d = pt.money - (P.owner.money0 ?? pt.money); goal = 'Chiudere la stagione con la cassa non inferiore a quella iniziale'; now = `${d >= 0 ? '+' : ''}${fmtM(d)} dall’inizio`; ok = d >= 0; }
  if (P.owner.type === 'vivaio') { const y = teamDrivers(st, pt).filter((d) => d.age <= 23 || d.fromAcademy).length; goal = 'Un titolare di 23 anni o meno (o cresciuto in accademia) a fine stagione'; now = `${y} in squadra`; ok = y >= 1; }
  if (P.owner.type === 'tecnica') { const tgt = clamp(st.board.target - 1, 1, n - 1); const r = overallCarRanking(st).indexOf(pt.id) + 1; goal = `Vettura tra le prime ${tgt} della classifica tecnica a fine stagione`; now = `${r}ª vettura`; ok = r <= tgt; }
  if (P.owner.type === 'spettacolo') { const g = (P.fans / Math.max(1, P.fans0.v) - 1) * 100; goal = 'Tifosi in crescita di almeno il 6% nella stagione'; now = `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`; ok = g >= 6; }
  void s;
  return { ...O, type: P.owner.type, goal, now, ok, reward: +(pt.baseBudget * 0.03).toFixed(1) };
}

// =====================================================================================
// POLITICS: the Commission votes on rule proposals
// =====================================================================================
const budgetRank = (st, t) => { const a = Object.values(st.teams).sort((x, y) => y.baseBudget - x.baseBudget); return a.indexOf(t) / Math.max(1, a.length - 1); }; // 0 richest … 1 poorest
const perfRank = (st, t) => { const a = overallCarRanking(st); return a.indexOf(t.id) / Math.max(1, a.length - 1); }; // 0 best car … 1 worst
const PROPS = {
  cap_down: { cond: (st) => st.category === 'formula' && st.dp.rules.capMul > 0.8, title: 'Budget cap ridotto dell’8%', text: 'Le squadre piccole chiedono di abbassare il tetto di spesa su sviluppo e produzione.', eff: 'Budget cap -8% dalla prossima stagione', interest: (st, t) => budgetRank(st, t) * 2 - 1, apply: (st) => { st.dp.rules.capMul = +(st.dp.rules.capMul * 0.92).toFixed(3); } },
  cap_up: { cond: (st) => st.category === 'formula' && st.dp.rules.capMul < 1.2, title: 'Budget cap aumentato dell’8%', text: 'I grandi costruttori vogliono più libertà di spesa per «difendere l’eccellenza tecnica».', eff: 'Budget cap +8% dalla prossima stagione', interest: (st, t) => 1 - budgetRank(st, t) * 2, apply: (st) => { st.dp.rules.capMul = +(st.dp.rules.capMul * 1.08).toFixed(3); } },
  atr_steep: { cond: (st) => st.dp.rules.atrSlope < 0.6, title: 'Galleria del vento più progressiva', text: 'Più ore di sviluppo a chi è indietro in classifica, meno a chi vince.', eff: 'Scala ATR più ripida: l’ultimo sviluppa molto più del primo', interest: (st, t) => perfRank(st, t) * 2 - 1, apply: (st) => { st.dp.rules.atrSlope = +(st.dp.rules.atrSlope + 0.1).toFixed(2); } },
  atr_flat: { cond: (st) => st.dp.rules.atrSlope > 0.3, title: 'Galleria del vento uguale per tutti', text: 'I top team vogliono ridurre il vantaggio di sviluppo concesso a chi è indietro.', eff: 'Scala ATR più piatta', interest: (st, t) => 1 - perfRank(st, t) * 2, apply: (st) => { st.dp.rules.atrSlope = +(st.dp.rules.atrSlope - 0.1).toFixed(2); } },
  prize_flat: { cond: (st) => st.dp.rules.prizeMul > 0.6, title: 'Montepremi più equo', text: 'Una distribuzione più piatta dei premi: meno al campione, più a chi chiude in fondo.', eff: 'Differenza di premio tra le posizioni -25%', interest: (st, t) => perfRank(st, t) * 2 - 1, apply: (st) => { st.dp.rules.prizeMul = +(st.dp.rules.prizeMul * 0.75).toFixed(3); } },
  prize_top: { cond: (st) => st.dp.rules.prizeMul < 1.5, title: 'Montepremi più meritocratico', text: 'Chi vince incassa di più: premi più ricchi in cima, più magri in coda.', eff: 'Differenza di premio tra le posizioni +25%', interest: (st, t) => 1 - perfRank(st, t) * 2, apply: (st) => { st.dp.rules.prizeMul = +(st.dp.rules.prizeMul * 1.25).toFixed(3); } },
  era_early: { cond: (st) => st.dp.era.next - st.season >= 3, title: 'Anticipare il nuovo regolamento tecnico', text: 'Chi insegue vuole rimescolare le carte un anno prima del previsto.', eff: 'Il cambio regolamentare arriva un anno prima', interest: (st, t) => perfRank(st, t) * 2 - 1, apply: (st) => { st.dp.era.next -= 1; } },
  era_delay: { cond: (st) => st.dp.era.next - st.season === 2, title: 'Rinviare di un anno il nuovo regolamento', text: 'I team al vertice chiedono stabilità: «Le nuove regole costano troppo».', eff: 'Il cambio regolamentare slitta di un anno', interest: (st, t) => 1 - perfRank(st, t) * 2, apply: (st) => { st.dp.era.next += 1; } },
  freeze: { cond: (st) => st.category !== 'junior' && st.dp.rules.freeze <= st.season, title: 'Congelamento dei motori per una stagione', text: 'Per contenere i costi, lo sviluppo del motore verrebbe bloccato per tutta la prossima stagione.', eff: 'Nessun progetto sul motore della vettura attuale nella prossima stagione', interest: (st, t) => { const a = Object.values(st.teams).sort((x, y) => y.car.parts.engine - x.car.parts.engine); return 1 - (a.indexOf(t) / Math.max(1, a.length - 1)) * 2; }, apply: (st) => { st.dp.rules.freeze = st.season + 1; } },
  tokens_up: { cond: (st) => st.category !== 'junior' && st.dp.rules.tokens < 9, title: 'Più gettoni di omologazione', text: 'Chi ha il motore meno potente chiede più libertà di sviluppo sui componenti omologati.', eff: '+2 gettoni di sviluppo a stagione', interest: (st, t) => { const a = Object.values(st.teams).sort((x, y) => y.car.parts.engine - x.car.parts.engine); return (a.indexOf(t) / Math.max(1, a.length - 1)) * 2 - 1; }, apply: (st) => { st.dp.rules.tokens += 2; } },
};
function voteStances(st, id) {
  const pr = PROPS[id]; if (!pr) return [];
  return Object.values(st.teams).filter((t) => !t.isPlayer).map((t) => { const v = clamp(pr.interest(st, t), -1, 1); return { id: t.id, v, side: v > 0.25 ? 'yes' : v < -0.25 ? 'no' : 'open' }; });
}
export function voteView(st, pd) {
  const pr = PROPS[pd.prop]; if (!pr) return null;
  const pt = playerTeam(st);
  const sts = voteStances(st, pd.prop);
  const y = sts.filter((s) => s.side === 'yes').length, n = sts.filter((s) => s.side === 'no').length, o = sts.length - y - n;
  const mine = clamp(pr.interest(st, pt), -1, 1);
  const allies = sts.filter((s) => (principal(st, s.id)?.rel || 0) >= 15).length;
  return { pr, y, n, o, mine, allies, need: Math.floor((sts.length + 1) / 2) + 1, total: sts.length + 1, cost: +(1.2 * scale(st)).toFixed(2) };
}
function runVote(st, pd, choice) {
  // choice: 0 yes, 1 no, 2 lobby yes, 3 lobby no
  const pr = PROPS[pd.prop]; const pt = playerTeam(st); const P = st.dp;
  const my = choice === 0 || choice === 2 ? 'yes' : 'no';
  const lobby = choice >= 2;
  const v = voteView(st, pd);
  if (lobby) addFinance(st, 'Attività politica in Commissione', -v.cost);
  let yes = my === 'yes' ? 1 : 0; const swung = [];
  for (const s of voteStances(st, pd.prop)) {
    let pYes = clamp(0.5 + s.v * 0.75, 0.03, 0.97);
    const rel = principal(st, s.id)?.rel || 0;
    if (lobby && s.side !== my) {
      const k = rel >= 15 ? 0.3 + rel / 250 : s.side === 'open' && rel > -15 ? 0.2 : 0;
      if (k > 0 && chance(k)) { pYes = my === 'yes' ? 0.95 : 0.05; swung.push(s.id); if (rel >= 15) adjustRel(st, s.id, -6); }
    }
    const vy = chance(pYes);
    if (vy) yes++;
    adjustRel(st, s.id, (vy ? 'yes' : 'no') === my ? 1 : -1);
  }
  const pass = yes >= v.need;
  if (pass) pr.apply(st);
  const res = { prop: pd.prop, title: pr.title, season: st.season, pass, yes, total: v.total, my, lobby, swung: swung.length };
  P.votes.hist.unshift(res); P.votes.hist.length = Math.min(P.votes.hist.length, 12);
  press(st, { kind: 'brief', tone: pass === (my === 'yes') ? 'good' : 'bad', h: `Commissione: ${pr.title.toLowerCase()} — ${pass ? 'approvata' : 'bocciata'} (${yes}-${v.total - yes})`, t: '', tag: 'Politica' });
  return `${pass ? 'Approvata' : 'Bocciata'} ${yes}-${v.total - yes}${swung.length ? ` · ${swung.length} vot${swung.length === 1 ? 'o spostato' : 'i spostati'} dalla tua lobby` : ''}${pass ? ` · ${pr.eff}` : ''}`;
}
export function rulesInForce(st) {
  const P = ensureDepth(st); const R = P.rules; const out = [];
  if (st.category === 'formula') out.push({ k: 'Budget cap', v: `${Math.round(R.capMul * 100)}% del valore base`, mod: R.capMul !== 1 });
  out.push({ k: 'Scala galleria del vento (ATR)', v: `1° ${Math.round((0.72 + 0.215 - R.atrSlope / 2) * 100)}% · ultimo ${Math.round((0.72 + 0.215 + R.atrSlope / 2) * 100)}%`, mod: R.atrSlope !== 0.43 });
  out.push({ k: 'Montepremi', v: R.prizeMul === 1 ? 'Distribuzione standard' : R.prizeMul < 1 ? `Più equo (scarto ${Math.round(R.prizeMul * 100)}%)` : `Più meritocratico (scarto ${Math.round(R.prizeMul * 100)}%)`, mod: R.prizeMul !== 1 });
  if (st.category !== 'junior') out.push({ k: 'Gettoni di omologazione motore', v: `${R.tokens} a stagione${R.freeze >= st.season ? ` · congelamento nel ${R.freeze}` : ''}`, mod: R.tokens !== 6 || R.freeze >= st.season });
  return out;
}
export function voteHistory(st) { return ensureDepth(st).votes.hist; }

// =====================================================================================
// PENDING DECISIONS (plugged into the dynasty decision modal)
// =====================================================================================
export function depthMaybeDecision(st) {
  const P = ensureDepth(st); if (!P || st.pendingDyn) return;
  const n = st.calendar.length; const pt = playerTeam(st);
  // era announcement: choose when to switch
  if (P.era.next - st.season === 1 && !P.era.asked && st.round <= Math.floor(n * 0.4)) { P.era.asked = true; st.pendingDyn = { kind: 'era' }; return; }
  // commission votes
  for (const [key, at] of [['a', Math.floor(n * 0.3)], ['b', Math.floor(n * 0.7)]]) {
    const k = `${st.season}${key}`;
    if (st.round >= at && st.round > 0 && st.round < n - 1 && !P.votes.done[k]) {
      P.votes.done[k] = 1;
      const cands = Object.keys(PROPS).filter((id) => PROPS[id].cond(st) && P.votes.hist[0]?.prop !== id);
      if (!cands.length) continue;
      // proposals hostile to the dominant team are tabled more often: politics as anti-snowball
      const leader = overallCarRanking(st)[0] === pt.id;
      const prop = leader && chance(0.6) ? (cands.filter((id) => PROPS[id].interest(st, pt) < 0)[0] || pick(cands)) : pick(cands);
      const pd = { kind: 'vote', prop };
      if (P.pol.autoVote || (P.pol.minorVote && Math.abs(PROPS[prop].interest(st, pt)) <= 0.25)) { const out = runVote(st, pd, PROPS[prop].interest(st, pt) >= 0 ? 0 : 1); addMail(st, { from: 'Delegato in Commissione', icon: 'rules', type: 'info', subject: `Voto in Commissione: ${PROPS[prop].title}`, body: `${PROPS[prop].text}\n\nCome da delega, abbiamo votato secondo l’interesse della squadra, senza fare lobby. Esito: ${out}.` }); continue; }
      st.pendingDyn = pd; return;
    }
  }
  // team-mate feud
  const ds = teamDrivers(st, pt);
  if (ds.length >= 2 && st.round > 1 && P.feudSeason !== st.season) {
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      if (heatOf(st, ds[i].id, ds[j].id) >= 55) { P.feudSeason = st.season; st.pendingDyn = { kind: 'feud', a: ds[i].id, b: ds[j].id }; return; }
    }
  }
}
export function depthDecisionView(st, pd) {
  const pt = playerTeam(st);
  if (pd.kind === 'era') {
    const e = eraInfo(st);
    return { tag: 'Nuovo regolamento tecnico', from: 'Direttore Tecnico', title: `${st.season + 1}: ${e.nextName}. Quando cambiamo progetto?`,
      text: `La Federazione ha confermato la rivoluzione del ${st.season + 1}: ${e.nextTxt}. I valori in pista verranno in gran parte azzerati, soprattutto su ${e.focusNames.join(' e ')}: chi arriva preparato può ribaltare le gerarchie, chi sbaglia paga per anni. La galleria del vento non basta per due vetture: quanta parte della fabbrica spostiamo sul progetto nuovo? Potrai cambiare idea dal Centro Tecnico fino al 70% della stagione.`,
      a: Object.entries(ERA_POLICY).map(([k, p]) => ({ t: p.name, note: `${p.desc} Stima sulla nuova vettura: ${(p.share - 0.5) * 6 >= 0 ? '+' : ''}${((p.share - 0.5) * 6).toFixed(1)} sui componenti chiave (±2).`, risk: k === 'early' })) };
  }
  if (pd.kind === 'vote') {
    const v = voteView(st, pd); if (!v) return null;
    const why = v.mine > 0.25 ? 'Ci conviene' : v.mine < -0.25 ? 'Ci danneggia' : 'Per noi cambia poco';
    return { tag: 'Commissione · voto sul regolamento', from: 'Federazione Internazionale', title: v.pr.title,
      text: `${v.pr.text} Effetto se approvata: ${v.pr.eff}. ${why}. Intenzioni di voto: ${v.y} favorevoli, ${v.n} contrari, ${v.o} indecisi (servono ${v.need} voti su ${v.total}). Hai ${v.allies} team principal in buoni rapporti: con la lobby puoi chiedere loro un favore, ma i favori si consumano.`,
      a: [{ t: 'Votiamo sì', note: 'Solo il nostro voto' }, { t: 'Votiamo no', note: 'Solo il nostro voto' }, { t: 'Lobby per il sì', note: `${fmtM(v.cost)} · gli alleati possono cambiare voto (rapporto -6 con chi ti fa il favore)`, risk: true }, { t: 'Lobby per il no', note: `${fmtM(v.cost)} · gli alleati possono cambiare voto (rapporto -6 con chi ti fa il favore)`, risk: true }] };
  }
  if (pd.kind === 'feud') {
    const a = st.drivers[pd.a], b = st.drivers[pd.b]; if (!a || !b || a.teamId !== pt.id || b.teamId !== pt.id) return null;
    return { tag: 'Guerra in casa', from: 'Ufficio Stampa', title: `${last(a.name)} contro ${last(b.name)}: il box è spaccato`,
      text: `La rivalità tra ${a.name} e ${b.name} è fuori controllo: meccanici divisi in due fazioni, frecciate in conferenza stampa, rischio di contatti in pista. Il morale di entrambi sta scendendo. Serve una decisione del team principal.`,
      a: [{ t: `Gerarchie chiare: ${last(driverOverall(a, st.category) >= driverOverall(b, st.category) ? a.name : b.name)} prima guida`, note: 'Rivalità -30 · il secondo pilota perde 10 di morale e potrebbe voler andare via' }, { t: 'Riunione chiarificatrice', note: '60%: rivalità -30 e morale +3 per entrambi · 40%: volano parole grosse (morale -5)', risk: true }, { t: 'Che corrano: liberi di lottare', note: 'Entrambi più motivati (forma +) ma morale -3 e la rivalità resta: rischio incidenti tra compagni', risk: true }] };
  }
  return null;
}
export function depthResolveDecision(st, pd, i) {
  const pt = playerTeam(st); const P = ensureDepth(st);
  if (pd.kind === 'era') { const k = Object.keys(ERA_POLICY)[i] || 'bal'; P.era.policy = k; return ERA_POLICY[k].name; }
  if (pd.kind === 'vote') return runVote(st, pd, i);
  if (pd.kind === 'feud') {
    const a = st.drivers[pd.a], b = st.drivers[pd.b]; if (!a || !b) return '';
    if (i === 0) { const one = driverOverall(a, st.category) >= driverOverall(b, st.category) ? a : b; const two = one === a ? b : a; pt.number1 = one.id; two.morale = clamp(two.morale - 10, 10, 100); addHeat(st, a.id, b.id, -30); return `${last(one.name)} prima guida`; }
    if (i === 1) { if (chance(0.6)) { addHeat(st, a.id, b.id, -30); for (const d of [a, b]) d.morale = clamp(d.morale + 3, 10, 100); return 'Pace fatta'; } for (const d of [a, b]) d.morale = clamp(d.morale - 5, 10, 100); return 'Riunione finita male'; }
    for (const d of [a, b]) { d.morale = clamp(d.morale - 3, 10, 100); d.form = clamp((d.form || 0) + 0.8, -3, 3); }
    return 'Liberi di lottare';
  }
  return '';
}

// =====================================================================================
// WORLD: AI momentum, sackings, takeovers, rumours
// =====================================================================================
export function aiDevFactor(st, team) {
  const P = st.dp; if (!P) return 1;
  const all = Object.values(st.teams);
  const best = Math.max(...all.map((t) => avgPart(t)));
  const chase = 1 + clamp((best - avgPart(team) - 2) / 30, 0, 0.12);
  return (1 + (P.ai[team.id]?.mom || 0) * 0.25) * chase * eraDevMult(st, team) * (1 + dominance(st) * 0.12 * diffOf(st).chase);
}
// consecutive constructors' titles of the player in this category (the paddock reacts to a dynasty)
export function dominance(st) {
  const ys = new Set((st.career?.trophies || []).filter((t) => t.type === 'Costruttori' && t.category === st.category).map((t) => t.season));
  let n = 0; for (let y = st.season - 1; ys.has(y); y--) n++;
  return Math.min(3, n);
}
export function aiTrend(st, teamId) { const m = st.dp?.ai?.[teamId]?.mom || 0; return { mom: m, label: m >= 0.45 ? 'In forte ascesa' : m >= 0.15 ? 'In crescita' : m > -0.15 ? 'Stabile' : m > -0.45 ? 'In calo' : 'In crisi', cls: m >= 0.15 ? 'good' : m > -0.15 ? '' : m > -0.45 ? 'warn' : 'bad', arrow: m >= 0.45 ? '▲▲' : m >= 0.15 ? '▲' : m > -0.15 ? '■' : m > -0.45 ? '▼' : '▼▼' }; }
function worldLog(st, text, kind = 'info') { const P = st.dp; P.world.unshift({ s: st.season, text, kind }); P.world.length = Math.min(P.world.length, 30); }
export function worldEvents(st) { return ensureDepth(st).world; }
function staffName() { return `${pick(STAFF_NAMES.first)} ${pick(STAFF_NAMES.last)}`; }
function worldWinter(st, sum) {
  const P = st.dp; const teams = Object.values(st.teams).filter((t) => !t.isPlayer);
  const n = Object.keys(st.teams).length;
  const byRep = Object.values(st.teams).slice().sort((a, b) => b.rep - a.rep).map((t) => t.id);
  const eraNext = P.era.next - st.season === 1; // the season that starts now is the last of the era
  for (const t of teams) {
    const a = P.ai[t.id] ||= { mom: 0, reb: 0 };
    const exp = byRep.indexOf(t.id) + 1; const pos = t.lastPos || exp;
    a.mom = clamp(+(a.mom * 0.5 + gauss(0, 0.38) + ((exp - pos) / n) * 0.9).toFixed(2), -1, 1);
    const orig = TEAMS[st.category].find((x) => x.id === t.id)?.budget || t.baseBudget;
    t.baseBudget = +clamp(t.baseBudget * (1 + a.mom * 0.05), orig * 0.65, orig * 1.6).toFixed(2);
    if (eraNext) a.prep = clamp(+(rand(0.15, 0.6) + ((pos - 1) / Math.max(1, n - 1)) * 0.45).toFixed(2), 0, 1);
    // technical director sacked after a slump
    if (a.mom < -0.4 && chance(0.45)) {
      const old = st.staff[t.staff.td];
      const nr = Math.round(clamp(gauss(80, 7), 62, 96));
      if (old) { const nm = staffName(); worldLog(st, `${t.name} licenzia il direttore tecnico ${old.name}: arriva ${nm} (${nr}).`, 'staff'); old.name = nm; old.rating = nr; old.age = randInt(34, 58); }
      a.mom = clamp(a.mom + 0.25, -1, 1);
    }
    // team principal sacked
    const p = principal(st, t.id);
    if (p && pos >= exp + 3 && chance(0.4)) {
      const nm = staffName(); const persona = pick(Object.keys(TP_PERSONAS));
      worldLog(st, `${t.name} esonera il team principal ${p.name}. Al suo posto ${nm}, ${TP_PERSONAS[persona].name.toLowerCase()}.`, 'tp');
      press(st, { kind: 'team', tone: 'info', h: `Ribaltone ${t.name}: via ${last(p.name)}, arriva ${last(nm)}`, t: `Dopo una stagione sotto le attese (${pos}° posto), la proprietà cambia guida. ${nm} ha fama di ${TP_PERSONAS[persona].name.toLowerCase()}.`, img: { k: 'team', id: t.id }, tag: 'Mercato' });
      p.name = nm; p.persona = persona; p.rel = 0; p.quote = null; t.principal = nm;
    }
  }
  // takeover / rebrand of a struggling team (at most one per winter)
  const cands = teams.filter((t) => (t.lastPos || 1) > n * 0.55 && st.season - (P.ai[t.id].reb || 0) >= 6);
  if (cands.length && chance(0.2)) {
    const t = pick(cands); const a = P.ai[t.id];
    const used = new Set(Object.values(st.teams).map((x) => x.name.split(' ')[0]));
    const first = shuffle(REBRAND_A).find((x) => !used.has(x)) || 'Nova';
    const name = `${first} ${pick(REBRAND_B[st.category] || REBRAND_B.formula)}`;
    let short = first.slice(0, 3).toUpperCase(); if (Object.values(st.teams).some((x) => x.short === short)) short = (first[0] + first[2] + first[first.length - 1]).toUpperCase();
    const who = pick(TYCOONS); const col = pick(REBRAND_COL); const oldName = t.name;
    t.formerNames = [...(t.formerNames || []), { name: oldName, until: st.season - 1 }];
    t.name = name; t.short = short; t.colors = col.slice(); t.car.livery = { ...t.car.livery, primary: col[0], secondary: col[1], accent: col[2] };
    t.baseBudget = +(t.baseBudget * 1.3).toFixed(2); for (const k of Object.keys(t.facilities)) if (t.facilities[k] < 4 && chance(0.5)) t.facilities[k]++;
    a.mom = clamp(a.mom + 0.7, -1, 1); a.reb = st.season;
    worldLog(st, `${who[0].toUpperCase() + who.slice(1)} rileva ${oldName}: nasce ${name}. Budget +30% e strutture potenziate.`, 'takeover');
    press(st, { kind: 'team', tone: 'info', h: `Addio ${oldName}: nasce ${name}`, t: `${who[0].toUpperCase() + who.slice(1)} ha acquistato la squadra e promette investimenti massicci. Nuovo nome, nuovi colori, nuove ambizioni.`, img: { k: 'team', id: t.id }, tag: 'Business' });
    addNews(st, `${oldName} cambia proprietà e diventa ${name}.`);
  }
  // AI budget cap breach (Formula): the paddock loves a scandal
  if (st.category === 'formula' && chance(0.12)) {
    const t = pick(teams.filter((x) => (x.lastPos || 9) <= 5));
    if (t) { const pen = pick([10, 15, 25]); P.ptsPen[st.season] = { ...(P.ptsPen[st.season] || {}), [t.id]: pen }; worldLog(st, `Budget cap: ${t.name} oltre il tetto nel ${st.season - 1}. Multa e ${pen} punti di penalità nel ${st.season}.`, 'cap'); press(st, { kind: 'team', tone: 'info', h: `Scandalo budget cap: ${t.name} punita`, t: `La verifica della Federazione rileva uno sforamento: ${pen} punti in meno nel campionato costruttori ${st.season} e meno ore di galleria.`, img: { k: 'team', id: t.id }, tag: 'Federazione' }); P.ai[t.id].mom = clamp(P.ai[t.id].mom - 0.2, -1, 1); }
  }
  void sum;
}
// rumour sources: each has a track record the player can learn to read
export const RUMOUR_SOURCES = [
  { id: 'in', name: 'fonte interna', rel: 'Alta' },
  { id: 'jr', name: 'giornalista accreditato', rel: 'Media' },
  { id: 'tb', name: 'tabloid', rel: 'Bassa' },
];
export function sourceStats(st) {
  const P = ensureDepth(st); const out = {};
  for (const S of RUMOUR_SOURCES) { const l = P.rum.filter((r) => r.src === S.id && r.ok != null); out[S.id] = { ...S, n: l.length, ok: l.filter((r) => r.ok).length, pct: l.length ? Math.round((l.filter((r) => r.ok).length / l.length) * 100) : null }; }
  return out;
}
function rumourRound(st) {
  const P = st.dp; const n = st.calendar.length; const C = st.category;
  if (st.round < Math.floor(n * 0.4) || st.round >= n || !chance(0.75)) return;
  const pool = Object.values(st.drivers).filter((d) => d.teamId && d.contract === 1 && !d.retired && driverOverall(d, C) >= 74 && !P.rum.some((r) => r.d === d.id && r.s === st.season));
  if (!pool.length) return;
  const real = pool.filter((d) => d.nextTeam || d.rivalOffer);
  const d = real.length && chance(0.6) ? pick(real) : pick(pool);
  const cur = st.teams[d.teamId];
  let to = d.nextTeam || d.rivalOffer?.teamId;
  if (!to || chance(0.12)) { const c = Object.values(st.teams).filter((t) => t.id !== d.teamId && !t.isPlayer); to = pick(c)?.id; }
  if (!to || !st.teams[to]) return;
  const isReal = to === (d.nextTeam || d.rivalOffer?.teamId);
  const src = RUMOUR_SOURCES[isReal ? (chance(0.7) ? 0 : chance(0.5) ? 1 : 2) : (chance(0.65) ? 2 : chance(0.6) ? 1 : 0)];
  P.rum.push({ d: d.id, name: d.name, from: cur.short, to, toName: st.teams[to].name, s: st.season, r: st.round, src: src.id });
  if (P.rum.length > 40) P.rum.splice(0, P.rum.length - 40);
  const T = [`Radio paddock: ${d.name} verso ${st.teams[to].name}?`, `Voci insistenti: ${st.teams[to].name} corteggia ${last(d.name)}`, `${last(d.name)} visto nel motorhome ${st.teams[to].short}: indizio o depistaggio?`, `Il manager di ${last(d.name)} a cena con i vertici ${st.teams[to].short}`];
  press(st, { kind: 'brief', tone: cur.isPlayer ? 'bad' : 'info', h: `${pick(T)} (${src.name})`, t: '', tag: 'Voci di mercato' });
}
function rumoursVerify(st) {
  const P = st.dp;
  for (const r of P.rum) { if (r.s !== st.season - 1 || r.ok != null) continue; const d = st.drivers[r.d]; r.ok = !!d && d.teamId === r.to; P.rumStat.tot++; if (r.ok) P.rumStat.ok++; }
}
export function rumourList(st) { return ensureDepth(st).rum.slice().reverse(); }
export function rumourStat(st) { return ensureDepth(st).rumStat; }

// Formula Apex 2 is a school: the champion cannot defend the title and the best graduate to Formula Apex.
// Called by season.newSeason before the winter market, so the seats are filled again by rookies and free agents.
export function juniorGraduation(st) {
  if (st.category !== 'junior' || st.quick) return;
  const P = ensureDepth(st); const pt = playerTeam(st); const C = st.category;
  const champName = (st.champions || []).filter((c) => c.season === st.season - 1 && c.category === 'junior').slice(-1)[0]?.driver;
  const f1 = TEAMS.formula || [];
  const out = [];
  for (const d of Object.values(st.drivers)) {
    if (d.retired || d.academy) continue;
    const ov = driverOverall(d, C); const champ = d.name === champName && !!d.teamId;
    const mine = d.teamId === pt.id;
    let go = champ;
    if (!go && d.nextTeam === pt.id) continue; // he has already signed for us
    if (!go && d.teamId && !mine) go = (ov >= 82 && chance(0.8)) || (ov >= 78 && d.age >= 23 && chance(0.5)) || (d.age >= 26 && chance(0.6));
    // no Formula Apex 2 contract can hold a driver the top series calls up: you get the training fee instead
    if (!go && mine) go = (d.contract <= 1 && (ov >= 80 || d.age >= 25)) || (ov >= 82 && chance(0.75)) || d.age >= 26;
    if (!go && !d.teamId) go = d.age >= 26 || (ov >= 82 && chance(0.6)); // free agents move on too
    if (!go) continue;
    const to = pick(f1)?.name || 'Formula Apex';
    const t = d.teamId ? st.teams[d.teamId] : null;
    if (t) { t.drivers = t.drivers.filter((x) => x !== d.id); if (t.number1 === d.id) t.number1 = null; }
    if (t || ov >= 80) out.push({ d, ov, champ, to, mine, team: t });
    if (mine) {
      const fee = +(salaryFor(d, C) * (champ ? 2.5 : 1.5) + (champ ? 0.6 : 0.2)).toFixed(2);
      addFinance(st, `Indennizzo di formazione ${d.name}`, fee);
      pt.rep = clamp(+(pt.rep + (champ ? 1.5 : 0.6)).toFixed(1), 20, 100);
      addMail(st, { from: 'Ufficio Contratti', icon: 'star', type: 'good', subject: `${d.name} promosso in Formula Apex`, body: `${champ ? 'Da regolamento il campione non può difendere il titolo: ' : ''}${d.name} sale in Formula Apex con ${to}. Per la squadra è un vanto e un incasso: indennizzo di formazione di ${fmtM(fee)} e prestigio in crescita. Il sedile è libero: scegli il prossimo talento dal Mercato o dall’accademia.` });
    }
    d.teamId = null; d.contract = 0; d.retired = true; d.graduated = st.season; d.nextTeam = null; d.rivalOffer = null;
    if (d.stats.titles > 0 || d.stats.wins >= 3) P.hof.unshift({ name: d.name, nat: d.nat, wins: d.stats.wins, titles: d.stats.titles, podiums: d.stats.podiums, poles: d.stats.poles, starts: d.stats.starts, team: `→ ${to}`, season: st.season - 1, age: d.age });
  }
  if (P.hof.length > 40) P.hof.length = 40;
  for (const [id, d] of Object.entries(st.drivers)) if (d.graduated && d.graduated <= st.season - 3) delete st.drivers[id];
  const top = out.sort((a, b) => (b.champ ? 99 : b.ov) - (a.champ ? 99 : a.ov)).slice(0, 5);
  if (top.length) {
    worldLog(st, `Promossi in Formula Apex: ${top.map((x) => `${x.d.name} (${x.to})`).join(', ')}.`, 'grad');
    press(st, { kind: 'team', tone: 'info', h: `La classe del ${st.season - 1} sale di categoria`, t: `${top.map((x) => `${x.d.name}${x.champ ? ', campione,' : ''} con ${x.to}`).join('; ')}. In Formula Apex 2 si liberano i sedili migliori.`, img: { k: 'trophy' }, tag: 'Mercato' });
  }
}

// =====================================================================================
// HALL OF FAME & RECORDS
// =====================================================================================
export function recordRetirement(st, d) {
  const P = ensureDepth(st); if (!P) return;
  if (d.stats.titles < 1 && d.stats.wins < 5 && d.stats.podiums < 15) return;
  P.hof.unshift({ name: d.name, nat: d.nat, wins: d.stats.wins, titles: d.stats.titles, podiums: d.stats.podiums, poles: d.stats.poles, starts: d.stats.starts, team: st.teams[d.teamId]?.name || '', season: st.season - 1, age: d.age });
  if (P.hof.length > 40) P.hof.length = 40;
}
export function hallOfFame(st) { return ensureDepth(st)?.hof || []; }
export function allTimeRecords(st) {
  const P = ensureDepth(st);
  const rows = [...Object.values(st.drivers).filter((d) => d.stats.starts > 0).map((d) => ({ name: d.name, nat: d.nat, active: !d.retired, team: st.teams[d.teamId]?.short || '', ...d.stats })), ...(P?.hof || []).filter((h) => !Object.values(st.drivers).some((d) => d.name === h.name)).map((h) => ({ ...h, active: false, team: '' }))];
  const top = (k) => rows.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5);
  const teams = Object.entries(P?.teamRec || {}).map(([id, r]) => ({ id, name: st.teams[id]?.name || r.name, ...r })).sort((a, b) => b.titles - a.titles || b.wins - a.wins);
  return { wins: top('wins'), titles: top('titles'), podiums: top('podiums'), poles: top('poles'), teams };
}

// =====================================================================================
// HOOKS
// =====================================================================================
export function ptsPenalty(st, teamId) { return st.dp?.ptsPen?.[st.season]?.[teamId] || 0; }
// Budget cap audit for the player (called by season.endSeason with the overspend in M€)
export function capAudit(st, over, cap) {
  const P = ensureDepth(st); const pt = playerTeam(st);
  if (over <= cap * 0.05) return null;
  const pen = over > cap * 0.15 ? 30 : 15;
  P.ptsPen[st.season + 1] = { ...(P.ptsPen[st.season + 1] || {}), [pt.id]: pen };
  return pen;
}
export function depthPostRound(st, res, track) {
  const P = ensureDepth(st); if (!P) return;
  const pt = playerTeam(st); const n = st.calendar.length;
  eraRound(st);
  suspectsRound(st);
  peopleRound(st, res);
  fansRound(st, res);
  // power unit supply instalment
  if (st.category === 'formula' && !pt.works && P.pu) addFinance(st, `Fornitura power unit (${PU_TIERS[P.pu.tier].name.toLowerCase()})`, -(puSeasonCost(st, P.pu.sup, P.pu.tier) / n));
  // staff on gardening leave
  for (const inc of P.incoming.slice()) {
    if (inc.season === st.season && st.round < inc.at) continue;
    P.incoming = P.incoming.filter((x) => x !== inc);
    const s = st.staff[inc.id]; if (!s || s.teamId !== pt.id) continue;
    const old = st.staff[pt.staff[s.role]]; if (old && old.id !== s.id) old.teamId = null;
    pt.staff[s.role] = s.id;
    addMail(st, { from: 'Risorse Umane', icon: 'users', type: 'good', subject: `${s.name} prende servizio`, body: `Terminato il periodo di gardening leave, ${s.name} (${s.rating}) è operativo da oggi.` });
  }
  // team records
  const w = res.classification[0];
  if (w && w.status !== 'dnf') { const r = (P.teamRec[w.teamId] ||= { name: st.teams[w.teamId]?.name, wins: 0, titles: 0 }); r.wins++; r.name = st.teams[w.teamId]?.name; }
  rumourRound(st);
  // era reminder at mid season
  if (P.era.next - st.season === 1 && st.round === Math.floor(n * 0.5) && !P.era.told) { P.era.told = true; const e = eraInfo(st); addMail(st, { from: 'Direttore Tecnico', icon: 'rules', type: 'info', subject: `Progetto ${st.season + 1}: a che punto siamo`, body: `Preparazione al nuovo regolamento (${e.nextName}): ${Math.round(e.prep * 100)}% finora, ${Math.round(e.proj * 100)}% previsto a fine stagione con la linea «${e.pol.name}». Stima sulla nuova vettura: ${e.swing >= 0 ? '+' : ''}${e.swing} sui componenti chiave. Puoi ancora cambiare linea dal Centro Tecnico → Regolamento & PU.` }); }
  applyTrackMods(st);
  void track;
}
export function depthEndSeason(st, sum) {
  const P = ensureDepth(st); if (!P) return;
  const pt = playerTeam(st);
  const champTeam = sum.st.teams[0]?.id;
  if (champTeam) { const r = (P.teamRec[champTeam] ||= { name: st.teams[champTeam]?.name, wins: 0, titles: 0 }); r.titles++; }
  // owner objective
  const o = ownerInfo(st);
  if (o.ok) { addFinance(st, `Premio della proprietà (${o.name})`, o.reward); st.board.confidence = clamp(st.board.confidence + 6, 0, 100); }
  else st.board.confidence = clamp(st.board.confidence - 5, 0, 100);
  addMail(st, { from: 'La Proprietà', icon: 'board', type: o.ok ? 'good' : 'bad', subject: o.ok ? 'La proprietà è soddisfatta' : 'La proprietà non è soddisfatta', body: `${o.motto}\n\nObiettivo della proprietà: ${o.goal}. Risultato: ${o.now}.\n\n${o.ok ? `Obiettivo centrato: premio di ${fmtM(o.reward)} e fiducia +6.` : 'Obiettivo mancato: fiducia -5.'}` });
  loansReturn(st);
  // idle cash does not stay in the team forever: the owners take a dividend on what exceeds a full season budget
  const excess = pt.money - pt.baseBudget;
  if (excess > pt.baseBudget * 0.05) {
    // progressive: 40% of the first half-budget of excess, 65% of what lies beyond
    const div = +(Math.min(excess, pt.baseBudget * 0.5) * 0.4 + Math.max(0, excess - pt.baseBudget * 0.5) * 0.65).toFixed(1);
    addFinance(st, 'Dividendo alla proprietà', -div);
    st.board.confidence = clamp(st.board.confidence + 3, 0, 100);
    sum.dividend = div;
    addMail(st, { from: 'La Proprietà', icon: 'money', type: 'info', subject: `Dividendo di fine stagione: ${fmtM(div)}`, body: `La cassa supera il budget di un’intera stagione (${fmtM(pt.baseBudget)}). La proprietà preleva un dividendo progressivo (40% dell’eccedenza, 65% oltre metà budget): ${fmtM(div)}. In cambio, fiducia +3.\n\nIl denaro fermo non fa andare più forte la macchina: investilo in strutture, sviluppo, piloti o negli investimenti fuori dal budget cap prima della fine dell’anno.` });
  }
  sum.owner = o;
  sum.fans = fansInfo(st);
  P.lastSeason = { season: st.season, pos: sum.teamPos, target: sum.target };
}
// Called by season.newSeason after the market and the winter car update
export function depthNewSeason(st, winter) {
  const P = ensureDepth(st); if (!P) return;
  const pt = playerTeam(st); const C = cat(st);
  P.kits = { season: st.season, low: false, high: false };
  P.tokens = { season: st.season, used: 0 };
  P.suspects = [];
  P.fans0 = { season: st.season, v: P.fans };
  P.owner.money0 = pt.money; P.owner.season = st.season;
  P.feudSeason = null;
  for (const d of Object.values(st.drivers)) { d.injury = null; if (d.ban?.injury) d.ban = null; d.form = +((d.form || 0) * 0.4).toFixed(2); if (d.backing == null) d.backing = backingFor(st.category, d); else if (d.backing > 0 && (driverOverall(d, st.category) >= 84 || d.age >= 30)) d.backing = 0; }
  rumoursVerify(st);
  worldWinter(st);
  suppliersWinter(st, !!winter?.era, winter?.focus || []);
  for (const k of Object.keys(P.ptsPen)) if (+k < st.season) delete P.ptsPen[k];
  // mails: era
  if (winter?.era) {
    const mine = winter.moves.find((m) => m.id === pt.id);
    const up = winter.moves.filter((m) => m.from - m.to >= 2).map((m) => st.teams[m.id].name), down = winter.moves.filter((m) => m.to - m.from >= 2).map((m) => st.teams[m.id].name);
    addMail(st, { from: 'Federazione Internazionale', icon: 'rules', type: mine.to <= mine.from ? 'good' : 'bad', subject: `Inizia la ${winter.name}`, body: `Il nuovo regolamento tecnico è in vigore. I primi dati dei test dicono che la nostra vettura è la ${mine.to}ª del gruppo (l’anno scorso ${mine.from}ª).\n\n${up.length ? `Salgono: ${up.join(', ')}. ` : ''}${down.length ? `Scendono: ${down.join(', ')}.` : ''}\n\nLa correlazione galleria-pista va ricostruita sulle nuove regole (ora ${Math.round(P.corr * 100)}%). Prossimo cambio regolamentare previsto per il ${P.era.next}.` });
    press(st, { kind: 'lead', tone: 'info', h: `Anno zero: comincia la ${winter.name}`, t: `Gerarchie stravolte dopo i test invernali. ${up.length ? `Le sorprese: ${up.slice(0, 3).join(', ')}. ` : ''}${down.length ? `In difficoltà: ${down.slice(0, 3).join(', ')}.` : ''}`, img: { k: 'trophy' }, tag: 'Regolamento' });
    worldLog(st, `Nuova era tecnica: ${winter.name}.`, 'era');
  } else if (P.era.next - st.season === 1) {
    const e = eraInfo(st);
    addMail(st, { from: 'Federazione Internazionale', icon: 'rules', type: 'info', subject: `Annunciato il regolamento ${P.era.next}: ${e.nextName}`, body: `Dal ${P.era.next} cambia tutto: ${e.nextTxt}. I componenti più colpiti saranno ${e.focusNames.join(' e ')}: lì i valori attuali verranno in gran parte azzerati.\n\nQuesta è l’ultima stagione con le regole attuali. Dovrai decidere quanto presto spostare la fabbrica sul nuovo progetto: più aspetti, più punti fai quest’anno e peggio parti l’anno prossimo. I progetti R&D «Vettura ${P.era.next}» valgono per la nuova era.` });
    press(st, { kind: 'team', tone: 'info', h: `${P.era.next}, rivoluzione annunciata: ${e.nextName}`, t: `La Federazione pubblica il nuovo regolamento: ${e.nextTxt}. I team devono scegliere quando cambiare progetto.`, img: { k: 'trophy' }, tag: 'Regolamento' });
  }
  // comeback plan after a bad season
  const L = P.lastSeason;
  if (L && L.season === st.season - 1 && L.pos >= L.target + 3 && (P.rescue || 0) <= st.season - 3 && !st.dyn?.admin) {
    P.rescue = st.season;
    const cash = +(pt.baseBudget * 0.1).toFixed(1);
    addFinance(st, 'Piano di rilancio della proprietà', cash);
    st.board.target = clamp(st.board.target + 1, 1, Object.keys(st.teams).length);
    P.corr = clamp(+(P.corr + 0.05).toFixed(2), corrMin(st), 0.97);
    addMail(st, { from: 'La Proprietà', icon: 'board', type: 'good', subject: 'Piano di rilancio approvato', body: `La scorsa stagione è andata molto sotto le attese (${L.pos}° invece del ${L.target}°). La proprietà non molla: ${fmtM(cash)} di liquidità straordinaria, obiettivo abbassato di una posizione e una campagna di correlazione pagata dalla casa. In più, per regolamento, chi chiude indietro ha più ore di galleria del vento. È l’anno della rimonta.` });
  }
  void C;
  applyTrackMods(st);
}
// Gardening leave: staff poached from a rival arrive after a few events (unless bought out)
export function queueStaff(st, s, rounds) { const P = ensureDepth(st); P.incoming.push({ id: s.id, season: st.season, at: st.round + rounds }); }
export function incomingStaff(st) { const P = ensureDepth(st); return P.incoming.map((x) => ({ ...x, s: st.staff[x.id], left: Math.max(1, x.season === st.season ? x.at - st.round : 1) })).filter((x) => x.s); }
export function buyOutLeave(st, id) {
  const P = ensureDepth(st); const pt = playerTeam(st); const inc = P.incoming.find((x) => x.id === id); const s = st.staff[id];
  if (!inc || !s) return { ok: false, msg: 'Non trovato.' };
  const c = +(s.salary * 0.8).toFixed(2);
  if (pt.money < c) return { ok: false, msg: 'Fondi insufficienti.' };
  addFinance(st, `Riscatto gardening leave ${s.name}`, -c);
  P.incoming = P.incoming.filter((x) => x !== inc);
  const old = st.staff[pt.staff[s.role]]; if (old && old.id !== s.id) old.teamId = null;
  pt.staff[s.role] = s.id;
  return { ok: true };
}
export function prizeTable(st) {
  const n = Object.keys(st.teams).length; const pt = playerTeam(st);
  const pos = standings(st).teams.findIndex((t) => t.id === pt.id) + 1;
  const want = [...new Set([1, 2, 3, pos, st.board.target, Math.ceil(n / 2), n])].filter((x) => x >= 1 && x <= n).sort((a, b) => a - b);
  return { mul: st.dp?.rules?.prizeMul ?? 1, rows: want.map((p) => ({ pos: p, prize: prizeFor(st, p), me: p === pos, tgt: p === st.board.target })) };
}
// Compact numbers for the headless simulator
export function depthReport(st) {
  const P = st.dp; if (!P) return {};
  return { era: P.era.n, eraNext: P.era.next, corr: +P.corr.toFixed(2), fans: P.fans, rules: `${P.rules.capMul}/${P.rules.atrSlope}/${P.rules.prizeMul}` };
}
void seatsPerTeam; void relLabel;
