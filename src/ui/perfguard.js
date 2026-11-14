// Frame-time watchdog for the live 3D views. When a view runs below its target frame rate for a few
// seconds in a row, it takes the next quality step down (resolution first, then the costly effects).
// Each step runs once and the view never steps back up during that session. Steps that change nothing
// (e.g. the pixel ratio is already 1) are skipped straight away.
//   const guard = new FrameGuard([{ fps: 40, run: () => ... }, { fps: 30, run: () => ... }]);
//   guard.tick() once per rendered frame
export class FrameGuard {
  constructor(steps, { window = 3, grace = 3 } = {}) {
    this.steps = steps; this.i = 0; this.win = window; this.grace = grace;
    this.dts = []; this.t0 = 0; this.last = 0; this.start = 0; this.log = [];
  }
  reset() { this.dts = []; this.t0 = 0; this.last = 0; }
  tick() {
    if (this.i >= this.steps.length) return;
    const now = performance.now();
    if (!this.start) this.start = now;
    // loading, shader compiles and the first frames are not representative
    if (now - this.start < this.grace * 1000) return;
    // a long gap (tab in the background, a modal, a deliberate pause) restarts the measurement
    if (this.last && now - this.last > 2000) this.reset();
    if (this.last) this.dts.push(now - this.last); else this.t0 = now;
    this.last = now;
    if (now - this.t0 < this.win * 1000 || this.dts.length < 3) return;
    // median frame time: a single hitch (a texture upload, a garbage collection) does not count
    const d = this.dts.sort((a, b) => a - b)[this.dts.length >> 1], fps = 1000 / d;
    this.dts = []; this.t0 = now;
    while (this.i < this.steps.length && fps < this.steps[this.i].fps) {
      const st = this.steps[this.i++];
      let changed = false;
      try { changed = st.run() !== false; } catch (e) { console.warn('quality step', e); }
      if (changed) { this.log.push({ step: this.i - 1, fps: Math.round(fps) }); break; }
    }
  }
}
