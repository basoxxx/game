// Narrative: press conferences and paddock events with choices
import { pick, chance, clamp, rand, shuffle } from './rng.js';
import { addFinance, addMail, addNews, playerTeam, teamDrivers, fmtM, cat } from './season.js';
import { gainXP } from './progress.js';

function morale(d, v) { if (d) d.morale = clamp(d.morale + v, 10, 100); }
function board(st, v) { st.board.confidence = clamp(st.board.confidence + v, 0, 100); }
function rep(st, v) { st.career.reputation = clamp(st.career.reputation + v, 0, 100); }

// ---------------- PRESS CONFERENCE ----------------
export function pressQuestion(st, res) {
  const t = playerTeam(st);
  const mine = res.classification.filter((r) => r.teamId === t.id);
  const best = mine.slice().sort((a, b) => (a.status === 'dnf' ? 99 : a.pos) - (b.status === 'dnf' ? 99 : b.pos))[0];
  if (!best) return null;
  const d = st.drivers[best.driverIds[0]];
  const other = mine.find((r) => r !== best);
  const od = other ? st.drivers[other.driverIds[0]] : null;
  const won = best.pos === 1 && best.status !== 'dnf';
  const pod = best.pos <= 3 && best.status !== 'dnf';
  const allDnf = mine.every((r) => r.status === 'dnf');
  const journalist = pick(['Gazzetta Motori', 'Autosprint Magazine', 'Pit Lane TV', 'The Racing Times', 'Motorsport Weekly', 'Radio Paddock']);
  if (won) return { journalist, q: `Che vittoria! ${d.name} è stato perfetto. È l’inizio di un dominio?`, a: [
    { t: 'Questo è solo l’inizio. Puntiamo al titolo.', fx: () => { board(st, 4); rep(st, 1.5); morale(d, 3); }, note: 'Fiducia CdA +, reputazione +, più pressione' },
    { t: 'Merito di tutta la squadra in fabbrica.', fx: () => { teamDrivers(st, t).forEach((x) => morale(x, 3)); rep(st, 0.5); }, note: 'Morale squadra +' },
    { t: 'Restiamo umili, gara dopo gara.', fx: () => { morale(d, 1); gainXP(st, 40, 'Stampa'); }, note: '+40 XP' },
  ] };
  if (allDnf) return { journalist, q: 'Doppio ritiro: è una crisi tecnica?', a: [
    { t: 'Abbiamo spinto al limite, torneremo più forti.', fx: () => { teamDrivers(st, t).forEach((x) => morale(x, 2)); board(st, -1); }, note: 'Morale +, CdA -' },
    { t: 'Analizzeremo tutto. L’affidabilità è la priorità.', fx: () => { const p = t.car.parts; p.reliability = Math.min(99, p.reliability + 0.6); board(st, 1); }, note: 'Affidabilità +0.6' },
    { t: 'Nessun commento.', fx: () => { rep(st, -1); }, note: 'Reputazione -' },
  ] };
  if (od && other.status !== 'dnf' && best.status !== 'dnf' && Math.abs(best.pos - other.pos) <= 2 && chance(0.5)) return { journalist, q: `${d.name} e ${od.name} sono arrivati vicinissimi. C’è rivalità interna?`, a: [
    { t: 'Sono liberi di lottare, vinca il migliore.', fx: () => { morale(d, 2); morale(od, 2); }, note: 'Morale entrambi +, rischio contatti' },
    { t: `${d.name} è il nostro pilota di riferimento.`, fx: () => { morale(d, 5); morale(od, -6); }, note: `${d.name} +, ${od.name} -` },
    { t: 'L’interesse della squadra viene prima di tutto.', fx: () => { board(st, 2); morale(od, -1); morale(d, -1); }, note: 'CdA +' },
  ] };
  if (pod) return { journalist, q: `Podio per ${d.name}! Cosa manca per vincere?`, a: [
    { t: 'Ci serve un aggiornamento aerodinamico, ci stiamo lavorando.', fx: () => { gainXP(st, 30, 'Stampa'); board(st, 1); }, note: '+30 XP, CdA +' },
    { t: 'Abbiamo il pilota migliore, manca poco.', fx: () => { morale(d, 5); }, note: `Morale ${d.name} ++` },
    { t: 'Gli sponsor saranno felici di questo risultato.', fx: () => { addFinance(st, 'Visibilità mediatica podio', +(1.2 * cat(st).budgetScale).toFixed(2)); }, note: `+${fmtM(1.2 * cat(st).budgetScale)}` },
  ] };
  if (best.pos > 10 || best.status === 'dnf') return { journalist, q: 'Risultato deludente. Il consiglio è preoccupato?', a: [
    { t: 'Ho piena fiducia nel progetto: pazienza.', fx: () => { board(st, -1); morale(d, 2); }, note: 'Morale +, CdA -' },
    { t: 'Il pilota deve fare di più.', fx: () => { morale(d, -8); board(st, 2); }, note: `CdA +, morale ${d.name} --` },
    { t: 'Investiremo di più nello sviluppo.', fx: () => { board(st, 3); addFinance(st, 'Impegno pubblico extra R&D', -(1 * cat(st).budgetScale)); }, note: `CdA ++, -${fmtM(1 * cat(st).budgetScale)}` },
  ] };
  return { journalist, q: `Punti importanti per ${t.name}. Soddisfatto?`, a: [
    { t: 'Sì, il passo gara è stato ottimo.', fx: () => { morale(d, 2); gainXP(st, 20, 'Stampa'); }, note: '+20 XP' },
    { t: 'No, possiamo puntare più in alto.', fx: () => { board(st, 2); morale(d, -1); }, note: 'CdA +' },
    { t: 'La strategia ha fatto la differenza.', fx: () => { gainXP(st, 35, 'Stampa'); }, note: '+35 XP' },
  ] };
}

// ---------------- PADDOCK EVENTS ----------------
const EVENTS = [
  (st, t, C) => ({ title: 'Pezzo sperimentale', from: 'Direttore Tecnico', text: 'Un fornitore ci propone un fondo sperimentale non ancora validato. Promette carico, ma potrebbe essere fragile.', a: [
    { t: 'Montiamolo subito', note: 'Aero +2, Affidabilità -2', fx: () => { t.car.parts.aero && (t.car.parts.aero = Math.min(99, t.car.parts.aero + 2)); t.car.parts.reliability = Math.max(30, t.car.parts.reliability - 2); } },
    { t: 'Prima vogliamo testarlo', note: `Costo ${fmtM(1.5 * C.budgetScale)}, Aero +1`, fx: () => { addFinance(st, 'Test pezzo sperimentale', -1.5 * C.budgetScale); if (t.car.parts.aero) t.car.parts.aero = Math.min(99, t.car.parts.aero + 1); } },
    { t: 'No, grazie', note: 'Nessun effetto', fx: () => {} },
  ] }),
  (st, t, C) => ({ title: 'Evento promozionale', from: 'Area Commerciale', text: 'Uno sponsor chiede i piloti per un evento promozionale proprio prima del prossimo weekend. Pagano bene, ma i piloti preferirebbero allenarsi.', a: [
    { t: 'Accettiamo', note: `+${fmtM(2 * C.budgetScale)}, morale piloti -3`, fx: () => { addFinance(st, 'Evento promozionale', 2 * C.budgetScale); teamDrivers(st, t).forEach((d) => morale(d, -3)); } },
    { t: 'Mandiamo solo uno dei piloti', note: `+${fmtM(1 * C.budgetScale)}`, fx: () => { addFinance(st, 'Evento promozionale (ridotto)', 1 * C.budgetScale); morale(teamDrivers(st, t)[0], -3); } },
    { t: 'Rifiutiamo', note: 'Morale piloti +2', fx: () => { teamDrivers(st, t).forEach((d) => morale(d, 2)); } },
  ] }),
  (st, t, C) => { const td = st.staff[t.staff.td]; if (!td) return null; return { title: 'Offerta per il Direttore Tecnico', from: td.name, text: `Un team rivale ha offerto a ${td.name} un contratto molto ricco. Vuole sapere se lo valorizziamo.`, a: [
    { t: 'Aumento di stipendio', note: `Stipendio +40%, valore +2`, fx: () => { td.salary = +(td.salary * 1.4).toFixed(2); td.rating = Math.min(99, td.rating + 2); } },
    { t: 'Bonus una tantum', note: `-${fmtM(td.salary * 0.8)}`, fx: () => { addFinance(st, `Bonus fedeltà ${td.name}`, -td.salary * 0.8); } },
    { t: 'Lasciamolo andare', note: 'Perdi il DT: verrà sostituito da uno meno bravo', fx: () => { td.teamId = null; const repl = Object.values(st.staff).filter((s) => s.role === 'td' && !s.teamId).sort((a, b) => a.rating - b.rating)[0]; if (repl) { repl.teamId = t.id; t.staff.td = repl.id; } } },
  ] }; },
  (st, t, C) => ({ title: 'Indagine della Federazione', from: 'Federazione Internazionale', text: 'I commissari sospettano che la nostra ala anteriore si fletta troppo ad alta velocità. Possiamo modificarla o difenderla.', a: [
    { t: 'La modifichiamo subito', note: 'Aero -1.5', fx: () => { if (t.car.parts.aero) t.car.parts.aero -= 1.5; } },
    { t: 'La difendiamo: è legale!', note: '50%: nessun effetto · 50%: multa e Aero -2.5', fx: () => { if (chance(0.5)) { addFinance(st, 'Multa della Federazione', -3 * C.budgetScale); if (t.car.parts.aero) t.car.parts.aero -= 2.5; addNews(st, `${t.name} multata per l’ala flessibile!`); } else addNews(st, `La Federazione assolve ${t.name}: l’ala è regolare.`); } },
  ] }),
  (st, t, C) => { const ds = teamDrivers(st, t); const d = ds.sort((a, b) => a.morale - b.morale)[0]; if (!d) return null; return { title: `${d.name} vuole parlare`, from: d.name, text: `${d.name} si sente trascurato e chiede più attenzione dalla squadra.`, a: [
    { t: 'Sessioni extra al simulatore', note: `-${fmtM(0.8 * C.budgetScale)}, morale +8, Velocità +1`, fx: () => { addFinance(st, `Simulatore extra ${d.name}`, -0.8 * C.budgetScale); morale(d, 8); d.attrs.pace = Math.min(99, d.attrs.pace + 1); } },
    { t: 'Discorso motivazionale', note: 'Morale +4', fx: () => morale(d, 4) },
    { t: 'Deve guadagnarselo in pista', note: 'Morale -4, CdA +1', fx: () => { morale(d, -4); board(st, 1); } },
  ] }; },
  (st, t, C) => ({ title: 'Galleria del vento in affitto', from: 'Ufficio Infrastrutture', text: 'Un team di un’altra categoria vuole affittare la nostra galleria del vento per due settimane.', a: [
    { t: 'Affittiamola', note: `+${fmtM(2.5 * C.budgetScale)}, progetti R&D rallentati`, fx: () => { addFinance(st, 'Affitto galleria del vento', 2.5 * C.budgetScale); t.projects.forEach((p) => (p.racesLeft += 1)); } },
    { t: 'Ci serve per noi', note: 'Nessun effetto', fx: () => {} },
  ] }),
  (st, t, C) => ({ title: 'Giovane talento', from: 'Accademia', text: 'Un ragazzo dell’accademia ha battuto i tempi dei titolari al simulatore. Vuole un test.', a: [
    { t: 'Facciamolo provare', note: `-${fmtM(0.5 * C.budgetScale)}, +60 XP e nuovo talento sul mercato`, fx: () => { addFinance(st, 'Test giovane', -0.5 * C.budgetScale); gainXP(st, 60, 'Accademia'); addNews(st, 'Un giovane dell’accademia impressiona nei test!'); } },
    { t: 'Non è il momento', note: 'Nessun effetto', fx: () => {} },
  ] }),
];

export function maybePaddockEvent(st) {
  if (st.quick || st.pendingEvent || st.round >= st.calendar.length) return;
  if (!chance(0.38)) return;
  const t = playerTeam(st); const C = cat(st);
  for (const f of shuffle(EVENTS)) {
    const ev = f(st, t, C);
    if (ev) { st.pendingEvent = { title: ev.title, from: ev.from, text: ev.text, a: ev.a.map((x) => ({ t: x.t, note: x.note })), idx: EVENTS.indexOf(f) }; st._eventFx = ev.a.map((x) => x.fx); return; }
  }
}

// Resolve a pending event (fx closures are not serialized, so we rebuild them)
export function resolvePaddockEvent(st, choice) {
  const pe = st.pendingEvent; if (!pe) return;
  const t = playerTeam(st); const C = cat(st);
  const ev = EVENTS[pe.idx]?.(st, t, C);
  ev?.a[choice]?.fx();
  addMail(st, { from: pe.from, icon: 'info', type: 'info', subject: pe.title, body: `${pe.text}\n\nDecisione: ${pe.a[choice].t} (${pe.a[choice].note}).` });
  st.pendingEvent = null;
}
