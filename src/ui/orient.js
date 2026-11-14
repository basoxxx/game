// Device rotation helpers. Nothing here locks the orientation: every screen works in portrait and
// landscape, and these only smooth the switch.
//  · iOS reports the new size a beat late after a rotation: one extra 'resize' once it settled, so
//    the canvases (ResizeObserver / resize listeners) and the HUDs measure the final size
//  · html.portrait / html.landscape classes for the few rules that need them in JS-built HUDs
//  · a small, dismissible hint on phones held upright during a live 3D race ("ruota il dispositivo")
const ROT_KEY = 'apexdynasty_rot_hint';
let hintOff = false;
const shown = new WeakSet(); // race views that already had their hint
try { hintOff = localStorage.getItem(ROT_KEY) === '1'; } catch {}

function mark() {
  const p = innerHeight >= innerWidth, de = document.documentElement;
  de.classList.toggle('portrait', p); de.classList.toggle('landscape', !p);
}
function settle() {
  mark();
  // the layout viewport can lag the rotation (iOS Safari, Android Chrome with the toolbar): re-measure twice
  for (const t of [120, 420]) setTimeout(() => { mark(); window.dispatchEvent(new Event('resize')); }, t);
}

const phone = () => Math.min(screen.width || innerWidth, screen.height || innerHeight) < 600 && matchMedia('(pointer: coarse)').matches;
function hint() {
  const view = document.querySelector('.race-view.mode3d');
  const old = document.querySelector('.rot-hint');
  const want = !hintOff && view && phone() && innerHeight > innerWidth;
  if (!want) { old?.remove(); return; }
  if (old && old.parentElement === view) return;
  old?.remove();
  if (shown.has(view)) return; shown.add(view);
  const el = document.createElement('div'); el.className = 'rot-hint'; el.setAttribute('role', 'note');
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="7" y="2" width="10" height="17" rx="2"/><path d="M3 14a9 9 0 0 0 9 8M21 10a9 9 0 0 0-9-8"/></svg><span>Ruota il dispositivo per una visuale più ampia</span><button type="button" aria-label="Chiudi suggerimento">×</button>';
  el.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); hintOff = true; try { localStorage.setItem(ROT_KEY, '1'); } catch {} el.remove(); });
  setTimeout(() => el.remove(), 9000); // a nudge, not a banner: gone by itself after a few seconds
  view.appendChild(el);
}

export function initOrientation() {
  mark();
  window.addEventListener('orientationchange', settle);
  screen.orientation?.addEventListener?.('change', settle);
  window.addEventListener('resize', () => { mark(); hint(); });
  window.visualViewport?.addEventListener('resize', mark);
  // the hint shows once per race view (checked lightly; the race screen is built by its own module)
  let lastView = null;
  setInterval(() => { const v = document.querySelector('.race-view.mode3d'); if (v !== lastView) { lastView = v; if (v) hint(); } }, 1500);
}
