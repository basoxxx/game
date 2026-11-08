// Title / attract screen: logo reveal over a circuit being traced, "press any key".
// It also provides the user gesture browsers require before audio can start.
// First-time players then get a short welcome with the recommended path.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { logoMark, trackSVG } from '../ui/art.js';
import { circuitPath } from '../ui/trackview.js';
import { TRACKS } from '../data/tracks.js';
import { listSaves } from '../engine/state.js';
import { sfx } from '../ui/audio.js';

const FLAG = 'apexdynasty_intro';
export function introSeen() { try { return !!localStorage.getItem(FLAG); } catch { return true; } }
// Shown at every launch for real players; automated browsers (tests) go straight to the menu
export function shouldShowIntro() {
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return true;
  if (q.has('nointro') || navigator.webdriver) return false;
  return true;
}

let stage = 0, keyH = null, padRaf = 0;
registerScreen({
  id: 'intro', full: true,
  render() {
    stage = 0;
    const list = TRACKS.formula;
    const tr = list[Math.floor(Math.random() * list.length)];
    let svg = '';
    try { svg = trackSVG(circuitPath(tr.cid), { w: 900, h: 620, glow: '#e5141b', color: '#fff', width: 3, start: false }); } catch {}
    return `<div class="intro-screen" data-stage="0">
      <div class="intro-bg"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="intro-track">${svg}</div>
      <div class="intro-slab"></div>
      <div class="intro-center">
        <div class="intro-logo">${logoMark(92)}<div class="intro-word"><span>Apex</span><span>Dynasty</span></div></div>
        <div class="intro-tag">Formula · Rally · Endurance · Scontro Totale</div>
        <div class="intro-press" data-a="intro-go" tabindex="0"><span class="ip-key">${icon('play')}</span><span>Premi un tasto per iniziare</span></div>
      </div>
      <div class="intro-welcome" aria-live="polite"></div>
      <div class="intro-foot"><span>v${__APP_VERSION__}</span><span>Gioco di fantasia · nomi e marchi sono parodie e non affiliati</span><span class="intro-trk">${tr.name}</span></div>
    </div>`;
  },
  mount() {
    const go = (e) => {
      if (stage !== 0) return;
      if (e?.type === 'keydown' && (e.key === 'F11' || e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey)) return;
      e?.preventDefault?.();
      next();
    };
    keyH = go;
    window.addEventListener('keydown', go);
    // gamepad: any button continues
    const pad = () => { padRaf = requestAnimationFrame(pad); for (const g of navigator.getGamepads?.() || []) if (g?.buttons?.some((b) => b.pressed) && stage === 0) next(); };
    padRaf = requestAnimationFrame(pad);
    document.querySelector('.intro-screen')?.addEventListener('pointerdown', (e) => { if (!e.target.closest('.intro-welcome')) go(e); });
    requestAnimationFrame(() => document.querySelector('.intro-press')?.focus({ preventScroll: true }));
  },
  unmount() { window.removeEventListener('keydown', keyH); cancelAnimationFrame(padRaf); },
  actions: {
    'intro-go'() { if (stage === 0) next(); },
    'intro-career'() { finish('newgame'); },
    'intro-howto'() { finish('howto', { back: 'menu' }); },
    'intro-menu'() { finish('menu'); },
  },
});

function finish(to, params) { try { localStorage.setItem(FLAG, '1'); } catch {} App.go(to, params); }

function next() {
  stage = 1;
  sfx.sting();
  const root = document.querySelector('.intro-screen');
  if (!root) return;
  root.dataset.stage = '1';
  const fresh = !introSeen() && !listSaves().some((s) => !s.empty);
  if (!fresh) { setTimeout(() => App.cur === 'intro' && finish('menu'), 650); return; }
  // first launch: a short welcome with the recommended route
  const w = root.querySelector('.intro-welcome');
  w.innerHTML = `<div class="iw-k">Benvenuto, Team Principal</div>
    <h2>Da dove vuoi partire?</h2>
    <div class="iw-opts">
      <button class="iw-opt rec" data-a="intro-career">${icon('flag')}<b>Inizia una carriera</b><span>Consigliato: una guida passo passo ti accompagna nella prima stagione.</span><em>Consigliato</em></button>
      <button class="iw-opt" data-a="intro-howto">${icon('book')}<b>Come si gioca</b><span>Le basi del gestionale e della gara in pochi minuti.</span></button>
      <button class="iw-opt" data-a="intro-menu">${icon('home')}<b>Menu principale</b><span>Gara rapida, Scontro Totale, sfide e impostazioni.</span></button>
    </div>`;
  setTimeout(() => { root.dataset.stage = '2'; w.querySelector('.iw-opt')?.focus({ preventScroll: true }); }, 700);
}
