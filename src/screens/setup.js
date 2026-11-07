// Car setup model shared by the practice screens: parameters, ideal setup, feedback
import { mulberry32, clamp, rand } from '../engine/rng.js';
import { partSensitivity, trackStats } from '../engine/trackphys.js';
import { hasPerk } from '../engine/progress.js';

export const SETUP_PARAMS = [
  { id: 'aero', info: 'Più ala = più grip in curva ma meno velocità sul dritto.', name: 'Carico Aerodinamico', short: 'Ala', lo: 'Poco carico: la macchina scivola in curva', hi: 'Troppo carico: lenti sul dritto' },
  { id: 'susp', info: 'Rigida = reattiva, morbida = sfrutta i cordoli.', name: 'Rigidezza Sospensioni', short: 'Sospensioni', lo: 'Troppo morbida: rollio eccessivo', hi: 'Troppo rigida: salta sui cordoli' },
  { id: 'height', info: 'Bassa = più effetto suolo, ma rischio di toccare.', name: 'Altezza da Terra', short: 'Altezza', lo: 'Troppo bassa: tocca il fondo', hi: 'Troppo alta: perdiamo carico' },
  { id: 'gear', info: 'Lunghi per i rettilinei, corti per la trazione.', name: 'Rapporti Cambio', short: 'Rapporti', lo: 'Rapporti corti: limitatore in rettilineo', hi: 'Rapporti lunghi: poca spinta in uscita' },
  { id: 'brake', info: 'Ripartizione della frenata tra anteriore e posteriore.', name: 'Bilanciamento Freni', short: 'Freni', lo: 'Troppo dietro: il posteriore si scompone', hi: 'Troppo avanti: blocca l’anteriore' },
];

export function trackSetupBase(st, tr) {
  if (st.category === 'rally') return null;
  const sens = partSensitivity(st.category, tr); const ts = trackStats(st.category, tr);
  const aeroShare = sens.aero / (sens.aero + sens.engine);
  return {
    aero: 15 + aeroShare * 85 * 1.15 - 10,
    gear: 25 + Math.max(0, Math.min(1, (ts.vmax - 310) / 40)) * 55,
    height: 30 + (tr.street || 0) * 35,
    susp: 60 - (tr.street || 0) * 25 + (sens.chassis > 0.17 ? 10 : 0),
    brake: 50,
  };
}
export function idealFor(st, key, trackSeed, tr) {
  const r = mulberry32((trackSeed * 31 + key.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 17 + st.season) >>> 0);
  const base = tr ? trackSetupBase(st, tr) : null;
  return Object.fromEntries(SETUP_PARAMS.map((p) => [p.id, Math.round(Math.max(8, Math.min(92, base ? base[p.id] + (r() - 0.5) * 26 : 15 + r() * 70)))]));
}
export function setupQuality(vals, ideal) {
  const diffs = SETUP_PARAMS.map((p) => Math.abs(vals[p.id] - ideal[p.id]));
  const m = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return clamp(1 - (m / 40) ** 0.9, 0, 1);
}
// Driver feedback after a run. More laps and a better engineer give a clearer picture.
export function setupFeedback(st, team, c, d, laps = 1) {
  const eng = st.staff[team.staff.engineer]?.rating || 65;
  let tol = 5 + (100 - eng) / 12 + (100 - d.attrs.exp) / 25 - (hasPerk(st, 'data') ? 2 : 0) - (team.facilities.simulator - 3) * 0.4;
  tol *= clamp(1.25 - laps * 0.07, 0.7, 1.25);
  tol = Math.max(2.5, tol);
  return Object.fromEntries(SETUP_PARAMS.map((p) => {
    const diff = c.vals[p.id] - c.ideal[p.id];
    const noisy = diff + rand(-tol * 0.4, tol * 0.4);
    const a = Math.abs(noisy);
    return [p.id, a < tol ? 'ok' : a < tol * 2.6 ? (noisy > 0 ? 'hi' : 'lo') : (noisy > 0 ? 'vhi' : 'vlo')];
  }));
}
export const fbTxt = (f) => f === 'ok' ? 'Perfetto' : f === 'hi' ? 'Un po’ alto' : f === 'lo' ? 'Un po’ basso' : f === 'vhi' ? 'Troppo alto' : 'Troppo basso';
