// Baso Hub entry: Minigolf Baso (light: metadata, a store read, lazy screens)
import { mgLoad } from '../../minigolf/store.js';

const prog = () => { const p = mgLoad(); return { p, done: Object.values(p.courses).filter((c) => c?.done).length, holes: Object.keys(p.best).length }; };

export default {
  id: 'minigolf', order: 40, category: 'Party', section: 'Minigolf', title: 'Minigolf Baso', genre: 'Party · minigolf 3D', accent: '#3fbf4a',
  desc: 'Minigolf con fisica vera: mulini, giri della morte, lava, teletrasporti e gravità bassa. 45 buche, fino a 4 giocatori sullo stesso schermo ed editor di percorsi.',
  stat: () => { const { p, done, holes } = prog(); return holes ? `${done}/5 percorsi · ${holes}/45 buche · ${p.coins} monete` : '5 percorsi, 45 buche, editor e buca del giorno'; },
  cover: 'covers/minigolf.webp',
  play: (App) => App.go('minigolf', { from: 'launcher' }),
  modes: [
    { id: 'gioca', icon: 'play', name: 'Gioca', desc: 'Riprendi dal prossimo percorso da completare.', go: (App) => App.go('minigolf', { from: 'launcher', quick: 1 }), tag: 'Via!' },
    { id: 'percorsi', icon: 'map', name: 'Percorsi', desc: 'Giardino, Spiaggia, Castello, Luna Park e Spazio: 9 buche ciascuno.', go: (App) => App.go('minigolf', { from: 'launcher', tab: 'percorsi' }) },
    { id: 'multi', icon: 'users', name: 'Multigiocatore', desc: 'Da 2 a 4 giocatori a turno sullo stesso schermo.', go: (App) => App.go('minigolf', { from: 'launcher', tab: 'multi' }) },
    { id: 'daily', icon: 'calendar', name: 'Buca del giorno', desc: () => { const k = new Date(); const key = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`; const d = mgLoad().daily[key]; return d?.done ? `Fatta oggi in ${d.best} colpi: prova a migliorare.` : 'Una buca nuova ogni giorno, monete bonus.'; }, go: (App) => App.go('minigolf', { from: 'launcher', tab: 'daily' }) },
    { id: 'editor', icon: 'wrench', name: 'Editor', desc: 'Crea le tue buche, provale e condividile con un codice.', go: (App) => App.go('minigolf-editor', { from: 'launcher' }) },
  ],
  screens: { minigolf: () => import('../../screens/minigolf.js'), 'minigolf-editor': () => import('../../screens/minigolf-editor.js') },
  ownGL: ['minigolf'],
  moods: { minigolf: 'voragine', 'minigolf-editor': 'voragine' },
  deepLink: 'minigolf',
};
