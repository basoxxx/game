// v5 career layer: the things that turn the long-career systems into choices.
//  - Difficulty profiles (AI competence + economy) and the optional Ironman flag (no reloads)
//  - Strategy room: this season's key choices with forecasts and consequences vs the nearest rivals
//  - Weekly digest: minor mails of a race week merged into one bulletin; delegations for routine calls
//  - Storylines: multi-step narrative arcs with branching choices and lasting effects
//  - Facility perks (Lv4 / Lv5), season awards, records chase, rumour sources
import { clamp, chance, pick, rand, uid } from './rng.js';
import { cat, playerTeam, teamDrivers, addMail, addNews, addFinance, fmtM, standings, partName, overallCarRanking, rdSlots, costCap, capSpent, seatsPerTeam, startProject, rdCost } from './season.js';
import { getTrack, driverOverall, avgPart, salaryFor } from './world.js';
import { press, principal, adjustRel, expectedRank, academyDrivers, academySlots } from './dynasty.js';
import { ensureDepth, eraInfo, tokenInfo, puDeal, supplierList, kitsEnabled, kitTracks, kitCost, buyKit, KITS, aiTrend, loanTargets } from './depth.js';
import { saveGame } from './state.js';
import { offerScore } from './market.js';

const last = (n) => String(n || '').split(' ').slice(-1)[0];
const scale = (st) => cat(st).budgetScale;
const bumpPart = (t, id, v) => { if (t?.car?.parts?.[id] != null) t.car.parts[id] = clamp(+(t.car.parts[id] + v).toFixed(1), 30, 99.5); };
const perfParts = (st) => cat(st).parts.filter((p) => p.id !== 'reliability').map((p) => p.id);

// =====================================================================================
// DIFFICULTY & IRONMAN
// =====================================================================================
// ai: AI in-season development · winter: AI winter gains/era luck · econ: prize money and sponsor income
// target: shift of the board target (negative = more demanding) · chase: extra AI catch-up when you dominate
export const DIFF_PROFILE = {
  easy: { name: 'Facile', ai: 0.85, winter: 0.8, econ: 1.12, target: 1, chase: 0.6 },
  normal: { name: 'Normale', ai: 1.15, winter: 1, econ: 1, target: 0, chase: 1 },
  hard: { name: 'Difficile', ai: 1.4, winter: 1.18, econ: 0.94, target: -1, chase: 1.2 },
  legend: { name: 'Leggenda', ai: 1.6, winter: 1.32, econ: 0.86, target: -1, chase: 1.4 },
};
export function diffOf(st) { return DIFF_PROFILE[st?.difficulty] || DIFF_PROFILE.normal; }

// Ironman: one save per career, written after every decision and every event. No going back.
export function setIronman(st) {
  if (!st || st.ironman) return { ok: false, msg: 'La modalità Ironman è già attiva.' };
  if (st.round !== 0) return { ok: false, msg: 'Si attiva solo in pre-stagione, prima del primo evento.' };
  st.ironman = { since: st.season, id: uid('im') };
  commit(st);
  return { ok: true };
}
export function isIronman(st) { return !!st?.ironman; }
export function commit(st) { if (st?.ironman) { try { saveGame(); } catch { /* headless */ } } }

// =====================================================================================
// FACILITY PERKS: every facility has two unique perks, at level 4 and 5
// =====================================================================================
export const FACILITY_PERKS = {
  factory: [{ lvl: 4, name: 'Reparto prototipi', desc: 'Straordinari sui progetti R&D -30%' }, { lvl: 5, name: 'Linea rapida', desc: 'I progetti rivoluzionari arrivano un evento prima' }],
  windtunnel: [{ lvl: 4, name: 'Galleria a nastro mobile', desc: 'Campagne di correlazione -30%' }, { lvl: 5, name: 'Modello in scala 60%', desc: 'La correlazione galleria-pista non scende mai sotto l’82%' }],
  simulator: [{ lvl: 4, name: 'Simulatore dinamico', desc: 'I piloti iniziano la stagione in forma (+0,4)' }, { lvl: 5, name: 'Gemello digitale', desc: 'Insistere su un pacchetto difettoso: +10% di riuscita' }],
  pitcrew: [{ lvl: 4, name: 'Revisioni in casa', desc: 'Usura dei componenti della power unit -10%' }, { lvl: 5, name: 'Officina in pista', desc: 'Pacchetti per circuito -30%' }],
  academy: [{ lvl: 4, name: 'Rete di osservatori', desc: 'Un posto in più in accademia' }, { lvl: 5, name: 'Accordi di prestito', desc: 'Finestra prestiti aperta fino al 60% della stagione' }],
  hospitality: [{ lvl: 4, name: 'Area VIP', desc: 'Merchandising +10%' }, { lvl: 5, name: 'Fan zone permanente', desc: 'Crescita dei tifosi +25%' }],
};
export function hasFacPerk(team, key, lvl) { return !!team?.isPlayer && (team.facilities?.[key] || 0) >= lvl; }
export function facilityPerks(team, key) { return (FACILITY_PERKS[key] || []).map((p) => ({ ...p, on: (team.facilities?.[key] || 0) >= p.lvl })); }

// =====================================================================================
// STATE
// =====================================================================================
export function ensureCareer5(st) {
  const P = ensureDepth(st); if (!P) return null;
  P.pol.digest ??= true; P.pol.noBets ??= false; P.pol.minorVote ??= true; P.pol.autoDev ??= true;
  P.story ??= { active: null, done: {}, log: [], fx: [] };
  P.story.log ??= []; P.story.fx ??= []; P.story.done ??= {};
  P.mq ??= {};
  return P;
}

// =====================================================================================
// WEEKLY DIGEST
// =====================================================================================
const KEEP_FROM = new Set(['Consiglio di Amministrazione', 'La Proprietà', 'Federazione Internazionale', 'Centro Medico', 'Ufficio Contratti', 'Direttore Finanziario']);
function minorMail(m) {
  if (m.card || m.digest) return false;
  if (/\n\nDecisione: /.test(m.body || '')) return true; // echo of a decision already taken in a modal
  if (m.type !== 'info') return false;
  if (KEEP_FROM.has(m.from)) return false;
  if (m.from === 'Ufficio Stampa' && /^(Gara|Rally|Report|Rapporto|Il weekend)/i.test(m.subject || '')) return false;
  return true;
}
export function weeklyDigest(st) {
  const P = ensureCareer5(st); if (!P || !P.pol.digest) return null;
  const lastId = P.dgId;
  const fresh = [];
  for (const m of st.inbox) { if (m.id === lastId) break; fresh.push(m); }
  const minor = fresh.filter(minorMail);
  const news = (st.news || []).filter((n) => n.season === st.season && n.round === st.round - 1).slice(0, 6);
  if (minor.length + Math.min(news.length, 2) < 3) { P.dgId = st.inbox[0]?.id; return null; }
  st.inbox = st.inbox.filter((m) => !minor.includes(m));
  const ev = st.calendar[st.round - 1]; const tr = ev ? getTrack(st.category, ev.trackId) : null;
  const lines = minor.map((m) => `• ${m.subject}${m.from ? ` — ${m.from}` : ''}\n   ${String(m.body || '').split('\n\nDecisione: ')[1] ? 'Decisione: ' + String(m.body).split('\n\nDecisione: ')[1].slice(0, 160) : String(m.body || '').replace(/\s+/g, ' ').slice(0, 170)}${String(m.body || '').length > 170 ? '…' : ''}`);
  const body = `Il riepilogo della settimana${tr ? ` del ${tr.name}` : ''}: ${minor.length} comunicazioni minori raccolte in un solo messaggio.\n\n${lines.join('\n')}${news.length ? `\n\nDal paddock:\n${news.map((n) => `• ${n.text}`).join('\n')}` : ''}\n\nPuoi disattivare il notiziario dalla Sala strategica (Centro Tecnico).`;
  addMail(st, { from: 'Notiziario della squadra', icon: 'info', type: 'info', subject: `Notiziario settimanale · round ${st.round}${tr ? ` · ${tr.name}` : ''}` , body });
  st.inbox[0].digest = true;
  P.dgId = st.inbox[0].id;
  return minor.length;
}

// Decision pressure valve: at most one "optional" modal every round, and a quiet round after a busy one
export function noteModal(st) { const P = ensureCareer5(st); if (!P) return; P.mq[`${st.season}:${st.round}`] = (P.mq[`${st.season}:${st.round}`] || 0) + 1; for (const k of Object.keys(P.mq)) if (!k.startsWith(`${st.season}:`)) delete P.mq[k]; }
export function modalLoad(st) { const P = st.dp; if (!P?.mq) return 0; return (P.mq[`${st.season}:${st.round}`] || 0) + (P.mq[`${st.season}:${st.round - 1}`] || 0) * 0.5; }

// =====================================================================================
// STORYLINES
// =====================================================================================
// Each arc: start(st) -> data|null (condition), steps[i](st, data) -> view {title, text, a:[{t,note,risk}]},
// resolve[i](st, data, choice) -> { out, next: stepIndex|null, wait: rounds, fx?: lasting effect text }
const ARCS = {
  takeover: {
    name: 'Offerta di acquisizione', from: 'Ufficio del Presidente', icon: 'money', min: 2, cool: 6,
    start(st) { const pt = playerTeam(st); const pos = standings(st).teams.findIndex((x) => x.id === pt.id) + 1; if (pos < Math.ceil(Object.keys(st.teams).length * 0.35)) return null; return { who: pick(['il fondo sovrano Al-Safir', 'la holding Valmonte Industries', 'il consorzio Northbridge', 'il gruppo automobilistico Kaito']), amt: +(pt.baseBudget * 0.18).toFixed(1) }; },
    steps: [
      (st, d) => ({ title: `${cap1(d.who)} vuole comprare la squadra`, text: `${cap1(d.who)} ha presentato alla proprietà un’offerta ufficiale per rilevare la squadra. Promettono ${fmtM(d.amt)} subito e un budget più alto, ma vorrebbero mettere bocca su tutto. Il presidente chiede il tuo parere prima di rispondere.`, a: [{ t: 'Ascoltiamoli', note: 'La trattativa va avanti: nuove condizioni tra qualche evento' }, { t: 'La squadra non è in vendita', note: 'Fiducia +4 dalla vecchia proprietà · fine della storia' }, { t: 'Facciamo uscire la notizia sui giornali', note: 'Tifosi +2% e pressione sull’acquirente · rischio di farlo scappare', risk: true }] }),
      (st, d) => ({ title: `Due diligence: ${d.who} detta le condizioni`, text: `Gli advisor di ${d.who} hanno studiato i conti. Sono pronti a chiudere, ma chiedono garanzie: o tagli ai costi, o obiettivi sportivi più alti. Il consiglio è diviso.`, a: [{ t: 'Accettiamo i tagli', note: `+${fmtM(d.amt)} subito · budget strutturale +8% · cambia la proprietà (Fondo d’investimento)` }, { t: 'Garanzie sportive', note: `+${fmtM(d.amt * 0.6)} · budget strutturale +14% · obiettivo del consiglio +1 posizione per due stagioni · proprietà «Marchio globale»`, risk: true }, { t: 'Salta tutto', note: 'Nessun cambiamento · fiducia -3 (il consiglio voleva i soldi)' }] }),
    ],
    resolve: [
      (st, d, i) => { if (i === 0) return { out: 'Trattativa aperta', next: 1, wait: 2 }; if (i === 1) { st.board.confidence = clamp(st.board.confidence + 4, 0, 100); return { out: 'Offerta respinta' }; } st.dp.fans = Math.round(st.dp.fans * 1.02); if (chance(0.35)) { press(st, { kind: 'brief', tone: 'bad', h: `Fuga di notizie: ${d.who} si ritira dall’acquisto`, t: '', tag: 'Business' }); return { out: 'L’acquirente si è spaventato e ha ritirato l’offerta' }; } d.amt = +(d.amt * 1.15).toFixed(1); return { out: `Il prezzo sale a ${fmtM(d.amt)}`, next: 1, wait: 2 }; },
      (st, d, i) => { const pt = playerTeam(st); const P = st.dp;
        if (i === 0) { addFinance(st, `Ingresso di ${d.who}`, d.amt); pt.baseBudget = +(pt.baseBudget * 1.08).toFixed(2); P.owner.type = 'bilancio'; P.owner.money0 = pt.money; return { out: `Acquisizione chiusa: +${fmtM(d.amt)}, budget +8%`, fx: `Nuova proprietà (${d.who}): bilancio prima di tutto` }; }
        if (i === 1) { addFinance(st, `Ingresso di ${d.who}`, +(d.amt * 0.6).toFixed(1)); pt.baseBudget = +(pt.baseBudget * 1.14).toFixed(2); P.owner.type = 'spettacolo'; st.board.target = Math.max(1, st.board.target - 1); st.dyn && (st.dyn.pressure = 1, st.dyn.pressureUntil = st.season + 1); return { out: 'Acquisizione con garanzie sportive: budget +14%, obiettivi più alti', fx: `Nuova proprietà (${d.who}): vuole risultati e visibilità` }; }
        st.board.confidence = clamp(st.board.confidence - 3, 0, 100); return { out: 'Trattativa saltata' }; },
    ],
  },
  unrest: {
    name: 'Il campione scontento', from: 'Ufficio Stampa', icon: 'driver', min: 2, cool: 3,
    start(st) { const pt = playerTeam(st); const ds = teamDrivers(st, pt).sort((a, b) => driverOverall(b, st.category) - driverOverall(a, st.category)); const d = ds[0]; if (!d || driverOverall(d, st.category) < 80 || d.morale > 66 || d.contract > 2) return null; return { d: d.id, sal: +(d.salary * 0.25 + 0.2 * scale(st)).toFixed(2) }; },
    steps: [
      (st, d) => { const x = st.drivers[d.d]; return { title: `${last(x.name)} è inquieto`, text: `${x.name} non è contento: i risultati non arrivano, il suo agente parla con la stampa e nel box si respira tensione (morale ${x.morale}). Se non intervieni, le altre squadre fiuteranno l’occasione.`, a: [{ t: 'Gli prometto lo status di prima guida', note: 'Morale +10 · il compagno perde morale (-6)' }, { t: 'Aumento di stipendio', note: `${fmtM(d.sal)} a stagione in più · morale +6` }, { t: 'Lui ha un contratto: niente concessioni', note: 'Morale -4 · un rivale potrebbe farsi avanti', risk: true }] }; },
      (st, d) => { const x = st.drivers[d.d]; const t = st.teams[d.rival]; return { title: `${t?.name || 'Un rivale'} tenta ${last(x.name)}`, text: `Come temevi, ${t?.name} ha contattato ${x.name}: offerta ricca e un progetto «vincente». Il pilota aspetta la tua mossa prima di rispondere.`, a: [{ t: 'Rinnovo blindato con clausola', note: `Contratto +2 stagioni · stipendio +20% · clausola di rescissione: chi lo vuole paga ${fmtM(d.sal * 8)}` }, { t: 'Lascialo andare, incassiamo', note: `Il pilota se ne andrà a fine stagione · indennizzo ${fmtM(d.sal * 4)} · morale del box +` }, { t: 'Bluff: «Abbiamo già un sostituto»', note: '55%: resta e torna motivato · 45%: firma subito con loro', risk: true }] }; },
    ],
    resolve: [
      (st, d, i) => { const x = st.drivers[d.d]; const pt = playerTeam(st); if (!x || x.teamId !== pt.id) return { out: '' };
        if (i === 0) { pt.number1 = x.id; x.morale = clamp(x.morale + 10, 10, 100); for (const m of teamDrivers(st, pt)) if (m.id !== x.id) m.morale = clamp(m.morale - 6, 10, 100); return { out: `${last(x.name)} prima guida`, fx: `${last(x.name)} prima guida per contratto` }; }
        if (i === 1) { x.salary = +(x.salary + d.sal).toFixed(2); x.morale = clamp(x.morale + 6, 10, 100); return { out: 'Aumento concesso' }; }
        x.morale = clamp(x.morale - 4, 10, 100); const r = Object.values(st.teams).filter((t) => !t.isPlayer).sort((a, b) => avgPart(b) - avgPart(a))[Math.floor(rand(0, 3))]; d.rival = r?.id; return r ? { out: 'Nessuna concessione', next: 1, wait: 2 } : { out: 'Nessuna concessione' }; },
      (st, d, i) => { const x = st.drivers[d.d]; const pt = playerTeam(st); const t = st.teams[d.rival]; if (!x || x.teamId !== pt.id || !t) return { out: '' };
        if (i === 0) { x.contract = Math.max(x.contract, 1) + 2; x.salary = +(x.salary * 1.2).toFixed(2); x.clause = +(d.sal * 8).toFixed(1); x.morale = clamp(x.morale + 8, 10, 100); x.rivalOffer = null; return { out: `${last(x.name)} blindato fino al ${st.season + x.contract - 1}`, fx: `Clausola di rescissione di ${fmtM(x.clause)} su ${last(x.name)}` }; }
        if (i === 1) { x.nextTeam = t.id; x.nextSalary = +(salaryFor(x, st.category) * 1.2).toFixed(2); x.nextYears = 2; addFinance(st, `Indennizzo da ${t.name} per ${x.name}`, +(d.sal * 4).toFixed(2)); for (const m of teamDrivers(st, pt)) if (m.id !== x.id) m.morale = clamp(m.morale + 5, 10, 100); addNews(st, `${x.name} lascerà ${pt.name} a fine stagione: firma con ${t.name}.`); return { out: `${last(x.name)} va a ${t.short} a fine anno`, fx: `${last(x.name)} partirà a fine stagione` }; }
        if (chance(0.55)) { x.morale = clamp(x.morale + 12, 10, 100); x.form = clamp((x.form || 0) + 0.8, -3, 3); adjustRel(st, t.id, -8); return { out: 'Bluff riuscito: resta e si rimette a spingere' }; }
        x.nextTeam = t.id; x.nextSalary = +(salaryFor(x, st.category) * 1.25).toFixed(2); x.nextYears = 3; x.morale = clamp(x.morale - 8, 10, 100); addNews(st, `Mercato: ${x.name} firma con ${t.name} per il ${st.season + 1}.`); return { out: `Bluff scoperto: ${last(x.name)} firma con ${t.short}`, fx: `${last(x.name)} partirà a fine stagione` }; },
    ],
  },
  scandal: {
    name: 'Scandalo tecnico', from: 'Federazione Internazionale', icon: 'rules', min: 3, cool: 4,
    start(st) { const pt = playerTeam(st); const parts = perfParts(st); const best = parts.find((p) => Object.values(st.teams).every((t) => t.car.parts[p] <= pt.car.parts[p])); if (!best) return null; const acc = Object.values(st.teams).filter((t) => !t.isPlayer).sort((a, b) => (principal(st, a.id)?.rel || 0) - (principal(st, b.id)?.rel || 0))[0]; return acc ? { part: best, acc: acc.id } : null; },
    steps: [
      (st, d) => { const t = st.teams[d.acc]; return { title: `Inchiesta della Federazione sul ${partName(st, d.part).toLowerCase()}`, text: `Su segnalazione di ${t.name}, la Federazione apre un’inchiesta sul vostro ${partName(st, d.part).toLowerCase()}, il migliore del gruppo. I tecnici federali chiedono i disegni e la telemetria. La stampa ci va a nozze.`, a: [{ t: 'Collaborazione totale', note: 'Tutto alla luce del sole: esito tra due eventi, probabile assoluzione (70%)' }, { t: 'Avvocati e ricorso preventivo', note: `${fmtM(1.1 * scale(st))} · tempi lunghi: esito tra tre eventi (80% di assoluzione) · rapporto con l’accusatore -10` }, { t: 'Contrattacco: facciamo uscire i loro segreti', note: 'Rapporto -25 · 50%: anche loro finiscono sotto inchiesta', risk: true }] }; },
      (st, d) => ({ title: 'La sentenza è pronta', text: `La Federazione sta per pronunciarsi sul ${partName(st, d.part).toLowerCase()}. Un funzionario ti fa capire che un patteggiamento chiuderebbe la vicenda senza rischi in classifica.`, a: [{ t: 'Attendiamo la sentenza', note: `${Math.round(d.p * 100)}%: assolti e rafforzati (tifosi +, rapporto -8 con l’accusatore) · altrimenti ${d.pen} punti di penalità e pezzo da rifare (-3)`, risk: true }, { t: 'Patteggiamo', note: `Multa ${fmtM(1.8 * scale(st))} · ${partName(st, d.part)} -1,5 · nessuna penalità in classifica` }] }),
    ],
    resolve: [
      (st, d, i) => { const t = st.teams[d.acc]; d.pen = st.category === 'formula' ? 15 : 10;
        if (i === 0) { d.p = 0.7; return { out: 'Collaborazione con i tecnici federali', next: 1, wait: 2 }; }
        if (i === 1) { addFinance(st, 'Spese legali', -1.1 * scale(st)); adjustRel(st, d.acc, -10); d.p = 0.8; return { out: 'Battaglia legale avviata', next: 1, wait: 3 }; }
        adjustRel(st, d.acc, -25); d.p = 0.62; if (chance(0.5) && t) { bumpPart(t, pick(perfParts(st)), -2); press(st, { kind: 'brief', tone: 'good', h: `Inchiesta anche su ${t.name}: un pezzo va rifatto`, t: '', tag: 'Federazione' }); return { out: `Contrattacco riuscito: ${t.short} costretta a rifare un pezzo`, next: 1, wait: 2 }; } return { out: 'Contrattacco a vuoto', next: 1, wait: 2 }; },
      (st, d, i) => { const pt = playerTeam(st);
        if (i === 0) { if (chance(d.p)) { st.dp.fans = Math.round(st.dp.fans * 1.03); adjustRel(st, d.acc, -8); press(st, { kind: 'team', tone: 'good', h: `Assolti: il ${partName(st, d.part).toLowerCase()} di ${pt.name} è regolare`, t: 'La Federazione chiude l’inchiesta. In fabbrica si festeggia.', img: { k: 'team', id: pt.id }, tag: 'Federazione' }); return { out: 'Assolti con formula piena' }; }
          bumpPart(pt, d.part, -3); const P = st.dp; P.ptsPen[st.season] = { ...(P.ptsPen[st.season] || {}), [pt.id]: ((P.ptsPen[st.season] || {})[pt.id] || 0) + d.pen }; press(st, { kind: 'team', tone: 'bad', h: `Condannati: ${pt.name} perde ${d.pen} punti`, t: `Il ${partName(st, d.part).toLowerCase()} è stato giudicato irregolare.`, img: { k: 'team', id: pt.id }, tag: 'Federazione' }); return { out: `Condannati: -${d.pen} punti e ${partName(st, d.part)} -3`, fx: `Penalità di ${d.pen} punti nel campionato ${st.season}` }; }
        addFinance(st, 'Patteggiamento con la Federazione', -1.8 * scale(st)); bumpPart(pt, d.part, -1.5); return { out: 'Patteggiamento: vicenda chiusa' }; },
    ],
  },
  rookie: {
    name: 'Il debuttante terribile', from: 'Ufficio Stampa', icon: 'star', min: 3, cool: 3,
    start(st) { const pt = playerTeam(st); const C = st.category; const rk = teamDrivers(st, pt).find((x) => x.age <= 22 && (x.form || 0) >= 0.8); if (!rk) return null; return { d: rk.id, fee: +(0.9 * scale(st)).toFixed(2) }; },
    steps: [
      (st, d) => { const x = st.drivers[d.d]; return { title: `${x.name}, la rivelazione dell’anno`, text: `A ${x.age} anni ${x.name} sta stupendo tutti (${driverOverall(x, st.category)} di valutazione, forma: in crescita). Giornali, sponsor e TV lo vogliono ovunque. Come gestiamo il fenomeno?`, a: [{ t: 'Lo proteggiamo dai media', note: 'Forma +0,5 · nessun introito extra' }, { t: 'Tour mediatico e sponsor personali', note: `+${fmtM(d.fee)} · tifosi +3% · 35%: si distrae (forma -1)`, risk: true }, { t: 'Rinnovo anticipato pluriennale', note: `Contratto fino al ${st.season + 3} · stipendio +40% · nessuno potrà portarcelo via a buon prezzo` }] }; },
      (st, d) => { const x = st.drivers[d.d]; const t = st.teams[d.big]; return { title: `${t?.name || 'Un top team'} bussa per ${last(x.name)}`, text: `${t?.name} ha chiesto ufficialmente di poter trattare ${x.name}. Offrono un indennizzo importante e un motore/pacchetto tecnico come contropartita.`, a: [{ t: 'Non è in vendita', note: 'Morale del pilota +6 · rapporto con loro -6' }, { t: 'Cessione a fine stagione', note: `Indennizzo ${fmtM(d.fee * 4)} · ${partName(st, perfParts(st)[0])} +1,5 dal loro reparto tecnico · il pilota parte a fine anno` }] }; },
    ],
    resolve: [
      (st, d, i) => { const x = st.drivers[d.d]; if (!x) return { out: '' };
        if (i === 0) { x.form = clamp((x.form || 0) + 0.5, -3, 3); return { out: 'Protetto dai riflettori' }; }
        if (i === 1) { addFinance(st, `Sponsor personali di ${x.name}`, d.fee); st.dp.fans = Math.round(st.dp.fans * 1.03); if (chance(0.35)) x.form = clamp((x.form || 0) - 1, -3, 3); }
        if (i === 2) { x.contract = Math.max(x.contract, 3); x.salary = +(x.salary * 1.4).toFixed(2); return { out: `${last(x.name)} blindato fino al ${st.season + x.contract - 1}`, fx: `${last(x.name)} sotto contratto lungo` }; }
        const big = Object.values(st.teams).filter((t) => !t.isPlayer).sort((a, b) => b.rep - a.rep)[0]; d.big = big?.id; return big ? { out: 'Tour mediatico', next: 1, wait: 2 } : { out: 'Tour mediatico' }; },
      (st, d, i) => { const x = st.drivers[d.d]; const t = st.teams[d.big]; if (!x || !t) return { out: '' };
        if (i === 0) { x.morale = clamp(x.morale + 6, 10, 100); adjustRel(st, t.id, -6); return { out: 'Resta con noi' }; }
        x.nextTeam = t.id; x.nextSalary = +(salaryFor(x, st.category) * 1.3).toFixed(2); x.nextYears = 3; addFinance(st, `Indennizzo da ${t.name} per ${x.name}`, +(d.fee * 4).toFixed(2)); bumpPart(playerTeam(st), perfParts(st)[0], 1.5); adjustRel(st, t.id, 10); return { out: `${last(x.name)} venduto a ${t.short}`, fx: `${last(x.name)} partirà a fine stagione` }; },
    ],
  },
  decider: {
    name: 'Notte prima del titolo', from: 'Muretto box', icon: 'trophy', min: 0, cool: 1, late: true,
    start(st) { const n = st.calendar.length; if (n - st.round > 2 || st.round < n - 3) return null; const s = standings(st); const pt = playerTeam(st); const tpos = s.teams.findIndex((x) => x.id === pt.id); const left = n - st.round; const maxPts = left * (st.category === 'endurance' ? 50 : 26) * (st.category === 'formula' ? 2 : 1); const gap = tpos === 0 ? s.teams[0].pts - (s.teams[1]?.pts || 0) : s.teams[0].pts - s.teams[tpos].pts; if (tpos > 2 || gap > maxPts * 0.7) return null; return { lead: tpos === 0, gap }; },
    steps: [
      (st, d) => ({ title: d.lead ? 'Il titolo è a un passo: come lo difendiamo?' : `${d.gap} punti dal titolo: tutto o niente?`, text: d.lead ? `Siamo in testa con ${d.gap} punti di margine. Gli ingegneri propongono di correre in difesa, il marketing vuole uno show. La pressione sui piloti è enorme.` : `Siamo a ${d.gap} punti dalla vetta con pochissimi eventi da correre. Per vincere serve un azzardo. Il box aspetta una linea chiara.`, a: [{ t: 'Linea prudente: affidabilità prima di tutto', note: 'Affidabilità +4 fino a fine stagione · motore -1' }, { t: 'Massimo attacco', note: 'Motore +1,5 · affidabilità -5 · forma dei piloti +0,6', risk: true }, { t: 'Un ritiro a porte chiuse con i piloti', note: `${fmtM(0.5 * scale(st))} · morale +8, forma +0,3` }] }),
    ],
    resolve: [
      (st, d, i) => { const pt = playerTeam(st); const ds = teamDrivers(st, pt);
        if (i === 0) { bumpPart(pt, 'reliability', 4); bumpPart(pt, 'engine', -1); return { out: 'Linea prudente' }; }
        if (i === 1) { bumpPart(pt, 'engine', 1.5); bumpPart(pt, 'reliability', -5); for (const x of ds) x.form = clamp((x.form || 0) + 0.6, -3, 3); return { out: 'Massimo attacco' }; }
        addFinance(st, 'Ritiro pre-gara', -0.5 * scale(st)); for (const x of ds) { x.morale = clamp(x.morale + 8, 10, 100); x.form = clamp((x.form || 0) + 0.3, -3, 3); } return { out: 'Squadra compatta' }; },
    ],
  },
  feud: {
    name: 'Guerra tra team principal', from: 'Radio Paddock', icon: 'users', min: 2, cool: 4,
    start(st) { const foe = Object.values(st.teams).filter((t) => !t.isPlayer && (principal(st, t.id)?.rel ?? 0) <= -30).sort((a, b) => principal(st, a.id).rel - principal(st, b.id).rel)[0]; return foe ? { t: foe.id } : null; },
    steps: [
      (st, d) => { const p = principal(st, d.t); const t = st.teams[d.t]; return { title: `${p.name} ti attacca in conferenza stampa`, text: `«${playerTeam(st).name}? Gente che vince solo a parole.» ${p.name} (${t.name}) ha scelto la conferenza del giovedì per sparare a zero su di te e sulla squadra. I giornalisti aspettano la tua replica.`, a: [{ t: 'Rispondo con eleganza', note: 'Reputazione + · rapporto +6' }, { t: 'Replica al vetriolo', note: 'Tifosi +2% · rapporto -12 · la faida continua', risk: true }, { t: 'Silenzio stampa', note: 'Nessun effetto immediato' }] }; },
      (st, d) => { const p = principal(st, d.t); const t = st.teams[d.t]; return { title: `${t.name} prova a portarti via i meccanici`, text: `Dopo la guerra di parole, ${p.name} passa ai fatti: offerte ai tuoi meccanici migliori e un reclamo pretestuoso sui pit stop. È il momento di chiudere la faida o di vincerla.`, a: [{ t: 'Cena di pace', note: `${fmtM(0.6 * scale(st))} · rapporto +30 · faida chiusa` }, { t: 'Rilancio sugli stipendi del box', note: `${fmtM(0.9 * scale(st))} · i meccanici restano, motivati (affidabilità +1,5)` }, { t: 'Denuncia pubblica', note: '50%: la Federazione li multa e perdono 1,5 su un componente · 50%: figuraccia (fiducia -4)', risk: true }] }; },
    ],
    resolve: [
      (st, d, i) => { const pt = playerTeam(st);
        if (i === 0) { adjustRel(st, d.t, 6); pt.rep = clamp(+(pt.rep + 0.6).toFixed(1), 20, 100); return { out: 'Risposta elegante' }; }
        if (i === 1) { adjustRel(st, d.t, -12); st.dp.fans = Math.round(st.dp.fans * 1.02); return { out: 'Replica al vetriolo', next: 1, wait: 2 }; }
        return { out: 'Silenzio stampa', next: chance(0.5) ? 1 : null, wait: 3 }; },
      (st, d, i) => { const pt = playerTeam(st); const t = st.teams[d.t];
        if (i === 0) { addFinance(st, `Cena di pace con ${principal(st, d.t)?.name || t?.name}`, -0.6 * scale(st)); adjustRel(st, d.t, 30); return { out: 'Faida chiusa', fx: `Pace con ${t?.name}` }; }
        if (i === 1) { addFinance(st, 'Rinnovi del personale di box', -0.9 * scale(st)); bumpPart(pt, 'reliability', 1.5); return { out: 'Box blindato' }; }
        if (chance(0.5) && t) { bumpPart(t, pick(perfParts(st)), -1.5); adjustRel(st, d.t, -10); return { out: `${t.short} multata dalla Federazione` }; } st.board.confidence = clamp(st.board.confidence - 4, 0, 100); return { out: 'Denuncia respinta: figuraccia' }; },
    ],
  },
};
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
export const STORY_ARCS = Object.fromEntries(Object.entries(ARCS).map(([k, a]) => [k, { name: a.name, icon: a.icon }]));

// Called by dynasty.maybeDynDecision: continue the active arc, or (rarely) open a new one
export function storyMaybeDecision(st) {
  const P = ensureCareer5(st); if (!P || st.pendingDyn) return false;
  const S = P.story; const n = st.calendar.length;
  if (S.active) {
    const A = ARCS[S.active.arc];
    if (!A || S.active.season !== st.season) { S.active = null; return false; }
    if (st.round >= S.active.at) { st.pendingDyn = { kind: 'story', arc: S.active.arc, step: S.active.step }; return true; }
    return false;
  }
  if (st.round >= n) return false;
  // the title decider is not random: it happens whenever the title is on the line
  for (const id of ['decider']) {
    const A = ARCS[id]; if ((S.done[id] || -99) === st.season) continue;
    const data = A.start(st); if (data) { S.done[id] = st.season; S.active = { arc: id, step: 0, data, at: st.round, season: st.season }; st.pendingDyn = { kind: 'story', arc: id, step: 0 }; return true; }
  }
  if (st.round < 2 || st.round > n - 3 || modalLoad(st) >= 1 || !chance(0.35)) return false;
  for (const id of Object.keys(ARCS).sort(() => Math.random() - 0.5)) {
    const A = ARCS[id]; if (A.late || st.round < A.min) continue;
    if (st.season - (S.done[id] ?? -99) < A.cool) continue;
    const data = A.start(st); if (!data) continue;
    S.done[id] = st.season; S.active = { arc: id, step: 0, data, at: st.round, season: st.season };
    st.pendingDyn = { kind: 'story', arc: id, step: 0 }; return true;
  }
  return false;
}
export function storyView(st, pd) {
  const P = ensureCareer5(st); const S = P?.story; if (!S?.active || S.active.arc !== pd.arc) return null;
  const A = ARCS[pd.arc]; const f = A?.steps[pd.step]; if (!f) return null;
  try { const v = f(st, S.active.data); return v ? { tag: `Storia · ${A.name} · capitolo ${pd.step + 1}/${A.steps.length}`, from: A.from || 'Paddock', ...v } : null; } catch { return null; }
}
export function storyResolve(st, pd, i) {
  const P = ensureCareer5(st); const S = P.story; const act = S.active; if (!act) return '';
  const A = ARCS[act.arc]; const view = storyView(st, pd);
  let r = { out: '' };
  try { r = A.resolve[pd.step](st, act.data, i) || { out: '' }; } catch (e) { r = { out: '' }; }
  S.log.unshift({ s: st.season, r: st.round, arc: act.arc, step: pd.step, title: view?.title || A.name, choice: view?.a?.[i]?.t || '', out: r.out });
  if (S.log.length > 24) S.log.length = 24;
  if (r.fx) { S.fx.unshift({ s: st.season, arc: act.arc, text: r.fx }); if (S.fx.length > 12) S.fx.length = 12; }
  if (r.next != null && A.steps[r.next]) { act.step = r.next; act.at = st.round + (r.wait || 2); if (act.at >= st.calendar.length) S.active = null; }
  else S.active = null;
  return r.out;
}
export function storyInfo(st) {
  const P = ensureCareer5(st); const S = P?.story; if (!S) return { active: null, log: [], fx: [] };
  const a = S.active ? { ...S.active, name: ARCS[S.active.arc]?.name, steps: ARCS[S.active.arc]?.steps.length, inRounds: Math.max(0, S.active.at - st.round) } : null;
  return { active: a, log: S.log, fx: S.fx };
}

// =====================================================================================
// ROUTINE DELEGATIONS
// =====================================================================================
// returns true when the decision was handled without a modal
export function autoHandle(st, pd) {
  const P = ensureCareer5(st); if (!P) return false;
  if (pd.kind === 'bet' && P.pol.noBets) return true; // silently declined: no news, no relationship hit
  return false;
}

// Auto kits: buy a track kit when at least two suitable events remain and the cash allows it
export function autoKits(st) {
  const P = ensureCareer5(st); if (!P?.pol.autoKit || !kitsEnabled(st)) return [];
  const pt = playerTeam(st); const out = [];
  for (const k of Object.keys(KITS)) {
    if (P.kits[k] || kitTracks(st, k).length < 2 || pt.money < kitCost(st) * 4) continue;
    if (st.category === 'formula' && capSpent(st) + kitCost(st) > costCap(st)) continue;
    const r = buyKit(st, k); if (r.ok) out.push(KITS[k].name);
  }
  if (out.length) addMail(st, { from: 'Responsabile di produzione', icon: 'rd', type: 'info', subject: `Pacchetti per circuito ordinati: ${out.join(', ')}`, body: `Come da delega, abbiamo messo in produzione: ${out.join(', ')} (${fmtM(kitCost(st))} ciascuno). Verranno montati automaticamente sui circuiti adatti.` });
  return out;
}

// Routine development: idle R&D slots are filled by the technical director with small, safe upgrades
// on the most useful part (never over the budget cap, never below a cash cushion). Players who plan
// their own programme simply keep the slots busy; the delegation can be switched off.
export function autoDevelop(st) {
  const P = ensureCareer5(st); if (!P?.pol.autoDev) return [];
  const pt = playerTeam(st); const n = st.calendar.length;
  if (st.round >= n - 1) return [];
  const cost = rdCost(st, 'base'); const out = [];
  let free = Math.min(rdSlots(pt, st) - pt.projects.length, 1 - pt.projects.filter((x) => x.auto).length); // one routine project at a time
  if (free <= 0 || pt.money < cost * 4) return [];
  let prio = [];
  try { prio = strategyRoom(st).dev.prio.concat(cat(st).parts.map((p) => ({ id: p.id, name: p.name }))); } catch { prio = cat(st).parts.map((p) => ({ id: p.id, name: p.name })); }
  const seen = new Set();
  for (const p of prio) {
    if (free <= 0 || seen.has(p.id)) continue; seen.add(p.id);
    if (pt.money < cost * 4) break;
    if (st.category === 'formula' && capSpent(st) + cost > costCap(st) * 0.97) break;
    const r = startProject(st, p.id, 'base', false, 'safe');
    if (r.ok) { free--; out.push(p.name || partName(st, p.id)); pt.projects[pt.projects.length - 1].auto = true; }
  }
  if (out.length) addMail(st, { from: 'Direttore Tecnico', icon: 'rd', type: 'info', subject: `Sviluppo di routine: ${out.join(', ')}`, body: `Gli slot R&D erano liberi: come da delega abbiamo avviato aggiornamenti di base (approccio conservativo) su ${out.join(', ')}, ${fmtM(cost)} ciascuno. Per un programma più ambizioso avvia tu i progetti dal Centro Tecnico, o disattiva la delega nella Sala strategica.` });
  return out;
}

// =====================================================================================
// STRATEGY ROOM
// =====================================================================================
export function strategyRoom(st) {
  const P = ensureCareer5(st); const pt = playerTeam(st); const C = cat(st); const n = st.calendar.length;
  const s = standings(st); const myPos = s.teams.findIndex((x) => x.id === pt.id) + 1;
  const left = n - st.round;
  const exp = expectedRank(st);
  const ranking = overallCarRanking(st);
  // points pace projection
  const myPts = s.teams[myPos - 1]?.pts || 0;
  const done = Math.max(1, st.round);
  const proj = s.teams.map((x) => ({ id: x.id, pts: x.pts, proj: Math.round(x.pts + (x.pts / done) * left) })).sort((a, b) => b.proj - a.proj);
  const projPos = proj.findIndex((x) => x.id === pt.id) + 1;
  // rivals: the two teams above and below in the standings
  const ids = s.teams.map((x) => x.id); const i0 = ids.indexOf(pt.id);
  const rivals = [ids[i0 - 2], ids[i0 - 1], ids[i0 + 1], ids[i0 + 2]].filter(Boolean).map((id) => {
    const t = st.teams[id]; const tr = aiTrend(st, id);
    return { id, name: t.name, short: t.short, pts: s.teams.find((x) => x.id === id).pts, gap: s.teams.find((x) => x.id === id).pts - myPts, car: +avgPart(t).toFixed(1), carRank: ranking.indexOf(id) + 1, trend: tr, prep: P.ai[id]?.prep, engine: t.engine, works: t.works, rel: principal(st, id)?.rel ?? 0, drv: Math.max(0, ...teamDrivers(st, t).map((d) => driverOverall(d, C))) };
  });
  // development plan
  const slots = rdSlots(pt, st); const capOn = st.category === 'formula';
  const cap = capOn ? costCap(st) : null; const spent = capOn ? capSpent(st) : null;
  const burn = capOn && st.round > 0 ? spent / st.round : 0;
  const capProj = capOn ? +(spent + burn * left).toFixed(1) : null;
  const tk = st.category !== 'junior' ? tokenInfo(st) : null;
  // part priority: weakness vs the best car, weighted by the remaining calendar
  const weights = {};
  for (const ev of st.calendar.slice(st.round)) { const tr = getTrack(st.category, ev.trackId); for (const [k, v] of Object.entries(tr?.w || {})) weights[k] = (weights[k] || 0) + v; }
  const prio = C.parts.map((p) => { const best = Math.max(...Object.values(st.teams).map((t) => t.car.parts[p.id])); const gap = best - pt.car.parts[p.id]; return { id: p.id, name: p.name, gap: +gap.toFixed(1), w: +(weights[p.id] || 1).toFixed(1), score: (gap + 1) * (weights[p.id] || left || 1) * ((102 - pt.car.parts[p.id]) / 24) }; }).sort((a, b) => b.score - a.score);
  const era = eraInfo(st);
  const pu = st.category === 'formula' ? puDeal(st) : null;
  const sups = st.category === 'formula' ? supplierList(st).sort((a, b) => b.power - a.power) : [];
  const acad = academyDrivers(st); const C2 = st.category;
  const worst = teamDrivers(st, pt).sort((a, b) => driverOverall(a, C2) - driverOverall(b, C2))[0];
  const bestJ = acad.slice().sort((a, b) => driverOverall(b, C2) - driverOverall(a, C2))[0];
  const loanOpen = acad.some((j) => loanTargets(st, j).length);
  // market: expiring drivers, rival offers and how the driver leans
  const market = teamDrivers(st, pt).map((d) => ({ id: d.id, name: d.name, ov: driverOverall(d, C2), contract: d.contract, morale: d.morale, offer: d.rivalOffer && st.teams[d.rivalOffer.teamId] ? { team: st.teams[d.rivalOffer.teamId].name, salary: d.rivalOffer.salary, deadline: d.rivalOffer.deadline - st.round, lean: +(offerScore(st, d, st.teams[d.rivalOffer.teamId], d.rivalOffer.salary, d.rivalOffer.years) - offerScore(st, d, pt, d.salary, 2)).toFixed(2) } : null, leaving: d.nextTeam && d.nextTeam !== pt.id ? st.teams[d.nextTeam]?.name : null, clause: d.clause || 0 }));
  const silly = [
    { at: Math.floor(n * 0.45), t: 'Avviso contratti in scadenza' },
    { at: Math.floor(n * 0.5), t: 'Si aprono i precontratti e le offerte dei rivali' },
    { at: Math.floor(n * 0.7), t: 'Silly season: i top team firmano le stelle in scadenza' },
    { at: n, t: 'Mercato invernale: piloti liberi e promozioni' },
  ].map((x) => ({ ...x, done: st.round >= x.at, round: Math.min(n, x.at + 1) }));
  // checklist of the choices that matter this season
  const todo = [];
  if (era.left === 1 && era.canSet) todo.push({ k: 'era', t: `Regolamento ${era.next}: linea «${era.pol.name}», stima ${era.swing >= 0 ? '+' : ''}${era.swing} sulla nuova vettura`, tab: 'regs', warn: era.swing < 0 });
  if (pt.projects.length < slots) todo.push({ k: 'rd', t: `${slots - pt.projects.length} slot R&D ${slots - pt.projects.length === 1 ? "libero" : "liberi"}: priorità consigliata ${prio[0].name}`, tab: 'dev', warn: true });
  if (capOn && capProj > cap) todo.push({ k: 'cap', t: `Al ritmo attuale chiuderai a ${fmtM(capProj)} sul cap di ${fmtM(cap)}: rischio multa e punti`, tab: 'dev', warn: true });
  if (tk && !tk.frozen && tk.left <= 1 && left > 2) todo.push({ k: 'tok', t: `Restano ${tk.left} gettoni motore: sposta lo sviluppo sulla vettura ${st.season + 1}`, tab: 'dev' });
  if (pu && !pu.works && st.round === 0 && sups[0] && sups[0].id !== pu.sup) todo.push({ k: 'pu', t: `Il motore più potente è ${sups[0].name} (${sups[0].power}); il tuo fornitore è a ${sups.find((x) => x.id === pu.sup)?.power}`, tab: 'regs' });
  if (bestJ && worst && driverOverall(bestJ, C2) > driverOverall(worst, C2)) todo.push({ k: 'acad', t: `${bestJ.name} (accademia, ${driverOverall(bestJ, C2)}) vale più di ${worst.name} (${driverOverall(worst, C2)})`, nav: 'drivers' });
  else if (loanOpen) todo.push({ k: 'loan', t: 'Finestra prestiti aperta: un junior in prestito cresce più in fretta', nav: 'drivers' });
  for (const m of market) if (m.offer) todo.push({ k: 'mkt', t: `${m.offer.team} offre ${fmtM(m.offer.salary)} a ${m.name}: decide entro ${m.offer.deadline <= 1 ? 'il prossimo evento' : m.offer.deadline + ' eventi'} e ${m.offer.lean > 0 ? 'oggi firmerebbe con loro: serve un rinnovo migliore' : 'per ora preferisce restare'}`, nav: 'drivers', warn: m.offer.lean > 0 });
  if (kitsEnabled(st)) for (const k of Object.keys(KITS)) if (!P.kits[k] && kitTracks(st, k).length >= 2) todo.push({ k: 'kit', t: `${KITS[k].name}: utile in ${kitTracks(st, k).length} eventi rimasti`, tab: 'regs' });
  return {
    pos: myPos, myPts, target: st.board.target, exp, projPos, left, rivals,
    dev: { slots, used: pt.projects.length, cap, spent, capProj, tokens: tk, prio: prio.slice(0, 3), nextYear: pt.nextYear || null },
    era, pu: pu ? { ...pu, rank: sups.findIndex((x) => x.id === (pu.works ? pt.engine : pu.sup)) + 1, of: sups.length, best: sups[0] } : null,
    acad: { n: acad.length, slots: academySlots(pt), best: bestJ ? { name: bestJ.name, ov: driverOverall(bestJ, C2) } : null, worst: worst ? { name: worst.name, ov: driverOverall(worst, C2) } : null, loanOpen },
    market, silly, todo, story: storyInfo(st), pol: P.pol,
  };
}

// Small descriptor for the hub/sidebar (UI agent): how many strategic choices are open and the top two
export function strategyBadge(st) {
  try { const R = strategyRoom(st); return { count: R.todo.length, warn: R.todo.filter((x) => x.warn).length, items: R.todo.slice(0, 2).map((x) => ({ text: x.t, screen: x.nav || 'car', params: x.nav ? {} : { tab: 'plan' } })), story: R.story.active ? { name: R.story.active.name, inRounds: R.story.active.inRounds } : null, link: { screen: 'car', params: { tab: 'plan' }, label: 'Sala strategica' } }; } catch { return { count: 0, warn: 0, items: [], story: null, link: { screen: 'car', params: { tab: 'plan' }, label: 'Sala strategica' } }; }
}

// =====================================================================================
// SEASON AWARDS & RECORDS CHASE
// =====================================================================================
export function careerAwards(st, sum) {
  const P = ensureCareer5(st); if (!P) return [];
  const out = [];
  const teams = Object.values(st.teams);
  const start = P.carStart?.season === st.season ? P.carStart.v : null;
  if (start) {
    const dev = teams.map((t) => ({ t, g: avgPart(t) - (start[t.id] ?? avgPart(t)) })).sort((a, b) => b.g - a.g)[0];
    if (dev) out.push({ name: 'Miglior sviluppo', who: dev.t.name, team: '', note: `+${dev.g.toFixed(1)} di valore vettura in stagione`, icon: 'factory', mine: dev.t.isPlayer });
  }
  const moves = teams.filter((t) => t.prevPos).map((t) => ({ t, d: t.prevPos - (sum.st.teams.findIndex((x) => x.id === t.id) + 1) }));
  const up = moves.sort((a, b) => b.d - a.d)[0]; const down = moves.slice().sort((a, b) => a.d - b.d)[0];
  if (up && up.d >= 2) out.push({ name: 'Sorpresa dell’anno', who: up.t.name, team: '', note: `+${up.d} posizioni nei costruttori`, icon: 'speed', mine: up.t.isPlayer });
  if (down && down.d <= -2) out.push({ name: 'Delusione dell’anno', who: down.t.name, team: '', note: `${down.d} posizioni nei costruttori`, icon: 'alert', mine: down.t.isPlayer });
  const rel = teams.map((t) => ({ t, dnf: st.calendar.reduce((a, e) => a + (e.results?.classification || []).filter((r) => r.teamId === t.id && r.status === 'dnf').length, 0) })).sort((a, b) => a.dnf - b.dnf)[0];
  if (rel) out.push({ name: 'Affidabilità d’oro', who: rel.t.name, team: '', note: `${rel.dnf} ritiri in tutta la stagione`, icon: 'wrench', mine: rel.t.isPlayer });
  return out;
}
// Drivers within reach of an all-time record (career wins / podiums / poles / titles)
export function recordsChase(st) {
  const P = ensureDepth(st); if (!P) return [];
  const rows = [...Object.values(st.drivers).map((d) => ({ name: d.name, active: !d.retired && !!d.teamId, mine: d.teamId === st.playerTeam, ...d.stats })), ...(P.hof || []).map((h) => ({ ...h, active: false }))];
  const out = [];
  for (const [k, lbl] of [['wins', 'vittorie'], ['podiums', 'podi'], ['poles', 'pole'], ['titles', 'titoli']]) {
    const sorted = rows.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]);
    const rec = sorted[0]; if (!rec || rec[k] < ({ wins: 10, podiums: 25, poles: 8, titles: 2 }[k])) continue;
    const ch = sorted.find((r) => r.active && r.name !== rec.name && rec[k] - r[k] <= Math.max(2, rec[k] * 0.25));
    if (rec.active) out.push({ k, lbl, holder: rec.name, v: rec[k], mine: rec.mine, text: `${rec.name} detiene il record di ${lbl} (${rec[k]}) ed è ancora in attività` });
    else if (ch) out.push({ k, lbl, holder: rec.name, v: rec[k], chaser: ch.name, cv: ch[k], mine: ch.mine, text: `${ch.name} è a ${rec[k] - ch[k]} ${lbl} dal record di ${rec.name} (${rec[k]})` });
  }
  return out;
}

// =====================================================================================
// HOOKS
// =====================================================================================
export function career5PostRound(st) {
  const P = ensureCareer5(st); if (!P) return;
  autoKits(st);
  autoDevelop(st);
  weeklyDigest(st);
  commit(st);
}
export function career5NewSeason(st) {
  const P = ensureCareer5(st); if (!P) return;
  const pt = playerTeam(st);
  P.carStart = { season: st.season, v: Object.fromEntries(Object.values(st.teams).map((t) => [t.id, +avgPart(t).toFixed(2)])) };
  for (const t of Object.values(st.teams)) t.prevPos = t.lastPos || null;
  if (hasFacPerk(pt, 'simulator', 4)) for (const d of teamDrivers(st, pt)) d.form = clamp((d.form || 0) + 0.4, -3, 3);
  P.story.active = null;
  for (const d of Object.values(st.drivers)) if (d.clause && d.teamId !== pt.id) d.clause = 0;
  autoKits(st);
}
// Called when the manager moves to another team of the same category: team-bound depth state starts over
export function career5TeamSwitch(st) {
  const P = st.dp; if (!P) return;
  delete P.owner; delete P.fans; delete P.fans0; delete P.pu; P.suspects = []; P.incoming = [];
  P.mode = 'std'; P.kits = { season: st.season, low: false, high: false };
  if (P.story) P.story.active = null;
  for (const d of Object.values(st.drivers)) d.clause = 0;
}
void seatsPerTeam; void rand;
