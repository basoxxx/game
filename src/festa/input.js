// Festa Baso — fair input for 2-4 players on one screen: four keyboard zones, up to four controllers and
// touch split into one zone per player (portrait, landscape, or "tablet laid flat" with the far seats
// turned round). Every device ends up as the same { x, y, a, ap } the minigame sims read.
export const DEVICES = [
  { id: 'kb1', name: 'Tastiera WASD', keys: 'W A S D', act: 'Spazio' },
  { id: 'kb2', name: 'Tastiera frecce', keys: '← ↑ → ↓', act: 'Invio' },
  { id: 'kb3', name: 'Tastiera IJKL', keys: 'I J K L', act: 'U / O' },
  { id: 'kb4', name: 'Tastierino', keys: '8 4 5 6', act: '0' },
  { id: 'pad0', name: 'Controller 1', keys: 'Stick', act: 'A' },
  { id: 'pad1', name: 'Controller 2', keys: 'Stick', act: 'A' },
  { id: 'pad2', name: 'Controller 3', keys: 'Stick', act: 'A' },
  { id: 'pad3', name: 'Controller 4', keys: 'Stick', act: 'A' },
  { id: 'touch', name: 'Touch', keys: 'Levetta', act: 'Tasto' },
  { id: 'cpu', name: 'CPU', keys: '', act: '' },
];
export const devById = (id) => DEVICES.find((d) => d.id === id) || DEVICES[DEVICES.length - 1];
const KEYMAP = {
  kb1: { u: ['KeyW'], d: ['KeyS'], l: ['KeyA'], r: ['KeyD'], a: ['Space', 'KeyE', 'ShiftLeft'] },
  kb2: { u: ['ArrowUp'], d: ['ArrowDown'], l: ['ArrowLeft'], r: ['ArrowRight'], a: ['Enter', 'ShiftRight', 'ControlRight'] },
  kb3: { u: ['KeyI'], d: ['KeyK'], l: ['KeyJ'], r: ['KeyL'], a: ['KeyU', 'KeyO'] },
  kb4: { u: ['Numpad8'], d: ['Numpad5', 'Numpad2'], l: ['Numpad4'], r: ['Numpad6'], a: ['Numpad0', 'NumpadEnter'] },
};
const GAME_KEYS = new Set(Object.values(KEYMAP).flatMap((m) => Object.values(m).flat()));
export const isTouchDevice = () => { try { return /[?&]touch\b/.test(location.search) || !!matchMedia('(pointer: coarse)').matches; } catch { return false; } };
// a sensible default device for each seat
export function defaultDevices(n, touch = isTouchDevice()) {
  if (touch) return Array.from({ length: 4 }, (_, i) => (i < n ? 'touch' : 'cpu'));
  const pads = (() => { try { return [...(navigator.getGamepads?.() || [])].filter(Boolean).length; } catch { return 0; } })();
  const list = [...Array.from({ length: pads }, (_, i) => `pad${i}`), 'kb1', 'kb2', 'kb3', 'kb4'];
  return Array.from({ length: 4 }, (_, i) => (i < n ? list[i] : 'cpu'));
}

export class PartyInput {
  // devs: device id per seat ('cpu' seats are ignored here)
  constructor(devs, { onPause, onAny } = {}) {
    this.devs = devs.slice(); this.keys = new Set(); this.onPause = onPause; this.onAny = onAny;
    this.prevA = devs.map(() => false); this.prevStart = devs.map(() => false);
    this.virt = devs.map(() => ({ x: 0, y: 0, a: false })); // touch zones and tests write here
    this.kd = (e) => {
      if (!e.isTrusted || e.target?.closest?.('input, textarea, select')) return; // the menu pad bridge sends synthetic keys
      if ((e.code === 'Escape' || e.code === 'KeyP') && e.isTrusted) { if (!e.repeat) this.onPause?.(); e.preventDefault(); e.stopPropagation(); return; }
      if (GAME_KEYS.has(e.code)) { this.keys.add(e.code); e.preventDefault(); e.stopPropagation(); }
    };
    this.ku = (e) => this.keys.delete(e.code);
    this.blur = () => this.keys.clear();
    window.addEventListener('keydown', this.kd, true); window.addEventListener('keyup', this.ku, true); window.addEventListener('blur', this.blur);
  }
  any(l) { for (const c of l) if (this.keys.has(c)) return true; return false; }
  pads() { try { return [...(navigator.getGamepads?.() || [])].filter(Boolean); } catch { return []; } }
  read(i, out) {
    const dev = this.devs[i]; let x = 0, y = 0, a = false;
    const K = KEYMAP[dev];
    if (K) { x = (this.any(K.r) ? 1 : 0) - (this.any(K.l) ? 1 : 0); y = (this.any(K.d) ? 1 : 0) - (this.any(K.u) ? 1 : 0); a = this.any(K.a); }
    else if (dev?.startsWith('pad')) {
      const n = +dev.slice(3), gp = this.pads().find((p) => p.index === n) || this.pads()[n];
      if (gp) {
        const b = (k) => !!gp.buttons[k]?.pressed;
        let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0; if (Math.hypot(ax, ay) < 0.2) ax = ay = 0;
        x = ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0); y = ay + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
        a = b(0) || b(2) || (gp.buttons[7]?.value || 0) > 0.4;
        const st = b(9); if (st && !this.prevStart[i]) this.onPause?.(); this.prevStart[i] = st;
      }
    }
    const v = this.virt[i]; if (v) { x += v.x; y += v.y; a = a || v.a; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    out.x = x; out.y = y; out.a = a; out.ap = a && !this.prevA[i]; this.prevA[i] = a;
    if (out.ap) this.onAny?.(i);
    return out;
  }
  destroy() { window.removeEventListener('keydown', this.kd, true); window.removeEventListener('keyup', this.ku, true); window.removeEventListener('blur', this.blur); }
}

// ───────── touch zones: one rectangle per touch player, a floating stick on its left part and a big
// action button on its right. flat = tablet laid on the table: the far seats are turned 180°.
export class TouchZones {
  constructor(root, seats, input, { flat = false } = {}) {
    // seats: [{ i, color, label }] only the touch players
    this.root = root; this.seats = seats; this.input = input; this.flat = flat;
    const el = this.el = document.createElement('div'); el.className = `fz-touch n${seats.length}${flat ? ' flat' : ''}`;
    el.innerHTML = seats.map((s, k) => `<div class="fz-zone" data-k="${k}" style="--c:${s.color}"><div class="fz-zin"><div class="fz-stick"><i></i></div><div class="fz-abtn">${s.act || 'A'}</div><b class="fz-zlab">${s.label}</b></div></div>`).join('');
    root.appendChild(el);
    this.ptr = new Map();
    this.zones = [...el.querySelectorAll('.fz-zone')];
    this.layout();
    const down = (e) => {
      const z = e.target.closest('.fz-zone'); if (!z) return;
      e.preventDefault();
      const k = +z.dataset.k, r = z.getBoundingClientRect(), rot = z.classList.contains('rot') ;
      const lx = rot ? r.right - e.clientX : e.clientX - r.left, ly = rot ? r.bottom - e.clientY : e.clientY - r.top;
      const isA = lx > r.width * 0.55;
      this.ptr.set(e.pointerId, { k, isA, ox: e.clientX, oy: e.clientY, rot });
      try { z.setPointerCapture(e.pointerId); } catch {}
      this.apply();
      if (!isA) { const st = z.querySelector('.fz-stick'); st.style.left = `${lx}px`; st.style.top = `${ly}px`; st.classList.add('on'); }
      else z.querySelector('.fz-abtn').classList.add('on');
    };
    const move = (e) => { const p = this.ptr.get(e.pointerId); if (!p || p.isA) return; p.cx = e.clientX; p.cy = e.clientY; this.apply(); };
    const up = (e) => { const p = this.ptr.get(e.pointerId); if (!p) return; this.ptr.delete(e.pointerId); this.apply(); const z = this.zones[p.k]; if (p.isA) z.querySelector('.fz-abtn').classList.remove('on'); else z.querySelector('.fz-stick').classList.remove('on'); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    this.onResize = () => this.layout(); window.addEventListener('resize', this.onResize);
  }
  layout() {
    const n = this.seats.length, port = innerHeight > innerWidth;
    this.el.classList.toggle('port', port);
    this.zones.forEach((z, k) => {
      // flat: seats on the far side of the table (top row) read the screen upside down
      z.classList.toggle('rot', this.flat && n >= 2 && k < Math.ceil(n / 2) && !(n === 3 && k === 1 && false));
    });
  }
  apply() {
    const st = this.seats.map(() => ({ x: 0, y: 0, a: false }));
    for (const p of this.ptr.values()) {
      const s = st[p.k];
      if (p.isA) s.a = true;
      else if (p.cx != null) { let dx = (p.cx - p.ox) / 46, dy = (p.cy - p.oy) / 46; if (p.rot) { dx = -dx; dy = -dy; } const m = Math.hypot(dx, dy); s.x = m > 1 ? dx / m : dx; s.y = m > 1 ? dy / m : dy; }
    }
    this.seats.forEach((seat, k) => {
      Object.assign(this.input.virt[seat.i], st[k]);
      const kn = this.zones[k].querySelector('.fz-stick i'); kn.style.transform = `translate(${p(st[k].x)}px, ${p(st[k].y)}px)`;
    });
    function p(v) { return v * 30; }
  }
  destroy() { window.removeEventListener('resize', this.onResize); this.el.remove(); for (const s of this.seats) Object.assign(this.input.virt[s.i], { x: 0, y: 0, a: false }); }
}
