// Orda extra modes — light entries for the Orda menu's modes registry and the Baso Hub tiles.
// No three.js and no level generation here: descriptions only read the saved progress.
import { dailyInfo, liveStreak, omLoad, achState, ACHIEVEMENTS } from './modes.js';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
export const diffName = (d) => (d < 0.4 ? 'Tranquilla' : d < 0.55 ? 'Media' : d < 0.7 ? 'Tosta' : d < 0.8 ? 'Dura' : 'Durissima');
export function dailyStatus(s = omLoad()) { const info = dailyInfo(); return { info, rec: s.daily[info.key], streak: liveStreak(s) }; }
export const claimable = (s = omLoad()) => achState(s).filter((a) => a.done && !a.claimed).length;

// go(App, from): opens the modes screen on the right tab
const open = (tab) => (App, from = 'orda') => App.go('orda-modes', { from, tab });
export const ORDA_EXTRA_MODES = [
  {
    id: 'sfida', icon: 'calendar', name: 'Sfida del giorno', go: open('sfida'),
    desc: () => { const { info, rec, streak } = dailyStatus(); return rec?.official ? `#${info.num} giocata${rec.won ? ` · ${'★'.repeat(rec.stars || 1)}` : ' · base in piedi'}${streak ? ` · serie ${streak}` : ''}` : `#${info.num} · ${diffName(info.difficulty)} · stesso livello per tutti${streak ? ` · serie ${streak}` : ''}`; },
    tag: () => (dailyStatus().rec?.official ? '' : 'Nuova'),
  },
  {
    id: 'infinita', icon: 'hourglass', name: 'Infinita', go: open('infinita'),
    desc: () => { const s = omLoad(); return s.run ? `Corsa in pausa: ondata ${s.run.wave}` : s.endless[0] ? `Record ${fmt(s.endless[0].score)} · ondata ${s.bestWave}` : 'Ondate senza fine, 1 potenziamento su 3'; },
  },
  {
    id: 'missioni', icon: 'medal', name: 'Missioni', go: open('missioni'),
    desc: () => { const s = omLoad(), n = claimable(s); return n ? `${n} ricompens${n === 1 ? 'a' : 'e'} da riscuotere` : `${Object.keys(s.claimed).length}/${ACHIEVEMENTS.length} completate`; },
    tag: () => (claimable() ? 'Premi!' : ''),
  },
];
