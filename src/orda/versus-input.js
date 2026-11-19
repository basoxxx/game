// Orda · 2 giocatori — input for two people on one device.
//   Keyboard: P1 uses W A S D, P2 the arrows. Keys follow the screen: the two keys along the
//             cannon's rail move it, the key pointing at the opponent fires (hold), the key pointing
//             back calls the champion. With P1 at the bottom that is A/D move · W fire · S champion
//             and ←/→ · ↑ · ↓ for P2 at the top; with P1 left / P2 right (landscape) it is W/S move ·
//             D fire · A champion and ↑/↓ · ← · →. Space (P1) and Invio / Shift destro (P2) also fire
//             and E (P1) / 0 del tastierino (P2) also call the champion. Esc / P pauses.
//   Gamepads: the first pad drives P1, the second P2 (with one pad and the keyboard, the pad is P2
//             so the keyboard keeps P1). Stick / d-pad move, A or RT fires, X / Y / RB champion,
//             Start pauses.
//   Touch:    the screen is split in two control zones (bottom/top in portrait, left/right in
//             landscape). In your zone: press = fire, drag along your rail = move the cannon.
//             Every finger is tracked by pointerId, so both players can play at the same time on
//             iPads and phones (and a second finger in the same zone is ignored, not stolen).
// The game asks each frame: state(i) → { move (-1..1 continuous), drag (rail units this frame),
// fire, champ (edge), any }. Screen geometry (zones and rail directions) is supplied by the game
// through setLayout(), so the input module knows nothing about cameras.

// direction keys as screen vectors (x right, y down) + fixed extra keys
const DIRS = [
  { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] },
  { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] },
];
const FIRE = [['Space'], ['Enter', 'NumpadEnter', 'ShiftRight']];
const CHAMP = [['KeyE'], ['Numpad0', 'Insert']];
const LABEL = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const ALL = new Set([...DIRS.flatMap((d) => Object.keys(d)), ...FIRE.flat(), ...CHAMP.flat()]);

export class VersusInput {
  constructor(el, { onPause, players = 2 } = {}) {
    this.el = el; this.onPause = onPause; this.n = players;
    this.keys = new Set(); this.edge = new Set();
    this.touch = [null, null]; // per player: { id, x, y, lx, ly, acc }
    this.pad = [{}, {}];
    this.layout = { split: 'h', rail: [{ x: 1, y: 0 }, { x: 1, y: 0 }], fwd: [{ x: 0, y: -1 }, { x: 0, y: 1 }], px: 40, swap: false };
    this.mirror = false; // P2 rail inverted for hot-seat on a flat tablet
    this.onKD = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.onPause?.(); return; }
      if (!ALL.has(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      if (!this.keys.has(e.code)) this.edge.add(e.code);
      this.keys.add(e.code);
    };
    this.onKU = (e) => { this.keys.delete(e.code); };
    this.onBlur = () => { this.keys.clear(); this.touch = [null, null]; };
    window.addEventListener('keydown', this.onKD, true);
    window.addEventListener('keyup', this.onKU, true);
    window.addEventListener('blur', this.onBlur);
    // pointer: one finger per player, chosen by the zone where it lands
    this.onPD = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest?.('button, .ovs-champ, [data-a]')) return; // HUD buttons handle themselves
      const p = this.zoneOf(e.clientX, e.clientY);
      if (p < 0 || p >= this.n || this.touch[p]) return;
      e.preventDefault();
      this.touch[p] = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, acc: 0, t0: performance.now() };
      try { this.el.setPointerCapture?.(e.pointerId); } catch {}
      this.onTouch?.(p, this.touch[p]);
    };
    this.onPM = (e) => {
      for (let p = 0; p < 2; p++) {
        const T = this.touch[p]; if (!T || T.id !== e.pointerId) continue;
        e.preventDefault();
        const r = this.rail(p), dx = e.clientX - T.lx, dy = e.clientY - T.ly;
        T.acc += (dx * r.x + dy * r.y) / Math.max(8, this.layout.px);
        T.lx = e.clientX; T.ly = e.clientY; T.x = e.clientX; T.y = e.clientY;
        this.onTouch?.(p, T);
      }
    };
    this.onPU = (e) => { for (let p = 0; p < 2; p++) if (this.touch[p]?.id === e.pointerId) { this.touch[p] = null; this.onTouch?.(p, null); } };
    el.addEventListener('pointerdown', this.onPD);
    el.addEventListener('pointermove', this.onPM);
    window.addEventListener('pointerup', this.onPU);
    window.addEventListener('pointercancel', this.onPU);
    el.addEventListener('lostpointercapture', this.onPU);
    this.noMenu = (e) => e.preventDefault();
    el.addEventListener('contextmenu', this.noMenu);
  }
  // layout: { split: 'h' (P1 bottom / P2 top) | 'v' (P1 left / P2 right), rail: [{x,y},{x,y}] screen
  // unit vectors of each cannon's +lateral direction, fwd: screen unit vectors toward the opponent,
  // px: screen pixels per rail unit }
  setLayout(L) { Object.assign(this.layout, L); }
  rail(p) { return this.layout.rail[p] || { x: 1, y: 0 }; }
  fwd(p) { return this.layout.fwd?.[p] || { x: 0, y: p ? 1 : -1 }; }
  // what each direction key does for player p right now: 'move-' | 'move+' | 'fire' | 'champ'
  keyRole(p, code) {
    const d = DIRS[p][code]; if (!d) return null;
    const r = this.rail(p), f = this.fwd(p), dr = d[0] * r.x + d[1] * r.y, df = d[0] * f.x + d[1] * f.y;
    if (Math.abs(dr) >= Math.abs(df)) return dr < 0 ? 'move-' : 'move+';
    return df > 0 ? 'fire' : 'champ';
  }
  // labels for the help line: { left, right, fire, champ }
  describe(p) {
    const out = {};
    for (const code of Object.keys(DIRS[p])) { const role = this.keyRole(p, code); out[{ 'move-': 'left', 'move+': 'right', fire: 'fire', champ: 'champ' }[role]] = LABEL[code]; }
    return out;
  }
  zoneOf(x, y) {
    if (this.n < 2) return 0;
    const r = this.el.getBoundingClientRect();
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    const p = this.layout.split === 'v' ? (fx < 0.5 ? 0 : 1) : (fy >= 0.5 ? 0 : 1);
    return this.layout.swap ? 1 - p : p;
  }
  padsFor() {
    const pads = [...(navigator.getGamepads?.() || [])].filter((g) => g && g.connected !== false);
    if (pads.length >= 2) return [pads[0], pads[1]];
    if (pads.length === 1) return this.n < 2 ? [pads[0], null] : [null, pads[0]];
    return [null, null];
  }
  // called once per simulated frame
  poll() {
    const pads = this.padsFor();
    for (let p = 0; p < 2; p++) {
      const g = pads[p], P = this.pad[p], b = (i) => !!(g?.buttons[i]?.pressed || (g?.buttons[i]?.value || 0) > 0.5);
      // stick and d-pad in screen terms, projected on the rail
      const sx = g ? (Math.abs(g.axes[0] || 0) > 0.2 ? g.axes[0] : 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0) : 0;
      const sy = g ? (Math.abs(g.axes[1] || 0) > 0.2 ? g.axes[1] : 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0) : 0;
      const r = this.rail(p), ax = sx * r.x + sy * r.y;
      const champ = b(2) || b(3) || b(5), start = b(9);
      P.move = Math.max(-1, Math.min(1, ax)); P.fire = b(0) || b(7) || b(1);
      P.champE = champ && !P.champ; P.champ = champ;
      if (start && !P.start) this.onPause?.();
      P.start = start; P.any = !!g && (P.fire || champ || Math.abs(ax) > 0);
    }
  }
  state(p) {
    const has = (a) => a.some((c) => this.keys.has(c)), ed = (a) => a.some((c) => this.edge.has(c));
    const T = this.touch[p], P = this.pad[p] || {};
    let move = 0, kfire = false, kchamp = false;
    for (const code of Object.keys(DIRS[p])) {
      const down = this.keys.has(code); if (!down) continue;
      const role = this.keyRole(p, code);
      if (role === 'move-') move -= 1; else if (role === 'move+') move += 1;
      else if (role === 'fire') kfire = true;
      else if (role === 'champ' && this.edge.has(code)) kchamp = true;
    }
    if (!move && P.move) move = P.move;
    const drag = T ? T.acc : 0; if (T) T.acc = 0;
    const fire = kfire || has(FIRE[p]) || !!P.fire || !!T;
    const champ = kchamp || ed(CHAMP[p]) || !!P.champE;
    return { move, drag, fire, champ, any: !!(move || drag || fire || champ) };
  }
  endFrame() { this.edge.clear(); }
  clear() { this.keys.clear(); this.edge.clear(); this.touch = [null, null]; }
  destroy() {
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('blur', this.onBlur);
    this.el.removeEventListener('pointerdown', this.onPD); this.el.removeEventListener('pointermove', this.onPM);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    this.el.removeEventListener('lostpointercapture', this.onPU); this.el.removeEventListener('contextmenu', this.noMenu);
  }
}
