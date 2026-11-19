// Rompicapo — the common frame of a live puzzle: HUD (pause, title, chips), stage, side panel, a
// message bar, the particle layer and the landscape/portrait switch (by the frame's own aspect, so
// it also follows split windows and tablets).
import { Fx } from './fx.js';
import { themeVars } from './meta.js';

export class Shell {
  constructor(root, { game, title, sub = '', theme = 'notte', onPause }) {
    this.root = root; this.onPause = onPause; this.paused = false; this.ended = false;
    root.innerHTML = `<div class="rp-play rp-g-${game}" style="${themeVars(theme)}">
      <header class="rp-hud"><button class="rp-pbtn" type="button" aria-label="Pausa" data-tip="Pausa (Esc)"><i></i><i></i></button>
        <div class="rp-ttl"><b>${title}</b><small>${sub}</small></div><div class="rp-chips"></div></header>
      <main class="rp-stage"><div class="rp-bwrap"></div></main>
      <aside class="rp-side"></aside>
      <div class="rp-msg" role="status" aria-live="polite"></div>
    </div>`;
    this.el = root.firstElementChild;
    this.hud = this.el.querySelector('.rp-hud'); this.chips = this.el.querySelector('.rp-chips');
    this.stage = this.el.querySelector('.rp-stage'); this.wrap = this.el.querySelector('.rp-bwrap'); this.side = this.el.querySelector('.rp-side'); this.msgEl = this.el.querySelector('.rp-msg');
    this.el.querySelector('.rp-pbtn').addEventListener('click', () => this.pause(true));
    this.fx = new Fx(this.el);
    root.classList.add('dz-root');
    this.ro = new ResizeObserver(() => { const r = this.el.getBoundingClientRect(); const land = r.width > r.height * 1.12; this.el.classList.toggle('land', land); this.el.classList.toggle('port', !land); this.el.classList.toggle('wide', r.width >= 1000); this.onResize?.(); });
    this.ro.observe(this.el);
    this.onVis = () => { if (document.hidden && !this.paused && !this.ended) this.pause(true); };
    document.addEventListener('visibilitychange', this.onVis);
  }
  chip(id, label, value, cls = '') {
    let c = this.chips.querySelector(`[data-c="${id}"]`);
    if (!c) { c = document.createElement('div'); c.className = `rp-chip ${cls}`; c.dataset.c = id; c.innerHTML = `<span></span><b></b>`; this.chips.appendChild(c); }
    c.firstChild.textContent = label;
    if (c.lastChild.textContent !== String(value)) { c.lastChild.textContent = value; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    return c;
  }
  msg(text, kind = '', ms = 2600) {
    const m = this.msgEl; m.textContent = text; m.className = `rp-msg on ${kind}`;
    clearTimeout(this.mt); if (ms) this.mt = setTimeout(() => { m.className = 'rp-msg'; }, ms);
  }
  pause(on) {
    if (this.ended || on === this.paused) return;
    this.paused = on; this.root.classList.toggle('dz-root', !on); this.el.classList.toggle('paused', on);
    this.onPause?.(on);
  }
  end() { this.ended = true; this.root.classList.remove('dz-root'); this.el.classList.add('ended'); }
  destroy() { this.ro.disconnect(); this.fx.destroy(); document.removeEventListener('visibilitychange', this.onVis); clearTimeout(this.mt); this.root.classList.remove('dz-root'); this.root.innerHTML = ''; }
}
// a tiny clock that only runs while playing (pause / hidden / ended stop it)
export class Clock {
  constructor(sec = 0) { this.acc = sec * 1000; this.t0 = 0; this.on = false; }
  start() { if (!this.on) { this.on = true; this.t0 = performance.now(); } }
  stop() { if (this.on) { this.acc += performance.now() - this.t0; this.on = false; } }
  get ms() { return this.acc + (this.on ? performance.now() - this.t0 : 0); }
  get sec() { return this.ms / 1000; }
}
