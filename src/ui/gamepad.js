// Controller support for menus and management screens (Gamepad API)
//   D-pad / left stick  move focus spatially between interactive elements
//   A (Cross)           activate the focused element
//   B (Circle)          back: closes dialogs / panels, or presses the page's Back button (Escape)
//   X (Square)          Space (pause in race screens)
//   Y (Triangle)        open the controls overview
//   LB / RB             previous / next section of the management sidebar
//   Start               continue (weekend of racing) · Back/Select: notifications
//   Right stick         scroll the page
// While a driving game (Scontro Totale) is running the pad belongs to the game.
import { sfx } from './audio.js';

const FOCUSABLE = 'button:not([disabled]), [data-a]:not(.disabled), input:not([type=hidden]):not([disabled]), select:not([disabled]), a[href], [tabindex="0"]';
let App = null, raf = 0, prev = {}, held = {}, lastMove = 0;

// haptics: a short rumble on the first connected controller (no-op without one)
export function rumble(strong = 0.5, ms = 180, weak = strong) {
  try {
    if (document.documentElement.classList.contains('reduce-motion')) { strong *= 0.5; weak *= 0.5; }
    const gp = (navigator.getGamepads?.() || []).find(Boolean);
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
  } catch {}
}

export function initGamepad(app) {
  App = app;
  window.__apexPad = { moveFocus, candidates };
  window.addEventListener('gamepadconnected', (e) => {
    App.toast?.('Controller collegato', `${String(e.gamepad.id || 'Gamepad').replace(/\(.*\)/, '').trim().slice(0, 40)} · A seleziona, B indietro`, '');
    document.documentElement.classList.add('has-pad');
    if (!raf) raf = setInterval(poll, 33); // timer, not rAF: keeps working while a heavy 3D scene drops frames
  });
  window.addEventListener('gamepaddisconnected', () => {
    if (!(navigator.getGamepads?.() || []).some(Boolean)) document.documentElement.classList.remove('has-pad', 'pad-nav');
  });
  // the mouse takes over again: drop the controller focus ring
  window.addEventListener('mousemove', () => document.documentElement.classList.remove('pad-nav'), { passive: true });
}

function visible(el) {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none' && +cs.opacity > 0.05;
}
function scope() {
  return document.querySelector('.tour-card') || document.querySelector('.modal-wrap .modal') || document.querySelector('.notes-panel') || document.querySelector('.intro-screen') || document.getElementById('app');
}
function candidates() {
  const root = scope();
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[inert], .tip') && visible(el));
}
// Pick the nearest element in a direction, preferring alignment on the cross axis
export function moveFocus(dir) {
  const list = candidates();
  if (!list.length) return false;
  const cur = document.activeElement;
  if (!cur || !list.includes(cur)) { (list.find((e) => e.matches('.menu-item, .btn.primary')) || list[0]).focus({ preventScroll: false }); return true; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - ax, dy = y - ay;
    let main, cross;
    if (dir === 'up') { if (r.bottom > a.top + 4 && dy > -4) continue; main = a.top - r.bottom; cross = Math.max(0, Math.max(r.left - a.right, a.left - r.right)); }
    else if (dir === 'down') { if (r.top < a.bottom - 4 && dy < 4) continue; main = r.top - a.bottom; cross = Math.max(0, Math.max(r.left - a.right, a.left - r.right)); }
    else if (dir === 'left') { if (r.right > a.left + 4 && dx > -4) continue; main = a.left - r.right; cross = Math.max(0, Math.max(r.top - a.bottom, a.top - r.bottom)); }
    else { if (r.left < a.right - 4 && dx < 4) continue; main = r.left - a.right; cross = Math.max(0, Math.max(r.top - a.bottom, a.top - r.bottom)); }
    const score = Math.max(0, main) + cross * 3 + (dir === 'up' || dir === 'down' ? Math.abs(dx) * 0.08 : Math.abs(dy) * 0.08);
    if (score < bs) { bs = score; best = el; }
  }
  if (!best) return false;
  best.focus({ preventScroll: true });
  best.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  sfx.hover();
  return true;
}
function key(k, code = k) { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true })); }

function poll() {
  
  const pads = (navigator.getGamepads?.() || []).filter(Boolean);
  if (!pads.length) { clearInterval(raf); raf = 0; return; }
  
  if (document.hidden) return;
  // a running derby race reads the pad itself
  const driving = document.querySelector('.dz-root canvas') && !document.querySelector('.modal-wrap');
  const gp = pads[0];
  const b = (i) => !!gp.buttons[i]?.pressed;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, ry = gp.axes[3] || 0;
  const now = performance.now();
  const dirs = { up: b(12) || ay < -0.55, down: b(13) || ay > 0.55, left: b(14) || ax < -0.55, right: b(15) || ax > 0.55 };
  const press = (name, on) => { const was = prev[name]; prev[name] = on; return on && !was; };
  if (driving) { for (const k of ['a', 'b', 'x', 'y', 'lb', 'rb', 'start', 'sel', 'up', 'down', 'left', 'right']) prev[k] = true; return; }
  let used = false;
  for (const d of ['up', 'down', 'left', 'right']) {
    const on = dirs[d];
    if (press(d, on)) { held[d] = now + 380; used = moveFocus(d) || used; lastMove = now; }
    else if (on && now > held[d] && now - lastMove > 110) { lastMove = now; used = moveFocus(d) || used; }
  }
  if (Math.abs(ry) > 0.25) { const m = document.querySelector('.modal-wrap .modal') || document.querySelector('.main') || document.querySelector('.full-screen'); if (m) m.scrollTop += ry * 18; }
  const el = document.activeElement;
  if (press('a', b(0))) {
    used = true;
    if (el && el !== document.body && el.matches(FOCUSABLE)) { if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.focus(); else el.click(); }
    else moveFocus('down');
  }
  if (press('b', b(1))) {
    used = true;
    const np = document.querySelector('.notes-panel');
    if (np) np.remove(); else { key('Escape'); sfx.back(); }
  }
  if (press('x', b(2))) { used = true; key(' ', 'Space'); }
  if (press('y', b(3))) { used = true; if (!document.querySelector('.modal-wrap')) App.shortcuts(); }
  if (press('start', b(9))) { used = true; const c = document.querySelector('.continue-btn, .intro-screen [data-a]'); if (c && !document.querySelector('.modal-wrap')) c.click(); }
  if (press('sel', b(8))) { used = true; if (document.querySelector('.tb-notes')) App.openNotes(); }
  const lb = press('lb', b(4)), rb = press('rb', b(5));
  if (lb || rb) {
    used = true;
    const navs = [...document.querySelectorAll('.sidebar .nav[data-to]')];
    const i = navs.findIndex((n) => n.classList.contains('active'));
    const tabs = [...(document.querySelector('.modal-wrap [role="tablist"]') || document.querySelector('#app [role="tablist"]'))?.querySelectorAll('[role="tab"]') || []];
    if (tabs.length) {
      // pages with tabs (Impostazioni…): bumpers switch tab
      const k = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      tabs[(k + (rb ? 1 : -1) + tabs.length) % tabs.length].click();
    } else if (navs.length) { const n = navs[(i + (rb ? 1 : -1) + navs.length) % navs.length]; n.click(); requestAnimationFrame(() => document.querySelector('.sidebar .nav.active')?.focus({ preventScroll: true })); }
  }
  if (used) document.documentElement.classList.add('pad-nav');
}
