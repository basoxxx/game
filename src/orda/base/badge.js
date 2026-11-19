// Orda · Base e razzie — a one-line summary for the Baso Hub and the Orda menu. No imports on purpose:
// the launcher is part of the first paint and must not pull the base code in.
const KEY = 'sala_orda_base_v1';
export function baseSummary() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d?.layout) return { started: false, unread: 0, hq: 1 };
    const unread = (d.defense?.reports || []).filter((r) => !r.seen).length;
    const hq = (d.layout.b || []).find((b) => b.t === 'hq')?.l || 1;
    return { started: true, unread, hq, raids: d.stats?.raids || 0 };
  } catch { return { started: false, unread: 0, hq: 1 }; }
}
export function baseDesc() {
  const s = baseSummary();
  if (!s.started) return 'Costruisci la tua fortezza e razzia le basi rivali per mattoni e monete.';
  if (s.unread) return `${s.unread === 1 ? 'La tua base è stata attaccata' : `${s.unread} attacchi alla tua base`}: leggi il rapporto e prenditi la vendetta!`;
  return `QG livello ${s.hq} · ${s.raids} razzie · torri, porte trappola e caserme rosse.`;
}
