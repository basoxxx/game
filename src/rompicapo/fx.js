// Rompicapo — shared juice: a particle canvas over the play area (bursts, confetti, sparks), floating
// score text, screen shake, plus small input helpers (swipe detection, gamepad polling for the games).
const still = () => document.documentElement.classList.contains('reduce-motion');

export class Fx {
  constructor(host) {
    this.host = host; this.parts = []; this.raf = 0;
    this.c = document.createElement('canvas'); this.c.className = 'rp-fx'; this.c.setAttribute('aria-hidden', 'true');
    host.appendChild(this.c); this.g = this.c.getContext('2d');
    this.ro = new ResizeObserver(() => this.size()); this.ro.observe(host); this.size();
    this.loop = this.loop.bind(this);
  }
  size() { const r = this.host.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); this.dpr = d; this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d); }
  // x, y in client coordinates
  local(x, y) { const r = this.host.getBoundingClientRect(); return [x - r.left, y - r.top]; }
  burst(x, y, color = '#fff', n = 14, o = {}) {
    if (still()) n = Math.ceil(n / 3);
    const [lx, ly] = this.local(x, y);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (o.speed || 220) * (0.4 + Math.random() * 0.8);
      this.parts.push({ x: lx, y: ly, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 60), life: 0, max: 0.45 + Math.random() * 0.4, r: (o.size || 4) * (0.6 + Math.random() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color, g: o.g ?? 520, kind: o.kind || 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
    this.kick();
  }
  confetti(n = 120, colors = ['#ff4d6d', '#ffd23f', '#3fdc6e', '#4cc3ff', '#b35cff', '#ff9b2e']) {
    if (still()) n = 24;
    const r = this.host.getBoundingClientRect();
    for (let i = 0; i < n; i++) this.parts.push({ x: Math.random() * r.width, y: -20 - Math.random() * r.height * 0.4, vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 160, life: 0, max: 2.4 + Math.random() * 1.6, r: 4 + Math.random() * 4, color: colors[i % colors.length], g: 60, kind: 'paper', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    this.kick();
  }
  // a horizontal sweep of sparks along a rect (line clears, completed rows)
  sweep(rect, color = '#fff', n = 26) {
    if (still()) n = 8;
    for (let i = 0; i < n; i++) { const x = rect.left + Math.random() * rect.width, y = rect.top + Math.random() * rect.height; this.burst(x, y, color, 1, { speed: 160, up: 120, size: 3 }); }
  }
  kick() { if (!this.raf) { this.t0 = performance.now(); this.raf = requestAnimationFrame(this.loop); } }
  loop(now) {
    const dt = Math.min(0.05, (now - this.t0) / 1000); this.t0 = now;
    const g = this.g, d = this.dpr; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height); g.setTransform(d, 0, 0, d, 0, 0);
    this.parts = this.parts.filter((p) => (p.life += dt) < p.max);
    for (const p of this.parts) {
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.kind === 'paper') p.vx *= 0.99;
      const a = 1 - p.life / p.max; g.globalAlpha = Math.min(1, a * 1.6); g.fillStyle = p.color;
      if (p.kind === 'paper') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9 * Math.abs(Math.cos(p.rot * 1.7))); g.restore(); }
      else if (p.kind === 'star') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? p.r * 0.45 : p.r * a + 1; g.lineTo(Math.cos(k * Math.PI / 5) * rr, Math.sin(k * Math.PI / 5) * rr); } g.fill(); g.restore(); }
      else { g.beginPath(); g.arc(p.x, p.y, Math.max(0.5, p.r * a), 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    this.raf = this.parts.length ? requestAnimationFrame(this.loop) : 0;
    if (!this.raf) g.clearRect(0, 0, this.c.width, this.c.height);
  }
  float(x, y, text, cls = '') {
    const [lx, ly] = this.local(x, y), el = document.createElement('div');
    el.className = `rp-float ${cls}`; el.textContent = text; el.style.left = `${lx}px`; el.style.top = `${ly}px`;
    this.host.appendChild(el); setTimeout(() => el.remove(), 1100);
  }
  shake(el, strength = 1) {
    if (still() || !el) return;
    el.style.setProperty('--shk', `${3 + strength * 4}px`); el.classList.remove('rp-shake'); void el.offsetWidth; el.classList.add('rp-shake');
    setTimeout(() => el.classList.remove('rp-shake'), 400);
  }
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro.disconnect(); this.c.remove(); this.parts = []; }
}

// Swipe detection on an element: onSwipe(dir) with dir in left/right/up/down; taps go to onTap
export function swipe(el, { onSwipe, onTap, min = 24 } = {}) {
  let s = null;
  const down = (e) => { if (e.button > 0) return; s = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; };
  const up = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y, ad = Math.max(Math.abs(dx), Math.abs(dy)); const st = s; s = null;
    if (ad < min) { onTap?.(e, st); return; }
    onSwipe?.(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), e);
  };
  const cancel = () => { s = null; };
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
}

// Gamepad for the games (the menu bridge in src/ui/gamepad.js steps aside while the play root has
// .dz-root and a canvas). onButton(name, down) for a, b, x, y, lb, rb, start, sel, up, down, left, right.
export function padPoll(onButton) {
  const prev = {}; let id = 0;
  const step = () => {
    const gp = (navigator.getGamepads?.() || []).find(Boolean);
    if (gp) {
      const b = (i) => !!gp.buttons[i]?.pressed, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const st = { a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), lt: b(6), rt: b(7), sel: b(8), start: b(9), up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6 };
      for (const k of Object.keys(st)) { if (st[k] !== !!prev[k]) { prev[k] = st[k]; onButton(k, st[k]); } }
    }
    id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}
export const rm = still;
