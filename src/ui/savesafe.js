// Save safety net:
//  - a backup copy of a slot is kept before a migration rewrites an older save
//  - full localStorage (quota) is handled: caches are freed and the write is retried
//  - every save write pulses the "Salvato" indicator
//  - rescue copy of the live game when the error boundary trips
import { SAVE_PREFIX, loadGame, S } from '../engine/state.js';

export const BACKUP_PREFIX = 'apexdynasty_backup_';
export const RESCUE_KEY = 'apexdynasty_rescue';
const ls = () => { try { return window.localStorage; } catch { return null; } };

const versionOf = (raw) => { try { return JSON.parse(raw)?.version ?? 0; } catch { return -1; } };

// load + migrate; when the migration changed the save version, the original text is kept as a backup.
// Async: the migration needs the engine, which is code-split off the first paint. The engine is fetched
// before the slot is read, so loading and migrating still happen in one go.
export async function loadWithBackup(slot) {
  const st = ls(); const raw = st?.getItem(SAVE_PREFIX + slot);
  if (!raw) return null;
  const { migrateSave } = await import('../engine/migrate.js');
  const s = loadGame(slot); if (!s) return null;
  const v0 = versionOf(raw);
  try { migrateSave(s); } catch (e) { console.warn('migrate', e); }
  if (s.version !== v0) { try { st.setItem(BACKUP_PREFIX + slot, raw); } catch {} }
  return s;
}
export function hasBackup(slot) { return !!ls()?.getItem(BACKUP_PREFIX + slot); }
export function backupInfo(slot) {
  try { const b = JSON.parse(ls()?.getItem(BACKUP_PREFIX + slot) || 'null'); return b ? { season: b.season, round: b.round, version: b.version ?? 0, savedAt: b.savedAt } : null; } catch { return null; }
}
export function restoreBackup(slot) {
  const st = ls(); const raw = st?.getItem(BACKUP_PREFIX + slot); if (!raw) return false;
  try { st.setItem(SAVE_PREFIX + slot, raw); return true; } catch { return false; }
}
// copy of the live game, written when something crashes (never over a real slot)
export function rescueSnapshot() {
  const g = S(); if (!g) return false;
  try { ls()?.setItem(RESCUE_KEY, JSON.stringify({ at: Date.now(), state: g })); return true; } catch { return false; }
}

// bytes used by the game in localStorage (UTF-16: 2 bytes a char)
export function storageUsage() {
  const st = ls(); if (!st) return { used: 0, items: [] };
  const items = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (!k?.startsWith('apexdynasty')) continue; items.push([k, (st.getItem(k)?.length || 0) * 2]); }
  return { used: items.reduce((a, b) => a + b[1], 0), items: items.sort((a, b) => b[1] - a[1]) };
}

// things that can go before a save is lost: caches, then old backups, then the rescue copy
function freeSpace(st, keep) {
  const keys = []; for (let i = 0; i < st.length; i++) keys.push(st.key(i));
  const drop = [
    ...keys.filter((k) => /thumb|cache/i.test(k) && k !== keep),
    ...keys.filter((k) => k.startsWith(BACKUP_PREFIX) && k !== keep),
    ...keys.filter((k) => k === RESCUE_KEY && k !== keep),
  ];
  for (const k of drop) { try { st.removeItem(k); } catch {} }
  return drop.length;
}
const isQuota = (e) => e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

let onSave = () => {}, onFull = () => {};
export function installSaveGuard({ saved, full } = {}) {
  if (saved) onSave = saved; if (full) onFull = full;
  if (typeof Storage === 'undefined' || Storage.prototype.__apexGuard) return;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    try { orig.call(this, k, v); } catch (e) {
      if (!isQuota(e)) throw e;
      const n = freeSpace(this, k);
      try { orig.call(this, k, v); } catch (e2) { onFull(k); throw e2; }
      if (n) console.warn(`storage full: freed ${n} cached entries`);
    }
    if (typeof k === 'string' && k.startsWith(SAVE_PREFIX)) onSave(k);
  };
  Storage.prototype.__apexGuard = true;
}
