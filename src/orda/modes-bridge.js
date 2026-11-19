// Orda modes ↔ Orda core store: coins go to the shared Orda wallet, the loadout (upgrades, champion,
// skins) is read from it. Kept apart so modes.js stays storage-agnostic.
import { ordaLoad, ordaSave } from './store.js';

export const wallet = {
  coins() { return ordaLoad().coins || 0; },
  add(n) { n = Math.round(n || 0); if (!n) return; const p = ordaLoad(); p.coins = (p.coins || 0) + n; ordaSave(p); },
  profile() { const p = ordaLoad(); return { up: { ...p.up }, champ: p.champ, champLvl: p.clv?.[p.champ] || 0, skin: p.skin, cannon: p.cannon, autofire: !!p.opt?.autofire, shake: p.opt?.shake !== false, numbers: p.opt?.numbers !== false }; },
};
