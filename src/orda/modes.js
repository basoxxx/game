// Orda — extra modes: seeded level generator (+ headless solvability check), "Sfida del giorno",
// "Infinita" (endless roguelite waves with perks) and missions/achievements. Pure data + logic, no
// three.js and no DOM: the menu, the launcher and the node tests import it directly.
//
// Levels come from the seeded generator in gen.js (core level shape, sized on the core Sim).
import { generateLevel, hashStr, rng, coreReady, GOOD } from './gen.js';
export { generateLevel, hashStr, rng, coreReady, GOOD } from './gen.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- Sfida del giorno
export const ORDA_EPOCH = new Date(2026, 10, 1); // daily #1 = 1 November 2026
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function parseDay(key) { const [y, m, dd] = key.split('-').map(Number); return new Date(y, m - 1, dd); }
export const dayNumber = (d = new Date()) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - ORDA_EPOCH) / 86400000) + 1;
export function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
// weekday ramp: Monday gentle, Sunday spicy
const WEEK_D = [0.85, 0.35, 0.45, 0.5, 0.6, 0.65, 0.75]; // Sun … Sat
export const GEN_VERSION = 4; // 4: deterministic maths in the Sim (same daily in every browser)
// a standard loadout for the daily: everyone plays it with the same cannon (and it is tuned for it)
export const DAILY_LOADOUT = { up: { rate: 2, shot: 1, hp: 2, speed: 2, charge: 2, armor: 2 }, champ: 'colosso', champLvl: 1 }; // bump when the generator changes (invalidates cached dailies)
const _dailyCache = new Map();
const CACHE_KEY = 'sala_orda_daily_cache';
// The daily level is the same for everybody: seed from the date, difficulty from the weekday. The
// generated level is cached (generation plays a few headless matches).
export function dailyInfo(d = new Date()) {
  const key = dayKey(d), date = parseDay(key);
  const difficulty = WEEK_D[date.getDay()];
  return { key, num: dayNumber(date), seed: hashStr(`orda-daily:${key}`) % 1000000 + 1, difficulty, reward: 60 + Math.round(difficulty * 60) };
}
// is today's level ready without generating it? (the menu shows a placeholder while it is built)
export function dailyReady(d = new Date()) {
  const key = dayKey(d);
  if (_dailyCache.has(key)) return true;
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c?.key === key && c.v === GEN_VERSION && !!c.level; } catch { return false; }
}
export function dailySpec(d = new Date()) {
  const info = dailyInfo(d);
  if (_dailyCache.has(info.key)) return _dailyCache.get(info.key);
  let level = null;
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c?.key === info.key && c.v === GEN_VERSION && c.level) level = c.level; } catch {}
  if (!level) {
    level = generateLevel(info.seed, info.difficulty, { lo: DAILY_LOADOUT });
    level.id = `daily-${info.key}`; level.daily = info.num;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key: info.key, v: GEN_VERSION, level })); } catch {}
  }
  const spec = { ...info, level };
  _dailyCache.set(info.key, spec);
  return spec;
}
export const streakBonus = (streak) => Math.min(100, Math.max(0, streak - 1) * 10);
const fmtIt = (n) => Math.round(n).toLocaleString('it-IT');
export function shareText(spec, r) {
  const st = r.won ? '⭐'.repeat(r.stars || 1) + '☆'.repeat(3 - (r.stars || 1)) : '💀';
  const lines = [`Orda #${spec.num} ${st} ${fmtIt(r.figures || 0)} omini`];
  const pct = clamp(r.won ? 1 : 1 - (r.baseHpPct ?? 1), 0, 1), row = [];
  for (let i = 0; i < 10; i++) row.push(i < Math.round(pct * 10) ? '🟥' : '⬜');
  lines.push(`${row.join('')} ${r.won ? `${Math.round(r.time || 0)}s` : `${Math.round(pct * 100)}%`}`);
  const extra = [];
  if (r.maxCrowd) extra.push(`💥 folla max ${fmtIt(r.maxCrowd)}`);
  if (r.streak > 1) extra.push(`🔥 ${r.streak} giorni`);
  if (extra.length) lines.push(extra.join(' · '));
  return lines.join('\n');
}

// ---------------------------------------------------------------- Infinita
// up: extra upgrade levels on top of the player's own (levels past an upgrade's cap still count, up to
// UP_OVER more: see splitUps) · lvl: changes baked into the wave's level JSON
export const PERKS = [
  { id: 'cadenza', name: 'Cannone rapido', desc: 'Il cannone spara più in fretta (+2 livelli Cadenza).', icon: 'speed', max: 3, up: { rate: 2 } },
  { id: 'raffica', name: 'Raffica', desc: 'Più omini per colpo (+2 livelli Raffica).', icon: 'users', max: 3, up: { shot: 2 } },
  { id: 'tempra', name: 'Tempra', desc: 'I tuoi omini reggono di più negli scontri.', icon: 'shield', max: 3, up: { hp: 2 } },
  { id: 'scarpe', name: 'Scarpe veloci', desc: 'I tuoi omini corrono più veloci.', icon: 'flag', max: 3, up: { speed: 2 } },
  { id: 'porte', name: 'Porte d’oro', desc: 'Porte buone più generose: +1 alle somme, +0,5 ai moltiplicatori.', icon: 'star', max: 3, lvl: (L) => { for (const g of L.gates) { if (g.type === 'mul') g.value = Math.round((g.value + 0.5) * 10) / 10; else if (g.type === 'add') g.value += 1; } } },
  { id: 'smussate', name: 'Porte smussate', desc: 'Le porte che tolgono omini ne tolgono la metà.', icon: 'scales', max: 1, lvl: (L) => { for (const g of L.gates) { if (g.type === 'sub') g.value = Math.max(1, Math.round(g.value / 2)); if (g.toggle?.type === 'sub') g.toggle.value = Math.max(1, Math.round(g.toggle.value / 2)); } } },
  { id: 'campione', name: 'Campione pronto', desc: 'Il campione si carica il 25% prima.', icon: 'medal', max: 3, lvl: (L) => { L.charge = Math.max(8, Math.round((L.charge || 40) * 0.75)); } },
  { id: 'bastione', name: 'Barricata', desc: 'Il cannone recupera 15 punti di resistenza e ne guadagna 10 massimi.', icon: 'wrench', max: 99, now: (run) => { run.lineMax += 10; run.line = Math.min(run.lineMax, run.line + 15); } },
  { id: 'fango', name: 'Fango', desc: 'Meno omini rossi dalla base (−15%).', icon: 'rain', max: 2, lvl: (L) => { L.base.spawners.forEach((s) => { s.rate = Math.round(s.rate * 85) / 100; }); if (L.base.waves) L.base.waves.count = Math.round(L.base.waves.count * 0.85); } },
  { id: 'demolitore', name: 'Demolitore', desc: 'Torri e mura nemiche più fragili (−30%).', icon: 'burst', max: 2, lvl: (L) => { L.base.towers.forEach((t) => { t.hp = Math.max(5, Math.round(t.hp * 0.7)); }); } },
  { id: 'bottino', name: 'Bottino', desc: '+25% monete alla fine della corsa.', icon: 'coin', max: 4 },
];
export const perkById = (id) => PERKS.find((p) => p.id === id);
const UP_MAX = { rate: 10, shot: 6, hp: 8, speed: 8, charge: 8, armor: 6 }; // mirrors the core's UPGRADES max
const UP_OVER = 6; // mirrors meta.js UP_OVER: perk levels past the cap the core still counts
// three different perks, never one at its cap or one that can't do anything with the player's upgrades
export function rollPerks(runSeed, wave, owned = [], playerUp = {}) {
  const r = rng(hashStr(`perk:${runSeed}:${wave}`));
  const cnt = (id) => owned.filter((x) => x === id).length;
  const ups = perkUps(owned, playerUp);
  const pool = PERKS.filter((p) => cnt(p.id) < p.max && (!p.up || Object.keys(p.up).some((k) => (ups[k] || 0) < UP_MAX[k] + UP_OVER)));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice((r() * pool.length) | 0, 1)[0].id);
  return out;
}
// the player's upgrade levels + every perk's bonus levels
export function perkUps(perks = [], playerUp = {}) {
  const up = { ...playerUp };
  for (const id of perks) for (const [k, v] of Object.entries(perkById(id)?.up || {})) up[k] = (up[k] || 0) + v;
  return up;
}
// the core's loadout for those levels: { up } within each cap, { upBonus } the levels past it
export function splitUps(total = {}) {
  const up = {}, upBonus = {};
  for (const [k, v] of Object.entries(total)) { const m = UP_MAX[k] ?? Infinity; up[k] = Math.min(m, v || 0); if ((v || 0) > m) upBonus[k] = Math.min(UP_OVER, v - m); }
  return { up, upBonus };
}
export const coinMul = (perks = []) => 1 + 0.25 * perks.filter((x) => x === 'bottino').length;
export const ENDLESS_LINE = 40;
export function newRun(seed = (Math.random() * 1e9) | 0, playerUp = {}) { return { seed, lo: endlessLoadout(playerUp), wave: 1, perks: [], line: ENDLESS_LINE, lineMax: ENDLESS_LINE, figures: 0, maxCrowd: 0, kills: 0, startedAt: Date.now(), cleared: 0 }; }
export const waveDifficulty = (w) => 0.12 + (w - 1) * 0.08;
// level for the run's current wave: fresh seed (gates reshuffle), stronger base, perks baked in
const _waves = new Map();
// the raw generated wave (memoised: the screen builds the next one while the perk cards are shown)
// Waves are tuned for half of the player's own upgrade levels: upgrades still help, but a maxed
// cannon doesn't turn the run into a stroll. The run fixes that loadout when it starts.
export const endlessLoadout = (up = {}) => ({ up: Object.fromEntries(Object.entries(up).map(([k, v]) => [k, Math.floor((v || 0) / 2)])) });
export function prepareWave(seed, wave, lo = {}) {
  const k = `${seed}:${wave}:${JSON.stringify(lo.up || {})}`;
  if (!_waves.has(k)) { if (_waves.size > 6) _waves.clear(); _waves.set(k, JSON.stringify(generateLevel(hashStr(`orda-endless:${seed}:${wave}`), waveDifficulty(wave), { endless: true, lo }))); }
  return JSON.parse(_waves.get(k));
}
export function endlessWave(run) {
  const d = waveDifficulty(run.wave);
  const L = prepareWave(run.seed, run.wave, run.lo || {});
  // past the generator's ceiling the base keeps growing
  const grow = 1 + Math.max(0, d - 1) * 0.8 + (run.wave - 1) * 0.04;
  L.base.hp = Math.round((L.base.hp * grow) / 10) * 10;
  L.id = `endless-${run.seed}-${run.wave}`; L.name = `Ondata ${run.wave}`; L.wave = run.wave;
  L.endless = true; L.time = 900; // no real clock: the base's spawns ramp up over time instead
  L.base.ramp = 0.25 + Math.min(0.4, (run.wave - 1) * 0.02);
  // the line is kept in level units: the Sim multiplies both by the armour upgrade (see endlessLine)
  L.cannon = { hp: Math.max(1, Math.round(run.line)), max: run.lineMax };
  if (run.wave % 5 === 0) { L.base.boss = true; L.base.name = `Cittadella ${run.wave / 5}`; }
  for (const id of run.perks) perkById(id)?.lvl?.(L);
  L.perks = run.perks.slice();
  return L;
}
// the cannon's resistance after a wave, back in level units (the Sim's hp includes the armour bonus)
export function endlessLine(run, cannonHp, cannonMax) {
  if (!(cannonMax > 0)) return run.line;
  if (!(cannonHp > 0)) return 0;
  return Math.max(1, Math.min(run.lineMax, Math.round((run.lineMax * cannonHp) / cannonMax)));
}
export const runScore = (run) => run.cleared * 1000 + run.figures;

// ---------------------------------------------------------------- missions & achievements
// check(r, s): r = the match result just finished (may be null), s = the modes store (cumulative)
const A = (id, name, desc, coins, icon, goal, val) => ({ id, name, desc, coins, icon, goal, val });
export const ACHIEVEMENTS = [
  A('folla100', 'Piccola folla', 'Moltiplica la tua orda fino a 100 omini in campo', 30, 'users', 100, (s) => s.bestCrowd),
  A('folla500', 'Esplosione di omini', 'Moltiplica la tua orda fino a 500 omini in campo', 120, 'burst', 500, (s) => s.bestCrowd),
  A('folla1500', 'Marea umana', 'Moltiplica la tua orda fino a 1.500 omini in campo', 350, 'burst', 1500, (s) => s.bestCrowd),
  A('vittoria', 'Prima breccia', 'Distruggi una base nemica', 25, 'flag', 1, (s) => s.wins),
  A('nochamp', 'Solo fanteria', 'Vinci senza usare campioni', 80, 'shield', 1, (s) => s.winsNoChamp),
  A('trestelle', 'Tre stelle', 'Vinci un livello con 3 stelle', 60, 'star', 1, (s) => s.threeStars),
  A('pulita', 'Cannone intatto', 'Vinci senza che un rosso tocchi il tuo cannone', 90, 'shield', 1, (s) => s.cleanWins),
  A('torri', 'Abbattitorri', 'Abbatti 3 torri nemiche in una sola partita', 70, 'target', 3, (s) => s.bestTowers),
  A('lampo', 'Lampo', 'Vinci con più di metà del tempo ancora sul timer', 90, 'bolt', 1, (s) => s.fastWins),
  A('giorno1', 'Sfidante', 'Completa una Sfida del giorno', 40, 'calendar', 1, (s) => s.dailyDone),
  A('serie3', 'Abitudine', 'Gioca la Sfida del giorno 3 giorni di fila', 100, 'flame', 3, (s) => s.bestStreak),
  A('serie7', 'Settimana di fuoco', 'Gioca la Sfida del giorno 7 giorni di fila', 300, 'flame', 7, (s) => s.bestStreak),
  A('onde5', 'Resistente', 'Supera 5 ondate in Infinita', 60, 'hourglass', 5, (s) => s.bestWave),
  A('onde10', 'Inarrestabile', 'Supera 10 ondate in Infinita', 160, 'hourglass', 10, (s) => s.bestWave),
  A('onde20', 'Leggenda dell’Orda', 'Supera 20 ondate in Infinita', 450, 'trophy', 20, (s) => s.bestWave),
  A('perk8', 'Collezionista', 'Accumula 8 potenziamenti in una corsa Infinita', 100, 'palette', 8, (s) => s.bestPerks),
  A('esercito', 'Esercito', 'Lancia 10.000 omini in totale', 80, 'users', 10000, (s) => s.figures),
  A('legione', 'Legione', 'Lancia 100.000 omini in totale', 300, 'users', 100000, (s) => s.figures),
];
export function achState(s) {
  return ACHIEVEMENTS.map((a) => { const v = +a.val(s) || 0; return { ...a, have: v, done: v >= a.goal, claimed: !!s.claimed?.[a.id], pct: Math.min(1, v / a.goal) }; });
}

// ---------------------------------------------------------------- persistence (own key, merges with defaults)
const KEY = 'sala_orda_modes_v1';
const DEF = () => ({ daily: {}, streak: 0, bestStreak: 0, lastDaily: '', endless: [], run: null, claimed: {}, bestCrowd: 0, bestTowers: 0, wins: 0, winsNoChamp: 0, threeStars: 0, cleanWins: 0, fastWins: 0, dailyDone: 0, bestWave: 0, bestPerks: 0, figures: 0, coinsEarned: 0 });
export function omLoad() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && typeof d === 'object') { const x = { ...DEF(), ...d }; x.daily = { ...(d.daily || {}) }; x.claimed = { ...(d.claimed || {}) }; x.endless = Array.isArray(d.endless) ? d.endless : []; return x; } } catch {}
  return DEF();
}
export function omSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return s; }

// The core's Sim.result() → what the modes keep. { win, why, time, left, cannonHp, cannonMax, baseHp,
// baseMax, sent, cloned, kills, towers, champs, ... } plus maxCrowd (sampled by the modes screen).
export function normResult(raw = {}, L = {}) {
  const won = !!(raw.won ?? raw.win);
  const baseMax = raw.baseMax || L.base?.hp || 1;
  const figures = raw.figures ?? (raw.sent ?? raw.figuresSent ?? 0) + (raw.cloned || 0);
  return {
    won, why: raw.why || '', time: raw.time ?? (raw.timeMs ? raw.timeMs / 1000 : 0), left: raw.left || 0, stars: raw.stars ?? 0,
    figures, maxCrowd: Math.max(raw.maxCrowd || 0, raw.left || 0), kills: Math.round(raw.kills || 0), towers: raw.towers || 0,
    champs: raw.champs ?? raw.champions ?? 0, cannonHp: raw.cannonHp ?? 0, cannonMax: raw.cannonMax ?? 0,
    baseHpPct: clamp((raw.baseHp ?? (won ? 0 : baseMax)) / baseMax, 0, 1), coins: raw.coins || 0, quit: !!raw.quit,
  };
}
// fold a finished match into the cumulative stats (every mode feeds missions)
export function recordMatch(s, r, level) {
  s.figures += r.figures || 0;
  s.bestCrowd = Math.max(s.bestCrowd, r.maxCrowd || 0);
  s.bestTowers = Math.max(s.bestTowers, r.towers || 0);
  if (r.won) {
    s.wins++;
    if (!r.champs) s.winsNoChamp++;
    if (r.stars >= 3 && !level?.endless) s.threeStars++;
    if (r.cannonMax && r.cannonHp >= r.cannonMax) s.cleanWins++;
    if (!level?.endless && level?.time && r.time < level.time / 2) s.fastWins++;
  }
  return s;
}
// daily: the first finished attempt of the day is the official one; later ones are practice
export function recordDaily(s, spec, r) {
  const prev = s.daily[spec.key];
  if (prev?.official) { prev.practice = (prev.practice || 0) + 1; prev.bestPractice = Math.max(prev.bestPractice || 0, r.figures || 0); return { official: false, bonus: 0 }; }
  const yesterday = addDays(spec.key, -1);
  s.streak = s.lastDaily === yesterday ? s.streak + 1 : s.lastDaily === spec.key ? s.streak : 1;
  s.lastDaily = spec.key;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  s.dailyDone++;
  const bonus = r.won ? spec.reward + streakBonus(s.streak) : Math.round(spec.reward / 3);
  s.daily[spec.key] = { official: true, won: !!r.won, stars: r.stars || 0, figures: r.figures || 0, maxCrowd: r.maxCrowd || 0, time: Math.round(r.time || 0), baseHpPct: r.baseHpPct ?? (r.won ? 0 : 1), num: spec.num, practice: 0 };
  return { official: true, bonus };
}
// streak is alive if the last official daily was today or yesterday
export function liveStreak(s, today = dayKey()) { return s.lastDaily === today || s.lastDaily === addDays(today, -1) ? s.streak : 0; }
export function recordEndless(s, run) {
  const score = runScore(run);
  s.bestWave = Math.max(s.bestWave, run.cleared);
  s.bestPerks = Math.max(s.bestPerks, run.perks.length);
  const at = Date.now();
  s.endless.push({ score, waves: run.cleared, figures: run.figures, maxCrowd: run.maxCrowd, perks: run.perks.length, date: dayKey(), at });
  s.endless.sort((a, b) => b.score - a.score);
  s.endless = s.endless.slice(0, 10);
  const rank = s.endless.findIndex((e) => e.at === at) + 1;
  const coins = Math.round((run.cleared * 15 + Math.sqrt(run.figures) * 0.5) * coinMul(run.perks));
  return { score, rank, coins };
}
