// Seasonal technical decisions: regulation interpretation (pre-season), mid-season upgrade
// package, and the "this year or next year" fork. Each one is a pending choice shown in the hub.
import { rand, pick, clamp, chance } from './rng.js';
import { cat, playerTeam, addFinance, addNews, addMail, fmtM, partRanking } from './season.js';

const bump = (t, id, v) => { if (t.car.parts[id] != null) t.car.parts[id] = clamp(+(t.car.parts[id] + v).toFixed(1), 30, 99.5); };
const nextBump = (t, id, v) => { t.nextYear ||= {}; t.nextYear[id] = +((t.nextYear[id] || 0) + v).toFixed(1); };
const perfParts = (C) => C.parts.filter((p) => p.id !== 'reliability');

function weakest(st, t) {
  const C = cat(st);
  return perfParts(C).map((p) => ({ p, r: partRanking(st, p.id).indexOf(t.id) })).sort((a, b) => b.r - a.r)[0].p;
}

const DEFS = {
  // ---- pre-season: regulation change hits everyone, the interpretation is yours ----
  regs: (st) => {
    const C = cat(st); const t = playerTeam(st);
    const P = perfParts(C)[(st.season * 7 + (st.seed || 3)) % perfParts(C).length];
    const what = { aero: 'il fondo e le ali', engine: 'la mappatura e il flusso di carburante', chassis: 'peso minimo e sospensioni', tyre: 'le coperture (nuove mescole)', suspension: 'la geometria delle sospensioni', gearbox: 'i rapporti del cambio', efficiency: 'il consumo massimo per stint' }[P.id] || P.name;
    return {
      title: `Nuovo regolamento ${st.season}: ${P.name}`, from: 'Federazione Internazionale', tag: 'Regolamento',
      text: `La Federazione ha riscritto le regole su ${what}. Tutte le squadre partono con -5 su ${P.name}. Il tuo ufficio tecnico deve decidere come interpretare il nuovo testo: chi trova la scappatoia giusta può dominare la stagione.`,
      setup: () => { for (const x of Object.values(st.teams)) bump(x, P.id, -5); for (const x of Object.values(st.teams)) if (!x.isPlayer) bump(x, P.id, rand(2, 6.5)); },
      a: [
        { t: 'Interpretazione aggressiva', note: `${P.name}: da +1 a +10 (incerto) · Affidabilità -3 · rischio indagine`, risk: true, fx: () => { const g = rand(1, 10); bump(t, P.id, g); bump(t, 'reliability', -3); if (g > 8 && chance(0.45)) { bump(t, P.id, -2.5); addNews(st, `La Federazione chiede chiarimenti a ${t.name} sulla soluzione ${P.name}: parziale modifica.`); } return `${P.name} +${g.toFixed(1)}`; } },
        { t: 'Interpretazione conservativa', note: `${P.name} +4 garantito`, fx: () => { bump(t, P.id, 4); return `${P.name} +4`; } },
        { t: 'Studiamo le soluzioni dei rivali', note: `-${fmtM(2 * C.budgetScale)} · ${P.name} +5 · +1 su un altro componente`, fx: () => { addFinance(st, 'Studio regolamento', -2 * C.budgetScale); bump(t, P.id, 5); const o = pick(perfParts(C).filter((x) => x.id !== P.id)); bump(t, o.id, 1); return `${P.name} +5, ${o.name} +1`; } },
      ],
    };
  },
  // ---- ~30%: mid-season upgrade package ----
  package: (st) => {
    const C = cat(st); const t = playerTeam(st); const pp = perfParts(C);
    const w = weakest(st, t); const s0 = pp[0], s1 = pp[1] || pp[0];
    const cost = +(2.4 * C.budgetScale).toFixed(1);
    return {
      title: 'Pacchetto di aggiornamento di metà stagione', from: 'Direttore Tecnico', tag: 'Sviluppo',
      text: `La fabbrica ha pronti tre pacchetti, ma il budget ne permette uno solo (${fmtM(cost)}). Il nostro punto debole oggi è ${w.name}. Scegli dove andare a cercare il tempo: ogni pacchetto ha un compromesso.`,
      a: [
        { t: `Pacchetto ${s0.name}`, note: `${s0.name} +4.5 · ${s1.name} -1 · ${fmtM(cost)}`, fx: () => { addFinance(st, `Pacchetto ${s0.name}`, -cost); bump(t, s0.id, 4.5); if (s1 !== s0) bump(t, s1.id, -1); return `${s0.name} +4.5`; } },
        { t: `Correggere il punto debole (${w.name})`, note: `${w.name} +3.5 · Affidabilità +1 · ${fmtM(cost)}`, fx: () => { addFinance(st, `Pacchetto ${w.name}`, -cost); bump(t, w.id, 3.5); bump(t, 'reliability', 1); return `${w.name} +3.5`; } },
        { t: 'Pacchetto affidabilità', note: `Affidabilità +7 · ${fmtM(cost * 0.6)}`, fx: () => { addFinance(st, 'Pacchetto affidabilità', -cost * 0.6); bump(t, 'reliability', 7); return 'Affidabilità +7'; } },
        { t: 'Nessun pacchetto: conserviamo il budget', note: 'Nessun guadagno · il CdA apprezza il risparmio', fx: () => { st.board.confidence = clamp(st.board.confidence + 2, 0, 100); return 'Budget conservato'; } },
      ],
    };
  },
  // ---- ~60%: present vs future ----
  focus: (st) => {
    const C = cat(st); const t = playerTeam(st); const pp = perfParts(C);
    const w = weakest(st, t);
    return {
      title: 'Il bivio: quest’anno o il prossimo?', from: 'Direttore Tecnico', tag: 'Strategia',
      text: `Siamo a metà stagione. La galleria del vento non può lavorare su tutto: possiamo spremere la vettura attuale per i punti di quest’anno, oppure spostare gli ingegneri sul progetto ${st.season + 1}, che vale molto di più nel lungo periodo.`,
      a: [
        { t: 'Tutto sulla stagione in corso', note: `${w.name} +3 subito · vettura ${st.season + 1}: -1.5 su ${pp[0].name} e ${pp[1]?.name || pp[0].name}`, fx: () => { bump(t, w.id, 3); nextBump(t, pp[0].id, -1.5); if (pp[1]) nextBump(t, pp[1].id, -1.5); return `${w.name} +3 ora`; } },
        { t: `Focus sulla vettura ${st.season + 1}`, note: `Vettura ${st.season + 1}: +3 su ${pp[0].name} e ${pp[1]?.name || pp[0].name} · progetti attuali più lenti`, fx: () => { nextBump(t, pp[0].id, 3); if (pp[1]) nextBump(t, pp[1].id, 3); t.projects.filter((p) => !p.next).forEach((p) => (p.racesLeft += 1)); return 'Focus sul futuro'; } },
        { t: 'Una via di mezzo', note: `${w.name} +1.2 ora · vettura ${st.season + 1}: +1.2 su ${pp[0].name}`, fx: () => { bump(t, w.id, 1.2); nextBump(t, pp[0].id, 1.2); return 'Equilibrio'; } },
      ],
    };
  },
};

function schedule(st) {
  const L = st.calendar.length;
  return [{ id: 'regs', at: 0 }, { id: 'package', at: Math.max(1, Math.round(L * 0.3)) }, { id: 'focus', at: Math.max(2, Math.round(L * 0.58)) }];
}

export function maybeTechDecision(st) {
  if (st.quick || st.pendingTech) return;
  st.techDone ||= {};
  const done = (st.techDone[st.season] ||= []);
  for (const s of schedule(st)) {
    if (st.round >= s.at && !done.includes(s.id) && st.round < st.calendar.length) {
      // regulation change only applies at the very start of the season
      if (s.id === 'regs' && st.round > 0) { done.push(s.id); continue; }
      const d = DEFS[s.id](st);
      d.setup?.();
      done.push(s.id);
      st.pendingTech = { id: s.id, title: d.title, from: d.from, tag: d.tag, text: d.text, a: d.a.map((x) => ({ t: x.t, note: x.note, risk: !!x.risk })) };
      return;
    }
  }
}

export function resolveTechDecision(st, i) {
  const pt = st.pendingTech; if (!pt) return null;
  const d = DEFS[pt.id](st);
  const out = d.a[i]?.fx() || '';
  (st.techLog ||= []).unshift({ id: pt.id, season: st.season, round: st.round, title: pt.title, choice: pt.a[i].t, out });
  st.techLog.length = Math.min(st.techLog.length, 24);
  addMail(st, { from: pt.from, icon: 'car', type: 'info', subject: pt.title, body: `${pt.text}\n\nDecisione: ${pt.a[i].t}. Risultato: ${out}.` });
  st.pendingTech = null;
  return out;
}
