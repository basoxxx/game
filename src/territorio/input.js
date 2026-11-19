// Territorio — input for 1 to 4 players on one device. The camera never turns, so every control is
// a heading on the screen (x right, y down) that maps straight onto the board.
//   Keyboard: W A S D · frecce · I J K L · tastierino 8 4 5 6 (diagonals by holding two keys).
//             With one player, WASD and the arrows both drive. Esc / P pause.
//   Mouse:    (one player) the vehicle heads for the pointer, as soon as the mouse moves.
//   Touch:    a floating stick: press anywhere (in your zone with more players) and drag/swipe; the
//             heading stays when you lift the finger. Every finger is tracked by pointerId.
//   Gamepads: left stick or d-pad; Start pauses. With one player any pad drives.
// The game asks each frame: heading(slot) → angle (radians) or null (keep going straight), and
// supplies the zones (screen rects of each player's view) through setZones().
const KEYS = {
  wasd: { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] },
  frecce: { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] },
  ijkl: { KeyI: [0, -1], KeyK: [0, 1], KeyJ: [-1, 0], KeyL: [1, 0] },
  numpad: { Numpad8: [0, -1], Numpad5: [0, 1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0] },
};
const ALL = new Set(Object.values(KEYS).flatMap((k) => Object.keys(k)));

export class TerrInput {
  // slots: ['all'] for one player, or a control id per player ('wasd', 'pad2', 'touch', ...)
  constructor(el, { slots = ['all'], onPause } = {}) {
    this.el = el; this.slots = slots; this.onPause = onPause;
    this.keys = new Set(); this.touch = new Map(); this.stick = slots.map(() => null);
    this.zones = [{ x: 0, y: 0, w: innerWidth, h: innerHeight }];
    this.mouse = null; this.padStart = false;
    this.onKD = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.onPause?.(); return; }
      if (!ALL.has(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      this.keys.add(e.code); this.mouse = null;
    };
    this.onKU = (e) => this.keys.delete(e.code);
    this.onBlur = () => { this.keys.clear(); this.touch.clear(); this.stick = this.stick.map(() => null); };
    window.addEventListener('keydown', this.onKD, true);
    window.addEventListener('keyup', this.onKU, true);
    window.addEventListener('blur', this.onBlur);
    this.onPD = (e) => {
      if (e.target.closest?.('button, [data-a]')) return;
      if (e.pointerType === 'mouse') { if (this.slots.length === 1) this.mouse = { x: e.clientX, y: e.clientY }; return; }
      const s = this.slotAt(e.clientX, e.clientY);
      if (s < 0 || [...this.touch.values()].some((t) => t.slot === s)) return;
      e.preventDefault();
      this.touch.set(e.pointerId, { slot: s, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
      try { el.setPointerCapture?.(e.pointerId); } catch {}
      this.onStick?.();
    };
    this.onPM = (e) => {
      if (e.pointerType === 'mouse') { if (this.slots.length === 1 && (this.mouse || e.movementX || e.movementY)) this.mouse = { x: e.clientX, y: e.clientY }; return; }
      const t = this.touch.get(e.pointerId); if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      // a floating stick: drag far and the base follows the finger
      const dx = t.x - t.ox, dy = t.y - t.oy, d = Math.hypot(dx, dy), m = 60;
      if (d > m) { t.ox += dx * (1 - m / d); t.oy += dy * (1 - m / d); }
      if (d > 9) this.stick[t.slot] = Math.atan2(dy, dx);
      this.onStick?.();
    };
    this.onPU = (e) => { if (this.touch.delete(e.pointerId)) this.onStick?.(); };
    this.onLeave = (e) => { if (e.pointerType === 'mouse') this.mouse = null; };
    el.addEventListener('pointerdown', this.onPD);
    el.addEventListener('pointermove', this.onPM);
    el.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('pointerup', this.onPU);
    window.addEventListener('pointercancel', this.onPU);
  }
  setZones(z) { this.zones = z; }
  slotAt(x, y) {
    const r = this.el.getBoundingClientRect(), px = x - r.left, py = y - r.top;
    if (this.slots.length === 1) return 0;
    for (let i = 0; i < this.slots.length; i++) {
      const z = this.zones[i]; if (!z) continue;
      if (px >= z.x && py >= z.y && px < z.x + z.w && py < z.y + z.h && (this.slots[i] === 'touch' || this.slots[i] === 'all' || this.anyTouchFree())) return i;
    }
    return -1;
  }
  anyTouchFree() { return true; } // any player may also steer by touch in its own zone
  pads() { return [...(navigator.getGamepads?.() || [])].filter(Boolean); }
  padHeading(p) {
    if (!p) return null;
    const b = (i) => !!p.buttons[i]?.pressed;
    let x = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), y = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    if (x || y) return Math.atan2(y, x);
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.35) return Math.atan2(ay, ax);
    return null;
  }
  keyHeading(maps) {
    let x = 0, y = 0;
    for (const m of maps) for (const [k, v] of Object.entries(KEYS[m])) if (this.keys.has(k)) { x += v[0]; y += v[1]; }
    if (!x && !y) return null;
    return Math.atan2(Math.sign(y), Math.sign(x));
  }
  // pause on Start of any pad (edge)
  pollPause() {
    const st = this.pads().some((p) => p.buttons[9]?.pressed);
    if (st && !this.padStart) this.onPause?.();
    this.padStart = st;
  }
  // heading for a slot; mouseAngle(x, y) is supplied by the game (screen → board heading) for one player
  heading(slot, mouseAngle) {
    const c = this.slots[slot];
    if (c === 'all') {
      const k = this.keyHeading(['wasd', 'frecce']); if (k !== null) return k;
      for (const p of this.pads()) { const h = this.padHeading(p); if (h !== null) return h; }
      if (this.stick[0] !== null) { const h = this.stick[0]; if (![...this.touch.values()].length) this.stick[0] = null; return h; }
      if (this.mouse && mouseAngle) return mouseAngle(this.mouse.x, this.mouse.y);
      return null;
    }
    let h = null;
    if (KEYS[c]) h = this.keyHeading([c]);
    else if (/^pad\d$/.test(c)) h = this.padHeading(this.pads()[+c.slice(3) - 1]);
    if (h === null && this.stick[slot] !== null) { h = this.stick[slot]; if (![...this.touch.values()].some((t) => t.slot === slot)) this.stick[slot] = null; }
    return h;
  }
  sticks() { return [...this.touch.values()]; }
  destroy() {
    window.removeEventListener('keydown', this.onKD, true);
    window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerup', this.onPU);
    window.removeEventListener('pointercancel', this.onPU);
    this.el.removeEventListener('pointerdown', this.onPD);
    this.el.removeEventListener('pointermove', this.onPM);
    this.el.removeEventListener('pointerleave', this.onLeave);
  }
}
