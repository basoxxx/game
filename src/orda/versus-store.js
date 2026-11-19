// Orda · 2 giocatori — preferences and rewards, kept inside the Orda save under ext.versus (the core
// store keeps unknown ext fields untouched). Coins go to the shared Orda wallet: local matches pay a
// little, so the mode is a fun extra and not a farm.
import { ordaLoad, ordaSave } from './store.js';
import { VS_ARENAS, VS_CHAMP_IDS } from './versus-data.js';

const DEF = { variant: 'versus', arena: VS_ARENAS[0].id, champs: ['colosso', 'grillo'], hc: [0, 0], rounds: 3, time: 90, ctime: 150, diff: 'normale', flat: true, played: 0, won: [0, 0], coop: 0, today: '', paid: 0 };
const DAILY_CAP = 120; // coins per day from 2-player matches

export function vsPrefs() {
  const e = ordaLoad().ext?.versus || {};
  const P = { ...DEF, ...e };
  P.champs = [0, 1].map((i) => (VS_CHAMP_IDS.includes(e.champs?.[i]) ? e.champs[i] : DEF.champs[i]));
  P.hc = [0, 1].map((i) => Math.max(0, Math.min(3, +(e.hc?.[i] || 0))));
  P.won = [0, 1].map((i) => +(e.won?.[i] || 0));
  if (!VS_ARENAS.some((a) => a.id === P.arena)) P.arena = DEF.arena;
  if (![1, 3, 5].includes(P.rounds)) P.rounds = 3;
  return P;
}
export function vsSavePrefs(P) {
  const o = ordaLoad(); o.ext = { ...(o.ext || {}), versus: { ...P } }; ordaSave(o); return P;
}
// match end: stats and coins (returns the coins paid)
export function vsReward(r) {
  const o = ordaLoad(), P = { ...DEF, ...(o.ext?.versus || {}) };
  P.played = (P.played || 0) + 1;
  if (r.variant === 'coop') { if (r.outcome === 'win') P.coop = (P.coop || 0) + 1; }
  else if (r.winner >= 0) { P.won = [...(P.won || [0, 0])]; P.won[r.winner]++; }
  const day = new Date().toISOString().slice(0, 10);
  if (P.today !== day) { P.today = day; P.paid = 0; }
  let c = r.variant === 'coop' ? (r.outcome === 'win' ? 30 : 8) : 12 + 4 * r.rounds.length;
  c = Math.max(0, Math.min(c, DAILY_CAP - (P.paid || 0)));
  P.paid = (P.paid || 0) + c;
  o.coins = (o.coins || 0) + c;
  o.ext = { ...(o.ext || {}), versus: P };
  ordaSave(o);
  return c;
}
