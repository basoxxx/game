// Touch controls for "Scontro Totale" on phones and tablets: a floating analog stick on the left
// half of the screen (steering), pedals on the right (gas, brake/reverse), nitro and handbrake
// buttons above them, and small reset / camera / pause buttons at the top. Multi-touch through
// pointer events (one pointer per control). Shown only on coarse-pointer devices, or with
// ?touch in the URL for testing. DerbyGame.readInput() merges touch.state() with keys and pads.
const CSS = `
.dzt{position:absolute;inset:0;z-index:30;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;font-family:'Exo 2',sans-serif}
.dzt-zone{position:absolute;left:0;top:18%;bottom:0;width:46%;pointer-events:auto;touch-action:none}
.dzt-base{position:absolute;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;border:2px solid rgba(255,255,255,.28);background:radial-gradient(circle,rgba(0,0,0,.18),rgba(0,0,0,.32));opacity:.55;transition:opacity .15s;left:110px;bottom:40px;top:auto}
.dzt-base.on{opacity:1}
.dzt-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(255,255,255,.78);box-shadow:0 2px 10px rgba(0,0,0,.45)}
.dzt-b{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-style:italic;letter-spacing:.02em;text-shadow:0 1px 3px rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.35);background:rgba(20,20,24,.42);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-size:13px}
.dzt-b.on{background:rgba(255,255,255,.34);transform:scale(.95)}
.dzt-gas{right:22px;bottom:26px;width:104px;height:104px;background:rgba(40,170,80,.45);font-size:16px}
.dzt-brk{right:136px;bottom:18px;width:78px;height:78px;background:rgba(200,40,40,.42)}
.dzt-nit{right:30px;bottom:146px;width:76px;height:76px;background:rgba(40,120,255,.45)}
.dzt-hb{right:122px;bottom:112px;width:62px;height:62px;font-size:11px}
.dzt-s{position:absolute;top:10px;pointer-events:auto;touch-action:none;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;background:rgba(20,20,24,.5);border:1px solid rgba(255,255,255,.25)}
.dzt-pause{left:50%;margin-left:-22px}
.dzt-cam{left:50%;margin-left:30px}
.dzt-rst{left:50%;margin-left:-74px}
@media (max-height:480px){.dzt-gas{width:88px;height:88px}.dzt-brk{width:66px;height:66px;right:118px}.dzt-nit{width:64px;height:64px;bottom:124px}.dzt-hb{width:54px;height:54px;right:104px;bottom:96px}.dzt-base{width:112px;height:112px;margin:-56px 0 0 -56px}}
`;

export function wantsTouch() {
  try { if (/[?&]touch\b/.test(location.search)) return true; return !!(window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && !window.matchMedia?.('(pointer: fine)').matches); } catch { return false; }
}

export class TouchControls {
  constructor(game, root) {
    this.g = game; this.s = { thr: 0, brk: 0, st: 0, hb: 0, nitro: 0 }; this.active = false;
    if (!document.getElementById('dzt-css')) { const st = document.createElement('style'); st.id = 'dzt-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.el = document.createElement('div'); el.className = 'dzt';
    el.innerHTML = `<div class="dzt-zone"><div class="dzt-base"><div class="dzt-knob"></div></div></div>
      <div class="dzt-b dzt-gas" data-k="thr">GAS</div><div class="dzt-b dzt-brk" data-k="brk">FRENO</div>
      <div class="dzt-b dzt-nit" data-k="nitro">NITRO</div><div class="dzt-b dzt-hb" data-k="hb">MANO</div>
      <div class="dzt-s dzt-rst" data-c="reset" title="Riposiziona">&#8634;</div><div class="dzt-s dzt-pause" data-c="pause" title="Pausa">&#10074;&#10074;</div><div class="dzt-s dzt-cam" data-c="cam" title="Camera">&#9673;</div>`;
    root.appendChild(el);
    const zone = el.querySelector('.dzt-zone'), base = el.querySelector('.dzt-base'), knob = el.querySelector('.dzt-knob');
    this.base = base; this.knob = knob; this.stick = null;
    const R = 54;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (this.stick) return; this.active = true;
      const zr = zone.getBoundingClientRect(); const x = e.clientX - zr.left, y = e.clientY - zr.top;
      this.stick = { id: e.pointerId, x, y }; Object.assign(base.style, { left: x + 'px', top: y + 'px', bottom: 'auto' }); base.classList.add('on');
      zone.setPointerCapture?.(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      const S = this.stick; if (!S || S.id !== e.pointerId) return; e.preventDefault();
      const zr = zone.getBoundingClientRect(); let dx = e.clientX - zr.left - S.x; const dy = e.clientY - zr.top - S.y;
      const m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
      knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      dx = Math.max(-1, Math.min(1, dx / R)); this.s.st = -dx; // left = positive steering in the game
    });
    const endStick = (e) => { const S = this.stick; if (!S || S.id !== e.pointerId) return; this.stick = null; this.s.st = 0; knob.style.transform = ''; base.classList.remove('on'); Object.assign(base.style, { left: '', top: '', bottom: '' }); };
    zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick); zone.addEventListener('lostpointercapture', endStick);
    for (const b of el.querySelectorAll('.dzt-b')) {
      const k = b.dataset.k, ids = new Set();
      const on = (e) => { e.preventDefault(); this.active = true; ids.add(e.pointerId); b.setPointerCapture?.(e.pointerId); this.s[k] = 1; b.classList.add('on'); try { navigator.vibrate?.(8); } catch {} };
      const off = (e) => { ids.delete(e.pointerId); if (!ids.size) { this.s[k] = 0; b.classList.remove('on'); } };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    }
    for (const b of el.querySelectorAll('.dzt-s')) b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); const c = b.dataset.c, g = this.g;
      if (c === 'pause' && (g.state === 'race' || g.state === 'paused' || g.state === 'countdown')) g.togglePause();
      else if (c === 'cam') g.cycleCam();
      else if (c === 'reset' && g.state === 'race' && g.player.hp > 0) g.requestRespawn(g.player, 'player');
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // hidden while the results, replay, podium or pause overlays are up
  update() { const st = this.g.state, vis = (st === 'race' || st === 'countdown') && !this.g.spectate; if (vis !== this._vis) { this._vis = vis; this.el.style.display = vis ? '' : 'none'; if (!vis) { for (const k in this.s) this.s[k] = 0; this.stick = null; this.knob.style.transform = ''; } } }
  state() { return this.s; }
  destroy() { this.el.remove(); }
}
