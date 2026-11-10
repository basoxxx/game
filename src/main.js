import './styles/main.css';
import { App, lazyScreens, preloadScreens } from './app.js';
// first paint needs only the shell + the main menu (and the intro on a first launch)
import './screens/menu.js';
import { shouldShowIntro } from './screens/intro.js';
import * as Audio from './ui/audio.js';
import { S, saveGame } from './engine/state.js';
import { ensureQuality } from './ui/quality.js';
import { loadStage } from './ui/stage3d.js';
import { gfxTier } from './ui/quality.js';
const audioDebug = Audio.audioDebug;

// Everything else is code-split and arrives on demand (and on idle, right after the menu is up).
// Screens that import each other share a loader. A screen id that is not listed here and not
// registered eagerly makes the router load every group before giving up.
const career = () => Promise.all([import('./screens/hub.js'), import('./screens/info.js'), import('./screens/car.js'), import('./screens/team.js'), import('./screens/results.js'), import('./screens/seasonend.js')]);
lazyScreens({
  newgame: () => import('./screens/newgame.js'),
  settings: () => import('./screens/settings.js'),
  howto: () => import('./screens/howto.js'),
  quickrace: () => import('./screens/quickrace.js'),
  challenges: () => import('./screens/challenges.js'),
  ...Object.fromEntries(['mode-champ', 'mode-champ-new', 'mode-tp', 'mode-daily', 'mode-debrief'].map((id) => [id, () => import('./screens/challenges.js')])),
  derby: () => import('./screens/derby.js'),
  weekend: () => import('./screens/weekend.js'),
  rally: () => import('./screens/rallyweekend.js'),
  ...Object.fromEntries(['hub', 'inbox', 'standings', 'calendar', 'career', 'halloffame', 'car', 'drivers', 'market', 'staff', 'finance', 'paddock', 'results', 'seasonend'].map((id) => [id, career])),
});

App.init();
App.go(shouldShowIntro() ? 'intro' : 'menu');
window.addEventListener('beforeunload', () => { if (S()) saveGame(); });
window.__apex = { App, S, audio: audioDebug, sound: Audio, perf: { boot: performance.now() } };

// Idle warm-up: quality probe (first run only), then the screen chunks in the order a player meets them
const idle = (fn, t = 1200) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: t }) : setTimeout(fn, 200));
idle(() => {
  ensureQuality().then(() => {
    window.__apex.perf.quality = performance.now();
    preloadScreens(['newgame', 'hub', 'settings', 'howto', 'quickrace', 'challenges', 'weekend', 'rally'])
      .then(() => { window.__apex.perf.preloaded = performance.now(); if (gfxTier() !== 'low') loadStage().catch(() => {}); })
      .then(() => import('./devtools.js')).then((m) => m.install(window.__apex)).catch((e) => console.warn('preload', e));
  });
});
