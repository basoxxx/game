// Driver rivalries: "heat" between pairs of drivers grows with on-track fights, contacts,
// team orders and press statements. High heat makes duels more aggressive (more overtakes,
// more contacts), affects morale and triggers paddock drama and radio outbursts.
import { pick, chance, clamp, rand } from './rng.js';

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function hash(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

// temperament 0..100: hot-headed drivers escalate faster
export function temper(d) { if (!d) return 50; if (d.temper == null) d.temper = 25 + (hash(d.id + d.name) % 66); return d.temper; }

export function ensureRivalries(state) {
  if (state.rivalries) { seedTeammates(state); return state.rivalries; }
  state.rivalries = {};
  seedTeammates(state);
  // a couple of historic feuds among the fastest drivers
  const top = Object.values(state.drivers).filter((d) => d.teamId && !d.retired).sort((a, b) => b.attrs.pace - a.attrs.pace).slice(0, 8);
  for (let n = 0; n < 3 && top.length > 3; n++) {
    const a = top[(n * 3) % top.length], b = top[(n * 3 + 2) % top.length];
    if (a.teamId === b.teamId) continue;
    setR(state, a, b, rand(38, 58), pick(['Ruggini dalla scorsa stagione', 'Un contatto mai chiarito', 'Rivali fin dai kart', 'Dichiarazioni al veleno in TV']));
  }
  return state.rivalries;
}

// teammates: natural tension, higher when they are close in level (only new pairs)
export function seedTeammates(state) {
  state.rivalries ||= {};
  for (const t of Object.values(state.teams)) {
    const ds = t.drivers.map((id) => state.drivers[id]).filter(Boolean);
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      if (state.rivalries[key(ds[i].id, ds[j].id)]) continue;
      const diff = Math.abs((ds[i].attrs.pace || 70) - (ds[j].attrs.pace || 70));
      setR(state, ds[i], ds[j], clamp(30 - diff * 2 + (temper(ds[i]) + temper(ds[j])) / 12, 6, 42), 'Compagni di squadra');
    }
  }
}

function setR(state, a, b, heat, why) {
  state.rivalries[key(a.id, b.id)] = { a: a.id, b: b.id, heat: Math.round(heat), why, log: [] };
}

export function getRivalry(state, aId, bId) { return state.rivalries?.[key(aId, bId)] || null; }
export function heatOf(state, aId, bId) { return getRivalry(state, aId, bId)?.heat || 0; }

export function addHeat(state, aId, bId, amt, reason) {
  ensureRivalries(state);
  if (!aId || !bId || aId === bId) return 0;
  const k = key(aId, bId);
  let r = state.rivalries[k];
  const a = state.drivers[aId], b = state.drivers[bId];
  if (!r) { if (amt <= 0) return 0; r = state.rivalries[k] = { a: aId, b: bId, heat: 0, why: reason || 'Duelli in pista', log: [] }; }
  const mult = amt > 0 ? 0.75 + (temper(a) + temper(b)) / 200 : 1;
  const before = r.heat;
  r.heat = clamp(r.heat + amt * mult, 0, 100);
  if (reason && amt > 0) { r.log.unshift({ s: state.season, r: state.round, t: reason }); r.log.length = Math.min(r.log.length, 6); if (amt >= 8) r.why = reason; }
  return r.heat - before;
}

export function heatLabel(h) { return h >= 75 ? 'Faida' : h >= 50 ? 'Rivalità accesa' : h >= 28 ? 'Tensione' : 'Rispetto'; }
export function heatColor(h) { return h >= 75 ? '#ff3b3b' : h >= 50 ? '#ff8a00' : h >= 28 ? '#ffc400' : '#3ddc84'; }

// list of rivalries involving the player's drivers + the hottest of the paddock
export function rivalryList(state, onlyPlayer = false) {
  ensureRivalries(state);
  const pt = state.teams[state.playerTeam];
  const mine = new Set(pt?.drivers || []);
  return Object.values(state.rivalries)
    .filter((r) => state.drivers[r.a]?.teamId && state.drivers[r.b]?.teamId && !state.drivers[r.a].retired && !state.drivers[r.b].retired)
    .map((r) => ({ ...r, mine: mine.has(r.a) || mine.has(r.b), mates: state.drivers[r.a].teamId === state.drivers[r.b].teamId }))
    .filter((r) => !onlyPlayer || r.mine)
    .sort((x, y) => (y.mine - x.mine) || (y.heat - x.heat));
}

// between rounds: tempers cool down a bit, morale reacts to teammate fights
export function decayRivalries(state) {
  ensureRivalries(state);
  for (const [k, r] of Object.entries(state.rivalries)) {
    r.heat = Math.max(0, r.heat * 0.93 - 0.6);
    if (r.heat < 3 && state.drivers[r.a]?.teamId !== state.drivers[r.b]?.teamId) delete state.rivalries[k];
  }
}

// ---------------- in-race radio & commentary text ----------------
const first = (d) => d.name.split(' ')[0];
const last = (d) => d.name.split(' ').slice(1).join(' ') || d.name;

export function radioAfterPass(att, def, heat, mates) {
  if (mates) return pick([
    `📻 ${first(def)}: «Ma che fa il mio compagno?! Siamo nella stessa squadra!»`,
    `📻 ${first(def)}: «Dite a ${first(att)} di darsi una calmata, ci butta fuori tutti e due!»`,
    `📻 ${first(att)}: «Ero più veloce, non potevo restare dietro.»`,
    `📻 ${first(def)}: «Ok... ne parliamo dopo la gara. Ne parliamo eccome.»`,
  ]);
  if (heat >= 60) return pick([
    `📻 ${first(def)}: «${last(att)} mi ha buttato fuori! È pericoloso, voglio un’investigazione!»`,
    `📻 ${first(def)}: «Sempre lui! Ogni volta che siamo vicini fa queste cose!»`,
    `📻 ${first(att)}: «Gliel’ho restituita. Così impara.»`,
    `📻 ${first(def)}: «Quella non è una manovra, è un tentato omicidio!»`,
  ]);
  return pick([
    `📻 ${first(def)}: «${last(att)} ha frenato tardissimo... è stato al limite.»`,
    `📻 ${first(att)}: «Bella lotta con ${last(def)}, pulita.»`,
    `📻 ${first(def)}: «Mi ha chiuso alla corda, ho dovuto alzare il piede!»`,
    `📻 ${first(att)}: «Era tutto mio, l’ho infilato all’interno!»`,
  ]);
}

export function radioContact(att, def, heat) {
  return pick([
    `📻 ${first(def)}: «Mi ha centrato! ${last(att)} mi ha centrato! L’ala è andata!»`,
    `📻 ${first(att)}: «Mi ha stretto contro il muro, non avevo dove andare!»`,
    heat >= 50 ? `📻 ${first(def)}: «L’ha fatto apposta, ne sono sicuro. Apposta!»` : `📻 ${first(def)}: «Contatto, ho danni. Che diavolo ha fatto?»`,
  ]);
}

// furious exchanges: the victim screams, the other answers back a few seconds later
export function radioFury(victim, culprit, heat) {
  const L = last(culprit), F = first(victim);
  const lines = heat >= 70 ? [
    `📻 ${F}: «È UN IDIOTA! ${L} è un idiota! Lo sapevo che l’avrebbe fatto! Voglio la bandiera nera!»`,
    `📻 ${F}: «Ma ci state guardando?! ${L} mi ha speronato! Se lo trovo nel paddock…»`,
    `📻 ${F}: «Basta, ogni gara la stessa storia! ${L} non dovrebbe avere la superlicenza!»`,
    `📻 ${F}: «*** ${L}! *** Avete visto?! Lo faccio squalificare!»`,
  ] : heat >= 40 ? [
    `📻 ${F}: «Ancora ${L}! Ma cosa ha nel cervello? Chiedete ai commissari!»`,
    `📻 ${F}: «Mi ha spinto fuori, punto. Voglio un’investigazione su ${L}.»`,
    `📻 ${F}: «Incredibile, ${L} frena in curva e mi chiude la porta in faccia!»`,
  ] : [
    `📻 ${F}: «${L} mi ha toccato, controllate i danni.»`,
    `📻 ${F}: «Contatto con ${L}, è stato al limite.»`,
  ];
  return pick(lines);
}
export function radioReply(culprit, victim, heat) {
  const L = last(victim), F = first(culprit);
  const lines = heat >= 60 ? [
    `📻 ${F}: «Si lamenta sempre. Se non sa difendersi, cambi mestiere.»`,
    `📻 ${F}: «${L}? Ha frenato a metà rettilineo. Che vada a piangere dai commissari.»`,
    `📻 ${F}: «Non me ne frega niente di cosa dice ${L}. Ero davanti.»`,
    `📻 ${F}: «Ha cominciato lui due gare fa. Adesso siamo pari.»`,
  ] : [
    `📻 ${F}: «Ero già affiancato, ${L} ha chiuso la traiettoria.»`,
    `📻 ${F}: «Contatto di gara, nessuna colpa.»`,
    `📻 ${F}: «Avevo spazio, ha sterzato lui verso di me.»`,
  ];
  return pick(lines);
}
export function commentaryFury(victim, culprit, heat) {
  return heat >= 60 ? pick([`🎙 Che tensione! ${last(victim)} è furioso con ${last(culprit)}, si vedono i gesti dall’abitacolo!`, `🎙 Volano parole grosse via radio tra ${last(victim)} e ${last(culprit)}. Questa storia non finisce qui.`, `🎙 ${last(victim)} agita il pugno verso ${last(culprit)}! Il paddock stasera sarà rovente.`])
    : pick([`🎙 Contatto tra ${last(culprit)} e ${last(victim)}: i commissari prendono nota.`, `🎙 Ruota contro ruota, ${last(victim)} non l’ha presa bene.`]);
}

export function radioOrders(yielder, mate) {
  return pick([
    `📻 ${first(yielder)}: «Mi state chiedendo di farlo passare? Davvero? ...Ricevuto. Ma non finisce qui.»`,
    `📻 ${first(yielder)}: «Questo è ridicolo. Io ho fatto tutto il weekend davanti!»`,
    `📻 ${first(yielder)}: «Va bene, ma voglio parlarne in riunione. Seriamente.»`,
  ]);
}

export function commentaryPass(att, def, pos, heat, mates, drs) {
  if (mates) return pick([
    `🎙 Lotta in casa! ${last(att)} attacca il compagno ${last(def)} e passa: al muretto ${att.teamName || ''} non saranno contenti.`,
    `🎙 Niente ordini di scuderia: ${last(att)} si prende la P${pos} dal compagno di squadra!`,
  ]);
  if (heat >= 55) return pick([
    `🎙 Eccoli di nuovo! ${last(att)} contro ${last(def)}, tra i due non corre buon sangue... e passa ${last(att)}!`,
    `🎙 Duello rusticano tra ${last(att)} e ${last(def)}: ruote a contatto, ${last(att)} ne esce davanti!`,
    `🎙 La faida continua: ${last(att)} infila ${last(def)} e si prende la P${pos}. Che tensione!`,
  ]);
  return pick([
    `🎙 Sorpasso! ${last(att)} su ${last(def)}${drs ? ' con il DRS aperto' : ' in staccata'}, ora è P${pos}.`,
    `🎙 ${last(att)} trova il varco e supera ${last(def)}: P${pos}!`,
    `🎙 Manovra decisa di ${last(att)}, ${last(def)} non può nulla.`,
    `🎙 ${last(att)} prende la scia, si affianca e passa ${last(def)}. Bellissimo!`,
  ]);
}

export function commentaryBattle(a, b, pos, laps, heat) {
  if (heat >= 55) return `🎙 Occhio alla P${pos}: ${last(b)} è negli scarichi di ${last(a)} da ${laps} giri. Questi due si sono già toccati in passato...`;
  return pick([
    `🎙 Battaglia per la P${pos}: ${last(b)} è attaccato a ${last(a)} da ${laps} giri.`,
    `🎙 ${last(a)} resiste, ma ${last(b)} non molla: un giro dopo l’altro, sotto il secondo.`,
    `🎙 Che duello per la P${pos}! ${last(b)} prova da ogni parte, ${last(a)} chiude tutto.`,
  ]);
}

export function commentaryGeneric(kind, d, extra = '') {
  const L = d ? last(d) : '';
  const lines = {
    lead: [`🎙 ${L} al comando della gara${extra}.`, `🎙 ${L} detta il ritmo davanti a tutti${extra}.`],
    fastest: [`🎙 Giro più veloce per ${L}: ${extra}!`, `🎙 Cronometro impressionante, ${L} firma il giro veloce in ${extra}.`],
    pit: [`🎙 ${L} rientra ai box${extra}.`, `🎙 Pit stop per ${L}${extra}: vediamo dove rientra.`],
    lastlap: ['🎙 Ultimo giro! Tutto si decide adesso!', '🎙 Suona la campana: ultimo giro!'],
    halfway: ['🎙 Siamo a metà gara: le strategie iniziano a delinearsi.', '🎙 Giro di boa: chi ha gestito meglio le gomme?'],
    start: ['🎙 Si spengono i semafori... e via!', '🎙 Partiti! Tutti puliti alla prima curva?'],
    retire: [`🎙 Che peccato per ${L}${extra}: gara finita.`, `🎙 Disastro per ${L}${extra}. Ritirato.`],
  }[kind];
  return lines ? pick(lines) : '';
}

// Applies heat effects during a duel. Returns { pBonus, contactMult }
export function duelModifiers(state, aId, bId) {
  const h = heatOf(state, aId, bId);
  return { heat: h, pBonus: h / 650, contactMult: 1 + (h / 100) ** 1.4 * 2.2 };
}

// post-race: drivers who fought closely, collided or swapped by orders accumulate heat
export function applyRaceRivalry(state, sim) {
  ensureRivalries(state);
  // aggregate per pair: duels add a little, contacts a lot, both capped per race
  const agg = {};
  for (const ev of sim.rivalEvents || []) {
    const k = key(ev.a, ev.b); const g = (agg[k] ||= { a: ev.a, b: ev.b, duel: 0, hit: 0, why: ev.why, big: 0 });
    if (ev.amt >= 10) { g.hit += ev.amt; if (ev.amt > g.big) { g.big = ev.amt; g.why = ev.why; } } else g.duel += ev.amt;
  }
  for (const g of Object.values(agg)) addHeat(state, g.a, g.b, Math.min(7, g.duel) + Math.min(24, g.hit), g.hit ? g.why : g.duel >= 4 ? g.why : null);
  // teammates: the one behind at the finish loses morale if heat is high
  for (const t of Object.values(state.teams)) {
    if (t.drivers.length < 2) continue;
    const [x, y] = t.drivers;
    const r = getRivalry(state, x, y); if (!r || r.heat < 45) continue;
    const rx = sim.cars?.find((c) => c.driverIds?.includes(x)), ry = sim.cars?.find((c) => c.driverIds?.includes(y));
    if (!rx || !ry || rx === ry) continue;
    const loser = rx.pos > ry.pos ? state.drivers[x] : state.drivers[y];
    if (loser) loser.morale = clamp(loser.morale - (r.heat - 40) / 12, 10, 100);
  }
}

export { key as rivalryKey };
