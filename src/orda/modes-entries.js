// Orda extra modes — light pieces for the Orda menu (modes registry entries, the "Missioni" tab and
// its claim action) and the Baso Hub tiles. No three.js and no level generation here: descriptions
// only read the saved progress.
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { dailyInfo, liveStreak, omLoad, omSave, achState, ACHIEVEMENTS } from './modes.js';
import { wallet } from './modes-bridge.js';
import './modes.css';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
export const diffName = (d) => (d < 0.4 ? 'Tranquilla' : d < 0.55 ? 'Media' : d < 0.7 ? 'Tosta' : d < 0.8 ? 'Dura' : 'Durissima');
export function dailyStatus(s = omLoad()) { const info = dailyInfo(); return { info, rec: s.daily[info.key], streak: liveStreak(s) }; }
export const claimable = (s = omLoad()) => achState(s).filter((a) => a.done && !a.claimed).length;

// ---- missions panel (the modes screen's tab, and a compact version on the Orda menu)
export function missionsPanel(s = omLoad(), { compact = false } = {}) {
  const list = achState(s).sort((a, b) => (b.done && !b.claimed) - (a.done && !a.claimed) || a.claimed - b.claimed || b.pct - a.pct);
  const shown = compact ? list.slice(0, 6) : list;
  const got = list.filter((a) => a.claimed).length;
  return `<section class="om-card om-miss ${compact ? 'compact' : ''}"><div class="om-miss-h"><h3>Missioni Orda</h3><span>${got}/${ACHIEVEMENTS.length} completate</span>${compact ? `<button class="btn ghost sm" data-a="om-open" data-tab="missioni">Tutte ${icon('right')}</button>` : ''}</div>
    <ul>${shown.map((a) => `<li class="${a.claimed ? 'claimed' : a.done ? 'ready' : ''}">${icon(a.icon)}<div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>${a.goal > 1 && !a.done ? `<div class="om-bar"><i style="width:${(a.pct * 100).toFixed(1)}%"></i></div><small>${fmt(a.have)} / ${fmt(a.goal)}</small>` : ''}</div>
      ${a.claimed ? `<em class="om-ok">${icon('check')}</em>` : a.done ? `<button class="btn primary sm" data-a="om-claim" data-id="${a.id}">${icon('coin')} +${a.coins}</button>` : `<em>${icon('coin')} ${a.coins}</em>`}</li>`).join('')}</ul></section>`;
}
// claim a finished mission's coins; returns the mission or null
export function claimMission(id) {
  const s = omLoad(), a = achState(s).find((x) => x.id === id);
  if (!a?.done || a.claimed) return null;
  s.claimed[a.id] = Date.now(); s.coinsEarned += a.coins; omSave(s); wallet.add(a.coins);
  return a;
}

// ---- entries: go(App, from) opens the modes screen on the right tab
const open = (tab) => (App, from = 'orda') => App.go('orda-modes', { from, tab });
export const ORDA_EXTRA_MODES = [
  {
    id: 'sfida', icon: 'calendar', name: 'Sfida del giorno', go: open('sfida'),
    desc: () => { const { info, rec, streak } = dailyStatus(); return rec?.official ? `#${info.num} giocata${rec.won ? ` · ${'★'.repeat(rec.stars || 1)}` : ' · base in piedi'}${streak ? ` · serie ${streak}` : ''}` : `#${info.num} · ${diffName(info.difficulty)} · stesso livello per tutti${streak ? ` · serie ${streak}` : ''}`; },
    tag: () => (dailyStatus().rec?.official ? '' : 'Nuova'),
  },
  {
    id: 'infinita', icon: 'hourglass', name: 'Infinita', go: open('infinita'),
    desc: () => { const s = omLoad(); return s.run ? `Corsa in pausa: ondata ${s.run.wave}${s.run.offer?.length ? ' superata' : ''}` : s.endless[0] ? `Record ${fmt(s.endless[0].score)} · ondata ${s.bestWave}` : 'Ondate senza fine, 1 potenziamento su 3'; },
  },
  {
    id: 'missioni', icon: 'medal', name: 'Missioni', go: open('missioni'),
    desc: () => { const s = omLoad(), n = claimable(s); return n ? `${n} ricompens${n === 1 ? 'a' : 'e'} da riscuotere` : `${Object.keys(s.claimed).length}/${ACHIEVEMENTS.length} completate`; },
    tag: () => (claimable() ? 'Premi!' : ''),
  },
];

// Hook everything into the Orda menu (src/screens/orda.js calls this with its registries)
export function registerOrdaModes({ App, addOrdaMode, addOrdaTab, actions, refresh }) {
  for (const m of ORDA_EXTRA_MODES) {
    addOrdaMode?.({ id: m.id, name: m.name, icon: m.icon, get tag() { return m.tag?.() || ''; }, desc: () => esc(m.desc()), go: () => m.go(App, 'orda') });
  }
  addOrdaTab?.({ id: 'missioni', name: 'Missioni', icon: 'medal', render: () => `<div class="om-in-orda">${missionsPanel(omLoad())}</div>` });
  if (actions) {
    actions['om-claim'] = (el) => {
      const a = claimMission(el.dataset.id); if (!a) return;
      App.toast(`Missione: ${a.name}`, `+${a.coins} monete`, 'good');
      (refresh || (() => App.refresh()))();
    };
    actions['om-open'] = (el) => App.go('orda-modes', { from: 'orda', tab: el.dataset.tab || 'sfida' });
  }
}

// tiles for the Orda entry of the Baso Hub (src/screens/launcher.js GAMES)
export function launcherModes(App) {
  return ORDA_EXTRA_MODES.filter((m) => m.id !== 'missioni').map((m) => ({ id: m.id, icon: m.icon, name: m.name, desc: () => esc(m.desc()), get tag() { return m.tag?.() || ''; }, go: () => m.go(App, 'launcher') }));
}
