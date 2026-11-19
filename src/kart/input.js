// Kart Baso — input for up to 4 local players: two keyboard layouts, gamepads and on-screen touch
// controls (single player on phones and tablets).
//   kb1: W A S D · drift Space / Shift sx · item E / F / Q
//   kb2: frecce · drift Shift dx / Ctrl dx / 0 tastierino / . · item Invio / - / tastierino Invio
//   pad: stick / croce sterza · A o RT gas · B o LT freno · RB o R3 derapata · LB o X oggetto · Start pausa
export const KB = {
  kb1: { left: ['KeyA'], right: ['KeyD'], thr: ['KeyW'], brk: ['KeyS'], drift: ['Space', 'ShiftLeft'], item: ['KeyE', 'KeyF', 'KeyQ'] },
  kb2: { left: ['ArrowLeft'], right: ['ArrowRight'], thr: ['ArrowUp'], brk: ['ArrowDown'], drift: ['ShiftRight', 'ControlRight', 'Numpad0', 'Period'], item: ['Enter', 'NumpadEnter', 'Minus', 'Slash'] },
};
KB.all = Object.fromEntries(Object.keys(KB.kb1).map((k) => [k, [...KB.kb1[k], ...KB.kb2[k], ...(k === 'drift' ? ['KeyX', 'KeyK'] : k === 'item' ? ['KeyZ', 'KeyJ'] : [])]]));
const GAME_KEYS = new Set(Object.values(KB.all).flat());

export function wantsTouch() {
  try { if (/[?&]touch\b/.test(location.search)) return true; return !!(window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && !window.matchMedia?.('(pointer: fine)').matches)); } catch { return false; }
}

export class Inputs {
  // players: [{ kb: 'all'|'kb1'|'kb2'|null, pad: index|null, touch: bool }]
  constructor(players, { onPause } = {}) {
    this.players = players; this.keys = new Set(); this.onPause = onPause;
    this.virt = players.map(() => ({ steer: 0, thr: 0, brk: 0, drift: 0, item: 0, back: 0 })); // test/touch overrides
    this.prevStart = players.map(() => false);
    this.kd = (e) => {
      if (e.repeat && GAME_KEYS.has(e.code)) { e.preventDefault(); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) this.onPause?.(); e.preventDefault(); return; }
      if (GAME_KEYS.has(e.code)) { this.keys.add(e.code); e.preventDefault(); }
    };
    this.ku = (e) => { this.keys.delete(e.code); };
    this.blur = () => this.keys.clear();
    window.addEventListener('keydown', this.kd, true); window.addEventListener('keyup', this.ku, true); window.addEventListener('blur', this.blur);
    this.touch = null;
  }
  any(list) { for (const c of list) if (this.keys.has(c)) return true; return false; }
  pads() { try { return [...(navigator.getGamepads?.() || [])].filter(Boolean); } catch { return []; } }
  read(i, out) {
    const P = this.players[i], v = this.virt[i];
    let steer = 0, thr = 0, brk = 0, drift = 0, item = 0, back = 0, fwdAim = 0;
    const K = P.kb && KB[P.kb];
    if (K) {
      steer += (this.any(K.right) ? 1 : 0) - (this.any(K.left) ? 1 : 0);
      thr = this.any(K.thr) ? 1 : 0; brk = this.any(K.brk) ? 1 : 0; drift = this.any(K.drift) ? 1 : 0; item = this.any(K.item) ? 1 : 0;
      back = brk;
    }
    if (P.pad != null) {
      const gp = this.pads().find((p) => p.index === P.pad) || (P.pad === 0 && this.pads()[0]);
      if (gp) {
        const b = (n) => !!gp.buttons[n]?.pressed, val = (n) => gp.buttons[n]?.value || 0;
        let ax = gp.axes[0] || 0; if (Math.abs(ax) < 0.15) ax = 0;
        const ay = gp.axes[1] || 0;
        steer += ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
        thr = Math.max(thr, b(0) || val(7) > 0.3 ? 1 : 0); brk = Math.max(brk, b(1) || val(6) > 0.3 ? 1 : 0);
        drift = Math.max(drift, b(5) || b(10) ? 1 : 0); item = Math.max(item, b(4) || b(2) ? 1 : 0);
        back = Math.max(back, ay > 0.5 || b(13) ? 1 : 0); fwdAim = ay < -0.5 || b(12) ? 1 : 0;
        const st = b(9);
        if (st && !this.prevStart[i]) this.onPause?.();
        this.prevStart[i] = st;
      }
    }
    if (P.touch && this.touch) { const t = this.touch.s; steer += t.steer; thr = Math.max(thr, t.thr); brk = Math.max(brk, t.brk); drift = Math.max(drift, t.drift); item = Math.max(item, t.item); back = Math.max(back, t.brk); }
    steer += v.steer; thr = Math.max(thr, v.thr); brk = Math.max(brk, v.brk); drift = Math.max(drift, v.drift); item = Math.max(item, v.item); back = Math.max(back, v.back);
    out.steer = Math.max(-1, Math.min(1, steer)); out.thr = thr; out.brk = brk; out.drift = drift; out.item = item; out.back = back; out.fwdAim = fwdAim;
    return out;
  }
  destroy() { window.removeEventListener('keydown', this.kd, true); window.removeEventListener('keyup', this.ku, true); window.removeEventListener('blur', this.blur); this.touch?.destroy(); }
}

// ───────── touch controls: steering pad on the left, DRIFT / OGGETTO / FRENO on the right, auto gas
const CSS = `
.ktt{position:absolute;inset:0;z-index:30;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none}
.ktt-zone{position:absolute;left:0;bottom:0;width:48%;height:62%;pointer-events:auto;touch-action:none}
.ktt-base{position:absolute;left:calc(env(safe-area-inset-left) + 34px);bottom:calc(env(safe-area-inset-bottom) + 30px);width:150px;height:76px;border-radius:40px;border:2px solid rgba(255,255,255,.35);background:rgba(10,12,20,.32);transition:opacity .15s;opacity:.7}
.ktt-base.on{opacity:1}
.ktt-base::before,.ktt-base::after{content:'';position:absolute;top:50%;margin-top:-9px;border:9px solid transparent}
.ktt-base::before{left:10px;border-right-color:rgba(255,255,255,.5)}
.ktt-base::after{right:10px;border-left-color:rgba(255,255,255,.5)}
.ktt-knob{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 3px 12px rgba(0,0,0,.4)}
.ktt-b{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font:italic 900 13px/1 'Barlow Condensed','Exo 2',sans-serif;letter-spacing:.04em;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.4);background:rgba(10,12,20,.35)}
.ktt-b.on{transform:scale(.93);background:rgba(255,255,255,.3)}
.ktt-drift{right:calc(env(safe-area-inset-right) + 24px);bottom:calc(env(safe-area-inset-bottom) + 26px);width:108px;height:108px;background:rgba(255,138,31,.45);font-size:17px}
.ktt-item{right:calc(env(safe-area-inset-right) + 138px);bottom:calc(env(safe-area-inset-bottom) + 70px);width:80px;height:80px;background:rgba(178,139,255,.45)}
.ktt-brk{right:calc(env(safe-area-inset-right) + 40px);bottom:calc(env(safe-area-inset-bottom) + 150px);width:64px;height:64px;background:rgba(229,20,95,.4);font-size:11px}
.ktt-gas{right:calc(env(safe-area-inset-right) + 132px);bottom:calc(env(safe-area-inset-bottom) + 166px);width:56px;height:56px;font-size:10px}
.ktt-gas.auto{background:rgba(47,215,127,.45)}
@media (max-height:460px){.ktt-drift{width:88px;height:88px}.ktt-item{width:66px;height:66px;right:118px;bottom:56px}.ktt-brk{width:54px;height:54px;bottom:120px}.ktt-gas{bottom:128px;right:112px}.ktt-base{width:132px;height:66px}}
`;
export class TouchControls {
  constructor(root, { auto = true, onPause } = {}) {
    this.s = { steer: 0, thr: 0, brk: 0, drift: 0, item: 0 }; this.auto = auto;
    if (!document.getElementById('ktt-css')) { const st = document.createElement('style'); st.id = 'ktt-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.el = document.createElement('div'); el.className = 'ktt';
    el.innerHTML = `<div class="ktt-zone"><div class="ktt-base"><div class="ktt-knob"></div></div></div>
      <div class="ktt-b ktt-drift" data-k="drift">Derapa</div><div class="ktt-b ktt-item" data-k="item">Oggetto</div><div class="ktt-b ktt-brk" data-k="brk">Freno</div><div class="ktt-b ktt-gas ${auto ? 'auto' : ''}" ${auto ? 'aria-hidden="true"' : 'data-k="thr"'}>${auto ? 'Gas auto' : 'Gas'}</div>`;
    root.appendChild(el);
    const zone = el.querySelector('.ktt-zone'), base = el.querySelector('.ktt-base'), knob = el.querySelector('.ktt-knob');
    this.knob = knob; this.base = base;
    let stick = null; const R = 52;
    const move = (e) => { const r = base.getBoundingClientRect(); const cx = r.left + r.width / 2; let dx = e.clientX - cx; dx = Math.max(-R, Math.min(R, dx)); knob.style.transform = `translateX(${dx}px)`; this.s.steer = Math.abs(dx) < 6 ? 0 : dx / R; };
    zone.addEventListener('pointerdown', (e) => { e.preventDefault(); if (stick != null) return; stick = e.pointerId; base.classList.add('on'); try { zone.setPointerCapture?.(e.pointerId); } catch {} move(e); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId !== stick) return; e.preventDefault(); move(e); });
    const end = (e) => { if (e.pointerId !== stick) return; stick = null; this.s.steer = 0; knob.style.transform = ''; base.classList.remove('on'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    for (const b of el.querySelectorAll('[data-k]')) {
      const k = b.dataset.k, ids = new Set();
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); ids.add(e.pointerId); try { b.setPointerCapture?.(e.pointerId); } catch {} this.s[k] = 1; b.classList.add('on'); try { navigator.vibrate?.(8); } catch {} });
      const off = (e) => { ids.delete(e.pointerId); if (!ids.size) { this.s[k] = 0; b.classList.remove('on'); } };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    }
    // auto gas (default, set in the Comandi tab): always on, the brake wins; otherwise hold GAS
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.onPause = onPause;
  }
  update(racing) { if (this.auto) this.s.thr = 1; this.el.style.display = racing ? '' : 'none'; }
  destroy() { this.el.remove(); }
}
