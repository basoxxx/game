// Dynasty legacy: long-term career milestones and a legacy score that follows the manager
// across teams and categories.
import { clamp } from './rng.js';
import { gainXP } from './progress.js';

export const TIERS = [
  { min: 0, name: 'Esordiente' },
  { min: 250, name: 'Promessa del muretto' },
  { min: 600, name: 'Manager rispettato' },
  { min: 1200, name: 'Stratega stimato' },
  { min: 2200, name: 'Grande del paddock' },
  { min: 3800, name: 'Leggenda' },
  { min: 6000, name: 'Immortale' },
];

const titles = (c, type) => c.trophies.filter((t) => !type || t.type === type);
function consecutive(c, type, n) {
  const ys = [...new Set(titles(c, type).map((t) => t.season))].sort((a, b) => a - b);
  let run = 1, best = ys.length ? 1 : 0;
  for (let i = 1; i < ys.length; i++) { run = ys[i] === ys[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
  return best >= n;
}
function sameTeamRun(c) {
  let run = 0, best = 0, prev = null;
  for (const h of c.history) { run = h.teamId && h.teamId === prev ? run + 1 : 1; prev = h.teamId; best = Math.max(best, run); }
  return best;
}

export const MILESTONES = [
  { id: 'win1', name: 'Prima vittoria', desc: 'Vinci una gara come Team Principal.', pts: 30, check: (s, c) => c.stats.wins >= 1 },
  { id: 'races50', name: 'Veterano del muretto', desc: 'Dirigi la squadra in 50 eventi.', pts: 50, check: (s, c) => c.stats.races >= 50 },
  { id: 'wins10', name: 'Abitudine alla vittoria', desc: '10 vittorie in carriera.', pts: 70, check: (s, c) => c.stats.wins >= 10 },
  { id: 'podiums40', name: 'Collezionista di podi', desc: '40 podi in carriera.', pts: 80, check: (s, c) => c.stats.podiums >= 40 },
  { id: 'giant', name: 'Ammazzagiganti', desc: 'Chiudi una stagione almeno 3 posizioni sopra l’obiettivo del consiglio.', pts: 120, check: (s, c) => c.history.some((h) => h.target - h.pos >= 3) },
  { id: 'title1', name: 'Campioni!', desc: 'Vinci il primo titolo.', pts: 150, check: (s, c) => titles(c).length >= 1 },
  { id: 'double', name: 'Doppietta iridata', desc: 'Titolo piloti e costruttori nella stessa stagione.', pts: 200, check: (s, c) => titles(c, 'Piloti').some((t) => titles(c, 'Costruttori').some((x) => x.season === t.season && x.category === t.category)) },
  { id: 'homegrown', name: 'Fatto in casa', desc: 'Un pilota arrivato da te a 22 anni o meno vince il titolo piloti.', pts: 250, check: (s, c) => !!c.homegrownTitle },
  { id: 'underdog', name: 'Davide contro Golia', desc: 'Vinci il titolo costruttori partendo con la 4ª vettura o peggio.', pts: 300, check: (s, c) => !!c.underdogTitle },
  { id: 'b2b', name: 'Bis', desc: 'Due titoli costruttori consecutivi.', pts: 200, check: (s, c) => consecutive(c, 'Costruttori', 2) },
  { id: 'loyal5', name: 'Uomo-squadra', desc: '5 stagioni consecutive con la stessa squadra.', pts: 100, check: (s, c) => sameTeamRun(c) >= 5 },
  { id: 'wins25', name: 'Macchina da vittorie', desc: '25 vittorie in carriera.', pts: 140, check: (s, c) => c.stats.wins >= 25 },
  { id: 'ladder', name: 'Dalla gavetta', desc: 'Dirigi una stagione in Formula Apex 2 e una in Formula Apex.', pts: 100, check: (s, c) => c.history.some((h) => h.category === 'junior') && c.history.some((h) => h.category === 'formula') },
  { id: 'multicat', name: 'Campione ovunque', desc: 'Vinci titoli in due categorie diverse.', pts: 300, check: (s, c) => new Set(titles(c).map((t) => t.category)).size >= 2 },
  { id: 'titles3', name: 'Tris di titoli', desc: '3 titoli in carriera.', pts: 250, check: (s, c) => titles(c).length >= 3 },
  { id: 'threepeat', name: 'Tripletta storica', desc: 'Tre titoli costruttori consecutivi.', pts: 350, check: (s, c) => consecutive(c, 'Costruttori', 3) },
  { id: 'seasons10', name: 'Una vita ai box', desc: 'Completa 10 stagioni.', pts: 150, check: (s, c) => c.seasonsManaged >= 10 },
  { id: 'wins50', name: 'Mezzo secolo', desc: '50 vittorie in carriera.', pts: 220, check: (s, c) => c.stats.wins >= 50 },
  { id: 'titles6', name: 'Impero', desc: '6 titoli in carriera.', pts: 450, check: (s, c) => titles(c).length >= 6 },
  { id: 'stories8', name: 'Romanziere del paddock', desc: 'Affronta 8 capitoli delle storie della stagione.', pts: 80, check: (s) => (s.dp?.story?.log?.length || 0) >= 8 },
  { id: 'eraking', name: 'Signore delle ere', desc: 'Vinci il titolo costruttori nel primo anno di un nuovo regolamento tecnico.', pts: 220, check: (s, c) => (s.dp?.era?.n || 1) > 1 && titles(c, 'Costruttori').some((t) => t.season === s.dp.era.start && t.category === s.category) },
  { id: 'ironman', name: 'Uomo di ferro', desc: 'Vinci un titolo in modalità Ironman.', pts: 250, check: (s, c) => !!s.ironman && titles(c).some((t) => t.season >= s.ironman.since) },
  { id: 'legend', name: 'Leggenda vera', desc: 'Vinci un titolo a difficoltà Leggenda.', pts: 300, check: (s, c) => s.difficulty === 'legend' && titles(c).some((t) => t.season === s.season && t.category === s.category) },
];

export function ensureLegacy(state) {
  const c = state.career;
  c.stats ??= { races: 0, wins: 0, podiums: 0, poles: 0, points: 0 };
  c.milestones ??= {};
  return c;
}

export function recordCareerRace(state, myRes, results) {
  const c = ensureLegacy(state);
  c.stats.races++;
  c.stats.wins += myRes.some((r) => r.pos === 1 && r.status !== 'dnf') ? 1 : 0;
  c.stats.podiums += myRes.filter((r) => r.pos <= 3 && r.status !== 'dnf').length;
  c.stats.points += myRes.reduce((a, r) => a + (r.pts || 0), 0);
  if (results.pole && state.drivers[results.pole]?.teamId === state.playerTeam) c.stats.poles++;
}

export function legacyScore(state) {
  const c = ensureLegacy(state);
  const ms = MILESTONES.filter((m) => c.milestones[m.id]).reduce((a, m) => a + m.pts, 0);
  const seasons = c.history.reduce((a, h) => a + 10 + Math.max(0, h.target - h.pos) * 15, 0);
  return Math.round(ms + seasons + c.stats.wins * 8 + c.stats.podiums * 2 + c.stats.poles * 3 + titles(c).length * 60);
}

export function legacyInfo(state) {
  const c = ensureLegacy(state);
  const score = legacyScore(state);
  let ti = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) ti = i;
  const next = TIERS[ti + 1] || null;
  return {
    score, tier: TIERS[ti].name, tierIdx: ti, next, progress: next ? clamp((score - TIERS[ti].min) / (next.min - TIERS[ti].min), 0, 1) : 1,
    milestones: MILESTONES.map((m) => ({ id: m.id, name: m.name, desc: m.desc, pts: m.pts, done: !!c.milestones[m.id], season: c.milestones[m.id]?.season })),
    stats: c.stats,
  };
}

export function updateLegacy(state) {
  const c = ensureLegacy(state);
  const before = legacyInfo(state).tierIdx;
  const fresh = [];
  for (const m of MILESTONES) {
    if (c.milestones[m.id]) continue;
    let ok = false; try { ok = m.check(state, c); } catch { ok = false; }
    if (ok) { c.milestones[m.id] = { season: state.season }; fresh.push(m); }
  }
  for (const m of fresh) {
    gainXP(state, m.pts, `Eredità: ${m.name}`);
    c.reputation = clamp(c.reputation + m.pts / 60, 0, 100);
    state.inbox.unshift({ id: `lg_${m.id}_${state.season}`, from: 'Albo della Dinastia', subject: `Traguardo storico: ${m.name}`, body: `${m.desc}\n\n+${m.pts} punti eredità e XP. La tua reputazione nel paddock cresce.`, type: 'good', icon: 'trophy', read: false, season: state.season, round: state.round });
    state._toast = { title: `🏛 Traguardo della dinastia: ${m.name}`, text: m.desc };
  }
  const after = legacyInfo(state);
  if (after.tierIdx > before) state._toast = { title: `🏛 Nuovo rango: ${after.tier}`, text: `Punteggio eredità ${after.score}` };
  return fresh;
}
